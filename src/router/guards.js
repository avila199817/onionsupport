/* =========================================================
   Onion Support - Router Guards
   Archivo: /src/router/guards.js

   Responsabilidad:
   - Capa mínima Router ↔ Auth.
   - Evaluar route.public / route.guestOnly / route.requiresAuth / route.roles.
   - Evaluar route.adminOnly / route.requiresAdmin / rutas admin de core/config.js.
   - Auth real delegada en Auth/AppCore.
   - Auth estricta: señal Auth válida + access token usable + user usable.
   - Usuario inválido si disabled/deleted/archived/active=false.
   - Roles únicos exactos: admin / user.
   - Rutas admin: sólo admin.
   - Delegar normalización de rutas/user-scope/bloqueos en core/config.js.
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
  ADMIN_ROUTES as CONFIG_ADMIN_ROUTES,
  BLOCKED_FRONTEND_ROUTES as CONFIG_BLOCKED_FRONTEND_ROUTES,
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

export const GUARDS_VERSION = "router.guards.v9";

const LOGIN_PATH = ROUTES.login || "/login";
const HOME_PATH = "/";
const USER_PREFIX = USER_HOME_PREFIX || "/@";

const VALID_ROLES = Object.freeze(["admin", "user"]);

const BLOCKED_LEGACY_PATHS = new Set(
  Array.isArray(CONFIG_BLOCKED_FRONTEND_ROUTES) &&
    CONFIG_BLOCKED_FRONTEND_ROUTES.length
    ? CONFIG_BLOCKED_FRONTEND_ROUTES
    : [
        "/home",
        "/403",
        "/404",
        "/2fa",
        "/mfa",
        "/otp",
      ]
);

const CONFIG_ADMIN_ROUTE_SET = new Set(
  (Array.isArray(CONFIG_ADMIN_ROUTES) ? CONFIG_ADMIN_ROUTES : [])
    .filter(Boolean)
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
    return (
      Auth ||
      AppCore?.auth ||
      AppCore?.Auth ||
      AppCore?.modules?.get?.("auth") ||
      AppCore?.modules?.get?.("Auth") ||
      null
    );
  } catch {
    return Auth || null;
  }
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
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

function pathFromInput(path = HOME_PATH) {
  try {
    return configRoutePathFromUrlLike(path) || HOME_PATH;
  } catch {
    return HOME_PATH;
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

function isBlockedLegacyPath(path = HOME_PATH) {
  try {
    if (isConfigBlockedRoutePath(path) === true) return true;
  } catch {
    // fallback local
  }

  const canonical = splitPath(path).pathname.toLowerCase();

  if (BLOCKED_LEGACY_PATHS.has(canonical)) return true;

  return (
    canonical.startsWith("/2fa/") ||
    canonical.startsWith("/mfa/") ||
    canonical.startsWith("/otp/")
  );
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

export function getUserScopedRouteInfo(path = HOME_PATH) {
  try {
    const info = getConfigUserScopedRouteInfo(path);

    if (isObject(info)) {
      const restPath = info.restPath || info.canonicalPath || splitPath(path).pathname;
      const lookupPath = info.canonicalPath || info.lookupPath || restPath;

      return {
        scoped: Boolean(info.scoped),
        home: Boolean(info.home),
        slug: cleanText(info.slug, ""),
        restPath,
        lookupPath,
      };
    }
  } catch {
    // fallback abajo
  }

  const pathname = splitPath(path).pathname;

  if (!pathname.startsWith(USER_PREFIX)) {
    return {
      scoped: false,
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
      home: false,
      slug: "",
      restPath: pathname,
      lookupPath: pathname,
    };
  }

  const restPath = restSegments.length
    ? normalizePathname(`/${restSegments.join("/")}`)
    : HOME_PATH;

  return {
    scoped: true,
    home: restPath === HOME_PATH,
    slug,
    restPath,
    lookupPath: restPath,
  };
}

export function extractSlugFromPath(path = HOME_PATH) {
  return getUserScopedRouteInfo(path).slug;
}

export function isUserHomePath(path = HOME_PATH) {
  try {
    return isConfigUserHomeRoute(path) === true;
  } catch {
    return Boolean(getUserScopedRouteInfo(path).home);
  }
}

export function isUserScopedPath(path = HOME_PATH) {
  try {
    return isConfigUserScopedRoute(path) === true;
  } catch {
    return Boolean(getUserScopedRouteInfo(path).scoped);
  }
}

export function canonicalGuardPath(path = HOME_PATH) {
  try {
    return configCanonicalRoutePath(path) || splitPath(path).pathname || HOME_PATH;
  } catch {
    const pathname = splitPath(path).pathname || HOME_PATH;
    const scoped = getUserScopedRouteInfo(pathname);

    return scoped.scoped ? scoped.lookupPath : pathname;
  }
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=/i.test(
    String(value || "")
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
      !isBlockedLegacyPath(value)
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

  const status = cleanText(user.status || user.estado || user.state, "").toLowerCase();

  return !(
    user.disabled === true ||
    user.deleted === true ||
    user.archived === true ||
    user.revoked === true ||
    user.blocked === true ||
    user.banned === true ||
    user.suspended === true ||
    user.active === false ||
    user.enabled === false ||
    Boolean(user.deletedAt) ||
    [
      "disabled",
      "inactive",
      "deleted",
      "archived",
      "revoked",
      "blocked",
      "banned",
      "suspended",
      "desactivado",
      "inactivo",
      "eliminado",
      "archivado",
      "bloqueado",
      "suspendido",
    ].includes(status)
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

  const fromAuth =
    callAuth(AppCore, auth, "getDefaultHome", "") ||
    callAuth(AppCore, auth, "getPostLoginTarget", "") ||
    callAuth(AppCore, auth, "buildUserHomePath", "", getUser(AppCore, auth));

  if (fromAuth && isSafeInternalPath(fromAuth)) {
    return normalizePublicPath(fromAuth);
  }

  const slug = getUserSlug(AppCore, auth);

  try {
    return configBuildUserHomeRoute(slug) || HOME_PATH;
  } catch {
    return slug ? `${USER_PREFIX}${slug}` : HOME_PATH;
  }
}

function buildLoginRedirect(AppCore = null, Auth = null, publicPath = HOME_PATH) {
  const auth = resolveAuth(AppCore, Auth);
  const target = safeRedirect(publicPath, HOME_PATH);

  if (
    canonicalGuardPath(target) === LOGIN_PATH ||
    isBlockedLegacyPath(target)
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

  if (CONFIG_ADMIN_ROUTE_SET.has(canonical)) return true;

  try {
    return isConfigAdminRoute(canonical) === true;
  } catch {
    return false;
  }
}

export function isAdminGuardPath(path = HOME_PATH) {
  const canonical = canonicalGuardPath(path);

  if (isBlockedLegacyPath(canonical)) return false;

  return isConfiguredAdminPath(canonical);
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
    username: user.username || null,
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

  return {
    version: GUARDS_VERSION,

    routePath: route ? routePath(route) : null,

    canonicalPath: redact(canonicalPath),
    publicPath: redact(publicPath),

    requestedSlug: scoped.slug || null,
    scopedPath: Boolean(scoped.scoped),
    scopedRestPath: scoped.scoped ? scoped.restPath : null,

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

    userHomePath: getUserHomePath(AppCore, auth),

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

  if (isBlockedLegacyPath(publicPath) || isBlockedLegacyPath(canonicalPath)) {
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

  if (publicRoute && !routeRequiresAuth && !adminOnlyRoute) {
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

    blockedLegacy: isBlockedLegacyPath(publicPath) || isBlockedLegacyPath(canonicalPath),

    userScopedPath: Boolean(scoped.scoped),
    isUserHomePath: Boolean(scoped.home),
    requestedSlug: scoped.slug || null,
    scopedRestPath: scoped.scoped ? scoped.restPath : null,

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
      userHomePath: getUserHomePath(AppCore, auth),
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
      invalidUserWhenDeletedTrue: true,
      invalidUserWhenArchivedTrue: true,
      invalidUserWhenActiveFalse: true,
      invalidUserWhenEnabledFalse: true,
      invalidUserWhenStatusDisabled: true,

      roles: [...VALID_ROLES],
      rolesStrict: true,

      adminRoutesFromConfig: true,
      adminRoutesRequireAdmin: true,
      clientesAdminOnly: true,
      usuariosAdminOnly: true,
      servidorAdminOnly: true,

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      canonicalizesUserScopeForAccess: true,

      validatesRealUserSlug: false,
      realSlugValidationOwner: "router/index.js",

      homeInternalPath: HOME_PATH,
      homeVisiblePattern: `${USER_PREFIX}{user.slug}`,

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
