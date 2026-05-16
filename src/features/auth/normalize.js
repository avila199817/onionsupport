/* =========================================================
   Onion SPA - Auth Normalize
   Archivo: src/features/auth/normalize.js

   AUTH NORMALIZE · FINAL SIMPLE
   - Normalizador puro de Auth
   - Sin CoreHttp, storage, session, Router, Toast ni side effects
   - token + user usable = authenticated
   - token-only/user-only no autentican
   - Roles reales: admin / user
========================================================= */

import {
  sanitizeUsername,
  slugify,
} from "./helpers.js";

import {
  AUTH_CONSTANTS,
  AUTH_FAILURE_CODES as AUTH_FAILURE_CODE_LIST,
  AUTH_SUCCESS_STATUSES as AUTH_SUCCESS_STATUS_LIST,
  AUTH_2FA_STATUSES as AUTH_2FA_STATUS_LIST,
} from "./constants.js";

/* =========================================================
   META / CONSTANTS
========================================================= */

export const AUTH_NORMALIZE_VERSION = "20.0.0-final";

const DEFAULT_TOKEN_MAX_LENGTH = 8192;
const DEFAULT_SESSION_VALUE_MAX_LENGTH = 200;
const MAX_WALK = 80;
const MAX_SANITIZE_DEPTH = 4;
const MAX_SANITIZE_KEYS = 80;

const ADMIN_ALIASES = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
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

const FAILURE_CODES = new Set([
  ...(Array.isArray(AUTH_FAILURE_CODE_LIST) ? AUTH_FAILURE_CODE_LIST : []),
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "ACCOUNT_LOCKED",
  "ACCOUNT_DISABLED",
  "USER_DISABLED",
  "USER_NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "TOKEN_INVALID",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "SESSION_NOT_FOUND",
  "INVALID_LOGIN_SESSION",
  "LOGIN_FAILED",
  "AUTH_FAILED",
  "AUTH_RESTORE_FAILED",
  "REFRESH_CONTEXT_MISSING",
  "REFRESH_INVALID_SESSION",
  "ME_INVALID_SESSION",
  "ME_USER_MISSING",
  "MISSING_2FA_TEMP_TOKEN",
  "TOKEN_VERSION_MISMATCH",
]);

const FAILURE_STATUSES = new Set([
  "error",
  "failed",
  "failure",
  "invalid",
  "unauthorized",
  "forbidden",
  "expired",
  "session_expired",
  "token_expired",
  "invalid_token",
  "auth_failed",
  "login_failed",
  "not_authenticated",
  "disabled",
  "blocked",
  "locked",
  "revoked",
]);

const SUCCESS_STATUSES = new Set([
  ...(Array.isArray(AUTH_SUCCESS_STATUS_LIST) ? AUTH_SUCCESS_STATUS_LIST : []),
  "ok",
  "success",
  "successful",
  "authenticated",
  "active",
  "valid",
  "token_only",
  "token-only",
  "user_only",
  "user-only",
  "session",
  "refreshed",
]);

const TWO_FACTOR_STATUSES = new Set([
  ...(Array.isArray(AUTH_2FA_STATUS_LIST) ? AUTH_2FA_STATUS_LIST : []),
  "2fa_required",
  "mfa_required",
  "totp_required",
  "otp_required",
  "two_factor_required",
  "verification_required",
  "challenge_required",
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
  "bearer",
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
  "challengeToken",
  "challenge_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
  "otpToken",
  "otp_token",
]);

const USER_KEYS = Object.freeze([
  "user",
  "usuario",
  "me",
  "account",
  "profile",
  "currentUser",
  "current_user",
]);

const SESSION_KEYS = Object.freeze([
  "session",
  "sessionData",
  "session_data",
  "authSession",
  "auth_session",
]);

const NESTED_KEYS = Object.freeze([
  "data",
  "payload",
  "result",
  "body",
  "response",
  "auth",
  "authData",
  "session",
  "sessionData",
]);

const USER_IDENTITY_KEYS = Object.freeze([
  "id",
  "userId",
  "user_id",
  "_id",
  "uuid",
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
]);

const AUTH_ENVELOPE_KEYS = Object.freeze([
  "ok",
  "success",
  "status",
  "statusCode",
  "status_code",
  "error",
  "errorCode",
  "error_code",
  "data",
  "payload",
  "result",
  "body",
  "response",
  "session",
  "sessionData",
  "auth",
  "authData",
]);

