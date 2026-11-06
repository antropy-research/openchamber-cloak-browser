// service/main.ts
import http from "node:http";
import { homedir } from "node:os";
import { join as join3 } from "node:path";
// node_modules/@openchamber/sdk/dist/scrollbar-style.js
var GUEST_SCROLLING_ATTRIBUTE = "data-oc-scrolling";
var GUEST_SCROLLBAR_CSS = `
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${GUEST_SCROLLING_ATTRIBUTE}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${GUEST_SCROLLING_ATTRIBUTE}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;
function installGuestScrollbarActivity(doc) {
  const root = doc.documentElement;
  if (root.hasAttribute("data-oc-scrollbar-activity"))
    return;
  root.setAttribute("data-oc-scrollbar-activity", "");
  const timers = new WeakMap;
  doc.addEventListener("scroll", (event) => {
    const target = event.target === doc ? root : event.target;
    if (!(target instanceof Element))
      return;
    if (!target.hasAttribute("data-oc-scrolling"))
      target.setAttribute("data-oc-scrolling", "");
    const pending = timers.get(target);
    if (pending !== undefined)
      clearTimeout(pending);
    timers.set(target, setTimeout(() => {
      timers.delete(target);
      target.removeAttribute("data-oc-scrolling");
    }, 1000));
  }, { capture: true, passive: true });
}
var GUEST_SCROLLBAR_SCRIPT = `(${installGuestScrollbarActivity.toString()})(document);`;
// node_modules/@openchamber/sdk/dist/manifest.js
var TRACKER_URL_TOKENS = ["{id}", "{segment}", "{segments+}"];
var TRACKER_URL_TOKEN_SET = new Set(TRACKER_URL_TOKENS);
// node_modules/@openchamber/sdk/dist/session-events.js
var GUEST_SESSION_EVENT_TYPES = ["turn-finished", "turn-failed", "permission-asked", "question-asked"];
var SESSION_EVENTS_IDLE_MS = 10 * 60000;
var EVENT_TYPES = new Set(GUEST_SESSION_EVENT_TYPES);
// node_modules/@openchamber/sdk/dist/file-editor.js
var patternExpressions = new Map;
// node_modules/@openchamber/sdk/dist/contract.js
var GUEST_FILE_STAT_KINDS = ["file", "directory", "other", "missing"];
var GUEST_GENERATE_LATE_KEEP_MS = 60 * 60000;
var HOST_REQUEST_ERROR_CODES = [
  "HOST_UNAVAILABLE",
  "HOST_TIMEOUT",
  "HOST_REJECTED",
  "DISCONNECTED",
  "DISABLED",
  "BAD_PATH",
  "NO_INTEGRATION",
  "NO_SERVICE",
  "SERVICE_FAILED",
  "REQUEST_FAILED",
  "RESPONSE_TOO_LARGE",
  "NO_SESSION",
  "SESSION_BUSY",
  "NOT_GRANTED",
  "NO_DIRECTORY",
  "NOT_FOUND",
  "FILE_TOO_LARGE",
  "DENIED",
  "NO_MODEL",
  "MODEL_FAILED",
  "UNSUPPORTED"
];
var SERVICE_STATUS_VALUES = ["stopped", "starting", "ready", "failed"];
var hostRequestErrorCodeSet = new Set(HOST_REQUEST_ERROR_CODES);
var serviceStatusSet = new Set(SERVICE_STATUS_VALUES);
var fileStatKindSet = new Set(GUEST_FILE_STAT_KINDS);
var HOST_PUSH_TYPES = new Set([
  "workspace",
  "shells",
  "ready",
  "directory",
  "session",
  "connection",
  "settings",
  "session-lifecycle",
  "item",
  "resolve",
  "action",
  "status-control-event",
  "popover-closed",
  "file-open",
  "file-snapshot",
  "file-saved",
  "generate-late"
]);
// node_modules/@openchamber/sdk/dist/service-providers.js
var BROWSER_CONTROL_ACTIONS = [
  "browser.open",
  "browser.snapshot",
  "browser.click",
  "browser.type",
  "browser.select",
  "browser.scroll",
  "browser.back",
  "browser.forward",
  "browser.inspect",
  "browser.capture",
  "browser.resize",
  "browser.close"
];
var BROWSER_PROVIDER_IDLE_MS = 10 * 60000;
var CONTROL_ACTIONS = new Set(BROWSER_CONTROL_ACTIONS);
var SOURCE_CONTROL_PROVIDER_IDLE_MS = 10 * 60000;
var NOTIFICATIONS_PROVIDER_IDLE_MS = 10 * 60000;
var TRACKER_PROVIDER_IDLE_MS = 10 * 60000;
// node_modules/@openchamber/sdk/dist/service-surface.js
var SURFACE_FRAME_PATH = "/surface/frame";
var SURFACE_INPUT_PATH = "/surface/input";
var SURFACE_CONTROL_PATH = "/surface/control";
var SURFACE_RESIZE_PATH = "/surface/resize";
var SURFACE_CLIPBOARD_PATH = "/surface/clipboard";
var SURFACE_SEQ_HEADER = "x-surface-seq";
var SURFACE_WIDTH_HEADER = "x-surface-width";
var SURFACE_HEIGHT_HEADER = "x-surface-height";
var SURFACE_TITLE_HEADER = "x-surface-title";
var SURFACE_INPUT_BATCH_MAX = 256;
var SURFACE_TEXT_MAX = 64000;
var SURFACE_TITLE_MAX = 200;
var SURFACE_DIMENSION_MAX = 16384;
var SURFACE_CONTROLLERS = ["none", "agent", "user"];
var isFiniteNumber = (value) => Number(value) === value && Number.isFinite(value);
var isBool = (value) => value === true || value === false;
var isText = (value) => String(value) === value;
var readModifiers = (value) => {
  if (Object(value) !== value || value === null)
    return null;
  const wire = value;
  if (!isBool(wire.alt) || !isBool(wire.ctrl) || !isBool(wire.meta) || !isBool(wire.shift))
    return null;
  return { alt: wire.alt, ctrl: wire.ctrl, meta: wire.meta, shift: wire.shift };
};
var readEvent = (value) => {
  if (value.type === "text") {
    if (!isText(value.text) || value.text.length > SURFACE_TEXT_MAX)
      return null;
    return { type: "text", text: value.text };
  }
  const modifiers = readModifiers(value.modifiers);
  if (!modifiers)
    return null;
  if (value.type === "pointer") {
    if (value.action !== "down" && value.action !== "up" && value.action !== "move")
      return null;
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.button) || !isFiniteNumber(value.buttons))
      return null;
    return { type: "pointer", action: value.action, x: value.x, y: value.y, button: value.button, buttons: value.buttons, modifiers };
  }
  if (value.type === "wheel") {
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.deltaX) || !isFiniteNumber(value.deltaY))
      return null;
    return { type: "wheel", x: value.x, y: value.y, deltaX: value.deltaX, deltaY: value.deltaY, modifiers };
  }
  if (value.type === "key") {
    if (value.action !== "down" && value.action !== "up")
      return null;
    if (!isText(value.key) || !isText(value.code) || value.key.length > 64 || value.code.length > 64)
      return null;
    if (value.keyCode === undefined)
      return { type: "key", action: value.action, key: value.key, code: value.code, modifiers };
    if (!isFiniteNumber(value.keyCode) || !Number.isInteger(value.keyCode) || value.keyCode < 0 || value.keyCode > 255)
      return null;
    return { type: "key", action: value.action, key: value.key, code: value.code, keyCode: value.keyCode, modifiers };
  }
  return null;
};
var readSurfaceInputBatch = (body) => {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (Object(parsed) !== parsed || parsed === null || !Array.isArray(parsed.events))
    return null;
  if (parsed.events.length > SURFACE_INPUT_BATCH_MAX)
    return null;
  const events = [];
  for (const item of parsed.events) {
    if (Object(item) !== item || item === null)
      return null;
    const event = readEvent(item);
    if (!event)
      return null;
    events.push(event);
  }
  return { events };
};
var CONTROLLERS = new Set(SURFACE_CONTROLLERS);
var readSurfaceControlNotice = (body) => {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (Object(parsed) !== parsed || parsed === null)
    return null;
  const { controller, viewer } = parsed;
  if (!isText(controller) || !CONTROLLERS.has(controller))
    return null;
  const notice = { controller };
  if (controller === "user" && isText(viewer) && viewer.length > 0)
    notice.viewer = viewer;
  return notice;
};
var readSurfaceResizeRequest = (body) => {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (Object(parsed) !== parsed || parsed === null)
    return null;
  const { width, height } = parsed;
  if (!isFiniteNumber(width) || !isFiniteNumber(height))
    return null;
  if (width < 1 || height < 1 || width > SURFACE_DIMENSION_MAX || height > SURFACE_DIMENSION_MAX)
    return null;
  return { width: Math.round(width), height: Math.round(height) };
};
// service/browser.ts
import { spawn as spawn2 } from "node:child_process";
import { existsSync as existsSync2, readFileSync } from "node:fs";
import { mkdir as mkdir2, readFile as readFile2, readlink, writeFile as writeFile2 } from "node:fs/promises";
import { join as join2 } from "node:path";

// service/binary.ts
import { spawn } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
var FREE_BUILD = { tag: "chromium-v146.0.7680.177.5", version: "146.0.7680.177.5" };
var RELEASES = "https://github.com/CloakHQ/CloakBrowser/releases/download";
var SIGNING_KEYS = ["MKFKwIhUcKWq5xTuNA0Ovg99njcDEcEJvmWYYhApvaU="];
var ARCHIVES = {
  "linux-x64": "cloakbrowser-linux-x64.tar.gz",
  "linux-arm64": "cloakbrowser-linux-arm64.tar.gz"
};
var fetchBytes = async (url) => {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!response.ok)
    throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
var checkSignature = (manifest, signatureFile) => {
  const text = signatureFile.toString("utf8").trim();
  const signature = Buffer.from(text, "base64");
  if (signature.toString("base64") !== text)
    throw new Error("SHA256SUMS.sig is not valid base64");
  for (const raw of SIGNING_KEYS) {
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(raw, "base64").toString("base64url") }, format: "jwk" });
    if (verify(null, manifest, key, signature))
      return;
  }
  throw new Error("SHA256SUMS is not signed by CloakBrowser's key");
};
var expectedHash = (manifest, archive) => {
  for (const line of manifest.toString("utf8").split(`
