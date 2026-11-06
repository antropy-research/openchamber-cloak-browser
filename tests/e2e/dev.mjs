// A journey through the Cloak Browser in oc-forge's dev OpenChamber (container oc-forge-openchamber-dev), with the real
// CloakBrowser: a headless window at a pixel ratio of 2 opens the panel (installing and approving the extension if it
// is not), waits for the browser (the first run downloads it), goes somewhere from the strip's address field, then
// works the page as HTML the way a person does: clicks, typing, paste, Control-click, the browser's keys, the strip's
// tabs, a page's alert, control and handing it back, and the service stopped under it. Then it makes Cloak Browser the
// Browser provider and drives the agent's browser actions through OpenChamber's own control route, as the agent's
// openchamber_web tool does. With --agent, an agent in a chat of its own then uses the tool for real. It leaves the
// browser on Google, the Browser provider as it found it, and deletes the chat it opened.
//
// --temp: this checkout's build as a temporary extension (its own id and data folder), so the Cloak Browser dev runs
// is untouched; removed at the end. Without it, the installed one (dev mounts it at /extensions/cloak-browser).
//
// Not part of CI. Run it from this folder, holding the dev e2e lock so the Planner's journeys do not run meanwhile:
//   SHELL=/bin/sh flock /tmp/opencode/planner-e2e.lock node tests/e2e/dev.mjs [--temp] [--agent] [out dir]
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { CONTAINER, inContainer, openPanel, sleep } from './mirror-lib.mjs';

const args = process.argv.slice(2);
const withAgent = args.includes('--agent');
const temp = args.includes('--temp');
const out = args.find((arg) => !arg.startsWith('--')) ?? '/tmp/opencode/cloak-browser-e2e';
// Where the control route saves the agent's screenshots (<dir>/.openchamber/screenshots): a scratch folder in the
// container, removed at the end.
const SCRATCH = '/tmp/cloak-journey';
const anchorFolder = '/home/node/projects/planner-demo-a';

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

