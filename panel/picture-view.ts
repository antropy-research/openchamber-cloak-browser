// The page as a picture: the panel's fallback where HTML cannot show it (a page that is mostly a canvas, a map, a
// game, or one the frame keeps failing on), and the user's choice besides. The service's screencast (surface.ts)
// as the picture, and the user's pointer, wheel, keys and pasted text on it as positions on the screen: the same
// input path as the page as HTML (service/mirror-input.ts), with `r` -2 and no document.
import type { HostClient } from '@openchamber/sdk';

import { keepLocal, modifiersOf, pasteChord } from './keys.ts';

type Picture = { seq: number; mime?: string; data?: string; width?: number; height?: number; pageWidth?: number; pageHeight?: number; agentActive?: boolean };
type Placed = { id: number; r: number; fx: number; fy: number; x: number; y: number };

/** A wait under OpenChamber's 20 s for a page's request. */
const WAIT_MS = 15_000;
const MOVE_MS = 40;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class PictureView {
  readonly element: HTMLDivElement;
  private readonly image: HTMLImageElement;
  private running = false;
  private seq = 0;
  private url = '';
  private page = { width: 0, height: 0 };
  private pendingMove: Record<string, unknown> | null = null;
  private moveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sentDown = new Set<string>();

  constructor(parent: HTMLElement, private readonly host: HostClient, private readonly send: (events: Array<Record<string, unknown>>) => void) {
    this.element = document.createElement('div');
    this.element.className = 'picture';
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'application');
    this.element.setAttribute('aria-label', 'Page');
    this.element.hidden = true;
    this.image = document.createElement('img');
    this.image.alt = '';
    this.image.draggable = false;
    this.element.append(this.image);
    parent.append(this.element);
    this.listen();
  }

  get shown(): boolean {
    return this.running;
  }

  show(): void {
    if (this.running) return;
    this.running = true;
    this.element.hidden = false;
    this.seq = 0;
    void this.loop();
  }

  hide(): void {
    this.running = false;
    this.element.hidden = true;
  }

  focus(): void {
    this.element.focus();
  }

  private async loop(): Promise<void> {
    let failures = 0;
    while (this.running) {
      try {
        const query = new URLSearchParams({ after: String(this.seq), wait: String(WAIT_MS) });
        const result = await this.host.serviceRequest({ method: 'GET', path: `/mirror/picture?${query}` });
        const picture = JSON.parse(result.body) as Picture;
        failures = 0;
        if (!this.running || !picture.data || !picture.mime) continue;
        this.seq = picture.seq;
        this.page = { width: picture.pageWidth ?? 0, height: picture.pageHeight ?? 0 };
        const bytes = Uint8Array.from(atob(picture.data), (char) => char.charCodeAt(0));
        const old = this.url;
        this.url = URL.createObjectURL(new Blob([bytes], { type: picture.mime }));
        this.image.src = this.url;
        if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
      } catch {
        failures += 1;
        await sleep(Math.min(5000, 300 * failures));
      }
    }
  }

  /** A point on the picture as a point on the page, in its CSS pixels. */
  private place(event: MouseEvent): Placed {
    const box = this.image.getBoundingClientRect();
    const scaleX = this.page.width && box.width ? this.page.width / box.width : 1;
    const scaleY = this.page.height && box.height ? this.page.height / box.height : 1;
    const x = Math.round((event.clientX - box.left) * scaleX * 100) / 100;
    const y = Math.round((event.clientY - box.top) * scaleY * 100) / 100;
    return { id: 0, r: -2, fx: 0, fy: 0, x, y };
  }

  private flushMove(): void {
    if (this.moveTimer) clearTimeout(this.moveTimer);
    this.moveTimer = null;
    const move = this.pendingMove;
    this.pendingMove = null;
    if (move) this.send([move]);
  }

  private emit(events: Array<Record<string, unknown>>): void {
    this.flushMove();
    this.send(events);
  }

  private listen(): void {
    const target = this.element;
    target.addEventListener('pointerdown', (event) => {
      target.focus();
      event.preventDefault();
      this.emit([{ type: 'pointer', action: 'down', button: event.button, buttons: event.buttons, modifiers: modifiersOf(event), ...this.place(event) }]);
    });
    target.addEventListener('pointerup', (event) => {
      this.emit([{ type: 'pointer', action: 'up', button: event.button, buttons: event.buttons, modifiers: modifiersOf(event), ...this.place(event) }]);
    });
    target.addEventListener('pointermove', (event) => {
      this.pendingMove = { type: 'pointer', action: 'move', button: -1, buttons: event.buttons, modifiers: modifiersOf(event), ...this.place(event) };
      this.moveTimer ??= setTimeout(() => this.flushMove(), MOVE_MS);
    });
    target.addEventListener('wheel', (event) => {
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? target.clientHeight : 1;
      this.emit([{ type: 'wheel', deltaX: event.deltaX * scale, deltaY: event.deltaY * scale, modifiers: modifiersOf(event), ...this.place(event) }]);
    }, { passive: false });
    target.addEventListener('contextmenu', (event) => event.preventDefault());
    target.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229 || pasteChord(event)) return;
      // Nothing here takes text: every key is the page's, Tab and the chords included.
      if (keepLocal(event, false) || event.key.length === 1 || /^(Arrow|Page|Home|End|Backspace|Delete|Enter|Escape|Tab| )/.test(event.key)) event.preventDefault();
      this.sentDown.add(event.code || event.key);
      this.emit([{ type: 'key', action: 'down', key: event.key, code: event.code, keyCode: event.keyCode, modifiers: modifiersOf(event) }]);
    });
    target.addEventListener('keyup', (event) => {
      if (!this.sentDown.delete(event.code || event.key)) return;
      this.emit([{ type: 'key', action: 'up', key: event.key, code: event.code, keyCode: event.keyCode, modifiers: modifiersOf(event) }]);
    });
    target.addEventListener('paste', (event) => {
      const text = event.clipboardData?.getData('text/plain');
      if (text) {
        event.preventDefault();
        this.emit([{ type: 'text', text }]);
      }
    });
  }
}
