// The strip OpenChamber docks above the picture (`panel.dock: "top"`): the tabs, then back, forward, reload, the
// address and what the browser is doing, and a row for a page's alert, confirm or prompt when one waits. An ordinary
// panel page: it reaches the service through `host.serviceRequest` and never sees the picture or the input, which
// stay with the host. It also tells the service this window's pixel ratio, so the picture is drawn for the screen it
// is shown on.
import { connectHost } from '@openchamber/sdk';
import { applyHostReady, mountButton, mountTextField } from '@openchamber/sdk/ui';

type Tab = { id: string; title: string; url: string; shown: boolean; agent: boolean; loading: boolean };
type Dialog = { type: string; message: string; defaultPrompt: string };
type State = {
  phase: 'idle' | 'preparing' | 'starting' | 'running' | 'failed';
  error: string | null;
  progress: { step: 'downloading' | 'verifying' | 'unpacking'; received: number; total: number } | null;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  tabs: Tab[];
  dialog: Dialog | null;
  /** A browser key in the picture asked for the address (mod+L, mod+T): the field takes the focus. */
  address: { seq: number } | null;
  /** The user is working in the picture: the strip looks more often, so a new tab or title shows at once. */
  inUse: boolean;
  /** The picture's size in device pixels, and whether a panel has told this service run its size. */
  surface?: { width: number; height: number; maxWidth: number; sized: boolean };
  /** This window holds the picture (it took control). */
  youControl?: boolean;
};

/** The dock's thickness (manifest `panel.size`), and with the dialog row. */
const HEIGHT = 72;
const HEIGHT_WITH_DIALOG = 110;

// Remixicon (Apache-2.0) line icons, 24×24.
const ICONS = {
  back: 'M7.828 11H20v2H7.828l5.364 5.364-1.414 1.414L4 12l7.778-7.778 1.414 1.414z',
  forward: 'M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z',
  reload: 'M5.463 4.433A9.961 9.961 0 0 1 12 2c5.523 0 10 4.477 10 10 0 2.136-.67 4.116-1.81 5.74L17 12h3A8 8 0 0 0 6.46 6.228l-.997-1.795zm13.074 15.134A9.961 9.961 0 0 1 12 22C6.477 22 2 17.523 2 12c0-2.136.67-4.116 1.81-5.74L7 12H4a8 8 0 0 0 13.54 5.772l.997 1.795z',
  stop: 'M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z',
  add: 'M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z',
  external: 'M10 6v2H5v11h11v-5h2v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6zm11-3v8h-2V6.413l-7.793 7.794-1.414-1.414L17.585 5H13V3h8z',
} as const;

const svg = (path: string, size = 16): SVGSVGElement => {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', String(size));
  icon.setAttribute('height', String(size));
  icon.setAttribute('aria-hidden', 'true');
  icon.style.fill = 'currentColor';
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', path);
  icon.append(shape);
  return icon;
};

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing #root');

const strip = document.createElement('div');
strip.className = 'strip';
const tabsRow = document.createElement('div');
tabsRow.className = 'row tabs';
tabsRow.setAttribute('role', 'tablist');
const toolbar = document.createElement('div');
toolbar.className = 'row toolbar';
const dialogRow = document.createElement('div');
dialogRow.className = 'row dialog';
dialogRow.hidden = true;
strip.append(tabsRow, toolbar, dialogRow);
root.append(strip);

/**
 * Hands the keyboard back to OpenChamber's window once the strip is done with it. When focus returns to the window
 * from a frame, OpenChamber 2.6 puts the caret in the chat box unless the focused element takes text, and the
 * picture's element is not one of those (`refocusAfterWindowFocus` in its inputRedirect.ts). So a click on the
 * picture right after using the strip would lose the keyboard to the chat box. Returning focus now spends that event
 * here, and the click on the picture keeps it.
 */
const releaseFocus = (): void => {
  try {
    window.parent.focus();
  } catch {
    // not allowed here: the first click on the picture may then land in the chat box, the second one holds
  }
};

