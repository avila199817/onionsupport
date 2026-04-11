/* =========================================================
   Onion SPA - Auth Constants
   Archivo: src/features/auth/constants.js

   Responsabilidades:
   - centralizar endpoints de auth
   - centralizar claves de storage auxiliares
   - centralizar límites y constantes de sesión
========================================================= */

export const AUTH_ENDPOINTS = {
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  refresh: "/api/auth/refresh",
};

export const AUTH_STORAGE_KEYS = {
  refreshToken: "refresh_token",
  tempToken: "temp_token",
  userSlug: "user_slug",
  userName: "user_name",
  role: "role",
  sessionId: "session_id",
  sessionUserId: "session_user_id",
};

export const AUTH_CONSTANTS = {
  identifierMaxLength: 160,
  passwordMaxLength: 1024,
  tokenMaxLength: 4096,
  sessionValueMaxLength: 128,
  refreshRetryCooldownMs: 30_000,
  maxSequentialRefreshFailures: 3,
};
