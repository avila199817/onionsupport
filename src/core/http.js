/* =========================================================
   Onion Support - Core HTTP
   Archivo: /src/core/http.js

   Responsabilidad:
   - Cliente HTTP único de la SPA.
   - API real: https://api.onionit.net salvo config explícita.
   - Enviar credentials: "include".
   - Enviar Authorization sólo si hay access token en memoria.
   - Parsear JSON/text/blob/arrayBuffer.
   - Descargar blobs para facturas/documentos.
   - Clasificar errores auth sin decidir navegación.
   - Sin Router.
   - Sin Toast.
   - Sin Store.
   - Sin Services.
   - Sin storage.
   - Sin refresh automático.
========================================================= */

import * as ConfigModule from "./config.js";

export const HTTP_VERSION = "core.http.minimal.v2";

const config = ConfigModule.config || ConfigModule.default || {};

const DEFAULT_API_ORIGIN = "https://api.onionit.net";
const DEFAULT_TIMEOUT_MS =
  Number(config?.api?.timeout || config?.timeout || 30000) || 30000;

const RAW_AUTH_ENDPOINTS = {
  ...(config?.auth?.endpoints || {}),
  ...(config?.endpoints?.auth || {}),
  ...(ConfigModule.AUTH_ENDPOINTS || {}),
};

export const AUTH_ENDPOINTS = Object.freeze({
  login: first(RAW_AUTH_ENDPOINTS.login, "/api/auth/login"),
  logout: first(RAW_AUTH_ENDPOINTS.logout, "/api/auth/logout"),
  logoutAll: first(RAW_AUTH_ENDPOINTS.logoutAll, RAW_AUTH_ENDPOINTS.logout_all, "/api/auth/logout-all"),
  me: first(RAW_AUTH_ENDPOINTS.me, "/api/auth/me"),
  refresh: first(RAW_AUTH_ENDPOINTS.refresh, "/api/auth/refresh"),

  activateAccount: first(
    RAW_AUTH_ENDPOINTS.activateAccount,
    RAW_AUTH_ENDPOINTS.activate_account,
    RAW_AUTH_ENDPOINTS.activate,
    "/api/auth/activate-account"
  ),

  requestPasswordReset: first(
    RAW_AUTH_ENDPOINTS.requestPasswordReset,
    RAW_AUTH_ENDPOINTS.passwordRequest,
    RAW_AUTH_ENDPOINTS.password_request,
    RAW_AUTH_ENDPOINTS.resetPasswordRequest,
    "/api/auth/password-request"
  ),

  confirmPasswordReset: first(
    RAW_AUTH_ENDPOINTS.confirmPasswordReset,
    RAW_AUTH_ENDPOINTS.passwordReset,
    RAW_AUTH_ENDPOINTS.password_reset,
    RAW_AUTH_ENDPOINTS.resetPasswordConfirm,
    "/api/auth/password-reset"
  ),
});

const PUBLIC_API_PATHS = new Set(
  [
    ...(Array.isArray(config?.api?.publicPaths) ? config.api.publicPaths : []),
    ...(Array.isArray(ConfigModule.PUBLIC_API_PATHS) ? ConfigModule.PUBLIC_API_PATHS : []),

    AUTH_ENDPOINTS.login,
    AUTH_ENDPOINTS.refresh,
    "/api/auth/token/refresh",
    "/api/auth/renew",
    AUTH_ENDPOINTS.activateAccount,
    "/api/auth/activate",
    AUTH_ENDPOINTS.requestPasswordReset,
    "/api/auth/reset-password-request",
    AUTH_ENDPOINTS.confirmPasswordReset,
    "/api/auth/reset-password-confirm",
    "/api/auth/reset-password/confirm",
  ]
    .map(cleanApiPath)
    .filter(Boolean)
);

const PRIVATE_API_PATHS = new Set(
  [
    ...(Array.isArray(config?.api?.privatePaths) ? config.api.privatePaths : []),
    ...(Array.isArray(ConfigModule.PRIVATE_API_PATHS) ? ConfigModule.PRIVATE_API_PATHS : []),

    AUTH_ENDPOINTS.me,
    AUTH_ENDPOINTS.logout,
    AUTH_ENDPOINTS.logoutAll,
  ]
    .map(cleanApiPath)
    .filter(Boolean)
);

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "jwt",
  "authorization",
  "session",
  "session_id",
  "sessionid",
  "code",
  "secret",
  "password",
  "pwd",
  "key",
  "sig",
  "signature",
  "reset_token",
  "resettoken",
  "activation_token",
  "activationtoken",
]);

