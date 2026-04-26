/* =========================================================
   Onion SPA - Auth Guards
   Archivo: src/features/auth/guards.js

   Responsabilidades:
   - exponer helpers auth de estado
   - validar acceso por rol
   - bloquear navegación no autenticada
   - construir redirect seguro al login
   - exponer header Authorization
   - no bloquear rutas públicas técnicas

   HARDENING EXTREMO:
   - sync auth robusto con token real
   - zero ghost auth
   - navegación opcional automática
   - eventos consistentes
   - roles normalizados
   - guards reutilizables SPA/router
   - redirects seguros
   - soporte roles array/string
   - soporte aliases admin/user/superadmin
   - no filtrar token en eventos
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  hasValidToken,
  getCurrentCanonicalPath,
  extractMessage,
} from "./helpers.js";

import {
  buildLoginRedirectPath,
} from "./login.js";

/* =========================================================
   CONSTANTS
========================================================= */

const LOGIN_PATH =
  "/login";

const DEFAULT_HOME_PATH =
  "/";

const PUBLIC_TECHNICAL_PATHS =
  Object.freeze([
    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
  ]);

const ROLE_ALIASES =
  Object.freeze({
    administrador:
      "admin",

    administrator:
      "admin",

    super_admin:
      "superadmin",

    "super-admin":
      "superadmin",

    owner:
      "admin",

    cliente:
      "client",

    customer:
      "client",

    usuario:
      "user",

    soporte:
      "support",

    agent:
      "support",
  });

/* =========================================================
   HELPERS
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

function safeObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function safeEmit(eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      sanitizeGuardPayload(payload)
    );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthGuard]",
      ...args
    );
  } catch {
    try {
      console.warn(
        "[AuthGuard]",
        ...args
      );
    } catch {}
  }
}

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

function sanitizeGuardPayload(payload = {}) {
  const clean =
    safeObject(payload);

  return {
    ...clean,

    path:
      redactTokenInText(clean.path || ""),

    publicPath:
      redactTokenInText(clean.publicPath || ""),

    redirectTo:
      redactTokenInText(clean.redirectTo || ""),

    token:
      undefined,

    accessToken:
      undefined,

    refreshToken:
      undefined,
  };
}

function normalizePathname(path = "/") {
  let value =
    safeText(path, "/")
      .replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value =
    value
      .split("?")[0]
      .split("#")[0]
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") ||
    "/";

  return value;
}

function getCurrentPath() {
  try {
    const canonical =
      getCurrentCanonicalPath?.();

    if (canonical) {
      return normalizePathname(canonical);
    }
  } catch {}

  try {
    const statePath =
      AppCore?.state?.route ||
      AppCore?.state?.publicPath;

    if (statePath) {
      return normalizePathname(statePath);
    }
  } catch {}

  if (isBrowser()) {
    try {
      return normalizePathname(
        `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
      );
    } catch {}
  }

  return "/";
}

function isPublicTechnicalPath(path = "") {
  const clean =
    normalizePathname(path);

  return PUBLIC_TECHNICAL_PATHS.some((publicPath) => {
    const normalized =
      normalizePathname(publicPath);

    return (
      clean === normalized ||
      clean.startsWith(`${normalized}/`)
    );
  });
}

function getRouter() {
  try {
    return (
      AppCore?.modules?.get?.("router") ||
      AppCore?.modules?.get?.("Router") ||
      AppCore?.router ||
      AppCore?.Router ||
      null
    );
  } catch {
    return (
      AppCore?.router ||
      AppCore?.Router ||
      null
    );
  }
}

function isSafeInternalPath(path = "") {
  const value =
    safeText(path, "");

  if (!value) {
    return false;
  }

  if (value.startsWith("//")) {
    return false;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return false;
  }

  return value.startsWith("/");
}

function normalizeRedirectPath(path = "/", fallback = DEFAULT_HOME_PATH) {
  const value =
    safeText(path, fallback);

  if (!isSafeInternalPath(value)) {
    return fallback;
  }

  return value;
}

function navigateTo(path = "/", options = {}) {
  const target =
    normalizeRedirectPath(path, DEFAULT_HOME_PATH);

  const replaceState =
    options.replaceState !== false;

  const force =
    options.force !== false;

  const hardRedirect =
    options.hardRedirect === true;

  if (!hardRedirect) {
    try {
      const router =
        getRouter();

      if (isFunction(router?.navigate)) {
        router.navigate(target, {
          replaceState,
          force,
        });

        return true;
      }

      if (isFunction(router?.go)) {
        router.go(target, {
          replaceState,
          force,
        });

        return true;
      }
    } catch (error) {
      safeWarn(
        "navigate router falló; fallback window.location.",
        error
      );
    }
  }

  if (isBrowser()) {
    try {
      if (replaceState) {
        window.location.replace(target);
      } else {
        window.location.assign(target);
      }

      return true;
    } catch {
      try {
        window.location.href = target;
        return true;
      } catch {}
    }
  }

  return false;
}

/* =========================================================
   AUTH STATE
========================================================= */

