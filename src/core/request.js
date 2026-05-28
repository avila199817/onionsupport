/* =========================================================
   Onion Support - Core Request
   Archivo: /src/core/request.js

   Responsabilidad:
   - Fetch mínimo.
   - API base desde core/config.js.
   - Auth header sólo si toca.
   - /api/auth/me siempre privado.
   - /api/auth/refresh público y sin Authorization.
   - Bloquear endpoints externos.
   - Bloquear endpoints inválidos.
   - Preservar Authorization si ya viene preparado por core/http.js.
   - Parsear respuesta JSON/text/blob/arrayBuffer de forma mínima.
   - Preservar payload de error backend para core/http.js.
   - TOKEN_EXPIRED no limpia sesión aquí.
   - Timeout técnico opcional sin retry.
   - Credentials include por defecto para sesión/refresh con cookie httpOnly.
   - Sin hooks.
   - Sin retry real.
   - Sin dedupe real.
   - Sin refresh automático.
   - Sin logout automático.
   - Sin UI.
   - Sin Router.
   - Sin Storage.
   - Sin Toast.
========================================================= */

import {
  config,
  AUTH_ENDPOINTS,
  PUBLIC_API_PATHS,
  PRIVATE_API_PATHS,
  SENSITIVE_QUERY_PARAMS,
  getApiBase,
  isCanonicalBackendApiBase,
  isPublicApiPath,
} from "./config.js";

export const REQUEST_VERSION = "core.request.v9";

const DEFAULT_API_BASE = getApiBase();
const DEFAULT_TIMEOUT_MS = Number(config?.api?.timeout || 30000) || 30000;

const API_BASE = normalizeApiBase(
  config?.apiBase ||
    config?.apiOrigin ||
    config?.api?.baseUrl ||
    config?.api?.base ||
    DEFAULT_API_BASE
);

const PRIVATE_ME_PATH = AUTH_ENDPOINTS.me || "/api/auth/me";

const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

const BODYLESS_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const SENSITIVE_KEYS = new Set(
  SENSITIVE_QUERY_PARAMS.map((key) => String(key).toLowerCase())
);

const SENSITIVE_QUERY_PATTERN = buildSensitiveQueryPattern();

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

