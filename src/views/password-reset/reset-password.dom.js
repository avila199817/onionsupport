/* =========================================================
   Onion SPA - Reset Password DOM
   Archivo: src/views/password-reset/reset-password.dom.js

   Responsabilidad:
   - Obtener refs de password reset.
   - Leer estado del formulario.
   - Mostrar/limpiar error global.
   - Marcar campos inválidos.
   - Estado loading mínimo.
   - Binding submit idempotente.
   - Delegar password-field al componente compartido.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast propio.
   - Sin theme toggle propio.
   - Sin innerHTML.
   - Sin navegación.
   - Sin lógica propia de password toggle.
========================================================= */

import { bindPasswordFieldsInScope } from "../../shared/password-field/index.js";

export const RESET_PASSWORD_DOM_VERSION = "reset-password.dom.v4";

const DEFAULT_REQUEST_SUBMIT_LABEL = "Enviar enlace";
const DEFAULT_CONFIRM_SUBMIT_LABEL = "Cambiar contraseña";
const DEFAULT_LOADING_LABEL = "Procesando...";

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_TOKEN_LENGTH = 8192;
const MAX_PASSWORD_LENGTH = 1024;

const PASSWORD_BINDINGS = new WeakMap();
const SUBMIT_BINDINGS = new WeakMap();

