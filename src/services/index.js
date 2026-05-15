/* =========================================================
   Onion SPA - HTTP Service
   Archivo: /src/services/index.js

   Responsabilidad:
   - Cliente HTTP central de la SPA.
   - Hablar con https://api.onionit.net.
   - Adjuntar token cuando toque.
   - Refresh automático una sola vez en 401 privado.
   - Sin lógica de vistas.
   - Sin router.
   - Sin métricas raras.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";

/* =========================================================
   CONFIG
========================================================= */

const HTTP_VERSION = "v1-simple-http";
const DEFAULT_API_BASE = "https://api.onionit.net";
const DEFAULT_TIMEOUT_MS = 30000;

let config = {
  apiBase: DEFAULT_API_BASE,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  useLoader: true,
  autoRefresh: true,
  autoLogout: true,
  debug: false,
};

let initialized = false;
let pendingRequests = 0;
let refreshPromise = null;
let requestSeq = 0;
let lastError = null;

/* =========================================================
   STORAGE KEYS
========================================================= */

const ACCESS_TOKEN_KEYS = [
  "onion:accessToken",
  "onion_accessToken",
  "onion.accessToken",
  "accessToken",
  "access_token",
  "token",
];

const REFRESH_TOKEN_KEYS = [
  "onion:refreshToken",
  "onion_refreshToken",
  "onion.refreshToken",
  "refreshToken",
  "refresh_token",
];

const SESSION_ID_KEYS = [
  "onion:sessionId",
  "onion_sessionId",
  "onion.sessionId",
  "sessionId",
  "session_id",
];

const USER_ID_KEYS = [
  "onion:userId",
  "onion_userId",
  "onion.userId",
  "userId",
  "user_id",
];

/* =========================================================
   PUBLIC / PRIVATE ENDPOINTS
========================================================= */

const PUBLIC_AUTH_MARKERS = [
  "/auth/login",
  "/auth/register",
  "/auth/signup",

  "/auth/refresh",
  "/auth/token/refresh",
  "/auth/renew",

  "/auth/logout",
  "/auth/logout-all",

  "/auth/2fa",
  "/auth/2fa/login",
  "/auth/mfa",
  "/auth/mfa/login",
  "/auth/otp",
  "/auth/otp/login",

  "/auth/activate",
  "/auth/activate-account",
  "/auth/account/activate",
  "/auth/activation",
  "/auth/activate/first-user",

  "/auth/reset-password",
  "/auth/reset-password-request",
  "/auth/reset-password-confirm",
  "/auth/reset-password/confirm",

  "/auth/password-reset",
  "/auth/password-reset/request",
  "/auth/password-reset/confirm",

  "/auth/forgot-password",
  "/auth/recover-password",

  "/auth/_health",
  "/auth/_meta",
  "/auth/_routes",
];

const AUTH_ME_PATHS = [
  "/me",
  "/api/me",
  "/auth/me",
  "/api/auth/me",
];

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function nextRequestId() {
  requestSeq += 1;
  return `http_${Date.now()}_${requestSeq}`;
}

function normalizeMethod(method = "GET") {
  const clean = safeText(method, "GET").toUpperCase();

  if (
    clean === "GET" ||
    clean === "HEAD" ||
    clean === "POST" ||
    clean === "PUT" ||
    clean === "PATCH" ||
    clean === "DELETE" ||
    clean === "OPTIONS"
  ) {
    return clean;
  }

  return "GET";
}

function isBodylessMethod(method) {
  const clean = normalizeMethod(method);
  return clean === "GET" || clean === "HEAD" || clean === "OPTIONS";
}

function normalizeApiBase(value = "") {
  const raw = safeText(value, DEFAULT_API_BASE).replace(/\/+$/, "");

  if (!raw) return DEFAULT_API_BASE;

  return raw;
}

function getApiBase() {
  return normalizeApiBase(
    AppCore?.config?.apiBase ||
      AppCore?.config?.apiUrl ||
      AppCore?.config?.apiOrigin ||
      config.apiBase ||
      DEFAULT_API_BASE
  );
}

function normalizeEndpointPath(path = "") {
  let clean = safeText(path, "/");

  if (!clean) clean = "/";

  try {
    const parsed = new URL(clean, "https://local.invalid");
    clean = parsed.pathname || "/";
  } catch {
    clean = clean.split("?")[0].split("#")[0] || "/";
  }

  clean = clean.replace(/\/{2,}/g, "/");

  if (clean.length > 1 && clean.endsWith("/")) {
    clean = clean.replace(/\/+$/, "");
  }

  return clean.toLowerCase();
}

