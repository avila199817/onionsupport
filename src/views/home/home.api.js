/* =========================================================
   Onion Support - Home API
   Archivo: /src/views/home/home.api.js

   Responsabilidad:
   - Cargar datos mínimos del Home desde backend real.
   - Usar core/http.js como única capa HTTP.
   - Construir dashboard ligero desde endpoints de listado.
   - Mantener cache en memoria para no recargar al cambiar de vista.
   - Dedupe de peticiones concurrentes con in-flight promise.
   - Admin: tickets, facturas, clientes, usuarios.
   - User: tickets y facturas propias según scope backend.
   - Sin DOM.
   - Sin Router.
   - Sin Store.
   - Sin Storage.
   - Sin fetch propio.
   - Sin modelos externos.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

export const HOME_API_VERSION = "home.api.cached.v2";

export const HOME_ENDPOINTS = Object.freeze({
  tickets: "/api/tickets",
  facturas: "/api/facturas",
  clientes: "/api/clientes",
  users: "/api/users",
});

export const HOME_TIMEOUT_MS = 15000;
export const HOME_LIST_LIMIT = 24;
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
    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
  const user = getCurrentUser() || {};

  return safeId(
    first(
      user.userId,
      user.id,
      user.username,
      user.slug,
      getCoreState().userId,
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
      ...(isObject(dashboard.cache) ? dashboard.cache : {}),
      ...(isObject(patch.cache) ? patch.cache : {}),
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
   RESPONSE NORMALIZATION
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

/* =========================================================
   DTOs
========================================================= */

function normalizeTicket(item = {}) {
  const raw = isObject(item) ? item : {};
  const id = cleanText(first(raw.ticketId, raw.incidenciaId, raw.id, raw.code, raw.numero), "");

  return {
    id,
    ticketId: id,
    incidenciaId: id,

    subject: cleanText(first(raw.subject, raw.asunto, raw.title, raw.titulo, raw.name), "Incidencia"),
    description: cleanText(first(raw.description, raw.descripcion, raw.message, raw.preview), ""),

    status: cleanText(first(raw.status, raw.estado, raw.state), "open"),
    priority: cleanText(first(raw.priority, raw.prioridad, raw.severity), "normal"),
    category: cleanText(first(raw.category, raw.categoria, raw.type, raw.tipo), "Soporte"),

    requesterName: cleanText(
      first(
        raw.requesterName,
        raw.userName,
        raw.clientName,
        raw.clienteName,
        raw.requesterSnapshot?.displayName,
        raw.user?.displayName,
        raw.cliente?.displayName
      ),
      "Usuario"
    ),

    avatarUrl: cleanText(first(raw.avatarUrl, raw.requesterAvatarUrl, raw.userAvatarUrl, ""), ""),

    createdAt: first(raw.createdAt, raw.fechaCreacion, raw.created_at, ""),
    updatedAt: first(raw.updatedAt, raw.updated_at, raw.lastActivityAt, raw.modifiedAt, raw.createdAt, ""),

    invoices: safeArray(first(raw.invoices, raw.facturas, [])),
  };
}

function normalizeInvoice(item = {}) {
  const raw = isObject(item) ? item : {};
  const id = cleanText(
    first(raw.invoiceId, raw.facturaId, raw.id, raw.number, raw.numeroFacturaLegal, raw.numeroFactura),
    ""
  );

  const total = number(first(raw.total, raw.amount, raw.importe, raw.totales?.total), 0);
  const paidAmount = number(first(raw.paidAmount, raw.amountPaid, raw.pagado, raw.totales?.pagado), 0);
  const status = cleanText(first(raw.status, raw.estado, raw.paymentStatus, raw.estadoPago), "");
  const paid = ["paid", "pagada", "pagado", "completed", "complete"].includes(status.toLowerCase());

  return {
    id,
    invoiceId: id,
    facturaId: id,

    title: cleanText(first(raw.title, raw.name, raw.concepto, raw.conceptoPrincipal), id || "Factura"),
    status: status || (paid ? "paid" : "pending"),
    paid,

    total,
    amount: total,
    paidAmount: paidAmount || (paid ? total : 0),
    currency: cleanText(first(raw.currency, raw.moneda), "EUR"),

    ticketId: cleanText(first(raw.ticketId, raw.incidenciaId, raw.ticketRef?.ticketId), ""),

    createdAt: first(raw.createdAt, raw.fechaCreacion, raw.date, ""),
    issuedAt: first(raw.issuedAt, raw.fechaEmision, raw.createdAt, ""),
    paidAt: first(raw.paidAt, raw.fechaPago, ""),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.createdAt, ""),
  };
}

