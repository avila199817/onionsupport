/* =========================================================
   Onion SPA - Server API
   Archivo: src/views/server/server.api.js

   FINAL PRO SYSTEM · API LAYER · SERVER SNAPSHOT FIRST · 12/10

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo server
   - cargar snapshot agregado de servidor
   - resolver dashboard + health interno real
   - evitar llamadas directas al root legacy /api/dashboard salvo fallback final
   - medir latencia real dashboard + health
   - hidratar store/state del módulo server
   - normalizar payloads backend heterogéneos
   - soportar adapters múltiples de request
   - anti-race soft para server load
   - soportar refresh forzado
   - exponer health local opcional del módulo

   HARDENING PRO:
   - endpoint dashboard configurable
   - fallback canónico antes que legacy
   - legacy /api/dashboard solo como última opción
   - Promise.allSettled semántico para evitar romper todo si falla health
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - persistencia coherente en state/store
   - tolerancia a payloads heterogéneos
   - no loading infinito
   - no pisa snapshot útil con payload vacío accidental
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  serverState,
  setLoading,
  setRefreshing,
  setError,
  setLoaded,
  setHydrated,
  setDashboardPayload,
  setHealthPayload,
  setDashboardLatencyMs,
  setHealthLatencyMs,
  setBrowserMetrics,
  setEnvironmentMetrics,
  setTelemetry,
  setHistory,
  setAutoRefresh,
  setLastSyncAt,
  setRequestId,
} from "./server.state.js";

import {
  replaceServerStore,
} from "./server.store.js";

import {
  createServerHistoryState,
  buildServerSnapshot,
  extractServerTelemetry,
} from "./server.actions.js";

/* =========================================================
   CONFIG
========================================================= */

const SERVER_TIMEOUT = 20000;

const SERVER_HEALTH_ENDPOINT = "/health/internal";

/*
  IMPORTANTE:
  - /api/dashboard es el endpoint legacy que te está generando:
    ⚠️ DASHBOARD ROOT LEGACY HIT
  - Este módulo intenta primero endpoints canónicos/configurables.
  - Si tu backend tiene otro endpoint real, configúralo en AppCore.config:
      AppCore.config.endpoints.serverDashboard = "/api/dashboard/snapshot"
    o:
      AppCore.config.serverDashboardEndpoint = "/api/dashboard/snapshot"
*/
const SERVER_DASHBOARD_CANONICAL_ENDPOINTS = Object.freeze([
  "/api/dashboard/snapshot",
  "/api/dashboard/server",
  "/api/dashboard/overview",
  "/api/dashboard/stats",
]);

const SERVER_DASHBOARD_LEGACY_ENDPOINT = "/api/dashboard";

let lastLoadToken = 0;

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function nowMs() {
  try {
    if (
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
    ) {
      return performance.now();
    }
  } catch {}

  return Date.now();
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isMeaningfulValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;

  return true;
}

function first(...values) {
  for (const value of values) {
    if (!isMeaningfulValue(value)) continue;
    return value;
  }

  return null;
}

function unique(values = []) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const text = safeText(value, "");

    if (!text || seen.has(text)) continue;

    seen.add(text);
    out.push(text);
  }

  return out;
}

function normalizeLatency(startedAt = 0, finishedAt = 0) {
  const latency = Number(finishedAt) - Number(startedAt);

  if (!Number.isFinite(latency) || latency < 0) {
    return null;
  }

  return Math.round((latency + Number.EPSILON) * 100) / 100;
}

/* =========================================================
   TOKEN / RACE
========================================================= */

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token) {
  return token === lastLoadToken;
}

/* =========================================================
   URL / AUTH HELPERS
========================================================= */

function getApiBase() {
  const apiBase = safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.apiBaseUrl,
      AppCore?.config?.baseApiUrl,
      AppCore?.config?.baseUrl,
      AppCore?.state?.apiBase,
      AppCore?.state?.apiBaseUrl,
      isBrowser() ? window.ONION_API_BASE_URL : "",
      isBrowser() ? window.ONION_API_BASE : "",
      isBrowser() ? window.API_BASE_URL : ""
    ),
    ""
  );

  return apiBase.replace(/\/+$/, "");
}

