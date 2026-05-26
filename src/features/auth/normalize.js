/* =========================================================
   Onion Support - Auth Normalize
   Archivo: /src/features/auth/normalize.js

   Responsabilidad:
   - Normalizador puro mínimo de Auth.
   - Sin CoreHttp.
   - Sin Storage.
   - Sin Session.
   - Sin Router.
   - Sin Toast.
   - Sin side effects.
   - Sin 2FA/MFA/OTP.
   - Roles únicos: admin / user.
   - User inválido si disabled/deleted/archived/active=false.
   - Auth estricta: access token usable + user usable.
   - Token sin user = no authenticated salvo modo token-only explícito.
   - User sin token = no authenticated salvo modo user-only explícito.
   - No fabricar slug si no existe slug real.
========================================================= */

import {
  sanitizeUsername,
} from "./helpers.js";

import {
  AUTH_CONSTANTS,
  AUTH_FAILURE_CODES as AUTH_FAILURE_CODE_LIST,
  AUTH_SUCCESS_STATUSES as AUTH_SUCCESS_STATUS_LIST,
} from "./constants.js";

export const AUTH_NORMALIZE_VERSION = "auth.normalize.v2";

const DEFAULT_TOKEN_MAX_LENGTH = 8192;
const DEFAULT_SESSION_VALUE_MAX_LENGTH = 200;

const VALID_ROLES = Object.freeze(["admin", "user"]);

const TOKEN_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
]);

const REFRESH_TOKEN_KEYS = Object.freeze([
  "refreshToken",
  "refresh_token",
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
]);

const INVALID_USER_STATUSES = new Set([
  "disabled",
  "inactive",
  "deleted",
  "archived",
  "revoked",
  "blocked",
  "banned",
  "suspended",
  "desactivado",
  "inactivo",
  "eliminado",
  "archivado",
  "bloqueado",
  "suspendido",
]);

const FAILURE_CODES = new Set([
  ...(Array.isArray(AUTH_FAILURE_CODE_LIST) ? AUTH_FAILURE_CODE_LIST : []),

  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",

  "ACCOUNT_DISABLED",
  "USER_DISABLED",
  "USER_INVALID",
  "USER_INACTIVE",
  "USER_NOT_AVAILABLE",
  "USER_EMAIL_UNVERIFIED",

  "UNAUTHORIZED",
  "FORBIDDEN",

  "TOKEN_INVALID",
  "INVALID_TOKEN",
  "INVALID_TOKEN_FORMAT",
  "TOKEN_EXPIRED",
  "TOKEN_MISSING",
  "MISSING_TOKEN",
  "TOKEN_VERSION_MISMATCH",

  "SESSION_REQUIRED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "SESSION_INVALID",
  "SESSION_NOT_FOUND",
  "SESSION_USER_MISMATCH",
  "SESSION_ID_MISMATCH",
  "SESSION_TOKEN_VERSION_MISMATCH",
  "SESSION_TOKEN_MISMATCH",

  "INVALID_REFRESH_TOKEN",

  "LOGIN_FAILED",
  "AUTH_FAILED",
  "AUTH_RESTORE_FAILED",
]);

const SUCCESS_STATUSES = new Set([
  ...(Array.isArray(AUTH_SUCCESS_STATUS_LIST) ? AUTH_SUCCESS_STATUS_LIST : []),

  "ok",
  "success",
  "authenticated",
  "active",
  "valid",
  "session",
  "restored",
  "refreshed",
]);

