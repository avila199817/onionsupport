/* =========================================================
   Onion SPA - HTTP Service
   Archivo: src/services/index.js

   HTTP SERVICE · FINAL SIMPLE
   - Fachada fina de compatibilidad para Services
   - Delega ejecución en src/core/http.js
   - Backend real: https://api.onionit.net
   - Sin fetch propio, retry propio, parser propio ni refresh propio
   - Sin Router, Toast, loader global, storage paralelo ni lógica de negocio
   - Core/Auth/Router/App/Store/Toast/Services separados
========================================================= */

import { AppCore } from "../core/index.js";
import CoreHttp from "../core/http.js";

/* =========================================================
   VERSION
========================================================= */

export const HTTP_SERVICE_VERSION = "20.0.0-final";

const SERVICE_NAME = "http";
const SERVICE_SOURCE = "services/index.js";
const DEFAULT_API_BASE = "https://api.onionit.net";
const DEFAULT_TIMEOUT_MS = 30000;
const UPLOAD_TIMEOUT_MS = 120000;

const AUTH_ME_CANONICAL = "/api/auth/me";

const PUBLIC_AUTH_RE = /^\/?(?:api\/)?auth\/(?:login|refresh|token\/refresh|renew|2fa(?:\/|$)|mfa(?:\/|$)|otp(?:\/|$)|activate(?:\/|$)|activate-account(?:\/|$)|activation(?:\/|$)|account\/activate(?:\/|$)|reset-password(?:\/|$)|reset-password-request|reset-password-confirm|forgot-password|recover-password|password-reset(?:\/|$)|_health|health)(?:\/|$)/i;
const AUTH_ME_RE = /^\/?(?:api\/)?(?:auth\/me|me)\/?$/i;

const PATH_KEYS = Object.freeze([
  "path",
  "url",
  "endpoint",
  "href",
  "input",
  "resource",
  "finalUrl",
  "originalUrl",
  "requestUrl",
  "route",
  "pathname",
]);

