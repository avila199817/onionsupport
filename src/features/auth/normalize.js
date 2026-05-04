/* =========================================================
   Onion SPA - Auth Normalize
   Archivo: src/features/auth/normalize.js

   FINAL PRO SYSTEM · AUTH NORMALIZER · ADMIN ROLE HARDENED · 10/10

   RESPONSABILIDADES:
   - normalizar user heterogéneo backend
   - normalizar payload de sesión
   - extraer tokens desde respuestas variables
   - validar respuesta de login / refresh / me
   - normalizar avatar robusto para sidebar / topbar
   - endurecer tipos / strings / arrays
   - detectar 2FA con variantes comunes
   - preservar roles / permisos / flags admin
   - blindaje enterprise edge cases

   HARDENING EXTREMO:
   - no pierde role / rol / roles / permissions / claims
   - normaliza admin / superadmin / administrator / owner / root como admin
   - expone user.role, user.roles, user.isAdmin
   - soporta payloads nested { ok, data, payload, result, body, response, user, me, account }
   - conserva raw completo
   - evita tratar envelopes auth como usuario
   - no trunca tokens corruptos: los invalida
   - no fuerza darkMode:false si backend no lo envió explícitamente
   - soporta permisos como array, string u objeto boolean-map
   - snapshots sin tokens reales

   FIX 10/10:
   - no considera login válido si falta token + usuario usable
   - detecta ok:false / success:false / status >= 400 / status textual auth-fail
   - no normaliza un envelope auth como si fuera usuario
   - user-only y token-only quedan como payload parcial, no authenticated
   - 2FA exige tempToken/challengeToken usable salvo override explícito
   - tokens se normalizan con límites estrictos
========================================================= */

import {
  sanitizeUsername,
  slugify,
} from "./helpers.js";

import {
  AUTH_CONSTANTS,
} from "./constants.js";

/* =========================================================
   ROLE CONSTANTS
========================================================= */

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
  ]);

const MANAGER_ROLE_KEYS =
  new Set([
    "manager",
    "gestor",
    "gerente",
    "lead",
  ]);

const AUTH_FAILURE_CODES =
  new Set([
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

const TOKEN_KEYS =
  new Set([
    "token",
    "accessToken",
    "access_token",
    "authToken",
    "auth_token",
    "jwt",
    "idToken",
    "id_token",
  ]);

const REFRESH_TOKEN_KEYS =
  new Set([
    "refreshToken",
    "refresh_token",
  ]);

const TEMP_TOKEN_KEYS =
  new Set([
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
    "null",
    "undefined",
    "false",
    "none",
    "nan",
    "[object object]",
  ]);

const DEFAULT_TOKEN_MAX_LENGTH =
  8192;

const DEFAULT_SESSION_VALUE_MAX_LENGTH =
  200;

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

/* =========================================================
   BASIC HELPERS
========================================================= */

function normalizeString(value = "") {
  return String(value ?? "")
    .trim();
}

function safeLower(value = "") {
  return normalizeString(value)
    .toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
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
      value
        .trim()
        .toLowerCase();

    if (
      [
        "1",
        "true",
        "yes",
        "on",
        "si",
        "sí",
        "ok",
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

    return value;
  }

  return null;
}

function pickFirstText(...values) {
  const value =
    pickFirst(...values);

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
      values.filter(Boolean)
    )
  );
}

function normalizeEmail(value = "") {
  return safeLower(value);
}

function safeSessionValue(value = "", maxLength = DEFAULT_SESSION_VALUE_MAX_LENGTH) {
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

function normalizeTokenLike(value = null, maxLength = AUTH_CONSTANTS?.tokenMaxLength || DEFAULT_TOKEN_MAX_LENGTH) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  let normalized =
    String(value)
      .trim();

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
    no truncamos tokens. Un token truncado es un token corrupto.
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
      itemValue === "sí"
    )
    .map(([key]) => key);
}