`)) {
    const match = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim());
    if (match && match[2] === archive)
      return match[1];
  }
  throw new Error(`SHA256SUMS has no line for ${archive}`);
};
var download = async (url, file, onProgress) => {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body)
    throw new Error(`${url} answered ${response.status}`);
  const total = Number(response.headers.get("content-length")) || 0;
  const hash = createHash("sha256");
  const out = createWriteStream(file);
  let received = 0;
  let reported = 0;
  try {
    for await (const chunk of response.body) {
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk))
        await new Promise((resolve) => out.once("drain", () => resolve()));
      if (received - reported > 1 << 20) {
        reported = received;
        onProgress(received, total);
      }
    }
  } finally {
    await new Promise((resolve, reject) => out.end((error) => error ? reject(error) : resolve()));
  }
  onProgress(received, total);
  return hash.digest("hex");
};
var untar = (archive, into) => new Promise((resolve, reject) => {
  const tar = spawn("tar", ["-xzf", archive, "-C", into], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  tar.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  tar.on("error", reject);
  tar.on("close", (code) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}: ${stderr.trim().slice(0, 300)}`)));
});
var resolveBinary = async (cacheDir, onProgress) => {
  const override = process.env.CLOAKBROWSER_BINARY_PATH;
  if (override) {
    if (!existsSync(override))
      throw new Error(`CLOAKBROWSER_BINARY_PATH is ${override}, and there is no file there.`);
    return { path: override, version: "local", source: "override" };
  }
  const platform = `${process.platform}-${process.arch}`;
  const archive = ARCHIVES[platform];
  if (!archive)
    throw new Error(`CloakBrowser has no free build for ${platform}.`);
  const dir = join(cacheDir, `chromium-${FREE_BUILD.version}`);
  const binary = { path: join(dir, "chrome"), version: FREE_BUILD.version, source: "free-build" };
  if (existsSync(join(dir, ".complete")) && existsSync(binary.path))
    return binary;
  await mkdir(cacheDir, { recursive: true });
  const work = `${dir}.part`;
  await rm(work, { recursive: true, force: true });
  await mkdir(join(work, "unpacked"), { recursive: true });
  try {
    onProgress({ step: "verifying", received: 0, total: 0 });
    const [manifest, signature] = await Promise.all([
      fetchBytes(`${RELEASES}/${FREE_BUILD.tag}/SHA256SUMS`),
      fetchBytes(`${RELEASES}/${FREE_BUILD.tag}/SHA256SUMS.sig`)
    ]);
    checkSignature(manifest, signature);
    const want = expectedHash(manifest, archive);
    const file = join(work, archive);
    const got = await download(`${RELEASES}/${FREE_BUILD.tag}/${archive}`, file, (received, total) => onProgress({ step: "downloading", received, total }));
    if (got !== want)
      throw new Error(`${archive} does not match its signed checksum.`);
    onProgress({ step: "unpacking", received: 0, total: 0 });
    await untar(file, join(work, "unpacked"));
    await rm(file, { force: true });
    if (!existsSync(join(work, "unpacked", "chrome")))
      throw new Error(`${archive} has no chrome binary.`);
    await writeFile(join(work, "unpacked", ".complete"), `${FREE_BUILD.tag}
${want}
`);
    await rm(dir, { recursive: true, force: true });
    await rename(join(work, "unpacked"), dir);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return binary;
};
var profileSeed = async (file) => {
  try {
    const seed = Number((await readFile(file, "utf8")).trim());
    if (Number.isInteger(seed) && seed >= 1e4 && seed <= 99999)
      return seed;
  } catch {}
  const seed = 1e4 + Math.floor(Math.random() * 90000);
  await writeFile(file, `${seed}
`);
  return seed;
};

// service/cdp.ts
class Cdp {
  socket;
  nextId = 1;
  pending = new Map;
  listeners = new Set;
  closedWith = null;
  closeListeners = new Set;
  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => this.receive(String(event.data)));
    socket.addEventListener("close", () => this.fail(new Error("The browser closed its DevTools connection.")));
    socket.addEventListener("error", () => this.fail(new Error("The browser's DevTools connection failed.")));
  }
  static connect(url, timeoutMs = 1e4) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`No DevTools connection to the browser within ${timeoutMs} ms.`));
      }, timeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve(new Cdp(socket));
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Could not open the browser's DevTools connection."));
      }, { once: true });
    });
  }
  get closed() {
    return this.closedWith !== null;
  }
  send(method, params = {}, sessionId, timeoutMs = 30000) {
    if (this.closedWith)
      return Promise.reject(this.closedWith);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} got no answer within ${timeoutMs} ms.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onClose(listener) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }
  close() {
    this.socket.close();
  }
  receive(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending)
        return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error)
        pending.reject(new Error(`${message.error.message ?? "CDP error"} (${message.error.code ?? "?"})`));
      else
        pending.resolve(message.result ?? {});
      return;
    }
    if (typeof message.method !== "string")
      return;
    const event = { method: message.method, params: message.params ?? {}, sessionId: message.sessionId };
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error("[cloak-browser] a CDP event listener failed:", error);
      }
    }
  }
  fail(error) {
    if (this.closedWith)
      return;
    this.closedWith = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const listener of [...this.closeListeners])
      listener(error);
  }
}

