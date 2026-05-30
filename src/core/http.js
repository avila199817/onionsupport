/* =========================================================
   Onion Support - Core HTTP
   Archivo: /src/core/http.js

   Responsabilidad:
   - Cliente HTTP único de la SPA.
   - API base desde core/config.js.
   - credentials: "include" por defecto.
   - Authorization sólo si corresponde y existe access token en Core.
   - Parsear JSON/text/blob/arrayBuffer.
   - Descargar blobs/documentos.
   - Clasificar errores auth sin navegar.
   - Sin Router.
   - Sin Toast.
   - Sin Store.
   - Sin Services.
   - Sin storage.
   - Sin refresh automático.
========================================================= */

import {
  config,
  AUTH_ENDPOINTS as CONFIG_AUTH_ENDPOINTS,
  SENSITIVE_QUERY_PARAMS,
  getApiBase,
  endpointPathFromUrlLike,
  normalizeEndpointPath,
  isPublicApiPath as configIsPublicApiPath,
  isPrivateApiPath as configIsPrivateApiPath,
} from "./config.js";

export const HTTP_VERSION = "core.http.minimal.v3";

export const AUTH_ENDPOINTS = CONFIG_AUTH_ENDPOINTS;

const DEFAULT_TIMEOUT_MS = Number(config?.api?.timeout || 30000) || 30000;
const DEFAULT_API_BASE = getApiBase();

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const VALID_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

const SENSITIVE_KEYS = new Set(
  (Array.isArray(SENSITIVE_QUERY_PARAMS) ? SENSITIVE_QUERY_PARAMS : [])
    .map((key) => normalizeKey(key))
    .filter(Boolean)
);

let appCore = null;

const stats = {
  total: 0,
  success: 0,
  error: 0,
  lastMethod: "",
  lastUrl: "",
  lastStatus: null,
  lastError: null,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPlainObject(value) {
  if (!isObject(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
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

function normalizeKey(value = "") {
  return cleanText(value, "")
    .replace(/[-_\s]/g, "")
    .toLowerCase();
}

function normalizeCode(value = "") {
  return cleanText(value, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return null;
}

function redact(value = "") {
  let text = cleanText(value, "");

  try {
    const url = new URL(text, "https://onionsupport.local");

    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_KEYS.has(normalizeKey(key))) {
        url.searchParams.set(key, "***");
      }
    }

    text = /^https?:\/\//i.test(text)
      ? url.toString()
      : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    text = text.replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    );
  }

  return text
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function sanitizeData(value, depth = 0) {
  if (depth > 5) return null;

  if (value === undefined) return undefined;
  if (value === null) return null;

  const type = typeof value;

  if (type === "string") return redact(value);
  if (type === "number" || type === "boolean") return value;
  if (type === "function" || type === "symbol" || type === "bigint") return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizeData(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (!isPlainObject(value)) return null;

  const output = {};

  for (const [key, child] of Object.entries(value)) {
    if (
      SENSITIVE_KEYS.has(normalizeKey(key)) ||
      /(token|authorization|cookie|password|pwd|secret|credential|jwt|bearer|refresh|access|api[_-]?key|connection[_-]?string|sas|session[_-]?id|^_rid$|^_self$|^_etag$|^_attachments$|^_ts$)/i.test(key)
    ) {
      output[key] = child ? "***" : null;
      continue;
    }

    const clean = sanitizeData(child, depth + 1);

    if (clean !== undefined) {
      output[key] = clean;
    }
  }

  return output;
}

/* =========================================================
   API URL
========================================================= */

function getApiOrigin() {
  return getApiBase();
}

function endpointToPath(endpoint = "/") {
  const raw = cleanText(endpoint, "");

  if (!raw) return "";

  try {
    return endpointPathFromUrlLike(raw) || "";
  } catch {
    return "";
  }
}

function endpointPathOnly(endpoint = "/") {
  try {
    return normalizeEndpointPath(endpointToPath(endpoint)) || "";
  } catch {
    return "";
  }
}

function appendQuery(url = "", query = null) {
  const parsed = new URL(url);

  if (isPlainObject(query)) {
    for (const [key, value] of Object.entries(query)) {
      if (SENSITIVE_KEYS.has(normalizeKey(key))) continue;
      if (value === undefined || value === null || value === "") continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null && item !== "") {
            parsed.searchParams.append(key, String(item));
          }
        }

        continue;
      }

      parsed.searchParams.set(key, String(value));
    }
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) {
      parsed.searchParams.delete(key);
    }
  }

  return parsed.toString();
}

