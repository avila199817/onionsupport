/* =========================================================
   Onion SPA - Home Store
   Archivo: src/views/home/home.store.js

   FINAL PRO SYSTEM · STORE LAYER · 10/10

   RESPONSABILIDADES:
   - encapsular Store global
   - crear entities.home si no existe
   - leer / escribir snapshot dashboard home
   - helpers para API / View / Actions / Modal
   - búsquedas robustas por widgetId/id/key/slug/code/uuid/_id
   - replace / append / prepend / update / patch / upsert widgets
   - deduplicación segura
   - ordenación consistente por updatedAt
   - persistencia estable para modal / dashboard
   - exponer summary / recent / dashboard de forma consistente

   HARDENING PRO:
   - no depende de Store.actions.setCollection("home")
   - evita duplicados
   - no muta colecciones originales
   - getters devuelven clones
   - tolera Store no inicializado
   - tolera entities.home ausente
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_HOME_ROOT_PATH = "entities.home";

const STORE_WIDGETS_PATH = "entities.home.widgets";
const STORE_DASHBOARD_PATH = "entities.home.dashboard";
const STORE_SUMMARY_PATH = "entities.home.summary";
const STORE_RECENT_PATH = "entities.home.recent";
const STORE_META_PATH = "entities.home.meta";

const DEFAULT_HOME_ROOT = Object.freeze({
  dashboard: {},
  widgets: [],
  summary: {},
  recent: [],
  meta: {
    requestId: "",
    lastSyncAt: 0,
  },
});

/* =========================================================
   SAFE
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
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

function safeId(value) {
  return safeText(value, "");
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

function safeTimestamp(value, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const n = Number(value);

  if (Number.isFinite(n)) {
    return n;
  }

  const date = new Date(value);
  const ts = date.getTime();

  return Number.isFinite(ts)
    ? ts
    : fallback;
}

function hasKeys(value) {
  return (
    isObject(value) &&
    Object.keys(value).length > 0
  );
}

function now() {
  return Date.now();
}

/* =========================================================
   STORE ACCESS
========================================================= */

function canUseStore() {
  return Boolean(
    Store &&
      typeof Store.get === "function" &&
      typeof Store.set === "function"
  );
}

function rawStoreGet(path, fallback = undefined) {
  try {
    if (typeof Store?.get === "function") {
      const value = Store.get(path);

      return value === undefined
        ? fallback
        : value;
    }
  } catch {}

  return fallback;
}