// service/browser.ts
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
var stopLeftover = async (profile) => {
  let owner;
  try {
    owner = await readlink(join2(profile, "SingletonLock"));
  } catch {
    return;
  }
  const pid = Number(owner.slice(owner.lastIndexOf("-") + 1));
  if (!Number.isInteger(pid) || pid <= 1 || !alive(pid))
    return;
  let command = "";
  try {
    command = (await readFile2(`/proc/${pid}/cmdline`)).toString("utf8").replaceAll("\x00", " ");
  } catch {
    return;
  }
  if (!command.includes(`--user-data-dir=${profile}`))
    return;
  process.kill(pid, "SIGKILL");
  for (let wait = 0;wait < 50 && alive(pid); wait += 1)
    await sleep(100);
};

class Browser {
  options;
  phase = "idle";
  error = null;
  progress = null;
  binary = null;
  cdp = null;
  active = null;
  tabs = new Map;
  loading = false;
  canGoBack = false;
  canGoForward = false;
  child = null;
  starting = null;
  scale = 1;
  launchedScale = 0;
  activeListeners = new Set;
  eventListeners = new Set;
  lastUrlWrite = null;
  constructor(options) {
    this.options = options;
    try {
      const saved = JSON.parse(readFileSync(join2(options.dataDir, "viewer.json"), "utf8"));
      if (typeof saved.scale === "number" && saved.scale >= 1 && saved.scale <= 4)
        this.scale = saved.scale;
    } catch {}
  }
  get scaleFactor() {
    return this.scale;
  }
  async setScale(scale) {
    if (scale === this.scale)
      return;
    this.scale = scale;
    await mkdir2(this.options.dataDir, { recursive: true });
    await writeFile2(join2(this.options.dataDir, "viewer.json"), `${JSON.stringify({ scale })}
`).catch(() => {});
    if (this.phase !== "running" || this.launchedScale === scale)
      return;
    await this.saveLastUrl();
    await this.stop();
    this.phase = "idle";
    await this.start().catch(() => {});
  }
  get profile() {
    return join2(this.options.dataDir, "profile");
  }
  onActive(listener) {
    this.activeListeners.add(listener);
    return () => this.activeListeners.delete(listener);
  }
  onCdpEvent(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
  state() {
    const tab = this.active ? this.tabs.get(this.active.targetId) : undefined;
    return {
      phase: this.phase,
      error: this.error,
      progress: this.progress,
      url: tab?.url ?? "",
      title: tab?.title ?? "",
      loading: this.loading,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
      binary: this.binary ? { version: this.binary.version, source: this.binary.source } : null
    };
  }
  async refresh() {
    const { cdp, active } = this;
    if (!cdp || !active)
      return;
    try {
      const back = this.canGoBack;
      const forward = this.canGoForward;
      const [{ targetInfo }] = await Promise.all([
        cdp.send("Target.getTargetInfo", { targetId: active.targetId }, undefined, 2000),
        this.readHistory()
      ]);
      const tab = this.tabs.get(active.targetId);
      if (tab && tab.title === targetInfo.title && tab.url === targetInfo.url && back === this.canGoBack && forward === this.canGoForward)
        return;
      this.tabs.set(active.targetId, { targetId: active.targetId, url: targetInfo.url, title: targetInfo.title, openerId: targetInfo.openerId });
      this.changed();
    } catch {}
  }
  start() {
    if (this.phase === "running" && this.cdp && !this.cdp.closed)
      return Promise.resolve();
    this.starting ??= this.launch().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }
  async stop() {
    this.phase = "idle";
    this.error = null;
    const child = this.child;
    const cdp = this.cdp;
    if (cdp && !cdp.closed) {
      await Promise.race([cdp.send("Browser.close", {}, undefined, 3000).catch(() => {}), sleep(3000)]);
    }
    cdp?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      for (let wait = 0;wait < 30 && child.exitCode === null && child.signalCode === null; wait += 1)
        await sleep(100);
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }
    this.cdp = null;
    this.active = null;
    this.tabs.clear();
    this.changed();
  }
  async navigate(url) {
    const { cdp, active } = await this.ready();
    const answer = await cdp.send("Page.navigate", { url }, active.sessionId, 30000);
    if (answer.errorText && answer.errorText !== "net::ERR_ABORTED")
      throw new Error(`${url}: ${answer.errorText}`);
  }
  async go(direction) {
    const { cdp, active } = await this.ready();
    const history = await cdp.send("Page.getNavigationHistory", {}, active.sessionId);
    const entry = history.entries[history.currentIndex + (direction === "back" ? -1 : 1)];
    if (entry)
      await cdp.send("Page.navigateToHistoryEntry", { entryId: entry.id }, active.sessionId);
  }
  async reload() {
    const { cdp, active } = await this.ready();
    await cdp.send("Page.reload", {}, active.sessionId);
  }
  async stopLoading() {
    const { cdp, active } = await this.ready();
    await cdp.send("Page.stopLoading", {}, active.sessionId);
  }
  async ready() {
    await this.start();
    if (!this.cdp || !this.active)
      throw new Error(this.error ?? "The browser is not running.");
    return { cdp: this.cdp, active: this.active };
  }
  changed() {
    this.options.onChange();
  }
  async launch() {
    this.error = null;
    try {
      this.phase = "preparing";
      this.changed();
      await mkdir2(this.profile, { recursive: true });
      this.binary = await resolveBinary(this.options.cacheDir, (progress) => {
        this.progress = progress;
        this.changed();
      });
      this.progress = null;
      this.phase = "starting";
      this.changed();
      const seed = await profileSeed(join2(this.options.dataDir, "fingerprint-seed"));
      await stopLeftover(this.profile);
      const url = await this.spawnBrowser(this.binary.path, seed);
      const cdp = await Cdp.connect(url);
      this.cdp = cdp;
      cdp.on((event) => {
        this.onEvent(event);
        for (const listener of [...this.eventListeners])
          listener(event);
      });
      cdp.onClose(() => {
        if (this.cdp !== cdp)
          return;
        this.cdp = null;
        this.active = null;
        this.tabs.clear();
        if (this.phase === "running") {
          this.phase = "failed";
          this.error = "The browser stopped.";
        }
        this.changed();
      });
      await cdp.send("Target.setDiscoverTargets", { discover: true });
      const { targetInfos } = await cdp.send("Target.getTargets");
      for (const info of targetInfos)
        if (info.type === "page")
          this.tabs.set(info.targetId, { targetId: info.targetId, url: info.url, title: info.title, openerId: info.openerId });
      const first = targetInfos.find((info) => info.type === "page")?.targetId ?? (await cdp.send("Target.createTarget", { url: "about:blank" })).targetId;
      await this.activate(first);
      this.phase = "running";
      this.changed();
      const last = await this.lastUrl();
      if (this.tabs.get(first)?.url === "about:blank")
        this.navigate(last).catch(() => {});
    } catch (error) {
      this.phase = "failed";
      this.error = error instanceof Error ? error.message : String(error);
      this.progress = null;
      this.changed();
      if (this.child && this.child.exitCode === null)
        this.child.kill("SIGKILL");
      throw error;
    }
  }
  spawnBrowser(binary, seed) {
    const env = { ...process.env };
    delete env.DBUS_SESSION_BUS_ADDRESS;
    for (const key of Object.keys(env))
      if (key.startsWith("OPENCHAMBER_"))
        delete env[key];
    const child = spawn2(binary, [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${this.profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--password-store=basic",
      "--disable-dev-shm-usage",
      "--mute-audio",
      "--window-size=1280,800",
      `--force-device-scale-factor=${this.scale}`,
      "--no-sandbox",
      `--fingerprint=${seed}`,
      "--fingerprint-platform=windows",
      "about:blank"
    ], { stdio: ["ignore", "ignore", "pipe"], env });
    this.child = child;
    this.launchedScale = this.scale;
    child.on("exit", (code, signal) => {
      if (this.child !== child)
        return;
      this.child = null;
      if (this.phase === "running" || this.phase === "starting") {
        this.phase = "failed";
        this.error = `The browser exited (${signal ?? `code ${code}`}).`;
        this.changed();
      }
    });
    return new Promise((resolve, reject) => {
      let stderr = "";
      const timer = setTimeout(() => reject(new Error(`The browser did not start within 30 s. ${stderr.trim().split(`
`).slice(-3).join(" ")}`)), 30000);
      child.stderr?.on("data", (chunk) => {
        stderr = (stderr + chunk.toString("utf8")).slice(-4000);
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code, signal) => {
        clearTimeout(timer);
        reject(new Error(`The browser exited while starting (${signal ?? `code ${code}`}). ${stderr.trim().split(`
`).slice(-3).join(" ")}`));
      });
    });
  }
  async activate(targetId) {
    const cdp = this.cdp;
    if (!cdp)
      return;
    const previous = this.active;
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Page.bringToFront", {}, sessionId).catch(() => {});
    this.active = { targetId, sessionId };
    this.loading = false;
    if (previous && previous.sessionId !== sessionId) {
      cdp.send("Target.detachFromTarget", { sessionId: previous.sessionId }).catch(() => {});
    }
    for (const listener of [...this.activeListeners])
      listener(this.active, previous);
    await this.readHistory();
    this.changed();
  }
  async readHistory() {
    const { cdp, active } = this;
    if (!cdp || !active)
      return;
    try {
      const history = await cdp.send("Page.getNavigationHistory", {}, active.sessionId);
      this.canGoBack = history.currentIndex > 0;
      this.canGoForward = history.currentIndex < history.entries.length - 1;
    } catch {}
  }
  onEvent(event) {
    if (!event.sessionId) {
      this.onBrowserEvent(event);
      return;
    }
    if (event.sessionId !== this.active?.sessionId)
      return;
    const frame = event.params.frame ?? {};
    switch (event.method) {
      case "Page.frameStartedLoading":
      case "Page.frameStoppedLoading":
      case "Page.loadEventFired": {
        const loading = event.method === "Page.frameStartedLoading";
        if (loading !== this.loading) {
          this.loading = loading;
          this.changed();
        }
        if (!loading)
          this.refresh();
        break;
      }
      case "Page.domContentEventFired":
        this.refresh();
        break;
      case "Page.frameNavigated":
      case "Page.navigatedWithinDocument":
        if (event.method === "Page.frameNavigated" && frame.parentId)
          break;
        this.readHistory().then(() => this.changed());
        this.refresh();
        this.rememberUrl();
        break;
      default:
        break;
    }
  }
  onBrowserEvent(event) {
    const info = event.params.targetInfo;
    switch (event.method) {
      case "Target.targetCreated": {
        if (!info || info.type !== "page")
          return;
        this.tabs.set(info.targetId, { targetId: info.targetId, url: info.url, title: info.title, openerId: info.openerId });
        if (info.openerId && this.active)
          this.activate(info.targetId).catch(() => {});
        this.changed();
        return;
      }
      case "Target.targetInfoChanged": {
        if (!info || info.type !== "page")
          return;
        this.tabs.set(info.targetId, { targetId: info.targetId, url: info.url, title: info.title, openerId: info.openerId });
        if (info.targetId === this.active?.targetId)
          this.changed();
        return;
      }
      case "Target.targetDestroyed": {
        const targetId = event.params.targetId;
        this.tabs.delete(targetId);
        if (targetId === this.active?.targetId) {
          this.active = null;
          const next = [...this.tabs.keys()].at(-1);
          (next ? this.activate(next) : this.cdp?.send("Target.createTarget", { url: "about:blank" }).then(({ targetId: created }) => this.activate(created)))?.catch(() => {});
        }
        this.changed();
        return;
      }
      default:
        return;
    }
  }
  async lastUrl() {
    try {
      const saved = JSON.parse(await readFile2(join2(this.options.dataDir, "last.json"), "utf8"));
      if (typeof saved.url === "string" && /^https?:\/\//.test(saved.url))
        return saved.url;
    } catch {}
    return this.options.startUrl;
  }
  rememberUrl() {
    if (this.lastUrlWrite)
      clearTimeout(this.lastUrlWrite);
    this.lastUrlWrite = setTimeout(() => {
      this.lastUrlWrite = null;
      this.saveLastUrl();
    }, 1000);
  }
  async saveLastUrl() {
    const url = this.state().url;
    if (!/^https?:\/\//.test(url))
      return;
    await writeFile2(join2(this.options.dataDir, "last.json"), `${JSON.stringify({ url })}
`).catch(() => {});
  }
  get running() {
    return this.phase === "running" && this.cdp !== null && existsSync2(this.profile);
  }
}

// service/surface.ts
import { deflateSync } from "node:zlib";
var QUALITY = 80;
var FRAME_WAIT_MAX_MS = 25000;
var MIN_WIDTH = 200;
var MIN_HEIGHT = 150;
var MAX_WIDTH = 3840;
var MAX_HEIGHT = 2400;
var MULTI_CLICK_MS = 500;
var MULTI_CLICK_PX = 5;
var clamp = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));
var jpegSize = (bytes) => {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 255)
      return null;
    const marker = bytes[at + 1];
    if (marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
};
var CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0;k < 8; k += 1)
    c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  return c >>> 0;
});
var crc32 = (bytes) => {
  let crc = 4294967295;
  for (const byte of bytes)
    crc = CRC_TABLE[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
};
var pngChunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), body.length + 4);
  return chunk;
};
var blankPicture = (width, height) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.alloc((width * 4 + 1) * height))),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
};
var ascii = (text) => text.replace(/[^\x20-\x7e]+/g, " ").replace(/\s+/g, " ").trim();
var headerTitle = (title, url) => {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean && /^[\x20-\x7e]+$/.test(clean))
    return clean.slice(0, SURFACE_TITLE_MAX);
  try {
    const host = new URL(url).hostname;
    if (host)
      return host.slice(0, SURFACE_TITLE_MAX);
  } catch {}
  return "Cloak Browser";
};
var MOUSE_BUTTONS = ["left", "middle", "right", "back", "forward"];
var heldButton = (buttons) => {
  if (buttons & 1)
    return "left";
  if (buttons & 2)
    return "right";
  if (buttons & 4)
    return "middle";
  if (buttons & 8)
    return "back";
  if (buttons & 16)
    return "forward";
  return "none";
};
var KEY_CODES = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Shift: 16,
  Control: 17,
  Alt: 18,
  Pause: 19,
  CapsLock: 20,
  Escape: 27,
  " ": 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Insert: 45,
  Delete: 46,
  Meta: 91,
  ContextMenu: 93
};
var keyCodeOf = (key, code, given) => {
  if (given !== undefined && given > 0)
    return given;
  if (KEY_CODES[key] !== undefined)
    return KEY_CODES[key];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key))
    return 111 + Number(key.slice(1));
  if (/^Key[A-Z]$/.test(code))
    return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code))
    return code.charCodeAt(5);
  if (key.length === 1)
    return key.toUpperCase().charCodeAt(0);
  return 0;
};
var locationOf = (code) => {
  if (code.startsWith("Numpad"))
    return 3;
  if (/Left$/.test(code) && /^(Shift|Control|Alt|Meta)/.test(code))
    return 1;
  if (/Right$/.test(code) && /^(Shift|Control|Alt|Meta)/.test(code))
    return 2;
  return 0;
};
var COMMANDS = { a: "selectAll", c: "copy", x: "cut", v: "paste", z: "undo", y: "redo" };
var SELECTION_SCRIPT = `(() => {
  const field = document.activeElement;
  if (field && (field.tagName === 'TEXTAREA' || (field.tagName === 'INPUT' && /^(text|search|url|tel|email|password|number)$/i.test(field.type)))) {
    try { return field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0); } catch { return ''; }
  }
  return String(getSelection() ?? '');
})()`;

