/* =========================================================
   Onion Support - Core Request
   Archivo: /src/core/request.js

   Responsabilidad:
   - Fetch mínimo.
   - API base desde config.
   - Auth header sólo si toca.
   - /api/auth/me siempre privado.
   - Bloquear endpoints externos.
   - Sin hooks.
   - Sin retry real.
   - Sin dedupe real.
   - Sin UI.
   - Sin Router.
   - Sin Storage.
   - Sin Toast.
   - Sin magia negra.
========================================================= */

import { config } from "./config.js";

export const REQUEST_VERSION = "core.request.v2";

export const REQUEST_EVENTS = Object.freeze({
  start: "app:request:start",
  success: "app:request:success",
  error: "app:request:error",
  retry: "app:request:retry",
  deduped: "app:request:deduped",
  abort: "app:request:abort",
  clearInFlight: "app:request:clear-in-flight",
});

const DEFAULT_API_BASE = "https://api.onionit.net";

const API_BASE = normalizeApiBase(
  config?.apiBase ||
    config?.apiOrigin ||
    config?.api?.baseUrl ||
    config?.api?.base ||
    DEFAULT_API_BASE
);

const AUTH_ENDPOINTS = Object.freeze({
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  refresh: "/api/auth/refresh",
  activate: "/api/auth/activate",
  requestPasswordReset: "/api/auth/reset-password-request",
  confirmPasswordReset: "/api/auth/reset-password-confirm",
  me: "/api/auth/me",
});

const PUBLIC_API_PATHS = Object.freeze([
  AUTH_ENDPOINTS.login,
  AUTH_ENDPOINTS.refresh,
  AUTH_ENDPOINTS.activate,
  AUTH_ENDPOINTS.requestPasswordReset,
  AUTH_ENDPOINTS.confirmPasswordReset,
]);

const PRIVATE_ME_PATH = AUTH_ENDPOINTS.me;

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function normalizeApiBase(value = "") {
  const raw = text(value, DEFAULT_API_BASE).replace(/\/+$/g, "");

  try {
    const url = new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return DEFAULT_API_BASE;
    }

    if (url.pathname === "/api") {
      return url.origin;
    }

    return url.origin;
  } catch {
    return DEFAULT_API_BASE;
  }
}

function apiOrigin() {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return DEFAULT_API_BASE;
  }
}

function fetchFn() {
  try {
    if (typeof globalThis !== "undefined" && isFunction(globalThis.fetch)) {
      return globalThis.fetch.bind(globalThis);
    }
  } catch {
    // noop
  }

  return null;
}

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isUrlSearchParams(value) {
  return typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams;
}

function normalizeMethod(method = "GET") {
  const value = text(method, "GET").toUpperCase();

  return ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(value)
    ? value
    : "GET";
}

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function tokenOk(token = "") {
  const value = text(token, "").replace(/^Bearer\s+/i, "");

  if (!value) return false;
  if (/\s/.test(value)) return false;
  if (value.length > 8192) return false;

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(value.toLowerCase());
}

function cleanToken(token = "") {
  const value = text(token, "").replace(/^Bearer\s+/i, "");
  return tokenOk(value) ? value : "";
}

function getToken(state = {}, options = {}) {
  return cleanToken(
    options.token ||
      state?.token ||
      state?.accessToken ||
      state?.access_token ||
      ""
  );
}

/* =========================================================
   PATHS / URL
========================================================= */

function endpointToPath(endpoint = "/") {
  const raw = text(endpoint, "/");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);

      if (url.origin !== apiOrigin()) {
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

function cleanPath(path = "/") {
  const clean = endpointToPath(path);

  if (!clean) return "";

  return clean.split("?")[0] || "/";
}

function joinUrl(base = "", path = "") {
  const root = text(base, API_BASE).replace(/\/+$/g, "");
  const clean = text(path, "/").replace(/^\/+/g, "");

  return `${root}/${clean}`;
}

function appendQuery(url = "", query = null) {
  if (!isObject(query)) return url;

  const target = new URL(url, API_BASE);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    target.searchParams.set(key, String(value));
  }

  return target.toString();
}

function isPublicApiPath(path = "") {
  const clean = cleanPath(path);

  if (!clean) return false;
  if (clean === PRIVATE_ME_PATH) return false;

  return PUBLIC_API_PATHS.includes(clean);
}

function shouldUseAuth(path = "", options = {}) {
  const clean = cleanPath(path);

  if (clean === PRIVATE_ME_PATH) return true;

  if (
    options.public === true ||
    options.skipAuth === true ||
    options.auth === false ||
    options.noAuthHeader === true
  ) {
    return false;
  }

  if (options.auth === true) return true;

  return !isPublicApiPath(clean);
}

/* =========================================================
   BODY / HEADERS
========================================================= */

