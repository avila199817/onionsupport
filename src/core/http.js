/* =========================================================
   Onion SPA - Core HTTP
   Archivo: src/core/http.js

   ONION SUPPORT · CORE HTTP CLIENT
   API.ONIONIT.NET LOCK · AUTH SAFE · REFRESH SAFE · CORS SAFE · 11/10

   RESPONSABILIDADES:
   - Centralizar TODAS las llamadas HTTP del frontend.
   - Apuntar por defecto al backend real:
       https://api.onionit.net
   - Evitar llamadas accidentales a www.onionsupport.com/api.
   - Soportar cookies cross-origin con credentials: include.
   - Soportar Authorization Bearer si existe token en AppCore/Auth/storage.
   - Soportar refresh mutex.
   - Reintentar requests privadas tras refresh si hay 401/419.
   - Parsear JSON de forma segura.
   - Detectar HTML accidental como error de endpoint/baseURL.
   - Redactar tokens en errores/logs/eventos.
   - Instalarse en AppCore como:
       AppCore.http
       AppCore.Http
       AppCore.apiClient
       AppCore.services.http
       AppCore.services.api
       AppCore.services.apiClient
   - Exponer helpers:
       Http.get()
       Http.post()
       Http.request()
       Http.login()
       Http.me()
       Http.refresh()
       Http.logout()
   - Commit opcional de auth payload en AppCore.state para que SidebarUI pinte user/avatar.

   HARDENING:
   - /api/auth/me, /auth/me y /me son PRIVADOS.
   - login/refresh/logout/activation/reset/2FA no disparan refresh automático.
   - refresh single-flight.
   - retry abortable.
   - timeout real.
   - fetch browser/server safe.
   - Headers/FormData/Blob safe.
   - no localStorage.clear().
   - no sessionStorage.clear().
   - tokens nunca se truncan: se descartan si son corruptos.
========================================================= */

export const HTTP_VERSION =
  "core-http-v21-api-onionit-net-auth-safe";

export const DEFAULT_API_ORIGIN =
  "https://api.onionit.net";

export const DEFAULT_API_PREFIX =
  "/api";

export const DEFAULT_TIMEOUT_MS =
  30000;

export const DEFAULT_AUTH_TIMEOUT_MS =
  30000;

export const DEFAULT_REFRESH_TIMEOUT_MS =
  30000;

const SOURCE =
  "CoreHTTP";

const AUTH_PATH_RE =
  /^\/api\/auth(?:\/|$)/i;

const AUTH_ME_PATH_RE =
  /^(?:\/api)?\/auth\/me\/?$|^\/me\/?$/i;

const REFRESH_PATH_RE =
  /^\/api\/auth\/(?:refresh|token\/refresh|renew)\/?$/i;

const LOGIN_PATH_RE =
  /^\/api\/auth\/(?:login|2fa\/login|mfa\/login|otp\/login)\/?$/i;

const LOGOUT_PATH_RE =
  /^\/api\/auth\/(?:logout|logout-all|signout|sign-out)\/?$/i;

const AUTH_PUBLIC_CONTROL_PATH_RE =
  /^\/api\/auth\/(?:login|refresh|token\/refresh|renew|logout|logout-all|2fa|mfa|otp|activate|activate-account|activation|account\/activate|reset-password|reset-password-request|reset-password-confirm|forgot-password|recover-password|password-reset|_health)(?:\/|$)/i;

const FRONTEND_HOST_RE =
  /^(?:www\.)?onionsupport\.com$/i;

const TOKEN_MAX_LENGTH =
  8192;

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

const USER_KEYS =
  Object.freeze([
    "user",
    "usuario",
    "me",
    "account",
    "profile",
    "currentUser",
    "authUser",
    "sessionUser",
  ]);

const SESSION_KEYS =
  Object.freeze([
    "session",
    "sessionData",
    "authSession",
    "auth_session",
  ]);

const STORAGE_TOKEN_KEYS =
  Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "authToken",
    "auth_token",
    "jwt",

    "onion_token",
    "onion_access_token",
    "onion:token",
    "onion:accessToken",
    "onion:access_token",
    "onion.token",
    "onion.accessToken",

    "auth_token",
    "auth.accessToken",
    "auth:accessToken",
    "auth.token",
    "auth:token",
  ]);

const STORAGE_REFRESH_TOKEN_KEYS =
  Object.freeze([
    "refreshToken",
    "refresh_token",

    "onion_refresh_token",
    "onion:refreshToken",
    "onion:refresh_token",
    "onion.refreshToken",

    "auth.refreshToken",
    "auth:refreshToken",
    "auth.refresh_token",
    "auth:refresh_token",
  ]);

const CORRUPT_TOKEN_VALUES =
  new Set([
    "",
    "null",
    "undefined",
    "false",
    "true",
    "nan",
    "none",
    "empty",
    "{}",
    "[]",
    "[object object]",
    "\"\"",
    "''",
  ]);

let apiOrigin =
  DEFAULT_API_ORIGIN;

let refreshPromise =
  null;

let installedAppCore =
  null;

let tokenProvider =
  null;

let authPayloadCommitter =
  null;

const tokenMemory = {
  token:
    "",

  refreshToken:
    "",
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function hasWindow() {
  return typeof window !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
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

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text =
    safeLower(value, "");

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

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function wait(ms = 0, signal = null) {
  const delay =
    Math.max(
      0,
      safeNumber(ms, 0)
    );

  if (!delay) {
    return Promise.resolve(true);
  }

  if (signal?.aborted) {
    return Promise.reject(
      new DOMException(
        "Aborted",
        "AbortError"
      )
    );
  }

  return new Promise((resolve, reject) => {
    let timer =
      null;

    const cleanup = () => {
      try {
        if (timer) clearTimeout(timer);
      } catch {}

      try {
        signal?.removeEventListener?.(
          "abort",
          onAbort
        );
      } catch {}
    };

    const onAbort = () => {
      cleanup();

      try {
        reject(
          new DOMException(
            "Aborted",
            "AbortError"
          )
        );
      } catch {
        reject(
          Object.assign(
            new Error("Aborted"),
            {
              name:
                "AbortError",
            }
          )
        );
      }
    };

    try {
      timer =
        setTimeout(() => {
          cleanup();
          resolve(true);
        }, delay);

      signal?.addEventListener?.(
        "abort",
        onAbort,
        {
          once:
            true,
        }
      );
    } catch {
      cleanup();
      resolve(true);
    }
  });
}

function unique(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean)
    ),
  ];
}

function canExtend(value) {
  try {
    return (
      value &&
      typeof value === "object" &&
      Object.isExtensible(value)
    );
  } catch {
    return false;
  }
}

function defineHiddenValue(target, key, value) {
  if (
    !target ||
    !key ||
    !canExtend(target)
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        configurable:
          true,
        enumerable:
          false,
        writable:
          true,
      }
    );

    return true;
  } catch {}

  try {
    target[key] =
      value;

    return true;
  } catch {}

  return false;
}

function safeClone(value, fallback = null) {
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

function getFetch() {
  try {
    if (
      typeof globalThis !== "undefined" &&
      isFunction(globalThis.fetch)
    ) {
      return globalThis.fetch.bind(globalThis);
    }
  } catch {}

  return null;
}

function hasHeadersConstructor() {
  return typeof Headers !== "undefined";
}

function isHeaders(value) {
  try {
    return (
      hasHeadersConstructor() &&
      value instanceof Headers
    );
  } catch {
    return false;
  }
}

function hasFormDataConstructor() {
  return typeof FormData !== "undefined";
}

function hasBlobConstructor() {
  return typeof Blob !== "undefined";
}

function isFormData(value) {
  try {
    return (
      hasFormDataConstructor() &&
      value instanceof FormData
    );
  } catch {
    return false;
  }
}

function isBlob(value) {
  try {
    return (
      hasBlobConstructor() &&
      value instanceof Blob
    );
  } catch {
    return false;
  }
}

/* =========================================================
   REDACTION
========================================================= */

export function redactHttpText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    output =
      output.replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token)=)([^&#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function sanitizePayload(value, depth = 0) {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactHttpText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizePayload(
          item,
          depth + 1
        )
      );
  }

  if (isPlainObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      if (/token|secret|password|authorization|credential|jwt|bearer|otp|code|cookie/i.test(key)) {
        output[key] =
          item ? "***" : item;

        continue;
      }

      output[key] =
        sanitizePayload(
          item,
          depth + 1
        );
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   EVENTS / LOGS
========================================================= */

function safeEmit(eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload =
    sanitizePayload({
      source:
        SOURCE,

      version:
        HTTP_VERSION,

      at:
        safeIsoDate(),

      ts:
        safeNow(),

      ...safeObject(payload),
    });

  const AppCore =
    installedAppCore;

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
    if (
      isBrowser() &&
      typeof CustomEvent !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(
          name,
          {
            detail:
              cleanPayload,
          }
        )
      );

      return true;
    }
  } catch {}

  return false;
}

