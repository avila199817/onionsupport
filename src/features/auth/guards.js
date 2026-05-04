/* =========================================================
   Onion SPA - Auth Guards
   Archivo: src/features/auth/guards.js

   RESPONSABILIDADES:
   - exponer helpers auth de estado
   - validar acceso por rol
   - bloquear navegación no autenticada
   - construir redirect seguro al login
   - exponer header Authorization
   - no bloquear rutas públicas técnicas
   - evitar estados auth fantasma
   - normalizar roles heterogéneos backend
   - servir como capa estable para Router / vistas / sidebar

   HARDENING EXTREMO:
   - authenticated sólo true con token usable + usuario usable + usuario activo
   - sync auth robusto con AppCore parcial
   - zero ghost auth
   - navegación opcional automática
   - eventos consistentes y sin tokens reales
   - roles normalizados con aliases admin/superadmin/owner/root
   - roles support/agent/helpdesk y manager/lead normalizados
   - guards reutilizables SPA/router
   - redirects internos blindados anti open-redirect
   - soporte roles array/string/CSV
   - soporte rutas públicas técnicas con tokens
   - snapshot diagnóstico seguro
   - compatibilidad legacy con nombres antiguos
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  hasValidToken,
  getCurrentCanonicalPath,
  getCurrentPublicPath,
  normalizePath,
  normalizeCanonicalPath,
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  AUTH_PUBLIC_TECHNICAL_ROUTES,
} from "./constants.js";

import {
  buildLoginRedirectPath,
} from "./login.js";

/* =========================================================
   CONSTANTS
========================================================= */

const GUARDS_VERSION =
  "10.0.0";

const LOGIN_PATH =
  "/login";

const DEFAULT_HOME_PATH =
  "/";

const DEFAULT_FORBIDDEN_PATH =
  "/403";

const PUBLIC_TECHNICAL_PATHS =
  Object.freeze([
    ...(Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES)
      ? AUTH_PUBLIC_TECHNICAL_ROUTES
      : []),

    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
  ]);

const ADMIN_ROLE_KEYS =
  Object.freeze([
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "super-administrador",
    "super_administrador",
    "owner",
    "root",
  ]);

const SUPPORT_ROLE_KEYS =
  Object.freeze([
    "support",
    "soporte",
    "agent",
    "agente",
    "helpdesk",
    "operator",
    "operador",
  ]);

const MANAGER_ROLE_KEYS =
  Object.freeze([
    "manager",
    "gestor",
    "gerente",
    "lead",
  ]);

const CLIENT_ROLE_KEYS =
  Object.freeze([
    "client",
    "cliente",
    "customer",
  ]);

const USER_ROLE_KEYS =
  Object.freeze([
    "user",
    "usuario",
  ]);

const ROLE_ALIASES =
  Object.freeze({
    administrador:
      "admin",

    administrator:
      "admin",

    superadmin:
      "admin",

    super_admin:
      "admin",

    "super-admin":
      "admin",

    super_administrador:
      "admin",

    "super-administrador":
      "admin",

    owner:
      "admin",

    root:
      "admin",

    soporte:
      "support",

    agente:
      "support",

    agent:
      "support",

    helpdesk:
      "support",

    operator:
      "support",

    operador:
      "support",

    gestor:
      "manager",

    gerente:
      "manager",

    lead:
      "manager",

    cliente:
      "client",

    customer:
      "client",

    usuario:
      "user",
  });

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return [];
  }

  return [value];
}

function unique(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) =>
          safeText(value, "")
        )
        .filter(Boolean)
    )
  );
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthGuard]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AuthGuard]",
      ...args
    );
  } catch {}
}

