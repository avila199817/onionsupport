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
   - paginación local de widgets
   - snapshot dashboard
   - persistencia cache localStorage segura
   - compatibilidad View / API / Actions / Modal

   HARDENING PRO:
   - setters robustos
   - no loading infinito
   - snapshots sin referencias vivas
   - cache helpers completos
   - selección por widgetId/id/key/slug/code
   - paginación estable
   - debug snapshot útil
========================================================= */

export const CACHE_KEY = "home.cache";
export const CACHE_VERSION = 1;
export const CACHE_TTL = 1000 * 60 * 3; // 3 min
export const DEFAULT_PAGE_SIZE = 6;

/* =========================================================
   SAFE
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNumber(value, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
      ].includes(key)
    ) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function firstDefined(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null
    ) {
      return value;
    }
  }

  return null;
}

function firstText(...values) {
  for (const value of values) {
    const text = safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

function safeClone(value) {
  if (value === undefined) {
    return undefined;
  }

  try {
    if (
      typeof structuredClone === "function"
    ) {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return value;
  }
}

function now() {
  return Date.now();
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

    cacheRestoredAt: 0,
    cacheSavedAt: 0,
  };
}

/* =========================================================
   STATE
========================================================= */

export const homeState = createInitialHomeState();

let inflightLoad = null;

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeHealthState(value = null) {
  if (!value) {
    return null;
  }

  const item = safeObject(value);
  const base = createDefaultHealthState();

  return {
    ...base,
    ...safeClone(item),

    ok: safeBoolean(
      item.ok,
      base.ok
    ),

    service: safeText(
      item.service,
      base.service
    ),

    status: safeText(
      firstDefined(
        item.status,
        item.state
      ),
      base.status
    ),

    timestamp: safeText(
      firstDefined(
        item.timestamp,
        item.time,
        item.date
      ),
      base.timestamp
    ),
  };
}

function normalizeDashboardState(value = {}) {
  return safeClone(
    safeObject(value)
  );
}

function normalizeSummaryState(value = {}) {
  return safeClone(
    safeObject(value)
  );
}

function normalizeWidgetsState(value = []) {
  return safeArray(value).map(
    (item) => safeClone(item)
  );
}

function normalizeRecentState(value = []) {
  return safeArray(value).map(
    (item) => safeClone(item)
  );
}

function normalizePage(value = 1) {
  return Math.max(
    1,
    safeNumber(value, 1)
  );
}

function normalizePageSize(value = DEFAULT_PAGE_SIZE) {
  return Math.max(
    1,
    safeNumber(
      value,
      DEFAULT_PAGE_SIZE
    )
  );
}

function getWidgetIdentity(item = {}) {
  const raw = safeObject(item);

  return firstText(
    raw.widgetId,
    raw.id,
    raw.key,
    raw.slug,
    raw.code,
    raw.uuid,
    raw._id,
    raw.raw?.widgetId,
    raw.raw?.id,
    raw.raw?.key,
    raw.raw?.slug,
    raw.raw?.code,
    raw.raw?.uuid,
    raw.raw?._id
  );
}

function matchesWidgetId(item = {}, widgetId = "") {
  const target = safeText(widgetId, "");

  if (!target) {
    return false;
  }

  return getWidgetIdentity(item) === target;
}

/* =========================================================
   INFLIGHT
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

export function hasInflightLoad() {
  return Boolean(inflightLoad);
}

/* =========================================================
   RESET
========================================================= */

