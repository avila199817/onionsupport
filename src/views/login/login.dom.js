/* =========================================================
   Onion SPA - Login DOM
   Archivo: src/views/login/login.dom.js

   Responsabilidad:
   - Obtener refs del login.
   - Leer estado del formulario.
   - Mostrar/limpiar error global.
   - Estado loading mínimo.
   - Binding submit idempotente.
   - Delegar password-field al componente compartido.
   - Sin Auth, HTTP, Router, Store ni Toast.
   - Sin duplicar lógica del password-field.
========================================================= */

import { bindPasswordFieldsInScope } from "../../shared/password-field/index.js";

export const LOGIN_DOM_VERSION = "minimal-1";

const DEFAULT_SUBMIT_LABEL = "Entrar";
const DEFAULT_LOADING_LABEL = "Accediendo...";

const PASSWORD_BINDINGS = new WeakMap();
const SUBMIT_BINDINGS = new WeakMap();

const SELECTORS = Object.freeze({
  root: "[data-login-view], #loginView, .login-view",
  form: "[data-login-form], #loginForm, form[data-auth-form='login']",

  identifier:
    "[data-login-identifier], #loginIdentifier, [name='identifier'], [name='email'], [name='username'], input[autocomplete='username']",

  password:
    "[data-login-password], [data-password-input], #loginPassword, [name='password'], input[autocomplete='current-password']",

  remember: "[data-login-remember], #loginRemember, [name='remember']",

  errorBox:
    "[data-login-message], [data-login-error], #loginMessage, #loginError, .login-error",

  submit: "[data-login-submit], #loginSubmit, button[type='submit']",

  forgotPasswordLink:
    "[data-login-password-request], [data-forgot-password-link], .login-reset-link",

  fieldIdentifier:
    "[data-login-field='identifier'], [data-field='identifier'], [data-field='email']",

  fieldPassword:
    "[data-login-field='password'], [data-field='password'], [data-password-field]",

  passwordToggle:
    "[data-password-toggle], [data-login-password-toggle]",

  capsIndicator:
    "[data-password-caps], [data-login-caps]",

  themeToggle:
    "[data-login-theme-toggle], [data-theme-toggle]",
});

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function noop() {}

