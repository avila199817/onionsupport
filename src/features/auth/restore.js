/* =========================================================
   Onion Support - Auth Restore
   Archivo: /src/features/auth/restore.js

   Responsabilidad:
   - Restaurar sesión mínima.
   - Validar sesión contra /api/auth/me cuando hay access token.
   - Si access token caducó: intentar /api/auth/refresh antes de limpiar.
   - Si /me devuelve 401 genérico: intentar refresh silencioso antes de limpiar.
   - Si no hay access token: intentar refresh silencioso igualmente.
   - Refresh puede funcionar con cookie httpOnly y credentials include.
   - Si refresh devuelve sesión válida: aplicar sesión.
   - Si refresh devuelve token sin user: validar /me con el nuevo token.
   - Si /me devuelve user válido: aplicar sesión.
   - Si refresh confirma sesión inválida: limpiar sesión local.
   - Si hay error técnico/no auth: no fabricar logout.
   - Usuario inválido sólo por disabled/desactivado.
   - CoreHttp clasifica errores auth refreshable/clear-session.
   - session.js aplica/limpia/persiste sesión.
   - No inventar slug.
   - No navegar.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin AppCore directo.
   - Sin storage directo.
   - Sin 2FA/MFA/OTP.

   CONTRATO:
   - Access token caducado/rotado NO equivale a logout.
   - /api/auth/refresh es público, sin Authorization y con credentials include.
   - El refresh token NO tiene por qué estar disponible en JS.
   - session.js es el único que aplica/limpia sesión local.
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

export const RESTORE_VERSION = "auth.restore.v12";

const ME_ENDPOINT = AUTH_ENDPOINTS.me;
const REFRESH_ENDPOINT = AUTH_ENDPOINTS.refresh;

const TERMINAL_CLEAR_CODES = new Set([
  "SESSION_REVOKED",
  "SESSION_INVALID",
  "SESSION_NOT_FOUND",

  "INVALID_REFRESH_TOKEN",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_REVOKED",

  "USER_DISABLED",
  "USER_DESACTIVADO",
  "USUARIO_DESACTIVADO",
]);

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
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return null;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function normalizeCode(value = "") {
  return cleanText(value, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function safeHttpCall(name = "", ...args) {
  try {
    const fn = CoreHttp?.[name];

    if (isFunction(fn)) {
      return fn.apply(CoreHttp, args);
    }
  } catch {
    // noop
  }

  return null;
}

/* =========================================================
   TOKEN / PAYLOAD
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

function nestedPayloads(payload = {}) {
  if (!isObject(payload)) return [];

  return [
    payload,
    isObject(payload.data) ? payload.data : null,
    isObject(payload.payload) ? payload.payload : null,
    isObject(payload.result) ? payload.result : null,
    isObject(payload.auth) ? payload.auth : null,
    isObject(payload.session) ? payload.session : null,
    isObject(payload.sessionData) ? payload.sessionData : null,
  ].filter(Boolean);
}

function pick(payload = {}, names = []) {
  for (const node of nestedPayloads(payload)) {
    for (const name of names) {
      const value =
        node?.[name] ??
        node?.session?.[name] ??
        node?.sessionData?.[name] ??
        node?.auth?.[name];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return null;
}

function accessTokenFromPayload(payload = {}) {
  return cleanToken(
    pick(payload, [
      "token",
      "accessToken",
      "access_token",
    ]) || ""
  );
}

/* =========================================================
   REFRESH CONTEXT
========================================================= */

function allowSilentRefresh(options = {}) {
  return !(
    options.allowSilentRefresh === false ||
    options.silentRefresh === false ||
    options.disableRefresh === true ||
    options.noRefresh === true
  );
}

function allowCookieRefresh(options = {}) {
  return !(
    options.allowCookieRefresh === false ||
    options.cookieRefresh === false ||
    options.credentials === "omit"
  );
}

