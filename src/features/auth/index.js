/* =========================================================
   Onion SPA - Auth / Session
   Archivo: src/features/auth/index.js

   AUTH FACADE · SESSION ORCHESTRATOR · EXTREME 15/10
   BACKEND ALIGNED · API.ONIONIT.NET · ME SAFE · SIDEBAR USER SAFE

   RESPONSABILIDADES:
   - punto de entrada público del módulo auth
   - composición de login / logout / restore / refresh / me / guards
   - integración robusta con AppCore.http / AppCore.apiClient / AppCore.request
   - fallback fetch seguro contra https://api.onionit.net
   - normalizar payload heterogéneo del backend Onion Auth
   - aplicar sesión completa sólo con token + usuario usable
   - permitir token_only refresh sin destruir usuario existente
   - usar /api/auth/me como fuente real de usuario/avatar tras restore
   - exponer Auth.getUser / getCurrentUser / getProfile / getAccount
   - pintar sidebar/topbar vía AppCore.state + app:ui:repair-request
   - preservar rutas públicas técnicas con token
   - evitar auth fantasma
   - evitar duplicidad de eventos canónicos
   - no exponer tokens en snapshots/eventos
   - bridge Auth idempotente y silencioso
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_TOKEN_PARAM_NAMES,
  AUTH_FAILURE_CODES as AUTH_FAILURE_CODE_LIST,
} from "./constants.js";

import {
  isAuthRoute as helperIsAuthRoute,
  isPublicTechnicalRoute as helperIsPublicTechnicalRoute,
  isActivationRoute as helperIsActivationRoute,
  isResetPasswordConfirmRoute as helperIsResetPasswordConfirmRoute,
  hasActivationToken as helperHasActivationToken,
  hasResetToken as helperHasResetToken,
  getCurrentPublicPath,
  getCurrentCanonicalPath,
  pathFromUrlLike as helperPathFromUrlLike,
  normalizePublicPath,
  normalizeCanonicalPath,
  sanitizeRedirectPath,
  extractMessage,
  redactTokenInText as helperRedactTokenInText,
} from "./helpers.js";

import {
  normalizeUser,
} from "./normalize.js";

import {
  getStoredRefreshToken,
  getStoredTempToken,
  getStoredSessionId,
  getStoredSessionUserId,
  hasRefreshToken,
  hasRefreshContext,
  persistTempToken,
  clearAuthStorage,
} from "./storage.js";

import {
  buildSessionSnapshot,
  applySession,
  clearSessionLocal,
  isAuthenticated,
  getCurrentRole,
  getCurrentRoles,
  isCurrentUserAdmin,
  isCurrentUserSupport,
  isCurrentUserManager,
  isCurrentUserClient,
  hasRole,
  requireRole,
  getAuthHeader,
  getSessionDebugSnapshot,
} from "./session.js";

import {
  resolveLoginIdentifier,
  normalizeLoginPayload,
  buildLoginRequestBody,
  buildLoginRedirectPath,
  getPostLoginTarget,
  login as coreLogin,
  getLoginSnapshot,
} from "./login.js";

import * as ActivationApi from "./activation.js";
import * as TwoFactorApi from "./2fa.js";
import * as PasswordResetApi from "./password-reset.js";

import {
  fetchMe as restoreFetchMe,
  refreshSession as refreshSessionCore,
  restoreSession as restoreSessionCore,
  getRestoreSnapshot,
} from "./restore.js";

import {
  logout,
} from "./logout.js";

import {
  guardAuthenticated,
  guardRole,
  guardGuest,
  guardAdmin,
  guardSupport,
  guardManager,
  canAccessRoute,
  syncAuthState,
  buildGuardErrorPayload,
  getAuthGuardsSnapshot,
} from "./guards.js";

/* =========================================================
   VERSION
========================================================= */

const AUTH_MODULE_VERSION =
  "15.0.0-extreme-me-sidebar-safe";

const AUTH_SOURCE =
  "Auth";

const BACKEND_ORIGIN =
  "https://api.onionit.net";

const DEFAULT_ROUTE =
  "/";

const DEFAULT_2FA_PATH =
  "/2fa";

const ACTIVATION_PATH =
  "/activate-account";

const RESET_PASSWORD_PATH =
  "/reset-password";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const PUBLIC_TECHNICAL_ROUTE_SET =
  new Set(
    [
      ...(Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES)
        ? AUTH_PUBLIC_TECHNICAL_ROUTES
        : []),

      ACTIVATION_PATH,
      RESET_PASSWORD_PATH,
      RESET_CONFIRM_PATH,
      "/forgot-password",
      "/recover-password",
      "/password-reset",
      "/2fa",
      "/otp",
      "/mfa",
    ].filter(Boolean)
  );

const ACTIVATION_TOKEN_PARAM_NAMES =
  Object.freeze(
    AUTH_TOKEN_PARAM_NAMES?.activation || [
      "token",
      "activationToken",
      "activateToken",
      "activation_token",
      "activate_token",
      "code",
      "t",
    ]
  );

const RESET_TOKEN_PARAM_NAMES =
  Object.freeze(
    AUTH_TOKEN_PARAM_NAMES?.reset || [
      "token",
      "resetToken",
      "passwordResetToken",
      "reset_token",
      "password_reset_token",
      "confirmToken",
      "confirm_token",
      "code",
      "t",
    ]
  );

const AUTH_FAILURE_CODES =
  new Set(
    Array.isArray(AUTH_FAILURE_CODE_LIST)
      ? AUTH_FAILURE_CODE_LIST
      : [
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
          "BAD_CREDENTIALS",
          "CREDENTIALS_INVALID",
          "TOKEN_VERSION_MISMATCH",
        ]
  );

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

const TEMP_TOKEN_KEYS =
  Object.freeze([
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "challengeToken",
    "challenge_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
  ]);

const USER_KEYS =
  Object.freeze([
    "user",
    "usuario",
    "account",
    "profile",
    "me",
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

const SESSION_EXPIRES_KEYS =
  Object.freeze([
    "expiresAt",
    "expires_at",
    "refreshExpiresAt",
    "refresh_expires_at",
    "expiration",
    "expires",
  ]);

const STATUS_KEYS =
  Object.freeze([
    "status",
    "statusCode",
    "status_code",
  ]);

const CODE_KEYS =
  Object.freeze([
    "code",
    "errorCode",
    "error_code",
    "error",
  ]);

const MESSAGE_KEYS =
  Object.freeze([
    "message",
    "mensaje",
    "errorMessage",
    "error_message",
    "detail",
    "description",
  ]);

const REDIRECT_KEYS =
  Object.freeze([
    "redirectTo",
    "redirect_to",
    "redirect",
    "next",
    "nextPath",
    "next_path",
  ]);

const TWO_FACTOR_BOOL_KEYS =
  Object.freeze([
    "requires2FA",
    "requires_2fa",
    "require2FA",
    "require_2fa",
    "requiresTwoFactor",
    "twoFactorRequired",
    "mfaRequired",
    "mfa_required",
    "requiresMfa",
    "requires_mfa",
  ]);

const TWO_FACTOR_STATUSES =
  new Set([
    "2fa_required",
    "mfa_required",
    "two_factor_required",
    "totp_required",
  ]);

const SENSITIVE_USER_KEYS =
  Object.freeze([
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
    "otp",
    "totp",
    "_rid",
    "_self",
    "_etag",
    "_attachments",
    "_ts",
  ]);

const AUTH_LOW_LEVEL_EVENT_PREFIXES =
  Object.freeze([
    "auth:runtime:",
    "auth:session:loaded",
    "auth:session:restored",
    "auth:session:applied",
  ]);

const AUTH_ALWAYS_EMIT_EVENTS =
  new Set([
    "auth:login:start",
    "auth:login:success",
    "app:ui:repair-request",
    "app:ui:repair",
  ]);

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(
    value,
    fallback
  ).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isPlainObject(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function isFunction(value) {
  return typeof value === "function";
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text =
    safeLower(value, "");

  if (
    [
      "true",
      "1",
      "yes",
      "si",
      "sí",
      "ok",
      "on",
      "active",
      "enabled",
    ].includes(text)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
      "inactive",
      "disabled",
    ].includes(text)
  ) {
    return false;
  }

  return Boolean(fallback);
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    return value;
  }

  return "";
}

function pickFirstText(...values) {
  for (const value of values) {
    const text =
      safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((value) =>
          safeText(value, "")
        )
        .filter(Boolean)
    ),
  ];
}

function safeCall(fn, fallback, ...args) {
  try {
    if (!isFunction(fn)) {
      return fallback;
    }

    return fn(...args);
  } catch {
    return fallback;
  }
}

function safeExtractMessage(error) {
  try {
    return (
      extractMessage?.(error) ||
      error?.message ||
      error?.response?.data?.message ||
      error?.data?.message ||
      String(error)
    );
  } catch {
    return error?.message || String(error);
  }
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[Auth]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[Auth]",
        ...args
      );
    }
  } catch {}
}

