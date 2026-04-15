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
========================================================= */

/* =========================================================
   ENDPOINTS
========================================================= */

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
     Backend real:
     POST /api/auth/reset-password-request
  ======================================================= */
  requestPasswordReset:
    "/api/auth/reset-password-request",

  resetPasswordRequest:
    "/api/auth/reset-password-request",

  forgotPassword:
    "/api/auth/reset-password-request",

  recoverPassword:
    "/api/auth/reset-password-request",

  recover:
    "/api/auth/reset-password-request",

  forgot:
    "/api/auth/reset-password-request",

  /* =======================================================
     PASSWORD RESET CONFIRM
     Backend real:
     POST /api/auth/reset-password-confirm
  ======================================================= */
  confirmPasswordReset:
    "/api/auth/reset-password-confirm",

  confirmResetPassword:
    "/api/auth/reset-password-confirm",

  resetPasswordConfirm:
    "/api/auth/reset-password-confirm",

  passwordResetConfirm:
    "/api/auth/reset-password-confirm",

  resetPasswordUpdate:
    "/api/auth/reset-password-confirm",

  resetPasswordFinalize:
    "/api/auth/reset-password-confirm",

  /* =======================================================
     VALIDATE TOKEN (opcional / futuro)
  ======================================================= */
  validateResetToken:
    "/api/auth/reset-password/validate",
});

/* =========================================================
   STORAGE KEYS
========================================================= */

export const AUTH_STORAGE_KEYS = Object.freeze({
  /* =======================================================
     TOKENS
  ======================================================= */
  refreshToken:
    "refresh_token",

  tempToken:
    "temp_token",

  accessToken:
    "access_token",

  /* =======================================================
     SESIÓN
  ======================================================= */
  sessionId:
    "session_id",

  sessionUserId:
    "session_user_id",

  /* =======================================================
     USER
  ======================================================= */
  userSlug:
    "user_slug",

  userName:
    "user_name",

  role:
    "role",

  /* =======================================================
     UI HELPERS
  ======================================================= */
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
  /* =======================================================
     INPUTS
  ======================================================= */
  identifierMaxLength:
    160,

  passwordMinLength:
    6,

  passwordMaxLength:
    1024,

  /* =======================================================
     TOKENS / STORAGE
  ======================================================= */
  tokenMaxLength:
    4096,

  sessionValueMaxLength:
    128,

  /* =======================================================
     REFRESH
  ======================================================= */
  refreshRetryCooldownMs:
    30_000,

  maxSequentialRefreshFailures:
    3,

  /* =======================================================
     REQUESTS
  ======================================================= */
  requestTimeout:
    15_000,

  /* =======================================================
     RESET PASSWORD
  ======================================================= */
  resetIdentifierMaxLength:
    160,

  resetCooldownDefaultSeconds:
    60,

  resetTokenMinLength:
    16,

  resetTokenMaxLength:
    4096,

  /* =======================================================
     UI
  ======================================================= */
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
    AUTH_ENDPOINTS?.[key];

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
    AUTH_STORAGE_KEYS?.[key];

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
    "resetPasswordRequest",
    "/api/auth/reset-password-request"
  );
}

export function getConfirmPasswordResetEndpoint() {
  return getAuthEndpoint(
    "resetPasswordConfirm",
    "/api/auth/reset-password-confirm"
  );
}

export function getValidateResetTokenEndpoint() {
  return getAuthEndpoint(
    "validateResetToken",
    "/api/auth/reset-password/validate"
  );
}
