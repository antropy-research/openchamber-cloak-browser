// A journey through the Cloak Browser in oc-forge's dev OpenChamber (container oc-forge-openchamber-dev, which mounts
// this checkout at /extensions/cloak-browser), with the real CloakBrowser: a headless window at a pixel ratio of 2
// opens the panel (installing and approving the folder if it is not), waits for the browser (the first run downloads
// it), goes somewhere from the strip's address field, then works the picture through OpenChamber's own viewer the way
// a person does: clicks, typing, paste, Control-click, the browser's keys, the strip's tabs and a page's alert. Then it
// makes Cloak Browser the Browser provider and drives the agent's browser actions through OpenChamber's own control
// route, as the agent's openchamber_web tool does. With --agent, an agent in a chat of its own then uses the tool for
// real. It leaves the browser on Google, Cloak Browser as the provider, and deletes the chat it opened.
//
// Not part of CI. Run it from this folder, holding the dev e2e lock so the Planner's journeys do not run meanwhile:
//   SHELL=/bin/sh flock /tmp/opencode/planner-e2e.lock node tests/e2e/dev.mjs [--agent] [out dir]
// Another window with the panel open shares the one picture: its size is the last viewer's.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

const ID = 'oc-forge-cloak-browser';
const NAME = 'Cloak Browser';
const CONTAINER = 'oc-forge-openchamber-dev';
const args = process.argv.slice(2);
const withAgent = args.includes('--agent');
const out = args.find((arg) => !arg.startsWith('--')) ?? '/tmp/opencode/cloak-browser-e2e';
mkdirSync(out, { recursive: true });
// Where the control route saves the agent's screenshots (<dir>/.openchamber/screenshots): a scratch folder in the
// container, removed at the end.
const SCRATCH = '/tmp/cloak-journey';

