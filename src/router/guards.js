/* =========================================================
   Onion Support - Router Guards
   Archivo: /src/router/guards.js

   Responsabilidad:
   - Capa mínima Router ↔ Auth.
   - Evaluar route.public / route.guestOnly / route.requiresAuth / route.roles.
   - Evaluar route.adminOnly / route.requiresAdmin / rutas admin de core/config.js.
   - Auth real delegada en Auth/AppCore.
   - Auth estricta: señal Auth válida + access token usable + user usable.
   - Usuario inválido sólo por:
     - disabled === true
     - suspended === true
     - active === false
     - enabled === false
     - status/estado/state: "suspended" o "desactivado"
   - Roles únicos exactos: admin / user.
   - Rutas admin: sólo admin.
   - Delegar normalización de rutas/user-scope/bloqueos en core/config.js.
   - Canonicalizar user-scope sólo para rutas privadas reales conocidas/routable.
   - No canonicalizar /@slug/ruta-inexistente como /ruta-inexistente.
   - No validar aquí si el slug coincide con el usuario real.
   - La validación real del slug pertenece a router/index.js.
   - No inventar slug.
   - Sin fetch.
   - Sin refresh.
   - Sin restore.
   - Sin storage.
   - Sin Toast.
   - Sin navegación directa.
   - Sin render.
   - Sin history.
   - Sin /403.
   - Sin /404.
   - Sin alias /home.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  ROUTES,
  USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as getConfigUserScopedRouteInfo,
  isAdminRoute as isConfigAdminRoute,
  isBlockedRoutePath as isConfigBlockedRoutePath,
  isUserHomeRoute as isConfigUserHomeRoute,
  isUserScopedRoute as isConfigUserScopedRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../core/config.js";

export const GUARDS_VERSION = "router.guards.v14";

const CONFIG_ROUTES = ROUTES && typeof ROUTES === "object" ? ROUTES : {};

const LOGIN_PATH = CONFIG_ROUTES.login || "/login";
const HOME_PATH = "/";
const USER_PREFIX = USER_HOME_PREFIX || "/@";

const VALID_ROLES = Object.freeze(["admin", "user"]);

const INVALID_USER_STATUSES = new Set([
  "suspended",
  "desactivado",
]);

const USER_SCOPED_CANONICAL_PATHS = new Set(
  [
    HOME_PATH,
    CONFIG_ROUTES.incidencias || "/incidencias",
    CONFIG_ROUTES.facturas || "/facturas",
    CONFIG_ROUTES.clientes || "/clientes",
    CONFIG_ROUTES.cuenta || "/cuenta",
    CONFIG_ROUTES.ajustes || "/ajustes",

    /*
      Admin opcionales:
      sólo entran si core/config.js las define.
    */
    CONFIG_ROUTES.usuarios || "",
    CONFIG_ROUTES.servidor || CONFIG_ROUTES.server || "",
  ]
    .filter(Boolean)
    .map((path) => normalizePathname(path))
);

export const GUARD_REASONS = Object.freeze({
  allow: "allowed",
  routeNotFound: "route-not-found",
  blockedLegacy: "blocked-legacy-route",
  publicRoute: "public-route",
  guestOnly: "guest-only",
  alreadyAuthenticated: "already-authenticated",
  notAuthenticated: "not-authenticated",
  adminRequired: "admin-required",
  insufficientRole: "insufficient-role",
  unsupportedRole: "unsupported-role",
});

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function safeCall(fn = null, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
}