/** An icon button in the SDK's ghost style: mountButton draws it, the icon goes where its label is empty. */
const iconButton = (parent: HTMLElement, name: string, path: string, onClick: () => void) => {
  const handle = mountButton(parent, { label: '', variant: 'ghost', size: 'xs', onClick });
  const node = parent.lastElementChild as HTMLButtonElement;
  node.setAttribute('aria-label', name);
  node.title = name;
  node.style.padding = '0 6px';
  const icon = svg(path);
  node.prepend(icon);
  return {
    node,
    disable: (disabled: boolean) => handle.update({ disabled }),
    swap: (next: string, label: string) => {
      icon.firstElementChild?.setAttribute('d', next);
      node.setAttribute('aria-label', label);
      node.title = label;
    },
  };
};

let state: State | null = null;
let busy = false;
const call = async (path: string, body?: Record<string, unknown>): Promise<void> => {
  try {
    const result = await host.serviceRequest({ method: 'POST', path, body: JSON.stringify(body ?? {}) });
    const answer: { ok?: boolean; error?: string } = JSON.parse(result.body || '{}');
    if (answer.ok === false && answer.error) show(answer.error, true);
  } catch (error) {
    show(error instanceof Error ? error.message : String(error), true);
  }
  void refresh();
};

// The tabs row.
let paintedTabs = '';
const paintTabs = (tabs: Tab[]): void => {
  const key = JSON.stringify(tabs);
  if (key === paintedTabs) return;
  paintedTabs = key;
  tabsRow.replaceChildren();
  for (const tab of tabs) {
    const item = document.createElement('div');
    item.className = 'tab';
    item.dataset.shown = String(tab.shown);
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-selected', String(tab.shown));
    let name = tab.title && tab.title !== tab.url ? tab.title : '';
    if (!name) {
      try {
        name = tab.url && tab.url !== 'about:blank' ? new URL(tab.url).host || tab.url : 'New tab';
      } catch {
        name = tab.url || 'New tab';
      }
    }
    item.title = `${name}\n${tab.url}${tab.agent ? '\nOpened by an agent' : ''}`;
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = `${tab.loading ? '… ' : ''}${name}`;
    item.append(title);
    if (tab.agent) {
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = 'AI';
      item.append(mark);
    }
    const close = document.createElement('button');
    close.className = 'close';
    close.setAttribute('aria-label', `Close ${name}`);
    close.append(svg(ICONS.stop, 12));
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      releaseFocus();
      void call('/tabs', { action: 'close', id: tab.id });
    });
    item.append(close);
    item.addEventListener('click', () => {
      releaseFocus();
      if (!tab.shown) void call('/tabs', { action: 'show', id: tab.id });
    });
    tabsRow.append(item);
  }
  const add = iconButton(tabsRow, 'New tab', ICONS.add, () => {
    void call('/tabs', { action: 'new' }).then(() => input?.focus());
  });
  add.node.classList.add('new-tab');
  tabsRow.querySelector('[data-shown="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

// The toolbar row.
const back = iconButton(toolbar, 'Back', ICONS.back, () => {
  releaseFocus();
  void call('/history', { direction: 'back' });
});
const forward = iconButton(toolbar, 'Forward', ICONS.forward, () => {
  releaseFocus();
  void call('/history', { direction: 'forward' });
});
const reload = iconButton(toolbar, 'Reload', ICONS.reload, () => {
  releaseFocus();
  void call(state?.loading ? '/stop' : '/reload');
});

const addressBox = document.createElement('div');
addressBox.style.cssText = 'flex:1;min-width:0;margin-left:6px;';
toolbar.append(addressBox);
let address = '';
const field = mountTextField(addressBox, {
  value: '',
  placeholder: 'Search Google or type a URL',
  onChange: (value) => {
    address = value;
    field.update({ value });
  },
});
const input = addressBox.querySelector('input');
if (input) {
  input.style.height = '28px';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && address.trim()) {
      event.preventDefault();
      input.blur();
      releaseFocus();
      void call('/navigate', { url: address });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      address = state?.url === 'about:blank' ? '' : state?.url ?? '';
      field.update({ value: address });
      input.blur();
      releaseFocus();
    }
  });
  input.addEventListener('focus', () => input.select());
}

const status = document.createElement('span');
status.className = 'status';
toolbar.append(status);

