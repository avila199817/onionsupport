/* =========================================================
   Onion SPA - Home API
   Archivo: src/views/home/home.api.js

   FINAL PRO SYSTEM · API LAYER · DASHBOARD SUMMARY FIRST

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo home
   - cargar dashboard summary
   - resolver widget individual desde snapshot dashboard
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
   - no reintenta con otro adapter si el backend respondió error real
   - browser guards para window/localStorage/sessionStorage/fetch
   - Authorization robusto
   - params soportados en fetch fallback
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
  setHydrated,
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
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function isFn(value) {
  return typeof value === "function";
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.("[HomeAPI]", ...args);
  } catch {}

  try {
    console.error("[HomeAPI]", ...args);
  } catch {}
}

function createUnavailableError(code = "ADAPTER_UNAVAILABLE") {
  const error = new Error(code);

  error.code = code;
  error.adapterUnavailable = true;

  return error;
}

function isAdapterUnavailable(error = null) {
  return Boolean(
    error?.adapterUnavailable === true ||
      [
        "HOME_API_CLIENT_UNAVAILABLE",
        "HOME_API_CLIENT_METHOD_UNAVAILABLE",
        "APP_CORE_REQUEST_UNAVAILABLE",
        "HTTP_MODULE_UNAVAILABLE",
        "HTTP_MODULE_METHOD_UNAVAILABLE",
        "FETCH_UNAVAILABLE",
      ].includes(error?.code) ||
      [
        "HOME_API_CLIENT_UNAVAILABLE",
        "HOME_API_CLIENT_METHOD_UNAVAILABLE",
        "APP_CORE_REQUEST_UNAVAILABLE",
        "HTTP_MODULE_UNAVAILABLE",
        "HTTP_MODULE_METHOD_UNAVAILABLE",
        "FETCH_UNAVAILABLE",
      ].includes(error?.message)
  );
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
  return safeText(
    AppCore?.config?.apiBase,
    ""
  ).replace(/\/+$/g, "");
}

function getBrowserOrigin() {
  if (!isBrowser()) {
    return "http://localhost";
  }

  try {
    return window.location.origin || "http://localhost";
  } catch {
    return "http://localhost";
  }
}

function buildAbsoluteUrl(path = "") {
  const cleanPath = safeText(path, "");

  if (!cleanPath) {
    return getApiBase() || "/";
  }

  if (/^https?:\/\//i.test(cleanPath)) {
    return cleanPath;
  }

  const apiBase = getApiBase();

  if (apiBase) {
    return `${apiBase}${cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`}`;
  }

  return cleanPath.startsWith("/")
    ? cleanPath
    : `/${cleanPath}`;
}

function appendParamsToUrl(url = "", params = null) {
  const entries = Object.entries(safeObject(params));

  if (!entries.length) {
    return url;
  }

  try {
    const absoluteInput = /^https?:\/\//i.test(url);
    const parsed = new URL(url, getBrowserOrigin());

    entries.forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== undefined && item !== null && item !== "") {
            parsed.searchParams.append(key, String(item));
          }
        });

        return;
      }

      parsed.searchParams.set(key, String(value));
    });

    if (absoluteInput) {
      return parsed.toString();
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function readWebStorageValue(storageName = "localStorage", key = "") {
  if (!isBrowser()) {
    return "";
  }

  try {
    const storage = window?.[storageName];

    if (!storage) {
      return "";
    }

    return safeText(storage.getItem(key), "");
  } catch {
    return "";
  }
}

function readAppStorageValue(key = "") {
  const cleanKey = safeText(key, "");

  if (!cleanKey) {
    return "";
  }

  try {
    if (isFn(AppCore?.storage?.get)) {
      return safeText(AppCore.storage.get(cleanKey), "");
    }
  } catch {}

  return "";
}

function getAuthToken() {
  const candidates = [
    AppCore?.state?.token,
    AppCore?.state?.accessToken,
    AppCore?.state?.session?.token,
    AppCore?.state?.session?.accessToken,

    AppCore?.auth?.getToken?.(),
    AppCore?.Auth?.getToken?.(),
    AppCore?.modules?.Auth?.getToken?.(),

    readAppStorageValue("token"),
    readAppStorageValue("auth.token"),
    readAppStorageValue("auth.accessToken"),
    readAppStorageValue("accessToken"),

    readWebStorageValue("localStorage", "token"),
    readWebStorageValue("localStorage", "accessToken"),
    readWebStorageValue("localStorage", "auth.token"),
    readWebStorageValue("localStorage", "auth.accessToken"),
    readWebStorageValue("localStorage", "onion:token"),
    readWebStorageValue("localStorage", "onion:auth.token"),
    readWebStorageValue("localStorage", "onion:auth.accessToken"),

    readWebStorageValue("sessionStorage", "token"),
    readWebStorageValue("sessionStorage", "accessToken"),
    readWebStorageValue("sessionStorage", "auth.token"),
    readWebStorageValue("sessionStorage", "auth.accessToken"),
    readWebStorageValue("sessionStorage", "onion:token"),
    readWebStorageValue("sessionStorage", "onion:auth.token"),
    readWebStorageValue("sessionStorage", "onion:auth.accessToken"),
  ];

  return safeText(first(...candidates), "");
}

function getRequestHeaders(extraHeaders = {}) {
  const token = getAuthToken();

  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...safeObject(extraHeaders),
  };
}

function getApiClient() {
  return AppCore?.apiClient || null;
}

function getHttpModule() {
  try {
    if (isFn(AppCore?.modules?.get)) {
      return (
        AppCore.modules.get("Http") ||
        AppCore.modules.get("http") ||
        null
      );
    }
  } catch {}

  return (
    AppCore?.modules?.Http ||
    AppCore?.modules?.http ||
    AppCore?.Http ||
    AppCore?.http ||
    (typeof window !== "undefined" ? window.Http : null) ||
    null
  );
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function normalizeErrorMessage(error = null, fallback = "Error de API.") {
  const status = Number(
    first(
      error?.status,
      error?.response?.status,
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
    return "No tienes permisos para acceder al dashboard.";
  }

  if (status === 404 || errorCode === "DASHBOARD_ROUTE_NOT_FOUND") {
    return "La ruta del dashboard no existe o no está disponible.";
  }

  if (errorCode === "DASHBOARD_ERROR") {
    return "El dashboard devolvió un error interno.";
  }

  return safeText(
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
      obj.totals ||
      obj.widgets ||
      obj.cards ||
      obj.kpis ||
      obj.items ||
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
      obj.label ||
      obj.heading
  );
}

function unwrapResponseEnvelope(payload = null, depth = 0) {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (depth > 8) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (
    looksLikeDashboard(payload) ||
    looksLikeWidget(payload)
  ) {
    return payload;
  }

  const obj = safeObject(payload);

  if (!Object.keys(obj).length) {
    return payload;
  }

  const candidates = [
    obj.dashboard,
    obj.widget,
    obj.item,
    obj.data,
    obj.result,
    obj.payload,
    obj.body,
    obj.response,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    const unwrapped = unwrapResponseEnvelope(candidate, depth + 1);

    if (
      unwrapped !== undefined &&
      unwrapped !== null
    ) {
      return unwrapped;
    }
  }

  return obj;
}

function pickDashboard(payload = null) {
  if (!payload) {
    return null;
  }

  if (looksLikeDashboard(payload)) {
    return payload;
  }

  const unwrapped = unwrapResponseEnvelope(payload);

  if (looksLikeDashboard(unwrapped)) {
    return unwrapped;
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.dashboard,
    obj.data,
    obj.result,
    obj.payload,
    obj.body,
    obj.response,
    obj?.data?.dashboard,
    obj?.data?.result,
    obj?.data?.payload,
    obj?.payload?.dashboard,
    obj?.result?.dashboard,
  ];

  for (const candidate of candidates) {
    if (looksLikeDashboard(candidate)) {
      return candidate;
    }

    const nested = unwrapResponseEnvelope(candidate);

    if (looksLikeDashboard(nested)) {
      return nested;
    }
  }

  return null;
}

function getRequestIdFromPayload(payload = null) {
  const obj = safeObject(payload);

  return safeText(
    first(
      obj.requestId,
      obj.correlationId,
      obj.traceId,
      obj.data?.requestId,
      obj.payload?.requestId,
      obj.result?.requestId,
      obj.meta?.requestId,
      obj.headers?.["x-request-id"]
    ),
    ""
  );
}

function getDashboardSummaryBlock(dashboard = {}) {
  const raw = safeObject(dashboard);

  return safeObject(
    first(
      raw.summary,
      raw.stats,
      raw.metrics,
      raw.totals
    )
  );
}

function getDashboardWidgetsBlock(dashboard = {}) {
  const raw = safeObject(dashboard);

  return safeArray(
    first(
      raw.widgets,
      raw.cards,
      raw.kpis,
      raw.items
    )
  );
}

function getDashboardRecentBlock(dashboard = {}) {
  const raw = safeObject(dashboard);

  return safeArray(
    first(
      raw.recent,
      raw.recentActivity,
      raw.activity,
      raw.timeline
    )
  );
}

function getWidgetId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.widgetId,
      raw.id,
      raw.key,
      raw.slug,
      raw.code
    ),
    ""
  );
}

function getWidgetTitle(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.title,
      raw.name,
      raw.label,
      raw.heading
    ),
    "Bloque"
  );
}

function getWidgetDescription(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.description,
      raw.descripcion,
      raw.subtitle,
      raw.summary,
      raw.text
    ),
    ""
  );
}

function getWidgetType(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.type,
      raw.kind,
      raw.variant,
      raw.category
    ),
    "widget"
  );
}

function getWidgetValue(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.value,
    raw.total,
    raw.amount,
    raw.count,
    raw.metric
  );
}

function getWidgetTrend(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.trend,
    raw.delta,
    raw.change,
    raw.variation
  );
}

function getWidgetStatus(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.status,
      raw.estado,
      raw.state
    ),
    "active"
  );
}

function getWidgetRoute(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.route,
      raw.href,
      raw.link,
      raw.to
    ),
    ""
  );
}

function getWidgetUpdatedAt(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.updatedAt,
    raw.lastUpdate,
    raw.modifiedAt,
    raw.createdAt
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
  const picked = pickDashboard(payload);
  const raw = safeObject(picked);

  const summary = getDashboardSummaryBlock(raw);

  const widgets = getDashboardWidgetsBlock(raw)
    .map((item) => normalizeWidget(item))
    .filter((item) => looksLikeWidget(item));

  const recent = getDashboardRecentBlock(raw)
    .map((item) => safeObject(item));

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

function findWidgetInCollection(items = [], widgetId = "") {
  const target = safeText(widgetId, "");

  if (!target) {
    return null;
  }

  const targetLower = target.toLowerCase();

  return (
    safeArray(items).find((item) => {
      const currentId = getWidgetId(item);
      return (
        currentId === target ||
        currentId.toLowerCase() === targetLower
      );
    }) || null
  );
}

/* =========================================================
   REQUEST BODY
========================================================= */

