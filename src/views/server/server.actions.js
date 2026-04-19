/* =========================================================
   Onion SPA - Server Actions
   Archivo: src/views/server/server.actions.js

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo server
   - resolver snapshot de servidor desde backend
   - medir latencia real de dashboard y health
   - extraer telemetry normalizada
   - extraer timings del navegador / webapp
   - extraer métricas del entorno navegador
   - mantener histórico local de CPU / RAM / latencias
   - controlar live refresh del módulo server
   - desacoplar serverView.js de la lógica operativa
   - mantener compatibilidad con una vista server pura
   - exponer acciones UI-ready para detalle / copy / navegación

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - extracción robusta dashboard + health
   - auto refresh seguro sin intervalos duplicados
   - histórico capado sin librerías externas
   - eventos opcionales vía AppCore.events
   - fallbacks seguros para browser APIs
   - compatibilidad total con serverView.js
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getServerServiceByIdStore,
  getServerServices,
} from "./server.store.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const SERVER_SCOPE = "view:server";
export const SERVER_HISTORY_LIMIT = 40;

/*
  OJO:
  en tu original estaba a 0 y eso es tóxico.
  15000 = 15s live razonable.
*/
export const SERVER_REFRESH_INTERVAL_MS = 15000;

export const SERVER_ENDPOINTS = {
  dashboard: "/api/dashboard",
  health: "/health/internal",
};

/* =========================================================
   HELPERS BASE
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
  } catch {}
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

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, safeNumber(value, 0)));
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isLikelyDashboard(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.meta ||
      value.resumen ||
      value.charts ||
      value.summary ||
      value.stats ||
      value.metrics ||
      Array.isArray(value.widgets) ||
      Array.isArray(value.items)
  );
}

function isLikelyHealth(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.status ||
      typeof value.ok === "boolean" ||
      value.timestamp ||
      value.api ||
      value.db ||
      value.system ||
      value.runtime ||
      value.environment
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.dashboard ||
      obj.health ||
      obj.data ||
      obj.result ||
      obj.payload ||
      obj.item
  );
}

function pickDashboard(payload = null) {
  if (!payload) return null;

  if (isLikelyDashboard(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyDashboard(obj.dashboard)) {
    return obj.dashboard;
  }

  if (isLikelyDashboard(obj.data)) {
    return obj.data;
  }

  if (isLikelyDashboard(obj.result)) {
    return obj.result;
  }

  if (isLikelyDashboard(obj.payload)) {
    return obj.payload;
  }

  if (looksLikeEnvelope(obj.data)) {
    return pickDashboard(obj.data);
  }

  return null;
}

function pickHealth(payload = null) {
  if (!payload) return null;

  if (isLikelyHealth(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyHealth(obj.health)) {
    return obj.health;
  }

  if (isLikelyHealth(obj.data)) {
    return obj.data;
  }

  if (isLikelyHealth(obj.result)) {
    return obj.result;
  }

  if (isLikelyHealth(obj.payload)) {
    return obj.payload;
  }

  if (looksLikeEnvelope(obj.data)) {
    return pickHealth(obj.data);
  }

  return null;
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");

  if (!text) return false;

  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](text);
      return true;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(text, type);
    return true;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(text);
    return true;
  } catch {}

  try {
    AppCore?.services?.toast?.show?.({
      message: text,
      type,
    });
    return true;
  } catch {}

  return false;
}

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

function getDetailId(item = {}) {
  const row = safeObject(item);

  return safeText(
    first(
      row.serviceId,
      row.detailId,
      row.id,
      row.key,
      row.slug,
      row.code,
      row.name,
      row.service
    ),
    ""
  );
}

function getDetailTitle(item = {}) {
  const row = safeObject(item);

  return safeText(
    first(
      row.title,
      row.name,
      row.label,
      row.heading,
      row.service
    ),
    "Detalle técnico"
  );
}

function getDetailDescription(item = {}) {
  const row = safeObject(item);

  return safeText(
    first(
      row.description,
      row.descripcion,
      row.subtitle,
      row.summary,
      row.text,
      row.detail
    ),
    "Sin descripción."
  );
}

function getDetailType(item = {}) {
  const row = safeObject(item);

  return safeText(
    first(
      row.type,
      row.kind,
      row.variant,
      row.category,
      row.sectionType
    ),
    "service"
  );
}

function getDetailStatus(item = {}) {
  const row = safeObject(item);

  return safeText(
    first(
      row.status,
      row.estado,
      row.state
    ),
    "unknown"
  );
}

function getDetailRoute(item = {}) {
  const row = safeObject(item);

  return safeText(
    first(
      row.route,
      row.href,
      row.link,
      row.to
    ),
    ""
  );
}

function getDetailUpdatedAt(item = {}) {
  const row = safeObject(item);

  return first(
    row.updatedAt,
    row.lastUpdate,
    row.modifiedAt,
    row.createdAt,
    row.timestamp,
    row.generatedAt,
    row.loadedAt
  );
}

function getDetailIcon(item = {}) {
  const row = safeObject(item);

  return safeText(
    first(
      row.icon,
      row.emoji,
      row.symbol
    ),
    ""
  );
}

function buildServerDetailModel(item = {}) {
  const row = safeObject(item);
  const detailId = getDetailId(row);

  return {
    ...row,
    serviceId: safeText(first(row.serviceId, detailId), detailId),
    detailId,
    id: safeText(first(row.id, detailId), detailId),
    title: getDetailTitle(row),
    description: getDetailDescription(row),
    type: getDetailType(row),
    status: getDetailStatus(row),
    route: getDetailRoute(row),
    updatedAt: getDetailUpdatedAt(row),
    icon: getDetailIcon(row),
    metadata: safeObject(
      first(
        row.metadata,
        row.meta,
        row.info,
        row.raw
      ),
      {}
    ),
    items: safeArray(
      first(
        row.items,
        row.rows,
        row.list,
        row.data
      ),
      []
    ),
    tags: Array.isArray(row.tags)
      ? row.tags
      : typeof row.tags === "string"
        ? row.tags.split(",").map((tag) => safeText(tag, "")).filter(Boolean)
        : [],
    raw: safeObject(first(row.raw, row), row),
  };
}

function getAllKnownServices() {
  try {
    return safeArray(getServerServices?.(), []);
  } catch {
    return [];
  }
}

function resolveServerDetailById(detailId = "") {
  const id = safeText(detailId, "");

  if (!id) return null;

  try {
    const fromStore = getServerServiceByIdStore?.(id);
    if (fromStore) {
      return buildServerDetailModel(fromStore);
    }
  } catch {}

  const items = getAllKnownServices();
  const found =
    items.find((item) => getDetailId(item) === id) ||
    null;

  return found ? buildServerDetailModel(found) : null;
}

/* =========================================================
   STATUS / LABEL HELPERS
========================================================= */

