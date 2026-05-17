/* =========================================================
   Onion SPA - Core HTTP
   Archivo: src/core/http.js

   CORE HTTP · SIMPLE
   - fachada única sobre src/core/request.js
   - backend canónico: https://api.onionit.net
   - sin fetch propio, parser propio, retry propio ni timeout propio
   - sin Router, Toast, navegación, storage agresivo ni Auth pesada
   - Auth real delegada a src/features/auth/*
   - eventos/snapshots sin tokens reales
========================================================= */

import { config } from "./config.js";

import {
  hasValidToken as coreHasValidToken,
  isPublicApiPath as coreIsPublicApiPath,
  redactTokenInText as coreRedactTokenInText,
} from "./helpers.js";

import {
  createRequest,
  createApiClient,
} from "./request.js";

export const HTTP_VERSION = "21.0.0-simple";

export const DEFAULT_API_ORIGIN = config?.canonicalProductionApiBase || "https://api.onionit.net";
export const DEFAULT_API_PREFIX = "/api";
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_AUTH_TIMEOUT_MS = 30000;
export const DEFAULT_REFRESH_TIMEOUT_MS = 30000;

const SOURCE = "CoreHTTP";

const FRONTEND_HOST_RE = /^(?:www\.)?onionsupport\.com$/i;
const AUTH_PATH_RE = /^\/api\/auth(?:\/|$)/i;
const AUTH_ME_PATH_RE = /^(?:\/api)?\/auth\/me\/?$|^(?:\/api)?\/me\/?$/i;
const AUTH_PUBLIC_PATH_RE = /^\/api\/auth\/(?:login|refresh|token\/refresh|renew|2fa(?:\/|$)|mfa(?:\/|$)|otp(?:\/|$)|activate(?:\/|$)|activate-account(?:\/|$)|activation(?:\/|$)|account\/activate(?:\/|$)|reset-password(?:\/|$)|reset-password-request|reset-password-confirm|forgot-password|recover-password|password-reset(?:\/|$)|_health|health)(?:\/|$)/i;

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
let installContext = null;
let requestEngine = null;
let apiEngine = null;
let externalRequest = null;
let tokenProvider = null;
let authPayloadCommitter = null;
let refreshPromise = null;

const runtimeState = {
  token: "",
  accessToken: "",
  access_token: "",
  refreshToken: "",
  refresh_token: "",
  tempToken: "",
  temp_token: "",
  hasToken: false,
};

const httpStats = {
  version: HTTP_VERSION,
  total: 0,
  success: 0,
  error: 0,
  refresh: 0,
  lastRequestAt: "",
  lastUrl: "",
  lastError: null,
};

/* =========================================================
   BASICS
========================================================= */

const isFn = (value) => typeof value === "function";
const isObj = (value) => value !== null && typeof value === "object";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isPlainObject(value) {
  if (!isObj(value) || Array.isArray(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const out = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return out || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
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

function hasOwn(target, key) {
  try {
    return Object.prototype.hasOwnProperty.call(target, key);
  } catch {
    return false;
  }
}

function defineValue(target, key, value) {
  if (!target || !key) return false;

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

/* =========================================================
   REDACTION / EVENTS
========================================================= */

export function redactHttpText(value = "") {
  let out = safeText(value, "");
  if (!out) return "";

  try {
    if (isFn(coreRedactTokenInText)) out = coreRedactTokenInText(out);
  } catch {}

  try {
    out = out
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|otp|totp)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return out;
}

function sanitizePayload(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (depth > 5) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactHttpText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactHttpText(value.message || ""),
      status: value.status || value.statusCode || 0,
      code: value.code || "",
      timeout: Boolean(value.timeout),
      aborted: Boolean(value.aborted),
      stack: value.stack ? "[stack]" : "",
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizePayload(item, depth + 1, keyHint, seen));
  }

  if (isObj(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      out[key] = sanitizePayload(item, depth + 1, key, seen);
    }
    return out;
  }

  return redactHttpText(String(value));
}

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const clean = sanitizePayload({
    source: SOURCE,
    version: HTTP_VERSION,
    at: iso(),
    ...safeObject(payload),
  });

  const events = installedAppCore?.events || installedAppCore?.Events || installContext?.events || null;

  for (const method of ["emit", "dispatch", "trigger"]) {
    try {
      if (isFn(events?.[method])) {
        events[method](name, clean);
        return true;
      }
    } catch {}
  }

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail: clean }));
      return true;
    }
  } catch {}

  return false;
}

