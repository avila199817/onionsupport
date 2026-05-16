/* =========================================================
   Onion SPA - HTTP Service
   Archivo: src/services/index.js

   HTTP SERVICE · FACADE ÚNICA SPA
   - Cliente HTTP central.
   - Backend real: https://api.onionit.net.
   - Delega ejecución en http.request.js.
   - Delega auto-refresh 401 en http.auth.js.
   - Runtime/pending en http.runtime.js.
   - Interceptores opcionales en http.interceptors.js.
   - Sin router, sin vistas, sin lógica de negocio.
   - Sin apiClient.js paralelo.
   - Sin TDZ/serviceConfig before initialization.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";

import {
  HTTP_CONFIG,
  HTTP_HELPERS_VERSION,

  isFn,
  safeObject,
  safeText,
  safeNumber,
  safeBoolean,
  nowMs,
  isoNow,

  normalizeMethod,
  isBodylessMethod,

  normalizeHeaders,
  hasHeader,
  setHeader,
  deleteHeader,

  redactHttpValue,
  sanitizeData,
  sanitizeRequestConfig,

  isPublicEndpoint,
  isAuthMeEndpoint,
  shouldToggleGlobalLoader,

  normalizeError,
  getHttpHelpersSnapshot,
} from "./http.helpers.js";

import {
  executeWithRetry,
  getHttpRequestEngineSnapshot,
} from "./http.request.js";

import {
  runAutoRefreshIfNeeded,
  getHttpAuthSnapshot,
  resetHttpAuthRuntime,
} from "./http.auth.js";

import {
  incrementPendingRequests,
  decrementPendingRequests,
  resetPendingRequests,

  createAbortController as createRuntimeAbortController,
  abortController as abortRuntimeController,

  getHttpRuntimeSnapshot,
  resetHttpRuntime,
} from "./http.runtime.js";

import {
  createInterceptorsState,
  useRequest,
  useResponse,
  useError,
  ejectInterceptor,
  enableInterceptor,
  disableInterceptor,
  clearInterceptors,
  resetInterceptorsRuntime,
  runRequestInterceptors,
  runResponseInterceptors,
  runErrorInterceptors,
  getInterceptorsSnapshot,
} from "./http.interceptors.js";

/* =========================================================
   VERSION
========================================================= */

export const HTTP_SERVICE_VERSION = "18.0.1-config-tdz-fix";

const SERVICE_NAME = "http";
const SERVICE_SOURCE = "services/index.js";

const DEFAULT_API_BASE = "https://api.onionit.net";
const DEFAULT_TIMEOUT_MS = safeNumber(HTTP_CONFIG?.timeout, 30_000);
const UPLOAD_TIMEOUT_MS = 120_000;

const AUTH_ME_CANONICAL = "/api/auth/me";

const RESOURCE_PREFIXES = Object.freeze([
  "/users",
  "/usuarios",
  "/clientes",
  "/clients",
  "/tickets",
  "/incidencias",
  "/facturas",
  "/invoices",
  "/search",
]);

const HEADER_DEFAULTS = Object.freeze({
  accept: "application/json",
  requestedWith: "XMLHttpRequest",
  client: "onion-spa",
});

const EVENTS = Object.freeze({
  ready: "http:ready",
  configured: "http:configured",
  installed: "http:installed",

  start: "http:request:start",
  success: "http:request:success",
  error: "http:request:error",
  complete: "http:request:complete",
  replay: "http:request:replay-after-refresh",

  logoutLocal: "http:logout-local",
});

/* =========================================================
   INTERNAL STATE
========================================================= */

const interceptors = createInterceptorsState();

const serviceState = {
  version: HTTP_SERVICE_VERSION,

  initialized: false,
  installed: false,
  installedAt: "",

  requestSeq: 0,

  total: 0,
  success: 0,
  error: 0,
  replay: 0,
  aborted: 0,
  timeout: 0,

  lastRequestAt: "",
  lastSuccessAt: "",
  lastErrorAt: "",

  lastRequest: null,
  lastError: null,
};

/*
  Importante:
  serviceConfig NO puede llamarse dentro de normalizeConfig()
  antes de estar inicializado.
*/
let serviceConfig = null;
let tokenProvider = null;

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nextRequestId() {
  serviceState.requestSeq += 1;
  return `http_${nowMs()}_${serviceState.requestSeq}`;
}

function isAbsoluteUrl(value = "") {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(safeText(value, ""));
}

function safeRedact(value = "") {
  try {
    return redactHttpValue(value);
  } catch {
    return safeText(value, "");
  }
}

function getCoreConfig() {
  return AppCore?.config || {};
}

function getCurrentConfigBase() {
  return serviceConfig || HTTP_CONFIG || {};
}

function safeWarn(...args) {
  const safeArgs = args.map((item) => sanitizeData(item));

  try {
    AppCore?.utils?.warn?.("[HTTP Service]", ...safeArgs);
    return;
  } catch {}

  try {
    if (serviceConfig?.debug || AppCore?.config?.debugHttpService) {
      console.warn("[HTTP Service]", ...safeArgs);
    }
  } catch {}
}

function safeConsoleError(...args) {
  const safeArgs = args.map((item) => sanitizeData(item));

  try {
    AppCore?.utils?.error?.("[HTTP Service]", ...safeArgs);
    return;
  } catch {}

  try {
    if (serviceConfig?.debug || AppCore?.config?.debugHttpService) {
      console.error("[HTTP Service]", ...safeArgs);
    }
  } catch {}
}

