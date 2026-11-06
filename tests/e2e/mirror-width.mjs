// Whether the panel lays a page's content out in the page's width. The browser's window is the panel's, but its scroll
// bar takes 15 px; where the panel's takes less (floating scroll bars, as on a Mac, or hidden, as in this journey's
// window) the panel narrows the page's content to the page's width (frame.ts, fitWidth). A page served in the container
// sets long paragraphs in Arial (the same file on both sides: Liberation Sans), each followed by a heading: the panel
// should have every heading where the page has it. Always on a temporary copy.
// Usage (holding the dev e2e lock): node tests/e2e/mirror-width.mjs
import { checker, log, openPanel, serveInContainer, sleep } from './mirror-lib.mjs';

// Paragraphs of different lengths, so that some line breaks fall within the 15 px a scroll bar takes.
const WORDS = 'the quick brown fox jumps over a lazy dog while wizards jinx gnomes before they vaporize into thin air'.split(' ');
const paragraph = (seed) => Array.from({ length: 40 + (seed * 7) % 60 }, (_, i) => WORDS[(seed * 13 + i * 7) % WORDS.length]).join(' ');
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>width test</title>
<style>body { margin: 16px; font-family: Arial, sans-serif; font-size: 15px; } h2 { margin: 8px 0; font-size: 15px; }</style></head><body>
${Array.from({ length: 30 }, (_, i) => `<p>${paragraph(i + 1)}</p><h2 class="probe">heading ${i + 1}</h2>`).join('\n')}
</body></html>`;

const { check, results } = checker();
const site = serveInContainer('width', PAGE);
const t = await openPanel({ temp: true, out: '/tmp/opencode/cloak-browser-e2e/mirror-width' });
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  await t.go(site.url);
  const shown = await t.waitMirror((frame) => frame.evaluate(() => document.title === 'width test'), 20_000);
  check('the page shows', shown >= 0, `${shown} ms`);
  await sleep(2500);
  const pageHtml = (await t.service('GET', `/mirror/rects?selector=${encodeURIComponent('html')}`)).rects?.[0];
  const page = (await t.service('GET', `/mirror/rects?selector=${encodeURIComponent('.probe')}`)).rects ?? [];
  const here = await t.mirrorFrame().evaluate(() => ({
    html: document.documentElement.getBoundingClientRect().width,
    window: document.documentElement.clientWidth,
    tops: [...document.querySelectorAll('.probe')].map((element) => Math.round((element.getBoundingClientRect().top + scrollY) * 10) / 10),
  }));
  const deltas = page.map((rect, index) => Math.round(Math.abs(rect[0] - (here.tops[index] ?? NaN)) * 10) / 10);
  log(`the page's content ${pageHtml?.[2]} px wide, the panel's ${here.html} px (its window ${here.window} px); largest heading difference ${Math.max(...deltas)} px`);
  check('the panel lays the content out in the page\'s width', Math.abs((pageHtml?.[2] ?? 0) - here.html) <= 1, `${pageHtml?.[2]} / ${here.html}`);
  check('every heading where the page has it (within 1 px)', deltas.length === 30 && Math.max(...deltas) <= 1, `largest difference ${Math.max(...deltas)} px`);
} finally {
  await t.close();
  site.stop();
}
const [passed, total] = results();
log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