function normalizeRoleList(value) {
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

function expandRoleAliases(roles = []) {
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
    isObject(rawUser.profile)
      ? rawUser.profile
      : {};

  const settings =
    isObject(rawUser.settings)
      ? rawUser.settings
      : {};

  const preferences =
    isObject(rawUser.preferences)
      ? rawUser.preferences
      : {};

  const rawProfile =
    isObject(raw.profile)
      ? raw.profile
      : {};

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

      raw.hasAvatar,
      raw.has_avatar,
      raw.avatarEnabled,
      raw.avatar_enabled,

      rawProfile.hasAvatar,
      rawProfile.has_avatar,
      rawProfile.avatarEnabled,
      rawProfile.avatar_enabled
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
      rawProfile.picture_url
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

function isAuthEnvelope(value = {}) {
  if (!isObject(value)) {
    return false;
  }

  return Boolean(
    hasOwn(value, "ok") ||
      hasOwn(value, "success") ||
      hasOwn(value, "status") ||
      hasOwn(value, "statusCode") ||
      hasOwn(value, "status_code") ||

      [...TOKEN_KEYS].some((key) =>
        hasOwn(value, key)
      ) ||

      [...REFRESH_TOKEN_KEYS].some((key) =>
        hasOwn(value, key)
      ) ||

      [...TEMP_TOKEN_KEYS].some((key) =>
        hasOwn(value, key)
      ) ||

      hasOwn(value, "data") ||
      hasOwn(value, "payload") ||
      hasOwn(value, "result") ||
      hasOwn(value, "body") ||
      hasOwn(value, "response") ||
      hasOwn(value, "session") ||
      hasOwn(value, "sessionData") ||
      hasOwn(value, "auth") ||
      hasOwn(value, "authData")
  );
}

function looksLikeUser(value = null) {
  if (!isObject(value)) {
    return false;
  }

  if (
    isAuthEnvelope(value) &&
    !hasUsableUserIdentity(value)
  ) {
    return false;
  }

  return Boolean(
    hasUsableUserIdentity(value) ||
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

  /*
    Si el objeto ya parece usuario real, no lo desnudamos.
  */
  if (
    looksLikeUser(payload) &&
    hasUsableUserIdentity(payload)
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
  } =
    getNestedAuthNodes(payload);

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
  } =
    getNestedAuthNodes(payload);

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
    session.error,

    auth.code,
    auth.errorCode,
    auth.error_code,
    auth.error,

    sessionData.code,
    sessionData.errorCode,
    sessionData.error_code,
    sessionData.error,

    authData.code,
    authData.errorCode,
    authData.error_code,
    authData.error
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
  } =
    getNestedAuthNodes(payload);

  return pickFirstText(
    root.message,
    root.mensaje,
    root.errorMessage,
    root.error_message,
    root.detail,
    root.description,

    data.message,
    data.mensaje,
    data.errorMessage,
    data.error_message,
    data.detail,
    data.description,

    payloadNode.message,
    payloadNode.mensaje,
    payloadNode.errorMessage,
    payloadNode.error_message,
    payloadNode.detail,

    result.message,
    result.mensaje,
    result.errorMessage,
    result.error_message,
    result.detail,

    body.message,
    body.mensaje,
    body.errorMessage,
    body.error_message,
    body.detail,

    responseData.message,
    responseData.mensaje,
    responseData.errorMessage,
    responseData.error_message,
    responseData.detail,

    session.message,
    session.mensaje,
    session.detail,

    auth.message,
    auth.mensaje,
    auth.detail,

    sessionData.message,
    sessionData.mensaje,
    sessionData.detail,

    authData.message,
    authData.mensaje,
    authData.detail
  );
}

function isExplicitAuthFailure(payload = null) {
  if (
    !payload ||
    !isObject(payload)
  ) {
    return false;
  }

  const {
    root,
    data,
    payload: payloadNode,
    result,
    body,
    response,
    responseData,
  } =
    getNestedAuthNodes(payload);

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

  /*
    Evita tratar status "active", "authenticated", "ok" como fallo.
  */
  if (
    statusText &&
    AUTH_SUCCESS_STATUS_KEYS.has(statusText)
  ) {
    // no-op
  }

  const code =
    getErrorCode(payload)
      .toUpperCase();

  if (
    code &&
    AUTH_FAILURE_CODES.has(code)
  ) {
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
    response.ok === false ||
    response.success === false ||
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
  const error =
    new Error(message);

  error.name =
    "AuthNormalizeError";

  error.status =
    status;

  error.code =
    code;

  error.data =
    {
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
    isObject(rawUser)
      ? rawUser
      : {};

  const raw =
    getNestedRawUser(user);

  const profile =
    isObject(user.profile)
      ? user.profile
      : {};

  const permissionsNode =
    isObject(user.permissions)
      ? user.permissions
      : {};

  const meta =
    isObject(user.meta)
      ? user.meta
      : {};

  const claims =
    isObject(user.claims)
      ? user.claims
      : {};

  const account =
    isObject(user.account)
      ? user.account
      : {};

  const rawProfile =
    isObject(raw.profile)
      ? raw.profile
      : {};

  const rawMeta =
    isObject(raw.meta)
      ? raw.meta
      : {};

  const rawClaims =
    isObject(raw.claims)
      ? raw.claims
      : {};

  const roleCandidates =
    [
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

  const roleArrays =
    [
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

      rawMeta.roles,
      rawMeta.groups,

      rawClaims.roles,
      rawClaims.groups,
    ];

  const roles =
    [
      ...roleCandidates,
      ...roleArrays.flatMap((value) =>
        toArray(value)
      ),
    ];

  const adminFlag =
    [
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
      normalizeBoolean(value, false)
    );

  if (adminFlag) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function collectPermissions(rawUser = {}) {
  const user =
    isObject(rawUser)
      ? rawUser
      : {};

  const raw =
    getNestedRawUser(user);

  const profile =
    isObject(user.profile)
      ? user.profile
      : {};

  const meta =
    isObject(user.meta)
      ? user.meta
      : {};

  const claims =
    isObject(user.claims)
      ? user.claims
      : {};

  const permissionsNode =
    isObject(user.permissions)
      ? user.permissions
      : {};

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

    ...normalizePermissionList(raw?.profile?.permissions),
    ...normalizePermissionList(raw?.profile?.scopes),
    ...normalizePermissionList(raw?.profile?.authorities),

    ...normalizePermissionList(raw?.meta?.permissions),
    ...normalizePermissionList(raw?.meta?.scopes),

    ...normalizePermissionList(raw?.claims?.permissions),
    ...normalizePermissionList(raw?.claims?.scopes),
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
    No normalizamos un envelope completo como usuario.
    Ejemplo peligroso:
      { ok:true, token:"...", data:{...} }
  */
  if (
    isAuthEnvelope(rawUser) &&
    !hasUsableUserIdentity(rawUser)
  ) {
    return null;
  }

  const raw =
    getNestedRawUser(rawUser);

  const profile =
    isObject(rawUser.profile)
      ? rawUser.profile
      : {};

  const account =
    isObject(rawUser.account)
      ? rawUser.account
      : {};

  const preferences =
    isObject(rawUser.preferences)
      ? rawUser.preferences
      : {};

  const settings =
    isObject(rawUser.settings)
      ? rawUser.settings
      : {};

  const rawProfile =
    isObject(raw.profile)
      ? raw.profile
      : {};

  const rawPreferences =
    isObject(raw.preferences)
      ? raw.preferences
      : {};

  const rawSettings =
    isObject(raw.settings)
      ? raw.settings
      : {};

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

      raw.phone,
      raw.telefono,
      raw.mobile,
      raw.cellphone,

      rawProfile.phone,
      rawProfile.telefono,
      rawProfile.mobile,
      rawProfile.cellphone
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
      rawProfile.sub
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
      rawProfile.sub
    );

  const username =
    sanitizeUsername(
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

        email
      ) || ""
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

        username,
        email,
        phone,
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
        slugify(
          username ||
            displayName ||
            email ||
            "usuario"
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
        raw.theme,
        rawPreferences.theme,
        rawSettings.theme,
        rawProfile.theme
      )
    );

  const explicitDarkModeValue =
    pickFirst(
      hasOwn(rawUser, "darkMode")
        ? rawUser.darkMode
        : undefined,
      hasOwn(rawUser, "dark_mode")
        ? rawUser.dark_mode
        : undefined,
      hasOwn(preferences, "darkMode")
        ? preferences.darkMode
        : undefined,
      hasOwn(preferences, "dark_mode")
        ? preferences.dark_mode
        : undefined,
      hasOwn(settings, "darkMode")
        ? settings.darkMode
        : undefined,
      hasOwn(settings, "dark_mode")
        ? settings.dark_mode
        : undefined,
      hasOwn(raw, "darkMode")
        ? raw.darkMode
        : undefined,
      hasOwn(raw, "dark_mode")
        ? raw.dark_mode
        : undefined,
      hasOwn(rawPreferences, "darkMode")
        ? rawPreferences.darkMode
        : undefined,
      hasOwn(rawPreferences, "dark_mode")
        ? rawPreferences.dark_mode
        : undefined,
      hasOwn(rawSettings, "darkMode")
        ? rawSettings.darkMode
        : undefined,
      hasOwn(rawSettings, "dark_mode")
        ? rawSettings.dark_mode
        : undefined
    );

  const hasExplicitDarkMode =
    hasExplicitValue(explicitDarkModeValue);

  const darkMode =
    hasExplicitDarkMode
      ? normalizeBoolean(explicitDarkModeValue, false)
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

      account.clienteId,
      account.clientId,
      account.cliente_id,
      account.customerId,

      raw.clienteId,
      raw.clientId,
      raw.cliente_id,
      raw.customerId,
      raw.customer_id
    );

  const active =
    normalizeBoolean(
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
        raw.enabled
      ),
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
        raw.email_verified
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

        raw.twofa_enabled,
        raw.twofaEnabled,
        raw.twoFactorEnabled,
        raw.mfaEnabled,
        raw.mfa_enabled
      ),
      false
    );

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

    clienteId:
      clienteId || null,

    clientId:
      clienteId || null,

    privacyMode:
      normalizeBoolean(
        pickFirst(
          rawUser.privacyMode,
          rawUser.privacy_mode,
          profile.privacyMode,
          profile.privacy_mode,
          raw.privacyMode,
          raw.privacy_mode
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

    avatarUpdatedAt:
      pickFirst(
        rawUser.avatarUpdatedAt,
        rawUser.avatar_updated_at,
        profile.avatarUpdatedAt,
        profile.avatar_updated_at,
        raw.avatarUpdatedAt,
        raw.avatar_updated_at
      ) || null,

    active,

    /*
      CRÍTICO:
      null significa "backend no lo especificó".
      No usar false por defecto, porque Core Session podría interpretarlo
      como preferencia explícita light.
    */
    darkMode,

    theme:
      normalizedTheme || null,

    emailVerified,

    twofa_enabled:
      twofaEnabled,
    twofaEnabled,

    raw:
      safeClone(rawUser, null),
  };
}

/* =========================================================
   SESSION PAYLOAD
========================================================= */

export function normalizeSessionPayload(payload = null) {
  if (!isObject(payload)) {
    return null;
  }

  const nodes =
    getNestedAuthNodes(payload);

  const sessionNode =
    pickFirstObject(
      nodes.session,
      nodes.data?.session,
      nodes.data?.sessionData,
      nodes.payload?.session,
      nodes.payload?.sessionData,
      nodes.result?.session,
      nodes.result?.sessionData,
      nodes.body?.session,
      nodes.body?.sessionData,
      nodes.meta?.session,
      nodes.root.session,
      nodes.root.sessionData
    ) || {};

  const max =
    AUTH_CONSTANTS?.sessionValueMaxLength ||
    DEFAULT_SESSION_VALUE_MAX_LENGTH;

  const sessionId =
    safeSessionValue(
      pickFirst(
        sessionNode.sessionId,
        sessionNode.session_id,
        sessionNode.id,

        nodes.root.sessionId,
        nodes.root.session_id,

        nodes.data?.sessionId,
        nodes.data?.session_id,

        nodes.payload?.sessionId,
        nodes.payload?.session_id,

        nodes.result?.sessionId,
        nodes.result?.session_id,

        nodes.body?.sessionId,
        nodes.body?.session_id,

        nodes.meta?.sessionId,
        nodes.meta?.session_id
      ) || "",
      max
    );

  const userId =
    safeSessionValue(
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
        nodes.payload?.user?.id,

        nodes.result?.userId,
        nodes.result?.user_id,
        nodes.result?.user?.userId,
        nodes.result?.user?.id,

        nodes.body?.userId,
        nodes.body?.user_id,
        nodes.body?.user?.userId,
        nodes.body?.user?.id,

        nodes.meta?.userId,
        nodes.meta?.user_id
      ) || "",
      max
    );

  const hasSessionData =
    Boolean(
      sessionId ||
        userId ||
        sessionNode.expiresAt ||
        sessionNode.expires_at ||
        nodes.root.expiresAt ||
        nodes.root.expires_at
    );

  if (!hasSessionData) {
    return null;
  }

  return {
    sessionId:
      sessionId || null,

    userId:
      userId || null,

    expiresAt:
      pickFirst(
        sessionNode.expiresAt,
        sessionNode.expires_at,
        nodes.root.expiresAt,
        nodes.root.expires_at,
        nodes.root.exp,
        nodes.data?.expiresAt,
        nodes.data?.expires_at,
        nodes.payload?.expiresAt,
        nodes.payload?.expires_at,
        nodes.result?.expiresAt,
        nodes.result?.expires_at
      ) || null,

    createdAt:
      pickFirst(
        sessionNode.createdAt,
        sessionNode.created_at,
        nodes.root.createdAt,
        nodes.root.created_at,
        nodes.data?.createdAt,
        nodes.data?.created_at
      ) || null,

    lastActiveAt:
      pickFirst(
        sessionNode.lastActiveAt,
        sessionNode.last_active_at,
        nodes.root.lastActiveAt,
        nodes.root.last_active_at,
        nodes.data?.lastActiveAt,
        nodes.data?.last_active_at
      ) || null,

    lastRefreshAt:
      pickFirst(
        sessionNode.lastRefreshAt,
        sessionNode.last_refresh_at,
        nodes.root.lastRefreshAt,
        nodes.root.last_refresh_at,
        nodes.data?.lastRefreshAt,
        nodes.data?.last_refresh_at
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
  } =
    getNestedAuthNodes(payload);

  return normalizeTokenLike(
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
      payloadNode.id_token,
      payloadNode.idToken,

      result.token,
      result.access_token,
      result.accessToken,
      result.auth_token,
      result.authToken,
      result.jwt,
      result.id_token,
      result.idToken,

      body.token,
      body.access_token,
      body.accessToken,
      body.auth_token,
      body.authToken,
      body.jwt,
      body.id_token,
      body.idToken,

      responseData.token,
      responseData.access_token,
      responseData.accessToken,
      responseData.auth_token,
      responseData.authToken,
      responseData.jwt,
      responseData.id_token,
      responseData.idToken,

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
    ),
    AUTH_CONSTANTS?.tokenMaxLength || DEFAULT_TOKEN_MAX_LENGTH
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
  } =
    getNestedAuthNodes(payload);

  return normalizeTokenLike(
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
    ),
    AUTH_CONSTANTS?.tokenMaxLength || DEFAULT_TOKEN_MAX_LENGTH
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
  } =
    getNestedAuthNodes(payload);

  return normalizeTokenLike(
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
      payloadNode.twoFactorToken,
      payloadNode.two_factor_token,
      payloadNode.mfaToken,
      payloadNode.mfa_token,

      result.tempToken,
      result.temp_token,
      result.temporaryToken,
      result.temporary_token,
      result.challengeToken,
      result.challenge_token,
      result.twoFactorToken,
      result.two_factor_token,
      result.mfaToken,
      result.mfa_token,

      body.tempToken,
      body.temp_token,
      body.temporaryToken,
      body.temporary_token,
      body.challengeToken,
      body.challenge_token,
      body.twoFactorToken,
      body.two_factor_token,
      body.mfaToken,
      body.mfa_token,

      responseData.tempToken,
      responseData.temp_token,
      responseData.temporaryToken,
      responseData.temporary_token,
      responseData.challengeToken,
      responseData.challenge_token,
      responseData.twoFactorToken,
      responseData.two_factor_token,
      responseData.mfaToken,
      responseData.mfa_token,

      session.tempToken,
      session.temp_token,
      session.temporaryToken,
      session.temporary_token,
      session.challengeToken,
      session.challenge_token,

      auth.tempToken,
      auth.temp_token,
      auth.temporaryToken,
      auth.temporary_token,
      auth.challengeToken,
      auth.challenge_token,

      sessionData.tempToken,
      sessionData.temp_token,
      sessionData.temporaryToken,
      sessionData.temporary_token,
      sessionData.challengeToken,
      sessionData.challenge_token,

      authData.tempToken,
      authData.temp_token,
      authData.temporaryToken,
      authData.temporary_token,
      authData.challengeToken,
      authData.challenge_token,

      meta.tempToken,
      meta.temp_token,
      meta.challengeToken,
      meta.challenge_token
    ),
    AUTH_CONSTANTS?.tokenMaxLength || DEFAULT_TOKEN_MAX_LENGTH
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
  } =
    getNestedAuthNodes(payload);

  const status =
    safeLower(
      getStatusValue(payload) || ""
    );

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
        root.require_2fa,
        root.requiresTwoFactor,
        root.twoFactorRequired,
        root.requiresMfa,
        root.requires_mfa,
        root.mfaRequired,
        root.mfa_required,

        data.requires2FA,
        data.requires_2fa,
        data.require2FA,
        data.require_2fa,
        data.requiresTwoFactor,
        data.twoFactorRequired,
        data.requiresMfa,
        data.requires_mfa,
        data.mfaRequired,
        data.mfa_required,

        payloadNode.requires2FA,
        payloadNode.requires_2fa,
        payloadNode.require2FA,
        payloadNode.require_2fa,
        payloadNode.requiresMfa,
        payloadNode.requires_mfa,
        payloadNode.twoFactorRequired,

        result.requires2FA,
        result.requires_2fa,
        result.require2FA,
        result.require_2fa,
        result.requiresMfa,
        result.requires_mfa,
        result.twoFactorRequired,

        body.requires2FA,
        body.requires_2fa,
        body.require2FA,
        body.require_2fa,
        body.requiresMfa,
        body.requires_mfa,
        body.twoFactorRequired,

        responseData.requires2FA,
        responseData.requires_2fa,
        responseData.require2FA,
        responseData.require_2fa,
        responseData.requiresMfa,
        responseData.requires_mfa,
        responseData.twoFactorRequired,

        session.requires2FA,
        session.requires_2fa,
        session.requiresMfa,
        session.requires_mfa,
        session.twoFactorRequired,

        auth.requires2FA,
        auth.requires_2fa,
        auth.requiresMfa,
        auth.requires_mfa,
        auth.twoFactorRequired,

        sessionData.requires2FA,
        sessionData.requires_2fa,
        sessionData.requiresMfa,
        sessionData.requires_mfa,
        sessionData.twoFactorRequired,

        authData.requires2FA,
        authData.requires_2fa,
        authData.requiresMfa,
        authData.requires_mfa,
        authData.twoFactorRequired,

        meta.requires2FA,
        meta.requires_2fa,
        meta.requiresMfa,
        meta.requires_mfa
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
  } =
    getNestedAuthNodes(payload);

  const direct =
    pickFirstObject(
      root.user,
      root.usuario,
      root.me,
      root.profile,
      root.account,
      root.currentUser,
      root.current_user,

      data.user,
      data.usuario,
      data.me,
      data.profile,
      data.account,
      data.currentUser,
      data.current_user,

      payloadNode.user,
      payloadNode.usuario,
      payloadNode.me,
      payloadNode.profile,
      payloadNode.account,
      payloadNode.currentUser,
      payloadNode.current_user,

      result.user,
      result.usuario,
      result.me,
      result.profile,
      result.account,
      result.currentUser,
      result.current_user,

      body.user,
      body.usuario,
      body.me,
      body.profile,
      body.account,
      body.currentUser,
      body.current_user,

      responseData.user,
      responseData.usuario,
      responseData.me,
      responseData.profile,
      responseData.account,
      responseData.currentUser,
      responseData.current_user,

      session.user,
      session.usuario,
      session.me,
      session.profile,
      session.account,
      session.currentUser,
      session.current_user,

      auth.user,
      auth.usuario,
      auth.me,
      auth.profile,
      auth.account,
      auth.currentUser,
      auth.current_user,

      sessionData.user,
      sessionData.usuario,
      sessionData.me,
      sessionData.profile,
      sessionData.account,
      sessionData.currentUser,
      sessionData.current_user,

      authData.user,
      authData.usuario,
      authData.me,
      authData.profile,
      authData.account,
      authData.currentUser,
      authData.current_user,

      meta.user,
      meta.usuario,
      meta.me,
      meta.profile,
      meta.account
    );

  if (looksLikeUser(direct)) {
    return normalizeUser(direct);
  }

  /*
    Respuesta /me directa:
      { id, email, role, ... }
  */
  if (
    looksLikeUser(payload) &&
    (
      !isAuthEnvelope(payload) ||
      hasUsableUserIdentity(payload)
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

  const explicitFailure =
    isExplicitAuthFailure(response);

  if (explicitFailure) {
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
      user:
        null,
      refreshToken:
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

  if (hasToken && hasUser) {
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
      user:
        user || null,
      refreshToken:
        refreshToken || null,
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
    Compatibilidad refresh/me:
    - token-only puede ser válido para refresh.
    - user-only puede ser válido para /me.
    - Nunca se marca authenticated.
  */
  if (hasToken && !hasUser) {
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
      user:
        null,
      refreshToken:
        refreshToken || null,
      sessionData:
        sessionData || null,

      tempToken:
        null,
      requires2FA:
        false,

      response,
    };
  }

  if (!hasToken && hasUser) {
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
      user:
        user || null,
      refreshToken:
        refreshToken || null,
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
        "INVALID_LOGIN_SESSION",
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
      user:
        null,
      refreshToken:
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
  normalizeAuthResponse,

  getAuthNormalizeSnapshot,
};
