// The scripts the agent's browser actions run inside a page, adapted from OpenChamber's own browser panel
// (packages/ui/src/lib/browser/pageActions.ts, MIT, Copyright (c) 2025 Bohdan Triapitsyn), so the answers have the
// same shapes, caps and selectors as the panel's. They run in an isolated world (browser.ts, evaluate): the page's
// own scripts neither see them nor can shadow the DOM methods they use.
//
// Differences from the panel: a click and typing are not synthetic DOM events here. The scripts only find the
// element, bring it into view and focus it; the service then sends real input over CDP (agent.ts), which CloakBrowser
// delivers as a person's, so pages that check `isTrusted` behave as they would for one.
//
// Each builder returns a self-contained expression; inputs are embedded with JSON.stringify. Every script resolves
// to `{ ok, ... }` instead of throwing.

const MAX_TEXT_CHARS = 6_000;
const MAX_ELEMENTS = 120;
const MAX_LABEL_CHARS = 80;
const MAX_OPTION_COUNT = 32;
const SCROLL_SETTLE_MAX_MS = 100;

const HELPERS = `
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

const wrap = (body: string): string => `(() => {\n${HELPERS}\n${body}\n})()`;

export const snapshotScript = ({ selector }: { selector?: string } = {}): string => wrap(`
  var scopeSelector = ${JSON.stringify(selector ?? '')};
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

/** Finds what a click is for, brings it to the middle of the view, and answers where to press. */
export const locateScript = ({ selector, text }: { selector?: string; text?: string }): string => wrap(`
  var selector = ${JSON.stringify(selector ?? '')};
  var text = ${JSON.stringify(text ?? '')};
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

/** Focuses a text field and selects what it holds, so the text typed next replaces it. */
export const focusFieldScript = ({ selector }: { selector: string }): string => wrap(`
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

export const selectScript = ({ selector, label: optionLabel, value }: { selector: string; label?: string; value?: string }): string => {
  const hasLabel = optionLabel !== undefined;
  const hasValue = value !== undefined;
  const criterion = hasLabel === hasValue ? '' : hasLabel ? 'label' : 'value';
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

export const scrollScript = ({ selector, direction }: { selector?: string; direction?: string }): string => wrap(`
  var selector = ${JSON.stringify(selector ?? '')};
  var direction = ${JSON.stringify(direction ?? '')};
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

export const quietScript = ({ quietMs, maxMs }: { quietMs: number; maxMs: number }): string => wrap(`
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

const INSPECTED_STYLE_PROPS = [
  'color', 'background-color', 'background-image', 'opacity',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align',
  'border-radius', 'border-width', 'border-style', 'border-color', 'box-shadow',
  'display', 'position', 'width', 'height', 'padding', 'margin', 'gap',
  'flex-direction', 'justify-content', 'align-items', 'z-index', 'overflow', 'visibility',
];

export const inspectScript = ({ selector }: { selector: string }): string => wrap(`
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
