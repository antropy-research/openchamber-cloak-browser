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
import { closeSync, openSync, readFileSync } from "node:fs";
import { mkdir as mkdir2, readFile as readFile2, readlink, rm as rm2, writeFile as writeFile2 } from "node:fs/promises";
import { hostname } from "node:os";
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
var HANDOVER_FILE = "handover.json";
var HANDOVER_MS = 60000;
var WATCHDOG = `
const fs = require('fs');
const [file, pidText, atText, deadlineText] = process.argv.slice(1);
const pid = Number(pidText), at = Number(atText), deadline = Number(deadlineText);
const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
const stop = () => {
  try { process.kill(pid, 'SIGTERM'); } catch {}
  setTimeout(() => { try { process.kill(pid, 'SIGKILL'); } catch {} process.exit(0); }, 5000);
};
const tick = () => {
  let handover = null;
  let gone = false;
  try { handover = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { gone = error && error.code === 'ENOENT'; }
  if (!alive()) process.exit(0);
  if (gone) return stop();
  if (handover && (handover.at !== at || handover.claimedBy)) process.exit(0);
  if (Date.now() < deadline) { setTimeout(tick, 1000); return; }
  try { fs.rmSync(file, { force: true }); } catch {}
  stop();
};
tick();
`;
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
  const dash = owner.lastIndexOf("-");
  if (owner.slice(0, dash) !== hostname()) {
    await Promise.all(["SingletonLock", "SingletonCookie", "SingletonSocket"].map((name) => rm2(join2(profile, name), { force: true }).catch(() => {})));
    return;
  }
  const pid = Number(owner.slice(dash + 1));
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
  adoptedPid = null;
  wsUrl = "";
  handedOver = false;
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
    for (const tab of this.tabs.values())
      if (tab.sessionId)
        this.applyViewport(tab).catch(() => {});
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
    const adopted = this.adoptedPid;
    this.adoptedPid = null;
    if (adopted && alive(adopted)) {
      try {
        process.kill(adopted, "SIGTERM");
      } catch {}
      for (let wait = 0;wait < 30 && alive(adopted); wait += 1)
        await sleep2(100);
      if (alive(adopted))
        process.kill(adopted, "SIGKILL");
    }
    this.cdp = null;
    this.tabs.clear();
    this.shownId = null;
    this.changed();
  }
  async handOver() {
    const pid = this.child?.pid ?? this.adoptedPid;
    if (this.phase !== "running" || !this.cdp || this.cdp.closed || !pid || !this.wsUrl)
      return false;
    const handover = {
      pid,
      ws: this.wsUrl,
      profile: this.profile,
      scale: this.launchedScale || this.scale,
      shownId: this.shownId,
      order: [...this.tabs.keys()],
      tabs: Object.fromEntries([...this.tabs.values()].map((tab) => [tab.id, { openedBy: tab.openedBy, viewport: tab.viewport }])),
      at: Date.now()
    };
    const file = join2(this.options.dataDir, HANDOVER_FILE);
    try {
      await writeFile2(file, `${JSON.stringify(handover)}
`);
    } catch {
      return false;
    }
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("OPENCHAMBER_"))
        delete env[key];
    const watchdog = spawn2(process.execPath, ["-e", WATCHDOG, file, String(pid), String(handover.at), String(handover.at + HANDOVER_MS)], { detached: true, stdio: "ignore", env });
    watchdog.unref();
    this.handedOver = true;
    this.cdp.close();
    this.cdp = null;
    this.child = null;
    this.adoptedPid = null;
    return true;
  }
  async adopt() {
    const file = join2(this.options.dataDir, HANDOVER_FILE);
    let handover;
    try {
      handover = JSON.parse(await readFile2(file, "utf8"));
    } catch {
      return null;
    }
    const usable = async () => {
      if (handover.claimedBy || handover.profile !== this.profile || !Number.isInteger(handover.pid) || !alive(handover.pid) || Date.now() - handover.at > HANDOVER_MS)
        return false;
      try {
        const command = (await readFile2(`/proc/${handover.pid}/cmdline`)).toString("utf8").replaceAll("\x00", " ");
        if (!command.includes(`--user-data-dir=${this.profile}`))
          return false;
        const port = new URL(handover.ws).port;
        const version = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000) })).json();
        return version.webSocketDebuggerUrl === handover.ws;
      } catch {
        return false;
      }
    };
    if (!await usable()) {
      if (!handover.claimedBy)
        await rm2(file, { force: true }).catch(() => {});
      return null;
    }
    try {
      await writeFile2(file, `${JSON.stringify({ ...handover, claimedBy: process.pid })}
`);
    } catch {
      return null;
    }
    this.adoptedPid = handover.pid;
    this.launchedScale = handover.scale;
    return handover;
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
      const handover = await this.adopt();
      if (!handover)
        await stopLeftover(this.profile);
      const url = handover?.ws ?? await this.spawnBrowser(this.binary.path, seed);
      const cdp = await Cdp.connect(url);
      this.cdp = cdp;
      this.wsUrl = url;
      cdp.on((event) => {
        this.onEvent(event);
        for (const listener of [...this.eventListeners])
          listener(event);
      });
      cdp.onClose(() => {
        if (this.cdp !== cdp || this.handedOver)
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
      if (handover) {
        const tabs = [...this.tabs.values()];
        this.tabs.clear();
        for (const id of handover.order) {
          const tab = tabs.find((each) => each.id === id);
          if (tab)
            this.tabs.set(id, tab);
        }
        for (const tab of tabs)
          if (!this.tabs.has(tab.id))
            this.tabs.set(tab.id, tab);
        for (const tab of this.tabs.values()) {
          const known = handover.tabs[tab.id];
          if (!known)
            continue;
          tab.openedBy = known.openedBy;
          if (known.viewport !== tab.viewport) {
            tab.viewport = known.viewport;
            tab.ready?.then(() => this.applyViewport(tab)).catch(() => {});
          }
        }
        const shown = handover.shownId && this.tabs.get(handover.shownId)?.sessionId ? handover.shownId : [...this.tabs.values()].find((tab) => tab.sessionId)?.id;
        if (shown) {
          await this.showNow(shown);
          return;
        }
      }
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
  async spawnBrowser(binary, seed) {
    const portFile = join2(this.profile, "DevToolsActivePort");
    const logFile = join2(this.options.dataDir, "browser.log");
    await rm2(portFile, { force: true }).catch(() => {});
    const log = openSync(logFile, "w");
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
    ], { stdio: ["ignore", "ignore", log], env });
    closeSync(log);
    this.child = child;
    this.launchedScale = this.scale;
    this.handedOver = false;
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
    const tail = async () => (await readFile2(logFile, "utf8").catch(() => "")).trim().split(`
`).slice(-3).join(" ");
    let failure = null;
    child.on("error", (error) => {
      failure = error;
    });
    child.on("exit", (code, signal) => {
      failure ??= new Error(`The browser exited while starting (${signal ?? `code ${code}`}).`);
    });
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      if (failure)
        throw new Error(`${failure.message} ${await tail()}`.trim());
      const lines = (await readFile2(portFile, "utf8").catch(() => "")).split(`
`);
      if (lines.length >= 2 && /^\d+$/.test(lines[0]) && lines[1].startsWith("/devtools/browser/"))
        return `ws://127.0.0.1:${lines[0]}${lines[1].trim()}`;
      await sleep2(50);
    }
    throw new Error(`The browser did not start within 30 s. ${await tail()}`.trim());
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

