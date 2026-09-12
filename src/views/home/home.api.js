/* =========================================================
   Onion Support - Home API
   Archivo: /src/views/home/home.api.js

   PRODUCTIVO · DOMAIN AGGREGATOR · 2026-08-19

   Contrato:
   - Agrega datos del Home privado desde APIs de dominio existentes.
   - Un único cache en memoria, aislado por usuario/rol.
   - Deduplica cargas concurrentes y protege cambios de sesión.
   - Tolera fallos parciales sin ocultar dominios disponibles.
   - Facturación global siempre desde /api/facturas/stats.
   - La actividad separa IDs canónicos de apertura y números visibles de ticket/factura.
   - Sin DOM, Router, Store, Storage ni fetch propio.
========================================================= */

import { AppCore } from "../../core/index.js";
import { onDomainChanged } from "../../core/domain-events.js";
import { getIncidenciaEntityId, getFacturaEntityId } from "../../core/entity-identity.js";
import { exactCount } from "../../core/statistics.js";
import { selectFacturasStats } from "../facturas/facturas.stats.js";

import IncidenciasApi from "../incidencias/incidencias.api.js";
import FacturasApi from "../facturas/facturas.api.js";
import { fetchClientesStatsRequest } from "../clientes/clientes.api.js";
import { fetchUsuariosStatsRequest } from "../usuarios/usuarios.api.js";

export const HOME_API_VERSION =
  "home.api.domain-aggregator.v13-domain-counts";

export const HOME_TIMEOUT_MS = 15_000;
export const HOME_LIST_LIMIT = 8;
export const HOME_CACHE_TTL_MS = 60_000;

const LIST_KEYS = Object.freeze([
  "items", "rows", "results", "records", "docs", "documents",
  "value", "list", "tickets", "incidencias", "facturas", "invoices",
  "clientes", "clients", "users", "usuarios",
]);

const WRAPPER_KEYS = Object.freeze([
  "data", "payload", "result", "response", "body",
]);

