// The page as HTML, in the panel's nested frame (srcdoc): built from the service's snapshot and kept current with its
// operations (service/mirror-recorder.ts says what they are). A snapshot replaces the document; an operation changes
// it in place, and nodes it does not name stay where they are, so focus, a selection and scroll positions survive.
//
// Nothing here reaches the network. Style sheets (by address), images and fonts come from the panel, which gets them
// from the service, as text or blob URLs: style sheets at once, images once they come near the view, and what a style
// names (a background, a font) once the frame's renderer asks for it: its load is refused by the guest's policy, and
// the refusal (securitypolicyviolation) names the address. A new page stays behind the old one until its style sheets
// are here, as a browser keeps showing a page until the next one can paint.
//
// The page's code never runs here. OpenChamber's policy for guest pages allows inline scripts, so this file is the
// guard: no script element in any namespace, no event handler attribute, no javascript: address in any attribute (an
// SVG animation's values included), no srcdoc, no frame with an address, no object or embed, no meta or base.
//
// The panel is the parent; messages carry `cloak: true`:
//   parent → frame  { type: 'events', reset, messages }   { type: 'res', url, mime?, data? (base64) | text?, error? }
//   frame → parent  { type: 'ready' }  { type: 'want', urls }  { type: 'resync' }
type Desc = {
  i: number;
  x?: string;
  n?: string;
  ns?: 's' | 'm' | 'h';
  a?: Record<string, string>;
  c?: Desc[];
  s?: Desc[];
  sa?: string;
  css?: string;
  p?: { v?: string; k?: boolean; si?: number };
  patch?: 1;
};
type Snapshot = { k: 'snap'; url: string; title: string; quirks: boolean; root: Desc | null; adopted: string; scroll: [number, number] };
type Op = [string, ...unknown[]];

const NAMESPACES: Record<string, string> = {
  s: 'http://www.w3.org/2000/svg',
  m: 'http://www.w3.org/1998/Math/MathML',
  h: 'http://www.w3.org/1999/xhtml',
};
const HTML = NAMESPACES.h;
const XLINK = 'http://www.w3.org/1999/xlink';
/** Never made, in any namespace: they would run, load or redirect something of the page's. */
const BLOCKED = new Set(['script', 'noscript', 'template', 'base', 'meta', 'frame', 'frameset', 'applet', 'portal', 'fencedframe', 'link']);
/** SVG animations, which can set an attribute (a link's address) to a value of their own. */
const ANIMATIONS = new Set(['animate', 'set', 'animatemotion', 'animatetransform', 'discard']);
/** How long a new page waits behind the old one for its style sheets. */
const HOLD_MS = 1500;

const nodes = new Map<number, Node>();
const ids = new WeakMap<Node, number>();
/** Blob URLs by the address they stand for; kept across pages (a site's fonts and images are fetched once). */
const blobs = new Map<string, string>();
/** Style sheets fetched by address, as text; kept across pages too. */
const sheets = new Map<string, string>();
const wanted = new Set<string>();
const asked = new Set<string>();
const failed = new Set<string>();
/** Style elements and the CSS they hold (absolute url()s, @imports by address), rendered again as resources arrive. */
const styles = new Map<Element, string>();
/** Elements that stand for a page's linked style sheet, with its address. */
const linked = new Map<Element, string>();
const styleAttributes = new Map<Element, string>();
const shadowCss = new Map<ShadowRoot, string>();
/** Elements waiting for a resource: the attribute to set once it is here. */
const waiting = new Map<string, Array<{ element: Element; attribute: string }>>();
const lazy = new WeakMap<Element, string>();
let wantTimer: ReturnType<typeof setTimeout> | null = null;
let restyleTimer: ReturnType<typeof setTimeout> | null = null;
const arrived = new Set<string>();
let lastLocalScroll = 0;
/** The page's own scroll position, as last reported: put back after styles move the layout under it. */
let pageScroll: [number, number] = [0, 0];
let pageAdopted = '';
/** A change could not be applied: nothing more is, until the next snapshot (asked for with `resync`). */
let broken = false;
/** A snapshot waiting for its style sheets, and what came after it. */
let held: { snapshot: Snapshot; sheets: Set<string>; after: Op[][]; timer: ReturnType<typeof setTimeout> } | null = null;

const post = (message: Record<string, unknown>): void => parent.postMessage({ cloak: true, ...message }, '*');

