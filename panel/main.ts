// The strip OpenChamber docks above the picture (`panel.dock: "top"`). It is an
// ordinary panel page: it reaches the service through `host.serviceRequest` and
// never sees the picture or the input, which stay with the host. The skeleton
// only says what runs; the address field, back/forward/reload and the tabs come
// with the browser.
import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing #root');

const strip = document.createElement('div');
strip.style.cssText = 'display:flex;align-items:center;height:100%;padding:0 12px;box-sizing:border-box;';
const line = document.createElement('span');
line.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px/1.4 var(--oc-font);color:var(--oc-muted);';
line.textContent = 'Cloak Browser';
strip.append(line);
root.append(strip);

const refresh = async (): Promise<void> => {
  try {
    const result = await host.serviceRequest({ method: 'GET', path: '/state' });
    const state: { title?: unknown } = JSON.parse(result.body);
    if (typeof state.title === 'string') line.textContent = state.title;
  } catch {
    line.textContent = 'Cloak Browser: the service is not running';
  }
};

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  void refresh();
});
