/* =========================================================
   Onion SPA - Auth Session
   Archivo: src/features/auth/session.js

   AUTH SESSION · FINAL SIMPLE
   - Núcleo local de sesión Auth
   - token + user usable = authenticated true
   - token sin user = hasToken true, authenticated false
   - user sin token = authenticated false
   - Roles reales: admin / user
   - Sin fetch, refresh, login HTTP, Router, Toast ni storage paralelo
   - Sin localStorage.clear/sessionStorage.clear
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  normalizeUser,
} from "./normalize.js";

import {
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
  persistAuxSessionData,
  persistRefreshToken,
  persistTempToken,
  persistAccessToken,
  persistSessionContext,
  clearAuthStorage,
} from "./storage.js";

/* =========================================================
   VERSION
========================================================= */

export const AUTH_SESSION_VERSION = "20.0.0-final";

const SESSION_SOURCE = "auth.session";
const DEFAULT_ROUTE = "/";

const VALID_ROLES = Object.freeze(["admin", "user"]);

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
  "support",
  "soporte",
  "staff",
  "agent",
  "agente",
  "helpdesk",
  "operator",
  "operador",
  "tecnico",
  "técnico",
  "technician",
  "technical",
  "manager",
  "gestor",
  "gerente",
  "lead",
  "team_lead",
  "supervisor",
]);

const ACTIVATION_PATHS = Object.freeze([
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
]);

const RESET_CONFIRM_PATHS = Object.freeze([
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
]);

const PUBLIC_TECHNICAL_ROUTES = Object.freeze([
  ...ACTIVATION_PATHS,
  "/reset-password",
  ...RESET_CONFIRM_PATHS,
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/2fa",
  "/otp",
  "/mfa",
]);

const TOKEN_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "authToken",
  "auth_token",
  "jwt",
  "bearer",
  "idToken",
  "id_token",
]);

const REFRESH_TOKEN_KEYS = Object.freeze(["refreshToken", "refresh_token"]);

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
  "authUser",
  "auth_user",
  "sessionUser",
  "session_user",
]);

const SESSION_KEYS = Object.freeze([
  "session",
  "sessionData",
  "session_data",
  "authSession",
  "auth_session",
]);

const ROOT_OBJECT_KEYS = Object.freeze([
  "data",
  "payload",
  "result",
  "body",
  "response",
  "auth",
  "authData",
  "auth_data",
]);

const SESSION_ID_KEYS = Object.freeze(["sessionId", "session_id", "sid", "id"]);
const SESSION_USER_ID_KEYS = Object.freeze(["sessionUserId", "session_user_id", "userId", "user_id", "uid", "sub"]);
const SESSION_EXPIRES_KEYS = Object.freeze(["expiresAt", "expires_at", "refreshExpiresAt", "refresh_expires_at", "expiration", "expires", "exp"]);
const TOKEN_VERSION_KEYS = Object.freeze(["tokenVersion", "token_version", "tv"]);
const ROLE_KEYS = Object.freeze(["role", "rol", "userRole", "user_role", "type", "tipo", "userType", "user_type", "perfil"]);
const PERMISSION_KEYS = Object.freeze(["permissions", "permisos", "scopes", "scope", "authorities"]);

const BAD_TOKEN_VALUES = new Set([
  "",
  "null",
  "undefined",
  "false",
  "true",
  "nan",
  "none",
  "empty",
  "[object object]",
  "{}",
  "[]",
  "\"\"",
  "''",
  "\"null\"",
  "\"undefined\"",
  "\"false\"",
]);

const SENSITIVE_KEY_RE = /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|totp|mfa|2fa|csrf|xsrf|code/i;

const EVENTS = Object.freeze({
  state: "auth:session:state",
  applied: "auth:session:applied",
  partial: "auth:session:partial",
  restored: "auth:session:restored",
  cleared: "auth:session:cleared",
  appSessionChange: "app:session:change",
  appSessionRestored: "app:session:restored",
  appSessionCleared: "app:session:cleared",
  appAuthChange: "app:auth:change",
  authChange: "auth:change",
  userChange: "app:user:change",
});

/* =========================================================
   BASICS
========================================================= */

const isFunction = (value) => typeof value === "function";
const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1) return true;
  if (value === 0) return false;

  const text = safeText(value, "").toLowerCase();
  if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(text)) return true;
  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) return false;

  return Boolean(fallback);
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowIso(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }

  return null;
}

function firstText(...values) {
  return safeText(first(...values), "");
}

function unique(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function getState() {
  try {
    if (AppCore?.state && typeof AppCore.state === "object") return AppCore.state;
  } catch {}

  return {};
}

function safeSetState(patch = {}, options = {}) {
  const finalPatch = safeObject(patch);
  let committed = false;

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(finalPatch, {
        source: options.source || SESSION_SOURCE,
        emit: options.emit === true,
        emitState: options.emitState === true,
        emitDerived: options.emitDerived === true,
        silent: options.silent !== false,
        ...options,
      });
      committed = true;
    }
  } catch {}

  if (!committed) {
    try {
      if (isFunction(AppCore?.patchState)) {
        AppCore.patchState(finalPatch, {
          source: options.source || SESSION_SOURCE,
          emit: options.emit === true,
          emitState: options.emitState === true,
          silent: options.silent !== false,
          ...options,
        });
        committed = true;
      }
    } catch {}
  }

  if (!committed) {
    try {
      Object.assign(getState(), finalPatch);
    } catch {}
  }

  return getState();
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[AuthSession]", ...args.map((item) => sanitizeForEvent(item)));
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn("[AuthSession]", ...args.map((item) => sanitizeForEvent(item)));
  } catch {}
}

