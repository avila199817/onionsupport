/* =========================================================
   Onion SPA - Auth Login
   Archivo: src/features/auth/login.js

   EXTREME PRO SYSTEM · AUTH LOGIN · 17/10
   BACKEND ALIGNED · NO CSS · NO INLINE STYLE · NO AUTH FANTASMA
   NO EVENT DUPLICATION · NO FREEZE · 2FA SAFE

   RESPONSABILIDADES:
   - Preparar credenciales login.
   - Construir payload robusto para backend heterogéneo.
   - Ejecutar login contra API pública.
   - Usar request pública dura:
       · public:true
       · auth:false
       · skipAuth:true
       · noAuthHeader:true
       · _skipAuthRefresh:true
       · skipAuthRefresh:true
       · noAutoRefresh:true
       · autoRefresh:false
       · noAutoLogout:true
       · autoLogout:false
       · retry:false
       · retries:0
   - Soportar backend Onion Auth:
       · ok / success / authenticated
       · token / accessToken / access_token
       · refreshToken / refresh_token
       · session / sessionData
       · sessionId / session_id
       · userId / user_id
       · user / usuario / me / account / profile
       · cliente / client
       · routing
       · data / payload / result / body / response / auth
   - Soportar 2FA/MFA/OTP sin marcar authenticated.
   - Aplicar sesión sólo con token + user válidos.
   - Preservar sessionId/userId/expiresAt/tokenVersion para refresh.
   - Respetar skipNavigation / noRedirect cuando LoginView controla navegación.
   - Navegación SPA consistente si Auth.login se usa directamente.
   - Sin history.replaceState como fallback falso positivo.
   - Fallback duro a location.assign si no hay Router real.
   - Submit desde formularios HTML.
   - Mutex real contra login concurrente.
   - Limpiar sesión previa antes de login.
   - Evitar usuario/token antiguos como fallback.
   - No emitir eventos restore desde login.
   - No duplicar auth:login:success por defecto.
   - Limpiar auth-screen sólo cuando Auth.login controla navegación.
   - Reparar sidebar/topbar vía eventos de UI, sin CSS ni estilos inline.
   - Blindar logs/eventos contra tokens, passwords y URLs sensibles.
   - Fallback fetch si AppCore apiClient/Http no está disponible.
   - Backend fallback fijo a https://api.onionit.net.

   CONTRATO DE EVENTOS:
   - login.js puede emitir:
       · auth:login:start
       · auth:login:error
       · auth:login:2fa-required
       · auth:login:session-committed
       · auth:session:applied
       · app:user:change
       · app:auth:ready
   - auth:login:success queda opt-in:
       · por defecto NO se emite aquí
       · la fachada src/features/auth/index.js lo emite una sola vez
   - no se emiten eventos restore desde login
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  isBrowser,
  sanitizeUsername,
  normalizePath as normalizeAppPath,
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
  getPublicAuthRequestOptions,
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
   VERSION / RUNTIME
========================================================= */

export const LOGIN_VERSION =
  "17.0.0-extreme-pro-no-freeze";

let loginPromise =
  null;

let loginSequence =
  0;

let loginFingerprint =
  "";

/* =========================================================
   CONSTANTS
========================================================= */

const LOGIN_SOURCE =
  "auth.login";

const BACKEND_ORIGIN =
  "https://api.onionit.net";

const DEFAULT_HOME_PATH =
  "/";

const DEFAULT_LOGIN_PATH =
  "/login";

const DEFAULT_2FA_PATH =
  "/2fa";

const DEFAULT_LOGIN_TIMEOUT_MS =
  30_000;

const DEFAULT_CREDENTIALS_MODE =
  "include";

const ROUTE_DEFAULT_REDIRECTS =
  new Set([
    "/usuarios",
    "/clientes",
    "/facturas",
    "/incidencias",
    "/servidor",
    "/users",
    "/clients",
    "/tickets",
    "/invoices",
  ]);

const AUTH_FAILURE_CODES =
  new Set([
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
    "ME_INVALID_SESSION",
    "REFRESH_INVALID_SESSION",
    "TOKEN_VERSION_MISMATCH",
    "AUTH_RUNTIME_MISCONFIGURED",
  ]);

const AUTH_FAILURE_STATUSES =
  new Set([
    "error",
    "failed",
    "failure",
    "invalid",
    "unauthorized",
    "forbidden",
    "expired",
    "auth_error",
    "auth_failed",
    "login_failed",
    "not_authenticated",
    "session_expired",
    "token_expired",
    "invalid_token",
    "disabled",
    "blocked",
    "locked",
    "revoked",
  ]);

const TWO_FACTOR_STATUSES =
  new Set([
    "2fa_required",
    "mfa_required",
    "two_factor_required",
    "totp_required",
    "otp_required",
    "verification_required",
    "challenge_required",
  ]);

const KNOWN_AUTH_STORAGE_KEYS =
  Object.freeze([
    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_temporary_token",
    "onion_two_factor_token",
    "onion_mfa_token",
    "onion_otp_token",
    "onion_session_id",
    "onion_session_user_id",
    "onion_user_id",
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
    "onion:otpToken",
    "onion:otp_token",
    "onion:sessionId",
    "onion:session_id",
    "onion:sessionUserId",
    "onion:session_user_id",
    "onion:userId",
    "onion:user_id",
    "onion:userName",
    "onion:user_name",
    "onion:username",
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
    "otp_token",

    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "session",
    "sessionData",
    "sessionId",
    "session_id",
    "sessionUserId",
    "session_user_id",
    "user",
    "currentUser",
    "authUser",
    "sessionUser",
    "role",
    "userRole",
  ]);

const AUTH_OBJECT_KEYS =
  Object.freeze([
    "data",
    "payload",
    "result",
    "body",
    "response",
    "resource",
    "value",
    "session",
    "sessionData",
    "auth",
    "authData",
    "account",
  ]);

const AUTH_TOKEN_KEYS =
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
    "otpToken",
    "otp_token",
  ]);

const USER_KEYS =
  Object.freeze([
    "user",
    "usuario",
    "account",
    "profile",
    "me",
    "currentUser",
    "current_user",
  ]);

const CLIENT_KEYS =
  Object.freeze([
    "cliente",
    "client",
    "customer",
    "organization",
    "tenant",
  ]);

const ROUTING_KEYS =
  Object.freeze([
    "routing",
    "routes",
    "paths",
  ]);

const PREFERENCES_KEYS =
  Object.freeze([
    "preferences",
    "preferencias",
    "prefs",
  ]);

const ROLE_KEYS =
  Object.freeze([
    "role",
    "rol",
    "type",
    "tipo",
    "userRole",
    "user_role",
    "userType",
    "user_type",
  ]);

const PERMISSIONS_KEYS =
  Object.freeze([
    "permissions",
    "permisos",
    "scopes",
    "scope",
  ]);

const STATUS_KEYS =
  Object.freeze([
    "status",
    "statusCode",
    "status_code",
    "state",
    "estado",
  ]);

const CODE_KEYS =
  Object.freeze([
    "code",
    "errorCode",
    "error_code",
    "error",
  ]);

const MESSAGE_KEYS =
  Object.freeze([
    "message",
    "mensaje",
    "errorMessage",
    "error_message",
    "detail",
    "description",
    "title",
    "reason",
    "msg",
    "error",
  ]);

const REDIRECT_KEYS =
  Object.freeze([
    "redirectTo",
    "redirect_to",
    "redirect",
    "next",
    "nextPath",
    "next_path",
    "returnTo",
    "return_to",
    "target",
  ]);

const SESSION_OBJECT_KEYS =
  Object.freeze([
    "sessionData",
    "session",
    "authData",
    "auth",
  ]);

const SESSION_ID_KEYS =
  Object.freeze([
    "sessionId",
    "session_id",
    "sid",
    "id",
  ]);

const USER_ID_KEYS =
  Object.freeze([
    "userId",
    "user_id",
    "uid",
    "sub",
    "id",
  ]);

const SESSION_EXPIRES_KEYS =
  Object.freeze([
    "expiresAt",
    "expires_at",
    "refreshExpiresAt",
    "refresh_expires_at",
    "expiration",
    "expires",
    "exp",
  ]);

const TOKEN_VERSION_KEYS =
  Object.freeze([
    "tokenVersion",
    "token_version",
    "tv",
  ]);

const TWO_FACTOR_BOOL_KEYS =
  Object.freeze([
    "requires2FA",
    "requires_2fa",
    "require2FA",
    "require_2fa",
    "requiresTwoFactor",
    "requires_two_factor",
    "twoFactorRequired",
    "two_factor_required",
    "mfaRequired",
    "mfa_required",
    "requiresMfa",
    "requires_mfa",
    "otpRequired",
    "otp_required",
    "challengeRequired",
    "challenge_required",
  ]);

const BAD_TOKEN_VALUES =
  new Set([
    "",
    "null",
    "undefined",
    "false",
    "true",
    "none",
    "nan",
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

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeRawText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text =
    safeText(value, "")
      .toLowerCase();

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
    ].includes(text)
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
    ].includes(text)
  ) {
    return false;
  }

  return Boolean(fallback);
}

function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value, fallback = {}) {
  return isPlainObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function isFunction(value) {
  return typeof value === "function";
}

function unique(values = []) {
  const output =
    [];

  const seen =
    new Set();

  for (const value of safeArray(values).flat(Infinity)) {
    const text =
      safeText(value, "");

    if (
      text &&
      !seen.has(text)
    ) {
      seen.add(text);
      output.push(text);
    }
  }

  return output;
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      return value;
    }
  }

  return "";
}

function pickFirstText(...values) {
  for (const value of values) {
    const text =
      safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

function pickFirstObject(...values) {
  for (const value of values) {
    if (isPlainObject(value)) {
      return value;
    }
  }

  return null;
}

function wait(ms = 0) {
  return new Promise((resolve) => {
    try {
      setTimeout(
        resolve,
        Math.max(0, safeNumber(ms, 0))
      );
    } catch {
      resolve();
    }
  });
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function afterPaint(callback) {
  if (!isFunction(callback)) {
    return;
  }

  if (!isBrowser()) {
    try {
      callback();
    } catch {}

    return;
  }

  try {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          callback();
        } catch {}
      });
    });

    return;
  } catch {}

  try {
    window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}
}

function getState() {
  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function safeSetState(patch = {}, options = {}) {
  const cleanPatch =
    safeObject(patch);

  try {
    AppCore?.setState?.(
      cleanPatch,
      {
        source:
          LOGIN_SOURCE,
        emit:
          false,
        emitState:
          false,
        emitDerived:
          false,
        silent:
          true,
        ...safeObject(options),
      }
    );
  } catch {}

  try {
    AppCore?.patchState?.(
      cleanPatch,
      {
        source:
          LOGIN_SOURCE,
        emit:
          false,
        emitState:
          false,
        silent:
          true,
        ...safeObject(options),
      }
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        cleanPatch
      );
    }
  } catch {}

  return getState();
}

function normalizeLocalPath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  try {
    const normalized =
      normalizeAppPath(raw);

    if (normalized) {
      return normalized;
    }
  } catch {}

  if (raw === "/") {
    return "/";
  }

  let value =
    raw
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value || "/";
}

function stripSearchAndHash(path = "/") {
  const raw =
    safeText(path, "/");

  return (
    normalizeLocalPath(raw)
      .split("?")[0]
      .split("#")[0] ||
    "/"
  );
}

function normalizeStatusKey(value = "") {
  const raw =
    safeText(value, "")
      .toLowerCase();

  if (!raw) {
    return "";
  }

  if (Number.isFinite(Number(raw))) {
    return "";
  }

  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function redactSafe(value = "") {
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

function redactIdentifier(value = "") {
  const text =
    safeText(value, "");

  if (!text) {
    return "";
  }

  if (text.includes("@")) {
    const [
      local = "",
      domain = "",
    ] =
      text.split("@");

    return `${local.slice(0, 2)}***@${domain || "***"}`;
  }

  if (text.length <= 4) {
    return "***";
  }

  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(
      "[AuthLogin]",
      ...args
    );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthLogin]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[AuthLogin]",
        ...args
      );
    }
  } catch {}
}

