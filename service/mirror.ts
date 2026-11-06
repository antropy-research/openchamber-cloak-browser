// The mirror: the shown tab's page as HTML for the panel, kept current with small changes, instead of pictures.
//
// The recorder (mirror-recorder.ts) runs in an isolated world of the page and queues a snapshot, then operations; this
// collects them every few tens of milliseconds while a panel watches, numbers them, and answers each panel's
// "everything after n" (a long poll, under OpenChamber's 20 s for a request). A panel behind the last snapshot, or new,
// gets the snapshot and what followed. Resources the page uses (styles it could not read, images, fonts) come through
// the browser (`resources`), from what the page already loaded or over its own network with its cookies, so the panel
// never reaches the site itself.
//
// What HTML cannot carry (a canvas, a video, another site's frame, a plugin) goes as pictures of those elements
// (patches): the part the window shows, captured while a panel watches, a few times a second for a canvas or a video
// and once a second for the rest, and sent only when it changed. Patches go beside the log, not in it: a panel gets
// the newest of each.
import { createHash, randomUUID } from 'node:crypto';

import type { Browser, Tab } from './browser.ts';
import { type FontFile, Fonts } from './fonts.ts';
import { mirrorRecorder } from './mirror-recorder.ts';

const RECORDER = `(${mirrorRecorder.toString()})();`;
const WORLD = 'cloak-mirror';
/** How often the recorder is drained while a panel watches. */
const DRAIN_MS = 50;
/** A panel that has not asked for this long has gone: the recorder stops until one asks again. */
const VIEWER_GONE_MS = 20_000;
/** The longest a request for news waits: OpenChamber gives a page's request 20 s. */
const WAIT_MAX_MS = 15_000;
/** Past this much since the last snapshot, the next drain starts over with a new one. */
const LOG_BYTES_MAX = 6_000_000;
/** One answer's resources, base64 included, stay under OpenChamber's 8 MB for a response. */
const RESOURCES_BYTES_MAX = 5_000_000;
const RESOURCE_BYTES_MAX = 4_000_000;
const CACHE_BYTES_MAX = 150_000_000;
/** How often the pictured elements are looked at, and how often each is captured at most. */
const PATCH_SCAN_MS = 250;
const PATCH_MOVING_MS = 250;
const PATCH_STILL_MS = 1000;
/**
 * A snapshot larger than this would not fit OpenChamber's 8 MB for an answer beside what comes with it: such a page
 * (a DOM of hundreds of thousands of nodes) is shown as a picture instead (`coverage` 1).
 */
const SNAPSHOT_BYTES_MAX = 5_000_000;
/**
 * Style sheets put into a snapshot, at most: a panel shows a page only once its sheets are here, and one it has to ask
 * for costs a round trip through OpenChamber each (0.8 to 1.5 s on a page with a few large ones).
 */
const INLINE_CSS_BYTES_MAX = 2_000_000;
/** A sheet the page is still loading is waited for this long (a browser does not paint before its sheets either). */
const INLINE_CSS_WAIT_MS = 2000;
/** A resource a panel asks for that the page is still loading: waited for this long before the network is asked. */
const RESOURCE_WAIT_MS = 1500;
/** Resources of one request fetched at once. */
const RESOURCE_FETCHES = 6;
/** Patches in one answer, base64 included: the rest come with the next. */
const PATCH_BYTES_MAX = 2_000_000;
const PATCH_QUALITY = 75;

type Entry = { seq: number; message: unknown; bytes: number };
/**
 * `run` names this service process (a panel that saw another starts over), `from` is the number of the first message
 * (a panel drops what it already has), `seq` the last one's, `reset` whether the first is a snapshot that replaces the
 * page.
 */
