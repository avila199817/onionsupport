/* =========================================================
   Onion SPA - Auth / Session
   Archivo: src/features/auth/index.js

   RESPONSABILIDADES:
   - punto de entrada del módulo auth
   - composición de login / logout / restore / guards
   - exponer helpers auth para toda la SPA
   - serializar restore / refresh / me
   - mantener compatibilidad con backend heterogéneo
   - exponer aliases públicos estables para auth flows
   - integrar reset-password / forgot-password
   - integrar confirmación de reset-password
   - ofrecer api pública coherente y endurecida

   HARDENING EXTREMO:
   - singleton inmutable
   - wrappers robustos
   - snapshot debug enterprise
   - tolerancia total a módulos parciales
   - aliases legacy estables
   - métricas auth enriquecidas
   - no race conditions restore/refresh/me
   - estado runtime consistente
========================================================= */

import {
  AUTH_ENDPOINTS,
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  isAuthRoute,
  extractMessage,
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

import * as PasswordResetApi from "./password-reset.js";

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
   PASSWORD RESET RESOLUTION
========================================================= */

const requestPasswordReset =
  PasswordResetApi?.requestPasswordReset ||
  PasswordResetApi?.forgotPassword ||
  null;

const resetPasswordRequest =
  PasswordResetApi?.resetPasswordRequest ||
  requestPasswordReset ||
  null;

const forgotPassword =
  PasswordResetApi?.forgotPassword ||
  requestPasswordReset ||
  null;

const getRequestPasswordResetEndpoint =
  PasswordResetApi?.getRequestPasswordResetEndpoint ||
  (() =>
    AUTH_ENDPOINTS?.forgotPassword ||
    null);

const resolveResetPasswordIdentifier =
  PasswordResetApi?.resolveResetPasswordIdentifier ||
  ((value) =>
    String(value || "").trim());

const normalizeResetPasswordPayload =
  PasswordResetApi?.normalizeResetPasswordPayload ||
  ((payload = {}) => payload);

const buildResetPasswordRequestBody =
  PasswordResetApi?.buildResetPasswordRequestBody ||
  ((payload = {}) => payload);

const normalizeResetPasswordResponse =
  PasswordResetApi?.normalizeResetPasswordResponse ||
  ((response = {}) => response);

/* =========================================================
   CONFIRM RESET PASSWORD
========================================================= */

function resolveConfirmResetPasswordHandler() {
  const candidates = [
    PasswordResetApi?.confirmResetPassword,
    PasswordResetApi?.resetPasswordConfirm,
    PasswordResetApi?.confirmPasswordReset,
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate ===
      "function"
    ) {
      return candidate;
    }
  }

  return null;
}

async function confirmResetPassword(
  payload = {}
) {
  const executor =
    resolveConfirmResetPasswordHandler();

  if (
    typeof executor !==
    "function"
  ) {
    throw new Error(
      "Auth: falta implementar confirmResetPassword en ./password-reset.js"
    );
  }

  return executor(payload);
}

const resetPasswordConfirm =
  confirmResetPassword;

/* =========================================================
   INTERNAL SESSION STATE
========================================================= */

function createInitialSessionState() {
  return {
    restoring: false,
    checking: false,
    refreshing: false,

    lastCheckAt: null,
    lastRefreshAt: null,
    lastRestoreAt: null,

    refreshPromise: null,
    mePromise: null,
    restorePromise: null,

    refreshFailCount: 0,
    refreshBlockedUntil: 0,

    lastError: null,
  };
}

function safeCloneSessionState(
  source = {}
) {
  return {
    restoring:
      Boolean(source.restoring),

    checking:
      Boolean(source.checking),

    refreshing:
      Boolean(source.refreshing),

    lastCheckAt:
      source.lastCheckAt || null,

    lastRefreshAt:
      source.lastRefreshAt || null,

    lastRestoreAt:
      source.lastRestoreAt || null,

    refreshPromise:
      source.refreshPromise || null,

    mePromise:
      source.mePromise || null,

    restorePromise:
      source.restorePromise || null,

    refreshFailCount:
      Number(
        source.refreshFailCount || 0
      ),

    refreshBlockedUntil:
      Number(
        source.refreshBlockedUntil || 0
      ),

    lastError:
      source.lastError || null,
  };
}

/* =========================================================
   HELPERS
========================================================= */

function nowMs() {
  return Date.now();
}

function emit(
  eventName,
  payload = {}
) {
  try {
    globalThis?.window?.AppCore
      ?.events?.emit?.(
        eventName,
        payload
      );
  } catch {}

  try {
    globalThis?.AppCore
      ?.events?.emit?.(
        eventName,
        payload
      );
  } catch {}
}

function safeRun(
  fn,
  fallback
) {
  return async (...args) => {
    try {
      if (
        typeof fn !==
        "function"
      ) {
        return fallback;
      }

      return await Promise.resolve(
        fn(...args)
      );
    } catch (error) {
      console.warn(
        "[Auth]",
        error
      );

      return {
        ...(fallback || {}),
        ok: false,
        error,
        message:
          extractMessage?.(
            error
          ) ||
          String(error),
      };
    }
  };
}

