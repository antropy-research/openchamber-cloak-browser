// Whether the panel lays a page out where the page has it, and gets what the page's script adds later. A page served
// in the container, its text in Arial (the same file on both sides: Liberation Sans, so fonts play no part), has:
// - long paragraphs, each followed by a heading. The browser's scroll bar takes 15 px of its window; where the
//   panel's takes less (floating, as on a Mac, or hidden, as in this journey's window) the panel lays the content out
//   in the page's width (frame.ts, fitWidth);
// - far below the view, an image with no size of its own, then a heading. The panel fetches an image only as it comes
//   near the view; meanwhile a blank picture of the image's own size stands in (hintSize), so what follows sits where
//   it does in the page;
// - a style sheet link whose address the script sets later, and a preload the script makes a style sheet (nothing
//   else changes the head's children afterwards: a new child list there would carry the sheet along);
// - a style sheet the script adds that its server is slow to give: the service waits for the page's copy instead of
//   fetching it a second time (the server counts the requests);
// - a style sheet the script adds whose server stops halfway for a second: the panel gets it whole (the browser's copy
//   of a sheet still loading is only its first half, and a half kept would stay for the session);
// - an image the script adds whose first request from the panel fails on its way (this journey cuts OpenChamber's
//   request, as a service starting again does): asked for again, it shows;
// - custom elements styled by :defined, one the page defines at once, one a second later, one never: the panel defines
//   a name only once the page has.
// Always on a temporary copy. Usage (holding the dev e2e lock): node tests/e2e/mirror-layout.mjs
import { crc32, deflateSync } from 'node:zlib';

import { checker, log, openPanel, serveFiles, sleep } from './mirror-lib.mjs';

const OUT = '/tmp/opencode/cloak-browser-e2e/mirror-layout';

/** A PNG of one colour. */
const png = (width, height, [r, g, b]) => {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([r, g, b], 1 + x * 3);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
};