/* =========================================================
   EVENTS
========================================================= */

function sanitizeUserForEvent(user = null) {
  if (!isPlainObject(user)) {
    return null;
  }

  const cloned = {
    ...user,
  };

  for (const key of [
    "password",
    "passwordHash",
    "password_hash",
    "hash",
    "twofa_secret",
    "twofaSecret",
    "mfa_secret",
    "mfaSecret",
    "refreshToken",
    "refresh_token",
    "token",
    "accessToken",
    "access_token",
    "tempToken",
    "temp_token",
    "secret",
    "_rid",
    "_self",
    "_etag",
    "_attachments",
    "_ts",
  ]) {
    delete cloned[key];
  }

  if (cloned.avatar) {
    cloned.avatar =
      redactSafe(cloned.avatar);
  }

  if (cloned.avatarUrl) {
    cloned.avatarUrl =
      redactSafe(cloned.avatarUrl);
  }

  if (cloned.picture) {
    cloned.picture =
      redactSafe(cloned.picture);
  }

  return cloned;
}

function sanitizeEventPayload(payload = {}) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const output = {
    ...payload,
  };

  for (const key of [
    ...AUTH_TOKEN_KEYS,
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

  if (output.identifier) {
    output.identifier =
      redactIdentifier(output.identifier);
  }

  for (const key of [
    "path",
    "route",
    "publicPath",
    "redirectTo",
    "url",
    "currentPath",
    "currentCanonicalPath",
    "endpoint",
  ]) {
    if (output[key]) {
      output[key] =
        redactSafe(output[key]);
    }
  }

  if (output.navigation?.target) {
    output.navigation = {
      ...output.navigation,
      target:
        redactSafe(output.navigation.target),
    };
  }

  if (output.user) {
    output.user =
      sanitizeUserForEvent(output.user);
  }

  if (output.error?.raw) {
    output.error = {
      ...output.error,
      raw:
        undefined,
    };
  }

  return output;
}

function safeEmit(eventName, payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  if (
    options?.silent === true ||
    options?.emit === false ||
    options?.emitEvents === false
  ) {
    return false;
  }

  const cleanPayload =
    sanitizeEventPayload({
      source:
        LOGIN_SOURCE,
      version:
        LOGIN_VERSION,
      at:
        isoNow(),
      ...safeObject(payload),
    });

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        name,
        cleanPayload
      );

      busEmitted =
        true;
    }
  } catch {}

  if (
    options.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail:
            cleanPayload,
        })
      );

      return true;
    } catch {}
  }

  return busEmitted;
}

function safeSetError(error = null) {
  try {
    AppCore?.setError?.(
      error || null
    );
  } catch {}

  try {
    if (error) {
      safeSetState({
        error,
        lastError:
          error,
        hasError:
          true,
      });
    } else {
      safeSetState({
        error:
          null,
        hasError:
          false,
      });
    }
  } catch {}

  return true;
}

/* =========================================================
   API CLIENT
========================================================= */

function getApiClient() {
  return (
    AppCore?.apiClient ||
    AppCore?.services?.apiClient ||
    AppCore?.services?.api ||
    AppCore?.services?.http ||
    AppCore?.services?.Http ||
    AppCore?.http ||
    AppCore?.Http ||
    null
  );
}

function normalizeAuthEndpoint(endpoint = "", fallback = "/api/auth/login") {
  const raw =
    safeText(endpoint, fallback);

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/api/")) {
    return raw;
  }

  if (raw.startsWith("/auth/")) {
    return `/api${raw}`;
  }

  if (raw.startsWith("/")) {
    return `/api/auth${raw}`;
  }

  return `/api/auth/${raw}`;
}

function resolveLoginEndpoint() {
  try {
    return normalizeAuthEndpoint(
      getLoginEndpoint?.() ||
        AUTH_ENDPOINTS?.login ||
        AUTH_ENDPOINTS?.auth?.login ||
        AppCore?.config?.auth?.endpoints?.login ||
        "/api/auth/login",
      "/api/auth/login"
    );
  } catch {
    return normalizeAuthEndpoint(
      AUTH_ENDPOINTS?.login ||
        "/api/auth/login",
      "/api/auth/login"
    );
  }
}

function normalizeApiBase(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return BACKEND_ORIGIN;
  }

  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/g, "");
  }

  try {
    const parsed =
      new URL(raw);

    const origin =
      parsed.origin.replace(/\/+$/g, "");

    const pathname =
      (parsed.pathname || "/")
        .replace(/\/+$/g, "") ||
      "/";

    if (
      pathname === "/" ||
      pathname === "/api"
    ) {
      return origin;
    }

    return `${origin}${pathname}`.replace(/\/+$/g, "");
  } catch {
    return BACKEND_ORIGIN;
  }
}

function resolveApiBase() {
  return normalizeApiBase(
    AppCore?.config?.apiBase ||
      AppCore?.config?.apiOrigin ||
      AppCore?.config?.apiBaseUrl ||
      AppCore?.config?.api?.baseUrl ||
      AppCore?.config?.api?.base ||
      AppCore?.config?.api?.origin ||
      AppCore?.config?.baseUrl ||
      AppCore?.config?.apiUrl ||
      AppCore?.config?.backendUrl ||
      BACKEND_ORIGIN
  );
}

function joinApiUrl(apiBase = "", endpoint = "") {
  const cleanEndpoint =
    safeText(endpoint, "/api/auth/login");

  if (/^https?:\/\//i.test(cleanEndpoint)) {
    return cleanEndpoint;
  }

  const base =
    normalizeApiBase(apiBase)
      .replace(/\/+$/g, "");

  let normalizedEndpoint =
    cleanEndpoint.startsWith("/")
      ? cleanEndpoint
      : `/${cleanEndpoint}`;

  if (
    /\/api$/i.test(base) &&
    normalizedEndpoint.startsWith("/api/")
  ) {
    normalizedEndpoint =
      normalizedEndpoint.replace(/^\/api/i, "");
  }

  return `${base}${normalizedEndpoint}`;
}

function resolveApiUrl(path = "") {
  return joinApiUrl(
    resolveApiBase(),
    path || resolveLoginEndpoint()
  );
}

function resolveLoginTimeout(options = {}) {
  const opts =
    safeObject(options);

  const fromOptions =
    opts.timeout ??
    opts.timeoutMs ??
    opts.loginTimeoutMs;

  if (fromOptions !== undefined) {
    return Math.max(
      1000,
      safeNumber(fromOptions, DEFAULT_LOGIN_TIMEOUT_MS)
    );
  }

  try {
    return Math.max(
      1000,
      safeNumber(
        getLoginTimeoutMs?.() ||
          getAuthPublicTimeoutMs?.(),
        DEFAULT_LOGIN_TIMEOUT_MS
      )
    );
  } catch {}

  return Math.max(
    1000,
    safeNumber(
      AUTH_CONSTANTS?.loginTimeoutMs ||
        AUTH_CONSTANTS?.authPublicTimeoutMs ||
        AUTH_CONSTANTS?.requestTimeout,
      DEFAULT_LOGIN_TIMEOUT_MS
    )
  );
}

function createLoginAbortController(options = {}) {
  if (typeof AbortController !== "function") {
    return null;
  }

  const timeoutMs =
    resolveLoginTimeout(options);

  const controller =
    new AbortController();

  if (
    !timeoutMs ||
    timeoutMs <= 0
  ) {
    return {
      controller,
      signal:
        controller.signal,
      timer:
        null,
      timeoutMs,
    };
  }

  let timer =
    null;

  try {
    timer =
      setTimeout(() => {
        const error =
          new Error("Login timeout");

        error.name =
          "TimeoutError";

        error.code =
          "LOGIN_TIMEOUT";

        error.timeout =
          true;

        try {
          controller.abort(error);
        } catch {
          try {
            controller.abort();
          } catch {}
        }
      }, timeoutMs);
  } catch {}

  return {
    controller,
    signal:
      controller.signal,
    timer,
    timeoutMs,
  };
}

function clearLoginAbortController(abortCtx = null) {
  if (!abortCtx) {
    return false;
  }

  try {
    if (abortCtx.timer) {
      clearTimeout(abortCtx.timer);
    }
  } catch {}

  return true;
}

function withMergedSignal(primarySignal = null, fallbackSignal = null) {
  const signals =
    [
      primarySignal,
      fallbackSignal,
    ].filter(Boolean);

  if (!signals.length) {
    return null;
  }

  if (signals.length === 1) {
    return signals[0];
  }

  try {
    if (
      typeof AbortSignal !== "undefined" &&
      isFunction(AbortSignal.any)
    ) {
      return AbortSignal.any(signals);
    }
  } catch {}

  return primarySignal || fallbackSignal;
}

function stripAuthHeaders(headers = {}) {
  const output = {
    ...safeObject(headers),
  };

  for (const key of Object.keys(output)) {
    if (
      [
        "authorization",
        "x-auth-token",
        "x-access-token",
        "x-refresh-token",
      ].includes(String(key).toLowerCase())
    ) {
      delete output[key];
    }
  }

  return output;
}

async function readMaybeResponse(value) {
  if (
    value &&
    typeof Response !== "undefined" &&
    value instanceof Response
  ) {
    let payload =
      null;

    try {
      payload =
        await value.json();
    } catch {
      try {
        payload =
          await value.text();
      } catch {
        payload =
          null;
      }
    }

    if (!value.ok) {
      const message =
        extractMessage(payload) ||
        payload?.message ||
        payload?.error?.message ||
        payload?.error ||
        `HTTP ${value.status}`;

      const error =
        createAuthError(
          message,
          {
            status:
              value.status,
            code:
              payload?.code ||
              payload?.error?.code ||
              payload?.error ||
              (
                value.status === 401
                  ? "UNAUTHORIZED"
                  : value.status === 403
                    ? "FORBIDDEN"
                    : "LOGIN_FAILED"
              ),
            raw:
              payload || value,
          }
        );

      error.response = {
        status:
          value.status,
        data:
          payload,
      };

      throw error;
    }

    return payload;
  }

  return value;
}

async function nativeFetchPost(path, body = {}, options = {}) {
  if (typeof fetch !== "function") {
    throw createAuthError(
      "No hay cliente API disponible para login.",
      {
        status:
          500,
        code:
          "API_CLIENT_MISSING",
      }
    );
  }

  const url =
    resolveApiUrl(path);

  const headers =
    stripAuthHeaders({
      "Content-Type":
        "application/json",
      Accept:
        "application/json",
      "X-Onion-Auth-Flow":
        "login",
      "X-Request-Source":
        LOGIN_SOURCE,
      ...(safeObject(options.headers)),
    });

  const response =
    await fetch(url, {
      method:
        "POST",
      headers,
      credentials:
        options.credentials ||
        DEFAULT_CREDENTIALS_MODE,
      cache:
        "no-store",
      mode:
        options.mode ||
        "cors",
      signal:
        options.signal || undefined,
      body:
        JSON.stringify(body || {}),
    });

  return await readMaybeResponse(response);
}

function buildPublicLoginRequestOptions(options = {}, signal = null) {
  const opts =
    safeObject(options);

  const timeoutMs =
    resolveLoginTimeout(opts);

  let publicOptions = {};

  try {
    publicOptions =
      getPublicAuthRequestOptions?.() ||
      {};
  } catch {
    publicOptions = {};
  }

  const headers =
    stripAuthHeaders({
      "X-Onion-Auth-Flow":
        "login",
      "X-Request-Source":
        LOGIN_SOURCE,
      ...safeObject(opts.headers),
    });

  return {
    ...opts,
    ...publicOptions,

    public:
      true,

    auth:
      false,

    skipAuth:
      true,

    noAuthHeader:
      true,

    _skipAuthRefresh:
      true,

    skipAuthRefresh:
      true,

    noAutoRefresh:
      true,

    autoRefresh:
      false,

    noAutoLogout:
      true,

    autoLogout:
      false,

    retry:
      false,

    retries:
      0,

    _skipRetry:
      true,

    skipRetry:
      true,

    credentials:
      opts.credentials ||
      DEFAULT_CREDENTIALS_MODE,

    silent:
      opts.silent === true,

    storeError:
      false,

    dedupe:
      false,

    useLoader:
      opts.useLoader !== false,

    timeout:
      timeoutMs,

    timeoutMs,

    loginTimeoutMs:
      timeoutMs,

    signal,

    headers,
  };
}

