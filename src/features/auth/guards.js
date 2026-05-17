/* =========================================================
   Onion Support - Auth Guards
   Archivo: /src/features/auth/guards.js

   Responsabilidad:
   - Guards mínimos de frontend.
   - Auth real delegada en session.js.
   - Autenticado = token usable + user usable.
   - Roles únicos: admin / user.
   - Sin fetch.
   - Sin refresh.
   - Sin restore.
   - Sin storage.
   - Sin Toast.
   - Sin navegación.
   - Sin rutas inventadas.
   - Sin /403.
   - Sin 2FA/MFA/OTP.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
  normalizeCanonicalPath,
  normalizePublicPath,
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  AUTH_PUBLIC_TECHNICAL_ROUTES,
} from "./constants.js";

import {
  isAuthenticated as sessionIsAuthenticated,
  getCurrentUser as sessionGetCurrentUser,
  getCurrentToken as sessionGetCurrentToken,
  getCurrentRole as sessionGetCurrentRole,
  getCurrentRoles as sessionGetCurrentRoles,
  isCurrentUserAdmin as sessionIsCurrentUserAdmin,
  getAuthHeader as sessionGetAuthHeader,
} from "./session.js";

export const GUARDS_VERSION = "simple";

const SOURCE = "auth.guards";
const LOGIN_PATH = "/login";
const HOME_PATH = "/";

const PUBLIC_ROUTES = Object.freeze([
  "/login",
  "/password-reset",
  "/password-request",
  "/activate-account",
  ...AUTH_PUBLIC_TECHNICAL_ROUTES,
]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function readState() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function commitState(patch = {}) {
  const cleanPatch = isObject(patch) ? patch : {};

  try {
    AppCore?.setState?.(cleanPatch, {
      source: SOURCE,
      silent: true,
      emit: false,
    });
  } catch {
    // noop
  }

  try {
    Object.assign(readState(), cleanPatch);
  } catch {
    // noop
  }

  return readState();
}

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "").replace(/([?&#]token=)([^&#\s]+)/gi, "$1***");
  }
}

function emit(eventName = "", payload = {}, options = {}) {
  if (options.emitEvents !== true && options.debug !== true) return false;

  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: GUARDS_VERSION,
      at: nowIso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ROUTES
========================================================= */

function canonical(path = "") {
  try {
    return normalizeCanonicalPath(path || "/");
  } catch {
    return text(path, "/").split("?")[0].split("#")[0] || "/";
  }
}

function publicPath(path = "") {
  try {
    return normalizePublicPath(path || "/");
  } catch {
    return text(path, "/") || "/";
  }
}

function currentCanonicalPath() {
  try {
    return canonical(getCurrentCanonicalPath());
  } catch {
    return canonical(readState().route || "/");
  }
}

function currentPublicPath() {
  try {
    return publicPath(getCurrentPublicPath());
  } catch {
    return publicPath(readState().publicPath || readState().route || "/");
  }
}

function isPublicTechnicalPath(path = "") {
  const clean = canonical(path).toLowerCase();

  return unique(PUBLIC_ROUTES).some((route) => {
    return clean === canonical(route).toLowerCase();
  });
}

function isSafeInternalPath(path = "") {
  const value = text(path, "");

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (/[\r\n\t\\]/.test(value)) return false;

  return true;
}

function safeRedirect(path = "", fallback = HOME_PATH) {
  const candidate = publicPath(path || fallback);

  return isSafeInternalPath(candidate) ? candidate : fallback;
}

function loginRedirect(path = "") {
  const target = safeRedirect(path, HOME_PATH);

  if (canonical(target) === LOGIN_PATH) return LOGIN_PATH;

  return `${LOGIN_PATH}?redirect=${encodeURIComponent(target)}`;
}

/* =========================================================
   SESSION
========================================================= */

function tokenOk() {
  return Boolean(sessionGetCurrentToken?.());
}

export function getCurrentUser() {
  return sessionGetCurrentUser?.() || null;
}

export function getCurrentRoles() {
  const roles = sessionGetCurrentRoles?.() || [];
  return Array.isArray(roles) ? roles.filter((role) => role === "admin" || role === "user") : [];
}

export function getCurrentRole() {
  const role = sessionGetCurrentRole?.() || getCurrentRoles()[0] || "";
  return role === "admin" || role === "user" ? role : "";
}

export function isCurrentUserAdmin() {
  return Boolean(sessionIsCurrentUserAdmin?.() || getCurrentRole() === "admin");
}

export function isCurrentUserSupport() {
  return false;
}

export function isCurrentUserManager() {
  return false;
}

export function isCurrentUserClient() {
  return false;
}

