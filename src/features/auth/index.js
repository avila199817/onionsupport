/* =========================================================
   Onion SPA - Auth / Session
   Archivo: src/features/auth/index.js

   RESPONSABILIDADES:
   - punto de entrada del módulo auth
   - composición de login / logout / restore / guards
   - exponer helpers auth para toda la SPA
   - serializar restore / refresh / me / login
   - mantener compatibilidad con backend heterogéneo
   - exponer aliases públicos estables para auth flows
   - integrar reset-password / forgot-password
   - integrar confirmación de reset-password
   - ofrecer API pública coherente y endurecida
   - preservar rutas públicas técnicas durante restore
   - no romper /activate-account?token=...
   - no romper /activate-account/<token>
   - no romper /reset-password/confirm?token=...
   - no romper /reset-password/confirm/<token>

   HARDENING EXTREMO:
   - singleton inmutable
   - wrappers robustos
   - snapshot debug enterprise sin tokens reales
   - tolerancia total a módulos parciales
   - aliases legacy estables
   - métricas auth enriquecidas
   - no race conditions restore/refresh/me/login
   - estado runtime consistente
   - restoreSession no pierde options
   - rutas técnicas públicas protegidas durante restore
   - login no acepta payloads ok:false como éxito
   - login no permite sesión válida sin token + usuario
   - login limpia sesión antigua si backend responde error
   - login corta fugas de avatar/dashboard cacheado tras fallo
   - login preserva flujo 2FA sin marcar authenticated
   - login fuerza commit de sesión en AppCore tras éxito
   - login emite eventos post-login para reparar Sidebar/Topbar/Shell
   - login NO emite eventos de restore
   - login NO duplica auth:login:success en afterPaint
   - eventos públicos sin tokens reales
   - restore/refresh/me delegan eventos canónicos en restore.js
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  isAuthRoute,
  extractMessage,
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
} from "./storage.js";

import {
  buildSessionSnapshot,
  applySession,
  clearSessionLocal,
  isAuthenticated,
  getCurrentRole,
  getCurrentRoles,
  isCurrentUserAdmin,
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
  handleLoginFormSubmit,
} from "./login.js";

import * as PasswordResetApi from "./password-reset.js";

import {
  fetchMe,
  refreshSession,
  restoreSession as restoreSessionCore,
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
  "10.2.0";

/* =========================================================
   PUBLIC TECHNICAL ROUTES
========================================================= */

const ACTIVATION_PATH =
  "/activate-account";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const PUBLIC_TECHNICAL_ROUTES =
  Object.freeze([
    ACTIVATION_PATH,
    "/reset-password",
    RESET_CONFIRM_PATH,
    "/forgot-password",
    "/recover-password",
    "/password-reset",
  ]);

const ACTIVATION_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "code",
    "t",
  ]);

const RESET_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "resetToken",
    "passwordResetToken",
    "code",
    "t",
  ]);

/* =========================================================
   AUTH FAILURE CODES
========================================================= */

const AUTH_FAILURE_CODES =
  Object.freeze(
    new Set([
      "INVALID_CREDENTIALS",
      "MISSING_CREDENTIALS",
      "ACCOUNT_TEMPORARILY_LOCKED",
      "ACCOUNT_DISABLED",
      "USER_DISABLED",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "TOKEN_INVALID",
      "INVALID_TOKEN",
      "SESSION_EXPIRED",
      "INVALID_LOGIN_SESSION",
      "LOGIN_FAILED",
      "AUTH_FAILED",
      "BAD_CREDENTIALS",
      "CREDENTIALS_INVALID",
    ])
  );

/* =========================================================
   PASSWORD RESET RESOLUTION
========================================================= */

const requestPasswordReset =
  PasswordResetApi?.requestPasswordReset ||
  PasswordResetApi?.forgotPassword ||
  null;

const resetPasswordRequest =
  PasswordResetApi?.resetPasswordRequest ||
  requestPasswordReset ||
  null;