const isRemote = (url: string): boolean => /^https?:/i.test(url);

const want = (url: string): void => {
  if (!isRemote(url) || blobs.has(url) || sheets.has(url) || asked.has(url) || failed.has(url)) return;
  wanted.add(url);
  wantTimer ??= setTimeout(() => {
    wantTimer = null;
    const urls = [...wanted];
    wanted.clear();
    for (const each of urls) asked.add(each);
    if (urls.length) post({ type: 'want', urls });
  }, 0);
};

/** An address a page could run code with. Browsers ignore whitespace and control characters before the scheme. */
const scripted = (value: string): boolean => /^(javascript|vbscript):/i.test(value.replace(/[\u0000- ]/g, ''));

/** CSS with each url() it names as a blob URL when that is here; others stay, and are asked for when used. */
const renderCss = (css: string): string => css.replace(/url\("([^"]+)"\)/g, (match, url: string) => {
  const blob = blobs.get(url);
  return blob ? `url("${blob}")` : match;
});

/** @imports of sheets fetched by address, put in place (their own imports too, a few levels deep). */
const withImports = (css: string, depth = 0): string => css.replace(/@import\s+url\("([^"]+)"\)\s*([^;]*);/g, (_match, url: string, media: string) => {
  const text = sheets.get(url);
  if (text === undefined) {
    want(url);
    return '';
  }
  const inner = depth < 4 ? withImports(text, depth + 1) : text;
  const condition = media.trim();
  return condition && !/^(layer|supports)\b/i.test(condition) ? `@media ${condition} {\n${inner}\n}` : inner;
});

const setCss = (element: Element, css: string): void => {
  styles.set(element, css);
  element.textContent = renderCss(withImports(css));
};

const sheet = (css: string): CSSStyleSheet => {
  const made = new CSSStyleSheet();
  try {
    made.replaceSync(renderCss(css));
  } catch {
    // a rule this browser cannot take: the sheet without it
  }
  return made;
};

const setAdopted = (css: string): void => {
  pageAdopted = css;
  document.adoptedStyleSheets = css ? [sheet(css)] : [];
};

const resourceAttribute = (element: Element, name: string): boolean => {
  const tag = element.localName;
  if (name === 'src') return tag === 'img' || tag === 'source' || (tag === 'input' && element.getAttribute('type') === 'image');
  if (name === 'poster') return tag === 'video';
  if (name === 'href' || name === 'xlink:href') return tag === 'image' || tag === 'use' || tag === 'feImage';
  return false;
};

const nearView = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const url = lazy.get(entry.target);
    nearView.unobserve(entry.target);
    if (url) want(url);
  }
}, { rootMargin: '1500px' });

const applyResource = (element: Element, attribute: string, url: string): void => {
  const key = url.split('#')[0];
  const blob = blobs.get(key);
  if (blob) {
    const value = url.includes('#') ? `${blob}#${url.slice(url.indexOf('#') + 1)}` : blob;
    if (attribute === 'xlink:href') element.setAttributeNS(XLINK, 'xlink:href', value);
    else element.setAttribute(attribute, value);
    return;
  }
  const list = waiting.get(key) ?? [];
  list.push({ element, attribute });
  waiting.set(key, list);
  if (element.localName === 'img' || element.localName === 'video' || element.localName === 'source') {
    lazy.set(element, key);
    nearView.observe(element.localName === 'source' && element.parentElement ? element.parentElement : element);
    if (element.localName === 'source' && element.parentElement) lazy.set(element.parentElement, key);
  } else {
    want(key);
  }
};

const setAttribute = (element: Element, name: string, value: string | null): void => {
  // autofocus would take the keyboard from OpenChamber when a page shows (the page's own focus is the browser's).
  if (/^on/i.test(name) || name === 'srcdoc' || name === 'is' || name === 'autofocus') return;
  const svgAnimation = element.namespaceURI === NAMESPACES.s && ANIMATIONS.has(element.localName.toLowerCase());
  try {
    if (value === null) {
      if (name === 'xlink:href') element.removeAttributeNS(XLINK, 'href');
      else element.removeAttribute(name);
      styleAttributes.delete(element);
      return;
    }
    if (scripted(value)) return;
    if (svgAnimation && (/href/i.test(name === 'attributeName' ? value : '') || (/^(values|to|from|by)$/.test(name) && /(javascript|vbscript):/i.test(value.replace(/[\u0000- ]/g, ''))))) return;
    if (resourceAttribute(element, name) && isRemote(value)) {
      applyResource(element, name, value);
      return;
    }
    if (name === 'style') {
      styleAttributes.set(element, value);
      element.setAttribute('style', renderCss(value));
      return;
    }
    if (name === 'xlink:href') element.setAttributeNS(XLINK, name, value);
    else element.setAttribute(name, value);
  } catch {
    // a name the page could use and the DOM cannot make (a framework's template syntax): left out
  }
};

