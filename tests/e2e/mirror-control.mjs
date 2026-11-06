// Who works in the browser, and the browser outliving its service, end to end in dev (temporary copy):
// 1. The agent acts: the strip says "Agent is working". The user clicks in the page: "You have control" with "Hand
//    back to agent", and the agent's next action is refused with OpenChamber's words. A second window sees "Another
//    device has control" and its click does not reach the page. Hand back: the agent's action runs again.
// 2. The service is stopped (SIGTERM, as OpenChamber's idle stop does) while the panel watches: the next service takes
//    the same browser over, so the page keeps what was typed into it and its script keeps counting.
// 3. Stopped with no panel watching: the browser goes with it.
// Always on a temporary copy (it stops the service): the Cloak Browser dev runs is untouched.
// Usage (holding the dev e2e lock): node tests/e2e/mirror-control.mjs
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { CONTAINER, log, openPanel, serveInContainer, sleep } from './mirror-lib.mjs';

const OUT = '/tmp/opencode/cloak-browser-e2e/mirror-control';
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>control test</title><style>body{font:16px sans-serif;margin:16px}input,button{font:inherit;display:block;margin:6px 0}</style></head>
<body><input id="name" autocomplete="off"><button id="btn">Click me</button><p>clicks: <span id="clicks">0</span> · ticks: <span id="ticks">0</span> · started: <span id="started"></span></p>
<script>
let clicks = 0, ticks = 0;
document.getElementById('started').textContent = String(Date.now());
document.getElementById('btn').addEventListener('click', () => { clicks += 1; document.getElementById('clicks').textContent = String(clicks); });
setInterval(() => { ticks += 1; document.getElementById('ticks').textContent = String(ticks); }, 500);
</script></body></html>`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sh = (command) => execFileSync('docker', ['exec', CONTAINER, 'sh', '-c', command], { encoding: 'utf8' }).trim();
const servicePid = () => sh("for p in /proc/[0-9]*; do c=$(tr '\\0' ' ' < $p/cmdline 2>/dev/null); case \"$c\" in *cloak-html-test/service/main.js*) echo ${p#/proc/};; esac; done | head -1");
const browserPids = () => sh("for p in /proc/[0-9]*; do c=$(tr '\\0' ' ' < $p/cmdline 2>/dev/null); case \"$c\" in *oc-forge-cloak-html-test/profile*--headless*|*--headless*oc-forge-cloak-html-test/profile*) case \"$c\" in *--type=*) ;; *) echo ${p#/proc/};; esac;; esac; done").split('\n').filter(Boolean);
let seq = 0;
const agent = (t, action = 'browser.snapshot', parameters = {}) => t.service('POST', '/browser-control', { requestId: `test-${seq += 1}`, action, parameters, context: { directory: null, sessionId: null } });

const site = serveInContainer('control', PAGE);
const t = await openPanel({ temp: true, out: OUT });
const status = () => t.panel.locator('.status').textContent();
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  await t.go(site.url);
  check('the test page shows', await t.waitMirror((frame) => frame.evaluate(() => document.title === 'control test'), 30_000) >= 0);
  const mirror = () => t.mirrorFrame();
  const text = (id) => mirror().evaluate((which) => document.getElementById(which)?.textContent ?? '', id);

  // 1. The agent, the user, another window.
  const first = await agent(t);
  check('the agent\'s action runs', first.ok === true, JSON.stringify(first).slice(0, 120));
  await sleep(1500);
  check('the strip says the agent is working', (await status()) === 'Agent is working', await status());
  await mirror().locator('#btn').click();
  await sleep(1500);
  check('a click in the page gives the user control', (await status()) === 'You have control', await status());
  check('… with "Hand back to agent"', await t.panel.locator('.hand-back').isVisible());
  const refused = await agent(t);
  check('the agent\'s action is refused while the user has control', refused.ok === false && /interacting with this page/.test(refused.error ?? ''), JSON.stringify(refused).slice(0, 140));

  const other = await t.context.newPage();
  await other.goto(`${t.base}/`);
  const rail = other.locator(`button[data-context-surface="plugin:${t.which.id}"]`).first();
  await rail.waitFor({ timeout: 30_000 });
  for (let attempt = 0; attempt < 3 && (await rail.getAttribute('aria-pressed')) !== 'true'; attempt += 1) {
    await rail.click();
    await other.waitForTimeout(1500);
  }
  const otherPanel = other.frameLocator(`iframe[title="${t.which.name}"]`).first();
  const otherMirror = () => other.frames().find((frame) => frame.url() === 'about:srcdoc' && frame.parentFrame()?.parentFrame());
  for (let i = 0; i < 100 && !(await otherMirror()?.evaluate(() => document.title === 'control test').catch(() => false)); i += 1) await sleep(100);
  await sleep(1200);
  check('another window sees that another device has control', (await otherPanel.locator('.status').textContent()) === 'Another device has control', await otherPanel.locator('.status').textContent());
  const before = await text('clicks');
  await otherMirror().locator('#btn').click();
  await sleep(1500);
  check('… and its click does not reach the page', (await text('clicks')) === before, `${before} → ${await text('clicks')}`);
  await other.close();

  await t.panel.locator('.hand-back button').click();
  await sleep(1200);
  check('after "Hand back to agent" the user no longer has control', !(await t.panel.locator('.hand-back').isVisible()) && (await status()) !== 'You have control', await status());
  const again = await agent(t);
  check('… and the agent\'s action runs again', again.ok === true);

  // 2. The service stops while the panel watches: the next one takes the browser over.
  await mirror().locator('#name').click();
  await t.page.keyboard.type('kept across', { delay: 20 });
  await mirror().locator('#btn').click();
  await sleep(1500);
  const started = await text('started');
  const ticksBefore = Number(await text('ticks'));
  const browsersBefore = browserPids();
  const pidBefore = servicePid();
  log('service', pidBefore, 'browser', browsersBefore.join(','));
  sh(`kill -TERM ${pidBefore}`);
  // The panel's next request starts a new service; it takes the browser over and the page comes back.
  const back = await t.waitMirror(async (frame) => {
    const pid = servicePid();
    return pid && pid !== pidBefore && (await frame.evaluate(() => document.title === 'control test' && Number(document.getElementById('ticks').textContent) > 0));
  }, 30_000);
  await sleep(2000);
  const pidAfter = servicePid();
  const browsersAfter = browserPids();
  log('service', pidAfter, 'browser', browsersAfter.join(','));
  check('a new service runs after the stop', back >= 0 && pidAfter && pidAfter !== pidBefore, `${pidBefore} → ${pidAfter} in ${back} ms`);
  check('it took the same browser over', browsersBefore.length === 1 && browsersAfter.length === 1 && browsersAfter[0] === browsersBefore[0], `${browsersBefore} → ${browsersAfter}`);
  check('the page kept its state: not loaded again, still counting', (await text('started')) === started && Number(await text('ticks')) > ticksBefore, `started ${started} → ${await text('started')}, ticks ${ticksBefore} → ${await text('ticks')}`);
  check('… and what was typed into it', (await mirror().locator('#name').inputValue()) === 'kept across', await mirror().locator('#name').inputValue());
  await t.shoot(join(OUT, 'after-handover.png'));

  // 3. Stopped with no panel watching: the browser goes too.
  await t.page.close();
  log('waiting for the panel to count as gone (20 s)');
  await sleep(22_000);
  const browsersLast = browserPids();
  sh(`kill -TERM ${servicePid()}`);
  await sleep(4000);
  check('stopped with no panel watching, the browser goes with the service', browsersLast.length === 1 && browserPids().length === 0, `${browsersLast} → ${browserPids()}`);
} finally {
  await t.close();
  site.stop();
}
const failed = results.filter((result) => !result.ok);
log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
