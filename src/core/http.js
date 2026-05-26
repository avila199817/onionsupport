/* =========================================================
   Onion Support - Core HTTP
   Archivo: /src/core/http.js

   Responsabilidad:
   - Fachada mínima sobre core/request.js.
   - API real única.
   - Endpoints auth reales desde core/config.js.
   - /api/auth/me privado siempre.
   - /api/auth/refresh público y sin Authorization.
   - Enviar Authorization cuando hay access token válido.
   - No reutilizar token runtime si AppCore ya marcó sesión sin token.
   - Exponer helpers mínimos para detectar refresh silencioso.
   - Clasificar errores auth sin decidir logout por su cuenta.
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
   - La capa de sesión/auth decide si llama /api/auth/refresh.
========================================================= */

import {
  config,
  AUTH_ENDPOINTS,
  PUBLIC_API_PATHS,
  PRIVATE_API_PATHS,
  getApiBase,
  isCanonicalBackendApiBase,
  isPublicApiPath,
} from "./config.js";

import {
  createRequest,
  createApiClient,
} from "./request.js";

export const HTTP_VERSION = "core.http.v7";

export const DEFAULT_API_ORIGIN = getApiBase();
export const DEFAULT_TIMEOUT_MS = config?.api?.timeout || 30000;

let apiOrigin = normalizeOrigin(
  config?.apiBase ||
    config?.apiOrigin ||
    config?.api?.baseUrl ||
    config?.api?.base ||
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

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "secret",
  "session",
  "code",
  "password",
  "pwd",
  "key",
  "sig",
  "signature",
  "jwt",
  "authorization",
  "reset_token",
  "activation_token",
]);

const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
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
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function keyIsSensitive(value = "") {
  return SENSITIVE_QUERY_KEYS.has(cleanText(value, "").toLowerCase());
}

function headersFrom(input = null) {
  const headers = {};

  if (!input) return headers;

  if (typeof Headers !== "undefined" && input instanceof Headers) {
    input.forEach((value, key) => {
      headers[key] = value;
    });

    return headers;
  }

  if (isObject(input)) {
    return {
      ...input,
    };
  }

  return headers;
}

function hasHeader(headers = {}, name = "") {
  const target = cleanText(name, "").toLowerCase();

  if (!target) return false;

  return Object.keys(headers || {}).some((key) => key.toLowerCase() === target);
}

function resetEngines() {
  requestEngine = null;
  apiEngine = null;
  return true;
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
  resetEngines();
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

function accessTokenFromPayload(payload = {}) {
  for (const source of nestedPayloads(payload)) {
    const token = cleanToken(
      first(
        source.token,
        source.accessToken,
        source.access_token,
        ""
      )
    );

    if (token) return token;
  }

  return "";
}

export function getAccessToken() {
  const state = getState();

  /*
    Si AppCore ya declaró que no hay token, no recuperamos un token runtime
    ni un token stale que haya quedado por compat.
  */
  if (stateExplicitlyHasNoToken(state)) {
    return "";
  }

  const token = stateAccessToken(state);

  if (token) return token;

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
    state.authenticated = false;

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
  state.authenticated = false;

  return true;
}

/* =========================================================
   ENDPOINTS
========================================================= */

function endpointToPath(endpoint = "/") {
  const raw = cleanText(endpoint, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);

      if (url.origin !== apiUrlOrigin()) {
        return "";
      }

      return `${url.pathname || "/"}${url.search || ""}`;
    }
  } catch {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return "";
  }

  const path = raw.startsWith("/") ? raw : `/${raw}`;

  return path.split("#")[0] || "/";
}

function endpointCleanPath(endpoint = "/") {
  const clean = endpointToPath(endpoint);

  if (!clean) return "";

  return clean.split("?")[0] || "/";
}

function appendQuery(url = "", query = null) {
  if (!url || !isObject(query)) return url;

  const parsed = new URL(url, apiOrigin);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;

    parsed.searchParams.set(key, String(value));
  }

  return parsed.toString();
}

export function buildApiUrl(endpoint = "/", options = {}) {
  const path = endpointToPath(endpoint);

  if (!path) return "";

  return appendQuery(`${apiOrigin}${path}`, options.query || options.params);
}

export function redactHttpText(value = "") {
  return redact(value);
}

function endpointIsMe(endpoint = "") {
  return endpointCleanPath(endpoint) === AUTH_ENDPOINTS.me;
}

function endpointIsPublic(endpoint = "") {
  const clean = endpointCleanPath(endpoint);

  if (!clean) return false;
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

function sanitizeErrorData(value = null, depth = 0) {
  if (depth > 5) return null;

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeErrorData(item, depth + 1));
  }

  if (!isObject(value)) return value;

  const output = {};

  for (const [key, child] of Object.entries(value)) {
    if (keyIsSensitive(key)) {
      output[key] = "***";
      continue;
    }

    output[key] = sanitizeErrorData(child, depth + 1);
  }

  return output;
}

export class HttpError extends Error {
  constructor(message = "HTTP_ERROR", options = {}) {
    super(redact(message));

    this.name = "HttpError";
    this.status = Number(options.status || options.statusCode || 0) || 0;
    this.statusCode = this.status;
    this.code = cleanText(options.code, "HTTP_ERROR");
    this.method = cleanText(options.method, "");
    this.url = redact(options.url || "");
    this.data = sanitizeErrorData(options.data || null);
  }
}

