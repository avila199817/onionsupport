/* =========================================================
   Onion Support - Home API
   Archivo: /src/views/home/home.api.js

   Responsabilidad:
   - Cargar datos del Home desde backend real existente.
   - Usar Core HTTP como única capa de transporte.
   - Construir dashboard local desde endpoints de listado:
     /api/tickets
     /api/facturas
     /api/clientes sólo admin
     /api/users sólo admin
   - Vista Home distinta para admin y user.
   - User: incidencias + facturas propias según scope backend.
   - Admin: incidencias + facturas + clientes + usuarios.
   - Calcular métricas en frontend desde listas/meta devueltas.
   - Normalizar respuesta para homeView.js.
   - Blindar cache admin cuando el rol actual sea user.
   - No tocar DOM.
   - No CSS.
   - No Router.
   - No Storage.
   - No fetch propio.
   - No eventos.
   - No apiClient paralelo.
   - No /api/dashboard.
   - No endpoints /stats inexistentes.
   - No /home.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as CoreHttpModule from "../../core/http.js";

import { homeState } from "./home.state.js";

import {
  getHomeDashboardStore,
} from "./home.store.js";

import {
  normalizeHomeDashboard,
  normalizeHomeWidgets,
  normalizeHomeTickets,
  normalizeHomeInvoices,
  normalizeHomeUsers,
  normalizeHomeClients,
  normalizeHomeActivityList,

  getHomeWidgetId,
  getHomeTicketId,
  getHomeInvoiceId,
  getHomeUserId,
  getHomeClientId,
} from "./home.model.js";

export const HOME_API_VERSION = "home.api.v3";

export const HOME_DASHBOARD_ENDPOINT = "local:home-list-aggregate";
export const HOME_DASHBOARD_LEGACY_ENDPOINT = "";
export const HOME_DASHBOARD_PING_ENDPOINT = "/api/health/ready";

export const HOME_TIMEOUT = 15000;
export const HOME_HEALTH_TIMEOUT = 8000;

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

const ENDPOINTS = Object.freeze({
  ticketsList: "/api/tickets",
  facturasList: "/api/facturas",
  clientesList: "/api/clientes",
  usersList: "/api/users",

  healthReady: "/api/health/ready",
});

const DEFAULT_LIST_PARAMS = Object.freeze({
  limit: 8,
  includeTotal: true,
  sortBy: "updatedAt",
  sortDir: "DESC",
});

const ADMIN_ACTIVITY_TYPES = new Set([
  "client",
  "cliente",
  "customer",
  "user",
  "usuario",
  "member",
]);

let loadSeq = 0;

const runtime = {
  loading: false,
  refreshing: false,

  lastRequestAt: "",
  lastResponseAt: "",
  lastLoadedAt: "",

  lastRequestId: "",
  lastError: null,

  modules: {
    tickets: null,
    facturas: null,
    clientes: null,
    users: null,
    health: null,
  },
};

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeNumber(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    let clean = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    if (!clean || clean === "-" || clean === "+") return fallback;

    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");

    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");

      clean =
        lastComma > lastDot
          ? clean.replace(/\./g, "").replace(/,/g, ".")
          : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean = clean.replace(/,/g, ".");
    }

    const number = Number(clean);
    return Number.isFinite(number) ? number : fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
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

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function uniqueBy(items = [], picker = (item) => item) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const raw = safeText(picker(item), "");
    const key = raw ? normalizeKey(raw) : "";

    if (!key) {
      output.push(item);
      continue;
    }

    if (seen.has(key)) continue;

    seen.add(key);
    output.push(item);
  }

  return output;
}

function clone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

/* =========================================================
   AUTH / ROLE
========================================================= */

function getAuth() {
  try {
    return (
      AppCore?.Auth ||
      AppCore?.auth ||
      AppCore?.modules?.get?.("Auth") ||
      AppCore?.modules?.get?.("auth") ||
      null
    );
  } catch {
    return null;
  }
}

function getCurrentUser() {
  const Auth = getAuth();
  const state = safeObject(AppCore?.state);

  return safeObject(
    first(
      Auth?.getCurrentUser?.(),
      Auth?.getUser?.(),
      state.user,
      state.currentUser,
      state.authUser,
      state.sessionUser,
      state.session?.user,
      state.sessionData?.user,
      {}
    )
  );
}

function getCurrentRole() {
  const Auth = getAuth();
  const state = safeObject(AppCore?.state);
  const user = getCurrentUser();

  return normalizeRole(
    first(
      Auth?.getRole?.(),
      Auth?.getCurrentRole?.(),
      state.role,
      state.rol,
      state.userRole,
      user.role,
      user.rol,
      "user"
    )
  );
}

function isAdmin() {
  return getCurrentRole() === "admin";
}

function canRequestUsersModule(options = {}) {
  if (typeof options.includeUsers === "boolean") {
    return options.includeUsers === true && isAdmin();
  }

  return isAdmin();
}

function canRequestClientsModule(options = {}) {
  if (typeof options.includeClientes === "boolean") {
    return options.includeClientes === true && isAdmin();
  }

  if (typeof options.includeClients === "boolean") {
    return options.includeClients === true && isAdmin();
  }

  return isAdmin();
}

/* =========================================================
   ROLE SANITIZE
========================================================= */

function isAdminOnlyActivity(item = {}) {
  const key = normalizeKey(first(item.type, item.kind, item.category, ""));
  return ADMIN_ACTIVITY_TYPES.has(key);
}

function filterActivityForRole(items = [], admin = false) {
  const rows = safeArray(items);
  return admin ? rows : rows.filter((item) => !isAdminOnlyActivity(item));
}

