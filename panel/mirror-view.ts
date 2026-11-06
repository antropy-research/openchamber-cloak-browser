// The shown tab's page as HTML, under the strip: a nested frame (frame.ts) that the service's mirror fills with a
// snapshot of the page and then its changes (service/mirror.ts), and the resources it asks for (style sheets, images,
// fonts), which come through the service as well. The frame never reaches the site, and runs no script of the
// page's: it is built from data.
//
// The frame's document is made once and kept: a new page replaces its root, so the resources it already holds stay.
// Messages to and from it carry `cloak: true` (frame.ts lists them).
import type { HostClient } from '@openchamber/sdk';

type Answer = { run: string; tab: string | null; doc: number; from: number; seq: number; reset: boolean; messages: unknown[] };
type Resource = { mime: string; data: string } | { mime: string; text: string } | { error: string };
type FrameMessage = { cloak?: boolean; type?: string; urls?: unknown; doc?: unknown; events?: unknown };
type InputBatch = { doc: number; events: unknown[] };

/** A wait under OpenChamber's 20 s for a page's request (GUEST_REQUEST_TIMEOUT_MS). */
const WAIT_MS = 15_000;
/** A request body stays well under OpenChamber's 64 KB (GUEST_REQUEST_BODY_MAX). */
const URLS_BYTES_MAX = 40_000;
/** Resource requests at once: a page's first view asks for many, the service answers each from the browser. */
const FETCHES_MAX = 2;
/** The frame's own document: a script of ours and nothing else; the page's arrive as data. */
const FRAME_DOCUMENT = '<!doctype html><html><head><meta charset="utf-8"></head><body><script src="frame.js"></script></body></html>';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type MirrorViewOptions = {
  host: HostClient;
  /** The page has been shown (its first snapshot), or the view has none to show. */
  onShown?: (shown: boolean) => void;
};

export class MirrorView {
  readonly element: HTMLDivElement;
  private readonly frame: HTMLIFrameElement;
  private readonly host: HostClient;
  private readonly onShown: (shown: boolean) => void;
  private ready = false;
  /** What arrived before the frame was ready: given to it once it is. */
  private queued: unknown[] = [];
  private run = '';
  private after = 0;
  private shown = false;
  private stopped = false;
  private readonly wanted = new Set<string>();
  private fetching = 0;
  private sizeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSize = '';
  /** The user's input, in order: one request at a time, the rest waiting (a pointer move replaced by the next). */
  private inputQueue: InputBatch[] = [];
  private sendingInput = false;

  constructor(parent: HTMLElement, options: MirrorViewOptions) {
    this.host = options.host;
    this.onShown = options.onShown ?? (() => {});
    this.element = document.createElement('div');
    this.element.className = 'view';
    this.frame = document.createElement('iframe');
    this.frame.className = 'page';
    this.frame.title = 'Page';
    // The panel's own sandbox, said again: scripts (ours) and nothing else.
    this.frame.setAttribute('sandbox', 'allow-scripts');
    this.frame.srcdoc = FRAME_DOCUMENT;
    this.element.append(this.frame);
    parent.append(this.element);
    window.addEventListener('message', (event) => {
      if (event.source !== this.frame.contentWindow) return;
      this.fromFrame(event.data as FrameMessage);
    });
    new ResizeObserver(() => this.sizeChanged()).observe(this.element);
  }

  /** Starts following the service's mirror; runs until `stop`. */
  start(): void {
    void this.poll();
    this.sizeChanged();
    this.watchRatio();
  }

  /** The window moved to a screen with another pixel ratio, or was zoomed: the page is laid out for it again. */
  private watchRatio(): void {
    matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener('change', () => {
      this.sizeChanged(true);
      this.watchRatio();
    }, { once: true });
  }

  stop(): void {
    this.stopped = true;
  }

  /** The keyboard to the page, as after Enter in the address field. */
  focus(): void {
    this.frame.focus();
  }

  private toFrame(message: Record<string, unknown>): void {
    const full = { cloak: true, ...message };
    if (!this.ready) {
      this.queued.push(full);
      return;
    }
    this.frame.contentWindow?.postMessage(full, '*');
  }

  private fromFrame(message: FrameMessage): void {
    if (!message?.cloak) return;
    switch (message.type) {
      case 'ready': {
        this.ready = true;
        const queued = this.queued;
        this.queued = [];
        for (const each of queued) this.frame.contentWindow?.postMessage(each, '*');
        return;
      }
      case 'want':
        if (Array.isArray(message.urls)) {
          for (const url of message.urls) if (typeof url === 'string' && /^https?:/i.test(url)) this.wanted.add(url);
          this.fetchWanted();
        }
        return;
      case 'input':
        if (typeof message.doc === 'number' && Array.isArray(message.events)) this.queueInput({ doc: message.doc, events: message.events });
        return;
      case 'resync':
        // The frame could not apply a change (a node it does not have): the page again, whole. The request waiting
        // for news is answered at once, so the next one asks for the page.
        this.after = 0;
        void this.host.serviceRequest({ method: 'POST', path: '/mirror/wake', body: '{}' }).catch(() => {});
        return;
      default:
    }
  }

