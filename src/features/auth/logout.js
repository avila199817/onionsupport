/* =========================================================
   Onion Support - Auth Logout
   Archivo: /src/features/auth/logout.js

   Responsabilidad:
   - Logout remoto best-effort vía CoreHttp.
   - Limpieza local garantizada vía session.js.
   - Endpoint auth real desde core/config.js.
   - Usar credentials include para cookie httpOnly.
   - Limpiar access token runtime tras logout real o local.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin DOM hacks.
   - Sin refresh.
   - Sin navegación.
   - Sin eventos propios.
   - Sin storage.clear().
   - Sin AppCore directo.
   - Sin helpers externos.
========================================================= */

import * as CoreHttpModule from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  SENSITIVE_QUERY_PARAMS,
  TOKEN_PARAM,
} from "../../core/config.js";

import {
  clearSessionLocal,
  buildSessionSnapshot,
} from "./session.js";

export const AUTH_LOGOUT_VERSION = "auth.logout.v7";

const SOURCE = "auth.logout";
const LOGOUT_ENDPOINT = AUTH_ENDPOINTS.logout;

const SENSITIVE_QUERY_KEYS = Object.freeze(
  (Array.isArray(SENSITIVE_QUERY_PARAMS) && SENSITIVE_QUERY_PARAMS.length
    ? SENSITIVE_QUERY_PARAMS
    : [TOKEN_PARAM]
  ).map((key) => String(key).toLowerCase())
);

const SENSITIVE_QUERY_PATTERN = buildSensitiveQueryPattern();

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

let logoutPromise = null;
let logoutSequence = 0;

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

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSensitiveQueryPattern() {
  const keys = SENSITIVE_QUERY_KEYS
    .map(escapeRegExp)
    .filter(Boolean)
    .join("|");

  return keys
    ? new RegExp(`([?&#](?:${keys})=)([^&#\\s]+)`, "gi")
    : null;
}