function safeKey(value = "") {
  return cleanText(value, "").toLowerCase();
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSensitiveQueryPattern() {
  const keys = [...SENSITIVE_KEYS]
    .map(escapeRegExp)
    .filter(Boolean)
    .join("|");

  return keys
    ? new RegExp(`([?&#](?:${keys})=)([^&#\\s]+)`, "gi")
    : null;
}

function redact(value = "") {
  const text = cleanText(value, "");
  const redactedQuery = SENSITIVE_QUERY_PATTERN
    ? text.replace(SENSITIVE_QUERY_PATTERN, "$1***")
    : text;

  return redactedQuery
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function normalizeErrorCode(value = "") {
  return cleanText(value, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
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

function isReadableStream(value) {
  return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}

/* =========================================================
   METHOD / TOKEN
========================================================= */

function normalizeMethod(method = "GET") {
  const value = cleanText(method, "GET").toUpperCase();
  return ALLOWED_METHODS.has(value) ? value : "GET";
}

function stripBearer(token = "") {
  return cleanText(token, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(token = "") {
  const value = stripBearer(token);

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
  const value = stripBearer(token);
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
  const raw = cleanText(endpoint, "");

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

  if (!root || !clean) return "";

  return `${root}/${clean}`;
}

function appendQuery(url = "", query = null) {
  if (!url || !isObject(query)) return url;

  const target = new URL(url, API_BASE);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          target.searchParams.append(key, String(item));
        }
      }

      continue;
    }

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
  if (endpointIsPublic(clean)) return false;

  if (
    options.public === true ||
    options.skipAuth === true ||
    options.auth === false ||
    options.noAuthHeader === true
  ) {
    return false;
  }

  if (options.auth === true) return true;

  return true;
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
      !isReadableStream(body) &&
      typeof body !== "string"
  );
}

function serializeBody(method = "GET", body = undefined) {
  if (BODYLESS_METHODS.has(method)) return undefined;
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
  const target = cleanText(name, "").toLowerCase();

  if (!target) return false;

  return Object.keys(headers || {}).some((key) => key.toLowerCase() === target);
}

function removeHeader(headers = {}, name = "") {
  const target = cleanText(name, "").toLowerCase();

  if (!target) return headers;

  for (const key of Object.keys(headers || {})) {
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

function normalizeCredentials(value = "") {
  const clean = cleanText(value, "");

  if (clean === "omit") return "omit";
  if (clean === "same-origin") return "same-origin";
  if (clean === "include") return "include";

  return config?.api?.withCredentials === false ? "same-origin" : "include";
}

/* =========================================================
   TIMEOUT / ABORT
========================================================= */

function normalizeTimeout(value = undefined) {
  if (value === false || value === null) return 0;

  const source = value === undefined
    ? DEFAULT_TIMEOUT_MS
    : Number(value);

  if (!Number.isFinite(source) || source <= 0) return 0;

  return Math.floor(source);
}

function abortController(controller = null, reason = "abort") {
  if (!controller || !isFunction(controller.abort)) return false;

  try {
    controller.abort(reason);
    return true;
  } catch {
    try {
      controller.abort();
      return true;
    } catch {
      return false;
    }
  }
}

function createAbortContext({
  signal = null,
  timeout = 0,
} = {}) {
  const timeoutMs = normalizeTimeout(timeout);

  if (
    typeof AbortController === "undefined" ||
    (!timeoutMs && !signal)
  ) {
    return {
      signal: signal || undefined,
      timedOut: () => false,
      clear: () => true,
    };
  }

  if (!timeoutMs && signal) {
    return {
      signal,
      timedOut: () => false,
      clear: () => true,
    };
  }

  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId = null;
  let removeExternalAbort = () => true;

  if (signal) {
    if (signal.aborted) {
      abortController(controller, signal.reason || "aborted");
    } else if (isFunction(signal.addEventListener)) {
      const onAbort = () => {
        abortController(controller, signal.reason || "aborted");
      };

      signal.addEventListener("abort", onAbort, { once: true });

      removeExternalAbort = () => {
        try {
          signal.removeEventListener("abort", onAbort);
          return true;
        } catch {
          return false;
        }
      };
    }
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      abortController(controller, "timeout");
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    clear: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      removeExternalAbort();
      return true;
    },
  };
}

/* =========================================================
   RESPONSE / ERROR
========================================================= */

export async function parseResponseBody(response, responseType = "auto") {
  if (!response || [204, 205, 304].includes(response.status)) return null;

  const type = cleanText(responseType, "auto");

  if (type === "raw" || type === "response") return response;
  if (type === "blob") return response.blob();

  if (type === "arrayBuffer" || type === "arraybuffer") {
    return response.arrayBuffer();
  }

  if (type === "text") return response.text();

  const contentType = response.headers?.get?.("content-type") || "";

  if (
    type === "json" ||
    contentType.includes("application/json") ||
    contentType.includes("+json")
  ) {
    const raw = await response.text();

    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return type === "json" ? null : raw;
    }
  }

  return response.text();
}

function errorMessageFrom(value = null) {
  if (!value) return "";

  if (typeof value === "string") return cleanText(value, "");

  if (isObject(value)) {
    return cleanText(
      value.message ||
        value.error_description ||
        value.error ||
        value.detail ||
        value.reason ||
        value.auth?.message ||
        value.data?.message ||
        "",
      ""
    );
  }

  return cleanText(String(value), "");
}

function errorCodeFrom(value = null) {
  if (!isObject(value)) return "";

  return normalizeErrorCode(
    value.auth?.code ||
      value.auth?.error ||
      value.code ||
      value.errorCode ||
      value.error_code ||
      value.error ||
      value.data?.code ||
      value.data?.error ||
      ""
  );
}

function sanitizeForSnapshot(value = null, depth = 0) {
  if (depth > 5) return null;

  if (typeof value === "string") return redact(value);

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeForSnapshot(item, depth + 1));
  }

  if (!isObject(value)) return value;

  const output = {};

  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(safeKey(key))) {
      output[key] = "***";
      continue;
    }

    output[key] = sanitizeForSnapshot(child, depth + 1);
  }

  return output;
}