export function syncAuthState() {
  const authenticated = Boolean(sessionIsAuthenticated?.());
  const user = authenticated ? getCurrentUser() : null;
  const role = authenticated ? getCurrentRole() || "user" : "";
  const roles = authenticated ? [role] : [];
  const hasToken = tokenOk();

  commitState({
    authenticated,
    hasToken,

    user,
    currentUser: user,
    authUser: user,
    sessionUser: user,

    role,
    rol: role,
    userRole: role,
    roles,

    isAdmin: authenticated && role === "admin",
    isSupport: false,
    isManager: false,
    isClient: false,
  });

  return authenticated;
}

export function isAuthenticated() {
  return syncAuthState();
}

function normalizeRequiredRoles(values = []) {
  const raw = Array.isArray(values) ? values.flat(Infinity) : [values];

  return unique(
    raw
      .map((role) => String(role || "").toLowerCase())
      .filter((role) => role === "admin" || role === "user")
  );
}

export function hasRole(...roles) {
  if (!isAuthenticated()) return false;
  if (!roles.length) return true;

  const required = normalizeRequiredRoles(roles);

  if (!required.length) return false;

  const current = new Set(getCurrentRoles());

  return required.some((role) => current.has(role));
}

export function requireRole(...roles) {
  return hasRole(...roles);
}

export function getAuthHeader() {
  return sessionGetAuthHeader?.() || {};
}

/* =========================================================
   PAYLOADS
========================================================= */

function publicUser(user = null) {
  if (!isObject(user)) return null;

  return {
    id: user.id || user.userId || null,
    userId: user.userId || user.id || null,
    username: user.username || user.slug || null,
    displayName: user.displayName || user.name || user.username || null,
    role: user.role || user.rol || null,
  };
}

function allowedPayload(reason, path, extra = {}) {
  return {
    allowed: true,
    reason,
    path: redact(path),
    publicPath: redact(currentPublicPath()),
    authenticated: Boolean(readState().authenticated),
    currentRole: getCurrentRole() || null,
    currentRoles: getCurrentRoles(),
    ...extra,
  };
}

function blockedPayload(reason, path, redirectTo = "", extra = {}) {
  const user = getCurrentUser();

  return {
    allowed: false,
    reason,
    path: redact(path),
    publicPath: redact(currentPublicPath()),
    redirectTo,
    authenticated: Boolean(readState().authenticated),
    hasToken: tokenOk(),
    hasUser: Boolean(user),
    currentRole: getCurrentRole() || null,
    currentRoles: getCurrentRoles(),
    user: publicUser(user),
    ...extra,
  };
}

/* =========================================================
   GUARDS
========================================================= */

export function guardAuthenticated(options = {}) {
  const path = canonical(options.path || currentCanonicalPath());
  const visiblePath = currentPublicPath();

  if (
    options.allowPublicTechnicalRoutes !== false &&
    (isPublicTechnicalPath(path) || isPublicTechnicalPath(visiblePath))
  ) {
    emit("auth:guard:allowed", allowedPayload("public-technical-route", path), options);
    return true;
  }

  if (isAuthenticated()) {
    emit("auth:guard:allowed", allowedPayload("authenticated", path), options);
    return true;
  }

  const redirectTo = options.withRedirectBack === false
    ? safeRedirect(options.redirectTo || LOGIN_PATH, LOGIN_PATH)
    : loginRedirect(visiblePath || path);

  emit("auth:guard:blocked", blockedPayload("not-authenticated", path, redirectTo), options);
  return false;
}

export function guardRole(roles = [], options = {}) {
  const path = canonical(options.path || currentCanonicalPath());
  const visiblePath = currentPublicPath();

  if (
    options.allowPublicTechnicalRoutes !== false &&
    (isPublicTechnicalPath(path) || isPublicTechnicalPath(visiblePath))
  ) {
    emit("auth:guard:allowed", allowedPayload("public-technical-route", path), options);
    return true;
  }

  const requested = Array.isArray(roles) ? roles.flat(Infinity) : [roles];
  const requiredRoles = normalizeRequiredRoles(requested);

  if (requested.length && !requiredRoles.length) {
    emit(
      "auth:guard:blocked",
      blockedPayload("unsupported-role", path, "", {
        requestedRoles: requested.map(String),
      }),
      options
    );

    return false;
  }

  if (!isAuthenticated()) {
    const redirectTo = loginRedirect(visiblePath || path);

    emit(
      "auth:guard:blocked",
      blockedPayload("not-authenticated", path, redirectTo, {
        requiredRoles,
      }),
      options
    );

    return false;
  }

  if (!requiredRoles.length || hasRole(...requiredRoles)) {
    emit(
      "auth:guard:allowed",
      allowedPayload("role-match", path, {
        requiredRoles,
      }),
      options
    );

    return true;
  }

  emit(
    "auth:guard:blocked",
    blockedPayload("insufficient-role", path, "", {
      requiredRoles,
    }),
    options
  );

  return false;
}

