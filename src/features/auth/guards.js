/* =========================================================
   Onion SPA - Auth Guards
   Archivo: src/features/auth/guards.js

   AUTH GUARDS · SIMPLE CLEAN · NO GHOST AUTH

   Contrato:
   - Autenticado = token usable + user usable + user activo.
   - Token solo sirve para Authorization durante restore /me, pero no autentica.
   - Roles canónicos del sistema: admin / user.
   - Rutas públicas técnicas no se bloquean.
   - Redirects internos blindados.
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

export const GUARDS_VERSION = "17.0.0-simple-clean";

const SOURCE = "auth.guards";

const LOGIN_PATH = "/login";
const HOME_PATH = "/";
const FORBIDDEN_PATH = "/403";

const DEFAULT_TOKEN_MAX = 8192;

const PUBLIC_TECHNICAL_PATHS = Object.freeze([
  ...(Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES)
    ? AUTH_PUBLIC_TECHNICAL_ROUTES
    : []),

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
  "client",
  "cliente",
  "customer",
]);

/* =========================================================
   BASE
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text = safeText(value).toLowerCase();

  if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) {
    return false;
  }

  return Boolean(fallback);
}

function unique(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) => safeText(item))
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
    return AppCore?.state || {};
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
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, cleanPatch);
    }
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
    return safeText(value)
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token)=)([^&#\s]+)/gi,
        "$1***"
      )
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
    roles: Array.isArray(user.roles) ? user.roles : [],
  };
}

function sanitizePayload(payload = {}, depth = 0) {
  if (depth > 4) return "[MaxDepth]";

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item, depth + 1));
  }

  if (!isObject(payload)) {
    return typeof payload === "string" ? redact(payload) : payload;
  }

  const output = {};

  for (const [key, value] of Object.entries(payload)) {
    const lower = key.toLowerCase();

    if (
      lower.includes("token") ||
      lower.includes("authorization") ||
      lower.includes("password") ||
      lower.includes("secret") ||
      lower === "code" ||
      lower === "otp" ||
      lower === "totp" ||
      lower === "t"
    ) {
      output[key] = value ? "***" : value;
      continue;
    }

    if (lower === "user") {
      output[key] = publicUser(value);
      continue;
    }

    if (lower.includes("path") || lower.includes("url") || lower.includes("redirect")) {
      output[key] = typeof value === "string" ? redact(value) : sanitizePayload(value, depth + 1);
      continue;
    }

    output[key] = sanitizePayload(value, depth + 1);
  }

  return output;
}

function emit(eventName, payload = {}, options = {}) {
  if (options?.silent === true || options?.emit === false || options?.emitEvents === false) {
    return false;
  }

  const name = safeText(eventName);
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
    if (isBrowser()) {
      document.dispatchEvent(
        new CustomEvent(name, {
          detail: cleanPayload,
          bubbles: false,
          cancelable: false,
        })
      );
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

  if (/^bearer\s+/i.test(value)) {
    value = value.replace(/^bearer\s+/i, "").trim();
  }

  if (!value || /[\r\n\t\s]/.test(value) || BAD_TOKEN_VALUES.has(value.toLowerCase())) {
    return "";
  }

  if (value.length > tokenMaxLength()) {
    return "";
  }

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
    if (isFn(AppCore?.utils?.hasValidToken)) {
      return Boolean(AppCore.utils.hasValidToken(value));
    }
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
  return safeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .trim();
}

function isUserActive(user = null) {
  if (!isObject(user)) return false;

  const status = normalizeStatus(
    user.status ??
      user.estado ??
      user.state ??
      user.accountStatus ??
      user.account_status ??
      ""
  );

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

/* =========================================================
   ROLES · SOLO ADMIN / USER
========================================================= */

function normalizeRole(value = "") {
  const raw = safeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");

  if (ADMIN_ALIASES.has(raw)) return "admin";
  if (USER_ALIASES.has(raw)) return "user";

  return raw || "";
}

function truthy(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "yes" ||
    value === "si" ||
    value === "sí" ||
    value === "ok" ||
    value === "on"
  );
}

function rolesFromValue(value) {
  if (Array.isArray(value)) {
    return value.flatMap(rolesFromValue);
  }

  if (isObject(value)) {
    return Object.entries(value)
      .filter(([, itemValue]) => truthy(itemValue))
      .map(([key]) => normalizeRole(key))
      .filter(Boolean);
  }

  if (value === null || value === undefined || value === "") {
    return [];
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s|]+/g)
      .map(normalizeRole)
      .filter(Boolean);
  }

  return [normalizeRole(value)].filter(Boolean);
}