function safeSetState(patch = {}) {
  const safePatch =
    safeObject(patch);

  try {
    AppCore?.setState?.(
      safePatch
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        safePatch
      );
    }
  } catch {}

  return AppCore?.state || {};
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redactSafe(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(
        /([?&](?:token|activationToken|activateToken|resetToken|passwordResetToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  }
}

function sanitizeGuardPayload(payload = {}, depth = 0) {
  if (depth > 5) {
    return "[MaxDepth]";
  }

  if (Array.isArray(payload)) {
    return payload.map((item) =>
      sanitizeGuardPayload(
        item,
        depth + 1
      )
    );
  }

  if (!isObject(payload)) {
    return typeof payload === "string"
      ? redactSafe(payload)
      : payload;
  }

  const output = {};

  for (const [key, value] of Object.entries(payload)) {
    const lower =
      safeText(key, "")
        .toLowerCase();

    if (
      lower.includes("token") ||
      lower.includes("authorization") ||
      lower.includes("password") ||
      lower === "code" ||
      lower === "t"
    ) {
      output[key] =
        value ? "***" : value;
      continue;
    }

    if (
      lower.includes("path") ||
      lower.includes("url") ||
      lower.includes("redirect")
    ) {
      output[key] =
        typeof value === "string"
          ? redactSafe(value)
          : sanitizeGuardPayload(
              value,
              depth + 1
            );
      continue;
    }

    output[key] =
      sanitizeGuardPayload(
        value,
        depth + 1
      );
  }

  return output;
}

function safeEmit(eventName, payload = {}) {
  const cleanEvent =
    safeText(eventName, "");

  if (!cleanEvent) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      cleanEvent,
      sanitizeGuardPayload(payload)
    );

    return true;
  } catch {}

  return false;
}

/* =========================================================
   PATH HELPERS
========================================================= */

