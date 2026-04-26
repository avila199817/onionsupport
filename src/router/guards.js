/* =========================================================
   Onion SPA - Router Guards
   Archivo: src/router/guards.js

   RESPONSABILIDADES:
   - resolver acceso a rutas
   - guards auth / guest / roles
   - redirects centralizados
   - tolerancia config heterogénea
   - salida estable para Router
   - permitir rutas públicas técnicas aunque exista sesión
   - no bloquear /activate-account, /reset-password, confirm reset
   - no bloquear /activate-account/<token>
   - no bloquear /reset-password/confirm/<token>
   - bloquear vistas admin aunque el rol venga como alias
   - evitar redirects agresivos durante transición de login

   HARDENING EXTREMO:
   - rutas públicas por defecto
   - normalización robusta de roles
   - soporte meta.requiresAuth / guestOnly / roles
   - soporte roles en user.role / user.rol / user.roles / permissions
   - soporte flags isAdmin / admin / canManageUsers / canAccessUsers
   - aliases admin: admin, administrator, administrador, superadmin, owner, root
   - redirects consistentes
   - prioridad clara entre auth / guest / roles
   - compatibilidad route.public / route.private / meta.public
   - fallback seguro si Auth falla
   - bypass seguro para rutas públicas técnicas
   - preserva redirect al mandar a login
========================================================= */

import {
  getRouteNames,
  normalizeCanonicalPath,
  getDefaultHomeTarget,
  buildLoginUrl,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const LOGIN_PATH = "/login";

const PUBLIC_TECHNICAL_ROUTES = new Set([
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
]);

const PUBLIC_TECHNICAL_PREFIXES = [
  "/activate-account/",
  "/reset-password/confirm/",
];

const ADMIN_ROLE_KEYS = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super_administrador",
  "owner",
  "root",
]);

const SUPPORT_ROLE_KEYS = new Set([
  "support",
  "soporte",
  "agent",
  "agente",
  "helpdesk",
  "operator",
  "operador",
]);

const MANAGER_ROLE_KEYS = new Set([
  "manager",
  "gestor",
  "gerente",
  "lead",
]);

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí"].includes(key)) return true;
    if (["false", "0", "no"].includes(key)) return false;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function stripSearchAndHash(path = "/") {
  const raw = safeText(path, "/") || "/";

  let value = raw.split("?")[0].split("#")[0] || "/";

  value = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function normalizePublicPath(path = "/") {
  const raw = safeText(path, "/") || "/";

  if (!raw.startsWith("/")) {
    return `/${raw}`;
  }

  return raw;
}

function sameCanonicalPath(a = "/", b = "/") {
  return stripSearchAndHash(a) === stripSearchAndHash(b);
}

/* =========================================================
   RUNTIME FLAGS
========================================================= */

function getRuntimeFlags(AppCore = null) {
  const state = safeObject(AppCore?.state);

  return {
    loginInProgress: Boolean(
      state.loginInProgress ||
        state.authLoginInProgress ||
        state.isLoggingIn
    ),

    loginNavigationHandled: Boolean(
      state.loginNavigationHandled ||
        state.authLoginNavigationHandled
    ),

    bootNavigationHandled: Boolean(
      state.bootNavigationHandled
    ),

    initialRouteRendered: Boolean(
      state.initialRouteRendered
    ),
  };
}

function isLoginTransitionActive(AppCore = null) {
  const flags = getRuntimeFlags(AppCore);

  return Boolean(
    flags.loginInProgress ||
      flags.loginNavigationHandled
  );
}

/* =========================================================
   ROLE NORMALIZATION
========================================================= */

function normalizeRole(value) {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoles(value) {
  return toArray(value)
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);
}

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(normalizeRole(value));
}

function isSupportRole(value = "") {
  return SUPPORT_ROLE_KEYS.has(normalizeRole(value));
}

function isManagerRole(value = "") {
  return MANAGER_ROLE_KEYS.has(normalizeRole(value));
}

