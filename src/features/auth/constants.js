/* =========================================================
   Onion SPA - Auth Constants
   Archivo: src/features/auth/constants.js

   Responsabilidades:
   - centralizar endpoints auth
   - centralizar claves storage auxiliar
   - centralizar límites y constantes sesión
========================================================= */

/* =========================================================
   ENDPOINTS
========================================================= */
export const AUTH_ENDPOINTS = Object.freeze({
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  refresh: "/api/auth/refresh",
});

/* =========================================================
   STORAGE KEYS
========================================================= */
export const AUTH_STORAGE_KEYS = Object.freeze({
  refreshToken: "refresh_token",
  tempToken: "temp_token",

  userSlug: "user_slug",
  userName: "user_name",
  role: "role",

  sessionId: "session_id",
  sessionUserId: "session_user_id",
});

/* =========================================================
   CONSTANTS
========================================================= */
export const AUTH_CONSTANTS = Object.freeze({
  identifierMaxLength: 160,
  passwordMaxLength: 1024,

  tokenMaxLength: 4096,
  sessionValueMaxLength: 128,

  refreshRetryCooldownMs: 30_000,
  maxSequentialRefreshFailures: 3,
});
