/* =========================================================
   Onion SPA - Server Model
   Archivo: src/views/server/server.model.js

   FULL PRO 10/10

   RESPONSABILIDADES:
   - normalizar payloads heterogéneos backend/store del módulo server
   - exponer modelo consistente Server Snapshot / Service / Telemetry
   - labels de estado / tipo
   - flags computados
   - icon / initials / theme
   - fechas base
   - collections helpers
   - sorting helpers
   - stats helpers
   - defensive parsing enterprise ready

   USO:
   import {
     normalizeServerSnapshotModel,
     normalizeServerServiceModel,
     normalizeServerServicesCollection,
     computeServerServicesStats
   } from "./server.model.js";
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 6;

export const SERVER_STATUS = Object.freeze({
  OK: "ok",
  WARNING: "warning",
  ERROR: "error",
  UNKNOWN: "unknown",
  DISABLED: "disabled",
});

export const SERVER_TYPE = Object.freeze({
  SERVICE: "service",
  API: "api",
  DB: "db",
  SYSTEM: "system",
  RUNTIME: "runtime",
  ENVIRONMENT: "environment",
  TELEMETRY: "telemetry",
  METRIC: "metric",
  HEALTH: "health",
  SERVER: "server",
});

/* =========================================================
   SAFE CORE
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
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
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

/* =========================================================
   IDS / HASH
========================================================= */

function hashString(value = "") {
  const str = String(value || "server");
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

/* =========================================================
   LABEL MAPS
========================================================= */

export function normalizeServerStatus(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "ok":
    case "up":
    case "healthy":
    case "online":
    case "success":
    case "operativa":
    case "operativo":
      return SERVER_STATUS.OK;

    case "warning":
    case "pending":
    case "degraded":
    case "slow":
    case "revisar":
      return SERVER_STATUS.WARNING;

    case "error":
    case "critical":
    case "down":
    case "offline":
    case "failed":
      return SERVER_STATUS.ERROR;

    case "disabled":
    case "off":
      return SERVER_STATUS.DISABLED;

    default:
      return SERVER_STATUS.UNKNOWN;
  }
}

export function normalizeServerType(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "service":
      return SERVER_TYPE.SERVICE;

    case "api":
      return SERVER_TYPE.API;

    case "db":
    case "database":
    case "cosmos":
      return SERVER_TYPE.DB;

    case "system":
    case "host":
    case "infra":
      return SERVER_TYPE.SYSTEM;

    case "runtime":
    case "node":
    case "v8":
      return SERVER_TYPE.RUNTIME;

    case "environment":
    case "env":
    case "azure":
    case "container":
      return SERVER_TYPE.ENVIRONMENT;

    case "telemetry":
      return SERVER_TYPE.TELEMETRY;

    case "metric":
      return SERVER_TYPE.METRIC;

    case "health":
      return SERVER_TYPE.HEALTH;

    default:
      return SERVER_TYPE.SERVER;
  }
}

export function getServerStatusLabel(value = "") {
  switch (normalizeServerStatus(value)) {
    case SERVER_STATUS.OK:
      return "Operativo";

    case SERVER_STATUS.WARNING:
      return "Atención";

    case SERVER_STATUS.ERROR:
      return "Error";

    case SERVER_STATUS.DISABLED:
      return "Desactivado";

    case SERVER_STATUS.UNKNOWN:
    default:
      return "Desconocido";
  }
}

export function getServerTypeLabel(value = "") {
  switch (normalizeServerType(value)) {
    case SERVER_TYPE.SERVICE:
      return "Servicio";

    case SERVER_TYPE.API:
      return "API";

    case SERVER_TYPE.DB:
      return "Base de datos";

    case SERVER_TYPE.SYSTEM:
      return "Sistema";

    case SERVER_TYPE.RUNTIME:
      return "Runtime";

    case SERVER_TYPE.ENVIRONMENT:
      return "Entorno";

    case SERVER_TYPE.TELEMETRY:
      return "Telemetría";

    case SERVER_TYPE.METRIC:
      return "Métrica";

    case SERVER_TYPE.HEALTH:
      return "Health";

    case SERVER_TYPE.SERVER:
    default:
      return "Servidor";
  }
}

/* =========================================================
   DATES
========================================================= */

export function toDate(value = null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function toTimestamp(value = null) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

/* =========================================================
   INITIALS / THEME
========================================================= */

export function getInitials(value = "") {
  const text = safeText(value, "SV");

  const parts = text.split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return "SV";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || "SV").toUpperCase();
}

