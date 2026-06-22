/* =========================================================
   Onion Support - Servidor API
   Archivo: /src/views/server/server.api.js

   PRODUCTIVO · OBSERVABILIDAD HTTP · SERVIDOR · 10/10

   Responsabilidad:
   - Capa HTTP única para estado técnico del sistema.
   - Backend/API.
   - Base de datos.
   - Blob Storage / Storage.
   - Azure.
   - Métricas CPU/RAM/Uptime/latencia.
   - Cache en memoria + localStorage.
   - Auto refresh opcional.
   - Sin DOM.
   - Sin Router.
   - Sin Toast.
   - Sin window.fetch.
   - Sin imports a server.state.js / server.store.js / server.model.js.
========================================================= */

import Http from "../../core/http.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const SERVER_API_VERSION =
  "server.api.productive.v1.observability.http-single";

export const SERVIDOR_API_VERSION = SERVER_API_VERSION;

export const SERVER_REQUEST_TIMEOUT_MS = 12000;
export const SERVER_CACHE_KEY = "onion.support.server.status.cache.v1";
export const SERVER_CACHE_TTL_MS = 30000;
export const SERVER_AUTO_REFRESH_DEFAULT_MS = 30000;

export const SERVER_ENDPOINT_GROUPS = Object.freeze({
  overview: Object.freeze([
    "/api/server/status",
    "/api/server/health",
    "/api/status",
    "/api/health",
    "/health",
  ]),

  metrics: Object.freeze([
    "/api/server/metrics",
    "/api/status/metrics",
    "/api/system/metrics",
    "/api/metrics",
  ]),

  database: Object.freeze([
    "/api/server/database",
    "/api/server/db",
    "/api/database/health",
    "/api/db/health",
    "/api/health/db",
  ]),

  blobs: Object.freeze([
    "/api/server/blobs",
    "/api/server/storage",
    "/api/blobs/health",
    "/api/storage/health",
    "/api/azure/blob/health",
  ]),

  azure: Object.freeze([
    "/api/server/azure",
    "/api/azure/status",
    "/api/azure/health",
  ]),
});

const autoRefreshRegistry = new Map();

const serverState = {
  snapshot: null,
  loading: false,
  refreshing: false,
  loaded: false,
  hydrated: false,
  error: "",
  lastSyncAt: 0,
  inflight: null,
};

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(Math.max(number(value, min), min), max);
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function safeError(error = null, fallback = "No se pudo consultar el estado del servidor.") {
  return cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function performanceNow() {
  try {
    if (typeof performance !== "undefined" && isFunction(performance.now)) {
      return performance.now();
    }
  } catch {
    // noop
  }

  return Date.now();
}

function formatBytes(value = 0) {
  const bytes = number(value, 0);

  if (!bytes) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = Math.abs(bytes);
  let unit = 0;

  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }

  const sign = bytes < 0 ? "-" : "";
  const decimals = unit <= 1 ? 0 : 1;

  return `${sign}${current.toFixed(decimals)} ${units[unit]}`;
}

function formatPercent(value = null) {
  if (value === null || value === undefined || value === "") return "—";

  const numeric = number(value, NaN);
  if (!Number.isFinite(numeric)) return "—";

  const normalized = numeric <= 1 && numeric >= 0 ? numeric * 100 : numeric;

  return `${clamp(normalized, 0, 999).toFixed(normalized >= 10 ? 0 : 1)}%`;
}

function formatMs(value = null) {
  const numeric = number(value, NaN);
  if (!Number.isFinite(numeric)) return "—";

  return `${Math.max(0, Math.round(numeric))} ms`;
}

