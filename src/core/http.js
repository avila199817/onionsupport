/* =========================================================
   Onion Support - Core HTTP
   Archivo: /src/core/http.js

   Responsabilidad:
   - Fachada mínima sobre core/request.js.
   - API real única.
   - Endpoints auth reales desde core/config.js.
   - /api/auth/me privado siempre.
   - Enviar Authorization cuando hay access token válido.
   - No reutilizar token runtime si AppCore ya marcó sesión sin token.
   - Exponer helpers mínimos para que session.js detecte refresh silencioso.
   - Sin fetch propio.
   - Sin parser propio.
   - Sin retry propio.
   - Sin refresh automático.
   - Sin Auth discovery.
   - Sin Router.
   - Sin Toast.
   - Sin Storage.
   - Sin magia negra.

   NOTA:
   - TOKEN_EXPIRED no implica logout.
   - Este archivo sólo clasifica el error.
   - session.js decide si llama /api/auth/refresh y rehidrata sesión.
========================================================= */

import {
  config,
  AUTH_ENDPOINTS,
  PUBLIC_API_PATHS,
  getApiBase,
  isCanonicalBackendApiBase,
  isPublicApiPath,
} from "./config.js";

import {
  createRequest,
  createApiClient,
} from "./request.js";

export const HTTP_VERSION = "core.http.v5";

export const DEFAULT_API_ORIGIN = getApiBase();
export const DEFAULT_TIMEOUT_MS = config?.api?.timeout || 30000;

let apiOrigin = normalizeOrigin(
  config?.apiBase ||
    config?.apiOrigin ||
    config?.api?.baseUrl ||
    DEFAULT_API_ORIGIN
);

let appCore = null;
let requestEngine = null;
let apiEngine = null;

const runtimeTokens = {
  accessToken: "",
};

const stats = {
  total: 0,
  success: 0,
  error: 0,

  lastUrl: "",
  lastMethod: "",
  lastError: null,

  lastAuthCode: "",
  lastRefreshable: false,
};

/* =========================================================
   AUTH ERROR POLICY
========================================================= */

const REFRESHABLE_AUTH_CODES = new Set([
  "TOKEN_EXPIRED",
  "MISSING_TOKEN",
  "SESSION_REQUIRED",
]);

