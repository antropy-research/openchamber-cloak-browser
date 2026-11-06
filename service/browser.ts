// The browser process: CloakBrowser (or CLOAKBROWSER_BINARY_PATH) run headless with a persistent profile, driven
// over CDP. Chrome attaches every tab to this connection (Target.setAutoAttach), so each tab has a session of its own:
// the picture shows one of them (the shown tab), and the agent's actions can work in any. The browser starts on the
// first request that needs it and starts again after it exits.
import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BrowserViewportMode, BrowserViewportSummary } from '@openchamber/sdk';

import { type Binary, type BinaryProgress, profileSeed, resolveBinary } from './binary.ts';
import { Cdp, type CdpEvent } from './cdp.ts';

export type Phase = 'idle' | 'preparing' | 'starting' | 'running' | 'failed';
export type Dialog = { type: string; message: string; defaultPrompt: string };
/** A dialog a page raised: answered for it (a tab behind, or one the agent works in), or waiting for the user. */
export type RaisedDialog = Dialog & { tabId: string; at: number; answered: boolean };

/** The sizes OpenChamber's own panel gives the agent's `viewport` (its lib/browser/viewport.ts presets). */
export const VIEWPORTS: Record<Exclude<BrowserViewportMode, 'fill'>, { width: number; height: number; mobile: boolean }> = {
  mobile: { width: 390, height: 844, mobile: true },
  tablet: { width: 768, height: 1024, mobile: true },
  desktop: { width: 1440, height: 900, mobile: false },
};

export type Tab = {
  /** The CDP target id; also the id the strip and the agent use. */
  id: string;
  url: string;
  title: string;
  openerId?: string;
  sessionId: string | null;
  /** Settles once the tab's page events are on and it has its size; a new tab is paused until then (prepare). */
  ready: Promise<void> | null;
  mainFrameId: string | null;
  /** The chat whose agent opened it ('' for an agent with no chat); null when the user did. */
  openedBy: string | null;
  loading: boolean;
  dialog: Dialog | null;
  viewport: BrowserViewportMode;
  /** Until when the agent counts as working in it (dialogs then answer themselves). */
  agentUntil: number;
};

export type TabSummary = { id: string; title: string; url: string; shown: boolean; agent: boolean; loading: boolean };

export type BrowserState = {
  phase: Phase;
  error: string | null;
  progress: BinaryProgress | null;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  binary: { version: string; source: Binary['source'] } | null;
  tabs: TabSummary[];
  /** A dialog the shown tab is waiting on. */
  dialog: Dialog | null;
};

type TargetInfo = { targetId: string; type: string; url: string; title: string; openerId?: string };

