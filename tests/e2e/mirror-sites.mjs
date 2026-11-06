// What the page as HTML costs on real sites, in dev, on the wire as the browser gets it (OpenChamber compresses the
// answers): per site, the time from Enter in the address field to the page shown, the bytes until it settles, the
// bytes for a scroll (10 wheel steps over 3 s), and for 10 s of nothing. Prints a table; checks nothing.
// Usage (holding the dev e2e lock): node tests/e2e/mirror-sites.mjs [--installed] url...
import { log, openPanel, sleep } from './mirror-lib.mjs';

const urls = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const t = await openPanel({ temp: !process.argv.includes('--installed'), out: '/tmp/opencode/cloak-browser-e2e/mirror-sites' });
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const rows = [];
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  for (const url of urls) {
    const start = { ...t.wire };
    const at = Date.now();
    await t.go(url);
    const state = await (async () => {
      for (const end = Date.now() + 30_000; Date.now() < end; await sleep(300)) {
        const now = await t.service('GET', '/state').catch(() => null);
        if (now && !now.loading && now.url !== 'about:blank' && now.title && new URL(now.url).hostname.endsWith(new URL(url).hostname.replace(/^www\./, ''))) return now;
      }
      return null;
    })();
    const shownMs = state ? await t.waitMirror((frame) => frame.evaluate((title) => document.title === title && document.querySelectorAll('body *').length > 20, state.title), 30_000) : -1;
    const shown = Date.now() - at;
    await sleep(4000);
    const loaded = t.wire.bytes - start.bytes;
    const box = await t.panelElement.boundingBox();
    await t.page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
    const beforeScroll = t.wire.bytes;
    for (let step = 0; step < 10; step += 1) {
      await t.page.mouse.wheel(0, 100);
      await sleep(300);
    }
    await sleep(2000);
    const scrolled = t.wire.bytes - beforeScroll;
    const beforeIdle = t.wire.bytes;
    await sleep(10_000);
    const idle = t.wire.bytes - beforeIdle;
    const elements = await t.mirrorFrame()?.evaluate(() => document.querySelectorAll('*').length).catch(() => 0);
    rows.push(`| ${url.replace(/^https?:\/\//, '')} | ${shownMs < 0 ? 'not shown' : `${(shown / 1000).toFixed(1)} s`} | ${kb(loaded)} | ${kb(scrolled)} | ${kb(idle)} | ${elements} |`);
    log(rows.at(-1));
  }
} finally {
  await t.close();
}
console.log('| page | shown after Enter | first view (until settled) | a scroll (10 wheel steps, 3 s) | 10 s idle | elements |');
console.log('|---|---|---|---|---|---|');
for (const row of rows) console.log(row);
