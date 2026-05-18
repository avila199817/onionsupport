/* =========================================================
   Onion Support - Router Guards
   Archivo: /src/router/guards.js

   Responsabilidad:
   - Capa mínima Router ↔ Auth.
   - Evaluar route.public / route.guestOnly / route.requiresAuth / route.roles.
   - Auth estricta: token usable + user usable.
   - Roles únicos exactos: admin / user.
   - Canonicalizar /@{slug} como Home para evaluación de ruta.
   - No validar aquí si /@{slug} coincide con el usuario real.
   - La validación real del slug pertenece a router/index.js.
   - No inventar slug.
   - Sin fetch.
   - Sin refresh.
   - Sin restore.
   - Sin storage.
   - Sin Toast.
   - Sin navegación.
   - Sin /403.
   - Sin alias /home.
   - Sin 2FA/MFA/OTP.
========================================================= */

export const GUARDS_VERSION = "router.guards.v2";

const LOGIN_PATH = "/login";
const HOME_PATH = "/";
const USER_HOME_PREFIX = "/@";

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

function text(value = "", fallback = "") {
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
      AppCore?.Auth ||
      AppCore?.auth ||
      AppCore?.modules?.get?.("Auth") ||
      AppCore?.modules?.get?.("auth") ||
      null
    );
  } catch {
    return Auth || null;
  }
}

/* =========================================================
   PATHS
========================================================= */