// Opens the shown page in the user's own browser, a new tab there (the page's logins stay in Cloak Browser).
const external = iconButton(toolbar, 'Open in your browser', ICONS.external, () => {
  releaseFocus();
  const url = state?.url ?? '';
  if (/^https?:\/\//.test(url)) void host.openUrl(url).catch(() => {});
});

// The dialog row.
const dialogMessage = document.createElement('span');
dialogMessage.className = 'message';
const promptBox = document.createElement('div');
promptBox.style.cssText = 'flex:0 1 40%;min-width:0;';
let promptText = '';
const promptField = mountTextField(promptBox, {
  value: '',
  onChange: (value) => {
    promptText = value;
    promptField.update({ value });
  },
});
const answer = (accept: boolean): void => {
  releaseFocus();
  void call('/dialog', { accept, ...(state?.dialog?.type === 'prompt' ? { text: promptText } : {}) });
};
promptBox.querySelector('input')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== 'Escape') return;
  event.preventDefault();
  answer(event.key === 'Enter');
});
dialogRow.append(dialogMessage, promptBox);
mountButton(dialogRow, { label: 'OK', variant: 'default', size: 'xs', onClick: () => answer(true) });
mountButton(dialogRow, { label: 'Cancel', variant: 'ghost', size: 'xs', onClick: () => answer(false) });
const cancelNode = dialogRow.lastElementChild as HTMLButtonElement;

/** The strip's height as it should be now: with the dialog row or without. */
let baseHeight = HEIGHT;

/**
 * Makes OpenChamber tell the service the panel's size again. OpenChamber sends it only when the picture's box changes
 * size, over an open connection, so a service started again (a restart of OpenChamber, an update) or a connection
 * that opened late gets none, and the page is laid out at another size and scaled into the panel. A pixel more of
 * strip and back changes the box twice; OpenChamber then sends the size it settles at, which is the panel's.
 */
let nudging = false;
let lastNudgeAt = 0;
const nudgeSize = async (): Promise<void> => {
  if (nudging) return;
  nudging = true;
  lastNudgeAt = Date.now();
  try {
    await host.setHeight(baseHeight + 1);
    // Past the dock's 200 ms transition, so the box really changed before it changes back.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await host.setHeight(baseHeight);
  } catch {
    // an older OpenChamber: the next look tries again
  } finally {
    nudging = false;
  }
};

/**
 * Whether the picture has this window's size, and the nudge when it has not: while no panel has given the service
 * its size since it started (again and again, slower each time: the picture may wait for "Try again"), once after the
 * strip loads when the width differs, and once each time this window takes control with another width (two windows
 * at different sizes do not then take turns forever). The strip is as wide as the picture.
 */
const SIZE_SLACK = 2;
const UNSIZED_WAITS_MS = [2000, 2000, 4000, 8000, 15_000];
let unsizedNudges = 0;
let checkedSince = false;
let controlled = false;
const checkSize = (next: State): void => {
  const surface = next.surface;
  if (!surface || next.phase !== 'running') return;
  const wanted = Math.min(surface.maxWidth, Math.round(window.innerWidth * (window.devicePixelRatio || 1)));
  const off = Math.abs(surface.width - wanted) > SIZE_SLACK;
  const takesControl = next.youControl === true && !controlled;
  controlled = next.youControl === true;
  const now = Date.now();
  if (!surface.sized) {
    if (now - lastNudgeAt > UNSIZED_WAITS_MS[Math.min(unsizedNudges, UNSIZED_WAITS_MS.length - 1)]) {
      unsizedNudges += 1;
      void nudgeSize();
    }
    return;
  }
  unsizedNudges = 0;
  const firstLook = !checkedSince;
  checkedSince = true;
  if (off && (firstLook || takesControl)) void nudgeSize();
};

let shownDialog = '';
const paintDialog = (dialog: Dialog | null): void => {
  const key = JSON.stringify(dialog);
  if (key === shownDialog) return;
  shownDialog = key;
  dialogRow.hidden = !dialog;
  baseHeight = dialog ? HEIGHT_WITH_DIALOG : HEIGHT;
  void host.setHeight(baseHeight).catch(() => {});
  if (!dialog) return;
  const kind = dialog.type === 'beforeunload' ? 'Leave this page?' : dialog.message;
  dialogMessage.textContent = kind;
  dialogMessage.title = dialog.message;
  promptBox.hidden = dialog.type !== 'prompt';
  promptText = dialog.defaultPrompt;
  promptField.update({ value: dialog.defaultPrompt });
  // Not `hidden`: the SDK's button sets its own display, which wins over the attribute.
  cancelNode.style.display = dialog.type === 'alert' ? 'none' : '';
};

