/* =========================================================
   Onion Support - Auth Guards
   Archivo: /src/features/auth/guards.js

   Responsabilidad:
   - Guards mínimos de frontend.
   - Compat Auth-level para requireAuth/requireGuest/requireRole/requireAdmin.
   - Auth real delegada en session.js.
   - Autenticado = access token usable + user usable según session.js.
   - Roles únicos exactos: admin / user.
   - Delegar rutas, user-scope y bloqueos en core/config.js.
   - Entender /@{user.slug} como Home privada canónica.
   - Entender /@{user.slug}/{ruta} como ruta privada scopeada.
   - Validación real de navegación pertenece a router/index.js.
   - Router guards reales pertenecen a /src/router/guards.js.
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
   - Sin /404.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  PUBLIC_ROUTES,
  ROUTES,
  USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as getConfigUserScopedRouteInfo,
  isAdminRoute as configIsAdminRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isPublicRoute as configIsPublicRoute,
  isUserHomeRoute as configIsUserHomeRoute,
  isUserScopedRoute as configIsUserScopedRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import * as Session from "./session.js";

export const GUARDS_VERSION = "auth.guards.v7";

const HOME_PATH = "/";
const LOGIN_PATH = ROUTES.login || "/login";
const PASSWORD_REQUEST_PATH = ROUTES.passwordRequest || "/password-request";
const PASSWORD_RESET_PATH = ROUTES.passwordReset || "/password-reset";
const ACTIVATE_ACCOUNT_PATH = ROUTES.activateAccount || "/activate-account";

const USER_PREFIX = USER_HOME_PREFIX || "/@";

const VALID_ROLES = Object.freeze(["admin", "user"]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function unique(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [values])
        .flat(Infinity)
        .filter(Boolean)
    ),
  ];
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
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

  const role = cleanText(value, "").toLowerCase();

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
    route?.role,
    route?.roles,
    route?.meta?.role,
    route?.meta?.roles,
  ]
    .flat(Infinity)
    .filter((role) => role !== undefined && role !== null && role !== "");
}

function routeRequiresAdmin(route = {}) {
  if (!isObject(route)) return false;

  const roles = normalizeRequiredRoles(routeRequestedRoles(route));
  const path = canonicalAuthPath(route.canonicalPath || route.path || "");

  if (
    route.admin === true ||
    route.adminOnly === true ||
    route.requiresAdmin === true ||
    route.meta?.admin === true ||
    route.meta?.adminOnly === true ||
    route.meta?.requiresAdmin === true ||
    (
      roles.includes("admin") &&
      !roles.includes("user")
    )
  ) {
    return true;
  }

  try {
    return configIsAdminRoute(path) === true;
  } catch {
    return false;
  }
}

/* =========================================================
   PATHS
========================================================= */

function pathFromInput(path = HOME_PATH) {
  try {
    return configRoutePathFromUrlLike(path) || HOME_PATH;
  } catch {
    return HOME_PATH;
  }
}

export function normalizePublicPath(path = HOME_PATH) {
  try {
    const raw = pathFromInput(path);
    return configNormalizeRoutePath(raw) || HOME_PATH;
  } catch {
    let value = cleanText(path, HOME_PATH);

    if (!value || value.startsWith("//")) return HOME_PATH;

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
}

function normalizeUserSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = cleanText(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
}

function localUserScopedRouteInfo(path = HOME_PATH) {
  const normalized = normalizePublicPath(path);

  if (!normalized.startsWith(USER_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: normalized,
      canonicalPath: normalized,
      lookupPath: normalized,
    };
  }

  const rest = normalized.slice(USER_PREFIX.length);
  const [slugSegment = "", ...restSegments] = rest.split("/");
  const slug = normalizeUserSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: normalized,
      canonicalPath: normalized,
      lookupPath: normalized,
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
    lookupPath: restPath,
  };
}

export function getUserScopedRouteInfo(path = HOME_PATH) {
  try {
    const info = getConfigUserScopedRouteInfo(path);

    if (isObject(info)) {
      const restPath = normalizePublicPath(
        info.restPath ||
          info.canonicalPath ||
          normalizePublicPath(path)
      );

      const canonicalPath = normalizePublicPath(
        info.canonicalPath ||
          info.lookupPath ||
          restPath
      );

      return {
        scoped: Boolean(info.scoped),
        home: Boolean(info.home),
        slug: normalizeUserSlug(info.slug || ""),
        restPath,
        canonicalPath,
        lookupPath: canonicalPath,
      };
    }
  } catch {
    // fallback abajo
  }

  return localUserScopedRouteInfo(path);
}

export function extractUserScopedSlug(path = HOME_PATH) {
  return getUserScopedRouteInfo(path).slug;
}

function extractUserHomeSlug(path = HOME_PATH) {
  const info = getUserScopedRouteInfo(path);
  return info.home ? info.slug : "";
}

export function isUserHomePath(path = HOME_PATH) {
  try {
    return configIsUserHomeRoute(path) === true;
  } catch {
    return Boolean(extractUserHomeSlug(path));
  }
}