class Surface {
  browser;
  seq = 1;
  controller = "none";
  deviceWidth = 1280;
  deviceHeight = 800;
  dpr = 1;
  mac = false;
  cssWidth = 1280;
  cssHeight = 800;
  frame = null;
  placeholder = null;
  waiters = new Set;
  castSession = null;
  casting = Promise.resolve();
  lastPress = { at: 0, x: 0, y: 0, button: "none", count: 0 };
  shownTitle = "";
  titleReadAt = 0;
  constructor(browser) {
    this.browser = browser;
    this.dpr = browser.scaleFactor;
    browser.onActive((active) => this.recast(active));
    browser.onCdpEvent((event) => this.onCdpEvent(event));
  }
  browserChanged() {
    if (this.browser.phase !== "running") {
      this.frame = null;
      this.castSession = null;
    }
    const title = this.title();
    if (title !== this.shownTitle && (!this.frame || this.browser.phase !== "running"))
      this.bump();
  }
  resize(width, height) {
    const next = { width: clamp(width, MIN_WIDTH, MAX_WIDTH), height: clamp(height, MIN_HEIGHT, MAX_HEIGHT) };
    if (next.width !== this.deviceWidth || next.height !== this.deviceHeight) {
      this.deviceWidth = next.width;
      this.deviceHeight = next.height;
      this.placeholder = null;
      if (this.browser.active)
        this.recast(this.browser.active);
      else
        this.bump();
    }
    return next;
  }
  viewer(dpr, mac) {
    const ratio = Math.max(1, Math.min(4, Math.round(dpr * 4) / 4));
    const changed = ratio !== this.dpr;
    this.dpr = ratio;
    this.mac = mac;
    this.browser.setScale(ratio);
    if (changed && this.browser.active)
      this.recast(this.browser.active);
  }
  async frameAfter(after, waitMs) {
    this.browser.start().catch(() => {});
    const wait = clamp(waitMs, 0, FRAME_WAIT_MAX_MS);
    if (this.seq <= after && wait > 0)
      await this.next(wait);
    if (this.seq <= after)
      return null;
    const title = this.title();
    this.shownTitle = title;
    return { frame: this.current(), seq: this.seq, title };
  }
  async input(events) {
    const { cdp, active } = await this.browser.ready();
    for (const event of events)
      await this.dispatch(cdp, active.sessionId, event);
  }
  async clipboard() {
    const { cdp, active } = await this.browser.ready();
    const answer = await cdp.send("Runtime.evaluate", { expression: SELECTION_SCRIPT, returnByValue: true }, active.sessionId);
    return typeof answer.result?.value === "string" ? answer.result.value : "";
  }
  current() {
    if (this.frame && this.browser.phase === "running")
      return this.frame;
    this.placeholder ??= { bytes: blankPicture(this.deviceWidth, this.deviceHeight), width: this.deviceWidth, height: this.deviceHeight, mime: "image/png" };
    return this.placeholder;
  }
  title() {
    const state = this.browser.state();
    switch (state.phase) {
      case "running":
        return this.frame ? headerTitle(state.title, state.url) : "Cloak Browser: loading";
      case "preparing": {
        const progress = state.progress;
        if (progress?.step === "downloading") {
          const percent = progress.total ? ` ${Math.floor(progress.received / progress.total * 100)}%` : "";
          return `Cloak Browser: downloading CloakBrowser${percent}`;
        }
        if (progress?.step === "verifying")
          return "Cloak Browser: checking the download";
        if (progress?.step === "unpacking")
          return "Cloak Browser: unpacking CloakBrowser";
        return "Cloak Browser: preparing";
      }
      case "starting":
        return "Cloak Browser: starting";
      case "failed":
        return `Cloak Browser: ${ascii(state.error ?? "failed")}`.slice(0, SURFACE_TITLE_MAX);
      default:
        return "Cloak Browser";
    }
  }
  bump() {
    this.seq += 1;
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const wake of waiters)
      wake();
  }
  next(ms) {
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      this.waiters.add(wake);
    });
  }
  onCdpEvent(event) {
    if (event.method !== "Page.screencastFrame" || !event.sessionId || event.sessionId !== this.castSession)
      return;
    const params = event.params;
    this.browser.cdp?.send("Page.screencastFrameAck", { sessionId: params.sessionId }, event.sessionId).catch(() => {});
    const bytes = Buffer.from(params.data, "base64");
    const size = jpegSize(bytes);
    if (!size)
      return;
    this.frame = { bytes, mime: "image/jpeg", ...size };
    const now = Date.now();
    if (now - this.titleReadAt > 1000) {
      this.titleReadAt = now;
      this.browser.refresh();
    }
    this.bump();
  }
  recast(active) {
    this.casting = this.casting.then(() => this.cast(active)).catch((error) => {
      console.error("[cloak-browser] could not show the tab:", error);
    });
  }
  async cast(active) {
    const cdp = this.browser.cdp;
    if (!cdp || this.browser.active?.sessionId !== active.sessionId)
      return;
    if (this.castSession && this.castSession !== active.sessionId) {
      cdp.send("Page.stopScreencast", {}, this.castSession).catch(() => {});
    }
    this.cssWidth = Math.max(100, Math.round(this.deviceWidth / this.dpr));
    this.cssHeight = Math.max(100, Math.round(this.deviceHeight / this.dpr));
    try {
      const { windowId } = await cdp.send("Browser.getWindowForTarget", { targetId: active.targetId });
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: this.cssWidth, height: this.cssHeight } });
    } catch {}
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: this.cssWidth, height: this.cssHeight, deviceScaleFactor: this.dpr, mobile: false }, active.sessionId);
    await cdp.send("Page.stopScreencast", {}, active.sessionId).catch(() => {});
    this.castSession = active.sessionId;
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: QUALITY, maxWidth: this.deviceWidth, maxHeight: this.deviceHeight, everyNthFrame: 1 }, active.sessionId);
    const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: QUALITY }, active.sessionId).catch(() => null);
    if (shot && this.castSession === active.sessionId) {
      const bytes = Buffer.from(shot.data, "base64");
      const size = jpegSize(bytes);
      if (size) {
        this.frame = { bytes, mime: "image/jpeg", ...size };
        this.bump();
      }
    }
  }
  modifiers(modifiers) {
    return (modifiers.alt ? 1 : 0) | (modifiers.ctrl || this.mac && modifiers.meta ? 2 : 0) | (!this.mac && modifiers.meta ? 4 : 0) | (modifiers.shift ? 8 : 0);
  }
  async dispatch(cdp, sessionId, event) {
    switch (event.type) {
      case "pointer":
        return this.pointer(cdp, sessionId, event);
      case "wheel": {
        const { x, y } = this.toPage(event.x, event.y);
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: event.deltaX, deltaY: event.deltaY, modifiers: this.modifiers(event.modifiers) }, sessionId);
        return;
      }
      case "key":
        return this.key(cdp, sessionId, event);
      case "text":
        await cdp.send("Input.insertText", { text: event.text }, sessionId);
        return;
      default:
        return;
    }
  }
  toPage(x, y) {
    const width = this.frame?.width ?? this.deviceWidth;
    const height = this.frame?.height ?? this.deviceHeight;
    return { x: x * this.cssWidth / width, y: y * this.cssHeight / height };
  }
  async pointer(cdp, sessionId, event) {
    const { x, y } = this.toPage(event.x, event.y);
    const modifiers = this.modifiers(event.modifiers);
    if (event.action === "move") {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: heldButton(event.buttons), buttons: event.buttons, modifiers }, sessionId);
      return;
    }
    const button = MOUSE_BUTTONS[event.button] ?? "none";
    if (event.action === "down") {
      const now = Date.now();
      const last = this.lastPress;
      const again = now - last.at < MULTI_CLICK_MS && last.button === button && Math.abs(last.x - x) < MULTI_CLICK_PX && Math.abs(last.y - y) < MULTI_CLICK_PX;
      this.lastPress = { at: now, x, y, button, count: again ? last.count + 1 : 1 };
    }
    await cdp.send("Input.dispatchMouseEvent", {
      type: event.action === "down" ? "mousePressed" : "mouseReleased",
      x,
      y,
      button,
      buttons: event.buttons,
      clickCount: this.lastPress.count,
      modifiers
    }, sessionId);
  }
  async key(cdp, sessionId, event) {
    if (event.key === "Process" || event.key === "Dead" || event.key === "Unidentified")
      return;
    let { key, code } = event;
    let modifiers = this.modifiers(event.modifiers);
    if (this.mac && /^Arrow(Left|Right|Up|Down)$/.test(key)) {
      if (event.modifiers.meta && (key === "ArrowLeft" || key === "ArrowRight")) {
        key = key === "ArrowLeft" ? "Home" : "End";
        code = key;
        modifiers &= ~2;
      } else if (event.modifiers.meta) {
        key = key === "ArrowUp" ? "Home" : "End";
        code = key;
      } else if (event.modifiers.alt && (key === "ArrowLeft" || key === "ArrowRight")) {
        modifiers = modifiers & ~1 | 2;
      }
    }
    if (this.mac && key === "Backspace" && event.modifiers.alt)
      modifiers = modifiers & ~1 | 2;
    const windowsVirtualKeyCode = keyCodeOf(key, code, key === event.key ? event.keyCode : undefined);
    const location = locationOf(code);
    if (event.action === "up") {
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, modifiers, location }, sessionId);
      return;
    }
    const control = (modifiers & 2) !== 0;
    const text = control ? undefined : key === "Enter" ? "\r" : key.length === 1 ? key : undefined;
    const command = control && key.length === 1 ? COMMANDS[key.toLowerCase()] : undefined;
    const commands = command === "undo" && modifiers & 8 ? ["redo"] : command ? [command] : undefined;
    await cdp.send("Input.dispatchKeyEvent", {
      type: text ? "keyDown" : "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode,
      modifiers,
      location,
      ...text ? { text, unmodifiedText: text } : {},
      ...commands ? { commands } : {}
    }, sessionId);
  }
}

