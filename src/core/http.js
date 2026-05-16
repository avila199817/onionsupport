/* =========================================================
   Onion SPA - Core HTTP
   Archivo: src/core/http.js

   CORE HTTP · CLEAN
   - Backend canónico: https://api.onionit.net
   - /api/auth/me, /auth/me, /api/me y /me siempre privados
   - Authorization Bearer solo cuando procede
   - Refresh single-flight en 401/419 privados
   - Login/refresh/logout/activation/reset/2FA/MFA/OTP sin refresh automático
   - JSON/text/blob/arrayBuffer seguro
   - Detecta HTML accidental como baseURL/ruta incorrecta
   - Sin localStorage.clear/sessionStorage.clear
   - Eventos/snapshots sin tokens reales
========================================================= */

import { config } from "./config.js";

import {
  normalizeUser as coreNormalizeUser,
  hasValidToken as coreHasValidToken,
  isPublicApiPath as coreIsPublicApiPath,
  isPrivateApiPath as coreIsPrivateApiPath,
  isUsableUser as coreIsUsableUser,
  redactTokenInText as coreRedactTokenInText,
} from "./helpers.js";

import {
  computeAuthenticated as coreComputeAuthenticated,
} from "./state.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HTTP_VERSION = "18.0.0-clean";

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
  /^\/api\/auth\/(?:login|refresh|token\/refresh|renew|2fa\/(?:login|request|resend|verify)|mfa\/(?:login|request|resend|verify)|otp\/(?:login|request|resend|verify)|activate(?:\/|$)|activate-account(?:\/|$)|activation(?:\/|$)|account\/activate(?:\/|$)|reset-password(?:\/|$)|reset-password-request|reset-password-confirm|forgot-password|recover-password|password-reset(?:\/|$)|_health|health)(?:\/|$)/i;

const FRONTEND_HOST_RE =
  /^(?:www\.)?onionsupport\.com$/i;

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
  "challengeToken",
  "challenge_token",
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

