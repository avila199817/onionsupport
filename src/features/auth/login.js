/* =========================================================
   Onion SPA - Auth Login
   Archivo: src/features/auth/login.js

   AUTH LOGIN · FINAL SIMPLE
   - Login público vía CoreHttp
   - Sin fetch propio, apiClient propio, Router, Toast ni DOM hacks
   - Sin refresh automático
   - 2FA no autentica
   - Sesión real aplicada por session.js
   - Roles reales: admin / user
========================================================= */

import { AppCore } from "../../core/index.js";
import CoreHttp from "../../core/http.js";

import {
  isBrowser,
  sanitizeUsername,
  normalizeCanonicalPath,
  getCurrentCanonicalPath,
  isAuthRoute,
  configLikeRoute,
  isSafeRelativePath,
  sanitizeRedirectPath,
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
  getLoginEndpoint,
  getLoginTimeoutMs,
  getAuthPublicTimeoutMs,
} from "./constants.js";

import {
  validateAuthResponse,
} from "./normalize.js";

import {
  persistTempToken,
} from "./storage.js";

import {
  applySession,
  clearSessionLocal,
} from "./session.js";

/* =========================================================
   META
========================================================= */

export const LOGIN_VERSION = "20.0.0-final";

const SOURCE = "auth.login";
const DEFAULT_HOME_PATH = "/";
const DEFAULT_LOGIN_PATH = "/login";
const DEFAULT_2FA_PATH = "/2fa";
const DEFAULT_TIMEOUT_MS = 30000;

let loginPromise = null;
let loginFingerprint = "";
let loginSequence = 0;

/* =========================================================
   RESPONSE KEYS
========================================================= */

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
]);

const TWO_FACTOR_KEYS = Object.freeze([
  "requires2FA",
  "requires_2fa",
  "require2FA",
  "require_2fa",
  "twoFactorRequired",
  "two_factor_required",
  "mfaRequired",
  "mfa_required",
  "otpRequired",
  "otp_required",
  "challengeRequired",
  "challenge_required",
]);

const TWO_FACTOR_STATUSES = new Set([
  "2fa_required",
  "mfa_required",
  "two_factor_required",
  "totp_required",
  "otp_required",
  "challenge_required",
]);

const FAILURE_CODES = new Set([
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "ACCOUNT_TEMPORARILY_LOCKED",
  "ACCOUNT_LOCKED",
  "ACCOUNT_DISABLED",
  "USER_DISABLED",
  "USER_NOT_AVAILABLE",
  "USER_NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "LOGIN_FAILED",
  "AUTH_FAILED",
]);

const FAILURE_STATUSES = new Set([
  "error",
  "failed",
  "failure",
  "invalid",
  "unauthorized",
  "forbidden",
  "auth_error",
  "auth_failed",
  "login_failed",
  "disabled",
  "blocked",
  "locked",
]);

const BAD_TOKEN_VALUES = new Set([
  "",
  "null",
  "undefined",
  "false",
  "true",
  "none",
  "nan",
  "[object object]",
  "{}",
  "[]",
  "\"\"",
  "''",
]);

const VALID_ROLES = Object.freeze(["admin", "user"]);

/* =========================================================
   BASICS
========================================================= */

const isFunction = (value) => typeof value === "function";
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

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

function safeRawText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
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

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function firstText(...values) {
  for (const value of values) {
    const text = safeText(value, "");
    if (text) return text;
  }

  return "";
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function getState() {
  return safeObject(AppCore?.state);
}

function safeSetState(patch = {}, options = {}) {
  const finalPatch = safeObject(patch);

  try {
    AppCore?.setState?.(finalPatch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      emitDerived: false,
      silent: true,
      ...safeObject(options),
    });
  } catch {}

  try {
    AppCore?.patchState?.(finalPatch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      silent: true,
      ...safeObject(options),
    });
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, finalPatch);
  } catch {}

  return getState();
}

