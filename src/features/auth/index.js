/* =========================================================
   Onion SPA - Auth / Session
   Archivo: src/features/auth/index.js

   AUTH FACADE · SESSION ORCHESTRATOR · GOD MODE v12
   ENTERPRISE HARDENED · NO DUPLICATE CANONICAL EVENTS

   RESPONSABILIDADES:
   - punto de entrada público del módulo auth
   - composición de login / logout / restore / refresh / me / guards
   - exponer helpers auth para toda la SPA
   - serializar restore / refresh / me / login
   - mantener compatibilidad con backend heterogéneo
   - exponer aliases públicos estables para auth flows
   - integrar forgot-password / reset-password request
   - integrar confirmación de reset-password
   - preservar rutas públicas técnicas durante restore/clear
   - no romper /activate-account?token=...
   - no romper /activate-account/<token>
   - no romper /reset-password/confirm?token=...
   - no romper /reset-password/confirm/<token>
   - alinear login con sessionId/userId/refreshToken/sessionData
   - evitar duplicidades raras entre session y sessionData
   - emitir auth:login:success una sola vez desde esta fachada
   - no reemitir auth:session:applied / app:user:change si coreLogin ya aplicó sesión
   - no emitir eventos restore desde login
   - eventos públicos sin tokens reales
   - snapshot debug enterprise sin secretos

   CONTRATO LOGIN ACTUAL:
   - coreLogin() aplica sesión internamente
   - coreLogin() puede emitir:
       · auth:login:session-committed
       · auth:session:applied
       · app:user:change
       · app:auth:ready
   - Auth facade emite sólo:
       · auth:login:success
       · app:ui:repair-request
       · app:ui:repair
   - Auth facade NO duplica:
       · auth:session:applied
       · app:user:change
       · app:auth:ready
       · auth:login:error
       · auth:login:2fa-required

   HARDENING EXTREMO:
   - singleton público congelado
   - runtime session mutable pero encapsulado
   - wrappers robustos sin duplicar eventos canónicos restore/refresh/me
   - login público con validación final token + user
   - login no acepta ok:false / success:false / status >= 400
   - login no permite sesión válida sin token + usuario usable
   - login limpia sesión antigua si backend responde error
   - login corta fugas de avatar/dashboard cacheado tras fallo
   - login preserva flujo 2FA sin marcar authenticated
   - login fuerza sync final silencioso sobre AppCore tras éxito
   - afterPaint sólo repara UI
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

import * as PasswordResetApi from "./password-reset.js";

import {
  fetchMe,
  refreshSession,
  restoreSession as restoreSessionCore,
  getRestoreSnapshot,
} from "./restore.js";

import {
  logout,
} from "./logout.js";

import {
  guardAuthenticated,
  guardRole,
} from "./guards.js";

/* =========================================================
   VERSION
========================================================= */

const AUTH_MODULE_VERSION =
  "12.0.0";

/* =========================================================
   CONSTANTS / FALLBACKS
========================================================= */

const AUTH_SOURCE =
  "Auth";

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
    "require2FA",
    "requiresTwoFactor",
    "twoFactorRequired",
    "mfaRequired",
    "requiresMfa",
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
    String(value).trim();

  return text || fallback;
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
    safeText(value, "")
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "si",
      "sí",
      "ok",
      "on",
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
  ]) {
    if (key in output) {
      output[key] =
        null;
    }
  }

  if (output.user) {
    output.user =
      sanitizePublicUser(
        output.user
      );
  }

  for (const key of [
    "path",
    "publicPath",
    "redirectTo",
    "url",
    "currentPath",
    "currentCanonicalPath",
  ]) {
    if (output[key]) {
      output[key] =
        redactTokenInText(output[key]);
    }
  }

  if (output.routeContext) {
    output.routeContext =
      sanitizeRouteContext(
        output.routeContext
      );
  }

  if (output.raw) {
    output.raw =
      undefined;
  }

  return output;
}

function emit(eventName, payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload =
    sanitizeEventPayload(payload);

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
   RESTORE ARG RESOLUTION
========================================================= */

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
    guard < 100
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

  if (
    value === "null" ||
    value === "undefined" ||
    value === "false" ||
    value === "[object Object]"
  ) {
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

function hasUsableUser(user = {}) {
  if (!isPlainObject(user)) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.user_name, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "") ||
      safeText(user.mobile, "")
  );
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
      return normalized;
    }
  } catch {}

  return hasUsableUser(clean)
    ? clean
    : null;
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

