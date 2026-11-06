// The mirror's recorder. It runs in an isolated world of the shown tab's page (Page.createIsolatedWorld): the page's
// own scripts see neither it nor its observers, and it patches nothing of theirs. It numbers the page's nodes,
// describes the document once (a snapshot), then what changes (operations), and keeps both until the service drains
// them (`drain`, every few tens of milliseconds). The panel builds the page from that in a frame of its own.
//
// Self-contained: the service injects `(${mirrorRecorder.toString()})()`, so nothing here may refer to anything
// outside the function.
//
// What goes out, as JSON:
//   snapshot  { k: 'snap', url, title, quirks, root: Node, adopted: css, scroll: [x, y], focus: id | 0 }
//   changes   { k: 'ops', ops: Op[] }
// Node:  { i: id, x: text } for text; { i, n: tag, ns?: 's'|'m'|'h', a?: attrs, c?: Node[], s?: shadow Node[],
//          sa?: shadow css, css?: style text, p?: form state, sc?: [left, top] scrolled, patch?: 1 } for elements
// Op:    ['c', parentId, (id | Node)[]]   the parent's children now, existing ones by id, new ones whole
//        ['S', hostId, (id | Node)[]]     the same for an open shadow root
//        ['a', id, name, value | null]    an attribute set or removed
//        ['t', id, text]                  a text node's text
//        ['s', id, css]                   a style's rules (the page changed them through the CSSOM)
//        ['A', css]                       the document's constructed (adopted) style sheets
//        ['v', id, form state]            a form control's value
//        ['x', id | 0, left, top]         a scroll position (0: the document)
//        ['f', id | 0]                    the focused element (0: none)
//
// The service also calls in, with the ids the panel's input names: `locate` (where on the screen the user's pointer
// is, on the element it was over in the panel), `select` (a select's option the user picked in the panel) and
// `scrollTo` (a scroll the panel made that the page has not: find in page, for one).
export function mirrorRecorder(): void {
  type Json = { [key: string]: unknown };
  const world = window as unknown as { __cloakMirror?: unknown };
  if (world.__cloakMirror) return;

  const HTML = 'http://www.w3.org/1999/xhtml';
  const SVG = 'http://www.w3.org/2000/svg';
  const MATH = 'http://www.w3.org/1998/Math/MathML';
  /** Not rendered, or not ours to run: never mirrored. */
  const SKIP = new Set(['script', 'noscript', 'template', 'base', 'meta']);
  /** Drawn by the page's code or another document: mirrored as an empty box, which a picture fills. */
  const PATCH = new Set(['canvas', 'video', 'iframe', 'embed', 'object', 'audio']);
  const URL_ATTRIBUTES = new Set(['src', 'href', 'poster', 'action', 'formaction', 'data', 'background', 'cite', 'xlink:href']);

  const ids = new WeakMap<Node, number>();
  const byId = new Map<number, WeakRef<Node>>();
  /** Nodes the panel has (described in a snapshot or an operation and not removed since). */
  const sent = new WeakSet<Node>();
  /** Nodes removed from the page since they were sent: described whole again if they come back. */
  const detached = new WeakSet<Node>();
  const styles = new Map<number, { node: WeakRef<Element>; rules: number }>();
  /** Elements the panel shows as pictures (canvas, video, frames, plugins): the service captures them (`patches`). */
  const patchNodes = new Map<number, WeakRef<Element>>();
  const controls = new Map<number, { node: WeakRef<Element>; state: string }>();
  let nextId = 1;
  let queue: Json[] = [];
  let running = false;
  let adopted = '';

  const idOf = (node: Node): number => {
    let id = ids.get(node);
    if (!id) {
      id = nextId++;
      ids.set(node, id);
    }
    byId.set(id, new WeakRef(node));
    return id;
  };

  const absolute = (value: string, base: string = document.baseURI): string => {
    try {
      return new URL(value, base).href;
    } catch {
      return value;
    }
  };

  /** CSS with every url() absolute, so the panel can fetch what it names. */
  const cssUrls = (css: string, base: string): string => css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (match, _quote: string, url: string) => {
    if (!url || /^(data:|blob:|#|about:)/i.test(url)) return match;
    return `url("${absolute(url, base)}")`;
  });

  /** A sheet's rules as text (what the CSSOM holds now, rules added from script included), or null if unreadable. */
  const sheetText = (sheet: CSSStyleSheet | null, base: string): string | null => {
    if (!sheet) return null;
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      return null;
    }
    const parts: string[] = [];
    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];
      // An @import whose sheet is readable is flattened; one that is not stays, absolute, for the panel to fetch.
      if (rule instanceof CSSImportRule) {
        const inner = sheetText(rule.styleSheet, rule.styleSheet?.href ?? base);
        parts.push(inner ?? `@import url("${absolute(rule.href, base)}");`);
        continue;
      }
      parts.push(rule.cssText);
    }
    return cssUrls(parts.join('\n'), base);
  };

  const adoptedText = (sheets: readonly CSSStyleSheet[]): string => sheets.map((sheet) => sheetText(sheet, document.baseURI) ?? '').join('\n');

  const isStylesheet = (element: Element): boolean => /(^|\s)stylesheet(\s|$)/i.test(element.getAttribute('rel') ?? '');

  const attributesOf = (element: Element): Json => {
    const out: Json = {};
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name;
      if (/^on/i.test(name)) continue;
      let value = attribute.value;
      if (URL_ATTRIBUTES.has(name) && value && !/^(javascript:|data:|blob:|#)/i.test(value)) value = absolute(value);
      else if (name === 'style') value = cssUrls(value, document.baseURI);
      out[name] = value;
    }
    return out;
  };

  const formState = (element: Element): string | null => {
    if (element instanceof HTMLInputElement) {
      if (element.type === 'file') return null;
      return JSON.stringify({ v: element.value, k: element.checked });
    }
    if (element instanceof HTMLTextAreaElement) return JSON.stringify({ v: element.value });
    if (element instanceof HTMLSelectElement) return JSON.stringify({ v: element.value, si: element.selectedIndex });
    return null;
  };

  const ignored = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) return false;
    if (node.nodeType !== Node.ELEMENT_NODE) return true;
    const element = node as Element;
    // A script in any namespace (SVG has one too): the panel's frame would run it.
    if (element.localName.toLowerCase() === 'script' || (element.namespaceURI === HTML && SKIP.has(element.localName))) return true;
    return element.namespaceURI === HTML && element.localName === 'link' && !isStylesheet(element);
  };

  let observer: MutationObserver;
  /** Shadow roots attached after their host was described: attaching one is no mutation, and the page's attachShadow
   * is not ours to wrap. Looked for every second (sweepShadows). */
  const observedShadows = new WeakSet<ShadowRoot>();

  const serialize = (node: Node, parentNs: string | null): Json | null => {
    if (ignored(node)) return null;
    const id = idOf(node);
    sent.add(node);
    detached.delete(node);
    if (node.nodeType === Node.TEXT_NODE) return { i: id, x: (node as Text).data };
    const element = node as Element;
    const tag = element.localName;
    const out: Json = { i: id, n: tag };
    const ns = element.namespaceURI === SVG ? 's' : element.namespaceURI === MATH ? 'm' : null;
    // Marked where it changes: into SVG or MathML, and back to HTML (inside a foreignObject).
    if (ns !== parentNs) out.ns = ns ?? 'h';
    const attributes = attributesOf(element);
    if (element.namespaceURI === HTML) {
      if (tag === 'style') {
        out.a = attributes;
        out.css = sheetText((element as HTMLStyleElement).sheet, document.baseURI) ?? element.textContent ?? '';
        styles.set(id, { node: new WeakRef(element), rules: (element as HTMLStyleElement).sheet?.cssRules.length ?? 0 });
        return out;
      }
      if (tag === 'link') {
        // By address, readable or not: the panel fetches the sheet once through the service and keeps it, so a
        // site's styles cross once, not with every snapshot.
        const link = element as HTMLLinkElement;
        out.a = { rel: 'stylesheet', href: link.href, ...(link.media ? { media: link.media } : {}) };
        return out;
      }
      if (tag === 'img') {
        // The image the page chose for this width and pixel ratio: one fetch instead of every candidate.
        const image = element as HTMLImageElement;
        const chosen = image.currentSrc || image.getAttribute('src') || '';
        delete attributes.srcset;
        delete attributes.sizes;
        if (chosen) attributes.src = absolute(chosen);
      }
      if (tag === 'source' && element.parentElement?.localName === 'picture') {
        delete attributes.srcset;
      }
      if (PATCH.has(tag)) {
        out.patch = 1;
        delete attributes.src;
        delete attributes.srcdoc;
        delete attributes.data;
        patchNodes.set(id, new WeakRef(element));
      }
      const state = formState(element);
      if (state !== null) {
        out.p = JSON.parse(state);
        controls.set(id, { node: new WeakRef(element), state });
      }
    }
    if (Object.keys(attributes).length) out.a = attributes;
    if (element.scrollTop || element.scrollLeft) out.sc = [Math.round(element.scrollLeft), Math.round(element.scrollTop)];
    if (out.patch) return out;
    const children: Json[] = [];
    for (const child of Array.from(element.childNodes)) {
      const described = serialize(child, ns);
      if (described) children.push(described);
    }
    if (children.length) out.c = children;
    const shadow = element.shadowRoot;
    if (shadow) {
      const inside: Json[] = [];
      for (const child of Array.from(shadow.childNodes)) {
        const described = serialize(child, ns);
        if (described) inside.push(described);
      }
      out.s = inside;
      if (shadow.adoptedStyleSheets.length) out.sa = adoptedText(shadow.adoptedStyleSheets);
      observedShadows.add(shadow);
      observer.observe(shadow, { childList: true, attributes: true, characterData: true, subtree: true });
    }
    return out;
  };

  /** A child list for an operation: what the panel has by id, the rest whole. */
  const childList = (parent: Node, ns: string | null): Array<number | Json> => {
    const out: Array<number | Json> = [];
    for (const child of Array.from(parent.childNodes)) {
      if (ignored(child)) continue;
      if (sent.has(child) && !detached.has(child)) {
        out.push(ids.get(child) as number);
        continue;
      }
      const described = serialize(child, ns);
      if (described) out.push(described);
    }
    return out;
  };

  const nsOf = (node: Node): string | null => {
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : null;
    if (!element) return null;
    return element.namespaceURI === SVG ? 's' : element.namespaceURI === MATH ? 'm' : null;
  };

  const styleOwner = (node: Node | null): HTMLStyleElement | null => {
    const parent = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement ?? null;
    return parent && parent.namespaceURI === HTML && parent.localName === 'style' ? parent as HTMLStyleElement : null;
  };

  const restyle = (element: Element): Json | null => {
    const id = ids.get(element);
    if (!id || !sent.has(element)) return null;
    const css = sheetText((element as HTMLStyleElement).sheet, element instanceof HTMLLinkElement ? element.href : document.baseURI);
    if (css === null) return null;
    styles.set(id, { node: new WeakRef(element), rules: (element as HTMLStyleElement).sheet?.cssRules.length ?? 0 });
    return ['s', id, css] as unknown as Json;
  };

  const flush = (records: MutationRecord[]): void => {
    if (!running || records.length === 0) return;
    const parents = new Set<Node>();
    const attributes = new Map<Element, Set<string>>();
    const texts = new Set<Node>();
    const restyled = new Set<Element>();
    for (const record of records) {
      if (record.type === 'childList') {
        record.removedNodes.forEach((node) => detached.add(node));
        const owner = styleOwner(record.target);
        if (owner) restyled.add(owner);
        else parents.add(record.target);
      } else if (record.type === 'attributes') {
        const element = record.target as Element;
        let names = attributes.get(element);
        if (!names) attributes.set(element, (names = new Set()));
        names.add(record.attributeName ?? '');
      } else if (record.type === 'characterData') {
        const owner = styleOwner(record.target);
        if (owner) restyled.add(owner);
        else texts.add(record.target);
      }
    }
    const ops: unknown[] = [];
    const fresh = new WeakSet<Node>();
    const markFresh = (node: Json | number) => {
      if (typeof node === 'number') return;
      const live = byId.get(node.i as number)?.deref();
      if (live) fresh.add(live);
      for (const child of (node.c as Json[] | undefined) ?? []) markFresh(child);
      for (const child of (node.s as Json[] | undefined) ?? []) markFresh(child);
    };
    // Ancestors first: a parent described whole carries its children, and their own operations are then stale.
    const ordered = Array.from(parents).filter((node) => node.isConnected).sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    for (const parent of ordered) {
      if (parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        const host = (parent as ShadowRoot).host;
        if (!host || !sent.has(host) || fresh.has(host) || detached.has(host)) continue;
        const list = childList(parent, nsOf(host));
        list.forEach(markFresh);
        ops.push(['S', ids.get(host), list]);
        continue;
      }
      if (parent.nodeType === Node.DOCUMENT_NODE) {
        // The document's root was replaced (document.open): a new snapshot says it all.
        queue.push(snapshot());
        return;
      }
      if (!sent.has(parent) || fresh.has(parent) || detached.has(parent) || ignored(parent)) continue;
      if (PATCH.has((parent as Element).localName)) continue;
      const list = childList(parent, nsOf(parent));
      list.forEach(markFresh);
      ops.push(['c', ids.get(parent), list]);
    }
    for (const [element, names] of attributes) {
      if (!sent.has(element) || fresh.has(element) || detached.has(element) || !element.isConnected) continue;
      const id = ids.get(element);
      for (const name of names) {
        if (!name || /^on/i.test(name)) continue;
        if (element.localName === 'img' && (name === 'srcset' || name === 'sizes')) continue;
        let value = element.getAttribute(name);
        if (value !== null && URL_ATTRIBUTES.has(name) && !/^(javascript:|data:|blob:|#)/i.test(value)) value = absolute(value);
        else if (value !== null && name === 'style') value = cssUrls(value, document.baseURI);
        if (element.localName === 'img' && name === 'src') value = (element as HTMLImageElement).currentSrc || value;
        ops.push(['a', id, name, value]);
      }
    }
    for (const node of texts) {
      if (!sent.has(node) || fresh.has(node) || detached.has(node) || !node.isConnected) continue;
      ops.push(['t', ids.get(node), (node as Text).data]);
    }
    for (const element of restyled) {
      const op = restyle(element);
      if (op) ops.push(op);
    }
    if (ops.length) queue.push({ k: 'ops', ops });
  };

  /** What no mutation reports: rules added through the CSSOM, form values set from script, constructed sheets. */
  const sweep = (): void => {
    if (!running) return;
    sweepShadows();
    const ops: unknown[] = [];
    for (const [id, entry] of styles) {
      const element = entry.node.deref();
      if (!element || !element.isConnected) {
        styles.delete(id);
        continue;
      }
      let count = 0;
      try {
        count = (element as HTMLStyleElement).sheet?.cssRules.length ?? 0;
      } catch {
        continue;
      }
      if (count !== entry.rules) {
        const op = restyle(element);
        if (op) ops.push(op);
      }
    }
    for (const [id, entry] of controls) {
      const element = entry.node.deref();
      if (!element || !element.isConnected) {
        controls.delete(id);
        continue;
      }
      const state = formState(element);
      if (state !== null && state !== entry.state) {
        entry.state = state;
        ops.push(['v', id, JSON.parse(state)]);
      }
    }
    const nextAdopted = adoptedText(document.adoptedStyleSheets);
    if (nextAdopted !== adopted) {
      adopted = nextAdopted;
      ops.push(['A', adopted]);
    }
    if (ops.length) queue.push({ k: 'ops', ops });
  };

  let lastShadowSweep = 0;
  const sweepShadows = (): void => {
    const now = Date.now();
    if (now - lastShadowSweep < 1000) return;
    lastShadowSweep = now;
    const ops: unknown[] = [];
    for (const element of Array.from(document.querySelectorAll('*'))) {
      const shadow = element.shadowRoot;
      if (!shadow || observedShadows.has(shadow) || !sent.has(element) || detached.has(element)) continue;
      observedShadows.add(shadow);
      observer.observe(shadow, { childList: true, attributes: true, characterData: true, subtree: true });
      ops.push(['S', ids.get(element), childList(shadow, nsOf(element))]);
    }
    if (ops.length) queue.push({ k: 'ops', ops });
  };

  /** The focused element, inside shadow roots too; 0 for none (the body). */
  const focusedId = (): number => {
    let element: Element | null = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    if (!element || element === document.body || element === document.documentElement || !sent.has(element)) return 0;
    return ids.get(element) ?? 0;
  };
  let lastFocus = 0;
  const onFocus = (): void => {
    if (!running) return;
    const id = focusedId();
    if (id === lastFocus) return;
    lastFocus = id;
    queue.push({ k: 'ops', ops: [['f', id]] });
  };
  const onFocusIn = (): void => queueMicrotask(onFocus);
  const onFocusOut = (): void => {
    setTimeout(onFocus, 0);
  };

  /** A control's value as soon as it changes (typing, a click on a box), not at the next sweep. */
  const onValue = (event: Event): void => {
    if (!running) return;
    const element = event.composedPath()[0];
    if (!(element instanceof Element)) return;
    const id = ids.get(element);
    const entry = id ? controls.get(id) : undefined;
    if (!id || !entry) return;
    const state = formState(element);
    if (state === null || state === entry.state) return;
    entry.state = state;
    queue.push({ k: 'ops', ops: [['v', id, JSON.parse(state)]] });
  };

  const scrolls = new Map<number, [number, number]>();
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  const onScroll = (event: Event): void => {
    if (!running) return;
    const target = event.target;
    const element = target === document || target === window ? null : target as Element;
    if (element && !sent.has(element)) return;
    const id = element ? ids.get(element) as number : 0;
    scrolls.set(id, element ? [element.scrollLeft, element.scrollTop] : [window.scrollX, window.scrollY]);
    scrollTimer ??= setTimeout(() => {
      scrollTimer = null;
      const ops = Array.from(scrolls, ([key, [left, top]]) => ['x', key, Math.round(left), Math.round(top)]);
      scrolls.clear();
      if (ops.length) queue.push({ k: 'ops', ops });
    }, 50);
  };

  const snapshot = (): Json => {
    styles.clear();
    controls.clear();
    patchNodes.clear();
    adopted = adoptedText(document.adoptedStyleSheets);
    const root = document.documentElement ? serialize(document.documentElement, null) : null;
    lastFocus = focusedId();
    return {
      k: 'snap',
      url: location.href,
      title: document.title,
      quirks: document.compatMode === 'BackCompat',
      root,
      adopted,
      scroll: [Math.round(window.scrollX), Math.round(window.scrollY)],
      focus: lastFocus,
    };
  };

  observer = new MutationObserver(flush);
  let sweeper: ReturnType<typeof setInterval> | null = null;

  const api = {
    /** Starts recording, with a snapshot first. Again: a new snapshot (the panel lost its place). */
    start(): void {
      if (running) observer.takeRecords();
      running = true;
      queue = [snapshot()];
      observer.observe(document, { childList: true, attributes: true, characterData: true, subtree: true });
      if (!sweeper) {
        document.addEventListener('scroll', onScroll, { capture: true, passive: true });
        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('focusout', onFocusOut, true);
        document.addEventListener('input', onValue, true);
        document.addEventListener('change', onValue, true);
        sweeper = setInterval(sweep, 400);
      }
    },
    stop(): void {
      running = false;
      observer.disconnect();
      if (sweeper) clearInterval(sweeper);
      sweeper = null;
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('input', onValue, true);
      document.removeEventListener('change', onValue, true);
      queue = [];
    },
    /** Everything since the last drain, as one JSON text ('' when there is nothing). */
    drain(): string {
      flush(observer.takeRecords());
      if (!queue.length) return '';
      const out = JSON.stringify(queue);
      queue = [];
      return out;
    },
    /**
     * Where the user's pointer is in the page's window, in CSS pixels: on the element it was over in the panel, at
     * the same place in it (fractions of its box, or of one of its line boxes for text that wraps). An element out
     * of the window is scrolled into it first, as little as it takes. Null when the element is gone or has no box.
     */
    locate(id: number, rect: number, fx: number, fy: number): [number, number] | null {
      const node = byId.get(id)?.deref();
      const element = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement ?? null;
      if (!element || !element.isConnected) return null;
      const box = (): DOMRect | null => {
        const rects = element.getClientRects();
        const chosen = rect >= 0 && rect < rects.length ? rects[rect] : element.getBoundingClientRect();
        return chosen.width > 0 || chosen.height > 0 ? chosen : null;
      };
      const point = (chosen: DOMRect): [number, number] => [
        chosen.left + Math.min(Math.max(fx, 0), 1) * chosen.width,
        chosen.top + Math.min(Math.max(fy, 0), 1) * chosen.height,
      ];
      let chosen = box();
      if (!chosen) return null;
      let [x, y] = point(chosen);
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
        element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        chosen = box();
        if (!chosen) return null;
        [x, y] = point(chosen);
      }
      return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
    },
    /** A select's option, picked in the panel's own list: selected here, with the events a pick sends. */
    select(id: number, index: number): boolean {
      const element = byId.get(id)?.deref();
      if (!(element instanceof HTMLSelectElement) || element.disabled || index < -1 || index >= element.options.length) return false;
      if (element.selectedIndex === index) return true;
      element.selectedIndex = index;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    /** A scroll the panel made that the page did not (find in page): the page follows. 0 is the document. */
    scrollTo(id: number, left: number, top: number): boolean {
      if (id === 0) {
        window.scrollTo({ left, top, behavior: 'instant' });
        return true;
      }
      const element = byId.get(id)?.deref();
      if (!(element instanceof Element)) return false;
      element.scrollTo({ left, top, behavior: 'instant' });
      return true;
    },
    /**
     * The pictured elements the window shows now: [id, x, y, width, height, dx, dy, tag] per element, its visible part
     * in document CSS pixels (for Page.captureScreenshot's clip), and where that part starts in the element's box;
     * with the window's size.
     */
    patches(): { view: [number, number]; list: Array<[number, number, number, number, number, number, number, string]> } {
      const out: Array<[number, number, number, number, number, number, number, string]> = [];
      const width = window.innerWidth;
      const height = window.innerHeight;
      for (const [id, ref] of patchNodes) {
        const element = ref.deref();
        if (!element || !element.isConnected) {
          patchNodes.delete(id);
          continue;
        }
        const box = element.getBoundingClientRect();
        const left = Math.max(box.left, 0);
        const top = Math.max(box.top, 0);
        const right = Math.min(box.right, width);
        const bottom = Math.min(box.bottom, height);
        if (right - left < 2 || bottom - top < 2) continue;
        if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const r = (value: number) => Math.round(value * 100) / 100;
        out.push([id, r(left + window.scrollX), r(top + window.scrollY), r(right - left), r(bottom - top), r(left - box.left), r(top - box.top), element.localName]);
      }
      return { view: [width, height], list: out };
    },
    /** The live node behind an id (the service maps the user's input with it). */
    node(id: number): Node | null {
      return byId.get(id)?.deref() ?? null;
    },
    idOf(node: Node): number | null {
      return ids.get(node) ?? null;
    },
  };
  world.__cloakMirror = api;
}
