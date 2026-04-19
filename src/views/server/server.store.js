/* =========================================================
   Onion SPA - Server Store
   Archivo: src/views/server/server.store.js

   FINAL PRO SYSTEM · STORE LAYER · 10/10

   RESPONSABILIDADES:
   - encapsular Store global
   - leer / escribir snapshot técnico server
   - helpers para API / View / Actions
   - búsquedas robustas por serviceId / detailId
   - replace / append / update / upsert services
   - deduplicación segura
   - persistencia estable para modal / dashboard
   - exponer telemetry / services / history / metrics de forma consistente

   HARDENING PRO:
   - añadido upsertServerServiceStore
   - normalización de ids
   - evita duplicados
   - no muta colecciones originales
   - ordenación consistente por updatedAt / latency
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_SNAPSHOT_PATH = "entities.server.snapshot";
const STORE_SERVICES_PATH = "entities.server.services";
const STORE_TELEMETRY_PATH = "entities.server.telemetry";
const STORE_HISTORY_PATH = "entities.server.history";
const STORE_BROWSER_METRICS_PATH = "entities.server.browserMetrics";
const STORE_ENVIRONMENT_METRICS_PATH = "entities.server.environmentMetrics";
const STORE_DASHBOARD_PAYLOAD_PATH = "entities.server.dashboardPayload";
const STORE_HEALTH_PAYLOAD_PATH = "entities.server.healthPayload";
const STORE_META_PATH = "entities.server.meta";

const STORE_COLLECTION_KEY = "server";

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

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
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

export function getServiceId(item = {}) {
  const row = safeObject(item);

  return safeId(
    row.serviceId ||
      row.detailId ||
      row.id ||
      row.key ||
      row.slug ||
      row.code ||
      row.name ||
      row.service
  );
}

function isSameServiceId(item = {}, id = "") {
  const target = safeId(id);
  if (!target) return false;

  const row = safeObject(item);

  return (
    getServiceId(row) === target ||
    safeId(row.id) === target ||
    safeId(row.serviceId) === target ||
    safeId(row.detailId) === target ||
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
      row.timestamp ??
      row.loadedAt ??
      0,
    0
  );
}

function getLatencyTimestamp(item = {}) {
  const row = safeObject(item);
  const latency = Number(
    row.latencyMs ??
      row.latency ??
      row.responseTime ??
      row.ms
  );

  return Number.isFinite(latency)
    ? latency
    : Number.NEGATIVE_INFINITY;
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

function writeServerServicesCollection(items = []) {
  const list = safeArray(items);

  try {
    if (Store?.actions?.setCollection) {
      Store.actions.setCollection(STORE_COLLECTION_KEY, list);
    }
  } catch {}

  writeStoreValue(STORE_SERVICES_PATH, list);

  return list;
}

/* =========================================================
   NORMALIZE COLLECTION
========================================================= */

function mergeServerService(base = {}, patch = {}) {
  return {
    ...safeObject(base),
    ...safeObject(patch),
  };
}

function dedupeServerServices(items = []) {
  const list = safeArray(items);
  const map = new Map();
  const anonymous = [];

  for (const rawItem of list) {
    const item = safeObject(rawItem);
    const id = getServiceId(item);

    if (!id) {
      anonymous.push(item);
      continue;
    }

    if (!map.has(id)) {
      map.set(id, item);
      continue;
    }

    const current = map.get(id);
    map.set(id, mergeServerService(current, item));
  }

  return [...map.values(), ...anonymous];
}

function normalizeServicesCollection(items = []) {
  return dedupeServerServices(safeArray(items));
}

/* =========================================================
   SNAPSHOT NORMALIZERS
========================================================= */

function normalizeTelemetry(telemetry = {}) {
  const data = safeObject(telemetry);

  return {
    global: safeObject(data.global),
    dashboard: safeObject(data.dashboard),
    api: safeObject(data.api),
    db: safeObject(data.db),
    server: safeObject(data.server),
    runtime: safeObject(data.runtime),
    environment: safeObject(data.environment),
    services: safeObject(data.services),
  };
}

function normalizeHistory(history = {}) {
  const data = safeObject(history);

  return {
    cpu: safeArray(data.cpu),
    ram: safeArray(data.ram),
    apiLatency: safeArray(data.apiLatency),
    dbLatency: safeArray(data.dbLatency),
    timestamps: safeArray(data.timestamps),
  };
}