function refreshContext(options = {}) {
  const session = currentSession();
  const user = currentUser();
  const refreshToken = currentRefreshToken();

  const sessionId = cleanText(
    session?.sessionId ||
      session?.id ||
      session?.sid ||
      session?.session_id ||
      "",
    ""
  );

  const userId = cleanText(
    session?.userId ||
      session?.sessionUserId ||
      session?.user_id ||
      session?.session_user_id ||
      user?.userId ||
      user?.id ||
      user?.uid ||
      user?.sub ||
      "",
    ""
  );

  const cookieCandidate = allowCookieRefresh(options);

  return {
    refreshToken,
    sessionId,
    userId,
    session,
    user,

    usable: Boolean(refreshToken || cookieCandidate),
    hasRefreshToken: Boolean(refreshToken),
    hasCookieRefreshCandidate: Boolean(cookieCandidate),
    hasFullContext: Boolean((refreshToken || cookieCandidate) && sessionId && userId),
  };
}

/* =========================================================
   ERRORS
========================================================= */

function getErrorPayload(error = null) {
  if (!error) return {};

  if (isObject(error.data)) return error.data;
  if (isObject(error.body)) return error.body;
  if (isObject(error.payload)) return error.payload;
  if (isObject(error.responseData)) return error.responseData;
  if (isObject(error.response?.data)) return error.response.data;
  if (isObject(error.response) && !isFunction(error.response.blob)) return error.response;

  return {};
}

function authErrorStatus(error = null) {
  const payload = getErrorPayload(error);

  return (
    Number(
      error?.status ||
        error?.statusCode ||
        error?.response?.status ||
        payload.status ||
        payload.statusCode ||
        0
    ) || 0
  );
}

function authErrorCode(error = null) {
  try {
    if (isFunction(CoreHttp?.getHttpErrorCode)) {
      const code = CoreHttp.getHttpErrorCode(error);
      if (code) return normalizeCode(code);
    }
  } catch {
    // fallback abajo
  }

  const payload = getErrorPayload(error);

  return normalizeCode(
    first(
      error?.code,
      error?.error,
      payload.auth?.code,
      payload.auth?.error,
      payload.code,
      payload.error,
      payload.errorCode,
      payload.error_code,
      ""
    )
  );
}