const SELECTORS = Object.freeze({
  root:
    "[data-password-reset-view], [data-reset-password-view], #passwordResetView, .password-reset-view",

  form:
    "[data-password-reset-form], [data-reset-password-form], #passwordResetForm",

  identifier:
    "[data-password-reset-identifier], [data-reset-password-identifier], #passwordResetIdentifier, [name='identifier'], [name='email']",

  token:
    "[data-password-reset-token], [data-reset-token], [name='token']",

  password:
    "[data-password-reset-password], [data-reset-password-password], #passwordResetPassword, [name='password']",

  confirmPassword:
    "[data-password-reset-confirm], [data-reset-password-confirm], #passwordResetConfirmPassword, [name='confirmPassword'], [name='passwordConfirm']",

  message:
    "[data-password-reset-message], [data-reset-password-message], [data-password-reset-error], [data-reset-password-error], #passwordResetMessage, .password-reset-message",

  submit:
    "[data-password-reset-submit], [data-reset-password-submit], #passwordResetSubmit, button[type='submit']",

  back:
    "[data-password-reset-back], [data-reset-password-back], .password-reset-back-link",

  fieldIdentifier:
    "[data-password-reset-field='identifier'], [data-reset-password-field='identifier'], [data-field='identifier']",

  fieldPassword:
    "[data-password-reset-field='password'], [data-reset-password-field='password'], [data-field='password']",

  fieldConfirm:
    "[data-password-reset-field='confirm-password'], [data-reset-password-field='confirm-password'], [data-field='confirm-password']",

  identifierError:
    "[data-password-reset-error-for='identifier'], [data-reset-password-error-for='identifier'], [data-error-for='identifier'], #passwordResetIdentifierError",

  tokenError:
    "[data-password-reset-error-for='token'], [data-reset-password-error-for='token'], [data-error-for='token'], #passwordResetTokenError",

  passwordError:
    "[data-password-reset-error-for='password'], [data-reset-password-error-for='password'], [data-error-for='password'], #passwordResetPasswordError",

  confirmPasswordError:
    "[data-password-reset-error-for='confirm-password'], [data-reset-password-error-for='confirm-password'], [data-error-for='confirm-password'], #passwordResetConfirmPasswordError",

  passwordToggle:
    "[data-password-toggle], [data-reset-password-toggle], [data-password-reset-toggle]",
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

function qsa(root = null, selector = "") {
  const scope = safeRoot(root);

  if (!scope || !selector) return [];

  try {
    return [...(scope.querySelectorAll?.(selector) || [])];
  } catch {
    return [];
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

function modeFromRefs(refs = {}) {
  const mode = text(
    refs.form?.dataset?.passwordResetFlow ||
      refs.form?.dataset?.resetPasswordFlow ||
      refs.root?.dataset?.passwordResetMode ||
      refs.root?.dataset?.resetPasswordMode ||
      "",
    "request"
  ).toLowerCase();

  return mode === "confirm" ? "confirm" : "request";
}

function submitDefaultLabel(refs = {}) {
  return modeFromRefs(refs) === "confirm"
    ? DEFAULT_CONFIRM_SUBMIT_LABEL
    : DEFAULT_REQUEST_SUBMIT_LABEL;
}

/* =========================================================
   PASSWORD FIELD COMPARTIDO
========================================================= */

export function bindResetPasswordFields(container = null, options = {}) {
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

export function destroyResetPasswordFields(container = null) {
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

function normalizeTextInput(input = null, maxLength = 160) {
  if (!input) return false;

  try {
    input.maxLength = maxLength;
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.setAttribute("aria-invalid", input.getAttribute("aria-invalid") || "false");
  } catch {
    // noop
  }

  return true;
}

function normalizeIdentifierInput(input = null) {
  if (!normalizeTextInput(input, MAX_IDENTIFIER_LENGTH)) return false;

  try {
    input.setAttribute("autocomplete", "username");
    input.setAttribute("inputmode", "text");
  } catch {
    // noop
  }

  return true;
}

function normalizeTokenInput(input = null) {
  if (!normalizeTextInput(input, MAX_TOKEN_LENGTH)) return false;

  try {
    input.setAttribute("autocomplete", "off");
    input.setAttribute("inputmode", "text");
  } catch {
    // noop
  }

  return true;
}

function normalizePasswordInput(input = null, autocomplete = "new-password") {
  if (!input) return false;

  try {
    input.maxLength = MAX_PASSWORD_LENGTH;
    input.setAttribute("autocomplete", autocomplete);
    input.setAttribute("aria-invalid", input.getAttribute("aria-invalid") || "false");
  } catch {
    // noop
  }

  return true;
}

function rememberSubmitOriginalLabel(button = null, refs = {}) {
  if (!button) return false;

  try {
    if (!button.type) {
      button.type = "submit";
    }

    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = text(
        button.textContent,
        submitDefaultLabel(refs)
      );
    }

    button.setAttribute("aria-busy", "false");
    return true;
  } catch {
    return false;
  }
}

export function getResetPasswordRefs(container = null) {
  const safeContainer = safeRoot(container);
  const root = qs(safeContainer, SELECTORS.root) || safeContainer;
  const form = qs(root, SELECTORS.form);
  const scope = form || root || safeContainer;

  const identifierInput = qs(scope, SELECTORS.identifier);
  const tokenInput = qs(scope, SELECTORS.token);
  const passwordInput = qs(scope, SELECTORS.password);
  const confirmPasswordInput = qs(scope, SELECTORS.confirmPassword);
  const submitButton = qs(scope, SELECTORS.submit);

  const refsForMode = {
    root,
    form,
  };

  normalizeIdentifierInput(identifierInput);
  normalizeTokenInput(tokenInput);
  normalizePasswordInput(passwordInput);
  normalizePasswordInput(confirmPasswordInput);

  if (form) {
    try {
      form.noValidate = true;
      form.dataset.resetPasswordDomVersion = RESET_PASSWORD_DOM_VERSION;
    } catch {
      // noop
    }
  }

  rememberSubmitOriginalLabel(submitButton, refsForMode);

  const refs = {
    container: safeContainer,
    root,
    form,

    identifierInput,
    emailInput: identifierInput,

    tokenInput,

    passwordInput,
    confirmPasswordInput,

    submitButton,
    backToLoginLink: qs(scope, SELECTORS.back),

    errorBox: qs(scope, SELECTORS.message),

    fieldIdentifier: qs(scope, SELECTORS.fieldIdentifier),
    fieldEmail: qs(scope, SELECTORS.fieldIdentifier),
    fieldPassword: qs(scope, SELECTORS.fieldPassword),
    fieldConfirmPassword: qs(scope, SELECTORS.fieldConfirm),

    identifierError: qs(scope, SELECTORS.identifierError),
    emailError: qs(scope, SELECTORS.identifierError),
    tokenError: qs(scope, SELECTORS.tokenError),
    passwordError: qs(scope, SELECTORS.passwordError),
    confirmPasswordError: qs(scope, SELECTORS.confirmPasswordError),

    passwordToggleButtons: qsa(scope, SELECTORS.passwordToggle),
    passwordFieldBindings: [],

    mode: modeFromRefs({ root, form }),
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

function setGlobalMessage(errorBox = null, message = "", type = "error") {
  const clean = redact(text(message, ""));
  const cleanType = ["error", "success", "info"].includes(type) ? type : "error";

  if (!errorBox) return clean;

  setText(errorBox, clean);
  setHidden(errorBox, !clean);

  toggleClass(errorBox, "is-visible", Boolean(clean));
  toggleClass(errorBox, "is-error", Boolean(clean) && cleanType === "error");
  toggleClass(errorBox, "is-success", Boolean(clean) && cleanType === "success");
  toggleClass(errorBox, "is-info", Boolean(clean) && cleanType === "info");

  setAttr(errorBox, "role", clean ? (cleanType === "error" ? "alert" : "status") : null);
  setAttr(errorBox, "aria-live", clean ? (cleanType === "error" ? "assertive" : "polite") : null);
  setAttr(errorBox, "aria-atomic", clean ? "true" : null);

  setDataset(errorBox, "messageType", clean ? cleanType : "");

  return clean;
}

export function clearResetPasswordErrors(refs = {}) {
  clearFieldError(refs.fieldIdentifier || refs.fieldEmail, refs.identifierError || refs.emailError);
  clearFieldError(null, refs.tokenError);
  clearFieldError(refs.fieldPassword, refs.passwordError);
  clearFieldError(refs.fieldConfirmPassword, refs.confirmPasswordError);

  setInputInvalid(refs.identifierInput || refs.emailInput, false);
  setInputInvalid(refs.tokenInput, false);
  setInputInvalid(refs.passwordInput, false);
  setInputInvalid(refs.confirmPasswordInput, false);

  setGlobalMessage(refs.errorBox, "");

  try {
    refs.form?.removeAttribute("data-error");
    refs.form?.removeAttribute("data-success");
  } catch {
    // noop
  }

  return true;
}

export function applyResetPasswordErrors(refs = {}, errors = {}, options = {}) {
  const identifierError =
    text(errors.identifier, "") ||
    text(errors.email, "") ||
    text(errors.username, "") ||
    text(errors.login, "");

  const tokenError = text(errors.token, "");

  const passwordError = text(errors.password, "");

  const confirmPasswordError =
    text(errors.confirmPassword, "") ||
    text(errors.confirm, "") ||
    text(errors.passwordConfirm, "");

  const globalError =
    text(errors.global, "") ||
    text(errors.form, "") ||
    text(errors.message, "");

  const firstError =
    identifierError ||
    tokenError ||
    passwordError ||
    confirmPasswordError ||
    globalError;

  setFieldError(
    refs.fieldIdentifier || refs.fieldEmail,
    identifierError,
    refs.identifierError || refs.emailError
  );

  setFieldError(
    null,
    tokenError,
    refs.tokenError
  );

  setFieldError(
    refs.fieldPassword,
    passwordError,
    refs.passwordError
  );

  setFieldError(
    refs.fieldConfirmPassword,
    confirmPasswordError,
    refs.confirmPasswordError
  );

  setInputInvalid(refs.identifierInput || refs.emailInput, Boolean(identifierError));
  setInputInvalid(refs.tokenInput, Boolean(tokenError));
  setInputInvalid(refs.passwordInput, Boolean(passwordError));
  setInputInvalid(refs.confirmPasswordInput, Boolean(confirmPasswordError));

  const visibleError = setGlobalMessage(refs.errorBox, firstError, "error");

  try {
    if (refs.form) {
      if (firstError) {
        refs.form.dataset.error = "true";
        refs.form.removeAttribute("data-success");
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
      } else if (tokenError) {
        focus(refs.tokenInput, true);
      } else if (passwordError) {
        focus(refs.passwordInput);
      } else if (confirmPasswordError) {
        focus(refs.confirmPasswordInput);
      }
    });
  }

  return visibleError;
}

export function setGlobalResetPasswordError(refs = {}, message = "") {
  const clean = setGlobalMessage(refs.errorBox, message, "error");

  try {
    if (refs.form) {
      if (clean) {
        refs.form.dataset.error = "true";
        refs.form.removeAttribute("data-success");
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
   LOADING / SUCCESS
========================================================= */

function originalSubmitLabel(refs = {}) {
  const button = refs.submitButton;

  if (!button) return submitDefaultLabel(refs);

  try {
    return (
      text(button.dataset.originalLabel, "") ||
      text(button.textContent, submitDefaultLabel(refs))
    );
  } catch {
    return submitDefaultLabel(refs);
  }
}

function setLoadingDisabled(node = null, loading = false) {
  if (!node) return false;

  const active = Boolean(loading);

  try {
    if (active) {
      if (!node.disabled) {
        node.dataset.resetDisabledByLoading = "true";
      }

      node.disabled = true;
      return true;
    }

    if (node.dataset.resetDisabledByLoading === "true") {
      node.disabled = false;
    }

    delete node.dataset.resetDisabledByLoading;
    return true;
  } catch {
    return false;
  }
}

function setLinkDisabled(link = null, disabled = false) {
  if (!link) return false;

  const active = Boolean(disabled);

  setAttr(link, "aria-disabled", active ? "true" : null);
  toggleClass(link, "is-disabled", active);

  try {
    if (active) {
      if (!link.dataset.previousTabIndex) {
        link.dataset.previousTabIndex = String(link.tabIndex ?? "");
      }

      link.tabIndex = -1;
    } else {
      const previous = link.dataset.previousTabIndex;

      if (previous !== undefined && previous !== "") {
        link.tabIndex = Number(previous);
      } else {
        link.removeAttribute("tabindex");
      }

      delete link.dataset.previousTabIndex;
    }
  } catch {
    // noop
  }

  return true;
}

export function setResetPasswordLoading(refs = {}, loading = false, options = {}) {
  const active = Boolean(loading);

  toggleClass(refs.root, "is-loading", active);
  toggleClass(refs.form, "is-loading", active);

  setAttr(refs.form, "aria-busy", active ? "true" : "false");

  setDataset(refs.root, "loading", active ? "true" : "");
  setDataset(refs.form, "submitting", active ? "true" : "");

  setLoadingDisabled(refs.submitButton, active);
  setLoadingDisabled(refs.identifierInput || refs.emailInput, active);
  setLoadingDisabled(refs.tokenInput, active);
  setLoadingDisabled(refs.passwordInput, active);
  setLoadingDisabled(refs.confirmPasswordInput, active);

  for (const button of refs.passwordToggleButtons || []) {
    setLoadingDisabled(button, active);
  }

  setLinkDisabled(refs.backToLoginLink, active);

  if (refs.submitButton) {
    const submitLabel = text(options.submitLabel, originalSubmitLabel(refs));
    const loadingLabel = text(options.loadingLabel, DEFAULT_LOADING_LABEL);

    setText(refs.submitButton, active ? loadingLabel : submitLabel);
    setAttr(refs.submitButton, "aria-busy", active ? "true" : "false");
    setAttr(refs.submitButton, "aria-disabled", active ? "true" : null);
  }

  return true;
}

export function setResetPasswordSuccessState(refs = {}, options = {}) {
  const message = text(
    options.message,
    refs.mode === "confirm"
      ? "Contraseña actualizada correctamente."
      : "Si el identificador existe, recibirás las instrucciones para restablecer la contraseña."
  );

  setResetPasswordLoading(refs, false, options);
  clearResetPasswordErrors(refs);
  setGlobalMessage(refs.errorBox, message, "success");

  try {
    refs.form?.setAttribute("data-success", "true");
  } catch {
    // noop
  }

  return true;
}

export function setResetPasswordNeutralState(refs = {}, options = {}) {
  setResetPasswordLoading(refs, false, options);
  clearResetPasswordErrors(refs);

  try {
    refs.form?.removeAttribute("data-success");
  } catch {
    // noop
  }

  return true;
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

function normalizeToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";
  if (token.length > MAX_TOKEN_LENGTH) return "";

  if (
    [
      "null",
      "undefined",
      "false",
      "true",
      "[object object]",
      "{}",
      "[]",
    ].includes(token.toLowerCase())
  ) {
    return "";
  }

  return token;
}

function normalizePassword(value = "") {
  return rawText(value, "").slice(0, MAX_PASSWORD_LENGTH);
}

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export function readResetPasswordFormState(refs = {}) {
  const identifier = normalizeIdentifier(
    refs.identifierInput?.value ?? refs.emailInput?.value ?? ""
  );

  const email = looksLikeEmail(identifier)
    ? identifier.toLowerCase()
    : "";

  return {
    mode: refs.mode || modeFromRefs(refs),

    identifier,
    email,

    token: normalizeToken(refs.tokenInput?.value),
    password: normalizePassword(refs.passwordInput?.value),
    confirmPassword: normalizePassword(refs.confirmPasswordInput?.value),
  };
}

export function focusResetPasswordPrimaryField(refs = {}, options = {}) {
  later(() => {
    if (refs.mode === "confirm") {
      focus(refs.passwordInput);
      return;
    }

    const remembered = Boolean(options.rememberedIdentifier || options.rememberedEmail);
    focus(refs.identifierInput || refs.emailInput, !remembered);
  });

  return true;
}

/* =========================================================
   BINDINGS
========================================================= */

export function bindResetPasswordInputClearers(refs = {}, handler = null) {
  if (!isFn(handler)) return noop;

  const nodes = [
    refs.identifierInput || refs.emailInput,
    refs.tokenInput,
    refs.passwordInput,
    refs.confirmPasswordInput,
  ].filter(Boolean);

  return compose(
    nodes.map((node) => bindDom(node, "input", handler))
  );
}

export function bindResetPasswordSubmit(refs = {}, handler = null) {
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

export function bindResetPasswordBackLink(refs = {}, handler = null) {
  if (!refs.backToLoginLink || !isFn(handler)) return noop;

  return bindDom(refs.backToLoginLink, "click", handler);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getResetPasswordDomSnapshot(refs = {}) {
  return {
    version: RESET_PASSWORD_DOM_VERSION,

    mode: refs.mode || modeFromRefs(refs),

    hasRoot: Boolean(refs.root),
    hasForm: Boolean(refs.form),
    hasIdentifier: Boolean(refs.identifierInput || refs.emailInput),
    hasToken: Boolean(refs.tokenInput),
    hasPassword: Boolean(refs.passwordInput),
    hasConfirmPassword: Boolean(refs.confirmPasswordInput),
    hasSubmit: Boolean(refs.submitButton),

    hasGlobalMessage: Boolean(refs.errorBox),
    hasIdentifierErrorNode: Boolean(refs.identifierError || refs.emailError),
    hasTokenErrorNode: Boolean(refs.tokenError),
    hasPasswordErrorNode: Boolean(refs.passwordError),
    hasConfirmPasswordErrorNode: Boolean(refs.confirmPasswordError),

    submitting: refs.form?.dataset?.submitting === "true",

    policy: {
      domOnly: true,

      noAuth: true,
      noHttp: true,
      noRouter: true,
      noStore: true,
      noToastOwn: true,
      noToastCompat: true,
      noThemeToggleOwn: true,
      noInnerHTML: true,
      noNavigation: true,

      passwordFieldShared: true,
      noOwnPasswordToggleLogic: true,

      submitIdempotent: true,
      errorsRedacted: true,
      boundedFieldReads: true,

      snapshotNoFieldValues: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  RESET_PASSWORD_DOM_VERSION,

  getResetPasswordRefs,

  bindResetPasswordFields,
  destroyResetPasswordFields,

  setFieldInvalid,
  setInputInvalid,
  setFieldError,
  clearFieldError,

  clearResetPasswordErrors,
  applyResetPasswordErrors,
  setGlobalResetPasswordError,

  setResetPasswordLoading,
  setResetPasswordSuccessState,
  setResetPasswordNeutralState,

  readResetPasswordFormState,
  focusResetPasswordPrimaryField,

  bindResetPasswordInputClearers,
  bindResetPasswordSubmit,
  bindResetPasswordBackLink,

  getResetPasswordDomSnapshot,
};
