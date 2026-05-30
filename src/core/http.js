/* =========================================================
   Onion Support - Core HTTP
   Archivo: /src/core/http.js

   Responsabilidad:
   - Cliente HTTP único de la SPA.
   - Usar la API real configurada o https://api.onionit.net.
   - Enviar credentials: "include".
   - Enviar Authorization sólo si hay access token.
   - Parsear JSON/text/blob.
   - Descargar blobs para facturas.
   - Clasificar errores auth sin decidir navegación.
   - Sin core/request.js, sin services, sin interceptors,
     sin runtime paralelo, sin refresh automático, sin Router,
     sin Toast y sin Storage.
========================================================= */

import * as ConfigModule from "./config.js";

export const HTTP_VERSION = "core.http.minimal.v1";

const config = ConfigModule.config || ConfigModule.default || {};

const DEFAULT_API_FALLBACK = "https://api.onionit.net";
const DEFAULT_TIMEOUT_MS = Number(config?.api?.timeout || config?.timeout || 30000) || 30000;

const RAW_AUTH_ENDPOINTS = {
  ...(config?.auth?.endpoints || {}),
  ...(config?.endpoints?.auth || {}),
  ...(ConfigModule.AUTH_ENDPOINTS || {}),
};

export const AUTH_ENDPOINTS = Object.freeze({
  login: first(RAW_AUTH_ENDPOINTS.login, "/api/auth/login"),
  logout: first(RAW_AUTH_ENDPOINTS.logout, "/api/auth/logout"),
  me: first(RAW_AUTH_ENDPOINTS.me, "/api/auth/me"),
  refresh: first(RAW_AUTH_ENDPOINTS.refresh, "/api/auth/refresh"),

  activate: first(RAW_AUTH_ENDPOINTS.activate, "/api/auth/activate"),
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
    "/api/auth/password-request"
  ),

  confirmPasswordReset: first(
    RAW_AUTH_ENDPOINTS.confirmPasswordReset,
    RAW_AUTH_ENDPOINTS.passwordReset,
    RAW_AUTH_ENDPOINTS.password_reset,
    "/api/auth/password-reset"
  ),
});

const PUBLIC_API_PATHS = new Set(
  [
    ...(Array.isArray(config?.api?.publicPaths) ? config.api.publicPaths : []),
    ...(Array.isArray(ConfigModule.PUBLIC_API_PATHS) ? ConfigModule.PUBLIC_API_PATHS : []),

    AUTH_ENDPOINTS.login,
    AUTH_ENDPOINTS.refresh,
    AUTH_ENDPOINTS.activate,
    AUTH_ENDPOINTS.activateAccount,
    AUTH_ENDPOINTS.requestPasswordReset,
    AUTH_ENDPOINTS.confirmPasswordReset,
  ]
    .map(cleanApiPathLiteral)
    .filter(Boolean)
);

const PRIVATE_API_PATHS = new Set(
  [
    ...(Array.isArray(config?.api?.privatePaths) ? config.api.privatePaths : []),
    ...(Array.isArray(ConfigModule.PRIVATE_API_PATHS) ? ConfigModule.PRIVATE_API_PATHS : []),

    AUTH_ENDPOINTS.me,
    AUTH_ENDPOINTS.logout,
  ]
    .map(cleanApiPathLiteral)
    .filter(Boolean)
);

const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

const REFRESHABLE_AUTH_CODES = new Set([
  "TOKEN_EXPIRED",
  "ACCESS_TOKEN_EXPIRED",
  "JWT_EXPIRED",
  "TOKEN_STALE",
  "INVALID_TOKEN",
  "MISSING_TOKEN",
  "SESSION_REQUIRED",
  "AUTH_REQUIRED",
  "UNAUTHORIZED",
]);

const CLEAR_SESSION_AUTH_CODES = new Set([
  "SESSION_REVOKED",
  "SESSION_INVALID",
  "SESSION_NOT_FOUND",

  "INVALID_REFRESH_TOKEN",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_REVOKED",

  "USER_DISABLED",
  "USER_INACTIVE",
  "USER_SUSPENDED",
  "USER_BLOCKED",
  "USER_BANNED",
  "USER_REVOKED",
  "USER_DELETED",
  "USER_ARCHIVED",

  "USER_DESACTIVADO",
  "USUARIO_DESACTIVADO",
]);