function wait(ms = 0) {
  return new Promise((resolve) => {
    try {
      setTimeout(resolve, Math.max(0, safeNumber(ms, 0)));
    } catch {
      resolve();
    }
  });
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(/([?&#](?:token|activationToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  }
}

function redactIdentifier(value = "") {
  const text = safeText(value, "");
  if (!text) return "";

  if (text.includes("@")) {
    const [local = "", domain = ""] = text.split("@");
    return `${local.slice(0, 2)}***@${domain || "***"}`;
  }

  if (text.length <= 4) return "***";
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function sanitizeUserForEvent(user = null) {
  if (!isPlainObject(user)) return null;

  const output = { ...user };

  for (const key of Object.keys(output)) {
    if (/token|password|hash|secret|otp|totp|mfa|2fa|authorization|cookie/i.test(key) || key.startsWith("_")) {
      delete output[key];
    }
  }

  if (output.avatar) output.avatar = redact(output.avatar);
  if (output.avatarUrl) output.avatarUrl = redact(output.avatarUrl);
  if (output.picture) output.picture = redact(output.picture);

  return output;
}

function emit(eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;
  if (options.silent === true || options.emit === false || options.emitEvents === false) return false;

  const detail = {
    source: SOURCE,
    version: LOGIN_VERSION,
    at: isoNow(),
    ...safeObject(payload),
  };

  for (const key of ["token", "accessToken", "access_token", "refreshToken", "refresh_token", "tempToken", "temp_token", "authorization", "password", "code", "otp", "totp"]) {
    if (key in detail) detail[key] = null;
  }

  if (detail.identifier) detail.identifier = redactIdentifier(detail.identifier);
  if (detail.user) detail.user = sanitizeUserForEvent(detail.user);

  for (const key of ["path", "route", "publicPath", "redirectTo", "url", "endpoint"]) {
    if (detail[key]) detail[key] = redact(detail[key]);
  }

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && options.window === true && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function setError(error = null) {
  try {
    AppCore?.setError?.(error);
  } catch {}

  safeSetState(error ? { error, lastError: error, hasError: true } : { error: null, hasError: false });
  return true;
}

/* =========================================================
   ERRORS
========================================================= */

function createAuthError(message = "No se pudo iniciar sesión.", { status = 401, code = "LOGIN_FAILED", raw = null } = {}) {
  const error = new Error(message);

  error.name = "AuthLoginError";
  error.status = status;
  error.statusCode = status;
  error.code = code;
  error.data = { code, message, status };

  try {
    Object.defineProperty(error, "raw", {
      value: raw,
      enumerable: false,
      configurable: true,
    });
  } catch {
    error.raw = raw;
  }

  return error;
}

function normalizeLoginError(error) {
  if (error?.name === "AuthLoginError") return error;

  const status = safeNumber(error?.status || error?.statusCode || error?.response?.status || error?.data?.status, 0);
  const timeout = error?.timeout === true || String(error?.name || "").toLowerCase().includes("timeout") || String(error?.code || "").toLowerCase().includes("timeout");
  const aborted = !timeout && (error?.aborted === true || String(error?.name || "") === "AbortError");

  const code = safeText(
    error?.code || error?.data?.code || error?.response?.data?.code,
    timeout
      ? "LOGIN_TIMEOUT"
      : aborted
        ? "LOGIN_ABORTED"
        : status === 401
          ? "UNAUTHORIZED"
          : status === 403
            ? "FORBIDDEN"
            : status === 423
              ? "ACCOUNT_TEMPORARILY_LOCKED"
              : "LOGIN_FAILED"
  );

  const message = timeout
    ? "El inicio de sesión ha tardado demasiado."
    : aborted
      ? "El inicio de sesión fue cancelado."
      : extractMessage(error) || error?.response?.data?.message || error?.data?.message || "No se pudo iniciar sesión.";

  return createAuthError(message, {
    status: status || (timeout ? 408 : 500),
    code,
    raw: error,
  });
}

/* =========================================================
   ENDPOINT / REQUEST
========================================================= */

function normalizeAuthEndpoint(endpoint = "", fallback = "/auth/login") {
  const raw = safeText(endpoint, fallback);

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/auth/")) return raw;
  if (raw.startsWith("/")) return `/auth${raw}`;

  return `/auth/${raw}`;
}

function resolveLoginEndpoint() {
  try {
    return normalizeAuthEndpoint(
      getLoginEndpoint?.() ||
        AUTH_ENDPOINTS?.login ||
        AUTH_ENDPOINTS?.auth?.login ||
        AppCore?.config?.auth?.endpoints?.login ||
        "/auth/login",
      "/auth/login"
    );
  } catch {
    return "/auth/login";
  }
}

function resolveTimeout(options = {}) {
  const custom = options.timeout ?? options.timeoutMs ?? options.loginTimeoutMs;

  if (custom !== undefined) return Math.max(1000, safeNumber(custom, DEFAULT_TIMEOUT_MS));

  try {
    return Math.max(1000, safeNumber(getLoginTimeoutMs?.() || getAuthPublicTimeoutMs?.(), DEFAULT_TIMEOUT_MS));
  } catch {}

  return Math.max(
    1000,
    safeNumber(AUTH_CONSTANTS?.loginTimeoutMs || AUTH_CONSTANTS?.authPublicTimeoutMs || AUTH_CONSTANTS?.requestTimeout, DEFAULT_TIMEOUT_MS)
  );
}

function publicLoginOptions(options = {}) {
  return {
    ...safeObject(options),
    public: true,
    auth: false,
    skipAuth: true,
    noAuthHeader: true,
    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    noAutoRefresh: true,
    autoRefresh: false,
    noAutoLogout: true,
    autoLogout: false,
    retry: false,
    retries: 0,
    _skipRetry: true,
    skipRetry: true,
    storeError: false,
    dedupe: false,
    captureAuth: false,
    timeout: resolveTimeout(options),
    timeoutMs: resolveTimeout(options),
    headers: {
      "X-Onion-Auth-Flow": "login",
      "X-Request-Source": SOURCE,
      ...safeObject(options.headers),
    },
  };
}

async function apiLogin(body = {}, options = {}) {
  const endpoint = resolveLoginEndpoint();
  const requestOptions = publicLoginOptions(options);

  if (endpoint === "/auth/login" || endpoint === "/api/auth/login") {
    return CoreHttp.login(body, requestOptions);
  }

  return CoreHttp.post(endpoint, body, requestOptions);
}

/* =========================================================
   CREDENTIALS
========================================================= */

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function looksLikePhone(value = "") {
  return /^\+?\d{6,20}$/.test(String(value).replace(/[^\d+]/g, "").trim());
}

function normalizePhone(value = "") {
  return String(value).replace(/[^\d+]/g, "").trim();
}

export function resolveLoginIdentifier(credentials = {}) {
  return safeText(
    credentials.identifier ??
      credentials.username ??
      credentials.user ??
      credentials.email ??
      credentials.phone ??
      credentials.telefono ??
      credentials.login ??
      ""
  );
}

export function normalizeLoginPayload(credentials = {}) {
  const maxIdentifier = safeNumber(AUTH_CONSTANTS?.identifierMaxLength, 160);
  const maxPassword = safeNumber(AUTH_CONSTANTS?.passwordMaxLength, 1024);

  const identifier = safeText(resolveLoginIdentifier(credentials))
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .slice(0, maxIdentifier);

  const password = safeRawText(credentials.password ?? credentials.pass ?? "").slice(0, maxPassword);

  return {
    identifier,
    password,
    remember: safeBool(credentials.remember, false),
  };
}

export function buildLoginRequestBody(credentials = {}) {
  const { identifier, password, remember } = normalizeLoginPayload(credentials);

  const email = looksLikeEmail(identifier) ? identifier.toLowerCase() : "";
  const phone = !email && looksLikePhone(identifier) ? normalizePhone(identifier) : "";
  const username = !email && !phone ? sanitizeUsername(identifier) : "";
  const slug = username || sanitizeUsername(identifier);

  return {
    identifier,
    login: identifier,
    user: username || identifier,

    email: email || undefined,
    emailLower: email || undefined,
    email_lower: email || undefined,

    phone: phone || undefined,
    telefono: phone || undefined,

    username: username || undefined,
    usernameLower: username || undefined,
    username_lower: username || undefined,

    slug: slug || undefined,

    password,
    remember,
    rememberMe: remember,
    remember_me: remember,
  };
}

function buildFingerprint(credentials = {}) {
  const payload = normalizeLoginPayload(credentials);
  return [payload.identifier.toLowerCase(), payload.remember ? "1" : "0"].join("|");
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function collectObjects(raw = {}) {
  const output = [];
  const queue = [raw];
  const seen = new WeakSet();

  while (queue.length && output.length < 80) {
    const current = queue.shift();
    if (!isPlainObject(current)) continue;

    try {
      if (seen.has(current)) continue;
      seen.add(current);
    } catch {}

    output.push(current);

    for (const key of NESTED_KEYS) {
      if (isPlainObject(current[key])) queue.push(current[key]);
    }

    if (isPlainObject(current.response?.data)) queue.push(current.response.data);
    if (isPlainObject(current.data?.auth)) queue.push(current.data.auth);
    if (isPlainObject(current.data?.session)) queue.push(current.data.session);
  }

  return output;
}

function pickValue(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }

  return "";
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
  const value = pickValue(objects, keys);

  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[,\s|]+/g).map((item) => item.trim()).filter(Boolean);

  return [];
}

function pickBool(objects = [], keys = []) {
  return objects.some((object) => keys.some((key) => key in safeObject(object) && safeBool(object[key], false)));
}

function normalizeToken(token = "") {
  const value = safeText(token, "").replace(/^Bearer\s+/i, "").trim();
  if (!value) return "";
  if (BAD_TOKEN_VALUES.has(value.toLowerCase())) return "";
  if (/[\s\r\n\t]/.test(value)) return "";

  const max = safeNumber(AUTH_CONSTANTS?.tokenMaxLength, 8192);
  if (max > 0 && value.length > max) return "";

  return value;
}

function hasUsableToken(token = "") {
  const value = normalizeToken(token);
  if (!value) return false;

  try {
    if (isFunction(AppCore?.utils?.hasValidToken)) return Boolean(AppCore.utils.hasValidToken(value));
  } catch {}

  return true;
}

function normalizeRole(value = "user") {
  const role = safeText(value, "user")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "") || "user";

  return role === "admin" ? "admin" : "user";
}

function normalizeStatus(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function isUserActive(user = null) {
  if (!isPlainObject(user)) return false;

  const status = normalizeStatus(user.status || user.estado || user.state || "");

  if (["disabled", "inactive", "deleted", "blocked", "suspended", "banned", "revoked", "archived", "desactivado", "inactivo", "bloqueado", "eliminado", "suspendido"].includes(status)) {
    return false;
  }

  if (user.disabled === true || user.deleted === true || user.blocked === true || user.banned === true || user.suspended === true || user.revoked === true || user.archived === true) {
    return false;
  }

  const active = user.active ?? user.enabled ?? user.isActive ?? user.isEnabled;
  return active === undefined || active === null || active === "" ? true : safeBool(active, true);
}

function resolveAvatar(user = {}) {
  return (
    user.avatar ||
    user.avatarUrl ||
    user.avatar_url ||
    user.photo ||
    user.photoUrl ||
    user.photo_url ||
    user.image ||
    user.imageUrl ||
    user.image_url ||
    user.picture ||
    user.pictureUrl ||
    user.picture_url ||
    null
  );
}

function normalizeUserForClient(user = null) {
  if (!isPlainObject(user) || !isUserActive(user)) return null;

  const userId = firstText(user.userId, user.user_id, user.uid, user.sub, user.id, user._id);
  const username = firstText(user.username, user.userName, user.user_name, user.usernameLower, user.slug);
  const email = firstText(user.email, user.mail, user.emailLower, user.email_lower);
  const role = normalizeRole(firstText(user.role, user.rol, user.type, user.tipo, "user"));
  const avatar = resolveAvatar(user);
  const preferences = safeObject(user.preferences || user.preferencias);
  const usernameLower = user.usernameLower || user.username_lower || sanitizeUsername(username || email || "");
  const displayName = user.displayName || user.fullName || user.name || user.nombre || username || email || "Usuario";

  return {
    ...user,
    id: user.id || userId || null,
    userId: user.userId || userId || null,
    user_id: user.user_id || userId || null,
    uid: user.uid || userId || null,
    sub: user.sub || userId || null,
    username: username || null,
    userName: user.userName || username || null,
    user_name: user.user_name || username || null,
    usernameLower: usernameLower || null,
    username_lower: user.username_lower || usernameLower || null,
    slug: user.slug || usernameLower || null,
    email: email || null,
    emailLower: user.emailLower || user.email_lower || (email ? email.toLowerCase() : null),
    email_lower: user.email_lower || user.emailLower || (email ? email.toLowerCase() : null),
    name: displayName,
    nombre: user.nombre || displayName,
    displayName,
    fullName: user.fullName || displayName,
    role,
    rol: role,
    roles: unique([role, ...safeArray(user.roles)]).filter((item) => VALID_ROLES.includes(item)),
    permissions: safeArray(user.permissions || user.permisos),
    permisos: safeArray(user.permisos || user.permissions),
    avatar,
    avatarUrl: avatar,
    picture: avatar,
    hasAvatar: user.hasAvatar === true || user.has_avatar === true || Boolean(avatar),
    preferences,
    lang: user.lang || user.language || user.locale || preferences.lang || null,
    language: user.language || preferences.language || user.lang || preferences.lang || null,
    locale: user.locale || preferences.locale || user.language || user.lang || null,
    theme: user.theme || user.mode || user.appearance || preferences.theme || null,
    mode: user.mode || preferences.mode || user.theme || preferences.theme || null,
    appearance: user.appearance || preferences.appearance || user.theme || preferences.theme || null,
    clienteId: user.clienteId || user.clientId || user.customerId || null,
    tokenVersion: user.tokenVersion ?? user.token_version ?? user.tv ?? null,
    active: true,
  };
}

function hasUsableUser(user = null) {
  if (!isPlainObject(user) || !isUserActive(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.user_id ||
      user.uid ||
      user.sub ||
      user.username ||
      user.userName ||
      user.email ||
      user.mail ||
      user.phone ||
      user.telefono ||
      user.name ||
      user.nombre ||
      user.displayName
  );
}

function normalizeSessionData(session = null, user = null) {
  const source = safeObject(session);

  const sessionId = firstText(source.sessionId, source.session_id, source.sid, source.id);
  const userId = firstText(source.userId, source.user_id, source.sessionUserId, source.session_user_id, user?.userId, user?.user_id, user?.id, user?.sub);
  const expiresAt = firstText(source.expiresAt, source.expires_at, source.refreshExpiresAt, source.refresh_expires_at, source.expiration, source.expires);
  const tokenVersion = source.tokenVersion ?? source.token_version ?? source.tv ?? user?.tokenVersion ?? user?.token_version ?? user?.tv ?? null;

  if (!sessionId && !userId && !expiresAt && tokenVersion === null && !Object.keys(source).length) return null;

  return {
    ...source,
    id: source.id || sessionId || null,
    sessionId: source.sessionId || source.session_id || source.sid || sessionId || null,
    session_id: source.session_id || source.sessionId || source.sid || sessionId || null,
    sid: source.sid || sessionId || null,
    userId: source.userId || source.user_id || source.uid || userId || null,
    user_id: source.user_id || source.userId || source.uid || userId || null,
    sessionUserId: source.sessionUserId || source.session_user_id || userId || null,
    session_user_id: source.session_user_id || source.sessionUserId || userId || null,
    expiresAt: source.expiresAt || source.expires_at || source.refreshExpiresAt || source.refresh_expires_at || expiresAt || null,
    refreshExpiresAt: source.refreshExpiresAt || source.refresh_expires_at || source.expiresAt || source.expires_at || expiresAt || null,
    tokenVersion,
    tv: tokenVersion,
  };
}

function validateResponseSoft(response) {
  try {
    return validateAuthResponse(response);
  } catch {
    return null;
  }
}

function normalizeAuthPayload(response) {
  const validated = safeObject(validateResponseSoft(response));
  const merged = {
    ...safeObject(response),
    ...validated,
    data: { ...safeObject(response?.data), ...safeObject(validated.data) },
    auth: { ...safeObject(response?.auth), ...safeObject(validated.auth) },
  };

  const objects = collectObjects(merged);

  let token = normalizeToken(pickText(objects, TOKEN_KEYS));
  const refreshToken = normalizeToken(pickText(objects, REFRESH_TOKEN_KEYS));
  let tempToken = normalizeToken(pickText(objects, TEMP_TOKEN_KEYS));
  const user = normalizeUserForClient(pickObject(objects, USER_KEYS));
  const role = normalizeRole(firstText(pickText(objects, ["role", "rol", "type", "tipo", "userRole", "user_role"]), user?.role, "user"));
  const permissions = unique([...pickArray(objects, ["permissions", "permisos", "scopes", "scope"]), ...safeArray(user?.permissions), ...safeArray(user?.permisos)]);
  const status = pickValue(objects, ["status", "statusCode", "status_code", "state", "estado"]);
  const statusKey = normalizeStatus(status);
  const code = pickText(objects, ["code", "errorCode", "error_code", "error"]);
  const message = pickText(objects, ["message", "mensaje", "errorMessage", "error_message", "detail", "description", "reason"]);
  const redirectTo = normalizeRedirectCandidate(pickText(objects, ["redirectTo", "redirect_to", "redirect", "next", "returnTo", "target"]));
  const sessionData = normalizeSessionData(pickObject(objects, SESSION_KEYS), user);
  const tokenVersion = sessionData?.tokenVersion ?? user?.tokenVersion ?? pickValue(objects, ["tokenVersion", "token_version", "tv"]);

  let requires2FA = Boolean(tempToken) || pickBool(objects, TWO_FACTOR_KEYS) || TWO_FACTOR_STATUSES.has(statusKey);

  if (requires2FA && !tempToken && token && !hasUsableUser(user)) {
    tempToken = token;
    token = "";
  }

  if (requires2FA) token = "";

  const statusNumber = Number(status || 0);
  const codeUpper = safeText(code, "").toUpperCase();

  const explicitFailure = !requires2FA && (
    (Number.isFinite(statusNumber) && statusNumber >= 400) ||
    (codeUpper && FAILURE_CODES.has(codeUpper)) ||
    (statusKey && FAILURE_STATUSES.has(statusKey)) ||
    objects.some((object) => object.ok === false || object.success === false)
  );

  const authenticated = !explicitFailure && !requires2FA && hasUsableToken(token) && hasUsableUser(user);

  return {
    raw: response,
    ok: authenticated || requires2FA,
    success: authenticated || requires2FA,
    explicitFailure,
    authenticated,
    status: safeText(status, explicitFailure ? "auth_failed" : requires2FA ? "2fa_required" : authenticated ? "authenticated" : ""),
    code,
    message,
    token,
    accessToken: token,
    access_token: token,
    refreshToken,
    refresh_token: refreshToken,
    tempToken,
    temp_token: tempToken,
    user,
    usuario: user,
    role,
    rol: role,
    permissions,
    permisos: permissions,
    session: sessionData,
    sessionData,
    sessionId: sessionData?.sessionId || null,
    sessionUserId: sessionData?.sessionUserId || sessionData?.userId || null,
    tokenVersion,
    requires2FA,
    redirectTo,
  };
}

function assertAuthenticatedPayload(authData = {}) {
  if (authData.explicitFailure || authData.ok === false) {
    throw createAuthError(authData.message || "Credenciales incorrectas.", {
      status: Number(authData.status) || 401,
      code: authData.code || "INVALID_CREDENTIALS",
      raw: authData.raw,
    });
  }

  if (!hasUsableToken(authData.token)) {
    throw createAuthError("El login no devolvió token de autenticación.", {
      status: 401,
      code: "INVALID_LOGIN_SESSION",
      raw: authData.raw,
    });
  }

  if (!hasUsableUser(authData.user)) {
    throw createAuthError("El login no devolvió un usuario válido.", {
      status: 401,
      code: "INVALID_LOGIN_SESSION",
      raw: authData.raw,
    });
  }

  return true;
}

/* =========================================================
   ROUTES
========================================================= */

function normalizeRedirectCandidate(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "";

  let candidate = "";

  try {
    candidate = sanitizeRedirectPath(raw, "");
  } catch {
    candidate = raw.startsWith("/") ? raw : `/${raw}`;
  }

  if (!candidate) return "";
  if (!isSafeRelativePath(candidate)) return "";
  if (isAuthRoute(candidate)) return "";

  return candidate;
}

function getHomeRoute() {
  const configured = configLikeRoute(AppCore?.config?.routes?.home || AppCore?.config?.homePath || DEFAULT_HOME_PATH);

  if (!configured || isAuthRoute(configured) || !isSafeRelativePath(configured)) return DEFAULT_HOME_PATH;
  return configured;
}

function getLoginRoute() {
  const loginPath = configLikeRoute(AppCore?.config?.routes?.login || DEFAULT_LOGIN_PATH);
  return isSafeRelativePath(loginPath) ? loginPath : DEFAULT_LOGIN_PATH;
}

function getBrowserPath() {
  if (!isBrowser()) return "/";

  try {
    return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return "/";
  }
}

function getBrowserCanonicalPath() {
  try {
    return configLikeRoute(getCurrentCanonicalPath() || getBrowserPath() || "/");
  } catch {
    return configLikeRoute(getBrowserPath() || "/");
  }
}

function getRedirectFromUrl() {
  if (!isBrowser()) return "";

  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeRedirectCandidate(params.get("redirect") || params.get("next") || params.get("target") || params.get("returnTo") || "");
  } catch {
    return "";
  }
}

function getRedirectFromOptions(options = {}) {
  return normalizeRedirectCandidate(options.redirectTo || options.redirect || options.target || options.next || options.returnTo || "");
}

export function buildLoginRedirectPath(targetPath = null) {
  const loginPath = getLoginRoute();
  const target = configLikeRoute(targetPath || getCurrentCanonicalPath() || "/");

  if (!target || target === loginPath || !isSafeRelativePath(target) || isAuthRoute(target)) return loginPath;
  if (!isBrowser()) return `${loginPath}?redirect=${encodeURIComponent(target)}`;

  try {
    const url = new URL(loginPath, window.location.origin);
    url.searchParams.set("redirect", target);
    return `${url.pathname}${url.search}`;
  } catch {
    return loginPath;
  }
}

export function getPostLoginTarget(user = getState().user, options = {}) {
  const fromOptions = getRedirectFromOptions(options);
  if (fromOptions) return fromOptions;

  const fromUrl = getRedirectFromUrl();
  if (fromUrl) return fromUrl;

  const userHome = normalizeRedirectCandidate(user?.homePath || user?.routing?.homePath || user?.routing?.panelPath || user?.preferences?.homePath || "");
  return userHome || getHomeRoute();
}

/* =========================================================
   SESSION STATE
========================================================= */

function clearLoginAuthState(reason = "login-clear") {
  try {
    clearSessionLocal({
      silent: true,
      source: SOURCE,
      reason,
      preserveCurrentRoute: true,
      preserveRoute: true,
      preserveInitialUrl: true,
      skipNavigation: true,
      skipNavigate: true,
      skipRedirect: true,
      noRedirect: true,
      route: getState().route || getBrowserCanonicalPath(),
      publicPath: getState().publicPath || getBrowserPath(),
    });
  } catch {}

  try {
    persistTempToken(null);
  } catch {}

  safeSetState({
    loginInProgress: false,
    authenticated: false,
    hasToken: false,
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
    role: "",
    rol: "",
    userRole: "",
    roles: [],
    permissions: [],
    permisos: [],
    session: null,
    sessionData: null,
    sessionId: null,
    sessionUserId: null,
    currentResolvedUsername: null,
    resolvedUsername: null,
    twoFactorPending: false,
    twoFactorUser: null,
    tempToken: null,
    temp_token: null,
  }, { forceUnauthenticated: true });

  return true;
}

function markLoginInProgress(value = false) {
  safeSetState({ loginInProgress: Boolean(value) });
  return Boolean(value);
}

function applyAuthenticatedLogin(authData = {}) {
  assertAuthenticatedPayload(authData);

  const token = normalizeToken(authData.token);
  const user = normalizeUserForClient(authData.user);
  const sessionData = normalizeSessionData(authData.sessionData || authData.session, user);

  const payload = {
    token,
    accessToken: token,
    access_token: token,
    refreshToken: authData.refreshToken || null,
    refresh_token: authData.refreshToken || null,
    user,
    usuario: user,
    me: user,
    account: user,
    profile: user,
    role: authData.role || user?.role || "user",
    rol: authData.role || user?.role || "user",
    permissions: authData.permissions || user?.permissions || [],
    permisos: authData.permissions || user?.permisos || [],
    session: sessionData,
    sessionData,
    sessionId: sessionData?.sessionId || authData.sessionId || null,
    session_id: sessionData?.sessionId || authData.sessionId || null,
    sessionUserId: sessionData?.sessionUserId || sessionData?.userId || authData.sessionUserId || user?.userId || user?.id || null,
    session_user_id: sessionData?.sessionUserId || sessionData?.userId || authData.sessionUserId || user?.userId || user?.id || null,
    tokenVersion: authData.tokenVersion ?? user?.tokenVersion ?? sessionData?.tokenVersion ?? null,
    tv: authData.tokenVersion ?? user?.tokenVersion ?? sessionData?.tokenVersion ?? null,
    authenticated: true,
    ok: true,
    success: true,
    source: SOURCE,
    eventMode: "login",
  };

  applySession(payload, {
    source: SOURCE,
    eventMode: "login",
    emit: false,
    silent: true,
    allowExplicitAuthenticated: true,
  });

  const state = getState();

  return {
    token,
    accessToken: token,
    refreshToken: normalizeToken(authData.refreshToken || state.refreshToken || ""),
    user: state.user || user,
    role: state.role || payload.role || "user",
    roles: state.roles || [payload.role || "user"],
    permissions: state.permissions || payload.permissions || [],
    session: state.session || sessionData,
    sessionData: state.sessionData || state.session || sessionData,
    sessionId: state.sessionId || payload.sessionId || null,
    sessionUserId: state.sessionUserId || payload.sessionUserId || null,
    tokenVersion: state.tokenVersion ?? payload.tokenVersion ?? null,
  };
}

/* =========================================================
   CORE LOGIN
========================================================= */

async function executeLogin(credentials = {}, sequence = 0, options = {}) {
  const normalized = normalizeLoginPayload(credentials);

  if (!normalized.identifier || !normalized.password) {
    throw createAuthError("Usuario/email y contraseña son obligatorios.", {
      status: 400,
      code: "MISSING_CREDENTIALS",
    });
  }

  setError(null);
  markLoginInProgress(true);

  emit("auth:login:request:start", {
    sequence,
    identifier: normalized.identifier,
    endpoint: resolveLoginEndpoint(),
  });

  const response = await apiLogin(buildLoginRequestBody(credentials), options);
  const authData = normalizeAuthPayload(response);

  emit("auth:login:request:complete", {
    sequence,
    status: authData.status,
    authenticated: authData.authenticated,
    requires2FA: authData.requires2FA,
    explicitFailure: authData.explicitFailure,
    hasUser: hasUsableUser(authData.user),
    hasToken: hasUsableToken(authData.token),
    hasRefreshToken: Boolean(authData.refreshToken),
    hasSession: Boolean(authData.sessionId),
    tokenVersion: authData.tokenVersion ?? null,
  });

  if (authData.explicitFailure || authData.ok === false) {
    throw createAuthError(authData.message || "Credenciales incorrectas.", {
      status: Number(authData.status) || 401,
      code: authData.code || "INVALID_CREDENTIALS",
      raw: response,
    });
  }

  if (authData.requires2FA) {
    if (!authData.tempToken) {
      throw createAuthError("Se requiere 2FA pero no se recibió token temporal.", {
        status: 401,
        code: "MISSING_2FA_TEMP_TOKEN",
        raw: response,
      });
    }

    try {
      persistTempToken(authData.tempToken);
    } catch {}

    applySession({
      tempToken: authData.tempToken,
      temp_token: authData.tempToken,
      user: authData.user || null,
      authenticated: false,
      ok: true,
      success: true,
      source: SOURCE,
      eventMode: "login",
    }, {
      source: SOURCE,
      eventMode: "login",
      silent: true,
      emit: false,
    });

    const redirectTo = authData.redirectTo || DEFAULT_2FA_PATH;

    const result = {
      ok: true,
      success: true,
      status: "2fa_required",
      requires2FA: true,
      authenticated: false,
      tempToken: authData.tempToken,
      user: authData.user,
      redirectTo,
      response,
    };

    emit("auth:login:2fa-required", {
      requires2FA: true,
      authenticated: false,
      redirectTo,
      hasUser: Boolean(authData.user),
      sequence,
    });

    return result;
  }

  const snapshot = applyAuthenticatedLogin(authData);

  if (!snapshot?.token || !hasUsableToken(snapshot.token) || !hasUsableUser(snapshot.user)) {
    clearLoginAuthState("invalid-login-snapshot");

    throw createAuthError("El login devolvió sesión inválida.", {
      status: 401,
      code: "INVALID_LOGIN_SESSION",
      raw: response,
    });
  }

  try {
    persistTempToken(null);
  } catch {}

  await wait(0);

  const trustedAuthRedirect = options.trustAuthRedirect === true && authData.redirectTo ? normalizeRedirectCandidate(authData.redirectTo) : "";
  const redirectTo = getPostLoginTarget(snapshot.user, {
    ...safeObject(options),
    redirectTo: getRedirectFromOptions(options) || trustedAuthRedirect || undefined,
  });

  const result = {
    ok: true,
    success: true,
    status: "authenticated",
    authenticated: true,
    requires2FA: false,
    token: snapshot.token,
    accessToken: snapshot.token,
    refreshToken: snapshot.refreshToken || authData.refreshToken || "",
    user: snapshot.user,
    role: snapshot.role || authData.role || "user",
    roles: snapshot.roles || [snapshot.role || authData.role || "user"],
    permissions: snapshot.permissions || authData.permissions || [],
    session: snapshot.session || authData.sessionData || null,
    sessionData: snapshot.sessionData || snapshot.session || authData.sessionData || null,
    sessionId: snapshot.sessionId || authData.sessionId || null,
    sessionUserId: snapshot.sessionUserId || authData.sessionUserId || null,
    tokenVersion: snapshot.tokenVersion ?? authData.tokenVersion ?? null,
    redirectTo,
    response,
  };

  if (options.emitLoginSuccessEvent === true) {
    emit("auth:login:success", {
      authenticated: true,
      user: result.user,
      role: result.role,
      redirectTo,
      sessionId: result.sessionId,
      tokenVersion: result.tokenVersion,
      sequence,
    });
  }

  emit("auth:login:session-committed", {
    authenticated: true,
    user: result.user,
    role: result.role,
    sessionId: result.sessionId,
    tokenVersion: result.tokenVersion,
    sequence,
  });

  return result;
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function login(credentials = {}, options = {}) {
  const fingerprint = buildFingerprint(credentials);

  if (loginPromise) {
    if (!loginFingerprint || loginFingerprint === fingerprint) return loginPromise;

    throw createAuthError("Ya hay un inicio de sesión en curso.", {
      status: 409,
      code: "LOGIN_ALREADY_IN_PROGRESS",
    });
  }

  const sequence = ++loginSequence;
  loginFingerprint = fingerprint;

  loginPromise = (async () => {
    try {
      emit("auth:login:start", {
        sequence,
        identifier: resolveLoginIdentifier(credentials),
      });

      clearLoginAuthState("before-login");
      markLoginInProgress(true);

      return await executeLogin(credentials, sequence, options);
    } catch (error) {
      const finalError = normalizeLoginError(error);

      clearLoginAuthState("login-failed");
      setError(finalError);

      emit("auth:login:error", {
        sequence,
        error: {
          name: finalError.name || "Error",
          message: extractMessage(finalError),
          status: finalError.status || 0,
          code: finalError.code || finalError.data?.code || null,
        },
        message: extractMessage(finalError),
      });

      throw finalError;
    } finally {
      markLoginInProgress(false);
      loginPromise = null;
      loginFingerprint = "";
    }
  })();

  return loginPromise;
}

export async function handleLoginFormSubmit(formElement, options = {}) {
  const HTMLForm = isBrowser() ? window.HTMLFormElement : null;

  if (!HTMLForm || !(formElement instanceof HTMLForm)) {
    throw new Error("Se esperaba un formulario HTML válido.");
  }

  try {
    options.event?.preventDefault?.();
  } catch {}

  const formData = new FormData(formElement);

  const credentials = {
    identifier:
      formData.get("identifier") ||
      formData.get("username") ||
      formData.get("email") ||
      formData.get("phone") ||
      formData.get("telefono") ||
      formData.get("user") ||
      formData.get("login") ||
      "",
    password: formData.get("password") || "",
    remember: ["on", "true", "1"].includes(String(formData.get("remember") || "").toLowerCase()),
  };

  const result = await login(credentials, options);

  if (safeBool(options.resetOnSuccess, false) && result?.status === "authenticated") {
    try {
      formElement.reset();
    } catch {}
  }

  return result;
}

/* =========================================================
   DEBUG
========================================================= */

export function getLoginSnapshot() {
  const state = getState();
  const user = state.user || state.currentUser || state.authUser || state.sessionUser || null;

  return {
    version: LOGIN_VERSION,
    loginInFlight: Boolean(loginPromise),
    loginSequence,
    endpoint: resolveLoginEndpoint(),
    publicRequestPolicy: {
      auth: false,
      public: true,
      skipAuth: true,
      noAuthHeader: true,
      skipAuthRefresh: true,
      noAutoRefresh: true,
      noAutoLogout: true,
      retry: false,
      retries: 0,
    },
    loginTimeoutMs: resolveTimeout(),
    loginRoute: getLoginRoute(),
    homeRoute: getHomeRoute(),
    currentPath: redact(getBrowserPath()),
    currentCanonicalPath: redact(getBrowserCanonicalPath()),
    hasCoreHttp: Boolean(CoreHttp?.request),
    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(state.token || state.accessToken || state.access_token),
    token: null,
    accessToken: null,
    refreshToken: null,
    hasRefreshToken: Boolean(state.refreshToken || state.refresh_token || state.session?.refreshToken || state.sessionData?.refreshToken),
    hasUser: hasUsableUser(user),
    userId: user?.userId || user?.id || null,
    role: state.role || user?.role || null,
    roles: state.roles || [],
    permissions: safeArray(state.permissions || user?.permissions),
    hasSession: Boolean(state.session?.sessionId || state.sessionData?.sessionId || state.sessionId),
    sessionId: state.session?.sessionId || state.sessionData?.sessionId || state.sessionId || null,
    sessionUserId: state.session?.sessionUserId || state.sessionData?.sessionUserId || state.sessionUserId || null,
    tokenVersion: state.tokenVersion ?? state.session?.tokenVersion ?? state.sessionData?.tokenVersion ?? user?.tokenVersion ?? null,
    loginInProgress: Boolean(state.loginInProgress),
    twoFactorPending: Boolean(state.twoFactorPending),
    policy: {
      ownFetch: false,
      ownRouter: false,
      ownToast: false,
      ownRefresh: false,
      roles: [...VALID_ROLES],
    },
    at: isoNow(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  LOGIN_VERSION,

  resolveLoginIdentifier,
  normalizeLoginPayload,
  buildLoginRequestBody,

  buildLoginRedirectPath,
  getPostLoginTarget,

  login,
  handleLoginFormSubmit,

  getLoginSnapshot,
};