  private async poll(): Promise<void> {
    let failures = 0;
    while (!this.stopped) {
      let answer: Answer;
      try {
        const query = new URLSearchParams({ after: String(this.after), wait: String(WAIT_MS), run: this.run });
        const result = await this.host.serviceRequest({ method: 'GET', path: `/mirror/events?${query}` });
        if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
        answer = JSON.parse(result.body) as Answer;
        failures = 0;
      } catch {
        // The service is starting, restarting, or gone for a moment: try again, slower each time.
        failures += 1;
        await sleep(Math.min(5000, 300 * failures));
        continue;
      }
      this.accept(answer);
    }
  }

  private accept(answer: Answer): void {
    if (answer.run !== this.run) {
      // Another service process: its numbers start over, it does not know the view's size, and its first answer
      // for this view is the page whole.
      this.run = answer.run;
      this.after = 0;
      this.sizeChanged(true);
      if (!answer.reset) return;
    }
    let messages = answer.messages;
    if (!answer.reset) {
      // What this view has already is dropped; a gap (messages it never got) means the page again, whole.
      if (answer.from > this.after + 1 && messages.length) {
        this.after = 0;
        return;
      }
      messages = messages.slice(Math.max(0, this.after + 1 - answer.from));
    }
    this.after = answer.seq;
    if (messages.length) this.toFrame({ type: 'events', doc: answer.doc, reset: answer.reset, messages });
    const shown = answer.tab !== null && (this.shown || messages.some((message) => (message as { k?: string }).k === 'snap'));
    if (shown !== this.shown) {
      this.shown = shown;
      this.onShown(shown);
    }
  }

  private queueInput(batch: InputBatch): void {
    const last = this.inputQueue.at(-1);
    const isMove = (events: unknown[]) => events.length === 1 && (events[0] as { type?: string; action?: string }).type === 'pointer' && (events[0] as { action?: string }).action === 'move';
    if (last && last.doc === batch.doc && isMove(last.events) && isMove(batch.events)) this.inputQueue[this.inputQueue.length - 1] = batch;
    else if (last && last.doc === batch.doc && !isMove(last.events) && !isMove(batch.events) && last.events.length + batch.events.length <= 200) last.events.push(...batch.events);
    else this.inputQueue.push(batch);
    void this.sendInput();
  }

  private async sendInput(): Promise<void> {
    if (this.sendingInput) return;
    this.sendingInput = true;
    try {
      while (this.inputQueue.length) {
        const batch = this.inputQueue.shift() as InputBatch;
        await this.host.serviceRequest({ method: 'POST', path: '/mirror/input', body: JSON.stringify(batch) }).catch(() => {});
      }
    } finally {
      this.sendingInput = false;
    }
  }

  /** What the frame asked for, a request's worth at a time, at most FETCHES_MAX requests at once. */
  private fetchWanted(): void {
    while (this.fetching < FETCHES_MAX && this.wanted.size) {
      const urls: string[] = [];
      let bytes = 0;
      for (const url of this.wanted) {
        if (urls.length && bytes + url.length > URLS_BYTES_MAX) break;
        urls.push(url);
        bytes += url.length + 3;
      }
      for (const url of urls) this.wanted.delete(url);
      this.fetching += 1;
      void this.fetchSome(urls).finally(() => {
        this.fetching -= 1;
        this.fetchWanted();
      });
    }
  }

  private async fetchSome(urls: string[]): Promise<void> {
    try {
      const result = await this.host.serviceRequest({ method: 'POST', path: '/mirror/resources', body: JSON.stringify({ urls }) });
      const answer = JSON.parse(result.body) as { resources?: Record<string, Resource>; later?: string[] };
      for (const [url, resource] of Object.entries(answer.resources ?? {})) {
        this.toFrame({ type: 'res', url, ...resource });
      }
      for (const url of answer.later ?? []) this.wanted.add(url);
    } catch {
      // The frame asks again for what it still lacks when it next needs it.
      for (const url of urls) this.toFrame({ type: 'res', url, error: 'unavailable' });
    }
  }

  /**
   * The page is laid out at the view's size: the service is told it in device pixels, with the pixel ratio and
   * whether this is a Mac (its keys differ), when it changes.
   */
  private sizeChanged(force = false): void {
    if (this.sizeTimer) clearTimeout(this.sizeTimer);
    this.sizeTimer = setTimeout(() => {
      this.sizeTimer = null;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(this.element.clientWidth * ratio);
      const height = Math.round(this.element.clientHeight * ratio);
      if (width < 50 || height < 50) return;
      const key = `${width}x${height}@${ratio}`;
      if (!force && key === this.lastSize) return;
      this.lastSize = key;
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      void this.host.serviceRequest({ method: 'POST', path: '/mirror/view', body: JSON.stringify({ width, height, dpr: ratio, mac }) }).catch(() => {
        this.lastSize = '';
      });
    }, force ? 0 : 120);
  }
}
