/* =========================================================
   Onion SPA - Login DOM
   Archivo: src/views/login/login.dom.js

   Login DOM limpio:
   - refs del formulario
   - errores y loading sin innerHTML
   - password-field opcional
   - password no se trimea al leer
   - bindings idempotentes
   - sin Auth / HTTP / Router
========================================================= */

import {
  bindPasswordFieldsInScope,
} from "../../shared/password-field/index.js";

/* =========================================================
   VERSION
========================================================= */

export const LOGIN_DOM_VERSION = "17.0.0-clean";

const SOURCE = "login.dom";

const DEFAULT_SUBMIT_LABEL = "Entrar al panel";
const DEFAULT_LOADING_LABEL = "Accediendo...";
const DEFAULT_SHOW_PASSWORD_LABEL = "Mostrar contraseña";
const DEFAULT_HIDE_PASSWORD_LABEL = "Ocultar contraseña";

const DISABLED_MEMORY_KEY = "loginPrevDisabled";
const TABINDEX_MEMORY_KEY = "loginPrevTabIndex";

const SELECTORS = Object.freeze({
  root: [
    ".login-view",
    "[data-login-view='true']",
    "[data-login-view]",
    "#loginView",
  ],

  form: [
    "#loginForm",
    "[data-login-form='true']",
    "[data-login-form]",
    "form[data-auth-form='login']",
    "form",
  ],

  identifier: [
    "#loginIdentifier",
    "#loginEmail",
    "[name='identifier']",
    "[name='email']",
    "[name='username']",
    "[name='user']",
    "[name='login']",
    "[data-login-identifier='true']",
    "[data-login-identifier]",
    "input[type='email']",
    "input[autocomplete='username']",
  ],

  password: [
    "#loginPassword",
    "[name='password']",
    "[data-login-password='true']",
    "[data-login-password]",
    "[data-password-input='true']",
    "[data-password-input]",
    "input[type='password']",
    "input[autocomplete='current-password']",
  ],

  remember: [
    "#loginRemember",
    "[name='remember']",
    "[name='rememberMe']",
    "[name='remember_me']",
    "[data-login-remember='true']",
    "[data-login-remember]",
  ],

  errorBox: [
    "#loginError",
    "[data-login-error='true']",
    "[data-login-error]",
    "[data-form-error]",
    ".login-error",
  ],

  submit: [
    "#loginSubmit",
    "[data-login-submit='true']",
    "[data-login-submit]",
    "button[type='submit']",
  ],

  themeToggle: [
    "#loginThemeToggle",
    "[data-login-theme-toggle='true']",
    "[data-login-theme-toggle]",
    "[data-theme-toggle='true']",
    "[data-theme-toggle]",
  ],

  passwordToggle: [
    "#togglePassword",
    "#loginPasswordToggle",
    "[data-password-toggle='true']",
    "[data-password-toggle]",
    "[data-login-password-toggle='true']",
    "[data-login-password-toggle]",
  ],

  capsIndicator: [
    "#loginCapsIndicator",
    "[data-password-caps='true']",
    "[data-password-caps]",
    "[data-login-caps='true']",
    "[data-login-caps]",
  ],

  forgotPasswordLink: [
    "#forgotPasswordLink",
    "[data-forgot-password-link='true']",
    "[data-forgot-password-link]",
    "[data-login-forgot-password]",
  ],

  fieldIdentifier: [
    "[data-field='identifier']",
    "[data-field='email']",
    "[data-login-field='identifier']",
    "[data-login-field='email']",
  ],

  fieldPassword: [
    "[data-field='password']",
    "[data-login-field='password']",
  ],

  errorIdentifier: [
    "[data-error-for='identifier']",
    "[data-error-for='email']",
    "[data-login-error-for='identifier']",
    "[data-login-error-for='email']",
  ],

  errorPassword: [
    "[data-error-for='password']",
    "[data-login-error-for='password']",
  ],

  submitText: [
    ".login-submit-text",
    "[data-login-submit-text]",
  ],
});

