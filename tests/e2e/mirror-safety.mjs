// No code of a page's runs in the panel. OpenChamber's policy for extension pages allows inline scripts, so the
// panel's frame is the guard (panel/frame.ts). A page served in the container tries the ways in it knows: script
// elements (HTML and SVG), handler attributes, javascript: links, srcdoc, SVG animations that set an address or a
// handler, object and embed, a meta refresh, base, a form's action, autofocus, and after it loads a frame whose
// sandbox it removes and whose address it sets to a data: page with a script. In the real page these run as they
// should; in the panel each would set a marker (window.__pwned, or a message to the frame). Then it clicks the links
// and buttons in the panel. Always on a temporary copy. Usage (holding the dev e2e lock): node tests/e2e/mirror-safety.mjs
import { checker, log, openPanel, serveInContainer, sleep } from './mirror-lib.mjs';

const MARK = 'window.__pwned=(window.__pwned||[]).concat';
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>safety test</title>
<meta http-equiv="refresh" content="30;url=javascript:${MARK}(['meta'])">
<base href="javascript:${MARK}(['base'])//">
<link rel="stylesheet" href="javascript:${MARK}(['link'])">
<style>body{font:16px sans-serif;margin:16px} a,button,svg{display:block;margin:6px 0}</style></head>
<body>
<script>${MARK}(['script']);</script>
<svg width="200" height="40"><script>${MARK}(['svg-script']);</script><a id="svga" href="#"><animate attributeName="href" values="javascript:${MARK}(['smil-href'])" dur="0.1s" fill="freeze"/><text x="5" y="20">svg link</text></a><set attributeName="onmouseover" to="${MARK}(['smil-handler'])"/></svg>
<img id="img" src="/nothing-here.png" onerror="${MARK}(['onerror'])" alt="">
<a id="js" href="javascript:${MARK}(['href'])">javascript link</a>
<a id="data" href="data:text/html,<script>parent.postMessage('pwned-data-link','*')</script>">data link</a>
<iframe id="sd" srcdoc="<script>parent.postMessage('pwned-srcdoc','*')</script>" width="100" height="30"></iframe>
<object id="obj" data="javascript:${MARK}(['object'])" width="50" height="20"></object>
<embed id="emb" src="javascript:${MARK}(['embed'])" width="50" height="20">
<form id="form" action="javascript:${MARK}(['form'])"><button id="fb">form button</button></form>
<details id="det" ontoggle="${MARK}(['ontoggle'])"><summary id="sum">details</summary>inside</details>
<input id="auto" autofocus onfocus="${MARK}(['onfocus'])">
<template><script>${MARK}(['template'])</script></template>
<noscript><img src="x" onerror="${MARK}(['noscript'])"></noscript>
<my-widget is="x" id="custom">custom</my-widget>
<p id="late">late frame below</p>
<script>
setTimeout(() => {
  const frame = document.createElement('iframe');
  frame.id = 'late-frame';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.width = '100';
  frame.height = '30';
  document.body.append(frame);
  setTimeout(() => {
    frame.removeAttribute('sandbox');
    frame.setAttribute('srcdoc', "<script>parent.postMessage('pwned-late-srcdoc','*')<\\/script>");
    frame.src = "data:text/html,<script>parent.postMessage('pwned-late-data','*')<\\/script>";
    document.getElementById('late').setAttribute('onclick', "${MARK}(['late-handler'])");
    document.getElementById('late').textContent = 'late frame below (changed)';
  }, 700);
}, 300);
</script>
</body></html>`;

const { check, results } = checker();
const site = serveInContainer('safety', PAGE);
const t = await openPanel({ temp: true, out: '/tmp/opencode/cloak-browser-e2e/mirror-safety' });
try {
  await t.waitMirror((frame) => frame.evaluate(() => document.querySelectorAll('body *').length > 5), 90_000);
  // Messages a page's code in the panel would send: the frame's own listener ignores them, this one keeps them.
  const watch = () => t.mirrorFrame().evaluate(() => {
    window.__messages = window.__messages ?? [];
    if (!window.__watching) {
      window.__watching = true;
      window.addEventListener('message', (event) => { if (String(event.data).startsWith('pwned')) window.__messages.push(String(event.data)); }, true);
    }
  });
  await watch();
  await t.go(site.url);
  const shown = await t.waitMirror((frame) => frame.evaluate(() => document.title === 'safety test' && /changed/.test(document.getElementById('late')?.textContent ?? '')), 20_000);
  check('the page and its late changes show in the panel', shown >= 0, `${shown} ms`);
  await watch();
  const mirror = t.mirrorFrame();
  const present = await mirror.evaluate(() => ['svga', 'img', 'js', 'data', 'sd', 'obj', 'emb', 'form', 'fb', 'det', 'sum', 'auto', 'custom', 'late-frame'].filter((id) => !document.getElementById(id)));
  check('every trap is in the panel\'s page (as data)', present.length === 0, present.length ? `missing ${present.join(', ')}` : '');
  for (const id of ['js', 'data', 'fb', 'sum', 'svga', 'late']) {
    await mirror.locator(`#${id}`).click({ timeout: 3000 }).catch((error) => log(`click #${id}:`, String(error).slice(0, 80)));
    await sleep(300);
  }
  await mirror.locator('#svga').hover().catch(() => {});
  await sleep(2500);
  const found = await t.mirrorFrame().evaluate(() => ({
    pwned: window.__pwned ?? null,
    messages: window.__messages ?? [],
    scripts: document.querySelectorAll('script').length,
    handlers: [...document.querySelectorAll('*')].flatMap((element) => [...element.attributes].filter((attribute) => /^on/i.test(attribute.name)).map((attribute) => `${element.localName}[${attribute.name}]`)),
    javascript: [...document.querySelectorAll('*')].flatMap((element) => [...element.attributes].filter((attribute) => /javascript:/i.test(attribute.value)).map((attribute) => `${element.localName}[${attribute.name}]`)),
    lateFrame: (() => {
      const frame = document.getElementById('late-frame');
      return frame ? { sandbox: frame.getAttribute('sandbox'), src: frame.getAttribute('src'), srcdoc: frame.getAttribute('srcdoc') } : null;
    })(),
    srcdoc: document.getElementById('sd')?.getAttribute('srcdoc') ?? null,
    autofocus: [...document.querySelectorAll('[autofocus]')].length,
    base: document.querySelectorAll('base, meta[http-equiv]').length,
    title: document.title,
  }));
  log(JSON.stringify(found));
  check('nothing ran in the panel (no marker, no message)', found.pwned === null && found.messages.length === 0, `${JSON.stringify(found.pwned)} ${found.messages.join(',')}`);
  check('no script element, no handler, no javascript: value in the panel\'s page', found.scripts === 0 && found.handlers.length === 0 && found.javascript.length === 0, JSON.stringify({ scripts: found.scripts, handlers: found.handlers, javascript: found.javascript }));
  check('frames stay sandboxed stand-ins without an address, even when the page changes theirs', found.lateFrame?.sandbox === '' && found.lateFrame.src === null && found.lateFrame.srcdoc === null && found.srcdoc === null, JSON.stringify(found.lateFrame));
  check('no autofocus, base or meta refresh', found.autofocus === 0 && found.base === 0);
  check('the panel still shows the page (it went nowhere)', found.title === 'safety test');
} finally {
  await t.close();
  site.stop();
}
const [passed, total] = results();
log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