function isAdminOnlyWidget(item = {}) {
  const raw = safeObject(item);

  const key = normalizeKey(
    [
      raw.widgetId,
      raw.widgetKey,
      raw.id,
      raw.key,
      raw.slug,
      raw.code,
      raw.type,
      raw.kind,
      raw.variant,
      raw.category,
      raw.title,
      raw.name,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return ["users", "usuarios", "clientes", "clients", "customers"].some((blocked) =>
    key.includes(blocked)
  );
}

function filterWidgetsForRole(items = [], admin = false) {
  const rows = safeArray(items);
  return admin ? rows : rows.filter((item) => !isAdminOnlyWidget(item));
}

function sanitizeSummaryForRole(summary = {}, admin = false) {
  const output = {
    ...safeObject(summary),
  };

  if (!admin) {
    output.usersCount = 0;
    output.usuariosCount = 0;
    output.totalUsers = 0;
    output.totalUsuarios = 0;
    output.usersTotal = 0;
    output.usuariosTotal = 0;
    output.visibleUsersCount = 0;
    output.visibleUsuariosCount = 0;

    output.clientsCount = 0;
    output.clientesCount = 0;
    output.customersCount = 0;
    output.totalClients = 0;
    output.totalClientes = 0;
    output.totalCustomers = 0;
    output.clientsTotal = 0;
    output.clientesTotal = 0;
    output.customersTotal = 0;
    output.visibleClientsCount = 0;
    output.visibleClientesCount = 0;
    output.visibleCustomersCount = 0;
  }

  return output;
}

function sanitizeDashboardForRole(dashboard = {}, role = getCurrentRole()) {
  const cleanRole = normalizeRole(role);
  const admin = cleanRole === "admin";

  const normalized = normalizeHomeDashboard({
    ...safeObject(dashboard),

    role: cleanRole,
    admin,

    users: admin ? dashboard?.users : [],
    usuarios: admin ? dashboard?.usuarios : [],

    clients: admin ? dashboard?.clients : [],
    clientes: admin ? dashboard?.clientes : [],
    customers: admin ? dashboard?.customers : [],

    meta: {
      ...safeObject(dashboard?.meta),
      role: cleanRole,
      admin,
    },
  });

  const summary = sanitizeSummaryForRole(normalized.summary, admin);
  const widgets = filterWidgetsForRole(normalized.widgets, admin);
  const activity = filterActivityForRole(normalized.activity, admin);

  return {
    ...normalized,

    role: cleanRole,
    admin,

    summary,
    stats: summary,
    metrics: summary,
    totals: summary,
    counts: summary,

    widgets,
    cards: widgets,
    kpis: widgets,
    blocks: widgets,

    users: admin ? safeArray(normalized.users) : [],
    usuarios: admin ? safeArray(normalized.usuarios) : [],

    clients: admin ? safeArray(normalized.clients) : [],
    clientes: admin ? safeArray(normalized.clientes) : [],
    customers: admin ? safeArray(normalized.customers) : [],

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,

    usersTotal: admin ? summary.usersCount : 0,
    usuariosTotal: admin ? summary.usuariosCount : 0,
    totalUsers: admin ? summary.usersCount : 0,
    totalUsuarios: admin ? summary.usuariosCount : 0,
    usersCount: admin ? summary.usersCount : 0,
    usuariosCount: admin ? summary.usuariosCount : 0,
    visibleUsersCount: admin ? safeArray(normalized.users).length : 0,
    visibleUsuariosCount: admin ? safeArray(normalized.users).length : 0,

    clientsTotal: admin ? summary.clientsCount : 0,
    clientesTotal: admin ? summary.clientesCount : 0,
    customersTotal: admin ? summary.customersCount : 0,
    totalClients: admin ? summary.clientsCount : 0,
    totalClientes: admin ? summary.clientesCount : 0,
    totalCustomers: admin ? summary.customersCount : 0,
    clientsCount: admin ? summary.clientsCount : 0,
    clientesCount: admin ? summary.clientesCount : 0,
    customersCount: admin ? summary.customersCount : 0,
    visibleClientsCount: admin ? safeArray(normalized.clients).length : 0,
    visibleClientesCount: admin ? safeArray(normalized.clients).length : 0,
    visibleCustomersCount: admin ? safeArray(normalized.clients).length : 0,

    activityCount: activity.length,
    recentCount: activity.length,
    visibleActivityCount: activity.length,

    meta: {
      ...safeObject(normalized.meta),

      role: cleanRole,
      admin,

      usersCount: admin ? summary.usersCount : 0,
      usuariosCount: admin ? summary.usuariosCount : 0,
      visibleUsersCount: admin ? safeArray(normalized.users).length : 0,
      visibleUsuariosCount: admin ? safeArray(normalized.users).length : 0,

      clientsCount: admin ? summary.clientsCount : 0,
      clientesCount: admin ? summary.clientesCount : 0,
      customersCount: admin ? summary.customersCount : 0,
      visibleClientsCount: admin ? safeArray(normalized.clients).length : 0,
      visibleClientesCount: admin ? safeArray(normalized.clients).length : 0,
      visibleCustomersCount: admin ? safeArray(normalized.clients).length : 0,

      activityCount: activity.length,
      recentCount: activity.length,
    },
  };
}

/* =========================================================
   REQUEST
========================================================= */

function nextLoadSeq() {
  loadSeq += 1;
  return loadSeq;
}

function isActiveLoadSeq(seq = 0) {
  return seq === loadSeq;
}

function mergeParams(...sources) {
  const output = {};

  for (const source of sources) {
    const object = safeObject(source, null);

    if (!object) continue;

    for (const [key, value] of Object.entries(object)) {
      if (value === undefined || value === null || value === "") continue;
      output[key] = value;
    }
  }

  return output;
}

async function requestGet(endpoint = "", options = {}) {
  const path = safeText(endpoint, "");

  if (!path) {
    throw new Error("HOME_API_ENDPOINT_MISSING");
  }

  const requestOptions = {
    auth: true,
    public: false,
    skipAuth: false,
    cache: "no-store",
    timeout: safeNumber(options.timeout, HOME_TIMEOUT),
    params: options.params || options.query || undefined,
    query: options.query || options.params || undefined,
  };

  if (isFunction(CoreHttp?.get)) {
    return CoreHttp.get(path, requestOptions);
  }

  if (isFunction(CoreHttp?.request)) {
    return CoreHttp.request(path, {
      ...requestOptions,
      method: "GET",
    });
  }

  throw new Error("HOME_HTTP_UNAVAILABLE");
}

function getErrorStatus(error = null) {
  return safeNumber(
    first(
      error?.status,
      error?.statusCode,
      error?.response?.status,
      error?.response?.statusCode,
      error?.data?.status,
      error?.data?.statusCode
    ),
    0
  );
}

function getErrorCode(error = null) {
  return safeText(
    first(
      error?.code,
      error?.errorCode,
      error?.response?.data?.code,
      error?.response?.data?.error,
      error?.data?.code,
      error?.data?.error,
      error?.error
    ),
    ""
  );
}

function normalizeErrorMessage(error = null, fallback = "No se pudo cargar el Home.") {
  const status = getErrorStatus(error);
  const code = normalizeKey(getErrorCode(error));

  if (status === 401 || code === "unauthorized") {
    return "No autorizado. Inicia sesión de nuevo.";
  }

  if (status === 403 || code === "forbidden") {
    return "No tienes permisos para consultar este módulo.";
  }

  if (status === 404 || code === "not_found") {
    return "El módulo solicitado no está disponible.";
  }

  if (status >= 500) {
    return "El backend devolvió un error interno.";
  }

  return safeText(
    first(
      error?.response?.data?.message,
      error?.data?.message,
      error?.message,
      fallback
    ),
    fallback
  );
}

function normalizeRequestError(error = null) {
  return {
    status: getErrorStatus(error),
    code: safeText(getErrorCode(error), ""),
    message: normalizeErrorMessage(error),
  };
}

function isSoftModuleError(error = null) {
  const status = getErrorStatus(error);

  return status === 403 || status === 404;
}

async function requestOptional(name = "", endpoint = "", options = {}) {
  const startedAt = Date.now();

  if (!endpoint) {
    return skippedResult(name, "HOME_MODULE_SKIPPED");
  }

  try {
    const data = await requestGet(endpoint, options);

    return {
      ok: true,
      skipped: false,
      name,
      endpoint,
      status: 200,
      durationMs: Date.now() - startedAt,
      data,
      error: null,
      soft: false,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      name,
      endpoint,
      status: getErrorStatus(error),
      durationMs: Date.now() - startedAt,
      data: null,
      error: normalizeRequestError(error),
      soft: isSoftModuleError(error),
    };
  }
}

function skippedResult(name = "", code = "HOME_MODULE_SKIPPED") {
  return {
    ok: false,
    skipped: true,
    name,
    endpoint: "",
    status: 0,
    durationMs: 0,
    data: null,
    error: {
      status: 0,
      code,
      message: "Módulo omitido para esta vista Home.",
    },
    soft: true,
  };
}

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function unwrapResponse(payload = null, depth = 0) {
  if (payload === null || payload === undefined) return null;
  if (depth > 8) return payload;
  if (Array.isArray(payload)) return payload;

  const object = safeObject(payload, null);

  if (!object) return payload;

  if (
    "dashboard" in object ||
    "summary" in object ||
    "stats" in object ||
    "metrics" in object ||
    "totals" in object ||
    "counts" in object ||
    "items" in object ||
    "rows" in object ||
    "records" in object ||
    "results" in object ||
    Array.isArray(object.data)
  ) {
    return object;
  }

  const nested = first(
    object.data,
    object.payload,
    object.result,
    object.response,
    object.body
  );

  if (nested !== null && nested !== undefined) {
    return unwrapResponse(nested, depth + 1);
  }

  return object;
}

function getPath(object = {}, path = "") {
  const root = safeObject(object, null);
  const cleanPath = safeText(path, "");

  if (!root || !cleanPath) return undefined;

  return cleanPath.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc?.[key];
  }, root);
}

