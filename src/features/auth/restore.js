/* =========================================================
   Onion SPA - Auth Restore
   Archivo: src/features/auth/restore.js

   Responsabilidad única:
   - Restaurar sesión local contra backend.
   - Prioridad: token -> /me.
   - Fallback: refresh -> /me si hace falta.
   - Nunca marcar authenticated sin token + user válido.
   - Preservar rutas públicas técnicas durante boot.
========================================================= */

import { AppCore } from "../../core/index.js";

import { extractMessage } from "./helpers.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  extractToken,
  extractUser,
  extractRefreshToken,
  normalizeSessionPayload,
  normalizeUser,
} from "./normalize.js";

import {
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
  hasRefreshContext,
} from "./storage.js";

import {
  applySession,
  clearSessionLocal,
  buildSessionSnapshot,
} from "./session.js";

/* =========================================================
   META
========================================================= */

export const RESTORE_VERSION = "16.0.0-simple";
const RESTORE_SOURCE = "auth.restore";
const BACKEND_ORIGIN = "https://api.onionit.net";

/* =========================================================
   RUNTIME
========================================================= */

const runtimeSession = {
  checking: false,
  refreshing: false,
  restoring: false,

  mePromise: null,
  refreshPromise: null,
  restorePromise: null,

  lastCheckAt: 0,
  lastRefreshAt: 0,
  lastRestoreAt: 0,

  refreshFailCount: 0,
  refreshBlockedUntil: 0,

  lastError: null,
};

/* =========================================================
   CONSTANTS
========================================================= */

const PUBLIC_TECHNICAL_ROUTES = Object.freeze([
  "/login",

  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",

  "/reset-password",
  "/reset-password/confirm",
  "/reset-password-confirm",

  "/password-reset",
  "/password-reset/confirm",
  "/password-reset-confirm",

  "/confirm-reset-password",
  "/forgot-password",
  "/recover-password",

  "/2fa",
  "/mfa",
  "/otp",
]);

const AUTH_FAILURE_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INVALID_TOKEN",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "SESSION_NOT_FOUND",
  "TOKEN_VERSION_MISMATCH",
  "USER_NOT_FOUND",
  "USER_DISABLED",
  "USER_NOT_AVAILABLE",
  "AUTH_FAILED",
  "AUTH_RESTORE_FAILED",
  "REFRESH_CONTEXT_MISSING",
  "REFRESH_INVALID_SESSION",
  "REFRESH_EMPTY_RESPONSE",
  "REFRESH_UNUSABLE_RESPONSE",
  "ME_USER_MISSING",
]);

const TRANSIENT_STATUS_CODES = new Set([
  0,
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);

const TOKEN_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "authToken",
  "auth_token",
  "jwt",
  "bearer",
  "idToken",
  "id_token",
]);

const REFRESH_TOKEN_KEYS = Object.freeze([
  "refreshToken",
  "refresh_token",
]);

const USER_KEYS = Object.freeze([
  "user",
  "usuario",
  "me",
  "account",
  "profile",
  "currentUser",
  "current_user",
]);

const SESSION_KEYS = Object.freeze([
  "session",
  "sessionData",
  "session_data",
  "authSession",
  "auth_session",
]);

const SESSION_ID_KEYS = Object.freeze([
  "sessionId",
  "session_id",
  "sid",
  "id",
]);

const SESSION_USER_ID_KEYS = Object.freeze([
  "sessionUserId",
  "session_user_id",
  "userId",
  "user_id",
  "uid",
  "sub",
]);

const NESTED_OBJECT_KEYS = Object.freeze([
  "data",
  "payload",
  "result",
  "body",
  "response",
  "auth",
  "authData",
  "session",
  "sessionData",
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeLower(value = "", fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text = safeLower(value, "");

  if (["true", "1", "yes", "si", "sí", "on", "ok", "active"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "off", "inactive", "disabled"].includes(text)) {
    return false;
  }

  return Boolean(fallback);
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }

  return null;
}

function firstText(...values) {
  return safeText(first(...values), "");
}

function nowIso(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function getState() {
  return safeObject(AppCore?.state);
}

function safeSetState(patch = {}, options = {}) {
  const cleanPatch = safeObject(patch);

  try {
    AppCore?.setState?.(cleanPatch, {
      source: RESTORE_SOURCE,
      emit: false,
      silent: true,
      ...safeObject(options),
    });
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, cleanPatch);
    }
  } catch {}

  return getState();
}

/* =========================================================
   TOKEN / USER VALIDATION
========================================================= */

