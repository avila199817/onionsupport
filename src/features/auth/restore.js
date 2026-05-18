/* =========================================================
   Onion Support - Auth Restore
   Archivo: /src/features/auth/restore.js

   Responsabilidad:
   - Restaurar sesión mínima.
   - Si ya hay token + user usable: mantener sesión.
   - Si hay token sin user: pedir /api/auth/me.
   - Si /me devuelve user válido: aplicar sesión.
   - Si no hay token: limpiar sesión local.
   - Si /me falla con 401/403: limpiar sesión local.
   - No inventar slug.
   - No navegar.
   - Sin refresh automático.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin AppCore directo.
   - Sin storage directo.
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
  getCurrentUserSlug,
  getCurrentUserHomePath,
} from "./session.js";

export const RESTORE_VERSION = "auth.restore.v2";

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

/* =========================================================
   TOKEN
========================================================= */

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

function cleanToken(value = "") {
  return tokenOk(value) ? stripBearer(value) : "";
}

function currentToken() {
  return cleanToken(getCurrentToken?.() || "");
}

function currentUser() {
  return getCurrentUser?.() || null;
}

/* =========================================================
   ERRORS
========================================================= */

function authErrorStatus(error = null) {
  return (
    Number(
      error?.status ||
        error?.statusCode ||
        error?.response?.status ||
        error?.data?.status ||
        0
    ) || 0
  );
}

function authErrorCode(error = null) {
  return (
    error?.code ||
    error?.data?.code ||
    error?.response?.data?.code ||
    null
  );
}

function extractMessage(error = null) {
  return (
    text(error?.data?.message, "") ||
    text(error?.response?.data?.message, "") ||
    text(error?.message, "") ||
    String(error || "")
  );
}

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
    code: authErrorCode(error) || "AUTH_RESTORE_FAILED",
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

function isAuthFailure(error = null) {
  const status = authErrorStatus(error);
  return status === 401 || status === 403;
}

/* =========================================================
   SNAPSHOT / RESULT
========================================================= */

function sessionSnapshot(extra = {}) {
  let snapshot = {};

  try {
    snapshot = buildSessionSnapshot(extra) || {};
  } catch {
    snapshot = {};
  }

  const homePath =
    snapshot.homePath ||
    getCurrentUserHomePath?.() ||
    "/";

  return {
    version: RESTORE_VERSION,

    authenticated: Boolean(snapshot.authenticated || isAuthenticated()),
    hasToken: Boolean(currentToken()),
    hasUser: Boolean(currentUser()),

    user: snapshot.user || null,

    userSlug: snapshot.userSlug || getCurrentUserSlug?.() || null,
    homePath,
    defaultHome: snapshot.defaultHome || homePath,
    postLoginTarget: snapshot.postLoginTarget || homePath || null,

    role: snapshot.role || currentUser()?.role || null,
    roles: Array.isArray(snapshot.roles) ? snapshot.roles : [],

    source: extra.source || snapshot.source || "",
    eventMode: extra.eventMode || snapshot.eventMode || "",
  };
}

function restoreResult(source = "state") {
  const snapshot = sessionSnapshot({
    source,
    eventMode: "restore",
  });

  return {
    ok: Boolean(snapshot.authenticated),
    authenticated: Boolean(snapshot.authenticated),

    user: snapshot.user || null,

    userSlug: snapshot.userSlug || null,
    homePath: snapshot.homePath || "/",
    defaultHome: snapshot.defaultHome || snapshot.homePath || "/",
    postLoginTarget: snapshot.postLoginTarget || snapshot.homePath || null,

    snapshot,
    source,
  };
}

function emptyRestoreResult(source = "empty") {
  return {
    ok: false,
    authenticated: false,

    user: null,
    userSlug: null,

    homePath: "/",
    defaultHome: "/",
    postLoginTarget: null,

    snapshot: sessionSnapshot({
      source,
      eventMode: "restore",
    }),

    source,
  };
}

function failedRestoreResult(error = null, source = "error") {
  const finalError = normalizeRestoreError(error);

  return {
    ok: false,
    authenticated: false,

    user: null,
    userSlug: null,

    homePath: "/",
    defaultHome: "/",
    postLoginTarget: null,

    error: finalError,

    snapshot: sessionSnapshot({
      source,
      eventMode: "restore",
    }),

    source,
  };
}

/* =========================================================
   HTTP
========================================================= */

async function requestMe(token = "", options = {}) {
  const safeToken = cleanToken(token);

  if (!safeToken) {
    throw createRestoreError("No hay token para restaurar sesión.", {
      status: 401,
      code: "TOKEN_MISSING",
    });
  }

  const requestOptions = {
    ...options,
    token: safeToken,
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
   SESSION APPLY / CLEAR
========================================================= */

function applyMeResponse(response = {}, token = "", options = {}) {
  const safeToken = cleanToken(token);

  const payload = isObject(response)
    ? response
    : {
        data: response,
      };

  const snapshot = applySession(
    {
      ...payload,
      token: safeToken,
      accessToken: safeToken,
      access_token: safeToken,
    },
    {
      source: "auth.restore",
      eventMode: "restore",
      silent: options.silent !== false,
      emit: options.emit === true,
    }
  );

  if (!snapshot?.authenticated && !isAuthenticated()) {
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
      source: "auth.restore",
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

      applyMeResponse(response, token, options);

      runtime.lastMeAt = Date.now();
      runtime.lastError = null;

      return restoreResult("me");
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

        return restoreResult("state");
      }

      const token = currentToken();

      if (!tokenOk(token)) {
        clearInvalidSession(options);

        runtime.lastRestoreAt = Date.now();
        runtime.lastError = null;

        return emptyRestoreResult("empty");
      }

      const result = await fetchMe(options);

      runtime.lastRestoreAt = Date.now();
      runtime.lastError = null;

      return {
        ...result,
        source: "me",
      };
    } catch (error) {
      const finalError = rememberError("restore", error);

      if (isAuthFailure(finalError)) {
        clearInvalidSession(options);
      }

      return failedRestoreResult(finalError, "error");
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

  if (isAuthFailure(finalError)) {
    clearInvalidSession(options);
  }

  return failedRestoreResult(finalError, "me-failed");
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getRestoreSnapshot() {
  const snapshot = sessionSnapshot({
    source: "snapshot",
    eventMode: "debug",
  });

  return {
    version: RESTORE_VERSION,

    restoring: Boolean(runtime.restoring),
    checking: Boolean(runtime.checking),

    hasRestorePromise: Boolean(runtime.restorePromise),
    hasMePromise: Boolean(runtime.mePromise),

    lastRestoreAt: runtime.lastRestoreAt || 0,
    lastMeAt: runtime.lastMeAt || 0,
    lastError: runtime.lastError || null,

    authenticated: Boolean(snapshot.authenticated),
    hasToken: Boolean(currentToken()),
    hasUser: Boolean(currentUser()),

    userSlug: snapshot.userSlug || null,
    homePath: snapshot.homePath || "/",
    defaultHome: snapshot.defaultHome || snapshot.homePath || "/",
    postLoginTarget: snapshot.postLoginTarget || null,

    endpoint: ME_ENDPOINT,

    policy: {
      noRouter: true,
      noToast: true,
      noRefreshAuto: true,
      noFetchOwn: true,
      noStorageDirect: true,
      restoresViaMe: true,
      noSlugFabrication: true,
      no2fa: true,
    },
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