function pickMax(keys = [], sources = [], fallback = 0) {
  const numbers = [];

  for (const source of safeArray(sources)) {
    const object = safeObject(source, null);

    if (!object) continue;

    for (const key of safeArray(keys)) {
      const cleanKey = safeText(key, "");

      if (!cleanKey) continue;

      const raw = cleanKey.includes(".")
        ? getPath(object, cleanKey)
        : object?.[cleanKey];

      const number = safeNumber(raw, NaN);

      if (Number.isFinite(number)) {
        numbers.push(number);
      }
    }
  }

  return numbers.length ? Math.max(...numbers, fallback) : fallback;
}

function extractTotal(payload = null, aliases = [], fallback = 0) {
  const object = safeObject(unwrapResponse(payload), {});

  return pickMax(
    [
      "total",
      "count",
      "totalCount",
      "remoteCount",
      "documentsCounted",

      "meta.total",
      "meta.count",
      "meta.totalCount",
      "meta.remoteCount",

      "pagination.total",
      "pagination.count",
      "pagination.totalCount",

      ...safeArray(aliases).flatMap((alias) => [
        `${alias}Total`,
        `${alias}Count`,
      ]),
    ],
    [object],
    fallback
  );
}

function extractCollection(payload = null, aliases = []) {
  const unwrapped = unwrapResponse(payload);

  if (Array.isArray(unwrapped)) {
    return {
      items: unwrapped,
      total: unwrapped.length,
      raw: payload,
    };
  }

  const object = safeObject(unwrapped, {});

  const sources = [
    object,
    object.data,
    object.payload,
    object.result,
    object.response,
    object.body,
    object.collections,
    object.resources,
    object.lists,
    object.data?.collections,
    object.payload?.collections,
    object.result?.collections,
  ].filter(hasOwnKeys);

  for (const source of sources) {
    for (const alias of aliases) {
      const value = source?.[alias];

      if (Array.isArray(value)) {
        return {
          items: value,
          total: Math.max(value.length, extractTotal(source, aliases, value.length)),
          raw: payload,
        };
      }

      if (hasOwnKeys(value)) {
        const nested = extractCollection(value, aliases);

        if (nested.items.length || nested.total > 0) {
          return nested;
        }
      }
    }

    const direct = first(
      source.items,
      source.rows,
      source.records,
      source.results,
      source.docs,
      source.documents,
      source.value,
      source.list
    );

    if (Array.isArray(direct)) {
      return {
        items: direct,
        total: Math.max(direct.length, extractTotal(source, aliases, direct.length)),
        raw: payload,
      };
    }
  }

  return {
    items: [],
    total: extractTotal(object, aliases, 0),
    raw: payload,
  };
}

/* =========================================================
   ITEM HELPERS
========================================================= */

function modelId(fn, item = {}) {
  try {
    return safeText(fn?.(item), "");
  } catch {
    return "";
  }
}

function getTicketId(item = {}) {
  return safeText(
    first(
      modelId(getHomeTicketId, item),
      item.ticketId,
      item.incidenciaId,
      item.code,
      item.numero,
      item.ticketCode,
      item.entityId,
      item.id,
      item._id,
      item.raw?.ticketId,
      item.raw?.incidenciaId,
      item.raw?.id
    ),
    ""
  );
}

function getInvoiceId(item = {}) {
  return safeText(
    first(
      modelId(getHomeInvoiceId, item),
      item.invoiceId,
      item.facturaId,
      item.numeroFacturaLegal,
      item.numeroFactura,
      item.invoiceNumber,
      item.number,
      item.numero,
      item.code,
      item.id,
      item._id,
      item.raw?.invoiceId,
      item.raw?.facturaId,
      item.raw?.id
    ),
    ""
  );
}

function getUserId(item = {}) {
  return safeText(
    first(
      modelId(getHomeUserId, item),
      item.userId,
      item.usuarioId,
      item.id,
      item._id,
      item.email,
      item.username,
      item.raw?.userId,
      item.raw?.id
    ),
    ""
  );
}

function getClientId(item = {}) {
  return safeText(
    first(
      modelId(getHomeClientId, item),
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item._id,
      item.email,
      item.raw?.clienteId,
      item.raw?.id
    ),
    ""
  );
}

function ticketStatusKey(item = {}) {
  const key = normalizeKey(
    first(
      item.status,
      item.estado,
      item.state,
      item.lifecycle?.status,
      item.raw?.status,
      item.raw?.estado,
      "pending"
    )
  );

  if (["open", "opened", "abierta", "abierto"].includes(key)) return "open";
  if (["progress", "in_progress", "inprogress", "en_proceso", "working", "assigned"].includes(key)) return "progress";
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";
  if (["closed", "cerrada", "cerrado", "cancelled", "archived"].includes(key)) return "closed";

  return "pending";
}

function ticketPriorityKey(item = {}) {
  const key = normalizeKey(
    first(
      item.priority,
      item.prioridad,
      item.severity,
      item.urgency,
      item.sla?.priority,
      item.raw?.priority,
      item.raw?.prioridad,
      "medium"
    )
  );

  if (["critical", "critica", "critico", "p0", "blocker"].includes(key)) return "critical";
  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) return "urgent";
  if (["low", "baja", "minor", "p3"].includes(key)) return "low";

  return "medium";
}