function formatDuration(seconds = 0) {
  const value = Math.max(0, number(seconds, 0));

  if (!value) return "—";

  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes || 1}m`;
}

/* =========================================================
   STORAGE / STATE
========================================================= */

function isStorageAvailable() {
  return isBrowser() && Boolean(window.localStorage);
}

function readCachePayload() {
  if (!isStorageAvailable()) return null;

  try {
    const raw = window.localStorage.getItem(SERVER_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachePayload(snapshot = null) {
  if (!isStorageAvailable() || !snapshot) return false;

  try {
    const payload = {
      version: SERVER_API_VERSION,
      snapshot,
      cachedAt: Date.now(),
      lastSyncAt: Date.now(),
    };

    window.localStorage.setItem(SERVER_CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function hydrateServerFromCache({ freshOnly = true } = {}) {
  const payload = readCachePayload();
  if (!payload?.snapshot) return null;

  const cachedAt = number(payload.cachedAt || payload.lastSyncAt, 0);
  const age = cachedAt ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;

  if (freshOnly && age > SERVER_CACHE_TTL_MS) return null;

  serverState.snapshot = payload.snapshot;
  serverState.lastSyncAt = number(payload.lastSyncAt, cachedAt || Date.now());
  serverState.loaded = true;
  serverState.hydrated = true;
  serverState.error = "";

  return payload.snapshot;
}

export function clearServerCache() {
  serverState.snapshot = null;
  serverState.loaded = false;
  serverState.hydrated = false;
  serverState.error = "";
  serverState.lastSyncAt = 0;

  if (isStorageAvailable()) {
    try {
      window.localStorage.removeItem(SERVER_CACHE_KEY);
    } catch {
      // noop
    }
  }

  return true;
}

function setLoading(value = false) {
  serverState.loading = Boolean(value);
  return serverState.loading;
}

function setRefreshing(value = false) {
  serverState.refreshing = Boolean(value);
  return serverState.refreshing;
}

function setError(value = "") {
  serverState.error = cleanText(value, "");
  return serverState.error;
}

function clearError() {
  serverState.error = "";
  return true;
}

function setSnapshot(snapshot = null) {
  serverState.snapshot = snapshot;
  serverState.loaded = Boolean(snapshot);
  serverState.hydrated = Boolean(snapshot);
  serverState.lastSyncAt = snapshot ? Date.now() : 0;

  if (snapshot) {
    writeCachePayload(snapshot);
  }

  return serverState.snapshot;
}

/* =========================================================
   HTTP
========================================================= */

async function httpGet(endpoint = "", options = {}) {
  const path = cleanText(endpoint, "");

  if (!path) {
    throw new Error("SERVER_ENDPOINT_REQUIRED");
  }

  const startedAt = performanceNow();

  let response;

  if (isFunction(Http?.get)) {
    response = await Http.get(path, {
      timeout: number(options.timeout, SERVER_REQUEST_TIMEOUT_MS),
      query: safeObject(options.query),
      params: safeObject(options.params),
      headers: safeObject(options.headers),
      source: cleanText(options.source, "views.server.api"),
    });
  } else if (isFunction(Http?.request)) {
    response = await Http.request(path, {
      method: "GET",
      timeout: number(options.timeout, SERVER_REQUEST_TIMEOUT_MS),
      query: safeObject(options.query),
      params: safeObject(options.params),
      headers: safeObject(options.headers),
      source: cleanText(options.source, "views.server.api"),
    });
  } else {
    throw new Error("HTTP_CORE_UNAVAILABLE");
  }

  return {
    endpoint: path,
    latencyMs: Math.max(0, Math.round(performanceNow() - startedAt)),
    response,
  };
}

export async function probeServerEndpoint(endpoint = "", options = {}) {
  return httpGet(endpoint, {
    ...options,
    source: cleanText(options.source, "views.server.api.probe"),
  });
}

export async function probeEndpointGroup(group = "", endpoints = [], options = {}) {
  const name = cleanText(group, "unknown");
  const list = safeArray(endpoints);
  const errors = [];

  for (const endpoint of list) {
    try {
      const result = await httpGet(endpoint, {
        ...options,
        timeout: number(options.timeout, SERVER_REQUEST_TIMEOUT_MS),
        source: `views.server.api.${name}`,
      });

      return {
        group: name,
        ok: true,
        endpoint: result.endpoint,
        latencyMs: result.latencyMs,
        data: result.response,
        error: "",
        tried: list,
      };
    } catch (error) {
      errors.push({
        endpoint,
        message: safeError(error),
      });
    }
  }

  return {
    group: name,
    ok: false,
    endpoint: "",
    latencyMs: null,
    data: null,
    error: errors.at(-1)?.message || `No hay endpoint disponible para ${name}.`,
    tried: list,
    errors,
  };
}

/* =========================================================
   NORMALIZATION
========================================================= */

function unwrapObject(payload = null, maxDepth = 8) {
  let current = payload;
  const seen = new Set();

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    if (!isObject(current) || seen.has(current)) break;

    seen.add(current);

    const nested = first(
      current.data,
      current.payload,
      current.result,
      current.response,
      current.body,
      current.value
    );

    if (isObject(nested)) {
      current = nested;
      continue;
    }

    break;
  }

  return safeObject(current, {});
}

function pickDeep(object = {}, paths = []) {
  for (const path of safeArray(paths)) {
    const segments = String(path).split(".").filter(Boolean);
    let current = object;

    for (const segment of segments) {
      if (!isObject(current) && !Array.isArray(current)) {
        current = undefined;
        break;
      }

      current = current?.[segment];
    }

    if (current !== undefined && current !== null && current !== "") {
      return current;
    }
  }

  return null;
}

function normalizeStatus(value = "") {
  const key = normalizeKey(value);

  if (
    [
      "ok",
      "up",
      "online",
      "healthy",
      "success",
      "ready",
      "running",
      "connected",
      "active",
      "available",
      "operational",
    ].includes(key)
  ) {
    return "healthy";
  }

  if (
    [
      "warn",
      "warning",
      "degraded",
      "partial",
      "slow",
      "limited",
      "unstable",
    ].includes(key)
  ) {
    return "warning";
  }

  if (
    [
      "error",
      "fail",
      "failed",
      "down",
      "offline",
      "unhealthy",
      "critical",
      "disconnected",
      "unavailable",
      "ko",
    ].includes(key)
  ) {
    return "critical";
  }

  if (!key) return "unknown";

  return key;
}

function normalizeBooleanStatus(value = null, fallback = "unknown") {
  if (value === true) return "healthy";
  if (value === false) return "critical";

  if (typeof value === "number") {
    if (value === 1) return "healthy";
    if (value === 0) return "critical";
  }

  if (typeof value === "string") {
    return normalizeStatus(value);
  }

  return fallback;
}

function statusWeight(status = "") {
  const value = normalizeStatus(status);

  if (value === "critical") return 3;
  if (value === "warning") return 2;
  if (value === "unknown") return 1;
  return 0;
}

function worstStatus(statuses = []) {
  const list = safeArray(statuses).map(normalizeStatus);

  if (!list.length) return "unknown";

  return list.sort((a, b) => statusWeight(b) - statusWeight(a))[0] || "unknown";
}

function labelForStatus(status = "") {
  const value = normalizeStatus(status);

  if (value === "healthy") return "Operativo";
  if (value === "warning") return "Degradado";
  if (value === "critical") return "Crítico";
  return "Desconocido";
}

function normalizeService({
  id = "",
  label = "",
  status = "unknown",
  latencyMs = null,
  endpoint = "",
  detail = "",
  value = "",
  raw = null,
  error = "",
} = {}) {
  const normalizedStatus = normalizeStatus(status);

  return {
    id: normalizeKey(id || label || endpoint || "service"),
    label: cleanText(label, "Servicio"),
    status: normalizedStatus,
    statusLabel: labelForStatus(normalizedStatus),
    latencyMs: latencyMs === null || latencyMs === undefined ? null : number(latencyMs, null),
    endpoint: cleanText(endpoint, ""),
    detail: cleanText(detail, ""),
    value: cleanText(value, ""),
    error: cleanText(error, ""),
    raw,
  };
}

function getResult(results = [], group = "") {
  return safeArray(results).find((item) => item.group === group) || null;
}

export function normalizeServerSnapshot(results = []) {
  const overviewResult = getResult(results, "overview");
  const metricsResult = getResult(results, "metrics");
  const databaseResult = getResult(results, "database");
  const blobsResult = getResult(results, "blobs");
  const azureResult = getResult(results, "azure");

  const overview = unwrapObject(overviewResult?.data);
  const metrics = unwrapObject(metricsResult?.data);
  const database = unwrapObject(first(databaseResult?.data, overview.database, overview.db, overview.mongo, overview.sql));
  const blobs = unwrapObject(first(blobsResult?.data, overview.blobs, overview.storage, overview.azure?.blobs, overview.azure?.storage));
  const azure = unwrapObject(first(azureResult?.data, overview.azure, overview.cloud));

  const metricSource = {
    ...safeObject(overview.metrics),
    ...safeObject(overview.system),
    ...safeObject(overview.resourceUsage),
    ...metrics,
  };

  const backendStatus = normalizeBooleanStatus(
    first(
      overview.ok,
      overview.healthy,
      overview.status,
      overview.health,
      overview.ready,
      overview.uptime ? true : null,
      overviewResult?.ok
    ),
    overviewResult?.ok ? "healthy" : "critical"
  );

  const databaseStatus = normalizeBooleanStatus(
    first(
      database.ok,
      database.connected,
      database.healthy,
      database.status,
      database.health,
      database.ready,
      databaseResult?.ok
    ),
    databaseResult?.ok ? "healthy" : "unknown"
  );

  const blobsStatus = normalizeBooleanStatus(
    first(
      blobs.ok,
      blobs.connected,
      blobs.healthy,
      blobs.status,
      blobs.health,
      blobs.ready,
      blobsResult?.ok
    ),
    blobsResult?.ok ? "healthy" : "unknown"
  );

  const azureStatus = normalizeBooleanStatus(
    first(
      azure.ok,
      azure.connected,
      azure.healthy,
      azure.status,
      azure.health,
      azure.ready,
      azureResult?.ok
    ),
    azureResult?.ok ? "healthy" : "unknown"
  );

  const cpuUsage = first(
    pickDeep(metricSource, ["cpu.usage", "cpu.percent", "cpu.usedPercent"]),
    metricSource.cpuUsage,
    metricSource.cpuPercent,
    overview.cpuUsage,
    overview.cpuPercent
  );

  const memoryUsage = first(
    pickDeep(metricSource, ["memory.usage", "memory.percent", "memory.usedPercent"]),
    metricSource.memoryUsage,
    metricSource.memoryPercent,
    metricSource.ramUsage,
    metricSource.ramPercent,
    overview.memoryUsage,
    overview.memoryPercent,
    overview.ramUsage,
    overview.ramPercent
  );

  const memoryUsedBytes = first(
    pickDeep(metricSource, ["memory.used", "memory.usedBytes"]),
    metricSource.memoryUsed,
    metricSource.memoryUsedBytes,
    metricSource.ramUsed,
    metricSource.ramUsedBytes
  );

  const memoryTotalBytes = first(
    pickDeep(metricSource, ["memory.total", "memory.totalBytes"]),
    metricSource.memoryTotal,
    metricSource.memoryTotalBytes,
    metricSource.ramTotal,
    metricSource.ramTotalBytes
  );

  const uptimeSeconds = first(
    overview.uptimeSeconds,
    overview.uptime,
    metricSource.uptimeSeconds,
    metricSource.uptime,
    pickDeep(metricSource, ["process.uptime", "system.uptime"])
  );

  const services = [
    normalizeService({
      id: "backend",
      label: "Backend API",
      status: backendStatus,
      latencyMs: overviewResult?.latencyMs,
      endpoint: overviewResult?.endpoint,
      detail: overviewResult?.ok ? "API principal responde." : overviewResult?.error,
      raw: overview,
      error: overviewResult?.error,
    }),

    normalizeService({
      id: "database",
      label: "Base de datos",
      status: databaseStatus,
      latencyMs: first(database.latencyMs, database.pingMs, databaseResult?.latencyMs),
      endpoint: databaseResult?.endpoint,
      detail: first(database.message, database.detail, database.name, database.database, databaseResult?.error, "Estado de conexión de base de datos."),
      raw: database,
      error: databaseResult?.error,
    }),

    normalizeService({
      id: "blobs",
      label: "Blob Storage",
      status: blobsStatus,
      latencyMs: first(blobs.latencyMs, blobs.pingMs, blobsResult?.latencyMs),
      endpoint: blobsResult?.endpoint,
      detail: first(blobs.message, blobs.detail, blobs.container, blobs.accountName, blobsResult?.error, "Estado de almacenamiento de blobs."),
      raw: blobs,
      error: blobsResult?.error,
    }),

    normalizeService({
      id: "azure",
      label: "Azure",
      status: azureStatus,
      latencyMs: first(azure.latencyMs, azure.pingMs, azureResult?.latencyMs),
      endpoint: azureResult?.endpoint,
      detail: first(azure.message, azure.detail, azure.region, azure.resourceGroup, azureResult?.error, "Estado general de Azure."),
      raw: azure,
      error: azureResult?.error,
    }),

    normalizeService({
      id: "cpu",
      label: "CPU",
      status:
        cpuUsage === null || cpuUsage === undefined
          ? "unknown"
          : number(cpuUsage, 0) >= 90
            ? "critical"
            : number(cpuUsage, 0) >= 75
              ? "warning"
              : "healthy",
      value: formatPercent(cpuUsage),
      detail: "Uso actual de CPU reportado por backend.",
      raw: cpuUsage,
    }),

    normalizeService({
      id: "memory",
      label: "RAM",
      status:
        memoryUsage === null || memoryUsage === undefined
          ? "unknown"
          : number(memoryUsage, 0) >= 90
            ? "critical"
            : number(memoryUsage, 0) >= 78
              ? "warning"
              : "healthy",
      value: formatPercent(memoryUsage),
      detail:
        memoryUsedBytes || memoryTotalBytes
          ? `${formatBytes(memoryUsedBytes)} / ${formatBytes(memoryTotalBytes)}`
          : "Uso actual de memoria reportado por backend.",
      raw: {
        memoryUsage,
        memoryUsedBytes,
        memoryTotalBytes,
      },
    }),
  ];

  const overallStatus = worstStatus(services.map((service) => service.status));

  return {
    version: SERVER_API_VERSION,
    status: overallStatus,
    statusLabel: labelForStatus(overallStatus),
    ok: overallStatus === "healthy" || overallStatus === "warning",
    checkedAt: nowIso(),

    uptimeSeconds: number(uptimeSeconds, 0),
    uptimeLabel: formatDuration(uptimeSeconds),

    latencyMs: overviewResult?.latencyMs ?? null,
    latencyLabel: formatMs(overviewResult?.latencyMs),

    cpuUsage,
    cpuUsageLabel: formatPercent(cpuUsage),

    memoryUsage,
    memoryUsageLabel: formatPercent(memoryUsage),
    memoryUsedBytes,
    memoryTotalBytes,
    memoryLabel:
      memoryUsedBytes || memoryTotalBytes
        ? `${formatBytes(memoryUsedBytes)} / ${formatBytes(memoryTotalBytes)}`
        : formatPercent(memoryUsage),

    services,

    endpoints: Object.fromEntries(
      safeArray(results).map((result) => [
        result.group,
        {
          ok: result.ok,
          endpoint: result.endpoint,
          latencyMs: result.latencyMs,
          error: result.error,
          tried: result.tried,
        },
      ])
    ),

    raw: {
      overview,
      metrics,
      database,
      blobs,
      azure,
      results,
    },
  };
}

export function createEmptyServerSnapshot() {
  return {
    version: SERVER_API_VERSION,
    status: "unknown",
    statusLabel: "Sin datos",
    ok: false,
    checkedAt: "",
    uptimeSeconds: 0,
    uptimeLabel: "—",
    latencyMs: null,
    latencyLabel: "—",
    cpuUsage: null,
    cpuUsageLabel: "—",
    memoryUsage: null,
    memoryUsageLabel: "—",
    memoryLabel: "—",
    services: [
      normalizeService({ id: "backend", label: "Backend API", status: "unknown", detail: "Pendiente de consulta." }),
      normalizeService({ id: "database", label: "Base de datos", status: "unknown", detail: "Pendiente de consulta." }),
      normalizeService({ id: "blobs", label: "Blob Storage", status: "unknown", detail: "Pendiente de consulta." }),
      normalizeService({ id: "azure", label: "Azure", status: "unknown", detail: "Pendiente de consulta." }),
      normalizeService({ id: "cpu", label: "CPU", status: "unknown", value: "—", detail: "Pendiente de consulta." }),
      normalizeService({ id: "memory", label: "RAM", status: "unknown", value: "—", detail: "Pendiente de consulta." }),
    ],
    endpoints: {},
    raw: {},
  };
}

/* =========================================================
   PUBLIC LOADERS
========================================================= */

export async function loadServerSnapshot(options = {}) {
  const activeInflight = serverState.inflight;

  if (activeInflight && !options.force) {
    return activeInflight;
  }

  const cached = hydrateServerFromCache({ freshOnly: options.freshOnly !== false });
  if (cached && !options.force) {
    return cached;
  }

  setLoading(!serverState.loaded);
  setRefreshing(Boolean(serverState.loaded));
  clearError();

  const task = Promise.all(
    Object.entries(SERVER_ENDPOINT_GROUPS).map(([group, endpoints]) =>
      probeEndpointGroup(group, endpoints, options)
    )
  )
    .then((results) => {
      const snapshot = normalizeServerSnapshot(results);
      setSnapshot(snapshot);
      return snapshot;
    })
    .catch((error) => {
      setError(safeError(error));
      throw error;
    })
    .finally(() => {
      setLoading(false);
      setRefreshing(false);
      serverState.inflight = null;
    });

  serverState.inflight = task;

  return task;
}

export async function loadServerHealth(options = {}) {
  return loadServerSnapshot(options);
}

export async function refreshServerSnapshot(options = {}) {
  return loadServerSnapshot({
    ...options,
    force: true,
  });
}

export async function refreshServerHealth(options = {}) {
  return refreshServerSnapshot(options);
}

/* =========================================================
   AUTO REFRESH
========================================================= */

export function setServerAutoRefresh(key = "server:view", enabled = false, options = {}) {
  const registryKey = cleanText(key, "server:view");

  const current = autoRefreshRegistry.get(registryKey);

  if (current?.timer) {
    clearInterval(current.timer);
  }

  autoRefreshRegistry.delete(registryKey);

  if (!enabled) {
    return {
      key: registryKey,
      enabled: false,
      intervalMs: 0,
    };
  }

  const intervalMs = clamp(
    number(options.intervalMs, SERVER_AUTO_REFRESH_DEFAULT_MS),
    5000,
    600000
  );

  const timer = setInterval(() => {
    refreshServerSnapshot({
      ...options,
      source: `auto-refresh:${registryKey}`,
      force: true,
    }).catch(() => {});
  }, intervalMs);

  autoRefreshRegistry.set(registryKey, {
    key: registryKey,
    timer,
    intervalMs,
    startedAt: Date.now(),
  });

  return {
    key: registryKey,
    enabled: true,
    intervalMs,
  };
}

export function stopAllServerAutoRefresh() {
  for (const [, entry] of autoRefreshRegistry) {
    try {
      clearInterval(entry.timer);
    } catch {
      // noop
    }
  }

  autoRefreshRegistry.clear();
  return true;
}

/* =========================================================
   SNAPSHOTS / COMPAT EXPORTS
========================================================= */

export function getServerSnapshotStore() {
  return serverState.snapshot || createEmptyServerSnapshot();
}

export function getServerSnapshot() {
  return getServerSnapshotStore();
}

export function getServerStateSnapshot() {
  return {
    version: SERVER_API_VERSION,
    snapshot: getServerSnapshotStore(),
    loading: serverState.loading,
    refreshing: serverState.refreshing,
    loaded: serverState.loaded,
    hydrated: serverState.hydrated,
    error: serverState.error,
    lastSyncAt: serverState.lastSyncAt,
    autoRefresh: [...autoRefreshRegistry.values()].map((entry) => ({
      key: entry.key,
      intervalMs: entry.intervalMs,
      startedAt: entry.startedAt,
    })),
  };
}

export function getState() {
  return getServerStateSnapshot();
}

export function getSnapshot() {
  return getServerStateSnapshot();
}

export function getServerServices() {
  return safeArray(getServerSnapshotStore().services);
}

export function getServerServiceByIdStore(id = "") {
  const target = normalizeKey(id);
  if (!target) return null;

  return getServerServices().find((service) => normalizeKey(service.id) === target) || null;
}

export {
  serverState,
  normalizeStatus,
  labelForStatus,
  normalizeService,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  version: SERVER_API_VERSION,

  endpointGroups: SERVER_ENDPOINT_GROUPS,

  loadServerSnapshot,
  loadServerHealth,
  refreshServerSnapshot,
  refreshServerHealth,

  probeServerEndpoint,
  probeEndpointGroup,

  hydrateServerFromCache,
  clearServerCache,

  setServerAutoRefresh,
  stopAllServerAutoRefresh,

  normalizeServerSnapshot,
  createEmptyServerSnapshot,

  getServerSnapshotStore,
  getServerSnapshot,
  getServerStateSnapshot,
  getServerServices,
  getServerServiceByIdStore,
  getState,
  getSnapshot,

  serverState,
};
