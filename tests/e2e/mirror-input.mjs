// The html mirror's input, end to end in dev: a test page served in the container shows its own state (trusted
// clicks, Enter, a select, a box, wheel events, its scroll position, the focused element), and the mirror shows that
// state back, so each check reads the real page through the mirror. --installed: the Cloak Browser dev runs instead
// of a temporary copy of this checkout's build.
// Usage (holding the dev e2e lock): node tests/e2e/mirror-input.mjs [--installed]
import { join } from 'node:path';

import { log, openPanel, serveInContainer, sleep } from './mirror-lib.mjs';

const OUT = '/tmp/opencode/cloak-browser-e2e/mirror-input';
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>input test</title>
<style>body{font:16px/1.4 sans-serif;margin:0;padding:16px} input,textarea,select,button{font:inherit;margin:4px 0;display:block} .tall{height:3000px;background:linear-gradient(#fff,#ccf)} #log{white-space:pre;border:1px solid #ccc;min-height:3em}</style></head>
<body>
<input id="name" placeholder="name" autocomplete="off">
<textarea id="notes"></textarea>
<select id="pick"><option>one</option><option>two</option><option>three</option></select>
<label><input type="checkbox" id="box"> box</label>
<button id="btn">Click me</button>
<p>clicks: <span id="clicks">0</span> · wheels: <span id="wheels">0</span> · y: <span id="pos">0</span> · focus: <span id="focus">none</span></p>
<div id="log"></div>
<div class="tall"></div>
<p id="bottom">bottom</p>
<script>
const $ = (id) => document.getElementById(id);
const note = (s) => { $('log').textContent += s + '\\n'; };
let clicks = 0, wheels = 0;
$('btn').addEventListener('click', (e) => { clicks += 1; $('clicks').textContent = clicks + (e.isTrusted ? ' trusted' : ' untrusted'); });
$('pick').addEventListener('change', (e) => note('pick ' + e.target.value));
$('box').addEventListener('change', (e) => note('box ' + e.target.checked + (e.isTrusted ? ' trusted' : ' untrusted')));
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') note('enter [' + e.target.value + ']' + (e.isTrusted ? ' trusted' : ' untrusted')); });
window.addEventListener('wheel', () => { wheels += 1; $('wheels').textContent = String(wheels); }, { passive: true });
window.addEventListener('scroll', () => { $('pos').textContent = String(Math.round(scrollY)); }, { passive: true });
document.addEventListener('focusin', (e) => { $('focus').textContent = e.target.id || e.target.tagName; });
</script></body></html>`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const text = (frame, id) => frame.evaluate((which) => document.getElementById(which)?.textContent ?? null, id);

const site = serveInContainer('input', PAGE);
const t = await openPanel({ temp: !process.argv.includes('--installed'), out: OUT });
const { page } = t;
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  await t.go(site.url);
  const shown = await t.waitMirror((frame) => frame.evaluate(() => document.title === 'input test' && !!document.getElementById('btn')), 30_000);
  check('the test page shows in the mirror', shown >= 0, `${shown} ms`);
  const mirror = () => t.mirrorFrame();
  const at = (selector) => mirror().locator(selector);

  // A click on the button: a trusted click in the page, shown back.
  await at('#btn').click();
  const clicked = await t.waitMirror(async (frame) => (await text(frame, 'clicks')) === '1 trusted', 5000);
  check('click lands on the button, trusted', clicked >= 0, await text(mirror(), 'clicks'));

  // Typing: shown here at once, and in the page (Enter writes the page's own value into its log).
  await at('#name').click();
  await page.keyboard.type('hello wörld', { delay: 25 });
  check('typing shows in the mirror at once', (await at('#name').inputValue()) === 'hello wörld', await at('#name').inputValue());
  await page.keyboard.insertText(' 中文');
  await page.keyboard.press('Enter');
  const entered = await t.waitMirror(async (frame) => (await text(frame, 'log'))?.includes('enter [hello wörld 中文] trusted'), 5000);
  check('the page got the typing, text with no key too, and a trusted Enter', entered >= 0, JSON.stringify(await text(mirror(), 'log')));

  // An input method: composition here, the committed text in the page.
  const cdp = await t.context.newCDPSession(page);
  await page.keyboard.press('End');
  await cdp.send('Input.imeSetComposition', { text: 'zhong', selectionStart: 5, selectionEnd: 5 });
  await sleep(150);
  await cdp.send('Input.insertText', { text: '中' });
  await sleep(150);
  await page.keyboard.press('Enter');
  const composed = await t.waitMirror(async (frame) => (await text(frame, 'log'))?.includes('enter [hello wörld 中文中] trusted'), 5000);
  check('a composition reaches the page as its committed text', composed >= 0, JSON.stringify(await text(mirror(), 'log')));

  // Tab: the page moves its focus, and the mirror's follows.
  await page.keyboard.press('Tab');
  const tabbed = await t.waitMirror(async (frame) => (await text(frame, 'focus')) === 'notes' && (await frame.evaluate(() => document.activeElement?.id)) === 'notes', 5000);
  check('Tab moves the page\'s focus, and the mirror follows', tabbed >= 0, `${await text(mirror(), 'focus')} / ${await mirror().evaluate(() => document.activeElement?.id)}`);

  // A checkbox: the page toggles it (trusted), the mirror shows its state.
  await at('#box').click();
  const boxed = await t.waitMirror(async (frame) => (await text(frame, 'log'))?.includes('box true trusted') && (await frame.evaluate(() => document.getElementById('box').checked)), 5000);
  check('a checkbox click toggles the page\'s box, and the mirror shows it', boxed >= 0);

  // A select: picked in the mirror's own list, set in the page.
  await at('#pick').selectOption('two');
  const picked = await t.waitMirror(async (frame) => (await text(frame, 'log'))?.includes('pick two'), 5000);
  check('a select picked in the mirror is picked in the page', picked >= 0);

  // The wheel: the mirror scrolls at once, the page gets wheel events and the same position.
  const box = await t.panelElement.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 100);
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, 100);
    await sleep(30);
  }
  await sleep(1500);
  const mirrorY = await mirror().evaluate(() => Math.round(scrollY));
  const pageY = Number(await text(mirror(), 'pos'));
  const wheels = Number(await text(mirror(), 'wheels'));
  check('the wheel scrolls the mirror and the page alike', mirrorY > 300 && Math.abs(mirrorY - pageY) <= 2 && wheels > 0, `mirror ${mirrorY}, page ${pageY}, wheel events ${wheels}`);

  // A scroll the page got no input for (find in page does this): the page follows the mirror.
  await mirror().evaluate(() => document.getElementById('bottom').scrollIntoView());
  await sleep(1500);
  const mirrorY2 = await mirror().evaluate(() => Math.round(scrollY));
  const pageY2 = Number(await text(mirror(), 'pos'));
  check('a scroll with no input of its own moves the page too', mirrorY2 > 2000 && Math.abs(mirrorY2 - pageY2) <= 2, `mirror ${mirrorY2}, page ${pageY2}`);
  await t.shoot(join(OUT, 'input.png'));

  // Keys that would act on OpenChamber's window stay here: Control+R reloads the Cloak page, not OpenChamber.
  await page.evaluate(() => { window.__notReloaded = true; });
  await mirror().locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Control+r');
  const reloaded = await t.waitMirror(async (frame) => (await text(frame, 'clicks')) === '0' && (await text(frame, 'log')) === '', 10_000);
  check('Control+R reloads the page in Cloak Browser', reloaded >= 0);
  check('… and not OpenChamber', await page.evaluate(() => window.__notReloaded === true));

  // mod+L: the address field takes the keyboard.
  await mirror().locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Control+l');
  await sleep(1200);
  const focusedAddress = await t.panelFrame()?.evaluate(() => document.activeElement?.getAttribute('placeholder'));
  check('Control+L gives the address field the keyboard', focusedAddress === 'Search Google or type a URL', String(focusedAddress));

  log('wire', JSON.stringify(t.wire), 'console: CSP refusals', t.problems.csp, 'other', t.problems.other.length);
  for (const line of t.problems.other.slice(0, 10)) log('  ', line);
} finally {
  await t.close();
  site.stop();
}
const failed = results.filter((result) => !result.ok);
log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