function getErrorPayload(error = null) {
  if (!error) return {};

  if (isObject(error.data)) return error.data;
  if (isObject(error.body)) return error.body;
  if (isObject(error.payload)) return error.payload;
  if (isObject(error.responseData)) return error.responseData;
  if (isObject(error.response) && !isFunction(error.response.blob)) return error.response;

  return {};
}

export function getHttpErrorCode(error = null) {
  const payload = getErrorPayload(error);
  const auth = isObject(payload.auth) ? payload.auth : {};

  return cleanText(
    first(
      auth.code,
      auth.error,

      payload.code,
      payload.errorCode,
      payload.error_code,

      error?.code,
      error?.error,

      payload.error,
      ""
    ),
    ""
  );
}

export function getHttpStatus(error = null) {
  const payload = getErrorPayload(error);

  return Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      payload.status ||
      payload.statusCode ||
      0
  ) || 0;
}

export function isRefreshableAuthError(error = null) {
  if (error?.canRefresh === true || error?.refreshRequired === true) {
    return true;
  }

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
  if (error?.shouldLogout === true || error?.clearClientSession === true) {
    return true;
  }

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
  const canRefresh = isRefreshableAuthError(error);
  const shouldLogout = shouldClearSessionForAuthError(error);

  return {
    name: error?.name || "Error",
    message: redact(
      cleanText(
        first(
          error?.message,
          payload.message,
          payload.error_description,
          payload.detail,
          payload.reason,
          code,
          "HTTP_ERROR"
        ),
        "HTTP_ERROR"
      )
    ),
    status,
    statusCode: status,
    code: code || "HTTP_ERROR",

    canRefresh,
    refreshRequired: canRefresh,
    shouldLogout,
    clearClientSession: shouldLogout,
  };
}

function recordHttpError(error = null, url = "", method = "") {
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
    method: cleanText(method, ""),
    canRefresh: normalized.canRefresh,
    shouldLogout: normalized.shouldLogout,
  };

  return normalized;
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
    state: () => getState(),
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
  const method = cleanText(options.method, "GET").toUpperCase();

  return ALLOWED_METHODS.has(method) ? method : "GET";
}

function buildAuthHeaders(options = {}, token = "") {
  const headers = headersFrom(options.headers);
  const value = cleanToken(token);

  if (!value) return headers;

  if (!hasHeader(headers, "authorization")) {
    headers.Authorization = `Bearer ${value}`;
  }

  return headers;
}

/* =========================================================
   REQUEST
========================================================= */

export async function request(firstArg = "/", second = {}, third = {}) {
  const parsed = normalizeRequestArgs(firstArg, second, third);
  const options = isObject(parsed.options) ? parsed.options : {};
  const method = requestMethod(options);
  const endpoint = endpointToPath(parsed.endpoint);

  stats.total += 1;
  stats.lastMethod = method;

  if (!endpoint) {
    const error = new HttpError("Endpoint no permitido.", {
      code: "ENDPOINT_NOT_ALLOWED",
      method,
      url: parsed.endpoint || "",
    });

    stats.lastUrl = redact(parsed.endpoint || "");
    recordHttpError(error, parsed.endpoint || "", method);

    throw error;
  }

  const url = buildApiUrl(endpoint, options);

  if (!url) {
    const error = new HttpError("URL de API no permitida.", {
      code: "API_URL_NOT_ALLOWED",
      method,
      url: parsed.endpoint || endpoint,
    });

    stats.lastUrl = redact(parsed.endpoint || endpoint);
    recordHttpError(error, parsed.endpoint || endpoint, method);

    throw error;
  }

  const auth = shouldUseAuth(endpoint, options);
  const token = auth ? cleanToken(options.token || getAccessToken()) : "";

  const headers = auth
    ? buildAuthHeaders(options, token)
    : options.headers;

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

  stats.lastUrl = redact(url);

  try {
    const result = await ensureEngines().apiEngine.request(url, finalOptions);

    stats.success += 1;

    return result;
  } catch (error) {
    recordHttpError(error, url, method);
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

export function activateAccount(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.activateAccount || AUTH_ENDPOINTS.activate, body, {
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
  } else {
    resetEngines();
  }

  if (isObject(appCore)) {
    if (isObject(appCore.services)) {
      appCore.services.http = Http;
    }

    appCore.modules?.register?.("http", Http, {
      overwrite: true,
    });
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
    privateEndpoints: PRIVATE_API_PATHS,

    authPolicy: {
      mePrivate: !isPublicApiPath(AUTH_ENDPOINTS.me),
      refreshPublic: isPublicApiPath(AUTH_ENDPOINTS.refresh),
      refreshUsesAuthHeader: shouldUseAuth(AUTH_ENDPOINTS.refresh, {}),
      meUsesAuthHeader: shouldUseAuth(AUTH_ENDPOINTS.me, {}),
    },

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
      sessionOwnsSilentRefresh: true,

      noRouter: true,
      noToast: true,
      noStorage: true,

      mePrivate: true,
      refreshPublicNoAuthHeader: true,
      blocksExternalEndpoints: true,
      blocksInvalidEndpoints: true,

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
  optionsRequest,
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
  activateAccount,
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
