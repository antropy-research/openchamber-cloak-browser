// The user's input on the page in the panel (panel/frame-input.ts): checked, placed on the page, and made real input
// through the surface's input path (surface.ts), which also has the browser's own keys, the address and dialogs.
//
// A pointer or wheel event names the node it was over in the panel and where on it; it lands on that node in the
// page, wherever the page has it (mirror-recorder.ts, locate), so a page laid out a little differently (a font
// that differs) still gets the click on the right thing. Input made on a document the panel no longer shows is not
// applied to the new one, except a button's release.
import type { SurfaceInputEvent, SurfaceModifiers } from '@openchamber/sdk';

import type { Mirror } from './mirror.ts';
import type { Surface } from './surface.ts';

type Placed = { id: number; r: number; fx: number; fy: number; x: number; y: number };
export type MirrorInputEvent =
  | ({ type: 'pointer'; action: 'down' | 'up' | 'move'; button: number; buttons: number; modifiers: SurfaceModifiers } & Placed)
  | ({ type: 'wheel'; deltaX: number; deltaY: number; modifiers: SurfaceModifiers } & Placed)
  | { type: 'key'; action: 'down' | 'up'; key: string; code: string; keyCode?: number; modifiers: SurfaceModifiers }
  | { type: 'text'; text: string }
  | { type: 'select'; id: number; index: number }
  | { type: 'scroll'; id: number; left: number; top: number };
export type MirrorInput = { doc: number; events: MirrorInputEvent[] };

const EVENTS_MAX = 500;
const TEXT_MAX = 100_000;

const num = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const int = (value: unknown): value is number => Number.isInteger(value);
const str = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;

const readModifiers = (value: unknown): SurfaceModifiers | null => {
  const m = value as Record<string, unknown> | null;
  if (!m || typeof m !== 'object') return null;
  return { alt: m.alt === true, ctrl: m.ctrl === true, meta: m.meta === true, shift: m.shift === true };
};

const readPlaced = (e: Record<string, unknown>): Placed | null => {
  if (!int(e.id) || !int(e.r) || !num(e.fx) || !num(e.fy) || !num(e.x) || !num(e.y)) return null;
  return { id: e.id, r: e.r, fx: e.fx, fy: e.fy, x: e.x, y: e.y };
};

const readEvent = (value: unknown): MirrorInputEvent | null => {
  const e = value as Record<string, unknown> | null;
  if (!e || typeof e !== 'object') return null;
  switch (e.type) {
    case 'pointer': {
      const placed = readPlaced(e);
      const modifiers = readModifiers(e.modifiers);
      if (!placed || !modifiers || (e.action !== 'down' && e.action !== 'up' && e.action !== 'move') || !int(e.button) || !int(e.buttons)) return null;
      return { type: 'pointer', action: e.action, button: e.button, buttons: e.buttons, modifiers, ...placed };
    }
    case 'wheel': {
      const placed = readPlaced(e);
      const modifiers = readModifiers(e.modifiers);
      if (!placed || !modifiers || !num(e.deltaX) || !num(e.deltaY)) return null;
      return { type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY, modifiers, ...placed };
    }
    case 'key': {
      const modifiers = readModifiers(e.modifiers);
      if (!modifiers || (e.action !== 'down' && e.action !== 'up') || !str(e.key, 64) || !str(e.code, 64)) return null;
      return { type: 'key', action: e.action, key: e.key, code: e.code, ...(int(e.keyCode) && e.keyCode >= 0 && e.keyCode <= 255 ? { keyCode: e.keyCode } : {}), modifiers };
    }
    case 'text':
      return str(e.text, TEXT_MAX) && e.text ? { type: 'text', text: e.text } : null;
    case 'select':
      return int(e.id) && int(e.index) ? { type: 'select', id: e.id, index: e.index } : null;
    case 'scroll':
      return int(e.id) && num(e.left) && num(e.top) ? { type: 'scroll', id: e.id, left: Math.round(e.left), top: Math.round(e.top) } : null;
    default:
      return null;
  }
};

/** `POST /mirror/input`'s body, or null when it is not one. */
export const readMirrorInput = (body: unknown): MirrorInput | null => {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || !int(b.doc) || !Array.isArray(b.events) || b.events.length > EVENTS_MAX) return null;
  const events: MirrorInputEvent[] = [];
  for (const value of b.events) {
    const event = readEvent(value);
    if (!event) return null;
    events.push(event);
  }
  return { doc: b.doc, events };
};

/** Applies the panel's input, in order. */
export const applyMirrorInput = async (input: MirrorInput, mirror: Mirror, surface: Surface): Promise<void> => {
  let batch: SurfaceInputEvent[] = [];
  const flush = async (): Promise<void> => {
    if (!batch.length) return;
    const events = batch;
    batch = [];
    await surface.input(events, { css: true });
  };
  for (const event of input.events) {
    switch (event.type) {
      case 'pointer':
      case 'wheel': {
        const current = input.doc === mirror.document;
        // On a document the panel no longer shows, only a release goes (no button stays held), where it was.
        if (!current && !(event.type === 'pointer' && event.action === 'up')) continue;
        const placed = current ? await mirror.locate(input.doc, event.id, event.r, event.fx, event.fy) : null;
        const [x, y] = placed ?? [event.x, event.y];
        if (event.type === 'pointer') {
          batch.push({ type: 'pointer', action: event.action, x, y, button: event.button, buttons: event.buttons, modifiers: event.modifiers });
        } else {
          batch.push({ type: 'wheel', x, y, deltaX: event.deltaX, deltaY: event.deltaY, modifiers: event.modifiers });
        }
        break;
      }
      case 'key':
        batch.push({ type: 'key', action: event.action, key: event.key, code: event.code, ...(event.keyCode !== undefined ? { keyCode: event.keyCode } : {}), modifiers: event.modifiers });
        break;
      case 'text':
        batch.push({ type: 'text', text: event.text });
        break;
      case 'select':
        await flush();
        await mirror.select(input.doc, event.id, event.index);
        break;
      case 'scroll':
        await flush();
        await mirror.scrollTo(input.doc, event.id, event.left, event.top);
        break;
      default:
    }
  }
  await flush();
};
