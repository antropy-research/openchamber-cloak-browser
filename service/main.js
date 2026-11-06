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
var BROWSER_PROVIDER_PATH = "/browser-control";
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
var isBrowserControlAction = (value) => CONTROL_ACTIONS.has(value);
var readContext = (wire) => {
  const directory = wire?.directory;
  const sessionId = wire?.sessionId;
  return {
    directory: String(directory) === directory && directory.length > 0 ? directory : null,
    sessionId: String(sessionId) === sessionId && sessionId.length > 0 ? sessionId : null
  };
};
var readBrowserProviderRequest = (body) => {
  let wire;
  try {
    const parsed = JSON.parse(body);
    if (Object(parsed) !== parsed || parsed === null)
      return null;
    wire = parsed;
  } catch {
    return null;
  }
  const { requestId, action, parameters, context } = wire;
  if (String(requestId) !== requestId || requestId.length === 0)
    return null;
  if (String(action) !== action || !isBrowserControlAction(action))
    return null;
  if (Object(parameters) !== parameters)
    return null;
  return { requestId, action, parameters, context: readContext(context) };
};
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
var SURFACE_AGENT_ACTIVE_HEADER = "x-surface-agent-active";
var SURFACE_VIEWER_CONTROLS_HEADER = "x-surface-viewer-controls";
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
// service/address.ts
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

