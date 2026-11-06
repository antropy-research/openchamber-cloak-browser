// The panel: a strip with the tabs, then back, forward, reload, the address and what the browser is doing; under it
// the shown tab's page as HTML (mirror-view.ts), with a page's alert, confirm or prompt over it when one waits. It
// reaches the service through `host.serviceRequest` only.
import { connectHost } from '@openchamber/sdk';
import { applyHostReady, mountButton, mountTextField } from '@openchamber/sdk/ui';

import { MirrorView } from './mirror-view.ts';

type Tab = { id: string; title: string; url: string; shown: boolean; agent: boolean; loading: boolean };
type Controlled = { controller: 'none' | 'agent' | 'user'; mine: boolean };
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
  /** A browser key in the page asked for the address (mod+L, mod+T): the field takes the focus. */
  address: { seq: number } | null;
  /** The user is working in the page: the strip looks more often, so a new tab or title shows at once. */
  inUse: boolean;
  /** Who works in the browser, said for this window (service/control.ts). */
  control?: Controlled;
  agentActive?: boolean;
};

// Remixicon (Apache-2.0) line icons, 24×24.
const ICONS = {
  back: 'M7.828 11H20v2H7.828l5.364 5.364-1.414 1.414L4 12l7.778-7.778 1.414 1.414z',
  forward: 'M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z',
  reload: 'M5.463 4.433A9.961 9.961 0 0 1 12 2c5.523 0 10 4.477 10 10 0 2.136-.67 4.116-1.81 5.74L17 12h3A8 8 0 0 0 6.46 6.228l-.997-1.795zm13.074 15.134A9.961 9.961 0 0 1 12 22C6.477 22 2 17.523 2 12c0-2.136.67-4.116 1.81-5.74L7 12H4a8 8 0 0 0 13.54 5.772l.997 1.795z',
  stop: 'M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z',
  add: 'M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z',
  external: 'M10 6v2H5v11h11v-5h2v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6zm11-3v8h-2V6.413l-7.793 7.794-1.414-1.414L17.585 5H13V3h8z',
  picture: 'M2.992 21A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992zM20 15V5H4v14L14 9l6 6zm0 2.828l-6-6L6.828 19H20v-1.172zM8 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
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
/** This window's panel, for who holds control. Not crypto.randomUUID: OpenChamber may be served over plain HTTP. */
const viewer = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('');
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing #root');

const strip = document.createElement('div');
strip.className = 'strip';
const tabsRow = document.createElement('div');
tabsRow.className = 'row tabs';
tabsRow.setAttribute('role', 'tablist');
const toolbar = document.createElement('div');
toolbar.className = 'row toolbar';
strip.append(tabsRow, toolbar);
root.append(strip);

const placeholder = document.createElement('div');
placeholder.className = 'placeholder';
let pageShown = false;
const view = new MirrorView(root, {
  host,
  viewer,
  onShown: (shown) => {
    pageShown = shown;
    if (state) paintPlaceholder(state);
  },
  onMode: (mode) => {
    asPicture.node.setAttribute('aria-pressed', String(mode.picture));
    asPicture.swap(ICONS.picture, mode.picture ? 'Show the page as HTML' : 'Show the page as a picture');
  },
});
const dialogBox = document.createElement('div');
dialogBox.className = 'dialog';
dialogBox.setAttribute('role', 'alertdialog');
dialogBox.hidden = true;
view.element.append(placeholder, dialogBox);

/** The keyboard to the page once the strip is done with it, as in a browser after Enter in the address field. */
const releaseFocus = (): void => {
  view.focus();
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

// While this window holds control, the agent's actions wait: the user hands it back here (or it ends by itself after
// a minute without input).
const handBackBox = document.createElement('span');
handBackBox.className = 'hand-back';
handBackBox.hidden = true;
toolbar.append(handBackBox);
mountButton(handBackBox, {
  label: 'Hand back to agent',
  variant: 'outline',
  size: 'xs',
  onClick: () => {
    releaseFocus();
    void host.serviceRequest({ method: 'POST', path: '/control', body: JSON.stringify({ action: 'release', viewer }) }).catch(() => {}).then(() => refresh());
  },
});

// The page as a picture (what Cloak Browser draws), or as HTML again: for a page HTML does not show well.
const asPicture = iconButton(toolbar, 'Show the page as a picture', ICONS.picture, () => {
  view.togglePicture();
  releaseFocus();
});
asPicture.node.setAttribute('aria-pressed', 'false');

// Opens the shown page in the user's own browser, a new tab there (the page's logins stay in Cloak Browser).
const external = iconButton(toolbar, 'Open in your browser', ICONS.external, () => {
  releaseFocus();
  const url = state?.url ?? '';
  if (/^https?:\/\//.test(url)) void host.openUrl(url).catch(() => {});
});

// The dialog, over the page as in a browser: it does not change the page's size.
const dialogMessage = document.createElement('div');
dialogMessage.className = 'message';
const promptBox = document.createElement('div');
promptBox.className = 'prompt';
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
const dialogButtons = document.createElement('div');
dialogButtons.className = 'buttons';
mountButton(dialogButtons, { label: 'Cancel', variant: 'ghost', size: 'xs', onClick: () => answer(false) });
const cancelNode = dialogButtons.lastElementChild as HTMLButtonElement;
mountButton(dialogButtons, { label: 'OK', variant: 'default', size: 'xs', onClick: () => answer(true) });
const okNode = dialogButtons.lastElementChild as HTMLButtonElement;
dialogBox.append(dialogMessage, promptBox, dialogButtons);

let shownDialog = '';
const paintDialog = (dialog: Dialog | null): void => {
  const key = JSON.stringify(dialog);
  if (key === shownDialog) return;
  shownDialog = key;
  dialogBox.hidden = !dialog;
  if (!dialog) return;
  const kind = dialog.type === 'beforeunload' ? 'Leave this page?' : dialog.message;
  dialogMessage.textContent = kind;
  dialogMessage.title = dialog.message;
  promptBox.hidden = dialog.type !== 'prompt';
  promptText = dialog.defaultPrompt;
  promptField.update({ value: dialog.defaultPrompt });
  // Not `hidden`: the SDK's button sets its own display, which wins over the attribute.
  cancelNode.style.display = dialog.type === 'alert' ? 'none' : '';
  // The keyboard answers it, as in a browser: Enter is OK, Escape is Cancel (the prompt's field has its own).
  const field = promptBox.querySelector('input');
  if (dialog.type === 'prompt' && field) field.focus();
  else okNode.focus();
};
dialogBox.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    answer(false);
  }
});

