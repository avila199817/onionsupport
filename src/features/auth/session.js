/* =========================================================
   Onion SPA - Auth Session
   Archivo: src/features/auth/session.js

   RESPONSABILIDADES:
   - aplicar sesión autenticada sobre AppCore
   - limpiar sesión local y storage auxiliar
   - exponer helpers auth de estado / rol
   - construir snapshots consistentes
   - exponer Authorization header
   - endurecer sync con AppCore.state
   - evitar estados auth fantasma
   - preservar route/publicPath en rutas públicas técnicas
   - no romper /activate-account?token=... durante restore/clear
   - normalizar roles admin/superadmin/owner/root para guards/sidebar/vistas

   HARDENING EXTREMO:
   - estado derivado robusto
   - persistencia ordenada
   - sync UI seguro
   - helpers enterprise
   - cero estados partidos
   - emisiones sólo cuando cambian datos
   - fingerprint robusto
   - token/user desacoplados sin corrupción
   - clearSessionLocal compatible con preserveRoute
   - AppCore.state.role + AppCore.state.roles coherentes

   FIX 10/10:
   - authenticated sólo puede ser true con token usable + user usable
   - applySession no reutiliza usuario viejo si se pasa user:null
   - applySession no marca sesión válida sólo por token
   - clearSessionLocal limpia token/user/role/session/accessToken
   - clearSessionLocal limpia storage legacy adicional
   - evita avatar/dashboard cacheado tras login fallido
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  extractMessage,
} from "./helpers.js";

import {
  normalizeUser,
} from "./normalize.js";

import {
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
  persistAuxSessionData,
  persistRefreshToken,
  persistTempToken,
  persistSessionContext,
  clearAuthStorage,
} from "./storage.js";

/* =========================================================
   CONSTANTS
========================================================= */

const PUBLIC_TECHNICAL_ROUTES = new Set([
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
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

const LEGACY_AUTH_STORAGE_KEYS = [
  "onion_token",
  "onion_access_token",
  "onion_refresh_token",
  "onion_temp_token",
  "onion_session_id",
  "onion_session_user_id",
  "onion_user_id",
  "onion_user_name",
  "onion_role",

  "auth_token",
  "access_token",
  "refresh_token",
  "token",
  "session",
  "user",
];

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];

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

function nowMs() {
  return Date.now();
}

function safeEmit(eventName, payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );
      emitted = true;
    }
  } catch {}

  return emitted;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[AuthSession]", ...args);
  } catch {}

  try {
    console.warn("[AuthSession]", ...args);
  } catch {}
}

function ensureCoreState() {
  if (!AppCore.state || typeof AppCore.state !== "object") {
    AppCore.state = {};
  }

  return AppCore.state;
}

function safeSetState(patch = {}) {
  try {
    AppCore?.setState?.(patch);
  } catch {}

  try {
    Object.assign(ensureCoreState(), patch);
  } catch {}
}

function hasOwn(obj, key) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(obj, key)
  );
}

/* =========================================================
   USER / TOKEN VALIDATION
========================================================= */

function hasUsableToken(token = "") {
  return Boolean(safeText(token, ""));
}

function hasUsableUser(user = {}) {
  if (!isPlainObject(user)) {
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
    safeText(user.email, "") ||
    safeText(user.phone, "") ||
    safeText(user.telefono, "")
  );
}

function getUserIdentity(user = {}) {
  if (!isPlainObject(user)) {
    return "";
  }

  return (
    safeText(user.userId, "") ||
    safeText(user.user_id, "") ||
    safeText(user.id, "") ||
    safeText(user._id, "") ||
    safeText(user.uid, "") ||
    safeText(user.email, "") ||
    safeText(user.username, "") ||
    safeText(user.userName, "") ||
    safeText(user.phone, "") ||
    safeText(user.telefono, "")
  );
}

/* =========================================================
   ROLE NORMALIZATION
========================================================= */

