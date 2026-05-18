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
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast.
   - Sin navegación.
   - Sin lógica propia de password toggle.
========================================================= */

import { bindPasswordFieldsInScope } from "../../shared/password-field/index.js";

export const LOGIN_DOM_VERSION = "login.dom.v2";

const DEFAULT_SUBMIT_LABEL = "Entrar";
const DEFAULT_LOADING_LABEL = "Accediendo...";

const PASSWORD_BINDINGS = new WeakMap();
const SUBMIT_BINDINGS = new WeakMap();

const SELECTORS = Object.freeze({
  root: "[data-login-view], #loginView, .login-view",
  form: "[data-login-form], #loginForm, form[data-auth-form='login']",

  identifier: "[data-login-identifier], #loginIdentifier, [name='identifier']",
  password: "[data-login-password], [data-password-input], #loginPassword, [name='password']",
  remember: "[data-login-remember], #loginRemember, [name='remember']",

  message: "[data-login-message], [data-login-error], #loginMessage, #loginError, .login-error",
  submit: "[data-login-submit], #loginSubmit, button[type='submit']",

  fieldIdentifier: "[data-login-field='identifier'], [data-field='identifier']",
  fieldPassword: "[data-login-field='password'], [data-field='password'], [data-password-field]",

  passwordToggle: "[data-password-toggle], [data-login-password-toggle]",
  forgotPasswordLink: "[data-login-password-request], .login-reset-link",
  themeToggle: "[data-login-theme-toggle], [data-theme-toggle]",
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

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function rawText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function doc() {
  return isBrowser() ? document : null;
}

function matches(node = null, selector = "") {
  if (!node || !selector) return false;

  try {
    return node.matches?.(selector) === true;
  } catch {
    return false;
  }
}

function qs(root = null, selector = "") {
  const scope = root || doc();

  if (!scope || !selector) return null;

  try {
    if (matches(scope, selector)) return scope;
    return scope.querySelector?.(selector) || null;
  } catch {
    return null;
  }
}

function setText(node = null, value = "") {
  if (!node) return false;

  try {
    node.textContent = text(value, "");
    return true;
  } catch {
    return false;
  }
}

function setAttr(node = null, name = "", value = null) {
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

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const value = Boolean(hidden);

  try {
    node.hidden = value;
  } catch {
    // noop
  }

  setAttr(node, "aria-hidden", value ? "true" : "false");

  return true;
}

function toggleClass(node = null, className = "", enabled = false) {
  if (!node || !className) return false;

  try {
    node.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function focus(node = null, selectText = false) {
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
    } catch {
      // noop
    }
  }

  return true;
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
    Promise.resolve().then(callback).catch(noop);
    return true;
  } catch {
    return false;
  }
}

function bindDom(node = null, eventName = "", handler = null, options = false) {
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
    } catch {
      // noop
    }
  };
}

function compose(disposers = []) {
  let disposed = false;

  return () => {
    if (disposed) return;

    disposed = true;

    while (disposers.length) {
      try {
        disposers.pop()?.();
      } catch {
        // noop
      }
    }
  };
}

function disposeBinding(binding = null) {
  try {
    if (isFn(binding)) binding();
    else if (isFn(binding?.destroy)) binding.destroy();
    else if (isFn(binding?.dispose)) binding.dispose();
    else if (isFn(binding?.unbind)) binding.unbind();
    else if (isFn(binding?.off)) binding.off();
  } catch {
    // noop
  }
}

/* =========================================================
   PASSWORD FIELD COMPARTIDO
========================================================= */

export function bindLoginPasswordFields(container = null, options = {}) {
  const root = container || doc();

  if (!root) return [];

  const previous = PASSWORD_BINDINGS.get(root);

  if (previous && options.force !== true) {
    return previous;
  }

  if (previous) {
    for (const binding of previous) {
      disposeBinding(binding);
    }

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
  const root = container || doc();

  if (!root) return false;

  const bindings = PASSWORD_BINDINGS.get(root) || [];

  for (const binding of bindings) {
    disposeBinding(binding);
  }

  PASSWORD_BINDINGS.delete(root);

  return true;
}

/* =========================================================
   REFS
========================================================= */

export function getLoginRefs(container = null) {
  const safeContainer = container || doc();
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
    } catch {
      // noop
    }
  }

  if (submitButton) {
    try {
      if (!submitButton.type) {
        submitButton.type = "submit";
      }

      if (!submitButton.dataset.originalLabel) {
        submitButton.dataset.originalLabel = text(
          submitButton.textContent,
          DEFAULT_SUBMIT_LABEL
        );
      }
    } catch {
      // noop
    }
  }

  const refs = {
    container: safeContainer,
    root,
    form,

    identifierInput,
    emailInput: identifierInput,
    passwordInput,

    rememberInput: qs(scope, SELECTORS.remember),
    errorBox: qs(scope, SELECTORS.message),
    submitButton,

    fieldIdentifier: qs(scope, SELECTORS.fieldIdentifier),
    fieldEmail: qs(scope, SELECTORS.fieldIdentifier),
    fieldPassword: qs(scope, SELECTORS.fieldPassword),

    togglePasswordButton: qs(scope, SELECTORS.passwordToggle),
    forgotPasswordLink: qs(scope, SELECTORS.forgotPasswordLink),
    themeToggleButton: qs(scope, SELECTORS.themeToggle),

    passwordFieldBindings: [],
  };

  refs.passwordField = {
    input: refs.passwordInput,
    toggle: refs.togglePasswordButton,
  };

  return refs;
}