export function buildApiUrl(endpoint = "/", options = {}) {
  const path = endpointToPath(endpoint);

  if (!path) return "";

  const base = getApiOrigin().replace(/\/+$/g, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  return appendQuery(`${base}${cleanPath}`, options.query || options.params || null);
}

export function redactHttpText(value = "") {
  return redact(value);
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

function readCoreState() {
  if (!appCore) return null;

  try {
    if (isFunction(appCore.getState)) {
      return appCore.getState({
        includeToken: true,
      });
    }
  } catch {
    // fallback abajo
  }

  return isObject(appCore.state) ? appCore.state : null;
}

export function getAccessToken() {
  const state = readCoreState();

  if (!isObject(state)) return "";

  return cleanToken(
    first(
      state.token,
      state.accessToken,
      state.access_token,
      ""
    )
  );
}

export function setAccessToken(token = "") {
  const value = cleanToken(token);

  try {
    appCore?.setToken?.(value || null);
  } catch {
    // noop
  }

  return value;
}

export function clearAuthTokens() {
  try {
    appCore?.setToken?.(null);
  } catch {
    // noop
  }

  return true;
}

export function setAuthTokens(payload = {}) {
  const token = cleanToken(
    first(
      payload?.token,
      payload?.accessToken,
      payload?.access_token,
      payload?.data?.token,
      payload?.data?.accessToken,
      payload?.data?.access_token,
      ""
    )
  );

  if (token) {
    setAccessToken(token);
  }

  return {
    token,
    accessToken: token,
    access_token: token,
  };
}

/* =========================================================
   AUTH POLICY
========================================================= */

function endpointIsPublic(endpoint = "") {
  const path = endpointPathOnly(endpoint);

  if (!path) return false;

  try {
    return configIsPublicApiPath(path) === true;
  } catch {
    return false;
  }
}

function endpointIsPrivate(endpoint = "") {
  const path = endpointPathOnly(endpoint);

  if (!path) return false;

  try {
    return configIsPrivateApiPath(path) === true;
  } catch {
    return false;
  }
}

function shouldUseAuth(endpoint = "", options = {}) {
  if (
    options.auth === false ||
    options.public === true ||
    options.skipAuth === true ||
    options.noAuthHeader === true
  ) {
    return false;
  }

  if (options.auth === true) {
    return true;
  }

  if (endpointIsPrivate(endpoint)) {
    return true;
  }

  if (endpointIsPublic(endpoint)) {
    return false;
  }

  return true;
}

/* =========================================================
   HEADERS / BODY
========================================================= */

function headersFrom(input = null) {
  const headers = {};

  if (!input) return headers;

  if (typeof Headers !== "undefined" && input instanceof Headers) {
    input.forEach((value, key) => {
      headers[key] = value;
    });

    return headers;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      if (!Array.isArray(item) || item.length < 2) continue;

      const key = cleanText(item[0], "");
      const value = item[1];

      if (key) headers[key] = value;
    }

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

  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function setHeader(headers = {}, name = "", value = "") {
  const target = cleanText(name, "");

  if (!target) return headers;

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target.toLowerCase()) {
      headers[key] = value;
      return headers;
    }
  }

  headers[target] = value;
  return headers;
}

function deleteHeader(headers = {}, name = "") {
  const target = cleanText(name, "").toLowerCase();

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      delete headers[key];
    }
  }

  return headers;
}

function isBodyInit(value) {
  if (value === undefined || value === null) return false;

  if (typeof FormData !== "undefined" && value instanceof FormData) return true;
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView?.(value)) return true;
  if (typeof value === "string") return true;

  return false;
}

function normalizeBody(body = undefined, headers = {}) {
  if (body === undefined || body === null) {
    return {
      body: undefined,
      headers,
    };
  }

  if (isBodyInit(body)) {
    return {
      body,
      headers,
    };
  }

  if (isPlainObject(body) || Array.isArray(body)) {
    if (!hasHeader(headers, "Content-Type")) {
      setHeader(headers, "Content-Type", "application/json");
    }

    return {
      body: JSON.stringify(body),
      headers,
    };
  }

  if (!hasHeader(headers, "Content-Type")) {
    setHeader(headers, "Content-Type", "text/plain;charset=UTF-8");
  }

  return {
    body: String(body),
    headers,
  };
}