function serializeBody(method = "GET", body = undefined) {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return undefined;
  if (body === undefined || body === null) return undefined;
  if (isFormData(body)) return body;
  if (isUrlSearchParams(body)) return body;
  if (typeof body === "string") return body;

  return JSON.stringify(body);
}

function buildHeaders({
  state = {},
  options = {},
  auth = false,
  body = undefined,
} = {}) {
  const headers = {
    ...(isObject(options.headers) ? options.headers : {}),
  };

  if (!headers.Accept && !headers.accept) {
    headers.Accept = "application/json";
  }

  const hasBody = body !== undefined && body !== null;

  if (
    hasBody &&
    !isFormData(body) &&
    !isUrlSearchParams(body) &&
    !headers["Content-Type"] &&
    !headers["content-type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getToken(state, options);

    if (token && !headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else {
    delete headers.Authorization;
    delete headers.authorization;
  }

  return headers;
}

/* =========================================================
   RESPONSE / ERROR
========================================================= */

export async function parseResponseBody(response, responseType = "auto") {
  if (!response || [204, 205, 304].includes(response.status)) return null;

  if (responseType === "raw" || responseType === "response") return response;
  if (responseType === "blob") return response.blob();
  if (responseType === "arrayBuffer" || responseType === "arraybuffer") {
    return response.arrayBuffer();
  }
  if (responseType === "text") return response.text();

  const contentType = response.headers?.get?.("content-type") || "";

  if (responseType === "json" || contentType.includes("application/json")) {
    const raw = await response.text();

    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return responseType === "json" ? null : raw;
    }
  }

  return response.text();
}

export function buildRequestError({
  response = null,
  data = null,
  url = "",
  method = "GET",
  raw = null,
  code = "",
} = {}) {
  const status = response?.status || 0;

  const message =
    data?.message ||
    data?.error ||
    raw?.message ||
    raw ||
    response?.statusText ||
    `HTTP ${status || "ERROR"}`;

  const error = new Error(redact(String(message)));

  error.name = "RequestError";
  error.status = status;
  error.statusCode = status;
  error.statusText = response?.statusText || "";
  error.code = code || data?.code || raw?.code || "REQUEST_ERROR";
  error.url = redact(url);
  error.method = normalizeMethod(method);
  error.data = data;
  error.raw = raw || null;

  return error;
}

export function shouldRetryRequest() {
  return false;
}

export async function executeFetchWithRetry(url, fetchFactory) {
  return fetchFactory(0, url);
}

/* =========================================================
   EVENTS
========================================================= */

function emit(events, name, payload = {}) {
  try {
    if (isFunction(events?.emit)) {
      events.emit(name, payload);
      return true;
    }

    if (isFunction(events?.dispatch)) {
      events.dispatch(name, payload);
      return true;
    }

    if (isFunction(events?.trigger)) {
      events.trigger(name, payload);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/* =========================================================
   ARGUMENTS
========================================================= */

function normalizeArgs(arg1, arg2 = {}, arg3 = undefined) {
  if (typeof arg1 === "string" && typeof arg2 === "string") {
    return {
      path: arg2,
      options: {
        ...(isObject(arg3) ? arg3 : {}),
        method: arg1,
      },
    };
  }

  if (isObject(arg1)) {
    return {
      path: arg1.path || arg1.url || arg1.endpoint || "/",
      options: {
        ...arg1,
        ...(isObject(arg2) ? arg2 : {}),
      },
    };
  }

  return {
    path: arg1 || "/",
    options: isObject(arg2) ? arg2 : {},
  };
}

/* =========================================================
   REQUEST FACTORY
========================================================= */

export function createRequest({ state = {}, events = null, setError = null } = {}) {
  let sequence = 0;
  let pending = 0;
  let lastError = null;

  async function request(...args) {
    const { path, options } = normalizeArgs(...args);

    const method = normalizeMethod(options.method);
    const clean = endpointToPath(path);

    if (!clean) {
      throw buildRequestError({
        method,
        raw: "Endpoint no permitido.",
        code: "ENDPOINT_NOT_ALLOWED",
      });
    }

    const body = options.body ?? options.data ?? options.payload;
    const query = options.query ?? options.params ?? null;

    const url = appendQuery(joinUrl(API_BASE, clean), query);
    const endpointPath = cleanPath(clean);
    const auth = shouldUseAuth(endpointPath, options);

    const serializedBody = serializeBody(method, body);

    const headers = buildHeaders({
      state,
      options,
      auth,
      body: serializedBody,
    });

    const requestId = `req_${++sequence}`;
    const safeUrl = redact(url);

    pending += 1;

    if (isObject(state)) {
      state.requestPending = pending;
      state.lastRequestUrl = safeUrl;
      state.lastRequestMethod = method;
    }

    if (options.emitEvents === true) {
      emit(events, REQUEST_EVENTS.start, {
        requestId,
        method,
        url: safeUrl,
        auth,
      });
    }

    try {
      const runFetch = fetchFn();

      if (!runFetch) {
        throw buildRequestError({
          url,
          method,
          raw: "Fetch API no disponible.",
          code: "FETCH_MISSING",
        });
      }

      const response = await runFetch(url, {
        method,
        headers,
        credentials: options.credentials || "include",
        cache: options.cache || "default",
        body: serializedBody,
        signal: options.signal || undefined,
      });

      if (isObject(state)) {
        state.lastRequestStatus = response.status;
      }

      if (options.raw === true) {
        if (!response.ok) {
          const errorData = await parseResponseBody(response, "auto").catch(() => null);

          throw buildRequestError({
            response,
            data: errorData,
            url,
            method,
          });
        }

        if (options.emitEvents === true) {
          emit(events, REQUEST_EVENTS.success, {
            requestId,
            method,
            status: response.status,
          });
        }

        return response;
      }

      const data = await parseResponseBody(response, options.responseType || "auto");

      if (!response.ok) {
        throw buildRequestError({
          response,
          data,
          url,
          method,
        });
      }

      if (options.emitEvents === true) {
        emit(events, REQUEST_EVENTS.success, {
          requestId,
          method,
          status: response.status,
        });
      }

      return data;
    } catch (error) {
      lastError = error;

      if (isObject(state)) {
        state.lastRequestStatus = error.status || error.statusCode || 0;
      }

      if (isFunction(setError) && options.storeError !== false) {
        try {
          setError(error);
        } catch {
          // noop
        }
      }

      if (options.emitEvents === true) {
        emit(events, REQUEST_EVENTS.error, {
          requestId,
          method,
          status: error.status || error.statusCode || 0,
          message: redact(error.message || "Request error"),
        });
      }

      throw error;
    } finally {
      pending = Math.max(0, pending - 1);

      if (isObject(state)) {
        state.requestPending = pending;
      }
    }
  }

  request.getSnapshot = function getSnapshot() {
    return {
      version: REQUEST_VERSION,
      sequence,
      pending,
      lastError: lastError
        ? {
            name: lastError.name || "Error",
            message: redact(lastError.message || ""),
            status: lastError.status || lastError.statusCode || 0,
            code: lastError.code || null,
          }
        : null,
    };
  };

  request.getDebugSnapshot = request.getSnapshot;
  request.snapshot = request.getSnapshot;

  request.clearInFlight = function clearInFlight() {
    return 0;
  };

  request.abortInFlight = function abortInFlight() {
    return 0;
  };

  return request;
}

/* =========================================================
   API CLIENT
========================================================= */

export function createApiClient(request) {
  function call(method, path, bodyOrOptions = undefined, maybeOptions = {}) {
    const finalMethod = normalizeMethod(method);

    if (["GET", "HEAD", "OPTIONS"].includes(finalMethod)) {
      return request(path, {
        ...(isObject(bodyOrOptions) ? bodyOrOptions : {}),
        method: finalMethod,
      });
    }

    return request(path, {
      ...maybeOptions,
      method: finalMethod,
      body: bodyOrOptions,
    });
  }

  return {
    request,

    get: (path, options = {}) => call("GET", path, options),
    head: (path, options = {}) => call("HEAD", path, options),
    options: (path, options = {}) => call("OPTIONS", path, options),

    post: (path, body = undefined, options = {}) => call("POST", path, body, options),
    put: (path, body = undefined, options = {}) => call("PUT", path, body, options),
    patch: (path, body = undefined, options = {}) => call("PATCH", path, body, options),

    delete: (path, options = {}) => call("DELETE", path, undefined, options),
    del: (path, options = {}) => call("DELETE", path, undefined, options),

    upload: (path, formData, options = {}) =>
      request(path, {
        ...options,
        method: options.method || "POST",
        body: formData,
      }),

    download: (path, options = {}) =>
      request(path, {
        ...options,
        method: "GET",
        responseType: options.responseType || "blob",
      }),

    raw: (path, options = {}) =>
      request(path, {
        ...options,
        raw: true,
      }),

    getSnapshot: () => request.getSnapshot?.() || null,
    getDebugSnapshot: () => request.getDebugSnapshot?.() || null,
    snapshot: () => request.snapshot?.() || null,

    clearInFlight: () => request.clearInFlight?.() || 0,
    abortInFlight: () => request.abortInFlight?.() || 0,
  };
}

export default {
  REQUEST_VERSION,
  REQUEST_EVENTS,

  createRequest,
  createApiClient,

  parseResponseBody,
  buildRequestError,

  shouldRetryRequest,
  executeFetchWithRetry,
};