function normalizePathFallback(path = "/") {
  let value =
    safeText(path, "/")
      .replace(/\\/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value =
    value
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") ||
    "/";

  return value;
}

function normalizePublicPathSafe(path = "/") {
  const raw =
    safeText(path, "/");

  try {
    return normalizePath(raw);
  } catch {
    return normalizePathFallback(raw);
  }
}

function normalizeCanonicalPathSafe(path = "/") {
  const raw =
    safeText(path, "/");

  try {
    return normalizeCanonicalPath(raw);
  } catch {
    return normalizePathFallback(
      raw
        .split("?")[0]
        .split("#")[0] ||
        "/"
    );
  }
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return normalizePublicPathSafe(
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return "";
  }
}

function getCurrentPath() {
  try {
    const canonical =
      getCurrentCanonicalPath?.();

    if (canonical) {
      return normalizeCanonicalPathSafe(canonical);
    }
  } catch {}

  try {
    const publicPath =
      getCurrentPublicPath?.();

    if (publicPath) {
      return normalizeCanonicalPathSafe(publicPath);
    }
  } catch {}

  try {
    const statePath =
      AppCore?.state?.route ||
      AppCore?.state?.publicPath;

    if (statePath) {
      return normalizeCanonicalPathSafe(statePath);
    }
  } catch {}

  return normalizeCanonicalPathSafe(
    getBrowserPublicPath() || "/"
  );
}

function getCurrentPublicPathSafe() {
  try {
    const publicPath =
      getCurrentPublicPath?.();

    if (publicPath) {
      return normalizePublicPathSafe(publicPath);
    }
  } catch {}

  try {
    const statePath =
      AppCore?.state?.publicPath ||
      AppCore?.state?.route;

    if (statePath) {
      return normalizePublicPathSafe(statePath);
    }
  } catch {}

  return normalizePublicPathSafe(
    getBrowserPublicPath() || "/"
  );
}

function isPublicTechnicalPath(path = "") {
  const clean =
    normalizeCanonicalPathSafe(path)
      .toLowerCase();

  return unique(PUBLIC_TECHNICAL_PATHS).some((publicPath) => {
    const normalized =
      normalizeCanonicalPathSafe(publicPath)
        .toLowerCase();

    return (
      clean === normalized ||
      clean.startsWith(`${normalized}/`)
    );
  });
}

function isSafeInternalPath(path = "") {
  const value =
    safeText(path, "");

  if (!value) {
    return false;
  }

  if (!value.startsWith("/")) {
    return false;
  }

  if (value.startsWith("//")) {
    return false;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return false;
  }

  if (
    /[\r\n\t]/.test(value) ||
    value.toLowerCase().includes("%0d") ||
    value.toLowerCase().includes("%0a") ||
    value.toLowerCase().includes("%09") ||
    value.toLowerCase().includes("%5c")
  ) {
    return false;
  }

  return true;
}

function normalizeRedirectPath(path = "/", fallback = DEFAULT_HOME_PATH) {
  const raw =
    safeText(path, fallback);

  let candidate =
    raw;

  try {
    candidate =
      normalizePublicPathSafe(raw);
  } catch {
    candidate =
      normalizePathFallback(raw);
  }

  if (!isSafeInternalPath(candidate)) {
    return fallback;
  }

  return candidate;
}

function buildLoginRedirect(currentPath = "/", redirectTo = LOGIN_PATH) {
  const loginPath =
    normalizeRedirectPath(
      redirectTo,
      LOGIN_PATH
    );

  const safeCurrent =
    normalizeRedirectPath(
      currentPath,
      DEFAULT_HOME_PATH
    );

  if (loginPath === LOGIN_PATH) {
    try {
      const built =
        buildLoginRedirectPath(
          safeCurrent
        );

      if (
        built &&
        isSafeInternalPath(built)
      ) {
        return built;
      }
    } catch {}
  }

  try {
    const url =
      new URL(
        loginPath,
        "http://localhost"
      );

    url.searchParams.set(
      "redirect",
      safeCurrent
    );

    return `${url.pathname}${url.search}`;
  } catch {
    return `${loginPath}?redirect=${encodeURIComponent(safeCurrent)}`;
  }
}

/* =========================================================
   ROUTER / NAVIGATION
========================================================= */

function getRouter() {
  const candidates = [];

  try {
    if (isFunction(AppCore?.modules?.get)) {
      candidates.push(
        AppCore.modules.get("router"),
        AppCore.modules.get("Router")
      );
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
      candidates.push(
        window.Router,
        window.AppRouter,
        window.AppCore?.router,
        window.AppCore?.Router
      );
    } catch {}
  }

  return candidates.find((candidate) =>
    candidate &&
    (
      isFunction(candidate.navigate) ||
      isFunction(candidate.go)
    )
  ) || null;
}

function navigateTo(path = "/", options = {}) {
  const target =
    normalizeRedirectPath(
      path,
      DEFAULT_HOME_PATH
    );

  const replaceState =
    options.replaceState !== false;

  const force =
    options.force !== false;

  const hardRedirect =
    options.hardRedirect === true;

  safeEmit(
    "auth:guard:navigate",
    {
      target,
      replaceState,
      force,
      hardRedirect,
      reason:
        options.reason || "guard",
    }
  );

  if (!hardRedirect) {
    try {
      const router =
        getRouter();

      if (isFunction(router?.navigate)) {
        const result =
          router.navigate(
            target,
            {
              replaceState,
              force,
            }
          );

        if (
          result &&
          isFunction(result.catch)
        ) {
          result.catch((error) => {
            safeWarn(
              "Router.navigate falló.",
              error
            );
          });
        }

        return true;
      }

      if (isFunction(router?.go)) {
        const result =
          router.go(
            target,
            {
              replaceState,
              force,
            }
          );

        if (
          result &&
          isFunction(result.catch)
        ) {
          result.catch((error) => {
            safeWarn(
              "Router.go falló.",
              error
            );
          });
        }

        return true;
      }
    } catch (error) {
      safeWarn(
        "navigate router falló; fallback window.location.",
        error
      );
    }
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
   AUTH STATE
========================================================= */

function getCurrentToken() {
  return (
    AppCore?.state?.token ||
    AppCore?.state?.accessToken ||
    AppCore?.state?.session?.token ||
    AppCore?.state?.session?.accessToken ||
    null
  );
}

function getCurrentUser() {
  return (
    AppCore?.state?.user ||
    AppCore?.state?.currentUser ||
    AppCore?.state?.sessionUser ||
    AppCore?.state?.authUser ||
    AppCore?.state?.session?.user ||
    null
  );
}

function hasUsableUser(user = null) {
  if (!isObject(user)) {
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

function isUserActive(user = null) {
  if (!isObject(user)) {
    return false;
  }

  return !(
    user.active === false ||
    user.enabled === false ||
    user.disabled === true ||
    user.is_active === false ||
    user.isActive === false ||
    user.blocked === true ||
    user.locked === true ||
    user.deleted === true ||
    user.archived === true ||
    user.status === "disabled" ||
    user.status === "blocked" ||
    user.status === "deleted" ||
    user.estado === "disabled" ||
    user.estado === "bloqueado" ||
    user.estado === "eliminado"
  );
}

function syncAuthState() {
  const token =
    getCurrentToken();

  const user =
    getCurrentUser();

  const authenticated =
    Boolean(
      hasValidToken(token) &&
        hasUsableUser(user) &&
        isUserActive(user)
    );

  const roles =
    authenticated
      ? getUserRoles(user)
      : [];

  const role =
    authenticated
      ? resolveCanonicalRole(roles)
      : "";

  safeSetState({
    authenticated,
    hasToken:
      Boolean(hasValidToken(token)),

    user:
      authenticated
        ? user
        : null,

    currentUser:
      authenticated
        ? user
        : null,

    authUser:
      authenticated
        ? user
        : null,

    sessionUser:
      authenticated
        ? user
        : null,

    role:
      role || "",

    userRole:
      role || "",

    roles:
      authenticated
        ? roles
        : [],

    isAdmin:
      authenticated &&
      roles.some(isAdminRole),

    isSupport:
      authenticated &&
      roles.some(isSupportRole),

    isManager:
      authenticated &&
      roles.some(isManagerRole),
  });

  return authenticated;
}

export function isAuthenticated() {
  return Boolean(
    syncAuthState()
  );
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(value = "") {
  const raw =
    safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "")
      .trim();

  return ROLE_ALIASES[raw] || raw;
}

function splitRoleValue(value) {
  if (Array.isArray(value)) {
    return value.flatMap(splitRoleValue);
  }

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return [];
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s|]+/g)
      .map(normalizeRole)
      .filter(Boolean);
  }

  return [
    normalizeRole(value),
  ].filter(Boolean);
}

function isAdminRole(value = "") {
  const role =
    normalizeRole(value);

  return (
    role === "admin" ||
    ADMIN_ROLE_KEYS.map(normalizeRole).includes(role)
  );
}

function isSupportRole(value = "") {
  const role =
    normalizeRole(value);

  return (
    role === "support" ||
    SUPPORT_ROLE_KEYS.map(normalizeRole).includes(role)
  );
}

function isManagerRole(value = "") {
  const role =
    normalizeRole(value);

  return (
    role === "manager" ||
    MANAGER_ROLE_KEYS.map(normalizeRole).includes(role)
  );
}

function isClientRole(value = "") {
  const role =
    normalizeRole(value);

  return (
    role === "client" ||
    CLIENT_ROLE_KEYS.map(normalizeRole).includes(role)
  );
}

function isUserRole(value = "") {
  const role =
    normalizeRole(value);

  return (
    role === "user" ||
    USER_ROLE_KEYS.map(normalizeRole).includes(role)
  );
}

function expandRoleAliases(roles = []) {
  const normalized =
    unique(
      safeArray(roles)
        .flat(Infinity)
        .flatMap(splitRoleValue)
        .map(normalizeRole)
        .filter(Boolean)
    );

  const result =
    new Set(normalized);

  if (normalized.some(isAdminRole)) {
    result.add("admin");

    ADMIN_ROLE_KEYS.forEach((role) =>
      result.add(normalizeRole(role))
    );
  }

  if (normalized.some(isSupportRole)) {
    result.add("support");

    SUPPORT_ROLE_KEYS.forEach((role) =>
      result.add(normalizeRole(role))
    );
  }

  if (normalized.some(isManagerRole)) {
    result.add("manager");

    MANAGER_ROLE_KEYS.forEach((role) =>
      result.add(normalizeRole(role))
    );
  }

  if (normalized.some(isClientRole)) {
    result.add("client");

    CLIENT_ROLE_KEYS.forEach((role) =>
      result.add(normalizeRole(role))
    );
  }

  if (normalized.some(isUserRole)) {
    result.add("user");

    USER_ROLE_KEYS.forEach((role) =>
      result.add(normalizeRole(role))
    );
  }

  return unique(
    Array.from(result)
  );
}

function resolveCanonicalRole(roles = []) {
  const expanded =
    expandRoleAliases(roles);

  if (expanded.some(isAdminRole)) {
    return "admin";
  }

  if (expanded.some(isSupportRole)) {
    return "support";
  }

  if (expanded.some(isManagerRole)) {
    return "manager";
  }

  if (expanded.some(isClientRole)) {
    return "client";
  }

  if (expanded.some(isUserRole)) {
    return "user";
  }

  return expanded[0] || "";
}

function collectRoleCandidatesFromUser(user = null) {
  const source =
    safeObject(user);

  const raw =
    safeObject(source.raw);

  const profile =
    safeObject(source.profile);

  const account =
    safeObject(source.account);

  const permissions =
    safeObject(source.permissions);

  const meta =
    safeObject(source.meta);

  const claims =
    safeObject(source.claims);

  const state =
    AppCore?.state || {};

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
    profile.type,
    profile.perfil,

    account.role,
    account.rol,
    account.userRole,
    account.user_role,
    account.type,

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw.type,
    raw.userType,
    raw.user_type,
    raw.perfil,

    raw?.profile?.role,
    raw?.profile?.rol,
    raw?.profile?.userRole,
    raw?.profile?.user_role,
    raw?.profile?.type,
    raw?.profile?.perfil,

    raw?.account?.role,
    raw?.account?.rol,
    raw?.account?.userRole,
    raw?.account?.type,

    meta.role,
    meta.rol,
    meta.userRole,
    meta.user_role,

    claims.role,
    claims.rol,
    claims.userRole,
    claims.user_role,
    claims["custom:role"],
    claims["https://onion/role"],

    state.role,
    state.rol,
    state.userRole,
    state.user_role,
    state.session?.role,
    state.session?.rol,
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
    account.scopes,

    raw.roles,
    raw.roleList,
    raw.role_list,
    raw.groups,
    raw.authorities,
    raw.scopes,

    raw?.profile?.roles,
    raw?.profile?.groups,
    raw?.profile?.scopes,

    raw?.account?.roles,
    raw?.account?.groups,
    raw?.account?.scopes,

    permissions.roles,
    permissions.scopes,
    permissions.items,
    permissions.list,

    meta.roles,
    meta.groups,
    meta.scopes,

    claims.roles,
    claims.groups,
    claims.scopes,

    state.roles,
    state.session?.roles,
  ];

  const adminFlag =
    [
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
      profile.canManageUsers,
      profile.canAccessUsers,

      account.isAdmin,
      account.admin,
      account.isSuperAdmin,
      account.superAdmin,

      raw.isAdmin,
      raw.admin,
      raw.is_admin,
      raw.isSuperAdmin,
      raw.superAdmin,
      raw.is_super_admin,
      raw.canManageUsers,
      raw.can_manage_users,
      raw.canAccessUsers,
      raw.can_access_users,

      meta.isAdmin,
      meta.admin,
      meta.isSuperAdmin,
      meta.superAdmin,
      meta.canManageUsers,
      meta.canAccessUsers,

      claims.isAdmin,
      claims.admin,
      claims.isSuperAdmin,
      claims.superAdmin,
      claims.canManageUsers,
      claims.canAccessUsers,

      state.isAdmin,
      state.session?.isAdmin,
    ].some((value) =>
      value === true ||
      value === "true" ||
      value === 1
    );

  if (adminFlag) {
    candidates.push("admin");
  }

  return [
    ...candidates,
    ...arrays.flatMap((value) =>
      safeArray(value)
    ),
  ];
}

function getUserRoles(user = null) {
  return expandRoleAliases(
    collectRoleCandidatesFromUser(user)
  );
}

export function getCurrentRole() {
  const user =
    getCurrentUser();

  const roles =
    getUserRoles(user);

  return resolveCanonicalRole(roles);
}

export function getCurrentRoles() {
  return getUserRoles(
    getCurrentUser()
  );
}

export function hasRole(...roles) {
  const requiredRoles =
    expandRoleAliases(
      roles
        .flat(Infinity)
        .flatMap(splitRoleValue)
    );

  if (!requiredRoles.length) {
    return true;
  }

  const currentRoles =
    new Set(
      expandRoleAliases(
        getCurrentRoles()
      )
    );

  if (!currentRoles.size) {
    return false;
  }

  return requiredRoles.some((role) =>
    currentRoles.has(role)
  );
}

export function requireRole(...roles) {
  return (
    isAuthenticated() &&
    hasRole(...roles)
  );
}

export function getAuthHeader() {
  const token =
    getCurrentToken();

  if (!hasValidToken(token)) {
    return {};
  }

  return {
    Authorization:
      `Bearer ${String(token).trim()}`,
  };
}

/* =========================================================
   GUARD PAYLOADS
========================================================= */

function buildBlockedPayload({
  reason,
  path,
  redirectTo,
  extra = {},
} = {}) {
  return {
    version:
      GUARDS_VERSION,

    reason:
      safeText(reason, "blocked"),

    path:
      path || getCurrentPath(),

    publicPath:
      getCurrentPublicPathSafe(),

    redirectTo:
      redirectTo || "",

    authenticated:
      Boolean(AppCore?.state?.authenticated),

    hasToken:
      Boolean(hasValidToken(getCurrentToken())),

    hasUser:
      Boolean(hasUsableUser(getCurrentUser())),

    userActive:
      Boolean(isUserActive(getCurrentUser())),

    currentRole:
      getCurrentRole() || null,

    currentRoles:
      getCurrentRoles(),

    ...extra,
  };
}

function buildAllowedPayload({
  reason,
  path,
  extra = {},
} = {}) {
  return {
    version:
      GUARDS_VERSION,

    reason:
      safeText(reason, "allowed"),

    path:
      path || getCurrentPath(),

    publicPath:
      getCurrentPublicPathSafe(),

    authenticated:
      Boolean(AppCore?.state?.authenticated),

    currentRole:
      getCurrentRole() || null,

    currentRoles:
      getCurrentRoles(),

    ...extra,
  };
}

/* =========================================================
   ROUTE GUARDS
========================================================= */

export function guardAuthenticated(options = {}) {
  const {
    path = "",
    redirectTo = LOGIN_PATH,
    withRedirectBack = true,
    autoNavigate = false,
    hardRedirect = false,
    allowPublicTechnicalRoutes = true,
    emitEvents = true,
  } = safeObject(options);

  const currentPath =
    normalizeCanonicalPathSafe(
      path || getCurrentPath()
    );

  const currentPublicPath =
    getCurrentPublicPathSafe();

  if (
    allowPublicTechnicalRoutes &&
    (
      isPublicTechnicalPath(currentPath) ||
      isPublicTechnicalPath(currentPublicPath)
    )
  ) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "public-technical-route",
          path:
            currentPath,
        })
      );
    }

    return true;
  }

  if (isAuthenticated()) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "authenticated",
          path:
            currentPath,
        })
      );
    }

    return true;
  }

  const finalRedirect =
    withRedirectBack
      ? buildLoginRedirect(
          currentPublicPath || currentPath,
          redirectTo
        )
      : normalizeRedirectPath(
          redirectTo,
          LOGIN_PATH
        );

  const payload =
    buildBlockedPayload({
      reason:
        "not-authenticated",
      path:
        currentPath,
      redirectTo:
        finalRedirect,
    });

  if (emitEvents !== false) {
    safeEmit(
      "auth:guard:blocked",
      payload
    );
  }

  if (
    autoNavigate ||
    hardRedirect
  ) {
    navigateTo(
      finalRedirect,
      {
        replaceState:
          true,
        force:
          true,
        hardRedirect:
          Boolean(hardRedirect),
        reason:
          "not-authenticated",
      }
    );
  }

  return false;
}

