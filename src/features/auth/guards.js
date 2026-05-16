/* =========================================================
   Onion SPA - Auth Guards
   Archivo: src/features/auth/guards.js

   AUTH GUARDS · FINAL SIMPLE
   - Sólo control de acceso frontend
   - Autenticado = token usable + user usable + user activo
   - Roles reales: admin / user
   - support/manager/client = compat legacy sin permisos reales
   - Sin fetch, refresh, restore, storage, Toast ni navegación agresiva
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
  normalizePath,
  normalizeCanonicalPath,
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_CONSTANTS,
} from "./constants.js";

/* =========================================================
   META
========================================================= */

export const GUARDS_VERSION = "20.0.0-final";

const SOURCE = "auth.guards";
const LOGIN_PATH = "/login";
const HOME_PATH = "/";
const FORBIDDEN_PATH = "/403";
const DEFAULT_TOKEN_MAX = 8192;

const PUBLIC_TECHNICAL_PATHS = Object.freeze([
  ...(Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES) ? AUTH_PUBLIC_TECHNICAL_ROUTES : []),
  "/login",
  "/signin",
  "/sign-in",
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
  "/2fa",
  "/otp",
  "/mfa",
]);

const LOGIN_PATHS = Object.freeze([
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/auth/login",
]);

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
  "\"null\"",
  "\"undefined\"",
  "\"false\"",
  "\"true\"",
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
]);

/* =========================================================
   BASE
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
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

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function getState() {
  try {
    return AppCore?.state && typeof AppCore.state === "object" ? AppCore.state : {};
  } catch {
    return {};
  }
}

function patchState(patch = {}, options = {}) {
  const cleanPatch = safeObject(patch);

  try {
    AppCore?.setState?.(cleanPatch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      emitDerived: false,
      silent: true,
      ...safeObject(options),
    });
  } catch {}

  try {
    AppCore?.patchState?.(cleanPatch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      silent: true,
      ...safeObject(options),
    });
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, cleanPatch);
  } catch {}

  return getState();
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(/([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token)=)([^&#\s]+)/gi, "$1***")
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  }
}

function publicUser(user = null) {
  if (!isObject(user)) return null;

  return {
    id: user.id ?? user.userId ?? user.user_id ?? user._id ?? user.uid ?? null,
    userId: user.userId ?? user.user_id ?? user.id ?? user._id ?? user.uid ?? null,
    username: user.username || user.userName || user.user_name || user.slug || null,
    email: user.email || user.mail || null,
    role: user.role || user.rol || user.userRole || null,
    roles: Array.isArray(user.roles) ? user.roles.filter((role) => ["admin", "user"].includes(String(role).toLowerCase())) : [],
  };
}

function sanitizePayload(payload = {}, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";

  const lowerKey = safeText(keyHint, "").toLowerCase();

  if (/token|authorization|password|secret|credential|cookie|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/.test(lowerKey)) {
    return payload ? "***" : payload;
  }

  if (typeof payload === "string") return redact(payload);
  if (payload === null || payload === undefined || typeof payload === "number" || typeof payload === "boolean") return payload;
  if (typeof payload === "bigint") return String(payload);
  if (typeof payload === "function") return "[function]";

  if (payload instanceof Error) {
    return buildGuardErrorPayload(payload);
  }

  if (Array.isArray(payload)) {
    return payload.slice(0, 50).map((item) => sanitizePayload(item, depth + 1, keyHint));
  }

  if (isObject(payload)) {
    if (lowerKey === "user") return publicUser(payload);

    const output = {};

    for (const [key, value] of Object.entries(payload).slice(0, 80)) {
      output[key] = sanitizePayload(value, depth + 1, key);
    }

    return output;
  }

  return redact(String(payload));
}

function shouldEmit(options = {}) {
  if (options.silent === true || options.emit === false || options.emitEvents === false) return false;
  if (options.emitEvents === true || options.emitGuardEvents === true || options.debugGuardEvents === true) return true;

  try {
    return Boolean(AppCore?.config?.diagnostics?.authGuardEvents === true || AppCore?.config?.debugAuthGuards === true);
  } catch {
    return false;
  }
}

function emit(eventName = "", payload = {}, options = {}) {
  if (!shouldEmit(options)) return false;

  const name = safeText(eventName, "");
  if (!name) return false;

  const cleanPayload = sanitizePayload({
    source: SOURCE,
    version: GUARDS_VERSION,
    at: nowIso(),
    ...safeObject(payload),
  });

  try {
    AppCore?.events?.emit?.(name, cleanPayload);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      document.dispatchEvent(new CustomEvent(name, { detail: cleanPayload, bubbles: false, cancelable: false }));
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   TOKEN / USER
========================================================= */

