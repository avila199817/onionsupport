/* =========================================================
   Onion Support - Servidor API Boundary
   Archivo: /src/views/server/server.api.js

   V3 · HEALTH + AZURE COSTS

   Conserva el contrato health V2 en server.api.base.js y añade
   una segunda fuente admin-only con caché independiente para costes.
   El modo Live refresca health cada 30 s, pero NO fuerza Cost Management.
========================================================= */

import Http from "../../core/http.js";
import * as Base from "./server.api.base.js";

export const SERVER_API_VERSION =
  "server.api.backend-contract.v3.health-plus-costs";
export const SERVIDOR_API_VERSION = SERVER_API_VERSION;

export const SERVER_REQUEST_TIMEOUT_MS = Base.SERVER_REQUEST_TIMEOUT_MS;
export const SERVER_CACHE_TTL_MS = Base.SERVER_CACHE_TTL_MS;
export const SERVER_AUTO_REFRESH_DEFAULT_MS = Base.SERVER_AUTO_REFRESH_DEFAULT_MS;
export const SERVER_CACHE_KEY = Base.SERVER_CACHE_KEY;

export const SERVER_COST_CACHE_TTL_MS = 5 * 60 * 1000;

export const SERVER_ENDPOINTS = Object.freeze({
  ...Base.SERVER_ENDPOINTS,
  costs: "/health/costs",
});

export const SERVER_ENDPOINT_GROUPS = Object.freeze({
  ...Base.SERVER_ENDPOINT_GROUPS,
  costs: Object.freeze([SERVER_ENDPOINTS.costs]),
});