function normalizeRole(value = "") {
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

function resolveCanonicalRole(roles = []) {
  const expanded = expandRoleAliases(roles);

  if (expanded.some(isAdminRole)) return "admin";
  if (expanded.some(isSupportRole)) return "support";
  if (expanded.some(isManagerRole)) return "manager";

  return expanded[0] || "";
}

function collectRoleCandidatesFromUser(user = null) {
  const current = safeObject(user);
  const raw = safeObject(current.raw);
  const profile = safeObject(current.profile);
  const permissions = safeObject(current.permissions);
  const meta = safeObject(current.meta);
  const claims = safeObject(current.claims);

  const roleCandidates = [
    current.role,
    current.rol,
    current.userRole,
    current.type,
    current.userType,
    current.perfil,

    profile.role,
    profile.rol,
    profile.userRole,
    profile.type,
    profile.perfil,

    raw.role,
    raw.rol,
    raw.userRole,
    raw.type,
    raw.userType,
    raw.perfil,

    raw?.profile?.role,
    raw?.profile?.rol,
    raw?.profile?.userRole,
    raw?.profile?.type,
    raw?.profile?.perfil,

    meta.role,
    meta.rol,
    meta.userRole,

    claims.role,
    claims.rol,
    claims.userRole,
    claims["custom:role"],
    claims["https://onion/role"],
  ];

  const roleArrays = [
    current.roles,
    current.roleList,
    current.permissions,
    current.scopes,
    current.groups,
    current.authorities,

    profile.roles,
    profile.permissions,
    profile.scopes,
    profile.groups,

    raw.roles,
    raw.roleList,
    raw.permissions,
    raw.scopes,
    raw.groups,
    raw.authorities,

    raw?.profile?.roles,
    raw?.profile?.permissions,
    raw?.profile?.scopes,
    raw?.profile?.groups,

    permissions.roles,
    permissions.scopes,
    permissions.items,

    meta.roles,
    meta.permissions,
    meta.scopes,

    claims.roles,
    claims.permissions,
    claims.scopes,
    claims.groups,
  ];

  const roles = [
    ...roleCandidates,
    ...roleArrays.flatMap((value) => toArray(value)),
  ];

  const adminFlag = [
    current.isAdmin,
    current.admin,
    current.isSuperAdmin,
    current.superAdmin,
    current.canManageUsers,
    current.canAccessUsers,

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

    raw?.profile?.isAdmin,
    raw?.profile?.admin,
    raw?.profile?.isSuperAdmin,
    raw?.profile?.superAdmin,
    raw?.profile?.canManageUsers,
    raw?.profile?.canAccessUsers,

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
  ].some((value) => safeBool(value, false));

  if (adminFlag) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function resolveRoleFromUser(user = null, explicitRole = "") {
  const roles = [
    explicitRole,
    ...collectRoleCandidatesFromUser(user),
  ];

  return resolveCanonicalRole(roles);
}

function resolveRolesFromUser(user = null, explicitRole = "") {
  return expandRoleAliases([
    explicitRole,
    ...collectRoleCandidatesFromUser(user),
  ]);
}

/* =========================================================
   PATH / ROUTE PRESERVATION
========================================================= */

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1 && value.endsWith("/")) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function stripSearchAndHash(path = "/") {
  const raw = safeText(path, "/");

  return normalizePathnameOnly(
    raw.split("?")[0].split("#")[0] || "/"
  );
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (hash && (hash.startsWith("#/") || hash.startsWith("#!"))) {
      if (hash.startsWith("#!")) {
        return normalizePathnameOnly(hash.replace(/^#!\/?/, "/"));
      }

      return hash.replace(/^#\/?/, "/");
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function isPublicTechnicalRoute(path = "/") {
  return PUBLIC_TECHNICAL_ROUTES.has(
    stripSearchAndHash(path)
  );
}

function shouldPreserveRoute(options = {}) {
  if (
    options.preserveRoute === true ||
    options.preserveCurrentRoute === true
  ) {
    return true;
  }

  const state = ensureCoreState();

  const publicPath = safeText(
    options.publicPath ||
      state.publicPath ||
      getBrowserPublicPath(),
    ""
  );

  const route = safeText(
    options.route ||
      state.route ||
      stripSearchAndHash(publicPath),
    ""
  );

  return (
    isPublicTechnicalRoute(route) ||
    isPublicTechnicalRoute(publicPath)
  );
}

function captureRouteContext(options = {}) {
  const state = ensureCoreState();

  const browserPath = getBrowserPublicPath();

  const publicPath =
    safeText(options.publicPath, "") ||
    safeText(state.publicPath, "") ||
    browserPath ||
    "/";

  const route =
    safeText(options.route, "") ||
    safeText(state.route, "") ||
    stripSearchAndHash(publicPath) ||
    "/";

  return {
    preserve: shouldPreserveRoute({
      ...options,
      route,
      publicPath,
    }),

    route: stripSearchAndHash(route || publicPath || "/"),
    publicPath: publicPath || route || "/",
    lastRoute: safeText(state.lastRoute, ""),
    browserPath,
  };
}

function restoreRouteContext(context = {}) {
  if (!context?.preserve) {
    return false;
  }

  const route = stripSearchAndHash(
    context.route ||
      context.publicPath ||
      "/"
  );

  const publicPath = safeText(
    context.publicPath,
    route
  );

  try {
    AppCore?.setRoute?.(route);
  } catch {}

  try {
    AppCore?.setPublicPath?.(publicPath);
  } catch {}

  safeSetState({
    route,
    publicPath,
    lastRoute: context.lastRoute || route,
  });

  return true;
}

/* =========================================================
   AUTH STATE
========================================================= */

function resolveAuthenticated(state) {
  const token = safeText(
    first(
      state?.token,
      state?.accessToken,
      state?.session?.token,
      state?.session?.accessToken
    ),
    ""
  );

  const user =
    state?.user ||
    state?.session?.user ||
    null;

  /*
    Regla dura:
    token sin usuario NO es sesión autenticada.
    Esto evita avatar/dashboard fantasma.
  */
  return (
    hasUsableToken(token) &&
    hasUsableUser(user)
  );
}

function buildDerivedAuthState(state = ensureCoreState()) {
  const user =
    state.user ||
    state?.session?.user ||
    null;

  const authenticated = resolveAuthenticated(state);

  const explicitRole =
    state.role ||
    state?.session?.role ||
    "";

  const roles = authenticated
    ? resolveRolesFromUser(user, explicitRole)
    : [];

  const role = authenticated
    ? resolveCanonicalRole(roles)
    : "";

  return {
    authenticated,
    role,
    roles,
    isAdmin: roles.some(isAdminRole),
    isSupport: roles.some(isSupportRole),
    isManager: roles.some(isManagerRole),
  };
}

function syncDerivedState() {
  const state = ensureCoreState();
  const derived = buildDerivedAuthState(state);

  state.authenticated = derived.authenticated;
  state.role = derived.role;
  state.roles = derived.roles;

  state.isAdmin = derived.isAdmin;
  state.isSupport = derived.isSupport;
  state.isManager = derived.isManager;

  if (!derived.authenticated) {
    state.role = "";
    state.roles = [];
    state.isAdmin = false;
    state.isSupport = false;
    state.isManager = false;
  }

  return state;
}

function safeSyncUserUI() {
  try {
    AppCore?.syncUserUI?.();
  } catch {}
}

function safeSetToken(token = null) {
  const cleanToken = safeText(token, "") || null;

  if (typeof AppCore?.setToken === "function") {
    try {
      AppCore.setToken(cleanToken);
    } catch {}
  }

  safeSetState({
    token: cleanToken,
    accessToken: cleanToken,
  });
}

function safeSetUser(user = null) {
  const finalUser = user || null;

  if (typeof AppCore?.setUser === "function") {
    try {
      AppCore.setUser(finalUser);
    } catch {}
  }

  safeSetState({
    user: finalUser,
  });
}

function resolveThemeFromUser(user = null) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const explicitTheme = String(
    user.theme ??
      user?.preferences?.theme ??
      user?.settings?.theme ??
      user?.raw?.theme ??
      user?.raw?.preferences?.theme ??
      user?.raw?.settings?.theme ??
      ""
  )
    .trim()
    .toLowerCase();

  if (explicitTheme === "light" || explicitTheme === "dark") {
    return explicitTheme;
  }

  const hasExplicitDarkMode =
    hasOwn(user, "darkMode") ||
    hasOwn(user, "dark_mode") ||
    hasOwn(user?.raw, "darkMode") ||
    hasOwn(user?.raw, "dark_mode") ||
    hasOwn(user?.preferences, "darkMode") ||
    hasOwn(user?.settings, "darkMode") ||
    hasOwn(user?.raw?.preferences, "darkMode") ||
    hasOwn(user?.raw?.settings, "darkMode");

  if (hasExplicitDarkMode && typeof user.darkMode === "boolean") {
    return user.darkMode ? "dark" : "light";
  }

  return null;
}

function applyThemeFromUser(user = null) {
  const theme = resolveThemeFromUser(user);

  if (theme !== "light" && theme !== "dark") {
    return null;
  }

  try {
    AppCore?.setTheme?.(theme);
  } catch {}

  return theme;
}

function clearLegacyAuthStorage() {
  if (!isBrowser()) {
    return;
  }

  LEGACY_AUTH_STORAGE_KEYS.forEach((key) => {
    try {
      window.localStorage?.removeItem?.(key);
    } catch {}

    try {
      window.sessionStorage?.removeItem?.(key);
    } catch {}
  });
}

function clearAuthStatePatch() {
  return {
    token: null,
    accessToken: null,
    user: null,
    role: "",
    roles: [],
    authenticated: false,
    isAdmin: false,
    isSupport: false,
    isManager: false,
    session: null,
    sessionId: null,
    sessionUserId: null,
  };
}

function safeClearSession(context = {}) {
  if (typeof AppCore?.clearSession === "function") {
    try {
      AppCore.clearSession();
      restoreRouteContext(context);
      safeSetState(clearAuthStatePatch());
      return;
    } catch (error) {
      safeWarn("AppCore.clearSession() falló.", error);
    }
  }

  safeSetState(clearAuthStatePatch());

  restoreRouteContext(context);
}

function getCurrentStateSnapshotBase() {
  const state = ensureCoreState();

  syncDerivedState();

  return {
    authenticated: Boolean(state.authenticated),

    token: state.token || state.accessToken || null,
    accessToken: state.accessToken || state.token || null,

    user: state.user || state?.session?.user || null,

    role: state.role || null,
    roles: safeArray(state.roles),

    isAdmin: Boolean(state.isAdmin),
    isSupport: Boolean(state.isSupport),
    isManager: Boolean(state.isManager),

    route: state.route || "/",
    publicPath: state.publicPath || "/",
  };
}

/* =========================================================
   FINGERPRINT
========================================================= */

function buildSessionFingerprint(snapshot = {}) {
  const user = snapshot?.user || {};

  return JSON.stringify({
    authenticated: Boolean(snapshot.authenticated),

    token: safeText(snapshot.token),
    role: safeText(snapshot.role),
    roles: safeArray(snapshot.roles).join("|"),

    isAdmin: Boolean(snapshot.isAdmin),

    refreshToken: safeText(snapshot.refreshToken),
    sessionId: safeText(snapshot.sessionId),
    sessionUserId: safeText(snapshot.sessionUserId),

    userId:
      user.id ||
      user.userId ||
      user.user_id ||
      user._id ||
      user.uid ||
      null,

    username:
      user.username ||
      user.userName ||
      user.email ||
      user.phone ||
      null,
  });
}

function emitSessionState({
  reason = "unknown",
  before = null,
  after = null,
  durationMs = 0,
} = {}) {
  safeEmit("auth:session:state", {
    reason,
    before,
    after,
    changed:
      buildSessionFingerprint(before) !==
      buildSessionFingerprint(after),
    durationMs,
    timestamp: nowMs(),
    at: new Date().toISOString(),
  });
}

function emitSessionAppliedEvents(after = {}, before = null) {
  const changed =
    !before ||
    buildSessionFingerprint(before) !==
      buildSessionFingerprint(after);

  safeEmit("auth:session:applied", after);
  safeEmit("auth:session:restored", after);
  safeEmit("app:session:restored", after);
  safeEmit("app:session:change", after);
  safeEmit("app:auth:change", after);
  safeEmit("auth:change", after);

  if (changed) {
    safeEmit("app:user:change", after);
    safeEmit("app:user:updated", after);
    safeEmit("app:user-ui:sync", after);
  }
}

function emitSessionClearedEvents(after = {}) {
  safeEmit("auth:session:cleared", after);
  safeEmit("app:session:cleared", after);
  safeEmit("app:session:change", after);
  safeEmit("app:auth:change", after);
  safeEmit("auth:change", after);
  safeEmit("app:user:change", after);
  safeEmit("app:user-ui:sync", after);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function buildSessionSnapshot(extra = {}) {
  const base = getCurrentStateSnapshotBase();

  return {
    ...base,

    refreshToken: getStoredRefreshToken() || null,
    sessionId: getStoredSessionId() || null,
    sessionUserId: getStoredSessionUserId() || null,

    ...extra,
  };
}

/* =========================================================
   APPLY SESSION
========================================================= */

export function applySession({
  token = undefined,
  accessToken = undefined,
  user = undefined,
  role = undefined,
  refreshToken = undefined,
  tempToken = undefined,
  sessionData = undefined,
  authenticated = undefined,
} = {}) {
  const startedAt = nowMs();
  const before = buildSessionSnapshot();

  const state = ensureCoreState();

  const incomingToken =
    token !== undefined
      ? token
      : accessToken !== undefined
        ? accessToken
        : undefined;

  const normalizedUser =
    user === undefined
      ? undefined
      : user
        ? normalizeUser(user)
        : null;

  /*
    Si llega token explícito, se actualiza.
    Si llega user explícito null, se elimina.
    Si llega token sin user, sólo se conserva el user actual si es usable.
  */
  if (incomingToken !== undefined) {
    safeSetToken(incomingToken || null);
  }

  if (user !== undefined) {
    safeSetUser(normalizedUser || null);
  }

  const currentStateAfterBasePatch =
    ensureCoreState();

  const effectiveToken =
    safeText(
      first(
        incomingToken,
        currentStateAfterBasePatch.token,
        currentStateAfterBasePatch.accessToken,
        currentStateAfterBasePatch.session?.token,
        currentStateAfterBasePatch.session?.accessToken
      ),
      ""
    );

  const effectiveUser =
    normalizedUser !== undefined
      ? normalizedUser
      : (
          hasUsableUser(currentStateAfterBasePatch.user)
            ? currentStateAfterBasePatch.user
            : hasUsableUser(currentStateAfterBasePatch.session?.user)
              ? currentStateAfterBasePatch.session.user
              : null
        );

  const usableToken =
    hasUsableToken(effectiveToken);

  const usableUser =
    hasUsableUser(effectiveUser);

  const nextAuthenticated =
    authenticated === false
      ? false
      : usableToken && usableUser;

  const explicitRole =
    safeText(role, "");

  const nextRoles =
    nextAuthenticated
      ? resolveRolesFromUser(effectiveUser, explicitRole)
      : [];

  const nextRole =
    nextAuthenticated
      ? resolveCanonicalRole(nextRoles)
      : "";

  if (refreshToken !== undefined) {
    persistRefreshToken(refreshToken || null);
  }

  if (tempToken !== undefined) {
    persistTempToken(tempToken || null);
  }

  if (sessionData !== undefined) {
    persistSessionContext(
      sessionData || null,
      effectiveUser
    );
  }

  if (nextAuthenticated) {
    persistAuxSessionData(effectiveUser);
    applyThemeFromUser(effectiveUser);
  }

  safeSetState({
    token: usableToken ? effectiveToken : null,
    accessToken: usableToken ? effectiveToken : null,
    user: usableUser ? effectiveUser : null,

    role: nextRole,
    roles: nextRoles,

    authenticated: nextAuthenticated,

    isAdmin: nextRoles.some(isAdminRole),
    isSupport: nextRoles.some(isSupportRole),
    isManager: nextRoles.some(isManagerRole),

    session: nextAuthenticated
      ? {
          ...(isPlainObject(state.session) ? state.session : {}),
          token: effectiveToken,
          accessToken: effectiveToken,
          refreshToken: refreshToken || getStoredRefreshToken() || "",
          user: effectiveUser,
          role: nextRole,
          roles: nextRoles,
          authenticated: true,
          data: sessionData || state.session?.data || null,
        }
      : null,
  });

  syncDerivedState();

  safeSyncUserUI();

  const after = buildSessionSnapshot();

  emitSessionState({
    reason: "apply",
    before,
    after,
    durationMs: nowMs() - startedAt,
  });

  if (after.authenticated) {
    emitSessionAppliedEvents(after, before);
  } else {
    emitSessionClearedEvents(after);
  }

  return after;
}

/* =========================================================
   CLEAR SESSION LOCAL
========================================================= */

export function clearSessionLocal(options = {}) {
  const {
    silent = false,
  } = options;

  const startedAt = nowMs();

  const routeContext = captureRouteContext(options);

  const before = buildSessionSnapshot({
    routeContext,
  });

  const hadData =
    Boolean(before.token) ||
    Boolean(before.user) ||
    Boolean(before.refreshToken) ||
    Boolean(before.sessionId) ||
    Boolean(before.sessionUserId);

  safeClearSession(routeContext);

  try {
    clearAuthStorage();
  } catch (error) {
    safeWarn("clearAuthStorage() falló.", error);
  }

  clearLegacyAuthStorage();

  try {
    persistRefreshToken(null);
  } catch {}

  try {
    persistTempToken(null);
  } catch {}

  try {
    persistSessionContext(null, null);
  } catch {}

  safeSetState(clearAuthStatePatch());

  restoreRouteContext(routeContext);

  syncDerivedState();

  safeSyncUserUI();

  const after = buildSessionSnapshot({
    routeContext,
  });

  if (!safeBool(silent, false) && hadData) {
    emitSessionClearedEvents(after);
  }

  emitSessionState({
    reason: safeBool(silent, false) ? "clear:silent" : "clear",
    before,
    after,
    durationMs: nowMs() - startedAt,
  });

  return true;
}

/* =========================================================
   HELPERS AUTH
========================================================= */

export function isAuthenticated() {
  const state = ensureCoreState();

  syncDerivedState();

  return Boolean(
    state.authenticated &&
      hasUsableToken(first(state.token, state.accessToken)) &&
      hasUsableUser(state.user || state.session?.user)
  );
}

export function getCurrentRole() {
  syncDerivedState();

  return safeText(ensureCoreState().role).toLowerCase();
}

export function getCurrentRoles() {
  syncDerivedState();

  return safeArray(ensureCoreState().roles);
}

export function isCurrentUserAdmin() {
  syncDerivedState();

  return Boolean(ensureCoreState().isAdmin);
}

export function hasRole(...roles) {
  if (!roles.length) {
    return true;
  }

  const allowedRoles = expandRoleAliases(roles.flat());
  if (!allowedRoles.length) {
    return true;
  }

  const currentRoles = new Set(
    expandRoleAliases(getCurrentRoles())
  );

  return allowedRoles.some((role) => currentRoles.has(role));
}

export function requireRole(...roles) {
  return (
    isAuthenticated() &&
    hasRole(...roles)
  );
}

/* =========================================================
   AUTH HEADER
========================================================= */

export function getAuthHeader() {
  if (!isAuthenticated()) {
    return {};
  }

  const token = safeText(
    first(
      ensureCoreState().token,
      ensureCoreState().accessToken
    )
  );

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionDebugSnapshot() {
  const snapshot = buildSessionSnapshot();

  return {
    authenticated: Boolean(snapshot.authenticated),

    role: snapshot.role || null,
    roles: safeArray(snapshot.roles),

    isAdmin: Boolean(snapshot.isAdmin),
    isSupport: Boolean(snapshot.isSupport),
    isManager: Boolean(snapshot.isManager),

    username:
      snapshot.user?.username ||
      snapshot.user?.userName ||
      snapshot.user?.email ||
      snapshot.user?.name ||
      snapshot.user?.nombre ||
      snapshot.user?.phone ||
      null,

    userIdentity:
      getUserIdentity(snapshot.user),

    hasToken: Boolean(snapshot.token),
    hasUser: hasUsableUser(snapshot.user),
    hasRefreshToken: Boolean(snapshot.refreshToken),

    sessionId: snapshot.sessionId || null,
    sessionUserId: snapshot.sessionUserId || null,

    route: snapshot.route || "/",
    publicPath: snapshot.publicPath || "/",

    isPublicTechnicalRoute: isPublicTechnicalRoute(
      snapshot.route ||
        snapshot.publicPath ||
        "/"
    ),

    rawUserRoleCandidates: collectRoleCandidatesFromUser(snapshot.user),
  };
}

export function buildAuthErrorPayload(error) {
  return {
    error,
    message: extractMessage(error),
  };
}

export default {
  applySession,
  clearSessionLocal,
  buildSessionSnapshot,

  isAuthenticated,
  getCurrentRole,
  getCurrentRoles,
  isCurrentUserAdmin,
  hasRole,
  requireRole,

  getAuthHeader,
  getSessionDebugSnapshot,
  buildAuthErrorPayload,
};
