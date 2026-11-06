// The strip OpenChamber docks above the picture (`panel.dock: "top"`): back, forward, reload, the address, and what
// the browser is doing. An ordinary panel page: it reaches the service through `host.serviceRequest` and never sees
// the picture or the input, which stay with the host. It also tells the service this window's pixel ratio, so the
// picture is drawn for the screen it is shown on.
import { connectHost } from '@openchamber/sdk';
import { applyHostReady, mountButton, mountTextField } from '@openchamber/sdk/ui';

type State = {
  phase: 'idle' | 'preparing' | 'starting' | 'running' | 'failed';
  error: string | null;
  progress: { step: 'downloading' | 'verifying' | 'unpacking'; received: number; total: number } | null;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

// Remixicon (Apache-2.0) line icons, 24×24.
const ICONS = {
  back: 'M7.828 11H20v2H7.828l5.364 5.364-1.414 1.414L4 12l7.778-7.778 1.414 1.414z',
  forward: 'M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z',
  reload: 'M5.463 4.433A9.961 9.961 0 0 1 12 2c5.523 0 10 4.477 10 10 0 2.136-.67 4.116-1.81 5.74L17 12h3A8 8 0 0 0 6.46 6.228l-.997-1.795zm13.074 15.134A9.961 9.961 0 0 1 12 22C6.477 22 2 17.523 2 12c0-2.136.67-4.116 1.81-5.74L7 12H4a8 8 0 0 0 13.54 5.772l.997 1.795z',
  stop: 'M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z',
} as const;

const svg = (path: string): SVGSVGElement => {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '16');
  icon.setAttribute('height', '16');
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
strip.style.cssText = 'display:flex;align-items:center;gap:2px;height:100%;padding:0 8px;box-sizing:border-box;';
root.append(strip);

/** An icon button in the SDK's ghost style: mountButton draws it, the icon goes where its label is empty. */
const iconButton = (name: string, path: string, onClick: () => void) => {
  const handle = mountButton(strip, { label: '', variant: 'ghost', size: 'xs', onClick });
  const node = strip.lastElementChild as HTMLButtonElement;
  node.setAttribute('aria-label', name);
  node.title = name;
  node.style.padding = '0 6px';
  const icon = svg(path);
  node.prepend(icon);
  return {
    disable: (disabled: boolean) => handle.update({ disabled }),
    swap: (next: string, label: string) => {
      icon.firstElementChild?.setAttribute('d', next);
      node.setAttribute('aria-label', label);
      node.title = label;
    },
  };
};

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

const back = iconButton('Back', ICONS.back, () => {
  releaseFocus();
  void call('/history', { direction: 'back' });
});
const forward = iconButton('Forward', ICONS.forward, () => {
  releaseFocus();
  void call('/history', { direction: 'forward' });
});
const reload = iconButton('Reload', ICONS.reload, () => {
  releaseFocus();
  void call(state?.loading ? '/stop' : '/reload');
});

const addressBox = document.createElement('div');
addressBox.style.cssText = 'flex:1;min-width:0;margin-left:6px;';
strip.append(addressBox);
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
status.style.cssText = 'flex:none;max-width:40%;margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px/1.4 var(--oc-font);color:var(--oc-muted);';
strip.append(status);

let shownError: string | null = null;
const show = (text: string, error = false): void => {
  shownError = error ? text : null;
  status.textContent = text;
  status.title = text;
  status.style.color = error ? 'var(--oc-error-text, var(--oc-error))' : 'var(--oc-muted)';
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

const paint = (next: State): void => {
  state = next;
  back.disable(!next.canGoBack || next.phase !== 'running');
  forward.disable(!next.canGoForward || next.phase !== 'running');
  reload.disable(next.phase !== 'running');
  reload.swap(next.loading ? ICONS.stop : ICONS.reload, next.loading ? 'Stop' : 'Reload');
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
  // Fast while something is moving (a download, a load), slow while the page sits still.
  const tick = (): void => {
    const moving = !state || state.phase !== 'running' || state.loading;
    setTimeout(() => {
      void refresh().finally(tick);
    }, moving ? 400 : 1200);
  };
  tick();
});