const cacheState = {
  dashboard: null,
  key: "",
  loadedAtMs: 0,
  lastError: null,
  inFlight: null,
  inFlightKey: "",
  epoch: 0,
};

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value = "", fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "boolean" || typeof value === "object") return fallback;

  if (typeof value === "string") {
    let text = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    if (!text || text === "+" || text === "-") return fallback;

    const hasComma = text.includes(",");
    const hasDot = text.includes(".");

    if (hasComma && hasDot) {
      text = text.lastIndexOf(",") > text.lastIndexOf(".")
        ? text.replace(/\./g, "").replace(/,/g, ".")
        : text.replace(/,/g, "");
    } else if (hasComma) {
      text = text.replace(/,/g, ".");
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function now() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

function safeId(value = "") {
  return cleanText(value, "")
    .replace(/[\r\n\t]/g, "")
    .slice(0, 180);
}

function redact(value = "") {
  return String(value ?? "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function errorStatus(error = null) {
  return number(
    first(
      error?.status,
      error?.statusCode,
      error?.response?.status,
      error?.data?.status,
      error?.payload?.status,
      null
    ),
    0
  );
}

function isUnauthorizedError(error = null) {
  return errorStatus(error) === 401;
}

function normalizeError(domain = "home", error = null) {
  return {
    domain: cleanText(domain, "home"),
    message: redact(error?.message || "No se pudo cargar el recurso."),
    status: errorStatus(error) || null,
    code: cleanText(error?.code, "") || null,
    at: nowIso(),
  };
}

/* =========================================================
   APP CONTEXT / CACHE KEY
========================================================= */

function getCoreState() {
  try {
    return AppCore?.runtimeState?.read?.() || {};
  } catch {
    return {};
  }
}

function getCurrentUser(state = getCoreState()) {
  const rawUser = state?.hasUser === true ? state.user : null;
  if (!isObject(rawUser)) return null;

  return {
    ...rawUser,
    roles: Array.isArray(rawUser.roles) ? [...rawUser.roles] : [],
    permissions: Array.isArray(rawUser.permissions) ? [...rawUser.permissions] : [],
    permisos: Array.isArray(rawUser.permisos) ? [...rawUser.permisos] : [],
  };
}

function getCurrentRole(state = getCoreState(), user = getCurrentUser(state)) {
  return AppCore.normalizeRole(
    first(
      state.role,
      state.rol,
      state.roles,
      user?.role,
      user?.rol,
      user?.roles,
      "user"
    )
  ) || "user";
}

function getCurrentUserId(state = getCoreState(), user = getCurrentUser(state)) {
  return safeId(
    first(
      user?.userId,
      user?.uid,
      user?.sub,
      user?.id,
      user?.email,
      user?.username,
      user?.slug,
      state.userId,
      ""
    )
  ).toLowerCase();
}

function currentContext() {
  const state = getCoreState();
  const user = getCurrentUser(state);
  const role = getCurrentRole(state, user);
  const userId = getCurrentUserId(state, user);

  return {
    role,
    admin: role === "admin",
    user,
    userId,
    key: `${AppCore.getSessionEpoch()}:${role}:${userId}`,
  };
}

function cacheAgeMs() {
  return cacheState.loadedAtMs
    ? Math.max(0, now() - cacheState.loadedAtMs)
    : Number.POSITIVE_INFINITY;
}

function cacheMatches(key = currentContext().key) {
  return Boolean(
    cacheState.dashboard &&
    cacheState.key &&
    key &&
    cacheState.key === key
  );
}

function isCacheFresh(options = {}) {
  if (!defaultDashboardScope(options)) return false;
  if (!cacheMatches()) return false;

  const ttlMs = number(
    options.ttlMs ?? options.cacheTtlMs,
    HOME_CACHE_TTL_MS
  );

  return ttlMs > 0 && cacheAgeMs() <= ttlMs;
}

function cachedDashboard({ stale = false } = {}) {
  if (!cacheMatches()) return null;

  return {
    ...cacheState.dashboard,
    cached: true,
    stale: stale || cacheState.dashboard?.stale === true,
    cache: {
      ...safeObject(cacheState.dashboard?.cache),
      hydrated: true,
      key: cacheState.key,
      ageMs: cacheAgeMs(),
      ttlMs: HOME_CACHE_TTL_MS,
      fresh: isCacheFresh(),
    },
  };
}

function commitCache(dashboard = null, context = currentContext()) {
  if (!isObject(dashboard)) return null;

  cacheState.dashboard = dashboard;
  cacheState.key = context.key;
  cacheState.loadedAtMs = now();
  return dashboard;
}

export function clearHomeDashboardCache() {
  cacheState.dashboard = null;
  cacheState.key = "";
  cacheState.loadedAtMs = 0;
  cacheState.lastError = null;
  cacheState.inFlight = null;
  cacheState.inFlightKey = "";
  cacheState.epoch += 1;
  return true;
}

onDomainChanged(() => clearHomeDashboardCache());

/* =========================================================
   GENERIC RESPONSE READERS
========================================================= */

function unwrapList(value = null, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!isObject(value) || depth > 4) return [];

  for (const key of LIST_KEYS) {
    if (Array.isArray(value[key])) return value[key];
  }

  for (const key of WRAPPER_KEYS) {
    const nested = value[key];
    if (nested === undefined || nested === null) continue;

    const list = unwrapList(nested, depth + 1);
    if (list.length || Array.isArray(nested)) return list;
  }

  return [];
}

function collectionFromResponse(response = null) {
  const object = safeObject(response);
  const totalKnown = first(
    object.totalKnown, object.meta?.totalKnown, object.pagination?.totalKnown
  ) === true;
  const lowerBound = [object, object.meta, object.pagination]
    .some((value) => value?.totalIsLowerBound === true);

  return {
    items: unwrapList(response),
    // Domain pagination metadata is authoritative. A page's count/length is
    // never an exact total, including an empty page after an unavailable count.
    total: totalKnown && !lowerBound ? exactCount(object.total) : null,
    stale: object.stale === true,
    error: object.error || null,
  };
}

function currencyFromStats(stats = {}, invoices = []) {
  return cleanText(
    first(
      stats.currency,
      stats.moneda,
      safeArray(stats.byCurrency)[0]?.currency,
      invoices[0]?.currency,
      invoices[0]?.moneda,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();
}

/* =========================================================
   DOMAIN LOADERS
========================================================= */

function forceRequested(options = {}) {
  return options.force === true || options.forceRefresh === true;
}

function defaultDashboardScope(options = {}) {
  return ["ticketsQuery", "incidenciasQuery", "facturasOptions", "facturasStatsOptions"]
    .every((key) => !Object.keys(safeObject(options[key])).length);
}

async function loadIncidenciasForHome(options = {}) {
  const response = await IncidenciasApi.listIncidencias({
    timeout: options.timeout || HOME_TIMEOUT_MS,
    force: forceRequested(options),
    returnStaleOnError: options.returnStaleOnError !== false,
    ttlMs: options.domainTtlMs ?? HOME_CACHE_TTL_MS,
    query: {
      limit: HOME_LIST_LIMIT,
      includeTotal: true,
      sortBy: "updatedAt",
      sortDir: "DESC",
      ...safeObject(options.ticketsQuery),
      ...safeObject(options.incidenciasQuery),
    },
  });
  return collectionFromResponse(response);
}

async function loadFacturasForHome(options = {}) {
  const domainOptions = safeObject(options.facturasOptions);
  const statsOptions = safeObject(options.facturasStatsOptions);

  const [listResult, statsResult] = await Promise.allSettled([
    FacturasApi.listFacturas({
      timeout: options.timeout || HOME_TIMEOUT_MS,
      page: 1,
      limit: HOME_LIST_LIMIT,
      sort: "date_desc",
      direction: "desc",
      returnStaleOnError: options.returnStaleOnError !== false,
      ...domainOptions,
      includeStats: false,
      includeStatsAll: false,
    }),
    FacturasApi.loadFacturasStats({
      timeout: options.timeout || HOME_TIMEOUT_MS,
      ...statsOptions,
    }),
  ]);

  if (listResult.status === "rejected" && isUnauthorizedError(listResult.reason)) {
    throw listResult.reason;
  }
  if (statsResult.status === "rejected" && isUnauthorizedError(statsResult.reason)) {
    throw statsResult.reason;
  }
  if (listResult.status === "rejected" && statsResult.status === "rejected") {
    throw listResult.reason || statsResult.reason;
  }

  const collection = listResult.status === "fulfilled"
    ? collectionFromResponse(listResult.value)
    : { items: [], total: null, stale: false, error: listResult.reason || null };

  const stats = statsResult.status === "fulfilled"
    ? safeObject(statsResult.value)
    : {};

  const warnings = [];
  if (listResult.status === "rejected") {
    warnings.push(normalizeError("facturas_list", listResult.reason));
  }
  if (statsResult.status === "rejected") {
    warnings.push(normalizeError("facturas_stats", statsResult.reason));
  }

  return {
    ...collection,
    stats,
    statsAvailable:
      statsResult.status === "fulfilled" &&
      selectFacturasStats(stats).totalImporte !== null,
    warnings,
  };
}

async function loadAdminCount(loader, options = {}) {
  const response = safeObject(await loader({
    timeout: options.timeout || HOME_TIMEOUT_MS,
    signal: options.signal,
  }));
  return {
    items: [],
    total: response.totalKnown === true ? exactCount(response.total) : null,
    stale: response.stale === true,
    error: response.error || null,
  };
}

async function loadDomain(domain = "home", loader = null) {
  try {
    const result = safeObject(await loader?.(), {});
    const collection = collectionFromResponse(result);

    return {
      domain,
      items: safeArray(result.items).length
        ? safeArray(result.items)
        : collection.items,
      total: Object.hasOwn(result, "total")
        ? exactCount(result.total)
        : collection.total,
      stats: safeObject(result.stats),
      statsAvailable: result.statsAvailable === true,
      stale: result.stale === true,
      error: result.error ? normalizeError(domain, result.error) : null,
      warnings: safeArray(result.warnings),
    };
  } catch (error) {
    if (isUnauthorizedError(error)) throw error;

    return {
      domain,
      items: [],
      total: null,
      stats: {},
      statsAvailable: false,
      stale: false,
      error: normalizeError(domain, error),
      warnings: [],
    };
  }
}

/* =========================================================
   DASHBOARD BUILDERS
========================================================= */

function dateValue(value = "") {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function ticketDisplayId(ticket = {}) {
  return safeId(
    first(
      ticket.ticketId,
      ticket.incidenciaId,
      ticket.code,
      ticket.numero,
      ticket.id,
      ""
    )
  );
}

function invoiceDisplayId(invoice = {}) {
  return safeId(
    first(
      invoice.numeroFacturaLegal,
      invoice.invoiceNumber,
      invoice.number,
      invoice.facturaId,
      invoice.invoiceId,
      invoice.id,
      ""
    )
  );
}

function buildActivity({ incidencias = [], facturas = [] } = {}) {
  const ticketItems = safeArray(incidencias).map((ticket) => ({
    type: "ticket",
    entityId: getIncidenciaEntityId(ticket),
    displayId: ticketDisplayId(ticket),
    title: cleanText(
      first(ticket.subject, ticket.asunto, ticket.title),
      "Incidencia"
    ),
    status: cleanText(first(ticket.status, ticket.estado, ""), ""),
    text: cleanText(
      first(ticket.status, ticket.estado, ticket.priority, ticket.prioridad),
      "Actualizada"
    ),
    date: first(
      ticket.lastActivityAt,
      ticket.updatedAt,
      ticket.createdAt,
      ""
    ),
  }));

  const invoiceItems = safeArray(facturas).map((invoice) => ({
    type: "invoice",
    entityId: getFacturaEntityId(invoice),
    displayId: invoiceDisplayId(invoice),
    title: cleanText(
      first(
        invoice.numeroFacturaLegal,
        invoice.invoiceNumber,
        invoice.number,
        invoice.title,
        invoice.name,
        invoice.id
      ),
      "Factura"
    ),
    status: cleanText(
      first(
        invoice.paymentStatus,
        invoice.estadoPago,
        invoice.status,
        invoice.estado,
        invoice.paid ? "paid" : "issued"
      ),
      "issued"
    ),
    text: cleanText(
      first(
        invoice.paymentStatus,
        invoice.estadoPago,
        invoice.status,
        invoice.estado
      ),
      "Factura"
    ),
    date: first(
      invoice.updatedAt,
      invoice.issuedAt,
      invoice.fechaEmision,
      invoice.createdAt,
      ""
    ),
  }));

  return [...ticketItems, ...invoiceItems]
    .sort((a, b) => {
      const byDate = dateValue(b.date) - dateValue(a.date);
      if (byDate !== 0) return byDate;
      return String(b.entityId || "").localeCompare(
        String(a.entityId || ""),
        "es",
        { numeric: true, sensitivity: "base" }
      );
    })
    .slice(0, HOME_LIST_LIMIT);
}

function buildDashboard({
  context,
  incidenciasResult,
  facturasResult,
  clientesResult,
  usuariosResult,
  warnings = [],
} = {}) {
  const incidencias = safeArray(incidenciasResult?.items);
  const facturas = safeArray(facturasResult?.items);
  const invoiceStats = safeObject(facturasResult?.stats);

  const selectedStats = selectFacturasStats(invoiceStats);
  const totalInvoiced = selectedStats.totalImporte;
  const paidTotal = selectedStats.totalPagado;
  const outstandingAmount = selectedStats.totalPendiente;
  const currency = currencyFromStats(invoiceStats, facturas);

  const domainWarnings = safeArray(warnings).filter(Boolean);
  const loadedAt = nowIso();

  const stale = [
    incidenciasResult,
    facturasResult,
    clientesResult,
    usuariosResult,
  ].some((result) => result?.stale === true);

  const invoiceCount = selectedStats.total;
  const ticketCount = exactCount(incidenciasResult?.total);
  const clientCount = context.admin ? exactCount(clientesResult?.total) : null;
  const userCount = context.admin ? exactCount(usuariosResult?.total) : null;

  return {
    role: context.role,
    admin: context.admin,
    user: context.user,

    tickets: incidencias,
    incidencias,
    facturas,
    invoices: facturas,

    clientes: [],
    clients: [],
    users: [],
    usuarios: [],

    invoiceStats,
    facturasStats: invoiceStats,

    summary: {
      tickets: ticketCount,
      incidencias: ticketCount,
      facturas: invoiceCount,
      invoices: invoiceCount,
      clientes: clientCount,
      clients: clientCount,
      usuarios: userCount,
      users: userCount,

      totalInvoiced,
      totalAmount: totalInvoiced,
      grossAmount: totalInvoiced,
      totalFacturado: totalInvoiced,
      paidTotal,
      paidAmount: paidTotal,
      outstandingAmount,
      currency,
      invoiceStatsAvailable:
        facturasResult?.statsAvailable === true &&
        totalInvoiced !== null,
    },

    activity: buildActivity({ incidencias, facturas }),

    warnings: domainWarnings,
    partial: domainWarnings.length > 0,
    stale,
    cached: false,
    updatedAt: loadedAt,
    loadedAt,

    cache: {
      hydrated: false,
      key: context.key,
      ageMs: 0,
      ttlMs: HOME_CACHE_TTL_MS,
      fresh: true,
    },
  };
}

async function fetchDashboard(options = {}, context = currentContext()) {
  const emptyDomain = (domain) => ({
    domain,
    items: [],
    total: null,
    stats: {},
    statsAvailable: false,
    stale: false,
    error: null,
    warnings: [],
  });

  const [incidenciasResult, facturasResult, clientesResult, usuariosResult] =
    await Promise.all([
      loadDomain("incidencias", () => loadIncidenciasForHome(options)),
      loadDomain("facturas", () => loadFacturasForHome(options)),
      context.admin
        ? loadDomain("clientes", () => loadAdminCount(fetchClientesStatsRequest, options))
        : Promise.resolve(emptyDomain("clientes")),
      context.admin
        ? loadDomain("usuarios", () => loadAdminCount(fetchUsuariosStatsRequest, options))
        : Promise.resolve(emptyDomain("usuarios")),
    ]);

  const primaryFailures = [incidenciasResult, facturasResult].filter(
    (result) => result.error && result.items.length === 0 && !Object.keys(result.stats).length
  );

  if (primaryFailures.length === 2) {
    const error = new Error("No se pudo cargar el resumen del Home.");
    error.status = primaryFailures[0]?.error?.status || null;
    error.code = primaryFailures[0]?.error?.code || "HOME_PRIMARY_LOAD_FAILED";
    error.details = primaryFailures.map((result) => result.error);
    throw error;
  }

  const warnings = [
    incidenciasResult.error,
    ...safeArray(incidenciasResult.warnings),
    facturasResult.error,
    ...safeArray(facturasResult.warnings),
    clientesResult.error,
    ...safeArray(clientesResult.warnings),
    usuariosResult.error,
    ...safeArray(usuariosResult.warnings),
  ].filter(Boolean);

  return buildDashboard({
    context,
    incidenciasResult,
    facturasResult,
    clientesResult,
    usuariosResult,
    warnings,
  });
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function loadHomeDashboard(options = {}) {
  const context = currentContext();
  const requestKey = context.key;
  const requestEpoch = cacheState.epoch;
  const force = forceRequested(options);
  // Custom filters are one-off reads. The existing Home snapshot and its
  // pending request belong only to the unfiltered dashboard for this session.
  const defaultScope = defaultDashboardScope(options);
  const useCache = defaultScope && options.cache !== false && options.noCache !== true;
  const returnStaleOnError = options.returnStaleOnError !== false;

  if (!force && useCache && isCacheFresh(options)) {
    return cachedDashboard({ stale: false });
  }

  if (defaultScope && cacheState.inFlight && cacheState.inFlightKey === requestKey) {
    return cacheState.inFlight;
  }

  cacheState.lastError = null;

  let task = null;
  task = (async () => {
    try {
      const dashboard = await fetchDashboard(options, context);

      if (
        cacheState.epoch !== requestEpoch ||
        currentContext().key !== requestKey
      ) {
        const error = new Error("HOME_CONTEXT_CHANGED");
        error.code = "HOME_CONTEXT_CHANGED";
        throw error;
      }

      if (defaultScope) commitCache(dashboard, context);
      return dashboard;
    } catch (error) {
      cacheState.lastError = normalizeError("home", error);

      if (
        defaultScope && returnStaleOnError &&
        cacheState.epoch === requestEpoch &&
        cacheMatches(requestKey)
      ) {
        return cachedDashboard({ stale: true });
      }

      throw error;
    } finally {
      if (cacheState.inFlight === task) {
        cacheState.inFlight = null;
        cacheState.inFlightKey = "";
      }
    }
  })();

  if (defaultScope) {
    cacheState.inFlight = task;
    cacheState.inFlightKey = requestKey;
  }
  return task;
}

export function hydrateHomeFromCache() {
  return cachedDashboard({ stale: false });
}

export function hasFreshHomeDashboard(options = {}) {
  return isCacheFresh(options);
}

export function getHomeCacheState() {
  const context = currentContext();
  const matched = cacheMatches(context.key);

  return {
    hydrated: matched,
    fresh: matched ? isCacheFresh() : false,
    key: matched ? cacheState.key : "",
    ageMs: matched ? cacheAgeMs() : Number.POSITIVE_INFINITY,
    ttlMs: HOME_CACHE_TTL_MS,
    lastLoadedAt: cacheState.loadedAtMs
      ? new Date(cacheState.loadedAtMs).toISOString()
      : null,
    loading: Boolean(
      cacheState.inFlight && cacheState.inFlightKey === context.key
    ),
    inFlight: Boolean(
      cacheState.inFlight && cacheState.inFlightKey === context.key
    ),
  };
}

export function getHomeApiSnapshot() {
  const dashboard = cacheMatches() ? cacheState.dashboard : null;

  return {
    version: HOME_API_VERSION,
    role: getCurrentRole(),
    admin: getCurrentRole() === "admin",
    lastError: cacheState.lastError,
    cache: {
      ...getHomeCacheState(),
      incidencias: safeArray(dashboard?.incidencias).length,
      facturas: safeArray(dashboard?.facturas).length,
    },
    warnings: safeArray(dashboard?.warnings),
    policy: {
      domainAggregator: true,
      reuseIncidenciasApi: true,
      reuseFacturasApi: true,
      canonicalInvoiceStats: true,
      visibleEntityIds: true,
      adminCountQueries: true,
      inMemoryCache: true,
      inFlightDedupe: true,
      staleOnError: true,
      userScopedCache: true,
      sessionRaceGuard: true,
      noDom: true,
      noRouter: true,
      noStore: true,
      noStorage: true,
      noFetch: true,
    },
  };
}

export const HomeApi = Object.freeze({
  version: HOME_API_VERSION,
  loadHomeDashboard,
  hydrateHomeFromCache,
  hasFreshHomeDashboard,
  clearHomeDashboardCache,
  getHomeCacheState,
  getHomeApiSnapshot,
});

export default HomeApi;
