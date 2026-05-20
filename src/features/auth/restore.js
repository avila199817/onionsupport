/* =========================================================
   Onion Support - Auth Restore
   Archivo: /src/features/auth/restore.js

   Responsabilidad:
   - Restaurar sesión mínima.
   - Si ya hay token + user usable: mantener sesión.
   - Si hay token sin user: pedir /api/auth/me.
   - Si /me devuelve user válido: aplicar sesión.
   - Si access token caducó y hay refresh context: renovar por /api/auth/refresh.
   - Si refresh devuelve sesión válida: aplicar sesión.
   - Si no hay token ni refresh context: limpiar sesión local.
   - Si /me o /refresh fallan con 401/403: limpiar sesión local.
   - No inventar slug.
   - No navegar.
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
  AUTH_ENDPOINTS,
} from "../../core/config.js";

import {
  applySession,
  clearSessionLocal,
  buildSessionSnapshot,
  isAuthenticated,
  getCurrentToken,
  getCurrentRefreshToken,
  getCurrentSessionContext,
  getCurrentUser,
  getCurrentUserSlug,
  getCurrentUserHomePath,
} from "./session.js";

export const RESTORE_VERSION = "auth.restore.v5";

const ME_ENDPOINT = AUTH_ENDPOINTS.me;
const REFRESH_ENDPOINT = AUTH_ENDPOINTS.refresh;

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

const runtime = {
  restoring: false,
  checking: false,
  refreshing: false,

  restorePromise: null,
  mePromise: null,
  refreshPromise: null,

  lastRestoreAt: 0,
  lastMeAt: 0,
  lastRefreshAt: 0,
  lastError: null,
};

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
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

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   TOKEN / SESSION CONTEXT
========================================================= */

