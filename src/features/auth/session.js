/* =========================================================
   Onion SPA - Auth Session
   Archivo: src/features/auth/session.js

   AUTH SESSION · EXTREME PRO SYSTEM · 15/10
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
   - normalizar contrato backend Onion Auth:
       · token / accessToken / access_token
       · refreshToken / refresh_token
       · session / sessionData
       · sessionId / session_id
       · userId / user_id
       · user / usuario / me / account / profile
       · data / payload / result / body / response / auth
   - mantener session y sessionData como alias controlados al MISMO contexto canónico
   - evitar duplicidades raras de estado
   - preservar avatar/preferencias/idioma/tema del usuario

   HARDENING EXTREMO:
   - authenticated sólo true con token usable + user usable + user activo
   - token/user desacoplados sin corrupción
   - token explícito sin user explícito NO reutiliza usuario viejo por defecto
   - token_only permitido como hasToken=true pero authenticated=false
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
  redactTokenInText,
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
  persistAccessToken,
  persistSessionContext,
  clearAuthStorage,
} from "./storage.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const AUTH_SESSION_VERSION =
  "15.0.0";

const SESSION_SOURCE =
  "auth.session";

const DEFAULT_ROUTE =
  "/";

const ACTIVATION_PATH =
  "/activate-account";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const PUBLIC_TECHNICAL_ROUTES =
  Object.freeze([
    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
  ]);

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
  ]);

const MANAGER_ROLE_KEYS =
  new Set([
    "manager",
    "gestor",
    "gerente",
    "lead",
    "team_lead",
    "supervisor",
  ]);

const CLIENT_ROLE_KEYS =
  new Set([
    "client",
    "cliente",
    "customer",
    "usuario",
    "user",
  ]);

const LEGACY_AUTH_STORAGE_KEYS =
  Object.freeze([
    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_temporary_token",
    "onion_two_factor_token",
    "onion_mfa_token",
    "onion_session_id",
    "onion_session_user_id",
    "onion_user",
    "onion_user_id",
    "onion_user_slug",
    "onion_user_name",
    "onion_username",
    "onion_role",

    "onion:token",
    "onion:user",
    "onion:accessToken",
    "onion:access_token",
    "onion:refreshToken",
    "onion:refresh_token",
    "onion:tempToken",
    "onion:temp_token",
    "onion:temporaryToken",
    "onion:temporary_token",
    "onion:twoFactorToken",
    "onion:two_factor_token",
    "onion:mfaToken",
    "onion:mfa_token",
    "onion:sessionId",
    "onion:session_id",
    "onion:sessionUserId",
    "onion:session_user_id",
    "onion:userId",
    "onion:user_id",
    "onion:userName",
    "onion:user_name",
    "onion:username",
    "onion:userSlug",
    "onion:user_slug",
    "onion:role",
    "onion:session",
    "onion:sessionData",

    "onion.token",
    "onion.user",
    "onion.accessToken",
    "onion.access_token",
    "onion.refreshToken",
    "onion.refresh_token",
    "onion.tempToken",
    "onion.temp_token",
    "onion.sessionId",
    "onion.session_id",
    "onion.sessionUserId",
    "onion.session_user_id",
    "onion.role",
    "onion.session",
    "onion.sessionData",

    "auth_token",
    "access_token",
    "refresh_token",
    "temp_token",
    "temporary_token",
    "two_factor_token",
    "mfa_token",

    "token",
    "accessToken",
    "access_token",
    "session",
    "sessionData",
    "user",
    "currentUser",
    "authUser",
    "sessionUser",
    "role",
    "userRole",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "sessionId",
    "session_id",
    "sessionUserId",
    "session_user_id",
  ]);

const TOKEN_KEYS =
  Object.freeze([
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

const USER_KEYS =
  Object.freeze([
    "user",
    "usuario",
    "me",
    "account",
    "profile",
    "currentUser",
    "current_user",
  ]);

const SESSION_KEYS =
  Object.freeze([
    "session",
    "sessionData",
    "authSession",
    "auth_session",
  ]);

const SESSION_ID_KEYS =
  Object.freeze([
    "sessionId",
    "session_id",
    "sid",
    "id",
  ]);

const SESSION_USER_ID_KEYS =
  Object.freeze([
    "sessionUserId",
    "session_user_id",
    "userId",
    "user_id",
    "uid",
    "sub",
  ]);

const SESSION_EXPIRES_KEYS =
  Object.freeze([
    "expiresAt",
    "expires_at",
    "refreshExpiresAt",
    "refresh_expires_at",
    "expiration",
    "expires",
  ]);

const ROLE_KEYS =
  Object.freeze([
    "role",
    "rol",
    "userRole",
    "user_role",
    "type",
    "tipo",
    "userType",
    "user_type",
  ]);

const ROOT_OBJECT_KEYS =
  Object.freeze([
    "data",
    "payload",
    "result",
    "body",
    "response",
    "auth",
    "authData",
  ]);

const SESSION_EVENTS =
  Object.freeze({
    state:
      "auth:session:state",

    applied:
      "auth:session:applied",

    partial:
      "auth:session:partial",

    restored:
      "auth:session:restored",

    cleared:
      "auth:session:cleared",

    appSessionChange:
      "app:session:change",

    appSessionRestored:
      "app:session:restored",

    appSessionCleared:
      "app:session:cleared",

    appAuthChange:
      "app:auth:change",

    authChange:
      "auth:change",

    userChange:
      "app:user:change",

    userUpdated:
      "app:user:updated",
  });

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
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

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
    const key =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
        "enabled",
        "active",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value) {
  return isPlainObject(value)
    ? value
    : {};
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

function first(...values) {
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

function firstText(...values) {
  return safeText(
    first(...values),
    ""
  );
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean)
    )
  );
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function hasOwn(obj, key) {
  try {
    return Boolean(
      obj &&
        typeof obj === "object" &&
        Object.prototype.hasOwnProperty.call(
          obj,
          key
        )
    );
  } catch {
    return false;
  }
}

function ensureCoreState() {
  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      return AppCore.state;
    }
  } catch {}

  return {};
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthSession]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[AuthSession]",
        ...args
      );
    }
  } catch {}
}

function safeSetState(patch = {}, options = {}) {
  const safePatch =
    isPlainObject(patch)
      ? patch
      : {};

  try {
    AppCore?.setState?.(
      safePatch,
      {
        source:
          options.source || SESSION_SOURCE,

        ...options,
      }
    );
  } catch {}

  /*
    Reafirmación directa intencionada:
    algunos normalizadores globales pueden marcar auth=true con token solo.
    Esta capa Auth es la autoridad final para evitar ghost auth.
  */
  try {
    Object.assign(
      ensureCoreState(),
      safePatch
    );
  } catch {}

  return ensureCoreState();
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function safeRedact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      )
      .replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  }
}

