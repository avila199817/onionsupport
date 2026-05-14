/* =========================================================
   Onion SPA - Auth Restore
   Archivo: src/features/auth/restore.js

   AUTH RESTORE · EXTREME PRO SYSTEM · 15/10
   TOKEN → /ME FIRST · REFRESH CONTEXT LOCKED · NO GHOST AUTH

   RESPONSABILIDADES:
   - cargar usuario actual desde /me
   - refrescar access token cuando proceda
   - restaurar sesión desde token o refresh context
   - serializar /me, refresh y restore
   - evitar carreras concurrentes
   - priorizar /me cuando ya existe token útil
   - usar refresh sólo con payload refresh útil
   - endurecer errores y limpieza de sesión
   - respetar rutas públicas técnicas durante boot
   - no romper /activate-account?token=...
   - no romper /activate-account/<token>
   - no romper /reset-password/confirm?token=...
   - no romper /reset-password/confirm/<token>
   - no confundir opciones restore con runtimeSession

   HARDENING EXTREMO:
   - promises únicas anti race-condition
   - cooldown anti refresh-loop
   - fallback token -> /me -> refresh si procede
   - limpieza auth protegida
   - preservación route/publicPath en activation/reset
   - eventos enterprise sin tokens reales
   - tolerancia backend heterogéneo
   - snapshot consistente
   - no romper boot aunque backend falle
   - no borrar sesión local válida ante error transitorio de red/API
   - no reutilizar usuario antiguo tras refresh token-only
   - no marcar authenticated sin token + user válidos
   - /api/auth/me privado con Authorization
   - /api/auth/me sin auto-refresh interno duplicado
   - refresh público sin auto-refresh recursivo
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  extractMessage,
} from "./helpers.js";

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
   VERSION
========================================================= */

export const RESTORE_VERSION =
  "15.0.0-god-mode";

const RESTORE_SOURCE =
  "auth.restore";

const BACKEND_ORIGIN =
  "https://api.onionit.net";

/* =========================================================
   INTERNAL RUNTIME SESSION
========================================================= */

const runtimeSession = {
  checking:
    false,

  refreshing:
    false,

  restoring:
    false,

  mePromise:
    null,

  refreshPromise:
    null,

  restorePromise:
    null,

  lastCheckAt:
    0,

  lastRefreshAt:
    0,

  lastRestoreAt:
    0,

  refreshFailCount:
    0,

  refreshBlockedUntil:
    0,

  lastError:
    null,
};

/* =========================================================
   ROUTE CONSTANTS
========================================================= */

const ACTIVATION_PATH =
  "/activate-account";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const PUBLIC_TECHNICAL_ROUTES =
  Object.freeze([
    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
  ]);

const ACTIVATION_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "activation_token",
    "activate_token",
    "code",
    "t",
  ]);

const RESET_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "resetToken",
    "passwordResetToken",
    "reset_token",
    "password_reset_token",
    "confirmToken",
    "confirm_token",
    "code",
    "t",
  ]);

const PROTECTED_PUBLIC_TOKEN_ROUTES =
  Object.freeze([
    Object.freeze({
      key:
        "activation",

      path:
        ACTIVATION_PATH,

      scrubFlags:
        [
          "scrubbedActivationToken",
          "activationTokenScrubbed",
          "scrubbedActivateAccountToken",
        ],

      windowKey:
        "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",

      legacyWindowKeys:
        [
          "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
        ],

      bootUrlKey:
        "bootActivationInitialUrl",

      bootPathKey:
        "bootActivationInitialPath",

      bootIsKey:
        "bootIsActivation",

      bootHasKey:
        "bootHasActivationToken",

      tokenParamNames:
        ACTIVATION_TOKEN_PARAM_NAMES,
    }),

    Object.freeze({
      key:
        "resetConfirm",

      path:
        RESET_CONFIRM_PATH,

      scrubFlags:
        [
          "scrubbedResetToken",
          "resetTokenScrubbed",
          "scrubbedResetPasswordToken",
          "scrubbedResetConfirmToken",
          "scrubbedPasswordResetToken",
        ],

      windowKey:
        "__ONION_RESET_CONFIRM_INITIAL_URL__",

      legacyWindowKeys:
        [
          "__ONION_RESET_CONFIRM_INITIAL_URL__",
          "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
        ],

      bootUrlKey:
        "bootResetConfirmInitialUrl",

      bootPathKey:
        "bootResetConfirmInitialPath",

      bootIsKey:
        "bootIsResetConfirm",

      bootHasKey:
        "bootHasResetToken",

      tokenParamNames:
        RESET_TOKEN_PARAM_NAMES,
    }),
  ]);

/* =========================================================
   AUTH ERROR CONSTANTS
========================================================= */

const AUTH_FAILURE_CODES =
  new Set([
    "INVALID_CREDENTIALS",
    "MISSING_CREDENTIALS",
    "ACCOUNT_TEMPORARILY_LOCKED",
    "ACCOUNT_DISABLED",
    "USER_DISABLED",
    "USER_NOT_AVAILABLE",
    "USER_NOT_FOUND",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "TOKEN_INVALID",
    "INVALID_TOKEN",
    "TOKEN_EXPIRED",
    "SESSION_EXPIRED",
    "SESSION_REVOKED",
    "SESSION_NOT_FOUND",
    "INVALID_LOGIN_SESSION",
    "LOGIN_FAILED",
    "AUTH_FAILED",
    "AUTH_RESTORE_FAILED",
    "REFRESH_CONTEXT_MISSING",
    "REFRESH_INVALID_SESSION",
    "REFRESH_EMPTY_RESPONSE",
    "REFRESH_USER_WITHOUT_TOKEN",
    "REFRESH_UNUSABLE_RESPONSE",
    "ME_INVALID_SESSION",
    "ME_USER_MISSING",
    "TOKEN_VERSION_MISMATCH",
  ]);

const TRANSIENT_STATUS_CODES =
  new Set([
    0,
    408,
    425,
    429,
    500,
    502,
    503,
    504,
  ]);

