/* =========================================================
   Onion Support - Router Guards
   Archivo: /src/router/guards.js

   Responsabilidad:
   - Capa mínima Router ↔ Auth.
   - Evaluar route.public / route.guestOnly / route.requiresAuth / route.roles.
   - Auth real delegada en Auth/AppCore.
   - Auth estricta: señal Auth válida + token usable + user usable.
   - Usuario inválido si disabled === true o status === "disabled".
   - Roles únicos exactos: admin / user.
   - Canonicalizar rutas /@{slug} y /@{slug}/{ruta} para evaluación.
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
   - Sin alias /home.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  ROUTES,
  USER_HOME_PREFIX,
} from "../core/config.js";

export const GUARDS_VERSION = "router.guards.v6";

const LOGIN_PATH = ROUTES.login || "/login";
const HOME_PATH = ROUTES.home || "/";
const VALID_ROLES = Object.freeze(["admin", "user"]);

export const GUARD_REASONS = Object.freeze({
  allow: "allowed",
  routeNotFound: "route-not-found",
  publicRoute: "public-route",
  guestOnly: "guest-only",
  alreadyAuthenticated: "already-authenticated",
  notAuthenticated: "not-authenticated",
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
  const output = String(value ?? "").trim();
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
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   PATHS
========================================================= */

function normalizeHashPath(path = HOME_PATH) {
  const value = cleanText(path, HOME_PATH);

  if (value.startsWith("#!")) return value.replace(/^#!\/?/, "/") || HOME_PATH;
  if (value.startsWith("#/")) return value.slice(1) || HOME_PATH;

  return value;
}

export function normalizePublicPath(path = HOME_PATH) {
  let value = normalizeHashPath(path);

  if (!value || value.startsWith("//")) return HOME_PATH;

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return HOME_PATH;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  return value || HOME_PATH;
}

function normalizeCanonicalPath(path = HOME_PATH) {
  let value = normalizePublicPath(path).split("?")[0].split("#")[0] || HOME_PATH;

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
  const canonical = normalizeCanonicalPath(path);

  if (!canonical.startsWith(USER_HOME_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: canonical,
      lookupPath: canonical,
    };
  }

  const rest = canonical.slice(USER_HOME_PREFIX.length);
  const [slugSegment = "", ...restSegments] = rest.split("/");
  const slug = normalizeUserSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: canonical,
      lookupPath: canonical,
    };
  }

  const restPath = restSegments.length
    ? normalizeCanonicalPath(`/${restSegments.join("/")}`)
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
  return Boolean(getUserScopedRouteInfo(path).home);
}

export function isUserScopedPath(path = HOME_PATH) {
  return Boolean(getUserScopedRouteInfo(path).scoped);
}

export function canonicalGuardPath(path = HOME_PATH) {
  const canonical = normalizeCanonicalPath(path);
  const scoped = getUserScopedRouteInfo(canonical);

  return scoped.scoped ? scoped.lookupPath : canonical;
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
      !hasSensitiveQuery(value)
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

function isAuthenticated(AppCore = null, Auth = null) {
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

  return Boolean(cleanText(token, ""));
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

  if (user.disabled === true) return false;

  const status = cleanText(user.status, "").toLowerCase();

  if (status === "disabled") return false;

  return true;
}

function hasStrictSession(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  if (!isAuthenticated(AppCore, auth)) return false;
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

  return slug ? `${USER_HOME_PREFIX}${slug}` : HOME_PATH;
}

function buildLoginRedirect(AppCore = null, Auth = null, publicPath = HOME_PATH) {
  const auth = resolveAuth(AppCore, Auth);
  const target = safeRedirect(publicPath, getUserHomePath(AppCore, auth));

  if (canonicalGuardPath(target) === LOGIN_PATH) {
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

/* =========================================================
   RESULTS
========================================================= */

function publicUser(user = null, AppCore = null, Auth = null) {
  if (!isObject(user)) return null;

  return {
    hasId: Boolean(user.id || user.userId),
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

  return {
    version: GUARDS_VERSION,

    routePath: route ? routePath(route) : null,

    canonicalPath: redact(canonicalPath),
    publicPath: redact(publicPath),

    requestedSlug: scoped.slug || null,
    scopedPath: Boolean(scoped.scoped),
    scopedRestPath: scoped.scoped ? scoped.restPath : null,

    authenticated: hasStrictSession(AppCore, auth),
    authSignal: isAuthenticated(AppCore, auth),
    hasToken: hasToken(AppCore, auth),
    hasUser: Boolean(user),
    userUsable: isUserUsable(user),

    currentRole: currentRole(AppCore, auth) || null,
    currentRoles: currentRoles(AppCore, auth),

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

  if (publicRoute && !routeRequiresAuth) {
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

  if ((routeRequiresAuth || roles.length) && !logged) {
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

  const access = shouldAllowRoute({
    AppCore,
    Auth: auth,
    route,
    requestedCanonicalPath: canonicalPath,
    requestedPublicPath: publicPath,
  });

  return {
    version: GUARDS_VERSION,

    canonicalPath: redact(canonicalPath),
    publicPath: redact(publicPath),

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
        }
      : null,

    auth: {
      authenticated: hasStrictSession(AppCore, auth),
      authSignal: isAuthenticated(AppCore, auth),
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
    },

    access,

    policy: {
      guardOnly: true,

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
      invalidUserWhenStatusDisabled: true,

      roles: [...VALID_ROLES],
      rolesStrict: true,

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      canonicalizesUserScopeForAccess: true,

      validatesRealUserSlug: false,
      realSlugValidationOwner: "router/index.js",

      noHomeAlias: true,
      noAliases: true,
      no403: true,
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
  extractSlugFromPath,

  getGuardsSnapshot,
};
