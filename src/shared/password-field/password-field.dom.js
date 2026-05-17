/* =========================================================
   Onion SPA - Shared Password Field DOM
   Archivo: src/shared/password-field/password-field.dom.js

   PASSWORD FIELD DOM · SIMPLE
   - binder DOM puro para campos password reutilizables
   - show/hide password sin innerHTML
   - CapsLock opcional
   - múltiples campos por vista
   - listeners deduplicados
   - cleanup real: destroy / unbind / off / dispose
   - sin AppCore, sin CSS inline, sin side effects al importar
========================================================= */

export const PASSWORD_FIELD_DOM_VERSION = "21.0.0-simple";

const FIELD_SELECTOR = "[data-password-field='true']";
const WRAPPER_SELECTOR = "[data-password-wrapper='true'],.password-wrapper,.auth-password-wrapper";
const INPUT_SELECTOR = "[data-password-input='true'],input[type='password'],input[type='text'][data-login-password='true']";
const TOGGLE_SELECTOR = "[data-password-toggle='true'],[data-login-password-toggle='true'],.password-toggle,.auth-password-toggle";
const TOGGLE_ICON_SELECTOR = "[data-password-toggle-icon='true'],.password-toggle-icon";
const CAPS_SELECTOR = "[data-password-caps='true'],[data-login-caps='true'],.password-caps,.caps-indicator,.auth-caps-indicator";

const BOUND_DATA_KEY = "passwordFieldBound";
const VISIBLE_DATA_KEY = "passwordVisible";
const CAPS_DATA_KEY = "capsLockActive";

const DEFAULT_SHOW_LABEL = "Mostrar contraseña";
const DEFAULT_HIDE_LABEL = "Ocultar contraseña";
const SVG_NS = "http://www.w3.org/2000/svg";

const FIELD_BINDINGS = new WeakMap();
const INPUT_BINDINGS = new WeakMap();
const TOGGLE_BINDINGS = new WeakMap();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function isElement(value) {
  try {
    return Boolean(value && value.nodeType === 1);
  } catch {
    return false;
  }
}

function isDocument(value) {
  try {
    return Boolean(value && value.nodeType === 9);
  } catch {
    return false;
  }
}

function isDocumentFragment(value) {
  try {
    return Boolean(value && value.nodeType === 11);
  } catch {
    return false;
  }
}

function isQueryable(value) {
  return Boolean(value && isFn(value.querySelector) && isFn(value.querySelectorAll));
}

function isHtmlInput(value) {
  try {
    return Boolean(value && value.tagName?.toLowerCase?.() === "input");
  } catch {
    return false;
  }
}

function isHtmlButton(value) {
  try {
    return Boolean(value && value.tagName?.toLowerCase?.() === "button");
  } catch {
    return false;
  }
}

function isConnected(value) {
  if (!value) return false;

  try {
    if (value === window || value === document || value === document.documentElement || value === document.body) return true;
    return Boolean(value.isConnected || document.contains(value));
  } catch {
    return false;
  }
}