export function guardRole(roles = [], options = {}) {
  const roleList =
    safeArray(roles)
      .flat(Infinity);

  const {
    path = "",
    redirectTo = DEFAULT_FORBIDDEN_PATH,
    fallbackRedirectTo = DEFAULT_HOME_PATH,
    loginRedirectTo = LOGIN_PATH,
    autoNavigate = false,
    hardRedirect = false,
    allowPublicTechnicalRoutes = true,
    emitEvents = true,
  } = safeObject(options);

  const currentPath =
    normalizeCanonicalPathSafe(
      path || getCurrentPath()
    );

  const currentPublicPath =
    getCurrentPublicPathSafe();

  if (
    allowPublicTechnicalRoutes &&
    (
      isPublicTechnicalPath(currentPath) ||
      isPublicTechnicalPath(currentPublicPath)
    )
  ) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "public-technical-route",
          path:
            currentPath,
        })
      );
    }

    return true;
  }

  if (!isAuthenticated()) {
    const loginRedirect =
      buildLoginRedirect(
        currentPublicPath || currentPath,
        loginRedirectTo
      );

    const payload =
      buildBlockedPayload({
        reason:
          "not-authenticated",
        path:
          currentPath,
        redirectTo:
          loginRedirect,
        extra: {
          requiredRoles:
            expandRoleAliases(roleList),
        },
      });

    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:blocked",
        payload
      );
    }

    if (autoNavigate || hardRedirect) {
      navigateTo(
        loginRedirect,
        {
          replaceState:
            true,
          force:
            true,
          hardRedirect:
            Boolean(hardRedirect),
          reason:
            "role:not-authenticated",
        }
      );
    }

    return false;
  }

  if (hasRole(...roleList)) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "role-match",
          path:
            currentPath,
          extra: {
            requiredRoles:
              expandRoleAliases(roleList),
          },
        })
      );
    }

    return true;
  }

  const finalRedirect =
    normalizeRedirectPath(
      redirectTo,
      fallbackRedirectTo
    );

  const payload =
    buildBlockedPayload({
      reason:
        "insufficient-role",
      path:
        currentPath,
      redirectTo:
        finalRedirect,
      extra: {
        requiredRoles:
          expandRoleAliases(roleList),
      },
    });

  if (emitEvents !== false) {
    safeEmit(
      "auth:guard:blocked",
      payload
    );
  }

  if (autoNavigate || hardRedirect) {
    navigateTo(
      finalRedirect,
      {
        replaceState:
          true,
        force:
          true,
          hardRedirect:
            Boolean(hardRedirect),
          reason:
            "insufficient-role",
      }
    );
  }

  return false;
}