const BAD_TOKEN_VALUES = new Set([
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

const SENSITIVE_USER_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "hash",
  "salt",
  "passwordmeta",

  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "refreshtokenhash",
  "refresh_token_hash",
  "idtoken",
  "id_token",

  "resettoken",
  "reset_token",
  "activationtoken",
  "activation_token",

  "authorization",
  "authheader",

  "secret",
  "secrets",
  "code",
  "codes",
  "backupcodes",
  "backup_codes",

  "otp",
  "otpcode",
  "totp",
  "mfa",
  "twofa_secret",
  "twofasecret",
  "totpsecret",

  "sas",
  "connectionstring",
  "connection_string",

  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

/* =========================================================
   BASICS
========================================================= */

function safeText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeLower(value = "") {
  return safeText(value, "").toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function clone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function pick(source = {}, keys = []) {
  if (!isObject(source)) return undefined;

  for (const key of keys) {
    if (
      source[key] !== undefined &&
      source[key] !== null &&
      source[key] !== ""
    ) {
      return source[key];
    }
  }

  return undefined;
}

function nested(payload = {}) {
  const source = isObject(payload) ? payload : {};

  return [
    source,
    isObject(source.data) ? source.data : null,
    isObject(source.payload) ? source.payload : null,
    isObject(source.result) ? source.result : null,
    isObject(source.body) ? source.body : null,
    isObject(source.response?.data) ? source.response.data : null,
    isObject(source.auth) ? source.auth : null,
    isObject(source.session) ? source.session : null,
    isObject(source.sessionData) ? source.sessionData : null,
  ].filter(Boolean);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const clean = safeLower(value);

  if (["true", "yes", "si", "sí", "on", "ok"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

function tokenMaxLength() {
  return safeNumber(AUTH_CONSTANTS?.tokenMaxLength, DEFAULT_TOKEN_MAX_LENGTH) ||
    DEFAULT_TOKEN_MAX_LENGTH;
}

function sessionValueMaxLength() {
  return safeNumber(
    AUTH_CONSTANTS?.sessionValueMaxLength,
    DEFAULT_SESSION_VALUE_MAX_LENGTH
  ) || DEFAULT_SESSION_VALUE_MAX_LENGTH;
}

function redact(value = "") {
  return safeText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = safeLower(value);

  return VALID_ROLES.includes(role) ? role : "";
}

function defaultRole(value = "") {
  return normalizeRole(value) || "user";
}

export function normalizeRoleList(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s|]+/)
      : value
        ? [value]
        : [];

  const roles = raw.map(normalizeRole).filter(Boolean);

  if (roles.includes("admin")) return ["admin"];
  if (roles.includes("user")) return ["user"];

  return [];
}

export function expandRoleAliases(roles = []) {
  return normalizeRoleList(roles);
}

/* =========================================================
   TOKENS
========================================================= */

function unwrapToken(value = null) {
  if (value === null || value === undefined) return null;

  if (isObject(value)) {
    return value.token ||
      value.accessToken ||
      value.access_token ||
      value.value ||
      null;
  }

  return value;
}

export function normalizeTokenValue(value = null) {
  const candidate = unwrapToken(value);

  if (candidate === null || candidate === undefined) return null;

  const token = String(candidate)
    .normalize("NFKC")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) return null;
  if (BAD_TOKEN_VALUES.has(token.toLowerCase())) return null;
  if (/\s/.test(token)) return null;
  if (token.length > tokenMaxLength()) return null;

  return token;
}

export function hasUsableToken(token = null) {
  return Boolean(normalizeTokenValue(token));
}

function normalizeSessionValue(value = null) {
  if (value === null || value === undefined) return null;

  const output = String(value)
    .normalize("NFKC")
    .trim()
    .replace(/[\r\n\t]/g, "");

  if (!output) return null;
  if (BAD_TOKEN_VALUES.has(output.toLowerCase())) return null;
  if (output.length > sessionValueMaxLength()) return null;

  return output;
}

/* =========================================================
   ENVELOPES
========================================================= */

export function isAuthEnvelope(value = {}) {
  if (!isObject(value)) return false;

  return Boolean(
    value.ok !== undefined ||
      value.success !== undefined ||
      value.status !== undefined ||
      value.error !== undefined ||
      value.data !== undefined ||
      value.payload !== undefined ||
      value.auth !== undefined ||
      value.session !== undefined ||
      TOKEN_KEYS.some((key) => value[key] !== undefined) ||
      REFRESH_TOKEN_KEYS.some((key) => value[key] !== undefined) ||
      USER_KEYS.some((key) => value[key] !== undefined) ||
      SESSION_KEYS.some((key) => value[key] !== undefined)
  );
}

function statusValue(payload = null) {
  for (const item of nested(payload)) {
    const value = item.status || item.estado || item.state;
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return "";
}

function errorCode(payload = null) {
  for (const item of nested(payload)) {
    const value = item.code || item.errorCode || item.error_code || item.error;
    if (value !== undefined && value !== null && value !== "") {
      return safeText(value, "");
    }
  }

  return "";
}

function responseMessage(payload = null) {
  for (const item of nested(payload)) {
    const value =
      item.message ||
      item.mensaje ||
      item.detail ||
      item.description ||
      item.title ||
      item.errorMessage ||
      item.error_message;

    if (value !== undefined && value !== null && value !== "") {
      return redact(value);
    }
  }

  return "";
}

function explicitFailure(payload = null) {
  if (!isObject(payload)) return false;

  for (const item of nested(payload)) {
    const statusNumber = Number(item.statusCode || item.status_code || item.status || 0);

    if (Number.isFinite(statusNumber) && statusNumber >= 400) return true;
    if (item.ok === false || item.success === false) return true;
  }

  const status = safeLower(statusValue(payload));
  const code = errorCode(payload).toUpperCase();

  if (
    status &&
    [
      "error",
      "failed",
      "failure",
      "invalid",
      "unauthorized",
      "forbidden",
      "expired",
      "disabled",
    ].includes(status)
  ) {
    return true;
  }

  if (code && FAILURE_CODES.has(code)) return true;
  if (status && SUCCESS_STATUSES.has(status)) return false;

  return false;
}

function createNormalizeError(
  message = "La respuesta del API no contiene una sesión válida.",
  { status = 401, code = "INVALID_AUTH_RESPONSE", response = null } = {}
) {
  const error = new Error(redact(message));

  error.name = "AuthNormalizeError";
  error.status = status;
  error.statusCode = status;
  error.code = code;
  error.data = {
    code,
    message: redact(message),
    status,
  };
  error.response = response;
  error.raw = response;

  return error;
}

/* =========================================================
   USER
========================================================= */

function isSensitiveUserKey(key = "") {
  return SENSITIVE_USER_KEYS.has(safeLower(key));
}

function sanitizeUserValue(value, keyHint = "", depth = 0) {
  if (depth > 8) return null;
  if (isSensitiveUserKey(keyHint)) return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, 500)
      .map((item) => sanitizeUserValue(item, "", depth + 1))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveUserKey(key)) continue;

      const clean = sanitizeUserValue(item, key, depth + 1);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  if (typeof value === "string") {
    return redact(value);
  }

  return value;
}

function sanitizeUser(user = {}) {
  return isObject(user) ? sanitizeUserValue(user) || {} : {};
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = safeLower(
    user.status ||
      user.estado ||
      user.state ||
      ""
  );

  return Boolean(
    user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.revoked === true ||
      user.blocked === true ||
      user.banned === true ||
      user.suspended === true ||
      user.active === false ||
      user.enabled === false ||
      Boolean(user.deletedAt) ||
      INVALID_USER_STATUSES.has(status)
  );
}

function hasUserIdentity(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.uid, "") ||
      safeText(user.sub, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.user_name, "") ||
      safeText(user.slug, "") ||
      safeText(user.lookup?.slug, "") ||
      safeText(user.profile?.slug, "")
  );
}

