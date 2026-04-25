/* =========================================================
   Onion SPA - Auth / Session
   Archivo: src/features/auth/index.js

   RESPONSABILIDADES:
   - punto de entrada del módulo auth
   - composición de login / logout / restore / guards
   - exponer helpers auth para toda la SPA
   - serializar restore / refresh / me
   - mantener compatibilidad con backend heterogéneo
   - exponer aliases públicos estables para auth flows
   - integrar reset-password / forgot-password
   - integrar confirmación de reset-password
   - ofrecer api pública coherente y endurecida
   - preservar rutas públicas técnicas durante restore
   - no romper /activate-account?token=...

   HARDENING EXTREMO:
   - singleton inmutable
   - wrappers robustos
   - snapshot debug enterprise
   - tolerancia total a módulos parciales
   - aliases legacy estables
   - métricas auth enriquecidas
   - no race conditions restore/refresh/me
   - estado runtime consistente
   - restoreSession no pierde options
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
  login,
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

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

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
    if (
      typeof candidate === "function"
    ) {
      return candidate;
    }
  }

  return null;
}

async function confirmResetPassword(
  payload = {}
) {
  const executor =
    resolveConfirmResetPasswordHandler();

  if (
    typeof executor !== "function"
  ) {
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
    restoring: false,
    checking: false,
    refreshing: false,

    lastCheckAt: null,
    lastRefreshAt: null,
    lastRestoreAt: null,

    refreshPromise: null,
    mePromise: null,
    restorePromise: null,

    refreshFailCount: 0,
    refreshBlockedUntil: 0,

    lastError: null,
  };
}

function safeCloneSessionState(
  source = {}
) {
  return {
    restoring:
      Boolean(source.restoring),

    checking:
      Boolean(source.checking),

    refreshing:
      Boolean(source.refreshing),

    lastCheckAt:
      source.lastCheckAt || null,

    lastRefreshAt:
      source.lastRefreshAt || null,

    lastRestoreAt:
      source.lastRestoreAt || null,

    refreshPromise:
      source.refreshPromise || null,

    mePromise:
      source.mePromise || null,

    restorePromise:
      source.restorePromise || null,

    refreshFailCount:
      Number(source.refreshFailCount || 0),

    refreshBlockedUntil:
      Number(source.refreshBlockedUntil || 0),

    lastError:
      source.lastError || null,
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

function safeText(
  value,
  fallback = ""
) {
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

function safeCall(
  fn,
  fallback,
  ...args
) {
  try {
    if (
      typeof fn !== "function"
    ) {
      return fallback;
    }

    return fn(...args);
  } catch {
    return fallback;
  }
}

function emit(
  eventName,
  payload = {}
) {
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

function safeRun(
  fn,
  fallback
) {
  return async (...args) => {
    try {
      if (
        typeof fn !== "function"
      ) {
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

function hasTokenInSearch(search = "") {
  try {
    const params =
      new URLSearchParams(search || "");

    return ACTIVATION_TOKEN_PARAM_NAMES.some(
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

function extractActivationPathToken(path = "") {
  const normalized =
    pathFromUrlLike(path) || path || "";

  const pathname =
    stripSearchAndHash(normalized);

  const parts =
    pathname.split("/").filter(Boolean);

  const index =
    parts.findIndex(
      (part) => part === "activate-account"
    );

  if (
    index >= 0 &&
    parts[index + 1]
  ) {
    try {
      return safeText(
        decodeURIComponent(parts[index + 1]),
        ""
      );
    } catch {
      return safeText(
        parts[index + 1],
        ""
      );
    }
  }

  return "";
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

function hasActivationToken(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  const path =
    pathFromUrlLike(raw) || raw;

  if (
    isActivationRoute(path) &&
    extractActivationPathToken(path)
  ) {
    return true;
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    if (hasTokenInSearch(parsed.search)) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : ""
      );
    }
  } catch {
    if (path.includes("?")) {
      const query =
        path.split("?").slice(1).join("?").split("#")[0];

      if (
        hasTokenInSearch(
          query ? `?${query}` : ""
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
          query ? `?${query}` : ""
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function isActivationTokenScrubbed() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.scrubbedActivationToken
    );
  } catch {
    return false;
  }
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

  const candidates = [
    state.bootActivationInitialUrl,
    activationInitialUrl,
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

  const canonical =
    stripSearchAndHash(publicPath || route || "/");

  const publicTechnical =
    isPublicTechnicalRoute(canonical) ||
    isPublicTechnicalRoute(publicPath) ||
    activationBoot;

  return {
    route:
      canonical || "/",

    publicPath:
      publicPath || "/",

    browserPath,
    initialUrl,
    activationInitialUrl,

    activationBoot,
    publicTechnical,
    activationTokenScrubbed:
      isActivationTokenScrubbed(),
  };
}

function normalizeRestoreOptions(
  ...args
) {
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
        Object.prototype.hasOwnProperty.call(first, "mePromise")
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
      routeContext.activationBoot
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

    route:
      baseOptions.route ||
      routeContext.route,

    publicPath:
      baseOptions.publicPath ||
      routeContext.publicPath,
  };
}

/* =========================================================
   METRICS
========================================================= */

function setRuntimeFlag(
  session,
  type,
  value
) {
  if (!session) {
    return;
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

function markRuntimeSuccess(
  session,
  type
) {
  if (!session) {
    return;
  }

  const now =
    nowMs();

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

function withMetric(
  session,
  type,
  executor
) {
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

  function restoreSessionPublic(
    ...args
  ) {
    const options =
      normalizeRestoreOptions(
        ...args
      );

    return runRestoreSession(
      options
    );
  }

  function fetchMePublic(
    sessionArg = session
  ) {
    return runFetchMe(
      sessionArg || session
    );
  }

  function refreshSessionPublic(
    sessionArg = session
  ) {
    return runRefreshSession(
      sessionArg || session
    );
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
    login,
    logout,
    handleLoginFormSubmit,

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
