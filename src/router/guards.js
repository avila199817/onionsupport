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
   - cero auth fantasma: token sin user no autentica
   - redirect interno seguro anti open-redirect
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

const AUTH_ROUTE_PATHS = new Set([
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/auth/login",
  "/2fa",
  "/otp",
]);

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

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(key)) {
      return false;
    }
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

function safeCanonicalPath(AppCore = null, path = "/") {
  try {
    return normalizeCanonicalPath(AppCore, path);
  } catch {
    return stripSearchAndHash(path);
  }
}

function hasUsableToken(token = "") {
  return Boolean(safeText(token, ""));
}

function hasUsableUser(user = null) {
  if (!user || typeof user !== "object" || Array.isArray(user)) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.user_name, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "") ||
      safeText(user.mobile, "")
  );
}

function isSafeRelativePath(path = "") {
  const raw = safeText(path, "");

  if (!raw) return false;
  if (!raw.startsWith("/")) return false;
  if (raw.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false;
  if (/[\r\n\t]/.test(raw)) return false;

  return true;
}

function sanitizeRedirectTarget(path = "", fallback = "/") {
  const raw = normalizePublicPath(path || fallback);

  if (!isSafeRelativePath(raw)) {
    return fallback;
  }

  return raw;
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

    bootNavigationHandled: Boolean(state.bootNavigationHandled),

    initialRouteRendered: Boolean(state.initialRouteRendered),

    restoring: Boolean(
      state.restoring ||
        state.authRestoring ||
        state.sessionRestoring
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

function normalizeRoleToken(value) {
  if (value && typeof value === "object") {
    return normalizeRole(
      value.role ||
        value.rol ||
        value.name ||
        value.key ||
        value.id ||
        value.value ||
        ""
    );
  }

  return normalizeRole(value);
}

function normalizeRoles(value) {
  if (typeof value === "string") {
    return value
      .split(/[,\s|]+/)
      .map(normalizeRole)
      .filter(Boolean);
  }

  return toArray(value)
    .flat(Infinity)
    .map(normalizeRoleToken)
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

function getRoutePath(route) {
  return stripSearchAndHash(
    route?.path ||
      route?.canonicalPath ||
      route?.name ||
      "/"
  );
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

function isRouteExplicitlyPrivate(route) {
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

  return false;
}

function getRouteRoles(route) {
  const meta = routeMeta(route);

  const roleCandidates = [
    route?.role,
    route?.requiredRole,
    route?.requireRole,
    route?.allowedRole,

    meta.role,
    meta.requiredRole,
    meta.requireRole,
    meta.allowedRole,
  ];

  const roleArrays = [
    route?.roles,
    route?.allowRoles,
    route?.allowedRoles,
    route?.requiredRoles,
    route?.requireRoles,

    meta.roles,
    meta.allowRoles,
    meta.allowedRoles,
    meta.requiredRoles,
    meta.requireRoles,
  ];

  const roles = [
    ...roleCandidates,
    ...roleArrays.flatMap((value) => toArray(value)),
  ];

  if (
    safeBoolean(route?.admin, false) ||
    safeBoolean(route?.requiresAdmin, false) ||
    safeBoolean(meta.admin, false) ||
    safeBoolean(meta.requiresAdmin, false)
  ) {
    roles.push("admin");
  }

  if (
    safeBoolean(route?.support, false) ||
    safeBoolean(route?.requiresSupport, false) ||
    safeBoolean(meta.support, false) ||
    safeBoolean(meta.requiresSupport, false)
  ) {
    roles.push("support");
  }

  if (
    safeBoolean(route?.manager, false) ||
    safeBoolean(route?.requiresManager, false) ||
    safeBoolean(meta.manager, false) ||
    safeBoolean(meta.requiresManager, false)
  ) {
    roles.push("manager");
  }

  return expandRoleAliases(roles);
}

function routeRequiresAuth(route) {
  if (isRouteExplicitlyPrivate(route)) {
    return true;
  }

  if (getRouteRoles(route).length > 0) {
    return true;
  }

  if (isRouteExplicitlyPublic(route)) {
    return false;
  }

  /*
    Política actual:
    rutas públicas por defecto.
    Si quieres private-by-default, cambia este return a true.
  */
  return false;
}

function routeGuestOnly(route, canonicalPath = "/") {
  const meta = routeMeta(route);
  const routePath = getRoutePath(route);
  const cleanCanonical = stripSearchAndHash(canonicalPath);

  if (
    AUTH_ROUTE_PATHS.has(routePath) ||
    AUTH_ROUTE_PATHS.has(cleanCanonical)
  ) {
    return true;
  }

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

  return PUBLIC_TECHNICAL_PREFIXES.some((prefix) =>
    clean.startsWith(prefix)
  );
}

function isPublicTechnicalRoute(route, canonicalPath = "/", publicPath = null) {
  const canonical = stripSearchAndHash(canonicalPath);
  const visible = stripSearchAndHash(publicPath || canonicalPath);
  const routePath = getRoutePath(route);

  if (
    isPublicTechnicalPath(canonical) ||
    isPublicTechnicalPath(visible) ||
    isPublicTechnicalPath(routePath)
  ) {
    return true;
  }

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

  try {
    if (Auth?.session?.user) {
      return safeObject(Auth.session.user);
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

function getCurrentToken(AppCore = null) {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.state?.session?.token,
      AppCore?.state?.session?.accessToken
    ),
    ""
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
    user?.user_role,
    user?.type,
    user?.userType,
    user?.user_type,
    user?.perfil,

    user?.raw?.role,
    user?.raw?.rol,
    user?.raw?.userRole,
    user?.raw?.type,
    user?.raw?.userType,
    user?.raw?.perfil,

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
    AppCore?.state?.groups,

    AppCore?.state?.session?.roles,
    AppCore?.state?.session?.permissions,
    AppCore?.state?.session?.scopes,
    AppCore?.state?.session?.groups,

    user?.roles,
    user?.roleList,
    user?.role_list,
    user?.permissions,
    user?.scopes,
    user?.groups,
    user?.authorities,

    user?.raw?.roles,
    user?.raw?.roleList,
    user?.raw?.role_list,
    user?.raw?.permissions,
    user?.raw?.scopes,
    user?.raw?.groups,
    user?.raw?.authorities,

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

    user?.raw?.isAdmin,
    user?.raw?.admin,
    user?.raw?.isSuperAdmin,
    user?.raw?.superAdmin,
    user?.raw?.canManageUsers,
    user?.raw?.canAccessUsers,
  ].some((value) => safeBoolean(value, false));

  if (adminFlag) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function getUserRole(AppCore = null, Auth = null) {
  const roles = getUserRoleCandidates(AppCore, Auth);

  if (roles.some(isAdminRole)) return "admin";
  if (roles.some(isSupportRole)) return "support";
  if (roles.some(isManagerRole)) return "manager";

  return roles[0] || "";
}

function hasAnyAllowedRole(AppCore = null, Auth = null, allowedRoles = []) {
  const allowed = expandRoleAliases(allowedRoles);

  if (!allowed.length) {
    return true;
  }

  const userRoles = new Set(
    expandRoleAliases(getUserRoleCandidates(AppCore, Auth))
  );

  return allowed.some((role) => userRoles.has(role));
}

function isAuthenticated(AppCore, Auth) {
  /*
    Primero usamos Auth.isAuthenticated() porque tu módulo Auth Session
    ya está endurecido y exige token + user.
  */
  if (typeof Auth?.isAuthenticated === "function") {
    try {
      return Boolean(Auth.isAuthenticated());
    } catch {}
  }

  /*
    Fallback duro:
    token solo NO autentica.
    user solo NO autentica.
  */
  const token = getCurrentToken(AppCore);
  const user = getCurrentUser(AppCore, Auth);

  return Boolean(
    hasUsableToken(token) &&
      hasUsableUser(user)
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
    const sanitized = sanitizeRedirectTarget(explicit, "/");

    if (
      !sameCanonicalPath(sanitized, LOGIN_PATH) &&
      !isPublicTechnicalPath(sanitized)
    ) {
      return sanitized;
    }
  }

  return getDefaultHomeTarget(AppCore, getRoute) || "/";
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

  if (!isSafeRelativePath(cleanPublicPath)) {
    return loginPath;
  }

  try {
    return buildLoginUrl(AppCore, cleanPublicPath);
  } catch {
    return `${loginPath}?redirect=${encodeURIComponent(cleanPublicPath)}`;
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

  const canonicalPath = safeCanonicalPath(
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

  const guestOnly = routeGuestOnly(route, canonicalPath);
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
          currentRole,
          userRoles,
        },
      });
    }

    return buildDenyResult({
      reason: "already-authenticated",
      route,
      redirectTo:
        getAuthenticatedRedirectTarget(AppCore, route, getRoute) ||
        routeNames.HOME ||
        "/",
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
    Candado real para /usuarios admin, aunque venga:
      admin / administrator / superadmin / owner / root
  */
  if (allowedRoles.length > 0 && logged) {
    const hasAllowedRole = hasAnyAllowedRole(
      AppCore,
      Auth,
      allowedRoles
    );

    if (!hasAllowedRole) {
      const forbiddenRedirect = sanitizeRedirectTarget(
        route.redirectForbidden ||
          route.meta?.redirectForbidden ||
          "",
        ""
      );

      return buildDenyResult({
        reason: "insufficient-role",
        route,
        redirectTo: forbiddenRedirect || null,
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
