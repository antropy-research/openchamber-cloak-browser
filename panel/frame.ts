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
// The user's input is frame-input.ts's.
//
// The panel is the parent; messages carry `cloak: true`:
//   parent → frame  { type: 'events', doc, reset, messages }   { type: 'res', url, mime?, data? (base64) | text?, error? }
//                   { type: 'patches', doc, patches: [{ id, mime, data, dx, dy, w, h }] }
//   frame → parent  { type: 'ready' }  { type: 'want', urls }  { type: 'resync' }  { type: 'input', doc, events }
//                   { type: 'address' }
import { startInput } from './frame-input.ts';

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
  sc?: [number, number];
  patch?: 1;
  is?: [number, number];
  d?: 1;
};
type Snapshot = { k: 'snap'; url: string; title: string; quirks: boolean; root: Desc | null; adopted: string; scroll: [number, number]; focus?: number; lw?: number };
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
/**
 * Resources the service could not give: how often, and until when they are not asked for again. One still needed then
 * (a linked sheet, an element waiting for it) is asked for again after RETRY_MS: the request may have failed on the
 * way (the service starting again, its answer cut). What a style names is asked for when the renderer next wants it.
 */
const failed = new Map<string, { count: number; until: number }>();
const RETRY_MS = [1000, 3000, 8000];
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
let pageAdopted = '';
/** The service's number of the document shown here: the user's input says which page it was made on. */
let shownDoc = 0;
/** Elements scrolled in the page when it was described: scrolled here once the page is shown. */
let scrolledAtStart: Array<[number, [number, number]]> = [];
/**
 * Pictures of the elements HTML cannot carry (a canvas, a video, another site's frame), for the document `patchDoc`:
 * each stand-in shows its picture as its background, placed on the part of it the page's window showed.
 */
type PatchPicture = { url: string; dx: number; dy: number; w: number; h: number };
const patchPictures = new Map<number, PatchPicture>();
let patchDoc = -1;
/** A change could not be applied: nothing more is, until the next snapshot (asked for with `resync`). */
let broken = false;
/** A snapshot waiting for its style sheets, and what came after it. */
let held: { snapshot: Snapshot; doc: number; sheets: Set<string>; after: Op[][]; timer: ReturnType<typeof setTimeout> } | null = null;

const post = (message: Record<string, unknown>): void => parent.postMessage({ cloak: true, ...message }, '*');

const input = startInput({
  idOf: (node) => ids.get(node),
  nodeOf: (id) => nodes.get(id),
  patchAt: (x, y) => patchAt(x, y),
  send: (events) => post({ type: 'input', doc: shownDoc, events }),
  address: () => post({ type: 'address' }),
});

const isRemote = (url: string): boolean => /^https?:/i.test(url);

const want = (url: string): void => {
  if (!isRemote(url) || blobs.has(url) || sheets.has(url) || asked.has(url)) return;
  const failure = failed.get(url);
  if (failure && Date.now() < failure.until) return;
  wanted.add(url);
  wantTimer ??= setTimeout(flushWanted, 0);
};

