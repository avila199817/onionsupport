/* =========================================================
   Onion SPA - Router Guards
   Archivo: src/router/guards.js

   ROUTER GUARDS · SIMPLE
   - capa fina Router ↔ Auth
   - Auth decide sesión; Router decide ruta
   - rutas públicas técnicas siempre permitidas
   - autenticado = token usable + user usable + activo
   - roles reales: admin / user
   - redirects internos seguros
   - sin fetch, refresh, restore, login/logout, storage, Toast ni navegación
========================================================= */

import {
  getRouteNames,
  normalizeCanonicalPath as normalizeCanonicalPathHelper,
  getDefaultHomeTarget,
  buildLoginUrl,
} from "./helpers.js";

import {
  AUTH_PUBLIC_TECHNICAL_ROUTES,
} from "../features/auth/constants.js";

export const GUARDS_VERSION = "21.0.0-simple";

const LOGIN_PATH = "/login";
const HOME_PATH = "/";
const FORBIDDEN_PATH = "/403";

const LOGIN_PATHS = Object.freeze([
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/auth/login",
]);

const PUBLIC_TECHNICAL_ROUTES = Object.freeze([
  ...(Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES) ? AUTH_PUBLIC_TECHNICAL_ROUTES : []),
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
  "/reset-password",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/password-reset",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
  "/forgot-password",
  "/recover-password",
  "/recover",
  "/2fa",
  "/otp",
  "/mfa",
].filter((path) => !LOGIN_PATHS.includes(path)));