/* =========================================================
   ERRORS
========================================================= */

export function setFieldInvalid(fieldNode = null, invalid = false) {
  const active = Boolean(invalid);

  toggleClass(fieldNode, "is-invalid", active);

  try {
    if (fieldNode) {
      if (active) {
        fieldNode.dataset.invalid = "true";
      } else {
        delete fieldNode.dataset.invalid;
      }
    }
  } catch {
    // noop
  }

  return true;
}

export function setInputInvalid(inputNode = null, invalid = false) {
  const active = Boolean(invalid);

  toggleClass(inputNode, "is-invalid", active);
  setAttr(inputNode, "aria-invalid", active ? "true" : null);

  return true;
}

export function setFieldError(fieldNode = null, message = "", errorNode = null) {
  const clean = text(message, "");

  setFieldInvalid(fieldNode, Boolean(clean));

  if (errorNode) {
    setText(errorNode, clean);
    setHidden(errorNode, !clean);
    setAttr(errorNode, "role", clean ? "alert" : null);
  }

  return true;
}

export function clearFieldError(fieldNode = null, errorNode = null) {
  return setFieldError(fieldNode, "", errorNode);
}

function setGlobalError(errorBox = null, message = "") {
  const clean = text(message, "");

  if (!errorBox) return clean;

  setText(errorBox, clean);
  setHidden(errorBox, !clean);
  toggleClass(errorBox, "is-visible", Boolean(clean));
  setAttr(errorBox, "role", clean ? "alert" : null);
  setAttr(errorBox, "aria-live", clean ? "polite" : null);

  return clean;
}

export function clearLoginErrors(refs = {}) {
  setFieldInvalid(refs.fieldIdentifier || refs.fieldEmail, false);
  setFieldInvalid(refs.fieldPassword, false);

  setInputInvalid(refs.identifierInput || refs.emailInput, false);
  setInputInvalid(refs.passwordInput, false);

  setGlobalError(refs.errorBox, "");

  try {
    refs.form?.removeAttribute("data-error");
  } catch {
    // noop
  }

  return true;
}

export function applyLoginErrors(refs = {}, errors = {}, options = {}) {
  const identifierError =
    text(errors.identifier, "") ||
    text(errors.email, "") ||
    text(errors.username, "") ||
    text(errors.user, "") ||
    text(errors.login, "");

  const passwordError = text(errors.password, "");

  const globalError =
    text(errors.global, "") ||
    text(errors.form, "") ||
    text(errors.message, "");

  const firstError = identifierError || passwordError || globalError;

  setFieldInvalid(refs.fieldIdentifier || refs.fieldEmail, Boolean(identifierError));
  setFieldInvalid(refs.fieldPassword, Boolean(passwordError));

  setInputInvalid(refs.identifierInput || refs.emailInput, Boolean(identifierError));
  setInputInvalid(refs.passwordInput, Boolean(passwordError));

  setGlobalError(refs.errorBox, firstError);

  try {
    if (refs.form) {
      if (firstError) {
        refs.form.dataset.error = "true";
      } else {
        delete refs.form.dataset.error;
      }
    }
  } catch {
    // noop
  }

  if (options.focus !== false) {
    later(() => {
      if (identifierError) {
        focus(refs.identifierInput || refs.emailInput, true);
      } else if (passwordError) {
        focus(refs.passwordInput);
      }
    });
  }

  return firstError;
}

export function setGlobalLoginError(refs = {}, message = "") {
  const clean = setGlobalError(refs.errorBox, message);

  try {
    if (refs.form) {
      if (clean) {
        refs.form.dataset.error = "true";
      } else {
        delete refs.form.dataset.error;
      }
    }
  } catch {
    // noop
  }

  return clean;
}

/* =========================================================
   LOADING
========================================================= */

function originalSubmitLabel(button = null) {
  if (!button) return DEFAULT_SUBMIT_LABEL;

  try {
    return (
      text(button.dataset.originalLabel, "") ||
      text(button.textContent, DEFAULT_SUBMIT_LABEL)
    );
  } catch {
    return DEFAULT_SUBMIT_LABEL;
  }
}