function invoiceStatusKey(item = {}) {
  const key = normalizeKey(
    first(
      item.paymentStatus,
      item.estadoPago,
      item.status,
      item.estado,
      item.raw?.paymentStatus,
      item.raw?.estadoPago,
      "pending"
    )
  );

  if (["paid", "pagada", "pagado", "cobrada"].includes(key)) return "paid";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";
  if (["partial", "parcial", "pago_parcial"].includes(key)) return "partial";
  if (["cancelled", "cancelada", "cancelado"].includes(key)) return "cancelled";
  if (["draft", "borrador"].includes(key)) return "draft";

  return "pending";
}

function invoiceAmount(item = {}) {
  return safeNumber(
    first(
      item.total,
      item.amount,
      item.importe,
      item.price,
      item.subtotal,
      item.base,
      item.totalFactura,
      item.importeTotal,
      item.facturaTotal,
      item.invoiceAmount,
      item.raw?.total,
      item.raw?.amount,
      item.raw?.importe,
      0
    ),
    0
  );
}

function attachmentsCount(item = {}) {
  const attachments = first(
    item.attachments,
    item.files,
    item.adjuntos,
    item.documents,
    item.raw?.attachments,
    item.raw?.files
  );

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(
    first(
      item.attachmentsCount,
      item.filesCount,
      item.adjuntosCount,
      item.documentsCount,
      item.raw?.attachmentsCount,
      item.raw?.filesCount,
      0
    ),
    0
  );
}

/* =========================================================
   MODULE NORMALIZATION FROM LISTS ONLY
========================================================= */

function normalizeTicketsModule(listPayload = null) {
  const collection = extractCollection(listPayload, ["tickets", "incidencias"]);

  const items = uniqueBy(
    normalizeHomeTickets(collection.items),
    getTicketId
  );

  const total = Math.max(items.length, collection.total);

  const openTickets = items.filter((item) =>
    ["pending", "open", "progress"].includes(ticketStatusKey(item))
  ).length;

  const closedTickets = items.filter((item) =>
    ["closed", "resolved"].includes(ticketStatusKey(item))
  ).length;

  const urgentTickets = items.filter((item) =>
    ["urgent", "critical"].includes(ticketPriorityKey(item))
  ).length;

  const filesCount = items.reduce((sum, item) => sum + attachmentsCount(item), 0);

  return {
    items,
    total,
    visibleCount: items.length,
    stats: {
      total,
      totalTickets: total,
      ticketsTotal: total,
      incidenciasTotal: total,
      totalIncidencias: total,
      ticketsCount: total,
      incidenciasCount: total,

      openTickets,
      pendingTickets: openTickets,
      openIncidencias: openTickets,
      pendingIncidencias: openTickets,

      closedTickets,
      resolvedTickets: closedTickets,
      closedIncidencias: closedTickets,
      resolvedIncidencias: closedTickets,

      urgentTickets,
      urgentIncidencias: urgentTickets,
      highPriorityTickets: urgentTickets,

      attachmentsCount: filesCount,
      filesCount,
      adjuntosCount: filesCount,
    },
  };
}

function normalizeFacturasModule(listPayload = null) {
  const collection = extractCollection(listPayload, ["facturas", "invoices"]);

  const items = uniqueBy(
    normalizeHomeInvoices(collection.items),
    getInvoiceId
  );

  const total = Math.max(items.length, collection.total);

  const pendingInvoices = items.filter((item) =>
    ["pending", "overdue", "partial"].includes(invoiceStatusKey(item))
  ).length;

  const invoiceTotal = items.reduce((sum, item) => sum + invoiceAmount(item), 0);

  return {
    items,
    total,
    visibleCount: items.length,
    stats: {
      total,
      totalInvoices: total,
      invoicesTotal: total,
      facturasTotal: total,
      totalFacturas: total,
      invoicesCount: total,
      facturasCount: total,

      pendingInvoices,
      pendingFacturas: pendingInvoices,
      facturasPendientes: pendingInvoices,
      invoicesPending: pendingInvoices,

      invoiceAmount: invoiceTotal,
      billingTotal: invoiceTotal,
      totalBilling: invoiceTotal,
      totalFacturado: invoiceTotal,
      importeFacturas: invoiceTotal,
      facturacionVisible: invoiceTotal,
    },
  };
}

function normalizeClientesModule(listPayload = null) {
  const collection = extractCollection(listPayload, ["clientes", "clients", "customers"]);

  const items = uniqueBy(
    normalizeHomeClients(collection.items),
    getClientId
  );

  const total = Math.max(items.length, collection.total);

  return {
    items,
    total,
    visibleCount: items.length,
    stats: {
      total,
      clientsCount: total,
      clientesCount: total,
      customersCount: total,
      totalClients: total,
      totalClientes: total,
      totalCustomers: total,
    },
  };
}

function normalizeUsersModule(listPayload = null) {
  const collection = extractCollection(listPayload, ["users", "usuarios", "members"]);

  const items = uniqueBy(
    normalizeHomeUsers(collection.items),
    getUserId
  );

  const total = Math.max(items.length, collection.total);

  return {
    items,
    total,
    visibleCount: items.length,
    stats: {
      total,
      usersCount: total,
      usuariosCount: total,
      totalUsers: total,
      totalUsuarios: total,
    },
  };
}

/* =========================================================
   DASHBOARD BUILD
========================================================= */