function stripApiPrefix(path = "") {
  const clean = normalizeEndpointPath(path);

  if (clean === "/api") return "/";
  if (clean.startsWith("/api/")) return clean.slice(4) || "/";

  return clean;
}

function isAuthMeEndpoint(path = "") {
  const clean = normalizeEndpointPath(path);
  const noApi = stripApiPrefix(clean);

  return AUTH_ME_PATHS.includes(clean) || AUTH_ME_PATHS.includes(noApi);
}

function isPublicEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;

  const clean = normalizeEndpointPath(path);
  const noApi = stripApiPrefix(clean);

  return PUBLIC_AUTH_MARKERS.some((marker) => {
    return (
      clean === marker ||
      clean.startsWith(`${marker}/`) ||
      noApi === marker ||
      noApi.startsWith(`${marker}/`)
    );
  });
}

function isPrivateRequest(options = {}) {
  const opts = safeObject(options);

  if (opts.auth === false || opts.public === true || opts.skipAuth === true) {
    return false;
  }

  if (isAuthMeEndpoint(opts.path || opts.url)) {
    return true;
  }

  if (isPublicEndpoint(opts.path || opts.url)) {
    return false;
  }

  return true;
}

function buildUrl(path = "") {
  const raw = safeText(path, "/");

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  let clean = raw.startsWith("/") ? raw : `/${raw}`;

  if (clean === "/me" || clean === "/auth/me" || clean === "/api/me") {
    clean = "/api/auth/me";
  } else if (clean.startsWith("/auth/")) {
    clean = `/api${clean}`;
  } else if (
    clean.startsWith("/users") ||
    clean.startsWith("/clientes") ||
    clean.startsWith("/tickets") ||
    clean.startsWith("/incidencias") ||
    clean.startsWith("/facturas") ||
    clean.startsWith("/search")
  ) {
    clean = `/api${clean}`;
  }

  return `${getApiBase()}${clean}`;
}