function safeWarn(...args) {
  const AppCore =
    installedAppCore;

  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[CoreHTTP]",
        ...cleanArgs
      );

      return;
    }
  } catch {}

  try {
    console.warn(
      "[CoreHTTP]",
      ...cleanArgs
    );
  } catch {}
}

/* =========================================================
   ORIGIN / URL
========================================================= */

function readImportMetaEnv(key = "") {
  try {
    if (
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env[key]
    ) {
      return import.meta.env[key];
    }
  } catch {}

  return "";
}

function readRuntimeGlobal(key = "") {
  try {
    if (
      hasWindow() &&
      window[key]
    ) {
      return window[key];
    }
  } catch {}

  try {
    if (
      typeof globalThis !== "undefined" &&
      globalThis[key]
    ) {
      return globalThis[key];
    }
  } catch {}

  return "";
}

function isFrontendOrigin(origin = "") {
  try {
    const parsed =
      new URL(origin);

    return FRONTEND_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeOrigin(value = "", fallback = DEFAULT_API_ORIGIN, options = {}) {
  const raw =
    safeText(value, "");

  if (!raw) {
    return fallback;
  }

  try {
    const url =
      new URL(raw);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return fallback;
    }

    const origin =
      url.origin.replace(/\/+$/g, "");

    if (
      options.allowFrontendOrigin !== true &&
      isFrontendOrigin(origin)
    ) {
      return fallback;
    }

    return origin;
  } catch {
    return fallback;
  }
}

function resolveRuntimeApiOrigin() {
  return normalizeOrigin(
    readRuntimeGlobal("__ONION_API_ORIGIN__") ||
      readRuntimeGlobal("ONION_API_ORIGIN") ||
      readImportMetaEnv("VITE_API_ORIGIN") ||
      readImportMetaEnv("VITE_API_BASE") ||
      readImportMetaEnv("VITE_API_URL") ||
      readImportMetaEnv("PUBLIC_API_ORIGIN") ||
      DEFAULT_API_ORIGIN,
    DEFAULT_API_ORIGIN
  );
}

export function getApiOrigin() {
  return normalizeOrigin(
    apiOrigin,
    DEFAULT_API_ORIGIN
  );
}

export function setApiOrigin(value = "", options = {}) {
  apiOrigin =
    normalizeOrigin(
      value,
      DEFAULT_API_ORIGIN,
      options
    );

  return apiOrigin;
}

function normalizePath(path = "/") {
  let value =
    safeText(path, "/");

  if (!value) {
    value = "/";
  }

  value =
    value.replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  value =
    value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function ensureApiPath(path = "/", options = {}) {
  const opts =
    safeObject(options);

  let value =
    normalizePath(path);

  if (opts.api === false) {
    return value;
  }

  const apiPrefix =
    safeText(
      opts.apiPrefix,
      DEFAULT_API_PREFIX
    ) || DEFAULT_API_PREFIX;

  const cleanPrefix =
    normalizePath(apiPrefix);

  if (
    value === cleanPrefix ||
    value.startsWith(`${cleanPrefix}/`)
  ) {
    return value;
  }

  return `${cleanPrefix}${value}`;
}

function appendQuery(url, query = null) {
  if (!query) {
    return url;
  }

  try {
    const parsed =
      new URL(url);

    if (
      typeof URLSearchParams !== "undefined" &&
      query instanceof URLSearchParams
    ) {
      for (const [key, value] of query.entries()) {
        parsed.searchParams.set(
          key,
          value
        );
      }

      return parsed.toString();
    }

    if (isPlainObject(query)) {
      for (const [key, value] of Object.entries(query)) {
        if (
          value === undefined ||
          value === null ||
          value === ""
        ) {
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            parsed.searchParams.append(
              key,
              String(item)
            );
          }

          continue;
        }

        parsed.searchParams.set(
          key,
          String(value)
        );
      }

      return parsed.toString();
    }
  } catch {}

  return url;
}

function rewriteUnsafeAbsoluteApiUrl(raw = "", options = {}) {
  const opts =
    safeObject(options);

  try {
    const parsed =
      new URL(raw);

    const pathname =
      parsed.pathname || "/";

    if (
      opts.allowFrontendOrigin !== true &&
      isFrontendOrigin(parsed.origin) &&
      pathname.startsWith(DEFAULT_API_PREFIX)
    ) {
      return `${getApiOrigin()}${pathname}${parsed.search || ""}${parsed.hash || ""}`;
    }

    return raw;
  } catch {
    return raw;
  }
}

export function buildApiUrl(endpoint = "/", options = {}) {
  const opts =
    safeObject(options);

  const raw =
    safeText(endpoint, "/");

  if (/^https?:\/\//i.test(raw)) {
    return appendQuery(
      rewriteUnsafeAbsoluteApiUrl(
        raw,
        opts
      ),
      opts.query
    );
  }

  if (raw.startsWith("//")) {
    return appendQuery(
      `${getApiOrigin()}${normalizePath(raw.replace(/^\/+/, ""))}`,
      opts.query
    );
  }

  const path =
    ensureApiPath(
      raw,
      opts
    );

  const origin =
    normalizeOrigin(
      opts.origin ||
        opts.baseURL ||
        opts.baseUrl ||
        getApiOrigin(),
      DEFAULT_API_ORIGIN,
      opts
    );

  return appendQuery(
    `${origin}${path}`,
    opts.query
  );
}

function getUrlPathname(url = "") {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return normalizePath(url);
  }
}

/* =========================================================
   REQUEST ID
========================================================= */