function normalizeBrowserMetrics(metrics = {}) {
  return safeObject(metrics);
}

function normalizeEnvironmentMetrics(metrics = {}) {
  const data = safeObject(metrics);

  return {
    ...data,
    browserMemory: safeObject(data.browserMemory),
  };
}

function normalizeSnapshot(snapshot = {}) {
  const data = safeObject(snapshot);

  return {
    ...data,
    dashboardPayload: safeObject(data.dashboardPayload),
    healthPayload: safeObject(data.healthPayload),
    telemetry: normalizeTelemetry(data.telemetry),
    services: normalizeServicesCollection(data.services),
    history: normalizeHistory(data.history),
    browserMetrics: normalizeBrowserMetrics(data.browserMetrics),
    environmentMetrics: normalizeEnvironmentMetrics(data.environmentMetrics),
  };
}

function normalizeMeta(meta = {}) {
  const item = safeObject(meta);

  return {
    requestId: safeText(item.requestId, ""),
    lastSyncAt: safeTimestamp(item.lastSyncAt, 0),
    autoRefresh: safeBoolean(item.autoRefresh, true),
    dashboardLatencyMs:
      item.dashboardLatencyMs === null || item.dashboardLatencyMs === undefined
        ? null
        : Number(item.dashboardLatencyMs),
    healthLatencyMs:
      item.healthLatencyMs === null || item.healthLatencyMs === undefined
        ? null
        : Number(item.healthLatencyMs),
  };
}

/* =========================================================
   GETTERS · SNAPSHOT
========================================================= */

