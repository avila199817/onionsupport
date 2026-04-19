/* =========================================================
   Onion SPA - Server State
   Archivo: src/views/server/server.state.js

   FINAL PRO SYSTEM · STATE LAYER · 10/10

   RESPONSABILIDADES:
   - estado local centralizado del módulo server
   - loading / refresh snapshot técnico
   - errores
   - cache temporal
   - request inflight
   - servicio / detalle seleccionado
   - compatibilidad View / API / Actions / Modal

   HARDENING PRO:
   - setters robustos
   - no loading infinito
   - estado preparado para services pagination local
   - estado preparado para snapshot server
   - cache helpers
   - snapshot debug
========================================================= */

export const CACHE_KEY = "server.cache";
export const CACHE_TTL = 1000 * 60 * 3; // 3 min
export const DEFAULT_PAGE_SIZE = 6;

/* =========================================================
   SAFE
========================================================= */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

/* =========================================================
   DEFAULTS
========================================================= */

function createDefaultHistoryState() {
  return {
    cpu: [],
    ram: [],
    apiLatency: [],
    dbLatency: [],
    timestamps: [],
  };
}

function createDefaultBrowserMetricsState() {
  return {
    ttfb: null,
    domReady: null,
    windowLoad: null,
    transferSize: null,
    encodedBodySize: null,
    decodedBodySize: null,
  };
}

function createDefaultEnvironmentMetricsState() {
  return {
    userAgent: "",
    language: "",
    platform: "",
    onLine: null,
    deviceMemory: null,
    hardwareConcurrency: null,
    connectionType: "",
    downlink: null,
    rtt: null,
    browserMemory: {
      available: false,
      jsHeapUsedMB: null,
      jsHeapTotalMB: null,
      jsHeapLimitMB: null,
    },
  };
}

function createDefaultTelemetryState() {
  return {
    global: {},
    dashboard: {},
    api: {},
    db: {},
    server: {},
    runtime: {},
    environment: {},
    services: {},
  };
}