function rawStoreSet(path, value) {
  try {
    if (typeof Store?.set === "function") {
      Store.set(path, safeClone(value));
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   HOME ROOT
========================================================= */

function normalizeHomeMeta(meta = {}) {
  const item = safeObject(meta);

  return {
    requestId: safeText(item.requestId, ""),
    lastSyncAt: safeTimestamp(item.lastSyncAt, 0),
  };
}

function normalizeHomeRoot(root = {}) {
  const item = safeObject(root);

  return {
    dashboard: safeClone(
      safeObject(item.dashboard)
    ),

    widgets: normalizeWidgetsCollection(
      item.widgets
    ),

    summary: safeClone(
      safeObject(item.summary)
    ),

    recent: safeArray(item.recent).map(
      (row) => safeClone(row)
    ),

    meta: normalizeHomeMeta(item.meta),
  };
}

function ensureHomeRoot() {
  if (!canUseStore()) {
    return false;
  }

  const current = rawStoreGet(
    STORE_HOME_ROOT_PATH,
    null
  );

  const valid =
    isObject(current) &&
    "dashboard" in current &&
    "widgets" in current &&
    "summary" in current &&
    "recent" in current &&
    "meta" in current;

  if (valid) {
    return true;
  }

  const next = normalizeHomeRoot({
    ...DEFAULT_HOME_ROOT,
    ...safeObject(current),
  });

  return rawStoreSet(
    STORE_HOME_ROOT_PATH,
    next
  );
}

function getHomeRoot() {
  ensureHomeRoot();

  return normalizeHomeRoot(
    rawStoreGet(
      STORE_HOME_ROOT_PATH,
      DEFAULT_HOME_ROOT
    )
  );
}

function writeHomeRoot(root = {}) {
  const current = getHomeRoot();

  const next = normalizeHomeRoot({
    ...current,
    ...safeObject(root),
  });

  rawStoreSet(
    STORE_HOME_ROOT_PATH,
    next
  );

  return getHomeRoot();
}

function readStoreValue(path, fallback = null) {
  ensureHomeRoot();

  const value = rawStoreGet(path, fallback);

  if (Array.isArray(fallback)) {
    return safeArray(value).map(
      (item) => safeClone(item)
    );
  }

  if (isObject(fallback)) {
    return safeClone(
      safeObject(value)
    );
  }

  return value ?? fallback;
}

function writeStoreValue(path, value) {
  ensureHomeRoot();

  rawStoreSet(path, value);

  return safeClone(value);
}

/* =========================================================
   ID HELPERS
========================================================= */

export function getWidgetId(item = {}) {
  const row = safeObject(item);

  return safeId(
    row.widgetId ||
      row.id ||
      row.key ||
      row.slug ||
      row.code ||
      row.uuid ||
      row._id ||
      row.raw?.widgetId ||
      row.raw?.id ||
      row.raw?.key ||
      row.raw?.slug ||
      row.raw?.code ||
      row.raw?.uuid ||
      row.raw?._id
  );
}

function normalizeWidgetId(value = "") {
  return safeId(value);
}

function isSameWidgetId(item = {}, id = "") {
  const target = normalizeWidgetId(id);

  if (!target) {
    return false;
  }

  return getWidgetId(item) === target;
}

/* =========================================================
   TIMESTAMP HELPERS
========================================================= */

function getUpdatedTimestamp(item = {}) {
  const row = safeObject(item);

  return safeTimestamp(
    row.updatedAtMs ??
      row.updatedAtTs ??
      row.meta?.timestampMs ??
      row.meta?.updatedAtMs ??
      row.updatedAt ??
      row.lastUpdate ??
      row.modifiedAt ??
      row.createdAt ??
      row.raw?.updatedAt ??
      row.raw?.lastUpdate ??
      0,
    0
  );
}

function getCreatedTimestamp(item = {}) {
  const row = safeObject(item);

  return safeTimestamp(
    row.createdAtMs ??
      row.createdAtTs ??
      row.createdAt ??
      row.raw?.createdAt ??
      0,
    0
  );
}

/* =========================================================
   NORMALIZE WIDGETS
========================================================= */

function normalizeWidget(item = {}) {
  const row = safeClone(
    safeObject(item)
  );

  const widgetId = getWidgetId(row);

  return {
    ...row,
    widgetId:
      safeText(row.widgetId, "") ||
      widgetId,
  };
}

function mergeHomeWidget(base = {}, patch = {}) {
  const current = normalizeWidget(base);
  const incoming = normalizeWidget(patch);

  const currentTs = getUpdatedTimestamp(current);
  const incomingTs = getUpdatedTimestamp(incoming);

  /*
    Si el incoming es más nuevo, sus campos mandan.
    Si el actual parece más nuevo, preservamos el actual.
  */
  if (incomingTs >= currentTs) {
    return normalizeWidget({
      ...current,
      ...incoming,
    });
  }

  return normalizeWidget({
    ...incoming,
    ...current,
  });
}

function dedupeHomeWidgets(items = []) {
  const list = safeArray(items);
  const map = new Map();
  const anonymous = [];

  for (const rawItem of list) {
    const item = normalizeWidget(rawItem);
    const id = getWidgetId(item);

    if (!id) {
      if (hasKeys(item)) {
        anonymous.push(item);
      }

      continue;
    }

    if (!map.has(id)) {
      map.set(id, item);
      continue;
    }

    map.set(
      id,
      mergeHomeWidget(
        map.get(id),
        item
      )
    );
  }

  return [
    ...map.values(),
    ...anonymous,
  ];
}

function normalizeWidgetsCollection(items = []) {
  return sortHomeWidgetsByUpdatedDesc(
    dedupeHomeWidgets(items)
  );
}

/* =========================================================
   DASHBOARD SNAPSHOT
========================================================= */

function getDashboardWidgets(snapshot = {}) {
  const data = safeObject(snapshot);

  return normalizeWidgetsCollection(
    data.widgets ||
      data.cards ||
      data.kpis ||
      data.items ||
      []
  );
}

function getDashboardSummary(snapshot = {}) {
  const data = safeObject(snapshot);

  return safeObject(
    data.summary ||
      data.stats ||
      data.metrics ||
      data.totals ||
      {}
  );
}

function getDashboardRecent(snapshot = {}) {
  const data = safeObject(snapshot);

  return safeArray(
    data.recent ||
      data.recentActivity ||
      data.activity ||
      data.timeline ||
      []
  ).map((item) => safeClone(item));
}

function normalizeDashboardSnapshot(snapshot = {}) {
  const data = safeClone(
    safeObject(snapshot)
  );

  const summary = getDashboardSummary(data);
  const widgets = getDashboardWidgets(data);
  const recent = getDashboardRecent(data);

  return {
    ...data,
    summary,
    widgets,
    recent,

    requestId: safeText(
      data.requestId ||
        data.meta?.requestId ||
        "",
      ""
    ),

    lastSyncAt: safeTimestamp(
      data.lastSyncAt ||
        data.meta?.lastSyncAt ||
        data.updatedAt ||
        data.generatedAt ||
        0,
      0
    ),
  };
}

function buildSnapshot({
  dashboard = {},
  widgets = null,
  summary = null,
  recent = null,
  requestId = "",
  lastSyncAt = 0,
} = {}) {
  const normalizedDashboard =
    normalizeDashboardSnapshot(dashboard);

  const finalWidgets =
    Array.isArray(widgets)
      ? normalizeWidgetsCollection(widgets)
      : normalizeWidgetsCollection(
          normalizedDashboard.widgets
        );

  const finalSummary =
    summary && hasKeys(summary)
      ? safeClone(safeObject(summary))
      : safeClone(
          safeObject(normalizedDashboard.summary)
        );

  const finalRecent =
    Array.isArray(recent)
      ? safeArray(recent).map((item) =>
          safeClone(item)
        )
      : safeArray(normalizedDashboard.recent).map(
          (item) => safeClone(item)
        );

  const finalRequestId = safeText(
    requestId ||
      normalizedDashboard.requestId,
    ""
  );

  const finalLastSyncAt = safeTimestamp(
    lastSyncAt ||
      normalizedDashboard.lastSyncAt ||
      now(),
    now()
  );

  const finalDashboard = normalizeDashboardSnapshot({
    ...normalizedDashboard,
    summary: finalSummary,
    widgets: finalWidgets,
    recent: finalRecent,
    requestId: finalRequestId,
    lastSyncAt: finalLastSyncAt,
  });

  const meta = normalizeHomeMeta({
    requestId: finalRequestId,
    lastSyncAt: finalLastSyncAt,
  });

  return {
    dashboard: finalDashboard,
    widgets: finalWidgets,
    summary: finalSummary,
    recent: finalRecent,
    meta,
  };
}

function writeSnapshot(snapshot = {}) {
  const normalized = buildSnapshot(snapshot);

  writeHomeRoot(normalized);

  return getHomeDashboardStore();
}

/* =========================================================
   GETTERS · DASHBOARD
========================================================= */

export function getHomeDashboardStore() {
  const root = getHomeRoot();

  const dashboard = normalizeDashboardSnapshot(
    readStoreValue(
      STORE_DASHBOARD_PATH,
      root.dashboard
    )
  );

  const widgets = normalizeWidgetsCollection(
    readStoreValue(
      STORE_WIDGETS_PATH,
      root.widgets
    )
  );

  const summary = safeObject(
    readStoreValue(
      STORE_SUMMARY_PATH,
      root.summary
    )
  );

  const recent = safeArray(
    readStoreValue(
      STORE_RECENT_PATH,
      root.recent
    )
  );

  const meta = normalizeHomeMeta(
    readStoreValue(
      STORE_META_PATH,
      root.meta
    )
  );

  const finalWidgets =
    widgets.length
      ? widgets
      : normalizeWidgetsCollection(
          dashboard.widgets
        );

  const finalSummary =
    hasKeys(summary)
      ? summary
      : safeObject(dashboard.summary);

  const finalRecent =
    recent.length
      ? recent
      : safeArray(dashboard.recent);

  return normalizeDashboardSnapshot({
    ...dashboard,
    summary: finalSummary,
    widgets: finalWidgets,
    recent: finalRecent,

    requestId: safeText(
      dashboard.requestId ||
        meta.requestId,
      ""
    ),

    lastSyncAt: safeTimestamp(
      dashboard.lastSyncAt ||
        meta.lastSyncAt,
      0
    ),
  });
}

export function getHomeSummaryStore() {
  const summary = safeObject(
    readStoreValue(
      STORE_SUMMARY_PATH,
      {}
    )
  );

  if (hasKeys(summary)) {
    return safeClone(summary);
  }

  return safeClone(
    safeObject(
      getHomeDashboardStore().summary
    )
  );
}

export function getHomeRecentStore() {
  const recent = safeArray(
    readStoreValue(
      STORE_RECENT_PATH,
      []
    )
  );

  if (recent.length) {
    return recent.map((item) =>
      safeClone(item)
    );
  }

  return safeArray(
    getHomeDashboardStore().recent
  ).map((item) => safeClone(item));
}

export function getHomeMetaStore() {
  return normalizeHomeMeta(
    readStoreValue(
      STORE_META_PATH,
      {}
    )
  );
}

/* =========================================================
   GETTERS · WIDGETS
========================================================= */

export function getHomeWidgets() {
  const widgets = normalizeWidgetsCollection(
    readStoreValue(
      STORE_WIDGETS_PATH,
      []
    )
  );

  if (widgets.length) {
    return widgets;
  }

  return normalizeWidgetsCollection(
    getHomeDashboardStore().widgets
  );
}

export function getSortedHomeWidgetsStore() {
  return sortHomeWidgetsByUpdatedDesc(
    getHomeWidgets()
  );
}

export function getHomeSortedCollectionStore() {
  return getSortedHomeWidgetsStore();
}

export function getHomeWidgetById(id = "") {
  const target = normalizeWidgetId(id);

  if (!target) {
    return null;
  }

  const item =
    getHomeWidgets().find((row) =>
      isSameWidgetId(row, target)
    ) || null;

  return item
    ? safeClone(item)
    : null;
}

export function getHomeWidgetByIdStore(id = "") {
  return getHomeWidgetById(id);
}

export function hasHomeWidgets() {
  return getHomeWidgets().length > 0;
}

export function getHomeWidgetsCount() {
  return getHomeWidgets().length;
}

/* =========================================================
   SETTERS · DASHBOARD
========================================================= */

export function setHomeDashboardStore(snapshot = {}) {
  return writeSnapshot({
    dashboard: snapshot,
  });
}

export function replaceHomeStore({
  dashboard = {},
  widgets = [],
  summary = {},
  recent = [],
  requestId = "",
  lastSyncAt = 0,
} = {}) {
  return writeSnapshot({
    dashboard,
    widgets,
    summary,
    recent,
    requestId,
    lastSyncAt,
  });
}

export function clearHomeDashboardStore() {
  writeHomeRoot({
    dashboard: {},
    widgets: [],
    summary: {},
    recent: [],
    meta: {
      requestId: "",
      lastSyncAt: 0,
    },
  });

  return getHomeDashboardStore();
}

export function setHomeSummaryStore(summary = {}) {
  const root = getHomeRoot();
  const nextSummary = safeClone(
    safeObject(summary)
  );

  writeHomeRoot({
    ...root,
    summary: nextSummary,
    dashboard: normalizeDashboardSnapshot({
      ...root.dashboard,
      summary: nextSummary,
    }),
  });

  return getHomeSummaryStore();
}

export function setHomeRecentStore(items = []) {
  const root = getHomeRoot();

  const nextRecent = safeArray(items).map(
    (item) => safeClone(item)
  );

  writeHomeRoot({
    ...root,
    recent: nextRecent,
    dashboard: normalizeDashboardSnapshot({
      ...root.dashboard,
      recent: nextRecent,
    }),
  });

  return getHomeRecentStore();
}

export function setHomeMetaStore(meta = {}) {
  const root = getHomeRoot();
  const nextMeta = normalizeHomeMeta(meta);

  writeHomeRoot({
    ...root,
    meta: nextMeta,
    dashboard: normalizeDashboardSnapshot({
      ...root.dashboard,
      requestId: nextMeta.requestId,
      lastSyncAt: nextMeta.lastSyncAt,
    }),
  });

  return getHomeMetaStore();
}

/* =========================================================
   SETTERS · WIDGETS
========================================================= */

export function setHomeWidgets(items = []) {
  const root = getHomeRoot();

  const nextWidgets =
    normalizeWidgetsCollection(items);

  writeHomeRoot({
    ...root,
    widgets: nextWidgets,
    dashboard: normalizeDashboardSnapshot({
      ...root.dashboard,
      widgets: nextWidgets,
    }),
  });

  return getHomeWidgets();
}

export function replaceHomeWidgetsStore(items = []) {
  return setHomeWidgets(items);
}

export function clearHomeWidgets() {
  return setHomeWidgets([]);
}

export function appendHomeWidgetStore(item = null) {
  if (!item) {
    return getHomeWidgets();
  }

  return setHomeWidgets([
    ...getHomeWidgets(),
    normalizeWidget(item),
  ]);
}

export function prependHomeWidgetStore(item = null) {
  if (!item) {
    return getHomeWidgets();
  }

  return setHomeWidgets([
    normalizeWidget(item),
    ...getHomeWidgets(),
  ]);
}

export function updateHomeWidgetStore(id = "", patch = {}) {
  const target = normalizeWidgetId(id);

  if (!target) {
    return getHomeWidgets();
  }

  const current = getHomeWidgets();

  const next = current.map((item) =>
    isSameWidgetId(item, target)
      ? mergeHomeWidget(item, patch)
      : item
  );

  return setHomeWidgets(next);
}

export function patchHomeWidgetStore(id = "", patch = {}) {
  return updateHomeWidgetStore(id, patch);
}

/* =========================================================
   UPSERT
========================================================= */

export function upsertHomeWidgetStore(item = null) {
  if (!item) {
    return getHomeWidgets();
  }

  const incoming = normalizeWidget(item);
  const targetId = getWidgetId(incoming);
  const current = getHomeWidgets();

  if (!targetId) {
    return setHomeWidgets([
      incoming,
      ...current,
    ]);
  }

  const index = current.findIndex((row) =>
    isSameWidgetId(row, targetId)
  );

  if (index === -1) {
    return setHomeWidgets([
      incoming,
      ...current,
    ]);
  }

  const next = [...current];

  next[index] = mergeHomeWidget(
    next[index],
    incoming
  );

  return setHomeWidgets(next);
}

/* =========================================================
   REMOVE
========================================================= */

export function removeHomeWidgetStore(id = "") {
  const target = normalizeWidgetId(id);

  if (!target) {
    return getHomeWidgets();
  }

  const next = getHomeWidgets().filter(
    (item) => !isSameWidgetId(item, target)
  );

  return setHomeWidgets(next);
}

/* =========================================================
   SORT HELPERS
========================================================= */

export function sortHomeWidgetsByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getUpdatedTimestamp(a);
    const bTime = getUpdatedTimestamp(b);

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return getCreatedTimestamp(b) - getCreatedTimestamp(a);
  });
}

export function sortHomeWidgetsByCreatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getCreatedTimestamp(a);
    const bTime = getCreatedTimestamp(b);

    return bTime - aTime;
  });
}

/* =========================================================
   BULK HELPERS
========================================================= */

export function hydrateHomeStoreFromSnapshot(snapshot = {}) {
  return setHomeDashboardStore(snapshot);
}

export function getHomeStoreSnapshot() {
  const dashboard = getHomeDashboardStore();
  const widgets = getHomeWidgets();
  const summary = getHomeSummaryStore();
  const recent = getHomeRecentStore();
  const meta = getHomeMetaStore();

  return {
    dashboard,
    widgets,
    summary,
    recent,
    meta,

    hasDashboard:
      Object.keys(safeObject(dashboard)).length > 0,

    widgetsCount:
      widgets.length,

    recentCount:
      recent.length,

    summaryKeys:
      Object.keys(summary).length,

    requestId:
      meta.requestId,

    lastSyncAt:
      meta.lastSyncAt,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getHomeStoreDebugSnapshot() {
  return {
    rootPath: STORE_HOME_ROOT_PATH,

    paths: {
      widgets: STORE_WIDGETS_PATH,
      dashboard: STORE_DASHBOARD_PATH,
      summary: STORE_SUMMARY_PATH,
      recent: STORE_RECENT_PATH,
      meta: STORE_META_PATH,
    },

    canUseStore:
      canUseStore(),

    root:
      getHomeRoot(),

    snapshot:
      getHomeStoreSnapshot(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getHomeDashboardStore,
  getHomeSummaryStore,
  getHomeRecentStore,
  getHomeMetaStore,

  getHomeWidgets,
  getSortedHomeWidgetsStore,
  getHomeSortedCollectionStore,
  getHomeWidgetById,
  getHomeWidgetByIdStore,
  hasHomeWidgets,
  getHomeWidgetsCount,

  setHomeDashboardStore,
  replaceHomeStore,
  clearHomeDashboardStore,

  setHomeSummaryStore,
  setHomeRecentStore,
  setHomeMetaStore,

  setHomeWidgets,
  replaceHomeWidgetsStore,
  appendHomeWidgetStore,
  prependHomeWidgetStore,
  updateHomeWidgetStore,
  patchHomeWidgetStore,
  upsertHomeWidgetStore,
  removeHomeWidgetStore,
  clearHomeWidgets,

  hydrateHomeStoreFromSnapshot,
  getHomeStoreSnapshot,
  getHomeStoreDebugSnapshot,

  sortHomeWidgetsByUpdatedDesc,
  sortHomeWidgetsByCreatedDesc,

  getWidgetId,
};
