// End to end: the built service (service/main.js) under Node, as OpenChamber runs it, driving a real Chromium
// against pages served here. Pages that need a position report it in their title, which the strip's /state shows,
// so the tests use only what OpenChamber and the strip use.
//
// The browser: CLOAK_TEST_CHROME, else CLOAKBROWSER_BINARY_PATH, else Playwright's newest Chromium, else a system
// Chrome or Chromium (GitHub's Ubuntu runners have Google Chrome).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync } from 'node:fs';
import http from 'node:http';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const TOKEN = 'test-token';
const NO_KEYS = { alt: false, ctrl: false, meta: false, shift: false };

const findChrome = (): string => {
  const given = process.env.CLOAK_TEST_CHROME ?? process.env.CLOAKBROWSER_BINARY_PATH;
  if (given) return given;
  const playwright = join(homedir(), '.cache/ms-playwright');
  if (existsSync(playwright)) {
    const builds = readdirSync(playwright).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const build of builds) {
      const chrome = join(playwright, build, 'chrome-linux64/chrome');
      if (existsSync(chrome)) return chrome;
    }
  }
  for (const chrome of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(chrome)) return chrome;
  }
  throw new Error('No Chromium to test with: set CLOAK_TEST_CHROME.');
};
const CHROME = findChrome();

const freePort = (): Promise<number> => new Promise((done, fail) => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => (address && typeof address === 'object' ? done(address.port) : fail(new Error('no port'))));
  });
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitFor = async <T>(what: string, read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 20_000): Promise<T> => {
  const end = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < end) {
    try {
      last = await read();
      if (done(last)) return last;
    } catch {
      // not yet
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}; last: ${JSON.stringify(last)?.slice(0, 300)}`);
};

// Pages. Each reports what a test needs in its title.
const PAGES: Record<string, string> = {
  '/': '<title>start</title><p>start</p>',
  '/a': '<title>page a</title><p>a</p>',
  '/b': '<title>page b</title><p>b</p>',
  '/form': `<title>ready</title><input id="f" style="position:absolute;left:20px;top:20px;width:300px;height:30px;font:16px sans-serif">
    <script>document.getElementById('f').addEventListener('input', (e) => { document.title = 'value:' + e.target.value; });</script>`,
  '/words': `<p style="position:absolute;left:20px;top:20px;margin:0;font:32px/40px monospace">alpha <span id="w">beta</span> gamma</p>
    <script>const r = document.getElementById('w').getBoundingClientRect(); document.title = JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });</script>`,
  '/scroll': `<title>scroll:0</title><div style="height:5000px">tall</div>
    <script>addEventListener('scroll', () => { document.title = 'scroll:' + Math.round(scrollY); });</script>`,
  '/popup': '<title>popup</title><a href="/b" target="_blank" style="position:absolute;left:20px;top:20px;font:20px/24px sans-serif">open</a>',
  '/ratio': '<script>document.title = "ratio:" + devicePixelRatio;</script>',
};

let pages: http.Server;
let site = '';

beforeAll(async () => {
  pages = http.createServer((req, res) => {
    const body = PAGES[new URL(req.url ?? '/', 'http://x').pathname];
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body ? `<!doctype html><meta charset="utf-8">${body}` : 'not found');
  });
  await new Promise<void>((done) => pages.listen(0, '127.0.0.1', () => done()));
  const address = pages.address();
  site = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;
});

afterAll(() => {
  pages?.close();
});

type Service = { child: ChildProcess; base: string; dataDir: string; stderr: () => string };

const startService = async (dataDir: string): Promise<Service> => {
  const port = await freePort();
  let stderr = '';
  const child = spawn('node', [join(ROOT, 'service/main.js')], {
    env: {
      ...process.env,
      OPENCHAMBER_SERVICE_PORT: String(port),
      OPENCHAMBER_SERVICE_TOKEN: TOKEN,
      CLOAKBROWSER_BINARY_PATH: CHROME,
      OC_CLOAK_DATA_DIR: dataDir,
      OC_CLOAK_CACHE_DIR: join(dataDir, 'cache'),
      OC_CLOAK_START_URL: `${site}/`,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr?.on('data', (chunk) => { stderr += chunk; });
  const service = { child, base: `http://127.0.0.1:${port}`, dataDir, stderr: () => stderr };
  await waitFor('the service to listen', () => fetch(`${service.base}/health`, { headers: { authorization: `Bearer ${TOKEN}` } }), (res) => res.ok, 15_000);
  return service;
};

