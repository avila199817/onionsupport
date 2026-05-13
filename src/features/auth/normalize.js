/* =========================================================
   Onion SPA - Auth Normalize
   Archivo: src/features/auth/normalize.js

   AUTH NORMALIZER · FINAL EXTREME PRO SYSTEM · 11/10

   RESPONSABILIDADES:
   - normalizar usuarios heterogéneos del backend
   - normalizar payload de sesión
   - extraer access token / refresh token / temp token
   - validar respuestas de login / refresh / me
   - detectar 2FA/MFA con variantes comunes
   - normalizar avatar para sidebar/topbar
   - preservar role / rol / roles / permissions / claims / flags
   - evitar sesión fantasma sin token + user usable
   - evitar tratar envelopes auth como usuarios
   - soportar respuestas nested:
     { ok, data, payload, result, body, response, session, auth, user, me, account }

   HARDENING:
   - admin / superadmin / administrator / owner / root => admin
   - support / soporte / agent / technician / tecnico => support
   - manager / gestor / lead / supervisor => manager
   - client / cliente / user / usuario => client
   - no fuerza darkMode:false si backend no lo envió explícitamente
   - tokens no se truncan: se invalidan si exceden límite
   - permisos como array, string u objeto boolean-map
   - 2FA exige tempToken/challengeToken usable salvo override explícito
   - snapshots sin tokens reales
   - raw user saneado sin secretos
========================================================= */

import {
  sanitizeUsername,
  slugify,
} from "./helpers.js";