function sanitizePublicUser(user = null) {
  if (!isPlainObject(user)) {
    return null;
  }

  const output = {
    ...user,
  };

  for (const key of [
    "password",
    "passwordHash",
    "password_hash",
    "hash",
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "twofa_secret",
    "twofaSecret",
    "mfa_secret",
    "mfaSecret",
    "reset",
    "activation",
    "otp",
    "totp",
    "_rid",
    "_self",
    "_etag",
    "_attachments",
    "_ts",
  ]) {
    delete output[key];
  }

  if (output.avatar) {
    output.avatar =
      safeRedact(output.avatar);
  }

  if (output.avatarUrl) {
    output.avatarUrl =
      safeRedact(output.avatarUrl);
  }

  if (output.picture) {
    output.picture =
      safeRedact(output.picture);
  }

  return output;
}

function sanitizeRouteContext(context = {}) {
  const source =
    safeObject(context);

  return {
    ...source,

    route:
      safeRedact(source.route || ""),

    publicPath:
      safeRedact(source.publicPath || ""),

    lastRoute:
      safeRedact(source.lastRoute || ""),

    browserPath:
      safeRedact(source.browserPath || ""),
  };
}

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
    "authorization",
    "password",
    "pass",
    "secret",
    "code",
    "otp",
    "totp",
  ]) {
    if (key in output) {
      output[key] =
        null;
    }
  }

  if (output.user) {
    output.user =
      sanitizePublicUser(output.user);
  }

  if (output.publicPath) {
    output.publicPath =
      safeRedact(output.publicPath);
  }

  if (output.route) {
    output.route =
      safeRedact(output.route);
  }

  if (output.url) {
    output.url =
      safeRedact(output.url);
  }

  if (output.routeContext) {
    output.routeContext =
      sanitizeRouteContext(output.routeContext);
  }

  if (output.error) {
    output.error = {
      name:
        output.error.name || "Error",
      message:
        safeRedact(
          output.error.message ||
            extractMessage(output.error) ||
            "Error"
        ),
      status:
        output.error.status ||
        output.error.statusCode ||
        output.error.response?.status ||
        null,
      code:
        output.error.code ||
        output.error.data?.code ||
        null,
    };
  }

  return output;
}

