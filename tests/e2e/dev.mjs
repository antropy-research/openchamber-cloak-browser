// A journey through the Cloak Browser in oc-forge's dev OpenChamber (container oc-forge-openchamber-dev, which mounts
// this checkout at /extensions/cloak-browser), with the real CloakBrowser: a headless window at a pixel ratio of 2
// opens the panel (installing and approving the folder if it is not), waits for the browser (the first run downloads
// it), goes somewhere from the strip's address field, then clicks and types into a page through OpenChamber's own
// viewer, the way a person does. It leaves the browser running on Google and deletes the chat it opened.
//
// Not part of CI. Run it from this folder, holding the dev e2e lock so the Planner's journeys do not run meanwhile:
//   flock /tmp/opencode/planner-e2e.lock node tests/e2e/dev.mjs [out dir]
// Another window with the panel open shares the one picture: its size is the last viewer's.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

const ID = 'oc-forge-cloak-browser';
const NAME = 'Cloak Browser';
const out = process.argv[2] ?? '/tmp/opencode/cloak-browser-e2e';
mkdirSync(out, { recursive: true });

const published = execFileSync('docker', ['port', 'oc-forge-openchamber-dev', '3000/tcp'], { encoding: 'utf8' }).trim().split('\n')[0];
const at = published.lastIndexOf(':');
const host = published.slice(0, at);
const base = `http://${host === '0.0.0.0' || host === '[::]' ? '127.0.0.1' : host}:${published.slice(at + 1)}`;
// Never printed.
const password = /^OPENCHAMBER_UI_PASSWORD=(.+)$/m.exec(readFileSync(join(homedir(), '.local/share/oc-forge-openchamber-dev/secrets.env'), 'utf8'))?.[1]?.trim();
if (!password) throw new Error('no UI password in secrets.env');