export function getServerStatusTone(value = "unknown") {
  const normalized = safeText(value, "unknown").toLowerCase();

  if (
    ["ok", "up", "operativa", "operativo", "healthy", "online", "success"].includes(
      normalized
    )
  ) {
    return "success";
  }

  if (["warning", "degraded", "revisar", "slow"].includes(normalized)) {
    return "warning";
  }

  if (["error", "down", "offline", "critical", "failed"].includes(normalized)) {
    return "error";
  }

  return "neutral";
}

export function getServerPercentTone(value = 0) {
  const num = clamp(value, 0, 100);

  if (num >= 85) return "error";
  if (num >= 70) return "warning";
  return "success";
}

export function getServerLatencyLabel(ms) {
  const n = safeNumber(ms, 0);

  if (!n) return "No disponible";
  if (n <= 200) return "Muy rápida";
  if (n <= 500) return "Operativa";
  if (n <= 1000) return "Revisar";
  return "Lenta";
}

export function getServerCpuStatusLabel(value) {
  const num = clamp(value, 0, 100);

  if (num >= 85) return "Alta";
  if (num >= 70) return "Elevada";
  if (num >= 40) return "Normal";
  return "Baja";
}

export function getServerRamStatusLabel(value) {
  const num = clamp(value, 0, 100);

  if (num >= 90) return "Crítica";
  if (num >= 80) return "Muy alta";
  if (num >= 65) return "Moderada";
  return "Estable";
}

/* =========================================================
   BROWSER / ENV METRICS
========================================================= */

function getNavigationEntry() {
  try {
    const entries = performance.getEntriesByType("navigation");
    return Array.isArray(entries) && entries.length ? entries[0] : null;
  } catch {
    return null;
  }
}