function safeText(value, fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function rawText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function getDocumentRoot() {
  return isBrowser() ? document : null;
}

function qs(root, selector) {
  const scope = root || getDocumentRoot();
  if (!scope || !selector) return null;

  try {
    return scope.querySelector(selector);
  } catch {
    return null;
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

function setAttr(node, name, value) {
  if (!node || !name) return false;

  try {
    if (value === null || value === undefined || value === false || value === "") {
      node.removeAttribute(name);
    } else {
      node.setAttribute(name, String(value));
    }

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

function focus(node, selectText = false) {
  if (!node || node.disabled) return false;

  try {
    node.focus({ preventScroll: true });
  } catch {
    try {
      node.focus();
    } catch {
      return false;
    }
  }

  if (selectText) {
    try {
      node.select?.();
    } catch {}
  }

  return true;
}

function later(callback) {
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

function bindDom(node, eventName, handler, options = false) {
  if (!node || !eventName || !isFn(handler)) return noop;

  let disposed = false;

  try {
    node.addEventListener(eventName, handler, options);
  } catch {
    return noop;
  }

  return () => {
    if (disposed) return;
    disposed = true;

    try {
      node.removeEventListener(eventName, handler, options);
    } catch {}
  };
}

function compose(disposers = []) {
  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    for (const dispose of disposers) {
      try {
        dispose?.();
      } catch {}
    }
  };
}

function disposeBinding(binding) {
  try {
    if (isFn(binding)) binding();
    else if (isFn(binding?.destroy)) binding.destroy();
    else if (isFn(binding?.dispose)) binding.dispose();
    else if (isFn(binding?.unbind)) binding.unbind();
    else if (isFn(binding?.off)) binding.off();
  } catch {}
}

/* =========================================================
   PASSWORD FIELD COMPARTIDO
========================================================= */

export function bindLoginPasswordFields(container = null, options = {}) {
  const root = container || getDocumentRoot();
  if (!root) return [];

  const previous = PASSWORD_BINDINGS.get(root);

  if (previous && options.force !== true) {
    return previous;
  }

  if (previous && options.force === true) {
    for (const binding of previous) disposeBinding(binding);
    PASSWORD_BINDINGS.delete(root);
  }

  let bindings = [];

  try {
    const result = bindPasswordFieldsInScope(root);
    bindings = Array.isArray(result) ? result : result ? [result] : [];
  } catch {
    bindings = [];
  }

  PASSWORD_BINDINGS.set(root, bindings);
  return bindings;
}

export function destroyLoginPasswordFields(container = null) {
  const root = container || getDocumentRoot();
  if (!root) return false;

  const bindings = PASSWORD_BINDINGS.get(root) || [];

  for (const binding of bindings) disposeBinding(binding);

  PASSWORD_BINDINGS.delete(root);
  return true;
}

/* =========================================================
   REFS
========================================================= */

export function getLoginRefs(container = null) {
  const safeContainer = container || getDocumentRoot();
  const root = qs(safeContainer, SELECTORS.root) || safeContainer;
  const form = qs(root, SELECTORS.form);
  const scope = form || root || safeContainer;

  const identifierInput = qs(scope, SELECTORS.identifier);
  const passwordInput = qs(scope, SELECTORS.password);
  const submitButton = qs(scope, SELECTORS.submit);

  if (form) {
    try {
      form.noValidate = true;
      form.dataset.loginDomVersion = LOGIN_DOM_VERSION;
    } catch {}
  }

  if (submitButton) {
    try {
      if (!submitButton.getAttribute("type")) submitButton.setAttribute("type", "submit");

      if (!submitButton.dataset.originalLabel) {
        submitButton.dataset.originalLabel = safeText(
          submitButton.textContent,
          DEFAULT_SUBMIT_LABEL
        );
      }
    } catch {}
  }

  const refs = {
    container: safeContainer,
    root,
    form,

    identifierInput,
    emailInput: identifierInput,

    passwordInput,
    rememberInput: qs(scope, SELECTORS.remember),
    errorBox: qs(scope, SELECTORS.errorBox),
    submitButton,
    forgotPasswordLink: qs(scope, SELECTORS.forgotPasswordLink),

    fieldIdentifier: qs(scope, SELECTORS.fieldIdentifier),
    fieldEmail: qs(scope, SELECTORS.fieldIdentifier),
    fieldPassword: qs(scope, SELECTORS.fieldPassword),

    togglePasswordButton: qs(scope, SELECTORS.passwordToggle),
    capsIndicator: qs(scope, SELECTORS.capsIndicator),
    themeToggleButton: qs(scope, SELECTORS.themeToggle),

    passwordFieldBindings: [],
  };

  refs.passwordField = {
    input: refs.passwordInput,
    toggle: refs.togglePasswordButton,
    capsIndicator: refs.capsIndicator,
  };

  return refs;
}

/* =========================================================
   ERRORS
========================================================= */

export function setFieldInvalid(fieldNode, invalid = false) {
  const active = Boolean(invalid);

  toggleClass(fieldNode, "is-invalid", active);

  try {
    if (fieldNode) {
      if (active) fieldNode.dataset.invalid = "true";
      else delete fieldNode.dataset.invalid;
    }
  } catch {}

  return true;
}

export function setInputInvalid(inputNode, invalid = false) {
  const active = Boolean(invalid);

  toggleClass(inputNode, "is-invalid", active);
  setAttr(inputNode, "aria-invalid", active ? "true" : "false");

  return true;
}

export function setFieldError(fieldNode, message = "", errorNode = null) {
  const text = safeText(message, "");

  setFieldInvalid(fieldNode, Boolean(text));

  if (errorNode) {
    setText(errorNode, text);
    setHidden(errorNode, !text);
    setAttr(errorNode, "role", text ? "alert" : null);
  }

  return true;
}

export function clearFieldError(fieldNode, errorNode = null) {
  return setFieldError(fieldNode, "", errorNode);
}

function setGlobalError(errorBox, message = "") {
  const text = safeText(message, "");

  if (!errorBox) return text;

  setText(errorBox, text);
  setHidden(errorBox, !text);
  toggleClass(errorBox, "is-visible", Boolean(text));
  setAttr(errorBox, "role", text ? "alert" : null);
  setAttr(errorBox, "aria-live", text ? "polite" : null);

  return text;
}

export function clearLoginErrors(refs = {}) {
  setFieldInvalid(refs.fieldIdentifier || refs.fieldEmail, false);
  setFieldInvalid(refs.fieldPassword, false);

  setInputInvalid(refs.identifierInput || refs.emailInput, false);
  setInputInvalid(refs.passwordInput, false);

  setGlobalError(refs.errorBox, "");

  try {
    refs.form?.removeAttribute("data-error");
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

  const firstError = identifierError || passwordError || globalError;

  setFieldInvalid(refs.fieldIdentifier || refs.fieldEmail, Boolean(identifierError));
  setFieldInvalid(refs.fieldPassword, Boolean(passwordError));

  setInputInvalid(refs.identifierInput || refs.emailInput, Boolean(identifierError));
  setInputInvalid(refs.passwordInput, Boolean(passwordError));

  setGlobalError(refs.errorBox, firstError);

  try {
    if (refs.form) {
      if (firstError) refs.form.dataset.error = "true";
      else delete refs.form.dataset.error;
    }
  } catch {}

  if (options.focus !== false) {
    later(() => {
      if (identifierError) focus(refs.identifierInput || refs.emailInput, true);
      else if (passwordError) focus(refs.passwordInput);
    });
  }

  return firstError;
}

export function setGlobalLoginError(refs = {}, message = "") {
  const text = setGlobalError(refs.errorBox, message);

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

function originalSubmitLabel(button) {
  if (!button) return DEFAULT_SUBMIT_LABEL;

  try {
    return safeText(button.dataset.originalLabel, "") ||
      safeText(button.textContent, DEFAULT_SUBMIT_LABEL);
  } catch {
    return DEFAULT_SUBMIT_LABEL;
  }
}

function setLoadingDisabled(node, loading = false) {
  if (!node) return false;

  const active = Boolean(loading);

  try {
    if (active) {
      if (!node.disabled) node.dataset.loginDisabledByLoading = "true";
      node.disabled = true;
      return true;
    }

    if (node.dataset.loginDisabledByLoading === "true") {
      node.disabled = false;
    }

    delete node.dataset.loginDisabledByLoading;
    return true;
  } catch {
    return false;
  }
}

export function setLoginLoading(refs = {}, loading = false, options = {}) {
  const active = Boolean(loading);

  toggleClass(refs.root, "is-loading", active);
  setAttr(refs.form, "aria-busy", active ? "true" : "false");

  try {
    if (refs.form) {
      if (active) refs.form.dataset.submitting = "true";
      else delete refs.form.dataset.submitting;
    }
  } catch {}

  setLoadingDisabled(refs.submitButton, active);
  setLoadingDisabled(refs.identifierInput || refs.emailInput, active);
  setLoadingDisabled(refs.passwordInput, active);
  setLoadingDisabled(refs.rememberInput, active);

  if (refs.submitButton) {
    const loadingLabel = safeText(options.loadingLabel, DEFAULT_LOADING_LABEL);
    const submitLabel = safeText(options.submitLabel, originalSubmitLabel(refs.submitButton));

    setText(refs.submitButton, active ? loadingLabel : submitLabel);
    setAttr(refs.submitButton, "aria-busy", active ? "true" : "false");
    setAttr(refs.submitButton, "aria-disabled", active ? "true" : "false");
  }

  return true;
}

export function unlockLoginForm(refs = {}, options = {}) {
  return setLoginLoading(refs, false, options);
}

/* =========================================================
   PASSWORD VISIBILITY
   Nota:
   - La lógica real debe vivir en shared/password-field.
   - Estas funciones quedan ligeras para no romper imports.
========================================================= */

export function getPasswordVisibilityState(refs = {}) {
  return refs.passwordInput?.type === "text";
}

export function setPasswordVisibility(refs = {}, visible = false) {
  const active = Boolean(visible);

  try {
    if (refs.passwordInput) {
      refs.passwordInput.type = active ? "text" : "password";
    }
  } catch {}

  return active;
}

export function togglePasswordVisibility(refs = {}) {
  return setPasswordVisibility(refs, !getPasswordVisibilityState(refs));
}

/* =========================================================
   FORM STATE
========================================================= */

function normalizeIdentifier(value = "") {
  return safeText(value, "").normalize("NFKC").replace(/\s+/g, " ");
}

export function readLoginFormState(refs = {}) {
  const identifier = normalizeIdentifier(
    refs.identifierInput?.value ?? refs.emailInput?.value ?? ""
  );

  return {
    identifier,
    email: identifier.toLowerCase(),
    username: identifier,
    user: identifier,
    login: identifier,
    password: rawText(refs.passwordInput?.value, ""),
    remember: Boolean(refs.rememberInput?.checked),
    rememberMe: Boolean(refs.rememberInput?.checked),
  };
}

export function focusLoginPrimaryField(refs = {}, options = {}) {
  later(() => {
    const hasIdentifier = Boolean(normalizeIdentifier(refs.identifierInput?.value ?? ""));

    if ((options.rememberedIdentifier || hasIdentifier) && refs.passwordInput) {
      focus(refs.passwordInput);
      return;
    }

    focus(refs.identifierInput || refs.emailInput, true);
  });

  return true;
}

/* =========================================================
   BINDINGS
========================================================= */

export function bindLoginInputClearers(refs = {}, handler = null) {
  if (!isFn(handler)) return noop;

  const nodes = [
    refs.identifierInput || refs.emailInput,
    refs.passwordInput,
  ].filter(Boolean);

  return compose(
    nodes.flatMap((node) => [
      bindDom(node, "input", handler),
      bindDom(node, "change", handler),
    ])
  );
}

export function bindLoginSubmit(refs = {}, handler = null) {
  const target = refs.form || refs.submitButton;
  if (!target || !isFn(handler)) return noop;

  const previous = SUBMIT_BINDINGS.get(target);
  if (previous) previous();

  let locked = false;

  const onSubmit = (event) => {
    try {
      event?.preventDefault?.();
    } catch {}

    if (locked) return undefined;
    locked = true;

    let result;

    try {
      result = handler(event);
    } catch (error) {
      locked = false;
      throw error;
    }

    Promise.resolve(result)
      .finally(() => {
        locked = false;
      })
      .catch(noop);

    return result;
  };

  const disposeEvent = bindDom(target, refs.form ? "submit" : "click", onSubmit);

  const dispose = () => {
    locked = false;
    disposeEvent();
    SUBMIT_BINDINGS.delete(target);
  };

  SUBMIT_BINDINGS.set(target, dispose);
  return dispose;
}

export function bindPasswordToggle(refs = {}, handler = null) {
  if (isFn(handler) && refs.togglePasswordButton) {
    return bindDom(refs.togglePasswordButton, "click", handler);
  }

  bindLoginPasswordFields(refs.root || refs.form || refs.container);
  return noop;
}

export function bindThemeToggle(refs = {}, handler = null) {
  if (!refs.themeToggleButton || !isFn(handler)) return noop;

  return bindDom(refs.themeToggleButton, "click", (event) => {
    try {
      event?.preventDefault?.();
    } catch {}

    handler(event);
  });
}

/* =========================================================
   SNAPSHOT MÍNIMO
========================================================= */

export function getLoginDomSnapshot(refs = {}) {
  return {
    version: LOGIN_DOM_VERSION,
    hasRoot: Boolean(refs.root),
    hasForm: Boolean(refs.form),
    hasIdentifier: Boolean(refs.identifierInput || refs.emailInput),
    hasPassword: Boolean(refs.passwordInput),
    hasSubmit: Boolean(refs.submitButton),
    submitting: refs.form?.dataset?.submitting === "true",
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
