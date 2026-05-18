/* =========================================================
   Onion Support - Auth Restore
   Archivo: /src/features/auth/restore.js

   Responsabilidad:
   - Restaurar sesión mínima.
   - Si ya hay token + user usable: mantener sesión.
   - Si hay token sin user: pedir /api/auth/me.
   - Si /me devuelve user válido: aplicar sesión.
   - Si no hay token o /me falla con 401/403: limpiar sesión local.
   - Sin refresh automático.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin AppCore directo.
   - Sin storage.
   - Sin 2FA/MFA/OTP.
========================================================= */

import * as CoreHttpModule from "../../core/http.js";

import {
  applySession,
  clearSessionLocal,
  buildSessionSnapshot,
  isAuthenticated,
  getCurrentToken,
  getCurrentUser,
} from "./session.js";

export const RESTORE_VERSION = "minimal-1";

const SOURCE = "auth.restore";
const ME_ENDPOINT = "/api/auth/me";

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

const runtime = {
  restoring: false,
  checking: false,
  restorePromise: null,
  mePromise: null,
  lastRestoreAt: 0,
  lastMeAt: 0,
  lastError: null,
};

/* =========================================================
   BASICS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function stripBearer(value = "") {
  return text(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(token.toLowerCase());
}

function authErrorStatus(error = null) {
  return Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status ||
      0
  ) || 0;
}

function extractMessage(error = null) {
  return (
    text(error?.data?.message, "") ||
    text(error?.response?.data?.message, "") ||
    text(error?.message, "") ||
    String(error || "")
  );
}

/* =========================================================
   ERRORS
========================================================= */

function createRestoreError(message = "No se pudo restaurar la sesión.", options = {}) {
  const error = new Error(text(message, "No se pudo restaurar la sesión."));

  error.name = "AuthRestoreError";
  error.status = options.status || 401;
  error.statusCode = error.status;
  error.code = options.code || "AUTH_RESTORE_FAILED";

  return error;
}

function normalizeRestoreError(error = null) {
  if (error?.name === "AuthRestoreError") return error;

  const status = authErrorStatus(error);

  return createRestoreError(extractMessage(error), {
    status: status || 500,
    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      "AUTH_RESTORE_FAILED",
  });
}

function rememberError(type = "restore", error = null) {
  const finalError = normalizeRestoreError(error);

  runtime.lastError = {
    type,
    message: finalError.message,
    status: finalError.status || 0,
    code: finalError.code || null,
    at: nowIso(),
  };

  return finalError;
}

/* =========================================================
   HTTP
========================================================= */

async function requestMe(token = "", options = {}) {
  if (!tokenOk(token)) {
    throw createRestoreError("No hay token para restaurar sesión.", {
      status: 401,
      code: "TOKEN_MISSING",
    });
  }

  const requestOptions = {
    ...options,
    token,
    auth: true,
    public: false,
    skipAuth: false,
    cache: "no-store",
  };

  if (isFn(CoreHttp?.me)) {
    return CoreHttp.me(requestOptions);
  }

  if (isFn(CoreHttp?.get)) {
    return CoreHttp.get(ME_ENDPOINT, requestOptions);
  }

  if (isFn(CoreHttp?.request)) {
    return CoreHttp.request(ME_ENDPOINT, {
      ...requestOptions,
      method: "GET",
    });
  }

  throw createRestoreError("Cliente HTTP no disponible.", {
    status: 500,
    code: "HTTP_CLIENT_MISSING",
  });
}

/* =========================================================
   CORE
========================================================= */

function currentToken() {
  return stripBearer(getCurrentToken?.() || "");
}

function currentUser() {
  return getCurrentUser?.() || null;
}

function sessionSnapshot(extra = {}) {
  let snapshot = {};

  try {
    snapshot = buildSessionSnapshot(extra) || {};
  } catch {
    snapshot = {};
  }

  return {
    version: RESTORE_VERSION,
    authenticated: Boolean(snapshot.authenticated || isAuthenticated()),
    hasToken: Boolean(currentToken()),
    hasUser: Boolean(currentUser()),
    user: snapshot.user || currentUser() || null,
    role: snapshot.role || currentUser()?.role || null,
    ...extra,
  };
}

function applyMeResponse(response = {}, token = "", options = {}) {
  const snapshot = applySession(
    {
      ...(isObject(response) ? response : { data: response }),

      token,
      accessToken: token,
      access_token: token,
    },
    {
      source: SOURCE,
      eventMode: "restore",
      silent: options.silent !== false,
      emit: options.emit === true,
    }
  );

  if (!isAuthenticated()) {
    throw createRestoreError("No se pudo resolver una sesión válida desde /me.", {
      status: 401,
      code: "ME_SESSION_INVALID",
    });
  }

  return snapshot;
}