function tokenMaxLength() {
  return safeNumber(AUTH_CONSTANTS?.tokenMaxLength, DEFAULT_TOKEN_MAX) || DEFAULT_TOKEN_MAX;
}

function normalizeToken(token = null) {
  if (token === null || token === undefined) return "";

  let value = String(token).trim();
  if (/^bearer\s+/i.test(value)) value = value.replace(/^bearer\s+/i, "").trim();

  if (!value || /[\r\n\t\s]/.test(value) || BAD_TOKEN_VALUES.has(value.toLowerCase())) return "";
  if (value.length > tokenMaxLength()) return "";

  return value;
}

function getCurrentToken() {
  const state = getState();

  return normalizeToken(
    state.token ||
      state.accessToken ||
      state.access_token ||
      state.session?.token ||
      state.session?.accessToken ||
      state.session?.access_token ||
      state.sessionData?.token ||
      state.sessionData?.accessToken ||
      state.sessionData?.access_token ||
      ""
  );
}

function hasUsableToken(token = null) {
  const value = normalizeToken(token);
  if (!value) return false;

  try {
    if (isFn(AppCore?.utils?.hasValidToken)) return Boolean(AppCore.utils.hasValidToken(value));
  } catch {}

  return true;
}

export function getCurrentUser() {
  const state = getState();

  return (
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    state.account ||
    state.profile ||
    state.session?.user ||
    state.session?.usuario ||
    state.session?.me ||
    state.sessionData?.user ||
    state.sessionData?.usuario ||
    state.sessionData?.me ||
    null
  );
}

function hasUsableUser(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    safeText(user.id) ||
      safeText(user.userId) ||
      safeText(user.user_id) ||
      safeText(user._id) ||
      safeText(user.uid) ||
      safeText(user.uuid) ||
      safeText(user.sub) ||
      safeText(user.username) ||
      safeText(user.userName) ||
      safeText(user.user_name) ||
      safeText(user.email) ||
      safeText(user.mail) ||
      safeText(user.phone) ||
      safeText(user.telefono) ||
      safeText(user.mobile) ||
      safeText(user.displayName) ||
      safeText(user.name) ||
      safeText(user.nombre)
  );
}

function normalizeStatus(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .trim();
}

function isUserActive(user = null) {
  if (!isObject(user)) return false;

  const status = normalizeStatus(user.status ?? user.estado ?? user.state ?? user.accountStatus ?? user.account_status ?? "");

  if (["disabled", "blocked", "deleted", "archived", "inactive", "suspended", "locked", "banned", "deactivated", "revoked", "bloqueado", "eliminado", "inactivo", "suspendido", "desactivado"].includes(status)) {
    return false;
  }

  return !(user.active === false || user.enabled === false || user.disabled === true || user.is_active === false || user.isActive === false || user.is_enabled === false || user.isEnabled === false || user.blocked === true || user.locked === true || user.deleted === true || user.archived === true || user.suspended === true || user.banned === true || user.revoked === true);
}

/* =========================================================
   ROLES · ADMIN / USER
========================================================= */

function normalizeRole(value = "") {
  const raw = safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");

  if (ADMIN_ALIASES.has(raw)) return "admin";
  if (USER_ALIASES.has(raw)) return "user";
  return "";
}

function truthy(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "yes" || value === "si" || value === "sí" || value === "ok" || value === "on";
}

function rolesFromValue(value) {
  if (Array.isArray(value)) return value.flatMap(rolesFromValue);

  if (isObject(value)) {
    return Object.entries(value)
      .filter(([, itemValue]) => truthy(itemValue))
      .map(([key]) => normalizeRole(key))
      .filter(Boolean);
  }

  if (value === null || value === undefined || value === "") return [];

  if (typeof value === "string") {
    return value.split(/[,\s|]+/g).map(normalizeRole).filter(Boolean);
  }

  return [normalizeRole(value)].filter(Boolean);
}

