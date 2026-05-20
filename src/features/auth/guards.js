/* =========================================================
   Onion Support - Auth Guards
   Archivo: /src/features/auth/guards.js

   Responsabilidad:
   - Guards mínimos de frontend.
   - Auth real delegada en session.js.
   - Autenticado = token usable + user usable.
   - Roles únicos exactos: admin / user.
   - Entender /@{user.slug} como Home canónica /.
   - Entender /@{user.slug}/{ruta} como ruta privada scopeada.
   - Validar que /@{slug} pertenece al usuario actual.
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

import {
  PUBLIC_ROUTES,
  ROUTES,
  USER_HOME_PREFIX,
} from "../../core/config.js";

import * as Session from "./session.js";

export const GUARDS_VERSION = "auth.guards.v4";

const LOGIN_PATH = ROUTES.login || "/login";
const HOME_PATH = ROUTES.home || "/";
const PASSWORD_REQUEST_PATH = ROUTES.passwordRequest || "/password-request";
const PASSWORD_RESET_PATH = ROUTES.passwordReset || "/password-reset";
const ACTIVATE_ACCOUNT_PATH = ROUTES.activateAccount || "/activate-account";

const VALID_ROLES = Object.freeze(["admin", "user"]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
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

  const role = String(value || "").trim().toLowerCase();

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
  const value = cleanText(path, HOME_PATH);

  if (value.startsWith("#!")) {
    return value.replace(/^#!\/?/, "/") || HOME_PATH;
  }

  if (value.startsWith("#/")) {
    return value.slice(1) || HOME_PATH;
  }

  return value;
}

export function normalizePublicPath(path = HOME_PATH) {
  let value = normalizeHashPath(path);

  if (!value || value.startsWith("//")) {
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

  value = value
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || HOME_PATH;
  }

  return value || HOME_PATH;
}

function normalizeUserSlug(value = "") {
  const slug = cleanText(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

export function getUserScopedRouteInfo(path = HOME_PATH) {
  const normalized = normalizePublicPath(path);

  if (!normalized.startsWith(USER_HOME_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: normalized,
      canonicalPath: normalized,
    };
  }

  const rest = normalized.slice(USER_HOME_PREFIX.length);
  const [slugSegment = "", ...restSegments] = rest.split("/");
  const slug = normalizeUserSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: normalized,
      canonicalPath: normalized,
    };
  }

  const restPath = restSegments.length
    ? normalizePublicPath(`/${restSegments.join("/")}`)
    : HOME_PATH;

  return {
    scoped: true,
    home: restPath === HOME_PATH,
    slug,
    restPath,
    canonicalPath: restPath,
  };
}

export function extractUserScopedSlug(path = HOME_PATH) {
  return getUserScopedRouteInfo(path).slug;
}

function extractUserHomeSlug(path = HOME_PATH) {
  const info = getUserScopedRouteInfo(path);
  return info.home ? info.slug : "";
}

export function isUserHomePath(path = HOME_PATH) {
  return Boolean(extractUserHomeSlug(path));
}

export function isUserScopedPath(path = HOME_PATH) {
  return Boolean(getUserScopedRouteInfo(path).scoped);
}

function isCurrentUserScopedPath(path = HOME_PATH) {
  const routeSlug = extractUserScopedSlug(path);

  if (!routeSlug) return false;

  const userSlug = getCurrentUserSlug();

  return Boolean(userSlug && routeSlug === userSlug);
}

function isCurrentUserHomePath(path = HOME_PATH) {
  const info = getUserScopedRouteInfo(path);

  return Boolean(info.home && isCurrentUserScopedPath(path));
}

export function canonicalAuthPath(path = HOME_PATH) {
  const info = getUserScopedRouteInfo(path);

  return info.scoped ? info.restPath : normalizePublicPath(path);
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

function publicAuthRoutes() {
  const configured = Array.isArray(PUBLIC_ROUTES) ? PUBLIC_ROUTES : [];

  return unique(
    [
      ...configured,
      LOGIN_PATH,
      PASSWORD_REQUEST_PATH,
      PASSWORD_RESET_PATH,
      ACTIVATE_ACCOUNT_PATH,
    ]
      .map(normalizePublicPath)
      .filter(Boolean)
  );
}

/* =========================================================
   SESSION
========================================================= */