function buildFetchOptions(endpoint = "", options = {}) {
  const method = cleanText(options.method, "GET").toUpperCase();

  if (!VALID_METHODS.has(method)) {
    throw createHttpError({
      code: "HTTP_METHOD_INVALID",
      message: `Método HTTP no permitido: ${method}`,
      endpoint,
    });
  }

  const headers = headersFrom(options.headers);

  if (!hasHeader(headers, "Accept")) {
    setHeader(headers, "Accept", "application/json, text/plain, */*");
  }

  if (shouldUseAuth(endpoint, options)) {
    const token = getAccessToken();

    if (token) {
      setHeader(headers, "Authorization", `Bearer ${token}`);
    } else {
      deleteHeader(headers, "Authorization");
    }
  } else {
    deleteHeader(headers, "Authorization");
  }

  let body = undefined;

  if (!BODYLESS_METHODS.has(method)) {
    const normalized = normalizeBody(options.body, headers);
    body = normalized.body;
  }

  return {
    method,
    headers,
    body,
    credentials: options.credentials || "include",
    cache: options.cache || "no-store",
    mode: options.mode || "cors",
    redirect: options.redirect || "follow",
  };
}

/* =========================================================
   RESPONSE
========================================================= */

function contentTypeOf(response) {
  try {
    return response.headers.get("content-type") || "";
  } catch {
    return "";
  }
}

function dispositionFilename(response) {
  try {
    const disposition = response.headers.get("content-disposition") || "";

    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);

    if (utf8?.[1]) {
      return decodeURIComponent(utf8[1]).replace(/["]/g, "");
    }

    const ascii = disposition.match(/filename="?([^";]+)"?/i);

    if (ascii?.[1]) {
      return ascii[1].replace(/["]/g, "");
    }
  } catch {
    // noop
  }

  return "";
}

async function parseResponse(response, options = {}) {
  const method = cleanText(options.method, "GET").toUpperCase();

  if (response.status === 204 || response.status === 205 || method === "HEAD") {
    return null;
  }

  const responseType = cleanText(options.responseType, "").toLowerCase();

  if (responseType === "blob") return response.blob();
  if (responseType === "arraybuffer" || responseType === "array-buffer") return response.arrayBuffer();
  if (responseType === "text") return response.text();

  const contentType = contentTypeOf(response).toLowerCase();

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    const text = await response.text();

    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  if (
    contentType.startsWith("text/") ||
    contentType.includes("xml") ||
    contentType.includes("html")
  ) {
    return response.text();
  }

  try {
    return await response.blob();
  } catch {
    return response.text();
  }
}

/* =========================================================
   ERRORS
========================================================= */

function extractErrorCode(payload = null, response = null) {
  if (isObject(payload)) {
    return normalizeCode(
      first(
        payload.code,
        payload.error,
        payload.status,
        payload.name,
        ""
      )
    );
  }

  if (response?.status === 401) return "UNAUTHORIZED";
  if (response?.status === 403) return "FORBIDDEN";
  if (response?.status === 404) return "NOT_FOUND";
  if (response?.status === 429) return "TOO_MANY_REQUESTS";
  if (response?.status >= 500) return "SERVER_ERROR";

  return "HTTP_ERROR";
}

function extractErrorMessage(payload = null, fallback = "Error HTTP") {
  if (isObject(payload)) {
    return cleanText(
      first(
        payload.message,
        payload.error_description,
        payload.detail,
        payload.title,
        payload.error,
        ""
      ),
      fallback
    );
  }

  if (typeof payload === "string") {
    return cleanText(payload, fallback);
  }

  return fallback;
}

function createHttpError({
  code = "HTTP_ERROR",
  message = "Error HTTP",
  status = 0,
  endpoint = "",
  url = "",
  method = "",
  payload = null,
  response = null,
  cause = null,
} = {}) {
  const error = new Error(cleanText(message, "Error HTTP"));

  error.name = "HttpError";
  error.code = normalizeCode(code);
  error.status = Number(status || response?.status || 0);
  error.statusCode = error.status;
  error.endpoint = redact(endpoint);
  error.url = redact(url);
  error.method = cleanText(method, "");
  error.payload = sanitizeData(payload);
  error.data = error.payload;
  error.response = response || null;
  error.cause = cause || null;

  return error;
}

function isRefreshEndpoint(endpoint = "") {
  const path = endpointPathOnly(endpoint);
  return path === endpointPathOnly(AUTH_ENDPOINTS.refresh);
}

export function isAuthError(error = null) {
  const status = Number(error?.status || error?.statusCode || 0);
  return status === 401 || status === 403;
}

export function isRefreshableAuthError(error = null) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = normalizeCode(error?.code || error?.payload?.code || error?.payload?.error || "");

  if (status !== 401) return false;
  if (isRefreshEndpoint(error?.endpoint || "")) return false;
  if (shouldClearSessionForAuthError(error)) return false;

  return (
    !code ||
    code === "UNAUTHORIZED" ||
    code === "AUTH_REQUIRED" ||
    code === "SESSION_REQUIRED" ||
    code === "TOKEN_EXPIRED" ||
    code === "ACCESS_TOKEN_EXPIRED" ||
    code === "JWT_EXPIRED"
  );
}

export function shouldClearSessionForAuthError(error = null) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = normalizeCode(error?.code || error?.payload?.code || error?.payload?.error || "");

  if (isRefreshEndpoint(error?.endpoint || "") && status === 401) return true;

  return (
    code === "SESSION_REVOKED" ||
    code === "SESSION_INVALID" ||
    code === "SESSION_NOT_FOUND" ||
    code === "USER_DISABLED" ||
    code === "USER_DESACTIVADO" ||
    code === "USUARIO_DESACTIVADO"
  );
}