const published = execFileSync('docker', ['port', CONTAINER, '3000/tcp'], { encoding: 'utf8' }).trim().split('\n')[0];
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
    return `${row?.source} ${row?.version}, granted [${requested}], provides [${row?.service?.provides ?? []}]`;
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
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`${what}: last ${JSON.stringify(last)?.slice(0, 220)}`);
  };
  /** One of the agent's browser actions, as the openchamber_web tool sends it. */
  const control = async (action, input = {}) => {
    const res = await context.request.post(`${base}/api/openchamber/control`, { data: { action, input, contextDirectory: SCRATCH }, timeout: 60_000 });
    const body = await res.json().catch(() => ({}));
    if (!res.ok()) throw new Error(`${action}: HTTP ${res.status()} ${body.error ?? JSON.stringify(body)}`);
    return body;
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
  const field = strip.locator('.toolbar input').first();
  const canvas = pane.locator('canvas');
  const go = async (address) => {
    await field.click();
    await field.fill(address);
    await field.press('Enter');
  };
  /** A page point (CSS pixels) in the picture as this window draws it, for a page `pageWidth` CSS pixels wide. */
  const pictureAt = (x, y) => canvas.evaluate((element, { x, y, width }) => {
    const box = element.getBoundingClientRect();
    const perCss = element.width / width;
    return { x: (x * perCss * box.width) / element.width, y: (y * perCss * box.height) / element.height };
  }, { x, y, width: pageWidth });
  /** A data: page that reports its width in its title, opened from the address field. */
  const openPage = async (what, html, prefix) => {
    await go(`data:text/html,${html}<script>document.title="${prefix}:"+innerWidth</script>`);
    const state = await waitState(what, (s) => s.url.startsWith('data:') && s.title.startsWith(`${prefix}:`) && !s.loading, 20_000);
    pageWidth = Number(state.title.slice(prefix.length + 1));
    return state;
  };

  await step('CloakBrowser running (downloaded on first use)', async () => {
    const seen = new Set();
    const watcher = setInterval(() => {
      void strip.locator('.status').textContent({ timeout: 500 }).then((text) => { if (text) seen.add(text.replace(/\d+\/\d+ MB/, 'n/N MB')); }).catch(() => {});
    }, 700);
    try {
      const state = await waitState('the browser to run', (s) => s.phase === 'running' && !s.loading && s.url && s.url !== 'about:blank', 600_000);
      return `${state.binary?.source} ${state.binary?.version}; ${state.url}; the strip said: ${[...seen].join(' | ') || '(nothing: already running)'}`;
    } finally {
      clearInterval(watcher);
    }
  });
  await step('a picture in the panel, its title above it', async () => {
    await header.getByText(/Click or type to take control|Agent is working/).waitFor({ timeout: 30_000 });
    const size = await pane.evaluate((element) => {
      const picture = element.querySelector('canvas');
      const box = element.getBoundingClientRect();
      return { paneW: Math.round(box.width), paneH: Math.round(box.height), canvasW: picture?.width ?? 0, canvasH: picture?.height ?? 0 };
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

  const form = '<input id=f style="position:absolute;left:20px;top:20px;width:300px;height:30px;font:16px sans-serif"><script>f.oninput=()=>document.title="value:"+f.value</script>';
  await step('a page to type into, from the address field', async () => {
    await openPage('the form page', form, 'ready');
    return `${pageWidth} css px wide`;
  });
  // Right after the strip had the keyboard: before the strip handed it back (panel/main.ts, releaseFocus),
  // OpenChamber put it in the chat box within a frame of this click, and the typing below went there.
  await step('a click in the picture right after using the strip keeps the keyboard', async () => {
    await canvas.click({ position: await pictureAt(170, 35) });
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

  // AGENTS.md: Command-click (Control here) opens a new tab and leaves the view where it is.
  await step('Control-click on a link opens it in a tab behind; the picture stays', async () => {
    const before = await openPage('the link page', '<a href="https://example.com/" style="position:absolute;left:20px;top:20px;font:20px/24px sans-serif">open</a>', 'link');
    await canvas.click({ position: await pictureAt(40, 32), modifiers: ['Control'] });
    const opened = await waitState('a tab behind', (s) => s.tabs.length === before.tabs.length + 1 && s.tabs.some((tab) => tab.url === 'https://example.com/' && !tab.shown), 20_000);
    await page.waitForTimeout(1500);
    const now = await serviceState();
    if (!now.url.startsWith('data:')) throw new Error(`the picture moved to ${now.url}`);
    // Closed again, so the runs leave no tabs behind.
    const behind = now.tabs.find((tab) => tab.url === 'https://example.com/' && !tab.shown && !before.tabs.some((each) => each.id === tab.id));
    if (behind) await context.request.post(`${base}/api/guests/${ID}/service/request`, { data: { method: 'POST', path: '/tabs', body: JSON.stringify({ action: 'close', id: behind.id }) } });
    return `${opened.tabs.length} tabs; still showing ${now.title}`;
  });
  await step('Control+T opens a tab and the keyboard goes to the address; Enter opens what was typed', async () => {
    const before = await serviceState();
    await canvas.click({ position: await pictureAt(400, 300) });
    await page.keyboard.press('Control+t');
    await page.keyboard.type('example.com', { delay: 30 });
    await page.waitForTimeout(400);
    const typed = await field.evaluate((input) => ({ value: input.value, focused: document.activeElement === input }));
    if (!typed.focused || typed.value !== 'example.com') throw new Error(`the field ${typed.focused ? 'has the focus' : 'does not have the focus'} and holds "${typed.value}"`);
    await page.keyboard.press('Enter');
    const state = await waitState('example.com in the new tab', (s) => s.tabs.length === before.tabs.length + 1 && s.url === 'https://example.com/' && !s.loading, 20_000);
    return `${state.tabs.length} tabs; the new one shows ${state.title}`;
  });
  await page.waitForTimeout(800);
  await zone.screenshot({ path: join(out, '4-tabs.png') });
  await step('Control+Tab and Control+W: tabs switch and close from the keyboard', async () => {
    const before = await serviceState();
    const shownAt = before.tabs.findIndex((tab) => tab.shown);
    await canvas.click({ position: await pictureAt(400, 300) });
    await page.keyboard.press('Control+Tab');
    const next = before.tabs[(shownAt + 1) % before.tabs.length];
    await waitState('the next tab shown', (s) => s.tabs.find((tab) => tab.shown)?.id === next.id, 10_000);
    await page.keyboard.press('Control+w');
    const after = await waitState('that tab closed', (s) => s.tabs.length === before.tabs.length - 1 && !s.tabs.some((tab) => tab.id === next.id), 10_000);
    return `${before.tabs.length} → ${after.tabs.length} tabs; showing ${after.title || after.url}`;
  });
  await step('the strip\'s tabs: + opens one, a click shows one, × closes one', async () => {
    const before = await serviceState();
    await strip.getByRole('button', { name: 'New tab' }).click();
    await waitState('a new empty tab in front', (s) => s.tabs.length === before.tabs.length + 1 && s.url === 'about:blank', 10_000);
    await field.fill('example.com');
    await field.press('Enter');
    await waitState('example.com in it', (s) => s.url === 'https://example.com/' && !s.loading, 20_000);
    await strip.locator('[role=tab]').first().click();
    const first = await waitState('the first tab shown', (s) => s.tabs[0].shown, 10_000);
    const last = strip.locator('[role=tab]').last();
    await last.hover();
    await last.getByRole('button', { name: /^Close / }).click();
    const after = await waitState('the new tab closed', (s) => s.tabs.length === before.tabs.length, 10_000);
    return `${first.tabs.length} → ${after.tabs.length} tabs`;
  });
  await step('an alert waits in the strip; OK answers it', async () => {
    await openPage('the alert page', '<button style="position:absolute;left:20px;top:80px;width:120px;height:30px" onclick="alert(\'hello from the page\');document.title=\'after-alert\'">alert</button>', 'alert');
    await canvas.click({ position: await pictureAt(80, 95) });
    const message = strip.locator('.dialog .message');
    await message.waitFor({ timeout: 10_000 });
    const text = await message.innerText();
    if (await strip.getByRole('button', { name: 'Cancel', exact: true }).isVisible()) throw new Error('an alert offers Cancel');
    await page.waitForTimeout(500);
    await zone.screenshot({ path: join(out, '5-alert.png') });
    await strip.getByRole('button', { name: 'OK', exact: true }).click();
    await waitState('the page past its alert', (s) => s.title === 'after-alert' && s.dialog === null, 10_000);
    await message.waitFor({ state: 'hidden', timeout: 5000 });
    return `the strip said "${text}"`;
  });
  await step('hand back to the agent', async () => {
    await header.getByRole('button', { name: 'Hand back to agent' }).click();
    await header.getByText(/Click or type to take control|Agent is working/).waitFor({ timeout: 10_000 });
    return await header.innerText();
  });

  // The agent's side: OpenChamber's own browser actions, answered by CloakBrowser.
  await step('Cloak Browser is the Browser provider (Settings → OpenChamber Tools)', async () => {
    const before = (await (await context.request.get(`${base}/api/config/settings`)).json()).browserProvider ?? 'builtin';
    if (before !== ID) {
      const res = await context.request.put(`${base}/api/config/settings`, { data: { browserProvider: ID } });
      if (!res.ok()) throw new Error(`settings: ${res.status()}`);
    }
    const after = (await (await context.request.get(`${base}/api/config/settings`)).json()).browserProvider;
    if (after !== ID) throw new Error(`browserProvider is ${after}`);
    return `was ${before}, now ${after}`;
  });
  let agentTab = null;
  await step('browser.open: a tab behind, marked as the agent\'s; the user\'s page stays', async () => {
    const before = await serviceState();
    const data = await control('browser.open', { url: 'https://example.com/' });
    agentTab = data.tabId;
    const after = await serviceState();
    if (after.url !== before.url) throw new Error(`the picture moved to ${after.url}`);
    const tab = after.tabs.find((each) => each.id === agentTab);
    if (!tab?.agent || tab.shown) throw new Error(`the agent's tab: ${JSON.stringify(tab)}`);
    await strip.locator('.tab .mark').first().waitFor({ timeout: 5000 });
    return `"${data.title}" settled=${data.settled}; ${after.tabs.length} tabs, the new one marked AI`;
  });
  await step('the panel says the agent is working', async () => {
    await control('browser.snapshot', {});
    await header.getByText('Agent is working').waitFor({ timeout: 5000 });
    return await header.innerText();
  });
  await page.waitForTimeout(500);
  await zone.screenshot({ path: join(out, '6-agent-tab.png') });
  await step('browser.snapshot, browser.inspect and browser.capture', async () => {
    const snap = await control('browser.snapshot', {});
    if (snap.title !== 'Example Domain') throw new Error(`snapshot of ${snap.url} "${snap.title}"`);
    const link = snap.elements.find((element) => element.tag === 'a');
    const inspected = await control('browser.inspect', { selector: link.selector });
    const shot = await control('browser.capture', {});
    execFileSync('docker', ['exec', CONTAINER, 'test', '-s', `${SCRATCH}/${shot.path}`]);
    return `${snap.elements.length} elements (a: "${link?.label}"), ${snap.tabs.length} tabs; the link's color ${inspected.styles.color}; ${shot.path} ${shot.width}×${shot.height}`;
  });
  await step('browser.click a link, then browser.back', async () => {
    const snap = await control('browser.snapshot', {});
    const link = snap.elements.find((element) => element.tag === 'a');
    const clicked = await control('browser.click', { selector: link.selector });
    const moved = await waitState('the agent\'s tab on the link\'s page', (s) => s.tabs.some((tab) => tab.id === agentTab && !/example\.com/.test(tab.url)), 20_000);
    const back = await control('browser.back', {});
    if (back.url !== 'https://example.com/') throw new Error(`back to ${back.url}`);
    return `clicked ${clicked.clicked} → ${moved.tabs.find((tab) => tab.id === agentTab).url}; back to ${back.url}`;
  });
  await step('browser.type into the user\'s own tab, named by its id: real keys', async () => {
    const state = await openPage('the form page', form, 'ready');
    const shown = state.tabs.find((tab) => tab.shown);
    await control('browser.type', { tabId: shown.id, selector: '#f', value: 'typed by the agent' });
    return (await waitState('the agent\'s text in the user\'s page', (s) => s.title === 'value:typed by the agent', 10_000)).title;
  });
  await step('browser.close closes the agent\'s tab, and refuses the user\'s', async () => {
    const users = (await serviceState()).tabs.filter((tab) => !tab.agent);
    let refused = '';
    try {
      await control('browser.close', { tabId: users[0].id });
    } catch (error) {
      refused = error.message;
    }
    if (!refused) throw new Error('it closed the user\'s tab');
    const closed = await control('browser.close', {});
    const after = await serviceState();
    if (after.tabs.some((tab) => tab.id === agentTab)) throw new Error('the agent\'s tab is still open');
    return `refused: ${refused.slice(0, 70)}; closed ${closed.tabId === agentTab ? 'the agent\'s tab' : closed.tabId}`;
  });

  if (withAgent && anchorId) {
    // A real agent in the journey's chat, with OpenChamber's own tool: what it opens appears in the panel.
    await step('an agent in a chat uses the browser tool; it works in Cloak Browser', async () => {
      const before = await serviceState();
      const prompt = 'Use the openchamber_web tool: open https://example.com/ with the browser.open action, then read that tab with browser.snapshot. Reply with only the page title and the text of its one link. Do nothing else.';
      const where = `directory=${encodeURIComponent(anchorFolder)}`;
      const sent = await context.request.post(`${base}/api/session/${encodeURIComponent(anchorId)}/prompt?${where}`, { data: { text: prompt } });
      if (!sent.ok()) throw new Error(`prompt: HTTP ${sent.status()} ${(await sent.text()).slice(0, 160)}`);
      const waited = await context.request.post(`${base}/api/experimental/session/${encodeURIComponent(anchorId)}/wait?${where}`, { timeout: 300_000 });
      if (!waited.ok()) throw new Error(`wait: HTTP ${waited.status()} ${(await waited.text()).slice(0, 160)}`);
      // The chat as OpenChamber shows it: the agent's tool calls and its reply.
      const listed = await (await context.request.get(`${base}/api/session/${encodeURIComponent(anchorId)}/message?${where}`, { timeout: 30_000 })).json();
      const messages = (Array.isArray(listed) ? listed : listed.data ?? []).filter((message) => message.type === 'assistant');
      const parts = messages.flatMap((message) => message.content ?? []);
      const calls = parts.filter((part) => part.type === 'tool' && part.name === 'openchamber_web');
      const actions = calls.map((part) => `${part.state?.input?.action}:${part.state?.status}`);
      const usedTool = calls.length > 0;
      // The newest message first: its text is the reply.
      const reply = (messages[0]?.content ?? []).filter((part) => part.type === 'text').map((part) => part.text).join(' ').replace(/\s+/g, ' ').trim();
      const after = await serviceState();
      const opened = after.tabs.filter((tab) => tab.agent && !before.tabs.some((each) => each.id === tab.id));
      if (!usedTool) throw new Error(`the agent did not call openchamber_web; ${messages.length} answers; said: ${reply.slice(-120)}`);
      if (!opened.some((tab) => tab.url === 'https://example.com/')) throw new Error(`no agent tab at example.com; actions ${actions.join(', ')}; said: ${reply.slice(-120)}`);
      if (!/Example Domain/.test(reply)) throw new Error(`the reply: ${reply.slice(-160)}`);
      await page.waitForTimeout(800);
      await zone.screenshot({ path: join(out, '7-agent-chat.png') });
      for (const tab of opened) await context.request.post(`${base}/api/guests/${ID}/service/request`, { data: { method: 'POST', path: '/tabs', body: JSON.stringify({ action: 'close', id: tab.id }) } });
      return `actions ${actions.join(', ')}; ${opened.length} agent tab(s); the reply ends "${reply.slice(-60)}"`;
    });
  }

  await step('leave the browser on Google', async () => {
    await go('google.com');
    return (await waitState('Google', (s) => /google\./.test(s.url) && !s.loading, 30_000)).url;
  });
  results.push({ check: 'no page errors', ok: pageErrors.length === 0, s: '', detail: pageErrors.join(' | ').slice(0, 200) });
} catch (error) {
  results.push({ check: 'run', ok: false, s: '', detail: String(error?.message ?? error).slice(0, 200) });
} finally {
  if (anchorId) await context.request.delete(`${base}/api/session/${encodeURIComponent(anchorId)}?directory=${encodeURIComponent(anchorFolder)}`).catch(() => {});
  try {
    execFileSync('docker', ['exec', CONTAINER, 'rm', '-rf', SCRATCH]);
  } catch {
    // nothing saved
  }
  await browser.close();
}
console.table(results);
const passed = results.filter((result) => result.ok).length;
console.log(`${passed === results.length ? 'PASS' : 'FAIL'} ${passed}/${results.length} Cloak Browser in the dev OpenChamber (${base}); screenshots in ${out}`);
process.exit(passed === results.length ? 0 : 1);