function safeRedact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(/([?&#](?:token|code|t|access_token|refresh_token|tempToken|temp_token|mfaToken|mfa_token|session|sid)=)([^&#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  }
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function sanitizePublicUser(user = null) {
  if (!isPlainObject(user)) return null;

  const output = { ...user };

  for (const key of Object.keys(output)) {
    if (SENSITIVE_KEY_RE.test(key) || key.startsWith("_")) delete output[key];
  }

  return output;
}

function sanitizeForEvent(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (depth > 4) return "[depth-limit]";

  if (typeof value === "string") return safeRedact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: safeText(value.name, "Error"),
      message: safeRedact(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || value.response?.status || null,
      stack: value.stack ? "[stack]" : null,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeForEvent(item, depth + 1, keyHint, seen));
  }

  if (value && typeof value === "object") {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = key === "user" ? sanitizePublicUser(item) : sanitizeForEvent(item, depth + 1, key, seen);
    }

    return output;
  }

  return safeRedact(String(value));
}

function safeEmit(eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!name || options.silent === true || options.emit === false || options.emitEvents === false) return false;

  const detail = sanitizeForEvent({
    source: SESSION_SOURCE,
    version: AUTH_SESSION_VERSION,
    at: nowIso(),
    ...safeObject(payload),
    token: null,
    accessToken: null,
    refreshToken: null,
    tempToken: null,
  });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function eventMode(options = {}) {
  const explicit = safeText(options.eventMode, "").toLowerCase();
  if (["login", "restore", "apply", "manual", "silent", "clear", "refresh", "me", "token_only", "user_only"].includes(explicit)) return explicit;

  const source = safeText(options.source, "").toLowerCase();
  if (source.includes("restore")) return "restore";
  if (source.includes("login")) return "login";
  if (source.includes("refresh")) return "refresh";
  if (source.includes("me")) return "me";

  return "apply";
}

/* =========================================================
   TOKEN / USER / ROLE
========================================================= */

function normalizeTokenValue(token = "") {
  let value = safeText(token, "").replace(/^Bearer\s+/i, "").trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  const maxLength = Number(AppCore?.config?.auth?.tokenMaxLength || 8192);

  if (BAD_TOKEN_VALUES.has(lower)) return "";
  if (/[\s\r\n\t]/.test(value)) return "";
  if (Number.isFinite(maxLength) && maxLength > 0 && value.length > maxLength) return "";

  try {
    if (isFunction(AppCore?.utils?.hasValidToken) && !AppCore.utils.hasValidToken(value)) return "";
  } catch {}

  return value;
}

function hasUsableToken(token = "") {
  return Boolean(normalizeTokenValue(token));
}

function normalizeRoleValue(value = "") {
  const role = safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");

  if (!role) return "";
  if (ADMIN_ALIASES.has(role)) return "admin";
  if (USER_ALIASES.has(role)) return "user";
  return "user";
}

function normalizeRoleRequirement(value = "") {
  const role = safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");

  if (role === "admin" || ADMIN_ALIASES.has(role)) return "admin";
  if (role === "user" || role === "usuario") return "user";
  return "";
}

function normalizeRoles(value) {
  const raw = typeof value === "string" ? value.split(/[,\s|]+/g) : safeArray(value).flat(Infinity);
  const roles = unique(raw.map(normalizeRoleValue).filter(Boolean));
  if (roles.includes("admin")) return ["admin"];
  if (roles.includes("user")) return ["user"];
  return [];
}

function resolveRoleFromUser(user = null, explicitRole = "") {
  if (!isPlainObject(user)) return normalizeRoleValue(explicitRole) || "";

  if (user.isAdmin === true || user.admin === true || user.is_admin === true || user.isSuperAdmin === true || user.superAdmin === true) {
    return "admin";
  }

  const roles = normalizeRoles([
    explicitRole,
    user.role,
    user.rol,
    user.userRole,
    user.user_role,
    user.type,
    user.tipo,
    user.perfil,
    ...safeArray(user.roles),
    ...safeArray(user.roleList),
    ...safeArray(user.role_list),
    ...safeArray(user.profile?.roles),
    user.profile?.role,
    user.account?.role,
  ]);

  if (roles.includes("admin")) return "admin";
  return "user";
}

function isUserActive(user = null) {
  if (!isPlainObject(user)) return false;

  if (user.deletedAt) return false;

  if (
    user.disabled === true ||
    user.isDisabled === true ||
    user.deleted === true ||
    user.isDeleted === true ||
    user.blocked === true ||
    user.isBlocked === true ||
    user.banned === true ||
    user.suspended === true ||
    user.revoked === true ||
    user.archived === true
  ) {
    return false;
  }

  const status = safeText(user.status || user.estado || user.state || user.accountStatus || user.account_status || "", "").toLowerCase();

  if ([
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
  ].includes(status)) {
    return false;
  }

  const active = user.active ?? user.is_active ?? user.isActive ?? user.enabled ?? user.isEnabled;
  return active === undefined || active === null || active === "" ? true : safeBool(active, true);
}

function getUserIdentity(user = {}) {
  if (!isPlainObject(user)) return "";

  return firstText(
    user.userId,
    user.user_id,
    user.id,
    user._id,
    user.uid,
    user.sub,
    user.email,
    user.mail,
    user.username,
    user.userName,
    user.user_name,
    user.phone,
    user.telefono
  );
}

function hasUsableUser(user = null) {
  if (!isPlainObject(user) || !isUserActive(user)) return false;
  return Boolean(getUserIdentity(user) || user.displayName || user.name || user.nombre);
}

function normalizeUsername(value = "") {
  return safeText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function resolveAvatar(user = {}) {
  return firstText(
    user.avatar,
    user.avatarUrl,
    user.avatarURL,
    user.avatar_url,
    user.photo,
    user.photoUrl,
    user.photoURL,
    user.photo_url,
    user.image,
    user.imageUrl,
    user.imageURL,
    user.image_url,
    user.profileImage,
    user.profileImageUrl,
    user.profile_image,
    user.profile_image_url,
    user.picture,
    user.pictureUrl,
    user.pictureURL,
    user.picture_url
  ) || null;
}

function normalizeIncomingUser(user = null) {
  if (!isPlainObject(user)) return null;

  let normalized = null;

  try {
    normalized = normalizeUser(user);
  } catch {
    normalized = null;
  }

  const base = hasUsableUser(normalized) ? normalized : hasUsableUser(user) ? user : null;
  if (!base) return null;

  const raw = safeObject(base.raw);
  const profile = safeObject(base.profile);
  const preferences = safeObject(base.preferences || base.preferencias || raw.preferences || raw.preferencias);

  const userId = firstText(base.userId, base.user_id, base.uid, base.sub, base.id, base._id, profile.userId, profile.id, raw.userId, raw.user_id, raw.sub, raw.id);
  const email = firstText(base.email, base.mail, base.emailLower, base.email_lower, profile.email, profile.mail, raw.email, raw.mail);
  const username = firstText(base.username, base.userName, base.user_name, base.usernameLower, base.username_lower, base.slug, profile.username, profile.slug, raw.username, raw.userName, raw.user_name, raw.slug);
  const usernameLower = firstText(base.usernameLower, base.username_lower, normalizeUsername(username || email));
  const role = resolveRoleFromUser(base);
  const avatar = resolveAvatar(base);
  const displayName = firstText(base.displayName, base.fullName, base.name, base.nombre, username, email, "Usuario");

  const permissions = unique([
    ...safeArray(base.permissions),
    ...safeArray(base.permisos),
    ...safeArray(raw.permissions),
    ...safeArray(raw.permisos),
  ]);

  return {
    ...base,

    id: base.id || userId || null,
    userId: base.userId || userId || null,
    user_id: base.user_id || userId || null,
    uid: base.uid || userId || null,
    sub: base.sub || userId || null,

    username: username || null,
    userName: base.userName || username || null,
    user_name: base.user_name || username || null,
    usernameLower: usernameLower || null,
    username_lower: base.username_lower || usernameLower || null,
    slug: base.slug || usernameLower || null,

    email: email || null,
    mail: base.mail || email || null,
    emailLower: base.emailLower || base.email_lower || (email ? email.toLowerCase() : null),
    email_lower: base.email_lower || base.emailLower || (email ? email.toLowerCase() : null),

    name: displayName,
    nombre: base.nombre || displayName,
    displayName,
    fullName: base.fullName || displayName,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    permissions,
    permisos: permissions,

    avatar,
    avatarUrl: avatar,
    picture: avatar,
    hasAvatar: base.hasAvatar === true || base.has_avatar === true || Boolean(avatar),

    preferences,
    theme: base.theme || base.mode || base.appearance || preferences.theme || preferences.mode || preferences.appearance || null,
    mode: base.mode || preferences.mode || base.theme || preferences.theme || null,
    appearance: base.appearance || preferences.appearance || base.theme || preferences.theme || null,
    lang: base.lang || preferences.lang || base.language || preferences.language || base.locale || preferences.locale || null,
    language: base.language || preferences.language || base.lang || preferences.lang || null,
    locale: base.locale || preferences.locale || base.language || base.lang || null,

    active: true,
  };
}

/* =========================================================
   PAYLOAD EXTRACTION
========================================================= */

function collectPayloadObjects(raw = {}) {
  const output = [];
  const seen = new WeakSet();
  const queue = [raw];
  let guard = 0;

  while (queue.length && guard < 80) {
    guard += 1;
    const current = queue.shift();
    if (!isPlainObject(current)) continue;

    try {
      if (seen.has(current)) continue;
      seen.add(current);
    } catch {}

    output.push(current);

    for (const key of [...ROOT_OBJECT_KEYS, ...SESSION_KEYS, ...USER_KEYS]) {
      if (isPlainObject(current[key])) queue.push(current[key]);
    }

    if (isPlainObject(current.response?.data)) queue.push(current.response.data);
  }

  return output;
}

function payloadHasAnyKey(objects = [], keys = []) {
  return objects.some((object) => keys.some((key) => Object.prototype.hasOwnProperty.call(Object(object), key)));
}

function pickValue(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }

  return undefined;
}

function pickText(objects = [], keys = []) {
  return safeText(pickValue(objects, keys), "");
}

function pickObject(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (isPlainObject(object?.[key])) return object[key];
    }
  }

  return null;
}

