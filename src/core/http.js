/* =========================================================
   Onion SPA - Core HTTP
   Archivo: src/core/http.js

   ONION SUPPORT · CORE HTTP CLIENT
   API.ONIONIT.NET LOCK · AUTH SAFE · REFRESH SAFE · CORS SAFE · 17/10

   Responsabilidades:
   - centralizar llamadas HTTP legacy/facade del frontend
   - apuntar por defecto al backend real: https://api.onionit.net
   - evitar llamadas accidentales a www.onionsupport.com/api
   - soportar cookies cross-origin con credentials: include
   - soportar Authorization Bearer si existe token válido
   - mantener /api/auth/me, /auth/me, /api/me y /me como privados
   - soportar refresh single-flight
   - reintentar requests privadas tras refresh si hay 401/419
   - excluir login/refresh/logout/activation/reset/2FA/MFA/OTP del refresh automático
   - parsear JSON/text/blob/arrayBuffer de forma segura
   - detectar HTML accidental como error de endpoint/baseURL
   - redactar tokens en errores/logs/eventos/snapshots
   - instalarse en AppCore como:
       AppCore.http
       AppCore.Http
       AppCore.apiClient
       AppCore.services.http
       AppCore.services.api
       AppCore.services.apiClient
   - exponer helpers:
       Http.get()
       Http.post()
       Http.request()
       Http.login()
       Http.me()
       Http.refresh()
       Http.logout()

   Candados:
   - apiBase producción siempre https://api.onionit.net
   - api.onionit.net NO es forbidden
   - dominios frontend nunca actúan como API base
   - no localStorage.clear()
   - no sessionStorage.clear()
   - tokens corruptos se descartan, no se truncan
   - token sin usuario no marca authenticated
   - usuario sin token no marca authenticated
   - eventos sin tokens reales
========================================================= */

import { config } from "./config.js";

import {
  normalizeUser as coreNormalizeUser,
  hasValidToken as coreHasValidToken,
  isPublicApiPath as coreIsPublicApiPath,
  isPrivateApiPath as coreIsPrivateApiPath,
  isUsableUser as coreIsUsableUser,
  getUserUsername as coreGetUserUsername,
  getUserDisplayName as coreGetUserDisplayName,
  getUserAvatarUrl as coreGetUserAvatarUrl,
  redactTokenInText as coreRedactTokenInText,
  safeClone as coreSafeClone,
} from "./helpers.js";

import {
  computeAuthenticated as coreComputeAuthenticated,
} from "./state.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const HTTP_VERSION = "17.0.0";

export const DEFAULT_API_ORIGIN =
  config?.canonicalProductionApiBase || "https://api.onionit.net";

export const DEFAULT_API_PREFIX = "/api";

export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_AUTH_TIMEOUT_MS = 30000;
export const DEFAULT_REFRESH_TIMEOUT_MS = 30000;

const SOURCE = "CoreHTTP";

const AUTH_PATH_RE = /^\/api\/auth(?:\/|$)/i;

const AUTH_ME_PATH_RE =
  /^(?:\/api)?\/auth\/me\/?$|^(?:\/api)?\/me\/?$/i;

const REFRESH_PATH_RE =
  /^\/api\/auth\/(?:refresh|token\/refresh|renew)\/?$/i;

const LOGIN_PATH_RE =
  /^\/api\/auth\/(?:login|2fa\/login|mfa\/login|otp\/login)\/?$/i;

const LOGOUT_PATH_RE =
  /^\/api\/auth\/(?:logout|logout-all|signout|sign-out)\/?$/i;

const AUTH_PUBLIC_CONTROL_PATH_RE =
  /^\/api\/auth\/(?:login|refresh|token\/refresh|renew|logout|logout-all|signout|sign-out|2fa\/(?:login|request|resend|verify)|mfa\/(?:login|request|resend|verify)|otp\/(?:login|request|resend|verify)|activate(?:\/|$)|activate-account(?:\/|$)|activation(?:\/|$)|account\/activate(?:\/|$)|reset-password(?:\/|$)|reset-password-request|reset-password-confirm|forgot-password|recover-password|password-reset(?:\/|$)|_health|health)(?:\/|$)/i;

const FRONTEND_HOST_RE = /^(?:www\.)?onionsupport\.com$/i;

const BODYLESS_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const RETRYABLE_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const RETRYABLE_STATUSES = Object.freeze([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);

const TOKEN_MAX_LENGTH = 8192;

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
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
]);

const USER_KEYS = Object.freeze([
  "user",
  "usuario",
  "me",
  "account",
  "profile",
  "currentUser",
  "authUser",
  "sessionUser",
]);

const SESSION_KEYS = Object.freeze([
  "session",
  "sessionData",
  "authSession",
  "auth_session",
]);

const STORAGE_TOKEN_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "authToken",
  "auth_token",
  "jwt",
]);

const STORAGE_REFRESH_TOKEN_KEYS = Object.freeze([
  "refreshToken",
  "refresh_token",
]);

const STORAGE_TEMP_TOKEN_KEYS = Object.freeze([
  "tempToken",
  "temp_token",
]);

