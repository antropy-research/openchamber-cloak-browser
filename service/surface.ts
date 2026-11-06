// The shared surface (GUEST_SURFACES in @openchamber/sdk's GUEST_SERVICES.md): the shown tab's CDP screencast as
// frames, the panel's size and pixel ratio as the page's, and the user's pointer, keys, wheel and text as CDP input.
// While no browser frame exists (downloading, starting, failed), a transparent picture whose title says why.
import { deflateSync } from 'node:zlib';

import { SURFACE_TITLE_MAX, type SurfaceController, type SurfaceInputEvent } from '@openchamber/sdk';

import { toUrl } from './address.ts';
import type { Browser, Tab } from './browser.ts';
import type { Cdp, CdpEvent } from './cdp.ts';

const QUALITY = 80;
/** OpenChamber asks for a frame with `wait=25000`; a request is never held longer. */
const FRAME_WAIT_MAX_MS = 25_000;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;
const MAX_WIDTH = 3840;
const MAX_HEIGHT = 2400;
/** Two presses this close in time and place are one double click (Chrome's own numbers on Linux are similar). */
const MULTI_CLICK_MS = 500;
/** How long the address keeps what is typed for it without a key, waiting for the strip's field. */
const TYPING_MS = 10_000;
const MULTI_CLICK_PX = 5;

type Frame = { bytes: Buffer; width: number; height: number; mime: 'image/jpeg' | 'image/png' };
type Modifiers = { alt: boolean; ctrl: boolean; meta: boolean; shift: boolean };

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.round(value)));

/** Width and height from a JPEG's start-of-frame segment. */
export const jpegSize = (bytes: Buffer): { width: number; height: number } | null => {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
};

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), body.length + 4);
  return chunk;
};

