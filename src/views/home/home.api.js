/* =========================================================
   Onion Support - Home API
   Archivo: /src/views/home/home.api.js

   Responsabilidad:
   - Agregar el dashboard de Inicio desde APIs de dominio existentes.
   - Mantener UN único cache de Home en memoria, aislado por usuario/rol.
   - Deduplicar cargas concurrentes del Home.
   - Tolerar fallos parciales sin ocultar los dominios disponibles.
   - Exponer totales remotos aunque las listas del Home estén limitadas.
   - Solicitar estadísticas globales de facturación sin cargar toda la colección.
   - Sin DOM, Router, Store, Storage ni fetch propio.
   - HTTP directo sólo para contadores admin mínimos (1 fila + total remoto).
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

import IncidenciasApi from "../incidencias/incidencias.api.js";
import FacturasApi from "../facturas/facturas.api.js";

export const HOME_API_VERSION =
  "home.api.domain-aggregator.v8.global-invoice-stats";

export const HOME_TIMEOUT_MS = 15_000;
export const HOME_LIST_LIMIT = 8;
export const HOME_ADMIN_COUNT_LIMIT = 1;
export const HOME_CACHE_TTL_MS = 60_000;

export const HOME_ENDPOINTS = Object.freeze({
  clientes: "/api/clientes",
  usuarios: "/api/users",
});

const LIST_KEYS = Object.freeze([
  "items",
  "rows",
  "results",
  "records",
  "docs",
  "documents",
  "value",
  "list",
  "tickets",
  "incidencias",
  "facturas",
  "invoices",
  "clientes",
  "clients",
  "users",
  "usuarios",
]);

const WRAPPER_KEYS = Object.freeze([
  "data",
  "payload",
  "result",
  "response",
  "body",
]);

const TOTAL_KEYS = Object.freeze([
  "total",
  "totalCount",
  "remoteCount",
  "totalMatched",
  "count",
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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/*
   No aplanar arrays aquí.
   Un array de facturas/incidencias es un valor válido completo, no una lista
   de candidatos. Aplanarlo convertiría el listado en su primer elemento.
*/
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
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return fallback;

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
      text =
        text.lastIndexOf(",") > text.lastIndexOf(".")
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
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (
    [
      "admin",
      "administrator",
      "administrador",
      "superadmin",
      "super_admin",
      "root",
      "owner",
    ].includes(role)
  ) {
    return "admin";
  }

  if (["user", "usuario", "client", "cliente"].includes(role)) {
    return "user";
  }

  return "";
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
   CURRENT APP CONTEXT
========================================================= */

function getCoreState() {
  try {
    return AppCore.getState?.() || AppCore.state || {};
  } catch {
    return AppCore.state || {};
  }
}

function getCurrentUser() {
  const state = getCoreState();

  try {
    return AppCore.getCurrentUser?.() || state.user || state.currentUser || null;
  } catch {
    return state.user || state.currentUser || null;
  }
}

function getCurrentRole() {
  const state = getCoreState();
  const user = safeObject(getCurrentUser(), {});

  return (
    normalizeRole(
      first(
        AppCore.getCurrentRole?.(),
        state.role,
        state.rol,
        state.roles,
        user.role,
        user.rol,
        user.roles,
        "user"
      )
    ) || "user"
  );
}

function getCurrentUserId() {
  const state = getCoreState();
  const user = safeObject(getCurrentUser(), {});

  return safeId(
    first(
      user.userId,
      user.uid,
      user.sub,
      user.id,
      user.email,
      user.username,
      user.slug,
      state.userId,
      ""
    )
  ).toLowerCase();
}

function currentContext() {
  const role = getCurrentRole();
  const user = getCurrentUser();
  const userId = getCurrentUserId();

  return {
    role,
    admin: role === "admin",
    user,
    userId,
    key: `${role}:${userId}`,
  };
}

/* =========================================================
   HOME CACHE
========================================================= */

