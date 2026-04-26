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
   - ofrecer api pública coherente y endurecida
   - preservar rutas públicas técnicas durante restore
   - no romper /activate-account?token=...
   - no romper /reset-password/confirm?token=...

   HARDENING EXTREMO:
   - singleton inmutable
   - wrappers robustos
   - snapshot debug enterprise
   - tolerancia total a módulos parciales
   - aliases legacy estables
   - métricas auth enriquecidas
   - no race conditions restore/refresh/me/login
   - estado runtime consistente
   - restoreSession no pierde options

   FIX 10/10:
   - Auth.login ya no acepta payloads ok:false como éxito
   - Auth.login ya no permite sesión válida sin token + usuario
   - Auth.login limpia sesión antigua si el backend responde 401/403/error
   - Auth.login corta fugas de avatar/dashboard cacheado tras login fallido
   - Auth.login preserva flujo 2FA sin marcar authenticated
   - Auth.login fuerza commit de sesión en AppCore tras éxito
   - Auth.login emite eventos post-login para reparar Sidebar/Topbar/Shell
   - Auth.login reduce el caso "panel roto hasta refrescar"
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
} from "./storage.js";

import {
  buildSessionSnapshot,
  applySession,
  clearSessionLocal,
  isAuthenticated,
  getCurrentRole,
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
   PUBLIC TECHNICAL ROUTES
========================================================= */

const PUBLIC_TECHNICAL_ROUTES = new Set([
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
]);

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

const RESET_TOKEN_PARAM_NAMES = [
  "token",
  "resetToken",
  "passwordResetToken",
  "code",
  "t",
];

/* =========================================================
   AUTH FAILURE CODES
========================================================= */

const AUTH_FAILURE_CODES = new Set([
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
]);

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
    loggingIn: false,
    restoring: false,
    checking: false,
    refreshing: false,

    lastLoginAt: null,
    lastCheckAt: null,
    lastRefreshAt: null,
    lastRestoreAt: null,

    loginPromise: null,
    refreshPromise: null,
    mePromise: null,
    restorePromise: null,

    loginFailCount: 0,
    refreshFailCount: 0,
    refreshBlockedUntil: 0,

    lastError: null,
  };
}

function safeCloneSessionState(source = {}) {
  return {
    loggingIn: Boolean(source.loggingIn),
    restoring: Boolean(source.restoring),
    checking: Boolean(source.checking),
    refreshing: Boolean(source.refreshing),

    lastLoginAt: source.lastLoginAt || null,
    lastCheckAt: source.lastCheckAt || null,
    lastRefreshAt: source.lastRefreshAt || null,
    lastRestoreAt: source.lastRestoreAt || null,

    loginPromise: source.loginPromise || null,
    refreshPromise: source.refreshPromise || null,
    mePromise: source.mePromise || null,
    restorePromise: source.restorePromise || null,

    loginFailCount: Number(source.loginFailCount || 0),
    refreshFailCount: Number(source.refreshFailCount || 0),
    refreshBlockedUntil: Number(source.refreshBlockedUntil || 0),

    lastError: source.lastError || null,
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
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
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
    return value === 1;
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
    ].includes(text)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
    ].includes(text)
  ) {
    return false;
  }

  return Boolean(fallback);
}

function safeCall(fn, fallback, ...args) {
  try {
    if (typeof fn !== "function") {
      return fallback;
    }

    return fn(...args);
  } catch {
    return fallback;
  }
}

function emit(eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}

  try {
    globalThis?.window?.AppCore
      ?.events?.emit?.(
        eventName,
        payload
      );
  } catch {}

  try {
    globalThis?.AppCore
      ?.events?.emit?.(
        eventName,
        payload
      );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[Auth]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[Auth]",
      ...args
    );
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

function safeRun(fn, fallback) {
  return async (...args) => {
    try {
      if (typeof fn !== "function") {
        return fallback;
      }

      return await Promise.resolve(
        fn(...args)
      );
    } catch (error) {
      safeWarn(error);

      return {
        ...(fallback || {}),
        ok: false,
        error,
        message:
          extractMessage?.(error) ||
          String(error),
      };
    }
  };
}

function afterPaint(callback) {
  if (typeof callback !== "function") {
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
      value.replace(/\/+$/g, "") || "/";
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

  return safeText(
    window.__ONION_INITIAL_URL__,
    ""
  );
}

function getActivationInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__,
    ""
  );
}

function getResetConfirmInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_RESET_CONFIRM_INITIAL_URL__,
    ""
  );
}

function hasTokenInSearch(search = "", names = ACTIVATION_TOKEN_PARAM_NAMES) {
  try {
    const params =
      new URLSearchParams(search || "");

    return names.some(
      (name) =>
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

function isPublicTechnicalRoute(path = "/") {
  return PUBLIC_TECHNICAL_ROUTES.has(
    stripSearchAndHash(path)
  );
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
    typeof extractPathTokenFn === "function" &&
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
        parsed.hash.split("?").slice(1).join("?");

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
        path.split("?").slice(1).join("?");

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
    routePath: ACTIVATION_PATH,
    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
    extractPathTokenFn: extractActivationPathToken,
  });
}

function hasResetConfirmToken(value = "") {
  return hasTechnicalRouteToken({
    value,
    routePath: RESET_CONFIRM_PATH,
    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
    extractPathTokenFn: extractResetConfirmPathToken,
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

function normalizeRestoreOptions(...args) {
  /*
    Compatibilidad legacy:
    - Auth.restoreSession()
    - Auth.restoreSession(options)
    - Auth.restoreSession(session, options)

    IMPORTANTE:
    No pasamos el runtime session como primer argumento a restore.js,
    porque restore.js espera options como primer argumento en el flujo nuevo.
  */

  const first =
    args[0];

  const second =
    args[1];

  const firstLooksRuntimeSession =
    Boolean(
      first &&
      typeof first === "object" &&
      (
        Object.prototype.hasOwnProperty.call(first, "checking") ||
        Object.prototype.hasOwnProperty.call(first, "refreshing") ||
        Object.prototype.hasOwnProperty.call(first, "restoring") ||
        Object.prototype.hasOwnProperty.call(first, "restorePromise") ||
        Object.prototype.hasOwnProperty.call(first, "refreshPromise") ||
        Object.prototype.hasOwnProperty.call(first, "mePromise") ||
        Object.prototype.hasOwnProperty.call(first, "loginPromise")
      )
    );

  const baseOptions =
    firstLooksRuntimeSession
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
  };
}

/* =========================================================
   LOGIN RESULT HARDENING
========================================================= */

function getNestedAuthData(raw = {}) {
  const data =
    safeObject(raw.data);

  const payload =
    safeObject(raw.payload);

  const result =
    safeObject(raw.result);

  const body =
    safeObject(raw.body);

  const sessionData =
    pickFirstObject(
      raw.session,
      raw.sessionData,
      data.session,
      data.sessionData,
      payload.session,
      payload.sessionData,
      result.session,
      result.sessionData,
      body.session,
      body.sessionData
    ) || {};

  const authData =
    pickFirstObject(
      raw.auth,
      raw.authData,
      data.auth,
      data.authData,
      payload.auth,
      payload.authData,
      result.auth,
      result.authData,
      body.auth,
      body.authData
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
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  };
}

function extractLoginToken(result = {}) {
  const raw =
    safeObject(result);

  const {
    data,
    payload,
    result: resultData,
    body,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    raw.token,
    raw.accessToken,
    raw.access_token,
    raw.authToken,
    raw.auth_token,
    raw.jwt,
    raw.idToken,
    raw.id_token,

    data.token,
    data.accessToken,
    data.access_token,
    data.authToken,
    data.auth_token,
    data.jwt,
    data.idToken,
    data.id_token,

    payload.token,
    payload.accessToken,
    payload.access_token,
    payload.authToken,
    payload.auth_token,
    payload.jwt,

    resultData.token,
    resultData.accessToken,
    resultData.access_token,
    resultData.authToken,
    resultData.auth_token,
    resultData.jwt,

    body.token,
    body.accessToken,
    body.access_token,
    body.authToken,
    body.auth_token,
    body.jwt,

    sessionData.token,
    sessionData.accessToken,
    sessionData.access_token,
    sessionData.authToken,
    sessionData.auth_token,
    sessionData.jwt,

    authData.token,
    authData.accessToken,
    authData.access_token,
    authData.authToken,
    authData.auth_token,
    authData.jwt,

    nestedSessionData.token,
    nestedSessionData.accessToken,
    nestedSessionData.access_token,
    nestedSessionData.jwt,

    nestedAuthData.token,
    nestedAuthData.accessToken,
    nestedAuthData.access_token,
    nestedAuthData.jwt
  );
}

function extractLoginRefreshToken(result = {}) {
  const raw =
    safeObject(result);

  const {
    data,
    payload,
    result: resultData,
    body,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    raw.refreshToken,
    raw.refresh_token,

    data.refreshToken,
    data.refresh_token,

    payload.refreshToken,
    payload.refresh_token,

    resultData.refreshToken,
    resultData.refresh_token,

    body.refreshToken,
    body.refresh_token,

    sessionData.refreshToken,
    sessionData.refresh_token,

    authData.refreshToken,
    authData.refresh_token,

    nestedSessionData.refreshToken,
    nestedSessionData.refresh_token,

    nestedAuthData.refreshToken,
    nestedAuthData.refresh_token
  );
}

function extractLoginUser(result = {}) {
  const raw =
    safeObject(result);

  const {
    data,
    payload,
    result: resultData,
    body,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstObject(
    raw.user,
    raw.usuario,
    raw.account,
    raw.profile,
    raw.me,

    data.user,
    data.usuario,
    data.account,
    data.profile,
    data.me,

    payload.user,
    payload.usuario,
    payload.account,
    payload.profile,
    payload.me,

    resultData.user,
    resultData.usuario,
    resultData.account,
    resultData.profile,
    resultData.me,

    body.user,
    body.usuario,
    body.account,
    body.profile,
    body.me,

    sessionData.user,
    sessionData.usuario,
    sessionData.account,
    sessionData.profile,
    sessionData.me,

    authData.user,
    authData.usuario,
    authData.account,
    authData.profile,
    authData.me,

    nestedSessionData.user,
    nestedSessionData.usuario,
    nestedSessionData.account,
    nestedSessionData.profile,
    nestedSessionData.me,

    nestedAuthData.user,
    nestedAuthData.usuario,
    nestedAuthData.account,
    nestedAuthData.profile,
    nestedAuthData.me
  );
}

function extractLoginStatus(result = {}) {
  const raw =
    safeObject(result);

  const {
    data,
    payload,
    result: resultData,
    body,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstValue(
    raw.status,
    raw.statusCode,
    raw.status_code,

    data.status,
    data.statusCode,
    data.status_code,

    payload.status,
    payload.statusCode,
    payload.status_code,

    resultData.status,
    resultData.statusCode,
    resultData.status_code,

    body.status,
    body.statusCode,
    body.status_code,

    sessionData.status,
    sessionData.statusCode,
    sessionData.status_code,

    authData.status,
    authData.statusCode,
    authData.status_code,

    nestedSessionData.status,
    nestedSessionData.statusCode,
    nestedSessionData.status_code,

    nestedAuthData.status,
    nestedAuthData.statusCode,
    nestedAuthData.status_code
  );
}

function extractLoginCode(result = {}) {
  const raw =
    safeObject(result);

  const {
    data,
    payload,
    result: resultData,
    body,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    raw.code,
    raw.errorCode,
    raw.error_code,
    raw.error,

    data.code,
    data.errorCode,
    data.error_code,
    data.error,

    payload.code,
    payload.errorCode,
    payload.error_code,
    payload.error,

    resultData.code,
    resultData.errorCode,
    resultData.error_code,
    resultData.error,

    body.code,
    body.errorCode,
    body.error_code,
    body.error,

    sessionData.code,
    sessionData.errorCode,
    sessionData.error_code,
    sessionData.error,

    authData.code,
    authData.errorCode,
    authData.error_code,
    authData.error,

    nestedSessionData.code,
    nestedSessionData.errorCode,
    nestedSessionData.error_code,
    nestedSessionData.error,

    nestedAuthData.code,
    nestedAuthData.errorCode,
    nestedAuthData.error_code,
    nestedAuthData.error
  );
}

function extractLoginMessage(result = {}) {
  const raw =
    safeObject(result);

  const {
    data,
    payload,
    result: resultData,
    body,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    raw.message,
    raw.mensaje,
    raw.errorMessage,
    raw.error_message,

    data.message,
    data.mensaje,
    data.errorMessage,
    data.error_message,

    payload.message,
    payload.mensaje,
    payload.errorMessage,
    payload.error_message,

    resultData.message,
    resultData.mensaje,
    resultData.errorMessage,
    resultData.error_message,

    body.message,
    body.mensaje,
    body.errorMessage,
    body.error_message,

    sessionData.message,
    sessionData.mensaje,
    sessionData.errorMessage,
    sessionData.error_message,

    authData.message,
    authData.mensaje,
    authData.errorMessage,
    authData.error_message,

    nestedSessionData.message,
    nestedSessionData.mensaje,

    nestedAuthData.message,
    nestedAuthData.mensaje
  );
}

function extractLoginTempToken(result = {}) {
  const raw =
    safeObject(result);

  const {
    data,
    payload,
    result: resultData,
    body,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    raw.tempToken,
    raw.temp_token,
    raw.temporaryToken,
    raw.temporary_token,
    raw.twoFactorToken,
    raw.two_factor_token,
    raw.mfaToken,
    raw.mfa_token,

    data.tempToken,
    data.temp_token,
    data.temporaryToken,
    data.temporary_token,
    data.twoFactorToken,
    data.two_factor_token,
    data.mfaToken,
    data.mfa_token,

    payload.tempToken,
    payload.temp_token,
    payload.temporaryToken,
    payload.temporary_token,
    payload.twoFactorToken,
    payload.two_factor_token,
    payload.mfaToken,
    payload.mfa_token,

    resultData.tempToken,
    resultData.temp_token,
    resultData.temporaryToken,
    resultData.temporary_token,
    resultData.twoFactorToken,
    resultData.two_factor_token,
    resultData.mfaToken,
    resultData.mfa_token,

    body.tempToken,
    body.temp_token,
    body.temporaryToken,
    body.temporary_token,
    body.twoFactorToken,
    body.two_factor_token,
    body.mfaToken,
    body.mfa_token,

    sessionData.tempToken,
    sessionData.temp_token,
    sessionData.temporaryToken,
    sessionData.temporary_token,
    sessionData.twoFactorToken,
    sessionData.two_factor_token,
    sessionData.mfaToken,
    sessionData.mfa_token,

    authData.tempToken,
    authData.temp_token,
    authData.temporaryToken,
    authData.temporary_token,
    authData.twoFactorToken,
    authData.two_factor_token,
    authData.mfaToken,
    authData.mfa_token,

    nestedSessionData.tempToken,
    nestedSessionData.temp_token,
    nestedSessionData.temporaryToken,
    nestedSessionData.temporary_token,

    nestedAuthData.tempToken,
    nestedAuthData.temp_token,
    nestedAuthData.temporaryToken,
    nestedAuthData.temporary_token
  );
}

function extractLoginRedirectTo(result = {}) {
  const raw =
    safeObject(result);

  const {
    data,
    payload,
    result: resultData,
    body,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    raw.redirectTo,
    raw.redirect_to,
    raw.redirect,
    raw.next,
    raw.nextPath,
    raw.next_path,

    data.redirectTo,
    data.redirect_to,
    data.redirect,
    data.next,
    data.nextPath,
    data.next_path,

    payload.redirectTo,
    payload.redirect_to,
    payload.redirect,
    payload.next,
    payload.nextPath,
    payload.next_path,

    resultData.redirectTo,
    resultData.redirect_to,
    resultData.redirect,
    resultData.next,
    resultData.nextPath,
    resultData.next_path,

    body.redirectTo,
    body.redirect_to,
    body.redirect,
    body.next,
    body.nextPath,
    body.next_path,

    sessionData.redirectTo,
    sessionData.redirect_to,
    sessionData.redirect,

    authData.redirectTo,
    authData.redirect_to,
    authData.redirect,

    nestedSessionData.redirectTo,
    nestedSessionData.redirect_to,
    nestedSessionData.redirect,

    nestedAuthData.redirectTo,
    nestedAuthData.redirect_to,
    nestedAuthData.redirect
  );
}

function hasUsableToken(token = "") {
  return Boolean(
    safeText(token, "")
  );
}

function hasUsableUser(user = {}) {
  if (!isPlainObject(user)) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
    safeText(user.userId, "") ||
    safeText(user._id, "") ||
    safeText(user.uid, "") ||
    safeText(user.username, "") ||
    safeText(user.email, "") ||
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
    body.success === false
  ) {
    return true;
  }

  return false;
}

function isLogin2FARequired(result = {}, tempToken = "") {
  const raw =
    safeObject(result);

  const {
    data,
    payload,
    result: resultData,
    body,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

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

    normalizeBoolean(data.requires2FA, false) ||
    normalizeBoolean(data.require2FA, false) ||
    normalizeBoolean(data.requiresTwoFactor, false) ||
    normalizeBoolean(data.twoFactorRequired, false) ||
    normalizeBoolean(data.mfaRequired, false) ||
    normalizeBoolean(data.requiresMfa, false) ||

    normalizeBoolean(payload.requires2FA, false) ||
    normalizeBoolean(payload.require2FA, false) ||
    normalizeBoolean(payload.requiresTwoFactor, false) ||
    normalizeBoolean(payload.twoFactorRequired, false) ||
    normalizeBoolean(payload.mfaRequired, false) ||
    normalizeBoolean(payload.requiresMfa, false) ||

    normalizeBoolean(resultData.requires2FA, false) ||
    normalizeBoolean(resultData.require2FA, false) ||
    normalizeBoolean(resultData.requiresTwoFactor, false) ||
    normalizeBoolean(resultData.twoFactorRequired, false) ||
    normalizeBoolean(resultData.mfaRequired, false) ||
    normalizeBoolean(resultData.requiresMfa, false) ||

    normalizeBoolean(body.requires2FA, false) ||
    normalizeBoolean(body.require2FA, false) ||
    normalizeBoolean(body.requiresTwoFactor, false) ||
    normalizeBoolean(body.twoFactorRequired, false) ||
    normalizeBoolean(body.mfaRequired, false) ||
    normalizeBoolean(body.requiresMfa, false) ||

    normalizeBoolean(sessionData.requires2FA, false) ||
    normalizeBoolean(sessionData.twoFactorRequired, false) ||
    normalizeBoolean(sessionData.mfaRequired, false) ||

    normalizeBoolean(authData.requires2FA, false) ||
    normalizeBoolean(authData.twoFactorRequired, false) ||
    normalizeBoolean(authData.mfaRequired, false) ||

    normalizeBoolean(nestedSessionData.requires2FA, false) ||
    normalizeBoolean(nestedSessionData.twoFactorRequired, false) ||

    normalizeBoolean(nestedAuthData.requires2FA, false) ||
    normalizeBoolean(nestedAuthData.twoFactorRequired, false) ||

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
    raw: result,

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

  error.status =
    normalized.status || 401;

  error.data = {
    code:
      normalized.code ||
      "INVALID_LOGIN_SESSION",

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
    clean.type,
    clean.userType,
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

    ok: true,
    authenticated: true,

    token,
    accessToken: token,
    access_token: token,

    refreshToken:
      refreshToken || raw.refreshToken || raw.refresh_token || null,

    refresh_token:
      refreshToken || raw.refresh_token || raw.refreshToken || null,

    user,
    usuario: user,

    role,
    rol: role,

    source: "Auth.login",
  };

  try {
    if (typeof applySession === "function") {
      applySession(sessionPayload);
    }
  } catch (error) {
    safeWarn(
      "applySession no pudo aplicar sesión post-login.",
      error
    );
  }

  try {
    AppCore?.applySession?.(
      sessionPayload
    );
  } catch {}

  try {
    AppCore?.setState?.({
      authenticated: true,
      user,
      currentUser: user,
      sessionUser: user,
      authUser: user,

      role,
      userRole: role,

      token,
      accessToken: token,

      session: {
        ...(safeObject(AppCore?.state?.session)),
        authenticated: true,
        user,
        role,
        token,
        accessToken: token,
        refreshToken:
          sessionPayload.refreshToken || null,
      },

      lastLoginAt:
        new Date().toISOString(),

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
        AppCore.state.user = user;
        AppCore.state.currentUser = user;
        AppCore.state.sessionUser = user;
        AppCore.state.authUser = user;
        AppCore.state.role = role;
        AppCore.state.userRole = role;
        AppCore.state.token = token;
        AppCore.state.accessToken = token;
        AppCore.state.session = {
          ...(safeObject(AppCore.state.session)),
          authenticated: true,
          user,
          role,
          token,
          accessToken: token,
          refreshToken:
            sessionPayload.refreshToken || null,
        };
      }
    } catch {}
  }

  return {
    user,
    role,
    token,
    refreshToken:
      sessionPayload.refreshToken || null,
    sessionPayload,
  };
}

function emitAcceptedLoginEvents({
  normalized = {},
  committed = {},
  durationMs = 0,
  phase = "sync",
} = {}) {
  const user =
    committed.user ||
    normalized.user ||
    null;

  const role =
    committed.role ||
    extractRoleFromUser(user || {});

  const payload = {
    durationMs,
    user,
    role,
    authenticated: true,
    source: "Auth",
    reason: "login-success",
    phase,
    redirectTo:
      normalized.redirectTo || null,
  };

  emit(
    "auth:login:success",
    payload
  );

  emit(
    "auth:session:applied",
    payload
  );

  emit(
    "auth:session:restored",
    {
      ...payload,
      reason: "login-session-applied",
    }
  );

  emit(
    "app:session:restored",
    {
      ...payload,
      reason: "login-session-applied",
    }
  );

  emit(
    "app:user:change",
    payload
  );

  emit(
    "app:auth:ready",
    payload
  );

  emit(
    "app:ui:repair-request",
    {
      ...payload,
      reason: "auth-login-success",
    }
  );
}

function schedulePostLoginRepair({
  normalized = {},
  committed = {},
  durationMs = 0,
} = {}) {
  afterPaint(() => {
    emitAcceptedLoginEvents({
      normalized,
      committed,
      durationMs,
      phase: "after-paint",
    });

    emit(
      "app:ui:repair",
      {
        reason: "auth-login-after-paint",
        authenticated: true,
        user: committed.user || normalized.user || null,
        role: committed.role || null,
        source: "Auth",
      }
    );
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

    "auth_token",
    "access_token",
    "refresh_token",
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

function clearRejectedLoginState(reason = "login_rejected") {
  try {
    clearSessionLocal?.();
  } catch {}

  try {
    AppCore?.clearSession?.();
  } catch {}

  try {
    AppCore?.session?.clear?.();
  } catch {}

  try {
    AppCore?.setState?.({
      authenticated: false,
      user: null,
      currentUser: null,
      sessionUser: null,
      authUser: null,
      role: null,
      userRole: null,
      token: null,
      accessToken: null,
      session: null,
      sessionId: null,
    });
  } catch {
    try {
      if (AppCore?.state) {
        AppCore.state.authenticated = false;
        AppCore.state.user = null;
        AppCore.state.currentUser = null;
        AppCore.state.sessionUser = null;
        AppCore.state.authUser = null;
        AppCore.state.role = null;
        AppCore.state.userRole = null;
        AppCore.state.token = null;
        AppCore.state.accessToken = null;
        AppCore.state.session = null;
        AppCore.state.sessionId = null;
      }
    } catch {}
  }

  clearKnownAuthStorageAfterRejectedLogin();

  emit(
    "auth:login:rejected",
    {
      reason,
      source: "Auth",
    }
  );

  emit(
    "app:user:change",
    {
      reason,
      authenticated: false,
      user: null,
      source: "Auth",
    }
  );
}

/* =========================================================
   METRICS
========================================================= */

function setRuntimeFlag(session, type, value) {
  if (!session) {
    return;
  }

  if (type === "login") {
    session.loggingIn = Boolean(value);
  }

  if (type === "restore") {
    session.restoring = Boolean(value);
  }

  if (type === "refresh") {
    session.refreshing = Boolean(value);
  }

  if (type === "me") {
    session.checking = Boolean(value);
  }
}

function markRuntimeSuccess(session, type) {
  if (!session) {
    return;
  }

  const now =
    nowMs();

  if (type === "login") {
    session.lastLoginAt = now;
  }

  if (type === "restore") {
    session.lastRestoreAt = now;
  }

  if (type === "refresh") {
    session.lastRefreshAt = now;
  }

  if (type === "me") {
    session.lastCheckAt = now;
  }
}

function withMetric(session, type, executor) {
  return async (...args) => {
    const startedAt =
      nowMs();

    setRuntimeFlag(
      session,
      type,
      true
    );

    emit(
      `auth:${type}:start`,
      {}
    );

    try {
      const result =
        await executor(...args);

      markRuntimeSuccess(
        session,
        type
      );

      emit(
        `auth:${type}:success`,
        {
          durationMs:
            nowMs() - startedAt,
          ok:
            result?.ok !== false,
        }
      );

      return result;
    } catch (error) {
      session.lastError = {
        type,
        message:
          extractMessage?.(error) ||
          String(error),
        at:
          new Date().toISOString(),
      };

      emit(
        `auth:${type}:error`,
        {
          durationMs:
            nowMs() - startedAt,
          error:
            session.lastError,
        }
      );

      throw error;
    } finally {
      setRuntimeFlag(
        session,
        type,
        false
      );
    }
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

  const runFetchMe =
    withMetric(
      session,
      "me",
      safeRun(
        (sessionArg = session) =>
          fetchMe(sessionArg),
        {
          ok: false,
          user: null,
        }
      )
    );

  const runRefreshSession =
    withMetric(
      session,
      "refresh",
      safeRun(
        (sessionArg = session) =>
          refreshSession(sessionArg),
        {
          ok: false,
        }
      )
    );

  const runRestoreSession =
    withMetric(
      session,
      "restore",
      safeRun(
        (options = {}) =>
          restoreSessionCore(options),
        {
          ok: false,
          user: null,
        }
      )
    );

  async function loginPublic(payload = {}, options = {}) {
    if (session.loginPromise) {
      return session.loginPromise;
    }

    const startedAt =
      nowMs();

    session.loggingIn = true;

    emit(
      "auth:login:start",
      {
        source: "Auth",
      }
    );

    session.loginPromise = (async () => {
      try {
        const result =
          await Promise.resolve(
            coreLogin(payload, options)
          );

        const normalized =
          normalizePublicLoginResult(result);

        if (normalized.requires2FA) {
          markRuntimeSuccess(
            session,
            "login"
          );

          emit(
            "auth:login:2fa-required",
            {
              durationMs:
                nowMs() - startedAt,
              redirectTo:
                normalized.redirectTo || null,
              source: "Auth",
            }
          );

          return result;
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

        session.loginFailCount = 0;

        const durationMs =
          nowMs() - startedAt;

        emitAcceptedLoginEvents({
          normalized,
          committed,
          durationMs,
          phase: "sync",
        });

        schedulePostLoginRepair({
          normalized,
          committed,
          durationMs,
        });

        return result;
      } catch (error) {
        session.loginFailCount =
          Number(session.loginFailCount || 0) + 1;

        session.lastError = {
          type: "login",
          message:
            extractMessage?.(error) ||
            String(error),
          at:
            new Date().toISOString(),
        };

        clearRejectedLoginState(
          "login_error"
        );

        emit(
          "auth:login:error",
          {
            durationMs:
              nowMs() - startedAt,
            error:
              session.lastError,
            source:
              "Auth",
          }
        );

        throw error;
      } finally {
        session.loggingIn = false;
        session.loginPromise = null;
      }
    })();

    return session.loginPromise;
  }

  async function handleLoginFormSubmitPublic(...args) {
    /*
      Wrapper defensivo:
      si login.js devuelve payload de login, lo endurecemos igual que Auth.login.
      Si login.js ya navega/aplica sesión internamente, este wrapper no rompe.
    */

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
          durationMs: 0,
          phase: "form-submit-wrapper",
        });

        schedulePostLoginRepair({
          normalized,
          committed,
          durationMs: 0,
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

  /* =======================================================
     SNAPSHOT DEBUG
  ======================================================= */

  function getAuthModuleSnapshot() {
    const routeContext =
      getCurrentRouteContext();

    return {
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

      sessionDebug:
        safeCall(
          getSessionDebugSnapshot,
          null
        ),

      routeContext,

      storage: {
        hasRefreshToken:
          hasRefreshToken(),

        hasRefreshContext:
          hasRefreshContext(),

        refreshToken:
          getStoredRefreshToken() ||
          null,

        tempToken:
          getStoredTempToken() ||
          null,

        sessionId:
          getStoredSessionId() ||
          null,

        sessionUserId:
          getStoredSessionUserId() ||
          null,
      },

      passwordReset: {
        hasRequestPasswordReset:
          typeof requestPasswordReset === "function",

        hasConfirmResetPassword:
          typeof resolveConfirmResetPasswordHandler() === "function",
      },
    };
  }

  function restoreSessionPublic(...args) {
    const options =
      normalizeRestoreOptions(
        ...args
      );

    return runRestoreSession(
      options
    );
  }

  function fetchMePublic(sessionArg = session) {
    return runFetchMe(
      sessionArg || session
    );
  }

  function refreshSessionPublic(sessionArg = session) {
    return runRefreshSession(
      sessionArg || session
    );
  }

  function clearSessionPublic() {
    clearRejectedLoginState(
      "manual_clear"
    );

    return true;
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

    /* DEBUG */
    getAuthModuleSnapshot,
  });
})();

export default Auth;
