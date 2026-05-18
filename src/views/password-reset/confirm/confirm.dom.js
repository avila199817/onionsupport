/* =========================================================
   Onion SPA - Reset Password Confirm DOM
   Archivo: src/views/password-reset/confirm/confirm.dom.js

   Responsabilidad:
   - Compat DOM mínimo para confirm reset.
   - Delegar DOM real en ../reset-password.dom.js.
   - Mantener nombres antiguos usados por confirmView legacy.
   - Conectar password toggle mediante shared/password-field.
   - Sin DOM propio complejo.
   - Sin innerHTML.
   - Sin Toast.
   - Sin theme toggle.
   - Sin CapsLock propio.
   - Sin duplicar password-field.
========================================================= */

import {
  getResetPasswordRefs,
  bindResetPasswordFields,
  destroyResetPasswordFields,
  clearResetPasswordErrors,
  applyResetPasswordErrors,
  setGlobalResetPasswordError,
  setResetPasswordLoading,
  setResetPasswordSuccessState,
  focusResetPasswordPrimaryField,
  readResetPasswordFormState,
  bindResetPasswordInputClearers,
  bindResetPasswordSubmit,
  bindResetPasswordBackLink,
  getResetPasswordDomSnapshot,
} from "../reset-password.dom.js";

export const CONFIRM_DOM_VERSION = "minimal-1";

/* =========================================================
   HELPERS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function toResetRefs(refs = {}) {
  const passwordInput = refs.passwordInput || refs.newPasswordInput || null;
  const backToLoginLink = refs.backToLoginLink || refs.backLink || null;

  const passwordToggleButtons = Array.isArray(refs.passwordToggleButtons)
    ? refs.passwordToggleButtons
    : [
        refs.togglePasswordButton,
        refs.toggleNewPasswordButton,
        refs.toggleConfirmPasswordButton,
      ].filter(Boolean);

  return {
    ...refs,

    passwordInput,
    newPasswordInput: passwordInput,
    confirmPasswordInput: refs.confirmPasswordInput || null,

    backToLoginLink,

    fieldPassword: refs.fieldPassword || refs.fieldNewPassword || null,
    fieldConfirmPassword: refs.fieldConfirmPassword || null,

    passwordToggleButtons,
  };
}

function toConfirmRefs(refs = {}) {
  const resetRefs = toResetRefs(refs);
  const toggles = resetRefs.passwordToggleButtons || [];

  return {
    ...resetRefs,

    card:
      resetRefs.card ||
      resetRefs.root?.querySelector?.(".auth-card, .password-reset-card") ||
      null,

    tokenInput: resetRefs.tokenInput || null,

    passwordInput: resetRefs.passwordInput || null,
    newPasswordInput: resetRefs.passwordInput || null,
    confirmPasswordInput: resetRefs.confirmPasswordInput || null,

    backLink: resetRefs.backToLoginLink || null,

    fieldPassword: resetRefs.fieldPassword || null,
    fieldNewPassword: resetRefs.fieldPassword || null,
    fieldConfirmPassword: resetRefs.fieldConfirmPassword || null,

    togglePasswordButton: toggles[0] || null,
    toggleNewPasswordButton: toggles[0] || null,
    toggleConfirmPasswordButton: toggles[1] || null,

    capsIndicator: null,
    newPasswordCapsIndicator: null,
    confirmCapsIndicator: null,

    passwordField: resetRefs.passwordFieldBindings?.[0] || null,
    confirmPasswordField: resetRefs.passwordFieldBindings?.[1] || null,
  };
}

/* =========================================================
   PASSWORD FIELD
========================================================= */

export function bindConfirmPasswordFields(container = null, options = {}) {
  return bindResetPasswordFields(container, options);
}

export function destroyConfirmPasswordFields(container = null) {
  return destroyResetPasswordFields(container);
}

/* =========================================================
   REFS
========================================================= */

export function getConfirmRefs(container = null) {
  return toConfirmRefs(getResetPasswordRefs(container));
}

/* =========================================================
   ERRORS
========================================================= */

export function clearConfirmErrors(refs = {}) {
  return clearResetPasswordErrors(toResetRefs(refs));
}

export function applyConfirmErrors(refs = {}, errors = {}, options = {}) {
  return applyResetPasswordErrors(
    toResetRefs(refs),
    {
      password:
        text(errors.password, "") ||
        text(errors.newPassword, ""),

      confirmPassword:
        text(errors.confirmPassword, "") ||
        text(errors.confirm, "") ||
        text(errors.passwordConfirm, ""),

      global:
        text(errors.global, "") ||
        text(errors.token, "") ||
        text(errors.message, ""),
    },
    options
  );
}

export function setGlobalConfirmError(refs = {}, message = "") {
  return setGlobalResetPasswordError(toResetRefs(refs), message);
}

/* =========================================================
   LOADING / SUCCESS
========================================================= */

export function setConfirmLoading(refs = {}, loading = false, options = {}) {
  return setResetPasswordLoading(toResetRefs(refs), loading, {
    submitLabel: "Actualizar contraseña",
    loadingLabel: "Procesando...",
    ...options,
  });
}

export function setConfirmSuccessState(refs = {}, message = "") {
  return setResetPasswordSuccessState(toResetRefs(refs), {
    message: text(message, "Contraseña actualizada correctamente."),
  });
}

/* =========================================================
   FOCUS / FORM STATE
========================================================= */

export function focusConfirmPrimaryField(refs = {}, options = {}) {
  return focusResetPasswordPrimaryField(toResetRefs(refs), {
    ...options,
    mode: "confirm",
  });
}

export function readConfirmFormState(refs = {}) {
  const state = readResetPasswordFormState(toResetRefs(refs));

  return {
    token: state.token || "",

    password: state.password || "",
    newPassword: state.password || "",

    confirmPassword: state.confirmPassword || "",
    passwordConfirm: state.confirmPassword || "",
  };
}

/* =========================================================
   BINDS
========================================================= */

export function bindConfirmSubmit(refs = {}, handler = null) {
  return bindResetPasswordSubmit(toResetRefs(refs), handler);
}

export function bindConfirmInputClearers(refs = {}, handler = null) {
  return bindResetPasswordInputClearers(toResetRefs(refs), handler);
}

export function bindConfirmBack(refs = {}, handler = null) {
  return bindResetPasswordBackLink(toResetRefs(refs), handler);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getConfirmDomSnapshot(refs = {}) {
  const snapshot = isFn(getResetPasswordDomSnapshot)
    ? getResetPasswordDomSnapshot(toResetRefs(refs))
    : {};

  return {
    ...snapshot,
    version: CONFIRM_DOM_VERSION,
    confirmCompat: true,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  CONFIRM_DOM_VERSION,

  getConfirmRefs,

  bindConfirmPasswordFields,
  destroyConfirmPasswordFields,

  clearConfirmErrors,
  applyConfirmErrors,
  setGlobalConfirmError,

  setConfirmLoading,
  setConfirmSuccessState,

  focusConfirmPrimaryField,
  readConfirmFormState,

  bindConfirmSubmit,
  bindConfirmInputClearers,
  bindConfirmBack,

  getConfirmDomSnapshot,
};