function safeEmit(eventName, payload = {}, options = {}) {
  const opts =
    safeObject(options);

  if (
    opts.silent === true ||
    opts.emit === false ||
    opts.emitEvents === false
  ) {
    return false;
  }

  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload =
    buildTokenSafePayload({
      source:
        SESSION_SOURCE,

      version:
        AUTH_SESSION_VERSION,

      at:
        safeIsoDate(),

      ...safeObject(payload),
    });

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(
        name,
        cleanPayload
      );

      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      document.dispatchEvent(
        new CustomEvent(name, {
          detail:
            cleanPayload,
          bubbles:
            false,
          cancelable:
            false,
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
  const explicit =
    safeText(eventMode, "")
      .toLowerCase();

  if (
    [
      "login",
      "restore",
      "apply",
      "manual",
      "silent",
      "clear",
      "refresh",
      "me",
      "token_only",
    ].includes(explicit)
  ) {
    return explicit;
  }

  if (emitRestoreEvents === true) {
    return "restore";
  }

  const key =
    safeText(source, "")
      .toLowerCase();

  if (key.includes("restore")) {
    return "restore";
  }

  if (key.includes("login")) {
    return "login";
  }

  if (key.includes("refresh")) {
    return "refresh";
  }

  if (key.includes("me")) {
    return "me";
  }

  return "apply";
}

/* =========================================================
   PAYLOAD COLLECTION
========================================================= */

function collectPayloadObjects(raw = {}) {
  const output =
    [];

  const seen =
    new Set();

  const queue =
    [raw];

  let guard =
    0;

  while (
    queue.length &&
    guard < 120
  ) {
    guard += 1;

    const current =
      queue.shift();

    if (
      !isPlainObject(current) ||
      seen.has(current)
    ) {
      continue;
    }

    seen.add(current);
    output.push(current);

    for (const key of ROOT_OBJECT_KEYS) {
      const nested =
        current[key];

      if (isPlainObject(nested)) {
        queue.push(nested);
      }
    }

    for (const key of SESSION_KEYS) {
      const nested =
        current[key];

      if (isPlainObject(nested)) {
        queue.push(nested);
      }
    }

    for (const key of USER_KEYS) {
      const nested =
        current[key];

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

function payloadHasAnyKey(objects = [], keys = []) {
  return safeArray(objects).some((object) =>
    safeArray(keys).some((key) =>
      hasOwn(object, key)
    )
  );
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
  return safeText(
    pickValueFromObjects(
      objects,
      keys
    ),
    ""
  );
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

function stripBearer(token = "") {
  return safeText(token, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function hasUsableToken(token = "") {
  const value =
    stripBearer(token);

  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

  if (
    [
      "null",
      "undefined",
      "false",
      "true",
      "nan",
      "none",
      "[object object]",
      "{}",
      "[]",
    ].includes(lower)
  ) {
    return false;
  }

  if (/[\s\r\n\t]/.test(value)) {
    return false;
  }

  try {
    if (isFunction(AppCore?.utils?.hasValidToken)) {
      return Boolean(
        AppCore.utils.hasValidToken(value)
      );
    }
  } catch {}

  return true;
}

function isUserActive(user = null) {
  if (!isPlainObject(user)) {
    return false;
  }

  const status =
    safeText(
      user.status ||
        user.estado ||
        user.state ||
        user.accountStatus ||
        "",
      ""
    ).toLowerCase();

  if (
    [
      "disabled",
      "inactive",
      "deleted",
      "blocked",
      "suspended",
      "banned",
      "revoked",
      "desactivado",
      "inactivo",
      "eliminado",
      "bloqueado",
      "suspendido",
    ].includes(status)
  ) {
    return false;
  }

  if (
    user.disabled === true ||
    user.isDisabled === true ||
    user.deleted === true ||
    user.isDeleted === true ||
    user.blocked === true ||
    user.isBlocked === true ||
    user.banned === true ||
    user.suspended === true ||
    user.revoked === true
  ) {
    return false;
  }

  const activeCandidate =
    user.active ??
    user.is_active ??
    user.isActive ??
    user.enabled ??
    user.isEnabled;

  if (
    activeCandidate === undefined ||
    activeCandidate === null ||
    activeCandidate === ""
  ) {
    return true;
  }

  return safeBool(
    activeCandidate,
    true
  );
}

function hasUsableUser(user = {}) {
  if (
    !isPlainObject(user) ||
    !isUserActive(user)
  ) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.sub, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.user_name, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "") ||
      safeText(user.mobile, "") ||
      safeText(user.displayName, "") ||
      safeText(user.name, "") ||
      safeText(user.nombre, "")
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
    safeText(user.sub, "") ||
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
    safeText(user.avatarURL, "") ||
    safeText(user.avatar_url, "") ||
    safeText(user.photo, "") ||
    safeText(user.photoUrl, "") ||
    safeText(user.photoURL, "") ||
    safeText(user.photo_url, "") ||
    safeText(user.image, "") ||
    safeText(user.imageUrl, "") ||
    safeText(user.imageURL, "") ||
    safeText(user.image_url, "") ||
    safeText(user.profileImage, "") ||
    safeText(user.profileImageUrl, "") ||
    safeText(user.profile_image, "") ||
    safeText(user.profile_image_url, "") ||
    safeText(user.picture, "") ||
    safeText(user.pictureUrl, "") ||
    safeText(user.pictureURL, "") ||
    safeText(user.picture_url, "") ||
    null
  );
}

function normalizeIncomingUser(user = null) {
  if (!isPlainObject(user)) {
    return null;
  }

  let normalized =
    null;

  try {
    normalized =
      normalizeUser(user);
  } catch {
    normalized =
      null;
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

  const userId =
    first(
      base.userId,
      base.user_id,
      base.uid,
      base.sub,
      base.id,
      base._id
    );

  const username =
    first(
      base.username,
      base.userName,
      base.user_name,
      base.usernameLower,
      base.username_lower,
      base.slug
    );

  const email =
    first(
      base.email,
      base.mail,
      base.emailLower,
      base.email_lower
    );

  const avatar =
    resolveAvatar(base);

  const role =
    first(
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
        sanitizeUsernameLocal(username || email || ""),
      ""
    ) || null;

  const preferences =
    safeObject(base.preferences);

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

    user_id:
      base.user_id ||
      userId ||
      null,

    uid:
      base.uid ||
      userId ||
      null,

    sub:
      base.sub ||
      userId ||
      null,

    username:
      username ||
      null,

    userName:
      base.userName ||
      username ||
      null,

    user_name:
      base.user_name ||
      username ||
      null,

    usernameLower:
      normalizedUsername,

    username_lower:
      base.username_lower ||
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

    email_lower:
      base.email_lower ||
      base.emailLower ||
      (email ? String(email).toLowerCase() : null),

    name:
      base.name ||
      base.nombre ||
      base.displayName ||
      base.fullName ||
      username ||
      email ||
      "Usuario",

    nombre:
      base.nombre ||
      base.name ||
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

    fullName:
      base.fullName ||
      base.displayName ||
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
    avatarUrl:
      avatar,
    picture:
      avatar,

    hasAvatar:
      base.hasAvatar === true ||
      base.has_avatar === true ||
      Boolean(avatar),

    theme:
      base.theme ||
      preferences.theme ||
      null,

    mode:
      base.mode ||
      preferences.mode ||
      null,

    appearance:
      base.appearance ||
      preferences.appearance ||
      null,

    lang:
      base.lang ||
      preferences.lang ||
      base.language ||
      preferences.language ||
      null,

    language:
      base.language ||
      preferences.language ||
      base.lang ||
      preferences.lang ||
      null,

    locale:
      base.locale ||
      preferences.locale ||
      base.language ||
      base.lang ||
      null,

    preferences,

    active:
      isUserActive(base),
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
  return ADMIN_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isSupportRole(value = "") {
  return SUPPORT_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isManagerRole(value = "") {
  return MANAGER_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isClientRole(value = "") {
  return CLIENT_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function expandRoleAliases(roles = []) {
  const normalized =
    normalizeRoles(roles);

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

function resolveCanonicalRole(roles = []) {
  const expanded =
    expandRoleAliases(roles);

  if (expanded.some(isAdminRole)) {
    return "admin";
  }

  if (expanded.some(isSupportRole)) {
    return "support";
  }

  if (expanded.some(isManagerRole)) {
    return "manager";
  }

  if (expanded.some(isClientRole)) {
    return "client";
  }

  return expanded[0] || "";
}

function collectRoleCandidatesFromUser(user = null) {
  const current =
    safeObject(user);

  const raw =
    safeObject(current.raw);

  const profile =
    safeObject(current.profile);

  const permissions =
    safeObject(current.permissions);

  const meta =
    safeObject(current.meta);

  const claims =
    safeObject(current.claims);

  const account =
    safeObject(current.account);

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
    ...roleArrays.flatMap((value) =>
      toArray(value)
    ),
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
  ].some((value) =>
    safeBool(value, false)
  );

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
  const source =
    safeObject(sessionInput);

  const fallbackObj =
    safeObject(fallback);

  const sessionId =
    safeText(
      first(
        ...SESSION_ID_KEYS.map((key) =>
          source[key]
        ),
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
        ...SESSION_USER_ID_KEYS.map((key) =>
          source[key]
        ),
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
        ...SESSION_EXPIRES_KEYS.map((key) =>
          source[key]
        ),
        fallbackObj.expiresAt,
        fallbackObj.refreshExpiresAt
      ),
      ""
    );

  const hasAny =
    Object.keys(source).length > 0 ||
    Boolean(
      sessionId ||
        sessionUserId ||
        expiresAt
    );

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
  const objects =
    collectPayloadObjects(payload);

  const token =
    pickTextFromObjects(
      objects,
      TOKEN_KEYS
    );

  const refreshToken =
    pickTextFromObjects(
      objects,
      REFRESH_TOKEN_KEYS
    );

  const tempToken =
    pickTextFromObjects(
      objects,
      TEMP_TOKEN_KEYS
    );

  const userRaw =
    pickObjectFromObjects(
      objects,
      USER_KEYS
    );

  const user =
    normalizeIncomingUser(userRaw);

  const role =
    pickTextFromObjects(
      objects,
      ROLE_KEYS
    );

  const sessionRaw =
    pickObjectFromObjects(
      objects,
      SESSION_KEYS
    );

  const sessionId =
    pickTextFromObjects(
      objects,
      SESSION_ID_KEYS
    );

  const sessionUserId =
    pickTextFromObjects(
      objects,
      [
        "sessionUserId",
        "session_user_id",
        "userId",
        "user_id",
        "uid",
      ]
    );

  const expiresAt =
    pickTextFromObjects(
      objects,
      SESSION_EXPIRES_KEYS
    );

  const fallbackSession = {
    sessionId,
    userId:
      sessionUserId,
    sessionUserId,
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

    flags: {
      tokenProvided:
        payloadHasAnyKey(
          objects,
          TOKEN_KEYS
        ),

      userProvided:
        payloadHasAnyKey(
          objects,
          USER_KEYS
        ),

      refreshTokenProvided:
        payloadHasAnyKey(
          objects,
          REFRESH_TOKEN_KEYS
        ),

      tempTokenProvided:
        payloadHasAnyKey(
          objects,
          TEMP_TOKEN_KEYS
        ),

      sessionProvided:
        payloadHasAnyKey(
          objects,
          SESSION_KEYS
        ) ||
        payloadHasAnyKey(
          objects,
          SESSION_ID_KEYS
        ) ||
        payloadHasAnyKey(
          objects,
          SESSION_USER_ID_KEYS
        ),
    },
  };
}

/* =========================================================
   PATH / ROUTE PRESERVATION
========================================================= */

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value =
    String(pathname || DEFAULT_ROUTE)
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value =
      DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      DEFAULT_ROUTE;
  }

  return value;
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE);

  return normalizePathnameOnly(
    raw
      .split("?")[0]
      .split("#")[0] ||
      DEFAULT_ROUTE
  );
}

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname =
      window.location.pathname || DEFAULT_ROUTE;

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeHashRouterPath(hash);
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function isPublicTechnicalRoute(path = DEFAULT_ROUTE) {
  const clean =
    stripSearchAndHash(path);

  return PUBLIC_TECHNICAL_ROUTES.some((candidate) => {
    if (clean === candidate) {
      return true;
    }

    return clean.startsWith(`${candidate}/`);
  });
}

function isProtectedPublicTokenRoute(path = DEFAULT_ROUTE) {
  const clean =
    stripSearchAndHash(path);

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

  const state =
    ensureCoreState();

  const publicPath =
    safeText(
      options.publicPath ||
        state.publicPath ||
        getBrowserPublicPath(),
      ""
    );

  const route =
    safeText(
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
  const state =
    ensureCoreState();

  const browserPath =
    getBrowserPublicPath();

  const publicPath =
    safeText(options.publicPath, "") ||
    safeText(state.publicPath, "") ||
    browserPath ||
    DEFAULT_ROUTE;

  const route =
    safeText(options.route, "") ||
    safeText(state.route, "") ||
    stripSearchAndHash(publicPath) ||
    DEFAULT_ROUTE;

  return {
    preserve:
      shouldPreserveRoute({
        ...options,
        route,
        publicPath,
      }),

    route:
      stripSearchAndHash(
        route ||
          publicPath ||
          DEFAULT_ROUTE
      ),

    publicPath:
      publicPath ||
      route ||
      DEFAULT_ROUTE,

    lastRoute:
      safeText(
        state.lastRoute,
        ""
      ),

    browserPath,

    activationBoot:
      Boolean(options.activationBoot),

    resetConfirmBoot:
      Boolean(options.resetConfirmBoot),
  };
}

function restoreRouteContext(context = {}) {
  if (!context?.preserve) {
    return false;
  }

  const route =
    stripSearchAndHash(
      context.route ||
        context.publicPath ||
        DEFAULT_ROUTE
    );

  const publicPath =
    safeText(
      context.publicPath,
      route
    );

  try {
    AppCore?.setRoute?.(route);
  } catch {}

  try {
    AppCore?.setPublicPath?.(publicPath);
  } catch {}

  safeSetState({
    route,
    publicPath,

    lastRoute:
      context.lastRoute ||
      route,

    bootIsActivation:
      Boolean(
        context.activationBoot ||
          ensureCoreState().bootIsActivation
      ),

    bootHasActivationToken:
      Boolean(
        context.activationBoot ||
          ensureCoreState().bootHasActivationToken
      ),

    bootIsResetConfirm:
      Boolean(
        context.resetConfirmBoot ||
          ensureCoreState().bootIsResetConfirm
      ),

    bootHasResetToken:
      Boolean(
        context.resetConfirmBoot ||
          ensureCoreState().bootHasResetToken
      ),
  }, {
    source:
      `${SESSION_SOURCE}:restore-route`,
    emit:
      false,
    silent:
      true,
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
  const tokenKey =
    getCoreStorageKey("token");

  const accessTokenKey =
    getCoreStorageKey("accessToken");

  const candidates = [
    tokenKey,
    accessTokenKey,
    "token",
    "accessToken",
    "access_token",
  ];

  for (const key of unique(candidates)) {
    try {
      const value =
        AppCore?.storage?.getRaw?.(
          key,
          ""
        ) ||
        AppCore?.storage?.get?.(
          key,
          ""
        );

      if (hasUsableToken(value)) {
        return stripBearer(value);
      }
    } catch {}
  }

  return "";
}

function writeCoreTokenStorage(token = null) {
  const cleanToken =
    hasUsableToken(token)
      ? stripBearer(token)
      : null;

  const tokenKeys = unique([
    getCoreStorageKey("token"),
    getCoreStorageKey("accessToken"),
    "token",
    "accessToken",
    "access_token",
  ]);

  for (const key of tokenKeys) {
    try {
      if (cleanToken) {
        if (isFunction(AppCore?.storage?.setRaw)) {
          AppCore.storage.setRaw(
            key,
            cleanToken
          );
        } else {
          AppCore?.storage?.set?.(
            key,
            cleanToken
          );
        }
      } else {
        AppCore?.storage?.remove?.(key);
      }
    } catch {}
  }

  return cleanToken;
}

function writeCoreUserStorage(user = null) {
  const finalUser =
    hasUsableUser(user)
      ? user
      : null;

  const userKey =
    getCoreStorageKey("user");

  try {
    if (finalUser) {
      AppCore?.storage?.set?.(
        userKey,
        finalUser
      );
    } else {
      AppCore?.storage?.remove?.(userKey);
    }
  } catch {}

  return finalUser;
}

function writeCoreSessionStorage(session = null) {
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
      AppCore?.storage?.remove?.(
        getCoreStorageKey(name)
      );
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
        getCoreStorageKey("sessionData"),
        finalSession
      );
    } catch {}

    try {
      AppCore?.storage?.set?.(
        getCoreStorageKey("sessionId"),
        finalSession.sessionId ||
          finalSession.id ||
          ""
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

  for (const key of LEGACY_AUTH_STORAGE_KEYS) {
    try {
      window.localStorage?.removeItem?.(key);
    } catch {}

    try {
      window.sessionStorage?.removeItem?.(key);
    } catch {}
  }

  return true;
}

function clearCoreAuthStorage() {
  const keys = [
    "token",
    "accessToken",
    "access_token",
    "user",
    "currentUser",
    "authUser",
    "sessionUser",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "session",
    "sessionData",
    "sessionId",
    "sessionUserId",
    "authContext",
    "role",
    "rol",
    "userRole",
    "roles",
  ];

  for (const name of keys) {
    try {
      AppCore?.storage?.remove?.(
        getCoreStorageKey(name)
      );
    } catch {}

    try {
      AppCore?.storage?.remove?.(name);
    } catch {}
  }

  return true;
}

/* =========================================================
   STATE RESOLUTION
========================================================= */

function getBestStateToken(state = ensureCoreState()) {
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
    readCoreStoredToken()
  );
}

function getBestStateUser(state = ensureCoreState()) {
  const user =
    (
      hasUsableUser(state.user) &&
      state.user
    ) ||
    (
      hasUsableUser(state.currentUser) &&
      state.currentUser
    ) ||
    (
      hasUsableUser(state.authUser) &&
      state.authUser
    ) ||
    (
      hasUsableUser(state.sessionUser) &&
      state.sessionUser
    ) ||
    (
      hasUsableUser(state.session?.user) &&
      state.session.user
    ) ||
    (
      hasUsableUser(state.sessionData?.user) &&
      state.sessionData.user
    ) ||
    null;

  return user
    ? normalizeIncomingUser(user)
    : null;
}

function getBestStateSession(state = ensureCoreState()) {
  return normalizeSessionContext(
    state.session ||
      state.sessionData ||
      null,
    getBestStateUser(state),
    {
      sessionId:
        state.sessionId,

      sessionUserId:
        state.sessionUserId,
    }
  );
}

function buildDerivedAuthState(state = ensureCoreState()) {
  const token =
    getBestStateToken(state);

  const user =
    getBestStateUser(state);

  const session =
    getBestStateSession(state);

  const authenticated =
    hasUsableToken(token) &&
    hasUsableUser(user);

  const explicitRole =
    state.role ||
    state.rol ||
    state.userRole ||
    state.session?.role ||
    state.sessionData?.role ||
    "";

  const roles =
    authenticated
      ? resolveRolesFromUser(
          user,
          explicitRole
        )
      : [];

  const role =
    authenticated
      ? resolveCanonicalRole(roles)
      : "";

  return {
    authenticated,
    token:
      hasUsableToken(token)
        ? stripBearer(token)
        : "",
    user,
    session,
    role,
    roles,

    isAdmin:
      roles.some(isAdminRole),

    isSupport:
      roles.some(isSupportRole),

    isManager:
      roles.some(isManagerRole),

    isClient:
      roles.some(isClientRole),
  };
}

function syncDerivedState() {
  const state =
    ensureCoreState();

  const derived =
    buildDerivedAuthState(state);

  state.authenticated =
    derived.authenticated;

  state.hasToken =
    hasUsableToken(derived.token);

  state.role =
    derived.authenticated
      ? derived.role
      : "";

  state.rol =
    derived.authenticated
      ? derived.role
      : "";

  state.userRole =
    derived.authenticated
      ? derived.role
      : "";

  state.roles =
    derived.authenticated
      ? derived.roles
      : [];

  state.isAdmin =
    derived.authenticated &&
    derived.isAdmin;

  state.isSupport =
    derived.authenticated &&
    derived.isSupport;

  state.isManager =
    derived.authenticated &&
    derived.isManager;

  state.isClient =
    derived.authenticated &&
    derived.isClient;

  if (derived.authenticated && derived.user) {
    state.user =
      derived.user;

    state.currentUser =
      derived.user;

    state.authUser =
      derived.user;

    state.sessionUser =
      derived.user;

    state.currentResolvedUsername =
      derived.user.slug ||
      derived.user.usernameLower ||
      derived.user.username ||
      null;

    state.resolvedUsername =
      state.currentResolvedUsername;
  }

  if (derived.session) {
    state.session =
      derived.session;

    state.sessionData =
      derived.session;

    state.sessionId =
      derived.session.sessionId ||
      derived.session.id ||
      null;

    state.sessionUserId =
      derived.session.sessionUserId ||
      derived.session.userId ||
      derived.session.user_id ||
      null;
  }

  if (!derived.authenticated) {
    state.user =
      null;

    state.currentUser =
      null;

    state.authUser =
      null;

    state.sessionUser =
      null;

    state.currentResolvedUsername =
      null;

    state.resolvedUsername =
      null;
  }

  return state;
}

function clearAuthStatePatch() {
  return {
    token:
      null,

    accessToken:
      null,

    access_token:
      null,

    user:
      null,

    currentUser:
      null,

    authUser:
      null,

    sessionUser:
      null,

    account:
      null,

    profile:
      null,

    role:
      "",

    rol:
      "",

    userRole:
      "",

    roles:
      [],

    authenticated:
      false,

    hasToken:
      false,

    isAdmin:
      false,

    isSupport:
      false,

    isManager:
      false,

    isClient:
      false,

    session:
      null,

    sessionData:
      null,

    sessionId:
      null,

    sessionUserId:
      null,

    currentResolvedUsername:
      null,

    resolvedUsername:
      null,

    username:
      null,

    avatar:
      null,

    avatarUrl:
      null,

    twoFactorPending:
      false,

    tempToken:
      null,

    temp_token:
      null,
  };
}

function safeSyncUserUI() {
  try {
    AppCore?.syncUserUI?.({
      source:
        SESSION_SOURCE,
      reason:
        "auth-session-sync",
    });
  } catch {
    try {
      AppCore?.syncUserUI?.();
    } catch {}
  }
}

/* =========================================================
   THEME / LANG FROM USER
========================================================= */

function resolveThemeFromUser(user = null) {
  if (
    !user ||
    typeof user !== "object"
  ) {
    return null;
  }

  const explicitTheme =
    String(
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

  if (
    explicitTheme === "light" ||
    explicitTheme === "dark"
  ) {
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
    const darkValue =
      candidates.find((item) =>
        typeof item === "boolean"
      );

    if (typeof darkValue === "boolean") {
      return darkValue
        ? "dark"
        : "light";
    }
  }

  return null;
}

function resolveLangFromUser(user = null) {
  if (
    !user ||
    typeof user !== "object"
  ) {
    return null;
  }

  const lang =
    safeText(
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
  const theme =
    resolveThemeFromUser(user);

  if (
    theme !== "light" &&
    theme !== "dark"
  ) {
    return null;
  }

  try {
    AppCore?.setTheme?.(theme);
  } catch {}

  try {
    safeSetState(
      {
        theme,
        mode:
          theme,
        appearance:
          theme,
      },
      {
        source:
          `${SESSION_SOURCE}:theme`,
        emit:
          false,
        silent:
          true,
      }
    );
  } catch {}

  return theme;
}

function applyLangFromUser(user = null) {
  const lang =
    resolveLangFromUser(user);

  if (!lang) {
    return null;
  }

  try {
    AppCore?.setLang?.(lang);
  } catch {}

  try {
    safeSetState(
      {
        lang,
        language:
          lang,
        locale:
          lang,
      },
      {
        source:
          `${SESSION_SOURCE}:lang`,
        emit:
          false,
        silent:
          true,
      }
    );
  } catch {}

  return lang;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getCurrentStateSnapshotBase() {
  const state =
    ensureCoreState();

  syncDerivedState();

  const token =
    getBestStateToken(state);

  const user =
    getBestStateUser(state);

  const session =
    getBestStateSession(state);

  const authenticated =
    Boolean(
      hasUsableToken(token) &&
      hasUsableUser(user) &&
      state.authenticated === true
    );

  return {
    authenticated,

    token:
      hasUsableToken(token)
        ? stripBearer(token)
        : null,

    accessToken:
      hasUsableToken(token)
        ? state.accessToken ||
          state.access_token ||
          stripBearer(token)
        : null,

    user:
      hasUsableUser(user)
        ? user
        : null,

    role:
      authenticated
        ? state.role || null
        : null,

    roles:
      authenticated
        ? normalizeRoles(state.roles)
        : [],

    isAdmin:
      authenticated &&
      Boolean(state.isAdmin),

    isSupport:
      authenticated &&
      Boolean(state.isSupport),

    isManager:
      authenticated &&
      Boolean(state.isManager),

    isClient:
      authenticated &&
      Boolean(state.isClient),

    session:
      session || null,

    sessionData:
      session || null,

    sessionId:
      session?.sessionId ||
      state.sessionId ||
      null,

    sessionUserId:
      session?.sessionUserId ||
      session?.userId ||
      state.sessionUserId ||
      null,

    route:
      state.route ||
      DEFAULT_ROUTE,

    publicPath:
      state.publicPath ||
      DEFAULT_ROUTE,
  };
}

export function buildSessionSnapshot(extra = {}) {
  const base =
    getCurrentStateSnapshotBase();

  return {
    version:
      AUTH_SESSION_VERSION,

    ...base,

    refreshToken:
      getStoredRefreshToken() ||
      null,

    storedSessionId:
      getStoredSessionId() ||
      null,

    storedSessionUserId:
      getStoredSessionUserId() ||
      null,

    ...extra,
  };
}

function buildPublicSnapshot(snapshot = {}) {
  return {
    version:
      AUTH_SESSION_VERSION,

    authenticated:
      Boolean(snapshot.authenticated),

    hasToken:
      hasUsableToken(snapshot.token),

    token:
      null,

    accessToken:
      null,

    refreshToken:
      null,

    user:
      sanitizePublicUser(snapshot.user),

    role:
      snapshot.role || null,

    roles:
      normalizeRoles(snapshot.roles),

    isAdmin:
      Boolean(snapshot.isAdmin),

    isSupport:
      Boolean(snapshot.isSupport),

    isManager:
      Boolean(snapshot.isManager),

    isClient:
      Boolean(snapshot.isClient),

    sessionId:
      snapshot.sessionId ||
      snapshot.session?.sessionId ||
      null,

    sessionUserId:
      snapshot.sessionUserId ||
      snapshot.session?.sessionUserId ||
      snapshot.session?.userId ||
      null,

    route:
      safeRedact(snapshot.route || DEFAULT_ROUTE),

    publicPath:
      safeRedact(snapshot.publicPath || DEFAULT_ROUTE),

    source:
      snapshot.source || "",

    eventMode:
      snapshot.eventMode || "",
  };
}

function buildSessionFingerprint(snapshot = {}) {
  const user =
    snapshot?.user || {};

  const session =
    snapshot?.session ||
    snapshot?.sessionData ||
    {};

  return JSON.stringify({
    authenticated:
      Boolean(snapshot.authenticated),

    hasToken:
      hasUsableToken(snapshot.token),

    tokenLength:
      safeText(snapshot.token).length,

    role:
      safeText(snapshot.role),

    roles:
      normalizeRoles(snapshot.roles).join("|"),

    isAdmin:
      Boolean(snapshot.isAdmin),

    isSupport:
      Boolean(snapshot.isSupport),

    isManager:
      Boolean(snapshot.isManager),

    isClient:
      Boolean(snapshot.isClient),

    hasRefreshToken:
      Boolean(snapshot.refreshToken),

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
      user.sub ||
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
  options = {},
} = {}) {
  const publicBefore =
    before
      ? buildPublicSnapshot(before)
      : null;

  const publicAfter =
    after
      ? buildPublicSnapshot(after)
      : null;

  safeEmit(
    SESSION_EVENTS.state,
    {
      reason,
      before:
        publicBefore,
      after:
        publicAfter,

      changed:
        buildSessionFingerprint(before) !==
        buildSessionFingerprint(after),

      durationMs,
      timestamp:
        nowMs(),
      at:
        safeIsoDate(),
    },
    options
  );
}

function emitSessionAppliedEvents(after = {}, before = null, options = {}) {
  const mode =
    inferEventMode(options);

  const publicAfter = {
    ...buildPublicSnapshot(after),
    eventMode:
      mode,
  };

  const changed =
    !before ||
    buildSessionFingerprint(before) !==
      buildSessionFingerprint(after);

  safeEmit(
    SESSION_EVENTS.applied,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.appSessionChange,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.appAuthChange,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.authChange,
    publicAfter,
    options
  );

  if (mode === "restore") {
    safeEmit(
      SESSION_EVENTS.restored,
      publicAfter,
      options
    );

    safeEmit(
      SESSION_EVENTS.appSessionRestored,
      publicAfter,
      options
    );
  }

  if (changed) {
    safeEmit(
      SESSION_EVENTS.userChange,
      publicAfter,
      options
    );

    safeEmit(
      SESSION_EVENTS.userUpdated,
      publicAfter,
      options
    );
  }
}

function emitSessionPartialEvents(after = {}, before = null, options = {}) {
  const mode =
    inferEventMode(options);

  const publicAfter = {
    ...buildPublicSnapshot(after),
    eventMode:
      mode,
  };

  const changed =
    !before ||
    buildSessionFingerprint(before) !==
      buildSessionFingerprint(after);

  safeEmit(
    SESSION_EVENTS.partial,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.appSessionChange,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.appAuthChange,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.authChange,
    publicAfter,
    options
  );

  if (changed) {
    safeEmit(
      SESSION_EVENTS.userChange,
      publicAfter,
      options
    );
  }
}

function emitSessionClearedEvents(after = {}, options = {}) {
  const mode =
    inferEventMode({
      ...options,
      eventMode:
        options.eventMode || "clear",
    });

  const publicAfter = {
    ...buildPublicSnapshot(after),
    eventMode:
      mode,
  };

  safeEmit(
    SESSION_EVENTS.cleared,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.appSessionCleared,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.appSessionChange,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.appAuthChange,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.authChange,
    publicAfter,
    options
  );

  safeEmit(
    SESSION_EVENTS.userChange,
    publicAfter,
    options
  );
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

function safePersistAccessToken(value) {
  try {
    persistAccessToken(value || null);
  } catch {}
}

function safePersistSessionContext(sessionData, user) {
  try {
    persistSessionContext(
      sessionData || null,
      user || null
    );
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
  const startedAt =
    nowMs();

  const source =
    safeText(
      payload?.source,
      SESSION_SOURCE
    ) ||
    SESSION_SOURCE;

  const mode =
    inferEventMode({
      source,
      eventMode:
        payload?.eventMode,
      emitRestoreEvents:
        payload?.emitRestoreEvents,
    });

  const silent =
    safeBool(
      payload?.silent,
      false
    ) ||
    mode === "silent";

  const eventOptions = {
    silent,
    emit:
      payload?.emit,
    emitEvents:
      payload?.emitEvents,
  };

  const before =
    buildSessionSnapshot({
      source,
      eventMode:
        mode,
    });

  const state =
    ensureCoreState();

  const extracted =
    extractSessionInput(payload);

  const tokenProvided =
    Boolean(extracted.flags.tokenProvided);

  const userProvided =
    Boolean(extracted.flags.userProvided);

  const refreshTokenProvided =
    Boolean(extracted.flags.refreshTokenProvided);

  const tempTokenProvided =
    Boolean(extracted.flags.tempTokenProvided);

  const sessionProvided =
    Boolean(extracted.flags.sessionProvided);

  const preserveExistingUser =
    payload?.preserveExistingUser === true;

  const effectiveToken =
    firstText(
      tokenProvided
        ? extracted.token
        : undefined,
      state.token,
      state.accessToken,
      state.access_token,
      state.session?.token,
      state.session?.accessToken,
      state.session?.access_token,
      readCoreStoredToken()
    );

  let effectiveUser =
    null;

  if (userProvided) {
    effectiveUser =
      extracted.user || null;
  } else if (
    tokenProvided &&
    preserveExistingUser !== true
  ) {
    effectiveUser =
      null;
  } else {
    effectiveUser =
      getBestStateUser(state);
  }

  const effectiveSession =
    normalizeSessionContext(
      sessionProvided
        ? extracted.session
        : payload?.sessionData ||
          payload?.session ||
          state.session ||
          state.sessionData ||
          null,
      effectiveUser,
      {
        sessionId:
          extracted.sessionId ||
          payload?.sessionId ||
          payload?.session_id ||
          state.sessionId,

        sessionUserId:
          extracted.sessionUserId ||
          payload?.sessionUserId ||
          payload?.session_user_id ||
          state.sessionUserId,
      }
    );

  const usableToken =
    hasUsableToken(effectiveToken);

  const usableUser =
    hasUsableUser(effectiveUser);

  const nextAuthenticated =
    payload?.authenticated === false
      ? false
      : usableToken && usableUser;

  const explicitRole =
    firstText(
      payload?.role,
      payload?.rol,
      extracted.role
    );

  const nextRoles =
    nextAuthenticated
      ? resolveRolesFromUser(
          effectiveUser,
          explicitRole
        )
      : [];

  const nextRole =
    nextAuthenticated
      ? resolveCanonicalRole(nextRoles)
      : "";

  if (tokenProvided) {
    writeCoreTokenStorage(
      usableToken
        ? effectiveToken
        : null
    );

    safePersistAccessToken(
      usableToken
        ? effectiveToken
        : null
    );
  }

  if (userProvided) {
    writeCoreUserStorage(
      usableUser
        ? effectiveUser
        : null
    );
  }

  if (
    tokenProvided &&
    !userProvided &&
    preserveExistingUser !== true
  ) {
    writeCoreUserStorage(null);
  }

  if (refreshTokenProvided) {
    safePersistRefreshToken(
      extracted.refreshToken || null
    );
  }

  if (tempTokenProvided) {
    safePersistTempToken(
      extracted.tempToken || null
    );
  } else if (nextAuthenticated) {
    safePersistTempToken(null);
  }

  const sessionId =
    firstText(
      effectiveSession?.sessionId,
      effectiveSession?.id,
      payload?.sessionId,
      payload?.session_id,
      getStoredSessionId(),
      state.sessionId,
      state.session?.sessionId
    );

  const sessionUserId =
    firstText(
      effectiveSession?.sessionUserId,
      effectiveSession?.userId,
      effectiveSession?.user_id,
      payload?.sessionUserId,
      payload?.session_user_id,
      getUserIdentity(effectiveUser),
      getStoredSessionUserId(),
      state.sessionUserId,
      state.session?.sessionUserId,
      state.session?.userId
    );

  const canonicalSession =
    effectiveSession
      ? {
          ...effectiveSession,

          sessionId:
            sessionId ||
            effectiveSession.sessionId ||
            null,

          session_id:
            sessionId ||
            effectiveSession.session_id ||
            null,

          sessionUserId:
            sessionUserId ||
            effectiveSession.sessionUserId ||
            null,

          session_user_id:
            sessionUserId ||
            effectiveSession.session_user_id ||
            null,

          userId:
            effectiveSession.userId ||
            sessionUserId ||
            null,

          user_id:
            effectiveSession.user_id ||
            sessionUserId ||
            null,
        }
      : null;

  if (canonicalSession) {
    safePersistSessionContext(
      canonicalSession,
      effectiveUser
    );

    writeCoreSessionStorage(
      canonicalSession
    );
  }

  if (nextAuthenticated) {
    safePersistAuxSessionData(
      effectiveUser
    );

    applyThemeFromUser(
      effectiveUser
    );

    applyLangFromUser(
      effectiveUser
    );
  }

  const hasTempToken =
    tempTokenProvided &&
    hasUsableToken(extracted.tempToken);

  const resolvedUsername =
    nextAuthenticated
      ? effectiveUser?.slug ||
        effectiveUser?.usernameLower ||
        effectiveUser?.username ||
        null
      : null;

  const sessionAlias =
    nextAuthenticated
      ? {
          ...(canonicalSession || {}),

          token:
            stripBearer(effectiveToken),

          accessToken:
            stripBearer(effectiveToken),

          access_token:
            stripBearer(effectiveToken),

          refreshToken:
            extracted.refreshToken ||
            getStoredRefreshToken() ||
            "",

          refresh_token:
            extracted.refreshToken ||
            getStoredRefreshToken() ||
            "",

          user:
            effectiveUser,

          usuario:
            effectiveUser,

          role:
            nextRole,

          rol:
            nextRole,

          roles:
            nextRoles,

          authenticated:
            true,

          source,
        }
      : canonicalSession;

  const nextPatch = {
    token:
      usableToken
        ? stripBearer(effectiveToken)
        : null,

    accessToken:
      usableToken
        ? stripBearer(effectiveToken)
        : null,

    access_token:
      usableToken
        ? stripBearer(effectiveToken)
        : null,

    user:
      usableUser
        ? effectiveUser
        : null,

    currentUser:
      usableUser
        ? effectiveUser
        : null,

    authUser:
      usableUser
        ? effectiveUser
        : null,

    sessionUser:
      usableUser
        ? effectiveUser
        : null,

    account:
      usableUser
        ? effectiveUser
        : null,

    profile:
      usableUser
        ? effectiveUser
        : null,

    role:
      nextRole,

    rol:
      nextRole,

    userRole:
      nextRole,

    roles:
      nextRoles,

    authenticated:
      nextAuthenticated,

    hasToken:
      usableToken,

    isAdmin:
      nextAuthenticated &&
      nextRoles.some(isAdminRole),

    isSupport:
      nextAuthenticated &&
      nextRoles.some(isSupportRole),

    isManager:
      nextAuthenticated &&
      nextRoles.some(isManagerRole),

    isClient:
      nextAuthenticated &&
      nextRoles.some(isClientRole),

    sessionId:
      nextAuthenticated
        ? sessionId || null
        : null,

    sessionUserId:
      nextAuthenticated
        ? sessionUserId || null
        : null,

    /*
      Alias controlados:
      session y sessionData apuntan exactamente al mismo objeto.
    */
    session:
      sessionAlias,

    sessionData:
      sessionAlias,

    twoFactorPending:
      !nextAuthenticated &&
      hasTempToken,

    tempToken:
      hasTempToken
        ? safeText(extracted.tempToken, "")
        : null,

    temp_token:
      hasTempToken
        ? safeText(extracted.tempToken, "")
        : null,

    username:
      resolvedUsername,

    currentResolvedUsername:
      resolvedUsername,

    resolvedUsername:
      resolvedUsername,

    lastAuthSource:
      source,

    lastAuthSyncAt:
      safeIsoDate(),
  };

  safeSetState(
    nextPatch,
    {
      source:
        `${SESSION_SOURCE}:apply`,
      forceUnauthenticated:
        !nextAuthenticated,

      allowExplicitAuthenticated:
        nextAuthenticated,

      emit:
        false,
      emitState:
        false,
      emitDerived:
        false,
      silent:
        true,
    }
  );

  syncDerivedState();
  safeSyncUserUI();

  const after =
    buildSessionSnapshot({
      source,
      eventMode:
        mode,
    });

  if (
    !silent &&
    mode !== "silent"
  ) {
    emitSessionState({
      reason:
        nextAuthenticated
          ? "apply"
          : "apply:partial",
      before,
      after,
      durationMs:
        nowMs() - startedAt,
      options:
        eventOptions,
    });

    if (after.authenticated) {
      emitSessionAppliedEvents(
        after,
        before,
        {
          source,
          eventMode:
            mode,
          emitRestoreEvents:
            payload?.emitRestoreEvents,
          ...eventOptions,
        }
      );
    } else {
      emitSessionPartialEvents(
        after,
        before,
        {
          source,
          eventMode:
            mode,
          ...eventOptions,
        }
      );
    }
  }

  return after;
}

/* =========================================================
   CLEAR SESSION LOCAL
========================================================= */

export function clearSessionLocal(options = {}) {
  const opts =
    safeObject(options);

  const silent =
    safeBool(
      opts.silent,
      false
    );

  const eventOptions = {
    silent,
    emit:
      opts.emit,
    emitEvents:
      opts.emitEvents,
  };

  const startedAt =
    nowMs();

  const routeContext =
    captureRouteContext(opts);

  const before =
    buildSessionSnapshot({
      routeContext,
      source:
        opts.source || SESSION_SOURCE,
      eventMode:
        "clear",
    });

  const hadData =
    Boolean(
      before.token ||
        before.user ||
        before.refreshToken ||
        before.sessionId ||
        before.sessionUserId ||
        ensureCoreState().authenticated
    );

  try {
    if (
      opts.callCoreClear === true &&
      isFunction(AppCore?.clearSession)
    ) {
      AppCore.clearSession({
        silent:
          true,
        source:
          `${SESSION_SOURCE}:core-clear`,
      });
    }
  } catch (error) {
    safeWarn(
      "AppCore.clearSession() falló.",
      error
    );
  }

  try {
    clearAuthStorage({
      silent:
        true,
      includeLegacy:
        true,
    });
  } catch (error) {
    safeWarn(
      "clearAuthStorage() falló.",
      error
    );
  }

  clearCoreAuthStorage();
  clearLegacyAuthStorage();

  safePersistRefreshToken(null);
  safePersistTempToken(null);
  safePersistAccessToken(null);
  safePersistSessionContext(null, null);

  writeCoreTokenStorage(null);
  writeCoreUserStorage(null);
  writeCoreSessionStorage(null);

  safeSetState(
    clearAuthStatePatch(),
    {
      source:
        `${SESSION_SOURCE}:clear`,
      forceUnauthenticated:
        true,
      emit:
        false,
      emitState:
        false,
      emitDerived:
        false,
      silent:
        true,
    }
  );

  restoreRouteContext(routeContext);

  syncDerivedState();
  safeSyncUserUI();

  const after =
    buildSessionSnapshot({
      routeContext,
      source:
        opts.source || SESSION_SOURCE,
      eventMode:
        "clear",
    });

  if (!silent) {
    if (
      hadData ||
      opts.emitWhenEmpty === true
    ) {
      emitSessionClearedEvents(
        after,
        {
          source:
            opts.source || SESSION_SOURCE,
          eventMode:
            "clear",
          ...eventOptions,
        }
      );
    }

    emitSessionState({
      reason:
        "clear",
      before,
      after,
      durationMs:
        nowMs() - startedAt,
      options:
        eventOptions,
    });
  }

  return true;
}

/* =========================================================
   HELPERS AUTH
========================================================= */

export function isAuthenticated() {
  const state =
    ensureCoreState();

  syncDerivedState();

  return Boolean(
    state.authenticated &&
      hasUsableToken(getBestStateToken(state)) &&
      hasUsableUser(getBestStateUser(state))
  );
}

export function getCurrentRole() {
  syncDerivedState();

  return safeText(
    ensureCoreState().role,
    ""
  ).toLowerCase();
}

export function getCurrentRoles() {
  syncDerivedState();

  return normalizeRoles(
    ensureCoreState().roles
  );
}

export function isCurrentUserAdmin() {
  syncDerivedState();

  return Boolean(
    ensureCoreState().isAdmin
  );
}

export function isCurrentUserSupport() {
  syncDerivedState();

  return Boolean(
    ensureCoreState().isSupport
  );
}

export function isCurrentUserManager() {
  syncDerivedState();

  return Boolean(
    ensureCoreState().isManager
  );
}

export function isCurrentUserClient() {
  syncDerivedState();

  return Boolean(
    ensureCoreState().isClient
  );
}

export function hasRole(...roles) {
  if (!roles.length) {
    return true;
  }

  const allowedRoles =
    expandRoleAliases(
      roles.flat(Infinity)
    );

  if (!allowedRoles.length) {
    return true;
  }

  const currentRoles =
    new Set(
      expandRoleAliases(
        getCurrentRoles()
      )
    );

  return allowedRoles.some((roleName) =>
    currentRoles.has(roleName)
  );
}

export function requireRole(...roles) {
  return (
    isAuthenticated() &&
    hasRole(...roles)
  );
}

/* =========================================================
   AUTH HEADER
   Nota:
   - Devuelve Authorization si hay token usable.
   - No exige user/authenticated para permitir /me durante restore.
========================================================= */

export function getAuthHeader() {
  const state =
    ensureCoreState();

  const token =
    firstText(
      state.token,
      state.accessToken,
      state.access_token,
      state.session?.token,
      state.session?.accessToken,
      state.session?.access_token,
      state.sessionData?.token,
      state.sessionData?.accessToken,
      readCoreStoredToken()
    );

  if (!hasUsableToken(token)) {
    return {};
  }

  const headerName =
    safeText(
      AppCore?.config?.auth?.tokenHeader,
      "Authorization"
    );

  const prefix =
    safeText(
      AppCore?.config?.auth?.bearerPrefix,
      "Bearer"
    );

  return {
    [headerName]:
      `${prefix} ${stripBearer(token)}`,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionDebugSnapshot() {
  const snapshot =
    buildSessionSnapshot();

  return {
    version:
      AUTH_SESSION_VERSION,

    authenticated:
      Boolean(snapshot.authenticated),

    role:
      snapshot.role || null,

    roles:
      normalizeRoles(snapshot.roles),

    isAdmin:
      Boolean(snapshot.isAdmin),

    isSupport:
      Boolean(snapshot.isSupport),

    isManager:
      Boolean(snapshot.isManager),

    isClient:
      Boolean(snapshot.isClient),

    username:
      snapshot.user?.username ||
      snapshot.user?.userName ||
      snapshot.user?.user_name ||
      snapshot.user?.email ||
      snapshot.user?.name ||
      snapshot.user?.nombre ||
      snapshot.user?.phone ||
      null,

    userIdentity:
      getUserIdentity(snapshot.user),

    hasToken:
      Boolean(snapshot.token),

    token:
      null,

    accessToken:
      null,

    hasUser:
      hasUsableUser(snapshot.user),

    hasRefreshToken:
      Boolean(snapshot.refreshToken),

    refreshToken:
      null,

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

    hasSessionContext:
      Boolean(
        snapshot.sessionId ||
          snapshot.session?.sessionId ||
          snapshot.storedSessionId
      ),

    route:
      safeRedact(snapshot.route || DEFAULT_ROUTE),

    publicPath:
      safeRedact(snapshot.publicPath || DEFAULT_ROUTE),

    isPublicTechnicalRoute:
      isPublicTechnicalRoute(
        snapshot.route ||
          snapshot.publicPath ||
          DEFAULT_ROUTE
      ),

    isProtectedPublicTokenRoute:
      isProtectedPublicTokenRoute(
        snapshot.route ||
          snapshot.publicPath ||
          DEFAULT_ROUTE
      ),

    rawUserRoleCandidates:
      collectRoleCandidatesFromUser(snapshot.user),

    at:
      safeIsoDate(),
  };
}

export function buildAuthErrorPayload(error) {
  return {
    error:
      error
        ? {
            name:
              safeText(error.name, "Error"),

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

    message:
      extractMessage(error),
  };
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