function buildAbsoluteUrl(path = "") {
  const cleanPath = safeText(path, "");

  if (!cleanPath) {
    return getApiBase();
  }

  if (/^https?:\/\//i.test(cleanPath)) {
    return cleanPath;
  }

  const base = getApiBase();

  if (!base) {
    return cleanPath;
  }

  return `${base}${cleanPath.startsWith("/") ? "" : "/"}${cleanPath}`;
}

function storageGet(key = "") {
  if (!isBrowser()) {
    return "";
  }

  try {
    return localStorage.getItem(key) || "";
  } catch {}

  try {
    return sessionStorage.getItem(key) || "";
  } catch {}

  return "";
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.state?.session?.token,
      AppCore?.state?.session?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      AppCore?.modules?.Auth?.getToken?.(),
      storageGet("onion_token"),
      storageGet("onion_access_token"),
      storageGet("accessToken"),
      storageGet("access_token"),
      storageGet("token")
    ),
    ""
  );
}

function getRequestHeaders(extraHeaders = {}) {
  const token = getAuthToken();

  return {
    Accept: "application/json",

    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),

    ...safeObject(extraHeaders),
  };
}

function getApiClient() {
  return (
    AppCore?.apiClient ||
    AppCore?.api ||
    AppCore?.modules?.ApiClient ||
    null
  );
}

function getHttpModule() {
  return (
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    window?.Http ||
    null
  );
}

/* =========================================================
   ENDPOINT RESOLUTION
========================================================= */

function getConfiguredDashboardEndpoints() {
  const endpoints = AppCore?.config?.endpoints || {};

  return unique([
    endpoints.serverDashboard,
    endpoints.serverSnapshot,
    endpoints.dashboardSnapshot,
    endpoints.dashboardServer,
    endpoints.dashboardOverview,
    AppCore?.config?.serverDashboardEndpoint,
    AppCore?.config?.serverSnapshotEndpoint,
    AppCore?.config?.dashboardSnapshotEndpoint,
    isBrowser() ? window.ONION_SERVER_DASHBOARD_ENDPOINT : "",
    isBrowser() ? window.ONION_DASHBOARD_SNAPSHOT_ENDPOINT : "",
  ]);
}

function getDashboardEndpointCandidates() {
  return unique([
    ...getConfiguredDashboardEndpoints(),
    ...SERVER_DASHBOARD_CANONICAL_ENDPOINTS,
    SERVER_DASHBOARD_LEGACY_ENDPOINT,
  ]);
}

function isLegacyDashboardEndpoint(endpoint = "") {
  return safeText(endpoint, "") === SERVER_DASHBOARD_LEGACY_ENDPOINT;
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function normalizeErrorMessage(
  error = null,
  fallback = "Error cargando panel de servidor."
) {
  const message = safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.response?.error,
      error?.data?.message,
      error?.data?.error,
      error?.error,
      error?.raw,
      fallback
    ),
    fallback
  );

  const status = Number(
    first(
      error?.status,
      error?.statusCode,
      error?.response?.status,
      error?.response?.statusCode,
      error?.response?.data?.status,
      error?.data?.status
    )
  );

  const errorCode = safeText(
    first(
      error?.code,
      error?.response?.error,
      error?.response?.data?.error,
      error?.data?.error,
      error?.error
    ),
    ""
  );

  if (status === 401 || errorCode === "UNAUTHORIZED") {
    return "No autorizado. Inicia sesión de nuevo.";
  }

  if (status === 403 || errorCode === "FORBIDDEN") {
    return "No tienes permisos para acceder al panel de servidor.";
  }

  if (status === 404) {
    return "El endpoint de servidor no está disponible.";
  }

  if (errorCode === "HEALTH_ERROR") {
    return "El health interno devolvió un error.";
  }

  if (error?.name === "AbortError") {
    return "La petición al panel de servidor ha superado el tiempo máximo.";
  }

  return message;
}

function createEndpointError({
  endpoint = "",
  error = null,
  domain = "server",
} = {}) {
  const normalized = new Error(
    normalizeErrorMessage(
      error,
      `No se pudo cargar ${domain}.`
    )
  );

  normalized.endpoint = endpoint;
  normalized.domain = domain;
  normalized.originalError = error;
  normalized.status = error?.status || error?.statusCode || error?.response?.status || null;
  normalized.code = error?.code || error?.error || error?.response?.error || null;

  return normalized;
}