function explicitSlug(user = null) {
  if (!isObject(user)) return null;

  const slug =
    user.slug ||
    user.lookup?.slug ||
    user.profile?.slug ||
    user.routing?.slug ||
    null;

  const clean = safeText(slug, "");

  return clean || null;
}

function avatarFromUser(user = null) {
  if (!isObject(user)) return "";

  return safeText(
    user.avatarUrl ||
      user.avatar ||
      user.picture ||
      user.pictureUrl ||
      user.photoUrl ||
      user.photoURL ||
      user.imageUrl ||
      user.image ||
      user.profile?.avatarUrl ||
      user.profile?.avatar ||
      user.profile?.picture ||
      "",
    ""
  );
}

export function normalizeUser(rawUser = null) {
  if (!isObject(rawUser)) return null;
  if (isAuthEnvelope(rawUser) && !hasUserIdentity(rawUser)) return null;
  if (userDisabled(rawUser)) return null;
  if (!hasUserIdentity(rawUser)) return null;

  const safeUser = sanitizeUser(clone(rawUser));

  if (!isObject(safeUser)) return null;

  const id = safeText(
    safeUser.userId ||
      safeUser.id ||
      safeUser.uid ||
      safeUser.sub ||
      "",
    ""
  );

  const email = safeLower(safeUser.email || "");

  const username = sanitizeUsername(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      safeUser.usernameLower ||
      safeUser.username_lower ||
      ""
  );

  const slug = explicitSlug(safeUser);

  const displayName = safeText(
    safeUser.displayName ||
      safeUser.fullName ||
      safeUser.name ||
      safeUser.nombre ||
      username ||
      id ||
      "Usuario",
    "Usuario"
  );

  const role = defaultRole(safeUser.role || safeUser.rol || safeUser.roles);
  const roles = [role];

  const avatar = avatarFromUser(safeUser);

  const lang = safeUser.lang || safeUser.language || safeUser.locale || null;
  const theme = safeUser.theme || safeUser.mode || safeUser.appearance || null;

  return {
    ...safeUser,

    id: id || safeUser.id || safeUser.userId || null,
    userId: safeUser.userId || id || null,
    uid: safeUser.uid || id || null,
    sub: safeUser.sub || id || null,

    username: username || null,
    userName: username || null,
    user_name: username || null,
    usernameLower: username || null,
    username_lower: username || null,

    /*
      Slug real únicamente.
      No se fabrica desde username/email/id.
    */
    slug,

    name: safeUser.name || displayName,
    nombre: safeUser.nombre || displayName,
    fullName: safeUser.fullName || displayName,
    full_name: safeUser.full_name || safeUser.fullName || displayName,
    displayName,

    email: email || null,
    emailLower: email || null,
    email_lower: email || null,

    role,
    rol: role,
    userRole: role,
    roles,

    permissions: Array.isArray(safeUser.permissions) ? safeUser.permissions : [],
    permisos: Array.isArray(safeUser.permisos) ? safeUser.permisos : [],

    isAdmin: role === "admin",
    admin: role === "admin",
    isUser: role === "user",
    isSupport: false,
    isManager: false,
    isClient: false,

    hasAvatar: Boolean(safeUser.hasAvatar || avatar),
    avatar: avatar || safeUser.avatar || null,
    avatarUrl: avatar || safeUser.avatarUrl || null,
    avatar_url: avatar || safeUser.avatar_url || null,
    picture: safeUser.picture || avatar || null,
    photoUrl: safeUser.photoUrl || safeUser.photoURL || avatar || null,

    active: true,
    enabled: true,
    disabled: false,
    deleted: false,
    archived: false,

    status: safeUser.status || null,

    theme: ["dark", "light", "system"].includes(theme) ? theme : null,
    mode: ["dark", "light", "system"].includes(theme) ? theme : null,
    appearance: ["dark", "light", "system"].includes(theme) ? theme : null,

    lang: lang || null,
    language: lang || null,
    locale: lang || null,
  };
}