const applyForm = (element: Element, state: Desc['p']): void => {
  if (!state || element === document.activeElement) return;
  if (element instanceof HTMLInputElement) {
    if (state.v !== undefined && element.type !== 'file') element.value = state.v;
    if (state.k !== undefined) element.checked = state.k;
  } else if (element instanceof HTMLTextAreaElement) {
    if (state.v !== undefined) element.value = state.v;
  } else if (element instanceof HTMLSelectElement) {
    if (state.si !== undefined) element.selectedIndex = state.si;
  }
};

const register = (id: number, node: Node): void => {
  nodes.set(id, node);
  ids.set(node, id);
};

const forget = (node: Node): void => {
  const id = ids.get(node);
  if (id !== undefined && nodes.get(id) === node) nodes.delete(id);
  if (node instanceof Element) {
    styles.delete(node);
    linked.delete(node);
    styleAttributes.delete(node);
    nearView.unobserve(node);
    if (node.shadowRoot) {
      shadowCss.delete(node.shadowRoot);
      node.shadowRoot.childNodes.forEach(forget);
    }
  }
  node.childNodes.forEach(forget);
};

/** Elements that would load or run something of their own: an empty stand-in with the same box. */
const standIn = (desc: Desc): Element => {
  const tag = desc.n ?? 'div';
  if (tag === 'iframe') {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', '');
    return frame;
  }
  if (tag === 'canvas' || tag === 'video' || tag === 'audio') return document.createElement(tag);
  const box = document.createElement('div');
  const width = desc.a?.width;
  const height = desc.a?.height;
  if (width) box.style.width = /^\d+$/.test(width) ? `${width}px` : width;
  if (height) box.style.height = /^\d+$/.test(height) ? `${height}px` : height;
  return box;
};

/** A node from its description; null for what is never made. */
const build = (desc: Desc, parentNs: string | null): Node | null => {
  if (desc.x !== undefined) {
    const text = document.createTextNode(desc.x);
    register(desc.i, text);
    return text;
  }
  const tag = (desc.n ?? 'span').toLowerCase();
  const ns = desc.ns ? NAMESPACES[desc.ns] : parentNs ?? HTML;
  let element: Element;
  if (desc.n === 'link' && ns === HTML) {
    // A style sheet by address: a style element in its place, filled once the sheet is here.
    element = document.createElement('style');
    if (desc.a?.media) element.setAttribute('media', desc.a.media);
    const href = desc.a?.href ?? '';
    register(desc.i, element);
    linked.set(element, href);
    const text = sheets.get(href);
    if (text !== undefined) setCss(element, text);
    else want(href);
    return element;
  }
  if (BLOCKED.has(tag)) return null;
  if (desc.patch) {
    element = standIn(desc);
  } else {
    try {
      element = ns === HTML ? document.createElement(desc.n ?? 'span') : document.createElementNS(ns, desc.n ?? 'g');
    } catch {
      element = document.createElement('span');
    }
  }
  register(desc.i, element);
  for (const [name, value] of Object.entries(desc.a ?? {})) {
    if (desc.patch && (name === 'src' || name === 'data' || name === 'allow' || name === 'sandbox')) continue;
    setAttribute(element, name, value);
  }
  if (desc.n === 'style' && desc.css !== undefined) {
    setCss(element, desc.css);
    return element;
  }
  const childNs = desc.n === 'foreignObject' ? HTML : ns;
  for (const child of desc.c ?? []) {
    const built = build(child, childNs);
    if (built) element.appendChild(built);
  }
  if (desc.s) {
    let root: ShadowRoot | null = null;
    try {
      root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
    } catch {
      root = null;
    }
    // A host the DOM refuses a shadow root: its shadow content goes after its own children, close enough.
    const target: Node = root ?? element;
    for (const child of desc.s) {
      const built = build(child, ns);
      if (built) target.appendChild(built);
    }
    if (root) {
      shadowCss.set(root, desc.sa ?? '');
      if (desc.sa) root.adoptedStyleSheets = [sheet(desc.sa)];
    }
  }
  if (desc.p) applyForm(element, desc.p);
  return element;
};