function roleCandidates(user = null) {
  if (!hasUsableUser(user)) return [];

  const source = safeObject(user);
  const raw = safeObject(source.raw);
  const profile = safeObject(source.profile);
  const account = safeObject(source.account);
  const claims = safeObject(source.claims);
  const state = getState();

  const candidates = [
    source.role,
    source.rol,
    source.userRole,
    source.user_role,
    profile.role,
    profile.rol,
    account.role,
    account.rol,
    raw.role,
    raw.rol,
    raw?.profile?.role,
    raw?.account?.role,
    claims.role,
    claims.rol,
    claims["custom:role"],
    state.role,
    state.rol,
    state.userRole,
    state.session?.role,
    state.session?.rol,
    state.sessionData?.role,
    state.sessionData?.rol,
    ...safeArray(source.roles),
    ...safeArray(profile.roles),
    ...safeArray(account.roles),
    ...safeArray(raw.roles),
    ...safeArray(claims.roles),
    ...safeArray(state.roles),
    ...safeArray(state.session?.roles),
    ...safeArray(state.sessionData?.roles),
  ];

  if ([source.isAdmin, source.admin, source.is_admin, source.isSuperAdmin, source.superAdmin, raw.isAdmin, raw.admin, profile.isAdmin, account.isAdmin, claims.isAdmin, state.isAdmin].some(truthy)) {
    candidates.push("admin");
  }

  return candidates;
}

function normalizeRoles(values = []) {
  const roles = unique(safeArray(values).flat(Infinity).flatMap(rolesFromValue).map(normalizeRole).filter(Boolean));
  if (roles.includes("admin")) return ["admin"];
  if (roles.includes("user")) return ["user"];
  return [];
}

function normalizeRequiredRoles(values = []) {
  return normalizeRoles(values);
}

function getUserRoles(user = null) {
  if (!hasUsableUser(user)) return [];

  const roles = normalizeRoles(roleCandidates(user));
  return roles.length ? roles : ["user"];
}

export function getCurrentRoles() {
  const user = getCurrentUser();
  if (!hasUsableUser(user)) return [];
  return getUserRoles(user);
}

export function getCurrentRole() {
  const roles = getCurrentRoles();
  return roles.includes("admin") ? "admin" : roles[0] || "";
}

export function isCurrentUserAdmin() {
  return getCurrentRoles().includes("admin");
}

export function isCurrentUserSupport() {
  return false;
}

export function isCurrentUserManager() {
  return false;
}

export function isCurrentUserClient() {
  return false;
}

export function hasRole(...roles) {
  if (!roles.length) return true;
  if (!isAuthenticated()) return false;

  const required = normalizeRequiredRoles(roles.flat(Infinity));
  if (!required.length) return false;

  const current = new Set(getCurrentRoles());
  return required.some((role) => current.has(role));
}

export function requireRole(...roles) {
  return Boolean(isAuthenticated() && hasRole(...roles));
}

/* =========================================================
   AUTH STATE
========================================================= */

export function syncAuthState() {
  const token = getCurrentToken();
  const user = getCurrentUser();
  const hasToken = hasUsableToken(token);
  const hasUser = hasUsableUser(user);
  const userActive = isUserActive(user);
  const authenticated = Boolean(hasToken && hasUser && userActive);
  const roles = authenticated ? getUserRoles(user) : [];
  const role = authenticated ? (roles.includes("admin") ? "admin" : roles[0] || "user") : "";

  patchState(
    {
      authenticated,
      hasToken,
      token: hasToken ? token : null,
      accessToken: hasToken ? token : null,
      access_token: hasToken ? token : null,
      user: authenticated ? user : null,
      currentUser: authenticated ? user : null,
      authUser: authenticated ? user : null,
      sessionUser: authenticated ? user : null,
      account: authenticated ? user : null,
      profile: authenticated ? user : null,
      role,
      rol: role,
      userRole: role,
      roles,
      isAdmin: authenticated && role === "admin",
      isSupport: false,
      isManager: false,
      isClient: false,
      currentResolvedUsername: authenticated ? user?.slug || user?.usernameLower || user?.username || null : null,
      resolvedUsername: authenticated ? user?.slug || user?.usernameLower || user?.username || null : null,
    },
    {
      forceUnauthenticated: !authenticated,
      allowExplicitAuthenticated: authenticated,
    }
  );

  return authenticated;
}