function normalizeClient(item = {}) {
  const raw = isObject(item) ? item : {};
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
  const raw = isObject(item) ? item : {};
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
   HTTP
========================================================= */

async function loadList(endpoint = "", {
  skip = false,
  params = {},
  timeout = HOME_TIMEOUT_MS,
} = {}) {
  if (skip) return [];

  const query = {
    limit: HOME_LIST_LIMIT,
    includeTotal: true,
    ...params,
  };

  return unwrapList(
    await Http.get(endpoint, {
      query,
      timeout,
      source: "views.home",
    })
  );
}

/* =========================================================
   DASHBOARD BUILDERS
========================================================= */

function dateValue(value = "") {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function buildActivity({ tickets = [], facturas = [] } = {}) {
  const ticketItems = tickets.map((ticket) => ({
    type: "ticket",
    title: ticket.subject || "Incidencia",
    text: ticket.status || "Actualizada",
    date: ticket.updatedAt || ticket.createdAt || "",
  }));

  const invoiceItems = facturas.map((invoice) => ({
    type: "invoice",
    title: invoice.title || invoice.id || "Factura",
    text: invoice.status || "Factura",
    date: invoice.updatedAt || invoice.issuedAt || invoice.createdAt || "",
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
} = {}) {
  const role = getCurrentRole();
  const admin = role === "admin";
  const user = getCurrentUser();

  const paidTotal = facturas.reduce((sum, invoice) => {
    return sum + number(invoice.paid ? first(invoice.paidAmount, invoice.total, invoice.amount) : 0, 0);
  }, 0);

  const loadedAt = nowIso();

  const dashboard = {
    role,
    admin,
    user,

    tickets,
    incidencias: tickets,

    facturas,
    invoices: facturas,

    clientes: admin ? clientes : [],
    clients: admin ? clientes : [],

    users: admin ? users : [],
    usuarios: admin ? users : [],

    summary: {
      tickets: tickets.length,
      incidencias: tickets.length,
      facturas: facturas.length,
      invoices: facturas.length,
      clientes: admin ? clientes.length : 0,
      clients: admin ? clientes.length : 0,
      users: admin ? users.length : 0,
      usuarios: admin ? users.length : 0,
      paidTotal,
      currency: facturas[0]?.currency || "EUR",
    },

    activity: buildActivity({
      tickets,
      facturas,
    }),

    cached: false,
    stale: false,

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
    cached: false,
    stale: false,
  });
}

async function fetchDashboard(options = {}) {
  const admin = isAdmin();

  const [
    ticketsRaw,
    facturasRaw,
    clientesRaw,
    usersRaw,
  ] = await Promise.all([
    loadList(HOME_ENDPOINTS.tickets, options),
    loadList(HOME_ENDPOINTS.facturas, options),
    loadList(HOME_ENDPOINTS.clientes, {
      ...options,
      skip: !admin,
    }),
    loadList(HOME_ENDPOINTS.users, {
      ...options,
      skip: !admin,
    }),
  ]);

  return buildDashboard({
    tickets: ticketsRaw.map(normalizeTicket),
    facturas: facturasRaw.map(normalizeInvoice),
    clientes: admin ? clientesRaw.map(normalizeClient) : [],
    users: admin ? usersRaw.map(normalizeUser) : [],
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
        status: error?.status || error?.statusCode || null,
        code: error?.code || null,
        at: nowIso(),
      };

      if (returnStaleOnError && lastDashboard) {
        return getCachedDashboard({
          stale: true,
        }) || {
          ...lastDashboard,
          stale: true,
          error: lastError.message,
        };
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
  }) || buildDashboard();
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
