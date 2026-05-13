/* =========================================================
   Onion SPA - Auth Login
   Archivo: src/features/auth/login.js

   EXTREME PRO SYSTEM · AUTH LOGIN · GOD MODE v13
   NO CSS · NO INLINE STYLE · NO AUTH FANTASMA · NO EVENT DUPLICATION

   RESPONSABILIDADES:
   - preparar credenciales login
   - construir payload robusto para backend heterogéneo
   - ejecutar login contra API pública
   - soportar backend Onion Auth:
       · token / accessToken / access_token
       · refreshToken / refresh_token
       · session / sessionData
       · sessionId / session_id
       · userId / user_id
       · user / usuario / me / account / profile
       · data / payload / result / body / response / auth
   - soportar 2FA sin marcar authenticated
   - aplicar sesión sólo con token + user válidos
   - preservar sessionId/userId/expiresAt para refresh
   - navegación SPA consistente tras login real
   - submit desde formularios HTML
   - mutex real contra login concurrente
   - limpiar sesión previa antes de login
   - evitar usuario/token antiguos como fallback
   - no emitir eventos de restore desde login
   - no duplicar auth:login:success por defecto
   - limpiar auth-screen tras login real
   - reparar sidebar/topbar vía eventos de UI, sin CSS ni estilos inline
   - blindar logs/eventos contra tokens, passwords y URLs sensibles
   - fallback fetch si AppCore apiClient no está disponible

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
  normalizePath,
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

const LOGIN_VERSION =
  "13.0.0";

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

const DEFAULT_HOME_PATH =
  "/";

const DEFAULT_LOGIN_PATH =
  "/login";

const DEFAULT_2FA_PATH =
  "/2fa";

const DEFAULT_LOGIN_TIMEOUT_MS =
  30_000;

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

const KNOWN_AUTH_STORAGE_KEYS =
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
    "session",
    "sessionData",
    "auth",
    "authData",
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
    "account",
    "profile",
    "me",
    "currentUser",
    "current_user",
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

const STATUS_KEYS =
  Object.freeze([
    "status",
    "statusCode",
    "status_code",
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
  ]);

const REDIRECT_KEYS =
  Object.freeze([
    "redirectTo",
    "redirect_to",
    "redirect",
    "next",
    "nextPath",
    "next_path",
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
  ]);

const TWO_FACTOR_BOOL_KEYS =
  Object.freeze([
    "requires2FA",
    "requires_2fa",
    "require2FA",
    "require_2fa",
    "requiresTwoFactor",
    "twoFactorRequired",
    "mfaRequired",
    "mfa_required",
    "requiresMfa",
    "requires_mfa",
  ]);

const TWO_FACTOR_STATUSES =
  new Set([
    "2fa_required",
    "mfa_required",
    "two_factor_required",
    "totp_required",
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

function hasOwn(object, key) {
  try {
    return Object.prototype.hasOwnProperty.call(
      object,
      key
    );
  } catch {
    return false;
  }
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .flat(Infinity)
        .map((value) =>
          safeText(value, "")
        )
        .filter(Boolean)
    )
  );
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
        Math.max(
          0,
          safeNumber(ms, 0)
        )
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
      options
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

function redactSafe(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(
        /([?&](?:token|activationToken|activateToken|resetToken|passwordResetToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
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
    const [local = "", domain = ""] =
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

  if (output.user && isPlainObject(output.user)) {
    output.user = {
      ...output.user,
      password:
        undefined,
      passwordHash:
        undefined,
      password_hash:
        undefined,
      refreshToken:
        undefined,
      refresh_token:
        undefined,
      token:
        undefined,
      accessToken:
        undefined,
      access_token:
        undefined,
      tempToken:
        undefined,
      temp_token:
        undefined,
    };

    if (output.user.avatar) {
      output.user.avatar =
        redactSafe(output.user.avatar);
    }

    if (output.user.avatarUrl) {
      output.user.avatarUrl =
        redactSafe(output.user.avatarUrl);
    }
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

  const cleanPayload =
    sanitizeEventPayload(payload);

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

  /*
    Anti-duplicación:
    - si hay bus interno, no duplicamos a window salvo window:true
    - si no hay bus, window actúa como fallback
  */
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

