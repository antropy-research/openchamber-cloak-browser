// A browser handed over that no service takes: the extension is paused while its panel watches (OpenChamber stops
// the service with SIGTERM, and nothing starts it again). The handover's watchdog stops the browser after a minute.
// Always on a temporary copy (it pauses the extension): the Cloak Browser dev runs is untouched.
// Usage (holding the dev e2e lock): node tests/e2e/mirror-watchdog.mjs
import { execFileSync } from 'node:child_process';

import { CONTAINER, log, openPanel, sleep } from './mirror-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sh = (command) => execFileSync('docker', ['exec', CONTAINER, 'sh', '-c', command], { encoding: 'utf8' }).trim();
const browserPids = () => sh("for p in /proc/[0-9]*; do c=$(tr '\\0' ' ' < $p/cmdline 2>/dev/null); case \"$c\" in *--headless*oc-forge-cloak-html-test/profile*) case \"$c\" in *--type=*) ;; *) echo ${p#/proc/};; esac;; esac; done").split('\n').filter(Boolean);
const handover = () => sh('cat /home/node/.local/share/oc-forge-cloak-html-test/handover.json 2>/dev/null || true');

const t = await openPanel({ temp: true, out: '/tmp/opencode/cloak-browser-e2e/mirror-watchdog' });
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  const before = browserPids();
  const paused = await t.context.request.put(`${t.base}/api/guests/${t.which.id}/enabled`, { data: { enabled: false } });
  log('pause', paused.status());
  await sleep(3000);
  check('paused while watched, the service hands its browser over', before.length === 1 && browserPids()[0] === before[0] && handover().includes(`"pid":${before[0]}`), `${before} → ${browserPids()}`);
  await sleep(50_000);
  check('the browser still runs within the minute', browserPids().length === 1);
  await sleep(15_000);
  check('nobody took it over: the watchdog stopped it after the minute', browserPids().length === 0 && handover() === '', `${browserPids()} / ${handover().slice(0, 60)}`);
} finally {
  await t.context.request.put(`${t.base}/api/guests/${t.which.id}/enabled`, { data: { enabled: true } }).catch(() => {});
  await t.close();
}
const failed = results.filter((result) => !result.ok);
log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
