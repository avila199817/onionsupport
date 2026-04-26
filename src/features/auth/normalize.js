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

    if (["1", "true", "yes", "on", "si", "sí"].includes(key)) {
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
    user.profile,

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
    raw.profile,

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

  const raw = getNestedRawUser(rawUser);
  const profile = isObject(rawUser.profile) ? rawUser.profile : {};
  const account = isObject(rawUser.account) ? rawUser.account : {};
  const preferences = isObject(rawUser.preferences) ? rawUser.preferences : {};
  const settings = isObject(rawUser.settings) ? rawUser.settings : {};

  const username = sanitizeUsername(
    pickFirst(
      rawUser.username,
      rawUser.userName,
      rawUser.user_name,
      rawUser.nick,
      rawUser.alias,
      rawUser.login,
      rawUser.slug,
      rawUser.email,

      profile.username,
      profile.userName,
      profile.nick,
      profile.alias,
      profile.email,

      account.username,
      account.userName,
      account.email,

      raw.username,
      raw.userName,
      raw.user_name,
      raw.nick,
      raw.alias,
      raw.login,
      raw.slug,
      raw.email,

      raw?.profile?.username,
      raw?.profile?.userName,
      raw?.profile?.email
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

      rawUser.username,
      rawUser.email,
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
      slugify(username || displayName || "usuario")
    )
  );

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

  const id = pickFirst(
    rawUser.id,
    rawUser.userId,
    rawUser.user_id,
    rawUser.uuid,
    rawUser._id,

    profile.id,
    profile.userId,
    profile.user_id,

    account.id,
    account.userId,
    account.user_id,

    raw.id,
    raw.userId,
    raw.user_id,
    raw.uuid,
    raw._id,

    raw?.profile?.id,
    raw?.profile?.userId,
    raw?.profile?.user_id
  );

  const userId = pickFirst(
    rawUser.userId,
    rawUser.id,
    rawUser.user_id,
    rawUser.uuid,
    rawUser._id,

    profile.userId,
    profile.id,
    profile.user_id,

    account.userId,
    account.id,
    account.user_id,

    raw.userId,
    raw.id,
    raw.user_id,
    raw.uuid,
    raw._id,

    raw?.profile?.userId,
    raw?.profile?.id,
    raw?.profile?.user_id
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
    userId: userId || null,

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

  const sessionNode =
    payload.session ??
    payload.data?.session ??
    payload.payload?.session ??
    payload.result?.session ??
    payload.meta?.session ??
    payload;

  const max = AUTH_CONSTANTS?.sessionValueMaxLength || 200;

  const sessionId = normalizeSessionValue(
    pickFirst(
      sessionNode.sessionId,
      sessionNode.session_id,
      sessionNode.id,
      payload.sessionId,
      payload.session_id,
      payload.data?.sessionId,
      payload.data?.session_id,
      payload.payload?.sessionId,
      payload.payload?.session_id
    ) || "",
    max
  );

  const userId = normalizeSessionValue(
    pickFirst(
      sessionNode.userId,
      sessionNode.user_id,
      payload.userId,
      payload.user_id,
      payload.user?.userId,
      payload.user?.id,
      payload.data?.userId,
      payload.data?.user_id,
      payload.data?.user?.userId,
      payload.data?.user?.id,
      payload.payload?.userId,
      payload.payload?.user_id,
      payload.payload?.user?.userId,
      payload.payload?.user?.id
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
        payload.expiresAt,
        payload.expires_at,
        payload.exp,
        payload.data?.expiresAt,
        payload.data?.expires_at
      ) || null,

    createdAt:
      pickFirst(
        sessionNode.createdAt,
        sessionNode.created_at,
        payload.createdAt,
        payload.created_at
      ) || null,

    lastActiveAt:
      pickFirst(
        sessionNode.lastActiveAt,
        sessionNode.last_active_at,
        payload.lastActiveAt,
        payload.last_active_at
      ) || null,

    lastRefreshAt:
      pickFirst(
        sessionNode.lastRefreshAt,
        sessionNode.last_refresh_at,
        payload.lastRefreshAt,
        payload.last_refresh_at
      ) || null,
  };
}

/* =========================================================
   ENVELOPE HELPERS
========================================================= */

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

function looksLikeUser(value = null) {
  if (!isObject(value)) return false;

  return Boolean(
    value.id ||
      value.userId ||
      value.user_id ||
      value.username ||
      value.userName ||
      value.email ||
      value.name ||
      value.nombre ||
      value.role ||
      value.rol ||
      value.roles ||
      value.permissions
  );
}

/* =========================================================
   TOKEN EXTRACTORS
========================================================= */

export function extractToken(payload = null) {
  if (!payload) {
    return null;
  }

  return (
    pickFirst(
      payload.token,
      payload.access_token,
      payload.accessToken,
      payload.jwt,
      payload.id_token,
      payload.idToken,

      payload.data?.token,
      payload.data?.access_token,
      payload.data?.accessToken,
      payload.data?.jwt,
      payload.data?.id_token,
      payload.data?.idToken,

      payload.payload?.token,
      payload.payload?.access_token,
      payload.payload?.accessToken,
      payload.payload?.jwt,

      payload.result?.token,
      payload.result?.access_token,
      payload.result?.accessToken,
      payload.result?.jwt,

      payload.session?.token,
      payload.session?.access_token,
      payload.session?.accessToken,

      payload.meta?.token,
      payload.meta?.accessToken
    ) || null
  );
}

export function extractRefreshToken(payload = null) {
  if (!payload) {
    return null;
  }

  return (
    pickFirst(
      payload.refresh_token,
      payload.refreshToken,

      payload.data?.refresh_token,
      payload.data?.refreshToken,

      payload.payload?.refresh_token,
      payload.payload?.refreshToken,

      payload.result?.refresh_token,
      payload.result?.refreshToken,

      payload.session?.refresh_token,
      payload.session?.refreshToken,

      payload.meta?.refreshToken,
      payload.meta?.refresh_token
    ) || null
  );
}

export function extractTempToken(payload = null) {
  if (!payload) {
    return null;
  }

  return (
    pickFirst(
      payload.tempToken,
      payload.temp_token,
      payload.challengeToken,
      payload.challenge_token,

      payload.data?.tempToken,
      payload.data?.temp_token,
      payload.data?.challengeToken,
      payload.data?.challenge_token,

      payload.payload?.tempToken,
      payload.payload?.temp_token,

      payload.meta?.tempToken,
      payload.meta?.temp_token
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

  const status = safeLower(
    pickFirst(
      payload.status,
      payload.data?.status,
      payload.payload?.status,
      payload.result?.status
    ) || ""
  );

  if (
    status === "2fa_required" ||
    status === "mfa_required" ||
    status === "totp_required"
  ) {
    return true;
  }

  return Boolean(
    normalizeBoolean(
      pickFirst(
        payload.requires2FA,
        payload.requires_2fa,
        payload.requiresTwoFactor,
        payload.requiresMfa,
        payload.requires_mfa,

        payload.data?.requires2FA,
        payload.data?.requires_2fa,
        payload.data?.requiresTwoFactor,
        payload.data?.requiresMfa,
        payload.data?.requires_mfa,

        payload.payload?.requires2FA,
        payload.payload?.requires_2fa,
        payload.payload?.requiresMfa
      ),
      false
    )
  );
}

/* =========================================================
   USER EXTRACTOR
========================================================= */

export function extractUser(payload = null) {
  if (!payload) {
    return null;
  }

  if (looksLikeUser(payload)) {
    return normalizeUser(payload);
  }

  const direct = pickFirst(
    payload.user,
    payload.usuario,
    payload.me,
    payload.profile,
    payload.account,

    payload.data?.user,
    payload.data?.usuario,
    payload.data?.me,
    payload.data?.profile,
    payload.data?.account,

    payload.payload?.user,
    payload.payload?.usuario,
    payload.payload?.me,
    payload.payload?.profile,
    payload.payload?.account,

    payload.result?.user,
    payload.result?.usuario,
    payload.result?.me,
    payload.result?.profile,
    payload.result?.account,

    payload.response?.user,
    payload.response?.usuario,
    payload.response?.me,
    payload.response?.profile,
    payload.response?.account
  );

  if (looksLikeUser(direct)) {
    return normalizeUser(direct);
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

export function validateAuthResponse(response = null) {
  const token = extractToken(response);
  const user = extractUser(response);
  const refreshToken = extractRefreshToken(response);
  const requires2FA = extractRequires2FA(response);
  const tempToken = extractTempToken(response);
  const sessionData = normalizeSessionPayload(response);

  if (requires2FA && tempToken) {
    return {
      status: "2fa_required",
      token: null,
      user: null,
      refreshToken: null,
      sessionData: null,
      tempToken,
      response,
    };
  }

  if (!token && !user) {
    throw new Error(
      "La respuesta del API no contiene una sesión válida."
    );
  }

  return {
    status: "authenticated",
    token: token || null,
    user: user || null,
    refreshToken: refreshToken || null,
    sessionData: sessionData || null,
    tempToken: null,
    response,
  };
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