const BAD_TOKEN_VALUES = new Set([
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

const USER_ID_KEYS = Object.freeze([
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
  "displayName",
  "name",
  "nombre",
]);

const ADMIN_ALIASES = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super-admin",
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

const SENSITIVE_QUERY_PARAMS = Object.freeze([
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
]);

export const GUARD_REASONS = Object.freeze({
  allow: "allowed",
  routeNotFound: "route-not-found-delegated-to-router",
  publicTechnical: "public-technical-route",
  publicRoute: "public-route",
  alreadyAuthenticated: "already-authenticated",
  notAuthenticated: "not-authenticated",
  insufficientRole: "insufficient-role",
  unsupportedRole: "unsupported-role",
  loginTransition: "login-transition-active",
  ghostAuth: "ghost-auth-blocked",
});

/* =========================================================
   BASE
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function unique(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
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

function truthy(value) {
  if (value === true || value === 1) return true;

  const text = safeText(value, "").toLowerCase();
  return ["true", "1", "yes", "si", "sí", "ok", "on"].includes(text);
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
    if (part === "..") stack.pop();
    else stack.push(part);
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
  if (isHashRouterPath(raw)) raw = normalizeHashRouterPath(raw);

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

  if (isHashRouterPath(raw)) return normalizeFullPath(normalizeHashRouterPath(raw));

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw, baseOrigin());
      if (parsed.origin !== baseOrigin()) return "/";
      if (parsed.hash && isHashRouterPath(parsed.hash)) return normalizeFullPath(normalizeHashRouterPath(parsed.hash));
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

  if (lower.includes("%0d") || lower.includes("%0a") || lower.includes("%09") || lower.includes("%5c") || raw.includes("\\")) return true;

  try {
    const decoded = decodeURIComponent(raw).replace(/\\/g, "/").trim();
    return decoded.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(decoded) || /[\r\n\t]/.test(decoded);
  } catch {
    return true;
  }
}

function isSafeRelativePath(path = "") {
  const raw = safeText(path, "");
  return Boolean(raw && raw.startsWith("/") && !raw.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/[\r\n\t\\]/.test(raw) && !hasEncodedRedirectRisk(raw));
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
      .replace(/(\/activate\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/(?:2fa|otp|mfa)\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
  } catch {}

  return output;
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

function routeGuestOnly(route, canonicalPath = "/") {
  const meta = metaOf(route);
  const clean = stripSearchAndHash(canonicalPath);
  const path = routePath(route);

  if (LOGIN_PATHS.includes(clean) || LOGIN_PATHS.includes(path)) return true;
  return Boolean(route?.guestOnly || route?.publicOnly || meta.guestOnly || meta.publicOnly);
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

function normalizeRole(value = "") {
  const role = safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");

  if (ADMIN_ALIASES.has(role)) return "admin";
  if (USER_ALIASES.has(role)) return "user";
  return role || "";
}

export function normalizeGuardRoles(value) {
  const raw = [];

  for (const item of safeArray(value).flat(Infinity)) {
    if (isObject(item)) {
      raw.push(item.role, item.rol, item.name, item.key, item.id, item.value);

      for (const [key, enabled] of Object.entries(item)) {
        if (truthy(enabled)) raw.push(key);
      }

      continue;
    }

    if (typeof item === "string") {
      raw.push(...item.split(/[,\s|]+/g));
      continue;
    }

    raw.push(item);
  }

  return unique(raw.map(normalizeRole).filter(Boolean));
}

function routeRoleInfo(route) {
  const meta = metaOf(route);

  const values = [
    route?.role,
    route?.requiredRole,
    route?.requireRole,
    route?.allowedRole,
    meta.role,
    meta.requiredRole,
    meta.requireRole,
    meta.allowedRole,
    ...safeArray(route?.roles),
    ...safeArray(route?.allowRoles),
    ...safeArray(route?.allowedRoles),
    ...safeArray(route?.requiredRoles),
    ...safeArray(route?.requireRoles),
    ...safeArray(meta.roles),
    ...safeArray(meta.allowRoles),
    ...safeArray(meta.allowedRoles),
    ...safeArray(meta.requiredRoles),
    ...safeArray(meta.requireRoles),
  ];

  if (truthy(route?.admin) || truthy(route?.requiresAdmin) || truthy(meta.admin) || truthy(meta.requiresAdmin)) values.push("admin");
  if (truthy(route?.user) || truthy(route?.requiresUser) || truthy(meta.user) || truthy(meta.requiresUser)) values.push("user");

  const rawRoles = unique(values.flat(Infinity).map((item) => safeText(item, "")).filter(Boolean));
  const normalized = normalizeGuardRoles(rawRoles);
  const roles = normalized.filter((role) => role === "admin" || role === "user");
  const unsupportedRoles = normalized.filter((role) => role && role !== "admin" && role !== "user");

  return { rawRoles, roles, unsupportedRoles };
}

function routeRequiresAuth(route) {
  if (!route) return false;
  if (isExplicitPrivate(route)) return true;
  if (routeRoleInfo(route).rawRoles.length) return true;
  if (isExplicitPublic(route)) return false;
  return false;
}

/* =========================================================
   PUBLIC TECHNICAL
========================================================= */

function isPublicTechnicalPath(path = "/") {
  const clean = stripSearchAndHash(stripUsernamePrefix(path));

  return PUBLIC_TECHNICAL_ROUTES.some((route) => {
    const normalized = normalizePathname(route);
    if (LOGIN_PATHS.includes(normalized)) return false;
    return clean === normalized || clean.startsWith(`${normalized}/`);
  });
}

function isAuthRoutePath(path = "/") {
  const clean = stripSearchAndHash(stripUsernamePrefix(path));
  if (LOGIN_PATHS.includes(clean)) return true;
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

function getViaAuth(Auth = null, names = []) {
  for (const name of names) {
    try {
      if (!isFn(Auth?.[name])) continue;
      const value = Auth[name]();
      if (value !== null && value !== undefined && value !== "") return value;
    } catch {}
  }

  return null;
}

function currentUser(AppCore = null, Auth = null) {
  return safeObject(first(
    getViaAuth(Auth, ["getUser", "getCurrentUser", "currentUser"]),
    AppCore?.state?.user,
    AppCore?.state?.currentUser,
    AppCore?.state?.sessionUser,
    AppCore?.state?.authUser,
    AppCore?.state?.session?.user,
    Auth?.session?.user,
    Auth?.user
  ));
}

function currentToken(AppCore = null, Auth = null) {
  let token = first(
    getViaAuth(Auth, ["getToken", "getAccessToken"]),
    AppCore?.state?.token,
    AppCore?.state?.accessToken,
    AppCore?.state?.access_token,
    AppCore?.state?.session?.token,
    AppCore?.state?.session?.accessToken,
    Auth?.token,
    Auth?.accessToken,
    Auth?.access_token,
    Auth?.session?.token,
    Auth?.session?.accessToken
  );

  if (!token) {
    try {
      const header = isFn(Auth?.getAuthHeader) ? Auth.getAuthHeader() : null;
      const auth = isObject(header) ? header.Authorization || header.authorization : header;
      token = safeText(auth, "").replace(/^Bearer\s+/i, "").trim();
    } catch {}
  }

  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function usableToken(token = "") {
  const value = safeText(token, "").replace(/^Bearer\s+/i, "").trim();

  if (!value) return false;
  if (BAD_TOKEN_VALUES.has(value.toLowerCase())) return false;
  if (/[\s\r\n\t]/.test(value)) return false;
  if (value.length > 8192) return false;

  return true;
}

function normalizeStatus(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function userActive(user = null) {
  if (!isObject(user)) return false;

  const status = normalizeStatus(first(user.status, user.estado, user.state, user.accountStatus, user.account_status, ""));

  if ([
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
  ].includes(status)) return false;

  return !(user.active === false || user.enabled === false || user.disabled === true || user.is_active === false || user.isActive === false || user.is_enabled === false || user.isEnabled === false || user.blocked === true || user.locked === true || user.deleted === true || user.archived === true || user.suspended === true || user.banned === true || user.revoked === true);
}

function usableUser(user = null) {
  return Boolean(isObject(user) && userActive(user) && USER_ID_KEYS.some((key) => safeText(user?.[key], "")));
}

function authApiAuthenticated(Auth = null) {
  try {
    if (isFn(Auth?.isAuthenticated)) return Boolean(Auth.isAuthenticated());
  } catch {}

  return Boolean(Auth?.authenticated || Auth?.isAuth || Auth?.session?.authenticated);
}

function isAuthenticated(AppCore = null, Auth = null) {
  return Boolean(usableToken(currentToken(AppCore, Auth)) && usableUser(currentUser(AppCore, Auth)));
}

function hasGhostAuth(AppCore = null, Auth = null) {
  const appSaysAuth = Boolean(AppCore?.state?.authenticated || authApiAuthenticated(Auth));
  return Boolean(appSaysAuth && !isAuthenticated(AppCore, Auth));
}

function roleCandidates(AppCore = null, Auth = null) {
  const user = currentUser(AppCore, Auth);
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const raw = safeObject(user.raw);
  const profile = safeObject(user.profile);

  const values = [
    getViaAuth(Auth, ["getRole", "getCurrentRole"]),
    ...safeArray(getViaAuth(Auth, ["getRoles", "getCurrentRoles"])),
    state.role,
    state.rol,
    state.userRole,
    ...safeArray(state.roles),
    session.role,
    session.rol,
    session.userRole,
    ...safeArray(session.roles),
    user.role,
    user.rol,
    user.userRole,
    user.user_role,
    ...safeArray(user.roles),
    profile.role,
    profile.rol,
    ...safeArray(profile.roles),
    raw.role,
    raw.rol,
    ...safeArray(raw.roles),
    Auth?.role,
    Auth?.rol,
    Auth?.userRole,
    ...safeArray(Auth?.roles),
  ];

  if ([state.isAdmin, state.admin, session.isAdmin, session.admin, user.isAdmin, user.admin, profile.isAdmin, profile.admin, raw.isAdmin, raw.admin].some(truthy)) values.push("admin");

  const roles = normalizeGuardRoles(values);
  if (roles.includes("admin")) return ["admin"];
  if (roles.includes("user")) return ["user"];
  return isAuthenticated(AppCore, Auth) ? ["user"] : [];
}

function currentRole(AppCore = null, Auth = null) {
  const roles = roleCandidates(AppCore, Auth);
  return roles.includes("admin") ? "admin" : roles[0] || "";
}

function hasAllowedRole(AppCore = null, Auth = null, allowedRoles = []) {
  const allowed = normalizeGuardRoles(allowedRoles).filter((role) => role === "admin" || role === "user");
  if (!allowed.length) return true;

  const roles = roleCandidates(AppCore, Auth);
  if (roles.includes("admin")) return true;

  return allowed.some((role) => roles.includes(role));
}

/* =========================================================
   RUNTIME / REDIRECTS
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

function authenticatedRedirectTarget(AppCore, route, getRoute) {
  const explicit = safeText(first(route?.redirectAuthenticated, route?.redirectIfAuth, route?.meta?.redirectAuthenticated, route?.meta?.redirectIfAuth, ""), "");

  if (explicit) {
    const target = safeRedirect(explicit, "");
    if (target && !sameCanonical(target, LOGIN_PATH) && !isPublicTechnicalPath(target) && !isAuthRoutePath(target)) return target;
  }

  const home = getDefaultHomeTarget(AppCore, getRoute);
  return safeRedirect(home, HOME_PATH) || HOME_PATH;
}

function loginRedirectTarget(AppCore, routeNames = {}, publicPath = "/") {
  const loginPath = routeNames.LOGIN || LOGIN_PATH;
  const cleanPublicPath = normalizePublicPath(publicPath || HOME_PATH);

  if (sameCanonical(cleanPublicPath, loginPath) || isPublicTechnicalPath(cleanPublicPath) || isAuthRoutePath(cleanPublicPath) || !isSafeRelativePath(cleanPublicPath)) return loginPath;

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

function details({ AppCore, Auth, route, canonicalPath, publicPath, extra = {} } = {}) {
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
    currentRole: currentRole(AppCore, Auth),
    userRoles: roles,
    runtime: getRuntimeFlags(AppCore),
    ...safeObject(extra),
  };
}

function allowResult({ route, canonicalPath, publicPath, getRoute, details: info = {} } = {}) {
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

function denyResult({ reason, route, redirectTo = null, canonicalPath, publicPath, details: info = {} } = {}) {
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

export function shouldAllowRoute({ AppCore, Auth, route, requestedCanonicalPath = "/", requestedPublicPath = null, getRoute } = {}) {
  const routeNames = safeObject(getRouteNames(AppCore));
  const canonicalPath = normalizeCanonical(AppCore, requestedCanonicalPath);
  const publicPath = normalizePublicPath(requestedPublicPath || canonicalPath);

  if (!route) {
    return allowResult({
      route: null,
      canonicalPath,
      publicPath,
      getRoute,
      details: details({ AppCore, Auth, route: null, canonicalPath, publicPath, extra: { reason: GUARD_REASONS.routeNotFound } }),
    });
  }

  const logged = isAuthenticated(AppCore, Auth);
  const ghost = hasGhostAuth(AppCore, Auth);
  const guestOnly = routeGuestOnly(route, canonicalPath);
  const roleInfo = routeRoleInfo(route);
  const requiresAuth = routeRequiresAuth(route);
  const roles = roleCandidates(AppCore, Auth);
  const role = currentRole(AppCore, Auth);

  if (guestOnly && logged) {
    if (loginTransitionActive(AppCore)) {
      return allowResult({
        route,
        canonicalPath,
        publicPath,
        getRoute,
        details: details({ AppCore, Auth, route, canonicalPath, publicPath, extra: { reason: GUARD_REASONS.loginTransition, guestOnly, logged, currentRole: role, userRoles: roles } }),
      });
    }

    return denyResult({
      reason: GUARD_REASONS.alreadyAuthenticated,
      route,
      redirectTo: authenticatedRedirectTarget(AppCore, route, getRoute) || routeNames.HOME || HOME_PATH,
      canonicalPath,
      publicPath,
      details: details({ AppCore, Auth, route, canonicalPath, publicPath, extra: { guestOnly, currentRole: role, userRoles: roles } }),
    });
  }

  if (isPublicTechnicalRoute(route, canonicalPath, publicPath)) {
    return allowResult({
      route,
      canonicalPath,
      publicPath,
      getRoute,
      details: details({ AppCore, Auth, route, canonicalPath, publicPath, extra: { reason: GUARD_REASONS.publicTechnical, publicTechnical: true } }),
    });
  }

  if (isExplicitPublic(route) && !requiresAuth && !roleInfo.rawRoles.length) {
    return allowResult({
      route,
      canonicalPath,
      publicPath,
      getRoute,
      details: details({ AppCore, Auth, route, canonicalPath, publicPath, extra: { reason: GUARD_REASONS.publicRoute, publicRoute: true } }),
    });
  }

  if ((requiresAuth || roleInfo.rawRoles.length > 0) && !logged) {
    return denyResult({
      reason: ghost ? GUARD_REASONS.ghostAuth : GUARD_REASONS.notAuthenticated,
      route,
      redirectTo: loginRedirectTarget(AppCore, routeNames, publicPath),
      canonicalPath,
      publicPath,
      details: details({ AppCore, Auth, route, canonicalPath, publicPath, extra: { requiresAuth: true, allowedRoles: roleInfo.roles, unsupportedRoles: roleInfo.unsupportedRoles, ghostAuth: ghost } }),
    });
  }

  if (roleInfo.rawRoles.length > 0 && !roleInfo.roles.length) {
    return denyResult({
      reason: GUARD_REASONS.unsupportedRole,
      route,
      redirectTo: safeRedirect(route.redirectForbidden || route.meta?.redirectForbidden || "", FORBIDDEN_PATH) || null,
      canonicalPath,
      publicPath,
      details: details({ AppCore, Auth, route, canonicalPath, publicPath, extra: { currentRole: role, userRoles: roles, unsupportedRoles: roleInfo.unsupportedRoles } }),
    });
  }

  if (roleInfo.roles.length > 0 && logged && !hasAllowedRole(AppCore, Auth, roleInfo.roles)) {
    return denyResult({
      reason: GUARD_REASONS.insufficientRole,
      route,
      redirectTo: safeRedirect(route.redirectForbidden || route.meta?.redirectForbidden || "", "") || null,
      canonicalPath,
      publicPath,
      details: details({ AppCore, Auth, route, canonicalPath, publicPath, extra: { currentRole: role, userRoles: roles, allowedRoles: roleInfo.roles } }),
    });
  }

  return allowResult({
    route,
    canonicalPath,
    publicPath,
    getRoute,
    details: details({ AppCore, Auth, route, canonicalPath, publicPath, extra: { reason: GUARD_REASONS.allow, logged, ghostAuth: ghost, currentRole: role, userRoles: roles, guestOnly, requiresAuth, allowedRoles: roleInfo.roles, unsupportedRoles: roleInfo.unsupportedRoles } }),
  });
}

/* =========================================================
   DEBUG
========================================================= */

export function getGuardsSnapshot({ AppCore = null, Auth = null, route = null, requestedCanonicalPath = AppCore?.state?.route || "/", requestedPublicPath = AppCore?.state?.publicPath || requestedCanonicalPath, getRoute = null } = {}) {
  const canonicalPath = normalizeCanonical(AppCore, requestedCanonicalPath);
  const publicPath = normalizePublicPath(requestedPublicPath || canonicalPath);
  const roleInfo = route ? routeRoleInfo(route) : { roles: [], unsupportedRoles: [], rawRoles: [] };
  const access = shouldAllowRoute({ AppCore, Auth, route, requestedCanonicalPath: canonicalPath, requestedPublicPath: publicPath, getRoute });
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
      roles: roleInfo.roles,
      unsupportedRoles: roleInfo.unsupportedRoles,
      publicTechnical: route ? isPublicTechnicalRoute(route, canonicalPath, publicPath) : false,
    },
    runtime: getRuntimeFlags(AppCore),
    policy: {
      ownAuth: false,
      ownStorage: false,
      ownTransport: false,
      ownRouterNavigation: false,
      roles: ["admin", "user"],
    },
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