function safeCall(
  fn,
  fallback,
  ...args
) {
  try {
    if (
      typeof fn !==
      "function"
    ) {
      return fallback;
    }

    return fn(...args);
  } catch {
    return fallback;
  }
}

function withMetric(
  session,
  type,
  executor
) {
  return async (...args) => {
    const startedAt =
      nowMs();

    emit(
      `auth:${type}:start`,
      {}
    );

    try {
      const result =
        await executor(...args);

      if (
        type === "restore"
      ) {
        session.lastRestoreAt =
          nowMs();
      }

      if (
        type === "refresh"
      ) {
        session.lastRefreshAt =
          nowMs();
      }

      if (
        type === "me"
      ) {
        session.lastCheckAt =
          nowMs();
      }

      emit(
        `auth:${type}:success`,
        {
          durationMs:
            nowMs() -
            startedAt,
          ok:
            result?.ok !== false,
        }
      );

      return result;
    } catch (error) {
      session.lastError = {
        type,
        message:
          extractMessage?.(
            error
          ) ||
          String(error),
        at:
          new Date().toISOString(),
      };

      emit(
        `auth:${type}:error`,
        {
          durationMs:
            nowMs() -
            startedAt,
          error:
            session.lastError,
        }
      );

      throw error;
    }
  };
}

/* =========================================================
   AUTH SINGLETON
========================================================= */

export const Auth = (() => {
  "use strict";

  const session =
    createInitialSessionState();

  /* =======================================================
     SERIALIZED WRAPPERS
  ======================================================= */

  const runFetchMe =
    withMetric(
      session,
      "me",
      safeRun(fetchMe, {
        ok: false,
        user: null,
      })
    );

  const runRefreshSession =
    withMetric(
      session,
      "refresh",
      safeRun(
        refreshSession,
        {
          ok: false,
        }
      )
    );

  const runRestoreSession =
    withMetric(
      session,
      "restore",
      safeRun(
        restoreSession,
        {
          ok: false,
          user: null,
        }
      )
    );

  /* =======================================================
     SNAPSHOT DEBUG
  ======================================================= */

  function getAuthModuleSnapshot() {
    return {
      endpoints:
        AUTH_ENDPOINTS,

      storageKeys:
        AUTH_STORAGE_KEYS,

      constants:
        AUTH_CONSTANTS,

      session:
        safeCloneSessionState(
          session
        ),

      authenticated:
        Boolean(
          safeCall(
            isAuthenticated,
            false
          )
        ),

      role:
        safeCall(
          getCurrentRole,
          null
        ),

      sessionDebug:
        safeCall(
          getSessionDebugSnapshot,
          null
        ),

      storage: {
        hasRefreshToken:
          hasRefreshToken(),
        hasRefreshContext:
          hasRefreshContext(),
        refreshToken:
          getStoredRefreshToken() ||
          null,
        tempToken:
          getStoredTempToken() ||
          null,
        sessionId:
          getStoredSessionId() ||
          null,
        sessionUserId:
          getStoredSessionUserId() ||
          null,
      },

      passwordReset: {
        hasRequestPasswordReset:
          typeof requestPasswordReset ===
          "function",

        hasConfirmResetPassword:
          typeof resolveConfirmResetPasswordHandler() ===
          "function",
      },
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  return Object.freeze({
    AUTH_ENDPOINTS,
    AUTH_STORAGE_KEYS,
    AUTH_CONSTANTS,

    session,

    /* AUTH ACTIONS */
    login,
    logout,
    handleLoginFormSubmit,

    /* PASSWORD RESET */
    requestPasswordReset,
    resetPasswordRequest,
    forgotPassword,

    confirmResetPassword,
    resetPasswordConfirm,

    getRequestPasswordResetEndpoint,
    resolveResetPasswordIdentifier,
    normalizeResetPasswordPayload,
    buildResetPasswordRequestBody,
    normalizeResetPasswordResponse,

    /* SESSION */
    fetchMe:
      (...args) =>
        runFetchMe(
          session,
          ...args
        ),

    refreshSession:
      (...args) =>
        runRefreshSession(
          session,
          ...args
        ),

    restoreSession:
      (...args) =>
        runRestoreSession(
          session,
          ...args
        ),

    /* STATE */
    isAuthenticated,
    isAuthRoute,

    /* ROLES */
    hasRole,
    requireRole,
    guardAuthenticated,
    guardRole,
    getCurrentRole,

    /* SESSION HELPERS */
    getAuthHeader,
    clearSessionLocal,
    applySession,
    buildSessionSnapshot,
    getSessionDebugSnapshot,

    /* NORMALIZE */
    normalizeUser,

    /* LOGIN HELPERS */
    resolveLoginIdentifier,
    normalizeLoginPayload,
    buildLoginRequestBody,
    buildLoginRedirectPath,
    getPostLoginTarget,

    /* STORAGE */
    hasRefreshToken,
    hasRefreshContext,
    getStoredRefreshToken,
    getStoredTempToken,
    getStoredSessionId,
    getStoredSessionUserId,

    /* DEBUG */
    getAuthModuleSnapshot,
  });
})();

export default Auth;