export function getServerSnapshotStore() {
  const snapshot = normalizeSnapshot(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  const services = normalizeServicesCollection(
    readStoreValue(STORE_SERVICES_PATH, [])
  );

  const telemetry = normalizeTelemetry(
    readStoreValue(STORE_TELEMETRY_PATH, {})
  );

  const history = normalizeHistory(
    readStoreValue(STORE_HISTORY_PATH, {})
  );

  const browserMetrics = normalizeBrowserMetrics(
    readStoreValue(STORE_BROWSER_METRICS_PATH, {})
  );

  const environmentMetrics = normalizeEnvironmentMetrics(
    readStoreValue(STORE_ENVIRONMENT_METRICS_PATH, {})
  );

  const dashboardPayload = safeObject(
    readStoreValue(STORE_DASHBOARD_PAYLOAD_PATH, {})
  );

  const healthPayload = safeObject(
    readStoreValue(STORE_HEALTH_PAYLOAD_PATH, {})
  );

  const meta = normalizeMeta(
    readStoreValue(STORE_META_PATH, {})
  );

  return {
    ...snapshot,
    dashboardPayload: Object.keys(dashboardPayload).length
      ? dashboardPayload
      : safeObject(snapshot.dashboardPayload),

    healthPayload: Object.keys(healthPayload).length
      ? healthPayload
      : safeObject(snapshot.healthPayload),

    telemetry: Object.keys(telemetry).length
      ? telemetry
      : normalizeTelemetry(snapshot.telemetry),

    services: services.length
      ? services
      : normalizeServicesCollection(snapshot.services),

    history: Object.keys(history).length
      ? history
      : normalizeHistory(snapshot.history),

    browserMetrics: Object.keys(browserMetrics).length
      ? browserMetrics
      : normalizeBrowserMetrics(snapshot.browserMetrics),

    environmentMetrics: Object.keys(environmentMetrics).length
      ? environmentMetrics
      : normalizeEnvironmentMetrics(snapshot.environmentMetrics),

    requestId: safeText(
      snapshot.requestId || meta.requestId,
      ""
    ),

    lastSyncAt: safeTimestamp(
      snapshot.lastSyncAt || meta.lastSyncAt,
      0
    ),

    autoRefresh:
      typeof snapshot.autoRefresh === "boolean"
        ? snapshot.autoRefresh
        : meta.autoRefresh,

    dashboardLatencyMs:
      snapshot.dashboardLatencyMs ?? meta.dashboardLatencyMs ?? null,

    healthLatencyMs:
      snapshot.healthLatencyMs ?? meta.healthLatencyMs ?? null,
  };
}

export function getServerTelemetryStore() {
  return normalizeTelemetry(
    readStoreValue(STORE_TELEMETRY_PATH, {})
  );
}

export function getServerHistoryStore() {
  return normalizeHistory(
    readStoreValue(STORE_HISTORY_PATH, {})
  );
}

export function getServerBrowserMetricsStore() {
  return normalizeBrowserMetrics(
    readStoreValue(STORE_BROWSER_METRICS_PATH, {})
  );
}

export function getServerEnvironmentMetricsStore() {
  return normalizeEnvironmentMetrics(
    readStoreValue(STORE_ENVIRONMENT_METRICS_PATH, {})
  );
}

export function getServerDashboardPayloadStore() {
  return safeObject(
    readStoreValue(STORE_DASHBOARD_PAYLOAD_PATH, {})
  );
}

export function getServerHealthPayloadStore() {
  return safeObject(
    readStoreValue(STORE_HEALTH_PAYLOAD_PATH, {})
  );
}

export function getServerMetaStore() {
  return normalizeMeta(
    readStoreValue(STORE_META_PATH, {})
  );
}

/* =========================================================
   GETTERS · SERVICES
========================================================= */

export function getServerServices() {
  return normalizeServicesCollection(
    readStoreValue(STORE_SERVICES_PATH, [])
  );
}

export function getSortedServerServicesStore() {
  return sortServerServicesByLatencyDesc(getServerServices());
}

export function getServerSortedCollectionStore() {
  return getSortedServerServicesStore();
}

export function getServerServiceById(id = "") {
  const target = safeId(id);

  if (!target) {
    return null;
  }

  const items = getServerServices();

  return items.find((item) => isSameServiceId(item, target)) || null;
}

export function getServerServiceByIdStore(id = "") {
  return getServerServiceById(id);
}

export function hasServerServices() {
  return getServerServices().length > 0;
}

export function getServerServicesCount() {
  return getServerServices().length;
}

/* =========================================================
   SETTERS · SNAPSHOT
========================================================= */

export function setServerSnapshotStore(snapshot = {}) {
  const normalized = normalizeSnapshot(snapshot);

  writeStoreValue(STORE_SNAPSHOT_PATH, normalized);
  writeServerServicesCollection(normalized.services || []);
  writeStoreValue(STORE_TELEMETRY_PATH, normalizeTelemetry(normalized.telemetry));
  writeStoreValue(STORE_HISTORY_PATH, normalizeHistory(normalized.history));
  writeStoreValue(STORE_BROWSER_METRICS_PATH, normalizeBrowserMetrics(normalized.browserMetrics));
  writeStoreValue(STORE_ENVIRONMENT_METRICS_PATH, normalizeEnvironmentMetrics(normalized.environmentMetrics));
  writeStoreValue(STORE_DASHBOARD_PAYLOAD_PATH, safeObject(normalized.dashboardPayload));
  writeStoreValue(STORE_HEALTH_PAYLOAD_PATH, safeObject(normalized.healthPayload));

  const meta = normalizeMeta({
    requestId: normalized.requestId,
    lastSyncAt: normalized.lastSyncAt,
    autoRefresh: normalized.autoRefresh,
    dashboardLatencyMs: normalized.dashboardLatencyMs,
    healthLatencyMs: normalized.healthLatencyMs,
  });

  writeStoreValue(STORE_META_PATH, meta);

  return getServerSnapshotStore();
}

export function replaceServerStore({
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
  const normalizedServices = normalizeServicesCollection(services);
  const normalizedTelemetry = normalizeTelemetry(telemetry);
  const normalizedHistory = normalizeHistory(history);
  const normalizedBrowserMetrics = normalizeBrowserMetrics(browserMetrics);
  const normalizedEnvironmentMetrics = normalizeEnvironmentMetrics(environmentMetrics);
  const normalizedDashboardPayload = safeObject(dashboardPayload);
  const normalizedHealthPayload = safeObject(healthPayload);

  const normalizedSnapshot = normalizeSnapshot({
    dashboardPayload: normalizedDashboardPayload,
    healthPayload: normalizedHealthPayload,
    telemetry: normalizedTelemetry,
    services: normalizedServices,
    history: normalizedHistory,
    browserMetrics: normalizedBrowserMetrics,
    environmentMetrics: normalizedEnvironmentMetrics,
    dashboardLatencyMs,
    healthLatencyMs,
    requestId: safeText(requestId, ""),
    lastSyncAt: safeTimestamp(lastSyncAt, 0),
    autoRefresh: safeBoolean(autoRefresh, true),
  });

  writeStoreValue(STORE_SNAPSHOT_PATH, normalizedSnapshot);
  writeServerServicesCollection(normalizedServices);
  writeStoreValue(STORE_TELEMETRY_PATH, normalizedTelemetry);
  writeStoreValue(STORE_HISTORY_PATH, normalizedHistory);
  writeStoreValue(STORE_BROWSER_METRICS_PATH, normalizedBrowserMetrics);
  writeStoreValue(STORE_ENVIRONMENT_METRICS_PATH, normalizedEnvironmentMetrics);
  writeStoreValue(STORE_DASHBOARD_PAYLOAD_PATH, normalizedDashboardPayload);
  writeStoreValue(STORE_HEALTH_PAYLOAD_PATH, normalizedHealthPayload);
  writeStoreValue(
    STORE_META_PATH,
    normalizeMeta({
      requestId,
      lastSyncAt,
      autoRefresh,
      dashboardLatencyMs,
      healthLatencyMs,
    })
  );

  return getServerSnapshotStore();
}

export function clearServerSnapshotStore() {
  writeStoreValue(STORE_SNAPSHOT_PATH, {});
  writeStoreValue(STORE_TELEMETRY_PATH, {});
  writeStoreValue(STORE_HISTORY_PATH, {});
  writeStoreValue(STORE_BROWSER_METRICS_PATH, {});
  writeStoreValue(STORE_ENVIRONMENT_METRICS_PATH, {});
  writeStoreValue(STORE_DASHBOARD_PAYLOAD_PATH, {});
  writeStoreValue(STORE_HEALTH_PAYLOAD_PATH, {});
  writeStoreValue(STORE_META_PATH, {});
  writeServerServicesCollection([]);

  return getServerSnapshotStore();
}

export function setServerTelemetryStore(telemetry = {}) {
  const next = normalizeTelemetry(telemetry);
  writeStoreValue(STORE_TELEMETRY_PATH, next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    telemetry: next,
  });

  return next;
}

export function setServerHistoryStore(history = {}) {
  const next = normalizeHistory(history);
  writeStoreValue(STORE_HISTORY_PATH, next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    history: next,
  });

  return next;
}

