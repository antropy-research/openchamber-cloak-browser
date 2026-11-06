// Keys on the page in the panel, as HTML (frame-input.ts) or as a picture (picture-view.ts): all of them go to the page,
// as they did to the picture OpenChamber drew before. What a key would do in OpenChamber's window instead (reload it,
// go back in its history, move the focus by OpenChamber's rules) is kept from it.
export type Modifiers = { alt: boolean; ctrl: boolean; meta: boolean; shift: boolean };

export const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const modifiersOf = (event: MouseEvent | KeyboardEvent): Modifiers => ({ alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey });

/** The paste chord: never sent; the paste event sends the pasted text instead. */
export const pasteChord = (event: KeyboardEvent): boolean => (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) && !event.altKey && (event.code === 'KeyV' || event.key.toLowerCase() === 'v');

/**
 * Whether this window must not act on the key itself. `inField`: the keyboard is in a field here, where a chord moves
 * or deletes by word or line, as it does in the page.
 */
export const keepLocal = (event: KeyboardEvent, inField: boolean): boolean => {
  const mod = mac ? event.metaKey : event.ctrlKey;
  if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey) return true;
  if (event.key === 'F5' || event.key === 'F6') return true;
  if (!mac && event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return true;
  if (!mod) return false;
  const letter = event.key.length === 1 ? event.key.toLowerCase() : '';
  // Editing and finding stay with this browser too: copy, cut, paste, select all, undo, find, zoom.
  if (letter && 'cxvazyf'.includes(letter)) return false;
  if (event.key === '+' || event.key === '-' || event.key === '=' || event.key === '0') return false;
  if (inField && /^(Arrow|Backspace|Delete|Home|End)/.test(event.key)) return false;
  return true;
};