async function apiPost(path, body = {}, options = {}) {
  const apiClient =
    getApiClient();

  const abortCtx =
    createLoginAbortController(options);

  const signal =
    withMergedSignal(
      options.signal,
      abortCtx?.signal
    );

  const finalOptions =
    buildPublicLoginRequestOptions(
      options,
      signal
    );

  try {
    if (
      apiClient &&
      isFunction(apiClient.post)
    ) {
      const result =
        await apiClient.post(
          path,
          body,
          finalOptions
        );

      return await readMaybeResponse(result);
    }

    if (
      apiClient &&
      isFunction(apiClient.request)
    ) {
      try {
        const result =
          await apiClient.request(
            path,
            {
              ...finalOptions,
              method:
                "POST",
              body,
            }
          );

        return await readMaybeResponse(result);
      } catch (firstError) {
        try {
          const result =
            await apiClient.request(
              {
                ...finalOptions,
                method:
                  "POST",
                url:
                  path,
                path,
                body,
              }
            );

          return await readMaybeResponse(result);
        } catch {
          try {
            const result =
              await apiClient.request(
                "POST",
                path,
                {
                  ...finalOptions,
                  body,
                }
              );

            return await readMaybeResponse(result);
          } catch {
            throw firstError;
          }
        }
      }
    }

    return await nativeFetchPost(
      path,
      body,
      finalOptions
    );
  } finally {
    clearLoginAbortController(abortCtx);
  }
}

/* =========================================================
   ROUTE HELPERS
========================================================= */

function normalizeCleanRoute(path = "/") {
  try {
    return configLikeRoute(
      normalizeCanonicalPath(
        normalizeLocalPath(path || "/")
      )
    );
  } catch {
    return String(path || "/");
  }
}

function isRouteDefaultRedirect(path = "") {
  const clean =
    stripSearchAndHash(path);

  if (ROUTE_DEFAULT_REDIRECTS.has(clean)) {
    return true;
  }

  if (/^\/@[^/]+(?:\/)?$/i.test(clean)) {
    return true;
  }

  return false;
}

function getHomeRoute() {
  const configured =
    configLikeRoute(
      AppCore?.config?.routes?.home ||
        AppCore?.config?.homePath ||
        DEFAULT_HOME_PATH
    ) ||
    DEFAULT_HOME_PATH;

  if (
    isAuthRoute(configured) ||
    isRouteDefaultRedirect(configured) ||
    !isSafeRelativePath(configured)
  ) {
    return DEFAULT_HOME_PATH;
  }

  return configured;
}

function getLoginRoute() {
  const loginPath =
    configLikeRoute(
      AppCore?.config?.routes?.login ||
        DEFAULT_LOGIN_PATH
    ) ||
    DEFAULT_LOGIN_PATH;

  return isSafeRelativePath(loginPath)
    ? loginPath
    : DEFAULT_LOGIN_PATH;
}

function getBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    return normalizeLocalPath(
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return "/";
  }
}

function getBrowserCanonicalPath() {
  try {
    return configLikeRoute(
      getCurrentCanonicalPath() ||
        getBrowserPath() ||
        "/"
    );
  } catch {
    return configLikeRoute(
      getBrowserPath() ||
        "/"
    );
  }
}

function sameCanonicalPath(a = "/", b = "/") {
  try {
    return (
      configLikeRoute(normalizeCanonicalPath(a)) ===
      configLikeRoute(normalizeCanonicalPath(b))
    );
  } catch {
    return String(a || "/") === String(b || "/");
  }
}

function isLoginRoute(path = "") {
  const clean =
    stripSearchAndHash(path);

  return (
    clean === DEFAULT_LOGIN_PATH ||
    clean === getLoginRoute() ||
    clean.startsWith(`${DEFAULT_LOGIN_PATH}/`) ||
    clean.startsWith(`${getLoginRoute()}/`)
  );
}

function shouldNavigateAfterLogin(options = {}) {
  return !(
    options?.navigate === false ||
    options?.skipNavigate === true ||
    options?.skipNavigation === true ||
    options?.manualNavigate === true ||
    options?.skipRedirect === true ||
    options?.noRedirect === true ||
    options?.skipPostLoginNavigation === true ||
    options?.skipPostRestoreNavigation === true ||
    options?.preserveCurrentRoute === true
  );
}

/* =========================================================
   DOM / UI REPAIR
========================================================= */

function setDocumentAuthFlags({
  authenticated = false,
  loading = false,
  ready = false,
} = {}) {
  if (!isBrowser()) {
    return false;
  }

  try {
    document.documentElement?.classList?.toggle(
      "app-loading",
      Boolean(loading)
    );

    document.documentElement?.classList?.toggle(
      "app-ready",
      Boolean(ready)
    );

    document.documentElement?.setAttribute(
      "data-authenticated",
      authenticated ? "true" : "false"
    );

    document.body?.classList?.toggle(
      "app-loading",
      Boolean(loading)
    );

    document.body?.classList?.toggle(
      "app-ready",
      Boolean(ready)
    );

    document.body?.setAttribute(
      "data-authenticated",
      authenticated ? "true" : "false"
    );

    return true;
  } catch {
    return false;
  }
}

function clearAuthScreenDomState(reason = "login-success") {
  if (!isBrowser()) {
    return false;
  }

  try {
    document.body?.classList?.remove?.(
      "auth-screen",
      "login-no-scroll",
      "route-auth",
      "route-shell-hidden",
      "route-chrome-hidden"
    );

    document.body?.classList?.add?.(
      "route-app",
      "route-shell-visible",
      "route-chrome-visible"
    );

    document.body?.removeAttribute?.(
      "data-auth-screen"
    );

    document.body?.setAttribute?.(
      "data-authenticated",
      "true"
    );

    document.body?.setAttribute?.(
      "data-route-mode",
      "app"
    );

    document.body?.setAttribute?.(
      "data-chrome",
      "visible"
    );

    document.body?.setAttribute?.(
      "data-shell",
      "visible"
    );
  } catch {}

  try {
    document.documentElement?.classList?.remove?.(
      "route-auth",
      "route-shell-hidden",
      "route-chrome-hidden"
    );

    document.documentElement?.classList?.add?.(
      "route-app",
      "route-shell-visible",
      "route-chrome-visible"
    );

    document.documentElement?.setAttribute?.(
      "data-authenticated",
      "true"
    );

    document.documentElement?.setAttribute?.(
      "data-route-mode",
      "app"
    );

    document.documentElement?.setAttribute?.(
      "data-chrome",
      "visible"
    );

    document.documentElement?.setAttribute?.(
      "data-shell",
      "visible"
    );
  } catch {}

  try {
    const shell =
      document.getElementById("app-shell");

    if (shell) {
      shell.hidden =
        false;

      shell.setAttribute(
        "aria-busy",
        "false"
      );

      shell.setAttribute(
        "aria-hidden",
        "false"
      );

      shell.dataset.shell =
        "visible";

      shell.dataset.chrome =
        "visible";

      shell.dataset.routeMode =
        "app";
    }
  } catch {}

  try {
    const main =
      document.getElementById("main-content");

    if (main) {
      main.hidden =
        false;

      main.setAttribute(
        "aria-busy",
        "false"
      );

      main.setAttribute(
        "aria-hidden",
        "false"
      );

      main.dataset.routeMode =
        "app";
    }
  } catch {}

  try {
    const view =
      document.getElementById("view-container");

    if (view) {
      view.hidden =
        false;

      view.setAttribute(
        "aria-busy",
        "false"
      );

      view.setAttribute(
        "aria-hidden",
        "false"
      );

      view.dataset.routeMode =
        "app";
    }
  } catch {}

  setDocumentAuthFlags({
    authenticated:
      true,
    loading:
      false,
    ready:
      true,
  });

  safeEmit(
    "app:shell:auth-screen-cleared",
    {
      reason,
    }
  );

  return true;
}

function setTwoFactorDomState(reason = "login-2fa") {
  if (!isBrowser()) {
    return false;
  }

  try {
    document.body?.classList?.add?.(
      "route-auth"
    );

    document.body?.classList?.remove?.(
      "route-app"
    );

    document.body?.setAttribute?.(
      "data-authenticated",
      "false"
    );

    document.documentElement?.setAttribute?.(
      "data-authenticated",
      "false"
    );
  } catch {}

  safeEmit(
    "app:shell:two-factor-pending",
    {
      reason,
    }
  );

  return true;
}

function safeSyncUserUI(reason = "login-sync-user-ui") {
  try {
    AppCore?.syncUserUI?.({
      AppCore,
      reason,
      source:
        LOGIN_SOURCE,
    });
  } catch {
    try {
      AppCore?.syncUserUI?.();
    } catch {}
  }

  safeEmit(
    "app:ui:repair-request",
    {
      reason,
      authenticated:
        Boolean(getState().authenticated),
      user:
        getState().user || null,
      role:
        getState().role || null,
      repairShell:
        false,
      hardRepair:
        false,
      rebind:
        false,
    }
  );

  return true;
}

function emitLoginSessionCommitted(reason = "login-session-applied", extra = {}) {
  const payload = {
    reason,
    authenticated:
      Boolean(getState().authenticated),
    user:
      getState().user || null,
    role:
      getState().role || null,
    route:
      getState().route || "/",
    publicPath:
      getState().publicPath || "/",
    sessionId:
      getState().sessionId ||
      getState().session?.sessionId ||
      null,
    tokenVersion:
      getState().tokenVersion ??
      getState().session?.tokenVersion ??
      null,
    ...extra,
  };

  safeEmit(
    "auth:login:session-committed",
    payload
  );

  safeEmit(
    "auth:session:applied",
    {
      ...payload,
      reason:
        `${reason}:session-applied`,
    }
  );

  safeEmit(
    "app:user:change",
    payload
  );

  safeEmit(
    "app:auth:ready",
    payload
  );

  return payload;
}

/* =========================================================
   ROUTER / NAVIGATION
========================================================= */

async function resolveRouter() {
  const candidates = [
    AppCore?.Router,
    AppCore?.router,
    AppCore?.modules?.Router,
    AppCore?.modules?.router,
    isFunction(AppCore?.modules?.get)
      ? AppCore.modules.get("router")
      : null,
    isFunction(AppCore?.modules?.get)
      ? AppCore.modules.get("Router")
      : null,
    isBrowser()
      ? window.Router
      : null,
    isBrowser()
      ? window.AppRouter
      : null,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      (
        isFunction(candidate.goAfterLogin) ||
        isFunction(candidate.navigate) ||
        isFunction(candidate.go) ||
        isFunction(candidate.push) ||
        isFunction(candidate.render)
      )
    ) {
      return candidate;
    }
  }

  try {
    const module =
      await import("../../router/index.js");

    const router =
      module?.Router ||
      module?.default ||
      null;

    if (
      router &&
      (
        isFunction(router.goAfterLogin) ||
        isFunction(router.navigate) ||
        isFunction(router.go) ||
        isFunction(router.push) ||
        isFunction(router.render)
      )
    ) {
      return router;
    }
  } catch {}

  return null;
}

