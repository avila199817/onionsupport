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
   - Proyectar respuestas grandes a DTOs ligeros para Home.
   - Vista Home distinta para admin y user.
   - User: incidencias + facturas propias según scope backend.
   - Admin: incidencias + facturas + clientes + usuarios.
   - Calcular métricas desde listas/meta devueltas.
   - Normalizar respuesta para homeView.js.
   - Blindar cache admin cuando el rol actual sea user.
   - Rutas/admin-routes/bloqueos delegados en core/config.js.
   - No conservar raw backend sensible en dashboard/cache.
   - No tocar DOM.
   - No CSS.
   - No Router.
   - No Storage persistente.
   - No fetch propio.
   - No eventos.
   - No apiClient paralelo.
   - No /api/dashboard.
   - No endpoints /stats inexistentes.
   - No /home.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as CoreHttpModule from "../../core/http.js";

import {
  ROUTES,
  isAdminRoute as configIsAdminRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import { homeState } from "./home.state.js";

import {
  getHomeDashboardStore,
} from "./home.store.js";

import {
  normalizeHomeDashboard,
  normalizeHomeWidgets,
  normalizeHomeActivityList,

  getHomeWidgetId,
  getHomeTicketId,
  getHomeInvoiceId,
  getHomeUserId,
  getHomeClientId,
} from "./home.model.js";

export const HOME_API_VERSION = "home.api.v11";

export const HOME_DASHBOARD_ENDPOINT = "local:home-list-aggregate";
export const HOME_DASHBOARD_LEGACY_ENDPOINT = "";

export const HOME_TIMEOUT = 15000;

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
});

const DEFAULT_LIST_PARAMS = Object.freeze({
  limit: 24,
  includeTotal: true,
  sortBy: "updatedAt",
  sortDir: "DESC",
});

const HOME_MAX_ITEMS = 24;
const HOME_ACTIVITY_LIMIT = 5;
const HOME_TEXT_LIMIT = 180;
const HOME_TITLE_LIMIT = 120;

const RAW_KEYS = new Set([
  "raw",
  "data",
  "payload",
  "response",
  "body",
]);