/* =========================================================
   REQUEST
========================================================= */

function ensureFetch() {
  if (typeof fetch !== "function") {
    throw createHttpError({
      code: "FETCH_UNAVAILABLE",
      message: "fetch() no está disponible.",
    });
  }

  return fetch;
}

function createAbortController(timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (typeof AbortController === "undefined") {
    return {
      controller: null,
      timer: null,
    };
  }

  const timeout = Math.max(1000, Number(timeoutMs || DEFAULT_TIMEOUT_MS));

  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // noop
    }
  }, timeout);

  return {
    controller,
    timer,
  };
}

async function fetchParsed(endpoint = "/", options = {}) {
  const url = buildApiUrl(endpoint, options);

  if (!url) {
    throw createHttpError({
      code: "HTTP_ENDPOINT_INVALID",
      message: "Endpoint API inválido.",
      endpoint,
    });
  }

  const method = cleanText(options.method, "GET").toUpperCase();

  const fetchOptions = buildFetchOptions(endpoint, {
    ...options,
    method,
  });

  const abort = createAbortController(
    Number(options.timeout || options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  );

  if (abort.controller) {
    fetchOptions.signal = options.signal || abort.controller.signal;
  } else if (options.signal) {
    fetchOptions.signal = options.signal;
  }

  stats.total += 1;
  stats.lastMethod = method;
  stats.lastUrl = redact(url);
  stats.lastStatus = null;
  stats.lastError = null;

  try {
    const response = await ensureFetch()(url, fetchOptions);
    const data = await parseResponse(response, {
      ...options,
      method,
    });

    stats.lastStatus = response.status;

    if (!response.ok) {
      throw createHttpError({
        code: extractErrorCode(data, response),
        message: extractErrorMessage(data, `HTTP ${response.status}`),
        status: response.status,
        endpoint,
        url,
        method,
        payload: data,
        response,
      });
    }

    stats.success += 1;

    return {
      response,
      data,
      url,
      method,
    };
  } catch (error) {
    const normalized = error?.name === "HttpError"
      ? error
      : createHttpError({
          code: error?.name === "AbortError" ? "HTTP_TIMEOUT" : "NETWORK_ERROR",
          message:
            error?.name === "AbortError"
              ? "La solicitud ha tardado demasiado."
              : error?.message || "No se pudo conectar con la API.",
          endpoint,
          url,
          method,
          cause: error,
        });

    stats.error += 1;
    stats.lastError = {
      code: normalized.code,
      status: normalized.status,
      message: redact(normalized.message),
      endpoint: redact(endpoint),
    };

    throw normalized;
  } finally {
    if (abort.timer) {
      clearTimeout(abort.timer);
    }
  }
}

export async function request(endpoint = "/", options = {}) {
  const result = await fetchParsed(endpoint, options);
  return result.data;
}

/* =========================================================
   METHODS
========================================================= */

export function get(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...options,
    method: "GET",
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

export { del as delete };

/* =========================================================
   AUTH ENDPOINT HELPERS
========================================================= */

export function login(payload = {}, options = {}) {
  return post(AUTH_ENDPOINTS.login, payload, {
    ...options,
    public: true,
    auth: false,
    noAuthHeader: true,
  });
}

export function logout(options = {}) {
  return post(AUTH_ENDPOINTS.logout, {}, {
    ...options,
    auth: true,
  });
}

export function logoutAll(options = {}) {
  return post(AUTH_ENDPOINTS.logoutAll, {}, {
    ...options,
    auth: true,
  });
}

export function me(options = {}) {
  return get(AUTH_ENDPOINTS.me, {
    ...options,
    auth: true,
  });
}

export function refreshSession(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.refresh, body, {
    ...options,
    public: true,
    auth: false,
    noAuthHeader: true,
  });
}

export function activateAccount(payload = {}, options = {}) {
  return post(AUTH_ENDPOINTS.activateAccount, payload, {
    ...options,
    public: true,
    auth: false,
    noAuthHeader: true,
  });
}

export function requestPasswordReset(payload = {}, options = {}) {
  return post(AUTH_ENDPOINTS.requestPasswordReset, payload, {
    ...options,
    public: true,
    auth: false,
    noAuthHeader: true,
  });
}

export function confirmPasswordReset(payload = {}, options = {}) {
  return post(AUTH_ENDPOINTS.confirmPasswordReset, payload, {
    ...options,
    public: true,
    auth: false,
    noAuthHeader: true,
  });
}

/* =========================================================
   BLOBS / DOWNLOADS
========================================================= */

function safeFileName(value = "", fallback = "descarga") {
  const name = cleanText(value, fallback)
    .replace(/[\\/:*?"<>|#]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 180);

  return name || fallback;
}

export async function blob(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...options,
    method: options.method || "GET",
    responseType: "blob",
  });
}

export async function arrayBuffer(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...options,
    method: options.method || "GET",
    responseType: "arrayBuffer",
  });
}

