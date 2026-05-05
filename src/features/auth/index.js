/* =========================================================
   Onion SPA - Auth / Session
   Archivo: src/features/auth/index.js

   AUTH FACADE · SESSION ORCHESTRATOR · ENTERPRISE HARDENED
   FINAL EXTREME SYSTEM · 10/10

   RESPONSABILIDADES:
   - punto de entrada público del módulo auth
   - composición de login / logout / restore / refresh / me / guards
   - exponer helpers auth para toda la SPA
   - serializar restore / refresh / me / login
   - mantener compatibilidad con backend heterogéneo
   - exponer aliases públicos estables para auth flows
   - integrar forgot-password / reset-password request
   - integrar confirmación de reset-password
   - preservar rutas públicas técnicas durante restore
   - no romper /activate-account?token=...
   - no romper /activate-account/<token>
   - no romper /reset-password/confirm?token=...
   - no romper /reset-password/confirm/<token>

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
   - login fuerza commit final sobre AppCore tras éxito
   - login emite auth:login:success una sola vez desde esta fachada
   - login NO emite eventos de restore
   - afterPaint sólo repara UI, no duplica auth:login:success
   - eventos públicos sin tokens reales
   - snapshot debug enterprise sin secretos
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
  "10.3.0";

/* =========================================================
   CONSTANTS / FALLBACKS
========================================================= */

const DEFAULT_2FA_PATH =
  "/2fa";

const ACTIVATION_PATH =
  "/activate-account";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const PUBLIC_TECHNICAL_ROUTE_SET =
  new Set(
    [
      ...(Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES)
        ? AUTH_PUBLIC_TECHNICAL_ROUTES
        : []),

      ACTIVATION_PATH,
      "/reset-password",
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
          "UNAUTHORIZED",
          "FORBIDDEN",
          "TOKEN_INVALID",
          "INVALID_TOKEN",
          "TOKEN_EXPIRED",
          "SESSION_EXPIRED",
          "INVALID_LOGIN_SESSION",
          "LOGIN_FAILED",
          "AUTH_FAILED",
          "BAD_CREDENTIALS",
          "CREDENTIALS_INVALID",
        ]
  );

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

const requestPasswordReset =
  getPasswordResetExport(
    "requestPasswordReset",
    "forgotPassword",
    "resetPasswordRequest"
  );

const resetPasswordRequest =
  getPasswordResetExport(
    "resetPasswordRequest",
    "requestPasswordReset",
    "forgotPassword"
  ) || requestPasswordReset;

const forgotPassword =
  getPasswordResetExport(
    "forgotPassword",
    "requestPasswordReset",
    "resetPasswordRequest"
  ) || requestPasswordReset;

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
  ((payload = {}) => payload);

const buildResetPasswordRequestBody =
  getPasswordResetExport(
    "buildResetPasswordRequestBody"
  ) ||
  ((payload = {}) => payload);

const normalizeResetPasswordResponse =
  getPasswordResetExport(
    "normalizeResetPasswordResponse"
  ) ||
  ((response = {}) => response);

function resolveConfirmResetPasswordHandler() {
  return getPasswordResetExport(
    "confirmResetPassword",
    "resetPasswordConfirm",
    "confirmPasswordReset"
  );
}

