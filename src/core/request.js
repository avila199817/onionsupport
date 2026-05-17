/* =========================================================
   Onion Support - Core Request
   Archivo: /src/core/request.js

   Responsabilidad:
   - Fetch mínimo.
   - API base desde config.
   - Auth header sólo si toca.
   - /api/auth/me siempre privado.
   - Sin hooks.
   - Sin retry complejo.
   - Sin dedupe.
   - Sin UI.
   - Sin Router.
   - Sin Storage.
   - Sin Toast.
========================================================= */

import { config } from "./config.js";

export const REQUEST_VERSION = "simple";

export const REQUEST_EVENTS = Object.freeze({
  start: "app:request:start",
  success: "app:request:success",
  error: "app:request:error",
  retry: "app:request:retry",
  deduped: "app:request:deduped",
  abort: "app:request:abort",
  clearInFlight: "app:request:clear-in-flight",
});

const API_BASE = config?.apiBase || "https://api.onionit.net";

const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/activate",
  "/api/auth/reset-password-request",
  "/api/auth/reset-password-confirm",
];

const PRIVATE_ME_PATH = "/api/auth/me";

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

function normalizeMethod(method = "GET") {
  const value = text(method, "GET").toUpperCase();

  return ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(value)
    ? value
    : "GET";
}

function cleanPath(path = "/") {
  let value = text(path, "/");

  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://local.invalid";

    value = new URL(value, base).pathname || "/";
  } catch {
    value = value.split("?")[0].split("#")[0] || "/";
  }

  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "");

  return value || "/";
}

function isPublicApiPath(path = "") {
  const clean = cleanPath(path);

  if (clean === PRIVATE_ME_PATH) return false;

  return PUBLIC_API_PATHS.some((item) => clean === item || clean.startsWith(`${item}/`));
}

function joinUrl(base = "", path = "") {
  if (/^https?:\/\//i.test(path)) return path;

  const root = text(base, API_BASE).replace(/\/+$/g, "");
  const clean = text(path, "/").replace(/^\/+/g, "");

  return `${root}/${clean}`;
}

function appendQuery(url = "", query = null) {
  if (!isObject(query)) return url;

  const target = new URL(
    url,
    typeof window !== "undefined" ? window.location.origin : "https://local.invalid"
  );

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    target.searchParams.set(key, String(value));
  }

  return /^https?:\/\//i.test(url)
    ? target.toString()
    : `${target.pathname}${target.search}${target.hash}`;
}

function tokenOk(token = "") {
  const value = text(token, "").replace(/^Bearer\s+/i, "");

  if (!value) return false;
  if (/\s/.test(value)) return false;

  return !["null", "undefined", "false", "true", "[object object]"].includes(
    value.toLowerCase()
  );
}

function getToken(state = {}, options = {}) {
  const token =
    options.token ||
    state?.token ||
    state?.accessToken ||
    state?.access_token ||
    "";

  return tokenOk(token) ? String(token).replace(/^Bearer\s+/i, "") : "";
}

function buildHeaders({ state = {}, options = {}, auth = false, body = undefined } = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  const hasBody = body !== undefined && body !== null;

  if (hasBody && !(body instanceof FormData) && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getToken(state, options);

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else {
    delete headers.Authorization;
    delete headers.authorization;
  }

  return headers;
}

function serializeBody(method = "GET", body = undefined) {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return undefined;
  if (body === undefined || body === null) return undefined;
  if (body instanceof FormData) return body;
  if (typeof body === "string") return body;

  return JSON.stringify(body);
}

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
} = {}) {
  const status = response?.status || 0;
  const message =
    data?.message ||
    data?.error ||
    raw?.message ||
    raw ||
    response?.statusText ||
    `HTTP ${status || "ERROR"}`;

  const error = new Error(String(message));

  error.name = "RequestError";
  error.status = status;
  error.statusText = response?.statusText || "";
  error.url = url;
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

export function createRequest({ state = {}, events = null, setError = null } = {}) {
  let sequence = 0;
  let pending = 0;
  let lastError = null;

  async function request(...args) {
    const { path, options } = normalizeArgs(...args);

    const method = normalizeMethod(options.method);
    const body = options.body ?? options.data ?? options.payload;
    const query = options.query ?? options.params ?? null;

    const url = appendQuery(joinUrl(API_BASE, path), query);
    const clean = cleanPath(url);

    const auth =
      clean === PRIVATE_ME_PATH
        ? true
        : options.public === true || options.skipAuth === true || options.auth === false
          ? false
          : options.auth === true || !isPublicApiPath(clean);

    const serializedBody = serializeBody(method, body);

    const headers = buildHeaders({
      state,
      options,
      auth,
      body: serializedBody,
    });

    const requestId = `req_${++sequence}`;

    pending += 1;

    if (state && typeof state === "object") {
      state.requestPending = pending;
      state.lastRequestUrl = url.replace(/([?&#]token=)([^&#\s]+)/gi, "$1***");
      state.lastRequestMethod = method;
    }

    if (options.emitEvents === true) {
      emit(events, REQUEST_EVENTS.start, {
        requestId,
        method,
        url: state?.lastRequestUrl || url,
        auth,
      });
    }

    try {
      if (typeof fetch !== "function") {
        throw new Error("Fetch API no disponible.");
      }

      const response = await fetch(url, {
        method,
        headers,
        credentials: options.credentials || "include",
        cache: options.cache || "default",
        body: serializedBody,
        signal: options.signal || undefined,
      });

      const data = await parseResponseBody(response, options.responseType || "auto");

      if (state && typeof state === "object") {
        state.lastRequestStatus = response.status;
      }

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

      return options.raw === true ? response : data;
    } catch (error) {
      lastError = error;

      if (state && typeof state === "object") {
        state.lastRequestStatus = error.status || 0;
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
          status: error.status || 0,
          message: error.message || "Request error",
        });
      }

      throw error;
    } finally {
      pending = Math.max(0, pending - 1);

      if (state && typeof state === "object") {
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
            message: lastError.message || "",
            status: lastError.status || 0,
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
