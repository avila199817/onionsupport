/* =========================================================
   Onion SPA - Auth Session
   Archivo: src/features/auth/session.js

   AUTH SESSION · EXTREME PRO SYSTEM · GOD MODE v11
   TOKEN + USER STRICT · SESSION CONTEXT LOCKED

   RESPONSABILIDADES:
   - aplicar sesión autenticada sobre AppCore
   - limpiar sesión local, storage core, storage auxiliar y legacy
   - exponer helpers auth de estado / rol / permisos
   - construir snapshots consistentes para restore/debug
   - exponer Authorization header sin exigir user cargado
   - endurecer sync con AppCore.state
   - evitar estados auth fantasma
   - preservar route/publicPath en rutas públicas técnicas
   - no romper /activate-account?token=...
   - no romper /activate-account/<token>
   - no romper /reset-password/confirm?token=...
   - no romper /reset-password/confirm/<token>
   - normalizar roles admin/superadmin/owner/root/support/manager/client
   - no emitir eventos restore desde login
   - normalizar contrato backend Onion Auth v6:
       · token / accessToken / access_token
       · refreshToken / refresh_token
       · session / sessionData
       · sessionId / session_id
       · userId / user_id
       · user / usuario / me / account / profile
       · data / auth
   - mantener session y sessionData como alias controlados al MISMO contexto canónico
   - evitar duplicidades raras de estado
   - preservar avatar/preferencias/idioma/tema del usuario

   HARDENING EXTREMO:
   - authenticated sólo true con token usable + user usable
   - token/user desacoplados sin corrupción
   - token explícito sin user explícito NO reutiliza usuario viejo por defecto
   - clearSessionLocal limpia token/user/role/session/accessToken/currentUser
   - clearSessionLocal limpia storage legacy adicional
   - preservación fuerte de rutas públicas técnicas
   - eventos públicos sin tokens reales
   - sync UI seguro
   - roles alias coherentes
   - snapshots útiles para restore/debug
   - cero throws accidentales en operaciones laterales
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

const AUTH_SESSION_VERSION = "11.0.0-god-mode";

const SESSION_SOURCE = "auth.session";

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const PUBLIC_TECHNICAL_ROUTES = Object.freeze([
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
  "staff",
  "agent",
  "agente",
  "helpdesk",
  "operator",
  "operador",
  "tecnico",
  "technician",
]);

const MANAGER_ROLE_KEYS = new Set([
  "manager",
  "gestor",
  "gerente",
  "lead",
  "team_lead",
  "supervisor",
]);

const CLIENT_ROLE_KEYS = new Set([
  "client",
  "cliente",
  "customer",
  "usuario",
  "user",
]);

const LEGACY_AUTH_STORAGE_KEYS = Object.freeze([
  "onion_token",
  "onion_access_token",
  "onion_refresh_token",
  "onion_temp_token",
  "onion_session_id",
  "onion_session_user_id",
  "onion_user",
  "onion_user_id",
  "onion_user_slug",
  "onion_user_name",
  "onion_role",

  "onion:token",
  "onion:user",
  "onion:accessToken",
  "onion:access_token",
  "onion:refreshToken",
  "onion:refresh_token",
  "onion:tempToken",
  "onion:temp_token",
  "onion:sessionId",
  "onion:session_id",
  "onion:sessionUserId",
  "onion:session_user_id",
  "onion:userId",
  "onion:user_id",
  "onion:userName",
  "onion:user_name",
  "onion:role",
  "onion:session",
  "onion:sessionData",

  "auth_token",
  "access_token",
  "refresh_token",
  "temp_token",
  "temporary_token",
  "two_factor_token",
  "mfa_token",

  "token",
  "session",
  "user",
  "role",
  "refreshToken",
  "tempToken",
  "sessionId",
  "sessionUserId",
]);

const TOKEN_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "authToken",
  "auth_token",
  "jwt",
  "idToken",
  "id_token",
]);

const REFRESH_TOKEN_KEYS = Object.freeze([
  "refreshToken",
  "refresh_token",
]);

const TEMP_TOKEN_KEYS = Object.freeze([
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
]);

const USER_KEYS = Object.freeze([
  "user",
  "usuario",
  "me",
  "account",
  "profile",
]);

const SESSION_KEYS = Object.freeze([
  "session",
  "sessionData",
  "authSession",
  "auth_session",
]);

const SESSION_ID_KEYS = Object.freeze([
  "sessionId",
  "session_id",
  "sid",
  "id",
]);

const SESSION_USER_ID_KEYS = Object.freeze([
  "sessionUserId",
  "session_user_id",
  "userId",
  "user_id",
  "uid",
  "sub",
]);

const SESSION_EXPIRES_KEYS = Object.freeze([
  "expiresAt",
  "expires_at",
  "refreshExpiresAt",
  "refresh_expires_at",
  "expiration",
  "expires",
]);

const ROLE_KEYS = Object.freeze([
  "role",
  "rol",
  "userRole",
  "user_role",
  "type",
  "tipo",
  "userType",
  "user_type",
]);

const ROOT_OBJECT_KEYS = Object.freeze([
  "data",
  "payload",
  "result",
  "body",
  "response",
  "auth",
  "authData",
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
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

  return Boolean(fallback);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return isPlainObject(value) ? value : {};
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

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    )
  );
}

function nowMs() {
  return Date.now();
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function hasOwn(obj, key) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(obj, key)
  );
}

function ensureCoreState() {
  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      return AppCore.state;
    }
  } catch {}

  return {};
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[AuthSession]", ...args);
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn("[AuthSession]", ...args);
    }
  } catch {}
}

function safeSetState(patch = {}, options = {}) {
  const safePatch = isPlainObject(patch) ? patch : {};

  try {
    AppCore?.setState?.(safePatch, options);
  } catch {}

  try {
    Object.assign(ensureCoreState(), safePatch);
  } catch {}

  return ensureCoreState();
}

/* =========================================================
   EVENT HELPERS · TOKEN SAFE
========================================================= */

function buildTokenSafePayload(payload = {}) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const output = {
    ...payload,
  };

  for (const key of [
    ...TOKEN_KEYS,
    ...REFRESH_TOKEN_KEYS,
    ...TEMP_TOKEN_KEYS,
    "password",
    "pass",
  ]) {
    if (key in output) {
      output[key] = null;
    }
  }

  if (output.user && isPlainObject(output.user)) {
    output.user = {
      ...output.user,
    };

    for (const key of [
      "password",
      "passwordHash",
      "password_hash",
      "twofa_secret",
      "twofaSecret",
      "mfa_secret",
      "mfaSecret",
      "reset",
      "activation",
      "refreshToken",
      "refresh_token",
    ]) {
      delete output.user[key];
    }
  }

  return output;
}

