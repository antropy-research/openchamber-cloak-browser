// The user's input on the page in the panel's frame. What this browser can show at once it shows: typing into a field
// (an input method included), selecting text, scrolling, a select's own list. Everything also goes to the service
// (service/mirror-input.ts), which makes it real input in the page, on the same element: a pointer or wheel event
// names the node it was over and where on it, not just a point on the screen.
//
// Scrolling: the frame scrolls at once, and the page gets the same wheel or keys. When the user stops, each scroller
// takes the page's position, which normally is where it already is; a page that kept the wheel for itself (a map)
// puts it back. A scroll nothing sent to the page (find in page) goes to the page as a position instead. The page's
// own scrolls (the agent, a script) show here when the user is not scrolling that scroller.
//
// Focus follows the page's (the `f` change), without taking the keyboard from OpenChamber when the frame does not
// have it. Keys follow keys.ts.
import { keepLocal, type Modifiers, modifiersOf, pasteChord } from './keys.ts';

type Placed = { id: number; r: number; fx: number; fy: number; x: number; y: number };
export type FrameInput =
  | ({ type: 'pointer'; action: 'down' | 'up' | 'move'; button: number; buttons: number; modifiers: Modifiers } & Placed)
  | ({ type: 'wheel'; deltaX: number; deltaY: number; modifiers: Modifiers } & Placed)
  | { type: 'key'; action: 'down' | 'up'; key: string; code: string; keyCode: number; modifiers: Modifiers }
  | { type: 'text'; text: string }
  | { type: 'select'; id: number; index: number }
  | { type: 'scroll'; id: number; left: number; top: number };

export type InputHooks = {
  /** The node's number in the page, for the frame's own nodes. */
  idOf: (node: Node) => number | undefined;
  nodeOf: (id: number) => Node | undefined;
  /** A pictured frame under the point: it takes no pointer events of its own, so the path does not name it. */
  patchAt: (x: number, y: number) => Element | null;
  send: (events: FrameInput[]) => void;
};

/** A scroller waits this long after the user's last scroll before it takes the page's position. */
const SETTLE_MS = 600;
/** Hovering is sent this often; dragging (a button held) more often. */
const MOVE_MS = 40;
const DRAG_MS = 16;
/** A scroll this soon after the wheel or a key came from them (the page got the same). */
const WHEEL_SCROLL_MS = 250;
const KEY_SCROLL_MS = 800;
/** The page's focus does not move the frame's for this long after the user put it somewhere. */
const FOCUS_HOLD_MS = 400;

const editable = (element: Element | null): boolean => {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) return !element.readOnly && !element.disabled && !/^(button|submit|reset|checkbox|radio|file|image|range|color|hidden)$/i.test(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
};

/** The element that has the keyboard here, inside shadow roots too. */
const focused = (): Element | null => {
  let element: Element | null = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
};

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