function pickArray(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (Array.isArray(value)) return value;
      if (typeof value === "string" && value) return value.split(/[,\s|]+/g).map((item) => item.trim()).filter(Boolean);
    }
  }

  return [];
}

function looksLikeUserObject(value = {}) {
  if (!isPlainObject(value)) return false;

  return Boolean(
    value.userId ||
      value.user_id ||
      value.id ||
      value.uid ||
      value.sub ||
      value.username ||
      value.userName ||
      value.user_name ||
      value.email ||
      value.mail ||
      value.displayName ||
      value.name ||
      value.nombre
  );
}

function normalizeSessionContext(sessionInput = null, user = null, fallback = {}) {
  const source = safeObject(sessionInput);
  const fallbackObj = safeObject(fallback);

  const sessionId = firstText(...SESSION_ID_KEYS.map((key) => source[key]), fallbackObj.sessionId, fallbackObj.session_id, fallbackObj.id, getStoredSessionId());
  const sessionUserId = firstText(
    source.sessionUserId,
    source.session_user_id,
    ...SESSION_USER_ID_KEYS.map((key) => source[key]),
    fallbackObj.sessionUserId,
    fallbackObj.session_user_id,
    fallbackObj.userId,
    fallbackObj.user_id,
    getUserIdentity(user),
    getStoredSessionUserId()
  );
  const expiresAt = firstText(...SESSION_EXPIRES_KEYS.map((key) => source[key]), fallbackObj.expiresAt, fallbackObj.refreshExpiresAt);
  const tokenVersion = first(...TOKEN_VERSION_KEYS.map((key) => source[key]), fallbackObj.tokenVersion, user?.tokenVersion, user?.token_version, user?.tv);

  const hasAny = Boolean(Object.keys(source).length || sessionId || sessionUserId || expiresAt || tokenVersion !== null);
  if (!hasAny) return null;

  return {
    ...source,
    id: source.id || sessionId || null,
    sessionId: source.sessionId || source.session_id || source.sid || sessionId || null,
    session_id: source.session_id || source.sessionId || source.sid || sessionId || null,
    sid: source.sid || sessionId || null,
    userId: source.userId || source.user_id || source.uid || sessionUserId || null,
    user_id: source.user_id || source.userId || source.uid || sessionUserId || null,
    sessionUserId: source.sessionUserId || source.session_user_id || sessionUserId || null,
    session_user_id: source.session_user_id || source.sessionUserId || sessionUserId || null,
    expiresAt: source.expiresAt || source.expires_at || source.refreshExpiresAt || source.refresh_expires_at || expiresAt || null,
    refreshExpiresAt: source.refreshExpiresAt || source.refresh_expires_at || source.expiresAt || source.expires_at || expiresAt || null,
    tokenVersion: tokenVersion !== null && tokenVersion !== undefined && tokenVersion !== "" ? tokenVersion : null,
    tv: tokenVersion !== null && tokenVersion !== undefined && tokenVersion !== "" ? tokenVersion : null,
  };
}

