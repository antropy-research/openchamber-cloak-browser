// Where the panel puts a page's elements against where the page has them, on real sites, in dev: per site, the tops of
// the first elements a selector matches in each (document pixels), and how far apart they are (the median, the
// largest, the last). Prints a table; checks nothing (tests/e2e/mirror-layout.mjs checks what can be checked).
// Usage (holding the dev e2e lock): node tests/e2e/mirror-drift.mjs [--installed] [url selector]...
import { log, openPanel, sleep } from './mirror-lib.mjs';

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const SITES = args.length >= 2
  ? Array.from({ length: Math.floor(args.length / 2) }, (_, i) => [args[i * 2], args[i * 2 + 1]])
  : [
    ['https://en.wikipedia.org/wiki/Web_browser', 'h2, h3, p'],
    ['https://github.com/openchamber/openchamber', 'article h2, article h3, article p'],
    ['https://news.ycombinator.com/', 'tr.athing'],
    ['https://example.com/', 'p'],
  ];
const t = await openPanel({ temp: !process.argv.includes('--installed'), out: '/tmp/opencode/cloak-browser-e2e/mirror-drift' });
const rows = [];
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  for (const [url, selector] of SITES) {
    await t.go(url);
    let title = '';
    for (const end = Date.now() + 30_000; Date.now() < end && !title; await sleep(300)) {
      const state = await t.service('GET', '/state').catch(() => null);
      if (state && !state.loading && state.url.includes(new URL(url).hostname)) title = state.title;
    }
    await t.waitMirror((frame) => frame.evaluate((expected) => document.title === expected, title), 20_000);
    await sleep(5000);
    const page = ((await t.service('GET', `/mirror/rects?selector=${encodeURIComponent(selector)}`)).rects ?? []).slice(0, 60);
    const here = await t.mirrorFrame().evaluate((which) => [...document.querySelectorAll(which)].slice(0, 60).map((element) => Math.round((element.getBoundingClientRect().top + scrollY) * 10) / 10), selector);
    const apart = page.map((rect, index) => Math.abs(rect[0] - (here[index] ?? NaN))).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    const last = Math.abs((page.at(-1)?.[0] ?? NaN) - (here[page.length - 1] ?? NaN));
    rows.push(`| ${url.replace(/^https?:\/\//, '')} | \`${selector}\` | ${apart.length} | ${Math.round(apart[Math.floor(apart.length / 2)] ?? NaN)} px | ${Math.round(apart.at(-1) ?? NaN)} px | ${Math.round(last)} px |`);
    log(rows.at(-1));
  }
} finally {
  await t.close();
}
console.log('| page | elements | compared | median apart | largest | the last |');
console.log('|---|---|---|---|---|---|');
for (const row of rows) console.log(row);