const TOKEN_FALSE_VALUES = new Set([
  "",
  "null",
  "undefined",
  "false",
  "true",
  "none",
  "nan",
  "{}",
  "[]",
  "[object object]",
  "\"\"",
  "''",
]);

const DISABLED_STATUS = new Set([
  "disabled",
  "inactive",
  "deleted",
  "blocked",
  "suspended",
  "banned",
  "revoked",
  "archived",
  "desactivado",
  "inactivo",
  "eliminado",
  "bloqueado",
  "suspendido",
]);

const SENSITIVE_RAW_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

/* =========================================================
   BASICS
========================================================= */

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeLower(value = "") {
  return safeText(value).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function hasOwn(obj, key) {
  return Boolean(obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key));
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

function unique(values = []) {
  return [
    ...new Set(
      toArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;

  const key = safeLower(value);
  if (["1", "true", "yes", "on", "si", "sí", "ok", "enabled", "active"].includes(key)) return true;
  if (["0", "false", "no", "off", "disabled", "inactive"].includes(key)) return false;

  return Boolean(fallback);
}

function hasExplicitValue(value) {
  return !(value === undefined || value === null || (typeof value === "string" && value.trim() === ""));
}

function getTokenMaxLength() {
  return safeNumber(AUTH_CONSTANTS?.tokenMaxLength, DEFAULT_TOKEN_MAX_LENGTH) || DEFAULT_TOKEN_MAX_LENGTH;
}

function getSessionValueMaxLength() {
  return safeNumber(AUTH_CONSTANTS?.sessionValueMaxLength, DEFAULT_SESSION_VALUE_MAX_LENGTH) || DEFAULT_SESSION_VALUE_MAX_LENGTH;
}

function safeSessionValue(value = "") {
  const text = safeText(value, "");
  return text ? text.slice(0, getSessionValueMaxLength()) : "";
}

/* =========================================================
   RAW SANITIZER
========================================================= */

function sanitizeRaw(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (depth > MAX_SANITIZE_DEPTH) return "[depth-limit]";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (Array.isArray(value)) return value.slice(0, MAX_SANITIZE_KEYS).map((item) => sanitizeRaw(item, depth + 1, seen));
  if (!isObject(value)) return value;

  try {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
  } catch {}

  const output = {};

  for (const [key, item] of Object.entries(value).slice(0, MAX_SANITIZE_KEYS)) {
    output[key] = SENSITIVE_RAW_KEY_RE.test(key) ? (item ? "***" : item) : sanitizeRaw(item, depth + 1, seen);
  }

  return output;
}

/* =========================================================
   ROLES / PERMISSIONS
========================================================= */

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function extractTrueKeys(map = {}) {
  if (!isObject(map)) return [];
  return Object.entries(map).filter(([, value]) => normalizeBoolean(value, false)).map(([key]) => key);
}

export function normalizeRoleList(value) {
  const raw = Array.isArray(value)
    ? value.flat(Infinity)
    : typeof value === "string"
      ? value.split(/[,\s|]+/)
      : isObject(value)
        ? extractTrueKeys(value)
        : toArray(value);

  const keys = raw
    .flatMap((item) => (typeof item === "string" ? item.split(/[,\s|]+/) : [item]))
    .map(normalizeKey)
    .filter(Boolean);

  if (keys.some((role) => ADMIN_ALIASES.has(role))) return ["admin"];
  if (keys.some((role) => USER_ALIASES.has(role))) return ["user"];
  if (keys.length) return ["user"];

  return [];
}

export function expandRoleAliases(roles = []) {
  return normalizeRoleList(roles);
}

function normalizeCanonicalRole(roles = []) {
  return normalizeRoleList(roles).includes("admin") ? "admin" : "user";
}

function normalizePermissionList(value) {
  if (Array.isArray(value)) {
    return unique(value.flat(Infinity).flatMap((item) => (isObject(item) ? extractTrueKeys(item) : typeof item === "string" ? item.split(/[,\s|]+/) : [item])));
  }

  if (typeof value === "string") return unique(value.split(/[,\s|]+/));
  if (isObject(value)) return unique(extractTrueKeys(value));

  return unique(toArray(value));
}

/* =========================================================
   TOKENS
========================================================= */

function pickTokenFromObject(value = null) {
  if (!isObject(value)) return null;

  for (const key of [...TOKEN_KEYS, ...REFRESH_TOKEN_KEYS, ...TEMP_TOKEN_KEYS, "value", "raw", "data"]) {
    const candidate = value[key];
    if (typeof candidate === "string" || typeof candidate === "number") {
      const text = safeText(candidate, "");
      if (text) return text;
    }
  }

  return null;
}

export function normalizeTokenValue(value = null) {
  if (value === null || value === undefined) return null;

  let token = isObject(value) ? pickTokenFromObject(value) : value;
  if (token === null || token === undefined) return null;

  token = String(token).trim().replace(/^bearer\s+/i, "").trim();

  if (!token || TOKEN_FALSE_VALUES.has(token.toLowerCase()) || /[\r\n\t\s]/.test(token)) return null;

  const max = getTokenMaxLength();
  if (max > 0 && token.length > max) return null;

  return token;
}

export function hasUsableToken(token = null) {
  return Boolean(normalizeTokenValue(token));
}

function redactToken(value = "") {
  const text = safeText(value, "");
  if (!text) return "";
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

/* =========================================================
   ENVELOPES / OBJECT WALK
========================================================= */

function hasTokenLikeKeys(value = {}) {
  if (!isObject(value)) return false;
  return [...TOKEN_KEYS, ...REFRESH_TOKEN_KEYS, ...TEMP_TOKEN_KEYS].some((key) => hasOwn(value, key));
}

export function isAuthEnvelope(value = {}) {
  if (!isObject(value)) return false;
  return AUTH_ENVELOPE_KEYS.some((key) => hasOwn(value, key)) || hasTokenLikeKeys(value);
}

function hasUsableUserIdentity(value = {}) {
  if (!isObject(value)) return false;
  return USER_IDENTITY_KEYS.some((key) => Boolean(safeText(value[key], "")));
}

function hasNestedUserIdentity(value = {}) {
  if (!isObject(value)) return false;
  return Boolean(
    hasUsableUserIdentity(value) ||
      hasUsableUserIdentity(value.raw) ||
      hasUsableUserIdentity(value.profile) ||
      hasUsableUserIdentity(value.account)
  );
}

function looksLikeUser(value = null) {
  if (!isObject(value)) return false;
  if (isAuthEnvelope(value) && !hasNestedUserIdentity(value)) return false;

  return Boolean(
    hasNestedUserIdentity(value) ||
      value.role ||
      value.rol ||
      value.roles ||
      value.permissions ||
      value.permisos ||
      value.claims ||
      value.profile ||
      value.account
  );
}

function collectAuthObjects(payload = null) {
  const output = [];
  const seen = new WeakSet();
  const queue = [payload];

  while (queue.length && output.length < MAX_WALK) {
    const current = queue.shift();
    if (!isObject(current)) continue;

    try {
      if (seen.has(current)) continue;
      seen.add(current);
    } catch {}

    output.push(current);

    for (const key of NESTED_KEYS) {
      if (isObject(current[key])) queue.push(current[key]);
    }

    if (isObject(current.response?.data)) queue.push(current.response.data);
  }

  return output;
}

function pickValueFromObjects(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }

  return undefined;
}

function pickTextFromObjects(objects = [], keys = []) {
  const value = pickValueFromObjects(objects, keys);
  return safeText(value, "");
}

function pickObjectFromObjects(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (isObject(object?.[key])) return object[key];
    }
  }

  return null;
}

function unwrapAuthPayload(payload = null, depth = 0) {
  if (!isObject(payload) || depth > 8) return payload;
  if (looksLikeUser(payload) && hasNestedUserIdentity(payload)) return payload;

  const candidate = first(payload.data, payload.payload, payload.result, payload.body, payload.response?.data, payload.response);
  if (isObject(candidate) && candidate !== payload) return unwrapAuthPayload(candidate, depth + 1);

  return payload;
}

/* =========================================================
   RESPONSE STATUS
========================================================= */

function getStatusValue(payload = null) {
  return pickValueFromObjects(collectAuthObjects(payload), ["status", "statusCode", "status_code", "state", "estado"]);
}

function getErrorCode(payload = null) {
  return pickTextFromObjects(collectAuthObjects(payload), ["code", "errorCode", "error_code", "error"]);
}

function getResponseMessage(payload = null) {
  return pickTextFromObjects(collectAuthObjects(payload), ["message", "mensaje", "errorMessage", "error_message", "detail", "description", "title", "reason", "msg"]);
}

function isExplicitAuthFailure(payload = null) {
  if (!isObject(payload)) return false;

  const objects = collectAuthObjects(payload);
  const statusValue = getStatusValue(payload);
  const statusNumber = Number(statusValue || 0);

  if (Number.isFinite(statusNumber) && statusNumber >= 400) return true;

  const statusText = normalizeKey(statusValue || "");
  if (statusText && FAILURE_STATUSES.has(statusText)) return true;

  const code = getErrorCode(payload).toUpperCase();
  if (code && FAILURE_CODES.has(code)) return true;

  if (objects.some((object) => object?.ok === false || object?.success === false)) return true;
  if (statusText && SUCCESS_STATUSES.has(statusText)) return false;

  return false;
}

function createNormalizeError(message = "La respuesta del API no contiene una sesión válida.", { status = 401, code = "INVALID_LOGIN_SESSION", response = null } = {}) {
  const error = new Error(message);

  error.name = "AuthNormalizeError";
  error.status = status;
  error.statusCode = status;
  error.code = code;
  error.data = { code, message, status };
  error.response = response;
  error.raw = response;

  return error;
}

/* =========================================================
   USER
========================================================= */

function getNodes(rawUser = {}) {
  const user = safeObject(rawUser);
  const raw = safeObject(user.raw);

  return [
    user,
    safeObject(user.profile),
    safeObject(user.account),
    safeObject(user.preferences),
    safeObject(user.settings),
    safeObject(user.meta),
    safeObject(user.claims),
    raw,
    safeObject(raw.profile),
    safeObject(raw.account),
    safeObject(raw.preferences),
    safeObject(raw.settings),
    safeObject(raw.meta),
    safeObject(raw.claims),
  ];
}

function pickFromNodes(nodes = [], keys = []) {
  for (const node of nodes) {
    for (const key of keys) {
      const value = node?.[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }

  return null;
}

function collectRoles(rawUser = {}) {
  const nodes = getNodes(rawUser);
  const values = [];

  for (const node of nodes) {
    values.push(
      node.role,
      node.rol,
      node.userRole,
      node.user_role,
      node.type,
      node.tipo,
      node.userType,
      node.user_type,
      node.perfil,
      node["custom:role"],
      node["https://onion/role"],
      ...toArray(node.roles),
      ...toArray(node.roleList),
      ...toArray(node.role_list),
      ...toArray(node.groups),
      ...toArray(node.authorities)
    );
  }

  if (nodes.some((node) => normalizeBoolean(node.isAdmin, false) || normalizeBoolean(node.admin, false) || normalizeBoolean(node.is_admin, false) || normalizeBoolean(node.isSuperAdmin, false) || normalizeBoolean(node.superAdmin, false))) {
    values.push("admin");
  }

  const roles = normalizeRoleList(values);
  return roles.length ? roles : ["user"];
}

function collectPermissions(rawUser = {}) {
  const nodes = getNodes(rawUser);
  const permissions = [];

  for (const node of nodes) {
    permissions.push(
      ...normalizePermissionList(node.permissions),
      ...normalizePermissionList(node.permisos),
      ...normalizePermissionList(node.scopes),
      ...normalizePermissionList(node.scope),
      ...normalizePermissionList(node.authorities)
    );
  }

  return unique(permissions);
}

function isSafeAvatarUrl(url = "") {
  const value = safeText(url, "");
  const lower = value.toLowerCase();

  if (!value) return false;
  return !(lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("data:text/html") || lower.startsWith("data:application/"));
}

function normalizeAvatarUrl(rawUser = {}) {
  const nodes = getNodes(rawUser);
  const disabled = nodes.some((node) => hasOwn(node, "hasAvatar") && normalizeBoolean(node.hasAvatar, false) === false);
  if (disabled) return null;

  const avatar = safeText(
    pickFromNodes(nodes, ["avatar", "avatarUrl", "avatar_url", "photo", "photoUrl", "photo_url", "image", "imageUrl", "image_url", "profileImage", "profile_image", "picture", "pictureUrl", "picture_url", "thumbnail", "thumbnailUrl", "thumbnail_url"]),
    ""
  );

  return avatar && isSafeAvatarUrl(avatar) ? avatar : null;
}

function normalizeTheme(value = "") {
  const theme = safeLower(value);
  if (["light", "dark", "system"].includes(theme)) return theme;
  return null;
}

function resolveDarkMode(nodes = []) {
  for (const node of nodes) {
    if (hasOwn(node, "darkMode")) return normalizeBoolean(node.darkMode, false);
    if (hasOwn(node, "dark_mode")) return normalizeBoolean(node.dark_mode, false);
  }

  return null;
}

function isUserActive(nodes = []) {
  const status = normalizeKey(pickFromNodes(nodes, ["status", "estado", "state", "accountStatus", "account_status"]) || "");
  if (DISABLED_STATUS.has(status)) return false;

  const disabled = nodes.some((node) => node.disabled === true || node.isDisabled === true || node.deleted === true || node.isDeleted === true || node.blocked === true || node.isBlocked === true || node.banned === true || node.suspended === true || node.revoked === true || node.archived === true);
  if (disabled) return false;

  const activeValue = pickFromNodes(nodes, ["active", "is_active", "isActive", "enabled", "isEnabled"]);
  return hasExplicitValue(activeValue) ? normalizeBoolean(activeValue, true) : true;
}

export function normalizeUser(rawUser = null) {
  if (!isObject(rawUser)) return null;
  if (isAuthEnvelope(rawUser) && !hasNestedUserIdentity(rawUser)) return null;
  if (!hasNestedUserIdentity(rawUser)) return null;

  const nodes = getNodes(rawUser);

  const id = pickFromNodes(nodes, ["id", "userId", "user_id", "uuid", "uid", "sub", "_id"]);
  const userId = pickFromNodes(nodes, ["userId", "user_id", "id", "uuid", "uid", "sub", "_id"]);
  const email = safeLower(pickFromNodes(nodes, ["email", "mail", "emailLower", "email_lower"]) || "");
  const phone = pickFromNodes(nodes, ["phone", "telefono", "mobile", "cellphone"]);
  const rawUsername = first(pickFromNodes(nodes, ["username", "userName", "user_name", "nick", "alias", "login", "slug"]), email ? email.split("@")[0] : "", phone, id, userId);
  const username = sanitizeUsername(safeText(rawUsername, ""));
  const displayName = safeText(pickFromNodes(nodes, ["name", "nombre", "fullName", "full_name", "displayName", "display_name"]) || username || email || phone || id || userId || "Usuario", "Usuario");
  const roles = collectRoles(rawUser);
  const role = normalizeCanonicalRole(roles);
  const permissions = collectPermissions(rawUser);
  const slug = safeText(pickFromNodes(nodes, ["slug"]) || slugify(username || displayName || email || String(userId || id || "usuario")), "usuario");
  const avatar = normalizeAvatarUrl(rawUser);
  const theme = normalizeTheme(pickFromNodes(nodes, ["theme", "mode", "appearance"]) || "");
  const lang = safeText(pickFromNodes(nodes, ["lang", "language", "locale"]) || "");
  const clienteId = pickFromNodes(nodes, ["clienteId", "clientId", "cliente_id", "customerId", "customer_id"]);
  const tokenVersion = pickFromNodes(nodes, ["tokenVersion", "token_version", "tv"]);
  const emailVerified = normalizeBoolean(pickFromNodes(nodes, ["emailVerified", "email_verified", "verified"]), false);
  const twofaEnabled = normalizeBoolean(pickFromNodes(nodes, ["twofa_enabled", "twofaEnabled", "twoFactorEnabled", "mfaEnabled", "mfa_enabled"]), false);
  const darkMode = resolveDarkMode(nodes);
  const active = isUserActive(nodes);

  return {
    id: id || userId || null,
    userId: userId || id || null,
    user_id: userId || id || null,
    uid: userId || id || null,
    sub: userId || id || null,

    username,
    userName: username,
    user_name: username,
    usernameLower: username || null,
    username_lower: username || null,
    slug,

    name: displayName,
    nombre: displayName,
    fullName: displayName,
    displayName,

    email,
    emailLower: email,
    email_lower: email,

    phone: phone || null,
    telefono: phone || null,
    mobile: phone || null,

    role,
    rol: role,
    roles,

    permissions,
    permisos: permissions,

    isAdmin: role === "admin",
    admin: role === "admin",
    isSupport: false,
    isManager: false,
    isClient: false,

    clienteId: clienteId || null,
    clientId: clienteId || null,
    customerId: clienteId || null,

    privacyMode: normalizeBoolean(pickFromNodes(nodes, ["privacyMode", "privacy_mode"]), false),

    hasAvatar: Boolean(avatar),
    avatar,
    avatarUrl: avatar,
    avatar_url: avatar,
    photoUrl: avatar,
    picture: avatar,
    avatarUpdatedAt: pickFromNodes(nodes, ["avatarUpdatedAt", "avatar_updated_at"]) || null,

    active,
    status: safeText(pickFromNodes(nodes, ["status", "estado", "state"]) || "") || null,

    darkMode,
    theme,
    mode: theme,
    appearance: theme,

    lang: lang || null,
    language: lang || null,
    locale: lang || null,

    emailVerified,
    twofa_enabled: twofaEnabled,
    twofaEnabled,
    twoFactorEnabled: twofaEnabled,
    mfaEnabled: twofaEnabled,

    tokenVersion: tokenVersion ?? null,
    token_version: tokenVersion ?? null,
    tv: tokenVersion ?? null,

    preferences: sanitizeRaw(safeObject(rawUser.preferences)) || {},
    settings: sanitizeRaw(safeObject(rawUser.settings)) || {},
    profile: sanitizeRaw(safeObject(rawUser.profile)) || {},
    account: sanitizeRaw(safeObject(rawUser.account)) || {},
    meta: sanitizeRaw(safeObject(rawUser.meta)) || {},
    claims: sanitizeRaw(safeObject(rawUser.claims)) || {},
    raw: sanitizeRaw(rawUser),
  };
}

/* =========================================================
   USER / SESSION EXTRACTORS
========================================================= */

export function extractUser(payload = null) {
  if (!payload) return null;

  const objects = collectAuthObjects(payload);

  for (const object of objects) {
    const candidate = first(...USER_KEYS.map((key) => object?.[key]));

    if (looksLikeUser(candidate)) {
      const normalized = normalizeUser(candidate);
      if (normalized) return normalized;
    }
  }

  if (looksLikeUser(payload)) {
    const normalized = normalizeUser(payload);
    if (normalized) return normalized;
  }

  const unwrapped = unwrapAuthPayload(payload);
  if (unwrapped && unwrapped !== payload) return extractUser(unwrapped);

  return null;
}

export function normalizeSessionPayload(payload = null) {
  if (!isObject(payload)) return null;

  const objects = collectAuthObjects(payload);
  const sessionNode = pickObjectFromObjects(objects, SESSION_KEYS) || {};
  const user = extractUser(payload);

  const sessionId = safeSessionValue(first(sessionNode.sessionId, sessionNode.session_id, sessionNode.sid, sessionNode.id, pickValueFromObjects(objects, ["sessionId", "session_id", "sid"])) || "");
  const userId = safeSessionValue(first(sessionNode.sessionUserId, sessionNode.session_user_id, sessionNode.userId, sessionNode.user_id, sessionNode.uid, sessionNode.sub, pickValueFromObjects(objects, ["sessionUserId", "session_user_id", "userId", "user_id", "uid", "sub"]), user?.userId, user?.id, user?.email) || "");
  const expiresAt = first(sessionNode.expiresAt, sessionNode.expires_at, sessionNode.refreshExpiresAt, sessionNode.refresh_expires_at, sessionNode.exp, pickValueFromObjects(objects, ["expiresAt", "expires_at", "refreshExpiresAt", "refresh_expires_at", "exp", "expiration", "expires"])) || null;
  const tokenVersion = first(sessionNode.tokenVersion, sessionNode.token_version, sessionNode.tv, pickValueFromObjects(objects, ["tokenVersion", "token_version", "tv"]), user?.tokenVersion, user?.token_version, user?.tv) ?? null;

  if (!sessionId && !userId && !expiresAt && tokenVersion === null) return null;

  return {
    id: sessionId || null,
    sessionId: sessionId || null,
    session_id: sessionId || null,
    sid: sessionId || null,
    userId: userId || null,
    user_id: userId || null,
    sessionUserId: userId || null,
    session_user_id: userId || null,
    expiresAt,
    expires_at: expiresAt,
    refreshExpiresAt: first(sessionNode.refreshExpiresAt, sessionNode.refresh_expires_at, expiresAt) || null,
    refresh_expires_at: first(sessionNode.refreshExpiresAt, sessionNode.refresh_expires_at, expiresAt) || null,
    createdAt: first(sessionNode.createdAt, sessionNode.created_at, pickValueFromObjects(objects, ["createdAt", "created_at"])) || null,
    lastActiveAt: first(sessionNode.lastActiveAt, sessionNode.last_active_at, pickValueFromObjects(objects, ["lastActiveAt", "last_active_at"])) || null,
    lastRefreshAt: first(sessionNode.lastRefreshAt, sessionNode.last_refresh_at, pickValueFromObjects(objects, ["lastRefreshAt", "last_refresh_at"])) || null,
    tokenVersion,
    token_version: tokenVersion,
    tv: tokenVersion,
  };
}

export function extractToken(payload = null) {
  if (!payload) return null;
  return normalizeTokenValue(pickValueFromObjects(collectAuthObjects(payload), TOKEN_KEYS));
}

export function extractRefreshToken(payload = null) {
  if (!payload) return null;
  return normalizeTokenValue(pickValueFromObjects(collectAuthObjects(payload), REFRESH_TOKEN_KEYS));
}

export function extractTempToken(payload = null) {
  if (!payload) return null;
  return normalizeTokenValue(pickValueFromObjects(collectAuthObjects(payload), TEMP_TOKEN_KEYS));
}

export function extractRequires2FA(payload = null) {
  if (!payload) return false;

  const objects = collectAuthObjects(payload);
  const status = normalizeKey(getStatusValue(payload) || "");

  if (TWO_FACTOR_STATUSES.has(status)) return true;

  const boolKeys = [
    "requires2FA",
    "requires_2fa",
    "require2FA",
    "require_2fa",
    "requiresTwoFactor",
    "twoFactorRequired",
    "requiresMfa",
    "requires_mfa",
    "mfaRequired",
    "mfa_required",
    "totpRequired",
    "totp_required",
    "otpRequired",
    "otp_required",
    "challengeRequired",
    "challenge_required",
  ];

  return objects.some((object) => boolKeys.some((key) => normalizeBoolean(object?.[key], false)));
}

/* =========================================================
   AUTH VALIDATION
========================================================= */

export function validateAuthResponse(response = null, options = {}) {
  const opts = isObject(options) ? options : {};

  if (isExplicitAuthFailure(response)) {
    throw createNormalizeError(getResponseMessage(response) || "No se pudo iniciar sesión.", {
      status: Number(getStatusValue(response)) || 401,
      code: getErrorCode(response) || "INVALID_CREDENTIALS",
      response,
    });
  }

  const token = extractToken(response);
  const refreshToken = extractRefreshToken(response);
  const tempToken = extractTempToken(response);
  const user = extractUser(response);
  const sessionData = normalizeSessionPayload(response);
  const requires2FA = extractRequires2FA(response);

  const hasToken = Boolean(token);
  const hasUser = Boolean(user && user.active !== false);
  const mode = normalizeKey(opts.mode || opts.flow || opts.type || "generic");

  const requireAuthenticated = opts.requireAuthenticated === true || mode === "login" || mode === "authenticate";
  const requireToken = opts.requireToken === true || mode === "login" || mode === "refresh";
  const requireUser = opts.requireUser === true || mode === "login" || mode === "me";

  if (requires2FA) {
    if (!tempToken && opts.allow2FAWithoutTempToken !== true) {
      throw createNormalizeError("Se requiere 2FA pero no se recibió token temporal.", {
        status: 401,
        code: "MISSING_2FA_TEMP_TOKEN",
        response,
      });
    }

    return {
      ok: true,
      success: true,
      authenticated: false,
      status: "2fa_required",
      token: null,
      accessToken: null,
      access_token: null,
      user: user || null,
      refreshToken: null,
      refresh_token: null,
      session: null,
      sessionData: null,
      tempToken: tempToken || null,
      temp_token: tempToken || null,
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
      token,
      accessToken: token,
      access_token: token,
      user,
      usuario: user,
      me: user,
      refreshToken: refreshToken || null,
      refresh_token: refreshToken || null,
      session: sessionData || null,
      sessionData: sessionData || null,
      tempToken: null,
      temp_token: null,
      requires2FA: false,
      response,
    };
  }

  if (hasToken && !hasUser && !requireAuthenticated && !requireUser) {
    return {
      ok: true,
      success: true,
      authenticated: false,
      status: "token_only",
      token,
      accessToken: token,
      access_token: token,
      user: null,
      refreshToken: refreshToken || null,
      refresh_token: refreshToken || null,
      session: sessionData || null,
      sessionData: sessionData || null,
      tempToken: null,
      temp_token: null,
      requires2FA: false,
      response,
    };
  }

  if (!hasToken && hasUser && !requireAuthenticated && !requireToken) {
    return {
      ok: true,
      success: true,
      authenticated: false,
      status: "user_only",
      token: null,
      accessToken: null,
      access_token: null,
      user,
      usuario: user,
      me: user,
      refreshToken: refreshToken || null,
      refresh_token: refreshToken || null,
      session: sessionData || null,
      sessionData: sessionData || null,
      tempToken: null,
      temp_token: null,
      requires2FA: false,
      response,
    };
  }

  throw createNormalizeError("La respuesta del API no contiene una sesión válida.", {
    status: 401,
    code: requireAuthenticated ? "INVALID_LOGIN_SESSION" : requireToken ? "TOKEN_MISSING" : requireUser ? "USER_MISSING" : "INVALID_AUTH_RESPONSE",
    response,
  });
}

export function normalizeAuthResponse(response = null, options = {}) {
  try {
    const validated = validateAuthResponse(response, options);

    return {
      ...validated,
      valid: true,
      explicitFailure: false,
      error: null,
      code: getErrorCode(response) || "",
      message: getResponseMessage(response) || "",
    };
  } catch (error) {
    const tempToken = extractTempToken(response);

    return {
      ok: false,
      success: false,
      authenticated: false,
      status: error?.data?.status || error?.status || "invalid",
      code: error?.code || error?.data?.code || getErrorCode(response) || "INVALID_LOGIN_SESSION",
      message: error?.message || getResponseMessage(response) || "La respuesta del API no contiene una sesión válida.",
      token: null,
      accessToken: null,
      access_token: null,
      user: extractUser(response),
      refreshToken: null,
      refresh_token: null,
      session: null,
      sessionData: null,
      tempToken: tempToken || null,
      temp_token: tempToken || null,
      requires2FA: extractRequires2FA(response),
      valid: false,
      explicitFailure: isExplicitAuthFailure(response),
      error,
      response,
    };
  }
}

export function normalizeAuthPayload(response = null, options = {}) {
  return normalizeAuthResponse(response, options);
}

/* =========================================================
   DEBUG
========================================================= */

export function getAuthNormalizeSnapshot(response = null) {
  const token = extractToken(response);
  const refreshToken = extractRefreshToken(response);
  const tempToken = extractTempToken(response);
  const user = extractUser(response);
  const normalized = normalizeAuthResponse(response, { allow2FAWithoutTempToken: true });

  return {
    version: AUTH_NORMALIZE_VERSION,
    explicitFailure: isExplicitAuthFailure(response),
    status: getStatusValue(response) || null,
    normalizedStatus: normalized.status || null,
    code: getErrorCode(response) || null,
    message: getResponseMessage(response) || null,
    valid: Boolean(normalized.valid),
    authenticated: Boolean(normalized.authenticated),
    hasToken: Boolean(token),
    tokenPreview: token ? redactToken(token) : null,
    hasRefreshToken: Boolean(refreshToken),
    refreshTokenPreview: refreshToken ? redactToken(refreshToken) : null,
    hasTempToken: Boolean(tempToken),
    tempTokenPreview: tempToken ? redactToken(tempToken) : null,
    requires2FA: extractRequires2FA(response),
    hasUser: Boolean(user),
    user: user
      ? {
          id: user.id || null,
          userId: user.userId || null,
          username: user.username || null,
          email: user.email || null,
          role: user.role || null,
          roles: user.roles || [],
          isAdmin: Boolean(user.isAdmin),
          hasAvatar: Boolean(user.hasAvatar),
          theme: user.theme || null,
          darkMode: user.darkMode,
        }
      : null,
    sessionData: normalizeSessionPayload(response),
    policy: {
      pureNormalizer: true,
      ownFetch: false,
      ownStorage: false,
      ownSession: false,
      ownRouter: false,
      ownToast: false,
      roles: ["admin", "user"],
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  AUTH_NORMALIZE_VERSION,

  normalizeUser,
  normalizeSessionPayload,

  normalizeRoleList,
  expandRoleAliases,

  normalizeTokenValue,
  hasUsableToken,
  isAuthEnvelope,

  extractToken,
  extractRefreshToken,
  extractTempToken,
  extractRequires2FA,
  extractUser,

  validateAuthResponse,
  normalizeAuthResponse,
  normalizeAuthPayload,

  getAuthNormalizeSnapshot,
};