const forgotPassword =
  PasswordResetApi?.forgotPassword ||
  requestPasswordReset ||
  null;

const getRequestPasswordResetEndpoint =
  PasswordResetApi?.getRequestPasswordResetEndpoint ||
  (() =>
    AUTH_ENDPOINTS?.forgotPassword ||
    AUTH_ENDPOINTS?.resetPasswordRequest ||
    null);

const resolveResetPasswordIdentifier =
  PasswordResetApi?.resolveResetPasswordIdentifier ||
  ((value) =>
    String(value || "").trim());

const normalizeResetPasswordPayload =
  PasswordResetApi?.normalizeResetPasswordPayload ||
  ((payload = {}) => payload);

const buildResetPasswordRequestBody =
  PasswordResetApi?.buildResetPasswordRequestBody ||
  ((payload = {}) => payload);

const normalizeResetPasswordResponse =
  PasswordResetApi?.normalizeResetPasswordResponse ||
  ((response = {}) => response);

/* =========================================================
   CONFIRM RESET PASSWORD
========================================================= */

function resolveConfirmResetPasswordHandler() {
  const candidates = [
    PasswordResetApi?.confirmResetPassword,
    PasswordResetApi?.resetPasswordConfirm,
    PasswordResetApi?.confirmPasswordReset,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate;
    }
  }

  return null;
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