async function confirmResetPassword(payload = {}) {
  const executor =
    resolveConfirmResetPasswordHandler();

  if (typeof executor !== "function") {
    throw new Error(
      "Auth: falta implementar confirmResetPassword en ./password-reset.js"
    );
  }

  return executor(payload);
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
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function nowMs() {
  return Date.now();
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

function safeObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : {};
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

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text =
    safeText(value, "").toLowerCase();

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

function pickFirstObject(...values) {
  for (const value of values) {
    if (isPlainObject(value)) {
      return value;
    }
  }

  return null;
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

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(
      "[Auth]",
      ...args
    );
  } catch {}

  try {
    console.error(
      "[Auth]",
      ...args
    );
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
    output = output.replace(
      /([?&](?:token|activationToken|activateToken|resetToken|passwordResetToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
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

  return {
    ...user,

    password:
      undefined,

    token:
      undefined,

    accessToken:
      undefined,

    access_token:
      undefined,

    refreshToken:
      undefined,

    refresh_token:
      undefined,

    tempToken:
      undefined,

    temp_token:
      undefined,
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
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
  ]) {
    if (key in output) {
      output[key] = null;
    }
  }

  if (output.user) {
    output.user =
      sanitizePublicUser(output.user);
  }

  if (output.path) {
    output.path =
      redactTokenInText(output.path);
  }

  if (output.publicPath) {
    output.publicPath =
      redactTokenInText(output.publicPath);
  }

  if (output.redirectTo) {
    output.redirectTo =
      redactTokenInText(output.redirectTo);
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

function safeNormalizePublicPath(value = "/") {
  try {
    if (typeof normalizePublicPath === "function") {
      return normalizePublicPath(value);
    }
  } catch {}

  const raw =
    safeText(value, "/") || "/";

  if (!raw.startsWith("/")) {
    return `/${raw}`;
  }

  return raw;
}

function safeNormalizeCanonicalPath(value = "/") {
  try {
    if (typeof normalizeCanonicalPath === "function") {
      return normalizeCanonicalPath(value);
    }
  } catch {}

  const publicPath =
    safeNormalizePublicPath(value);

  return (
    publicPath.split("?")[0].split("#")[0] ||
    "/"
  );
}

function getBrowserPublicPathSafe() {
  try {
    return getCurrentPublicPath?.() || "/";
  } catch {}

  if (!isBrowser()) {
    return AppCore?.state?.publicPath || AppCore?.state?.route || "/";
  }

  try {
    return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return "/";
  }
}

function getCanonicalPublicPath(value = "/") {
  return safeNormalizeCanonicalPath(
    safePathFromUrlLike(value) || value || "/"
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
      window.__ONION_RESET_CONFIRM_INITIAL_URL__,
      ""
    );
  } catch {
    return "";
  }
}

function isHistoryStateFlagEnabled(flag = "") {
  if (!isBrowser() || !flag) {
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
  return isHistoryStateFlagEnabled(
    "scrubbedActivationToken"
  );
}

function isResetTokenScrubbed() {
  return isHistoryStateFlagEnabled(
    "scrubbedResetToken"
  );
}

function routeStartsWith(path = "/", candidate = "/") {
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

  return Array.from(PUBLIC_TECHNICAL_ROUTE_SET).some((candidate) =>
    routeStartsWith(path, candidate)
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
      : ["token", "code", "t"];

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

  if (!raw || !routePath) {
    return false;
  }

  const path =
    safePathFromUrlLike(raw) || raw;

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
        isBrowser() ? window.location.origin : "http://localhost"
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
      safeText(
        state.publicPath,
        ""
      ) ||
      browserPath ||
      "/"
    );

  const route =
    safeNormalizeCanonicalPath(
      safeText(
        state.route,
        ""
      ) ||
      publicPath ||
      "/"
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
      route || "/",

    publicPath:
      publicPath || "/",

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
  const first =
    args[0];

  const second =
    args[1];

  if (looksLikeRuntimeSession(first)) {
    return {
      runtimeSession:
        first,

      options:
        safeObject(second),
    };
  }

  return {
    runtimeSession:
      fallbackSession,

    options:
      safeObject(first),
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
      sanitizeRouteContext(routeContext),
  };
}

/* =========================================================
   LOGIN NORMALIZATION
========================================================= */

function getNestedAuthData(raw = {}) {
  const source =
    safeObject(raw);

  const data =
    safeObject(source.data);

  const payload =
    safeObject(source.payload);

  const result =
    safeObject(source.result);

  const body =
    safeObject(source.body);

  const response =
    safeObject(source.response);

  const responseData =
    safeObject(response.data);

  const sessionData =
    pickFirstObject(
      source.session,
      source.sessionData,
      data.session,
      data.sessionData,
      payload.session,
      payload.sessionData,
      result.session,
      result.sessionData,
      body.session,
      body.sessionData,
      responseData.session,
      responseData.sessionData
    ) || {};

  const authData =
    pickFirstObject(
      source.auth,
      source.authData,
      data.auth,
      data.authData,
      payload.auth,
      payload.authData,
      result.auth,
      result.authData,
      body.auth,
      body.authData,
      responseData.auth,
      responseData.authData
    ) || {};

  const nestedSessionData =
    safeObject(sessionData.data);

  const nestedAuthData =
    safeObject(authData.data);

  return {
    root:
      source,
    data,
    payload,
    result,
    body,
    response,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  };
}

function extractLoginToken(result = {}) {
  const nodes =
    getNestedAuthData(result);

  return pickFirstText(
    nodes.root.token,
    nodes.root.accessToken,
    nodes.root.access_token,
    nodes.root.authToken,
    nodes.root.auth_token,
    nodes.root.jwt,

    nodes.data.token,
    nodes.data.accessToken,
    nodes.data.access_token,
    nodes.data.authToken,
    nodes.data.auth_token,
    nodes.data.jwt,

    nodes.payload.token,
    nodes.payload.accessToken,
    nodes.payload.access_token,
    nodes.payload.authToken,
    nodes.payload.auth_token,
    nodes.payload.jwt,

    nodes.result.token,
    nodes.result.accessToken,
    nodes.result.access_token,
    nodes.result.jwt,

    nodes.body.token,
    nodes.body.accessToken,
    nodes.body.access_token,
    nodes.body.jwt,

    nodes.responseData.token,
    nodes.responseData.accessToken,
    nodes.responseData.access_token,
    nodes.responseData.jwt,

    nodes.sessionData.token,
    nodes.sessionData.accessToken,
    nodes.sessionData.access_token,
    nodes.sessionData.jwt,

    nodes.authData.token,
    nodes.authData.accessToken,
    nodes.authData.access_token,
    nodes.authData.jwt,

    nodes.nestedSessionData.token,
    nodes.nestedSessionData.accessToken,
    nodes.nestedSessionData.access_token,
    nodes.nestedSessionData.jwt,

    nodes.nestedAuthData.token,
    nodes.nestedAuthData.accessToken,
    nodes.nestedAuthData.access_token,
    nodes.nestedAuthData.jwt
  );
}

function extractLoginRefreshToken(result = {}) {
  const nodes =
    getNestedAuthData(result);

  return pickFirstText(
    nodes.root.refreshToken,
    nodes.root.refresh_token,

    nodes.data.refreshToken,
    nodes.data.refresh_token,

    nodes.payload.refreshToken,
    nodes.payload.refresh_token,

    nodes.result.refreshToken,
    nodes.result.refresh_token,

    nodes.body.refreshToken,
    nodes.body.refresh_token,

    nodes.responseData.refreshToken,
    nodes.responseData.refresh_token,

    nodes.sessionData.refreshToken,
    nodes.sessionData.refresh_token,

    nodes.authData.refreshToken,
    nodes.authData.refresh_token,

    nodes.nestedSessionData.refreshToken,
    nodes.nestedSessionData.refresh_token,

    nodes.nestedAuthData.refreshToken,
    nodes.nestedAuthData.refresh_token
  );
}

function extractLoginTempToken(result = {}) {
  const nodes =
    getNestedAuthData(result);

  return pickFirstText(
    nodes.root.tempToken,
    nodes.root.temp_token,
    nodes.root.temporaryToken,
    nodes.root.temporary_token,
    nodes.root.twoFactorToken,
    nodes.root.two_factor_token,
    nodes.root.mfaToken,
    nodes.root.mfa_token,

    nodes.data.tempToken,
    nodes.data.temp_token,
    nodes.data.temporaryToken,
    nodes.data.temporary_token,
    nodes.data.twoFactorToken,
    nodes.data.two_factor_token,
    nodes.data.mfaToken,
    nodes.data.mfa_token,

    nodes.payload.tempToken,
    nodes.payload.temp_token,
    nodes.payload.temporaryToken,
    nodes.payload.temporary_token,
    nodes.payload.twoFactorToken,
    nodes.payload.two_factor_token,
    nodes.payload.mfaToken,
    nodes.payload.mfa_token,

    nodes.result.tempToken,
    nodes.result.temp_token,
    nodes.result.temporaryToken,
    nodes.result.temporary_token,
    nodes.result.twoFactorToken,
    nodes.result.two_factor_token,
    nodes.result.mfaToken,
    nodes.result.mfa_token,

    nodes.body.tempToken,
    nodes.body.temp_token,
    nodes.body.temporaryToken,
    nodes.body.temporary_token,
    nodes.body.twoFactorToken,
    nodes.body.two_factor_token,
    nodes.body.mfaToken,
    nodes.body.mfa_token,

    nodes.responseData.tempToken,
    nodes.responseData.temp_token,
    nodes.responseData.temporaryToken,
    nodes.responseData.temporary_token,
    nodes.responseData.twoFactorToken,
    nodes.responseData.two_factor_token,
    nodes.responseData.mfaToken,
    nodes.responseData.mfa_token,

    nodes.sessionData.tempToken,
    nodes.sessionData.temp_token,
    nodes.sessionData.temporaryToken,
    nodes.sessionData.temporary_token,

    nodes.authData.tempToken,
    nodes.authData.temp_token,
    nodes.authData.temporaryToken,
    nodes.authData.temporary_token,

    nodes.nestedSessionData.tempToken,
    nodes.nestedSessionData.temp_token,
    nodes.nestedSessionData.temporaryToken,
    nodes.nestedSessionData.temporary_token,

    nodes.nestedAuthData.tempToken,
    nodes.nestedAuthData.temp_token,
    nodes.nestedAuthData.temporaryToken,
    nodes.nestedAuthData.temporary_token
  );
}

function extractLoginUser(result = {}) {
  const nodes =
    getNestedAuthData(result);

  return pickFirstObject(
    nodes.root.user,
    nodes.root.usuario,
    nodes.root.account,
    nodes.root.profile,
    nodes.root.me,

    nodes.data.user,
    nodes.data.usuario,
    nodes.data.account,
    nodes.data.profile,
    nodes.data.me,

    nodes.payload.user,
    nodes.payload.usuario,
    nodes.payload.account,
    nodes.payload.profile,
    nodes.payload.me,

    nodes.result.user,
    nodes.result.usuario,
    nodes.result.account,
    nodes.result.profile,
    nodes.result.me,

    nodes.body.user,
    nodes.body.usuario,
    nodes.body.account,
    nodes.body.profile,
    nodes.body.me,

    nodes.responseData.user,
    nodes.responseData.usuario,
    nodes.responseData.account,
    nodes.responseData.profile,
    nodes.responseData.me,

    nodes.sessionData.user,
    nodes.sessionData.usuario,
    nodes.sessionData.account,
    nodes.sessionData.profile,
    nodes.sessionData.me,

    nodes.authData.user,
    nodes.authData.usuario,
    nodes.authData.account,
    nodes.authData.profile,
    nodes.authData.me,

    nodes.nestedSessionData.user,
    nodes.nestedSessionData.usuario,
    nodes.nestedSessionData.account,
    nodes.nestedSessionData.profile,
    nodes.nestedSessionData.me,

    nodes.nestedAuthData.user,
    nodes.nestedAuthData.usuario,
    nodes.nestedAuthData.account,
    nodes.nestedAuthData.profile,
    nodes.nestedAuthData.me
  );
}

function extractLoginStatus(result = {}) {
  const nodes =
    getNestedAuthData(result);

  return pickFirstValue(
    nodes.root.status,
    nodes.root.statusCode,
    nodes.root.status_code,

    nodes.data.status,
    nodes.data.statusCode,
    nodes.data.status_code,

    nodes.payload.status,
    nodes.payload.statusCode,
    nodes.payload.status_code,

    nodes.result.status,
    nodes.result.statusCode,
    nodes.result.status_code,

    nodes.body.status,
    nodes.body.statusCode,
    nodes.body.status_code,

    nodes.response.status,
    nodes.response.statusCode,
    nodes.response.status_code,

    nodes.responseData.status,
    nodes.responseData.statusCode,
    nodes.responseData.status_code,

    nodes.sessionData.status,
    nodes.sessionData.statusCode,
    nodes.sessionData.status_code,

    nodes.authData.status,
    nodes.authData.statusCode,
    nodes.authData.status_code,

    nodes.nestedSessionData.status,
    nodes.nestedSessionData.statusCode,
    nodes.nestedSessionData.status_code,

    nodes.nestedAuthData.status,
    nodes.nestedAuthData.statusCode,
    nodes.nestedAuthData.status_code
  );
}

function extractLoginCode(result = {}) {
  const nodes =
    getNestedAuthData(result);

  return pickFirstText(
    nodes.root.code,
    nodes.root.errorCode,
    nodes.root.error_code,
    nodes.root.error,

    nodes.data.code,
    nodes.data.errorCode,
    nodes.data.error_code,
    nodes.data.error,

    nodes.payload.code,
    nodes.payload.errorCode,
    nodes.payload.error_code,
    nodes.payload.error,

    nodes.result.code,
    nodes.result.errorCode,
    nodes.result.error_code,
    nodes.result.error,

    nodes.body.code,
    nodes.body.errorCode,
    nodes.body.error_code,
    nodes.body.error,

    nodes.responseData.code,
    nodes.responseData.errorCode,
    nodes.responseData.error_code,
    nodes.responseData.error,

    nodes.sessionData.code,
    nodes.sessionData.errorCode,
    nodes.sessionData.error_code,
    nodes.sessionData.error,

    nodes.authData.code,
    nodes.authData.errorCode,
    nodes.authData.error_code,
    nodes.authData.error,

    nodes.nestedSessionData.code,
    nodes.nestedSessionData.errorCode,
    nodes.nestedSessionData.error_code,

    nodes.nestedAuthData.code,
    nodes.nestedAuthData.errorCode,
    nodes.nestedAuthData.error_code
  );
}

function extractLoginMessage(result = {}) {
  const nodes =
    getNestedAuthData(result);

  return pickFirstText(
    nodes.root.message,
    nodes.root.mensaje,
    nodes.root.errorMessage,
    nodes.root.error_message,
    nodes.root.detail,

    nodes.data.message,
    nodes.data.mensaje,
    nodes.data.errorMessage,
    nodes.data.error_message,
    nodes.data.detail,

    nodes.payload.message,
    nodes.payload.mensaje,
    nodes.payload.errorMessage,
    nodes.payload.error_message,
    nodes.payload.detail,

    nodes.result.message,
    nodes.result.mensaje,
    nodes.result.errorMessage,
    nodes.result.error_message,
    nodes.result.detail,

    nodes.body.message,
    nodes.body.mensaje,
    nodes.body.errorMessage,
    nodes.body.error_message,
    nodes.body.detail,

    nodes.responseData.message,
    nodes.responseData.mensaje,
    nodes.responseData.errorMessage,
    nodes.responseData.error_message,
    nodes.responseData.detail,

    nodes.sessionData.message,
    nodes.sessionData.mensaje,
    nodes.sessionData.errorMessage,
    nodes.sessionData.error_message,

    nodes.authData.message,
    nodes.authData.mensaje,
    nodes.authData.errorMessage,
    nodes.authData.error_message,

    nodes.nestedSessionData.message,
    nodes.nestedSessionData.mensaje,

    nodes.nestedAuthData.message,
    nodes.nestedAuthData.mensaje
  );
}

function extractLoginRedirectTo(result = {}) {
  const nodes =
    getNestedAuthData(result);

  return pickFirstText(
    nodes.root.redirectTo,
    nodes.root.redirect_to,
    nodes.root.redirect,
    nodes.root.next,
    nodes.root.nextPath,
    nodes.root.next_path,

    nodes.data.redirectTo,
    nodes.data.redirect_to,
    nodes.data.redirect,
    nodes.data.next,
    nodes.data.nextPath,
    nodes.data.next_path,

    nodes.payload.redirectTo,
    nodes.payload.redirect_to,
    nodes.payload.redirect,
    nodes.payload.next,
    nodes.payload.nextPath,
    nodes.payload.next_path,

    nodes.result.redirectTo,
    nodes.result.redirect_to,
    nodes.result.redirect,
    nodes.result.next,
    nodes.result.nextPath,
    nodes.result.next_path,

    nodes.body.redirectTo,
    nodes.body.redirect_to,
    nodes.body.redirect,
    nodes.body.next,
    nodes.body.nextPath,
    nodes.body.next_path,

    nodes.responseData.redirectTo,
    nodes.responseData.redirect_to,
    nodes.responseData.redirect,

    nodes.sessionData.redirectTo,
    nodes.sessionData.redirect_to,
    nodes.sessionData.redirect,

    nodes.authData.redirectTo,
    nodes.authData.redirect_to,
    nodes.authData.redirect,

    nodes.nestedSessionData.redirectTo,
    nodes.nestedSessionData.redirect_to,
    nodes.nestedSessionData.redirect,

    nodes.nestedAuthData.redirectTo,
    nodes.nestedAuthData.redirect_to,
    nodes.nestedAuthData.redirect
  );
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
    value === "false"
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
    safeText(user.telefono, "")
  );
}

function isExplicitLoginFailure(result = {}) {
  const nodes =
    getNestedAuthData(result);

  const statusValue =
    extractLoginStatus(result);

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
      extractLoginCode(result),
      ""
    ).toUpperCase();

  if (
    code &&
    AUTH_FAILURE_CODES.has(code)
  ) {
    return true;
  }

  return Boolean(
    nodes.root.ok === false ||
    nodes.root.success === false ||
    nodes.data.ok === false ||
    nodes.data.success === false ||
    nodes.payload.ok === false ||
    nodes.payload.success === false ||
    nodes.result.ok === false ||
    nodes.result.success === false ||
    nodes.body.ok === false ||
    nodes.body.success === false ||
    nodes.responseData.ok === false ||
    nodes.responseData.success === false
  );
}

function isLogin2FARequired(result = {}, tempToken = "") {
  const nodes =
    getNestedAuthData(result);

  const status =
    safeText(
      extractLoginStatus(result),
      ""
    ).toLowerCase();

  return Boolean(
    tempToken ||

    normalizeBoolean(nodes.root.requires2FA, false) ||
    normalizeBoolean(nodes.root.require2FA, false) ||
    normalizeBoolean(nodes.root.requiresTwoFactor, false) ||
    normalizeBoolean(nodes.root.twoFactorRequired, false) ||
    normalizeBoolean(nodes.root.mfaRequired, false) ||
    normalizeBoolean(nodes.root.requiresMfa, false) ||

    normalizeBoolean(nodes.data.requires2FA, false) ||
    normalizeBoolean(nodes.data.require2FA, false) ||
    normalizeBoolean(nodes.data.requiresTwoFactor, false) ||
    normalizeBoolean(nodes.data.twoFactorRequired, false) ||
    normalizeBoolean(nodes.data.mfaRequired, false) ||
    normalizeBoolean(nodes.data.requiresMfa, false) ||

    normalizeBoolean(nodes.payload.requires2FA, false) ||
    normalizeBoolean(nodes.payload.require2FA, false) ||
    normalizeBoolean(nodes.payload.requiresTwoFactor, false) ||
    normalizeBoolean(nodes.payload.twoFactorRequired, false) ||
    normalizeBoolean(nodes.payload.mfaRequired, false) ||
    normalizeBoolean(nodes.payload.requiresMfa, false) ||

    normalizeBoolean(nodes.result.requires2FA, false) ||
    normalizeBoolean(nodes.result.require2FA, false) ||
    normalizeBoolean(nodes.result.requiresTwoFactor, false) ||
    normalizeBoolean(nodes.result.twoFactorRequired, false) ||
    normalizeBoolean(nodes.result.mfaRequired, false) ||
    normalizeBoolean(nodes.result.requiresMfa, false) ||

    normalizeBoolean(nodes.body.requires2FA, false) ||
    normalizeBoolean(nodes.body.require2FA, false) ||
    normalizeBoolean(nodes.body.requiresTwoFactor, false) ||
    normalizeBoolean(nodes.body.twoFactorRequired, false) ||
    normalizeBoolean(nodes.body.mfaRequired, false) ||
    normalizeBoolean(nodes.body.requiresMfa, false) ||

    normalizeBoolean(nodes.responseData.requires2FA, false) ||
    normalizeBoolean(nodes.responseData.twoFactorRequired, false) ||
    normalizeBoolean(nodes.responseData.mfaRequired, false) ||

    normalizeBoolean(nodes.sessionData.requires2FA, false) ||
    normalizeBoolean(nodes.sessionData.twoFactorRequired, false) ||
    normalizeBoolean(nodes.sessionData.mfaRequired, false) ||

    normalizeBoolean(nodes.authData.requires2FA, false) ||
    normalizeBoolean(nodes.authData.twoFactorRequired, false) ||
    normalizeBoolean(nodes.authData.mfaRequired, false) ||

    normalizeBoolean(nodes.nestedSessionData.requires2FA, false) ||
    normalizeBoolean(nodes.nestedSessionData.twoFactorRequired, false) ||

    normalizeBoolean(nodes.nestedAuthData.requires2FA, false) ||
    normalizeBoolean(nodes.nestedAuthData.twoFactorRequired, false) ||

    status === "2fa_required" ||
    status === "mfa_required" ||
    status === "two_factor_required" ||
    status === "totp_required"
  );
}

function normalizeLoginUserForState(user = {}) {
  try {
    const normalized =
      normalizeUser?.(user);

    if (
      normalized &&
      typeof normalized === "object"
    ) {
      return normalized;
    }
  } catch {}

  return safeObject(user);
}

function normalizePublicLoginResult(result = {}) {
  const raw =
    safeObject(result);

  const token =
    extractLoginToken(raw);

  const refreshToken =
    extractLoginRefreshToken(raw);

  const user =
    normalizeLoginUserForState(
      extractLoginUser(raw) || raw.user || {}
    );

  const tempToken =
    extractLoginTempToken(raw);

  const requires2FA =
    isLogin2FARequired(raw, tempToken);

  const explicitFailure =
    isExplicitLoginFailure(raw);

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

    status:
      safeText(
        extractLoginStatus(raw),
        explicitFailure
          ? "auth_failed"
          : requires2FA
            ? "2fa_required"
            : authenticated
              ? "authenticated"
              : ""
      ),

    code:
      safeText(
        extractLoginCode(raw),
        ""
      ),

    message:
      safeText(
        extractLoginMessage(raw),
        ""
      ),

    redirectTo:
      safeText(
        extractLoginRedirectTo(raw),
        ""
      ),
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
   LOGIN COMMIT / CLEAR
========================================================= */

function extractRoleFromUser(user = {}) {
  const clean =
    safeObject(user);

  const roles =
    Array.isArray(clean.roles)
      ? clean.roles
      : [];

  return pickFirstText(
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
  ) || null;
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

  const sessionPayload = {
    ...raw,

    ok:
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

    role,
    rol:
      role,

    preserveExistingUser:
      false,

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
      "applySession no pudo aplicar sesión post-login.",
      error
    );
  }

  try {
    AppCore?.applySession?.({
      token,
      user,
    });
  } catch {}

  const finalRole =
    snapshot?.role ||
    role ||
    user?.role ||
    user?.rol ||
    "";

  const finalRoles =
    Array.isArray(snapshot?.roles)
      ? snapshot.roles
      : Array.isArray(user?.roles)
        ? user.roles
        : [];

  try {
    AppCore?.setState?.({
      authenticated:
        true,

      hasToken:
        true,

      user,
      currentUser:
        user,
      sessionUser:
        user,
      authUser:
        user,

      role:
        finalRole,

      userRole:
        finalRole,

      roles:
        finalRoles,

      isAdmin:
        Boolean(
          snapshot?.isAdmin ||
          user?.isAdmin ||
          user?.admin
        ),

      isSupport:
        Boolean(
          snapshot?.isSupport ||
          user?.isSupport
        ),

      isManager:
        Boolean(
          snapshot?.isManager ||
          user?.isManager
        ),

      token,
      accessToken:
        token,

      session: {
        ...(safeObject(AppCore?.state?.session)),
        authenticated:
          true,
        user,
        role:
          finalRole,
        roles:
          finalRoles,
        token,
        accessToken:
          token,
        refreshToken:
          sessionPayload.refreshToken || null,
        source:
          "Auth.login",
      },

      twoFactorPending:
        false,

      tempToken:
        null,

      lastLoginAt:
        isoNow(),

      lastAuthSource:
        "login",
    });
  } catch {
    try {
      if (
        AppCore?.state &&
        typeof AppCore.state === "object"
      ) {
        AppCore.state.authenticated = true;
        AppCore.state.hasToken = true;
        AppCore.state.user = user;
        AppCore.state.currentUser = user;
        AppCore.state.sessionUser = user;
        AppCore.state.authUser = user;
        AppCore.state.role = finalRole;
        AppCore.state.userRole = finalRole;
        AppCore.state.roles = finalRoles;
        AppCore.state.token = token;
        AppCore.state.accessToken = token;
        AppCore.state.twoFactorPending = false;
        AppCore.state.tempToken = null;
        AppCore.state.session = {
          ...(safeObject(AppCore.state.session)),
          authenticated: true,
          user,
          role: finalRole,
          roles: finalRoles,
          token,
          accessToken: token,
          refreshToken:
            sessionPayload.refreshToken || null,
          source:
            "Auth.login",
        };
      }
    } catch {}
  }

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
    snapshot,
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

    token:
      null,

    accessToken:
      null,

    session:
      null,

    sessionId:
      null,

    currentResolvedUsername:
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

  if (opts.emit !== false) {
    emit("auth:session:cleared-by-auth", {
      reason,
      source:
        "Auth",
      routeContext:
        sanitizeRouteContext(routeContext),
    });

    emit("app:user:change", {
      reason,
      authenticated:
        false,
      user:
        null,
      source:
        "Auth",
    });

    emit("app:ui:repair-request", {
      reason:
        `auth-clear:${reason}`,
      authenticated:
        false,
      user:
        null,
      source:
        "Auth",
    });
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
      twoFactorPending:
        true,
      tempToken:
        normalized.tempToken || null,
    });
  } catch {}

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  emit("auth:login:2fa-required", {
    redirectTo:
      normalized.redirectTo || DEFAULT_2FA_PATH,
    status:
      normalized.status || "2fa_required",
    source:
      "Auth",
  });

  emit("app:ui:repair-request", {
    reason:
      "auth-login-2fa-required",
    authenticated:
      false,
    source:
      "Auth",
  });
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
      "Auth",
    reason,
    phase,
    redirectTo:
      normalized.redirectTo || null,
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
    Login correcto != restore.

    No se emiten aquí:
    - auth:session:restored
    - app:session:restored
  */
  emit("auth:login:success", payload);

  emit("auth:session:applied", {
    ...payload,
    reason:
      "login-session-applied",
  });

  emit("app:user:change", payload);

  emit("app:auth:ready", {
    ...payload,
    reason:
      "login-auth-ready",
  });

  emit("app:ui:repair-request", {
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
  });
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
    */
    emit("app:ui:repair-request", {
      ...payload,
      repairShell:
        false,
      hardRepair:
        false,
      rebind:
        false,
      afterPaint:
        true,
    });

    emit("app:ui:repair", {
      ...payload,
      repairShell:
        false,
      hardRepair:
        false,
      rebind:
        false,
    });

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

  const now =
    nowMs();

  if (type === "login") {
    sessionState.lastLoginAt = now;
  }

  if (type === "restore") {
    sessionState.lastRestoreAt = now;
  }

  if (type === "refresh") {
    sessionState.lastRefreshAt = now;
  }

  if (type === "me") {
    sessionState.lastCheckAt = now;
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
    Namespace runtime para evitar duplicar eventos canónicos de restore.js.
  */
  emit(`auth:runtime:${type}:start`, {
    source:
      "Auth",
  });

  try {
    const result =
      await Promise.resolve(
        executor(...args)
      );

    markRuntimeSuccess(
      sessionState,
      type
    );

    emit(`auth:runtime:${type}:success`, {
      durationMs:
        nowMs() - startedAt,
      ok:
        result?.ok !== false,
      source:
        "Auth",
    });

    return result;
  } catch (error) {
    markRuntimeError(
      sessionState,
      type,
      error
    );

    emit(`auth:runtime:${type}:error`, {
      durationMs:
        nowMs() - startedAt,
      error:
        sessionState.lastError,
      source:
        "Auth",
    });

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
              new Error("No se pudo refrescar la sesión."),
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
      resolved.runtimeSession || session;

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

    emit("auth:login:start", {
      source:
        "Auth",
    });

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
              coreLogin(payload, {
                ...safeObject(options),

                /*
                  El evento público auth:login:success lo emite sólo Auth.
                  coreLogin puede emitir auth:login:session-committed,
                  pero no debe duplicar success.
                */
                emitLoginSuccessEvent:
                  false,
              })
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
              redactTokenInText(normalized.redirectTo || ""),
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
                normalized.redirectTo || DEFAULT_2FA_PATH,
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
                  true,
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
                  true,
              }
            );

            throw createLoginErrorFromResult(
              normalized,
              "Login inválido: el servidor no devolvió una sesión válida."
            );
          }

          const committed =
            applyAcceptedLoginSession(
              normalized
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
            redirectTo:
              normalized.redirectTo || undefined,
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
                true,
            }
          );

          emit("auth:login:error", {
            durationMs:
              nowMs() - startedAt,
            error:
              session.lastError,
            source:
              "Auth",
          });

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
    const credentials =
      readLoginCredentialsFromForm(
        formElement
      );

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
          options?.emit !== false,
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
      safeSessionDebug.token = null;
      safeSessionDebug.accessToken = null;
      safeSessionDebug.refreshToken = null;
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
        cloneRuntimeSessionState(
          session
        ),

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

      route:
        getAuthRouteState(),

      routeContext:
        sanitizeRouteContext(
          routeContext
        ),

      sessionDebug:
        safeSessionDebug,

      loginDebug:
        safeCall(
          getLoginSnapshot,
          null
        ),

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
          Boolean(getStoredTempToken()),

        hasSessionId:
          Boolean(getStoredSessionId()),

        hasSessionUserId:
          Boolean(getStoredSessionUserId()),

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
          isFunction(requestPasswordReset),

        hasConfirmResetPassword:
          isFunction(
            resolveConfirmResetPasswordHandler()
          ),
      },
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  return Object.freeze({
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
    requestPasswordReset,
    resetPasswordRequest,
    forgotPassword,

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
    getDebugSnapshot:
      getAuthModuleSnapshot,
  });
})();

export default Auth;