function safeEmit(name = "", payload = {}, requestConfig = {}) {
  const eventName = safeText(name, "");

  if (!eventName) return false;

  const cfg = safeObject(requestConfig);
  const cfgBase = getCurrentConfigBase();

  const shouldEmit =
    cfg.emitEvents !== false &&
    (
      cfg.emitLifecycleEvents === true ||
      cfg.debugHttpEvents === true ||
      cfgBase.emitLifecycleEvents === true ||
      cfgBase.debug === true ||
      AppCore?.config?.diagnostics?.httpLifecycleEvents === true ||
      AppCore?.config?.debugHttpService === true
    );

  if (!shouldEmit) return false;

  try {
    AppCore?.events?.emit?.(
      eventName,
      sanitizeData({
        version: HTTP_SERVICE_VERSION,
        source: SERVICE_SOURCE,
        at: isoNow(),
        ...safeObject(payload),
      })
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   CONFIG
========================================================= */

function normalizeApiBase(base = "") {
  const raw = safeText(base, DEFAULT_API_BASE).replace(/\/+$/g, "");

  if (!raw || raw === "/" || raw === "/api" || raw === "api") {
    return DEFAULT_API_BASE;
  }

  if (!isAbsoluteUrl(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const origin = parsed.origin.replace(/\/+$/g, "");
    const pathname = (parsed.pathname || "/").replace(/\/+$/g, "");

    if (!pathname || pathname === "/" || pathname === "/api") {
      return origin;
    }

    if (origin === DEFAULT_API_BASE) {
      return origin;
    }

    return `${origin}${pathname}`;
  } catch {
    return DEFAULT_API_BASE;
  }
}

function resolveCredentials(next = {}, coreConfig = {}, merged = {}) {
  if (next.defaultCredentials || next.credentials) {
    return next.defaultCredentials || next.credentials;
  }

  if (coreConfig.api?.defaultCredentials || coreConfig.api?.credentials) {
    return coreConfig.api.defaultCredentials || coreConfig.api.credentials;
  }

  if (coreConfig.api?.withCredentials === false) {
    return "omit";
  }

  return merged.defaultCredentials || "include";
}

function normalizeConfig(patch = {}) {
  const coreConfig = getCoreConfig();
  const current = getCurrentConfigBase();
  const next = safeObject(patch);

  const merged = {
    ...HTTP_CONFIG,
    ...current,
    ...next,
  };

  const apiBase = normalizeApiBase(
    next.apiBase ||
      next.apiOrigin ||
      next.apiUrl ||
      coreConfig.apiBase ||
      coreConfig.apiOrigin ||
      coreConfig.apiUrl ||
      coreConfig.api?.base ||
      coreConfig.api?.baseUrl ||
      coreConfig.api?.origin ||
      merged.apiBase ||
      DEFAULT_API_BASE
  );

  const timeout = safeNumber(
    next.timeout ??
      next.timeoutMs ??
      next.requestTimeout ??
      coreConfig.requestTimeout ??
      coreConfig.api?.timeout ??
      merged.timeout,
    DEFAULT_TIMEOUT_MS
  );

  return {
    ...merged,

    apiBase,
    apiOrigin: apiBase,
    apiUrl: apiBase,

    timeout,
    timeoutMs: timeout,

    retries: safeNumber(
      next.retries ??
        next.requestRetries ??
        coreConfig.requestRetries ??
        coreConfig.api?.retries ??
        merged.retries,
      safeNumber(HTTP_CONFIG?.retries, 0)
    ),

    retryDelay: safeNumber(
      next.retryDelay ??
        next.retryDelayMs ??
        coreConfig.requestRetryDelayMs ??
        coreConfig.api?.retryDelayMs ??
        merged.retryDelay,
      safeNumber(HTTP_CONFIG?.retryDelay, 350)
    ),

    retryMaxDelay: safeNumber(
      next.retryMaxDelay ??
        next.retryMaxDelayMs ??
        coreConfig.requestRetryMaxDelayMs ??
        coreConfig.api?.retryMaxDelayMs ??
        merged.retryMaxDelay,
      safeNumber(HTTP_CONFIG?.retryMaxDelay, 4000)
    ),

    defaultCredentials: resolveCredentials(next, coreConfig, merged),

    defaultUseLoader: safeBoolean(
      next.defaultUseLoader ??
        next.useLoader ??
        merged.defaultUseLoader,
      safeBoolean(HTTP_CONFIG?.defaultUseLoader, false)
    ),

    autoRefreshOn401: safeBoolean(
      next.autoRefreshOn401 ??
        next.autoRefresh ??
        merged.autoRefreshOn401,
      safeBoolean(HTTP_CONFIG?.autoRefreshOn401, true)
    ),

    autoLogoutOn401: safeBoolean(
      next.autoLogoutOn401 ??
        next.autoLogout ??
        merged.autoLogoutOn401,
      safeBoolean(HTTP_CONFIG?.autoLogoutOn401, true)
    ),

    emitLifecycleEvents: safeBoolean(
      next.emitLifecycleEvents ??
        merged.emitLifecycleEvents,
      false
    ),

    emitFinalEvents: safeBoolean(
      next.emitFinalEvents ??
        merged.emitFinalEvents,
      true
    ),

    defaultResponseType:
      next.defaultResponseType ||
      merged.defaultResponseType ||
      "auto",

    debug: safeBoolean(
      next.debug ??
        coreConfig.debugHttpService ??
        merged.debug,
      false
    ),
  };
}

/*
  Inicialización segura tras declarar normalizeConfig().
*/
serviceConfig = normalizeConfig({});

export function configure(patch = {}) {
  serviceConfig = normalizeConfig(patch);

  safeEmit(
    EVENTS.configured,
    {
      apiBase: serviceConfig.apiBase,
      timeout: serviceConfig.timeout,
      retries: serviceConfig.retries,
    },
    {
      emitLifecycleEvents: serviceConfig.emitLifecycleEvents,
    }
  );

  return getConfig();
}

export function getConfig() {
  return sanitizeData({
    version: HTTP_SERVICE_VERSION,

    apiBase: serviceConfig.apiBase,
    apiOrigin: serviceConfig.apiOrigin,
    apiUrl: serviceConfig.apiUrl,

    timeout: serviceConfig.timeout,
    timeoutMs: serviceConfig.timeoutMs,

    retries: serviceConfig.retries,
    retryDelay: serviceConfig.retryDelay,
    retryMaxDelay: serviceConfig.retryMaxDelay,

    defaultCredentials: serviceConfig.defaultCredentials,
    defaultUseLoader: serviceConfig.defaultUseLoader,

    autoRefreshOn401: serviceConfig.autoRefreshOn401,
    autoLogoutOn401: serviceConfig.autoLogoutOn401,

    emitLifecycleEvents: serviceConfig.emitLifecycleEvents,
    emitFinalEvents: serviceConfig.emitFinalEvents,

    debug: serviceConfig.debug,
  });
}

/* =========================================================
   PATH / URL
========================================================= */

function splitSuffix(path = "") {
  const raw = safeText(path, "/");

  let base = raw;
  let suffix = "";

  const hashIndex = base.indexOf("#");

  if (hashIndex >= 0) {
    suffix = base.slice(hashIndex);
    base = base.slice(0, hashIndex) || "/";
  }

  const queryIndex = base.indexOf("?");

  if (queryIndex >= 0) {
    suffix = `${base.slice(queryIndex)}${suffix}`;
    base = base.slice(0, queryIndex) || "/";
  }

  return {
    base,
    suffix,
  };
}

function normalizePathname(path = "/") {
  let value = safeText(path, "/").replace(/\\/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function normalizeServicePath(path = "/") {
  const raw = safeText(path, "/");

  if (isAbsoluteUrl(raw)) return raw;

  const { base, suffix } = splitSuffix(raw);
  let clean = normalizePathname(base);

  if (clean === "/me" || clean === "/api/me" || clean === "/auth/me") {
    clean = AUTH_ME_CANONICAL;
  } else if (clean.startsWith("/auth/")) {
    clean = `/api${clean}`;
  } else if (RESOURCE_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`))) {
    clean = `/api${clean}`;
  }

  return `${clean}${suffix}`;
}

function appendQuery(url = "", query = null) {
  if (!query) return url;

  let params = null;

  try {
    if (typeof URLSearchParams !== "undefined" && query instanceof URLSearchParams) {
      params = query;
    } else if (typeof query === "string") {
      params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    } else if (isObject(query)) {
      params = new URLSearchParams();

      for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined || value === "") continue;

        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item !== null && item !== undefined && item !== "") {
              params.append(key, String(item));
            }
          });
          continue;
        }

        if (value instanceof Date) {
          params.set(key, value.toISOString());
          continue;
        }

        if (typeof value === "object") {
          params.set(key, JSON.stringify(value));
          continue;
        }

        params.set(key, String(value));
      }
    }
  } catch {
    params = null;
  }

  const queryString = params?.toString?.() || "";

  if (!queryString) return url;

  return `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
}

function joinUrl(base = "", path = "") {
  const rawPath = safeText(path, "/");

  if (isAbsoluteUrl(rawPath)) return rawPath;

  const cleanBase = normalizeApiBase(base);
  const cleanPath = normalizeServicePath(rawPath);

  if (!cleanBase) return cleanPath;

  if (cleanBase.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${cleanBase}${cleanPath.slice(4)}`;
  }

  return `${cleanBase}/${cleanPath.replace(/^\/+/g, "")}`;
}

export function buildUrl(path = "/", query = null) {
  const normalized = normalizeServicePath(path);

  if (isAbsoluteUrl(normalized)) {
    return appendQuery(normalized, query);
  }

  return appendQuery(
    joinUrl(serviceConfig.apiBase || DEFAULT_API_BASE, normalized),
    query
  );
}

export function redact(value = "") {
  return safeRedact(value);
}

/* =========================================================
   AUTH / TOKEN HELPERS
========================================================= */

export function setTokenProvider(provider = null) {
  tokenProvider = isFn(provider) ? provider : null;
  return Boolean(tokenProvider);
}

function stripBearer(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function hasUsableToken(token = "") {
  const value = stripBearer(token);

  if (!value) return false;

  const lower = value.toLowerCase();

  if (
    [
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
    ].includes(lower)
  ) {
    return false;
  }

  return !/[\s\r\n\t]/.test(value);
}

export function getAccessToken() {
  try {
    const provided = tokenProvider?.();
    if (hasUsableToken(provided)) return stripBearer(provided);
  } catch {}

  try {
    const authToken = Auth?.getAccessToken?.() || Auth?.getToken?.();
    if (hasUsableToken(authToken)) return stripBearer(authToken);
  } catch {}

  try {
    const state = AppCore?.state || {};
    const session = state.session || state.sessionData || {};

    const token =
      state.token ||
      state.accessToken ||
      state.access_token ||
      session.token ||
      session.accessToken ||
      session.access_token ||
      "";

    if (hasUsableToken(token)) return stripBearer(token);
  } catch {}

  return "";
}

export function getRefreshToken() {
  try {
    const value = Auth?.getRefreshToken?.() || Auth?.session?.refreshToken;
    if (hasUsableToken(value)) return stripBearer(value);
  } catch {}

  try {
    const state = AppCore?.state || {};
    const session = state.session || state.sessionData || {};

    const token =
      state.refreshToken ||
      state.refresh_token ||
      session.refreshToken ||
      session.refresh_token ||
      "";

    if (hasUsableToken(token)) return stripBearer(token);
  } catch {}

  return "";
}

function getAuthHeader() {
  try {
    const header = AppCore?.getAuthHeader?.();

    if (header && typeof header === "object") {
      return header;
    }
  } catch {}

  const token = getAccessToken();

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

function shouldBePublic(path = "", options = {}) {
  const opts = safeObject(options);
  const normalized = normalizeServicePath(path);

  if (isAuthMeEndpoint(normalized)) return false;

  if (opts.public === true) return true;
  if (opts.auth === false || opts.skipAuth === true) return true;

  if (opts.public === false) return false;

  try {
    return Boolean(isPublicEndpoint(normalized));
  } catch {
    return false;
  }
}

export function isAuthMeRequest(path = "") {
  return Boolean(isAuthMeEndpoint(normalizeServicePath(path)));
}

export function isPublicRequest(path = "", options = {}) {
  return shouldBePublic(path, options);
}

export function isPrivateRequest(path = "", options = {}) {
  const opts = safeObject(options);

  if (shouldBePublic(path, opts)) return false;
  if (opts.auth === false || opts.skipAuth === true) return false;

  return true;
}

/* =========================================================
   REQUEST CONFIG
========================================================= */

function shouldUseLoader(requestConfig = {}) {
  const req = safeObject(requestConfig);

  if (req.loader === false || req.useLoader === false) return false;
  if (req.background === true || req.silent === true) return false;

  try {
    return Boolean(shouldToggleGlobalLoader(serviceConfig, req));
  } catch {}

  return serviceConfig.defaultUseLoader !== false;
}

function shouldTrackPending(requestConfig = {}) {
  const req = safeObject(requestConfig);
  return req.trackPending !== false && req.pending !== false;
}

function applyDefaultHeaders(headers = {}, requestConfig = {}) {
  const req = safeObject(requestConfig);
  const output = normalizeHeaders(headers || {});

  if (!hasHeader(output, "Accept")) {
    setHeader(output, "Accept", HEADER_DEFAULTS.accept);
  }

  if (!hasHeader(output, "X-Requested-With")) {
    setHeader(output, "X-Requested-With", HEADER_DEFAULTS.requestedWith);
  }

  if (!hasHeader(output, "X-Onion-Client")) {
    setHeader(output, "X-Onion-Client", HEADER_DEFAULTS.client);
  }

  if (!hasHeader(output, "X-Client-Version")) {
    setHeader(output, "X-Client-Version", HTTP_SERVICE_VERSION);
  }

  if (!hasHeader(output, "X-Request-Id")) {
    setHeader(output, "X-Request-Id", req.requestId);
  }

  if (req.noAuthHeader === true || req.public === true || req.auth === false || req.skipAuth === true) {
    deleteHeader(output, "Authorization");
    deleteHeader(output, "authorization");
    return output;
  }

  if (!hasHeader(output, "Authorization")) {
    const authHeader = getAuthHeader();
    const value = authHeader.Authorization || authHeader.authorization || "";

    if (value) {
      setHeader(output, "Authorization", value);
    }
  }

  return output;
}

function buildRequestConfig(method = "GET", path = "/", options = {}) {
  const opts = safeObject(options);
  const finalMethod = normalizeMethod(method);
  const finalPath = normalizeServicePath(path || opts.path || opts.url || "/");
  const requestId = opts.requestId || nextRequestId();

  const publicRequest = shouldBePublic(finalPath, opts);

  const authEnabled = opts.auth === false
    ? false
    : !publicRequest && opts.skipAuth !== true;

  const timeout = safeNumber(
    opts.timeout ??
      opts.timeoutMs ??
      opts.requestTimeout ??
      serviceConfig.timeout,
    DEFAULT_TIMEOUT_MS
  );

  const headers = applyDefaultHeaders(
    opts.headers,
    {
      ...opts,
      method: finalMethod,
      path: finalPath,
      requestId,
      public: publicRequest,
      auth: authEnabled,
      skipAuth: opts.skipAuth === true || publicRequest,
      noAuthHeader: opts.noAuthHeader === true || publicRequest || !authEnabled,
    }
  );

  const body =
    opts.body !== undefined
      ? opts.body
      : opts.data !== undefined
        ? opts.data
        : opts.payload;

  const requestConfig = {
    ...opts,

    method: finalMethod,
    path: finalPath,
    url: opts.url && isAbsoluteUrl(opts.url)
      ? opts.url
      : undefined,

    apiBase: opts.apiBase || serviceConfig.apiBase,

    requestId,
    headers,

    body: isBodylessMethod(finalMethod)
      ? undefined
      : body,

    public: publicRequest,
    auth: authEnabled,
    skipAuth: opts.skipAuth === true || publicRequest,
    noAuthHeader: opts.noAuthHeader === true || publicRequest || !authEnabled,

    timeout,
    timeoutMs: timeout,

    credentials: opts.credentials ?? serviceConfig.defaultCredentials ?? "include",
    cache: opts.cache ?? "no-store",

    responseType: opts.responseType || serviceConfig.defaultResponseType || "auto",

    retries:
      opts.retries !== undefined
        ? opts.retries
        : serviceConfig.retries,

    retry:
      opts.retry !== undefined
        ? opts.retry
        : undefined,

    retryDelay:
      opts.retryDelay ??
      opts.retryDelayMs ??
      serviceConfig.retryDelay,

    retryMaxDelay:
      opts.retryMaxDelay ??
      opts.retryMaxDelayMs ??
      serviceConfig.retryMaxDelay,

    autoRefresh:
      opts.autoRefresh === false || opts.noAutoRefresh === true
        ? false
        : serviceConfig.autoRefreshOn401 !== false,

    noAutoRefresh:
      opts.noAutoRefresh === true ||
      opts.autoRefresh === false ||
      publicRequest ||
      !authEnabled,

    _skipAuthRefresh:
      opts._skipAuthRefresh === true ||
      opts.skipAuthRefresh === true,

    skipAuthRefresh:
      opts._skipAuthRefresh === true ||
      opts.skipAuthRefresh === true,

    autoLogout:
      opts.autoLogout === false || opts.noAutoLogout === true
        ? false
        : serviceConfig.autoLogoutOn401 !== false,

    noAutoLogout:
      opts.noAutoLogout === true ||
      opts.autoLogout === false ||
      publicRequest ||
      !authEnabled,

    emitLifecycleEvents:
      opts.emitLifecycleEvents ??
      serviceConfig.emitLifecycleEvents,

    emitFinalEvents:
      opts.emitFinalEvents ??
      serviceConfig.emitFinalEvents,

    service: Http,
    httpService: Http,
    Http,
    http: Http,
    client: Http,

    serviceRequest: request,
    httpRequest: request,
  };

  try {
    return sanitizeRequestConfig(requestConfig, {
      keepRaw: true,
    }) || requestConfig;
  } catch {
    return requestConfig;
  }
}

/* =========================================================
   PENDING / LOADER
========================================================= */

function startRuntime(requestConfig = {}) {
  const req = safeObject(requestConfig);
  const trackPending = shouldTrackPending(req);
  const useLoader = shouldUseLoader(req);

  if (trackPending) {
    try {
      incrementPendingRequests(
        AppCore,
        AppCore?.state,
        {
          source: "http.service:start",
          requestId: req.requestId,
          emitRuntimeEvents: req.emitRuntimeEvents,
        }
      );
    } catch {}
  }

  if (useLoader) {
    try {
      AppCore?.setLoading?.(true);
    } catch {}
  }

  return {
    trackPending,
    useLoader,
  };
}

function stopRuntime(handle = {}, requestConfig = {}) {
  const req = safeObject(requestConfig);

  if (handle.trackPending) {
    try {
      decrementPendingRequests(
        AppCore,
        AppCore?.state,
        {
          source: "http.service:complete",
          requestId: req.requestId,
          emitRuntimeEvents: req.emitRuntimeEvents,
        }
      );
    } catch {}
  }

  if (handle.useLoader) {
    const pending = safeNumber(AppCore?.state?.pendingRequests, 0);

    if (pending <= 0) {
      try {
        AppCore?.setLoading?.(false);
      } catch {}
    }
  }
}

/* =========================================================
   SESSION COMMIT / LOGOUT
========================================================= */

function looksLikeAuthPayload(payload = null) {
  if (!payload || typeof payload !== "object") return false;

  return Boolean(
    payload.token ||
      payload.accessToken ||
      payload.access_token ||
      payload.refreshToken ||
      payload.refresh_token ||
      payload.user ||
      payload.usuario ||
      payload.me ||
      payload.account ||
      payload.profile ||
      payload.auth?.token ||
      payload.auth?.accessToken ||
      payload.auth?.user ||
      payload.data?.token ||
      payload.data?.accessToken ||
      payload.data?.user
  );
}

function shouldCommitAuthPayload(response, requestConfig = {}) {
  const req = safeObject(requestConfig);

  if (req.captureAuth === false || req.applySession === false) return false;
  if (!looksLikeAuthPayload(response)) return false;

  const path = normalizeServicePath(req.path || req.url || "");

  return Boolean(
    req.captureAuth === true ||
      path.includes("/api/auth/login") ||
      path.includes("/api/auth/refresh") ||
      path === AUTH_ME_CANONICAL
  );
}

function commitAuthPayload(response, requestConfig = {}) {
  if (!shouldCommitAuthPayload(response, requestConfig)) {
    return false;
  }

  const req = safeObject(requestConfig);

  try {
    if (isFn(Auth?.applySession)) {
      Auth.applySession(response, {
        source: "http.service",
        reason: req.path?.includes("/login")
          ? "http-login"
          : req.path?.includes("/refresh")
            ? "http-refresh"
            : "http-auth-response",
        emitRepair: true,
      });

      return true;
    }
  } catch {}

  try {
    AppCore?.applySession?.(
      response,
      {
        source: "http.service",
        reason: "http-auth-response",
      }
    );

    return true;
  } catch {}

  return false;
}

async function logoutLocal(reason = "http-401") {
  try {
    await Auth?.logout?.({
      silent: false,
      notifyServer: false,
      localOnly: true,
      reason,
    });

    safeEmit(
      EVENTS.logoutLocal,
      {
        reason,
      },
      {
        emitLifecycleEvents: serviceConfig.emitLifecycleEvents,
      }
    );

    return true;
  } catch {}

  try {
    Auth?.clearSession?.({
      reason,
      emit: true,
    });
  } catch {}

  try {
    AppCore?.clearSession?.({
      reason,
      source: "http.service",
      silent: false,
    });
  } catch {}

  safeEmit(
    EVENTS.logoutLocal,
    {
      reason,
    },
    {
      emitLifecycleEvents: serviceConfig.emitLifecycleEvents,
    }
  );

  return true;
}

/* =========================================================
   REQUEST EXECUTION
========================================================= */

function normalizeServiceError(error, requestConfig = {}) {
  const normalized = normalizeError(error, requestConfig);

  normalized.requestId = normalized.requestId || requestConfig.requestId;
  normalized.method = normalized.method || requestConfig.method;
  normalized.path = normalized.path || safeRedact(requestConfig.path || "");
  normalized.url = normalized.url || safeRedact(requestConfig.url || "");

  return normalized;
}

function getStatus(error = null) {
  return safeNumber(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status,
    0
  );
}

function shouldTryAutoRefresh(error = null, requestConfig = {}) {
  const req = safeObject(requestConfig);
  const status = getStatus(error);

  if (status !== 401) return false;

  if (
    req._retriedAfterRefresh === true ||
    req.noAutoRefresh === true ||
    req.autoRefresh === false ||
    req._skipAuthRefresh === true ||
    req.skipAuthRefresh === true
  ) {
    return false;
  }

  if (
    req.public === true ||
    req.auth === false ||
    req.skipAuth === true ||
    req.noAuthHeader === true
  ) {
    return false;
  }

  if (error?.aborted === true || error?.timeout === true) return false;

  return serviceConfig.autoRefreshOn401 !== false;
}

function shouldAutoLogout(error = null, requestConfig = {}) {
  const req = safeObject(requestConfig);

  if (getStatus(error) !== 401) return false;
  if (serviceConfig.autoLogoutOn401 === false) return false;
  if (req.noAutoLogout === true || req.autoLogout === false) return false;
  if (req.public === true || req.auth === false || req.skipAuth === true) return false;

  return true;
}

async function executeOnce(requestConfig = {}) {
  const baseConfig = {
    ...safeObject(requestConfig),
    service: Http,
    httpService: Http,
    Http,
    http: Http,
    client: Http,
    serviceRequest: request,
    httpRequest: request,
  };

  const interceptedConfig =
    await runRequestInterceptors(
      interceptors,
      baseConfig
    );

  const finalConfig = {
    ...baseConfig,
    ...safeObject(interceptedConfig),
    requestId: baseConfig.requestId,
    service: Http,
    httpService: Http,
    Http,
    http: Http,
    client: Http,
    serviceRequest: request,
    httpRequest: request,
  };

  const response = await executeWithRetry({
    AppCore,
    config: serviceConfig,
    requestConfig: finalConfig,
  });

  const interceptedResponse =
    await runResponseInterceptors(
      interceptors,
      response,
      finalConfig
    );

  commitAuthPayload(interceptedResponse, finalConfig);

  return interceptedResponse;
}

async function executeWithAutoRefresh(requestConfig = {}) {
  try {
    return await executeOnce(requestConfig);
  } catch (error) {
    const normalized = normalizeServiceError(error, requestConfig);

    if (!shouldTryAutoRefresh(normalized, requestConfig)) {
      throw normalized;
    }

    const refreshed = await runAutoRefreshIfNeeded({
      AppCore,
      Auth,
      config: serviceConfig,
      state: serviceState,
      error: normalized,
      requestConfig,
    });

    if (!refreshed) {
      throw normalized;
    }

    serviceState.replay += 1;

    safeEmit(
      EVENTS.replay,
      {
        requestId: requestConfig.requestId,
        path: safeRedact(requestConfig.path || ""),
        method: requestConfig.method,
      },
      requestConfig
    );

    const replayConfig = {
      ...requestConfig,
      _retriedAfterRefresh: true,
      noAutoRefresh: true,
      skipAuthRefresh: true,
      _skipAuthRefresh: true,
      requestId: `${requestConfig.requestId}:replay`,
    };

    return executeOnce(replayConfig);
  }
}

function normalizeRequestArgs(arg1, arg2, arg3) {
  if (isObject(arg1)) {
    return {
      method: normalizeMethod(arg1.method || "GET"),
      path: arg1.path || arg1.url || "/",
      options: arg1,
    };
  }

  if (typeof arg1 === "string" && typeof arg2 === "string") {
    const maybeMethod = normalizeMethod(arg1);

    if (maybeMethod === arg1.toUpperCase()) {
      return {
        method: maybeMethod,
        path: arg2,
        options: safeObject(arg3),
      };
    }
  }

  return {
    method: normalizeMethod(safeObject(arg2).method || "GET"),
    path: arg1 || "/",
    options: safeObject(arg2),
  };
}

export async function request(...args) {
  init();

  const normalized = normalizeRequestArgs(...args);

  const requestConfig = buildRequestConfig(
    normalized.method,
    normalized.path,
    normalized.options
  );

  const runtimeHandle = startRuntime(requestConfig);
  const startedAt = nowMs();

  serviceState.total += 1;
  serviceState.lastRequestAt = isoNow(startedAt);
  serviceState.lastRequest = sanitizeData({
    requestId: requestConfig.requestId,
    method: requestConfig.method,
    path: safeRedact(requestConfig.path),
    public: requestConfig.public,
    auth: requestConfig.auth,
  });

  safeEmit(
    EVENTS.start,
    {
      requestId: requestConfig.requestId,
      method: requestConfig.method,
      path: safeRedact(requestConfig.path),
      public: requestConfig.public,
      auth: requestConfig.auth,
    },
    requestConfig
  );

  try {
    const response = await executeWithAutoRefresh(requestConfig);

    serviceState.success += 1;
    serviceState.lastSuccessAt = isoNow();

    safeEmit(
      EVENTS.success,
      {
        requestId: requestConfig.requestId,
        method: requestConfig.method,
        path: safeRedact(requestConfig.path),
        durationMs: nowMs() - startedAt,
      },
      requestConfig
    );

    return response;
  } catch (error) {
    let finalError = normalizeServiceError(error, requestConfig);

    try {
      finalError =
        await runErrorInterceptors(
          interceptors,
          finalError,
          requestConfig
        ) || finalError;
    } catch (interceptorError) {
      finalError = normalizeServiceError(interceptorError, requestConfig);
    }

    serviceState.error += 1;
    serviceState.lastErrorAt = isoNow();

    if (finalError.aborted === true) serviceState.aborted += 1;
    if (finalError.timeout === true) serviceState.timeout += 1;

    serviceState.lastError = sanitizeData({
      name: finalError.name || "HttpError",
      message: finalError.message || "Error HTTP",
      status: finalError.status || 0,
      code: finalError.code || null,
      requestId: requestConfig.requestId,
      method: requestConfig.method,
      path: safeRedact(requestConfig.path),
      aborted: Boolean(finalError.aborted),
      timeout: Boolean(finalError.timeout),
      at: serviceState.lastErrorAt,
    });

    safeEmit(
      EVENTS.error,
      {
        requestId: requestConfig.requestId,
        method: requestConfig.method,
        path: safeRedact(requestConfig.path),
        durationMs: nowMs() - startedAt,
        error: serviceState.lastError,
      },
      requestConfig
    );

    if (shouldAutoLogout(finalError, requestConfig)) {
      await logoutLocal("http-401");
    }

    throw finalError;
  } finally {
    stopRuntime(runtimeHandle, requestConfig);

    safeEmit(
      EVENTS.complete,
      {
        requestId: requestConfig.requestId,
        method: requestConfig.method,
        path: safeRedact(requestConfig.path),
        durationMs: nowMs() - startedAt,
      },
      requestConfig
    );
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

export function post(path, body = null, options = {}) {
  return request("POST", path, {
    ...safeObject(options),
    body,
  });
}

export function put(path, body = null, options = {}) {
  return request("PUT", path, {
    ...safeObject(options),
    body,
  });
}

export function patch(path, body = null, options = {}) {
  return request("PATCH", path, {
    ...safeObject(options),
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

  return request("DELETE", path, safeObject(bodyOrOptions));
}

export function raw(path, requestOptions = {}) {
  return request("GET", path, {
    ...safeObject(requestOptions),
    raw: true,
    responseType: "raw",
  });
}

export function upload(path, body, requestOptions = {}) {
  return request(requestOptions.method || "POST", path, {
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

export async function login(body = {}, requestOptions = {}) {
  const response = await post(
    "/api/auth/login",
    body,
    {
      public: true,
      auth: false,
      skipAuth: true,
      noAuthHeader: true,
      noAutoRefresh: true,
      noAutoLogout: true,
      captureAuth: true,
      ...safeObject(requestOptions),
    }
  );

  commitAuthPayload(response, {
    path: "/api/auth/login",
    captureAuth: true,
  });

  return response;
}

export function me(requestOptions = {}) {
  return get(
    AUTH_ME_CANONICAL,
    {
      auth: true,
      public: false,
      skipAuth: false,
      noAuthHeader: false,
      captureAuth: true,
      ...safeObject(requestOptions),
    }
  );
}

export async function refresh(body = {}, requestOptions = {}) {
  const response = await post(
    "/api/auth/refresh",
    body,
    {
      public: true,
      auth: false,
      skipAuth: true,
      noAuthHeader: true,
      noAutoRefresh: true,
      noAutoLogout: true,
      captureAuth: true,
      ...safeObject(requestOptions),
    }
  );

  commitAuthPayload(response, {
    path: "/api/auth/refresh",
    captureAuth: true,
  });

  return response;
}

export async function refreshSession(requestOptions = {}) {
  try {
    if (isFn(Auth?.refreshSession)) {
      return await Auth.refreshSession(Auth.session || undefined, {
        reason: "http-service-refresh",
        ...safeObject(requestOptions),
      });
    }
  } catch {}

  return refresh(
    requestOptions.body || {},
    {
      ...safeObject(requestOptions),
      noAutoRefresh: true,
    }
  );
}

export async function logout(body = {}, requestOptions = {}) {
  let response = null;
  let serverFailed = false;

  try {
    response = await post(
      "/api/auth/logout",
      body,
      {
        auth: true,
        public: false,
        noAutoRefresh: true,
        skipAuthRefresh: true,
        _skipAuthRefresh: true,
        noAutoLogout: true,
        ...safeObject(requestOptions),
      }
    );
  } catch (error) {
    serverFailed = true;

    if (requestOptions.throwOnServerError === true) {
      throw error;
    }
  }

  await logoutLocal(
    serverFailed
      ? "http-logout-local-after-server-error"
      : "http-logout"
  );

  return response || {
    ok: !serverFailed,
    success: !serverFailed,
    local: true,
    serverFailed,
  };
}

/* =========================================================
   INTERCEPTORS API
========================================================= */

function useRequestInterceptor(handler, interceptorOptions = {}) {
  return useRequest(interceptors, handler, interceptorOptions);
}

function useResponseInterceptor(handler, interceptorOptions = {}) {
  return useResponse(interceptors, handler, interceptorOptions);
}

function useErrorInterceptor(handler, interceptorOptions = {}) {
  return useError(interceptors, handler, interceptorOptions);
}

function eject(ref, type = "") {
  return ejectInterceptor(interceptors, type, ref);
}

function enable(ref, type = "") {
  return enableInterceptor(interceptors, type, ref);
}

function disable(ref, type = "") {
  return disableInterceptor(interceptors, type, ref);
}

function clearInterceptorGroup(type = "") {
  return clearInterceptors(interceptors, type);
}

/* =========================================================
   INSTALL / BRIDGE
========================================================= */

export function attachToAppCore() {
  try {
    AppCore.Http = Http;
  } catch {}

  try {
    AppCore.http = Http;
  } catch {}

  try {
    AppCore.apiClient = Http;
  } catch {}

  try {
    if (!AppCore.services || typeof AppCore.services !== "object") {
      AppCore.services = {};
    }

    AppCore.services.Http = Http;
    AppCore.services.http = Http;
    AppCore.services.api = Http;
    AppCore.services.apiClient = Http;
  } catch {}

  try {
    AppCore.modules?.register?.(
      "Http",
      Http,
      {
        overwrite: true,
        replace: true,
        aliases: ["http", "ApiClient", "apiClient", "api"],
        source: SERVICE_SOURCE,
        emit: false,
        silent: true,
      }
    );
  } catch {}

  try {
    AppCore.modules?.set?.("Http", Http);
    AppCore.modules?.set?.("http", Http);
    AppCore.modules?.set?.("ApiClient", Http);
    AppCore.modules?.set?.("apiClient", Http);
    AppCore.modules?.set?.("api", Http);
  } catch {}

  try {
    if (isBrowser()) {
      window.__ONION_HTTP__ = Http;
      window.__ONION_API_CLIENT__ = Http;
      window.__ONION_API_ORIGIN__ = serviceConfig.apiBase;
    }
  } catch {}

  serviceState.installed = true;
  serviceState.installedAt = serviceState.installedAt || isoNow();

  return true;
}

export function init(patch = {}) {
  configure(patch);

  if (serviceState.initialized) {
    attachToAppCore();
    return Http;
  }

  attachToAppCore();

  serviceState.initialized = true;

  safeEmit(
    EVENTS.ready,
    {
      apiBase: serviceConfig.apiBase,
      initialized: true,
    },
    {
      emitLifecycleEvents:
        serviceConfig.emitReadyEvent === true ||
        serviceConfig.emitLifecycleEvents === true,
    }
  );

  return Http;
}

export function install(AppCoreRef = AppCore, installOptions = {}) {
  if (AppCoreRef && AppCoreRef !== AppCore) {
    try {
      AppCoreRef.Http = Http;
      AppCoreRef.http = Http;
      AppCoreRef.apiClient = Http;

      AppCoreRef.services = AppCoreRef.services || {};
      AppCoreRef.services.Http = Http;
      AppCoreRef.services.http = Http;
      AppCoreRef.services.api = Http;
      AppCoreRef.services.apiClient = Http;
    } catch {}
  }

  return init(installOptions);
}

export function resetRuntime(resetOptions = {}) {
  resetPendingRequests(
    AppCore,
    AppCore?.state,
    {
      source: "http.service:reset",
      ...safeObject(resetOptions),
    }
  );

  resetHttpRuntime(
    AppCore,
    AppCore?.state,
    {
      source: "http.service:reset-runtime",
      ...safeObject(resetOptions),
    }
  );

  resetHttpAuthRuntime(serviceState);
  resetInterceptorsRuntime(interceptors);

  serviceState.total = 0;
  serviceState.success = 0;
  serviceState.error = 0;
  serviceState.replay = 0;
  serviceState.aborted = 0;
  serviceState.timeout = 0;
  serviceState.lastRequest = null;
  serviceState.lastError = null;

  return true;
}

/* =========================================================
   ABORT
========================================================= */

export function createAbortController(meta = {}) {
  try {
    return createRuntimeAbortController({
      source: "http.service",
      ...safeObject(meta),
    });
  } catch {}

  try {
    return new AbortController();
  } catch {
    return null;
  }
}

export function abort(controller, reason = "http-abort") {
  try {
    if (isFn(abortRuntimeController)) {
      return abortRuntimeController(
        controller,
        reason,
        {
          source: "http.service",
        }
      );
    }
  } catch {}

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

  return sanitizeData({
    version: HTTP_SERVICE_VERSION,
    service: SERVICE_NAME,

    initialized: Boolean(serviceState.initialized),
    installed: Boolean(serviceState.installed),
    installedAt: serviceState.installedAt,

    apiBase: serviceConfig.apiBase,

    pendingRequests: safeNumber(AppCore?.state?.pendingRequests, 0),

    stats: {
      total: serviceState.total,
      success: serviceState.success,
      error: serviceState.error,
      replay: serviceState.replay,
      aborted: serviceState.aborted,
      timeout: serviceState.timeout,
      lastRequestAt: serviceState.lastRequestAt,
      lastSuccessAt: serviceState.lastSuccessAt,
      lastErrorAt: serviceState.lastErrorAt,
      lastRequest: serviceState.lastRequest,
      lastError: serviceState.lastError,
    },

    auth: {
      hasAccessToken: Boolean(getAccessToken()),
      hasRefreshToken: Boolean(getRefreshToken()),
      authMePrivate: true,
    },

    config: getConfig(),

    modules: deep
      ? {
          helpers: getHttpHelpersSnapshot(),
          requestEngine: getHttpRequestEngineSnapshot(),
          auth: getHttpAuthSnapshot(serviceState),
          runtime: getHttpRuntimeSnapshot(AppCore?.state),
          interceptors: getInterceptorsSnapshot(interceptors),
        }
      : null,

    versions: {
      helpers: HTTP_HELPERS_VERSION,
    },

    at: isoNow(),
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

  useRequest: useRequestInterceptor,
  useResponse: useResponseInterceptor,
  useError: useErrorInterceptor,

  ejectInterceptor: eject,
  enableInterceptor: enable,
  disableInterceptor: disable,
  clearInterceptors: clearInterceptorGroup,

  resetRuntime,
};

attachToAppCore();

export { Http };

export default Http;