export function getServerTheme(seed = "") {
  const themes = [
    "violet",
    "emerald",
    "blue",
    "amber",
    "rose",
    "purple",
    "cyan",
    "orange",
  ];

  return themes[
    hashString(seed) % themes.length
  ];
}

/* =========================================================
   HELPERS DE VALOR
========================================================= */

function normalizeTags(value = null) {
  if (Array.isArray(value)) {
    return value
      .map((tag) => safeText(tag, ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => safeText(tag, ""))
      .filter(Boolean);
  }

  return [];
}

function normalizeLatency(value = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePercent(value = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/* =========================================================
   SERVICE NORMALIZER
========================================================= */

export function normalizeServerServiceModel(
  payload = {}
) {
  const item = safeObject(payload);

  const serviceId = safeText(
    first(
      item.serviceId,
      item.id,
      item.key,
      item.slug,
      item.code,
      item.name,
      item.service
    ),
    ""
  );

  const title = safeText(
    first(
      item.title,
      item.name,
      item.label,
      item.heading,
      item.service
    ),
    "Servicio"
  );

  const description = safeText(
    first(
      item.description,
      item.descripcion,
      item.subtitle,
      item.summary,
      item.text,
      item.detail
    ),
    "Sin descripción."
  );

  const type = normalizeServerType(
    first(
      item.type,
      item.kind,
      item.variant,
      item.category,
      item.sectionType
    )
  );

  const status = normalizeServerStatus(
    first(
      item.status,
      item.estado,
      item.state
    )
  );

  const latencyMs = normalizeLatency(
    first(
      item.latencyMs,
      item.latency,
      item.responseTime,
      item.ms
    )
  );

  const percent = normalizePercent(
    first(
      item.percent,
      item.usage,
      item.cpuPercent,
      item.ramPercent,
      item.diskPercent
    )
  );

  const value = first(
    item.value,
    item.total,
    item.amount,
    item.count,
    item.metric,
    latencyMs,
    percent
  );

  const route = safeText(
    first(
      item.route,
      item.href,
      item.link,
      item.to
    ),
    ""
  );

  const icon = safeText(
    first(
      item.icon,
      item.emoji,
      item.symbol
    ),
    ""
  );

  const updatedAt = first(
    item.updatedAt,
    item.lastUpdate,
    item.modifiedAt,
    item.createdAt,
    item.timestamp,
    item.generatedAt,
    item.loadedAt
  );

  const tags = normalizeTags(
    first(
      item.tags,
      item.labels,
      item.badges
    )
  );

  const metadata = safeObject(
    first(
      item.metadata,
      item.meta,
      item.info
    )
  );

  const numericValue = Number(value);

  const hasLatency = latencyMs !== null;
  const hasPercent = percent !== null;
  const hasRoute = Boolean(route);

  const isOk =
    status === SERVER_STATUS.OK;

  const isWarning =
    status === SERVER_STATUS.WARNING;

  const isError =
    status === SERVER_STATUS.ERROR;

  const isDisabled =
    status === SERVER_STATUS.DISABLED;

  const isUnknown =
    status === SERVER_STATUS.UNKNOWN;

  const isService =
    type === SERVER_TYPE.SERVICE;

  const isApi =
    type === SERVER_TYPE.API;

  const isDb =
    type === SERVER_TYPE.DB;

  const isSystem =
    type === SERVER_TYPE.SYSTEM;

  const isRuntime =
    type === SERVER_TYPE.RUNTIME;

  const isEnvironment =
    type === SERVER_TYPE.ENVIRONMENT;

  const isTelemetry =
    type === SERVER_TYPE.TELEMETRY;

  const isMetric =
    type === SERVER_TYPE.METRIC;

  const isHealth =
    type === SERVER_TYPE.HEALTH;

  return {
    /* identity */
    serviceId,
    id: serviceId,

    /* content */
    title,
    description,
    icon,

    /* enums */
    type,
    typeLabel:
      getServerTypeLabel(type),

    status,
    statusLabel:
      getServerStatusLabel(status),

    /* values */
    value,
    numericValue:
      Number.isFinite(numericValue)
        ? numericValue
        : null,

    latencyMs,
    percent,

    /* route */
    route,

    /* visuals */
    initials: getInitials(
      title || serviceId || "SV"
    ),
    theme: getServerTheme(
      serviceId || title || route
    ),

    /* metadata */
    tags,
    tagsCount: tags.length,
    metadata,

    /* dates */
    updatedAt,
    updatedAtTs:
      toTimestamp(updatedAt),

    /* flags */
    hasLatency,
    hasPercent,
    hasRoute,

    isOk,
    isWarning,
    isError,
    isDisabled,
    isUnknown,

    isService,
    isApi,
    isDb,
    isSystem,
    isRuntime,
    isEnvironment,
    isTelemetry,
    isMetric,
    isHealth,

    /* raw */
    raw: item,
  };
}

/* =========================================================
   SERVICES COLLECTION
========================================================= */

function buildServicesFromTelemetry(telemetry = {}) {
  const root = safeObject(telemetry);
  const services = safeObject(root.services);

  const entries = Object.entries(services);

  return entries.map(([key, value]) => {
    const item = safeObject(value);

    return normalizeServerServiceModel({
      serviceId: key,
      name: key,
      title: first(
        item.title,
        key
      ),
      description: first(
        item.detail,
        item.description,
        item.summary
      ),
      type: first(
        item.type,
        key === "api"
          ? "api"
          : key === "cosmos" || key === "db"
            ? "db"
            : "service"
      ),
      status: item.status,
      latencyMs: first(
        item.latencyMs,
        item.latency
      ),
      route: item.route,
      metadata: item,
      updatedAt: root?.global?.timestamp || null,
      raw: item,
    });
  });
}

export function normalizeServerServicesCollection(
  payload = []
) {
  if (Array.isArray(payload)) {
    return payload.map(
      normalizeServerServiceModel
    );
  }

  const obj = safeObject(payload);

  if (Array.isArray(obj.services)) {
    return obj.services.map(
      normalizeServerServiceModel
    );
  }

  if (
    obj.services &&
    typeof obj.services === "object"
  ) {
    return buildServicesFromTelemetry({
      services: obj.services,
      global: obj.global,
    });
  }

  return [];
}

/* =========================================================
   TELEMETRY BLOCKS
========================================================= */

function normalizeTelemetryServerBlock(server = {}) {
  const item = safeObject(server);

  return {
    cpuPercent: normalizePercent(item.cpuPercent),
    cpuLoad: item.cpuLoad ?? null,
    cpuCores: item.cpuCores ?? null,
    cpuModel: safeText(item.cpuModel, ""),
    cpuSpeedMHz: item.cpuSpeedMHz ?? null,

    ramPercent: normalizePercent(item.ramPercent),
    ramUsedMB: item.ramUsedMB ?? null,
    ramTotalMB: item.ramTotalMB ?? null,
    ramFreeMB: item.ramFreeMB ?? null,
    ramUsedGB: item.ramUsedGB ?? null,
    ramTotalGB: item.ramTotalGB ?? null,
    ramFreeGB: item.ramFreeGB ?? null,

    diskPercent: normalizePercent(item.diskPercent),
    diskUsedGB: item.diskUsedGB ?? null,
    diskTotalGB: item.diskTotalGB ?? null,
    diskFreeGB: item.diskFreeGB ?? null,
    diskMount: safeText(item.diskMount, ""),
    diskSource: safeText(item.diskSource, ""),
    diskModel: safeText(item.diskModel, ""),
    diskVendor: safeText(item.diskVendor, ""),
    diskDevice: safeText(item.diskDevice, ""),
    diskMediaType: safeText(item.diskMediaType, ""),
    diskAvailable: Boolean(item.diskAvailable),

    hostname: safeText(item.hostname, ""),
    osName: safeText(item.osName, ""),
    osPlatform: safeText(item.osPlatform, ""),
    osVersion: safeText(item.osVersion, ""),
    arch: safeText(item.arch, ""),
    hostUptime: safeText(item.hostUptime, ""),
    processUptime: safeText(item.processUptime, ""),
    eventLoopLag: normalizeLatency(item.eventLoopLag),

    raw: item,
  };
}

function normalizeTelemetryRuntimeBlock(runtime = {}) {
  const item = safeObject(runtime);

  return {
    nodeVersion: safeText(item.nodeVersion, ""),
    nodePid: item.nodePid ?? null,
    nodeExecPath: safeText(item.nodeExecPath, ""),
    nodeCwd: safeText(item.nodeCwd, ""),
    rssMB: item.rssMB ?? null,
    heapUsedMB: item.heapUsedMB ?? null,
    heapTotalMB: item.heapTotalMB ?? null,
    externalMB: item.externalMB ?? null,
    arrayBuffersMB: item.arrayBuffersMB ?? null,
    heapLimitMB: item.heapLimitMB ?? null,
    mallocedMB: item.mallocedMB ?? null,
    raw: item,
  };
}

function normalizeTelemetryEnvironmentBlock(environment = {}) {
  const item = safeObject(environment);

  return {
    env: safeText(item.env, ""),
    timezone: safeText(item.timezone, ""),
    azureSiteName: safeText(item.azureSiteName, ""),
    azureHostname: safeText(item.azureHostname, ""),
    azureInstanceId: safeText(item.azureInstanceId, ""),
    azureRegion: safeText(item.azureRegion, ""),
    azureSku: safeText(item.azureSku, ""),
    containerHostname: safeText(item.containerHostname, ""),
    inContainer: Boolean(item.inContainer),
    raw: item,
  };
}

function normalizeTelemetryApiBlock(api = {}) {
  const item = safeObject(api);

  return {
    status: normalizeServerStatus(item.status),
    statusLabel: getServerStatusLabel(item.status),
    latencyMs: normalizeLatency(item.latencyMs),
    frontendLatencyMs: normalizeLatency(item.frontendLatencyMs),
    label: safeText(item.label, ""),
    raw: item,
  };
}

function normalizeTelemetryDbBlock(db = {}) {
  const item = safeObject(db);

  return {
    status: normalizeServerStatus(item.status),
    statusLabel: getServerStatusLabel(item.status),
    latencyMs: normalizeLatency(item.latencyMs),
    ok: Boolean(item.ok),
    errorMessage: safeText(item.errorMessage, ""),
    raw: item,
  };
}

function normalizeTelemetryGlobalBlock(global = {}) {
  const item = safeObject(global);

  return {
    ok: Boolean(item.ok),
    status: normalizeServerStatus(item.status),
    statusLabel: getServerStatusLabel(item.status),
    service: safeText(item.service, "onion-backend"),
    timestamp: item.timestamp || null,
    timestampTs: toTimestamp(item.timestamp),
    raw: item,
  };
}

function normalizeTelemetryDashboardBlock(dashboard = {}) {
  const item = safeObject(dashboard);

  return {
    generatedAt: item.generatedAt || null,
    generatedAtTs: toTimestamp(item.generatedAt),
    scope: safeText(item.scope, ""),
    isAdmin: Boolean(item.isAdmin),

    totalFacturas: safeNumber(item.totalFacturas, 0),
    totalFacturado: safeNumber(item.totalFacturado, 0),
    totalCobrado: safeNumber(item.totalCobrado, 0),
    totalPendiente: safeNumber(item.totalPendiente, 0),
    ticketsActivos: safeNumber(item.ticketsActivos, 0),
    ticketsUrgentes: safeNumber(item.ticketsUrgentes, 0),
    totalClientes: safeNumber(item.totalClientes, 0),
    totalUsuarios: safeNumber(item.totalUsuarios, 0),
    topClientesCount: safeNumber(item.topClientesCount, 0),

    raw: item,
  };
}

/* =========================================================
   SNAPSHOT UNWRAP
========================================================= */

export function unwrapServerSnapshotPayload(
  payload = null
) {
  if (!payload) return {};

  const obj = safeObject(payload);

  if (
    obj.data &&
    typeof obj.data === "object"
  ) {
    return unwrapServerSnapshotPayload(
      obj.data
    );
  }

  if (
    obj.payload &&
    typeof obj.payload === "object"
  ) {
    return unwrapServerSnapshotPayload(
      obj.payload
    );
  }

  if (
    obj.result &&
    typeof obj.result === "object"
  ) {
    return unwrapServerSnapshotPayload(
      obj.result
    );
  }

  return obj;
}

/* =========================================================
   SNAPSHOT NORMALIZER
========================================================= */

export function normalizeServerSnapshotModel(
  payload = {}
) {
  const root =
    safeObject(
      unwrapServerSnapshotPayload(
        payload
      )
    );

  const dashboardPayload = safeObject(
    first(
      root.dashboardPayload,
      root.dashboard,
      root.dashboardData
    )
  );

  const healthPayload = safeObject(
    first(
      root.healthPayload,
      root.health,
      root.healthData
    )
  );

  const telemetryRaw = safeObject(
    first(
      root.telemetry,
      root.snapshot,
      {}
    )
  );

  const telemetry = {
    global: normalizeTelemetryGlobalBlock(
      telemetryRaw.global
    ),

    dashboard: normalizeTelemetryDashboardBlock(
      telemetryRaw.dashboard
    ),

    api: normalizeTelemetryApiBlock(
      telemetryRaw.api
    ),

    db: normalizeTelemetryDbBlock(
      telemetryRaw.db
    ),

    server: normalizeTelemetryServerBlock(
      telemetryRaw.server
    ),

    runtime: normalizeTelemetryRuntimeBlock(
      telemetryRaw.runtime
    ),

    environment: normalizeTelemetryEnvironmentBlock(
      telemetryRaw.environment
    ),

    services: safeObject(telemetryRaw.services),
    raw: telemetryRaw,
  };

  const services =
    normalizeServerServicesCollection({
      services: telemetry.services,
      global: telemetry.global,
    });

  const history = safeObject(
    first(
      root.history,
      {}
    )
  );

  const browserMetrics = safeObject(
    first(
      root.browserMetrics,
      {}
    )
  );

  const environmentMetrics = safeObject(
    first(
      root.environmentMetrics,
      {}
    )
  );

  const dashboardLatencyMs = normalizeLatency(
    first(
      root.dashboardLatencyMs,
      root.dashboardLatency
    )
  );

  const healthLatencyMs = normalizeLatency(
    first(
      root.healthLatencyMs,
      root.healthLatency
    )
  );

  const loadedAt = first(
    root.loadedAt,
    telemetry.global.timestamp
  );

  return {
    dashboardPayload,
    healthPayload,
    telemetry,
    services,
    servicesCount: services.length,

    history,
    browserMetrics,
    environmentMetrics,

    dashboardLatencyMs,
    healthLatencyMs,

    loadedAt,
    loadedAtTs: toTimestamp(loadedAt),

    requestId: safeText(
      first(
        root.requestId,
        root.meta?.requestId
      ),
      ""
    ),

    raw: root,
  };
}

/* =========================================================
   SORT
========================================================= */

export function sortServerServicesByLatencyDesc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      safeNumber(
        b.latencyMs,
        Number.NEGATIVE_INFINITY
      ) -
      safeNumber(
        a.latencyMs,
        Number.NEGATIVE_INFINITY
      )
  );
}

export function sortServerServicesByUpdatedDesc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      safeNumber(
        b.updatedAtTs
      ) -
      safeNumber(
        a.updatedAtTs
      )
  );
}

