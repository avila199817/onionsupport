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
   - User inválido sólo si disabled.
   - Auth estricta: token + user usable.
========================================================= */

import {
  sanitizeUsername,
  slugify,
} from "./helpers.js";

import {
  AUTH_CONSTANTS,
  AUTH_FAILURE_CODES as AUTH_FAILURE_CODE_LIST,
  AUTH_SUCCESS_STATUSES as AUTH_SUCCESS_STATUS_LIST,
} from "./constants.js";

export const AUTH_NORMALIZE_VERSION = "simple";

const DEFAULT_TOKEN_MAX_LENGTH = 8192;
const DEFAULT_SESSION_VALUE_MAX_LENGTH = 200;

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

const FAILURE_CODES = new Set([
  ...(Array.isArray(AUTH_FAILURE_CODE_LIST) ? AUTH_FAILURE_CODE_LIST : []),
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "ACCOUNT_DISABLED",
  "USER_DISABLED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "TOKEN_INVALID",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "SESSION_NOT_FOUND",
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

/* =========================================================
   BASICS
========================================================= */

function safeText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
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
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
}

function pick(source = {}, keys = []) {
  if (!isObject(source)) return undefined;

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
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
  return safeNumber(AUTH_CONSTANTS?.tokenMaxLength, DEFAULT_TOKEN_MAX_LENGTH) || DEFAULT_TOKEN_MAX_LENGTH;
}

function sessionValueMaxLength() {
  return safeNumber(AUTH_CONSTANTS?.sessionValueMaxLength, DEFAULT_SESSION_VALUE_MAX_LENGTH) || DEFAULT_SESSION_VALUE_MAX_LENGTH;
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(value = "") {
  return safeLower(value) === "admin" ? "admin" : "user";
}

export function normalizeRoleList(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s|]+/)
      : value
        ? [value]
        : [];

  return raw.some((item) => safeLower(item) === "admin")
    ? ["admin"]
    : raw.length
      ? ["user"]
      : [];
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
    return value.token || value.accessToken || value.access_token || value.value || null;
  }

  return value;
}

export function normalizeTokenValue(value = null) {
  const candidate = unwrapToken(value);

  if (candidate === null || candidate === undefined) return null;

  let token = String(candidate).trim().replace(/^Bearer\s+/i, "");

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

  const output = String(value).trim().replace(/[\r\n\t]/g, "");

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
      USER_KEYS.some((key) => value[key] !== undefined)
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
    if (value !== undefined && value !== null && value !== "") return safeText(value, "");
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

    if (value !== undefined && value !== null && value !== "") return safeText(value, "");
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

  if (status && ["error", "failed", "failure", "invalid", "unauthorized", "forbidden", "expired", "disabled"].includes(status)) {
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
  const error = new Error(message);

  error.name = "AuthNormalizeError";
  error.status = status;
  error.statusCode = status;
  error.code = code;
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
   USER
========================================================= */

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function hasUserIdentity(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.slug ||
      user.email
  );
}

export function normalizeUser(rawUser = null) {
  if (!isObject(rawUser)) return null;
  if (isAuthEnvelope(rawUser) && !hasUserIdentity(rawUser)) return null;
  if (userDisabled(rawUser)) return null;
  if (!hasUserIdentity(rawUser)) return null;

  const id = rawUser.userId || rawUser.id || null;
  const email = safeLower(rawUser.email || "");
  const username = sanitizeUsername(rawUser.username || rawUser.slug || email || id || "");
  const displayName =
    rawUser.name ||
    rawUser.fullName ||
    rawUser.displayName ||
    rawUser.nombre ||
    username ||
    email ||
    id ||
    "Usuario";

  const role = normalizeRole(rawUser.role || rawUser.rol);
  const roles = [role];

  const avatar = rawUser.avatarUrl || rawUser.avatar || rawUser.picture || null;
  const lang = rawUser.lang || rawUser.language || rawUser.locale || null;
  const theme = rawUser.theme || rawUser.mode || rawUser.appearance || null;

  return {
    ...clone(rawUser),

    id,
    userId: rawUser.userId || id,

    username,
    userName: username,
    user_name: username,
    usernameLower: username || null,
    username_lower: username || null,
    slug: rawUser.slug || slugify(username || displayName || email || id || "usuario"),

    name: displayName,
    nombre: displayName,
    fullName: displayName,
    full_name: displayName,
    displayName,

    email,
    emailLower: email,
    email_lower: email,

    role,
    rol: role,
    userRole: role,
    roles,

    permissions: [],
    permisos: [],

    isAdmin: role === "admin",
    admin: role === "admin",
    isSupport: false,
    isManager: false,
    isClient: false,

    hasAvatar: Boolean(avatar),
    avatar,
    avatarUrl: avatar,
    avatar_url: avatar,
    picture: avatar,

    active: true,
    disabled: false,
    status: rawUser.status || null,

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

export function extractUser(payload = null) {
  if (!payload) return null;

  for (const item of nested(payload)) {
    const candidate = pick(item, USER_KEYS);
    const normalized = normalizeUser(candidate);

    if (normalized) return normalized;
  }

  return normalizeUser(payload);
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
      user?.userId ||
      user?.id ||
      ""
  );

  const expiresAt =
    session.expiresAt ||
    session.expires_at ||
    session.exp ||
    null;

  if (!sessionId && !userId && !expiresAt) return null;

  return {
    id: sessionId || null,
    sessionId: sessionId || null,
    session_id: sessionId || null,
    sid: sessionId || null,

    userId: userId || null,
    user_id: userId || null,

    expiresAt,
    expires_at: expiresAt,
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
  const hasUser = Boolean(user);

  const requireAuthenticated =
    opts.requireAuthenticated === true ||
    mode === "login" ||
    mode === "authenticate";

  const requireToken =
    opts.requireToken === true ||
    mode === "login" ||
    mode === "refresh";

  const requireUser =
    opts.requireUser === true ||
    mode === "login" ||
    mode === "me";

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

      session: sessionData,
      sessionData,

      tempToken: null,
      temp_token: null,
      requires2FA: false,

      response,
    };
  }

  if (hasToken && !hasUser && !requireAuthenticated && !requireUser && allowTokenOnly(opts, mode)) {
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

  if (!hasToken && hasUser && !requireAuthenticated && !requireToken && allowUserOnly(opts, mode)) {
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
      message: error?.message || responseMessage(response) || "La respuesta del API no contiene una sesión válida.",

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
          email: user.email || null,
          name: user.name || null,
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
      roles: ["admin", "user"],
      tokenNoTruncate: true,
      no2fa: true,
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