import {
  AUTH_CONSTANTS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const AUTH_NORMALIZE_VERSION =
  "11.0.0";

const DEFAULT_TOKEN_MAX_LENGTH =
  8192;

const DEFAULT_SESSION_VALUE_MAX_LENGTH =
  200;

const DEFAULT_RAW_SANITIZE_DEPTH =
  5;

const DEFAULT_RAW_SANITIZE_KEYS =
  160;

const ADMIN_ROLE_KEYS =
  new Set([
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "super_administrador",
    "owner",
    "root",
  ]);

const SUPPORT_ROLE_KEYS =
  new Set([
    "support",
    "soporte",
    "agent",
    "agente",
    "helpdesk",
    "operator",
    "operador",
    "tecnico",
    "técnico",
    "technician",
    "technical",
    "staff",
  ]);

const MANAGER_ROLE_KEYS =
  new Set([
    "manager",
    "gestor",
    "gerente",
    "lead",
    "team_lead",
    "supervisor",
    "responsable",
  ]);

const CLIENT_ROLE_KEYS =
  new Set([
    "client",
    "cliente",
    "customer",
    "usuario",
    "user",
  ]);

const AUTH_FAILURE_CODES =
  new Set([
    "INVALID_CREDENTIALS",
    "MISSING_CREDENTIALS",
    "ACCOUNT_TEMPORARILY_LOCKED",
    "ACCOUNT_DISABLED",
    "USER_DISABLED",
    "USER_NOT_AVAILABLE",
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
    "REFRESH_EMPTY_RESPONSE",
    "REFRESH_USER_WITHOUT_TOKEN",
    "REFRESH_UNUSABLE_RESPONSE",
    "ME_INVALID_SESSION",
    "ME_USER_MISSING",
    "MISSING_2FA_TEMP_TOKEN",
    "BAD_CREDENTIALS",
    "CREDENTIALS_INVALID",
    "TOKEN_VERSION_MISMATCH",
  ]);

const AUTH_FAILURE_STATUS_KEYS =
  new Set([
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

const AUTH_SUCCESS_STATUS_KEYS =
  new Set([
    "ok",
    "success",
    "successful",
    "authenticated",
    "active",
    "valid",
    "token_only",
    "user_only",
    "2fa_required",
    "mfa_required",
    "totp_required",
    "two_factor_required",
  ]);

const TWO_FACTOR_STATUS_KEYS =
  new Set([
    "2fa_required",
    "mfa_required",
    "totp_required",
    "two_factor_required",
    "verification_required",
    "challenge_required",
  ]);

const TOKEN_KEYS =
  Object.freeze([
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

const REFRESH_TOKEN_KEYS =
  Object.freeze([
    "refreshToken",
    "refresh_token",
  ]);

const TEMP_TOKEN_KEYS =
  Object.freeze([
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
  ]);

const TOKEN_FALSE_VALUES =
  new Set([
    "",
    "null",
    "undefined",
    "false",
    "none",
    "nan",
    "{}",
    "[]",
    "[object object]",
    "\"\"",
    "''",
  ]);

const USER_IDENTITY_KEYS =
  Object.freeze([
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
    "cellphone",
  ]);

const AUTH_ENVELOPE_KEYS =
  Object.freeze([
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

const NESTED_OBJECT_KEYS =
  Object.freeze([
    "data",
    "payload",
    "result",
    "body",
    "response",
    "auth",
    "authData",
    "session",
    "sessionData",
    "meta",
  ]);

const SENSITIVE_RAW_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

/* =========================================================
   BASIC HELPERS
========================================================= */

function normalizeString(value = "") {
  return String(value ?? "").trim();
}

function safeLower(value = "") {
  return normalizeString(value).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
      value.trim().toLowerCase();

    if (
      [
        "1",
        "true",
        "yes",
        "on",
        "si",
        "sí",
        "ok",
        "enabled",
        "active",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "0",
        "false",
        "no",
        "off",
        "disabled",
        "inactive",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function hasExplicitValue(value) {
  return !(
    value === undefined ||
    value === null ||
    (
      typeof value === "string" &&
      value.trim() === ""
    )
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeClone(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

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

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value];
}

function pickFirst(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    if (
      isObject(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function pickFirstText(...values) {
  return normalizeString(
    pickFirst(...values) || ""
  );
}

function pickFirstObject(...values) {
  for (const value of values) {
    if (isObject(value)) {
      return value;
    }
  }

  return null;
}

function hasOwn(obj, key) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(
        obj,
        key
      )
  );
}

function unique(values = []) {
  return Array.from(
    new Set(
      values
        .map((item) =>
          normalizeString(item)
        )
        .filter(Boolean)
    )
  );
}

function normalizeEmail(value = "") {
  return safeLower(value);
}

function safeSessionValue(
  value = "",
  maxLength = DEFAULT_SESSION_VALUE_MAX_LENGTH
) {
  const text =
    normalizeString(value);

  if (!text) {
    return "";
  }

  return text.slice(
    0,
    safeNumber(
      maxLength,
      DEFAULT_SESSION_VALUE_MAX_LENGTH
    )
  );
}

function getTokenMaxLength() {
  return (
    safeNumber(
      AUTH_CONSTANTS?.tokenMaxLength,
      DEFAULT_TOKEN_MAX_LENGTH
    ) || DEFAULT_TOKEN_MAX_LENGTH
  );
}

function getSessionValueMaxLength() {
  return (
    safeNumber(
      AUTH_CONSTANTS?.sessionValueMaxLength,
      DEFAULT_SESSION_VALUE_MAX_LENGTH
    ) || DEFAULT_SESSION_VALUE_MAX_LENGTH
  );
}

/* =========================================================
   RAW SANITIZER
========================================================= */

function sanitizeRawObject(value, depth = 0, seen = new WeakSet()) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (depth > DEFAULT_RAW_SANITIZE_DEPTH) {
    return "[depth-limit]";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, DEFAULT_RAW_SANITIZE_KEYS)
      .map((item) =>
        sanitizeRawObject(
          item,
          depth + 1,
          seen
        )
      );
  }

  if (!isObject(value)) {
    return value;
  }

  try {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);
  } catch {}

  const output = {};

  for (const [key, item] of Object.entries(value).slice(0, DEFAULT_RAW_SANITIZE_KEYS)) {
    if (SENSITIVE_RAW_KEY_RE.test(key)) {
      output[key] =
        item ? "***" : item;

      continue;
    }

    output[key] =
      sanitizeRawObject(
        item,
        depth + 1,
        seen
      );
  }

  return output;
}

/* =========================================================
   TOKEN HELPERS
========================================================= */

function pickTokenFromObject(value = null) {
  if (!isObject(value)) {
    return null;
  }

  for (const key of [
    ...TOKEN_KEYS,
    ...REFRESH_TOKEN_KEYS,
    ...TEMP_TOKEN_KEYS,
    "value",
    "raw",
    "data",
  ]) {
    if (!hasOwn(value, key)) {
      continue;
    }

    const candidate =
      value[key];

    if (
      typeof candidate === "string" ||
      typeof candidate === "number"
    ) {
      const text =
        normalizeString(candidate);

      if (text) {
        return text;
      }
    }
  }

  return null;
}

function normalizeTokenLike(
  value = null,
  maxLength = getTokenMaxLength()
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  let tokenValue =
    value;

  if (isObject(tokenValue)) {
    tokenValue =
      pickTokenFromObject(tokenValue);
  }

  if (
    tokenValue === null ||
    tokenValue === undefined
  ) {
    return null;
  }

  let normalized =
    String(tokenValue).trim();

  if (!normalized) {
    return null;
  }

  if (/^bearer\s+/i.test(normalized)) {
    normalized =
      normalized.replace(/^bearer\s+/i, "")
        .trim();
  }

  const lower =
    normalized.toLowerCase();

  if (TOKEN_FALSE_VALUES.has(lower)) {
    return null;
  }

  const limit =
    safeNumber(
      maxLength,
      DEFAULT_TOKEN_MAX_LENGTH
    );

  /*
    Regla dura:
    Un token excedido se considera corrupto.
    No se trunca.
  */
  if (
    limit > 0 &&
    normalized.length > limit
  ) {
    return null;
  }

  return normalized;
}

function redactToken(value = "") {
  const text =
    normalizeString(value);

  if (!text) {
    return "";
  }

  if (text.length <= 8) {
    return "***";
  }

  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

/* =========================================================
   ROLE HELPERS
========================================================= */

function normalizeRoleKey(value = "") {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function extractValuesFromObjectBooleanMap(value = {}) {
  if (!isObject(value)) {
    return [];
  }

  return Object.entries(value)
    .filter(([, itemValue]) =>
      itemValue === true ||
      itemValue === 1 ||
      itemValue === "true" ||
      itemValue === "1" ||
      itemValue === "yes" ||
      itemValue === "si" ||
      itemValue === "sí" ||
      itemValue === "on"
    )
    .map(([key]) => key);
}

export function normalizeRoleList(value) {
  if (Array.isArray(value)) {
    return value
      .flat(Infinity)
      .flatMap((item) =>
        isObject(item)
          ? extractValuesFromObjectBooleanMap(item)
          : [item]
      )
      .flatMap((item) =>
        typeof item === "string"
          ? item.split(/[,\s|]+/)
          : [item]
      )
      .map(normalizeRoleKey)
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s|]+/)
      .map(normalizeRoleKey)
      .filter(Boolean);
  }

  if (isObject(value)) {
    return extractValuesFromObjectBooleanMap(value)
      .map(normalizeRoleKey)
      .filter(Boolean);
  }

  return toArray(value)
    .flat(Infinity)
    .map(normalizeRoleKey)
    .filter(Boolean);
}

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(
    normalizeRoleKey(value)
  );
}

function isSupportRole(value = "") {
  return SUPPORT_ROLE_KEYS.has(
    normalizeRoleKey(value)
  );
}

function isManagerRole(value = "") {
  return MANAGER_ROLE_KEYS.has(
    normalizeRoleKey(value)
  );
}

function isClientRole(value = "") {
  return CLIENT_ROLE_KEYS.has(
    normalizeRoleKey(value)
  );
}

export function expandRoleAliases(roles = []) {
  const normalized =
    normalizeRoleList(roles);

  const result =
    new Set(normalized);

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

  if (normalized.some(isClientRole)) {
    for (const role of CLIENT_ROLE_KEYS) {
      result.add(role);
    }

    result.add("client");
  }

  return unique(
    Array.from(result)
  );
}

function normalizeCanonicalRole(value = "user") {
  const roles =
    expandRoleAliases(value);

  if (roles.some(isAdminRole)) {
    return "admin";
  }

  if (roles.some(isSupportRole)) {
    return "support";
  }

  if (roles.some(isManagerRole)) {
    return "manager";
  }

  if (roles.some(isClientRole)) {
    return "client";
  }

  return roles[0] || "user";
}

function normalizePermissionList(value) {
  return normalizeRoleList(value);
}

function normalizeTheme(value = "") {
  const theme =
    safeLower(value);

  if (theme === "light") {
    return "light";
  }

  if (theme === "dark") {
    return "dark";
  }

  return null;
}

/* =========================================================
   AVATAR HELPERS
========================================================= */

function isSafeAvatarUrl(url = "") {
  const value =
    normalizeString(url);

  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:text/html") ||
    lower.startsWith("data:application/")
  ) {
    return false;
  }

  return true;
}

function getNestedRawUser(rawUser = {}) {
  const user =
    isObject(rawUser)
      ? rawUser
      : {};

  return isObject(user.raw)
    ? user.raw
    : {};
}

function normalizeAvatarUrl(rawUser = null) {
  if (!isObject(rawUser)) {
    return null;
  }

  const raw =
    getNestedRawUser(rawUser);

  const profile =
    safeObject(rawUser.profile);

  const settings =
    safeObject(rawUser.settings);

  const preferences =
    safeObject(rawUser.preferences);

  const meta =
    safeObject(rawUser.meta);

  const rawProfile =
    safeObject(raw.profile);

  const rawSettings =
    safeObject(raw.settings);

  const rawPreferences =
    safeObject(raw.preferences);

  const rawMeta =
    safeObject(raw.meta);

  const hasAvatar =
    pickFirst(
      rawUser.hasAvatar,
      rawUser.has_avatar,
      rawUser.avatarEnabled,
      rawUser.avatar_enabled,

      profile.hasAvatar,
      profile.has_avatar,
      profile.avatarEnabled,
      profile.avatar_enabled,

      settings.hasAvatar,
      settings.avatarEnabled,

      preferences.hasAvatar,
      preferences.avatarEnabled,

      meta.hasAvatar,
      meta.avatarEnabled,

      raw.hasAvatar,
      raw.has_avatar,
      raw.avatarEnabled,
      raw.avatar_enabled,

      rawProfile.hasAvatar,
      rawProfile.has_avatar,
      rawProfile.avatarEnabled,
      rawProfile.avatar_enabled,

      rawSettings.hasAvatar,
      rawSettings.avatarEnabled,

      rawPreferences.hasAvatar,
      rawPreferences.avatarEnabled,

      rawMeta.hasAvatar,
      rawMeta.avatarEnabled
    );

  const rawAvatar =
    pickFirst(
      rawUser.avatar,
      rawUser.avatarUrl,
      rawUser.avatar_url,
      rawUser.photo,
      rawUser.photoUrl,
      rawUser.photo_url,
      rawUser.image,
      rawUser.imageUrl,
      rawUser.image_url,
      rawUser.profileImage,
      rawUser.profile_image,
      rawUser.picture,
      rawUser.pictureUrl,
      rawUser.picture_url,
      rawUser.thumbnail,
      rawUser.thumbnailUrl,
      rawUser.thumbnail_url,

      profile.avatar,
      profile.avatarUrl,
      profile.avatar_url,
      profile.photo,
      profile.photoUrl,
      profile.photo_url,
      profile.image,
      profile.imageUrl,
      profile.image_url,
      profile.profileImage,
      profile.profile_image,
      profile.picture,
      profile.pictureUrl,
      profile.picture_url,
      profile.thumbnail,
      profile.thumbnailUrl,
      profile.thumbnail_url,

      settings.avatar,
      settings.avatarUrl,
      settings.avatar_url,
      settings.photoUrl,
      settings.photo_url,

      preferences.avatar,
      preferences.avatarUrl,
      preferences.avatar_url,
      preferences.photoUrl,
      preferences.photo_url,

      meta.avatar,
      meta.avatarUrl,
      meta.avatar_url,
      meta.picture,
      meta.pictureUrl,
      meta.picture_url,

      raw.avatar,
      raw.avatarUrl,
      raw.avatar_url,
      raw.photo,
      raw.photoUrl,
      raw.photo_url,
      raw.image,
      raw.imageUrl,
      raw.image_url,
      raw.profileImage,
      raw.profile_image,
      raw.picture,
      raw.pictureUrl,
      raw.picture_url,
      raw.thumbnail,
      raw.thumbnailUrl,
      raw.thumbnail_url,

      rawProfile.avatar,
      rawProfile.avatarUrl,
      rawProfile.avatar_url,
      rawProfile.photo,
      rawProfile.photoUrl,
      rawProfile.photo_url,
      rawProfile.profileImage,
      rawProfile.profile_image,
      rawProfile.picture,
      rawProfile.pictureUrl,
      rawProfile.picture_url,

      rawSettings.avatar,
      rawSettings.avatarUrl,
      rawSettings.avatar_url,

      rawPreferences.avatar,
      rawPreferences.avatarUrl,
      rawPreferences.avatar_url,

      rawMeta.avatar,
      rawMeta.avatarUrl,
      rawMeta.avatar_url,
      rawMeta.picture,
      rawMeta.pictureUrl,
      rawMeta.picture_url
    );

  const avatar =
    normalizeString(rawAvatar);

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
   USER / ENVELOPE DETECTION
========================================================= */

function hasUsableUserIdentity(user = {}) {
  if (!isObject(user)) {
    return false;
  }

  return USER_IDENTITY_KEYS.some((key) =>
    Boolean(
      normalizeString(user[key])
    )
  );
}

function hasNestedUserIdentity(user = {}) {
  if (!isObject(user)) {
    return false;
  }

  const raw =
    getNestedRawUser(user);

  const profile =
    safeObject(user.profile);

  const account =
    safeObject(user.account);

  const rawProfile =
    safeObject(raw.profile);

  const rawAccount =
    safeObject(raw.account);

  return Boolean(
    hasUsableUserIdentity(user) ||
      hasUsableUserIdentity(profile) ||
      hasUsableUserIdentity(account) ||
      hasUsableUserIdentity(raw) ||
      hasUsableUserIdentity(rawProfile) ||
      hasUsableUserIdentity(rawAccount)
  );
}

function hasTokenLikeKeys(value = {}) {
  if (!isObject(value)) {
    return false;
  }

  return Boolean(
    TOKEN_KEYS.some((key) => hasOwn(value, key)) ||
      REFRESH_TOKEN_KEYS.some((key) => hasOwn(value, key)) ||
      TEMP_TOKEN_KEYS.some((key) => hasOwn(value, key))
  );
}

function isAuthEnvelope(value = {}) {
  if (!isObject(value)) {
    return false;
  }

  return Boolean(
    AUTH_ENVELOPE_KEYS.some((key) =>
      hasOwn(value, key)
    ) ||
      hasTokenLikeKeys(value)
  );
}

function looksLikeUser(value = null) {
  if (!isObject(value)) {
    return false;
  }

  if (
    isAuthEnvelope(value) &&
    !hasNestedUserIdentity(value)
  ) {
    return false;
  }

  return Boolean(
    hasNestedUserIdentity(value) ||
      value.role ||
      value.rol ||
      value.roles ||
      value.permissions ||
      value.scopes ||
      value.claims ||
      value.profile ||
      value.account
  );
}

/* =========================================================
   ENVELOPE HELPERS
========================================================= */

function getNestedAuthNodes(payload = {}) {
  const root =
    safeObject(payload);

  const data =
    safeObject(root.data);

  const payloadNode =
    safeObject(root.payload);

  const result =
    safeObject(root.result);

  const body =
    safeObject(root.body);

  const response =
    safeObject(root.response);

  const responseData =
    safeObject(response.data);

  const meta =
    safeObject(root.meta);

  const session =
    pickFirstObject(
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

  const auth =
    pickFirstObject(
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

  const sessionData =
    safeObject(session.data);

  const authData =
    safeObject(auth.data);

  return {
    root,
    data,
    payload:
      payloadNode,
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
  if (
    !payload ||
    depth > 8 ||
    !isObject(payload)
  ) {
    return payload;
  }

  if (
    looksLikeUser(payload) &&
    hasNestedUserIdentity(payload)
  ) {
    return payload;
  }

  const candidate =
    pickFirstObject(
      payload.data,
      payload.payload,
      payload.result,
      payload.body,
      payload.response?.data,
      payload.response
    );

  if (
    candidate &&
    candidate !== payload
  ) {
    return unwrapAuthPayload(
      candidate,
      depth + 1
    );
  }

  return payload;
}

function collectAuthObjects(payload = null) {
  const output =
    [];

  const seen =
    new WeakSet();

  const queue =
    [payload];

  let guard =
    0;

  while (
    queue.length &&
    guard < 100
  ) {
    guard += 1;

    const current =
      queue.shift();

    if (!isObject(current)) {
      continue;
    }

    try {
      if (seen.has(current)) {
        continue;
      }

      seen.add(current);
    } catch {}

    output.push(current);

    for (const key of NESTED_OBJECT_KEYS) {
      const nested =
        current[key];

      if (isObject(nested)) {
        queue.push(nested);
      }
    }

    if (isObject(current.response?.data)) {
      queue.push(current.response.data);
    }

    if (isObject(current.auth?.data)) {
      queue.push(current.auth.data);
    }

    if (isObject(current.session?.data)) {
      queue.push(current.session.data);
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
  return normalizeString(
    pickValueFromObjects(
      objects,
      keys
    ) || ""
  );
}

function getStatusValue(payload = null) {
  const objects =
    collectAuthObjects(payload);

  return pickValueFromObjects(
    objects,
    [
      "status",
      "statusCode",
      "status_code",
      "state",
      "estado",
    ]
  );
}

function getErrorCode(payload = null) {
  const objects =
    collectAuthObjects(payload);

  return pickTextFromObjects(
    objects,
    [
      "code",
      "errorCode",
      "error_code",
      "error",
    ]
  );
}

function getResponseMessage(payload = null) {
  const objects =
    collectAuthObjects(payload);

  return pickTextFromObjects(
    objects,
    [
      "message",
      "mensaje",
      "errorMessage",
      "error_message",
      "detail",
      "description",
      "title",
      "reason",
      "msg",
    ]
  );
}

function isExplicitAuthFailure(payload = null) {
  if (
    !payload ||
    !isObject(payload)
  ) {
    return false;
  }

  const objects =
    collectAuthObjects(payload);

  const statusValue =
    getStatusValue(payload);

  const statusNumber =
    Number(statusValue || 0);

  if (
    Number.isFinite(statusNumber) &&
    statusNumber >= 400
  ) {
    return true;
  }

  const statusText =
    normalizeRoleKey(statusValue || "");

  if (
    statusText &&
    AUTH_FAILURE_STATUS_KEYS.has(statusText)
  ) {
    return true;
  }

  const code =
    getErrorCode(payload).toUpperCase();

  if (
    code &&
    AUTH_FAILURE_CODES.has(code)
  ) {
    return true;
  }

  if (
    objects.some((object) =>
      object?.ok === false ||
      object?.success === false
    )
  ) {
    return true;
  }

  if (
    statusText &&
    AUTH_SUCCESS_STATUS_KEYS.has(statusText)
  ) {
    return false;
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
  const error =
    new Error(message);

  error.name =
    "AuthNormalizeError";

  error.status =
    status;

  error.code =
    code;

  error.data = {
    code,
    message,
    status,
  };

  error.response =
    response;

  error.raw =
    response;

  return error;
}

/* =========================================================
   ROLE / PERMISSION RESOLUTION
========================================================= */

function collectRoleCandidates(rawUser = {}) {
  const user =
    safeObject(rawUser);

  const raw =
    getNestedRawUser(user);

  const profile =
    safeObject(user.profile);

  const permissionsNode =
    safeObject(user.permissions);

  const meta =
    safeObject(user.meta);

  const claims =
    safeObject(user.claims);

  const account =
    safeObject(user.account);

  const rawProfile =
    safeObject(raw.profile);

  const rawPermissions =
    safeObject(raw.permissions);

  const rawMeta =
    safeObject(raw.meta);

  const rawClaims =
    safeObject(raw.claims);

  const rawAccount =
    safeObject(raw.account);

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
    account.user_role,
    account.type,
    account.perfil,

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

    rawAccount.role,
    rawAccount.rol,
    rawAccount.userRole,
    rawAccount.user_role,
    rawAccount.type,
    rawAccount.perfil,

    rawMeta.role,
    rawMeta.rol,
    rawMeta.userRole,
    rawMeta.user_role,

    rawClaims.role,
    rawClaims.rol,
    rawClaims.userRole,
    rawClaims.user_role,
    rawClaims["custom:role"],
    rawClaims["https://onion/role"],
  ];

  const roleArrays = [
    user.roles,
    user.roleList,
    user.role_list,
    user.groups,
    user.authorities,

    profile.roles,
    profile.groups,
    profile.authorities,

    account.roles,
    account.groups,
    account.authorities,

    permissionsNode.roles,

    meta.roles,
    meta.groups,

    claims.roles,
    claims.groups,

    raw.roles,
    raw.roleList,
    raw.role_list,
    raw.groups,
    raw.authorities,

    rawProfile.roles,
    rawProfile.groups,
    rawProfile.authorities,

    rawAccount.roles,
    rawAccount.groups,
    rawAccount.authorities,

    rawPermissions.roles,

    rawMeta.roles,
    rawMeta.groups,

    rawClaims.roles,
    rawClaims.groups,
  ];

  const roles = [
    ...roleCandidates,
    ...roleArrays.flatMap((value) =>
      toArray(value)
    ),
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
    account.canManageUsers,
    account.canAccessUsers,

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

    rawAccount.isAdmin,
    rawAccount.admin,
    rawAccount.isSuperAdmin,
    rawAccount.superAdmin,
    rawAccount.canManageUsers,
    rawAccount.canAccessUsers,

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
  ].some((value) =>
    normalizeBoolean(
      value,
      false
    )
  );

  if (adminFlag) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function collectPermissions(rawUser = {}) {
  const user =
    safeObject(rawUser);

  const raw =
    getNestedRawUser(user);

  const profile =
    safeObject(user.profile);

  const meta =
    safeObject(user.meta);

  const claims =
    safeObject(user.claims);

  const permissionsNode =
    safeObject(user.permissions);

  const rawProfile =
    safeObject(raw.profile);

  const rawMeta =
    safeObject(raw.meta);

  const rawClaims =
    safeObject(raw.claims);

  const rawPermissions =
    safeObject(raw.permissions);

  return unique([
    ...normalizePermissionList(user.permissions),
    ...normalizePermissionList(user.scopes),
    ...normalizePermissionList(user.authorities),

    ...normalizePermissionList(profile.permissions),
    ...normalizePermissionList(profile.scopes),
    ...normalizePermissionList(profile.authorities),

    ...normalizePermissionList(meta.permissions),
    ...normalizePermissionList(meta.scopes),

    ...normalizePermissionList(claims.permissions),
    ...normalizePermissionList(claims.scopes),

    ...normalizePermissionList(permissionsNode.items),
    ...normalizePermissionList(permissionsNode.list),
    ...normalizePermissionList(permissionsNode.scopes),

    ...normalizePermissionList(raw.permissions),
    ...normalizePermissionList(raw.scopes),
    ...normalizePermissionList(raw.authorities),

    ...normalizePermissionList(rawProfile.permissions),
    ...normalizePermissionList(rawProfile.scopes),
    ...normalizePermissionList(rawProfile.authorities),

    ...normalizePermissionList(rawMeta.permissions),
    ...normalizePermissionList(rawMeta.scopes),

    ...normalizePermissionList(rawClaims.permissions),
    ...normalizePermissionList(rawClaims.scopes),

    ...normalizePermissionList(rawPermissions.items),
    ...normalizePermissionList(rawPermissions.list),
    ...normalizePermissionList(rawPermissions.scopes),
  ]);
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
    No normalizamos un envelope auth completo como usuario:
      { ok:true, token:"...", data:{...} }
  */
  if (
    isAuthEnvelope(rawUser) &&
    !hasNestedUserIdentity(rawUser)
  ) {
    return null;
  }

  /*
    Protección adicional:
    role/permissions sin identidad no son un usuario usable.
  */
  if (!hasNestedUserIdentity(rawUser)) {
    return null;
  }

  const raw =
    getNestedRawUser(rawUser);

  const profile =
    safeObject(rawUser.profile);

  const account =
    safeObject(rawUser.account);

  const preferences =
    safeObject(rawUser.preferences);

  const settings =
    safeObject(rawUser.settings);

  const meta =
    safeObject(rawUser.meta);

  const claims =
    safeObject(rawUser.claims);

  const rawProfile =
    safeObject(raw.profile);

  const rawAccount =
    safeObject(raw.account);

  const rawPreferences =
    safeObject(raw.preferences);

  const rawSettings =
    safeObject(raw.settings);

  const rawMeta =
    safeObject(raw.meta);

  const rawClaims =
    safeObject(raw.claims);

  const email =
    normalizeEmail(
      pickFirst(
        rawUser.email,
        rawUser.mail,
        profile.email,
        profile.mail,
        account.email,
        account.mail,
        raw.email,
        raw.mail,
        rawProfile.email,
        rawProfile.mail,
        rawAccount.email,
        rawAccount.mail,
        ""
      )
    );

  const phone =
    pickFirst(
      rawUser.phone,
      rawUser.telefono,
      rawUser.mobile,
      rawUser.cellphone,

      profile.phone,
      profile.telefono,
      profile.mobile,
      profile.cellphone,

      account.phone,
      account.telefono,
      account.mobile,
      account.cellphone,

      raw.phone,
      raw.telefono,
      raw.mobile,
      raw.cellphone,

      rawProfile.phone,
      rawProfile.telefono,
      rawProfile.mobile,
      rawProfile.cellphone,

      rawAccount.phone,
      rawAccount.telefono,
      rawAccount.mobile,
      rawAccount.cellphone
    );

  const id =
    pickFirst(
      rawUser.id,
      rawUser.userId,
      rawUser.user_id,
      rawUser.uuid,
      rawUser.uid,
      rawUser.sub,
      rawUser._id,

      profile.id,
      profile.userId,
      profile.user_id,
      profile.uid,
      profile.sub,

      account.id,
      account.userId,
      account.user_id,
      account.uid,
      account.sub,

      raw.id,
      raw.userId,
      raw.user_id,
      raw.uuid,
      raw.uid,
      raw.sub,
      raw._id,

      rawProfile.id,
      rawProfile.userId,
      rawProfile.user_id,
      rawProfile.uid,
      rawProfile.sub,

      rawAccount.id,
      rawAccount.userId,
      rawAccount.user_id,
      rawAccount.uid,
      rawAccount.sub
    );

  const userId =
    pickFirst(
      rawUser.userId,
      rawUser.user_id,
      rawUser.id,
      rawUser.uuid,
      rawUser.uid,
      rawUser.sub,
      rawUser._id,

      profile.userId,
      profile.user_id,
      profile.id,
      profile.uid,
      profile.sub,

      account.userId,
      account.user_id,
      account.id,
      account.uid,
      account.sub,

      raw.userId,
      raw.user_id,
      raw.id,
      raw.uuid,
      raw.uid,
      raw.sub,
      raw._id,

      rawProfile.userId,
      rawProfile.user_id,
      rawProfile.id,
      rawProfile.uid,
      rawProfile.sub,

      rawAccount.userId,
      rawAccount.user_id,
      rawAccount.id,
      rawAccount.uid,
      rawAccount.sub
    );

  const rawUsername =
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
      profile.login,
      profile.slug,

      account.username,
      account.userName,
      account.user_name,
      account.login,
      account.slug,

      raw.username,
      raw.userName,
      raw.user_name,
      raw.nick,
      raw.alias,
      raw.login,
      raw.slug,

      rawProfile.username,
      rawProfile.userName,
      rawProfile.user_name,
      rawProfile.login,
      rawProfile.slug,

      rawAccount.username,
      rawAccount.userName,
      rawAccount.user_name,
      rawAccount.login,
      rawAccount.slug,

      email,
      phone,
      id,
      userId
    );

  const username =
    sanitizeUsername(
      normalizeString(rawUsername)
    );

  const displayName =
    normalizeString(
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
        profile.full_name,
        profile.displayName,
        profile.display_name,

        account.name,
        account.nombre,
        account.fullName,
        account.full_name,
        account.displayName,
        account.display_name,

        raw.name,
        raw.nombre,
        raw.full_name,
        raw.fullName,
        raw.display_name,
        raw.displayName,

        rawProfile.name,
        rawProfile.nombre,
        rawProfile.fullName,
        rawProfile.full_name,
        rawProfile.displayName,
        rawProfile.display_name,

        rawAccount.name,
        rawAccount.nombre,
        rawAccount.fullName,
        rawAccount.full_name,
        rawAccount.displayName,
        rawAccount.display_name,

        username,
        email,
        phone,
        id,
        userId,
        "Usuario"
      )
    );

  const roles =
    collectRoleCandidates(rawUser);

  const role =
    normalizeCanonicalRole(roles);

  const permissions =
    collectPermissions(rawUser);

  const slug =
    normalizeString(
      pickFirst(
        rawUser.slug,
        profile.slug,
        account.slug,
        raw.slug,
        rawProfile.slug,
        rawAccount.slug,
        slugify(
          username ||
            displayName ||
            email ||
            String(userId || id || "usuario")
        )
      )
    );

  const avatar =
    normalizeAvatarUrl(rawUser);

  const normalizedTheme =
    normalizeTheme(
      pickFirst(
        rawUser.theme,
        preferences.theme,
        settings.theme,
        profile.theme,
        account.theme,
        meta.theme,
        claims.theme,

        raw.theme,
        rawPreferences.theme,
        rawSettings.theme,
        rawProfile.theme,
        rawAccount.theme,
        rawMeta.theme,
        rawClaims.theme
      )
    );

  const explicitDarkModeValue =
    pickFirst(
      hasOwn(rawUser, "darkMode") ? rawUser.darkMode : undefined,
      hasOwn(rawUser, "dark_mode") ? rawUser.dark_mode : undefined,

      hasOwn(preferences, "darkMode") ? preferences.darkMode : undefined,
      hasOwn(preferences, "dark_mode") ? preferences.dark_mode : undefined,

      hasOwn(settings, "darkMode") ? settings.darkMode : undefined,
      hasOwn(settings, "dark_mode") ? settings.dark_mode : undefined,

      hasOwn(profile, "darkMode") ? profile.darkMode : undefined,
      hasOwn(profile, "dark_mode") ? profile.dark_mode : undefined,

      hasOwn(account, "darkMode") ? account.darkMode : undefined,
      hasOwn(account, "dark_mode") ? account.dark_mode : undefined,

      hasOwn(raw, "darkMode") ? raw.darkMode : undefined,
      hasOwn(raw, "dark_mode") ? raw.dark_mode : undefined,

      hasOwn(rawPreferences, "darkMode") ? rawPreferences.darkMode : undefined,
      hasOwn(rawPreferences, "dark_mode") ? rawPreferences.dark_mode : undefined,

      hasOwn(rawSettings, "darkMode") ? rawSettings.darkMode : undefined,
      hasOwn(rawSettings, "dark_mode") ? rawSettings.dark_mode : undefined,

      hasOwn(rawProfile, "darkMode") ? rawProfile.darkMode : undefined,
      hasOwn(rawProfile, "dark_mode") ? rawProfile.dark_mode : undefined,

      hasOwn(rawAccount, "darkMode") ? rawAccount.darkMode : undefined,
      hasOwn(rawAccount, "dark_mode") ? rawAccount.dark_mode : undefined
    );

  const hasExplicitDarkMode =
    hasExplicitValue(explicitDarkModeValue);

  const darkMode =
    hasExplicitDarkMode
      ? normalizeBoolean(
          explicitDarkModeValue,
          false
        )
      : null;

  const clienteId =
    pickFirst(
      rawUser.clienteId,
      rawUser.clientId,
      rawUser.cliente_id,
      rawUser.customerId,
      rawUser.customer_id,

      profile.clienteId,
      profile.clientId,
      profile.cliente_id,
      profile.customerId,
      profile.customer_id,

      account.clienteId,
      account.clientId,
      account.cliente_id,
      account.customerId,
      account.customer_id,

      raw.clienteId,
      raw.clientId,
      raw.cliente_id,
      raw.customerId,
      raw.customer_id,

      rawProfile.clienteId,
      rawProfile.clientId,
      rawProfile.cliente_id,
      rawProfile.customerId,
      rawProfile.customer_id,

      rawAccount.clienteId,
      rawAccount.clientId,
      rawAccount.cliente_id,
      rawAccount.customerId,
      rawAccount.customer_id
    );

  const status =
    normalizeRoleKey(
      pickFirst(
        rawUser.status,
        rawUser.estado,
        rawUser.state,
        rawUser.accountStatus,
        profile.status,
        profile.estado,
        account.status,
        account.estado,
        raw.status,
        raw.estado,
        rawProfile.status,
        rawProfile.estado,
        rawAccount.status,
        rawAccount.estado,
        ""
      )
    );

  const statusDisabled =
    [
      "disabled",
      "inactive",
      "deleted",
      "blocked",
      "suspended",
      "banned",
    ].includes(status);

  const explicitActiveValue =
    pickFirst(
      rawUser.active,
      rawUser.is_active,
      rawUser.isActive,
      rawUser.enabled,

      profile.active,
      profile.isActive,
      profile.is_active,
      profile.enabled,

      account.active,
      account.isActive,
      account.enabled,

      raw.active,
      raw.is_active,
      raw.isActive,
      raw.enabled,

      rawProfile.active,
      rawProfile.isActive,
      rawProfile.is_active,
      rawProfile.enabled,

      rawAccount.active,
      rawAccount.isActive,
      rawAccount.enabled
    );

  const active =
    statusDisabled
      ? false
      : normalizeBoolean(
          explicitActiveValue,
          true
        );

  const emailVerified =
    normalizeBoolean(
      pickFirst(
        rawUser.emailVerified,
        rawUser.email_verified,

        profile.emailVerified,
        profile.email_verified,

        account.emailVerified,
        account.email_verified,

        raw.emailVerified,
        raw.email_verified,

        rawProfile.emailVerified,
        rawProfile.email_verified,

        rawAccount.emailVerified,
        rawAccount.email_verified
      ),
      false
    );

  const twofaEnabled =
    normalizeBoolean(
      pickFirst(
        rawUser.twofa_enabled,
        rawUser.twofaEnabled,
        rawUser.twoFactorEnabled,
        rawUser.mfaEnabled,
        rawUser.mfa_enabled,

        profile.twofa_enabled,
        profile.twofaEnabled,
        profile.twoFactorEnabled,
        profile.mfaEnabled,
        profile.mfa_enabled,

        account.twofa_enabled,
        account.twofaEnabled,
        account.twoFactorEnabled,
        account.mfaEnabled,
        account.mfa_enabled,

        raw.twofa_enabled,
        raw.twofaEnabled,
        raw.twoFactorEnabled,
        raw.mfaEnabled,
        raw.mfa_enabled,

        rawProfile.twofa_enabled,
        rawProfile.twofaEnabled,
        rawProfile.twoFactorEnabled,
        rawProfile.mfaEnabled,
        rawProfile.mfa_enabled,

        rawAccount.twofa_enabled,
        rawAccount.twofaEnabled,
        rawAccount.twoFactorEnabled,
        rawAccount.mfaEnabled,
        rawAccount.mfa_enabled
      ),
      false
    );

  const cleanProfile =
    sanitizeRawObject(profile, 0);

  const cleanAccount =
    sanitizeRawObject(account, 0);

  const cleanMeta =
    sanitizeRawObject(meta, 0);

  const cleanClaims =
    sanitizeRawObject(claims, 0);

  return {
    id:
      id || null,

    userId:
      userId || id || null,

    username,
    slug,

    name:
      displayName || "Usuario",

    displayName:
      displayName || "Usuario",

    email:
      email || "",

    phone:
      phone || null,

    role,
    rol:
      role,

    roles,

    permissions,

    isAdmin:
      roles.some(isAdminRole),

    admin:
      roles.some(isAdminRole),

    isSupport:
      roles.some(isSupportRole),

    isManager:
      roles.some(isManagerRole),

    isClient:
      roles.some(isClientRole),

    clienteId:
      clienteId || null,

    clientId:
      clienteId || null,

    customerId:
      clienteId || null,

    privacyMode:
      normalizeBoolean(
        pickFirst(
          rawUser.privacyMode,
          rawUser.privacy_mode,
          profile.privacyMode,
          profile.privacy_mode,
          account.privacyMode,
          account.privacy_mode,
          raw.privacyMode,
          raw.privacy_mode,
          rawProfile.privacyMode,
          rawProfile.privacy_mode,
          rawAccount.privacyMode,
          rawAccount.privacy_mode
        ),
        false
      ),

    hasAvatar:
      Boolean(avatar),

    avatar,
    avatarUrl:
      avatar,

    photoUrl:
      avatar,

    picture:
      avatar,

    avatarUpdatedAt:
      pickFirst(
        rawUser.avatarUpdatedAt,
        rawUser.avatar_updated_at,
        profile.avatarUpdatedAt,
        profile.avatar_updated_at,
        account.avatarUpdatedAt,
        account.avatar_updated_at,
        raw.avatarUpdatedAt,
        raw.avatar_updated_at,
        rawProfile.avatarUpdatedAt,
        rawProfile.avatar_updated_at,
        rawAccount.avatarUpdatedAt,
        rawAccount.avatar_updated_at
      ) || null,

    active,

    status:
      status || null,

    /*
      null = backend no lo especificó.
      No usar false por defecto.
    */
    darkMode,

    theme:
      normalizedTheme || null,

    emailVerified,

    twofa_enabled:
      twofaEnabled,

    twofaEnabled,

    profile:
      cleanProfile || {},

    account:
      cleanAccount || {},

    meta:
      cleanMeta || {},

    claims:
      cleanClaims || {},

    raw:
      sanitizeRawObject(rawUser, 0),
  };
}

/* =========================================================
   SESSION PAYLOAD
========================================================= */

export function normalizeSessionPayload(payload = null) {
  if (!isObject(payload)) {
    return null;
  }

  const objects =
    collectAuthObjects(payload);

  const sessionNode =
    pickFirstObject(
      ...objects.map((item) => item.session),
      ...objects.map((item) => item.sessionData),
      ...objects.map((item) => item.authSession),
      ...objects.map((item) => item.auth_session)
    ) || {};

  const max =
    getSessionValueMaxLength();

  const sessionId =
    safeSessionValue(
      pickFirst(
        sessionNode.sessionId,
        sessionNode.session_id,
        sessionNode.sid,
        sessionNode.id,

        pickValueFromObjects(
          objects,
          [
            "sessionId",
            "session_id",
            "sid",
          ]
        )
      ) || "",
      max
    );

  const userCandidate =
    extractUser(payload);

  const userId =
    safeSessionValue(
      pickFirst(
        sessionNode.sessionUserId,
        sessionNode.session_user_id,
        sessionNode.userId,
        sessionNode.user_id,
        sessionNode.uid,
        sessionNode.sub,

        pickValueFromObjects(
          objects,
          [
            "sessionUserId",
            "session_user_id",
            "userId",
            "user_id",
            "uid",
            "sub",
          ]
        ),

        userCandidate?.userId,
        userCandidate?.id,
        userCandidate?.email
      ) || "",
      max
    );

  const expiresAt =
    pickFirst(
      sessionNode.expiresAt,
      sessionNode.expires_at,
      sessionNode.refreshExpiresAt,
      sessionNode.refresh_expires_at,
      sessionNode.exp,

      pickValueFromObjects(
        objects,
        [
          "expiresAt",
          "expires_at",
          "refreshExpiresAt",
          "refresh_expires_at",
          "exp",
          "expiration",
          "expires",
        ]
      )
    ) || null;

  const hasSessionData =
    Boolean(
      sessionId ||
        userId ||
        expiresAt
    );

  if (!hasSessionData) {
    return null;
  }

  return {
    id:
      sessionId || null,

    sessionId:
      sessionId || null,

    session_id:
      sessionId || null,

    userId:
      userId || null,

    user_id:
      userId || null,

    sessionUserId:
      userId || null,

    session_user_id:
      userId || null,

    expiresAt,

    refreshExpiresAt:
      pickFirst(
        sessionNode.refreshExpiresAt,
        sessionNode.refresh_expires_at,
        expiresAt
      ) || null,

    createdAt:
      pickFirst(
        sessionNode.createdAt,
        sessionNode.created_at,
        pickValueFromObjects(
          objects,
          [
            "createdAt",
            "created_at",
          ]
        )
      ) || null,

    lastActiveAt:
      pickFirst(
        sessionNode.lastActiveAt,
        sessionNode.last_active_at,
        pickValueFromObjects(
          objects,
          [
            "lastActiveAt",
            "last_active_at",
          ]
        )
      ) || null,

    lastRefreshAt:
      pickFirst(
        sessionNode.lastRefreshAt,
        sessionNode.last_refresh_at,
        pickValueFromObjects(
          objects,
          [
            "lastRefreshAt",
            "last_refresh_at",
          ]
        )
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

  const objects =
    collectAuthObjects(payload);

  return normalizeTokenLike(
    pickValueFromObjects(
      objects,
      TOKEN_KEYS
    ),
    getTokenMaxLength()
  );
}

export function extractRefreshToken(payload = null) {
  if (!payload) {
    return null;
  }

  const objects =
    collectAuthObjects(payload);

  return normalizeTokenLike(
    pickValueFromObjects(
      objects,
      REFRESH_TOKEN_KEYS
    ),
    getTokenMaxLength()
  );
}

export function extractTempToken(payload = null) {
  if (!payload) {
    return null;
  }

  const objects =
    collectAuthObjects(payload);

  return normalizeTokenLike(
    pickValueFromObjects(
      objects,
      TEMP_TOKEN_KEYS
    ),
    getTokenMaxLength()
  );
}

/* =========================================================
   2FA
========================================================= */

export function extractRequires2FA(payload = null) {
  if (!payload) {
    return false;
  }

  const objects =
    collectAuthObjects(payload);

  const status =
    normalizeRoleKey(
      getStatusValue(payload) || ""
    );

  if (TWO_FACTOR_STATUS_KEYS.has(status)) {
    return true;
  }

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
    "challengeRequired",
    "challenge_required",
  ];

  return objects.some((object) =>
    boolKeys.some((key) =>
      normalizeBoolean(
        object?.[key],
        false
      )
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

  const objects =
    collectAuthObjects(payload);

  for (const object of objects) {
    const direct =
      pickFirstObject(
        object.user,
        object.usuario,
        object.me,
        object.profile,
        object.account,
        object.currentUser,
        object.current_user
      );

    if (looksLikeUser(direct)) {
      return normalizeUser(direct);
    }
  }

  /*
    Respuesta /me directa:
      { id, email, role, ... }
  */
  if (
    looksLikeUser(payload) &&
    (
      !isAuthEnvelope(payload) ||
      hasNestedUserIdentity(payload)
    )
  ) {
    return normalizeUser(payload);
  }

  const unwrapped =
    unwrapAuthPayload(payload);

  if (
    unwrapped &&
    unwrapped !== payload
  ) {
    return extractUser(unwrapped);
  }

  return null;
}

/* =========================================================
   AUTH RESPONSE VALIDATION
========================================================= */

export function validateAuthResponse(response = null, options = {}) {
  const opts =
    isObject(options)
      ? options
      : {};

  if (isExplicitAuthFailure(response)) {
    const message =
      getResponseMessage(response) ||
      "No se pudo iniciar sesión.";

    throw createAuthNormalizeError(
      message,
      {
        status:
          Number(getStatusValue(response)) || 401,

        code:
          getErrorCode(response) ||
          "INVALID_CREDENTIALS",

        response,
      }
    );
  }

  const token =
    extractToken(response);

  const user =
    extractUser(response);

  const refreshToken =
    extractRefreshToken(response);

  const requires2FA =
    extractRequires2FA(response);

  const tempToken =
    extractTempToken(response);

  const sessionData =
    normalizeSessionPayload(response);

  const hasToken =
    Boolean(
      normalizeString(token)
    );

  const hasUser =
    hasUsableUserIdentity(user);

  const mode =
    normalizeRoleKey(
      opts.mode ||
        opts.flow ||
        opts.type ||
        "generic"
    );

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

  if (requires2FA) {
    if (
      !tempToken &&
      opts.allow2FAWithoutTempToken !== true
    ) {
      throw createAuthNormalizeError(
        "Se requiere 2FA pero no se recibió token temporal.",
        {
          status:
            401,

          code:
            "MISSING_2FA_TEMP_TOKEN",

          response,
        }
      );
    }

    return {
      ok:
        true,

      success:
        true,

      authenticated:
        false,

      status:
        "2fa_required",

      token:
        null,

      accessToken:
        null,

      user:
        null,

      refreshToken:
        null,

      session:
        null,

      sessionData:
        null,

      tempToken:
        tempToken || null,

      requires2FA:
        true,

      response,
    };
  }

  if (
    hasToken &&
    hasUser
  ) {
    return {
      ok:
        true,

      success:
        true,

      authenticated:
        true,

      status:
        "authenticated",

      token:
        token || null,

      accessToken:
        token || null,

      user:
        user || null,

      refreshToken:
        refreshToken || null,

      session:
        sessionData || null,

      sessionData:
        sessionData || null,

      tempToken:
        null,

      requires2FA:
        false,

      response,
    };
  }

  /*
    Compatibilidad controlada:
    - refresh puede devolver token_only.
    - /me puede devolver user_only.
    - ninguno de los dos marca authenticated.
  */
  if (
    hasToken &&
    !hasUser &&
    !requireAuthenticated &&
    !requireUser
  ) {
    return {
      ok:
        true,

      success:
        true,

      authenticated:
        false,

      status:
        "token_only",

      token:
        token || null,

      accessToken:
        token || null,

      user:
        null,

      refreshToken:
        refreshToken || null,

      session:
        sessionData || null,

      sessionData:
        sessionData || null,

      tempToken:
        null,

      requires2FA:
        false,

      response,
    };
  }

  if (
    !hasToken &&
    hasUser &&
    !requireAuthenticated &&
    !requireToken
  ) {
    return {
      ok:
        true,

      success:
        true,

      authenticated:
        false,

      status:
        "user_only",

      token:
        null,

      accessToken:
        null,

      user:
        user || null,

      refreshToken:
        refreshToken || null,

      session:
        sessionData || null,

      sessionData:
        sessionData || null,

      tempToken:
        null,

      requires2FA:
        false,

      response,
    };
  }

  throw createAuthNormalizeError(
    "La respuesta del API no contiene una sesión válida.",
    {
      status:
        401,

      code:
        requireAuthenticated
          ? "INVALID_LOGIN_SESSION"
          : requireToken
            ? "TOKEN_MISSING"
            : requireUser
              ? "USER_MISSING"
              : "INVALID_AUTH_RESPONSE",

      response,
    }
  );
}

/* =========================================================
   NORMALIZED AUTH RESPONSE
========================================================= */

export function normalizeAuthResponse(response = null, options = {}) {
  try {
    const validated =
      validateAuthResponse(
        response,
        options
      );

    return {
      ...validated,

      error:
        null,

      valid:
        true,

      explicitFailure:
        false,

      code:
        getErrorCode(response) || "",

      message:
        getResponseMessage(response) || "",
    };
  } catch (error) {
    return {
      ok:
        false,

      success:
        false,

      authenticated:
        false,

      status:
        error?.data?.status ||
        error?.status ||
        "invalid",

      code:
        error?.code ||
        error?.data?.code ||
        getErrorCode(response) ||
        "INVALID_LOGIN_SESSION",

      message:
        error?.message ||
        getResponseMessage(response) ||
        "La respuesta del API no contiene una sesión válida.",

      token:
        null,

      accessToken:
        null,

      user:
        null,

      refreshToken:
        null,

      session:
        null,

      sessionData:
        null,

      tempToken:
        null,

      requires2FA:
        false,

      valid:
        false,

      explicitFailure:
        isExplicitAuthFailure(response),

      error,
      response,
    };
  }
}

/* =========================================================
   DEBUG SNAPSHOT
========================================================= */

export function getAuthNormalizeSnapshot(response = null) {
  const token =
    extractToken(response);

  const refreshToken =
    extractRefreshToken(response);

  const tempToken =
    extractTempToken(response);

  const user =
    extractUser(response);

  const normalized =
    normalizeAuthResponse(
      response,
      {
        allow2FAWithoutTempToken:
          true,
      }
    );

  return {
    version:
      AUTH_NORMALIZE_VERSION,

    explicitFailure:
      isExplicitAuthFailure(response),

    status:
      getStatusValue(response) || null,

    normalizedStatus:
      normalized.status || null,

    code:
      getErrorCode(response) || null,

    message:
      getResponseMessage(response) || null,

    valid:
      Boolean(normalized.valid),

    authenticated:
      Boolean(normalized.authenticated),

    hasToken:
      Boolean(token),

    tokenPreview:
      token
        ? redactToken(token)
        : null,

    hasRefreshToken:
      Boolean(refreshToken),

    refreshTokenPreview:
      refreshToken
        ? redactToken(refreshToken)
        : null,

    hasTempToken:
      Boolean(tempToken),

    tempTokenPreview:
      tempToken
        ? redactToken(tempToken)
        : null,

    requires2FA:
      extractRequires2FA(response),

    hasUser:
      Boolean(user),

    user:
      user
        ? {
            id:
              user.id || null,

            userId:
              user.userId || null,

            username:
              user.username || null,

            email:
              user.email || null,

            role:
              user.role || null,

            roles:
              user.roles || [],

            isAdmin:
              Boolean(user.isAdmin),

            isSupport:
              Boolean(user.isSupport),

            isManager:
              Boolean(user.isManager),

            isClient:
              Boolean(user.isClient),

            hasAvatar:
              Boolean(user.hasAvatar),

            theme:
              user.theme || null,

            darkMode:
              user.darkMode,
          }
        : null,

    sessionData:
      normalizeSessionPayload(response),
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

  extractToken,
  extractRefreshToken,
  extractTempToken,
  extractRequires2FA,
  extractUser,

  validateAuthResponse,
  normalizeAuthResponse,

  getAuthNormalizeSnapshot,
};