const AUTH_REFRESHABLE_CODES = new Set([
  "TOKEN_EXPIRED",
  "ACCESS_TOKEN_EXPIRED",
  "JWT_EXPIRED",
  "TOKEN_STALE",
  "AUTH_REQUIRED",
  "SESSION_REQUIRED",
  "UNAUTHORIZED",
]);

const AUTH_CLEAR_SESSION_CODES = new Set([
  "SESSION_REVOKED",
  "SESSION_INVALID",
  "SESSION_NOT_FOUND",
  "INVALID_REFRESH_TOKEN",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_REVOKED",
  "USER_DISABLED",
  "USER_DESACTIVADO",
  "USUARIO_DESACTIVADO",
]);

const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

let apiOrigin = resolveInitialApiOrigin();
let appCore = null;

const runtime = {
  accessToken: "",
};

const stats = {
  total: 0,
  success: 0,
  error: 0,
  lastUrl: "",
  lastMethod: "",
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

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return null;
}

function normalizeCode(value = "") {
  return cleanText(value, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function cleanApiPath(value = "") {
  let raw = cleanText(value, "");

  if (!raw) return "";

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      raw = `${url.pathname}${url.search || ""}`;
    }
  } catch {
    return "";
  }

  raw = raw.split("#")[0] || "";

  const queryIndex = raw.indexOf("?");
  const pathname = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;

  let path = pathname.startsWith("/") ? pathname : `/${pathname}`;

  path = path.replace(/\/{2,}/g, "/");

  if (path.length > 1) {
    path = path.replace(/\/+$/g, "");
  }

  return path || "/";
}

