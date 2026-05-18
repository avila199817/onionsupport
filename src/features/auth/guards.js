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
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as Session from "./session.js";

export const GUARDS_VERSION = "simple";

const SOURCE = "auth.guards";
const LOGIN_PATH = "/login";
const HOME_PATH = "/";

const PUBLIC_ROUTES = Object.freeze([
  "/login",
  "/password-request",
  "/password-reset",
  "/activate-account",
]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
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
    // fallback abajo
  }

  try {
    Object.assign(readState(), cleanPatch);
  } catch {
    // noop
  }

  return readState();
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function emit(eventName = "", payload = {}, options = {}) {
  if (options.emitEvents !== true && options.debug !== true) return false;

  const name = text(eventName, "");
  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, {
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

function normalizePublicPath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  return value || "/";
}

function canonical(path = "/") {
  let value = normalizePublicPath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function currentPublicPath() {
  if (typeof window !== "undefined") {
    return normalizePublicPath(
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
  }

  const state = readState();

  return normalizePublicPath(state.publicPath || state.route || "/");
}

function currentCanonicalPath() {
  const state = readState();

  return canonical(state.canonicalPath || state.route || currentPublicPath());
}

function isPublicTechnicalPath(path = "") {
  const clean = canonical(path);

  return PUBLIC_ROUTES.includes(clean);
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
  const candidate = normalizePublicPath(path || fallback);

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

function sessionAuthenticated() {
  try {
    if (isFunction(Session.isAuthenticated)) {
      return Session.isAuthenticated() === true;
    }
  } catch {
    // fallback abajo
  }

  return Boolean(sessionToken() && sessionUser());
}

function sessionToken() {
  try {
    return text(Session.getCurrentToken?.(), "");
  } catch {
    return "";
  }
}

function sessionUser() {
  try {
    return Session.getCurrentUser?.() || null;
  } catch {
    return null;
  }
}

function cleanRole(role = "") {
  return String(role || "").toLowerCase() === "admin" ? "admin" : "user";
}

function validRole(role = "") {
  return role === "admin" || role === "user";
}

export function getCurrentUser() {
  return sessionAuthenticated() ? sessionUser() : null;
}

export function getCurrentRole() {
  if (!sessionAuthenticated()) return "";

  try {
    const role = Session.getCurrentRole?.();
    if (role === "admin" || role === "user") return role;
  } catch {
    // fallback abajo
  }

  const user = getCurrentUser();
  const role = cleanRole(user?.role || user?.rol);

  return validRole(role) ? role : "";
}

export function getCurrentRoles() {
  if (!sessionAuthenticated()) return [];

  try {
    const roles = Session.getCurrentRoles?.();

    if (Array.isArray(roles)) {
      return unique(
        roles
          .map((role) => String(role || "").toLowerCase())
          .filter(validRole)
      );
    }
  } catch {
    // fallback abajo
  }

  const role = getCurrentRole();

  return role ? [role] : [];
}

export function isCurrentUserAdmin() {
  return sessionAuthenticated() && getCurrentRole() === "admin";
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
  const hasToken = Boolean(sessionToken());
  const authenticated = sessionAuthenticated();
  const user = authenticated ? getCurrentUser() : null;
  const role = authenticated ? getCurrentRole() || "user" : "";
  const roles = authenticated ? getCurrentRoles() : [];

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
    isUser: authenticated && role === "user",
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
      .filter(validRole)
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
  try {
    return Session.getAuthHeader?.() || {};
  } catch {
    return {};
  }
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
    hasToken: Boolean(sessionToken()),
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
    emit("auth:guard:allowed", allowedPayload("public-route", path), options);
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
    emit("auth:guard:allowed", allowedPayload("public-route", path), options);
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

export function canAccessRoute(route = {}) {
  const path = canonical(route.path || route.publicPath || currentCanonicalPath());
  const visiblePath = currentPublicPath();

  if (
    route.allowPublicTechnicalRoutes !== false &&
    (isPublicTechnicalPath(path) || isPublicTechnicalPath(visiblePath))
  ) {
    return true;
  }

  if (route.public === true) return true;
  if (route.guestOnly === true) return !isAuthenticated();

  if (route.requiresAuth !== false && !isAuthenticated()) {
    return false;
  }

  const requested = Array.isArray(route.roles)
    ? route.roles.flat(Infinity)
    : route.roles
      ? [route.roles]
      : [];

  const requiredRoles = normalizeRequiredRoles(requested);

  if (!requested.length) return true;
  if (!requiredRoles.length) return false;

  return hasRole(...requiredRoles);
}

/* =========================================================
   ERROR / SNAPSHOT
========================================================= */

function extractMessage(error = null) {
  return (
    error?.data?.message ||
    error?.response?.data?.message ||
    error?.message ||
    String(error || "Error")
  );
}

export function buildGuardErrorPayload(error) {
  return {
    message: redact(extractMessage(error)),
    name: error?.name || "Error",
    status: error?.status || error?.statusCode || error?.response?.status || error?.data?.status || 0,
    code: error?.code || error?.data?.code || error?.response?.data?.code || null,
  };
}

export function getAuthGuardsSnapshot() {
  syncAuthState();

  const path = currentCanonicalPath();
  const visiblePath = currentPublicPath();
  const user = getCurrentUser();

  return {
    version: GUARDS_VERSION,

    authenticated: Boolean(readState().authenticated),
    hasToken: Boolean(sessionToken()),
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
      noImportsExceptSession: true,
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
