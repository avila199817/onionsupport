/* =========================================================
   Onion SPA - Router Guards
   Archivo: src/router/guards.js

   Router guards clean:
   - Rutas públicas técnicas siempre permitidas.
   - Auth real = token usable + user usable + activo.
   - Sin ghost auth.
   - Roles compatibles, pero contrato final simple: admin/user.
   - Admin puede entrar en rutas con rol restringido.
   - Redirects internos seguros.
   - /@usuario/ruta y hash-router técnico seguros.
========================================================= */

import {
  getRouteNames,
  normalizeCanonicalPath as normalizeCanonicalPathHelper,
  getDefaultHomeTarget,
  buildLoginUrl,
} from "./helpers.js";

export const GUARDS_VERSION = "12.0.0-clean";

const LOGIN_PATH = "/login";
const HOME_PATH = "/";

const PUBLIC_TECHNICAL_ROUTES = new Set([
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/password-reset/confirm",
  "/2fa",
  "/otp",
  "/mfa",
]);

const AUTH_GUEST_ROUTES = new Set([
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/auth/login",
]);

const TECHNICAL_PREFIXES = [
  "/activate-account/",
  "/reset-password/confirm/",
  "/password-reset/confirm/",
  "/2fa/",
  "/otp/",
  "/mfa/",
];

const ADMIN_ALIASES = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super-admin",
  "superadministrador",
  "super_administrador",
  "super-administrador",
  "owner",
  "root",
]);

const USER_ALIASES = new Set([
  "user",
  "usuario",
  "client",
  "cliente",
  "customer",
]);

const SUPPORT_ALIASES = new Set([
  "support",
  "soporte",
  "agent",
  "agente",
  "helpdesk",
  "operator",
  "operador",
  "technician",
  "technical",
  "tecnico",
  "técnico",
  "staff",
]);

const MANAGER_ALIASES = new Set([
  "manager",
  "gestor",
  "gerente",
  "lead",
  "leader",
  "team_lead",
  "team-lead",
  "supervisor",
  "responsable",
]);

const TOKEN_KEYS = [
  "token",
  "accessToken",
  "access_token",
  "jwt",
  "idToken",
  "id_token",
  "bearer",
];

const USER_ID_KEYS = [
  "id",
  "userId",
  "user_id",
  "_id",
  "uid",
  "sub",
  "username",
  "userName",
  "user_name",
  "email",
  "mail",
  "phone",
  "telefono",
  "mobile",
  "displayName",
  "name",
  "nombre",
];

const TOKEN_FALSE_VALUES = new Set([
  "",
  "null",
  "undefined",
  "false",
  "true",
  "none",
  "nan",
  "[object object]",
  "{}",
  "[]",
]);

const SENSITIVE_QUERY_PARAMS = [
  "token",
  "activationToken",
  "activateToken",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
  "access_token",
  "refresh_token",
  "id_token",
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
  "otpToken",
  "otp_token",
];

export const GUARD_REASONS = Object.freeze({
  allow: "allowed",
  routeNotFound: "route-not-found-delegated-to-router",
  publicTechnical: "public-technical-route",
  alreadyAuthenticated: "already-authenticated",
  notAuthenticated: "not-authenticated",
  insufficientRole: "insufficient-role",
  loginTransition: "login-transition-active",
  ghostAuth: "ghost-auth-blocked",
});

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }

  return null;
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text = safeText(value, "").toLowerCase();

  if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) {
    return false;
  }

  return fallback;
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map((item) => safeText(item, "")).filter(Boolean))];
}

function baseOrigin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

/* =========================================================
   PATHS
========================================================= */

function normalizePathname(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const stack = [];

  for (const part of value.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }

    stack.push(part);
  }

  value = `/${stack.join("/")}`;
  return value.length > 1 ? value.replace(/\/+$/g, "") : value;
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "/";
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
  return raw.replace(/^#\/?/, "/") || "/";
}

function splitPath(path = "/") {
  let raw = safeText(path, "/") || "/";

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname: normalizePathname(pathname),
    search: search ? (search.startsWith("?") ? search : `?${search}`) : "",
    hash: hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "",
  };
}

