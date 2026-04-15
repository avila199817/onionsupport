/* =========================================================
   Onion SPA - Auth Constants
   Archivo: src/features/auth/constants.js

   Responsabilidades:
   - centralizar endpoints auth
   - centralizar claves storage auxiliar
   - centralizar límites y constantes sesión
   - exponer endpoints password-reset request / confirm
   - soportar aliases legacy sin romper compatibilidad
   - endurecer límites comunes del módulo auth
   - helpers públicos estables del módulo
   - blindaje enterprise
========================================================= */

/* =========================================================
   ENDPOINTS
========================================================= */

const REQUEST_RESET_ENDPOINT =
  "/api/auth/reset-password-request";

const CONFIRM_RESET_ENDPOINT =
  "/api/auth/reset-password-confirm";

const VALIDATE_RESET_ENDPOINT =
  "/api/auth/reset-password/validate";

export const AUTH_ENDPOINTS = Object.freeze({
  /* =======================================================
     SESIÓN
  ======================================================= */
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  refresh: "/api/auth/refresh",

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
    6,

  passwordMaxLength:
    1024,

  /* TOKENS */
  tokenMaxLength:
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

  /* RESET PASSWORD */
  resetIdentifierMaxLength:
    160,

  resetCooldownDefaultSeconds:
    60,

  resetTokenMinLength:
    16,

  resetTokenMaxLength:
    4096,

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
    typeof endpoint ===
      "string" &&
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
    typeof storageKey ===
      "string" &&
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
   SPECIALIZED HELPERS
========================================================= */

export function getLoginEndpoint() {
  return getAuthEndpoint(
    "login",
    "/api/auth/login"
  );
}

export function getLogoutEndpoint() {
  return getAuthEndpoint(
    "logout",
    "/api/auth/logout"
  );
}

export function getMeEndpoint() {
  return getAuthEndpoint(
    "me",
    "/api/auth/me"
  );
}

export function getRefreshEndpoint() {
  return getAuthEndpoint(
    "refresh",
    "/api/auth/refresh"
  );
}

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
