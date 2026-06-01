/* =========================================================
   Onion Support - Home API
   Archivo: /src/views/home/home.api.js

   Responsabilidad:
   - Construir el dashboard ligero del Home.
   - Reutilizar APIs de dominio existentes.
   - Usar core/http.js sólo para dominios sin API propia aún.
   - Mantener cache en memoria del dashboard ensamblado.
   - Dedupe de peticiones concurrentes con in-flight promise.
   - Admin: incidencias, facturas, clientes, usuarios.
   - User: incidencias y facturas propias según scope backend.
   - Sin DOM.
   - Sin Router.
   - Sin Store.
   - Sin Storage.
   - Sin fetch propio.
   - Sin normalizar de nuevo Incidencias/Facturas.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

import IncidenciasApi from "../incidencias/incidencias.api.js";
import FacturasApi from "../facturas/facturas.api.js";

export const HOME_API_VERSION = "home.api.domain-aggregator.v3";

export const HOME_ENDPOINTS = Object.freeze({
  tickets: "/api/tickets",
  facturas: "/api/facturas",
  clientes: "/api/clientes",
  users: "/api/users",
});

export const HOME_TIMEOUT_MS = 15000;
export const HOME_LIST_LIMIT = 24;
export const HOME_ADMIN_LIST_LIMIT = 24;
export const HOME_CACHE_TTL_MS = 60000;

let lastDashboard = null;
let lastError = null;
let lastLoadedAt = null;
let lastCacheKey = "";
let inFlightPromise = null;
let loading = false;

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

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function now() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
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

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return "";
}

function safeId(value = "") {
  return cleanText(value, "")
    .replace(/[\r\n\t]/g, "")
    .slice(0, 180);
}

/* =========================================================
   CORE STATE
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
  const user = getCurrentUser() || {};

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
        ""
      )
    ) || "user"
  );
}

function getCurrentUserId() {
  const state = getCoreState();
  const user = getCurrentUser() || {};

  return safeId(
    first(
      user.userId,
      user.id,
      user.username,
      user.slug,
      state.userId,
      ""
    )
  );
}

function isAdmin() {
  return getCurrentRole() === "admin";
}

function cacheKey() {
  return [
    getCurrentRole(),
    getCurrentUserId(),
  ].join(":");
}

/* =========================================================
   CACHE
========================================================= */

function cacheAgeMs() {
  if (!lastLoadedAt) return Number.POSITIVE_INFINITY;

  const time = Date.parse(lastLoadedAt);

  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;

  return Math.max(0, now() - time);
}

function isCacheFresh(options = {}) {
  if (!lastDashboard) return false;

  const key = cacheKey();

  if (lastCacheKey && key && lastCacheKey !== key) return false;

  const ttl = number(options.ttlMs ?? options.cacheTtlMs, HOME_CACHE_TTL_MS);

  if (ttl <= 0) return false;

  return cacheAgeMs() <= ttl;
}

function cloneDashboard(dashboard = null, patch = {}) {
  if (!isObject(dashboard)) return null;

  const cachePatch = isObject(patch.cache) ? patch.cache : {};
  const currentCache = isObject(dashboard.cache) ? dashboard.cache : {};

  return {
    ...dashboard,
    ...patch,

    summary: isObject(dashboard.summary)
      ? {
          ...dashboard.summary,
          ...(isObject(patch.summary) ? patch.summary : {}),
        }
      : patch.summary,

    cache: {
      hydrated: true,
      key: lastCacheKey || cacheKey(),
      ageMs: cacheAgeMs(),
      ttlMs: HOME_CACHE_TTL_MS,
      ...currentCache,
      ...cachePatch,
    },
  };
}

function setCache(dashboard = null) {
  if (!isObject(dashboard)) return null;

  lastDashboard = dashboard;
  lastLoadedAt = dashboard.loadedAt || nowIso();
  lastCacheKey = cacheKey();

  return lastDashboard;
}

function getCachedDashboard(options = {}) {
  if (!lastDashboard) return null;

  const key = cacheKey();

  if (lastCacheKey && key && lastCacheKey !== key) {
    return null;
  }

  return cloneDashboard(lastDashboard, {
    cached: true,
    stale: options.stale === true ? true : lastDashboard.stale === true,
  });
}