export async function downloadBlob(endpoint = "/", options = {}) {
  const result = await fetchParsed(endpoint, {
    ...options,
    method: options.method || "GET",
    responseType: "blob",
  });

  const data = result.data;
  const filename = safeFileName(
    options.filename || dispositionFilename(result.response) || "descarga",
    "descarga"
  );

  if (options.autoDownload !== false && isBrowser() && data instanceof Blob) {
    const objectUrl = URL.createObjectURL(data);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = filename;
    link.rel = "noopener";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  return {
    ok: true,
    blob: data,
    filename,
    contentType: contentTypeOf(result.response),
    size: data?.size || null,
  };
}

export const download = downloadBlob;
export const downloadFactura = downloadBlob;

/* =========================================================
   INSTALL / SNAPSHOT
========================================================= */

export function install(core = null) {
  appCore = core || appCore;

  try {
    appCore?.registerModule?.("http", Http, {
      overwrite: true,
    });
  } catch {
    // noop
  }

  return Http;
}

export function getSnapshot() {
  return {
    version: HTTP_VERSION,
    apiBase: getApiOrigin(),
    installed: Boolean(appCore),
    hasToken: Boolean(getAccessToken()),
    endpoints: AUTH_ENDPOINTS,
    stats: {
      total: stats.total,
      success: stats.success,
      error: stats.error,
      lastMethod: stats.lastMethod,
      lastUrl: redact(stats.lastUrl),
      lastStatus: stats.lastStatus,
      lastError: sanitizeData(stats.lastError),
    },
    policy: {
      singleClient: true,
      configDriven: true,
      credentialsInclude: true,
      noAutoRefresh: true,
      noRouter: true,
      noToast: true,
      noStore: true,
      noServices: true,
      noStorage: true,
    },
  };
}

export const getDebugSnapshot = getSnapshot;
export const snapshot = getSnapshot;

/* =========================================================
   API
========================================================= */

export const Http = {
  version: HTTP_VERSION,

  AUTH_ENDPOINTS,

  install,

  getApiOrigin,
  buildApiUrl,

  request,
  get,
  post,
  put,
  patch,
  delete: del,
  del,

  login,
  logout,
  logoutAll,
  me,
  refreshSession,

  activateAccount,
  requestPasswordReset,
  confirmPasswordReset,

  blob,
  arrayBuffer,
  downloadBlob,
  download,
  downloadFactura,

  getAccessToken,
  setAccessToken,
  setAuthTokens,
  clearAuthTokens,

  isAuthError,
  isRefreshableAuthError,
  shouldClearSessionForAuthError,

  redactHttpText,

  getSnapshot,
  getDebugSnapshot,
  snapshot,
};

export default Http;