function safeEmit(eventName, payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload = buildTokenSafePayload(payload);

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(name, cleanPayload);
      return true;
    }
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

function inferEventMode({
  source = "",
  eventMode = "",
  emitRestoreEvents = undefined,
} = {}) {
  const explicit = safeText(eventMode, "").toLowerCase();

  if (["login", "restore", "apply", "silent", "clear", "refresh"].includes(explicit)) {
    return explicit;
  }

  if (emitRestoreEvents === true) {
    return "restore";
  }

  const key = safeText(source, "").toLowerCase();

  if (key.includes("restore")) {
    return "restore";
  }

  if (key.includes("login")) {
    return "login";
  }

  if (key.includes("refresh")) {
    return "refresh";
  }

  return "apply";
}

/* =========================================================
   PAYLOAD COLLECTION
========================================================= */

function collectPayloadObjects(raw = {}) {
  const output = [];
  const seen = new Set();
  const queue = [raw];
  let guard = 0;

  while (queue.length && guard < 80) {
    guard += 1;

    const current = queue.shift();

    if (!isPlainObject(current) || seen.has(current)) {
      continue;
    }

    seen.add(current);
    output.push(current);

    for (const key of ROOT_OBJECT_KEYS) {
      const nested = current[key];

      if (isPlainObject(nested)) {
        queue.push(nested);
      }
    }

    for (const key of SESSION_KEYS) {
      const nested = current[key];

      if (isPlainObject(nested)) {
        queue.push(nested);
      }
    }

    for (const key of USER_KEYS) {
      const nested = current[key];

      if (isPlainObject(nested)) {
        queue.push(nested);
      }
    }

    if (isPlainObject(current.response?.data)) {
      queue.push(current.response.data);
    }
  }

  return output;
}

function pickValueFromObjects(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (
        object &&
        object[key] !== null &&
        object[key] !== undefined &&
        object[key] !== ""
      ) {
        return object[key];
      }
    }
  }

  return undefined;
}

function pickTextFromObjects(objects = [], keys = []) {
  return safeText(pickValueFromObjects(objects, keys), "");
}

function pickObjectFromObjects(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (isPlainObject(object?.[key])) {
        return object[key];
      }
    }
  }

  return null;
}

/* =========================================================
   USER / TOKEN VALIDATION
========================================================= */

function hasUsableToken(token = "") {
  const value = safeText(token, "");

  if (!value) return false;

  if (
    value === "null" ||
    value === "undefined" ||
    value === "false" ||
    value === "[object Object]"
  ) {
    return false;
  }

  try {
    if (isFunction(AppCore?.utils?.hasValidToken)) {
      return Boolean(AppCore.utils.hasValidToken(value));
    }
  } catch {}

  return true;
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
      safeText(user.user_name, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "") ||
      safeText(user.mobile, "")
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
    safeText(user.mail, "") ||
    safeText(user.username, "") ||
    safeText(user.userName, "") ||
    safeText(user.user_name, "") ||
    safeText(user.phone, "") ||
    safeText(user.telefono, "") ||
    safeText(user.mobile, "")
  );
}