function setLoadingDisabled(node = null, loading = false) {
  if (!node) return false;

  const active = Boolean(loading);

  try {
    if (active) {
      if (!node.disabled) {
        node.dataset.loginDisabledByLoading = "true";
      }

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
      if (active) {
        refs.form.dataset.submitting = "true";
      } else {
        delete refs.form.dataset.submitting;
      }
    }
  } catch {
    // noop
  }

  setLoadingDisabled(refs.submitButton, active);
  setLoadingDisabled(refs.identifierInput || refs.emailInput, active);
  setLoadingDisabled(refs.passwordInput, active);
  setLoadingDisabled(refs.togglePasswordButton, active);
  setLoadingDisabled(refs.rememberInput, active);

  if (refs.submitButton) {
    const submitLabel = text(options.submitLabel, originalSubmitLabel(refs.submitButton));
    const loadingLabel = text(options.loadingLabel, DEFAULT_LOADING_LABEL);

    setText(refs.submitButton, active ? loadingLabel : submitLabel);
    setAttr(refs.submitButton, "aria-busy", active ? "true" : "false");
    setAttr(refs.submitButton, "aria-disabled", active ? "true" : null);
  }

  return true;
}

export function unlockLoginForm(refs = {}, options = {}) {
  return setLoginLoading(refs, false, options);
}

/* =========================================================
   FORM STATE
========================================================= */

function normalizeIdentifier(value = "") {
  return text(value, "")
    .normalize("NFKC")
    .replace(/\s+/g, " ");
}

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export function readLoginFormState(refs = {}) {
  const identifier = normalizeIdentifier(
    refs.identifierInput?.value ?? refs.emailInput?.value ?? ""
  );

  const email = looksLikeEmail(identifier)
    ? identifier.toLowerCase()
    : "";

  return {
    identifier,

    email,
    username: email ? "" : identifier,
    user: identifier,
    login: identifier,

    password: rawText(refs.passwordInput?.value, ""),
    remember: Boolean(refs.rememberInput?.checked),
    rememberMe: Boolean(refs.rememberInput?.checked),
  };
}

export function focusLoginPrimaryField(refs = {}, options = {}) {
  later(() => {
    const identifier = normalizeIdentifier(refs.identifierInput?.value ?? "");

    if ((options.rememberedIdentifier || identifier) && refs.passwordInput) {
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
    nodes.map((node) => bindDom(node, "input", handler))
  );
}

export function bindLoginSubmit(refs = {}, handler = null) {
  const target = refs.form || refs.submitButton;

  if (!target || !isFn(handler)) return noop;

  const previous = SUBMIT_BINDINGS.get(target);

  if (previous) {
    previous();
  }

  let locked = false;

  const onSubmit = (event) => {
    try {
      event?.preventDefault?.();
    } catch {
      // noop
    }

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
      .catch(noop)
      .finally(() => {
        locked = false;
      });

    return result;
  };

  const disposeEvent = bindDom(
    target,
    refs.form ? "submit" : "click",
    onSubmit
  );

  const dispose = () => {
    locked = false;
    disposeEvent();
    SUBMIT_BINDINGS.delete(target);
  };

  SUBMIT_BINDINGS.set(target, dispose);

  return dispose;
}

/* =========================================================
   COMPAT MÍNIMA
========================================================= */

export function getPasswordVisibilityState(refs = {}) {
  return refs.passwordInput?.type === "text";
}

export function setPasswordVisibility(refs = {}, visible = false) {
  const binding = refs.passwordFieldBindings?.[0];

  if (isFn(binding?.setVisible)) {
    return binding.setVisible(Boolean(visible));
  }

  return getPasswordVisibilityState(refs);
}

export function togglePasswordVisibility(refs = {}) {
  const binding = refs.passwordFieldBindings?.[0];

  if (isFn(binding?.toggleVisibility)) {
    return binding.toggleVisibility();
  }

  return getPasswordVisibilityState(refs);
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
    } catch {
      // noop
    }

    handler(event);
  });
}

/* =========================================================
   SNAPSHOT
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

    policy: {
      domOnly: true,
      noAuth: true,
      noHttp: true,
      noRouter: true,
      noStore: true,
      noToast: true,
      noNavigation: true,
      passwordFieldShared: true,
      submitIdempotent: true,
    },
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

  focusLoginPrimaryField,
  readLoginFormState,

  bindLoginInputClearers,
  bindLoginSubmit,

  getPasswordVisibilityState,
  setPasswordVisibility,
  togglePasswordVisibility,
  bindPasswordToggle,
  bindThemeToggle,

  getLoginDomSnapshot,
};
