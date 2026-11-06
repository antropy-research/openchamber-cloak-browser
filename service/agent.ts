// The agent's browser (`service.provides: ["browser"]`): OpenChamber's `openchamber_web` tool posts its twelve
// `browser.*` actions here when Cloak Browser is the Browser provider (Settings → General → OpenChamber Tools). The
// answers have the shapes of OpenChamber's own browser panel (`@openchamber/sdk` service-providers.ts), so an
// agent's prompts work the same against either.
//
// Tabs: an action without `tabId` works in the tab its chat last opened or worked in, else in the tab the user sees
// (the tool's own description of `tabId`). `browser.open` without one opens a new tab behind, so the agent never
// replaces the user's page; the strip lists it, marked as the agent's. An id this service did not issue is refused.
// A click and typing are real input over CDP, as a person's would be (page-scripts.ts says why).
import type {
  BrowserProviderRequest,
  BrowserProviderResult,
  BrowserSnapshotData,
  BrowserTab,
} from '@openchamber/sdk';

import type { Browser, Tab } from './browser.ts';
import { focusFieldScript, inspectScript, locateScript, quietScript, scrollScript, selectScript, snapshotScript } from './page-scripts.ts';
import type { Surface } from './surface.ts';

type ScriptResult = { ok: true } & Record<string, unknown> | { ok: false; error: string };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Width and height from a PNG's IHDR. */
const pngSize = (bytes: Buffer): { width: number; height: number } => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

export class Agent {
  /** The tab each chat last opened or worked in ('' is an agent with no chat). */
  private readonly lastTab = new Map<string, string>();

  constructor(private readonly browser: Browser, private readonly surface: Surface) {}

  async handle(request: BrowserProviderRequest): Promise<BrowserProviderResult> {
    this.surface.noteAgent();
    const since = Date.now();
    try {
      const result = await this.run(request);
      // An alert, confirm or prompt the action raised was answered for it (OK, the prompt's own default): the agent
      // hears what it said.
      const tabId = this.lastTab.get(this.chat(request));
      const dialogs = this.browser.raised.filter((each) => each.at >= since && each.tabId === tabId && each.answered);
      if (!result.ok || dialogs.length === 0) return result;
      const data: Record<string, unknown> = { ...result.data, dialogs: dialogs.map(({ type, message }) => ({ type, message, answer: 'ok' })) };
      return { ...result, data } as BrowserProviderResult;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.surface.noteAgent();
    }
  }

  private chat(request: BrowserProviderRequest): string {
    return request.context.sessionId ?? '';
  }

  /** The tab an action is for. */
  private target(request: BrowserProviderRequest): Tab {
    const tabId = request.parameters.tabId;
    if (tabId !== undefined) {
      const tab = this.browser.tabs.get(tabId);
      if (!tab) throw new Error(`There is no tab ${tabId}: name one from the tabs browser.snapshot lists.`);
      return this.free(tab);
    }
    const last = this.lastTab.get(this.chat(request));
    const tab = (last ? this.browser.tabs.get(last) : undefined) ?? this.browser.shown;
    if (!tab) throw new Error('No tab is open: open a page with browser.open.');
    return this.free(tab);
  }

  /** A page held by a dialog the user has to answer runs nothing until then: refused, rather than left to time out. */
  private free(tab: Tab): Tab {
    if (!tab.dialog) return tab;
    const message = tab.dialog.message.length > 200 ? `${tab.dialog.message.slice(0, 200)}…` : tab.dialog.message;
    throw new Error(`The page in this tab shows a ${tab.dialog.type} dialog ("${message}") and waits for the user to answer it in the Cloak Browser panel. Nothing was changed; ask the user, or work in another tab.`);
  }

  private worked(request: BrowserProviderRequest, tab: Tab): void {
    this.lastTab.set(this.chat(request), tab.id);
    this.browser.agentWorking(tab.id);
  }