const TOKEN_KEYS =
  Object.freeze([
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

const REFRESH_TOKEN_KEYS =
  Object.freeze([
    "refreshToken",
    "refresh_token",
  ]);

const USER_KEYS =
  Object.freeze([
    "user",
    "usuario",
    "me",
    "account",
    "profile",
    "currentUser",
    "current_user",
  ]);

const SESSION_KEYS =
  Object.freeze([
    "session",
    "sessionData",
    "authSession",
    "auth_session",
  ]);

const SESSION_ID_KEYS =
  Object.freeze([
    "sessionId",
    "session_id",
    "sid",
    "id",
  ]);

const SESSION_USER_ID_KEYS =
  Object.freeze([
    "sessionUserId",
    "session_user_id",
    "userId",
    "user_id",
    "uid",
    "sub",
  ]);

const AUTH_OBJECT_KEYS =
  Object.freeze([
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
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return isPlainObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeLower(value = "", fallback = "") {
  return safeText(
    value,
    fallback
  ).toLowerCase();
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
        "enabled",
        "active",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "disabled",
        "inactive",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function firstText(...values) {
  return safeText(
    first(...values),
    ""
  );
}

function hasOwn(object, key) {
  try {
    return Object.prototype.hasOwnProperty.call(
      object,
      key
    );
  } catch {
    return false;
  }
}

function getState() {
  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function safeSetState(patch = {}, options = {}) {
  const nextPatch =
    safeObject(patch);

  try {
    AppCore?.setState?.(
      nextPatch,
      options
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        nextPatch
      );
    }
  } catch {}

  return getState();
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function getMaxSequentialFailures() {
  return safeNumber(
    AUTH_CONSTANTS?.maxSequentialRefreshFailures,
    3
  );
}

function getRefreshRetryCooldownMs() {
  return safeNumber(
    AUTH_CONSTANTS?.refreshRetryCooldownMs,
    30_000
  );
}

/* =========================================================
   LOG / EVENTS
========================================================= */

function log(...args) {
  try {
    AppCore?.utils?.log?.(
      "[AuthRestore]",
      ...args
    );
  } catch {}
}

function warn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthRestore]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[AuthRestore]",
        ...args
      );
    }
  } catch {}
}

function redactRouteValue(value = "") {
  return safeText(value, "")
    .replace(
      /([?&#](?:token|activationToken|activateToken|activation_token|activate_token|resetToken|passwordResetToken|reset_token|password_reset_token|confirmToken|confirm_token|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    )
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function sanitizeUserForEvent(user = null) {
  if (!isPlainObject(user)) {
    return null;
  }

  const output = {
    ...user,
  };

  for (const key of [
    "password",
    "passwordHash",
    "password_hash",
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

  if (output.avatar) {
    output.avatar =
      redactRouteValue(output.avatar);
  }

  if (output.avatarUrl) {
    output.avatarUrl =
      redactRouteValue(output.avatarUrl);
  }

  return output;
}

function sanitizeEventPayload(payload = {}) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const output = {
    ...payload,
  };

  [
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
  ].forEach((key) => {
    if (key in output) {
      output[key] =
        null;
    }
  });

  [
    "route",
    "publicPath",
    "browserPath",
    "initialUrl",
    "activationInitialUrl",
    "resetConfirmInitialUrl",
    "url",
  ].forEach((key) => {
    if (output[key]) {
      output[key] =
        redactRouteValue(output[key]);
    }
  });

  if (output.user) {
    output.user =
      sanitizeUserForEvent(output.user);
  }

  if (output.error?.raw) {
    output.error = {
      ...output.error,
      raw:
        undefined,
    };
  }

  return output;
}

function shouldEmitRestoreEvent(eventName = "", options = {}) {
  const opts =
    safeObject(options);

  if (opts.emitEvents === false) {
    return false;
  }

  if (
    opts.silent === true &&
    opts.emitSilentEvents !== true
  ) {
    return false;
  }

  return true;
}

function emit(eventName = "", payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  if (!shouldEmitRestoreEvent(name, options)) {
    return false;
  }

  const cleanPayload =
    sanitizeEventPayload({
      source:
        RESTORE_SOURCE,

      version:
        RESTORE_VERSION,

      at:
        safeIsoDate(),

      ...safeObject(payload),
    });

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        name,
        cleanPayload
      );

      busEmitted =
        true;
    }
  } catch {}

  if (
    options.document === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      document.dispatchEvent(
        new CustomEvent(name, {
          detail:
            cleanPayload,
          bubbles:
            false,
          cancelable:
            false,
        })
      );

      return true;
    } catch {}
  }

  return busEmitted;
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
    name:
      safeText(error?.name, "Error"),

    status:
      getErrorStatus(error) || null,

    code:
      getErrorCode(error) || null,

    message:
      extractMessage(error) ||
      safeText(error?.message, "Error"),

    timeout:
      Boolean(error?.timeout),

    aborted:
      Boolean(error?.aborted),

    at:
      safeIsoDate(),
  };
}

function emitError(eventName, error, extra = {}, options = {}) {
  return emit(
    eventName,
    {
      ...extra,
      error:
        buildErrorPayload(error),
      message:
        extractMessage(error),
      source:
        RESTORE_SOURCE,
    },
    options
  );
}

/* =========================================================
   API TRANSPORT
========================================================= */

function resolveApiBase() {
  const config =
    safeObject(AppCore?.config);

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
  const raw =
    safeText(path, "/");

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const base =
    resolveApiBase();

  const cleanPath =
    raw.startsWith("/")
      ? raw
      : `/${raw}`;

  if (
    base.endsWith("/api") &&
    cleanPath.startsWith("/api/")
  ) {
    return `${base}${cleanPath.slice(4)}`;
  }

  return `${base}${cleanPath}`;
}

function getHttpService() {
  return (
    AppCore?.http ||
    AppCore?.Http ||
    AppCore?.services?.http ||
    AppCore?.services?.Http ||
    AppCore?.services?.api ||
    AppCore?.services?.Api ||
    null
  );
}

function getApiClient() {
  return (
    AppCore?.apiClient ||
    AppCore?.services?.apiClient ||
    AppCore?.services?.api ||
    AppCore?.services?.http ||
    AppCore?.http ||
    AppCore?.request ||
    null
  );
}

function resolveEndpoint(key, fallback = "") {
  const endpoint =
    safeText(
      AUTH_ENDPOINTS?.[key] ||
        AUTH_ENDPOINTS?.auth?.[key] ||
        AppCore?.config?.auth?.endpoints?.[key] ||
        AppCore?.config?.endpoints?.auth?.[key],
      fallback
    );

  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  if (endpoint.startsWith("/api/")) {
    return endpoint;
  }

  if (endpoint.startsWith("/auth/")) {
    return `/api${endpoint}`;
  }

  if (endpoint.startsWith("/")) {
    return `/api/auth${endpoint}`;
  }

  return `/api/auth/${endpoint}`;
}

function buildAuthHeaders(options = {}) {
  const opts =
    safeObject(options);

  const headers = {
    Accept:
      "application/json",
    "X-Onion-Client":
      "onion-spa",
    ...(safeObject(opts.headers)),
  };

  if (
    opts.auth === false ||
    opts.skipAuth === true ||
    opts.public === true
  ) {
    return headers;
  }

  const token =
    opts.token ||
    getCurrentToken();

  if (
    hasUsableToken(token) &&
    !headers.Authorization &&
    !headers.authorization
  ) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  return headers;
}

async function requestWithClient(client, method = "GET", path = "", body = null, options = {}) {
  const upperMethod =
    safeText(method, "GET")
      .toUpperCase();

  if (!client) {
    throw createRestoreError(
      "No hay cliente API disponible.",
      {
        status:
          500,
        code:
          "API_CLIENT_MISSING",
      }
    );
  }

  const opts = {
    ...safeObject(options),

    method:
      upperMethod,

    headers:
      buildAuthHeaders(options),

    noStore:
      true,

    cache:
      "no-store",
  };

  if (
    body !== undefined &&
    body !== null &&
    upperMethod !== "GET" &&
    upperMethod !== "HEAD"
  ) {
    opts.body =
      body;
  }

  if (
    upperMethod === "GET" &&
    isFunction(client.get)
  ) {
    return client.get(
      path,
      opts
    );
  }

  if (
    upperMethod === "POST" &&
    isFunction(client.post)
  ) {
    return client.post(
      path,
      body,
      opts
    );
  }

  if (
    upperMethod === "PUT" &&
    isFunction(client.put)
  ) {
    return client.put(
      path,
      body,
      opts
    );
  }

  if (
    upperMethod === "PATCH" &&
    isFunction(client.patch)
  ) {
    return client.patch(
      path,
      body,
      opts
    );
  }

  if (
    upperMethod === "DELETE" &&
    isFunction(client.delete)
  ) {
    return client.delete(
      path,
      opts
    );
  }

  if (isFunction(client.request)) {
    try {
      return await client.request(
        upperMethod,
        path,
        opts
      );
    } catch (firstError) {
      try {
        return await client.request(
          path,
          opts
        );
      } catch {
        throw firstError;
      }
    }
  }

  if (isFunction(client)) {
    return client(
      path,
      opts
    );
  }

  throw createRestoreError(
    `El cliente API no soporta ${upperMethod}.`,
    {
      status:
        500,
      code:
        `API_CLIENT_${upperMethod}_MISSING`,
    }
  );
}

async function requestWithFetch(method = "GET", path = "", body = null, options = {}) {
  if (
    !isBrowser() ||
    !isFunction(fetch)
  ) {
    throw createRestoreError(
      "Fetch API no disponible.",
      {
        status:
          500,
        code:
          "FETCH_UNAVAILABLE",
      }
    );
  }

  const upperMethod =
    safeText(method, "GET")
      .toUpperCase();

  const url =
    buildAbsoluteApiUrl(path);

  const headers =
    buildAuthHeaders(options);

  const hasBody =
    body !== undefined &&
    body !== null &&
    upperMethod !== "GET" &&
    upperMethod !== "HEAD";

  if (
    hasBody &&
    typeof FormData !== "undefined" &&
    !(body instanceof FormData) &&
    !headers["Content-Type"] &&
    !headers["content-type"]
  ) {
    headers["Content-Type"] =
      "application/json";
  }

  const response =
    await fetch(url, {
      method:
        upperMethod,

      credentials:
        options.credentials || "include",

      cache:
        "no-store",

      headers,

      signal:
        options.signal || undefined,

      body:
        hasBody
          ? typeof FormData !== "undefined" && body instanceof FormData
            ? body
            : JSON.stringify(body)
          : undefined,
    });

  const contentType =
    response.headers?.get?.("content-type") || "";

  let payload =
    null;

  if (contentType.includes("application/json")) {
    try {
      payload =
        await response.json();
    } catch {
      payload =
        null;
    }
  } else {
    try {
      payload =
        await response.text();
    } catch {
      payload =
        "";
    }
  }

  if (!response.ok) {
    const error =
      createRestoreError(
        safeText(
          payload?.message ||
            payload?.error ||
            response.statusText,
          `HTTP ${response.status}`
        ),
        {
          status:
            response.status,
          code:
            payload?.code ||
            payload?.error ||
            (
              response.status === 401
                ? "UNAUTHORIZED"
                : response.status === 403
                  ? "FORBIDDEN"
                  : "AUTH_API_ERROR"
            ),
          response,
        }
      );

    error.data =
      payload;

    throw error;
  }

  return payload;
}

async function authApiRequest(method = "GET", path = "", body = null, options = {}) {
  const client =
    getApiClient() ||
    getHttpService();

  try {
    return await requestWithClient(
      client,
      method,
      path,
      body,
      options
    );
  } catch (coreError) {
    if (
      options.noFetchFallback === true ||
      coreError?.name === "AbortError" ||
      coreError?.aborted === true
    ) {
      throw coreError;
    }

    return requestWithFetch(
      method,
      path,
      body,
      options
    );
  }
}

async function apiGet(path, options = {}) {
  return authApiRequest(
    "GET",
    path,
    null,
    {
      auth:
        true,
      public:
        false,
      skipAuth:
        false,
      silent:
        true,
      storeError:
        false,
      dedupe:
        false,
      _skipAuthRefresh:
        true,
      ...safeObject(options),
    }
  );
}

async function apiPost(path, body = {}, options = {}) {
  return authApiRequest(
    "POST",
    path,
    body,
    {
      auth:
        false,
      public:
        true,
      skipAuth:
        true,
      silent:
        true,
      storeError:
        false,
      dedupe:
        false,
      _skipAuthRefresh:
        true,
      ...safeObject(options),
    }
  );
}

/* =========================================================
   SESSION VALIDATION
========================================================= */

function stripBearer(token = "") {
  return safeText(token, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function hasUsableToken(token = "") {
  const value =
    stripBearer(token);

  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

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

  if (/[\s\r\n\t]/.test(value)) {
    return false;
  }

  try {
    if (isFunction(AppCore?.utils?.hasValidToken)) {
      return Boolean(
        AppCore.utils.hasValidToken(value)
      );
    }
  } catch {}

  return true;
}

function isUserActive(user = null) {
  if (!isPlainObject(user)) {
    return false;
  }

  const status =
    safeLower(
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
    user.isDisabled === true ||
    user.deleted === true ||
    user.isDeleted === true ||
    user.blocked === true ||
    user.isBlocked === true ||
    user.banned === true ||
    user.suspended === true ||
    user.revoked === true
  ) {
    return false;
  }

  const activeCandidate =
    user.active ??
    user.is_active ??
    user.isActive ??
    user.enabled ??
    user.isEnabled;

  if (
    activeCandidate === undefined ||
    activeCandidate === null ||
    activeCandidate === ""
  ) {
    return true;
  }

  return safeBool(
    activeCandidate,
    true
  );
}

function normalizeUserForRestore(user = null) {
  if (!isPlainObject(user)) {
    return null;
  }

  try {
    const normalized =
      normalizeUser?.(user);

    if (
      normalized &&
      hasUsableUser(normalized)
    ) {
      return normalized;
    }
  } catch {}

  return hasUsableUser(user)
    ? user
    : null;
}

function hasUsableUser(user = {}) {
  if (
    !isPlainObject(user) ||
    !isUserActive(user)
  ) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.sub, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.user_name, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "") ||
      safeText(user.mobile, "") ||
      safeText(user.displayName, "") ||
      safeText(user.name, "")
  );
}

function getCurrentToken() {
  const state =
    getState();

  return firstText(
    state.token,
    state.accessToken,
    state.access_token,
    state.session?.token,
    state.session?.accessToken,
    state.session?.access_token,
    state.sessionData?.token,
    state.sessionData?.accessToken,
    state.sessionData?.access_token
  );
}

function getCurrentUser() {
  const state =
    getState();

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
  return Boolean(
    hasUsableToken(getCurrentToken()) &&
      hasUsableUser(getCurrentUser())
  );
}

function createRestoreError(
  message = "No se pudo restaurar la sesión.",
  {
    status = 401,
    code = "INVALID_RESTORE_SESSION",
    response = null,
  } = {}
) {
  const error =
    new Error(message);

  error.name =
    "AuthRestoreError";

  error.status =
    status;

  error.code =
    code;

  error.data = {
    code,
    message,
    status,
  };

  error.response =
    response;

  try {
    Object.defineProperty(
      error,
      "raw",
      {
        value:
          response,
        enumerable:
          false,
        configurable:
          true,
      }
    );
  } catch {
    error.raw =
      response;
  }

  return error;
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function collectAuthObjects(raw = {}) {
  const output =
    [];

  const seen =
    new Set();

  const queue =
    [raw];

  let guard =
    0;

  while (
    queue.length &&
    guard < 120
  ) {
    guard += 1;

    const current =
      queue.shift();

    if (
      !isPlainObject(current) ||
      seen.has(current)
    ) {
      continue;
    }

    seen.add(current);
    output.push(current);

    for (const key of AUTH_OBJECT_KEYS) {
      const nested =
        current[key];

      if (isPlainObject(nested)) {
        queue.push(nested);
      }
    }

    if (isPlainObject(current.response?.data)) {
      queue.push(current.response.data);
    }

    if (isPlainObject(current.data?.auth)) {
      queue.push(current.data.auth);
    }

    if (isPlainObject(current.data?.session)) {
      queue.push(current.data.session);
    }
  }

  return output;
}

function pickValueFromObjects(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (
        object &&
        object[key] !== null &&
        object[key] !== undefined &&
        object[key] !== ""
      ) {
        return object[key];
      }
    }
  }

  return undefined;
}

