/* =========================================================
   Onion SPA - Auth Constants
   Archivo: src/features/auth/constants.js

   Responsabilidades:
   - centralizar endpoints auth
   - centralizar endpoint de activación de cuenta
   - centralizar claves storage auxiliar
   - centralizar límites y constantes sesión
   - exponer endpoints password-reset request / confirm
   - soportar aliases legacy sin romper compatibilidad
   - endurecer límites comunes del módulo auth
   - helpers públicos estables del módulo
   - blindaje enterprise
========================================================= */

/* =========================================================
   ENDPOINTS BASE
========================================================= */

const LOGIN_ENDPOINT =
  "/api/auth/login";

const LOGOUT_ENDPOINT =
  "/api/auth/logout";

const ME_ENDPOINT =
  "/api/auth/me";

const REFRESH_ENDPOINT =
  "/api/auth/refresh";

const ACTIVATE_ACCOUNT_ENDPOINT =
  "/api/auth/activate-account";

const REQUEST_RESET_ENDPOINT =
  "/api/auth/reset-password-request";

const CONFIRM_RESET_ENDPOINT =
  "/api/auth/reset-password-confirm";

const VALIDATE_RESET_ENDPOINT =
  "/api/auth/reset-password/validate";

/* =========================================================
   ENDPOINTS
========================================================= */

export const AUTH_ENDPOINTS = Object.freeze({
  /* =======================================================
     SESIÓN
  ======================================================= */
  login:
    LOGIN_ENDPOINT,

  logout:
    LOGOUT_ENDPOINT,

  me:
    ME_ENDPOINT,

  refresh:
    REFRESH_ENDPOINT,

  /* =======================================================
     ACTIVACIÓN DE CUENTA
  ======================================================= */
  activateAccount:
    ACTIVATE_ACCOUNT_ENDPOINT,

  activation:
    ACTIVATE_ACCOUNT_ENDPOINT,

  accountActivation:
    ACTIVATE_ACCOUNT_ENDPOINT,

  createUserActivation:
    ACTIVATE_ACCOUNT_ENDPOINT,

  confirmActivation:
    ACTIVATE_ACCOUNT_ENDPOINT,

  activate:
    ACTIVATE_ACCOUNT_ENDPOINT,

  /* =======================================================
     PASSWORD RESET REQUEST
  ======================================================= */
  requestPasswordReset:
    REQUEST_RESET_ENDPOINT,

  resetPasswordRequest:
    REQUEST_RESET_ENDPOINT,

  forgotPassword:
    REQUEST_RESET_ENDPOINT,

  recoverPassword:
    REQUEST_RESET_ENDPOINT,

  recover:
    REQUEST_RESET_ENDPOINT,

  forgot:
    REQUEST_RESET_ENDPOINT,

  /* =======================================================
     PASSWORD RESET CONFIRM
  ======================================================= */
  confirmPasswordReset:
    CONFIRM_RESET_ENDPOINT,

  confirmResetPassword:
    CONFIRM_RESET_ENDPOINT,

  resetPasswordConfirm:
    CONFIRM_RESET_ENDPOINT,

  passwordResetConfirm:
    CONFIRM_RESET_ENDPOINT,

  resetPasswordUpdate:
    CONFIRM_RESET_ENDPOINT,

  resetPasswordFinalize:
    CONFIRM_RESET_ENDPOINT,

  /* =======================================================
     VALIDATE TOKEN
  ======================================================= */
  validateResetToken:
    VALIDATE_RESET_ENDPOINT,

  resetPasswordValidate:
    VALIDATE_RESET_ENDPOINT,

  validatePasswordReset:
    VALIDATE_RESET_ENDPOINT,
});

/* =========================================================
   STORAGE KEYS
========================================================= */

export const AUTH_STORAGE_KEYS = Object.freeze({
  /* TOKENS */
  refreshToken:
    "refresh_token",

  tempToken:
    "temp_token",

  accessToken:
    "access_token",

  /* SESSION */
  sessionId:
    "session_id",

  sessionUserId:
    "session_user_id",

  /* USER */
  userSlug:
    "user_slug",

  userName:
    "user_name",

  role:
    "role",

  /* UX */
  lastUsername:
    "last_username",

  lastLoginIdentifier:
    "last_login_identifier",

  lastResetIdentifier:
    "last_reset_identifier",

  redirectAfterLogin:
    "redirect_after_login",
});

/* =========================================================
   CONSTANTS
========================================================= */

