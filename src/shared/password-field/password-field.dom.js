/* =========================================================
   Onion SPA - Shared Password Field DOM
   Archivo: src/shared/password-field/password-field.dom.js

   Responsabilidad:
   - Binder DOM mínimo para campos password reutilizables.
   - Mostrar/ocultar password.
   - Binding idempotente.
   - Cleanup real.
   - Sin AppCore.
   - Sin CSS inline.
   - Sin innerHTML.
   - Sin CapsLock.
   - Sin eventos globales.
   - Sin recrear SVGs desde JS.
========================================================= */

export const PASSWORD_FIELD_DOM_VERSION = "minimal-1";

const FIELD_SELECTOR = "[data-password-field='true'], [data-password-field]";
const WRAPPER_SELECTOR = "[data-password-wrapper='true'], [data-password-wrapper], .password-wrapper, .login-password-wrapper";
const INPUT_SELECTOR = "[data-password-input='true'], [data-password-input], [data-login-password='true'], [data-login-password], input[name='password']";
const TOGGLE_SELECTOR = "[data-password-toggle='true'], [data-password-toggle], [data-login-password-toggle='true'], [data-login-password-toggle], .password-toggle, .login-password-toggle";
const ICON_SELECTOR = "[data-password-toggle-icon], .password-toggle-icon";

const DEFAULT_SHOW_LABEL = "Mostrar contraseña";
const DEFAULT_HIDE_LABEL = "Ocultar contraseña";

const BOUND_DATA_KEY = "passwordFieldBound";
const VISIBLE_DATA_KEY = "passwordVisible";

const ROOT_BINDINGS = new WeakMap();
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

function matches(node, selector = "") {
  if (!isElement(node) || !selector) return false;

  try {
    return node.matches(selector);
  } catch {
    return false;
  }
}

function closest(node, selector = "") {
  if (!isElement(node) || !selector) return null;

  try {
    return node.closest(selector);
  } catch {
    return null;
  }
}

