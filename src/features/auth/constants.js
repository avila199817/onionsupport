/* =========================================================
   Onion SPA - Auth Constants
   Archivo: src/features/auth/constants.js

   Responsabilidades:
   - centralizar endpoints auth
   - centralizar claves storage auxiliar
   - centralizar límites y constantes sesión
   - exponer endpoints password-reset / recovery
   - endurecer límites comunes del módulo auth
========================================================= */

/* =========================================================
   ENDPOINTS
========================================================= */

export const AUTH_ENDPOINTS = Object.freeze({
  /* sesión */
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  refresh: "/api/auth/refresh",

  /* recuperación acceso */
  requestPasswordReset:
    "/api/auth/forgot-password",

  resetPasswordRequest:
    "/api/auth/forgot-password",

  forgotPassword:
    "/api/auth/forgot-password",

  /*
    fase confirmación futura:
    token + nueva contraseña
  */
  confirmPasswordReset:
    "/api/auth/reset-password",

  resetPasswordConfirm:
    "/api/auth/reset-password",

  /*
    validación opcional token
  */
  validateResetToken:
    "/api/auth/reset-password/validate",
});

/* =========================================================
   STORAGE KEYS
========================================================= */

export const AUTH_STORAGE_KEYS = Object.freeze({
  /* tokens */
  refreshToken: "refresh_token",
  tempToken: "temp_token",

  /* sesión */
  sessionId: "session_id",
  sessionUserId: "session_user_id",

  /* usuario */
  userSlug: "user_slug",
  userName: "user_name",
  role: "role",

  /* helpers auth ui */
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
  /* inputs */
  identifierMaxLength: 160,
  passwordMaxLength: 1024,

  /* tokens / storage */
  tokenMaxLength: 4096,
  sessionValueMaxLength: 128,

  /* refresh */
  refreshRetryCooldownMs:
    30_000,

  maxSequentialRefreshFailures:
    3,

  /* requests */
  requestTimeout: 15_000,

  /* reset password */
  resetIdentifierMaxLength:
    160,

  resetCooldownDefaultSeconds:
    60,

  resetTokenMinLength:
    16,

  resetTokenMaxLength:
    4096,

  /* ui */
  loginRedirectDelayMs: 0,
});

/* =========================================================
   HELPERS
========================================================= */

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

  return String(
    fallback || ""
  ).trim();
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

  return String(
    fallback || ""
  ).trim();
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