const COSMOS_META_KEYS = new Set([
  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
  "_id",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|otp|totp|mfa|2fa|backupCode|backup_code|sessionId|session_id|email|correo|phone|telefono|teléfono|address|direccion|dirección|nif|dni|iban|cuenta|bank|account|ipRaw|ip|userAgent/i;

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i;

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;

const ADMIN_ACTIVITY_TYPES = new Set([
  "client",
  "cliente",
  "customer",
  "user",
  "usuario",
  "member",
]);

const ADMIN_ENTITY_RE =
  /(^|[\s._/-])(clientes?|clients?|customers?|usuarios?|users?|members?|directorio|directory)([\s._/-]|$)/i;

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

function compactText(value = "", fallback = "", max = HOME_TEXT_LIMIT) {
  const text = safeText(value, fallback);

  if (!text) return fallback;
  if (text.length <= max) return text;

  return `${text.slice(0, max).trim()}…`;
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

function getPath(object = {}, path = "") {
  const root = safeObject(object, null);
  const cleanPath = safeText(path, "");

  if (!root || !cleanPath) return undefined;

  return cleanPath.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc?.[key];
  }, root);
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
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

function normalizeRole(value = "", fallback = "") {
  if (Array.isArray(value)) {
    const roles = value
      .map((item) => normalizeRole(item, ""))
      .filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return fallback;
  }

  const role = String(value || "").trim().toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return fallback;
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

function safeCall(fn = null, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function isEmailLike(value = "") {
  const text = safeText(value, "");
  return Boolean(text && EMAIL_RE.test(text));
}

function firstVisual(values = [], fallback = "Sin nombre") {
  for (const value of safeArray(values)) {
    const text = safeText(value, "");

    if (!text || isEmailLike(text)) continue;

    return compactText(redact(text), fallback, HOME_TITLE_LIMIT);
  }

  return fallback;
}

function hasSensitiveQuery(value = "") {
  return SENSITIVE_QUERY_RE.test(String(value || ""));
}

function safePublicId(value = "") {
  const text = safeText(value, "");

  if (!text) return "";
  if (isEmailLike(text)) return "";
  if (hasSensitiveQuery(text)) return "";
  if (/Bearer\s+/i.test(text)) return "";
  if (SENSITIVE_KEY_RE.test(text) && text.length > 80) return "";

  return compactText(text, "", 160);
}

function safePublicUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (hasSensitiveQuery(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(?:data|blob|javascript|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    raw.includes("/") ||
    /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i.test(raw)
  ) {
    const clean = raw
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .replace(/\/{2,}/g, "/");

    return clean ? `/${clean}` : "";
  }

  return "";
}

function sanitizeDashboardValue(value, keyHint = "") {
  if (RAW_KEYS.has(keyHint)) return undefined;
  if (COSMOS_META_KEYS.has(keyHint)) return undefined;
  if (isSensitiveKey(keyHint)) return undefined;

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeDashboardValue(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (RAW_KEYS.has(key)) continue;
      if (COSMOS_META_KEYS.has(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizeDashboardValue(item, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return value;
}

function sanitizeDashboardObject(value = {}) {
  return safeObject(sanitizeDashboardValue(value), {});
}

/* =========================================================
   ROUTES
========================================================= */

function routeInput(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  try {
    return configRoutePathFromUrlLike(raw) || "";
  } catch {
    if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
    if (raw.startsWith("#/")) return raw.slice(1) || "/";
    return raw;
  }
}

function routeSuffix(value = "") {
  const raw = safeText(value, "");
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const queryIndex = beforeHash.indexOf("?");
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";

  if (hasSensitiveQuery(search) || hasSensitiveQuery(hash)) return "";

  return `${search}${hash}`;
}

function routePathOnly(value = "") {
  const input = routeInput(value);

  if (!input) return "";
  if (!input.startsWith("/")) return "";
  if (input.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return "";
  if (/[\r\n\t\\]/.test(input)) return "";
  if (hasSensitiveQuery(input)) return "";

  const pathOnly = input.split("?")[0].split("#")[0] || "";

  try {
    return configNormalizeRoutePath(pathOnly) || "";
  } catch {
    let path = pathOnly.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

    if (!path.startsWith("/")) {
      path = `/${path}`;
    }

    if (path.length > 1) {
      path = path.replace(/\/+$/g, "") || "/";
    }

    return path || "";
  }
}

function isBlockedRoute(value = "") {
  try {
    return configIsBlockedRoutePath(value) === true;
  } catch {
    const path = routePathOnly(value).toLowerCase();

    return Boolean(
      path === "/home" ||
        path === "/403" ||
        path === "/404" ||
        path === "/2fa" ||
        path === "/mfa" ||
        path === "/otp" ||
        path.startsWith("/2fa/") ||
        path.startsWith("/mfa/") ||
        path.startsWith("/otp/")
    );
  }
}

function normalizeSpaRoute(route = "") {
  const input = routeInput(route);

  if (!input) return "";
  if (!input.startsWith("/")) return "";
  if (input.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return "";
  if (/[\r\n\t\\]/.test(input)) return "";
  if (hasSensitiveQuery(input)) return "";

  const pathOnly = routePathOnly(input);

  if (!pathOnly) return "";
  if (isBlockedRoute(pathOnly)) return "";

  return `${pathOnly}${routeSuffix(input)}`;
}

function routeFromCore(name = "", fallback = "") {
  return normalizeSpaRoute(ROUTES?.[name]) || normalizeSpaRoute(fallback);
}

const INCIDENCIAS_ROUTE = routeFromCore("incidencias", "/incidencias");
const FACTURAS_ROUTE = routeFromCore("facturas", "/facturas");
const CLIENTES_ROUTE = routeFromCore("clientes", "/clientes");
const USUARIOS_ROUTE = routeFromCore("usuarios", "/usuarios");

function routePath(route = "") {
  return normalizeSpaRoute(route).split("?")[0].split("#")[0] || "";
}

function isAdminOnlyRoute(route = "") {
  const path = routePath(route);
  const clientes = routePath(CLIENTES_ROUTE);
  const usuarios = routePath(USUARIOS_ROUTE);

  if (!path) return false;

  try {
    if (configIsAdminRoute(path) === true) return true;
  } catch {
    // fallback abajo
  }

  return (
    Boolean(clientes && (path === clientes || path.startsWith(`${clientes}/`))) ||
    Boolean(usuarios && (path === usuarios || path.startsWith(`${usuarios}/`)))
  );
}

function isAdminEntityValue(value = "") {
  return ADMIN_ENTITY_RE.test(String(value || "").toLowerCase());
}

/* =========================================================
   AUTH / ROLE
========================================================= */

function getAuth() {
  try {
    return (
      AppCore?.auth ||
      AppCore?.Auth ||
      AppCore?.modules?.get?.("auth") ||
      AppCore?.modules?.get?.("Auth") ||
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
      safeCall(Auth?.getCurrentUser?.bind?.(Auth) || Auth?.getCurrentUser),
      safeCall(Auth?.getUser?.bind?.(Auth) || Auth?.getUser),
      safeCall(AppCore?.getCurrentUser?.bind?.(AppCore) || AppCore?.getCurrentUser),
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

  return (
    normalizeRole(
      first(
        safeCall(Auth?.getRole?.bind?.(Auth) || Auth?.getRole),
        safeCall(Auth?.getCurrentRole?.bind?.(Auth) || Auth?.getCurrentRole),
        safeCall(AppCore?.getCurrentRole?.bind?.(AppCore) || AppCore?.getCurrentRole),
        state.role,
        state.rol,
        state.userRole,
        state.roles,
        user.role,
        user.rol,
        user.roles,
        ""
      ),
      ""
    ) || "user"
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
  const raw = safeObject(item);
  const type = normalizeKey(first(raw.type, raw.kind, raw.category, ""));
  const route = normalizeSpaRoute(first(raw.route, raw.href, raw.link, raw.to, ""));

  const identity = safeText(
    [
      raw.entity,
      raw.resource,
      raw.collection,
      raw.targetType,
      raw.meta?.entity,
      raw.meta?.type,
      type,
      route,
    ]
      .filter(Boolean)
      .join(" "),
    ""
  );

  return (
    ADMIN_ACTIVITY_TYPES.has(type) ||
    isAdminOnlyRoute(route) ||
    isAdminEntityValue(identity)
  );
}

function filterActivityForRole(items = [], admin = false) {
  const rows = safeArray(items);
  return admin ? rows : rows.filter((item) => !isAdminOnlyActivity(item));
}

function isAdminOnlyWidget(item = {}) {
  const raw = safeObject(item);
  const route = normalizeSpaRoute(first(raw.route, raw.href, raw.link, raw.to, ""));

  const identity = safeText(
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
      route,
    ]
      .filter(Boolean)
      .join(" "),
    ""
  );

  return isAdminOnlyRoute(route) || isAdminEntityValue(identity);
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

  return sanitizeDashboardObject(output);
}

/* =========================================================
   LIGHT DTO PROJECTION
========================================================= */

function ticketStatusKey(item = {}) {
  const key = normalizeKey(
    first(
      item.status,
      item.estado,
      item.state,
      item.lifecycle?.status,
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
      item.payment?.status,
      item.status,
      item.estado,
      "pending"
    )
  );

  if (["paid", "pagada", "pagado", "cobrada", "cobrado", "abonada", "abonado"].includes(key)) return "paid";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";
  if (["partial", "parcial", "pago_parcial", "partially_paid"].includes(key)) return "partial";
  if (["cancelled", "cancelada", "cancelado", "canceled", "void"].includes(key)) return "cancelled";
  if (["draft", "borrador"].includes(key)) return "draft";

  return "pending";
}

function invoiceAmount(item = {}) {
  return safeNumber(
    first(
      item.totales?.total,
      item.payment?.amount,
      item.total,
      item.amount,
      item.importe,
      item.price,
      item.subtotal,
      item.base,
      item.totalFactura,
      item.importeTotal,
      item.facturaTotal,
      item.facturaImporte,
      item.importeFactura,
      item.invoiceAmount,
      item.totalAmount,
      0
    ),
    0
  );
}

function invoicePaidAmount(item = {}) {
  if (invoiceStatusKey(item) !== "paid") return 0;

  return safeNumber(
    first(
      item.payment?.paidAmount,
      item.totales?.pagado,
      item.paidAmount,
      item.amountPaid,
      item.pagado,
      invoiceAmount(item)
    ),
    0
  );
}

function invoicePendingAmount(item = {}) {
  if (!["pending", "overdue", "partial"].includes(invoiceStatusKey(item))) return 0;

  const explicit = first(
    item.payment?.pendingAmount,
    item.totales?.pendiente,
    item.pendingAmount,
    item.amountPending,
    item.pendiente,
    null
  );

  if (explicit !== null && explicit !== undefined) {
    return Math.max(0, safeNumber(explicit, 0));
  }

  return Math.max(0, invoiceAmount(item) - invoicePaidAmount(item));
}

function attachmentsCount(item = {}) {
  const attachments = first(
    item.attachments,
    item.files,
    item.adjuntos,
    item.documents
  );

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(
    first(
      item.attachmentsCount,
      item.filesCount,
      item.adjuntosCount,
      item.documentsCount,
      0
    ),
    0
  );
}

function modelId(fn, item = {}) {
  try {
    return safePublicId(fn?.(item));
  } catch {
    return "";
  }
}

function getTicketId(item = {}) {
  return safePublicId(
    first(
      modelId(getHomeTicketId, item),
      item.ticketId,
      item.incidenciaId,
      item.code,
      item.numero,
      item.ticketCode,
      item.entityId,
      item.id
    )
  );
}

function getInvoiceId(item = {}) {
  return safePublicId(
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
      item.id
    )
  );
}

function getUserId(item = {}) {
  return safePublicId(
    first(
      modelId(getHomeUserId, item),
      item.userId,
      item.usuarioId,
      item.uid,
      item.sub,
      item.id,
      item.username
    )
  );
}

function getClientId(item = {}) {
  return safePublicId(
    first(
      modelId(getHomeClientId, item),
      item.clienteId,
      item.clientId,
      item.customerId,
      item.userId,
      item.id
    )
  );
}

function ticketOwnerName(item = {}) {
  return firstVisual(
    [
      item.ownerName,
      item.requesterName,
      item.clientName,
      item.clienteName,
      item.clienteNombre,
      item.userName,
      item.usuarioName,
      item.name,
      item.requesterSnapshot?.displayName,
      item.requesterSnapshot?.name,
      item.requesterSnapshot?.nombre,
      item.clienteSnapshot?.displayName,
      item.clienteSnapshot?.name,
      item.clienteSnapshot?.nombre,
      item.userSnapshot?.displayName,
      item.userSnapshot?.name,
      item.userSnapshot?.nombre,
      item.user?.displayName,
      item.user?.name,
      item.cliente?.displayName,
      item.cliente?.name,
      item.cliente?.nombre,
      item.createdByName,
      item.createdBy?.displayName,
      item.createdBy?.name,
    ],
    "Usuario"
  );
}

function ticketAvatarUrl(item = {}) {
  return safePublicUrl(
    first(
      item.avatarUrl,
      item.avatar,
      item.requesterAvatarUrl,
      item.userAvatarUrl,
      item.photoUrl,
      item.photoURL,
      item.requesterSnapshot?.avatarUrl,
      item.requesterSnapshot?.avatar,
      item.requesterSnapshot?.photoUrl,
      item.userSnapshot?.avatarUrl,
      item.user?.avatarUrl,
      item.user?.avatar,
      item.user?.photoUrl,
      item.cliente?.avatarUrl,
      item.cliente?.avatar,
      item.profile?.avatarUrl
    )
  );
}

function technicianId(item = {}) {
  return safePublicId(
    first(
      item.assignedToUserId,
      item.assignedToId,
      item.assigneeId,
      item.technicianId,
      item.tecnicoId,
      item.agentId,

      item.assignment?.assignedToUserId,
      item.assignment?.assignedToId,
      item.assignment?.assigneeId,
      item.assignment?.technicianId,
      item.assignment?.tecnicoId,
      item.assignment?.agentId,
      item.assignment?.userId,
      item.assignment?.id,

      item.assignedTo?.userId,
      item.assignedTo?.usuarioId,
      item.assignedTo?.uid,
      item.assignedTo?.sub,
      item.assignedTo?.id,

      item.tecnico?.userId,
      item.tecnico?.usuarioId,
      item.tecnico?.uid,
      item.tecnico?.sub,
      item.tecnico?.id,

      item.technician?.userId,
      item.technician?.usuarioId,
      item.technician?.uid,
      item.technician?.sub,
      item.technician?.id,

      item.assignedTechnician?.userId,
      item.assignedTechnician?.id,
      item.assignedUser?.userId,
      item.assignedUser?.id,

      item.meta?.technicianUserId,
      item.meta?.assignedToUserId,
      item.meta?.tecnicoId,
      item.meta?.assigneeId,
      ""
    )
  );
}

function technicianName(item = {}) {
  const assignedToObject = safeObject(typeof item.assignedTo === "object" ? item.assignedTo : {});

  return firstVisual(
    [
      item.technicianName,
      item.tecnicoName,
      item.tecnicoNombre,
      item.assignedToName,
      item.assignedName,
      item.assigneeName,
      item.agentName,

      item.assignment?.assignedToName,
      item.assignment?.technicianName,
      item.assignment?.tecnicoName,
      item.assignment?.agentName,
      item.assignment?.displayName,
      item.assignment?.fullName,
      item.assignment?.name,
      item.assignment?.assignedTo?.displayName,
      item.assignment?.assignedTo?.fullName,
      item.assignment?.assignedTo?.name,

      assignedToObject.displayName,
      assignedToObject.fullName,
      assignedToObject.name,
      assignedToObject.nombre,
      assignedToObject.username,

      item.tecnico?.displayName,
      item.tecnico?.fullName,
      item.tecnico?.name,
      item.tecnico?.nombre,
      item.tecnico?.username,

      item.technician?.displayName,
      item.technician?.fullName,
      item.technician?.name,
      item.technician?.nombre,
      item.technician?.username,

      item.assignedTechnician?.displayName,
      item.assignedTechnician?.fullName,
      item.assignedTechnician?.name,
      item.assignedUser?.displayName,
      item.assignedUser?.fullName,
      item.assignedUser?.name,

      item.meta?.technicianName,
      item.meta?.lastTechnicianName,
      item.meta?.assignedToName,

      typeof item.assignedTo === "string" ? item.assignedTo : "",
      typeof item.tecnico === "string" ? item.tecnico : "",
      typeof item.technician === "string" ? item.technician : "",
      typeof item.agent === "string" ? item.agent : "",
      typeof item.assignee === "string" ? item.assignee : "",
    ],
    "Sin asignar"
  );
}

function userAvatarUrl(item = {}) {
  const source = safeObject(item);

  return safePublicUrl(
    first(
      source.avatarUrl,
      source.avatarURL,
      source.avatar_url,
      source.avatar,

      source.photoUrl,
      source.photoURL,
      source.photo_url,
      source.photo,

      source.pictureUrl,
      source.pictureURL,
      source.picture_url,
      source.picture,

      source.imageUrl,
      source.imageURL,
      source.image_url,
      source.image,

      source.fotoUrl,
      source.fotoURL,
      source.foto_url,
      source.foto,

      source.imagenUrl,
      source.imagenURL,
      source.imagen_url,
      source.imagen,

      source.profile?.avatarUrl,
      source.profile?.avatarURL,
      source.profile?.avatar_url,
      source.profile?.avatar,
      source.profile?.photoUrl,
      source.profile?.photoURL,
      source.profile?.photo_url,
      source.profile?.photo,
      source.profile?.pictureUrl,
      source.profile?.pictureURL,
      source.profile?.picture_url,
      source.profile?.picture,
      source.profile?.imageUrl,
      source.profile?.imageURL,
      source.profile?.image_url,
      source.profile?.image,

      source.media?.avatarUrl,
      source.media?.avatarURL,
      source.media?.avatar_url,
      source.media?.avatar,
      source.media?.photoUrl,
      source.media?.photoURL,
      source.media?.photo_url,
      source.media?.photo,
      source.media?.pictureUrl,
      source.media?.pictureURL,
      source.media?.picture_url,
      source.media?.picture,
      source.media?.imageUrl,
      source.media?.imageURL,
      source.media?.image_url,
      source.media?.image,
      ""
    )
  );
}

function userDisplayName(item = {}, fallback = "Usuario") {
  const source = safeObject(item);
  const userId = getUserId(source);

  return firstVisual(
    [
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      source.contacto?.displayName,
      source.contacto?.name,
      source.contacto?.nombre,
      source.profile?.publicName,
      source.profile?.displayName,
      source.profile?.fullName,
      source.profile?.name,
      source.profile?.nombre,
      source.username,
      source.userName,
      source.slug,
      userId ? `Usuario ${userId}` : "",
    ],
    fallback
  );
}

function technicianAvatarUrl(item = {}) {
  const assignedToObject = safeObject(typeof item.assignedTo === "object" ? item.assignedTo : {});

  return safePublicUrl(
    first(
      item.technician?.avatarUrl,
      item.technician?.avatarURL,
      item.technician?.avatar_url,
      item.technician?.avatar,
      item.technician?.photoUrl,
      item.technician?.photoURL,
      item.technician?.photo_url,
      item.technician?.photo,
      item.technician?.pictureUrl,
      item.technician?.pictureURL,
      item.technician?.picture_url,
      item.technician?.picture,
      item.technician?.imageUrl,
      item.technician?.imageURL,
      item.technician?.image_url,
      item.technician?.image,
      item.technician?.profile?.avatarUrl,
      item.technician?.profile?.avatar,
      item.technician?.media?.avatarUrl,
      item.technician?.media?.avatar,

      assignedToObject.avatarUrl,
      assignedToObject.avatarURL,
      assignedToObject.avatar_url,
      assignedToObject.avatar,
      assignedToObject.photoUrl,
      assignedToObject.photoURL,
      assignedToObject.photo_url,
      assignedToObject.photo,
      assignedToObject.pictureUrl,
      assignedToObject.pictureURL,
      assignedToObject.picture_url,
      assignedToObject.picture,
      assignedToObject.imageUrl,
      assignedToObject.imageURL,
      assignedToObject.image_url,
      assignedToObject.image,
      assignedToObject.profile?.avatarUrl,
      assignedToObject.profile?.avatar,
      assignedToObject.media?.avatarUrl,
      assignedToObject.media?.avatar,

      item.tecnico?.avatarUrl,
      item.tecnico?.avatarURL,
      item.tecnico?.avatar_url,
      item.tecnico?.avatar,
      item.tecnico?.photoUrl,
      item.tecnico?.photoURL,
      item.tecnico?.photo_url,
      item.tecnico?.photo,
      item.tecnico?.pictureUrl,
      item.tecnico?.pictureURL,
      item.tecnico?.picture_url,
      item.tecnico?.picture,
      item.tecnico?.imageUrl,
      item.tecnico?.imageURL,
      item.tecnico?.image_url,
      item.tecnico?.image,
      item.tecnico?.profile?.avatarUrl,
      item.tecnico?.profile?.avatar,
      item.tecnico?.media?.avatarUrl,
      item.tecnico?.media?.avatar,

      item.assignedTechnician?.avatarUrl,
      item.assignedTechnician?.avatar,
      item.assignedTechnician?.photoUrl,
      item.assignedTechnician?.pictureUrl,
      item.assignedTechnician?.imageUrl,
      item.assignedUser?.avatarUrl,
      item.assignedUser?.avatar,
      item.assignedUser?.photoUrl,
      item.assignedUser?.pictureUrl,
      item.assignedUser?.imageUrl,

      item.assignment?.assignedTo?.avatarUrl,
      item.assignment?.assignedTo?.avatar,
      item.assignment?.technician?.avatarUrl,
      item.assignment?.technician?.avatar,
      item.assignment?.agent?.avatarUrl,
      item.assignment?.agent?.avatar,
      item.assignment?.assignedToAvatarUrl,
      item.assignment?.assignedToAvatar,
      item.assignment?.technicianAvatarUrl,
      item.assignment?.technicianAvatar,
      item.assignment?.agentAvatarUrl,
      item.assignment?.agentAvatar,
      item.assignment?.avatarUrl,
      item.assignment?.avatar,

      item.technicianAvatarUrl,
      item.technicianAvatar,
      item.tecnicoAvatarUrl,
      item.tecnicoAvatar,
      item.assignedToAvatarUrl,
      item.assignedToAvatar,
      item.assignedAvatarUrl,
      item.assignedAvatar,
      item.agentAvatarUrl,
      item.agentAvatar,
      item.meta?.technicianAvatarUrl,
      item.meta?.technicianAvatar,
      item.meta?.assignedToAvatarUrl,
      ""
    )
  );
}

function normalizeLookupIdentity(value = "") {
  const key = normalizeKey(value);

  if (!key) return "";

  if ([
    "sin_asignar",
    "sin_tecnico",
    "no_asignado",
    "no_asignada",
    "unassigned",
    "none",
    "null",
    "undefined",
  ].includes(key)) {
    return "";
  }

  return key;
}

function lookupEntry(value = "", priority = 0) {
  const key = normalizeLookupIdentity(value);
  return key ? { key, priority } : null;
}

function pushLookupEntries(entries = [], priority = 0, values = []) {
  for (const value of safeArray(values).flat(Infinity)) {
    const entry = lookupEntry(value, priority);
    if (entry) entries.push(entry);
  }

  return entries;
}

function uniqueLookupEntries(entries = []) {
  const seen = new Set();
  const output = [];

  for (const entry of safeArray(entries)) {
    const key = safeText(entry?.key, "");
    const priority = safeNumber(entry?.priority, 0);

    if (!key || seen.has(key)) continue;

    seen.add(key);
    output.push({ key, priority });
  }

  return output.sort((left, right) => right.priority - left.priority);
}

function userLookupEntries(item = {}) {
  const source = safeObject(item);
  const entries = [];

  pushLookupEntries(entries, 100, [
    getUserId(source),
    source.userId,
    source.usuarioId,
    source.uid,
    source.sub,
    source.id,
    source.userRef?.userId,
    source.userRef?.id,
    source.account?.userId,
    source.auth?.userId,
    source.lookup?.userId,
    source.search?.normalizedUserId,
  ]);

  pushLookupEntries(entries, 90, [
    source.emailLower,
    source.email,
    source.mail,
    source.contacto?.emailLower,
    source.contacto?.email,
    source.lookup?.emailLower,
    source.search?.normalizedEmail,
  ]);

  pushLookupEntries(entries, 80, [
    source.usernameLower,
    source.username,
    source.userName,
    source.slug,
    source.lookup?.usernameLower,
    source.lookup?.slug,
    source.search?.normalizedUsername,
  ]);

  pushLookupEntries(entries, 40, [
    source.displayName,
    source.fullName,
    source.name,
    source.nombre,
    safeText(`${safeText(source.firstName, "")} ${safeText(source.lastName, "")}`, ""),
    source.contacto?.displayName,
    source.contacto?.name,
    source.contacto?.nombre,
    source.profile?.publicName,
    source.profile?.displayName,
    source.profile?.fullName,
    source.profile?.name,
    source.profile?.nombre,
    source.search?.normalizedName,
    source.search?.normalizedDisplayName,
  ]);

  return uniqueLookupEntries(entries);
}

function setUserLookup(map = new Map(), key = "", user = {}, priority = 0) {
  const cleanKey = normalizeLookupIdentity(key);

  if (!cleanKey || !hasOwnKeys(user)) return map;

  const nextUserId = normalizeLookupIdentity(getUserId(user));
  const current = map.get(cleanKey);

  if (!current) {
    map.set(cleanKey, {
      user,
      priority,
      userId: nextUserId,
      ambiguous: false,
    });

    return map;
  }

  const sameUser = Boolean(
    nextUserId &&
      current.userId &&
      nextUserId === current.userId
  );

  if (sameUser) {
    if (priority > current.priority) {
      map.set(cleanKey, {
        user,
        priority,
        userId: nextUserId,
        ambiguous: false,
      });
    }

    return map;
  }

  if (priority > current.priority) {
    map.set(cleanKey, {
      user,
      priority,
      userId: nextUserId,
      ambiguous: false,
    });

    return map;
  }

  if (priority === current.priority) {
    map.set(cleanKey, {
      ...current,
      ambiguous: true,
    });
  }

  return map;
}

function buildUsersLookup(...sources) {
  const map = new Map();
  const users = safeArray(sources).flat(Infinity).filter(hasOwnKeys);

  for (const user of users) {
    for (const entry of userLookupEntries(user)) {
      setUserLookup(map, entry.key, user, entry.priority);
    }
  }

  return map;
}

function ticketTechnicianLookupEntries(item = {}) {
  const source = safeObject(item);
  const assignedToObject = safeObject(typeof source.assignedTo === "object" ? source.assignedTo : {});
  const entries = [];

  pushLookupEntries(entries, 100, [
    technicianId(source),
    source.assignedToUserId,
    source.assignedToId,
    source.assigneeId,
    source.technicianId,
    source.tecnicoId,
    source.agentId,

    source.assignment?.assignedToUserId,
    source.assignment?.assignedToId,
    source.assignment?.assigneeId,
    source.assignment?.technicianId,
    source.assignment?.tecnicoId,
    source.assignment?.agentId,
    source.assignment?.userId,
    source.assignment?.id,

    assignedToObject.userId,
    assignedToObject.usuarioId,
    assignedToObject.uid,
    assignedToObject.sub,
    assignedToObject.id,

    source.tecnico?.userId,
    source.tecnico?.usuarioId,
    source.tecnico?.uid,
    source.tecnico?.sub,
    source.tecnico?.id,

    source.technician?.userId,
    source.technician?.usuarioId,
    source.technician?.uid,
    source.technician?.sub,
    source.technician?.id,

    source.assignedTechnician?.userId,
    source.assignedTechnician?.id,
    source.assignedUser?.userId,
    source.assignedUser?.id,

    source.meta?.technicianUserId,
    source.meta?.assignedToUserId,
    source.meta?.tecnicoId,
    source.meta?.assigneeId,
  ]);

  pushLookupEntries(entries, 90, [
    source.assignedToEmail,
    source.technicianEmail,
    source.tecnicoEmail,
    source.agentEmail,
    source.assignment?.assignedToEmail,
    source.assignment?.technicianEmail,
    source.assignment?.agentEmail,
    source.assignment?.email,
    assignedToObject.emailLower,
    assignedToObject.email,
    source.tecnico?.emailLower,
    source.tecnico?.email,
    source.technician?.emailLower,
    source.technician?.email,
    source.assignedTechnician?.email,
    source.assignedUser?.email,
    source.meta?.technicianEmail,
  ]);

  pushLookupEntries(entries, 80, [
    source.assignedToUsername,
    source.technicianUsername,
    source.tecnicoUsername,
    source.agentUsername,
    source.assignment?.username,
    source.assignment?.assignedToUsername,
    assignedToObject.usernameLower,
    assignedToObject.username,
    assignedToObject.slug,
    source.tecnico?.usernameLower,
    source.tecnico?.username,
    source.tecnico?.slug,
    source.technician?.usernameLower,
    source.technician?.username,
    source.technician?.slug,
    source.assignedTechnician?.username,
    source.assignedUser?.username,
  ]);

  pushLookupEntries(entries, 40, [
    technicianName(source),
    source.technicianName,
    source.tecnicoName,
    source.tecnicoNombre,
    source.assignedToName,
    source.assignedName,
    source.assigneeName,
    source.agentName,
    source.assignment?.assignedToName,
    source.assignment?.technicianName,
    source.assignment?.tecnicoName,
    source.assignment?.agentName,
    source.assignment?.displayName,
    source.assignment?.fullName,
    source.assignment?.name,
    assignedToObject.displayName,
    assignedToObject.fullName,
    assignedToObject.name,
    assignedToObject.nombre,
    source.tecnico?.displayName,
    source.tecnico?.fullName,
    source.tecnico?.name,
    source.tecnico?.nombre,
    source.technician?.displayName,
    source.technician?.fullName,
    source.technician?.name,
    source.technician?.nombre,
    source.assignedTechnician?.displayName,
    source.assignedTechnician?.fullName,
    source.assignedTechnician?.name,
    source.assignedUser?.displayName,
    source.assignedUser?.fullName,
    source.assignedUser?.name,
    typeof source.assignedTo === "string" ? source.assignedTo : "",
    typeof source.tecnico === "string" ? source.tecnico : "",
    typeof source.technician === "string" ? source.technician : "",
    typeof source.agent === "string" ? source.agent : "",
    typeof source.assignee === "string" ? source.assignee : "",
  ]);

  return uniqueLookupEntries(entries);
}

function findTechnicianUser(item = {}, usersLookup = new Map()) {
  if (!(usersLookup instanceof Map) || !usersLookup.size) return null;

  for (const entry of ticketTechnicianLookupEntries(item)) {
    const hit = usersLookup.get(entry.key);

    if (hit?.user && hit.ambiguous !== true) {
      return hit.user;
    }
  }

  return null;
}

function enrichTicketTechnicianFromUsers(item = {}, usersLookup = new Map()) {
  const source = safeObject(item);

  if (!hasOwnKeys(source) || technicianAvatarUrl(source)) return source;

  const user = findTechnicianUser(source, usersLookup);
  const avatarUrl = userAvatarUrl(user);

  if (!avatarUrl) return source;

  const assignedToUserId = safePublicId(
    first(
      technicianId(source),
      getUserId(user),
      user?.userId,
      user?.usuarioId,
      user?.id,
      ""
    )
  );

  const sourceTechnicianName = technicianName(source);
  const assignedToName = firstVisual(
    [
      normalizeLookupIdentity(sourceTechnicianName) ? sourceTechnicianName : "",
      source.assignedToName,
      source.technicianName,
      source.tecnicoName,
      userDisplayName(user, ""),
    ],
    userDisplayName(user, "Sin asignar")
  );

  const assignment = safeObject(source.assignment);
  const assignedTo = safeObject(typeof source.assignedTo === "object" ? source.assignedTo : {});
  const tecnico = safeObject(typeof source.tecnico === "object" ? source.tecnico : {});
  const technician = safeObject(typeof source.technician === "object" ? source.technician : {});

  return {
    ...source,

    assignedToUserId: first(source.assignedToUserId, assignedToUserId),
    assignedToName: first(source.assignedToName, assignedToName),
    technicianName: first(source.technicianName, assignedToName),
    technicianAvatarUrl: first(source.technicianAvatarUrl, avatarUrl),

    assignment: {
      ...assignment,
      assignedToUserId: first(assignment.assignedToUserId, assignedToUserId),
      userId: first(assignment.userId, assignedToUserId),
      assignedToName: first(assignment.assignedToName, assignedToName),
      displayName: first(assignment.displayName, assignedToName),
      name: first(assignment.name, assignedToName),
      avatarUrl: first(assignment.avatarUrl, avatarUrl),
      avatar: first(assignment.avatar, avatarUrl),
    },

    assignedTo: {
      ...assignedTo,
      userId: first(assignedTo.userId, assignedToUserId),
      id: first(assignedTo.id, assignedToUserId),
      displayName: first(assignedTo.displayName, assignedToName),
      name: first(assignedTo.name, assignedToName),
      avatarUrl: first(assignedTo.avatarUrl, avatarUrl),
      avatar: first(assignedTo.avatar, avatarUrl),
    },

    tecnico: {
      ...tecnico,
      userId: first(tecnico.userId, assignedToUserId),
      id: first(tecnico.id, assignedToUserId),
      displayName: first(tecnico.displayName, assignedToName),
      name: first(tecnico.name, assignedToName),
      avatarUrl: first(tecnico.avatarUrl, avatarUrl),
      avatar: first(tecnico.avatar, avatarUrl),
    },

    technician: {
      ...technician,
      userId: first(technician.userId, assignedToUserId),
      id: first(technician.id, assignedToUserId),
      displayName: first(technician.displayName, assignedToName),
      name: first(technician.name, assignedToName),
      avatarUrl: first(technician.avatarUrl, avatarUrl),
      avatar: first(technician.avatar, avatarUrl),
    },
  };
}

function ticketInvoiceIds(item = {}) {
  return [
    item.facturaId,
    item.invoiceId,
    item.factura?.facturaId,
    item.factura?.invoiceId,
    item.billing?.primaryInvoiceId,
    item.linkedInvoices?.primaryInvoiceId,
    item.billing?.invoiceIds,
    item.linkedInvoices?.ids,
    item.facturaIds,
    item.invoiceIds,
    item.facturasRelacionadas,
  ]
    .flat(Infinity)
    .map(safePublicId)
    .filter(Boolean);
}

function ticketPreview(item = {}) {
  const source = safeObject(item);
  const ticketId = getTicketId(source);
  const status = ticketStatusKey(source);
  const priority = ticketPriorityKey(source);
  const ownerName = ticketOwnerName(source);
  const avatarUrl = ticketAvatarUrl(source);
  const files = attachmentsCount(source);
  const assignedToUserId = technicianId(source);
  const assignedToName = technicianName(source);
  const assignedAvatarUrl = technicianAvatarUrl(source);
  const invoiceIds = ticketInvoiceIds(source);

  const subject = compactText(
    first(
      source.subject,
      source.asunto,
      source.title,
      source.titulo,
      source.name,
      ticketId ? `Incidencia ${ticketId}` : "Incidencia"
    ),
    ticketId ? `Incidencia ${ticketId}` : "Incidencia",
    HOME_TITLE_LIMIT
  );

  const description = compactText(
    first(
      source.preview,
      source.message,
      source.description,
      source.descripcion,
      source.summary,
      source.resumen,
      source.body,
      ""
    ),
    "",
    HOME_TEXT_LIMIT
  );

  const category = compactText(
    first(
      source.category,
      source.categoria,
      source.type,
      source.tipo,
      "General"
    ),
    "General",
    64
  );

  const createdAt = safeText(
    first(
      source.createdAt,
      source.fechaCreacion,
      source.created_at,
      source.lifecycle?.createdAt,
      ""
    ),
    ""
  );

  const updatedAt = safeText(
    first(
      source.updatedAt,
      source.lastActivityAt,
      source.lastUpdateAt,
      source.updated_at,
      source.lifecycle?.updatedAt,
      source.lifecycle?.lastActivityAt,
      createdAt
    ),
    createdAt
  );

  return {
    id: ticketId,
    ticketId,
    incidenciaId: ticketId,

    userId: safePublicId(first(source.userId, source.userRef?.userId, source.requesterSnapshot?.userId, source.cliente?.userId, "")),
    clienteId: safePublicId(first(source.clienteId, source.clienteRef?.clienteId, source.cliente?.clienteId, source.requesterSnapshot?.clienteId, "")),

    subject,
    asunto: subject,
    title: subject,

    message: description,
    description,
    descripcion: description,
    preview: description,

    status,
    estado: status,
    statusKey: status,

    priority,
    prioridad: priority,
    priorityKey: priority,

    category,
    categoria: category,
    type: category,
    tipo: category,

    ownerName,
    requesterName: ownerName,
    clientName: ownerName,
    userName: ownerName,

    avatarUrl,
    requesterAvatarUrl: avatarUrl,
    requesterSnapshot: {
      displayName: ownerName,
      name: ownerName,
      avatarUrl,
    },

    assignment: {
      assignedToUserId,
      assignedToName,
      assignedAt: safeText(first(source.assignment?.assignedAt, source.assignedAt, ""), ""),
      team: safeText(first(source.assignment?.team, source.team, "support"), "support"),
      avatarUrl: assignedAvatarUrl,
    },

    assignedTo: {
      userId: assignedToUserId,
      id: assignedToUserId,
      name: assignedToName,
      displayName: assignedToName,
      avatarUrl: assignedAvatarUrl,
    },

    tecnico: {
      userId: assignedToUserId,
      id: assignedToUserId,
      name: assignedToName,
      displayName: assignedToName,
      avatarUrl: assignedAvatarUrl,
    },

    technician: {
      userId: assignedToUserId,
      id: assignedToUserId,
      name: assignedToName,
      displayName: assignedToName,
      avatarUrl: assignedAvatarUrl,
    },

    technicianName: assignedToName,
    technicianAvatarUrl: assignedAvatarUrl,
    assignedToUserId,
    assignedToName,

    facturaId: safePublicId(first(source.facturaId, source.invoiceId, "")),
    invoiceId: safePublicId(first(source.invoiceId, source.facturaId, "")),
    facturaIds: invoiceIds,
    invoiceIds,

    createdAt,
    updatedAt,
    lastUpdateAt: updatedAt,
    lastActivityAt: updatedAt,

    attachmentsCount: files,
    filesCount: files,
    adjuntosCount: files,
    hasAttachments: files > 0,
  };
}

function invoiceTicketIds(item = {}) {
  return [
    item.ticketId,
    item.incidenciaId,
    item.ticket?.id,
    item.ticket?.ticketId,
    item.incidencia?.id,
    item.incidencia?.ticketId,
    item.incidencia?.incidenciaId,
    item.relations?.ticket?.id,
    item.relations?.ticket?.ticketId,
    item.relations?.ticket?.partitionKey,
    item.ticketRef?.id,
    item.ticketRef?.ticketId,
    item.ticketRef?.partitionKey,
  ]
    .flat(Infinity)
    .map(safePublicId)
    .filter(Boolean);
}

function invoicePreview(item = {}) {
  const source = safeObject(item);
  const invoiceId = getInvoiceId(source);
  const status = invoiceStatusKey(source);
  const amount = invoiceAmount(source);
  const paidAmount = invoicePaidAmount(source);
  const pendingAmount = invoicePendingAmount(source);
  const ticketIds = invoiceTicketIds(source);
  const primaryTicketId = first(ticketIds, "");

  const currency = safeText(
    first(
      source.currency,
      source.moneda,
      source.divisa,
      source.totales?.currency,
      source.invoiceCurrency,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();

  const createdAt = safeText(
    first(
      source.createdAt,
      source.fechaFactura,
      source.fechaFacturaISO,
      source.fecha,
      source.date,
      source.issuedAt,
      source.created_at,
      source.lifecycle?.createdAt,
      ""
    ),
    ""
  );

  const updatedAt = safeText(
    first(
      source.updatedAt,
      source.updated_at,
      source.fechaPago,
      source.fechaEnvio,
      source.paidAt,
      source.sentAt,
      source.dueAt,
      source.lifecycle?.updatedAt,
      source.lifecycle?.lastActivityAt,
      createdAt
    ),
    createdAt
  );

  const title = compactText(
    first(
      source.title,
      source.name,
      source.conceptoPrincipal,
      source.concepto,
      source.descripcionPrincipal,
      invoiceId ? `Factura ${invoiceId}` : "Factura"
    ),
    invoiceId ? `Factura ${invoiceId}` : "Factura",
    HOME_TITLE_LIMIT
  );

  return {
    id: invoiceId,
    invoiceId,
    facturaId: invoiceId,

    number: safeText(first(source.numeroFacturaLegal, source.numeroFactura, source.invoiceNumber, source.number, source.numero, invoiceId), invoiceId),
    numero: safeText(first(source.numero, source.number, source.numeroFacturaLegal, source.numeroFactura, invoiceId), invoiceId),
    numeroFactura: safeText(first(source.numeroFactura, source.numeroFacturaLegal, source.invoiceNumber, source.number, invoiceId), invoiceId),
    numeroFacturaLegal: safeText(first(source.numeroFacturaLegal, source.numeroFactura, source.invoiceNumber, invoiceId), invoiceId),
    invoiceNumber: safeText(first(source.invoiceNumber, source.numeroFacturaLegal, source.numeroFactura, source.number, invoiceId), invoiceId),

    title,
    concepto: title,

    status,
    estado: status,
    paymentStatus: status,
    estadoPago: status,
    statusKey: status,

    total: amount,
    amount,
    importe: amount,
    importeTotal: amount,
    totalFactura: amount,
    facturaTotal: amount,
    facturaImporte: amount,
    importeFactura: amount,
    invoiceAmount: amount,

    paidAmount,
    pendingAmount,
    pagado: paidAmount,
    pendiente: pendingAmount,

    currency,
    moneda: currency,

    ticketId: primaryTicketId,
    incidenciaId: primaryTicketId,
    ticketIds,
    incidenciaIds: ticketIds,
    hasLinkedTicket: Boolean(primaryTicketId),

    incidencia: primaryTicketId
      ? {
          id: primaryTicketId,
          ticketId: primaryTicketId,
          incidenciaId: primaryTicketId,
        }
      : null,

    relations: primaryTicketId
      ? {
          ticket: {
            id: primaryTicketId,
            ticketId: primaryTicketId,
            partitionKey: primaryTicketId,
          },
        }
      : {},

    createdAt,
    updatedAt,
    date: createdAt,
  };
}

function clientPreview(item = {}) {
  const source = safeObject(item);
  const clientId = getClientId(source);

  const name = firstVisual(
    [
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      source.razonSocial,
      source.company,
      source.companyName,
      source.nombreContacto,
      source.slug,
      clientId ? `Cliente ${clientId}` : "Cliente",
    ],
    "Cliente"
  );

  return {
    id: clientId,
    clientId,
    clienteId: clientId,
    customerId: clientId,
    userId: safePublicId(source.userId),

    displayName: name,
    fullName: name,
    name,
    nombre: name,
    razonSocial: name,
    company: name,
    companyName: name,

    createdAt: safeText(first(source.createdAt, source.created_at, ""), ""),
    updatedAt: safeText(first(source.updatedAt, source.updated_at, source.createdAt, ""), ""),
  };
}

function userPreview(item = {}) {
  const source = safeObject(item);
  const userId = getUserId(source);

  const name = firstVisual(
    [
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      source.profile?.displayName,
      source.profile?.fullName,
      source.profile?.name,
      source.username,
      userId ? `Usuario ${userId}` : "Usuario",
    ],
    "Usuario"
  );

  const role = normalizeRole(
    first(
      source.role,
      source.rol,
      source.roles,
      "user"
    ),
    "user"
  );

  const avatarUrl = userAvatarUrl(source);

  return {
    id: userId,
    userId,
    usuarioId: userId,

    displayName: name,
    fullName: name,
    name,
    nombre: name,
    username: safePublicId(source.username),
    slug: safePublicId(first(source.slug, source.lookup?.slug, source.profile?.slug, "")),

    role,
    rol: role,
    roles: [role],

    avatarUrl,
    avatar: avatarUrl,
    photoUrl: avatarUrl,
    pictureUrl: avatarUrl,

    createdAt: safeText(first(source.createdAt, source.created_at, ""), ""),
    updatedAt: safeText(first(source.updatedAt, source.updated_at, source.lastLoginAt, source.createdAt, ""), ""),
    lastLoginAt: safeText(source.lastLoginAt, ""),
  };
}

function projectList(items = [], mapper = (item) => item, picker = (item) => item.id) {
  const rows = safeArray(items)
    .slice(0, HOME_MAX_ITEMS)
    .map((item) => mapper(item))
    .filter(hasOwnKeys);

  return uniqueBy(rows, picker);
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
    "docs" in object ||
    "documents" in object ||
    "value" in object ||
    "list" in object ||
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
      source: {},
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
    for (const alias of safeArray(aliases)) {
      const value = source?.[alias];

      if (Array.isArray(value)) {
        return {
          items: value,
          total: Math.max(value.length, extractTotal(source, aliases, value.length)),
          source,
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
      source.list,
      Array.isArray(source.data) ? source.data : null,
      Array.isArray(source.payload) ? source.payload : null,
      Array.isArray(source.result) ? source.result : null,
      Array.isArray(source.response) ? source.response : null
    );

    if (Array.isArray(direct)) {
      return {
        items: direct,
        total: Math.max(direct.length, extractTotal(source, aliases, direct.length)),
        source,
      };
    }
  }

  return {
    items: [],
    total: extractTotal(object, aliases, 0),
    source: object,
  };
}

function summarySources(payload = null) {
  const object = safeObject(unwrapResponse(payload), {});

  return [
    object.summary,
    object.stats,
    object.metrics,
    object.totals,
    object.counts,
    object.data?.summary,
    object.payload?.summary,
    object.result?.summary,
    object.meta,
    object,
  ].filter(hasOwnKeys);
}

function pickSummaryNumber(payload = null, keys = [], fallback = 0) {
  return pickMax(keys, summarySources(payload), fallback);
}

/* =========================================================
   MODULE NORMALIZATION FROM LISTS ONLY
========================================================= */

function normalizeTicketsModule(listPayload = null, options = {}) {
  const collection = extractCollection(listPayload, ["tickets", "incidencias"]);
  const summarySource = listPayload || collection.source || {};
  const usersLookup = buildUsersLookup(
    options.users,
    options.rawUsers,
    options.contextUsers,
    getCurrentUser()
  );

  const items = projectList(
    collection.items,
    (item) => ticketPreview(enrichTicketTechnicianFromUsers(item, usersLookup)),
    (item) => item.ticketId || item.incidenciaId || item.id
  );

  const total = Math.max(items.length, collection.total);

  const pendingVisible = items.filter((item) => ticketStatusKey(item) === "pending").length;
  const openVisible = items.filter((item) => ticketStatusKey(item) === "open").length;
  const progressVisible = items.filter((item) => ticketStatusKey(item) === "progress").length;
  const resolvedVisible = items.filter((item) => ticketStatusKey(item) === "resolved").length;
  const closedVisible = items.filter((item) => ticketStatusKey(item) === "closed").length;

  const pendingTickets = pickSummaryNumber(summarySource, ["pendingTickets", "pendingIncidencias", "incidenciasPendientes"], pendingVisible);
  const openTickets = pickSummaryNumber(summarySource, ["openTickets", "openIncidencias", "incidenciasAbiertas"], openVisible);
  const progressTickets = pickSummaryNumber(summarySource, ["progressTickets", "progressIncidencias", "incidenciasEnCurso"], progressVisible);
  const resolvedTickets = pickSummaryNumber(summarySource, ["resolvedTickets", "resolvedIncidencias", "incidenciasResueltas"], resolvedVisible);
  const closedTickets = pickSummaryNumber(summarySource, ["closedTickets", "closedIncidencias", "incidenciasCerradas"], closedVisible);

  const urgentTickets = pickSummaryNumber(
    summarySource,
    ["urgentTickets", "urgentIncidencias", "highPriorityTickets", "incidenciasUrgentes"],
    items.filter((item) => ["urgent", "critical"].includes(ticketPriorityKey(item))).length
  );

  const filesCount = items.reduce((sum, item) => sum + safeNumber(item.attachmentsCount, 0), 0);

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

      pendingTickets,
      pendingIncidencias: pendingTickets,
      incidenciasPendientes: pendingTickets,

      openTickets,
      openIncidencias: openTickets,
      incidenciasAbiertas: openTickets,

      progressTickets,
      progressIncidencias: progressTickets,
      incidenciasEnCurso: progressTickets,

      resolvedTickets,
      resolvedIncidencias: resolvedTickets,
      incidenciasResueltas: resolvedTickets,

      closedTickets,
      closedIncidencias: closedTickets,
      incidenciasCerradas: closedTickets,

      activeTickets: pendingTickets + openTickets + progressTickets,
      activeIncidencias: pendingTickets + openTickets + progressTickets,

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
  const summarySource = listPayload || collection.source || {};

  const items = projectList(
    collection.items,
    invoicePreview,
    (item) => item.facturaId || item.invoiceId || item.id
  );

  const total = Math.max(items.length, collection.total);

  const paidVisible = items.filter((item) => invoiceStatusKey(item) === "paid").length;
  const pendingVisible = items.filter((item) => ["pending", "overdue", "partial"].includes(invoiceStatusKey(item))).length;
  const overdueVisible = items.filter((item) => invoiceStatusKey(item) === "overdue").length;

  const paidInvoices = pickSummaryNumber(summarySource, ["paidInvoices", "paidFacturas", "facturasPagadas"], paidVisible);
  const pendingInvoices = pickSummaryNumber(summarySource, ["pendingInvoices", "pendingFacturas", "facturasPendientes", "invoicesPending"], pendingVisible);
  const overdueInvoices = pickSummaryNumber(summarySource, ["overdueInvoices", "overdueFacturas", "facturasVencidas"], overdueVisible);

  const computedPaidAmount = items.reduce((sum, item) => sum + invoicePaidAmount(item), 0);
  const computedPendingAmount = items.reduce((sum, item) => sum + invoicePendingAmount(item), 0);
  const computedGrossAmount = items.reduce((sum, item) => sum + invoiceAmount(item), 0);

  const invoiceTotal = pickSummaryNumber(
    summarySource,
    ["paidInvoiceAmount", "invoicePaidAmount", "paidAmountTotal", "pagadoTotal"],
    computedPaidAmount
  );

  const pendingInvoiceAmount = pickSummaryNumber(
    summarySource,
    ["pendingInvoiceAmount", "importePendiente", "facturacionPendiente"],
    computedPendingAmount
  );

  const grossInvoiceAmount = pickSummaryNumber(
    summarySource,
    ["grossInvoiceAmount", "invoiceGrossAmount"],
    computedGrossAmount
  );

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

      paidInvoices,
      paidFacturas: paidInvoices,
      facturasPagadas: paidInvoices,

      pendingInvoices,
      pendingFacturas: pendingInvoices,
      facturasPendientes: pendingInvoices,
      invoicesPending: pendingInvoices,

      overdueInvoices,
      overdueFacturas: overdueInvoices,
      facturasVencidas: overdueInvoices,

      invoiceAmount: invoiceTotal,
      paidInvoiceAmount: invoiceTotal,
      pendingInvoiceAmount,
      grossInvoiceAmount,

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

  const items = projectList(
    collection.items,
    clientPreview,
    (item) => item.clienteId || item.clientId || item.customerId || item.id
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

  const items = projectList(
    collection.items,
    userPreview,
    (item) => item.userId || item.usuarioId || item.id
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

  const totalTickets = Math.max(safeNumber(ticketStats.totalTickets, 0), safeNumber(tickets?.total, 0));
  const totalInvoices = Math.max(safeNumber(facturaStats.totalInvoices, 0), safeNumber(facturas?.total, 0));

  const clientsCount = admin
    ? Math.max(safeNumber(clienteStats.clientsCount, 0), safeNumber(clientes?.total, 0))
    : 0;

  const usersCount = admin
    ? Math.max(safeNumber(userStats.usersCount, 0), safeNumber(users?.total, 0))
    : 0;

  return sanitizeSummaryForRole(
    {
      totalTickets,
      ticketsTotal: totalTickets,
      incidenciasTotal: totalTickets,
      totalIncidencias: totalTickets,
      ticketsCount: totalTickets,
      incidenciasCount: totalTickets,

      pendingTickets: safeNumber(ticketStats.pendingTickets, 0),
      pendingIncidencias: safeNumber(ticketStats.pendingTickets, 0),
      incidenciasPendientes: safeNumber(ticketStats.pendingTickets, 0),

      openTickets: safeNumber(ticketStats.openTickets, 0),
      openIncidencias: safeNumber(ticketStats.openTickets, 0),
      incidenciasAbiertas: safeNumber(ticketStats.openTickets, 0),

      progressTickets: safeNumber(ticketStats.progressTickets, 0),
      progressIncidencias: safeNumber(ticketStats.progressTickets, 0),
      incidenciasEnCurso: safeNumber(ticketStats.progressTickets, 0),

      resolvedTickets: safeNumber(ticketStats.resolvedTickets, 0),
      resolvedIncidencias: safeNumber(ticketStats.resolvedTickets, 0),
      incidenciasResueltas: safeNumber(ticketStats.resolvedTickets, 0),

      closedTickets: safeNumber(ticketStats.closedTickets, 0),
      closedIncidencias: safeNumber(ticketStats.closedTickets, 0),
      incidenciasCerradas: safeNumber(ticketStats.closedTickets, 0),

      activeTickets: safeNumber(ticketStats.activeTickets, 0),
      activeIncidencias: safeNumber(ticketStats.activeTickets, 0),

      urgentTickets: safeNumber(ticketStats.urgentTickets, 0),
      urgentIncidencias: safeNumber(ticketStats.urgentTickets, 0),
      highPriorityTickets: safeNumber(ticketStats.urgentTickets, 0),

      totalInvoices,
      invoicesTotal: totalInvoices,
      facturasTotal: totalInvoices,
      totalFacturas: totalInvoices,
      invoicesCount: totalInvoices,
      facturasCount: totalInvoices,

      paidInvoices: safeNumber(facturaStats.paidInvoices, 0),
      paidFacturas: safeNumber(facturaStats.paidInvoices, 0),
      facturasPagadas: safeNumber(facturaStats.paidInvoices, 0),

      pendingInvoices: safeNumber(facturaStats.pendingInvoices, 0),
      pendingFacturas: safeNumber(facturaStats.pendingInvoices, 0),
      facturasPendientes: safeNumber(facturaStats.pendingInvoices, 0),
      invoicesPending: safeNumber(facturaStats.pendingInvoices, 0),

      overdueInvoices: safeNumber(facturaStats.overdueInvoices, 0),
      overdueFacturas: safeNumber(facturaStats.overdueInvoices, 0),
      facturasVencidas: safeNumber(facturaStats.overdueInvoices, 0),

      invoiceAmount: safeNumber(facturaStats.invoiceAmount, 0),
      paidInvoiceAmount: safeNumber(facturaStats.paidInvoiceAmount, facturaStats.invoiceAmount),
      pendingInvoiceAmount: safeNumber(facturaStats.pendingInvoiceAmount, 0),
      grossInvoiceAmount: safeNumber(facturaStats.grossInvoiceAmount, facturaStats.invoiceAmount),

      billingTotal: safeNumber(facturaStats.invoiceAmount, 0),
      totalBilling: safeNumber(facturaStats.invoiceAmount, 0),
      totalFacturado: safeNumber(facturaStats.invoiceAmount, 0),
      importeFacturas: safeNumber(facturaStats.invoiceAmount, 0),
      facturacionVisible: safeNumber(facturaStats.invoiceAmount, 0),

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

      attachmentsCount: safeNumber(ticketStats.attachmentsCount, 0),
      filesCount: safeNumber(ticketStats.filesCount, 0),
      adjuntosCount: safeNumber(ticketStats.adjuntosCount, 0),

      updatedAt: nowIso(),
    },
    admin
  );
}

function buildWidgets(summary = {}, admin = false) {
  const common = [
    {
      id: admin ? "incidencias" : "mis-incidencias",
      widgetId: admin ? "incidencias" : "mis-incidencias",
      key: admin ? "incidencias" : "mis-incidencias",
      title: admin ? "Incidencias" : "Mis incidencias",
      description: admin ? "Tickets visibles en el panel." : "Tus solicitudes visibles.",
      value: safeNumber(summary.totalTickets, 0),
      subtitle: `${safeNumber(summary.activeTickets, 0)} abiertas o en seguimiento`,
      type: "tickets",
      kind: "metric",
      status: "active",
      route: INCIDENCIAS_ROUTE,
      href: INCIDENCIAS_ROUTE,
    },
    {
      id: admin ? "facturas" : "mis-facturas",
      widgetId: admin ? "facturas" : "mis-facturas",
      key: admin ? "facturas" : "mis-facturas",
      title: admin ? "Facturas" : "Mis facturas",
      description: admin ? "Facturas visibles y volumen pagado." : "Facturación visible para tu cuenta.",
      value: safeNumber(summary.totalInvoices, 0),
      subtitle: `${safeNumber(summary.pendingInvoices, 0)} pendientes`,
      type: "invoices",
      kind: "metric",
      status: safeNumber(summary.pendingInvoices, 0) > 0 ? "warning" : "active",
      route: FACTURAS_ROUTE,
      href: FACTURAS_ROUTE,
    },
    {
      id: "facturas-totales",
      widgetId: "facturas-totales",
      key: "facturas-totales",
      title: "Facturas totales",
      description: "Importe total pagado.",
      value: safeNumber(summary.invoiceAmount, 0),
      subtitle: `${safeNumber(summary.paidInvoices, 0)} pagadas`,
      type: "invoices",
      kind: "metric",
      status: "active",
      route: FACTURAS_ROUTE,
      href: FACTURAS_ROUTE,
    },
  ];

  if (!admin) {
    return normalizeHomeWidgets(common);
  }

  return normalizeHomeWidgets([
    ...common,
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
      route: CLIENTES_ROUTE,
      href: CLIENTES_ROUTE,
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
      route: USUARIOS_ROUTE,
      href: USUARIOS_ROUTE,
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

  for (const ticket of safeArray(tickets).slice(0, HOME_ACTIVITY_LIMIT)) {
    const id = getTicketId(ticket);

    activity.push({
      type: "ticket",
      title: safeText(first(ticket.subject, ticket.title, ticket.asunto), "Incidencia"),
      text: id ? `Incidencia ${id}` : "Incidencia actualizada.",
      date: first(ticket.updatedAt, ticket.lastUpdateAt, ticket.lastActivityAt, ticket.createdAt),
      route: INCIDENCIAS_ROUTE,
      action: "open_ticket_detail",
      entityId: id,
      ticketId: id,
      incidenciaId: id,
    });
  }

  for (const invoice of safeArray(invoices).slice(0, HOME_ACTIVITY_LIMIT)) {
    const id = getInvoiceId(invoice);

    activity.push({
      type: "invoice",
      title: id ? `Factura ${id}` : "Factura",
      text: "Factura registrada o actualizada.",
      date: first(invoice.updatedAt, invoice.createdAt, invoice.date),
      route: FACTURAS_ROUTE,
      action: "navigate_home",
      entityId: id,
      invoiceId: id,
      facturaId: id,
    });
  }

  if (admin) {
    for (const client of safeArray(clients).slice(0, HOME_ACTIVITY_LIMIT)) {
      const id = getClientId(client);

      activity.push({
        type: "client",
        title: firstVisual([client.displayName, client.name, client.nombre, client.razonSocial, client.company], "Cliente"),
        text: "Cliente disponible en el panel.",
        date: first(client.updatedAt, client.createdAt),
        route: CLIENTES_ROUTE,
        action: "navigate_home",
        entityId: id,
      });
    }

    for (const user of safeArray(users).slice(0, HOME_ACTIVITY_LIMIT)) {
      const id = getUserId(user);

      activity.push({
        type: "user",
        title: firstVisual([user.displayName, user.fullName, user.name, user.nombre, user.username], "Usuario"),
        text: "Usuario disponible en el sistema.",
        date: first(user.updatedAt, user.createdAt, user.lastLoginAt),
        route: USUARIOS_ROUTE,
        action: "navigate_home",
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
      .slice(0, HOME_ACTIVITY_LIMIT),
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
      message: redact(result.error?.message || "Módulo no disponible."),
      soft: Boolean(result.soft),
    });
  }

  return errors;
}

function moduleStatus(result = null, endpoint = "") {
  return {
    skipped: result?.skipped === true,
    listOk: result?.ok === true,
    status: result?.status || 0,
    endpoint: result?.skipped === true ? "" : endpoint,
    soft: result?.soft === true,
  };
}

function sanitizeDashboardForRole(dashboard = {}, role = getCurrentRole()) {
  const cleanRole = normalizeRole(role, "") || "user";
  const admin = cleanRole === "admin";
  const source = safeObject(dashboard);

  const summary = sanitizeSummaryForRole(
    first(
      source.summary,
      source.stats,
      source.metrics,
      source.totals,
      source.counts,
      {}
    ),
    admin
  );

  const widgets = filterWidgetsForRole(
    normalizeHomeWidgets(
      first(
        source.widgets,
        source.cards,
        source.kpis,
        source.blocks,
        []
      )
    ),
    admin
  );

  const invoices = projectList(
    first(source.invoices, source.facturas, []),
    invoicePreview,
    (item) => item.facturaId || item.invoiceId || item.id
  );

  const rawUsers = admin ? first(source.users, source.usuarios, []) : [];

  const users = admin
    ? projectList(rawUsers, userPreview, (item) => item.userId || item.id)
    : [];

  const clients = admin
    ? projectList(first(source.clients, source.clientes, source.customers, []), clientPreview, (item) => item.clienteId || item.id)
    : [];

  const usersLookup = buildUsersLookup(
    rawUsers,
    users,
    source.currentUser,
    source.user,
    source.sidebarUser,
    getCurrentUser()
  );

  const tickets = projectList(
    first(source.tickets, source.incidencias, []),
    (item) => ticketPreview(enrichTicketTechnicianFromUsers(item, usersLookup)),
    (item) => item.ticketId || item.incidenciaId || item.id
  );

  const activity = filterActivityForRole(
    normalizeHomeActivityList(
      first(
        source.activity,
        source.activities,
        source.recent,
        source.recentActivity,
        []
      )
    ).slice(0, HOME_ACTIVITY_LIMIT),
    admin
  );

  const updatedAt = safeText(first(source.updatedAt, source.generatedAt, source.meta?.updatedAt, nowIso()), nowIso());
  const requestId = safeText(first(source.requestId, source.meta?.requestId, ""), "");

  return sanitizeDashboardObject({
    ok: source.ok !== false,
    success: source.success !== false,

    source: safeText(source.source, admin ? "home-admin-list-aggregate" : "home-user-list-aggregate"),
    version: HOME_API_VERSION,

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

    tickets,
    incidencias: tickets,

    invoices,
    facturas: invoices,

    users,
    usuarios: users,

    clients,
    clientes: clients,
    customers: clients,

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,

    modules: safeObject(source.modules),

    partial: Boolean(source.partial),
    errors: safeArray(source.errors).map((error) => ({
      module: safeText(error?.module, ""),
      kind: safeText(error?.kind, ""),
      status: safeNumber(error?.status, 0),
      code: safeText(error?.code, ""),
      message: redact(error?.message || ""),
      soft: Boolean(error?.soft),
    })),

    requestId,
    updatedAt,
    generatedAt: updatedAt,

    ticketsTotal: safeNumber(summary.totalTickets, tickets.length),
    incidenciasTotal: safeNumber(summary.totalTickets, tickets.length),
    totalTickets: safeNumber(summary.totalTickets, tickets.length),
    totalIncidencias: safeNumber(summary.totalTickets, tickets.length),
    ticketsCount: safeNumber(summary.totalTickets, tickets.length),
    incidenciasCount: safeNumber(summary.totalTickets, tickets.length),
    visibleTicketsCount: tickets.length,
    visibleIncidenciasCount: tickets.length,

    invoicesTotal: safeNumber(summary.totalInvoices, invoices.length),
    facturasTotal: safeNumber(summary.totalInvoices, invoices.length),
    totalInvoices: safeNumber(summary.totalInvoices, invoices.length),
    totalFacturas: safeNumber(summary.totalInvoices, invoices.length),
    invoicesCount: safeNumber(summary.totalInvoices, invoices.length),
    facturasCount: safeNumber(summary.totalInvoices, invoices.length),
    visibleInvoicesCount: invoices.length,
    visibleFacturasCount: invoices.length,

    usersTotal: admin ? summary.usersCount : 0,
    usuariosTotal: admin ? summary.usuariosCount : 0,
    totalUsers: admin ? summary.usersCount : 0,
    totalUsuarios: admin ? summary.usuariosCount : 0,
    usersCount: admin ? summary.usersCount : 0,
    usuariosCount: admin ? summary.usuariosCount : 0,
    visibleUsersCount: admin ? users.length : 0,
    visibleUsuariosCount: admin ? users.length : 0,

    clientsTotal: admin ? summary.clientsCount : 0,
    clientesTotal: admin ? summary.clientesCount : 0,
    customersTotal: admin ? summary.customersCount : 0,
    totalClients: admin ? summary.clientsCount : 0,
    totalClientes: admin ? summary.clientesCount : 0,
    totalCustomers: admin ? summary.customersCount : 0,
    clientsCount: admin ? summary.clientsCount : 0,
    clientesCount: admin ? summary.clientesCount : 0,
    customersCount: admin ? summary.customersCount : 0,
    visibleClientsCount: admin ? clients.length : 0,
    visibleClientesCount: admin ? clients.length : 0,
    visibleCustomersCount: admin ? clients.length : 0,

    activityCount: activity.length,
    recentCount: activity.length,
    visibleActivityCount: activity.length,

    meta: {
      ...safeObject(source.meta),

      requestId,
      role: cleanRole,
      admin,

      updatedAt,
      generatedAt: updatedAt,

      widgetsCount: widgets.length,

      ticketsCount: safeNumber(summary.totalTickets, tickets.length),
      incidenciasCount: safeNumber(summary.totalTickets, tickets.length),
      visibleTicketsCount: tickets.length,
      visibleIncidenciasCount: tickets.length,

      invoicesCount: safeNumber(summary.totalInvoices, invoices.length),
      facturasCount: safeNumber(summary.totalInvoices, invoices.length),
      visibleInvoicesCount: invoices.length,
      visibleFacturasCount: invoices.length,

      usersCount: admin ? summary.usersCount : 0,
      usuariosCount: admin ? summary.usuariosCount : 0,
      visibleUsersCount: admin ? users.length : 0,
      visibleUsuariosCount: admin ? users.length : 0,

      clientsCount: admin ? summary.clientsCount : 0,
      clientesCount: admin ? summary.clientesCount : 0,
      customersCount: admin ? summary.customersCount : 0,
      visibleClientsCount: admin ? clients.length : 0,
      visibleClientesCount: admin ? clients.length : 0,
      visibleCustomersCount: admin ? clients.length : 0,

      activityCount: activity.length,
      recentCount: activity.length,
    },
  });
}

function buildDashboardFromModules(modules = {}, meta = {}) {
  const role = normalizeRole(first(meta.role, getCurrentRole()), "") || "user";
  const admin = role === "admin";

  const facturas = normalizeFacturasModule(modules.facturas?.data);
  const rawUsers = admin
    ? extractCollection(modules.users?.data, ["users", "usuarios", "members"]).items
    : [];

  const users = admin
    ? normalizeUsersModule(modules.users?.data)
    : normalizeUsersModule(null);

  const clientes = admin
    ? normalizeClientesModule(modules.clientes?.data)
    : normalizeClientesModule(null);

  const tickets = normalizeTicketsModule(modules.tickets?.data, {
    users: users.items,
    rawUsers,
    contextUsers: [meta.currentUser, meta.user, meta.sidebarUser],
  });

  const summary = buildSummaryFromModules({
    tickets,
    facturas,
    clientes,
    users,
    admin,
  });

  const widgets = filterWidgetsForRole(
    buildWidgets(summary, admin),
    admin
  );

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
        tickets: moduleStatus(modules.tickets, ENDPOINTS.ticketsList),
        facturas: moduleStatus(modules.facturas, ENDPOINTS.facturasList),
        clientes: moduleStatus(modules.clientes, admin ? ENDPOINTS.clientesList : ""),
        users: moduleStatus(modules.users, admin ? ENDPOINTS.usersList : ""),
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
    },
    role
  );
}

/* =========================================================
   PUBLIC NORMALIZATION
========================================================= */

function moduleHasPayload(module = null) {
  if (!isObject(module)) return false;

  return (
    Object.prototype.hasOwnProperty.call(module, "data") ||
    Object.prototype.hasOwnProperty.call(module, "payload") ||
    Object.prototype.hasOwnProperty.call(module, "result") ||
    Object.prototype.hasOwnProperty.call(module, "response") ||
    Object.prototype.hasOwnProperty.call(module, "body")
  );
}

function modulesHavePayload(modules = {}) {
  const source = safeObject(modules);

  return Boolean(
    moduleHasPayload(source.tickets) ||
      moduleHasPayload(source.facturas) ||
      moduleHasPayload(source.clientes) ||
      moduleHasPayload(source.users)
  );
}

export function normalizeDashboard(payload = null, options = {}) {
  const unwrapped = unwrapResponse(payload);
  const object = safeObject(unwrapped, {});

  const role =
    normalizeRole(
      first(
        options.role,
        object.role,
        object.rol,
        object.roles,
        object.meta?.role,
        object.meta?.rol,
        object.meta?.roles,
        object.dashboard?.role,
        object.dashboard?.rol,
        object.dashboard?.roles,
        object.dashboard?.meta?.role,
        ""
      ),
      ""
    ) || getCurrentRole();

  if (object.dashboard && hasOwnKeys(object.dashboard)) {
    const dashboard = safeObject(object.dashboard);

    if (dashboard.modules && modulesHavePayload(dashboard.modules)) {
      return sanitizeDashboardForRole(
        buildDashboardFromModules(dashboard.modules, {
          ...safeObject(dashboard.meta),
          ...safeObject(object.meta),
          requestId: first(dashboard.requestId, object.requestId, ""),
          role,
        }),
        role
      );
    }

    return sanitizeDashboardForRole(dashboard, role);
  }

  if (object.modules && modulesHavePayload(object.modules)) {
    return sanitizeDashboardForRole(
      buildDashboardFromModules(object.modules, {
        ...safeObject(object.meta),
        ...safeObject(object),
        role,
      }),
      role
    );
  }

  return sanitizeDashboardForRole(object, role);
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
    recent: dashboard.activity,
    recentActivity: dashboard.activity,

    requestId: dashboard.requestId || dashboard.meta?.requestId || "",
    lastSyncAt: dashboard.updatedAt || dashboard.generatedAt || nowIso(),

    meta: dashboard.meta,
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
  error.modules = {
    tickets: moduleStatus(tickets, ENDPOINTS.ticketsList),
    facturas: moduleStatus(facturas, ENDPOINTS.facturasList),
  };

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
  const role = getCurrentRole();
  const admin = role === "admin";

  const includeUsersModule = canRequestUsersModule({ includeUsers });
  const includeClientesModule = canRequestClientsModule({ includeClientes, includeClients });
  const listParams = mergeParams(DEFAULT_LIST_PARAMS, params);

  runtime.lastRequestAt = nowIso();

  const [ticketsList, facturasList, clientesList, usersList] = await Promise.all([
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
    role,
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

    meta: {
      requestId,
      role,
      admin,
      includeUsers: includeUsersModule,
      includeClientes: includeClientesModule,
      partial: dashboard.partial,
      errorsCount: safeArray(dashboard.errors).length,
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

  if (!hasOwnKeys(raw)) return null;

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
    recent: dashboard.activity,
    recentActivity: dashboard.activity,

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
  timeout = HOME_TIMEOUT,
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
      timeout,
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
        return normalizeDashboard(cached.dashboard, {
          role: getCurrentRole(),
        });
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
    noAuthHeader: false,
    cache: "no-store",
    timeout: safeNumber(options.timeout, HOME_TIMEOUT),
    params: options.params || options.query || undefined,
    query: options.query || options.params || undefined,
    storeError: false,
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

  return redact(
    safeText(
      first(
        error?.response?.data?.message,
        error?.data?.message,
        error?.message,
        fallback
      ),
      fallback
    )
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

/* =========================================================
   SNAPSHOT
========================================================= */

function runtimeSnapshot() {
  const snap = sanitizeDashboardObject(clone(runtime, {}));

  if (snap?.lastError) {
    snap.lastError = {
      ...snap.lastError,
      message: redact(snap.lastError.message || ""),
    };
  }

  return snap;
}

export function getHomeApiClient() {
  return CoreHttp || null;
}

export function getHomeApiSnapshot() {
  const rawDashboard = safeObject(homeState?.dashboard);
  const dashboard = normalizeDashboard(rawDashboard, {
    role: getCurrentRole(),
  });

  const admin = dashboard.role === "admin";

  const routes = Object.fromEntries(
    Object.entries({
      incidencias: INCIDENCIAS_ROUTE,
      facturas: FACTURAS_ROUTE,
      clientes: CLIENTES_ROUTE,
      usuarios: USUARIOS_ROUTE,
    }).filter(([, route]) => Boolean(route))
  );

  return {
    version: HOME_API_VERSION,
    source: "views.home.api",

    endpoints: {
      dashboard: HOME_DASHBOARD_ENDPOINT,
      legacyDashboard: HOME_DASHBOARD_LEGACY_ENDPOINT,
      ticketsList: ENDPOINTS.ticketsList,
      facturasList: ENDPOINTS.facturasList,
      clientesList: ENDPOINTS.clientesList,
      usersList: ENDPOINTS.usersList,
    },

    routes,

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

    runtime: runtimeSnapshot(),
    loadSeq,

    dashboard: {
      hasDashboard: hasOwnKeys(rawDashboard),
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
      error: redact(homeState?.error || ""),
    },

    policy: {
      apiOnly: true,
      singleHttpLayer: true,
      noFetch: true,
      noStoragePersistent: true,
      noEvents: true,
      noRouter: true,

      noDashboardEndpoint: true,
      noStatsEndpoints: true,

      usersOnlyAdmin: true,
      clientesOnlyAdmin: true,
      distinctUserAdminHome: true,
      roleAwareCache: true,

      routesFromConfig: true,
      adminRoutesFromConfig: true,
      blockedRoutesFromConfig: true,

      projectsLargeBackendObjectsToLightHomeDTO: true,
      preservesTicketInvoiceRelations: true,
      preservesTicketTechnicianData: true,
      resolvesTechnicianAvatarFromUsers: true,
      paidInvoiceAmountOnly: true,

      noRawBackendPayloadInDashboard: true,
      stripsCosmosMetadata: true,
      noEmailAsUserIdentity: true,
      noEmailAsClientIdentity: true,

      coreModulesRequired: true,
      noHomeRoute: true,
      snapshotRedacted: true,
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
  getHomeDashboardRequest,
  getHomeWidgetByIdRequest,

  hydrateHomeFromCache,

  loadHomeDashboard,
  refreshHomeDashboard,

  getHomeApiSnapshot,
});

export default HomeApi;
