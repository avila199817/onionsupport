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

function normalizePublicPath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  try {
    if (/^https?:\/\//i.test(value)) {
      const parsed = new URL(value);
      value = `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch {
    // noop
  }

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function normalizeCanonicalPath(path = "/") {
  let value = normalizePublicPath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
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

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
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

  try {
    const direct =
      auth?.getToken?.() ||
      auth?.getAccessToken?.() ||
      "";

    if (cleanToken(direct)) return cleanToken(direct);
  } catch {
    // fallback abajo
  }

  try {
    const header = auth?.getAuthHeader?.();
    const bearer = isObject(header)
      ? header.Authorization || header.authorization || ""
      : "";

    if (cleanToken(bearer)) return cleanToken(bearer);
  } catch {
    // fallback abajo
  }

  return cleanToken(
    state.token ||
      state.accessToken ||
      state.access_token ||
      ""
  );
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
    const user =
      auth?.getUser?.() ||
      auth?.getCurrentUser?.() ||
      null;

    if (userUsable(user)) return user;
  } catch {
    // fallback abajo
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

function isAuthenticated(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  try {
    if (auth?.isAuthenticated?.() === false) return false;
  } catch {
    // fallback abajo
  }

  return Boolean(getToken(AppCore, auth) && getUser(AppCore, auth));
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(role = "") {
  const clean = String(role || "").toLowerCase();
  return VALID_ROLES.includes(clean) ? clean : "";
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
  return asArray(route?.roles).filter((role) => role !== undefined && role !== null && role !== "");
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

  try {
    const fromAuth =
      normalizeRole(auth?.getRole?.()) ||
      normalizeRole(auth?.getCurrentRole?.());

    if (fromAuth) return fromAuth;
  } catch {
    // fallback abajo
  }

  return (
    normalizeRole(state.role) ||
    normalizeRole(user?.role) ||
    normalizeRole(user?.rol) ||
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
  return normalizeCanonicalPath(route?.path || route?.canonicalPath || "/");
}

/* =========================================================
   RESULTS
========================================================= */

function publicUser(user = null) {
  if (!userUsable(user)) return null;

  return {
    id: user.id || user.userId || null,
    userId: user.userId || user.id || null,
    username: user.username || user.slug || null,
    role: user.role || user.rol || null,
  };
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

    authenticated: isAuthenticated(AppCore, auth),
    hasToken: Boolean(token),
    hasUser: Boolean(user),

    currentRole: currentRole(AppCore, auth) || null,
    currentRoles: currentRoles(AppCore, auth),

    user: publicUser(user),

    ...extra,
  };
}

function allow({ route = null, reason = GUARD_REASONS.allow, canonicalPath = "/", publicPath = "/", extra = {} } = {}) {
  return {
    allowed: true,
    reason,
    route,
    redirectTo: null,
    canonicalPath,
    publicPath,
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
} = {}) {
  const auth = resolveAuth(AppCore, Auth);
  const canonicalPath = normalizeCanonicalPath(requestedCanonicalPath);
  const publicPath = normalizePublicPath(requestedPublicPath || canonicalPath);

  if (!route) {
    return deny({
      reason: GUARD_REASONS.routeNotFound,
      route: null,
      redirectTo: null,
      canonicalPath,
      publicPath,
      extra: details({
        AppCore,
        Auth: auth,
        route: null,
        canonicalPath,
        publicPath,
      }),
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
      redirectTo: HOME_PATH,
      canonicalPath,
      publicPath,
      extra: details({
        AppCore,
        Auth: auth,
        route,
        canonicalPath,
        publicPath,
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
        extra: { unsupportedRoles },
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
    reason: GUARD_REASONS.allow,
    route,
    canonicalPath,
    publicPath,
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
      authenticated: isAuthenticated(AppCore, auth),
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