export function isUsableUser(user = null) {
  return Boolean(normalizeUser(user));
}

/* =========================================================
   EXTRACTORS
========================================================= */

function looksLikeStandaloneUser(value = null) {
  if (!isObject(value)) return false;
  if (!hasUserIdentity(value)) return false;

  return !Boolean(
    value.token ||
      value.accessToken ||
      value.access_token ||
      value.refreshToken ||
      value.refresh_token ||
      value.session ||
      value.sessionData ||
      value.auth ||
      value.payload ||
      value.result
  );
}

export function extractUser(payload = null) {
  if (!payload) return null;

  for (const item of nested(payload)) {
    const candidate = pick(item, USER_KEYS);
    const normalized = normalizeUser(candidate);

    if (normalized) return normalized;
  }

  return looksLikeStandaloneUser(payload)
    ? normalizeUser(payload)
    : null;
}

export function normalizeSessionPayload(payload = null) {
  if (!isObject(payload)) return null;

  const sessionNode = nested(payload).find((item) => {
    return SESSION_KEYS.some((key) => isObject(item?.[key]));
  });

  const session = pick(sessionNode || {}, SESSION_KEYS) || {};
  const user = extractUser(payload);

  const sessionId = normalizeSessionValue(
    session.sessionId ||
      session.session_id ||
      session.sid ||
      session.id ||
      ""
  );

  const userId = normalizeSessionValue(
    session.userId ||
      session.user_id ||
      session.sessionUserId ||
      session.session_user_id ||
      user?.userId ||
      user?.id ||
      user?.uid ||
      user?.sub ||
      ""
  );

  const expiresAt =
    session.expiresAt ||
    session.expires_at ||
    session.exp ||
    null;

  const refreshExpiresAt =
    session.refreshExpiresAt ||
    session.refresh_expires_at ||
    expiresAt ||
    null;

  if (!sessionId && !userId && !expiresAt && !refreshExpiresAt) return null;

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
    refreshExpiresAt,
    refresh_expires_at: refreshExpiresAt,

    persistent: normalizeBoolean(session.persistent, false),
    restoreOnBoot: normalizeBoolean(session.restoreOnBoot, false),
    rollingRefresh: normalizeBoolean(session.rollingRefresh, false),
    expiryEnforced: normalizeBoolean(session.expiryEnforced, false),

    revoked: session.revoked === true,
    active: session.active !== false,
    status: session.status || session.estado || "active",
  };
}