function qs(root, selector = "") {
  if (!isQueryable(root) || !selector) return null;

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function qsa(root, selector = "") {
  if (!isQueryable(root) || !selector) return [];

  try {
    return Array.from(root.querySelectorAll(selector) || []);
  } catch {
    return [];
  }
}

function setAttr(node, name = "", value = null) {
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

function setData(node, key = "", value = null) {
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

function toggleClass(node, className = "", enabled = false) {
  if (!isElement(node) || !className) return false;

  try {
    node.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function focusInput(input) {
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

function bindDom(node, eventName = "", handler = null, options = false) {
  if (!node || !eventName || !isFn(handler) || !isFn(node.addEventListener)) {
    return () => {};
  }

  let disposed = false;

  try {
    node.addEventListener(eventName, handler, options);
  } catch {
    return () => {};
  }

  return () => {
    if (disposed) return;
    disposed = true;

    try {
      node.removeEventListener(eventName, handler, options);
    } catch {
      // noop
    }
  };
}

/* =========================================================
   RESOLUTION
========================================================= */

function findInput(root) {
  if (!root) return null;
  if (isInput(root) && matches(root, INPUT_SELECTOR)) return root;
  return qs(root, INPUT_SELECTOR);
}

function findToggle(root) {
  if (!root) return null;
  if (isButton(root) && matches(root, TOGGLE_SELECTOR)) return root;
  return qs(root, TOGGLE_SELECTOR);
}

function findIcon(toggle) {
  if (!isButton(toggle)) return null;
  return qs(toggle, ICON_SELECTOR);
}

function resolveRoot(node) {
  if (!isElement(node)) return null;

  if (matches(node, FIELD_SELECTOR)) return node;

  const field = closest(node, FIELD_SELECTOR);
  if (field) return field;

  if (matches(node, WRAPPER_SELECTOR)) return node;

  const wrapper = closest(node, WRAPPER_SELECTOR);
  if (wrapper) return wrapper;

  return node;
}

function resolveParts(node) {
  const root = resolveRoot(node);

  if (!root) {
    return {
      root: null,
      input: null,
      toggle: null,
      icon: null,
    };
  }

  const input = findInput(root);
  const toggle = findToggle(root);

  return {
    root,
    input,
    toggle,
    icon: findIcon(toggle),
  };
}

function validParts(parts = {}) {
  return Boolean(
    isElement(parts.root) &&
      isInput(parts.input) &&
      isButton(parts.toggle)
  );
}

function bindingFromParts(parts = {}) {
  return (
    ROOT_BINDINGS.get(parts.root) ||
    INPUT_BINDINGS.get(parts.input) ||
    TOGGLE_BINDINGS.get(parts.toggle) ||
    null
  );
}

/* =========================================================
   UI STATE
========================================================= */

function showLabel(toggle) {
  return text(
    toggle?.dataset?.showLabel ||
      toggle?.getAttribute?.("data-show-label"),
    DEFAULT_SHOW_LABEL
  );
}

function hideLabel(toggle) {
  return text(
    toggle?.dataset?.hideLabel ||
      toggle?.getAttribute?.("data-hide-label"),
    DEFAULT_HIDE_LABEL
  );
}

function getVisible(input) {
  return isInput(input) && input.type === "text";
}

function setInputType(input, visible = false) {
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

function setIconState(icon, visible = false) {
  if (!isElement(icon)) return false;

  const active = Boolean(visible);

  setData(icon, "state", active ? "visible" : "hidden");
  toggleClass(icon, "is-visible", active);
  toggleClass(icon, "is-hidden", !active);

  const eye = qs(icon, ".password-eye-icon");
  const eyeOff = qs(icon, ".password-eye-off-icon");

  if (eye && eyeOff) {
    try {
      eye.hidden = active;
      eyeOff.hidden = !active;
    } catch {
      // noop
    }
  }

  return true;
}

function syncState(parts = {}) {
  const { root, input, toggle, icon } = parts;
  const visible = getVisible(input);

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
  toggleClass(toggle, "is-visible", visible);
  toggleClass(toggle, "is-hidden", !visible);

  setIconState(icon, visible);

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
   PUBLIC API
========================================================= */

export function bindPasswordField(fieldRoot) {
  if (!isBrowser() || !isElement(fieldRoot)) return null;

  const parts = resolveParts(fieldRoot);

  if (!validParts(parts)) return null;

  const existing = bindingFromParts(parts);

  if (existing && existing.destroyed !== true) {
    return existing;
  }

  const { root, input, toggle } = parts;

  let destroyed = false;
  const disposers = [];

  function setVisible(visible = false, options = {}) {
    if (destroyed) return false;

    const changed = setInputType(input, Boolean(visible));
    syncState(parts);

    if (options.focus !== false) {
      focusInput(input);
    }

    return changed;
  }

  function toggleVisibility(options = {}) {
    if (destroyed) return false;

    if (!canToggle(parts)) {
      return getVisible(input);
    }

    return setVisible(!getVisible(input), options);
  }

  function handleToggleClick(event) {
    try {
      event?.preventDefault?.();
    } catch {
      // noop
    }

    toggleVisibility({ focus: true });
  }

  function handleFormReset() {
    try {
      window.setTimeout(() => {
        if (!destroyed) setVisible(false, { focus: false });
      }, 0);
    } catch {
      // noop
    }
  }

  disposers.push(bindDom(toggle, "click", handleToggleClick));

  const form = closest(input, "form");
  if (form) {
    disposers.push(bindDom(form, "reset", handleFormReset));
  }

  setData(root, BOUND_DATA_KEY, "true");
  setData(input, BOUND_DATA_KEY, "true");
  setData(toggle, BOUND_DATA_KEY, "true");

  setData(root, "passwordFieldDomVersion", PASSWORD_FIELD_DOM_VERSION);

  syncState(parts);

  const binding = {
    version: PASSWORD_FIELD_DOM_VERSION,

    root,
    input,
    toggle,
    iconHolder: parts.icon || null,

    get destroyed() {
      return destroyed;
    },

    get visible() {
      return getVisible(input);
    },

    isDestroyed() {
      return Boolean(destroyed);
    },

    getVisible() {
      return getVisible(input);
    },

    setVisible,
    toggleVisibility,

    sync() {
      if (destroyed) return false;
      return syncState(parts);
    },

    destroy() {
      if (destroyed) return false;

      try {
        setInputType(input, false);
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
      toggleClass(toggle, "is-visible", false);
      toggleClass(toggle, "is-hidden", false);

      setAttr(toggle, "aria-pressed", "false");
      setAttr(toggle, "aria-label", showLabel(toggle));

      ROOT_BINDINGS.delete(root);
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
      return getPasswordFieldSnapshot(root);
    },
  };

  ROOT_BINDINGS.set(root, binding);
  INPUT_BINDINGS.set(input, binding);
  TOGGLE_BINDINGS.set(toggle, binding);

  return binding;
}

export function unbindPasswordField(fieldRoot) {
  if (!isElement(fieldRoot)) return false;

  const parts = resolveParts(fieldRoot);
  const binding = bindingFromParts(parts);

  return binding ? binding.destroy() : false;
}

export function isPasswordFieldBound(fieldRoot) {
  if (!isElement(fieldRoot)) return false;

  const parts = resolveParts(fieldRoot);
  const binding = bindingFromParts(parts);

  return Boolean(binding && binding.destroyed !== true);
}

function collectFieldRoots(scope = null) {
  const root = scope || (isBrowser() ? document : null);

  if (!root || !isQueryable(root)) return [];

  const output = [];
  const seen = new Set();

  function add(node) {
    if (!isElement(node) || seen.has(node)) return;

    const parts = resolveParts(node);
    if (!validParts(parts)) return;

    seen.add(parts.root);
    output.push(parts.root);
  }

  if (isElement(root)) {
    if (matches(root, FIELD_SELECTOR) || matches(root, WRAPPER_SELECTOR)) {
      add(root);
    }

    const ownParts = resolveParts(root);
    if (validParts(ownParts)) add(ownParts.root);
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

export function unbindPasswordFieldsInScope(scope = null) {
  if (!isBrowser()) return 0;

  let count = 0;

  for (const root of collectFieldRoots(scope || document)) {
    if (unbindPasswordField(root)) count += 1;
  }

  return count;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getPasswordFieldSnapshot(fieldRoot = null) {
  const parts = isElement(fieldRoot) ? resolveParts(fieldRoot) : {};
  const binding = bindingFromParts(parts);

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
    inputType: text(binding.input?.type, ""),
    togglePressed: text(binding.toggle?.getAttribute?.("aria-pressed"), ""),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default bindPasswordFieldsInScope;