function extractMessage(error = null) {
  const payload = getErrorPayload(error);

  return redact(
    cleanText(
      first(
        payload.message,
        payload.error_description,
        payload.detail,
        payload.reason,
        error?.message,
        authErrorCode(error),
        "No se pudo restaurar la sesión."
      ),
      "No se pudo restaurar la sesión."
    )
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
  error.code = normalizeCode(options.code || "AUTH_RESTORE_FAILED");

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

function coreHttpSaysRefreshable(error = null) {
  try {
    return isFunction(CoreHttp?.isRefreshableAuthError) &&
      CoreHttp.isRefreshableAuthError(error) === true;
  } catch {
    return false;
  }
}

function coreHttpSaysClearSession(error = null) {
  try {
    return isFunction(CoreHttp?.shouldClearSessionForAuthError) &&
      CoreHttp.shouldClearSessionForAuthError(error) === true;
  } catch {
    return false;
  }
}

function payloadSaysRefreshable(error = null) {
  const payload = getErrorPayload(error);
  const auth = isObject(payload.auth) ? payload.auth : {};

  return Boolean(
    auth.refreshRequired === true ||
      payload.refreshRequired === true ||
      auth.canRefresh === true ||
      payload.canRefresh === true
  );
}

function payloadSaysClearSession(error = null) {
  const payload = getErrorPayload(error);
  const auth = isObject(payload.auth) ? payload.auth : {};

  return Boolean(
    auth.clearClientSession === true ||
      payload.clearClientSession === true ||
      auth.shouldLogout === true ||
      payload.shouldLogout === true
  );
}

function localSaysClearSession(error = null) {
  return TERMINAL_CLEAR_CODES.has(authErrorCode(error));
}

function isAuthFailure(error = null) {
  const status = authErrorStatus(error);
  return status === 401 || status === 403;
}

function shouldClearSessionForAuthError(error = null) {
  if (payloadSaysClearSession(error)) return true;
  if (localSaysClearSession(error)) return true;

  /*
    CoreHttp puede tener una clasificación más amplia por compat.
    Para códigos USER_* no declarados en este proyecto, no limpiamos aquí.
  */
  if (coreHttpSaysClearSession(error)) {
    const code = authErrorCode(error);

    if (code.startsWith("USER_") && !TERMINAL_CLEAR_CODES.has(code)) {
      return false;
    }

    return true;
  }

  return false;
}

function isRefreshableAuthFailure(error = null, options = {}) {
  if (!allowSilentRefresh(options)) return false;

  if (shouldClearSessionForAuthError(error)) return false;

  if (coreHttpSaysRefreshable(error)) return true;
  if (payloadSaysRefreshable(error)) return true;

  const status = authErrorStatus(error);
  const code = authErrorCode(error);
  const context = refreshContext(options);

  if (status && status !== 401) return false;

  if (
    [
      "TOKEN_EXPIRED",
      "ACCESS_TOKEN_EXPIRED",
      "JWT_EXPIRED",
      "TOKEN_STALE",
      "MISSING_TOKEN",
      "TOKEN_MISSING",
      "SESSION_REQUIRED",
      "AUTH_REQUIRED",
      "UNAUTHORIZED",
    ].includes(code)
  ) {
    return Boolean(context.usable);
  }

  if (status === 401 && context.usable) {
    return true;
  }

  return false;
}

function rememberError(type = "restore", error = null, options = {}) {
  const finalError = normalizeRestoreError(error);

  runtime.lastError = {
    type,
    ...publicError(finalError),
    refreshable: isRefreshableAuthFailure(error, options),
    shouldClearSession: shouldClearSessionForAuthError(error),
    at: nowIso(),
  };

  return finalError;
}

function clearLastError() {
  runtime.lastError = null;
  return true;
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

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,

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
    restored: Boolean(snapshot.authenticated),
    authenticated: Boolean(snapshot.authenticated),

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,

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
    restored: false,
    authenticated: false,

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,

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
    restored: false,
    authenticated: false,

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,

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
    credentials: options.credentials || "include",
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

  if (!refreshToken && !allowCookieRefresh(options)) {
    throw createRestoreError("Falta contexto de refresh para renovar sesión.", {
      status: 401,
      code: "MISSING_REFRESH_CONTEXT",
    });
  }

  const body = {};

  if (refreshToken) {
    body.refreshToken = refreshToken;
    body.refresh_token = refreshToken;
  }

  if (sessionId) {
    body.sessionId = sessionId;
    body.session_id = sessionId;
  }

  if (userId) {
    body.userId = userId;
    body.user_id = userId;
  }

  if (sessionId || userId) {
    body.session = {
      ...(sessionId
        ? {
            sessionId,
            session_id: sessionId,
            id: sessionId,
          }
        : {}),
      ...(userId
        ? {
            userId,
            user_id: userId,
          }
        : {}),
    };
  }

  const requestOptions = {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
    cache: "no-store",
    credentials: options.credentials || "include",
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

  safeHttpCall("setAccessToken", safeToken);

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

async function applyRefreshResponse(response = {}, options = {}) {
  const payload = isObject(response)
    ? response
    : {
        data: response,
      };

  safeHttpCall("setAuthTokens", payload);

  const snapshot = applySession(payload, {
    source: "auth.restore.refresh",
    eventMode: "refresh",
    silent: options.silent !== false,
    emit: options.emit === true,
  });

  if (snapshot?.authenticated || isAuthenticated()) {
    return snapshot;
  }

  const refreshedToken =
    accessTokenFromPayload(payload) ||
    currentToken();

  if (tokenOk(refreshedToken)) {
    const meResponse = await requestMe(refreshedToken, options);
    return applyMeResponse(meResponse, refreshedToken, {
      ...options,
      source: "auth.restore.refresh.me",
    });
  }

  throw createRestoreError("No se pudo renovar una sesión válida.", {
    status: 401,
    code: "REFRESH_SESSION_INVALID",
  });
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

  safeHttpCall("clearAuthTokens", {
    clearState: true,
  });

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
      throw rememberError("me", error, options);
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

  if (!allowSilentRefresh(options)) {
    throw createRestoreError("Refresh silencioso desactivado para esta restauración.", {
      status: 401,
      code: "SILENT_REFRESH_DISABLED",
    });
  }

  runtime.refreshing = true;

  runtime.refreshPromise = (async () => {
    try {
      const context = refreshContext(options);

      if (!context.usable) {
        throw createRestoreError("No hay contexto para renovar sesión.", {
          status: 401,
          code: "MISSING_REFRESH_CONTEXT",
        });
      }

      const response = await requestRefresh(context, options);

      await applyRefreshResponse(response, options);

      runtime.lastRefreshAt = Date.now();
      clearLastError();

      return restoreResult("refresh");
    } catch (error) {
      throw rememberError("refresh", error, options);
    } finally {
      runtime.refreshing = false;
      runtime.refreshPromise = null;
    }
  })();

  return runtime.refreshPromise;
}

async function tryRefreshAfterAuthFailure(error = null, options = {}) {
  if (!isRefreshableAuthFailure(error, options)) {
    throw normalizeRestoreError(error);
  }

  const context = refreshContext(options);

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
      const token = currentToken();
      const context = refreshContext(options);

      if (tokenOk(token)) {
        try {
          const result = await fetchMe(options);

          runtime.lastRestoreAt = Date.now();
          clearLastError();

          return {
            ...result,
            source: "me",
          };
        } catch (meError) {
          rememberError("restore.me", meError, options);

          try {
            const refreshed = await tryRefreshAfterAuthFailure(meError, options);

            runtime.lastRestoreAt = Date.now();
            clearLastError();

            return {
              ...refreshed,
              source: "refresh",
            };
          } catch (refreshError) {
            rememberError("restore.refresh", refreshError, options);

            if (
              shouldClearSessionForAuthError(refreshError) ||
              isAuthFailure(refreshError)
            ) {
              clearInvalidSession(options);
              runtime.lastRestoreAt = Date.now();
              return emptyRestoreResult("empty");
            }

            runtime.lastRestoreAt = Date.now();
            return failedRestoreResult(refreshError, "error");
          }
        }
      }

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
        rememberError("restore.refresh", refreshError, options);

        if (
          shouldClearSessionForAuthError(refreshError) ||
          isAuthFailure(refreshError)
        ) {
          clearInvalidSession(options);
          runtime.lastRestoreAt = Date.now();
          return emptyRestoreResult("empty");
        }

        runtime.lastRestoreAt = Date.now();
        return failedRestoreResult(refreshError, "error");
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

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,

    hasRefreshContext: Boolean(context.usable),
    hasRefreshTokenContext: Boolean(context.hasRefreshToken),
    hasCookieRefreshCandidate: Boolean(context.hasCookieRefreshCandidate),
    hasFullRefreshContext: Boolean(context.hasFullContext),
    hasSessionId: Boolean(context.sessionId),
    hasSessionUserId: Boolean(context.userId),

    userSlug: snapshot.userSlug || null,
    homePath: snapshot.homePath || "/",
    defaultHome: snapshot.defaultHome || snapshot.homePath || "/",
    postLoginTarget: snapshot.postLoginTarget || null,

    endpoint: ME_ENDPOINT,
    refreshEndpoint: REFRESH_ENDPOINT,

    policy: {
      restoreOnly: true,

      coreHttpOwnsAuthErrorClassification: true,
      sessionOwnsApplyAndClear: true,

      noRouter: true,
      noToast: true,

      validatesMeOnRestore: true,
      refreshOnTokenExpired: true,
      refreshOnGenericMe401WithContext: true,
      refreshWithoutVisibleRefreshToken: true,
      supportsHttpOnlyCookieRefresh: true,
      tokenExpiredDoesNotMeanLogout: true,

      clearsOnlyTerminalSessionOrRefreshFailure: true,
      invalidUserStatuses: ["disabled", "desactivado"],

      noFetchOwn: true,
      noStorageDirect: true,

      restoresViaMe: true,
      refreshesViaCoreHttp: true,

      refreshTokenIsOptionalInJavascript: true,
      sessionIdUserIdPreferredButOptional: true,

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
