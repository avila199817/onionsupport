/* =========================================================
   Onion SPA - Server API
   Archivo: src/views/server/server.api.js

   FINAL PRO SYSTEM · API LAYER · SERVER SNAPSHOT FIRST

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo server
   - cargar snapshot agregado de server
   - resolver dashboard + health interno real
   - medir latencia real dashboard + health
   - hidratar store/state del módulo server
   - normalizar payloads backend heterogéneos
   - soportar adapters múltiples de request
   - anti-race soft para server load
   - soportar refresh forzado
   - exponer health local opcional del módulo

   HARDENING PRO:
   - soporta envelopes heterogéneos
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - persistencia coherente en state/store
   - contrato alineado con /api/dashboard + /health/internal
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

const SERVER_DASHBOARD_ENDPOINT = "/api/dashboard";
const SERVER_HEALTH_ENDPOINT = "/health/internal";
const SERVER_TIMEOUT = 20000;

let lastLoadToken = 0;

/* =========================================================
   SAFE
========================================================= */

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

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

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
  const apiBase = safeText(AppCore?.config?.apiBase, "");
  return apiBase.replace(/\/+$/, "");
}

function buildAbsoluteUrl(path = "") {
  const cleanPath = String(path || "").trim();

  if (!cleanPath) return getApiBase();
  if (/^https?:\/\//i.test(cleanPath)) return cleanPath;

  return `${getApiBase()}${cleanPath}`;
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      localStorage.getItem("token"),
      sessionStorage.getItem("token")
    ),
    ""
  );
}