const results = [];
const step = async (check, fn) => {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ check, ok: true, s: ((Date.now() - started) / 1000).toFixed(1), detail: String(detail ?? '').replace(/\s+/g, ' ').slice(0, 110) });
  } catch (error) {
    results.push({ check, ok: false, s: ((Date.now() - started) / 1000).toFixed(1), detail: String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 200) });
  }
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const anchorFolder = '/home/node/projects/planner-demo-a';
let anchorId = null;
const pageErrors = [];
let pageWidth = 0;
try {
  if ((await context.request.post(`${base}/auth/session`, { data: { password } })).status() !== 200) throw new Error('login failed');
  const catalog = async () => {
    const body = await (await context.request.get(`${base}/api/guests`)).json();
    return (Array.isArray(body) ? body : body.guests ?? []).find((guest) => guest.id === ID) ?? null;
  };
  await step('installed and approved', async () => {
    let row = await catalog();
    if (!row) {
      const res = await context.request.post(`${base}/api/guests`, { data: { path: '/extensions/cloak-browser' } });
      if (res.status() !== 201) throw new Error(`install: ${res.status()} ${(await res.text()).slice(0, 200)}`);
      row = await catalog();
    }
    const requested = row?.capabilities?.requested ?? [];
    if (!requested.every((capability) => (row?.capabilities?.granted ?? []).includes(capability))) {
      const res = await context.request.put(`${base}/api/guests/${ID}/capabilities`, { data: { granted: requested } });
      if (!res.ok()) throw new Error(`approve: ${res.status()}`);
    }
    return `${row?.source} ${row?.version}, granted [${requested}]`;
  });
  const serviceState = async () => {
    const res = await context.request.post(`${base}/api/guests/${ID}/service/request`, { data: { method: 'GET', path: '/state' } });
    return JSON.parse((await res.json()).body);
  };
  const waitState = async (what, done, timeoutMs) => {
    const end = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < end) {
      try {
        last = await serviceState();
        if (done(last)) return last;
      } catch {
        // the service is restarting
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`${what}: last ${JSON.stringify(last)?.slice(0, 220)}`);
  };

  // OpenChamber's right panel opens in a chat's folder: a chat of the journey's own, deleted at the end.
  const anchor = await context.request.post(`${base}/api/session?directory=${encodeURIComponent(anchorFolder)}`, { data: { title: `cloak-journey ${randomBytes(4).toString('hex')}`, location: { directory: anchorFolder } } })
    .then((response) => (response.ok() ? response.json() : null)).catch(() => null);
  anchorId = (anchor?.data ?? anchor)?.id ?? null;
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(anchorId ? `${base}/?session=${encodeURIComponent(anchorId)}` : `${base}/`);

  const rail = page.locator(`button[data-context-surface="plugin:${ID}"]`).first();
  await step('open the panel from the rail', async () => {
    await rail.waitFor({ timeout: 30_000 });
    for (let attempt = 0; attempt < 3 && (await rail.getAttribute('aria-pressed')) !== 'true'; attempt += 1) {
      await rail.click();
      await page.waitForTimeout(1500);
    }
    return `pressed ${await rail.getAttribute('aria-pressed')}`;
  });
  const pane = page.getByRole('application', { name: `Live surface of ${NAME}` });
  const header = pane.locator('xpath=preceding-sibling::div[1]');
  const strip = page.frameLocator(`iframe[title="${NAME}"]`).first();
  const zone = page.locator('aside[data-context-zone]', { has: pane }).first();
  const field = strip.locator('input').first();
  const go = async (address) => {
    await field.click();
    await field.fill(address);
    await field.press('Enter');
  };

  await step('CloakBrowser running (downloaded on first use)', async () => {
    const seen = new Set();
    const watcher = setInterval(() => {
      void strip.locator('span').last().textContent({ timeout: 500 }).then((text) => { if (text) seen.add(text.replace(/\d+\/\d+ MB/, 'n/N MB')); }).catch(() => {});
    }, 700);
    try {
      const state = await waitState('the browser to run', (s) => s.phase === 'running' && !s.loading && s.url && s.url !== 'about:blank', 600_000);
      return `${state.binary?.source} ${state.binary?.version}; ${state.url}; the strip said: ${[...seen].join(' | ') || '(nothing: already running)'}`;
    } finally {
      clearInterval(watcher);
    }
  });
  await step('a picture in the panel, its title above it', async () => {
    await header.getByText('Click or type to take control').waitFor({ timeout: 30_000 });
    const size = await pane.evaluate((element) => {
      const canvas = element.querySelector('canvas');
      const box = element.getBoundingClientRect();
      return { paneW: Math.round(box.width), paneH: Math.round(box.height), canvasW: canvas?.width ?? 0, canvasH: canvas?.height ?? 0 };
    });
    if (!size.canvasW || !size.canvasH) throw new Error(JSON.stringify(size));
    return `pane ${size.paneW}×${size.paneH} css, picture ${size.canvasW}×${size.canvasH}; ${await header.innerText()}`;
  });
  await step('Google from the address field', async () => {
    await go('google.com');
    const state = await waitState('Google', (s) => /google\./.test(s.url) && !s.loading, 30_000);
    return `${state.url} "${state.title}"`;
  });
  await page.waitForTimeout(1500);
  await zone.screenshot({ path: join(out, '1-google.png') });

  await step('example.com from the address field; the field follows the page', async () => {
    await go('example.com');
    const state = await waitState('Example Domain', (s) => s.url === 'https://example.com/' && s.title === 'Example Domain' && !s.loading, 30_000);
    const shown = await field.evaluate((input) => input.value);
    if (shown !== 'https://example.com/') throw new Error(`the field shows ${shown}`);
    return `${state.url} "${state.title}"`;
  });
  await page.waitForTimeout(1200);
  await zone.screenshot({ path: join(out, '2-example.png') });

  const form = 'data:text/html,<input id=f style="position:absolute;left:20px;top:20px;width:300px;height:30px;font:16px sans-serif"><script>document.title="ready:"+innerWidth;f.oninput=()=>document.title="value:"+f.value</script>';
  await step('a page to type into, from the address field', async () => {
    await go(form);
    const state = await waitState('the form page', (s) => s.url.startsWith('data:') && s.title.startsWith('ready:') && !s.loading, 20_000);
    pageWidth = Number(state.title.slice(6));
    return `${pageWidth} css px wide`;
  });
  // Right after the strip had the keyboard: before the strip handed it back (panel/main.ts, releaseFocus),
  // OpenChamber put it in the chat box within a frame of this click, and the typing below went there.
  await step('a click in the picture right after using the strip keeps the keyboard', async () => {
    const canvas = pane.locator('canvas');
    // The page point (170, 35) in the picture as this window draws it: picture pixels per page pixel, then the
    // canvas's own scaling to fit the pane.
    const point = await canvas.evaluate((element, { x, y, width }) => {
      const box = element.getBoundingClientRect();
      const perCss = element.width / width;
      return { x: (x * perCss * box.width) / element.width, y: (y * perCss * box.height) / element.height };
    }, { x: 170, y: 35, width: pageWidth });
    await canvas.click({ position: point });
    await header.getByText('You have control').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1000);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName);
    if (focused !== 'application') throw new Error(`the keyboard went to ${focused}`);
    return 'the picture holds the focus';
  });
  await step('typing reaches the page (OpenChamber\'s viewer → the service → CDP)', async () => {
    await page.keyboard.type('cloak', { delay: 40 });
    return (await waitState('the typed text', (s) => s.title === 'value:cloak', 10_000)).title;
  });
  await step('pasted Chinese reaches the page', async () => {
    await pane.evaluate((element) => {
      const data = new DataTransfer();
      data.setData('text/plain', ' 浏览器');
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    return (await waitState('the pasted text', (s) => s.title === 'value:cloak 浏览器', 10_000)).title;
  });
  await page.waitForTimeout(800);
  await zone.screenshot({ path: join(out, '3-typed.png') });
  await step('hand back, and leave the browser on Google', async () => {
    await header.getByRole('button', { name: 'Hand back to agent' }).click();
    await go('google.com');
    return (await waitState('Google', (s) => /google\./.test(s.url) && !s.loading, 30_000)).url;
  });
  results.push({ check: 'no page errors', ok: pageErrors.length === 0, s: '', detail: pageErrors.join(' | ').slice(0, 200) });
} catch (error) {
  results.push({ check: 'run', ok: false, s: '', detail: String(error?.message ?? error).slice(0, 200) });
} finally {
  if (anchorId) await context.request.delete(`${base}/api/session/${encodeURIComponent(anchorId)}?directory=${encodeURIComponent(anchorFolder)}`).catch(() => {});
  await browser.close();
}
console.table(results);
const passed = results.filter((result) => result.ok).length;
console.log(`${passed === results.length ? 'PASS' : 'FAIL'} ${passed}/${results.length} Cloak Browser in the dev OpenChamber (${base}); screenshots in ${out}`);
process.exit(passed === results.length ? 0 : 1);
