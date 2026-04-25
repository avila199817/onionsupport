/* =========================================================
   Onion SPA - Auth Session
   Archivo: src/features/auth/session.js

   RESPONSABILIDADES:
   - aplicar sesión autenticada sobre AppCore
   - limpiar sesión local y storage auxiliar
   - exponer helpers auth de estado / rol
   - construir snapshots consistentes
   - exponer Authorization header
   - endurecer sync con AppCore.state
   - evitar estados auth fantasma
   - preservar route/publicPath en rutas públicas técnicas
   - no romper /activate-account?token=... durante restore/clear

   HARDENING EXTREMO:
   - estado derivado robusto
   - persistencia ordenada
   - sync UI seguro
   - helpers enterprise
   - cero estados partidos
   - emisiones sólo cuando cambian datos
   - fingerprint robusto
   - token/user desacoplados sin corrupción
   - clearSessionLocal compatible con preserveRoute
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  extractMessage,
} from "./helpers.js";

import {
  normalizeUser,
} from "./normalize.js";

import {
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
  persistAuxSessionData,
  persistRefreshToken,
  persistTempToken,
  persistSessionContext,
  clearAuthStorage,
} from "./storage.js";

/* =========================================================
   CONSTANTS
========================================================= */

const PUBLIC_TECHNICAL_ROUTES = new Set([
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
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

function safeBool(value) {
  return value === true;
}

function nowMs() {
  return Date.now();
}

function safeEmit(
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthSession]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AuthSession]",
      ...args
    );
  } catch {}
}

function ensureCoreState() {
  if (
    !AppCore.state ||
    typeof AppCore.state !== "object"
  ) {
    AppCore.state = {};
  }

  return AppCore.state;
}

function safeSetState(
  patch = {}
) {
  try {
    AppCore?.setState?.(patch);
  } catch {}

  try {
    Object.assign(
      ensureCoreState(),
      patch
    );
  } catch {}
}

function hasOwn(obj, key) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(
        obj,
        key
      )
  );
}