export type BrowserOptions = {
  /** Profile, fingerprint seed, the last address and pixel ratio: what survives a restart. */
  dataDir: string;
  /** Downloaded builds. */
  cacheDir: string;
  /** Where a new profile starts. */
  startUrl: string;
  /** Anything the strip or the picture shows changed. */
  onChange: () => void;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * A Chrome left running on this profile by a service that was killed: it holds the profile's lock, and a new
 * launch would hand its window to it and exit. Stopped here, before the launch.
 */
const stopLeftover = async (profile: string): Promise<void> => {
  let owner: string;
  try {
    owner = await readlink(join(profile, 'SingletonLock'));
  } catch {
    return;
  }
  const pid = Number(owner.slice(owner.lastIndexOf('-') + 1));
  if (!Number.isInteger(pid) || pid <= 1 || !alive(pid)) return;
  let command = '';
  try {
    command = (await readFile(`/proc/${pid}/cmdline`)).toString('utf8').replaceAll('\0', ' ');
  } catch {
    return;
  }
  if (!command.includes(`--user-data-dir=${profile}`)) return;
  process.kill(pid, 'SIGKILL');
  for (let wait = 0; wait < 50 && alive(pid); wait += 1) await sleep(100);
};

export class Browser {
  phase: Phase = 'idle';
  error: string | null = null;
  progress: BinaryProgress | null = null;
  binary: Binary | null = null;
  cdp: Cdp | null = null;
  /** Every tab, in the order they opened. */
  readonly tabs = new Map<string, Tab>();
  shownId: string | null = null;
  /** The size, in CSS pixels, a tab that fills the panel has (the surface keeps it). */
  fillSize = { width: 1280, height: 800 };
  private canGoBack = false;
  private canGoForward = false;
  private child: ChildProcess | null = null;
  private starting: Promise<void> | null = null;
  /**
   * The pixel ratio the picture is drawn at. A headless screencast ignores an emulated device scale factor and
   * sends CSS-sized frames, so the ratio is a launch flag (--force-device-scale-factor): a new ratio restarts the
   * browser. Kept beside the profile, so the next start uses the last window's.
   */
  private scale = 1;
  private launchedScale = 0;
  /** The picture's size in device pixels as the last window's panel asked for it, kept for the next start. */
  savedSize: { width: number; height: number } | null = null;
  /** A click with Control (Command) or the middle button just landed: the tab it opens stays behind. */
  private backgroundUntil = 0;
  private readonly shownListeners = new Set<(tab: Tab) => void>();
  private readonly eventListeners = new Set<(event: CdpEvent) => void>();
  private readonly attachWaiters = new Set<() => void>();
  private readonly dialogListeners = new Set<(tab: Tab) => void>();
  /** The dialogs pages raised lately, newest last: what the agent's actions ran into. */
  readonly raised: RaisedDialog[] = [];
  private lastUrlWrite: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: BrowserOptions) {
    try {
      const saved = JSON.parse(readFileSync(join(options.dataDir, 'viewer.json'), 'utf8')) as { scale?: unknown; width?: unknown; height?: unknown };
      if (typeof saved.scale === 'number' && saved.scale >= 1 && saved.scale <= 4) this.scale = saved.scale;
      if (Number.isInteger(saved.width) && Number.isInteger(saved.height)) this.savedSize = { width: saved.width as number, height: saved.height as number };
    } catch {
      // no window has reported one yet
    }
  }

  get profile(): string {
    return join(this.options.dataDir, 'profile');
  }

  get scaleFactor(): number {
    return this.scale;
  }

  get shown(): Tab | null {
    return this.shownId ? this.tabs.get(this.shownId) ?? null : null;
  }

  /** Called with the tab the picture should show: a start, a switch, a new tab, the shown one closed. */
  onShown(listener: (tab: Tab) => void): () => void {
    this.shownListeners.add(listener);
    return () => this.shownListeners.delete(listener);
  }

  /** Every CDP event of every browser this service starts (the picture listens for its frames). */
  onCdpEvent(listener: (event: CdpEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  state(): BrowserState {
    const tab = this.shown;
    return {
      phase: this.phase,
      error: this.error,
      progress: this.progress,
      url: tab?.url ?? '',
      title: tab?.title ?? '',
      loading: tab?.loading ?? false,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
      binary: this.binary ? { version: this.binary.version, source: this.binary.source } : null,
      tabs: [...this.tabs.values()].map((each) => ({
        id: each.id,
        title: each.title,
        url: each.url,
        shown: each.id === this.shownId,
        agent: each.openedBy !== null,
        loading: each.loading,
      })),
      dialog: tab?.dialog ?? null,
    };
  }

  /** The window's pixel ratio, from the strip. Restarts a browser drawing at another, on the address it shows. */
  async setScale(scale: number): Promise<void> {
    if (scale === this.scale) return;
    this.scale = scale;
    await this.saveViewer();
    if (this.phase !== 'running' || this.launchedScale === scale) return;
    await this.saveLastUrl();
    await this.stop();
    await this.start().catch(() => {});
  }

  /** The panel's size, kept with the pixel ratio: a service started again begins at it (Surface). */
  async rememberSize(width: number, height: number): Promise<void> {
    if (this.savedSize?.width === width && this.savedSize.height === height) return;
    this.savedSize = { width, height };
    await this.saveViewer();
  }

  private async saveViewer(): Promise<void> {
    await mkdir(this.options.dataDir, { recursive: true }).catch(() => {});
    await writeFile(join(this.options.dataDir, 'viewer.json'), `${JSON.stringify({ scale: this.scale, ...this.savedSize })}\n`).catch(() => {});
  }

  /** Running when it resolves; a failure is kept in `error` for the strip, and the next call tries again. */
  start(): Promise<void> {
    // A start in progress is waited for to its end, past the moment it says running: its first tab is shown last.
    if (this.starting) return this.starting;
    if (this.phase === 'running' && this.cdp && !this.cdp.closed) return Promise.resolve();
    this.starting = this.launch().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  /** Closes the browser on purpose: not a failure, so the strip shows no error. */
  async stop(): Promise<void> {
    this.phase = 'idle';
    this.error = null;
    const child = this.child;
    const cdp = this.cdp;
    if (cdp && !cdp.closed) {
      await Promise.race([cdp.send('Browser.close', {}, undefined, 3000).catch(() => {}), sleep(3000)]);
    }
    cdp?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      for (let wait = 0; wait < 30 && child.exitCode === null && child.signalCode === null; wait += 1) await sleep(100);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    this.cdp = null;
    this.tabs.clear();
    this.shownId = null;
    this.changed();
  }

  /** The connection, starting the browser when it is not running. */
  async ready(): Promise<Cdp> {
    await this.start();
    if (!this.cdp) throw new Error(this.error ?? 'The browser is not running.');
    return this.cdp;
  }

  tab(id: string | null | undefined): Tab {
    const tab = id ? this.tabs.get(id) : undefined;
    if (!tab) throw new Error(id ? `There is no tab ${id}.` : 'No tab is open.');
    return tab;
  }

  /** The tab's own CDP session; a tab Chrome is still attaching gets one in a moment. */
  async sessionOf(tab: Tab, timeoutMs = 10_000): Promise<string> {
    const end = Date.now() + timeoutMs;
    while (!tab.sessionId) {
      if (!this.tabs.has(tab.id)) throw new Error('The tab closed.');
      if (Date.now() > end) throw new Error('The tab did not open.');
      await new Promise<void>((resolve) => {
        const wake = () => {
          clearTimeout(timer);
          this.attachWaiters.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, 200);
        this.attachWaiters.add(wake);
      });
    }
    // Nothing goes to a tab before its own setup: a command sent sooner races the tab's first navigation.
    if (tab.ready) await tab.ready;
    if (!tab.sessionId) throw new Error('The tab closed.');
    return tab.sessionId;
  }

  /** Shows `id` in the picture. */
  async show(id: string): Promise<void> {
    await this.ready();
    await this.showNow(id);
  }

  /** show, for the start itself, which cannot wait for the start to end. */
  private async showNow(id: string): Promise<void> {
    const cdp = this.cdp;
    if (!cdp) throw new Error('The browser is not running.');
    const tab = this.tab(id);
    const session = await this.sessionOf(tab);
    this.shownId = id;
    await cdp.send('Page.bringToFront', {}, session).catch(() => {});
    for (const listener of [...this.shownListeners]) listener(tab);
    await this.readHistory();
    this.rememberUrl();
    this.changed();
  }

  /**
   * A new tab with nothing in it. In front unless `background`; `openedBy` marks one the agent opened. `window` puts it
   * in a window of its own: a tab behind in the user's window is hidden, so it draws nothing (a screenshot of it
   * hangs) and its page's timers slow down, while the active tab of a window of its own runs as a page in front does.
   */
  async newTab(options: { background?: boolean; openedBy?: string | null; window?: boolean } = {}): Promise<Tab> {
    await this.ready();
    return this.newTabNow(options);
  }

  private async newTabNow(options: { background?: boolean; openedBy?: string | null; window?: boolean }): Promise<Tab> {
    const cdp = this.cdp;
    if (!cdp) throw new Error('The browser is not running.');
    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
      background: options.background ?? false,
      ...(options.window ? { newWindow: true, width: this.fillSize.width, height: this.fillSize.height } : {}),
    });
    const end = Date.now() + 10_000;
    while (!this.tabs.has(targetId) && Date.now() < end) await sleep(20);
    const tab = this.tab(targetId);
    tab.openedBy = options.openedBy ?? null;
    await this.sessionOf(tab);
    if (!options.background) await this.showNow(targetId);
    this.changed();
    return tab;
  }

  /** Closes a tab; when it was the shown one, its neighbour is shown (a new empty tab when it was the last). */
  async closeTab(id: string): Promise<void> {
    const cdp = await this.ready();
    this.tab(id);
    await cdp.send('Target.closeTarget', { targetId: id });
    for (const end = Date.now() + 5000; this.tabs.has(id) && Date.now() < end;) await sleep(20);
  }

  // The tab defaults to the shown one as it is once the browser runs: a call that starts the browser has none yet.
  async navigate(url: string, id?: string | null, waitMs = 0): Promise<{ loaded: boolean }> {
    const cdp = await this.ready();
    const tab = this.tab(id ?? this.shownId);
    const session = await this.sessionOf(tab);
    const loaded = waitMs > 0 ? this.nextLoad(session, waitMs) : null;
    const answer = await cdp.send<{ errorText?: string }>('Page.navigate', { url }, session, waitMs > 0 ? waitMs : 30_000);
    if (answer.errorText && answer.errorText !== 'net::ERR_ABORTED') throw new Error(`${url} did not open: ${answer.errorText}`);
    return { loaded: loaded ? await loaded : false };
  }

  async go(direction: 'back' | 'forward', id?: string | null, waitMs = 0): Promise<boolean> {
    const cdp = await this.ready();
    const tab = this.tab(id ?? this.shownId);
    const session = await this.sessionOf(tab);
    const history = await cdp.send<{ currentIndex: number; entries: Array<{ id: number }> }>('Page.getNavigationHistory', {}, session);
    const entry = history.entries[history.currentIndex + (direction === 'back' ? -1 : 1)];
    if (!entry) return false;
    const loaded = waitMs > 0 ? this.nextHistoryStop(tab, session, waitMs) : null;
    await cdp.send('Page.navigateToHistoryEntry', { entryId: entry.id }, session);
    if (loaded) await loaded;
    return true;
  }

  async reload(id?: string | null, ignoreCache = false): Promise<void> {
    const cdp = await this.ready();
    await cdp.send('Page.reload', { ignoreCache }, await this.sessionOf(this.tab(id ?? this.shownId)));
  }

  async stopLoading(id?: string | null): Promise<void> {
    const cdp = await this.ready();
    await cdp.send('Page.stopLoading', {}, await this.sessionOf(this.tab(id ?? this.shownId)));
  }

  /** Answers the dialog a tab is waiting on. */
  async answerDialog(id: string | null, accept: boolean, text?: string): Promise<void> {
    const cdp = await this.ready();
    const tab = this.tab(id);
    if (!tab.dialog) return;
    await cdp.send('Page.handleJavaScriptDialog', { accept, ...(text !== undefined ? { promptText: text } : {}) }, await this.sessionOf(tab));
    tab.dialog = null;
    this.changed();
  }

  /**
   * Runs `expression` in the tab's main frame, in an isolated world: the page's scripts do not see it, and it does
   * not see theirs. Answers the value it returns (or resolves to, with `awaitPromise`).
   */
  async evaluate<T>(id: string, expression: string, options: { awaitPromise?: boolean; timeoutMs?: number } = {}): Promise<T> {
    const cdp = await this.ready();
    const session = await this.sessionOf(this.tab(id));
    const { frameTree } = await cdp.send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree', {}, session);
    const { executionContextId } = await cdp.send<{ executionContextId: number }>('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'cloak-browser' }, session);
    const answer = await cdp.send<{ result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>(
      'Runtime.evaluate',
      { expression, contextId: executionContextId, returnByValue: true, awaitPromise: options.awaitPromise ?? false },
      session,
      options.timeoutMs ?? 15_000,
    );
    if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text ?? 'The page script failed.');
    return answer.result?.value as T;
  }

  /** Sizes a tab: a preset the agent asked for, or the panel's (`fill`). Answers its CSS size. */
  async setViewport(id: string, mode: BrowserViewportMode): Promise<{ width: number; height: number }> {
    const tab = this.tab(id);
    tab.viewport = mode;
    const size = await this.applyViewport(tab);
    if (id === this.shownId) for (const listener of [...this.shownListeners]) listener(tab);
    return size;
  }

  async applyViewport(tab: Tab): Promise<{ width: number; height: number }> {
    const cdp = this.cdp;
    // The session as it is: this is part of the tab's own setup, which sessionOf waits for.
    const session = tab.sessionId;
    if (!cdp || !session) throw new Error('The browser is not running.');
    const preset = tab.viewport === 'fill' ? null : VIEWPORTS[tab.viewport];
    const width = preset?.width ?? this.fillSize.width;
    const height = preset?.height ?? this.fillSize.height;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: this.scale, mobile: preset?.mobile ?? false }, session);
    return { width, height };
  }

  viewportSummary(tab: Tab): BrowserViewportSummary {
    if (tab.viewport === 'fill') return { mode: 'fill', width: null, height: null };
    return { mode: tab.viewport, width: VIEWPORTS[tab.viewport].width, height: VIEWPORTS[tab.viewport].height };
  }

  /**
   * Waits for `work`, input sent to `tab`, unless the tab shows a dialog first. Chrome answers input only once the
   * page's handler returns, and a handler that calls alert() returns when the dialog is answered: so the input counts
   * as delivered once the dialog is up, and what Chrome answers after it is dropped.
   */
  async untilDialog<T>(tab: Tab, work: Promise<T>): Promise<T | undefined> {
    work.catch(() => {});
    if (tab.dialog) return undefined;
    let listener: ((each: Tab) => void) | undefined;
    const opened = new Promise<undefined>((resolve) => {
      listener = (each) => {
        if (each === tab) resolve(undefined);
      };
      this.dialogListeners.add(listener);
    });
    try {
      return await Promise.race([work, opened]);
    } finally {
      if (listener) this.dialogListeners.delete(listener);
    }
  }

  /** The agent is working in this tab: a dialog it raises answers itself instead of waiting for the user. */
  agentWorking(id: string, forMs = 8000): void {
    const tab = this.tabs.get(id);
    if (tab) tab.agentUntil = Date.now() + forMs;
  }

  /** The next tab the shown page opens came from a click with Control (Command) or the middle button. */
  expectBackgroundTab(): void {
    this.backgroundUntil = Date.now() + 2000;
  }

  /**
   * The shown tab's title and address as the browser has them now. Chrome reports a target's new address with an
   * event but never its new title (`Target.targetInfoChanged` comes with navigations only), so this asks.
   */
  async refresh(id: string | null = this.shownId): Promise<void> {
    const cdp = this.cdp;
    const tab = id ? this.tabs.get(id) : undefined;
    if (!cdp || !tab) return;
    try {
      const back = this.canGoBack;
      const forward = this.canGoForward;
      const [{ targetInfo }] = await Promise.all([
        cdp.send<{ targetInfo: TargetInfo }>('Target.getTargetInfo', { targetId: tab.id }, undefined, 2000),
        tab.id === this.shownId ? this.readHistory() : Promise.resolve(),
      ]);
      if (tab.title === targetInfo.title && tab.url === targetInfo.url && back === this.canGoBack && forward === this.canGoForward) return;
      tab.title = targetInfo.title;
      tab.url = targetInfo.url;
      this.changed();
    } catch {
      // the tab went away
    }
  }

  private changed(): void {
    this.options.onChange();
  }

  private async launch(): Promise<void> {
    this.error = null;
    try {
      this.phase = 'preparing';
      this.changed();
      await mkdir(this.profile, { recursive: true });
      this.binary = await resolveBinary(this.options.cacheDir, (progress) => {
        this.progress = progress;
        this.changed();
      });
      this.progress = null;
      this.phase = 'starting';
      this.changed();
      const seed = await profileSeed(join(this.options.dataDir, 'fingerprint-seed'));
      await stopLeftover(this.profile);
      const url = await this.spawnBrowser(this.binary.path, seed);
      const cdp = await Cdp.connect(url);
      this.cdp = cdp;
      cdp.on((event) => {
        this.onEvent(event);
        for (const listener of [...this.eventListeners]) listener(event);
      });
      cdp.onClose(() => {
        if (this.cdp !== cdp) return;
        this.cdp = null;
        this.tabs.clear();
        this.shownId = null;
        if (this.phase === 'running') {
          this.phase = 'failed';
          this.error = 'The browser stopped.';
        }
        this.changed();
      });
      await cdp.send('Target.setDiscoverTargets', { discover: true });
      // Every tab, and each new one paused until its setup is in (prepare): its first navigation's events then
      // arrive, which they do not when the navigation commits before Page.enable has taken.
      await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'page', exclude: false }, { exclude: true }] });
      const end = Date.now() + 10_000;
      while (Date.now() < end && ![...this.tabs.values()].some((tab) => tab.sessionId)) await sleep(20);
      // Chrome brings back the tabs of a profile it closed normally (a restart for a new pixel ratio): give them a
      // moment to appear, then show the one that was shown, else open the last address in the empty start tab.
      await sleep(300);
      // Running from here, so the picture takes the first tab's frames; callers from outside still wait for the
      // start to end (start), and the start itself uses the calls that do not.
      this.phase = 'running';
      const last = await this.lastUrl();
      const open = [...this.tabs.values()].filter((tab) => tab.sessionId);
      const first = open.find((tab) => tab.url === last) ?? open.find((tab) => tab.url === 'about:blank') ?? open[0] ?? await this.newTabNow({ background: true });
      await this.showNow(first.id);
      if (first.url === 'about:blank') void this.navigate(last, first.id).catch(() => {});
    } catch (error) {
      this.phase = 'failed';
      this.error = error instanceof Error ? error.message : String(error);
      this.progress = null;
      this.changed();
      if (this.child && this.child.exitCode === null) this.child.kill('SIGKILL');
      throw error;
    }
  }

  /** Starts Chrome and answers its DevTools WebSocket address, which it prints once it listens. */
  private spawnBrowser(binary: string, seed: number): Promise<string> {
    const env = { ...process.env };
    // A session bus without a keyring stalls every request that touches cookies (with --password-store=basic too,
    // other D-Bus services can still be asked), and the browser has no business with OpenChamber's token.
    delete env.DBUS_SESSION_BUS_ADDRESS;
    for (const key of Object.keys(env)) if (key.startsWith('OPENCHAMBER_')) delete env[key];
    const child = spawn(binary, [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${this.profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      '--disable-dev-shm-usage',
      '--mute-audio',
      '--window-size=1280,800',
      `--force-device-scale-factor=${this.scale}`,
      // As the CloakBrowser wrapper launches it: one fingerprint per profile, a Windows desktop on Linux.
      '--no-sandbox',
      `--fingerprint=${seed}`,
      '--fingerprint-platform=windows',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'], env });
    this.child = child;
    this.launchedScale = this.scale;
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      if (this.phase === 'running' || this.phase === 'starting') {
        this.phase = 'failed';
        this.error = `The browser exited (${signal ?? `code ${code}`}).`;
        this.changed();
      }
    });
    return new Promise((resolve, reject) => {
      let stderr = '';
      const timer = setTimeout(() => reject(new Error(`The browser did not start within 30 s. ${stderr.trim().split('\n').slice(-3).join(' ')}`)), 30_000);
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-4000);
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        reject(new Error(`The browser exited while starting (${signal ?? `code ${code}`}). ${stderr.trim().split('\n').slice(-3).join(' ')}`));
      });
    });
  }

  /** Resolves true on the tab's next load event, false after `timeoutMs`. */
  private nextLoad(session: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const unsubscribe = this.onCdpEvent((event) => {
        if (event.method === 'Page.loadEventFired' && event.sessionId === session) {
          clearTimeout(timer);
          unsubscribe();
          resolve(true);
        }
      });
      const timer = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);
    });
  }

  /**
   * Resolves true once a move through the history has arrived, false after `timeoutMs`. A page Chrome brings back
   * from its back-forward cache fires no load, and a move within the document none either: each says so its own way.
   */
  private nextHistoryStop(tab: Tab, session: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const mainFrame = (frameId: unknown) => frameId === (tab.mainFrameId ?? tab.id);
      const unsubscribe = this.onCdpEvent((event) => {
        if (event.sessionId !== session) return;
        const frame = event.params.frame as { id?: string; parentId?: string } | undefined;
        const arrived = event.method === 'Page.loadEventFired'
          || (event.method === 'Page.frameNavigated' && event.params.type === 'BackForwardCacheRestore' && !frame?.parentId)
          || (event.method === 'Page.navigatedWithinDocument' && mainFrame(event.params.frameId));
        if (!arrived) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(true);
      });
      const timer = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);
    });
  }

  private async readHistory(): Promise<void> {
    const cdp = this.cdp;
    const tab = this.shown;
    if (!cdp || !tab?.sessionId) return;
    try {
      const history = await cdp.send<{ currentIndex: number; entries: unknown[] }>('Page.getNavigationHistory', {}, tab.sessionId);
      this.canGoBack = history.currentIndex > 0;
      this.canGoForward = history.currentIndex < history.entries.length - 1;
    } catch {
      // the tab went away
    }
  }

  private tabBySession(sessionId: string): Tab | undefined {
    for (const tab of this.tabs.values()) if (tab.sessionId === sessionId) return tab;
    return undefined;
  }

  private onEvent(event: CdpEvent): void {
    if (!event.sessionId) {
      this.onBrowserEvent(event);
      return;
    }
    const tab = this.tabBySession(event.sessionId);
    if (!tab) return;
    const params = event.params;
    switch (event.method) {
      case 'Page.frameStartedLoading':
      case 'Page.frameStoppedLoading': {
        if (tab.mainFrameId && params.frameId !== tab.mainFrameId) return;
        const loading = event.method === 'Page.frameStartedLoading';
        if (loading !== tab.loading) {
          tab.loading = loading;
          this.changed();
        }
        if (!loading) void this.refresh(tab.id);
        return;
      }
      case 'Page.loadEventFired':
      case 'Page.domContentEventFired':
        void this.refresh(tab.id);
        return;
      case 'Page.frameNavigated': {
        const frame = params.frame as { id: string; parentId?: string; url: string };
        if (frame.parentId) return;
        tab.mainFrameId = frame.id;
        tab.url = frame.url;
        void this.refresh(tab.id);
        if (tab.id === this.shownId) this.rememberUrl();
        this.changed();
        return;
      }
      case 'Page.navigatedWithinDocument':
        if (tab.mainFrameId && params.frameId !== tab.mainFrameId) return;
        tab.url = String(params.url ?? tab.url);
        void this.refresh(tab.id);
        if (tab.id === this.shownId) this.rememberUrl();
        this.changed();
        return;
      case 'Page.javascriptDialogOpening': {
        const dialog = { type: String(params.type), message: String(params.message ?? ''), defaultPrompt: String(params.defaultPrompt ?? '') };
        tab.dialog = dialog;
        // Nobody would see it in a tab behind, and an agent should not wait on one: answer it as a page expects (OK,
        // the prompt's own default). The shown tab's waits for the strip.
        const answered = tab.id !== this.shownId || Date.now() < tab.agentUntil;
        this.raised.push({ ...dialog, tabId: tab.id, at: Date.now(), answered });
        if (this.raised.length > 20) this.raised.shift();
        if (answered) void this.answerDialog(tab.id, true, dialog.type === 'prompt' ? dialog.defaultPrompt : undefined).catch(() => {});
        for (const listener of [...this.dialogListeners]) listener(tab);
        this.changed();
        return;
      }
      case 'Page.javascriptDialogClosed':
        tab.dialog = null;
        this.changed();
        return;
      default:
        return;
    }
  }

  private onBrowserEvent(event: CdpEvent): void {
    const params = event.params;
    const info = params.targetInfo as TargetInfo | undefined;
    switch (event.method) {
      case 'Target.targetCreated': {
        if (!info || info.type !== 'page' || this.tabs.has(info.targetId)) return;
        const opener = info.openerId ? this.tabs.get(info.openerId) : undefined;
        this.addTab(info);
        // A page that opened another: the new tab comes to the front, unless it came from a click with Control
        // (Command) or the middle button, which opens links behind, as in Chrome.
        if (opener && opener.id === this.shownId) {
          const behind = Date.now() < this.backgroundUntil;
          this.backgroundUntil = 0;
          if (!behind) void this.sessionOf(this.tab(info.targetId)).then(() => this.show(info.targetId)).catch(() => {});
        }
        this.changed();
        return;
      }
      case 'Target.targetInfoChanged': {
        const tab = info ? this.tabs.get(info.targetId) : undefined;
        if (!tab || !info) return;
        tab.url = info.url;
        tab.title = info.title;
        this.changed();
        return;
      }
      case 'Target.targetDestroyed': {
        const targetId = params.targetId as string;
        const gone = this.tabs.get(targetId);
        if (!gone) return;
        const order = [...this.tabs.keys()];
        const index = order.indexOf(targetId);
        this.tabs.delete(targetId);
        if (targetId === this.shownId) {
          this.shownId = null;
          const next = (gone.openerId && this.tabs.has(gone.openerId) ? gone.openerId : null) ?? order[index + 1] ?? order[index - 1];
          if (next && this.tabs.has(next)) void this.show(next).catch(() => {});
          else if (this.phase === 'running') void this.newTab().catch(() => {});
        }
        this.changed();
        return;
      }
      case 'Target.attachedToTarget': {
        const attached = params.targetInfo as TargetInfo;
        if (attached?.type !== 'page') return;
        // The attach can come before the target's own creation event.
        const tab = this.tabs.get(attached.targetId) ?? this.addTab(attached);
        tab.sessionId = params.sessionId as string;
        tab.ready = this.prepare(tab, params.waitingForDebugger === true);
        for (const wake of [...this.attachWaiters]) wake();
        return;
      }
      case 'Target.detachedFromTarget': {
        const tab = this.tabBySession(params.sessionId as string);
        if (tab) tab.sessionId = null;
        return;
      }
      default:
        return;
    }
  }

  private addTab(info: TargetInfo): Tab {
    const opener = info.openerId ? this.tabs.get(info.openerId) : undefined;
    const tab: Tab = {
      id: info.targetId,
      url: info.url,
      title: info.title,
      openerId: info.openerId,
      sessionId: null,
      ready: null,
      mainFrameId: null,
      // A tab an agent's page opens belongs to that agent too.
      openedBy: opener?.openedBy ?? null,
      loading: false,
      dialog: null,
      viewport: 'fill',
      agentUntil: 0,
    };
    this.tabs.set(info.targetId, tab);
    return tab;
  }

  /**
   * A newly attached tab: page events on, focus kept (the agent works in tabs behind), the panel's size; then a new
   * tab runs. Sent in this order and awaited together, as Puppeteer and Playwright do: a paused tab answers some of
   * these (its size) only once it runs.
   */
  private async prepare(tab: Tab, paused: boolean): Promise<void> {
    const cdp = this.cdp;
    const session = tab.sessionId;
    if (!cdp || !session) return;
    await Promise.allSettled([
      cdp.send('Page.enable', {}, session),
      cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, session),
      this.applyViewport(tab),
      ...(paused ? [cdp.send('Runtime.runIfWaitingForDebugger', {}, session)] : []),
    ]);
  }

  private async lastUrl(): Promise<string> {
    try {
      const saved = JSON.parse(await readFile(join(this.options.dataDir, 'last.json'), 'utf8')) as { url?: unknown };
      if (typeof saved.url === 'string' && /^https?:\/\//.test(saved.url)) return saved.url;
    } catch {
      // first start
    }
    return this.options.startUrl;
  }

  /** The shown tab's address, written a moment after it settles: where the next start opens. */
  private rememberUrl(): void {
    if (this.lastUrlWrite) clearTimeout(this.lastUrlWrite);
    this.lastUrlWrite = setTimeout(() => {
      this.lastUrlWrite = null;
      void this.saveLastUrl();
    }, 1000);
  }

  private async saveLastUrl(): Promise<void> {
    const url = this.shown?.url ?? '';
    if (!/^https?:\/\//.test(url)) return;
    await writeFile(join(this.options.dataDir, 'last.json'), `${JSON.stringify({ url })}\n`).catch(() => {});
  }
}