function redact(value = "") {
  let text = safeText(value, "");

  if (!text) return "";

  const keys = [
    "token",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "password",
    "otp",
    "mfa",
    "2fa",
  ];

  for (const key of keys) {
    try {
      text = text.replace(
        new RegExp(`([?&#]${key}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    text = text.replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
  } catch {}

  return text;
}

/* =========================================================
   STORAGE / AUTH HELPERS
========================================================= */

function readStorage(keys = []) {
  if (!isBrowser()) return "";

  for (const storageName of ["localStorage", "sessionStorage"]) {
    let storage = null;

    try {
      storage = window[storageName];
    } catch {
      storage = null;
    }

    if (!storage) continue;

    for (const key of keys) {
      try {
        const value = safeText(storage.getItem(key), "");

        if (value) return value;
      } catch {}
    }
  }

  return "";
}

function writeStorage(keys = [], value = "") {
  if (!isBrowser()) return false;

  const text = safeText(value, "");

  if (!text) return false;

  try {
    const storage = window.localStorage;
    storage.setItem(keys[0], text);
    return true;
  } catch {}

  try {
    const storage = window.sessionStorage;
    storage.setItem(keys[0], text);
    return true;
  } catch {}

  return false;
}

function removeStorage(keys = []) {
  if (!isBrowser()) return;

  for (const storageName of ["localStorage", "sessionStorage"]) {
    try {
      const storage = window[storageName];

      for (const key of keys) {
        storage.removeItem(key);
      }
    } catch {}
  }
}

function getAccessToken() {
  try {
    const value =
      Auth?.getAccessToken?.() ||
      Auth?.getToken?.() ||
      Auth?.session?.getAccessToken?.();

    if (value) return value;
  } catch {}

  return readStorage(ACCESS_TOKEN_KEYS);
}

function getRefreshToken() {
  try {
    const value =
      Auth?.getRefreshToken?.() ||
      Auth?.session?.getRefreshToken?.();

    if (value) return value;
  } catch {}

  return readStorage(REFRESH_TOKEN_KEYS);
}

function getSessionId() {
  try {
    const value =
      Auth?.getSessionId?.() ||
      Auth?.session?.getSessionId?.();

    if (value) return value;
  } catch {}

  return readStorage(SESSION_ID_KEYS);
}

function getUserId() {
  try {
    const value =
      Auth?.getUserId?.() ||
      Auth?.session?.getUserId?.();

    if (value) return value;
  } catch {}

  return readStorage(USER_ID_KEYS);
}

function saveAuthPayload(payload = {}) {
  const data = safeObject(payload);

  const accessToken =
    data.accessToken ||
    data.access_token ||
    data.token ||
    data.auth?.accessToken ||
    data.auth?.access_token ||
    "";

  const refreshToken =
    data.refreshToken ||
    data.refresh_token ||
    data.auth?.refreshToken ||
    data.auth?.refresh_token ||
    "";

  const session = data.session || data.sessionData || data.auth?.session || {};
  const user = data.user || data.usuario || data.me || data.account || data.auth?.user || {};

  const sessionId = session.sessionId || session.id || data.sessionId || "";
  const userId = user.userId || user.id || session.userId || data.userId || "";

  try {
    Auth?.setSession?.(data);
  } catch {}

  try {
    Auth?.saveSession?.(data);
  } catch {}

  if (accessToken) writeStorage(ACCESS_TOKEN_KEYS, accessToken);
  if (refreshToken) writeStorage(REFRESH_TOKEN_KEYS, refreshToken);
  if (sessionId) writeStorage(SESSION_ID_KEYS, sessionId);
  if (userId) writeStorage(USER_ID_KEYS, userId);

  return true;
}

function clearAuthPayload() {
  try {
    Auth?.clearSession?.();
  } catch {}

  try {
    Auth?.clear?.();
  } catch {}

  removeStorage(ACCESS_TOKEN_KEYS);
  removeStorage(REFRESH_TOKEN_KEYS);
  removeStorage(SESSION_ID_KEYS);
  removeStorage(USER_ID_KEYS);
}

/* =========================================================
   LOADER
========================================================= */

function startLoader(options = {}) {
  const opts = safeObject(options);

  if (opts.loader === false || opts.useLoader === false) return false;

  pendingRequests += 1;

  try {
    AppCore?.setLoading?.(true);
  } catch {}

  try {
    if (AppCore?.state) {
      AppCore.state.pendingRequests = pendingRequests;
    }
  } catch {}

  return true;
}

function stopLoader(started = false) {
  if (!started) return;

  pendingRequests = Math.max(0, pendingRequests - 1);

  try {
    if (AppCore?.state) {
      AppCore.state.pendingRequests = pendingRequests;
    }
  } catch {}

  if (pendingRequests === 0) {
    try {
      AppCore?.setLoading?.(false);
    } catch {}
  }
}

/* =========================================================
   FETCH CORE
========================================================= */

function buildHeaders(options = {}) {
  const opts = safeObject(options);
  const headers = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "X-Onion-Client": "onion-spa",
    "X-Client-Version": HTTP_VERSION,
    "X-Request-Id": opts.requestId || nextRequestId(),
    ...(opts.headers || {}),
  };

  const isFormData =
    typeof FormData !== "undefined" && opts.body instanceof FormData;

  if (!isFormData && opts.body !== undefined && opts.body !== null) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (isPrivateRequest(opts)) {
    const token = getAccessToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else {
    delete headers.Authorization;
    delete headers.authorization;
  }

  return headers;
}

function buildFetchBody(method, options = {}) {
  const opts = safeObject(options);

  if (isBodylessMethod(method)) return undefined;

  if (opts.body === undefined || opts.body === null) {
    return undefined;
  }

  if (typeof FormData !== "undefined" && opts.body instanceof FormData) {
    return opts.body;
  }

  if (typeof Blob !== "undefined" && opts.body instanceof Blob) {
    return opts.body;
  }

  if (typeof ArrayBuffer !== "undefined" && opts.body instanceof ArrayBuffer) {
    return opts.body;
  }

  if (typeof opts.body === "string") {
    return opts.body;
  }

  return JSON.stringify(opts.body);
}

function createTimeoutSignal(timeoutMs, externalSignal) {
  const timeout = Number(timeoutMs || config.timeoutMs || DEFAULT_TIMEOUT_MS);

  const controller = new AbortController();

  let timeoutId = null;

  const abort = () => {
    try {
      controller.abort();
    } catch {}
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abort();
    } else {
      try {
        externalSignal.addEventListener("abort", abort, { once: true });
      } catch {}
    }
  }

  if (timeout > 0) {
    timeoutId = setTimeout(abort, timeout);
  }

  return {
    signal: controller.signal,
    clear() {
      if (timeoutId) clearTimeout(timeoutId);

      if (externalSignal) {
        try {
          externalSignal.removeEventListener("abort", abort);
        } catch {}
      }
    },
  };
}

async function parseResponse(response, options = {}) {
  const opts = safeObject(options);

  if (opts.raw === true) {
    return response;
  }

  if (opts.responseType === "blob") {
    return response.blob();
  }

  if (opts.responseType === "arrayBuffer") {
    return response.arrayBuffer();
  }

  if (opts.responseType === "text") {
    return response.text();
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    return response.json();
  }

  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeError(error, context = {}) {
  const ctx = safeObject(context);

  if (error?.__onionNormalized) {
    return error;
  }

  const normalized = new Error(
    safeText(
      error?.message ||
        error?.data?.message ||
        error?.data?.error ||
        error?.statusText ||
        "Error HTTP",
      "Error HTTP"
    )
  );

  normalized.__onionNormalized = true;
  normalized.name = safeText(error?.name, "HttpError");
  normalized.status = Number(error?.status || error?.statusCode || ctx.status || 0);
  normalized.code = safeText(error?.code || error?.data?.code || error?.data?.error, "");
  normalized.data = error?.data ?? null;
  normalized.method = ctx.method || error?.method || "";
  normalized.url = ctx.url || error?.url || "";
  normalized.path = ctx.path || error?.path || "";
  normalized.requestId = ctx.requestId || error?.requestId || "";
  normalized.aborted = error?.name === "AbortError" || error?.aborted === true;
  normalized.timeout = normalized.aborted && normalized.status === 0;

  return normalized;
}

async function baseRequest(method, path, options = {}) {
  const opts = safeObject(options);
  const finalMethod = normalizeMethod(method);
  const requestId = opts.requestId || nextRequestId();
  const url = buildUrl(path);

  const prepared = {
    ...opts,
    method: finalMethod,
    path,
    url,
    requestId,
  };

  const timeoutSignal = createTimeoutSignal(
    opts.timeoutMs || opts.timeout || config.timeoutMs,
    opts.signal
  );

  try {
    const response = await fetch(url, {
      method: finalMethod,
      headers: buildHeaders(prepared),
      body: buildFetchBody(finalMethod, prepared),
      credentials: opts.credentials || "omit",
      cache: opts.cache || "no-store",
      signal: timeoutSignal.signal,
    });

    const data = await parseResponse(response, prepared);

    if (!response.ok) {
      const err = new Error(
        safeText(data?.message || data?.error || response.statusText, "Error HTTP")
      );

      err.status = response.status;
      err.statusCode = response.status;
      err.code = data?.code || data?.error || "";
      err.data = data;
      err.method = finalMethod;
      err.path = path;
      err.url = url;
      err.requestId = requestId;

      throw err;
    }

    return data;
  } catch (err) {
    throw normalizeError(err, {
      method: finalMethod,
      path,
      url,
      requestId,
    });
  } finally {
    timeoutSignal.clear();
  }
}

/* =========================================================
   REFRESH / LOGOUT
========================================================= */

async function refreshSession() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    const sessionId = getSessionId();
    const userId = getUserId();

    if (!refreshToken || !sessionId || !userId) {
      return false;
    }

    try {
      const payload = await baseRequest("POST", "/api/auth/refresh", {
        public: true,
        auth: false,
        skipAuth: true,
        noAutoRefresh: true,
        noAutoLogout: true,
        loader: false,
        body: {
          refreshToken,
          sessionId,
          userId,
        },
      });

      saveAuthPayload(payload);

      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function logoutLocal(reason = "http-401") {
  clearAuthPayload();

  try {
    await Auth?.logout?.({
      silent: false,
      notifyServer: false,
      reason,
    });
  } catch {}

  return true;
}

/* =========================================================
   PUBLIC REQUEST API
========================================================= */

function normalizeRequestArgs(arg1, arg2, arg3) {
  if (isObject(arg1)) {
    return {
      method: normalizeMethod(arg1.method || "GET"),
      path: arg1.path || arg1.url || "/",
      options: arg1,
    };
  }

  if (typeof arg1 === "string" && typeof arg2 === "string") {
    const maybeMethod = normalizeMethod(arg1);

    if (maybeMethod === arg1.toUpperCase()) {
      return {
        method: maybeMethod,
        path: arg2,
        options: safeObject(arg3),
      };
    }
  }

  return {
    method: normalizeMethod(safeObject(arg2).method || "GET"),
    path: arg1,
    options: safeObject(arg2),
  };
}

async function request(...args) {
  init();

  const { method, path, options } = normalizeRequestArgs(...args);
  const opts = safeObject(options);

  const loaderStarted = startLoader(opts);

  try {
    try {
      return await baseRequest(method, path, opts);
    } catch (err) {
      const normalized = normalizeError(err, {
        method,
        path,
      });

      const canRefresh =
        config.autoRefresh !== false &&
        opts.noAutoRefresh !== true &&
        opts.autoRefresh !== false &&
        normalized.status === 401 &&
        isPrivateRequest({
          ...opts,
          method,
          path,
        });

      if (!canRefresh || opts._retriedAfterRefresh === true) {
        throw normalized;
      }

      const refreshed = await refreshSession();

      if (!refreshed) {
        throw normalized;
      }

      return await baseRequest(method, path, {
        ...opts,
        _retriedAfterRefresh: true,
        noAutoRefresh: true,
      });
    }
  } catch (err) {
    const normalized = normalizeError(err, {
      method,
      path,
    });

    lastError = {
      message: normalized.message,
      status: normalized.status,
      code: normalized.code,
      path: redact(path),
      at: new Date().toISOString(),
    };

    if (
      config.autoLogout !== false &&
      normalized.status === 401 &&
      isPrivateRequest({
        ...opts,
        method,
        path,
      })
    ) {
      await logoutLocal("http-401");
    }

    throw normalized;
  } finally {
    stopLoader(loaderStarted);
  }
}

function get(path, options = {}) {
  return request("GET", path, options);
}

function head(path, options = {}) {
  return request("HEAD", path, options);
}

function post(path, body = null, options = {}) {
  return request("POST", path, {
    ...safeObject(options),
    body,
  });
}

function put(path, body = null, options = {}) {
  return request("PUT", path, {
    ...safeObject(options),
    body,
  });
}

function patch(path, body = null, options = {}) {
  return request("PATCH", path, {
    ...safeObject(options),
    body,
  });
}

function del(path, bodyOrOptions = {}, maybeOptions) {
  if (maybeOptions !== undefined) {
    return request("DELETE", path, {
      ...safeObject(maybeOptions),
      body: bodyOrOptions,
    });
  }

  return request("DELETE", path, safeObject(bodyOrOptions));
}

function upload(path, formData, options = {}) {
  return request(options.method || "POST", path, {
    ...safeObject(options),
    body: formData,
    timeoutMs: options.timeoutMs || options.timeout || 120000,
  });
}

function download(path, options = {}) {
  return request("GET", path, {
    ...safeObject(options),
    responseType: options.responseType || "blob",
    timeoutMs: options.timeoutMs || options.timeout || 120000,
  });
}

/* =========================================================
   INIT / BRIDGE
========================================================= */

function attachToAppCore() {
  try {
    AppCore.Http = Http;
    AppCore.http = Http;

    AppCore.services = AppCore.services || {};
    AppCore.services.Http = Http;
    AppCore.services.http = Http;
    AppCore.services.api = Http;
    AppCore.services.apiClient = Http;
  } catch {}

  return true;
}

function init(patch = {}) {
  if (initialized) {
    attachToAppCore();
    return Http;
  }

  configure(patch);
  attachToAppCore();

  initialized = true;

  return Http;
}

function configure(patch = {}) {
  const next = safeObject(patch);

  config = {
    ...config,
    ...next,
  };

  config.apiBase = normalizeApiBase(config.apiBase || DEFAULT_API_BASE);
  config.timeoutMs = Number(config.timeoutMs || config.timeout || DEFAULT_TIMEOUT_MS);

  return getConfig();
}

function getConfig() {
  return {
    apiBase: getApiBase(),
    timeoutMs: config.timeoutMs,
    useLoader: config.useLoader,
    autoRefresh: config.autoRefresh,
    autoLogout: config.autoLogout,
    debug: config.debug,
  };
}

function getState() {
  return {
    version: HTTP_VERSION,
    initialized,
    pendingRequests,
    hasRefreshPromise: Boolean(refreshPromise),
    lastError,
    apiBase: getApiBase(),
    authenticated: Boolean(getAccessToken()),
  };
}

function createAbortController() {
  return new AbortController();
}

function abort(controller, reason = "abort") {
  try {
    controller?.abort?.(reason);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

const Http = {
  version: HTTP_VERSION,

  init,
  configure,
  getConfig,
  getState,
  getSnapshot: getState,
  getDebugSnapshot: getState,

  attachToAppCore,

  request,
  get,
  head,
  post,
  put,
  patch,
  delete: del,
  del,

  upload,
  download,

  refreshSession,
  logoutLocal,

  createAbortController,
  abort,

  isPublicEndpoint,
  isPrivateRequest,
  isAuthMeEndpoint,

  buildUrl,
  redact,
};

export { Http };

export default Http;