const LEGACY_STORAGE_TOKEN_KEYS = Object.freeze([
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

const LEGACY_STORAGE_REFRESH_TOKEN_KEYS = Object.freeze([
  "onion_refresh_token",
  "onion:refreshToken",
  "onion:refresh_token",
  "onion.refreshToken",
  "auth.refreshToken",
  "auth:refreshToken",
  "auth.refresh_token",
  "auth:refresh_token",
]);

const CORRUPT_TOKEN_VALUES = new Set([
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

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

let apiOrigin = DEFAULT_API_ORIGIN;
let refreshPromise = null;
let installedAppCore = null;
let tokenProvider = null;
let authPayloadCommitter = null;

const tokenMemory = {
  token: "",
  refreshToken: "",
  tempToken: "",
};

const inFlightRequests = new Map();

const httpStats = {
  total: 0,
  success: 0,
  error: 0,
  deduped: 0,
  refresh: 0,
  retry: 0,
  aborted: 0,
  lastRequestAt: "",
  lastUrl: "",
  lastError: null,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function hasWindow() {
  return typeof window !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function isAnyObject(value) {
  return value !== null && typeof value === "object";
}

function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text = safeLower(value, "");

  if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) {
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

function unique(values = []) {
  return [
    ...new Set(
      toArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function canExtend(value) {
  try {
    return value && typeof value === "object" && Object.isExtensible(value);
  } catch {
    return false;
  }
}

function defineHiddenValue(target, key, value) {
  if (!target || !key || !canExtend(target)) {
    return false;
  }

  try {
    Object.defineProperty(target, key, {
      value,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {}

  return false;
}

function safeClone(value, fallback = null) {
  try {
    if (typeof coreSafeClone === "function") {
      return coreSafeClone(value, fallback);
    }
  } catch {}

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function getFetch() {
  try {
    if (typeof globalThis !== "undefined" && isFunction(globalThis.fetch)) {
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
    return hasHeadersConstructor() && value instanceof Headers;
  } catch {
    return false;
  }
}

function isFormData(value) {
  try {
    return typeof FormData !== "undefined" && value instanceof FormData;
  } catch {
    return false;
  }
}

function isBlob(value) {
  try {
    return typeof Blob !== "undefined" && value instanceof Blob;
  } catch {
    return false;
  }
}

function isUrlSearchParams(value) {
  try {
    return typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams;
  } catch {
    return false;
  }
}

function isArrayBuffer(value) {
  try {
    return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
  } catch {
    return false;
  }
}

function isReadableStream(value) {
  try {
    return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
  } catch {
    return false;
  }
}

function createAbortError(message = "Aborted") {
  try {
    return new DOMException(message, "AbortError");
  } catch {
    return Object.assign(new Error(message), {
      name: "AbortError",
    });
  }
}

function wait(ms = 0, signal = null) {
  const delay = Math.max(0, safeNumber(ms, 0));

  if (!delay) {
    return Promise.resolve(true);
  }

  if (signal?.aborted) {
    return Promise.reject(createAbortError("Aborted"));
  }

  return new Promise((resolve, reject) => {
    let timer = null;
    let settled = false;

    const cleanup = () => {
      try {
        if (timer) clearTimeout(timer);
      } catch {}

      try {
        signal?.removeEventListener?.("abort", onAbort);
      } catch {}
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(createAbortError("Aborted"));
    };

    try {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(true);
      }, delay);

      signal?.addEventListener?.("abort", onAbort, { once: true });
    } catch {
      cleanup();
      resolve(true);
    }
  });
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

export function redactHttpText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    if (typeof coreRedactTokenInText === "function") {
      output = coreRedactTokenInText(output);
    }
  } catch {}

  try {
    output = output.replace(
      /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token)=)([^&#\s]+)/gi,
      "$1***"
    );
  } catch {}

  try {
    output = output
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function sanitizePayload(value, depth = 0, keyHint = "") {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : null;
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

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactHttpText(value.message || ""),
      stack: value.stack ? "[stack]" : "",
      status: value.status || value.statusCode || 0,
      code: value.code || "",
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) => sanitizePayload(item, depth + 1, keyHint));
  }

  if (isAnyObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = SENSITIVE_KEY_RE.test(key)
        ? item ? "***" : null
        : sanitizePayload(item, depth + 1, key);
    }

    return output;
  }

  return redactHttpText(String(value));
}

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload = sanitizePayload({
    source: SOURCE,
    version: HTTP_VERSION,
    at: safeIsoDate(),
    ts: safeNow(),
    ...safeObject(payload),
  });

  const AppCore = installedAppCore;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(name, cleanPayload);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.events?.dispatch)) {
      AppCore.events.dispatch(name, cleanPayload);
      return true;
    }
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: cleanPayload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function safeWarn(...args) {
  const AppCore = installedAppCore;
  const cleanArgs = args.map((item) => sanitizePayload(item));

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn("[CoreHTTP]", ...cleanArgs);
      return;
    }
  } catch {}

  try {
    if (config?.debug) {
      console.warn("[CoreHTTP]", ...cleanArgs);
    }
  } catch {}
}

/* =========================================================
   ORIGIN / URL
========================================================= */

function readImportMetaEnv(key = "") {
  try {
    if (import.meta?.env?.[key]) {
      return import.meta.env[key];
    }
  } catch {}

  return "";
}

function readRuntimeGlobal(key = "") {
  try {
    if (hasWindow() && window[key]) {
      return window[key];
    }
  } catch {}

  try {
    if (typeof globalThis !== "undefined" && globalThis[key]) {
      return globalThis[key];
    }
  } catch {}

  return "";
}

function isProductionEnv() {
  const env = safeLower(config?.env || config?.environment || "", "");
  return env === "production" || env === "prod";
}

function isFrontendOrigin(origin = "") {
  try {
    const parsed = new URL(origin);
    return FRONTEND_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

function isCanonicalBackendOrigin(origin = "") {
  try {
    const parsed = new URL(origin);
    const canonical = new URL(DEFAULT_API_ORIGIN);
    return parsed.origin === canonical.origin;
  } catch {
    return false;
  }
}

function normalizeOrigin(value = "", fallback = DEFAULT_API_ORIGIN, options = {}) {
  const opts = safeObject(options);

  if (isProductionEnv() && opts.allowNonCanonicalProduction !== true) {
    return DEFAULT_API_ORIGIN;
  }

  const raw = safeText(value, "");

  if (!raw) {
    return fallback;
  }

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return fallback;
    }

    const origin = url.origin.replace(/\/+$/g, "");

    if (opts.allowFrontendOrigin !== true && isFrontendOrigin(origin)) {
      return fallback;
    }

    if (isCanonicalBackendOrigin(origin)) {
      return DEFAULT_API_ORIGIN;
    }

    return origin;
  } catch {
    return fallback;
  }
}

function resolveRuntimeApiOrigin() {
  return normalizeOrigin(
    config?.apiBase ||
      config?.apiOrigin ||
      config?.apiUrl ||
      config?.api?.base ||
      config?.api?.baseUrl ||
      config?.api?.origin ||
      readRuntimeGlobal("__ONION_API_ORIGIN__") ||
      readRuntimeGlobal("ONION_API_ORIGIN") ||
      readImportMetaEnv("VITE_ONION_API_BASE") ||
      readImportMetaEnv("VITE_API_ORIGIN") ||
      readImportMetaEnv("VITE_API_BASE") ||
      readImportMetaEnv("VITE_API_URL") ||
      readImportMetaEnv("PUBLIC_API_ORIGIN") ||
      DEFAULT_API_ORIGIN,
    DEFAULT_API_ORIGIN
  );
}

export function getApiOrigin() {
  return normalizeOrigin(apiOrigin, DEFAULT_API_ORIGIN);
}

export function setApiOrigin(value = "", options = {}) {
  apiOrigin = normalizeOrigin(value, DEFAULT_API_ORIGIN, options);
  return apiOrigin;
}

function normalizePathOnly(path = "/") {
  let value = safeText(path, "/");

  if (!value) {
    value = "/";
  }

  value = value.replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1 && value.endsWith("/")) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value || "/";
}

function ensureApiPath(path = "/", options = {}) {
  const opts = safeObject(options);
  let value = normalizePathOnly(path);

  if (opts.api === false) {
    return value;
  }

  const apiPrefix = safeText(opts.apiPrefix, DEFAULT_API_PREFIX) || DEFAULT_API_PREFIX;
  const cleanPrefix = normalizePathOnly(apiPrefix);

  if (value === cleanPrefix || value.startsWith(`${cleanPrefix}/`)) {
    return value;
  }

  return `${cleanPrefix}${value}`;
}

function appendQuery(url, query = null) {
  if (!query) {
    return url;
  }

  try {
    const parsed = new URL(url);

    if (typeof URLSearchParams !== "undefined" && query instanceof URLSearchParams) {
      for (const [key, value] of query.entries()) {
        parsed.searchParams.set(key, value);
      }

      return parsed.toString();
    }

    if (Array.isArray(query)) {
      for (const [key, value] of query) {
        if (value !== undefined && value !== null && value !== "") {
          parsed.searchParams.append(String(key), String(value));
        }
      }

      return parsed.toString();
    }

    if (isPlainObject(query)) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") {
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            parsed.searchParams.append(key, String(item));
          }

          continue;
        }

        parsed.searchParams.set(key, String(value));
      }

      return parsed.toString();
    }
  } catch {}

  return url;
}

function rewriteUnsafeAbsoluteApiUrl(raw = "", options = {}) {
  const opts = safeObject(options);

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname || "/";

    if (
      opts.allowFrontendOrigin !== true &&
      isFrontendOrigin(parsed.origin) &&
      (pathname === DEFAULT_API_PREFIX || pathname.startsWith(`${DEFAULT_API_PREFIX}/`))
    ) {
      return `${getApiOrigin()}${pathname}${parsed.search || ""}${parsed.hash || ""}`;
    }

    return raw;
  } catch {
    return raw;
  }
}

export function buildApiUrl(endpoint = "/", options = {}) {
  const opts = safeObject(options);
  const raw = safeText(endpoint, "/");

  if (/^https?:\/\//i.test(raw)) {
    return appendQuery(rewriteUnsafeAbsoluteApiUrl(raw, opts), opts.query);
  }

  if (raw.startsWith("//")) {
    return appendQuery(`${getApiOrigin()}${normalizePathOnly(raw.replace(/^\/+/, ""))}`, opts.query);
  }

  const path = ensureApiPath(raw, opts);

  const origin = normalizeOrigin(
    opts.origin || opts.baseURL || opts.baseUrl || getApiOrigin(),
    DEFAULT_API_ORIGIN,
    opts
  );

  return appendQuery(`${origin}${path}`, opts.query);
}

function getUrlPathname(url = "") {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return normalizePathOnly(url);
  }
}

/* =========================================================
   REQUEST ID
========================================================= */