const flushWanted = (): void => {
  wantTimer = null;
  const urls = [...wanted];
  wanted.clear();
  for (const each of urls) asked.add(each);
  if (urls.length) post({ type: 'want', urls });
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

/** Our own rules, after the page's (`fitWidth`). */
const ownSheet = new CSSStyleSheet();

const setAdopted = (css: string): void => {
  pageAdopted = css;
  document.adoptedStyleSheets = [...(css ? [sheet(css)] : []), ownSheet];
};

/**
 * The width the page lays its content out in, as it said (its window less its scroll bar). The frame's window is the
 * page's, but its scroll bar may take less room (none where scroll bars float, as on a Mac, or are hidden): then the
 * page's content is narrowed to the page's width, so its lines break where the page's do. Media queries still see the
 * page's window.
 */
let pageWidth = 0;
let fittedTo = '';
const fitWidth = (): void => {
  const own = document.documentElement.clientWidth;
  const rule = pageWidth > 0 && own - pageWidth >= 1 ? `html { width: ${pageWidth}px !important; }` : '';
  if (rule === fittedTo) return;
  fittedTo = rule;
  try {
    ownSheet.replaceSync(rule);
  } catch {
    // as before
  }
};
window.addEventListener('resize', fitWidth);

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

const paintPatch = (element: Element, picture: PatchPicture): void => {
  if (!(element instanceof HTMLElement)) return;
  const style = element.style;
  style.setProperty('background-image', `url("${picture.url}")`, 'important');
  style.setProperty('background-position', `${picture.dx}px ${picture.dy}px`, 'important');
  style.setProperty('background-size', `${picture.w}px ${picture.h}px`, 'important');
  style.setProperty('background-repeat', 'no-repeat', 'important');
  style.setProperty('background-origin', 'border-box', 'important');
  // A frame's own document would take the pointer: the input module finds the frame under it (patchAt).
  if (element.localName === 'iframe') style.setProperty('pointer-events', 'none', 'important');
};

const forDoc = (doc: number): void => {
  if (doc === patchDoc) return;
  for (const picture of patchPictures.values()) URL.revokeObjectURL(picture.url);
  patchPictures.clear();
  patchDoc = doc;
};

const patchesArrived = (doc: number, patches: Array<{ id: number; mime: string; data: string; dx: number; dy: number; w: number; h: number }>): void => {
  if (doc !== patchDoc) return;
  for (const patch of patches) {
    const bytes = Uint8Array.from(atob(patch.data), (char) => char.charCodeAt(0));
    const old = patchPictures.get(patch.id);
    const picture = { url: URL.createObjectURL(new Blob([bytes], { type: patch.mime })), dx: patch.dx, dy: patch.dy, w: patch.w, h: patch.h };
    patchPictures.set(patch.id, picture);
    const element = nodes.get(patch.id);
    if (element instanceof Element) paintPatch(element, picture);
    // The old picture goes once the new one is drawn.
    if (old) setTimeout(() => URL.revokeObjectURL(old.url), 1000);
  }
};

/** The stand-in (a frame) under a point, which takes no pointer events itself: the input module asks. */
const patchAt = (x: number, y: number): Element | null => {
  for (const id of patchPictures.keys()) {
    const element = nodes.get(id);
    if (!(element instanceof Element) || element.localName !== 'iframe') continue;
    const box = element.getBoundingClientRect();
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return element;
  }
  return null;
};

/** Stand-ins (frames, canvases, video, plugins): they keep their sandbox and never take an address of the page's. */
const standIns = new WeakSet<Element>();
const STAND_IN_KEPT = new Set(['src', 'srcdoc', 'srcset', 'data', 'sandbox', 'allow', 'allowfullscreen', 'credentialless', 'csp', 'name']);

/** A linked sheet's address changed (a page's script often sets it after adding the link): its style follows. */
const relink = (element: Element, href: string): void => {
  linked.set(element, href);
  const text = sheets.get(href);
  if (text !== undefined) setCss(element, text);
  else {
    styles.delete(element);
    element.textContent = '';
    want(href);
  }
};

const setAttribute = (element: Element, name: string, value: string | null): void => {
  // autofocus would take the keyboard from OpenChamber when a page shows (the page's own focus is the browser's).
  if (/^on/i.test(name) || name === 'srcdoc' || name === 'is' || name === 'autofocus') return;
  if (linked.has(element) && name === 'href') {
    relink(element, value !== null && isRemote(value) ? value : '');
    return;
  }
  if (standIns.has(element) && STAND_IN_KEPT.has(name.toLowerCase())) return;
  const svgAnimation = element.namespaceURI === NAMESPACES.s && ANIMATIONS.has(element.localName.toLowerCase());
  try {
    if (value === null) {
      if (name === 'xlink:href') element.removeAttributeNS(XLINK, 'href');
      else element.removeAttribute(name);
      styleAttributes.delete(element);
      return;
    }
    if (scripted(value)) return;
    // An animation that would set a link's address, or a handler.
    if (svgAnimation && ((name === 'attributeName' && /href|^\s*on/i.test(value)) || (/^(values|to|from|by)$/.test(name) && /(javascript|vbscript):/i.test(value.replace(/[\u0000- ]/g, ''))))) return;
    if (resourceAttribute(element, name) && isRemote(value)) {
      applyResource(element, name, value);
      return;
    }
    if (name === 'style') {
      styleAttributes.set(element, value);
      element.setAttribute('style', renderCss(value));
      const id = ids.get(element);
      const picture = id === undefined ? undefined : patchPictures.get(id);
      if (picture) paintPatch(element, picture);
      return;
    }
    if (name === 'xlink:href') element.setAttributeNS(XLINK, name, value);
    else element.setAttribute(name, value);
  } catch {
    // a name the page could use and the DOM cannot make (a framework's template syntax): left out
  }
};

/** A field's text from the page; focused here, the caret stays where it was (at the end if it was there). */
const setText = (element: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  if (element.value === value) return;
  const focusedHere = element === document.activeElement;
  let start: number | null = null;
  let end: number | null = null;
  try {
    start = element.selectionStart;
    end = element.selectionEnd;
  } catch {
    // a field with no selection (a number)
  }
  const atEnd = end === element.value.length;
  element.value = value;
  if (!focusedHere || start === null || end === null) return;
  try {
    if (atEnd) element.setSelectionRange(value.length, value.length);
    else element.setSelectionRange(Math.min(start, value.length), Math.min(end, value.length));
  } catch {
    // as above
  }
};

/** A control's value and state from the page. A field the user is typing in here keeps its own text meanwhile (the
 * page has the same keys, and its echo would move the caret back); a box, a radio or a select takes the page's at
 * once, and so does a field the page or the agent writes in while the user is not typing. */
const applyForm = (element: Element, state: Desc['p']): void => {
  if (!state) return;
  const typing = element === document.activeElement && input.typing() && (element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && !/^(checkbox|radio|button|submit|reset|file|image|range|color)$/i.test(element.type)));
  if (element instanceof HTMLInputElement) {
    if (state.v !== undefined && element.type !== 'file' && !typing) setText(element, state.v);
    if (state.k !== undefined) element.checked = state.k;
  } else if (element instanceof HTMLTextAreaElement) {
    if (state.v !== undefined && !typing) setText(element, state.v);
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

/**
 * A custom element's name the page has defined (the `d` mark, the `d` change), defined here too as an element that
 * does nothing: the page's own definition (its code) never runs here, but CSS asks whether an element is defined
 * (`:defined`), and pages style the two cases apart (GitHub shows another header while its components are not yet
 * defined). A name the page has not defined stays undefined here. A definition cannot be taken back: a later page
 * that uses the same name without defining it finds it defined.
 */
const defined = new Set<string>();
const define = (name: string): void => {
  if (!name.includes('-') || defined.has(name)) return;
  defined.add(name);
  try {
    if (!customElements.get(name)) customElements.define(name, class extends HTMLElement {});
  } catch {
    // not a valid custom element name
  }
};

/** Elements that would load or run something of their own: an empty stand-in with the same box. */
const standIn = (desc: Desc): Element => {
  const made = makeStandIn(desc);
  standIns.add(made);
  return made;
};

const makeStandIn = (desc: Desc): Element => {
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
    // The service put the sheet in (it had not sent it in this run): kept, as one asked for would be.
    if (desc.css !== undefined && isRemote(href)) sheets.set(href, desc.css);
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
      if (ns === HTML && desc.d) define(desc.n ?? '');
      element = ns === HTML ? document.createElement(desc.n ?? 'span') : document.createElementNS(ns, desc.n ?? 'g');
    } catch {
      element = document.createElement('span');
    }
  }
  register(desc.i, element);
  for (const [name, value] of Object.entries(desc.a ?? {})) {
    // The picture shows the page's own controls; the stand-in draws none of its own over them.
    if (desc.patch && (name === 'src' || name === 'data' || name === 'allow' || name === 'sandbox' || (name === 'controls' && desc.n === 'video'))) continue;
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
  if (desc.sc) scrolledAtStart.push([desc.i, desc.sc]);
  if (desc.is) hintSize(element, desc.is[0], desc.is[1]);
  return element;
};

/**
 * An image's own size (for one the page sets no size for), while the image itself is not here: a blank picture of
 * that size stands in, so the page's CSS sizes the box as it does the image, and what follows sits where it does in
 * the page. The image replaces it when it comes; a picture the element has already (the page's own data: one, or the
 * image itself) is never covered.
 */
const placeholders = new WeakMap<Element, string>();
const hintSize = (element: Element, width: number, height: number): void => {
  if (!(element instanceof HTMLImageElement) || !(width > 0 && height > 0)) return;
  const src = element.getAttribute('src');
  if (src && src !== placeholders.get(element)) return;
  const url = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}"/>`)}`;
  placeholders.set(element, url);
  element.setAttribute('src', url);
};

