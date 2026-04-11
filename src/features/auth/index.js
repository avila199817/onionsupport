/* =========================================================
   Onion SPA - Auth / Session
   Archivo: src/features/auth/index.js

   Responsabilidades:
   - punto de entrada del módulo auth
   - composición de login / logout / restore / guards
   - exponer helpers auth para toda la SPA
   - mantener compatibilidad con backend heterogéneo
========================================================= */

import { AUTH_ENDPOINTS, AUTH_STORAGE_KEYS, AUTH_CONSTANTS } from "./constants.js";

import {
  isAuthRoute,
} from "./helpers.js";

import {
  normalizeUser,
} from "./normalize.js";

import {
  getStoredRefreshToken,
  getStoredTempToken,
  getStoredSessionId,
  getStoredSessionUserId,
  hasRefreshToken,
  hasRefreshContext,
} from "./storage.js";

import {
  buildSessionSnapshot,
  applySession,
  clearSessionLocal,
  isAuthenticated,
  getCurrentRole,
  hasRole,
  requireRole,
  getAuthHeader,
  getSessionDebugSnapshot,
} from "./session.js";

import {
  resolveLoginIdentifier,
  normalizeLoginPayload,
  buildLoginRequestBody,
  buildLoginRedirectPath,
  getPostLoginTarget,
  login,
  handleLoginFormSubmit,
} from "./login.js";

import {
  fetchMe,
  refreshSession,
  restoreSession,
} from "./restore.js";

import {
  logout,
} from "./logout.js";

import {
  guardAuthenticated,
  guardRole,
} from "./guards.js";

export const Auth = (() => {
  "use strict";

  /* =========================================================
     ESTADO INTERNO
  ========================================================= */
  const session = {
    restoring: false,
    checking: false,
    refreshing: false,

    lastCheckAt: null,
    lastRefreshAt: null,

    refreshPromise: null,
    mePromise: null,
    restorePromise: null,

    refreshFailCount: 0,
    refreshBlockedUntil: 0,
  };

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    AUTH_ENDPOINTS,
    AUTH_STORAGE_KEYS,
    AUTH_CONSTANTS,
    session,

    login,
    logout,
    fetchMe: () => fetchMe(session),
    refreshSession: () => refreshSession(session),
    restoreSession: () => restoreSession(session),
    handleLoginFormSubmit,

    isAuthenticated,
    isAuthRoute,
    hasRole,
    requireRole,
    guardAuthenticated,
    guardRole,
    getAuthHeader,
    clearSessionLocal,
    normalizeUser,
    applySession,
    buildSessionSnapshot,
    buildLoginRedirectPath,
    buildLoginRequestBody,
    normalizeLoginPayload,
    resolveLoginIdentifier,
    getPostLoginTarget,
    getCurrentRole,
    getSessionDebugSnapshot,

    hasRefreshToken,
    hasRefreshContext,
    getStoredRefreshToken,
    getStoredTempToken,
    getStoredSessionId,
    getStoredSessionUserId,
  };
})();