export function syncAuthState(options = {}) {
  try {
    if (isFunction(Session.syncAuthState)) {
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
    const home = normalizePublicPath(Session.getCurrentUserHomePath?.() || "");

    if (home && isCurrentUserHomePath(home)) return home;
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
  if (hasRole(...roles)) return true;

  const error = new Error("No tienes permisos para acceder a este recurso.");
  error.code = "AUTH_FORBIDDEN";
  error.status = 403;

  throw error;
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
  return publicAuthRoutes().includes(canonicalAuthPath(path));
}

export function isAuthRoute(path = currentPath()) {
  return canonicalAuthPath(path) === LOGIN_PATH;
}

export function isPasswordRequestRoute(path = currentPath()) {
  return canonicalAuthPath(path) === PASSWORD_REQUEST_PATH;
}

export function isPasswordResetRoute(path = currentPath()) {
  return canonicalAuthPath(path) === PASSWORD_RESET_PATH;
}

export function isActivationRoute(path = currentPath()) {
  return canonicalAuthPath(path) === ACTIVATE_ACCOUNT_PATH;
}

/* =========================================================
   GUARDS
========================================================= */

export function guardAuthenticated(options = {}) {
  const path = normalizePublicPath(options.path || currentPath());
  const scoped = getUserScopedRouteInfo(path);

  if (!isAuthenticated()) return false;

  if (scoped.scoped && !isCurrentUserScopedPath(path)) {
    return false;
  }

  return true;
}

export function guardGuest() {
  return !isAuthenticated();
}

export function guardRole(roles = [], options = {}) {
  if (!guardAuthenticated(options)) return false;

  const requested = Array.isArray(roles) ? roles.flat(Infinity) : [roles];
  const required = normalizeRequiredRoles(requested);

  if (requested.length && !required.length) return false;
  if (!required.length) return true;

  return hasRole(...required);
}

export function guardAdmin(options = {}) {
  return guardRole(["admin"], options);
}

export function canAccessRoute(route = {}) {
  const rawPath =
    route.publicPath ||
    route.path ||
    route.canonicalPath ||
    currentPath();

  const publicPath = normalizePublicPath(rawPath);
  const canonicalPath = canonicalAuthPath(publicPath);
  const scoped = getUserScopedRouteInfo(publicPath);

  if (scoped.scoped && !guardAuthenticated({ path: publicPath })) {
    return false;
  }

  if (route.guestOnly === true || route.publicOnly === true) {
    return guardGuest();
  }

  if (
    route.public === true ||
    route.requiresAuth === false ||
    isPublicTechnicalPath(canonicalPath)
  ) {
    return true;
  }

  if (!guardAuthenticated({ path: publicPath })) {
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
    cleanText(error?.data?.message, "") ||
    cleanText(error?.response?.data?.message, "") ||
    cleanText(error?.message, "") ||
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
  const scoped = getUserScopedRouteInfo(path);

  return {
    version: GUARDS_VERSION,

    authenticated: isAuthenticated(),
    hasUser: Boolean(user),

    currentRole: getCurrentRole() || null,
    currentRoles: getCurrentRoles(),

    isAdmin: isCurrentUserAdmin(),

    user: publicUser(user),

    userSlug: getCurrentUserSlug(),
    homePath: getCurrentUserHomePath(),

    path: redact(path),
    canonicalPath: canonicalAuthPath(path),

    userScopedPath: scoped.scoped,
    userScopedRestPath: scoped.scoped ? scoped.restPath : null,

    isUserHomePath: isUserHomePath(path),
    isUserScopedPath: isUserScopedPath(path),
    isCurrentUserHomePath: isCurrentUserHomePath(path),
    isCurrentUserScopedPath: scoped.scoped ? isCurrentUserScopedPath(path) : false,

    publicTechnical: isPublicTechnicalPath(path),

    loginPath: LOGIN_PATH,
    publicRoutes: publicAuthRoutes(),

    policy: {
      ownFetch: false,
      ownRefresh: false,
      ownRestore: false,
      ownStorage: false,
      ownToast: false,
      ownNavigation: false,

      roles: [...VALID_ROLES],

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      canonicalizesUserHome: true,
      canonicalizesUserScopedRoutes: true,
      validatesCurrentUserSlug: true,

      noHomeAlias: true,
      no403Route: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,
      snapshotRedacted: true,
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

  hasRole,
  requireRole,
  getAuthHeader,

  normalizePublicPath,
  canonicalAuthPath,

  getUserScopedRouteInfo,
  extractUserScopedSlug,
  isUserHomePath,
  isUserScopedPath,

  isPublicTechnicalPath,
  isAuthRoute,
  isPasswordRequestRoute,
  isPasswordResetRoute,
  isActivationRoute,

  guardAuthenticated,
  guardRole,
  guardGuest,
  guardAdmin,

  canAccessRoute,

  requireAuth: guardAuthenticated,
  ensureAuthenticated: guardAuthenticated,
  requireGuest: guardGuest,
  requireAdmin: guardAdmin,

  can: hasRole,
  canAccess: canAccessRoute,

  buildGuardErrorPayload,

  getAuthGuardsSnapshot,
  getDebugSnapshot: getAuthGuardsSnapshot,
};
