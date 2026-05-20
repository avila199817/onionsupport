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

import {
  config,
  AUTH_ENDPOINTS,
  PUBLIC_API_PATHS,
  getApiBase,
  isCanonicalBackendApiBase,
  isPublicApiPath,
} from "./config.js";

export const REQUEST_VERSION = "core.request.v3";

const DEFAULT_API_BASE = getApiBase();
const API_BASE = normalizeApiBase(
  config?.apiBase ||
    config?.apiOrigin ||
    config?.api?.baseUrl ||
    config?.api?.base ||
    DEFAULT_API_BASE
);

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

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   API BASE
========================================================= */

function normalizeApiBase(value = "") {
  const raw = cleanText(value, DEFAULT_API_BASE).replace(/\/+$/g, "");

  try {
    const url = new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return DEFAULT_API_BASE;
    }

    if (!isCanonicalBackendApiBase(url.origin)) {
      return DEFAULT_API_BASE;
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

/* =========================================================
   FETCH
========================================================= */

function getFetch() {
  try {
    if (typeof globalThis !== "undefined" && isFunction(globalThis.fetch)) {
      return globalThis.fetch.bind(globalThis);
    }
  } catch {
    // noop
  }

  return null;
}

/* =========================================================
   BODY HELPERS
========================================================= */

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isUrlSearchParams(value) {
  return typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams;
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isArrayBuffer(value) {
  return (
    typeof ArrayBuffer !== "undefined" &&
    (
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView?.(value)
    )
  );
}

/* =========================================================
   METHOD / TOKEN
========================================================= */

function normalizeMethod(method = "GET") {
  const value = cleanText(method, "GET").toUpperCase();

  return ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(value)
    ? value
    : "GET";
}

function tokenOk(token = "") {
  const value = cleanText(token, "").replace(/^Bearer\s+/i, "");

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
  const value = cleanText(token, "").replace(/^Bearer\s+/i, "");
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
  const raw = cleanText(endpoint, "/");

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

function cleanEndpointPath(path = "/") {
  const clean = endpointToPath(path);

  if (!clean) return "";

  return clean.split("?")[0] || "/";
}

function joinUrl(base = "", path = "") {
  const root = cleanText(base, API_BASE).replace(/\/+$/g, "");
  const clean = cleanText(path, "/").replace(/^\/+/g, "");

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

function endpointIsPublic(path = "") {
  const clean = cleanEndpointPath(path);

  if (!clean) return false;
  if (clean === PRIVATE_ME_PATH) return false;

  return isPublicApiPath(clean);
}

function shouldUseAuth(path = "", options = {}) {
  const clean = cleanEndpointPath(path);

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

  return !endpointIsPublic(clean);
}

/* =========================================================
   BODY / HEADERS
========================================================= */

function shouldSerializeAsJson(body = undefined) {
  return Boolean(
    body !== undefined &&
      body !== null &&
      !isFormData(body) &&
      !isUrlSearchParams(body) &&
      !isBlob(body) &&
      !isArrayBuffer(body) &&
      typeof body !== "string"
  );
}

function serializeBody(method = "GET", body = undefined) {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return undefined;
  if (body === undefined || body === null) return undefined;

  if (shouldSerializeAsJson(body)) {
    return JSON.stringify(body);
  }

  return body;
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
  const target = name.toLowerCase();

  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function removeHeader(headers = {}, name = "") {
  const target = name.toLowerCase();

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      delete headers[key];
    }
  }

  return headers;
}

function buildHeaders({
  state = {},
  options = {},
  auth = false,
  originalBody = undefined,
  serializedBody = undefined,
} = {}) {
  const headers = headersFrom(options.headers);

  if (!hasHeader(headers, "accept")) {
    headers.Accept = "application/json";
  }

  if (
    serializedBody !== undefined &&
    shouldSerializeAsJson(originalBody) &&
    !hasHeader(headers, "content-type")
  ) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getToken(state, options);

    if (token && !hasHeader(headers, "authorization")) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else {
    removeHeader(headers, "authorization");
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

export function createRequest({
  state = {},
} = {}) {
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

    const originalBody = options.body ?? options.data ?? options.payload;
    const query = options.query ?? options.params ?? null;

    const url = appendQuery(joinUrl(API_BASE, clean), query);
    const endpointPath = cleanEndpointPath(clean);
    const auth = shouldUseAuth(endpointPath, options);

    const serializedBody = serializeBody(method, originalBody);

    const headers = buildHeaders({
      state,
      options,
      auth,
      originalBody,
      serializedBody,
    });

    const requestId = `req_${++sequence}`;
    const safeUrl = redact(url);

    pending += 1;

    try {
      const runFetch = getFetch();

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

      return data;
    } catch (error) {
      lastError = error;

      throw error;
    } finally {
      pending = Math.max(0, pending - 1);
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

  request.snapshot = request.getSnapshot;

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
    snapshot: () => request.snapshot?.() || null,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  REQUEST_VERSION,

  createRequest,
  createApiClient,

  parseResponseBody,
  buildRequestError,

  publicApiPaths: PUBLIC_API_PATHS,
};