export function buildRequestError({
  response = null,
  data = null,
  url = "",
  method = "GET",
  raw = null,
  code = "",
} = {}) {
  const status = Number(response?.status || 0) || 0;

  const message =
    errorMessageFrom(data) ||
    errorMessageFrom(raw) ||
    response?.statusText ||
    `HTTP ${status || "ERROR"}`;

  const finalCode =
    normalizeErrorCode(code) ||
    errorCodeFrom(data) ||
    errorCodeFrom(raw) ||
    "REQUEST_ERROR";

  const error = new Error(redact(String(message)));

  error.name = "RequestError";
  error.status = status;
  error.statusCode = status;
  error.statusText = response?.statusText || "";

  error.code = finalCode;
  error.error = finalCode;

  error.url = redact(url);
  error.method = normalizeMethod(method);

  error.data = data;
  error.body = data;
  error.payload = data;
  error.responseData = data;

  error.safeData = sanitizeForSnapshot(data);

  error.raw = typeof raw === "string"
    ? redact(raw)
    : sanitizeForSnapshot(raw) || null;

  error.auth = isObject(data?.auth) ? data.auth : null;

  error.canRefresh =
    data?.canRefresh === true ||
    data?.refreshRequired === true ||
    data?.auth?.canRefresh === true ||
    data?.auth?.refreshRequired === true;

  error.refreshRequired =
    data?.refreshRequired === true ||
    data?.auth?.refreshRequired === true;

  error.shouldLogout =
    data?.shouldLogout === true ||
    data?.auth?.shouldLogout === true;

  error.clearClientSession =
    data?.clearClientSession === true ||
    data?.auth?.clearClientSession === true;

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
  let lastRequest = null;

  function requestState() {
    try {
      const value = isFunction(state) ? state() : state;
      return isObject(value) ? value : {};
    } catch {
      return {};
    }
  }

  async function request(...args) {
    const { path, options } = normalizeArgs(...args);

    const method = normalizeMethod(options.method);
    const clean = endpointToPath(path);

    if (!clean) {
      throw buildRequestError({
        method,
        url: path || "",
        raw: "Endpoint no permitido.",
        code: "ENDPOINT_NOT_ALLOWED",
      });
    }

    const endpointPath = cleanEndpointPath(clean);

    if (!endpointPath) {
      throw buildRequestError({
        method,
        url: path || "",
        raw: "URL de API no permitida.",
        code: "API_URL_NOT_ALLOWED",
      });
    }

    const originalBody = options.body ?? options.data ?? options.payload;
    const query = options.query ?? options.params ?? null;

    const url = appendQuery(joinUrl(API_BASE, clean), query);
    const auth = shouldUseAuth(endpointPath, options);

    if (!url) {
      throw buildRequestError({
        method,
        url: path || "",
        raw: "URL de API no permitida.",
        code: "API_URL_NOT_ALLOWED",
      });
    }

    const serializedBody = serializeBody(method, originalBody);

    const headers = buildHeaders({
      state: requestState(),
      options,
      auth,
      originalBody,
      serializedBody,
    });

    const abort = createAbortContext({
      signal: options.signal || null,
      timeout: options.timeoutMs ?? options.timeout,
    });

    const finalRequestOptions = {
      method,
      headers,
      credentials: normalizeCredentials(options.credentials),
      cache: options.cache || "default",
      body: serializedBody,
      signal: abort.signal,
    };

    pending += 1;
    sequence += 1;

    lastRequest = {
      id: sequence,
      method,
      url: redact(url),
      endpointPath,
      auth,
    };

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

      const response = await runFetch(url, finalRequestOptions);

      if (!response.ok) {
        const errorData = await parseResponseBody(response, "auto").catch(() => null);

        throw buildRequestError({
          response,
          data: errorData,
          url,
          method,
        });
      }

      if (options.raw === true) {
        return response;
      }

      return parseResponseBody(response, options.responseType || "auto");
    } catch (error) {
      if (abort.timedOut()) {
        lastError = buildRequestError({
          url,
          method,
          raw: "Tiempo de espera agotado.",
          code: "REQUEST_TIMEOUT",
        });

        throw lastError;
      }

      lastError = error;
      throw error;
    } finally {
      abort.clear();
      pending = Math.max(0, pending - 1);
    }
  }

  request.getSnapshot = function getSnapshot() {
    return {
      version: REQUEST_VERSION,

      apiBase: API_BASE,

      sequence,
      pending,

      lastRequest,

      lastError: lastError
        ? {
            name: lastError.name || "Error",
            message: redact(lastError.message || ""),
            status: lastError.status || lastError.statusCode || 0,
            code: lastError.code || null,
            canRefresh: lastError.canRefresh === true,
            refreshRequired: lastError.refreshRequired === true,
            shouldLogout: lastError.shouldLogout === true,
            clearClientSession: lastError.clearClientSession === true,
            safeData: sanitizeForSnapshot(lastError.safeData || lastError.data || null),
          }
        : null,

      policy: {
        requestOnly: true,

        noRetry: true,
        noDedupe: true,
        noHooks: true,

        noUi: true,
        noRouter: true,
        noStorage: true,
        noToast: true,

        noAutoRefresh: true,
        noAutoLogout: true,
        tokenExpiredDoesNotMeanLogout: true,

        preservesBackendErrorPayload: true,
        exposesOnlySafeErrorDataInSnapshot: true,

        meAlwaysPrivate: true,
        refreshPublicWithoutAuthorization: true,
        credentialsIncludeByDefault: true,

        blocksExternalEndpoints: true,
        blocksInvalidEndpoints: true,
        preservesPreparedAuthorization: true,

        timeoutWithoutRetry: true,

        snapshotRedacted: true,
      },
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

    if (BODYLESS_METHODS.has(finalMethod)) {
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
  privateApiPaths: PRIVATE_API_PATHS,
};