function pickTextFromObjects(objects = [], keys = []) {
  return safeText(
    pickValueFromObjects(
      objects,
      keys
    ),
    ""
  );
}

function pickObjectFromObjects(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (isPlainObject(object?.[key])) {
        return object[key];
      }
    }
  }

  return null;
}

function getResponseNodes(response = null) {
  const raw =
    safeObject(response);

  const data =
    safeObject(raw.data);

  const payload =
    safeObject(raw.payload);

  const result =
    safeObject(raw.result);

  const body =
    safeObject(raw.body);

  const nestedResponse =
    safeObject(raw.response);

  const responseData =
    safeObject(nestedResponse.data);

  return {
    raw,
    data,
    payload,
    result,
    body,
    nestedResponse,
    responseData,
  };
}

function getResponseStatus(response = null) {
  const {
    raw,
    data,
    payload,
    result,
    body,
    nestedResponse,
    responseData,
  } =
    getResponseNodes(response);

  return first(
    raw.status,
    raw.statusCode,
    raw.status_code,

    data.status,
    data.statusCode,
    data.status_code,

    payload.status,
    payload.statusCode,
    payload.status_code,

    result.status,
    result.statusCode,
    result.status_code,

    body.status,
    body.statusCode,
    body.status_code,

    nestedResponse.status,
    nestedResponse.statusCode,
    nestedResponse.status_code,

    responseData.status,
    responseData.statusCode,
    responseData.status_code
  );
}

function getResponseCode(response = null) {
  const {
    raw,
    data,
    payload,
    result,
    body,
    nestedResponse,
    responseData,
  } =
    getResponseNodes(response);

  return firstText(
    raw.code,
    raw.error,
    raw.errorCode,
    raw.error_code,

    data.code,
    data.error,
    data.errorCode,
    data.error_code,

    payload.code,
    payload.error,
    payload.errorCode,
    payload.error_code,

    result.code,
    result.error,
    result.errorCode,
    result.error_code,

    body.code,
    body.error,
    body.errorCode,
    body.error_code,

    nestedResponse.code,
    nestedResponse.error,
    nestedResponse.errorCode,
    nestedResponse.error_code,

    responseData.code,
    responseData.error,
    responseData.errorCode,
    responseData.error_code
  );
}

function getResponseMessage(response = null) {
  const {
    raw,
    data,
    payload,
    result,
    body,
    nestedResponse,
    responseData,
  } =
    getResponseNodes(response);

  return firstText(
    raw.message,
    raw.mensaje,
    raw.errorMessage,
    raw.error_message,
    raw.detail,
    raw.description,

    data.message,
    data.mensaje,
    data.errorMessage,
    data.error_message,
    data.detail,
    data.description,

    payload.message,
    payload.mensaje,
    payload.errorMessage,
    payload.error_message,
    payload.detail,
    payload.description,

    result.message,
    result.mensaje,
    result.errorMessage,
    result.error_message,
    result.detail,
    result.description,

    body.message,
    body.mensaje,
    body.errorMessage,
    body.error_message,
    body.detail,
    body.description,

    nestedResponse.message,
    nestedResponse.mensaje,
    nestedResponse.errorMessage,
    nestedResponse.error_message,
    nestedResponse.detail,
    nestedResponse.description,

    responseData.message,
    responseData.mensaje,
    responseData.errorMessage,
    responseData.error_message,
    responseData.detail,
    responseData.description
  );
}

function isExplicitAuthFailure(response = null) {
  if (
    !response ||
    !isPlainObject(response)
  ) {
    return false;
  }

  const {
    raw,
    data,
    payload,
    result,
    body,
    nestedResponse,
    responseData,
  } =
    getResponseNodes(response);

  const status =
    Number(getResponseStatus(response) || 0);

  if (
    Number.isFinite(status) &&
    status >= 400
  ) {
    return true;
  }

  const code =
    safeText(getResponseCode(response), "")
      .toUpperCase();

  if (
    code &&
    AUTH_FAILURE_CODES.has(code)
  ) {
    return true;
  }

  return Boolean(
    raw.ok === false ||
      raw.success === false ||
      data.ok === false ||
      data.success === false ||
      payload.ok === false ||
      payload.success === false ||
      result.ok === false ||
      result.success === false ||
      body.ok === false ||
      body.success === false ||
      nestedResponse.ok === false ||
      nestedResponse.success === false ||
      responseData.ok === false ||
      responseData.success === false
  );
}

function extractUserFallback(response = null) {
  const objects =
    collectAuthObjects(response);

  const direct =
    normalizeUserForRestore(
      extractUser(response)
    );

  if (direct) {
    return direct;
  }

  const candidate =
    pickObjectFromObjects(
      objects,
      USER_KEYS
    );

  return normalizeUserForRestore(candidate);
}

function extractTokenFallback(response = null) {
  const imported =
    safeText(
      extractToken(response),
      ""
    );

  if (hasUsableToken(imported)) {
    return imported;
  }

  return pickTextFromObjects(
    collectAuthObjects(response),
    TOKEN_KEYS
  );
}

function extractRefreshTokenFallback(response = null) {
  const imported =
    safeText(
      extractRefreshToken(response),
      ""
    );

  if (imported) {
    return imported;
  }

  return pickTextFromObjects(
    collectAuthObjects(response),
    REFRESH_TOKEN_KEYS
  );
}