function isExplicitLoginFailureFromObjects(objects = []) {
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
    object?.success === false
  );
}

function normalizePublicLoginResult(result = {}) {
  const raw =
    safeObject(result);

  const objects =
    collectAuthObjects(raw);

  const token =
    pickTextFromObjects(
      objects,
      TOKEN_KEYS
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
    );

  const user =
    normalizeLoginUserForState(
      userRaw ||
        raw.user ||
        raw.usuario ||
        {}
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
    safeText(
      statusValue,
      ""
    ).toLowerCase();

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
    isExplicitLoginFailureFromObjects(objects);

  const authenticated =
    !explicitFailure &&
    !requires2FA &&
    hasUsableToken(token) &&
    hasUsableUser(user);

  return {
    raw:
      result,

    ok:
      explicitFailure
        ? false
        : authenticated || requires2FA,

    success:
      explicitFailure
        ? false
        : authenticated || requires2FA,

    explicitFailure,
    authenticated,

    token:
      safeText(token, ""),

    accessToken:
      safeText(token, ""),

    refreshToken:
      safeText(refreshToken, ""),

    user:
      hasUsableUser(user)
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

function createLoginErrorFromResult(
  normalized = {},
  fallbackMessage = "No se pudo iniciar sesión."
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
    "AuthLoginError";

  const statusAsNumber =
    Number(normalized.status);

  error.status =
    Number.isFinite(statusAsNumber) &&
    statusAsNumber >= 400
      ? statusAsNumber
      : 401;

  error.code =
    normalized.code ||
    "INVALID_LOGIN_SESSION";

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
   PASSWORD RESET RESOLUTION
========================================================= */

function getPasswordResetExport(...names) {
  for (const name of names) {
    const direct =
      PasswordResetApi?.[name];

    if (typeof direct === "function") {
      return direct;
    }

    const fromDefault =
      PasswordResetApi?.default?.[name];

    if (typeof fromDefault === "function") {
      return fromDefault;
    }
  }

  return null;
}

function missingPasswordResetHandler(name = "password-reset") {
  return async function missingPasswordResetHandlerExecutor() {
    throw new Error(
      `Auth: falta implementar ${name} en ./password-reset.js`
    );
  };
}

const requestPasswordResetExecutor =
  getPasswordResetExport(
    "requestPasswordReset",
    "forgotPassword",
    "resetPasswordRequest"
  );

const confirmResetPasswordExecutor =
  getPasswordResetExport(
    "confirmResetPassword",
    "resetPasswordConfirm",
    "confirmPasswordReset"
  );

const getRequestPasswordResetEndpoint =
  getPasswordResetExport(
    "getRequestPasswordResetEndpoint"
  ) ||
  (() =>
    AUTH_ENDPOINTS?.forgotPassword ||
    AUTH_ENDPOINTS?.resetPasswordRequest ||
    AUTH_ENDPOINTS?.requestPasswordReset ||
    null);

const resolveResetPasswordIdentifier =
  getPasswordResetExport(
    "resolveResetPasswordIdentifier"
  ) ||
  ((value) =>
    String(value || "").trim());

const normalizeResetPasswordPayload =
  getPasswordResetExport(
    "normalizeResetPasswordPayload"
  ) ||
  ((payload = {}) =>
    payload);

const buildResetPasswordRequestBody =
  getPasswordResetExport(
    "buildResetPasswordRequestBody"
  ) ||
  ((payload = {}) =>
    payload);

const normalizeResetPasswordResponse =
  getPasswordResetExport(
    "normalizeResetPasswordResponse"
  ) ||
  ((response = {}) =>
    response);

async function requestPasswordResetPublic(payload = {}, options = {}) {
  const executor =
    requestPasswordResetExecutor ||
    missingPasswordResetHandler("requestPasswordReset");

  return executor(
    payload,
    options
  );
}

const resetPasswordRequestPublic =
  requestPasswordResetPublic;

const forgotPasswordPublic =
  requestPasswordResetPublic;

async function confirmResetPassword(payload = {}, options = {}) {
  const executor =
    confirmResetPasswordExecutor ||
    missingPasswordResetHandler("confirmResetPassword");

  return executor(
    payload,
    options
  );
}

const resetPasswordConfirm =
  confirmResetPassword;

/* =========================================================
   INTERNAL SESSION STATE
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
  };
}

/* =========================================================
   LOGIN COMMIT / CLEAR
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

function applyAcceptedLoginSession(normalized = {}) {
  const raw =
    safeObject(normalized.raw);

  const user =
    normalizeLoginUserForState(
      normalized.user || {}
    );

  const token =
    safeText(
      normalized.token ||
        normalized.accessToken,
      ""
    );

  const refreshToken =
    safeText(
      normalized.refreshToken,
      ""
    );

  const role =
    extractRoleFromUser(user);

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

  const sessionPayload = {
    ...raw,

    ok:
      true,

    success:
      true,

    authenticated:
      true,

    token,
    accessToken:
      token,
    access_token:
      token,

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
      false,

    /*
      Silencioso:
      - refuerza estado/caches
      - NO reemite eventos canónicos
      - evita duplicidades con coreLogin()
    */
    silent:
      true,

    eventMode:
      "login",

    source:
      "Auth.login",
  };

  let snapshot =
    null;

  try {
    if (isFunction(applySession)) {
      snapshot =
        applySession(sessionPayload);
    }
  } catch (error) {
    safeWarn(
      "applySession no pudo reforzar sesión post-login.",
      error
    );
  }

  const finalSnapshot =
    snapshot ||
    buildSessionSnapshot({
      source:
        "Auth.login",
      eventMode:
        "login",
    });

  const finalRole =
    finalSnapshot?.role ||
    role ||
    user?.role ||
    user?.rol ||
    "";

  const finalRoles =
    Array.isArray(finalSnapshot?.roles)
      ? finalSnapshot.roles
      : Array.isArray(user?.roles)
        ? user.roles
        : [];

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  return {
    user,
    role:
      finalRole,

    roles:
      finalRoles,

    token,
    refreshToken:
      sessionPayload.refreshToken || null,

    session:
      finalSnapshot?.session ||
      sessionData ||
      null,

    sessionData:
      finalSnapshot?.sessionData ||
      finalSnapshot?.session ||
      sessionData ||
      null,

    sessionId:
      finalSnapshot?.sessionId ||
      finalSnapshot?.session?.sessionId ||
      sessionData?.sessionId ||
      normalized.sessionId ||
      null,

    sessionUserId:
      finalSnapshot?.sessionUserId ||
      finalSnapshot?.session?.sessionUserId ||
      finalSnapshot?.session?.userId ||
      sessionData?.sessionUserId ||
      sessionData?.userId ||
      normalized.sessionUserId ||
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
    });
  } catch {}

  try {
    AppCore?.session?.clear?.();
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

    role:
      "",

    userRole:
      "",

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

    twoFactorPending:
      false,

    tempToken:
      null,
  };

  try {
    AppCore?.setState?.(
      patch,
      {
        forceUnauthenticated:
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
      AppCore?.setState?.({
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
      });
    } catch {}
  }

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  if (opts.emit === true) {
    emit(
      "auth:session:cleared-by-auth",
      {
        reason,
        source:
          AUTH_SOURCE,
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
        source:
          AUTH_SOURCE,
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
    AppCore?.setState?.({
      authenticated:
        false,

      hasToken:
        false,

      token:
        null,

      accessToken:
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
        "",

      userRole:
        "",

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
    });
  } catch {}

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  /*
    No emitimos auth:login:2fa-required aquí.
    coreLogin ya lo emite. Evitamos duplicidad canónica.
  */
  emit(
    "app:ui:repair-request",
    {
      reason:
        "auth-login-2fa-required",
      authenticated:
        false,
      source:
        AUTH_SOURCE,
    }
  );
}

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

    source:
      AUTH_SOURCE,

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

  /*
    Evento público único de éxito de login.
    No duplicamos:
    - auth:session:applied
    - app:user:change
    - app:auth:ready
  */
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

    /*
      Reparación visual únicamente.
      No reemitir auth:login:success.
      No reemitir eventos de sesión.
    */
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
   RUNTIME METRICS
========================================================= */

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
  }

  if (type === "restore") {
    sessionState.lastRestoreAt =
      current;
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

async function runRuntimeMetric(sessionState, type, executor, args = []) {
  const startedAt =
    nowMs();

  setRuntimeFlag(
    sessionState,
    type,
    true
  );

  /*
    Namespace runtime para no duplicar eventos canónicos de restore.js.
  */
  emit(
    `auth:runtime:${type}:start`,
    {
      source:
        AUTH_SOURCE,
    }
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

        source:
          AUTH_SOURCE,
      }
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

        source:
          AUTH_SOURCE,
      }
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
   CORE EXECUTORS
========================================================= */

async function executeFetchMe(runtimeSession) {
  if (!isFunction(fetchMe)) {
    return {
      ok:
        false,
      user:
        null,
    };
  }

  return fetchMe(runtimeSession);
}

async function executeRefreshSession(runtimeSession) {
  if (!isFunction(refreshSession)) {
    return {
      ok:
        false,
    };
  }

  return refreshSession(runtimeSession);
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

  return restoreSessionCore(
    runtimeSession,
    options
  );
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
   CORE BRIDGE
========================================================= */

function attachAuthToCore(api) {
  try {
    AppCore.Auth =
      api;
  } catch {}

  try {
    AppCore.auth =
      api;
  } catch {}

  try {
    AppCore?.modules?.register?.(
      "Auth",
      api,
      {
        overwrite:
          true,
        replace:
          true,
        aliases:
          [
            "auth",
          ],
        source:
          "features/auth/index.js",
      }
    );
  } catch {}

  try {
    AppCore?.modules?.register?.(
      "auth",
      api,
      {
        overwrite:
          true,
        replace:
          true,
        aliases:
          [
            "Auth",
          ],
        source:
          "features/auth/index.js",
      }
    );
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
     SERIALIZED WRAPPERS
  ======================================================= */

  async function fetchMePublic(sessionArg = session) {
    if (session.mePromise) {
      return session.mePromise;
    }

    session.mePromise =
      runRuntimeMetric(
        session,
        "me",
        executeFetchMe,
        [
          sessionArg || session,
        ]
      ).finally(() => {
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
        ]
      )
        .then((result) => {
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
        ]
      ).finally(() => {
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
      {
        source:
          AUTH_SOURCE,
      }
    );

    session.loginPromise =
      (async () => {
        try {
          /*
            Limpieza silenciosa previa:
            evita usuario/avatar/dashboard cacheado, sin emitir rejected.
          */
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

                  /*
                    Evento público auth:login:success:
                    sólo lo emite esta fachada.
                  */
                  emitLoginSuccessEvent:
                    false,
                }
              )
            );

          const normalized =
            normalizePublicLoginResult(result);

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

            throw createLoginErrorFromResult(
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

            throw createLoginErrorFromResult(
              normalized,
              "Login inválido: el servidor no devolvió una sesión válida."
            );
          }

          const committed =
            applyAcceptedLoginSession(normalized);

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

          /*
            No emitimos auth:login:error aquí.
            coreLogin ya emite auth:login:error.
            Evitamos duplicidad canónica.
          */
          emit(
            "auth:runtime:login:error",
            {
              durationMs:
                nowMs() - startedAt,
              error:
                session.lastError,
              source:
                AUTH_SOURCE,
            }
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

    return {
      version:
        AUTH_MODULE_VERSION,

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

      role:
        safeCall(
          getCurrentRole,
          null
        ),

      roles:
        safeCall(
          getCurrentRoles,
          []
        ),

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

      passwordReset: {
        hasRequestPasswordReset:
          isFunction(requestPasswordResetExecutor),

        hasConfirmResetPassword:
          isFunction(confirmResetPasswordExecutor),
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

    /* AUTH ACTIONS */
    login:
      loginPublic,

    logout,

    handleLoginFormSubmit:
      handleLoginFormSubmitPublic,

    /* PASSWORD RESET */
    requestPasswordReset:
      requestPasswordResetPublic,

    resetPasswordRequest:
      resetPasswordRequestPublic,

    forgotPassword:
      forgotPasswordPublic,

    confirmResetPassword,
    resetPasswordConfirm,

    getRequestPasswordResetEndpoint,
    resolveResetPasswordIdentifier,
    normalizeResetPasswordPayload,
    buildResetPasswordRequestBody,
    normalizeResetPasswordResponse,

    /* SESSION */
    fetchMe:
      fetchMePublic,

    refreshSession:
      refreshSessionPublic,

    restoreSession:
      restoreSessionPublic,

    /* STATE */
    isAuthenticated,

    isAuthRoute:
      helperIsAuthRoute,

    /* ROLES */
    hasRole,
    requireRole,
    guardAuthenticated,
    guardRole,

    getCurrentRole,
    getCurrentRoles,

    isCurrentUserAdmin,
    isCurrentUserSupport,
    isCurrentUserManager,
    isCurrentUserClient,

    /* SESSION HELPERS */
    getAuthHeader,

    clearSessionLocal,

    clearSession:
      clearSessionPublic,

    applySession,
    buildSessionSnapshot,
    getSessionDebugSnapshot,

    /* NORMALIZE */
    normalizeUser,

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
