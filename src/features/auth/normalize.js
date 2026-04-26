/* =========================================================
   Onion SPA - Auth Normalize
   Archivo: src/features/auth/normalize.js

   FINAL PRO SYSTEM · AUTH NORMALIZER · ADMIN ROLE HARDENED · 10/10

   Responsabilidades:
   - normalizar user heterogéneo backend
   - normalizar payload de sesión
   - extraer tokens desde respuestas variables
   - validar respuesta de login / refresh
   - normalizar avatar robusto para sidebar / topbar
   - endurecer tipos / strings / arrays
   - detectar 2FA con variantes comunes
   - preservar roles / permisos / flags admin
   - blindaje enterprise edge cases

   HARDENING:
   - no pierde role / rol / roles / permissions / claims
   - normaliza admin / superadmin / administrator / owner / root como admin
   - expone user.role, user.roles, user.isAdmin
   - soporta payloads nested { ok, data, payload, result, user, me, account }
   - conserva raw completo

   FIX 10/10:
   - no considera login válido si falta token + usuario usable
   - detecta ok:false / success:false / status >= 400
   - no normaliza un envelope auth como si fuera usuario
   - user-only y token-only quedan como payload parcial, no authenticated
   - 2FA exige tempToken/challengeToken usable
========================================================= */

import {
  sanitizeUsername,
  slugify,
  safeClone,
  normalizeSessionValue,
} from "./helpers.js";

import { AUTH_CONSTANTS } from "./constants.js";

/* =========================================================
   ROLE CONSTANTS
========================================================= */

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

const AUTH_FAILURE_CODES = new Set([
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "ACCOUNT_TEMPORARILY_LOCKED",
  "ACCOUNT_DISABLED",
  "USER_DISABLED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "TOKEN_INVALID",
  "INVALID_TOKEN",
  "SESSION_EXPIRED",
  "INVALID_LOGIN_SESSION",
]);

/* =========================================================
   HELPERS
========================================================= */

function normalizeString(value = "") {
  return String(value ?? "").trim();
}

function safeLower(value = "") {
  return normalizeString(value).toLowerCase();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["1", "true", "yes", "on", "si", "sí", "ok"].includes(key)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(key)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];

  return [value];
}

function pickFirst(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function pickFirstText(...values) {
  const value = pickFirst(...values);

  return normalizeString(value || "");
}

function pickFirstObject(...values) {
  for (const value of values) {
    if (isObject(value)) {
      return value;
    }
  }

  return null;
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeEmail(value = "") {
  return safeLower(value);
}

function normalizeRoleKey(value = "") {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoleList(value) {
  if (Array.isArray(value)) {
    return value
      .flat(Infinity)
      .map(normalizeRoleKey)
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s|]+/)
      .map(normalizeRoleKey)
      .filter(Boolean);
  }

  return toArray(value)
    .flat(Infinity)
    .map(normalizeRoleKey)
    .filter(Boolean);
}

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(normalizeRoleKey(value));
}

function isSupportRole(value = "") {
  return SUPPORT_ROLE_KEYS.has(normalizeRoleKey(value));
}

function isManagerRole(value = "") {
  return MANAGER_ROLE_KEYS.has(normalizeRoleKey(value));
}

function expandRoleAliases(roles = []) {
  const normalized = normalizeRoleList(roles);
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

  return unique(Array.from(result));
}

function normalizeCanonicalRole(value = "user") {
  const roles = expandRoleAliases(value);

  if (roles.some(isAdminRole)) return "admin";
  if (roles.some(isSupportRole)) return "support";
  if (roles.some(isManagerRole)) return "manager";

  return roles[0] || "user";
}

function normalizePermissionList(value) {
  return normalizeRoleList(value);
}

function normalizeTheme(value = "") {
  const theme = safeLower(value);

  if (theme === "light") return "light";
  if (theme === "dark") return "dark";

  return null;
}

function isSafeAvatarUrl(url = "") {
  const value = normalizeString(url);

  if (!value) {
    return false;
  }

  const lower = value.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:text/html")
  ) {
    return false;
  }

  return true;
}

function getNestedRawUser(rawUser = {}) {
  const user = isObject(rawUser) ? rawUser : {};

  return isObject(user.raw)
    ? user.raw
    : {};
}

function hasUsableUserIdentity(user = {}) {
  if (!isObject(user)) {
    return false;
  }

  return Boolean(
    normalizeString(user.id) ||
      normalizeString(user.userId) ||
      normalizeString(user.user_id) ||
      normalizeString(user._id) ||
      normalizeString(user.uid) ||
      normalizeString(user.username) ||
      normalizeString(user.userName) ||
      normalizeString(user.user_name) ||
      normalizeString(user.email) ||
      normalizeString(user.mail) ||
      normalizeString(user.phone) ||
      normalizeString(user.telefono) ||
      normalizeString(user.mobile)
  );
}