function buildSummaryFromModules({
  tickets,
  facturas,
  clientes,
  users,
  admin = false,
} = {}) {
  const ticketStats = safeObject(tickets?.stats);
  const facturaStats = safeObject(facturas?.stats);
  const clienteStats = safeObject(clientes?.stats);
  const userStats = safeObject(users?.stats);

  const totalTickets = Math.max(
    safeNumber(ticketStats.totalTickets, 0),
    safeNumber(tickets?.total, 0)
  );

  const openTickets = safeNumber(ticketStats.openTickets, 0);
  const closedTickets = safeNumber(ticketStats.closedTickets, 0);
  const urgentTickets = safeNumber(ticketStats.urgentTickets, 0);

  const totalInvoices = Math.max(
    safeNumber(facturaStats.totalInvoices, 0),
    safeNumber(facturas?.total, 0)
  );

  const pendingInvoices = safeNumber(facturaStats.pendingInvoices, 0);
  const amount = safeNumber(facturaStats.invoiceAmount, 0);

  const clientsCount = admin
    ? Math.max(safeNumber(clienteStats.clientsCount, 0), safeNumber(clientes?.total, 0))
    : 0;

  const usersCount = admin
    ? Math.max(safeNumber(userStats.usersCount, 0), safeNumber(users?.total, 0))
    : 0;

  const filesCount = safeNumber(ticketStats.attachmentsCount, 0);

  return sanitizeSummaryForRole(
    {
      totalTickets,
      ticketsTotal: totalTickets,
      incidenciasTotal: totalTickets,
      totalIncidencias: totalTickets,
      ticketsCount: totalTickets,
      incidenciasCount: totalTickets,

      openTickets,
      pendingTickets: openTickets,
      openIncidencias: openTickets,
      pendingIncidencias: openTickets,
      incidenciasAbiertas: openTickets,

      closedTickets,
      resolvedTickets: closedTickets,
      closedIncidencias: closedTickets,
      resolvedIncidencias: closedTickets,
      incidenciasCerradas: closedTickets,

      urgentTickets,
      urgentIncidencias: urgentTickets,
      highPriorityTickets: urgentTickets,

      totalInvoices,
      invoicesTotal: totalInvoices,
      facturasTotal: totalInvoices,
      totalFacturas: totalInvoices,
      invoicesCount: totalInvoices,
      facturasCount: totalInvoices,

      pendingInvoices,
      pendingFacturas: pendingInvoices,
      facturasPendientes: pendingInvoices,
      invoicesPending: pendingInvoices,

      invoiceAmount: amount,
      billingTotal: amount,
      totalBilling: amount,
      totalFacturado: amount,
      importeFacturas: amount,
      facturacionVisible: amount,

      clientsCount,
      clientesCount: clientsCount,
      customersCount: clientsCount,
      totalClients: clientsCount,
      totalClientes: clientsCount,
      totalCustomers: clientsCount,

      usersCount,
      usuariosCount: usersCount,
      totalUsers: usersCount,
      totalUsuarios: usersCount,

      visibleTickets: safeNumber(tickets?.visibleCount, 0),
      visibleTicketsCount: safeNumber(tickets?.visibleCount, 0),
      visibleIncidenciasCount: safeNumber(tickets?.visibleCount, 0),

      visibleInvoices: safeNumber(facturas?.visibleCount, 0),
      visibleInvoicesCount: safeNumber(facturas?.visibleCount, 0),
      visibleFacturasCount: safeNumber(facturas?.visibleCount, 0),

      visibleClients: admin ? safeNumber(clientes?.visibleCount, 0) : 0,
      visibleClientsCount: admin ? safeNumber(clientes?.visibleCount, 0) : 0,
      visibleClientesCount: admin ? safeNumber(clientes?.visibleCount, 0) : 0,

      visibleUsers: admin ? safeNumber(users?.visibleCount, 0) : 0,
      visibleUsersCount: admin ? safeNumber(users?.visibleCount, 0) : 0,
      visibleUsuariosCount: admin ? safeNumber(users?.visibleCount, 0) : 0,

      attachmentsCount: filesCount,
      filesCount,
      adjuntosCount: filesCount,

      updatedAt: nowIso(),
    },
    admin
  );
}

function buildWidgets(summary = {}, admin = false) {
  if (admin) {
    return normalizeHomeWidgets([
      {
        id: "incidencias",
        widgetId: "incidencias",
        key: "incidencias",
        title: "Incidencias",
        description: "Tickets visibles en el panel.",
        value: safeNumber(summary.totalTickets, 0),
        subtitle: `${safeNumber(summary.openTickets, 0)} abiertas · ${safeNumber(summary.urgentTickets, 0)} urgentes`,
        type: "tickets",
        kind: "metric",
        status: safeNumber(summary.urgentTickets, 0) > 0 ? "warning" : "active",
        route: "/incidencias",
        href: "/incidencias",
      },
      {
        id: "facturacion",
        widgetId: "facturacion",
        key: "facturacion",
        title: "Facturación",
        description: "Facturas visibles y volumen agregado.",
        value: safeNumber(summary.invoiceAmount, 0),
        subtitle: `${safeNumber(summary.totalInvoices, 0)} facturas · ${safeNumber(summary.pendingInvoices, 0)} pendientes`,
        type: "invoices",
        kind: "metric",
        status: safeNumber(summary.pendingInvoices, 0) > 0 ? "warning" : "active",
        route: "/facturas",
        href: "/facturas",
      },
      {
        id: "clientes",
        widgetId: "clientes",
        key: "clientes",
        title: "Clientes",
        description: "Clientes visibles.",
        value: safeNumber(summary.clientsCount, 0),
        subtitle: `${safeNumber(summary.visibleClientsCount, 0)} visibles`,
        type: "clients",
        kind: "metric",
        status: "active",
        route: "/clientes",
        href: "/clientes",
      },
      {
        id: "usuarios",
        widgetId: "usuarios",
        key: "usuarios",
        title: "Usuarios",
        description: "Usuarios del sistema.",
        value: safeNumber(summary.usersCount, 0),
        subtitle: `${safeNumber(summary.visibleUsersCount, 0)} visibles`,
        type: "users",
        kind: "metric",
        status: "active",
        route: "/usuarios",
        href: "/usuarios",
      },
    ]);
  }

  return normalizeHomeWidgets([
    {
      id: "mis-incidencias",
      widgetId: "mis-incidencias",
      key: "mis-incidencias",
      title: "Mis incidencias",
      description: "Tus solicitudes visibles.",
      value: safeNumber(summary.totalTickets, 0),
      subtitle: `${safeNumber(summary.openTickets, 0)} abiertas · ${safeNumber(summary.urgentTickets, 0)} urgentes`,
      type: "tickets",
      kind: "metric",
      status: safeNumber(summary.urgentTickets, 0) > 0 ? "warning" : "active",
      route: "/incidencias",
      href: "/incidencias",
    },
    {
      id: "mis-facturas",
      widgetId: "mis-facturas",
      key: "mis-facturas",
      title: "Mis facturas",
      description: "Facturación visible para tu cuenta.",
      value: safeNumber(summary.totalInvoices, 0),
      subtitle: `${safeNumber(summary.pendingInvoices, 0)} pendientes`,
      type: "invoices",
      kind: "metric",
      status: safeNumber(summary.pendingInvoices, 0) > 0 ? "warning" : "active",
      route: "/facturas",
      href: "/facturas",
    },
    {
      id: "adjuntos",
      widgetId: "adjuntos",
      key: "adjuntos",
      title: "Adjuntos",
      description: "Documentos vinculados a tus incidencias.",
      value: safeNumber(summary.attachmentsCount, 0),
      subtitle: "Archivos visibles",
      type: "files",
      kind: "metric",
      status: "active",
      route: "/incidencias",
      href: "/incidencias",
    },
  ]);
}

function buildActivity({
  tickets = [],
  invoices = [],
  clients = [],
  users = [],
  admin = false,
} = {}) {
  const activity = [];

  for (const ticket of safeArray(tickets).slice(0, 8)) {
    const id = getTicketId(ticket);

    activity.push({
      type: "ticket",
      title: safeText(first(ticket.subject, ticket.title, ticket.asunto), "Incidencia"),
      text: id ? `Incidencia ${id}` : "Incidencia actualizada.",
      date: first(ticket.updatedAt, ticket.lastUpdateAt, ticket.createdAt),
      route: "/incidencias",
      action: "open-ticket",
      entityId: id,
    });
  }

  for (const invoice of safeArray(invoices).slice(0, 4)) {
    const id = getInvoiceId(invoice);

    activity.push({
      type: "invoice",
      title: id ? `Factura ${id}` : "Factura",
      text: "Factura registrada o actualizada.",
      date: first(invoice.updatedAt, invoice.createdAt, invoice.date),
      route: "/facturas",
      action: "navigate-home",
      entityId: id,
    });
  }

  if (admin) {
    for (const client of safeArray(clients).slice(0, 3)) {
      const id = getClientId(client);

      activity.push({
        type: "client",
        title: safeText(first(client.name, client.nombre, client.razonSocial, client.email), "Cliente"),
        text: "Cliente disponible en el panel.",
        date: first(client.updatedAt, client.createdAt),
        route: "/clientes",
        action: "navigate-home",
        entityId: id,
      });
    }

    for (const user of safeArray(users).slice(0, 3)) {
      const id = getUserId(user);

      activity.push({
        type: "user",
        title: safeText(first(user.displayName, user.name, user.username, user.email), "Usuario"),
        text: "Usuario disponible en el sistema.",
        date: first(user.updatedAt, user.createdAt, user.lastLoginAt),
        route: "/usuarios",
        action: "navigate-home",
        entityId: id,
      });
    }
  }

  return filterActivityForRole(
    normalizeHomeActivityList(activity)
      .filter((item) => item.title || item.text)
      .sort((a, b) => {
        const left = new Date(first(a.date, a.updatedAt, a.createdAt, 0)).getTime();
        const right = new Date(first(b.date, b.updatedAt, b.createdAt, 0)).getTime();

        return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
      })
      .slice(0, 8),
    admin
  );
}