const CLEAR_SESSION_AUTH_CODES = new Set([
  "INVALID_TOKEN",
  "INVALID_TOKEN_FORMAT",
  "INVALID_AUTHORIZATION_HEADER",
  "TEMP_TOKEN_NOT_ALLOWED",
  "TEMP_AUTH_DISABLED",

  "SESSION_INVALID",
  "SESSION_REVOKED",
  "SESSION_USER_MISMATCH",
  "SESSION_ID_MISMATCH",
  "SESSION_TOKEN_VERSION_MISMATCH",
  "SESSION_TOKEN_MISMATCH",

  "USER_INVALID",
  "USER_INACTIVE",
  "USER_DISABLED",
  "USER_NOT_AVAILABLE",
  "USER_EMAIL_UNVERIFIED",

  "PASSWORD_CHANGE_REQUIRED",
  "TOKEN_VERSION_MISMATCH",

  "INVALID_REFRESH_TOKEN",
  "SESSION_NOT_FOUND",
]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
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

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   ORIGIN
========================================================= */

function normalizeOrigin(value = "") {
  const raw = cleanText(value, DEFAULT_API_ORIGIN).replace(/\/+$/g, "");

  try {
    const url = new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return DEFAULT_API_ORIGIN;
    }

    if (!isCanonicalBackendApiBase(url.origin)) {
      return DEFAULT_API_ORIGIN;
    }

    return url.origin;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

function apiUrlOrigin() {
  try {
    return new URL(apiOrigin).origin;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

export function getApiOrigin() {
  return apiOrigin;
}

export function setApiOrigin(value = "") {
  apiOrigin = normalizeOrigin(value || DEFAULT_API_ORIGIN);

  requestEngine = null;
  apiEngine = null;

  return apiOrigin;
}

/* =========================================================
   TOKEN
========================================================= */

function cleanToken(value = "") {
  const token = cleanText(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";
  if (token.length > 8192) return "";

  if (
    [
      "null",
      "undefined",
      "false",
      "true",
      "[object object]",
      "{}",
      "[]",
    ].includes(token.toLowerCase())
  ) {
    return "";
  }

  return token;
}

function getState() {
  return isObject(appCore?.state) ? appCore.state : {};
}

function stateAccessToken(state = getState()) {
  return cleanToken(
    state.token ||
      state.accessToken ||
      state.access_token ||
      ""
  );
}

function stateExplicitlyHasNoToken(state = getState()) {
  return Boolean(
    state.hasToken === false ||
      (
        state.authenticated === false &&
        !stateAccessToken(state)
      )
  );
}

function accessTokenFromPayload(payload = {}) {
  const source = isObject(payload) ? payload : {};

  return cleanToken(
    first(
      source.token,
      source.accessToken,
      source.access_token,

      source.auth?.token,
      source.auth?.accessToken,
      source.auth?.access_token,

      source.data?.token,
      source.data?.accessToken,
      source.data?.access_token,

      ""
    )
  );
}

export function getAccessToken() {
  const state = getState();
  const token = stateAccessToken(state);

  if (token) return token;

  /*
    Si AppCore ya marcó sesión sin token, no se permite recuperar
    un runtime token antiguo. Esto evita Authorization stale después
    de clearSessionLocal()/logout/restore fallido.
  */
  if (stateExplicitlyHasNoToken(state)) {
    return "";
  }

  return cleanToken(runtimeTokens.accessToken || "");
}

export function setAccessToken(token = "") {
  const value = cleanToken(token);
  const state = getState();

  runtimeTokens.accessToken = value;

  if (!value) {
    delete state.token;
    delete state.accessToken;
    delete state.access_token;

    state.hasToken = false;

    return "";
  }

  state.token = value;
  state.accessToken = value;
  state.access_token = value;
  state.hasToken = true;

  return value;
}

export function setAuthTokens(payload = {}) {
  const access = setAccessToken(
    accessTokenFromPayload(payload)
  );

  return {
    token: access || "",
    accessToken: access || "",
    access_token: access || "",
  };
}

export function clearAuthTokens() {
  const state = getState();

  runtimeTokens.accessToken = "";

  delete state.token;
  delete state.accessToken;
  delete state.access_token;

  state.hasToken = false;

  return true;
}

/* =========================================================
   ENDPOINTS
========================================================= */

function endpointToPath(endpoint = "/") {
  const raw = cleanText(endpoint, "/");

  if (!raw) return "/";
  if (raw.startsWith("//")) return "/";
  if (/[\r\n\t\\]/.test(raw)) return "/";

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);

      if (url.origin !== apiUrlOrigin()) {
        return "/";
      }

      return `${url.pathname || "/"}${url.search || ""}`;
    }
  } catch {
    return "/";
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return "/";
  }

  const path = raw.startsWith("/") ? raw : `/${raw}`;

  return path.split("#")[0] || "/";
}

function endpointCleanPath(endpoint = "/") {
  return endpointToPath(endpoint).split("?")[0] || "/";
}

function appendQuery(url = "", query = null) {
  if (!isObject(query)) return url;

  const parsed = new URL(url, apiOrigin);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;

    parsed.searchParams.set(key, String(value));
  }

  return parsed.toString();
}

export function buildApiUrl(endpoint = "/", options = {}) {
  const path = endpointToPath(endpoint);
  return appendQuery(`${apiOrigin}${path}`, options.query || options.params);
}

export function redactHttpText(value = "") {
  return redact(value);
}

function endpointIsMe(endpoint = "") {
  return endpointCleanPath(endpoint) === AUTH_ENDPOINTS.me;
}

function endpointIsRefresh(endpoint = "") {
  return endpointCleanPath(endpoint) === AUTH_ENDPOINTS.refresh;
}

function endpointIsPublic(endpoint = "") {
  const clean = endpointCleanPath(endpoint);

  if (clean === AUTH_ENDPOINTS.me) return false;

  return isPublicApiPath(clean);
}

function shouldUseAuth(endpoint = "", options = {}) {
  if (endpointIsMe(endpoint)) return true;

  if (
    options.auth === false ||
    options.public === true ||
    options.skipAuth === true ||
    options.noAuthHeader === true
  ) {
    return false;
  }

  if (options.auth === true) return true;

  return !endpointIsPublic(endpoint);
}

/* =========================================================
   ERROR
========================================================= */

export class HttpError extends Error {
  constructor(message = "HTTP_ERROR", options = {}) {
    super(redact(message));

    this.name = "HttpError";
    this.status = options.status || 0;
    this.statusCode = this.status;
    this.code = options.code || "HTTP_ERROR";
    this.method = options.method || "";
    this.url = redact(options.url || "");
    this.data = options.data || null;
  }
}

function getErrorPayload(error = null) {
  if (!error) return {};

  if (isObject(error.data)) return error.data;
  if (isObject(error.body)) return error.body;
  if (isObject(error.payload)) return error.payload;
  if (isObject(error.response)) return error.response;
  if (isObject(error.responseData)) return error.responseData;

  return {};
}

export function getHttpErrorCode(error = null) {
  const payload = getErrorPayload(error);

  return cleanText(
    first(
      error?.code,
      error?.error,
      payload.code,
      payload.error,
      payload.auth?.code,
      payload.auth?.error,
      ""
    ),
    ""
  );
}

export function getHttpStatus(error = null) {
  return Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      getErrorPayload(error).statusCode ||
      0
  ) || 0;
}