function normalizeFullPath(path = "/") {
  let raw = safeText(path, "/") || "/";

  if (isHashRouterPath(raw)) {
    return normalizeFullPath(normalizeHashRouterPath(raw));
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw, baseOrigin());

      if (parsed.origin !== baseOrigin()) return "/";

      if (parsed.hash && isHashRouterPath(parsed.hash)) {
        return normalizeFullPath(normalizeHashRouterPath(parsed.hash));
      }

      raw = `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
    } catch {
      return "/";
    }
  }

  const { pathname, search, hash } = splitPath(raw);
  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  return splitPath(normalizeFullPath(path)).pathname;
}

function stripUsernamePrefix(path = "/") {
  const { pathname, search, hash } = splitPath(normalizeFullPath(path));
  const clean = pathname.replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";
  return `${normalizePathname(clean)}${search}${hash}`;
}

function normalizePublicPath(path = "/") {
  return normalizeFullPath(path || "/");
}

function normalizeCanonical(AppCore = null, path = "/") {
  const source = stripUsernamePrefix(path);

  try {
    const normalized = normalizeCanonicalPathHelper(AppCore, source);
    return stripSearchAndHash(normalized || source || "/");
  } catch {
    return stripSearchAndHash(source || "/");
  }
}

function sameCanonical(a = "/", b = "/") {
  return stripSearchAndHash(a) === stripSearchAndHash(b);
}

function hasEncodedRedirectRisk(value = "") {
  const raw = safeText(value, "");
  const lower = raw.toLowerCase();

  if (
    lower.includes("%0d") ||
    lower.includes("%0a") ||
    lower.includes("%09") ||
    lower.includes("%5c") ||
    raw.includes("\\")
  ) {
    return true;
  }

  try {
    const decoded = decodeURIComponent(raw).replace(/\\/g, "/").trim();

    return Boolean(
      decoded.startsWith("//") ||
        /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
        /[\r\n\t]/.test(decoded)
    );
  } catch {
    return true;
  }
}

function isSafeRelativePath(path = "") {
  const raw = safeText(path, "");

  return Boolean(
    raw &&
      raw.startsWith("/") &&
      !raw.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(raw) &&
      !/[\r\n\t\\]/.test(raw) &&
      !hasEncodedRedirectRisk(raw)
  );
}

function normalizeRedirectCandidate(path = "") {
  const raw = safeText(path, "");

  if (!raw || raw.startsWith("//")) return "";

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw, baseOrigin());
      if (parsed.origin !== baseOrigin()) return "";
      return normalizeFullPath(`${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`);
    } catch {
      return "";
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";

  return normalizeFullPath(raw);
}

function safeRedirect(path = "", fallback = "") {
  const candidate = normalizeRedirectCandidate(path);
  if (candidate && isSafeRelativePath(candidate)) return candidate;

  const safeFallback = normalizeRedirectCandidate(fallback);
  if (safeFallback && isSafeRelativePath(safeFallback)) return safeFallback;

  return "";
}

function redact(value = "") {
  let output = safeText(value, "");

  for (const name of SENSITIVE_QUERY_PARAMS) {
    try {
      const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"), "$1***");
    } catch {}
  }

  try {
    output = output
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/(?:2fa|otp|mfa)\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
  } catch {}

  return output;
}

/* =========================================================
   RUNTIME
========================================================= */

function getRuntimeFlags(AppCore = null) {
  const state = safeObject(AppCore?.state);

  return {
    loginInProgress: Boolean(state.loginInProgress || state.authLoginInProgress || state.isLoggingIn || state.loggingIn),
    loginNavigationHandled: Boolean(state.loginNavigationHandled || state.authLoginNavigationHandled),
    bootNavigationHandled: Boolean(state.bootNavigationHandled),
    initialRouteRendered: Boolean(state.initialRouteRendered),
    restoring: Boolean(state.restoring || state.authRestoring || state.sessionRestoring || state.restoreInFlight || state.authRestoreInFlight),
    booting: Boolean(state.booting || state.loading || state.bootPhase === "booting" || state.bootPhase === "restoring"),
  };
}

function loginTransitionActive(AppCore = null) {
  const flags = getRuntimeFlags(AppCore);
  return Boolean(flags.loginInProgress || flags.loginNavigationHandled);
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function truthyKeys(value = {}) {
  if (!isObject(value)) return [];

  return Object.entries(value)
    .filter(([, item]) => bool(item, false))
    .map(([key]) => key);
}

function roleTokens(value) {
  if (Array.isArray(value)) {
    return value.flatMap(roleTokens);
  }

  if (isObject(value)) {
    const explicit = first(value.role, value.rol, value.name, value.key, value.id, value.value, value.authority, value.permission);
    return explicit ? [explicit, ...truthyKeys(value)] : truthyKeys(value);
  }

  if (typeof value === "string") {
    return value.split(/[,\s|]+/g);
  }

  return toArray(value);
}

export function normalizeGuardRoles(value) {
  return roleTokens(value).map(normalizeRole).filter(Boolean);
}

function isAdminRole(role = "") {
  return ADMIN_ALIASES.has(normalizeRole(role));
}

function isUserRole(role = "") {
  return USER_ALIASES.has(normalizeRole(role));
}

function isSupportRole(role = "") {
  return SUPPORT_ALIASES.has(normalizeRole(role));
}

function isManagerRole(role = "") {
  return MANAGER_ALIASES.has(normalizeRole(role));
}

function expandRoles(roles = []) {
  const normalized = normalizeGuardRoles(roles);
  const result = new Set(normalized);

  if (normalized.some(isAdminRole)) {
    result.add("admin");
    ADMIN_ALIASES.forEach((role) => result.add(role));
  }

  if (normalized.some(isUserRole)) {
    result.add("user");
    USER_ALIASES.forEach((role) => result.add(role));
  }

  if (normalized.some(isSupportRole)) {
    result.add("support");
    SUPPORT_ALIASES.forEach((role) => result.add(role));
  }

  if (normalized.some(isManagerRole)) {
    result.add("manager");
    MANAGER_ALIASES.forEach((role) => result.add(role));
  }

  return unique([...result]);
}

function canonicalRole(roles = []) {
  const expanded = expandRoles(roles);

  if (expanded.some(isAdminRole)) return "admin";
  if (expanded.some(isSupportRole)) return "support";
  if (expanded.some(isManagerRole)) return "manager";
  if (expanded.some(isUserRole)) return "user";

  return expanded[0] || "";
}

/* =========================================================
   ROUTE META
========================================================= */

function metaOf(route) {
  return isObject(route?.meta) ? route.meta : {};
}

function routePath(route) {
  return stripSearchAndHash(first(route?.path, route?.canonicalPath, "/"));
}

function isExplicitPublic(route) {
  const meta = metaOf(route);

  if (typeof route?.public === "boolean") return route.public;
  if (typeof meta.public === "boolean") return meta.public;

  if (typeof route?.requiresAuth === "boolean") return route.requiresAuth === false;
  if (typeof meta.requiresAuth === "boolean") return meta.requiresAuth === false;

  return false;
}

function isExplicitPrivate(route) {
  const meta = metaOf(route);

  if (typeof route?.requiresAuth === "boolean") return route.requiresAuth;
  if (typeof meta.requiresAuth === "boolean") return meta.requiresAuth;

  if (typeof route?.private === "boolean") return route.private;
  if (typeof meta.private === "boolean") return meta.private;

  if (route?.public === false || meta.public === false) return true;

  return false;
}

function routeRoles(route) {
  const meta = metaOf(route);

  const roles = [
    route?.role,
    route?.requiredRole,
    route?.requireRole,
    route?.allowedRole,
    meta.role,
    meta.requiredRole,
    meta.requireRole,
    meta.allowedRole,

    ...toArray(route?.roles),
    ...toArray(route?.allowRoles),
    ...toArray(route?.allowedRoles),
    ...toArray(route?.requiredRoles),
    ...toArray(route?.requireRoles),

    ...toArray(meta.roles),
    ...toArray(meta.allowRoles),
    ...toArray(meta.allowedRoles),
    ...toArray(meta.requiredRoles),
    ...toArray(meta.requireRoles),
  ];

  if (bool(route?.admin, false) || bool(route?.requiresAdmin, false) || bool(meta.admin, false) || bool(meta.requiresAdmin, false)) {
    roles.push("admin");
  }

  if (bool(route?.user, false) || bool(route?.requiresUser, false) || bool(meta.user, false) || bool(meta.requiresUser, false)) {
    roles.push("user");
  }

  if (bool(route?.support, false) || bool(route?.requiresSupport, false) || bool(meta.support, false) || bool(meta.requiresSupport, false)) {
    roles.push("support");
  }

  if (bool(route?.manager, false) || bool(route?.requiresManager, false) || bool(meta.manager, false) || bool(meta.requiresManager, false)) {
    roles.push("manager");
  }

  return expandRoles(roles);
}

function routeRequiresAuth(route) {
  if (!route) return false;
  if (isExplicitPrivate(route)) return true;
  if (routeRoles(route).length) return true;
  if (isExplicitPublic(route)) return false;

  return false;
}

function routeGuestOnly(route, canonicalPath = "/") {
  const meta = metaOf(route);
  const clean = stripSearchAndHash(canonicalPath);
  const path = routePath(route);

  if (AUTH_GUEST_ROUTES.has(clean) || AUTH_GUEST_ROUTES.has(path)) return true;

  return Boolean(route?.guestOnly || route?.publicOnly || meta.guestOnly || meta.publicOnly);
}

/* =========================================================
   PUBLIC TECHNICAL
========================================================= */

function isPublicTechnicalPath(path = "/") {
  const clean = stripSearchAndHash(stripUsernamePrefix(path));

  if (PUBLIC_TECHNICAL_ROUTES.has(clean)) return true;

  return TECHNICAL_PREFIXES.some((prefix) => clean.startsWith(prefix));
}

function isAuthRoutePath(path = "/") {
  const clean = stripSearchAndHash(stripUsernamePrefix(path));

  if (AUTH_GUEST_ROUTES.has(clean)) return true;
  return clean.startsWith("/auth/");
}

function isPublicTechnicalRoute(route, canonicalPath = "/", publicPath = null) {
  return Boolean(
    isPublicTechnicalPath(canonicalPath) ||
      isPublicTechnicalPath(publicPath || canonicalPath) ||
      isPublicTechnicalPath(routePath(route)) ||
      (route && isExplicitPublic(route) && isPublicTechnicalPath(route.path || route.canonicalPath || ""))
  );
}

/* =========================================================
   AUTH STATE
========================================================= */

function authUser(Auth = null) {
  try {
    if (isFn(Auth?.getUser)) return safeObject(Auth.getUser());
  } catch {}

  try {
    if (isFn(Auth?.getCurrentUser)) return safeObject(Auth.getCurrentUser());
  } catch {}

  try {
    if (isFn(Auth?.currentUser)) return safeObject(Auth.currentUser());
  } catch {}

  return safeObject(Auth?.session?.user || Auth?.user || {});
}

function currentUser(AppCore = null, Auth = null) {
  return safeObject(
    first(
      AppCore?.state?.user,
      AppCore?.state?.currentUser,
      AppCore?.state?.sessionUser,
      AppCore?.state?.authUser,
      AppCore?.state?.session?.user,
      authUser(Auth)
    )
  );
}

function authToken(Auth = null) {
  try {
    if (isFn(Auth?.getToken)) return safeText(Auth.getToken(), "");
  } catch {}

  try {
    if (isFn(Auth?.getAccessToken)) return safeText(Auth.getAccessToken(), "");
  } catch {}

  try {
    if (isFn(Auth?.getAuthHeader)) {
      const header = Auth.getAuthHeader();

      if (isObject(header)) {
        const auth = header.Authorization || header.authorization || "";
        return safeText(auth, "").replace(/^Bearer\s+/i, "").trim();
      }

      return safeText(header, "").replace(/^Bearer\s+/i, "").trim();
    }
  } catch {}

  return safeText(
    first(
      Auth?.token,
      Auth?.accessToken,
      Auth?.access_token,
      Auth?.session?.token,
      Auth?.session?.accessToken,
      Auth?.session?.access_token
    ),
    ""
  );
}

function currentToken(AppCore = null, Auth = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);

  return safeText(
    first(
      ...TOKEN_KEYS.map((key) => state[key]),
      ...TOKEN_KEYS.map((key) => session[key]),
      authToken(Auth)
    ),
    ""
  );
}

function usableToken(token = "") {
  let value = safeText(token, "").replace(/^Bearer\s+/i, "").trim();

  if (!value) return false;
  if (TOKEN_FALSE_VALUES.has(value.toLowerCase())) return false;
  if (/[\s\r\n\t]/.test(value)) return false;
  if (value.length > 8192) return false;

  return true;
}

function userActive(user = null) {
  if (!isObject(user)) return false;

  const status = normalizeRole(first(user.status, user.estado, user.state, user.accountStatus, user.account_status, ""));

  if (
    [
      "disabled",
      "blocked",
      "deleted",
      "archived",
      "inactive",
      "suspended",
      "locked",
      "banned",
      "deactivated",
      "revoked",
      "bloqueado",
      "eliminado",
      "inactivo",
      "suspendido",
      "desactivado",
    ].includes(status)
  ) {
    return false;
  }

  return !(
    user.active === false ||
    user.enabled === false ||
    user.disabled === true ||
    user.is_active === false ||
    user.isActive === false ||
    user.is_enabled === false ||
    user.isEnabled === false ||
    user.blocked === true ||
    user.locked === true ||
    user.deleted === true ||
    user.archived === true ||
    user.suspended === true ||
    user.banned === true ||
    user.revoked === true
  );
}

function usableUser(user = null) {
  return Boolean(
    isObject(user) &&
      userActive(user) &&
      USER_ID_KEYS.some((key) => safeText(user?.[key], ""))
  );
}

function authApiAuthenticated(Auth = null) {
  try {
    if (isFn(Auth?.isAuthenticated)) return Boolean(Auth.isAuthenticated());
  } catch {}

  return Boolean(Auth?.authenticated || Auth?.isAuth || Auth?.session?.authenticated);
}

function isAuthenticated(AppCore = null, Auth = null) {
  return Boolean(
    usableToken(currentToken(AppCore, Auth)) &&
      usableUser(currentUser(AppCore, Auth))
  );
}

function hasGhostAuth(AppCore = null, Auth = null) {
  const appSaysAuth = Boolean(AppCore?.state?.authenticated || authApiAuthenticated(Auth));

  return Boolean(
    appSaysAuth &&
      (
        !usableToken(currentToken(AppCore, Auth)) ||
        !usableUser(currentUser(AppCore, Auth))
      )
  );
}

function roleCandidates(AppCore = null, Auth = null) {
  const user = currentUser(AppCore, Auth);
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const raw = safeObject(user.raw);
  const profile = safeObject(user.profile);
  const rawProfile = safeObject(raw.profile);

  const roles = [
    state.role,
    state.rol,
    state.userRole,
    session.role,
    session.rol,
    session.userRole,

    user.role,
    user.rol,
    user.userRole,
    user.user_role,
    user.type,
    user.userType,
    user.user_type,
    user.perfil,

    profile.role,
    profile.rol,
    profile.userRole,
    profile.type,
    profile.perfil,

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw.type,
    raw.userType,
    raw.user_type,
    raw.perfil,

    rawProfile.role,
    rawProfile.rol,
    rawProfile.userRole,
    rawProfile.type,
    rawProfile.perfil,

    Auth?.role,
    Auth?.rol,
    Auth?.userRole,

    ...toArray(state.roles),
    ...toArray(state.permissions),
    ...toArray(state.scopes),

    ...toArray(session.roles),
    ...toArray(session.permissions),
    ...toArray(session.scopes),

    ...toArray(user.roles),
    ...toArray(user.roleList),
    ...toArray(user.role_list),
    ...toArray(user.permissions),
    ...toArray(user.permisos),
    ...toArray(user.scopes),
    ...toArray(user.groups),
    ...toArray(user.authorities),

    ...toArray(profile.roles),
    ...toArray(profile.permissions),
    ...toArray(profile.scopes),

    ...toArray(raw.roles),
    ...toArray(raw.permissions),
    ...toArray(raw.scopes),

    ...toArray(rawProfile.roles),
    ...toArray(rawProfile.permissions),
    ...toArray(rawProfile.scopes),

    ...toArray(Auth?.roles),
    ...toArray(Auth?.permissions),
    ...toArray(Auth?.scopes),
  ];

  try {
    if (isFn(Auth?.getRole)) roles.push(Auth.getRole());
  } catch {}

  try {
    if (isFn(Auth?.getCurrentRole)) roles.push(Auth.getCurrentRole());
  } catch {}

  try {
    if (isFn(Auth?.getRoles)) roles.push(...toArray(Auth.getRoles()));
  } catch {}

  const adminFlag = [
    state.isAdmin,
    state.admin,
    state.isSuperAdmin,
    state.superAdmin,
    state.canManageUsers,
    state.canAccessUsers,

    session.isAdmin,
    session.admin,
    session.isSuperAdmin,
    session.superAdmin,
    session.canManageUsers,
    session.canAccessUsers,

    user.isAdmin,
    user.admin,
    user.isSuperAdmin,
    user.superAdmin,
    user.canManageUsers,
    user.canAccessUsers,

    profile.isAdmin,
    profile.admin,
    profile.isSuperAdmin,
    profile.superAdmin,
    profile.canManageUsers,
    profile.canAccessUsers,

    raw.isAdmin,
    raw.admin,
    raw.isSuperAdmin,
    raw.superAdmin,
    raw.canManageUsers,
    raw.canAccessUsers,

    rawProfile.isAdmin,
    rawProfile.admin,
    rawProfile.isSuperAdmin,
    rawProfile.superAdmin,
    rawProfile.canManageUsers,
    rawProfile.canAccessUsers,
  ].some((value) => bool(value, false));

  if (adminFlag) roles.push("admin");

  return expandRoles(roles);
}

function currentRole(AppCore = null, Auth = null) {
  return canonicalRole(roleCandidates(AppCore, Auth));
}

function hasAllowedRole(AppCore = null, Auth = null, allowedRoles = []) {
  const allowed = expandRoles(allowedRoles);
  if (!allowed.length) return true;

  const userRoles = expandRoles(roleCandidates(AppCore, Auth));

  if (userRoles.some(isAdminRole)) return true;

  const userRoleSet = new Set(userRoles);
  return allowed.some((role) => userRoleSet.has(role));
}

/* =========================================================
   REDIRECTS
========================================================= */

function authenticatedRedirectTarget(AppCore, route, getRoute) {
  const explicit = safeText(
    first(
      route?.redirectAuthenticated,
      route?.redirectIfAuth,
      route?.meta?.redirectAuthenticated,
      route?.meta?.redirectIfAuth,
      ""
    ),
    ""
  );

  if (explicit) {
    const target = safeRedirect(explicit, "");

    if (
      target &&
      !sameCanonical(target, LOGIN_PATH) &&
      !isPublicTechnicalPath(target) &&
      !isAuthRoutePath(target)
    ) {
      return target;
    }
  }

  const home = getDefaultHomeTarget(AppCore, getRoute);
  return safeRedirect(home, HOME_PATH) || HOME_PATH;
}

function loginRedirectTarget(AppCore, routeNames = {}, publicPath = "/") {
  const loginPath = routeNames.LOGIN || LOGIN_PATH;
  const cleanPublicPath = normalizePublicPath(publicPath || HOME_PATH);

  if (
    sameCanonical(cleanPublicPath, loginPath) ||
    isPublicTechnicalPath(cleanPublicPath) ||
    isAuthRoutePath(cleanPublicPath) ||
    !isSafeRelativePath(cleanPublicPath)
  ) {
    return loginPath;
  }

  try {
    const built = buildLoginUrl(AppCore, cleanPublicPath);
    return safeRedirect(built, loginPath) || loginPath;
  } catch {
    return `${loginPath}?redirect=${encodeURIComponent(cleanPublicPath)}`;
  }
}

/* =========================================================
   RESULTS
========================================================= */

function details({
  AppCore,
  Auth,
  route,
  canonicalPath,
  publicPath,
  extra = {},
} = {}) {
  const user = currentUser(AppCore, Auth);
  const token = currentToken(AppCore, Auth);
  const roles = roleCandidates(AppCore, Auth);

  return {
    version: GUARDS_VERSION,

    routePath: routePath(route),

    canonicalPath: redact(canonicalPath || ""),
    publicPath: redact(publicPath || ""),

    logged: isAuthenticated(AppCore, Auth),
    authApiAuthenticated: authApiAuthenticated(Auth),
    ghostAuth: hasGhostAuth(AppCore, Auth),

    hasToken: usableToken(token),
    hasUser: usableUser(user),

    currentRole: canonicalRole(roles),
    userRoles: roles,

    runtime: getRuntimeFlags(AppCore),

    ...safeObject(extra),
  };
}

function allowResult({
  route,
  canonicalPath,
  publicPath,
  getRoute,
  details: info = {},
} = {}) {
  return {
    allowed: true,
    reason: null,
    route: route || null,
    redirectTo: null,
    canonicalPath,
    publicPath,
    getRoute: isFn(getRoute) ? getRoute : null,
    details: safeObject(info),
  };
}

function denyResult({
  reason,
  route,
  redirectTo = null,
  canonicalPath,
  publicPath,
  details: info = {},
} = {}) {
  return {
    allowed: false,
    reason: reason || "blocked",
    route: route || null,
    redirectTo: redirectTo || null,
    canonicalPath,
    publicPath,
    details: safeObject(info),
  };
}

/* =========================================================
   MAIN GUARD
========================================================= */

export function shouldAllowRoute({
  AppCore,
  Auth,
  route,
  requestedCanonicalPath = "/",
  requestedPublicPath = null,
  getRoute,
} = {}) {
  const routeNames = safeObject(getRouteNames(AppCore));

  const canonicalPath = normalizeCanonical(AppCore, requestedCanonicalPath);
  const publicPath = normalizePublicPath(requestedPublicPath || canonicalPath);

  if (!route) {
    return allowResult({
      route: null,
      canonicalPath,
      publicPath,
      getRoute,
      details: details({
        AppCore,
        Auth,
        route: null,
        canonicalPath,
        publicPath,
        extra: {
          reason: GUARD_REASONS.routeNotFound,
        },
      }),
    });
  }

  if (isPublicTechnicalRoute(route, canonicalPath, publicPath)) {
    return allowResult({
      route,
      canonicalPath,
      publicPath,
      getRoute,
      details: details({
        AppCore,
        Auth,
        route,
        canonicalPath,
        publicPath,
        extra: {
          reason: GUARD_REASONS.publicTechnical,
          publicTechnical: true,
        },
      }),
    });
  }

  const logged = isAuthenticated(AppCore, Auth);
  const ghost = hasGhostAuth(AppCore, Auth);
  const guestOnly = routeGuestOnly(route, canonicalPath);
  const allowedRoles = routeRoles(route);
  const requiresAuth = routeRequiresAuth(route);
  const roles = roleCandidates(AppCore, Auth);
  const role = canonicalRole(roles);

  if (guestOnly && logged) {
    if (loginTransitionActive(AppCore)) {
      return allowResult({
        route,
        canonicalPath,
        publicPath,
        getRoute,
        details: details({
          AppCore,
          Auth,
          route,
          canonicalPath,
          publicPath,
          extra: {
            reason: GUARD_REASONS.loginTransition,
            guestOnly,
            logged,
            currentRole: role,
            userRoles: roles,
          },
        }),
      });
    }

    return denyResult({
      reason: GUARD_REASONS.alreadyAuthenticated,
      route,
      redirectTo: authenticatedRedirectTarget(AppCore, route, getRoute) || routeNames.HOME || HOME_PATH,
      canonicalPath,
      publicPath,
      details: details({
        AppCore,
        Auth,
        route,
        canonicalPath,
        publicPath,
        extra: {
          guestOnly,
          currentRole: role,
          userRoles: roles,
        },
      }),
    });
  }

  if ((requiresAuth || allowedRoles.length > 0) && !logged) {
    return denyResult({
      reason: ghost ? GUARD_REASONS.ghostAuth : GUARD_REASONS.notAuthenticated,
      route,
      redirectTo: loginRedirectTarget(AppCore, routeNames, publicPath),
      canonicalPath,
      publicPath,
      details: details({
        AppCore,
        Auth,
        route,
        canonicalPath,
        publicPath,
        extra: {
          requiresAuth: true,
          allowedRoles,
          ghostAuth: ghost,
        },
      }),
    });
  }

  if (allowedRoles.length > 0 && logged && !hasAllowedRole(AppCore, Auth, allowedRoles)) {
    const forbiddenRedirect = safeRedirect(
      route.redirectForbidden || route.meta?.redirectForbidden || "",
      ""
    );

    return denyResult({
      reason: GUARD_REASONS.insufficientRole,
      route,
      redirectTo: forbiddenRedirect || null,
      canonicalPath,
      publicPath,
      details: details({
        AppCore,
        Auth,
        route,
        canonicalPath,
        publicPath,
        extra: {
          currentRole: role,
          userRoles: roles,
          allowedRoles,
        },
      }),
    });
  }

  return allowResult({
    route,
    canonicalPath,
    publicPath,
    getRoute,
    details: details({
      AppCore,
      Auth,
      route,
      canonicalPath,
      publicPath,
      extra: {
        reason: GUARD_REASONS.allow,
        logged,
        ghostAuth: ghost,
        currentRole: role,
        userRoles: roles,
        guestOnly,
        requiresAuth,
        allowedRoles,
      },
    }),
  });
}

/* =========================================================
   DEBUG
========================================================= */

export function getGuardsSnapshot({
  AppCore = null,
  Auth = null,
  route = null,
  requestedCanonicalPath = AppCore?.state?.route || "/",
  requestedPublicPath = AppCore?.state?.publicPath || requestedCanonicalPath,
  getRoute = null,
} = {}) {
  const canonicalPath = normalizeCanonical(AppCore, requestedCanonicalPath);
  const publicPath = normalizePublicPath(requestedPublicPath || canonicalPath);

  const access = shouldAllowRoute({
    AppCore,
    Auth,
    route,
    requestedCanonicalPath: canonicalPath,
    requestedPublicPath: publicPath,
    getRoute,
  });

  const user = currentUser(AppCore, Auth);
  const token = currentToken(AppCore, Auth);

  return {
    version: GUARDS_VERSION,

    canonicalPath: redact(canonicalPath),
    publicPath: redact(publicPath),

    route: route
      ? {
          path: route.path || null,
          canonicalPath: route.canonicalPath || null,
          name: route.name || null,
          viewKey: route.viewKey || null,
          viewName: route.viewName || null,
          public: route.public,
          private: route.private,
          requiresAuth: route.requiresAuth,
          guestOnly: route.guestOnly,
          roles: route.roles || [],
          meta: route.meta || null,
        }
      : null,

    auth: {
      logged: isAuthenticated(AppCore, Auth),
      ghostAuth: hasGhostAuth(AppCore, Auth),
      authApiAuthenticated: authApiAuthenticated(Auth),
      hasToken: usableToken(token),
      hasUser: usableUser(user),
      currentRole: currentRole(AppCore, Auth),
      userRoles: roleCandidates(AppCore, Auth),
    },

    routeAccess: {
      requiresAuth: route ? routeRequiresAuth(route) : false,
      guestOnly: route ? routeGuestOnly(route, canonicalPath) : false,
      roles: route ? routeRoles(route) : [],
      publicTechnical: route ? isPublicTechnicalRoute(route, canonicalPath, publicPath) : false,
    },

    runtime: getRuntimeFlags(AppCore),

    access,
  };
}

export default {
  GUARDS_VERSION,
  GUARD_REASONS,

  shouldAllowRoute,

  normalizeGuardRoles,
  getGuardsSnapshot,
};