function safeWarn(...args) {
  const clean = args.map((item) => sanitizePayload(item));

  try {
    if (isFn(installedAppCore?.utils?.warn)) {
      installedAppCore.utils.warn("[CoreHTTP]", ...clean);
      return;
    }
  } catch {}

  try {
    if (config?.debug) console.warn("[CoreHTTP]", ...clean);
  } catch {}
}

/* =========================================================
   ORIGIN / URL
========================================================= */

function isFrontendOrigin(origin = "") {
  try {
    return FRONTEND_HOST_RE.test(new URL(origin).hostname);
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
    if (!["http:", "https:"].includes(url.protocol)) return fallback;

    const origin = url.origin.replace(/\/+$/g, "");
    if (opts.allowFrontendOrigin !== true && isFrontendOrigin(origin)) return fallback;

    return origin === new URL(DEFAULT_API_ORIGIN).origin ? DEFAULT_API_ORIGIN : origin;
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
      DEFAULT_API_ORIGIN,
    DEFAULT_API_ORIGIN
  );
}

export function getApiOrigin() {
  return normalizeOrigin(apiOrigin, DEFAULT_API_ORIGIN);
}

export function setApiOrigin(value = "", options = {}) {
  apiOrigin = normalizeOrigin(value || DEFAULT_API_ORIGIN, DEFAULT_API_ORIGIN, options);

  try {
    if (isBrowser()) window.__ONION_API_ORIGIN__ = apiOrigin;
  } catch {}

  return apiOrigin;
}

function normalizePath(path = "/") {
  let value = safeText(path, "/").replace(/\\/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/{2,}/g, "/");
  return value.length > 1 ? value.replace(/\/+$/g, "") || "/" : value || "/";
}

function splitRelativeUrl(value = "/") {
  const raw = safeText(value, "/");
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const queryIndex = beforeHash.indexOf("?");
  const pathname = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";

  return {
    pathname: normalizePath(pathname || "/"),
    search,
    hash,
  };
}

function appendQuery(url = "", query = null) {
  if (!query) return url;

  try {
    const parsed = new URL(url);

    if (typeof URLSearchParams !== "undefined" && query instanceof URLSearchParams) {
      for (const [key, value] of query.entries()) parsed.searchParams.set(key, value);
      return parsed.toString();
    }

    if (Array.isArray(query)) {
      for (const [key, value] of query) {
        if (value !== undefined && value !== null && value !== "") parsed.searchParams.append(String(key), String(value));
      }
      return parsed.toString();
    }

    if (isPlainObject(query)) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;

        if (Array.isArray(value)) {
          for (const item of value) {
            if (item !== undefined && item !== null && item !== "") parsed.searchParams.append(key, String(item));
          }
        } else {
          parsed.searchParams.set(key, String(value));
        }
      }
      return parsed.toString();
    }
  } catch {}

  return url;
}

function ensureApiPath(endpoint = "/", options = {}) {
  const opts = safeObject(options);
  const parts = splitRelativeUrl(endpoint);

  if (opts.api === false) return `${parts.pathname}${parts.search}${parts.hash}`;

  const prefix = normalizePath(opts.apiPrefix || DEFAULT_API_PREFIX);
  if (parts.pathname === prefix || parts.pathname.startsWith(`${prefix}/`)) {
    return `${parts.pathname}${parts.search}${parts.hash}`;
  }

  return `${prefix}${parts.pathname}${parts.search}${parts.hash}`;
}