const nsOf = (node: Node): string | null => {
  if (node instanceof ShadowRoot) return nsOf(node.host);
  if (!(node instanceof Element)) return HTML;
  if (node.localName === 'foreignObject') return HTML;
  return node.namespaceURI ?? HTML;
};

/** A parent's children made the given list, moving and adding only what differs. */
const reconcile = (parent: Node, list: Array<number | Desc>): boolean => {
  const ns = nsOf(parent);
  const next: Node[] = [];
  for (const entry of list) {
    if (typeof entry === 'number') {
      const node = nodes.get(entry);
      if (!node) return false;
      next.push(node);
    } else {
      const built = build(entry, ns);
      if (built) next.push(built);
    }
  }
  const keep = new Set(next);
  for (const child of Array.from(parent.childNodes)) {
    if (!keep.has(child)) {
      parent.removeChild(child);
      forget(child);
    }
  }
  let cursor = parent.firstChild;
  for (const node of next) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
      continue;
    }
    parent.insertBefore(node, cursor);
  }
  return true;
};

const linkedSheets = (desc: Desc | null, out: Set<string> = new Set()): Set<string> => {
  if (!desc || desc.x !== undefined) return out;
  if (desc.n === 'link' && desc.a?.href && isRemote(desc.a.href) && !sheets.has(desc.a.href) && !failed.has(desc.a.href)) out.add(desc.a.href);
  for (const child of desc.c ?? []) linkedSheets(child, out);
  for (const child of desc.s ?? []) linkedSheets(child, out);
  return out;
};

const showSnapshot = (message: Snapshot): void => {
  for (const node of nodes.values()) if (node instanceof Element) nearView.unobserve(node);
  nodes.clear();
  styles.clear();
  linked.clear();
  styleAttributes.clear();
  shadowCss.clear();
  waiting.clear();
  broken = false;
  if (!message.root) return;
  const root = build(message.root, null);
  if (!(root instanceof Element)) return;
  document.replaceChild(root, document.documentElement);
  setAdopted(message.adopted);
  pageScroll = message.scroll;
  lastLocalScroll = 0;
  window.scrollTo(message.scroll[0], message.scroll[1]);
};

/** A new page: shown once its style sheets are here, or after HOLD_MS; what comes for it meanwhile waits too. */
const snapshot = (message: Snapshot): void => {
  if (held) clearTimeout(held.timer);
  const pending = linkedSheets(message.root);
  if (!pending.size) {
    held = null;
    showSnapshot(message);
    return;
  }
  for (const url of pending) want(url);
  held = { snapshot: message, sheets: pending, after: [], timer: setTimeout(release, HOLD_MS) };
};

const release = (): void => {
  const current = held;
  if (!current) return;
  clearTimeout(current.timer);
  held = null;
  showSnapshot(current.snapshot);
  for (const ops of current.after) applyOps(ops);
};

const apply = (op: Op): boolean => {
  switch (op[0]) {
    case 'c': {
      const parent = nodes.get(op[1] as number);
      if (!parent) return true;
      return reconcile(parent, op[2] as Array<number | Desc>);
    }
    case 'S': {
      const host = nodes.get(op[1] as number) as Element | undefined;
      if (!host) return true;
      let root: ShadowRoot | null = host.shadowRoot;
      if (!root) {
        try {
          root = host.attachShadow({ mode: 'open' });
        } catch {
          return true;
        }
      }
      return reconcile(root, op[2] as Array<number | Desc>);
    }
    case 'a': {
      const element = nodes.get(op[1] as number);
      if (element instanceof Element) setAttribute(element, op[2] as string, op[3] as string | null);
      return true;
    }
    case 't': {
      const text = nodes.get(op[1] as number);
      if (text && text.nodeType === Node.TEXT_NODE) (text as Text).data = op[2] as string;
      return true;
    }
    case 's': {
      const element = nodes.get(op[1] as number);
      if (element instanceof Element) setCss(element, op[2] as string);
      return true;
    }
    case 'A':
      setAdopted(op[1] as string);
      return true;
    case 'v': {
      const element = nodes.get(op[1] as number);
      if (element instanceof Element) applyForm(element, op[2] as Desc['p']);
      return true;
    }
    case 'x': {
      const id = op[1] as number;
      if (id === 0) pageScroll = [op[2] as number, op[3] as number];
      // The user scrolls here, and the page follows: its own report of a scroll waits until the user is done.
      if (Date.now() - lastLocalScroll < 1000) return true;
      if (id === 0) window.scrollTo(op[2] as number, op[3] as number);
      else {
        const element = nodes.get(id);
        if (element instanceof Element) element.scrollTo(op[2] as number, op[3] as number);
      }
      return true;
    }
    default:
      return true;
  }
};