function sanitizeUsernameLocal(value = "") {
  return safeText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function resolveAvatar(user = {}) {
  if (!isPlainObject(user)) {
    return null;
  }

  return (
    safeText(user.avatar, "") ||
    safeText(user.avatarUrl, "") ||
    safeText(user.avatar_url, "") ||
    safeText(user.photo, "") ||
    safeText(user.photoUrl, "") ||
    safeText(user.photo_url, "") ||
    safeText(user.image, "") ||
    safeText(user.imageUrl, "") ||
    safeText(user.image_url, "") ||
    safeText(user.profileImage, "") ||
    safeText(user.profile_image, "") ||
    safeText(user.picture, "") ||
    safeText(user.pictureUrl, "") ||
    safeText(user.picture_url, "") ||
    null
  );
}

function normalizeIncomingUser(user = null) {
  if (!isPlainObject(user)) {
    return null;
  }

  let normalized = null;

  try {
    normalized = normalizeUser(user);
  } catch {
    normalized = null;
  }

  const base =
    hasUsableUser(normalized)
      ? normalized
      : hasUsableUser(user)
        ? user
        : null;

  if (!base) {
    return null;
  }

  const userId = first(
    base.userId,
    base.user_id,
    base.uid,
    base.id,
    base._id
  );

  const username = first(
    base.username,
    base.userName,
    base.user_name,
    base.usernameLower,
    base.username_lower
  );

  const email = first(
    base.email,
    base.mail,
    base.emailLower,
    base.email_lower
  );

  const avatar = resolveAvatar(base);

  const role = first(
    base.role,
    base.rol,
    base.userRole,
    base.user_role,
    base.type,
    base.tipo
  );

  const normalizedUsername =
    safeText(
      base.usernameLower ||
        base.username_lower ||
        sanitizeUsernameLocal(username || ""),
      ""
    ) || null;

  return {
    ...base,

    id:
      base.id ||
      userId ||
      null,

    userId:
      base.userId ||
      userId ||
      null,

    uid:
      base.uid ||
      userId ||
      null,

    username:
      username ||
      null,

    usernameLower:
      normalizedUsername,

    slug:
      base.slug ||
      normalizedUsername ||
      null,

    email:
      email ||
      null,

    emailLower:
      base.emailLower ||
      base.email_lower ||
      (email ? String(email).toLowerCase() : null),

    name:
      base.name ||
      base.nombre ||
      base.displayName ||
      base.fullName ||
      username ||
      email ||
      "Usuario",

    displayName:
      base.displayName ||
      base.fullName ||
      base.name ||
      base.nombre ||
      username ||
      email ||
      "Usuario",

    role:
      role ||
      "user",

    rol:
      role ||
      "user",

    permissions:
      safeArray(base.permissions || base.permisos),

    permisos:
      safeArray(base.permisos || base.permissions),

    avatar,
    avatarUrl: avatar,
    picture: avatar,

    hasAvatar:
      base.hasAvatar === true ||
      base.has_avatar === true ||
      Boolean(avatar),
  };
}

/* =========================================================
   ROLE NORMALIZATION
========================================================= */

function normalizeRole(value = "") {
  if (isPlainObject(value)) {
    return "";
  }

  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function normalizeRoles(value) {
  if (typeof value === "string") {
    return value
      .split(/[,\s|]+/g)
      .map(normalizeRole)
      .filter(Boolean);
  }

  return toArray(value)
    .flat(Infinity)
    .flatMap((item) => {
      if (typeof item === "string") {
        return item.split(/[,\s|]+/g);
      }

      if (
        item === null ||
        item === undefined ||
        isPlainObject(item) ||
        Array.isArray(item)
      ) {
        return [];
      }

      return [item];
    })
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

function isClientRole(value = "") {
  return CLIENT_ROLE_KEYS.has(normalizeRole(value));
}

function expandRoleAliases(roles = []) {
  const normalized = normalizeRoles(roles);
  const result = new Set(normalized);

  if (normalized.some(isAdminRole)) {
    for (const role of ADMIN_ROLE_KEYS) result.add(role);
    result.add("admin");
  }

  if (normalized.some(isSupportRole)) {
    for (const role of SUPPORT_ROLE_KEYS) result.add(role);
    result.add("support");
  }

  if (normalized.some(isManagerRole)) {
    for (const role of MANAGER_ROLE_KEYS) result.add(role);
    result.add("manager");
  }

  if (normalized.some(isClientRole)) {
    for (const role of CLIENT_ROLE_KEYS) result.add(role);
    result.add("client");
  }

  return unique(Array.from(result));
}

function resolveCanonicalRole(roles = []) {
  const expanded = expandRoleAliases(roles);

  if (expanded.some(isAdminRole)) return "admin";
  if (expanded.some(isSupportRole)) return "support";
  if (expanded.some(isManagerRole)) return "manager";
  if (expanded.some(isClientRole)) return "client";

  return expanded[0] || "";
}

function collectRoleCandidatesFromUser(user = null) {
  const current = safeObject(user);
  const raw = safeObject(current.raw);
  const profile = safeObject(current.profile);
  const permissions = safeObject(current.permissions);
  const meta = safeObject(current.meta);
  const claims = safeObject(current.claims);
  const account = safeObject(current.account);

  const roleCandidates = [
    current.role,
    current.rol,
    current.userRole,
    current.user_role,
    current.type,
    current.userType,
    current.user_type,
    current.perfil,

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
  ];

  const roleArrays = [
    current.roles,
    current.roleList,
    current.role_list,
    current.scopes,
    current.groups,
    current.authorities,

    profile.roles,
    profile.scopes,
    profile.groups,
    profile.authorities,

    account.roles,
    account.scopes,
    account.groups,

    raw.roles,
    raw.roleList,
    raw.role_list,
    raw.scopes,
    raw.groups,
    raw.authorities,

    raw?.profile?.roles,
    raw?.profile?.scopes,
    raw?.profile?.groups,

    raw?.account?.roles,
    raw?.account?.scopes,

    permissions.roles,
    permissions.scopes,
    permissions.items,
    permissions.list,

    meta.roles,
    meta.scopes,
    meta.groups,

    claims.roles,
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
    current.is_admin,
    current.isSuperAdmin,
    current.superAdmin,
    current.is_super_admin,
    current.canManageUsers,
    current.can_manage_users,
    current.canAccessUsers,
    current.can_access_users,

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

    raw?.profile?.isAdmin,
    raw?.profile?.admin,
    raw?.profile?.isSuperAdmin,
    raw?.profile?.superAdmin,
    raw?.profile?.canManageUsers,
    raw?.profile?.canAccessUsers,

    raw?.account?.isAdmin,
    raw?.account?.admin,
    raw?.account?.isSuperAdmin,
    raw?.account?.superAdmin,

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

function resolveRolesFromUser(user = null, explicitRole = "") {
  return expandRoleAliases([
    explicitRole,
    ...collectRoleCandidatesFromUser(user),
  ]);
}

/* =========================================================
   SESSION CONTEXT NORMALIZATION
========================================================= */

function normalizeSessionContext(sessionInput = null, user = null, fallback = {}) {
  const source = safeObject(sessionInput);
  const fallbackObj = safeObject(fallback);

  const sessionId =
    safeText(
      first(
        ...SESSION_ID_KEYS.map((key) => source[key]),
        fallbackObj.sessionId,
        fallbackObj.session_id,
        fallbackObj.id,
        getStoredSessionId()
      ),
      ""
    );

  const sessionUserId =
    safeText(
      first(
        source.sessionUserId,
        source.session_user_id,
        ...SESSION_USER_ID_KEYS.map((key) => source[key]),
        fallbackObj.sessionUserId,
        fallbackObj.session_user_id,
        fallbackObj.userId,
        fallbackObj.user_id,
        getUserIdentity(user),
        getStoredSessionUserId()
      ),
      ""
    );

  const expiresAt =
    safeText(
      first(
        ...SESSION_EXPIRES_KEYS.map((key) => source[key]),
        fallbackObj.expiresAt,
        fallbackObj.refreshExpiresAt
      ),
      ""
    );

  const hasAny =
    Object.keys(source).length > 0 ||
    Boolean(sessionId || sessionUserId || expiresAt);

  if (!hasAny) {
    return null;
  }

  return {
    ...source,

    id:
      source.id ||
      sessionId ||
      null,

    sessionId:
      source.sessionId ||
      source.session_id ||
      source.sid ||
      sessionId ||
      null,

    session_id:
      source.session_id ||
      source.sessionId ||
      source.sid ||
      sessionId ||
      null,

    userId:
      source.userId ||
      source.user_id ||
      source.uid ||
      sessionUserId ||
      null,

    user_id:
      source.user_id ||
      source.userId ||
      source.uid ||
      sessionUserId ||
      null,

    sessionUserId:
      source.sessionUserId ||
      source.session_user_id ||
      sessionUserId ||
      null,

    session_user_id:
      source.session_user_id ||
      source.sessionUserId ||
      sessionUserId ||
      null,

    expiresAt:
      source.expiresAt ||
      source.expires_at ||
      source.refreshExpiresAt ||
      source.refresh_expires_at ||
      expiresAt ||
      null,

    refreshExpiresAt:
      source.refreshExpiresAt ||
      source.refresh_expires_at ||
      source.expiresAt ||
      source.expires_at ||
      expiresAt ||
      null,
  };
}

function extractSessionInput(payload = {}) {
  const objects = collectPayloadObjects(payload);

  const token =
    pickTextFromObjects(objects, TOKEN_KEYS);

  const refreshToken =
    pickTextFromObjects(objects, REFRESH_TOKEN_KEYS);

  const tempToken =
    pickTextFromObjects(objects, TEMP_TOKEN_KEYS);

  const userRaw =
    pickObjectFromObjects(objects, USER_KEYS);

  const user =
    normalizeIncomingUser(userRaw);

  const role =
    pickTextFromObjects(objects, ROLE_KEYS);

  const sessionRaw =
    pickObjectFromObjects(objects, SESSION_KEYS);

  const sessionId =
    pickTextFromObjects(objects, SESSION_ID_KEYS);

  const sessionUserId =
    pickTextFromObjects(objects, [
      "sessionUserId",
      "session_user_id",
      "userId",
      "user_id",
      "uid",
    ]);

  const expiresAt =
    pickTextFromObjects(objects, SESSION_EXPIRES_KEYS);

  const fallbackSession = {
    sessionId,
    userId: sessionUserId,
    expiresAt,
  };

  const session =
    normalizeSessionContext(
      sessionRaw,
      user,
      fallbackSession
    );

  return {
    token,
    refreshToken,
    tempToken,
    user,
    role,
    session,
    sessionId:
      session?.sessionId ||
      sessionId ||
      "",
    sessionUserId:
      session?.sessionUserId ||
      session?.userId ||
      sessionUserId ||
      "",
  };
}

/* =========================================================
   PATH / ROUTE PRESERVATION
========================================================= */

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) value = "/";
  if (!value.startsWith("/")) value = `/${value}`;

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

function isHashRouterPath(value = "") {
  const raw = String(value || "").trim();

  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = String(value || "").trim();

  if (!raw) return "/";

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) {
      return normalizeHashRouterPath(hash);
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function isPublicTechnicalRoute(path = "/") {
  const clean = stripSearchAndHash(path);

  return PUBLIC_TECHNICAL_ROUTES.some((candidate) => {
    if (clean === candidate) return true;
    return clean.startsWith(`${candidate}/`);
  });
}

function isProtectedPublicTokenRoute(path = "/") {
  const clean = stripSearchAndHash(path);

  return (
    clean === ACTIVATION_PATH ||
    clean.startsWith(`${ACTIVATION_PATH}/`) ||
    clean === RESET_CONFIRM_PATH ||
    clean.startsWith(`${RESET_CONFIRM_PATH}/`)
  );
}

function shouldPreserveRoute(options = {}) {
  if (
    options.preserveRoute === true ||
    options.preserveCurrentRoute === true ||
    options.publicRoute === true ||
    options.activationBoot === true ||
    options.resetConfirmBoot === true
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
    isPublicTechnicalRoute(publicPath) ||
    isProtectedPublicTokenRoute(route) ||
    isProtectedPublicTokenRoute(publicPath)
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

    activationBoot: Boolean(options.activationBoot),
    resetConfirmBoot: Boolean(options.resetConfirmBoot),
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

  const publicPath = safeText(context.publicPath, route);

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

    bootIsActivation: Boolean(
      context.activationBoot ||
        ensureCoreState().bootIsActivation
    ),

    bootHasActivationToken: Boolean(
      context.activationBoot ||
        ensureCoreState().bootHasActivationToken
    ),

    bootIsResetConfirm: Boolean(
      context.resetConfirmBoot ||
        ensureCoreState().bootIsResetConfirm
    ),

    bootHasResetToken: Boolean(
      context.resetConfirmBoot ||
        ensureCoreState().bootHasResetToken
    ),
  });

  return true;
}

/* =========================================================
   CORE STORAGE
========================================================= */

function getCoreStorageKey(name = "") {
  return safeText(
    AppCore?.config?.storageKeys?.[name],
    name
  );
}

function readCoreStoredToken() {
  const tokenKey = getCoreStorageKey("token");

  try {
    const value = AppCore?.storage?.get?.(tokenKey);
    return hasUsableToken(value) ? safeText(value, "") : "";
  } catch {
    return "";
  }
}

function writeCoreToken(token = null) {
  const cleanToken = hasUsableToken(token) ? safeText(token, "") : null;
  const tokenKey = getCoreStorageKey("token");

  try {
    if (cleanToken) {
      AppCore?.storage?.set?.(tokenKey, cleanToken);
    } else {
      AppCore?.storage?.remove?.(tokenKey);
    }
  } catch {}

  try {
    AppCore?.setToken?.(cleanToken);
  } catch {}

  safeSetState(
    {
      token: cleanToken,
      accessToken: cleanToken,
      hasToken: Boolean(cleanToken),
    },
    {
      forceUnauthenticated: !cleanToken,
      allowExplicitAuthenticated: Boolean(cleanToken),
    }
  );

  return cleanToken;
}

function writeCoreUser(user = null) {
  const finalUser = hasUsableUser(user) ? user : null;
  const userKey = getCoreStorageKey("user");

  try {
    if (finalUser) {
      AppCore?.storage?.set?.(userKey, finalUser);
    } else {
      AppCore?.storage?.remove?.(userKey);
    }
  } catch {}

  try {
    AppCore?.setUser?.(finalUser);
  } catch {}

  safeSetState({
    user: finalUser,
    currentUser: finalUser,
    authUser: finalUser,
    sessionUser: finalUser,
  });

  return finalUser;
}

function writeCoreSession(session = null) {
  const finalSession =
    isPlainObject(session)
      ? session
      : null;

  for (const name of [
    "session",
    "sessionData",
    "sessionId",
    "sessionUserId",
  ]) {
    try {
      AppCore?.storage?.remove?.(getCoreStorageKey(name));
    } catch {}
  }

  if (finalSession) {
    try {
      AppCore?.storage?.set?.(
        getCoreStorageKey("session"),
        finalSession
      );
    } catch {}

    try {
      AppCore?.storage?.set?.(
        getCoreStorageKey("sessionId"),
        finalSession.sessionId || finalSession.id || ""
      );
    } catch {}

    try {
      AppCore?.storage?.set?.(
        getCoreStorageKey("sessionUserId"),
        finalSession.sessionUserId ||
          finalSession.userId ||
          finalSession.user_id ||
          ""
      );
    } catch {}
  }

  return finalSession;
}

function clearLegacyAuthStorage() {
  if (!isBrowser()) {
    return false;
  }

  LEGACY_AUTH_STORAGE_KEYS.forEach((key) => {
    try {
      window.localStorage?.removeItem?.(key);
    } catch {}

    try {
      window.sessionStorage?.removeItem?.(key);
    } catch {}
  });

  return true;
}

function clearCoreAuthStorage() {
  const keys = [
    "token",
    "user",
    "refreshToken",
    "tempToken",
    "session",
    "sessionData",
    "sessionId",
    "sessionUserId",
    "authContext",
  ];

  keys.forEach((name) => {
    try {
      AppCore?.storage?.remove?.(getCoreStorageKey(name));
    } catch {}
  });

  return true;
}

/* =========================================================
   STATE RESOLUTION
========================================================= */

function getBestStateToken(state = ensureCoreState()) {
  return safeText(
    first(
      state.token,
      state.accessToken,
      state.session?.token,
      state.session?.accessToken,
      readCoreStoredToken()
    ),
    ""
  );
}

function getBestStateUser(state = ensureCoreState()) {
  return (
    (hasUsableUser(state.user) && state.user) ||
    (hasUsableUser(state.currentUser) && state.currentUser) ||
    (hasUsableUser(state.authUser) && state.authUser) ||
    (hasUsableUser(state.sessionUser) && state.sessionUser) ||
    (hasUsableUser(state.session?.user) && state.session.user) ||
    null
  );
}

function getBestStateSession(state = ensureCoreState()) {
  return normalizeSessionContext(
    state.session ||
      state.sessionData ||
      null,
    getBestStateUser(state),
    {
      sessionId: state.sessionId,
      sessionUserId: state.sessionUserId,
    }
  );
}

function resolveAuthenticated(state = ensureCoreState()) {
  return (
    hasUsableToken(getBestStateToken(state)) &&
    hasUsableUser(getBestStateUser(state))
  );
}

function buildDerivedAuthState(state = ensureCoreState()) {
  const token = getBestStateToken(state);
  const user = getBestStateUser(state);
  const session = getBestStateSession(state);

  const authenticated =
    hasUsableToken(token) &&
    hasUsableUser(user);

  const explicitRole =
    state.role ||
    state.userRole ||
    state.session?.role ||
    "";

  const roles = authenticated
    ? resolveRolesFromUser(user, explicitRole)
    : [];

  const role = authenticated
    ? resolveCanonicalRole(roles)
    : "";

  return {
    authenticated,
    token,
    user,
    session,
    role,
    roles,

    isAdmin: roles.some(isAdminRole),
    isSupport: roles.some(isSupportRole),
    isManager: roles.some(isManagerRole),
    isClient: roles.some(isClientRole),
  };
}

function syncDerivedState() {
  const state = ensureCoreState();
  const derived = buildDerivedAuthState(state);

  state.authenticated = derived.authenticated;
  state.hasToken = hasUsableToken(derived.token);

  state.role = derived.authenticated ? derived.role : "";
  state.userRole = derived.authenticated ? derived.role : "";
  state.roles = derived.authenticated ? derived.roles : [];

  state.isAdmin = derived.authenticated && derived.isAdmin;
  state.isSupport = derived.authenticated && derived.isSupport;
  state.isManager = derived.authenticated && derived.isManager;
  state.isClient = derived.authenticated && derived.isClient;

  if (derived.session) {
    state.session = derived.session;
    state.sessionData = derived.session;
    state.sessionId = derived.session.sessionId || derived.session.id || null;
    state.sessionUserId =
      derived.session.sessionUserId ||
      derived.session.userId ||
      derived.session.user_id ||
      null;
  }

  if (!derived.authenticated) {
    state.currentResolvedUsername = null;
    state.resolvedUsername = null;
  }

  return state;
}

function clearAuthStatePatch() {
  return {
    token: null,
    accessToken: null,

    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,

    role: "",
    userRole: "",
    roles: [],

    authenticated: false,
    hasToken: false,

    isAdmin: false,
    isSupport: false,
    isManager: false,
    isClient: false,

    session: null,
    sessionData: null,
    sessionId: null,
    sessionUserId: null,

    currentResolvedUsername: null,
    resolvedUsername: null,

    twoFactorPending: false,
    tempToken: null,
  };
}

function safeSyncUserUI() {
  try {
    AppCore?.syncUserUI?.();
  } catch {}

  try {
    AppCore?.syncUserUI?.({
      source: SESSION_SOURCE,
      reason: "auth-session-sync",
    });
  } catch {}
}

/* =========================================================
   THEME / LANG FROM USER
========================================================= */

function resolveThemeFromUser(user = null) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const explicitTheme = String(
    user.theme ??
      user.mode ??
      user.appearance ??
      user?.preferences?.theme ??
      user?.preferences?.mode ??
      user?.preferences?.appearance ??
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

  const candidates = [
    user.darkMode,
    user.dark_mode,
    user?.raw?.darkMode,
    user?.raw?.dark_mode,
    user?.preferences?.darkMode,
    user?.preferences?.dark_mode,
    user?.settings?.darkMode,
    user?.settings?.dark_mode,
    user?.raw?.preferences?.darkMode,
    user?.raw?.preferences?.dark_mode,
    user?.raw?.settings?.darkMode,
    user?.raw?.settings?.dark_mode,
  ];

  const hasExplicitDarkMode =
    hasOwn(user, "darkMode") ||
    hasOwn(user, "dark_mode") ||
    hasOwn(user?.raw, "darkMode") ||
    hasOwn(user?.raw, "dark_mode") ||
    hasOwn(user?.preferences, "darkMode") ||
    hasOwn(user?.preferences, "dark_mode") ||
    hasOwn(user?.settings, "darkMode") ||
    hasOwn(user?.settings, "dark_mode") ||
    hasOwn(user?.raw?.preferences, "darkMode") ||
    hasOwn(user?.raw?.preferences, "dark_mode") ||
    hasOwn(user?.raw?.settings, "darkMode") ||
    hasOwn(user?.raw?.settings, "dark_mode");

  if (hasExplicitDarkMode) {
    const darkValue = candidates.find((item) => typeof item === "boolean");

    if (typeof darkValue === "boolean") {
      return darkValue ? "dark" : "light";
    }
  }

  return null;
}

function resolveLangFromUser(user = null) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const lang = safeText(
    user.lang ||
      user.language ||
      user.locale ||
      user?.preferences?.lang ||
      user?.preferences?.language ||
      user?.preferences?.locale ||
      user?.settings?.lang ||
      user?.settings?.language ||
      user?.settings?.locale ||
      "",
    ""
  ).toLowerCase();

  return lang || null;
}

function applyThemeFromUser(user = null) {
  const theme = resolveThemeFromUser(user);

  if (theme !== "light" && theme !== "dark") {
    return null;
  }

  try {
    AppCore?.setTheme?.(theme);
  } catch {}

  try {
    safeSetState({
      theme,
      mode: theme,
      appearance: theme,
    });
  } catch {}

  return theme;
}

function applyLangFromUser(user = null) {
  const lang = resolveLangFromUser(user);

  if (!lang) {
    return null;
  }

  try {
    AppCore?.setLang?.(lang);
  } catch {}

  try {
    safeSetState({
      lang,
      language: lang,
      locale: lang,
    });
  } catch {}

  return lang;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getCurrentStateSnapshotBase() {
  const state = ensureCoreState();

  syncDerivedState();

  const token = getBestStateToken(state);
  const user = getBestStateUser(state);
  const session = getBestStateSession(state);

  const authenticated = Boolean(
    hasUsableToken(token) &&
      hasUsableUser(user) &&
      state.authenticated === true
  );

  return {
    authenticated,

    token: hasUsableToken(token) ? token : null,
    accessToken: hasUsableToken(token) ? state.accessToken || token : null,

    user: hasUsableUser(user) ? user : null,

    role: authenticated ? state.role || null : null,
    roles: authenticated ? normalizeRoles(state.roles) : [],

    isAdmin: authenticated && Boolean(state.isAdmin),
    isSupport: authenticated && Boolean(state.isSupport),
    isManager: authenticated && Boolean(state.isManager),
    isClient: authenticated && Boolean(state.isClient),

    session: session || null,
    sessionData: session || null,
    sessionId: session?.sessionId || state.sessionId || null,
    sessionUserId:
      session?.sessionUserId ||
      session?.userId ||
      state.sessionUserId ||
      null,

    route: state.route || "/",
    publicPath: state.publicPath || "/",
  };
}

export function buildSessionSnapshot(extra = {}) {
  const base = getCurrentStateSnapshotBase();

  return {
    version: AUTH_SESSION_VERSION,

    ...base,

    refreshToken: getStoredRefreshToken() || null,
    storedSessionId: getStoredSessionId() || null,
    storedSessionUserId: getStoredSessionUserId() || null,

    ...extra,
  };
}

function buildPublicSnapshot(snapshot = {}) {
  return {
    version: AUTH_SESSION_VERSION,

    authenticated: Boolean(snapshot.authenticated),
    hasToken: hasUsableToken(snapshot.token),

    token: null,
    accessToken: null,
    refreshToken: null,

    user: snapshot.user || null,

    role: snapshot.role || null,
    roles: normalizeRoles(snapshot.roles),

    isAdmin: Boolean(snapshot.isAdmin),
    isSupport: Boolean(snapshot.isSupport),
    isManager: Boolean(snapshot.isManager),
    isClient: Boolean(snapshot.isClient),

    sessionId:
      snapshot.sessionId ||
      snapshot.session?.sessionId ||
      null,

    sessionUserId:
      snapshot.sessionUserId ||
      snapshot.session?.sessionUserId ||
      snapshot.session?.userId ||
      null,

    route: snapshot.route || "/",
    publicPath: snapshot.publicPath || "/",

    source: snapshot.source || "",
    eventMode: snapshot.eventMode || "",
  };
}

function buildSessionFingerprint(snapshot = {}) {
  const user = snapshot?.user || {};
  const session = snapshot?.session || snapshot?.sessionData || {};

  return JSON.stringify({
    authenticated: Boolean(snapshot.authenticated),
    hasToken: hasUsableToken(snapshot.token),
    tokenLength: safeText(snapshot.token).length,

    role: safeText(snapshot.role),
    roles: normalizeRoles(snapshot.roles).join("|"),

    isAdmin: Boolean(snapshot.isAdmin),
    isSupport: Boolean(snapshot.isSupport),
    isManager: Boolean(snapshot.isManager),
    isClient: Boolean(snapshot.isClient),

    hasRefreshToken: Boolean(snapshot.refreshToken),

    sessionId:
      snapshot.sessionId ||
      session.sessionId ||
      session.id ||
      null,

    sessionUserId:
      snapshot.sessionUserId ||
      session.sessionUserId ||
      session.userId ||
      session.user_id ||
      null,

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
      user.user_name ||
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
  const publicBefore = before ? buildPublicSnapshot(before) : null;
  const publicAfter = after ? buildPublicSnapshot(after) : null;

  safeEmit("auth:session:state", {
    reason,
    before: publicBefore,
    after: publicAfter,

    changed:
      buildSessionFingerprint(before) !==
      buildSessionFingerprint(after),

    durationMs,
    timestamp: nowMs(),
    at: safeIsoDate(),
  });
}

function emitSessionAppliedEvents(after = {}, before = null, options = {}) {
  const mode = inferEventMode(options);

  const publicAfter = {
    ...buildPublicSnapshot(after),
    eventMode: mode,
  };

  const changed =
    !before ||
    buildSessionFingerprint(before) !==
      buildSessionFingerprint(after);

  safeEmit("auth:session:applied", publicAfter);
  safeEmit("app:session:change", publicAfter);
  safeEmit("app:auth:change", publicAfter);
  safeEmit("auth:change", publicAfter);

  if (mode === "restore") {
    safeEmit("auth:session:restored", publicAfter);
    safeEmit("app:session:restored", publicAfter);
  }

  if (changed) {
    safeEmit("app:user:change", publicAfter);
    safeEmit("app:user:updated", publicAfter);
  }
}

function emitSessionPartialEvents(after = {}, before = null, options = {}) {
  const mode = inferEventMode(options);

  const publicAfter = {
    ...buildPublicSnapshot(after),
    eventMode: mode,
  };

  const changed =
    !before ||
    buildSessionFingerprint(before) !==
      buildSessionFingerprint(after);

  safeEmit("auth:session:partial", publicAfter);
  safeEmit("app:session:change", publicAfter);
  safeEmit("app:auth:change", publicAfter);
  safeEmit("auth:change", publicAfter);

  if (changed) {
    safeEmit("app:user:change", publicAfter);
  }
}

function emitSessionClearedEvents(after = {}, options = {}) {
  const mode = inferEventMode({
    ...options,
    eventMode: options.eventMode || "clear",
  });

  const publicAfter = {
    ...buildPublicSnapshot(after),
    eventMode: mode,
  };

  safeEmit("auth:session:cleared", publicAfter);
  safeEmit("app:session:cleared", publicAfter);
  safeEmit("app:session:change", publicAfter);
  safeEmit("app:auth:change", publicAfter);
  safeEmit("auth:change", publicAfter);
  safeEmit("app:user:change", publicAfter);
}

/* =========================================================
   SAFE PERSIST HELPERS
========================================================= */

function safePersistRefreshToken(value) {
  try {
    persistRefreshToken(value || null);
  } catch {}
}

function safePersistTempToken(value) {
  try {
    persistTempToken(value || null);
  } catch {}
}

function safePersistSessionContext(sessionData, user) {
  try {
    persistSessionContext(sessionData || null, user || null);
  } catch {}
}

function safePersistAuxSessionData(user) {
  try {
    persistAuxSessionData(user || null);
  } catch {}
}

/* =========================================================
   APPLY SESSION
========================================================= */

export function applySession(payload = {}) {
  const startedAt = nowMs();

  const source =
    safeText(payload?.source, SESSION_SOURCE) ||
    SESSION_SOURCE;

  const mode = inferEventMode({
    source,
    eventMode: payload?.eventMode,
    emitRestoreEvents: payload?.emitRestoreEvents,
  });

  const silent =
    safeBool(payload?.silent, false) ||
    mode === "silent";

  const before = buildSessionSnapshot({
    source,
    eventMode: mode,
  });

  const state = ensureCoreState();

  const extracted =
    extractSessionInput(payload);

  const tokenProvided =
    TOKEN_KEYS.some((key) => hasOwn(payload, key)) ||
    hasOwn(payload?.auth, "token") ||
    hasOwn(payload?.data, "token");

  const userProvided =
    USER_KEYS.some((key) => hasOwn(payload, key)) ||
    hasOwn(payload?.auth, "user") ||
    hasOwn(payload?.data, "user") ||
    hasOwn(payload?.data, "usuario");

  const refreshTokenProvided =
    REFRESH_TOKEN_KEYS.some((key) => hasOwn(payload, key)) ||
    hasOwn(payload?.auth, "refreshToken") ||
    hasOwn(payload?.data, "refreshToken");

  const tempTokenProvided =
    TEMP_TOKEN_KEYS.some((key) => hasOwn(payload, key));

  const preserveExistingUser =
    payload?.preserveExistingUser === true;

  if (tokenProvided) {
    writeCoreToken(extracted.token || null);
  }

  if (userProvided) {
    writeCoreUser(extracted.user || null);
  }

  if (
    tokenProvided &&
    !userProvided &&
    preserveExistingUser !== true
  ) {
    writeCoreUser(null);
  }

  const currentState = ensureCoreState();

  const effectiveToken =
    safeText(
      first(
        tokenProvided ? extracted.token : undefined,
        currentState.token,
        currentState.accessToken,
        currentState.session?.token,
        currentState.session?.accessToken,
        readCoreStoredToken()
      ),
      ""
    );

  let effectiveUser = null;

  if (userProvided) {
    effectiveUser = extracted.user || null;
  } else if (
    tokenProvided &&
    preserveExistingUser !== true
  ) {
    effectiveUser = null;
  } else {
    effectiveUser = getBestStateUser(currentState);
  }

  const effectiveSession =
    normalizeSessionContext(
      extracted.session ||
        payload?.sessionData ||
        payload?.session ||
        currentState.session ||
        currentState.sessionData ||
        null,
      effectiveUser,
      {
        sessionId:
          extracted.sessionId ||
          payload?.sessionId ||
          payload?.session_id ||
          currentState.sessionId,
        sessionUserId:
          extracted.sessionUserId ||
          payload?.sessionUserId ||
          payload?.session_user_id ||
          currentState.sessionUserId,
      }
    );

  const usableToken = hasUsableToken(effectiveToken);
  const usableUser = hasUsableUser(effectiveUser);

  const nextAuthenticated =
    payload?.authenticated === false
      ? false
      : usableToken && usableUser;

  const explicitRole =
    safeText(
      first(
        payload?.role,
        payload?.rol,
        extracted.role
      ),
      ""
    );

  const nextRoles = nextAuthenticated
    ? resolveRolesFromUser(effectiveUser, explicitRole)
    : [];

  const nextRole = nextAuthenticated
    ? resolveCanonicalRole(nextRoles)
    : "";

  if (refreshTokenProvided) {
    safePersistRefreshToken(extracted.refreshToken || null);
  }

  if (tempTokenProvided) {
    safePersistTempToken(extracted.tempToken || null);
  } else if (nextAuthenticated) {
    safePersistTempToken(null);
  }

  if (effectiveSession) {
    safePersistSessionContext(effectiveSession, effectiveUser);
    writeCoreSession(effectiveSession);
  }

  if (nextAuthenticated) {
    safePersistAuxSessionData(effectiveUser);
    applyThemeFromUser(effectiveUser);
    applyLangFromUser(effectiveUser);
  }

  const sessionId =
    safeText(
      first(
        effectiveSession?.sessionId,
        effectiveSession?.id,
        payload?.sessionId,
        payload?.session_id,
        getStoredSessionId(),
        currentState.sessionId,
        currentState.session?.sessionId
      ),
      ""
    );

  const sessionUserId =
    safeText(
      first(
        effectiveSession?.sessionUserId,
        effectiveSession?.userId,
        effectiveSession?.user_id,
        payload?.sessionUserId,
        payload?.session_user_id,
        getUserIdentity(effectiveUser),
        getStoredSessionUserId(),
        currentState.sessionUserId,
        currentState.session?.sessionUserId,
        currentState.session?.userId
      ),
      ""
    );

  const canonicalSession =
    effectiveSession
      ? {
          ...effectiveSession,
          sessionId: sessionId || effectiveSession.sessionId || null,
          session_id: sessionId || effectiveSession.session_id || null,
          sessionUserId: sessionUserId || effectiveSession.sessionUserId || null,
          session_user_id: sessionUserId || effectiveSession.session_user_id || null,
          userId: effectiveSession.userId || sessionUserId || null,
          user_id: effectiveSession.user_id || sessionUserId || null,
        }
      : null;

  const hasTempToken =
    tempTokenProvided &&
    hasUsableToken(extracted.tempToken);

  const nextPatch = {
    token: usableToken ? effectiveToken : null,
    accessToken: usableToken ? effectiveToken : null,

    user: usableUser ? effectiveUser : null,
    currentUser: usableUser ? effectiveUser : null,
    authUser: usableUser ? effectiveUser : null,
    sessionUser: usableUser ? effectiveUser : null,

    role: nextRole,
    userRole: nextRole,
    roles: nextRoles,

    authenticated: nextAuthenticated,
    hasToken: usableToken,

    isAdmin: nextAuthenticated && nextRoles.some(isAdminRole),
    isSupport: nextAuthenticated && nextRoles.some(isSupportRole),
    isManager: nextAuthenticated && nextRoles.some(isManagerRole),
    isClient: nextAuthenticated && nextRoles.some(isClientRole),

    sessionId: sessionId || null,
    sessionUserId: sessionUserId || null,

    /*
      Alias controlados:
      - session y sessionData apuntan al mismo contexto canónico.
      - no se crean objetos divergentes.
    */
    session: nextAuthenticated
      ? {
          ...(canonicalSession || {}),
          token: effectiveToken,
          accessToken: effectiveToken,
          refreshToken:
            extracted.refreshToken ||
            getStoredRefreshToken() ||
            "",
          user: effectiveUser,
          role: nextRole,
          roles: nextRoles,
          authenticated: true,
          source,
        }
      : null,

    sessionData: null,

    twoFactorPending: !nextAuthenticated && hasTempToken,
    tempToken: hasTempToken ? safeText(extracted.tempToken, "") : null,

    currentResolvedUsername:
      nextAuthenticated
        ? effectiveUser?.slug ||
          effectiveUser?.usernameLower ||
          effectiveUser?.username ||
          null
        : null,

    resolvedUsername:
      nextAuthenticated
        ? effectiveUser?.slug ||
          effectiveUser?.usernameLower ||
          effectiveUser?.username ||
          null
        : null,

    lastAuthSource: source,
    lastAuthSyncAt: safeIsoDate(),
  };

  /*
    sessionData se iguala exactamente a session para evitar divergencias.
  */
  nextPatch.sessionData = nextPatch.session;

  safeSetState(nextPatch, {
    forceUnauthenticated: !nextAuthenticated,
    allowExplicitAuthenticated: nextAuthenticated,
  });

  syncDerivedState();
  safeSyncUserUI();

  const after = buildSessionSnapshot({
    source,
    eventMode: mode,
  });

  if (!silent && mode !== "silent") {
    emitSessionState({
      reason: nextAuthenticated ? "apply" : "apply:partial",
      before,
      after,
      durationMs: nowMs() - startedAt,
    });

    if (after.authenticated) {
      emitSessionAppliedEvents(after, before, {
        source,
        eventMode: mode,
        emitRestoreEvents: payload?.emitRestoreEvents,
      });
    } else {
      emitSessionPartialEvents(after, before, {
        source,
        eventMode: mode,
      });
    }
  }

  return after;
}

/* =========================================================
   CLEAR SESSION LOCAL
========================================================= */

export function clearSessionLocal(options = {}) {
  const silent = safeBool(options.silent, false);
  const startedAt = nowMs();

  const routeContext = captureRouteContext(options);

  const before = buildSessionSnapshot({
    routeContext,
    source: options.source || SESSION_SOURCE,
    eventMode: "clear",
  });

  const hadData = Boolean(
    before.token ||
      before.user ||
      before.refreshToken ||
      before.sessionId ||
      before.sessionUserId ||
      ensureCoreState().authenticated
  );

  try {
    if (options.callCoreClear === true && isFunction(AppCore?.clearSession)) {
      AppCore.clearSession({
        silent: true,
      });
    }
  } catch (error) {
    safeWarn("AppCore.clearSession() falló.", error);
  }

  try {
    clearAuthStorage();
  } catch (error) {
    safeWarn("clearAuthStorage() falló.", error);
  }

  clearCoreAuthStorage();
  clearLegacyAuthStorage();

  safePersistRefreshToken(null);
  safePersistTempToken(null);
  safePersistSessionContext(null, null);

  writeCoreToken(null);
  writeCoreUser(null);
  writeCoreSession(null);

  safeSetState(clearAuthStatePatch(), {
    forceUnauthenticated: true,
  });

  restoreRouteContext(routeContext);

  syncDerivedState();
  safeSyncUserUI();

  const after = buildSessionSnapshot({
    routeContext,
    source: options.source || SESSION_SOURCE,
    eventMode: "clear",
  });

  if (!silent) {
    if (hadData || options.emitWhenEmpty === true) {
      emitSessionClearedEvents(after, {
        source: options.source || SESSION_SOURCE,
        eventMode: "clear",
      });
    }

    emitSessionState({
      reason: "clear",
      before,
      after,
      durationMs: nowMs() - startedAt,
    });
  }

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
      hasUsableToken(getBestStateToken(state)) &&
      hasUsableUser(getBestStateUser(state))
  );
}

export function getCurrentRole() {
  syncDerivedState();

  return safeText(ensureCoreState().role, "").toLowerCase();
}

export function getCurrentRoles() {
  syncDerivedState();

  return normalizeRoles(ensureCoreState().roles);
}

export function isCurrentUserAdmin() {
  syncDerivedState();

  return Boolean(ensureCoreState().isAdmin);
}

export function isCurrentUserSupport() {
  syncDerivedState();

  return Boolean(ensureCoreState().isSupport);
}

export function isCurrentUserManager() {
  syncDerivedState();

  return Boolean(ensureCoreState().isManager);
}

export function isCurrentUserClient() {
  syncDerivedState();

  return Boolean(ensureCoreState().isClient);
}

export function hasRole(...roles) {
  if (!roles.length) {
    return true;
  }

  const allowedRoles = expandRoleAliases(roles.flat(Infinity));

  if (!allowedRoles.length) {
    return true;
  }

  const currentRoles = new Set(
    expandRoleAliases(getCurrentRoles())
  );

  return allowedRoles.some((roleName) =>
    currentRoles.has(roleName)
  );
}

export function requireRole(...roles) {
  return isAuthenticated() && hasRole(...roles);
}

/* =========================================================
   AUTH HEADER
   Nota:
   - Devuelve Authorization si hay token usable.
   - No exige user/authenticated para permitir /me durante restore.
========================================================= */

export function getAuthHeader() {
  const state = ensureCoreState();

  const token = safeText(
    first(
      state.token,
      state.accessToken,
      state.session?.token,
      state.session?.accessToken,
      readCoreStoredToken()
    ),
    ""
  );

  if (!hasUsableToken(token)) {
    return {};
  }

  const prefix = safeText(
    AppCore?.config?.auth?.bearerPrefix,
    "Bearer"
  );

  return {
    Authorization: `${prefix} ${token}`,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionDebugSnapshot() {
  const snapshot = buildSessionSnapshot();

  return {
    version: AUTH_SESSION_VERSION,

    authenticated: Boolean(snapshot.authenticated),

    role: snapshot.role || null,
    roles: normalizeRoles(snapshot.roles),

    isAdmin: Boolean(snapshot.isAdmin),
    isSupport: Boolean(snapshot.isSupport),
    isManager: Boolean(snapshot.isManager),
    isClient: Boolean(snapshot.isClient),

    username:
      snapshot.user?.username ||
      snapshot.user?.userName ||
      snapshot.user?.user_name ||
      snapshot.user?.email ||
      snapshot.user?.name ||
      snapshot.user?.nombre ||
      snapshot.user?.phone ||
      null,

    userIdentity: getUserIdentity(snapshot.user),

    hasToken: Boolean(snapshot.token),
    hasUser: hasUsableUser(snapshot.user),
    hasRefreshToken: Boolean(snapshot.refreshToken),

    sessionId:
      snapshot.sessionId ||
      snapshot.session?.sessionId ||
      null,

    sessionUserId:
      snapshot.sessionUserId ||
      snapshot.session?.sessionUserId ||
      snapshot.session?.userId ||
      null,

    storedSessionId:
      snapshot.storedSessionId || null,

    storedSessionUserId:
      snapshot.storedSessionUserId || null,

    hasSessionContext: Boolean(
      snapshot.sessionId ||
        snapshot.session?.sessionId ||
        snapshot.storedSessionId
    ),

    route: snapshot.route || "/",
    publicPath: snapshot.publicPath || "/",

    isPublicTechnicalRoute: isPublicTechnicalRoute(
      snapshot.route ||
        snapshot.publicPath ||
        "/"
    ),

    isProtectedPublicTokenRoute: isProtectedPublicTokenRoute(
      snapshot.route ||
        snapshot.publicPath ||
        "/"
    ),

    rawUserRoleCandidates: collectRoleCandidatesFromUser(snapshot.user),
  };
}

export function buildAuthErrorPayload(error) {
  return {
    error: error
      ? {
          name: safeText(error.name, "Error"),

          status:
            error.status ||
            error.response?.status ||
            error.data?.status ||
            null,

          code:
            error.code ||
            error.data?.code ||
            error.response?.data?.code ||
            null,
        }
      : null,

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
  isCurrentUserSupport,
  isCurrentUserManager,
  isCurrentUserClient,

  hasRole,
  requireRole,

  getAuthHeader,
  getSessionDebugSnapshot,
  buildAuthErrorPayload,
};