// service/page-scripts.ts
var MAX_TEXT_CHARS = 6000;
var MAX_ELEMENTS = 120;
var MAX_LABEL_CHARS = 80;
var MAX_OPTION_COUNT = 32;
var SCROLL_SETTLE_MAX_MS = 100;
var HELPERS = `
  var MAX_ELEMENTS = ${MAX_ELEMENTS};
  var MAX_LABEL_CHARS = ${MAX_LABEL_CHARS};
  var MAX_OPTION_COUNT = ${MAX_OPTION_COUNT};
  var visible = function (element) {
    var rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    var style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
  };
  var label = function (element) {
    var aria = element.getAttribute('aria-label');
    if (aria) return aria.trim();
    var value = element.getAttribute('value');
    var text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) return text.slice(0, MAX_LABEL_CHARS);
    if (value) return String(value).slice(0, MAX_LABEL_CHARS);
    var placeholder = element.getAttribute('placeholder');
    return placeholder ? placeholder.trim().slice(0, MAX_LABEL_CHARS) : '';
  };
  var boundedText = function (value) {
    var text = String(value);
    if (text.length <= MAX_LABEL_CHARS) return { value: text, truncated: false };
    var end = MAX_LABEL_CHARS;
    var last = text.charCodeAt(end - 1);
    if (last >= 0xD800 && last <= 0xDBFF) end -= 1;
    return { value: text.slice(0, end), truncated: true };
  };
  var selectOptionLabel = function (option) {
    var explicit = option.getAttribute('label');
    if (explicit !== null) return explicit;
    return String(option.textContent || '').replace(/\\s+/g, ' ').trim();
  };
  var isOptionDisabled = function (element) {
    if (element.disabled === true) return true;
    if (typeof element.matches === 'function' && element.matches(':disabled')) return true;
    var parent = element.parentElement;
    while (parent) {
      if (parent.tagName === 'OPTGROUP' && parent.disabled === true) return true;
      parent = parent.parentElement;
    }
    return false;
  };
  var isUnique = function (selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (error) {
      return false;
    }
  };
  var cssPath = function (element) {
    var tag = element.tagName.toLowerCase();
    if (element.id) {
      var byId = '#' + CSS.escape(element.id);
      if (isUnique(byId)) return byId;
    }
    var stableAttrs = ['data-testid', 'data-test-id', 'data-test', 'name', 'aria-label'];
    for (var a = 0; a < stableAttrs.length; a += 1) {
      var value = element.getAttribute(stableAttrs[a]);
      if (!value) continue;
      var raw = String(value);
      if (raw.indexOf('"') !== -1) continue;
      var byAttr = tag + '[' + stableAttrs[a] + '="' + raw + '"]';
      if (isUnique(byAttr)) return byAttr;
    }
    var className = typeof element.className === 'string' ? element.className.trim() : '';
    if (className) {
      var classes = className.split(/\\s+/).filter(Boolean);
      for (var c = 0; c < classes.length; c += 1) {
        var byClass = tag + '.' + CSS.escape(classes[c]);
        if (isUnique(byClass)) return byClass;
      }
    }
    var parts = [];
    var node = element;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      var part = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (!parent) { parts.unshift(part); break; }
      var siblings = Array.prototype.filter.call(parent.children, function (child) {
        return child.tagName === node.tagName;
      });
      if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      parts.unshift(part);
      if (node.id) { parts[0] = '#' + CSS.escape(node.id); break; }
      node = parent;
      depth += 1;
    }
    return parts.join(' > ');
  };
  var accessibleName = function (element) {
    var aria = element.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    var labelled = element.getAttribute('aria-labelledby');
    if (labelled) {
      var source = document.getElementById(labelled.split(/\\s+/)[0]);
      if (source && (source.innerText || '').trim()) return source.innerText.trim();
    }
    var title = element.getAttribute('title');
    if (title && title.trim()) return title.trim();
    var alt = element.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();
    var text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) return text;
    var value = element.getAttribute('value');
    return value && String(value).trim() ? String(value).trim() : '';
  };
  var findByText = function (needle) {
    var wanted = String(needle).replace(/\\s+/g, ' ').trim().toLowerCase();
    var candidates = document.querySelectorAll('a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], summary, label');
    var exact = null;
    var partial = null;
    for (var i = 0; i < candidates.length; i += 1) {
      var element = candidates[i];
      if (!visible(element)) continue;
      var text = label(element).toLowerCase();
      if (!text) continue;
      if (text === wanted) { exact = element; break; }
      if (!partial && text.indexOf(wanted) !== -1) partial = element;
    }
    return exact || partial;
  };
`;
var wrap = (body) => `(() => {
${HELPERS}
${body}
})()`;
var snapshotScript = ({ selector } = {}) => wrap(`
  var scopeSelector = ${JSON.stringify(selector ?? "")};
  var root = document;
  if (scopeSelector) {
    try { root = document.querySelector(scopeSelector); }
    catch (error) { return { ok: false, error: 'Invalid selector: ' + scopeSelector }; }
    if (!root) return { ok: false, error: 'No element matches ' + scopeSelector };
  }
  var interactive = root.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]');
  var elements = [];
  var visibleTotal = 0;
  for (var i = 0; i < interactive.length; i += 1) {
    var element = interactive[i];
    if (!visible(element)) continue;
    visibleTotal += 1;
    if (elements.length >= MAX_ELEMENTS) continue;
    var rect = element.getBoundingClientRect();
    var entry = {
      selector: cssPath(element),
      tag: element.tagName.toLowerCase(),
      bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    };
    if (rect.bottom > 0 && rect.top < window.innerHeight) entry.inViewport = true;
    var type = element.getAttribute('type');
    if (type) entry.type = type;
    var role = element.getAttribute('role');
    if (role) entry.role = role;
    var labelText = label(element);
    if (labelText) entry.label = labelText;
    if (element.disabled === true) entry.disabled = true;
    if (element.tagName === 'SELECT') {
      entry.multiple = element.multiple === true;
      entry.options = [];
      var optionList = element.options;
      for (var optionIndex = 0; optionIndex < optionList.length && optionIndex < MAX_OPTION_COUNT; optionIndex += 1) {
        var option = optionList[optionIndex];
        var optionLabelText = boundedText(selectOptionLabel(option));
        var optionValueText = boundedText(option.value);
        if (optionLabelText.truncated || optionValueText.truncated) entry.optionsTruncated = true;
        entry.options.push({
          label: optionLabelText.value,
          value: optionValueText.value,
          selected: option.selected === true,
          disabled: isOptionDisabled(option)
        });
      }
      if (optionList.length > MAX_OPTION_COUNT) entry.optionsTruncated = true;
    }
    if (!accessibleName(element)) entry.missingAccessibleName = true;
    elements.push(entry);
  }
  var textRoot = root === document ? document.body : root;
  var body = textRoot ? (textRoot.innerText || '') : '';
  var text = body.replace(/\\n{3,}/g, '\\n\\n').trim();
  var docEl = document.documentElement;
  var result = {
    ok: true,
    url: String(location.href),
    title: String(document.title || ''),
    scope: scopeSelector || 'document',
    scrollY: Math.round(window.scrollY),
    maxScrollY: Math.max(0, Math.round(docEl.scrollHeight - window.innerHeight)),
    text: text.slice(0, ${MAX_TEXT_CHARS}),
    elements: elements
  };
  if (text.length > ${MAX_TEXT_CHARS}) {
    result.textTruncated = true;
    result.textTotalChars = text.length;
  }
  if (visibleTotal > elements.length) {
    result.elementsTruncated = true;
    result.interactiveElementsOnPage = visibleTotal;
  }
  return result;
`);
var locateScript = ({ selector, text }) => wrap(`
  var selector = ${JSON.stringify(selector ?? "")};
  var text = ${JSON.stringify(text ?? "")};
  var target = null;
  if (selector) {
    try { target = document.querySelector(selector); }
    catch (error) { return { ok: false, error: 'Invalid selector: ' + selector }; }
    if (!target) return { ok: false, error: 'No element matches ' + selector };
  } else {
    target = findByText(text);
    if (!target) return { ok: false, error: 'No clickable element has the label ' + text };
  }
  if (target.disabled === true) return { ok: false, error: 'Element is disabled' };
  target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  var rect = target.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return { ok: false, error: (selector || text) + ' is not visible' };
  return { ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, clicked: cssPath(target), label: label(target), url: String(location.href) };
`);
var focusFieldScript = ({ selector }) => wrap(`
  var selector = ${JSON.stringify(selector)};
  var target = null;
  try { target = document.querySelector(selector); }
  catch (error) { return { ok: false, error: 'Invalid selector: ' + selector }; }
  if (!target) return { ok: false, error: 'No element matches ' + selector };
  var editable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
  if (!editable) return { ok: false, error: selector + ' is not a text field' };
  if (target.disabled === true || target.readOnly === true) return { ok: false, error: 'Field is not editable' };
  target.scrollIntoView({ block: 'center', behavior: 'instant' });
  target.focus();
  if (document.activeElement !== target && !target.contains(document.activeElement)) return { ok: false, error: selector + ' did not take the focus' };
  if (target.isContentEditable) {
    var range = document.createRange();
    range.selectNodeContents(target);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    try { target.select(); } catch (error) { document.execCommand('selectAll'); }
  }
  var empty = target.isContentEditable ? !(target.textContent || '').length : !String(target.value || '').length;
  return { ok: true, selector: cssPath(target), empty: empty };
`);
var selectScript = ({ selector, label: optionLabel, value }) => {
  const hasLabel = optionLabel !== undefined;
  const hasValue = value !== undefined;
  const criterion = hasLabel === hasValue ? "" : hasLabel ? "label" : "value";
  return wrap(`
  var selector = ${JSON.stringify(selector)};
  var criterion = ${JSON.stringify(criterion)};
  var wanted = ${JSON.stringify(hasLabel ? optionLabel : value)};
  if (!criterion) return { ok: false, error: 'browser.select requires exactly one of label or value' };
  var target = null;
  try { target = document.querySelector(selector); }
  catch (error) { return { ok: false, error: 'Invalid selector: ' + selector }; }
  if (!target) return { ok: false, error: 'No element matches ' + selector };
  if (!(target instanceof window.HTMLSelectElement)) return { ok: false, error: selector + ' is not a native HTML select' };
  if (isOptionDisabled(target)) return { ok: false, error: 'The select ' + selector + ' is disabled' };
  if (target.multiple) return { ok: false, error: 'Multiple selects are not supported for browser.select' };
  var matches = [];
  for (var i = 0; i < target.options.length; i += 1) {
    var option = target.options[i];
    var candidate = criterion === 'label' ? selectOptionLabel(option) : String(option.value);
    if (candidate === wanted) matches.push(option);
  }
  if (matches.length === 0) return { ok: false, error: 'No option in ' + selector + ' has the exact ' + criterion + ' ' + wanted };
  if (matches.length > 1) return { ok: false, error: 'More than one option in ' + selector + ' has the exact ' + criterion + ' ' + wanted };
  var match = matches[0];
  if (isOptionDisabled(match)) return { ok: false, error: 'The matching option in ' + selector + ' is disabled' };
  target.scrollIntoView({ block: 'center', behavior: 'instant' });
  for (var j = 0; j < target.options.length; j += 1) target.options[j].selected = target.options[j] === match;
  var selected = target.selectedOptions;
  if (selected.length !== 1 || selected[0] !== match || target.value !== match.value) {
    return { ok: false, error: 'The option in ' + selector + ' could not be selected' };
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, selector: cssPath(target), label: selectOptionLabel(match), value: String(target.value), url: String(location.href) };
`);
};
var scrollScript = ({ selector, direction }) => wrap(`
  var selector = ${JSON.stringify(selector ?? "")};
  var direction = ${JSON.stringify(direction ?? "")};
  var settle = function (extra) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        var doc = document.documentElement;
        var maxScrollY = Math.max(0, doc.scrollHeight - window.innerHeight);
        var scrollY = Math.round(window.scrollY);
        var result = { ok: true, scrollY: scrollY, maxScrollY: Math.round(maxScrollY) };
        result.atTop = scrollY <= 1;
        result.atBottom = scrollY >= maxScrollY - 1;
        for (var key in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, key)) result[key] = extra[key];
        }
        resolve(result);
      };
      requestAnimationFrame(function () {
        requestAnimationFrame(finish);
      });
      setTimeout(finish, ${SCROLL_SETTLE_MAX_MS});
    });
  };
  if (selector) {
    var target = null;
    try { target = document.querySelector(selector); }
    catch (error) { return { ok: false, error: 'Invalid selector: ' + selector }; }
    if (!target) return { ok: false, error: 'No element matches ' + selector };
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    return settle({ scrolledTo: cssPath(target) });
  }
  var doc = document.documentElement;
  var page = Math.round(window.innerHeight * 0.85);
  var bottom = Math.max(0, doc.scrollHeight - window.innerHeight);
  if (direction === 'down') window.scrollTo({ top: window.scrollY + page, behavior: 'instant' });
  else if (direction === 'up') window.scrollTo({ top: window.scrollY - page, behavior: 'instant' });
  else if (direction === 'top') window.scrollTo({ top: 0, behavior: 'instant' });
  else if (direction === 'bottom') window.scrollTo({ top: bottom, behavior: 'instant' });
  else return { ok: false, error: 'Unknown scroll direction: ' + direction };
  return settle({ direction: direction });
`);
var quietScript = ({ quietMs, maxMs }) => wrap(`
  var quietMs = ${JSON.stringify(quietMs)};
  var maxMs = ${JSON.stringify(maxMs)};
  return new Promise(function (resolve) {
    var startedAt = performance.now();
    var lastChange = startedAt;
    var bump = function () { lastChange = performance.now(); };
    var mutations = new MutationObserver(bump);
    mutations.observe(document, { subtree: true, childList: true, characterData: true });
    var resources = null;
    try {
      resources = new PerformanceObserver(bump);
      resources.observe({ type: 'resource' });
    } catch (error) {
      resources = null;
    }
    var animating = function () {
      try {
        if (typeof document.getAnimations !== 'function') return false;
        var list = document.getAnimations();
        for (var i = 0; i < list.length; i += 1) {
          var animation = list[i];
          if (animation.playState !== 'running' && !animation.pending) continue;
          if (animation.timeline && animation.timeline !== document.timeline) continue;
          var timing = animation.effect && animation.effect.getTiming ? animation.effect.getTiming() : null;
          if (timing && timing.iterations === Infinity) continue;
          return true;
        }
      } catch (error) {
        return false;
      }
      return false;
    };
    var check = function () {
      var now = performance.now();
      if (animating()) lastChange = now;
      var quiet = now - lastChange >= quietMs;
      if (quiet || now - startedAt >= maxMs) {
        mutations.disconnect();
        if (resources) resources.disconnect();
        resolve({ ok: true, quiet: quiet });
        return;
      }
      setTimeout(check, Math.max(16, Math.min(quietMs - (now - lastChange), maxMs - (now - startedAt))));
    };
    setTimeout(check, quietMs);
  });
`);
var INSPECTED_STYLE_PROPS = [
  "color",
  "background-color",
  "background-image",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "border-radius",
  "border-width",
  "border-style",
  "border-color",
  "box-shadow",
  "display",
  "position",
  "width",
  "height",
  "padding",
  "margin",
  "gap",
  "flex-direction",
  "justify-content",
  "align-items",
  "z-index",
  "overflow",
  "visibility"
];
var inspectScript = ({ selector }) => wrap(`
  var selector = ${JSON.stringify(selector)};
  var target = null;
  try { target = document.querySelector(selector); }
  catch (error) { return { ok: false, error: 'Invalid selector: ' + selector }; }
  if (!target) return { ok: false, error: 'No element matches ' + selector };
  var computed = window.getComputedStyle(target);
  var styles = {};
  var props = ${JSON.stringify(INSPECTED_STYLE_PROPS)};
  for (var i = 0; i < props.length; i += 1) {
    var value = computed.getPropertyValue(props[i]);
    if (value) styles[props[i]] = String(value).trim();
  }
  var rect = target.getBoundingClientRect();
  return {
    ok: true,
    selector: cssPath(target),
    tag: target.tagName.toLowerCase(),
    label: label(target),
    bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    inViewport: rect.bottom > 0 && rect.top < window.innerHeight,
    styles: styles
  };
`);