const SUBMIT_BINDINGS = new WeakMap();
const THEME_BINDINGS = new WeakMap();
const PASSWORD_TOGGLE_BINDINGS = new WeakMap();
const PASSWORD_SHARED_BINDINGS = new WeakMap();

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
  const text = String(value).trim();
  return text || fallback;
}

function rawValue(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function iso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function noop() {}

function qs(root, selector) {
  if (!root || !selector) return null;

  try {
    return root.querySelector(selector) || null;
  } catch {
    return null;
  }
}

function qsa(root, selector) {
  if (!root || !selector) return [];

  try {
    return Array.from(root.querySelectorAll(selector) || []);
  } catch {
    return [];
  }
}

function queryFirst(root, selectors = []) {
  const scope = root || (isBrowser() ? document : null);
  if (!scope) return null;

  for (const selector of selectors || []) {
    const clean = safeText(selector, "");
    if (!clean) continue;

    try {
      if (clean.startsWith("#") && scope === document) {
        const byId = document.getElementById(clean.slice(1));
        if (byId) return byId;
      }

      const found = scope.querySelector?.(clean);
      if (found) return found;
    } catch {}
  }

  return null;
}

function connected(node) {
  if (!node) return false;

  try {
    return Boolean(node.isConnected || document.contains(node));
  } catch {
    return false;
  }
}

function setAttr(node, name, value) {
  if (!node || !name) return false;

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

function setData(node, key, value) {
  if (!node || !key) return false;

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

function setText(node, value = "") {
  if (!node) return false;

  try {
    node.textContent = safeText(value, "");
    return true;
  } catch {
    return false;
  }
}

function setHidden(node, hidden = false) {
  if (!node) return false;

  try {
    node.hidden = Boolean(hidden);
  } catch {}

  setAttr(node, "aria-hidden", hidden ? "true" : "false");
  return true;
}

function toggleClass(node, className, enabled) {
  if (!node || !className) return false;

  try {
    node.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function createSpan(className = "", text = "") {
  if (!isBrowser()) return null;

  try {
    const span = document.createElement("span");

    if (className) span.className = className;
    if (text) span.textContent = text;

    return span;
  } catch {
    return null;
  }
}

function replaceChildren(node, children = []) {
  if (!node) return false;

  const clean = (children || []).filter(Boolean);

  try {
    node.replaceChildren(...clean);
    return true;
  } catch {}

  try {
    while (node.firstChild) node.removeChild(node.firstChild);
    clean.forEach((child) => node.appendChild(child));
    return true;
  } catch {
    return false;
  }
}

function microtask(callback) {
  if (!isFn(callback)) return;

  try {
    queueMicrotask(callback);
    return;
  } catch {}

  try {
    Promise.resolve().then(callback).catch(noop);
    return;
  } catch {}

  try {
    setTimeout(callback, 0);
  } catch {}
}

function focus(node, options = {}) {
  if (!node) return false;

  try {
    node.focus({ preventScroll: options.preventScroll !== false });
    return true;
  } catch {}

  try {
    node.focus();
    return true;
  } catch {
    return false;
  }
}

function select(node) {
  if (!node) return false;

  try {
    node.select?.();
    return true;
  } catch {
    return false;
  }
}

function setDisabledWithMemory(node, disabled = false, options = {}) {
  if (!node) return false;

  const next = Boolean(disabled);

  try {
    if (next) {
      if (node.dataset?.[DISABLED_MEMORY_KEY] === undefined) {
        node.dataset[DISABLED_MEMORY_KEY] = node.disabled ? "true" : "false";
      }

      node.disabled = true;
      return true;
    }

    const previous = node.dataset?.[DISABLED_MEMORY_KEY];

    node.disabled = options.forceEnable === true
      ? false
      : previous === "true";

    if (node.dataset) delete node.dataset[DISABLED_MEMORY_KEY];

    return true;
  } catch {
    try {
      node.disabled = next;
      return true;
    } catch {
      return false;
    }
  }
}

function bindDom(target, eventName, handler, options = false) {
  if (!target || !eventName || !isFn(handler)) return noop;

  let disposed = false;

  try {
    target.addEventListener(eventName, handler, options);
  } catch {
    return noop;
  }

  return () => {
    if (disposed) return;
    disposed = true;

    try {
      target.removeEventListener(eventName, handler, options);
    } catch {}
  };
}

function compose(disposers = []) {
  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    for (const dispose of disposers || []) {
      try {
        dispose?.();
      } catch {}
    }
  };
}

/* =========================================================
   PASSWORD FIELD SHARED
========================================================= */

export function bindLoginPasswordFields(container = null, options = {}) {
  const root = container || (isBrowser() ? document : null);
  if (!root) return [];

  if (PASSWORD_SHARED_BINDINGS.has(root) && options.force !== true) {
    return PASSWORD_SHARED_BINDINGS.get(root) || [];
  }

  try {
    const result = bindPasswordFieldsInScope(root);
    const bindings = Array.isArray(result) ? result : [];

    PASSWORD_SHARED_BINDINGS.set(root, bindings);
    return bindings;
  } catch {
    PASSWORD_SHARED_BINDINGS.set(root, []);
    return [];
  }
}

export function destroyLoginPasswordFields(container = null) {
  const root = container || (isBrowser() ? document : null);
  if (!root) return false;

  const bindings = PASSWORD_SHARED_BINDINGS.get(root) || [];

  for (const binding of bindings) {
    try {
      if (isFn(binding)) binding();
      else if (isFn(binding?.destroy)) binding.destroy();
      else if (isFn(binding?.unbind)) binding.unbind();
      else if (isFn(binding?.off)) binding.off();
      else if (isFn(binding?.dispose)) binding.dispose();
    } catch {}
  }

  PASSWORD_SHARED_BINDINGS.delete(root);
  return true;
}

/* =========================================================
   REFS
========================================================= */

export function getLoginRefs(container = null) {
  const safeContainer = container || (isBrowser() ? document : null);
  const root = queryFirst(safeContainer, SELECTORS.root) || safeContainer;
  const form = queryFirst(root, SELECTORS.form);
  const scope = form || root || safeContainer;

  const identifierInput = queryFirst(scope, SELECTORS.identifier);
  const passwordInput = queryFirst(scope, SELECTORS.password);
  const togglePasswordButton = queryFirst(scope, SELECTORS.passwordToggle);
  const capsIndicator = queryFirst(scope, SELECTORS.capsIndicator);
  const fieldIdentifier = queryFirst(scope, SELECTORS.fieldIdentifier);
  const errorIdentifier = queryFirst(scope, SELECTORS.errorIdentifier);

  const refs = {
    container: safeContainer,
    root,
    form,

    identifierInput,
    emailInput: identifierInput,

    passwordInput,
    rememberInput: queryFirst(scope, SELECTORS.remember),
    errorBox: queryFirst(scope, SELECTORS.errorBox),
    submitButton: queryFirst(scope, SELECTORS.submit),
    themeToggleButton: queryFirst(scope, SELECTORS.themeToggle),

    togglePasswordButton,
    capsIndicator,

    forgotPasswordLink: queryFirst(scope, SELECTORS.forgotPasswordLink),

    fieldIdentifier,
    fieldEmail: fieldIdentifier,
    fieldPassword: queryFirst(scope, SELECTORS.fieldPassword),

    errorIdentifier,
    errorEmail: errorIdentifier,
    errorPassword: queryFirst(scope, SELECTORS.errorPassword),

    submitText: queryFirst(scope, SELECTORS.submitText),

    passwordFieldBindings: [],

    passwordField: {
      input: passwordInput,
      toggle: togglePasswordButton,
      capsIndicator,
    },
  };

  try {
    if (form) {
      form.noValidate = true;
      setData(form, "loginDomVersion", LOGIN_DOM_VERSION);
      setData(form, "loginDomSource", SOURCE);
    }
  } catch {}

  try {
    if (refs.submitButton) {
      if (!refs.submitButton.getAttribute("type")) {
        refs.submitButton.setAttribute("type", "submit");
      }

      if (!refs.submitButton.dataset.originalLabel) {
        refs.submitButton.dataset.originalLabel =
          safeText(refs.submitButton.textContent, DEFAULT_SUBMIT_LABEL);
      }
    }
  } catch {}

  return refs;
}

/* =========================================================
   ERRORS
========================================================= */

export function setFieldInvalid(fieldNode, invalid = false) {
  if (!fieldNode) return false;

  const active = Boolean(invalid);

  toggleClass(fieldNode, "is-invalid", active);
  setData(fieldNode, "invalid", active ? "true" : null);

  return true;
}

export function setInputInvalid(inputNode, invalid = false) {
  if (!inputNode) return false;

  const active = Boolean(invalid);

  toggleClass(inputNode, "is-invalid", active);
  setAttr(inputNode, "aria-invalid", active ? "true" : "false");

  return true;
}

export function setFieldError(fieldNode, message = "", errorNode = null) {
  const text = safeText(message, "");

  setFieldInvalid(fieldNode, Boolean(text));
  setData(fieldNode, "error", text || null);

  if (errorNode) {
    setText(errorNode, text);
    setHidden(errorNode, !text);
    setAttr(errorNode, "role", text ? "alert" : null);
  }

  return true;
}

export function clearFieldError(fieldNode, errorNode = null) {
  setFieldInvalid(fieldNode, false);
  setData(fieldNode, "error", null);

  if (errorNode) {
    setText(errorNode, "");
    setHidden(errorNode, true);
    setAttr(errorNode, "role", null);
  }

  return true;
}

function setGlobalError(errorBox, message = "") {
  const text = safeText(message, "");

  if (!errorBox) return false;

  setText(errorBox, text);
  setHidden(errorBox, !text);

  toggleClass(errorBox, "is-visible", Boolean(text));
  toggleClass(errorBox, "is-empty", !text);

  setAttr(errorBox, "role", text ? "alert" : null);
  setAttr(errorBox, "aria-live", text ? "polite" : null);

  return true;
}

export function clearLoginErrors(refs = {}) {
  clearFieldError(refs.fieldEmail, refs.errorEmail);

  if (refs.fieldIdentifier && refs.fieldIdentifier !== refs.fieldEmail) {
    clearFieldError(refs.fieldIdentifier, refs.errorIdentifier);
  }

  clearFieldError(refs.fieldPassword, refs.errorPassword);

  setInputInvalid(refs.emailInput, false);

  if (refs.identifierInput && refs.identifierInput !== refs.emailInput) {
    setInputInvalid(refs.identifierInput, false);
  }

  setInputInvalid(refs.passwordInput, false);
  setGlobalError(refs.errorBox, "");

  try {
    refs.form?.removeAttribute?.("data-error");
  } catch {}

  return true;
}

export function applyLoginErrors(refs = {}, errors = {}, options = {}) {
  const identifierError =
    safeText(errors.identifier, "") ||
    safeText(errors.email, "") ||
    safeText(errors.username, "") ||
    safeText(errors.user, "") ||
    safeText(errors.login, "");

  const passwordError = safeText(errors.password, "");

  const globalError =
    safeText(errors.global, "") ||
    safeText(errors.form, "") ||
    safeText(errors.message, "");

  const firstError = identifierError || passwordError || globalError || "";

  setFieldError(refs.fieldEmail, identifierError, refs.errorEmail);

  if (refs.fieldIdentifier && refs.fieldIdentifier !== refs.fieldEmail) {
    setFieldError(refs.fieldIdentifier, identifierError, refs.errorIdentifier);
  }

  setFieldError(refs.fieldPassword, passwordError, refs.errorPassword);

  setInputInvalid(refs.emailInput, Boolean(identifierError));

  if (refs.identifierInput && refs.identifierInput !== refs.emailInput) {
    setInputInvalid(refs.identifierInput, Boolean(identifierError));
  }

  setInputInvalid(refs.passwordInput, Boolean(passwordError));
  setGlobalError(refs.errorBox, firstError);

  try {
    if (refs.form) {
      if (firstError) refs.form.dataset.error = "true";
      else delete refs.form.dataset.error;
    }
  } catch {}

  if (options.focus !== false) {
    microtask(() => {
      if (identifierError) {
        focus(refs.identifierInput || refs.emailInput);
        return;
      }

      if (passwordError) focus(refs.passwordInput);
    });
  }

  return firstError;
}

export function setGlobalLoginError(refs = {}, message = "") {
  const text = safeText(message, "");

  setGlobalError(refs.errorBox, text);

  try {
    if (refs.form) {
      if (text) refs.form.dataset.error = "true";
      else delete refs.form.dataset.error;
    }
  } catch {}

  return text;
}

/* =========================================================
   LOADING
========================================================= */

function makeSubmitText(text = "") {
  const node = createSpan("login-submit-text", text);
  if (node) setData(node, "loginSubmitText", "true");
  return node;
}

function makeSpinner() {
  const node = createSpan("login-view__spinner", "");
  if (node) {
    setAttr(node, "aria-hidden", "true");
    setData(node, "loginSpinner", "true");
  }

  return node;
}

function originalSubmitLabel(button, fallback = DEFAULT_SUBMIT_LABEL) {
  if (!button) return fallback;

  try {
    const existing = safeText(button.dataset?.originalLabel, "");
    if (existing) return existing;

    const current = safeText(button.textContent, fallback);
    button.dataset.originalLabel = current || fallback;

    return current || fallback;
  } catch {
    return fallback;
  }
}

function renderSubmitButton(button, loading = false, labels = {}) {
  if (!button) return false;

  const isLoading = Boolean(loading);
  const label = isLoading
    ? safeText(labels.loadingLabel, DEFAULT_LOADING_LABEL)
    : safeText(labels.submitLabel, originalSubmitLabel(button));

  try {
    button.disabled = isLoading;
  } catch {}

  setData(button, "loading", isLoading ? "true" : null);
  setAttr(button, "aria-busy", isLoading ? "true" : "false");
  setAttr(button, "aria-disabled", isLoading ? "true" : "false");

  return replaceChildren(
    button,
    isLoading
      ? [makeSpinner(), makeSubmitText(label)]
      : [makeSubmitText(label)]
  );
}

function setLinkDisabled(link, disabled = false) {
  if (!link) return false;

  const isDisabled = Boolean(disabled);

  setAttr(link, "aria-disabled", isDisabled ? "true" : "false");
  toggleClass(link, "is-disabled", isDisabled);

  if (isDisabled) {
    try {
      if (link.dataset?.[TABINDEX_MEMORY_KEY] === undefined) {
        link.dataset[TABINDEX_MEMORY_KEY] = String(link.tabIndex);
      }

      link.tabIndex = -1;
    } catch {}

    return true;
  }

  try {
    const previous = link.dataset?.[TABINDEX_MEMORY_KEY];

    if (previous !== undefined && previous !== null && previous !== "") {
      link.tabIndex = Number(previous);
    } else {
      link.removeAttribute("tabindex");
    }

    if (link.dataset) delete link.dataset[TABINDEX_MEMORY_KEY];
  } catch {}

  return true;
}

function clearSubmitFlags(form) {
  if (!form) return false;

  try {
    delete form.dataset.submitting;
    delete form.dataset.loginSubmitting;
    delete form.dataset.loginSubmitLocked;
    delete form.dataset.busy;
  } catch {}

  setAttr(form, "aria-busy", "false");

  return true;
}

export function setLoginLoading(refs = {}, loading = false, options = {}) {
  const isLoading = Boolean(loading);
  const disablePassword = options.disablePassword === true || options.disablePasswordDuringSubmit === true;

  for (const node of [refs.container, refs.root]) {
    toggleClass(node, "is-loading", isLoading);
    setData(node, "loginLoading", isLoading ? "true" : null);
  }

  if (refs.form) {
    setAttr(refs.form, "aria-busy", isLoading ? "true" : "false");

    if (isLoading) {
      refs.form.dataset.submitting = "true";
      refs.form.dataset.loginSubmitting = "1";
      refs.form.dataset.loginSubmitLocked = "true";
    } else {
      clearSubmitFlags(refs.form);
    }
  }

  setDisabledWithMemory(refs.emailInput, isLoading, { forceEnable: !isLoading });

  if (refs.identifierInput && refs.identifierInput !== refs.emailInput) {
    setDisabledWithMemory(refs.identifierInput, isLoading, { forceEnable: !isLoading });
  }

  setDisabledWithMemory(
    refs.passwordInput,
    disablePassword ? isLoading : false,
    { forceEnable: !isLoading || !disablePassword }
  );

  setDisabledWithMemory(
    refs.togglePasswordButton,
    disablePassword ? isLoading : false,
    { forceEnable: !isLoading || !disablePassword }
  );

  setDisabledWithMemory(refs.rememberInput, isLoading, { forceEnable: !isLoading });
  setDisabledWithMemory(refs.themeToggleButton, isLoading, { forceEnable: !isLoading });

  setLinkDisabled(refs.forgotPasswordLink, isLoading);

  renderSubmitButton(refs.submitButton, isLoading, {
    submitLabel: safeText(options.submitLabel, ""),
    loadingLabel: safeText(options.loadingLabel, DEFAULT_LOADING_LABEL),
  });

  return true;
}

export function unlockLoginForm(refs = {}, options = {}) {
  setLoginLoading(refs, false, {
    submitLabel: options.submitLabel,
    loadingLabel: options.loadingLabel,
  });

  clearSubmitFlags(refs.form);

  try {
    if (refs.submitButton) {
      refs.submitButton.disabled = false;
      setAttr(refs.submitButton, "aria-disabled", "false");
      setAttr(refs.submitButton, "aria-busy", "false");
      setData(refs.submitButton, "loading", null);
    }
  } catch {}

  return true;
}

/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

export function getPasswordVisibilityState(refs = {}) {
  return refs?.passwordInput?.type === "text";
}

export function setPasswordVisibility(refs = {}, visible = false) {
  const isVisible = Boolean(visible);
  const input = refs.passwordInput;
  const button = refs.togglePasswordButton;

  if (!input) return isVisible;

  try {
    input.type = isVisible ? "text" : "password";
  } catch {}

  if (button) {
    const showLabel = safeText(button.getAttribute("data-show-label"), DEFAULT_SHOW_PASSWORD_LABEL);
    const hideLabel = safeText(button.getAttribute("data-hide-label"), DEFAULT_HIDE_PASSWORD_LABEL);

    setAttr(button, "aria-label", isVisible ? hideLabel : showLabel);
    setAttr(button, "aria-pressed", String(isVisible));
    setData(button, "passwordVisible", isVisible ? "true" : "false");

    toggleClass(button, "is-visible", isVisible);
    toggleClass(button, "is-hidden", !isVisible);

    const icon = qs(button, "[data-password-toggle-icon]") || qs(button, ".password-toggle-icon");

    if (icon) {
      setData(icon, "state", isVisible ? "visible" : "hidden");
      toggleClass(icon, "is-visible", isVisible);
      toggleClass(icon, "is-hidden", !isVisible);
    }
  }

  return isVisible;
}

export function togglePasswordVisibility(refs = {}) {
  return setPasswordVisibility(refs, !getPasswordVisibilityState(refs));
}

/* =========================================================
   FOCUS / FORM STATE
========================================================= */

export function focusLoginPrimaryField(refs = {}, options = {}) {
  const remembered = Boolean(options.rememberedIdentifier || options.rememberedEmail);

  microtask(() => {
    if (remembered && refs.passwordInput && !refs.passwordInput.disabled) {
      focus(refs.passwordInput);
      return;
    }

    const target = refs.identifierInput || refs.emailInput;

    if (target && !target.disabled) {
      focus(target);
      select(target);
    }
  });

  return true;
}

function normalizeIdentifier(value = "") {
  return safeText(value, "").normalize("NFKC").replace(/\s+/g, " ");
}

function looksEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeText(value, ""));
}

function looksPhone(value = "") {
  return /^\+?\d{6,20}$/.test(safeText(value, "").replace(/[^\d+]/g, ""));
}

export function readLoginFormState(refs = {}) {
  const identifier = normalizeIdentifier(
    refs.identifierInput?.value ??
      refs.emailInput?.value ??
      ""
  );

  const email = looksEmail(identifier) ? identifier.toLowerCase() : "";
  const phone = !email && looksPhone(identifier) ? identifier.replace(/[^\d+]/g, "") : "";
  const username = !email && !phone ? identifier : "";

  return {
    identifier,

    email: email || identifier.toLowerCase(),
    username,
    user: username || identifier,
    login: identifier,

    phone,
    telefono: phone,

    password: rawValue(refs.passwordInput?.value, ""),

    remember: Boolean(refs.rememberInput?.checked),
    rememberMe: Boolean(refs.rememberInput?.checked),
  };
}

/* =========================================================
   BINDINGS
========================================================= */

export function bindLoginInputClearers(refs = {}, handler = null) {
  if (!isFn(handler)) return noop;

  const nodes = [
    refs.identifierInput,
    refs.emailInput,
    refs.passwordInput,
  ].filter((node, index, list) => node && list.indexOf(node) === index);

  return compose(
    nodes.flatMap((node) => [
      bindDom(node, "input", handler),
      bindDom(node, "change", handler),
    ])
  );
}

export function bindPasswordToggle(refs = {}, handler = null) {
  const button = refs.togglePasswordButton;
  if (!button) return noop;

  const existing = PASSWORD_TOGGLE_BINDINGS.get(button);
  if (existing) return existing.dispose;

  const finalHandler = isFn(handler)
    ? handler
    : (event) => {
        try {
          event?.preventDefault?.();
        } catch {}

        if (button.disabled || button.getAttribute("aria-disabled") === "true") return;

        togglePasswordVisibility(refs);
        focus(refs.passwordInput, { preventScroll: true });
      };

  const disposeEvent = bindDom(button, "click", finalHandler);

  const binding = {
    dispose() {
      try {
        disposeEvent();
      } catch {}

      PASSWORD_TOGGLE_BINDINGS.delete(button);
    },
  };

  PASSWORD_TOGGLE_BINDINGS.set(button, binding);

  return binding.dispose;
}

export function bindThemeToggle(refs = {}, handler = null) {
  const button = refs.themeToggleButton;

  if (!button || !isFn(handler)) return noop;

  const existing = THEME_BINDINGS.get(button);
  if (existing) {
    try {
      existing.dispose();
    } catch {}
  }

  const wrapped = (event) => {
    try {
      event?.preventDefault?.();
    } catch {}

    if (button.disabled || button.getAttribute("aria-disabled") === "true") return;

    handler(event);
  };

  const disposeEvent = bindDom(button, "click", wrapped);

  const binding = {
    dispose() {
      try {
        disposeEvent();
      } catch {}

      if (THEME_BINDINGS.get(button) === binding) {
        THEME_BINDINGS.delete(button);
      }
    },
  };

  THEME_BINDINGS.set(button, binding);

  return binding.dispose;
}

export function bindLoginSubmit(refs = {}, handler = null) {
  const form = refs.form;
  const button = refs.submitButton;
  const target = form || button || null;

  if (!target || !isFn(handler)) return noop;

  const existing = SUBMIT_BINDINGS.get(target);

  if (existing) {
    try {
      existing.dispose();
    } catch {}
  }

  let disposed = false;
  let inFlight = false;

  const wrapped = (event) => {
    if (disposed) return undefined;

    try {
      event?.preventDefault?.();
    } catch {}

    if (inFlight) return undefined;

    inFlight = true;

    let result;

    try {
      result = handler(event);
    } catch (error) {
      inFlight = false;
      throw error;
    }

    Promise.resolve(result)
      .catch(noop)
      .finally(() => {
        inFlight = false;
      });

    return result;
  };

  const unbinders = form
    ? [bindDom(form, "submit", wrapped)]
    : [bindDom(button, "click", wrapped)];

  const binding = {
    dispose() {
      if (disposed) return;

      disposed = true;
      inFlight = false;

      for (const dispose of unbinders.splice(0)) {
        try {
          dispose();
        } catch {}
      }

      if (SUBMIT_BINDINGS.get(target) === binding) {
        SUBMIT_BINDINGS.delete(target);
      }

      setData(form, "loginSubmitBound", null);
      setData(form, "loginSubmitBindingAt", null);
    },

    getSnapshot() {
      return {
        disposed,
        inFlight,
        target: form ? "form" : "button",
        at: iso(),
      };
    },
  };

  SUBMIT_BINDINGS.set(target, binding);

  setData(form, "loginSubmitBound", "true");
  setData(form, "loginDomSource", SOURCE);
  setData(form, "loginSubmitBindingAt", iso());

  return binding.dispose;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function nodeSnapshot(node) {
  if (!node) return { exists: false };

  return {
    exists: true,
    connected: connected(node),
    tag: safeText(node.tagName, "").toLowerCase(),
    id: safeText(node.id, ""),
    className: safeText(typeof node.className === "string" ? node.className : "", ""),

    disabled: Boolean(node.disabled),
    hidden: Boolean(node.hidden),

    ariaInvalid: safeText(node.getAttribute?.("aria-invalid"), ""),
    ariaBusy: safeText(node.getAttribute?.("aria-busy"), ""),
    ariaDisabled: safeText(node.getAttribute?.("aria-disabled"), ""),

    dataset: {
      loading: node.dataset?.loading || "",
      submitting: node.dataset?.submitting || "",
      loginSubmitting: node.dataset?.loginSubmitting || "",
      loginSubmitLocked: node.dataset?.loginSubmitLocked || "",
      invalid: node.dataset?.invalid || "",
      loginSubmitBound: node.dataset?.loginSubmitBound || "",
    },
  };
}

export function getLoginDomSnapshot(refs = {}) {
  const target = refs.form || refs.submitButton || null;
  const submitBinding = target ? SUBMIT_BINDINGS.get(target) : null;

  return {
    version: LOGIN_DOM_VERSION,

    root: nodeSnapshot(refs.root),
    form: nodeSnapshot(refs.form),
    identifierInput: nodeSnapshot(refs.identifierInput || refs.emailInput),
    passwordInput: nodeSnapshot(refs.passwordInput),
    rememberInput: nodeSnapshot(refs.rememberInput),
    errorBox: nodeSnapshot(refs.errorBox),
    submitButton: nodeSnapshot(refs.submitButton),
    themeToggleButton: nodeSnapshot(refs.themeToggleButton),
    togglePasswordButton: nodeSnapshot(refs.togglePasswordButton),

    hasSubmitBinding: Boolean(submitBinding),
    submitBinding: submitBinding?.getSnapshot?.() || null,

    hasSharedPasswordBindings: Boolean(refs.passwordFieldBindings?.length),

    passwordFieldBindingScopes: (() => {
      try {
        const out = [];
        PASSWORD_SHARED_BINDINGS.forEach?.((_value, key) => out.push(connected(key)));
        return out;
      } catch {
        return [];
      }
    })(),

    at: iso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  LOGIN_DOM_VERSION,

  getLoginRefs,

  bindLoginPasswordFields,
  destroyLoginPasswordFields,

  setFieldInvalid,
  setInputInvalid,
  setFieldError,
  clearFieldError,

  clearLoginErrors,
  applyLoginErrors,
  setGlobalLoginError,

  setLoginLoading,
  unlockLoginForm,

  getPasswordVisibilityState,
  setPasswordVisibility,
  togglePasswordVisibility,

  focusLoginPrimaryField,
  readLoginFormState,

  bindLoginInputClearers,
  bindPasswordToggle,
  bindThemeToggle,
  bindLoginSubmit,

  getLoginDomSnapshot,
};