function expandRoleAliases(roles = []) {
  const normalized = normalizeRoles(roles);
  const result = new Set(normalized);

  if (normalized.some(isAdminRole)) {
    for (const role of ADMIN_ROLE_KEYS) {
      result.add(role);
    }

    result.add("admin");
  }

  if (normalized.some(isSupportRole)) {
    for (const role of SUPPORT_ROLE_KEYS) {
      result.add(role);
    }

    result.add("support");
  }

  if (normalized.some(isManagerRole)) {
    for (const role of MANAGER_ROLE_KEYS) {
      result.add(role);
    }

    result.add("manager");
  }

  return Array.from(result).filter(Boolean);
}

/* =========================================================
   ROUTE META
========================================================= */

function routeMeta(route) {
  return route?.meta && typeof route.meta === "object"
    ? route.meta
    : {};
}

function isRouteExplicitlyPublic(route) {
  const meta = routeMeta(route);

  if (typeof route?.public === "boolean") {
    return route.public;
  }

  if (typeof meta.public === "boolean") {
    return meta.public;
  }

  return false;
}

function getRouteRoles(route) {
  const meta = routeMeta(route);

  return expandRoleAliases(
    route?.roles ??
      route?.allowRoles ??
      meta.roles ??
      meta.allowRoles ??
      meta.requireRoles ??
      []
  );
}

function routeRequiresAuth(route) {
  const meta = routeMeta(route);

  if (typeof route?.requiresAuth === "boolean") {
    return route.requiresAuth;
  }

  if (typeof route?.private === "boolean") {
    return route.private;
  }

  if (typeof meta.requiresAuth === "boolean") {
    return meta.requiresAuth;
  }

  if (typeof meta.private === "boolean") {
    return meta.private;
  }

  if (getRouteRoles(route).length > 0) {
    return true;
  }

  if (isRouteExplicitlyPublic(route)) {
    return false;
  }

  return false;
}

function routeGuestOnly(route) {
  const meta = routeMeta(route);

  return Boolean(
    route?.guestOnly ??
      route?.publicOnly ??
      meta.guestOnly ??
      meta.publicOnly ??
      false
  );
}

function isPublicTechnicalPath(path = "/") {
  const clean = stripSearchAndHash(path);

  if (PUBLIC_TECHNICAL_ROUTES.has(clean)) {
    return true;
  }

  return PUBLIC_TECHNICAL_PREFIXES.some((prefix) => {
    return clean.startsWith(prefix);
  });
}