// service/agent.ts
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var pngSize = (bytes) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

class Agent {
  browser;
  surface;
  lastTab = new Map;
  constructor(browser, surface) {
    this.browser = browser;
    this.surface = surface;
  }
  async handle(request) {
    this.surface.noteAgent();
    const since = Date.now();
    try {
      const result = await this.run(request);
      const tabId = this.lastTab.get(this.chat(request));
      const dialogs = this.browser.raised.filter((each) => each.at >= since && each.tabId === tabId && each.answered);
      if (!result.ok || dialogs.length === 0)
        return result;
      const data = { ...result.data, dialogs: dialogs.map(({ type, message }) => ({ type, message, answer: "ok" })) };
      return { ...result, data };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.surface.noteAgent();
    }
  }
  chat(request) {
    return request.context.sessionId ?? "";
  }
  target(request) {
    const tabId = request.parameters.tabId;
    if (tabId !== undefined) {
      const tab = this.browser.tabs.get(tabId);
      if (!tab)
        throw new Error(`There is no tab ${tabId}: name one from the tabs browser.snapshot lists.`);
      return this.free(tab);
    }
    const last = this.lastTab.get(this.chat(request));
    const tab = (last ? this.browser.tabs.get(last) : undefined) ?? this.browser.shown;
    if (!tab)
      throw new Error("No tab is open: open a page with browser.open.");
    return this.free(tab);
  }
  free(tab) {
    if (!tab.dialog)
      return tab;
    const message = tab.dialog.message.length > 200 ? `${tab.dialog.message.slice(0, 200)}…` : tab.dialog.message;
    throw new Error(`The page in this tab shows a ${tab.dialog.type} dialog ("${message}") and waits for the user to answer it in the Cloak Browser panel. Nothing was changed; ask the user, or work in another tab.`);
  }
  worked(request, tab) {
    this.lastTab.set(this.chat(request), tab.id);
    this.browser.agentWorking(tab.id);
  }
  async script(tab, expression, awaitPromise = false) {
    const result = await this.browser.evaluate(tab.id, expression, { awaitPromise });
    if (!result || typeof result !== "object")
      throw new Error("The page did not answer.");
    if (result.ok === false)
      throw new Error(result.error);
    const { ok: _ok, ...data } = result;
    return data;
  }
  async settle(tab, loaded) {
    try {
      const quiet = await this.browser.evaluate(tab.id, quietScript({ quietMs: 500, maxMs: 5000 }), { awaitPromise: true, timeoutMs: 8000 });
      return loaded && quiet?.quiet === true;
    } catch {
      return false;
    }
  }
  async screenshot(session) {
    const cdp = this.browser.cdp;
    if (!cdp)
      throw new Error("The browser is not running.");
    let failure = null;
    for (let attempt = 0;attempt < 3; attempt += 1) {
      try {
        return await cdp.send("Page.captureScreenshot", { format: "png" }, session, 4000);
      } catch (error) {
        failure = error;
      }
    }
    throw new Error(`The tab drew no picture: it is behind the page shown in the panel. Show it there, or open the page with browser.open. (${failure instanceof Error ? failure.message : String(failure)})`);
  }
  tabs() {
    return [...this.browser.tabs.values()].map((tab) => ({ id: tab.id, title: tab.title, url: tab.url, active: tab.id === this.browser.shownId }));
  }
  async page(tab) {
    await this.browser.refresh(tab.id);
    return { url: tab.url, title: tab.title };
  }
  async run(request) {
    await this.browser.ready();
    const cdp = this.browser.cdp;
    if (!cdp)
      throw new Error("The browser is not running.");
    switch (request.action) {
      case "browser.open": {
        const { url, viewport, tabId } = request.parameters;
        const tab = tabId !== undefined ? this.target(request) : await this.browser.newTab({ background: true, openedBy: this.chat(request), window: true });
        this.worked(request, tab);
        if (viewport)
          await this.browser.setViewport(tab.id, viewport);
        const { loaded } = await this.browser.navigate(url, tab.id, 25000);
        const settled = await this.settle(tab, loaded);
        const page = await this.page(tab);
        return { ok: true, data: { tabId: tab.id, url: page.url, title: page.title, opened: true, settled, viewport: this.browser.viewportSummary(tab) } };
      }
      case "browser.snapshot": {
        const tab = this.target(request);
        this.worked(request, tab);
        const data = await this.script(tab, snapshotScript({ selector: request.parameters.selector }));
        return { ok: true, data: { ...data, viewport: this.browser.viewportSummary(tab), tabs: this.tabs() } };
      }
      case "browser.click": {
        const tab = this.target(request);
        this.worked(request, tab);
        const found = await this.script(tab, locateScript(request.parameters));
        const session = await this.browser.sessionOf(tab);
        const at = { x: found.x, y: found.y };
        await this.browser.untilDialog(tab, cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, button: "none", buttons: 0 }, session));
        await this.browser.untilDialog(tab, cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...at, button: "left", buttons: 1, clickCount: 1 }, session));
        await this.browser.untilDialog(tab, cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...at, button: "left", buttons: 0, clickCount: 1 }, session));
        await sleep(300);
        const page = await this.page(tab);
        return { ok: true, data: { clicked: found.clicked, label: found.label, url: page.url } };
      }
      case "browser.type": {
        const { selector, value, submit } = request.parameters;
        const tab = this.target(request);
        this.worked(request, tab);
        const field = await this.script(tab, focusFieldScript({ selector }));
        const session = await this.browser.sessionOf(tab);
        if (value) {
          await cdp.send("Input.insertText", { text: value }, session);
        } else if (!field.empty) {
          await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, session);
          await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, session);
        }
        if (submit) {
          await this.browser.untilDialog(tab, cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" }, session));
          await this.browser.untilDialog(tab, cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, session));
          await sleep(300);
        }
        const page = await this.page(tab);
        return { ok: true, data: { selector: field.selector, url: page.url } };
      }
      case "browser.select": {
        const tab = this.target(request);
        this.worked(request, tab);
        const data = await this.script(tab, selectScript(request.parameters));
        return { ok: true, data };
      }
      case "browser.scroll": {
        const tab = this.target(request);
        this.worked(request, tab);
        const data = await this.script(tab, scrollScript(request.parameters), true);
        return { ok: true, data };
      }
      case "browser.back":
      case "browser.forward": {
        const tab = this.target(request);
        this.worked(request, tab);
        const moved = await this.browser.go(request.action === "browser.back" ? "back" : "forward", tab.id, 1e4);
        if (!moved)
          return { ok: false, error: request.action === "browser.back" ? "There is no page to go back to in this tab." : "There is no page to go forward to in this tab." };
        return { ok: true, data: await this.page(tab) };
      }
      case "browser.inspect": {
        const tab = this.target(request);
        this.worked(request, tab);
        const data = await this.script(tab, inspectScript(request.parameters));
        return { ok: true, data };
      }
      case "browser.capture": {
        const tab = this.target(request);
        this.worked(request, tab);
        const session = await this.browser.sessionOf(tab);
        const shot = await this.screenshot(session);
        const bytes = Buffer.from(shot.data, "base64");
        const page = await this.page(tab);
        return { ok: true, data: { base64: shot.data, mime: "image/png", ...pngSize(bytes), url: page.url, title: page.title, viewport: this.browser.viewportSummary(tab) } };
      }
      case "browser.resize": {
        const tab = this.target(request);
        this.worked(request, tab);
        await this.browser.setViewport(tab.id, request.parameters.viewport);
        return { ok: true, data: { viewport: this.browser.viewportSummary(tab) } };
      }
      case "browser.close": {
        const chat = this.chat(request);
        const tabId = request.parameters.tabId;
        let tab;
        if (tabId !== undefined) {
          tab = this.browser.tabs.get(tabId);
          if (!tab)
            return { ok: false, error: `There is no tab ${tabId}: name one from the tabs browser.snapshot lists.` };
          if (tab.openedBy === null)
            return { ok: false, error: "That tab is the user's: an agent closes only the tabs it opened." };
        } else {
          tab = [...this.browser.tabs.values()].reverse().find((each) => each.openedBy === chat);
          if (!tab)
            return { ok: false, error: "This chat has no tab of its own to close." };
        }
        await this.browser.closeTab(tab.id);
        if (this.lastTab.get(chat) === tab.id)
          this.lastTab.delete(chat);
        return { ok: true, data: { closed: true, tabId: tab.id } };
      }
      default:
        return { ok: false, error: "Unknown browser action." };
    }
  }
}