function createRequestId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}

  return `spa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/* =========================================================
   TOKENS
========================================================= */

function unwrapStoredValue(value = "") {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return safeText(value, "");
  }

  if (isPlainObject(value)) {
    for (const key of [...TOKEN_KEYS, ...REFRESH_TOKEN_KEYS, ...TEMP_TOKEN_KEYS, "value", "raw", "data"]) {
      const nested = unwrapStoredValue(value[key]);

      if (nested) {
        return nested;
      }
    }

    return "";
  }

  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed = JSON.parse(raw);

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
  let token = unwrapStoredValue(value);

  if (!token) {
    return "";
  }

  token = token.replace(/^Bearer\s+/i, "").trim();

  if (!token || CORRUPT_TOKEN_VALUES.has(token.toLowerCase())) {
    return "";
  }

  if (/[\r\n\t\s]/.test(token)) {
    return "";
  }

  if (token.length > TOKEN_MAX_LENGTH) {
    return "";
  }

  try {
    if (!coreHasValidToken(token)) {
      return "";
    }
  } catch {}

  return token;
}

function getStoragePrefixRaw() {
  return safeText(config?.storagePrefix || config?.appKey || config?.appId || "onion", "onion")
    .replace(/^:+|:+$/g, "") || "onion";
}

function getCoreStorage() {
  try {
    return (
      installedAppCore?.storage ||
      installedAppCore?.Storage ||
      installedAppCore?.services?.storage ||
      installedAppCore?.services?.Storage ||
      null
    );
  } catch {
    return null;
  }
}

function readStorageFacadeValue(key = "") {
  const storage = getCoreStorage();
  const cleanKey = safeText(key, "");

  if (!storage || !cleanKey) {
    return "";
  }

  try {
    if (isFunction(storage.getRaw)) {
      const value = normalizeTokenValue(storage.getRaw(cleanKey, "", { all: true }));

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    if (isFunction(storage.get)) {
      const value = normalizeTokenValue(storage.get(cleanKey, "", { all: true }));

      if (value) {
        return value;
      }
    }
  } catch {}

  return "";
}

function writeStorageFacadeValue(key = "", value = "") {
  const storage = getCoreStorage();
  const cleanKey = safeText(key, "");

  if (!storage || !cleanKey) {
    return false;
  }

  try {
    if (!value) {
      storage.remove?.(cleanKey, { all: true });
      return true;
    }

    if (isFunction(storage.setRaw)) {
      storage.setRaw(cleanKey, value);
      return true;
    }

    storage.set?.(cleanKey, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorageFacadeValue(key = "") {
  const storage = getCoreStorage();
  const cleanKey = safeText(key, "");

  if (!storage || !cleanKey) {
    return false;
  }

  try {
    storage.remove?.(cleanKey, { all: true });
    return true;
  } catch {
    return false;
  }
}

function buildBrowserStorageCandidates(keys = []) {
  const prefix = getStoragePrefixRaw();

  const logical = toArray(keys)
    .flat(Infinity)
    .map((item) => safeText(item, ""))
    .filter(Boolean);

  return unique([
    ...logical,
    ...logical.map((key) => `${prefix}:${key}`),
    ...logical.map((key) => `${prefix}.${key}`),
    ...logical.map((key) => `${prefix}_${key}`),
  ]);
}

function readBrowserStorageValue(key = "") {
  if (!isBrowser()) {
    return "";
  }

  const cleanKey = safeText(key, "");

  if (!cleanKey) {
    return "";
  }

  try {
    const value = window.sessionStorage?.getItem?.(cleanKey);
    const normalized = normalizeTokenValue(value);

    if (normalized) {
      return normalized;
    }
  } catch {}

  try {
    const value = window.localStorage?.getItem?.(cleanKey);
    const normalized = normalizeTokenValue(value);

    if (normalized) {
      return normalized;
    }
  } catch {}

  return "";
}

function writeBrowserStorageValue(key = "", value = "") {
  if (!isBrowser()) {
    return false;
  }

  const cleanKey = safeText(key, "");

  if (!cleanKey) {
    return false;
  }

  try {
    if (!value) {
      window.sessionStorage?.removeItem?.(cleanKey);
      return true;
    }

    window.sessionStorage?.setItem?.(cleanKey, String(value));
    return true;
  } catch {}

  return false;
}

function removeBrowserStorageValue(key = "") {
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

function readFirstBrowserStorage(keys = []) {
  for (const key of buildBrowserStorageCandidates(keys)) {
    const value = readBrowserStorageValue(key);

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
      (isBrowser() ? window.Auth || window.OnionAuth : null) ||
      null
    );
  } catch {
    return null;
  }
}

function getTokenFromAuthModule() {
  const Auth = getAuthModule();

  for (const method of ["getAccessToken", "getToken"]) {
    try {
      if (isFunction(Auth?.[method])) {
        const value = normalizeTokenValue(Auth[method]());

        if (value) {
          return value;
        }
      }
    } catch {}
  }

  try {
    if (isFunction(Auth?.getAuthHeader)) {
      const header = Auth.getAuthHeader();
      const authorization = header?.Authorization || header?.authorization || "";
      const value = normalizeTokenValue(authorization);

      if (value) {
        return value;
      }
    }
  } catch {}

  return "";
}

function getRefreshTokenFromAuthModule() {
  const Auth = getAuthModule();

  for (const method of ["getStoredRefreshToken", "getRefreshToken"]) {
    try {
      if (isFunction(Auth?.[method])) {
        const value = normalizeTokenValue(Auth[method]());

        if (value) {
          return value;
        }
      }
    } catch {}
  }

  return "";
}

function getTokenFromAppCore() {
  const state = safeObject(installedAppCore?.state);
  const session = safeObject(state.session || state.sessionData);

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
  const state = safeObject(installedAppCore?.state);
  const session = safeObject(state.session || state.sessionData);

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
  tokenProvider = isFunction(provider) ? provider : null;
  return true;
}

export function getAccessToken(options = {}) {
  const opts = safeObject(options);

  try {
    if (isFunction(tokenProvider)) {
      const value = normalizeTokenValue(tokenProvider());

      if (value) {
        return value;
      }
    }
  } catch {}

  const fromAuth = getTokenFromAuthModule();

  if (fromAuth) {
    return fromAuth;
  }

  const fromAppCore = getTokenFromAppCore();

  if (fromAppCore) {
    return fromAppCore;
  }

  const memoryToken = normalizeTokenValue(tokenMemory.token);

  if (memoryToken) {
    return memoryToken;
  }

  if (opts.allowStorageTokens === true) {
    for (const key of STORAGE_TOKEN_KEYS) {
      const value = readStorageFacadeValue(key);

      if (value) {
        return value;
      }
    }

    return readFirstBrowserStorage([
      ...STORAGE_TOKEN_KEYS,
      ...LEGACY_STORAGE_TOKEN_KEYS,
    ]);
  }

  return "";
}

export function getRefreshToken(options = {}) {
  const opts = safeObject(options);

  const fromAuth = getRefreshTokenFromAuthModule();

  if (fromAuth) {
    return fromAuth;
  }

  const fromAppCore = getRefreshTokenFromAppCore();

  if (fromAppCore) {
    return fromAppCore;
  }

  const memoryRefresh = normalizeTokenValue(tokenMemory.refreshToken);

  if (memoryRefresh) {
    return memoryRefresh;
  }

  if (opts.allowStorageTokens === true) {
    for (const key of STORAGE_REFRESH_TOKEN_KEYS) {
      const value = readStorageFacadeValue(key);

      if (value) {
        return value;
      }
    }

    return readFirstBrowserStorage([
      ...STORAGE_REFRESH_TOKEN_KEYS,
      ...LEGACY_STORAGE_REFRESH_TOKEN_KEYS,
    ]);
  }

  return "";
}

export function setAuthTokens({
  token = "",
  accessToken = "",
  access_token = "",
  refreshToken = "",
  refresh_token = "",
  tempToken = "",
  temp_token = "",
  persist = false,
} = {}) {
  const nextToken = normalizeTokenValue(token || accessToken || access_token);
  const nextRefresh = normalizeTokenValue(refreshToken || refresh_token);
  const nextTemp = normalizeTokenValue(tempToken || temp_token);

  if (nextToken) {
    tokenMemory.token = nextToken;
  }

  if (nextRefresh) {
    tokenMemory.refreshToken = nextRefresh;
  }

  if (nextTemp) {
    tokenMemory.tempToken = nextTemp;
  }

  if (persist === true) {
    if (nextToken) {
      writeStorageFacadeValue("token", nextToken);
      writeStorageFacadeValue("accessToken", nextToken);
      writeBrowserStorageValue(`${getStoragePrefixRaw()}:token`, nextToken);
      writeBrowserStorageValue(`${getStoragePrefixRaw()}:accessToken`, nextToken);
    }

    if (nextRefresh) {
      writeStorageFacadeValue("refreshToken", nextRefresh);
      writeBrowserStorageValue(`${getStoragePrefixRaw()}:refreshToken`, nextRefresh);
    }

    if (nextTemp) {
      writeStorageFacadeValue("tempToken", nextTemp);
      writeBrowserStorageValue(`${getStoragePrefixRaw()}:tempToken`, nextTemp);
    }
  }

  return {
    token: tokenMemory.token,
    refreshToken: tokenMemory.refreshToken,
    tempToken: tokenMemory.tempToken,
  };
}

export function clearAuthTokens({ storage = true } = {}) {
  tokenMemory.token = "";
  tokenMemory.refreshToken = "";
  tokenMemory.tempToken = "";

  if (storage) {
    for (const key of [
      ...STORAGE_TOKEN_KEYS,
      ...STORAGE_REFRESH_TOKEN_KEYS,
      ...STORAGE_TEMP_TOKEN_KEYS,
    ]) {
      removeStorageFacadeValue(key);
    }

    for (const key of buildBrowserStorageCandidates([
      ...STORAGE_TOKEN_KEYS,
      ...STORAGE_REFRESH_TOKEN_KEYS,
      ...STORAGE_TEMP_TOKEN_KEYS,
      ...LEGACY_STORAGE_TOKEN_KEYS,
      ...LEGACY_STORAGE_REFRESH_TOKEN_KEYS,
    ])) {
      removeBrowserStorageValue(key);
    }
  }

  return true;
}

/* =========================================================
   PAYLOAD EXTRACTION
========================================================= */

function collectObjects(value, depth = 0, seen = new WeakSet()) {
  if (depth > 7 || !value || typeof value !== "object") {
    return [];
  }

  try {
    if (seen.has(value)) {
      return [];
    }

    seen.add(value);
  } catch {}

  const output = [value];

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
    "user",
    "usuario",
  ]) {
    const child = value[key];

    if (child && typeof child === "object") {
      output.push(...collectObjects(child, depth + 1, seen));
    }
  }

  return output;
}

function pickFirstTextFromObjects(objects = [], keys = [], { token = false } = {}) {
  for (const object of toArray(objects)) {
    for (const key of toArray(keys)) {
      const raw = object?.[key];

      const value = token
        ? normalizeTokenValue(raw)
        : safeText(raw, "");

      if (value) {
        return value;
      }
    }
  }

  return "";
}

function pickFirstObjectFromObjects(objects = [], keys = []) {
  for (const object of toArray(objects)) {
    for (const key of toArray(keys)) {
      if (isPlainObject(object?.[key])) {
        return object[key];
      }
    }
  }

  return null;
}

function extractTokens(payload = {}) {
  const objects = collectObjects(payload);

  return {
    token: normalizeTokenValue(
      pickFirstTextFromObjects(objects, TOKEN_KEYS, { token: true })
    ),
    refreshToken: normalizeTokenValue(
      pickFirstTextFromObjects(objects, REFRESH_TOKEN_KEYS, { token: true })
    ),
    tempToken: normalizeTokenValue(
      pickFirstTextFromObjects(objects, TEMP_TOKEN_KEYS, { token: true })
    ),
  };
}

function getProfileBranches(user = {}) {
  const current = safeObject(user);

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
  ].filter((item) => item && typeof item === "object" && Object.keys(item).length > 0);
}

function hasUsableUser(user = null) {
  try {
    if (typeof coreIsUsableUser === "function" && coreIsUsableUser(user)) {
      return true;
    }
  } catch {}

  const current = safeObject(user);

  if (!Object.keys(current).length) {
    return false;
  }

  return getProfileBranches(current).some((branch) => Boolean(
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
  ));
}

function extractUser(payload = {}) {
  const objects = collectObjects(payload);
  const direct = pickFirstObjectFromObjects(objects, USER_KEYS);

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
  const objects = collectObjects(payload);

  return pickFirstObjectFromObjects(objects, SESSION_KEYS) || null;
}

function resolveRoleFromPayload(payload = {}, user = null) {
  const objects = collectObjects(payload);

  const rawRole =
    pickFirstTextFromObjects(objects, [
      "role",
      "rol",
      "userRole",
      "user_role",
      "type",
      "tipo",
    ]) ||
    user?.role ||
    user?.rol ||
    "user";

  return safeLower(rawRole, "user");
}

function normalizeUserForClient(user = {}, role = "user") {
  const source = safeObject(user);

  if (!hasUsableUser(source)) {
    return null;
  }

  try {
    const normalized = coreNormalizeUser(source);

    if (normalized && hasUsableUser(normalized)) {
      const finalRole = safeLower(normalized.role || normalized.rol || role || "user", "user");

      return {
        ...normalized,
        role: finalRole,
        rol: finalRole,
        userRole: finalRole,
        roles: unique([finalRole, ...safeArray(normalized.roles)]),
      };
    }
  } catch {}

  const avatar = safeText(
    source.avatar ||
      source.avatarUrl ||
      source.avatar_url ||
      source.photo ||
      source.photoUrl ||
      source.photo_url ||
      source.image ||
      source.imageUrl ||
      source.image_url ||
      source.picture ||
      source.pictureUrl ||
      source.picture_url ||
      "",
    ""
  );

  const userId = safeText(
    source.userId || source.user_id || source.uid || source.sub || source.id || source._id || "",
    ""
  );

  const email = safeText(source.email || source.mail || "", "");

  const username = safeText(
    source.username ||
      source.userName ||
      source.user_name ||
      source.usernameLower ||
      source.username_lower ||
      source.slug ||
      "",
    ""
  );

  const usernameLower = safeText(username || email || userId, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  const displayName = safeText(
    source.displayName ||
      source.fullName ||
      source.name ||
      source.nombre ||
      username ||
      email ||
      "Usuario",
    "Usuario"
  );

  const finalRole = safeLower(role || source.role || source.rol || "user", "user");

  return {
    ...source,
    id: source.id || userId || null,
    userId: source.userId || userId || null,
    uid: source.uid || userId || null,
    sub: source.sub || userId || null,
    email: email || null,
    emailLower: source.emailLower || source.email_lower || (email ? email.toLowerCase() : null),
    username: username || usernameLower || null,
    usernameLower: usernameLower || null,
    username_lower: source.username_lower || usernameLower || null,
    slug: source.slug || usernameLower || null,
    name: displayName,
    nombre: source.nombre || displayName,
    displayName,
    fullName: source.fullName || displayName,
    role: finalRole,
    rol: finalRole,
    userRole: finalRole,
    roles: unique([finalRole, ...safeArray(source.roles)]),
    permissions: safeArray(source.permissions || source.permisos),
    permisos: safeArray(source.permisos || source.permissions),
    avatar: avatar || null,
    avatarUrl: avatar || null,
    picture: avatar || null,
    hasAvatar: source.hasAvatar === true || source.has_avatar === true || Boolean(avatar),
  };
}

function computeAuthForPayload(user, token) {
  const normalizedToken = normalizeTokenValue(token);
  const normalizedUser = normalizeUserForClient(user, user?.role || user?.rol || "user");

  if (!normalizedToken || !normalizedUser) {
    return false;
  }

  try {
    return Boolean(coreComputeAuthenticated(normalizedUser, normalizedToken));
  } catch {
    return Boolean(normalizedToken && hasUsableUser(normalizedUser));
  }
}

/* =========================================================
   APPCORE AUTH COMMIT
========================================================= */

export function setAuthPayloadCommitter(fn) {
  authPayloadCommitter = isFunction(fn) ? fn : null;
  return true;
}

function commitAuthPayloadToCore(AppCore, payload = {}, meta = {}) {
  if (!AppCore) {
    return false;
  }

  const data = safeObject(payload);
  const tokens = extractTokens(data);

  if (tokens.token || tokens.refreshToken || tokens.tempToken) {
    setAuthTokens({
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      tempToken: tokens.tempToken,
      persist: meta.persistTokens === true,
    });
  }

  const rawUser = extractUser(data);
  const session = extractSession(data);
  const role = resolveRoleFromPayload(data, rawUser);
  const user = normalizeUserForClient(rawUser, role);

  const activeToken = tokens.token || getAccessToken({ allowStorageTokens: true });
  const authenticated = computeAuthForPayload(user, activeToken);

  const patch = {};

  if (authenticated) {
    patch.token = activeToken;
    patch.accessToken = activeToken;
    patch.access_token = activeToken;
    patch.hasToken = true;

    patch.user = user;
    patch.currentUser = user;
    patch.authUser = user;
    patch.sessionUser = user;

    patch.role = role;
    patch.rol = role;
    patch.userRole = role;
    patch.roles = unique([role, ...safeArray(user.roles)]);

    patch.username = user.slug || user.usernameLower || user.username || null;
    patch.currentResolvedUsername = user.slug || user.usernameLower || user.username || AppCore?.state?.currentResolvedUsername || null;
    patch.resolvedUsername = patch.currentResolvedUsername;

    patch.avatar = user.avatarUrl || user.avatar || null;
    patch.avatarUrl = user.avatarUrl || user.avatar || null;

    patch.authenticated = true;

    patch.lastAuthSource = safeText(meta.source, SOURCE);
    patch.lastMeAt =
      meta.endpoint && /\/auth\/(?:me|session|profile|whoami|current)\b/i.test(meta.endpoint)
        ? safeIsoDate()
        : AppCore?.state?.lastMeAt || null;
  } else {
    patch.authenticated = false;
    patch.hasToken = false;
  }

  if (tokens.refreshToken) {
    patch.refreshToken = tokens.refreshToken;
    patch.refresh_token = tokens.refreshToken;
  }

  if (tokens.tempToken) {
    patch.tempToken = tokens.tempToken;
    patch.temp_token = tokens.tempToken;
    patch.twoFactorPending = true;
  }

  if (session && authenticated) {
    patch.session = {
      ...session,
      token: activeToken || session.token || null,
      accessToken: activeToken || session.accessToken || null,
      access_token: activeToken || session.access_token || null,
      refreshToken: tokens.refreshToken || session.refreshToken || null,
      refresh_token: tokens.refreshToken || session.refresh_token || null,
      user,
      usuario: user,
      role,
      rol: role,
      authenticated,
    };

    patch.sessionData = patch.session;

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

  if (!Object.keys(patch).length) {
    return false;
  }

  let committed = false;

  try {
    if (isFunction(AppCore.setState)) {
      AppCore.setState(patch, {
        source: "core:http:auth-payload",
        emit: false,
        emitState: false,
        silent: true,
        forceUnauthenticated: authenticated !== true,
      });

      committed = true;
    }
  } catch {}

  if (!committed) {
    try {
      if (isFunction(AppCore.patchState)) {
        AppCore.patchState(patch, {
          source: "core:http:auth-payload",
          emit: false,
          emitState: false,
          silent: true,
        });

        committed = true;
      }
    } catch {}
  }

  if (!committed) {
    try {
      if (AppCore.state && typeof AppCore.state === "object") {
        Object.assign(AppCore.state, patch);
        committed = true;
      }
    } catch {}
  }

  if (authenticated && user && meta.emit !== false) {
    const eventPayload = sanitizePayload({
      source: "core:http",
      reason: safeText(meta.reason, "auth-payload"),
      user,
      role,
      authenticated,
    });

    try {
      AppCore.events?.emit?.("app:user:change", eventPayload);
    } catch {}

    try {
      AppCore.events?.emit?.("app:auth:ready", eventPayload);
    } catch {}
  }

  return committed;
}

function handleAuthPayload(payload = {}, meta = {}) {
  const tokens = extractTokens(payload);

  if (tokens.token || tokens.refreshToken || tokens.tempToken) {
    setAuthTokens({
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      tempToken: tokens.tempToken,
      persist: meta.persistTokens === true,
    });
  }

  try {
    if (isFunction(authPayloadCommitter)) {
      authPayloadCommitter(payload, meta);
    }
  } catch {}

  try {
    commitAuthPayloadToCore(installedAppCore, payload, meta);
  } catch {}

  return payload;
}

/* =========================================================
   ERRORS
========================================================= */

export class HttpError extends Error {
  constructor(message = "HTTP_ERROR", options = {}) {
    super(redactHttpText(message));

    this.name = "HttpError";
    this.status = options.status || 0;
    this.statusCode = options.status || 0;
    this.code = options.code || "HTTP_ERROR";
    this.method = options.method || "";
    this.url = redactHttpText(options.url || "");
    this.path = options.path || "";
    this.requestId = options.requestId || "";
    this.data = sanitizePayload(options.data ?? null);
    this.rawText = redactHttpText(options.rawText || "");
    this.headers = sanitizePayload(options.headers || {});
    this.retriable = Boolean(options.retriable);
    this.timeout = Boolean(options.timeout);
    this.aborted = Boolean(options.aborted);
    this.network = Boolean(options.network);
    this.at = safeIsoDate();

    defineHiddenValue(this, "raw", options.raw || null);
  }
}

function headersToObject(headers) {
  const output = {};

  try {
    headers?.forEach?.((value, key) => {
      output[key] = value;
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
  const errorObject = isPlainObject(payload?.error) ? payload.error : {};

  return safeText(
    payload?.code ||
      payload?.errorCode ||
      payload?.error_code ||
      errorObject.code ||
      payload?.error ||
      payload?.status ||
      fallback,
    fallback
  );
}

function getPayloadMessage(payload = {}, fallback = "Error HTTP.") {
  const errorObject = isPlainObject(payload?.error) ? payload.error : {};

  return safeText(
    payload?.message ||
      payload?.mensaje ||
      payload?.errorMessage ||
      payload?.error_message ||
      errorObject.message ||
      payload?.detail ||
      payload?.description ||
      payload?.error ||
      fallback,
    fallback
  );
}

function looksLikeHtml(text = "") {
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(safeText(text, ""));
}

async function readResponse(response, options = {}) {
  const opts = safeObject(options);
  const responseType = safeText(opts.responseType, "json");

  if (!response || response.status === 204 || response.status === 205 || response.status === 304) {
    return {
      data: null,
      text: "",
      json: false,
    };
  }

  if (responseType === "raw") {
    return {
      data: response,
      text: "",
      json: false,
    };
  }

  if (responseType === "blob") {
    try {
      return {
        data: await response.blob(),
        text: "",
        json: false,
      };
    } catch {
      return { data: null, text: "", json: false };
    }
  }

  if (responseType === "arrayBuffer" || responseType === "arraybuffer") {
    try {
      return {
        data: await response.arrayBuffer(),
        text: "",
        json: false,
      };
    } catch {
      return { data: null, text: "", json: false };
    }
  }

  let text = "";

  try {
    text = await response.text();
  } catch {
    text = "";
  }

  if (!text) {
    return {
      data: null,
      text: "",
      json: false,
    };
  }

  const contentType = safeLower(response.headers?.get?.("content-type") || "", "");

  const looksJson =
    contentType.includes("application/json") ||
    contentType.includes("+json") ||
    /^[\s]*[\[{]/.test(text);

  if (responseType === "text" || (opts.expectJson === false && !looksJson)) {
    return {
      data: text,
      text,
      json: false,
    };
  }

  if (looksJson) {
    try {
      return {
        data: JSON.parse(text),
        text,
        json: true,
      };
    } catch {
      throw new HttpError("La API devolvió una respuesta JSON inválida.", {
        status: response.status,
        code: "INVALID_JSON_RESPONSE",
        method: opts.method,
        url: opts.url,
        path: opts.path,
        requestId: getResponseRequestId(response),
        rawText: text.slice(0, 300),
      });
    }
  }

  if (opts.expectJson === true && looksLikeHtml(text)) {
    throw new HttpError("La API devolvió HTML. La base URL apunta al frontend o a una ruta incorrecta.", {
      status: response.status,
      code: "HTML_RESPONSE_FROM_API",
      method: opts.method,
      url: opts.url,
      path: opts.path,
      requestId: getResponseRequestId(response),
      rawText: text.slice(0, 300),
    });
  }

  if (response.ok && opts.expectJson === true) {
    throw new HttpError("La API no devolvió JSON. Revisa la baseURL del frontend.", {
      status: response.status,
      code: "NON_JSON_RESPONSE",
      method: opts.method,
      url: opts.url,
      path: opts.path,
      requestId: getResponseRequestId(response),
      rawText: text.slice(0, 300),
    });
  }

  return {
    data: text,
    text,
    json: false,
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
        output[key] = value;
      });
    } catch {}

    return output;
  }

  return {
    ...safeObject(headers),
  };
}

function hasHeader(headers = {}, name = "") {
  const needle = safeLower(name, "");
  return Object.keys(headers).some((key) => safeLower(key, "") === needle);
}

function setHeader(headers = {}, name = "", value = "") {
  const cleanName = safeText(name, "");

  if (!cleanName || value === undefined || value === null || value === "") {
    return headers;
  }

  const existingKey = Object.keys(headers).find((key) =>
    safeLower(key, "") === safeLower(cleanName, "")
  );

  headers[existingKey || cleanName] = value;

  return headers;
}

function deleteHeader(headers = {}, name = "") {
  const needle = safeLower(name, "");

  for (const key of Object.keys(headers)) {
    if (safeLower(key, "") === needle) {
      delete headers[key];
    }
  }

  return headers;
}

function resolveRequestAuth(path = "", options = {}) {
  const opts = safeObject(options);

  if (AUTH_ME_PATH_RE.test(path)) {
    return true;
  }

  try {
    if (coreIsPrivateApiPath(path)) {
      return true;
    }
  } catch {}

  if (opts.auth === false || opts.public === true || opts.noAuthHeader === true || opts.skipAuth === true) {
    return false;
  }

  if (opts.auth === true) {
    return true;
  }

  try {
    return !coreIsPublicApiPath(path);
  } catch {
    return !AUTH_PUBLIC_CONTROL_PATH_RE.test(path);
  }
}

function buildHeaders({
  headers = {},
  body = undefined,
  auth = true,
  noAuthHeader = false,
  requestId = "",
  allowStorageTokens = true,
} = {}) {
  const finalHeaders = normalizeHeaders(headers);

  if (!hasHeader(finalHeaders, "Accept")) {
    finalHeaders.Accept = "application/json";
  }

  if (!hasHeader(finalHeaders, "X-Request-Id")) {
    finalHeaders["X-Request-Id"] = requestId || createRequestId();
  }

  if (!hasHeader(finalHeaders, "X-Onion-Client")) {
    finalHeaders["X-Onion-Client"] = "onion-spa";
  }

  if (!hasHeader(finalHeaders, "X-Onion-HTTP-Version")) {
    finalHeaders["X-Onion-HTTP-Version"] = HTTP_VERSION;
  }

  const shouldSetJson =
    body !== undefined &&
    body !== null &&
    !isFormData(body) &&
    !isBlob(body) &&
    !isUrlSearchParams(body) &&
    !isArrayBuffer(body) &&
    !isReadableStream(body) &&
    typeof body !== "string" &&
    !hasHeader(finalHeaders, "Content-Type");

  if (shouldSetJson) {
    finalHeaders["Content-Type"] = "application/json";
  }

  if (auth !== false && noAuthHeader !== true && !hasHeader(finalHeaders, "Authorization")) {
    const token = getAccessToken({ allowStorageTokens });

    if (token) {
      finalHeaders.Authorization = token.startsWith("Bearer ")
        ? token
        : `Bearer ${token}`;
    }
  }

  if (auth === false || noAuthHeader === true) {
    deleteHeader(finalHeaders, "Authorization");
  }

  return finalHeaders;
}

function buildBody(body = undefined) {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    isFormData(body) ||
    isBlob(body) ||
    isUrlSearchParams(body) ||
    isArrayBuffer(body) ||
    isReadableStream(body)
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
  const opts = safeObject(options);
  const timeoutMs = safeNumber(opts.timeoutMs, DEFAULT_TIMEOUT_MS);

  if (typeof AbortController === "undefined") {
    return {
      signal: opts.signal || undefined,
      timedOut: () => false,
      cleanup: () => {},
    };
  }

  const controller = new AbortController();

  let timer = null;
  let timeoutFired = false;

  const onExternalAbort = () => {
    try {
      controller.abort(opts.signal?.reason || "external-abort");
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
        opts.signal.addEventListener("abort", onExternalAbort, { once: true });
      }
    } catch {}
  }

  if (timeoutMs > 0) {
    try {
      timer = setTimeout(() => {
        timeoutFired = true;

        try {
          controller.abort("request-timeout");
        } catch {
          try {
            controller.abort();
          } catch {}
        }
      }, timeoutMs);
    } catch {}
  }

  return {
    signal: controller.signal,
    timedOut: () => Boolean(timeoutFired),
    cleanup: () => {
      try {
        if (timer) clearTimeout(timer);
      } catch {}

      try {
        opts.signal?.removeEventListener?.("abort", onExternalAbort);
      } catch {}
    },
  };
}

/* =========================================================
   RETRY
========================================================= */

function isRetryableStatus(status = 0) {
  return RETRYABLE_STATUSES.includes(safeNumber(status, 0));
}

function methodAllowsRetry(method = "GET", options = {}) {
  const cleanMethod = safeText(method, "GET").toUpperCase();

  if (options.retryUnsafe === true || options.retryUnsafeMethods === true) {
    return true;
  }

  const configured = toArray(options.retryMethods || config?.requestRetryMethods || config?.api?.retryMethods)
    .flat(Infinity)
    .map((item) => safeText(item, "").toUpperCase())
    .filter(Boolean);

  const methods = configured.length ? configured : RETRYABLE_METHODS;

  return methods.includes(cleanMethod);
}

function defaultRetriesFor(method = "GET", options = {}) {
  if (Number.isFinite(Number(options.retries))) {
    return Math.max(0, Number(options.retries));
  }

  const configured = safeNumber(config?.requestRetries ?? config?.api?.retries, 0);

  if (configured > 0) {
    return configured;
  }

  return 0;
}

function parseRetryAfterMs(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return 0;
  }

  const seconds = Number(raw);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(raw);

  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return 0;
}

function getRetryAfterHeader(error = null) {
  const headers = safeObject(error?.headers);

  for (const [key, value] of Object.entries(headers)) {
    if (safeLower(key, "") === "retry-after") {
      return safeText(value, "");
    }
  }

  return "";
}

function getRetryDelayMs(attempt = 0, options = {}, error = null) {
  const retryAfter = parseRetryAfterMs(getRetryAfterHeader(error));

  const maxDelay = safeNumber(
    options.retryMaxDelayMs ??
      options.retryMaxDelay ??
      config?.requestRetryMaxDelayMs ??
      config?.api?.retryMaxDelayMs,
    3000
  );

  if (retryAfter > 0) {
    return Math.min(retryAfter, maxDelay);
  }

  const base = safeNumber(
    options.retryDelayMs ??
      options.retryDelay ??
      config?.requestRetryDelayMs ??
      config?.api?.retryDelayMs,
    250
  );

  const jitter = Math.floor(Math.random() * Math.max(1, base));

  return Math.min(
    maxDelay,
    base * Math.max(1, attempt + 1) + jitter
  );
}

/* =========================================================
   LOW LEVEL REQUEST
========================================================= */

async function performRequest(endpoint = "/", options = {}) {
  const opts = safeObject(options);
  const method = safeText(opts.method, "GET").toUpperCase();
  const url = buildApiUrl(endpoint, opts);
  const path = getUrlPathname(url);
  const requestId = safeText(opts.requestId, createRequestId());

  const retries = defaultRetriesFor(method, opts);

  const timeoutMs = safeNumber(
    opts.timeoutMs ?? opts.timeout,
    AUTH_PATH_RE.test(path) ? DEFAULT_AUTH_TIMEOUT_MS : DEFAULT_TIMEOUT_MS
  );

  const auth = resolveRequestAuth(path, opts);

  const requestBody = opts.body !== undefined ? opts.body : opts.data;
  const fetchBody = BODYLESS_METHODS.includes(method) ? undefined : buildBody(requestBody);

  const headers = buildHeaders({
    headers: opts.headers,
    body: fetchBody,
    auth,
    noAuthHeader: opts.noAuthHeader,
    requestId,
    allowStorageTokens: opts.allowStorageTokens !== false,
  });

  if (fetchBody === undefined) {
    deleteHeader(headers, "Content-Type");
  }

  const fetchFn = getFetch();

  if (!fetchFn) {
    throw new HttpError("Fetch API no disponible.", {
      status: 0,
      code: "FETCH_UNAVAILABLE",
      method,
      url,
      path,
      requestId,
      network: true,
    });
  }

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const abortCtx = createAbortContext({
      ...opts,
      timeoutMs,
    });

    try {
      if (opts.emitLifecycleEvents === true) {
        safeEmit("http:request:start", {
          method,
          url: redactHttpText(url),
          path,
          attempt,
          requestId,
        });
      }

      const response = await fetchFn(url, {
        method,
        headers,
        body: fetchBody,
        credentials: opts.credentials === "omit" ? "omit" : "include",
        mode: opts.mode || "cors",
        cache: opts.cache || (AUTH_PATH_RE.test(path) ? "no-store" : "no-cache"),
        redirect: opts.redirect || "follow",
        signal: abortCtx.signal,
      });

      const parsed = await readResponse(response, {
        ...opts,
        method,
        url,
        path,
        expectJson: opts.expectJson !== false,
      });

      if (!response.ok) {
        const data = isPlainObject(parsed.data) ? parsed.data : {};

        const error = new HttpError(
          getPayloadMessage(data, `HTTP ${response.status}`),
          {
            status: response.status,
            code: getPayloadCode(
              data,
              response.status === 401 ? "UNAUTHORIZED" : "HTTP_ERROR"
            ),
            method,
            url,
            path,
            requestId: getResponseRequestId(response) || requestId,
            data: parsed.data,
            rawText: parsed.text,
            headers: headersToObject(response.headers),
            retriable: isRetryableStatus(response.status),
          }
        );

        if (
          attempt < retries &&
          methodAllowsRetry(method, opts) &&
          isRetryableStatus(response.status)
        ) {
          lastError = error;
          httpStats.retry += 1;

          await wait(getRetryDelayMs(attempt, opts, error), opts.signal);
          continue;
        }

        throw error;
      }

      const data = parsed.data;

      if (
        (opts.captureAuth === true || (opts.captureAuth !== false && AUTH_PATH_RE.test(path))) &&
        isPlainObject(data)
      ) {
        handleAuthPayload(data, {
          endpoint: path,
          method,
          requestId,
          source: "core:http",
          reason: AUTH_ME_PATH_RE.test(path)
            ? "me"
            : path.includes("/login")
              ? "login"
              : path.includes("/refresh")
                ? "refresh"
                : "auth-response",
          persistTokens: opts.persistTokens === true,
          emit: opts.emitAuthEvents !== false,
        });
      }

      if (opts.emitFinalEvents !== false && opts.silent !== true) {
        safeEmit("http:request:success", {
          method,
          path,
          status: response.status,
          attempt,
          requestId: getResponseRequestId(response) || requestId,
        });
      }

      return data;
    } catch (error) {
      const aborted =
        error?.name === "AbortError" ||
        String(error?.message || "").toLowerCase().includes("abort");

      const timeout =
        abortCtx.timedOut?.() === true ||
        String(error?.message || "").includes("request-timeout");

      const networkError = error instanceof TypeError || error?.network === true;

      const normalized = error instanceof HttpError
        ? error
        : new HttpError(
            timeout
              ? "La solicitud ha excedido el tiempo máximo."
              : aborted
                ? "La solicitud fue cancelada."
                : "No se pudo contactar con la API.",
            {
              status: 0,
              code: timeout
                ? "REQUEST_TIMEOUT"
                : aborted
                  ? "REQUEST_ABORTED"
                  : "NETWORK_ERROR",
              method,
              url,
              path,
              requestId,
              network: networkError,
              timeout,
              aborted: aborted && !timeout,
              retriable: (!aborted || timeout),
              raw: error,
            }
          );

      lastError = normalized;

      if (normalized.aborted && !normalized.timeout) {
        httpStats.aborted += 1;
      }

      if (
        attempt < retries &&
        methodAllowsRetry(method, opts) &&
        (normalized.network || normalized.timeout || normalized.retriable) &&
        !normalized.aborted
      ) {
        httpStats.retry += 1;
        await wait(getRetryDelayMs(attempt, opts, normalized), opts.signal);
        continue;
      }

      if (opts.emitFinalEvents !== false && opts.silent !== true) {
        safeEmit("http:request:error", {
          method,
          path,
          requestId,
          error: normalized,
        });
      }

      throw normalized;
    } finally {
      abortCtx.cleanup();
    }
  }

  throw lastError || new HttpError("No se pudo completar la solicitud.", {
    code: "REQUEST_FAILED",
  });
}

/* =========================================================
   REFRESH
========================================================= */

function isRefreshExcludedAuthPath(path = "") {
  if (AUTH_ME_PATH_RE.test(path)) {
    return false;
  }

  return (
    REFRESH_PATH_RE.test(path) ||
    LOGIN_PATH_RE.test(path) ||
    LOGOUT_PATH_RE.test(path) ||
    AUTH_PUBLIC_CONTROL_PATH_RE.test(path)
  );
}

function shouldAttemptRefresh(error, endpoint = "", options = {}) {
  const opts = safeObject(options);

  if (opts.skipRefresh === true || opts._skipAuthRefresh === true || opts.skipAuthRefresh === true) {
    return false;
  }

  if (opts.auth === false || opts.public === true || opts.noAuthHeader === true) {
    return false;
  }

  if (!(error instanceof HttpError)) {
    return false;
  }

  if (error.status !== 401 && error.status !== 419) {
    return false;
  }

  const path = getUrlPathname(buildApiUrl(endpoint, opts));

  if (isRefreshExcludedAuthPath(path)) {
    return false;
  }

  return true;
}

export async function refreshSession(options = {}) {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    httpStats.refresh += 1;

    const refreshToken = getRefreshToken({
      allowStorageTokens: true,
    });

    const body = refreshToken
      ? {
          refreshToken,
          refresh_token: refreshToken,
        }
      : undefined;

    const result = await performRequest("/auth/refresh", {
      method: "POST",
      body,
      auth: false,
      public: true,
      noAuthHeader: true,
      skipRefresh: true,
      _skipAuthRefresh: true,
      skipAuthRefresh: true,
      timeoutMs: safeNumber(options.timeoutMs, DEFAULT_REFRESH_TIMEOUT_MS),
      retries: 0,
      captureAuth: true,
      persistTokens: options.persistTokens === true,
      reason: "refresh-session",
      emitAuthEvents: options.emitAuthEvents,
    });

    if (isPlainObject(result)) {
      handleAuthPayload(result, {
        endpoint: "/api/auth/refresh",
        method: "POST",
        reason: "refresh-session",
        source: "core:http",
        emit: options.emitAuthEvents !== false,
        persistTokens: options.persistTokens === true,
      });
    }

    return result;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/* =========================================================
   PUBLIC REQUEST API
========================================================= */

function normalizeRequestArgs(firstArg = "/", secondArg = {}, thirdArg = {}) {
  let endpoint = firstArg;
  let options = safeObject(secondArg);

  if (
    typeof firstArg === "string" &&
    /^[A-Z]+$/i.test(firstArg) &&
    typeof secondArg === "string"
  ) {
    endpoint = secondArg;
    options = {
      ...safeObject(thirdArg),
      method: firstArg.toUpperCase(),
    };
  }

  return {
    endpoint,
    options,
  };
}

function makeDedupeKey(endpoint = "/", options = {}) {
  const opts = safeObject(options);
  const method = safeText(opts.method, "GET").toUpperCase();

  if (!["GET", "HEAD"].includes(method) || opts.dedupe === false) {
    return "";
  }

  const url = buildApiUrl(endpoint, opts);
  const path = getUrlPathname(url);
  const auth = resolveRequestAuth(path, opts);
  const token = auth ? getAccessToken({ allowStorageTokens: true }) : "";

  return [
    method,
    redactHttpText(url),
    auth ? "auth" : "public",
    token ? `${token.length}:${token.slice(0, 8)}:${token.slice(-8)}` : "no-token",
  ].join("::");
}

export async function request(firstArg = "/", secondArg = {}, thirdArg = {}) {
  const { endpoint, options } = normalizeRequestArgs(firstArg, secondArg, thirdArg);
  const opts = safeObject(options);

  const method = safeText(opts.method, "GET").toUpperCase();
  const dedupeKey = makeDedupeKey(endpoint, opts);

  if (dedupeKey && inFlightRequests.has(dedupeKey)) {
    httpStats.deduped += 1;
    return inFlightRequests.get(dedupeKey);
  }

  const promise = (async () => {
    httpStats.total += 1;
    httpStats.lastRequestAt = safeIsoDate();

    try {
      const result = await performRequest(endpoint, opts);

      httpStats.success += 1;
      httpStats.lastUrl = redactHttpText(buildApiUrl(endpoint, opts));

      return result;
    } catch (error) {
      if (shouldAttemptRefresh(error, endpoint, opts)) {
        try {
          await refreshSession({
            emitAuthEvents: opts.emitAuthEvents,
            persistTokens: opts.persistTokens,
          });

          const retried = await performRequest(endpoint, {
            ...opts,
            skipRefresh: true,
            _skipAuthRefresh: true,
            skipAuthRefresh: true,
            retries: 0,
          });

          httpStats.success += 1;
          return retried;
        } catch (refreshError) {
          safeWarn("Refresh falló; se conserva el error original.", refreshError);

          clearAuthTokens({
            storage: opts.clearStorageOnRefreshFail !== false,
          });

          httpStats.error += 1;
          httpStats.lastError = sanitizePayload(error);

          throw error;
        }
      }

      httpStats.error += 1;
      httpStats.lastError = sanitizePayload(error);

      throw error;
    }
  })();

  if (dedupeKey) {
    inFlightRequests.set(dedupeKey, promise);
  }

  try {
    return await promise;
  } finally {
    if (dedupeKey) {
      inFlightRequests.delete(dedupeKey);
    }
  }
}

export function get(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...safeObject(options),
    method: "GET",
  });
}

export function head(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...safeObject(options),
    method: "HEAD",
  });
}

export function optionsRequest(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...safeObject(options),
    method: "OPTIONS",
  });
}

export function post(endpoint = "/", body = undefined, options = {}) {
  return request(endpoint, {
    ...safeObject(options),
    method: "POST",
    body,
  });
}

export function put(endpoint = "/", body = undefined, options = {}) {
  return request(endpoint, {
    ...safeObject(options),
    method: "PUT",
    body,
  });
}

export function patch(endpoint = "/", body = undefined, options = {}) {
  return request(endpoint, {
    ...safeObject(options),
    method: "PATCH",
    body,
  });
}

function looksLikeOptionsObject(value = {}) {
  if (!isPlainObject(value)) {
    return false;
  }

  return [
    "method",
    "headers",
    "query",
    "params",
    "body",
    "data",
    "auth",
    "public",
    "timeout",
    "timeoutMs",
    "signal",
    "retries",
    "responseType",
    "silent",
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function del(endpoint = "/", bodyOrOptions = {}, maybeOptions = undefined) {
  if (maybeOptions !== undefined) {
    return request(endpoint, {
      ...safeObject(maybeOptions),
      method: "DELETE",
      body: bodyOrOptions,
    });
  }

  if (looksLikeOptionsObject(bodyOrOptions)) {
    return request(endpoint, {
      ...safeObject(bodyOrOptions),
      method: "DELETE",
    });
  }

  return request(endpoint, {
    method: "DELETE",
    body: bodyOrOptions,
  });
}

export function upload(endpoint = "/", formData, options = {}) {
  return request(endpoint, {
    ...safeObject(options),
    method: options.method || "POST",
    body: formData,
  });
}

export function download(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...safeObject(options),
    method: options.method || "GET",
    responseType: options.responseType || "blob",
    expectJson: false,
  });
}

export function raw(endpoint = "/", options = {}) {
  return request(endpoint, {
    ...safeObject(options),
    responseType: "raw",
  });
}

/* =========================================================
   AUTH API
========================================================= */

export function login(credentials = {}, options = {}) {
  return post("/auth/login", credentials, {
    auth: false,
    public: true,
    noAuthHeader: true,
    retries: 0,
    timeoutMs: DEFAULT_AUTH_TIMEOUT_MS,
    captureAuth: true,
    persistTokens: options.persistTokens === true,
    skipRefresh: true,
    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    ...safeObject(options),
  });
}

export function me(options = {}) {
  return get("/auth/me", {
    auth: true,
    public: false,
    timeoutMs: DEFAULT_AUTH_TIMEOUT_MS,
    captureAuth: true,
    retries: 0,
    cache: "no-store",
    ...safeObject(options),
  });
}

export function logout(options = {}) {
  return post("/auth/logout", {}, {
    auth: true,
    timeoutMs: DEFAULT_AUTH_TIMEOUT_MS,
    retries: 0,
    skipRefresh: true,
    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    ...safeObject(options),
  }).finally(() => {
    clearAuthTokens({
      storage: options.clearStorage !== false,
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
  const opts = safeObject(options);

  const explicit =
    opts.apiOrigin ||
    opts.baseURL ||
    opts.baseUrl ||
    opts.apiBase ||
    "";

  if (explicit) {
    setApiOrigin(explicit, opts);
  } else {
    setApiOrigin(resolveRuntimeApiOrigin() || DEFAULT_API_ORIGIN);
  }

  try {
    if (AppCore?.config && typeof AppCore.config === "object") {
      AppCore.config.apiOrigin = getApiOrigin();
      AppCore.config.apiBase = getApiOrigin();
      AppCore.config.apiUrl = getApiOrigin();

      if (!AppCore.config.api) {
        AppCore.config.api = {};
      }

      AppCore.config.api.origin = getApiOrigin();
      AppCore.config.api.baseUrl = getApiOrigin();
      AppCore.config.api.base = getApiOrigin();
    }
  } catch {}

  return getApiOrigin();
}

function createApiClientFacade() {
  return {
    version: HTTP_VERSION,

    get origin() {
      return getApiOrigin();
    },

    setOrigin: setApiOrigin,
    buildUrl: buildApiUrl,

    request,

    get,
    head,
    options: optionsRequest,
    post,
    put,
    patch,

    delete: del,
    del,

    upload,
    download,
    raw,

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

    install: installHttp,

    getSnapshot: getHttpSnapshot,
    getDebugSnapshot: getHttpSnapshot,
    snapshot: getHttpSnapshot,
  };
}

export function installHttp(AppCore = null, options = {}) {
  installedAppCore = AppCore || installedAppCore;

  configureAppCoreOrigin(installedAppCore, options);

  setTokenProvider(() => {
    const state = safeObject(installedAppCore?.state);
    const session = safeObject(state.session || state.sessionData);

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
    commitAuthPayloadToCore(installedAppCore, payload, meta);
  });

  const api = createApiClientFacade();

  try {
    if (installedAppCore && typeof installedAppCore === "object") {
      defineHiddenValue(installedAppCore, "http", api);
      defineHiddenValue(installedAppCore, "Http", api);
      defineHiddenValue(installedAppCore, "apiClient", api);

      if (!installedAppCore.services || typeof installedAppCore.services !== "object") {
        installedAppCore.services = {};
      }

      installedAppCore.services.http = api;
      installedAppCore.services.Http = api;
      installedAppCore.services.api = api;
      installedAppCore.services.apiClient = api;
    }
  } catch {}

  try {
    if (installedAppCore?.modules && isFunction(installedAppCore.modules.register)) {
      installedAppCore.modules.register("Http", api, {
        overwrite: true,
        replace: true,
        aliases: ["http", "ApiClient", "apiClient", "api"],
        source: "core/http.js",
      });
    } else if (installedAppCore?.modules && isFunction(installedAppCore.modules.set)) {
      installedAppCore.modules.set("Http", api);
      installedAppCore.modules.set("http", api);
      installedAppCore.modules.set("ApiClient", api);
      installedAppCore.modules.set("apiClient", api);
      installedAppCore.modules.set("api", api);
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.__ONION_HTTP__ = api;
      window.__ONION_API_ORIGIN__ = getApiOrigin();
    }
  } catch {}

  safeEmit("http:installed", {
    origin: getApiOrigin(),
    appCore: Boolean(installedAppCore),
  });

  return api;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHttpSnapshot() {
  return sanitizePayload({
    version: HTTP_VERSION,

    origin: getApiOrigin(),
    defaultOrigin: DEFAULT_API_ORIGIN,
    apiPrefix: DEFAULT_API_PREFIX,

    installed: Boolean(installedAppCore),
    hasFetch: Boolean(getFetch()),
    hasAbortController: typeof AbortController === "function",

    hasTokenProvider: Boolean(tokenProvider),
    hasAuthPayloadCommitter: Boolean(authPayloadCommitter),
    hasAuthModule: Boolean(getAuthModule()),

    hasAccessToken: Boolean(getAccessToken()),
    hasRefreshToken: Boolean(getRefreshToken()),

    refreshInFlight: Boolean(refreshPromise),
    inFlight: inFlightRequests.size,

    stats: httpStats,

    endpoints: {
      login: buildApiUrl("/auth/login"),
      me: buildApiUrl("/auth/me"),
      refresh: buildApiUrl("/auth/refresh"),
      logout: buildApiUrl("/auth/logout"),
    },

    privateChecks: {
      me: true,
      apiMe: true,
      authMe: true,
      apiAuthMe: true,
    },

    at: safeIsoDate(),
  });
}

/* =========================================================
   DEFAULT FACADE
========================================================= */

try {
  setApiOrigin(resolveRuntimeApiOrigin());
} catch {
  setApiOrigin(DEFAULT_API_ORIGIN);
}

export const Http = createApiClientFacade();

try {
  if (isBrowser()) {
    window.__ONION_HTTP__ = Http;
    window.__ONION_API_ORIGIN__ = getApiOrigin();
  }
} catch {}

export default Http;