/**
 * A text node's text from the page. In an editable element the user is typing in here, the page's echo of the same
 * keys is most often what the node already holds; when it differs, the caret keeps its place (replacing a node's
 * text otherwise puts it at the node's start).
 */
const setTextData = (text: Text, data: string): void => {
  if (text.data === data) return;
  const selection = document.getSelection();
  const caret = selection && selection.rangeCount && selection.anchorNode === text && selection.isCollapsed ? selection.anchorOffset : null;
  text.data = data;
  if (caret !== null && selection) {
    try {
      selection.collapse(text, Math.min(caret, data.length));
    } catch {
      // the node left the document meanwhile
    }
  }
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
  if (desc.n === 'link' && desc.css === undefined && desc.a?.href && isRemote(desc.a.href) && !sheets.has(desc.a.href) && !failed.has(desc.a.href)) out.add(desc.a.href);
  for (const child of desc.c ?? []) linkedSheets(child, out);
  for (const child of desc.s ?? []) linkedSheets(child, out);
  return out;
};

/** What the frame keeps of resources across pages; past it, a new page starts without (the service keeps them). */
const KEPT_BYTES_MAX = 200_000_000;
let keptBytes = 0;
const forgetResources = (): void => {
  for (const url of blobs.values()) URL.revokeObjectURL(url);
  blobs.clear();
  sheets.clear();
  keptBytes = 0;
};