export function resetHomeState() {
  const next = createInitialHomeState();

  Object.keys(homeState).forEach((key) => {
    delete homeState[key];
  });

  Object.assign(homeState, next);

  inflightLoad = null;

  return homeState;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(value) {
  homeState.loading = Boolean(value);

  if (homeState.loading) {
    homeState.error = "";
  }

  return homeState.loading;
}

export function setRefreshing(value) {
  homeState.refreshing = Boolean(value);

  if (homeState.refreshing) {
    homeState.error = "";
  }

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
  homeState.page = normalizePage(value);
  return homeState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  homeState.pageSize = normalizePageSize(value);

  const pagination = getPaginationState();

  if (homeState.page > pagination.totalPages) {
    homeState.page = pagination.totalPages;
  }

  return homeState.pageSize;
}

export function getPaginationState() {
  const total = safeArray(homeState.widgets).length;
  const pageSize = normalizePageSize(homeState.pageSize);

  const totalPages = Math.max(
    1,
    Math.ceil(total / pageSize)
  );

  const page = Math.min(
    Math.max(
      1,
      normalizePage(homeState.page)
    ),
    totalPages
  );

  const start =
    (page - 1) * pageSize;

  const end =
    start + pageSize;

  return {
    page,
    pageSize,
    total,
    totalPages,

    hasPrev: page > 1,
    hasNext: page < totalPages,

    prevPage:
      page > 1
        ? page - 1
        : null,

    nextPage:
      page < totalPages
        ? page + 1
        : null,

    from:
      total === 0
        ? 0
        : start + 1,

    to: Math.min(end, total),

    start,
    end,
  };
}

export function getPageWidgets() {
  const {
    start,
    end,
  } = getPaginationState();

  return getWidgets().slice(
    start,
    end
  );
}

export function goToPage(value = 1) {
  const pagination = getPaginationState();

  homeState.page = Math.min(
    Math.max(
      1,
      normalizePage(value)
    ),
    pagination.totalPages
  );

  return homeState.page;
}

export function goPrevPage() {
  const pagination = getPaginationState();

  if (!pagination.hasPrev) {
    return homeState.page;
  }

  homeState.page = pagination.page - 1;

  return homeState.page;
}

export function goNextPage() {
  const pagination = getPaginationState();

  if (!pagination.hasNext) {
    return homeState.page;
  }

  homeState.page = pagination.page + 1;

  return homeState.page;
}

/* =========================================================
   DATA
========================================================= */

export function setDashboard(value = {}) {
  const dashboard = normalizeDashboardState(value);

  homeState.dashboard = dashboard;
  homeState.loaded = true;
  homeState.error = "";

  return getDashboard();
}

export function getDashboard() {
  return normalizeDashboardState(
    homeState.dashboard
  );
}

export function clearDashboard() {
  homeState.dashboard = {};
  return getDashboard();
}

export function setWidgets(items = []) {
  const list = normalizeWidgetsState(items);

  homeState.widgets = list;
  homeState.widgetsCount = list.length;
  homeState.loaded = true;
  homeState.error = "";

  const pagination = getPaginationState();

  if (homeState.page > pagination.totalPages) {
    homeState.page = pagination.totalPages;
  }

  return getWidgets();
}

export function getWidgets() {
  return normalizeWidgetsState(
    homeState.widgets
  );
}

export function clearWidgets() {
  homeState.widgets = [];
  homeState.widgetsCount = 0;
  homeState.page = 1;

  return getWidgets();
}

export function setSummary(value = {}) {
  homeState.summary = normalizeSummaryState(value);
  return getSummary();
}

export function getSummary() {
  return normalizeSummaryState(
    homeState.summary
  );
}

export function clearSummary() {
  homeState.summary = {};
  return getSummary();
}

export function setRecent(items = []) {
  const list = normalizeRecentState(items);

  homeState.recent = list;
  homeState.recentCount = list.length;

  return getRecent();
}

export function getRecent() {
  return normalizeRecentState(
    homeState.recent
  );
}

export function clearRecent() {
  homeState.recent = [];
  homeState.recentCount = 0;

  return getRecent();
}

export function setHealth(value = null) {
  homeState.health = normalizeHealthState(value);
  return getHealth();
}

export function getHealth() {
  return homeState.health
    ? normalizeHealthState(homeState.health)
    : null;
}

export function clearHealth() {
  homeState.health = null;
  return getHealth();
}

/* =========================================================
   COUNTS / META
========================================================= */

export function setWidgetsCount(value = 0) {
  homeState.widgetsCount = Math.max(
    0,
    safeNumber(value, 0)
  );

  return homeState.widgetsCount;
}

export function setRecentCount(value = 0) {
  homeState.recentCount = Math.max(
    0,
    safeNumber(value, 0)
  );

  return homeState.recentCount;
}

export function setRequestId(value = "") {
  homeState.requestId = safeText(value, "");
  return homeState.requestId;
}

export function setError(value = null) {
  const message =
    typeof value === "object" && value
      ? safeText(
          firstDefined(
            value.message,
            value.error,
            value.detail,
            value.code
          ),
          "Error inesperado."
        )
      : safeText(value, "");

  homeState.error = message;

  if (message) {
    homeState.loading = false;
    homeState.refreshing = false;
    homeState.loaded = true;
  }

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
    ...safeClone(safeObject(patch)),
  };

  homeState.loaded = true;

  return getDashboard();
}