export function clearHomeDashboardCache() {
  lastDashboard = null;
  lastError = null;
  lastLoadedAt = null;
  lastCacheKey = "";
  inFlightPromise = null;
  loading = false;

  return true;
}

/* =========================================================
   RESPONSE UNWRAP · ADMIN FALLBACK DOMAINS
========================================================= */

function unwrapPayload(response = null) {
  if (Array.isArray(response)) return response;

  const object = isObject(response) ? response : {};

  return first(
    object.items,
    object.rows,
    object.results,
    object.records,
    object.docs,
    object.documents,
    object.value,
    object.list,

    object.data?.items,
    object.data?.rows,
    object.data?.results,
    object.data?.records,
    object.data?.docs,
    object.data?.documents,
    object.data?.value,
    object.data,

    object.payload?.items,
    object.payload?.rows,
    object.payload?.results,
    object.payload,

    object.result?.items,
    object.result?.rows,
    object.result?.results,
    object.result,

    []
  );
}

function unwrapList(response = null) {
  const payload = unwrapPayload(response);
  return safeArray(payload);
}

async function loadAdminList(endpoint = "", {
  skip = false,
  params = {},
  timeout = HOME_TIMEOUT_MS,
  source = "views.home.admin",
} = {}) {
  if (skip) return [];

  const response = await Http.get(endpoint, {
    timeout,
    source,
    query: {
      limit: HOME_ADMIN_LIST_LIMIT,
      includeTotal: true,
      ...safeObject(params),
    },
  });

  return unwrapList(response);
}

/* =========================================================
   LIGHT DTOs · ONLY FOR DOMAINS WITHOUT API MODULE YET
========================================================= */

function normalizeClient(item = {}) {
  const raw = safeObject(item);
  const id = cleanText(first(raw.clienteId, raw.clientId, raw.id, raw.userId), "");

  return {
    id,
    clienteId: id,
    clientId: id,
    name: cleanText(first(raw.name, raw.nombre, raw.displayName, raw.razonSocial, raw.companyName), "Cliente"),
    active: raw.active !== false,
    createdAt: first(raw.createdAt, ""),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, ""),
  };
}

function normalizeUser(item = {}) {
  const raw = safeObject(item);
  const id = cleanText(first(raw.userId, raw.id, raw.username, raw.slug), "");

  return {
    id,
    userId: id,
    username: cleanText(first(raw.username, raw.userName, raw.slug), ""),
    displayName: cleanText(first(raw.displayName, raw.name, raw.nombre, raw.fullName, raw.username), "Usuario"),
    role: normalizeRole(first(raw.role, raw.rol, raw.roles, "user")) || "user",
    active: raw.disabled === true ? false : raw.active !== false,
    avatarUrl: cleanText(first(raw.avatarUrl, raw.avatar, raw.picture, raw.profile?.avatarUrl), ""),
  };
}

/* =========================================================
   DOMAIN LOADERS
========================================================= */

async function loadIncidenciasForHome(options = {}) {
  if (!IncidenciasApi?.listIncidencias) return [];

  const response = await IncidenciasApi.listIncidencias({
    timeout: options.timeout || HOME_TIMEOUT_MS,
    query: {
      limit: HOME_LIST_LIMIT,
      includeTotal: true,
      sortBy: "updatedAt",
      sortDir: "DESC",
      ...(isObject(options.ticketsQuery) ? options.ticketsQuery : {}),
      ...(isObject(options.incidenciasQuery) ? options.incidenciasQuery : {}),
    },
    returnStaleOnError: options.returnStaleOnError !== false,
  });

  return safeArray(response?.items);
}

async function loadFacturasForHome(options = {}) {
  if (!FacturasApi?.listFacturas) return [];

  const response = await FacturasApi.listFacturas({
    timeout: options.timeout || HOME_TIMEOUT_MS,
    page: 1,
    limit: HOME_LIST_LIMIT,
    sort: "recent",
    direction: "desc",
    returnStaleOnError: options.returnStaleOnError !== false,
    ...(isObject(options.facturasOptions) ? options.facturasOptions : {}),
  });

  return safeArray(response?.items);
}