const BAD_TOKEN_VALUES = new Set([
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
let installedAppCore = null;
let refreshPromise = null;
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

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
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
  if (value === null || value === undefined) return fallback;

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

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
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
  if (!target || !key || !canExtend(target)) return false;

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
  } catch {
    return false;
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

function isHeaders(value) {
  try {
    return typeof Headers !== "undefined" && value instanceof Headers;
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

  if (!delay) return Promise.resolve(true);

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

  if (!output) return "";

  try {
    if (isFunction(coreRedactTokenInText)) {
      output = coreRedactTokenInText(output);
    }
  } catch {}

  try {
    output = output.replace(
      /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|otp|totp)=)([^&#\s]+)/gi,
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

function sanitizePayload(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (depth > 6) return "[MaxDepth]";

  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : null;
  }

  if (typeof value === "string") return redactHttpText(value);

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactHttpText(value.message || ""),
      stack: value.stack ? "[stack]" : "",
      status: value.status || value.statusCode || 0,
      code: value.code || "",
      timeout: Boolean(value.timeout),
      aborted: Boolean(value.aborted),
      network: Boolean(value.network),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) =>
      sanitizePayload(item, depth + 1, keyHint, seen)
    );
  }

  if (isAnyObject(value)) {
    try {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitizePayload(item, depth + 1, key, seen);
    }

    return output;
  }

  return redactHttpText(String(value));
}

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;

  const cleanPayload = sanitizePayload({
    source: SOURCE,
    version: HTTP_VERSION,
    at: iso(),
    ts: now(),
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
      window.dispatchEvent(new CustomEvent(name, { detail: cleanPayload }));
      return true;
    }
  } catch {}

  return false;
}

function safeWarn(...args) {
  const clean = args.map((item) => sanitizePayload(item));

  try {
    if (isFunction(installedAppCore?.utils?.warn)) {
      installedAppCore.utils.warn("[CoreHTTP]", ...clean);
      return;
    }
  } catch {}

  try {
    if (config?.debug) {
      console.warn("[CoreHTTP]", ...clean);
    }
  } catch {}
}

/* =========================================================
   ORIGIN / URL
========================================================= */

function readImportMetaEnv(key = "") {
  try {
    return import.meta?.env?.[key] || "";
  } catch {
    return "";
  }
}

function readRuntimeGlobal(key = "") {
  try {
    if (typeof window !== "undefined" && window[key]) return window[key];
  } catch {}

  try {
    if (typeof globalThis !== "undefined" && globalThis[key]) return globalThis[key];
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
    return new URL(origin).origin === new URL(DEFAULT_API_ORIGIN).origin;
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

  if (!raw) return fallback;

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

function normalizePathname(pathname = "/") {
  let value = safeText(pathname, "/").replace(/\\/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1 && value.endsWith("/")) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value || "/";
}

function splitPath(value = "/") {
  let raw = safeText(value, "/");

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname: normalizePathname(pathname),
    search: search ? (search.startsWith("?") ? search : `?${search}`) : "",
    hash: hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "",
  };
}

function buildPath(parts = {}) {
  return `${normalizePathname(parts.pathname || "/")}${parts.search || ""}${parts.hash || ""}`;
}

function ensureApiPath(path = "/", options = {}) {
  const opts = safeObject(options);
  const parts = splitPath(path);

  if (opts.api === false) {
    return buildPath(parts);
  }

  const prefix = normalizePathname(opts.apiPrefix || DEFAULT_API_PREFIX);

  if (parts.pathname === prefix || parts.pathname.startsWith(`${prefix}/`)) {
    return buildPath(parts);
  }

  return `${prefix}${parts.pathname}${parts.search}${parts.hash}`;
}

function appendQuery(url = "", query = null) {
  if (!query) return url;

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
        if (value === undefined || value === null || value === "") continue;

        if (Array.isArray(value)) {
          for (const item of value) {
            if (item !== undefined && item !== null && item !== "") {
              parsed.searchParams.append(key, String(item));
            }
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
    return appendQuery(rewriteUnsafeAbsoluteApiUrl(raw, opts), opts.query || opts.params);
  }

  if (raw.startsWith("//")) {
    return appendQuery(`${getApiOrigin()}${normalizePathname(raw.replace(/^\/+/, ""))}`, opts.query || opts.params);
  }

  const path = ensureApiPath(raw, opts);

  const origin = normalizeOrigin(
    opts.origin || opts.baseURL || opts.baseUrl || getApiOrigin(),
    DEFAULT_API_ORIGIN,
    opts
  );

  return appendQuery(`${origin}${path}`, opts.query || opts.params);
}

function getUrlPathname(url = "") {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return normalizePathname(url);
  }
}

/* =========================================================
   REQUEST ID
========================================================= */

function createRequestId() {
  try {
    if (typeof crypto !== "undefined" && isFunction(crypto.randomUUID)) {
      return crypto.randomUUID();
    }
  } catch {}

  return `spa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/* =========================================================
   TOKEN STORAGE
========================================================= */

function unwrapStoredValue(value = "") {
  if (value === null || value === undefined) return "";

  if (typeof value === "number" || typeof value === "boolean") {
    return safeText(value, "");
  }

  if (isPlainObject(value)) {
    for (const key of [
      ...TOKEN_KEYS,
      ...REFRESH_TOKEN_KEYS,
      ...TEMP_TOKEN_KEYS,
      "value",
      "raw",
      "data",
    ]) {
      const nested = unwrapStoredValue(value[key]);
      if (nested) return nested;
    }

    return "";
  }

  const raw = safeText(value, "");

  if (!raw) return "";

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

  if (!token) return "";

  token = token.replace(/^Bearer\s+/i, "").trim();

  if (!token || BAD_TOKEN_VALUES.has(token.toLowerCase())) return "";
  if (/[\r\n\t\s]/.test(token)) return "";
  if (token.length > TOKEN_MAX_LENGTH) return "";

  try {
    if (isFunction(coreHasValidToken) && !coreHasValidToken(token)) {
      return "";
    }
  } catch {}

  return token;
}

function getStoragePrefix() {
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

  if (!storage || !cleanKey) return "";

  try {
    if (isFunction(storage.getRaw)) {
      const value = normalizeTokenValue(storage.getRaw(cleanKey, "", { all: true }));
      if (value) return value;
    }
  } catch {}

  try {
    if (isFunction(storage.get)) {
      const value = normalizeTokenValue(storage.get(cleanKey, "", { all: true }));
      if (value) return value;
    }
  } catch {}

  return "";
}

function writeStorageFacadeValue(key = "", value = "") {
  const storage = getCoreStorage();
  const cleanKey = safeText(key, "");

  if (!storage || !cleanKey) return false;

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

  if (!storage || !cleanKey) return false;

  try {
    storage.remove?.(cleanKey, { all: true });
    return true;
  } catch {
    return false;
  }
}

function storageCandidates(keys = []) {
  const prefix = getStoragePrefix();

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
  if (!isBrowser()) return "";

  const cleanKey = safeText(key, "");

  if (!cleanKey) return "";

  try {
    const value = normalizeTokenValue(window.sessionStorage?.getItem?.(cleanKey));
    if (value) return value;
  } catch {}

  try {
    const value = normalizeTokenValue(window.localStorage?.getItem?.(cleanKey));
    if (value) return value;
  } catch {}

  return "";
}

function writeBrowserSessionValue(key = "", value = "") {
  if (!isBrowser()) return false;

  const cleanKey = safeText(key, "");

  if (!cleanKey) return false;

  try {
    if (!value) {
      window.sessionStorage?.removeItem?.(cleanKey);
      return true;
    }

    window.sessionStorage?.setItem?.(cleanKey, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeBrowserStorageValue(key = "") {
  if (!isBrowser()) return false;

  try {
    window.sessionStorage?.removeItem?.(key);
  } catch {}

  try {
    window.localStorage?.removeItem?.(key);
  } catch {}

  return true;
}

function readFirstBrowserStorage(keys = []) {
  for (const key of storageCandidates(keys)) {
    const value = readBrowserStorageValue(key);
    if (value) return value;
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
        if (value) return value;
      }
    } catch {}
  }

  try {
    if (isFunction(Auth?.getAuthHeader)) {
      const header = Auth.getAuthHeader();
      const authorization = header?.Authorization || header?.authorization || "";
      const value = normalizeTokenValue(authorization);
      if (value) return value;
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
        if (value) return value;
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
      if (value) return value;
    }
  } catch {}

  const fromAuth = getTokenFromAuthModule();
  if (fromAuth) return fromAuth;

  const fromAppCore = getTokenFromAppCore();
  if (fromAppCore) return fromAppCore;

  const memory = normalizeTokenValue(tokenMemory.token);
  if (memory) return memory;

  if (opts.allowStorageTokens === true) {
    for (const key of STORAGE_TOKEN_KEYS) {
      const value = readStorageFacadeValue(key);
      if (value) return value;
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
  if (fromAuth) return fromAuth;

  const fromAppCore = getRefreshTokenFromAppCore();
  if (fromAppCore) return fromAppCore;

  const memory = normalizeTokenValue(tokenMemory.refreshToken);
  if (memory) return memory;

  if (opts.allowStorageTokens === true) {
    for (const key of STORAGE_REFRESH_TOKEN_KEYS) {
      const value = readStorageFacadeValue(key);
      if (value) return value;
    }

    return readFirstBrowserStorage([
      ...STORAGE_REFRESH_TOKEN_KEYS,
      ...LEGACY_STORAGE_REFRESH_TOKEN_KEYS,
    ]);
  }

  return "";
}

export function setAuthTokens(payload = {}) {
  const nextToken = normalizeTokenValue(
    payload.token ||
      payload.accessToken ||
      payload.access_token
  );

  const nextRefresh = normalizeTokenValue(
    payload.refreshToken ||
      payload.refresh_token
  );

  const nextTemp = normalizeTokenValue(
    payload.tempToken ||
      payload.temp_token
  );

  if (nextToken) tokenMemory.token = nextToken;
  if (nextRefresh) tokenMemory.refreshToken = nextRefresh;
  if (nextTemp) tokenMemory.tempToken = nextTemp;

  if (payload.persist === true) {
    if (nextToken) {
      writeStorageFacadeValue("token", nextToken);
      writeStorageFacadeValue("accessToken", nextToken);
      writeBrowserSessionValue(`${getStoragePrefix()}:token`, nextToken);
      writeBrowserSessionValue(`${getStoragePrefix()}:accessToken`, nextToken);
    }

    if (nextRefresh) {
      writeStorageFacadeValue("refreshToken", nextRefresh);
      writeBrowserSessionValue(`${getStoragePrefix()}:refreshToken`, nextRefresh);
    }

    if (nextTemp) {
      writeStorageFacadeValue("tempToken", nextTemp);
      writeBrowserSessionValue(`${getStoragePrefix()}:tempToken`, nextTemp);
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

    for (const key of storageCandidates([
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
   PAYLOAD NORMALIZATION
========================================================= */

function collectObjects(value, depth = 0, seen = new WeakSet()) {
  if (depth > 7 || !value || typeof value !== "object") return [];

  try {
    if (seen.has(value)) return [];
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

function pickText(objects = [], keys = [], { token = false } = {}) {
  for (const object of toArray(objects)) {
    for (const key of toArray(keys)) {
      const value = token
        ? normalizeTokenValue(object?.[key])
        : safeText(object?.[key], "");

      if (value) return value;
    }
  }

  return "";
}

function pickObject(objects = [], keys = []) {
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
    token: pickText(objects, TOKEN_KEYS, { token: true }),
    refreshToken: pickText(objects, REFRESH_TOKEN_KEYS, { token: true }),
    tempToken: pickText(objects, TEMP_TOKEN_KEYS, { token: true }),
  };
}

function hasUsableUser(user = null) {
  try {
    if (isFunction(coreIsUsableUser) && coreIsUsableUser(user)) {
      return true;
    }
  } catch {}

  const current = safeObject(user);

  if (!Object.keys(current).length) return false;

  return Boolean(
    safeText(current.id, "") ||
      safeText(current.userId, "") ||
      safeText(current.user_id, "") ||
      safeText(current.uid, "") ||
      safeText(current.sub, "") ||
      safeText(current._id, "") ||
      safeText(current.username, "") ||
      safeText(current.userName, "") ||
      safeText(current.user_name, "") ||
      safeText(current.email, "") ||
      safeText(current.mail, "") ||
      safeText(current.phone, "") ||
      safeText(current.telefono, "") ||
      safeText(current.name, "") ||
      safeText(current.displayName, "")
  );
}

function extractUser(payload = {}) {
  const objects = collectObjects(payload);
  const direct = pickObject(objects, USER_KEYS);

  if (hasUsableUser(direct)) return direct;

  for (const object of objects) {
    if (
      hasUsableUser(object) &&
      !extractTokens(object).token &&
      !Object.prototype.hasOwnProperty.call(object, "ok") &&
      !Object.prototype.hasOwnProperty.call(object, "success")
    ) {
      return object;
    }
  }

  return null;
}

function extractSession(payload = {}) {
  return pickObject(collectObjects(payload), SESSION_KEYS);
}

function getExistingUser(AppCore = installedAppCore) {
  const state = safeObject(AppCore?.state);

  return (
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    state.account ||
    state.profile ||
    state.session?.user ||
    state.sessionData?.user ||
    null
  );
}

function resolveRole(payload = {}, user = null) {
  const objects = collectObjects(payload);

  return safeLower(
    pickText(objects, [
      "role",
      "rol",
      "userRole",
      "user_role",
      "type",
      "tipo",
    ]) ||
      user?.role ||
      user?.rol ||
      "user",
    "user"
  );
}

function normalizeUserForClient(user = {}, fallbackRole = "user") {
  if (!hasUsableUser(user)) return null;

  try {
    const normalized = coreNormalizeUser(user);

    if (normalized && hasUsableUser(normalized)) {
      const role = safeLower(normalized.role || normalized.rol || fallbackRole || "user", "user");

      return {
        ...normalized,
        role,
        rol: role,
        userRole: role,
        roles: unique([role, ...safeArray(normalized.roles)]),
      };
    }
  } catch {}

  const source = safeObject(user);
  const userId = safeText(source.userId || source.user_id || source.uid || source.sub || source.id || source._id, "");
  const email = safeText(source.email || source.mail || "", "");
  const username = safeText(source.username || source.userName || source.user_name || source.usernameLower || source.username_lower || source.slug || "", "");
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

  const role = safeLower(fallbackRole || source.role || source.rol || "user", "user");

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

  return {
    ...source,

    id: source.id || userId || null,
    userId: source.userId || userId || null,
    user_id: source.user_id || userId || null,
    uid: source.uid || userId || null,
    sub: source.sub || userId || null,

    email: email || null,
    emailLower: source.emailLower || source.email_lower || (email ? email.toLowerCase() : null),
    email_lower: source.email_lower || source.emailLower || (email ? email.toLowerCase() : null),

    username: username || usernameLower || null,
    usernameLower: usernameLower || null,
    username_lower: source.username_lower || usernameLower || null,
    slug: source.slug || usernameLower || null,

    name: displayName,
    nombre: source.nombre || displayName,
    displayName,
    fullName: source.fullName || displayName,

    role,
    rol: role,
    userRole: role,
    roles: unique([role, ...safeArray(source.roles)]),

    permissions: safeArray(source.permissions || source.permisos),
    permisos: safeArray(source.permisos || source.permissions),

    avatar: avatar || null,
    avatarUrl: avatar || null,
    picture: avatar || null,
    hasAvatar: source.hasAvatar === true || source.has_avatar === true || Boolean(avatar),
  };
}

function computeAuth(user, token) {
  const cleanToken = normalizeTokenValue(token);
  const cleanUser = normalizeUserForClient(user, user?.role || user?.rol || "user");

  if (!cleanToken || !cleanUser) return false;

  try {
    return Boolean(coreComputeAuthenticated(cleanUser, cleanToken));
  } catch {
    return Boolean(cleanToken && hasUsableUser(cleanUser));
  }
}

/* =========================================================
   AUTH COMMIT
========================================================= */

export function setAuthPayloadCommitter(fn) {
  authPayloadCommitter = isFunction(fn) ? fn : null;
  return true;
}

function commitAuthPayloadToCore(AppCore, payload = {}, meta = {}) {
  if (!AppCore) return false;

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
  const existingUser = getExistingUser(AppCore);

  const role = resolveRole(data, rawUser || existingUser);
  const user =
    normalizeUserForClient(rawUser, role) ||
    normalizeUserForClient(existingUser, role);

  const session = extractSession(data);
  const activeToken = tokens.token || getAccessToken({ allowStorageTokens: true });
  const authenticated = computeAuth(user, activeToken);

  const patch = {};

  if (activeToken) {
    patch.token = activeToken;
    patch.accessToken = activeToken;
    patch.access_token = activeToken;
    patch.hasToken = true;
  }

  if (authenticated && user) {
    patch.user = user;
    patch.currentUser = user;
    patch.authUser = user;
    patch.sessionUser = user;
    patch.account = user;
    patch.profile = user;

    patch.role = role;
    patch.rol = role;
    patch.userRole = role;
    patch.roles = unique([role, ...safeArray(user.roles)]);

    patch.username = user.slug || user.usernameLower || user.username || null;
    patch.currentResolvedUsername =
      user.slug ||
      user.usernameLower ||
      user.username ||
      AppCore?.state?.currentResolvedUsername ||
      null;

    patch.resolvedUsername = patch.currentResolvedUsername;

    patch.avatar = user.avatarUrl || user.avatar || null;
    patch.avatarUrl = user.avatarUrl || user.avatar || null;

    patch.authenticated = true;
    patch.lastAuthSource = safeText(meta.source, SOURCE);

    patch.lastMeAt =
      meta.endpoint && /\/auth\/(?:me|session|profile|whoami|current)\b/i.test(meta.endpoint)
        ? iso()
        : AppCore?.state?.lastMeAt || null;
  } else {
    patch.authenticated = false;

    if (!activeToken) {
      patch.hasToken = false;
    }
  }

  if (tokens.refreshToken) {
    patch.refreshToken = tokens.refreshToken;
    patch.refresh_token = tokens.refreshToken;
  }

  if (tokens.tempToken) {
    patch.tempToken = tokens.tempToken;
    patch.temp_token = tokens.tempToken;
    patch.twoFactorPending = true;
    patch.authenticated = false;
  }

  if (session && authenticated && user) {
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

  if (!Object.keys(patch).length) return false;

  let committed = false;

  try {
    if (isFunction(AppCore.setState)) {
      AppCore.setState(patch, {
        source: "core:http:auth-payload",
        emit: false,
        emitState: false,
        silent: true,
        forceUnauthenticated: !activeToken,
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
    this.at = iso();

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

function payloadCode(payload = {}, fallback = "HTTP_ERROR") {
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

function payloadMessage(payload = {}, fallback = "Error HTTP.") {
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
    return {
      data: await response.blob(),
      text: "",
      json: false,
    };
  }

  if (responseType === "arrayBuffer" || responseType === "arraybuffer") {
    return {
      data: await response.arrayBuffer(),
      text: "",
      json: false,
    };
  }

  const text = await response.text().catch(() => "");

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
      throw new HttpError("La API devolvió JSON inválido.", {
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
   HEADERS / BODY
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
    if (safeLower(key, "") === needle) delete headers[key];
  }

  return headers;
}

function resolveRequestAuth(path = "", options = {}) {
  const opts = safeObject(options);

  if (AUTH_ME_PATH_RE.test(path)) return true;

  try {
    if (isFunction(coreIsPrivateApiPath) && coreIsPrivateApiPath(path)) {
      return true;
    }
  } catch {}

  if (
    opts.auth === false ||
    opts.public === true ||
    opts.noAuthHeader === true ||
    opts.skipAuth === true
  ) {
    return false;
  }

  if (opts.auth === true) return true;

  try {
    if (isFunction(coreIsPublicApiPath)) {
      return !coreIsPublicApiPath(path);
    }
  } catch {}

  return !AUTH_PUBLIC_CONTROL_PATH_RE.test(path);
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

  if (
    auth !== false &&
    noAuthHeader !== true &&
    !hasHeader(finalHeaders, "Authorization")
  ) {
    const token = getAccessToken({ allowStorageTokens });

    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }

  if (auth === false || noAuthHeader === true) {
    deleteHeader(finalHeaders, "Authorization");
  }

  return finalHeaders;
}

function buildBody(body = undefined) {
  if (body === undefined || body === null) return undefined;

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
   ABORT / RETRY
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

  return Math.max(0, safeNumber(config?.requestRetries ?? config?.api?.retries, 0));
}

function retryAfterMs(value = "") {
  const raw = safeText(value, "");

  if (!raw) return 0;

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

function retryAfterHeader(error = null) {
  const headers = safeObject(error?.headers);

  for (const [key, value] of Object.entries(headers)) {
    if (safeLower(key, "") === "retry-after") {
      return safeText(value, "");
    }
  }

  return "";
}

function retryDelayMs(attempt = 0, options = {}, error = null) {
  const retryAfter = retryAfterMs(retryAfterHeader(error));

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
          url,
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
          payloadMessage(data, `HTTP ${response.status}`),
          {
            status: response.status,
            code: payloadCode(
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
          await wait(retryDelayMs(attempt, opts, error), opts.signal);
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

      const network = error instanceof TypeError || error?.network === true;

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
              network,
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
        await wait(retryDelayMs(attempt, opts, normalized), opts.signal);
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

function isRefreshExcludedPath(path = "") {
  if (AUTH_ME_PATH_RE.test(path)) return false;

  return (
    REFRESH_PATH_RE.test(path) ||
    LOGIN_PATH_RE.test(path) ||
    LOGOUT_PATH_RE.test(path) ||
    AUTH_PUBLIC_CONTROL_PATH_RE.test(path)
  );
}

function shouldAttemptRefresh(error, endpoint = "", options = {}) {
  const opts = safeObject(options);

  if (
    opts.skipRefresh === true ||
    opts._skipAuthRefresh === true ||
    opts.skipAuthRefresh === true
  ) {
    return false;
  }

  if (opts.auth === false || opts.public === true || opts.noAuthHeader === true) {
    return false;
  }

  if (!(error instanceof HttpError)) return false;
  if (error.status !== 401 && error.status !== 419) return false;

  const path = getUrlPathname(buildApiUrl(endpoint, opts));

  if (isRefreshExcludedPath(path)) return false;

  return true;
}

export async function refreshSession(options = {}) {
  if (refreshPromise) return refreshPromise;

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
  if (isPlainObject(firstArg) && (firstArg.url || firstArg.path || firstArg.endpoint)) {
    return {
      endpoint: firstArg.url || firstArg.path || firstArg.endpoint,
      options: {
        ...firstArg,
        url: undefined,
        path: undefined,
        endpoint: undefined,
      },
    };
  }

  if (
    typeof firstArg === "string" &&
    /^[A-Z]+$/i.test(firstArg) &&
    typeof secondArg === "string"
  ) {
    return {
      endpoint: secondArg,
      options: {
        ...safeObject(thirdArg),
        method: firstArg.toUpperCase(),
      },
    };
  }

  return {
    endpoint: firstArg,
    options: safeObject(secondArg),
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
    httpStats.lastRequestAt = iso();

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
  if (!isPlainObject(value)) return false;

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
   AUTH HELPERS
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
   INSTALL
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

export const installCoreHttp = installHttp;
export const install = installHttp;

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

    at: iso(),
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

export const http = Http;
export const apiClient = Http;
export const client = Http;

try {
  if (isBrowser()) {
    window.__ONION_HTTP__ = Http;
    window.__ONION_API_ORIGIN__ = getApiOrigin();
  }
} catch {}

export default Http;