const OPTION_KEYS = Object.freeze([
  "method",
  "headers",
  "query",
  "params",
  "body",
  "data",
  "payload",
  "auth",
  "public",
  "skipAuth",
  "noAuthHeader",
  "timeout",
  "timeoutMs",
  "signal",
  "retries",
  "retryDelay",
  "retryDelayMs",
  "retryMaxDelay",
  "retryMaxDelayMs",
  "responseType",
  "raw",
  "expectedStatuses",
  "credentials",
  "cache",
  "mode",
  "redirect",
  "referrerPolicy",
  "keepalive",
  "silent",
  "dedupe",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

let activeAppCore = AppCore || null;
let tokenProvider = null;
let requestSeq = 0;
let interceptorSeq = 0;

const serviceConfig = {
  apiBase: DEFAULT_API_BASE,
  apiOrigin: DEFAULT_API_BASE,
  apiUrl: DEFAULT_API_BASE,
  timeout: DEFAULT_TIMEOUT_MS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  defaultResponseType: "auto",
  debug: false,
};

const serviceState = {
  version: HTTP_SERVICE_VERSION,
  initialized: false,
  installed: false,
  installedAt: "",
  total: 0,
  success: 0,
  error: 0,
  aborted: 0,
  timeout: 0,
  lastRequestAt: "",
  lastSuccessAt: "",
  lastErrorAt: "",
  lastRequest: null,
  lastError: null,
};

const interceptors = {
  request: [],
  response: [],
  error: [],
};

/* =========================================================
   BASICS
========================================================= */

const isFn = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isPlainObject(value) {
  if (!isObject(value) || Array.isArray(value)) return false;

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

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeUpper(value = "", fallback = "GET") {
  return safeText(value, fallback).toUpperCase();
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

function getAppCore() {
  return activeAppCore || AppCore || null;
}

function nextRequestId() {
  requestSeq += 1;
  return `svc_req_${requestSeq}_${now()}`;
}

function redact(value = "") {
  let output = safeText(value, "");

  if (!output) return "";

  try {
    output = output
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|otp|totp)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function sanitize(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (depth > 4) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redact(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redact(value.message || ""),
      status: value.status || value.statusCode || 0,
      code: value.code || "",
      timeout: Boolean(value.timeout),
      aborted: Boolean(value.aborted),
      stack: value.stack ? "[stack]" : "",
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitize(item, depth + 1, keyHint, seen));
  }

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = sanitize(item, depth + 1, key, seen);
    }

    return output;
  }

  return redact(String(value));
}

function safeWarn(...args) {
  const App = getAppCore();
  const clean = args.map((item) => sanitize(item));

  try {
    App?.utils?.warn?.("[HTTP Service]", ...clean);
    return;
  } catch {}

  try {
    if (serviceConfig.debug || App?.config?.debugHttpService) {
      console.warn("[HTTP Service]", ...clean);
    }
  } catch {}
}

/* =========================================================
   CONFIG / URL
========================================================= */

function normalizeOrigin(value = "") {
  const raw = safeText(value, DEFAULT_API_BASE).replace(/\/+$/g, "");

  if (!raw || raw === "/" || raw === "/api" || raw === "api") {
    return DEFAULT_API_BASE;
  }

  try {
    const url = new URL(raw);
    return url.origin.replace(/\/+$/g, "") || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

function syncCoreOrigin(origin = DEFAULT_API_BASE) {
  try {
    CoreHttp?.setOrigin?.(origin);
  } catch {}

  const App = getAppCore();

  try {
    if (App?.config && typeof App.config === "object") {
      App.config.apiBase = origin;
      App.config.apiOrigin = origin;
      App.config.apiUrl = origin;

      if (!App.config.api || typeof App.config.api !== "object") {
        App.config.api = {};
      }

      App.config.api.base = origin;
      App.config.api.baseUrl = origin;
      App.config.api.origin = origin;
    }
  } catch {}
}

export function configure(patch = {}) {
  const next = safeObject(patch);
  const origin = normalizeOrigin(
    next.apiBase ||
      next.apiOrigin ||
      next.apiUrl ||
      next.baseURL ||
      next.baseUrl ||
      serviceConfig.apiBase ||
      DEFAULT_API_BASE
  );

  serviceConfig.apiBase = origin;
  serviceConfig.apiOrigin = origin;
  serviceConfig.apiUrl = origin;

  serviceConfig.timeout = safeNumber(
    next.timeout ?? next.timeoutMs ?? serviceConfig.timeout,
    DEFAULT_TIMEOUT_MS
  );

  serviceConfig.timeoutMs = serviceConfig.timeout;

  serviceConfig.defaultResponseType =
    safeText(next.defaultResponseType || next.responseType, serviceConfig.defaultResponseType) || "auto";

  serviceConfig.debug = next.debug === true || serviceConfig.debug === true;

  syncCoreOrigin(origin);

  return getConfig();
}

export function getConfig() {
  return sanitize({
    version: HTTP_SERVICE_VERSION,
    apiBase: serviceConfig.apiBase,
    apiOrigin: serviceConfig.apiOrigin,
    apiUrl: serviceConfig.apiUrl,
    timeout: serviceConfig.timeout,
    timeoutMs: serviceConfig.timeoutMs,
    defaultResponseType: serviceConfig.defaultResponseType,
    debug: serviceConfig.debug,
  });
}

export function buildUrl(path = "/", query = null) {
  try {
    if (isFn(CoreHttp?.buildApiUrl)) {
      return CoreHttp.buildApiUrl(path, { query });
    }

    if (isFn(CoreHttp?.buildUrl)) {
      return CoreHttp.buildUrl(path, { query });
    }
  } catch {}

  try {
    const url = new URL(safeText(path, "/"), serviceConfig.apiBase || DEFAULT_API_BASE);

    if (query && isPlainObject(query)) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  } catch {
    return safeText(path, "/");
  }
}

export { redact };

/* =========================================================
   PATH / REQUEST NORMALIZATION
========================================================= */

function pathFromConfig(requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  for (const key of PATH_KEYS) {
    const value = safeText(cfg[key], "");
    if (value) return value;
  }

  return "";
}

function normalizePath(path = "/") {
  const raw = safeText(path, "/");

  if (/^https?:\/\//i.test(raw)) return raw;
  if (AUTH_ME_RE.test(raw.replace(/^\/+/, ""))) return AUTH_ME_CANONICAL;

  if (!raw.startsWith("/")) return `/${raw}`;
  return raw.replace(/\/{2,}/g, "/") || "/";
}

function normalizeOptions(options = {}) {
  const opts = safeObject(options);

  const body = opts.body !== undefined
    ? opts.body
    : opts.data !== undefined
      ? opts.data
      : opts.payload;

  const timeout = safeNumber(
    opts.timeout ?? opts.timeoutMs ?? serviceConfig.timeout,
    DEFAULT_TIMEOUT_MS
  );

  const normalized = {
    ...opts,
    method: safeUpper(opts.method, "GET"),
    body,
    timeout,
    timeoutMs: timeout,
    responseType: opts.responseType || serviceConfig.defaultResponseType || "auto",
    requestId: opts.requestId || nextRequestId(),
  };

  if (normalized.query === undefined && normalized.params !== undefined) {
    normalized.query = normalized.params;
  }

  return normalized;
}

function normalizeRequestArgs(arg1 = "/", arg2 = {}, arg3 = {}) {
  if (isPlainObject(arg1)) {
    return {
      path: normalizePath(pathFromConfig(arg1) || "/"),
      options: normalizeOptions({
        ...arg1,
        ...safeObject(arg2),
      }),
    };
  }

  if (
    typeof arg1 === "string" &&
    /^[A-Z]+$/i.test(arg1) &&
    typeof arg2 === "string"
  ) {
    return {
      path: normalizePath(arg2),
      options: normalizeOptions({
        ...safeObject(arg3),
        method: arg1,
      }),
    };
  }

  return {
    path: normalizePath(arg1),
    options: normalizeOptions(arg2),
  };
}

function looksLikeOptionsObject(value = {}) {
  return isPlainObject(value) && OPTION_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

/* =========================================================
   TOKENS / AUTH POLICY
========================================================= */

export function setTokenProvider(provider = null) {
  tokenProvider = isFn(provider) ? provider : null;

  try {
    CoreHttp?.setTokenProvider?.(tokenProvider);
  } catch {}

  return Boolean(tokenProvider);
}

export function getAccessToken() {
  try {
    const token = tokenProvider?.();
    if (safeText(token, "")) return safeText(token, "").replace(/^Bearer\s+/i, "");
  } catch {}

  try {
    return CoreHttp?.getAccessToken?.() || "";
  } catch {
    return "";
  }
}

export function getRefreshToken() {
  try {
    return CoreHttp?.getRefreshToken?.() || "";
  } catch {
    return "";
  }
}

export function setAuthTokens(payload = {}) {
  try {
    return CoreHttp?.setAuthTokens?.(payload) || {};
  } catch {
    return {};
  }
}

export function clearAuthTokens(options = {}) {
  try {
    return CoreHttp?.clearAuthTokens?.(options) !== false;
  } catch {
    return true;
  }
}

export function isAuthMeRequest(path = "") {
  return AUTH_ME_RE.test(safeText(path, "").replace(/^\/+/, ""));
}

export function isPublicRequest(path = "", options = {}) {
  const opts = safeObject(options);
  const cleanPath = safeText(path, "").replace(/^\/+/, "");

  if (isAuthMeRequest(cleanPath)) return false;
  if (opts.public === true || opts.auth === false || opts.skipAuth === true || opts.noAuthHeader === true) return true;
  if (opts.public === false || opts.auth === true) return false;

  return PUBLIC_AUTH_RE.test(cleanPath);
}

export function isPrivateRequest(path = "", options = {}) {
  return !isPublicRequest(path, options);
}

/* =========================================================
   REQUEST EXECUTION
========================================================= */

function normalizeError(error, requestConfig = {}) {
  if (error instanceof Error) {
    try {
      if (!error.requestId) error.requestId = requestConfig.requestId;
      if (!error.method) error.method = requestConfig.method;
      if (!error.path) error.path = redact(requestConfig.path || "");
    } catch {}

    return error;
  }

  const normalized = new Error(safeText(error?.message || error, "HTTP request error."));
  normalized.name = "HttpServiceError";
  normalized.status = error?.status || error?.statusCode || 0;
  normalized.code = error?.code || "HTTP_SERVICE_ERROR";
  normalized.requestId = requestConfig.requestId || "";
  normalized.method = requestConfig.method || "";
  normalized.path = redact(requestConfig.path || "");
  normalized.timeout = Boolean(error?.timeout);
  normalized.aborted = Boolean(error?.aborted);
  return normalized;
}

function recordStart(requestConfig = {}) {
  serviceState.total += 1;
  serviceState.lastRequestAt = iso();
  serviceState.lastRequest = sanitize({
    requestId: requestConfig.requestId,
    method: requestConfig.method,
    path: requestConfig.path,
    public: requestConfig.public === true,
    auth: requestConfig.auth !== false,
  });
}

function recordSuccess() {
  serviceState.success += 1;
  serviceState.lastSuccessAt = iso();
}

function recordError(error = null) {
  serviceState.error += 1;
  serviceState.lastErrorAt = iso();

  if (error?.aborted === true) serviceState.aborted += 1;
  if (error?.timeout === true) serviceState.timeout += 1;

  serviceState.lastError = sanitize(error);
}

export async function request(...args) {
  init();

  const parsed = normalizeRequestArgs(...args);
  const options = normalizeOptions({
    ...parsed.options,
    path: parsed.path,
  });

  options.path = parsed.path;

  if (options.public === undefined && options.auth === undefined && options.skipAuth === undefined) {
    options.public = isPublicRequest(parsed.path, options);
    options.auth = !options.public;
    options.skipAuth = options.public;
  }

  recordStart(options);

  try {
    const response = await CoreHttp.request(parsed.path, options);
    recordSuccess();
    return response;
  } catch (error) {
    const normalized = normalizeError(error, options);
    recordError(normalized);
    throw normalized;
  }
}

/* =========================================================
   METHOD HELPERS
========================================================= */

export function get(path, options = {}) {
  return request("GET", path, options);
}

export function head(path, options = {}) {
  return request("HEAD", path, options);
}

export function options(path, requestOptions = {}) {
  return request("OPTIONS", path, requestOptions);
}

export function post(path, body = null, requestOptions = {}) {
  return request("POST", path, {
    ...safeObject(requestOptions),
    body,
  });
}

export function put(path, body = null, requestOptions = {}) {
  return request("PUT", path, {
    ...safeObject(requestOptions),
    body,
  });
}

export function patch(path, body = null, requestOptions = {}) {
  return request("PATCH", path, {
    ...safeObject(requestOptions),
    body,
  });
}

export function del(path, bodyOrOptions = {}, maybeOptions = undefined) {
  if (maybeOptions !== undefined) {
    return request("DELETE", path, {
      ...safeObject(maybeOptions),
      body: bodyOrOptions,
    });
  }

  if (looksLikeOptionsObject(bodyOrOptions)) {
    return request("DELETE", path, safeObject(bodyOrOptions));
  }

  return request("DELETE", path, {
    body: bodyOrOptions,
  });
}

export function raw(path, requestOptions = {}) {
  return request("GET", path, {
    ...safeObject(requestOptions),
    raw: true,
  });
}

export function upload(path, body, requestOptions = {}) {
  return request(safeText(requestOptions.method, "POST"), path, {
    ...safeObject(requestOptions),
    body,
    upload: true,
    timeout: requestOptions.timeout || requestOptions.timeoutMs || UPLOAD_TIMEOUT_MS,
  });
}

export function download(path, requestOptions = {}) {
  return request("GET", path, {
    ...safeObject(requestOptions),
    download: true,
    responseType: requestOptions.responseType || "blob",
    timeout: requestOptions.timeout || requestOptions.timeoutMs || UPLOAD_TIMEOUT_MS,
  });
}

/* =========================================================
   AUTH CONVENIENCE
========================================================= */

export function login(body = {}, requestOptions = {}) {
  return CoreHttp.login(body, {
    ...safeObject(requestOptions),
    public: true,
    auth: false,
    skipAuth: true,
    captureAuth: true,
  });
}

export function me(requestOptions = {}) {
  return CoreHttp.me({
    ...safeObject(requestOptions),
    auth: true,
    public: false,
    captureAuth: true,
  });
}

export function refresh(bodyOrOptions = {}, maybeOptions = undefined) {
  const body = safeObject(bodyOrOptions);
  const hasExplicitBody = Boolean(body.refreshToken || body.refresh_token || body.token);

  if (maybeOptions !== undefined || hasExplicitBody) {
    return CoreHttp.post("/auth/refresh", bodyOrOptions, {
      ...safeObject(maybeOptions),
      public: true,
      auth: false,
      skipAuth: true,
      captureAuth: true,
    });
  }

  return CoreHttp.refresh({
    ...body,
    public: true,
    auth: false,
    skipAuth: true,
    captureAuth: true,
  });
}

export function refreshSession(requestOptions = {}) {
  return CoreHttp.refreshSession({
    ...safeObject(requestOptions),
    public: true,
    auth: false,
    skipAuth: true,
    captureAuth: true,
  });
}

export function logout(body = {}, requestOptions = {}) {
  return CoreHttp.logout({
    ...safeObject(requestOptions),
    body,
  });
}

export function logoutLocal() {
  clearAuthTokens();
  return true;
}

/* =========================================================
   INTERCEPTOR COMPAT API
   - Compatibilidad superficial.
   - No se ejecutan aquí: la ejecución real vive en Core HTTP/hooks.
========================================================= */

function addInterceptor(type = "request", handler = null, interceptorOptions = {}) {
  if (!isFn(handler) || !interceptors[type]) return null;

  interceptorSeq += 1;

  const item = {
    id: `${type}_${interceptorSeq}`,
    type,
    handler,
    enabled: interceptorOptions.enabled !== false,
    createdAt: iso(),
  };

  interceptors[type].push(item);
  return item.id;
}

function findInterceptor(ref, type = "") {
  const groups = type && interceptors[type]
    ? [interceptors[type]]
    : Object.values(interceptors);

  for (const group of groups) {
    const item = group.find((entry) => entry.id === ref || entry === ref);
    if (item) return item;
  }

  return null;
}

export function useRequest(handler, interceptorOptions = {}) {
  return addInterceptor("request", handler, interceptorOptions);
}

export function useResponse(handler, interceptorOptions = {}) {
  return addInterceptor("response", handler, interceptorOptions);
}

export function useError(handler, interceptorOptions = {}) {
  return addInterceptor("error", handler, interceptorOptions);
}

export function ejectInterceptor(ref, type = "") {
  let removed = false;

  const groups = type && interceptors[type]
    ? [interceptors[type]]
    : Object.values(interceptors);

  for (const group of groups) {
    const index = group.findIndex((entry) => entry.id === ref || entry === ref);

    if (index >= 0) {
      group.splice(index, 1);
      removed = true;
    }
  }

  return removed;
}

export function enableInterceptor(ref, type = "") {
  const item = findInterceptor(ref, type);
  if (!item) return false;
  item.enabled = true;
  return true;
}

export function disableInterceptor(ref, type = "") {
  const item = findInterceptor(ref, type);
  if (!item) return false;
  item.enabled = false;
  return true;
}

export function clearInterceptors(type = "") {
  if (type && interceptors[type]) {
    const count = interceptors[type].length;
    interceptors[type].splice(0);
    return count;
  }

  const count = Object.values(interceptors).reduce((sum, group) => sum + group.length, 0);

  for (const group of Object.values(interceptors)) {
    group.splice(0);
  }

  return count;
}

/* =========================================================
   INSTALL / RUNTIME
========================================================= */

export function attachToAppCore(AppCoreRef = getAppCore()) {
  const App = AppCoreRef || getAppCore();
  if (!App || typeof App !== "object") return false;

  activeAppCore = App;

  try {
    if (!App.services || typeof App.services !== "object") {
      App.services = {};
    }

    App.services.http = Http;
    App.services.Http = Http;
    App.services.api = Http;
    App.services.apiClient = Http;
  } catch {}

  try {
    if (!App.http && CoreHttp) App.http = CoreHttp;
    if (!App.Http && CoreHttp) App.Http = CoreHttp;
    if (!App.api && CoreHttp) App.api = CoreHttp;
    if (!App.apiClient && CoreHttp) App.apiClient = CoreHttp;
  } catch {}

  try {
    if (isFn(App.modules?.register)) {
      App.modules.register("ServiceHttp", Http, {
        overwrite: true,
        replace: true,
        aliases: ["serviceHttp", "ServicesHttp", "services.http"],
        source: SERVICE_SOURCE,
        emit: false,
        silent: true,
      });
    } else if (isFn(App.modules?.set)) {
      App.modules.set("ServiceHttp", Http);
      App.modules.set("serviceHttp", Http);
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.__ONION_HTTP_SERVICE__ = Http;
      window.__ONION_API_ORIGIN__ = serviceConfig.apiBase;

      if (!window.__ONION_HTTP__) {
        window.__ONION_HTTP__ = CoreHttp || Http;
      }
    }
  } catch {}

  serviceState.installed = true;
  serviceState.installedAt = serviceState.installedAt || iso();

  return true;
}

export function init(patch = {}) {
  configure(patch);

  try {
    CoreHttp?.install?.(getAppCore(), {
      apiBase: serviceConfig.apiBase,
    });
  } catch (error) {
    safeWarn("CoreHttp install falló.", error);
  }

  attachToAppCore(getAppCore());

  serviceState.initialized = true;
  return Http;
}

export function install(AppCoreRef = AppCore, installOptions = {}) {
  activeAppCore = AppCoreRef || activeAppCore || AppCore;
  return init(installOptions);
}

export function resetRuntime(resetOptions = {}) {
  if (resetOptions.clearInterceptors === true) {
    clearInterceptors();
  }

  serviceState.total = 0;
  serviceState.success = 0;
  serviceState.error = 0;
  serviceState.aborted = 0;
  serviceState.timeout = 0;
  serviceState.lastRequestAt = "";
  serviceState.lastSuccessAt = "";
  serviceState.lastErrorAt = "";
  serviceState.lastRequest = null;
  serviceState.lastError = null;

  return true;
}

export function createAbortController() {
  try {
    return new AbortController();
  } catch {
    return null;
  }
}

export function abort(controller, reason = "http-abort") {
  try {
    controller?.abort?.(reason);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getState() {
  return getSnapshot();
}

export function getSnapshot(snapshotOptions = {}) {
  const deep = snapshotOptions?.deep === true;

  let coreSnapshot = null;

  if (deep) {
    try {
      coreSnapshot = CoreHttp?.getSnapshot?.() || CoreHttp?.snapshot?.() || null;
    } catch {}
  }

  return sanitize({
    version: HTTP_SERVICE_VERSION,
    service: SERVICE_NAME,
    initialized: serviceState.initialized,
    installed: serviceState.installed,
    installedAt: serviceState.installedAt,
    apiBase: serviceConfig.apiBase,
    pendingRequests: safeNumber(getAppCore()?.state?.pendingRequests, 0),
    stats: serviceState,
    auth: {
      hasAccessToken: Boolean(getAccessToken()),
      hasRefreshToken: Boolean(getRefreshToken()),
      authMePrivate: true,
    },
    config: getConfig(),
    interceptors: {
      request: interceptors.request.length,
      response: interceptors.response.length,
      error: interceptors.error.length,
    },
    core: coreSnapshot,
    policy: {
      delegatesToCoreHttp: true,
      ownFetch: false,
      ownRetry: false,
      ownParser: false,
      ownRefresh: false,
      ownStorage: false,
      ownRouter: false,
      ownToast: false,
      overwritesCoreHttp: false,
    },
    at: iso(),
  });
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

const Http = {
  __ONION_HTTP_SERVICE__: true,
  SERVICE_NAME,
  HTTP_SERVICE_VERSION,
  version: HTTP_SERVICE_VERSION,

  init,
  install,
  configure,
  attachToAppCore,

  getConfig,
  getState,
  getSnapshot,
  getDebugSnapshot: getSnapshot,
  snapshot: getSnapshot,

  request,

  get,
  head,
  options,
  post,
  put,
  patch,
  delete: del,
  del,
  raw,

  upload,
  download,

  login,
  me,
  refresh,
  refreshSession,
  logout,
  logoutLocal,

  setTokenProvider,
  setAuthTokens,
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,

  isPublicEndpoint: isPublicRequest,
  isPublicRequest,
  isPrivateRequest,
  isAuthMeEndpoint: isAuthMeRequest,
  isAuthMeRequest,

  buildUrl,
  redact,

  createAbortController,
  abort,

  interceptors,
  useRequest,
  useResponse,
  useError,
  ejectInterceptor,
  enableInterceptor,
  disableInterceptor,
  clearInterceptors,

  resetRuntime,
};

attachToAppCore();

export { Http };

export default Http;
