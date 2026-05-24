/* =========================================================
   Onion SPA - Login DOM
   Archivo: src/views/login/login.dom.js

   Responsabilidad:
   - Obtener refs del login.
   - Leer estado mínimo del formulario.
   - Mostrar/limpiar error global.
   - Marcar campos inválidos.
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
   - Sin theme toggle.
   - Sin 2FA/MFA/OTP.
========================================================= */

import { bindPasswordFieldsInScope } from "../../shared/password-field/index.js";

export const LOGIN_DOM_VERSION = "login.dom.v5";

const DEFAULT_SUBMIT_LABEL = "Entrar";
const DEFAULT_LOADING_LABEL = "Accediendo...";

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PASSWORD_LENGTH = 1024;

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

  identifierError: "[data-login-error-for='identifier'], [data-error-for='identifier'], #loginIdentifierError",
  passwordError: "[data-login-error-for='password'], [data-error-for='password'], #loginPasswordError",

  passwordToggle: "[data-password-toggle], [data-login-password-toggle]",
  forgotPasswordLink: "[data-login-password-request], .login-reset-link",
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

function isNode(value = null) {
  return Boolean(value && typeof value.nodeType === "number");
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function rawText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function redact(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function doc() {
  return isBrowser() ? document : null;
}

function safeRoot(root = null) {
  return isNode(root) ? root : doc();
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
  const scope = safeRoot(root);

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

function setDataset(node = null, key = "", value = "") {
  if (!node || !key) return false;

  try {
    if (value === null || value === undefined || value === false || value === "") {
      delete node.dataset[key];
    } else {
      node.dataset[key] = String(value);
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

  const run = () => {
    try {
      callback();
    } catch {
      // noop
    }
  };

  try {
    queueMicrotask(run);
    return true;
  } catch {
    // fallback abajo
  }

  try {
    Promise.resolve().then(run).catch(noop);
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
  const root = safeRoot(container);

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
  const root = safeRoot(container);

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

function normalizeInputBase(input = null) {
  if (!input) return false;

  try {
    input.autocapitalize = "none";
    input.spellcheck = false;
  } catch {
    // noop
  }

  return true;
}

function normalizeIdentifierInput(input = null) {
  if (!input) return false;

  normalizeInputBase(input);

  try {
    input.maxLength = MAX_IDENTIFIER_LENGTH;
    input.setAttribute("autocomplete", "username");
    input.setAttribute("inputmode", "text");
    input.setAttribute("aria-invalid", input.getAttribute("aria-invalid") || "false");
  } catch {
    // noop
  }

  return true;
}

function normalizePasswordInput(input = null) {
  if (!input) return false;

  try {
    input.maxLength = MAX_PASSWORD_LENGTH;
    input.setAttribute("autocomplete", "current-password");
    input.setAttribute("aria-invalid", input.getAttribute("aria-invalid") || "false");
  } catch {
    // noop
  }

  return true;
}

function rememberSubmitOriginalLabel(button = null) {
  if (!button) return false;

  try {
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = text(
        button.textContent,
        DEFAULT_SUBMIT_LABEL
      );
    }

    button.type = "submit";
    button.setAttribute("aria-busy", "false");
    return true;
  } catch {
    return false;
  }
}

export function getLoginRefs(container = null) {
  const safeContainer = safeRoot(container);
  const root = qs(safeContainer, SELECTORS.root) || safeContainer;
  const form = qs(root, SELECTORS.form);
  const scope = form || root || safeContainer;

  const identifierInput = qs(scope, SELECTORS.identifier);
  const passwordInput = qs(scope, SELECTORS.password);
  const submitButton = qs(scope, SELECTORS.submit);

  normalizeIdentifierInput(identifierInput);
  normalizePasswordInput(passwordInput);

  if (form) {
    try {
      form.noValidate = true;
      form.dataset.loginDomVersion = LOGIN_DOM_VERSION;
      form.setAttribute("autocomplete", "on");
    } catch {
      // noop
    }
  }

  rememberSubmitOriginalLabel(submitButton);

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

    identifierError: qs(scope, SELECTORS.identifierError),
    emailError: qs(scope, SELECTORS.identifierError),
    passwordError: qs(scope, SELECTORS.passwordError),

    togglePasswordButton: qs(scope, SELECTORS.passwordToggle),
    forgotPasswordLink: qs(scope, SELECTORS.forgotPasswordLink),

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
  setDataset(fieldNode, "invalid", active ? "true" : "");

  return true;
}

export function setInputInvalid(inputNode = null, invalid = false) {
  const active = Boolean(invalid);

  toggleClass(inputNode, "is-invalid", active);
  setAttr(inputNode, "aria-invalid", active ? "true" : "false");

  return true;
}

export function setFieldError(fieldNode = null, message = "", errorNode = null) {
  const clean = redact(text(message, ""));

  setFieldInvalid(fieldNode, Boolean(clean));

  if (errorNode) {
    setText(errorNode, clean);
    setHidden(errorNode, !clean);
    toggleClass(errorNode, "is-visible", Boolean(clean));
    setAttr(errorNode, "role", clean ? "alert" : null);
    setAttr(errorNode, "aria-live", clean ? "polite" : null);
  }

  return true;
}

export function clearFieldError(fieldNode = null, errorNode = null) {
  return setFieldError(fieldNode, "", errorNode);
}

function setGlobalError(errorBox = null, message = "") {
  const clean = redact(text(message, ""));

  if (!errorBox) return clean;

  setText(errorBox, clean);
  setHidden(errorBox, !clean);
  toggleClass(errorBox, "is-visible", Boolean(clean));
  setAttr(errorBox, "role", clean ? "alert" : null);
  setAttr(errorBox, "aria-live", clean ? "polite" : null);
  setAttr(errorBox, "aria-atomic", clean ? "true" : null);

  return clean;
}

export function clearLoginErrors(refs = {}) {
  clearFieldError(refs.fieldIdentifier || refs.fieldEmail, refs.identifierError || refs.emailError);
  clearFieldError(refs.fieldPassword, refs.passwordError);

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

  setFieldError(
    refs.fieldIdentifier || refs.fieldEmail,
    identifierError,
    refs.identifierError || refs.emailError
  );

  setFieldError(
    refs.fieldPassword,
    passwordError,
    refs.passwordError
  );

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

  setDataset(refs.root, "loading", active ? "true" : "");
  setDataset(refs.form, "submitting", active ? "true" : "");

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
    .replace(/\s+/g, " ")
    .slice(0, MAX_IDENTIFIER_LENGTH);
}

function normalizePassword(value = "") {
  return rawText(value, "").slice(0, MAX_PASSWORD_LENGTH);
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

    password: normalizePassword(refs.passwordInput?.value),
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

    hasGlobalErrorBox: Boolean(refs.errorBox),
    hasIdentifierErrorNode: Boolean(refs.identifierError || refs.emailError),
    hasPasswordErrorNode: Boolean(refs.passwordError),

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
      noOwnPasswordToggleLogic: true,
      noThemeToggle: true,

      submitIdempotent: true,
      errorsRedacted: true,
      boundedFieldReads: true,

      no2fa: true,
      noMfa: true,
      noOtp: true,

      snapshotNoFieldValues: true,
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

  getLoginDomSnapshot,
};