function cacheAgeMs() {
  if (!cacheState.loadedAtMs) return Number.POSITIVE_INFINITY;
  return Math.max(0, now() - cacheState.loadedAtMs);
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
  const key = currentContext().key;

  if (!cacheMatches(key)) return false;

  const ttlMs = number(
    options.ttlMs ?? options.cacheTtlMs,
    HOME_CACHE_TTL_MS
  );

  return ttlMs > 0 && cacheAgeMs() <= ttlMs;
}

function cachedDashboard({ stale = false } = {}) {
  const key = currentContext().key;

  if (!cacheMatches(key)) return null;

  const dashboard = cacheState.dashboard;

  return {
    ...dashboard,
    cached: true,
    stale: stale || dashboard.stale === true,
    cache: {
      ...safeObject(dashboard.cache),
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

/* =========================================================
   COLLECTION READERS
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

function totalFromPayload(value = null, fallback = 0, depth = 0) {
  if (!isObject(value) || depth > 4) {
    return Math.max(0, number(fallback, 0));
  }

  let best = Math.max(0, number(fallback, 0));

  for (const key of TOTAL_KEYS) {
    best = Math.max(best, number(value[key], 0));
  }

  for (const nested of [
    value.meta,
    value.pagination,
    value.paging,
    value.pageInfo,
  ]) {
    if (!isObject(nested)) continue;

    for (const key of TOTAL_KEYS) {
      best = Math.max(best, number(nested[key], 0));
    }
  }

  for (const key of WRAPPER_KEYS) {
    const nested = value[key];
    if (isObject(nested)) {
      best = Math.max(best, totalFromPayload(nested, best, depth + 1));
    }
  }

  return best;
}

function collectionFromResponse(response = null, fallbackTotal = 0) {
  const items = unwrapList(response);
  const object = safeObject(response, {});

  return {
    items,
    total: Math.max(items.length, totalFromPayload(response, fallbackTotal)),
    stale: object.stale === true,
    error: object.error || null,
    stats: safeObject(
      first(object.statsAllMatched, object.stats, object.meta?.stats, {})
    ),
  };
}

/* =========================================================
   DOMAIN LOADERS
========================================================= */

function forceRequested(options = {}) {
  return options.force === true || options.forceRefresh === true;
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
  const response = await FacturasApi.listFacturas({
    timeout: options.timeout || HOME_TIMEOUT_MS,
    page: 1,
    limit: HOME_LIST_LIMIT,
    sort: "date_desc",
    direction: "desc",
    returnStaleOnError: options.returnStaleOnError !== false,

    /*
       Permitimos opciones de dominio (filtros/timeout/orden) pero las
       estadísticas globales son obligatorias para que el Home no calcule
       el importe pagado únicamente con las 8 facturas visibles.
    */
    ...safeObject(options.facturasOptions),

    includeStats: true,
    includeStatsAll: true,
  });

  return collectionFromResponse(response);
}

async function loadAdminCount(
  endpoint = "",
  {
    timeout = HOME_TIMEOUT_MS,
    source = "views.home.count",
    query = {},
  } = {}
) {
  const response = await Http.get(endpoint, {
    timeout,
    source,
    query: {
      limit: HOME_ADMIN_COUNT_LIMIT,
      includeTotal: true,
      ...safeObject(query),
    },
  });

  const items = unwrapList(response);

  return {
    items: [],
    total: Math.max(items.length, totalFromPayload(response, items.length)),
    stale: safeObject(response).stale === true,
    error: safeObject(response).error || null,
    stats: {},
  };
}

async function loadClientesForHome(options = {}) {
  return loadAdminCount(HOME_ENDPOINTS.clientes, {
    timeout: options.timeout || HOME_TIMEOUT_MS,
    source: "views.home.clientes.count",
    query: safeObject(options.clientesQuery),
  });
}

async function loadUsuariosForHome(options = {}) {
  return loadAdminCount(HOME_ENDPOINTS.usuarios, {
    timeout: options.timeout || HOME_TIMEOUT_MS,
    source: "views.home.usuarios.count",
    query: {
      ...safeObject(options.usersQuery),
      ...safeObject(options.usuariosQuery),
    },
  });
}

async function loadDomain(domain = "home", loader = null) {
  try {
    const result = safeObject(await loader?.(), {});

    return {
      domain,
      items: safeArray(result.items),
      total: Math.max(safeArray(result.items).length, number(result.total, 0)),
      stats: safeObject(result.stats),
      stale: result.stale === true,
      error: result.error ? normalizeError(domain, result.error) : null,
    };
  } catch (error) {
    if (isUnauthorizedError(error)) throw error;

    return {
      domain,
      items: [],
      total: 0,
      stats: {},
      stale: false,
      error: normalizeError(domain, error),
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

function invoicePaid(invoice = {}) {
  const status = cleanText(
    first(
      invoice.paymentStatus,
      invoice.estadoPago,
      invoice.status,
      invoice.estado,
      ""
    ),
    ""
  ).toLowerCase();

  return Boolean(
    invoice.paid === true ||
      invoice.isPaid === true ||
      invoice.pagada === true ||
      [
        "paid",
        "pagada",
        "pagado",
        "completed",
        "complete",
        "settled",
      ].includes(status)
  );
}

function invoiceAmount(invoice = {}) {
  return number(
    first(
      invoice.total,
      invoice.totalAmount,
      invoice.amount,
      invoice.importe,
      invoice.importeTotal,
      invoice.totalFactura,
      invoice.invoiceAmount,
      invoice.summary?.total,
      0
    ),
    0
  );
}

function invoiceCurrency(invoice = {}) {
  return cleanText(
    first(
      invoice.currency,
      invoice.moneda,
      invoice.summary?.currency,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();
}

function paidTotalFromStats(stats = {}, invoices = []) {
  const source = safeObject(stats);

  const candidate = first(
    source.paidTotal,
    source.totalPaid,
    source.totalPagado,
    source.importePagado,
    source.paidAmount,
    source.amountPaid,
    source.totals?.paid,
    source.totals?.paidAmount,
    source.totales?.pagado,
    source.totales?.importePagado,
    null
  );

  if (candidate !== null) {
    return number(candidate, 0);
  }

  return safeArray(invoices).reduce(
    (sum, invoice) =>
      sum + (invoicePaid(invoice) ? invoiceAmount(invoice) : 0),
    0
  );
}

function buildActivity({ incidencias = [], facturas = [] } = {}) {
  const ticketItems = safeArray(incidencias).map((ticket) => ({
    type: "ticket",
    title: cleanText(
      first(ticket.subject, ticket.asunto, ticket.title),
      "Incidencia"
    ),
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
    .sort((a, b) => dateValue(b.date) - dateValue(a.date))
    .slice(0, 8);
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
  const clientes = context.admin ? safeArray(clientesResult?.items) : [];
  const usuarios = context.admin ? safeArray(usuariosResult?.items) : [];

  const loadedAt = nowIso();
  const domainWarnings = safeArray(warnings).filter(Boolean);
  const stale = [
    incidenciasResult,
    facturasResult,
    clientesResult,
    usuariosResult,
  ].some((result) => result?.stale === true);

  const paidTotal = paidTotalFromStats(facturasResult?.stats, facturas);
  const currency = cleanText(
    first(
      facturasResult?.stats?.currency,
      facturasResult?.stats?.moneda,
      facturas[0]?.currency,
      facturas[0]?.moneda,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();

  return {
    role: context.role,
    admin: context.admin,
    user: context.user,

    tickets: incidencias,
    incidencias,

    facturas,
    invoices: facturas,

    clientes,
    clients: clientes,

    users: usuarios,
    usuarios,

    summary: {
      tickets: Math.max(
        incidencias.length,
        number(incidenciasResult?.total, 0)
      ),
      incidencias: Math.max(
        incidencias.length,
        number(incidenciasResult?.total, 0)
      ),

      facturas: Math.max(
        facturas.length,
        number(facturasResult?.total, 0)
      ),
      invoices: Math.max(
        facturas.length,
        number(facturasResult?.total, 0)
      ),

      clientes: context.admin
        ? Math.max(clientes.length, number(clientesResult?.total, 0))
        : 0,
      clients: context.admin
        ? Math.max(clientes.length, number(clientesResult?.total, 0))
        : 0,

      users: context.admin
        ? Math.max(usuarios.length, number(usuariosResult?.total, 0))
        : 0,
      usuarios: context.admin
        ? Math.max(usuarios.length, number(usuariosResult?.total, 0))
        : 0,

      paidTotal,
      currency,
    },

    activity: buildActivity({
      incidencias,
      facturas,
    }),

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
    total: 0,
    stats: {},
    stale: false,
    error: null,
  });

  /*
     Todos los dominios necesarios salen en paralelo.
     El Home no debe esperar a incidencias/facturas para empezar clientes/usuarios.
  */
  const [
    incidenciasResult,
    facturasResult,
    clientesResult,
    usuariosResult,
  ] = await Promise.all([
    loadDomain("incidencias", () => loadIncidenciasForHome(options)),
    loadDomain("facturas", () => loadFacturasForHome(options)),
    context.admin
      ? loadDomain("clientes", () => loadClientesForHome(options))
      : Promise.resolve(emptyDomain("clientes")),
    context.admin
      ? loadDomain("usuarios", () => loadUsuariosForHome(options))
      : Promise.resolve(emptyDomain("usuarios")),
  ]);

  const primaryFailures = [incidenciasResult, facturasResult].filter(
    (result) => result.error && result.items.length === 0
  );

  if (primaryFailures.length === 2) {
    const error = new Error("No se pudo cargar el resumen del Home.");
    error.status = primaryFailures[0]?.error?.status || null;
    error.code =
      primaryFailures[0]?.error?.code || "HOME_PRIMARY_LOAD_FAILED";
    error.details = primaryFailures.map((result) => result.error);
    throw error;
  }

  const warnings = [
    incidenciasResult.error,
    facturasResult.error,
    clientesResult.error,
    usuariosResult.error,
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
  const useCache = options.cache !== false && options.noCache !== true;
  const returnStaleOnError = options.returnStaleOnError !== false;

  if (!force && useCache && isCacheFresh(options)) {
    return cachedDashboard({ stale: false });
  }

  /*
     Incluso un refresh manual reutiliza una carga ya en curso del mismo usuario.
     Lanzar dos agregaciones idénticas en paralelo sólo añade coste y carreras.
  */
  if (cacheState.inFlight && cacheState.inFlightKey === requestKey) {
    return cacheState.inFlight;
  }

  cacheState.lastError = null;

  let task = null;

  task = (async () => {
    try {
      const dashboard = await fetchDashboard(options, context);

      /*
         Si cambió usuario/rol o se limpió el cache durante la petición,
         descartamos el resultado para no mezclar sesiones.
      */
      if (
        cacheState.epoch !== requestEpoch ||
        currentContext().key !== requestKey
      ) {
        const error = new Error("HOME_CONTEXT_CHANGED");
        error.code = "HOME_CONTEXT_CHANGED";
        throw error;
      }

      commitCache(dashboard, context);
      return dashboard;
    } catch (error) {
      cacheState.lastError = normalizeError("home", error);

      if (
        returnStaleOnError &&
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

  cacheState.inFlight = task;
  cacheState.inFlightKey = requestKey;

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

  return {
    hydrated: cacheMatches(context.key),
    fresh: isCacheFresh(),
    key: cacheMatches(context.key) ? cacheState.key : "",
    ageMs: cacheMatches(context.key)
      ? cacheAgeMs()
      : Number.POSITIVE_INFINITY,
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
      clientes: safeArray(dashboard?.clientes).length,
      usuarios: safeArray(dashboard?.usuarios).length,
    },
    warnings: safeArray(dashboard?.warnings),
    policy: {
      domainAggregator: true,
      reuseIncidenciasApi: true,
      reuseFacturasApi: true,
      globalInvoiceStats: true,
      adminCountQueries: true,
      adminCountLimit: HOME_ADMIN_COUNT_LIMIT,
      directHttpOnlyForAdminCounts: true,
      inMemoryHomeCache: true,
      ttlCache: true,
      inFlightDedupe: true,
      staleOnError: true,
      userScopedCache: true,
      sessionRaceGuard: true,
      noFetch: true,
      noStore: true,
      noStorage: true,
      noDom: true,
      noRouter: true,
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