export function isRefreshableAuthError(error = null) {
  const payload = getErrorPayload(error);
  const auth = isObject(payload.auth) ? payload.auth : {};
  const code = getHttpErrorCode(error);

  if (auth.refreshRequired === true || payload.refreshRequired === true) {
    return true;
  }

  if (auth.canRefresh === true || payload.canRefresh === true) {
    return true;
  }

  return REFRESHABLE_AUTH_CODES.has(code);
}

export function shouldClearSessionForAuthError(error = null) {
  const payload = getErrorPayload(error);
  const auth = isObject(payload.auth) ? payload.auth : {};
  const code = getHttpErrorCode(error);

  if (auth.clearClientSession === true || payload.clearClientSession === true) {
    return true;
  }

  if (auth.shouldLogout === true || payload.shouldLogout === true) {
    return true;
  }

  return CLEAR_SESSION_AUTH_CODES.has(code);
}

export function normalizeHttpError(error = null) {
  const payload = getErrorPayload(error);
  const code = getHttpErrorCode(error);
  const status = getHttpStatus(error);

  return {
    name: error?.name || "Error",
    message: redact(
      cleanText(
        first(
          error?.message,
          payload.message,
          payload.error_description,
          code,
          "HTTP_ERROR"
        ),
        "HTTP_ERROR"
      )
    ),
    status,
    statusCode: status,
    code: code || "HTTP_ERROR",

    canRefresh: isRefreshableAuthError(error),
    refreshRequired: isRefreshableAuthError(error),
    shouldLogout: shouldClearSessionForAuthError(error),
    clearClientSession: shouldClearSessionForAuthError(error),
  };
}

/* =========================================================
   ENGINE
========================================================= */

function ensureEngines() {
  if (requestEngine && apiEngine) {
    return {
      requestEngine,
      apiEngine,
    };
  }

  if (!isFunction(createRequest)) {
    throw new Error("createRequest() no disponible.");
  }

  if (!isFunction(createApiClient)) {
    throw new Error("createApiClient() no disponible.");
  }

  requestEngine = createRequest({
    state: getState(),
    events: appCore?.events || null,
    setError: appCore?.setError || null,
  });

  apiEngine = createApiClient(requestEngine);

  return {
    requestEngine,
    apiEngine,
  };
}