function stripBearer(value = "") {
  return cleanText(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;
  if (token.length > 8192) return false;

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
  const token = stripBearer(value);
  return tokenOk(token) ? token : "";
}

function currentToken() {
  return cleanToken(getCurrentToken?.() || "");
}

function currentRefreshToken() {
  return cleanToken(getCurrentRefreshToken?.() || "");
}

function currentUser() {
  return getCurrentUser?.() || null;
}

function currentSession() {
  try {
    return getCurrentSessionContext?.() || null;
  } catch {
    return null;
  }
}

function refreshContext() {
  const session = currentSession();
  const refreshToken = currentRefreshToken();

  const sessionId = cleanText(
    session?.sessionId ||
      session?.id ||
      session?.sid ||
      "",
    ""
  );

  const userId = cleanText(
    session?.userId ||
      session?.sessionUserId ||
      session?.user_id ||
      session?.session_user_id ||
      "",
    ""
  );

  return {
    refreshToken,
    sessionId,
    userId,
    session,
    usable: Boolean(refreshToken && sessionId && userId),
  };
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
  return redact(
    cleanText(error?.data?.message, "") ||
      cleanText(error?.response?.data?.message, "") ||
      cleanText(error?.message, "") ||
      String(error || "")
  );
}

function createRestoreError(
  message = "No se pudo restaurar la sesión.",
  options = {}
) {
  const error = new Error(
    redact(cleanText(message, "No se pudo restaurar la sesión."))
  );

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

function publicError(error = null) {
  if (!error) return null;

  const finalError = normalizeRestoreError(error);

  return {
    name: finalError.name || "AuthRestoreError",
    message: redact(finalError.message || ""),
    status: finalError.status || finalError.statusCode || 0,
    code: finalError.code || null,
  };
}

function rememberError(type = "restore", error = null) {
  const finalError = normalizeRestoreError(error);

  runtime.lastError = {
    type,
    ...publicError(finalError),
    at: nowIso(),
  };

  return finalError;
}

function clearLastError() {
  runtime.lastError = null;
  return true;
}

function isAuthFailure(error = null) {
  const status = authErrorStatus(error);
  return status === 401 || status === 403;
}

function isRefreshableAuthFailure(error = null) {
  const finalError = normalizeRestoreError(error);
  const status = authErrorStatus(finalError);
  const code = cleanText(authErrorCode(finalError), "").toUpperCase();

  if (status !== 401) return false;

  return [
    "TOKEN_EXPIRED",
    "INVALID_TOKEN",
    "MISSING_TOKEN",
    "TOKEN_MISSING",
    "AUTH_RESTORE_FAILED",
    "REQUEST_ERROR",
  ].includes(code);
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
    hasRefreshToken: Boolean(currentRefreshToken()),
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

    error: publicError(finalError),

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
    noAuthHeader: false,
    cache: "no-store",
  };

  if (isFunction(CoreHttp?.me)) {
    return CoreHttp.me(requestOptions);
  }

  if (isFunction(CoreHttp?.get)) {
    return CoreHttp.get(ME_ENDPOINT, requestOptions);
  }

  if (isFunction(CoreHttp?.request)) {
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

async function requestRefresh(context = {}, options = {}) {
  const refreshToken = cleanToken(context.refreshToken || "");
  const sessionId = cleanText(context.sessionId, "");
  const userId = cleanText(context.userId, "");

  if (!refreshToken || !sessionId || !userId) {
    throw createRestoreError("Falta contexto para renovar sesión.", {
      status: 401,
      code: "MISSING_REFRESH_CONTEXT",
    });
  }

  const body = {
    refreshToken,
    refresh_token: refreshToken,

    sessionId,
    session_id: sessionId,

    userId,
    user_id: userId,

    session: {
      sessionId,
      id: sessionId,
      userId,
    },
  };

  const requestOptions = {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
    cache: "no-store",
  };

  if (isFunction(CoreHttp?.refreshSession)) {
    return CoreHttp.refreshSession(body, requestOptions);
  }

  if (isFunction(CoreHttp?.post)) {
    return CoreHttp.post(REFRESH_ENDPOINT, body, requestOptions);
  }

  if (isFunction(CoreHttp?.request)) {
    return CoreHttp.request(REFRESH_ENDPOINT, {
      ...requestOptions,
      method: "POST",
      body,
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
      source: "auth.restore.me",
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

function applyRefreshResponse(response = {}, options = {}) {
  const payload = isObject(response)
    ? response
    : {
        data: response,
      };

  const snapshot = applySession(payload, {
    source: "auth.restore.refresh",
    eventMode: "refresh",
    silent: options.silent !== false,
    emit: options.emit === true,
  });

  if (!snapshot?.authenticated && !isAuthenticated()) {
    throw createRestoreError("No se pudo renovar una sesión válida.", {
      status: 401,
      code: "REFRESH_SESSION_INVALID",
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
      clearLastError();

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
   /REFRESH
========================================================= */

export async function refreshSession(options = {}) {
  if (runtime.refreshPromise) return runtime.refreshPromise;

  runtime.refreshing = true;

  runtime.refreshPromise = (async () => {
    try {
      const context = refreshContext();

      if (!context.usable) {
        throw createRestoreError("No hay contexto suficiente para renovar sesión.", {
          status: 401,
          code: "MISSING_REFRESH_CONTEXT",
        });
      }

      const response = await requestRefresh(context, options);

      applyRefreshResponse(response, options);

      runtime.lastRefreshAt = Date.now();
      clearLastError();

      return restoreResult("refresh");
    } catch (error) {
      throw rememberError("refresh", error);
    } finally {
      runtime.refreshing = false;
      runtime.refreshPromise = null;
    }
  })();

  return runtime.refreshPromise;
}

async function tryRefreshAfterAuthFailure(error = null, options = {}) {
  if (!isRefreshableAuthFailure(error)) {
    throw normalizeRestoreError(error);
  }

  const context = refreshContext();

  if (!context.usable) {
    throw normalizeRestoreError(error);
  }

  return refreshSession(options);
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
        clearLastError();

        return restoreResult("state");
      }

      const token = currentToken();
      const context = refreshContext();

      if (!tokenOk(token)) {
        if (!context.usable) {
          clearInvalidSession(options);

          runtime.lastRestoreAt = Date.now();
          clearLastError();

          return emptyRestoreResult("empty");
        }

        try {
          const refreshed = await refreshSession(options);

          runtime.lastRestoreAt = Date.now();
          clearLastError();

          return {
            ...refreshed,
            source: "refresh",
          };
        } catch (refreshError) {
          const finalRefreshError = rememberError("restore.refresh", refreshError);

          if (isAuthFailure(finalRefreshError)) {
            clearInvalidSession(options);
          }

          runtime.lastRestoreAt = Date.now();

          return emptyRestoreResult("empty");
        }
      }

      try {
        const result = await fetchMe(options);

        runtime.lastRestoreAt = Date.now();
        clearLastError();

        return {
          ...result,
          source: "me",
        };
      } catch (meError) {
        const finalMeError = rememberError("restore.me", meError);

        try {
          const refreshed = await tryRefreshAfterAuthFailure(finalMeError, options);

          runtime.lastRestoreAt = Date.now();
          clearLastError();

          return {
            ...refreshed,
            source: "refresh",
          };
        } catch (refreshError) {
          const finalRefreshError = rememberError("restore.refresh", refreshError);

          if (isAuthFailure(finalRefreshError)) {
            clearInvalidSession(options);
          }

          runtime.lastRestoreAt = Date.now();

          return failedRestoreResult(finalRefreshError, "error");
        }
      }
    } finally {
      runtime.restoring = false;
      runtime.restorePromise = null;
    }
  })();

  return runtime.restorePromise;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getRestoreSnapshot() {
  const snapshot = sessionSnapshot({
    source: "snapshot",
    eventMode: "debug",
  });

  const context = refreshContext();

  return {
    version: RESTORE_VERSION,

    restoring: Boolean(runtime.restoring),
    checking: Boolean(runtime.checking),
    refreshing: Boolean(runtime.refreshing),

    hasRestorePromise: Boolean(runtime.restorePromise),
    hasMePromise: Boolean(runtime.mePromise),
    hasRefreshPromise: Boolean(runtime.refreshPromise),

    lastRestoreAt: runtime.lastRestoreAt || 0,
    lastMeAt: runtime.lastMeAt || 0,
    lastRefreshAt: runtime.lastRefreshAt || 0,
    lastError: runtime.lastError || null,

    authenticated: Boolean(snapshot.authenticated),
    hasToken: Boolean(currentToken()),
    hasRefreshToken: Boolean(currentRefreshToken()),
    hasUser: Boolean(currentUser()),

    hasRefreshContext: Boolean(context.usable),
    hasSessionId: Boolean(context.sessionId),
    hasSessionUserId: Boolean(context.userId),

    userSlug: snapshot.userSlug || null,
    homePath: snapshot.homePath || "/",
    defaultHome: snapshot.defaultHome || snapshot.homePath || "/",
    postLoginTarget: snapshot.postLoginTarget || null,

    endpoint: ME_ENDPOINT,
    refreshEndpoint: REFRESH_ENDPOINT,

    policy: {
      noRouter: true,
      noToast: true,
      refreshOnAuthFailure: true,
      noFetchOwn: true,
      noStorageDirect: true,
      restoresViaMe: true,
      refreshesViaCoreHttp: true,
      noSlugFabrication: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,
      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  RESTORE_VERSION,

  fetchMe,
  refreshSession,
  restoreSession,

  getRestoreSnapshot,
};