function createRequestId() {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
  } catch {}

  return `spa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/* =========================================================
   TOKENS
========================================================= */

function unwrapStoredValue(value = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return safeText(value, "");
  }

  if (isPlainObject(value)) {
    for (const key of [
      ...TOKEN_KEYS,
      ...REFRESH_TOKEN_KEYS,
      "value",
      "raw",
      "data",
    ]) {
      const nested =
        unwrapStoredValue(value[key]);

      if (nested) {
        return nested;
      }
    }

    return "";
  }

  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed =
      JSON.parse(raw);

    if (
      typeof parsed === "string" ||
      typeof parsed === "number" ||
      typeof parsed === "boolean" ||
      isPlainObject(parsed)
    ) {
      return unwrapStoredValue(parsed);
    }
  } catch {}

  return raw;
}

function normalizeTokenValue(value = "") {
  let token =
    unwrapStoredValue(value);

  if (!token) {
    return "";
  }

  if (/^Bearer\s+/i.test(token)) {
    token =
      token.replace(/^Bearer\s+/i, "")
        .trim();
  }

  if (
    !token ||
    CORRUPT_TOKEN_VALUES.has(token.toLowerCase())
  ) {
    return "";
  }

  if (/[\r\n\t\s]/.test(token)) {
    return "";
  }

  if (token.length > TOKEN_MAX_LENGTH) {
    return "";
  }

  return token;
}

function readStorageValue(key = "") {
  if (!isBrowser()) {
    return "";
  }

  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return "";
  }

  try {
    const value =
      window.sessionStorage?.getItem?.(cleanKey);

    const normalized =
      normalizeTokenValue(value);

    if (normalized) {
      return normalized;
    }
  } catch {}

  try {
    const value =
      window.localStorage?.getItem?.(cleanKey);

    const normalized =
      normalizeTokenValue(value);

    if (normalized) {
      return normalized;
    }
  } catch {}

  return "";
}

function writeStorageValue(key = "", value = "") {
  if (!isBrowser()) {
    return false;
  }

  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      window.sessionStorage?.removeItem?.(cleanKey);
      return true;
    }

    window.sessionStorage?.setItem?.(
      cleanKey,
      String(value)
    );

    return true;
  } catch {}

  return false;
}

function removeStorageValue(key = "") {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.sessionStorage?.removeItem?.(key);
  } catch {}

  try {
    window.localStorage?.removeItem?.(key);
  } catch {}

  return true;
}

function readFirstStorage(keys = []) {
  for (const key of safeArray(keys)) {
    const value =
      readStorageValue(key);

    if (value) {
      return value;
    }
  }

  return "";
}

function getAuthModule() {
  try {
    return (
      installedAppCore?.Auth ||
      installedAppCore?.auth ||
      installedAppCore?.modules?.get?.("Auth") ||
      installedAppCore?.modules?.get?.("auth") ||
      (
        isBrowser()
          ? window.Auth || window.OnionAuth
          : null
      ) ||
      null
    );
  } catch {
    return null;
  }
}

function getTokenFromAuthModule() {
  const Auth =
    getAuthModule();

  try {
    if (isFunction(Auth?.getAccessToken)) {
      const value =
        normalizeTokenValue(
          Auth.getAccessToken()
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    if (isFunction(Auth?.getToken)) {
      const value =
        normalizeTokenValue(
          Auth.getToken()
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    if (isFunction(Auth?.getAuthHeader)) {
      const header =
        Auth.getAuthHeader();

      const authorization =
        header?.Authorization ||
        header?.authorization ||
        "";

      const value =
        normalizeTokenValue(authorization);

      if (value) {
        return value;
      }
    }
  } catch {}

  return "";
}

function getRefreshTokenFromAuthModule() {
  const Auth =
    getAuthModule();

  try {
    if (isFunction(Auth?.getStoredRefreshToken)) {
      const value =
        normalizeTokenValue(
          Auth.getStoredRefreshToken()
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    if (isFunction(Auth?.getRefreshToken)) {
      const value =
        normalizeTokenValue(
          Auth.getRefreshToken()
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  return "";
}

function getTokenFromAppCore() {
  const state =
    safeObject(installedAppCore?.state);

  const session =
    safeObject(state.session || state.sessionData);

  return normalizeTokenValue(
    state.token ||
      state.accessToken ||
      state.access_token ||
      state.authToken ||
      state.auth_token ||
      state.jwt ||
      session.token ||
      session.accessToken ||
      session.access_token ||
      installedAppCore?.token ||
      ""
  );
}

function getRefreshTokenFromAppCore() {
  const state =
    safeObject(installedAppCore?.state);

  const session =
    safeObject(state.session || state.sessionData);

  return normalizeTokenValue(
    state.refreshToken ||
      state.refresh_token ||
      session.refreshToken ||
      session.refresh_token ||
      installedAppCore?.refreshToken ||
      ""
  );
}

export function setTokenProvider(provider) {
  tokenProvider =
    isFunction(provider)
      ? provider
      : null;

  return true;
}

export function getAccessToken(options = {}) {
  const opts =
    safeObject(options);

  try {
    if (isFunction(tokenProvider)) {
      const value =
        normalizeTokenValue(
          tokenProvider()
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  const fromAuth =
    getTokenFromAuthModule();

  if (fromAuth) {
    return fromAuth;
  }

  const fromAppCore =
    getTokenFromAppCore();

  if (fromAppCore) {
    return fromAppCore;
  }

  if (normalizeTokenValue(tokenMemory.token)) {
    return normalizeTokenValue(tokenMemory.token);
  }

  if (opts.allowStorageTokens === true) {
    return readFirstStorage(
      STORAGE_TOKEN_KEYS
    );
  }

  return "";
}

export function getRefreshToken(options = {}) {
  const opts =
    safeObject(options);

  const fromAuth =
    getRefreshTokenFromAuthModule();

  if (fromAuth) {
    return fromAuth;
  }

  const fromAppCore =
    getRefreshTokenFromAppCore();

  if (fromAppCore) {
    return fromAppCore;
  }

  if (normalizeTokenValue(tokenMemory.refreshToken)) {
    return normalizeTokenValue(tokenMemory.refreshToken);
  }

  if (opts.allowStorageTokens === true) {
    return readFirstStorage(
      STORAGE_REFRESH_TOKEN_KEYS
    );
  }

  return "";
}

export function setAuthTokens({
  token = "",
  accessToken = "",
  access_token = "",
  refreshToken = "",
  refresh_token = "",
  persist = false,
} = {}) {
  const nextToken =
    normalizeTokenValue(
      token ||
        accessToken ||
        access_token
    );

  const nextRefresh =
    normalizeTokenValue(
      refreshToken ||
        refresh_token
    );

  if (nextToken) {
    tokenMemory.token =
      nextToken;
  }

  if (nextRefresh) {
    tokenMemory.refreshToken =
      nextRefresh;
  }

  if (persist === true) {
    if (nextToken) {
      writeStorageValue(
        "onion_access_token",
        nextToken
      );
    }

    if (nextRefresh) {
      writeStorageValue(
        "onion_refresh_token",
        nextRefresh
      );
    }
  }

  return {
    token:
      tokenMemory.token,

    refreshToken:
      tokenMemory.refreshToken,
  };
}

export function clearAuthTokens({
  storage = true,
} = {}) {
  tokenMemory.token =
    "";

  tokenMemory.refreshToken =
    "";

  if (storage) {
    [
      ...STORAGE_TOKEN_KEYS,
      ...STORAGE_REFRESH_TOKEN_KEYS,
    ].forEach((key) => {
      removeStorageValue(key);
    });
  }

  return true;
}

/* =========================================================
   PAYLOAD EXTRACTION
========================================================= */

function collectObjects(value, depth = 0, seen = new WeakSet()) {
  if (
    depth > 6 ||
    !value ||
    typeof value !== "object"
  ) {
    return [];
  }

  try {
    if (seen.has(value)) {
      return [];
    }

    seen.add(value);
  } catch {}

  const output =
    [value];

  for (const key of [
    "data",
    "payload",
    "result",
    "body",
    "response",
    "auth",
    "authData",
    "session",
    "sessionData",
    "account",
    "profile",
    "me",
  ]) {
    const child =
      value[key];

    if (
      child &&
      typeof child === "object"
    ) {
      output.push(
        ...collectObjects(
          child,
          depth + 1,
          seen
        )
      );
    }
  }

  return output;
}

function pickFirstTextFromObjects(objects = [], keys = []) {
  for (const object of safeArray(objects)) {
    for (const key of safeArray(keys)) {
      const value =
        normalizeTokenValue(
          object?.[key]
        ) ||
        safeText(
          object?.[key],
          ""
        );

      if (value) {
        return value;
      }
    }
  }

  return "";
}

function pickFirstObjectFromObjects(objects = [], keys = []) {
  for (const object of safeArray(objects)) {
    for (const key of safeArray(keys)) {
      if (isPlainObject(object?.[key])) {
        return object[key];
      }
    }
  }

  return null;
}

function extractTokens(payload = {}) {
  const objects =
    collectObjects(payload);

  return {
    token:
      normalizeTokenValue(
        pickFirstTextFromObjects(
          objects,
          TOKEN_KEYS
        )
      ),

    refreshToken:
      normalizeTokenValue(
        pickFirstTextFromObjects(
          objects,
          REFRESH_TOKEN_KEYS
        )
      ),
  };
}

function getProfileBranches(user = {}) {
  const current =
    safeObject(user);

  return [
    current,
    safeObject(current.user),
    safeObject(current.usuario),
    safeObject(current.profile),
    safeObject(current.account),
    safeObject(current.me),
    safeObject(current.raw),
    safeObject(current.raw?.user),
    safeObject(current.raw?.profile),
    safeObject(current.data),
    safeObject(current.data?.user),
  ].filter((item) =>
    item &&
    typeof item === "object" &&
    Object.keys(item).length > 0
  );
}

function hasUsableUser(user = null) {
  const current =
    safeObject(user);

  if (!Object.keys(current).length) {
    return false;
  }

  return getProfileBranches(current).some((branch) => {
    return Boolean(
      safeText(branch.id, "") ||
        safeText(branch.userId, "") ||
        safeText(branch.user_id, "") ||
        safeText(branch.uid, "") ||
        safeText(branch.sub, "") ||
        safeText(branch._id, "") ||
        safeText(branch.username, "") ||
        safeText(branch.userName, "") ||
        safeText(branch.user_name, "") ||
        safeText(branch.email, "") ||
        safeText(branch.mail, "") ||
        safeText(branch.phone, "") ||
        safeText(branch.telefono, "") ||
        safeText(branch.name, "") ||
        safeText(branch.displayName, "") ||
        safeText(branch.fullName, "")
    );
  });
}

function extractUser(payload = {}) {
  const objects =
    collectObjects(payload);

  const direct =
    pickFirstObjectFromObjects(
      objects,
      USER_KEYS
    );

  if (hasUsableUser(direct)) {
    return direct;
  }

  for (const object of objects) {
    if (
      hasUsableUser(object) &&
      !extractTokens(object).token &&
      !object.ok &&
      !object.success
    ) {
      return object;
    }
  }

  return null;
}

function extractSession(payload = {}) {
  const objects =
    collectObjects(payload);

  return (
    pickFirstObjectFromObjects(
      objects,
      SESSION_KEYS
    ) ||
    null
  );
}

function resolveRoleFromPayload(payload = {}, user = null) {
  const objects =
    collectObjects(payload);

  return safeLower(
    pickFirstTextFromObjects(
      objects,
      [
        "role",
        "rol",
        "userRole",
        "user_role",
        "type",
        "tipo",
      ]
    ) ||
      user?.role ||
      user?.rol ||
      "user",
    "user"
  );
}

function resolveAvatar(user = {}) {
  const branches =
    getProfileBranches(user);

  for (const branch of branches) {
    const avatar =
      safeText(
        branch.avatar ||
          branch.avatarUrl ||
          branch.avatar_url ||
          branch.photo ||
          branch.photoUrl ||
          branch.photo_url ||
          branch.image ||
          branch.imageUrl ||
          branch.image_url ||
          branch.profileImage ||
          branch.profile_image ||
          branch.picture ||
          branch.pictureUrl ||
          branch.picture_url ||
          "",
        ""
      );

    if (avatar) {
      return avatar;
    }
  }

  return "";
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

function normalizeUserForClient(user = {}, role = "user") {
  const source =
    safeObject(user);

  if (!hasUsableUser(source)) {
    return null;
  }

  const userId =
    safeText(
      source.userId ||
        source.user_id ||
        source.uid ||
        source.sub ||
        source.id ||
        source._id ||
        "",
      ""
    );

  const email =
    safeText(
      source.email ||
        source.mail ||
        "",
      ""
    );

  const username =
    safeText(
      source.username ||
        source.userName ||
        source.user_name ||
        source.usernameLower ||
        source.username_lower ||
        source.slug ||
        "",
      ""
    );

  const usernameLower =
    normalizeUsername(
      source.usernameLower ||
        source.username_lower ||
        username ||
        email ||
        userId
    );

  const slug =
    normalizeUsername(
      source.slug ||
        usernameLower ||
        username ||
        email ||
        userId
    );

  const displayName =
    safeText(
      source.displayName ||
        source.fullName ||
        source.name ||
        source.nombre ||
        username ||
        email ||
        "Usuario",
      "Usuario"
    );

  const finalRole =
    safeLower(
      role ||
        source.role ||
        source.rol ||
        "user",
      "user"
    );

  const avatar =
    resolveAvatar(source);

  return {
    ...source,

    id:
      source.id ||
      userId ||
      null,

    userId:
      source.userId ||
      userId ||
      null,

    uid:
      source.uid ||
      userId ||
      null,

    sub:
      source.sub ||
      userId ||
      null,

    email:
      email || null,

    emailLower:
      source.emailLower ||
      source.email_lower ||
      (email ? email.toLowerCase() : null),

    username:
      username || usernameLower || null,

    usernameLower:
      usernameLower || null,

    username_lower:
      source.username_lower ||
      usernameLower ||
      null,

    slug:
      slug || null,

    name:
      displayName,

    nombre:
      source.nombre ||
      displayName,

    displayName,

    fullName:
      source.fullName ||
      displayName,

    role:
      finalRole,

    rol:
      finalRole,

    roles:
      unique([
        finalRole,
        ...safeArray(source.roles),
      ]),

    permissions:
      safeArray(
        source.permissions ||
          source.permisos
      ),

    permisos:
      safeArray(
        source.permisos ||
          source.permissions
      ),

    avatar:
      avatar || null,

    avatarUrl:
      avatar || null,

    picture:
      avatar || null,

    hasAvatar:
      source.hasAvatar === true ||
      source.has_avatar === true ||
      Boolean(avatar),
  };
}

/* =========================================================
   APPCORE AUTH COMMIT
========================================================= */

export function setAuthPayloadCommitter(fn) {
  authPayloadCommitter =
    isFunction(fn)
      ? fn
      : null;

  return true;
}

function commitAuthPayloadToCore(AppCore, payload = {}, meta = {}) {
  if (!AppCore) {
    return false;
  }

  const data =
    safeObject(payload);

  const tokens =
    extractTokens(data);

  if (
    tokens.token ||
    tokens.refreshToken
  ) {
    setAuthTokens({
      token:
        tokens.token,

      refreshToken:
        tokens.refreshToken,
    });
  }

  const rawUser =
    extractUser(data);

  const session =
    extractSession(data);

  const role =
    resolveRoleFromPayload(
      data,
      rawUser
    );

  const user =
    normalizeUserForClient(
      rawUser,
      role
    );

  const activeToken =
    tokens.token ||
    getAccessToken({
      allowStorageTokens:
        true,
    });

  const authenticated =
    Boolean(
      activeToken &&
        user
    );

  const patch = {};

  if (activeToken) {
    patch.token =
      activeToken;

    patch.accessToken =
      activeToken;

    patch.access_token =
      activeToken;

    patch.hasToken =
      true;
  }

  if (tokens.refreshToken) {
    patch.refreshToken =
      tokens.refreshToken;

    patch.refresh_token =
      tokens.refreshToken;
  }

  if (session) {
    patch.session =
      {
        ...session,
        token:
          activeToken || session.token || null,
        accessToken:
          activeToken || session.accessToken || null,
        access_token:
          activeToken || session.access_token || null,
        refreshToken:
          tokens.refreshToken || session.refreshToken || null,
        refresh_token:
          tokens.refreshToken || session.refresh_token || null,
        user:
          user || session.user || null,
        usuario:
          user || session.usuario || null,
        role,
        rol:
          role,
        authenticated,
      };

    patch.sessionData =
      patch.session;

    patch.sessionId =
      session.sessionId ||
      session.session_id ||
      session.sid ||
      AppCore?.state?.sessionId ||
      null;

    patch.sessionUserId =
      session.sessionUserId ||
      session.session_user_id ||
      session.userId ||
      session.user_id ||
      user?.userId ||
      user?.id ||
      AppCore?.state?.sessionUserId ||
      null;
  }

  if (user) {
    patch.user =
      user;

    patch.currentUser =
      user;

    patch.authUser =
      user;

    patch.sessionUser =
      user;

    patch.role =
      role;

    patch.rol =
      role;

    patch.userRole =
      role;

    patch.roles =
      unique([
        role,
        ...safeArray(user.roles),
      ]);

    patch.currentResolvedUsername =
      user.slug ||
      user.usernameLower ||
      user.username ||
      AppCore?.state?.currentResolvedUsername ||
      null;

    patch.resolvedUsername =
      user.slug ||
      user.usernameLower ||
      user.username ||
      AppCore?.state?.resolvedUsername ||
      null;

    patch.avatar =
      user.avatarUrl ||
      user.avatar ||
      null;

    patch.avatarUrl =
      user.avatarUrl ||
      user.avatar ||
      null;

    patch.authenticated =
      authenticated;

    patch.lastAuthSource =
      safeText(
        meta.source,
        SOURCE
      );

    patch.lastMeAt =
      meta.endpoint &&
      /\/auth\/(?:me|session|profile|whoami|current)\b/i.test(meta.endpoint)
        ? safeIsoDate()
        : AppCore?.state?.lastMeAt || null;
  }

  if (!Object.keys(patch).length) {
    return false;
  }

  try {
    if (
      AppCore.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        patch
      );
    }
  } catch {}

  try {
    AppCore.setState?.(
      patch,
      {
        source:
          "core:http:auth-payload",
        emit:
          false,
        emitState:
          false,
        silent:
          true,
        forceUnauthenticated:
          patch.authenticated !== true,
        allowExplicitAuthenticated:
          patch.authenticated === true,
      }
    );
  } catch {}

  try {
    AppCore.patchState?.(
      patch,
      {
        source:
          "core:http:auth-payload",
        emit:
          false,
        emitState:
          false,
        silent:
          true,
      }
    );
  } catch {}

  if (user && meta.emit !== false) {
    const eventPayload =
      sanitizePayload({
        source:
          "core:http",

        reason:
          safeText(
            meta.reason,
            "auth-payload"
          ),

        user,

        role,

        authenticated,
      });

    try {
      AppCore.events?.emit?.(
        "app:user:change",
        eventPayload
      );
    } catch {}

    try {
      AppCore.events?.emit?.(
        "app:auth:ready",
        eventPayload
      );
    } catch {}
  }

  return true;
}

function handleAuthPayload(payload = {}, meta = {}) {
  const tokens =
    extractTokens(payload);

  if (
    tokens.token ||
    tokens.refreshToken
  ) {
    setAuthTokens({
      token:
        tokens.token,

      refreshToken:
        tokens.refreshToken,

      persist:
        meta.persistTokens === true,
    });
  }

  try {
    if (isFunction(authPayloadCommitter)) {
      authPayloadCommitter(
        payload,
        meta
      );
    }
  } catch {}

  try {
    commitAuthPayloadToCore(
      installedAppCore,
      payload,
      meta
    );
  } catch {}

  return payload;
}

/* =========================================================
   ERRORS
========================================================= */

export class HttpError extends Error {
  constructor(message = "HTTP_ERROR", options = {}) {
    super(
      redactHttpText(message)
    );

    this.name =
      "HttpError";

    this.status =
      options.status || 0;

    this.statusCode =
      options.status || 0;

    this.code =
      options.code || "HTTP_ERROR";

    this.method =
      options.method || "";

    this.url =
      redactHttpText(options.url || "");

    this.path =
      options.path || "";

    this.requestId =
      options.requestId || "";

    this.data =
      sanitizePayload(options.data ?? null);

    this.rawText =
      redactHttpText(options.rawText || "");

    this.headers =
      sanitizePayload(options.headers || {});

    this.retriable =
      Boolean(options.retriable);

    this.timeout =
      Boolean(options.timeout);

    this.aborted =
      Boolean(options.aborted);

    this.network =
      Boolean(options.network);

    this.at =
      safeIsoDate();

    defineHiddenValue(
      this,
      "raw",
      options.raw || null
    );
  }
}

function headersToObject(headers) {
  const output = {};

  try {
    headers?.forEach?.((value, key) => {
      output[key] =
        value;
    });
  } catch {}

  return output;
}

function getResponseRequestId(response) {
  try {
    return (
      response.headers.get("x-request-id") ||
      response.headers.get("x-correlation-id") ||
      response.headers.get("x-auth-request-id") ||
      ""
    );
  } catch {
    return "";
  }
}

function getPayloadCode(payload = {}, fallback = "HTTP_ERROR") {
  return safeText(
    payload?.code ||
      payload?.errorCode ||
      payload?.error_code ||
      payload?.error ||
      payload?.status ||
      fallback,
    fallback
  );
}

function getPayloadMessage(payload = {}, fallback = "Error HTTP.") {
  return safeText(
    payload?.message ||
      payload?.mensaje ||
      payload?.errorMessage ||
      payload?.error_message ||
      payload?.detail ||
      payload?.description ||
      payload?.error ||
      fallback,
    fallback
  );
}

function looksLikeHtml(text = "") {
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(
    safeText(text, "")
  );
}

async function readResponse(response, options = {}) {
  const opts =
    safeObject(options);

  const responseType =
    safeText(
      opts.responseType,
      "json"
    );

  if (responseType === "raw") {
    return {
      data:
        response,

      text:
        "",

      json:
        false,
    };
  }

  if (responseType === "blob") {
    try {
      return {
        data:
          await response.blob(),

        text:
          "",

        json:
          false,
      };
    } catch {
      return {
        data:
          null,

        text:
          "",

        json:
          false,
      };
    }
  }

  if (
    responseType === "arrayBuffer" ||
    responseType === "arraybuffer"
  ) {
    try {
      return {
        data:
          await response.arrayBuffer(),

        text:
          "",

        json:
          false,
      };
    } catch {
      return {
        data:
          null,

        text:
          "",

        json:
          false,
      };
    }
  }

  let text =
    "";

  try {
    text =
      await response.text();
  } catch {
    text =
      "";
  }

  if (!text) {
    return {
      data:
        null,

      text:
        "",

      json:
        false,
    };
  }

  const contentType =
    safeLower(
      response.headers?.get?.("content-type") || "",
      ""
    );

  const looksJson =
    contentType.includes("application/json") ||
    contentType.includes("+json") ||
    /^[\s]*[\[{]/.test(text);

  if (
    responseType === "text" ||
    (
      opts.expectJson === false &&
      !looksJson
    )
  ) {
    return {
      data:
        text,

      text,

      json:
        false,
    };
  }

  if (looksJson) {
    try {
      return {
        data:
          JSON.parse(text),

        text,

        json:
          true,
      };
    } catch {
      throw new HttpError(
        "La API devolvió una respuesta JSON inválida.",
        {
          status:
            response.status,

          code:
            "INVALID_JSON_RESPONSE",

          method:
            opts.method,

          url:
            opts.url,

          path:
            opts.path,

          requestId:
            getResponseRequestId(response),

          rawText:
            text.slice(0, 300),
        }
      );
    }
  }

  if (
    response.ok &&
    opts.expectJson === true
  ) {
    throw new HttpError(
      looksLikeHtml(text)
        ? "La API devolvió HTML. La base URL apunta al frontend o a una ruta incorrecta."
        : "La API no devolvió JSON. Revisa la baseURL del frontend.",
      {
        status:
          response.status,

        code:
          looksLikeHtml(text)
            ? "HTML_RESPONSE_FROM_API"
            : "NON_JSON_RESPONSE",

        method:
          opts.method,

        url:
          opts.url,

        path:
          opts.path,

        requestId:
          getResponseRequestId(response),

        rawText:
          text.slice(0, 300),
      }
    );
  }

  return {
    data:
      text,

    text,

    json:
      false,
  };
}

/* =========================================================
   BODY / HEADERS
========================================================= */

function normalizeHeaders(headers = {}) {
  if (isHeaders(headers)) {
    const output = {};

    try {
      headers.forEach((value, key) => {
        output[key] =
          value;
      });
    } catch {}

    return output;
  }

  return {
    ...safeObject(headers),
  };
}

function hasHeader(headers = {}, name = "") {
  const needle =
    safeLower(name, "");

  return Object.keys(headers).some((key) =>
    safeLower(key, "") === needle
  );
}

function setHeader(headers = {}, name = "", value = "") {
  const cleanName =
    safeText(name, "");

  if (
    !cleanName ||
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return headers;
  }

  const existingKey =
    Object.keys(headers).find((key) =>
      safeLower(key, "") === safeLower(cleanName, "")
    );

  headers[existingKey || cleanName] =
    value;

  return headers;
}

function deleteHeader(headers = {}, name = "") {
  const needle =
    safeLower(name, "");

  for (const key of Object.keys(headers)) {
    if (safeLower(key, "") === needle) {
      delete headers[key];
    }
  }

  return headers;
}

function buildHeaders({
  headers = {},
  body = undefined,
  auth = true,
  noAuthHeader = false,
  requestId = "",
  allowStorageTokens = true,
} = {}) {
  const finalHeaders =
    normalizeHeaders(headers);

  if (!hasHeader(finalHeaders, "Accept")) {
    finalHeaders.Accept =
      "application/json";
  }

  if (!hasHeader(finalHeaders, "X-Request-Id")) {
    finalHeaders["X-Request-Id"] =
      requestId || createRequestId();
  }

  if (!hasHeader(finalHeaders, "X-Onion-Client")) {
    finalHeaders["X-Onion-Client"] =
      "onion-spa";
  }

  if (!hasHeader(finalHeaders, "X-Onion-HTTP-Version")) {
    finalHeaders["X-Onion-HTTP-Version"] =
      HTTP_VERSION;
  }

  const shouldSetJson =
    body !== undefined &&
    body !== null &&
    !isFormData(body) &&
    !isBlob(body) &&
    typeof body !== "string" &&
    !hasHeader(finalHeaders, "Content-Type");

  if (shouldSetJson) {
    finalHeaders["Content-Type"] =
      "application/json";
  }

  if (
    auth !== false &&
    noAuthHeader !== true &&
    !hasHeader(finalHeaders, "Authorization")
  ) {
    const token =
      getAccessToken({
        allowStorageTokens,
      });

    if (token) {
      finalHeaders.Authorization =
        token.startsWith("Bearer ")
          ? token
          : `Bearer ${token}`;
    }
  }

  if (
    auth === false ||
    noAuthHeader === true
  ) {
    deleteHeader(
      finalHeaders,
      "Authorization"
    );
  }

  return finalHeaders;
}

function buildBody(body = undefined) {
  if (
    body === undefined ||
    body === null
  ) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    isFormData(body) ||
    isBlob(body)
  ) {
    return body;
  }

  try {
    return JSON.stringify(body);
  } catch {
    return JSON.stringify({});
  }
}

/* =========================================================
   ABORT / TIMEOUT
========================================================= */

function createAbortContext(options = {}) {
  const opts =
    safeObject(options);

  const timeoutMs =
    safeNumber(
      opts.timeoutMs,
      DEFAULT_TIMEOUT_MS
    );

  if (typeof AbortController === "undefined") {
    return {
      signal:
        opts.signal || undefined,

      timedOut:
        () => false,

      cleanup:
        () => {},
    };
  }

  const controller =
    new AbortController();

  let timer =
    null;

  let timeoutFired =
    false;

  const onExternalAbort =
    () => {
      try {
        controller.abort(
          opts.signal?.reason ||
            "external-abort"
        );
      } catch {
        try {
          controller.abort();
        } catch {}
      }
    };

  if (opts.signal) {
    try {
      if (opts.signal.aborted) {
        onExternalAbort();
      } else {
        opts.signal.addEventListener(
          "abort",
          onExternalAbort,
          {
            once:
              true,
          }
        );
      }
    } catch {}
  }

  if (timeoutMs > 0) {
    try {
      timer =
        setTimeout(() => {
          timeoutFired =
            true;

          try {
            controller.abort(
              "request-timeout"
            );
          } catch {
            try {
              controller.abort();
            } catch {}
          }
        }, timeoutMs);
    } catch {}
  }

  return {
    signal:
      controller.signal,

    timedOut:
      () => Boolean(timeoutFired),

    cleanup:
      () => {
        try {
          if (timer) {
            clearTimeout(timer);
          }
        } catch {}

        try {
          opts.signal?.removeEventListener?.(
            "abort",
            onExternalAbort
          );
        } catch {}
      },
  };
}

/* =========================================================
   RETRY
========================================================= */

function isRetryableStatus(status = 0) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function methodAllowsRetry(method = "GET", options = {}) {
  const cleanMethod =
    safeText(method, "GET").toUpperCase();

  if (options.retryUnsafe === true) {
    return true;
  }

  return [
    "GET",
    "HEAD",
    "OPTIONS",
  ].includes(cleanMethod);
}

function defaultRetriesFor(method = "GET") {
  return methodAllowsRetry(method)
    ? 1
    : 0;
}

function parseRetryAfterMs(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return 0;
  }

  const seconds =
    Number(raw);

  if (Number.isFinite(seconds)) {
    return Math.max(
      0,
      seconds * 1000
    );
  }

  const dateMs =
    Date.parse(raw);

  if (Number.isFinite(dateMs)) {
    return Math.max(
      0,
      dateMs - Date.now()
    );
  }

  return 0;
}

function getRetryAfterHeader(error = null) {
  const headers =
    safeObject(error?.headers);

  for (const [key, value] of Object.entries(headers)) {
    if (safeLower(key, "") === "retry-after") {
      return safeText(value, "");
    }
  }

  return "";
}

function getRetryDelayMs(attempt = 0, options = {}, error = null) {
  const retryAfter =
    parseRetryAfterMs(
      getRetryAfterHeader(error)
    );

  if (retryAfter > 0) {
    return Math.min(
      retryAfter,
      safeNumber(options.retryMaxDelayMs, 10000)
    );
  }

  const base =
    safeNumber(
      options.retryDelayMs,
      250
    );

  const jitter =
    Math.floor(
      Math.random() * Math.max(1, base)
    );

  return Math.min(
    safeNumber(options.retryMaxDelayMs, 3000),
    base * Math.max(1, attempt + 1) + jitter
  );
}

/* =========================================================
   LOW LEVEL REQUEST
========================================================= */

async function performRequest(endpoint = "/", options = {}) {
  const opts =
    safeObject(options);

  const method =
    safeText(
      opts.method,
      "GET"
    ).toUpperCase();

  const url =
    buildApiUrl(
      endpoint,
      opts
    );

  const path =
    getUrlPathname(url);

  const requestId =
    safeText(
      opts.requestId,
      createRequestId()
    );

  const retries =
    Number.isFinite(Number(opts.retries))
      ? Math.max(0, Number(opts.retries))
      : defaultRetriesFor(method);

  const timeoutMs =
    safeNumber(
      opts.timeoutMs,
      AUTH_PATH_RE.test(path)
        ? DEFAULT_AUTH_TIMEOUT_MS
        : DEFAULT_TIMEOUT_MS
    );

  const requestBody =
    opts.body !== undefined
      ? opts.body
      : opts.data;

  const fetchBody =
    [
      "GET",
      "HEAD",
    ].includes(method)
      ? undefined
      : buildBody(requestBody);

  const headers =
    buildHeaders({
      headers:
        opts.headers,

      body:
        requestBody,

      auth:
        opts.auth !== false,

      noAuthHeader:
        opts.noAuthHeader,

      requestId,

      allowStorageTokens:
        opts.allowStorageTokens !== false,
    });

  const fetchFn =
    getFetch();

  if (!fetchFn) {
    throw new HttpError(
      "Fetch API no disponible.",
      {
        status:
          0,
        code:
          "FETCH_UNAVAILABLE",
        method,
        url,
        path,
        requestId,
        network:
          true,
      }
    );
  }

  let lastError =
    null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const abortCtx =
      createAbortContext({
        ...opts,
        timeoutMs,
      });

    try {
      if (opts.emitLifecycleEvents === true) {
        safeEmit(
          "http:request:start",
          {
            method,
            url:
              redactHttpText(url),
            path,
            attempt,
            requestId,
          }
        );
      }

      const response =
        await fetchFn(
          url,
          {
            method,
            headers,
            body:
              fetchBody,

            credentials:
              opts.credentials === "omit"
                ? "omit"
                : "include",

            mode:
              opts.mode || "cors",

            cache:
              opts.cache ||
              (
                AUTH_PATH_RE.test(path)
                  ? "no-store"
                  : "no-cache"
              ),

            redirect:
              opts.redirect || "follow",

            signal:
              abortCtx.signal,
          }
        );

      const parsed =
        await readResponse(
          response,
          {
            ...opts,
            method,
            url,
            path,
            expectJson:
              opts.expectJson !== false,
          }
        );

      if (!response.ok) {
        const data =
          isPlainObject(parsed.data)
            ? parsed.data
            : {};

        const error =
          new HttpError(
            getPayloadMessage(
              data,
              `HTTP ${response.status}`
            ),
            {
              status:
                response.status,

              code:
                getPayloadCode(
                  data,
                  response.status === 401
                    ? "UNAUTHORIZED"
                    : "HTTP_ERROR"
                ),

              method,
              url,
              path,
              requestId:
                getResponseRequestId(response) ||
                requestId,

              data:
                parsed.data,

              rawText:
                parsed.text,

              headers:
                headersToObject(response.headers),

              retriable:
                isRetryableStatus(response.status),
            }
          );

        if (
          attempt < retries &&
          methodAllowsRetry(method, opts) &&
          isRetryableStatus(response.status)
        ) {
          lastError =
            error;

          await wait(
            getRetryDelayMs(
              attempt,
              opts,
              error
            ),
            opts.signal
          );

          continue;
        }

        throw error;
      }

      const data =
        parsed.data;

      if (
        opts.captureAuth !== false &&
        AUTH_PATH_RE.test(path) &&
        isPlainObject(data)
      ) {
        handleAuthPayload(
          data,
          {
            endpoint:
              path,

            method,

            requestId,

            source:
              "core:http",

            reason:
              AUTH_ME_PATH_RE.test(path)
                ? "me"
                : path.includes("/login")
                  ? "login"
                  : path.includes("/refresh")
                    ? "refresh"
                    : "auth-response",

            persistTokens:
              opts.persistTokens === true,

            emit:
              opts.emitAuthEvents !== false,
          }
        );
      }

      if (opts.emitFinalEvents !== false) {
        safeEmit(
          "http:request:success",
          {
            method,
            path,
            status:
              response.status,
            attempt,
            requestId:
              getResponseRequestId(response) ||
              requestId,
          }
        );
      }

      return data;
    } catch (error) {
      const aborted =
        error?.name === "AbortError" ||
        String(error?.message || "").toLowerCase().includes("abort");

      const timeout =
        abortCtx.timedOut?.() === true ||
        String(error?.message || "").includes("request-timeout");

      const networkError =
        error instanceof TypeError ||
        error?.network === true;

      const normalized =
        error instanceof HttpError
          ? error
          : new HttpError(
              timeout
                ? "La solicitud ha excedido el tiempo máximo."
                : aborted
                  ? "La solicitud fue cancelada."
                  : "No se pudo contactar con la API.",
              {
                status:
                  0,

                code:
                  timeout
                    ? "REQUEST_TIMEOUT"
                    : aborted
                      ? "REQUEST_ABORTED"
                      : "NETWORK_ERROR",

                method,
                url,
                path,
                requestId,
                network:
                  networkError,
                timeout,
                aborted:
                  aborted && !timeout,
                retriable:
                  !aborted || timeout,
                raw:
                  error,
              }
            );

      lastError =
        normalized;

      if (
        attempt < retries &&
        methodAllowsRetry(method, opts) &&
        (
          normalized.network ||
          normalized.timeout ||
          normalized.retriable
        ) &&
        !normalized.aborted
      ) {
        await wait(
          getRetryDelayMs(
            attempt,
            opts,
            normalized
          ),
          opts.signal
        );

        continue;
      }

      if (opts.emitFinalEvents !== false) {
        safeEmit(
          "http:request:error",
          {
            method,
            path,
            requestId,
            error:
              normalized,
          }
        );
      }

      throw normalized;
    } finally {
      abortCtx.cleanup();
    }
  }

  throw lastError ||
    new HttpError(
      "No se pudo completar la solicitud.",
      {
        code:
          "REQUEST_FAILED",
      }
    );
}

/* =========================================================
   REFRESH
========================================================= */

function shouldAttemptRefresh(error, endpoint = "", options = {}) {
  const opts =
    safeObject(options);

  if (
    opts.skipRefresh === true ||
    opts._skipAuthRefresh === true ||
    opts.skipAuthRefresh === true
  ) {
    return false;
  }

  if (opts.auth === false) {
    return false;
  }

  if (!(error instanceof HttpError)) {
    return false;
  }

  if (
    error.status !== 401 &&
    error.status !== 419
  ) {
    return false;
  }

  const path =
    getUrlPathname(
      buildApiUrl(
        endpoint,
        opts
      )
    );

  if (
    REFRESH_PATH_RE.test(path) ||
    LOGIN_PATH_RE.test(path) ||
    LOGOUT_PATH_RE.test(path) ||
    (
      AUTH_PUBLIC_CONTROL_PATH_RE.test(path) &&
      !AUTH_ME_PATH_RE.test(path)
    )
  ) {
    return false;
  }

  return true;
}

export async function refreshSession(options = {}) {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise =
    (async () => {
      const refreshToken =
        getRefreshToken({
          allowStorageTokens:
            true,
        });

      const body =
        refreshToken
          ? {
              refreshToken,
              refresh_token:
                refreshToken,
            }
          : undefined;

      const result =
        await performRequest(
          "/auth/refresh",
          {
            method:
              "POST",

            body,

            auth:
              false,

            noAuthHeader:
              true,

            skipRefresh:
              true,

            _skipAuthRefresh:
              true,

            skipAuthRefresh:
              true,

            timeoutMs:
              safeNumber(
                options.timeoutMs,
                DEFAULT_REFRESH_TIMEOUT_MS
              ),

            retries:
              0,

            captureAuth:
              true,

            persistTokens:
              options.persistTokens === true,

            reason:
              "refresh-session",

            emitAuthEvents:
              options.emitAuthEvents,
          }
        );

      if (isPlainObject(result)) {
        handleAuthPayload(
          result,
          {
            endpoint:
              "/api/auth/refresh",

            method:
              "POST",

            reason:
              "refresh-session",

            source:
              "core:http",

            emit:
              options.emitAuthEvents !== false,
          }
        );
      }

      return result;
    })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise =
      null;
  }
}

/* =========================================================
   PUBLIC REQUEST API
========================================================= */

export async function request(firstArg = "/", secondArg = {}, thirdArg = {}) {
  let endpoint =
    firstArg;

  let options =
    safeObject(secondArg);

  if (
    typeof firstArg === "string" &&
    /^[A-Z]+$/i.test(firstArg) &&
    typeof secondArg === "string"
  ) {
    endpoint =
      secondArg;

    options =
      {
        ...safeObject(thirdArg),
        method:
          firstArg.toUpperCase(),
      };
  }

  try {
    return await performRequest(
      endpoint,
      options
    );
  } catch (error) {
    if (
      shouldAttemptRefresh(
        error,
        endpoint,
        options
      )
    ) {
      try {
        await refreshSession({
          emitAuthEvents:
            options.emitAuthEvents,
        });

        return await performRequest(
          endpoint,
          {
            ...options,
            skipRefresh:
              true,
            _skipAuthRefresh:
              true,
            skipAuthRefresh:
              true,
            retries:
              0,
          }
        );
      } catch (refreshError) {
        safeWarn(
          "Refresh falló; se conserva el error original.",
          refreshError
        );

        clearAuthTokens({
          storage:
            false,
        });

        throw error;
      }
    }

    throw error;
  }
}

export function get(endpoint = "/", options = {}) {
  return request(
    endpoint,
    {
      ...safeObject(options),
      method:
        "GET",
    }
  );
}

export function post(endpoint = "/", body = undefined, options = {}) {
  return request(
    endpoint,
    {
      ...safeObject(options),
      method:
        "POST",
      body,
    }
  );
}

export function put(endpoint = "/", body = undefined, options = {}) {
  return request(
    endpoint,
    {
      ...safeObject(options),
      method:
        "PUT",
      body,
    }
  );
}

export function patch(endpoint = "/", body = undefined, options = {}) {
  return request(
    endpoint,
    {
      ...safeObject(options),
      method:
        "PATCH",
      body,
    }
  );
}

export function del(endpoint = "/", bodyOrOptions = {}, maybeOptions = undefined) {
  if (maybeOptions !== undefined) {
    return request(
      endpoint,
      {
        ...safeObject(maybeOptions),
        method:
          "DELETE",
        body:
          bodyOrOptions,
      }
    );
  }

  return request(
    endpoint,
    {
      ...safeObject(bodyOrOptions),
      method:
        "DELETE",
    }
  );
}

/* =========================================================
   AUTH API
========================================================= */

export function login(credentials = {}, options = {}) {
  return post(
    "/auth/login",
    credentials,
    {
      auth:
        false,
      noAuthHeader:
        true,
      retries:
        0,
      timeoutMs:
        DEFAULT_AUTH_TIMEOUT_MS,
      captureAuth:
        true,
      persistTokens:
        options.persistTokens === true,
      ...safeObject(options),
    }
  );
}

export function me(options = {}) {
  return get(
    "/auth/me",
    {
      auth:
        true,
      timeoutMs:
        DEFAULT_AUTH_TIMEOUT_MS,
      captureAuth:
        true,
      retries:
        0,
      cache:
        "no-store",
      ...safeObject(options),
    }
  );
}

export function logout(options = {}) {
  return post(
    "/auth/logout",
    {},
    {
      auth:
        true,
      timeoutMs:
        DEFAULT_AUTH_TIMEOUT_MS,
      retries:
        0,
      skipRefresh:
        true,
      _skipAuthRefresh:
        true,
      skipAuthRefresh:
        true,
      ...safeObject(options),
    }
  ).finally(() => {
    clearAuthTokens({
      storage:
        options.clearStorage !== false,
    });
  });
}

export function refresh(options = {}) {
  return refreshSession(options);
}

/* =========================================================
   APPCORE INSTALL
========================================================= */

function configureAppCoreOrigin(AppCore, options = {}) {
  const opts =
    safeObject(options);

  const explicit =
    opts.apiOrigin ||
    opts.baseURL ||
    opts.baseUrl ||
    opts.apiBase ||
    "";

  if (explicit) {
    setApiOrigin(
      explicit,
      opts
    );
  } else {
    setApiOrigin(
      resolveRuntimeApiOrigin() || DEFAULT_API_ORIGIN
    );
  }

  try {
    if (
      AppCore?.config &&
      typeof AppCore.config === "object"
    ) {
      AppCore.config.apiOrigin =
        getApiOrigin();

      AppCore.config.apiBase =
        getApiOrigin();

      AppCore.config.apiUrl =
        getApiOrigin();

      if (!AppCore.config.api) {
        AppCore.config.api =
          {};
      }

      AppCore.config.api.origin =
        getApiOrigin();

      AppCore.config.api.baseUrl =
        getApiOrigin();

      AppCore.config.api.base =
        getApiOrigin();
    }
  } catch {}

  return getApiOrigin();
}

function createApiClientFacade() {
  return {
    version:
      HTTP_VERSION,

    get origin() {
      return getApiOrigin();
    },

    setOrigin:
      setApiOrigin,

    buildUrl:
      buildApiUrl,

    request,

    get,
    post,
    put,
    patch,

    delete:
      del,

    del,

    login,
    me,
    refresh,
    refreshSession,
    logout,

    setTokenProvider,
    setAuthTokens,
    clearAuthTokens,
    getAccessToken,
    getRefreshToken,

    install:
      installHttp,

    getSnapshot:
      getHttpSnapshot,

    getDebugSnapshot:
      getHttpSnapshot,
  };
}

export function installHttp(AppCore = null, options = {}) {
  installedAppCore =
    AppCore || installedAppCore;

  configureAppCoreOrigin(
    installedAppCore,
    options
  );

  setTokenProvider(() => {
    const state =
      safeObject(installedAppCore?.state);

    const session =
      safeObject(state.session || state.sessionData);

    return (
      state.token ||
      state.accessToken ||
      state.access_token ||
      state.authToken ||
      state.jwt ||
      session.token ||
      session.accessToken ||
      session.access_token ||
      tokenMemory.token ||
      ""
    );
  });

  setAuthPayloadCommitter((payload, meta) => {
    commitAuthPayloadToCore(
      installedAppCore,
      payload,
      meta
    );
  });

  const api =
    createApiClientFacade();

  try {
    if (
      installedAppCore &&
      typeof installedAppCore === "object"
    ) {
      defineHiddenValue(
        installedAppCore,
        "http",
        api
      );

      defineHiddenValue(
        installedAppCore,
        "Http",
        api
      );

      defineHiddenValue(
        installedAppCore,
        "apiClient",
        api
      );

      if (
        !installedAppCore.services ||
        typeof installedAppCore.services !== "object"
      ) {
        installedAppCore.services =
          {};
      }

      installedAppCore.services.http =
        api;

      installedAppCore.services.Http =
        api;

      installedAppCore.services.api =
        api;

      installedAppCore.services.apiClient =
        api;
    }
  } catch {}

  try {
    if (
      installedAppCore?.modules &&
      isFunction(installedAppCore.modules.register)
    ) {
      installedAppCore.modules.register(
        "Http",
        api,
        {
          overwrite:
            true,
          replace:
            true,
          aliases:
            [
              "http",
              "ApiClient",
              "apiClient",
            ],
          source:
            "core/http.js",
        }
      );
    } else if (
      installedAppCore?.modules &&
      isFunction(installedAppCore.modules.set)
    ) {
      installedAppCore.modules.set(
        "Http",
        api
      );

      installedAppCore.modules.set(
        "http",
        api
      );

      installedAppCore.modules.set(
        "ApiClient",
        api
      );

      installedAppCore.modules.set(
        "apiClient",
        api
      );
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.__ONION_HTTP__ =
        api;

      window.__ONION_API_ORIGIN__ =
        getApiOrigin();
    }
  } catch {}

  safeEmit(
    "http:installed",
    {
      origin:
        getApiOrigin(),

      appCore:
        Boolean(installedAppCore),
    }
  );

  return api;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHttpSnapshot() {
  return sanitizePayload({
    version:
      HTTP_VERSION,

    origin:
      getApiOrigin(),

    defaultOrigin:
      DEFAULT_API_ORIGIN,

    apiPrefix:
      DEFAULT_API_PREFIX,

    installed:
      Boolean(installedAppCore),

    hasFetch:
      Boolean(getFetch()),

    hasAbortController:
      typeof AbortController === "function",

    hasTokenProvider:
      Boolean(tokenProvider),

    hasAuthPayloadCommitter:
      Boolean(authPayloadCommitter),

    hasAuthModule:
      Boolean(getAuthModule()),

    hasAccessToken:
      Boolean(getAccessToken()),

    hasRefreshToken:
      Boolean(getRefreshToken()),

    refreshInFlight:
      Boolean(refreshPromise),

    endpoints: {
      login:
        buildApiUrl("/auth/login"),

      me:
        buildApiUrl("/auth/me"),

      refresh:
        buildApiUrl("/auth/refresh"),

      logout:
        buildApiUrl("/auth/logout"),
    },

    at:
      safeIsoDate(),
  });
}

/* =========================================================
   DEFAULT FACADE
========================================================= */

try {
  setApiOrigin(
    resolveRuntimeApiOrigin()
  );
} catch {
  setApiOrigin(
    DEFAULT_API_ORIGIN
  );
}

export const Http =
  createApiClientFacade();

try {
  if (isBrowser()) {
    window.__ONION_HTTP__ =
      Http;

    window.__ONION_API_ORIGIN__ =
      getApiOrigin();
  }
} catch {}

export default Http;