function resolveLoginEndpoint() {
  return (
    safeText(AUTH_ENDPOINTS?.login, "") ||
    "/api/auth/login"
  );
}

function resolveApiBase() {
  return safeText(
    AppCore?.config?.apiBase ||
      AppCore?.config?.baseUrl ||
      AppCore?.config?.apiUrl ||
      "",
    ""
  ).replace(/\/+$/, "");
}

function resolveApiUrl(path = "") {
  const cleanPath =
    safeText(path, "");

  if (/^https?:\/\//i.test(cleanPath)) {
    return cleanPath;
  }

  const apiBase =
    resolveApiBase();

  if (!apiBase) {
    return cleanPath || "/";
  }

  return `${apiBase}${cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`}`;
}

function createLoginAbortController(options = {}) {
  if (
    !isBrowser() ||
    typeof AbortController !== "function"
  ) {
    return null;
  }

  const timeoutMs =
    safeNumber(
      options.timeoutMs ||
        options.loginTimeoutMs ||
        AUTH_CONSTANTS?.loginTimeoutMs ||
        AUTH_CONSTANTS?.requestTimeout,
      DEFAULT_LOGIN_TIMEOUT_MS
    );

  const controller =
    new AbortController();

  if (
    !timeoutMs ||
    timeoutMs <= 0
  ) {
    return {
      controller,
      timer:
        null,
    };
  }

  let timer =
    null;

  try {
    timer =
      window.setTimeout(() => {
        try {
          controller.abort("login-timeout");
        } catch {
          try {
            controller.abort();
          } catch {}
        }
      }, timeoutMs);
  } catch {}

  return {
    controller,
    timer,
  };
}

function clearLoginAbortController(abortCtx = null) {
  if (!abortCtx) {
    return false;
  }

  try {
    if (
      abortCtx.timer &&
      isBrowser()
    ) {
      window.clearTimeout(abortCtx.timer);
    }
  } catch {}

  return true;
}

async function nativeFetchPost(path, body = {}, options = {}) {
  if (
    !isBrowser() ||
    typeof fetch !== "function"
  ) {
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

  const headers = {
    "Content-Type":
      "application/json",
    ...(safeObject(options.headers)),
  };

  const response =
    await fetch(url, {
      method:
        "POST",
      headers,
      credentials:
        options.credentials || "include",
      cache:
        "no-store",
      signal:
        options.signal || undefined,
      body:
        JSON.stringify(body || {}),
    });

  let payload =
    null;

  try {
    payload =
      await response.json();
  } catch {
    payload =
      null;
  }

  if (!response.ok) {
    const message =
      extractMessage(payload) ||
      payload?.message ||
      payload?.error ||
      `HTTP ${response.status}`;

    const error =
      createAuthError(
        message,
        {
          status:
            response.status,
          code:
            payload?.code ||
            payload?.error ||
            (
              response.status === 401
                ? "UNAUTHORIZED"
                : response.status === 403
                  ? "FORBIDDEN"
                  : "LOGIN_FAILED"
            ),
          raw:
            payload || response,
        }
      );

    error.response = {
      status:
        response.status,
      data:
        payload,
    };

    throw error;
  }

  return payload;
}

async function apiPost(path, body = {}, options = {}) {
  const apiClient =
    getApiClient();

  const abortCtx =
    createLoginAbortController(options);

  const signal =
    abortCtx?.controller?.signal ||
    options.signal;

  const finalOptions = {
    ...options,
    signal,
    auth:
      false,
    public:
      true,
    skipAuth:
      true,
  };

  try {
    if (
      apiClient &&
      isFunction(apiClient.post)
    ) {
      return await apiClient.post(
        path,
        body,
        finalOptions
      );
    }

    if (
      apiClient &&
      isFunction(apiClient.request)
    ) {
      try {
        return await apiClient.request(
          path,
          {
            ...finalOptions,
            method:
              "POST",
            body,
          }
        );
      } catch (error) {
        try {
          return await apiClient.request(
            "POST",
            path,
            {
              ...finalOptions,
              body,
            }
          );
        } catch {
          throw error;
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
        normalizePath(path || "/")
      )
    );
  } catch {
    return String(path || "/");
  }
}

function stripSearchAndHash(path = "/") {
  const raw =
    safeText(path, "/");

  return normalizeCleanRoute(
    raw
      .split("?")[0]
      .split("#")[0] ||
      "/"
  );
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
    return normalizePath(
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

function shouldNavigateAfterLogin(options = {}) {
  return !(
    options?.navigate === false ||
    options?.skipNavigate === true ||
    options?.manualNavigate === true
  );
}

function buildPopStateEvent() {
  try {
    return new PopStateEvent("popstate");
  } catch {
    try {
      return new Event("popstate");
    } catch {
      return null;
    }
  }
}

/* =========================================================
   DOM / UI REPAIR
   Sólo clases/atributos. Sin CSS ni estilos inline.
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
      source:
        LOGIN_SOURCE,
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
      source:
        LOGIN_SOURCE,
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
  } catch {}

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  safeEmit(
    "app:ui:repair-request",
    {
      reason,
      source:
        LOGIN_SOURCE,
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
    source:
      LOGIN_SOURCE,
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
    ...extra,
  };

  /*
    Login correcto NO emite:
    - auth:session:restored
    - app:session:restored

    Esos eventos son exclusivos de restoreSession().
    auth:login:success queda opt-in para evitar duplicidad
    con src/features/auth/index.js.
  */
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
      isFunction(candidate.navigate)
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
      isFunction(router.navigate)
    ) {
      return router;
    }
  } catch {}

  return null;
}

function updateCoreRouteState(target = "/") {
  const cleanTarget =
    normalizePath(target || "/") || "/";

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

async function safeNavigate(path = "/", options = {}) {
  const target =
    normalizePath(
      safeText(
        path,
        getHomeRoute()
      )
    ) ||
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
      source:
        LOGIN_SOURCE,
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
      reason:
        "same-route",
      target,
    };

    safeEmit(
      "auth:login:navigation:complete",
      {
        ...result,
        source:
          LOGIN_SOURCE,
      }
    );

    return result;
  }

  const router =
    await resolveRouter();

  if (
    router &&
    isFunction(router.navigate)
  ) {
    try {
      const result =
        router.navigate(
          target,
          {
            replaceState,
            force:
              true,
            source:
              LOGIN_SOURCE,
          }
        );

      if (
        result &&
        isFunction(result.then)
      ) {
        await result;
      }

      updateCoreRouteState(target);

      clearAuthScreenDomState(
        `${reason}:router`
      );

      const navResult = {
        ok:
          true,
        skipped:
          false,
        reason:
          "router",
        target,
      };

      safeEmit(
        "auth:login:navigation:complete",
        {
          ...navResult,
          source:
            LOGIN_SOURCE,
        }
      );

      return navResult;
    } catch (error) {
      safeWarn(
        "Router.navigate falló.",
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
          source:
            LOGIN_SOURCE,
        }
      );
    }
  }

  try {
    if (
      isBrowser() &&
      typeof window.history?.replaceState === "function"
    ) {
      window.history.replaceState(
        {
          path:
            target,
          publicPath:
            target,
          canonicalPath:
            targetCanonical,
          source:
            LOGIN_SOURCE,
        },
        "",
        target
      );

      updateCoreRouteState(target);

      clearAuthScreenDomState(
        `${reason}:history`
      );

      const popStateEvent =
        buildPopStateEvent();

      if (popStateEvent) {
        window.dispatchEvent(popStateEvent);
      }

      const navResult = {
        ok:
          true,
        skipped:
          false,
        reason:
          "history",
        target,
      };

      safeEmit(
        "auth:login:navigation:complete",
        {
          ...navResult,
          source:
            LOGIN_SOURCE,
        }
      );

      return navResult;
    }
  } catch (error) {
    safeWarn(
      "history fallback falló.",
      error
    );
  }

  try {
    if (isBrowser()) {
      window.location.assign(target);

      return {
        ok:
          true,
        skipped:
          false,
        reason:
          "location",
        target,
      };
    }
  } catch {}

  const failed = {
    ok:
      false,
    skipped:
      false,
    reason:
      "navigation-failed",
    target,
  };

  safeEmit(
    "auth:login:navigation:error",
    {
      ...failed,
      source:
        LOGIN_SOURCE,
    }
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
    String(
      credentials.password ??
        credentials.pass ??
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
      : undefined;

  const phone =
    !email &&
    looksLikePhone(clean)
      ? normalizePhone(clean)
      : undefined;

  const username =
    !email &&
    !phone
      ? sanitizeUsername(clean)
      : undefined;

  return {
    identifier:
      clean,

    email,
    phone,
    username,

    user:
      username,

    login:
      clean,

    password,
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
        normalizePath(raw);
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

  /*
    No se bloquean /incidencias, /facturas, etc. cuando vienen
    de redirect explícito. Sólo se filtran como home configurado
    por defecto si son residuos de rol.
  */
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
    new Set();

  const queue =
    [raw];

  let guard =
    0;

  while (
    queue.length &&
    guard < 100
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

function hasUsableToken(token = "") {
  return Boolean(
    safeText(token, "")
  );
}

function resolveAvatar(user = {}) {
  if (!isPlainObject(user)) {
    return null;
  }

  return (
    safeText(user.avatar, "") ||
    safeText(user.avatarUrl, "") ||
    safeText(user.avatar_url, "") ||
    safeText(user.photo, "") ||
    safeText(user.photoUrl, "") ||
    safeText(user.photo_url, "") ||
    safeText(user.image, "") ||
    safeText(user.imageUrl, "") ||
    safeText(user.image_url, "") ||
    safeText(user.profileImage, "") ||
    safeText(user.profile_image, "") ||
    safeText(user.picture, "") ||
    safeText(user.pictureUrl, "") ||
    safeText(user.picture_url, "") ||
    null
  );
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
    user.isBlocked === true
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

  const role =
    pickFirstText(
      user.role,
      user.rol,
      user.type,
      user.tipo,
      user.userType,
      user.user_type,
      "user"
    );

  const avatar =
    resolveAvatar(user);

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

    uid:
      user.uid ||
      userId ||
      null,

    username:
      username ||
      null,

    usernameLower:
      user.usernameLower ||
      user.username_lower ||
      sanitizeUsername(username || "") ||
      null,

    slug:
      user.slug ||
      user.usernameLower ||
      user.username_lower ||
      sanitizeUsername(username || "") ||
      null,

    email:
      user.email ||
      user.mail ||
      null,

    emailLower:
      user.emailLower ||
      user.email_lower ||
      (user.email ? String(user.email).toLowerCase() : null),

    name:
      user.name ||
      user.nombre ||
      user.displayName ||
      user.fullName ||
      username ||
      user.email ||
      "Usuario",

    displayName:
      user.displayName ||
      user.fullName ||
      user.name ||
      user.nombre ||
      username ||
      user.email ||
      "Usuario",

    role,
    rol:
      role,

    permissions:
      safeArray(user.permissions || user.permisos),

    permisos:
      safeArray(user.permisos || user.permissions),

    avatar,
    avatarUrl:
      avatar,
    picture:
      avatar,

    hasAvatar:
      user.hasAvatar === true ||
      user.has_avatar === true ||
      Boolean(avatar),

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
      safeText(user.mobile, "")
  );
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

  if (
    !sessionId &&
    !userId &&
    !expiresAt &&
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
  };
}

function extractAuthFields(raw = {}) {
  const objects =
    collectAuthObjects(raw);

  const token =
    pickTextFromObjects(
      objects,
      AUTH_TOKEN_KEYS
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
    normalizeUserForClient(userRaw);

  const role =
    pickFirstText(
      pickTextFromObjects(objects, ROLE_KEYS),
      user?.role,
      user?.rol,
      user?.type,
      user?.tipo,
      user?.userType,
      user?.user_type
    );

  const status =
    pickFirstValue(
      pickValueFromObjects(
        objects,
        STATUS_KEYS
      )
    );

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

  const statusText =
    safeText(status, "")
      .toLowerCase();

  const requires2FA =
    Boolean(tempToken) ||
    pickBoolFromObjects(
      objects,
      TWO_FACTOR_BOOL_KEYS
    ) ||
    TWO_FACTOR_STATUSES.has(statusText);

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

  const hasBooleanFailure =
    objects.some((object) => {
      return (
        object?.ok === false ||
        object?.success === false
      );
    });

  const explicitFailure =
    !requires2FA &&
    Boolean(
      hasStatusFailure ||
        hasCodeFailure ||
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
    role,
    status,
    code,
    message,
    redirectTo,
    sessionData,
    sessionId,
    sessionUserId,
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

    code:
      safeText(fields.code, ""),

    message:
      safeText(fields.message, ""),

    token:
      safeText(fields.token, ""),

    refreshToken:
      safeText(fields.refreshToken, ""),

    tempToken:
      safeText(fields.tempToken, ""),

    user:
      fields.user,

    role:
      safeText(fields.role, ""),

    sessionData:
      fields.sessionData,

    session:
      fields.sessionData,

    sessionId:
      fields.sessionId,

    sessionUserId:
      fields.sessionUserId,

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

  error.code =
    code;

  error.data = {
    code,
    message,
    status,
  };

  error.raw =
    raw;

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

  const code =
    safeText(
      error?.code ||
        error?.data?.code ||
        error?.response?.data?.code ||
        "",
      status === 401
        ? "UNAUTHORIZED"
        : status === 403
          ? "FORBIDDEN"
          : status === 423
            ? "ACCOUNT_TEMPORARILY_LOCKED"
            : "LOGIN_FAILED"
    );

  const message =
    extractMessage(error) ||
    error?.response?.data?.message ||
    error?.data?.message ||
    "No se pudo iniciar sesión.";

  return createAuthError(
    message,
    {
      status:
        status || 500,
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
    "onion:tempToken",
    "onion:temp_token",
    "onion:temporaryToken",
    "onion:temporary_token",
    "onion:twoFactorToken",
    "onion:two_factor_token",
    "onion:mfaToken",
    "onion:mfa_token",
    "temp_token",
    "temporary_token",
    "two_factor_token",
    "mfa_token",
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
      });
    } catch {}
  }

  try {
    if (options.callCoreClear === true) {
      AppCore?.clearSession?.({
        silent:
          true,
        reason,
      });
    }
  } catch {}

  try {
    if (options.callSessionClear === true) {
      AppCore?.session?.clear?.();
    }
  } catch {}

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

      role:
        null,
      userRole:
        null,
      roles:
        [],

      token:
        null,
      accessToken:
        null,
      access_token:
        null,

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
        false,
      twoFactorUser:
        null,
      tempToken:
        null,

      loginInProgress:
        false,
    },
    {
      forceUnauthenticated:
        true,
    }
  );

  clearKnownAuthStorage();

  if (emitCleared) {
    safeEmit(
      "auth:login:auth-state-cleared",
      {
        reason,
        source:
          LOGIN_SOURCE,
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
    snapshot.token ||
    snapshot.accessToken ||
    snapshot.access_token ||
    "";

  const role =
    snapshot.role ||
    snapshot.rol ||
    user?.role ||
    user?.rol ||
    "";

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

  const roles =
    safeArray(user?.roles).length
      ? safeArray(user.roles)
      : [role].filter(Boolean);

  const sessionAlias = {
    ...safeObject(session),
    sessionId,
    session_id:
      sessionId,
    userId:
      sessionUserId,
    user_id:
      sessionUserId,
    sessionUserId,
    session_user_id:
      sessionUserId,
    user,
    role,
    roles,
    token,
    accessToken:
      token,
    access_token:
      token,
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

      role,
      userRole:
        role,
      roles,

      token,
      accessToken:
        token,
      access_token:
        token,

      twoFactorPending:
        false,
      twoFactorUser:
        null,
      tempToken:
        null,

      session:
        sessionAlias,
      sessionData:
        sessionAlias,

      sessionId,
      sessionUserId,

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
    }
  );

  return {
    user,
    token,
    role,
    roles,
    session:
      sessionAlias,
    sessionId,
    sessionUserId,
  };
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

  const payload = {
    token:
      authData.token,
    accessToken:
      authData.token,
    access_token:
      authData.token,

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

    role:
      authData.role ||
      authData.user?.role ||
      "",
    rol:
      authData.role ||
      authData.user?.role ||
      "",

    refreshToken:
      authData.refreshToken ||
      null,
    refresh_token:
      authData.refreshToken ||
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

    /*
      Punto crítico:
      applySession ya puede emitir eventos de sesión.
      En login lo usamos como commit silencioso y emitimos una
      sola tanda canónica en emitLoginSessionCommitted().
    */
    silent:
      true,

    data: {
      token:
        authData.token,
      accessToken:
        authData.token,
      access_token:
        authData.token,
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

    auth: {
      token:
        authData.token,
      accessToken:
        authData.token,
      access_token:
        authData.token,
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
      applySession(payload);
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
    snapshot.token ||
    snapshot.accessToken ||
    authData.token;

  snapshot.accessToken =
    snapshot.accessToken ||
    snapshot.token;

  snapshot.user =
    normalizeUserForClient(
      snapshot.user ||
      authData.user
    );

  snapshot.role =
    snapshot.role ||
    authData.role ||
    snapshot.user?.role ||
    snapshot.user?.rol ||
    "";

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

  /*
    No llamamos AppCore.applySession aquí:
    AppCore.applySession puede emitir app:session:applied y duplicar
    los eventos canónicos de login. Auth session ya escribe AppCore.
  */
  enforceAuthenticatedCoreState(snapshot);

  return snapshot;
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
      source:
        LOGIN_SOURCE,
    }
  );

  const response =
    await apiPost(
      endpoint,
      buildLoginRequestBody(credentials),
      {
        auth:
          false,
        public:
          true,
        skipAuth:
          true,
        silent:
          options.silentRequest === true,
        storeError:
          false,
        _skipAuthRefresh:
          true,
        useLoader:
          options.useLoader !== false,
        timeoutMs:
          options.timeoutMs ||
          options.loginTimeoutMs,
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
      validationOk:
        validation.ok,
      source:
        LOGIN_SOURCE,
    }
  );

  /*
    validateAuthResponse puede fallar si backend responde 2FA
    sin sesión completa. Sólo es fallo fatal si no hay 2FA ni sesión.
  */
  if (
    validation.error &&
    !authData.requires2FA &&
    !authData.authenticated
  ) {
    if (
      authData.explicitFailure ||
      authData.ok === false
    ) {
      throw createAuthError(
        authData.message ||
          extractMessage(validation.error) ||
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
  }

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

        user:
          null,
        currentUser:
          null,
        authUser:
          null,
        sessionUser:
          null,

        role:
          null,
        userRole:
          null,

        roles:
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
      },
      {
        forceUnauthenticated:
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
        source:
          LOGIN_SOURCE,
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

  clearAuthScreenDomState(
    "login-session-applied"
  );

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

  const redirectTo =
    getPostLoginTarget(
      snapshot.user,
      {
        ...options,
        redirectTo:
          authData.redirectTo ||
          options.redirectTo ||
          options.redirect ||
          options.target ||
          "",
      }
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

    user:
      snapshot.user,
    role:
      snapshot.role ||
      authData.role ||
      "",

    refreshToken:
      authData.refreshToken ||
      "",

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
        source:
          LOGIN_SOURCE,
        sequence,
      }
    );
  }

  if (shouldNavigateAfterLogin(options)) {
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
        }
      );
  }

  clearAuthScreenDomState(
    "login-success-after-navigation"
  );

  safeSyncUserUI(
    "login-success-after-navigation"
  );

  afterPaint(() => {
    clearAuthScreenDomState(
      "login-success-after-paint"
    );

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
            source:
              LOGIN_SOURCE,
          }
        );

        clearAuthRuntimeState(
          "before_login",
          {
            emitCleared:
              false,
            callCoreClear:
              false,
            callSessionClear:
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
            source:
              LOGIN_SOURCE,
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
        isBrowser() &&
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

    loginInProgress:
      Boolean(state.loginInProgress),

    twoFactorPending:
      Boolean(state.twoFactorPending),

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
