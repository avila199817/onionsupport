/* =========================================================
   Onion Support - Core HTTP
   Archivo: /src/core/http.js

   Responsabilidad:
   - Fachada mínima sobre core/request.js.
   - API real única.
   - Endpoints auth reales.
   - /api/auth/me privado siempre.
   - Enviar Authorization cuando hay token válido.
   - Sin fetch propio.
   - Sin parser propio.
   - Sin retry propio.
   - Sin refresh automático.
   - Sin Auth discovery.
   - Sin Router.
   - Sin Toast.
   - Sin Storage.
   - Sin magia negra.
========================================================= */

import { config } from "./config.js";

import {
  createRequest,
  createApiClient,
} from "./request.js";

export const HTTP_VERSION = "core.http.v2";

export const DEFAULT_API_ORIGIN = "https://api.onionit.net";
export const DEFAULT_TIMEOUT_MS = 30000;

const AUTH_ENDPOINTS = Object.freeze({
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  refresh: "/api/auth/refresh",
  activate: "/api/auth/activate",
  requestPasswordReset: "/api/auth/reset-password-request",
  confirmPasswordReset: "/api/auth/reset-password-confirm",
});

const PUBLIC_ENDPOINTS = Object.freeze([
  AUTH_ENDPOINTS.login,
  AUTH_ENDPOINTS.refresh,
  AUTH_ENDPOINTS.activate,
  AUTH_ENDPOINTS.requestPasswordReset,
  AUTH_ENDPOINTS.confirmPasswordReset,
]);

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
  refreshToken: "",
};

const stats = {
  total: 0,
  success: 0,
  error: 0,
  lastUrl: "",
  lastMethod: "",
  lastError: null,
};

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function normalizeOrigin(value = "") {
  const raw = text(value, DEFAULT_API_ORIGIN).replace(/\/+$/g, "");

  try {
    const url = new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return DEFAULT_API_ORIGIN;
    }

    if (url.pathname === "/api") {
      return url.origin;
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

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function cleanToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

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

function endpointToPath(endpoint = "/") {
  const raw = text(endpoint, "/");

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

function cleanPath(endpoint = "/") {
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

function isPublicEndpoint(endpoint = "") {
  const clean = cleanPath(endpoint);

  if (clean === AUTH_ENDPOINTS.me) return false;

  return PUBLIC_ENDPOINTS.includes(clean);
}

function shouldUseAuth(endpoint = "", options = {}) {
  const clean = cleanPath(endpoint);

  if (clean === AUTH_ENDPOINTS.me) return true;

  if (
    options.auth === false ||
    options.public === true ||
    options.skipAuth === true ||
    options.noAuthHeader === true
  ) {
    return false;
  }

  if (options.auth === true) return true;

  return !isPublicEndpoint(clean);
}

/* =========================================================
   ORIGIN / URL
========================================================= */

export function getApiOrigin() {
  return apiOrigin;
}

export function setApiOrigin(value = "") {
  apiOrigin = normalizeOrigin(value || DEFAULT_API_ORIGIN);
  requestEngine = null;
  apiEngine = null;

  return apiOrigin;
}

export function buildApiUrl(endpoint = "/", options = {}) {
  const path = endpointToPath(endpoint);
  return appendQuery(`${apiOrigin}${path}`, options.query || options.params);
}

export function redactHttpText(value = "") {
  return redact(value);
}

/* =========================================================
   TOKEN
========================================================= */

export function getAccessToken() {
  const state = getState();

  return cleanToken(
    state.token ||
      state.accessToken ||
      state.access_token ||
      runtimeTokens.accessToken ||
      ""
  );
}

export function getRefreshToken() {
  const state = getState();

  return cleanToken(
    state.refreshToken ||
      state.refresh_token ||
      runtimeTokens.refreshToken ||
      ""
  );
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
  const token =
    payload.token ||
    payload.accessToken ||
    payload.access_token ||
    "";

  const refreshToken =
    payload.refreshToken ||
    payload.refresh_token ||
    "";

  const access = setAccessToken(token);
  const refresh = cleanToken(refreshToken);
  const state = getState();

  runtimeTokens.refreshToken = refresh;

  if (refresh) {
    state.refreshToken = refresh;
    state.refresh_token = refresh;
  } else {
    delete state.refreshToken;
    delete state.refresh_token;
  }

  return {
    token: access || "",
    accessToken: access || "",
    refreshToken: refresh || "",
  };
}

export function clearAuthTokens() {
  const state = getState();

  runtimeTokens.accessToken = "";
  runtimeTokens.refreshToken = "";

  delete state.token;
  delete state.accessToken;
  delete state.access_token;
  delete state.refreshToken;
  delete state.refresh_token;

  state.hasToken = false;

  return true;
}

/*
  Compat controlada.
  La fuente real del token debe venir por AppCore.state,
  por options.token o por setAuthTokens().
*/
export function setTokenProvider() {
  return true;
}

export function setAuthPayloadCommitter() {
  return true;
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

function normalizeRequestArgs(first = "/", second = {}, third = {}) {
  if (
    typeof first === "string" &&
    /^[A-Z]+$/i.test(first) &&
    typeof second === "string"
  ) {
    return {
      endpoint: second,
      options: {
        ...(isObject(third) ? third : {}),
        method: first.toUpperCase(),
      },
    };
  }

  if (isObject(first)) {
    return {
      endpoint: first.url || first.path || first.endpoint || "/",
      options: {
        ...first,
        ...(isObject(second) ? second : {}),
      },
    };
  }

  return {
    endpoint: first,
    options: isObject(second) ? second : {},
  };
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

function requestMethod(options = {}) {
  return text(options.method, "GET").toUpperCase();
}

export async function request(first = "/", second = {}, third = {}) {
  const parsed = normalizeRequestArgs(first, second, third);

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

    method,

    auth,
    public: !auth,
    skipAuth: !auth,
    noAuthHeader: !auth,

    token,
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
    stats.error += 1;
    stats.lastError = {
      name: error?.name || "Error",
      message: redact(error?.message || String(error)),
      status: error?.status || error?.statusCode || 0,
      url: redact(url),
      method,
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
  });
}

export function refresh(options = {}) {
  return refreshSession({}, options);
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
    try {
      appCore.http = Http;
      appCore.Http = Http;
    } catch {
      // noop
    }

    try {
      appCore.services = isObject(appCore.services) ? appCore.services : {};
      appCore.services.http = Http;
      appCore.services.Http = Http;
    } catch {
      // noop
    }

    try {
      appCore.modules?.register?.("Http", Http);
      appCore.modules?.register?.("http", Http);
    } catch {
      // noop
    }
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
    hasRefreshToken: Boolean(getRefreshToken()),

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
    publicEndpoints: PUBLIC_ENDPOINTS,

    policy: {
      facadeOnly: true,
      singleHttpFacade: true,

      noOwnFetch: true,
      noOwnParser: true,
      noRetry: true,
      noAutoRefresh: true,
      noAuthDiscovery: true,

      noRouter: true,
      noToast: true,
      noStorage: true,

      mePrivate: true,
      blocksExternalEndpoints: true,

      tokenRuntimeOnly: true,
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

  setTokenProvider,
  setAuthPayloadCommitter,

  setAccessToken,
  setAuthTokens,
  clearAuthTokens,

  getAccessToken,
  getRefreshToken,

  install: installHttp,

  getSnapshot: getHttpSnapshot,
  getDebugSnapshot: getHttpSnapshot,
  snapshot: getHttpSnapshot,
};

export const http = Http;

export default Http;