export function isUserScopedPath(path = HOME_PATH) {
  try {
    return configIsUserScopedRoute(path) === true;
  } catch {
    return Boolean(getUserScopedRouteInfo(path).scoped);
  }
}

function localBlockedPath(path = HOME_PATH) {
  const normalized = normalizePublicPath(path).toLowerCase();

  return Boolean(
    normalized === "/home" ||
      normalized.startsWith("/home/") ||
      normalized === "/403" ||
      normalized.startsWith("/403/") ||
      normalized === "/404" ||
      normalized.startsWith("/404/") ||
      normalized === "/2fa" ||
      normalized.startsWith("/2fa/") ||
      normalized === "/mfa" ||
      normalized.startsWith("/mfa/") ||
      normalized === "/otp" ||
      normalized.startsWith("/otp/")
  );
}

function isBlockedLegacyPath(path = HOME_PATH) {
  try {
    if (configIsBlockedRoutePath(path) === true) return true;
  } catch {
    // fallback local
  }

  if (localBlockedPath(path)) return true;

  const scoped = getUserScopedRouteInfo(path);

  return Boolean(scoped.scoped && localBlockedPath(scoped.restPath));
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
  if (isBlockedLegacyPath(path)) return "";

  try {
    return configCanonicalRoutePath(path) || HOME_PATH;
  } catch {
    const info = getUserScopedRouteInfo(path);
    return info.scoped ? info.canonicalPath : normalizePublicPath(path);
  }
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
      .map(canonicalAuthPath)
      .filter(Boolean)
      .filter((path) => !isBlockedLegacyPath(path))
  );
}

/* =========================================================
   SESSION
========================================================= */

export function syncAuthState(options = {}) {
  try {
    if (typeof Session.syncAuthState === "function") {
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
      user?.routing?.slug ||
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

  try {
    return configBuildUserHomeRoute(slug) || HOME_PATH;
  } catch {
    return slug ? `${USER_PREFIX}${slug}` : HOME_PATH;
  }
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
  const normalized = normalizePublicPath(path);

  if (isBlockedLegacyPath(normalized)) return false;

  /*
    Las rutas públicas/auth no deben vivir dentro de /@{slug}.
  */
  if (getUserScopedRouteInfo(normalized).scoped) return false;

  try {
    if (configIsPublicRoute(normalized) === true) return true;
  } catch {
    // fallback abajo
  }

  return publicAuthRoutes().includes(canonicalAuthPath(normalized));
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

  if (isBlockedLegacyPath(path)) return false;

  if (!isAuthenticated()) return false;

  /*
    Compat Auth-level:
    Si alguien usa estos guards fuera del router, evitamos permitir
    un /@slug que no pertenece al usuario actual.
    La validación de navegación canónica sigue siendo de router/index.js.
  */
  if (scoped.scoped && !isCurrentUserScopedPath(path)) {
    return false;
  }

  return true;
}

export function guardGuest(options = {}) {
  const path = normalizePublicPath(options.path || currentPath());

  if (isBlockedLegacyPath(path)) return false;

  /*
    Una ruta pública dentro de /@{slug} no es válida.
  */
  if (getUserScopedRouteInfo(path).scoped) return false;

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

  if (isBlockedLegacyPath(publicPath) || isBlockedLegacyPath(canonicalPath)) {
    return false;
  }

  /*
    Las rutas públicas/auth no se aceptan bajo user scope.
    Router/index.js también protege esto; aquí se replica sólo para compat.
  */
  if (scoped.scoped && route.public === true) {
    return false;
  }

  if (scoped.scoped && !guardAuthenticated({ path: publicPath })) {
    return false;
  }

  if (route.guestOnly === true || route.publicOnly === true) {
    return guardGuest({ path: publicPath });
  }

  if (routeRequiresAdmin(route)) {
    return guardAdmin({ path: publicPath });
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
    canonicalPath: redact(canonicalAuthPath(path)),

    userScopedPath: scoped.scoped,
    userScopedRestPath: scoped.scoped ? scoped.restPath : null,

    isBlockedLegacyPath: isBlockedLegacyPath(path),

    isUserHomePath: isUserHomePath(path),
    isUserScopedPath: isUserScopedPath(path),
    isCurrentUserHomePath: isCurrentUserHomePath(path),
    isCurrentUserScopedPath: scoped.scoped ? isCurrentUserScopedPath(path) : false,

    publicTechnical: isPublicTechnicalPath(path),

    loginPath: LOGIN_PATH,
    publicRoutes: publicAuthRoutes(),

    policy: {
      authCompatGuardsOnly: true,

      sessionOwnsAuthState: true,
      configOwnsRoutes: true,
      configOwnsUserScope: true,
      configOwnsBlockedRoutes: true,
      routerIndexOwnsCanonicalNavigation: true,
      routerGuardsOwnRouteAccess: true,

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

      validatesCurrentUserSlugForCompat: true,
      blocksPublicRoutesInsideUserScope: true,

      blocksHomeAlias: true,
      blocks403Route: true,
      blocks404Route: true,

      noHomeAlias: true,
      no403Route: true,
      no404Route: true,
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