function isAuthEnvelope(value = {}) {
  if (!isObject(value)) {
    return false;
  }

  return Boolean(
    Object.prototype.hasOwnProperty.call(value, "ok") ||
      Object.prototype.hasOwnProperty.call(value, "success") ||
      Object.prototype.hasOwnProperty.call(value, "status") ||
      Object.prototype.hasOwnProperty.call(value, "statusCode") ||
      Object.prototype.hasOwnProperty.call(value, "token") ||
      Object.prototype.hasOwnProperty.call(value, "accessToken") ||
      Object.prototype.hasOwnProperty.call(value, "access_token") ||
      Object.prototype.hasOwnProperty.call(value, "refreshToken") ||
      Object.prototype.hasOwnProperty.call(value, "refresh_token") ||
      Object.prototype.hasOwnProperty.call(value, "data") ||
      Object.prototype.hasOwnProperty.call(value, "payload") ||
      Object.prototype.hasOwnProperty.call(value, "result") ||
      Object.prototype.hasOwnProperty.call(value, "response") ||
      Object.prototype.hasOwnProperty.call(value, "session") ||
      Object.prototype.hasOwnProperty.call(value, "auth")
  );
}

/* =========================================================
   ENVELOPE HELPERS
========================================================= */

function getNestedAuthNodes(payload = {}) {
  const root = safeObject(payload);

  const data = safeObject(root.data);
  const payloadNode = safeObject(root.payload);
  const result = safeObject(root.result);
  const body = safeObject(root.body);
  const response = safeObject(root.response);
  const responseData = safeObject(response.data);
  const meta = safeObject(root.meta);

  const session = pickFirstObject(
    root.session,
    root.sessionData,
    data.session,
    data.sessionData,
    payloadNode.session,
    payloadNode.sessionData,
    result.session,
    result.sessionData,
    body.session,
    body.sessionData,
    responseData.session,
    responseData.sessionData,
    meta.session
  ) || {};

  const auth = pickFirstObject(
    root.auth,
    root.authData,
    data.auth,
    data.authData,
    payloadNode.auth,
    payloadNode.authData,
    result.auth,
    result.authData,
    body.auth,
    body.authData,
    responseData.auth,
    responseData.authData,
    meta.auth
  ) || {};

  const sessionData = safeObject(session.data);
  const authData = safeObject(auth.data);

  return {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    response,
    responseData,
    meta,
    session,
    auth,
    sessionData,
    authData,
  };
}

function unwrapAuthPayload(payload = null, depth = 0) {
  if (!payload || depth > 6) {
    return payload;
  }

  if (!isObject(payload)) {
    return payload;
  }

  const candidate = pickFirst(
    payload.data,
    payload.payload,
    payload.result,
    payload.response
  );

  if (isObject(candidate)) {
    return unwrapAuthPayload(candidate, depth + 1);
  }

  return payload;
}

