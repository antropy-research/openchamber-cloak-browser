// End to end: the built service (service/main.js) under Node, as OpenChamber runs it, driving a real Chromium
// against pages served here. Pages that need a position report it in their title, which the strip's /state shows,
// so the tests use only what OpenChamber and the strip use.
//
// The browser: CLOAK_TEST_CHROME, else CLOAKBROWSER_BINARY_PATH, else Playwright's newest Chromium, else a system
// Chrome or Chromium (GitHub's Ubuntu runners have Google Chrome).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import http from 'node:http';
import { createServer } from 'node:net';
import { homedir, hostname, tmpdir } from 'node:os';
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
    <script>const r = document.getElementById('w').getBoundingClientRect(); document.title = JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, at: location.search });</script>`,
  '/scroll': `<title>scroll:0</title><div style="height:5000px">tall</div>
    <script>addEventListener('scroll', () => { document.title = 'scroll:' + Math.round(scrollY); });</script>`,
  '/popup': `<title>popup</title><a href="/b" target="_blank" style="position:absolute;left:20px;top:20px;font:20px/24px sans-serif">open</a>
    <button style="position:absolute;left:20px;top:80px;width:120px;height:30px" onclick="window.open('/b')">window.open</button>`,
  '/ratio': '<script>document.title = "ratio:" + devicePixelRatio;</script>',
  '/alert': `<title>alert page</title><button id="b" style="position:absolute;left:20px;top:20px;width:120px;height:30px" onclick="alert('hello'); document.title = 'after-alert'">alert</button>`,
  '/prompt': `<title>prompt page</title><button id="b" style="position:absolute;left:20px;top:20px;width:120px;height:30px" onclick="document.title = 'name:' + prompt('Name?', 'x')">prompt</button>`,
  // What the agent's actions act on. The button reports whether its click was a real one.
  '/agent': `<title>agent page</title>
    <h1>Agent page</h1>
    <input id="f" aria-label="Name" style="width:200px">
    <button id="save" style="color: rgb(255, 0, 0)" onclick="document.title = 'trusted:' + event.isTrusted">Save</button>
    <select id="s" aria-label="Pick" onchange="document.title = 'picked:' + this.value"><option value="a">Alpha</option><option value="b">Beta</option></select>
    <button id="pop" onclick="alert('from the agent'); document.title = 'agent-alert-done'">Alert</button>
    <p id="seen"></p>
    <div style="height:4000px"></div><p id="end">The end</p>
    <script>setInterval(() => { const seen = document.getElementById('seen'); const now = 'visibility:' + document.visibilityState; if (seen.textContent !== now) seen.textContent = now; }, 50);</script>
    <script>document.getElementById('f').addEventListener('input', (e) => { document.title = 'value:' + e.target.value; });</script>`,
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
  child.stderr?.on('data', (chunk) => {
    stderr += chunk;
    // CLOAK_TEST_STDERR=1 shows what the service says as it says it (debugging a hang).
    if (process.env.CLOAK_TEST_STDERR) process.stderr.write(`[service ${port}] ${chunk}`);
  });
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

describe('tabs, dialogs, and the agent\'s browser', () => {
  let service: Service;
  let dataDir: string;
  const DPR = 1;

  type Full = State & { tabs: Array<{ id: string; title: string; url: string; shown: boolean; agent: boolean }>; dialog: { type: string; message: string } | null };
  const full = async (): Promise<Full> => (await api(service, 'GET', '/state')).json() as Promise<Full>;
  const go = async (path: string, title?: string) => {
    expect(await (await api(service, 'POST', '/navigate', { url: `${site}${path}` })).json()).toEqual({ ok: true });
    return waitFor(`${path} to load`, () => full(), (now) => now.url === `${site}${path}` && !now.loading && (title === undefined || now.title === title));
  };
  const click = async (x: number, y: number, modifiers = NO_KEYS) => {
    const events = [
      { type: 'pointer', action: 'down', x: x * DPR, y: y * DPR, button: 0, buttons: 1, modifiers },
      { type: 'pointer', action: 'up', x: x * DPR, y: y * DPR, button: 0, buttons: 0, modifiers },
    ];
    expect((await api(service, 'POST', '/surface/input', { events })).status).toBe(204);
  };
  let requests = 0;
  /** One action, as OpenChamber posts it for the agent's `openchamber_web` tool. */
  const act = async (action: string, parameters: Record<string, unknown> = {}, sessionId: string | null = 'ses_agent') => {
    requests += 1;
    const res = await api(service, 'POST', '/browser-control', { requestId: `browser-${requests}`, action, parameters, context: { directory: '/tmp', sessionId } });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ ok: true; data: Record<string, any> } | { ok: false; error: string }>;
  };
  const ok = async (action: string, parameters: Record<string, unknown> = {}, sessionId: string | null = 'ses_agent') => {
    const answer = await act(action, parameters, sessionId);
    if (!answer.ok) throw new Error(`${action}: ${answer.error}`);
    return answer.data;
  };

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'cloak-test-'));
    service = await startService(dataDir);
    await api(service, 'POST', '/viewer', { dpr: DPR, mac: false });
    await api(service, 'POST', '/surface/resize', { width: 900, height: 700 });
    await waitFor('the browser to run', () => full(), (s) => s.phase === 'running' && s.url === `${site}/`, 60_000);
  });

  afterAll(async () => {
    if (service) await stopService(service);
    rmSync(dataDir, { recursive: true, force: true });
  });

  // AGENTS.md: Command-click opens a new tab and does not take over the view.
  /** The link's tab opened and loaded; a tab that comes to the front does so once it is set up, so wait that long. */
  const openedBehind = async (count: number) => {
    await waitFor('the link\'s tab, loaded', () => full(), (s) => s.tabs.length === count && s.tabs.filter((tab) => tab.url === `${site}/b` && tab.title === 'page b').length === count - 1);
    await sleep(1000);
    const now = await full();
    expect(now.url).toBe(`${site}/popup`);
    expect(now.tabs.filter((tab) => tab.shown).map((tab) => tab.url)).toEqual([`${site}/popup`]);
    return now;
  };

  test('a click with Control opens the link in a tab behind; the picture stays', async () => {
    await go('/popup', 'popup');
    await click(40, 32, { ...NO_KEYS, ctrl: true });
    await openedBehind(2);
  }, 30_000);

  test('so do Command on a Mac, the middle button, and a page\'s own window.open under Control', async () => {
    await api(service, 'POST', '/viewer', { dpr: DPR, mac: true });
    await click(40, 32, { ...NO_KEYS, meta: true });
    await openedBehind(3);
    await api(service, 'POST', '/viewer', { dpr: DPR, mac: false });
    const middle = [
      { type: 'pointer', action: 'down', x: 40, y: 32, button: 1, buttons: 4, modifiers: NO_KEYS },
      { type: 'pointer', action: 'up', x: 40, y: 32, button: 1, buttons: 0, modifiers: NO_KEYS },
    ];
    expect((await api(service, 'POST', '/surface/input', { events: middle })).status).toBe(204);
    await openedBehind(4);
    // A tab the page opens itself has the page as its opener (a link under Control has none): it would come to the
    // front, as a plain click's does, unless the service marks the click as one for a tab behind.
    await click(80, 95, { ...NO_KEYS, ctrl: true });
    const now = await openedBehind(5);
    // Back to one tab behind, for the scenarios after this one.
    for (const tab of now.tabs.filter((each) => each.url === `${site}/b`).slice(1)) await api(service, 'POST', '/tabs', { action: 'close', id: tab.id });
    await waitFor('two tabs again', () => full(), (s) => s.tabs.length === 2);
  }, 30_000);

  test('the strip\'s tabs: a new one in front, another shown, one closed', async () => {
    const before = await full();
    expect(await (await api(service, 'POST', '/tabs', { action: 'new' })).json()).toEqual({ ok: true });
    const opened = await waitFor('a new empty tab in front', () => full(), (s) => s.tabs.length === before.tabs.length + 1 && s.url === 'about:blank');
    const behind = opened.tabs.find((tab) => tab.url === `${site}/b`);
    expect(await (await api(service, 'POST', '/tabs', { action: 'show', id: behind?.id })).json()).toEqual({ ok: true });
    await waitFor('the tab behind shown', () => full(), (s) => s.url === `${site}/b` && s.title === 'page b');
    const empty = opened.tabs.find((tab) => tab.url === 'about:blank');
    expect(await (await api(service, 'POST', '/tabs', { action: 'close', id: empty?.id })).json()).toEqual({ ok: true });
    const after = await waitFor('the empty tab gone', () => full(), (s) => s.tabs.length === before.tabs.length);
    expect(after.url).toBe(`${site}/b`);
  }, 30_000);

  test('closing the shown tab shows another', async () => {
    const before = await full();
    const shown = before.tabs.find((tab) => tab.shown);
    await api(service, 'POST', '/tabs', { action: 'close', id: shown?.id });
    const after = await waitFor('another tab shown', () => full(), (s) => s.tabs.length === before.tabs.length - 1 && s.tabs.some((tab) => tab.shown));
    expect(after.tabs.some((tab) => tab.id === shown?.id)).toBe(false);
  }, 30_000);

  test('an alert in the shown tab waits for the strip; OK answers it', async () => {
    await go('/alert', 'alert page');
    await click(80, 35);
    const waiting = await waitFor('the alert in the state', () => full(), (s) => s.dialog?.type === 'alert');
    expect(waiting.dialog?.message).toBe('hello');
    expect(await (await api(service, 'POST', '/dialog', { accept: true })).json()).toEqual({ ok: true });
    await waitFor('the page past its alert', () => full(), (s) => s.title === 'after-alert' && s.dialog === null);
  }, 30_000);

  test('a prompt answered from the strip gives the page the text', async () => {
    await go('/prompt', 'prompt page');
    await click(80, 35);
    await waitFor('the prompt in the state', () => full(), (s) => s.dialog?.type === 'prompt');
    await api(service, 'POST', '/dialog', { accept: true, text: 'Cloak' });
    await waitFor('the answer in the page', () => full(), (s) => s.title === 'name:Cloak');
  }, 30_000);

  let agentTab = '';
  test('browser.open opens the page in a tab behind and answers its id; the user\'s page stays', async () => {
    const before = await full();
    const data = await ok('browser.open', { url: `${site}/agent` });
    expect(data).toMatchObject({ url: `${site}/agent`, title: 'agent page', opened: true, settled: true, viewport: { mode: 'fill', width: null, height: null } });
    agentTab = data.tabId;
    const after = await full();
    expect(after.url).toBe(before.url);
    expect(after.tabs.find((tab) => tab.id === agentTab)).toMatchObject({ shown: false, agent: true });
  }, 60_000);

  test('browser.snapshot: the page\'s text, fields and tabs; without tabId, the chat\'s own tab', async () => {
    const data = await ok('browser.snapshot');
    expect(data.url).toBe(`${site}/agent`);
    expect(data.text).toContain('Agent page');
    expect(data.elements.find((element: { selector: string }) => element.selector === '#f')).toMatchObject({ tag: 'input', label: 'Name' });
    expect(data.elements.find((element: { selector: string }) => element.selector === '#s').options.map((option: { label: string }) => option.label)).toEqual(['Alpha', 'Beta']);
    expect(data.tabs.find((tab: { id: string }) => tab.id === agentTab)).toMatchObject({ active: false });
    expect(data.tabs.filter((tab: { active: boolean }) => tab.active)).toHaveLength(1);
  }, 30_000);

  test('browser.type and browser.click are real input: the page sees trusted events', async () => {
    expect(await ok('browser.type', { selector: '#f', value: 'hello', submit: false })).toMatchObject({ selector: '#f', url: `${site}/agent` });
    expect((await ok('browser.snapshot', { tabId: agentTab })).title).toBe('value:hello');
    expect(await ok('browser.click', { text: 'Save' })).toMatchObject({ clicked: '#save', label: 'Save' });
    expect((await ok('browser.snapshot', { tabId: agentTab })).title).toBe('trusted:true');
  }, 30_000);

  test('browser.select picks an option by its label; browser.inspect reads computed styles', async () => {
    expect(await ok('browser.select', { selector: '#s', label: 'Beta' })).toMatchObject({ selector: '#s', label: 'Beta', value: 'b' });
    expect((await ok('browser.snapshot')).title).toBe('picked:b');
    expect((await act('browser.select', { selector: '#s', label: 'Gamma' })).ok).toBe(false);
    const inspected = await ok('browser.inspect', { selector: '#save' });
    expect(inspected.styles.color).toBe('rgb(255, 0, 0)');
  }, 30_000);

  test('browser.scroll moves the chat\'s tab and says where it is', async () => {
    const down = await ok('browser.scroll', { direction: 'down' });
    expect(down.scrollY).toBeGreaterThan(0);
    const bottom = await ok('browser.scroll', { direction: 'bottom' });
    expect(bottom.atBottom).toBe(true);
    expect((await ok('browser.scroll', { selector: '#end' })).scrolledTo).toBe('#end');
  }, 30_000);

  test('the agent\'s tab runs as a page in front does: visible, and every capture answers at once', async () => {
    await waitFor('the page to say how it is seen', () => ok('browser.snapshot', { tabId: agentTab }), (data) => /visibility:\w+/.test(data.text));
    expect((await ok('browser.snapshot', { tabId: agentTab })).text).toContain('visibility:visible');
    for (let n = 0; n < 4; n += 1) {
      const started = Date.now();
      expect((await ok('browser.capture', { tabId: agentTab })).mime).toBe('image/png');
      expect(Date.now() - started).toBeLessThan(2000);
    }
    expect((await full()).tabs.find((tab) => tab.id === agentTab)?.shown).toBe(false);
  }, 30_000);

  test('browser.capture answers a PNG of the tab; browser.resize gives it a phone\'s size', async () => {
    const shot = await ok('browser.capture', { tabId: agentTab });
    expect(shot.mime).toBe('image/png');
    expect(Buffer.from(shot.base64, 'base64').subarray(1, 4).toString()).toBe('PNG');
    expect(shot.width).toBeGreaterThan(100);
    expect(await ok('browser.resize', { viewport: 'mobile' })).toEqual({ viewport: { mode: 'mobile', width: 390, height: 844 } });
    const narrow = await ok('browser.capture');
    expect(narrow.width).toBe(390);
    await ok('browser.resize', { viewport: 'fill' });
  }, 30_000);

  test('browser.back and browser.forward move through the chat\'s tab, at once (a page from the back-forward cache too)', async () => {
    await ok('browser.open', { url: `${site}/a`, tabId: agentTab });
    let started = Date.now();
    expect(await ok('browser.back')).toMatchObject({ url: `${site}/agent` });
    expect(Date.now() - started).toBeLessThan(3000);
    started = Date.now();
    expect(await ok('browser.forward')).toMatchObject({ url: `${site}/a`, title: 'page a' });
    expect(Date.now() - started).toBeLessThan(3000);
  }, 30_000);

  test('a dialog in the tab the agent works in answers itself', async () => {
    await ok('browser.open', { url: `${site}/agent`, tabId: agentTab });
    await ok('browser.click', { selector: '#pop' });
    await waitFor('the page past its alert', () => ok('browser.snapshot'), (data) => data.title === 'agent-alert-done');
  }, 30_000);

  test('frames say the agent is working while it acts', async () => {
    await ok('browser.snapshot');
    const shown = await frame(service, 0, 0);
    expect(shown.status).toBe(200);
    const res = await api(service, 'GET', '/surface/frame?after=0&wait=0');
    expect(res.headers.get('x-surface-agent-active')).toBe('1');
  }, 30_000);

  test('an id the service did not issue is refused, never acted on elsewhere', async () => {
    const answer = await act('browser.snapshot', { tabId: 'not-a-tab' });
    expect(answer.ok).toBe(false);
  }, 30_000);

  test('browser.close closes the chat\'s own tab and refuses the user\'s', async () => {
    const users = (await full()).tabs.find((tab) => !tab.agent);
    expect((await act('browser.close', { tabId: users?.id })).ok).toBe(false);
    expect(await ok('browser.close')).toEqual({ closed: true, tabId: agentTab });
    await waitFor('the agent\'s tab gone', () => full(), (s) => !s.tabs.some((tab) => tab.id === agentTab));
    expect((await act('browser.close')).ok).toBe(false);
  }, 30_000);
});

describe('the browser\'s own keys, while the picture has the focus', () => {
  let service: Service;
  let dataDir: string;

  type Full = State & { tabs: Array<{ id: string; url: string; shown: boolean }>; address: { seq: number } | null };
  const full = async (): Promise<Full> => (await api(service, 'GET', '/state')).json() as Promise<Full>;
  const shownUrl = (s: Full) => s.tabs.find((tab) => tab.shown)?.url;
  const go = async (path: string, title?: string) => {
    expect(await (await api(service, 'POST', '/navigate', { url: `${site}${path}` })).json()).toEqual({ ok: true });
    return waitFor(`${path} to load`, () => full(), (now) => now.url === `${site}${path}` && !now.loading && (title === undefined || now.title === title));
  };
  const send = async (events: unknown[]) => {
    expect((await api(service, 'POST', '/surface/input', { events })).status).toBe(204);
  };
  const press = (key: string, code: string, keyCode: number, modifiers: Partial<typeof NO_KEYS> = {}) => [
    { type: 'key', action: 'down', key, code, keyCode, modifiers: { ...NO_KEYS, ...modifiers } },
    { type: 'key', action: 'up', key, code, keyCode, modifiers: { ...NO_KEYS, ...modifiers } },
  ];
  /** Keys for text, as a US keyboard sends them. */
  const typing = (text: string) => Array.from(text).flatMap((char) => {
    const named: Record<string, [string, number, boolean]> = { '.': ['Period', 190, false], ':': ['Semicolon', 186, true], '/': ['Slash', 191, false] };
    if (named[char]) return press(char, named[char][0], named[char][1], { shift: named[char][2] });
    if (/[0-9]/.test(char)) return press(char, `Digit${char}`, 48 + Number(char));
    return press(char, `Key${char.toUpperCase()}`, char.toUpperCase().charCodeAt(0));
  });
  const click = (x: number, y: number, count = 1) => Array.from({ length: count }).flatMap(() => [
    { type: 'pointer', action: 'down', x, y, button: 0, buttons: 1, modifiers: NO_KEYS },
    { type: 'pointer', action: 'up', x, y, button: 0, buttons: 0, modifiers: NO_KEYS },
  ]);

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'cloak-test-'));
    service = await startService(dataDir);
    await api(service, 'POST', '/viewer', { dpr: 1, mac: false });
    await api(service, 'POST', '/surface/resize', { width: 900, height: 700 });
    await waitFor('the browser to run', () => full(), (s) => s.phase === 'running' && s.url === `${site}/`, 60_000);
  });

  afterAll(async () => {
    if (service) await stopService(service);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('mod+T opens a tab in front; the address typed next opens with Enter', async () => {
    const before = await full();
    await send(press('t', 'KeyT', 84, { ctrl: true }));
    const opened = await waitFor('a new tab in front', () => full(), (s) => s.tabs.length === before.tabs.length + 1 && s.url === 'about:blank');
    expect(opened.address).not.toBeNull();
    await send([...typing(`${site.replace('http://', '')}/a`), ...press('Enter', 'Enter', 13)]);
    await waitFor('the typed address open in it', () => full(), (s) => s.url === `${site}/a` && s.title === 'page a' && s.address === null);
  }, 30_000);

  test('Ctrl+Tab, mod+digit and OpenChamber\'s own tab keys switch the tabs; mod+W closes one', async () => {
    const [first, second] = (await full()).tabs;
    const shows = (url: string, what: string) => waitFor(what, () => full(), (s) => shownUrl(s) === url && s.url === url);
    await send(press('Tab', 'Tab', 9, { ctrl: true }));
    await shows(first.url, 'Ctrl+Tab to the first tab');
    await send(press('Tab', 'Tab', 9, { ctrl: true, shift: true }));
    await shows(second.url, 'Ctrl+Shift+Tab back to the second');
    await send(press('1', 'Digit1', 49, { ctrl: true }));
    await shows(first.url, 'Ctrl+1 to the first');
    await send(press('9', 'Digit9', 57, { ctrl: true }));
    await shows(second.url, 'Ctrl+9 to the last');
    await send(press('ArrowLeft', 'ArrowLeft', 37, { ctrl: true, alt: true }));
    await shows(first.url, 'OpenChamber\'s previous-tab key to the first');
    await send(press('ArrowRight', 'ArrowRight', 39, { ctrl: true, alt: true }));
    await shows(second.url, 'OpenChamber\'s next-tab key to the second');
    await send(press('w', 'KeyW', 87, { ctrl: true }));
    const after = await waitFor('the second tab closed', () => full(), (s) => s.tabs.length === 1);
    expect(after.tabs[0].id).toBe(first.id);
  }, 30_000);

  test('mod+[ and Alt+← go back, mod+] forward; on a Mac, Command+[ and Command+]', async () => {
    await go('/a', 'page a');
    await go('/b', 'page b');
    await send(press('[', 'BracketLeft', 219, { ctrl: true }));
    await waitFor('back to /a', () => full(), (s) => s.url === `${site}/a` && !s.loading);
    await send(press(']', 'BracketRight', 221, { ctrl: true }));
    await waitFor('forward to /b', () => full(), (s) => s.url === `${site}/b` && !s.loading);
    await send(press('ArrowLeft', 'ArrowLeft', 37, { alt: true }));
    await waitFor('Alt+← back to /a', () => full(), (s) => s.url === `${site}/a` && !s.loading);
    await api(service, 'POST', '/viewer', { dpr: 1, mac: true });
    await send(press(']', 'BracketRight', 221, { meta: true }));
    await waitFor('Command+] forward to /b', () => full(), (s) => s.url === `${site}/b` && !s.loading);
    await api(service, 'POST', '/viewer', { dpr: 1, mac: false });
  }, 30_000);

  test('mod+L: what is typed before the strip\'s field has the focus goes to the field, not the page', async () => {
    await go('/form', 'ready');
    await send(click(170, 35));
    await send(press('l', 'KeyL', 76, { ctrl: true }));
    const asked = await waitFor('the address asked for', () => full(), (s) => s.address !== null);
    await send(typing('ab'));
    await sleep(300);
    expect((await full()).title).toBe('ready');
    expect(await (await api(service, 'POST', '/address', { seq: asked.address?.seq })).json()).toEqual({ ok: true, draft: 'ab' });
    expect((await full()).address).toBeNull();
    // Handed over: the page has the keys again.
    await send(typing('c'));
    await waitFor('the page to have the next key', () => full(), (s) => s.title === 'value:c');
  }, 30_000);

  test('a double click on a page just opened is a double click, whatever was clicked on the page before', async () => {
    const page = await go('/words');
    const word = JSON.parse(page.title) as { x: number; y: number };
    await send(click(word.x, word.y));
    // The same spot on a new document, at once: no run of clicks goes on from the page before. The new document is
    // the one whose title says so (the same address could still answer with the old one).
    expect(await (await api(service, 'POST', '/navigate', { url: `${site}/words?again` })).json()).toEqual({ ok: true });
    await waitFor('the new document', () => full(), (s) => s.title.includes('"at":"?again"'));
    await send(click(word.x, word.y, 2));
    expect(await (await api(service, 'GET', '/surface/clipboard')).json()).toEqual({ text: 'beta' });
  }, 30_000);
});

describe('the panel\'s size, when OpenChamber does not send it', () => {
  let dataDir: string;
  let service: Service | null = null;
  type Sized = State & { surface: { width: number; height: number; sized: boolean }; youControl: boolean };
  const look = async (headers: Record<string, string> = {}): Promise<Sized> => {
    const res = await fetch(`${service?.base}/state`, { headers: { authorization: `Bearer ${TOKEN}`, ...headers } });
    return res.json() as Promise<Sized>;
  };

  beforeAll(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'cloak-test-'));
  });

  afterAll(async () => {
    if (service) await stopService(service);
    rmSync(dataDir, { recursive: true, force: true });
  });

  // OpenChamber sends the size only when the panel's box changes, over an open connection: a service started again
  // (a restart of OpenChamber, an update) gets none, and a page laid out at a default size was scaled into the panel.
  test('a service started again begins at the last panel\'s size, and says no panel has given it one yet', async () => {
    service = await startService(dataDir);
    await api(service, 'POST', '/viewer', { dpr: 2, mac: false });
    expect((await look()).surface.sized).toBe(false);
    expect(await (await api(service, 'POST', '/surface/resize', { width: 1100, height: 700 })).json()).toEqual({ width: 1100, height: 700 });
    await waitFor('the browser to run', () => look(), (s) => s.phase === 'running' && !s.loading, 60_000);
    expect((await look()).surface).toMatchObject({ width: 1100, height: 700, sized: true });
    await stopService(service);

    service = await startService(dataDir);
    expect((await look()).surface).toMatchObject({ width: 1100, height: 700, sized: false });
    await waitFor('the browser to run again', () => look(), (s) => s.phase === 'running' && !s.loading, 60_000);
    const first = await waitFor('a picture at that size', () => frame(service as Service, 0, 2000), (shown) => shown.status === 200 && shown.width === 1100);
    expect(first.height).toBe(700);
    await api(service, 'POST', '/surface/resize', { width: 1000, height: 600 });
    expect((await look()).surface).toMatchObject({ width: 1000, height: 600, sized: true });
  }, 120_000);

  test('the strip learns whether its window holds the picture', async () => {
    expect((await look({ 'x-surface-viewer-controls': '1' })).youControl).toBe(true);
    expect((await look({ 'x-surface-viewer-controls': '0' })).youControl).toBe(false);
    expect((await look()).youControl).toBe(false);
  }, 30_000);
});

describe('a profile another machine locked', () => {
  // A container made again over the same volume has a new hostname, and Chrome refused the profile its old self had
  // locked ("in use on another computer", exit code 21): the browser never started again.
  test('the browser starts on a profile whose lock names another machine', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'cloak-test-'));
    mkdirSync(join(dataDir, 'profile'), { recursive: true });
    symlinkSync('an-old-container-4242', join(dataDir, 'profile/SingletonLock'));
    const service = await startService(dataDir);
    try {
      await waitFor('the browser to run', () => state(service), (s) => s.phase === 'running', 30_000);
      expect(readlinkSync(join(dataDir, 'profile/SingletonLock')).startsWith(`${hostname()}-`)).toBe(true);
    } finally {
      await stopService(service);
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 60_000);
});