function createInitialServerState() {
  return {
    hydrated: false,
    loading: false,
    refreshing: false,
    loaded: false,

    openingDetailId: "",
    selectedDetailId: "",

    error: "",

    dashboardPayload: {},
    healthPayload: {},
    telemetry: createDefaultTelemetryState(),
    services: [],
    history: createDefaultHistoryState(),

    browserMetrics: createDefaultBrowserMetricsState(),
    environmentMetrics: createDefaultEnvironmentMetricsState(),

    dashboardLatencyMs: null,
    healthLatencyMs: null,

    servicesCount: 0,

    autoRefresh: true,

    lastSyncAt: 0,
    requestId: "",

    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

/* =========================================================
   STATE
========================================================= */

export const serverState = createInitialServerState();

let inflightLoad = null;

/* =========================================================
   INTERNAL NORMALIZERS
========================================================= */

function normalizeDashboardPayloadState(value = {}) {
  return safeObject(value);
}

function normalizeHealthPayloadState(value = {}) {
  return safeObject(value);
}

function normalizeTelemetryState(value = {}) {
  const item = safeObject(value);
  const base = createDefaultTelemetryState();

  return {
    ...base,
    ...item,
    global: safeObject(item.global),
    dashboard: safeObject(item.dashboard),
    api: safeObject(item.api),
    db: safeObject(item.db),
    server: safeObject(item.server),
    runtime: safeObject(item.runtime),
    environment: safeObject(item.environment),
    services: safeObject(item.services),
  };
}

function normalizeServicesState(value = []) {
  return safeArray(value);
}

function normalizeHistoryState(value = {}) {
  const item = safeObject(value);
  const base = createDefaultHistoryState();

  return {
    ...base,
    ...item,
    cpu: safeArray(item.cpu),
    ram: safeArray(item.ram),
    apiLatency: safeArray(item.apiLatency),
    dbLatency: safeArray(item.dbLatency),
    timestamps: safeArray(item.timestamps),
  };
}

function normalizeBrowserMetricsState(value = {}) {
  const item = safeObject(value);
  const base = createDefaultBrowserMetricsState();

  return {
    ...base,
    ...item,
  };
}

function normalizeEnvironmentMetricsState(value = {}) {
  const item = safeObject(value);
  const base = createDefaultEnvironmentMetricsState();
  const browserMemory = safeObject(item.browserMemory);

  return {
    ...base,
    ...item,
    browserMemory: {
      ...base.browserMemory,
      ...browserMemory,
      available: safeBoolean(
        browserMemory.available,
        base.browserMemory.available
      ),
      jsHeapUsedMB: firstDefined(browserMemory.jsHeapUsedMB, null),
      jsHeapTotalMB: firstDefined(browserMemory.jsHeapTotalMB, null),
      jsHeapLimitMB: firstDefined(browserMemory.jsHeapLimitMB, null),
    },
  };
}

/* =========================================================
   INFLOW
========================================================= */

export function getInflightLoad() {
  return inflightLoad;
}

export function setInflightLoad(value) {
  inflightLoad = value || null;
  return inflightLoad;
}

export function clearInflightLoad() {
  inflightLoad = null;
  return inflightLoad;
}

/* =========================================================
   RESET
========================================================= */

export function resetServerState() {
  const next = createInitialServerState();

  Object.assign(serverState, next);

  inflightLoad = null;

  return serverState;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(value) {
  serverState.loading = Boolean(value);
  return serverState.loading;
}

export function setRefreshing(value) {
  serverState.refreshing = Boolean(value);
  return serverState.refreshing;
}

export function setLoaded(value) {
  serverState.loaded = Boolean(value);
  return serverState.loaded;
}

export function setHydrated(value) {
  serverState.hydrated = Boolean(value);
  return serverState.hydrated;
}

export function setAutoRefresh(value) {
  serverState.autoRefresh = Boolean(value);
  return serverState.autoRefresh;
}

export function setOpeningDetailId(value = "") {
  serverState.openingDetailId = safeText(value, "");
  return serverState.openingDetailId;
}

export function setSelectedDetailId(value = "") {
  serverState.selectedDetailId = safeText(value, "");
  return serverState.selectedDetailId;
}

/* =========================================================
   PAGINATION
========================================================= */

export function setPage(value = 1) {
  serverState.page = Math.max(1, safeNumber(value, 1));
  return serverState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  serverState.pageSize = Math.max(1, safeNumber(value, DEFAULT_PAGE_SIZE));
  return serverState.pageSize;
}

/* =========================================================
   DATA
========================================================= */

export function setDashboardPayload(value = {}) {
  const payload = normalizeDashboardPayloadState(value);

  serverState.dashboardPayload = payload;
  serverState.loaded = true;
  serverState.error = "";

  return serverState.dashboardPayload;
}

export function getDashboardPayload() {
  return normalizeDashboardPayloadState(serverState.dashboardPayload);
}

export function clearDashboardPayload() {
  serverState.dashboardPayload = {};
  return serverState.dashboardPayload;
}

export function setHealthPayload(value = {}) {
  const payload = normalizeHealthPayloadState(value);

  serverState.healthPayload = payload;
  serverState.loaded = true;
  serverState.error = "";

  return serverState.healthPayload;
}

export function getHealthPayload() {
  return normalizeHealthPayloadState(serverState.healthPayload);
}

export function clearHealthPayload() {
  serverState.healthPayload = {};
  return serverState.healthPayload;
}

export function setTelemetry(value = {}) {
  serverState.telemetry = normalizeTelemetryState(value);
  serverState.loaded = true;
  serverState.error = "";

  return serverState.telemetry;
}

export function getTelemetry() {
  return normalizeTelemetryState(serverState.telemetry);
}

export function clearTelemetry() {
  serverState.telemetry = createDefaultTelemetryState();
  return serverState.telemetry;
}

export function setServices(items = []) {
  const list = normalizeServicesState(items);

  serverState.services = list;
  serverState.servicesCount = list.length;
  serverState.loaded = true;
  serverState.error = "";

  return list;
}

export function getServices() {
  return normalizeServicesState(serverState.services);
}

export function clearServices() {
  serverState.services = [];
  serverState.servicesCount = 0;
  serverState.page = 1;

  return serverState.services;
}

export function setHistory(value = {}) {
  serverState.history = normalizeHistoryState(value);
  return serverState.history;
}

export function getHistory() {
  return normalizeHistoryState(serverState.history);
}

export function clearHistory() {
  serverState.history = createDefaultHistoryState();
  return serverState.history;
}

export function setBrowserMetrics(value = {}) {
  serverState.browserMetrics = normalizeBrowserMetricsState(value);
  return serverState.browserMetrics;
}

export function getBrowserMetrics() {
  return normalizeBrowserMetricsState(serverState.browserMetrics);
}

export function clearBrowserMetrics() {
  serverState.browserMetrics = createDefaultBrowserMetricsState();
  return serverState.browserMetrics;
}

export function setEnvironmentMetrics(value = {}) {
  serverState.environmentMetrics = normalizeEnvironmentMetricsState(value);
  return serverState.environmentMetrics;
}

export function getEnvironmentMetrics() {
  return normalizeEnvironmentMetricsState(serverState.environmentMetrics);
}

export function clearEnvironmentMetrics() {
  serverState.environmentMetrics = createDefaultEnvironmentMetricsState();
  return serverState.environmentMetrics;
}

/* =========================================================
   META / LATENCIES
========================================================= */

export function setDashboardLatencyMs(value = null) {
  serverState.dashboardLatencyMs =
    value === null || value === undefined
      ? null
      : safeNumber(value, null);

  return serverState.dashboardLatencyMs;
}

export function setHealthLatencyMs(value = null) {
  serverState.healthLatencyMs =
    value === null || value === undefined
      ? null
      : safeNumber(value, null);

  return serverState.healthLatencyMs;
}

export function setServicesCount(value = 0) {
  serverState.servicesCount = Math.max(0, safeNumber(value, 0));
  return serverState.servicesCount;
}

export function setRequestId(value = "") {
  serverState.requestId = safeText(value, "");
  return serverState.requestId;
}

export function setError(value = null) {
  serverState.error = value ? String(value).trim() : "";
  return serverState.error;
}

export function clearError() {
  serverState.error = "";
  return serverState.error;
}

export function setLastSyncAt(value = 0) {
  serverState.lastSyncAt = safeNumber(value, 0);
  return serverState.lastSyncAt;
}

/* =========================================================
   PATCHERS
========================================================= */

export function patchDashboardPayload(patch = {}) {
  serverState.dashboardPayload = {
    ...safeObject(serverState.dashboardPayload),
    ...safeObject(patch),
  };

  return serverState.dashboardPayload;
}

export function patchHealthPayload(patch = {}) {
  serverState.healthPayload = {
    ...safeObject(serverState.healthPayload),
    ...safeObject(patch),
  };

  return serverState.healthPayload;
}

export function patchTelemetry(patch = {}) {
  serverState.telemetry = {
    ...normalizeTelemetryState(serverState.telemetry),
    ...safeObject(patch),
  };

  return serverState.telemetry;
}

export function replaceServerSnapshot({
  dashboardPayload = {},
  healthPayload = {},
  telemetry = {},
  services = [],
  history = {},
  browserMetrics = {},
  environmentMetrics = {},
  dashboardLatencyMs = null,
  healthLatencyMs = null,
  requestId = "",
  lastSyncAt = 0,
  autoRefresh = true,
} = {}) {
  setDashboardPayload(dashboardPayload);
  setHealthPayload(healthPayload);
  setTelemetry(telemetry);
  setServices(services);
  setHistory(history);
  setBrowserMetrics(browserMetrics);
  setEnvironmentMetrics(environmentMetrics);
  setDashboardLatencyMs(dashboardLatencyMs);
  setHealthLatencyMs(healthLatencyMs);
  setRequestId(requestId);
  setLastSyncAt(lastSyncAt);
  setAutoRefresh(autoRefresh);

  return {
    dashboardPayload: getDashboardPayload(),
    healthPayload: getHealthPayload(),
    telemetry: getTelemetry(),
    services: getServices(),
    history: getHistory(),
    browserMetrics: getBrowserMetrics(),
    environmentMetrics: getEnvironmentMetrics(),
    dashboardLatencyMs: serverState.dashboardLatencyMs,
    healthLatencyMs: serverState.healthLatencyMs,
    requestId: serverState.requestId,
    lastSyncAt: serverState.lastSyncAt,
    autoRefresh: serverState.autoRefresh,
  };
}

/* =========================================================
   SELECTION HELPERS
========================================================= */

export function getSelectedDetail() {
  const selectedId = safeText(serverState.selectedDetailId, "");

  if (!selectedId) return null;

  return (
    safeArray(serverState.services).find(
      (item) =>
        safeText(item?.serviceId, "") === selectedId ||
        safeText(item?.id, "") === selectedId
    ) || null
  );
}

export function clearSelection() {
  serverState.selectedDetailId = "";
  serverState.openingDetailId = "";

  return {
    selectedDetailId: serverState.selectedDetailId,
    openingDetailId: serverState.openingDetailId,
  };
}

/* =========================================================
   CACHE HELPERS
========================================================= */

export function getCachePayload() {
  return {
    savedAt: Date.now(),
    dashboardPayload: getDashboardPayload(),
    healthPayload: getHealthPayload(),
    telemetry: getTelemetry(),
    services: getServices(),
    history: getHistory(),
    browserMetrics: getBrowserMetrics(),
    environmentMetrics: getEnvironmentMetrics(),
    dashboardLatencyMs: serverState.dashboardLatencyMs,
    healthLatencyMs: serverState.healthLatencyMs,
    servicesCount: serverState.servicesCount,
    autoRefresh: serverState.autoRefresh,
    lastSyncAt: serverState.lastSyncAt,
    requestId: serverState.requestId,
    page: serverState.page,
    pageSize: serverState.pageSize,
  };
}

export function isCacheFresh(savedAt = 0) {
  const ts = safeNumber(savedAt, 0);

  if (!ts) {
    return false;
  }

  return Date.now() - ts < CACHE_TTL;
}

/* =========================================================
   DEBUG
========================================================= */

export function getServerStateSnapshot() {
  const dashboardPayload = normalizeDashboardPayloadState(
    serverState.dashboardPayload
  );
  const healthPayload = normalizeHealthPayloadState(
    serverState.healthPayload
  );
  const telemetry = normalizeTelemetryState(serverState.telemetry);
  const services = normalizeServicesState(serverState.services);
  const history = normalizeHistoryState(serverState.history);
  const browserMetrics = normalizeBrowserMetricsState(
    serverState.browserMetrics
  );
  const environmentMetrics = normalizeEnvironmentMetricsState(
    serverState.environmentMetrics
  );

  return {
    hydrated: serverState.hydrated,
    loading: serverState.loading,
    refreshing: serverState.refreshing,
    loaded: serverState.loaded,

    openingDetailId: serverState.openingDetailId,
    selectedDetailId: serverState.selectedDetailId,

    error: serverState.error,

    hasDashboardPayload: Boolean(Object.keys(dashboardPayload).length),
    hasHealthPayload: Boolean(Object.keys(healthPayload).length),
    hasTelemetry: Boolean(
      Object.keys(safeObject(telemetry)).length
    ),

    servicesCount: services.length,

    hasHistory: Boolean(
      history.cpu.length ||
      history.ram.length ||
      history.apiLatency.length ||
      history.dbLatency.length
    ),

    hasBrowserMetrics: Boolean(
      Object.keys(browserMetrics).length
    ),

    hasEnvironmentMetrics: Boolean(
      Object.keys(environmentMetrics).length
    ),

    autoRefresh: serverState.autoRefresh,

    dashboardLatencyMs: serverState.dashboardLatencyMs,
    healthLatencyMs: serverState.healthLatencyMs,

    lastSyncAt: serverState.lastSyncAt,
    requestId: serverState.requestId,

    page: serverState.page,
    pageSize: serverState.pageSize,

    hasInflight: Boolean(inflightLoad),

    telemetryPreview: {
      globalStatus: safeText(telemetry?.global?.status, ""),
      globalService: safeText(telemetry?.global?.service, ""),
      apiStatus: safeText(telemetry?.api?.status, ""),
      dbStatus: safeText(telemetry?.db?.status, ""),
      servicesCount: Object.keys(
        safeObject(telemetry?.services)
      ).length,
    },

    selectedDetailPreview: getSelectedDetail()
      ? {
          serviceId: safeText(getSelectedDetail()?.serviceId, ""),
          title: safeText(getSelectedDetail()?.title, ""),
          type: safeText(getSelectedDetail()?.type, ""),
          status: safeText(getSelectedDetail()?.status, ""),
        }
      : null,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  CACHE_KEY,
  CACHE_TTL,
  DEFAULT_PAGE_SIZE,
  serverState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

  resetServerState,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setAutoRefresh,
  setOpeningDetailId,
  setSelectedDetailId,

  setPage,
  setPageSize,

  setDashboardPayload,
  getDashboardPayload,
  clearDashboardPayload,

  setHealthPayload,
  getHealthPayload,
  clearHealthPayload,

  setTelemetry,
  getTelemetry,
  clearTelemetry,

  setServices,
  getServices,
  clearServices,

  setHistory,
  getHistory,
  clearHistory,

  setBrowserMetrics,
  getBrowserMetrics,
  clearBrowserMetrics,

  setEnvironmentMetrics,
  getEnvironmentMetrics,
  clearEnvironmentMetrics,

  setDashboardLatencyMs,
  setHealthLatencyMs,
  setServicesCount,
  setRequestId,

  setError,
  clearError,
  setLastSyncAt,

  patchDashboardPayload,
  patchHealthPayload,
  patchTelemetry,
  replaceServerSnapshot,

  getSelectedDetail,
  clearSelection,

  getCachePayload,
  isCacheFresh,
  getServerStateSnapshot,
};
