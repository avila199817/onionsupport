/* =========================================================
   Onion Support - Core HTTP
   Archivo: /src/core/http.js

   Responsabilidad:
   - Fachada mínima sobre core/request.js.
   - API real única.
   - Endpoints auth reales.
   - /api/auth/me privado siempre.
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

export const HTTP_VERSION = "simple";

export const DEFAULT_API_ORIGIN = "https://api.onionit.net";
export const DEFAULT_API_PREFIX = "/api";
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_AUTH_TIMEOUT_MS = 30000;
export const DEFAULT_REFRESH_TIMEOUT_MS = 30000;

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

const stats = {
  total: 0,
  success: 0,
  error: 0,
  lastUrl: "",
  lastError: null,
};

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
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

    if (raw.endsWith("/api")) {
      return raw.slice(0, -4);
    }

    return url.origin;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

function cleanPath(value = "/") {
  try {
    return new URL(value, DEFAULT_API_ORIGIN).pathname || "/";
  } catch {
    return String(value || "/").split("?")[0].split("#")[0] || "/";
  }
}

function appendQuery(url = "", query = null) {
  if (!isObject(query)) return url;

  const parsed = new URL(url, DEFAULT_API_ORIGIN);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    parsed.searchParams.set(key, String(value));
  }

  return parsed.toString();
}

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function validToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

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

function getState() {
  return isObject(appCore?.state) ? appCore.state : {};
}

function isPublicEndpoint(path = "") {
  const clean = cleanPath(path);

  if (clean === AUTH_ENDPOINTS.me) return false;

  return PUBLIC_ENDPOINTS.includes(clean);
}

function shouldUseAuth(endpoint = "", options = {}) {
  const clean = cleanPath(endpoint);

  if (clean === AUTH_ENDPOINTS.me) return true;

  if (
    options.auth === false ||
    options.public === true ||
    options.skipAuth === true
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
  const raw = text(endpoint, "/");

  if (/^https?:\/\//i.test(raw)) {
    return appendQuery(raw, options.query || options.params);
  }

  const path = raw.startsWith("/") ? raw : `/${raw}`;

  return appendQuery(`${apiOrigin}${path}`, options.query || options.params);
}

export function redactHttpText(value = "") {
  return redact(value);
}

/* =========================================================
   TOKEN COMPAT
========================================================= */

export function setTokenProvider() {
  return true;
}

export function getAccessToken() {
  const state = getState();
  const token = state.token || state.accessToken || state.access_token || "";

  return validToken(token) ? String(token).replace(/^Bearer\s+/i, "") : "";
}

export function getRefreshToken() {
  const state = getState();
  const token = state.refreshToken || state.refresh_token || "";

  return validToken(token) ? String(token).replace(/^Bearer\s+/i, "") : "";
}

export function setAuthTokens(payload = {}) {
  const state = getState();

  const token =
    payload.token ||
    payload.accessToken ||
    payload.access_token ||
    "";

  const refreshToken =
    payload.refreshToken ||
    payload.refresh_token ||
    "";

  if (validToken(token)) {
    state.token = String(token).replace(/^Bearer\s+/i, "");
    state.accessToken = state.token;
    state.access_token = state.token;
    state.hasToken = true;
  }

  if (validToken(refreshToken)) {
    state.refreshToken = String(refreshToken).replace(/^Bearer\s+/i, "");
    state.refresh_token = state.refreshToken;
  }

  return {
    token: state.token || "",
    refreshToken: state.refreshToken || "",
  };
}

export function clearAuthTokens() {
  const state = getState();

  delete state.token;
  delete state.accessToken;
  delete state.access_token;
  delete state.refreshToken;
  delete state.refresh_token;

  state.hasToken = false;

  return true;
}

export function setAuthPayloadCommitter() {
  return true;
}

/* =========================================================
   ERROR COMPAT
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

export async function request(first = "/", second = {}, third = {}) {
  const parsed = normalizeRequestArgs(first, second, third);
  const endpoint = text(parsed.endpoint, "/");
  const options = parsed.options || {};

  const url = buildApiUrl(endpoint, options);
  const auth = shouldUseAuth(url, options);

  const finalOptions = {
    ...options,
    query: undefined,
    params: undefined,
    auth,
    public: !auth,
    skipAuth: !auth,
    token: auth ? options.token || getAccessToken() : "",
  };

  stats.total += 1;
  stats.lastUrl = redact(url);

  try {
    const result = await ensureEngines().apiEngine.request(url, finalOptions);

    stats.success += 1;

    return result;
  } catch (error) {
    stats.error += 1;
    stats.lastError = {
      name: error?.name || "Error",
      message: error?.message || String(error),
      status: error?.status || error?.statusCode || 0,
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
  });
}

export function me(options = {}) {
  return get(AUTH_ENDPOINTS.me, {
    ...options,
    auth: true,
    public: false,
    skipAuth: false,
    cache: "no-store",
  });
}

export function refreshSession(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.refresh, body, {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
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
  });
}

export function requestPasswordReset(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.requestPasswordReset, body, {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
  });
}

export function confirmPasswordReset(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.confirmPasswordReset, body, {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
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
      appCore.api = Http;
      appCore.apiClient = Http;
    } catch {
      // noop
    }

    try {
      appCore.services = isObject(appCore.services) ? appCore.services : {};
      appCore.services.http = Http;
      appCore.services.Http = Http;
      appCore.services.api = Http;
      appCore.services.apiClient = Http;
    } catch {
      // noop
    }

    try {
      appCore.modules?.register?.("Http", Http);
      appCore.modules?.register?.("http", Http);
      appCore.modules?.register?.("api", Http);
      appCore.modules?.register?.("apiClient", Http);
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
    },

    endpoints: AUTH_ENDPOINTS,

    policy: {
      facadeOnly: true,
      noOwnFetch: true,
      noOwnParser: true,
      noRetry: true,
      noAutoRefresh: true,
      noAuthDiscovery: true,
      noRouter: true,
      noToast: true,
      noStorage: true,
      mePrivate: true,
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
export const apiClient = Http;
export const client = Http;

export default Http;