function hasRequestBody(body) {
  return body !== undefined && body !== null;
}

function isFormDataBody(body) {
  try {
    return (
      typeof FormData !== "undefined" &&
      body instanceof FormData
    );
  } catch {
    return false;
  }
}

function buildRequestBody(body) {
  if (!hasRequestBody(body)) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    isFormDataBody(body) ||
    body instanceof Blob
  ) {
    return body;
  }

  return JSON.stringify(body);
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw createUnavailableError("HOME_API_CLIENT_UNAVAILABLE");
  }

  const verb = String(method || "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, HOME_TIMEOUT);

  if (verb === "get" && isFn(client.get)) {
    return client.get(path, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
    });
  }

  if (verb === "post" && isFn(client.post)) {
    return client.post(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
    });
  }

  if (isFn(client.request)) {
    return client.request(path, {
      method: method.toUpperCase(),
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
      body: options.body,
    });
  }

  throw createUnavailableError("HOME_API_CLIENT_METHOD_UNAVAILABLE");
}

async function requestViaAppCoreRequest(method = "GET", path = "", options = {}) {
  if (!isFn(AppCore?.request)) {
    throw createUnavailableError("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(path, {
    method: method.toUpperCase(),
    headers: options.headers,
    params: options.params,
    body: buildRequestBody(options.body),
    timeout: options.timeout,
    auth: true,
  });
}

