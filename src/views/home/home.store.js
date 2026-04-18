/* =========================================================
   Onion SPA - Home Store
   Archivo: src/views/home/home.store.js

   FINAL PRO SYSTEM · STORE LAYER · 10/10

   RESPONSABILIDADES:
   - encapsular Store global
   - leer / escribir snapshot dashboard home
   - helpers para API / View / Actions
   - búsquedas robustas por widgetId
   - replace / append / update / upsert widgets
   - deduplicación segura
   - persistencia estable para modal / dashboard
   - exponer summary / recent / dashboard de forma consistente

   HARDENING PRO:
   - añadido upsertHomeWidgetStore
   - normalización de ids
   - evita duplicados
   - no muta colecciones originales
   - ordenación consistente por updatedAt
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_WIDGETS_PATH = "entities.home.widgets";
const STORE_DASHBOARD_PATH = "entities.home.dashboard";
const STORE_SUMMARY_PATH = "entities.home.summary";
const STORE_RECENT_PATH = "entities.home.recent";
const STORE_META_PATH = "entities.home.meta";

const STORE_COLLECTION_KEY = "home";

/* =========================================================
   SAFE
========================================================= */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeId(value) {
  return safeText(value, "");
}

function safeTimestamp(value, fallback = 0) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    return n;
  }

  const date = new Date(value);
  const ts = date.getTime();

  return Number.isFinite(ts) ? ts : fallback;
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
      row.code
  );
}

function isSameWidgetId(item = {}, id = "") {
  const target = safeId(id);
  if (!target) return false;

  const row = safeObject(item);

  return (
    getWidgetId(row) === target ||
    safeId(row.id) === target ||
    safeId(row.widgetId) === target ||
    safeId(row.key) === target ||
    safeId(row.slug) === target ||
    safeId(row.code) === target
  );
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
      0,
    0
  );
}

/* =========================================================
   LOW LEVEL STORE ACCESS
========================================================= */

function readStoreValue(path, fallback = null) {
  try {
    if (typeof Store?.get === "function") {
      const value = Store.get(path);

      if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
        return safeObject(value);
      }

      if (Array.isArray(fallback)) {
        return safeArray(value);
      }

      return value ?? fallback;
    }
  } catch {}

  return fallback;
}

function writeStoreValue(path, value) {
  try {
    if (typeof Store?.set === "function") {
      Store.set(path, value);
      return value;
    }
  } catch {}

  return value;
}

/* =========================================================
   LEGACY / COLLECTION WRITE
========================================================= */

function writeHomeWidgetsCollection(items = []) {
  const list = safeArray(items);

  try {
    if (Store?.actions?.setCollection) {
      Store.actions.setCollection(STORE_COLLECTION_KEY, list);
    }
  } catch {}

  writeStoreValue(STORE_WIDGETS_PATH, list);

  return list;
}

/* =========================================================
   NORMALIZE COLLECTION
========================================================= */

function mergeHomeWidget(base = {}, patch = {}) {
  return {
    ...safeObject(base),
    ...safeObject(patch),
  };
}

function dedupeHomeWidgets(items = []) {
  const list = safeArray(items);
  const map = new Map();
  const anonymous = [];

  for (const rawItem of list) {
    const item = safeObject(rawItem);
    const id = getWidgetId(item);

    if (!id) {
      anonymous.push(item);
      continue;
    }

    if (!map.has(id)) {
      map.set(id, item);
      continue;
    }

    const current = map.get(id);
    map.set(id, mergeHomeWidget(current, item));
  }

  return [...map.values(), ...anonymous];
}

function normalizeWidgetsCollection(items = []) {
  return dedupeHomeWidgets(safeArray(items));
}

/* =========================================================
   DASHBOARD SNAPSHOT
========================================================= */

function normalizeDashboardSnapshot(snapshot = {}) {
  const data = safeObject(snapshot);

  return {
    ...data,
    summary: safeObject(data.summary),
    widgets: normalizeWidgetsCollection(data.widgets),
    recent: safeArray(data.recent),
  };
}

function normalizeMeta(meta = {}) {
  const item = safeObject(meta);

  return {
    requestId: safeText(item.requestId, ""),
    lastSyncAt: safeTimestamp(item.lastSyncAt, 0),
  };
}

/* =========================================================
   GETTERS · DASHBOARD
========================================================= */