export function setServerBrowserMetricsStore(metrics = {}) {
  const next = normalizeBrowserMetrics(metrics);
  writeStoreValue(STORE_BROWSER_METRICS_PATH, next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    browserMetrics: next,
  });

  return next;
}

export function setServerEnvironmentMetricsStore(metrics = {}) {
  const next = normalizeEnvironmentMetrics(metrics);
  writeStoreValue(STORE_ENVIRONMENT_METRICS_PATH, next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    environmentMetrics: next,
  });

  return next;
}

export function setServerDashboardPayloadStore(payload = {}) {
  const next = safeObject(payload);
  writeStoreValue(STORE_DASHBOARD_PAYLOAD_PATH, next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    dashboardPayload: next,
  });

  return next;
}

export function setServerHealthPayloadStore(payload = {}) {
  const next = safeObject(payload);
  writeStoreValue(STORE_HEALTH_PAYLOAD_PATH, next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    healthPayload: next,
  });

  return next;
}

export function setServerMetaStore(meta = {}) {
  const next = normalizeMeta(meta);
  writeStoreValue(STORE_META_PATH, next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    requestId: next.requestId,
    lastSyncAt: next.lastSyncAt,
    autoRefresh: next.autoRefresh,
    dashboardLatencyMs: next.dashboardLatencyMs,
    healthLatencyMs: next.healthLatencyMs,
  });

  return next;
}

/* =========================================================
   SETTERS · SERVICES
========================================================= */

export function setServerServices(items = []) {
  const next = normalizeServicesCollection(items);

  writeServerServicesCollection(next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    services: next,
  });

  return next;
}

export function replaceServerServicesStore(items = []) {
  return setServerServices(items);
}

