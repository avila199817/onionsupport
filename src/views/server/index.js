/* =========================================================
   Onion Support - Servidor Index
   Archivo: /src/views/server/index.js

   PRODUCTIVO · CONTROLADOR ÚNICO · OBSERVABILIDAD · 10/10

   Objetivo:
   - Conectar la vista Servidor al backend real.
   - Consultar estado de backend, base de datos, blobs/storage, Azure,
     CPU, RAM, uptime, latencia y métricas.
   - Evitar serverView.js legacy con imports fantasma.
   - Sin window.fetch.
   - HTTP único mediante /core/http.js.
   - Render inicial inmediato.
   - Refresh manual.
   - Live mode opcional.
   - Compatible con /servidor y /@usuario/servidor.
   - Exporta ServidorView y ServerView para el router.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const SERVIDOR_MODULE_NAME = "servidor";
export const SERVER_MODULE_NAME = "server";
export const SERVIDOR_VIEW_NAME = "ServidorView";
export const SERVER_VIEW_NAME = "ServerView";

export const SERVIDOR_CANONICAL_PATH = "/servidor";

export const SERVIDOR_INDEX_VERSION =
  "servidor.index.productive.v1.observability-controller";

export const SERVER_INDEX_VERSION = SERVIDOR_INDEX_VERSION;
export const SERVIDOR_INDEX_SOURCE = "views.server.index";

export const SERVER_REFRESH_INTERVAL_MS = 30000;
export const SERVER_REQUEST_TIMEOUT_MS = 12000;

const SERVER_CONTROLLER_KEY = Symbol.for(
  "onion.support.server.active-controller"
);

const ACTIONS = Object.freeze({
  REFRESH: "refresh",
  REFRESH_SERVER: "refresh-server",
  REFRESH_HEALTH: "refresh-health",
  LOAD_HEALTH: "load-server-health",
  TOGGLE_LIVE: "toggle-live",
  COPY_JSON: "copy-json",
  COPY_DETAIL: "copy-server-detail-id",
});

const ENDPOINT_GROUPS = Object.freeze({
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

let activeController = null;

/* =========================================================
   BASICS
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

function isNode(value) {
  return Boolean(value && typeof value === "object" && value.nodeType === 1);
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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
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

function getGlobalObject() {
  try {
    return globalThis;
  } catch {
    return {};
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function formatDateTime(value = null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
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

/* =========================================================
   APP / ROUTE / EVENTS
========================================================= */