/* =========================================================
   PATH / ROUTE PRESERVATION
========================================================= */

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
      (
        hash.startsWith("#/") ||
        hash.startsWith("#!")
      )
    ) {
      if (hash.startsWith("#!")) {
        return normalizePathnameOnly(
          hash.replace(/^#!\/?/, "/")
        );
      }

      return hash.replace(/^#\/?/, "/");
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function isPublicTechnicalRoute(path = "/") {
  return PUBLIC_TECHNICAL_ROUTES.has(
    stripSearchAndHash(path)
  );
}

function shouldPreserveRoute(options = {}) {
  if (
    options.preserveRoute === true ||
    options.preserveCurrentRoute === true
  ) {
    return true;
  }

  const state =
    ensureCoreState();

  const publicPath =
    safeText(
      options.publicPath ||
        state.publicPath ||
        getBrowserPublicPath(),
      ""
    );

  const route =
    safeText(
      options.route ||
        state.route ||
        stripSearchAndHash(publicPath),
      ""
    );

  return (
    isPublicTechnicalRoute(route) ||
    isPublicTechnicalRoute(publicPath)
  );
}

function captureRouteContext(options = {}) {
  const state =
    ensureCoreState();

  const browserPath =
    getBrowserPublicPath();

  const publicPath =
    safeText(
      options.publicPath,
      ""
    ) ||
    safeText(
      state.publicPath,
      ""
    ) ||
    browserPath ||
    "/";

  const route =
    safeText(
      options.route,
      ""
    ) ||
    safeText(
      state.route,
      ""
    ) ||
    stripSearchAndHash(publicPath) ||
    "/";

  return {
    preserve:
      shouldPreserveRoute({
        ...options,
        route,
        publicPath,
      }),

    route:
      stripSearchAndHash(route || publicPath || "/"),

    publicPath:
      publicPath || route || "/",

    lastRoute:
      safeText(
        state.lastRoute,
        ""
      ),

    browserPath,
  };
}

function restoreRouteContext(context = {}) {
  if (!context?.preserve) {
    return false;
  }

  const route =
    stripSearchAndHash(
      context.route ||
        context.publicPath ||
        "/"
    );

  const publicPath =
    safeText(
      context.publicPath,
      route
    );

  try {
    AppCore?.setRoute?.(route);
  } catch {}

  try {
    AppCore?.setPublicPath?.(publicPath);
  } catch {}

  safeSetState({
    route,
    publicPath,
    lastRoute:
      context.lastRoute || route,
  });

  return true;
}

/* =========================================================
   AUTH STATE
========================================================= */

function resolveRoleFromUser(user = null) {
  return safeText(
    user?.role ??
      user?.rol ??
      user?.type ??
      user?.perfil ??
      "",
    ""
  ).toLowerCase();
}

function resolveAuthenticated(state) {
  return Boolean(
    safeText(state?.token)
  );
}

function syncDerivedState() {
  const state =
    ensureCoreState();

  state.authenticated =
    resolveAuthenticated(state);

  state.role =
    state.authenticated
      ? resolveRoleFromUser(state.user)
      : "";

  return state;
}

function safeSyncUserUI() {
  try {
    AppCore?.syncUserUI?.();
  } catch {}
}

function safeSetToken(token = null) {
  if (
    typeof AppCore?.setToken === "function"
  ) {
    try {
      AppCore.setToken(
        token || null
      );
      return;
    } catch {}
  }

  safeSetState({
    token:
      token || null,
  });
}

function safeSetUser(user = null) {
  if (
    typeof AppCore?.setUser === "function"
  ) {
    try {
      AppCore.setUser(
        user || null
      );
      return;
    } catch {}
  }

  safeSetState({
    user:
      user || null,
  });
}

function resolveThemeFromUser(user = null) {
  if (
    !user ||
    typeof user !== "object"
  ) {
    return null;
  }

  const explicitTheme =
    String(
      user.theme ??
        user?.preferences?.theme ??
        user?.settings?.theme ??
        user?.raw?.theme ??
        user?.raw?.preferences?.theme ??
        user?.raw?.settings?.theme ??
        ""
    )
      .trim()
      .toLowerCase();

  if (
    explicitTheme === "light" ||
    explicitTheme === "dark"
  ) {
    return explicitTheme;
  }

  const hasExplicitDarkMode =
    hasOwn(user, "darkMode") ||
    hasOwn(user, "dark_mode") ||
    hasOwn(user?.raw, "darkMode") ||
    hasOwn(user?.raw, "dark_mode") ||
    hasOwn(user?.preferences, "darkMode") ||
    hasOwn(user?.settings, "darkMode") ||
    hasOwn(user?.raw?.preferences, "darkMode") ||
    hasOwn(user?.raw?.settings, "darkMode");

  if (
    hasExplicitDarkMode &&
    typeof user.darkMode === "boolean"
  ) {
    return user.darkMode
      ? "dark"
      : "light";
  }

  return null;
}

function applyThemeFromUser(user = null) {
  const theme =
    resolveThemeFromUser(user);

  if (
    theme !== "light" &&
    theme !== "dark"
  ) {
    return null;
  }

  try {
    AppCore?.setTheme?.(theme);
  } catch {}

  return theme;
}

function safeClearSession(context = {}) {
  if (
    typeof AppCore?.clearSession === "function"
  ) {
    try {
      AppCore.clearSession();
      restoreRouteContext(context);
      return;
    } catch (error) {
      safeWarn(
        "AppCore.clearSession() falló.",
        error
      );
    }
  }

  safeSetState({
    token: null,
    user: null,
    role: "",
    authenticated: false,
  });

  restoreRouteContext(context);
}

function getCurrentStateSnapshotBase() {
  const state =
    ensureCoreState();

  syncDerivedState();

  return {
    authenticated:
      Boolean(state.authenticated),

    token:
      state.token || null,

    user:
      state.user || null,

    role:
      state.role || null,

    route:
      state.route || "/",

    publicPath:
      state.publicPath || "/",
  };
}

/* =========================================================
   FINGERPRINT
========================================================= */

function buildSessionFingerprint(
  snapshot = {}
) {
  const user =
    snapshot?.user || {};

  return JSON.stringify({
    authenticated:
      Boolean(snapshot.authenticated),

    token:
      safeText(snapshot.token),

    role:
      safeText(snapshot.role),

    refreshToken:
      safeText(snapshot.refreshToken),

    sessionId:
      safeText(snapshot.sessionId),

    sessionUserId:
      safeText(snapshot.sessionUserId),

    userId:
      user.id ||
      user.userId ||
      user.user_id ||
      null,

    username:
      user.username ||
      user.userName ||
      user.email ||
      null,
  });
}

function emitSessionState({
  reason = "unknown",
  before = null,
  after = null,
  durationMs = 0,
} = {}) {
  safeEmit(
    "auth:session:state",
    {
      reason,
      before,
      after,
      changed:
        buildSessionFingerprint(before) !==
        buildSessionFingerprint(after),
      durationMs,
      timestamp: nowMs(),
      at: new Date().toISOString(),
    }
  );
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function buildSessionSnapshot(
  extra = {}
) {
  const base =
    getCurrentStateSnapshotBase();

  return {
    ...base,

    refreshToken:
      getStoredRefreshToken() || null,

    sessionId:
      getStoredSessionId() || null,

    sessionUserId:
      getStoredSessionUserId() || null,

    ...extra,
  };
}

/* =========================================================
   APPLY SESSION
========================================================= */

export function applySession({
  token = undefined,
  user = undefined,
  refreshToken = undefined,
  tempToken = undefined,
  sessionData = undefined,
} = {}) {
  const startedAt =
    nowMs();

  const before =
    buildSessionSnapshot();

  const normalizedUser =
    user === undefined
      ? undefined
      : normalizeUser(user);

  if (token !== undefined) {
    safeSetToken(
      token || null
    );
  }

  if (user !== undefined) {
    safeSetUser(
      normalizedUser || null
    );
  }

  if (refreshToken !== undefined) {
    persistRefreshToken(
      refreshToken || null
    );
  }

  if (tempToken !== undefined) {
    persistTempToken(
      tempToken || null
    );
  }

  const effectiveUser =
    normalizedUser === undefined
      ? ensureCoreState().user || null
      : normalizedUser;

  if (sessionData !== undefined) {
    persistSessionContext(
      sessionData || null,
      effectiveUser
    );
  }

  persistAuxSessionData(
    effectiveUser
  );

  applyThemeFromUser(
    effectiveUser
  );

  syncDerivedState();

  safeSyncUserUI();

  const after =
    buildSessionSnapshot();

  emitSessionState({
    reason: "apply",
    before,
    after,
    durationMs:
      nowMs() - startedAt,
  });

  if (
    buildSessionFingerprint(before) !==
    buildSessionFingerprint(after)
  ) {
    safeEmit(
      "auth:session:applied",
      after
    );

    safeEmit(
      "app:user:change",
      after
    );
  }

  return after;
}

/* =========================================================
   CLEAR SESSION LOCAL
========================================================= */

export function clearSessionLocal(
  options = {}
) {
  const {
    silent = false,
  } = options;

  const startedAt =
    nowMs();

  const routeContext =
    captureRouteContext(options);

  const before =
    buildSessionSnapshot({
      routeContext,
    });

  const hadData =
    Boolean(before.token) ||
    Boolean(before.user) ||
    Boolean(before.refreshToken) ||
    Boolean(before.sessionId) ||
    Boolean(before.sessionUserId);

  safeClearSession(routeContext);

  try {
    clearAuthStorage();
  } catch (error) {
    safeWarn(
      "clearAuthStorage() falló.",
      error
    );
  }

  restoreRouteContext(routeContext);

  syncDerivedState();

  restoreRouteContext(routeContext);

  safeSyncUserUI();

  const after =
    buildSessionSnapshot({
      routeContext,
    });

  if (
    !safeBool(silent) &&
    hadData
  ) {
    safeEmit(
      "auth:session:cleared",
      after
    );

    safeEmit(
      "app:user:change",
      after
    );
  }

  emitSessionState({
    reason:
      safeBool(silent)
        ? "clear:silent"
        : "clear",
    before,
    after,
    durationMs:
      nowMs() - startedAt,
  });

  return true;
}

/* =========================================================
   HELPERS AUTH
========================================================= */

export function isAuthenticated() {
  const state =
    ensureCoreState();

  syncDerivedState();

  return Boolean(
    state.authenticated &&
      safeText(state.token)
  );
}

export function getCurrentRole() {
  syncDerivedState();

  return safeText(
    ensureCoreState().role
  ).toLowerCase();
}

export function hasRole(...roles) {
  if (!roles.length) {
    return true;
  }

  const currentRole =
    getCurrentRole();

  if (!currentRole) {
    return false;
  }

  return roles
    .flat()
    .map((role) =>
      safeText(role).toLowerCase()
    )
    .filter(Boolean)
    .includes(currentRole);
}

export function requireRole(...roles) {
  return (
    isAuthenticated() &&
    hasRole(...roles)
  );
}

/* =========================================================
   AUTH HEADER
========================================================= */

export function getAuthHeader() {
  const token =
    safeText(
      ensureCoreState().token
    );

  if (!token) {
    return {};
  }

  return {
    Authorization:
      `Bearer ${token}`,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionDebugSnapshot() {
  const snapshot =
    buildSessionSnapshot();

  return {
    authenticated:
      Boolean(snapshot.authenticated),

    role:
      snapshot.role || null,

    username:
      snapshot.user?.username ||
      snapshot.user?.email ||
      snapshot.user?.name ||
      snapshot.user?.nombre ||
      null,

    hasToken:
      Boolean(snapshot.token),

    hasRefreshToken:
      Boolean(snapshot.refreshToken),

    sessionId:
      snapshot.sessionId || null,

    sessionUserId:
      snapshot.sessionUserId || null,

    route:
      snapshot.route || "/",

    publicPath:
      snapshot.publicPath || "/",

    isPublicTechnicalRoute:
      isPublicTechnicalRoute(
        snapshot.route ||
          snapshot.publicPath ||
          "/"
      ),
  };
}

export function buildAuthErrorPayload(error) {
  return {
    error,
    message:
      extractMessage(error),
  };
}

export default {
  applySession,
  clearSessionLocal,
  buildSessionSnapshot,
  isAuthenticated,
  getCurrentRole,
  hasRole,
  requireRole,
  getAuthHeader,
  getSessionDebugSnapshot,
  buildAuthErrorPayload,
};