function updateCoreRouteState(target = "/") {
  const cleanTarget =
    normalizeLocalPath(
      target || "/"
    ) || "/";

  const canonical =
    configLikeRoute(
      normalizeCanonicalPath(cleanTarget)
    );

  const previousRoute =
    getState().route || "/";

  const previousPublicPath =
    getState().publicPath ||
    previousRoute;

  try {
    if (isFunction(AppCore?.setRoute)) {
      AppCore.setRoute(canonical);
    }
  } catch {}

  try {
    if (isFunction(AppCore?.setPublicPath)) {
      AppCore.setPublicPath(cleanTarget);
    }
  } catch {}

  safeSetState({
    route:
      canonical,
    canonicalPath:
      canonical,
    publicPath:
      cleanTarget,
    lastRoute:
      previousRoute,
    lastPublicPath:
      previousPublicPath,
  });

  return {
    route:
      canonical,
    publicPath:
      cleanTarget,
    previousRoute,
    previousPublicPath,
  };
}

function withNavigationTimeout(promiseLike, timeoutMs = 0) {
  const ms =
    Math.max(
      1000,
      safeNumber(timeoutMs, 8000)
    );

  let timer =
    null;

  const timeout =
    new Promise((_, reject) => {
      timer =
        setTimeout(() => {
          const error =
            new Error("LOGIN_NAVIGATION_TIMEOUT");

          error.code =
            "LOGIN_NAVIGATION_TIMEOUT";

          reject(error);
        }, ms);
    });

  return Promise.race([
    Promise.resolve(promiseLike),
    timeout,
  ]).finally(() => {
    if (timer) {
      try {
        clearTimeout(timer);
      } catch {}
    }
  });
}

async function callRouterNavigation(router, target, options = {}) {
  const targetCanonical =
    configLikeRoute(
      normalizeCanonicalPath(target)
    );

  const commonOptions = {
    replaceState:
      options.replaceState !== false,
    force:
      true,
    forceRender:
      true,
    source:
      LOGIN_SOURCE,
    reason:
      options.reason || "login-navigation",
    publicPath:
      target,
    requestedPath:
      target,
    canonicalPath:
      targetCanonical,
    preservePublicPath:
      true,
  };

  const timeoutMs =
    resolveLoginTimeout(options);

  if (
    router &&
    isFunction(router.goAfterLogin)
  ) {
    await withNavigationTimeout(
      router.goAfterLogin(
        target,
        commonOptions
      ),
      timeoutMs
    );

    return {
      ok:
        true,
      method:
        "goAfterLogin",
    };
  }

  if (
    router &&
    isFunction(router.navigate)
  ) {
    await withNavigationTimeout(
      router.navigate(
        target,
        commonOptions
      ),
      timeoutMs
    );

    return {
      ok:
        true,
      method:
        "navigate",
    };
  }

  if (
    router &&
    isFunction(router.go)
  ) {
    await withNavigationTimeout(
      router.go(
        target,
        commonOptions
      ),
      timeoutMs
    );

    return {
      ok:
        true,
      method:
        "go",
    };
  }

  if (
    router &&
    isFunction(router.push)
  ) {
    await withNavigationTimeout(
      router.push(
        target,
        commonOptions
      ),
      timeoutMs
    );

    return {
      ok:
        true,
      method:
        "push",
    };
  }

  if (
    router &&
    isFunction(router.render)
  ) {
    await withNavigationTimeout(
      router.render(
        targetCanonical,
        commonOptions
      ),
      timeoutMs
    );

    return {
      ok:
        true,
      method:
        "render",
    };
  }

  return {
    ok:
      false,
    method:
      "",
  };
}

function hardRedirectTo(target = DEFAULT_HOME_PATH) {
  if (!isBrowser()) {
    return false;
  }

  const finalTarget =
    normalizeRedirectCandidate(target) ||
    getHomeRoute();

  try {
    window.location.assign(finalTarget);
    return true;
  } catch {
    try {
      window.location.href =
        finalTarget;

      return true;
    } catch {}
  }

  return false;
}

async function safeNavigate(path = "/", options = {}) {
  const target =
    normalizeRedirectCandidate(path) ||
    getHomeRoute();

  const current =
    getBrowserCanonicalPath();

  const targetCanonical =
    configLikeRoute(
      normalizeCanonicalPath(target)
    );

  const replaceState =
    options.replaceState !== false;

  const force =
    options.force === true;

  const reason =
    safeText(
      options.reason,
      "login-navigation"
    );

  safeEmit(
    "auth:login:navigation:start",
    {
      reason,
      target,
      targetCanonical,
      replaceState,
      force,
    }
  );

  if (
    isBrowser() &&
    sameCanonicalPath(current, targetCanonical) &&
    !force
  ) {
    updateCoreRouteState(target);

    clearAuthScreenDomState(
      `${reason}:same-route`
    );

    const result = {
      ok:
        true,
      skipped:
        true,
      method:
        "same-route",
      reason:
        "same-route",
      target,
    };

    safeEmit(
      "auth:login:navigation:complete",
      result
    );

    return result;
  }

  const router =
    await resolveRouter();

  if (router) {
    try {
      const nav =
        await callRouterNavigation(
          router,
          target,
          {
            replaceState,
            force,
            reason,
            timeout:
              options.timeout,
            timeoutMs:
              options.timeoutMs,
          }
        );

      if (nav.ok) {
        updateCoreRouteState(target);

        clearAuthScreenDomState(
          `${reason}:${nav.method}`
        );

        await wait(0);

        if (
          options.hardFallbackOnStaleLogin !== false &&
          isBrowser() &&
          isLoginRoute(getBrowserPath()) &&
          !sameCanonicalPath(getBrowserCanonicalPath(), targetCanonical)
        ) {
          hardRedirectTo(target);
        }

        const navResult = {
          ok:
            true,
          skipped:
            false,
          method:
            nav.method,
          reason:
            "router",
          target,
        };

        safeEmit(
          "auth:login:navigation:complete",
          navResult
        );

        return navResult;
      }
    } catch (error) {
      safeWarn(
        "Router navigation falló.",
        error
      );

      safeEmit(
        "auth:login:navigation:error",
        {
          reason:
            "router-error",
          target,
          message:
            extractMessage(error),
        }
      );
    }
  }

  /*
    Fallback real.
    No usamos history.replaceState aquí porque cambia la URL
    pero puede dejar la vista login pintada y provocar congelación visual.
  */
  if (hardRedirectTo(target)) {
    return {
      ok:
        true,
      skipped:
        false,
      method:
        "location",
      reason:
        "location",
      target,
    };
  }

  const failed = {
    ok:
      false,
    skipped:
      false,
    method:
      "",
    reason:
      "navigation-failed",
    target,
  };

  safeEmit(
    "auth:login:navigation:error",
    failed
  );

  return failed;
}

/* =========================================================
   IDENTIFIER / PAYLOAD
========================================================= */

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value).trim()
  );
}

function looksLikePhone(value = "") {
  const clean =
    String(value)
      .replace(/[^\d+]/g, "")
      .trim();

  return /^\+?\d{6,20}$/.test(clean);
}

function normalizePhone(value = "") {
  return String(value)
    .replace(/[^\d+]/g, "")
    .trim();
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
      "",
    ""
  );
}

export function normalizeLoginPayload(credentials = {}) {
  const rawIdentifier =
    resolveLoginIdentifier(credentials);

  const maxIdentifier =
    safeNumber(
      AUTH_CONSTANTS?.identifierMaxLength,
      160
    );

  const maxPassword =
    safeNumber(
      AUTH_CONSTANTS?.passwordMaxLength,
      1024
    );

  const identifier =
    safeText(rawIdentifier)
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .slice(0, maxIdentifier);

  const password =
    safeRawText(
      credentials.password ??
        credentials.pass ??
        "",
      ""
    ).slice(0, maxPassword);

  return {
    identifier,
    password,
    remember:
      safeBool(credentials.remember, false),
  };
}

export function buildLoginRequestBody(credentials = {}) {
  const {
    identifier,
    password,
    remember,
  } =
    normalizeLoginPayload(credentials);

  const clean =
    safeText(identifier);

  const email =
    looksLikeEmail(clean)
      ? clean.toLowerCase()
      : "";

  const phone =
    !email &&
    looksLikePhone(clean)
      ? normalizePhone(clean)
      : "";

  const username =
    !email &&
    !phone
      ? sanitizeUsername(clean)
      : "";

  const slug =
    username ||
    sanitizeUsername(clean);

  return {
    identifier:
      clean,

    email:
      email || undefined,

    emailLower:
      email || undefined,

    email_lower:
      email || undefined,

    phone:
      phone || undefined,

    telefono:
      phone || undefined,

    username:
      username || undefined,

    usernameLower:
      username || undefined,

    username_lower:
      username || undefined,

    slug:
      slug || undefined,

    user:
      username || clean,

    login:
      clean,

    password,

    remember,
    rememberMe:
      remember,
    remember_me:
      remember,
  };
}

function buildLoginFingerprint(credentials = {}) {
  const payload =
    normalizeLoginPayload(credentials);

  return [
    safeText(payload.identifier, "").toLowerCase(),
    payload.remember ? "1" : "0",
  ].join("|");
}

/* =========================================================
   REDIRECTS
========================================================= */

function normalizeRedirectCandidate(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  let candidate =
    "";

  try {
    candidate =
      sanitizeRedirectPath(raw, "");
  } catch {
    try {
      candidate =
        normalizeLocalPath(raw);
    } catch {
      candidate =
        "";
    }
  }

  candidate =
    safeText(candidate, "");

  if (!candidate) {
    return "";
  }

  if (!isSafeRelativePath(candidate)) {
    return "";
  }

  if (isAuthRoute(candidate)) {
    return "";
  }

  return candidate;
}

function getRedirectFromUrl() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const params =
      new URLSearchParams(window.location.search);

    return normalizeRedirectCandidate(
      params.get("redirect") ||
        params.get("next") ||
        params.get("target") ||
        params.get("returnTo") ||
        ""
    );
  } catch {
    return "";
  }
}

function getRedirectFromOptions(options = {}) {
  const opts =
    safeObject(options);

  return normalizeRedirectCandidate(
    opts.redirectTo ||
      opts.redirect ||
      opts.target ||
      opts.next ||
      opts.returnTo ||
      ""
  );
}

export function buildLoginRedirectPath(targetPath = null) {
  const loginPath =
    getLoginRoute();

  const target =
    configLikeRoute(
      targetPath ||
        getCurrentCanonicalPath() ||
        "/"
    );

  if (
    !target ||
    target === loginPath
  ) {
    return loginPath;
  }

  if (!isSafeRelativePath(target)) {
    return loginPath;
  }

  if (isAuthRoute(target)) {
    return loginPath;
  }

  if (!isBrowser()) {
    return `${loginPath}?redirect=${encodeURIComponent(target)}`;
  }

  try {
    const url =
      new URL(
        loginPath,
        window.location.origin
      );

    url.searchParams.set(
      "redirect",
      target
    );

    return `${url.pathname}${url.search}`;
  } catch {
    return loginPath;
  }
}

export function getPostLoginTarget(user = AppCore?.state?.user, options = {}) {
  const fromOptions =
    getRedirectFromOptions(options);

  if (fromOptions) {
    return fromOptions;
  }

  const fromUrl =
    getRedirectFromUrl();

  if (fromUrl) {
    return fromUrl;
  }

  const userHome =
    user?.homePath ||
    user?.routing?.homePath ||
    user?.routing?.panelPath ||
    user?.preferences?.homePath ||
    "";

  const normalizedUserHome =
    normalizeRedirectCandidate(userHome);

  if (
    normalizedUserHome &&
    !isRouteDefaultRedirect(normalizedUserHome)
  ) {
    return normalizedUserHome;
  }

  return getHomeRoute();
}

/* =========================================================
   AUTH RESPONSE NORMALIZATION
========================================================= */