export function patchSummary(patch = {}) {
  homeState.summary = {
    ...safeObject(homeState.summary),
    ...safeClone(safeObject(patch)),
  };

  return getSummary();
}

export function patchWidget(widgetId = "", patch = {}) {
  const id = safeText(widgetId, "");

  if (!id) {
    return null;
  }

  const list = safeArray(homeState.widgets);
  const index = list.findIndex((item) =>
    matchesWidgetId(item, id)
  );

  if (index < 0) {
    return null;
  }

  const nextItem = {
    ...safeObject(list[index]),
    ...safeClone(safeObject(patch)),
  };

  homeState.widgets = list.map((item, itemIndex) =>
    itemIndex === index
      ? nextItem
      : item
  );

  return safeClone(nextItem);
}

export function upsertWidget(item = {}) {
  const nextItem = safeClone(
    safeObject(item)
  );

  const id = getWidgetIdentity(nextItem);

  if (!id) {
    return null;
  }

  const list = safeArray(homeState.widgets);
  const index = list.findIndex((current) =>
    matchesWidgetId(current, id)
  );

  if (index >= 0) {
    list[index] = {
      ...safeObject(list[index]),
      ...nextItem,
    };
  } else {
    list.push(nextItem);
  }

  setWidgets(list);

  return safeClone(
    index >= 0
      ? list[index]
      : nextItem
  );
}

export function removeWidget(widgetId = "") {
  const id = safeText(widgetId, "");

  if (!id) {
    return false;
  }

  const before = safeArray(homeState.widgets).length;

  homeState.widgets = safeArray(homeState.widgets).filter(
    (item) => !matchesWidgetId(item, id)
  );

  homeState.widgetsCount = homeState.widgets.length;

  if (homeState.selectedWidgetId === id) {
    homeState.selectedWidgetId = "";
  }

  if (homeState.openingWidgetId === id) {
    homeState.openingWidgetId = "";
  }

  const pagination = getPaginationState();

  if (homeState.page > pagination.totalPages) {
    homeState.page = pagination.totalPages;
  }

  return homeState.widgets.length !== before;
}

export function replaceHomeSnapshot({
  dashboard = {},
  widgets = [],
  summary = {},
  recent = [],
  health = null,
  requestId = "",
  lastSyncAt = 0,
  page = null,
  pageSize = null,
  hydrated = true,
  loaded = true,
} = {}) {
  setDashboard(dashboard);
  setWidgets(widgets);
  setSummary(summary);
  setRecent(recent);
  setHealth(health);
  setRequestId(requestId);
  setLastSyncAt(lastSyncAt || now());

  if (pageSize !== null) {
    setPageSize(pageSize);
  }

  if (page !== null) {
    setPage(page);
  }

  setHydrated(hydrated);
  setLoaded(loaded);
  setLoading(false);
  setRefreshing(false);
  clearError();

  return getHomeSnapshot();
}

/* =========================================================
   SELECTION HELPERS
========================================================= */

export function getWidgetById(widgetId = "") {
  const id = safeText(widgetId, "");

  if (!id) {
    return null;
  }

  const item =
    safeArray(homeState.widgets).find((entry) =>
      matchesWidgetId(entry, id)
    ) || null;

  return item
    ? safeClone(item)
    : null;
}

export function getSelectedWidget() {
  return getWidgetById(
    homeState.selectedWidgetId
  );
}

export function selectWidget(widgetId = "") {
  const id = safeText(widgetId, "");

  homeState.selectedWidgetId = id;

  return getSelectedWidget();
}

export function markOpeningWidget(widgetId = "") {
  homeState.openingWidgetId = safeText(widgetId, "");
  return homeState.openingWidgetId;
}

export function clearOpeningWidget() {
  homeState.openingWidgetId = "";
  return homeState.openingWidgetId;
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
    version: CACHE_VERSION,
    savedAt: now(),

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

  return now() - ts < CACHE_TTL;
}

export function readHomeCache() {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      return null;
    }

    if (
      Number(parsed.version || 0) !== CACHE_VERSION
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeHomeCache(payload = null) {
  if (!isBrowser()) {
    return false;
  }

  try {
    const data =
      payload && typeof payload === "object"
        ? payload
        : getCachePayload();

    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify(data)
    );

    homeState.cacheSavedAt = safeNumber(
      data.savedAt,
      now()
    );

    return true;
  } catch {
    return false;
  }
}

