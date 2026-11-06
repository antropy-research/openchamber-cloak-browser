// Where the browser binary comes from.
//
// 1. CLOAKBROWSER_BINARY_PATH, the CloakBrowser wrapper's own override: a Chromium already on this machine (the
//    tests point it at a stock Chromium).
// 2. Otherwise CloakBrowser's free build from its GitHub releases, pinned below. The release's SHA256SUMS must carry
//    a valid Ed25519 signature from the key the CloakBrowser wrapper pins, and the archive must match its line there;
//    then it is unpacked into the cache, once. The wrapper itself (npm `cloakbrowser` 0.7) only downloads with a
//    license key; a free key and the newest build can come later.
import { spawn } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const FREE_BUILD = { tag: 'chromium-v146.0.7680.177.5', version: '146.0.7680.177.5' } as const;
const RELEASES = 'https://github.com/CloakHQ/CloakBrowser/releases/download';
/** BINARY_SIGNING_PUBKEYS in the cloakbrowser wrapper's config.js (MIT): raw Ed25519 public keys, base64. */
const SIGNING_KEYS = ['MKFKwIhUcKWq5xTuNA0Ovg99njcDEcEJvmWYYhApvaU='];
const ARCHIVES: Record<string, string> = {
  'linux-x64': 'cloakbrowser-linux-x64.tar.gz',
  'linux-arm64': 'cloakbrowser-linux-arm64.tar.gz',
};

export type BinaryProgress = { step: 'downloading' | 'verifying' | 'unpacking'; received: number; total: number };
export type Binary = { path: string; version: string; source: 'override' | 'free-build' };

const fetchBytes = async (url: string): Promise<Buffer> => {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const checkSignature = (manifest: Buffer, signatureFile: Buffer): void => {
  const text = signatureFile.toString('utf8').trim();
  const signature = Buffer.from(text, 'base64');
  if (signature.toString('base64') !== text) throw new Error('SHA256SUMS.sig is not valid base64');
  for (const raw of SIGNING_KEYS) {
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(raw, 'base64').toString('base64url') }, format: 'jwk' });
    if (verify(null, manifest, key, signature)) return;
  }
  throw new Error('SHA256SUMS is not signed by CloakBrowser\'s key');
};

const expectedHash = (manifest: Buffer, archive: string): string => {
  for (const line of manifest.toString('utf8').split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim());
    if (match && match[2] === archive) return match[1];
  }
  throw new Error(`SHA256SUMS has no line for ${archive}`);
};

const download = async (url: string, file: string, onProgress: (received: number, total: number) => void): Promise<string> => {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`${url} answered ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  const hash = createHash('sha256');
  const out = createWriteStream(file);
  let received = 0;
  let reported = 0;
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk)) await new Promise<void>((resolve) => out.once('drain', () => resolve()));
      if (received - reported > 1 << 20) {
        reported = received;
        onProgress(received, total);
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
  }
  onProgress(received, total);
  return hash.digest('hex');
};

const untar = (archive: string, into: string): Promise<void> => new Promise((resolve, reject) => {
  const tar = spawn('tar', ['-xzf', archive, '-C', into], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  tar.stderr.on('data', (chunk) => { stderr += chunk; });
  tar.on('error', reject);
  tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}: ${stderr.trim().slice(0, 300)}`))));
});

/** The binary to run; downloads and unpacks the free build the first time. */
export const resolveBinary = async (cacheDir: string, onProgress: (progress: BinaryProgress) => void): Promise<Binary> => {
  const override = process.env.CLOAKBROWSER_BINARY_PATH;
  if (override) {
    if (!existsSync(override)) throw new Error(`CLOAKBROWSER_BINARY_PATH is ${override}, and there is no file there.`);
    return { path: override, version: 'local', source: 'override' };
  }
  const platform = `${process.platform}-${process.arch}`;
  const archive = ARCHIVES[platform];
  if (!archive) throw new Error(`CloakBrowser has no free build for ${platform}.`);
  const dir = join(cacheDir, `chromium-${FREE_BUILD.version}`);
  const binary: Binary = { path: join(dir, 'chrome'), version: FREE_BUILD.version, source: 'free-build' };
  if (existsSync(join(dir, '.complete')) && existsSync(binary.path)) return binary;

  await mkdir(cacheDir, { recursive: true });
  const work = `${dir}.part`;
  await rm(work, { recursive: true, force: true });
  await mkdir(join(work, 'unpacked'), { recursive: true });
  try {
    onProgress({ step: 'verifying', received: 0, total: 0 });
    const [manifest, signature] = await Promise.all([
      fetchBytes(`${RELEASES}/${FREE_BUILD.tag}/SHA256SUMS`),
      fetchBytes(`${RELEASES}/${FREE_BUILD.tag}/SHA256SUMS.sig`),
    ]);
    checkSignature(manifest, signature);
    const want = expectedHash(manifest, archive);
    const file = join(work, archive);
    const got = await download(`${RELEASES}/${FREE_BUILD.tag}/${archive}`, file, (received, total) => onProgress({ step: 'downloading', received, total }));
    if (got !== want) throw new Error(`${archive} does not match its signed checksum.`);
    onProgress({ step: 'unpacking', received: 0, total: 0 });
    await untar(file, join(work, 'unpacked'));
    await rm(file, { force: true });
    if (!existsSync(join(work, 'unpacked', 'chrome'))) throw new Error(`${archive} has no chrome binary.`);
    await writeFile(join(work, 'unpacked', '.complete'), `${FREE_BUILD.tag}\n${want}\n`);
    await rm(dir, { recursive: true, force: true });
    await rename(join(work, 'unpacked'), dir);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return binary;
};

/** The fingerprint seed of a profile: chosen once, so the profile shows the same machine every launch. */
export const profileSeed = async (file: string): Promise<number> => {
  try {
    const seed = Number((await readFile(file, 'utf8')).trim());
    if (Number.isInteger(seed) && seed >= 10_000 && seed <= 99_999) return seed;
  } catch {
    // none yet
  }
  const seed = 10_000 + Math.floor(Math.random() * 90_000);
  await writeFile(file, `${seed}\n`);
  return seed;
};