function normalizePathname(path = "/") {
  let value = cleanText(path, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  const segments = value.split("/").filter(Boolean);

  if (segments[0]?.startsWith("@")) {
    value = `/${segments.slice(1).join("/")}` || "/";
  }

  return value;
}

function getBrowserPath() {
  if (!isBrowser()) return "";

  try {
    const hash = window.location.hash || "";

    if (hash.startsWith("#/")) return normalizePathname(hash.slice(1));
    if (hash.startsWith("#!/")) return normalizePathname(hash.slice(2));

    return normalizePathname(window.location.pathname || "/");
  } catch {
    return "";
  }
}

function routePathFromContext(context = {}) {
  return cleanText(
    first(
      context.canonicalPath,
      context.routePath,
      context.route?.path,
      context.publicPath,
      context.requestedPath,
      context.path,
      context.options?.canonicalPath,
      context.options?.routePath,
      context.options?.path,
      ""
    ),
    ""
  );
}

function isServidorRoute(context = {}) {
  const explicit = routePathFromContext(context);

  if (explicit) {
    return normalizePathname(explicit) === SERVIDOR_CANONICAL_PATH;
  }

  const browserPath = getBrowserPath();
  if (browserPath) return browserPath === SERVIDOR_CANONICAL_PATH;

  return true;
}

function resolveHost(host = null, context = {}) {
  if (isNode(host)) return host;
  if (isNode(context.host)) return context.host;
  if (isNode(context.root)) return context.root;
  if (isNode(context.container)) return context.container;

  if (!isBrowser()) return null;

  return (
    document.querySelector("[data-view-host='servidor']") ||
    document.querySelector("[data-view-host='server']") ||
    document.querySelector("[data-server-host='true']") ||
    document.querySelector("[data-servidor-host='true']") ||
    document.querySelector("#app-content") ||
    document.querySelector("main") ||
    null
  );
}

function emitEvent(eventName = "", payload = {}) {
  const name = cleanText(eventName, "");
  if (!name) return false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(name, payload);
      return true;
    }
  } catch {
    // fallback
  }

  try {
    if (isBrowser()) {
      window.dispatchEvent(new CustomEvent(name, { detail: payload }));
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

function showToast(message = "", type = "info") {
  const text = cleanText(message, "");
  if (!text) return false;

  const candidates = [AppCore?.toast, AppCore?.ui?.toast, AppCore?.Toast];

  for (const toast of candidates) {
    try {
      if (isFunction(toast?.[type])) {
        toast[type](text);
        return true;
      }

      if (isFunction(toast?.show)) {
        toast.show(text, type);
        return true;
      }
    } catch {
      // continue
    }
  }

  return false;
}

/* =========================================================
   HTTP / PROBES
========================================================= */

async function httpGet(path = "", options = {}) {
  const endpoint = cleanText(path, "");

  if (!endpoint) {
    throw new Error("SERVER_ENDPOINT_REQUIRED");
  }

  const startedAt = performanceNow();

  let response;

  if (isFunction(Http?.get)) {
    response = await Http.get(endpoint, {
      timeout: number(options.timeout, SERVER_REQUEST_TIMEOUT_MS),
      query: safeObject(options.query),
      headers: safeObject(options.headers),
      source: cleanText(options.source, SERVIDOR_INDEX_SOURCE),
    });
  } else if (isFunction(Http?.request)) {
    response = await Http.request(endpoint, {
      method: "GET",
      timeout: number(options.timeout, SERVER_REQUEST_TIMEOUT_MS),
      query: safeObject(options.query),
      headers: safeObject(options.headers),
      source: cleanText(options.source, SERVIDOR_INDEX_SOURCE),
    });
  } else {
    throw new Error("HTTP_CORE_UNAVAILABLE");
  }

  const latencyMs = Math.max(0, Math.round(performanceNow() - startedAt));

  return {
    endpoint,
    latencyMs,
    response,
  };
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

async function probeEndpointGroup(group = "", endpoints = []) {
  const name = cleanText(group, "unknown");
  const list = safeArray(endpoints);
  const errors = [];

  for (const endpoint of list) {
    try {
      const result = await httpGet(endpoint, {
        timeout: SERVER_REQUEST_TIMEOUT_MS,
        source: `views.server.${name}`,
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

async function loadServerSnapshot() {
  const groups = Object.entries(ENDPOINT_GROUPS);

  const results = await Promise.all(
    groups.map(([group, endpoints]) => probeEndpointGroup(group, endpoints))
  );

  return normalizeSnapshot(results);
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
  return {
    id: normalizeKey(id || label || endpoint || "service"),
    label: cleanText(label, "Servicio"),
    status: normalizeStatus(status),
    statusLabel: labelForStatus(status),
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

function normalizeSnapshot(results = []) {
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
    version: SERVIDOR_INDEX_VERSION,
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
      results.map((result) => [
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

function createEmptySnapshot() {
  return {
    version: SERVIDOR_INDEX_VERSION,
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
   RENDER
========================================================= */

function icon(name = "") {
  const common = [
    'aria-hidden="true"',
    'focusable="false"',
    'width="18"',
    'height="18"',
    'viewBox="0 0 24 24"',
    'fill="none"',
    'stroke="currentColor"',
    'stroke-width="2"',
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
  ].join(" ");

  const icons = {
    server: `<svg ${common}><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/></svg>`,
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    live: `<svg ${common}><path d="M4 12a8 8 0 0 1 8-8"/><path d="M4 12a8 8 0 0 0 8 8"/><path d="M20 12a8 8 0 0 0-8-8"/><path d="M20 12a8 8 0 0 1-8 8"/><circle cx="12" cy="12" r="2"/></svg>`,
    copy: `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    cpu: `<svg ${common}><rect width="14" height="14" x="5" y="5" rx="2"/><path d="M9 1v4"/><path d="M15 1v4"/><path d="M9 19v4"/><path d="M15 19v4"/><path d="M1 9h4"/><path d="M1 15h4"/><path d="M19 9h4"/><path d="M19 15h4"/></svg>`,
    db: `<svg ${common}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></svg>`,
    cloud: `<svg ${common}><path d="M17.5 19H8a6 6 0 1 1 5.6-8.1A4.5 4.5 0 1 1 17.5 19z"/></svg>`,
    memory: `<svg ${common}><path d="M6 19v-3"/><path d="M10 19v-3"/><path d="M14 19v-3"/><path d="M18 19v-3"/><path d="M8 5V2"/><path d="M16 5V2"/><rect width="16" height="11" x="4" y="5" rx="2"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  };

  return icons[name] || icons.server;
}

function serviceIcon(service = {}) {
  const id = normalizeKey(service.id);

  if (id.includes("database") || id.includes("db")) return icon("db");
  if (id.includes("blob") || id.includes("storage") || id.includes("azure")) return icon("cloud");
  if (id.includes("cpu")) return icon("cpu");
  if (id.includes("memory") || id.includes("ram")) return icon("memory");

  return icon("server");
}

function renderServiceCard(service = {}) {
  const status = normalizeStatus(service.status);

  return `
    <article class="server-service-card server-service-card--${attr(status)}" data-server-service="${attr(service.id)}" data-status="${attr(status)}">
      <div class="server-service-icon">
        ${serviceIcon(service)}
      </div>

      <div class="server-service-copy">
        <span class="server-service-label">${escapeHtml(service.label)}</span>
        <strong class="server-service-value">${escapeHtml(service.value || service.statusLabel)}</strong>
        <span class="server-service-detail">${escapeHtml(service.detail || service.endpoint || "Sin detalle")}</span>
      </div>

      <span class="server-status-chip server-status-chip--${attr(status)}">
        <span class="server-status-dot" aria-hidden="true"></span>
        ${escapeHtml(service.statusLabel)}
      </span>

      ${
        service.latencyMs !== null && service.latencyMs !== undefined
          ? `<span class="server-service-latency">${escapeHtml(formatMs(service.latencyMs))}</span>`
          : ""
      }
    </article>
  `;
}

function renderEndpointRow([key, endpoint] = []) {
  const status = endpoint?.ok ? "healthy" : "critical";

  return `
    <tr class="server-endpoint-row server-endpoint-row--${attr(status)}">
      <td>${escapeHtml(key)}</td>
      <td>${escapeHtml(endpoint?.endpoint || "No disponible")}</td>
      <td>${escapeHtml(endpoint?.latencyMs === null || endpoint?.latencyMs === undefined ? "—" : formatMs(endpoint.latencyMs))}</td>
      <td>${escapeHtml(endpoint?.ok ? "OK" : endpoint?.error || "KO")}</td>
    </tr>
  `;
}

function renderServerTemplate(state = {}) {
  const snapshot = safeObject(state.snapshot, createEmptySnapshot());
  const status = normalizeStatus(snapshot.status);
  const services = safeArray(snapshot.services);
  const endpoints = Object.entries(safeObject(snapshot.endpoints));
  const loading = Boolean(state.loading);
  const refreshing = Boolean(state.refreshing);
  const live = Boolean(state.live);
  const error = cleanText(state.error, "");

  return `
    <section
      class="server-view-root servidor-view-root"
      data-server-scope="true"
      data-servidor-scope="true"
      data-view="servidor"
      data-status="${attr(status)}"
      data-loading="${loading ? "true" : "false"}"
      data-refreshing="${refreshing ? "true" : "false"}"
      data-live="${live ? "true" : "false"}"
    >
      <section class="server-hero servidor-hero">
        <div class="server-hero-top">
          <div class="server-hero-copy">
            <p class="server-kicker">Onion Observability</p>
            <h1 class="server-title">Estado del servidor</h1>
            <p class="server-subtitle">
              Backend, base de datos, blobs, Azure, CPU, RAM y métricas operativas en tiempo real.
            </p>
          </div>

          <div class="server-hero-actions">
            <button
              type="button"
              class="server-btn"
              data-server-action="refresh"
              data-action="refresh-server"
              ${refreshing || loading ? 'disabled aria-disabled="true"' : ""}
            >
              ${icon("refresh")}
              <span>${refreshing || loading ? "Consultando" : "Actualizar"}</span>
            </button>

            <button
              type="button"
              class="server-btn ${live ? "is-active" : ""}"
              data-server-action="toggle-live"
              data-action="toggle-live"
              aria-pressed="${live ? "true" : "false"}"
            >
              ${icon("live")}
              <span>${live ? "Live activo" : "Live off"}</span>
            </button>

            <button
              type="button"
              class="server-btn"
              data-server-action="copy-json"
              data-action="copy-json"
              ${!snapshot.checkedAt ? 'disabled aria-disabled="true"' : ""}
            >
              ${icon("copy")}
              <span>Copiar JSON</span>
            </button>
          </div>
        </div>

        <div class="server-hero-meta">
          <span class="server-meta-pill server-meta-pill--${attr(status)}">
            ${icon("server")}
            <span>${escapeHtml(snapshot.statusLabel)}</span>
          </span>

          <span class="server-meta-pill">
            ${icon("clock")}
            <span>${escapeHtml(snapshot.checkedAt ? `Última consulta · ${formatDateTime(snapshot.checkedAt)}` : "Pendiente de consulta")}</span>
          </span>

          <span class="server-meta-pill">
            ${icon("clock")}
            <span>Uptime · ${escapeHtml(snapshot.uptimeLabel || "—")}</span>
          </span>

          <span class="server-meta-pill">
            ${icon("server")}
            <span>Latencia · ${escapeHtml(snapshot.latencyLabel || "—")}</span>
          </span>
        </div>

        <div class="server-stats">
          <article class="server-stat-card server-stat-card--status">
            <span class="server-stat-label">Estado general</span>
            <strong class="server-stat-value">${escapeHtml(snapshot.statusLabel)}</strong>
            <span class="server-stat-text">Peor estado detectado entre servicios críticos.</span>
          </article>

          <article class="server-stat-card server-stat-card--cpu">
            <span class="server-stat-label">CPU</span>
            <strong class="server-stat-value">${escapeHtml(snapshot.cpuUsageLabel || "—")}</strong>
            <span class="server-stat-text">Uso actual reportado por backend.</span>
          </article>

          <article class="server-stat-card server-stat-card--memory">
            <span class="server-stat-label">RAM</span>
            <strong class="server-stat-value">${escapeHtml(snapshot.memoryUsageLabel || "—")}</strong>
            <span class="server-stat-text">${escapeHtml(snapshot.memoryLabel || "Uso de memoria.")}</span>
          </article>

          <article class="server-stat-card server-stat-card--services">
            <span class="server-stat-label">Servicios</span>
            <strong class="server-stat-value">${escapeHtml(String(services.length))}</strong>
            <span class="server-stat-text">Backend, BD, blobs, Azure y recursos.</span>
          </article>
        </div>
      </section>

      ${
        error
          ? `
            <div class="server-error" role="alert">
              <strong>No se pudo completar la consulta.</strong>
              <span>${escapeHtml(error)}</span>
            </div>
          `
          : ""
      }

      <section class="server-dashboard">
        <header class="server-section-head">
          <div>
            <p class="server-section-kicker">STATUS</p>
            <h2 class="server-section-title">Servicios monitorizados</h2>
          </div>
        </header>

        <div class="server-services-grid">
          ${services.map((service) => renderServiceCard(service)).join("")}
        </div>
      </section>

      <section class="server-dashboard server-dashboard--endpoints">
        <header class="server-section-head">
          <div>
            <p class="server-section-kicker">ENDPOINTS</p>
            <h2 class="server-section-title">Rutas detectadas</h2>
          </div>
        </header>

        <div class="server-table-shell">
          <table class="server-table">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Endpoint</th>
                <th>Latencia</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              ${
                endpoints.length
                  ? endpoints.map(renderEndpointRow).join("")
                  : `
                    <tr>
                      <td colspan="4">
                        <div class="server-empty">
                          <strong>Sin endpoints detectados.</strong>
                          <span>Pulsa actualizar para consultar el backend.</span>
                        </div>
                      </td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </div>
      </section>

      ${
        loading
          ? `
            <div class="server-loading" role="status" aria-live="polite">
              <span class="server-spinner" aria-hidden="true"></span>
              <span>Consultando estado del sistema…</span>
            </div>
          `
          : ""
      }
    </section>
  `;
}

/* =========================================================
   CONTROLLER
========================================================= */

function createController(host = null, context = {}) {
  const state = {
    host: resolveHost(host, context),
    context: safeObject(context),

    snapshot: createEmptySnapshot(),

    loading: false,
    refreshing: false,
    loaded: false,
    error: "",

    live: false,
    liveTimer: 0,

    mounted: false,
    destroyed: false,

    loadToken: 0,
  };

  function getSnapshot() {
    return {
      version: SERVIDOR_INDEX_VERSION,
      snapshot: state.snapshot,
      loading: state.loading,
      refreshing: state.refreshing,
      loaded: state.loaded,
      error: state.error,
      live: state.live,
      context: state.context,
    };
  }

  function setHost(nextHost = null) {
    const resolved = resolveHost(nextHost, state.context);

    if (resolved) {
      state.host = resolved;
    }

    return state.host;
  }

  async function paint() {
    if (!state.host || state.destroyed) return false;

    state.host.innerHTML = renderServerTemplate(getSnapshot());

    try {
      state.host.dataset.view = "servidor";
      state.host.dataset.serverController = SERVIDOR_INDEX_VERSION;
    } catch {
      // noop
    }

    return true;
  }

  async function load({ silent = false, force = false } = {}) {
    if (state.destroyed || !isServidorRoute(state.context)) {
      return getSnapshot();
    }

    const token = ++state.loadToken;

    state.error = "";
    state.loading = !silent && !state.loaded;
    state.refreshing = silent || state.loaded;

    await paint();

    try {
      const snapshot = await loadServerSnapshot();

      if (token !== state.loadToken || state.destroyed) {
        return getSnapshot();
      }

      state.snapshot = snapshot;
      state.loaded = true;
      state.error = "";

      emitEvent("server:status:loaded", getSnapshot());
      emitEvent("servidor:status:loaded", getSnapshot());

      return getSnapshot();
    } catch (error) {
      if (token !== state.loadToken || state.destroyed) {
        return getSnapshot();
      }

      state.error = safeError(error);
      state.snapshot = {
        ...state.snapshot,
        status: "critical",
        statusLabel: "Error",
        checkedAt: nowIso(),
      };

      emitEvent("server:status:error", {
        error,
        message: state.error,
      });

      return getSnapshot();
    } finally {
      if (token === state.loadToken && !state.destroyed) {
        state.loading = false;
        state.refreshing = false;
        await paint();
      }
    }
  }

  async function refresh() {
    return load({
      force: true,
      silent: true,
    });
  }

  function startLive() {
    if (state.liveTimer || state.destroyed) {
      state.live = true;
      paint();
      return true;
    }

    state.live = true;

    state.liveTimer = window.setInterval?.(() => {
      refresh();
    }, SERVER_REFRESH_INTERVAL_MS) || 0;

    showToast("Tiempo real activado.", "success");
    paint();

    return true;
  }

  function stopLive() {
    state.live = false;

    if (state.liveTimer && isBrowser()) {
      window.clearInterval?.(state.liveTimer);
    }

    state.liveTimer = 0;

    showToast("Tiempo real pausado.", "info");
    paint();

    return true;
  }

  function toggleLive() {
    return state.live ? stopLive() : startLive();
  }

  async function copyJson() {
    const json = JSON.stringify(state.snapshot, null, 2);

    try {
      await navigator.clipboard?.writeText?.(json);
      showToast("Snapshot copiado.", "success");
      return true;
    } catch {
      showToast("No se pudo copiar automáticamente.", "warning");
      return false;
    }
  }

  async function handleClick(event) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const element = target.closest("[data-server-action], [data-servidor-action], [data-action]");
    if (!element) return;

    const action = cleanText(
      element.getAttribute("data-server-action") ||
        element.getAttribute("data-servidor-action") ||
        element.getAttribute("data-action") ||
        "",
      ""
    );

    if (!action) return;

    if (
      [
        ACTIONS.REFRESH,
        ACTIONS.REFRESH_SERVER,
        ACTIONS.REFRESH_HEALTH,
        ACTIONS.LOAD_HEALTH,
        ACTIONS.TOGGLE_LIVE,
        ACTIONS.COPY_JSON,
      ].includes(action)
    ) {
      event.preventDefault();
    }

    if (
      action === ACTIONS.REFRESH ||
      action === ACTIONS.REFRESH_SERVER ||
      action === ACTIONS.REFRESH_HEALTH ||
      action === ACTIONS.LOAD_HEALTH
    ) {
      await refresh();
      return;
    }

    if (action === ACTIONS.TOGGLE_LIVE) {
      toggleLive();
      return;
    }

    if (action === ACTIONS.COPY_JSON) {
      await copyJson();
    }
  }

  function attach() {
    if (!state.host || state.mounted) return false;

    state.host.addEventListener("click", handleClick);
    state.mounted = true;

    return true;
  }

  function detach() {
    if (!state.host) {
      state.mounted = false;
      return false;
    }

    try {
      state.host.removeEventListener("click", handleClick);
    } catch {
      // noop
    }

    state.mounted = false;

    return true;
  }

  async function mount(nextHost = null, nextContext = {}) {
    if (state.destroyed) return getSnapshot();

    state.context = {
      ...state.context,
      ...safeObject(nextContext),
    };

    setHost(nextHost);

    if (!state.host) {
      throw new Error("SERVER_HOST_NOT_FOUND");
    }

    if (!isServidorRoute(state.context)) {
      return getSnapshot();
    }

    attach();
    await paint();

    if (!state.loaded) {
      await load({ force: true, silent: false });
    }

    return getSnapshot();
  }

  async function destroy({ clear = true } = {}) {
    state.destroyed = true;
    state.loadToken += 1;

    stopLive();
    detach();

    if (clear && state.host) {
      state.host.innerHTML = "";
    }

    if (activeController === controller) {
      activeController = null;
    }

    const global = getGlobalObject();

    try {
      if (global[SERVER_CONTROLLER_KEY] === controller) {
        delete global[SERVER_CONTROLLER_KEY];
      }
    } catch {
      // noop
    }

    return true;
  }

  const controller = {
    state,

    getSnapshot,
    getState: getSnapshot,

    mount,
    init: mount,
    bootstrap: mount,
    render: mount,

    load,
    reload: refresh,
    refresh,

    startLive,
    stopLive,
    toggleLive,

    copyJson,

    destroy,
    unmount: destroy,
    dispose: destroy,
  };

  return controller;
}

/* =========================================================
   PUBLIC API
========================================================= */

function ensureController(host = null, context = {}) {
  if (activeController && !activeController.state.destroyed) {
    if (host) {
      activeController.state.host = resolveHost(host, context) || activeController.state.host;
    }

    activeController.state.context = {
      ...activeController.state.context,
      ...safeObject(context),
    };

    return activeController;
  }

  activeController = createController(host, context);

  const global = getGlobalObject();

  try {
    global[SERVER_CONTROLLER_KEY] = activeController;
  } catch {
    // noop
  }

  return activeController;
}

export async function init(hostOrContext = null, maybeContext = {}) {
  const host = isNode(hostOrContext) ? hostOrContext : null;
  const context = isNode(hostOrContext)
    ? safeObject(maybeContext)
    : safeObject(hostOrContext);

  const controller = ensureController(host, context);
  return controller.mount(host, context);
}

export async function mount(hostOrContext = null, maybeContext = {}) {
  return init(hostOrContext, maybeContext);
}

export async function bootstrap(hostOrContext = null, maybeContext = {}) {
  return init(hostOrContext, maybeContext);
}

export async function render(hostOrContext = null, maybeContext = {}) {
  return init(hostOrContext, maybeContext);
}

export async function reload() {
  return ensureController().refresh();
}

export async function refresh() {
  return ensureController().refresh();
}

export async function destroy(options = {}) {
  if (!activeController) return true;
  return activeController.destroy(options);
}

export async function unmount(options = {}) {
  return destroy(options);
}

export async function dispose(options = {}) {
  return destroy(options);
}

export function getState() {
  return ensureController().getSnapshot();
}

export function getSnapshot() {
  return getState();
}

export async function loadServerHealth(options = {}) {
  return ensureController().load(options);
}

export async function loadServerSnapshotPublic(options = {}) {
  return ensureController().load(options);
}

export function startServerLive() {
  return ensureController().startLive();
}

export function stopServerLive() {
  return ensureController().stopLive();
}

export function toggleServerLive() {
  return ensureController().toggleLive();
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const ServidorView = {
  version: SERVIDOR_INDEX_VERSION,

  init,
  mount,
  bootstrap,
  render,

  reload,
  refresh,

  destroy,
  unmount,
  dispose,

  getState,
  getSnapshot,

  loadServerHealth,
  loadServerSnapshot: loadServerSnapshotPublic,

  startLive: startServerLive,
  stopLive: stopServerLive,
  toggleLive: toggleServerLive,
};

export const ServerView = ServidorView;

try {
  const global = getGlobalObject();

  global.ServidorView = ServidorView;
  global.ServerView = ServidorView;
  global.OnionServidorView = ServidorView;
  global.OnionServerView = ServidorView;

  if (AppCore?.modules && typeof AppCore.modules === "object") {
    AppCore.modules.Servidor = ServidorView;
    AppCore.modules.Server = ServidorView;
    AppCore.modules.servidor = ServidorView;
    AppCore.modules.server = ServidorView;
  }
} catch {
  // noop
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default ServidorView;