const applyOps = (ops: Op[]): void => {
  if (broken) return;
  for (const op of ops) {
    if (!apply(op)) {
      broken = true;
      post({ type: 'resync' });
      return;
    }
  }
};

/** Styles that name what arrived are rendered again, once for a burst of arrivals. */
const restyle = (): void => {
  restyleTimer = null;
  const urls = [...arrived];
  arrived.clear();
  const names = (css: string): boolean => urls.some((url) => css.includes(url));
  for (const [element, css] of styles) if (names(css)) element.textContent = renderCss(withImports(css));
  for (const [element, css] of styleAttributes) if (names(css)) element.setAttribute('style', renderCss(css));
  if (pageAdopted && names(pageAdopted)) setAdopted(pageAdopted);
  for (const [root, css] of shadowCss) if (css && names(css)) root.adoptedStyleSheets = [sheet(css)];
  // Styles move the layout: the page's own scroll position again, unless the user has scrolled here since.
  if (!lastLocalScroll && (pageScroll[0] || pageScroll[1])) window.scrollTo(pageScroll[0], pageScroll[1]);
};

const resourceArrived = (url: string, mime: string, content: { data?: string; text?: string }): void => {
  asked.delete(url);
  const bytes = content.text !== undefined ? content.text : Uint8Array.from(atob(content.data ?? ''), (char) => char.charCodeAt(0));
  if (mime === 'text/css') {
    sheets.set(url, typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes));
    for (const [element, href] of linked) if (href === url) setCss(element, sheets.get(url) ?? '');
    if (held?.sheets.delete(url) && held.sheets.size === 0) release();
  } else {
    blobs.set(url, URL.createObjectURL(new Blob([bytes], { type: mime })));
    for (const { element, attribute } of waiting.get(url) ?? []) applyResource(element, attribute, url);
    waiting.delete(url);
  }
  arrived.add(url);
  restyleTimer ??= setTimeout(restyle, 16);
};

const resourceFailed = (url: string): void => {
  asked.delete(url);
  failed.add(url);
  if (held?.sheets.delete(url) && held.sheets.size === 0) release();
};

window.addEventListener('message', (event) => {
  if (event.source !== parent) return;
  const data = event.data as { cloak?: boolean; type?: string; reset?: boolean; messages?: unknown[]; url?: string; mime?: string; data?: string; text?: string; error?: string };
  if (!data?.cloak) return;
  if (data.type === 'events') {
    for (const message of data.messages ?? []) {
      const kind = (message as { k?: string }).k;
      if (kind === 'snap') snapshot(message as Snapshot);
      else if (kind === 'ops') {
        const ops = (message as { ops: Op[] }).ops;
        if (held) held.after.push(ops);
        else applyOps(ops);
      }
    }
  } else if (data.type === 'res' && data.url) {
    if ((data.data !== undefined || data.text !== undefined) && data.mime) resourceArrived(data.url, data.mime, data);
    else resourceFailed(data.url);
  }
});

// What a style names (a background, a font, a cursor) is fetched when the renderer wants it: the guest's policy
// refuses the load, and says which address it refused.
document.addEventListener('securitypolicyviolation', (event) => {
  const url = event.blockedURI;
  if (isRemote(url)) want(url);
});

// Not this frame's to follow: a link or a form would take the frame away from the mirror.
window.addEventListener('click', (event) => {
  const target = event.target as Element | null;
  if (target?.closest?.('a, area, button, input, label, summary, select, option')) event.preventDefault();
}, true);
window.addEventListener('auxclick', (event) => event.preventDefault(), true);
window.addEventListener('submit', (event) => event.preventDefault(), true);
window.addEventListener('scroll', () => {
  lastLocalScroll = Date.now();
}, { capture: true, passive: true });

post({ type: 'ready' });

export {};