export function extractToken(payload = null) {
  if (!payload) return null;

  for (const item of nested(payload)) {
    const token = normalizeTokenValue(pick(item, TOKEN_KEYS));
    if (token) return token;
  }

  return null;
}

export function extractRefreshToken(payload = null) {
  if (!payload) return null;

  for (const item of nested(payload)) {
    const token = normalizeTokenValue(pick(item, REFRESH_TOKEN_KEYS));
    if (token) return token;
  }

  return null;
}

/* Compat: no hay temp token / 2FA en SPA mínimo. */
export function extractTempToken() {
  return null;
}

export function extractRequires2FA() {
  return false;
}

/* =========================================================
   VALIDATION
========================================================= */

function flowMode(options = {}) {
  return safeLower(options.mode || options.flow || options.type || "generic");
}

function allowTokenOnly(options = {}, mode = "generic") {
  return options.allowTokenOnly === true || ["refresh", "token"].includes(mode);
}

function allowUserOnly(options = {}, mode = "generic") {
  return options.allowUserOnly === true || ["me", "profile", "session"].includes(mode);
}

export function validateAuthResponse(response = null, options = {}) {
  const opts = isObject(options) ? options : {};
  const mode = flowMode(opts);

  if (explicitFailure(response)) {
    throw createNormalizeError(responseMessage(response) || "No se pudo iniciar sesión.", {
      status: Number(statusValue(response)) || 401,
      code: errorCode(response) || "AUTH_FAILED",
      response,
    });
  }

  const token = extractToken(response);
  const refreshToken = extractRefreshToken(response);
  const user = extractUser(response);
  const sessionData = normalizeSessionPayload(response);

  const hasToken = Boolean(token);
  const hasRefreshToken = Boolean(refreshToken);
  const hasUser = Boolean(user);

  const requireAuthenticated =
    opts.requireAuthenticated === true ||
    mode === "login" ||
    mode === "authenticate";

  const requireToken =
    opts.requireToken === true ||
    mode === "login" ||
    mode === "refresh";

  const requireRefreshToken =
    opts.requireRefreshToken === true;

  const requireUser =
    opts.requireUser === true ||
    mode === "login" ||
    mode === "me";

  if (hasToken && hasUser) {
    if (requireRefreshToken && !hasRefreshToken) {
      throw createNormalizeError("La respuesta del API no contiene refresh token persistente.", {
        status: 401,
        code: "REFRESH_TOKEN_MISSING",
        response,
      });
    }

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

      session: sessionData,
      sessionData,

      tempToken: null,
      temp_token: null,
      requires2FA: false,

      response,
    };
  }

  if (
    hasToken &&
    !hasUser &&
    !requireAuthenticated &&
    !requireUser &&
    allowTokenOnly(opts, mode)
  ) {
    return {
      ok: true,
      success: true,
      authenticated: false,
      status: "token_only",

      token,
      accessToken: token,
      access_token: token,

      user: null,
      usuario: null,
      me: null,

      refreshToken: refreshToken || null,
      refresh_token: refreshToken || null,

      session: sessionData,
      sessionData,

      tempToken: null,
      temp_token: null,
      requires2FA: false,

      response,
    };
  }

  if (
    !hasToken &&
    hasUser &&
    !requireAuthenticated &&
    !requireToken &&
    allowUserOnly(opts, mode)
  ) {
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

      session: sessionData,
      sessionData,

      tempToken: null,
      temp_token: null,
      requires2FA: false,

      response,
    };
  }

  if (opts.allowEmptySuccess === true && !hasToken && !hasUser) {
    return {
      ok: true,
      success: true,
      authenticated: false,
      status: "empty_success",

      token: null,
      accessToken: null,
      access_token: null,

      user: null,
      usuario: null,
      me: null,

      refreshToken: refreshToken || null,
      refresh_token: refreshToken || null,

      session: sessionData,
      sessionData,

      tempToken: null,
      temp_token: null,
      requires2FA: false,

      response,
    };
  }

  throw createNormalizeError("La respuesta del API no contiene una sesión válida.", {
    status: 401,
    code: requireAuthenticated
      ? "INVALID_LOGIN_SESSION"
      : requireToken
        ? "TOKEN_MISSING"
        : requireUser
          ? "USER_MISSING"
          : "INVALID_AUTH_RESPONSE",
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
      code: errorCode(response) || "",
      message: responseMessage(response) || "",
    };
  } catch (error) {
    return {
      ok: false,
      success: false,
      authenticated: false,

      status: error?.data?.status || error?.status || "invalid",
      code: error?.code || error?.data?.code || errorCode(response) || "INVALID_AUTH_RESPONSE",
      message: redact(error?.message || responseMessage(response) || "La respuesta del API no contiene una sesión válida."),

      token: null,
      accessToken: null,
      access_token: null,

      user: extractUser(response),
      usuario: extractUser(response),
      me: extractUser(response),

      refreshToken: null,
      refresh_token: null,

      session: null,
      sessionData: null,

      tempToken: null,
      temp_token: null,
      requires2FA: false,

      valid: false,
      explicitFailure: explicitFailure(response),
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

function previewToken(token = "") {
  const value = normalizeTokenValue(token);

  if (!value) return null;

  return value.length <= 8
    ? "***"
    : `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export function getAuthNormalizeSnapshot(response = null) {
  const token = extractToken(response);
  const refreshToken = extractRefreshToken(response);
  const user = extractUser(response);
  const normalized = normalizeAuthResponse(response, {
    allowTokenOnly: true,
    allowUserOnly: true,
    allowEmptySuccess: true,
  });

  return {
    version: AUTH_NORMALIZE_VERSION,

    explicitFailure: explicitFailure(response),
    status: statusValue(response) || null,
    normalizedStatus: normalized.status || null,
    code: errorCode(response) || null,
    message: responseMessage(response) || null,

    valid: Boolean(normalized.valid),
    authenticated: Boolean(normalized.authenticated),

    hasToken: Boolean(token),
    tokenPreview: previewToken(token),

    hasRefreshToken: Boolean(refreshToken),
    refreshTokenPreview: previewToken(refreshToken),

    hasTempToken: false,
    requires2FA: false,

    hasUser: Boolean(user),
    user: user
      ? {
          id: user.id || null,
          userId: user.userId || null,
          username: user.username || null,
          slug: user.slug || null,
          displayName: user.displayName || null,
          role: user.role || null,
          roles: user.roles || [],
          isAdmin: Boolean(user.isAdmin),
          hasAvatar: Boolean(user.hasAvatar),
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
      sideEffects: false,

      authRequiresTokenAndUser: true,
      tokenOnlyRequiresExplicitMode: true,
      userOnlyRequiresExplicitMode: true,

      invalidUserStatusHardened: true,
      noSlugFabrication: true,

      roles: ["admin", "user"],

      noTempToken: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,

      tokensRedacted: true,
      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  AUTH_NORMALIZE_VERSION,

  normalizeUser,
  isUsableUser,
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