export function getServerBrowserMemoryMetrics() {
  try {
    const mem = performance?.memory;

    if (!mem) {
      return {
        available: false,
        jsHeapUsedMB: null,
        jsHeapTotalMB: null,
        jsHeapLimitMB: null,
      };
    }

    return {
      available: true,
      jsHeapUsedMB: round2(mem.usedJSHeapSize / 1024 / 1024),
      jsHeapTotalMB: round2(mem.totalJSHeapSize / 1024 / 1024),
      jsHeapLimitMB: round2(mem.jsHeapSizeLimit / 1024 / 1024),
    };
  } catch {
    return {
      available: false,
      jsHeapUsedMB: null,
      jsHeapTotalMB: null,
      jsHeapLimitMB: null,
    };
  }
}

export function getServerBrowserMetrics() {
  const nav = getNavigationEntry();

  if (!nav) {
    return {
      ttfb: null,
      domReady: null,
      windowLoad: null,
      transferSize: null,
      encodedBodySize: null,
      decodedBodySize: null,
    };
  }

  return {
    ttfb: round2(nav.responseStart || 0),
    domReady: round2(nav.domContentLoadedEventEnd || 0),
    windowLoad: round2(nav.loadEventEnd || 0),
    transferSize: safeNumber(nav.transferSize, 0),
    encodedBodySize: safeNumber(nav.encodedBodySize, 0),
    decodedBodySize: safeNumber(nav.decodedBodySize, 0),
  };
}

export function getServerEnvironmentMetrics() {
  const nav = navigator || {};
  const connection =
    nav.connection || nav.mozConnection || nav.webkitConnection || null;

  return {
    userAgent: safeText(nav.userAgent, "No disponible"),
    language: safeText(nav.language, "es-ES"),
    platform: safeText(nav.platform, "No disponible"),
    onLine: typeof nav.onLine === "boolean" ? nav.onLine : null,
    deviceMemory:
      typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number"
        ? nav.hardwareConcurrency
        : null,
    connectionType: safeText(connection?.effectiveType, ""),
    downlink:
      typeof connection?.downlink === "number" ? connection.downlink : null,
    rtt: typeof connection?.rtt === "number" ? connection.rtt : null,
    browserMemory: getServerBrowserMemoryMetrics(),
  };
}

/* =========================================================
   API REQUESTS
========================================================= */

export async function getServerDashboardRequest() {
  return AppCore.apiClient.get(SERVER_ENDPOINTS.dashboard, {
    timeout: 20000,
    auth: true,
  });
}

export async function getServerHealthRequest() {
  return AppCore.apiClient.get(SERVER_ENDPOINTS.health, {
    timeout: 20000,
    auth: true,
  });
}

/* =========================================================
   TELEMETRY EXTRACTION
========================================================= */

