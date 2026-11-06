// Shared by the journeys in this folder: oc-forge's dev OpenChamber (container oc-forge-openchamber-dev), signed in,
// with the extension's panel open in a headless window, and the frames to look into.
//
// `temp: true` installs this checkout's build as a temporary extension (its own id, name and data folder, so the
// Cloak Browser dev runs and its profile are untouched) and removes it in close(); otherwise the installed Cloak
// Browser (the folder dev mounts at /extensions/cloak-browser) is used as it is. Prints no secrets.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const CONTAINER = 'oc-forge-openchamber-dev';
export const INSTALLED = { id: 'oc-forge-cloak-browser', name: 'Cloak Browser', folder: '/extensions/cloak-browser', data: null };
export const TEMP = { id: 'oc-forge-cloak-html', name: 'Cloak Browser HTML', folder: '/home/node/cloak-html-test', data: '/home/node/.local/share/oc-forge-cloak-html-test' };

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const t0 = Date.now();
export const log = (...a) => console.log(`${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(6)}s`, ...a);
/** A shell command in the container (`kill` is the shell's: the image has no kill program). */
export const inContainer = (command) => execFileSync('docker', ['exec', CONTAINER, 'sh', '-c', command], { encoding: 'utf8' }).trim();

export const devBase = () => {
  const published = execFileSync('docker', ['port', CONTAINER, '3000/tcp'], { encoding: 'utf8' }).trim().split('\n')[0];
  const at = published.lastIndexOf(':');
  const host = published.slice(0, at);
  return `http://${host === '0.0.0.0' || host === '[::]' ? '127.0.0.1' : host}:${published.slice(at + 1)}`;
};

/** This checkout's build, renamed, copied into the container. */
const placeTemp = (out) => {
  const pkg = join(out, 'pkg');
  rmSync(pkg, { recursive: true, force: true });
  for (const file of ['panel/index.html', 'panel/main.js', 'panel/frame.js', 'service/main.js']) {
    mkdirSync(join(pkg, file, '..'), { recursive: true });
    cpSync(join(ROOT, file), join(pkg, file));
  }
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  manifest.name = '@oc-forge/openchamber-cloak-html-test';
  manifest.openchamber.contributes.panel.id = TEMP.id;
  manifest.openchamber.contributes.panel.name = TEMP.name;
  delete manifest.devDependencies;
  delete manifest.scripts;
  writeFileSync(join(pkg, 'package.json'), JSON.stringify(manifest, null, 2));
  const service = readFileSync(join(pkg, 'service/main.js'), 'utf8');
  const moved = service.replace('".local/share"), "oc-forge-cloak-browser")', '".local/share"), "oc-forge-cloak-html-test")');
  if (moved === service) throw new Error('could not move the temporary copy\'s data folder');
  writeFileSync(join(pkg, 'service/main.js'), moved);
  execFileSync('sh', ['-c', `tar -C ${pkg} -cf - . | docker exec -i ${CONTAINER} sh -c 'rm -rf ${TEMP.folder} && mkdir -p ${TEMP.folder} && tar -C ${TEMP.folder} -xf -'`]);
};