function matches(element, selector = "") {
  if (!isElement(element) || !selector) return false;

  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function closest(element, selector = "") {
  if (!isElement(element) || !selector) return null;

  try {
    return element.closest(selector);
  } catch {
    return null;
  }
}

function query(root, selector = "") {
  if (!isQueryable(root) || !selector) return null;

  try {
    return root.querySelector(selector) || null;
  } catch {
    return null;
  }
}

function queryAll(root, selector = "") {
  if (!isQueryable(root) || !selector) return [];

  try {
    return Array.from(root.querySelectorAll(selector) || []);
  } catch {
    return [];
  }
}

function setAttr(element, name = "", value = null) {
  if (!isElement(element) || !name) return false;

  try {
    if (value === null || value === undefined || value === "") element.removeAttribute(name);
    else element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function setData(element, key = "", value = null) {
  if (!isElement(element) || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete element.dataset[key];
    else element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function toggleClass(element, className = "", enabled = false) {
  if (!isElement(element) || !className) return false;

  try {
    element.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function replaceChildrenSafe(element, children = []) {
  if (!isElement(element)) return false;

  const clean = Array.isArray(children) ? children.filter(Boolean) : [];

  try {
    element.replaceChildren(...clean);
    return true;
  } catch {}

  try {
    while (element.firstChild) element.removeChild(element.firstChild);
    for (const child of clean) element.appendChild(child);
    return true;
  } catch {
    return false;
  }
}

function focusInput(input) {
  if (!input) return false;

  try {
    input.focus({ preventScroll: true });
    return true;
  } catch {}

  try {
    input.focus();
    return true;
  } catch {
    return false;
  }
}

function activeElement() {
  if (!isBrowser()) return null;

  try {
    return document.activeElement || null;
  } catch {
    return null;
  }
}

function on(target, eventName, handler, options = false, disposers = []) {
  if (!target || !eventName || !isFn(handler) || !isFn(target.addEventListener)) return false;

  try {
    target.addEventListener(eventName, handler, options);
    disposers.push(() => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {}
    });
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SVG ICONS · DOM SAFE
========================================================= */

function svgElement(name = "svg", attrs = {}) {
  if (!isBrowser()) return null;

  try {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value !== null && value !== undefined && value !== "") node.setAttribute(key, String(value));
    }
    return node;
  } catch {
    return null;
  }
}

function svgPath(attrs = {}) {
  return svgElement("path", attrs);
}

function svgCircle(attrs = {}) {
  return svgElement("circle", attrs);
}

function createEyeIconNode() {
  const svg = svgElement("svg", {
    class: "password-eye-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true",
    focusable: "false",
    width: "18",
    height: "18",
  });

  if (!svg) return null;

  const path = svgPath({
    d: "M2.75 12s3.25-6 9.25-6 9.25 6 9.25 6-3.25 6-9.25 6-9.25-6-9.25-6Z",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linejoin": "round",
  });

  const circle = svgCircle({
    cx: "12",
    cy: "12",
    r: "2.7",
    stroke: "currentColor",
    "stroke-width": "1.8",
  });

  if (path) svg.appendChild(path);
  if (circle) svg.appendChild(circle);

  return svg;
}

function createEyeOffIconNode() {
  const svg = svgElement("svg", {
    class: "password-eye-off-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true",
    focusable: "false",
    width: "18",
    height: "18",
  });

  if (!svg) return null;

  const paths = [
    { d: "M3.5 4.5 20.5 19.5", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round" },
    { d: "M10.58 5.63A10.5 10.5 0 0 1 12 5.55c6 0 9.25 6 9.25 6a15.72 15.72 0 0 1-3.48 4.11", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" },
    { d: "M6.2 8.12A15.18 15.18 0 0 0 2.75 11.55s3.25 6 9.25 6c1.36 0 2.59-.3 3.7-.79", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" },
    { d: "M9.88 9.96A2.9 2.9 0 0 0 9.3 11.7a2.7 2.7 0 0 0 4.57 1.96", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" },
  ];

  for (const attrs of paths) {
    const path = svgPath(attrs);
    if (path) svg.appendChild(path);
  }

  return svg;
}

/* =========================================================
   FIELD RESOLUTION
========================================================= */

function findInput(root) {
  if (!root) return null;
  if (isHtmlInput(root) && matches(root, INPUT_SELECTOR)) return root;
  return query(root, INPUT_SELECTOR);
}

function findToggle(root) {
  if (!root) return null;
  if (isHtmlButton(root) && matches(root, TOGGLE_SELECTOR)) return root;
  return query(root, TOGGLE_SELECTOR);
}

function findCaps(root) {
  if (!root) return null;
  if (isElement(root) && matches(root, CAPS_SELECTOR)) return root;
  return query(root, CAPS_SELECTOR);
}

function findIconHolder(toggle) {
  if (!isHtmlButton(toggle)) return null;

  const existing = query(toggle, TOGGLE_ICON_SELECTOR);
  if (existing) return existing;

  try {
    const span = document.createElement("span");
    span.className = "password-toggle-icon";
    span.setAttribute("aria-hidden", "true");
    span.setAttribute("data-password-toggle-icon", "true");
    span.dataset.state = "hidden";
    replaceChildrenSafe(toggle, [span]);
    return span;
  } catch {
    return null;
  }
}

function resolveRoot(fieldRoot) {
  if (!fieldRoot) return null;
  if (matches(fieldRoot, FIELD_SELECTOR)) return fieldRoot;

  const explicit = closest(fieldRoot, FIELD_SELECTOR);
  if (explicit) return explicit;

  const wrapper = matches(fieldRoot, WRAPPER_SELECTOR) ? fieldRoot : closest(fieldRoot, WRAPPER_SELECTOR);
  if (wrapper) return closest(wrapper, FIELD_SELECTOR) || wrapper;

  return fieldRoot;
}

function resolveParts(fieldRoot) {
  const root = resolveRoot(fieldRoot);

  if (!root) {
    return { root: null, input: null, toggle: null, caps: null, icon: null };
  }

  const input = findInput(root);
  const toggle = findToggle(root);
  const caps = findCaps(root);
  const icon = findIconHolder(toggle);

  return { root, input, toggle, caps, icon };
}

function validParts(parts = {}) {
  return Boolean(isElement(parts.root) && isHtmlInput(parts.input) && isHtmlButton(parts.toggle));
}

/* =========================================================
   UI STATE
========================================================= */

function showLabel(toggle) {
  return safeText(toggle?.dataset?.showLabel || toggle?.getAttribute?.("data-show-label"), DEFAULT_SHOW_LABEL);
}

function hideLabel(toggle) {
  return safeText(toggle?.dataset?.hideLabel || toggle?.getAttribute?.("data-hide-label"), DEFAULT_HIDE_LABEL);
}

function setIcon(iconHolder, visible = false) {
  if (!isElement(iconHolder)) return false;

  const icon = visible ? createEyeOffIconNode() : createEyeIconNode();
  if (!icon) return false;

  replaceChildrenSafe(iconHolder, [icon]);
  setData(iconHolder, "state", visible ? "visible" : "hidden");
  toggleClass(iconHolder, "is-visible", visible);
  toggleClass(iconHolder, "is-hidden", !visible);

  return true;
}

function setPressed(toggle, visible = false, icon = null) {
  if (!isHtmlButton(toggle)) return false;

  const active = Boolean(visible);

  setAttr(toggle, "aria-pressed", active ? "true" : "false");
  setAttr(toggle, "aria-label", active ? hideLabel(toggle) : showLabel(toggle));
  setData(toggle, VISIBLE_DATA_KEY, active ? "true" : "false");
  toggleClass(toggle, "active", active);
  toggleClass(toggle, "is-visible", active);
  toggleClass(toggle, "is-hidden", !active);
  setIcon(icon || findIconHolder(toggle), active);

  return true;
}

function setInputVisibility(input, visible = false) {
  if (!isHtmlInput(input)) return false;

  const nextType = visible ? "text" : "password";
  if (input.type === nextType) return true;

  let selectionStart = null;
  let selectionEnd = null;

  try {
    selectionStart = input.selectionStart;
    selectionEnd = input.selectionEnd;
  } catch {}

  try {
    input.type = nextType;
  } catch {
    return false;
  }

  try {
    if (selectionStart !== null && selectionEnd !== null && isFn(input.setSelectionRange)) {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  } catch {}

  return true;
}

function setCapsState(indicator, active = false) {
  if (!isElement(indicator)) return false;

  const enabled = Boolean(active);

  try {
    indicator.hidden = !enabled;
  } catch {}

  setAttr(indicator, "aria-hidden", enabled ? "false" : "true");
  setData(indicator, CAPS_DATA_KEY, enabled ? "true" : null);
  toggleClass(indicator, "is-visible", enabled);
  toggleClass(indicator, "is-hidden", !enabled);

  return true;
}

function capsFromEvent(event) {
  if (!event || !isFn(event.getModifierState)) return false;

  try {
    return Boolean(event.getModifierState("CapsLock"));
  } catch {
    return false;
  }
}

function shouldShowCaps(input) {
  return Boolean(isHtmlInput(input) && activeElement() === input);
}

/* =========================================================
   PUBLIC BIND API
========================================================= */

export function bindPasswordField(fieldRoot) {
  if (!isBrowser() || !isElement(fieldRoot)) return null;

  const parts = resolveParts(fieldRoot);
  if (!validParts(parts)) return null;

  const { root, input, toggle, caps, icon } = parts;

  const existing = FIELD_BINDINGS.get(root) || INPUT_BINDINGS.get(input) || TOGGLE_BINDINGS.get(toggle) || null;
  if (existing && existing.destroyed !== true) return existing;

  const disposers = [];
  let destroyed = false;

  function getVisible() {
    try {
      return input.type === "text";
    } catch {
      return false;
    }
  }

  function syncVisibilityUI() {
    if (destroyed) return false;

    const visible = getVisible();

    setData(root, VISIBLE_DATA_KEY, visible ? "true" : "false");
    setData(input, VISIBLE_DATA_KEY, visible ? "true" : "false");
    setPressed(toggle, visible, icon);

    return visible;
  }

  function setVisible(visible = false, options = {}) {
    if (destroyed) return false;

    const changed = setInputVisibility(input, Boolean(visible));
    syncVisibilityUI();

    if (options.focus !== false) focusInput(input);
    return changed;
  }

  function toggleVisibility(options = {}) {
    if (destroyed) return false;

    if (input.disabled || toggle.disabled || toggle.getAttribute("aria-disabled") === "true") return getVisible();
    return setVisible(!getVisible(), options);
  }

  function syncCapsFromEvent(event) {
    if (destroyed || !caps) return false;
    return setCapsState(caps, shouldShowCaps(input) && capsFromEvent(event));
  }

  function hideCaps() {
    if (!caps) return false;
    return setCapsState(caps, false);
  }

  function handleToggleClick(event) {
    try {
      event?.preventDefault?.();
    } catch {}

    toggleVisibility({ focus: true });
  }

  function handleKeyEvent(event) {
    syncCapsFromEvent(event);
  }

  function handleFocus(event) {
    syncCapsFromEvent(event);
  }

  function handleBlur() {
    hideCaps();
  }

  function handleFormReset() {
    try {
      window.setTimeout(() => {
        if (destroyed) return;
        setVisible(false, { focus: false });
        hideCaps();
      }, 0);
    } catch {}
  }

  on(toggle, "click", handleToggleClick, false, disposers);
  on(input, "keydown", handleKeyEvent, false, disposers);
  on(input, "keyup", handleKeyEvent, false, disposers);
  on(input, "focus", handleFocus, false, disposers);
  on(input, "blur", handleBlur, false, disposers);

  const form = closest(input, "form");
  if (form) on(form, "reset", handleFormReset, false, disposers);

  if (isBrowser()) {
    on(document, "visibilitychange", () => {
      if (document.hidden) hideCaps();
    }, false, disposers);
  }

  setData(root, BOUND_DATA_KEY, "true");
  setData(root, "passwordFieldDomVersion", PASSWORD_FIELD_DOM_VERSION);
  setData(input, BOUND_DATA_KEY, "true");
  setData(toggle, BOUND_DATA_KEY, "true");
  setAttr(toggle, "aria-controls", input.id || null);

  syncVisibilityUI();
  hideCaps();

  const binding = {
    version: PASSWORD_FIELD_DOM_VERSION,
    root,
    input,
    toggle,
    capsIndicator: caps || null,
    iconHolder: icon || null,

    get destroyed() {
      return destroyed;
    },

    get visible() {
      return getVisible();
    },

    isDestroyed() {
      return Boolean(destroyed);
    },

    getVisible,
    setVisible,
    toggleVisibility,
    syncVisibilityUI,
    syncCapsFromEvent,
    hideCaps,

    destroy() {
      if (destroyed) return false;

      try {
        setInputVisibility(input, false);
        setPressed(toggle, false, icon);
        hideCaps();
      } catch {}

      destroyed = true;

      for (const dispose of disposers.splice(0)) {
        try {
          dispose();
        } catch {}
      }

      setData(root, BOUND_DATA_KEY, null);
      setData(input, BOUND_DATA_KEY, null);
      setData(toggle, BOUND_DATA_KEY, null);
      setData(root, VISIBLE_DATA_KEY, null);
      setData(input, VISIBLE_DATA_KEY, null);
      setData(toggle, VISIBLE_DATA_KEY, null);

      FIELD_BINDINGS.delete(root);
      INPUT_BINDINGS.delete(input);
      TOGGLE_BINDINGS.delete(toggle);

      return true;
    },

    unbind() {
      return this.destroy();
    },

    off() {
      return this.destroy();
    },

    dispose() {
      return this.destroy();
    },

    getSnapshot() {
      return getPasswordFieldSnapshot(binding);
    },
  };

  FIELD_BINDINGS.set(root, binding);
  INPUT_BINDINGS.set(input, binding);
  TOGGLE_BINDINGS.set(toggle, binding);

  return binding;
}

export function unbindPasswordField(fieldRoot) {
  if (!isElement(fieldRoot)) return false;

  const parts = resolveParts(fieldRoot);
  const binding = FIELD_BINDINGS.get(parts.root) || INPUT_BINDINGS.get(parts.input) || TOGGLE_BINDINGS.get(parts.toggle) || null;

  return binding ? binding.destroy() : false;
}

export function isPasswordFieldBound(fieldRoot) {
  if (!isElement(fieldRoot)) return false;

  const parts = resolveParts(fieldRoot);
  const binding = FIELD_BINDINGS.get(parts.root) || INPUT_BINDINGS.get(parts.input) || TOGGLE_BINDINGS.get(parts.toggle) || null;

  return Boolean(binding && binding.destroyed !== true);
}

function collectFieldRoots(scope = document) {
  if (!isBrowser()) return [];

  const root = scope || document;

  if (!isQueryable(root) && !isElement(root) && !isDocument(root) && !isDocumentFragment(root)) return [];

  const roots = [];

  if (isElement(root) && matches(root, FIELD_SELECTOR)) roots.push(root);

  for (const field of queryAll(root, FIELD_SELECTOR)) roots.push(field);

  for (const wrapper of queryAll(root, WRAPPER_SELECTOR)) {
    const explicit = closest(wrapper, FIELD_SELECTOR);
    if (explicit) continue;

    const input = findInput(wrapper);
    const toggle = findToggle(wrapper);
    if (input && toggle) roots.push(wrapper);
  }

  const unique = [];
  const seen = new Set();

  for (const item of roots) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    unique.push(item);
  }

  return unique;
}

export function bindPasswordFieldsInScope(scope = document) {
  if (!isBrowser()) return [];

  return collectFieldRoots(scope)
    .map((root) => bindPasswordField(root))
    .filter(Boolean);
}

export function unbindPasswordFieldsInScope(scope = document) {
  if (!isBrowser()) return 0;

  let count = 0;

  for (const root of collectFieldRoots(scope)) {
    if (unbindPasswordField(root)) count += 1;
  }

  return count;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getPasswordFieldSnapshot(bindingOrRoot = null) {
  let binding = null;

  if (bindingOrRoot && bindingOrRoot.root && bindingOrRoot.input) {
    binding = bindingOrRoot;
  } else if (isElement(bindingOrRoot)) {
    const parts = resolveParts(bindingOrRoot);
    binding = FIELD_BINDINGS.get(parts.root) || INPUT_BINDINGS.get(parts.input) || TOGGLE_BINDINGS.get(parts.toggle) || null;
  }

  if (!binding) {
    return {
      version: PASSWORD_FIELD_DOM_VERSION,
      bound: false,
    };
  }

  return {
    version: PASSWORD_FIELD_DOM_VERSION,
    bound: binding.destroyed !== true,
    destroyed: Boolean(binding.destroyed),
    visible: Boolean(binding.visible),
    root: {
      id: safeText(binding.root?.id, ""),
      connected: isConnected(binding.root),
      datasetBound: safeText(binding.root?.dataset?.[BOUND_DATA_KEY], ""),
      datasetVisible: safeText(binding.root?.dataset?.[VISIBLE_DATA_KEY], ""),
    },
    input: {
      id: safeText(binding.input?.id, ""),
      name: safeText(binding.input?.name, ""),
      type: safeText(binding.input?.type, ""),
      disabled: Boolean(binding.input?.disabled),
      connected: isConnected(binding.input),
      datasetBound: safeText(binding.input?.dataset?.[BOUND_DATA_KEY], ""),
    },
    toggle: {
      id: safeText(binding.toggle?.id, ""),
      disabled: Boolean(binding.toggle?.disabled),
      connected: isConnected(binding.toggle),
      ariaPressed: safeText(binding.toggle?.getAttribute?.("aria-pressed"), ""),
      ariaLabel: safeText(binding.toggle?.getAttribute?.("aria-label"), ""),
      datasetVisible: safeText(binding.toggle?.dataset?.[VISIBLE_DATA_KEY], ""),
    },
    caps: {
      exists: Boolean(binding.capsIndicator),
      connected: isConnected(binding.capsIndicator),
      hidden: Boolean(binding.capsIndicator?.hidden),
      active: safeText(binding.capsIndicator?.dataset?.[CAPS_DATA_KEY], "") === "true",
    },
  };
}

export default bindPasswordFieldsInScope;