export function extractServerTelemetry({
  dashboardPayload = null,
  healthPayload = null,
  dashboardLatencyMs = null,
  healthLatencyMs = null,
} = {}) {
  const dashboard = pickDashboard(dashboardPayload) || {};
  const health = pickHealth(healthPayload) || {};

  const dashboardMeta = safeObject(dashboard?.meta);
  const dashboardResumen = safeObject(dashboard?.resumen);
  const dashboardCharts = safeObject(dashboard?.charts);

  const api = safeObject(health?.api);
  const db = safeObject(health?.db);
  const system = safeObject(health?.system);
  const runtime = safeObject(health?.runtime);
  const environment = safeObject(health?.environment);

  return {
    global: {
      ok: Boolean(health?.ok),
      status: safeText(health?.status, "unknown"),
      service: safeText(health?.service, "onion-backend"),
      timestamp: health?.timestamp || null,
    },

    dashboard: {
      generatedAt: dashboardMeta.generatedAt || null,
      scope: dashboardMeta.scope || null,
      isAdmin: Boolean(dashboardMeta.isAdmin),

      totalFacturas: safeNumber(dashboardResumen.totalFacturas, 0),
      totalFacturado: safeNumber(dashboardResumen.totalFacturado, 0),
      totalCobrado: safeNumber(dashboardResumen.totalCobrado, 0),
      totalPendiente: safeNumber(dashboardResumen.totalPendiente, 0),
      ticketsActivos: safeNumber(dashboardResumen.ticketsActivos, 0),
      ticketsUrgentes: safeNumber(dashboardResumen.ticketsUrgentes, 0),
      totalClientes: safeNumber(dashboardResumen.totalClientes, 0),
      totalUsuarios: safeNumber(dashboardResumen.totalUsuarios, 0),
      topClientesCount: safeArray(dashboardCharts?.topClientes).length,
    },

    api: {
      status: safeText(api.status, health?.ok ? "up" : "down"),
      latencyMs: safeNumber(api.latency, healthLatencyMs || 0),
      frontendLatencyMs: safeNumber(healthLatencyMs, 0) || null,
      label: getServerLatencyLabel(api.latency),
    },

    db: {
      status: safeText(db.status, "unknown"),
      latencyMs: db.latency ?? null,
      ok: Boolean(db.ok),
      errorMessage: safeText(db?.error?.message, ""),
    },

    server: {
      cpuPercent: system?.cpu?.usage ?? null,
      cpuLoad: system?.cpu?.load ?? null,
      cpuCores: system?.cpu?.cores ?? null,
      cpuModel: safeText(system?.cpu?.model, ""),
      cpuSpeedMHz: system?.cpu?.speedMHz ?? null,

      ramPercent: system?.ram?.usage ?? null,
      ramUsedMB: system?.ram?.usedMB ?? null,
      ramTotalMB: system?.ram?.totalMB ?? null,
      ramFreeMB: system?.ram?.freeMB ?? null,
      ramUsedGB: system?.ram?.usedGB ?? null,
      ramTotalGB: system?.ram?.totalGB ?? null,
      ramFreeGB: system?.ram?.freeGB ?? null,

      diskPercent: system?.disk?.percent ?? null,
      diskUsedGB: system?.disk?.usedGB ?? null,
      diskTotalGB: system?.disk?.totalGB ?? null,
      diskFreeGB: system?.disk?.freeGB ?? null,
      diskMount: safeText(system?.disk?.mount, ""),
      diskSource: safeText(system?.disk?.source, ""),
      diskModel: safeText(system?.disk?.info?.model, ""),
      diskVendor: safeText(system?.disk?.info?.vendor, ""),
      diskDevice: safeText(system?.disk?.info?.device, ""),
      diskMediaType: safeText(system?.disk?.info?.mediaType, ""),
      diskAvailable: Boolean(system?.disk?.info?.available),

      hostname: safeText(system?.host?.hostname, ""),
      osName: safeText(system?.host?.type, ""),
      osPlatform: safeText(system?.host?.platform, ""),
      osVersion: safeText(system?.host?.release, ""),
      arch: safeText(system?.host?.arch, ""),
      hostUptime: safeText(system?.host?.uptime, ""),
      processUptime: safeText(health?.uptime, ""),
      eventLoopLag: system?.eventLoop?.lag ?? null,
    },

    runtime: {
      nodeVersion: safeText(runtime?.process?.version, ""),
      nodePid: runtime?.process?.pid ?? null,
      nodeExecPath: safeText(runtime?.process?.execPath, ""),
      nodeCwd: safeText(runtime?.process?.cwd, ""),
      rssMB: runtime?.node?.rssMB ?? null,
      heapUsedMB: runtime?.node?.heapUsedMB ?? null,
      heapTotalMB: runtime?.node?.heapTotalMB ?? null,
      externalMB: runtime?.node?.externalMB ?? null,
      arrayBuffersMB: runtime?.node?.arrayBuffersMB ?? null,
      heapLimitMB: runtime?.v8?.heapLimitMB ?? null,
      mallocedMB: runtime?.v8?.mallocedMB ?? null,
    },

    environment: {
      env: safeText(environment?.env, ""),
      timezone: safeText(environment?.timezone, ""),
      azureSiteName: safeText(environment?.azure?.websiteSiteName, ""),
      azureHostname: safeText(environment?.azure?.websiteHostname, ""),
      azureInstanceId: safeText(environment?.azure?.websiteInstanceId, ""),
      azureRegion: safeText(environment?.azure?.regionName, ""),
      azureSku: safeText(environment?.azure?.sku, ""),
      containerHostname: safeText(environment?.container?.hostname, ""),
      inContainer: Boolean(environment?.container?.inContainer),
    },

    services: {
      api: {
        status: safeText(api.status, "unknown"),
        latencyMs: api.latency ?? null,
        detail: "Latencia reportada por el health interno.",
      },
      cosmos: {
        status: safeText(db.status, "unknown"),
        latencyMs: db.latency ?? null,
        detail: db?.error?.message
          ? `Error DB: ${db.error.message}`
          : "Comprobación real contra db.read()",
      },
      blob: {
        status: "No disponible",
        latencyMs: null,
        detail: "Aún no expuesto por health interno.",
      },
      web: {
        status: safeNumber(dashboardLatencyMs, 0)
          ? getServerLatencyLabel(dashboardLatencyMs)
          : "No disponible",
        latencyMs: dashboardLatencyMs,
        detail: "Medido desde frontend contra /api/dashboard",
      },
    },
  };
}