let t = null;
let anchorId = null;
let providerBefore = null;
try {
  // OpenChamber's right panel opens in a chat's folder: a chat of the journey's own, deleted at the end. Made before
  // the panel opens, with a context of its own (the panel's window opens on it).
  t = await openPanel({ temp, out, page: '/' });
  const { which, base, context, page, panel, panelElement, mirrorFrame, waitMirror, address, go } = t;
  const anchor = await context.request.post(`${base}/api/session?directory=${encodeURIComponent(anchorFolder)}`, { data: { title: `cloak-journey ${randomBytes(4).toString('hex')}`, location: { directory: anchorFolder } } })
    .then((response) => (response.ok() ? response.json() : null)).catch(() => null);
  anchorId = (anchor?.data ?? anchor)?.id ?? null;
  const ID = which.id;
  const serviceState = () => t.service('GET', '/state');
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
      await sleep(300);
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
  const status = () => panel.locator('.status').textContent();
  const mirror = () => {
    const frame = mirrorFrame();
    if (!frame) throw new Error('no page in the panel');
    return frame;
  };
  /** A data: page that reports its width in its title, opened from the address field. */
  const openPage = async (what, html, prefix) => {
    await go(`data:text/html,${html}<script>document.title="${prefix}:"+innerWidth</script>`);
    const state = await waitState(what, (s) => s.url.startsWith('data:') && s.title.startsWith(`${prefix}:`) && !s.loading, 20_000);
    await waitMirror((frame) => frame.evaluate((title) => document.title === title, state.title), 10_000);
    return state;
  };
  const shoot = (name) => t.shoot(join(out, name));
  /** A click in the middle of the page area (a page whose body is empty there still gets it). */
  const clickPage = async () => {
    const box = await panelElement.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
  };

  await step('installed, approved, and open from the rail', async () => `${ID}, pressed ${await t.rail.getAttribute('aria-pressed')}`);
  await step('CloakBrowser running (downloaded on first use)', async () => {
    const seen = new Set();
    const watcher = setInterval(() => {
      void panel.locator('.status').textContent({ timeout: 500 }).then((text) => { if (text) seen.add(text.replace(/\d+\/\d+ MB/, 'n/N MB')); }).catch(() => {});
    }, 700);
    try {
      const state = await waitState('the browser to run', (s) => s.phase === 'running' && !s.loading && s.url && s.url !== 'about:blank', 600_000);
      return `${state.binary?.source} ${state.binary?.version}; ${state.url}; the strip said: ${[...seen].join(' | ') || '(nothing: already running)'}`;
    } finally {
      clearInterval(watcher);
    }
  });
  await step('the page as HTML under the strip', async () => {
    const shown = await waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 30_000);
    if (shown < 0) throw new Error('nothing in the page area');
    const placeholder = await panel.locator('.placeholder').isVisible();
    if (placeholder) throw new Error(`the placeholder still shows: ${await panel.locator('.placeholder').textContent()}`);
    return `${await mirror().evaluate(() => `${document.title}: ${document.querySelectorAll('*').length} elements`)}`;
  });
  await step('Google from the address field', async () => {
    await go('google.com');
    const state = await waitState('Google', (s) => /google\./.test(s.url) && !s.loading, 30_000);
    const ms = await waitMirror((frame) => frame.evaluate(() => /Google/.test(document.title) && !!document.querySelector('textarea, input[name=q]')), 15_000);
    if (ms < 0) throw new Error('the page area does not show Google');
    return `${state.url} "${state.title}"`;
  });
  await sleep(1500);
  await shoot('1-google.png');

  await step('example.com from the address field; the field follows the page', async () => {
    await go('example.com');
    const state = await waitState('Example Domain', (s) => s.url === 'https://example.com/' && s.title === 'Example Domain' && !s.loading, 30_000);
    let shown = '';
    for (const end = Date.now() + 5000; Date.now() < end && shown !== 'https://example.com/'; await sleep(200)) shown = await address.evaluate((input) => input.value);
    if (shown !== 'https://example.com/') throw new Error(`the field shows ${shown}`);
    if (await waitMirror((frame) => frame.evaluate(() => document.title === 'Example Domain' && /documentation examples/.test(document.body.textContent ?? '')), 10_000) < 0) throw new Error('the page area does not show it');
    return `${state.url} "${state.title}"`;
  });
  await sleep(800);
  await shoot('2-example.png');

  const form = '<input id=f style="position:absolute;left:20px;top:20px;width:300px;height:30px;font:16px sans-serif"><script>f.oninput=()=>document.title="value:"+f.value</script>';
  let pageWidth = 0;
  await step('a page to type into; it is laid out at the page area\'s width', async () => {
    const state = await openPage('the form page', form, 'ready');
    pageWidth = Number(state.title.slice('ready:'.length));
    const here = await mirror().evaluate(() => innerWidth);
    if (Math.abs(here - pageWidth) > 1) throw new Error(`the page is ${pageWidth} css px wide, its area here ${here}`);
    return `${pageWidth} css px, here ${here}`;
  });
  // Right after the strip had the keyboard: the click in the page keeps it, and OpenChamber's chat box gets none.
  await step('a click in the page right after using the strip keeps the keyboard', async () => {
    await mirror().locator('#f').click();
    await sleep(600);
    const where = await page.evaluate(() => document.activeElement?.tagName + (document.activeElement?.getAttribute('title') ? `[${document.activeElement.getAttribute('title')}]` : ''));
    if (!where.startsWith('IFRAME')) throw new Error(`OpenChamber's keyboard is in ${where}`);
    const inPage = await mirror().evaluate(() => document.activeElement?.id);
    if (inPage !== 'f') throw new Error(`the page's keyboard is in ${inPage}`);
    return `OpenChamber: ${where}; the page: #${inPage}`;
  });
  await step('typing shows at once and reaches the page', async () => {
    await page.keyboard.type('cloak', { delay: 40 });
    const local = await mirror().locator('#f').inputValue();
    if (local !== 'cloak') throw new Error(`the field here holds "${local}"`);
    return (await waitState('the typed text', (s) => s.title === 'value:cloak', 10_000)).title;
  });
  await step('pasted Chinese reaches the page', async () => {
    await mirror().evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/plain', ' 浏览器');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    return (await waitState('the pasted text', (s) => s.title === 'value:cloak 浏览器', 10_000)).title;
  });
  await sleep(600);
  await shoot('3-typed.png');
  // With no agent around, who holds control means nothing to someone browsing: the strip says nothing of it.
  await step('just browsing, the strip says nothing about control', async () => {
    await sleep(1500);
    const said = await status();
    if (said === 'You have control' || await panel.locator('.hand-back').isVisible()) throw new Error(`the strip says "${said}" and offers to hand back`);
    return said || '(nothing)';
  });

  // OpenChamber stops a browser provider ten minutes after the agent's last action, whoever is browsing: the
  // service stopped while the panel watches leaves its browser to the next one (browser.ts, handOver).
  const servicePid = () => inContainer(`a="${which.folder}/service/"; b="main.js"; for d in /proc/[0-9]*; do c=$(tr "\\0" " " < $d/cmdline 2>/dev/null) || continue; case "$c" in *node*"$a$b"*) echo \${d#/proc/};; esac; done`).split('\n').filter(Boolean)[0] ?? '';
  await step('the service stopped under the panel: the next one takes the same page over', async () => {
    const before = servicePid();
    if (!before) throw new Error('no service process');
    inContainer(`kill -TERM ${Number(before)}`);
    const back = await waitState('a new service', (s) => s.phase === 'running' && servicePid() && servicePid() !== before, 30_000);
    const kept = await waitMirror((frame) => frame.evaluate(() => document.getElementById('f')?.value === 'cloak 浏览器'), 15_000);
    if (kept < 0) throw new Error('the page lost what was typed');
    if (back.title !== 'value:cloak 浏览器') throw new Error(`the page is "${back.title}"`);
    return `service ${before} → ${servicePid()}; the page still holds "cloak 浏览器"`;
  });

  // AGENTS.md: Command-click (Control here) opens a new tab and leaves the view where it is.
  await step('Control-click on a link opens it in a tab behind; the page stays', async () => {
    const before = await openPage('the link page', '<a href="https://example.com/" style="position:absolute;left:20px;top:20px;font:20px/24px sans-serif">open</a>', 'link');
    await mirror().locator('a').click({ modifiers: ['Control'] });
    const opened = await waitState('a tab behind', (s) => s.tabs.length === before.tabs.length + 1 && s.tabs.some((tab) => tab.url === 'https://example.com/' && !tab.shown), 20_000);
    await sleep(1500);
    const now = await serviceState();
    if (!now.url.startsWith('data:')) throw new Error(`the page moved to ${now.url}`);
    const behind = now.tabs.find((tab) => tab.url === 'https://example.com/' && !tab.shown && !before.tabs.some((each) => each.id === tab.id));
    if (behind) await t.service('POST', '/tabs', { action: 'close', id: behind.id });
    return `${opened.tabs.length} tabs; still showing ${now.title}`;
  });
  await step('Control+T opens a tab and the keyboard goes to the address; Enter opens what was typed', async () => {
    const before = await serviceState();
    await clickPage();
    await page.keyboard.press('Control+t');
    // Typed right away: no key may reach the page while the service opens the tab and the field takes over (before
    // the panel moved the keyboard itself, one in about six runs lost a key here).
    await page.keyboard.type('example.com', { delay: 30 });
    await sleep(500);
    const typed = await address.evaluate((input) => ({ value: input.value, focused: document.activeElement === input }));
    if (!typed.focused || typed.value !== 'example.com') throw new Error(`the field ${typed.focused ? 'has the focus' : 'does not have the focus'} and holds "${typed.value}"`);
    await page.keyboard.press('Enter');
    const state = await waitState('example.com in the new tab', (s) => s.tabs.length === before.tabs.length + 1 && s.url === 'https://example.com/' && !s.loading, 20_000);
    if (await waitMirror((frame) => frame.evaluate(() => document.title === 'Example Domain'), 10_000) < 0) throw new Error('the page area does not show the new tab');
    return `${state.tabs.length} tabs; the new one shows ${state.title}`;
  });
  await sleep(800);
  await shoot('4-tabs.png');
  await step('Control+Tab and Control+W: tabs switch and close from the keyboard', async () => {
    const before = await serviceState();
    const shownAt = before.tabs.findIndex((tab) => tab.shown);
    await clickPage();
    await page.keyboard.press('Control+Tab');
    const next = before.tabs[(shownAt + 1) % before.tabs.length];
    await waitState('the next tab shown', (s) => s.tabs.find((tab) => tab.shown)?.id === next.id, 10_000);
    await sleep(500);
    await page.keyboard.press('Control+w');
    const after = await waitState('that tab closed', (s) => s.tabs.length === before.tabs.length - 1 && !s.tabs.some((tab) => tab.id === next.id), 10_000);
    return `${before.tabs.length} → ${after.tabs.length} tabs; showing ${after.title || after.url}`;
  });
  await step('the strip\'s tabs: + opens one, a click shows one, × closes one', async () => {
    const before = await serviceState();
    await panel.getByRole('button', { name: 'New tab', exact: true }).click();
    await waitState('a new empty tab in front', (s) => s.tabs.length === before.tabs.length + 1 && s.url === 'about:blank', 10_000);
    await address.fill('example.com');
    await address.press('Enter');
    await waitState('example.com in it', (s) => s.url === 'https://example.com/' && !s.loading, 20_000);
    await panel.locator('[role=tab]').first().click();
    const first = await waitState('the first tab shown', (s) => s.tabs[0].shown, 10_000);
    const last = panel.locator('[role=tab]').last();
    await last.hover();
    await last.getByRole('button', { name: /^Close / }).click();
    const after = await waitState('the new tab closed', (s) => s.tabs.length === before.tabs.length, 10_000);
    return `${first.tabs.length} → ${after.tabs.length} tabs`;
  });
  await step('an alert waits over the page; OK answers it', async () => {
    await openPage('the alert page', '<button id=b style="position:absolute;left:20px;top:80px;width:120px;height:30px" onclick="alert(\'hello from the page\');document.title=\'after-alert\'">alert</button>', 'alert');
    await mirror().locator('#b').click();
    const message = panel.locator('.dialog .message');
    await message.waitFor({ timeout: 10_000 });
    const text = await message.innerText();
    if (await panel.getByRole('button', { name: 'Cancel', exact: true }).isVisible()) throw new Error('an alert offers Cancel');
    await sleep(500);
    await shoot('5-alert.png');
    await panel.getByRole('button', { name: 'OK', exact: true }).click();
    await waitState('the page past its alert', (s) => s.title === 'after-alert' && s.dialog === null, 10_000);
    await message.waitFor({ state: 'hidden', timeout: 5000 });
    return `the dialog said "${text}"`;
  });

  // The agent's side: OpenChamber's own browser actions, answered by CloakBrowser.
  await step('Cloak Browser is the Browser provider (Settings → OpenChamber Tools)', async () => {
    providerBefore = (await (await context.request.get(`${base}/api/config/settings`)).json()).browserProvider ?? 'builtin';
    if (providerBefore !== ID) {
      const res = await context.request.put(`${base}/api/config/settings`, { data: { browserProvider: ID } });
      if (!res.ok()) throw new Error(`settings: ${res.status()}`);
    }
    const after = (await (await context.request.get(`${base}/api/config/settings`)).json()).browserProvider;
    if (after !== ID) throw new Error(`browserProvider is ${after}`);
    return `was ${providerBefore}, now ${after}`;
  });
  // The user has just clicked in the page: they hold control (for a minute without input). The agent's first action
  // waits for them, and from then on the strip says so and offers to hand back.
  await step('the agent\'s first action waits for the user, and the strip offers to hand back', async () => {
    let refused = '';
    try {
      await control('browser.snapshot', {});
    } catch (error) {
      refused = error.message;
    }
    if (!/interacting with this page/.test(refused)) throw new Error(`the agent's action ${refused ? `failed otherwise: ${refused.slice(0, 120)}` : 'ran'}`);
    await panel.locator('.hand-back').waitFor({ timeout: 5000 });
    const said = await status();
    await panel.locator('.hand-back button').click();
    await panel.locator('.hand-back').waitFor({ state: 'hidden', timeout: 5000 });
    return `"${said}", then handed back`;
  });
  let agentTab = null;
  await step('browser.open: a tab behind, marked as the agent\'s; the user\'s page stays', async () => {
    const before = await serviceState();
    const data = await control('browser.open', { url: 'https://example.com/' });
    agentTab = data.tabId;
    const after = await serviceState();
    if (after.url !== before.url) throw new Error(`the page moved to ${after.url}`);
    const tab = after.tabs.find((each) => each.id === agentTab);
    if (!tab?.agent || tab.shown) throw new Error(`the agent's tab: ${JSON.stringify(tab)}`);
    await panel.locator('.tab .mark').first().waitFor({ timeout: 5000 });
    return `"${data.title}" settled=${data.settled}; ${after.tabs.length} tabs, the new one marked AI`;
  });
  await step('the strip says the agent is working', async () => {
    await control('browser.snapshot', {});
    await panel.getByText('Agent is working').waitFor({ timeout: 5000 });
    return await status();
  });
  await sleep(500);
  await shoot('6-agent-tab.png');
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
    await panel.locator('.hand-back button').click({ timeout: 2000 }).catch(() => {});
    const shown = state.tabs.find((tab) => tab.shown);
    await control('browser.type', { tabId: shown.id, selector: '#f', value: 'typed by the agent' });
    const typed = (await waitState('the agent\'s text in the user\'s page', (s) => s.title === 'value:typed by the agent', 10_000)).title;
    if (await waitMirror((frame) => frame.evaluate(() => document.getElementById('f')?.value === 'typed by the agent'), 5000) < 0) throw new Error('the page area does not show it');
    return typed;
  });
  await step('the user acts in the page: the agent\'s next action waits for them', async () => {
    await mirror().locator('#f').click();
    await panel.locator('.hand-back').waitFor({ timeout: 5000 });
    let refused = '';
    try {
      await control('browser.snapshot', {});
    } catch (error) {
      refused = error.message;
    }
    if (!/interacting with this page/.test(refused)) throw new Error(`the agent's action ${refused ? `failed otherwise: ${refused.slice(0, 120)}` : 'ran'}`);
    await panel.locator('.hand-back button').click();
    await panel.locator('.hand-back').waitFor({ state: 'hidden', timeout: 5000 });
    await control('browser.snapshot', {});
    return `refused: ${refused.slice(0, 80)}; after handing back it runs`;
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
      const listed = await (await context.request.get(`${base}/api/session/${encodeURIComponent(anchorId)}/message?${where}`, { timeout: 30_000 })).json();
      const messages = (Array.isArray(listed) ? listed : listed.data ?? []).filter((message) => message.type === 'assistant');
      const parts = messages.flatMap((message) => message.content ?? []);
      const calls = parts.filter((part) => part.type === 'tool' && part.name === 'openchamber_web');
      const actions = calls.map((part) => `${part.state?.input?.action}:${part.state?.status}`);
      const reply = (messages[0]?.content ?? []).filter((part) => part.type === 'text').map((part) => part.text).join(' ').replace(/\s+/g, ' ').trim();
      const after = await serviceState();
      const opened = after.tabs.filter((tab) => tab.agent && !before.tabs.some((each) => each.id === tab.id));
      if (!calls.length) throw new Error(`the agent did not call openchamber_web; ${messages.length} answers; said: ${reply.slice(-120)}`);
      if (!opened.some((tab) => tab.url === 'https://example.com/')) throw new Error(`no agent tab at example.com; actions ${actions.join(', ')}; said: ${reply.slice(-120)}`);
      if (!/Example Domain/.test(reply)) throw new Error(`the reply: ${reply.slice(-160)}`);
      await sleep(800);
      await shoot('7-agent-chat.png');
      for (const tab of opened) await t.service('POST', '/tabs', { action: 'close', id: tab.id });
      return `actions ${actions.join(', ')}; ${opened.length} agent tab(s); the reply ends "${reply.slice(-60)}"`;
    });
  }

  await step('leave the browser on Google', async () => {
    await go('google.com');
    return (await waitState('Google', (s) => /google\./.test(s.url) && !s.loading, 30_000)).url;
  });
  results.push({ check: 'no page errors', ok: t.problems.pageErrors.length === 0, s: '', detail: t.problems.pageErrors.join(' | ').slice(0, 200) });
  results.push({ check: 'on the wire', ok: true, s: '', detail: `${Math.round(t.wire.bytes / 1024)} KB in ${t.wire.requests} requests (page ${Math.round(t.wire.eventBytes / 1024)} KB, resources ${Math.round(t.wire.resourceBytes / 1024)} KB, input ${t.wire.inputs})` });
} catch (error) {
  results.push({ check: 'run', ok: false, s: '', detail: String(error?.message ?? error).slice(0, 200) });
} finally {
  if (t) {
    // The Browser provider as it was (a temporary copy is about to go).
    if (providerBefore !== null && providerBefore !== t.which.id) {
      await t.context.request.put(`${t.base}/api/config/settings`, { data: { browserProvider: providerBefore } }).catch(() => {});
    }
    if (anchorId) await t.context.request.delete(`${t.base}/api/session/${encodeURIComponent(anchorId)}?directory=${encodeURIComponent(anchorFolder)}`).catch(() => {});
    try {
      execFileSync('docker', ['exec', CONTAINER, 'rm', '-rf', SCRATCH]);
    } catch {
      // nothing saved
    }
    await t.close();
  }
}
console.table(results);
const passed = results.filter((result) => result.ok && result.check !== 'on the wire').length;
const total = results.filter((result) => result.check !== 'on the wire').length;
console.log(`${passed === total ? 'PASS' : 'FAIL'} ${passed}/${total} Cloak Browser in the dev OpenChamber; screenshots in ${out}`);
process.exit(passed === total ? 0 : 1);
