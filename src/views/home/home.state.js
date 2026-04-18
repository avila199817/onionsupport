/* =========================================================
   Onion SPA - Home State
   Archivo: src/views/home/home.state.js

   FINAL PRO SYSTEM · STATE LAYER · 10/10

   RESPONSABILIDADES:
   - estado local centralizado del módulo home
   - loading / refresh dashboard
   - errores
   - cache temporal
   - request inflight
   - widget seleccionado / abierto
   - compatibilidad View / API / Actions / Modal

   HARDENING PRO:
   - setters robustos
   - no loading infinito
   - estado preparado para paginación local de widgets
   - estado preparado para snapshot dashboard
   - cache helpers
   - snapshot debug
========================================================= */

export const CACHE_KEY = "home.cache";
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

function createDefaultHealthState() {
  return {
    ok: false,
    service: "",
    status: "",
    timestamp: "",
  };
}

function createInitialHomeState() {
  return {
    hydrated: false,
    loading: false,
    refreshing: false,
    loaded: false,

    openingWidgetId: "",
    selectedWidgetId: "",

    error: "",

    dashboard: {},
    widgets: [],
    summary: {},
    recent: [],
    health: null,

    widgetsCount: 0,
    recentCount: 0,

    lastSyncAt: 0,
    requestId: "",

    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

/* =========================================================
   STATE
========================================================= */

export const homeState = createInitialHomeState();

let inflightLoad = null;

/* =========================================================
   INTERNAL
========================================================= */

function normalizeHealthState(value = null) {
  if (!value) return null;

  const item = safeObject(value);
  const base = createDefaultHealthState();

  return {
    ...base,
    ...item,
    ok: safeBoolean(item.ok, base.ok),
    service: safeText(item.service, base.service),
    status: safeText(item.status, base.status),
    timestamp: safeText(item.timestamp, base.timestamp),
  };
}

function normalizeDashboardState(value = {}) {
  return safeObject(value);
}

function normalizeSummaryState(value = {}) {
  return safeObject(value);
}

function normalizeWidgetsState(value = []) {
  return safeArray(value);
}

function normalizeRecentState(value = []) {
  return safeArray(value);
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

export function resetHomeState() {
  const next = createInitialHomeState();

  Object.assign(homeState, next);

  inflightLoad = null;

  return homeState;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(value) {
  homeState.loading = Boolean(value);
  return homeState.loading;
}

export function setRefreshing(value) {
  homeState.refreshing = Boolean(value);
  return homeState.refreshing;
}

export function setLoaded(value) {
  homeState.loaded = Boolean(value);
  return homeState.loaded;
}

export function setHydrated(value) {
  homeState.hydrated = Boolean(value);
  return homeState.hydrated;
}

export function setOpeningWidgetId(value = "") {
  homeState.openingWidgetId = safeText(value, "");
  return homeState.openingWidgetId;
}

export function setSelectedWidgetId(value = "") {
  homeState.selectedWidgetId = safeText(value, "");
  return homeState.selectedWidgetId;
}

/* =========================================================
   PAGINATION
========================================================= */

export function setPage(value = 1) {
  homeState.page = Math.max(1, safeNumber(value, 1));
  return homeState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  homeState.pageSize = Math.max(1, safeNumber(value, DEFAULT_PAGE_SIZE));
  return homeState.pageSize;
}

/* =========================================================
   DATA
========================================================= */

export function setDashboard(value = {}) {
  const dashboard = normalizeDashboardState(value);

  homeState.dashboard = dashboard;
  homeState.loaded = true;
  homeState.error = "";

  return homeState.dashboard;
}

export function getDashboard() {
  return normalizeDashboardState(homeState.dashboard);
}

export function clearDashboard() {
  homeState.dashboard = {};
  return homeState.dashboard;
}

export function setWidgets(items = []) {
  const list = normalizeWidgetsState(items);

  homeState.widgets = list;
  homeState.widgetsCount = list.length;
  homeState.loaded = true;
  homeState.error = "";

  return list;
}

export function getWidgets() {
  return normalizeWidgetsState(homeState.widgets);
}

export function clearWidgets() {
  homeState.widgets = [];
  homeState.widgetsCount = 0;
  homeState.page = 1;

  return homeState.widgets;
}

export function setSummary(value = {}) {
  homeState.summary = normalizeSummaryState(value);
  return homeState.summary;
}

export function getSummary() {
  return normalizeSummaryState(homeState.summary);
}

export function clearSummary() {
  homeState.summary = {};
  return homeState.summary;
}

export function setRecent(items = []) {
  const list = normalizeRecentState(items);

  homeState.recent = list;
  homeState.recentCount = list.length;

  return list;
}

export function getRecent() {
  return normalizeRecentState(homeState.recent);
}

export function clearRecent() {
  homeState.recent = [];
  homeState.recentCount = 0;

  return homeState.recent;
}

export function setHealth(value = null) {
  homeState.health = normalizeHealthState(value);
  return homeState.health;
}

export function getHealth() {
  return homeState.health
    ? normalizeHealthState(homeState.health)
    : null;
}

export function clearHealth() {
  homeState.health = null;
  return homeState.health;
}

/* =========================================================
   COUNTS / META
========================================================= */

export function setWidgetsCount(value = 0) {
  homeState.widgetsCount = Math.max(0, safeNumber(value, 0));
  return homeState.widgetsCount;
}

export function setRecentCount(value = 0) {
  homeState.recentCount = Math.max(0, safeNumber(value, 0));
  return homeState.recentCount;
}

export function setRequestId(value = "") {
  homeState.requestId = safeText(value, "");
  return homeState.requestId;
}

export function setError(value = null) {
  homeState.error = value ? String(value).trim() : "";
  return homeState.error;
}

export function clearError() {
  homeState.error = "";
  return homeState.error;
}

export function setLastSyncAt(value = 0) {
  homeState.lastSyncAt = safeNumber(value, 0);
  return homeState.lastSyncAt;
}

/* =========================================================
   PATCHERS
========================================================= */

export function patchDashboard(patch = {}) {
  homeState.dashboard = {
    ...safeObject(homeState.dashboard),
    ...safeObject(patch),
  };

  return homeState.dashboard;
}

export function patchSummary(patch = {}) {
  homeState.summary = {
    ...safeObject(homeState.summary),
    ...safeObject(patch),
  };

  return homeState.summary;
}

export function replaceHomeSnapshot({
  dashboard = {},
  widgets = [],
  summary = {},
  recent = [],
  health = null,
  requestId = "",
  lastSyncAt = 0,
} = {}) {
  setDashboard(dashboard);
  setWidgets(widgets);
  setSummary(summary);
  setRecent(recent);
  setHealth(health);
  setRequestId(requestId);
  setLastSyncAt(lastSyncAt);

  return {
    dashboard: getDashboard(),
    widgets: getWidgets(),
    summary: getSummary(),
    recent: getRecent(),
    health: getHealth(),
    requestId: homeState.requestId,
    lastSyncAt: homeState.lastSyncAt,
  };
}

/* =========================================================
   SELECTION HELPERS
========================================================= */

export function getSelectedWidget() {
  const selectedId = safeText(homeState.selectedWidgetId, "");

  if (!selectedId) return null;

  return (
    safeArray(homeState.widgets).find(
      (item) =>
        safeText(item?.widgetId, "") === selectedId
    ) || null
  );
}

export function clearSelection() {
  homeState.selectedWidgetId = "";
  homeState.openingWidgetId = "";

  return {
    selectedWidgetId: homeState.selectedWidgetId,
    openingWidgetId: homeState.openingWidgetId,
  };
}

/* =========================================================
   CACHE HELPERS
========================================================= */

export function getCachePayload() {
  return {
    savedAt: Date.now(),
    dashboard: getDashboard(),
    widgets: getWidgets(),
    summary: getSummary(),
    recent: getRecent(),
    health: getHealth(),
    widgetsCount: homeState.widgetsCount,
    recentCount: homeState.recentCount,
    lastSyncAt: homeState.lastSyncAt,
    requestId: homeState.requestId,
    page: homeState.page,
    pageSize: homeState.pageSize,
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

export function getHomeStateSnapshot() {
  const dashboard = normalizeDashboardState(homeState.dashboard);
  const widgets = normalizeWidgetsState(homeState.widgets);
  const summary = normalizeSummaryState(homeState.summary);
  const recent = normalizeRecentState(homeState.recent);
  const health = firstDefined(homeState.health, null);

  return {
    hydrated: homeState.hydrated,
    loading: homeState.loading,
    refreshing: homeState.refreshing,
    loaded: homeState.loaded,

    openingWidgetId: homeState.openingWidgetId,
    selectedWidgetId: homeState.selectedWidgetId,

    error: homeState.error,

    hasDashboard: Boolean(Object.keys(dashboard).length),
    widgetsCount: widgets.length,
    recentCount: recent.length,
    summaryKeys: Object.keys(summary).length,

    hasHealth: Boolean(health),
    healthStatus: safeText(health?.status, ""),
    healthService: safeText(health?.service, ""),

    lastSyncAt: homeState.lastSyncAt,
    requestId: homeState.requestId,

    page: homeState.page,
    pageSize: homeState.pageSize,

    hasInflight: Boolean(inflightLoad),

    dashboardPreview: {
      updatedAt: safeText(
        firstDefined(
          dashboard.updatedAt,
          dashboard.lastUpdate,
          dashboard.generatedAt
        ),
        ""
      ),
      rawKeys: Object.keys(safeObject(dashboard.raw || dashboard)).length,
    },

    summaryPreview: {
      ...summary,
    },

    selectedWidgetPreview: getSelectedWidget()
      ? {
          widgetId: safeText(getSelectedWidget()?.widgetId, ""),
          title: safeText(getSelectedWidget()?.title, ""),
          type: safeText(getSelectedWidget()?.type, ""),
          status: safeText(getSelectedWidget()?.status, ""),
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
  homeState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

  resetHomeState,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setOpeningWidgetId,
  setSelectedWidgetId,

  setPage,
  setPageSize,

  setDashboard,
  getDashboard,
  clearDashboard,

  setWidgets,
  getWidgets,
  clearWidgets,

  setSummary,
  getSummary,
  clearSummary,

  setRecent,
  getRecent,
  clearRecent,

  setHealth,
  getHealth,
  clearHealth,

  setWidgetsCount,
  setRecentCount,
  setRequestId,

  setError,
  clearError,
  setLastSyncAt,

  patchDashboard,
  patchSummary,
  replaceHomeSnapshot,

  getSelectedWidget,
  clearSelection,

  getCachePayload,
  isCacheFresh,
  getHomeStateSnapshot,
};