function redact(value = "") {
  const raw = cleanText(value, "");
  const redactedQuery = SENSITIVE_QUERY_PATTERN
    ? raw.replace(SENSITIVE_QUERY_PATTERN, "$1***")
    : raw;

  return redactedQuery
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function normalizeCode(value = "") {
  return cleanText(value, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function errorPayload(error = null) {
  if (!error) return {};

  if (isObject(error.data)) return error.data;
  if (isObject(error.body)) return error.body;
  if (isObject(error.payload)) return error.payload;
  if (isObject(error.responseData)) return error.responseData;
  if (isObject(error.response?.data)) return error.response.data;
  if (isObject(error.response) && !isFunction(error.response.blob)) return error.response;

  return {};
}

function statusOf(value = null) {
  const payload = errorPayload(value);

  return Number(
    value?.status ||
      value?.statusCode ||
      value?.response?.status ||
      payload.status ||
      payload.statusCode ||
      0
  ) || 0;
}

function extractMessage(error = null) {
  const payload = errorPayload(error);

  return (
    cleanText(payload.message, "") ||
    cleanText(payload.error_description, "") ||
    cleanText(payload.error, "") ||
    cleanText(payload.detail, "") ||
    cleanText(error?.message, "") ||
    String(error || "")
  );
}

function extractCode(error = null) {
  const payload = errorPayload(error);

  return normalizeCode(
    error?.code ||
      payload.code ||
      payload.errorCode ||
      payload.error_code ||
      payload.error ||
      ""
  ) || null;
}

function publicError(error = null) {
  if (!error) return null;

  return {
    name: cleanText(error.name, "Error"),
    message: redact(extractMessage(error)),
    status: statusOf(error),
    code: extractCode(error),
  };
}

/* =========================================================
   SESSION SNAPSHOT
========================================================= */

function sessionSnapshot(extra = {}) {
  let snapshot = {};

  try {
    snapshot = buildSessionSnapshot({
      source: SOURCE,
      ...extra,
    }) || {};
  } catch {
    snapshot = {};
  }

  return {
    version: AUTH_LOGOUT_VERSION,

    authenticated: Boolean(snapshot.authenticated),
    hasToken: Boolean(snapshot.hasToken),
    hasRefreshToken: Boolean(snapshot.hasRefreshToken),

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,

    user: snapshot.user || null,

    userSlug: snapshot.userSlug || null,
    homePath: snapshot.homePath || "/",
    defaultHome: snapshot.defaultHome || snapshot.homePath || "/",
    postLoginTarget: snapshot.postLoginTarget || null,

    role: snapshot.role || null,
    roles: Array.isArray(snapshot.roles) ? snapshot.roles : [],

    sessionId: snapshot.sessionId ? "***" : null,
    sessionUserId: snapshot.sessionUserId ? "***" : null,

    cause: cleanText(extra.cause, ""),
    at: nowIso(),
  };
}

/* =========================================================
   REMOTE LOGOUT
========================================================= */

function alreadyLoggedOutStatus(status = 0) {
  return status === 401 || status === 403 || status === 404;
}

function shouldSkipRemote(options = {}) {
  return Boolean(
    options.remote === false ||
      options.skipRemote === true ||
      options.localOnly === true
  );
}

async function remoteLogout(options = {}) {
  if (shouldSkipRemote(options)) {
    return {
      ok: true,
      skipped: true,
      status: 0,
      transport: "disabled",
    };
  }

  const requestOptions = {
    ...options,

    auth: true,
    public: false,
    skipAuth: false,
    noAuthHeader: false,

    /*
      Logout es finalizador de sesión, no restaurador.
      No debe provocar refresh/retry auth.
    */
    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    noAutoRefresh: true,
    autoRefresh: false,

    credentials: options.credentials || "include",
    storeError: false,
    cache: "no-store",
    retries: 0,
  };

  try {
    let result = null;

    if (isFunction(CoreHttp?.logout)) {
      result = await CoreHttp.logout(requestOptions);

      return {
        ok: true,
        skipped: false,
        status: statusOf(result),
        transport: "CoreHttp.logout",
      };
    }

    if (isFunction(CoreHttp?.post)) {
      result = await CoreHttp.post(LOGOUT_ENDPOINT, {}, requestOptions);

      return {
        ok: true,
        skipped: false,
        status: statusOf(result),
        transport: "CoreHttp.post",
      };
    }

    if (isFunction(CoreHttp?.request)) {
      result = await CoreHttp.request(LOGOUT_ENDPOINT, {
        ...requestOptions,
        method: "POST",
        body: {},
      });

      return {
        ok: true,
        skipped: false,
        status: statusOf(result),
        transport: "CoreHttp.request",
      };
    }

    return {
      ok: false,
      skipped: true,
      status: 0,
      transport: "missing-http",
    };
  } catch (error) {
    const status = statusOf(error);

    if (alreadyLoggedOutStatus(status)) {
      return {
        ok: true,
        skipped: false,
        status,
        transport: "CoreHttp",
        alreadyInvalid: true,
      };
    }

    return {
      ok: false,
      skipped: false,
      status,
      transport: "CoreHttp",
      error: publicError(error),
    };
  }
}

/* =========================================================
   LOCAL CLEAR
========================================================= */

function clearHttpAuth() {
  try {
    if (isFunction(CoreHttp?.clearAuthTokens)) {
      CoreHttp.clearAuthTokens({
        clearState: true,
      });
      return true;
    }

    if (isFunction(CoreHttp?.setAccessToken)) {
      CoreHttp.setAccessToken(null, {
        clearState: true,
      });
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function clearLocal(options = {}) {
  let sessionCleared = false;

  try {
    clearSessionLocal({
      source: SOURCE,
      silent: true,
      emit: false,
      reason: options.reason || "logout",
    });

    sessionCleared = true;
  } catch {
    sessionCleared = false;
  }

  const httpCleared = clearHttpAuth();

  return {
    ok: Boolean(sessionCleared || httpCleared),
    sessionCleared,
    httpCleared,
  };
}

/* =========================================================
   LOGOUT
========================================================= */

export async function logout(options = {}) {
  if (logoutPromise) return logoutPromise;

  logoutPromise = (async () => {
    const sequence = ++logoutSequence;
    const startedAt = Date.now();

    const before = sessionSnapshot({
      cause: "before-logout",
    });

    const remote = await remoteLogout(options);

    /*
      Limpieza local obligatoria siempre:
      - aunque logout remoto falle,
      - aunque ya esté 401/403/404,
      - aunque se haya pedido localOnly.
    */
    const local = clearLocal({
      ...options,
      reason: "logout",
    });

    const after = sessionSnapshot({
      cause: "after-logout",
    });

    return {
      ok: true,
      authenticated: false,

      token: null,
      accessToken: null,
      access_token: null,
      refreshToken: null,
      refresh_token: null,

      localCleared: Boolean(local.ok),
      sessionCleared: Boolean(local.sessionCleared),
      httpCleared: Boolean(local.httpCleared),

      remoteOk: Boolean(remote.ok),
      remoteSkipped: Boolean(remote.skipped),
      remoteStatus: remote.status || 0,
      remoteTransport: remote.transport || "",
      remoteAlreadyInvalid: remote.alreadyInvalid === true,
      remoteError: remote.error || null,

      before,
      session: after,

      durationMs: Date.now() - startedAt,
      sequence,
      version: AUTH_LOGOUT_VERSION,
    };
  })()
    .catch((error) => {
      const local = clearLocal({
        ...options,
        reason: "logout-recovery",
      });

      return {
        ok: true,
        recovered: true,
        authenticated: false,

        token: null,
        accessToken: null,
        access_token: null,
        refreshToken: null,
        refresh_token: null,

        localCleared: Boolean(local.ok),
        sessionCleared: Boolean(local.sessionCleared),
        httpCleared: Boolean(local.httpCleared),

        remoteOk: false,
        error: publicError(error),

        session: sessionSnapshot({
          cause: "after-logout-recovery",
        }),

        version: AUTH_LOGOUT_VERSION,
      };
    })
    .finally(() => {
      logoutPromise = null;
    });

  return logoutPromise;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getLogoutSnapshot() {
  const snapshot = sessionSnapshot({
    cause: "logout-snapshot",
  });

  return {
    version: AUTH_LOGOUT_VERSION,

    inFlight: Boolean(logoutPromise),
    sequence: logoutSequence,

    endpoint: LOGOUT_ENDPOINT,

    authenticated: Boolean(snapshot.authenticated),
    hasToken: Boolean(snapshot.hasToken),
    hasRefreshToken: Boolean(snapshot.hasRefreshToken),

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,

    transport: {
      hasCoreHttp: Boolean(CoreHttp?.request || CoreHttp?.post || CoreHttp?.logout),
      coreLogout: Boolean(CoreHttp?.logout),
      corePost: Boolean(CoreHttp?.post),
      coreRequest: Boolean(CoreHttp?.request),
      credentialsInclude: true,
    },

    policy: {
      remoteBestEffort: true,
      localClearGuaranteed: true,

      endpointFromConfig: true,
      endpoint: "/api/auth/logout",

      credentialsInclude: true,
      noAuthRefreshDuringLogout: true,

      ownFetch: false,
      ownApiClient: false,
      ownRouter: false,
      ownToast: false,
      ownDom: false,
      ownStorageClearAll: false,
      ownEvents: false,
      directAppCore: false,

      noRefresh: true,
      navigation: false,

      tokensNeverExposed: true,
      snapshotRedacted: true,
    },

    at: nowIso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default logout;