function getCurrentToken() {
  return (
    AppCore?.state?.token ||
    AppCore?.state?.accessToken ||
    AppCore?.state?.session?.token ||
    AppCore?.state?.session?.accessToken ||
    null
  );
}

function getCurrentUser() {
  return (
    AppCore?.state?.user ||
    AppCore?.state?.currentUser ||
    AppCore?.state?.sessionUser ||
    AppCore?.state?.authUser ||
    AppCore?.state?.session?.user ||
    null
  );
}

function isUserActive(user = null) {
  if (!user || typeof user !== "object") {
    return true;
  }

  return !(
    user.active === false ||
    user.enabled === false ||
    user.disabled === true ||
    user.is_active === false ||
    user.isActive === false
  );
}

function syncAuthState() {
  const token =
    getCurrentToken();

  const user =
    getCurrentUser();

  const authenticated =
    Boolean(
      hasValidToken(token) &&
      isUserActive(user)
    );

  const role =
    authenticated
      ? getCurrentRole()
      : "";

  try {
    if (AppCore?.state) {
      AppCore.state.authenticated =
        authenticated;

      AppCore.state.role =
        role || null;
    }
  } catch {}

  try {
    AppCore?.setState?.({
      authenticated,
      role:
        role || null,
    });
  } catch {}

  return authenticated;
}