// Paragraphs of different lengths, so that some line breaks fall within the 15 px a scroll bar takes.
const WORDS = 'the quick brown fox jumps over a lazy dog while wizards jinx gnomes before they vaporize into thin air'.split(' ');
const paragraph = (seed) => Array.from({ length: 40 + (seed * 7) % 60 }, (_, i) => WORDS[(seed * 13 + i * 7) % WORDS.length]).join(' ');
const BASE_CSS = `body { margin: 16px; font-family: Arial, sans-serif; font-size: 15px; }
h2 { margin: 8px 0; font-size: 15px; }
img.big { display: block; max-width: 100%; }
#retry { position: fixed; top: 0; right: 0; width: 20px; height: 20px; }
my-box, later-box, plain-box { display: block; height: 10px; }
my-box:defined, later-box:defined, plain-box:defined { height: 50px; }`;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>layout test</title>
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" id="late">
<link rel="preload" as="style" id="preload" href="/late2.css">
</head><body>
${Array.from({ length: 30 }, (_, i) => `<p>${paragraph(i + 1)}</p><h2 class="probe">heading ${i + 1}</h2>`).join('\n')}
<img class="big" src="/big.png" alt="">
<p>after the image</p><h2 class="probe">after the image</h2>
<p class="late1">styled by a sheet whose address the script sets</p>
<p class="late2">styled by a preload the script makes a sheet</p>
<p class="slow">styled by a sheet its server is slow to give</p>
<p class="halves">styled by the second half of a sheet its server stops halfway through</p>
<my-box id="defined">defined at once</my-box>
<later-box id="later">defined a second later</later-box>
<plain-box id="plain">never defined</plain-box>
<script>
customElements.define('my-box', class extends HTMLElement {});
setTimeout(() => { document.getElementById('late').href = '/late1.css'; }, 300);
setTimeout(() => { document.getElementById('preload').rel = 'stylesheet'; }, 600);
setTimeout(() => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/slow.css'; document.body.append(link); }, 1000);
setTimeout(() => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/halves.css'; document.body.append(link); }, 1200);
setTimeout(() => customElements.define('later-box', class extends HTMLElement {}), 1500);
setTimeout(() => { const image = document.createElement('img'); image.id = 'retry'; image.alt = ''; image.src = '/retry.png'; document.body.append(image); }, 2000);
</script>
</body></html>`;

const { check, results } = checker();
const site = serveFiles({
  '/layout': { type: 'text/html; charset=utf-8', body: PAGE },
  '/base.css': { type: 'text/css', body: BASE_CSS },
  '/late1.css': { type: 'text/css', body: '.late1 { color: rgb(0, 128, 0); }' },
  '/late2.css': { type: 'text/css', body: '.late2 { color: rgb(0, 0, 255); }' },
  '/slow.css': { type: 'text/css', body: '.slow { color: rgb(128, 0, 128); }', delay: 1200 },
  // The first half: rules enough to be a few kilobytes, sent at once; the second, the one that matters, a second later.
  '/halves.css': { type: 'text/css', gap: 1000, chunks: [Array.from({ length: 200 }, (_, i) => `.pad-${i} { margin: ${i}px; }`).join('\n'), '\n.halves { color: rgb(0, 0, 160); }\n'] },
  '/big.png': { type: 'image/png', body: png(600, 900, [200, 220, 240]) },
  '/retry.png': { type: 'image/png', body: png(20, 20, [255, 0, 0]) },
}, 39130);
const t = await openPanel({ temp: true, out: OUT });
// The panel's first request for /retry.png is cut on its way, as when the service is starting again.
let cut = 0;
await t.page.route('**/service/request', (route) => {
  const body = route.request().postData() ?? '';
  if (!cut && body.includes('/mirror/resources') && body.includes('retry.png')) {
    cut += 1;
    return route.abort();
  }
  return route.continue();
});
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  await t.go(`${site.base}/layout`);
  const shown = await t.waitMirror((frame) => frame.evaluate(() => document.title === 'layout test'), 20_000);
  check('the page shows', shown >= 0, `${shown} ms`);
  const mirror = () => t.mirrorFrame();
  const pageRects = async (selector) => (await t.service('GET', `/mirror/rects?selector=${encodeURIComponent(selector)}`)).rects ?? [];
  const color = (selector) => mirror().evaluate((which) => getComputedStyle(document.querySelector(which)).color, selector);

  // What the script adds later, each waited for.
  const late1 = await t.waitMirror(async () => (await color('.late1')) === 'rgb(0, 128, 0)', 8000);
  check('a style sheet whose address the page\'s script sets later applies', late1 >= 0, await color('.late1'));
  const late2 = await t.waitMirror(async () => (await color('.late2')) === 'rgb(0, 0, 255)', 8000);
  check('a preload the page\'s script makes a style sheet applies', late2 >= 0, await color('.late2'));
  const slow = await t.waitMirror(async () => (await color('.slow')) === 'rgb(128, 0, 128)', 10_000);
  const slowAsked = site.requests().filter((path) => path === '/slow.css').length;
  check('a style sheet its server is slow to give applies, fetched once (the page\'s copy)', slow >= 0 && slowAsked === 1, `${await color('.slow')}; the server gave it ${slowAsked} time(s)`);
  const halves = await t.waitMirror(async () => (await color('.halves')) === 'rgb(0, 0, 160)', 8000);
  check('a style sheet its server stops halfway through arrives whole', halves >= 0, await color('.halves'));
  const retried = await t.waitMirror((frame) => frame.evaluate(() => {
    const image = document.getElementById('retry');
    return !!image && image.src.startsWith('blob:') && image.complete && image.naturalWidth === 20;
  }), 12_000);
  check('an image whose first request was cut on its way shows once asked for again', cut === 1 && retried >= 0, `${cut} request(s) cut; ${retried < 0 ? 'never shown' : `shown ${retried} ms after the wait began`}`);

  // The layout, with everything in.
  await sleep(1000);
  const pageHtml = (await pageRects('html'))[0];
  const page = await pageRects('.probe');
  const here = await mirror().evaluate(() => {
    const image = document.querySelector('img.big');
    return {
      html: document.documentElement.getBoundingClientRect().width,
      window: document.documentElement.clientWidth,
      tops: [...document.querySelectorAll('.probe')].map((element) => Math.round((element.getBoundingClientRect().top + scrollY) * 10) / 10),
      image: { fetched: image.src.startsWith('blob:'), height: Math.round(image.getBoundingClientRect().height) },
    };
  });
  const deltas = page.map((rect, index) => Math.round(Math.abs(rect[0] - (here.tops[index] ?? NaN)) * 10) / 10);
  const before = Math.max(...deltas.slice(0, 30));
  log(`the page's content ${pageHtml?.[2]} px wide, the panel's ${here.html} px (its window ${here.window} px); headings off by up to ${before} px before the image, ${deltas[30]} px after it; the image here ${JSON.stringify(here.image)}`);
  check('the panel lays the content out in the page\'s width', Math.abs((pageHtml?.[2] ?? 0) - here.html) <= 1, `${pageHtml?.[2]} / ${here.html}`);
  check('every heading where the page has it (within 1 px)', deltas.length === 31 && before <= 1, `largest difference ${before} px`);
  check('… and the one after an image the panel has not fetched yet (far below)', !here.image.fetched && deltas[30] <= 1, `${deltas[30]} px; the image ${here.image.fetched ? 'was fetched already: it should be further down' : `not fetched, ${here.image.height} px high`}`);

  // Custom elements, in the page and here.
  const boxes = async () => ({
    page: (await pageRects('#defined, #later, #plain')).map((rect) => Math.round(rect[3])),
    here: await mirror().evaluate(() => ['defined', 'later', 'plain'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().height))),
  });
  const settled = await t.waitMirror(async () => {
    const now = await boxes();
    return now.page.join() === '50,50,10' && now.here.join() === now.page.join();
  }, 6000);
  const final = await boxes();
  check('custom elements are :defined here exactly when they are in the page (at once, a second later, never)', settled >= 0, `heights in the page ${final.page.join('/')} px, here ${final.here.join('/')} px`);
  await t.shoot(`${OUT}/layout.png`);
} finally {
  await t.page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  await t.close();
  site.stop();
}
const [passed, total] = results();
log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