function createSyntheticErrorPayload({
  domain = "server",
  endpoint = "",
  error = null,
} = {}) {
  return {
    ok: false,
    status: "error",
    error: error?.code || error?.error || `${String(domain).toUpperCase()}_LOAD_FAILED`,
    message: normalizeErrorMessage(error, `No se pudo cargar ${domain}.`),
    endpoint,
    timestamp: new Date().toISOString(),
  };
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function looksLikeDashboard(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.meta ||
      obj.resumen ||
      obj.summary ||
      obj.stats ||
      obj.metrics ||
      obj.charts ||
      obj.widgets ||
      obj.items ||
      obj.tickets ||
      obj.facturas ||
      obj.usuarios ||
      obj.clientes ||
      obj.totalFacturas !== undefined ||
      obj.ticketsActivos !== undefined ||
      obj.totalClientes !== undefined ||
      obj.totalUsuarios !== undefined
  );
}

function looksLikeHealth(value = null) {
  const obj = safeObject(value);

  return Boolean(
    typeof obj.ok === "boolean" ||
      obj.status ||
      obj.timestamp ||
      obj.api ||
      obj.db ||
      obj.database ||
      obj.cosmos ||
      obj.system ||
      obj.server ||
      obj.runtime ||
      obj.environment ||
      obj.health
  );
}

function unwrapResponseEnvelope(payload = null) {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (!Object.keys(obj).length) {
    return payload;
  }

  if (obj.dashboard) return unwrapResponseEnvelope(obj.dashboard);
  if (obj.health) return unwrapResponseEnvelope(obj.health);
  if (obj.snapshot) return unwrapResponseEnvelope(obj.snapshot);
  if (obj.payload) return unwrapResponseEnvelope(obj.payload);
  if (obj.result) return unwrapResponseEnvelope(obj.result);
  if (obj.response) return unwrapResponseEnvelope(obj.response);
  if (obj.data) return unwrapResponseEnvelope(obj.data);

  return obj;
}