function readState(AppCore = null) {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function resolveAuth(AppCore = null, Auth = null) {
  try {
    const modules = AppCore?.modules || null;
    const getModule = isFunction(modules?.get)
      ? modules.get.bind(modules)
      : null;

    return (
      Auth ||
      AppCore?.auth ||
      AppCore?.Auth ||
      safeCall(getModule, "auth") ||
      safeCall(getModule, "Auth") ||
      null
    );
  } catch {
    return Auth || null;
  }
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

/* =========================================================
   TOKEN
========================================================= */

function stripBearer(value = "") {
  return cleanText(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;
  if (token.length > 8192) return false;

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(token.toLowerCase());
}

/* =========================================================
   PATHS
========================================================= */

function isHashRouterPath(value = "") {
  const raw = cleanText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = cleanText(value, HOME_PATH);

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || HOME_PATH;
  }

  if (raw.startsWith("#/")) {
    return raw.slice(1) || HOME_PATH;
  }

  return raw || HOME_PATH;
}

function pathFromInput(path = HOME_PATH) {
  try {
    return configRoutePathFromUrlLike(path) || HOME_PATH;
  } catch {
    const raw = cleanText(path, HOME_PATH);

    if (!raw) return HOME_PATH;

    if (isHashRouterPath(raw)) {
      return normalizeHashRouterPath(raw);
    }

    if (raw.startsWith("//")) return HOME_PATH;

    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      return HOME_PATH;
    }

    if (/[\r\n\t\\]/.test(raw)) {
      return HOME_PATH;
    }

    return raw || HOME_PATH;
  }
}

function normalizePathname(pathname = HOME_PATH) {
  try {
    return configNormalizeRoutePath(pathname) || HOME_PATH;
  } catch {
    let value = cleanText(pathname, HOME_PATH).replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    const parts = [];

    for (const part of value.split("/")) {
      if (!part || part === ".") continue;

      if (part === "..") {
        parts.pop();
      } else {
        parts.push(part);
      }
    }

    value = `/${parts.join("/")}`;

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || HOME_PATH;
    }

    return value || HOME_PATH;
  }
}