function isPublicTechnicalRoute(route, canonicalPath = "/", publicPath = null) {
  const canonical = stripSearchAndHash(canonicalPath);
  const visible = stripSearchAndHash(publicPath || canonicalPath);

  if (
    isPublicTechnicalPath(canonical) ||
    isPublicTechnicalPath(visible)
  ) {
    return true;
  }

  /*
    Fallback adicional:
    Si la tabla de rutas declara explícitamente pública una ruta técnica,
    también se permite. Pero ya no dependemos de route.public para proteger
    activation/reset.
  */
  if (
    route &&
    isRouteExplicitlyPublic(route) &&
    (
      isPublicTechnicalPath(route.path) ||
      isPublicTechnicalPath(route.canonicalPath)
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   AUTH / USER RESOLUTION
========================================================= */

function getAuthUser(Auth = null) {
  try {
    if (typeof Auth?.getUser === "function") {
      return safeObject(Auth.getUser());
    }
  } catch {}

  try {
    if (typeof Auth?.getCurrentUser === "function") {
      return safeObject(Auth.getCurrentUser());
    }
  } catch {}

  try {
    if (typeof Auth?.currentUser === "function") {
      return safeObject(Auth.currentUser());
    }
  } catch {}

  return {};
}

function getCurrentUser(AppCore = null, Auth = null) {
  return safeObject(
    first(
      AppCore?.state?.user,
      AppCore?.state?.currentUser,
      AppCore?.state?.sessionUser,
      AppCore?.state?.authUser,
      AppCore?.state?.session?.user,
      getAuthUser(Auth)
    )
  );
}

function getUserRoleCandidates(AppCore = null, Auth = null) {
  const user = getCurrentUser(AppCore, Auth);

  const roleCandidates = [
    AppCore?.state?.role,
    AppCore?.state?.rol,
    AppCore?.state?.userRole,
    AppCore?.state?.type,

    AppCore?.state?.session?.role,
    AppCore?.state?.session?.rol,
    AppCore?.state?.session?.userRole,

    user?.role,
    user?.rol,
    user?.userRole,
    user?.type,
    user?.userType,

    Auth?.role,
    Auth?.userRole,
  ];

  try {
    if (typeof Auth?.getRole === "function") {
      roleCandidates.push(Auth.getRole());
    }
  } catch {}

  try {
    if (typeof Auth?.getCurrentRole === "function") {
      roleCandidates.push(Auth.getCurrentRole());
    }
  } catch {}

  const roleArrays = [
    AppCore?.state?.roles,
    AppCore?.state?.permissions,
    AppCore?.state?.scopes,

    AppCore?.state?.session?.roles,
    AppCore?.state?.session?.permissions,
    AppCore?.state?.session?.scopes,

    user?.roles,
    user?.permissions,
    user?.scopes,

    Auth?.roles,
    Auth?.permissions,
    Auth?.scopes,
  ];

  let roles = [
    ...roleCandidates,
    ...roleArrays.flatMap((value) => toArray(value)),
  ];

  const adminFlag = [
    AppCore?.state?.isAdmin,
    AppCore?.state?.admin,
    AppCore?.state?.isSuperAdmin,
    AppCore?.state?.superAdmin,
    AppCore?.state?.canManageUsers,
    AppCore?.state?.canAccessUsers,

    user?.isAdmin,
    user?.admin,
    user?.isSuperAdmin,
    user?.superAdmin,
    user?.canManageUsers,
    user?.canAccessUsers,
  ].some((value) => safeBoolean(value, false));

  if (adminFlag) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function getUserRole(AppCore = null, Auth = null) {
  return getUserRoleCandidates(AppCore, Auth)[0] || "";
}

function hasAnyAllowedRole(AppCore = null, Auth = null, allowedRoles = []) {
  const allowed = expandRoleAliases(allowedRoles);

  if (!allowed.length) {
    return true;
  }

  const userRoles = new Set(
    getUserRoleCandidates(AppCore, Auth)
  );

  return allowed.some((role) => userRoles.has(role));
}

function isAuthenticated(AppCore, Auth) {
  if (typeof Auth?.isAuthenticated === "function") {
    try {
      return Boolean(Auth.isAuthenticated());
    } catch {}
  }

  const stateAuthenticated = first(
    AppCore?.state?.authenticated,
    AppCore?.state?.isAuthenticated,
    AppCore?.state?.session?.authenticated
  );

  if (typeof stateAuthenticated === "boolean") {
    return stateAuthenticated;
  }

  return Boolean(
    AppCore?.state?.token ||
      AppCore?.state?.accessToken ||
      AppCore?.state?.session?.token ||
      AppCore?.state?.session?.accessToken ||
      AppCore?.state?.user ||
      AppCore?.state?.session?.user
  );
}

/* =========================================================
   REDIRECTS / RESULTS
========================================================= */

function getAuthenticatedRedirectTarget(AppCore, route, getRoute) {
  const explicit = safeText(
    route?.redirectAuthenticated ||
      route?.redirectIfAuth ||
      route?.meta?.redirectAuthenticated ||
      route?.meta?.redirectIfAuth ||
      "",
    ""
  );

  if (explicit) {
    return explicit;
  }

  return getDefaultHomeTarget(AppCore, getRoute);
}

function buildLoginRedirectTarget(AppCore, routeNames, publicPath = "/") {
  const loginPath = routeNames.LOGIN || LOGIN_PATH;
  const cleanPublicPath = normalizePublicPath(publicPath || "/");

  if (
    sameCanonicalPath(cleanPublicPath, loginPath) ||
    isPublicTechnicalPath(cleanPublicPath)
  ) {
    return loginPath;
  }

  try {
    return buildLoginUrl(AppCore, cleanPublicPath);
  } catch {
    return loginPath;
  }
}

function buildAllowResult({
  route,
  canonicalPath,
  publicPath = null,
  getRoute,
  details = {},
} = {}) {
  return {
    allowed: true,
    reason: null,
    route: route || null,
    redirectTo: null,
    canonicalPath,
    publicPath,
    getRoute: typeof getRoute === "function" ? getRoute : null,
    details: safeObject(details),
  };
}

function buildDenyResult({
  reason,
  route,
  redirectTo = null,
  canonicalPath,
  publicPath = null,
  details = {},
} = {}) {
  return {
    allowed: false,
    reason: reason || "blocked",
    route: route || null,
    redirectTo: redirectTo || null,
    canonicalPath,
    publicPath,
    details: safeObject(details),
  };
}

/* =========================================================
   MAIN
========================================================= */

export function shouldAllowRoute({
  AppCore,
  Auth,
  route,
  requestedCanonicalPath = "/",
  requestedPublicPath = null,
  getRoute,
} = {}) {
  const routeNames = getRouteNames(AppCore);

  const canonicalPath = normalizeCanonicalPath(
    AppCore,
    requestedCanonicalPath
  );

  const publicPath =
    requestedPublicPath ||
    canonicalPath;

  /*
    Ruta inexistente:
    No bloquear aquí. El Router debe resolver 404.
  */
  if (!route) {
    return buildAllowResult({
      route: null,
      canonicalPath,
      publicPath,
      getRoute,
      details: {
        reason: "route-not-found-delegated-to-router",
      },
    });
  }

  /*
    CRÍTICO:
    Rutas públicas técnicas deben pasar siempre, aunque haya sesión.
    Ejemplos:
      /activate-account?token=XXX
      /activate-account/XXX
      /reset-password/confirm/XXX
      /reset-password
  */
  if (
    isPublicTechnicalRoute(
      route,
      canonicalPath,
      publicPath
    )
  ) {
    return buildAllowResult({
      route,
      canonicalPath,
      publicPath,
      getRoute,
      details: {
        publicTechnical: true,
      },
    });
  }

  const logged = isAuthenticated(AppCore, Auth);
  const currentRole = getUserRole(AppCore, Auth);
  const userRoles = getUserRoleCandidates(AppCore, Auth);

  const guestOnly = routeGuestOnly(route);
  const allowedRoles = getRouteRoles(route);
  const requiresAuth = routeRequiresAuth(route);

  /*
    Guest-only:
    normalmente /login.
    
    Durante transición de login no forzamos un redirect extra desde el guard.
    Auth.login / LoginView ya están gestionando la navegación.
  */
  if (guestOnly && logged) {
    if (isLoginTransitionActive(AppCore)) {
      return buildAllowResult({
        route,
        canonicalPath,
        publicPath,
        getRoute,
        details: {
          guestOnly,
          logged,
          loginTransitionActive: true,
        },
      });
    }

    return buildDenyResult({
      reason: "already-authenticated",
      route,
      redirectTo:
        getAuthenticatedRedirectTarget(AppCore, route, getRoute) ||
        routeNames.HOME,
      canonicalPath,
      publicPath,
      details: {
        currentRole,
        userRoles,
      },
    });
  }

  /*
    Requires auth.
  */
  if (requiresAuth && !logged) {
    return buildDenyResult({
      reason: "not-authenticated",
      route,
      redirectTo: buildLoginRedirectTarget(
        AppCore,
        routeNames,
        publicPath
      ),
      canonicalPath,
      publicPath,
      details: {
        allowedRoles,
      },
    });
  }

  /*
    Roles y no logueado.
  */
  if (allowedRoles.length > 0 && !logged) {
    return buildDenyResult({
      reason: "not-authenticated",
      route,
      redirectTo: buildLoginRedirectTarget(
        AppCore,
        routeNames,
        publicPath
      ),
      canonicalPath,
      publicPath,
      details: {
        allowedRoles,
      },
    });
  }

  /*
    Roles y logueado.
    Candado real para /usuarios admin.
  */
  if (allowedRoles.length > 0 && logged) {
    const hasAllowedRole = hasAnyAllowedRole(
      AppCore,
      Auth,
      allowedRoles
    );

    if (!hasAllowedRole) {
      return buildDenyResult({
        reason: "insufficient-role",
        route,
        redirectTo:
          route.redirectForbidden ||
          route.meta?.redirectForbidden ||
          null,
        canonicalPath,
        publicPath,
        details: {
          currentRole,
          userRoles,
          allowedRoles,
        },
      });
    }
  }

  return buildAllowResult({
    route,
    canonicalPath,
    publicPath,
    getRoute,
    details: {
      logged,
      currentRole,
      userRoles,
      guestOnly,
      requiresAuth,
      allowedRoles,
    },
  });
}

export default {
  shouldAllowRoute,
};