export function isAuthenticated() {
  return Boolean(syncAuthState());
}

export function getAuthHeader() {
  const token = getCurrentToken();
  if (!hasUsableToken(token)) return {};

  const headerName = safeText(AppCore?.config?.auth?.tokenHeader, "Authorization");
  const prefix = safeText(AppCore?.config?.auth?.bearerPrefix, "Bearer");

  return { [headerName]: `${prefix} ${token}` };
}

/* =========================================================
   PATHS
========================================================= */

function normalizePublicPath(path = "/") {
  try {
    return normalizePath(path);
  } catch {
    return safeText(path, "/");
  }
}

function normalizeCanonical(path = "/") {
  try {
    return normalizeCanonicalPath(path);
  } catch {
    return safeText(path, "/").split("?")[0].split("#")[0] || "/";
  }
}

function getBrowserPath() {
  if (!isBrowser()) return "";

  try {
    const hash = window.location.hash || "";
    if (hash.startsWith("#/") || hash.startsWith("#!")) return hash.replace(/^#!?\/?/, "/") || "/";
    return `${window.location.pathname || "/"}${window.location.search || ""}${hash}`;
  } catch {
    return "";
  }
}

function getCurrentPath() {
  try {
    return normalizeCanonical(getCurrentCanonicalPath?.() || getCurrentPublicPath?.() || "/");
  } catch {
    return normalizeCanonical(getBrowserPath() || "/");
  }
}

function getCurrentPublicPathSafe() {
  try {
    return normalizePublicPath(getCurrentPublicPath?.() || getBrowserPath() || "/");
  } catch {
    return normalizePublicPath(getBrowserPath() || "/");
  }
}

function isPublicTechnicalPath(path = "") {
  const clean = normalizeCanonical(path).toLowerCase();

  return unique(PUBLIC_TECHNICAL_PATHS).some((item) => {
    const candidate = normalizeCanonical(item).toLowerCase();
    return clean === candidate || clean.startsWith(`${candidate}/`);
  });
}

function isLoginPath(path = "") {
  const clean = normalizeCanonical(path).toLowerCase();

  return LOGIN_PATHS.some((item) => {
    const candidate = normalizeCanonical(item).toLowerCase();
    return clean === candidate || clean.startsWith(`${candidate}/`);
  });
}

function encodedRedirectRisk(path = "") {
  const raw = safeText(path, "");
  const lower = raw.toLowerCase();

  if (!raw) return true;

  if (raw.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(raw) || /[\r\n\t]/.test(raw) || raw.includes("\\") || lower.includes("%0d") || lower.includes("%0a") || lower.includes("%09") || lower.includes("%5c")) {
    return true;
  }

  try {
    const decoded = decodeURIComponent(raw).replace(/\\/g, "/").trim();
    return decoded.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(decoded) || /[\r\n\t]/.test(decoded);
  } catch {
    return true;
  }
}

function isSafeInternalPath(path = "") {
  const value = safeText(path, "");
  return Boolean(value && value.startsWith("/") && !encodedRedirectRisk(value));
}

function safeRedirect(path = "/", fallback = HOME_PATH) {
  const fallbackPath = isSafeInternalPath(fallback) ? normalizePublicPath(fallback) : HOME_PATH;
  const candidate = normalizePublicPath(path || fallbackPath);
  return isSafeInternalPath(candidate) ? candidate : fallbackPath;
}

function loginRedirect(currentPath = "/", loginPath = LOGIN_PATH) {
  const login = safeRedirect(loginPath, LOGIN_PATH);
  let current = safeRedirect(currentPath, HOME_PATH);

  if (isLoginPath(current)) current = HOME_PATH;

  try {
    const url = new URL(login, "http://localhost");
    url.searchParams.set("redirect", current);
    const finalPath = `${url.pathname}${url.search}`;
    return isSafeInternalPath(finalPath) ? finalPath : LOGIN_PATH;
  } catch {
    return LOGIN_PATH;
  }
}

/* =========================================================
   GUARD PAYLOADS
========================================================= */

function blockedPayload(reason, path, redirectTo = "", extra = {}) {
  const user = getCurrentUser();
  const token = getCurrentToken();

  return {
    reason,
    path,
    publicPath: getCurrentPublicPathSafe(),
    redirectTo,
    authenticated: Boolean(getState().authenticated),
    hasToken: hasUsableToken(token),
    hasUser: hasUsableUser(user),
    userActive: isUserActive(user),
    currentRole: getCurrentRole() || null,
    currentRoles: getCurrentRoles(),
    user: publicUser(user),
    ...safeObject(extra),
  };
}

function allowedPayload(reason, path, extra = {}) {
  return {
    reason,
    path,
    publicPath: getCurrentPublicPathSafe(),
    authenticated: Boolean(getState().authenticated),
    currentRole: getCurrentRole() || null,
    currentRoles: getCurrentRoles(),
    ...safeObject(extra),
  };
}

/* =========================================================
   GUARDS
========================================================= */

export function guardAuthenticated(options = {}) {
  const opts = safeObject(options);
  const path = normalizeCanonical(opts.path || getCurrentPath());
  const publicPath = getCurrentPublicPathSafe();

  if (opts.allowPublicTechnicalRoutes !== false && (isPublicTechnicalPath(path) || isPublicTechnicalPath(publicPath))) {
    emit("auth:guard:allowed", allowedPayload("public-technical-route", path), opts);
    return true;
  }

  if (isAuthenticated()) {
    emit("auth:guard:allowed", allowedPayload("authenticated", path), opts);
    return true;
  }

  const redirectTo = opts.withRedirectBack === false
    ? safeRedirect(opts.redirectTo || LOGIN_PATH, LOGIN_PATH)
    : loginRedirect(publicPath || path, opts.redirectTo || LOGIN_PATH);

  emit("auth:guard:blocked", blockedPayload("not-authenticated", path, redirectTo), opts);
  return false;
}

export function guardRole(roles = [], options = {}) {
  const opts = safeObject(options);
  const path = normalizeCanonical(opts.path || getCurrentPath());
  const publicPath = getCurrentPublicPathSafe();

  if (opts.allowPublicTechnicalRoutes !== false && (isPublicTechnicalPath(path) || isPublicTechnicalPath(publicPath))) {
    emit("auth:guard:allowed", allowedPayload("public-technical-route", path), opts);
    return true;
  }

  const rawRoles = safeArray(roles).flat(Infinity).filter((role) => safeText(role, ""));
  const requiredRoles = normalizeRequiredRoles(rawRoles);

  if (rawRoles.length && !requiredRoles.length) {
    emit("auth:guard:blocked", blockedPayload("unsupported-role", path, opts.redirectTo || FORBIDDEN_PATH, { requestedRoles: rawRoles }), opts);
    return false;
  }

  if (!isAuthenticated()) {
    const redirectTo = loginRedirect(publicPath || path, opts.loginRedirectTo || LOGIN_PATH);
    emit("auth:guard:blocked", blockedPayload("not-authenticated", path, redirectTo, { requiredRoles }), opts);
    return false;
  }

  if (!requiredRoles.length || hasRole(...requiredRoles)) {
    emit("auth:guard:allowed", allowedPayload("role-match", path, { requiredRoles }), opts);
    return true;
  }

  const redirectTo = safeRedirect(opts.redirectTo || FORBIDDEN_PATH, opts.fallbackRedirectTo || HOME_PATH);
  emit("auth:guard:blocked", blockedPayload("insufficient-role", path, redirectTo, { requiredRoles }), opts);
  return false;
}

export function guardGuest(options = {}) {
  const opts = safeObject(options);
  const path = normalizeCanonical(opts.path || getCurrentPath());
  const publicPath = getCurrentPublicPathSafe();

  if (opts.allowPublicTechnicalRoutes !== false && (isPublicTechnicalPath(path) || isPublicTechnicalPath(publicPath))) {
    emit("auth:guard:allowed", allowedPayload("public-technical-route", path), opts);
    return true;
  }

  if (!isAuthenticated()) {
    emit("auth:guard:allowed", allowedPayload("guest", path), opts);
    return true;
  }

  const redirectTo = safeRedirect(opts.redirectTo || HOME_PATH, HOME_PATH);
  emit("auth:guard:blocked", blockedPayload("already-authenticated", path, redirectTo), opts);
  return false;
}

export function guardAdmin(options = {}) {
  return guardRole(["admin"], options);
}

export function guardSupport(options = {}) {
  const opts = safeObject(options);
  const path = normalizeCanonical(opts.path || getCurrentPath());

  if (opts.allowPublicTechnicalRoutes !== false && isPublicTechnicalPath(path)) return true;

  emit("auth:guard:blocked", blockedPayload("unsupported-role", path, opts.redirectTo || FORBIDDEN_PATH, { requestedRoles: ["support"] }), opts);
  return false;
}

export function guardManager(options = {}) {
  const opts = safeObject(options);
  const path = normalizeCanonical(opts.path || getCurrentPath());

  if (opts.allowPublicTechnicalRoutes !== false && isPublicTechnicalPath(path)) return true;

  emit("auth:guard:blocked", blockedPayload("unsupported-role", path, opts.redirectTo || FORBIDDEN_PATH, { requestedRoles: ["manager"] }), opts);
  return false;
}

export function canAccessRoute({ path = "", roles = [], requireAuth = true, allowPublicTechnicalRoutes = true } = {}) {
  const currentPath = normalizeCanonical(path || getCurrentPath());
  const currentPublicPath = getCurrentPublicPathSafe();

  if (allowPublicTechnicalRoutes && (isPublicTechnicalPath(currentPath) || isPublicTechnicalPath(currentPublicPath))) return true;
  if (requireAuth !== false && !isAuthenticated()) return false;

  const rawRoles = safeArray(roles).flat(Infinity).filter((role) => safeText(role, ""));
  if (!rawRoles.length) return true;

  const requiredRoles = normalizeRequiredRoles(rawRoles);
  if (!requiredRoles.length) return false;

  return hasRole(...requiredRoles);
}

/* =========================================================
   ERROR / DEBUG
========================================================= */

export function buildGuardErrorPayload(error) {
  let message = "";

  try {
    message = extractMessage(error);
  } catch {
    message = error?.message || String(error || "Error");
  }

  return {
    message: redact(message),
    name: error?.name || "Error",
    status: error?.status || error?.statusCode || error?.response?.status || error?.data?.status || 0,
    code: error?.code || error?.data?.code || error?.response?.data?.code || null,
  };
}

export function getAuthGuardsSnapshot() {
  const path = getCurrentPath();
  const publicPath = getCurrentPublicPathSafe();
  const user = getCurrentUser();
  const token = getCurrentToken();

  syncAuthState();

  return {
    version: GUARDS_VERSION,
    authenticated: Boolean(getState().authenticated),
    hasToken: hasUsableToken(token),
    hasUser: hasUsableUser(user),
    userActive: isUserActive(user),
    currentRole: getCurrentRole() || null,
    currentRoles: getCurrentRoles(),
    isAdmin: isCurrentUserAdmin(),
    isSupport: false,
    isManager: false,
    isClient: false,
    path: redact(path),
    publicPath: redact(publicPath),
    publicTechnical: isPublicTechnicalPath(path) || isPublicTechnicalPath(publicPath),
    state: {
      route: redact(getState().route || ""),
      publicPath: redact(getState().publicPath || ""),
      role: getState().role || null,
      roles: safeArray(getState().roles),
      authenticated: Boolean(getState().authenticated),
      hasToken: Boolean(getState().hasToken),
    },
    policy: {
      ownFetch: false,
      ownRefresh: false,
      ownRestore: false,
      ownRouter: false,
      ownToast: false,
      roles: ["admin", "user"],
      supportManagerClient: false,
    },
    at: nowIso(),
  };
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  GUARDS_VERSION,

  syncAuthState,

  isAuthenticated,
  getCurrentUser,

  getCurrentRole,
  getCurrentRoles,

  isCurrentUserAdmin,
  isCurrentUserSupport,
  isCurrentUserManager,
  isCurrentUserClient,

  hasRole,
  requireRole,
  getAuthHeader,

  guardAuthenticated,
  guardRole,
  guardGuest,
  guardAdmin,
  guardSupport,
  guardManager,

  canAccessRoute,

  requireAuth: guardAuthenticated,
  ensureAuthenticated: guardAuthenticated,
  requireGuest: guardGuest,
  requireAdmin: guardAdmin,
  requireSupport: guardSupport,
  requireManager: guardManager,

  can: hasRole,
  canAccess: canAccessRoute,

  buildGuardErrorPayload,

  getAuthGuardsSnapshot,
  getDebugSnapshot: getAuthGuardsSnapshot,
};