function rewriteFrontendApiUrl(raw = "", options = {}) {
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
  } catch {}

  return raw;
}

export function buildApiUrl(endpoint = "/", options = {}) {
  const opts = safeObject(options);
  const raw = safeText(endpoint, "/");

  if (/^https?:\/\//i.test(raw)) {
    return appendQuery(rewriteFrontendApiUrl(raw, opts), opts.query || opts.params);
  }

  const path = ensureApiPath(raw, opts);
  const origin = normalizeOrigin(opts.origin || opts.baseURL || opts.baseUrl || getApiOrigin(), DEFAULT_API_ORIGIN, opts);

  return appendQuery(`${origin}${path}`, opts.query || opts.params);
}

function pathFromEndpoint(endpoint = "/", options = {}) {
  try {
    return new URL(buildApiUrl(endpoint, options)).pathname || "/";
  } catch {
    return normalizePath(endpoint);
  }
}

function isPublicAuthPath(path = "") {
  try {
    return Boolean(coreIsPublicApiPath(path));
  } catch {
    return AUTH_PUBLIC_PATH_RE.test(path);
  }
}

/* =========================================================
   TOKEN HELPERS
========================================================= */

function unwrapStoredValue(value = "") {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return safeText(value, "");

  if (isPlainObject(value)) {
    for (const key of [...TOKEN_KEYS, ...REFRESH_TOKEN_KEYS, ...TEMP_TOKEN_KEYS, "value", "raw", "data"]) {
      const nested = unwrapStoredValue(value[key]);
      if (nested) return nested;
    }
    return "";
  }

  const raw = safeText(value, "");
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    if (["string", "number", "boolean"].includes(typeof parsed) || isPlainObject(parsed)) return unwrapStoredValue(parsed);
  } catch {}

  return raw;
}

function normalizeTokenValue(value = "") {
  const token = unwrapStoredValue(value).replace(/^Bearer\s+/i, "").trim();
  if (!token || BAD_TOKEN_VALUES.has(token.toLowerCase())) return "";
  if (/[\r\n\t\s]/.test(token)) return "";
  if (token.length > 8192) return "";

  try {
    if (isFn(coreHasValidToken) && !coreHasValidToken(token)) return "";
  } catch {}

  return token;
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

function readTokenFromAuthModule(kind = "access") {
  const Auth = getAuthModule();
  const methods = kind === "refresh" ? ["getStoredRefreshToken", "getRefreshToken"] : ["getAccessToken", "getToken"];

  for (const method of methods) {
    try {
      if (isFn(Auth?.[method])) {
        const token = normalizeTokenValue(Auth[method]());
        if (token) return token;
      }
    } catch {}
  }

  try {
    if (kind === "access" && isFn(Auth?.getAuthHeader)) {
      const header = Auth.getAuthHeader();
      const token = normalizeTokenValue(header?.Authorization || header?.authorization || "");
      if (token) return token;
    }
  } catch {}

  return "";
}

function coreState() {
  return installedAppCore?.state && typeof installedAppCore.state === "object"
    ? installedAppCore.state
    : installContext?.state && typeof installContext.state === "object"
      ? installContext.state
      : runtimeState;
}

function readTokenFromState(kind = "access") {
  const state = safeObject(coreState());
  const session = safeObject(state.session || state.sessionData);

  if (kind === "refresh") {
    return normalizeTokenValue(
      state.refreshToken ||
        state.refresh_token ||
        session.refreshToken ||
        session.refresh_token ||
        runtimeState.refreshToken ||
        runtimeState.refresh_token ||
        ""
    );
  }

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
      runtimeState.token ||
      runtimeState.accessToken ||
      runtimeState.access_token ||
      ""
  );
}

export function setTokenProvider(provider) {
  tokenProvider = isFn(provider) ? provider : null;
  return true;
}

export function getAccessToken() {
  try {
    if (isFn(tokenProvider)) {
      const token = normalizeTokenValue(tokenProvider());
      if (token) return token;
    }
  } catch {}

  return readTokenFromAuthModule("access") || readTokenFromState("access") || "";
}