// service/control.ts
var AGENT_HOLD_MS = 30000;
var USER_IDLE_MS = 60000;
var AGENT_SEEN_MS = 10 * 60000;
var VIEWER_GONE_MS = 20000;
var USER_HAS_CONTROL = "The user is interacting with this page in the panel right now, so the action was not run. " + "Wait for them to hand control back, or ask them to. Nothing was changed.";

class Control {
  changed;
  controller = "none";
  viewer = null;
  agentUntil = 0;
  agentAt = 0;
  userAt = 0;
  seen = new Map;
  constructor(changed = () => {}) {
    this.changed = changed;
  }
  see(viewer) {
    if (viewer)
      this.seen.set(viewer, Date.now());
  }
  state(viewer) {
    this.settle();
    return { controller: this.controller, mine: this.controller === "user" && this.viewer === viewer, agentSeen: Date.now() - this.agentAt < AGENT_SEEN_MS };
  }
  userActs(viewer) {
    this.settle();
    if (!viewer || this.controller === "user" && this.viewer !== viewer)
      return false;
    const was = this.controller;
    this.controller = "user";
    this.viewer = viewer;
    this.userAt = Date.now();
    this.see(viewer);
    if (was !== "user")
      this.changed();
    return true;
  }
  userLooks(viewer) {
    this.settle();
    return this.controller === "user" && this.viewer === viewer;
  }
  release(viewer) {
    this.settle();
    if (this.controller !== "user" || this.viewer !== viewer)
      return;
    this.controller = "none";
    this.viewer = null;
    this.changed();
  }
  agentActs() {
    this.settle();
    this.agentAt = Date.now();
    if (this.controller === "user")
      return false;
    const was = this.controller;
    this.controller = "agent";
    this.agentUntil = Date.now() + AGENT_HOLD_MS;
    if (was !== "agent")
      this.changed();
    return true;
  }
  settle() {
    const now = Date.now();
    if (this.controller === "user") {
      const seen = this.seen.get(this.viewer ?? "") ?? 0;
      if (now - this.userAt > USER_IDLE_MS || now - seen > VIEWER_GONE_MS) {
        this.controller = "none";
        this.viewer = null;
        this.changed();
      }
    } else if (this.controller === "agent" && now > this.agentUntil) {
      this.controller = "none";
      this.changed();
    }
    for (const [viewer, at] of this.seen)
      if (now - at > VIEWER_GONE_MS * 3)
        this.seen.delete(viewer);
  }
}

// service/mirror.ts
import { createHash as createHash2, randomUUID } from "node:crypto";