function moduleErrors(modules = {}) {
  const errors = [];

  for (const [name, result] of Object.entries(safeObject(modules))) {
    if (!result || result.skipped === true || result.ok === true) continue;

    errors.push({
      module: name,
      kind: "list",
      status: result.status || 0,
      code: result.error?.code || "",
      message: result.error?.message || "Módulo no disponible.",
      soft: Boolean(result.soft),
    });
  }

  return errors;
}

function buildDashboardFromModules(modules = {}, meta = {}) {
  const role = getCurrentRole();
  const admin = role === "admin";

  const tickets = normalizeTicketsModule(modules.tickets?.data);
  const facturas = normalizeFacturasModule(modules.facturas?.data);

  const clientes = admin
    ? normalizeClientesModule(modules.clientes?.data)
    : normalizeClientesModule(null);

  const users = admin
    ? normalizeUsersModule(modules.users?.data)
    : normalizeUsersModule(null);

  const summary = buildSummaryFromModules({
    tickets,
    facturas,
    clientes,
    users,
    admin,
  });

  const widgets = filterWidgetsForRole(buildWidgets(summary, admin), admin);

  const activity = buildActivity({
    tickets: tickets.items,
    invoices: facturas.items,
    clients: admin ? clientes.items : [],
    users: admin ? users.items : [],
    admin,
  });

  const errors = moduleErrors(modules);
  const updatedAt = nowIso();
  const requestId = safeText(meta.requestId, "");

  return sanitizeDashboardForRole(
    {
      ok: true,
      success: true,

      source: admin ? "home-admin-list-aggregate" : "home-user-list-aggregate",
      version: HOME_API_VERSION,

      role,
      admin,

      summary,
      stats: summary,
      metrics: summary,
      totals: summary,
      counts: summary,

      widgets,
      cards: widgets,
      kpis: widgets,
      blocks: widgets,

      tickets: tickets.items,
      incidencias: tickets.items,

      ticketsTotal: summary.totalTickets,
      incidenciasTotal: summary.totalTickets,
      totalTickets: summary.totalTickets,
      totalIncidencias: summary.totalTickets,
      ticketsCount: summary.totalTickets,
      incidenciasCount: summary.totalTickets,
      visibleTicketsCount: summary.visibleTicketsCount,
      visibleIncidenciasCount: summary.visibleIncidenciasCount,

      invoices: facturas.items,
      facturas: facturas.items,

      invoicesTotal: summary.totalInvoices,
      facturasTotal: summary.totalInvoices,
      totalInvoices: summary.totalInvoices,
      totalFacturas: summary.totalInvoices,
      invoicesCount: summary.totalInvoices,
      facturasCount: summary.totalInvoices,
      visibleInvoicesCount: summary.visibleInvoicesCount,
      visibleFacturasCount: summary.visibleFacturasCount,

      clients: admin ? clientes.items : [],
      clientes: admin ? clientes.items : [],
      customers: admin ? clientes.items : [],

      users: admin ? users.items : [],
      usuarios: admin ? users.items : [],

      activity,
      activities: activity,
      recent: activity,
      recentActivity: activity,

      modules: {
        tickets: {
          listOk: modules.tickets?.ok === true,
          endpoint: ENDPOINTS.ticketsList,
        },
        facturas: {
          listOk: modules.facturas?.ok === true,
          endpoint: ENDPOINTS.facturasList,
        },
        clientes: {
          skipped: modules.clientes?.skipped === true,
          listOk: modules.clientes?.ok === true,
          endpoint: admin ? ENDPOINTS.clientesList : "",
        },
        users: {
          skipped: modules.users?.skipped === true,
          listOk: modules.users?.ok === true,
          endpoint: admin ? ENDPOINTS.usersList : "",
        },
      },

      partial: errors.length > 0,
      errors,

      requestId,
      updatedAt,
      generatedAt: updatedAt,

      meta: {
        requestId,
        role,
        admin,

        updatedAt,
        generatedAt: updatedAt,

        usersModuleRequested: admin,
        clientesModuleRequested: admin,

        widgetsCount: widgets.length,

        ticketsCount: summary.totalTickets,
        incidenciasCount: summary.totalTickets,
        visibleTicketsCount: summary.visibleTicketsCount,
        visibleIncidenciasCount: summary.visibleIncidenciasCount,

        invoicesCount: summary.totalInvoices,
        facturasCount: summary.totalInvoices,
        visibleInvoicesCount: summary.visibleInvoicesCount,
        visibleFacturasCount: summary.visibleFacturasCount,

        clientsCount: admin ? summary.clientsCount : 0,
        clientesCount: admin ? summary.clientesCount : 0,
        visibleClientsCount: admin ? summary.visibleClientsCount : 0,
        visibleClientesCount: admin ? summary.visibleClientesCount : 0,

        usersCount: admin ? summary.usersCount : 0,
        usuariosCount: admin ? summary.usuariosCount : 0,
        visibleUsersCount: admin ? summary.visibleUsersCount : 0,
        visibleUsuariosCount: admin ? summary.visibleUsuariosCount : 0,

        activityCount: activity.length,
        errorsCount: errors.length,
        partial: errors.length > 0,
      },

      raw: {
        modules,
        meta,
      },
    },
    role
  );
}

/* =========================================================
   PUBLIC NORMALIZATION
========================================================= */

export function normalizeDashboard(payload = null, options = {}) {
  const role = normalizeRole(options.role || getCurrentRole());
  const unwrapped = unwrapResponse(payload);
  const object = safeObject(unwrapped, {});

  if (object.modules) {
    return sanitizeDashboardForRole(buildDashboardFromModules(object.modules, object.meta || object), role);
  }

  if (object.dashboard?.modules) {
    return sanitizeDashboardForRole(buildDashboardFromModules(object.dashboard.modules, object.dashboard.meta || object), role);
  }

  if (object.dashboard && hasOwnKeys(object.dashboard)) {
    return sanitizeDashboardForRole(
      {
        ...normalizeDashboard(object.dashboard, { role }),
        raw: payload,
      },
      role
    );
  }

  try {
    return sanitizeDashboardForRole(normalizeHomeDashboard(object), role);
  } catch {
    return sanitizeDashboardForRole(object, role);
  }
}

