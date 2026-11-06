// The html mirror's pictures of what HTML cannot carry, end to end in dev: a canvas that animates and a frame from
// another origin (another port) in a test page served in the container. Checks that both stand-ins show pictures,
// that the canvas's picture moves, and that a click on a button inside the other origin's frame reaches it (the page
// writes what the frame told it). Usage (holding the dev e2e lock): node tests/e2e/mirror-patches.mjs [--installed]
import { join } from 'node:path';

import { log, openPanel, serveInContainer, sleep } from './mirror-lib.mjs';

const OUT = '/tmp/opencode/cloak-browser-e2e/mirror-patches';
const INNER = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#ffd400;font:20px sans-serif}button{font:inherit;margin:40px 60px;padding:10px 20px}</style></head>
<body><button id="b">inner button</button><script>document.getElementById('b').addEventListener('click',(e)=>{document.body.style.background='#7fd';parent.postMessage('inner clicked '+(e.isTrusted?'trusted':'untrusted'),'*');});</script></body></html>`;
const OUTER = `<!doctype html><html><head><meta charset="utf-8"><title>patch test</title><style>body{font:16px sans-serif;margin:16px}canvas,iframe{display:block;margin:8px 0}iframe{border:2px solid #333}</style></head>
<body><p>canvas:</p><canvas id="c" width="300" height="150"></canvas>
<p>frame from another origin:</p><iframe id="f" src="http://127.0.0.1:39124/inner" width="360" height="160"></iframe>
<p id="said">nothing yet</p>
<script>
const c = document.getElementById('c').getContext('2d');
let n = 0;
const draw = () => { n += 1; c.fillStyle = ['#e33','#3a3','#33e'][Math.floor(n / 20) % 3]; c.fillRect(0, 0, 300, 150); c.fillStyle = '#fff'; c.font = '28px sans-serif'; c.fillText('frame ' + n, 20, 80); requestAnimationFrame(draw); };
draw();
window.addEventListener('message', (e) => { document.getElementById('said').textContent = String(e.data); });
</script></body></html>`;

const FULL = `<!doctype html><html><head><meta charset="utf-8"><title>full canvas</title><style>html,body{margin:0;overflow:hidden}canvas{position:fixed;inset:0;width:100vw;height:100vh;display:block}</style></head>
<body><canvas id="c"></canvas><div id="said" hidden></div><div id="keys" hidden></div>
<script>
const canvas = document.getElementById('c');
const fit = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
fit(); addEventListener('resize', fit);
const c = canvas.getContext('2d'); let n = 0;
const draw = () => { n += 1; c.fillStyle = '#222'; c.fillRect(0, 0, canvas.width, canvas.height); c.fillStyle = '#0c0'; c.fillRect(80, 80, 40, 40); c.fillStyle = '#fff'; c.font = '20px sans-serif'; c.fillText('map ' + n, 140, 110); requestAnimationFrame(draw); };
draw();
canvas.addEventListener('click', (e) => { document.getElementById('said').textContent = 'clicked ' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + (e.isTrusted ? ' trusted' : ''); });
addEventListener('keydown', (e) => { document.getElementById('keys').textContent += e.key; });
</script></body></html>`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const inner = serveInContainer('inner', INNER, 39124);
const full = serveInContainer('fullcanvas', FULL, 39125);
const outer = serveInContainer('patches', OUTER, 39123);
const t = await openPanel({ temp: !process.argv.includes('--installed'), out: OUT });
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  await t.go(outer.url);
  const shown = await t.waitMirror((frame) => frame.evaluate(() => document.title === 'patch test'), 30_000);
  check('the test page shows', shown >= 0, `${shown} ms`);
  const mirror = () => t.mirrorFrame();
  const background = (selector) => mirror().evaluate((which) => getComputedStyle(document.querySelector(which)).backgroundImage, selector);
  const canvasPictured = await t.waitMirror(async (frame) => (await frame.evaluate(() => getComputedStyle(document.querySelector('canvas')).backgroundImage)).startsWith('url("blob:'), 5000);
  check('the canvas shows a picture', canvasPictured >= 0, `${canvasPictured} ms`);
  const first = await background('canvas');
  await sleep(1200);
  const second = await background('canvas');
  check('the canvas\'s picture moves', first !== second);
  const framePictured = await t.waitMirror(async (frame) => (await frame.evaluate(() => getComputedStyle(document.querySelector('iframe')).backgroundImage)).startsWith('url("blob:'), 5000);
  check('the other origin\'s frame shows a picture', framePictured >= 0, `${framePictured} ms`);
  await sleep(500);
  await t.shoot(join(OUT, 'patches.png'));

  // A click on the inner button: on the stand-in, mapped into the page's frame.
  const box = await mirror().locator('iframe').boundingBox();
  await t.page.mouse.click(box.x + 60 + 2 + 70, box.y + 40 + 2 + 20);
  const said = await t.waitMirror(async (frame) => (await frame.evaluate(() => document.getElementById('said').textContent)) === 'inner clicked trusted', 5000);
  check('a click on the pictured frame reaches the button in it, trusted', said >= 0, await mirror().evaluate(() => document.getElementById('said').textContent));
  const before = await background('iframe');
  const after = await t.waitMirror(async (frame) => (await frame.evaluate(() => getComputedStyle(document.querySelector('iframe')).backgroundImage)) !== before, 4000);
  check('the frame\'s picture shows what the click changed', after >= 0);
  await sleep(500);
  await t.shoot(join(OUT, 'patches-after.png'));
  // A page that is all canvas: shown as a picture, and input on the picture reaches it.
  await t.go(full.url);
  const panelFrame = () => t.panelFrame();
  const pictureShown = () => panelFrame()?.evaluate(() => {
    const picture = document.querySelector('.picture');
    return !!picture && !picture.hidden && (picture.querySelector('img')?.src ?? '').startsWith('blob:');
  });
  const became = await t.waitMirror(async (frame) => (await frame.evaluate(() => document.title)) === 'full canvas' && await pictureShown(), 10_000);
  check('a page that is all canvas is shown as a picture', became >= 0, `${became} ms`);
  await sleep(800);
  await t.shoot(join(OUT, 'picture.png'));
  const pictureBox = await t.panel.locator('.picture').boundingBox();
  await t.page.mouse.click(pictureBox.x + 100, pictureBox.y + 100);
  const clicked = await t.waitMirror(async (frame) => /^clicked (9[8-9]|10[0-2]),(9[8-9]|10[0-2]) trusted$/.test(await frame.evaluate(() => document.getElementById('said').textContent)), 5000);
  check('a click on the picture lands where it was made, trusted', clicked >= 0, await t.mirrorFrame().evaluate(() => document.getElementById('said').textContent));
  await t.page.keyboard.type('ab');
  const keyed = await t.waitMirror(async (frame) => (await frame.evaluate(() => document.getElementById('keys').textContent)) === 'ab', 5000);
  check('keys on the picture reach the page', keyed >= 0, await t.mirrorFrame().evaluate(() => document.getElementById('keys').textContent));
  const toggle = t.panel.locator('button[aria-label="Show the page as HTML"]');
  await toggle.click();
  const html = await t.waitMirror(async () => !(await pictureShown()), 3000);
  check('the strip\'s button shows the page as HTML again', html >= 0);
  await t.panel.locator('button[aria-label="Show the page as a picture"]').click();
  const again = await t.waitMirror(async () => await pictureShown(), 3000);
  check('… and as a picture again', again >= 0);
  await t.go(outer.url);
  const back = await t.waitMirror(async (frame) => (await frame.evaluate(() => document.title)) === 'patch test' && !(await pictureShown()), 10_000);
  check('the next page starts as HTML again', back >= 0);

  log('wire', JSON.stringify(t.wire), 'console: CSP refusals', t.problems.csp, 'other', t.problems.other.filter((line) => !line.includes('source-control')).length);
  for (const line of t.problems.other.filter((each) => !each.includes('source-control') && !each.includes('422')).slice(0, 10)) log('  ', line);
} finally {
  await t.close();
  outer.stop();
  inner.stop();
  full.stop();
}
const failed = results.filter((result) => !result.ok);
log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