/** A fully transparent picture: the panel's own background shows through, in any theme. */
const blankPicture = (width: number, height: number): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const ascii = (text: string): string => text.replace(/[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The title OpenChamber shows above the picture: an HTTP header, so ASCII; a page title that is not, its host. */
const headerTitle = (title: string, url: string): string => {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (clean && /^[\x20-\x7e]+$/.test(clean)) return clean.slice(0, SURFACE_TITLE_MAX);
  try {
    const host = new URL(url).hostname;
    if (host) return host.slice(0, SURFACE_TITLE_MAX);
  } catch {
    // not a URL
  }
  return 'Cloak Browser';
};

const MOUSE_BUTTONS = ['left', 'middle', 'right', 'back', 'forward'] as const;

/** The pressed button a move carries (a drag), from the DOM's `buttons` mask. */
const heldButton = (buttons: number): string => {
  if (buttons & 1) return 'left';
  if (buttons & 2) return 'right';
  if (buttons & 4) return 'middle';
  if (buttons & 8) return 'back';
  if (buttons & 16) return 'forward';
  return 'none';
};

const KEY_CODES: Record<string, number> = {
  Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, Pause: 19, CapsLock: 20, Escape: 27, ' ': 32,
  PageUp: 33, PageDown: 34, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Insert: 45, Delete: 46, Meta: 91, ContextMenu: 93,
};

/** The Windows virtual key code the page sees; OpenChamber 2.6 sends the viewer's own, older hosts none. */
const keyCodeOf = (key: string, code: string, given?: number): number => {
  if (given !== undefined && given > 0) return given;
  if (KEY_CODES[key] !== undefined) return KEY_CODES[key];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return 111 + Number(key.slice(1));
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  if (key.length === 1) return key.toUpperCase().charCodeAt(0);
  return 0;
};

const locationOf = (code: string): number => {
  if (code.startsWith('Numpad')) return 3;
  if (/Left$/.test(code) && /^(Shift|Control|Alt|Meta)/.test(code)) return 1;
  if (/Right$/.test(code) && /^(Shift|Control|Alt|Meta)/.test(code)) return 2;
  return 0;
};

/** The editing command a Control chord runs; Chrome on Linux runs them only when told. */
const COMMANDS: Record<string, string> = { a: 'selectAll', c: 'copy', x: 'cut', v: 'paste', z: 'undo', y: 'redo' };

/** What the page reads as the user's copy: the selection in a text field, or else in the document. */
const SELECTION_SCRIPT = `(() => {
  const field = document.activeElement;
  if (field && (field.tagName === 'TEXTAREA' || (field.tagName === 'INPUT' && /^(text|search|url|tel|email|password|number)$/i.test(field.type)))) {
    try { return field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0); } catch { return ''; }
  }
  return String(getSelection() ?? '');
})()`;

export class Surface {
  seq = 1;
  controller: SurfaceController = 'none';
  private deviceWidth = 1280;
  private deviceHeight = 800;
  private dpr = 1;
  private mac = false;
  private cssWidth = 1280;
  private cssHeight = 800;
  private frame: Frame | null = null;
  private placeholder: Frame | null = null;
  private readonly waiters = new Set<() => void>();
  private castSession: string | null = null;
  private casting: Promise<void> = Promise.resolve();
  /** The last press, for double and triple clicks: on the same document, near in time and place. */
  private lastPress = { at: 0, x: 0, y: 0, button: 'none', count: 0, url: '' };
  private shownTitle = '';
  private titleReadAt = 0;
  /** Until when the agent counts as driving (frames then say so, and OpenChamber shows "Agent is working"). */
  private agentUntil = 0;
  /** When the user last sent input; the strip looks more often while the picture is in use. */
  private inputAt = 0;
  /** Keys whose press a browser key or the address took: their release stays away from the page too. */
  private readonly swallowed = new Set<string>();
  /**
   * The address was asked for (mod+L, mod+T) and the strip's field has not taken the focus yet: what is typed until
   * it does is kept here and handed to the field (takeAddress); Enter opens it at once.
   */
  private typing: { seq: number; draft: string; until: number } | null = null;
  private typingSeq = 0;

  /**
   * Whether a panel has told this process its size. OpenChamber sends the size when the panel's box changes, and only
   * over an open connection: a service started again (a restart of OpenChamber, an update) or a connection that opened
   * late gets none until the panel changes size. Until then the picture keeps the last size the service knew, and the
   * strip, which sees this, makes the panel tell it again (panel/main.ts, checkSize).
   */
  private sized = false;

  constructor(private readonly browser: Browser) {
    this.dpr = browser.scaleFactor;
    const saved = browser.savedSize;
    if (saved) {
      this.deviceWidth = clamp(saved.width, MIN_WIDTH, MAX_WIDTH);
      this.deviceHeight = clamp(saved.height, MIN_HEIGHT, MAX_HEIGHT);
      this.cssWidth = Math.max(100, Math.round(this.deviceWidth / this.dpr));
      this.cssHeight = Math.max(100, Math.round(this.deviceHeight / this.dpr));
      browser.fillSize = { width: this.cssWidth, height: this.cssHeight };
    }
    browser.onShown((tab) => this.recast(tab));
    browser.onCdpEvent((event) => this.onCdpEvent(event));
  }

  /** The browser's state moved: a new title for the placeholder, or the first frame of a new browser to wait for. */
  browserChanged(): void {
    if (this.browser.phase !== 'running') {
      this.frame = null;
      this.castSession = null;
    }
    const title = this.title();
    if (title !== this.shownTitle && (!this.frame || this.browser.phase !== 'running')) this.bump();
  }

  /** The panel's size in device pixels; answers the size the picture will have. */
  resize(width: number, height: number): { width: number; height: number } {
    const next = { width: clamp(width, MIN_WIDTH, MAX_WIDTH), height: clamp(height, MIN_HEIGHT, MAX_HEIGHT) };
    this.sized = true;
    void this.browser.rememberSize(next.width, next.height);
    if (next.width !== this.deviceWidth || next.height !== this.deviceHeight) {
      this.deviceWidth = next.width;
      this.deviceHeight = next.height;
      this.placeholder = null;
      this.fill();
    }
    return next;
  }

  /** What the strip reports about the window the panel is in: its pixel ratio and whether it is a Mac. */
  viewer(dpr: number, mac: boolean): void {
    const ratio = Math.max(1, Math.min(4, Math.round(dpr * 4) / 4));
    const changed = ratio !== this.dpr;
    this.dpr = ratio;
    this.mac = mac;
    // A new ratio restarts the browser (browser.ts, setScale); its first tab is then shown at the new size.
    void this.browser.setScale(ratio);
    if (changed) this.fill();
  }

  /** `GET /surface/frame?after=<seq>&wait=<ms>`: the picture once it is newer than `after`, else null (204). */
  async frameAfter(after: number, waitMs: number): Promise<{ frame: Frame; seq: number; title: string; agentActive: boolean } | null> {
    void this.browser.start().catch(() => {});
    const wait = clamp(waitMs, 0, FRAME_WAIT_MAX_MS);
    if (this.seq <= after && wait > 0) await this.next(wait);
    if (this.seq <= after) return null;
    const title = this.title();
    this.shownTitle = title;
    return { frame: this.current(), seq: this.seq, title, agentActive: this.agentActive };
  }

  async input(events: SurfaceInputEvent[]): Promise<void> {
    const cdp = await this.browser.ready();
    this.inputAt = Date.now();
    for (const event of events) {
      // The shown tab, for each event: a browser key earlier in the batch may have shown another.
      const tab = this.browser.tab(this.browser.shownId);
      // A page showing an alert, a confirm or a prompt takes no input, as in Chrome: Enter answers it with OK,
      // Escape with Cancel, and the strip's row has the buttons and the prompt's field.
      if (tab.dialog) {
        if (event.type === 'key' && event.action === 'down' && (event.key === 'Enter' || event.key === 'Escape')) {
          await this.browser.answerDialog(tab.id, event.key === 'Enter', tab.dialog.type === 'prompt' ? tab.dialog.defaultPrompt : undefined);
        }
        continue;
      }
      if (event.type === 'key' && await this.shortcut(event)) continue;
      if (this.typeIntoAddress(event)) continue;
      const session = await this.browser.sessionOf(tab);
      await this.browser.untilDialog(tab, this.dispatch(cdp, session, event));
    }
  }

  /**
   * What the strip shows besides the browser's state: the address asked for, whether the picture is in use, and the
   * picture's size in device pixels with whether a panel has given it since this process started.
   */
  stripState(): { address: { seq: number } | null; inUse: boolean; surface: { width: number; height: number; maxWidth: number; sized: boolean } } {
    if (this.typing && Date.now() > this.typing.until) this.typing = null;
    return {
      address: this.typing ? { seq: this.typing.seq } : null,
      inUse: Date.now() - this.inputAt < 3000,
      surface: { width: this.deviceWidth, height: this.deviceHeight, maxWidth: MAX_WIDTH, sized: this.sized },
    };
  }

  /** The strip's field has the focus: what was typed for it so far, and the keys go to the field from now on. */
  takeAddress(seq: number): string | null {
    if (!this.typing || this.typing.seq !== seq) return null;
    const { draft } = this.typing;
    this.typing = null;
    return draft;
  }

  async clipboard(): Promise<string> {
    const shown = this.browser.shown;
    // A page held by a dialog runs no script until it is answered.
    if (!shown || shown.dialog) return '';
    const value = await this.browser.evaluate<unknown>(shown.id, SELECTION_SCRIPT);
    return typeof value === 'string' ? value : '';
  }

  /** The agent is acting: frames carry it for a moment after. */
  noteAgent(): void {
    this.agentUntil = Date.now() + 4000;
  }

  get agentActive(): boolean {
    return Date.now() < this.agentUntil;
  }

  /**
   * The panel's size, in CSS pixels, is the size of every tab that fills it (all but those the agent sized): the
   * shown one is shown again at it, the others take it too.
   */
  private fill(): void {
    this.browser.fillSize = { width: Math.max(100, Math.round(this.deviceWidth / this.dpr)), height: Math.max(100, Math.round(this.deviceHeight / this.dpr)) };
    const shown = this.browser.shown;
    if (shown) this.recast(shown);
    else this.bump();
    for (const tab of this.browser.tabs.values()) {
      if (tab !== shown && tab.viewport === 'fill' && tab.sessionId) void this.browser.applyViewport(tab).catch(() => {});
    }
  }

  private current(): Frame {
    if (this.frame && this.browser.phase === 'running') return this.frame;
    this.placeholder ??= { bytes: blankPicture(this.deviceWidth, this.deviceHeight), width: this.deviceWidth, height: this.deviceHeight, mime: 'image/png' };
    return this.placeholder;
  }

  private title(): string {
    const state = this.browser.state();
    switch (state.phase) {
      case 'running':
        return this.frame ? headerTitle(state.title, state.url) : 'Cloak Browser: loading';
      case 'preparing': {
        const progress = state.progress;
        if (progress?.step === 'downloading') {
          const percent = progress.total ? ` ${Math.floor((progress.received / progress.total) * 100)}%` : '';
          return `Cloak Browser: downloading CloakBrowser${percent}`;
        }
        if (progress?.step === 'verifying') return 'Cloak Browser: checking the download';
        if (progress?.step === 'unpacking') return 'Cloak Browser: unpacking CloakBrowser';
        return 'Cloak Browser: preparing';
      }
      case 'starting':
        return 'Cloak Browser: starting';
      case 'failed':
        return `Cloak Browser: ${ascii(state.error ?? 'failed')}`.slice(0, SURFACE_TITLE_MAX);
      default:
        return 'Cloak Browser';
    }
  }

  private bump(): void {
    this.seq += 1;
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const wake of waiters) wake();
  }

  private next(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const wake = (): void => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      this.waiters.add(wake);
    });
  }

  private onCdpEvent(event: CdpEvent): void {
    // A new document starts a new run of clicks: a click on it makes no double click with one on the page before.
    if (event.method === 'Page.frameNavigated' && event.sessionId && event.sessionId === this.castSession && !(event.params.frame as { parentId?: string } | undefined)?.parentId) {
      this.lastPress = { at: 0, x: 0, y: 0, button: 'none', count: 0, url: '' };
      return;
    }
    if (event.method !== 'Page.screencastFrame' || !event.sessionId || event.sessionId !== this.castSession) return;
    const params = event.params as { data: string; sessionId: number };
    void this.browser.cdp?.send('Page.screencastFrameAck', { sessionId: params.sessionId }, event.sessionId).catch(() => {});
    const bytes = Buffer.from(params.data, 'base64');
    const size = jpegSize(bytes);
    if (!size) return;
    this.frame = { bytes, mime: 'image/jpeg', ...size };
    // The title above the picture follows the page's; a title changes without an event, so look now and then.
    const now = Date.now();
    if (now - this.titleReadAt > 1000) {
      this.titleReadAt = now;
      void this.browser.refresh();
    }
    this.bump();
  }

  /** Shows `tab` at its size: its window, its pixel ratio, and a screencast of it. One at a time. */
  private recast(tab: Tab): void {
    this.casting = this.casting.then(() => this.cast(tab)).catch((error: unknown) => {
      console.error('[cloak-browser] could not show the tab:', error);
    });
  }

  private async cast(tab: Tab): Promise<void> {
    const cdp = this.browser.cdp;
    if (!cdp || this.browser.shownId !== tab.id) return;
    const session = await this.browser.sessionOf(tab);
    if (this.castSession && this.castSession !== session) {
      void cdp.send('Page.stopScreencast', {}, this.castSession).catch(() => {});
    }
    this.browser.fillSize = { width: Math.max(100, Math.round(this.deviceWidth / this.dpr)), height: Math.max(100, Math.round(this.deviceHeight / this.dpr)) };
    if (tab.viewport === 'fill') {
      try {
        const { windowId } = await cdp.send<{ windowId: number }>('Browser.getWindowForTarget', { targetId: tab.id });
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: this.browser.fillSize.width, height: this.browser.fillSize.height } });
      } catch {
        // the emulated metrics below decide the page's size either way
      }
    }
    const size = await this.browser.applyViewport(tab);
    this.cssWidth = size.width;
    this.cssHeight = size.height;
    await cdp.send('Page.stopScreencast', {}, session).catch(() => {});
    if (this.castSession !== session) this.lastPress = { at: 0, x: 0, y: 0, button: 'none', count: 0, url: '' };
    this.castSession = session;
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: QUALITY, maxWidth: this.deviceWidth, maxHeight: this.deviceHeight, everyNthFrame: 1 }, session);
    // A page that is not painting sends no frame: take one, so a new tab or size shows at once.
    // Not long: a page held by a dialog may paint nothing until it is answered, and the next tab waits behind this.
    const shot = await cdp.send<{ data: string }>('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY }, session, 3000).catch(() => null);
    if (shot && this.castSession === session) {
      const bytes = Buffer.from(shot.data, 'base64');
      const size = jpegSize(bytes);
      if (size) {
        this.frame = { bytes, mime: 'image/jpeg', ...size };
        this.bump();
      }
    }
  }

  /**
   * The browser's own keys, which Chrome keeps from the page too: the tabs, history, reload and the address. mod is
   * Command on a Mac, else Control. While the picture has the focus OpenChamber's own shortcuts stand down, so the
   * keys it switches its tabs with (mod+Alt+←/→, mod+digit, mod+[ and mod+]) act on these tabs here.
   */
  private async shortcut(event: Extract<SurfaceInputEvent, { type: 'key' }>): Promise<boolean> {
    if (event.action === 'up') return this.swallowed.delete(event.code);
    const command = this.browserCommand(event);
    if (!command) return false;
    this.swallowed.add(event.code);
    this.typing = null;
    try {
      await command();
    } catch (error) {
      console.error('[cloak-browser] a browser key failed:', error);
    }
    return true;
  }

  private browserCommand(event: Extract<SurfaceInputEvent, { type: 'key' }>): (() => Promise<void>) | null {
    const { key, code } = event;
    const m = event.modifiers;
    const mac = this.mac;
    const mod = mac ? m.meta && !m.ctrl : m.ctrl && !m.meta;
    const letter = key.length === 1 ? key.toLowerCase() : '';
    const shown = this.browser.shownId;
    if (mod && !m.alt && !m.shift && letter === 't') {
      return async () => {
        await this.browser.newTab();
        this.typeAddress();
      };
    }
    if (mod && !m.alt && !m.shift && letter === 'w') return async () => (shown ? this.browser.closeTab(shown) : undefined);
    if (m.ctrl && !m.meta && !m.alt && key === 'Tab') return () => this.cycle(m.shift ? -1 : 1);
    if (mod && !m.alt && !m.shift && (key === 'PageDown' || key === 'PageUp')) return () => this.cycle(key === 'PageDown' ? 1 : -1);
    if (mod && m.alt && !m.shift && (key === 'ArrowRight' || key === 'ArrowLeft')) return () => this.cycle(key === 'ArrowRight' ? 1 : -1);
    if (mac && mod && !m.alt && m.shift && (code === 'BracketRight' || code === 'BracketLeft')) return () => this.cycle(code === 'BracketRight' ? 1 : -1);
    if (mod && !m.alt && !m.shift && /^Digit[1-9]$/.test(code)) return () => this.pick(Number(code.slice(5)));
    if (mod && !m.alt && !m.shift && (code === 'BracketLeft' || code === 'BracketRight')) return () => this.history(code === 'BracketLeft' ? 'back' : 'forward');
    if (!mac && m.alt && !m.ctrl && !m.meta && !m.shift && (key === 'ArrowLeft' || key === 'ArrowRight')) return () => this.history(key === 'ArrowLeft' ? 'back' : 'forward');
    if ((mod && !m.alt && letter === 'r') || (key === 'F5' && !m.alt && !m.meta)) return () => this.browser.reload(shown, m.shift || (key === 'F5' && m.ctrl));
    if ((mod && !m.alt && !m.shift && letter === 'l') || (!mac && m.alt && !m.ctrl && !m.meta && !m.shift && letter === 'd') || (key === 'F6' && !m.alt && !m.ctrl && !m.meta && !m.shift)) {
      return async () => this.typeAddress();
    }
    return null;
  }

  private async cycle(step: number): Promise<void> {
    const ids = [...this.browser.tabs.keys()];
    if (ids.length < 2) return;
    const at = ids.indexOf(this.browser.shownId ?? '');
    await this.browser.show(ids[(at + step + ids.length) % ids.length]);
  }

  /** mod+1 to mod+8: that tab; mod+9: the last one, as in Chrome. */
  private async pick(number: number): Promise<void> {
    const ids = [...this.browser.tabs.keys()];
    const id = number === 9 ? ids[ids.length - 1] : ids[number - 1];
    if (id && id !== this.browser.shownId) await this.browser.show(id);
  }

  private async history(direction: 'back' | 'forward'): Promise<void> {
    await this.browser.go(direction);
  }

  private typeAddress(): void {
    this.typingSeq += 1;
    this.typing = { seq: this.typingSeq, draft: '', until: Date.now() + TYPING_MS };
  }

  /** While the address waits for the strip's field: a key for it, or false for one that goes to the page. */
  private typeIntoAddress(event: SurfaceInputEvent): boolean {
    const typing = this.typing;
    if (!typing) return false;
    if (Date.now() > typing.until) {
      this.typing = null;
      return false;
    }
    if (event.type === 'pointer' && event.action === 'move') return false;
    if (event.type === 'text') {
      typing.draft += event.text;
      typing.until = Date.now() + TYPING_MS;
      return true;
    }
    // A click or the wheel on the page: the page is where the user is.
    if (event.type !== 'key') {
      this.typing = null;
      return false;
    }
    if (event.action === 'up') return false;
    const { key, modifiers: m } = event;
    if (key === 'Shift' || key === 'CapsLock' || key === 'Alt' || key === 'AltGraph' || key === 'Process' || key === 'Dead') return true;
    typing.until = Date.now() + TYPING_MS;
    if (key === 'Enter' || key === 'Escape') {
      this.typing = null;
      this.swallowed.add(event.code);
      const address = typing.draft.trim();
      if (key === 'Enter' && address) void this.browser.navigate(toUrl(address)).catch(() => {});
      return true;
    }
    if (key === 'Backspace') {
      typing.draft = Array.from(typing.draft).slice(0, -1).join('');
      this.swallowed.add(event.code);
      return true;
    }
    if (Array.from(key).length === 1) {
      if (m.ctrl || m.meta) {
        this.typing = null;
        return false;
      }
      typing.draft += key;
      this.swallowed.add(event.code);
      return true;
    }
    this.typing = null;
    return false;
  }

  /** CDP modifiers: Alt 1, Control 2, Meta 4, Shift 8. The page is Chrome on Windows: a Mac's Command is its Control. */
  private modifiers(modifiers: Modifiers): number {
    return (modifiers.alt ? 1 : 0) | (modifiers.ctrl || (this.mac && modifiers.meta) ? 2 : 0) | (!this.mac && modifiers.meta ? 4 : 0) | (modifiers.shift ? 8 : 0);
  }

  private async dispatch(cdp: Cdp, sessionId: string, event: SurfaceInputEvent): Promise<void> {
    switch (event.type) {
      case 'pointer':
        return this.pointer(cdp, sessionId, event);
      case 'wheel': {
        const { x, y } = this.toPage(event.x, event.y);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: event.deltaX, deltaY: event.deltaY, modifiers: this.modifiers(event.modifiers) }, sessionId);
        return;
      }
      case 'key':
        return this.key(cdp, sessionId, event);
      case 'text':
        await cdp.send('Input.insertText', { text: event.text }, sessionId);
        return;
      default:
        return;
    }
  }

  private toPage(x: number, y: number): { x: number; y: number } {
    const width = this.frame?.width ?? this.deviceWidth;
    const height = this.frame?.height ?? this.deviceHeight;
    return { x: (x * this.cssWidth) / width, y: (y * this.cssHeight) / height };
  }

  private async pointer(cdp: Cdp, sessionId: string, event: Extract<SurfaceInputEvent, { type: 'pointer' }>): Promise<void> {
    const { x, y } = this.toPage(event.x, event.y);
    const modifiers = this.modifiers(event.modifiers);
    if (event.action === 'move') {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: heldButton(event.buttons), buttons: event.buttons, modifiers }, sessionId);
      return;
    }
    const button = MOUSE_BUTTONS[event.button] ?? 'none';
    if (event.action === 'down') {
      // Control (Command on a Mac) or the middle button opens a link in a tab behind, which stays behind.
      if ((modifiers & 2) || event.button === 1) this.browser.expectBackgroundTab();
      const now = Date.now();
      const last = this.lastPress;
      // The address as the browser process has it: it changes as a navigation commits, before the new page shows.
      const url = this.browser.shown?.url ?? '';
      const again = now - last.at < MULTI_CLICK_MS && last.url === url && last.button === button && Math.abs(last.x - x) < MULTI_CLICK_PX && Math.abs(last.y - y) < MULTI_CLICK_PX;
      this.lastPress = { at: now, x, y, button, count: again ? last.count + 1 : 1, url };
    }
    await cdp.send('Input.dispatchMouseEvent', {
      type: event.action === 'down' ? 'mousePressed' : 'mouseReleased',
      x,
      y,
      button,
      buttons: event.buttons,
      clickCount: this.lastPress.count,
      modifiers,
    }, sessionId);
  }

  private async key(cdp: Cdp, sessionId: string, event: Extract<SurfaceInputEvent, { type: 'key' }>): Promise<void> {
    // Composition and dead keys carry no character of their own; their text arrives as a `text` event or not at all.
    if (event.key === 'Process' || event.key === 'Dead' || event.key === 'Unidentified') return;
    let { key, code } = event;
    let modifiers = this.modifiers(event.modifiers);
    // A Mac's line and word moves, as the Windows page knows them.
    if (this.mac && /^Arrow(Left|Right|Up|Down)$/.test(key)) {
      if (event.modifiers.meta && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        key = key === 'ArrowLeft' ? 'Home' : 'End';
        code = key;
        modifiers &= ~2;
      } else if (event.modifiers.meta) {
        key = key === 'ArrowUp' ? 'Home' : 'End';
        code = key;
      } else if (event.modifiers.alt && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        modifiers = (modifiers & ~1) | 2;
      }
    }
    if (this.mac && key === 'Backspace' && event.modifiers.alt) modifiers = (modifiers & ~1) | 2;
    const windowsVirtualKeyCode = keyCodeOf(key, code, key === event.key ? event.keyCode : undefined);
    const location = locationOf(code);
    if (event.action === 'up') {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers, location }, sessionId);
      return;
    }
    const control = (modifiers & 2) !== 0;
    const text = control ? undefined : key === 'Enter' ? '\r' : key.length === 1 ? key : undefined;
    const command = control && key.length === 1 ? COMMANDS[key.toLowerCase()] : undefined;
    const commands = command === 'undo' && (modifiers & 8) ? ['redo'] : command ? [command] : undefined;
    await cdp.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      key,
      code,
      windowsVirtualKeyCode,
      modifiers,
      location,
      ...(text ? { text, unmodifiedText: text } : {}),
      ...(commands ? { commands } : {}),
    }, sessionId);
  }
}