const SENSITIVE_QUERY_KEYS = new Set(
  [
    ...(Array.isArray(config?.sensitiveQueryParams) ? config.sensitiveQueryParams : []),
    ...(Array.isArray(ConfigModule.SENSITIVE_QUERY_PARAMS) ? ConfigModule.SENSITIVE_QUERY_PARAMS : []),

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
  ]
    .map((key) => normalizeKey(key))
    .filter(Boolean)
);

const SENSITIVE_OBJECT_KEY_RE =
  /(token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|access|idtoken|api[_-]?key|private[_-]?key|connection[_-]?string|sas|otp|totp|mfa|twofa|2fa|backup[_-]?code|session[_-]?id|^_rid$|^_self$|^_etag$|^_attachments$|^_ts$)/i;

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
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
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

function normalizeErrorCode(value = "") {
  return cleanText(value, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function cleanApiPathLiteral(value = "") {
  let raw = cleanText(value, "");

  if (!raw) return "";

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      raw = `${url.pathname}${url.search}`;
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

    if (/^https?:\/\//i.test(text)) {
      text = parsed.toString();
    } else {
      text = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
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
    if (SENSITIVE_OBJECT_KEY_RE.test(key) || SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
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
    DEFAULT_API_FALLBACK
  );
}

function normalizeOrigin(value = "") {
  const raw = cleanText(value, DEFAULT_API_FALLBACK).replace(/\/+$/g, "");

  try {
    const url = new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return DEFAULT_API_FALLBACK;
    }

    return url.origin;
  } catch {
    return DEFAULT_API_FALLBACK;
  }
}

function resolveInitialApiOrigin() {
  return normalizeOrigin(resolveConfigApiBase());
}

export function getApiOrigin() {
  return apiOrigin;
}

export function setApiOrigin(value = "") {
  apiOrigin = normalizeOrigin(value || DEFAULT_API_FALLBACK);
  return apiOrigin;
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

function stateExplicitlyCleared(state = readCoreState()) {
  return Boolean(
    isObject(state) &&
      state.hasToken === false &&
      !stateAccessToken(state)
  );
}

function patchCoreToken(token = "", options = {}) {
  if (!appCore) return false;

  const value = cleanToken(token);

  try {
    if (isFunction(appCore.setToken)) {
      appCore.setToken(value, {
        silent: true,
        ...options,
      });
      return true;
    }
  } catch {
    // fallback abajo
  }

  try {
    if (isObject(appCore.state)) {
      appCore.state.token = value || null;
      appCore.state.accessToken = value || null;
      appCore.state.hasToken = Boolean(value);
      return true;
    }
  } catch {
    // noop
  }

  return false;
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

export function getAccessToken() {
  const state = readCoreState();

  if (stateExplicitlyCleared(state)) {
    return "";
  }

  return stateAccessToken(state) || cleanToken(runtime.accessToken);
}

export function setAccessToken(token = "", options = {}) {
  const value = cleanToken(token);

  runtime.accessToken = value;
  patchCoreToken(value, options);

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

export function clearAuthTokens(options = {}) {
  runtime.accessToken = "";

  if (options.clearState === true || options.clearSession === true || options.forceUnauthenticated === true) {
    patchCoreToken("", {
      clearSession: true,
      forceUnauthenticated: true,
    });
  }

  return true;
}

/* =========================================================
   AUTH POLICY
========================================================= */

function endpointCleanPath(endpoint = "/") {
  const path = endpointToPath(endpoint);

  if (!path) return "";

  return cleanApiPathLiteral(path);
}

function endpointIsPrivate(endpoint = "") {
  const clean = endpointCleanPath(endpoint);

  if (!clean) return false;
  if (clean === cleanApiPathLiteral(AUTH_ENDPOINTS.me)) return true;

  return PRIVATE_API_PATHS.has(clean);
}

function endpointIsPublic(endpoint = "") {
  const clean = endpointCleanPath(endpoint);

  if (!clean) return false;
  if (endpointIsPrivate(clean)) return false;

  return PUBLIC_API_PATHS.has(clean);
}

function shouldUseAuth(endpoint = "", options = {}) {
  if (options.auth === false || options.public === true || options.skipAuth === true || options.noAuthHeader === true) {
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

function removeHeader(headers = {}, name = "") {
  const target = cleanText(name, "").toLowerCase();

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      delete headers[key];
    }
  }

  return headers;
}

function buildHeaders(options = {}, auth = false, token = "") {
  const headers = headersFrom(options.headers);

  removeHeader(headers, "authorization");

  if (!hasHeader(headers, "accept")) {
    headers.Accept = "application/json, text/plain, */*";
  }

  const accessToken = cleanToken(token);

  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

function isBodyPayload(value) {
  if (value === undefined || value === null) return false;

  return true;
}

function prepareBody(body = undefined, headers = {}) {
  if (!isBodyPayload(body)) {
    return {
      body: undefined,
      headers,
    };
  }

  if (
    typeof FormData !== "undefined" && body instanceof FormData ||
    typeof Blob !== "undefined" && body instanceof Blob ||
    typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer ||
    typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams ||
    typeof ReadableStream !== "undefined" && body instanceof ReadableStream
  ) {
    return {
      body,
      headers,
    };
  }

  if (isPlainObject(body) || Array.isArray(body)) {
    if (!hasHeader(headers, "content-type")) {
      headers["Content-Type"] = "application/json";
    }

    return {
      body: JSON.stringify(body),
      headers,
    };
  }

  return {
    body,
    headers,
  };
}

/* =========================================================
   ERROR
========================================================= */

export class HttpError extends Error {
  constructor(message = "HTTP_ERROR", options = {}) {
    super(redact(message));

    this.name = "HttpError";
    this.status = Number(options.status || options.statusCode || 0) || 0;
    this.statusCode = this.status;
    this.code = normalizeErrorCode(options.code || "HTTP_ERROR") || "HTTP_ERROR";
    this.method = cleanText(options.method, "");
    this.url = redact(options.url || "");
    this.data = sanitizeData(options.data ?? null);

    this.canRefresh = options.canRefresh === true;
    this.refreshRequired = options.refreshRequired === true;
    this.shouldLogout = options.shouldLogout === true;
    this.clearClientSession = options.clearClientSession === true;
  }
}

function payloadFrom(error = null) {
  if (!error) return {};

  if (isObject(error.data)) return error.data;
  if (isObject(error.body)) return error.body;
  if (isObject(error.payload)) return error.payload;
  if (isObject(error.responseData)) return error.responseData;

  return {};
}

function extractErrorCodeFromPayload(payload = {}) {
  const auth = isObject(payload.auth) ? payload.auth : {};

  return normalizeErrorCode(
    first(
      auth.code,
      auth.error,
      payload.code,
      payload.errorCode,
      payload.error_code,
      payload.error,
      ""
    )
  );
}

function extractErrorMessage(payload = {}, fallback = "HTTP_ERROR") {
  return cleanText(
    first(
      payload.message,
      payload.error_description,
      payload.detail,
      payload.reason,
      payload.error,
      fallback
    ),
    fallback
  );
}

export function getHttpErrorCode(error = null) {
  if (!error) return "";

  return normalizeErrorCode(
    first(
      error.code,
      extractErrorCodeFromPayload(payloadFrom(error)),
      ""
    )
  );
}

export function getHttpStatus(error = null) {
  if (!error) return 0;

  return Number(
    error.status ||
      error.statusCode ||
      error.response?.status ||
      payloadFrom(error).status ||
      payloadFrom(error).statusCode ||
      0
  ) || 0;
}

export function shouldClearSessionForAuthError(error = null) {
  if (!error) return false;

  if (error.shouldLogout === true || error.clearClientSession === true) {
    return true;
  }

  const payload = payloadFrom(error);
  const auth = isObject(payload.auth) ? payload.auth : {};
  const code = getHttpErrorCode(error);

  if (
    payload.clearSession === true ||
    payload.clearClientSession === true ||
    payload.shouldLogout === true ||
    auth.clearSession === true ||
    auth.clearClientSession === true ||
    auth.shouldLogout === true
  ) {
    return true;
  }

  return CLEAR_SESSION_AUTH_CODES.has(code);
}

export function isRefreshableAuthError(error = null) {
  if (!error) return false;
  if (shouldClearSessionForAuthError(error)) return false;

  if (error.canRefresh === true || error.refreshRequired === true) {
    return true;
  }

  const payload = payloadFrom(error);
  const auth = isObject(payload.auth) ? payload.auth : {};
  const code = getHttpErrorCode(error);
  const status = getHttpStatus(error);

  if (
    payload.canRefresh === true ||
    payload.refreshRequired === true ||
    auth.canRefresh === true ||
    auth.refreshRequired === true
  ) {
    return true;
  }

  if (REFRESHABLE_AUTH_CODES.has(code)) {
    return true;
  }

  return status === 401;
}

export function normalizeHttpError(error = null) {
  const payload = payloadFrom(error);
  const code = getHttpErrorCode(error) || "HTTP_ERROR";
  const status = getHttpStatus(error);
  const shouldLogout = shouldClearSessionForAuthError(error);
  const canRefresh = shouldLogout ? false : isRefreshableAuthError(error);

  return {
    name: error?.name || "Error",
    message: redact(error?.message || extractErrorMessage(payload, code)),
    status,
    statusCode: status,
    code,

    canRefresh,
    refreshRequired: canRefresh,
    shouldLogout,
    clearClientSession: shouldLogout,
  };
}

function createResponseError(response, data, url, method) {
  const code = extractErrorCodeFromPayload(data) || `HTTP_${response.status}`;
  const message = extractErrorMessage(data, response.statusText || code);

  const error = new HttpError(message, {
    status: response.status,
    code,
    method,
    url,
    data,
  });

  const normalized = normalizeHttpError(error);

  error.canRefresh = normalized.canRefresh;
  error.refreshRequired = normalized.refreshRequired;
  error.shouldLogout = normalized.shouldLogout;
  error.clearClientSession = normalized.clearClientSession;

  return error;
}

function recordSuccess() {
  stats.success += 1;
}

function recordError(error = null, url = "", method = "") {
  const normalized = normalizeHttpError(error);

  stats.error += 1;
  stats.lastError = {
    name: normalized.name,
    message: redact(normalized.message || String(error || "")),
    status: normalized.status,
    code: normalized.code,
    url: redact(url),
    method,
    canRefresh: normalized.canRefresh,
    shouldLogout: normalized.shouldLogout,
  };

  return normalized;
}

/* =========================================================
   RESPONSE
========================================================= */

async function readResponsePayload(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();

    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return {
        message: text,
      };
    }
  } catch {
    return null;
  }
}

async function parseSuccessResponse(response, options = {}) {
  if (options.raw === true) {
    return response;
  }

  if (response.status === 204 || response.status === 205 || options.method === "HEAD") {
    return null;
  }

  const responseType = cleanText(options.responseType || options.type || "", "").toLowerCase();
  const contentType = response.headers.get("content-type") || "";

  if (responseType === "blob") {
    return response.blob();
  }

  if (responseType === "arraybuffer" || responseType === "array-buffer") {
    return response.arrayBuffer();
  }

  if (responseType === "text") {
    return response.text();
  }

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();

  return text || null;
}

/* =========================================================
   REQUEST
========================================================= */

function normalizeRequestArgs(firstArg = "/", second = {}, third = {}) {
  if (
    typeof firstArg === "string" &&
    ALLOWED_METHODS.has(firstArg.toUpperCase()) &&
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

function normalizeMethod(value = "GET") {
  const method = cleanText(value, "GET").toUpperCase();

  return ALLOWED_METHODS.has(method) ? method : "GET";
}

function publicOptions(options = {}) {
  return {
    ...options,
    credentials: options.credentials || "include",
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
    cache: options.cache || "no-store",
  };
}

function privateOptions(options = {}) {
  return {
    ...options,
    credentials: options.credentials || "include",
    auth: true,
    public: false,
    skipAuth: false,
    noAuthHeader: false,
    cache: options.cache || "no-store",
  };
}

function withTimeout(signal = null, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (typeof AbortController === "undefined") {
    return {
      signal,
      clear: () => {},
    };
  }

  const timeout = Number(timeoutMs || 0);

  if (!timeout || timeout <= 0) {
    return {
      signal,
      clear: () => {},
    };
  }

  const controller = new AbortController();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }

  const timer = window.setTimeout(() => controller.abort(), timeout);

  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timer),
  };
}

export async function request(firstArg = "/", second = {}, third = {}) {
  const parsed = normalizeRequestArgs(firstArg, second, third);
  const options = isObject(parsed.options) ? parsed.options : {};
  const method = normalizeMethod(options.method);
  const endpoint = endpointToPath(parsed.endpoint);
  const url = endpoint ? buildApiUrl(endpoint, options) : "";

  stats.total += 1;
  stats.lastMethod = method;
  stats.lastUrl = redact(url || parsed.endpoint || "");

  if (!url) {
    const error = new HttpError("Endpoint no permitido.", {
      code: "ENDPOINT_NOT_ALLOWED",
      method,
      url: parsed.endpoint || "",
    });

    recordError(error, parsed.endpoint || "", method);
    throw error;
  }

  const auth = shouldUseAuth(endpoint, options);
  const token = auth ? cleanToken(first(options.token, options.accessToken, getAccessToken(), "")) : "";

  const headers = buildHeaders(options, auth, token);
  const prepared = prepareBody(
    method === "GET" || method === "HEAD" ? undefined : options.body,
    headers
  );

  const timeout = withTimeout(options.signal, options.timeout || DEFAULT_TIMEOUT_MS);

  const fetchOptions = {
    method,
    headers: prepared.headers,
    body: prepared.body,

    credentials: options.credentials || "include",
    cache: options.cache || "no-store",
    mode: options.mode || "cors",
    signal: timeout.signal,
  };

  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const data = await readResponsePayload(response);
      throw createResponseError(response, data, url, method);
    }

    const result = await parseSuccessResponse(response, {
      ...options,
      method,
    });

    recordSuccess();

    return result;
  } catch (error) {
    if (error instanceof HttpError) {
      recordError(error, url, method);
      throw error;
    }

    const isAbort = error?.name === "AbortError";

    const wrapped = new HttpError(
      isAbort ? "Tiempo de espera agotado." : "Error de red.",
      {
        code: isAbort ? "REQUEST_TIMEOUT" : "NETWORK_ERROR",
        method,
        url,
        data: {
          message: error?.message || String(error || ""),
        },
      }
    );

    recordError(wrapped, url, method);
    throw wrapped;
  } finally {
    timeout.clear();
  }
}

/* =========================================================
   VERBS
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
    responseType: "blob",
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

export async function login(credentials = {}, options = {}) {
  const result = await post(AUTH_ENDPOINTS.login, credentials, publicOptions(options));

  setAuthTokens(result);

  return result;
}

export function me(options = {}) {
  return get(AUTH_ENDPOINTS.me, privateOptions(options));
}

export async function refreshSession(body = {}, options = {}) {
  const result = await post(AUTH_ENDPOINTS.refresh, body, publicOptions(options));

  setAuthTokens(result);

  return result;
}

export function refresh(options = {}) {
  const opts = isObject(options) ? { ...options } : {};
  const body = isObject(opts.body) ? opts.body : {};

  delete opts.body;

  return refreshSession(body, opts);
}

export async function logout(options = {}) {
  try {
    return await post(AUTH_ENDPOINTS.logout, {}, privateOptions(options));
  } finally {
    clearAuthTokens({
      clearState: true,
      clearSession: true,
    });
  }
}

export function activate(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.activate, body, publicOptions(options));
}

export function activateAccount(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.activateAccount, body, publicOptions(options));
}

export function requestPasswordReset(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.requestPasswordReset, body, publicOptions(options));
}

export function confirmPasswordReset(body = {}, options = {}) {
  return post(AUTH_ENDPOINTS.confirmPasswordReset, body, publicOptions(options));
}

/* =========================================================
   INSTALL / SNAPSHOT
========================================================= */

export function installHttp(core = null, options = {}) {
  if (core) {
    appCore = core;
  }

  if (options.apiOrigin || options.apiBase || options.baseUrl) {
    setApiOrigin(options.apiOrigin || options.apiBase || options.baseUrl);
  }

  try {
    appCore?.registerModule?.("http", Http, {
      overwrite: true,
    });

    appCore?.modules?.register?.("http", Http, {
      overwrite: true,
    });
  } catch {
    // noop
  }

  return Http;
}

export const installCoreHttp = installHttp;
export const install = installHttp;

export function getHttpSnapshot() {
  return {
    version: HTTP_VERSION,

    origin: getApiOrigin(),
    installed: Boolean(appCore),
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

    endpoints: {
      auth: AUTH_ENDPOINTS,
      public: [...PUBLIC_API_PATHS],
      private: [...PRIVATE_API_PATHS],
    },

    policy: {
      singleHttpClient: true,
      usesFetchHereOnly: true,
      credentialsInclude: true,
      noCoreRequestDependency: true,
      noServicesDependency: true,
      noInterceptors: true,
      noAutoRefresh: true,
      noRouter: true,
      noToast: true,
      noStorage: true,
      noRefreshTokenStorage: true,
      authErrorsClassifiedOnly: true,
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

  getAccessToken,
  setAccessToken,
  setAuthTokens,
  clearAuthTokens,

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