/* =========================================================
   HISTORY
========================================================= */

export function createServerHistoryState() {
  return {
    cpu: [],
    ram: [],
    apiLatency: [],
    dbLatency: [],
    timestamps: [],
  };
}

function pushHistoryValue(bucket = [], value = null, limit = SERVER_HISTORY_LIMIT) {
  const next = [...safeArray(bucket), value];

  if (next.length > limit) {
    return next.slice(next.length - limit);
  }

  return next;
}

export function pushServerHistorySnapshot({
  history = createServerHistoryState(),
  telemetry = null,
  timestamp = null,
  limit = SERVER_HISTORY_LIMIT,
} = {}) {
  const safeHistory = safeObject(history, createServerHistoryState());
  const server = safeObject(telemetry?.server);
  const api = safeObject(telemetry?.api);
  const db = safeObject(telemetry?.db);

  return {
    cpu: pushHistoryValue(safeHistory.cpu, server.cpuPercent ?? null, limit),
    ram: pushHistoryValue(safeHistory.ram, server.ramPercent ?? null, limit),
    apiLatency: pushHistoryValue(
      safeHistory.apiLatency,
      api.latencyMs ?? null,
      limit
    ),
    dbLatency: pushHistoryValue(
      safeHistory.dbLatency,
      db.latencyMs ?? null,
      limit
    ),
    timestamps: pushHistoryValue(
      safeHistory.timestamps,
      timestamp || new Date().toISOString(),
      limit
    ),
  };
}

/* =========================================================
   SNAPSHOT NORMALIZATION
========================================================= */

export function buildServerSnapshot({
  dashboardPayload = null,
  healthPayload = null,
  dashboardLatencyMs = null,
  healthLatencyMs = null,
  history = createServerHistoryState(),
} = {}) {
  const pickedDashboard = pickDashboard(dashboardPayload);
  const pickedHealth = pickHealth(healthPayload);

  const browserMetrics = getServerBrowserMetrics();
  const environmentMetrics = getServerEnvironmentMetrics();

  const telemetry = extractServerTelemetry({
    dashboardPayload: pickedDashboard,
    healthPayload: pickedHealth,
    dashboardLatencyMs,
    healthLatencyMs,
  });

  const nextHistory = pushServerHistorySnapshot({
    history,
    telemetry,
    timestamp: new Date().toISOString(),
  });

  return {
    dashboardPayload: pickedDashboard,
    healthPayload: pickedHealth,
    dashboardLatencyMs,
    healthLatencyMs,
    browserMetrics,
    environmentMetrics,
    telemetry,
    history: nextHistory,
    loadedAt: new Date().toISOString(),
  };
}

/* =========================================================
   MAIN FETCH ACTION
========================================================= */