export function getRefreshToken() {
  return readTokenFromAuthModule("refresh") || readTokenFromState("refresh") || "";
}

function writeRuntimeTokenState(tokens = {}) {
  const token = normalizeTokenValue(tokens.token || tokens.accessToken || tokens.access_token);
  const refreshToken = normalizeTokenValue(tokens.refreshToken || tokens.refresh_token);
  const tempToken = normalizeTokenValue(tokens.tempToken || tokens.temp_token);
  const state = coreState();

  if (token) {
    runtimeState.token = token;
    runtimeState.accessToken = token;
    runtimeState.access_token = token;
    runtimeState.hasToken = true;
  }

  if (refreshToken) {
    runtimeState.refreshToken = refreshToken;
    runtimeState.refresh_token = refreshToken;
  }

  if (tempToken) {
    runtimeState.tempToken = tempToken;
    runtimeState.temp_token = tempToken;
  }

  try {
    if (state && typeof state === "object") {
      if (token) {
        state.token = token;
        state.accessToken = token;
        state.access_token = token;
        state.hasToken = true;
      }

      if (refreshToken) {
        state.refreshToken = refreshToken;
        state.refresh_token = refreshToken;
      }

      if (tempToken) {
        state.tempToken = tempToken;
        state.temp_token = tempToken;
        state.twoFactorPending = true;
      }
    }
  } catch {}
}

function syncRuntimeTokenState() {
  writeRuntimeTokenState({
    token: getAccessToken(),
    refreshToken: getRefreshToken(),
  });
}

export function setAuthTokens(payload = {}) {
  writeRuntimeTokenState(safeObject(payload));

  return {
    token: runtimeState.token,
    refreshToken: runtimeState.refreshToken,
    tempToken: runtimeState.tempToken,
  };
}

export function clearAuthTokens() {
  runtimeState.token = "";
  runtimeState.accessToken = "";
  runtimeState.access_token = "";
  runtimeState.refreshToken = "";
  runtimeState.refresh_token = "";
  runtimeState.tempToken = "";
  runtimeState.temp_token = "";
  runtimeState.hasToken = false;

  const state = coreState();

  try {
    if (state && typeof state === "object") {
      for (const key of ["token", "accessToken", "access_token", "authToken", "auth_token", "jwt", "refreshToken", "refresh_token", "tempToken", "temp_token"]) {
        delete state[key];
      }

      state.hasToken = false;
      state.twoFactorPending = false;
    }
  } catch {}

  return true;
}

/* =========================================================
   AUTH PAYLOAD CAPTURE
========================================================= */

function collectObjects(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || depth > 5) return [];

  try {
    if (seen.has(value)) return [];
    seen.add(value);
  } catch {}

  const output = [value];

  for (const key of ["data", "payload", "result", "body", "response", "auth", "session", "sessionData"]) {
    if (value[key] && typeof value[key] === "object") output.push(...collectObjects(value[key], depth + 1, seen));
  }

  return output;
}

function pickToken(objects = [], keys = []) {
  for (const object of safeArray(objects)) {
    for (const key of safeArray(keys)) {
      const token = normalizeTokenValue(object?.[key]);
      if (token) return token;
    }
  }

  return "";
}

function extractTokens(payload = {}) {
  const objects = collectObjects(payload);

  return {
    token: pickToken(objects, TOKEN_KEYS),
    refreshToken: pickToken(objects, REFRESH_TOKEN_KEYS),
    tempToken: pickToken(objects, TEMP_TOKEN_KEYS),
  };
}

export function setAuthPayloadCommitter(fn) {
  authPayloadCommitter = isFn(fn) ? fn : null;
  return true;
}

function handleAuthPayload(payload = {}, meta = {}) {
  const tokens = extractTokens(payload);
  if (tokens.token || tokens.refreshToken || tokens.tempToken) setAuthTokens(tokens);

  try {
    if (isFn(authPayloadCommitter)) {
      authPayloadCommitter(payload, {
        source: "core:http",
        ...safeObject(meta),
      });
    }
  } catch (error) {
    safeWarn("authPayloadCommitter failed", error);
  }

  return payload;
}