// service/mirror-recorder.ts
function mirrorRecorder() {
  const world = window;
  if (world.__cloakMirror)
    return;
  const HTML = "http://www.w3.org/1999/xhtml";
  const SVG = "http://www.w3.org/2000/svg";
  const MATH = "http://www.w3.org/1998/Math/MathML";
  const SKIP = new Set(["script", "noscript", "template", "base", "meta"]);
  const PATCH = new Set(["canvas", "video", "iframe", "embed", "object", "audio"]);
  const URL_ATTRIBUTES = new Set(["src", "href", "poster", "action", "formaction", "data", "background", "cite", "xlink:href"]);
  const finished = new Set;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        finished.add(entry.name);
      if (finished.size > 20000) {
        const newest = Array.from(finished).slice(-1e4);
        finished.clear();
        for (const name of newest)
          finished.add(name);
      }
    }).observe({ type: "resource", buffered: true });
  } catch {}
  const ids = new WeakMap;
  const byId = new Map;
  const sent = new WeakSet;
  const detached = new WeakSet;
  const styles = new Map;
  const patchNodes = new Map;
  const controls = new Map;
  let nextId = 1;
  let queue = [];
  let running = false;
  let adopted = "";
  const idOf = (node) => {
    let id = ids.get(node);
    if (!id) {
      id = nextId++;
      ids.set(node, id);
    }
    byId.set(id, new WeakRef(node));
    return id;
  };
  const absolute = (value, base = document.baseURI) => {
    try {
      return new URL(value, base).href;
    } catch {
      return value;
    }
  };
  const cssUrls = (css, base) => css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (match, _quote, url) => {
    if (!url || /^(data:|blob:|#|about:)/i.test(url))
      return match;
    return `url("${absolute(url, base)}")`;
  });
  const sheetText = (sheet, base) => {
    if (!sheet)
      return null;
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      return null;
    }
    const parts = [];
    for (let index = 0;index < rules.length; index += 1) {
      const rule = rules[index];
      if (rule instanceof CSSImportRule) {
        const inner = sheetText(rule.styleSheet, rule.styleSheet?.href ?? base);
        parts.push(inner ?? `@import url("${absolute(rule.href, base)}");`);
        continue;
      }
      parts.push(rule.cssText);
    }
    return cssUrls(parts.join(`
`), base);
  };
  const adoptedText = (sheets) => sheets.map((sheet) => sheetText(sheet, document.baseURI) ?? "").join(`
`);
  const isStylesheet = (element) => /(^|\s)stylesheet(\s|$)/i.test(element.getAttribute("rel") ?? "");
  const attributesOf = (element) => {
    const out = {};
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name;
      if (/^on/i.test(name))
        continue;
      let value = attribute.value;
      if (URL_ATTRIBUTES.has(name) && value && !/^(javascript:|data:|blob:|#)/i.test(value))
        value = absolute(value);
      else if (name === "style")
        value = cssUrls(value, document.baseURI);
      out[name] = value;
    }
    return out;
  };
  const formState = (element) => {
    if (element instanceof HTMLInputElement) {
      if (element.type === "file")
        return null;
      return JSON.stringify({ v: element.value, k: element.checked });
    }
    if (element instanceof HTMLTextAreaElement)
      return JSON.stringify({ v: element.value });
    if (element instanceof HTMLSelectElement)
      return JSON.stringify({ v: element.value, si: element.selectedIndex });
    return null;
  };
  const ignored = (node) => {
    if (node.nodeType === Node.TEXT_NODE)
      return false;
    if (node.nodeType !== Node.ELEMENT_NODE)
      return true;
    const element = node;
    if (element.localName.toLowerCase() === "script" || element.namespaceURI === HTML && SKIP.has(element.localName))
      return true;
    return element.namespaceURI === HTML && element.localName === "link" && !isStylesheet(element);
  };
  let observer;
  const unsized = new Map;
  const sizeImage = (id, image, out) => {
    if (image.hasAttribute("width") && image.hasAttribute("height"))
      return;
    if (image.naturalWidth > 0 && image.naturalHeight > 0)
      out.is = [image.naturalWidth, image.naturalHeight];
    else
      unsized.set(id, new WeakRef(image));
  };
  const observedShadows = new WeakSet;
  const shadowless = new Set;
  const definedNames = new Set;
  const undefinedCustom = new Map;
  let described = 0;
  let lastFullShadowSweep = 0;
  const serialize = (node, parentNs) => {
    if (ignored(node))
      return null;
    const id = idOf(node);
    sent.add(node);
    detached.delete(node);
    if (node.nodeType === Node.TEXT_NODE)
      return { i: id, x: node.data };
    const element = node;
    const tag = element.localName;
    const out = { i: id, n: tag };
    const ns = element.namespaceURI === SVG ? "s" : element.namespaceURI === MATH ? "m" : null;
    if (ns !== parentNs)
      out.ns = ns ?? "h";
    if (element.namespaceURI === HTML && tag.includes("-")) {
      if (definedNames.has(tag) || element.matches(":defined")) {
        definedNames.add(tag);
        out.d = 1;
      } else {
        undefinedCustom.set(id, new WeakRef(element));
      }
    }
    const attributes = attributesOf(element);
    if (element.namespaceURI === HTML) {
      if (tag === "style") {
        out.a = attributes;
        out.css = sheetText(element.sheet, document.baseURI) ?? element.textContent ?? "";
        styles.set(id, { node: new WeakRef(element), rules: element.sheet?.cssRules.length ?? 0 });
        return out;
      }
      if (tag === "link") {
        const link = element;
        out.a = { rel: "stylesheet", href: link.href, ...link.media ? { media: link.media } : {} };
        return out;
      }
      if (tag === "img") {
        sizeImage(id, element, out);
        const image = element;
        const chosen = image.currentSrc || image.getAttribute("src") || "";
        delete attributes.srcset;
        delete attributes.sizes;
        if (chosen)
          attributes.src = absolute(chosen);
      }
      if (tag === "source" && element.parentElement?.localName === "picture") {
        delete attributes.srcset;
      }
      if (PATCH.has(tag)) {
        out.patch = 1;
        delete attributes.src;
        delete attributes.srcdoc;
        delete attributes.data;
        patchNodes.set(id, new WeakRef(element));
      }
      const state = formState(element);
      if (state !== null) {
        out.p = JSON.parse(state);
        controls.set(id, { node: new WeakRef(element), state });
      }
    }
    if (Object.keys(attributes).length)
      out.a = attributes;
    if (element.scrollTop || element.scrollLeft)
      out.sc = [Math.round(element.scrollLeft), Math.round(element.scrollTop)];
    if (out.patch)
      return out;
    const children = [];
    for (const child of Array.from(element.childNodes)) {
      const described = serialize(child, ns);
      if (described)
        children.push(described);
    }
    if (children.length)
      out.c = children;
    described += 1;
    const shadow = element.shadowRoot;
    if (!shadow && tag.includes("-"))
      shadowless.add(new WeakRef(element));
    if (shadow) {
      const inside = [];
      for (const child of Array.from(shadow.childNodes)) {
        const described = serialize(child, ns);
        if (described)
          inside.push(described);
      }
      out.s = inside;
      if (shadow.adoptedStyleSheets.length)
        out.sa = adoptedText(shadow.adoptedStyleSheets);
      observedShadows.add(shadow);
      observer.observe(shadow, { childList: true, attributes: true, characterData: true, subtree: true });
    }
    return out;
  };
  const childList = (parent, ns) => {
    const out = [];
    for (const child of Array.from(parent.childNodes)) {
      if (ignored(child))
        continue;
      if (sent.has(child) && !detached.has(child)) {
        out.push(ids.get(child));
        continue;
      }
      const described = serialize(child, ns);
      if (described)
        out.push(described);
    }
    return out;
  };
  const nsOf = (node) => {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : null;
    if (!element)
      return null;
    return element.namespaceURI === SVG ? "s" : element.namespaceURI === MATH ? "m" : null;
  };
  const styleOwner = (node) => {
    const parent = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement ?? null;
    return parent && parent.namespaceURI === HTML && parent.localName === "style" ? parent : null;
  };
  const restyle = (element) => {
    const id = ids.get(element);
    if (!id || !sent.has(element))
      return null;
    const css = sheetText(element.sheet, element instanceof HTMLLinkElement ? element.href : document.baseURI);
    if (css === null)
      return null;
    styles.set(id, { node: new WeakRef(element), rules: element.sheet?.cssRules.length ?? 0 });
    return ["s", id, css];
  };
  const flush = (records) => {
    if (!running || records.length === 0)
      return;
    const parents = new Set;
    const attributes = new Map;
    const texts = new Set;
    const restyled = new Set;
    for (const record of records) {
      if (record.type === "childList") {
        record.removedNodes.forEach((node) => detached.add(node));
        const owner = styleOwner(record.target);
        if (owner)
          restyled.add(owner);
        else
          parents.add(record.target);
      } else if (record.type === "attributes") {
        const element = record.target;
        if (record.attributeName === "rel" && element.localName === "link" && element.parentNode && !sent.has(element)) {
          parents.add(element.parentNode);
          continue;
        }
        let names = attributes.get(element);
        if (!names)
          attributes.set(element, names = new Set);
        names.add(record.attributeName ?? "");
      } else if (record.type === "characterData") {
        const owner = styleOwner(record.target);
        if (owner)
          restyled.add(owner);
        else
          texts.add(record.target);
      }
    }
    const ops = [];
    const fresh = new WeakSet;
    const markFresh = (node) => {
      if (typeof node === "number")
        return;
      const live = byId.get(node.i)?.deref();
      if (live)
        fresh.add(live);
      for (const child of node.c ?? [])
        markFresh(child);
      for (const child of node.s ?? [])
        markFresh(child);
    };
    const ordered = Array.from(parents).filter((node) => node.isConnected).sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    for (const parent of ordered) {
      if (parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        const host = parent.host;
        if (!host || !sent.has(host) || fresh.has(host) || detached.has(host))
          continue;
        const list = childList(parent, nsOf(host));
        list.forEach(markFresh);
        ops.push(["S", ids.get(host), list]);
        continue;
      }
      if (parent.nodeType === Node.DOCUMENT_NODE) {
        queue.push(snapshot());
        return;
      }
      if (!sent.has(parent) || fresh.has(parent) || detached.has(parent) || ignored(parent))
        continue;
      if (PATCH.has(parent.localName))
        continue;
      const list = childList(parent, nsOf(parent));
      list.forEach(markFresh);
      ops.push(["c", ids.get(parent), list]);
    }
    for (const [element, names] of attributes) {
      if (!sent.has(element) || fresh.has(element) || detached.has(element) || !element.isConnected)
        continue;
      const id = ids.get(element);
      for (const name of names) {
        if (!name || /^on/i.test(name))
          continue;
        if (element.localName === "img" && (name === "srcset" || name === "sizes"))
          continue;
        let value = element.getAttribute(name);
        if (value !== null && URL_ATTRIBUTES.has(name) && !/^(javascript:|data:|blob:|#)/i.test(value))
          value = absolute(value);
        else if (value !== null && name === "style")
          value = cssUrls(value, document.baseURI);
        if (element.localName === "img" && name === "src")
          value = element.currentSrc || value;
        ops.push(["a", id, name, value]);
      }
    }
    for (const node of texts) {
      if (!sent.has(node) || fresh.has(node) || detached.has(node) || !node.isConnected)
        continue;
      ops.push(["t", ids.get(node), node.data]);
    }
    for (const element of restyled) {
      const op = restyle(element);
      if (op)
        ops.push(op);
    }
    if (ops.length)
      queue.push({ k: "ops", ops });
  };
  const sweep = () => {
    if (!running)
      return;
    sweepShadows();
    const ops = [];
    for (const [id, entry] of styles) {
      const element = entry.node.deref();
      if (!element || !element.isConnected) {
        styles.delete(id);
        continue;
      }
      let count = 0;
      try {
        count = element.sheet?.cssRules.length ?? 0;
      } catch {
        continue;
      }
      if (count !== entry.rules) {
        const op = restyle(element);
        if (op)
          ops.push(op);
      }
    }
    for (const [id, entry] of controls) {
      const element = entry.node.deref();
      if (!element || !element.isConnected) {
        controls.delete(id);
        continue;
      }
      const state = formState(element);
      if (state !== null && state !== entry.state) {
        entry.state = state;
        ops.push(["v", id, JSON.parse(state)]);
      }
    }
    const nextAdopted = adoptedText(document.adoptedStyleSheets);
    if (nextAdopted !== adopted) {
      adopted = nextAdopted;
      ops.push(["A", adopted]);
    }
    for (const [id, ref] of unsized) {
      const image = ref.deref();
      if (!image || !image.isConnected) {
        unsized.delete(id);
        continue;
      }
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        unsized.delete(id);
        ops.push(["n", id, image.naturalWidth, image.naturalHeight]);
      }
    }
    for (const [id, ref] of undefinedCustom) {
      const element = ref.deref();
      if (!element || !element.isConnected) {
        undefinedCustom.delete(id);
        continue;
      }
      const name = element.localName;
      if (!definedNames.has(name) && !element.matches(":defined"))
        continue;
      undefinedCustom.delete(id);
      if (definedNames.has(name))
        continue;
      definedNames.add(name);
      ops.push(["d", id]);
    }
    const width = document.documentElement.clientWidth;
    if (width !== layoutWidth) {
      layoutWidth = width;
      ops.push(["w", width]);
    }
    if (ops.length)
      queue.push({ k: "ops", ops });
  };
  let lastShadowSweep = 0;
  const sweepShadows = () => {
    const now = Date.now();
    if (now - lastShadowSweep < 1000)
      return;
    lastShadowSweep = now;
    const ops = [];
    const full = now - lastFullShadowSweep >= (described < 30000 ? 1000 : 1e4);
    if (full)
      lastFullShadowSweep = now;
    const candidates = full ? Array.from(document.querySelectorAll("*")) : [];
    for (const ref of shadowless) {
      const element = ref.deref();
      if (!element || !element.isConnected) {
        shadowless.delete(ref);
        continue;
      }
      if (!full)
        candidates.push(element);
    }
    for (const element of candidates) {
      const shadow = element.shadowRoot;
      if (!shadow)
        continue;
      if (observedShadows.has(shadow) || !sent.has(element) || detached.has(element))
        continue;
      observedShadows.add(shadow);
      observer.observe(shadow, { childList: true, attributes: true, characterData: true, subtree: true });
      ops.push(["S", ids.get(element), childList(shadow, nsOf(element))]);
    }
    if (ops.length)
      queue.push({ k: "ops", ops });
  };
  const focusedId = () => {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement)
      element = element.shadowRoot.activeElement;
    if (!element || element === document.body || element === document.documentElement || !sent.has(element))
      return 0;
    return ids.get(element) ?? 0;
  };
  let lastFocus = 0;
  const onFocus = () => {
    if (!running)
      return;
    const id = focusedId();
    if (id === lastFocus)
      return;
    lastFocus = id;
    queue.push({ k: "ops", ops: [["f", id]] });
  };
  const onFocusIn = () => queueMicrotask(onFocus);
  const onFocusOut = () => {
    setTimeout(onFocus, 0);
  };
  const onValue = (event) => {
    if (!running)
      return;
    const element = event.composedPath()[0];
    if (!(element instanceof Element))
      return;
    const id = ids.get(element);
    const entry = id ? controls.get(id) : undefined;
    if (!id || !entry)
      return;
    const state = formState(element);
    if (state === null || state === entry.state)
      return;
    entry.state = state;
    queue.push({ k: "ops", ops: [["v", id, JSON.parse(state)]] });
  };
  let layoutWidth = 0;
  const scrolls = new Map;
  let scrollTimer = null;
  const onScroll = (event) => {
    if (!running)
      return;
    const target = event.target;
    const element = target === document || target === window ? null : target;
    if (element && !sent.has(element))
      return;
    const id = element ? ids.get(element) : 0;
    scrolls.set(id, element ? [element.scrollLeft, element.scrollTop] : [window.scrollX, window.scrollY]);
    scrollTimer ??= setTimeout(() => {
      scrollTimer = null;
      const ops = Array.from(scrolls, ([key, [left, top]]) => ["x", key, Math.round(left), Math.round(top)]);
      scrolls.clear();
      if (ops.length)
        queue.push({ k: "ops", ops });
    }, 50);
  };
  const snapshot = () => {
    styles.clear();
    controls.clear();
    patchNodes.clear();
    unsized.clear();
    definedNames.clear();
    undefinedCustom.clear();
    shadowless.clear();
    described = 0;
    adopted = adoptedText(document.adoptedStyleSheets);
    const root = document.documentElement ? serialize(document.documentElement, null) : null;
    lastFocus = focusedId();
    layoutWidth = document.documentElement.clientWidth;
    return {
      k: "snap",
      url: location.href,
      title: document.title,
      quirks: document.compatMode === "BackCompat",
      root,
      adopted,
      scroll: [Math.round(window.scrollX), Math.round(window.scrollY)],
      focus: lastFocus,
      lw: layoutWidth
    };
  };
  observer = new MutationObserver(flush);
  let sweeper = null;
  const api = {
    start() {
      if (running)
        observer.takeRecords();
      running = true;
      queue = [snapshot()];
      observer.observe(document, { childList: true, attributes: true, characterData: true, subtree: true });
      if (!sweeper) {
        document.addEventListener("scroll", onScroll, { capture: true, passive: true });
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("focusout", onFocusOut, true);
        document.addEventListener("input", onValue, true);
        document.addEventListener("change", onValue, true);
        sweeper = setInterval(sweep, 400);
      }
    },
    stop() {
      running = false;
      observer.disconnect();
      if (sweeper)
        clearInterval(sweeper);
      sweeper = null;
      document.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("input", onValue, true);
      document.removeEventListener("change", onValue, true);
      queue = [];
    },
    drain() {
      flush(observer.takeRecords());
      if (!queue.length)
        return "";
      const out = JSON.stringify(queue);
      queue = [];
      return out;
    },
    locate(id, rect, fx, fy) {
      const node = byId.get(id)?.deref();
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement ?? null;
      if (!element || !element.isConnected)
        return null;
      const box = () => {
        const rects = element.getClientRects();
        const chosen = rect >= 0 && rect < rects.length ? rects[rect] : element.getBoundingClientRect();
        return chosen.width > 0 || chosen.height > 0 ? chosen : null;
      };
      const point = (chosen) => [
        chosen.left + Math.min(Math.max(fx, 0), 1) * chosen.width,
        chosen.top + Math.min(Math.max(fy, 0), 1) * chosen.height
      ];
      let chosen = box();
      if (!chosen)
        return null;
      let [x, y] = point(chosen);
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
        element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        chosen = box();
        if (!chosen)
          return null;
        [x, y] = point(chosen);
      }
      return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
    },
    select(id, index) {
      const element = byId.get(id)?.deref();
      if (!(element instanceof HTMLSelectElement) || element.disabled || index < -1 || index >= element.options.length)
        return false;
      if (element.selectedIndex === index)
        return true;
      element.selectedIndex = index;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    scrollTo(id, left, top) {
      if (id === 0) {
        window.scrollTo({ left, top, behavior: "instant" });
        return true;
      }
      const element = byId.get(id)?.deref();
      if (!(element instanceof Element))
        return false;
      element.scrollTo({ left, top, behavior: "instant" });
      return true;
    },
    patches() {
      const out = [];
      const width = window.innerWidth;
      const height = window.innerHeight;
      for (const [id, ref] of patchNodes) {
        const element = ref.deref();
        if (!element || !element.isConnected) {
          patchNodes.delete(id);
          continue;
        }
        const box = element.getBoundingClientRect();
        const left = Math.max(box.left, 0);
        const top = Math.max(box.top, 0);
        const right = Math.min(box.right, width);
        const bottom = Math.min(box.bottom, height);
        if (right - left < 2 || bottom - top < 2)
          continue;
        if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
          continue;
        const r = (value) => Math.round(value * 100) / 100;
        out.push([id, r(left + window.scrollX), r(top + window.scrollY), r(right - left), r(bottom - top), r(left - box.left), r(top - box.top), element.localName]);
      }
      return { view: [width, height], list: out };
    },
    loaded(url) {
      if (finished.has(url) || performance.getEntriesByName(url).length > 0)
        return true;
      for (const sheet of Array.from(document.styleSheets))
        if (sheet.href === url)
          return true;
      for (const image of Array.from(document.images))
        if (image.currentSrc === url && image.complete && image.naturalWidth > 0)
          return true;
      return false;
    },
    rects(selector) {
      return Array.from(document.querySelectorAll(selector)).slice(0, 200).map((element) => {
        const box = element.getBoundingClientRect();
        const r = (value) => Math.round(value * 10) / 10;
        return [r(box.top + window.scrollY), r(box.left + window.scrollX), r(box.width), r(box.height)];
      });
    },
    node(id) {
      return byId.get(id)?.deref() ?? null;
    },
    idOf(node) {
      return ids.get(node) ?? null;
    }
  };
  world.__cloakMirror = api;
}