export function normalizeHomeDashboardResponse(payload = null) {
  const dashboard = normalizeDashboard(payload);
  const admin = dashboard.role === "admin";

  return {
    ok: dashboard.ok !== false,
    dashboard,

    summary: dashboard.summary,
    stats: dashboard.summary,
    metrics: dashboard.summary,
    totals: dashboard.summary,
    counts: dashboard.summary,

    widgets: dashboard.widgets,
    cards: dashboard.widgets,
    kpis: dashboard.widgets,
    blocks: dashboard.widgets,

    tickets: dashboard.tickets,
    incidencias: dashboard.incidencias,

    invoices: dashboard.invoices,
    facturas: dashboard.facturas,

    clients: admin ? dashboard.clients : [],
    clientes: admin ? dashboard.clientes : [],
    customers: admin ? dashboard.customers : [],

    users: admin ? dashboard.users : [],
    usuarios: admin ? dashboard.usuarios : [],

    activity: dashboard.activity,
    activities: dashboard.activity,
    recent: dashboard.recent,
    recentActivity: dashboard.recentActivity,

    requestId: dashboard.requestId || dashboard.meta?.requestId || "",
    lastSyncAt: dashboard.updatedAt || dashboard.generatedAt || nowIso(),

    meta: dashboard.meta,
    raw: payload,
  };
}

export function resolveHomeWidgetFromDashboard(widgetId = "", dashboard = {}) {
  const id = normalizeKey(widgetId);

  if (!id) return null;

  const normalized = normalizeDashboard(dashboard);

  return (
    safeArray(normalized.widgets).find((widget) => {
      const keys = [
        modelId(getHomeWidgetId, widget),
        widget.widgetId,
        widget.widgetKey,
        widget.id,
        widget.key,
        widget.slug,
        widget.code,
        widget.title,
        widget.name,
      ]
        .map(normalizeKey)
        .filter(Boolean);

      return keys.includes(id);
    }) || null
  );
}

/* =========================================================
   DASHBOARD REQUEST
========================================================= */

function assertCoreModulesAvailable(modules = {}) {
  const tickets = modules.tickets;
  const facturas = modules.facturas;

  if (tickets?.ok === true || facturas?.ok === true) {
    return true;
  }

  const firstError = [tickets, facturas].find((item) => item && item.skipped !== true && item.error) || null;

  const error = new Error(firstError?.error?.message || "No se pudo cargar tickets ni facturas para Home.");
  error.status = firstError?.status || 0;
  error.code = firstError?.error?.code || "HOME_CORE_MODULES_UNAVAILABLE";
  error.modules = modules;

  throw error;
}

