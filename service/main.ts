// The Cloak Browser service. OpenChamber starts it with its own Node, a loopback port and a bearer token, and
// proxies two things to it: the panel's requests (`host.serviceRequest`, the strip docked above the picture) and the
// shared surface, the picture in the panel and the user's input on it. The contract is `GUEST_SERVICES.md` in
// `@openchamber/sdk` ("Service process contract", "Shared surface").
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  BROWSER_PROVIDER_PATH,
  SURFACE_AGENT_ACTIVE_HEADER,
  SURFACE_CLIPBOARD_PATH,
  SURFACE_CONTROL_PATH,
  SURFACE_FRAME_PATH,
  SURFACE_HEIGHT_HEADER,
  SURFACE_INPUT_PATH,
  SURFACE_RESIZE_PATH,
  SURFACE_SEQ_HEADER,
  SURFACE_TITLE_HEADER,
  SURFACE_WIDTH_HEADER,
  readBrowserProviderRequest,
  readSurfaceControlNotice,
  readSurfaceInputBatch,
  readSurfaceResizeRequest,
} from '@openchamber/sdk';

import { toUrl } from './address.ts';
import { Agent } from './agent.ts';
import { Browser } from './browser.ts';
import { Surface } from './surface.ts';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';
if (!port || !token) {
  console.error('OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required');
  process.exit(1);
}

const home = homedir();
const browser = new Browser({
  dataDir: process.env.OC_CLOAK_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(home, '.local/share'), 'oc-forge-cloak-browser'),
  cacheDir: process.env.OC_CLOAK_CACHE_DIR ?? join(process.env.XDG_CACHE_HOME ?? join(home, '.cache'), 'oc-forge-cloak-browser'),
  startUrl: process.env.OC_CLOAK_START_URL ?? 'https://www.google.com/',
  onChange: () => surface.browserChanged(),
});
const surface = new Surface(browser);
const agent = new Agent(browser, surface);

const readBody = (req: http.IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => { body += chunk; });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const readJson = async (req: http.IncomingMessage): Promise<Record<string, unknown> | null> => {
  try {
    const value: unknown = JSON.parse(await readBody(req));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

const send = (res: http.ServerResponse, status: number, body?: unknown): void => {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

/** A strip command: answered `{ ok }`, or `{ ok: false, error }` the strip shows. */
const command = async (res: http.ServerResponse, run: () => Promise<void>): Promise<void> => {
  try {
    await run();
    send(res, 200, { ok: true });
  } catch (error) {
    send(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

const route = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  switch (`${req.method} ${url.pathname}`) {
    case 'GET /health':
      return send(res, 200, { ok: true });
    case 'GET /state':
      void browser.start().catch(() => {});
      await browser.refresh();
      return send(res, 200, { ...browser.state(), ...surface.stripState() });
    case 'POST /navigate': {
      const body = await readJson(req);
      const address = typeof body?.url === 'string' ? body.url.trim() : '';
      if (!address) return send(res, 400, { ok: false, error: 'url is required' });
      return command(res, async () => {
        await browser.navigate(toUrl(address));
      });
    }
    case 'POST /history': {
      const body = await readJson(req);
      const direction = body?.direction === 'forward' ? 'forward' : 'back';
      return command(res, async () => {
        await browser.go(direction);
      });
    }
    case 'POST /tabs': {
      // The strip's tabs: a new one in front, one shown, one closed.
      const body = await readJson(req);
      const id = typeof body?.id === 'string' ? body.id : '';
      switch (body?.action) {
        case 'new':
          return command(res, async () => {
            await browser.newTab();
          });
        case 'show':
          return command(res, () => browser.show(id));
        case 'close':
          return command(res, () => browser.closeTab(id));
        default:
          return send(res, 400, { ok: false, error: 'action is new, show or close' });
      }
    }
    case 'POST /address': {
      // The strip's address field took the focus a browser key asked for: it gets what was typed before it did.
      const body = await readJson(req);
      return send(res, 200, { ok: true, draft: surface.takeAddress(Number(body?.seq)) });
    }
    case 'POST /dialog': {
      // The shown tab's alert, confirm or prompt, answered from the strip.
      const body = await readJson(req);
      const text = typeof body?.text === 'string' ? body.text : undefined;
      return command(res, () => browser.answerDialog(browser.shownId, body?.accept === true, text));
    }
    case `POST ${BROWSER_PROVIDER_PATH}`: {
      const request = readBrowserProviderRequest(await readBody(req));
      if (!request) return send(res, 400, { ok: false, error: 'Not a browser action' });
      return send(res, 200, await agent.handle(request));
    }
    case 'POST /reload':
      return command(res, () => browser.reload());
    case 'POST /stop':
      return command(res, () => browser.stopLoading());
    case 'POST /viewer': {
      const body = await readJson(req);
      const dpr = typeof body?.dpr === 'number' && Number.isFinite(body.dpr) ? body.dpr : 1;
      surface.viewer(dpr, body?.mac === true);
      return send(res, 200, { ok: true });
    }
    case `GET ${SURFACE_FRAME_PATH}`: {
      const answer = await surface.frameAfter(Number(url.searchParams.get('after')) || 0, Number(url.searchParams.get('wait')) || 0);
      if (!answer) return send(res, 204);
      res.writeHead(200, {
        'Content-Type': answer.frame.mime,
        'Content-Length': answer.frame.bytes.length,
        [SURFACE_SEQ_HEADER]: String(answer.seq),
        [SURFACE_WIDTH_HEADER]: String(answer.frame.width),
        [SURFACE_HEIGHT_HEADER]: String(answer.frame.height),
        [SURFACE_TITLE_HEADER]: answer.title,
        ...(answer.agentActive ? { [SURFACE_AGENT_ACTIVE_HEADER]: '1' } : {}),
      });
      res.end(answer.frame.bytes);
      return;
    }
    case `POST ${SURFACE_INPUT_PATH}`: {
      const batch = readSurfaceInputBatch(await readBody(req));
      if (!batch) return send(res, 400);
      try {
        await surface.input(batch.events);
        return send(res, 204);
      } catch (error) {
        return send(res, 503, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    case `POST ${SURFACE_CONTROL_PATH}`: {
      const notice = readSurfaceControlNotice(await readBody(req));
      if (!notice) return send(res, 400);
      surface.controller = notice.controller;
      return send(res, 204);
    }
    case `POST ${SURFACE_RESIZE_PATH}`: {
      const request = readSurfaceResizeRequest(await readBody(req));
      if (!request) return send(res, 400);
      return send(res, 200, surface.resize(request.width, request.height));
    }
    case `GET ${SURFACE_CLIPBOARD_PATH}`:
      return send(res, 200, { text: await surface.clipboard().catch(() => '') });
    default:
      return send(res, 404, { ok: false, error: 'not-found' });
  }
};

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    send(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }
  route(req, res).catch((error: unknown) => {
    console.error(error);
    if (res.headersSent) res.destroy();
    else send(res, 500, { ok: false, error: 'internal' });
  });
});
server.listen(port, '127.0.0.1');

// OpenChamber stops a service with SIGTERM (then SIGKILL): the browser goes with it. One killed outright leaves its
// browser behind, which the next start stops (browser.ts, stopLeftover).
let stopping = false;
const shutdown = (): void => {
  if (stopping) return;
  stopping = true;
  server.close();
  void browser.stop().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