/* =========================================================
   ERROR COMPAT
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
    this.headers = sanitizePayload(options.headers || {});
    this.retriable = Boolean(options.retriable);
    this.timeout = Boolean(options.timeout);
    this.aborted = Boolean(options.aborted);
    this.network = Boolean(options.network);
    this.at = iso();

    defineValue(this, "raw", options.raw || null);
  }
}

/* =========================================================
   REQUEST ENGINE
========================================================= */

function resolveInstallInput(input = null, options = {}) {
  const context = input?.AppCore || input?.core ? input : null;
  const appCore = context?.AppCore || context?.core || input || installedAppCore;

  return {
    context,
    appCore,
    options: {
      ...safeObject(context?.options),
      ...safeObject(options),
    },
  };
}

function configureAppCore(input = null, options = {}) {
  const resolved = resolveInstallInput(input, options);

  installContext = resolved.context || installContext;
  installedAppCore = resolved.appCore || installedAppCore;

  const opts = resolved.options;

  setApiOrigin(
    opts.apiOrigin ||
      opts.baseURL ||
      opts.baseUrl ||
      opts.apiBase ||
      resolveRuntimeApiOrigin()
  );

  externalRequest = isFn(opts.request)
    ? opts.request
    : isFn(installContext?.request)
      ? installContext.request
      : isFn(installedAppCore?.baseRequest)
        ? installedAppCore.baseRequest
        : null;

  if (!authPayloadCommitter && isFn(installedAppCore?.applySession)) {
    authPayloadCommitter = (payload, meta) => installedAppCore.applySession(payload, meta);
  }

  setTokenProvider(() => readTokenFromState("access") || runtimeState.token || "");

  requestEngine = null;
  apiEngine = null;

  return getApiOrigin();
}

function ensureRequestEngine() {
  if (requestEngine && apiEngine) {
    return { requestEngine, apiEngine };
  }

  syncRuntimeTokenState();

  requestEngine = isFn(externalRequest)
    ? externalRequest
    : createRequest({
        state: coreState(),
        events: installedAppCore?.events || installedAppCore?.Events || installContext?.events || null,
        setError: installedAppCore?.setError || installedAppCore?.setLastError || installContext?.setError || null,
        utils: installedAppCore?.utils || installContext?.utils || null,
        registry: installedAppCore?.registry || installContext?.registry || installedAppCore || null,
        hooks: installedAppCore?.hooks || installContext?.hooks || null,
      });

  apiEngine = createApiClient(requestEngine);

  return { requestEngine, apiEngine };
}

