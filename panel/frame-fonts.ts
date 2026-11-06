// The browser's own fonts in the panel, where the panel runs in a Chromium-based browser (service/fonts.ts says why:
// two Chromiums lay text out alike with the same font files). Elsewhere the panel keeps its own fonts: another engine
// breaks lines its own way whatever the files, and the page as HTML (phase 1) is what it gets.
//
// Per font the page asks for (a computed font-family, weight and style), the service names the file the browser drew
// it with. Each font-family gets a face of its own, `cloak-font-<hash>`, put first wherever the page's CSS names that
// font-family (font-family, the font shorthand, a custom property holding it): text the font covers is drawn with it,
// the rest falls back to the page's own list. Text the page sets no font for gets the browser's default the same way.
export const chromium = /(Headless)?Chrom(e|ium)\/\d/.test(navigator.userAgent) && !/\bFirefox\//.test(navigator.userAgent);

type Face = { stack: string; weight: string; style: string; file: number };
export type FontsMessage = { doc?: number; faces?: Face[]; root?: string; files?: Record<string, { mime: string; data: string }> };

/** A font-family as a key: names without quotes, in lower case, joined by commas. */
const normalize = (value: string): string => value.split(',').map((name) => name.trim().replace(/^["']|["']$/g, '').trim().toLowerCase()).filter(Boolean).join(',');

const hash = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

/** The face for each font-family the browser's fonts are known for, by its key. */
const aliases = new Map<string, string>();
const added = new Set<string>();
const buffers = new Map<number, ArrayBuffer>();
/** Our own rules, after the page's: the browser's default font for text the page sets none for. */
export const ownSheet = new CSSStyleSheet();

/** CSS with the browser's face first wherever it names a font-family the face is for. */
export const rewriteFonts = (css: string): string => {
  if (!aliases.size || !/font|--/i.test(css)) return css;
  return css
    .replace(/((?:^|[;{\s])(?:font-family|--[\w-]+)\s*:\s*)([^;{}!]+)/gi, (match, prefix: string, value: string) => {
      const alias = aliases.get(normalize(value));
      return alias ? `${prefix}"${alias}", ${value}` : match;
    })
    .replace(/((?:^|[;{\s])font\s*:\s*)([^;{}!]+)/gi, (match, prefix: string, value: string) => {
      const parts = /^((?:[^,]*?\s)?(?:[\d.]+(?:px|em|rem|pt|pc|%|ex|ch|vw|vh|vmin|vmax|q|mm|cm|in)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger|math)(?:\s*\/\s*[^\s,]+)?\s+)(.+)$/i.exec(value.trim());
      const alias = parts ? aliases.get(normalize(parts[2])) : undefined;
      return parts && alias ? `${prefix}${parts[1]}"${alias}", ${parts[2]}` : match;
    });
};

/** The service's plan and files for the page shown: whether a face was added (the page's CSS is then rendered again). */
export const applyFonts = (message: FontsMessage): boolean => {
  for (const [id, file] of Object.entries(message.files ?? {})) {
    if (buffers.has(Number(id))) continue;
    buffers.set(Number(id), Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0)).buffer);
  }
  let changed = false;
  for (const face of message.faces ?? []) {
    const key = normalize(face.stack);
    const buffer = buffers.get(face.file);
    if (!key || !buffer) continue;
    const alias = `cloak-font-${hash(key)}`;
    const id = `${alias}|${face.weight}|${face.style}`;
    if (!added.has(id)) {
      added.add(id);
      try {
        const made = new FontFace(alias, buffer.slice(0), { weight: face.weight, style: face.style });
        document.fonts.add(made);
        void made.load().catch(() => {});
      } catch {
        continue;
      }
    }
    if (aliases.get(key) !== alias) {
      aliases.set(key, alias);
      changed = true;
    }
  }
  const root = message.root ? aliases.get(normalize(message.root)) : undefined;
  const rule = root ? `:where(html) { font-family: "${root}", ${message.root}; }` : '';
  if (ownSheet.cssRules.length !== (rule ? 1 : 0) || (rule && ownSheet.cssRules[0]?.cssText !== ownSheetText(rule))) {
    try {
      ownSheet.replaceSync(rule);
    } catch {
      // as before
    }
    changed = true;
  }
  return changed;
};

const ownSheetText = (rule: string): string => {
  const probe = new CSSStyleSheet();
  try {
    probe.replaceSync(rule);
  } catch {
    return '';
  }
  return probe.cssRules[0]?.cssText ?? '';
};