function userRoleCandidates(user = null) {
  if (!hasUsableUser(user)) return [];

  const source = safeObject(user);
  const raw = safeObject(source.raw);
  const profile = safeObject(source.profile);
  const account = safeObject(source.account);
  const meta = safeObject(source.meta);
  const claims = safeObject(source.claims);
  const state = getState();

  const candidates = [
    source.role,
    source.rol,
    source.userRole,
    source.user_role,
    source.type,
    source.userType,
    source.user_type,
    source.perfil,

    profile.role,
    profile.rol,
    profile.userRole,
    profile.user_role,

    account.role,
    account.rol,
    account.userRole,
    account.user_role,

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw?.profile?.role,
    raw?.profile?.rol,
    raw?.account?.role,
    raw?.account?.rol,

    meta.role,
    meta.rol,
    claims.role,
    claims.rol,
    claims["custom:role"],
    claims["https://onion/role"],

    state.role,
    state.rol,
    state.userRole,
    state.session?.role,
    state.session?.rol,
    state.sessionData?.role,
    state.sessionData?.rol,
  ];

  const arrays = [
    source.roles,
    source.roleList,
    source.role_list,
    source.groups,
    source.authorities,
    source.scopes,

    profile.roles,
    profile.groups,
    profile.authorities,
    profile.scopes,

    account.roles,
    account.groups,
    account.authorities,
    account.scopes,

    raw.roles,
    raw.roleList,
    raw.role_list,
    raw.groups,
    raw.authorities,
    raw.scopes,

    raw?.profile?.roles,
    raw?.profile?.groups,
    raw?.account?.roles,
    raw?.account?.groups,

    meta.roles,
    meta.groups,
    meta.scopes,

    claims.roles,
    claims.groups,
    claims.scopes,

    state.roles,
    state.session?.roles,
    state.sessionData?.roles,
  ];

  const adminFlag = [
    source.isAdmin,
    source.admin,
    source.is_admin,
    source.isSuperAdmin,
    source.superAdmin,
    source.is_super_admin,
    source.canManageUsers,
    source.can_manage_users,
    source.canAccessUsers,
    source.can_access_users,

    profile.isAdmin,
    profile.admin,
    profile.isSuperAdmin,
    profile.superAdmin,

    account.isAdmin,
    account.admin,
    account.isSuperAdmin,
    account.superAdmin,

    raw.isAdmin,
    raw.admin,
    raw.is_admin,
    raw.isSuperAdmin,
    raw.superAdmin,

    raw?.profile?.isAdmin,
    raw?.profile?.admin,
    raw?.account?.isAdmin,
    raw?.account?.admin,

    meta.isAdmin,
    meta.admin,
    claims.isAdmin,
    claims.admin,

    state.isAdmin,
    state.session?.isAdmin,
    state.sessionData?.isAdmin,
  ].some(truthy);

  if (adminFlag) candidates.push("admin");

  return [
    ...candidates,
    ...arrays.flatMap((item) => safeArray(item)),
  ];
}

function normalizeRoles(values = []) {
  const roles = unique(
    safeArray(values)
      .flat(Infinity)
      .flatMap(rolesFromValue)
      .map(normalizeRole)
      .filter(Boolean)
  );

  return roles.includes("admin") ? ["admin"] : ["user"];
}

