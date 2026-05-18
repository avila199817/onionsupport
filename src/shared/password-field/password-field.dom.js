/* =========================================================
   Onion SPA - Shared Password Field DOM
   Archivo: src/shared/password-field/password-field.dom.js

   Responsabilidad:
   - Binder DOM mínimo para password-field reutilizable.
   - Mostrar/ocultar password.
   - Alternar aria-pressed / aria-label.
   - Alternar iconos eye / eye-off si existen.
   - Detectar CapsLock sólo si existe indicador en el template.
   - Binding idempotente.
   - Cleanup real.
   - Sin AppCore.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin Toast.
   - Sin CSS inline.
   - Sin innerHTML.
   - Sin eventos globales.
   - Sin recrear SVGs desde JS.
   - Sin usar clases globales peligrosas como is-hidden.
========================================================= */

export const PASSWORD_FIELD_DOM_VERSION = "password-field.dom.v1";

const FIELD_SELECTOR = "[data-password-field]";

const WRAPPER_SELECTOR = [
  "[data-password-wrapper]",
  ".password-wrapper",
  ".login-password-wrapper",
  ".password-reset-password-wrapper",
].join(",");

const INPUT_SELECTOR = [
  "[data-password-input]",
  "[data-login-password]",
  "input[name='password']",
  "input[name='confirmPassword']",
].join(",");

const TOGGLE_SELECTOR = [
  "[data-password-toggle]",
  "[data-login-password-toggle]",
  ".password-toggle",
  ".login-password-toggle",
].join(",");

const ICON_SELECTOR = [
  "[data-password-toggle-icon]",
  ".password-toggle-icon",
].join(",");

const CAPS_SELECTOR = [
  "[data-password-caps]",
  "[data-login-caps]",
  ".password-caps",
  ".caps-indicator",
].join(",");

const DEFAULT_SHOW_LABEL = "Mostrar contraseña";
const DEFAULT_HIDE_LABEL = "Ocultar contraseña";

const BOUND_DATA_KEY = "passwordFieldBound";
const VISIBLE_DATA_KEY = "passwordVisible";
const CAPS_DATA_KEY = "capsLockActive";

const BINDINGS = new WeakMap();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isElement(value) {
  return Boolean(value && value.nodeType === 1);
}

function isInput(value) {
  return Boolean(isElement(value) && value.tagName?.toLowerCase?.() === "input");
}

function isButton(value) {
  return Boolean(isElement(value) && value.tagName?.toLowerCase?.() === "button");
}

