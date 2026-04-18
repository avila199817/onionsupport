/* =========================================================
   Onion SPA - Home API
   Archivo: src/views/home/home.api.js

   FINAL PRO SYSTEM · API LAYER · DASHBOARD SUMMARY FIRST

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo home
   - cargar dashboard summary
   - health local opcional del módulo dashboard
   - refresh forzado
   - hidratar store/state
   - normalizar payloads backend heterogéneos
   - soportar adapters múltiples de request
   - anti-race soft para dashboard load

   HARDENING PRO:
   - soporta { ok, data, payload, result, summary, dashboard }
   - soporta nested envelopes
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - persistencia coherente en store/state
   - contrato alineado con /api/dashboard/summary
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  homeState,
  setLoading,
  setRefreshing,
  setError,
  setDashboard,
  setWidgets,
  setSummary,
  setRecent,
  setLastSyncAt,
  setLoaded,
  setRequestId,
  setHealth,
} from "./home.state.js";

import {
  replaceHomeStore,
  upsertHomeWidgetStore,
} from "./home.store.js";

/* =========================================================
   CONFIG
========================================================= */

const HOME_DASHBOARD_ENDPOINT = "/api/dashboard/summary";
const HOME_DASHBOARD_LEGACY_ENDPOINT = "/api/dashboard";
const HOME_DASHBOARD_PING_ENDPOINT = "/api/dashboard/ping";
const HOME_TIMEOUT = 15000;

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

function normalizeErrorMessage(error = null, fallback = "Error de API.") {
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
    return "No tienes permisos para acceder al dashboard.";
  }

  if (status === 404 || errorCode === "DASHBOARD_ROUTE_NOT_FOUND") {
    return "La ruta del dashboard no existe o no está disponible.";
  }

  if (errorCode === "DASHBOARD_ERROR") {
    return "El dashboard devolvió un error interno.";
  }

  return message;
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function looksLikeDashboard(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.summary ||
      obj.stats ||
      obj.metrics ||
      obj.widgets ||
      obj.cards ||
      obj.kpis ||
      obj.recent ||
      obj.recentActivity ||
      obj.activity ||
      obj.timeline
  );
}

function looksLikeWidget(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.widgetId ||
      obj.id ||
      obj.key ||
      obj.slug ||
      obj.code ||
      obj.title ||
      obj.name ||
      obj.label
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
  if (obj.summary && typeof obj.summary === "object" && !Array.isArray(obj.summary)) {
    return obj;
  }
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
  if (looksLikeDashboard(obj.summary)) return obj;

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

function getDashboardSummaryBlock(dashboard = {}) {
  return safeObject(
    first(
      dashboard.summary,
      dashboard.stats,
      dashboard.metrics,
      dashboard.totals
    )
  );
}

function getDashboardWidgetsBlock(dashboard = {}) {
  return safeArray(
    first(
      dashboard.widgets,
      dashboard.cards,
      dashboard.kpis,
      dashboard.items
    )
  );
}

function getDashboardRecentBlock(dashboard = {}) {
  return safeArray(
    first(
      dashboard.recent,
      dashboard.recentActivity,
      dashboard.activity,
      dashboard.timeline
    )
  );
}

function getWidgetId(item = {}) {
  return safeText(
    first(
      item.widgetId,
      item.id,
      item.key,
      item.slug,
      item.code
    ),
    ""
  );
}

function getWidgetTitle(item = {}) {
  return safeText(
    first(
      item.title,
      item.name,
      item.label,
      item.heading
    ),
    "Bloque"
  );
}

function getWidgetDescription(item = {}) {
  return safeText(
    first(
      item.description,
      item.descripcion,
      item.subtitle,
      item.summary,
      item.text
    ),
    ""
  );
}

function getWidgetType(item = {}) {
  return safeText(
    first(
      item.type,
      item.kind,
      item.variant,
      item.category
    ),
    "widget"
  );
}

function getWidgetValue(item = {}) {
  return first(
    item.value,
    item.total,
    item.amount,
    item.count,
    item.metric
  );
}

function getWidgetTrend(item = {}) {
  return first(
    item.trend,
    item.delta,
    item.change,
    item.variation
  );
}

function getWidgetStatus(item = {}) {
  return safeText(
    first(
      item.status,
      item.estado,
      item.state
    ),
    "active"
  );
}

function getWidgetRoute(item = {}) {
  return safeText(
    first(
      item.route,
      item.href,
      item.link,
      item.to
    ),
    ""
  );
}

function getWidgetUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.lastUpdate,
    item.modifiedAt,
    item.createdAt
  );
}

function normalizeWidget(item = {}) {
  const raw = safeObject(item);

  return {
    ...raw,
    widgetId: getWidgetId(raw),
    title: getWidgetTitle(raw),
    description: getWidgetDescription(raw),
    type: getWidgetType(raw),
    value: getWidgetValue(raw),
    trend: getWidgetTrend(raw),
    status: getWidgetStatus(raw),
    route: getWidgetRoute(raw),
    updatedAt: getWidgetUpdatedAt(raw),
  };
}

