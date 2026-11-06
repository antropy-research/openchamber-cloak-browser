// The browser's own fonts, for a panel in a Chromium-based browser. Two Chromiums lay text out alike with the same font
// files; with the fonts of the machine it runs on (a Mac's) the panel breaks lines elsewhere, and a page that measures
// its own text (a virtual list, a grid that places items by their height) is drawn for heights the panel does not
// have. So the panel can have the fonts CloakBrowser drew the page with: mirror.ts asks the browser which system font
// it used for each font the page asks for (CSS.getPlatformFontsForNode), and this finds that font's file with
// fontconfig and sends it. Fonts past FONT_BYTES_MAX (CJK collections, 20 MB) are not sent: the panel's own serve.
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';

const FONT_BYTES_MAX = 3_000_000;

type Entry = { file: string; families: string[]; styles: string[]; postscript: string };
export type FontFile = { mime: string; data: string };

const run = (command: string, args: string[]): Promise<string> => new Promise((resolve) => {
  execFile(command, args, { maxBuffer: 16_000_000, timeout: 10_000 }, (error, stdout) => resolve(error ? '' : stdout));
});

export class Fonts {
  private table: Promise<Entry[]> | null = null;
  private readonly sizes = new Map<number, number>();
  private readonly cache = new Map<number, FontFile>();

  /** The installed fonts, as fontconfig lists them (none where fc-list is missing: the panel keeps its own). */
  private entries(): Promise<Entry[]> {
    this.table ??= run('fc-list', ['--format', '%{file}\t%{family}\t%{style}\t%{postscriptname}\n']).then((text) => text.split('\n').filter(Boolean).map((line) => {
      const [file, families = '', styles = '', postscript = ''] = line.split('\t');
      return { file, families: families.split(','), styles: styles.split(','), postscript };
    }).filter((entry) => /\.(ttf|otf)$/i.test(entry.file)).sort((a, b) => a.file.localeCompare(b.file)));
    return this.table;
  }

  /**
   * The file of a font the browser used, by its PostScript name (exact), else by family and style; its number, or
   * null when it is not on disk, is a collection, or is too large to send.
   */
  async find(postScriptName: string, familyName: string, weight: string, style: string): Promise<number | null> {
    const entries = await this.entries();
    let index = postScriptName ? entries.findIndex((entry) => entry.postscript === postScriptName) : -1;
    if (index === -1) {
      const bold = Number(weight) >= 600;
      const italic = style !== 'normal';
      const wanted = (bold ? (italic ? 'bold italic' : 'bold') : italic ? 'italic' : 'regular');
      const family = familyName.toLowerCase();
      index = entries.findIndex((entry) => entry.families.some((name) => name.toLowerCase() === family) && entry.styles.some((name) => name.toLowerCase() === wanted));
      if (index === -1) index = entries.findIndex((entry) => entry.families.some((name) => name.toLowerCase() === family));
    }
    if (index === -1) return null;
    let size = this.sizes.get(index);
    if (size === undefined) {
      size = await stat(entries[index].file).then((info) => info.size).catch(() => Infinity);
      this.sizes.set(index, size);
    }
    return size <= FONT_BYTES_MAX ? index : null;
  }

  /** A font's bytes, base64, by its number from `find`. */
  async file(index: number): Promise<FontFile | null> {
    const cached = this.cache.get(index);
    if (cached) return cached;
    const entry = (await this.entries())[index];
    if (!entry || (this.sizes.get(index) ?? Infinity) > FONT_BYTES_MAX) return null;
    const bytes = await readFile(entry.file).catch(() => null);
    if (!bytes) return null;
    const font = { mime: /\.otf$/i.test(entry.file) ? 'font/otf' : 'font/ttf', data: bytes.toString('base64') };
    this.cache.set(index, font);
    return font;
  }
}