function isQueryable(value) {
  return Boolean(value && isFn(value.querySelector) && isFn(value.querySelectorAll));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function matches(node = null, selector = "") {
  if (!isElement(node) || !selector) return false;

  try {
    return node.matches(selector);
  } catch {
    return false;
  }
}

function closest(node = null, selector = "") {
  if (!isElement(node) || !selector) return null;

  try {
    return node.closest(selector);
  } catch {
    return null;
  }
}

function qs(root = null, selector = "") {
  if (!isQueryable(root) || !selector) return null;

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function qsa(root = null, selector = "") {
  if (!isQueryable(root) || !selector) return [];

  try {
    return [...root.querySelectorAll(selector)].filter(isElement);
  } catch {
    return [];
  }
}

function setAttr(node = null, name = "", value = null) {
  if (!isElement(node) || !name) return false;

  try {
    if (value === null || value === undefined || value === "") {
      node.removeAttribute(name);
    } else {
      node.setAttribute(name, String(value));
    }

    return true;
  } catch {
    return false;
  }
}

function setData(node = null, key = "", value = null) {
  if (!isElement(node) || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete node.dataset[key];
    } else {
      node.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function toggleClass(node = null, className = "", active = false) {
  if (!isElement(node) || !className) return false;

  try {
    node.classList.toggle(className, Boolean(active));
    return true;
  } catch {
    return false;
  }
}

function bindDom(node = null, eventName = "", handler = null) {
  if (!node || !eventName || !isFn(handler) || !isFn(node.addEventListener)) {
    return () => {};
  }

  let disposed = false;

  try {
    node.addEventListener(eventName, handler);
  } catch {
    return () => {};
  }

  return () => {
    if (disposed) return;

    disposed = true;

    try {
      node.removeEventListener(eventName, handler);
    } catch {
      // noop
    }
  };
}

function later(callback = null) {
  if (!isFn(callback)) return false;

  try {
    queueMicrotask(callback);
    return true;
  } catch {
    // fallback abajo
  }

  try {
    Promise.resolve().then(callback).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function focusInput(input = null) {
  if (!isInput(input) || input.disabled) return false;

  try {
    input.focus({ preventScroll: true });
    return true;
  } catch {
    try {
      input.focus();
      return true;
    } catch {
      return false;
    }
  }
}

/* =========================================================
   RESOLUTION
========================================================= */

function resolveRoot(node = null) {
  if (!isElement(node)) return null;

  if (matches(node, FIELD_SELECTOR)) return node;

  const field = closest(node, FIELD_SELECTOR);

  if (field) return field;

  if (matches(node, WRAPPER_SELECTOR)) return node;

  const wrapper = closest(node, WRAPPER_SELECTOR);

  if (wrapper) return wrapper;

  return null;
}

function findInput(root = null) {
  if (!root) return null;
  if (isInput(root) && matches(root, INPUT_SELECTOR)) return root;

  return qs(root, INPUT_SELECTOR);
}

function findToggle(root = null) {
  if (!root) return null;
  if (isButton(root) && matches(root, TOGGLE_SELECTOR)) return root;

  return qs(root, TOGGLE_SELECTOR);
}

function findIcon(toggle = null) {
  return isButton(toggle) ? qs(toggle, ICON_SELECTOR) : null;
}

function findCaps(root = null) {
  if (!root) return null;
  if (isElement(root) && matches(root, CAPS_SELECTOR)) return root;

  return qs(root, CAPS_SELECTOR);
}

function resolveParts(node = null) {
  const root = resolveRoot(node);

  if (!root) {
    return {
      root: null,
      input: null,
      toggle: null,
      icon: null,
      caps: null,
    };
  }

  const input = findInput(root);
  const toggle = findToggle(root);

  return {
    root,
    input,
    toggle,
    icon: findIcon(toggle),
    caps: findCaps(root),
  };
}

function validParts(parts = {}) {
  return Boolean(
    isElement(parts.root) &&
      isInput(parts.input) &&
      isButton(parts.toggle)
  );
}

function getBinding(node = null) {
  const parts = resolveParts(node);
  return parts.root ? BINDINGS.get(parts.root) || null : null;
}

/* =========================================================
   PASSWORD STATE
========================================================= */

function showLabel(toggle = null) {
  return text(
    toggle?.dataset?.showLabel ||
      toggle?.getAttribute?.("data-show-label"),
    DEFAULT_SHOW_LABEL
  );
}

function hideLabel(toggle = null) {
  return text(
    toggle?.dataset?.hideLabel ||
      toggle?.getAttribute?.("data-hide-label"),
    DEFAULT_HIDE_LABEL
  );
}

function isVisible(input = null) {
  return isInput(input) && input.type === "text";
}

function setInputType(input = null, visible = false) {
  if (!isInput(input)) return false;

  const nextType = visible ? "text" : "password";

  if (input.type === nextType) return true;

  let start = null;
  let end = null;

  try {
    start = input.selectionStart;
    end = input.selectionEnd;
  } catch {
    // noop
  }

  try {
    input.type = nextType;
  } catch {
    return false;
  }

  try {
    if (start !== null && end !== null && isFn(input.setSelectionRange)) {
      input.setSelectionRange(start, end);
    }
  } catch {
    // noop
  }

  return true;
}

function syncIcon(icon = null, visible = false) {
  if (!isElement(icon)) return false;

  const eye = qs(icon, ".password-eye-icon");
  const eyeOff = qs(icon, ".password-eye-off-icon");

  setData(icon, "state", visible ? "visible" : "hidden");
  toggleClass(icon, "is-password-visible", visible);

  try {
    if (eye) eye.hidden = Boolean(visible);
    if (eyeOff) eyeOff.hidden = !visible;
  } catch {
    // noop
  }

  return true;
}

function syncPasswordState(parts = {}) {
  const { root, input, toggle, icon } = parts;
  const visible = isVisible(input);

  setData(root, VISIBLE_DATA_KEY, visible ? "true" : "false");
  setData(input, VISIBLE_DATA_KEY, visible ? "true" : "false");
  setData(toggle, VISIBLE_DATA_KEY, visible ? "true" : "false");

  setAttr(toggle, "aria-pressed", visible ? "true" : "false");
  setAttr(toggle, "aria-label", visible ? hideLabel(toggle) : showLabel(toggle));

  if (input?.id) {
    setAttr(toggle, "aria-controls", input.id);
  }

  toggleClass(root, "is-password-visible", visible);
  toggleClass(input, "is-password-visible", visible);
  toggleClass(toggle, "is-password-visible", visible);

  syncIcon(icon || findIcon(toggle), visible);

  return visible;
}

function canToggle(parts = {}) {
  const { input, toggle } = parts;

  if (!isInput(input) || !isButton(toggle)) return false;
  if (input.disabled || toggle.disabled) return false;
  if (toggle.getAttribute("aria-disabled") === "true") return false;

  return true;
}

/* =========================================================
   CAPSLOCK STATE
========================================================= */

function eventCapsActive(event = null) {
  if (!event || !isFn(event.getModifierState)) return false;

  try {
    return Boolean(event.getModifierState("CapsLock"));
  } catch {
    return false;
  }
}

function setCapsState(caps = null, active = false) {
  if (!isElement(caps)) return false;

  const enabled = Boolean(active);

  try {
    caps.hidden = !enabled;
  } catch {
    // noop
  }

  if (enabled) {
    setAttr(caps, "hidden", null);
  } else {
    setAttr(caps, "hidden", "hidden");
  }

  setAttr(caps, "aria-hidden", enabled ? "false" : "true");
  setData(caps, CAPS_DATA_KEY, enabled ? "true" : null);

  toggleClass(caps, "is-visible", enabled);
  toggleClass(caps, "is-caps-active", enabled);

  return true;
}

function syncCapsFromEvent(parts = {}, event = null) {
  const { input, caps } = parts;

  if (!isBrowser()) return false;
  if (!isInput(input) || !isElement(caps)) return false;

  const active = document.activeElement === input && eventCapsActive(event);

  return setCapsState(caps, active);
}

function hideCaps(parts = {}) {
  return setCapsState(parts.caps, false);
}

/* =========================================================
   SINGLE FIELD
========================================================= */

export function bindPasswordField(fieldRoot = null) {
  if (!isBrowser() || !isElement(fieldRoot)) return null;

  const parts = resolveParts(fieldRoot);

  if (!validParts(parts)) return null;

  const existing = BINDINGS.get(parts.root);

  if (existing && existing.destroyed !== true) {
    existing.sync();
    return existing;
  }

  const { root, input, toggle } = parts;

  let destroyed = false;
  const disposers = [];

  function setVisible(visible = false, options = {}) {
    if (destroyed) return false;

    const changed = setInputType(input, Boolean(visible));

    syncPasswordState(parts);

    if (options.focus !== false) {
      focusInput(input);
    }

    return changed;
  }

  function toggleVisibility(options = {}) {
    if (destroyed) return false;

    if (!canToggle(parts)) {
      return isVisible(input);
    }

    return setVisible(!isVisible(input), options);
  }

  function onToggleClick(event) {
    try {
      event?.preventDefault?.();
    } catch {
      // noop
    }

    toggleVisibility({ focus: true });
  }

  function onCapsEvent(event) {
    syncCapsFromEvent(parts, event);
  }

  function onBlur() {
    hideCaps(parts);
  }

  function onFormReset() {
    later(() => {
      if (destroyed) return;

      setVisible(false, {
        focus: false,
      });

      hideCaps(parts);
    });
  }

  disposers.push(bindDom(toggle, "click", onToggleClick));

  if (parts.caps) {
    disposers.push(bindDom(input, "keydown", onCapsEvent));
    disposers.push(bindDom(input, "keyup", onCapsEvent));
    disposers.push(bindDom(input, "focus", onCapsEvent));
    disposers.push(bindDom(input, "blur", onBlur));
  }

  const form = closest(input, "form");

  if (form) {
    disposers.push(bindDom(form, "reset", onFormReset));
  }

  setData(root, BOUND_DATA_KEY, "true");
  setData(input, BOUND_DATA_KEY, "true");
  setData(toggle, BOUND_DATA_KEY, "true");
  setData(root, "passwordFieldDomVersion", PASSWORD_FIELD_DOM_VERSION);

  syncPasswordState(parts);
  hideCaps(parts);

  const binding = {
    version: PASSWORD_FIELD_DOM_VERSION,

    root,
    input,
    toggle,
    icon: parts.icon || null,
    capsIndicator: parts.caps || null,

    get destroyed() {
      return destroyed;
    },

    get visible() {
      return isVisible(input);
    },

    isDestroyed() {
      return Boolean(destroyed);
    },

    getVisible() {
      return isVisible(input);
    },

    setVisible,
    toggleVisibility,

    sync(event = null) {
      if (destroyed) return false;

      const visible = syncPasswordState(parts);

      if (event) {
        syncCapsFromEvent(parts, event);
      }

      return visible;
    },

    hideCaps() {
      return hideCaps(parts);
    },

    destroy() {
      if (destroyed) return false;

      try {
        setInputType(input, false);
        syncPasswordState(parts);
        hideCaps(parts);
      } catch {
        // noop
      }

      destroyed = true;

      while (disposers.length) {
        try {
          disposers.pop()?.();
        } catch {
          // noop
        }
      }

      setData(root, BOUND_DATA_KEY, null);
      setData(input, BOUND_DATA_KEY, null);
      setData(toggle, BOUND_DATA_KEY, null);

      setData(root, VISIBLE_DATA_KEY, null);
      setData(input, VISIBLE_DATA_KEY, null);
      setData(toggle, VISIBLE_DATA_KEY, null);

      toggleClass(root, "is-password-visible", false);
      toggleClass(input, "is-password-visible", false);
      toggleClass(toggle, "is-password-visible", false);

      setAttr(toggle, "aria-pressed", "false");
      setAttr(toggle, "aria-label", showLabel(toggle));

      BINDINGS.delete(root);

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
      return getPasswordFieldSnapshot(root);
    },
  };

  BINDINGS.set(root, binding);

  return binding;
}

/* =========================================================
   SCOPE
========================================================= */

function collectFieldRoots(scope = null) {
  const root = scope || (isBrowser() ? document : null);

  if (!root || !isQueryable(root)) return [];

  const output = [];
  const seen = new Set();

  function add(node = null) {
    if (!isElement(node)) return;

    const parts = resolveParts(node);

    if (!validParts(parts)) return;
    if (seen.has(parts.root)) return;

    seen.add(parts.root);
    output.push(parts.root);
  }

  if (
    isElement(root) &&
    (matches(root, FIELD_SELECTOR) || matches(root, WRAPPER_SELECTOR))
  ) {
    add(root);
  }

  for (const field of qsa(root, FIELD_SELECTOR)) {
    add(field);
  }

  for (const wrapper of qsa(root, WRAPPER_SELECTOR)) {
    add(wrapper);
  }

  return output;
}

export function bindPasswordFieldsInScope(scope = null) {
  if (!isBrowser()) return [];

  return collectFieldRoots(scope || document)
    .map((root) => bindPasswordField(root))
    .filter(Boolean);
}

export function unbindPasswordField(fieldRoot = null) {
  const binding = getBinding(fieldRoot);
  return binding ? binding.destroy() : false;
}

export function unbindPasswordFieldsInScope(scope = null) {
  if (!isBrowser()) return 0;

  let count = 0;

  for (const root of collectFieldRoots(scope || document)) {
    if (unbindPasswordField(root)) count += 1;
  }

  return count;
}

export function isPasswordFieldBound(fieldRoot = null) {
  const binding = getBinding(fieldRoot);
  return Boolean(binding && binding.destroyed !== true);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getPasswordFieldSnapshot(fieldRoot = null) {
  const binding = getBinding(fieldRoot);

  if (!binding) {
    return {
      version: PASSWORD_FIELD_DOM_VERSION,
      bound: false,
    };
  }

  return {
    version: PASSWORD_FIELD_DOM_VERSION,

    bound: binding.destroyed !== true,
    visible: Boolean(binding.visible),

    hasInput: Boolean(binding.input),
    hasToggle: Boolean(binding.toggle),
    hasCaps: Boolean(binding.capsIndicator),

    inputType: text(binding.input?.type, ""),
    togglePressed: text(binding.toggle?.getAttribute?.("aria-pressed"), ""),
    capsActive: binding.capsIndicator?.dataset?.[CAPS_DATA_KEY] === "true",

    policy: {
      domOnly: true,
      noAppCore: true,
      noAuth: true,
      noRouter: true,
      noStore: true,
      noToast: true,
      noInnerHTML: true,
      noGlobalEvents: true,
      noSvgRecreation: true,
      idempotent: true,
      cleanupReal: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default bindPasswordFieldsInScope;