  private async script<T extends Record<string, unknown>>(tab: Tab, expression: string, awaitPromise = false): Promise<T> {
    const result = await this.browser.evaluate<ScriptResult>(tab.id, expression, { awaitPromise });
    if (!result || typeof result !== 'object') throw new Error('The page did not answer.');
    if (result.ok === false) throw new Error(result.error);
    const { ok: _ok, ...data } = result;
    return data as T;
  }

  /** Loaded and then quiet for half a second (at most five), as OpenChamber's panel waits before it says settled. */
  private async settle(tab: Tab, loaded: boolean): Promise<boolean> {
    try {
      const quiet = await this.browser.evaluate<{ quiet?: boolean }>(tab.id, quietScript({ quietMs: 500, maxMs: 5000 }), { awaitPromise: true, timeoutMs: 8000 });
      return loaded && quiet?.quiet === true;
    } catch {
      return false;
    }
  }

  /**
   * A tab behind in the user's window is hidden and draws only now and then: a screenshot of it may get no answer
   * and the next one does. So a few short tries, inside OpenChamber's 20 s for the action.
   */
  private async screenshot(session: string): Promise<{ data: string }> {
    const cdp = this.browser.cdp;
    if (!cdp) throw new Error('The browser is not running.');
    let failure: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await cdp.send<{ data: string }>('Page.captureScreenshot', { format: 'png' }, session, 4000);
      } catch (error) {
        failure = error;
      }
    }
    throw new Error(`The tab drew no picture: it is behind the page shown in the panel. Show it there, or open the page with browser.open. (${failure instanceof Error ? failure.message : String(failure)})`);
  }

  private tabs(): BrowserTab[] {
    return [...this.browser.tabs.values()].map((tab) => ({ id: tab.id, title: tab.title, url: tab.url, active: tab.id === this.browser.shownId }));
  }

  private async page(tab: Tab): Promise<{ url: string; title: string }> {
    await this.browser.refresh(tab.id);
    return { url: tab.url, title: tab.title };
  }

  private async run(request: BrowserProviderRequest): Promise<BrowserProviderResult> {
    await this.browser.ready();
    const cdp = this.browser.cdp;
    if (!cdp) throw new Error('The browser is not running.');
    switch (request.action) {
      case 'browser.open': {
        const { url, viewport, tabId } = request.parameters;
        // Behind the user's page, in a window of its own: it draws and runs as a page in front does (browser.ts, newTab).
        const tab = tabId !== undefined ? this.target(request) : await this.browser.newTab({ background: true, openedBy: this.chat(request), window: true });
        this.worked(request, tab);
        if (viewport) await this.browser.setViewport(tab.id, viewport);
        // OpenChamber gives an open 45 s: the load up to 25, then up to 5 for the page to go quiet.
        const { loaded } = await this.browser.navigate(url, tab.id, 25_000);
        const settled = await this.settle(tab, loaded);
        const page = await this.page(tab);
        return { ok: true, data: { tabId: tab.id, url: page.url, title: page.title, opened: true, settled, viewport: this.browser.viewportSummary(tab) } };
      }
      case 'browser.snapshot': {
        const tab = this.target(request);
        this.worked(request, tab);
        const data = await this.script<Omit<BrowserSnapshotData, 'viewport' | 'tabs'>>(tab, snapshotScript({ selector: request.parameters.selector }));
        return { ok: true, data: { ...data, viewport: this.browser.viewportSummary(tab), tabs: this.tabs() } };
      }
      case 'browser.click': {
        const tab = this.target(request);
        this.worked(request, tab);
        const found = await this.script<{ x: number; y: number; clicked: string; label: string }>(tab, locateScript(request.parameters));
        const session = await this.browser.sessionOf(tab);
        const at = { x: found.x, y: found.y };
        await this.browser.untilDialog(tab, cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at, button: 'none', buttons: 0 }, session));
        await this.browser.untilDialog(tab, cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 }, session));
        await this.browser.untilDialog(tab, cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 }, session));
        await sleep(300);
        const page = await this.page(tab);
        return { ok: true, data: { clicked: found.clicked, label: found.label, url: page.url } };
      }
      case 'browser.type': {
        const { selector, value, submit } = request.parameters;
        const tab = this.target(request);
        this.worked(request, tab);
        const field = await this.script<{ selector: string; empty: boolean }>(tab, focusFieldScript({ selector }));
        const session = await this.browser.sessionOf(tab);
        if (value) {
          await cdp.send('Input.insertText', { text: value }, session);
        } else if (!field.empty) {
          await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, session);
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, session);
        }
        if (submit) {
          await this.browser.untilDialog(tab, cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }, session));
          await this.browser.untilDialog(tab, cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, session));
          await sleep(300);
        }
        const page = await this.page(tab);
        return { ok: true, data: { selector: field.selector, url: page.url } };
      }
      case 'browser.select': {
        const tab = this.target(request);
        this.worked(request, tab);
        const data = await this.script<{ selector: string; label: string; value: string; url: string }>(tab, selectScript(request.parameters));
        return { ok: true, data };
      }
      case 'browser.scroll': {
        const tab = this.target(request);
        this.worked(request, tab);
        const data = await this.script<{ scrollY: number; maxScrollY: number; atTop: boolean; atBottom: boolean }>(tab, scrollScript(request.parameters), true);
        return { ok: true, data };
      }
      case 'browser.back':
      case 'browser.forward': {
        const tab = this.target(request);
        this.worked(request, tab);
        const moved = await this.browser.go(request.action === 'browser.back' ? 'back' : 'forward', tab.id, 10_000);
        if (!moved) return { ok: false, error: request.action === 'browser.back' ? 'There is no page to go back to in this tab.' : 'There is no page to go forward to in this tab.' };
        return { ok: true, data: await this.page(tab) };
      }
      case 'browser.inspect': {
        const tab = this.target(request);
        this.worked(request, tab);
        const data = await this.script<{ selector: string; tag: string; label: string; bounds: { x: number; y: number; width: number; height: number }; inViewport: boolean; styles: Record<string, string> }>(tab, inspectScript(request.parameters));
        return { ok: true, data };
      }
      case 'browser.capture': {
        const tab = this.target(request);
        this.worked(request, tab);
        const session = await this.browser.sessionOf(tab);
        const shot = await this.screenshot(session);
        const bytes = Buffer.from(shot.data, 'base64');
        const page = await this.page(tab);
        return { ok: true, data: { base64: shot.data, mime: 'image/png', ...pngSize(bytes), url: page.url, title: page.title, viewport: this.browser.viewportSummary(tab) } };
      }
      case 'browser.resize': {
        const tab = this.target(request);
        this.worked(request, tab);
        await this.browser.setViewport(tab.id, request.parameters.viewport);
        return { ok: true, data: { viewport: this.browser.viewportSummary(tab) } };
      }
      case 'browser.close': {
        const chat = this.chat(request);
        const tabId = request.parameters.tabId;
        let tab: Tab | undefined;
        if (tabId !== undefined) {
          tab = this.browser.tabs.get(tabId);
          if (!tab) return { ok: false, error: `There is no tab ${tabId}: name one from the tabs browser.snapshot lists.` };
          if (tab.openedBy === null) return { ok: false, error: 'That tab is the user\'s: an agent closes only the tabs it opened.' };
        } else {
          tab = [...this.browser.tabs.values()].reverse().find((each) => each.openedBy === chat);
          if (!tab) return { ok: false, error: 'This chat has no tab of its own to close.' };
        }
        await this.browser.closeTab(tab.id);
        if (this.lastTab.get(chat) === tab.id) this.lastTab.delete(chat);
        return { ok: true, data: { closed: true, tabId: tab.id } };
      }
      default:
        return { ok: false, error: 'Unknown browser action.' };
    }
  }
}