export function guardGuest(options = {}) {
  const {
    redirectTo = DEFAULT_HOME_PATH,
    autoNavigate = false,
    hardRedirect = false,
    emitEvents = true,
  } = safeObject(options);

  const currentPath =
    getCurrentPath();

  if (!isAuthenticated()) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "guest",
          path:
            currentPath,
        })
      );
    }

    return true;
  }

  const finalRedirect =
    normalizeRedirectPath(
      redirectTo,
      DEFAULT_HOME_PATH
    );

  if (emitEvents !== false) {
    safeEmit(
      "auth:guard:blocked",
      buildBlockedPayload({
        reason:
          "already-authenticated",
        path:
          currentPath,
        redirectTo:
          finalRedirect,
      })
    );
  }

  if (autoNavigate || hardRedirect) {
    navigateTo(
      finalRedirect,
      {
        replaceState:
          true,
        force:
          true,
        hardRedirect:
          Boolean(hardRedirect),
        reason:
          "already-authenticated",
      }
    );
  }

  return false;
}

export function canAccessRoute({
  path = "",
  roles = [],
  requireAuth = true,
  allowPublicTechnicalRoutes = true,
} = {}) {
  const currentPath =
    normalizeCanonicalPathSafe(
      path || getCurrentPath()
    );

  if (
    allowPublicTechnicalRoutes &&
    isPublicTechnicalPath(currentPath)
  ) {
    return true;
  }

  if (
    requireAuth !== false &&
    !isAuthenticated()
  ) {
    return false;
  }

  const roleList =
    safeArray(roles)
      .flat(Infinity)
      .filter(Boolean);

  if (!roleList.length) {
    return true;
  }

  return hasRole(...roleList);
}

