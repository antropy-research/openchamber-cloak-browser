// What the panel costs while it is not shown: OpenChamber keeps an extension's page mounted when its panel is
// closed or another one is shown. Counts the page's requests to the service with the panel open, then closed (it
// should ask next to nothing), moves the page meanwhile, and checks the panel shows where it went once open again.
// Always on a temporary copy. Usage (holding the dev e2e lock): node tests/e2e/mirror-hidden.mjs
import { checker, log, openPanel, sleep } from './mirror-lib.mjs';

const { check, results } = checker();
const t = await openPanel({ temp: true, out: '/tmp/opencode/cloak-browser-e2e/mirror-hidden' });
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  const count = async (ms) => {
    const before = { ...t.wire };
    await sleep(ms);
    return { requests: t.wire.requests - before.requests, events: t.wire.events - before.events, kb: Math.round((t.wire.bytes - before.bytes) / 1024) };
  };
  const open = await count(10_000);
  log('open, 10 s:', JSON.stringify(open));
  await t.rail.click();
  await sleep(1500);
  const shownAfterClose = await t.rail.getAttribute('aria-pressed');
  const size = await t.panelFrame()?.evaluate(() => ({ w: innerWidth, h: innerHeight, hidden: document.hidden, visibility: document.visibilityState })).catch((error) => String(error));
  log('closed:', shownAfterClose, JSON.stringify(size));
  const closed = await count(20_000);
  log('closed, 20 s:', JSON.stringify(closed));
  check('a closed panel asks the service for next to nothing', closed.requests <= 4, JSON.stringify(closed));
  // Meanwhile the page moves on (as the agent would move it): the panel catches up when it is shown again.
  await t.service('POST', '/navigate', { url: 'https://example.com/' });
  await sleep(3000);
  await t.rail.click();
  const back = await t.waitMirror((frame) => frame.evaluate(() => document.title === 'Example Domain'), 15_000);
  check('opened again, it shows where the page went meanwhile', back >= 0, `${back} ms`);
} finally {
  await t.close();
}
const [passed, total] = results();
log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