const api = (service: Service, method: string, path: string, body?: unknown) => fetch(`${service.base}${path}`, {
  method,
  headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

type State = { phase: string; url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; error: string | null };
const state = async (service: Service): Promise<State> => (await api(service, 'GET', '/state')).json() as Promise<State>;

const frame = async (service: Service, after: number, wait: number) => {
  const res = await api(service, 'GET', `/surface/frame?after=${after}&wait=${wait}`);
  const bytes = res.status === 200 ? new Uint8Array(await res.arrayBuffer()) : null;
  return {
    status: res.status,
    seq: Number(res.headers.get('x-surface-seq')),
    width: Number(res.headers.get('x-surface-width')),
    height: Number(res.headers.get('x-surface-height')),
    title: res.headers.get('x-surface-title') ?? '',
    mime: res.headers.get('content-type') ?? '',
    bytes,
  };
};

const chromePid = (dataDir: string): number => {
  const owner = readlinkSync(join(dataDir, 'profile/SingletonLock'));
  return Number(owner.slice(owner.lastIndexOf('-') + 1));
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const stopService = async (service: Service, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> => {
  if (service.child.exitCode !== null || service.child.signalCode !== null) return;
  const exited = new Promise<void>((done) => service.child.once('exit', () => done()));
  service.child.kill(signal);
  await Promise.race([exited, sleep(10_000)]);
};

describe('one browser, driven the way OpenChamber drives it', () => {
  let service: Service;
  let dataDir: string;
  // The panel: 1200×800 device pixels at a pixel ratio of 2, so the page is 600×400 CSS pixels.
  const DPR = 2;
  const toFrame = (x: number, y: number) => ({ x: x * DPR, y: y * DPR });

  const go = async (path: string, title?: string) => {
    expect(await (await api(service, 'POST', '/navigate', { url: `${site}${path}` })).json()).toEqual({ ok: true });
    return waitFor(`${path} to load`, () => state(service), (now) => now.url === `${site}${path}` && !now.loading && (title === undefined || now.title === title));
  };

  const click = async (x: number, y: number, count = 1) => {
    const at = toFrame(x, y);
    const events = [];
    for (let n = 0; n < count; n += 1) {
      events.push({ type: 'pointer', action: 'down', ...at, button: 0, buttons: 1, modifiers: NO_KEYS });
      events.push({ type: 'pointer', action: 'up', ...at, button: 0, buttons: 0, modifiers: NO_KEYS });
    }
    expect((await api(service, 'POST', '/surface/input', { events })).status).toBe(204);
  };

  const key = (keyName: string, code: string, keyCode: number, modifiers = NO_KEYS) => [
    { type: 'key', action: 'down', key: keyName, code, keyCode, modifiers },
    { type: 'key', action: 'up', key: keyName, code, keyCode, modifiers },
  ];

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'cloak-test-'));
    service = await startService(dataDir);
  });

  afterAll(async () => {
    if (service) await stopService(service);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('starts on the start page and streams it at the panel\'s size and pixel ratio', async () => {
    await api(service, 'POST', '/viewer', { dpr: DPR, mac: false });
    expect(await (await api(service, 'POST', '/surface/resize', { width: 1200, height: 800 })).json()).toEqual({ width: 1200, height: 800 });
    const now = await waitFor('the browser to run on the start page', () => state(service), (s) => s.phase === 'running' && s.url === `${site}/` && s.title === 'start', 60_000);
    expect(now.error).toBeNull();
    const shown = await waitFor('a frame of the page at 1200×800', () => frame(service, 0, 0), (f) => f.mime === 'image/jpeg' && f.width === 1200 && f.height === 800 && f.title === 'start');
    expect(shown.bytes?.[0]).toBe(0xff);
  }, 90_000);

  test('the address field takes a URL or a bare host and port', async () => {
    const port = new URL(site).port;
    expect(await (await api(service, 'POST', '/navigate', { url: `127.0.0.1:${port}/a` })).json()).toEqual({ ok: true });
    await waitFor('the bare host to open over http', () => state(service), (s) => s.url === `${site}/a` && s.title === 'page a');
    expect((await api(service, 'POST', '/navigate', { url: '   ' })).status).toBe(400);
  }, 30_000);

  test('back, forward and reload follow the tab\'s history', async () => {
    await go('/a', 'page a');
    await go('/b', 'page b');
    await api(service, 'POST', '/history', { direction: 'back' });
    const back = await waitFor('back to /a, with /b ahead', () => state(service), (s) => s.url === `${site}/a` && !s.loading && s.canGoForward);
    expect(back.canGoBack).toBe(true);
    await api(service, 'POST', '/history', { direction: 'forward' });
    await waitFor('forward to /b', () => state(service), (s) => s.url === `${site}/b` && !s.loading);
    expect(await (await api(service, 'POST', '/reload')).json()).toEqual({ ok: true });
    await waitFor('/b after the reload', () => state(service), (s) => s.url === `${site}/b` && s.title === 'page b' && !s.loading);
  }, 30_000);

  test('a click and typing reach the page; text arrives as typed, Chinese included', async () => {
    await go('/form', 'ready');
    await click(170, 35);
    const events = [...key('h', 'KeyH', 72), ...key('i', 'KeyI', 73), { type: 'text', text: '你好' }];
    expect((await api(service, 'POST', '/surface/input', { events })).status).toBe(204);
    await waitFor('the field to hold what was typed', () => state(service), (s) => s.title === 'value:hi你好');
  }, 30_000);

  test('on a Mac, Command is Control on the page: select all, then copy hands the field\'s text to the host', async () => {
    await api(service, 'POST', '/viewer', { dpr: DPR, mac: true });
    const command = { ...NO_KEYS, meta: true };
    const events = [...key('a', 'KeyA', 65, command), ...key('c', 'KeyC', 67, command)];
    expect((await api(service, 'POST', '/surface/input', { events })).status).toBe(204);
    expect(await (await api(service, 'GET', '/surface/clipboard')).json()).toEqual({ text: 'hi你好' });
    await api(service, 'POST', '/viewer', { dpr: DPR, mac: false });
  }, 30_000);

  test('a double click selects a word, and copy hands it over', async () => {
    const page = await go('/words');
    const word = JSON.parse(page.title) as { x: number; y: number };
    await click(word.x, word.y, 2);
    expect(await (await api(service, 'GET', '/surface/clipboard')).json()).toEqual({ text: 'beta' });
  }, 30_000);

  test('the wheel scrolls the page', async () => {
    await go('/scroll', 'scroll:0');
    const at = toFrame(300, 200);
    const events = [{ type: 'wheel', ...at, deltaX: 0, deltaY: 600, modifiers: NO_KEYS }];
    expect((await api(service, 'POST', '/surface/input', { events })).status).toBe(204);
    await waitFor('the page to scroll', () => state(service), (s) => /^scroll:[1-9]/.test(s.title));
  }, 30_000);

  test('a link that opens a new tab shows that tab', async () => {
    await go('/popup', 'popup');
    await click(40, 32);
    await waitFor('the new tab to be the one shown', () => state(service), (s) => s.url === `${site}/b` && s.title === 'page b');
  }, 30_000);

  test('a still page sends no new picture; a change wakes the request that waits for one', async () => {
    await go('/a', 'page a');
    await sleep(500);
    const now = await frame(service, 0, 0);
    const idle = await frame(service, now.seq, 1500);
    expect(idle.status).toBe(204);
    const waiting = frame(service, now.seq, 15_000);
    await sleep(200);
    await api(service, 'POST', '/navigate', { url: `${site}/b` });
    const next = await waiting;
    expect(next.status).toBe(200);
    expect(next.seq).toBeGreaterThan(now.seq);
  }, 30_000);

  // A headless screencast ignores an emulated scale factor: before the ratio became a launch flag, every page after
  // the first navigation came in CSS-sized (600×400 here), blurred on the window it is shown in.
  test('pages after a navigation are still drawn at the window\'s pixel ratio', async () => {
    await go('/ratio', 'ratio:2');
    await waitFor('a 1200×800 frame of the page', () => frame(service, 0, 0), (f) => f.width === 1200 && f.height === 800 && f.title === 'ratio:2');
  }, 30_000);

  test('a window with another pixel ratio restarts the browser on the address it showed', async () => {
    const before = chromePid(dataDir);
    await api(service, 'POST', '/viewer', { dpr: 1, mac: false });
    await waitFor('a new browser on /ratio, drawing at 1×', () => state(service), (s) => s.phase === 'running' && s.url === `${site}/ratio` && s.title === 'ratio:1', 60_000);
    expect(chromePid(dataDir)).not.toBe(before);
  }, 90_000);
});

describe('the browser process', () => {
  test('SIGTERM stops the browser with the service', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'cloak-test-'));
    try {
      const service = await startService(dataDir);
      await waitFor('the browser to run', () => state(service), (s) => s.phase === 'running', 60_000);
      const pid = chromePid(dataDir);
      expect(alive(pid)).toBe(true);
      await stopService(service, 'SIGTERM');
      await waitFor('the browser to exit', async () => alive(pid), (running) => !running, 10_000);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 90_000);

  test('a browser left by a killed service is stopped when the next one starts; the profile keeps its fingerprint', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'cloak-test-'));
    const services: Service[] = [];
    try {
      const first = await startService(dataDir);
      services.push(first);
      await waitFor('the first browser to run', () => state(first), (s) => s.phase === 'running', 60_000);
      const seed = readFileSync(join(dataDir, 'fingerprint-seed'), 'utf8');
      const leftover = chromePid(dataDir);
      await stopService(first, 'SIGKILL');
      expect(alive(leftover)).toBe(true);
      const second = await startService(dataDir);
      services.push(second);
      await waitFor('the second browser to run', () => state(second), (s) => s.phase === 'running', 60_000);
      expect(alive(leftover)).toBe(false);
      expect(chromePid(dataDir)).not.toBe(leftover);
      expect(readFileSync(join(dataDir, 'fingerprint-seed'), 'utf8')).toBe(seed);
    } finally {
      for (const service of services) await stopService(service);
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