function normalizeSearch(search = "") {
  const value = cleanText(search, "");

  if (!value || value === "?") return "";

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = cleanText(hash, "");

  if (!value || value === "#") return "";

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitPath(path = HOME_PATH) {
  let raw = pathFromInput(path);
  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || HOME_PATH;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || HOME_PATH;
  }

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function joinPath(parts = {}) {
  return [
    normalizePathname(parts.pathname || HOME_PATH),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
}

export function normalizePublicPath(path = HOME_PATH) {
  const parts = splitPath(path);

  return joinPath({
    pathname: parts.pathname,
    search: parts.search,
    hash: parts.hash,
  });
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function isBlockedPath(path = HOME_PATH) {
  try {
    return isConfigBlockedRoutePath(path) === true;
  } catch {
    return false;
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

function userScopedPathIsRoutable(restPath = HOME_PATH) {
  return USER_SCOPED_CANONICAL_PATHS.has(normalizePathname(restPath));
}

export function getUserScopedRouteInfo(path = HOME_PATH) {
  try {
    const info = getConfigUserScopedRouteInfo(path);

    if (isObject(info)) {
      const pathname = splitPath(path).pathname;

      const restPath = normalizePathname(
        info.restPath ||
          info.canonicalPath ||
          pathname
      );

      const lookupPath = normalizePathname(
        info.canonicalPath ||
          info.lookupPath ||
          restPath
      );

      const routable = Object.prototype.hasOwnProperty.call(info, "routable")
        ? Boolean(info.routable)
        : userScopedPathIsRoutable(restPath);

      return {
        scoped: Boolean(info.scoped),
        routable,
        home: Boolean(info.home && routable),
        slug: normalizeUserSlug(info.slug || ""),
        restPath,
        lookupPath: routable ? lookupPath : pathname,
      };
    }
  } catch {
    // fallback abajo
  }

  const pathname = splitPath(path).pathname;

  if (!pathname.startsWith(USER_PREFIX)) {
    return {
      scoped: false,
      routable: false,
      home: false,
      slug: "",
      restPath: pathname,
      lookupPath: pathname,
    };
  }

  const rest = pathname.slice(USER_PREFIX.length);
  const [slugSegment = "", ...restSegments] = rest.split("/");
  const slug = normalizeUserSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      routable: false,
      home: false,
      slug: "",
      restPath: pathname,
      lookupPath: pathname,
    };
  }

  const restPath = restSegments.length
    ? normalizePathname(`/${restSegments.join("/")}`)
    : HOME_PATH;

  const routable = userScopedPathIsRoutable(restPath);

  return {
    scoped: true,
    routable,
    home: routable && restPath === HOME_PATH,
    slug,
    restPath,
    lookupPath: routable ? restPath : pathname,
  };
}

export function extractSlugFromPath(path = HOME_PATH) {
  return getUserScopedRouteInfo(path).slug;
}

export function isUserHomePath(path = HOME_PATH) {
  try {
    if (isConfigUserHomeRoute(path) === true) return true;
  } catch {
    // fallback abajo
  }

  const info = getUserScopedRouteInfo(path);
  return Boolean(info.scoped && info.routable && info.home);
}

export function isUserScopedPath(path = HOME_PATH) {
  try {
    if (isConfigUserScopedRoute(path) === true) return true;
  } catch {
    // fallback abajo
  }

  const info = getUserScopedRouteInfo(path);
  return Boolean(info.scoped && info.routable);
}

export function canonicalGuardPath(path = HOME_PATH) {
  const pathname = splitPath(path).pathname || HOME_PATH;
  const scoped = getUserScopedRouteInfo(pathname);

  if (scoped.scoped && !scoped.routable) {
    return pathname;
  }

  try {
    const canonical = normalizePathname(
      configCanonicalRoutePath(path) ||
        (scoped.scoped && scoped.routable ? scoped.lookupPath : pathname) ||
        HOME_PATH
    );

    return canonical || HOME_PATH;
  } catch {
    if (scoped.scoped && scoped.routable) {
      return scoped.lookupPath;
    }

    /*
      Si /@slug/algo no es una ruta user-scope real, no se convierte en /algo.
      Index/render decidirán not-found si procede.
    */
    return scoped.scoped ? pathname : pathname;
  }
}

function isBlockedGuardPath(path = HOME_PATH) {
  const publicPath = normalizePublicPath(path);
  const pathname = splitPath(publicPath).pathname;
  const scoped = getUserScopedRouteInfo(pathname);
  const canonicalPath = canonicalGuardPath(publicPath);

  return Boolean(
    isBlockedPath(publicPath) ||
      isBlockedPath(pathname) ||
      (scoped.scoped && scoped.restPath && isBlockedPath(scoped.restPath)) ||
      isBlockedPath(canonicalPath)
  );
}

function isSafeInternalPath(path = "") {
  const value = cleanText(path, "");

  return Boolean(
    value &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
      !/[\r\n\t\\]/.test(value) &&
      !hasSensitiveQuery(value) &&
      !isBlockedGuardPath(value)
  );
}

function safeRedirect(path = "", fallback = HOME_PATH) {
  const raw = cleanText(path, "");
  const backup = normalizePublicPath(fallback || HOME_PATH);

  if (!isSafeInternalPath(raw)) return backup;

  const normalized = normalizePublicPath(raw);

  return isSafeInternalPath(normalized) ? normalized : backup;
}

/* =========================================================
   AUTH BRIDGE
========================================================= */

function callAuth(AppCore = null, Auth = null, method = "", fallback = null, ...args) {
  const auth = resolveAuth(AppCore, Auth);
  const fn = auth?.[method];

  if (!isFunction(fn)) return fallback;

  try {
    return fn.call(auth, ...args);
  } catch {
    return fallback;
  }
}

function isAuthenticatedSignal(AppCore = null, Auth = null) {
  const fromAuth = callAuth(AppCore, Auth, "isAuthenticated", null);

  if (fromAuth !== null) return fromAuth === true;

  const fromCore = safeCall(
    AppCore?.isAuthenticated?.bind?.(AppCore) || AppCore?.isAuthenticated
  );

  return fromCore === true;
}

function hasToken(AppCore = null, Auth = null) {
  if (callAuth(AppCore, Auth, "hasValidToken", false) === true) return true;
  if (callAuth(AppCore, Auth, "hasToken", false) === true) return true;

  const state = readState(AppCore);

  const token =
    callAuth(AppCore, Auth, "getToken", "") ||
    callAuth(AppCore, Auth, "getAccessToken", "") ||
    state.token ||
    state.accessToken ||
    state.access_token ||
    "";

  return tokenOk(token);
}

function getUser(AppCore = null, Auth = null) {
  const state = readState(AppCore);

  return (
    callAuth(AppCore, Auth, "getUser", null) ||
    callAuth(AppCore, Auth, "getCurrentUser", null) ||
    safeCall(AppCore?.getCurrentUser?.bind?.(AppCore) || AppCore?.getCurrentUser) ||
    state.user ||
    state.currentUser ||
    null
  );
}

function isUserUsable(user = null) {
  if (!isObject(user)) return false;

  const status = cleanText(
    user.status ||
      user.estado ||
      user.state ||
      "",
    ""
  ).toLowerCase();

  return !(
    user.disabled === true ||
      user.suspended === true ||
      user.active === false ||
      user.enabled === false ||
      INVALID_USER_STATUSES.has(status)
  );
}

function hasStrictSession(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  if (!isAuthenticatedSignal(AppCore, auth)) return false;
  if (!hasToken(AppCore, auth)) return false;

  return isUserUsable(getUser(AppCore, auth));
}

function getUserSlug(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  const fromAuth =
    callAuth(AppCore, auth, "getUserSlug", "") ||
    callAuth(AppCore, auth, "extractUserSlug", "", getUser(AppCore, auth));

  if (fromAuth) return normalizeUserSlug(fromAuth);

  const user = getUser(AppCore, auth);
  const state = readState(AppCore);

  return normalizeUserSlug(
    user?.slug ||
      user?.lookup?.slug ||
      user?.profile?.slug ||
      state.userSlug ||
      ""
  );
}

function getUserHomePath(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const slug = getUserSlug(AppCore, auth);

  const fromAuth =
    callAuth(AppCore, auth, "getDefaultHome", "") ||
    callAuth(AppCore, auth, "buildUserHomePath", "", getUser(AppCore, auth));

  if (fromAuth && isSafeInternalPath(fromAuth)) {
    const normalized = normalizePublicPath(fromAuth);

    /*
      La home autenticada visible debe ser /@{slug}.
      Si Auth devuelve "/" como fallback genérico, Guards construye la home visible real.
    */
    if (normalized !== HOME_PATH || !slug) {
      return normalized;
    }
  }

  try {
    const configured = configBuildUserHomeRoute(slug);

    if (configured && isSafeInternalPath(configured)) {
      const normalized = normalizePublicPath(configured);

      if (normalized !== HOME_PATH || !slug) {
        return normalized;
      }
    }
  } catch {
    // fallback local
  }

  return slug ? `${USER_PREFIX}${slug}` : HOME_PATH;
}

function buildLoginRedirect(AppCore = null, Auth = null, publicPath = HOME_PATH) {
  const target = safeRedirect(publicPath, HOME_PATH);

  if (
    canonicalGuardPath(target) === LOGIN_PATH ||
    isBlockedGuardPath(target)
  ) {
    return LOGIN_PATH;
  }

  return `${LOGIN_PATH}?redirect=${encodeURIComponent(target)}`;
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  return VALID_ROLES.includes(role) ? role : "";
}

export function normalizeGuardRoles(value = []) {
  return unique(
    asArray(value)
      .flat(Infinity)
      .map(normalizeRole)
      .filter(Boolean)
  );
}

function rawRouteRoles(route = null) {
  return [
    route?.role,
    route?.roles,
    route?.meta?.role,
    route?.meta?.roles,
  ]
    .flat(Infinity)
    .filter((role) => role !== undefined && role !== null && role !== "");
}

function routeRoles(route = null) {
  return normalizeGuardRoles(rawRouteRoles(route));
}

function unsupportedRouteRoles(route = null) {
  return rawRouteRoles(route).filter((role) => !normalizeRole(role));
}

function currentRole(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  if (!hasStrictSession(AppCore, auth)) return "";

  const fromAuth =
    callAuth(AppCore, auth, "getRole", "") ||
    callAuth(AppCore, auth, "getCurrentRole", "");

  const authRole = normalizeRole(fromAuth);

  if (authRole) return authRole;

  const state = readState(AppCore);
  const user = getUser(AppCore, auth);

  return (
    normalizeRole(user?.role || user?.rol || user?.roles) ||
    normalizeRole(state.role || state.rol || state.roles) ||
    "user"
  );
}

function currentRoles(AppCore = null, Auth = null) {
  const role = currentRole(AppCore, Auth);
  return role ? [role] : [];
}

function hasAllowedRole(AppCore = null, Auth = null, roles = []) {
  const required = normalizeGuardRoles(roles);

  if (!required.length) return true;

  const role = currentRole(AppCore, Auth);

  if (role === "admin") return true;

  return required.includes(role);
}

/* =========================================================
   ROUTE FLAGS
========================================================= */

function isPublicRoute(route = null) {
  if (!route) return false;

  if (typeof route.public === "boolean") return route.public;
  if (typeof route.requiresAuth === "boolean") return route.requiresAuth === false;

  return false;
}

function isGuestOnlyRoute(route = null) {
  return Boolean(route?.guestOnly || route?.publicOnly);
}

function requiresAuth(route = null) {
  if (!route) return false;

  if (typeof route.requiresAuth === "boolean") return route.requiresAuth;
  if (typeof route.private === "boolean") return route.private;

  return !isPublicRoute(route);
}

function routePath(route = null) {
  return canonicalGuardPath(route?.path || route?.canonicalPath || HOME_PATH);
}

function isConfiguredAdminPath(path = HOME_PATH) {
  const canonical = canonicalGuardPath(path);

  if (isBlockedGuardPath(canonical)) return false;

  try {
    return isConfigAdminRoute(canonical) === true;
  } catch {
    return false;
  }
}

export function isAdminGuardPath(path = HOME_PATH) {
  return isConfiguredAdminPath(path);
}

function routeRequiresAdmin(route = null, canonicalPath = HOME_PATH) {
  if (!route || isPublicRoute(route)) return false;

  const path = canonicalGuardPath(canonicalPath || routePath(route));
  const roles = routeRoles(route);

  return Boolean(
    route.adminOnly === true ||
      route.requiresAdmin === true ||
      route.admin === true ||
      route.meta?.adminOnly === true ||
      route.meta?.requiresAdmin === true ||
      route.meta?.admin === true ||
      isConfiguredAdminPath(path) ||
      (roles.includes("admin") && !roles.includes("user"))
  );
}

/* =========================================================
   RESULTS
========================================================= */

function publicUser(user = null, AppCore = null, Auth = null) {
  if (!isObject(user)) return null;

  return {
    hasId: Boolean(user.id || user.userId || user.uid || user.sub),
    hasUsername: Boolean(user.username),
    slug: getUserSlug(AppCore, Auth) || null,
    role: normalizeRole(user.role || user.rol || user.roles) || null,
    usable: isUserUsable(user),
  };
}

function buildDetails({
  AppCore = null,
  Auth = null,
  route = null,
  canonicalPath = HOME_PATH,
  publicPath = HOME_PATH,
  extra = {},
} = {}) {
  const auth = resolveAuth(AppCore, Auth);
  const user = getUser(AppCore, auth);
  const scoped = getUserScopedRouteInfo(publicPath);
  const adminOnly = routeRequiresAdmin(route, canonicalPath);
  const scopedRoutable = Boolean(scoped.scoped && scoped.routable);

  return {
    version: GUARDS_VERSION,

    routePath: route ? routePath(route) : null,

    canonicalPath: redact(canonicalPath),
    publicPath: redact(publicPath),

    requestedSlug: scoped.scoped ? scoped.slug || null : null,
    scopedPath: scopedRoutable,
    scopedRoutable,
    scopedRestPath: scopedRoutable ? scoped.restPath : null,

    authenticated: hasStrictSession(AppCore, auth),
    authSignal: isAuthenticatedSignal(AppCore, auth),
    hasToken: hasToken(AppCore, auth),
    hasUser: Boolean(user),
    userUsable: isUserUsable(user),

    currentRole: currentRole(AppCore, auth) || null,
    currentRoles: currentRoles(AppCore, auth),

    routeAdminOnly: adminOnly,
    routeRequiresAdmin: adminOnly,

    user: publicUser(user, AppCore, auth),

    userHomePath: redact(getUserHomePath(AppCore, auth)),

    ...extra,
  };
}

function allow({
  route = null,
  reason = GUARD_REASONS.allow,
  canonicalPath = HOME_PATH,
  publicPath = HOME_PATH,
  details = {},
} = {}) {
  return {
    allowed: true,
    reason,
    route,
    redirectTo: null,
    canonicalPath,
    publicPath,
    details,
  };
}

function deny({
  reason = "blocked",
  route = null,
  redirectTo = null,
  canonicalPath = HOME_PATH,
  publicPath = HOME_PATH,
  details = {},
} = {}) {
  return {
    allowed: false,
    reason,
    route,
    redirectTo,
    canonicalPath,
    publicPath,
    details,
  };
}

/* =========================================================
   MAIN
========================================================= */

export function shouldAllowRoute({
  AppCore = null,
  Auth = null,
  route = null,
  requestedCanonicalPath = HOME_PATH,
  requestedPublicPath = null,
  requiresAdmin: contextRequiresAdmin = false,
  adminOnly: contextAdminOnly = false,
} = {}) {
  const auth = resolveAuth(AppCore, Auth);

  const publicPath = normalizePublicPath(
    requestedPublicPath || requestedCanonicalPath || HOME_PATH
  );

  const canonicalPath = canonicalGuardPath(
    requestedCanonicalPath || publicPath
  );

  const common = {
    AppCore,
    Auth: auth,
    route,
    canonicalPath,
    publicPath,
  };

  if (isBlockedGuardPath(publicPath) || isBlockedGuardPath(canonicalPath)) {
    return deny({
      reason: GUARD_REASONS.blockedLegacy,
      route,
      canonicalPath,
      publicPath,
      details: buildDetails({
        ...common,
        extra: {
          blockedLegacy: true,
        },
      }),
    });
  }

  if (!route) {
    return deny({
      reason: GUARD_REASONS.routeNotFound,
      route: null,
      canonicalPath,
      publicPath,
      details: buildDetails(common),
    });
  }

  const logged = hasStrictSession(AppCore, auth);
  const publicRoute = isPublicRoute(route);
  const guestOnly = isGuestOnlyRoute(route);
  const routeRequiresAuth = requiresAuth(route);
  const roles = routeRoles(route);
  const unsupportedRoles = unsupportedRouteRoles(route);
  const adminOnlyRoute = Boolean(
    contextRequiresAdmin ||
      contextAdminOnly ||
      routeRequiresAdmin(route, canonicalPath)
  );

  if (unsupportedRoles.length) {
    return deny({
      reason: GUARD_REASONS.unsupportedRole,
      route,
      canonicalPath,
      publicPath,
      details: buildDetails({
        ...common,
        extra: { unsupportedRoles },
      }),
    });
  }

  if (guestOnly && logged) {
    return deny({
      reason: GUARD_REASONS.alreadyAuthenticated,
      route,
      redirectTo: getUserHomePath(AppCore, auth),
      canonicalPath,
      publicPath,
      details: buildDetails({
        ...common,
        extra: { guestOnly: true },
      }),
    });
  }

  if (publicRoute && !routeRequiresAuth && !adminOnlyRoute && !roles.length) {
    return allow({
      reason: guestOnly ? GUARD_REASONS.guestOnly : GUARD_REASONS.publicRoute,
      route,
      canonicalPath,
      publicPath,
      details: buildDetails({
        ...common,
        extra: {
          publicRoute: true,
          guestOnly,
        },
      }),
    });
  }

  if ((routeRequiresAuth || roles.length || adminOnlyRoute) && !logged) {
    return deny({
      reason: GUARD_REASONS.notAuthenticated,
      route,
      redirectTo: buildLoginRedirect(AppCore, auth, publicPath),
      canonicalPath,
      publicPath,
      details: buildDetails({
        ...common,
        extra: {
          requiresAuth: routeRequiresAuth,
          roles,
          adminOnly: adminOnlyRoute,
        },
      }),
    });
  }

  if (adminOnlyRoute && currentRole(AppCore, auth) !== "admin") {
    return deny({
      reason: GUARD_REASONS.adminRequired,
      route,
      canonicalPath,
      publicPath,
      details: buildDetails({
        ...common,
        extra: {
          adminOnly: true,
          roles,
          currentRoles: currentRoles(AppCore, auth),
        },
      }),
    });
  }

  if (roles.length && !hasAllowedRole(AppCore, auth, roles)) {
    return deny({
      reason: GUARD_REASONS.insufficientRole,
      route,
      canonicalPath,
      publicPath,
      details: buildDetails({
        ...common,
        extra: {
          roles,
          currentRoles: currentRoles(AppCore, auth),
        },
      }),
    });
  }

  return allow({
    reason: GUARD_REASONS.allow,
    route,
    canonicalPath,
    publicPath,
    details: buildDetails({
      ...common,
      extra: {
        publicRoute,
        guestOnly,
        requiresAuth: routeRequiresAuth,
        roles,
        adminOnly: adminOnlyRoute,
      },
    }),
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getGuardsSnapshot({
  AppCore = null,
  Auth = null,
  route = null,
  requestedCanonicalPath = AppCore?.state?.route || HOME_PATH,
  requestedPublicPath = AppCore?.state?.publicPath || requestedCanonicalPath,
} = {}) {
  const auth = resolveAuth(AppCore, Auth);

  const publicPath = normalizePublicPath(
    requestedPublicPath || requestedCanonicalPath || HOME_PATH
  );

  const canonicalPath = canonicalGuardPath(
    requestedCanonicalPath || publicPath
  );

  const scoped = getUserScopedRouteInfo(publicPath);
  const scopedRoutable = Boolean(scoped.scoped && scoped.routable);
  const user = getUser(AppCore, auth);
  const adminOnly = routeRequiresAdmin(route, canonicalPath);

  const access = shouldAllowRoute({
    AppCore,
    Auth: auth,
    route,
    requestedCanonicalPath: canonicalPath,
    requestedPublicPath: publicPath,
    requiresAdmin: adminOnly,
    adminOnly,
  });

  return {
    version: GUARDS_VERSION,

    canonicalPath: redact(canonicalPath),
    publicPath: redact(publicPath),

    blockedLegacy: isBlockedGuardPath(publicPath) || isBlockedGuardPath(canonicalPath),

    userScopedPath: scopedRoutable,
    userScopedRoutable: scopedRoutable,
    isUserHomePath: Boolean(scoped.home),
    requestedSlug: scoped.scoped ? scoped.slug || null : null,
    scopedRestPath: scopedRoutable ? scoped.restPath : null,

    route: route
      ? {
          path: route.path || null,
          name: route.name || null,
          viewKey: route.viewKey || null,
          public: route.public,
          private: route.private,
          requiresAuth: route.requiresAuth,
          guestOnly: route.guestOnly,
          roles: Array.isArray(route.roles) ? route.roles : [],
          adminOnly: Boolean(route.adminOnly),
          requiresAdmin: Boolean(route.requiresAdmin),
        }
      : null,

    auth: {
      authenticated: hasStrictSession(AppCore, auth),
      authSignal: isAuthenticatedSignal(AppCore, auth),
      hasToken: hasToken(AppCore, auth),
      hasUser: Boolean(user),
      userUsable: isUserUsable(user),
      currentRole: currentRole(AppCore, auth) || null,
      currentRoles: currentRoles(AppCore, auth),
      user: publicUser(user, AppCore, auth),
      userHomePath: redact(getUserHomePath(AppCore, auth)),
    },

    routeAccess: {
      public: route ? isPublicRoute(route) : false,
      guestOnly: route ? isGuestOnlyRoute(route) : false,
      requiresAuth: route ? requiresAuth(route) : false,
      roles: route ? routeRoles(route) : [],
      unsupportedRoles: route ? unsupportedRouteRoles(route) : [],
      adminOnly,
      requiresAdmin: adminOnly,
      configuredAdminPath: isConfiguredAdminPath(canonicalPath),
    },

    access,

    policy: {
      guardOnly: true,
      configOwnsPathNormalization: true,
      configOwnsUserScopeParsing: true,
      configOwnsBlockedRoutes: true,
      configOwnsAdminRoutes: true,

      ownAuth: false,
      ownStorage: false,
      ownTransport: false,
      ownRouterNavigation: false,
      ownRender: false,
      ownHistory: false,

      strictAuth: true,
      tokenAndUserRequired: true,
      userUsableRequired: true,

      invalidUserWhenDisabledTrue: true,
      invalidUserWhenSuspendedTrue: true,
      invalidUserWhenActiveFalse: true,
      invalidUserWhenEnabledFalse: true,
      invalidUserStatuses: ["suspended", "desactivado"],

      roles: [...VALID_ROLES],
      rolesStrict: true,

      adminRoutesFromConfig: true,
      adminRoutesRequireAdmin: true,
      clientesAdminOnly: true,
      usuariosAdminOnly: Boolean(CONFIG_ROUTES.usuarios),
      servidorAdminOnly: Boolean(CONFIG_ROUTES.servidor || CONFIG_ROUTES.server),

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      canonicalizesOnlyKnownUserScopeForAccess: true,
      respectsRoutableUserScope: true,
      checksScopedRestPathForBlockedLegacy: true,

      validatesRealUserSlug: false,
      realSlugValidationOwner: "router/index.js",

      homeInternalPath: HOME_PATH,
      homeVisiblePattern: `${USER_PREFIX}{user.slug}`,

      blockedRoutesDelegatedToCoreConfig: true,
      noLocalBlockedRouteList: true,

      blocksHomeAlias: true,
      blocks403Route: true,
      blocks404Route: true,

      noHomeAlias: true,
      noAliases: true,
      no403: true,
      no404: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,

      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  GUARDS_VERSION,
  GUARD_REASONS,

  shouldAllowRoute,

  normalizeGuardRoles,

  normalizePublicPath,
  canonicalGuardPath,
  getUserScopedRouteInfo,
  isUserHomePath,
  isUserScopedPath,
  isAdminGuardPath,
  extractSlugFromPath,

  getGuardsSnapshot,
};