export type MirrorAnswer = {
  run: string;
  tab: string | null;
  doc: number;
  from: number;
  seq: number;
  reset: boolean;
  messages: unknown[];
  /** Pictures of elements HTML cannot carry, newer than the panel's `patch`; `patchSeq` is the newest it now has. */
  patches: Patch[];
  patchSeq: number;
  /** How much of the window those elements take (0 to 1): past half, the panel shows the page as a picture. */
  coverage: number;
};
/**
 * A font the page asks for (its computed font-family, weight and style) and the file of the system font the browser
 * drew it with (fonts.ts): what a panel in a Chromium-based browser draws it with too.
 */
export type FontFace = { stack: string; weight: string; style: string; file: number };
/** A plan is asked for again after this long (the page may show new text): the answer is kept meanwhile. */
const FONT_PLAN_MS = 3000;
/** One answer's font files, base64 included. */
const FONT_FILES_BYTES_MAX = 6_000_000;
/** A picture of the part of element `id` the window shows: `w`×`h` CSS pixels from (`dx`, `dy`) in its border box. */
export type Patch = { id: number; seq: number; mime: string; data: string; dx: number; dy: number; w: number; h: number };
type Resource = { mime: string; data: string };
/**
 * A resource as the panel gets it: text as text (style sheets, SVG), so OpenChamber's compression of the answer works
 * on it; other bytes as base64.
 */
type Delivered = { mime: string; data: string } | { mime: string; text: string };