function pickDashboard(payload = null) {
  if (!payload) {
    return null;
  }

  if (looksLikeDashboard(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.dashboard,
    obj.snapshot?.dashboard,
    obj.server?.dashboard,
    obj.data,
    obj.result,
    obj.payload,
    obj.response,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (looksLikeDashboard(candidate)) {
      return candidate;
    }

    const nested = pickDashboard(candidate);

    if (nested) {
      return nested;
    }
  }

  return Object.keys(obj).length ? obj : null;
}

function pickHealth(payload = null) {
  if (!payload) {
    return null;
  }

  if (looksLikeHealth(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.health,
    obj.snapshot?.health,
    obj.server?.health,
    obj.data,
    obj.result,
    obj.payload,
    obj.response,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (looksLikeHealth(candidate)) {
      return candidate;
    }

    const nested = pickHealth(candidate);

    if (nested) {
      return nested;
    }
  }

  return Object.keys(obj).length ? obj : null;
}

function getRequestIdFromPayload(payload = null) {
  const obj = safeObject(payload);

  return safeText(
    first(
      obj.requestId,
      obj.correlationId,
      obj.traceId,
      obj.data?.requestId,
      obj.data?.correlationId,
      obj.payload?.requestId,
      obj.payload?.correlationId,
      obj.response?.requestId,
      obj.meta?.requestId,
      obj.meta?.correlationId
    ),
    ""
  );
}

function normalizeDashboardPayload(payload = null) {
  const value = pickDashboard(unwrapResponseEnvelope(payload));
  return safeObject(value);
}

function normalizeHealthPayload(payload = null) {
  const value = pickHealth(unwrapResponseEnvelope(payload));
  return safeObject(value);
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("SERVER_API_CLIENT_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, SERVER_TIMEOUT);

  if (verb === "get" && typeof client.get === "function") {
    return client.get(path, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
    });
  }

  if (verb === "post" && typeof client.post === "function") {
    return client.post(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
    });
  }

  if (typeof client.request === "function") {
    return client.request(path, {
      method: method.toUpperCase(),
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
      body: options.body,
    });
  }

  throw new Error("SERVER_API_CLIENT_METHOD_UNAVAILABLE");
}

async function requestViaAppCoreRequest(method = "GET", path = "", options = {}) {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(path, {
    method: method.toUpperCase(),
    headers: options.headers,
    params: options.params,
    timeout: options.timeout,
    body:
      options.body && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
  });
}

async function requestViaHttpModule(method = "GET", path = "", options = {}) {
  const Http = getHttpModule();

  if (!Http) {
    throw new Error("HTTP_MODULE_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();

  if (verb === "get" && typeof Http.get === "function") {
    return Http.get(path, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "post" && typeof Http.post === "function") {
    return Http.post(path, options.body, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (typeof Http.request === "function") {
    return Http.request(path, {
      method: method.toUpperCase(),
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
      body: options.body,
    });
  }

  throw new Error("HTTP_MODULE_METHOD_UNAVAILABLE");
}

async function requestViaFetch(method = "GET", path = "", options = {}) {
  const url = buildAbsoluteUrl(path);
  const controller = new AbortController();
  const timeout = safeNumber(options.timeout, SERVER_TIMEOUT);

  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeout);

  try {
    const hasBody = options.body !== undefined && options.body !== null;

    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers: options.headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(
        normalizeErrorMessage(
          {
            ...safeObject(data),
            status: response.status,
          },
          `HTTP ${response.status} en ${method.toUpperCase()} ${path}`
        )
      );

      error.response = data;
      error.status = response.status;
      error.statusCode = response.status;
      error.endpoint = path;

      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(method = "GET", path = "", options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;

  const requestOptions = {
    timeout: safeNumber(options.timeout, SERVER_TIMEOUT),
    params: options.params,
    body: options.body,
    headers: getRequestHeaders({
      ...(hasBody
        ? {
            "Content-Type": "application/json",
          }
        : {}),
      ...safeObject(options.headers),
    }),
  };

  const adapters = [
    requestViaApiClient,
    requestViaAppCoreRequest,
    requestViaHttpModule,
    requestViaFetch,
  ];

  let lastError = null;

  for (const adapter of adapters) {
    try {
      return await adapter(method, path, requestOptions);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("SERVER_REQUEST_FAILED");
}

/* =========================================================
   ENDPOINT FALLBACK REQUESTS
========================================================= */

async function requestFirstAvailableEndpoint({
  method = "GET",
  endpoints = [],
  options = {},
  domain = "server",
} = {}) {
  const candidates = unique(endpoints);

  if (!candidates.length) {
    throw new Error("SERVER_ENDPOINT_CANDIDATES_EMPTY");
  }

  let lastError = null;

  for (const endpoint of candidates) {
    try {
      const response = await request(method, endpoint, options);

      return {
        endpoint,
        response,
        legacy: isLegacyDashboardEndpoint(endpoint),
      };
    } catch (error) {
      lastError = createEndpointError({
        endpoint,
        error,
        domain,
      });
    }
  }

  throw lastError || new Error("SERVER_ENDPOINTS_FAILED");
}

async function timedRequest(label = "request", fn) {
  const startedAt = nowMs();

  try {
    const result = await fn();
    const finishedAt = nowMs();

    return {
      ok: true,
      label,
      startedAt,
      finishedAt,
      latencyMs: normalizeLatency(startedAt, finishedAt),
      ...safeObject(result),
    };
  } catch (error) {
    const finishedAt = nowMs();

    return {
      ok: false,
      label,
      startedAt,
      finishedAt,
      latencyMs: normalizeLatency(startedAt, finishedAt),
      error,
    };
  }
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchServerDashboardRequest() {
  const result = await requestFirstAvailableEndpoint({
    method: "GET",
    endpoints: getDashboardEndpointCandidates(),
    options: {
      timeout: SERVER_TIMEOUT,
    },
    domain: "dashboard",
  });

  return result.response;
}

export async function fetchServerDashboardWithMetaRequest() {
  return requestFirstAvailableEndpoint({
    method: "GET",
    endpoints: getDashboardEndpointCandidates(),
    options: {
      timeout: SERVER_TIMEOUT,
    },
    domain: "dashboard",
  });
}

export async function fetchServerHealthRequest() {
  return request("GET", SERVER_HEALTH_ENDPOINT, {
    timeout: SERVER_TIMEOUT,
  });
}

export async function getServerDashboardRequest() {
  const response = await fetchServerDashboardRequest();
  return normalizeDashboardPayload(response);
}

export async function getServerHealthRequest() {
  const response = await fetchServerHealthRequest();
  return normalizeHealthPayload(response);
}

export async function getServerSnapshotRequest({
  history = null,
} = {}) {
  const dashboardTask = timedRequest("dashboard", () => {
    return fetchServerDashboardWithMetaRequest();
  });

  const healthTask = timedRequest("health", async () => {
    const response = await fetchServerHealthRequest();

    return {
      endpoint: SERVER_HEALTH_ENDPOINT,
      response,
      legacy: false,
    };
  });

  const [dashboardResult, healthResult] = await Promise.all([
    dashboardTask,
    healthTask,
  ]);

  if (!dashboardResult.ok && !healthResult.ok) {
    throw dashboardResult.error || healthResult.error || new Error("SERVER_SNAPSHOT_FAILED");
  }

  const dashboardPayload = dashboardResult.ok
    ? normalizeDashboardPayload(dashboardResult.response)
    : createSyntheticErrorPayload({
        domain: "dashboard",
        endpoint: dashboardResult.endpoint || "",
        error: dashboardResult.error,
      });

  const healthPayload = healthResult.ok
    ? normalizeHealthPayload(healthResult.response)
    : createSyntheticErrorPayload({
        domain: "health",
        endpoint: SERVER_HEALTH_ENDPOINT,
        error: healthResult.error,
      });

  return buildServerSnapshot({
    dashboardPayload,
    healthPayload,
    dashboardLatencyMs: dashboardResult.latencyMs,
    healthLatencyMs: healthResult.latencyMs,
    history: history || createServerHistoryState(),
  });
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateServerFromCache() {
  try {
    const dashboardPayload = safeObject(serverState?.dashboardPayload);
    const healthPayload = safeObject(serverState?.healthPayload);
    const browserMetrics = safeObject(serverState?.browserMetrics);
    const environmentMetrics = safeObject(serverState?.environmentMetrics);
    const telemetry = safeObject(serverState?.telemetry);

    const history = Object.keys(safeObject(serverState?.history)).length
      ? safeObject(serverState.history)
      : createServerHistoryState();

    if (
      Object.keys(dashboardPayload).length ||
      Object.keys(healthPayload).length ||
      Object.keys(telemetry).length
    ) {
      replaceServerStore({
        dashboardPayload,
        healthPayload,
        dashboardLatencyMs: serverState?.dashboardLatencyMs ?? null,
        healthLatencyMs: serverState?.healthLatencyMs ?? null,
        browserMetrics,
        environmentMetrics,
        telemetry,
        history,
        requestId: safeText(serverState?.requestId, ""),
        lastSyncAt: first(serverState?.lastSyncAt, null),
        autoRefresh:
          typeof serverState?.autoRefresh === "boolean"
            ? serverState.autoRefresh
            : true,
      });

      setHydrated?.(true);
    }

    return {
      dashboardPayload,
      healthPayload,
      dashboardLatencyMs: serverState?.dashboardLatencyMs ?? null,
      healthLatencyMs: serverState?.healthLatencyMs ?? null,
      browserMetrics,
      environmentMetrics,
      telemetry,
      history,
    };
  } catch {
    return {
      dashboardPayload: {},
      healthPayload: {},
      dashboardLatencyMs: null,
      healthLatencyMs: null,
      browserMetrics: {},
      environmentMetrics: {},
      telemetry: {},
      history: createServerHistoryState(),
    };
  }
}

/* =========================================================
   STATE / STORE SYNC
========================================================= */

function syncServerSnapshotToState({
  snapshot = {},
  requestId = "",
  lastSyncAt = Date.now(),
} = {}) {
  const normalizedSnapshot = safeObject(snapshot);

  replaceServerStore({
    dashboardPayload: safeObject(normalizedSnapshot.dashboardPayload),
    healthPayload: safeObject(normalizedSnapshot.healthPayload),
    dashboardLatencyMs: normalizedSnapshot.dashboardLatencyMs ?? null,
    healthLatencyMs: normalizedSnapshot.healthLatencyMs ?? null,
    browserMetrics: safeObject(normalizedSnapshot.browserMetrics),
    environmentMetrics: safeObject(normalizedSnapshot.environmentMetrics),
    telemetry: safeObject(normalizedSnapshot.telemetry),
    history: Object.keys(safeObject(normalizedSnapshot.history)).length
      ? safeObject(normalizedSnapshot.history)
      : createServerHistoryState(),
    requestId: safeText(requestId, ""),
    lastSyncAt,
    autoRefresh:
      typeof serverState?.autoRefresh === "boolean"
        ? serverState.autoRefresh
        : true,
  });

  setDashboardPayload?.(safeObject(normalizedSnapshot.dashboardPayload));
  setHealthPayload?.(safeObject(normalizedSnapshot.healthPayload));
  setDashboardLatencyMs?.(normalizedSnapshot.dashboardLatencyMs ?? null);
  setHealthLatencyMs?.(normalizedSnapshot.healthLatencyMs ?? null);
  setBrowserMetrics?.(safeObject(normalizedSnapshot.browserMetrics));
  setEnvironmentMetrics?.(safeObject(normalizedSnapshot.environmentMetrics));
  setTelemetry?.(safeObject(normalizedSnapshot.telemetry));
  setHistory?.(
    Object.keys(safeObject(normalizedSnapshot.history)).length
      ? safeObject(normalizedSnapshot.history)
      : createServerHistoryState()
  );
  setRequestId?.(safeText(requestId, ""));
  setLastSyncAt?.(lastSyncAt);
  setLoaded?.(true);
  setHydrated?.(true);
  setError?.(null);

  return normalizedSnapshot;
}

/* =========================================================
   LOAD SERVER SNAPSHOT
========================================================= */

export async function loadServerSnapshot({
  force = false,
} = {}) {
  const loadToken = nextLoadToken();

  const hasHydratedData = Boolean(serverState?.hydrated);
  const shouldShowLoading = !hasHydratedData && !force;

  try {
    setError?.(null);

    if (shouldShowLoading) {
      setLoading?.(true);
    } else {
      setRefreshing?.(true);
    }

    const dashboardTask = timedRequest("dashboard", () => {
      return fetchServerDashboardWithMetaRequest();
    });

    const healthTask = timedRequest("health", async () => {
      const response = await fetchServerHealthRequest();

      return {
        endpoint: SERVER_HEALTH_ENDPOINT,
        response,
        legacy: false,
      };
    });

    const [dashboardResult, healthResult] = await Promise.all([
      dashboardTask,
      healthTask,
    ]);

    if (!dashboardResult.ok && !healthResult.ok) {
      throw dashboardResult.error || healthResult.error || new Error("SERVER_SNAPSHOT_FAILED");
    }

    const rawDashboardResponse = dashboardResult.ok
      ? dashboardResult.response
      : createSyntheticErrorPayload({
          domain: "dashboard",
          endpoint: dashboardResult.endpoint || "",
          error: dashboardResult.error,
        });

    const rawHealthResponse = healthResult.ok
      ? healthResult.response
      : createSyntheticErrorPayload({
          domain: "health",
          endpoint: SERVER_HEALTH_ENDPOINT,
          error: healthResult.error,
        });

    const dashboardPayload = normalizeDashboardPayload(rawDashboardResponse);
    const healthPayload = normalizeHealthPayload(rawHealthResponse);

    const history = Object.keys(safeObject(serverState?.history)).length
      ? safeObject(serverState.history)
      : createServerHistoryState();

    const snapshot = buildServerSnapshot({
      dashboardPayload,
      healthPayload,
      dashboardLatencyMs: dashboardResult.latencyMs,
      healthLatencyMs: healthResult.latencyMs,
      history,
    });

    const requestId = safeText(
      first(
        getRequestIdFromPayload(rawDashboardResponse),
        getRequestIdFromPayload(rawHealthResponse)
      ),
      ""
    );

    if (!isActiveLoadToken(loadToken)) {
      return safeObject(serverState);
    }

    const synced = syncServerSnapshotToState({
      snapshot,
      requestId,
      lastSyncAt: Date.now(),
    });

    /*
      Si dashboard o health fallan de forma parcial, mantenemos snapshot,
      pero dejamos una señal de error suave para diagnóstico.
    */
    if (!dashboardResult.ok || !healthResult.ok) {
      const partialError = normalizeErrorMessage(
        dashboardResult.error || healthResult.error,
        "Snapshot parcial: una fuente técnica no respondió."
      );

      setError?.(partialError);
    }

    return synced;
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudo cargar el panel de servidor."
    );

    if (!isActiveLoadToken(loadToken)) {
      return safeObject(serverState);
    }

    try {
      console.error("❌ SERVER SNAPSHOT LOAD:", error);
    } catch {}

    setError?.(message);
    setLoaded?.(true);

    throw error;
  } finally {
    if (isActiveLoadToken(loadToken)) {
      setLoading?.(false);
      setRefreshing?.(false);
    }
  }
}

/* =========================================================
   LOAD HEALTH ONLY
========================================================= */

export async function loadServerHealth({
  silent = true,
} = {}) {
  const startedAt = nowMs();

  try {
    const rawHealth = await fetchServerHealthRequest();
    const finishedAt = nowMs();

    const health = normalizeHealthPayload(rawHealth);
    const healthLatencyMs = normalizeLatency(startedAt, finishedAt);

    const currentDashboardPayload = safeObject(serverState?.dashboardPayload);
    const currentDashboardLatencyMs = serverState?.dashboardLatencyMs ?? null;

    const telemetry = extractServerTelemetry({
      dashboardPayload: currentDashboardPayload,
      healthPayload: health,
      dashboardLatencyMs: currentDashboardLatencyMs,
      healthLatencyMs,
    });

    setHealthPayload?.(health);
    setHealthLatencyMs?.(healthLatencyMs);
    setTelemetry?.(telemetry);
    setLastSyncAt?.(Date.now());

    replaceServerStore({
      dashboardPayload: currentDashboardPayload,
      healthPayload: health,
      dashboardLatencyMs: currentDashboardLatencyMs,
      healthLatencyMs,
      browserMetrics: safeObject(serverState?.browserMetrics),
      environmentMetrics: safeObject(serverState?.environmentMetrics),
      telemetry,
      history: Object.keys(safeObject(serverState?.history)).length
        ? safeObject(serverState.history)
        : createServerHistoryState(),
      requestId: safeText(serverState?.requestId, ""),
      lastSyncAt: Date.now(),
      autoRefresh:
        typeof serverState?.autoRefresh === "boolean"
          ? serverState.autoRefresh
          : true,
    });

    return health;
  } catch (error) {
    try {
      console.error("❌ SERVER HEALTH LOAD:", error);
    } catch {}

    if (!silent) {
      throw error;
    }

    return null;
  }
}

/* =========================================================
   REFRESH
========================================================= */

export async function refreshServerSnapshot(options = {}) {
  return loadServerSnapshot({
    ...safeObject(options),
    force: true,
  });
}

/* =========================================================
   AUTO REFRESH FLAG
========================================================= */

export function setServerAutoRefresh(enabled = true) {
  const value = Boolean(enabled);

  setAutoRefresh?.(value);

  return value;
}

/* =========================================================
   DIAGNOSTICS
========================================================= */

export function getServerApiDiagnostics() {
  return {
    dashboardEndpointCandidates: getDashboardEndpointCandidates(),
    healthEndpoint: SERVER_HEALTH_ENDPOINT,
    apiBase: getApiBase(),
    legacyDashboardEndpoint: SERVER_DASHBOARD_LEGACY_ENDPOINT,
    usesLegacyFallback: getDashboardEndpointCandidates().includes(
      SERVER_DASHBOARD_LEGACY_ENDPOINT
    ),
    timeout: SERVER_TIMEOUT,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  fetchServerDashboardRequest,
  fetchServerDashboardWithMetaRequest,
  fetchServerHealthRequest,

  getServerDashboardRequest,
  getServerHealthRequest,
  getServerSnapshotRequest,

  hydrateServerFromCache,
  loadServerSnapshot,
  loadServerHealth,
  refreshServerSnapshot,
  setServerAutoRefresh,

  getServerApiDiagnostics,
};