export async function fetchHomeDashboardRequest({
  includeUsers = undefined,
  includeClientes = undefined,
  includeClients = undefined,
  params = null,
  timeout = HOME_TIMEOUT,
} = {}) {
  const requestId = `home_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const admin = isAdmin();

  const includeUsersModule = canRequestUsersModule({
    includeUsers,
  });

  const includeClientesModule = canRequestClientsModule({
    includeClientes,
    includeClients,
  });

  const listParams = mergeParams(DEFAULT_LIST_PARAMS, params);

  runtime.lastRequestAt = nowIso();

  const [
    ticketsList,
    facturasList,
    clientesList,
    usersList,
  ] = await Promise.all([
    requestOptional("tickets.list", ENDPOINTS.ticketsList, {
      timeout,
      params: listParams,
    }),

    requestOptional("facturas.list", ENDPOINTS.facturasList, {
      timeout,
      params: listParams,
    }),

    includeClientesModule
      ? requestOptional("clientes.list", ENDPOINTS.clientesList, {
          timeout,
          params: listParams,
        })
      : Promise.resolve(skippedResult("clientes.list", "CLIENTES_MODULE_SKIPPED_FOR_USER")),

    includeUsersModule
      ? requestOptional("users.list", ENDPOINTS.usersList, {
          timeout,
          params: listParams,
        })
      : Promise.resolve(skippedResult("users.list", "USERS_MODULE_SKIPPED_FOR_USER")),
  ]);

  const modules = {
    tickets: ticketsList,
    facturas: facturasList,
    clientes: clientesList,
    users: usersList,
  };

  assertCoreModulesAvailable(modules);

  const dashboard = buildDashboardFromModules(modules, {
    requestId,
  });

  runtime.lastResponseAt = nowIso();

  runtime.modules = {
    tickets: dashboard.modules.tickets,
    facturas: dashboard.modules.facturas,
    clientes: dashboard.modules.clientes,
    users: dashboard.modules.users,
  };

  return {
    ok: true,
    success: true,

    source: admin ? "home-admin-list-aggregate" : "home-user-list-aggregate",
    version: HOME_API_VERSION,

    requestId,
    generatedAt: nowIso(),

    dashboard,
    modules,

    meta: {
      requestId,
      role: getCurrentRole(),
      admin,
      includeUsers: includeUsersModule,
      includeClientes: includeClientesModule,
      partial: dashboard.partial,
      errorsCount: dashboard.errors.length,
    },
  };
}

export async function getHomeDashboardRequest(options = {}) {
  const response = await fetchHomeDashboardRequest(options);
  return normalizeDashboard(response);
}

export async function getHomeWidgetByIdRequest(widgetId = "", options = {}) {
  const id = safeText(widgetId, "");

  if (!id) return null;

  const dashboard = await getHomeDashboardRequest(options);

  return resolveHomeWidgetFromDashboard(id, dashboard);
}

/* =========================================================
   CACHE HYDRATION
   Memoria únicamente. No localStorage.
========================================================= */

function hydrateDashboardSource(source = {}) {
  const raw = safeObject(source);

  if (!hasOwnKeys(raw)) {
    return null;
  }

  const dashboard = normalizeDashboard(raw, {
    role: getCurrentRole(),
  });

  return {
    dashboard,

    summary: dashboard.summary,
    widgets: dashboard.widgets,

    tickets: dashboard.tickets,
    incidencias: dashboard.incidencias,

    invoices: dashboard.invoices,
    facturas: dashboard.facturas,

    clients: dashboard.admin ? dashboard.clients : [],
    clientes: dashboard.admin ? dashboard.clientes : [],
    customers: dashboard.admin ? dashboard.customers : [],

    users: dashboard.admin ? dashboard.users : [],
    usuarios: dashboard.admin ? dashboard.usuarios : [],

    activity: dashboard.activity,
    recent: dashboard.recent,
    recentActivity: dashboard.recentActivity,

    requestId: dashboard.requestId || dashboard.meta?.requestId || "",
    lastSyncAt: dashboard.updatedAt || dashboard.generatedAt || null,

    hydrated: true,
  };
}

export function hydrateHomeFromCache() {
  const fromStore = hydrateDashboardSource(getHomeDashboardStore?.());

  if (fromStore) return fromStore;

  const fromState = hydrateDashboardSource(homeState?.dashboard);

  if (fromState) return fromState;

  return {
    dashboard: {},
    summary: {},
    widgets: [],

    tickets: [],
    incidencias: [],

    invoices: [],
    facturas: [],

    clients: [],
    clientes: [],
    customers: [],

    users: [],
    usuarios: [],

    activity: [],
    recent: [],
    recentActivity: [],

    requestId: "",
    lastSyncAt: null,

    hydrated: false,
  };
}

/* =========================================================
   LOAD DASHBOARD
========================================================= */

export async function loadHomeDashboard({
  force = false,
  returnStaleOnError = true,
  includeUsers = undefined,
  includeClientes = undefined,
  includeClients = undefined,
  params = null,
} = {}) {
  const seq = nextLoadSeq();

  runtime.loading = true;
  runtime.refreshing = Boolean(force);

  try {
    const response = await fetchHomeDashboardRequest({
      includeUsers,
      includeClientes,
      includeClients,
      params,
    });

    const normalized = normalizeHomeDashboardResponse(response);
    const dashboard = normalized.dashboard;

    if (!isActiveLoadSeq(seq)) {
      const cached = hydrateHomeFromCache();
      return cached.dashboard || {};
    }

    runtime.lastLoadedAt = nowIso();
    runtime.lastRequestId = normalized.requestId || "";
    runtime.lastError = null;

    return dashboard;
  } catch (error) {
    runtime.lastError = {
      status: getErrorStatus(error),
      code: getErrorCode(error),
      message: normalizeErrorMessage(error),
    };

    if (returnStaleOnError) {
      const cached = hydrateHomeFromCache();

      if (cached.hydrated && hasOwnKeys(cached.dashboard)) {
        return normalizeDashboard(cached.dashboard);
      }
    }

    throw error;
  } finally {
    if (isActiveLoadSeq(seq)) {
      runtime.loading = false;
      runtime.refreshing = false;
    }
  }
}

export async function refreshHomeDashboard(options = {}) {
  return loadHomeDashboard({
    ...safeObject(options),
    force: true,
  });
}

/* =========================================================
   HEALTH
========================================================= */

export async function fetchHomeHealthRequest({
  timeout = HOME_HEALTH_TIMEOUT,
  params = null,
} = {}) {
  const result = await requestOptional("health.ready", ENDPOINTS.healthReady, {
    timeout,
    params,
  });

  runtime.modules.health = {
    ok: result.ok,
    status: result.status,
  };

  return result;
}

export async function loadHomeHealth({
  silent = true,
  params = null,
} = {}) {
  const result = await fetchHomeHealthRequest({
    params,
  });

  if (result.ok) {
    return unwrapResponse(result.data);
  }

  if (!silent) {
    const error = new Error(result.error?.message || "Health no disponible.");
    error.status = result.status || 0;
    error.code = result.error?.code || "HEALTH_UNAVAILABLE";
    throw error;
  }

  return null;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeApiClient() {
  return CoreHttp || null;
}

export function getHomeApiSnapshot() {
  const dashboard = normalizeDashboard(homeState?.dashboard || {});
  const admin = dashboard.role === "admin";

  return {
    version: HOME_API_VERSION,
    source: "views.home.api",

    endpoints: {
      dashboard: HOME_DASHBOARD_ENDPOINT,
      legacyDashboard: HOME_DASHBOARD_LEGACY_ENDPOINT,
      health: HOME_DASHBOARD_PING_ENDPOINT,

      ticketsList: ENDPOINTS.ticketsList,
      facturasList: ENDPOINTS.facturasList,
      clientesList: ENDPOINTS.clientesList,
      usersList: ENDPOINTS.usersList,
    },

    http: {
      hasCoreHttp: Boolean(CoreHttp),
      hasGet: isFunction(CoreHttp?.get),
      hasRequest: isFunction(CoreHttp?.request),
    },

    auth: {
      role: getCurrentRole(),
      admin: isAdmin(),
      usersModuleAllowed: canRequestUsersModule(),
      clientesModuleAllowed: canRequestClientsModule(),
    },

    runtime: clone(runtime, {}),

    loadSeq,

    dashboard: {
      hasDashboard: hasOwnKeys(dashboard),

      source: dashboard.source || null,
      role: dashboard.role || getCurrentRole(),
      admin,

      widgetsCount: safeArray(dashboard.widgets).length,

      ticketsCount: safeNumber(dashboard.summary?.totalTickets, 0),
      visibleTicketsCount: safeNumber(dashboard.visibleTicketsCount, 0),

      invoicesCount: safeNumber(dashboard.summary?.totalInvoices, 0),
      visibleInvoicesCount: safeNumber(dashboard.visibleInvoicesCount, 0),

      clientsCount: admin ? safeNumber(dashboard.summary?.clientsCount, 0) : 0,
      visibleClientsCount: admin ? safeNumber(dashboard.visibleClientsCount, 0) : 0,

      usersCount: admin ? safeNumber(dashboard.summary?.usersCount, 0) : 0,
      visibleUsersCount: admin ? safeNumber(dashboard.visibleUsersCount, 0) : 0,

      activityCount: safeArray(dashboard.activity).length,

      partial: Boolean(dashboard.partial),
      updatedAt: dashboard.updatedAt || null,
    },

    state: {
      loading: Boolean(homeState?.loading),
      refreshing: Boolean(homeState?.refreshing),
      loaded: Boolean(homeState?.loaded),
      hydrated: Boolean(homeState?.hydrated),

      requestId: safeText(homeState?.requestId, ""),
      lastSyncAt: homeState?.lastSyncAt || null,
      error: homeState?.error || null,
    },

    policy: {
      singleHttpLayer: true,
      noFetch: true,
      noStorage: true,
      noEvents: true,
      noRouter: true,
      noDashboardEndpoint: true,
      noStatsEndpoints: true,
      usersOnlyAdmin: true,
      clientesOnlyAdmin: true,
      distinctUserAdminHome: true,
      roleAwareCache: true,
      coreModulesRequired: true,
    },
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeApi = Object.freeze({
  version: HOME_API_VERSION,

  endpoints: Object.freeze({
    dashboard: HOME_DASHBOARD_ENDPOINT,
    legacyDashboard: HOME_DASHBOARD_LEGACY_ENDPOINT,
    health: HOME_DASHBOARD_PING_ENDPOINT,

    ticketsList: ENDPOINTS.ticketsList,
    facturasList: ENDPOINTS.facturasList,
    clientesList: ENDPOINTS.clientesList,
    usersList: ENDPOINTS.usersList,
  }),

  timeout: HOME_TIMEOUT,

  getHomeApiClient,

  normalizeDashboard,
  normalizeHomeDashboardResponse,
  resolveHomeWidgetFromDashboard,

  fetchHomeDashboardRequest,
  fetchHomeHealthRequest,

  getHomeDashboardRequest,
  getHomeWidgetByIdRequest,

  hydrateHomeFromCache,

  loadHomeDashboard,
  refreshHomeDashboard,

  loadHomeHealth,

  getHomeApiSnapshot,
});

export default HomeApi;