function getStatusValue(payload = null) {
  const {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    response,
    responseData,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedAuthNodes(payload);

  return pickFirst(
    root.status,
    root.statusCode,
    root.status_code,

    data.status,
    data.statusCode,
    data.status_code,

    payloadNode.status,
    payloadNode.statusCode,
    payloadNode.status_code,

    result.status,
    result.statusCode,
    result.status_code,

    body.status,
    body.statusCode,
    body.status_code,

    response.status,
    response.statusCode,
    response.status_code,

    responseData.status,
    responseData.statusCode,
    responseData.status_code,

    session.status,
    session.statusCode,
    session.status_code,

    auth.status,
    auth.statusCode,
    auth.status_code,

    sessionData.status,
    sessionData.statusCode,
    sessionData.status_code,

    authData.status,
    authData.statusCode,
    authData.status_code
  );
}

function getErrorCode(payload = null) {
  const {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    responseData,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedAuthNodes(payload);

  return pickFirstText(
    root.code,
    root.errorCode,
    root.error_code,
    root.error,

    data.code,
    data.errorCode,
    data.error_code,
    data.error,

    payloadNode.code,
    payloadNode.errorCode,
    payloadNode.error_code,
    payloadNode.error,

    result.code,
    result.errorCode,
    result.error_code,
    result.error,

    body.code,
    body.errorCode,
    body.error_code,
    body.error,

    responseData.code,
    responseData.errorCode,
    responseData.error_code,
    responseData.error,

    session.code,
    session.errorCode,
    session.error_code,

    auth.code,
    auth.errorCode,
    auth.error_code,

    sessionData.code,
    sessionData.errorCode,
    sessionData.error_code,

    authData.code,
    authData.errorCode,
    authData.error_code
  );
}

function getResponseMessage(payload = null) {
  const {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    responseData,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedAuthNodes(payload);

  return pickFirstText(
    root.message,
    root.mensaje,
    root.errorMessage,
    root.error_message,

    data.message,
    data.mensaje,
    data.errorMessage,
    data.error_message,

    payloadNode.message,
    payloadNode.mensaje,
    payloadNode.errorMessage,
    payloadNode.error_message,

    result.message,
    result.mensaje,
    result.errorMessage,
    result.error_message,

    body.message,
    body.mensaje,
    body.errorMessage,
    body.error_message,

    responseData.message,
    responseData.mensaje,
    responseData.errorMessage,
    responseData.error_message,

    session.message,
    session.mensaje,

    auth.message,
    auth.mensaje,

    sessionData.message,
    sessionData.mensaje,

    authData.message,
    authData.mensaje
  );
}

function isExplicitAuthFailure(payload = null) {
  if (!payload || !isObject(payload)) {
    return false;
  }

  const {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    responseData,
  } = getNestedAuthNodes(payload);

  const statusValue = getStatusValue(payload);
  const statusNumber = Number(statusValue || 0);

  if (Number.isFinite(statusNumber) && statusNumber >= 400) {
    return true;
  }

  const code = getErrorCode(payload).toUpperCase();

  if (code && AUTH_FAILURE_CODES.has(code)) {
    return true;
  }

  if (
    root.ok === false ||
    root.success === false ||
    data.ok === false ||
    data.success === false ||
    payloadNode.ok === false ||
    payloadNode.success === false ||
    result.ok === false ||
    result.success === false ||
    body.ok === false ||
    body.success === false ||
    responseData.ok === false ||
    responseData.success === false
  ) {
    return true;
  }

  return false;
}

function createAuthNormalizeError(
  message = "La respuesta del API no contiene una sesión válida.",
  {
    status = 401,
    code = "INVALID_LOGIN_SESSION",
    response = null,
  } = {}
) {
  const error = new Error(message);

  error.status = status;
  error.data = {
    code,
    message,
    status,
  };

  error.response = response;
  error.raw = response;

  return error;
}

/* =========================================================
   AVATAR
========================================================= */

function normalizeAvatarUrl(rawUser = null) {
  if (!isObject(rawUser)) {
    return null;
  }

  const raw = getNestedRawUser(rawUser);
  const profile = isObject(rawUser.profile) ? rawUser.profile : {};
  const settings = isObject(rawUser.settings) ? rawUser.settings : {};
  const preferences = isObject(rawUser.preferences) ? rawUser.preferences : {};

  const hasAvatar = pickFirst(
    rawUser.hasAvatar,
    rawUser.has_avatar,
    rawUser.avatarEnabled,
    rawUser.avatar_enabled,

    profile.hasAvatar,
    profile.has_avatar,
    profile.avatarEnabled,
    profile.avatar_enabled,

    raw.hasAvatar,
    raw.has_avatar,
    raw.avatarEnabled,
    raw.avatar_enabled
  );

  const rawAvatar = pickFirst(
    rawUser.avatar,
    rawUser.avatarUrl,
    rawUser.avatar_url,
    rawUser.photo,
    rawUser.photoUrl,
    rawUser.photo_url,
    rawUser.image,
    rawUser.imageUrl,
    rawUser.image_url,
    rawUser.picture,
    rawUser.pictureUrl,
    rawUser.picture_url,

    profile.avatar,
    profile.avatarUrl,
    profile.avatar_url,
    profile.photo,
    profile.photoUrl,
    profile.photo_url,
    profile.image,
    profile.imageUrl,
    profile.image_url,
    profile.picture,
    profile.pictureUrl,
    profile.picture_url,

    settings.avatar,
    settings.avatarUrl,
    settings.photoUrl,
    preferences.avatar,
    preferences.avatarUrl,
    preferences.photoUrl,

    raw.avatar,
    raw.avatarUrl,
    raw.avatar_url,
    raw.photo,
    raw.photoUrl,
    raw.photo_url,
    raw.image,
    raw.imageUrl,
    raw.image_url,
    raw.picture,
    raw.pictureUrl,
    raw.picture_url,

    raw?.profile?.avatar,
    raw?.profile?.avatarUrl,
    raw?.profile?.avatar_url,
    raw?.profile?.photo,
    raw?.profile?.photoUrl,
    raw?.profile?.photo_url,
    raw?.profile?.picture,
    raw?.profile?.pictureUrl
  );

  const avatar = normalizeString(rawAvatar);

  if (!avatar) {
    return null;
  }

  if (
    hasAvatar !== undefined &&
    hasAvatar !== null &&
    !normalizeBoolean(hasAvatar, false)
  ) {
    return null;
  }

  if (!isSafeAvatarUrl(avatar)) {
    return null;
  }

  return avatar;
}

/* =========================================================
   ROLE / PERMISSION RESOLUTION
========================================================= */

function collectRoleCandidates(rawUser = {}) {
  const user = isObject(rawUser) ? rawUser : {};
  const raw = getNestedRawUser(user);

  const profile = isObject(user.profile) ? user.profile : {};
  const permissionsNode = isObject(user.permissions) ? user.permissions : {};
  const meta = isObject(user.meta) ? user.meta : {};
  const claims = isObject(user.claims) ? user.claims : {};
  const account = isObject(user.account) ? user.account : {};

  const rawProfile = isObject(raw.profile) ? raw.profile : {};
  const rawMeta = isObject(raw.meta) ? raw.meta : {};
  const rawClaims = isObject(raw.claims) ? raw.claims : {};

  const roleCandidates = [
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
    profile.user_role,
    profile.type,
    profile.perfil,

    account.role,
    account.rol,
    account.userRole,
    account.type,

    meta.role,
    meta.rol,
    meta.userRole,

    claims.role,
    claims.rol,
    claims.userRole,
    claims["custom:role"],
    claims["https://onion/role"],

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
    rawProfile.user_role,
    rawProfile.type,
    rawProfile.perfil,

    rawMeta.role,
    rawMeta.rol,
    rawMeta.userRole,

    rawClaims.role,
    rawClaims.rol,
    rawClaims.userRole,
    rawClaims["custom:role"],
    rawClaims["https://onion/role"],
  ];

  const roleArrays = [
    user.roles,
    user.roleList,
    user.role_list,
    user.permissions,
    user.scopes,
    user.groups,
    user.authorities,

    profile.roles,
    profile.permissions,
    profile.scopes,
    profile.groups,
    profile.authorities,

    account.roles,
    account.permissions,
    account.scopes,
    account.groups,

    permissionsNode.roles,
    permissionsNode.scopes,
    permissionsNode.items,
    permissionsNode.list,

    meta.roles,
    meta.permissions,
    meta.scopes,
    meta.groups,

    claims.roles,
    claims.permissions,
    claims.scopes,
    claims.groups,

    raw.roles,
    raw.roleList,
    raw.role_list,
    raw.permissions,
    raw.scopes,
    raw.groups,
    raw.authorities,

    rawProfile.roles,
    rawProfile.permissions,
    rawProfile.scopes,
    rawProfile.groups,

    rawMeta.roles,
    rawMeta.permissions,
    rawMeta.scopes,

    rawClaims.roles,
    rawClaims.permissions,
    rawClaims.scopes,
    rawClaims.groups,
  ];

  const roles = [
    ...roleCandidates,
    ...roleArrays.flatMap((value) => toArray(value)),
  ];

  const adminFlag = [
    user.isAdmin,
    user.admin,
    user.is_admin,
    user.isSuperAdmin,
    user.superAdmin,
    user.is_super_admin,
    user.canManageUsers,
    user.can_manage_users,
    user.canAccessUsers,
    user.can_access_users,

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

    rawProfile.isAdmin,
    rawProfile.admin,
    rawProfile.isSuperAdmin,
    rawProfile.superAdmin,
    rawProfile.canManageUsers,
    rawProfile.canAccessUsers,

    rawMeta.isAdmin,
    rawMeta.admin,
    rawMeta.isSuperAdmin,
    rawMeta.superAdmin,
    rawMeta.canManageUsers,
    rawMeta.canAccessUsers,

    rawClaims.isAdmin,
    rawClaims.admin,
    rawClaims.isSuperAdmin,
    rawClaims.superAdmin,
    rawClaims.canManageUsers,
    rawClaims.canAccessUsers,
  ].some((value) => normalizeBoolean(value, false));

  if (adminFlag) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function collectPermissions(rawUser = {}) {
  const user = isObject(rawUser) ? rawUser : {};
  const raw = getNestedRawUser(user);
  const profile = isObject(user.profile) ? user.profile : {};
  const meta = isObject(user.meta) ? user.meta : {};
  const claims = isObject(user.claims) ? user.claims : {};

  return unique(
    [
      ...normalizePermissionList(user.permissions),
      ...normalizePermissionList(user.scopes),
      ...normalizePermissionList(user.authorities),
      ...normalizePermissionList(profile.permissions),
      ...normalizePermissionList(profile.scopes),
      ...normalizePermissionList(meta.permissions),
      ...normalizePermissionList(meta.scopes),
      ...normalizePermissionList(claims.permissions),
      ...normalizePermissionList(claims.scopes),

      ...normalizePermissionList(raw.permissions),
      ...normalizePermissionList(raw.scopes),
      ...normalizePermissionList(raw.authorities),
      ...normalizePermissionList(raw?.profile?.permissions),
      ...normalizePermissionList(raw?.profile?.scopes),
      ...normalizePermissionList(raw?.meta?.permissions),
      ...normalizePermissionList(raw?.meta?.scopes),
      ...normalizePermissionList(raw?.claims?.permissions),
      ...normalizePermissionList(raw?.claims?.scopes),
    ]
  );
}

/* =========================================================
   USER
========================================================= */

export function normalizeUser(rawUser = null) {
  if (!isObject(rawUser)) {
    return null;
  }

  /*
    Protección:
    No normalizamos un envelope completo como usuario.
    Ejemplo peligroso: { ok:true, token:"...", data:{...} }.
  */
  if (isAuthEnvelope(rawUser) && !hasUsableUserIdentity(rawUser)) {
    return null;
  }

  const raw = getNestedRawUser(rawUser);
  const profile = isObject(rawUser.profile) ? rawUser.profile : {};
  const account = isObject(rawUser.account) ? rawUser.account : {};
  const preferences = isObject(rawUser.preferences) ? rawUser.preferences : {};
  const settings = isObject(rawUser.settings) ? rawUser.settings : {};

  const email = normalizeEmail(
    pickFirst(
      rawUser.email,
      rawUser.mail,
      profile.email,
      profile.mail,
      account.email,
      account.mail,
      raw.email,
      raw.mail,
      raw?.profile?.email,
      raw?.profile?.mail,
      ""
    )
  );

  const phone = pickFirst(
    rawUser.phone,
    rawUser.telefono,
    rawUser.mobile,
    rawUser.cellphone,
    profile.phone,
    profile.telefono,
    profile.mobile,
    account.phone,
    account.telefono,
    raw.phone,
    raw.telefono,
    raw.mobile,
    raw.cellphone,
    raw?.profile?.phone,
    raw?.profile?.telefono,
    raw?.profile?.mobile
  );

  const id = pickFirst(
    rawUser.id,
    rawUser.userId,
    rawUser.user_id,
    rawUser.uuid,
    rawUser.uid,
    rawUser._id,

    profile.id,
    profile.userId,
    profile.user_id,
    profile.uid,

    account.id,
    account.userId,
    account.user_id,
    account.uid,

    raw.id,
    raw.userId,
    raw.user_id,
    raw.uuid,
    raw.uid,
    raw._id,

    raw?.profile?.id,
    raw?.profile?.userId,
    raw?.profile?.user_id,
    raw?.profile?.uid
  );

  const userId = pickFirst(
    rawUser.userId,
    rawUser.user_id,
    rawUser.id,
    rawUser.uuid,
    rawUser.uid,
    rawUser._id,

    profile.userId,
    profile.user_id,
    profile.id,
    profile.uid,

    account.userId,
    account.user_id,
    account.id,
    account.uid,

    raw.userId,
    raw.user_id,
    raw.id,
    raw.uuid,
    raw.uid,
    raw._id,

    raw?.profile?.userId,
    raw?.profile?.user_id,
    raw?.profile?.id,
    raw?.profile?.uid
  );

  const username = sanitizeUsername(
    pickFirst(
      rawUser.username,
      rawUser.userName,
      rawUser.user_name,
      rawUser.nick,
      rawUser.alias,
      rawUser.login,
      rawUser.slug,

      profile.username,
      profile.userName,
      profile.user_name,
      profile.nick,
      profile.alias,

      account.username,
      account.userName,
      account.user_name,

      raw.username,
      raw.userName,
      raw.user_name,
      raw.nick,
      raw.alias,
      raw.login,
      raw.slug,

      raw?.profile?.username,
      raw?.profile?.userName,
      raw?.profile?.user_name,

      email
    ) || ""
  );

  const displayName = normalizeString(
    pickFirst(
      rawUser.name,
      rawUser.nombre,
      rawUser.full_name,
      rawUser.fullName,
      rawUser.display_name,
      rawUser.displayName,

      profile.name,
      profile.nombre,
      profile.fullName,
      profile.displayName,

      account.name,
      account.nombre,
      account.fullName,
      account.displayName,

      raw.name,
      raw.nombre,
      raw.full_name,
      raw.fullName,
      raw.display_name,
      raw.displayName,

      raw?.profile?.name,
      raw?.profile?.nombre,
      raw?.profile?.fullName,
      raw?.profile?.displayName,

      username,
      email,
      phone,
      "Usuario"
    )
  );

  const roles = collectRoleCandidates(rawUser);
  const role = normalizeCanonicalRole(roles);

  const permissions = collectPermissions(rawUser);

  const slug = normalizeString(
    pickFirst(
      rawUser.slug,
      profile.slug,
      raw.slug,
      raw?.profile?.slug,
      slugify(username || displayName || email || "usuario")
    )
  );

  const avatar = normalizeAvatarUrl(rawUser);

  const normalizedTheme = normalizeTheme(
    pickFirst(
      rawUser.theme,
      preferences.theme,
      settings.theme,
      profile.theme,
      raw.theme,
      raw?.preferences?.theme,
      raw?.settings?.theme,
      raw?.profile?.theme
    )
  );

  const clienteId = pickFirst(
    rawUser.clienteId,
    rawUser.clientId,
    rawUser.cliente_id,
    rawUser.customerId,
    profile.clienteId,
    profile.clientId,
    account.clienteId,
    account.clientId,
    raw.clienteId,
    raw.clientId,
    raw.cliente_id,
    raw.customerId
  );

  const active = normalizeBoolean(
    pickFirst(
      rawUser.active,
      rawUser.is_active,
      rawUser.isActive,
      rawUser.enabled,
      profile.active,
      profile.isActive,
      raw.active,
      raw.is_active,
      raw.isActive,
      raw.enabled
    ),
    true
  );

  const darkMode = normalizeBoolean(
    pickFirst(
      rawUser.darkMode,
      rawUser.dark_mode,
      preferences.darkMode,
      settings.darkMode,
      raw.darkMode,
      raw.dark_mode,
      raw?.preferences?.darkMode,
      raw?.settings?.darkMode
    ),
    false
  );

  const emailVerified = normalizeBoolean(
    pickFirst(
      rawUser.emailVerified,
      rawUser.email_verified,
      profile.emailVerified,
      profile.email_verified,
      account.emailVerified,
      account.email_verified,
      raw.emailVerified,
      raw.email_verified
    ),
    false
  );

  const twofaEnabled = normalizeBoolean(
    pickFirst(
      rawUser.twofa_enabled,
      rawUser.twofaEnabled,
      rawUser.twoFactorEnabled,
      rawUser.mfaEnabled,
      rawUser.mfa_enabled,
      profile.twofa_enabled,
      profile.twofaEnabled,
      raw.twofa_enabled,
      raw.twofaEnabled,
      raw.twoFactorEnabled,
      raw.mfaEnabled,
      raw.mfa_enabled
    ),
    false
  );

  const normalized = {
    id: id || null,
    userId: userId || id || null,

    username,
    slug,

    name: displayName || "Usuario",
    displayName: displayName || "Usuario",

    email,

    phone: phone || null,

    role,
    rol: role,
    roles,

    permissions,

    isAdmin: roles.some(isAdminRole),
    admin: roles.some(isAdminRole),
    isSupport: roles.some(isSupportRole),
    isManager: roles.some(isManagerRole),

    clienteId: clienteId || null,
    clientId: clienteId || null,

    privacyMode: normalizeBoolean(
      pickFirst(
        rawUser.privacyMode,
        rawUser.privacy_mode,
        profile.privacyMode,
        raw.privacyMode,
        raw.privacy_mode
      ),
      false
    ),

    hasAvatar: Boolean(avatar),
    avatar,
    avatarUrl: avatar,
    photoUrl: avatar,

    avatarUpdatedAt:
      pickFirst(
        rawUser.avatarUpdatedAt,
        rawUser.avatar_updated_at,
        profile.avatarUpdatedAt,
        raw.avatarUpdatedAt,
        raw.avatar_updated_at
      ) || null,

    active,

    darkMode,
    theme: normalizedTheme || null,

    emailVerified,

    twofa_enabled: twofaEnabled,
    twofaEnabled,

    raw: safeClone(rawUser),
  };

  return Object.freeze(normalized);
}

/* =========================================================
   SESSION PAYLOAD
========================================================= */

export function normalizeSessionPayload(payload = null) {
  if (!isObject(payload)) {
    return null;
  }

  const nodes = getNestedAuthNodes(payload);

  const sessionNode =
    pickFirstObject(
      nodes.session,
      nodes.data?.session,
      nodes.payload?.session,
      nodes.result?.session,
      nodes.meta?.session,
      nodes.root.session
    ) || nodes.root;

  const max = AUTH_CONSTANTS?.sessionValueMaxLength || 200;

  const sessionId = normalizeSessionValue(
    pickFirst(
      sessionNode.sessionId,
      sessionNode.session_id,
      sessionNode.id,
      nodes.root.sessionId,
      nodes.root.session_id,
      nodes.data?.sessionId,
      nodes.data?.session_id,
      nodes.payload?.sessionId,
      nodes.payload?.session_id
    ) || "",
    max
  );

  const userId = normalizeSessionValue(
    pickFirst(
      sessionNode.userId,
      sessionNode.user_id,
      nodes.root.userId,
      nodes.root.user_id,
      nodes.root.user?.userId,
      nodes.root.user?.id,
      nodes.data?.userId,
      nodes.data?.user_id,
      nodes.data?.user?.userId,
      nodes.data?.user?.id,
      nodes.payload?.userId,
      nodes.payload?.user_id,
      nodes.payload?.user?.userId,
      nodes.payload?.user?.id
    ) || "",
    max
  );

  return {
    sessionId: sessionId || null,
    userId: userId || null,

    expiresAt:
      pickFirst(
        sessionNode.expiresAt,
        sessionNode.expires_at,
        nodes.root.expiresAt,
        nodes.root.expires_at,
        nodes.root.exp,
        nodes.data?.expiresAt,
        nodes.data?.expires_at
      ) || null,

    createdAt:
      pickFirst(
        sessionNode.createdAt,
        sessionNode.created_at,
        nodes.root.createdAt,
        nodes.root.created_at
      ) || null,

    lastActiveAt:
      pickFirst(
        sessionNode.lastActiveAt,
        sessionNode.last_active_at,
        nodes.root.lastActiveAt,
        nodes.root.last_active_at
      ) || null,

    lastRefreshAt:
      pickFirst(
        sessionNode.lastRefreshAt,
        sessionNode.last_refresh_at,
        nodes.root.lastRefreshAt,
        nodes.root.last_refresh_at
      ) || null,
  };
}

/* =========================================================
   TOKEN EXTRACTORS
========================================================= */

export function extractToken(payload = null) {
  if (!payload) {
    return null;
  }

  const {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    responseData,
    session,
    auth,
    sessionData,
    authData,
    meta,
  } = getNestedAuthNodes(payload);

  return (
    pickFirst(
      root.token,
      root.access_token,
      root.accessToken,
      root.auth_token,
      root.authToken,
      root.jwt,
      root.id_token,
      root.idToken,

      data.token,
      data.access_token,
      data.accessToken,
      data.auth_token,
      data.authToken,
      data.jwt,
      data.id_token,
      data.idToken,

      payloadNode.token,
      payloadNode.access_token,
      payloadNode.accessToken,
      payloadNode.auth_token,
      payloadNode.authToken,
      payloadNode.jwt,

      result.token,
      result.access_token,
      result.accessToken,
      result.auth_token,
      result.authToken,
      result.jwt,

      body.token,
      body.access_token,
      body.accessToken,
      body.auth_token,
      body.authToken,
      body.jwt,

      responseData.token,
      responseData.access_token,
      responseData.accessToken,
      responseData.auth_token,
      responseData.authToken,
      responseData.jwt,

      session.token,
      session.access_token,
      session.accessToken,
      session.auth_token,
      session.authToken,
      session.jwt,

      auth.token,
      auth.access_token,
      auth.accessToken,
      auth.auth_token,
      auth.authToken,
      auth.jwt,

      sessionData.token,
      sessionData.access_token,
      sessionData.accessToken,
      sessionData.jwt,

      authData.token,
      authData.access_token,
      authData.accessToken,
      authData.jwt,

      meta.token,
      meta.accessToken,
      meta.access_token
    ) || null
  );
}

export function extractRefreshToken(payload = null) {
  if (!payload) {
    return null;
  }

  const {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    responseData,
    session,
    auth,
    sessionData,
    authData,
    meta,
  } = getNestedAuthNodes(payload);

  return (
    pickFirst(
      root.refresh_token,
      root.refreshToken,

      data.refresh_token,
      data.refreshToken,

      payloadNode.refresh_token,
      payloadNode.refreshToken,

      result.refresh_token,
      result.refreshToken,

      body.refresh_token,
      body.refreshToken,

      responseData.refresh_token,
      responseData.refreshToken,

      session.refresh_token,
      session.refreshToken,

      auth.refresh_token,
      auth.refreshToken,

      sessionData.refresh_token,
      sessionData.refreshToken,

      authData.refresh_token,
      authData.refreshToken,

      meta.refreshToken,
      meta.refresh_token
    ) || null
  );
}

export function extractTempToken(payload = null) {
  if (!payload) {
    return null;
  }

  const {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    responseData,
    session,
    auth,
    sessionData,
    authData,
    meta,
  } = getNestedAuthNodes(payload);

  return (
    pickFirst(
      root.tempToken,
      root.temp_token,
      root.temporaryToken,
      root.temporary_token,
      root.challengeToken,
      root.challenge_token,
      root.twoFactorToken,
      root.two_factor_token,
      root.mfaToken,
      root.mfa_token,

      data.tempToken,
      data.temp_token,
      data.temporaryToken,
      data.temporary_token,
      data.challengeToken,
      data.challenge_token,
      data.twoFactorToken,
      data.two_factor_token,
      data.mfaToken,
      data.mfa_token,

      payloadNode.tempToken,
      payloadNode.temp_token,
      payloadNode.temporaryToken,
      payloadNode.temporary_token,
      payloadNode.challengeToken,
      payloadNode.challenge_token,

      result.tempToken,
      result.temp_token,
      result.temporaryToken,
      result.temporary_token,
      result.challengeToken,
      result.challenge_token,

      body.tempToken,
      body.temp_token,
      body.temporaryToken,
      body.temporary_token,
      body.challengeToken,
      body.challenge_token,

      responseData.tempToken,
      responseData.temp_token,
      responseData.temporaryToken,
      responseData.temporary_token,
      responseData.challengeToken,
      responseData.challenge_token,

      session.tempToken,
      session.temp_token,
      session.temporaryToken,
      session.temporary_token,

      auth.tempToken,
      auth.temp_token,
      auth.temporaryToken,
      auth.temporary_token,

      sessionData.tempToken,
      sessionData.temp_token,
      sessionData.temporaryToken,
      sessionData.temporary_token,

      authData.tempToken,
      authData.temp_token,
      authData.temporaryToken,
      authData.temporary_token,

      meta.tempToken,
      meta.temp_token
    ) || null
  );
}

/* =========================================================
   2FA
========================================================= */

export function extractRequires2FA(payload = null) {
  if (!payload) {
    return false;
  }

  const {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    responseData,
    session,
    auth,
    sessionData,
    authData,
    meta,
  } = getNestedAuthNodes(payload);

  const status = safeLower(getStatusValue(payload) || "");

  if (
    status === "2fa_required" ||
    status === "mfa_required" ||
    status === "totp_required" ||
    status === "two_factor_required"
  ) {
    return true;
  }

  return Boolean(
    normalizeBoolean(
      pickFirst(
        root.requires2FA,
        root.requires_2fa,
        root.require2FA,
        root.requiresTwoFactor,
        root.twoFactorRequired,
        root.requiresMfa,
        root.requires_mfa,
        root.mfaRequired,

        data.requires2FA,
        data.requires_2fa,
        data.require2FA,
        data.requiresTwoFactor,
        data.twoFactorRequired,
        data.requiresMfa,
        data.requires_mfa,
        data.mfaRequired,

        payloadNode.requires2FA,
        payloadNode.requires_2fa,
        payloadNode.requiresMfa,
        payloadNode.twoFactorRequired,

        result.requires2FA,
        result.requires_2fa,
        result.requiresMfa,
        result.twoFactorRequired,

        body.requires2FA,
        body.requires_2fa,
        body.requiresMfa,
        body.twoFactorRequired,

        responseData.requires2FA,
        responseData.requires_2fa,
        responseData.requiresMfa,
        responseData.twoFactorRequired,

        session.requires2FA,
        session.requires_2fa,
        session.requiresMfa,
        session.twoFactorRequired,

        auth.requires2FA,
        auth.requires_2fa,
        auth.requiresMfa,
        auth.twoFactorRequired,

        sessionData.requires2FA,
        sessionData.requires_2fa,
        sessionData.requiresMfa,
        sessionData.twoFactorRequired,

        authData.requires2FA,
        authData.requires_2fa,
        authData.requiresMfa,
        authData.twoFactorRequired,

        meta.requires2FA,
        meta.requires_2fa,
        meta.requiresMfa
      ),
      false
    )
  );
}

/* =========================================================
   USER EXTRACTOR
========================================================= */

function looksLikeUser(value = null) {
  if (!isObject(value)) return false;

  if (isAuthEnvelope(value) && !hasUsableUserIdentity(value)) {
    return false;
  }

  return Boolean(
    value.id ||
      value.userId ||
      value.user_id ||
      value._id ||
      value.uid ||
      value.username ||
      value.userName ||
      value.user_name ||
      value.email ||
      value.mail ||
      value.phone ||
      value.telefono ||
      value.mobile ||
      value.role ||
      value.rol ||
      value.roles ||
      value.permissions
  );
}

export function extractUser(payload = null) {
  if (!payload) {
    return null;
  }

  const {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    responseData,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedAuthNodes(payload);

  const direct = pickFirstObject(
    root.user,
    root.usuario,
    root.me,
    root.profile,
    root.account,

    data.user,
    data.usuario,
    data.me,
    data.profile,
    data.account,

    payloadNode.user,
    payloadNode.usuario,
    payloadNode.me,
    payloadNode.profile,
    payloadNode.account,

    result.user,
    result.usuario,
    result.me,
    result.profile,
    result.account,

    body.user,
    body.usuario,
    body.me,
    body.profile,
    body.account,

    responseData.user,
    responseData.usuario,
    responseData.me,
    responseData.profile,
    responseData.account,

    session.user,
    session.usuario,
    session.me,
    session.profile,
    session.account,

    auth.user,
    auth.usuario,
    auth.me,
    auth.profile,
    auth.account,

    sessionData.user,
    sessionData.usuario,
    sessionData.me,
    sessionData.profile,
    sessionData.account,

    authData.user,
    authData.usuario,
    authData.me,
    authData.profile,
    authData.account
  );

  if (looksLikeUser(direct)) {
    return normalizeUser(direct);
  }

  if (looksLikeUser(payload) && !isAuthEnvelope(payload)) {
    return normalizeUser(payload);
  }

  const unwrapped = unwrapAuthPayload(payload);

  if (unwrapped !== payload) {
    return extractUser(unwrapped);
  }

  return null;
}

/* =========================================================
   AUTH RESPONSE VALIDATION
========================================================= */

export function validateAuthResponse(response = null, options = {}) {
  const opts = isObject(options) ? options : {};

  const explicitFailure = isExplicitAuthFailure(response);

  if (explicitFailure) {
    const message =
      getResponseMessage(response) ||
      "No se pudo iniciar sesión.";

    throw createAuthNormalizeError(message, {
      status: Number(getStatusValue(response)) || 401,
      code: getErrorCode(response) || "INVALID_CREDENTIALS",
      response,
    });
  }

  const token = extractToken(response);
  const user = extractUser(response);
  const refreshToken = extractRefreshToken(response);
  const requires2FA = extractRequires2FA(response);
  const tempToken = extractTempToken(response);
  const sessionData = normalizeSessionPayload(response);

  const hasToken = Boolean(normalizeString(token));
  const hasUser = hasUsableUserIdentity(user);

  if (requires2FA) {
    if (!tempToken && opts.allow2FAWithoutTempToken !== true) {
      throw createAuthNormalizeError(
        "Se requiere 2FA pero no se recibió token temporal.",
        {
          status: 401,
          code: "MISSING_2FA_TEMP_TOKEN",
          response,
        }
      );
    }

    return {
      ok: true,
      success: true,
      authenticated: false,
      status: "2fa_required",

      token: null,
      user: null,
      refreshToken: null,
      sessionData: null,

      tempToken: tempToken || null,
      requires2FA: true,

      response,
    };
  }

  if (hasToken && hasUser) {
    return {
      ok: true,
      success: true,
      authenticated: true,
      status: "authenticated",

      token: token || null,
      user: user || null,
      refreshToken: refreshToken || null,
      sessionData: sessionData || null,

      tempToken: null,
      requires2FA: false,

      response,
    };
  }

  /*
    Compatibilidad refresh/me:
    - token-only puede ser válido para refresh
    - user-only puede ser válido para /me
    Pero NO se marca authenticated. El login estricto lo rechazará.
  */
  if (hasToken && !hasUser) {
    return {
      ok: true,
      success: true,
      authenticated: false,
      status: "token_only",

      token: token || null,
      user: null,
      refreshToken: refreshToken || null,
      sessionData: sessionData || null,

      tempToken: null,
      requires2FA: false,

      response,
    };
  }

  if (!hasToken && hasUser) {
    return {
      ok: true,
      success: true,
      authenticated: false,
      status: "user_only",

      token: null,
      user: user || null,
      refreshToken: refreshToken || null,
      sessionData: sessionData || null,

      tempToken: null,
      requires2FA: false,

      response,
    };
  }

  throw createAuthNormalizeError(
    "La respuesta del API no contiene una sesión válida.",
    {
      status: 401,
      code: "INVALID_LOGIN_SESSION",
      response,
    }
  );
}

/* =========================================================
   EXPORT DEFAULT
========================================================= */

export default {
  normalizeUser,
  normalizeSessionPayload,

  extractToken,
  extractRefreshToken,
  extractTempToken,
  extractRequires2FA,
  extractUser,

  validateAuthResponse,
};