async function loadClientesForHome(options = {}) {
  const admin = isAdmin();

  if (!admin) return [];

  const clientes = await loadAdminList(HOME_ENDPOINTS.clientes, {
    skip: !admin,
    timeout: options.timeout || HOME_TIMEOUT_MS,
    source: "views.home.clientes",
    params: isObject(options.clientesQuery) ? options.clientesQuery : {},
  });

  return clientes.map(normalizeClient).filter((item) => item.id);
}

async function loadUsersForHome(options = {}) {
  const admin = isAdmin();

  if (!admin) return [];

  const users = await loadAdminList(HOME_ENDPOINTS.users, {
    skip: !admin,
    timeout: options.timeout || HOME_TIMEOUT_MS,
    source: "views.home.users",
    params: isObject(options.usersQuery) ? options.usersQuery : {},
  });

  return users.map(normalizeUser).filter((item) => item.id);
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
      ["paid", "pagada", "pagado", "completed", "complete"].includes(status)
  );
}

function invoiceAmount(invoice = {}) {
  return number(
    first(
      invoice.total,
      invoice.amount,
      invoice.importe,
      invoice.paidAmount,
      invoice.pagado,
      0
    ),
    0
  );
}

function invoiceCurrency(invoice = {}) {
  return cleanText(first(invoice.currency, invoice.moneda, "EUR"), "EUR").toUpperCase();
}

function buildActivity({ tickets = [], facturas = [] } = {}) {
  const ticketItems = safeArray(tickets).map((ticket) => ({
    type: "ticket",
    title: cleanText(first(ticket.subject, ticket.asunto, ticket.title), "Incidencia"),
    text: cleanText(first(ticket.status, ticket.estado, ticket.priority, ticket.prioridad), "Actualizada"),
    date: first(ticket.lastActivityAt, ticket.updatedAt, ticket.createdAt, ""),
  }));

  const invoiceItems = safeArray(facturas).map((invoice) => ({
    type: "invoice",
    title: cleanText(first(invoice.title, invoice.name, invoice.number, invoice.id), "Factura"),
    text: cleanText(first(invoice.paymentStatus, invoice.estadoPago, invoice.status, invoice.estado), "Factura"),
    date: first(invoice.updatedAt, invoice.issuedAt, invoice.createdAt, ""),
  }));

  return [...ticketItems, ...invoiceItems]
    .sort((a, b) => dateValue(b.date) - dateValue(a.date))
    .slice(0, 8);
}

function buildDashboard({
  tickets = [],
  facturas = [],
  clientes = [],
  users = [],
  cached = false,
  stale = false,
} = {}) {
  const role = getCurrentRole();
  const admin = role === "admin";
  const user = getCurrentUser();
  const loadedAt = nowIso();

  const ticketRows = safeArray(tickets);
  const invoiceRows = safeArray(facturas);
  const clientRows = admin ? safeArray(clientes) : [];
  const userRows = admin ? safeArray(users) : [];

  const paidTotal = invoiceRows.reduce((sum, invoice) => {
    return sum + (invoicePaid(invoice) ? invoiceAmount(invoice) : 0);
  }, 0);

  const dashboard = {
    role,
    admin,
    user,

    tickets: ticketRows,
    incidencias: ticketRows,

    facturas: invoiceRows,
    invoices: invoiceRows,

    clientes: clientRows,
    clients: clientRows,

    users: userRows,
    usuarios: userRows,

    summary: {
      tickets: ticketRows.length,
      incidencias: ticketRows.length,

      facturas: invoiceRows.length,
      invoices: invoiceRows.length,

      clientes: clientRows.length,
      clients: clientRows.length,

      users: userRows.length,
      usuarios: userRows.length,

      paidTotal,
      currency: invoiceCurrency(invoiceRows[0]),
    },

    activity: buildActivity({
      tickets: ticketRows,
      facturas: invoiceRows,
    }),

    cached,
    stale,

    updatedAt: loadedAt,
    loadedAt,

    cache: {
      hydrated: false,
      key: cacheKey(),
      ageMs: 0,
      ttlMs: HOME_CACHE_TTL_MS,
    },
  };

  setCache(dashboard);

  return cloneDashboard(dashboard, {
    cached,
    stale,
  });
}