function afterPaint(callback) {
  if (!isFunction(callback)) {
    return;
  }

  if (!isBrowser()) {
    try {
      callback();
    } catch {}

    return;
  }

  try {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          callback();
        } catch {}
      });
    });

    return;
  } catch {}

  try {
    window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redactTokenInText(value = "") {
  try {
    if (typeof helperRedactTokenInText === "function") {
      return helperRedactTokenInText(value);
    }
  } catch {}

  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  let output =
    raw;

  try {
    output =
      output.replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token)=)([^&#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function sanitizePublicUser(user = null) {
  if (!isPlainObject(user)) {
    return null;
  }

  const safe = {
    ...user,
  };

  for (const key of SENSITIVE_USER_KEYS) {
    delete safe[key];
  }

  return safe;
}

function sanitizeRouteContext(context = {}) {
  const safe =
    safeObject(context);

  return {
    ...safe,

    publicPath:
      redactTokenInText(safe.publicPath || ""),

    browserPath:
      redactTokenInText(safe.browserPath || ""),

    initialUrl:
      redactTokenInText(safe.initialUrl || ""),

    activationInitialUrl:
      redactTokenInText(safe.activationInitialUrl || ""),

    resetConfirmInitialUrl:
      redactTokenInText(safe.resetConfirmInitialUrl || ""),
  };
}

function sanitizeEventPayload(payload = {}) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const output = {
    ...payload,
  };

  for (const key of [
    ...TOKEN_KEYS,
    ...REFRESH_TOKEN_KEYS,
    ...TEMP_TOKEN_KEYS,
    "authorization",
    "password",
    "secret",
    "otp",
    "totp",
    "code",
  ]) {
    if (key in output) {
      output[key] =
        null;
    }
  }

  if (output.user) {
    output.user =
      sanitizePublicUser(output.user);
  }

  for (const key of [
    "path",
    "publicPath",
    "redirectTo",
    "url",
    "currentPath",
    "currentCanonicalPath",
    "endpoint",
  ]) {
    if (output[key]) {
      output[key] =
        redactTokenInText(output[key]);
    }
  }

  if (output.routeContext) {
    output.routeContext =
      sanitizeRouteContext(output.routeContext);
  }

  if (output.raw) {
    output.raw =
      undefined;
  }

  return output;
}

function shouldEmitAuthEvent(eventName = "", options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  if (AUTH_ALWAYS_EMIT_EVENTS.has(name)) {
    return true;
  }

  const opts =
    safeObject(options);

  if (opts.emitEvents === false) {
    return false;
  }

  if (
    opts.emitAuthRuntimeEvents === true ||
    opts.emitAuthLifecycleEvents === true ||
    opts.debugAuthEvents === true
  ) {
    return true;
  }

  try {
    const diagnostics =
      AppCore?.config?.diagnostics || {};

    if (
      diagnostics.authEvents === true ||
      diagnostics.authRuntimeEvents === true ||
      diagnostics.authLifecycleEvents === true ||
      AppCore?.config?.debugAuthEvents === true
    ) {
      return true;
    }
  } catch {}

  if (
    AUTH_LOW_LEVEL_EVENT_PREFIXES.some((prefix) =>
      name.startsWith(prefix)
    )
  ) {
    return false;
  }

  return true;
}

function emit(eventName, payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  if (!shouldEmitAuthEvent(name, options)) {
    return false;
  }

  const cleanPayload =
    sanitizeEventPayload({
      source:
        AUTH_SOURCE,

      version:
        AUTH_MODULE_VERSION,

      at:
        isoNow(),

      ...safeObject(payload),
    });

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(
        name,
        cleanPayload
      );

      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail:
            cleanPayload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function createRuntimeErrorSnapshot(type, error) {
  return {
    type:
      safeText(type, "unknown"),

    message:
      safeExtractMessage(error),

    name:
      error?.name || "Error",

    status:
      error?.status ||
      error?.response?.status ||
      error?.data?.status ||
      0,

    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      null,

    at:
      isoNow(),
  };
}

/* =========================================================
   API CLIENT BRIDGE · CORE HTTP FIRST
========================================================= */

function resolveAuthEndpoint(name = "me", fallback = "/api/auth/me") {
  const fromConstants =
    AUTH_ENDPOINTS?.[name] ||
    AUTH_ENDPOINTS?.auth?.[name] ||
    "";

  const endpoint =
    safeText(
      fromConstants,
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

function getCoreHttpClient() {
  return (
    AppCore?.http ||
    AppCore?.Http ||
    AppCore?.apiClient ||
    AppCore?.request ||
    AppCore?.services?.http ||
    AppCore?.services?.Http ||
    AppCore?.services?.apiClient ||
    AppCore?.services?.api ||
    null
  );
}

function getCurrentTokenFromCore() {
  try {
    const header =
      AppCore?.getAuthHeader?.() || {};

    const auth =
      header.Authorization ||
      header.authorization ||
      "";

    const tokenFromHeader =
      safeText(auth, "").replace(/^Bearer\s+/i, "");

    if (hasUsableToken(tokenFromHeader)) {
      return tokenFromHeader;
    }
  } catch {}

  const state =
    safeObject(AppCore?.state);

  return pickFirstText(
    state.token,
    state.accessToken,
    state.access_token,
    state.session?.token,
    state.session?.accessToken,
    state.sessionData?.token,
    state.sessionData?.accessToken
  );
}

function buildAuthHeaders(options = {}) {
  const opts =
    safeObject(options);

  const headers = {
    ...(safeObject(opts.headers)),
  };

  if (opts.auth === false || opts.skipAuth === true) {
    return headers;
  }

  const token =
    opts.token ||
    getCurrentTokenFromCore();

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

async function requestWithCoreClient(method = "GET", path = "", body = undefined, options = {}) {
  const client =
    getCoreHttpClient();

  if (!client) {
    throw new Error("CORE_HTTP_CLIENT_MISSING");
  }

  const upperMethod =
    safeText(method, "GET").toUpperCase();

  const opts = {
    ...safeObject(options),

    method:
      upperMethod,

    auth:
      options.auth !== false,

    headers:
      buildAuthHeaders(options),

    noStore:
      true,

    cache:
      "no-store",

    _skipAuthRefresh:
      options._skipAuthRefresh === true,
  };

  if (body !== undefined && body !== null) {
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
    } catch (error) {
      try {
        return await client.request(
          path,
          opts
        );
      } catch {
        throw error;
      }
    }
  }

  if (isFunction(client)) {
    return client(
      path,
      opts
    );
  }

  throw new Error("CORE_HTTP_CLIENT_INVALID");
}

async function requestWithFetch(method = "GET", path = "", body = undefined, options = {}) {
  if (
    !isBrowser() ||
    !isFunction(fetch)
  ) {
    throw new Error("FETCH_UNAVAILABLE");
  }

  const upperMethod =
    safeText(method, "GET").toUpperCase();

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
      new Error(
        safeText(
          payload?.message ||
            payload?.error ||
            response.statusText,
          `HTTP ${response.status}`
        )
      );

    error.name =
      "AuthApiError";

    error.status =
      response.status;

    error.code =
      payload?.code ||
      payload?.error ||
      (
        response.status === 401
          ? "UNAUTHORIZED"
          : response.status === 403
            ? "FORBIDDEN"
            : "AUTH_API_ERROR"
      );

    error.response =
      response;

    error.data =
      payload;

    throw error;
  }

  return payload;
}

async function authApiRequest(method = "GET", path = "", body = undefined, options = {}) {
  try {
    return await requestWithCoreClient(
      method,
      path,
      body,
      options
    );
  } catch (coreError) {
    if (
      options.noFetchFallback === true ||
      coreError?.name === "AbortError"
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

/* =========================================================
   MODULE EXPORT RESOLUTION
========================================================= */

function getModuleExport(moduleApi, ...names) {
  for (const name of names) {
    const direct =
      moduleApi?.[name];

    if (typeof direct === "function") {
      return direct;
    }

    const fromDefault =
      moduleApi?.default?.[name];

    if (typeof fromDefault === "function") {
      return fromDefault;
    }
  }

  return null;
}

function missingHandler(label = "handler") {
  return async function missingHandlerExecutor() {
    throw new Error(
      `Auth: falta implementar ${label}.`
    );
  };
}

/* =========================================================
   PAYLOAD NORMALIZATION
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
    guard < 140
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

    if (isPlainObject(current.auth?.session)) {
      queue.push(current.auth.session);
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

function pickBoolFromObjects(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (
        key in safeObject(object) &&
        normalizeBoolean(
          object[key],
          false
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function hasUsableToken(token = "") {
  const value =
    safeText(token, "");

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

function isUserActive(user = {}) {
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
    user.deletedAt ||
    user.deleted === true ||
    user.isDeleted === true ||
    user.disabled === true ||
    user.isDisabled === true ||
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
    user.isActive ??
    user.is_active ??
    user.enabled ??
    user.isEnabled;

  if (
    activeCandidate === undefined ||
    activeCandidate === null ||
    activeCandidate === ""
  ) {
    return true;
  }

  return normalizeBoolean(
    activeCandidate,
    true
  );
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

function resolveAvatar(user = {}) {
  const source =
    safeObject(user);

  return (
    safeText(source.avatar, "") ||
    safeText(source.avatarUrl, "") ||
    safeText(source.avatarURL, "") ||
    safeText(source.avatar_url, "") ||
    safeText(source.photo, "") ||
    safeText(source.photoUrl, "") ||
    safeText(source.photoURL, "") ||
    safeText(source.photo_url, "") ||
    safeText(source.image, "") ||
    safeText(source.imageUrl, "") ||
    safeText(source.imageURL, "") ||
    safeText(source.image_url, "") ||
    safeText(source.profileImage, "") ||
    safeText(source.profileImageUrl, "") ||
    safeText(source.profile_image, "") ||
    safeText(source.profile_image_url, "") ||
    safeText(source.picture, "") ||
    safeText(source.pictureUrl, "") ||
    safeText(source.pictureURL, "") ||
    safeText(source.picture_url, "") ||
    null
  );
}

function normalizeUsername(value = "") {
  return safeText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function normalizeLoginUserForState(user = {}) {
  const clean =
    safeObject(user);

  try {
    const normalized =
      normalizeUser?.(clean);

    if (
      normalized &&
      hasUsableUser(normalized)
    ) {
      return normalizeFinalUser(normalized);
    }
  } catch {}

  return hasUsableUser(clean)
    ? normalizeFinalUser(clean)
    : null;
}

function normalizeFinalUser(user = {}) {
  const source =
    safeObject(user);

  if (!hasUsableUser(source)) {
    return null;
  }

  const userId =
    pickFirstText(
      source.userId,
      source.user_id,
      source.uid,
      source.sub,
      source.id,
      source._id
    );

  const email =
    pickFirstText(
      source.email,
      source.emailLower,
      source.email_lower,
      source.mail
    );

  const username =
    pickFirstText(
      source.username,
      source.userName,
      source.user_name,
      source.usernameLower,
      source.username_lower,
      source.slug,
      email ? email.split("@")[0] : ""
    );

  const usernameLower =
    normalizeUsername(
      pickFirstText(
        source.usernameLower,
        source.username_lower,
        username
      )
    );

  const slug =
    normalizeUsername(
      pickFirstText(
        source.slug,
        source.usernameSlug,
        source.username_slug,
        usernameLower,
        username,
        email,
        userId
      )
    );

  const displayName =
    pickFirstText(
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      username,
      email,
      "Usuario"
    );

  const role =
    safeLower(
      pickFirstText(
        source.role,
        source.rol,
        source.userRole,
        source.user_role,
        source.type,
        source.tipo,
        "user"
      ),
      "user"
    );

  const avatar =
    resolveAvatar(source);

  const preferences =
    safeObject(source.preferences);

  return {
    ...source,

    id:
      source.id ||
      userId ||
      null,

    userId:
      source.userId ||
      userId ||
      null,

    user_id:
      source.user_id ||
      userId ||
      null,

    uid:
      source.uid ||
      userId ||
      null,

    sub:
      source.sub ||
      userId ||
      null,

    email:
      email || null,

    emailLower:
      source.emailLower ||
      source.email_lower ||
      (email ? email.toLowerCase() : null),

    username:
      username || null,

    userName:
      source.userName ||
      username ||
      null,

    usernameLower:
      usernameLower || null,

    username_lower:
      source.username_lower ||
      usernameLower ||
      null,

    slug:
      slug || null,

    name:
      displayName,

    nombre:
      source.nombre ||
      displayName,

    displayName,

    fullName:
      source.fullName ||
      displayName,

    role,
    rol:
      role,

    roles:
      uniqueStrings([
        role,
        ...safeArray(source.roles),
      ]),

    permissions:
      safeArray(
        source.permissions ||
          source.permisos
      ),

    permisos:
      safeArray(
        source.permisos ||
          source.permissions
      ),

    avatar:
      avatar || null,

    avatarUrl:
      avatar || null,

    picture:
      avatar || null,

    hasAvatar:
      source.hasAvatar === true ||
      source.has_avatar === true ||
      source.avatarEnabled === true ||
      source.avatar_enabled === true ||
      Boolean(avatar),

    avatarUpdatedAt:
      source.avatarUpdatedAt ||
      source.avatar_updated_at ||
      source.pictureUpdatedAt ||
      source.picture_updated_at ||
      null,

    active:
      isUserActive(source),

    theme:
      source.theme ||
      preferences.theme ||
      null,

    mode:
      source.mode ||
      preferences.mode ||
      null,

    appearance:
      source.appearance ||
      preferences.appearance ||
      null,

    lang:
      source.lang ||
      preferences.lang ||
      source.language ||
      preferences.language ||
      null,

    language:
      source.language ||
      preferences.language ||
      source.lang ||
      preferences.lang ||
      null,

    locale:
      source.locale ||
      preferences.locale ||
      source.language ||
      source.lang ||
      null,

    preferences,
  };
}

function normalizeSessionContext(sessionInput = null, user = null, fallback = {}) {
  const source =
    safeObject(sessionInput);

  const fallbackObj =
    safeObject(fallback);

  const sessionId =
    pickFirstText(
      ...SESSION_ID_KEYS.map((key) =>
        source[key]
      ),
      fallbackObj.sessionId,
      fallbackObj.session_id,
      fallbackObj.sid,
      fallbackObj.id,
      getStoredSessionId()
    );

  const sessionUserId =
    pickFirstText(
      source.sessionUserId,
      source.session_user_id,
      ...SESSION_USER_ID_KEYS.map((key) =>
        source[key]
      ),
      fallbackObj.sessionUserId,
      fallbackObj.session_user_id,
      fallbackObj.userId,
      fallbackObj.user_id,
      user?.userId,
      user?.user_id,
      user?.id,
      user?.uid,
      getStoredSessionUserId()
    );

  const expiresAt =
    pickFirstText(
      ...SESSION_EXPIRES_KEYS.map((key) =>
        source[key]
      ),
      fallbackObj.expiresAt,
      fallbackObj.refreshExpiresAt
    );

  const hasAny =
    Object.keys(source).length > 0 ||
    Boolean(
      sessionId ||
        sessionUserId ||
        expiresAt
    );

  if (!hasAny) {
    return null;
  }

  return {
    ...source,

    id:
      source.id ||
      sessionId ||
      null,

    sessionId:
      source.sessionId ||
      source.session_id ||
      source.sid ||
      sessionId ||
      null,

    session_id:
      source.session_id ||
      source.sessionId ||
      source.sid ||
      sessionId ||
      null,

    userId:
      source.userId ||
      source.user_id ||
      source.uid ||
      sessionUserId ||
      null,

    user_id:
      source.user_id ||
      source.userId ||
      source.uid ||
      sessionUserId ||
      null,

    sessionUserId:
      source.sessionUserId ||
      source.session_user_id ||
      sessionUserId ||
      null,

    session_user_id:
      source.session_user_id ||
      source.sessionUserId ||
      sessionUserId ||
      null,

    expiresAt:
      source.expiresAt ||
      source.expires_at ||
      source.refreshExpiresAt ||
      source.refresh_expires_at ||
      expiresAt ||
      null,

    refreshExpiresAt:
      source.refreshExpiresAt ||
      source.refresh_expires_at ||
      source.expiresAt ||
      source.expires_at ||
      expiresAt ||
      null,
  };
}

function isExplicitFailureFromObjects(objects = []) {
  const statusValue =
    pickFirstValue(
      pickValueFromObjects(
        objects,
        STATUS_KEYS
      )
    );

  const statusNumber =
    Number(statusValue || 0);

  if (
    Number.isFinite(statusNumber) &&
    statusNumber >= 400
  ) {
    return true;
  }

  const code =
    safeText(
      pickTextFromObjects(
        objects,
        CODE_KEYS
      ),
      ""
    ).toUpperCase();

  if (
    code &&
    AUTH_FAILURE_CODES.has(code)
  ) {
    return true;
  }

  return objects.some((object) =>
    object?.ok === false ||
    object?.success === false ||
    object?.authenticated === false && object?.code && object?.code !== "ME_OK"
  );
}

function normalizeAuthPayload(result = {}, options = {}) {
  const raw =
    safeObject(result);

  const opts =
    safeObject(options);

  const objects =
    collectAuthObjects(raw);

  const token =
    pickFirstText(
      pickTextFromObjects(objects, TOKEN_KEYS),
      opts.fallbackToken,
      opts.useCurrentToken !== false
        ? getCurrentTokenFromCore()
        : ""
    );

  const refreshToken =
    pickTextFromObjects(
      objects,
      REFRESH_TOKEN_KEYS
    );

  const tempToken =
    pickTextFromObjects(
      objects,
      TEMP_TOKEN_KEYS
    );

  const userRaw =
    pickObjectFromObjects(
      objects,
      USER_KEYS
    ) ||
    raw.user ||
    raw.usuario ||
    raw.me ||
    raw.account ||
    raw.profile ||
    raw.data?.user ||
    raw.data?.usuario ||
    raw.data?.me ||
    raw.auth?.user ||
    raw.auth?.usuario ||
    null;

  const rootAvatar =
    pickFirstText(
      raw.avatar,
      raw.avatarUrl,
      raw.data?.avatar,
      raw.data?.avatarUrl
    );

  const user =
    normalizeLoginUserForState(
      userRaw
        ? {
            ...safeObject(userRaw),

            avatar:
              resolveAvatar(userRaw) ||
              rootAvatar ||
              undefined,

            avatarUrl:
              resolveAvatar(userRaw) ||
              rootAvatar ||
              undefined,

            hasAvatar:
              userRaw.hasAvatar === true ||
              userRaw.has_avatar === true ||
              Boolean(
                resolveAvatar(userRaw) ||
                  rootAvatar
              ),
          }
        : {}
    );

  const sessionRaw =
    pickObjectFromObjects(
      objects,
      SESSION_KEYS
    );

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

  const expiresAt =
    pickTextFromObjects(
      objects,
      SESSION_EXPIRES_KEYS
    );

  const sessionData =
    normalizeSessionContext(
      sessionRaw,
      user,
      {
        sessionId,
        userId:
          sessionUserId,
        expiresAt,
      }
    );

  const statusValue =
    pickFirstValue(
      pickValueFromObjects(
        objects,
        STATUS_KEYS
      )
    );

  const code =
    pickTextFromObjects(
      objects,
      CODE_KEYS
    );

  const message =
    pickTextFromObjects(
      objects,
      MESSAGE_KEYS
    );

  const redirectTo =
    pickTextFromObjects(
      objects,
      REDIRECT_KEYS
    );

  const statusText =
    safeLower(
      statusValue,
      ""
    );

  const mode =
    safeLower(
      pickFirstText(
        raw.mode,
        raw.type,
        raw.data?.mode,
        raw.data?.type,
        raw.payload?.mode,
        raw.payload?.type,
        raw.result?.mode,
        raw.result?.type,
        statusValue
      ),
      ""
    );

  const requires2FA =
    Boolean(
      tempToken ||
        pickBoolFromObjects(
          objects,
          TWO_FACTOR_BOOL_KEYS
        ) ||
        TWO_FACTOR_STATUSES.has(statusText)
    );

  const explicitFailure =
    !requires2FA &&
    isExplicitFailureFromObjects(objects);

  const hasToken =
    hasUsableToken(token);

  const hasUser =
    hasUsableUser(user);

  const tokenOnly =
    !explicitFailure &&
    !requires2FA &&
    hasToken &&
    (
      mode === "token_only" ||
      mode === "token-only" ||
      opts.allowTokenOnly === true ||
      !hasUser
    );

  const authenticated =
    !explicitFailure &&
    !requires2FA &&
    hasToken &&
    hasUser;

  return {
    raw:
      result,

    ok:
      explicitFailure
        ? false
        : authenticated || tokenOnly || requires2FA || (opts.allowUserOnly === true && hasUser),

    success:
      explicitFailure
        ? false
        : authenticated || tokenOnly || requires2FA || (opts.allowUserOnly === true && hasUser),

    explicitFailure,
    authenticated,
    tokenOnly,

    token:
      hasToken
        ? token
        : "",

    accessToken:
      hasToken
        ? token
        : "",

    refreshToken:
      safeText(refreshToken, ""),

    user:
      hasUser
        ? user
        : null,

    tempToken:
      safeText(tempToken, ""),

    requires2FA,

    session:
      sessionData,

    sessionData,

    sessionId:
      sessionData?.sessionId ||
      sessionId ||
      "",

    sessionUserId:
      sessionData?.sessionUserId ||
      sessionData?.userId ||
      sessionUserId ||
      "",

    status:
      safeText(
        statusValue,
        explicitFailure
          ? "auth_failed"
          : requires2FA
            ? "2fa_required"
            : authenticated
              ? "authenticated"
              : tokenOnly
                ? "token_only"
                : hasUser
                  ? "user_loaded"
                  : ""
      ),

    code:
      safeText(code, ""),

    message:
      safeText(message, ""),

    redirectTo:
      safeText(redirectTo, ""),
  };
}

function createAuthErrorFromResult(
  normalized = {},
  fallbackMessage = "No se pudo completar la autenticación."
) {
  const message =
    safeText(
      normalized.message,
      ""
    ) ||
    fallbackMessage;

  const error =
    new Error(message);

  error.name =
    "AuthError";

  const statusAsNumber =
    Number(normalized.status);

  error.status =
    Number.isFinite(statusAsNumber) &&
    statusAsNumber >= 400
      ? statusAsNumber
      : 401;

  error.code =
    normalized.code ||
    "INVALID_AUTH_SESSION";

  error.data = {
    code:
      error.code,

    message,

    status:
      normalized.status ||
      "auth_failed",
  };

  error.raw =
    normalized.raw || null;

  return error;
}

/* =========================================================
   ROUTE CONTEXT
========================================================= */

function safePathFromUrlLike(value = "") {
  try {
    if (typeof helperPathFromUrlLike === "function") {
      return helperPathFromUrlLike(value);
    }
  } catch {}

  return safeText(value, "");
}

function safeNormalizePublicPath(value = DEFAULT_ROUTE) {
  try {
    if (typeof normalizePublicPath === "function") {
      return normalizePublicPath(value);
    }
  } catch {}

  const raw =
    safeText(value, DEFAULT_ROUTE) ||
    DEFAULT_ROUTE;

  if (!raw.startsWith("/")) {
    return `/${raw}`;
  }

  return raw;
}

function safeNormalizeCanonicalPath(value = DEFAULT_ROUTE) {
  try {
    if (typeof normalizeCanonicalPath === "function") {
      return normalizeCanonicalPath(value);
    }
  } catch {}

  const publicPath =
    safeNormalizePublicPath(value);

  return (
    publicPath
      .split("?")[0]
      .split("#")[0] ||
    DEFAULT_ROUTE
  );
}

function getBrowserPublicPathSafe() {
  try {
    return getCurrentPublicPath?.() || DEFAULT_ROUTE;
  } catch {}

  if (!isBrowser()) {
    return (
      AppCore?.state?.publicPath ||
      AppCore?.state?.route ||
      DEFAULT_ROUTE
    );
  }

  try {
    return `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return DEFAULT_ROUTE;
  }
}

function getCanonicalPublicPath(value = DEFAULT_ROUTE) {
  return safeNormalizeCanonicalPath(
    safePathFromUrlLike(value) ||
      value ||
      DEFAULT_ROUTE
  );
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

function getActivationInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__,
      ""
    );
  } catch {
    return "";
  }
}

function getResetConfirmInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__ ||
        window.__ONION_RESET_CONFIRM_INITIAL_URL__,
      ""
    );
  } catch {
    return "";
  }
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

function isActivationTokenScrubbed() {
  return Boolean(
    isHistoryStateFlagEnabled("scrubbedActivationToken") ||
      isHistoryStateFlagEnabled("activationTokenScrubbed") ||
      isHistoryStateFlagEnabled("scrubbedActivateAccountToken")
  );
}

function isResetTokenScrubbed() {
  return Boolean(
    isHistoryStateFlagEnabled("scrubbedResetToken") ||
      isHistoryStateFlagEnabled("resetTokenScrubbed") ||
      isHistoryStateFlagEnabled("scrubbedResetPasswordToken") ||
      isHistoryStateFlagEnabled("scrubbedResetConfirmToken") ||
      isHistoryStateFlagEnabled("scrubbedPasswordResetToken")
  );
}

function routeStartsWith(path = DEFAULT_ROUTE, candidate = DEFAULT_ROUTE) {
  const cleanPath =
    getCanonicalPublicPath(path).toLowerCase();

  const cleanCandidate =
    getCanonicalPublicPath(candidate).toLowerCase();

  return (
    cleanPath === cleanCandidate ||
    cleanPath.startsWith(`${cleanCandidate}/`)
  );
}

function isPublicTechnicalRoute(path = getBrowserPublicPathSafe()) {
  try {
    if (
      typeof helperIsPublicTechnicalRoute === "function" &&
      helperIsPublicTechnicalRoute(path)
    ) {
      return true;
    }
  } catch {}

  return Array.from(PUBLIC_TECHNICAL_ROUTE_SET)
    .some((candidate) =>
      routeStartsWith(
        path,
        candidate
      )
    );
}

function isActivationRoute(path = getBrowserPublicPathSafe()) {
  try {
    if (
      typeof helperIsActivationRoute === "function" &&
      helperIsActivationRoute(path)
    ) {
      return true;
    }
  } catch {}

  return routeStartsWith(
    path,
    ACTIVATION_PATH
  );
}

function isResetConfirmRoute(path = getBrowserPublicPathSafe()) {
  try {
    if (
      typeof helperIsResetPasswordConfirmRoute === "function" &&
      helperIsResetPasswordConfirmRoute(path)
    ) {
      return true;
    }
  } catch {}

  return routeStartsWith(
    path,
    RESET_CONFIRM_PATH
  );
}

function hasTokenInSearch(search = "", names = []) {
  const finalNames =
    Array.isArray(names) && names.length
      ? names
      : [
          "token",
          "code",
          "t",
        ];

  try {
    const params =
      new URLSearchParams(search || "");

    return finalNames.some((name) =>
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

function hasTechnicalTokenInPathOrQuery(value = "", routePath = "", names = []) {
  const raw =
    safeText(value, "");

  if (
    !raw ||
    !routePath
  ) {
    return false;
  }

  const path =
    safePathFromUrlLike(raw) ||
    raw;

  const canonical =
    getCanonicalPublicPath(path);

  if (canonical.startsWith(`${routePath}/`)) {
    const token =
      canonical
        .slice(`${routePath}/`.length)
        .split("/")[0];

    if (safeText(token, "")) {
      return true;
    }
  }

  try {
    const parsed =
      new URL(
        raw,
        isBrowser()
          ? window.location.origin
          : "http://localhost"
      );

    if (
      hasTokenInSearch(
        parsed.search,
        names
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

      if (
        hasTokenInSearch(
          query ? `?${query}` : "",
          names
        )
      ) {
        return true;
      }
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
          names
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function hasActivationToken(value = getBrowserPublicPathSafe()) {
  try {
    if (
      typeof helperHasActivationToken === "function" &&
      helperHasActivationToken(value)
    ) {
      return true;
    }
  } catch {}

  return hasTechnicalTokenInPathOrQuery(
    value,
    ACTIVATION_PATH,
    ACTIVATION_TOKEN_PARAM_NAMES
  );
}

function hasResetConfirmToken(value = getBrowserPublicPathSafe()) {
  try {
    if (
      typeof helperHasResetToken === "function" &&
      helperHasResetToken(value)
    ) {
      return true;
    }
  } catch {}

  return hasTechnicalTokenInPathOrQuery(
    value,
    RESET_CONFIRM_PATH,
    RESET_TOKEN_PARAM_NAMES
  );
}

function getCurrentRouteContext() {
  const state =
    AppCore?.state || {};

  const browserPath =
    getBrowserPublicPathSafe();

  const publicPath =
    safeNormalizePublicPath(
      safeText(state.publicPath, "") ||
        browserPath ||
        DEFAULT_ROUTE
    );

  const route =
    safeNormalizeCanonicalPath(
      safeText(state.route, "") ||
        publicPath ||
        DEFAULT_ROUTE
    );

  const initialUrl =
    getInitialUrl();

  const activationInitialUrl =
    getActivationInitialUrl();

  const resetConfirmInitialUrl =
    getResetConfirmInitialUrl();

  const candidates =
    [
      state.bootProtectedInitialUrl,
      state.bootActivationInitialUrl,
      state.bootResetConfirmInitialUrl,
      activationInitialUrl,
      resetConfirmInitialUrl,
      state.bootInitialUrl,
      initialUrl,
      browserPath,
      publicPath,
      route,
    ]
      .map((value) =>
        safeText(value, "")
      )
      .filter(Boolean);

  const activationBoot =
    !isActivationTokenScrubbed() &&
    candidates.some((candidate) =>
      isActivationRoute(candidate) &&
      hasActivationToken(candidate)
    );

  const resetConfirmBoot =
    !isResetTokenScrubbed() &&
    candidates.some((candidate) =>
      isResetConfirmRoute(candidate) &&
      hasResetConfirmToken(candidate)
    );

  const publicTechnical =
    Boolean(
      isPublicTechnicalRoute(route) ||
        isPublicTechnicalRoute(publicPath) ||
        activationBoot ||
        resetConfirmBoot
    );

  return {
    route:
      route || DEFAULT_ROUTE,

    publicPath:
      publicPath || DEFAULT_ROUTE,

    browserPath,

    initialUrl,
    activationInitialUrl,
    resetConfirmInitialUrl,

    activationBoot,
    resetConfirmBoot,
    publicTechnical,

    activationTokenScrubbed:
      isActivationTokenScrubbed(),

    resetTokenScrubbed:
      isResetTokenScrubbed(),
  };
}

/* =========================================================
   SESSION RUNTIME
========================================================= */

function createInitialSessionState() {
  return {
    loggingIn:
      false,

    restoring:
      false,

    checking:
      false,

    refreshing:
      false,

    twoFactorPending:
      false,

    lastLoginAt:
      null,

    lastLoginErrorAt:
      null,

    lastCheckAt:
      null,

    lastRefreshAt:
      null,

    lastRestoreAt:
      null,

    loginPromise:
      null,

    refreshPromise:
      null,

    mePromise:
      null,

    restorePromise:
      null,

    loginFailCount:
      0,

    refreshFailCount:
      0,

    restoreFailCount:
      0,

    refreshBlockedUntil:
      0,

    lastError:
      null,

    lastLoginResult:
      null,

    lastMeResult:
      null,
  };
}

function cloneRuntimeSessionState(source = {}) {
  return {
    loggingIn:
      Boolean(source.loggingIn),

    restoring:
      Boolean(source.restoring),

    checking:
      Boolean(source.checking),

    refreshing:
      Boolean(source.refreshing),

    twoFactorPending:
      Boolean(source.twoFactorPending),

    lastLoginAt:
      source.lastLoginAt || null,

    lastLoginErrorAt:
      source.lastLoginErrorAt || null,

    lastCheckAt:
      source.lastCheckAt || null,

    lastRefreshAt:
      source.lastRefreshAt || null,

    lastRestoreAt:
      source.lastRestoreAt || null,

    loginInFlight:
      Boolean(source.loginPromise),

    refreshInFlight:
      Boolean(source.refreshPromise),

    meInFlight:
      Boolean(source.mePromise),

    restoreInFlight:
      Boolean(source.restorePromise),

    loginFailCount:
      Number(source.loginFailCount || 0),

    refreshFailCount:
      Number(source.refreshFailCount || 0),

    restoreFailCount:
      Number(source.restoreFailCount || 0),

    refreshBlockedUntil:
      Number(source.refreshBlockedUntil || 0),

    lastError:
      source.lastError || null,

    lastLoginResult:
      source.lastLoginResult || null,

    lastMeResult:
      source.lastMeResult || null,
  };
}

function looksLikeRuntimeSession(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (
        Object.prototype.hasOwnProperty.call(value, "checking") ||
        Object.prototype.hasOwnProperty.call(value, "refreshing") ||
        Object.prototype.hasOwnProperty.call(value, "restoring") ||
        Object.prototype.hasOwnProperty.call(value, "restorePromise") ||
        Object.prototype.hasOwnProperty.call(value, "refreshPromise") ||
        Object.prototype.hasOwnProperty.call(value, "mePromise") ||
        Object.prototype.hasOwnProperty.call(value, "loginPromise")
      )
  );
}

function resolveRestoreArgs(args = [], fallbackSession = null) {
  const firstArg =
    args[0];

  const secondArg =
    args[1];

  if (looksLikeRuntimeSession(firstArg)) {
    return {
      runtimeSession:
        firstArg,

      options:
        safeObject(secondArg),
    };
  }

  return {
    runtimeSession:
      fallbackSession,

    options:
      safeObject(firstArg),
  };
}

function normalizeRestoreOptions(options = {}) {
  const baseOptions =
    safeObject(options);

  const routeContext =
    getCurrentRouteContext();

  const preserve =
    Boolean(
      baseOptions.preserveRoute ||
        baseOptions.preserveCurrentRoute ||
        baseOptions.publicRoute ||
        routeContext.publicTechnical ||
        routeContext.activationBoot ||
        routeContext.resetConfirmBoot
    );

  return {
    ...baseOptions,

    publicRoute:
      Boolean(
        baseOptions.publicRoute ||
          routeContext.publicTechnical
      ),

    preserveRoute:
      Boolean(
        baseOptions.preserveRoute ||
          preserve
      ),

    preserveCurrentRoute:
      Boolean(
        baseOptions.preserveCurrentRoute ||
          preserve
      ),

    activationBoot:
      Boolean(
        baseOptions.activationBoot ||
          routeContext.activationBoot
      ),

    resetConfirmBoot:
      Boolean(
        baseOptions.resetConfirmBoot ||
          routeContext.resetConfirmBoot
      ),

    route:
      baseOptions.route ||
      routeContext.route,

    publicPath:
      baseOptions.publicPath ||
      routeContext.publicPath,

    routeContext:
      sanitizeRouteContext(
        routeContext
      ),
  };
}

function setRuntimeFlag(sessionState, type, value) {
  if (!sessionState) {
    return;
  }

  if (type === "login") {
    sessionState.loggingIn =
      Boolean(value);
  }

  if (type === "restore") {
    sessionState.restoring =
      Boolean(value);
  }

  if (type === "refresh") {
    sessionState.refreshing =
      Boolean(value);
  }

  if (type === "me") {
    sessionState.checking =
      Boolean(value);
  }
}

function markRuntimeSuccess(sessionState, type) {
  if (!sessionState) {
    return;
  }

  const current =
    nowMs();

  if (type === "login") {
    sessionState.lastLoginAt =
      current;
    sessionState.loginFailCount =
      0;
  }

  if (type === "restore") {
    sessionState.lastRestoreAt =
      current;
    sessionState.restoreFailCount =
      0;
  }

  if (type === "refresh") {
    sessionState.lastRefreshAt =
      current;
    sessionState.refreshFailCount =
      0;
    sessionState.refreshBlockedUntil =
      0;
  }

  if (type === "me") {
    sessionState.lastCheckAt =
      current;
  }
}

function markRuntimeError(sessionState, type, error) {
  if (!sessionState) {
    return;
  }

  sessionState.lastError =
    createRuntimeErrorSnapshot(
      type,
      error
    );

  if (type === "login") {
    sessionState.loginFailCount =
      Number(sessionState.loginFailCount || 0) + 1;

    sessionState.lastLoginErrorAt =
      nowMs();
  }

  if (type === "refresh") {
    sessionState.refreshFailCount =
      Number(sessionState.refreshFailCount || 0) + 1;

    if (sessionState.refreshFailCount >= 3) {
      sessionState.refreshBlockedUntil =
        nowMs() + 30_000;
    }
  }

  if (type === "restore") {
    sessionState.restoreFailCount =
      Number(sessionState.restoreFailCount || 0) + 1;
  }
}

async function runRuntimeMetric(sessionState, type, executor, args = [], eventOptions = {}) {
  const startedAt =
    nowMs();

  setRuntimeFlag(
    sessionState,
    type,
    true
  );

  emit(
    `auth:runtime:${type}:start`,
    {},
    eventOptions
  );

  try {
    const result =
      await Promise.resolve(
        executor(...args)
      );

    markRuntimeSuccess(
      sessionState,
      type
    );

    emit(
      `auth:runtime:${type}:success`,
      {
        durationMs:
          nowMs() - startedAt,

        ok:
          result?.ok !== false,
      },
      eventOptions
    );

    return result;
  } catch (error) {
    markRuntimeError(
      sessionState,
      type,
      error
    );

    emit(
      `auth:runtime:${type}:error`,
      {
        durationMs:
          nowMs() - startedAt,

        error:
          sessionState.lastError,
      },
      eventOptions
    );

    throw error;
  } finally {
    setRuntimeFlag(
      sessionState,
      type,
      false
    );
  }
}

/* =========================================================
   SESSION COMMIT
========================================================= */

function extractRoleFromUser(user = {}) {
  const clean =
    safeObject(user);

  const roles =
    Array.isArray(clean.roles)
      ? clean.roles
      : [];

  return (
    pickFirstText(
      clean.role,
      clean.rol,
      clean.userRole,
      clean.user_role,
      clean.type,
      clean.userType,
      clean.user_type,
      roles[0],
      AppCore?.state?.role,
      AppCore?.state?.rol,
      AppCore?.state?.userRole
    ) || null
  );
}

function buildSessionPayloadFromNormalized(normalized = {}, source = "Auth.session", options = {}) {
  const raw =
    safeObject(normalized.raw);

  const opts =
    safeObject(options);

  const explicitUser =
    normalizeLoginUserForState(
      normalized.user || {}
    );

  const existingUser =
    opts.preserveExistingUser === true
      ? normalizeLoginUserForState(
          AppCore?.state?.user ||
            AppCore?.state?.currentUser ||
            AppCore?.state?.sessionUser ||
            {}
        )
      : null;

  const user =
    explicitUser ||
    existingUser ||
    null;

  const token =
    pickFirstText(
      normalized.token,
      normalized.accessToken,
      getCurrentTokenFromCore()
    );

  const refreshToken =
    safeText(
      normalized.refreshToken,
      ""
    );

  const role =
    extractRoleFromUser(user || {});

  const sessionData =
    normalizeSessionContext(
      normalized.sessionData ||
        normalized.session ||
        raw.sessionData ||
        raw.session ||
        {},
      user,
      {
        sessionId:
          normalized.sessionId,

        sessionUserId:
          normalized.sessionUserId,
      }
    );

  return {
    ...raw,

    ok:
      true,

    success:
      true,

    authenticated:
      Boolean(
        hasUsableToken(token) &&
          hasUsableUser(user)
      ),

    token:
      token || null,

    accessToken:
      token || null,

    access_token:
      token || null,

    refreshToken:
      refreshToken ||
      raw.refreshToken ||
      raw.refresh_token ||
      null,

    refresh_token:
      refreshToken ||
      raw.refresh_token ||
      raw.refreshToken ||
      null,

    user,
    usuario:
      user,
    me:
      user,
    account:
      user,
    profile:
      user,

    role,
    rol:
      role,

    session:
      sessionData,

    sessionData,

    sessionId:
      sessionData?.sessionId ||
      normalized.sessionId ||
      null,

    session_id:
      sessionData?.sessionId ||
      normalized.sessionId ||
      null,

    sessionUserId:
      sessionData?.sessionUserId ||
      sessionData?.userId ||
      normalized.sessionUserId ||
      user?.userId ||
      user?.id ||
      null,

    session_user_id:
      sessionData?.sessionUserId ||
      sessionData?.userId ||
      normalized.sessionUserId ||
      user?.userId ||
      user?.id ||
      null,

    preserveExistingUser:
      opts.preserveExistingUser === true,

    silent:
      true,

    eventMode:
      source,

    source,
  };
}

function reinforceCoreSession(sessionPayload = {}, options = {}) {
  const payload =
    safeObject(sessionPayload);

  const opts =
    safeObject(options);

  const explicitUser =
    normalizeLoginUserForState(
      payload.user ||
        payload.usuario ||
        payload.me ||
        payload.account ||
        payload.profile ||
        {}
    );

  const existingUser =
    opts.preserveExistingUser === true || payload.preserveExistingUser === true
      ? normalizeLoginUserForState(
          AppCore?.state?.user ||
            AppCore?.state?.currentUser ||
            AppCore?.state?.sessionUser ||
            {}
        )
      : null;

  const user =
    explicitUser ||
    existingUser ||
    null;

  const token =
    pickFirstText(
      payload.token,
      payload.accessToken,
      payload.access_token,
      getCurrentTokenFromCore()
    );

  const hasToken =
    hasUsableToken(token);

  const hasUser =
    hasUsableUser(user);

  const role =
    extractRoleFromUser(user || {});

  const sessionData =
    normalizeSessionContext(
      payload.sessionData ||
        payload.session ||
        {},
      user,
      payload
    );

  const patch = {
    authenticated:
      Boolean(
        hasToken &&
          hasUser
      ),

    hasToken:
      hasToken,

    token:
      hasToken
        ? token
        : null,

    accessToken:
      hasToken
        ? token
        : null,

    access_token:
      hasToken
        ? token
        : null,

    user:
      hasUser
        ? user
        : null,

    currentUser:
      hasUser
        ? user
        : null,

    sessionUser:
      hasUser
        ? user
        : null,

    authUser:
      hasUser
        ? user
        : null,

    account:
      hasUser
        ? user
        : null,

    profile:
      hasUser
        ? user
        : null,

    role:
      hasUser
        ? role || null
        : null,

    rol:
      hasUser
        ? role || null
        : null,

    userRole:
      hasUser
        ? role || null
        : null,

    roles:
      hasUser
        ? uniqueStrings([
            role,
            ...safeArray(user?.roles),
          ])
        : [],

    session:
      sessionData,

    sessionData,

    sessionId:
      sessionData?.sessionId ||
      payload.sessionId ||
      null,

    sessionUserId:
      sessionData?.sessionUserId ||
      sessionData?.userId ||
      payload.sessionUserId ||
      user?.userId ||
      user?.id ||
      null,

    username:
      hasUser
        ? user?.username ||
          user?.usernameLower ||
          user?.slug ||
          null
        : null,

    currentResolvedUsername:
      hasUser
        ? user?.slug ||
          user?.usernameLower ||
          user?.username ||
          null
        : null,

    resolvedUsername:
      hasUser
        ? user?.slug ||
          user?.usernameLower ||
          user?.username ||
          null
        : null,

    avatar:
      hasUser
        ? user?.avatar ||
          user?.avatarUrl ||
          null
        : null,

    avatarUrl:
      hasUser
        ? user?.avatarUrl ||
          user?.avatar ||
          null
        : null,
  };

  try {
    AppCore?.setState?.(
      patch,
      {
        source:
          opts.source || "Auth.reinforceCoreSession",

        emit:
          false,

        emitState:
          false,

        emitDerived:
          false,

        silent:
          true,

        forceUnauthenticated:
          patch.authenticated !== true,
      }
    );
  } catch {
    try {
      if (
        AppCore?.state &&
        typeof AppCore.state === "object"
      ) {
        Object.assign(
          AppCore.state,
          patch
        );
      }
    } catch {}
  }

  try {
    AppCore?.applySession?.(
      {
        ...payload,
        ...patch,
      },
      {
        source:
          opts.source || "Auth.reinforceCoreSession",

        emit:
          false,

        silent:
          true,

        preserveExistingUser:
          opts.preserveExistingUser === true || payload.preserveExistingUser === true,
      }
    );
  } catch {}

  return patch;
}

function applyTokenOnlySession(normalized = {}, options = {}) {
  const opts =
    safeObject(options);

  const token =
    pickFirstText(
      normalized.token,
      normalized.accessToken
    );

  if (!hasUsableToken(token)) {
    return {
      ok:
        false,
      tokenOnly:
        true,
      applied:
        false,
    };
  }

  const existingUser =
    normalizeLoginUserForState(
      AppCore?.state?.user ||
        AppCore?.state?.currentUser ||
        AppCore?.state?.sessionUser ||
        {}
    );

  try {
    AppCore?.setToken?.(
      token,
      {
        source:
          opts.source || "Auth.tokenOnly",
        emit:
          false,
        silent:
          true,
      }
    );
  } catch {}

  const payload = {
    token,
    accessToken:
      token,
    access_token:
      token,
    refreshToken:
      normalized.refreshToken || undefined,
    sessionId:
      normalized.sessionId || undefined,
    sessionUserId:
      normalized.sessionUserId || undefined,
    user:
      existingUser || undefined,
    preserveExistingUser:
      true,
  };

  const patch =
    reinforceCoreSession(
      payload,
      {
        source:
          opts.source || "Auth.tokenOnly",
        preserveExistingUser:
          true,
      }
    );

  return {
    ok:
      true,

    tokenOnly:
      true,

    applied:
      true,

    token,

    user:
      patch.user || existingUser || null,

    role:
      patch.role || null,

    roles:
      patch.roles || [],

    session:
      patch.session || null,

    sessionData:
      patch.sessionData || null,

    sessionId:
      patch.sessionId || normalized.sessionId || null,

    sessionUserId:
      patch.sessionUserId || normalized.sessionUserId || null,

    snapshot:
      buildSessionSnapshot({
        source:
          opts.source || "Auth.tokenOnly",
        eventMode:
          opts.eventMode || "token_only",
      }),
  };
}

function applyAcceptedSession(normalized = {}, options = {}) {
  const opts =
    safeObject(options);

  if (
    normalized.tokenOnly === true ||
    (
      hasUsableToken(normalized.token || normalized.accessToken) &&
      !hasUsableUser(normalized.user) &&
      opts.allowTokenOnly !== false
    )
  ) {
    return applyTokenOnlySession(
      normalized,
      {
        ...opts,
        preserveExistingUser:
          true,
      }
    );
  }

  const sessionPayload =
    buildSessionPayloadFromNormalized(
      normalized,
      opts.source || "Auth.session",
      opts
    );

  let snapshot =
    null;

  try {
    if (isFunction(applySession)) {
      snapshot =
        applySession(sessionPayload);
    }
  } catch (error) {
    safeWarn(
      "applySession no pudo aplicar sesión.",
      error
    );
  }

  const corePatch =
    reinforceCoreSession(
      sessionPayload,
      {
        source:
          opts.source || "Auth.session",
        preserveExistingUser:
          opts.preserveExistingUser === true,
      }
    );

  const finalSnapshot =
    snapshot ||
    buildSessionSnapshot({
      source:
        opts.source || "Auth.session",
      eventMode:
        opts.eventMode || "session",
    });

  try {
    AppCore?.syncUserUI?.({
      reason:
        opts.reason || "auth-session-applied",
      source:
        opts.source || "Auth.session",
    });
  } catch {
    try {
      AppCore?.syncUserUI?.();
    } catch {}
  }

  if (opts.emitRepair !== false) {
    emit(
      "app:ui:repair-request",
      {
        reason:
          opts.reason || "auth-session-applied",

        authenticated:
          Boolean(corePatch.authenticated),

        user:
          corePatch.user || null,

        role:
          corePatch.role || null,

        repairShell:
          false,

        hardRepair:
          false,

        rebind:
          false,
      }
    );
  }

  return {
    user:
      corePatch.user,

    role:
      corePatch.role,

    roles:
      corePatch.roles || [],

    token:
      corePatch.token,

    refreshToken:
      sessionPayload.refreshToken || null,

    session:
      corePatch.session ||
      sessionPayload.session ||
      null,

    sessionData:
      corePatch.sessionData ||
      corePatch.session ||
      sessionPayload.sessionData ||
      null,

    sessionId:
      corePatch.sessionId ||
      sessionPayload.sessionId ||
      null,

    sessionUserId:
      corePatch.sessionUserId ||
      sessionPayload.sessionUserId ||
      null,

    snapshot:
      finalSnapshot,

    sessionPayload,
  };
}

function clearAuthState(reason = "auth_clear", options = {}) {
  const opts =
    safeObject(options);

  const routeContext =
    getCurrentRouteContext();

  const shouldPreserve =
    Boolean(
      opts.preserveRoute ||
        opts.preserveCurrentRoute ||
        opts.publicRoute ||
        routeContext.publicTechnical
    );

  try {
    clearSessionLocal?.({
      silent:
        opts.silent !== false,

      reason,

      source:
        "Auth.clear",

      preserveRoute:
        shouldPreserve,

      preserveCurrentRoute:
        shouldPreserve,

      route:
        routeContext.route,

      publicPath:
        routeContext.publicPath,
    });
  } catch {
    try {
      clearSessionLocal?.({
        silent:
          true,
        source:
          "Auth.clear:fallback",
      });
    } catch {}
  }

  try {
    clearAuthStorage?.({
      silent:
        true,
      includeLegacy:
        true,
    });
  } catch {}

  try {
    AppCore?.clearSession?.({
      silent:
        true,
      reason,
      source:
        "Auth.clear",
    });
  } catch {}

  const patch = {
    authenticated:
      false,

    hasToken:
      false,

    user:
      null,

    currentUser:
      null,

    sessionUser:
      null,

    authUser:
      null,

    account:
      null,

    profile:
      null,

    role:
      null,

    rol:
      null,

    userRole:
      null,

    roles:
      [],

    isAdmin:
      false,

    isSupport:
      false,

    isManager:
      false,

    isClient:
      false,

    token:
      null,

    accessToken:
      null,

    access_token:
      null,

    refreshToken:
      null,

    refresh_token:
      null,

    session:
      null,

    sessionData:
      null,

    sessionId:
      null,

    sessionUserId:
      null,

    username:
      null,

    currentResolvedUsername:
      null,

    resolvedUsername:
      null,

    avatar:
      null,

    avatarUrl:
      null,

    twoFactorPending:
      false,

    tempToken:
      null,
    temp_token:
      null,
  };

  try {
    AppCore?.setState?.(
      patch,
      {
        source:
          "Auth.clear",
        forceUnauthenticated:
          true,
        emit:
          false,
        emitState:
          false,
        emitDerived:
          false,
        silent:
          true,
      }
    );
  } catch {
    try {
      if (AppCore?.state) {
        Object.assign(
          AppCore.state,
          patch
        );
      }
    } catch {}
  }

  if (shouldPreserve) {
    try {
      AppCore?.setRoute?.(
        routeContext.route
      );
    } catch {}

    try {
      AppCore?.setPublicPath?.(
        routeContext.publicPath
      );
    } catch {}

    try {
      AppCore?.setState?.(
        {
          route:
            routeContext.route,

          publicPath:
            routeContext.publicPath,

          bootIsActivation:
            Boolean(routeContext.activationBoot),

          bootHasActivationToken:
            Boolean(routeContext.activationBoot),

          bootIsResetConfirm:
            Boolean(routeContext.resetConfirmBoot),

          bootHasResetToken:
            Boolean(routeContext.resetConfirmBoot),
        },
        {
          source:
            "Auth.clear:preserve-route",
          emit:
            false,
          silent:
            true,
        }
      );
    } catch {}
  }

  try {
    AppCore?.syncUserUI?.({
      reason:
        `auth-clear:${reason}`,
      source:
        "Auth.clear",
    });
  } catch {
    try {
      AppCore?.syncUserUI?.();
    } catch {}
  }

  if (opts.emit === true) {
    emit(
      "auth:session:cleared-by-auth",
      {
        reason,
        routeContext:
          sanitizeRouteContext(routeContext),
      }
    );

    emit(
      "app:ui:repair-request",
      {
        reason:
          `auth-clear:${reason}`,
        authenticated:
          false,
        user:
          null,
      }
    );
  }

  return true;
}

function markTwoFactorPending(sessionState, normalized = {}) {
  if (sessionState) {
    sessionState.twoFactorPending =
      true;
  }

  try {
    persistTempToken?.(
      normalized.tempToken || null
    );
  } catch {}

  try {
    AppCore?.setState?.(
      {
        authenticated:
          false,

        hasToken:
          false,

        token:
          null,

        accessToken:
          null,

        access_token:
          null,

        user:
          null,

        currentUser:
          null,

        sessionUser:
          null,

        authUser:
          null,

        role:
          null,

        userRole:
          null,

        roles:
          [],

        session:
          null,

        sessionData:
          null,

        sessionId:
          null,

        sessionUserId:
          null,

        twoFactorPending:
          true,

        tempToken:
          normalized.tempToken || null,
      },
      {
        source:
          "Auth.2fa",
        forceUnauthenticated:
          true,
        emit:
          false,
        silent:
          true,
      }
    );
  } catch {}

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  emit(
    "app:ui:repair-request",
    {
      reason:
        "auth-login-2fa-required",
      authenticated:
        false,
    }
  );
}

/* =========================================================
   LOGIN EVENTS
========================================================= */

function buildAcceptedLoginPayload({
  normalized = {},
  committed = {},
  durationMs = 0,
  phase = "sync",
  reason = "login-success",
} = {}) {
  const user =
    committed.user ||
    normalized.user ||
    null;

  const role =
    committed.role ||
    extractRoleFromUser(user || {});

  return {
    durationMs,

    user,
    role,

    roles:
      committed.roles || [],

    authenticated:
      true,

    reason,

    phase,

    redirectTo:
      normalized.redirectTo || null,

    sessionId:
      committed.sessionId ||
      normalized.sessionId ||
      null,
  };
}

function emitAcceptedLoginEvents({
  normalized = {},
  committed = {},
  durationMs = 0,
  phase = "sync",
} = {}) {
  const payload =
    buildAcceptedLoginPayload({
      normalized,
      committed,
      durationMs,
      phase,
      reason:
        "login-success",
    });

  emit(
    "auth:login:success",
    payload
  );

  emit(
    "app:ui:repair-request",
    {
      ...payload,

      reason:
        "auth-login-success",

      repairShell:
        false,

      hardRepair:
        false,

      rebind:
        false,

      afterPaint:
        false,
    }
  );
}

function schedulePostLoginRepair({
  normalized = {},
  committed = {},
  durationMs = 0,
} = {}) {
  afterPaint(() => {
    const payload =
      buildAcceptedLoginPayload({
        normalized,
        committed,
        durationMs,
        phase:
          "after-paint",
        reason:
          "auth-login-after-paint",
      });

    emit(
      "app:ui:repair-request",
      {
        ...payload,

        repairShell:
          false,

        hardRepair:
          false,

        rebind:
          false,

        afterPaint:
          true,
      }
    );

    emit(
      "app:ui:repair",
      {
        ...payload,

        repairShell:
          false,

        hardRepair:
          false,

        rebind:
          false,
      }
    );

    try {
      AppCore?.syncUserUI?.();
    } catch {}
  });
}

/* =========================================================
   REFRESH / RESTORE RESULT
========================================================= */

function normalizeRefreshResult(result) {
  if (result === true) {
    return {
      ok:
        true,
      refreshed:
        true,
    };
  }

  if (
    result === false ||
    result === null ||
    result === undefined
  ) {
    return {
      ok:
        false,
      refreshed:
        false,
    };
  }

  if (isPlainObject(result)) {
    return {
      ...result,

      ok:
        result.ok !== false,

      refreshed:
        result.refreshed !== false &&
        result.ok !== false,
    };
  }

  return {
    ok:
      Boolean(result),

    refreshed:
      Boolean(result),

    value:
      result,
  };
}

function isRefreshResultSuccessful(result) {
  const normalized =
    normalizeRefreshResult(result);

  return Boolean(
    normalized.ok !== false &&
      normalized.refreshed !== false
  );
}

/* =========================================================
   DIRECT ME
========================================================= */

async function fetchMeDirect(options = {}) {
  const endpoint =
    resolveAuthEndpoint(
      "me",
      "/api/auth/me"
    );

  return authApiRequest(
    "GET",
    endpoint,
    undefined,
    {
      ...safeObject(options),

      auth:
        true,

      skipAuth:
        false,

      _skipAuthRefresh:
        options._skipAuthRefresh === true,

      noStore:
        true,
    }
  );
}

function normalizeMeResult(raw = {}) {
  return normalizeAuthPayload(
    raw,
    {
      allowUserOnly:
        true,
      useCurrentToken:
        true,
      fallbackToken:
        getCurrentTokenFromCore(),
    }
  );
}

function commitMeResult(raw = {}, options = {}) {
  const normalized =
    normalizeMeResult(raw);

  if (
    normalized.explicitFailure ||
    normalized.ok === false ||
    !hasUsableUser(normalized.user)
  ) {
    return {
      ok:
        false,
      committed:
        false,
      normalized,
    };
  }

  const committed =
    applyAcceptedSession(
      normalized,
      {
        source:
          options.source || "Auth.fetchMe",

        reason:
          options.reason || "auth-fetch-me",

        eventMode:
          "me",

        emitRepair:
          options.emitRepair !== false,
      }
    );

  return {
    ok:
      true,
    committed:
      true,
    normalized,
    ...committed,
  };
}

/* =========================================================
   EXECUTORS
========================================================= */

async function executeFetchMe(runtimeSession, options = {}) {
  let restoreResult =
    null;

  let restoreError =
    null;

  if (
    isFunction(restoreFetchMe) &&
    options.forceDirect !== true
  ) {
    try {
      restoreResult =
        await restoreFetchMe(runtimeSession);

      const committed =
        commitMeResult(
          restoreResult,
          {
            source:
              "Auth.fetchMe:restore",
            reason:
              "auth-fetch-me-restore",
          }
        );

      if (committed.ok) {
        return {
          ...safeObject(restoreResult),
          ...committed,
          ok:
            true,
          user:
            committed.user,
        };
      }
    } catch (error) {
      restoreError =
        error;
    }
  }

  try {
    const direct =
      await fetchMeDirect(options);

    const committed =
      commitMeResult(
        direct,
        {
          source:
            "Auth.fetchMe:direct",
          reason:
            "auth-fetch-me-direct",
        }
      );

    if (!committed.ok) {
      throw createAuthErrorFromResult(
        committed.normalized,
        "No se pudo validar /me."
      );
    }

    return {
      ...safeObject(direct),
      ...committed,
      ok:
        true,
      user:
        committed.user,
    };
  } catch (directError) {
    if (restoreError) {
      directError.restoreError =
        restoreError;
    }

    throw directError;
  }
}

async function executeRefreshSession(runtimeSession) {
  if (!isFunction(refreshSessionCore)) {
    return {
      ok:
        false,
    };
  }

  const result =
    await refreshSessionCore(runtimeSession);

  const normalized =
    normalizeAuthPayload(
      result,
      {
        allowUserOnly:
          false,
        allowTokenOnly:
          true,
        useCurrentToken:
          true,
      }
    );

  if (normalized.tokenOnly) {
    applyTokenOnlySession(
      normalized,
      {
        source:
          "Auth.refreshSession",
        reason:
          "auth-refresh-token-only",
        eventMode:
          "refresh",
      }
    );

    return result;
  }

  if (
    normalized.user &&
    (
      normalized.token ||
      getCurrentTokenFromCore()
    )
  ) {
    applyAcceptedSession(
      normalized,
      {
        source:
          "Auth.refreshSession",
        reason:
          "auth-refresh-session",
        eventMode:
          "refresh",
      }
    );
  }

  return result;
}

async function executeRestoreSession(runtimeSession, options = {}) {
  if (!isFunction(restoreSessionCore)) {
    return {
      ok:
        false,
      user:
        null,
    };
  }

  const result =
    await restoreSessionCore(
      runtimeSession,
      options
    );

  const normalized =
    normalizeAuthPayload(
      result,
      {
        allowUserOnly:
          true,
        allowTokenOnly:
          true,
        useCurrentToken:
          true,
      }
    );

  if (normalized.tokenOnly) {
    applyTokenOnlySession(
      normalized,
      {
        source:
          "Auth.restoreSession",
        reason:
          "auth-restore-token-only",
        eventMode:
          "restore",
      }
    );
  }

  if (
    normalized.user &&
    (
      normalized.token ||
      getCurrentTokenFromCore()
    )
  ) {
    applyAcceptedSession(
      normalized,
      {
        source:
          "Auth.restoreSession",
        reason:
          "auth-restore-session",
          eventMode:
          "restore",
        emitRepair:
          true,
      }
    );

    return result;
  }

  if (
    getCurrentTokenFromCore() &&
    options.skipMeAfterRestore !== true
  ) {
    try {
      const meResult =
        await executeFetchMe(
          runtimeSession,
          {
            forceDirect:
              options.forceDirectMe === true,
          }
        );

      return {
        ...safeObject(result),
        me:
          meResult,
        user:
          meResult.user || result?.user || null,
        ok:
          meResult.ok !== false,
      };
    } catch (error) {
      if (options.publicRoute === true) {
        return result;
      }

      throw error;
    }
  }

  return result;
}

/* =========================================================
   FORM HELPERS
========================================================= */

function readLoginCredentialsFromForm(formElement) {
  const HTMLForm =
    isBrowser()
      ? window.HTMLFormElement
      : null;

  if (
    !HTMLForm ||
    !(formElement instanceof HTMLForm)
  ) {
    throw new Error(
      "Se esperaba un formulario HTML válido."
    );
  }

  const formData =
    new FormData(formElement);

  return {
    identifier:
      formData.get("identifier") ||
      formData.get("username") ||
      formData.get("email") ||
      formData.get("phone") ||
      formData.get("telefono") ||
      formData.get("user") ||
      formData.get("login") ||
      "",

    password:
      formData.get("password") || "",

    remember:
      formData.get("remember") === "on" ||
      formData.get("remember") === "true" ||
      formData.get("remember") === "1",
  };
}

/* =========================================================
   ACTIVATION RESOLUTION
========================================================= */

const activateAccountExecutor =
  getModuleExport(
    ActivationApi,
    "activateAccount",
    "activate",
    "activation",
    "confirmActivation",
    "accountActivation",
    "createUserActivation"
  );

const activateFirstUserExecutor =
  getModuleExport(
    ActivationApi,
    "activateFirstUser",
    "firstUserActivation",
    "activateInitialUser"
  );

const validateActivationTokenExecutor =
  getModuleExport(
    ActivationApi,
    "validateActivationToken",
    "validateActivateAccountToken",
    "validateActivateToken",
    "validateAccountActivationToken",
    "activationValidate"
  );

const getActivateAccountEndpoint =
  getModuleExport(
    ActivationApi,
    "getActivateAccountEndpoint",
    "getActivationEndpoint",
    "getAccountActivationEndpoint"
  ) ||
  (() =>
    AUTH_ENDPOINTS?.activateAccount ||
    AUTH_ENDPOINTS?.activation ||
    AUTH_ENDPOINTS?.activate ||
    null);

const getActivateFirstUserEndpoint =
  getModuleExport(
    ActivationApi,
    "getActivateFirstUserEndpoint",
    "getFirstUserActivationEndpoint"
  ) ||
  (() =>
    AUTH_ENDPOINTS?.activateFirstUser ||
    AUTH_ENDPOINTS?.firstUserActivation ||
    null);

const getValidateActivationTokenEndpoint =
  getModuleExport(
    ActivationApi,
    "getValidateActivationTokenEndpoint",
    "getValidateActivateAccountTokenEndpoint"
  ) ||
  (() =>
    AUTH_ENDPOINTS?.validateActivationToken ||
    AUTH_ENDPOINTS?.activationValidate ||
    null);

const resolveActivationToken =
  getModuleExport(
    ActivationApi,
    "resolveActivationToken",
    "extractActivationToken"
  ) ||
  (() => "");

const normalizeActivationPayload =
  getModuleExport(
    ActivationApi,
    "normalizeActivationPayload",
    "normalizeActivateAccountPayload"
  ) ||
  ((payload = {}) =>
    payload);

const normalizeFirstUserActivationPayload =
  getModuleExport(
    ActivationApi,
    "normalizeFirstUserActivationPayload"
  ) ||
  ((payload = {}) =>
    payload);

const buildActivationRequestBody =
  getModuleExport(
    ActivationApi,
    "buildActivationRequestBody",
    "buildActivateAccountBody"
  ) ||
  ((payload = {}) =>
    payload);

const buildActivateFirstUserBody =
  getModuleExport(
    ActivationApi,
    "buildActivateFirstUserBody",
    "buildFirstUserActivationBody"
  ) ||
  ((payload = {}) =>
    payload);

const normalizeActivationResponse =
  getModuleExport(
    ActivationApi,
    "normalizeActivationResponse",
    "normalizeActivateAccountResponse"
  ) ||
  ((response = {}) =>
    response);

const normalizeFirstUserActivationResponse =
  getModuleExport(
    ActivationApi,
    "normalizeFirstUserActivationResponse"
  ) ||
  ((response = {}) =>
    response);

async function activateAccount(payload = {}, options = {}) {
  const executor =
    activateAccountExecutor ||
    missingHandler("activateAccount en ./activation.js");

  return executor(
    payload,
    options
  );
}

async function activate(payload = {}, options = {}) {
  return activateAccount(payload, options);
}

async function activation(payload = {}, options = {}) {
  return activateAccount(payload, options);
}

async function confirmActivation(payload = {}, options = {}) {
  return activateAccount(payload, options);
}

async function accountActivation(payload = {}, options = {}) {
  return activateAccount(payload, options);
}

async function createUserActivation(payload = {}, options = {}) {
  return activateAccount(payload, options);
}

async function activateFirstUser(payload = {}, options = {}) {
  const executor =
    activateFirstUserExecutor ||
    missingHandler("activateFirstUser en ./activation.js");

  return executor(
    payload,
    options
  );
}

async function firstUserActivation(payload = {}, options = {}) {
  return activateFirstUser(payload, options);
}

async function activateInitialUser(payload = {}, options = {}) {
  return activateFirstUser(payload, options);
}

async function validateActivationToken(payload = {}, options = {}) {
  const executor =
    validateActivationTokenExecutor ||
    missingHandler("validateActivationToken en ./activation.js");

  return executor(
    payload,
    options
  );
}

async function validateActivateAccountToken(payload = {}, options = {}) {
  return validateActivationToken(payload, options);
}

async function activationValidate(payload = {}, options = {}) {
  return validateActivationToken(payload, options);
}

/* =========================================================
   2FA RESOLUTION
========================================================= */

const verifyTwoFactorExecutor =
  getModuleExport(
    TwoFactorApi,
    "verifyTwoFactor",
    "verify2FA",
    "login2fa",
    "twoFactorLogin",
    "twoFactorVerify",
    "verifyMfa",
    "mfaLogin",
    "submitTwoFactorCode"
  );

const requestTwoFactorCodeExecutor =
  getModuleExport(
    TwoFactorApi,
    "requestTwoFactorCode",
    "request2FA",
    "requestMfa",
    "sendTwoFactorCode"
  );

const resendTwoFactorCodeExecutor =
  getModuleExport(
    TwoFactorApi,
    "resendTwoFactorCode",
    "resend2FA",
    "resendMfa"
  );

const getTwoFactorLoginEndpoint =
  getModuleExport(
    TwoFactorApi,
    "getTwoFactorLoginEndpoint",
    "getTwoFactorVerifyEndpoint",
    "getMfaVerifyEndpoint"
  ) ||
  (() =>
    AUTH_ENDPOINTS?.twoFactorLogin ||
    AUTH_ENDPOINTS?.login2fa ||
    AUTH_ENDPOINTS?.mfaLogin ||
    null);

const getTwoFactorRequestEndpoint =
  getModuleExport(
    TwoFactorApi,
    "getTwoFactorRequestEndpoint"
  ) ||
  (() =>
    AUTH_ENDPOINTS?.twoFactorRequest ||
    AUTH_ENDPOINTS?.request2FA ||
    AUTH_ENDPOINTS?.requestMfa ||
    null);

const getTwoFactorResendEndpoint =
  getModuleExport(
    TwoFactorApi,
    "getTwoFactorResendEndpoint"
  ) ||
  (() =>
    AUTH_ENDPOINTS?.twoFactorResend ||
    AUTH_ENDPOINTS?.resend2FA ||
    AUTH_ENDPOINTS?.resendMfa ||
    null);

const resolveTwoFactorTempToken =
  getModuleExport(
    TwoFactorApi,
    "resolveTwoFactorTempToken"
  ) ||
  (() =>
    getStoredTempToken() || "");

const normalizeTwoFactorPayload =
  getModuleExport(
    TwoFactorApi,
    "normalizeTwoFactorPayload",
    "normalizeVerifyTwoFactorPayload"
  ) ||
  ((payload = {}) =>
    payload);

const normalizeRequestTwoFactorPayload =
  getModuleExport(
    TwoFactorApi,
    "normalizeRequestTwoFactorPayload"
  ) ||
  ((payload = {}) =>
    payload);

const buildTwoFactorVerifyBody =
  getModuleExport(
    TwoFactorApi,
    "buildTwoFactorVerifyBody",
    "buildVerifyTwoFactorBody"
  ) ||
  ((payload = {}) =>
    payload);

const buildTwoFactorRequestBody =
  getModuleExport(
    TwoFactorApi,
    "buildTwoFactorRequestBody",
    "buildRequestTwoFactorBody"
  ) ||
  ((payload = {}) =>
    payload);

const buildResendTwoFactorBody =
  getModuleExport(
    TwoFactorApi,
    "buildResendTwoFactorBody"
  ) ||
  ((payload = {}) =>
    payload);

const normalizeTwoFactorResponse =
  getModuleExport(
    TwoFactorApi,
    "normalizeTwoFactorResponse",
    "normalizeVerifyTwoFactorResponse"
  ) ||
  ((response = {}) =>
    response);

const normalizeRequestTwoFactorResponse =
  getModuleExport(
    TwoFactorApi,
    "normalizeRequestTwoFactorResponse"
  ) ||
  ((response = {}) =>
    response);

const normalizeResendTwoFactorResponse =
  getModuleExport(
    TwoFactorApi,
    "normalizeResendTwoFactorResponse"
  ) ||
  ((response = {}) =>
    response);

const isTwoFactorRoute =
  getModuleExport(
    TwoFactorApi,
    "isTwoFactorRoute"
  ) ||
  (() =>
    false);

const getTwoFactorRedirectPath =
  getModuleExport(
    TwoFactorApi,
    "getTwoFactorRedirectPath"
  ) ||
  (() =>
    DEFAULT_2FA_PATH);

async function verifyTwoFactor(payload = {}, options = {}) {
  const executor =
    verifyTwoFactorExecutor ||
    missingHandler("verifyTwoFactor en ./2fa.js");

  return executor(payload, options);
}

async function verify2FA(payload = {}, options = {}) {
  return verifyTwoFactor(payload, options);
}

async function login2fa(payload = {}, options = {}) {
  return verifyTwoFactor(payload, options);
}

async function twoFactorLogin(payload = {}, options = {}) {
  return verifyTwoFactor(payload, options);
}

async function twoFactorVerify(payload = {}, options = {}) {
  return verifyTwoFactor(payload, options);
}

async function verifyMfa(payload = {}, options = {}) {
  return verifyTwoFactor(payload, options);
}

async function mfaLogin(payload = {}, options = {}) {
  return verifyTwoFactor(payload, options);
}

async function submitTwoFactorCode(payload = {}, options = {}) {
  return verifyTwoFactor(payload, options);
}

async function requestTwoFactorCode(payload = {}, options = {}) {
  const executor =
    requestTwoFactorCodeExecutor ||
    missingHandler("requestTwoFactorCode en ./2fa.js");

  return executor(payload, options);
}

async function request2FA(payload = {}, options = {}) {
  return requestTwoFactorCode(payload, options);
}

async function requestMfa(payload = {}, options = {}) {
  return requestTwoFactorCode(payload, options);
}

async function sendTwoFactorCode(payload = {}, options = {}) {
  return requestTwoFactorCode(payload, options);
}

async function resendTwoFactorCode(payload = {}, options = {}) {
  const executor =
    resendTwoFactorCodeExecutor ||
    missingHandler("resendTwoFactorCode en ./2fa.js");

  return executor(payload, options);
}

async function resend2FA(payload = {}, options = {}) {
  return resendTwoFactorCode(payload, options);
}

async function resendMfa(payload = {}, options = {}) {
  return resendTwoFactorCode(payload, options);
}

/* =========================================================
   PASSWORD RESET RESOLUTION
========================================================= */

const requestPasswordResetExecutor =
  getModuleExport(
    PasswordResetApi,
    "requestPasswordReset",
    "forgotPassword",
    "resetPasswordRequest",
    "requestResetPassword",
    "passwordResetRequest",
    "recoverPassword"
  );

const confirmResetPasswordExecutor =
  getModuleExport(
    PasswordResetApi,
    "confirmResetPassword",
    "resetPasswordConfirm",
    "confirmPasswordReset",
    "passwordResetConfirm"
  );

const validateResetPasswordTokenExecutor =
  getModuleExport(
    PasswordResetApi,
    "validateResetPasswordToken",
    "validateResetToken",
    "resetPasswordValidate",
    "validatePasswordReset",
    "passwordResetValidate"
  );

const getRequestPasswordResetEndpoint =
  getModuleExport(
    PasswordResetApi,
    "getRequestPasswordResetEndpoint",
    "getResetPasswordRequestEndpoint"
  ) ||
  (() =>
    AUTH_ENDPOINTS?.forgotPassword ||
    AUTH_ENDPOINTS?.resetPasswordRequest ||
    AUTH_ENDPOINTS?.requestPasswordReset ||
    null);

const getConfirmResetPasswordEndpoint =
  getModuleExport(
    PasswordResetApi,
    "getConfirmResetPasswordEndpoint",
    "getConfirmPasswordResetEndpoint"
  ) ||
  (() =>
    AUTH_ENDPOINTS?.confirmResetPassword ||
    AUTH_ENDPOINTS?.confirmPasswordReset ||
    AUTH_ENDPOINTS?.resetPasswordConfirm ||
    null);

const getValidateResetTokenEndpoint =
  getModuleExport(
    PasswordResetApi,
    "getValidateResetTokenEndpoint",
    "getValidateResetPasswordTokenEndpoint"
  ) ||
  (() =>
    AUTH_ENDPOINTS?.validateResetToken ||
    AUTH_ENDPOINTS?.resetPasswordValidate ||
    null);

const resolveResetPasswordIdentifier =
  getModuleExport(
    PasswordResetApi,
    "resolveResetPasswordIdentifier"
  ) ||
  ((value) =>
    String(value || "").trim());

const resolveResetPasswordToken =
  getModuleExport(
    PasswordResetApi,
    "resolveResetPasswordToken"
  ) ||
  (() => "");

const normalizeResetPasswordPayload =
  getModuleExport(
    PasswordResetApi,
    "normalizeResetPasswordPayload"
  ) ||
  ((payload = {}) =>
    payload);

const normalizeConfirmResetPasswordPayload =
  getModuleExport(
    PasswordResetApi,
    "normalizeConfirmResetPasswordPayload"
  ) ||
  ((payload = {}) =>
    payload);

const normalizeValidateResetTokenPayload =
  getModuleExport(
    PasswordResetApi,
    "normalizeValidateResetTokenPayload",
    "normalizeValidateResetPasswordTokenPayload"
  ) ||
  ((payload = {}) =>
    payload);

const buildResetPasswordRequestBody =
  getModuleExport(
    PasswordResetApi,
    "buildResetPasswordRequestBody"
  ) ||
  ((payload = {}) =>
    payload);

const buildConfirmResetPasswordBody =
  getModuleExport(
    PasswordResetApi,
    "buildConfirmResetPasswordBody"
  ) ||
  ((payload = {}) =>
    payload);

const buildValidateResetTokenBody =
  getModuleExport(
    PasswordResetApi,
    "buildValidateResetTokenBody",
    "buildValidateResetPasswordTokenBody"
  ) ||
  ((payload = {}) =>
    payload);

const normalizeResetPasswordResponse =
  getModuleExport(
    PasswordResetApi,
    "normalizeResetPasswordResponse"
  ) ||
  ((response = {}) =>
    response);

const normalizeConfirmResetPasswordResponse =
  getModuleExport(
    PasswordResetApi,
    "normalizeConfirmResetPasswordResponse"
  ) ||
  ((response = {}) =>
    response);

const normalizeValidateResetTokenResponse =
  getModuleExport(
    PasswordResetApi,
    "normalizeValidateResetTokenResponse",
    "normalizeValidateResetPasswordTokenResponse"
  ) ||
  ((response = {}) =>
    response);

async function requestPasswordResetPublic(payload = {}, options = {}) {
  const executor =
    requestPasswordResetExecutor ||
    missingHandler("requestPasswordReset en ./password-reset.js");

  return executor(payload, options);
}

async function resetPasswordRequestPublic(payload = {}, options = {}) {
  return requestPasswordResetPublic(payload, options);
}

async function requestResetPassword(payload = {}, options = {}) {
  return requestPasswordResetPublic(payload, options);
}

async function passwordResetRequest(payload = {}, options = {}) {
  return requestPasswordResetPublic(payload, options);
}

async function forgotPasswordPublic(payload = {}, options = {}) {
  return requestPasswordResetPublic(payload, options);
}

async function recoverPassword(payload = {}, options = {}) {
  return requestPasswordResetPublic(payload, options);
}

async function confirmResetPassword(payload = {}, options = {}) {
  const executor =
    confirmResetPasswordExecutor ||
    missingHandler("confirmResetPassword en ./password-reset.js");

  return executor(payload, options);
}

async function resetPasswordConfirm(payload = {}, options = {}) {
  return confirmResetPassword(payload, options);
}

async function confirmPasswordReset(payload = {}, options = {}) {
  return confirmResetPassword(payload, options);
}

async function passwordResetConfirm(payload = {}, options = {}) {
  return confirmResetPassword(payload, options);
}

async function validateResetPasswordToken(payload = {}, options = {}) {
  const executor =
    validateResetPasswordTokenExecutor ||
    missingHandler("validateResetPasswordToken en ./password-reset.js");

  return executor(payload, options);
}

async function validateResetToken(payload = {}, options = {}) {
  return validateResetPasswordToken(payload, options);
}

async function resetPasswordValidate(payload = {}, options = {}) {
  return validateResetPasswordToken(payload, options);
}

async function validatePasswordReset(payload = {}, options = {}) {
  return validateResetPasswordToken(payload, options);
}

async function passwordResetValidate(payload = {}, options = {}) {
  return validateResetPasswordToken(payload, options);
}

/* =========================================================
   CORE BRIDGE
========================================================= */

function getRegisteredCoreModule(name = "") {
  const clean =
    safeText(name, "");

  if (!clean) {
    return null;
  }

  try {
    return AppCore?.modules?.get?.(clean) || null;
  } catch {}

  try {
    return AppCore?.registry?.modules?.get?.(clean) || null;
  } catch {}

  return null;
}

function setCoreModuleSilently(name = "", value = null) {
  const clean =
    safeText(name, "");

  if (
    !clean ||
    !value
  ) {
    return false;
  }

  try {
    if (getRegisteredCoreModule(clean) === value) {
      return true;
    }
  } catch {}

  try {
    AppCore?.registry?.modules?.set?.(
      clean,
      value
    );

    return true;
  } catch {}

  try {
    AppCore?.modules?.register?.(
      clean,
      value,
      {
        overwrite:
          true,
        replace:
          true,
        source:
          "features/auth/index.js",
        emit:
          false,
      }
    );

    return true;
  } catch {}

  return false;
}

function attachAuthToCore(api) {
  if (!api) {
    return false;
  }

  try {
    if (AppCore.Auth !== api) {
      AppCore.Auth =
        api;
    }
  } catch {}

  try {
    if (AppCore.auth !== api) {
      AppCore.auth =
        api;
    }
  } catch {}

  setCoreModuleSilently(
    "Auth",
    api
  );

  setCoreModuleSilently(
    "auth",
    api
  );

  try {
    if (isBrowser()) {
      window.Auth =
        api;
      window.OnionAuth =
        api;
    }
  } catch {}

  return true;
}

/* =========================================================
   AUTH SINGLETON
========================================================= */

export const Auth = (() => {
  "use strict";

  const session =
    createInitialSessionState();

  /* =======================================================
     USER GETTERS · CRITICAL FOR SIDEBAR
  ======================================================= */

  function getUser() {
    const state =
      safeObject(AppCore?.state);

    const candidate =
      state.user ||
      state.currentUser ||
      state.sessionUser ||
      state.authUser ||
      state.account ||
      state.profile ||
      state.session?.user ||
      state.session?.usuario ||
      state.session?.me ||
      state.sessionData?.user ||
      state.sessionData?.usuario ||
      state.sessionData?.me ||
      null;

    return normalizeLoginUserForState(candidate || {});
  }

  function getCurrentUser() {
    return getUser();
  }

  function currentUser() {
    return getUser();
  }

  function getProfile() {
    return getUser();
  }

  function getAccount() {
    return getUser();
  }

  function getSessionUser() {
    return getUser();
  }

  function getToken() {
    return getCurrentTokenFromCore() || null;
  }

  function getAccessToken() {
    return getToken();
  }

  function hasValidToken() {
    return hasUsableToken(getToken());
  }

  function getRole() {
    return (
      safeCall(
        getCurrentRole,
        null
      ) ||
      getUser()?.role ||
      getUser()?.rol ||
      null
    );
  }

  function getRoles() {
    const roles =
      safeCall(
        getCurrentRoles,
        []
      );

    return uniqueStrings([
      ...safeArray(roles),
      ...safeArray(getUser()?.roles),
      getRole(),
    ]);
  }

  function getPermissions() {
    const user =
      getUser();

    return uniqueStrings([
      ...safeArray(user?.permissions),
      ...safeArray(user?.permisos),
    ]);
  }

  /* =======================================================
     SERIALIZED WRAPPERS
  ======================================================= */

  async function fetchMePublic(sessionArg = session, options = {}) {
    if (session.mePromise) {
      return session.mePromise;
    }

    const runtimeSession =
      looksLikeRuntimeSession(sessionArg)
        ? sessionArg
        : session;

    const requestOptions =
      looksLikeRuntimeSession(sessionArg)
        ? options
        : safeObject(sessionArg);

    session.mePromise =
      runRuntimeMetric(
        session,
        "me",
        executeFetchMe,
        [
          runtimeSession,
          requestOptions,
        ],
        requestOptions
      )
        .then((result) => {
          session.lastMeResult = {
            ok:
              result?.ok !== false,
            hasUser:
              hasUsableUser(result?.user),
            userId:
              result?.user?.userId ||
              result?.user?.id ||
              null,
            username:
              result?.user?.username ||
              result?.user?.usernameLower ||
              result?.user?.slug ||
              null,
            hasAvatar:
              Boolean(
                result?.user?.avatar ||
                  result?.user?.avatarUrl ||
                  result?.user?.picture
              ),
            at:
              isoNow(),
          };

          return result;
        })
        .finally(() => {
          session.mePromise =
            null;
        });

    return session.mePromise;
  }

  async function refreshSessionPublic(sessionArg = session) {
    if (session.refreshPromise) {
      return session.refreshPromise;
    }

    if (
      session.refreshBlockedUntil &&
      session.refreshBlockedUntil > nowMs()
    ) {
      throw Object.assign(
        new Error(
          "Refresh bloqueado temporalmente por fallos repetidos."
        ),
        {
          name:
            "AuthRefreshBlockedError",
          code:
            "REFRESH_TEMPORARILY_BLOCKED",
          blockedUntil:
            session.refreshBlockedUntil,
        }
      );
    }

    session.refreshPromise =
      runRuntimeMetric(
        session,
        "refresh",
        executeRefreshSession,
        [
          sessionArg || session,
        ],
        safeObject(sessionArg)
      )
        .then(async (result) => {
          const normalized =
            normalizeRefreshResult(result);

          if (!isRefreshResultSuccessful(normalized)) {
            throw Object.assign(
              new Error(
                "No se pudo refrescar la sesión."
              ),
              {
                name:
                  "AuthRefreshError",
                data:
                  normalized,
              }
            );
          }

          if (
            !hasUsableUser(getUser()) &&
            getCurrentTokenFromCore()
          ) {
            try {
              await fetchMePublic(session, {
                forceDirect:
                  true,
              });
            } catch {}
          }

          return normalized;
        })
        .finally(() => {
          session.refreshPromise =
            null;
        });

    return session.refreshPromise;
  }

  async function restoreSessionPublic(...args) {
    if (session.restorePromise) {
      return session.restorePromise;
    }

    const resolved =
      resolveRestoreArgs(
        args,
        session
      );

    const runtimeSession =
      resolved.runtimeSession ||
      session;

    const options =
      normalizeRestoreOptions(
        resolved.options
      );

    session.restorePromise =
      runRuntimeMetric(
        session,
        "restore",
        executeRestoreSession,
        [
          runtimeSession,
          options,
        ],
        options
      )
        .then(async (result) => {
          if (
            getCurrentTokenFromCore() &&
            !hasUsableUser(getUser()) &&
            options.publicRoute !== true
          ) {
            try {
              return await fetchMePublic(session, {
                forceDirect:
                  true,
              });
            } catch {
              return result;
            }
          }

          return result;
        })
        .finally(() => {
          session.restorePromise =
            null;
        });

    return session.restorePromise;
  }

  async function loginPublic(payload = {}, options = {}) {
    if (session.loginPromise) {
      return session.loginPromise;
    }

    const startedAt =
      nowMs();

    session.loggingIn =
      true;

    session.twoFactorPending =
      false;

    emit(
      "auth:login:start",
      {}
    );

    session.loginPromise =
      (async () => {
        try {
          clearAuthState(
            "login_attempt_start",
            {
              silent:
                true,
              emit:
                false,
            }
          );

          const result =
            await Promise.resolve(
              coreLogin(
                payload,
                {
                  ...safeObject(options),

                  emitLoginSuccessEvent:
                    false,
                }
              )
            );

          const normalized =
            normalizeAuthPayload(
              result,
              {
                allowUserOnly:
                  false,
                allowTokenOnly:
                  false,
                useCurrentToken:
                  true,
              }
            );

          session.lastLoginResult = {
            ok:
              normalized.ok,

            authenticated:
              normalized.authenticated,

            requires2FA:
              normalized.requires2FA,

            status:
              normalized.status,

            code:
              normalized.code,

            message:
              normalized.message,

            redirectTo:
              redactTokenInText(
                normalized.redirectTo || ""
              ),

            hasSession:
              Boolean(
                normalized.sessionId ||
                  normalized.sessionData?.sessionId
              ),

            at:
              isoNow(),
          };

          if (normalized.requires2FA) {
            markRuntimeSuccess(
              session,
              "login"
            );

            markTwoFactorPending(
              session,
              normalized
            );

            return {
              ...safeObject(result),

              ok:
                true,

              success:
                true,

              authenticated:
                false,

              requires2FA:
                true,

              tempToken:
                normalized.tempToken || undefined,

              redirectTo:
                normalized.redirectTo ||
                DEFAULT_2FA_PATH,
            };
          }

          if (
            normalized.explicitFailure ||
            normalized.ok === false
          ) {
            clearAuthState(
              "explicit_login_failure",
              {
                silent:
                  true,
                emit:
                  false,
              }
            );

            throw createAuthErrorFromResult(
              normalized,
              "Credenciales incorrectas."
            );
          }

          if (
            !hasUsableToken(normalized.token) ||
            !hasUsableUser(normalized.user)
          ) {
            clearAuthState(
              "invalid_login_payload",
              {
                silent:
                  true,
                emit:
                  false,
              }
            );

            throw createAuthErrorFromResult(
              normalized,
              "Login inválido: el servidor no devolvió una sesión válida."
            );
          }

          const committed =
            applyAcceptedSession(
              normalized,
              {
                source:
                  "Auth.login",
                reason:
                  "auth-login-success",
                eventMode:
                  "login",
                allowTokenOnly:
                  false,
              }
            );

          markRuntimeSuccess(
            session,
            "login"
          );

          session.loginFailCount =
            0;

          session.twoFactorPending =
            false;

          const durationMs =
            nowMs() - startedAt;

          emitAcceptedLoginEvents({
            normalized,
            committed,
            durationMs,
            phase:
              "sync",
          });

          schedulePostLoginRepair({
            normalized,
            committed,
            durationMs,
          });

          return {
            ...safeObject(result),

            ok:
              true,

            success:
              true,

            authenticated:
              true,

            user:
              committed.user,

            role:
              committed.role,

            roles:
              committed.roles || [],

            refreshToken:
              normalized.refreshToken ||
              result?.refreshToken ||
              "",

            session:
              committed.session ||
              normalized.session ||
              null,

            sessionData:
              committed.sessionData ||
              committed.session ||
              normalized.sessionData ||
              null,

            sessionId:
              committed.sessionId ||
              normalized.sessionId ||
              null,

            redirectTo:
              normalized.redirectTo ||
              result?.redirectTo ||
              undefined,

            navigation:
              result?.navigation || null,
          };
        } catch (error) {
          markRuntimeError(
            session,
            "login",
            error
          );

          clearAuthState(
            "login_error",
            {
              silent:
                true,
              emit:
                false,
            }
          );

          emit(
            "auth:runtime:login:error",
            {
              durationMs:
                nowMs() - startedAt,
              error:
                session.lastError,
            },
            options
          );

          throw error;
        } finally {
          session.loggingIn =
            false;

          session.loginPromise =
            null;
        }
      })();

    return session.loginPromise;
  }

  async function handleLoginFormSubmitPublic(formElement, options = {}) {
    try {
      options?.event?.preventDefault?.();
    } catch {}

    const credentials =
      readLoginCredentialsFromForm(formElement);

    const result =
      await loginPublic(
        credentials,
        options
      );

    if (
      options?.resetOnSuccess === true &&
      result?.authenticated === true
    ) {
      try {
        formElement.reset();
      } catch {}
    }

    return result;
  }

  function clearSessionPublic(options = {}) {
    return clearAuthState(
      options?.reason ||
        "manual_clear",
      {
        ...safeObject(options),
        emit:
          options?.emit === true,
      }
    );
  }

  function getAuthRouteState() {
    const publicPath =
      getBrowserPublicPathSafe();

    return {
      publicPath:
        redactTokenInText(publicPath),

      canonicalPath:
        safeNormalizeCanonicalPath(publicPath),

      isAuthRoute:
        safeCall(
          helperIsAuthRoute,
          false,
          publicPath
        ),

      isPublicTechnicalRoute:
        isPublicTechnicalRoute(publicPath),

      isActivationRoute:
        isActivationRoute(publicPath),

      isResetConfirmRoute:
        isResetConfirmRoute(publicPath),

      hasActivationToken:
        hasActivationToken(publicPath),

      hasResetConfirmToken:
        hasResetConfirmToken(publicPath),
    };
  }

  function getAuthModuleSnapshot() {
    const routeContext =
      getCurrentRouteContext();

    const safeSessionDebug =
      safeCall(
        getSessionDebugSnapshot,
        null
      );

    if (safeSessionDebug) {
      safeSessionDebug.token =
        null;

      safeSessionDebug.accessToken =
        null;

      safeSessionDebug.refreshToken =
        null;
    }

    const safeLoginDebug =
      safeCall(
        getLoginSnapshot,
        null
      );

    if (safeLoginDebug) {
      safeLoginDebug.token =
        null;

      safeLoginDebug.accessToken =
        null;

      safeLoginDebug.refreshToken =
        null;
    }

    const currentUserValue =
      getUser();

    return {
      version:
        AUTH_MODULE_VERSION,

      backend:
        {
          origin:
            BACKEND_ORIGIN,

          apiBase:
            resolveApiBase(),

          me:
            resolveAuthEndpoint(
              "me",
              "/api/auth/me"
            ),
        },

      endpoints:
        AUTH_ENDPOINTS,

      storageKeys:
        AUTH_STORAGE_KEYS,

      constants:
        AUTH_CONSTANTS,

      session:
        cloneRuntimeSessionState(session),

      authenticated:
        Boolean(
          safeCall(
            isAuthenticated,
            false
          )
        ),

      hasToken:
        hasValidToken(),

      hasUser:
        hasUsableUser(currentUserValue),

      user:
        currentUserValue
          ? {
              id:
                currentUserValue.id ||
                currentUserValue.userId ||
                null,

              userId:
                currentUserValue.userId ||
                currentUserValue.id ||
                null,

              username:
                currentUserValue.username ||
                currentUserValue.usernameLower ||
                currentUserValue.slug ||
                null,

              displayName:
                currentUserValue.displayName ||
                currentUserValue.name ||
                null,

              role:
                currentUserValue.role ||
                currentUserValue.rol ||
                null,

              hasAvatar:
                Boolean(
                  currentUserValue.avatar ||
                    currentUserValue.avatarUrl ||
                    currentUserValue.picture
                ),

              avatarUrl:
                currentUserValue.avatarUrl
                  ? redactTokenInText(currentUserValue.avatarUrl)
                  : null,
            }
          : null,

      role:
        getRole(),

      roles:
        getRoles(),

      permissions:
        getPermissions(),

      isAdmin:
        Boolean(
          safeCall(
            isCurrentUserAdmin,
            false
          )
        ),

      isSupport:
        Boolean(
          safeCall(
            isCurrentUserSupport,
            false
          )
        ),

      isManager:
        Boolean(
          safeCall(
            isCurrentUserManager,
            false
          )
        ),

      isClient:
        Boolean(
          safeCall(
            isCurrentUserClient,
            false
          )
        ),

      route:
        getAuthRouteState(),

      routeContext:
        sanitizeRouteContext(routeContext),

      sessionDebug:
        safeSessionDebug,

      loginDebug:
        safeLoginDebug,

      restoreDebug:
        safeCall(
          getRestoreSnapshot,
          null,
          session
        ),

      guardsDebug:
        safeCall(
          getAuthGuardsSnapshot,
          null
        ),

      storage: {
        hasRefreshToken:
          hasRefreshToken(),

        hasRefreshContext:
          hasRefreshContext(),

        hasTempToken:
          Boolean(
            getStoredTempToken()
          ),

        hasSessionId:
          Boolean(
            getStoredSessionId()
          ),

        hasSessionUserId:
          Boolean(
            getStoredSessionUserId()
          ),

        refreshToken:
          null,

        tempToken:
          null,

        sessionId:
          getStoredSessionId()
            ? "***"
            : null,

        sessionUserId:
          getStoredSessionUserId()
            ? "***"
            : null,
      },
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
    version:
      AUTH_MODULE_VERSION,

    AUTH_ENDPOINTS,
    AUTH_STORAGE_KEYS,
    AUTH_CONSTANTS,

    session,

    /* USER CRITICAL API */
    getUser,
    getCurrentUser,
    currentUser,
    getProfile,
    getAccount,
    getSessionUser,

    getToken,
    getAccessToken,
    hasValidToken,

    getRole,
    getRoles,
    getPermissions,

    /* AUTH ACTIONS */
    login:
      loginPublic,

    logout,

    handleLoginFormSubmit:
      handleLoginFormSubmitPublic,

    /* ACTIVATION */
    activateAccount,
    activate,
    activation,
    confirmActivation,
    accountActivation,
    createUserActivation,

    activateFirstUser,
    firstUserActivation,
    activateInitialUser,

    validateActivationToken,
    validateActivateAccountToken,
    activationValidate,

    getActivateAccountEndpoint,
    getActivateFirstUserEndpoint,
    getValidateActivationTokenEndpoint,

    resolveActivationToken,
    normalizeActivationPayload,
    normalizeFirstUserActivationPayload,

    buildActivationRequestBody,
    buildActivateFirstUserBody,

    normalizeActivationResponse,
    normalizeFirstUserActivationResponse,

    /* 2FA / MFA */
    verifyTwoFactor,
    verify2FA,
    login2fa,
    twoFactorLogin,
    twoFactorVerify,
    verifyMfa,
    mfaLogin,
    submitTwoFactorCode,

    requestTwoFactorCode,
    request2FA,
    requestMfa,
    sendTwoFactorCode,

    resendTwoFactorCode,
    resend2FA,
    resendMfa,

    getTwoFactorLoginEndpoint,
    getTwoFactorRequestEndpoint,
    getTwoFactorResendEndpoint,

    resolveTwoFactorTempToken,

    normalizeTwoFactorPayload,
    normalizeRequestTwoFactorPayload,

    buildTwoFactorVerifyBody,
    buildTwoFactorRequestBody,
    buildResendTwoFactorBody,

    normalizeTwoFactorResponse,
    normalizeRequestTwoFactorResponse,
    normalizeResendTwoFactorResponse,

    isTwoFactorRoute,
    getTwoFactorRedirectPath,

    /* PASSWORD RESET */
    requestPasswordReset:
      requestPasswordResetPublic,

    resetPasswordRequest:
      resetPasswordRequestPublic,

    requestResetPassword,
    passwordResetRequest,

    forgotPassword:
      forgotPasswordPublic,

    recoverPassword,

    confirmResetPassword,
    resetPasswordConfirm,
    confirmPasswordReset,
    passwordResetConfirm,

    validateResetPasswordToken,
    validateResetToken,
    resetPasswordValidate,
    validatePasswordReset,
    passwordResetValidate,

    getRequestPasswordResetEndpoint,
    getConfirmResetPasswordEndpoint,
    getValidateResetTokenEndpoint,

    resolveResetPasswordIdentifier,
    resolveResetPasswordToken,

    normalizeResetPasswordPayload,
    normalizeConfirmResetPasswordPayload,
    normalizeValidateResetTokenPayload,

    buildResetPasswordRequestBody,
    buildConfirmResetPasswordBody,
    buildValidateResetTokenBody,

    normalizeResetPasswordResponse,
    normalizeConfirmResetPasswordResponse,
    normalizeValidateResetTokenResponse,

    /* SESSION */
    fetchMe:
      fetchMePublic,

    me:
      fetchMePublic,

    loadMe:
      fetchMePublic,

    refreshSession:
      refreshSessionPublic,

    refresh:
      refreshSessionPublic,

    refreshToken:
      refreshSessionPublic,

    restoreSession:
      restoreSessionPublic,

    restore:
      restoreSessionPublic,

    /* STATE */
    isAuthenticated,
    syncAuthState,

    isAuthRoute:
      helperIsAuthRoute,

    /* ROLES */
    hasRole,
    requireRole,

    guardAuthenticated,
    guardRole,
    guardGuest,
    guardAdmin,
    guardSupport,
    guardManager,
    canAccessRoute,

    getCurrentRole,
    getCurrentRoles,

    isCurrentUserAdmin,
    isCurrentUserSupport,
    isCurrentUserManager,
    isCurrentUserClient,

    buildGuardErrorPayload,

    /* SESSION HELPERS */
    getAuthHeader,

    clearSessionLocal,

    clearSession:
      clearSessionPublic,

    applySession:
      (payload = {}, options = {}) => {
        const normalized =
          normalizeAuthPayload(
            payload,
            {
              allowUserOnly:
                true,
              allowTokenOnly:
                options.allowTokenOnly !== false,
              useCurrentToken:
                true,
            }
          );

        return applyAcceptedSession(
          normalized,
          {
            source:
              options.source || "Auth.applySession",
            reason:
              options.reason || "auth-apply-session",
            eventMode:
              options.eventMode || "manual",
            emitRepair:
              options.emitRepair !== false,
            preserveExistingUser:
              options.preserveExistingUser === true ||
              normalized.tokenOnly === true,
            allowTokenOnly:
              options.allowTokenOnly !== false,
          }
        );
      },

    buildSessionSnapshot,
    getSessionDebugSnapshot,

    /* NORMALIZE */
    normalizeUser,

    normalizeAuthPayload,

    /* LOGIN HELPERS */
    resolveLoginIdentifier,
    normalizeLoginPayload,
    buildLoginRequestBody,
    buildLoginRedirectPath,
    getPostLoginTarget,

    /* STORAGE */
    hasRefreshToken,
    hasRefreshContext,

    getStoredRefreshToken,
    getStoredTempToken,
    getStoredSessionId,
    getStoredSessionUserId,

    /* TECHNICAL ROUTES */
    getCurrentRouteContext,

    isPublicTechnicalRoute,
    isActivationRoute,
    isResetConfirmRoute,

    hasActivationToken,
    hasResetConfirmToken,

    /* PATHS */
    getCurrentPublicPath,
    getCurrentCanonicalPath,

    normalizePublicPath:
      safeNormalizePublicPath,

    normalizeCanonicalPath:
      safeNormalizeCanonicalPath,

    sanitizeRedirectPath,

    /* API */
    authApiRequest,
    fetchMeDirect,

    /* DEBUG */
    getAuthModuleSnapshot,

    getSnapshot:
      getAuthModuleSnapshot,

    getDebugSnapshot:
      getAuthModuleSnapshot,
  };

  attachAuthToCore(api);

  try {
    return Object.freeze(api);
  } catch {
    return api;
  }
})();

export default Auth;