export const startInput = (hooks: InputHooks) => {
  // Scroll positions: the page's latest per scroller (0 is the document), when the user last scrolled each here, and
  // why (the same input went to the page, or nothing did).
  const pagePos = new Map<number, [number, number]>();
  const localAt = new Map<number, number>();
  const external = new Set<number>();
  const expected = new Map<number, [number, number]>();
  const syncTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastWheelAt = 0;
  let lastKeyAt = 0;
  let buttonsHeld = 0;
  let lastPressAt = 0;
  let composing = false;
  /** The character the last key sent typed, and when: its own input event is not sent again as text. */
  let keyText: { text: string; at: number } | null = null;

  const scroller = (id: number): Element | null => {
    if (id === 0) return document.scrollingElement ?? document.documentElement;
    const node = hooks.nodeOf(id);
    return node instanceof Element ? node : null;
  };

  const positionOf = (id: number): [number, number] | null => {
    if (id === 0) return [Math.round(window.scrollX), Math.round(window.scrollY)];
    const element = scroller(id);
    return element ? [Math.round(element.scrollLeft), Math.round(element.scrollTop)] : null;
  };

  const scrollHere = (id: number, left: number, top: number): void => {
    const now = positionOf(id);
    if (!now || (Math.abs(now[0] - left) < 2 && Math.abs(now[1] - top) < 2)) return;
    expected.set(id, [left, top]);
    if (id === 0) window.scrollTo({ left, top, behavior: 'instant' });
    else scroller(id)?.scrollTo({ left, top, behavior: 'instant' });
  };

  const settle = (): void => {
    settleTimer = null;
    const now = Date.now();
    for (const [id, at] of localAt) {
      if (now - at < SETTLE_MS) {
        settleTimer = setTimeout(settle, SETTLE_MS - (now - at));
        continue;
      }
      localAt.delete(id);
      if (external.delete(id)) continue;
      const page = pagePos.get(id);
      if (page) scrollHere(id, page[0], page[1]);
    }
  };

  const onScroll = (event: Event): void => {
    const target = event.target;
    const id = target === document ? 0 : target instanceof Element ? hooks.idOf(target) : undefined;
    if (id === undefined) return;
    const now = positionOf(id);
    if (!now) return;
    const mine = expected.get(id);
    if (mine && Math.abs(mine[0] - now[0]) < 2 && Math.abs(mine[1] - now[1]) < 2) {
      expected.delete(id);
      return;
    }
    expected.delete(id);
    const at = Date.now();
    localAt.set(id, at);
    const fromInput = at - lastWheelAt < WHEEL_SCROLL_MS || at - lastKeyAt < KEY_SCROLL_MS || buttonsHeld !== 0;
    if (!fromInput) {
      // Nothing went to the page for this one (find in page, a link to an anchor here): the page follows.
      external.add(id);
      clearTimeout(syncTimers.get(id));
      syncTimers.set(id, setTimeout(() => {
        syncTimers.delete(id);
        const position = positionOf(id);
        if (position) hooks.send([{ type: 'scroll', id, left: position[0], top: position[1] }]);
      }, 120));
    }
    settleTimer ??= setTimeout(settle, SETTLE_MS);
  };

  // Pointer and wheel: placed on the node under them.
  const place = (event: MouseEvent): Placed | null => {
    let element: Element | null = hooks.patchAt(event.clientX, event.clientY);
    let id: number | undefined = element ? hooks.idOf(element) : undefined;
    if (id === undefined) element = null;
    for (const item of element ? [] : event.composedPath()) {
      if (!(item instanceof Element)) continue;
      id = hooks.idOf(item);
      if (id !== undefined) {
        element = item;
        break;
      }
    }
    if (!element || id === undefined) return null;
    const x = event.clientX;
    const y = event.clientY;
    const rects = element.getClientRects();
    let r = -1;
    let box = element.getBoundingClientRect();
    for (let index = 0; index < rects.length; index += 1) {
      const rect = rects[index];
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        r = index;
        box = rect;
        break;
      }
    }
    // Outside the node's box (a scroll bar, a margin): the page gets the point itself.
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) r = -2;
    return { id, r, fx: round(box.width ? (x - box.left) / box.width : 0.5), fy: round(box.height ? (y - box.top) / box.height : 0.5), x: round(x), y: round(y) };
  };

  let pendingMove: FrameInput | null = null;
  let moveTimer: ReturnType<typeof setTimeout> | null = null;
  const flushMove = (): void => {
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = null;
    const move = pendingMove;
    pendingMove = null;
    if (move) hooks.send([move]);
  };
  const send = (events: FrameInput[]): void => {
    flushMove();
    hooks.send(events);
  };

  /** A press on a select stays here: its own list opens, and the pick goes as `select`. */
  let pressOnSelect = false;
  const onSelectList = (event: Event): boolean => event.composedPath().some((item) => item instanceof HTMLSelectElement || item instanceof HTMLOptionElement);

  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    buttonsHeld = event.buttons;
    lastPressAt = Date.now();
    pressOnSelect = onSelectList(event);
    if (pressOnSelect) return;
    const placed = place(event);
    if (placed) send([{ type: 'pointer', action: 'down', button: event.button, buttons: event.buttons, modifiers: modifiersOf(event), ...placed }]);
  }, true);
  window.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') return;
    buttonsHeld = event.buttons;
    if (pressOnSelect) {
      pressOnSelect = event.buttons !== 0;
      return;
    }
    const placed = place(event);
    if (placed) send([{ type: 'pointer', action: 'up', button: event.button, buttons: event.buttons, modifiers: modifiersOf(event), ...placed }]);
  }, true);
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || pressOnSelect) return;
    buttonsHeld = event.buttons;
    const placed = place(event);
    if (!placed) return;
    pendingMove = { type: 'pointer', action: 'move', button: -1, buttons: event.buttons, modifiers: modifiersOf(event), ...placed };
    moveTimer ??= setTimeout(flushMove, event.buttons ? DRAG_MS : MOVE_MS);
  }, true);
  window.addEventListener('wheel', (event) => {
    lastWheelAt = Date.now();
    const placed = place(event);
    if (!placed) return;
    const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? window.innerHeight : 1;
    send([{ type: 'wheel', deltaX: round(event.deltaX * scale), deltaY: round(event.deltaY * scale), modifiers: modifiersOf(event), ...placed }]);
  }, { capture: true, passive: true });

  // Keys: all go to the page (keys.ts); what OpenChamber's window would do with one is kept from it.
  const sentDown = new Set<string>();
  window.addEventListener('keydown', (event) => {
    lastKeyAt = Date.now();
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (pasteChord(event)) return;
    if (keepLocal(event, editable(focused()))) event.preventDefault();
    keyText = event.key.length === 1 && !event.ctrlKey && !event.metaKey ? { text: event.key, at: Date.now() } : null;
    sentDown.add(event.code || event.key);
    send([{ type: 'key', action: 'down', key: event.key, code: event.code, keyCode: event.keyCode, modifiers: modifiersOf(event) }]);
  }, true);
  window.addEventListener('keyup', (event) => {
    if (!sentDown.delete(event.code || event.key)) return;
    send([{ type: 'key', action: 'up', key: event.key, code: event.code, keyCode: event.keyCode, modifiers: modifiersOf(event) }]);
  }, true);
  window.addEventListener('compositionstart', () => {
    composing = true;
  }, true);
  window.addEventListener('compositionend', (event) => {
    composing = false;
    if (event.data) send([{ type: 'text', text: event.data }]);
  }, true);
  // Text with no key of its own (an emoji picker, dictation, an input method that does not compose): sent as text.
  window.addEventListener('beforeinput', (event) => {
    if (event.inputType !== 'insertText' || event.isComposing || composing || !event.data) return;
    const typed = keyText;
    keyText = null;
    if (typed && typed.text === event.data && Date.now() - typed.at < 200) return;
    send([{ type: 'text', text: event.data }]);
  }, true);
  window.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text/plain');
    if (text) send([{ type: 'text', text }]);
  }, true);
  window.addEventListener('change', (event) => {
    const target = event.composedPath()[0];
    if (!(target instanceof HTMLSelectElement)) return;
    const id = hooks.idOf(target);
    if (id !== undefined) send([{ type: 'select', id, index: target.selectedIndex }]);
  }, true);
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('blur', () => {
    buttonsHeld = 0;
    composing = false;
  });

  return {
    /** A new page: what was known of the old one's scrolling goes. */
    reset(): void {
      pagePos.clear();
      localAt.clear();
      external.clear();
      expected.clear();
      for (const timer of syncTimers.values()) clearTimeout(timer);
      syncTimers.clear();
    },
    /** The page's own position of a scroller: shown, unless the user is scrolling it here. */
    pageScrolled(id: number, left: number, top: number): void {
      pagePos.set(id, [left, top]);
      if (localAt.has(id)) return;
      scrollHere(id, left, top);
    },
    /** Styles arrived and moved the layout: every scroller the user has not scrolled to the page's position again. */
    reapply(): void {
      for (const [id, [left, top]] of pagePos) if (!localAt.has(id)) scrollHere(id, left, top);
    },
    /** The page's focus moved: the same element here, unless the user just put the focus somewhere. */
    pageFocused(id: number): void {
      if (Date.now() - lastPressAt < FOCUS_HOLD_MS) return;
      if (id === 0) {
        const current = focused();
        if (current instanceof HTMLElement && current !== document.body) current.blur();
        return;
      }
      const node = hooks.nodeOf(id);
      if ((node instanceof HTMLElement || node instanceof SVGElement) && node !== focused()) node.focus({ preventScroll: true });
    },
  };
};