export async function openPanel({ temp = false, out = '/tmp/opencode/cloak-browser-e2e', viewport = { width: 1440, height: 900 }, scale = 2, page: pageUrl = '/' } = {}) {
  mkdirSync(out, { recursive: true });
  const which = temp ? TEMP : INSTALLED;
  const base = devBase();
  // Never printed.
  const password = /^OPENCHAMBER_UI_PASSWORD=(.+)$/m.exec(readFileSync(join(homedir(), '.local/share/oc-forge-openchamber-dev/secrets.env'), 'utf8'))?.[1]?.trim();
  if (!password) throw new Error('no UI password in secrets.env');
  if (temp) placeTemp(out);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
  const wire = { requests: 0, bytes: 0, events: 0, eventBytes: 0, resources: 0, resourceBytes: 0, inputs: 0 };
  const problems = { csp: 0, other: [], pageErrors: [] };
  const close = async () => {
    if (temp && !process.env.KEEP) {
      await context.request.delete(`${base}/api/guests/${which.id}`).catch(() => null);
      try {
        inContainer(`rm -rf ${TEMP.folder} ${TEMP.data}`);
      } catch {
        // gone already
      }
    }
    await browser.close();
  };
  try {
    if ((await context.request.post(`${base}/auth/session`, { data: { password } })).status() !== 200) throw new Error('login failed');
    const catalog = async () => {
      const body = await (await context.request.get(`${base}/api/guests`)).json();
      return (Array.isArray(body) ? body : body.guests ?? []).find((guest) => guest.id === which.id) ?? null;
    };
    let row = await catalog();
    if (!row || temp) {
      const res = await context.request.post(`${base}/api/guests`, { data: { path: which.folder } });
      if (res.status() !== 201 && res.status() !== 200) throw new Error(`install: ${res.status()} ${(await res.text()).slice(0, 200)}`);
      row = await catalog();
    }
    const requested = row?.capabilities?.requested ?? [];
    if (!requested.every((capability) => (row?.capabilities?.granted ?? []).includes(capability))) {
      const res = await context.request.put(`${base}/api/guests/${which.id}/capabilities`, { data: { granted: requested } });
      if (!res.ok()) throw new Error(`approve: ${res.status()}`);
    }
    const page = await context.newPage();
    page.on('pageerror', (error) => problems.pageErrors.push(String(error).slice(0, 200)));
    page.on('console', (message) => {
      const text = message.text();
      if (/Refused to load|Content Security Policy/.test(text)) problems.csp += 1;
      else if (message.type() === 'error' || message.type() === 'warning') problems.other.push(`${message.type()}: ${text.slice(0, 200)}`);
    });
    page.on('requestfinished', async (request) => {
      if (!request.url().includes(`/api/guests/${which.id}/service/request`)) return;
      const sizes = await request.sizes().catch(() => null);
      if (!sizes) return;
      const body = request.postData() ?? '';
      wire.requests += 1;
      wire.bytes += sizes.responseBodySize;
      if (body.includes('/mirror/events')) { wire.events += 1; wire.eventBytes += sizes.responseBodySize; }
      if (body.includes('/mirror/resources')) { wire.resources += 1; wire.resourceBytes += sizes.responseBodySize; }
      if (body.includes('/mirror/input')) wire.inputs += 1;
    });
    await page.goto(`${base}${pageUrl}`);
    const rail = page.locator(`button[data-context-surface="plugin:${which.id}"]`).first();
    await rail.waitFor({ timeout: 30_000 });
    for (let attempt = 0; attempt < 3 && (await rail.getAttribute('aria-pressed')) !== 'true'; attempt += 1) {
      await rail.click();
      await page.waitForTimeout(1500);
    }
    const panelElement = page.locator(`iframe[title="${which.name}"]`).first();
    await panelElement.waitFor({ timeout: 20_000 });
    const panel = page.frameLocator(`iframe[title="${which.name}"]`).first();
    const mirrorFrame = () => page.frames().find((frame) => frame.url() === 'about:srcdoc' && frame.parentFrame()?.parentFrame());
    const panelFrame = () => mirrorFrame()?.parentFrame() ?? null;
    /** Polls `check(mirror frame)` until it is truthy: the ms it took, or -1. */
    const waitMirror = async (check, timeoutMs = 30_000) => {
      const started = Date.now();
      for (;;) {
        const frame = mirrorFrame();
        const found = frame ? await check(frame).catch(() => false) : false;
        if (found) return Date.now() - started;
        if (Date.now() - started > timeoutMs) return -1;
        await sleep(100);
      }
    };
    const shoot = (path) => panelElement.screenshot({ path }).catch(() => {});
    const address = panel.locator('.toolbar input').first();
    const go = async (url) => {
      await address.click();
      await address.fill(url);
      await address.press('Enter');
    };
    /** A request to the service, as the panel makes it (through OpenChamber). */
    const service = async (method, path, body) => {
      const res = await context.request.post(`${base}/api/guests/${which.id}/service/request`, { data: { method, path, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) } });
      const answer = await res.json();
      try {
        return JSON.parse(answer.body);
      } catch {
        return answer;
      }
    };
    return { which, base, browser, context, page, rail, panel, panelElement, mirrorFrame, panelFrame, waitMirror, shoot, address, go, service, wire, problems, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** A page served inside the dev container, where the browser runs: its URL and a stop function. */
export function serveInContainer(name, html, port = 39123) {
  const dir = '/tmp/cloak-html-site';
  execFileSync('docker', ['exec', '-i', CONTAINER, 'sh', '-c', `mkdir -p ${dir} && cat > ${dir}/${name}.html`], { input: html });
  const server = `const http=require('http'),fs=require('fs');http.createServer((q,s)=>{const f='${dir}'+(q.url.split('?')[0].replace(/[^a-z0-9/_-]/gi,'')||'/index')+'.html';fs.readFile(f,(e,b)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':'text/html; charset=utf-8'});s.end(b)})}).listen(${port},'127.0.0.1')`;
  execFileSync('docker', ['exec', '-d', CONTAINER, 'sh', '-c', `echo $$ > ${dir}/server-${port}.pid; exec node -e "${server.replace(/"/g, '\\"')}"`]);
  return {
    url: `http://127.0.0.1:${port}/${name}`,
    stop: () => {
      try {
        inContainer(`kill $(cat ${dir}/server-${port}.pid) 2>/dev/null; rm -f ${dir}/server-${port}.pid ${dir}/${name}.html`);
      } catch {
        // gone already
      }
    },
  };
}

/** Checks, printed as they go: `results()` answers [passed, total]. */
export const checker = () => {
  const results = [];
  return {
    check(name, ok, detail = '') {
      results.push({ name, ok: Boolean(ok) });
      log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${String(detail).replace(/\s+/g, ' ').slice(0, 160)}` : ''}`);
    },
    results: () => [results.filter((result) => result.ok).length, results.length],
  };
};