export async function getServerSnapshotAction({
  history = createServerHistoryState(),
  silent = false,
} = {}) {
  safeEmit("server:snapshot:request", {
    source: "backend",
  });

  try {
    const dashboardStartedAt = performance.now();
    const dashboardPromise = getServerDashboardRequest();

    const healthStartedAt = performance.now();
    const healthPromise = getServerHealthRequest();

    const [dashboardResponse, healthResponse] = await Promise.all([
      dashboardPromise,
      healthPromise,
    ]);

    const dashboardFinishedAt = performance.now();
    const healthFinishedAt = performance.now();

    const dashboardLatencyMs = round2(dashboardFinishedAt - dashboardStartedAt);
    const healthLatencyMs = round2(healthFinishedAt - healthStartedAt);

    const snapshot = buildServerSnapshot({
      dashboardPayload: dashboardResponse,
      healthPayload: healthResponse,
      dashboardLatencyMs,
      healthLatencyMs,
      history,
    });

    safeEmit("server:snapshot:success", {
      source: "backend",
      snapshot,
    });

    return snapshot;
  } catch (error) {
    safeEmit("server:snapshot:error", {
      error,
    });

    if (!silent) {
      showToast("No se pudo cargar el estado del servidor.", "error");
    }

    return {
      dashboardPayload: null,
      healthPayload: null,
      dashboardLatencyMs: null,
      healthLatencyMs: null,
      browserMetrics: getServerBrowserMetrics(),
      environmentMetrics: getServerEnvironmentMetrics(),
      telemetry: null,
      history: safeObject(history, createServerHistoryState()),
      loadedAt: new Date().toISOString(),
      error:
        error?.data?.message ||
        error?.message ||
        "No se pudo cargar el estado del servidor.",
    };
  }
}

export async function refreshServerSnapshotAction({
  history = createServerHistoryState(),
  silent = true,
} = {}) {
  return getServerSnapshotAction({
    history,
    silent,
  });
}

/* =========================================================
   DETAIL ACTIONS
========================================================= */

export function getServerDetailFromStoreAction({
  detailId = "",
} = {}) {
  const id = safeText(detailId, "");

  if (!id) {
    return null;
  }

  const detail = resolveServerDetailById(id);

  return detail ? buildServerDetailModel(detail) : null;
}

