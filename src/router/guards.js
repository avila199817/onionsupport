/* =========================================================
   Onion Support - Router Guards
   Archivo: /src/router/guards.js

   Responsabilidad:
   - Capa mínima Router ↔ Auth.
   - Evaluar route.public / route.guestOnly / route.requiresAuth / route.roles.
   - Auth estricta: token usable + user usable.
   - Roles únicos exactos: admin / user.
   - Sin fetch.
   - Sin refresh.
   - Sin restore.
   - Sin storage.
   - Sin Toast.
   - Sin navegación.
   - Sin /403.
   - Sin 2FA/MFA/OTP.
   - Sin aliases.
   - Sin magia negra.
========================================================= */

export const GUARDS_VERSION = "simple";

const LOGIN_PATH = "/login";
const HOME_PATH = "/";

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

function readState(AppCore = null) {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function resolveAuth(AppCore = null, Auth = null) {
  return Auth || AppCore?.Auth || AppCore?.auth || null;
}

/* =========================================================
   PATHS
========================================================= */

function normalizePublicPath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) {
    value = value.slice(1);
  }

  if (value.startsWith("#!")) {
    value = value.replace(/^#!\/?/, "/");
  }

  try {
    if (/^https?:\/\//i.test(value)) {
      const parsed = new URL(value);
      value = `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch {
    // noop
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function normalizeCanonicalPath(path = "/") {
  let value = normalizePublicPath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "");
  }

  return value || "/";
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

function buildLoginRedirect(publicPath = HOME_PATH) {
  const target = safeRedirect(publicPath, HOME_PATH);

  if (normalizeCanonicalPath(target) === LOGIN_PATH) {
    return LOGIN_PATH;
  }

  return `${LOGIN_PATH}?redirect=${encodeURIComponent(target)}`;
}

function redact(path = "") {
  return text(path, "").replace(/([?&#]token=)([^&#\s]+)/gi, "$1***");
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

  let token = "";

  try {
    token =
      auth?.getToken?.() ||
      auth?.getAccessToken?.() ||
      state.token ||
      state.accessToken ||
      state.access_token ||
      state.session?.token ||
      state.session?.accessToken ||
      state.session?.access_token ||
      "";
  } catch {
    token = state.token || state.accessToken || state.access_token || "";
  }

  try {
    if (!token && isFunction(auth?.getAuthHeader)) {
      const header = auth.getAuthHeader();
      token = isObject(header) ? header.Authorization || header.authorization || "" : "";
    }
  } catch {
    // noop
  }

  return cleanToken(token);
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function userUsable(user = null) {
  if (!isObject(user)) return false;
  if (userDisabled(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.slug ||
      user.email
  );
}

function getUser(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const state = readState(AppCore);

  try {
    const user = auth?.getUser?.() || auth?.getCurrentUser?.();

    if (userUsable(user)) return user;
  } catch {
    // noop
  }

  const user =
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    state.session?.user ||
    state.sessionData?.user ||
    null;

  return userUsable(user) ? user : null;
}

function authenticated(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  try {
    if (auth?.isAuthenticated?.() === false) return false;
  } catch {
    // noop
  }

  return Boolean(getToken(AppCore, auth) && getUser(AppCore, auth));
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(role = "") {
  const value = String(role || "").toLowerCase();
  return value === "admin" || value === "user" ? value : "";
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
  const meta = isObject(route?.meta) ? route.meta : {};

  return [
    ...asArray(route?.roles),
    ...asArray(route?.requiredRoles),
    ...asArray(meta.roles),
    ...asArray(meta.requiredRoles),
    route?.role,
    route?.requiredRole,
    meta.role,
    meta.requiredRole,
  ].filter((role) => role !== undefined && role !== null && role !== "");
}

function routeRoles(route = null) {
  return normalizeGuardRoles(rawRouteRoles(route));
}

function unsupportedRouteRoles(route = null) {
  return rawRouteRoles(route).filter((role) => !normalizeRole(role));
}

function currentRoles(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const state = readState(AppCore);
  const user = getUser(AppCore, auth);

  let roles = [];

  try {
    roles = [
      auth?.getRole?.(),
      auth?.getCurrentRole?.(),
      ...asArray(auth?.getRoles?.()),
      ...asArray(auth?.getCurrentRoles?.()),
    ];
  } catch {
    roles = [];
  }

  roles.push(
    state.role,
    ...(Array.isArray(state.roles) ? state.roles : []),
    user?.role,
    ...(Array.isArray(user?.roles) ? user.roles : [])
  );

  const normalized = normalizeGuardRoles(roles);

  if (normalized.includes("admin")) return ["admin"];
  if (normalized.includes("user")) return ["user"];

  return authenticated(AppCore, auth) ? ["user"] : [];
}

function currentRole(AppCore = null, Auth = null) {
  const roles = currentRoles(AppCore, Auth);

  return roles.includes("admin") ? "admin" : roles[0] || "";
}

function hasAllowedRole(AppCore = null, Auth = null, roles = []) {
  const required = normalizeGuardRoles(roles);

  if (!required.length) return true;

  const current = currentRoles(AppCore, Auth);

  if (current.includes("admin")) return true;

  return required.some((role) => current.includes(role));
}

/* =========================================================
   ROUTE FLAGS
========================================================= */

function routeMeta(route = null) {
  return isObject(route?.meta) ? route.meta : {};
}

function isPublicRoute(route = null) {
  const meta = routeMeta(route);

  if (typeof route?.public === "boolean") return route.public;
  if (typeof meta.public === "boolean") return meta.public;
  if (typeof route?.requiresAuth === "boolean") return route.requiresAuth === false;
  if (typeof meta.requiresAuth === "boolean") return meta.requiresAuth === false;

  return false;
}

function isGuestOnlyRoute(route = null) {
  const meta = routeMeta(route);

  return Boolean(
    route?.guestOnly ||
      route?.publicOnly ||
      meta.guestOnly ||
      meta.publicOnly
  );
}

function requiresAuth(route = null) {
  const meta = routeMeta(route);

  if (!route) return false;
  if (typeof route?.requiresAuth === "boolean") return route.requiresAuth;
  if (typeof meta.requiresAuth === "boolean") return meta.requiresAuth;
  if (typeof route?.private === "boolean") return route.private;
  if (typeof meta.private === "boolean") return meta.private;

  return !isPublicRoute(route);
}

/* =========================================================
   RESULTS
========================================================= */

function routePath(route = null) {
  return normalizeCanonicalPath(route?.path || route?.canonicalPath || "/");
}

function details({ AppCore = null, Auth = null, route = null, canonicalPath = "/", publicPath = "", extra = {} } = {}) {
  const auth = resolveAuth(AppCore, Auth);
  const user = getUser(AppCore, auth);
  const token = getToken(AppCore, auth);

  return {
    version: GUARDS_VERSION,
    routePath: route ? routePath(route) : null,
    canonicalPath: redact(canonicalPath),
    publicPath: redact(publicPath),
    authenticated: authenticated(AppCore, auth),
    hasToken: Boolean(token),
    hasUser: Boolean(user),
    currentRole: currentRole(AppCore, auth) || null,
    currentRoles: currentRoles(AppCore, auth),
    user: user
      ? {
          id: user.id || user.userId || null,
          userId: user.userId || user.id || null,
          username: user.username || user.slug || null,
          role: user.role || user.rol || null,
        }
      : null,
    ...extra,
  };
}

function allow({ route = null, canonicalPath = "/", publicPath = "/", getRoute = null, reason = GUARD_REASONS.allow, extra = {} } = {}) {
  return {
    allowed: true,
    reason,
    route,
    redirectTo: null,
    canonicalPath,
    publicPath,
    getRoute: isFunction(getRoute) ? getRoute : null,
    details: extra,
  };
}

function deny({ reason = "blocked", route = null, redirectTo = null, canonicalPath = "/", publicPath = "/", extra = {} } = {}) {
  return {
    allowed: false,
    reason,
    route,
    redirectTo,
    canonicalPath,
    publicPath,
    details: extra,
  };
}

/* =========================================================
   MAIN
========================================================= */

export function shouldAllowRoute({
  AppCore = null,
  Auth = null,
  route = null,
  requestedCanonicalPath = "/",
  requestedPublicPath = null,
  getRoute = null,
} = {}) {
  const auth = resolveAuth(AppCore, Auth);
  const canonicalPath = normalizeCanonicalPath(requestedCanonicalPath);
  const publicPath = normalizePublicPath(requestedPublicPath || canonicalPath);

  if (!route) {
    return allow({
      route: null,
      canonicalPath,
      publicPath,
      getRoute,
      reason: GUARD_REASONS.routeNotFound,
      extra: details({
        AppCore,
        Auth: auth,
        route: null,
        canonicalPath,
        publicPath,
      }),
    });
  }

  const logged = authenticated(AppCore, auth);
  const publicRoute = isPublicRoute(route);
  const guestOnly = isGuestOnlyRoute(route);
  const routeRequiresAuth = requiresAuth(route);
  const roles = routeRoles(route);
  const unsupportedRoles = unsupportedRouteRoles(route);

  if (guestOnly && logged) {
    return deny({
      reason: GUARD_REASONS.alreadyAuthenticated,
      route,
      redirectTo: HOME_PATH,
      canonicalPath,
      publicPath,
      extra: details({
        AppCore,
        Auth: auth,
        route,
        canonicalPath,
        publicPath,
        extra: {
          guestOnly: true,
        },
      }),
    });
  }

  if (publicRoute && !routeRequiresAuth) {
    return allow({
      route,
      canonicalPath,
      publicPath,
      getRoute,
      reason: guestOnly ? GUARD_REASONS.guestOnly : GUARD_REASONS.publicRoute,
      extra: details({
        AppCore,
        Auth: auth,
        route,
        canonicalPath,
        publicPath,
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
      redirectTo: null,
      canonicalPath,
      publicPath,
      extra: details({
        AppCore,
        Auth: auth,
        route,
        canonicalPath,
        publicPath,
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
      redirectTo: buildLoginRedirect(publicPath),
      canonicalPath,
      publicPath,
      extra: details({
        AppCore,
        Auth: auth,
        route,
        canonicalPath,
        publicPath,
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
      redirectTo: null,
      canonicalPath,
      publicPath,
      extra: details({
        AppCore,
        Auth: auth,
        route,
        canonicalPath,
        publicPath,
        extra: {
          roles,
          currentRoles: currentRoles(AppCore, auth),
        },
      }),
    });
  }

  return allow({
    route,
    canonicalPath,
    publicPath,
    getRoute,
    reason: GUARD_REASONS.allow,
    extra: details({
      AppCore,
      Auth: auth,
      route,
      canonicalPath,
      publicPath,
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
  requestedCanonicalPath = AppCore?.state?.route || "/",
  requestedPublicPath = AppCore?.state?.publicPath || requestedCanonicalPath,
  getRoute = null,
} = {}) {
  const auth = resolveAuth(AppCore, Auth);
  const canonicalPath = normalizeCanonicalPath(requestedCanonicalPath);
  const publicPath = normalizePublicPath(requestedPublicPath || canonicalPath);
  const access = shouldAllowRoute({
    AppCore,
    Auth: auth,
    route,
    requestedCanonicalPath: canonicalPath,
    requestedPublicPath: publicPath,
    getRoute,
  });

  return {
    version: GUARDS_VERSION,

    canonicalPath: redact(canonicalPath),
    publicPath: redact(publicPath),

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
      authenticated: authenticated(AppCore, auth),
      hasToken: Boolean(getToken(AppCore, auth)),
      hasUser: Boolean(getUser(AppCore, auth)),
      currentRole: currentRole(AppCore, auth) || null,
      currentRoles: currentRoles(AppCore, auth),
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
      noAliases: true,
      no403: true,
      no2fa: true,
    },
  };
}

export default {
  GUARDS_VERSION,
  GUARD_REASONS,

  shouldAllowRoute,
  normalizeGuardRoles,
  getGuardsSnapshot,
};