export const AUTH_CONSTANTS = Object.freeze({
  /* INPUTS */
  identifierMaxLength:
    160,

  passwordMinLength:
    8,

  passwordMaxLength:
    1024,

  /* TOKENS */
  tokenMinLength:
    16,

  tokenMaxLength:
    4096,

  activationTokenMinLength:
    16,

  activationTokenMaxLength:
    4096,

  sessionValueMaxLength:
    128,

  /* REFRESH */
  refreshRetryCooldownMs:
    30000,

  maxSequentialRefreshFailures:
    3,

  /* REQUEST */
  requestTimeout:
    15000,

  /* ACTIVATION */
  activationPasswordMinLength:
    8,

  activationRedirectDelayMs:
    0,

  activationSuccessRedirectDelayMs:
    0,

  /* RESET PASSWORD */
  resetIdentifierMaxLength:
    160,

  resetCooldownDefaultSeconds:
    60,

  resetTokenMinLength:
    16,

  resetTokenMaxLength:
    4096,

  resetPasswordMinLength:
    8,

  resetPasswordMaxLength:
    1024,

  /* UI */
  loginRedirectDelayMs:
    0,

  resetRedirectDelayMs:
    2200,
});

/* =========================================================
   HELPERS BASE
========================================================= */

export function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

export function getAuthEndpoint(
  key = "",
  fallback = ""
) {
  const endpoint =
    AUTH_ENDPOINTS[key];

  if (
    typeof endpoint === "string" &&
    endpoint.trim()
  ) {
    return endpoint.trim();
  }

  return safeText(
    fallback,
    ""
  );
}

export function getAuthStorageKey(
  key = "",
  fallback = ""
) {
  const storageKey =
    AUTH_STORAGE_KEYS[key];

  if (
    typeof storageKey === "string" &&
    storageKey.trim()
  ) {
    return storageKey.trim();
  }

  return safeText(
    fallback,
    ""
  );
}

export function getAuthConstant(
  key = "",
  fallback = null
) {
  if (
    Object.prototype.hasOwnProperty.call(
      AUTH_CONSTANTS,
      key
    )
  ) {
    return AUTH_CONSTANTS[key];
  }

  return fallback;
}

/* =========================================================
   SPECIALIZED HELPERS · SESSION
========================================================= */

export function getLoginEndpoint() {
  return getAuthEndpoint(
    "login",
    LOGIN_ENDPOINT
  );
}

export function getLogoutEndpoint() {
  return getAuthEndpoint(
    "logout",
    LOGOUT_ENDPOINT
  );
}

export function getMeEndpoint() {
  return getAuthEndpoint(
    "me",
    ME_ENDPOINT
  );
}

export function getRefreshEndpoint() {
  return getAuthEndpoint(
    "refresh",
    REFRESH_ENDPOINT
  );
}

/* =========================================================
   SPECIALIZED HELPERS · ACTIVATION
========================================================= */

export function getActivateAccountEndpoint() {
  return getAuthEndpoint(
    "activateAccount",
    ACTIVATE_ACCOUNT_ENDPOINT
  );
}

export function getActivationEndpoint() {
  return getActivateAccountEndpoint();
}

export function getAccountActivationEndpoint() {
  return getActivateAccountEndpoint();
}

/* =========================================================
   SPECIALIZED HELPERS · PASSWORD RESET
========================================================= */

export function getRequestPasswordResetEndpoint() {
  return getAuthEndpoint(
    "requestPasswordReset",
    REQUEST_RESET_ENDPOINT
  );
}

export function getConfirmPasswordResetEndpoint() {
  return getAuthEndpoint(
    "confirmPasswordReset",
    CONFIRM_RESET_ENDPOINT
  );
}

export function getValidateResetTokenEndpoint() {
  return getAuthEndpoint(
    "validateResetToken",
    VALIDATE_RESET_ENDPOINT
  );
}

/* =========================================================
   SPECIALIZED HELPERS · LIMITS
========================================================= */

export function getPasswordMinLength() {
  return Number(
    getAuthConstant(
      "passwordMinLength",
      8
    )
  ) || 8;
}

export function getActivationPasswordMinLength() {
  return Number(
    getAuthConstant(
      "activationPasswordMinLength",
      getPasswordMinLength()
    )
  ) || getPasswordMinLength();
}

export function getPasswordMaxLength() {
  return Number(
    getAuthConstant(
      "passwordMaxLength",
      1024
    )
  ) || 1024;
}

export function getTokenMaxLength() {
  return Number(
    getAuthConstant(
      "tokenMaxLength",
      4096
    )
  ) || 4096;
}

export function getActivationTokenMaxLength() {
  return Number(
    getAuthConstant(
      "activationTokenMaxLength",
      getTokenMaxLength()
    )
  ) || getTokenMaxLength();
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  AUTH_ENDPOINTS,
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,

  safeText,

  getAuthEndpoint,
  getAuthStorageKey,
  getAuthConstant,

  getLoginEndpoint,
  getLogoutEndpoint,
  getMeEndpoint,
  getRefreshEndpoint,

  getActivateAccountEndpoint,
  getActivationEndpoint,
  getAccountActivationEndpoint,

  getRequestPasswordResetEndpoint,
  getConfirmPasswordResetEndpoint,
  getValidateResetTokenEndpoint,

  getPasswordMinLength,
  getActivationPasswordMinLength,
  getPasswordMaxLength,
  getTokenMaxLength,
  getActivationTokenMaxLength,
};