function safeCloneSessionState(source = {}) {
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

function safeObject(value) {
  return (
    value &&
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

function pickFirstValue(...values) {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      return value;
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
   REDACTION
========================================================= */

function redactTokenInText(value = "") {
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

function sanitizeEventPayload(payload = {}) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const output = {
    ...payload,
  };

  if ("token" in output) output.token = null;
  if ("accessToken" in output) output.accessToken = null;
  if ("access_token" in output) output.access_token = null;
  if ("refreshToken" in output) output.refreshToken = null;
  if ("refresh_token" in output) output.refresh_token = null;
  if ("tempToken" in output) output.tempToken = null;
  if ("temp_token" in output) output.temp_token = null;

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

/* =========================================================
   PATH HELPERS
========================================================= */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
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
    value = `/${value}`;
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
    raw.split("?")[0].split("#")[0] || "/"
  );
}

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
      new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeHashRouterPath(
        parsed.hash
      );
    }

    return `${normalizePathnameOnly(
      parsed.pathname || "/"
    )}${parsed.search || ""}${parsed.hash || ""}`;
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
;
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

function hasTokenInSearch(search = "", names = ACTIVATION_TOKEN_PARAM_NAMES) {
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

function extractPathToken(path = "", basePath = "") {
  const normalized =
    pathFromUrlLike(path) || path || "";

  const pathname =
    stripSearchAndHash(normalized);

  if (!basePath) {
    return "";
  }

  if (!pathname.startsWith(`${basePath}/`)) {
    return "";
  }

  const token =
    pathname
      .slice(`${basePath}/`.length)
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

function extractActivationPathToken(path = "") {
  return extractPathToken(
    path,
    ACTIVATION_PATH
  );
}

function extractResetConfirmPathToken(path = "") {
  return extractPathToken(
    path,
    RESET_CONFIRM_PATH
  );
}

function isExactPublicTechnicalRoute(path = "/") {
  const clean =
    stripSearchAndHash(path);

  return PUBLIC_TECHNICAL_ROUTES.includes(clean);
}

function isActivationRoute(path = "/") {
  const clean =
    stripSearchAndHash(path);

  return (
    clean === ACTIVATION_PATH ||
    clean.startsWith(`${ACTIVATION_PATH}/`)
  );
}

function isResetConfirmRoute(path = "/") {
  const clean =
    stripSearchAndHash(path);

  return (
    clean === RESET_CONFIRM_PATH ||
    clean.startsWith(`${RESET_CONFIRM_PATH}/`)
  );
}

function isPublicTechnicalRoute(path = "/") {
  return (
    isExactPublicTechnicalRoute(path) ||
    isActivationRoute(path) ||
    isResetConfirmRoute(path)
  );
}

function hasTechnicalRouteToken({
  value = "",
  routePath = "",
  tokenParamNames = [],
  extractPathTokenFn = null,
} = {}) {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  const path =
    pathFromUrlLike(raw) || raw;

  if (
    stripSearchAndHash(path).startsWith(routePath) &&
    isFunction(extractPathTokenFn) &&
    extractPathTokenFn(path)
  ) {
    return true;
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    if (
      hasTokenInSearch(
        parsed.search,
        tokenParamNames
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
        tokenParamNames
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
          tokenParamNames
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
          tokenParamNames
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function hasActivationToken(value = "") {
  return hasTechnicalRouteToken({
    value,
    routePath:
      ACTIVATION_PATH,
    tokenParamNames:
      ACTIVATION_TOKEN_PARAM_NAMES,
    extractPathTokenFn:
      extractActivationPathToken,
  });
}

function hasResetConfirmToken(value = "") {
  return hasTechnicalRouteToken({
    value,
    routePath:
      RESET_CONFIRM_PATH,
    tokenParamNames:
      RESET_TOKEN_PARAM_NAMES,
    extractPathTokenFn:
      extractResetConfirmPathToken,
  });
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

function getCurrentRouteContext() {
  const state =
    AppCore?.state || {};

  const browserPath =
    getBrowserPublicPath();

  const publicPath =
    safeText(
      state.publicPath,
      ""
    ) ||
    browserPath ||
    "/";

  const route =
    safeText(
      state.route,
      ""
    ) ||
    stripSearchAndHash(publicPath);

  const initialUrl =
    getInitialUrl();

  const activationInitialUrl =
    getActivationInitialUrl();

  const resetConfirmInitialUrl =
    getResetConfirmInitialUrl();

  const candidates = [
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
    .map((value) => safeText(value, ""))
    .filter(Boolean);

  const activationBoot =
    !isActivationTokenScrubbed() &&
    candidates.some((candidate) => {
      const path =
        pathFromUrlLike(candidate);

      return (
        isActivationRoute(path) &&
        hasActivationToken(candidate)
      );
    });

  const resetConfirmBoot =
    !isResetTokenScrubbed() &&
    candidates.some((candidate) => {
      const path =
        pathFromUrlLike(candidate);

      return (
        isResetConfirmRoute(path) &&
        hasResetConfirmToken(candidate)
      );
    });

  const canonical =
    stripSearchAndHash(publicPath || route || "/");

  const publicTechnical =
    isPublicTechnicalRoute(canonical) ||
    isPublicTechnicalRoute(publicPath) ||
    activationBoot ||
    resetConfirmBoot;

  return {
    route:
      canonical || "/",

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

function normalizeRestoreOptions(...args) {
  const first =
    args[0];

  const second =
    args[1];

  const baseOptions =
    looksLikeRuntimeSession(first)
      ? safeObject(second)
      : safeObject(first);

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
   LOGIN RESULT HARDENING
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
  const raw =
    safeObject(result);

  const nodes =
    getNestedAuthData(raw);

  return pickFirstText(
    raw.token,
    raw.accessToken,
    raw.access_token,
    raw.authToken,
    raw.auth_token,
    raw.jwt,
    raw.idToken,
    raw.id_token,

    nodes.data.token,
    nodes.data.accessToken,
    nodes.data.access_token,
    nodes.data.authToken,
    nodes.data.auth_token,
    nodes.data.jwt,
    nodes.data.idToken,
    nodes.data.id_token,

    nodes.payload.token,
    nodes.payload.accessToken,
    nodes.payload.access_token,
    nodes.payload.authToken,
    nodes.payload.auth_token,
    nodes.payload.jwt,

    nodes.result.token,
    nodes.result.accessToken,
    nodes.result.access_token,
    nodes.result.authToken,
    nodes.result.auth_token,
    nodes.result.jwt,

    nodes.body.token,
    nodes.body.accessToken,
    nodes.body.access_token,
    nodes.body.authToken,
    nodes.body.auth_token,
    nodes.body.jwt,

    nodes.responseData.token,
    nodes.responseData.accessToken,
    nodes.responseData.access_token,
    nodes.responseData.jwt,

    nodes.sessionData.token,
    nodes.sessionData.accessToken,
    nodes.sessionData.access_token,
    nodes.sessionData.authToken,
    nodes.sessionData.auth_token,
    nodes.sessionData.jwt,

    nodes.authData.token,
    nodes.authData.accessToken,
    nodes.authData.access_token,
    nodes.authData.authToken,
    nodes.authData.auth_token,
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
  const raw =
    safeObject(result);

  const nodes =
    getNestedAuthData(raw);

  return pickFirstText(
    raw.refreshToken,
    raw.refresh_token,

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

function extractLoginUser(result = {}) {
  const raw =
    safeObject(result);

  const nodes =
    getNestedAuthData(raw);

  return pickFirstObject(
    raw.user,
    raw.usuario,
    raw.account,
    raw.profile,
    raw.me,

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
  const raw =
    safeObject(result);

  const nodes =
    getNestedAuthData(raw);

  return pickFirstValue(
    raw.status,
    raw.statusCode,
    raw.status_code,

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
  const raw =
    safeObject(result);

  const nodes =
    getNestedAuthData(raw);

  return pickFirstText(
    raw.code,
    raw.errorCode,
    raw.error_code,
    raw.error,

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
  const raw =
    safeObject(result);

  const nodes =
    getNestedAuthData(raw);

  return pickFirstText(
    raw.message,
    raw.mensaje,
    raw.errorMessage,
    raw.error_message,
    raw.detail,

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

function extractLoginTempToken(result = {}) {
  const raw =
    safeObject(result);

  const nodes =
    getNestedAuthData(raw);

  return pickFirstText(
    raw.tempToken,
    raw.temp_token,
    raw.temporaryToken,
    raw.temporary_token,
    raw.twoFactorToken,
    raw.two_factor_token,
    raw.mfaToken,
    raw.mfa_token,

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

function extractLoginRedirectTo(result = {}) {
  const raw =
    safeObject(result);

  const nodes =
    getNestedAuthData(raw);

  return pickFirstText(
    raw.redirectTo,
    raw.redirect_to,
    raw.redirect,
    raw.next,
    raw.nextPath,
    raw.next_path,

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
  const raw =
    safeObject(result);

  const data =
    safeObject(raw.data);

  const payload =
    safeObject(raw.payload);

  const resultData =
    safeObject(raw.result);

  const body =
    safeObject(raw.body);

  const response =
    safeObject(raw.response);

  const responseData =
    safeObject(response.data);

  const statusValue =
    extractLoginStatus(raw);

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
      extractLoginCode(raw),
      ""
    ).toUpperCase();

  if (
    code &&
    AUTH_FAILURE_CODES.has(code)
  ) {
    return true;
  }

  if (
    raw.ok === false ||
    raw.success === false ||
    data.ok === false ||
    data.success === false ||
    payload.ok === false ||
    payload.success === false ||
    resultData.ok === false ||
    resultData.success === false ||
    body.ok === false ||
    body.success === false ||
    responseData.ok === false ||
    responseData.success === false
  ) {
    return true;
  }

  return false;
}

function isLogin2FARequired(result = {}, tempToken = "") {
  const raw =
    safeObject(result);

  const nodes =
    getNestedAuthData(raw);

  const status =
    safeText(
      extractLoginStatus(raw),
      ""
    ).toLowerCase();

  return Boolean(
    tempToken ||

    normalizeBoolean(raw.requires2FA, false) ||
    normalizeBoolean(raw.require2FA, false) ||
    normalizeBoolean(raw.requiresTwoFactor, false) ||
    normalizeBoolean(raw.twoFactorRequired, false) ||
    normalizeBoolean(raw.mfaRequired, false) ||
    normalizeBoolean(raw.requiresMfa, false) ||

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
    status === "two_factor_required"
  );
}

function normalizePublicLoginResult(result = {}) {
  const raw =
    safeObject(result);

  const token =
    extractLoginToken(raw);

  const refreshToken =
    extractLoginRefreshToken(raw);

  const user =
    extractLoginUser(raw);

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
      user || null,

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
   SESSION COMMIT / POST LOGIN REPAIR
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
        snapshot?.role ||
        role,

      userRole:
        snapshot?.role ||
        role,

      roles:
        snapshot?.roles ||
        AppCore?.state?.roles ||
        [],

      isAdmin:
        Boolean(
          snapshot?.isAdmin ||
          AppCore?.state?.isAdmin
        ),

      isSupport:
        Boolean(
          snapshot?.isSupport ||
          AppCore?.state?.isSupport
        ),

      isManager:
        Boolean(
          snapshot?.isManager ||
          AppCore?.state?.isManager
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
          snapshot?.role ||
          role,
        token,
        accessToken:
          token,
        refreshToken:
          sessionPayload.refreshToken || null,
      },

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
        AppCore.state.role = snapshot?.role || role;
        AppCore.state.userRole = snapshot?.role || role;
        AppCore.state.token = token;
        AppCore.state.accessToken = token;
        AppCore.state.session = {
          ...(safeObject(AppCore.state.session)),
          authenticated: true,
          user,
          role: snapshot?.role || role,
          token,
          accessToken: token,
          refreshToken:
            sessionPayload.refreshToken || null,
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
      snapshot?.role ||
      role,
    roles:
      snapshot?.roles ||
      AppCore?.state?.roles ||
      [],
    token,
    refreshToken:
      sessionPayload.refreshToken || null,
    snapshot,
    sessionPayload,
  };
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
    Login correcto != restore de sesión.

    No emitimos aquí:
    - auth:session:restored
    - app:session:restored

    Esos eventos quedan reservados para restoreSession().
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
      No reemitimos auth:login:success.
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
  });
}

/* =========================================================
   CLEAR AUTH STATE
========================================================= */

function clearKnownAuthStorageAfterRejectedLogin() {
  if (!isBrowser()) {
    return;
  }

  const keys = [
    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_session_id",
    "onion_session_user_id",
    "onion_user_id",
    "onion_user_name",
    "onion_role",

    "onion:token",
    "onion:user",
    "onion:refreshToken",
    "onion:tempToken",
    "onion:sessionId",
    "onion:sessionUserId",
    "onion:authContext",

    "auth_token",
    "access_token",
    "refresh_token",
    "temp_token",
    "token",
    "session",
    "user",
  ];

  keys.forEach((key) => {
    try {
      window.localStorage?.removeItem?.(key);
    } catch {}

    try {
      window.sessionStorage?.removeItem?.(key);
    } catch {}
  });
}

function clearRejectedLoginState(reason = "login_rejected", options = {}) {
  try {
    clearSessionLocal?.({
      silent:
        true,
      reason,
      ...safeObject(options),
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
    AppCore?.clearSession?.({
      silent:
        true,
      reason,
    });
  } catch {}

  try {
    AppCore?.session?.clear?.();
  } catch {}

  try {
    AppCore?.setState?.(
      {
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
      },
      {
        forceUnauthenticated:
          true,
      }
    );
  } catch {
    try {
      if (AppCore?.state) {
        AppCore.state.authenticated = false;
        AppCore.state.hasToken = false;
        AppCore.state.user = null;
        AppCore.state.currentUser = null;
        AppCore.state.sessionUser = null;
        AppCore.state.authUser = null;
        AppCore.state.role = null;
        AppCore.state.userRole = null;
        AppCore.state.roles = [];
        AppCore.state.isAdmin = false;
        AppCore.state.isSupport = false;
        AppCore.state.isManager = false;
        AppCore.state.token = null;
        AppCore.state.accessToken = null;
        AppCore.state.session = null;
        AppCore.state.sessionId = null;
        AppCore.state.currentResolvedUsername = null;
        AppCore.state.twoFactorPending = false;
      }
    } catch {}
  }

  clearKnownAuthStorageAfterRejectedLogin();

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  emit("auth:login:rejected", {
    reason,
    source:
      "Auth",
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

function prepareLoginAttemptState() {
  clearRejectedLoginState(
    "login_attempt_start"
  );
}

function safePersistTempToken(value) {
  try {
    persistTempToken?.(
      value || null
    );
  } catch {}
}

function markTwoFactorPending(normalized = {}) {
  session.twoFactorPending =
    true;

  safePersistTempToken(
    normalized.tempToken || null
  );

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
        null,
      userRole:
        null,
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
      normalized.redirectTo || null,
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

/* =========================================================
   METRICS
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
    No emitimos auth:${type}:start/success/error para me/refresh/restore.
    Esos eventos canónicos los emiten restore.js y los flujos internos.
    Aquí se usa namespace runtime para evitar duplicidades.
  */
  emit(`auth:runtime:${type}:start`, {});

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

  if (result === false || result === null || result === undefined) {
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
   SAFE CORE EXECUTORS
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

  /*
    restore.js acepta dos firmas:
    - restoreSession(options)
    - restoreSession(runtimeSession, options)

    Usamos la segunda para que el snapshot de Auth.session refleje
    checking/restoring/refreshing con precisión.
  */
  return restoreSessionCore(
    runtimeSession,
    options
  );
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

    const options =
      normalizeRestoreOptions(
        ...args
      );

    session.restorePromise =
      runRuntimeMetric(
        session,
        "restore",
        executeRestoreSession,
        [
          session,
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
          prepareLoginAttemptState();

          const result =
            await Promise.resolve(
              coreLogin(payload, options)
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
              normalized
            );

            return {
              ...safeObject(result),
              ok:
                true,
              authenticated:
                false,
              requires2FA:
                true,
              tempToken:
                normalized.tempToken || undefined,
              redirectTo:
                normalized.redirectTo || undefined,
            };
          }

          if (
            normalized.explicitFailure ||
            normalized.ok === false
          ) {
            clearRejectedLoginState(
              "explicit_login_failure"
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
            clearRejectedLoginState(
              "invalid_login_payload"
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

          clearRejectedLoginState(
            "login_error"
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

  async function handleLoginFormSubmitPublic(...args) {
    try {
      const result =
        await Promise.resolve(
          handleLoginFormSubmit?.(...args)
        );

      const normalized =
        normalizePublicLoginResult(result);

      if (
        normalized.authenticated &&
        hasUsableToken(normalized.token) &&
        hasUsableUser(normalized.user)
      ) {
        const committed =
          applyAcceptedLoginSession(
            normalized
          );

        emitAcceptedLoginEvents({
          normalized,
          committed,
          durationMs:
            0,
          phase:
            "form-submit-wrapper",
        });

        schedulePostLoginRepair({
          normalized,
          committed,
          durationMs:
            0,
        });
      }

      return result;
    } catch (error) {
      safeError(
        "handleLoginFormSubmit falló.",
        error
      );

      throw error;
    }
  }

  function clearSessionPublic(options = {}) {
    clearRejectedLoginState(
      options?.reason ||
      "manual_clear",
      options
    );

    return true;
  }

  /* =======================================================
     SNAPSHOT DEBUG
  ======================================================= */

  function getAuthModuleSnapshot() {
    const routeContext =
      getCurrentRouteContext();

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
        safeCloneSessionState(
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

      sessionDebug:
        safeCall(
          getSessionDebugSnapshot,
          null
        ),

      routeContext:
        sanitizeRouteContext(
          routeContext
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
    isAuthRoute,

    /* ROLES */
    hasRole,
    requireRole,
    guardAuthenticated,
    guardRole,
    getCurrentRole,
    getCurrentRoles,
    isCurrentUserAdmin,

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

    /* DEBUG */
    getAuthModuleSnapshot,
    getDebugSnapshot:
      getAuthModuleSnapshot,
  });
})();

export default Auth;