function getRequestHeaders(extraHeaders = {}) {
  const token = getAuthToken();

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

function getApiClient() {
  return AppCore?.apiClient || null;
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
      fallback
    ),
    fallback
  );

  const status = Number(
    first(
      error?.status,
      error?.response?.status,
      error?.response?.data?.status
    )
  );

  const errorCode = safeText(
    first(
      error?.code,
      error?.response?.error,
      error?.response?.data?.error,
      error?.data?.error
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

  return message;
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function looksLikeDashboard(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.meta ||
      obj.resumen ||
      obj.charts ||
      obj.summary ||
      obj.stats ||
      obj.metrics ||
      obj.widgets ||
      obj.items
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
      obj.system ||
      obj.runtime ||
      obj.environment
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
  if (obj.payload) return unwrapResponseEnvelope(obj.payload);
  if (obj.result) return unwrapResponseEnvelope(obj.result);
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

  if (looksLikeDashboard(obj.dashboard)) return obj.dashboard;
  if (looksLikeDashboard(obj.data)) return obj.data;
  if (looksLikeDashboard(obj.result)) return obj.result;
  if (looksLikeDashboard(obj.payload)) return obj.payload;

  if (obj.data && typeof obj.data === "object") {
    return pickDashboard(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return pickDashboard(obj.payload);
  }

  if (obj.result && typeof obj.result === "object") {
    return pickDashboard(obj.result);
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

  if (looksLikeHealth(obj.health)) return obj.health;
  if (looksLikeHealth(obj.data)) return obj.data;
  if (looksLikeHealth(obj.result)) return obj.result;
  if (looksLikeHealth(obj.payload)) return obj.payload;

  if (obj.data && typeof obj.data === "object") {
    return pickHealth(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return pickHealth(obj.payload);
  }

  if (obj.result && typeof obj.result === "object") {
    return pickHealth(obj.result);
  }

  return Object.keys(obj).length ? obj : null;
}

function getRequestIdFromPayload(payload = null) {
  const obj = safeObject(payload);

  return safeText(
    first(
      obj.requestId,
      obj.data?.requestId,
      obj.payload?.requestId,
      obj.meta?.requestId
    ),
    ""
  );
}

function normalizeDashboardPayload(payload = null) {
  return safeObject(pickDashboard(unwrapResponseEnvelope(payload)));
}

function normalizeHealthPayload(payload = null) {
  return safeObject(pickHealth(unwrapResponseEnvelope(payload)));
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("SERVER_API_CLIENT_UNAVAILABLE");
  }

  const verb = String(method || "GET").toLowerCase();
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

  const verb = String(method || "GET").toLowerCase();

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
    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers: options.headers,
      body:
        options.body === undefined || options.body === null
          ? undefined
          : JSON.stringify(options.body),
      signal: controller.signal,
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

      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(method = "GET", path = "", options = {}) {
  const requestOptions = {
    timeout: safeNumber(options.timeout, SERVER_TIMEOUT),
    params: options.params,
    body: options.body,
    headers: getRequestHeaders({
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(safeObject(options.headers)),
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
   RAW REQUESTS
========================================================= */

export async function fetchServerDashboardRequest() {
  return request("GET", SERVER_DASHBOARD_ENDPOINT, {
    timeout: SERVER_TIMEOUT,
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
  const dashboardStartedAt = performance.now();
  const dashboardPromise = fetchServerDashboardRequest();

  const healthStartedAt = performance.now();
  const healthPromise = fetchServerHealthRequest();

  const [dashboardResponse, healthResponse] = await Promise.all([
    dashboardPromise,
    healthPromise,
  ]);

  const dashboardFinishedAt = performance.now();
  const healthFinishedAt = performance.now();

  const dashboardLatencyMs = Math.round(
    (dashboardFinishedAt - dashboardStartedAt + Number.EPSILON) * 100
  ) / 100;

  const healthLatencyMs = Math.round(
    (healthFinishedAt - healthStartedAt + Number.EPSILON) * 100
  ) / 100;

  return buildServerSnapshot({
    dashboardPayload: normalizeDashboardPayload(dashboardResponse),
    healthPayload: normalizeHealthPayload(healthResponse),
    dashboardLatencyMs,
    healthLatencyMs,
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
    const history = safeObject(
      serverState?.history,
      createServerHistoryState()
    );

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
   LOAD SERVER SNAPSHOT
========================================================= */

export async function loadServerSnapshot({
  force = false,
} = {}) {
  const loadToken = nextLoadToken();
  const firstLoad = !Boolean(serverState?.hydrated);
  const shouldShowLoading = firstLoad && !force;

  try {
    setError(null);

    if (shouldShowLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const dashboardStartedAt = performance.now();
    const dashboardPromise = fetchServerDashboardRequest();

    const healthStartedAt = performance.now();
    const healthPromise = fetchServerHealthRequest();

    const [rawDashboardResponse, rawHealthResponse] = await Promise.all([
      dashboardPromise,
      healthPromise,
    ]);

    const dashboardFinishedAt = performance.now();
    const healthFinishedAt = performance.now();

    const dashboardLatencyMs = Math.round(
      (dashboardFinishedAt - dashboardStartedAt + Number.EPSILON) * 100
    ) / 100;

    const healthLatencyMs = Math.round(
      (healthFinishedAt - healthStartedAt + Number.EPSILON) * 100
    ) / 100;

    const dashboardPayload = normalizeDashboardPayload(rawDashboardResponse);
    const healthPayload = normalizeHealthPayload(rawHealthResponse);

    const snapshot = buildServerSnapshot({
      dashboardPayload,
      healthPayload,
      dashboardLatencyMs,
      healthLatencyMs,
      history: safeObject(
        serverState?.history,
        createServerHistoryState()
      ),
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

    replaceServerStore({
      dashboardPayload: snapshot.dashboardPayload,
      healthPayload: snapshot.healthPayload,
      dashboardLatencyMs: snapshot.dashboardLatencyMs,
      healthLatencyMs: snapshot.healthLatencyMs,
      browserMetrics: snapshot.browserMetrics,
      environmentMetrics: snapshot.environmentMetrics,
      telemetry: snapshot.telemetry,
      history: snapshot.history,
      requestId,
      lastSyncAt: Date.now(),
      autoRefresh:
        typeof serverState?.autoRefresh === "boolean"
          ? serverState.autoRefresh
          : true,
    });

    setDashboardPayload(snapshot.dashboardPayload);
    setHealthPayload(snapshot.healthPayload);
    setDashboardLatencyMs(snapshot.dashboardLatencyMs);
    setHealthLatencyMs(snapshot.healthLatencyMs);
    setBrowserMetrics(snapshot.browserMetrics);
    setEnvironmentMetrics(snapshot.environmentMetrics);
    setTelemetry(snapshot.telemetry);
    setHistory(snapshot.history);
    setRequestId(requestId);
    setLastSyncAt(Date.now());
    setLoaded(true);
    setHydrated?.(true);
    setError(null);

    return snapshot;
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudo cargar el panel de servidor."
    );

    if (!isActiveLoadToken(loadToken)) {
      return safeObject(serverState);
    }

    console.error("❌ SERVER SNAPSHOT LOAD:", error);

    setError(message);
    setLoaded(true);

    throw error;
  } finally {
    if (isActiveLoadToken(loadToken)) {
      setLoading(false);
      setRefreshing(false);
    }
  }
}

/* =========================================================
   LOAD HEALTH ONLY
========================================================= */

export async function loadServerHealth({
  silent = true,
} = {}) {
  try {
    const rawHealth = await fetchServerHealthRequest();
    const health = normalizeHealthPayload(rawHealth);

    const currentDashboardPayload = safeObject(serverState?.dashboardPayload);
    const currentDashboardLatencyMs = serverState?.dashboardLatencyMs ?? null;
    const currentHealthLatencyMs = serverState?.healthLatencyMs ?? null;

    const telemetry = extractServerTelemetry({
      dashboardPayload: currentDashboardPayload,
      healthPayload: health,
      dashboardLatencyMs: currentDashboardLatencyMs,
      healthLatencyMs: currentHealthLatencyMs,
    });

    setHealthPayload?.(health);
    setTelemetry?.(telemetry);

    return health;
  } catch (error) {
    console.error("❌ SERVER HEALTH LOAD:", error);

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
   DEFAULT EXPORT
========================================================= */

export default {
  fetchServerDashboardRequest,
  fetchServerHealthRequest,
  getServerDashboardRequest,
  getServerHealthRequest,
  getServerSnapshotRequest,
  hydrateServerFromCache,
  loadServerSnapshot,
  loadServerHealth,
  refreshServerSnapshot,
  setServerAutoRefresh,
};