function redact(value = "") {
  let text = cleanText(value, "");

  try {
    const parsed = new URL(text, "https://onionsupport.local");

    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
        parsed.searchParams.set(key, "***");
      }
    }

    text = /^https?:\/\//i.test(text)
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}${parsed.hash}`;
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
      /(token|authorization|cookie|password|pwd|secret|credential|jwt|bearer|refresh|access|idtoken|api[_-]?key|connection[_-]?string|sas|otp|totp|mfa|twofa|2fa|backup[_-]?code|session[_-]?id|^_rid$|^_self$|^_etag$|^_attachments$|^_ts$)/i.test(key) ||
      SENSITIVE_QUERY_KEYS.has(normalizeKey(key))
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
   ORIGIN / URL
========================================================= */

function resolveConfigApiBase() {
  try {
    if (isFunction(ConfigModule.getApiBase)) {
      const value = ConfigModule.getApiBase();

      if (value) return value;
    }
  } catch {
    // fallback abajo
  }

  return first(
    config?.apiBase,
    config?.apiOrigin,
    config?.api?.baseUrl,
    config?.api?.base,
    config?.api?.origin,
    ConfigModule.API_BASE_URL,
    ConfigModule.API_ORIGIN,
    DEFAULT_API_ORIGIN
  );
}

function normalizeOrigin(value = "") {
  const raw = cleanText(value, DEFAULT_API_ORIGIN).replace(/\/+$/g, "");

  try {
    const url = new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return DEFAULT_API_ORIGIN;
    }

    return url.origin;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

function resolveInitialApiOrigin() {
  return normalizeOrigin(resolveConfigApiBase());
}

export function getApiOrigin() {
  return apiOrigin;
}

export function setApiOrigin(value = "") {
  apiOrigin = normalizeOrigin(value || DEFAULT_API_ORIGIN);
  return apiOrigin;
}

function cleanSearch(search = "") {
  const raw = cleanText(search, "");

  if (!raw || raw === "?") return "";

  const normalized = raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;

  try {
    const params = new URLSearchParams(normalized);

    for (const key of [...params.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
        params.delete(key);
      }
    }

    const output = params.toString();

    return output ? `?${output}` : "";
  } catch {
    return "";
  }
}

function endpointToPath(endpoint = "/") {
  const raw = cleanText(endpoint, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);

      if (url.origin !== apiOrigin) {
        return "";
      }

      return `${url.pathname || "/"}${cleanSearch(url.search)}`;
    }
  } catch {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";

  const withoutHash = raw.split("#")[0] || "";
  const queryIndex = withoutHash.indexOf("?");

  const rawPath = queryIndex >= 0
    ? withoutHash.slice(0, queryIndex)
    : withoutHash;

  const rawSearch = queryIndex >= 0
    ? withoutHash.slice(queryIndex)
    : "";

  let path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

  path = path.replace(/\/{2,}/g, "/");

  if (path.length > 1) {
    path = path.replace(/\/+$/g, "");
  }

  return `${path || "/"}${cleanSearch(rawSearch)}`;
}

function appendQuery(url = "", query = null) {
  const parsed = new URL(url);

  if (isObject(query)) {
    for (const [key, value] of Object.entries(query)) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) continue;
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
    if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
      parsed.searchParams.delete(key);
    }
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

function stateAccessToken(state = readCoreState()) {
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

export function getAccessToken() {
  return stateAccessToken() || cleanToken(runtime.accessToken);
}

export function setAccessToken(token = "") {
  const value = cleanToken(token);

  runtime.accessToken = value;

  return value;
}

export function setAuthTokens(payload = {}) {
  const token = accessTokenFromPayload(payload);

  if (token) {
    setAccessToken(token);
  }

  return {
    token: getAccessToken(),
    accessToken: getAccessToken(),
    access_token: getAccessToken(),
  };
}

export function clearAuthTokens() {
  runtime.accessToken = "";
  return true;
}

function accessTokenFromPayload(payload = {}) {
  const candidates = [
    payload,
    isObject(payload?.data) ? payload.data : null,
    isObject(payload?.payload) ? payload.payload : null,
    isObject(payload?.result) ? payload.result : null,
    isObject(payload?.auth) ? payload.auth : null,
    isObject(payload?.session) ? payload.session : null,
  ].filter(Boolean);

  for (const source of candidates) {
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

/* =========================================================
   AUTH POLICY
========================================================= */

function endpointCleanPath(endpoint = "/") {
  const path = endpointToPath(endpoint);

  if (!path) return "";

  return cleanApiPath(path);
}

function endpointIsPrivate(endpoint = "") {
  const clean = endpointCleanPath(endpoint);

  if (!clean) return false;

  return PRIVATE_API_PATHS.has(clean);
}

function endpointIsPublic(endpoint = "") {
  const clean = endpointCleanPath(endpoint);

  if (!clean) return false;
  if (endpointIsPrivate(clean)) return false;

  return PUBLIC_API_PATHS.has(clean);
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

  if (options.auth === true || endpointIsPrivate(endpoint)) {
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

      if (key) {
        headers[key] = value;
      }
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
  if (value === null || value === undefined) return false;

  if (typeof FormData !== "undefined" && value instanceof FormData) return true;
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true;
  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) return true;
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

  if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(method)) {
    throw createHttpError({
      code: "HTTP_METHOD_INVALID",
      message: `Método HTTP no permitido: ${method}`,
      status: 0,
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

  if (!METHODS_WITHOUT_BODY.has(method)) {
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
   RESPONSE PARSE
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
  if (response.status === 204 || response.status === 205 || options.method === "HEAD") {
    return null;
  }

  const responseType = cleanText(options.responseType, "").toLowerCase();

  if (responseType === "blob") {
    return response.blob();
  }

  if (responseType === "arraybuffer" || responseType === "array-buffer") {
    return response.arrayBuffer();
  }

  if (responseType === "text") {
    return response.text();
  }

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

  if (typeof payload === "string") {
    return normalizeCode(payload.slice(0, 80));
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
  error.code = normalizeCode(code || "HTTP_ERROR");
  error.status = Number(status || response?.status || 0);
  error.statusCode = error.status;
  error.endpoint = redact(endpoint || "");
  error.url = redact(url || "");
  error.method = cleanText(method, "");
  error.payload = sanitizeData(payload);
  error.data = error.payload;
  error.response = response || null;
  error.cause = cause || null;
  error.auth = isAuthError(error);

  return error;
}

function isAuthEndpoint(endpoint = "") {
  return cleanApiPath(endpoint).startsWith("/api/auth");
}

function isRefreshEndpoint(endpoint = "") {
  const clean = cleanApiPath(endpoint);

  return [
    cleanApiPath(AUTH_ENDPOINTS.refresh),
    "/api/auth/token/refresh",
    "/api/auth/renew",
  ].includes(clean);
}

function isAuthError(error = null) {
  const status = Number(error?.status || error?.statusCode || 0);
  return status === 401 || status === 403;
}

export function isRefreshableAuthError(error = null) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = normalizeCode(error?.code || error?.payload?.code || error?.payload?.error || "");

  if (status !== 401) return false;
  if (isRefreshEndpoint(error?.endpoint || "")) return false;
  if (AUTH_CLEAR_SESSION_CODES.has(code)) return false;

  return !code || AUTH_REFRESHABLE_CODES.has(code);
}

export function shouldClearSessionForAuthError(error = null) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = normalizeCode(error?.code || error?.payload?.code || error?.payload?.error || "");

  if (status === 403 && code.includes("DISABLED")) return true;
  if (isRefreshEndpoint(error?.endpoint || "") && status === 401) return true;

  return AUTH_CLEAR_SESSION_CODES.has(code);
}

/* =========================================================
   REQUEST
========================================================= */

function ensureFetch() {
  if (typeof fetch !== "function") {
    throw createHttpError({
      code: "FETCH_UNAVAILABLE",
      message: "fetch() no está disponible.",
      status: 0,
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

export async function request(endpoint = "/", options = {}) {
  const url = buildApiUrl(endpoint, options);

  if (!url) {
    throw createHttpError({
      code: "HTTP_ENDPOINT_INVALID",
      message: "Endpoint API inválido.",
      status: 0,
      endpoint,
    });
  }

  const method = cleanText(options.method, "GET").toUpperCase();
  const fetchOptions = buildFetchOptions(endpoint, {
    ...options,
    method,
  });

  const timeoutMs = Number(options.timeout || options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const abort = createAbortController(timeoutMs);

  if (abort.controller) {
    fetchOptions.signal = options.signal || abort.controller.signal;
  } else if (options.signal) {
    fetchOptions.signal = options.signal;
  }

  stats.total += 1;
  stats.lastUrl = redact(url);
  stats.lastMethod = method;
  stats.lastStatus = null;
  stats.lastError = null;

  try {
    const fetchFn = ensureFetch();
    const response = await fetchFn(url, fetchOptions);
    const data = await parseResponse(response, {
      ...options,
      method,
    });

    stats.lastStatus = response.status;

    if (!response.ok) {
      const code = extractErrorCode(data, response);
      const message = extractErrorMessage(data, `HTTP ${response.status}`);

      throw createHttpError({
        code,
        message,
        status: response.status,
        endpoint,
        url,
        method,
        payload: data,
        response,
      });
    }

    if (isObject(data)) {
      setAuthTokens(data);
    }

    stats.success += 1;
    return data;
  } catch (error) {
    const normalized =
      error?.name === "HttpError"
        ? error
        : createHttpError({
            code: error?.name === "AbortError" ? "HTTP_TIMEOUT" : "NETWORK_ERROR",
            message:
              error?.name === "AbortError"
                ? "La solicitud ha tardado demasiado."
                : error?.message || "No se pudo conectar con la API.",
            status: 0,
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

/* =========================================================
   METHOD HELPERS
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
   AUTH HELPERS
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
   BLOB / DOWNLOADS
========================================================= */

function fallbackFileName(value = "", fallback = "descarga") {
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
  const url = buildApiUrl(endpoint, options);

  if (!url) {
    throw createHttpError({
      code: "HTTP_ENDPOINT_INVALID",
      message: "Endpoint API inválido.",
      status: 0,
      endpoint,
    });
  }

  const method = cleanText(options.method, "GET").toUpperCase();
  const fetchOptions = buildFetchOptions(endpoint, {
    ...options,
    method,
  });

  const timeoutMs = Number(options.timeout || options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const abort = createAbortController(timeoutMs);

  if (abort.controller) {
    fetchOptions.signal = options.signal || abort.controller.signal;
  } else if (options.signal) {
    fetchOptions.signal = options.signal;
  }

  try {
    const response = await ensureFetch()(url, fetchOptions);
    const data = await parseResponse(response, {
      ...options,
      method,
      responseType: "blob",
    });

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

    const filename = fallbackFileName(
      options.filename ||
        dispositionFilename(response) ||
        "descarga",
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
      contentType: contentTypeOf(response),
      size: data?.size || null,
    };
  } finally {
    if (abort.timer) {
      clearTimeout(abort.timer);
    }
  }
}

export const download = downloadBlob;
export const downloadFactura = downloadBlob;

/* =========================================================
   INSTALL / SNAPSHOT
========================================================= */

export function install(core = null) {
  if (core) {
    appCore = core;
  }

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
    apiOrigin,
    installed: Boolean(appCore),
    hasRuntimeToken: Boolean(runtime.accessToken),
    hasCoreToken: Boolean(stateAccessToken()),
    endpoints: AUTH_ENDPOINTS,
    stats: {
      ...stats,
      lastUrl: redact(stats.lastUrl),
      lastError: sanitizeData(stats.lastError),
    },
    policy: {
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
   DEFAULT EXPORT
========================================================= */

export const Http = {
  version: HTTP_VERSION,

  AUTH_ENDPOINTS,

  install,

  getApiOrigin,
  setApiOrigin,
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
