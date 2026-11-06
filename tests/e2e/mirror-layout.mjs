// Whether the panel lays a page out as the browser does. The browser's fonts are its own (the container's: Noto, Liberation);
// the window showing the panel has others. A page served in the container sets text in the font-families pages use
// (a system stack in a custom property, sans-serif, the font shorthand, Georgia, monospace, none at all), each followed
// by a heading, and places a marker below a block by the block's height as its own script measured it (as a virtual
// list does). The journey compares where the page and the panel have the headings, and the marker's gap in the panel.
// In a Chromium-based window the panel draws with the browser's fonts (frame-fonts.ts): they should agree. With
// --as-firefox the window says it is Firefox: the panel keeps its own fonts (the page as HTML of phase 1), and they
// do not. Always on a temporary copy. Usage (holding the dev e2e lock): node tests/e2e/mirror-layout.mjs [--as-firefox]
import { checker, log, openPanel, serveInContainer, sleep } from './mirror-lib.mjs';

const firefox = process.argv.includes('--as-firefox');
const TEXT = 'The quick brown fox jumps over the lazy dog while a wizard quickly jinxes the gnomes before they vaporize. '.repeat(12);
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>layout test</title>
<style>
:root { --stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
body { margin: 16px; width: 560px; }
.system { font-family: var(--stack); font-size: 15px; }
.sans { font-family: sans-serif; font-size: 15px; }
.short { font: 15px/1.4 Verdana, Geneva, sans-serif; }
.georgia { font-family: Georgia, serif; font-size: 16px; }
.mono { font-family: monospace; font-size: 13px; }
h2 { margin: 8px 0; font-size: 14px; }
#block { font-family: sans-serif; font-size: 15px; }
#marker { position: absolute; left: 16px; width: 40px; height: 4px; background: red; }
</style></head><body>
<p class="system">${TEXT}</p><h2 class="probe">after the system stack</h2>
<p class="sans">${TEXT}</p><h2 class="probe">after sans-serif</h2>
<p class="short">${TEXT}</p><h2 class="probe">after the shorthand</h2>
<p class="georgia">${TEXT}</p><h2 class="probe">after Georgia</h2>
<p class="mono">${TEXT}</p><h2 class="probe">after monospace</h2>
<p>${TEXT}</p><h2 class="probe">after the default</h2>
<div id="block">${TEXT}</div><div id="marker"></div>
<script>
const block = document.getElementById('block').getBoundingClientRect();
document.getElementById('marker').style.top = Math.round(block.bottom + scrollY) + 'px';
</script></body></html>`;

const { check, results } = checker();
const site = serveInContainer('layout', PAGE);
const t = await openPanel({ temp: true, out: '/tmp/opencode/cloak-browser-e2e/mirror-layout', ...(firefox ? { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' } : {}) });
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  await t.go(site.url);
  const shown = await t.waitMirror((frame) => frame.evaluate(() => document.title === 'layout test' && !!document.getElementById('marker')?.style.top), 20_000);
  check('the page shows', shown >= 0, `${shown} ms`);
  // The fonts' plan comes after the page shows: give it its moment.
  await sleep(4000);
  const page = (await t.service('GET', `/mirror/rects?selector=${encodeURIComponent('.probe')}`)).rects ?? [];
  const here = await t.mirrorFrame().evaluate(() => [...document.querySelectorAll('.probe')].map((element) => {
    const box = element.getBoundingClientRect();
    return [Math.round((box.top + scrollY) * 10) / 10, Math.round(box.height * 10) / 10];
  }));
  const deltas = page.map((rect, index) => Math.round(Math.abs(rect[0] - (here[index]?.[0] ?? NaN)) * 10) / 10);
  const gap = await t.mirrorFrame().evaluate(() => Math.round(document.getElementById('marker').getBoundingClientRect().top - document.getElementById('block').getBoundingClientRect().bottom));
  const fonts = await t.mirrorFrame().evaluate(() => [...document.fonts].filter((face) => face.family.startsWith('cloak-font-')).length);
  log(`headings, page vs panel (top, px): ${page.map((rect, index) => `${rect[0]}/${here[index]?.[0]}`).join('  ')}`);
  log(`differences: ${deltas.join(', ')}; the marker's gap in the panel: ${gap} px; the browser's fonts in the panel: ${fonts}`);
  if (firefox) {
    check('a window that is not Chromium gets none of the browser\'s fonts (the page as HTML, as before)', fonts === 0);
    check('… and lays the page out with its own: the headings move', Math.max(...deltas) > 5, `largest difference ${Math.max(...deltas)} px`);
  } else {
    check('a Chromium-based window has the browser\'s fonts', fonts > 0, `${fonts} faces`);
    check('every heading where the page has it (within 1 px)', deltas.length === 6 && Math.max(...deltas) <= 1, `largest difference ${Math.max(...deltas)} px`);
    check('the marker the page placed by its own measure sits on the block\'s edge', Math.abs(gap) <= 1, `${gap} px`);
  }
  await t.shoot(`/tmp/opencode/cloak-browser-e2e/mirror-layout/${firefox ? 'firefox' : 'chromium'}.png`);
} finally {
  await t.close();
  site.stop();
}
const [passed, total] = results();
log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