async function requestViaHttpModule(method = "GET", path = "", options = {}) {
  const Http = getHttpModule();

  if (!Http) {
    throw createUnavailableError("HTTP_MODULE_UNAVAILABLE");
  }

  const verb = String(method || "GET").toLowerCase();

  if (verb === "get" && isFn(Http.get)) {
    return Http.get(path, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
      auth: true,
    });
  }

  if (verb === "post" && isFn(Http.post)) {
    return Http.post(path, options.body, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
      auth: true,
    });
  }

  if (isFn(Http.request)) {
    return Http.request(path, {
      method: method.toUpperCase(),
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
      body: options.body,
      auth: true,
    });
  }

  throw createUnavailableError("HTTP_MODULE_METHOD_UNAVAILABLE");
}

async function requestViaFetch(method = "GET", path = "", options = {}) {
  if (typeof fetch !== "function") {
    throw createUnavailableError("FETCH_UNAVAILABLE");
  }

  const methodName = method.toUpperCase();
  const timeout = safeNumber(options.timeout, HOME_TIMEOUT);

  const url = appendParamsToUrl(
    buildAbsoluteUrl(path),
    options.params
  );

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeout);

  try {
    const headers = {
      ...safeObject(options.headers),
    };

    if (
      hasRequestBody(options.body) &&
      !isFormDataBody(options.body) &&
      !headers["Content-Type"] &&
      !headers["content-type"]
    ) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method: methodName,
      headers,
      body:
        methodName === "GET" || methodName === "HEAD"
          ? undefined
          : buildRequestBody(options.body),
      signal: controller.signal,
      credentials: "same-origin",
    });

    const contentType = safeText(
      response.headers?.get?.("content-type"),
      ""
    );

    const text = await response.text();

    let data = null;

    if (text) {
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      } else {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
    }

    if (!response.ok) {
      const error = new Error(
        normalizeErrorMessage(
          {
            ...safeObject(data),
            status: response.status,
          },
          `HTTP ${response.status} en ${methodName} ${path}`
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
  const hasBody = hasRequestBody(options.body);

  const headers = getRequestHeaders({
    ...(safeObject(options.headers)),
  });

  const requestOptions = {
    timeout: safeNumber(options.timeout, HOME_TIMEOUT),
    params: options.params,
    body: options.body,
    headers,
  };

  const adapters = [
    requestViaApiClient,
    requestViaAppCoreRequest,
    requestViaHttpModule,
    requestViaFetch,
  ];

  let lastUnavailableError = null;

  for (const adapter of adapters) {
    try {
      return await adapter(method, path, requestOptions);
    } catch (error) {
      if (isAdapterUnavailable(error)) {
        lastUnavailableError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastUnavailableError || new Error("HOME_REQUEST_FAILED");
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
  const dashboard = normalizeDashboard(response);

  return dashboard;
}

export async function getHomeWidgetByIdRequest(
  widgetId = "",
  options = {}
) {
  const id = safeText(widgetId, "");

  if (!id) {
    return null;
  }

  const dashboard = await getHomeDashboardRequest(options);
  const widgets = safeArray(dashboard?.widgets);

  return findWidgetInCollection(widgets, id);
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateHomeFromCache() {
  try {
    const currentDashboard = safeObject(homeState?.dashboard);
    const currentWidgets = safeArray(homeState?.widgets);
    const currentSummary = safeObject(homeState?.summary);
    const currentRecent = safeArray(homeState?.recent);
    const currentRequestId = safeText(homeState?.requestId, "");
    const currentLastSyncAt = first(homeState?.lastSyncAt, null);

    const hasCache =
      Object.keys(currentDashboard).length > 0 ||
      currentWidgets.length > 0 ||
      Object.keys(currentSummary).length > 0 ||
      currentRecent.length > 0;

    if (hasCache) {
      replaceHomeStore({
        dashboard: currentDashboard,
        widgets: currentWidgets,
        summary: currentSummary,
        recent: currentRecent,
        requestId: currentRequestId,
        lastSyncAt: currentLastSyncAt,
      });

      setHydrated?.(true);
    }

    return {
      dashboard: currentDashboard,
      widgets: currentWidgets,
      summary: currentSummary,
      recent: currentRecent,
      requestId: currentRequestId,
      lastSyncAt: currentLastSyncAt,
      hydrated: hasCache,
    };
  } catch {
    return {
      dashboard: {},
      widgets: [],
      summary: {},
      recent: [],
      requestId: "",
      lastSyncAt: null,
      hydrated: false,
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

  const firstLoad = !Boolean(
    homeState?.hydrated ||
      homeState?.loaded ||
      Object.keys(safeObject(homeState?.dashboard)).length
  );

  const shouldShowLoading = firstLoad && !force;

  safeEmit("home:dashboard:load:start", {
    force: Boolean(force),
    firstLoad,
  });

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

    if (!looksLikeDashboard(dashboard)) {
      throw new Error("EMPTY_HOME_DASHBOARD");
    }

    const widgets = safeArray(dashboard?.widgets);
    const summary = safeObject(dashboard?.summary);
    const recent = safeArray(dashboard?.recent);
    const syncedAt = Date.now();

    if (!isActiveLoadToken(loadToken)) {
      safeEmit("home:dashboard:load:stale", {
        requestId,
      });

      return safeObject(homeState?.dashboard);
    }

    replaceHomeStore({
      dashboard,
      widgets,
      summary,
      recent,
      requestId,
      lastSyncAt: syncedAt,
    });

    widgets.forEach((item) => {
      if (looksLikeWidget(item)) {
        try {
          upsertHomeWidgetStore?.(item);
        } catch {}
      }
    });

    setDashboard(dashboard);
    setWidgets(widgets);
    setSummary(summary);
    setRecent(recent);
    setRequestId(requestId);
    setLastSyncAt(syncedAt);
    setLoaded(true);
    setHydrated?.(true);
    setError(null);

    safeEmit("home:dashboard:load:success", {
      requestId,
      widgetsCount: widgets.length,
      recentCount: recent.length,
      syncedAt,
    });

    return dashboard;
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudo cargar el dashboard de inicio."
    );

    if (!isActiveLoadToken(loadToken)) {
      safeEmit("home:dashboard:load:error:stale", {
        message,
      });

      return safeObject(homeState?.dashboard);
    }

    safeError("HOME DASHBOARD LOAD:", error);

    setError(message);
    setLoaded(true);

    safeEmit("home:dashboard:load:error", {
      message,
      error,
    });

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
    const normalizedHealth = safeObject(
      unwrapResponseEnvelope(health)
    );

    setHealth?.(normalizedHealth);

    safeEmit("home:health:success", {
      health: normalizedHealth,
    });

    return normalizedHealth;
  } catch (error) {
    safeError("HOME DASHBOARD PING:", error);

    safeEmit("home:health:error", {
      error,
    });

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
   DEBUG
========================================================= */

export function getHomeApiSnapshot() {
  return {
    endpoints: {
      dashboard: HOME_DASHBOARD_ENDPOINT,
      legacyDashboard: HOME_DASHBOARD_LEGACY_ENDPOINT,
      health: HOME_DASHBOARD_PING_ENDPOINT,
    },

    apiBase: getApiBase(),
    hasApiClient: Boolean(getApiClient()),
    hasAppCoreRequest: isFn(AppCore?.request),
    hasHttpModule: Boolean(getHttpModule()),
    hasFetch: typeof fetch === "function",
    hasToken: Boolean(getAuthToken()),

    lastLoadToken,

    state: {
      loading: Boolean(homeState?.loading),
      refreshing: Boolean(homeState?.refreshing),
      loaded: Boolean(homeState?.loaded),
      hydrated: Boolean(homeState?.hydrated),
      requestId: safeText(homeState?.requestId, ""),
      widgetsCount: safeArray(homeState?.widgets).length,
      recentCount: safeArray(homeState?.recent).length,
      lastSyncAt: homeState?.lastSyncAt || null,
      error: homeState?.error || null,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  fetchHomeDashboardRequest,
  fetchHomeHealthRequest,

  getHomeDashboardRequest,
  getHomeWidgetByIdRequest,

  hydrateHomeFromCache,

  loadHomeDashboard,
  loadHomeHealth,
  refreshHomeDashboard,

  getHomeApiSnapshot,
};