export function getHomeDashboardStore() {
  const dashboard = normalizeDashboardSnapshot(
    readStoreValue(STORE_DASHBOARD_PATH, {})
  );

  const widgets = normalizeWidgetsCollection(
    readStoreValue(STORE_WIDGETS_PATH, [])
  );

  const summary = safeObject(
    readStoreValue(STORE_SUMMARY_PATH, {})
  );

  const recent = safeArray(
    readStoreValue(STORE_RECENT_PATH, [])
  );

  const meta = normalizeMeta(
    readStoreValue(STORE_META_PATH, {})
  );

  return {
    ...dashboard,
    summary: Object.keys(summary).length
      ? summary
      : safeObject(dashboard.summary),
    widgets: widgets.length
      ? widgets
      : normalizeWidgetsCollection(dashboard.widgets),
    recent: recent.length
      ? recent
      : safeArray(dashboard.recent),
    requestId: safeText(
      dashboard.requestId || meta.requestId,
      ""
    ),
    lastSyncAt: safeTimestamp(
      dashboard.lastSyncAt || meta.lastSyncAt,
      0
    ),
  };
}

export function getHomeSummaryStore() {
  return safeObject(
    readStoreValue(STORE_SUMMARY_PATH, {})
  );
}

export function getHomeRecentStore() {
  return safeArray(
    readStoreValue(STORE_RECENT_PATH, [])
  );
}

export function getHomeMetaStore() {
  return normalizeMeta(
    readStoreValue(STORE_META_PATH, {})
  );
}

/* =========================================================
   GETTERS · WIDGETS
========================================================= */

export function getHomeWidgets() {
  return normalizeWidgetsCollection(
    readStoreValue(STORE_WIDGETS_PATH, [])
  );
}

export function getSortedHomeWidgetsStore() {
  return sortHomeWidgetsByUpdatedDesc(getHomeWidgets());
}

export function getHomeSortedCollectionStore() {
  return getSortedHomeWidgetsStore();
}

export function getHomeWidgetById(id = "") {
  const target = safeId(id);

  if (!target) {
    return null;
  }

  const items = getHomeWidgets();

  return items.find((item) => isSameWidgetId(item, target)) || null;
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
  const normalized = normalizeDashboardSnapshot(snapshot);

  writeStoreValue(STORE_DASHBOARD_PATH, normalized);
  writeHomeWidgetsCollection(normalized.widgets || []);
  writeStoreValue(STORE_SUMMARY_PATH, safeObject(normalized.summary));
  writeStoreValue(STORE_RECENT_PATH, safeArray(normalized.recent));

  const meta = normalizeMeta({
    requestId: normalized.requestId,
    lastSyncAt: normalized.lastSyncAt,
  });

  writeStoreValue(STORE_META_PATH, meta);

  return getHomeDashboardStore();
}

export function replaceHomeStore({
  dashboard = {},
  widgets = [],
  summary = {},
  recent = [],
  requestId = "",
  lastSyncAt = 0,
} = {}) {
  const normalizedWidgets = normalizeWidgetsCollection(widgets);
  const normalizedSummary = safeObject(summary);
  const normalizedRecent = safeArray(recent);
  const normalizedDashboard = normalizeDashboardSnapshot({
    ...safeObject(dashboard),
    summary: normalizedSummary,
    widgets: normalizedWidgets,
    recent: normalizedRecent,
    requestId: safeText(requestId, safeObject(dashboard).requestId || ""),
    lastSyncAt: safeTimestamp(
      lastSyncAt,
      safeObject(dashboard).lastSyncAt || 0
    ),
  });

  writeStoreValue(STORE_DASHBOARD_PATH, normalizedDashboard);
  writeHomeWidgetsCollection(normalizedWidgets);
  writeStoreValue(STORE_SUMMARY_PATH, normalizedSummary);
  writeStoreValue(STORE_RECENT_PATH, normalizedRecent);
  writeStoreValue(
    STORE_META_PATH,
    normalizeMeta({
      requestId: requestId,
      lastSyncAt: lastSyncAt,
    })
  );

  return getHomeDashboardStore();
}

export function clearHomeDashboardStore() {
  writeStoreValue(STORE_DASHBOARD_PATH, {});
  writeStoreValue(STORE_SUMMARY_PATH, {});
  writeStoreValue(STORE_RECENT_PATH, []);
  writeStoreValue(STORE_META_PATH, {});
  writeHomeWidgetsCollection([]);

  return getHomeDashboardStore();
}

export function setHomeSummaryStore(summary = {}) {
  const next = safeObject(summary);
  writeStoreValue(STORE_SUMMARY_PATH, next);

  const currentDashboard = safeObject(
    readStoreValue(STORE_DASHBOARD_PATH, {})
  );

  writeStoreValue(STORE_DASHBOARD_PATH, {
    ...currentDashboard,
    summary: next,
  });

  return next;
}

export function setHomeRecentStore(items = []) {
  const next = safeArray(items);
  writeStoreValue(STORE_RECENT_PATH, next);

  const currentDashboard = safeObject(
    readStoreValue(STORE_DASHBOARD_PATH, {})
  );

  writeStoreValue(STORE_DASHBOARD_PATH, {
    ...currentDashboard,
    recent: next,
  });

  return next;
}

