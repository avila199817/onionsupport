/* =========================================================
   Onion Support - Auth Guards
   Archivo: /src/features/auth/guards.js

   Responsabilidad:
   - Guards mínimos de frontend.
   - Auth real delegada en session.js.
   - Autenticado = token usable + user usable.
   - Roles únicos exactos: admin / user.
   - Entender /@{user.slug} como Home canónica /.
   - Sin fetch.
   - Sin refresh.
   - Sin restore.
   - Sin storage.
   - Sin Toast.
   - Sin navegación.
   - Sin AppCore propio.
   - Sin rutas inventadas.
   - Sin alias /home.
   - Sin /403.
   - Sin 2FA/MFA/OTP.
========================================================= */

import * as Session from "./session.js";

export const GUARDS_VERSION = "auth.guards.v2";

const LOGIN_PATH = "/login";
const HOME_PATH = "/";
const USER_HOME_PREFIX = "/@";

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

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value
      .map(normalizeRole)
      .filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = String(value || "").toLowerCase();

  return VALID_ROLES.includes(role) ? role : "";
}

function normalizeRequiredRoles(values = []) {
  const raw = Array.isArray(values) ? values.flat(Infinity) : [values];

  return unique(
    raw
      .map(normalizeRole)
      .filter(Boolean)
  );
}

function routeRequestedRoles(route = {}) {
  return [
    route.role,
    route.roles,
    route.meta?.role,
    route.meta?.roles,
  ]
    .flat(Infinity)
    .filter((role) => role !== undefined && role !== null && role !== "");
}

/* =========================================================
   PATHS
========================================================= */