const costState = {
  snapshot: null,
  loading: false,
  error: "",
  lastSyncAt: 0,
  inflight: null,
};

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function safeNumber(value = null, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeError(error = null) {
  return safeText(
    error?.data?.message ||
      error?.payload?.message ||
      error?.response?.message ||
      error?.message ||
      error?.code ||
      "No se pudo consultar el coste de Azure.",
    "No se pudo consultar el coste de Azure."
  );
}

function unwrapResponse(payload) {
  let current = payload;
  const seen = new Set();

  for (let depth = 0; depth < 6; depth += 1) {
    if (!isObject(current) || seen.has(current)) break;
    seen.add(current);

    if (
      "available" in current ||
      "currentMonth" in current ||
      "daily" in current ||
      "setupRequired" in current
    ) {
      break;
    }

    const nested =
      current.data ||
      current.payload ||
      current.result ||
      current.response ||
      null;

    if (!isObject(nested)) break;
    current = nested;
  }

  return safeObject(current, {});
}

function createEmptyCostSnapshot() {
  return {
    version: "",
    ok: false,
    available: false,
    status: "pending",
    code: "AZURE_COST_PENDING",
    setupRequired: false,
    message: "Coste Azure pendiente de consulta.",
    currency: "",
    checkedAt: "",
    costDataThrough: "",
    currentMonth: null,
    comparison: null,
    daily: [],
    services: [],
    resources: [],
    trend: {
      level: "unknown",
      label: "Sin datos",
      detail: "Pendiente de Cost Management.",
    },
    cache: {
      stale: false,
      hit: false,
      ttlMs: 0,
      ageMs: null,
    },
    notes: [],
  };
}

function normalizeDay(item = {}) {
  return {
    date: safeText(item.date, ""),
    day: safeNumber(item.day, null),
    cost: safeNumber(item.cost, 0),
    cumulative: safeNumber(item.cumulative, 0),
    partial: item.partial === true,
  };
}

function normalizeBreakdownItem(item = {}, type = "service") {
  const base = {
    name: safeText(item.name, type === "service" ? "Sin servicio" : "Sin recurso"),
    total: safeNumber(item.total, 0),
    sharePct: safeNumber(item.sharePct, 0),
  };

  if (type === "resource") {
    return {
      ...base,
      id: safeText(item.id, ""),
      resourceGroup: safeText(item.resourceGroup, ""),
      serviceName: safeText(item.serviceName, ""),
    };
  }

  return base;
}

function normalizeCostSnapshot(payload = {}) {
  const source = unwrapResponse(payload);
  const current = safeObject(source.currentMonth, null);
  const comparison = safeObject(source.comparison, null);
  const trend = safeObject(source.trend, {});
  const cache = safeObject(source.cache, {});

  return {
    version: safeText(source.version, ""),
    ok: source.ok === true,
    available: source.available === true,
    status: safeText(source.status, source.available === true ? "available" : "unavailable"),
    code: safeText(source.code, ""),
    setupRequired: source.setupRequired === true,
    message: safeText(source.message, ""),
    currency: safeText(source.currency, ""),
    checkedAt: safeText(source.checkedAt || source.timestamp, ""),
    costDataThrough: safeText(source.costDataThrough, ""),
    currentMonth: current
      ? {
          key: safeText(current.key, ""),
          label: safeText(current.label, ""),
          total: safeNumber(current.total, 0),
          completedTotal: safeNumber(current.completedTotal, 0),
          averageDaily: safeNumber(current.averageDaily, 0),
          projected: safeNumber(current.projected, 0),
          completedDays: safeNumber(current.completedDays, 0),
          daysInMonth: safeNumber(current.daysInMonth, 0),
          latestCompleteDay: isObject(current.latestCompleteDay)
            ? {
                date: safeText(current.latestCompleteDay.date, ""),
                cost: safeNumber(current.latestCompleteDay.cost, 0),
              }
            : null,
          previousCompleteDay: isObject(current.previousCompleteDay)
            ? {
                date: safeText(current.previousCompleteDay.date, ""),
                cost: safeNumber(current.previousCompleteDay.cost, 0),
              }
            : null,
          peakDay: isObject(current.peakDay)
            ? {
                date: safeText(current.peakDay.date, ""),
                cost: safeNumber(current.peakDay.cost, 0),
              }
            : null,
        }
      : null,
    comparison: comparison
      ? {
          previousMonthKey: safeText(comparison.previousMonthKey, ""),
          previousMonthLabel: safeText(comparison.previousMonthLabel, ""),
          previousMonthTotal: safeNumber(comparison.previousMonthTotal, 0),
          previousComparableTotal: safeNumber(comparison.previousComparableTotal, 0),
          deltaComparable: safeNumber(comparison.deltaComparable, 0),
          deltaComparablePct: safeNumber(comparison.deltaComparablePct, null),
        }
      : null,
    daily: safeArray(source.daily)
      .slice(0, 62)
      .map(normalizeDay),
    services: safeArray(source.services)
      .slice(0, 8)
      .map((item) => normalizeBreakdownItem(item, "service")),
    resources: safeArray(source.resources)
      .slice(0, 8)
      .map((item) => normalizeBreakdownItem(item, "resource")),
    trend: {
      level: safeText(trend.level, "unknown"),
      label: safeText(trend.label, "Sin datos"),
      detail: safeText(trend.detail, ""),
    },
    cache: {
      stale: cache.stale === true,
      hit: cache.hit === true,
      ttlMs: safeNumber(cache.ttlMs, 0),
      ageMs: safeNumber(cache.ageMs, null),
    },
    warning: isObject(source.warning)
      ? {
          code: safeText(source.warning.code, ""),
          message: safeText(source.warning.message, ""),
        }
      : null,
    notes: safeArray(source.notes)
      .slice(0, 6)
      .map((item) => safeText(item, ""))
      .filter(Boolean),
  };
}

function costCacheIsFresh() {
  return Boolean(
    costState.snapshot &&
      costState.lastSyncAt &&
      Date.now() - costState.lastSyncAt <= SERVER_COST_CACHE_TTL_MS
  );
}

export async function fetchServerCostsRequest(options = {}) {
  let response;

  if (typeof Http?.get === "function") {
    response = await Http.get(SERVER_ENDPOINTS.costs, {
      timeout: safeNumber(options.timeout, SERVER_REQUEST_TIMEOUT_MS),
      query: safeObject(options.query),
      headers: safeObject(options.headers),
      source: safeText(options.source, "views.server.api.costs"),
    });
  } else if (typeof Http?.request === "function") {
    response = await Http.request(SERVER_ENDPOINTS.costs, {
      method: "GET",
      timeout: safeNumber(options.timeout, SERVER_REQUEST_TIMEOUT_MS),
      query: safeObject(options.query),
      headers: safeObject(options.headers),
      source: safeText(options.source, "views.server.api.costs"),
    });
  } else {
    throw new Error("SERVER_HTTP_UNAVAILABLE");
  }

  return normalizeCostSnapshot(response);
}

export async function loadServerCosts(options = {}) {
  const opts = safeObject(options);

  if (!opts.force && costCacheIsFresh()) {
    return costState.snapshot;
  }

  if (costState.inflight) {
    return costState.inflight;
  }

  const previous = costState.snapshot;
  costState.loading = true;
  costState.error = "";

  let task = null;

  task = (async () => {
    try {
      const snapshot = await fetchServerCostsRequest({
        ...opts,
        source: safeText(opts.source, "views.server.api.costs.load"),
      });

      costState.snapshot = snapshot;
      costState.lastSyncAt = Date.now();
      return snapshot;
    } catch (error) {
      costState.error = safeError(error);

      if (previous) {
        return {
          ...previous,
          cache: {
            ...safeObject(previous.cache),
            stale: true,
          },
          warning: {
            code: safeText(error?.code, "SERVER_COST_REFRESH_FAILED"),
            message: costState.error,
          },
        };
      }

      const unavailable = createEmptyCostSnapshot();
      unavailable.status = "unavailable";
      unavailable.code = safeText(error?.code, "SERVER_COST_UNAVAILABLE");
      unavailable.message = costState.error;
      unavailable.checkedAt = new Date().toISOString();
      return unavailable;
    } finally {
      costState.loading = false;
      if (costState.inflight === task) {
        costState.inflight = null;
      }
    }
  })();

  costState.inflight = task;
  return task;
}

export async function refreshServerCosts(options = {}) {
  return loadServerCosts({
    ...safeObject(options),
    force: true,
  });
}

function composeSnapshot(health = null, costs = null) {
  const source = safeObject(health, Base.createEmptyServerSnapshot());
  const costSnapshot = costs || costState.snapshot || createEmptyCostSnapshot();

  return {
    ...source,
    costs: costSnapshot,
    capabilities: {
      ...safeObject(source.capabilities),
      azureCosts: costSnapshot.available === true,
    },
    endpoints: {
      ...safeObject(source.endpoints),
      costs: {
        supported: true,
        endpoint: SERVER_ENDPOINTS.costs,
        ok: costSnapshot.available === true,
        status: costSnapshot.status,
        code: costSnapshot.code,
      },
    },
  };
}

async function resolveCostsForDashboard(options = {}) {
  return loadServerCosts({
    source: safeText(options.source, "views.server.api.dashboard.costs"),
    force: options.forceCosts === true,
  });
}

export async function loadServerSnapshot(options = {}) {
  const opts = safeObject(options);
  const healthPromise = Base.loadServerSnapshot(opts);
  const costsPromise = resolveCostsForDashboard(opts);

  const [health, costs] = await Promise.all([
    healthPromise,
    costsPromise,
  ]);

  return composeSnapshot(health, costs);
}

export async function loadServerHealth(options = {}) {
  return loadServerSnapshot(options);
}

export async function refreshServerSnapshot(options = {}) {
  const opts = safeObject(options);
  const healthPromise = Base.refreshServerSnapshot(opts);
  const costsPromise = resolveCostsForDashboard({
    ...opts,
    forceCosts: opts.forceCosts === true,
  });

  const [health, costs] = await Promise.all([
    healthPromise,
    costsPromise,
  ]);

  return composeSnapshot(health, costs);
}

export async function refreshServerHealth(options = {}) {
  return refreshServerSnapshot(options);
}

export function hydrateServerFromCache(options = {}) {
  const health = Base.hydrateServerFromCache(options);
  return health ? composeSnapshot(health) : null;
}

export function clearServerCache() {
  Base.clearServerCache();
  costState.snapshot = null;
  costState.loading = false;
  costState.error = "";
  costState.lastSyncAt = 0;
  costState.inflight = null;
  return true;
}

export function normalizeServerSnapshot(payload = null, options = {}) {
  return composeSnapshot(Base.normalizeServerSnapshot(payload, options));
}

export function createEmptyServerSnapshot() {
  return composeSnapshot(
    Base.createEmptyServerSnapshot(),
    createEmptyCostSnapshot()
  );
}

export function getServerSnapshotStore() {
  return composeSnapshot(Base.getServerSnapshotStore());
}

export function getServerSnapshot() {
  return getServerSnapshotStore();
}

export function getServerStateSnapshot() {
  const base = Base.getServerStateSnapshot();

  return {
    ...base,
    version: SERVER_API_VERSION,
    snapshot: getServerSnapshotStore(),
    costs: {
      loading: costState.loading,
      error: costState.error,
      lastSyncAt: costState.lastSyncAt,
      cacheTtlMs: SERVER_COST_CACHE_TTL_MS,
      fresh: costCacheIsFresh(),
      endpoint: SERVER_ENDPOINTS.costs,
    },
    requestPolicy: {
      ...safeObject(base.requestPolicy),
      healthRefreshMs: SERVER_AUTO_REFRESH_DEFAULT_MS,
      costFrontendCacheMs: SERVER_COST_CACHE_TTL_MS,
      costForcedByLive: false,
    },
  };
}

export function getState() {
  return getServerStateSnapshot();
}

export function getSnapshot() {
  return getServerStateSnapshot();
}

export const probeServerEndpoint = Base.probeServerEndpoint;
export const probeEndpointGroup = Base.probeEndpointGroup;
export const fetchServerHealthRequest = Base.fetchServerHealthRequest;
export const fetchServerReadinessRequest = Base.fetchServerReadinessRequest;
export const fetchServerLivenessRequest = Base.fetchServerLivenessRequest;
export const setServerAutoRefresh = Base.setServerAutoRefresh;
export const stopAllServerAutoRefresh = Base.stopAllServerAutoRefresh;
export const normalizeStatus = Base.normalizeStatus;
export const labelForStatus = Base.labelForStatus;
export const normalizeService = Base.normalizeService;
export const getServerServices = Base.getServerServices;
export const getServerServiceByIdStore = Base.getServerServiceByIdStore;
export const serverState = Base.serverState;

export default Object.freeze({
  version: SERVER_API_VERSION,
  endpoint: SERVER_ENDPOINTS.internal,
  endpoints: SERVER_ENDPOINTS,
  endpointGroups: SERVER_ENDPOINT_GROUPS,
  fetchServerHealthRequest,
  fetchServerReadinessRequest,
  fetchServerLivenessRequest,
  fetchServerCostsRequest,
  loadServerSnapshot,
  loadServerHealth,
  loadServerCosts,
  refreshServerSnapshot,
  refreshServerHealth,
  refreshServerCosts,
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
  normalizeStatus,
  labelForStatus,
  normalizeService,
  serverState,
});