const showSnapshot = (message: Snapshot, doc: number): void => {
  if (doc !== shownDoc && keptBytes > KEPT_BYTES_MAX) forgetResources();
  shownDoc = doc;
  input.reset();
  scrolledAtStart = [];
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
  pageWidth = message.lw ?? 0;
  setAdopted(message.adopted);
  fitWidth();
  input.pageScrolled(0, message.scroll[0], message.scroll[1]);
  for (const [id, [left, top]] of scrolledAtStart) input.pageScrolled(id, left, top);
  scrolledAtStart = [];
  for (const [id, picture] of patchPictures) {
    const element = nodes.get(id);
    if (element instanceof Element) paintPatch(element, picture);
  }
  if (message.focus) input.pageFocused(message.focus);
};

/** A new page: shown once its style sheets are here, or after HOLD_MS; what comes for it meanwhile waits too. */
const snapshot = (message: Snapshot, doc: number): void => {
  if (held) clearTimeout(held.timer);
  forDoc(doc);
  const pending = linkedSheets(message.root);
  if (!pending.size) {
    held = null;
    showSnapshot(message, doc);
    return;
  }
  for (const url of pending) want(url);
  held = { snapshot: message, doc, sheets: pending, after: [], timer: setTimeout(release, HOLD_MS) };
};

const release = (): void => {
  const current = held;
  if (!current) return;
  clearTimeout(current.timer);
  held = null;
  showSnapshot(current.snapshot, current.doc);
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
      if (text && text.nodeType === Node.TEXT_NODE) setTextData(text as Text, op[2] as string);
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
    case 'x':
      input.pageScrolled(op[1] as number, op[2] as number, op[3] as number);
      return true;
    case 'f':
      input.pageFocused(op[1] as number);
      return true;
    case 'w':
      pageWidth = op[1] as number;
      fitWidth();
      return true;
    case 'n': {
      const element = nodes.get(op[1] as number);
      if (element instanceof Element) hintSize(element, op[2] as number, op[3] as number);
      return true;
    }
    case 'd': {
      const element = nodes.get(op[1] as number);
      if (element instanceof Element && element.namespaceURI === HTML) define(element.localName);
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
  // Styles move the layout: the page's own scroll positions again, where the user has not scrolled here since.
  input.reapply();
};

const resourceArrived = (url: string, mime: string, content: { data?: string; text?: string }): void => {
  asked.delete(url);
  failed.delete(url);
  const bytes = content.text !== undefined ? content.text : Uint8Array.from(atob(content.data ?? ''), (char) => char.charCodeAt(0));
  keptBytes += typeof bytes === 'string' ? bytes.length : bytes.byteLength;
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
  const count = (failed.get(url)?.count ?? 0) + 1;
  const wait = RETRY_MS[count - 1];
  const failure = { count, until: wait === undefined ? Infinity : Date.now() + wait };
  failed.set(url, failure);
  if (held?.sheets.delete(url) && held.sheets.size === 0) release();
  if (wait === undefined) return;
  setTimeout(() => {
    failure.until = 0;
    if ([...linked.values()].includes(url) || waiting.has(url)) want(url);
  }, wait);
};

window.addEventListener('message', (event) => {
  if (event.source !== parent) return;
  const data = event.data as { cloak?: boolean; type?: string; doc?: number; reset?: boolean; messages?: unknown[]; url?: string; mime?: string; data?: string; text?: string; error?: string };
  if (!data?.cloak) return;
  if (data.type === 'events') {
    for (const message of data.messages ?? []) {
      const kind = (message as { k?: string }).k;
      if (kind === 'snap') snapshot(message as Snapshot, data.doc ?? 0);
      else if (kind === 'ops') {
        const ops = (message as { ops: Op[] }).ops;
        if (held) held.after.push(ops);
        else applyOps(ops);
      }
    }
  } else if (data.type === 'patches' && Array.isArray((data as { patches?: unknown }).patches)) {
    patchesArrived(data.doc ?? 0, (data as unknown as { patches: Array<{ id: number; mime: string; data: string; dx: number; dy: number; w: number; h: number }> }).patches);
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

// The page decides what a click does: a link, a form, a box or a disclosure here would act on its own. The page's
// answer (a new page, a value, an attribute) comes back as changes.
window.addEventListener('click', (event) => {
  const target = event.composedPath()[0];
  if (target instanceof Element && target.closest('a, area, button, input, label, summary')) event.preventDefault();
}, true);
window.addEventListener('auxclick', (event) => event.preventDefault(), true);
window.addEventListener('submit', (event) => event.preventDefault(), true);

post({ type: 'ready' });

export {};