function normalizeRequestArgs(firstArg = "/", secondArg = {}, thirdArg = {}) {
  if (isPlainObject(firstArg) && (firstArg.url || firstArg.path || firstArg.endpoint)) {
    return {
      endpoint: firstArg.url || firstArg.path || firstArg.endpoint,
      options: {
        ...firstArg,
        url: undefined,
        path: undefined,
        endpoint: undefined,
        ...safeObject(secondArg),
      },
    };
  }

  if (typeof firstArg === "string" && /^[A-Z]+$/i.test(firstArg) && typeof secondArg === "string") {
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

function requestOptions(endpoint = "/", options = {}) {
  const opts = safeObject(options);
  const path = pathFromEndpoint(endpoint, opts);

  const auth = AUTH_ME_PATH_RE.test(path)
    ? true
    : opts.auth === false || opts.public === true || opts.skipAuth === true || opts.noAuthHeader === true
      ? false
      : opts.auth === true
        ? true
        : !isPublicAuthPath(path);

  return {
    ...opts,
    auth,
    public: auth === false,
    skipAuth: auth === false,
    token: auth ? opts.token || getAccessToken() : "",
    timeout: safeNumber(opts.timeout ?? opts.timeoutMs, AUTH_PATH_RE.test(path) ? DEFAULT_AUTH_TIMEOUT_MS : DEFAULT_TIMEOUT_MS),
    query: undefined,
    params: undefined,
  };
}

function shouldCaptureAuth(endpoint = "/", options = {}) {
  const opts = safeObject(options);
  if (opts.captureAuth === true) return true;
  if (opts.captureAuth === false) return false;
  return AUTH_PATH_RE.test(pathFromEndpoint(endpoint, opts));
}

export async function request(firstArg = "/", secondArg = {}, thirdArg = {}) {
  const parsed = normalizeRequestArgs(firstArg, secondArg, thirdArg);
  const endpoint = parsed.endpoint;
  const opts = safeObject(parsed.options);
  const url = buildApiUrl(endpoint, opts);
  const finalOptions = requestOptions(endpoint, opts);

  syncRuntimeTokenState();

  httpStats.total += 1;
  httpStats.lastRequestAt = iso();
  httpStats.lastUrl = redactHttpText(url);

  try {
    const result = await ensureRequestEngine().apiEngine.request(url, finalOptions);

    if (shouldCaptureAuth(endpoint, opts) && isPlainObject(result)) {
      const path = pathFromEndpoint(endpoint, opts);

      handleAuthPayload(result, {
        endpoint: path,
        method: finalOptions.method || "GET",
        reason: AUTH_ME_PATH_RE.test(path)
          ? "me"
          : path.includes("/login")
            ? "login"
            : path.includes("/refresh")
              ? "refresh"
              : "auth-response",
        emit: opts.emitAuthEvents !== false,
      });
    }

    httpStats.success += 1;
    return result;
  } catch (error) {
    httpStats.error += 1;
    httpStats.lastError = sanitizePayload(error);
    throw error;
  }
}

export function get(endpoint = "/", options = {}) {
  return request(endpoint, { ...safeObject(options), method: "GET" });
}

export function head(endpoint = "/", options = {}) {
  return request(endpoint, { ...safeObject(options), method: "HEAD" });
}

export function optionsRequest(endpoint = "/", options = {}) {
  return request(endpoint, { ...safeObject(options), method: "OPTIONS" });
}

export function post(endpoint = "/", body = undefined, options = {}) {
  return request(endpoint, { ...safeObject(options), method: "POST", body });
}

export function put(endpoint = "/", body = undefined, options = {}) {
  return request(endpoint, { ...safeObject(options), method: "PUT", body });
}

export function patch(endpoint = "/", body = undefined, options = {}) {
  return request(endpoint, { ...safeObject(options), method: "PATCH", body });
}

function looksLikeOptionsObject(value = {}) {
  return isPlainObject(value) && [
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
  ].some((key) => hasOwn(value, key));
}

export function del(endpoint = "/", bodyOrOptions = {}, maybeOptions = undefined) {
  if (maybeOptions !== undefined) {
    return request(endpoint, { ...safeObject(maybeOptions), method: "DELETE", body: bodyOrOptions });
  }

  if (looksLikeOptionsObject(bodyOrOptions)) {
    return request(endpoint, { ...safeObject(bodyOrOptions), method: "DELETE" });
  }

  return request(endpoint, { method: "DELETE", body: bodyOrOptions });
}

export function upload(endpoint = "/", formData, options = {}) {
  return request(endpoint, { ...safeObject(options), method: options.method || "POST", body: formData });
}

export function download(endpoint = "/", options = {}) {
  return request(endpoint, { ...safeObject(options), method: options.method || "GET", responseType: options.responseType || "blob" });
}

export function raw(endpoint = "/", options = {}) {
  return request(endpoint, { ...safeObject(options), raw: true });
}

/* =========================================================
   AUTH HELPERS
========================================================= */

export function login(credentials = {}, options = {}) {
  return post("/auth/login", credentials, {
    auth: false,
    public: true,
    skipAuth: true,
    retries: 0,
    timeoutMs: DEFAULT_AUTH_TIMEOUT_MS,
    captureAuth: true,
    ...safeObject(options),
  });
}

export function me(options = {}) {
  return get("/auth/me", {
    auth: true,
    public: false,
    retries: 0,
    timeoutMs: DEFAULT_AUTH_TIMEOUT_MS,
    cache: "no-store",
    captureAuth: true,
    ...safeObject(options),
  });
}

export async function refreshSession(options = {}) {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    httpStats.refresh += 1;

    const refreshToken = getRefreshToken();
    const body = refreshToken ? { refreshToken, refresh_token: refreshToken } : undefined;

    return post("/auth/refresh", body, {
      auth: false,
      public: true,
      skipAuth: true,
      retries: 0,
      timeoutMs: safeNumber(options.timeoutMs ?? options.timeout, DEFAULT_REFRESH_TIMEOUT_MS),
      captureAuth: true,
      ...safeObject(options),
    });
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export function refresh(options = {}) {
  return refreshSession(options);
}

export function logout(options = {}) {
  return post("/auth/logout", {}, {
    auth: true,
    retries: 0,
    timeoutMs: DEFAULT_AUTH_TIMEOUT_MS,
    captureAuth: false,
    ...safeObject(options),
  }).finally(() => {
    clearAuthTokens();
  });
}

/* =========================================================
   INSTALL / FACADE
========================================================= */

function createApiClientFacade() {
  return {
    version: HTTP_VERSION,

    get origin() {
      return getApiOrigin();
    },

    setOrigin: setApiOrigin,
    buildUrl: buildApiUrl,
    buildApiUrl,

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
    setAuthPayloadCommitter,
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
  configureAppCore(AppCore, safeObject(options));

  const api = createApiClientFacade();

  try {
    if (installedAppCore && typeof installedAppCore === "object") {
      defineValue(installedAppCore, "http", api);
      defineValue(installedAppCore, "Http", api);
      defineValue(installedAppCore, "api", api);
      defineValue(installedAppCore, "apiClient", api);

      if (!installedAppCore.services || typeof installedAppCore.services !== "object") installedAppCore.services = {};

      installedAppCore.services.http = api;
      installedAppCore.services.Http = api;
      installedAppCore.services.api = api;
      installedAppCore.services.apiClient = api;
    }
  } catch {}

  try {
    const modules = installedAppCore?.modules;

    if (isFn(modules?.register)) {
      modules.register("Http", api, {
        overwrite: true,
        replace: true,
        aliases: ["http", "api", "ApiClient", "apiClient"],
        source: "core/http.js",
      });
    } else if (isFn(modules?.set)) {
      modules.set("Http", api);
      modules.set("http", api);
      modules.set("api", api);
      modules.set("ApiClient", api);
      modules.set("apiClient", api);
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

export function getHttpSnapshot(options = {}) {
  const requestSnapshot = ensureRequestEngine().requestEngine?.getSnapshot?.(options) || null;

  return sanitizePayload({
    version: HTTP_VERSION,

    origin: getApiOrigin(),
    defaultOrigin: DEFAULT_API_ORIGIN,
    apiPrefix: DEFAULT_API_PREFIX,

    installed: Boolean(installedAppCore),
    hasFetch: typeof globalThis !== "undefined" && isFn(globalThis.fetch),
    hasAbortController: typeof AbortController === "function",

    hasTokenProvider: Boolean(tokenProvider),
    hasAuthModule: Boolean(getAuthModule()),

    hasAccessToken: Boolean(getAccessToken()),
    hasRefreshToken: Boolean(getRefreshToken()),

    refreshInFlight: Boolean(refreshPromise),

    stats: httpStats,
    request: requestSnapshot,

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

    policy: {
      facadeOnly: true,
      backendCanonical: true,
      noOwnFetch: true,
      noOwnRetry: true,
      noOwnParser: true,
      noRouter: true,
      noToast: true,
      noStorageAggressive: true,
      mePrivate: true,
      redactedSnapshots: true,
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