async function fetchDashboard(options = {}) {
  const admin = isAdmin();

  const [
    tickets,
    facturas,
    clientes,
    users,
  ] = await Promise.all([
    loadIncidenciasForHome(options),
    loadFacturasForHome(options),
    loadClientesForHome({
      ...options,
      skip: !admin,
    }),
    loadUsersForHome({
      ...options,
      skip: !admin,
    }),
  ]);

  return buildDashboard({
    tickets,
    facturas,
    clientes: admin ? clientes : [],
    users: admin ? users : [],
    cached: false,
    stale: false,
  });
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function loadHomeDashboard(options = {}) {
  const force = options.force === true || options.forceRefresh === true;
  const useCache = options.cache !== false && options.noCache !== true;
  const returnStaleOnError = options.returnStaleOnError !== false;

  if (!force && useCache && isCacheFresh(options)) {
    return getCachedDashboard({
      stale: false,
    });
  }

  if (!force && inFlightPromise) {
    return inFlightPromise;
  }

  loading = true;
  lastError = null;

  inFlightPromise = (async () => {
    try {
      return await fetchDashboard(options);
    } catch (error) {
      lastError = {
        message: redact(error?.message || "No se pudo cargar el Home."),
        status: error?.status || error?.statusCode || error?.response?.status || null,
        code: error?.code || null,
        at: nowIso(),
      };

      if (returnStaleOnError && lastDashboard) {
        return getCachedDashboard({
          stale: true,
        }) || cloneDashboard(lastDashboard, {
          stale: true,
          error: lastError.message,
        });
      }

      throw error;
    } finally {
      loading = false;
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

export function hydrateHomeFromCache() {
  return getCachedDashboard({
    stale: false,
  }) || buildDashboard({
    cached: true,
    stale: false,
  });
}

export function hasFreshHomeDashboard(options = {}) {
  return isCacheFresh(options);
}

export function getHomeCacheState() {
  return {
    hydrated: Boolean(lastDashboard),
    fresh: isCacheFresh(),
    key: lastCacheKey,
    ageMs: cacheAgeMs(),
    ttlMs: HOME_CACHE_TTL_MS,
    lastLoadedAt,
    loading,
    inFlight: Boolean(inFlightPromise),
  };
}

export function getHomeApiSnapshot() {
  return {
    version: HOME_API_VERSION,

    loading,
    inFlight: Boolean(inFlightPromise),

    lastLoadedAt,
    lastError,

    role: getCurrentRole(),
    admin: isAdmin(),

    endpoints: HOME_ENDPOINTS,

    cache: {
      ...getHomeCacheState(),
      tickets: lastDashboard?.tickets?.length || 0,
      facturas: lastDashboard?.facturas?.length || 0,
      clientes: lastDashboard?.clientes?.length || 0,
      users: lastDashboard?.users?.length || 0,
    },

    policy: {
      singleHttpLayer: true,
      domainAggregator: true,
      reuseIncidenciasApi: true,
      reuseFacturasApi: true,
      directAdminFallbackUntilDomainApisExist: true,

      inMemoryCache: true,
      ttlCache: true,
      inFlightDedupe: true,
      staleOnError: true,

      noFetch: true,
      noStore: true,
      noStorage: true,
      noDom: true,
      noRouter: true,
    },
  };
}

/* =========================================================
   COMPAT API
========================================================= */

export const HomeApi = {
  version: HOME_API_VERSION,

  endpoints: HOME_ENDPOINTS,

  loadHomeDashboard,
  hydrateHomeFromCache,

  hasFreshHomeDashboard,
  clearHomeDashboardCache,
  getHomeCacheState,

  getHomeApiSnapshot,
  getSnapshot: getHomeApiSnapshot,
  getDebugSnapshot: getHomeApiSnapshot,
};

export default HomeApi;