function normalizeHashPath(path = HOME_PATH) {
  const value = text(path, HOME_PATH);

  if (value.startsWith("#!")) return value.replace(/^#!\/?/, "/") || HOME_PATH;
  if (value.startsWith("#/")) return value.slice(1) || HOME_PATH;

  return value;
}

function normalizePublicPath(path = HOME_PATH) {
  let value = normalizeHashPath(path);

  if (value.startsWith("//")) return HOME_PATH;

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return HOME_PATH;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

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
  const slug = text(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

function extractSlugFromPath(path = HOME_PATH) {
  const canonical = normalizeCanonicalPath(path);

  if (!canonical.startsWith(USER_HOME_PREFIX)) return "";

  const slug = canonical.slice(USER_HOME_PREFIX.length);

  if (!slug || slug.includes("/")) return "";

  return normalizeUserSlug(slug);
}

function isUserHomePath(path = HOME_PATH) {
  return Boolean(extractSlugFromPath(path));
}

function canonicalGuardPath(path = HOME_PATH) {
  const canonical = normalizeCanonicalPath(path);
  return isUserHomePath(canonical) ? HOME_PATH : canonical;
}

function isSafeInternalPath(path = "") {
  const value = text(path, "");

  return Boolean(
    value &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
      !/[\r\n\t\\]/.test(value)
  );
}

function safeRedirect(path = "", fallback = HOME_PATH) {
  const raw = text(path, "");
  const backup = normalizePublicPath(fallback || HOME_PATH);

  if (!isSafeInternalPath(raw)) return backup;

  const normalized = normalizePublicPath(raw);

  return isSafeInternalPath(normalized) ? normalized : backup;
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   AUTH STATE
========================================================= */

function cleanToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";

  if (
    ["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
      token.toLowerCase()
    )
  ) {
    return "";
  }

  return token;
}

function getToken(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const state = readState(AppCore);

  const header = safeCall(auth?.getAuthHeader?.bind?.(auth) || auth?.getAuthHeader);

  const candidates = [
    safeCall(auth?.getToken?.bind?.(auth) || auth?.getToken),
    safeCall(auth?.getAccessToken?.bind?.(auth) || auth?.getAccessToken),

    isObject(header)
      ? header.Authorization || header.authorization
      : header,

    auth?.token,
    auth?.accessToken,
    auth?.session?.token,
    auth?.session?.accessToken,

    state.token,
    state.accessToken,
    state.access_token,
    state.session?.token,
    state.session?.accessToken,
  ];

  for (const candidate of candidates) {
    const token = cleanToken(candidate);

    if (token) return token;
  }

  return "";
}

function unwrapUser(payload = null) {
  if (!isObject(payload)) return null;

  const candidates = [
    payload.user,
    payload.usuario,
    payload.currentUser,
    payload.authUser,
    payload.sessionUser,
    payload.session?.user,
    payload.data?.user,
    payload.payload?.user,
    payload.me,
    payload.account,
    payload,
  ];

  return candidates.find(isObject) || null;
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = text(user.status || user.estado, "").toLowerCase();

  return Boolean(
    user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.active === false ||
      status === "disabled" ||
      status === "deleted" ||
      status === "archived"
  );
}

function userUsable(user = null) {
  if (!isObject(user) || userDisabled(user)) return false;

  return Boolean(
    text(user.id, "") ||
      text(user.userId, "") ||
      text(user.username, "") ||
      text(user.slug, "") ||
      text(user.lookup?.slug, "")
  );
}

function getUser(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const state = readState(AppCore);

  const candidates = [
    safeCall(auth?.getUser?.bind?.(auth) || auth?.getUser),
    safeCall(auth?.getCurrentUser?.bind?.(auth) || auth?.getCurrentUser),

    auth?.user,
    auth?.currentUser,
    auth?.session?.user,
    auth?.state?.user,

    state.user,
    state.currentUser,
    state.authUser,
    state.sessionUser,
    state.session?.user,
    state.sessionData?.user,
    state.auth?.user,

    AppCore?.user,
    AppCore?.currentUser,
  ];

  for (const candidate of candidates) {
    const user = unwrapUser(candidate);

    if (userUsable(user)) return user;
  }

  return null;
}

function isAuthenticated(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  try {
    if (isFunction(auth?.isAuthenticated) && auth.isAuthenticated() === false) {
      return false;
    }
  } catch {
    return false;
  }

  return Boolean(getToken(AppCore, auth) && getUser(AppCore, auth));
}

/* =========================================================
   USER HOME
========================================================= */

function extractUserSlug(user = null) {
  if (!isObject(user)) return "";

  return normalizeUserSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      ""
  );
}

function getUserHomePath(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const slug = extractUserSlug(getUser(AppCore, auth));

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

  const role = text(value, "").toLowerCase();

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
  return asArray(route?.roles).filter((role) => {
    return role !== undefined && role !== null && role !== "";
  });
}

function routeRoles(route = null) {
  return normalizeGuardRoles(rawRouteRoles(route));
}

function unsupportedRouteRoles(route = null) {
  return rawRouteRoles(route).filter((role) => !normalizeRole(role));
}

function currentRole(AppCore = null, Auth = null) {
  if (!isAuthenticated(AppCore, Auth)) return "";

  const auth = resolveAuth(AppCore, Auth);
  const state = readState(AppCore);
  const user = getUser(AppCore, auth);

  const candidates = [
    safeCall(auth?.getRole?.bind?.(auth) || auth?.getRole),
    safeCall(auth?.getCurrentRole?.bind?.(auth) || auth?.getCurrentRole),

    auth?.role,
    auth?.currentRole,

    user?.role,
    user?.rol,
    user?.roles,

    state.role,
    state.rol,
    state.roles,
    state.user?.role,
    state.user?.rol,
    state.user?.roles,
  ];

  for (const candidate of candidates) {
    const role = normalizeRole(candidate);

    if (role) return role;
  }

  return "user";
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

function publicUser(user = null) {
  if (!userUsable(user)) return null;

  return {
    id: user.id || user.userId || null,
    userId: user.userId || user.id || null,
    username: user.username || null,
    slug: extractUserSlug(user) || null,
    role: normalizeRole(user.role || user.rol || user.roles) || null,
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
  const token = getToken(AppCore, auth);

  return {
    version: GUARDS_VERSION,

    routePath: route ? routePath(route) : null,

    canonicalPath: redact(canonicalPath),
    publicPath: redact(publicPath),
    requestedSlug: extractSlugFromPath(publicPath) || null,

    authenticated: isAuthenticated(AppCore, auth),
    hasToken: Boolean(token),
    hasUser: Boolean(user),

    currentRole: currentRole(AppCore, auth) || null,
    currentRoles: currentRoles(AppCore, auth),

    user: publicUser(user),
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

  const canonicalPath = canonicalGuardPath(requestedCanonicalPath);
  const publicPath = normalizePublicPath(requestedPublicPath || canonicalPath);

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

  const logged = isAuthenticated(AppCore, auth);
  const publicRoute = isPublicRoute(route);
  const guestOnly = isGuestOnlyRoute(route);
  const routeRequiresAuth = requiresAuth(route);
  const roles = routeRoles(route);
  const unsupportedRoles = unsupportedRouteRoles(route);

  if (guestOnly && logged) {
    return deny({
      reason: GUARD_REASONS.alreadyAuthenticated,
      route,
      redirectTo: getUserHomePath(AppCore, auth),
      canonicalPath,
      publicPath,
      details: buildDetails({
        ...common,
        extra: {
          guestOnly: true,
        },
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

  if (unsupportedRoles.length) {
    return deny({
      reason: GUARD_REASONS.unsupportedRole,
      route,
      canonicalPath,
      publicPath,
      details: buildDetails({
        ...common,
        extra: {
          unsupportedRoles,
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
  const canonicalPath = canonicalGuardPath(requestedCanonicalPath);
  const publicPath = normalizePublicPath(requestedPublicPath || canonicalPath);

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
    isUserHomePath: isUserHomePath(publicPath),
    requestedSlug: extractSlugFromPath(publicPath) || null,

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
      authenticated: isAuthenticated(AppCore, auth),
      hasToken: Boolean(getToken(AppCore, auth)),
      hasUser: Boolean(getUser(AppCore, auth)),
      currentRole: currentRole(AppCore, auth) || null,
      currentRoles: currentRoles(AppCore, auth),
      user: publicUser(getUser(AppCore, auth)),
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
      ownAuth: false,
      ownStorage: false,
      ownTransport: false,
      ownRouterNavigation: false,

      roles: [...VALID_ROLES],

      userSlugHome: true,
      canonicalizesUserHome: true,
      validatesRealUserSlug: false,
      realSlugValidationOwner: "router/index.js",

      noHomeAlias: true,
      noAliases: true,
      no403: true,
      no2fa: true,
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
  isUserHomePath,
  extractSlugFromPath,

  getGuardsSnapshot,
};