function normalizeSessionPayloadFallback(response = null) {
  try {
    const normalized =
      normalizeSessionPayload(response);

    if (isPlainObject(normalized)) {
      return normalized;
    }
  } catch {}

  const objects =
    collectAuthObjects(response);

  const session =
    pickObjectFromObjects(
      objects,
      SESSION_KEYS
    ) || {};

  const sessionId =
    pickTextFromObjects(
      objects,
      SESSION_ID_KEYS
    );

  const sessionUserId =
    pickTextFromObjects(
      objects,
      SESSION_USER_ID_KEYS
    );

  if (
    !Object.keys(session).length &&
    !sessionId &&
    !sessionUserId
  ) {
    return null;
  }

  return {
    ...session,

    sessionId:
      session.sessionId ||
      session.session_id ||
      session.sid ||
      session.id ||
      sessionId ||
      null,

    session_id:
      session.session_id ||
      session.sessionId ||
      session.sid ||
      session.id ||
      sessionId ||
      null,

    sessionUserId:
      session.sessionUserId ||
      session.session_user_id ||
      session.userId ||
      session.user_id ||
      sessionUserId ||
      null,

    session_user_id:
      session.session_user_id ||
      session.sessionUserId ||
      session.userId ||
      session.user_id ||
      sessionUserId ||
      null,

    userId:
      session.userId ||
      session.user_id ||
      sessionUserId ||
      null,

    user_id:
      session.user_id ||
      session.userId ||
      sessionUserId ||
      null,
  };
}

function normalizeAuthResponse(response = null) {
  if (isExplicitAuthFailure(response)) {
    return {
      ok:
        false,
      explicitFailure:
        true,

      token:
        "",
      user:
        null,
      refreshToken:
        "",
      sessionData:
        null,

      status:
        getResponseStatus(response) ||
        "auth_failed",

      code:
        getResponseCode(response) ||
        "AUTH_FAILED",

      message:
        getResponseMessage(response) ||
        "No se pudo restaurar la sesión.",

      response,
    };
  }

  const token =
    safeText(
      extractTokenFallback(response),
      ""
    );

  const user =
    extractUserFallback(response);

  const refreshToken =
    safeText(
      extractRefreshTokenFallback(response),
      ""
    );

  const sessionData =
    normalizeSessionPayloadFallback(response);

  const hasToken =
    hasUsableToken(token);

  const hasUser =
    hasUsableUser(user);

  return {
    ok:
      Boolean(hasToken || hasUser),
    explicitFailure:
      false,

    token,
    user:
      hasUser
        ? user
        : null,
    refreshToken,
    sessionData,

    status:
      getResponseStatus(response) ||
      (
        hasToken && hasUser
          ? "authenticated"
          : hasToken
            ? "token_only"
            : hasUser
              ? "user_only"
              : ""
      ),

    code:
      getResponseCode(response) || "",

    message:
      getResponseMessage(response) || "",

    response,
  };
}

function assertNoExplicitFailure(auth = {}) {
  if (
    auth.explicitFailure ||
    auth.ok === false
  ) {
    throw createRestoreError(
      auth.message ||
        "No se pudo restaurar la sesión.",
      {
        status:
          Number(auth.status) || 401,
        code:
          auth.code ||
          "AUTH_RESTORE_FAILED",
        response:
          auth.response,
      }
    );
  }
}

/* =========================================================
   RUNTIME ARGUMENTS
========================================================= */

function looksLikeRuntimeSession(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (
        hasOwn(value, "checking") ||
        hasOwn(value, "refreshing") ||
        hasOwn(value, "restoring") ||
        hasOwn(value, "mePromise") ||
        hasOwn(value, "refreshPromise") ||
        hasOwn(value, "restorePromise")
      )
  );
}

function getSession(sessionArg) {
  return looksLikeRuntimeSession(sessionArg)
    ? sessionArg
    : runtimeSession;
}

function resolveRestoreArgs(...args) {
  const firstArg =
    args[0];

  const secondArg =
    args[1];

  if (looksLikeRuntimeSession(firstArg)) {
    return {
      session:
        firstArg,
      options:
        safeObject(secondArg),
    };
  }

  return {
    session:
      runtimeSession,
    options:
      safeObject(firstArg),
  };
}

function normalizeRestoreOptions(options = {}) {
  const opts =
    safeObject(options);

  return {
    ...opts,

    silent:
      safeBool(opts.silent, false),

    skipNavigation:
      safeBool(opts.skipNavigation, false),

    publicRoute:
      safeBool(opts.publicRoute, false),

    preserveCurrentRoute:
      safeBool(opts.preserveCurrentRoute, false),

    preserveRoute:
      safeBool(opts.preserveRoute, false),

    route:
      opts.route,

    publicPath:
      opts.publicPath,

    activationBoot:
      safeBool(opts.activationBoot, false),

    resetConfirmBoot:
      safeBool(opts.resetConfirmBoot, false),
  };
}

function clearRuntimeFlags(session) {
  if (!session) {
    return;
  }

  session.checking =
    false;

  session.refreshing =
    false;

  session.restoring =
    false;

  session.mePromise =
    null;

  session.refreshPromise =
    null;

  session.restorePromise =
    null;
}

/* =========================================================
   PATH / ROUTE PROTECTION
========================================================= */

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function normalizePathnameOnly(pathname = "/") {
  let value =
    String(pathname || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      "/";
  }

  return value;
}