// service/mirror.ts
var RECORDER = `(${mirrorRecorder.toString()})();`;
var WORLD = "cloak-mirror";
var DRAIN_MS = 50;
var VIEWER_GONE_MS2 = 20000;
var WAIT_MAX_MS = 15000;
var LOG_BYTES_MAX = 6000000;
var RESOURCES_BYTES_MAX = 5000000;
var RESOURCE_BYTES_MAX = 4000000;
var CACHE_BYTES_MAX = 150000000;
var PATCH_SCAN_MS = 250;
var PATCH_MOVING_MS = 250;
var PATCH_STILL_MS = 1000;
var SNAPSHOT_BYTES_MAX = 5000000;
var INLINE_CSS_BYTES_MAX = 2000000;
var INLINE_CSS_WAIT_MS = 2000;
var RESOURCE_WAIT_MS = 1500;
var RESOURCE_FETCHES = 6;
var PATCH_BYTES_MAX = 2000000;
var PATCH_QUALITY = 75;
var isText2 = (mime) => mime === "text/css" || mime === "image/svg+xml" || mime.startsWith("text/");
var sleep3 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Mirror {
  browser;
  run = randomUUID();
  tab = null;
  contextId = null;
  doc = 0;
  seq = 0;
  log = [];
  logBytes = 0;
  lastViewerAt = 0;
  draining = false;
  injecting = null;
  waiters = new Set;
  cache = new Map;
  cacheBytes = 0;
  mimeTypes = new Map;
  patches = new Map;
  patchSeq = 0;
  patchScanAt = 0;
  coverage = 0;
  tooBig = false;
  patchesWantedAt = 0;
  sheetsSent = new Set;
  constructor(browser) {
    this.browser = browser;
    browser.onShown((tab) => this.retarget(tab));
    browser.onCdpEvent((event) => {
      if (!this.tab || event.sessionId !== this.tab.sessionId)
        return;
      if (event.method === "Page.frameNavigated") {
        const frame = event.params.frame;
        if (!frame.parentId)
          this.retarget(this.tab);
      }
    });
  }
  get watched() {
    return Date.now() - this.lastViewerAt < VIEWER_GONE_MS2;
  }
  async events(afterSeq, waitMs, run, patchAfterSeq = 0, picture = false) {
    const known = run === this.run;
    const after = known ? afterSeq : 0;
    const patchAfter = known ? patchAfterSeq : 0;
    this.lastViewerAt = Date.now();
    if (!picture)
      this.patchesWantedAt = Date.now();
    this.browser.start().catch(() => {});
    if (!this.tab && this.browser.shown)
      this.retarget(this.browser.shown);
    this.kick();
    const news = () => {
      const snapshotAt = this.log.find((entry) => entry.message.k === "snap")?.seq ?? Infinity;
      if (this.log.length && (after < snapshotAt || this.seq > after))
        return true;
      return after >= snapshotAt && this.patchSeq > patchAfter;
    };
    if (!news())
      await this.next(Math.min(Math.max(waitMs, 0), WAIT_MAX_MS));
    this.lastViewerAt = Date.now();
    const snapshot = this.log.findIndex((entry) => entry.message.k === "snap");
    const tab = this.tab?.id ?? null;
    if (snapshot === -1)
      return { run: this.run, tab, doc: this.doc, from: this.seq + 1, seq: this.seq, reset: false, messages: [], patches: [], patchSeq: patchAfter, coverage: this.coverage };
    const reset = after < this.log[snapshot].seq;
    const from = reset ? snapshot : this.log.findIndex((entry) => entry.seq > after);
    const messages = from === -1 ? [] : this.log.slice(from).map((entry) => entry.message);
    const { patches, patchSeq } = this.patchesAfter(reset ? 0 : patchAfter);
    return { run: this.run, tab, doc: this.doc, from: from === -1 ? this.seq + 1 : this.log[from].seq, seq: this.seq, reset, messages, patches, patchSeq, coverage: this.coverage };
  }
  patchesAfter(after) {
    const newer = [...this.patches.values()].filter((patch) => patch.seq > after).sort((a, b) => a.seq - b.seq);
    const patches = [];
    let bytes = 0;
    let patchSeq = after;
    for (const { hash: _hash, at: _at, ...patch } of newer) {
      if (patches.length && bytes + patch.data.length > PATCH_BYTES_MAX)
        break;
      patches.push(patch);
      bytes += patch.data.length;
      patchSeq = patch.seq;
    }
    if (patches.length === newer.length)
      patchSeq = Math.max(patchSeq, this.patchSeq);
    return { patches, patchSeq };
  }
  get document() {
    return this.doc;
  }
  async locate(doc, id, rect, fx, fy) {
    const value = await this.call(doc, `locate(${id}, ${rect}, ${fx}, ${fy})`);
    return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && Number.isFinite(n)) ? value : null;
  }
  async select(doc, id, index) {
    return await this.call(doc, `select(${id}, ${index})`) === true;
  }
  async scrollTo(doc, id, left, top) {
    return await this.call(doc, `scrollTo(${id}, ${left}, ${top})`) === true;
  }
  async rects(selector) {
    return this.call(this.doc, `rects(${JSON.stringify(selector)})`);
  }
  async call(doc, call) {
    const tab = this.tab;
    const cdp = this.browser.cdp;
    if (doc !== this.doc || this.contextId === null || !tab?.sessionId || !cdp)
      return null;
    try {
      const answer = await cdp.send("Runtime.evaluate", { expression: `globalThis.__cloakMirror ? globalThis.__cloakMirror.${call} : null`, contextId: this.contextId, returnByValue: true }, tab.sessionId, 3000);
      return answer.exceptionDetails ? null : answer.result?.value ?? null;
    } catch {
      return null;
    }
  }
  async resources(urls) {
    const resources = {};
    const later = [];
    let bytes = 0;
    const queue = [...urls];
    const worker = async () => {
      for (let url = queue.shift();url !== undefined; url = queue.shift()) {
        if (bytes > RESOURCES_BYTES_MAX) {
          later.push(url);
          continue;
        }
        const resource = await this.resource(url).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
        if (!resource) {
          resources[url] = { error: "not found" };
          continue;
        }
        if ("error" in resource) {
          resources[url] = resource;
          continue;
        }
        resources[url] = isText2(resource.mime) ? { mime: resource.mime, text: Buffer.from(resource.data, "base64").toString("utf8") } : resource;
        if (resource.mime === "text/css")
          this.sheetsSent.add(url);
        bytes += resource.data.length;
      }
    };
    await Promise.all(Array.from({ length: Math.min(RESOURCE_FETCHES, urls.length) }, worker));
    return { resources, later };
  }
  async release() {
    await this.stopRecorder(this.tab, this.contextId);
    this.contextId = null;
  }
  async stopRecorder(tab, contextId) {
    if (!tab?.sessionId || contextId === null || !this.browser.cdp)
      return;
    await this.browser.cdp.send("Runtime.evaluate", { expression: "globalThis.__cloakMirror && globalThis.__cloakMirror.stop()", contextId }, tab.sessionId, 3000).catch(() => {});
  }
  retarget(tab) {
    if (this.tab && this.tab !== tab)
      this.stopRecorder(this.tab, this.contextId);
    this.tab = tab;
    this.contextId = null;
    this.doc += 1;
    this.mimeTypes = new Map;
    this.patches = new Map;
    this.coverage = 0;
    this.tooBig = false;
    this.log = [];
    this.logBytes = 0;
    this.wake();
    this.kick();
  }
  append(message) {
    let text = JSON.stringify(message);
    const snapshot = message.k === "snap";
    if (snapshot) {
      this.log = [];
      this.logBytes = 0;
      this.tooBig = text.length > SNAPSHOT_BYTES_MAX;
      if (this.tooBig) {
        const { url, title } = message;
        message = { k: "snap", url, title, quirks: false, root: null, adopted: "", scroll: [0, 0] };
        text = JSON.stringify(message);
        this.coverage = 1;
      }
    } else if (this.tooBig) {
      return;
    }
    this.seq += 1;
    this.log.push({ seq: this.seq, message, bytes: text.length });
    this.logBytes += text.length;
  }
  wake() {
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const wake of waiters)
      wake();
  }
  next(ms) {
    if (ms <= 0)
      return Promise.resolve();
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
  kick() {
    if (this.draining || !this.watched)
      return;
    this.draining = true;
    this.loop().finally(() => {
      this.draining = false;
    });
  }
  async loop() {
    while (this.watched) {
      const tab = this.tab;
      const cdp = this.browser.cdp;
      if (!tab || !cdp || this.browser.phase !== "running") {
        await sleep3(200);
        if (!this.tab && this.browser.shown)
          this.retarget(this.browser.shown);
        continue;
      }
      if (this.contextId === null) {
        this.injecting ??= this.inject(tab).finally(() => {
          this.injecting = null;
        });
        await this.injecting;
        if (this.contextId === null) {
          await sleep3(200);
          continue;
        }
      }
      const doc = this.doc;
      let text = "";
      try {
        const answer = await cdp.send("Runtime.evaluate", { expression: "globalThis.__cloakMirror ? globalThis.__cloakMirror.drain() : null", contextId: this.contextId, returnByValue: true }, tab.sessionId ?? undefined, 5000);
        if (answer.result?.value === null || answer.exceptionDetails) {
          this.contextId = null;
          continue;
        }
        text = typeof answer.result?.value === "string" ? answer.result.value : "";
      } catch {
        this.contextId = null;
        await sleep3(100);
        continue;
      }
      if (doc === this.doc && text) {
        for (const message of JSON.parse(text)) {
          if (message.k === "snap")
            await this.inlineSheets(message);
          if (doc !== this.doc)
            break;
          this.append(message);
        }
        if (this.logBytes > LOG_BYTES_MAX)
          await this.restart(tab);
        this.wake();
      }
      if (doc === this.doc && Date.now() - this.patchScanAt >= PATCH_SCAN_MS) {
        this.patchScanAt = Date.now();
        if (await this.capturePatches(tab, doc))
          this.wake();
      }
      await sleep3(DRAIN_MS);
    }
    await this.stopRecorder(this.tab, this.contextId);
    this.contextId = null;
  }
  async inlineSheets(snapshot) {
    const links = [];
    const walk = (node) => {
      if (!node || typeof node !== "object")
        return;
      if (node.n === "link" && node.a?.href && /^https?:/i.test(node.a.href) && !this.sheetsSent.has(node.a.href))
        links.push(node);
      for (const child of node.c ?? [])
        walk(child);
      for (const child of node.s ?? [])
        walk(child);
    };
    walk(snapshot.root);
    const until = Date.now() + INLINE_CSS_WAIT_MS;
    const fetched = await Promise.all(links.map((link) => this.loadedResource(link.a?.href, until).catch(() => null)));
    let bytes = 0;
    links.forEach((link, index) => {
      const found = fetched[index];
      if (!found)
        return;
      const resource = found.mime === "text/css" ? found : absoluteCss(link.a?.href, { mime: "text/css", data: found.data });
      const css = Buffer.from(resource.data, "base64").toString("utf8");
      if (bytes + css.length > INLINE_CSS_BYTES_MAX)
        return;
      bytes += css.length;
      link.css = css;
      this.sheetsSent.add(link.a?.href);
    });
  }
  async capturePatches(tab, doc) {
    const cdp = this.browser.cdp;
    const found = await this.call(doc, "patches()");
    const list = Array.isArray(found?.list) ? found.list : [];
    const area = found?.view ? found.view[0] * found.view[1] : 0;
    const coverage = area > 0 ? Math.min(1, list.reduce((sum, entry) => sum + entry[3] * entry[4], 0) / area) : 0;
    let changed = Math.abs(coverage - this.coverage) > 0.05;
    this.coverage = this.tooBig ? 1 : Math.round(coverage * 100) / 100;
    if (!cdp || !tab.sessionId || !list.length || Date.now() - this.patchesWantedAt > VIEWER_GONE_MS2)
      return changed;
    for (const entry of list) {
      const [id, x, y, w, h, dx, dy, tag] = entry;
      const known = this.patches.get(id);
      const every = tag === "canvas" || tag === "video" ? PATCH_MOVING_MS : PATCH_STILL_MS;
      const moved = !known || known.dx !== dx || known.dy !== dy || known.w !== w || known.h !== h;
      if (!moved && Date.now() - known.at < every)
        continue;
      const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: PATCH_QUALITY, clip: { x, y, width: w, height: h, scale: 1 }, captureBeyondViewport: false }, tab.sessionId, 3000).catch(() => null);
      if (!shot || doc !== this.doc)
        return changed;
      const hash = createHash2("sha1").update(shot.data).digest("base64");
      if (known && !moved && known.hash === hash) {
        known.at = Date.now();
        continue;
      }
      this.patchSeq += 1;
      this.patches.set(id, { id, seq: this.patchSeq, mime: "image/jpeg", data: shot.data, dx, dy, w, h, hash, at: Date.now() });
      changed = true;
    }
    return changed;
  }
  async inject(tab) {
    const cdp = this.browser.cdp;
    if (!cdp)
      return;
    try {
      const session = await this.browser.sessionOf(tab);
      const { frameTree } = await cdp.send("Page.getFrameTree", {}, session);
      const { executionContextId } = await cdp.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: WORLD }, session);
      await cdp.send("Runtime.evaluate", { expression: `${RECORDER}
globalThis.__cloakMirror.start();`, contextId: executionContextId }, session, 1e4);
      if (this.tab === tab)
        this.contextId = executionContextId;
    } catch {}
  }
  async restart(tab) {
    if (this.contextId === null || !this.browser.cdp)
      return;
    await this.browser.cdp.send("Runtime.evaluate", { expression: "globalThis.__cloakMirror.start()", contextId: this.contextId }, tab.sessionId ?? undefined, 5000).catch(() => {});
  }
  remember(url, resource) {
    this.cache.set(url, resource);
    this.cacheBytes += resource.data.length;
    for (const [key, value] of this.cache) {
      if (this.cacheBytes <= CACHE_BYTES_MAX)
        break;
      this.cache.delete(key);
      this.cacheBytes -= value.data.length;
    }
  }
  async loadedResource(url, until) {
    for (;; ) {
      const cached = this.cache.get(url);
      if (cached)
        return cached;
      const tab = this.tab;
      const cdp = this.browser.cdp;
      if (!tab?.sessionId || !cdp)
        return null;
      const whole = await this.call(this.doc, `loaded(${JSON.stringify(url)})`) === true;
      if (!whole) {
        if (Date.now() >= until)
          return null;
        await sleep3(100);
        continue;
      }
      try {
        const { frameTree } = await cdp.send("Page.getFrameTree", {}, tab.sessionId);
        const answer = await cdp.send("Page.getResourceContent", { frameId: frameTree.frame.id, url }, tab.sessionId, 3000);
        const data = answer.base64Encoded ? answer.content : Buffer.from(answer.content, "utf8").toString("base64");
        if (data.length > RESOURCE_BYTES_MAX * 1.4)
          return null;
        const resource = absoluteCss(url, { mime: await this.mimeOf(frameTree.frame.id, url, tab.sessionId), data });
        this.remember(url, resource);
        return resource;
      } catch {}
      if (Date.now() >= until)
        return null;
      await sleep3(100);
    }
  }
  async resource(url) {
    const cached = this.cache.get(url);
    if (cached) {
      this.cache.delete(url);
      this.cache.set(url, cached);
      return cached;
    }
    const loading = await this.loadedResource(url, Date.now() + RESOURCE_WAIT_MS).catch(() => null);
    if (loading)
      return loading;
    const tab = this.tab ?? this.browser.shown;
    const cdp = this.browser.cdp;
    if (!tab || !cdp)
      return null;
    const session = await this.browser.sessionOf(tab);
    const { frameTree } = await cdp.send("Page.getFrameTree", {}, session);
    const frameId = frameTree.frame.id;
    const loaded = await cdp.send("Network.loadNetworkResource", { frameId, url, options: { disableCache: false, includeCredentials: true } }, session, 15000);
    if (!loaded.resource.success || !loaded.resource.stream)
      return null;
    const chunks = [];
    let total = 0;
    try {
      for (;; ) {
        const part = await cdp.send("IO.read", { handle: loaded.resource.stream, size: 1048576 }, session, 15000);
        const bytes = part.base64Encoded ? Buffer.from(part.data, "base64") : Buffer.from(part.data, "utf8");
        chunks.push(bytes);
        total += bytes.length;
        if (total > RESOURCE_BYTES_MAX)
          return null;
        if (part.eof)
          break;
      }
    } finally {
      await cdp.send("IO.close", { handle: loaded.resource.stream }, session).catch(() => {});
    }
    const headers = loaded.resource.headers ?? {};
    const type = Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
    const resource = absoluteCss(url, { mime: type.split(";")[0].trim() || guessMime(url), data: Buffer.concat(chunks).toString("base64") });
    this.remember(url, resource);
    return resource;
  }
  async mimeOf(frameId, url, session) {
    if (!this.mimeTypes.has(url) && this.browser.cdp) {
      try {
        const { frameTree } = await this.browser.cdp.send("Page.getResourceTree", {}, session);
        for (const entry of frameTree.resources ?? [])
          this.mimeTypes.set(entry.url, entry.mimeType);
      } catch {}
    }
    return this.mimeTypes.get(url) || guessMime(url);
  }
}
var absoluteCss = (url, resource) => {
  if (resource.mime !== "text/css")
    return resource;
  const resolve = (value) => {
    if (!value || /^(data:|blob:|#|about:)/i.test(value))
      return value;
    try {
      return new URL(value, url).href;
    } catch {
      return value;
    }
  };
  const css = Buffer.from(resource.data, "base64").toString("utf8").replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (_match, _quote, value) => `url("${resolve(value)}")`).replace(/@import\s+(['"])([^'"]+)\1/g, (_match, _quote, value) => `@import url("${resolve(value)}")`);
  return { mime: resource.mime, data: Buffer.from(css, "utf8").toString("base64") };
};
var guessMime = (url) => {
  const path = url.split(/[?#]/)[0].toLowerCase();
  const ext = path.slice(path.lastIndexOf(".") + 1);
  return {
    css: "text/css",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    woff2: "font/woff2",
    woff: "font/woff",
    ttf: "font/ttf",
    otf: "font/otf"
  }[ext] ?? "application/octet-stream";
};

// service/mirror-input.ts
var EVENTS_MAX = 500;
var TEXT_MAX = 1e5;
var num = (value) => typeof value === "number" && Number.isFinite(value);
var int = (value) => Number.isInteger(value);
var str = (value, max) => typeof value === "string" && value.length <= max;
var readModifiers2 = (value) => {
  const m = value;
  if (!m || typeof m !== "object")
    return null;
  return { alt: m.alt === true, ctrl: m.ctrl === true, meta: m.meta === true, shift: m.shift === true };
};
var readPlaced = (e) => {
  if (!int(e.id) || !int(e.r) || !num(e.fx) || !num(e.fy) || !num(e.x) || !num(e.y))
    return null;
  return { id: e.id, r: e.r, fx: e.fx, fy: e.fy, x: e.x, y: e.y };
};
var readEvent2 = (value) => {
  const e = value;
  if (!e || typeof e !== "object")
    return null;
  switch (e.type) {
    case "pointer": {
      const placed = readPlaced(e);
      const modifiers = readModifiers2(e.modifiers);
      if (!placed || !modifiers || e.action !== "down" && e.action !== "up" && e.action !== "move" || !int(e.button) || !int(e.buttons))
        return null;
      return { type: "pointer", action: e.action, button: e.button, buttons: e.buttons, modifiers, ...placed };
    }
    case "wheel": {
      const placed = readPlaced(e);
      const modifiers = readModifiers2(e.modifiers);
      if (!placed || !modifiers || !num(e.deltaX) || !num(e.deltaY))
        return null;
      return { type: "wheel", deltaX: e.deltaX, deltaY: e.deltaY, modifiers, ...placed };
    }
    case "key": {
      const modifiers = readModifiers2(e.modifiers);
      if (!modifiers || e.action !== "down" && e.action !== "up" || !str(e.key, 64) || !str(e.code, 64))
        return null;
      return { type: "key", action: e.action, key: e.key, code: e.code, ...int(e.keyCode) && e.keyCode >= 0 && e.keyCode <= 255 ? { keyCode: e.keyCode } : {}, modifiers };
    }
    case "text":
      return str(e.text, TEXT_MAX) && e.text ? { type: "text", text: e.text } : null;
    case "select":
      return int(e.id) && int(e.index) ? { type: "select", id: e.id, index: e.index } : null;
    case "scroll":
      return int(e.id) && num(e.left) && num(e.top) ? { type: "scroll", id: e.id, left: Math.round(e.left), top: Math.round(e.top) } : null;
    default:
      return null;
  }
};
var readMirrorInput = (body) => {
  const b = body;
  if (!b || typeof b !== "object" || !int(b.doc) || !str(b.viewer, 100) || !b.viewer || !Array.isArray(b.events) || b.events.length > EVENTS_MAX)
    return null;
  const events = [];
  for (const value of b.events) {
    const event = readEvent2(value);
    if (!event)
      return null;
    events.push(event);
  }
  return { doc: b.doc, viewer: b.viewer, events };
};
var applyMirrorInput = async (input, mirror, surface, control) => {
  const isMove = (event) => event.type === "pointer" && event.action === "move";
  if (input.events.some((event) => !isMove(event)) && !control.userActs(input.viewer))
    throw new Error("Another device has control");
  const looks = control.userLooks(input.viewer);
  let batch = [];
  const flush = async () => {
    if (!batch.length)
      return;
    const events = batch;
    batch = [];
    await surface.input(events, { css: true });
  };
  for (const event of input.events) {
    if (isMove(event) && !looks)
      continue;
    switch (event.type) {
      case "pointer":
      case "wheel": {
        const current = input.doc === -1 || input.doc === mirror.document;
        if (!current && !(event.type === "pointer" && event.action === "up"))
          continue;
        const placed = current && event.r !== -2 && input.doc !== -1 ? await mirror.locate(input.doc, event.id, event.r, event.fx, event.fy) : null;
        const [x, y] = placed ?? [event.x, event.y];
        if (event.type === "pointer") {
          batch.push({ type: "pointer", action: event.action, x, y, button: event.button, buttons: event.buttons, modifiers: event.modifiers });
        } else {
          batch.push({ type: "wheel", x, y, deltaX: event.deltaX, deltaY: event.deltaY, modifiers: event.modifiers });
        }
        break;
      }
      case "key":
        batch.push({ type: "key", action: event.action, key: event.key, code: event.code, ...event.keyCode !== undefined ? { keyCode: event.keyCode } : {}, modifiers: event.modifiers });
        break;
      case "text":
        batch.push({ type: "text", text: event.text });
        break;
      case "select":
        await flush();
        await mirror.select(input.doc, event.id, event.index);
        break;
      case "scroll":
        await flush();
        await mirror.scrollTo(input.doc, event.id, event.left, event.top);
        break;
      default:
    }
  }
  await flush();
};

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
var PICTURE_IDLE_MS = 30000;
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
  pictureAt = 0;
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
    const watched = this.pictureWatched;
    this.pictureAt = Date.now();
    if (!watched && this.browser.shown)
      this.recast(this.browser.shown);
    const wait = clamp(waitMs, 0, FRAME_WAIT_MAX_MS);
    if (this.seq <= after && wait > 0)
      await this.next(wait);
    if (this.seq <= after)
      return null;
    const title = this.title();
    this.shownTitle = title;
    return { frame: this.current(), seq: this.seq, title, agentActive: this.agentActive };
  }
  async input(events, options = {}) {
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
      await this.browser.untilDialog(tab, this.dispatch(cdp, session, event, options.css === true));
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
  get pageSize() {
    return { width: this.cssWidth, height: this.cssHeight };
  }
  noteAgent() {
    this.agentUntil = Date.now() + 4000;
  }
  get agentActive() {
    return Date.now() < this.agentUntil;
  }
  get pictureWatched() {
    return Date.now() - this.pictureAt < PICTURE_IDLE_MS;
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
    if (!this.pictureWatched) {
      this.browser.cdp?.send("Page.stopScreencast", {}, event.sessionId).catch(() => {});
      return;
    }
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
    if (!this.pictureWatched)
      return;
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
  async dispatch(cdp, sessionId, event, css) {
    switch (event.type) {
      case "pointer":
        return this.pointer(cdp, sessionId, event, css);
      case "wheel": {
        const { x, y } = css ? event : this.toPage(event.x, event.y);
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
  async pointer(cdp, sessionId, event, css) {
    const { x, y } = css ? event : this.toPage(event.x, event.y);
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
    const location2 = locationOf(code);
    if (event.action === "up") {
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, modifiers, location: location2 }, sessionId);
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
      location: location2,
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
var mirror = new Mirror(browser);
var control = new Control(() => mirror.wake());
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
    case "GET /state": {
      browser.start().catch(() => {});
      await browser.refresh();
      const viewer = url.searchParams.get("viewer") ?? "";
      control.see(viewer);
      return send(res, 200, {
        ...browser.state(),
        ...surface.stripState(),
        youControl: req.headers[SURFACE_VIEWER_CONTROLS_HEADER] === "1",
        control: control.state(viewer),
        agentActive: surface.agentActive
      });
    }
    case "POST /control": {
      const body = await readJson(req);
      if (body?.action === "release" && typeof body.viewer === "string")
        control.release(body.viewer);
      return send(res, 200, { ok: true });
    }
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
    case "GET /mirror/events": {
      const after = Number(url.searchParams.get("after")) || 0;
      const wait = Number(url.searchParams.get("wait")) || 0;
      const patch = Number(url.searchParams.get("patch")) || 0;
      return send(res, 200, await mirror.events(after, wait, url.searchParams.get("run") ?? "", patch, url.searchParams.get("mode") === "picture"));
    }
    case "GET /mirror/picture": {
      const after = Number(url.searchParams.get("after")) || 0;
      const wait = Math.min(15000, Number(url.searchParams.get("wait")) || 0);
      const answer = await surface.frameAfter(after, wait);
      if (!answer)
        return send(res, 200, { seq: after });
      const { width, height } = surface.pageSize;
      return send(res, 200, {
        seq: answer.seq,
        mime: answer.frame.mime,
        data: answer.frame.bytes.toString("base64"),
        width: answer.frame.width,
        height: answer.frame.height,
        pageWidth: width,
        pageHeight: height,
        agentActive: answer.agentActive
      });
    }
    case "POST /mirror/input": {
      const input = readMirrorInput(await readJson(req));
      if (!input)
        return send(res, 400, { ok: false, error: "Not mirror input" });
      return command(res, () => applyMirrorInput(input, mirror, surface, control));
    }
    case "GET /mirror/rects":
      return send(res, 200, { rects: await mirror.rects(url.searchParams.get("selector") ?? "") });
    case "POST /mirror/wake":
      mirror.wake();
      return send(res, 200, { ok: true });
    case "POST /mirror/resources": {
      const body = await readJson(req);
      const urls = Array.isArray(body?.urls) ? body.urls.filter((value) => typeof value === "string" && /^https?:/i.test(value)).slice(0, 200) : [];
      return send(res, 200, await mirror.resources(urls));
    }
    case "POST /mirror/view": {
      const body = await readJson(req);
      const width = Number(body?.width);
      const height = Number(body?.height);
      const dpr = typeof body?.dpr === "number" && Number.isFinite(body.dpr) ? body.dpr : 1;
      if (!(width > 0 && height > 0))
        return send(res, 400, { ok: false, error: "width and height are required" });
      surface.viewer(dpr, body?.mac === true);
      return send(res, 200, { ok: true, ...surface.resize(width, height) });
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
      if (!control.agentActs())
        return send(res, 200, { ok: false, error: USER_HAS_CONTROL });
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
  const end = async () => {
    if (mirror.watched) {
      await mirror.release();
      if (await browser.handOver())
        return;
    }
    await browser.stop();
  };
  end().catch(() => {}).finally(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