function normalizeDashboard(payload = null) {
  const raw = safeObject(pickDashboard(payload));

  const summary = getDashboardSummaryBlock(raw);
  const widgets = getDashboardWidgetsBlock(raw).map((item) =>
    normalizeWidget(item)
  );
  const recent = getDashboardRecentBlock(raw).map((item) =>
    safeObject(item)
  );

  return {
    ...raw,
    summary,
    widgets,
    recent,
    updatedAt: first(
      raw.updatedAt,
      raw.lastUpdate,
      raw.generatedAt,
      raw.createdAt
    ),
  };
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("HOME_API_CLIENT_UNAVAILABLE");
  }

  const verb = String(method || "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, HOME_TIMEOUT);

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

  throw new Error("HOME_API_CLIENT_METHOD_UNAVAILABLE");
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
  const timeout = safeNumber(options.timeout, HOME_TIMEOUT);

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
    timeout: safeNumber(options.timeout, HOME_TIMEOUT),
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

  throw lastError || new Error("HOME_REQUEST_FAILED");
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchHomeDashboardRequest({
  allowLegacyFallback = true,
} = {}) {
  try {
    return await request("GET", HOME_DASHBOARD_ENDPOINT, {
      timeout: HOME_TIMEOUT,
    });
  } catch (error) {
    if (!allowLegacyFallback) {
      throw error;
    }

    const status = Number(error?.status);

    if (status && status !== 404) {
      throw error;
    }

    return request("GET", HOME_DASHBOARD_LEGACY_ENDPOINT, {
      timeout: HOME_TIMEOUT,
    });
  }
}

export async function fetchHomeHealthRequest() {
  return request("GET", HOME_DASHBOARD_PING_ENDPOINT, {
    timeout: HOME_TIMEOUT,
  });
}

export async function getHomeDashboardRequest(options = {}) {
  const response = await fetchHomeDashboardRequest(options);
  return normalizeDashboard(response);
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateHomeFromCache() {
  try {
    const currentDashboard = safeObject(homeState?.dashboard);
    const currentWidgets = safeArray(homeState?.widgets);

    if (
      Object.keys(currentDashboard).length ||
      currentWidgets.length
    ) {
      replaceHomeStore({
        dashboard: currentDashboard,
        widgets: currentWidgets,
        summary: safeObject(homeState?.summary),
        recent: safeArray(homeState?.recent),
        requestId: safeText(homeState?.requestId, ""),
        lastSyncAt: first(homeState?.lastSyncAt, null),
      });
    }

    return {
      dashboard: currentDashboard,
      widgets: currentWidgets,
      summary: safeObject(homeState?.summary),
      recent: safeArray(homeState?.recent),
    };
  } catch {
    return {
      dashboard: {},
      widgets: [],
      summary: {},
      recent: [],
    };
  }
}

/* =========================================================
   LOAD DASHBOARD
========================================================= */

export async function loadHomeDashboard({
  force = false,
  allowLegacyFallback = true,
} = {}) {
  const loadToken = nextLoadToken();
  const firstLoad = !Boolean(homeState?.hydrated);
  const shouldShowLoading = firstLoad && !force;

  try {
    setError(null);

    if (shouldShowLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const rawResponse = await fetchHomeDashboardRequest({
      allowLegacyFallback,
    });

    const requestId = getRequestIdFromPayload(rawResponse);
    const dashboard = normalizeDashboard(rawResponse);
    const widgets = safeArray(dashboard?.widgets);
    const summary = safeObject(dashboard?.summary);
    const recent = safeArray(dashboard?.recent);

    if (!isActiveLoadToken(loadToken)) {
      return safeObject(homeState?.dashboard);
    }

    replaceHomeStore({
      dashboard,
      widgets,
      summary,
      recent,
      requestId,
      lastSyncAt: Date.now(),
    });

    widgets.forEach((item) => {
      if (looksLikeWidget(item)) {
        upsertHomeWidgetStore?.(item);
      }
    });

    setDashboard(dashboard);
    setWidgets(widgets);
    setSummary(summary);
    setRecent(recent);
    setRequestId(requestId);
    setLastSyncAt(Date.now());
    setLoaded(true);
    setError(null);

    return dashboard;
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudo cargar el dashboard de inicio."
    );

    if (!isActiveLoadToken(loadToken)) {
      return safeObject(homeState?.dashboard);
    }

    console.error("❌ HOME DASHBOARD LOAD:", error);

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
   LOAD HEALTH
========================================================= */

export async function loadHomeHealth({
  silent = true,
} = {}) {
  try {
    const health = await fetchHomeHealthRequest();

    setHealth?.(safeObject(health));

    return safeObject(health);
  } catch (error) {
    console.error("❌ HOME DASHBOARD PING:", error);

    if (!silent) {
      throw error;
    }

    return null;
  }
}

/* =========================================================
   REFRESH
========================================================= */

export async function refreshHomeDashboard(options = {}) {
  return loadHomeDashboard({
    ...safeObject(options),
    force: true,
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  fetchHomeDashboardRequest,
  fetchHomeHealthRequest,
  getHomeDashboardRequest,
  hydrateHomeFromCache,
  loadHomeDashboard,
  loadHomeHealth,
  refreshHomeDashboard,
};