export function isAuthenticated() {
  return Boolean(
    syncAuthState()
  );
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(value = "") {
  const raw =
    safeText(value, "")
      .toLowerCase()
      .replace(/\s+/g, "_");

  return ROLE_ALIASES[raw] || raw;
}

function getUserRoles(user = null) {
  const source =
    safeObject(user);

  const roles = [
    source.role,
    source.rol,
    source.userRole,
    source.type,
    source.userType,
    AppCore?.state?.role,
    AppCore?.state?.userRole,
    AppCore?.state?.rol,
  ];

  if (Array.isArray(source.roles)) {
    roles.push(...source.roles);
  }

  if (Array.isArray(AppCore?.state?.roles)) {
    roles.push(...AppCore.state.roles);
  }

  return roles
    .flat()
    .map(normalizeRole)
    .filter(Boolean);
}

export function getCurrentRole() {
  const roles =
    getUserRoles(getCurrentUser());

  return roles[0] || "";
}

export function getCurrentRoles() {
  return getUserRoles(
    getCurrentUser()
  );
}

export function hasRole(...roles) {
  const requiredRoles =
    roles
      .flat()
      .map(normalizeRole)
      .filter(Boolean);

  if (!requiredRoles.length) {
    return true;
  }

  const currentRoles =
    getCurrentRoles();

  if (!currentRoles.length) {
    return false;
  }

  return requiredRoles.some((role) =>
    currentRoles.includes(role)
  );
}

export function requireRole(...roles) {
  return (
    isAuthenticated() &&
    hasRole(...roles)
  );
}

export function getAuthHeader() {
  const token =
    getCurrentToken();

  if (!hasValidToken(token)) {
    return {};
  }

  return {
    Authorization:
      `Bearer ${String(token).trim()}`,
  };
}

/* =========================================================
   ROUTE GUARDS
========================================================= */

function buildBlockedPayload({
  reason,
  path,
  redirectTo,
  extra = {},
} = {}) {
  return {
    reason:
      safeText(reason, "blocked"),

    path:
      path || getCurrentPath(),

    publicPath:
      AppCore?.state?.publicPath || "",

    redirectTo:
      redirectTo || "",

    authenticated:
      Boolean(AppCore?.state?.authenticated),

    currentRole:
      getCurrentRole() || null,

    ...extra,
  };
}

function buildLoginRedirect(currentPath = "/", redirectTo = LOGIN_PATH) {
  const loginPath =
    normalizeRedirectPath(redirectTo, LOGIN_PATH);

  try {
    return buildLoginRedirectPath(
      currentPath,
      loginPath
    );
  } catch {}

  try {
    return buildLoginRedirectPath(
      currentPath
    );
  } catch {}

  const safeCurrent =
    normalizeRedirectPath(currentPath, DEFAULT_HOME_PATH);

  return `${loginPath}?redirect=${encodeURIComponent(safeCurrent)}`;
}

export function guardAuthenticated(options = {}) {
  const {
    redirectTo = LOGIN_PATH,
    withRedirectBack = true,
    autoNavigate = false,
    hardRedirect = false,
    allowPublicTechnicalRoutes = true,
  } = options;

  const currentPath =
    getCurrentPath();

  if (
    allowPublicTechnicalRoutes &&
    isPublicTechnicalPath(currentPath)
  ) {
    safeEmit(
      "auth:guard:allowed",
      {
        reason:
          "public-technical-route",
        path:
          currentPath,
      }
    );

    return true;
  }

  if (isAuthenticated()) {
    safeEmit(
      "auth:guard:allowed",
      {
        reason:
          "authenticated",
        path:
          currentPath,
        currentRole:
          getCurrentRole() || null,
      }
    );

    return true;
  }

  const finalRedirect =
    withRedirectBack
      ? buildLoginRedirect(
          currentPath,
          redirectTo
        )
      : normalizeRedirectPath(
          redirectTo,
          LOGIN_PATH
        );

  safeEmit(
    "auth:guard:blocked",
    buildBlockedPayload({
      reason:
        "not-authenticated",
      path:
        currentPath,
      redirectTo:
        finalRedirect,
    })
  );

  if (
    autoNavigate ||
    hardRedirect
  ) {
    navigateTo(
      finalRedirect,
      {
        replaceState:
          true,
        force:
          true,
        hardRedirect:
          Boolean(hardRedirect),
      }
    );
  }

  return false;
}

export function guardRole(roles = [], options = {}) {
  const roleList =
    Array.isArray(roles)
      ? roles
      : [roles];

  const {
    redirectTo = DEFAULT_HOME_PATH,
    loginRedirectTo = LOGIN_PATH,
    autoNavigate = false,
    hardRedirect = false,
    allowPublicTechnicalRoutes = true,
  } = options;

  const currentPath =
    getCurrentPath();

  if (
    allowPublicTechnicalRoutes &&
    isPublicTechnicalPath(currentPath)
  ) {
    safeEmit(
      "auth:guard:allowed",
      {
        reason:
          "public-technical-route",
        path:
          currentPath,
      }
    );

    return true;
  }

  if (!isAuthenticated()) {
    const loginRedirect =
      buildLoginRedirect(
        currentPath,
        loginRedirectTo
      );

    safeEmit(
      "auth:guard:blocked",
      buildBlockedPayload({
        reason:
          "not-authenticated",
        path:
          currentPath,
        redirectTo:
          loginRedirect,
        extra: {
          requiredRoles:
            roleList
              .flat()
              .map(normalizeRole)
              .filter(Boolean),
        },
      })
    );

    if (autoNavigate || hardRedirect) {
      navigateTo(
        loginRedirect,
        {
          replaceState:
            true,
          force:
            true,
          hardRedirect:
            Boolean(hardRedirect),
        }
      );
    }

    return false;
  }

  if (hasRole(...roleList)) {
    safeEmit(
      "auth:guard:allowed",
      {
        reason:
          "role-match",
        path:
          currentPath,
        currentRole:
          getCurrentRole() || null,
        currentRoles:
          getCurrentRoles(),
      }
    );

    return true;
  }

  const finalRedirect =
    normalizeRedirectPath(
      redirectTo,
      DEFAULT_HOME_PATH
    );

  safeEmit(
    "auth:guard:blocked",
    buildBlockedPayload({
      reason:
        "insufficient-role",
      path:
        currentPath,
      redirectTo:
        finalRedirect,
      extra: {
        currentRole:
          getCurrentRole() || null,
        currentRoles:
          getCurrentRoles(),
        requiredRoles:
          roleList
            .flat()
            .map(normalizeRole)
            .filter(Boolean),
      },
    })
  );

  if (autoNavigate || hardRedirect) {
    navigateTo(
      finalRedirect,
      {
        replaceState:
          true,
        force:
          true,
        hardRedirect:
          Boolean(hardRedirect),
      }
    );
  }

  return false;
}

/* =========================================================
   ERROR HELPER
========================================================= */

export function buildGuardErrorPayload(error) {
  const message =
    (() => {
      try {
        return extractMessage(error);
      } catch {
        return error?.message || String(error);
      }
    })();

  return {
    error,
    message,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getAuthGuardsSnapshot() {
  const currentPath =
    getCurrentPath();

  return {
    authenticated:
      Boolean(AppCore?.state?.authenticated),

    hasToken:
      Boolean(hasValidToken(getCurrentToken())),

    hasUser:
      Boolean(getCurrentUser()),

    userActive:
      isUserActive(getCurrentUser()),

    currentRole:
      getCurrentRole() || null,

    currentRoles:
      getCurrentRoles(),

    currentPath:
      redactTokenInText(currentPath),

    publicTechnical:
      isPublicTechnicalPath(currentPath),

    hasRouter:
      Boolean(getRouter()),
  };
}

export default {
  isAuthenticated,

  getCurrentRole,
  getCurrentRoles,
  hasRole,
  requireRole,
  getAuthHeader,

  guardAuthenticated,
  guardRole,

  buildGuardErrorPayload,

  getAuthGuardsSnapshot,
};