function extractSessionInput(payload = {}) {
  const objects = collectPayloadObjects(payload);

  const token = normalizeTokenValue(pickText(objects, TOKEN_KEYS));
  const refreshToken = normalizeTokenValue(pickText(objects, REFRESH_TOKEN_KEYS));
  const tempToken = normalizeTokenValue(pickText(objects, TEMP_TOKEN_KEYS));

  const userRaw = pickObject(objects, USER_KEYS) || (looksLikeUserObject(payload) ? payload : null);
  const user = normalizeIncomingUser(userRaw);

  const role = pickText(objects, ROLE_KEYS);
  const permissions = unique([...pickArray(objects, PERMISSION_KEYS), ...safeArray(user?.permissions), ...safeArray(user?.permisos)]);

  const sessionRaw = pickObject(objects, SESSION_KEYS);
  const sessionId = pickText(objects, SESSION_ID_KEYS);
  const sessionUserId = pickText(objects, SESSION_USER_ID_KEYS);
  const expiresAt = pickText(objects, SESSION_EXPIRES_KEYS);
  const tokenVersion = first(pickValue(objects, TOKEN_VERSION_KEYS), user?.tokenVersion, user?.token_version, user?.tv);

  const session = normalizeSessionContext(sessionRaw, user, {
    sessionId,
    sessionUserId,
    userId: sessionUserId,
    expiresAt,
    tokenVersion,
  });

  return {
    token,
    refreshToken,
    tempToken,
    user,
    role,
    permissions,
    session,
    sessionId: session?.sessionId || sessionId || "",
    sessionUserId: session?.sessionUserId || session?.userId || sessionUserId || "",
    tokenVersion: tokenVersion !== null && tokenVersion !== undefined && tokenVersion !== "" ? tokenVersion : null,
    flags: {
      tokenProvided: payloadHasAnyKey(objects, TOKEN_KEYS),
      refreshTokenProvided: payloadHasAnyKey(objects, REFRESH_TOKEN_KEYS),
      tempTokenProvided: payloadHasAnyKey(objects, TEMP_TOKEN_KEYS),
      userProvided: payloadHasAnyKey(objects, USER_KEYS) || looksLikeUserObject(payload),
      sessionProvided: payloadHasAnyKey(objects, SESSION_KEYS) || payloadHasAnyKey(objects, SESSION_ID_KEYS) || payloadHasAnyKey(objects, SESSION_USER_ID_KEYS),
    },
  };
}

/* =========================================================
   ROUTE PRESERVATION
========================================================= */

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value = safeText(pathname, DEFAULT_ROUTE).replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;

  const clean = [];

  for (const part of value.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === "..") {
      clean.pop();
      continue;
    }
    clean.push(part);
  }

  value = `/${clean.join("/")}` || DEFAULT_ROUTE;
  if (value.length > 1 && value.endsWith("/")) value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  return value;
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function splitFullPath(path = DEFAULT_ROUTE) {
  const raw = safeText(path, DEFAULT_ROUTE);
  if (isHashRouterPath(raw)) return splitFullPath(normalizeHashRouterPath(raw));

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  return { pathname: normalizePathnameOnly(pathname), search, hash };
}

function stripPublicUsernamePrefix(pathname = DEFAULT_ROUTE) {
  const clean = normalizePathnameOnly(pathname);
  const parts = clean.split("/").filter(Boolean);

  if (parts.length && /^@[A-Za-z0-9._-]{1,80}$/.test(parts[0])) {
    const rest = parts.slice(1).join("/");
    return rest ? normalizePathnameOnly(`/${rest}`) : DEFAULT_ROUTE;
  }

  return clean;
}

function getCanonicalRoutePath(path = DEFAULT_ROUTE) {
  return stripPublicUsernamePrefix(splitFullPath(path || DEFAULT_ROUTE).pathname);
}