export function guardGuest(options = {}) {
  const path = canonical(options.path || currentCanonicalPath());

  if (!isAuthenticated()) {
    emit("auth:guard:allowed", allowedPayload("guest", path), options);
    return true;
  }

  emit(
    "auth:guard:blocked",
    blockedPayload("already-authenticated", path, safeRedirect(options.redirectTo || HOME_PATH, HOME_PATH)),
    options
  );

  return false;
}

export function guardAdmin(options = {}) {
  return guardRole(["admin"], options);
}

export function guardSupport(options = {}) {
  const path = canonical(options.path || currentCanonicalPath());

  emit(
    "auth:guard:blocked",
    blockedPayload("unsupported-role", path, "", {
      requestedRoles: ["support"],
    }),
    options
  );

  return false;
}

export function guardManager(options = {}) {
  const path = canonical(options.path || currentCanonicalPath());

  emit(
    "auth:guard:blocked",
    blockedPayload("unsupported-role", path, "", {
      requestedRoles: ["manager"],
    }),
    options
  );

  return false;
}

export function canAccessRoute({
  path = "",
  roles = [],
  requireAuth = true,
  allowPublicTechnicalRoutes = true,
} = {}) {
  const cleanPath = canonical(path || currentCanonicalPath());
  const visiblePath = currentPublicPath();

  if (
    allowPublicTechnicalRoutes &&
    (isPublicTechnicalPath(cleanPath) || isPublicTechnicalPath(visiblePath))
  ) {
    return true;
  }

  if (requireAuth !== false && !isAuthenticated()) {
    return false;
  }

  const requested = Array.isArray(roles) ? roles.flat(Infinity) : [roles];
  const requiredRoles = normalizeRequiredRoles(requested);

  if (!requested.length) return true;
  if (!requiredRoles.length) return false;

  return hasRole(...requiredRoles);
}

/* =========================================================
   ERROR / SNAPSHOT
========================================================= */

export function buildGuardErrorPayload(error) {
  let message = "";

  try {
    message = extractMessage(error);
  } catch {
    message = error?.message || String(error || "Error");
  }

  return {
    message: redact(message),
    name: error?.name || "Error",
    status: error?.status || error?.statusCode || error?.response?.status || error?.data?.status || 0,
    code: error?.code || error?.data?.code || error?.response?.data?.code || null,
  };
}

export function getAuthGuardsSnapshot() {
  const path = currentCanonicalPath();
  const visiblePath = currentPublicPath();
  const user = getCurrentUser();

  syncAuthState();

  return {
    version: GUARDS_VERSION,

    authenticated: Boolean(readState().authenticated),
    hasToken: tokenOk(),
    hasUser: Boolean(user),

    currentRole: getCurrentRole() || null,
    currentRoles: getCurrentRoles(),

    isAdmin: isCurrentUserAdmin(),
    isSupport: false,
    isManager: false,
    isClient: false,

    user: publicUser(user),

    path: redact(path),
    publicPath: redact(visiblePath),
    publicTechnical: isPublicTechnicalPath(path) || isPublicTechnicalPath(visiblePath),

    state: {
      route: redact(readState().route || ""),
      publicPath: redact(readState().publicPath || ""),
      role: readState().role || null,
      roles: Array.isArray(readState().roles) ? readState().roles : [],
      authenticated: Boolean(readState().authenticated),
      hasToken: Boolean(readState().hasToken),
    },

    policy: {
      ownFetch: false,
      ownRefresh: false,
      ownRestore: false,
      ownRouter: false,
      ownToast: false,
      roles: ["admin", "user"],
      supportManagerClient: false,
      noForbiddenRoute: true,
    },

    at: nowIso(),
  };
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  GUARDS_VERSION,

  syncAuthState,

  isAuthenticated,
  getCurrentUser,

  getCurrentRole,
  getCurrentRoles,

  isCurrentUserAdmin,
  isCurrentUserSupport,
  isCurrentUserManager,
  isCurrentUserClient,

  hasRole,
  requireRole,
  getAuthHeader,

  guardAuthenticated,
  guardRole,
  guardGuest,
  guardAdmin,
  guardSupport,
  guardManager,

  canAccessRoute,

  requireAuth: guardAuthenticated,
  ensureAuthenticated: guardAuthenticated,
  requireGuest: guardGuest,
  requireAdmin: guardAdmin,
  requireSupport: guardSupport,
  requireManager: guardManager,

  can: hasRole,
  canAccess: canAccessRoute,

  buildGuardErrorPayload,

  getAuthGuardsSnapshot,
  getDebugSnapshot: getAuthGuardsSnapshot,
};