// service/main.ts
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
if (!port || !token) {
  console.error("OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required");
  process.exit(1);
}
var home = homedir();
var browser = new Browser({
  dataDir: process.env.OC_CLOAK_DATA_DIR ?? join3(process.env.XDG_DATA_HOME ?? join3(home, ".local/share"), "oc-forge-cloak-browser"),
  cacheDir: process.env.OC_CLOAK_CACHE_DIR ?? join3(process.env.XDG_CACHE_HOME ?? join3(home, ".cache"), "oc-forge-cloak-browser"),
  startUrl: process.env.OC_CLOAK_START_URL ?? "https://www.google.com/",
  onChange: () => surface.browserChanged()
});
var surface = new Surface(browser);
var toUrl = (input) => {
  const text = input.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^/:]+:\d+(\/|$)/.test(text))
    return text;
  if (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/|$)/i.test(text))
    return `http://${text}`;
  if (!/\s/.test(text) && /^[^/?#]+\.[a-z]{2,}(:\d+)?([/?#]|$)/i.test(text))
    return `https://${text}`;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
};
var readBody = (req) => new Promise((resolve, reject) => {
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => resolve(body));
  req.on("error", reject);
});
var readJson = async (req) => {
  try {
    const value = JSON.parse(await readBody(req));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};
var send = (res, status, body) => {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
var command = async (res, run) => {
  try {
    await run();
    send(res, 200, { ok: true });
  } catch (error) {
    send(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
var route = async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  switch (`${req.method} ${url.pathname}`) {
    case "GET /health":
      return send(res, 200, { ok: true });
    case "GET /state":
      browser.start().catch(() => {});
      await browser.refresh();
      return send(res, 200, browser.state());
    case "POST /navigate": {
      const body = await readJson(req);
      const address = typeof body?.url === "string" ? body.url.trim() : "";
      if (!address)
        return send(res, 400, { ok: false, error: "url is required" });
      return command(res, () => browser.navigate(toUrl(address)));
    }
    case "POST /history": {
      const body = await readJson(req);
      const direction = body?.direction === "forward" ? "forward" : "back";
      return command(res, () => browser.go(direction));
    }
    case "POST /reload":
      return command(res, () => browser.reload());
    case "POST /stop":
      return command(res, () => browser.stopLoading());
    case "POST /viewer": {
      const body = await readJson(req);
      const dpr = typeof body?.dpr === "number" && Number.isFinite(body.dpr) ? body.dpr : 1;
      surface.viewer(dpr, body?.mac === true);
      return send(res, 200, { ok: true });
    }
    case `GET ${SURFACE_FRAME_PATH}`: {
      const answer = await surface.frameAfter(Number(url.searchParams.get("after")) || 0, Number(url.searchParams.get("wait")) || 0);
      if (!answer)
        return send(res, 204);
      res.writeHead(200, {
        "Content-Type": answer.frame.mime,
        "Content-Length": answer.frame.bytes.length,
        [SURFACE_SEQ_HEADER]: String(answer.seq),
        [SURFACE_WIDTH_HEADER]: String(answer.frame.width),
        [SURFACE_HEIGHT_HEADER]: String(answer.frame.height),
        [SURFACE_TITLE_HEADER]: answer.title
      });
      res.end(answer.frame.bytes);
      return;
    }
    case `POST ${SURFACE_INPUT_PATH}`: {
      const batch = readSurfaceInputBatch(await readBody(req));
      if (!batch)
        return send(res, 400);
      try {
        await surface.input(batch.events);
        return send(res, 204);
      } catch (error) {
        return send(res, 503, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    case `POST ${SURFACE_CONTROL_PATH}`: {
      const notice = readSurfaceControlNotice(await readBody(req));
      if (!notice)
        return send(res, 400);
      surface.controller = notice.controller;
      return send(res, 204);
    }
    case `POST ${SURFACE_RESIZE_PATH}`: {
      const request = readSurfaceResizeRequest(await readBody(req));
      if (!request)
        return send(res, 400);
      return send(res, 200, surface.resize(request.width, request.height));
    }
    case `GET ${SURFACE_CLIPBOARD_PATH}`:
      return send(res, 200, { text: await surface.clipboard().catch(() => "") });
    default:
      return send(res, 404, { ok: false, error: "not-found" });
  }
};
var server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    send(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  route(req, res).catch((error) => {
    console.error(error);
    if (res.headersSent)
      res.destroy();
    else
      send(res, 500, { ok: false, error: "internal" });
  });
});
server.listen(port, "127.0.0.1");
var stopping = false;
var shutdown = () => {
  if (stopping)
    return;
  stopping = true;
  server.close();
  browser.stop().finally(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