// service/browser.ts
import { spawn as spawn2 } from "node:child_process";
import { readFileSync } from "node:fs";
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
var VIEWPORTS = {
  mobile: { width: 390, height: 844, mobile: true },
  tablet: { width: 768, height: 1024, mobile: true },
  desktop: { width: 1440, height: 900, mobile: false }
};
var sleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
    await sleep2(100);
};

class Browser {
  options;
  phase = "idle";
  error = null;
  progress = null;
  binary = null;
  cdp = null;
  tabs = new Map;
  shownId = null;
  fillSize = { width: 1280, height: 800 };
  canGoBack = false;
  canGoForward = false;
  child = null;
  starting = null;
  scale = 1;
  launchedScale = 0;
  savedSize = null;
  backgroundUntil = 0;
  shownListeners = new Set;
  eventListeners = new Set;
  attachWaiters = new Set;
  dialogListeners = new Set;
  raised = [];
  lastUrlWrite = null;
  constructor(options) {
    this.options = options;
    try {
      const saved = JSON.parse(readFileSync(join2(options.dataDir, "viewer.json"), "utf8"));
      if (typeof saved.scale === "number" && saved.scale >= 1 && saved.scale <= 4)
        this.scale = saved.scale;
      if (Number.isInteger(saved.width) && Number.isInteger(saved.height))
        this.savedSize = { width: saved.width, height: saved.height };
    } catch {}
  }
  get profile() {
    return join2(this.options.dataDir, "profile");
  }
  get scaleFactor() {
    return this.scale;
  }
  get shown() {
    return this.shownId ? this.tabs.get(this.shownId) ?? null : null;
  }
  onShown(listener) {
    this.shownListeners.add(listener);
    return () => this.shownListeners.delete(listener);
  }
  onCdpEvent(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
  state() {
    const tab = this.shown;
    return {
      phase: this.phase,
      error: this.error,
      progress: this.progress,
      url: tab?.url ?? "",
      title: tab?.title ?? "",
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
        loading: each.loading
      })),
      dialog: tab?.dialog ?? null
    };
  }
  async setScale(scale) {
    if (scale === this.scale)
      return;
    this.scale = scale;
    await this.saveViewer();
    if (this.phase !== "running" || this.launchedScale === scale)
      return;
    await this.saveLastUrl();
    await this.stop();
    await this.start().catch(() => {});
  }
  async rememberSize(width, height) {
    if (this.savedSize?.width === width && this.savedSize.height === height)
      return;
    this.savedSize = { width, height };
    await this.saveViewer();
  }
  async saveViewer() {
    await mkdir2(this.options.dataDir, { recursive: true }).catch(() => {});
    await writeFile2(join2(this.options.dataDir, "viewer.json"), `${JSON.stringify({ scale: this.scale, ...this.savedSize })}
`).catch(() => {});
  }
  start() {
    if (this.starting)
      return this.starting;
    if (this.phase === "running" && this.cdp && !this.cdp.closed)
      return Promise.resolve();
    this.starting = this.launch().finally(() => {
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
      await Promise.race([cdp.send("Browser.close", {}, undefined, 3000).catch(() => {}), sleep2(3000)]);
    }
    cdp?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      for (let wait = 0;wait < 30 && child.exitCode === null && child.signalCode === null; wait += 1)
        await sleep2(100);
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }
    this.cdp = null;
    this.tabs.clear();
    this.shownId = null;
    this.changed();
  }
  async ready() {
    await this.start();
    if (!this.cdp)
      throw new Error(this.error ?? "The browser is not running.");
    return this.cdp;
  }
  tab(id) {
    const tab = id ? this.tabs.get(id) : undefined;
    if (!tab)
      throw new Error(id ? `There is no tab ${id}.` : "No tab is open.");
    return tab;
  }
  async sessionOf(tab, timeoutMs = 1e4) {
    const end = Date.now() + timeoutMs;
    while (!tab.sessionId) {
      if (!this.tabs.has(tab.id))
        throw new Error("The tab closed.");
      if (Date.now() > end)
        throw new Error("The tab did not open.");
      await new Promise((resolve) => {
        const wake = () => {
          clearTimeout(timer);
          this.attachWaiters.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, 200);
        this.attachWaiters.add(wake);
      });
    }
    if (tab.ready)
      await tab.ready;
    if (!tab.sessionId)
      throw new Error("The tab closed.");
    return tab.sessionId;
  }
  async show(id) {
    await this.ready();
    await this.showNow(id);
  }
  async showNow(id) {
    const cdp = this.cdp;
    if (!cdp)
      throw new Error("The browser is not running.");
    const tab = this.tab(id);
    const session = await this.sessionOf(tab);
    this.shownId = id;
    await cdp.send("Page.bringToFront", {}, session).catch(() => {});
    for (const listener of [...this.shownListeners])
      listener(tab);
    await this.readHistory();
    this.rememberUrl();
    this.changed();
  }
  async newTab(options = {}) {
    await this.ready();
    return this.newTabNow(options);
  }
  async newTabNow(options) {
    const cdp = this.cdp;
    if (!cdp)
      throw new Error("The browser is not running.");
    const { targetId } = await cdp.send("Target.createTarget", {
      url: "about:blank",
      background: options.background ?? false,
      ...options.window ? { newWindow: true, width: this.fillSize.width, height: this.fillSize.height } : {}
    });
    const end = Date.now() + 1e4;
    while (!this.tabs.has(targetId) && Date.now() < end)
      await sleep2(20);
    const tab = this.tab(targetId);
    tab.openedBy = options.openedBy ?? null;
    await this.sessionOf(tab);
    if (!options.background)
      await this.showNow(targetId);
    this.changed();
    return tab;
  }
  async closeTab(id) {
    const cdp = await this.ready();
    this.tab(id);
    await cdp.send("Target.closeTarget", { targetId: id });
    for (const end = Date.now() + 5000;this.tabs.has(id) && Date.now() < end; )
      await sleep2(20);
  }
  async navigate(url, id, waitMs = 0) {
    const cdp = await this.ready();
    const tab = this.tab(id ?? this.shownId);
    const session = await this.sessionOf(tab);
    const loaded = waitMs > 0 ? this.nextLoad(session, waitMs) : null;
    const answer = await cdp.send("Page.navigate", { url }, session, waitMs > 0 ? waitMs : 30000);
    if (answer.errorText && answer.errorText !== "net::ERR_ABORTED")
      throw new Error(`${url} did not open: ${answer.errorText}`);
    return { loaded: loaded ? await loaded : false };
  }
  async go(direction, id, waitMs = 0) {
    const cdp = await this.ready();
    const tab = this.tab(id ?? this.shownId);
    const session = await this.sessionOf(tab);
    const history = await cdp.send("Page.getNavigationHistory", {}, session);
    const entry = history.entries[history.currentIndex + (direction === "back" ? -1 : 1)];
    if (!entry)
      return false;
    const loaded = waitMs > 0 ? this.nextHistoryStop(tab, session, waitMs) : null;
    await cdp.send("Page.navigateToHistoryEntry", { entryId: entry.id }, session);
    if (loaded)
      await loaded;
    return true;
  }
  async reload(id, ignoreCache = false) {
    const cdp = await this.ready();
    await cdp.send("Page.reload", { ignoreCache }, await this.sessionOf(this.tab(id ?? this.shownId)));
  }
  async stopLoading(id) {
    const cdp = await this.ready();
    await cdp.send("Page.stopLoading", {}, await this.sessionOf(this.tab(id ?? this.shownId)));
  }
  async answerDialog(id, accept, text) {
    const cdp = await this.ready();
    const tab = this.tab(id);
    if (!tab.dialog)
      return;
    await cdp.send("Page.handleJavaScriptDialog", { accept, ...text !== undefined ? { promptText: text } : {} }, await this.sessionOf(tab));
    tab.dialog = null;
    this.changed();
  }
  async evaluate(id, expression, options = {}) {
    const cdp = await this.ready();
    const session = await this.sessionOf(this.tab(id));
    const { frameTree } = await cdp.send("Page.getFrameTree", {}, session);
    const { executionContextId } = await cdp.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "cloak-browser" }, session);
    const answer = await cdp.send("Runtime.evaluate", { expression, contextId: executionContextId, returnByValue: true, awaitPromise: options.awaitPromise ?? false }, session, options.timeoutMs ?? 15000);
    if (answer.exceptionDetails)
      throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text ?? "The page script failed.");
    return answer.result?.value;
  }
  async setViewport(id, mode) {
    const tab = this.tab(id);
    tab.viewport = mode;
    const size = await this.applyViewport(tab);
    if (id === this.shownId)
      for (const listener of [...this.shownListeners])
        listener(tab);
    return size;
  }
  async applyViewport(tab) {
    const cdp = this.cdp;
    const session = tab.sessionId;
    if (!cdp || !session)
      throw new Error("The browser is not running.");
    const preset = tab.viewport === "fill" ? null : VIEWPORTS[tab.viewport];
    const width = preset?.width ?? this.fillSize.width;
    const height = preset?.height ?? this.fillSize.height;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: this.scale, mobile: preset?.mobile ?? false }, session);
    return { width, height };
  }
  viewportSummary(tab) {
    if (tab.viewport === "fill")
      return { mode: "fill", width: null, height: null };
    return { mode: tab.viewport, width: VIEWPORTS[tab.viewport].width, height: VIEWPORTS[tab.viewport].height };
  }
  async untilDialog(tab, work) {
    work.catch(() => {});
    if (tab.dialog)
      return;
    let listener;
    const opened = new Promise((resolve) => {
      listener = (each) => {
        if (each === tab)
          resolve(undefined);
      };
      this.dialogListeners.add(listener);
    });
    try {
      return await Promise.race([work, opened]);
    } finally {
      if (listener)
        this.dialogListeners.delete(listener);
    }
  }
  agentWorking(id, forMs = 8000) {
    const tab = this.tabs.get(id);
    if (tab)
      tab.agentUntil = Date.now() + forMs;
  }
  expectBackgroundTab() {
    this.backgroundUntil = Date.now() + 2000;
  }
  async refresh(id = this.shownId) {
    const cdp = this.cdp;
    const tab = id ? this.tabs.get(id) : undefined;
    if (!cdp || !tab)
      return;
    try {
      const back = this.canGoBack;
      const forward = this.canGoForward;
      const [{ targetInfo }] = await Promise.all([
        cdp.send("Target.getTargetInfo", { targetId: tab.id }, undefined, 2000),
        tab.id === this.shownId ? this.readHistory() : Promise.resolve()
      ]);
      if (tab.title === targetInfo.title && tab.url === targetInfo.url && back === this.canGoBack && forward === this.canGoForward)
        return;
      tab.title = targetInfo.title;
      tab.url = targetInfo.url;
      this.changed();
    } catch {}
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
        this.tabs.clear();
        this.shownId = null;
        if (this.phase === "running") {
          this.phase = "failed";
          this.error = "The browser stopped.";
        }
        this.changed();
      });
      await cdp.send("Target.setDiscoverTargets", { discover: true });
      await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: "page", exclude: false }, { exclude: true }] });
      const end = Date.now() + 1e4;
      while (Date.now() < end && ![...this.tabs.values()].some((tab) => tab.sessionId))
        await sleep2(20);
      await sleep2(300);
      this.phase = "running";
      const last = await this.lastUrl();
      const open = [...this.tabs.values()].filter((tab) => tab.sessionId);
      const first = open.find((tab) => tab.url === last) ?? open.find((tab) => tab.url === "about:blank") ?? open[0] ?? await this.newTabNow({ background: true });
      await this.showNow(first.id);
      if (first.url === "about:blank")
        this.navigate(last, first.id).catch(() => {});
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
  nextLoad(session, timeoutMs) {
    return new Promise((resolve) => {
      const unsubscribe = this.onCdpEvent((event) => {
        if (event.method === "Page.loadEventFired" && event.sessionId === session) {
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
  nextHistoryStop(tab, session, timeoutMs) {
    return new Promise((resolve) => {
      const mainFrame = (frameId) => frameId === (tab.mainFrameId ?? tab.id);
      const unsubscribe = this.onCdpEvent((event) => {
        if (event.sessionId !== session)
          return;
        const frame = event.params.frame;
        const arrived = event.method === "Page.loadEventFired" || event.method === "Page.frameNavigated" && event.params.type === "BackForwardCacheRestore" && !frame?.parentId || event.method === "Page.navigatedWithinDocument" && mainFrame(event.params.frameId);
        if (!arrived)
          return;
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
  async readHistory() {
    const cdp = this.cdp;
    const tab = this.shown;
    if (!cdp || !tab?.sessionId)
      return;
    try {
      const history = await cdp.send("Page.getNavigationHistory", {}, tab.sessionId);
      this.canGoBack = history.currentIndex > 0;
      this.canGoForward = history.currentIndex < history.entries.length - 1;
    } catch {}
  }
  tabBySession(sessionId) {
    for (const tab of this.tabs.values())
      if (tab.sessionId === sessionId)
        return tab;
    return;
  }
  onEvent(event) {
    if (!event.sessionId) {
      this.onBrowserEvent(event);
      return;
    }
    const tab = this.tabBySession(event.sessionId);
    if (!tab)
      return;
    const params = event.params;
    switch (event.method) {
      case "Page.frameStartedLoading":
      case "Page.frameStoppedLoading": {
        if (tab.mainFrameId && params.frameId !== tab.mainFrameId)
          return;
        const loading = event.method === "Page.frameStartedLoading";
        if (loading !== tab.loading) {
          tab.loading = loading;
          this.changed();
        }
        if (!loading)
          this.refresh(tab.id);
        return;
      }
      case "Page.loadEventFired":
      case "Page.domContentEventFired":
        this.refresh(tab.id);
        return;
      case "Page.frameNavigated": {
        const frame = params.frame;
        if (frame.parentId)
          return;
        tab.mainFrameId = frame.id;
        tab.url = frame.url;
        this.refresh(tab.id);
        if (tab.id === this.shownId)
          this.rememberUrl();
        this.changed();
        return;
      }
      case "Page.navigatedWithinDocument":
        if (tab.mainFrameId && params.frameId !== tab.mainFrameId)
          return;
        tab.url = String(params.url ?? tab.url);
        this.refresh(tab.id);
        if (tab.id === this.shownId)
          this.rememberUrl();
        this.changed();
        return;
      case "Page.javascriptDialogOpening": {
        const dialog = { type: String(params.type), message: String(params.message ?? ""), defaultPrompt: String(params.defaultPrompt ?? "") };
        tab.dialog = dialog;
        const answered = tab.id !== this.shownId || Date.now() < tab.agentUntil;
        this.raised.push({ ...dialog, tabId: tab.id, at: Date.now(), answered });
        if (this.raised.length > 20)
          this.raised.shift();
        if (answered)
          this.answerDialog(tab.id, true, dialog.type === "prompt" ? dialog.defaultPrompt : undefined).catch(() => {});
        for (const listener of [...this.dialogListeners])
          listener(tab);
        this.changed();
        return;
      }
      case "Page.javascriptDialogClosed":
        tab.dialog = null;
        this.changed();
        return;
      default:
        return;
    }
  }
  onBrowserEvent(event) {
    const params = event.params;
    const info = params.targetInfo;
    switch (event.method) {
      case "Target.targetCreated": {
        if (!info || info.type !== "page" || this.tabs.has(info.targetId))
          return;
        const opener = info.openerId ? this.tabs.get(info.openerId) : undefined;
        this.addTab(info);
        if (opener && opener.id === this.shownId) {
          const behind = Date.now() < this.backgroundUntil;
          this.backgroundUntil = 0;
          if (!behind)
            this.sessionOf(this.tab(info.targetId)).then(() => this.show(info.targetId)).catch(() => {});
        }
        this.changed();
        return;
      }
      case "Target.targetInfoChanged": {
        const tab = info ? this.tabs.get(info.targetId) : undefined;
        if (!tab || !info)
          return;
        tab.url = info.url;
        tab.title = info.title;
        this.changed();
        return;
      }
      case "Target.targetDestroyed": {
        const targetId = params.targetId;
        const gone = this.tabs.get(targetId);
        if (!gone)
          return;
        const order = [...this.tabs.keys()];
        const index = order.indexOf(targetId);
        this.tabs.delete(targetId);
        if (targetId === this.shownId) {
          this.shownId = null;
          const next = (gone.openerId && this.tabs.has(gone.openerId) ? gone.openerId : null) ?? order[index + 1] ?? order[index - 1];
          if (next && this.tabs.has(next))
            this.show(next).catch(() => {});
          else if (this.phase === "running")
            this.newTab().catch(() => {});
        }
        this.changed();
        return;
      }
      case "Target.attachedToTarget": {
        const attached = params.targetInfo;
        if (attached?.type !== "page")
          return;
        const tab = this.tabs.get(attached.targetId) ?? this.addTab(attached);
        tab.sessionId = params.sessionId;
        tab.ready = this.prepare(tab, params.waitingForDebugger === true);
        for (const wake of [...this.attachWaiters])
          wake();
        return;
      }
      case "Target.detachedFromTarget": {
        const tab = this.tabBySession(params.sessionId);
        if (tab)
          tab.sessionId = null;
        return;
      }
      default:
        return;
    }
  }
  addTab(info) {
    const opener = info.openerId ? this.tabs.get(info.openerId) : undefined;
    const tab = {
      id: info.targetId,
      url: info.url,
      title: info.title,
      openerId: info.openerId,
      sessionId: null,
      ready: null,
      mainFrameId: null,
      openedBy: opener?.openedBy ?? null,
      loading: false,
      dialog: null,
      viewport: "fill",
      agentUntil: 0
    };
    this.tabs.set(info.targetId, tab);
    return tab;
  }
  async prepare(tab, paused) {
    const cdp = this.cdp;
    const session = tab.sessionId;
    if (!cdp || !session)
      return;
    await Promise.allSettled([
      cdp.send("Page.enable", {}, session),
      cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }, session),
      this.applyViewport(tab),
      ...paused ? [cdp.send("Runtime.runIfWaitingForDebugger", {}, session)] : []
    ]);
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
    const url = this.shown?.url ?? "";
    if (!/^https?:\/\//.test(url))
      return;
    await writeFile2(join2(this.options.dataDir, "last.json"), `${JSON.stringify({ url })}
`).catch(() => {});
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
var TYPING_MS = 1e4;
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
  lastPress = { at: 0, x: 0, y: 0, button: "none", count: 0, url: "" };
  shownTitle = "";
  titleReadAt = 0;
  agentUntil = 0;
  inputAt = 0;
  swallowed = new Set;
  typing = null;
  typingSeq = 0;
  sized = false;
  constructor(browser) {
    this.browser = browser;
    this.dpr = browser.scaleFactor;
    const saved = browser.savedSize;
    if (saved) {
      this.deviceWidth = clamp(saved.width, MIN_WIDTH, MAX_WIDTH);
      this.deviceHeight = clamp(saved.height, MIN_HEIGHT, MAX_HEIGHT);
      this.cssWidth = Math.max(100, Math.round(this.deviceWidth / this.dpr));
      this.cssHeight = Math.max(100, Math.round(this.deviceHeight / this.dpr));
      browser.fillSize = { width: this.cssWidth, height: this.cssHeight };
    }
    browser.onShown((tab) => this.recast(tab));
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
    this.sized = true;
    this.browser.rememberSize(next.width, next.height);
    if (next.width !== this.deviceWidth || next.height !== this.deviceHeight) {
      this.deviceWidth = next.width;
      this.deviceHeight = next.height;
      this.placeholder = null;
      this.fill();
    }
    return next;
  }
  viewer(dpr, mac) {
    const ratio = Math.max(1, Math.min(4, Math.round(dpr * 4) / 4));
    const changed = ratio !== this.dpr;
    this.dpr = ratio;
    this.mac = mac;
    this.browser.setScale(ratio);
    if (changed)
      this.fill();
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
    return { frame: this.current(), seq: this.seq, title, agentActive: this.agentActive };
  }
  async input(events) {
    const cdp = await this.browser.ready();
    this.inputAt = Date.now();
    for (const event of events) {
      const tab = this.browser.tab(this.browser.shownId);
      if (tab.dialog) {
        if (event.type === "key" && event.action === "down" && (event.key === "Enter" || event.key === "Escape")) {
          await this.browser.answerDialog(tab.id, event.key === "Enter", tab.dialog.type === "prompt" ? tab.dialog.defaultPrompt : undefined);
        }
        continue;
      }
      if (event.type === "key" && await this.shortcut(event))
        continue;
      if (this.typeIntoAddress(event))
        continue;
      const session = await this.browser.sessionOf(tab);
      await this.browser.untilDialog(tab, this.dispatch(cdp, session, event));
    }
  }
  stripState() {
    if (this.typing && Date.now() > this.typing.until)
      this.typing = null;
    return {
      address: this.typing ? { seq: this.typing.seq } : null,
      inUse: Date.now() - this.inputAt < 3000,
      surface: { width: this.deviceWidth, height: this.deviceHeight, maxWidth: MAX_WIDTH, sized: this.sized }
    };
  }
  takeAddress(seq) {
    if (!this.typing || this.typing.seq !== seq)
      return null;
    const { draft } = this.typing;
    this.typing = null;
    return draft;
  }
  async clipboard() {
    const shown = this.browser.shown;
    if (!shown || shown.dialog)
      return "";
    const value = await this.browser.evaluate(shown.id, SELECTION_SCRIPT);
    return typeof value === "string" ? value : "";
  }
  noteAgent() {
    this.agentUntil = Date.now() + 4000;
  }
  get agentActive() {
    return Date.now() < this.agentUntil;
  }
  fill() {
    this.browser.fillSize = { width: Math.max(100, Math.round(this.deviceWidth / this.dpr)), height: Math.max(100, Math.round(this.deviceHeight / this.dpr)) };
    const shown = this.browser.shown;
    if (shown)
      this.recast(shown);
    else
      this.bump();
    for (const tab of this.browser.tabs.values()) {
      if (tab !== shown && tab.viewport === "fill" && tab.sessionId)
        this.browser.applyViewport(tab).catch(() => {});
    }
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
    if (event.method === "Page.frameNavigated" && event.sessionId && event.sessionId === this.castSession && !event.params.frame?.parentId) {
      this.lastPress = { at: 0, x: 0, y: 0, button: "none", count: 0, url: "" };
      return;
    }
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
  recast(tab) {
    this.casting = this.casting.then(() => this.cast(tab)).catch((error) => {
      console.error("[cloak-browser] could not show the tab:", error);
    });
  }
  async cast(tab) {
    const cdp = this.browser.cdp;
    if (!cdp || this.browser.shownId !== tab.id)
      return;
    const session = await this.browser.sessionOf(tab);
    if (this.castSession && this.castSession !== session) {
      cdp.send("Page.stopScreencast", {}, this.castSession).catch(() => {});
    }
    this.browser.fillSize = { width: Math.max(100, Math.round(this.deviceWidth / this.dpr)), height: Math.max(100, Math.round(this.deviceHeight / this.dpr)) };
    if (tab.viewport === "fill") {
      try {
        const { windowId } = await cdp.send("Browser.getWindowForTarget", { targetId: tab.id });
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: this.browser.fillSize.width, height: this.browser.fillSize.height } });
      } catch {}
    }
    const size = await this.browser.applyViewport(tab);
    this.cssWidth = size.width;
    this.cssHeight = size.height;
    await cdp.send("Page.stopScreencast", {}, session).catch(() => {});
    if (this.castSession !== session)
      this.lastPress = { at: 0, x: 0, y: 0, button: "none", count: 0, url: "" };
    this.castSession = session;
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: QUALITY, maxWidth: this.deviceWidth, maxHeight: this.deviceHeight, everyNthFrame: 1 }, session);
    const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: QUALITY }, session, 3000).catch(() => null);
    if (shot && this.castSession === session) {
      const bytes = Buffer.from(shot.data, "base64");
      const size = jpegSize(bytes);
      if (size) {
        this.frame = { bytes, mime: "image/jpeg", ...size };
        this.bump();
      }
    }
  }
  async shortcut(event) {
    if (event.action === "up")
      return this.swallowed.delete(event.code);
    const command = this.browserCommand(event);
    if (!command)
      return false;
    this.swallowed.add(event.code);
    this.typing = null;
    try {
      await command();
    } catch (error) {
      console.error("[cloak-browser] a browser key failed:", error);
    }
    return true;
  }
  browserCommand(event) {
    const { key, code } = event;
    const m = event.modifiers;
    const mac = this.mac;
    const mod = mac ? m.meta && !m.ctrl : m.ctrl && !m.meta;
    const letter = key.length === 1 ? key.toLowerCase() : "";
    const shown = this.browser.shownId;
    if (mod && !m.alt && !m.shift && letter === "t") {
      return async () => {
        await this.browser.newTab();
        this.typeAddress();
      };
    }
    if (mod && !m.alt && !m.shift && letter === "w")
      return async () => shown ? this.browser.closeTab(shown) : undefined;
    if (m.ctrl && !m.meta && !m.alt && key === "Tab")
      return () => this.cycle(m.shift ? -1 : 1);
    if (mod && !m.alt && !m.shift && (key === "PageDown" || key === "PageUp"))
      return () => this.cycle(key === "PageDown" ? 1 : -1);
    if (mod && m.alt && !m.shift && (key === "ArrowRight" || key === "ArrowLeft"))
      return () => this.cycle(key === "ArrowRight" ? 1 : -1);
    if (mac && mod && !m.alt && m.shift && (code === "BracketRight" || code === "BracketLeft"))
      return () => this.cycle(code === "BracketRight" ? 1 : -1);
    if (mod && !m.alt && !m.shift && /^Digit[1-9]$/.test(code))
      return () => this.pick(Number(code.slice(5)));
    if (mod && !m.alt && !m.shift && (code === "BracketLeft" || code === "BracketRight"))
      return () => this.history(code === "BracketLeft" ? "back" : "forward");
    if (!mac && m.alt && !m.ctrl && !m.meta && !m.shift && (key === "ArrowLeft" || key === "ArrowRight"))
      return () => this.history(key === "ArrowLeft" ? "back" : "forward");
    if (mod && !m.alt && letter === "r" || key === "F5" && !m.alt && !m.meta)
      return () => this.browser.reload(shown, m.shift || key === "F5" && m.ctrl);
    if (mod && !m.alt && !m.shift && letter === "l" || !mac && m.alt && !m.ctrl && !m.meta && !m.shift && letter === "d" || key === "F6" && !m.alt && !m.ctrl && !m.meta && !m.shift) {
      return async () => this.typeAddress();
    }
    return null;
  }
  async cycle(step) {
    const ids = [...this.browser.tabs.keys()];
    if (ids.length < 2)
      return;
    const at = ids.indexOf(this.browser.shownId ?? "");
    await this.browser.show(ids[(at + step + ids.length) % ids.length]);
  }
  async pick(number) {
    const ids = [...this.browser.tabs.keys()];
    const id = number === 9 ? ids[ids.length - 1] : ids[number - 1];
    if (id && id !== this.browser.shownId)
      await this.browser.show(id);
  }
  async history(direction) {
    await this.browser.go(direction);
  }
  typeAddress() {
    this.typingSeq += 1;
    this.typing = { seq: this.typingSeq, draft: "", until: Date.now() + TYPING_MS };
  }
  typeIntoAddress(event) {
    const typing = this.typing;
    if (!typing)
      return false;
    if (Date.now() > typing.until) {
      this.typing = null;
      return false;
    }
    if (event.type === "pointer" && event.action === "move")
      return false;
    if (event.type === "text") {
      typing.draft += event.text;
      typing.until = Date.now() + TYPING_MS;
      return true;
    }
    if (event.type !== "key") {
      this.typing = null;
      return false;
    }
    if (event.action === "up")
      return false;
    const { key, modifiers: m } = event;
    if (key === "Shift" || key === "CapsLock" || key === "Alt" || key === "AltGraph" || key === "Process" || key === "Dead")
      return true;
    typing.until = Date.now() + TYPING_MS;
    if (key === "Enter" || key === "Escape") {
      this.typing = null;
      this.swallowed.add(event.code);
      const address = typing.draft.trim();
      if (key === "Enter" && address)
        this.browser.navigate(toUrl(address)).catch(() => {});
      return true;
    }
    if (key === "Backspace") {
      typing.draft = Array.from(typing.draft).slice(0, -1).join("");
      this.swallowed.add(event.code);
      return true;
    }
    if (Array.from(key).length === 1) {
      if (m.ctrl || m.meta) {
        this.typing = null;
        return false;
      }
      typing.draft += key;
      this.swallowed.add(event.code);
      return true;
    }
    this.typing = null;
    return false;
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
      if (modifiers & 2 || event.button === 1)
        this.browser.expectBackgroundTab();
      const now = Date.now();
      const last = this.lastPress;
      const url = this.browser.shown?.url ?? "";
      const again = now - last.at < MULTI_CLICK_MS && last.url === url && last.button === button && Math.abs(last.x - x) < MULTI_CLICK_PX && Math.abs(last.y - y) < MULTI_CLICK_PX;
      this.lastPress = { at: now, x, y, button, count: again ? last.count + 1 : 1, url };
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
var agent = new Agent(browser, surface);
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
      return send(res, 200, { ...browser.state(), ...surface.stripState(), youControl: req.headers[SURFACE_VIEWER_CONTROLS_HEADER] === "1" });
    case "POST /navigate": {
      const body = await readJson(req);
      const address = typeof body?.url === "string" ? body.url.trim() : "";
      if (!address)
        return send(res, 400, { ok: false, error: "url is required" });
      return command(res, async () => {
        await browser.navigate(toUrl(address));
      });
    }
    case "POST /history": {
      const body = await readJson(req);
      const direction = body?.direction === "forward" ? "forward" : "back";
      return command(res, async () => {
        await browser.go(direction);
      });
    }
    case "POST /tabs": {
      const body = await readJson(req);
      const id = typeof body?.id === "string" ? body.id : "";
      switch (body?.action) {
        case "new":
          return command(res, async () => {
            await browser.newTab();
          });
        case "show":
          return command(res, () => browser.show(id));
        case "close":
          return command(res, () => browser.closeTab(id));
        default:
          return send(res, 400, { ok: false, error: "action is new, show or close" });
      }
    }
    case "POST /address": {
      const body = await readJson(req);
      return send(res, 200, { ok: true, draft: surface.takeAddress(Number(body?.seq)) });
    }
    case "POST /dialog": {
      const body = await readJson(req);
      const text = typeof body?.text === "string" ? body.text : undefined;
      return command(res, () => browser.answerDialog(browser.shownId, body?.accept === true, text));
    }
    case `POST ${BROWSER_PROVIDER_PATH}`: {
      const request = readBrowserProviderRequest(await readBody(req));
      if (!request)
        return send(res, 400, { ok: false, error: "Not a browser action" });
      return send(res, 200, await agent.handle(request));
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
        [SURFACE_TITLE_HEADER]: answer.title,
        ...answer.agentActive ? { [SURFACE_AGENT_ACTIVE_HEADER]: "1" } : {}
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