function normalizeRequestArgs(firstArg = "/", second = {}, third = {}) {
  if (
    typeof firstArg === "string" &&
    /^[A-Z]+$/i.test(firstArg) &&
    typeof second === "string"
  ) {
    return {
      endpoint: second,
      options: {
        ...(isObject(third) ? third : {}),
        method: firstArg.toUpperCase(),
      },
    };
  }

  if (isObject(firstArg)) {
    return {
      endpoint: firstArg.url || firstArg.path || firstArg.endpoint || "/",
      options: {
        ...firstArg,
        ...(isObject(second) ? second : {}),
      },
    };
  }

  return {
    endpoint: firstArg,
    options: isObject(second) ? second : {},
  };
}

function requestMethod(options = {}) {
  return cleanText(options.method, "GET").toUpperCase();
}

function buildAuthHeaders(options = {}, token = "") {
  const headers = {
    ...(isObject(options.headers) ? options.headers : {}),
  };

  const value = cleanToken(token);

  if (!value) return headers;

  if (!headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${value}`;
  }

  return headers;
}

/* =========================================================
   REQUEST
========================================================= */

export async function request(firstArg = "/", second = {}, third = {}) {
  const parsed = normalizeRequestArgs(firstArg, second, third);

  const endpoint = endpointToPath(parsed.endpoint);
  const options = isObject(parsed.options) ? parsed.options : {};
  const method = requestMethod(options);

  const url = buildApiUrl(endpoint, options);
  const auth = shouldUseAuth(endpoint, options);
  const token = auth ? cleanToken(options.token || getAccessToken()) : "";

  const headers = auth
    ? buildAuthHeaders(options, token)
    : isObject(options.headers)
      ? options.headers
      : undefined;

  const finalOptions = {
    ...options,

    query: undefined,
    params: undefined,
    token: undefined,

    method,

    auth,
    public: !auth,
    skipAuth: !auth,
    noAuthHeader: !auth,

    headers,
  };

  stats.total += 1;
  stats.lastUrl = redact(url);
  stats.lastMethod = method;

  try {
    const result = await ensureEngines().apiEngine.request(url, finalOptions);

    stats.success += 1;

    return result;
  } catch (error) {
    const normalized = normalizeHttpError(error);

    stats.error += 1;
    stats.lastAuthCode = normalized.code || "";
    stats.lastRefreshable = Boolean(normalized.canRefresh);
    stats.lastError = {
      name: normalized.name,
      message: redact(normalized.message || String(error)),
      status: normalized.status,
      code: normalized.code,
      url: redact(url),
      method,
      canRefresh: normalized.canRefresh,
      shouldLogout: normalized.shouldLogout,
    };

    throw error;
  }
}

/* =========================================================
   HTTP VERBS
========================================================= */

export function get(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...options,
    method: "GET",
  });
}

export function head(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...options,
    method: "HEAD",
  });
}

export function optionsRequest(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...options,
    method: "OPTIONS",
  });
}

export function post(endpoint = "/", body = undefined, options = {}) {
  return request(endpoint, {
    ...options,
    method: "POST",
    body,
  });
}

export function put(endpoint = "/", body = undefined, options = {}) {
  return request(endpoint, {
    ...options,
    method: "PUT",
    body,
  });
}

export function patch(endpoint = "/", body = undefined, options = {}) {
  return request(endpoint, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function del(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...options,
    method: "DELETE",
  });
}

export function upload(endpoint = "/", formData, options = {}) {
  return request(endpoint, {
    ...options,
    method: options.method || "POST",
    body: formData,
  });
}

export function download(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...options,
    method: "GET",
    responseType: options.responseType || "blob",
  });
}

export function raw(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...options,
    raw: true,
  });
}

/* =========================================================
   AUTH HELPERS
========================================================= */

export function login(credentials = {}, options = {}) {
  return post(AUTH_ENDPOINTS.login, credentials, {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
  });
}

export function me(options = {}) {
  return get(AUTH_ENDPOINTS.me, {
    ...options,
    auth: true,
    public: false,
    skipAuth: false,
    noAuthHeader: false,
    cache: "no-store",
  });
}

export function refreshSession(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.refresh, body, {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
    cache: "no-store",
  });
}

export function refresh(options = {}) {
  const opts = isObject(options) ? { ...options } : {};
  const body = isObject(opts.body) ? opts.body : {};

  delete opts.body;

  return refreshSession(body, opts);
}

export function logout(options = {}) {
  return post(AUTH_ENDPOINTS.logout, {}, {
    ...options,
    auth: true,
    public: false,
    skipAuth: false,
    noAuthHeader: false,
  }).finally(() => {
    clearAuthTokens();
  });
}

export function activate(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.activate, body, {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
  });
}

export function requestPasswordReset(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.requestPasswordReset, body, {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
  });
}

export function confirmPasswordReset(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.confirmPasswordReset, body, {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
  });
}

/* =========================================================
   INSTALL
========================================================= */

export function installHttp(AppCore = null, options = {}) {
  appCore = AppCore || appCore;

  if (options.apiOrigin || options.apiBase || options.baseUrl) {
    setApiOrigin(options.apiOrigin || options.apiBase || options.baseUrl);
  }

  requestEngine = null;
  apiEngine = null;

  if (isObject(appCore)) {
    if (isObject(appCore.services)) {
      appCore.services.http = Http;
    }

    appCore.modules?.register?.("http", Http);
  }

  return Http;
}

export const installCoreHttp = installHttp;
export const install = installHttp;

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHttpSnapshot() {
  return {
    version: HTTP_VERSION,

    origin: getApiOrigin(),
    installed: Boolean(appCore),

    hasRequestEngine: Boolean(requestEngine),
    hasApiEngine: Boolean(apiEngine),

    hasAccessToken: Boolean(getAccessToken()),

    stats: {
      ...stats,
      lastUrl: redact(stats.lastUrl),
      lastError: stats.lastError
        ? {
            ...stats.lastError,
            message: redact(stats.lastError.message || ""),
            url: redact(stats.lastError.url || ""),
          }
        : null,
    },

    endpoints: AUTH_ENDPOINTS,
    publicEndpoints: PUBLIC_API_PATHS,

    policy: {
      facadeOnly: true,
      singleHttpFacade: true,

      configIsSourceOfEndpoints: true,

      noOwnFetch: true,
      noOwnParser: true,
      noRetry: true,
      noAutoRefresh: true,
      noAuthDiscovery: true,

      authErrorClassificationOnly: true,
      sessionJsOwnsSilentRefresh: true,

      noRouter: true,
      noToast: true,
      noStorage: true,

      mePrivate: true,
      refreshPublicNoAuthHeader: true,
      blocksExternalEndpoints: true,

      accessTokenRuntimeOnlyAsFallback: true,
      blocksStaleRuntimeTokenWhenStateCleared: true,
      noRefreshTokenStorage: true,

      tokenExpiredDoesNotMeanLogout: true,
      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   FACADE
========================================================= */

export const Http = {
  version: HTTP_VERSION,

  get origin() {
    return getApiOrigin();
  },

  setOrigin: setApiOrigin,

  getApiOrigin,
  setApiOrigin,

  buildUrl: buildApiUrl,
  buildApiUrl,

  redactHttpText,

  request,

  get,
  head,
  options: optionsRequest,
  post,
  put,
  patch,

  delete: del,
  del,

  upload,
  download,
  raw,

  login,
  me,
  refresh,
  refreshSession,
  logout,

  activate,
  requestPasswordReset,
  confirmPasswordReset,

  setAccessToken,
  setAuthTokens,
  clearAuthTokens,

  getAccessToken,

  getHttpErrorCode,
  getHttpStatus,
  normalizeHttpError,
  isRefreshableAuthError,
  shouldClearSessionForAuthError,

  install: installHttp,

  getSnapshot: getHttpSnapshot,
  getDebugSnapshot: getHttpSnapshot,
  snapshot: getHttpSnapshot,
};

export const http = Http;

export default Http;