/** Over the page while it has none to show: what the browser is doing, or why it stopped. */
const paintPlaceholder = (next: State): void => {
  const showing = pageShown && next.phase === 'running';
  placeholder.hidden = showing;
  if (!showing) placeholder.textContent = describe(next) || 'Cloak Browser';
};

let shownError: string | null = null;
const show = (text: string, error = false): void => {
  shownError = error ? text : null;
  status.textContent = text;
  status.title = text;
  status.dataset.error = String(error);
};

/** Who works in the browser, in OpenChamber's words for its own surface; '' for nobody. */
const controlText = (next: State): string => {
  if (next.phase !== 'running') return '';
  if (next.control?.controller === 'user') return next.control.mine ? 'You have control' : 'Another device has control';
  if (next.control?.controller === 'agent' || next.agentActive) return 'Agent is working';
  return '';
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
 * The field takes the focus a browser key in the page asked for, and what was typed before it did: the service
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
  paintPlaceholder(next);
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
  handBackBox.hidden = !(next.control?.controller === 'user' && next.control.mine);
  view.setControl(next.control?.controller === 'user' && next.control.mine);
  status.dataset.control = next.control?.controller === 'user' && next.control.mine ? 'mine' : '';
  if (!shownError || next.phase === 'failed') show(controlText(next) || describe(next), next.phase === 'failed');
};

const refresh = async (): Promise<void> => {
  if (busy) return;
  busy = true;
  try {
    const result = await host.serviceRequest({ method: 'GET', path: `/state?viewer=${viewer}` });
    paint(JSON.parse(result.body) as State);
  } catch {
    show('The Cloak Browser service is not running', true);
  } finally {
    busy = false;
  }
};

/**
 * Whether the panel is shown. OpenChamber keeps an extension's page running when its panel is closed or another one
 * is shown, and tells it neither: a closed zone keeps the page laid out at opacity 0, clipped to the narrow column
 * the zone shrinks to, and another panel in the zone hides it. So the page counts as shown while nearly all of it is
 * in view, and the browser tab is not hidden; not shown for SHOWN_SETTLE_MS (past the zone's animation), it stops
 * asking the service, and the service then counts it as gone (no recorder, no pictures, no handover).
 */
const SHOWN_SETTLE_MS = 1500;
let shown = true;
let inView = true;
let shownTimer: ReturnType<typeof setTimeout> | null = null;
const shownChanged = (): void => {
  const now = inView && document.visibilityState !== 'hidden';
  if (shownTimer) clearTimeout(shownTimer);
  shownTimer = null;
  if (now) {
    if (!shown) {
      shown = true;
      view.setActive(true);
      void refresh();
    }
    return;
  }
  shownTimer = setTimeout(() => {
    shownTimer = null;
    shown = false;
    view.setActive(false);
  }, SHOWN_SETTLE_MS);
};
new IntersectionObserver((entries) => {
  for (const entry of entries) inView = entry.intersectionRatio >= 0.95;
  shownChanged();
}, { threshold: [0, 0.95, 1] }).observe(root);
document.addEventListener('visibilitychange', shownChanged);

let started = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (started) return;
  started = true;
  view.start();
  void refresh();
  // Fast while the user works in the page or something is moving (a download, a load), slow while the page
  // sits still, not at all while the panel is not shown.
  const tick = (): void => {
    const moving = !state || state.phase !== 'running' || state.loading;
    setTimeout(() => {
      if (!shown) {
        tick();
        return;
      }
      void refresh().finally(tick);
    }, state?.inUse || state?.address ? 250 : moving ? 400 : 1000);
  };
  tick();
});