function getBrowserPublicPath() {
  if (!isBrowser()) return "";

  try {
    const pathname = window.location.pathname || DEFAULT_ROUTE;
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) return normalizeHashRouterPath(hash);
    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function isPublicTechnicalRoute(path = DEFAULT_ROUTE) {
  const clean = getCanonicalRoutePath(path);
  return PUBLIC_TECHNICAL_ROUTES.some((candidate) => clean === candidate || clean.startsWith(`${candidate}/`));
}

function captureRouteContext(options = {}) {
  const state = getState();
  const browserPath = getBrowserPublicPath();
  const publicPath = firstText(options.publicPath, state.publicPath, browserPath, DEFAULT_ROUTE);
  const route = firstText(options.route, state.route, getCanonicalRoutePath(publicPath), DEFAULT_ROUTE);

  const preserve = Boolean(
    options.preserveRoute === true ||
      options.preserveCurrentRoute === true ||
      options.publicRoute === true ||
      options.activationBoot === true ||
      options.resetConfirmBoot === true ||
      options.preserveInitialUrl === true ||
      isPublicTechnicalRoute(route) ||
      isPublicTechnicalRoute(publicPath)
  );

  return {
    preserve,
    route: getCanonicalRoutePath(route || publicPath || DEFAULT_ROUTE),
    publicPath: publicPath || route || DEFAULT_ROUTE,
    lastRoute: safeText(state.lastRoute, ""),
    activationBoot: Boolean(options.activationBoot),
    resetConfirmBoot: Boolean(options.resetConfirmBoot),
  };
}

function restoreRouteContext(context = {}) {
  if (!context?.preserve) return false;

  const route = getCanonicalRoutePath(context.route || context.publicPath || DEFAULT_ROUTE);
  const publicPath = safeText(context.publicPath, route);

  safeSetState({
    route,
    canonicalPath: route,
    publicPath,
    lastRoute: context.lastRoute || route,
    bootIsActivation: Boolean(context.activationBoot || getState().bootIsActivation),
    bootHasActivationToken: Boolean(context.activationBoot || getState().bootHasActivationToken),
    bootIsResetConfirm: Boolean(context.resetConfirmBoot || getState().bootIsResetConfirm),
    bootHasResetToken: Boolean(context.resetConfirmBoot || getState().bootHasResetToken),
  }, {
    source: `${SESSION_SOURCE}:restore-route`,
    emit: false,
    silent: true,
  });

  return true;
}

/* =========================================================
   DERIVED STATE
========================================================= */

function getBestStateToken(state = getState()) {
  return firstText(
    state.token,
    state.accessToken,
    state.access_token,
    state.session?.token,
    state.session?.accessToken,
    state.session?.access_token,
    state.sessionData?.token,
    state.sessionData?.accessToken,
    state.sessionData?.access_token,
    getStoredAccessToken()
  );
}

function getBestStateUser(state = getState()) {
  const user =
    (hasUsableUser(state.user) && state.user) ||
    (hasUsableUser(state.currentUser) && state.currentUser) ||
    (hasUsableUser(state.authUser) && state.authUser) ||
    (hasUsableUser(state.sessionUser) && state.sessionUser) ||
    (hasUsableUser(state.session?.user) && state.session.user) ||
    (hasUsableUser(state.sessionData?.user) && state.sessionData.user) ||
    null;

  return user ? normalizeIncomingUser(user) : null;
}

function getBestStateSession(state = getState()) {
  return normalizeSessionContext(state.session || state.sessionData || null, getBestStateUser(state), {
    sessionId: state.sessionId,
    sessionUserId: state.sessionUserId,
  });
}

function buildDerivedAuthState(state = getState()) {
  const token = normalizeTokenValue(getBestStateToken(state));
  const user = getBestStateUser(state);
  const session = getBestStateSession(state);
  const authenticated = hasUsableToken(token) && hasUsableUser(user);
  const role = authenticated ? resolveRoleFromUser(user, state.role || state.rol || state.userRole || session?.role || "") : "";
  const roles = authenticated ? [role || "user"] : [];

  return {
    authenticated,
    token,
    user,
    session,
    role,
    roles,
    isAdmin: role === "admin",
    isSupport: false,
    isManager: false,
    isClient: authenticated && role === "user",
  };
}

function clearAuthStatePatch() {
  return {
    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,
    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,
    account: null,
    profile: null,
    pendingUser: null,
    role: "",
    rol: "",
    userRole: "",
    roles: [],
    permissions: [],
    permisos: [],
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
    tokenVersion: null,
    tv: null,
    currentResolvedUsername: null,
    resolvedUsername: null,
    username: null,
    avatar: null,
    avatarUrl: null,
    twoFactorPending: false,
    tempToken: null,
    temp_token: null,
  };
}

function syncDerivedState() {
  const state = getState();
  const derived = buildDerivedAuthState(state);

  state.authenticated = derived.authenticated;
  state.hasToken = hasUsableToken(derived.token);
  state.role = derived.authenticated ? derived.role : "";
  state.rol = derived.authenticated ? derived.role : "";
  state.userRole = derived.authenticated ? derived.role : "";
  state.roles = derived.authenticated ? derived.roles : [];
  state.isAdmin = derived.authenticated && derived.isAdmin;
  state.isSupport = false;
  state.isManager = false;
  state.isClient = derived.authenticated && derived.isClient;

  if (derived.authenticated && derived.user) {
    state.user = derived.user;
    state.currentUser = derived.user;
    state.authUser = derived.user;
    state.sessionUser = derived.user;
    state.account = derived.user;
    state.profile = derived.user;
    state.currentResolvedUsername = derived.user.slug || derived.user.usernameLower || derived.user.username || null;
    state.resolvedUsername = state.currentResolvedUsername;
  } else {
    state.user = null;
    state.currentUser = null;
    state.authUser = null;
    state.sessionUser = null;
    state.account = null;
    state.profile = null;
    state.currentResolvedUsername = null;
    state.resolvedUsername = null;
  }

  if (derived.session && derived.authenticated) {
    state.session = derived.session;
    state.sessionData = derived.session;
    state.sessionId = derived.session.sessionId || derived.session.id || null;
    state.sessionUserId = derived.session.sessionUserId || derived.session.userId || derived.session.user_id || null;
  } else if (!derived.authenticated) {
    state.session = null;
    state.sessionData = null;
    state.sessionId = null;
    state.sessionUserId = null;
  }

  return state;
}

function syncUserUI() {
  try {
    AppCore?.syncUserUI?.({ source: SESSION_SOURCE, reason: "auth-session-sync" });
  } catch {
    try {
      AppCore?.syncUserUI?.();
    } catch {}
  }
}

/* =========================================================
   USER PREFERENCES
========================================================= */

function applyThemeFromUser(user = null) {
  if (!isPlainObject(user)) return null;

  const prefs = safeObject(user.preferences);
  const theme = firstText(user.theme, user.mode, user.appearance, prefs.theme, prefs.mode, prefs.appearance).toLowerCase();

  if (!["light", "dark", "system"].includes(theme)) return null;

  try {
    AppCore?.setTheme?.(theme);
  } catch {}

  safeSetState({ theme, mode: theme, appearance: theme }, { source: `${SESSION_SOURCE}:theme`, emit: false, silent: true });
  return theme;
}

function applyLangFromUser(user = null) {
  if (!isPlainObject(user)) return null;

  const prefs = safeObject(user.preferences);
  const lang = firstText(user.lang, user.language, user.locale, prefs.lang, prefs.language, prefs.locale).toLowerCase();

  if (!lang) return null;

  try {
    AppCore?.setLang?.(lang);
  } catch {}

  safeSetState({ lang, language: lang, locale: lang }, { source: `${SESSION_SOURCE}:lang`, emit: false, silent: true });
  return lang;
}

/* =========================================================
   SNAPSHOTS / EVENTS
========================================================= */

function internalSnapshot(extra = {}) {
  syncDerivedState();

  const state = getState();
  const token = normalizeTokenValue(getBestStateToken(state));
  const user = getBestStateUser(state);
  const session = getBestStateSession(state);
  const authenticated = Boolean(state.authenticated === true && hasUsableToken(token) && hasUsableUser(user));

  return {
    version: AUTH_SESSION_VERSION,
    authenticated,
    token: hasUsableToken(token) ? token : null,
    accessToken: hasUsableToken(token) ? token : null,
    refreshToken: getStoredRefreshToken() || null,
    user: hasUsableUser(user) ? user : null,
    role: authenticated ? state.role || null : null,
    roles: authenticated ? normalizeRoles(state.roles) : [],
    isAdmin: authenticated && state.role === "admin",
    isSupport: false,
    isManager: false,
    isClient: authenticated && state.role === "user",
    session: session || null,
    sessionData: session || null,
    sessionId: session?.sessionId || state.sessionId || null,
    sessionUserId: session?.sessionUserId || session?.userId || state.sessionUserId || null,
    storedSessionId: getStoredSessionId() || null,
    storedSessionUserId: getStoredSessionUserId() || null,
    route: state.route || DEFAULT_ROUTE,
    publicPath: state.publicPath || DEFAULT_ROUTE,
    ...extra,
  };
}

function publicSnapshot(snapshot = {}) {
  return {
    version: AUTH_SESSION_VERSION,
    authenticated: Boolean(snapshot.authenticated),
    hasToken: hasUsableToken(snapshot.token),
    token: null,
    accessToken: null,
    refreshToken: null,
    user: sanitizePublicUser(snapshot.user),
    role: snapshot.role || null,
    roles: normalizeRoles(snapshot.roles),
    isAdmin: Boolean(snapshot.isAdmin),
    isSupport: false,
    isManager: false,
    isClient: Boolean(snapshot.isClient),
    sessionId: snapshot.sessionId || snapshot.session?.sessionId || null,
    sessionUserId: snapshot.sessionUserId || snapshot.session?.sessionUserId || snapshot.session?.userId || null,
    route: safeRedact(snapshot.route || DEFAULT_ROUTE),
    publicPath: safeRedact(snapshot.publicPath || DEFAULT_ROUTE),
    source: snapshot.source || "",
    eventMode: snapshot.eventMode || "",
  };
}

export function buildSessionSnapshot(extra = {}) {
  return publicSnapshot(internalSnapshot(extra));
}

function fingerprint(snapshot = {}) {
  return JSON.stringify({
    authenticated: Boolean(snapshot.authenticated),
    hasToken: hasUsableToken(snapshot.token),
    tokenLength: safeText(snapshot.token).length,
    role: safeText(snapshot.role),
    hasRefreshToken: Boolean(snapshot.refreshToken),
    sessionId: snapshot.sessionId || snapshot.session?.sessionId || null,
    sessionUserId: snapshot.sessionUserId || snapshot.session?.sessionUserId || snapshot.session?.userId || null,
    userId: getUserIdentity(snapshot.user),
  });
}

function emitStateChange({ reason = "unknown", before = null, after = null, durationMs = 0, options = {} } = {}) {
  safeEmit(EVENTS.state, {
    reason,
    before: before ? publicSnapshot(before) : null,
    after: after ? publicSnapshot(after) : null,
    changed: fingerprint(before) !== fingerprint(after),
    durationMs,
  }, options);
}

function emitSessionApplied(after = {}, before = null, options = {}) {
  const mode = eventMode(options);
  const payload = { ...publicSnapshot(after), eventMode: mode };

  safeEmit(EVENTS.applied, payload, options);
  safeEmit(EVENTS.appSessionChange, payload, options);
  safeEmit(EVENTS.appAuthChange, payload, options);
  safeEmit(EVENTS.authChange, payload, options);

  if (mode === "restore") {
    safeEmit(EVENTS.restored, payload, options);
    safeEmit(EVENTS.appSessionRestored, payload, options);
  }

  if (!before || fingerprint(before) !== fingerprint(after)) {
    safeEmit(EVENTS.userChange, payload, options);
  }
}

function emitSessionPartial(after = {}, before = null, options = {}) {
  const payload = { ...publicSnapshot(after), eventMode: eventMode(options) };

  safeEmit(EVENTS.partial, payload, options);
  safeEmit(EVENTS.appSessionChange, payload, options);
  safeEmit(EVENTS.appAuthChange, payload, options);
  safeEmit(EVENTS.authChange, payload, options);

  if (!before || fingerprint(before) !== fingerprint(after)) {
    safeEmit(EVENTS.userChange, payload, options);
  }
}

function emitSessionCleared(after = {}, options = {}) {
  const payload = { ...publicSnapshot(after), eventMode: "clear" };

  safeEmit(EVENTS.cleared, payload, options);
  safeEmit(EVENTS.appSessionCleared, payload, options);
  safeEmit(EVENTS.appSessionChange, payload, options);
  safeEmit(EVENTS.appAuthChange, payload, options);
  safeEmit(EVENTS.authChange, payload, options);
  safeEmit(EVENTS.userChange, payload, options);
}

/* =========================================================
   APPLY SESSION
========================================================= */

export function applySession(payload = {}, options = {}) {
  const input = { ...safeObject(payload), ...safeObject(options) };
  const startedAt = nowMs();
  const source = safeText(input.source, SESSION_SOURCE);
  const mode = eventMode({ source, eventMode: input.eventMode, emitRestoreEvents: input.emitRestoreEvents });
  const silent = safeBool(input.silent, false) || mode === "silent";

  const eventOptions = {
    source,
    eventMode: mode,
    emitRestoreEvents: input.emitRestoreEvents,
    silent,
    emit: input.emit,
    emitEvents: input.emitEvents,
  };

  const before = internalSnapshot({ source, eventMode: mode });
  const state = getState();
  const extracted = extractSessionInput(input);

  const tokenProvided = Boolean(extracted.flags.tokenProvided);
  const userProvided = Boolean(extracted.flags.userProvided);
  const refreshTokenProvided = Boolean(extracted.flags.refreshTokenProvided);
  const tempTokenProvided = Boolean(extracted.flags.tempTokenProvided);
  const sessionProvided = Boolean(extracted.flags.sessionProvided);
  const preserveExistingUser = input.preserveExistingUser === true;

  const effectiveToken = firstText(
    tokenProvided ? extracted.token : undefined,
    state.token,
    state.accessToken,
    state.access_token,
    state.session?.token,
    state.session?.accessToken,
    state.session?.access_token,
    getStoredAccessToken()
  );

  let effectiveUser = null;

  if (userProvided) {
    effectiveUser = extracted.user || null;
  } else if (tokenProvided && preserveExistingUser !== true) {
    effectiveUser = null;
  } else {
    effectiveUser = getBestStateUser(state);
  }

  const effectiveSession = normalizeSessionContext(
    sessionProvided ? extracted.session : input.sessionData || input.session || state.session || state.sessionData || null,
    effectiveUser,
    {
      sessionId: extracted.sessionId || input.sessionId || input.session_id || state.sessionId,
      sessionUserId: extracted.sessionUserId || input.sessionUserId || input.session_user_id || state.sessionUserId,
      tokenVersion: extracted.tokenVersion || input.tokenVersion || input.token_version || input.tv || state.tokenVersion,
    }
  );

  const usableToken = hasUsableToken(effectiveToken);
  const usableUser = hasUsableUser(effectiveUser);
  const explicitFalse = input.authenticated === false || input.ok === false || input.success === false;
  const authenticated = explicitFalse ? false : usableToken && usableUser;
  const role = authenticated ? resolveRoleFromUser(effectiveUser, extracted.role || input.role || input.rol || "") : "";
  const roles = authenticated ? [role] : [];
  const normalizedToken = usableToken ? normalizeTokenValue(effectiveToken) : "";

  if (tokenProvided) persistAccessToken(usableToken ? normalizedToken : null);
  if (refreshTokenProvided) persistRefreshToken(extracted.refreshToken || null);

  const hasTempToken = tempTokenProvided && hasUsableToken(extracted.tempToken);
  if (tempTokenProvided) persistTempToken(hasTempToken ? extracted.tempToken : null);
  if (authenticated) persistTempToken(null);

  const sessionId = firstText(effectiveSession?.sessionId, effectiveSession?.id, input.sessionId, input.session_id, getStoredSessionId(), state.sessionId, state.session?.sessionId);
  const sessionUserId = firstText(effectiveSession?.sessionUserId, effectiveSession?.userId, effectiveSession?.user_id, input.sessionUserId, input.session_user_id, getUserIdentity(effectiveUser), getStoredSessionUserId(), state.sessionUserId, state.session?.sessionUserId, state.session?.userId);
  const tokenVersion = first(input.tokenVersion, input.token_version, input.tv, extracted.tokenVersion, effectiveSession?.tokenVersion, effectiveSession?.tv, effectiveUser?.tokenVersion, effectiveUser?.token_version, effectiveUser?.tv, state.tokenVersion);

  const canonicalSession = effectiveSession
    ? {
        ...effectiveSession,
        sessionId: sessionId || effectiveSession.sessionId || null,
        session_id: sessionId || effectiveSession.session_id || null,
        sessionUserId: sessionUserId || effectiveSession.sessionUserId || null,
        session_user_id: sessionUserId || effectiveSession.session_user_id || null,
        userId: effectiveSession.userId || sessionUserId || null,
        user_id: effectiveSession.user_id || sessionUserId || null,
        tokenVersion: tokenVersion ?? effectiveSession.tokenVersion ?? null,
        tv: tokenVersion ?? effectiveSession.tv ?? null,
      }
    : null;

  if (authenticated && canonicalSession) {
    persistSessionContext(canonicalSession, effectiveUser);
  } else if (!authenticated) {
    persistSessionContext(null, null);
  }

  if (authenticated) {
    persistAuxSessionData(effectiveUser);
    applyThemeFromUser(effectiveUser);
    applyLangFromUser(effectiveUser);
  }

  const refreshToken = refreshTokenProvided ? normalizeTokenValue(extracted.refreshToken) : getStoredRefreshToken() || "";
  const permissions = authenticated ? unique([...safeArray(extracted.permissions), ...safeArray(effectiveUser?.permissions), ...safeArray(effectiveUser?.permisos)]) : [];

  const sessionAlias = authenticated
    ? {
        ...(canonicalSession || {}),
        token: normalizedToken,
        accessToken: normalizedToken,
        access_token: normalizedToken,
        refreshToken: refreshToken || null,
        refresh_token: refreshToken || null,
        user: effectiveUser,
        usuario: effectiveUser,
        role,
        rol: role,
        roles,
        permissions,
        permisos: permissions,
        authenticated: true,
        source,
      }
    : null;

  const resolvedUsername = authenticated ? effectiveUser?.slug || effectiveUser?.usernameLower || effectiveUser?.username || null : null;

  const patch = {
    token: usableToken ? normalizedToken : null,
    accessToken: usableToken ? normalizedToken : null,
    access_token: usableToken ? normalizedToken : null,
    refreshToken: authenticated && refreshToken ? refreshToken : null,
    refresh_token: authenticated && refreshToken ? refreshToken : null,

    user: authenticated ? effectiveUser : null,
    currentUser: authenticated ? effectiveUser : null,
    authUser: authenticated ? effectiveUser : null,
    sessionUser: authenticated ? effectiveUser : null,
    account: authenticated ? effectiveUser : null,
    profile: authenticated ? effectiveUser : null,
    pendingUser: !authenticated && usableUser ? effectiveUser : null,

    role,
    rol: role,
    userRole: role,
    roles,
    permissions,
    permisos: permissions,
    authenticated,
    hasToken: usableToken,
    isAdmin: authenticated && role === "admin",
    isSupport: false,
    isManager: false,
    isClient: authenticated && role === "user",

    sessionId: authenticated ? sessionId || null : null,
    sessionUserId: authenticated ? sessionUserId || null : null,
    tokenVersion: authenticated ? tokenVersion ?? null : null,
    tv: authenticated ? tokenVersion ?? null : null,
    session: sessionAlias,
    sessionData: sessionAlias,

    twoFactorPending: !authenticated && hasTempToken,
    tempToken: hasTempToken ? extracted.tempToken : null,
    temp_token: hasTempToken ? extracted.tempToken : null,

    username: resolvedUsername,
    currentResolvedUsername: resolvedUsername,
    resolvedUsername,
    avatar: authenticated ? effectiveUser?.avatar || effectiveUser?.avatarUrl || null : null,
    avatarUrl: authenticated ? effectiveUser?.avatarUrl || effectiveUser?.avatar || null : null,

    lastAuthSource: source,
    lastAuthSyncAt: nowIso(),
  };

  safeSetState(patch, {
    source: `${SESSION_SOURCE}:apply`,
    forceUnauthenticated: !authenticated,
    allowExplicitAuthenticated: authenticated,
    emit: false,
    emitState: false,
    emitDerived: false,
    silent: true,
  });

  syncDerivedState();
  syncUserUI();

  const after = internalSnapshot({ source, eventMode: mode });

  if (!silent) {
    const reason = authenticated ? "apply" : usableToken ? "apply:token_only" : usableUser ? "apply:user_only" : "apply:partial";

    emitStateChange({ reason, before, after, durationMs: nowMs() - startedAt, options: eventOptions });

    if (after.authenticated) emitSessionApplied(after, before, eventOptions);
    else emitSessionPartial(after, before, { ...eventOptions, eventMode: usableToken ? "token_only" : usableUser ? "user_only" : mode });
  }

  return publicSnapshot(after);
}

/* =========================================================
   CLEAR SESSION
========================================================= */

export function clearSessionLocal(options = {}) {
  const opts = safeObject(options);
  const silent = safeBool(opts.silent, false);
  const startedAt = nowMs();
  const routeContext = captureRouteContext(opts);
  const before = internalSnapshot({ source: opts.source || SESSION_SOURCE, eventMode: "clear", routeContext });

  const hadData = Boolean(before.token || before.user || before.refreshToken || before.sessionId || before.sessionUserId || getState().authenticated);

  try {
    clearAuthStorage({ silent: true, includeLegacy: true });
  } catch (error) {
    safeWarn("clearAuthStorage() falló.", error);
  }

  persistRefreshToken(null);
  persistTempToken(null);
  persistAccessToken(null);
  persistSessionContext(null, null);

  safeSetState(clearAuthStatePatch(), {
    source: `${SESSION_SOURCE}:clear`,
    forceUnauthenticated: true,
    emit: false,
    emitState: false,
    emitDerived: false,
    silent: true,
  });

  restoreRouteContext(routeContext);
  syncDerivedState();
  syncUserUI();

  const after = internalSnapshot({ source: opts.source || SESSION_SOURCE, eventMode: "clear", routeContext });

  if (!silent) {
    if (hadData || opts.emitWhenEmpty === true) {
      emitSessionCleared(after, { source: opts.source || SESSION_SOURCE, eventMode: "clear", emit: opts.emit, emitEvents: opts.emitEvents });
    }

    emitStateChange({
      reason: "clear",
      before,
      after,
      durationMs: nowMs() - startedAt,
      options: { source: opts.source || SESSION_SOURCE, eventMode: "clear", emit: opts.emit, emitEvents: opts.emitEvents },
    });
  }

  return true;
}

/* =========================================================
   AUTH HELPERS
========================================================= */

export function isAuthenticated() {
  syncDerivedState();

  const state = getState();
  return Boolean(state.authenticated && hasUsableToken(getBestStateToken(state)) && hasUsableUser(getBestStateUser(state)));
}

export function getCurrentUser() {
  if (!isAuthenticated()) return null;
  return getBestStateUser(getState());
}

export function getCurrentToken() {
  const token = normalizeTokenValue(getBestStateToken(getState()));
  return hasUsableToken(token) ? token : "";
}

export function getCurrentRole() {
  return isAuthenticated() ? safeText(getState().role, "user") : "";
}

export function getCurrentRoles() {
  return isAuthenticated() ? normalizeRoles(getState().roles) : [];
}

export function isCurrentUserAdmin() {
  return isAuthenticated() && getCurrentRole() === "admin";
}

export function isCurrentUserSupport() {
  return false;
}

export function isCurrentUserManager() {
  return false;
}

export function isCurrentUserClient() {
  return isAuthenticated() && getCurrentRole() === "user";
}

export function hasRole(...roles) {
  if (!roles.length) return true;
  if (!isAuthenticated()) return false;

  const required = unique(roles.flat(Infinity).map(normalizeRoleRequirement).filter(Boolean));
  if (!required.length) return false;

  const current = new Set(getCurrentRoles());
  return required.some((role) => current.has(role));
}

export function requireRole(...roles) {
  return isAuthenticated() && hasRole(...roles);
}

export function getAuthHeader() {
  const token = getCurrentToken();
  if (!hasUsableToken(token)) return {};

  const headerName = safeText(AppCore?.config?.auth?.tokenHeader, "Authorization");
  const prefix = safeText(AppCore?.config?.auth?.bearerPrefix, "Bearer");

  return { [headerName]: `${prefix} ${normalizeTokenValue(token)}` };
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionDebugSnapshot() {
  const snapshot = internalSnapshot();

  return {
    version: AUTH_SESSION_VERSION,
    authenticated: Boolean(snapshot.authenticated),
    role: snapshot.role || null,
    roles: normalizeRoles(snapshot.roles),
    isAdmin: Boolean(snapshot.isAdmin),
    isSupport: false,
    isManager: false,
    isClient: Boolean(snapshot.isClient),
    username: snapshot.user?.username || snapshot.user?.userName || snapshot.user?.user_name || snapshot.user?.email || snapshot.user?.name || snapshot.user?.nombre || null,
    userIdentity: getUserIdentity(snapshot.user),
    hasToken: Boolean(snapshot.token),
    token: null,
    accessToken: null,
    hasUser: hasUsableUser(snapshot.user),
    hasRefreshToken: Boolean(snapshot.refreshToken),
    refreshToken: null,
    sessionId: snapshot.sessionId || snapshot.session?.sessionId || null,
    sessionUserId: snapshot.sessionUserId || snapshot.session?.sessionUserId || snapshot.session?.userId || null,
    storedSessionId: snapshot.storedSessionId || null,
    storedSessionUserId: snapshot.storedSessionUserId || null,
    hasSessionContext: Boolean(snapshot.sessionId || snapshot.session?.sessionId || snapshot.storedSessionId),
    route: safeRedact(snapshot.route || DEFAULT_ROUTE),
    publicPath: safeRedact(snapshot.publicPath || DEFAULT_ROUTE),
    isPublicTechnicalRoute: isPublicTechnicalRoute(snapshot.route || snapshot.publicPath || DEFAULT_ROUTE),
    roleContract: [...VALID_ROLES],
    policy: {
      ownFetch: false,
      ownRefresh: false,
      ownRouter: false,
      ownToast: false,
      noStorageClearAll: true,
      authenticatedRequiresTokenAndUser: true,
    },
    at: nowIso(),
  };
}

export function buildAuthErrorPayload(error) {
  return {
    error: error
      ? {
          name: safeText(error.name, "Error"),
          status: error.status || error.response?.status || error.data?.status || null,
          code: error.code || error.data?.code || error.response?.data?.code || null,
        }
      : null,
    message: extractMessage(error),
  };
}

export function exposeSessionDebugApi() {
  const api = {
    version: AUTH_SESSION_VERSION,
    snapshot: getSessionDebugSnapshot,
    getSnapshot: getSessionDebugSnapshot,
    isAuthenticated,
    getCurrentUser,
    getCurrentToken,
    getCurrentRole,
    getCurrentRoles,
    isCurrentUserAdmin,
    isCurrentUserClient,
    hasRole,
    requireRole,
    getAuthHeader,
    clear: clearSessionLocal,
    apply: applySession,
  };

  try {
    if (isBrowser()) window.__ONION_AUTH_SESSION__ = api;
  } catch {}

  try {
    if (AppCore && typeof AppCore === "object" && Object.isExtensible(AppCore)) {
      Object.defineProperty(AppCore, "AuthSession", {
        value: api,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }
  } catch {}

  return api;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  AUTH_SESSION_VERSION,

  applySession,
  clearSessionLocal,
  buildSessionSnapshot,

  isAuthenticated,

  getCurrentUser,
  getCurrentToken,

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
  exposeSessionDebugApi,
};
