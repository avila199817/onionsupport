/* =========================================================
   Onion SPA - Auth / Session
   Archivo: src/features/auth/index.js

   Responsabilidades:
   - punto de entrada del módulo auth
   - composición de login / logout / restore / guards
   - exponer helpers auth para toda la SPA
   - serializar restore / refresh / me
   - mantener compatibilidad con backend heterogéneo
   - exponer aliases públicos estables para auth flows
   - integrar reset-password / forgot-password
   - ofrecer api pública coherente y endurecida
========================================================= */

import {
  AUTH_ENDPOINTS,
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "./constants.js";

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
  requestPasswordReset,
  resetPasswordRequest,
  forgotPassword,
  getRequestPasswordResetEndpoint,
  resolveResetPasswordIdentifier,
  normalizeResetPasswordPayload,
  buildResetPasswordRequestBody,
  normalizeResetPasswordResponse,
} from "./password-reset.js";

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

/* =========================================================
   INTERNAL HELPERS
========================================================= */

function createInitialSessionState() {
  return {
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
}

function safeCloneSessionState(session = {}) {
  return {
    restoring: Boolean(session.restoring),
    checking: Boolean(session.checking),
    refreshing: Boolean(session.refreshing),

    lastCheckAt: session.lastCheckAt || null,
    lastRefreshAt: session.lastRefreshAt || null,

    refreshPromise: session.refreshPromise || null,
    mePromise: session.mePromise || null,
    restorePromise: session.restorePromise || null,

    refreshFailCount: Number(session.refreshFailCount || 0),
    refreshBlockedUntil: Number(session.refreshBlockedUntil || 0),
  };
}

/* =========================================================
   AUTH SINGLETON
========================================================= */

export const Auth = (() => {
  "use strict";

  /* =========================================================
     INTERNAL SESSION STATE
  ========================================================= */
  const session = createInitialSessionState();

  /* =========================================================
     WRAPPERS SERIALIZADOS
  ========================================================= */
  function runFetchMe() {
    return fetchMe(session);
  }

  function runRefreshSession() {
    return refreshSession(session);
  }

  function runRestoreSession() {
    return restoreSession(session);
  }

  /* =========================================================
     DEBUG / SNAPSHOT
  ========================================================= */
  function getAuthModuleSnapshot() {
    return {
      endpoints: AUTH_ENDPOINTS,
      storageKeys: AUTH_STORAGE_KEYS,
      constants: AUTH_CONSTANTS,
      session: safeCloneSessionState(session),
      authenticated: Boolean(isAuthenticated?.()),
      role: getCurrentRole?.() || null,
      sessionDebug: typeof getSessionDebugSnapshot === "function"
        ? getSessionDebugSnapshot()
        : null,
    };
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */
  return Object.freeze({
    AUTH_ENDPOINTS,
    AUTH_STORAGE_KEYS,
    AUTH_CONSTANTS,

    session,

    /* =======================================================
       AUTH ACTIONS
    ======================================================= */
    login,
    logout,
    handleLoginFormSubmit,

    /*
      reset password / forgot password
      - requestPasswordReset: nombre principal recomendado
      - resetPasswordRequest: alias compatible
      - forgotPassword: alias común en backends legacy
    */
    requestPasswordReset,
    resetPasswordRequest,
    forgotPassword,

    /* =======================================================
       RESET PASSWORD HELPERS
    ======================================================= */
    getRequestPasswordResetEndpoint,
    resolveResetPasswordIdentifier,
    normalizeResetPasswordPayload,
    buildResetPasswordRequestBody,
    normalizeResetPasswordResponse,

    /* =======================================================
       SESSION RECOVERY
    ======================================================= */
    fetchMe: runFetchMe,
    refreshSession: runRefreshSession,
    restoreSession: runRestoreSession,

    /* =======================================================
       AUTH STATE
    ======================================================= */
    isAuthenticated,
    isAuthRoute,

    /* =======================================================
       ROLES / GUARDS
    ======================================================= */
    hasRole,
    requireRole,
    guardAuthenticated,
    guardRole,
    getCurrentRole,

    /* =======================================================
       HEADERS / SESSION LOCAL
    ======================================================= */
    getAuthHeader,
    clearSessionLocal,
    applySession,
    buildSessionSnapshot,
    getSessionDebugSnapshot,

    /* =======================================================
       NORMALIZATION
    ======================================================= */
    normalizeUser,

    /* =======================================================
       LOGIN HELPERS
    ======================================================= */
    resolveLoginIdentifier,
    normalizeLoginPayload,
    buildLoginRequestBody,
    buildLoginRedirectPath,
    getPostLoginTarget,

    /* =======================================================
       STORAGE HELPERS
    ======================================================= */
    hasRefreshToken,
    hasRefreshContext,
    getStoredRefreshToken,
    getStoredTempToken,
    getStoredSessionId,
    getStoredSessionUserId,

    /* =======================================================
       DEBUG
    ======================================================= */
    getAuthModuleSnapshot,
  });
})();

export default Auth;
