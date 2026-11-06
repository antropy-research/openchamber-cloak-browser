// The Cloak Browser service. OpenChamber starts it with its own Node, a loopback
// port and a bearer token, and proxies two things to it: the panel's requests
// (`host.serviceRequest`) and the shared surface, the picture in the panel and
// the user's input on it. The contract is `GUEST_SERVICES.md` in
// `@openchamber/sdk` ("Service process contract", "Shared surface").
//
// This skeleton answers that contract with a placeholder picture. CloakBrowser
// comes next (README, Status).
import http from 'node:http';
import { deflateSync } from 'node:zlib';

import {
  SURFACE_CLIPBOARD_PATH,
  SURFACE_CONTROL_PATH,
  SURFACE_FRAME_PATH,
  SURFACE_HEIGHT_HEADER,
  SURFACE_INPUT_PATH,
  SURFACE_RESIZE_PATH,
  SURFACE_SEQ_HEADER,
  SURFACE_TITLE_HEADER,
  SURFACE_WIDTH_HEADER,
  readSurfaceControlNotice,
  readSurfaceInputBatch,
  readSurfaceResizeRequest,
  type SurfaceController,
} from '@openchamber/sdk';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';
if (!port || !token) {
  console.error('OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required');
  process.exit(1);
}

/** Shown by OpenChamber above the picture and by the strip. ASCII: it travels in an HTTP header. */
const TITLE = 'Cloak Browser: no browser yet (skeleton)';
/** OpenChamber asks for a frame with `wait=25000`; a request is never held longer. */
const FRAME_WAIT_MAX_MS = 25_000;
/** The picture follows the panel's size, in device pixels, within these bounds. */
const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;
const MAX_WIDTH = 3840;
const MAX_HEIGHT = 2400;

const surface = {
  /** Our own frame number; it starts at 1, so `after=0` asks for the current picture. */
  seq: 1,
  width: 1280,
  height: 800,
  controller: 'none' as SurfaceController,
  picture: null as Buffer | null,
  waiters: new Set<() => void>(),
};

/** A new picture: whoever waits for one gets it now. */
const changed = (): void => {
  surface.seq += 1;
  surface.picture = null;
  const waiters = [...surface.waiters];
  surface.waiters.clear();
  for (const wake of waiters) wake();
};

/** Resolves on the next picture or after `ms`, whichever comes first. */
const nextPicture = (ms: number): Promise<void> => new Promise((resolve) => {
  const wake = (): void => {
    clearTimeout(timer);
    surface.waiters.delete(wake);
    resolve();
  };
  const timer = setTimeout(wake, ms);
  surface.waiters.add(wake);
});

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), body.length + 4);
  return chunk;
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A fully transparent picture: the panel's own background shows through, in any theme. */
const blankPicture = (width: number, height: number): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  // Every row is a filter byte (0) and `width` transparent pixels: all zeros.
  const rows = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.round(value)));

const readBody = (req: http.IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => { body += chunk; });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const send = (res: http.ServerResponse, status: number, body?: unknown): void => {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

/** `GET /surface/frame?after=<seq>&wait=<ms>`: the picture once it is newer than `after`, else 204. */
const sendFrame = async (res: http.ServerResponse, url: URL): Promise<void> => {
  const after = Number(url.searchParams.get('after')) || 0;
  const wait = clamp(Number(url.searchParams.get('wait')) || 0, 0, FRAME_WAIT_MAX_MS);
  if (surface.seq <= after && wait > 0) await nextPicture(wait);
  if (surface.seq <= after) {
    send(res, 204);
    return;
  }
  surface.picture ??= blankPicture(surface.width, surface.height);
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': surface.picture.length,
    [SURFACE_SEQ_HEADER]: String(surface.seq),
    [SURFACE_WIDTH_HEADER]: String(surface.width),
    [SURFACE_HEIGHT_HEADER]: String(surface.height),
    [SURFACE_TITLE_HEADER]: TITLE,
  });
  res.end(surface.picture);
};

const route = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  switch (`${req.method} ${url.pathname}`) {
    case 'GET /health':
      return send(res, 200, { ok: true });
    case 'GET /state':
      // What the strip shows.
      return send(res, 200, { running: false, title: TITLE, controller: surface.controller });
    case `GET ${SURFACE_FRAME_PATH}`:
      return sendFrame(res, url);
    case `POST ${SURFACE_INPUT_PATH}`:
      // No page to drive yet: valid input is taken and dropped.
      return send(res, readSurfaceInputBatch(await readBody(req)) ? 204 : 400);
    case `POST ${SURFACE_CONTROL_PATH}`: {
      const notice = readSurfaceControlNotice(await readBody(req));
      if (!notice) return send(res, 400);
      surface.controller = notice.controller;
      return send(res, 204);
    }
    case `POST ${SURFACE_RESIZE_PATH}`: {
      const request = readSurfaceResizeRequest(await readBody(req));
      if (!request) return send(res, 400);
      const width = clamp(request.width, MIN_WIDTH, MAX_WIDTH);
      const height = clamp(request.height, MIN_HEIGHT, MAX_HEIGHT);
      if (width !== surface.width || height !== surface.height) {
        surface.width = width;
        surface.height = height;
        changed();
      }
      return send(res, 200, { width, height });
    }
    case `GET ${SURFACE_CLIPBOARD_PATH}`:
      return send(res, 200, { text: '' });
    default:
      return send(res, 404, { ok: false, error: 'not-found' });
  }
};

http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    send(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }
  route(req, res).catch((error: unknown) => {
    console.error(error);
    if (res.headersSent) res.destroy();
    else send(res, 500, { ok: false, error: 'internal' });
  });
}).listen(port, '127.0.0.1');