function stripBearer(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function hasUsableToken(token = "") {
  const value = stripBearer(token);

  if (!value) return false;
  if (/[\s\r\n\t]/.test(value)) return false;

  const lower = value.toLowerCase();

  if (
    [
      "null",
      "undefined",
      "false",
      "true",
      "nan",
      "none",
      "[object object]",
      "{}",
      "[]",
    ].includes(lower)
  ) {
    return false;
  }

  const max = safeNumber(AppCore?.config?.auth?.tokenMaxLength, 8192);

  if (max > 0 && value.length > max) {
    return false;
  }

  try {
    if (isFunction(AppCore?.utils?.hasValidToken)) {
      return Boolean(AppCore.utils.hasValidToken(value));
    }
  } catch {}

  return true;
}

function isUserActive(user = null) {
  if (!isPlainObject(user)) return false;

  const status = safeLower(
    user.status ||
      user.estado ||
      user.state ||
      user.accountStatus ||
      "",
    ""
  );

  if (
    [
      "disabled",
      "inactive",
      "deleted",
      "blocked",
      "suspended",
      "banned",
      "revoked",
      "archived",
      "desactivado",
      "inactivo",
      "eliminado",
      "bloqueado",
      "suspendido",
    ].includes(status)
  ) {
    return false;
  }

  if (
    user.disabled === true ||
    user.deleted === true ||
    user.blocked === true ||
    user.banned === true ||
    user.suspended === true ||
    user.revoked === true ||
    user.archived === true
  ) {
    return false;
  }

  const active = user.active ?? user.enabled ?? user.isActive ?? user.isEnabled;

  if (active === undefined || active === null || active === "") {
    return true;
  }

  return safeBool(active, true);
}

function hasUsableUser(user = null) {
  if (!isPlainObject(user) || !isUserActive(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.user_id ||
      user.uid ||
      user.sub ||
      user.username ||
      user.userName ||
      user.user_name ||
      user.email ||
      user.mail ||
      user.phone ||
      user.telefono ||
      user.name ||
      user.nombre ||
      user.displayName
  );
}

function normalizeUserForRestore(user = null) {
  if (!isPlainObject(user)) return null;

  try {
    const normalized = normalizeUser(user);
    if (hasUsableUser(normalized)) return normalized;
  } catch {}

  return hasUsableUser(user) ? user : null;
}

function getCurrentToken() {
  const state = getState();

  return stripBearer(
    firstText(
      state.token,
      state.accessToken,
      state.access_token,
      state.session?.token,
      state.session?.accessToken,
      state.session?.access_token,
      state.sessionData?.token,
      state.sessionData?.accessToken,
      state.sessionData?.access_token,
      getStoredAccessToken()
    )
  );
}

function getCurrentUser() {
  const state = getState();

  return normalizeUserForRestore(
    state.user ||
      state.currentUser ||
      state.authUser ||
      state.sessionUser ||
      state.session?.user ||
      state.session?.usuario ||
      state.sessionData?.user ||
      state.sessionData?.usuario ||
      null
  );
}

function hasCompleteAuthState() {
  return Boolean(hasUsableToken(getCurrentToken()) && hasUsableUser(getCurrentUser()));
}

/* =========================================================
   ERRORS
========================================================= */

function createRestoreError(message = "No se pudo restaurar la sesión.", {
  status = 401,
  code = "AUTH_RESTORE_FAILED",
  response = null,
} = {}) {
  const error = new Error(message);

  error.name = "AuthRestoreError";
  error.status = status;
  error.statusCode = status;
  error.code = code;
  error.data = {
    code,
    message,
    status,
  };

  try {
    Object.defineProperty(error, "raw", {
      value: response,
      enumerable: false,
      configurable: true,
    });
  } catch {
    error.raw = response;
  }

  return error;
}

function getErrorStatus(error = null) {
  return safeNumber(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status ||
      error?.raw?.status ||
      0,
    0
  );
}

function getErrorCode(error = null) {
  return safeText(
    error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      error?.response?.data?.error ||
      error?.raw?.code ||
      error?.raw?.error ||
      "",
    ""
  ).toUpperCase();
}

function buildErrorPayload(error = null) {
  return {
    name: safeText(error?.name, "Error"),
    status: getErrorStatus(error) || null,
    code: getErrorCode(error) || null,
    message: extractMessage(error) || safeText(error?.message, "Error"),
    timeout: Boolean(error?.timeout),
    aborted: Boolean(error?.aborted),
    at: nowIso(),
  };
}

function isTransientError(error = null) {
  const status = getErrorStatus(error);

  if (TRANSIENT_STATUS_CODES.has(status)) return true;

  if (error?.timeout === true || error?.aborted === true || error?.name === "AbortError") {
    return true;
  }

  const message = safeLower(extractMessage(error) || error?.message || "", "");

  return Boolean(
    message.includes("network") ||
      message.includes("timeout") ||
      message.includes("fetch") ||
      message.includes("cors") ||
      message.includes("offline") ||
      message.includes("failed to fetch")
  );
}

function shouldClearForError(error = null) {
  const status = getErrorStatus(error);
  if (status === 401 || status === 403) return true;

  const code = getErrorCode(error);
  return Boolean(code && AUTH_FAILURE_CODES.has(code));
}

/* =========================================================
   EVENTS
========================================================= */

function redact(value = "") {
  return safeText(value, "")
    .replace(
      /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function sanitizeUserForEvent(user = null) {
  if (!isPlainObject(user)) return null;

  const output = { ...user };

  for (const key of [
    "password",
    "passwordHash",
    "password_hash",
    "hash",
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "twofa_secret",
    "twofaSecret",
    "mfa_secret",
    "mfaSecret",
    "reset",
    "activation",
    "_rid",
    "_self",
    "_etag",
    "_attachments",
    "_ts",
  ]) {
    delete output[key];
  }

  if (output.avatar) output.avatar = redact(output.avatar);
  if (output.avatarUrl) output.avatarUrl = redact(output.avatarUrl);
  if (output.picture) output.picture = redact(output.picture);

  return output;
}

function emit(eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;
  if (options.silent === true || options.emitEvents === false) return false;

  const cleanPayload = {
    source: RESTORE_SOURCE,
    version: RESTORE_VERSION,
    at: nowIso(),
    ...safeObject(payload),
  };

  for (const key of [
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "authorization",
    "password",
    "code",
    "otp",
    "totp",
  ]) {
    if (key in cleanPayload) cleanPayload[key] = null;
  }

  for (const key of [
    "route",
    "publicPath",
    "browserPath",
    "initialUrl",
    "url",
  ]) {
    if (cleanPayload[key]) cleanPayload[key] = redact(cleanPayload[key]);
  }

  if (cleanPayload.user) {
    cleanPayload.user = sanitizeUserForEvent(cleanPayload.user);
  }

  try {
    AppCore?.events?.emit?.(name, cleanPayload);
    return true;
  } catch {}

  return false;
}

function emitError(eventName, error, extra = {}, options = {}) {
  return emit(
    eventName,
    {
      ...safeObject(extra),
      error: buildErrorPayload(error),
      message: extractMessage(error),
    },
    options
  );
}

/* =========================================================
   ROUTE PRESERVATION
========================================================= */

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost";
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "/";

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
}

function normalizePathname(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";

  return value;
}

function stripSearchAndHash(path = "/") {
  return normalizePathname(
    safeText(path, "/")
      .split("?")[0]
      .split("#")[0] || "/"
  );
}

function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "";

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return `${normalizePathname(parsed.pathname || "/")}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

function stripPublicUsernamePrefix(path = "/") {
  const clean = stripSearchAndHash(path);
  const parts = clean.split("/").filter(Boolean);

  if (parts[0] && /^@[A-Za-z0-9._-]{1,80}$/.test(parts[0])) {
    return parts.length > 1 ? normalizePathname(`/${parts.slice(1).join("/")}`) : "/";
  }

  return clean;
}

function getBrowserPublicPath() {
  if (!isBrowser()) return "";

  try {
    const { pathname, search, hash } = window.location;

    if (hash && isHashRouterPath(hash)) {
      return normalizeHashRouterPath(hash);
    }

    return `${pathname || "/"}${search || ""}${hash || ""}`;
  } catch {
    return "";
  }
}

function isPublicTechnicalRoute(path = "/") {
  const clean = stripPublicUsernamePrefix(pathFromUrlLike(path) || path || "/");

  return PUBLIC_TECHNICAL_ROUTES.some((candidate) => (
    clean === candidate ||
    clean.startsWith(`${candidate}/`)
  ));
}

function captureRouteContext(options = {}) {
  const state = getState();

  const publicPath =
    safeText(options.publicPath || state.publicPath, "") ||
    getBrowserPublicPath() ||
    "/";

  const route =
    safeText(options.route || state.route, "") ||
    stripPublicUsernamePrefix(publicPath) ||
    "/";

  const preserve = Boolean(
    options.publicRoute ||
      options.preserveRoute ||
      options.preserveCurrentRoute ||
      options.activationBoot ||
      options.resetConfirmBoot ||
      isPublicTechnicalRoute(route) ||
      isPublicTechnicalRoute(publicPath)
  );

  return {
    preserve,
    route: stripPublicUsernamePrefix(route || publicPath || "/"),
    publicPath: publicPath || route || "/",
  };
}

function restoreRouteContext(routeContext = {}) {
  if (!routeContext?.preserve) return false;

  const route = routeContext.route || "/";
  const publicPath = routeContext.publicPath || route;

  try {
    AppCore?.setRoute?.(route);
  } catch {}

  try {
    AppCore?.setPublicPath?.(publicPath);
  } catch {}

  safeSetState({
    route,
    canonicalPath: route,
    publicPath,
  }, {
    source: `${RESTORE_SOURCE}:restore-route`,
  });

  return true;
}

/* =========================================================
   TRANSPORT
========================================================= */

function resolveEndpoint(key, fallback = "") {
  const endpoint = safeText(
    AUTH_ENDPOINTS?.[key] ||
      AUTH_ENDPOINTS?.auth?.[key] ||
      AppCore?.config?.auth?.endpoints?.[key] ||
      AppCore?.config?.endpoints?.auth?.[key],
    fallback
  );

  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (endpoint.startsWith("/api/")) return endpoint;
  if (endpoint.startsWith("/auth/")) return `/api${endpoint}`;
  if (endpoint.startsWith("/")) return `/api/auth${endpoint}`;

  return `/api/auth/${endpoint}`;
}

function resolveApiBase() {
  const config = safeObject(AppCore?.config);

  return safeText(
    config.apiBase ||
      config.apiUrl ||
      config.baseUrl ||
      config.backendUrl ||
      config.publicApiOrigin ||
      BACKEND_ORIGIN,
    BACKEND_ORIGIN
  ).replace(/\/+$/g, "");
}

function buildAbsoluteApiUrl(path = "") {
  const raw = safeText(path, "/");

  if (/^https?:\/\//i.test(raw)) return raw;

  const base = resolveApiBase();
  const cleanPath = raw.startsWith("/") ? raw : `/${raw}`;

  if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${base}${cleanPath.slice(4)}`;
  }

  return `${base}${cleanPath}`;
}

function getHttpClient() {
  return (
    AppCore?.Http ||
    AppCore?.http ||
    AppCore?.services?.Http ||
    AppCore?.services?.http ||
    AppCore?.services?.api ||
    AppCore?.services?.apiClient ||
    AppCore?.apiClient ||
    AppCore?.request ||
    null
  );
}

function buildAuthHeaders(options = {}) {
  const headers = {
    Accept: "application/json",
    "X-Onion-Client": "onion-spa",
    ...safeObject(options.headers),
  };

  if (options.auth === false || options.public === true || options.skipAuth === true) {
    return headers;
  }

  const token = stripBearer(options.token || getCurrentToken());

  if (hasUsableToken(token) && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function requestWithClient(client, method = "GET", path = "", body = null, options = {}) {
  if (!client) {
    throw createRestoreError("No hay cliente HTTP disponible.", {
      status: 500,
      code: "HTTP_CLIENT_MISSING",
    });
  }

  const upperMethod = safeText(method, "GET").toUpperCase();

  const requestOptions = {
    ...safeObject(options),
    method: upperMethod,
    headers: buildAuthHeaders(options),
    noStore: true,
    cache: "no-store",
    noAutoRefresh: true,
    _skipAuthRefresh: true,
    skipAuthRefresh: true,
  };

  if (body !== null && body !== undefined && upperMethod !== "GET" && upperMethod !== "HEAD") {
    requestOptions.body = body;
  }

  if (upperMethod === "GET" && isFunction(client.get)) {
    return client.get(path, requestOptions);
  }

  if (upperMethod === "POST" && isFunction(client.post)) {
    return client.post(path, body, requestOptions);
  }

  if (isFunction(client.request)) {
    try {
      return await client.request(upperMethod, path, requestOptions);
    } catch (firstError) {
      try {
        return await client.request(path, requestOptions);
      } catch {
        throw firstError;
      }
    }
  }

  if (isFunction(client)) {
    return client(path, requestOptions);
  }

  throw createRestoreError(`Cliente HTTP no soporta ${upperMethod}.`, {
    status: 500,
    code: "HTTP_METHOD_UNAVAILABLE",
  });
}

async function requestWithFetch(method = "GET", path = "", body = null, options = {}) {
  if (!isBrowser() || !isFunction(fetch)) {
    throw createRestoreError("Fetch no disponible.", {
      status: 500,
      code: "FETCH_UNAVAILABLE",
    });
  }

  const upperMethod = safeText(method, "GET").toUpperCase();
  const headers = buildAuthHeaders(options);

  const hasBody =
    body !== null &&
    body !== undefined &&
    upperMethod !== "GET" &&
    upperMethod !== "HEAD";

  const isFormData =
    typeof FormData !== "undefined" &&
    body instanceof FormData;

  if (hasBody && !isFormData && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildAbsoluteApiUrl(path), {
    method: upperMethod,
    credentials: options.credentials || "include",
    cache: "no-store",
    headers,
    signal: options.signal || undefined,
    body: hasBody ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  const contentType = response.headers?.get?.("content-type") || "";

  let payload = null;

  if (contentType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  } else {
    try {
      payload = await response.text();
    } catch {
      payload = "";
    }
  }

  if (!response.ok) {
    const message = safeText(
      payload?.message ||
        payload?.error ||
        response.statusText,
      `HTTP ${response.status}`
    );

    const error = createRestoreError(message, {
      status: response.status,
      code:
        payload?.code ||
        payload?.error ||
        (response.status === 401 ? "UNAUTHORIZED" : "AUTH_API_ERROR"),
      response,
    });

    error.data = payload;

    throw error;
  }

  return payload;
}

async function authRequest(method = "GET", path = "", body = null, options = {}) {
  const client = getHttpClient();

  try {
    return await requestWithClient(client, method, path, body, options);
  } catch (error) {
    if (options.noFetchFallback === true || error?.name === "AbortError") {
      throw error;
    }

    return requestWithFetch(method, path, body, options);
  }
}

function apiGet(path, options = {}) {
  return authRequest("GET", path, null, {
    auth: true,
    public: false,
    skipAuth: false,
    silent: true,
    noAutoRefresh: true,
    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    ...safeObject(options),
  });
}

function apiPost(path, body = {}, options = {}) {
  return authRequest("POST", path, body, {
    auth: false,
    public: true,
    skipAuth: true,
    silent: true,
    noAutoRefresh: true,
    noAutoLogout: true,
    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    ...safeObject(options),
  });
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function collectObjects(raw = {}) {
  const output = [];
  const queue = [raw];
  const seen = new WeakSet();

  while (queue.length && output.length < 80) {
    const current = queue.shift();

    if (!isPlainObject(current)) continue;

    try {
      if (seen.has(current)) continue;
      seen.add(current);
    } catch {}

    output.push(current);

    for (const key of NESTED_OBJECT_KEYS) {
      if (isPlainObject(current[key])) queue.push(current[key]);
    }

    if (isPlainObject(current.response?.data)) queue.push(current.response.data);
    if (isPlainObject(current.data?.auth)) queue.push(current.data.auth);
    if (isPlainObject(current.data?.session)) queue.push(current.data.session);
  }

  return output;
}

function pickValue(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (object?.[key] !== null && object?.[key] !== undefined && object?.[key] !== "") {
        return object[key];
      }
    }
  }

  return undefined;
}

function pickText(objects = [], keys = []) {
  return safeText(pickValue(objects, keys), "");
}

function pickObject(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (isPlainObject(object?.[key])) {
        return object[key];
      }
    }
  }

  return null;
}

function responseStatus(response = null) {
  const objects = collectObjects(response);
  return pickValue(objects, ["status", "statusCode", "status_code"]);
}

function responseCode(response = null) {
  const objects = collectObjects(response);
  return safeText(pickValue(objects, ["code", "error", "errorCode", "error_code"]), "");
}

function responseMessage(response = null) {
  const objects = collectObjects(response);

  return safeText(
    pickValue(objects, [
      "message",
      "mensaje",
      "errorMessage",
      "error_message",
      "detail",
      "description",
    ]),
    ""
  );
}

function isExplicitAuthFailure(response = null) {
  if (!isPlainObject(response)) return false;

  const status = Number(responseStatus(response) || 0);

  if (Number.isFinite(status) && status >= 400) {
    return true;
  }

  const code = responseCode(response).toUpperCase();

  if (code && AUTH_FAILURE_CODES.has(code)) {
    return true;
  }

  return collectObjects(response).some((object) => (
    object.ok === false ||
    object.success === false ||
    object.authenticated === false && code
  ));
}

function extractUserFallback(response = null) {
  const imported = normalizeUserForRestore(extractUser(response));

  if (imported) return imported;

  return normalizeUserForRestore(
    pickObject(collectObjects(response), USER_KEYS)
  );
}

function extractTokenFallback(response = null) {
  const imported = safeText(extractToken(response), "");

  if (hasUsableToken(imported)) return stripBearer(imported);

  return stripBearer(pickText(collectObjects(response), TOKEN_KEYS));
}

function extractRefreshTokenFallback(response = null) {
  return stripBearer(
    safeText(extractRefreshToken(response), "") ||
      pickText(collectObjects(response), REFRESH_TOKEN_KEYS)
  );
}

function normalizeSessionPayloadFallback(response = null) {
  try {
    const normalized = normalizeSessionPayload(response);

    if (isPlainObject(normalized)) {
      return normalized;
    }
  } catch {}

  const objects = collectObjects(response);

  const session = pickObject(objects, SESSION_KEYS) || {};
  const sessionId = pickText(objects, SESSION_ID_KEYS);
  const sessionUserId = pickText(objects, SESSION_USER_ID_KEYS);

  if (!Object.keys(session).length && !sessionId && !sessionUserId) {
    return null;
  }

  return {
    ...session,
    sessionId: session.sessionId || session.session_id || session.sid || session.id || sessionId || null,
    session_id: session.session_id || session.sessionId || session.sid || session.id || sessionId || null,
    sid: session.sid || sessionId || null,
    userId: session.userId || session.user_id || session.sessionUserId || sessionUserId || null,
    user_id: session.user_id || session.userId || session.sessionUserId || sessionUserId || null,
    sessionUserId: session.sessionUserId || session.session_user_id || session.userId || sessionUserId || null,
    session_user_id: session.session_user_id || session.sessionUserId || session.userId || sessionUserId || null,
  };
}

function normalizeAuthResponse(response = null) {
  if (isExplicitAuthFailure(response)) {
    return {
      ok: false,
      explicitFailure: true,
      token: "",
      user: null,
      refreshToken: "",
      sessionData: null,
      status: responseStatus(response) || 401,
      code: responseCode(response) || "AUTH_FAILED",
      message: responseMessage(response) || "No se pudo restaurar la sesión.",
      response,
    };
  }

  const token = extractTokenFallback(response);
  const user = extractUserFallback(response);
  const refreshToken = extractRefreshTokenFallback(response);
  const sessionData = normalizeSessionPayloadFallback(response);

  return {
    ok: Boolean(hasUsableToken(token) || hasUsableUser(user)),
    explicitFailure: false,
    token,
    user: hasUsableUser(user) ? user : null,
    refreshToken,
    sessionData,
    status:
      responseStatus(response) ||
      (hasUsableToken(token) && hasUsableUser(user)
        ? "authenticated"
        : hasUsableToken(token)
          ? "token_only"
          : hasUsableUser(user)
            ? "user_only"
            : ""),
    code: responseCode(response) || "",
    message: responseMessage(response) || "",
    response,
  };
}

function assertNoExplicitFailure(auth = {}) {
  if (auth.explicitFailure || auth.ok === false) {
    throw createRestoreError(auth.message || "No se pudo restaurar la sesión.", {
      status: Number(auth.status) || 401,
      code: auth.code || "AUTH_RESTORE_FAILED",
      response: auth.response,
    });
  }
}

/* =========================================================
   REFRESH CONTEXT
========================================================= */

function getStoredRefreshPayload() {
  const state = getState();
  const session = safeObject(state.session || state.sessionData);
  const user = safeObject(state.user || state.currentUser || state.authUser || state.sessionUser);

  return {
    refreshToken: stripBearer(getStoredRefreshToken() || state.refreshToken || state.refresh_token || ""),
    sessionId: firstText(
      getStoredSessionId(),
      session.sessionId,
      session.session_id,
      session.sid,
      state.sessionId
    ),
    userId: firstText(
      getStoredSessionUserId(),
      session.userId,
      session.user_id,
      session.sessionUserId,
      user.userId,
      user.user_id,
      user.id,
      user.sub,
      state.sessionUserId
    ),
  };
}

function hasUsableRefreshPayload(payload = getStoredRefreshPayload()) {
  return Boolean(
    stripBearer(payload.refreshToken) &&
      safeText(payload.sessionId, "") &&
      safeText(payload.userId, "")
  );
}

function canAttemptRefresh(session = runtimeSession) {
  if (safeNumber(session.refreshBlockedUntil, 0) > Date.now()) {
    return false;
  }

  return Boolean(hasRefreshContext() && hasUsableRefreshPayload());
}

/* =========================================================
   APPLY / CLEAR
========================================================= */

function getSafeSessionSnapshot() {
  try {
    return buildSessionSnapshot();
  } catch {
    return {
      authenticated: false,
      token: getCurrentToken() || null,
      user: getCurrentUser() || null,
    };
  }
}

function assertCompleteSnapshot(snapshot = {}, code = "INVALID_SESSION") {
  const token = snapshot.token || snapshot.accessToken || getCurrentToken();
  const user = snapshot.user || getCurrentUser();

  if (!snapshot.authenticated || !hasUsableToken(token) || !hasUsableUser(user)) {
    throw createRestoreError("La sesión restaurada no es válida.", {
      status: 401,
      code,
    });
  }

  return true;
}

function applyAuthenticatedSession({
  token,
  user,
  refreshToken,
  sessionData,
  source = RESTORE_SOURCE,
} = {}) {
  const cleanToken = stripBearer(token);
  const cleanUser = normalizeUserForRestore(user);

  if (!hasUsableToken(cleanToken) || !hasUsableUser(cleanUser)) {
    throw createRestoreError("Sesión incompleta.", {
      status: 401,
      code: "APPLY_AUTH_SESSION_INCOMPLETE",
    });
  }

  const snapshot = applySession({
    token: cleanToken,
    accessToken: cleanToken,
    access_token: cleanToken,

    refreshToken: refreshToken || undefined,
    refresh_token: refreshToken || undefined,

    session: sessionData || undefined,
    sessionData: sessionData || undefined,

    user: cleanUser,
    usuario: cleanUser,
    me: cleanUser,
    account: cleanUser,
    profile: cleanUser,

    authenticated: true,
    preserveExistingUser: false,

    source,
    eventMode: "restore",
  });

  safeSetState({
    authenticated: true,
    hasToken: true,

    token: snapshot?.token || cleanToken,
    accessToken: snapshot?.token || cleanToken,
    access_token: snapshot?.token || cleanToken,

    user: snapshot?.user || cleanUser,
    currentUser: snapshot?.user || cleanUser,
    authUser: snapshot?.user || cleanUser,
    sessionUser: snapshot?.user || cleanUser,

    role: snapshot?.role || cleanUser.role || cleanUser.rol || "",
    userRole: snapshot?.role || cleanUser.role || cleanUser.rol || "",
  }, {
    allowExplicitAuthenticated: true,
    source: `${RESTORE_SOURCE}:apply`,
  });

  return getSafeSessionSnapshot();
}

function applyProvisionalTokenSession({
  token,
  refreshToken,
  sessionData,
  source = "refresh:token-only",
} = {}) {
  const cleanToken = stripBearer(token);

  if (!hasUsableToken(cleanToken)) {
    throw createRestoreError("Token provisional ausente.", {
      status: 401,
      code: "PROVISIONAL_TOKEN_MISSING",
    });
  }

  return applySession({
    token: cleanToken,
    accessToken: cleanToken,
    access_token: cleanToken,

    refreshToken: refreshToken || undefined,
    refresh_token: refreshToken || undefined,

    session: sessionData || undefined,
    sessionData: sessionData || undefined,

    user: null,
    authenticated: false,
    preserveExistingUser: false,

    silent: true,
    source,
    eventMode: "refresh",
  });
}

function clearSessionProtected({
  options = {},
  routeContext = null,
  reason = "restore-clear",
} = {}) {
  const ctx = routeContext || captureRouteContext(options);

  try {
    clearSessionLocal({
      silent: true,
      preserveRoute: ctx.preserve,
      preserveCurrentRoute: ctx.preserve,
      route: ctx.route,
      publicPath: ctx.publicPath,
      source: RESTORE_SOURCE,
      reason,
    });
  } catch {}

  safeSetState({
    authenticated: false,
    hasToken: false,

    token: null,
    accessToken: null,
    access_token: null,

    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,

    role: "",
    userRole: "",
    roles: [],

    session: null,
    sessionData: null,
    sessionId: null,
    sessionUserId: null,
  }, {
    forceUnauthenticated: true,
    source: `${RESTORE_SOURCE}:clear`,
  });

  restoreRouteContext(ctx);

  emit("auth:restore:session-cleared", {
    reason,
    protectedRoute: ctx.preserve,
    route: ctx.route,
    publicPath: ctx.publicPath,
  }, options);

  return true;
}

function buildPublicSessionPayload(snapshot = {}) {
  const user = snapshot.user || getCurrentUser();
  const token = snapshot.token || snapshot.accessToken || getCurrentToken();

  return {
    authenticated: Boolean(snapshot.authenticated && hasUsableToken(token) && hasUsableUser(user)),
    hasToken: hasUsableToken(token),
    token: null,
    accessToken: null,
    refreshToken: null,
    user: sanitizeUserForEvent(user),
    role: snapshot.role || user?.role || user?.rol || getState().role || null,
  };
}

/* =========================================================
   /ME
========================================================= */

function getSession(sessionArg) {
  return isPlainObject(sessionArg) &&
    ("restorePromise" in sessionArg || "refreshPromise" in sessionArg || "mePromise" in sessionArg)
    ? sessionArg
    : runtimeSession;
}

export async function fetchMe(sessionArg = runtimeSession) {
  const session = getSession(sessionArg);

  const token = getCurrentToken();

  if (!hasUsableToken(token)) {
    throw createRestoreError("No hay token para /me.", {
      status: 401,
      code: "TOKEN_MISSING",
    });
  }

  if (session.mePromise) {
    return session.mePromise;
  }

  session.checking = true;

  emit("auth:me:start", {
    hasToken: true,
  });

  session.mePromise = (async () => {
    try {
      const response = await apiGet(resolveEndpoint("me", "/api/auth/me"), {
        token,
        auth: true,
        public: false,
        skipAuth: false,
      });

      const auth = normalizeAuthResponse(response);
      assertNoExplicitFailure(auth);

      const user = normalizeUserForRestore(auth.user);

      if (!hasUsableUser(user)) {
        throw createRestoreError("No se pudo resolver usuario válido desde /me.", {
          status: 401,
          code: "ME_USER_MISSING",
          response,
        });
      }

      const snapshot = applyAuthenticatedSession({
        token: auth.token || token,
        user,
        refreshToken: auth.refreshToken || undefined,
        sessionData: auth.sessionData || undefined,
        source: "restore.me",
      });

      assertCompleteSnapshot(snapshot, "ME_INVALID_SESSION");

      session.lastCheckAt = Date.now();
      session.lastError = null;

      emit("auth:me:success", buildPublicSessionPayload(snapshot));

      return snapshot.user;
    } catch (error) {
      session.lastError = {
        type: "me",
        ...buildErrorPayload(error),
      };

      emitError("auth:me:error", error);

      throw error;
    } finally {
      session.checking = false;
      session.mePromise = null;
    }
  })();

  return session.mePromise;
}

/* =========================================================
   REFRESH
========================================================= */

function getMaxRefreshFailures() {
  return safeNumber(AUTH_CONSTANTS?.maxSequentialRefreshFailures, 3);
}

function getRefreshCooldownMs() {
  return safeNumber(AUTH_CONSTANTS?.refreshRetryCooldownMs, 30_000);
}

export async function refreshSession(sessionArg = runtimeSession) {
  const session = getSession(sessionArg);
  const body = getStoredRefreshPayload();

  if (!hasUsableRefreshPayload(body)) {
    throw createRestoreError("No hay contexto refresh completo.", {
      status: 401,
      code: "REFRESH_CONTEXT_MISSING",
    });
  }

  if (session.refreshPromise) {
    return session.refreshPromise;
  }

  if (safeNumber(session.refreshBlockedUntil, 0) > Date.now()) {
    throw createRestoreError("Refresh temporalmente bloqueado.", {
      status: 429,
      code: "REFRESH_BLOCKED",
    });
  }

  session.refreshing = true;

  emit("auth:refresh:start", {
    hasRefreshContext: true,
    hasRefreshToken: Boolean(body.refreshToken),
    hasSessionContext: Boolean(body.sessionId && body.userId),
  });

  session.refreshPromise = (async () => {
    try {
      const response = await apiPost(
        resolveEndpoint("refresh", "/api/auth/refresh"),
        body,
        {
          auth: false,
          public: true,
          skipAuth: true,
        }
      );

      const auth = normalizeAuthResponse(response);
      assertNoExplicitFailure(auth);

      const tokenOk = hasUsableToken(auth.token);
      const userOk = hasUsableUser(auth.user);

      if (!tokenOk && !userOk) {
        throw createRestoreError("Refresh sin sesión recuperable.", {
          status: 401,
          code: "REFRESH_EMPTY_RESPONSE",
          response,
        });
      }

      let snapshot = null;

      if (tokenOk && userOk) {
        snapshot = applyAuthenticatedSession({
          token: auth.token,
          user: auth.user,
          refreshToken: auth.refreshToken || body.refreshToken,
          sessionData: auth.sessionData || {
            sessionId: body.sessionId,
            userId: body.userId,
          },
          source: "refresh",
        });
      } else if (tokenOk && !userOk) {
        applyProvisionalTokenSession({
          token: auth.token,
          refreshToken: auth.refreshToken || body.refreshToken,
          sessionData: auth.sessionData || {
            sessionId: body.sessionId,
            userId: body.userId,
          },
        });

        await fetchMe(session);
        snapshot = getSafeSessionSnapshot();
      } else if (!tokenOk && userOk && hasUsableToken(getCurrentToken())) {
        snapshot = applyAuthenticatedSession({
          token: getCurrentToken(),
          user: auth.user,
          refreshToken: auth.refreshToken || body.refreshToken,
          sessionData: auth.sessionData || {
            sessionId: body.sessionId,
            userId: body.userId,
          },
          source: "refresh:user-only",
        });
      }

      assertCompleteSnapshot(snapshot, "REFRESH_INVALID_SESSION");

      session.lastRefreshAt = Date.now();
      session.refreshFailCount = 0;
      session.refreshBlockedUntil = 0;
      session.lastError = null;

      emit("auth:refresh:success", buildPublicSessionPayload(snapshot));

      return {
        ok: true,
        ...snapshot,
        response,
        source: "refresh",
      };
    } catch (error) {
      session.refreshFailCount = safeNumber(session.refreshFailCount, 0) + 1;

      if (session.refreshFailCount >= getMaxRefreshFailures()) {
        session.refreshBlockedUntil = Date.now() + getRefreshCooldownMs();
      }

      session.lastError = {
        type: "refresh",
        ...buildErrorPayload(error),
      };

      emitError("auth:refresh:error", error, {
        refreshFailCount: session.refreshFailCount,
        refreshBlockedUntil: session.refreshBlockedUntil || null,
      });

      throw error;
    } finally {
      session.refreshing = false;
      session.refreshPromise = null;
    }
  })();

  return session.refreshPromise;
}

/* =========================================================
   RESTORE MODES
========================================================= */

export async function restoreUsingMe(session = runtimeSession) {
  const user = await fetchMe(session);
  const snapshot = getSafeSessionSnapshot();

  assertCompleteSnapshot(snapshot, "RESTORE_ME_INVALID_SESSION");

  emit("auth:restore:success", {
    ...buildPublicSessionPayload(snapshot),
    source: "me",
  });

  return {
    ok: true,
    user,
    source: "me",
  };
}

export async function restoreUsingRefreshOnly(session = runtimeSession) {
  const refreshed = await refreshSession(session);

  if (!hasCompleteAuthState() && hasUsableToken(getCurrentToken())) {
    await fetchMe(session);
  }

  const snapshot = getSafeSessionSnapshot();

  assertCompleteSnapshot(snapshot, "RESTORE_REFRESH_INVALID_SESSION");

  emit("auth:restore:success", {
    ...buildPublicSessionPayload(snapshot),
    source: "refresh",
  });

  return {
    ok: true,
    user: snapshot.user || null,
    refreshed,
    source: "refresh",
  };
}

export async function restoreUsingRefreshPreferred(session = runtimeSession) {
  return restoreUsingRefreshOnly(session);
}

/* =========================================================
   ERROR FALLBACKS
========================================================= */

function keepCachedSessionAfterTransientFailure({
  error,
  routeContext,
  source = "cached-transient",
} = {}) {
  const snapshot = getSafeSessionSnapshot();

  if (
    !isTransientError(error) ||
    !hasUsableToken(snapshot.token || snapshot.accessToken) ||
    !hasUsableUser(snapshot.user)
  ) {
    return null;
  }

  safeSetState({
    authenticated: true,
    hasToken: true,

    token: snapshot.token || snapshot.accessToken,
    accessToken: snapshot.token || snapshot.accessToken,
    access_token: snapshot.token || snapshot.accessToken,

    user: snapshot.user,
    currentUser: snapshot.user,
    authUser: snapshot.user,
    sessionUser: snapshot.user,

    role: snapshot.role || snapshot.user?.role || snapshot.user?.rol || "",
    userRole: snapshot.role || snapshot.user?.role || snapshot.user?.rol || "",
  }, {
    allowExplicitAuthenticated: true,
    source: `${RESTORE_SOURCE}:keep-cached`,
  });

  restoreRouteContext(routeContext);

  emit("auth:restore:transient-kept", {
    ...buildPublicSessionPayload(snapshot),
    source,
    protectedRoute: Boolean(routeContext?.preserve),
    error: buildErrorPayload(error),
  });

  return {
    ok: true,
    user: snapshot.user,
    source,
    provisional: true,
    transientError: buildErrorPayload(error),
    protectedRoute: Boolean(routeContext?.preserve),
  };
}

export async function restoreAfterMeFailure(
  session = runtimeSession,
  meError,
  options = {},
  routeContext = null
) {
  const cached = keepCachedSessionAfterTransientFailure({
    error: meError,
    routeContext,
    source: "cached-after-me-transient",
  });

  if (cached) return cached;

  if (canAttemptRefresh(session)) {
    try {
      return await restoreUsingRefreshOnly(session);
    } catch (refreshError) {
      const cachedAfterRefresh = keepCachedSessionAfterTransientFailure({
        error: refreshError,
        routeContext,
        source: "cached-after-refresh-transient",
      });

      if (cachedAfterRefresh) return cachedAfterRefresh;

      if (shouldClearForError(meError) || shouldClearForError(refreshError)) {
        clearSessionProtected({
          options,
          routeContext,
          reason: "me-refresh-failed-clearable",
        });
      } else {
        restoreRouteContext(routeContext);
      }

      emitError("auth:restore:error", refreshError, {
        protectedRoute: Boolean(routeContext?.preserve),
      }, options);

      return {
        ok: false,
        user: null,
        error: refreshError,
        protectedRoute: Boolean(routeContext?.preserve),
      };
    }
  }

  if (shouldClearForError(meError)) {
    clearSessionProtected({
      options,
      routeContext,
      reason: "me-failed-clearable",
    });
  } else {
    restoreRouteContext(routeContext);
  }

  emitError("auth:restore:error", meError, {
    protectedRoute: Boolean(routeContext?.preserve),
  }, options);

  return {
    ok: false,
    user: null,
    error: meError,
    protectedRoute: Boolean(routeContext?.preserve),
  };
}

async function restoreUsingMeAfterRefreshFailure(
  session = runtimeSession,
  refreshError,
  options = {},
  routeContext = null
) {
  if (!hasUsableToken(getCurrentToken())) {
    restoreRouteContext(routeContext);

    return {
      ok: false,
      user: null,
      error: refreshError,
      protectedRoute: Boolean(routeContext?.preserve),
    };
  }

  try {
    const result = await restoreUsingMe(session);
    restoreRouteContext(routeContext);
    return result;
  } catch (meError) {
    const cached = keepCachedSessionAfterTransientFailure({
      error: meError,
      routeContext,
      source: "cached-after-refresh-me-transient",
    });

    if (cached) return cached;

    if (shouldClearForError(meError) || shouldClearForError(refreshError)) {
      clearSessionProtected({
        options,
        routeContext,
        reason: "refresh-me-failed-clearable",
      });
    } else {
      restoreRouteContext(routeContext);
    }

    emitError("auth:restore:error", meError, {
      protectedRoute: Boolean(routeContext?.preserve),
    }, options);

    return {
      ok: false,
      user: null,
      error: meError,
      protectedRoute: Boolean(routeContext?.preserve),
    };
  }
}

/* =========================================================
   RESTORE SESSION
========================================================= */

function looksLikeRuntimeSession(value) {
  return Boolean(
    isPlainObject(value) &&
      (
        "checking" in value ||
        "refreshing" in value ||
        "restoring" in value ||
        "restorePromise" in value
      )
  );
}

function resolveRestoreArgs(...args) {
  if (looksLikeRuntimeSession(args[0])) {
    return {
      session: args[0],
      options: safeObject(args[1]),
    };
  }

  return {
    session: runtimeSession,
    options: safeObject(args[0]),
  };
}

function normalizeRestoreOptions(options = {}) {
  const opts = safeObject(options);

  return {
    ...opts,
    silent: safeBool(opts.silent, false),
    publicRoute: safeBool(opts.publicRoute, false),
    preserveRoute: safeBool(opts.preserveRoute, false),
    preserveCurrentRoute: safeBool(opts.preserveCurrentRoute, false),
    activationBoot: safeBool(opts.activationBoot, false),
    resetConfirmBoot: safeBool(opts.resetConfirmBoot, false),
  };
}

function clearRuntimeFlags(session) {
  session.checking = false;
  session.refreshing = false;
  session.restoring = false;
  session.mePromise = null;
  session.refreshPromise = null;
  session.restorePromise = null;
}

export async function restoreSession(...args) {
  const { session, options: rawOptions } = resolveRestoreArgs(...args);
  const options = normalizeRestoreOptions(rawOptions);
  const routeContext = captureRouteContext(options);

  if (session.restorePromise) {
    return session.restorePromise;
  }

  session.restoring = true;

  emit("auth:restore:start", {
    hasToken: hasUsableToken(getCurrentToken()),
    hasUser: hasUsableUser(getCurrentUser()),
    hasCompleteAuthState: hasCompleteAuthState(),
    hasRefreshContext: hasRefreshContext(),
    hasUsableRefreshPayload: hasUsableRefreshPayload(),
    protectedRoute: routeContext.preserve,
    route: routeContext.route,
    publicPath: routeContext.publicPath,
  }, options);

  session.restorePromise = (async () => {
    try {
      const tokenAvailable = hasUsableToken(getCurrentToken());
      const refreshAvailable = canAttemptRefresh(session);

      if (tokenAvailable) {
        try {
          const result = await restoreUsingMe(session);

          restoreRouteContext(routeContext);
          session.lastRestoreAt = Date.now();

          return {
            ...result,
            protectedRoute: routeContext.preserve,
          };
        } catch (meError) {
          const result = await restoreAfterMeFailure(
            session,
            meError,
            options,
            routeContext
          );

          restoreRouteContext(routeContext);
          session.lastRestoreAt = Date.now();

          return result;
        }
      }

      if (refreshAvailable) {
        try {
          const result = await restoreUsingRefreshPreferred(session);

          restoreRouteContext(routeContext);
          session.lastRestoreAt = Date.now();

          return {
            ...result,
            protectedRoute: routeContext.preserve,
          };
        } catch (refreshError) {
          const cached = keepCachedSessionAfterTransientFailure({
            error: refreshError,
            routeContext,
            source: "cached-after-refresh-transient",
          });

          if (cached) return cached;

          if (shouldClearForError(refreshError)) {
            clearSessionProtected({
              options,
              routeContext,
              reason: "refresh-failed-clearable",
            });

            return {
              ok: false,
              user: null,
              error: refreshError,
              protectedRoute: routeContext.preserve,
            };
          }

          const result = await restoreUsingMeAfterRefreshFailure(
            session,
            refreshError,
            options,
            routeContext
          );

          restoreRouteContext(routeContext);
          session.lastRestoreAt = Date.now();

          return result;
        }
      }

      clearSessionProtected({
        options,
        routeContext,
        reason: "missing-token-and-refresh",
      });

      emit("auth:restore:empty", {
        reason: "missing-token-and-refresh",
        protectedRoute: routeContext.preserve,
      }, options);

      return {
        ok: false,
        user: null,
        protectedRoute: routeContext.preserve,
      };
    } catch (error) {
      const cached = keepCachedSessionAfterTransientFailure({
        error,
        routeContext,
        source: "cached-after-restore-transient",
      });

      if (cached) return cached;

      if (shouldClearForError(error)) {
        clearSessionProtected({
          options,
          routeContext,
          reason: "restore-failed-clearable",
        });
      } else {
        restoreRouteContext(routeContext);
      }

      emitError("auth:restore:error", error, {
        protectedRoute: routeContext.preserve,
      }, options);

      return {
        ok: false,
        user: null,
        error,
        protectedRoute: routeContext.preserve,
      };
    } finally {
      restoreRouteContext(routeContext);
      clearRuntimeFlags(session);
    }
  })();

  return session.restorePromise;
}

export const restoreSessionInBackground = restoreSession;

/* =========================================================
   DEBUG
========================================================= */

export function getRestoreSnapshot(sessionArg = runtimeSession) {
  const session = getSession(sessionArg);
  const routeContext = captureRouteContext({});
  const refreshPayload = getStoredRefreshPayload();
  const snapshot = getSafeSessionSnapshot();

  return {
    version: RESTORE_VERSION,

    authenticated: Boolean(snapshot.authenticated),
    hasToken: hasUsableToken(snapshot.token || snapshot.accessToken || getCurrentToken()),
    hasUser: hasUsableUser(snapshot.user || getCurrentUser()),

    user: sanitizeUserForEvent(snapshot.user || getCurrentUser()),
    role: snapshot.role || getState().role || null,

    checking: Boolean(session.checking),
    refreshing: Boolean(session.refreshing),
    restoring: Boolean(session.restoring),

    hasMePromise: Boolean(session.mePromise),
    hasRefreshPromise: Boolean(session.refreshPromise),
    hasRestorePromise: Boolean(session.restorePromise),

    refreshFailCount: safeNumber(session.refreshFailCount, 0),
    refreshBlockedUntil: safeNumber(session.refreshBlockedUntil, 0),

    lastCheckAt: safeNumber(session.lastCheckAt, 0),
    lastRefreshAt: safeNumber(session.lastRefreshAt, 0),
    lastRestoreAt: safeNumber(session.lastRestoreAt, 0),
    lastError: session.lastError || null,

    hasRefreshContext: hasRefreshContext(),
    hasUsableRefreshPayload: hasUsableRefreshPayload(refreshPayload),
    hasStoredRefreshToken: Boolean(refreshPayload.refreshToken),
    hasStoredSessionContext: Boolean(refreshPayload.sessionId && refreshPayload.userId),

    protectedRoute: routeContext.preserve,
    route: redact(routeContext.route),
    publicPath: redact(routeContext.publicPath),

    transport: {
      hasHttpClient: Boolean(getHttpClient()),
      apiBase: resolveApiBase(),
      me: resolveEndpoint("me", "/api/auth/me"),
      refresh: resolveEndpoint("refresh", "/api/auth/refresh"),
    },

    at: nowIso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  RESTORE_VERSION,

  fetchMe,
  refreshSession,

  restoreUsingMe,
  restoreUsingRefreshOnly,
  restoreUsingRefreshPreferred,
  restoreAfterMeFailure,

  restoreSession,
  restoreSessionInBackground,

  getRestoreSnapshot,
};