export function clearServerServices() {
  return setServerServices([]);
}

export function appendServerServiceStore(item = null) {
  if (!item) {
    return getServerServices();
  }

  const current = getServerServices();
  const next = normalizeServicesCollection([
    ...current,
    safeObject(item),
  ]);

  writeServerServicesCollection(next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    services: next,
  });

  return next;
}

export function updateServerServiceStore(id = "", patch = {}) {
  const target = safeId(id);

  if (!target) {
    return getServerServices();
  }

  const current = getServerServices();

  const next = current.map((item) =>
    isSameServiceId(item, target)
      ? mergeServerService(item, patch)
      : item
  );

  writeServerServicesCollection(next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    services: next,
  });

  return next;
}

/* =========================================================
   UPSERT
========================================================= */

export function upsertServerServiceStore(item = null) {
  if (!item) {
    return getServerServices();
  }

  const incoming = safeObject(item);
  const targetId = getServiceId(incoming);
  const current = getServerServices();

  if (!targetId) {
    const next = normalizeServicesCollection([incoming, ...current]);
    writeServerServicesCollection(next);

    const currentSnapshot = safeObject(
      readStoreValue(STORE_SNAPSHOT_PATH, {})
    );

    writeStoreValue(STORE_SNAPSHOT_PATH, {
      ...currentSnapshot,
      services: next,
    });

    return next;
  }

  const index = current.findIndex(
    (row) => getServiceId(row) === targetId
  );

  let next = [];

  if (index === -1) {
    next = normalizeServicesCollection([incoming, ...current]);
  } else {
    next = [...current];
    next[index] = mergeServerService(next[index], incoming);
    next = normalizeServicesCollection(next);
  }

  writeServerServicesCollection(next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    services: next,
  });

  return next;
}

/* =========================================================
   REMOVE
========================================================= */

export function removeServerServiceStore(id = "") {
  const target = safeId(id);

  if (!target) {
    return getServerServices();
  }

  const next = getServerServices().filter(
    (item) => !isSameServiceId(item, target)
  );

  writeServerServicesCollection(next);

  const currentSnapshot = safeObject(
    readStoreValue(STORE_SNAPSHOT_PATH, {})
  );

  writeStoreValue(STORE_SNAPSHOT_PATH, {
    ...currentSnapshot,
    services: next,
  });

  return next;
}

/* =========================================================
   HELPERS
========================================================= */

export function sortServerServicesByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getUpdatedTimestamp(a);
    const bTime = getUpdatedTimestamp(b);

    return bTime - aTime;
  });
}

export function sortServerServicesByLatencyDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getLatencyTimestamp(a);
    const bTime = getLatencyTimestamp(b);

    return bTime - aTime;
  });
}

export function sortServerServicesByCreatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = safeTimestamp(
      safeObject(a).createdAt ??
        safeObject(a).createdAtMs ??
        safeObject(a).timestamp ??
        0,
      0
    );

    const bTime = safeTimestamp(
      safeObject(b).createdAt ??
        safeObject(b).createdAtMs ??
        safeObject(b).timestamp ??
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
  getServerSnapshotStore,
  getServerTelemetryStore,
  getServerHistoryStore,
  getServerBrowserMetricsStore,
  getServerEnvironmentMetricsStore,
  getServerDashboardPayloadStore,
  getServerHealthPayloadStore,
  getServerMetaStore,

  getServerServices,
  getSortedServerServicesStore,
  getServerSortedCollectionStore,
  getServerServiceById,
  getServerServiceByIdStore,
  hasServerServices,
  getServerServicesCount,

  setServerSnapshotStore,
  replaceServerStore,
  clearServerSnapshotStore,

  setServerTelemetryStore,
  setServerHistoryStore,
  setServerBrowserMetricsStore,
  setServerEnvironmentMetricsStore,
  setServerDashboardPayloadStore,
  setServerHealthPayloadStore,
  setServerMetaStore,

  setServerServices,
  replaceServerServicesStore,
  appendServerServiceStore,
  updateServerServiceStore,
  upsertServerServiceStore,
  removeServerServiceStore,
  clearServerServices,

  sortServerServicesByUpdatedDesc,
  sortServerServicesByLatencyDesc,
  sortServerServicesByCreatedDesc,

  getServiceId,
};