let shownError: string | null = null;
const show = (text: string, error = false): void => {
  shownError = error ? text : null;
  status.textContent = text;
  status.title = text;
  status.dataset.error = String(error);
};

const describe = (next: State): string => {
  switch (next.phase) {
    case 'preparing': {
      const progress = next.progress;
      if (progress?.step === 'downloading') {
        const mb = (bytes: number) => Math.round(bytes / 1_048_576);
        return progress.total ? `Downloading CloakBrowser ${mb(progress.received)}/${mb(progress.total)} MB` : 'Downloading CloakBrowser';
      }
      if (progress?.step === 'verifying') return 'Checking the download';
      if (progress?.step === 'unpacking') return 'Unpacking CloakBrowser';
      return 'Preparing';
    }
    case 'starting':
      return 'Starting';
    case 'failed':
      return next.error ?? 'The browser stopped';
    case 'running':
      return next.loading ? 'Loading' : '';
    default:
      return '';
  }
};

/**
 * The field takes the focus a browser key in the picture asked for, and what was typed before it did: the service
 * kept those keys from the page and hands them over here, so nothing typed right after mod+L is lost.
 */
let takenAddress = 0;
const takeAddress = async (seq: number): Promise<void> => {
  takenAddress = seq;
  if (!input) return;
  // The field selects what it shows as it takes the focus, so what is typed from here replaces that.
  const shown = input.value;
  input.focus();
  try {
    const result = await host.serviceRequest({ method: 'POST', path: '/address', body: JSON.stringify({ seq }) });
    const answer: { draft?: unknown } = JSON.parse(result.body || '{}');
    if (typeof answer.draft === 'string' && answer.draft && document.activeElement === input) {
      // Typed before the field had the focus, then into it while the service answered.
      address = answer.draft + (input.value !== shown ? input.value : '');
      field.update({ value: address });
      input.setSelectionRange(address.length, address.length);
    }
  } catch {
    // the field has the focus either way
  }
};

const paint = (next: State): void => {
  state = next;
  checkSize(next);
  if (next.address && next.address.seq !== takenAddress) void takeAddress(next.address.seq);
  paintTabs(next.tabs ?? []);
  paintDialog(next.dialog ?? null);
  back.disable(!next.canGoBack || next.phase !== 'running');
  forward.disable(!next.canGoForward || next.phase !== 'running');
  reload.disable(next.phase !== 'running');
  reload.swap(next.loading ? ICONS.stop : ICONS.reload, next.loading ? 'Stop' : 'Reload');
  external.disable(!/^https?:\/\//.test(next.url));
  if (input && document.activeElement !== input) {
    const shown = next.url === 'about:blank' ? '' : next.url;
    if (input.value !== shown) {
      field.update({ value: shown });
      address = shown;
    }
  }
  if (!shownError || next.phase === 'failed') show(describe(next), next.phase === 'failed');
};

const refresh = async (): Promise<void> => {
  if (busy) return;
  busy = true;
  try {
    const result = await host.serviceRequest({ method: 'GET', path: '/state' });
    paint(JSON.parse(result.body) as State);
  } catch {
    show('The Cloak Browser service is not running', true);
  } finally {
    busy = false;
  }
};

const tellViewer = (): void => {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  void host.serviceRequest({ method: 'POST', path: '/viewer', body: JSON.stringify({ dpr: window.devicePixelRatio || 1, mac }) }).catch(() => {});
};

const watchRatio = (): void => {
  const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  query.addEventListener('change', () => {
    tellViewer();
    watchRatio();
  }, { once: true });
};

let started = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (started) return;
  started = true;
  tellViewer();
  watchRatio();
  void refresh();
  // Fast while the user works in the picture or something is moving (a download, a load), slow while the page
  // sits still.
  const tick = (): void => {
    const moving = !state || state.phase !== 'running' || state.loading;
    setTimeout(() => {
      void refresh().finally(tick);
    }, state?.inUse || state?.address ? 250 : moving ? 400 : 1000);
  };
  tick();
});