export function setHomeMetaStore(meta = {}) {
  const next = normalizeMeta(meta);
  writeStoreValue(STORE_META_PATH, next);

  const currentDashboard = safeObject(
    readStoreValue(STORE_DASHBOARD_PATH, {})
  );

  writeStoreValue(STORE_DASHBOARD_PATH, {
    ...currentDashboard,
    requestId: next.requestId,
    lastSyncAt: next.lastSyncAt,
  });

  return next;
}

/* =========================================================
   SETTERS · WIDGETS
========================================================= */

export function setHomeWidgets(items = []) {
  const next = normalizeWidgetsCollection(items);

  writeHomeWidgetsCollection(next);

  const currentDashboard = safeObject(
    readStoreValue(STORE_DASHBOARD_PATH, {})
  );

  writeStoreValue(STORE_DASHBOARD_PATH, {
    ...currentDashboard,
    widgets: next,
  });

  return next;
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

  const current = getHomeWidgets();
  const next = normalizeWidgetsCollection([
    ...current,
    safeObject(item),
  ]);

  writeHomeWidgetsCollection(next);

  const currentDashboard = safeObject(
    readStoreValue(STORE_DASHBOARD_PATH, {})
  );

  writeStoreValue(STORE_DASHBOARD_PATH, {
    ...currentDashboard,
    widgets: next,
  });

  return next;
}

export function updateHomeWidgetStore(id = "", patch = {}) {
  const target = safeId(id);

  if (!target) {
    return getHomeWidgets();
  }

  const current = getHomeWidgets();

  const next = current.map((item) =>
    isSameWidgetId(item, target)
      ? mergeHomeWidget(item, patch)
      : item
  );

  writeHomeWidgetsCollection(next);

  const currentDashboard = safeObject(
    readStoreValue(STORE_DASHBOARD_PATH, {})
  );

  writeStoreValue(STORE_DASHBOARD_PATH, {
    ...currentDashboard,
    widgets: next,
  });

  return next;
}

/* =========================================================
   UPSERT
========================================================= */

export function upsertHomeWidgetStore(item = null) {
  if (!item) {
    return getHomeWidgets();
  }

  const incoming = safeObject(item);
  const targetId = getWidgetId(incoming);
  const current = getHomeWidgets();

  if (!targetId) {
    const next = normalizeWidgetsCollection([incoming, ...current]);
    writeHomeWidgetsCollection(next);

    const currentDashboard = safeObject(
      readStoreValue(STORE_DASHBOARD_PATH, {})
    );

    writeStoreValue(STORE_DASHBOARD_PATH, {
      ...currentDashboard,
      widgets: next,
    });

    return next;
  }

  const index = current.findIndex(
    (row) => getWidgetId(row) === targetId
  );

  let next = [];

  if (index === -1) {
    next = normalizeWidgetsCollection([incoming, ...current]);
  } else {
    next = [...current];
    next[index] = mergeHomeWidget(next[index], incoming);
    next = normalizeWidgetsCollection(next);
  }

  writeHomeWidgetsCollection(next);

  const currentDashboard = safeObject(
    readStoreValue(STORE_DASHBOARD_PATH, {})
  );

  writeStoreValue(STORE_DASHBOARD_PATH, {
    ...currentDashboard,
    widgets: next,
  });

  return next;
}

/* =========================================================
   REMOVE
========================================================= */

export function removeHomeWidgetStore(id = "") {
  const target = safeId(id);

  if (!target) {
    return getHomeWidgets();
  }

  const next = getHomeWidgets().filter(
    (item) => !isSameWidgetId(item, target)
  );

  writeHomeWidgetsCollection(next);

  const currentDashboard = safeObject(
    readStoreValue(STORE_DASHBOARD_PATH, {})
  );

  writeStoreValue(STORE_DASHBOARD_PATH, {
    ...currentDashboard,
    widgets: next,
  });

  return next;
}

/* =========================================================
   HELPERS
========================================================= */

export function sortHomeWidgetsByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getUpdatedTimestamp(a);
    const bTime = getUpdatedTimestamp(b);

    return bTime - aTime;
  });
}

export function sortHomeWidgetsByCreatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = safeTimestamp(
      safeObject(a).createdAt ??
        safeObject(a).createdAtMs ??
        0,
      0
    );

    const bTime = safeTimestamp(
      safeObject(b).createdAt ??
        safeObject(b).createdAtMs ??
        0,
      0
    );

    return bTime - aTime;
  });
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
  updateHomeWidgetStore,
  upsertHomeWidgetStore,
  removeHomeWidgetStore,
  clearHomeWidgets,

  sortHomeWidgetsByUpdatedDesc,
  sortHomeWidgetsByCreatedDesc,

  getWidgetId,
};