/* =========================================================
   ERROR HELPER
========================================================= */

export function buildGuardErrorPayload(error) {
  const message =
    (() => {
      try {
        return extractMessage(error);
      } catch {
        return error?.message || String(error);
      }
    })();

  return {
    message,

    name:
      error?.name || "Error",

    status:
      error?.status || 0,

    code:
      error?.code ||
      error?.data?.code ||
      null,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getAuthGuardsSnapshot() {
  const currentPath =
    getCurrentPath();

  const currentPublicPath =
    getCurrentPublicPathSafe();

  const user =
    getCurrentUser();

  const token =
    getCurrentToken();

  syncAuthState();

  return {
    version:
      GUARDS_VERSION,

    authenticated:
      Boolean(AppCore?.state?.authenticated),

    hasToken:
      Boolean(hasValidToken(token)),

    hasUser:
      Boolean(hasUsableUser(user)),

    userActive:
      Boolean(isUserActive(user)),

    currentRole:
      getCurrentRole() || null,

    currentRoles:
      getCurrentRoles(),

    isAdmin:
      getCurrentRoles().some(isAdminRole),

    isSupport:
      getCurrentRoles().some(isSupportRole),

    isManager:
      getCurrentRoles().some(isManagerRole),

    currentPath:
      redactSafe(currentPath),

    currentPublicPath:
      redactSafe(currentPublicPath),

    publicTechnical:
      isPublicTechnicalPath(currentPath) ||
      isPublicTechnicalPath(currentPublicPath),

    hasRouter:
      Boolean(getRouter()),

    routerCapabilities: {
      navigate:
        Boolean(isFunction(getRouter()?.navigate)),

      go:
        Boolean(isFunction(getRouter()?.go)),
    },

    state: {
      route:
        redactSafe(AppCore?.state?.route || ""),

      publicPath:
        redactSafe(AppCore?.state?.publicPath || ""),

      role:
        AppCore?.state?.role || null,

      roles:
        safeClone(AppCore?.state?.roles || [], []),
    },
  };
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  isAuthenticated,

  getCurrentRole,
  getCurrentRoles,
  hasRole,
  requireRole,
  getAuthHeader,

  guardAuthenticated,
  guardRole,
  guardGuest,
  canAccessRoute,

  buildGuardErrorPayload,

  getAuthGuardsSnapshot,
};