export function sortServerServicesByTitleAsc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      safeText(a.title, "").localeCompare(
        safeText(b.title, ""),
        "es"
      )
  );
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateServerServices(
  items = [],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const list =
    safeArray(items);

  const size = Math.max(
    1,
    safeNumber(
      pageSize,
      DEFAULT_PAGE_SIZE
    )
  );

  const total =
    list.length;

  const totalPages =
    Math.max(
      1,
      Math.ceil(total / size)
    );

  const current = Math.min(
    Math.max(
      1,
      safeNumber(page, 1)
    ),
    totalPages
  );

  const start =
    (current - 1) * size;

  const end =
    start + size;

  return {
    page: current,
    pageSize: size,
    total,
    totalPages,
    items:
      list.slice(
        start,
        end
      ),
    from:
      total === 0
        ? 0
        : start + 1,
    to: Math.min(
      end,
      total
    ),
  };
}

/* =========================================================
   STATS
========================================================= */

export function computeServerServicesStats(
  items = []
) {
  const list =
    safeArray(items);

  return {
    total:
      list.length,

    ok:
      list.filter(
        (x) => x.isOk
      ).length,

    warning:
      list.filter(
        (x) => x.isWarning
      ).length,

    error:
      list.filter(
        (x) => x.isError
      ).length,

    disabled:
      list.filter(
        (x) => x.isDisabled
      ).length,

    unknown:
      list.filter(
        (x) => x.isUnknown
      ).length,

    withLatency:
      list.filter(
        (x) => x.hasLatency
      ).length,

    withPercent:
      list.filter(
        (x) => x.hasPercent
      ).length,

    withRoute:
      list.filter(
        (x) => x.hasRoute
      ).length,

    apis:
      list.filter(
        (x) => x.isApi
      ).length,

    dbs:
      list.filter(
        (x) => x.isDb
      ).length,

    runtimes:
      list.filter(
        (x) => x.isRuntime
      ).length,

    systems:
      list.filter(
        (x) => x.isSystem
      ).length,

    environments:
      list.filter(
        (x) => x.isEnvironment
      ).length,
  };
}

/* =========================================================
   FINDERS
========================================================= */

export function findServerServiceById(
  items = [],
  serviceId = ""
) {
  const id = safeText(
    serviceId,
    ""
  );

  if (!id) return null;

  return (
    safeArray(items).find(
      (item) =>
        safeText(
          item.serviceId
        ) === id
    ) || null
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  normalizeServerSnapshotModel,
  normalizeServerServiceModel,
  normalizeServerServicesCollection,
  unwrapServerSnapshotPayload,
  sortServerServicesByLatencyDesc,
  sortServerServicesByUpdatedDesc,
  sortServerServicesByTitleAsc,
  paginateServerServices,
  computeServerServicesStats,
  findServerServiceById,
  getServerStatusLabel,
  getServerTypeLabel,
  normalizeServerStatus,
  normalizeServerType,
  getInitials,
  getServerTheme,
};