function getUserRoles(user = null) {
  if (!hasUsableUser(user)) return [];
  return normalizeRoles(userRoleCandidates(user));
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

/*
  Compat legacy:
  El sistema ya no tiene roles support/manager/client.
*/
export function isCurrentUserSupport() {
  return false;
}

export function isCurrentUserManager() {
  return false;
}

export function isCurrentUserClient() {
  return getCurrentRoles().includes("user");
}

export function hasRole(...roles) {
  const required = normalizeRoles(roles.flat(Infinity));

  if (!required.length) return true;

  const current = new Set(getCurrentRoles());

  return required.some((role) => current.has(role));
}

export function requireRole(...roles) {
  return isAuthenticated() && hasRole(...roles);
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
  const role = authenticated ? getCurrentRole() || "user" : "";

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
      isClient: authenticated && role === "user",

      currentResolvedUsername: authenticated
        ? user?.slug || user?.usernameLower || user?.username || null
        : null,

      resolvedUsername: authenticated
        ? user?.slug || user?.usernameLower || user?.username || null
        : null,
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

/*
  Authorization puede existir con token-only durante restore /me.
  No implica authenticated=true.
*/
export function getAuthHeader() {
  const token = getCurrentToken();

  if (!hasUsableToken(token)) {
    return {};
  }

  const headerName = safeText(AppCore?.config?.auth?.tokenHeader, "Authorization");
  const prefix = safeText(AppCore?.config?.auth?.bearerPrefix, "Bearer");

  return {
    [headerName]: `${prefix} ${token}`,
  };
}

/* =========================================================
   PATH / REDIRECT
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

function getBrowserPath() {
  if (!isBrowser()) return "";

  try {
    const hash = window.location.hash || "";

    if (hash.startsWith("#/") || hash.startsWith("#!")) {
      return hash.replace(/^#!?\/?/, "/") || "/";
    }

    return `${window.location.pathname || "/"}${window.location.search || ""}${hash}`;
  } catch {
    return "";
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
  const raw = safeText(path);
  const lower = raw.toLowerCase();

  if (!raw) return true;

  if (
    raw.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(raw) ||
    /[\r\n\t]/.test(raw) ||
    raw.includes("\\") ||
    lower.includes("%0d") ||
    lower.includes("%0a") ||
    lower.includes("%09") ||
    lower.includes("%5c")
  ) {
    return true;
  }

  try {
    const decoded = decodeURIComponent(raw).replace(/\\/g, "/").trim();

    return (
      decoded.startsWith("//") ||
      /^[a-z][a-z\d+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    );
  } catch {
    return true;
  }
}

function isSafeInternalPath(path = "") {
  const value = safeText(path);

  return Boolean(
    value &&
      value.startsWith("/") &&
      !encodedRedirectRisk(value)
  );
}

function safeRedirect(path = "/", fallback = HOME_PATH) {
  const fallbackPath = isSafeInternalPath(fallback) ? normalizePublicPath(fallback) : HOME_PATH;
  const candidate = normalizePublicPath(path || fallbackPath);

  return isSafeInternalPath(candidate) ? candidate : fallbackPath;
}

function loginRedirect(currentPath = "/", loginPath = LOGIN_PATH) {
  const login = safeRedirect(loginPath, LOGIN_PATH);

  let current = safeRedirect(currentPath, HOME_PATH);

  if (isLoginPath(current)) {
    current = HOME_PATH;
  }

  try {
    const url = new URL(login, "http://localhost");
    url.searchParams.set("redirect", current);

    const finalPath = `${url.pathname}${url.search}`;
    return isSafeInternalPath(finalPath) ? finalPath : LOGIN_PATH;
  } catch {
    return LOGIN_PATH;
  }
}

function getRouter() {
  const candidates = [];

  try {
    if (isFn(AppCore?.modules?.get)) {
      candidates.push(AppCore.modules.get("router"), AppCore.modules.get("Router"));
    }
  } catch {}

  candidates.push(
    AppCore?.router,
    AppCore?.Router,
    AppCore?.modules?.router,
    AppCore?.modules?.Router
  );

  if (isBrowser()) {
    try {
      candidates.push(window.Router, window.AppRouter, window.AppCore?.router, window.AppCore?.Router);
    } catch {}
  }

  return candidates.find((item) => item && (isFn(item.navigate) || isFn(item.go))) || null;
}

function navigateTo(path = "/", options = {}) {
  const target = safeRedirect(path, HOME_PATH);
  const replaceState = options.replaceState !== false;
  const force = options.force !== false;

  emit("auth:guard:navigate", {
    target,
    replaceState,
    force,
    reason: options.reason || "guard",
  }, options);

  if (options.hardRedirect !== true) {
    try {
      const router = getRouter();

      if (isFn(router?.navigate)) {
        const result = router.navigate(target, {
          replaceState,
          force,
          source: SOURCE,
        });

        result?.catch?.(() => {});
        return true;
      }

      if (isFn(router?.go)) {
        const result = router.go(target, {
          replaceState,
          force,
          source: SOURCE,
        });

        result?.catch?.(() => {});
        return true;
      }
    } catch {}
  }

  if (isBrowser()) {
    try {
      if (replaceState) {
        window.location.replace(target);
      } else {
        window.location.assign(target);
      }

      return true;
    } catch {
      try {
        window.location.href = target;
        return true;
      } catch {}
    }
  }

  return false;
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

  if (
    opts.allowPublicTechnicalRoutes !== false &&
    (isPublicTechnicalPath(path) || isPublicTechnicalPath(publicPath))
  ) {
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

  if (opts.autoNavigate === true || opts.hardRedirect === true) {
    navigateTo(redirectTo, {
      ...opts,
      replaceState: true,
      force: true,
      reason: "not-authenticated",
    });
  }

  return false;
}

export function guardRole(roles = [], options = {}) {
  const opts = safeObject(options);

  const path = normalizeCanonical(opts.path || getCurrentPath());
  const publicPath = getCurrentPublicPathSafe();

  if (
    opts.allowPublicTechnicalRoutes !== false &&
    (isPublicTechnicalPath(path) || isPublicTechnicalPath(publicPath))
  ) {
    emit("auth:guard:allowed", allowedPayload("public-technical-route", path), opts);
    return true;
  }

  const requiredRoles = normalizeRoles(roles);

  if (!isAuthenticated()) {
    const redirectTo = loginRedirect(publicPath || path, opts.loginRedirectTo || LOGIN_PATH);

    emit(
      "auth:guard:blocked",
      blockedPayload("not-authenticated", path, redirectTo, { requiredRoles }),
      opts
    );

    if (opts.autoNavigate === true || opts.hardRedirect === true) {
      navigateTo(redirectTo, {
        ...opts,
        replaceState: true,
        force: true,
        reason: "role:not-authenticated",
      });
    }

    return false;
  }

  if (hasRole(...requiredRoles)) {
    emit("auth:guard:allowed", allowedPayload("role-match", path, { requiredRoles }), opts);
    return true;
  }

  const redirectTo = safeRedirect(opts.redirectTo || FORBIDDEN_PATH, opts.fallbackRedirectTo || HOME_PATH);

  emit(
    "auth:guard:blocked",
    blockedPayload("insufficient-role", path, redirectTo, { requiredRoles }),
    opts
  );

  if (opts.autoNavigate === true || opts.hardRedirect === true) {
    navigateTo(redirectTo, {
      ...opts,
      replaceState: true,
      force: true,
      reason: "insufficient-role",
    });
  }

  return false;
}

export function guardGuest(options = {}) {
  const opts = safeObject(options);

  const path = normalizeCanonical(opts.path || getCurrentPath());
  const publicPath = getCurrentPublicPathSafe();

  if (
    opts.allowPublicTechnicalRoutes !== false &&
    (isPublicTechnicalPath(path) || isPublicTechnicalPath(publicPath))
  ) {
    emit("auth:guard:allowed", allowedPayload("public-technical-route", path), opts);
    return true;
  }

  if (!isAuthenticated()) {
    emit("auth:guard:allowed", allowedPayload("guest", path), opts);
    return true;
  }

  const redirectTo = safeRedirect(opts.redirectTo || HOME_PATH, HOME_PATH);

  emit("auth:guard:blocked", blockedPayload("already-authenticated", path, redirectTo), opts);

  if (opts.autoNavigate === true || opts.hardRedirect === true) {
    navigateTo(redirectTo, {
      ...opts,
      replaceState: true,
      force: true,
      reason: "already-authenticated",
    });
  }

  return false;
}

export function guardAdmin(options = {}) {
  return guardRole(["admin"], options);
}

/*
  Compat legacy bajo modelo admin/user:
  support/manager quedan como acceso admin.
*/
export function guardSupport(options = {}) {
  return guardRole(["admin"], options);
}

export function guardManager(options = {}) {
  return guardRole(["admin"], options);
}

export function canAccessRoute({
  path = "",
  roles = [],
  requireAuth = true,
  allowPublicTechnicalRoutes = true,
} = {}) {
  const currentPath = normalizeCanonical(path || getCurrentPath());
  const currentPublicPath = getCurrentPublicPathSafe();

  if (
    allowPublicTechnicalRoutes &&
    (isPublicTechnicalPath(currentPath) || isPublicTechnicalPath(currentPublicPath))
  ) {
    return true;
  }

  if (requireAuth !== false && !isAuthenticated()) {
    return false;
  }

  const requiredRoles = safeArray(roles).flat(Infinity).filter(Boolean);

  if (!requiredRoles.length) {
    return true;
  }

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
    isClient: isCurrentUserClient(),

    path: redact(path),
    publicPath: redact(publicPath),

    publicTechnical: isPublicTechnicalPath(path) || isPublicTechnicalPath(publicPath),

    hasRouter: Boolean(getRouter()),

    state: {
      route: redact(getState().route || ""),
      publicPath: redact(getState().publicPath || ""),
      role: getState().role || null,
      roles: safeArray(getState().roles),
      authenticated: Boolean(getState().authenticated),
      hasToken: Boolean(getState().hasToken),
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
