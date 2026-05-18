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
   - Sin AppCore propio.
   - Sin rutas inventadas.
   - Sin /403.
   - Sin 2FA/MFA/OTP.
========================================================= */

import * as Session from "./session.js";

export const GUARDS_VERSION = "minimal-1";

const LOGIN_PATH = "/login";
const HOME_PATH = "/";

const PUBLIC_ROUTES = Object.freeze([
  "/login",
  "/password-request",
  "/password-reset",
  "/activate-account",
]);

const VALID_ROLES = Object.freeze(["admin", "user"]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function cleanRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function validRole(value = "") {
  return VALID_ROLES.includes(value);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizePath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  value = value.split("?")[0].split("#")[0];

  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";

  return value || "/";
}

function currentPath() {
  if (!isBrowser()) return HOME_PATH;

  return normalizePath(
    `${window.location.pathname || HOME_PATH}${window.location.search || ""}${window.location.hash || ""}`
  );
}

function normalizeRequiredRoles(values = []) {
  const raw = Array.isArray(values) ? values.flat(Infinity) : [values];

  return unique(
    raw
      .map(cleanRole)
      .filter(validRole)
  );
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   SESSION
========================================================= */

export function syncAuthState(options = {}) {
  try {
    if (isFn(Session.syncAuthState)) {
      Session.syncAuthState({
        source: options.source || "auth.guards",
      });
    }
  } catch {
    // noop
  }

  return isAuthenticated();
}

export function isAuthenticated() {
  try {
    return Session.isAuthenticated?.() === true;
  } catch {
    return false;
  }
}

export function getCurrentUser() {
  try {
    return isAuthenticated() ? Session.getCurrentUser?.() || null : null;
  } catch {
    return null;
  }
}

export function getCurrentRole() {
  if (!isAuthenticated()) return "";

  try {
    const role = String(Session.getCurrentRole?.() || "").toLowerCase();
    return validRole(role) ? role : "";
  } catch {
    return "";
  }
}

export function getCurrentRoles() {
  if (!isAuthenticated()) return [];

  try {
    const roles = Session.getCurrentRoles?.();

    if (Array.isArray(roles) && roles.length) {
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
  return getCurrentRole() === "admin";
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
   ROUTES
========================================================= */

export function isPublicTechnicalPath(path = currentPath()) {
  return PUBLIC_ROUTES.includes(normalizePath(path));
}

export function isAuthRoute(path = currentPath()) {
  return normalizePath(path) === LOGIN_PATH;
}

export function isPasswordRequestRoute(path = currentPath()) {
  return normalizePath(path) === "/password-request";
}

export function isPasswordResetRoute(path = currentPath()) {
  return normalizePath(path) === "/password-reset";
}

export function isActivationRoute(path = currentPath()) {
  return normalizePath(path) === "/activate-account";
}

/* =========================================================
   GUARDS
========================================================= */

export function guardAuthenticated(options = {}) {
  const path = normalizePath(options.path || currentPath());

  if (options.allowPublicTechnicalRoutes !== false && isPublicTechnicalPath(path)) {
    return true;
  }

  return isAuthenticated();
}

export function guardGuest(options = {}) {
  const path = normalizePath(options.path || currentPath());

  if (options.allowPublicTechnicalRoutes !== false && !isAuthRoute(path)) {
    return true;
  }

  return !isAuthenticated();
}

export function guardRole(roles = [], options = {}) {
  const path = normalizePath(options.path || currentPath());

  if (options.allowPublicTechnicalRoutes !== false && isPublicTechnicalPath(path)) {
    return true;
  }

  if (!isAuthenticated()) return false;

  const requested = Array.isArray(roles) ? roles.flat(Infinity) : [roles];
  const required = normalizeRequiredRoles(requested);

  if (requested.length && !required.length) return false;
  if (!required.length) return true;

  return hasRole(...required);
}

export function guardAdmin(options = {}) {
  return guardRole(["admin"], options);
}

export function guardSupport() {
  return false;
}

export function guardManager() {
  return false;
}

export function canAccessRoute(route = {}) {
  const path = normalizePath(route.path || route.publicPath || currentPath());

  if (route.allowPublicTechnicalRoutes !== false && isPublicTechnicalPath(path)) {
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

  const required = normalizeRequiredRoles(requested);

  if (requested.length && !required.length) return false;
  if (!required.length) return true;

  return hasRole(...required);
}

/* =========================================================
   ERROR / SNAPSHOT
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

function extractMessage(error = null) {
  return (
    text(error?.data?.message, "") ||
    text(error?.response?.data?.message, "") ||
    text(error?.message, "") ||
    String(error || "Error")
  );
}

export function buildGuardErrorPayload(error = null) {
  return {
    message: redact(extractMessage(error)),
    name: error?.name || "Error",
    status: error?.status || error?.statusCode || error?.response?.status || error?.data?.status || 0,
    code: error?.code || error?.data?.code || error?.response?.data?.code || null,
  };
}

export function getAuthGuardsSnapshot() {
  const user = getCurrentUser();
  const path = currentPath();

  return {
    version: GUARDS_VERSION,

    authenticated: isAuthenticated(),
    hasUser: Boolean(user),

    currentRole: getCurrentRole() || null,
    currentRoles: getCurrentRoles(),

    isAdmin: isCurrentUserAdmin(),
    isSupport: false,
    isManager: false,
    isClient: false,

    user: publicUser(user),

    path: redact(path),
    publicTechnical: isPublicTechnicalPath(path),

    loginPath: LOGIN_PATH,
    publicRoutes: [...PUBLIC_ROUTES],
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

  isPublicTechnicalPath,
  isAuthRoute,
  isPasswordRequestRoute,
  isPasswordResetRoute,
  isActivationRoute,

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