function normalizeHashPath(path = HOME_PATH) {
  const value = text(path, HOME_PATH);

  if (value.startsWith("#!")) {
    return value.replace(/^#!\/?/, "/") || HOME_PATH;
  }

  if (value.startsWith("#/")) {
    return value.slice(1) || HOME_PATH;
  }

  return value;
}

function normalizePublicPath(path = HOME_PATH) {
  let value = normalizeHashPath(path);

  if (value.startsWith("//")) {
    return HOME_PATH;
  }

  try {
    if (/^https?:\/\//i.test(value) && isBrowser()) {
      const url = new URL(value, window.location.origin);

      if (url.origin !== window.location.origin) {
        return HOME_PATH;
      }

      value = `${url.pathname || HOME_PATH}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return HOME_PATH;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return HOME_PATH;
  }

  value = value.split("?")[0].split("#")[0];

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || HOME_PATH;
  }

  return value || HOME_PATH;
}

function normalizeUserSlug(value = "") {
  const slug = text(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

function extractUserHomeSlug(path = HOME_PATH) {
  const value = normalizePublicPath(path);

  if (!value.startsWith(USER_HOME_PREFIX)) return "";

  const slug = value.slice(USER_HOME_PREFIX.length);

  if (!slug || slug.includes("/")) return "";

  return normalizeUserSlug(slug);
}

export function isUserHomePath(path = HOME_PATH) {
  return Boolean(extractUserHomeSlug(path));
}

export function canonicalAuthPath(path = HOME_PATH) {
  const normalized = normalizePublicPath(path);

  return isUserHomePath(normalized) ? HOME_PATH : normalized;
}

function currentPath() {
  if (!isBrowser()) return HOME_PATH;

  try {
    return normalizePublicPath(
      `${window.location.pathname || HOME_PATH}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return HOME_PATH;
  }
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

export function getCurrentUserSlug() {
  if (!isAuthenticated()) return null;

  try {
    const fromSession = Session.getCurrentUserSlug?.();

    if (fromSession) return normalizeUserSlug(fromSession);
  } catch {
    // fallback abajo
  }

  const user = getCurrentUser();

  return normalizeUserSlug(
    user?.slug ||
      user?.lookup?.slug ||
      user?.profile?.slug ||
      ""
  ) || null;
}

export function getCurrentUserHomePath() {
  if (!isAuthenticated()) return HOME_PATH;

  try {
    const home = Session.getCurrentUserHomePath?.();

    if (home && isUserHomePath(home)) return home;
  } catch {
    // fallback abajo
  }

  const slug = getCurrentUserSlug();

  return slug ? `${USER_HOME_PREFIX}${slug}` : HOME_PATH;
}

export function getCurrentRole() {
  if (!isAuthenticated()) return "";

  try {
    const role = normalizeRole(Session.getCurrentRole?.());

    if (role) return role;
  } catch {
    // fallback abajo
  }

  const user = getCurrentUser();

  return normalizeRole(user?.role || user?.rol || user?.roles);
}

export function getCurrentRoles() {
  if (!isAuthenticated()) return [];

  try {
    const roles = Session.getCurrentRoles?.();

    if (Array.isArray(roles) && roles.length) {
      const normalized = normalizeRequiredRoles(roles);

      if (normalized.includes("admin")) return ["admin"];
      if (normalized.includes("user")) return ["user"];
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

  const currentRole = getCurrentRole();

  if (currentRole === "admin") return true;

  return required.includes(currentRole);
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
  return PUBLIC_ROUTES.includes(canonicalAuthPath(path));
}

export function isAuthRoute(path = currentPath()) {
  return canonicalAuthPath(path) === LOGIN_PATH;
}

export function isPasswordRequestRoute(path = currentPath()) {
  return canonicalAuthPath(path) === "/password-request";
}

export function isPasswordResetRoute(path = currentPath()) {
  return canonicalAuthPath(path) === "/password-reset";
}

export function isActivationRoute(path = currentPath()) {
  return canonicalAuthPath(path) === "/activate-account";
}

/* =========================================================
   GUARDS
========================================================= */

export function guardAuthenticated(options = {}) {
  const path = canonicalAuthPath(options.path || currentPath());

  if (
    options.allowPublicTechnicalRoutes !== false &&
    isPublicTechnicalPath(path)
  ) {
    return true;
  }

  return isAuthenticated();
}

export function guardGuest(options = {}) {
  const path = canonicalAuthPath(options.path || currentPath());

  if (
    options.allowPublicTechnicalRoutes !== false &&
    isPublicTechnicalPath(path)
  ) {
    return !isAuthenticated();
  }

  return !isAuthenticated();
}

export function guardRole(roles = [], options = {}) {
  const path = canonicalAuthPath(options.path || currentPath());

  if (
    options.allowPublicTechnicalRoutes !== false &&
    isPublicTechnicalPath(path)
  ) {
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
  const rawPath =
    route.path ||
    route.publicPath ||
    route.canonicalPath ||
    currentPath();

  const path = canonicalAuthPath(rawPath);

  if (
    route.allowPublicTechnicalRoutes !== false &&
    isPublicTechnicalPath(path)
  ) {
    return true;
  }

  if (route.guestOnly === true || route.publicOnly === true) {
    return !isAuthenticated();
  }

  if (route.public === true || route.requiresAuth === false) {
    return true;
  }

  if (!isAuthenticated()) {
    return false;
  }

  const requested = routeRequestedRoles(route);
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
    username: user.username || null,
    slug: getCurrentUserSlug(),
    displayName: user.displayName || user.name || user.username || null,
    role: normalizeRole(user.role || user.rol || user.roles) || null,
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
    status:
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status ||
      0,
    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      null,
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

    userSlug: getCurrentUserSlug(),
    homePath: getCurrentUserHomePath(),

    path: redact(path),
    canonicalPath: canonicalAuthPath(path),
    isUserHomePath: isUserHomePath(path),
    publicTechnical: isPublicTechnicalPath(path),

    loginPath: LOGIN_PATH,
    publicRoutes: [...PUBLIC_ROUTES],

    policy: {
      ownFetch: false,
      ownRefresh: false,
      ownRestore: false,
      ownStorage: false,
      ownToast: false,
      ownNavigation: false,
      roles: [...VALID_ROLES],
      userSlugHome: true,
      canonicalizesUserHome: true,
      validatesRealUserSlug: false,
      noHomeAlias: true,
      no403Route: true,
      no2fa: true,
    },
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

  getCurrentUserSlug,
  getCurrentUserHomePath,

  getCurrentRole,
  getCurrentRoles,

  isCurrentUserAdmin,
  isCurrentUserSupport,
  isCurrentUserManager,
  isCurrentUserClient,

  hasRole,
  requireRole,
  getAuthHeader,

  normalizePublicPath,
  canonicalAuthPath,
  isUserHomePath,

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