function stripSearchAndHash(path = "/") {
  const raw =
    safeText(path, "/");

  return normalizePathnameOnly(
    raw
      .split("?")[0]
      .split("#")[0] ||
      "/"
  );
}

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return `${normalizePathnameOnly(parsed.pathname || "/")}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    const hashIndex =
      raw.indexOf("#");

    if (hashIndex >= 0) {
      const hash =
        raw.slice(hashIndex);

      if (isHashRouterPath(hash)) {
        return normalizeHashRouterPath(hash);
      }
    }

    return raw.startsWith("/")
      ? raw
      : `/${raw}`;
  }
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeHashRouterPath(hash);
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function getInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      window.__ONION_INITIAL_URL__,
      ""
    );
  } catch {
    return "";
  }
}

function getStoredTechnicalInitialUrl(routeConfig) {
  if (
    !isBrowser() ||
    !routeConfig
  ) {
    return "";
  }

  const keys = [
    routeConfig.windowKey,
    ...(Array.isArray(routeConfig.legacyWindowKeys)
      ? routeConfig.legacyWindowKeys
      : []),
  ].filter(Boolean);

  for (const key of keys) {
    try {
      const value =
        safeText(
          window[key],
          ""
        );

      if (value) {
        return value;
      }
    } catch {}
  }

  return "";
}

function getCanonicalPathFromAny(value = "/") {
  return stripSearchAndHash(
    pathFromUrlLike(value) ||
      value ||
      "/"
  );
}

function isPublicTechnicalCanonical(path = "/") {
  const clean =
    stripSearchAndHash(path);

  return PUBLIC_TECHNICAL_ROUTES.some((candidate) => {
    return (
      clean === candidate ||
      clean.startsWith(`${candidate}/`)
    );
  });
}

function matchesTechnicalRoute(routeConfig, value = "") {
  if (!routeConfig) {
    return false;
  }

  const clean =
    getCanonicalPathFromAny(value);

  return (
    clean === routeConfig.path ||
    clean.startsWith(`${routeConfig.path}/`)
  );
}

function extractRoutePathToken(routeConfig, value = "") {
  if (!routeConfig) {
    return "";
  }

  const path =
    pathFromUrlLike(value) ||
    value ||
    "";

  const pathname =
    stripSearchAndHash(path);

  if (!pathname.startsWith(`${routeConfig.path}/`)) {
    return "";
  }

  const token =
    pathname
      .slice(`${routeConfig.path}/`.length)
      .split("/")[0];

  try {
    return safeText(
      decodeURIComponent(token || ""),
      ""
    );
  } catch {
    return safeText(token, "");
  }
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return names.some((name) =>
      Boolean(
        safeText(
          params.get(name),
          ""
        )
      )
    );
  } catch {
    return false;
  }
}

function hasTechnicalRouteToken(routeConfig, value = "") {
  if (!routeConfig) {
    return false;
  }

  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  const path =
    pathFromUrlLike(raw) ||
    raw;

  if (
    matchesTechnicalRoute(routeConfig, path) &&
    extractRoutePathToken(routeConfig, path)
  ) {
    return true;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      hasTokenInSearch(
        parsed.search,
        routeConfig.tokenParamNames
      )
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        routeConfig.tokenParamNames
      );
    }
  } catch {
    if (path.includes("?")) {
      const query =
        path
          .split("?")
          .slice(1)
          .join("?")
          .split("#")[0];

      if (
        hasTokenInSearch(
          query ? `?${query}` : "",
          routeConfig.tokenParamNames
        )
      ) {
        return true;
      }
    }

    if (
      path.includes("#") &&
      path.includes("?")
    ) {
      const query =
        path
          .split("?")
          .slice(1)
          .join("?");

      if (
        hasTokenInSearch(
          query ? `?${query}` : "",
          routeConfig.tokenParamNames
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function isHistoryStateFlagEnabled(flag = "") {
  if (
    !isBrowser() ||
    !flag
  ) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.[flag]
    );
  } catch {
    return false;
  }
}

function isTechnicalTokenScrubbed(routeConfig) {
  const flags =
    Array.isArray(routeConfig?.scrubFlags)
      ? routeConfig.scrubFlags
      : [
          routeConfig?.scrubFlag,
        ].filter(Boolean);

  return flags.some((flag) =>
    isHistoryStateFlagEnabled(flag)
  );
}

function detectProtectedTokenBoot(routeConfig) {
  if (!routeConfig) {
    return false;
  }

  const state =
    getState();

  if (
    state?.[routeConfig.bootIsKey] === true &&
    state?.[routeConfig.bootHasKey] === true
  ) {
    return true;
  }

  if (isTechnicalTokenScrubbed(routeConfig)) {
    return false;
  }

  const candidates =
    [
      state?.bootProtectedInitialUrl,
      state?.[routeConfig.bootUrlKey],
      state?.[routeConfig.bootPathKey],
      getStoredTechnicalInitialUrl(routeConfig),
      state?.bootInitialUrl,
      getInitialUrl(),
      getBrowserPublicPath(),
      state?.publicPath,
      state?.route,
    ]
      .map((value) =>
        safeText(value, "")
      )
      .filter(Boolean);

  return candidates.some((candidate) => {
    return (
      matchesTechnicalRoute(routeConfig, candidate) &&
      hasTechnicalRouteToken(routeConfig, candidate)
    );
  });
}

function detectAnyProtectedTokenBoot() {
  return (
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((routeConfig) =>
      detectProtectedTokenBoot(routeConfig)
    ) || null
  );
}

function captureRouteContext(options = {}) {
  const state =
    getState();

  const browserPath =
    getBrowserPublicPath();

  const publicPath =
    safeText(options.publicPath || state.publicPath, "") ||
    browserPath ||
    "/";

  const route =
    safeText(options.route || state.route, "") ||
    getCanonicalPathFromAny(publicPath);

  const canonical =
    getCanonicalPathFromAny(
      publicPath ||
        route ||
        browserPath ||
        "/"
    );

  const protectedBootConfig =
    detectAnyProtectedTokenBoot();

  const activationBoot =
    Boolean(
      options.activationBoot ||
        protectedBootConfig?.key === "activation"
    );

  const resetConfirmBoot =
    Boolean(
      options.resetConfirmBoot ||
        protectedBootConfig?.key === "resetConfirm"
    );

  const publicTechnical =
    isPublicTechnicalCanonical(canonical);

  const shouldProtect =
    Boolean(
      options.publicRoute ||
        options.preserveCurrentRoute ||
        options.preserveRoute ||
        activationBoot ||
        resetConfirmBoot ||
        publicTechnical
    );

  return {
    shouldProtect,
    publicTechnical,

    protectedRouteKey:
      protectedBootConfig?.key || "",

    activationBoot,
    resetConfirmBoot,

    route:
      getCanonicalPathFromAny(route || canonical || "/"),

    publicPath:
      publicPath ||
      browserPath ||
      route ||
      "/",

    browserPath,

    initialUrl:
      getInitialUrl(),

    activationInitialUrl:
      getStoredTechnicalInitialUrl(
        PROTECTED_PUBLIC_TOKEN_ROUTES[0]
      ),

    resetConfirmInitialUrl:
      getStoredTechnicalInitialUrl(
        PROTECTED_PUBLIC_TOKEN_ROUTES[1]
      ),

    canonical,
  };
}

function restoreRouteContext(routeContext = {}) {
  if (!routeContext?.shouldProtect) {
    return false;
  }

  const route =
    routeContext.route ||
    routeContext.canonical ||
    "/";

  const publicPath =
    routeContext.publicPath ||
    routeContext.browserPath ||
    route;

  try {
    AppCore?.setRoute?.(route);
  } catch {}

  try {
    AppCore?.setPublicPath?.(publicPath);
  } catch {}

  safeSetState({
    route,
    publicPath,

    bootIsActivation:
      Boolean(
        routeContext.activationBoot ||
          getState().bootIsActivation
      ),

    bootHasActivationToken:
      Boolean(
        routeContext.activationBoot ||
          getState().bootHasActivationToken
      ),

    bootIsResetConfirm:
      Boolean(
        routeContext.resetConfirmBoot ||
          getState().bootIsResetConfirm
      ),

    bootHasResetToken:
      Boolean(
        routeContext.resetConfirmBoot ||
          getState().bootHasResetToken
      ),

    bootProtectedRouteKey:
      routeContext.protectedRouteKey ||
      getState().bootProtectedRouteKey ||
      "",
  });

  return true;
}

function clearSessionLocalProtected({
  options = {},
  routeContext = null,
  reason = "",
} = {}) {
  const ctx =
    routeContext ||
    captureRouteContext(options);

  try {
    clearSessionLocal({
      silent:
        true,
      preserveRoute:
        ctx.shouldProtect,
      preserveCurrentRoute:
        ctx.shouldProtect,
      route:
        ctx.route,
      publicPath:
        ctx.publicPath,
      reason,
      source:
        RESTORE_SOURCE,
    });
  } catch {
    try {
      clearSessionLocal({
        silent:
          true,
        source:
          `${RESTORE_SOURCE}:fallback`,
      });
    } catch {}
  }

  safeSetState(
    {
      authenticated:
        false,
      hasToken:
        false,

      user:
        null,
      currentUser:
        null,
      authUser:
        null,
      sessionUser:
        null,

      role:
        "",
      userRole:
        "",
      roles:
        [],

      token:
        null,
      accessToken:
        null,
      access_token:
        null,

      session:
        null,
      sessionData:
        null,
      sessionId:
        null,
      sessionUserId:
        null,

      currentResolvedUsername:
        null,
      resolvedUsername:
        null,
    },
    {
      forceUnauthenticated:
        true,
      source:
        `${RESTORE_SOURCE}:clear-protected`,
    }
  );

  restoreRouteContext(ctx);

  emit(
    "auth:restore:session-cleared",
    {
      reason,
      protectedRoute:
        ctx.shouldProtect,
      protectedRouteKey:
        ctx.protectedRouteKey,
      route:
        ctx.route,
      publicPath:
        ctx.publicPath,
      source:
        RESTORE_SOURCE,
    },
    options
  );

  return true;
}

/* =========================================================
   REFRESH PAYLOAD / POLICY
========================================================= */

function getStoredRefreshPayload() {
  return {
    refreshToken:
      safeText(
        getStoredRefreshToken(),
        ""
      ),

    sessionId:
      safeText(
        getStoredSessionId(),
        ""
      ),

    userId:
      safeText(
        getStoredSessionUserId(),
        ""
      ),
  };
}

function hasUsableRefreshPayload(payload = getStoredRefreshPayload()) {
  const refreshToken =
    safeText(payload.refreshToken, "");

  const sessionId =
    safeText(payload.sessionId, "");

  const userId =
    safeText(payload.userId, "");

  return Boolean(
    refreshToken ||
      (sessionId && userId)
  );
}

function hasStrongRefreshToken(payload = getStoredRefreshPayload()) {
  return Boolean(
    safeText(payload.refreshToken, "")
  );
}

function canAttemptRefresh() {
  const payload =
    getStoredRefreshPayload();

  return Boolean(
    hasRefreshContext() &&
      hasUsableRefreshPayload(payload)
  );
}

function shouldPreferMeBeforeRefresh() {
  return hasUsableToken(
    getCurrentToken()
  );
}

function isTransientError(error = null) {
  const status =
    getErrorStatus(error);

  if (TRANSIENT_STATUS_CODES.has(status)) {
    return true;
  }

  if (
    error?.timeout === true ||
    error?.aborted === true
  ) {
    return true;
  }

  const message =
    safeText(
      extractMessage(error) ||
        error?.message,
      ""
    ).toLowerCase();

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
  const status =
    getErrorStatus(error);

  if (
    status === 401 ||
    status === 403
  ) {
    return true;
  }

  const code =
    getErrorCode(error);

  return Boolean(
    code &&
      AUTH_FAILURE_CODES.has(code)
  );
}

/* =========================================================
   SNAPSHOT / APPLY
========================================================= */

function getSafeSessionSnapshot() {
  let snapshot =
    null;

  try {
    snapshot =
      buildSessionSnapshot();
  } catch {
    snapshot =
      null;
  }

  const state =
    getState();

  const token =
    firstText(
      snapshot?.token,
      snapshot?.accessToken,
      state.token,
      state.accessToken,
      state.access_token,
      state.session?.token,
      state.session?.accessToken,
      state.session?.access_token,
      state.sessionData?.token,
      state.sessionData?.accessToken
    );

  const user =
    normalizeUserForRestore(
      snapshot?.user ||
        state.user ||
        state.currentUser ||
        state.authUser ||
        state.sessionUser ||
        state.session?.user ||
        state.sessionData?.user ||
        null
    );

  const authenticated =
    Boolean(
      hasUsableToken(token) &&
        hasUsableUser(user) &&
        (
          snapshot?.authenticated === true ||
          state.authenticated === true
        )
    );

  return {
    ...(snapshot || {}),

    authenticated,

    token:
      token || null,

    accessToken:
      token || null,

    user:
      hasUsableUser(user)
        ? user
        : null,

    role:
      snapshot?.role ||
      state.role ||
      user?.role ||
      user?.rol ||
      null,
  };
}

function assertCompleteSnapshot(snapshot = {}, code = "INVALID_SESSION") {
  const token =
    snapshot?.token ||
    getCurrentToken();

  const user =
    snapshot?.user ||
    getCurrentUser();

  const authenticated =
    Boolean(
      snapshot?.authenticated ||
        getState().authenticated
    );

  if (
    !authenticated ||
    !hasUsableToken(token) ||
    !hasUsableUser(user)
  ) {
    throw createRestoreError(
      "La sesión restaurada no es válida.",
      {
        status:
          401,
        code,
      }
    );
  }

  return true;
}

function buildPublicSessionPayload(snapshot = {}) {
  const user =
    snapshot?.user ||
    getCurrentUser() ||
    null;

  const token =
    snapshot?.token ||
    getCurrentToken() ||
    "";

  return {
    authenticated:
      Boolean(
        snapshot?.authenticated &&
          hasUsableToken(token) &&
          hasUsableUser(user)
      ),

    hasToken:
      hasUsableToken(token),

    token:
      null,

    user:
      sanitizeUserForEvent(user),

    role:
      snapshot?.role ||
      user?.role ||
      user?.rol ||
      getState().role ||
      null,

    username:
      snapshot?.username ||
      user?.username ||
      user?.userName ||
      user?.user_name ||
      user?.email ||
      getState().username ||
      null,
  };
}

function applyAuthenticatedSession(payload = {}) {
  const token =
    safeText(payload.token, "");

  const user =
    normalizeUserForRestore(payload.user);

  if (
    !hasUsableToken(token) ||
    !hasUsableUser(user)
  ) {
    throw createRestoreError(
      "No se puede aplicar sesión autenticada incompleta.",
      {
        status:
          401,
        code:
          "APPLY_AUTH_SESSION_INCOMPLETE",
      }
    );
  }

  const snapshot =
    applySession({
      ...payload,
      token,
      accessToken:
        token,
      access_token:
        token,
      user,
      authenticated:
        true,
      preserveExistingUser:
        false,
      source:
        payload.source ||
        RESTORE_SOURCE,
      eventMode:
        "restore",
    });

  safeSetState(
    {
      authenticated:
        true,
      hasToken:
        true,

      user:
        snapshot?.user ||
        user,
      currentUser:
        snapshot?.user ||
        user,
      authUser:
        snapshot?.user ||
        user,
      sessionUser:
        snapshot?.user ||
        user,

      role:
        snapshot?.role ||
        payload.role ||
        user?.role ||
        user?.rol ||
        "",

      userRole:
        snapshot?.role ||
        payload.role ||
        user?.role ||
        user?.rol ||
        "",

      token:
        snapshot?.token ||
        token,

      accessToken:
        snapshot?.token ||
        token,

      access_token:
        snapshot?.token ||
        token,
    },
    {
      allowExplicitAuthenticated:
        true,
      source:
        `${RESTORE_SOURCE}:apply-authenticated`,
    }
  );

  return getSafeSessionSnapshot();
}

function applyProvisionalTokenSession(payload = {}) {
  const token =
    safeText(payload.token, "");

  if (!hasUsableToken(token)) {
    throw createRestoreError(
      "No se puede aplicar token provisional vacío.",
      {
        status:
          401,
        code:
          "PROVISIONAL_TOKEN_MISSING",
      }
    );
  }

  const snapshot =
    applySession({
      ...payload,
      token,
      accessToken:
        token,
      access_token:
        token,
      user:
        null,
      authenticated:
        false,
      preserveExistingUser:
        false,
      silent:
        true,
      source:
        payload.source ||
        "refresh:token-only",
      eventMode:
        "refresh",
    });

  safeSetState(
    {
      authenticated:
        false,
      hasToken:
        true,

      user:
        null,
      currentUser:
        null,
      authUser:
        null,
      sessionUser:
        null,

      role:
        "",
      userRole:
        "",
      roles:
        [],

      token,
      accessToken:
        token,
      access_token:
        token,
    },
    {
      forceUnauthenticated:
        true,
      source:
        `${RESTORE_SOURCE}:apply-provisional-token`,
    }
  );

  return snapshot;
}

/* =========================================================
   /ME
========================================================= */

export async function fetchMe(sessionArg = {}) {
  const session =
    getSession(sessionArg);

  if (!hasUsableToken(getCurrentToken())) {
    throw createRestoreError(
      "No hay token disponible para /me.",
      {
        status:
          401,
        code:
          "TOKEN_MISSING",
      }
    );
  }

  if (session.mePromise) {
    return session.mePromise;
  }

  session.checking =
    true;

  emit(
    "auth:me:start",
    {
      hasToken:
        true,
      source:
        RESTORE_SOURCE,
    }
  );

  session.mePromise =
    (async () => {
      try {
        const response =
          await apiGet(
            resolveEndpoint("me", "/api/auth/me"),
            {
              auth:
                true,
              public:
                false,
              skipAuth:
                false,
              silent:
                true,
              storeError:
                false,
              dedupe:
                false,
              _skipAuthRefresh:
                true,
            }
          );

        const auth =
          normalizeAuthResponse(response);

        assertNoExplicitFailure(auth);

        const user =
          normalizeUserForRestore(
            auth.user ||
              extractUserFallback(response?.data) ||
              extractUserFallback(response?.payload) ||
              extractUserFallback(response?.result) ||
              extractUserFallback(response)
          );

        if (!hasUsableUser(user)) {
          throw createRestoreError(
            "No se pudo resolver usuario válido desde /me.",
            {
              status:
                401,
              code:
                "ME_USER_MISSING",
              response,
            }
          );
        }

        const nextToken =
          auth.token ||
          getCurrentToken();

        const snapshot =
          applyAuthenticatedSession({
            token:
              nextToken,
            user,

            refreshToken:
              auth.refreshToken ||
              undefined,

            sessionData:
              auth.sessionData ||
              undefined,

            source:
              "fetchMe",
          });

        assertCompleteSnapshot(
          snapshot,
          "ME_INVALID_SESSION"
        );

        session.lastCheckAt =
          Date.now();

        session.lastError =
          null;

        emit(
          "auth:me:success",
          {
            ...buildPublicSessionPayload(snapshot),
            source:
              "fetchMe",
          }
        );

        return snapshot.user;
      } catch (error) {
        session.lastError = {
          type:
            "me",
          ...buildErrorPayload(error),
        };

        emitError(
          "auth:me:error",
          error
        );

        throw error;
      } finally {
        session.checking =
          false;

        session.mePromise =
          null;
      }
    })();

  return session.mePromise;
}

/* =========================================================
   REFRESH
========================================================= */

export async function refreshSession(sessionArg = {}) {
  const session =
    getSession(sessionArg);

  const requestBody =
    getStoredRefreshPayload();

  if (
    !hasRefreshContext() ||
    !hasUsableRefreshPayload(requestBody)
  ) {
    throw createRestoreError(
      "No hay contexto refresh útil.",
      {
        status:
          401,
        code:
          "REFRESH_CONTEXT_MISSING",
      }
    );
  }

  if (session.refreshPromise) {
    return session.refreshPromise;
  }

  const now =
    Date.now();

  if (
    safeNumber(session.refreshBlockedUntil, 0) > now
  ) {
    throw createRestoreError(
      "Refresh temporalmente bloqueado.",
      {
        status:
          429,
        code:
          "REFRESH_BLOCKED",
      }
    );
  }

  session.refreshing =
    true;

  emit(
    "auth:refresh:start",
    {
      hasRefreshContext:
        true,
      hasRefreshToken:
        hasStrongRefreshToken(requestBody),
      hasSessionContext:
        Boolean(
          requestBody.sessionId &&
          requestBody.userId
        ),
      source:
        RESTORE_SOURCE,
    }
  );

  session.refreshPromise =
    (async () => {
      try {
        const response =
          await apiPost(
            resolveEndpoint("refresh", "/api/auth/refresh"),
            requestBody,
            {
              auth:
                false,
              public:
                true,
              skipAuth:
                true,
              silent:
                true,
              storeError:
                false,
              dedupe:
                false,
              _skipAuthRefresh:
                true,
            }
          );

        const auth =
          normalizeAuthResponse(response);

        assertNoExplicitFailure(auth);

        if (
          !hasUsableToken(auth.token) &&
          !hasUsableUser(auth.user)
        ) {
          throw createRestoreError(
            "Refresh sin datos de sesión.",
            {
              status:
                401,
              code:
                "REFRESH_EMPTY_RESPONSE",
              response,
            }
          );
        }

        if (
          hasUsableToken(auth.token) &&
          hasUsableUser(auth.user)
        ) {
          const snapshot =
            applyAuthenticatedSession({
              token:
                auth.token,
              user:
                auth.user,

              refreshToken:
                auth.refreshToken ||
                requestBody.refreshToken,

              sessionData:
                auth.sessionData || {
                  sessionId:
                    requestBody.sessionId,
                  userId:
                    requestBody.userId,
                },

              source:
                "refresh:token-user",
            });

          assertCompleteSnapshot(
            snapshot,
            "REFRESH_INVALID_SESSION"
          );

          session.lastRefreshAt =
            Date.now();

          session.refreshFailCount =
            0;

          session.refreshBlockedUntil =
            0;

          session.lastError =
            null;

          emit(
            "auth:refresh:success",
            {
              ...buildPublicSessionPayload(snapshot),
              source:
                "refresh:token-user",
            }
          );

          return {
            ok:
              true,
            ...snapshot,
            source:
              "refresh:token-user",
            response,
          };
        }

        if (
          hasUsableToken(auth.token) &&
          !hasUsableUser(auth.user)
        ) {
          applyProvisionalTokenSession({
            token:
              auth.token,

            refreshToken:
              auth.refreshToken ||
              requestBody.refreshToken,

            sessionData:
              auth.sessionData || {
                sessionId:
                  requestBody.sessionId,
                userId:
                  requestBody.userId,
              },

            source:
              "refresh:token-only",
          });

          const user =
            await fetchMe(session);

          const snapshot =
            getSafeSessionSnapshot();

          assertCompleteSnapshot(
            snapshot,
            "REFRESH_TOKEN_ONLY_ME_FAILED"
          );

          session.lastRefreshAt =
            Date.now();

          session.refreshFailCount =
            0;

          session.refreshBlockedUntil =
            0;

          session.lastError =
            null;

          emit(
            "auth:refresh:success",
            {
              ...buildPublicSessionPayload(snapshot),
              user,
              source:
                "refresh:token-only+me",
            }
          );

          return {
            ok:
              true,
            ...snapshot,
            user,
            source:
              "refresh:token-only+me",
            response,
          };
        }

        if (
          !hasUsableToken(auth.token) &&
          hasUsableUser(auth.user)
        ) {
          const currentToken =
            getCurrentToken();

          if (!hasUsableToken(currentToken)) {
            throw createRestoreError(
              "Refresh devolvió usuario sin token disponible.",
              {
                status:
                  401,
                code:
                  "REFRESH_USER_WITHOUT_TOKEN",
                response,
              }
            );
          }

          const snapshot =
            applyAuthenticatedSession({
              token:
                currentToken,
              user:
                auth.user,

              refreshToken:
                auth.refreshToken ||
                requestBody.refreshToken,

              sessionData:
                auth.sessionData || {
                  sessionId:
                    requestBody.sessionId,
                  userId:
                    requestBody.userId,
                },

              source:
                "refresh:user-only",
            });

          assertCompleteSnapshot(
            snapshot,
            "REFRESH_USER_ONLY_INVALID_SESSION"
          );

          session.lastRefreshAt =
            Date.now();

          session.refreshFailCount =
            0;

          session.refreshBlockedUntil =
            0;

          session.lastError =
            null;

          emit(
            "auth:refresh:success",
            {
              ...buildPublicSessionPayload(snapshot),
              source:
                "refresh:user-only",
            }
          );

          return {
            ok:
              true,
            ...snapshot,
            source:
              "refresh:user-only",
            response,
          };
        }

        throw createRestoreError(
          "Refresh no produjo sesión recuperable.",
          {
            status:
              401,
            code:
              "REFRESH_UNUSABLE_RESPONSE",
            response,
          }
        );
      } catch (error) {
        session.refreshFailCount =
          safeNumber(session.refreshFailCount, 0) + 1;

        session.lastError = {
          type:
            "refresh",
          ...buildErrorPayload(error),
        };

        if (
          session.refreshFailCount >= getMaxSequentialFailures()
        ) {
          session.refreshBlockedUntil =
            Date.now() + getRefreshRetryCooldownMs();
        }

        emitError(
          "auth:refresh:error",
          error,
          {
            refreshFailCount:
              session.refreshFailCount,
            refreshBlockedUntil:
              session.refreshBlockedUntil || null,
          }
        );

        throw error;
      } finally {
        session.refreshing =
          false;

        session.refreshPromise =
          null;
      }
    })();

  return session.refreshPromise;
}

/* =========================================================
   RESTORE MODES
========================================================= */

export async function restoreUsingMe(session = {}) {
  const user =
    await fetchMe(session);

  const snapshot =
    getSafeSessionSnapshot();

  assertCompleteSnapshot(
    snapshot,
    "RESTORE_ME_INVALID_SESSION"
  );

  emit(
    "auth:restore:success",
    {
      ...buildPublicSessionPayload(snapshot),
      source:
        "me",
      user,
    }
  );

  return {
    ok:
      true,
    user,
    source:
      "me",
  };
}

export async function restoreUsingRefreshOnly(session = {}) {
  const refreshed =
    await refreshSession(session);

  if (
    !hasCompleteAuthState() &&
    hasUsableToken(getCurrentToken())
  ) {
    await fetchMe(session);
  }

  const snapshot =
    getSafeSessionSnapshot();

  assertCompleteSnapshot(
    snapshot,
    "RESTORE_REFRESH_INVALID_SESSION"
  );

  emit(
    "auth:restore:success",
    {
      ...buildPublicSessionPayload(snapshot),
      source:
        "refresh-only",
    }
  );

  return {
    ok:
      true,
    source:
      "refresh-only",
    user:
      snapshot.user || null,
    refreshed,
  };
}

export async function restoreUsingRefreshPreferred(session = {}) {
  return restoreUsingRefreshOnly(session);
}

/* =========================================================
   ERROR FALLBACKS
========================================================= */

function keepCachedSessionAfterTransientFailure({
  error,
  routeContext,
  source = "cached-after-transient-failure",
} = {}) {
  const snapshot =
    getSafeSessionSnapshot();

  if (
    !isTransientError(error) ||
    !hasUsableToken(snapshot.token) ||
    !hasUsableUser(snapshot.user)
  ) {
    return null;
  }

  safeSetState(
    {
      authenticated:
        true,
      hasToken:
        true,

      user:
        snapshot.user,
      currentUser:
        snapshot.user,
      authUser:
        snapshot.user,
      sessionUser:
        snapshot.user,

      token:
        snapshot.token,
      accessToken:
        snapshot.token,
      access_token:
        snapshot.token,

      role:
        snapshot.role ||
        snapshot.user?.role ||
        snapshot.user?.rol ||
        "",

      userRole:
        snapshot.role ||
        snapshot.user?.role ||
        snapshot.user?.rol ||
        "",
    },
    {
      allowExplicitAuthenticated:
        true,
      source:
        `${RESTORE_SOURCE}:keep-cached-transient`,
    }
  );

  restoreRouteContext(routeContext);

  emit(
    "auth:restore:transient-kept",
    {
      ...buildPublicSessionPayload(snapshot),
      source,
      protectedRoute:
        Boolean(routeContext?.shouldProtect),
      protectedRouteKey:
        routeContext?.protectedRouteKey || "",
      error:
        buildErrorPayload(error),
    }
  );

  return {
    ok:
      true,
    user:
      snapshot.user,
    source,
    provisional:
      true,
    transientError:
      buildErrorPayload(error),
    protectedRoute:
      Boolean(routeContext?.shouldProtect),
    protectedRouteKey:
      routeContext?.protectedRouteKey || "",
  };
}

export async function restoreAfterMeFailure(
  session = {},
  meError,
  options = {},
  routeContext = null
) {
  warn(
    "fetchMe() falló durante restore.",
    meError
  );

  const cached =
    keepCachedSessionAfterTransientFailure({
      error:
        meError,
      routeContext,
      source:
        "cached-after-me-transient-failure",
    });

  if (cached) {
    return cached;
  }

  if (!canAttemptRefresh()) {
    if (shouldClearForError(meError)) {
      clearSessionLocalProtected({
        options,
        routeContext,
        reason:
          "me-failed-clearable-no-usable-refresh-context",
      });
    } else {
      restoreRouteContext(routeContext);
    }

    emitError(
      "auth:restore:error",
      meError,
      {
        protectedRoute:
          Boolean(routeContext?.shouldProtect),
        protectedRouteKey:
          routeContext?.protectedRouteKey || "",
      },
      options
    );

    return {
      ok:
        false,
      user:
        null,
      error:
        meError,
      protectedRoute:
        Boolean(routeContext?.shouldProtect),
      protectedRouteKey:
        routeContext?.protectedRouteKey || "",
    };
  }

  try {
    return await restoreUsingRefreshOnly(session);
  } catch (refreshError) {
    const cachedAfterRefresh =
      keepCachedSessionAfterTransientFailure({
        error:
          refreshError,
        routeContext,
        source:
          "cached-after-me-refresh-transient-failure",
      });

    if (cachedAfterRefresh) {
      return cachedAfterRefresh;
    }

    if (
      shouldClearForError(meError) ||
      shouldClearForError(refreshError)
    ) {
      clearSessionLocalProtected({
        options,
        routeContext,
        reason:
          "refresh-after-me-failed-clearable",
      });
    } else {
      restoreRouteContext(routeContext);
    }

    emitError(
      "auth:restore:error",
      refreshError,
      {
        protectedRoute:
          Boolean(routeContext?.shouldProtect),
        protectedRouteKey:
          routeContext?.protectedRouteKey || "",
      },
      options
    );

    return {
      ok:
        false,
      user:
        null,
      error:
        refreshError,
      protectedRoute:
        Boolean(routeContext?.shouldProtect),
      protectedRouteKey:
        routeContext?.protectedRouteKey || "",
    };
  }
}

async function restoreUsingMeAfterRefreshFailure(
  session = {},
  refreshError,
  options = {},
  routeContext = null
) {
  if (!hasUsableToken(getCurrentToken())) {
    restoreRouteContext(routeContext);

    return {
      ok:
        false,
      user:
        null,
      error:
        refreshError,
      protectedRoute:
        Boolean(routeContext?.shouldProtect),
      protectedRouteKey:
        routeContext?.protectedRouteKey || "",
    };
  }

  try {
    const result =
      await restoreUsingMe(session);

    restoreRouteContext(routeContext);

    return result;
  } catch (meError) {
    const cached =
      keepCachedSessionAfterTransientFailure({
        error:
          meError,
        routeContext,
        source:
          "cached-after-refresh-me-transient-failure",
      });

    if (cached) {
      return cached;
    }

    if (
      shouldClearForError(meError) ||
      shouldClearForError(refreshError)
    ) {
      clearSessionLocalProtected({
        options,
        routeContext,
        reason:
          "me-after-refresh-failed-clearable",
      });
    } else {
      restoreRouteContext(routeContext);
    }

    emitError(
      "auth:restore:error",
      meError,
      {
        protectedRoute:
          Boolean(routeContext?.shouldProtect),
        protectedRouteKey:
          routeContext?.protectedRouteKey || "",
      },
      options
    );

    return {
      ok:
        false,
      user:
        null,
      error:
        meError,
      protectedRoute:
        Boolean(routeContext?.shouldProtect),
      protectedRouteKey:
        routeContext?.protectedRouteKey || "",
    };
  }
}

/* =========================================================
   RESTORE SESSION
========================================================= */

export async function restoreSession(...args) {
  const resolved =
    resolveRestoreArgs(...args);

  const session =
    resolved.session;

  const options =
    normalizeRestoreOptions(resolved.options);

  const routeContext =
    captureRouteContext(options);

  if (session.restorePromise) {
    return session.restorePromise;
  }

  session.restoring =
    true;

  emit(
    "auth:restore:start",
    {
      hasToken:
        hasUsableToken(getCurrentToken()),

      hasUser:
        hasUsableUser(getCurrentUser()),

      hasCompleteAuthState:
        hasCompleteAuthState(),

      hasRefreshContext:
        hasRefreshContext(),

      hasUsableRefreshPayload:
        canAttemptRefresh(),

      publicRoute:
        Boolean(options.publicRoute),

      preserveCurrentRoute:
        Boolean(options.preserveCurrentRoute),

      preserveRoute:
        Boolean(options.preserveRoute),

      activationBoot:
        routeContext.activationBoot,

      resetConfirmBoot:
        routeContext.resetConfirmBoot,

      protectedRoute:
        routeContext.shouldProtect,

      protectedRouteKey:
        routeContext.protectedRouteKey,

      route:
        routeContext.route,

      publicPath:
        routeContext.publicPath,

      source:
        RESTORE_SOURCE,
    },
    options
  );

  session.restorePromise =
    (async () => {
      try {
        const tokenAvailable =
          hasUsableToken(getCurrentToken());

        const refreshAvailable =
          canAttemptRefresh();

        if (
          !tokenAvailable &&
          !refreshAvailable
        ) {
          clearSessionLocalProtected({
            options,
            routeContext,
            reason:
              "missing-token-and-usable-refresh",
          });

          emit(
            "auth:restore:empty",
            {
              reason:
                "missing-token-and-usable-refresh",
              protectedRoute:
                routeContext.shouldProtect,
              protectedRouteKey:
                routeContext.protectedRouteKey,
              source:
                RESTORE_SOURCE,
            },
            options
          );

          return {
            ok:
              false,
            user:
              null,
            protectedRoute:
              routeContext.shouldProtect,
            protectedRouteKey:
              routeContext.protectedRouteKey,
          };
        }

        if (
          tokenAvailable &&
          shouldPreferMeBeforeRefresh()
        ) {
          try {
            log(
              "restoreSession(): validando token con /me.",
              {
                hasCompleteAuthState:
                  hasCompleteAuthState(),
                protectedRoute:
                  routeContext.shouldProtect,
                protectedRouteKey:
                  routeContext.protectedRouteKey,
                publicPath:
                  redactRouteValue(routeContext.publicPath),
              }
            );

            const result =
              await restoreUsingMe(session);

            restoreRouteContext(routeContext);

            session.lastRestoreAt =
              Date.now();

            return {
              ...result,
              protectedRoute:
                routeContext.shouldProtect,
              protectedRouteKey:
                routeContext.protectedRouteKey,
            };
          } catch (meError) {
            const result =
              await restoreAfterMeFailure(
                session,
                meError,
                options,
                routeContext
              );

            restoreRouteContext(routeContext);

            session.lastRestoreAt =
              Date.now();

            return result;
          }
        }

        if (refreshAvailable) {
          try {
            log(
              "restoreSession(): refresh con contexto útil.",
              {
                protectedRoute:
                  routeContext.shouldProtect,
                protectedRouteKey:
                  routeContext.protectedRouteKey,
                publicPath:
                  redactRouteValue(routeContext.publicPath),
              }
            );

            const result =
              await restoreUsingRefreshPreferred(session);

            restoreRouteContext(routeContext);

            session.lastRestoreAt =
              Date.now();

            return {
              ...result,
              protectedRoute:
                routeContext.shouldProtect,
              protectedRouteKey:
                routeContext.protectedRouteKey,
            };
          } catch (refreshError) {
            warn(
              "Refresh falló durante restore.",
              refreshError
            );

            if (shouldClearForError(refreshError)) {
              clearSessionLocalProtected({
                options,
                routeContext,
                reason:
                  "refresh-error-clearable",
              });

              return {
                ok:
                  false,
                user:
                  null,
                error:
                  refreshError,
                protectedRoute:
                  routeContext.shouldProtect,
                protectedRouteKey:
                  routeContext.protectedRouteKey,
              };
            }

            const result =
              await restoreUsingMeAfterRefreshFailure(
                session,
                refreshError,
                options,
                routeContext
              );

            restoreRouteContext(routeContext);

            session.lastRestoreAt =
              Date.now();

            return result;
          }
        }

        clearSessionLocalProtected({
          options,
          routeContext,
          reason:
            "restore-no-valid-strategy",
        });

        return {
          ok:
            false,
          user:
            null,
          protectedRoute:
            routeContext.shouldProtect,
          protectedRouteKey:
            routeContext.protectedRouteKey,
        };
      } catch (error) {
        warn(
          "restoreSession() fatal:",
          error
        );

        const cached =
          keepCachedSessionAfterTransientFailure({
            error,
            routeContext,
            source:
              "cached-after-restore-fatal-transient",
          });

        if (cached) {
          return cached;
        }

        if (shouldClearForError(error)) {
          clearSessionLocalProtected({
            options,
            routeContext,
            reason:
              "restore-fatal-clearable",
          });
        } else {
          restoreRouteContext(routeContext);
        }

        emitError(
          "auth:restore:error",
          error,
          {
            protectedRoute:
              routeContext.shouldProtect,
            protectedRouteKey:
              routeContext.protectedRouteKey,
          },
          options
        );

        return {
          ok:
            false,
          user:
            null,
          error,
          protectedRoute:
            routeContext.shouldProtect,
          protectedRouteKey:
            routeContext.protectedRouteKey,
        };
      } finally {
        restoreRouteContext(routeContext);
        clearRuntimeFlags(session);
      }
    })();

  return session.restorePromise;
}

/* =========================================================
   DEBUG
========================================================= */

export function getRestoreSnapshot(sessionArg = {}) {
  const session =
    getSession(sessionArg);

  const routeContext =
    captureRouteContext({
      publicRoute:
        false,
      preserveCurrentRoute:
        false,
    });

  const refreshPayload =
    getStoredRefreshPayload();

  const safeSession =
    getSafeSessionSnapshot();

  return {
    version:
      RESTORE_VERSION,

    ...buildPublicSessionPayload(safeSession),

    checking:
      Boolean(session.checking),

    refreshing:
      Boolean(session.refreshing),

    restoring:
      Boolean(session.restoring),

    hasMePromise:
      Boolean(session.mePromise),

    hasRefreshPromise:
      Boolean(session.refreshPromise),

    hasRestorePromise:
      Boolean(session.restorePromise),

    refreshFailCount:
      safeNumber(session.refreshFailCount, 0),

    refreshBlockedUntil:
      safeNumber(session.refreshBlockedUntil, 0),

    lastCheckAt:
      safeNumber(session.lastCheckAt, 0),

    lastRefreshAt:
      safeNumber(session.lastRefreshAt, 0),

    lastRestoreAt:
      safeNumber(session.lastRestoreAt, 0),

    lastError:
      session.lastError || null,

    hasValidToken:
      hasUsableToken(getCurrentToken()),

    hasCompleteAuthState:
      hasCompleteAuthState(),

    hasRefreshContext:
      hasRefreshContext(),

    hasUsableRefreshPayload:
      hasUsableRefreshPayload(refreshPayload),

    hasStoredRefreshToken:
      hasStrongRefreshToken(refreshPayload),

    hasStoredSessionContext:
      Boolean(
        refreshPayload.sessionId &&
          refreshPayload.userId
      ),

    protectedRoute:
      routeContext.shouldProtect,

    protectedRouteKey:
      routeContext.protectedRouteKey,

    activationBoot:
      routeContext.activationBoot,

    resetConfirmBoot:
      routeContext.resetConfirmBoot,

    route:
      redactRouteValue(routeContext.route),

    publicPath:
      redactRouteValue(routeContext.publicPath),

    browserPath:
      redactRouteValue(routeContext.browserPath),

    initialUrl:
      redactRouteValue(routeContext.initialUrl),

    activationInitialUrl:
      redactRouteValue(routeContext.activationInitialUrl),

    resetConfirmInitialUrl:
      redactRouteValue(routeContext.resetConfirmInitialUrl),

    activationTokenScrubbed:
      isTechnicalTokenScrubbed(
        PROTECTED_PUBLIC_TOKEN_ROUTES[0]
      ),

    resetTokenScrubbed:
      isTechnicalTokenScrubbed(
        PROTECTED_PUBLIC_TOKEN_ROUTES[1]
      ),

    transports: {
      hasApiClient:
        Boolean(getApiClient()),

      hasHttpService:
        Boolean(getHttpService()),

      hasApiGet:
        Boolean(
          getApiClient()?.get ||
            getApiClient()?.request ||
            getHttpService()?.get ||
            getHttpService()?.request
        ),

      hasApiPost:
        Boolean(
          getApiClient()?.post ||
            getApiClient()?.request ||
            getHttpService()?.post ||
            getHttpService()?.request
        ),

      apiBase:
        resolveApiBase(),

      me:
        resolveEndpoint(
          "me",
          "/api/auth/me"
        ),

      refresh:
        resolveEndpoint(
          "refresh",
          "/api/auth/refresh"
        ),
    },

    at:
      safeIsoDate(),
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
  getRestoreSnapshot,
};
