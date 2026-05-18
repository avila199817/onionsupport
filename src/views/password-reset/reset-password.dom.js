/* =========================================================
   Onion SPA - Reset Password DOM
   Archivo: src/views/password-reset/reset-password.dom.js

   Responsabilidad:
   - Obtener refs de password reset.
   - Leer estado del formulario.
   - Mostrar/limpiar error global.
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

export const RESET_PASSWORD_DOM_VERSION = "reset-password.dom.v2";

const DEFAULT_REQUEST_SUBMIT_LABEL = "Enviar enlace";
const DEFAULT_CONFIRM_SUBMIT_LABEL = "Cambiar contraseña";
const DEFAULT_LOADING_LABEL = "Procesando...";

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

  passwordToggle:
    "[data-password-toggle], [data-login-password-toggle]",
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

function qsa(root = null, selector = "") {
  const scope = root || doc();

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

export function destroyResetPasswordFields(container = null) {
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

export function getResetPasswordRefs(container = null) {
  const safeContainer = container || doc();
  const root = qs(safeContainer, SELECTORS.root) || safeContainer;
  const form = qs(root, SELECTORS.form);
  const scope = form || root || safeContainer;

  const submitButton = qs(scope, SELECTORS.submit);

  if (form) {
    try {
      form.noValidate = true;
      form.dataset.resetPasswordDomVersion = RESET_PASSWORD_DOM_VERSION;
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
          submitDefaultLabel({ root, form })
        );
      }
    } catch {
      // noop
    }
  }

  const identifierInput = qs(scope, SELECTORS.identifier);
  const passwordInput = qs(scope, SELECTORS.password);
  const confirmPasswordInput = qs(scope, SELECTORS.confirmPassword);

  const refs = {
    container: safeContainer,
    root,
    form,

    identifierInput,
    emailInput: identifierInput,

    tokenInput: qs(scope, SELECTORS.token),

    passwordInput,
    confirmPasswordInput,

    submitButton,
    backToLoginLink: qs(scope, SELECTORS.back),

    errorBox: qs(scope, SELECTORS.message),

    fieldIdentifier: qs(scope, SELECTORS.fieldIdentifier),
    fieldEmail: qs(scope, SELECTORS.fieldIdentifier),
    fieldPassword: qs(scope, SELECTORS.fieldPassword),
    fieldConfirmPassword: qs(scope, SELECTORS.fieldConfirm),

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

function setGlobalMessage(errorBox = null, message = "", type = "error") {
  const clean = text(message, "");
  const cleanType = ["error", "success", "info"].includes(type) ? type : "error";

  if (!errorBox) return clean;

  setText(errorBox, clean);
  setHidden(errorBox, !clean);

  toggleClass(errorBox, "is-visible", Boolean(clean));
  toggleClass(errorBox, "is-error", Boolean(clean) && cleanType === "error");
  toggleClass(errorBox, "is-success", Boolean(clean) && cleanType === "success");
  toggleClass(errorBox, "is-info", Boolean(clean) && cleanType === "info");

  setAttr(errorBox, "role", clean ? "alert" : null);
  setAttr(errorBox, "aria-live", clean ? "polite" : null);

  try {
    if (clean) {
      errorBox.dataset.messageType = cleanType;
    } else {
      delete errorBox.dataset.messageType;
    }
  } catch {
    // noop
  }

  return clean;
}

export function clearResetPasswordErrors(refs = {}) {
  setFieldInvalid(refs.fieldIdentifier || refs.fieldEmail, false);
  setFieldInvalid(refs.fieldPassword, false);
  setFieldInvalid(refs.fieldConfirmPassword, false);

  setInputInvalid(refs.identifierInput || refs.emailInput, false);
  setInputInvalid(refs.passwordInput, false);
  setInputInvalid(refs.confirmPasswordInput, false);

  setGlobalMessage(refs.errorBox, "");

  try {
    refs.form?.removeAttribute("data-error");
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
    passwordError ||
    confirmPasswordError ||
    globalError;

  setFieldInvalid(refs.fieldIdentifier || refs.fieldEmail, Boolean(identifierError));
  setFieldInvalid(refs.fieldPassword, Boolean(passwordError));
  setFieldInvalid(refs.fieldConfirmPassword, Boolean(confirmPasswordError));

  setInputInvalid(refs.identifierInput || refs.emailInput, Boolean(identifierError));
  setInputInvalid(refs.passwordInput, Boolean(passwordError));
  setInputInvalid(refs.confirmPasswordInput, Boolean(confirmPasswordError));

  setGlobalMessage(refs.errorBox, firstError, "error");

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
      } else if (confirmPasswordError) {
        focus(refs.confirmPasswordInput);
      }
    });
  }

  return firstError;
}

export function setGlobalResetPasswordError(refs = {}, message = "") {
  const clean = setGlobalMessage(refs.errorBox, message, "error");

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

export function shakeResetPasswordCard(refs = {}) {
  const card = refs.root?.querySelector?.(".auth-card, .password-reset-card");

  if (!card) return false;

  try {
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    return true;
  } catch {
    return false;
  }
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

    token: rawText(refs.tokenInput?.value, ""),
    password: rawText(refs.passwordInput?.value, ""),
    confirmPassword: rawText(refs.confirmPasswordInput?.value, ""),
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

/* =========================================================
   COMPAT MÍNIMA SIN TOAST PROPIO
========================================================= */

export function getResetPasswordToastRefs() {
  return {
    toastRoot: null,
    toastIcon: null,
    toastTitle: null,
    toastText: null,
    toastClose: null,
    toastProgress: null,
  };
}

export function hideResetPasswordToast() {
  return false;
}

export function setResetPasswordToastVisibility(_refs = {}, visible = false) {
  return Boolean(visible);
}

export function setResetPasswordToastContent() {
  return false;
}

export function resetResetPasswordToastProgress() {
  return false;
}

export function startResetPasswordToastProgress() {
  return false;
}

export function showResetPasswordToast(refs = {}, options = {}) {
  const message =
    text(options.message, "") ||
    text(options.text, "") ||
    text(options.title, "");

  if (!message) return false;

  setGlobalMessage(refs.errorBox, message, text(options.type, "info"));

  return true;
}

export function bindResetPasswordToastClose() {
  return noop;
}

export function bindResetPasswordBackLink(refs = {}, handler = null) {
  if (!refs.backToLoginLink || !isFn(handler)) return noop;

  return bindDom(refs.backToLoginLink, "click", handler);
}

export function bindResetPasswordThemeToggle() {
  return noop;
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

    submitting: refs.form?.dataset?.submitting === "true",

    policy: {
      domOnly: true,
      noAuth: true,
      noHttp: true,
      noRouter: true,
      noStore: true,
      noToastOwn: true,
      noThemeToggleOwn: true,
      noInnerHTML: true,
      passwordFieldShared: true,
      submitIdempotent: true,
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
  shakeResetPasswordCard,

  readResetPasswordFormState,
  focusResetPasswordPrimaryField,

  bindResetPasswordInputClearers,
  bindResetPasswordSubmit,

  getResetPasswordToastRefs,
  hideResetPasswordToast,
  setResetPasswordToastVisibility,
  setResetPasswordToastContent,
  resetResetPasswordToastProgress,
  startResetPasswordToastProgress,
  showResetPasswordToast,
  bindResetPasswordToastClose,

  bindResetPasswordBackLink,
  bindResetPasswordThemeToggle,

  getResetPasswordDomSnapshot,
};