const isText = (mime: string): boolean => mime === 'text/css' || mime === 'image/svg+xml' || mime.startsWith('text/');

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class Mirror {
  readonly run = randomUUID();
  private tab: Tab | null = null;
  private contextId: number | null = null;
  /** The shown document's number: a new one for every navigation or tab switch. */
  private doc = 0;
  private seq = 0;
  private log: Entry[] = [];
  private logBytes = 0;
  private lastViewerAt = 0;
  private draining = false;
  private injecting: Promise<void> | null = null;
  private readonly waiters = new Set<() => void>();
  private readonly cache = new Map<string, Resource>();
  private cacheBytes = 0;
  private mimeTypes = new Map<string, string>();
  private patches = new Map<number, Patch & { hash: string; at: number }>();
  private patchSeq = 0;
  private patchScanAt = 0;
  private coverage = 0;
  /** The shown document's snapshot was too large to send: the panel shows it as a picture. */
  private tooBig = false;
  /** When a panel last wanted the pictures: one that shows the whole page as a picture needs none. */
  private patchesWantedAt = 0;
  /**
   * Style sheets panels have had in this run (in a snapshot, or asked for): a later snapshot names them by address
   * only, and a panel that lacks one asks for it.
   */
  private readonly sheetsSent = new Set<string>();
  private readonly fonts = new Fonts();
  private fontPlanned: { doc: number; at: number; plan: Promise<{ faces: FontFace[]; root: string }> } | null = null;
  /** Sessions with the DOM and CSS domains on (for CSS.getPlatformFontsForNode). */
  private readonly cssSessions = new Set<string>();

  constructor(private readonly browser: Browser) {
    browser.onShown((tab) => this.retarget(tab));
    browser.onCdpEvent((event) => {
      if (!this.tab || event.sessionId !== this.tab.sessionId) return;
      if (event.method === 'Page.frameNavigated') {
        const frame = event.params.frame as { parentId?: string };
        if (!frame.parentId) this.retarget(this.tab);
      }
    });
  }

  get watched(): boolean {
    return Date.now() - this.lastViewerAt < VIEWER_GONE_MS;
  }

  /**
   * `GET /mirror/events?after=n&wait=ms&run=r`: what the panel lacks, waiting for news up to `wait`. A panel that knew
   * another run has nothing of this one's.
   */
  async events(afterSeq: number, waitMs: number, run: string, patchAfterSeq = 0, picture = false): Promise<MirrorAnswer> {
    const known = run === this.run;
    const after = known ? afterSeq : 0;
    const patchAfter = known ? patchAfterSeq : 0;
    this.lastViewerAt = Date.now();
    if (!picture) this.patchesWantedAt = Date.now();
    void this.browser.start().catch(() => {});
    if (!this.tab && this.browser.shown) this.retarget(this.browser.shown);
    this.kick();
    const news = (): boolean => {
      const snapshotAt = this.log.find((entry) => (entry.message as { k?: string }).k === 'snap')?.seq ?? Infinity;
      if (this.log.length && (after < snapshotAt || this.seq > after)) return true;
      return after >= snapshotAt && this.patchSeq > patchAfter;
    };
    if (!news()) await this.next(Math.min(Math.max(waitMs, 0), WAIT_MAX_MS));
    this.lastViewerAt = Date.now();
    const snapshot = this.log.findIndex((entry) => (entry.message as { k?: string }).k === 'snap');
    const tab = this.tab?.id ?? null;
    if (snapshot === -1) return { run: this.run, tab, doc: this.doc, from: this.seq + 1, seq: this.seq, reset: false, messages: [], patches: [], patchSeq: patchAfter, coverage: this.coverage };
    const reset = after < this.log[snapshot].seq;
    const from = reset ? snapshot : this.log.findIndex((entry) => entry.seq > after);
    const messages = from === -1 ? [] : this.log.slice(from).map((entry) => entry.message);
    // A panel that builds the page again needs every picture again.
    const { patches, patchSeq } = this.patchesAfter(reset ? 0 : patchAfter);
    return { run: this.run, tab, doc: this.doc, from: from === -1 ? this.seq + 1 : this.log[from].seq, seq: this.seq, reset, messages, patches, patchSeq, coverage: this.coverage };
  }

  /** The pictures newer than `after`, oldest first, as many as one answer holds. */
  private patchesAfter(after: number): { patches: Patch[]; patchSeq: number } {
    const newer = [...this.patches.values()].filter((patch) => patch.seq > after).sort((a, b) => a.seq - b.seq);
    const patches: Patch[] = [];
    let bytes = 0;
    let patchSeq = after;
    for (const { hash: _hash, at: _at, ...patch } of newer) {
      if (patches.length && bytes + patch.data.length > PATCH_BYTES_MAX) break;
      patches.push(patch);
      bytes += patch.data.length;
      patchSeq = patch.seq;
    }
    if (patches.length === newer.length) patchSeq = Math.max(patchSeq, this.patchSeq);
    return { patches, patchSeq };
  }

  /** The shown document's number: input made on another document's nodes is not applied to this one's. */
  get document(): number {
    return this.doc;
  }

  /**
   * Where the user's pointer is in the page, on the node it was over in the panel (mirror-recorder.ts, locate); null
   * when that node is gone, or the input was made on another document.
   */
  async locate(doc: number, id: number, rect: number, fx: number, fy: number): Promise<[number, number] | null> {
    const value = await this.call(doc, `locate(${id}, ${rect}, ${fx}, ${fy})`);
    return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && Number.isFinite(n)) ? value as [number, number] : null;
  }

  /** A select's option the user picked in the panel's own list. */
  async select(doc: number, id: number, index: number): Promise<boolean> {
    return (await this.call(doc, `select(${id}, ${index})`)) === true;
  }

  /** A scroll the panel made that the page did not. */
  async scrollTo(doc: number, id: number, left: number, top: number): Promise<boolean> {
    return (await this.call(doc, `scrollTo(${id}, ${left}, ${top})`)) === true;
  }

  /**
   * `GET /mirror/fonts?doc=n`: per font the page asks for, the system font the browser drew it with (a panel in a
   * Chromium-based browser draws the page with them: fonts.ts). Web fonts are not in it: the panel has them already.
   */
  async fontPlan(doc: number): Promise<{ faces: FontFace[]; root: string }> {
    if (doc !== this.doc) return { faces: [], root: '' };
    const now = Date.now();
    if (this.fontPlanned?.doc === doc && now - this.fontPlanned.at < FONT_PLAN_MS) return this.fontPlanned.plan;
    const plan = Promise.all([this.planFonts(doc).catch(() => []), this.call(doc, 'rootFont()')]).then(([faces, root]) => ({ faces, root: typeof root === 'string' ? root : '' }));
    this.fontPlanned = { doc, at: now, plan };
    return plan;
  }

  private async planFonts(doc: number): Promise<FontFace[]> {
    const tab = this.tab;
    const cdp = this.browser.cdp;
    const contextId = this.contextId;
    const session = tab?.sessionId;
    if (!cdp || !session || contextId === null) return [];
    const stacks = await this.call(doc, 'fontStacks()');
    if (!Array.isArray(stacks)) return [];
    if (!this.cssSessions.has(session)) {
      await cdp.send('DOM.enable', {}, session);
      await cdp.send('CSS.enable', {}, session);
      this.cssSessions.add(session);
    }
    await cdp.send('DOM.getDocument', { depth: 0 }, session);
    const faces: FontFace[] = [];
    for (const [stack, weight, style, index] of stacks as Array<[string, string, string, number]>) {
      if (doc !== this.doc) return [];
      const probe = await cdp.send<{ result?: { objectId?: string } }>('Runtime.evaluate', { expression: `globalThis.__cloakMirror.fontProbe(${Number(index)})`, contextId, returnByValue: false }, session).catch(() => null);
      const objectId = probe?.result?.objectId;
      if (!objectId) continue;
      try {
        const { nodeId } = await cdp.send<{ nodeId: number }>('DOM.requestNode', { objectId }, session);
        const { fonts } = await cdp.send<{ fonts: Array<{ familyName: string; postScriptName?: string; isCustomFont: boolean; glyphCount: number }> }>('CSS.getPlatformFontsForNode', { nodeId }, session);
        // The font that drew most of the text, of those that can be sent (a CJK fallback is not).
        for (const font of fonts.filter((each) => !each.isCustomFont).sort((a, b) => b.glyphCount - a.glyphCount)) {
          const file = await this.fonts.find(font.postScriptName ?? '', font.familyName, weight, style);
          if (file === null) continue;
          faces.push({ stack, weight, style, file });
          break;
        }
      } catch {
        // the element went away meanwhile
      } finally {
        void cdp.send('Runtime.releaseObject', { objectId }, session).catch(() => {});
      }
    }
    return faces;
  }

  /** `POST /mirror/fonts/files`: the font files by number, as far as one answer holds them. */
  async fontFiles(ids: number[]): Promise<Record<number, FontFile>> {
    const out: Record<number, FontFile> = {};
    let bytes = 0;
    for (const id of ids) {
      const file = await this.fonts.file(id);
      if (!file) continue;
      if (bytes && bytes + file.data.length > FONT_FILES_BYTES_MAX) break;
      out[id] = file;
      bytes += file.data.length;
    }
    return out;
  }

  /** `GET /mirror/rects?selector=…`: where the page has the matching elements (to compare the panel's layout). */
  async rects(selector: string): Promise<unknown> {
    return this.call(this.doc, `rects(${JSON.stringify(selector)})`);
  }

  /** One of the recorder's calls (`__cloakMirror.<call>`), with numbers only, on the document `doc`. */
  private async call(doc: number, call: string): Promise<unknown> {
    const tab = this.tab;
    const cdp = this.browser.cdp;
    if (doc !== this.doc || this.contextId === null || !tab?.sessionId || !cdp) return null;
    try {
      const answer = await cdp.send<{ result?: { value?: unknown }; exceptionDetails?: unknown }>(
        'Runtime.evaluate',
        { expression: `globalThis.__cloakMirror ? globalThis.__cloakMirror.${call} : null`, contextId: this.contextId, returnByValue: true },
        tab.sessionId,
        3000,
      );
      return answer.exceptionDetails ? null : answer.result?.value ?? null;
    } catch {
      return null;
    }
  }

  /** `POST /mirror/resources`: the bytes behind these addresses, as far as one answer holds them. */
  async resources(urls: string[]): Promise<{ resources: Record<string, Delivered | { error: string }>; later: string[] }> {
    const resources: Record<string, Delivered | { error: string }> = {};
    const later: string[] = [];
    let bytes = 0;
    // A few at a time: one the page is still loading may be waited for (resource), and the rest go on meanwhile.
    const queue = [...urls];
    const worker = async (): Promise<void> => {
      for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
        if (bytes > RESOURCES_BYTES_MAX) {
          later.push(url);
          continue;
        }
        const resource = await this.resource(url).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
        if (!resource) {
          resources[url] = { error: 'not found' };
          continue;
        }
        if ('error' in resource) {
          resources[url] = resource;
          continue;
        }
        resources[url] = isText(resource.mime) ? { mime: resource.mime, text: Buffer.from(resource.data, 'base64').toString('utf8') } : resource;
        if (resource.mime === 'text/css') this.sheetsSent.add(url);
        bytes += resource.data.length;
      }
    };
    await Promise.all(Array.from({ length: Math.min(RESOURCE_FETCHES, urls.length) }, worker));
    return { resources, later };
  }

  /** The recorder rests in the page shown: the service is stopping. */
  async release(): Promise<void> {
    await this.stopRecorder(this.tab, this.contextId);
    this.contextId = null;
  }

  private async stopRecorder(tab: Tab | null, contextId: number | null): Promise<void> {
    if (!tab?.sessionId || contextId === null || !this.browser.cdp) return;
    await this.browser.cdp.send('Runtime.evaluate', { expression: 'globalThis.__cloakMirror && globalThis.__cloakMirror.stop()', contextId }, tab.sessionId, 3000).catch(() => {});
  }

  private retarget(tab: Tab): void {
    // Another tab: the recorder in the one shown before rests (its queue would grow with nobody draining it).
    if (this.tab && this.tab !== tab) void this.stopRecorder(this.tab, this.contextId);
    this.tab = tab;
    this.contextId = null;
    this.doc += 1;
    this.mimeTypes = new Map();
    this.patches = new Map();
    this.coverage = 0;
    this.tooBig = false;
    // A new document: the panel starts over from its snapshot.
    this.log = [];
    this.logBytes = 0;
    this.wake();
    this.kick();
  }

  private append(message: unknown): void {
    let text = JSON.stringify(message);
    const snapshot = (message as { k?: string }).k === 'snap';
    if (snapshot) {
      this.log = [];
      this.logBytes = 0;
      this.tooBig = text.length > SNAPSHOT_BYTES_MAX;
      if (this.tooBig) {
        // Too large to send: an empty page in its place, and the panel shows the page as a picture.
        const { url, title } = message as { url?: string; title?: string };
        message = { k: 'snap', url, title, quirks: false, root: null, adopted: '', scroll: [0, 0] };
        text = JSON.stringify(message);
        this.coverage = 1;
      }
    } else if (this.tooBig) {
      // Changes to nodes the panel does not have.
      return;
    }
    this.seq += 1;
    this.log.push({ seq: this.seq, message, bytes: text.length });
    this.logBytes += text.length;
  }

  wake(): void {
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const wake of waiters) wake();
  }

  private next(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      this.waiters.add(wake);
    });
  }

  /** The drain loop runs while a panel watches; it injects the recorder first when the document has none. */
  private kick(): void {
    if (this.draining || !this.watched) return;
    this.draining = true;
    void this.loop().finally(() => {
      this.draining = false;
    });
  }

  private async loop(): Promise<void> {
    while (this.watched) {
      const tab = this.tab;
      const cdp = this.browser.cdp;
      if (!tab || !cdp || this.browser.phase !== 'running') {
        await sleep(200);
        if (!this.tab && this.browser.shown) this.retarget(this.browser.shown);
        continue;
      }
      if (this.contextId === null) {
        this.injecting ??= this.inject(tab).finally(() => {
          this.injecting = null;
        });
        await this.injecting;
        if (this.contextId === null) {
          await sleep(200);
          continue;
        }
      }
      const doc = this.doc;
      let text = '';
      try {
        const answer = await cdp.send<{ result?: { value?: unknown }; exceptionDetails?: unknown }>(
          'Runtime.evaluate',
          { expression: 'globalThis.__cloakMirror ? globalThis.__cloakMirror.drain() : null', contextId: this.contextId, returnByValue: true },
          tab.sessionId ?? undefined,
          5000,
        );
        if (answer.result?.value === null || answer.exceptionDetails) {
          this.contextId = null;
          continue;
        }
        text = typeof answer.result?.value === 'string' ? answer.result.value : '';
      } catch {
        // The document went away under us: the next turn injects into the new one.
        this.contextId = null;
        await sleep(100);
        continue;
      }
      if (doc === this.doc && text) {
        for (const message of JSON.parse(text) as unknown[]) {
          if ((message as { k?: string }).k === 'snap') await this.inlineSheets(message as { root?: unknown });
          if (doc !== this.doc) break;
          this.append(message);
        }
        if (this.logBytes > LOG_BYTES_MAX) await this.restart(tab);
        this.wake();
      }
      if (doc === this.doc && Date.now() - this.patchScanAt >= PATCH_SCAN_MS) {
        this.patchScanAt = Date.now();
        if (await this.capturePatches(tab, doc)) this.wake();
      }
      await sleep(DRAIN_MS);
    }
    // Nobody watches: the recorder rests until a panel asks again.
    await this.stopRecorder(this.tab, this.contextId);
    this.contextId = null;
  }

  /**
   * The style sheets a snapshot links that no panel has had in this run, put into it (`css` on the link), from what
   * the page loaded: the panel shows the page at once instead of asking for each. At most INLINE_CSS_BYTES_MAX.
   */
  private async inlineSheets(snapshot: { root?: unknown }): Promise<void> {
    type Node = { n?: string; a?: Record<string, string>; c?: Node[]; s?: Node[]; css?: string };
    const links: Node[] = [];
    const walk = (node: Node | undefined): void => {
      if (!node || typeof node !== 'object') return;
      if (node.n === 'link' && node.a?.href && /^https?:/i.test(node.a.href) && !this.sheetsSent.has(node.a.href)) links.push(node);
      for (const child of node.c ?? []) walk(child);
      for (const child of node.s ?? []) walk(child);
    };
    walk(snapshot.root as Node);
    // All at once: the browser answers each from what the page loaded, or once it has.
    const until = Date.now() + INLINE_CSS_WAIT_MS;
    const fetched = await Promise.all(links.map((link) => this.loadedResource(link.a?.href as string, until).catch(() => null)));
    let bytes = 0;
    links.forEach((link, index) => {
      const found = fetched[index];
      if (!found) return;
      // A sheet because the page links it as one, whatever type its server said.
      const resource = found.mime === 'text/css' ? found : absoluteCss(link.a?.href as string, { mime: 'text/css', data: found.data });
      const css = Buffer.from(resource.data, 'base64').toString('utf8');
      if (bytes + css.length > INLINE_CSS_BYTES_MAX) return;
      bytes += css.length;
      link.css = css;
      this.sheetsSent.add(link.a?.href as string);
    });
  }

  /** Pictures of the elements HTML cannot carry that the window shows, where due and changed. */
  private async capturePatches(tab: Tab, doc: number): Promise<boolean> {
    const cdp = this.browser.cdp;
    const found = await this.call(doc, 'patches()') as { view?: [number, number]; list?: Array<[number, number, number, number, number, number, number, string]> } | null;
    const list = Array.isArray(found?.list) ? found.list : [];
    const area = found?.view ? found.view[0] * found.view[1] : 0;
    const coverage = area > 0 ? Math.min(1, list.reduce((sum, entry) => sum + entry[3] * entry[4], 0) / area) : 0;
    let changed = Math.abs(coverage - this.coverage) > 0.05;
    this.coverage = this.tooBig ? 1 : Math.round(coverage * 100) / 100;
    if (!cdp || !tab.sessionId || !list.length || Date.now() - this.patchesWantedAt > VIEWER_GONE_MS) return changed;
    for (const entry of list) {
      const [id, x, y, w, h, dx, dy, tag] = entry;
      const known = this.patches.get(id);
      const every = tag === 'canvas' || tag === 'video' ? PATCH_MOVING_MS : PATCH_STILL_MS;
      const moved = !known || known.dx !== dx || known.dy !== dy || known.w !== w || known.h !== h;
      if (!moved && Date.now() - known.at < every) continue;
      const shot = await cdp.send<{ data: string }>(
        'Page.captureScreenshot',
        { format: 'jpeg', quality: PATCH_QUALITY, clip: { x, y, width: w, height: h, scale: 1 }, captureBeyondViewport: false },
        tab.sessionId,
        3000,
      ).catch(() => null);
      if (!shot || doc !== this.doc) return changed;
      const hash = createHash('sha1').update(shot.data).digest('base64');
      if (known && !moved && known.hash === hash) {
        known.at = Date.now();
        continue;
      }
      this.patchSeq += 1;
      this.patches.set(id, { id, seq: this.patchSeq, mime: 'image/jpeg', data: shot.data, dx, dy, w, h, hash, at: Date.now() });
      changed = true;
    }
    return changed;
  }

  private async inject(tab: Tab): Promise<void> {
    const cdp = this.browser.cdp;
    if (!cdp) return;
    try {
      const session = await this.browser.sessionOf(tab);
      const { frameTree } = await cdp.send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree', {}, session);
      const { executionContextId } = await cdp.send<{ executionContextId: number }>('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: WORLD }, session);
      await cdp.send('Runtime.evaluate', { expression: `${RECORDER}\nglobalThis.__cloakMirror.start();`, contextId: executionContextId }, session, 10_000);
      if (this.tab === tab) this.contextId = executionContextId;
    } catch {
      // the page is between documents; the loop tries again
    }
  }

  /** Too much since the snapshot: a new snapshot replaces it all. */
  private async restart(tab: Tab): Promise<void> {
    if (this.contextId === null || !this.browser.cdp) return;
    await this.browser.cdp.send('Runtime.evaluate', { expression: 'globalThis.__cloakMirror.start()', contextId: this.contextId }, tab.sessionId ?? undefined, 5000).catch(() => {});
  }

  private remember(url: string, resource: Resource): void {
    this.cache.set(url, resource);
    this.cacheBytes += resource.data.length;
    for (const [key, value] of this.cache) {
      if (this.cacheBytes <= CACHE_BYTES_MAX) break;
      this.cache.delete(key);
      this.cacheBytes -= value.data.length;
    }
  }

  /**
   * A resource as the page has it, waiting until `until` while the page still loads it; null then. Never fetched
   * again over the network (the page is fetching it already). Taken only once the page's load of it is done (the
   * recorder's `loaded`): the browser's copy of a resource still loading is the part that has come, and a part kept
   * here and in the panel would stay for the session (a large sheet cut in two, the page's layout with it).
   */
  private async loadedResource(url: string, until: number): Promise<Resource | null> {
    for (;;) {
      const cached = this.cache.get(url);
      if (cached) return cached;
      const tab = this.tab;
      const cdp = this.browser.cdp;
      if (!tab?.sessionId || !cdp) return null;
      const whole = (await this.call(this.doc, `loaded(${JSON.stringify(url)})`)) === true;
      if (!whole) {
        if (Date.now() >= until) return null;
        await sleep(100);
        continue;
      }
      try {
        const { frameTree } = await cdp.send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree', {}, tab.sessionId);
        const answer = await cdp.send<{ content: string; base64Encoded: boolean }>('Page.getResourceContent', { frameId: frameTree.frame.id, url }, tab.sessionId, 3000);
        const data = answer.base64Encoded ? answer.content : Buffer.from(answer.content, 'utf8').toString('base64');
        if (data.length > RESOURCE_BYTES_MAX * 1.4) return null;
        const resource = absoluteCss(url, { mime: await this.mimeOf(frameTree.frame.id, url, tab.sessionId), data });
        this.remember(url, resource);
        return resource;
      } catch {
        // not loaded yet
      }
      if (Date.now() >= until) return null;
      await sleep(100);
    }
  }

  private async resource(url: string): Promise<Resource | null> {
    const cached = this.cache.get(url);
    if (cached) {
      this.cache.delete(url);
      this.cache.set(url, cached);
      return cached;
    }
    // The page's copy, once it has it whole: the page may be loading it now (a sheet its script added after the
    // snapshot, an image coming into view), and a second fetch would cost the site a second request.
    const loading = await this.loadedResource(url, Date.now() + RESOURCE_WAIT_MS).catch(() => null);
    if (loading) return loading;
    const tab = this.tab ?? this.browser.shown;
    const cdp = this.browser.cdp;
    if (!tab || !cdp) return null;
    const session = await this.browser.sessionOf(tab);
    const { frameTree } = await cdp.send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree', {}, session);
    const frameId = frameTree.frame.id;
    // Not among what the page has loaded whole: through the browser's network, with the page's cookies and its
    // fingerprint.
    const loaded = await cdp.send<{ resource: { success: boolean; stream?: string; headers?: Record<string, string>; httpStatusCode?: number } }>(
      'Network.loadNetworkResource',
      { frameId, url, options: { disableCache: false, includeCredentials: true } },
      session,
      15_000,
    );
    if (!loaded.resource.success || !loaded.resource.stream) return null;
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for (;;) {
        const part = await cdp.send<{ data: string; base64Encoded?: boolean; eof: boolean }>('IO.read', { handle: loaded.resource.stream, size: 1_048_576 }, session, 15_000);
        const bytes = part.base64Encoded ? Buffer.from(part.data, 'base64') : Buffer.from(part.data, 'utf8');
        chunks.push(bytes);
        total += bytes.length;
        if (total > RESOURCE_BYTES_MAX) return null;
        if (part.eof) break;
      }
    } finally {
      await cdp.send('IO.close', { handle: loaded.resource.stream }, session).catch(() => {});
    }
    const headers = loaded.resource.headers ?? {};
    const type = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] ?? '';
    const resource = absoluteCss(url, { mime: type.split(';')[0].trim() || guessMime(url), data: Buffer.concat(chunks).toString('base64') });
    this.remember(url, resource);
    return resource;
  }

  private async mimeOf(frameId: string, url: string, session: string): Promise<string> {
    if (!this.mimeTypes.has(url) && this.browser.cdp) {
      try {
        const { frameTree } = await this.browser.cdp.send<{ frameTree: { resources?: Array<{ url: string; mimeType: string }> } }>('Page.getResourceTree', {}, session);
        for (const entry of frameTree.resources ?? []) this.mimeTypes.set(entry.url, entry.mimeType);
      } catch {
        // guessed below
      }
    }
    void frameId;
    return this.mimeTypes.get(url) || guessMime(url);
  }
}

/** A style sheet's url()s and @imports made absolute against the sheet's own address: the panel has no base for them. */
const absoluteCss = (url: string, resource: Resource): Resource => {
  if (resource.mime !== 'text/css') return resource;
  const resolve = (value: string): string => {
    if (!value || /^(data:|blob:|#|about:)/i.test(value)) return value;
    try {
      return new URL(value, url).href;
    } catch {
      return value;
    }
  };
  const css = Buffer.from(resource.data, 'base64').toString('utf8')
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (_match, _quote: string, value: string) => `url("${resolve(value)}")`)
    .replace(/@import\s+(['"])([^'"]+)\1/g, (_match, _quote: string, value: string) => `@import url("${resolve(value)}")`);
  return { mime: resource.mime, data: Buffer.from(css, 'utf8').toString('base64') };
};

const guessMime = (url: string): string => {
  const path = url.split(/[?#]/)[0].toLowerCase();
  const ext = path.slice(path.lastIndexOf('.') + 1);
  return ({
    css: 'text/css', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
    svg: 'image/svg+xml', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf',
  } as Record<string, string>)[ext] ?? 'application/octet-stream';
};