export function clearHomeCache() {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.localStorage.removeItem(CACHE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function restoreHomeStateFromCache({
  force = false,
} = {}) {
  const cache = readHomeCache();

  if (!cache) {
    return false;
  }

  if (
    !force &&
    !isCacheFresh(cache.savedAt)
  ) {
    return false;
  }

  replaceHomeSnapshot({
    dashboard: cache.dashboard,
    widgets: cache.widgets,
    summary: cache.summary,
    recent: cache.recent,
    health: cache.health,
    requestId: cache.requestId,
    lastSyncAt: cache.lastSyncAt,
    page: cache.page,
    pageSize: cache.pageSize,
    hydrated: true,
    loaded: true,
  });

  homeState.cacheRestoredAt = now();
  homeState.cacheSavedAt = safeNumber(
    cache.savedAt,
    0
  );

  return true;
}

export function persistHomeStateToCache() {
  return writeHomeCache(
    getCachePayload()
  );
}

/* =========================================================
   SNAPSHOTS
========================================================= */

export function getHomeSnapshot() {
  return {
    hydrated: homeState.hydrated,
    loading: homeState.loading,
    refreshing: homeState.refreshing,
    loaded: homeState.loaded,

    openingWidgetId: homeState.openingWidgetId,
    selectedWidgetId: homeState.selectedWidgetId,

    error: homeState.error,

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

    cacheRestoredAt: homeState.cacheRestoredAt,
    cacheSavedAt: homeState.cacheSavedAt,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getHomeStateSnapshot() {
  const dashboard = getDashboard();
  const widgets = getWidgets();
  const summary = getSummary();
  const recent = getRecent();
  const health = getHealth();
  const pagination = getPaginationState();
  const selectedWidget = getSelectedWidget();

  return {
    hydrated: homeState.hydrated,
    loading: homeState.loading,
    refreshing: homeState.refreshing,
    loaded: homeState.loaded,

    openingWidgetId: homeState.openingWidgetId,
    selectedWidgetId: homeState.selectedWidgetId,

    error: homeState.error,

    hasDashboard: Boolean(
      Object.keys(dashboard).length
    ),

    widgetsCount: widgets.length,
    recentCount: recent.length,
    summaryKeys: Object.keys(summary).length,

    hasHealth: Boolean(health),
    healthStatus: safeText(health?.status, ""),
    healthService: safeText(health?.service, ""),
    healthOk: Boolean(health?.ok),

    lastSyncAt: homeState.lastSyncAt,
    requestId: homeState.requestId,

    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
    hasPrevPage: pagination.hasPrev,
    hasNextPage: pagination.hasNext,

    hasInflight: Boolean(inflightLoad),

    cache: {
      key: CACHE_KEY,
      version: CACHE_VERSION,
      ttl: CACHE_TTL,
      restoredAt: homeState.cacheRestoredAt,
      savedAt: homeState.cacheSavedAt,
      fresh: isCacheFresh(homeState.cacheSavedAt),
    },

    dashboardPreview: {
      updatedAt: safeText(
        firstDefined(
          dashboard.updatedAt,
          dashboard.lastUpdate,
          dashboard.generatedAt,
          dashboard.createdAt
        ),
        ""
      ),

      rawKeys: Object.keys(
        safeObject(
          dashboard.raw || dashboard
        )
      ).length,
    },

    summaryPreview: {
      ...summary,
    },

    selectedWidgetPreview: selectedWidget
      ? {
          widgetId: safeText(
            getWidgetIdentity(selectedWidget),
            ""
          ),
          title: safeText(selectedWidget.title, ""),
          type: safeText(selectedWidget.type, ""),
          status: safeText(selectedWidget.status, ""),
        }
      : null,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  CACHE_KEY,
  CACHE_VERSION,
  CACHE_TTL,
  DEFAULT_PAGE_SIZE,

  homeState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,
  hasInflightLoad,

  resetHomeState,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setOpeningWidgetId,
  setSelectedWidgetId,

  setPage,
  setPageSize,
  getPaginationState,
  getPageWidgets,
  goToPage,
  goPrevPage,
  goNextPage,

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
  patchWidget,
  upsertWidget,
  removeWidget,

  replaceHomeSnapshot,

  getWidgetById,
  getSelectedWidget,
  selectWidget,
  markOpeningWidget,
  clearOpeningWidget,
  clearSelection,

  getCachePayload,
  isCacheFresh,
  readHomeCache,
  writeHomeCache,
  clearHomeCache,
  restoreHomeStateFromCache,
  persistHomeStateToCache,

  getHomeSnapshot,
  getHomeStateSnapshot,
};