function collectAuthObjects(raw = {}) {
  const output =
    [];

  const seen =
    new WeakSet();

  const queue =
    [raw];

  let guard =
    0;

  while (
    queue.length &&
    guard < 180
  ) {
    guard += 1;

    const current =
      queue.shift();

    if (
      !isPlainObject(current)
    ) {
      continue;
    }

    try {
      if (seen.has(current)) {
        continue;
      }

      seen.add(current);
    } catch {}

    output.push(current);

    for (const key of AUTH_OBJECT_KEYS) {
      const nested =
        current[key];

      if (isPlainObject(nested)) {
        queue.push(nested);
      }
    }

    if (isPlainObject(current.response?.data)) {
      queue.push(current.response.data);
    }

    if (isPlainObject(current.data?.auth)) {
      queue.push(current.data.auth);
    }

    if (isPlainObject(current.data?.session)) {
      queue.push(current.data.session);
    }

    if (isPlainObject(current.auth?.session)) {
      queue.push(current.auth.session);
    }

    if (isPlainObject(current.data?.data)) {
      queue.push(current.data.data);
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

  return "";
}

function pickTextFromObjects(objects = [], keys = []) {
  return safeText(
    pickValueFromObjects(objects, keys),
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

function pickArrayFromObjects(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (Array.isArray(object?.[key])) {
        return object[key];
      }

      if (
        typeof object?.[key] === "string" &&
        object[key]
      ) {
        return object[key]
          .split(/[,\s]+/)
          .map((item) =>
            item.trim()
          )
          .filter(Boolean);
      }
    }
  }

  return [];
}

function pickBoolFromObjects(objects = [], keys = []) {
  for (const object of objects) {
    for (const key of keys) {
      if (
        key in safeObject(object) &&
        safeBool(object[key], false)
      ) {
        return true;
      }
    }
  }

  return false;
}

function validateAuthResponseSoft(response) {
  try {
    return {
      ok:
        true,
      value:
        validateAuthResponse(response),
      error:
        null,
    };
  } catch (error) {
    return {
      ok:
        false,
      value:
        null,
      error,
    };
  }
}

function normalizeTokenValue(token = "") {
  let value =
    safeText(token, "");

  if (!value) {
    return "";
  }

  value =
    value.replace(/^Bearer\s+/i, "")
      .trim();

  const lower =
    value.toLowerCase();

  if (
    BAD_TOKEN_VALUES.has(lower) ||
    /[\s\r\n\t]/.test(value)
  ) {
    return "";
  }

  const maxTokenLength =
    safeNumber(
      AUTH_CONSTANTS?.tokenMaxLength,
      8192
    );

  if (
    maxTokenLength > 0 &&
    value.length > maxTokenLength
  ) {
    return "";
  }

  return value;
}

function hasUsableToken(token = "") {
  const value =
    normalizeTokenValue(token);

  if (!value) {
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

function isUserActive(user = null) {
  if (!isPlainObject(user)) {
    return false;
  }

  const status =
    normalizeStatusKey(
      user.status ||
        user.estado ||
        user.state ||
        user.accountStatus ||
        ""
    );

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
      "bloqueado",
      "eliminado",
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

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeUserForClient(user = {}) {
  if (!isPlainObject(user)) {
    return null;
  }

  const userId =
    pickFirstText(
      user.userId,
      user.user_id,
      user.uid,
      user.sub,
      user.id,
      user._id
    );

  const username =
    pickFirstText(
      user.username,
      user.userName,
      user.user_name,
      user.usernameLower,
      user.username_lower,
      user.slug
    );

  const email =
    pickFirstText(
      user.email,
      user.mail,
      user.emailLower,
      user.email_lower
    );

  const role =
    normalizeRole(
      pickFirstText(
        user.role,
        user.rol,
        user.type,
        user.tipo,
        user.userRole,
        user.user_role,
        user.userType,
        user.user_type,
        "user"
      )
    );

  const avatar =
    resolveAvatar(user);

  const preferences =
    safeObject(
      user.preferences ||
        user.preferencias ||
        {}
    );

  const permissions =
    safeArray(
      user.permissions ||
        user.permisos ||
        []
    );

  const usernameLower =
    safeText(
      user.usernameLower ||
        user.username_lower ||
        sanitizeUsername(username || email || ""),
      ""
    ) || null;

  return {
    ...user,

    id:
      user.id ||
      userId ||
      null,

    userId:
      user.userId ||
      userId ||
      null,

    user_id:
      user.user_id ||
      userId ||
      null,

    uid:
      user.uid ||
      userId ||
      null,

    sub:
      user.sub ||
      userId ||
      null,

    username:
      username ||
      null,

    userName:
      user.userName ||
      username ||
      null,

    user_name:
      user.user_name ||
      username ||
      null,

    usernameLower,

    username_lower:
      user.username_lower ||
      usernameLower,

    slug:
      user.slug ||
      usernameLower ||
      null,

    email:
      email ||
      null,

    emailLower:
      user.emailLower ||
      user.email_lower ||
      (email ? String(email).toLowerCase() : null),

    email_lower:
      user.email_lower ||
      user.emailLower ||
      (email ? String(email).toLowerCase() : null),

    name:
      user.name ||
      user.nombre ||
      user.displayName ||
      user.fullName ||
      username ||
      email ||
      "Usuario",

    nombre:
      user.nombre ||
      user.name ||
      user.displayName ||
      user.fullName ||
      username ||
      email ||
      "Usuario",

    displayName:
      user.displayName ||
      user.fullName ||
      user.name ||
      user.nombre ||
      username ||
      email ||
      "Usuario",

    fullName:
      user.fullName ||
      user.displayName ||
      user.name ||
      user.nombre ||
      username ||
      email ||
      "Usuario",

    role,

    rol:
      role,

    roles:
      unique([
        role,
        ...safeArray(user.roles),
      ]),

    permissions,

    permisos:
      permissions,

    avatar,

    avatarUrl:
      avatar,

    picture:
      avatar,

    hasAvatar:
      user.hasAvatar === true ||
      user.has_avatar === true ||
      Boolean(avatar),

    preferences,

    lang:
      user.lang ||
      user.language ||
      user.locale ||
      preferences.lang ||
      null,

    language:
      user.language ||
      preferences.language ||
      user.lang ||
      preferences.lang ||
      null,

    locale:
      user.locale ||
      preferences.locale ||
      user.language ||
      user.lang ||
      null,

    theme:
      user.theme ||
      user.mode ||
      user.appearance ||
      preferences.theme ||
      null,

    mode:
      user.mode ||
      preferences.mode ||
      user.theme ||
      preferences.theme ||
      null,

    appearance:
      user.appearance ||
      preferences.appearance ||
      user.theme ||
      preferences.theme ||
      null,

    tokenVersion:
      user.tokenVersion ??
      user.token_version ??
      user.tv ??
      null,

    clienteId:
      user.clienteId ||
      user.clientId ||
      user.customerId ||
      null,

    active:
      isUserActive(user),
  };
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

function normalizeCliente(cliente = null) {
  if (!isPlainObject(cliente)) {
    return null;
  }

  const clienteId =
    pickFirstText(
      cliente.id,
      cliente.clienteId,
      cliente.clientId,
      cliente.customerId
    );

  return {
    ...cliente,

    id:
      cliente.id ||
      clienteId ||
      null,

    clienteId:
      cliente.clienteId ||
      clienteId ||
      null,

    clientId:
      cliente.clientId ||
      clienteId ||
      null,

    active:
      cliente.active !== false,
  };
}

function normalizeSessionData(session = {}, fallbackUser = {}) {
  const source =
    safeObject(session);

  const sessionId =
    pickFirstText(
      ...SESSION_ID_KEYS.map((key) =>
        source[key]
      )
    );

  const userId =
    pickFirstText(
      source.userId,
      source.user_id,
      source.uid,
      source.sub,
      fallbackUser?.userId,
      fallbackUser?.user_id,
      fallbackUser?.uid,
      fallbackUser?.sub,
      fallbackUser?.id
    );

  const expiresAt =
    pickFirstText(
      ...SESSION_EXPIRES_KEYS.map((key) =>
        source[key]
      )
    );

  const tokenVersion =
    pickFirstValue(
      ...TOKEN_VERSION_KEYS.map((key) =>
        source[key]
      ),
      fallbackUser?.tokenVersion,
      fallbackUser?.token_version,
      fallbackUser?.tv
    );

  if (
    !sessionId &&
    !userId &&
    !expiresAt &&
    tokenVersion === "" &&
    !Object.keys(source).length
  ) {
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

    sid:
      source.sid ||
      sessionId ||
      null,

    userId:
      source.userId ||
      source.user_id ||
      source.uid ||
      userId ||
      null,

    user_id:
      source.user_id ||
      source.userId ||
      source.uid ||
      userId ||
      null,

    sessionUserId:
      source.sessionUserId ||
      source.session_user_id ||
      userId ||
      null,

    session_user_id:
      source.session_user_id ||
      source.sessionUserId ||
      userId ||
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

    tokenVersion:
      tokenVersion !== ""
        ? tokenVersion
        : null,

    tv:
      tokenVersion !== ""
        ? tokenVersion
        : null,
  };
}

function extractAuthFields(raw = {}) {
  const objects =
    collectAuthObjects(raw);

  let token =
    normalizeTokenValue(
      pickTextFromObjects(
        objects,
        AUTH_TOKEN_KEYS
      )
    );

  const refreshToken =
    normalizeTokenValue(
      pickTextFromObjects(
        objects,
        REFRESH_TOKEN_KEYS
      )
    );

  let tempToken =
    normalizeTokenValue(
      pickTextFromObjects(
        objects,
        TEMP_TOKEN_KEYS
      )
    );

  const userRaw =
    pickObjectFromObjects(
      objects,
      USER_KEYS
    );

  const user =
    normalizeUserForClient(userRaw);

  const cliente =
    normalizeCliente(
      pickObjectFromObjects(
        objects,
        CLIENT_KEYS
      )
    );

  const routing =
    pickObjectFromObjects(
      objects,
      ROUTING_KEYS
    );

  const preferences =
    pickObjectFromObjects(
      objects,
      PREFERENCES_KEYS
    );

  const role =
    normalizeRole(
      pickFirstText(
        pickTextFromObjects(objects, ROLE_KEYS),
        user?.role,
        user?.rol,
        "user"
      )
    );

  const permissions =
    unique([
      ...pickArrayFromObjects(objects, PERMISSIONS_KEYS),
      ...safeArray(user?.permissions),
      ...safeArray(user?.permisos),
    ]);

  const status =
    pickFirstValue(
      pickValueFromObjects(
        objects,
        STATUS_KEYS
      )
    );

  const statusKey =
    normalizeStatusKey(status);

  const code =
    pickTextFromObjects(
      objects,
      CODE_KEYS
    );

  const message =
    pickTextFromObjects(
      objects,
      MESSAGE_KEYS
    );

  const redirectTo =
    pickTextFromObjects(
      objects,
      REDIRECT_KEYS
    );

  const sessionObject =
    pickFirstObject(
      pickObjectFromObjects(objects, SESSION_OBJECT_KEYS),
      pickObjectFromObjects(objects, ["session"]),
      pickObjectFromObjects(objects, ["sessionData"]),
      null
    );

  const sessionData =
    normalizeSessionData(
      sessionObject,
      user
    );

  const sessionId =
    pickFirstText(
      sessionData?.sessionId,
      sessionData?.id,
      pickTextFromObjects(objects, [
        "sessionId",
        "session_id",
        "sid",
      ])
    );

  const sessionUserId =
    pickFirstText(
      sessionData?.sessionUserId,
      sessionData?.userId,
      user?.userId,
      user?.id,
      pickTextFromObjects(objects, [
        "sessionUserId",
        "session_user_id",
        "userId",
        "user_id",
        "uid",
        "sub",
      ])
    );

  const tokenVersion =
    pickFirstValue(
      sessionData?.tokenVersion,
      sessionData?.tv,
      user?.tokenVersion,
      pickValueFromObjects(objects, TOKEN_VERSION_KEYS)
    );

  let requires2FA =
    Boolean(tempToken) ||
    pickBoolFromObjects(
      objects,
      TWO_FACTOR_BOOL_KEYS
    ) ||
    TWO_FACTOR_STATUSES.has(statusKey);

  if (
    requires2FA &&
    !tempToken &&
    token &&
    !hasUsableUser(user)
  ) {
    tempToken =
      token;

    token =
      "";
  }

  if (requires2FA) {
    token =
      "";
  }

  const statusNumber =
    Number(status || 0);

  const codeUpper =
    safeText(code, "")
      .toUpperCase();

  const hasStatusFailure =
    Number.isFinite(statusNumber) &&
    statusNumber >= 400;

  const hasCodeFailure =
    Boolean(
      codeUpper &&
      AUTH_FAILURE_CODES.has(codeUpper)
    );

  const hasFailureStatus =
    Boolean(
      statusKey &&
      AUTH_FAILURE_STATUSES.has(statusKey)
    );

  const hasBooleanFailure =
    objects.some((object) => {
      return (
        object?.ok === false ||
        object?.success === false ||
        (object?.authenticated === false && !requires2FA)
      );
    });

  const explicitFailure =
    !requires2FA &&
    Boolean(
      hasStatusFailure ||
        hasCodeFailure ||
        hasFailureStatus ||
        hasBooleanFailure
    );

  const authenticated =
    !explicitFailure &&
    !requires2FA &&
    hasUsableToken(token) &&
    hasUsableUser(user);

  return {
    token,
    refreshToken,
    tempToken,
    user:
      user || null,
    cliente,
    routing:
      routing || null,
    preferences:
      preferences || null,
    role,
    permissions,
    status,
    statusKey,
    code,
    message,
    redirectTo,
    sessionData,
    sessionId,
    sessionUserId,
    tokenVersion,
    requires2FA,
    explicitFailure,
    authenticated,
  };
}

function normalizeAuthPayload({
  response,
  validated,
  validationError = null,
} = {}) {
  const responseObject =
    safeObject(response);

  const validatedObject =
    safeObject(validated);

  const merged = {
    ...responseObject,
    ...validatedObject,

    data: {
      ...safeObject(responseObject.data),
      ...safeObject(validatedObject.data),
    },

    payload: {
      ...safeObject(responseObject.payload),
      ...safeObject(validatedObject.payload),
    },

    result: {
      ...safeObject(responseObject.result),
      ...safeObject(validatedObject.result),
    },

    session: {
      ...safeObject(responseObject.session),
      ...safeObject(validatedObject.session),
    },

    sessionData: {
      ...safeObject(responseObject.sessionData),
      ...safeObject(validatedObject.sessionData),
    },

    auth: {
      ...safeObject(responseObject.auth),
      ...safeObject(validatedObject.auth),
    },
  };

  const fields =
    extractAuthFields(merged);

  const ok =
    fields.explicitFailure
      ? false
      : fields.authenticated ||
        fields.requires2FA;

  return {
    raw:
      response,

    validated:
      validated || null,

    validationError,

    ok,

    success:
      ok,

    explicitFailure:
      fields.explicitFailure,

    authenticated:
      fields.authenticated,

    status:
      safeText(
        fields.status,
        fields.explicitFailure
          ? "auth_failed"
          : fields.requires2FA
            ? "2fa_required"
            : fields.authenticated
              ? "authenticated"
              : ""
      ),

    statusKey:
      fields.statusKey,

    code:
      safeText(fields.code, ""),

    message:
      safeText(fields.message, ""),

    token:
      fields.token,

    accessToken:
      fields.token,

    access_token:
      fields.token,

    refreshToken:
      fields.refreshToken,

    refresh_token:
      fields.refreshToken,

    tempToken:
      fields.tempToken,

    temp_token:
      fields.tempToken,

    user:
      fields.user,

    usuario:
      fields.user,

    cliente:
      fields.cliente,

    client:
      fields.cliente,

    routing:
      fields.routing,

    preferences:
      fields.preferences,

    role:
      safeText(fields.role, "user"),

    rol:
      safeText(fields.role, "user"),

    permissions:
      fields.permissions,

    permisos:
      fields.permissions,

    sessionData:
      fields.sessionData,

    session:
      fields.sessionData,

    sessionId:
      fields.sessionId,

    sessionUserId:
      fields.sessionUserId,

    tokenVersion:
      fields.tokenVersion,

    requires2FA:
      fields.requires2FA,

    redirectTo:
      normalizeRedirectCandidate(fields.redirectTo),
  };
}

function createAuthError(
  message = "No se pudo iniciar sesión.",
  {
    status = 401,
    code = "INVALID_LOGIN_SESSION",
    raw = null,
  } = {}
) {
  const error =
    new Error(message);

  error.name =
    "AuthLoginError";

  error.status =
    status;

  error.statusCode =
    status;

  error.code =
    code;

  error.data = {
    code,
    message,
    status,
  };

  try {
    Object.defineProperty(
      error,
      "raw",
      {
        value:
          raw,
        enumerable:
          false,
        configurable:
          true,
      }
    );
  } catch {
    error.raw =
      raw;
  }

  return error;
}

function normalizeThrownLoginError(error) {
  if (
    error &&
    error.name === "AuthLoginError"
  ) {
    return error;
  }

  const status =
    safeNumber(
      error?.status ||
        error?.statusCode ||
        error?.response?.status ||
        error?.data?.status,
      0
    );

  const timeout =
    error?.timeout === true ||
    String(error?.name || "")
      .toLowerCase()
      .includes("timeout") ||
    String(error?.code || "")
      .toLowerCase()
      .includes("timeout");

  const aborted =
    !timeout &&
    (
      error?.aborted === true ||
      String(error?.name || "") === "AbortError"
    );

  const code =
    safeText(
      error?.code ||
        error?.data?.code ||
        error?.response?.data?.code ||
        "",
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

  const message =
    timeout
      ? "El inicio de sesión ha tardado demasiado."
      : aborted
        ? "El inicio de sesión fue cancelado."
        : extractMessage(error) ||
          error?.response?.data?.message ||
          error?.data?.message ||
          "No se pudo iniciar sesión.";

  return createAuthError(
    message,
    {
      status:
        status || (timeout ? 408 : 500),
      code,
      raw:
        error,
    }
  );
}

function assertValidAuthenticatedPayload(authData = {}) {
  if (
    authData.explicitFailure ||
    authData.ok === false
  ) {
    throw createAuthError(
      authData.message ||
        "Credenciales incorrectas.",
      {
        status:
          Number(authData.status) || 401,
        code:
          authData.code ||
          "INVALID_CREDENTIALS",
        raw:
          authData.raw,
      }
    );
  }

  if (!hasUsableToken(authData.token)) {
    throw createAuthError(
      "El login no devolvió token de autenticación.",
      {
        status:
          401,
        code:
          "INVALID_LOGIN_SESSION",
        raw:
          authData.raw,
      }
    );
  }

  if (!hasUsableUser(authData.user)) {
    throw createAuthError(
      "El login no devolvió un usuario válido.",
      {
        status:
          401,
        code:
          "INVALID_LOGIN_SESSION",
        raw:
          authData.raw,
      }
    );
  }

  if (
    !authData.sessionData?.sessionId &&
    !authData.sessionId
  ) {
    safeWarn(
      "Login autenticado sin sessionId explícito. Refresh dependerá de fallback session/user."
    );
  }

  return true;
}

/* =========================================================
   SESSION CLEANUP
========================================================= */

function clearKnownAuthStorage() {
  if (!isBrowser()) {
    return false;
  }

  for (const key of KNOWN_AUTH_STORAGE_KEYS) {
    try {
      window.localStorage?.removeItem?.(key);
    } catch {}

    try {
      window.sessionStorage?.removeItem?.(key);
    } catch {}
  }

  return true;
}

function clearTempTokenSafe() {
  try {
    persistTempToken(null);
  } catch {}

  try {
    persistTempToken("");
  } catch {}

  if (!isBrowser()) {
    return true;
  }

  for (const key of [
    "onion_temp_token",
    "onion_temporary_token",
    "onion_two_factor_token",
    "onion_mfa_token",
    "onion_otp_token",
    "onion:tempToken",
    "onion:temp_token",
    "onion:temporaryToken",
    "onion:temporary_token",
    "onion:twoFactorToken",
    "onion:two_factor_token",
    "onion:mfaToken",
    "onion:mfa_token",
    "onion:otpToken",
    "onion:otp_token",
    "temp_token",
    "temporary_token",
    "two_factor_token",
    "mfa_token",
    "otp_token",
  ]) {
    try {
      window.localStorage?.removeItem?.(key);
    } catch {}

    try {
      window.sessionStorage?.removeItem?.(key);
    } catch {}
  }

  return true;
}

function clearAuthRuntimeState(reason = "login_cleanup", options = {}) {
  const emitCleared =
    options.emitCleared === true;

  try {
    clearSessionLocal({
      silent:
        true,
      reason,
      source:
        LOGIN_SOURCE,
      preserveCurrentRoute:
        true,
      preserveRoute:
        true,
      preserveInitialUrl:
        true,
      skipNavigation:
        true,
      skipNavigate:
        true,
      skipRedirect:
        true,
      noRedirect:
        true,
      skipPostRestoreNavigation:
        true,
      route:
        getState().route ||
        getBrowserCanonicalPath(),
      publicPath:
        getState().publicPath ||
        getBrowserPath(),
    });
  } catch {
    try {
      clearSessionLocal({
        silent:
          true,
        source:
          `${LOGIN_SOURCE}:fallback`,
        skipNavigation:
          true,
        skipNavigate:
          true,
        skipRedirect:
          true,
        noRedirect:
          true,
      });
    } catch {}
  }

  safeSetState(
    {
      authenticated:
        false,
      hasToken:
        false,

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
        null,
      rol:
        null,
      userRole:
        null,
      roles:
        [],

      permissions:
        [],
      permisos:
        [],

      token:
        null,
      accessToken:
        null,
      access_token:
        null,
      refreshToken:
        null,
      refresh_token:
        null,

      session:
        null,
      sessionData:
        null,
      sessionId:
        null,
      sessionUserId:
        null,

      cliente:
        null,
      client:
        null,
      clienteId:
        null,

      currentResolvedUsername:
        null,
      resolvedUsername:
        null,

      twoFactorPending:
        false,
      twoFactorUser:
        null,
      tempToken:
        null,
      temp_token:
        null,

      loginInProgress:
        false,
    },
    {
      forceUnauthenticated:
        true,
      emit:
        false,
      silent:
        true,
    }
  );

  clearKnownAuthStorage();

  if (emitCleared) {
    safeEmit(
      "auth:login:auth-state-cleared",
      {
        reason,
      }
    );
  }

  return true;
}

function markLoginInProgress(value = false) {
  safeSetState({
    loginInProgress:
      Boolean(value),
  });

  return Boolean(value);
}

/* =========================================================
   SESSION APPLY
========================================================= */

function enforceAuthenticatedCoreState(snapshot = {}) {
  const user =
    normalizeUserForClient(
      snapshot.user ||
      snapshot.usuario ||
      null
    );

  const token =
    normalizeTokenValue(
      snapshot.token ||
        snapshot.accessToken ||
        snapshot.access_token ||
        ""
    );

  const refreshToken =
    normalizeTokenValue(
      snapshot.refreshToken ||
        snapshot.refresh_token ||
        ""
    );

  const role =
    normalizeRole(
      snapshot.role ||
        snapshot.rol ||
        user?.role ||
        user?.rol ||
        "user"
    );

  const cliente =
    normalizeCliente(
      snapshot.cliente ||
      snapshot.client ||
      null
    );

  const routing =
    safeObject(
      snapshot.routing ||
        user?.routing ||
        {}
    );

  const permissions =
    unique([
      ...safeArray(snapshot.permissions),
      ...safeArray(snapshot.permisos),
      ...safeArray(user?.permissions),
      ...safeArray(user?.permisos),
    ]);

  const session =
    normalizeSessionData(
      snapshot.session ||
        snapshot.sessionData ||
        snapshot.auth?.session ||
        snapshot.data?.session ||
        {},
      user
    ) ||
    null;

  const sessionId =
    session?.sessionId ||
    snapshot.sessionId ||
    snapshot.session_id ||
    null;

  const sessionUserId =
    session?.sessionUserId ||
    session?.userId ||
    snapshot.sessionUserId ||
    snapshot.session_user_id ||
    user?.userId ||
    user?.id ||
    null;

  const tokenVersion =
    snapshot.tokenVersion ??
    snapshot.tv ??
    session?.tokenVersion ??
    user?.tokenVersion ??
    null;

  const roles =
    safeArray(user?.roles).length
      ? safeArray(user.roles)
      : [role].filter(Boolean);

  const sessionAlias = {
    ...safeObject(session),

    sessionId,
    session_id:
      sessionId,
    sid:
      sessionId,

    userId:
      sessionUserId,
    user_id:
      sessionUserId,
    sessionUserId,
    session_user_id:
      sessionUserId,

    user,
    usuario:
      user,

    role,
    rol:
      role,
    roles,

    permissions,
    permisos:
      permissions,

    token,
    accessToken:
      token,
    access_token:
      token,

    refreshToken:
      refreshToken || null,
    refresh_token:
      refreshToken || null,

    tokenVersion,
    tv:
      tokenVersion,

    authenticated:
      true,

    source:
      LOGIN_SOURCE,
  };

  safeSetState(
    {
      authenticated:
        true,
      hasToken:
        true,

      user,
      currentUser:
        user,
      authUser:
        user,
      sessionUser:
        user,
      account:
        user,
      profile:
        user,

      role,
      rol:
        role,
      userRole:
        role,
      roles,

      permissions,
      permisos:
        permissions,

      token,
      accessToken:
        token,
      access_token:
        token,

      refreshToken:
        refreshToken || null,
      refresh_token:
        refreshToken || null,

      tokenVersion,
      tv:
        tokenVersion,

      twoFactorPending:
        false,
      twoFactorUser:
        null,
      tempToken:
        null,
      temp_token:
        null,

      session:
        sessionAlias,
      sessionData:
        sessionAlias,

      sessionId,
      sessionUserId,

      cliente,
      client:
        cliente,
      clienteId:
        user?.clienteId ||
        user?.clientId ||
        cliente?.clienteId ||
        cliente?.clientId ||
        null,

      routing,

      currentResolvedUsername:
        user?.slug ||
        user?.usernameLower ||
        user?.username ||
        null,

      resolvedUsername:
        user?.slug ||
        user?.usernameLower ||
        user?.username ||
        null,

      lastLoginAt:
        isoNow(),

      lastAuthSource:
        "login",
    },
    {
      forceUnauthenticated:
        false,
      allowExplicitAuthenticated:
        true,
      emit:
        false,
      silent:
        true,
    }
  );

  return {
    user,
    token,
    refreshToken,
    role,
    roles,
    permissions,
    cliente,
    routing,
    session:
      sessionAlias,
    sessionId,
    sessionUserId,
    tokenVersion,
  };
}

function verifyCoreSession(token = "", user = null) {
  const state =
    getState();

  const currentToken =
    normalizeTokenValue(
      state.token ||
        state.accessToken ||
        state.access_token ||
        state.session?.token ||
        state.session?.accessToken ||
        state.session?.access_token ||
        ""
    );

  const currentUser =
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    state.session?.user ||
    null;

  const currentIdentity =
    pickFirstText(
      currentUser?.userId,
      currentUser?.user_id,
      currentUser?.id,
      currentUser?.uid,
      currentUser?.sub,
      currentUser?.email,
      currentUser?.username
    );

  const nextIdentity =
    pickFirstText(
      user?.userId,
      user?.user_id,
      user?.id,
      user?.uid,
      user?.sub,
      user?.email,
      user?.username
    );

  return Boolean(
    state.authenticated === true &&
      hasUsableToken(currentToken) &&
      currentToken === normalizeTokenValue(token) &&
      currentIdentity &&
      nextIdentity &&
      currentIdentity === nextIdentity
  );
}

function applyAuthenticatedSession(authData = {}) {
  const sessionData =
    normalizeSessionData(
      authData.sessionData ||
        authData.session ||
        {},
      authData.user
    ) ||
    null;

  const token =
    normalizeTokenValue(authData.token);

  const payload = {
    token,
    accessToken:
      token,
    access_token:
      token,

    user:
      authData.user,
    usuario:
      authData.user,
    me:
      authData.user,
    account:
      authData.user,
    profile:
      authData.user,

    cliente:
      authData.cliente,
    client:
      authData.cliente,

    routing:
      authData.routing ||
      {},

    preferences:
      authData.preferences ||
      authData.user?.preferences ||
      {},

    role:
      authData.role ||
      authData.user?.role ||
      "user",
    rol:
      authData.role ||
      authData.user?.role ||
      "user",

    permissions:
      authData.permissions ||
      authData.user?.permissions ||
      [],

    permisos:
      authData.permissions ||
      authData.user?.permisos ||
      [],

    refreshToken:
      authData.refreshToken ||
      null,
    refresh_token:
      authData.refreshToken ||
      null,

    tokenVersion:
      authData.tokenVersion ??
      authData.user?.tokenVersion ??
      sessionData?.tokenVersion ??
      null,

    tv:
      authData.tokenVersion ??
      authData.user?.tokenVersion ??
      sessionData?.tokenVersion ??
      null,

    session:
      sessionData,
    sessionData,

    sessionId:
      sessionData?.sessionId ||
      authData.sessionId ||
      null,

    session_id:
      sessionData?.sessionId ||
      authData.sessionId ||
      null,

    sessionUserId:
      sessionData?.sessionUserId ||
      sessionData?.userId ||
      authData.sessionUserId ||
      authData.user?.userId ||
      authData.user?.id ||
      null,

    session_user_id:
      sessionData?.sessionUserId ||
      sessionData?.userId ||
      authData.sessionUserId ||
      authData.user?.userId ||
      authData.user?.id ||
      null,

    authenticated:
      true,
    ok:
      true,
    success:
      true,
    source:
      LOGIN_SOURCE,
    eventMode:
      "login",

    silent:
      true,

    data: {
      token,
      accessToken:
        token,
      access_token:
        token,
      refreshToken:
        authData.refreshToken ||
        null,
      refresh_token:
        authData.refreshToken ||
        null,
      user:
        authData.user,
      usuario:
        authData.user,
      cliente:
        authData.cliente,
      client:
        authData.cliente,
      session:
        sessionData,
      sessionData,
      routing:
        authData.routing ||
        {},
      authenticated:
        true,
    },

    auth: {
      token,
      accessToken:
        token,
      access_token:
        token,
      refreshToken:
        authData.refreshToken ||
        null,
      refresh_token:
        authData.refreshToken ||
        null,
      user:
        authData.user,
      usuario:
        authData.user,
      session:
        sessionData,
      sessionData,
      authenticated:
        true,
    },
  };

  let snapshot =
    null;

  try {
    snapshot =
      applySession(
        payload,
        {
          source:
            LOGIN_SOURCE,
          emit:
            false,
          emitState:
            false,
          silent:
            true,
          allowExplicitAuthenticated:
            true,
        }
      );
  } catch (error) {
    safeWarn(
      "applySession falló.",
      error
    );
  }

  if (
    !snapshot ||
    typeof snapshot !== "object"
  ) {
    snapshot = {
      ...payload,
    };
  }

  snapshot.token =
    normalizeTokenValue(
      snapshot.token ||
        snapshot.accessToken ||
        token
    );

  snapshot.accessToken =
    snapshot.accessToken ||
    snapshot.token;

  snapshot.refreshToken =
    normalizeTokenValue(
      snapshot.refreshToken ||
        snapshot.refresh_token ||
        authData.refreshToken ||
        ""
    );

  snapshot.user =
    normalizeUserForClient(
      snapshot.user ||
      authData.user
    );

  snapshot.role =
    normalizeRole(
      snapshot.role ||
        authData.role ||
        snapshot.user?.role ||
        snapshot.user?.rol ||
        "user"
    );

  snapshot.permissions =
    unique([
      ...safeArray(snapshot.permissions),
      ...safeArray(snapshot.permisos),
      ...safeArray(authData.permissions),
    ]);

  snapshot.session =
    normalizeSessionData(
      snapshot.session ||
        snapshot.sessionData ||
        sessionData,
      snapshot.user
    ) ||
    sessionData;

  snapshot.sessionData =
    snapshot.session;

  snapshot.cliente =
    normalizeCliente(
      snapshot.cliente ||
        snapshot.client ||
        authData.cliente
    );

  snapshot.client =
    snapshot.cliente;

  snapshot.routing =
    snapshot.routing ||
    authData.routing ||
    {};

  snapshot.tokenVersion =
    snapshot.tokenVersion ??
    authData.tokenVersion ??
    snapshot.session?.tokenVersion ??
    snapshot.user?.tokenVersion ??
    null;

  const enforced =
    enforceAuthenticatedCoreState(snapshot);

  if (
    !verifyCoreSession(
      enforced.token,
      enforced.user
    )
  ) {
    enforceAuthenticatedCoreState({
      ...snapshot,
      ...enforced,
    });
  }

  return {
    ...snapshot,
    ...enforced,
  };
}

/* =========================================================
   CORE LOGIN
========================================================= */

async function executeLogin(credentials = {}, sequence = 0, options = {}) {
  const normalizedCredentials =
    normalizeLoginPayload(credentials);

  if (
    !normalizedCredentials.identifier ||
    !normalizedCredentials.password
  ) {
    throw createAuthError(
      "Usuario/email y contraseña son obligatorios.",
      {
        status:
          400,
        code:
          "MISSING_CREDENTIALS",
      }
    );
  }

  const endpoint =
    resolveLoginEndpoint();

  safeSetError(null);
  markLoginInProgress(true);

  safeEmit(
    "auth:login:request:start",
    {
      identifier:
        normalizedCredentials.identifier,
      endpoint,
      sequence,
    }
  );

  const response =
    await apiPost(
      endpoint,
      buildLoginRequestBody(credentials),
      {
        ...safeObject(options),

        silent:
          options.silentRequest === true,

        useLoader:
          options.useLoader !== false,

        timeout:
          options.timeout ||
          options.timeoutMs ||
          options.loginTimeoutMs ||
          resolveLoginTimeout(options),
      }
    );

  const validation =
    validateAuthResponseSoft(response);

  const authData =
    normalizeAuthPayload({
      response,
      validated:
        validation.value,
      validationError:
        validation.error,
    });

  safeEmit(
    "auth:login:request:complete",
    {
      sequence,
      status:
        authData.status,
      authenticated:
        authData.authenticated,
      requires2FA:
        authData.requires2FA,
      explicitFailure:
        authData.explicitFailure,
      hasUser:
        hasUsableUser(authData.user),
      hasToken:
        hasUsableToken(authData.token),
      hasRefreshToken:
        Boolean(authData.refreshToken),
      hasSession:
        Boolean(
          authData.sessionData?.sessionId ||
            authData.sessionId
        ),
      tokenVersion:
        authData.tokenVersion ?? null,
      validationOk:
        validation.ok,
    }
  );

  if (
    authData.explicitFailure ||
    authData.ok === false
  ) {
    throw createAuthError(
      authData.message ||
        "Credenciales incorrectas.",
      {
        status:
          Number(authData.status) || 401,
        code:
          authData.code ||
          "INVALID_CREDENTIALS",
        raw:
          response,
      }
    );
  }

  /* =====================================================
     2FA
  ===================================================== */

  if (authData.requires2FA) {
    if (!authData.tempToken) {
      throw createAuthError(
        "Se requiere 2FA pero no se recibió token temporal.",
        {
          status:
            401,
          code:
            "MISSING_2FA_TEMP_TOKEN",
          raw:
            response,
        }
      );
    }

    try {
      persistTempToken(authData.tempToken);
    } catch {}

    const twoFactorUser =
      normalizeUserForClient(
        authData.user || null
      );

    safeSetState(
      {
        authenticated:
          false,
        hasToken:
          false,

        token:
          null,
        accessToken:
          null,
        access_token:
          null,
        refreshToken:
          null,
        refresh_token:
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
          null,
        rol:
          null,
        userRole:
          null,

        roles:
          [],

        permissions:
          [],
        permisos:
          [],

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

        twoFactorPending:
          true,
        twoFactorUser,
        tempToken:
          authData.tempToken,
        temp_token:
          authData.tempToken,
      },
      {
        forceUnauthenticated:
          true,
        emit:
          false,
        silent:
          true,
      }
    );

    setTwoFactorDomState(
      "login-2fa-required"
    );

    const redirectTo =
      normalizeRedirectCandidate(authData.redirectTo) ||
      DEFAULT_2FA_PATH;

    const result = {
      ok:
        true,
      success:
        true,
      status:
        "2fa_required",
      requires2FA:
        true,
      authenticated:
        false,
      tempToken:
        authData.tempToken,
      user:
        twoFactorUser,
      redirectTo,
      response,
      navigation:
        null,
    };

    safeEmit(
      "auth:login:2fa-required",
      {
        status:
          result.status,
        requires2FA:
          true,
        authenticated:
          false,
        redirectTo:
          result.redirectTo,
        hasUser:
          Boolean(twoFactorUser),
        sequence,
      }
    );

    if (shouldNavigateAfterLogin(options)) {
      result.navigation =
        await safeNavigate(
          result.redirectTo,
          {
            replaceState:
              true,
            force:
              options.forceNavigate === true,
            reason:
              "login-2fa",
            timeout:
              options.timeout,
            timeoutMs:
              options.timeoutMs,
          }
        );
    }

    return result;
  }

  /* =====================================================
     STRICT NORMAL LOGIN
  ===================================================== */

  assertValidAuthenticatedPayload(authData);
  clearTempTokenSafe();

  const snapshot =
    applyAuthenticatedSession(authData);

  if (
    !snapshot?.token ||
    !hasUsableToken(snapshot.token) ||
    !hasUsableUser(snapshot.user)
  ) {
    clearAuthRuntimeState(
      "invalid_snapshot_after_apply_session",
      {
        emitCleared:
          true,
      }
    );

    throw createAuthError(
      "El login devolvió sesión inválida.",
      {
        status:
          401,
        code:
          "INVALID_LOGIN_SESSION",
        raw:
          response,
      }
    );
  }

  const authLoginControlsNavigation =
    shouldNavigateAfterLogin(options);

  if (authLoginControlsNavigation) {
    clearAuthScreenDomState(
      "login-session-applied"
    );
  } else {
    setDocumentAuthFlags({
      authenticated:
        true,
      loading:
        false,
      ready:
        true,
    });
  }

  emitLoginSessionCommitted(
    "login-session-applied",
    {
      sequence,
    }
  );

  safeSyncUserUI(
    "login-session-applied"
  );

  await wait(0);

  const trustedAuthRedirect =
    options.trustAuthRedirect === true &&
    authData.redirectTo &&
    !isRouteDefaultRedirect(authData.redirectTo)
      ? normalizeRedirectCandidate(authData.redirectTo)
      : "";

  const targetOptions = {
    ...safeObject(options),
  };

  if (
    trustedAuthRedirect &&
    !targetOptions.redirectTo &&
    !targetOptions.redirect &&
    !targetOptions.target &&
    !targetOptions.next &&
    !targetOptions.returnTo
  ) {
    targetOptions.redirectTo =
      trustedAuthRedirect;
  }

  const redirectTo =
    getPostLoginTarget(
      snapshot.user,
      targetOptions
    );

  const result = {
    ok:
      true,
    success:
      true,
    status:
      "authenticated",
    authenticated:
      true,
    requires2FA:
      false,

    token:
      snapshot.token,
    accessToken:
      snapshot.token,

    refreshToken:
      snapshot.refreshToken ||
      authData.refreshToken ||
      "",

    user:
      snapshot.user,

    role:
      snapshot.role ||
      authData.role ||
      "user",

    permissions:
      snapshot.permissions ||
      authData.permissions ||
      [],

    cliente:
      snapshot.cliente ||
      authData.cliente ||
      null,

    client:
      snapshot.cliente ||
      authData.cliente ||
      null,

    routing:
      snapshot.routing ||
      authData.routing ||
      {},

    session:
      snapshot.session ||
      authData.sessionData ||
      null,

    sessionData:
      snapshot.sessionData ||
      snapshot.session ||
      authData.sessionData ||
      null,

    sessionId:
      snapshot.session?.sessionId ||
      snapshot.sessionData?.sessionId ||
      authData.sessionId ||
      null,

    sessionUserId:
      snapshot.session?.sessionUserId ||
      snapshot.sessionData?.sessionUserId ||
      authData.sessionUserId ||
      null,

    tokenVersion:
      snapshot.tokenVersion ??
      authData.tokenVersion ??
      null,

    redirectTo,
    response,
    navigation:
      null,
  };

  if (options.emitLoginSuccessEvent === true) {
    safeEmit(
      "auth:login:success",
      {
        status:
          result.status,
        authenticated:
          true,
        requires2FA:
          false,
        user:
          result.user,
        role:
          result.role,
        redirectTo,
        sessionId:
          result.sessionId,
        tokenVersion:
          result.tokenVersion,
        sequence,
      }
    );
  }

  if (authLoginControlsNavigation) {
    result.navigation =
      await safeNavigate(
        redirectTo,
        {
          replaceState:
            true,
          force:
            options.forceNavigate !== false,
          reason:
            "login-success",
          timeout:
            options.timeout,
          timeoutMs:
            options.timeoutMs,
          hardFallbackOnStaleLogin:
            options.hardFallbackOnStaleLogin !== false,
        }
      );

    clearAuthScreenDomState(
      "login-success-after-navigation"
    );
  }

  safeSyncUserUI(
    authLoginControlsNavigation
      ? "login-success-after-navigation"
      : "login-success-session-only"
  );

  afterPaint(() => {
    if (authLoginControlsNavigation) {
      clearAuthScreenDomState(
        "login-success-after-paint"
      );
    }

    safeSyncUserUI(
      "login-success-after-paint"
    );
  });

  safeLog(
    "login success",
    {
      sequence,
      redirectTo:
        redactSafe(redirectTo),
      hasUser:
        Boolean(result.user),
      hasSession:
        Boolean(result.sessionId),
      hasRefreshToken:
        Boolean(result.refreshToken),
      tokenVersion:
        result.tokenVersion ?? null,
      navigationControlledByAuth:
        authLoginControlsNavigation,
    }
  );

  return result;
}

/* =========================================================
   PUBLIC LOGIN
========================================================= */

export async function login(credentials = {}, options = {}) {
  const fingerprint =
    buildLoginFingerprint(credentials);

  if (loginPromise) {
    if (
      !loginFingerprint ||
      loginFingerprint === fingerprint
    ) {
      return loginPromise;
    }

    throw createAuthError(
      "Ya hay un inicio de sesión en curso.",
      {
        status:
          409,
        code:
          "LOGIN_ALREADY_IN_PROGRESS",
      }
    );
  }

  const sequence =
    ++loginSequence;

  loginFingerprint =
    fingerprint;

  loginPromise =
    (async () => {
      try {
        safeEmit(
          "auth:login:start",
          {
            sequence,
            identifier:
              resolveLoginIdentifier(credentials),
          }
        );

        clearAuthRuntimeState(
          "before_login",
          {
            emitCleared:
              false,
          }
        );

        markLoginInProgress(true);

        return await executeLogin(
          credentials,
          sequence,
          options
        );
      } catch (error) {
        const normalizedError =
          normalizeThrownLoginError(error);

        clearAuthRuntimeState(
          "login_failed",
          {
            emitCleared:
              true,
            callCoreClear:
              false,
            callSessionClear:
              false,
          }
        );

        safeSetError(normalizedError);

        safeEmit(
          "auth:login:error",
          {
            sequence,
            error: {
              name:
                normalizedError?.name || "Error",
              message:
                extractMessage(normalizedError),
              status:
                normalizedError?.status || 0,
              code:
                normalizedError?.code ||
                normalizedError?.data?.code ||
                null,
            },
            message:
              extractMessage(normalizedError),
          }
        );

        throw normalizedError;
      } finally {
        markLoginInProgress(false);

        loginPromise =
          null;

        loginFingerprint =
          "";
      }
    })();

  return loginPromise;
}

/* =========================================================
   FORM SUBMIT
========================================================= */

export async function handleLoginFormSubmit(formElement, options = {}) {
  const HTMLForm =
    isBrowser()
      ? window.HTMLFormElement
      : null;

  if (
    !HTMLForm ||
    !(formElement instanceof HTMLForm)
  ) {
    throw new Error(
      "Se esperaba un formulario HTML válido."
    );
  }

  try {
    options.event?.preventDefault?.();
  } catch {}

  const formData =
    new FormData(formElement);

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

    password:
      formData.get("password") ||
      "",

    remember:
      formData.get("remember") === "on" ||
      formData.get("remember") === "true" ||
      formData.get("remember") === "1",
  };

  const result =
    await login(
      credentials,
      options
    );

  if (
    safeBool(options.resetOnSuccess, false) &&
    result?.status === "authenticated"
  ) {
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
  const state =
    getState();

  const user =
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    null;

  return {
    version:
      LOGIN_VERSION,

    loginInFlight:
      Boolean(loginPromise),

    loginSequence,

    endpoint:
      resolveLoginEndpoint(),

    apiBase:
      resolveApiBase(),

    finalEndpointUrl:
      redactSafe(
        resolveApiUrl(
          resolveLoginEndpoint()
        )
      ),

    publicRequestPolicy: {
      auth:
        false,
      public:
        true,
      skipAuth:
        true,
      noAuthHeader:
        true,
      skipAuthRefresh:
        true,
      noAutoRefresh:
        true,
      noAutoLogout:
        true,
      retry:
        false,
      retries:
        0,
    },

    loginTimeoutMs:
      resolveLoginTimeout(),

    loginRoute:
      getLoginRoute(),

    homeRoute:
      getHomeRoute(),

    currentPath:
      redactSafe(getBrowserPath()),

    currentCanonicalPath:
      redactSafe(getBrowserCanonicalPath()),

    hasApiClient:
      Boolean(getApiClient()),

    hasNativeFetch:
      Boolean(
        typeof fetch === "function"
      ),

    authenticated:
      Boolean(state.authenticated),

    hasToken:
      Boolean(
        state.token ||
        state.accessToken ||
        state.access_token
      ),

    token:
      null,

    accessToken:
      null,

    refreshToken:
      null,

    hasRefreshToken:
      Boolean(
        state.refreshToken ||
        state.refresh_token ||
        state.session?.refreshToken ||
        state.sessionData?.refreshToken
      ),

    hasUser:
      hasUsableUser(user),

    userId:
      user?.userId ||
      user?.id ||
      null,

    role:
      state.role ||
      user?.role ||
      null,

    permissions:
      safeArray(
        state.permissions ||
          user?.permissions
      ),

    hasSession:
      Boolean(
        state.session?.sessionId ||
        state.sessionData?.sessionId ||
        state.sessionId
      ),

    sessionId:
      state.session?.sessionId ||
      state.sessionData?.sessionId ||
      state.sessionId ||
      null,

    sessionUserId:
      state.session?.sessionUserId ||
      state.sessionData?.sessionUserId ||
      state.sessionUserId ||
      null,

    tokenVersion:
      state.tokenVersion ??
      state.session?.tokenVersion ??
      state.sessionData?.tokenVersion ??
      user?.tokenVersion ??
      null,

    hasCliente:
      Boolean(
        state.cliente ||
          state.client ||
          user?.clienteId ||
          user?.clientId
      ),

    loginInProgress:
      Boolean(state.loginInProgress),

    twoFactorPending:
      Boolean(state.twoFactorPending),

    navigationRespectsSkipFlags:
      true,

    noHistoryFallback:
      true,

    at:
      isoNow(),
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