export async function getServerDetailAction({
  detailId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = safeText(detailId, "");

  if (!id) {
    if (!silent) {
      showToast("No se pudo resolver el detalle técnico.", "error");
    }
    return null;
  }

  const fallbackDetail = getServerDetailFromStoreAction({
    detailId: id,
  });

  if (!preferFresh && fallbackDetail) {
    return fallbackDetail;
  }

  try {
    safeEmit("server:detail:request", {
      detailId: id,
      source: preferFresh ? "backend+store" : "store",
    });

    /*
      Como el detalle server realmente cuelga del snapshot completo,
      el "fresh" aquí significa refrescar snapshot y resolver luego.
    */
    if (preferFresh) {
      await refreshServerSnapshotAction({
        silent: true,
      });
    }

    const detailAfterRefresh = getServerDetailFromStoreAction({
      detailId: id,
    });

    if (detailAfterRefresh) {
      safeEmit("server:detail:success", {
        detailId: id,
        detail: detailAfterRefresh,
      });

      return detailAfterRefresh;
    }

    if (fallbackDetail) {
      safeEmit("server:detail:fallback", {
        detailId: id,
        detail: fallbackDetail,
      });

      return fallbackDetail;
    }

    throw new Error("EMPTY_SERVER_DETAIL");
  } catch (error) {
    safeEmit("server:detail:error", {
      detailId: id,
      error,
    });

    if (!silent) {
      showToast("No se pudo cargar el detalle técnico.", "error");
    }

    return fallbackDetail || null;
  }
}

export async function openServerDetailAction({
  detailId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = safeText(detailId, "");

  if (!id) {
    if (!silent) {
      showToast("Detalle inválido.", "error");
    }
    return null;
  }

  safeEmit("server:detail:open", {
    detailId: id,
  });

  const detail = await getServerDetailAction({
    detailId: id,
    preferFresh,
    silent,
  });

  if (!detail) {
    return null;
  }

  safeEmit("server:detail:open:success", {
    detailId: id,
    detail,
  });

  return detail;
}

export async function refreshServerDetailAction({
  detailId = "",
  silent = true,
} = {}) {
  return getServerDetailAction({
    detailId,
    preferFresh: true,
    silent,
  });
}

/* =========================================================
   COPY ID
========================================================= */

export async function copyServerDetailIdAction({
  detailId = "",
  silent = false,
} = {}) {
  const id = safeText(detailId, "");

  if (!id) {
    if (!silent) {
      showToast("No hay ID para copiar.", "error");
    }
    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    if (!silent) {
      showToast("No se pudo copiar el ID.", "error");
    }
    return false;
  }

  safeEmit("server:detail:copy-id", {
    detailId: id,
  });

  if (!silent) {
    showToast("ID copiado", "success");
  }

  return true;
}

/* =========================================================
   QUICK ACTIONS / NAVIGATION
========================================================= */

export async function navigateFromServerAction({
  route = "/server",
  silent = false,
} = {}) {
  const targetRoute = safeText(route, "/server");

  try {
    safeEmit("server:navigate", {
      route: targetRoute,
    });

    if (AppCore?.router?.navigate) {
      await AppCore.router.navigate(targetRoute);
      return true;
    }

    if (AppCore?.Router?.navigate) {
      await AppCore.Router.navigate(targetRoute);
      return true;
    }

    return true;
  } catch (error) {
    if (!silent) {
      showToast("No se pudo navegar desde Server.", "error");
    }

    return false;
  }
}

export async function runServerQuickAction({
  action = "",
  route = "",
  payload = {},
  silent = false,
} = {}) {
  const actionName = safeText(action, "");
  const targetRoute = safeText(route, "");

  if (!actionName && !targetRoute) {
    if (!silent) {
      showToast("Acción inválida.", "error");
    }
    return false;
  }

  try {
    safeEmit("server:quick-action", {
      action: actionName,
      route: targetRoute,
      payload: safeObject(payload),
    });

    /*
      Acción especial: refrescar health.
    */
    if (actionName === "refresh-health") {
      await getServerHealthRequest();
      if (!silent) {
        showToast("Health refrescado", "success");
      }
      return true;
    }

    /*
      Acción especial: refrescar snapshot completo.
    */
    if (actionName === "refresh-server" || actionName === "refresh-snapshot") {
      await refreshServerSnapshotAction({
        silent: true,
      });

      if (!silent) {
        showToast("Panel técnico actualizado", "success");
      }

      return true;
    }

    if (targetRoute) {
      return await navigateFromServerAction({
        route: targetRoute,
        silent,
      });
    }

    return true;
  } catch (error) {
    if (!silent) {
      showToast("No se pudo ejecutar la acción rápida.", "error");
    }

    return false;
  }
}

/* =========================================================
   LIVE REFRESH CONTROLLER
========================================================= */

const liveRegistry = new Map();

function normalizeLiveKey(value = "server") {
  return safeText(value, "server");
}

export function stopServerLiveAction({
  key = "server",
} = {}) {
  const liveKey = normalizeLiveKey(key);
  const timerId = liveRegistry.get(liveKey);

  if (timerId) {
    window.clearInterval(timerId);
    liveRegistry.delete(liveKey);
  }

  safeEmit("server:live:stop", {
    key: liveKey,
  });

  return true;
}

export function startServerLiveAction({
  key = "server",
  intervalMs = SERVER_REFRESH_INTERVAL_MS,
  onTick = null,
} = {}) {
  const liveKey = normalizeLiveKey(key);
  const interval = Math.max(3000, safeNumber(intervalMs, SERVER_REFRESH_INTERVAL_MS));

  stopServerLiveAction({ key: liveKey });

  if (typeof onTick !== "function") {
    return false;
  }

  const timerId = window.setInterval(async () => {
    try {
      await onTick();
    } catch {}
  }, interval);

  liveRegistry.set(liveKey, timerId);

  safeEmit("server:live:start", {
    key: liveKey,
    intervalMs: interval,
  });

  return true;
}

export function toggleServerLiveAction({
  key = "server",
  enabled = true,
  intervalMs = SERVER_REFRESH_INTERVAL_MS,
  onTick = null,
} = {}) {
  if (!enabled) {
    stopServerLiveAction({ key });
    return false;
  }

  return startServerLiveAction({
    key,
    intervalMs,
    onTick,
  });
}

export function isServerLiveActiveAction({
  key = "server",
} = {}) {
  return liveRegistry.has(normalizeLiveKey(key));
}

/* =========================================================
   HELPERS EXPORT
========================================================= */

export {
  safeText as safeServerText,
  safeNumber as safeServerNumber,
  safeArray as safeServerArray,
  safeObject as safeServerObject,
  round2 as roundServer2,
  clamp as clampServerValue,
  pickDashboard as pickServerDashboard,
  pickHealth as pickServerHealth,
};
