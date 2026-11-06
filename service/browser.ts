// The browser process: CloakBrowser (or CLOAKBROWSER_BINARY_PATH) run headless with a persistent profile, driven
// over CDP. It keeps the tabs the browser reports, attaches to one of them (the one the picture shows), and answers
// the strip's navigation. It starts on the first request that needs it and starts again after it exits.
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Binary, type BinaryProgress, profileSeed, resolveBinary } from './binary.ts';
import { Cdp, type CdpEvent } from './cdp.ts';

export type Phase = 'idle' | 'preparing' | 'starting' | 'running' | 'failed';
export type Tab = { targetId: string; url: string; title: string; openerId?: string };
export type Active = { targetId: string; sessionId: string };
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
};

type TargetInfo = { targetId: string; type: string; url: string; title: string; openerId?: string };

export type BrowserOptions = {
  /** Profile, fingerprint seed and the last address: what survives a restart. */
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
  active: Active | null = null;
  readonly tabs = new Map<string, Tab>();
  loading = false;
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
  private readonly activeListeners = new Set<(active: Active, previous: Active | null) => void>();
  private readonly eventListeners = new Set<(event: CdpEvent) => void>();
  private lastUrlWrite: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: BrowserOptions) {
    try {
      const saved = JSON.parse(readFileSync(join(options.dataDir, 'viewer.json'), 'utf8')) as { scale?: unknown };
      if (typeof saved.scale === 'number' && saved.scale >= 1 && saved.scale <= 4) this.scale = saved.scale;
    } catch {
      // no window has reported one yet
    }
  }

  get scaleFactor(): number {
    return this.scale;
  }

  /** The window's pixel ratio, from the strip. Restarts a browser drawing at another, on the address it shows. */
  async setScale(scale: number): Promise<void> {
    if (scale === this.scale) return;
    this.scale = scale;
    await mkdir(this.options.dataDir, { recursive: true });
    await writeFile(join(this.options.dataDir, 'viewer.json'), `${JSON.stringify({ scale })}\n`).catch(() => {});
    if (this.phase !== 'running' || this.launchedScale === scale) return;
    await this.saveLastUrl();
    await this.stop();
    this.phase = 'idle';
    await this.start().catch(() => {});
  }

  get profile(): string {
    return join(this.options.dataDir, 'profile');
  }

  /** Called with the new tab whenever the picture's tab changes (a start, a new tab, the shown tab closed). */
  onActive(listener: (active: Active, previous: Active | null) => void): () => void {
    this.activeListeners.add(listener);
    return () => this.activeListeners.delete(listener);
  }

  /** Every CDP event of every browser this service starts (the picture listens for its frames). */
  onCdpEvent(listener: (event: CdpEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  state(): BrowserState {
    const tab = this.active ? this.tabs.get(this.active.targetId) : undefined;
    return {
      phase: this.phase,
      error: this.error,
      progress: this.progress,
      url: tab?.url ?? '',
      title: tab?.title ?? '',
      loading: this.loading,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
      binary: this.binary ? { version: this.binary.version, source: this.binary.source } : null,
    };
  }

  /**
   * The shown tab's title and address as the browser has them now. Chrome reports a target's new address with an
   * event but never its new title (`Target.targetInfoChanged` comes with navigations only), so this asks.
   */
  async refresh(): Promise<void> {
    const { cdp, active } = this;
    if (!cdp || !active) return;
    try {
      const back = this.canGoBack;
      const forward = this.canGoForward;
      const [{ targetInfo }] = await Promise.all([
        cdp.send<{ targetInfo: TargetInfo }>('Target.getTargetInfo', { targetId: active.targetId }, undefined, 2000),
        this.readHistory(),
      ]);
      const tab = this.tabs.get(active.targetId);
      if (tab && tab.title === targetInfo.title && tab.url === targetInfo.url && back === this.canGoBack && forward === this.canGoForward) return;
      this.tabs.set(active.targetId, { targetId: active.targetId, url: targetInfo.url, title: targetInfo.title, openerId: targetInfo.openerId });
      this.changed();
    } catch {
      // the tab went away; its replacement is read next
    }
  }

  /** Running when it resolves; a failure is kept in `error` for the strip, and the next call tries again. */
  start(): Promise<void> {
    if (this.phase === 'running' && this.cdp && !this.cdp.closed) return Promise.resolve();
    this.starting ??= this.launch().finally(() => {
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
    this.active = null;
    this.tabs.clear();
    this.changed();
  }

  async navigate(url: string): Promise<void> {
    const { cdp, active } = await this.ready();
    const answer = await cdp.send<{ errorText?: string }>('Page.navigate', { url }, active.sessionId, 30_000);
    if (answer.errorText && answer.errorText !== 'net::ERR_ABORTED') throw new Error(`${url}: ${answer.errorText}`);
  }

  async go(direction: 'back' | 'forward'): Promise<void> {
    const { cdp, active } = await this.ready();
    const history = await cdp.send<{ currentIndex: number; entries: Array<{ id: number }> }>('Page.getNavigationHistory', {}, active.sessionId);
    const entry = history.entries[history.currentIndex + (direction === 'back' ? -1 : 1)];
    if (entry) await cdp.send('Page.navigateToHistoryEntry', { entryId: entry.id }, active.sessionId);
  }

  async reload(): Promise<void> {
    const { cdp, active } = await this.ready();
    await cdp.send('Page.reload', {}, active.sessionId);
  }

  async stopLoading(): Promise<void> {
    const { cdp, active } = await this.ready();
    await cdp.send('Page.stopLoading', {}, active.sessionId);
  }

  /** The connection and the shown tab, starting the browser when it is not running. */
  async ready(): Promise<{ cdp: Cdp; active: Active }> {
    await this.start();
    if (!this.cdp || !this.active) throw new Error(this.error ?? 'The browser is not running.');
    return { cdp: this.cdp, active: this.active };
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
        this.active = null;
        this.tabs.clear();
        if (this.phase === 'running') {
          this.phase = 'failed';
          this.error = 'The browser stopped.';
        }
        this.changed();
      });
      await cdp.send('Target.setDiscoverTargets', { discover: true });
      const { targetInfos } = await cdp.send<{ targetInfos: TargetInfo[] }>('Target.getTargets');
      for (const info of targetInfos) if (info.type === 'page') this.tabs.set(info.targetId, { targetId: info.targetId, url: info.url, title: info.title, openerId: info.openerId });
      const first = targetInfos.find((info) => info.type === 'page')?.targetId
        ?? (await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })).targetId;
      await this.activate(first);
      this.phase = 'running';
      this.changed();
      const last = await this.lastUrl();
      if (this.tabs.get(first)?.url === 'about:blank') void this.navigate(last).catch(() => {});
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

  private async activate(targetId: string): Promise<void> {
    const cdp = this.cdp;
    if (!cdp) return;
    const previous = this.active;
    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Page.bringToFront', {}, sessionId).catch(() => {});
    this.active = { targetId, sessionId };
    this.loading = false;
    if (previous && previous.sessionId !== sessionId) {
      void cdp.send('Target.detachFromTarget', { sessionId: previous.sessionId }).catch(() => {});
    }
    for (const listener of [...this.activeListeners]) listener(this.active, previous);
    await this.readHistory();
    this.changed();
  }

  private async readHistory(): Promise<void> {
    const { cdp, active } = this;
    if (!cdp || !active) return;
    try {
      const history = await cdp.send<{ currentIndex: number; entries: unknown[] }>('Page.getNavigationHistory', {}, active.sessionId);
      this.canGoBack = history.currentIndex > 0;
      this.canGoForward = history.currentIndex < history.entries.length - 1;
    } catch {
      // the tab went away; its replacement reads its own
    }
  }

  private onEvent(event: CdpEvent): void {
    if (!event.sessionId) {
      this.onBrowserEvent(event);
      return;
    }
    if (event.sessionId !== this.active?.sessionId) return;
    const frame = (event.params.frame ?? {}) as { parentId?: string; url?: string };
    switch (event.method) {
      case 'Page.frameStartedLoading':
      case 'Page.frameStoppedLoading':
      case 'Page.loadEventFired': {
        const loading = event.method === 'Page.frameStartedLoading';
        if (loading !== this.loading) {
          this.loading = loading;
          this.changed();
        }
        if (!loading) void this.refresh();
        break;
      }
      case 'Page.domContentEventFired':
        void this.refresh();
        break;
      case 'Page.frameNavigated':
      case 'Page.navigatedWithinDocument':
        if (event.method === 'Page.frameNavigated' && frame.parentId) break;
        void this.readHistory().then(() => this.changed());
        void this.refresh();
        this.rememberUrl();
        break;
      default:
        break;
    }
  }

  private onBrowserEvent(event: CdpEvent): void {
    const info = event.params.targetInfo as TargetInfo | undefined;
    switch (event.method) {
      case 'Target.targetCreated': {
        if (!info || info.type !== 'page') return;
        this.tabs.set(info.targetId, { targetId: info.targetId, url: info.url, title: info.title, openerId: info.openerId });
        // A page that opened another (a link to a new tab, window.open) shows the new one; a tab strip comes next.
        if (info.openerId && this.active) void this.activate(info.targetId).catch(() => {});
        this.changed();
        return;
      }
      case 'Target.targetInfoChanged': {
        if (!info || info.type !== 'page') return;
        this.tabs.set(info.targetId, { targetId: info.targetId, url: info.url, title: info.title, openerId: info.openerId });
        if (info.targetId === this.active?.targetId) this.changed();
        return;
      }
      case 'Target.targetDestroyed': {
        const targetId = event.params.targetId as string;
        this.tabs.delete(targetId);
        if (targetId === this.active?.targetId) {
          this.active = null;
          const next = [...this.tabs.keys()].at(-1);
          void (next ? this.activate(next) : this.cdp?.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }).then(({ targetId: created }) => this.activate(created)))?.catch(() => {});
        }
        this.changed();
        return;
      }
      default:
        return;
    }
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
    const url = this.state().url;
    if (!/^https?:\/\//.test(url)) return;
    await writeFile(join(this.options.dataDir, 'last.json'), `${JSON.stringify({ url })}\n`).catch(() => {});
  }

  get running(): boolean {
    return this.phase === 'running' && this.cdp !== null && existsSync(this.profile);
  }
}