function clearInvalidSession(options = {}) {
  try {
    clearSessionLocal({
      source: SOURCE,
      silent: options.silent !== false,
      emit: options.emit === true,
    });
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   /ME
========================================================= */

export async function fetchMe(options = {}) {
  if (runtime.mePromise) return runtime.mePromise;

  const token = currentToken();

  if (!tokenOk(token)) {
    throw createRestoreError("No hay token para /me.", {
      status: 401,
      code: "TOKEN_MISSING",
    });
  }

  runtime.checking = true;

  runtime.mePromise = (async () => {
    try {
      const response = await requestMe(token, options);
      const snapshot = applyMeResponse(response, token, options);

      runtime.lastMeAt = Date.now();
      runtime.lastError = null;

      return {
        ok: true,
        authenticated: true,
        user: currentUser(),
        snapshot,
        source: "me",
      };
    } catch (error) {
      throw rememberError("me", error);
    } finally {
      runtime.checking = false;
      runtime.mePromise = null;
    }
  })();

  return runtime.mePromise;
}

/* =========================================================
   RESTORE
========================================================= */

export async function restoreSession(options = {}) {
  if (runtime.restorePromise) return runtime.restorePromise;

  runtime.restoring = true;

  runtime.restorePromise = (async () => {
    try {
      if (isAuthenticated()) {
        runtime.lastRestoreAt = Date.now();
        runtime.lastError = null;

        return {
          ok: true,
          authenticated: true,
          user: currentUser(),
          snapshot: sessionSnapshot({ source: "state" }),
          source: "state",
        };
      }

      const token = currentToken();

      if (!tokenOk(token)) {
        clearInvalidSession(options);

        runtime.lastRestoreAt = Date.now();
        runtime.lastError = null;

        return {
          ok: false,
          authenticated: false,
          user: null,
          source: "empty",
        };
      }

      const result = await fetchMe(options);

      runtime.lastRestoreAt = Date.now;
      runtime.lastError = null;

      return {
        ...result,
        source: "me",
      };
    } catch (error) {
      const finalError = rememberError("restore", error);
      const status = authErrorStatus(finalError);

      if (status === 401 || status === 403) {
        clearInvalidSession(options);
      }

      return {
        ok: false,
        authenticated: false,
        user: null,
        error: finalError,
        source: "error",
      };
    } finally {
      runtime.restoring = false;
      runtime.restorePromise = null;
    }
  })();

  return runtime.restorePromise;
}

export const restoreSessionInBackground = restoreSession;

/* =========================================================
   COMPAT MÍNIMA
========================================================= */

export async function restoreUsingMe(options = {}) {
  return fetchMe(options);
}

export async function refreshSession() {
  throw createRestoreError("Refresh automático desactivado en restore mínimo.", {
    status: 400,
    code: "REFRESH_DISABLED",
  });
}

export const restoreUsingRefreshOnly = refreshSession;
export const restoreUsingRefreshPreferred = refreshSession;

export async function restoreAfterMeFailure(_sessionArg, error, options = {}) {
  const finalError = normalizeRestoreError(error);
  const status = authErrorStatus(finalError);

  if (status === 401 || status === 403) {
    clearInvalidSession(options);
  }

  return {
    ok: false,
    authenticated: false,
    user: null,
    error: finalError,
    source: "me-failed",
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getRestoreSnapshot() {
  return {
    version: RESTORE_VERSION,

    restoring: Boolean(runtime.restoring),
    checking: Boolean(runtime.checking),

    hasRestorePromise: Boolean(runtime.restorePromise),
    hasMePromise: Boolean(runtime.mePromise),

    lastRestoreAt: runtime.lastRestoreAt || 0,
    lastMeAt: runtime.lastMeAt || 0,
    lastError: runtime.lastError || null,

    authenticated: Boolean(isAuthenticated()),
    hasToken: Boolean(currentToken()),
    hasUser: Boolean(currentUser()),

    endpoint: ME_ENDPOINT,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  RESTORE_VERSION,

  fetchMe,
  restoreSession,
  restoreSessionInBackground,

  refreshSession,
  restoreUsingMe,
  restoreUsingRefreshOnly,
  restoreUsingRefreshPreferred,
  restoreAfterMeFailure,

  getRestoreSnapshot,
};
