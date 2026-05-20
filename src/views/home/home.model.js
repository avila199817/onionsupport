/* =========================================================
   Onion Support - Home Model
   Archivo: /src/views/home/home.model.js

   Responsabilidad:
   - Modelo puro de datos para Home.
   - Normalizar dashboard construido desde listas reales.
   - Normalizar widgets, tickets, facturas, usuarios,
     clientes y actividad.
   - Generar summary estable desde colecciones.
   - Generar widgets fallback desde summary.
   - Generar actividad desde colecciones.
   - Paginar filas.
   - Buscar entidades por id.
   - Rutas base desde core/config.js.
   - No conservar raw/payload/response/data backend.
   - No usar email como identidad de user/cliente.
   - User nunca conserva métricas/colecciones admin.
   - Sin AppCore.
   - Sin Router.
   - Sin Auth.
   - Sin HTTP.
   - Sin Storage.
   - Sin DOM.
   - Sin CSS.
   - Sin rutas inventadas.
   - Sin /home.
========================================================= */

import { ROUTES } from "../../core/config.js";

export const HOME_MODEL_VERSION = "home.model.v4";

export const DEFAULT_HOME_PAGE = 1;
export const DEFAULT_HOME_PAGE_SIZE = 5;
export const DEFAULT_HOME_RECENT_LIMIT = 8;

export const HOME_ENTITY_TYPES = Object.freeze({
  WIDGET: "widget",
  TICKET: "ticket",
  INVOICE: "invoice",
  USER: "user",
  CLIENT: "client",
  ACTIVITY: "activity",
});

export const HOME_STATUS_KEYS = Object.freeze({
  PENDING: "pending",
  OPEN: "open",
  PROGRESS: "progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

export const HOME_INVOICE_STATUS_KEYS = Object.freeze({
  PAID: "paid",
  PENDING: "pending",
  OVERDUE: "overdue",
  PARTIAL: "partial",
  CANCELLED: "cancelled",
  DRAFT: "draft",
});

const RAW_KEYS = new Set([
  "raw",
  "response",
  "payload",
  "data",
  "body",
]);

const COSMOS_META_KEYS = new Set([
  "_id",
  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|otp|totp|mfa|2fa|backupCode|backup_code|sessionId|session_id|email|correo|phone|telefono|teléfono|address|direccion|dirección|nif|dni/i;

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=/i;

const EMAIL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/gi;

const ADMIN_ENTITY_RE =
  /(^|[\s._/-])(clientes?|clients?|customers?|usuarios?|users?|members?|directorio|directory)([\s._/-]|$)/i;

/* =========================================================
   SAFE HELPERS
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

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeNumber(value, fallback = 0) {
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

function hasKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
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
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(EMAIL_RE, "");
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeHomeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeRole(value = "", fallback = "user") {
  if (Array.isArray(value)) {
    const roles = value
      .map((item) => normalizeRole(item, ""))
      .filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return fallback;
  }

  const role = String(value || "").toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return fallback;
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function isEmailLike(value = "") {
  const text = safeText(value, "");
  return Boolean(text && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i.test(text));
}

function visualText(value = "", fallback = "Sin nombre") {
  const text = redact(safeText(value, ""));

  if (!text) return fallback;
  if (isEmailLike(text)) return fallback;

  return text;
}

function firstVisual(values = [], fallback = "Sin nombre") {
  for (const value of safeArray(values)) {
    const text = safeText(value, "");

    if (!text || isEmailLike(text)) continue;

    return redact(text) || fallback;
  }

  return fallback;
}

function safePublicId(value = "") {
  const text = safeText(value, "");

  if (!text) return "";
  if (isEmailLike(text)) return "";
  if (hasSensitiveQuery(text)) return "";
  if (/Bearer\s+/i.test(text)) return "";
  if (SENSITIVE_KEY_RE.test(text) && text.length > 80) return "";

  return redact(text);
}

function sanitizeHomeValue(value, keyHint = "") {
  if (RAW_KEYS.has(keyHint)) return undefined;
  if (COSMOS_META_KEYS.has(keyHint)) return undefined;
  if (isSensitiveKey(keyHint)) return undefined;

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeHomeValue(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (RAW_KEYS.has(key)) continue;
      if (COSMOS_META_KEYS.has(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizeHomeValue(item, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return value;
}

function sanitizeHomeRecord(value = {}) {
  return safeObject(sanitizeHomeValue(value), {});
}

function sanitizeHomeList(items = []) {
  return safeArray(items)
    .map((item) => sanitizeHomeRecord(item))
    .filter(hasKeys);
}

function hasSensitiveQuery(value = "") {
  return SENSITIVE_QUERY_RE.test(String(value || ""));
}

function normalizeHashPath(value = "") {
  const raw = safeText(value, "");

  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
  if (raw.startsWith("#/")) return raw.slice(1) || "/";

  return raw;
}

function safeRoute(value = "", fallback = "") {
  let raw = normalizeHashPath(value || "");

  if (!raw) return fallback;
  if (raw === "#") return fallback;
  if (raw.startsWith("#") && !raw.startsWith("#/") && !raw.startsWith("#!")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (/[\r\n\t\\]/.test(raw)) return fallback;
  if (hasSensitiveQuery(raw)) return fallback;

  const lower = raw.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("file:") ||
    lower.startsWith("blob:") ||
    /^https?:\/\//i.test(raw)
  ) {
    return fallback;
  }

  if (!raw.startsWith("/")) raw = `/${raw}`;

  const hashIndex = raw.indexOf("#");
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;

  const queryIndex = withoutHash.indexOf("?");
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  let cleanPath = path
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!cleanPath.startsWith("/")) cleanPath = `/${cleanPath}`;

  if (cleanPath.length > 1) {
    cleanPath = cleanPath.replace(/\/+$/g, "") || "/";
  }

  if (cleanPath === "/home") return fallback;
  if (cleanPath === "/incidencias/nueva") return fallback;
  if (cleanPath.startsWith("/incidencias/nueva/")) return fallback;

  return `${cleanPath}${query}${hash}`;
}

function routeFromCore(name = "", fallback = "") {
  return safeRoute(ROUTES?.[name], "") || safeRoute(fallback, "");
}

const HOME_ROUTES = Object.freeze({
  INCIDENCIAS: routeFromCore("incidencias", "/incidencias"),
  FACTURAS: routeFromCore("facturas", "/facturas"),
  CLIENTES: routeFromCore("clientes", "/clientes"),
  USUARIOS: routeFromCore("usuarios", ""),
});

function routePath(route = "") {
  return safeRoute(route, "").split("?")[0].split("#")[0] || "";
}

function isAdminOnlyRoute(route = "") {
  const path = routePath(route);
  const clientes = routePath(HOME_ROUTES.CLIENTES);
  const usuarios = routePath(HOME_ROUTES.USUARIOS);

  if (!path) return false;

  return (
    Boolean(clientes && (path === clientes || path.startsWith(`${clientes}/`))) ||
    Boolean(usuarios && (path === usuarios || path.startsWith(`${usuarios}/`)))
  );
}

function isAdminEntityValue(value = "") {
  return ADMIN_ENTITY_RE.test(String(value || "").toLowerCase());
}

function safeImageSrc(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";

  if (raw.startsWith("/") && !raw.startsWith("//") && !hasSensitiveQuery(raw)) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw) && !hasSensitiveQuery(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const esDate = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (esDate) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esDate;

    const date = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss)
    );

    const time = date.getTime();

    return Number.isNaN(time) ? 0 : time;
  }

  const date = new Date(raw.includes("T") || raw.includes("Z") ? raw : `${raw}T00:00:00`);
  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => safePublicId(value))
        .filter(Boolean)
    ),
  ];
}

export function uniqueHomeBy(items = [], picker = (item) => item) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const raw = safePublicId(picker(item));
    const key = raw ? normalizeHomeKey(raw) : "";

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

function sortByNewest(items = [], picker = (item) => item?.updatedAt || item?.createdAt) {
  return [...safeArray(items)].sort((a, b) => {
    const left = toTimestamp(picker(a));
    const right = toTimestamp(picker(b));

    if (right !== left) return right - left;

    return safeText(first(b?.id, b?.ticketId, b?.invoiceId, ""), "").localeCompare(
      safeText(first(a?.id, a?.ticketId, a?.invoiceId, ""), ""),
      "es-ES",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  });
}

function maxNumber(...values) {
  const numbers = values
    .map((value) => safeNumber(value, NaN))
    .filter(Number.isFinite);

  return numbers.length ? Math.max(...numbers) : 0;
}

/* =========================================================
   ROLE SANITIZE
========================================================= */

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

  return sanitizeHomeRecord(output);
}

function isAdminOnlyActivity(item = {}) {
  const raw = safeObject(item);
  const type = normalizeHomeKey(first(raw.type, raw.kind, raw.category, ""));
  const route = safeRoute(first(raw.route, raw.href, raw.link, raw.to, ""), "");

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
    ["client", "cliente", "customer", "user", "usuario", "member"].includes(type) ||
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
  const route = safeRoute(first(raw.route, raw.href, raw.link, raw.to, ""), "");

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

/* =========================================================
   ENVELOPES / COLLECTIONS
========================================================= */

export function looksLikeHomeDashboard(value = null) {
  const object = safeObject(value, null);

  if (!object) return false;

  return Boolean(
    "dashboard" in object ||
      "summary" in object ||
      "stats" in object ||
      "metrics" in object ||
      "totals" in object ||
      "counts" in object ||
      "widgets" in object ||
      "cards" in object ||
      "tickets" in object ||
      "incidencias" in object ||
      "facturas" in object ||
      "invoices" in object ||
      "users" in object ||
      "usuarios" in object ||
      "clients" in object ||
      "clientes" in object ||
      "customers" in object ||
      "activity" in object ||
      "recent" in object ||
      "totalTickets" in object ||
      "facturasTotal" in object
  );
}

export function unwrapHomeEnvelope(payload = null, depth = 0) {
  if (payload === null || payload === undefined) return null;
  if (depth > 6) return payload;
  if (Array.isArray(payload)) return payload;

  const object = safeObject(payload, null);

  if (!object) return payload;
  if (looksLikeHomeDashboard(object)) return object;

  const nested = first(
    object.dashboard,
    object.home,
    object.data,
    object.payload,
    object.result,
    object.response,
    object.body
  );

  if (nested !== null && nested !== undefined) {
    return unwrapHomeEnvelope(nested, depth + 1);
  }

  return object;
}

export function normalizeHomeCollectionSource(value = null, aliases = []) {
  if (Array.isArray(value)) {
    return {
      items: value,
      visibleCount: value.length,
      total: value.length,
      totalCount: value.length,
      remoteCount: value.length,
    };
  }

  const object = safeObject(value, null);

  if (!object) {
    return {
      items: [],
      visibleCount: 0,
      total: 0,
      totalCount: 0,
      remoteCount: 0,
    };
  }

  let items = safeArray(
    first(
      object.items,
      object.rows,
      object.records,
      object.results,
      object.docs,
      object.documents,
      object.value,
      object.list,
      Array.isArray(object.data) ? object.data : null,
      Array.isArray(object.payload) ? object.payload : null,
      Array.isArray(object.result) ? object.result : null,
      Array.isArray(object.response) ? object.response : null,
      []
    )
  );

  if (!items.length) {
    for (const alias of safeArray(aliases)) {
      const candidate = object?.[alias];

      if (Array.isArray(candidate)) {
        items = candidate;
        break;
      }

      if (isObject(candidate)) {
        const nested = normalizeHomeCollectionSource(candidate, aliases);

        if (nested.items.length || nested.remoteCount > 0) {
          items = nested.items;
          break;
        }
      }
    }
  }

  const total = Math.max(
    items.length,
    safeNumber(
      first(
        object.total,
        object.count,
        object.totalCount,
        object.remoteCount,
        object.meta?.total,
        object.meta?.count,
        object.meta?.totalCount,
        object.pagination?.total,
        object.pagination?.totalCount,
        items.length
      ),
      items.length
    )
  );

  return {
    items,
    visibleCount: items.length,
    total,
    totalCount: total,
    remoteCount: total,
  };
}

export function pickHomeCollectionBlock(source = {}, aliases = []) {
  const raw = safeObject(source);

  const sources = [
    raw,
    raw.collections,
    raw.resources,
    raw.lists,
    raw.dashboard,
    raw.home,
    raw.data,
    raw.payload,
    raw.result,
    raw.response,
  ].filter(hasKeys);

  for (const candidate of sources) {
    for (const alias of safeArray(aliases)) {
      const direct = candidate?.[alias];

      if (Array.isArray(direct)) {
        return normalizeHomeCollectionSource(direct, aliases);
      }

      if (isObject(direct)) {
        const normalized = normalizeHomeCollectionSource(direct, aliases);

        if (normalized.items.length || normalized.remoteCount > 0) {
          return normalized;
        }
      }
    }
  }

  return {
    items: [],
    visibleCount: 0,
    total: 0,
    totalCount: 0,
    remoteCount: 0,
  };
}

/* =========================================================
   TICKETS
========================================================= */

export function getHomeTicketId(item = {}) {
  if (typeof item === "string" || typeof item === "number") {
    return safePublicId(item);
  }

  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.code,
      raw.numero,
      raw.ticketCode,
      raw.entityId,
      raw.id
    )
  );
}

export function getHomeTicketIdentities(item = {}) {
  const raw = safeObject(item);

  return uniqueStrings([
    raw.ticketId,
    raw.incidenciaId,
    raw.code,
    raw.numero,
    raw.ticketCode,
    raw.entityId,
    raw.id,
  ]);
}

export function getHomeTicketSubject(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.subject,
      raw.title,
      raw.asunto,
      raw.name,
      raw.preview
    ),
    "Incidencia sin asunto"
  );
}

export function getHomeTicketDescription(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.description,
      raw.descripcion,
      raw.preview,
      raw.message,
      raw.body,
      raw.text
    ),
    "Sin descripción."
  );
}

export function getHomeTicketStatus(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.status,
      raw.estado,
      raw.state,
      raw.lifecycle?.status,
      "pending"
    ),
    "pending"
  );
}

export function getHomeTicketStatusKey(itemOrStatus = {}) {
  const status = typeof itemOrStatus === "string"
    ? itemOrStatus
    : getHomeTicketStatus(itemOrStatus);

  const key = normalizeHomeKey(status);

  if (["open", "opened", "abierta", "abierto"].includes(key)) return HOME_STATUS_KEYS.OPEN;
  if (["progress", "in_progress", "inprogress", "en_proceso", "working", "assigned"].includes(key)) return HOME_STATUS_KEYS.PROGRESS;
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return HOME_STATUS_KEYS.RESOLVED;
  if (["closed", "close", "cerrada", "cerrado", "cancelled", "canceled", "archived"].includes(key)) return HOME_STATUS_KEYS.CLOSED;

  return HOME_STATUS_KEYS.PENDING;
}

export function getHomeTicketStatusLabel(itemOrStatus = {}) {
  const key = getHomeTicketStatusKey(itemOrStatus);

  if (key === HOME_STATUS_KEYS.OPEN) return "Abierta";
  if (key === HOME_STATUS_KEYS.PROGRESS) return "En proceso";
  if (key === HOME_STATUS_KEYS.RESOLVED) return "Resuelta";
  if (key === HOME_STATUS_KEYS.CLOSED) return "Cerrada";

  return "Pendiente";
}

export function getHomeTicketPriority(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.priority,
      raw.prioridad,
      raw.severity,
      raw.urgency,
      raw.sla?.priority,
      "medium"
    ),
    "medium"
  );
}

export function getHomeTicketPriorityKey(item = {}) {
  const key = normalizeHomeKey(getHomeTicketPriority(item));

  if (["critical", "critica", "critico", "p0", "blocker"].includes(key)) return "critical";
  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) return "urgent";
  if (["low", "baja", "minor", "p3"].includes(key)) return "low";

  return "medium";
}

export function isHomeTicketOpenLike(item = {}) {
  return [HOME_STATUS_KEYS.OPEN, HOME_STATUS_KEYS.PENDING, HOME_STATUS_KEYS.PROGRESS].includes(getHomeTicketStatusKey(item));
}

export function isHomeTicketClosedLike(item = {}) {
  return [HOME_STATUS_KEYS.CLOSED, HOME_STATUS_KEYS.RESOLVED].includes(getHomeTicketStatusKey(item));
}

export function isHomeTicketUrgent(item = {}) {
  return ["urgent", "critical"].includes(getHomeTicketPriorityKey(item));
}

export function getHomeTicketCreatedAt(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.createdAt,
    raw.fechaCreacion,
    raw.createdAtES,
    raw.date,
    raw.fecha,
    raw.lifecycle?.createdAt
  );
}

export function getHomeTicketUpdatedAt(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.updatedAt,
    raw.lastUpdateAt,
    raw.ultimaNovedad,
    raw.modifiedAt,
    raw.closedAt,
    raw.createdAt,
    raw.lifecycle?.updatedAt,
    raw.lifecycle?.lastUpdateAt,
    raw.audit?.updatedAt
  );
}

export function getHomeTicketAttachmentsCount(item = {}) {
  const raw = safeObject(item);

  const attachments = first(
    raw.attachments,
    raw.files,
    raw.adjuntos,
    raw.documents
  );

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(
    first(
      raw.attachmentsCount,
      raw.filesCount,
      raw.adjuntosCount,
      raw.documentsCount,
      0
    ),
    0
  );
}

export function normalizeHomeTicket(item = {}) {
  const source = safeObject(item);
  const raw = sanitizeHomeRecord(source);

  const id = getHomeTicketId(source);
  const subject = getHomeTicketSubject(source);
  const description = getHomeTicketDescription(source);
  const status = getHomeTicketStatus(source);
  const priority = getHomeTicketPriority(source);

  const clientName = firstVisual(
    [
      source.clientName,
      source.clienteNombre,
      source.customerName,
      source.userName,
      source.requesterName,
      source.ownerName,
      source.requesterSnapshot?.name,
      source.requesterSnapshot?.displayName,
      source.cliente?.nombreContacto,
      source.cliente?.nombre,
      source.cliente?.name,
      source.client?.name,
      source.customer?.name,
      source.user?.name,
    ],
    subject
  );

  const avatar = safeImageSrc(
    first(
      source.clientAvatar,
      source.avatar,
      source.avatarUrl,
      source.avatar_url,
      source.userAvatar,
      source.requesterSnapshot?.avatar,
      source.requesterSnapshot?.avatarUrl,
      source.cliente?.avatar,
      source.cliente?.avatarUrl,
      source.client?.avatar,
      source.client?.avatarUrl,
      source.user?.avatar,
      source.user?.avatarUrl
    )
  );

  return sanitizeHomeRecord({
    ...raw,

    id: safeText(first(raw.id, id), id),

    ticketId: safeText(first(raw.ticketId, id), id),
    incidenciaId: safeText(first(raw.incidenciaId, id), id),

    code: safeText(first(raw.code, raw.ticketCode, id), id),
    ticketCode: safeText(first(raw.ticketCode, raw.code, id), id),

    subject,
    title: safeText(first(raw.title, raw.subject, subject), subject),
    asunto: safeText(first(raw.asunto, raw.subject, raw.title, subject), subject),

    description,
    descripcion: safeText(first(raw.descripcion, raw.description, description), description),
    message: safeText(first(raw.message, raw.description, raw.descripcion, description), description),

    status,
    estado: safeText(first(raw.estado, raw.status, status), status),
    state: safeText(first(raw.state, raw.status, status), status),

    statusKey: getHomeTicketStatusKey(status),
    statusLabel: getHomeTicketStatusLabel(status),

    priority,
    prioridad: safeText(first(raw.prioridad, raw.priority, priority), priority),
    priorityKey: getHomeTicketPriorityKey(source),

    clientName,
    clienteNombre: safeText(first(raw.clienteNombre, clientName), clientName),
    requesterName: safeText(first(raw.requesterName, clientName), clientName),

    clientAvatar: avatar,
    avatar,
    avatarUrl: avatar,

    category: safeText(first(raw.category, raw.categoria, raw.type, raw.tipo), "Soporte"),
    categoria: safeText(first(raw.categoria, raw.category, raw.type, raw.tipo), "Soporte"),
    type: safeText(first(raw.type, raw.tipo, raw.category, raw.categoria), "Soporte"),
    tipo: safeText(first(raw.tipo, raw.type, raw.category, raw.categoria), "Soporte"),

    createdAt: getHomeTicketCreatedAt(source),
    updatedAt: getHomeTicketUpdatedAt(source),
    lastUpdateAt: first(raw.lastUpdateAt, raw.updatedAt, getHomeTicketUpdatedAt(source)),

    attachmentsCount: getHomeTicketAttachmentsCount(source),
    filesCount: getHomeTicketAttachmentsCount(source),
    adjuntosCount: getHomeTicketAttachmentsCount(source),
  });
}

export function normalizeHomeTickets(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeTicket(item)),
      getHomeTicketId
    ),
    (item) => getHomeTicketUpdatedAt(item) || getHomeTicketCreatedAt(item)
  );
}

/* =========================================================
   INVOICES
========================================================= */

export function getHomeInvoiceId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.invoiceId,
      raw.facturaId,
      raw.number,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.numero,
      raw.invoiceNumber,
      raw.code,
      raw.id
    )
  );
}

export function getHomeInvoiceAmount(item = {}) {
  const raw = safeObject(item);

  return safeNumber(
    first(
      raw.total,
      raw.amount,
      raw.importe,
      raw.price,
      raw.subtotal,
      raw.base,
      raw.totalFactura,
      raw.importeTotal,
      raw.facturaTotal,
      raw.facturaImporte,
      raw.invoiceAmount,
      0
    ),
    0
  );
}

export function getHomeInvoiceStatusKey(item = {}) {
  const raw = safeObject(item);

  const key = normalizeHomeKey(
    first(
      raw.paymentStatus,
      raw.estadoPago,
      raw.status,
      raw.estado,
      "pending"
    )
  );

  if (["paid", "pagada", "pagado", "cobrada", "cobrado", "abonada"].includes(key)) return HOME_INVOICE_STATUS_KEYS.PAID;
  if (["overdue", "vencida", "vencido"].includes(key)) return HOME_INVOICE_STATUS_KEYS.OVERDUE;
  if (["partial", "parcial", "pago_parcial"].includes(key)) return HOME_INVOICE_STATUS_KEYS.PARTIAL;
  if (["cancelled", "canceled", "cancelada", "cancelado"].includes(key)) return HOME_INVOICE_STATUS_KEYS.CANCELLED;
  if (["draft", "borrador"].includes(key)) return HOME_INVOICE_STATUS_KEYS.DRAFT;

  return HOME_INVOICE_STATUS_KEYS.PENDING;
}

export function isHomeInvoicePendingLike(item = {}) {
  return [
    HOME_INVOICE_STATUS_KEYS.PENDING,
    HOME_INVOICE_STATUS_KEYS.OVERDUE,
    HOME_INVOICE_STATUS_KEYS.PARTIAL,
  ].includes(getHomeInvoiceStatusKey(item));
}

export function normalizeHomeInvoice(item = {}) {
  const source = safeObject(item);
  const raw = sanitizeHomeRecord(source);

  const id = getHomeInvoiceId(source);
  const amount = getHomeInvoiceAmount(source);

  const status = safeText(
    first(
      source.paymentStatus,
      source.estadoPago,
      source.status,
      source.estado,
      "pending"
    ),
    "pending"
  );

  const currency = safeText(
    first(source.currency, source.moneda, "EUR"),
    "EUR"
  ).toUpperCase();

  return sanitizeHomeRecord({
    ...raw,

    id: safeText(first(raw.id, id), id),

    invoiceId: safeText(first(raw.invoiceId, id), id),
    facturaId: safeText(first(raw.facturaId, id), id),

    numeroFacturaLegal: safeText(first(raw.numeroFacturaLegal, raw.numeroFactura, raw.invoiceNumber, raw.number, raw.numero, raw.code, id), id),
    numeroFactura: safeText(first(raw.numeroFactura, raw.numeroFacturaLegal, raw.number, raw.numero, id), id),
    invoiceNumber: safeText(first(raw.invoiceNumber, raw.numeroFacturaLegal, raw.number, raw.numero, id), id),
    number: safeText(first(raw.number, raw.numero, raw.code, id), id),
    numero: safeText(first(raw.numero, raw.number, raw.code, id), id),
    code: safeText(first(raw.code, raw.numero, raw.number, id), id),

    total: amount,
    amount,
    importe: amount,
    price: amount,
    totalFactura: amount,
    facturaTotal: amount,
    facturaImporte: amount,
    invoiceAmount: amount,

    currency,
    moneda: currency,

    paymentStatus: status,
    estadoPago: safeText(first(raw.estadoPago, raw.paymentStatus, status), status),
    status: safeText(first(raw.status, status), status),
    estado: safeText(first(raw.estado, raw.status, status), status),

    statusKey: getHomeInvoiceStatusKey(source),

    createdAt: first(source.createdAt, source.fechaCreacion, source.fechaFactura, source.issueDate, source.issuedAt, source.date),
    updatedAt: first(source.updatedAt, source.modifiedAt, source.fechaPago, source.fechaEnvio, source.sentAt, source.date),
  });
}

export function normalizeHomeInvoices(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeInvoice(item)),
      getHomeInvoiceId
    ),
    (item) => first(item.updatedAt, item.createdAt, item.date)
  );
}

/* =========================================================
   USERS / CLIENTS
========================================================= */

export function getHomeUserId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw.username
    )
  );
}

export function normalizeHomeUser(item = {}) {
  const source = safeObject(item);
  const raw = sanitizeHomeRecord(source);
  const id = getHomeUserId(source);

  const displayName = firstVisual(
    [
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      source.username,
      source.slug,
    ],
    "Usuario"
  );

  const role = normalizeRole(
    first(
      source.role,
      source.rol,
      source.type,
      source.roles,
      "user"
    )
  );

  const avatar = safeImageSrc(
    first(
      source.avatar,
      source.avatarUrl,
      source.avatar_url,
      source.photoURL,
      source.picture,
      source.profile?.avatar,
      source.profile?.avatarUrl
    )
  );

  return sanitizeHomeRecord({
    ...raw,

    id: safeText(first(raw.id, id), id),

    userId: safeText(first(raw.userId, id), id),
    usuarioId: safeText(first(raw.usuarioId, id), id),

    displayName,
    fullName: displayName,
    name: displayName,
    nombre: displayName,

    username: safeText(first(raw.username, id), id),

    role,
    rol: role,
    roles: [role],

    active: first(raw.active, raw.isActive, raw.enabled, true),
    isActive: first(raw.active, raw.isActive, raw.enabled, true),

    avatar,
    avatarUrl: avatar,

    createdAt: source.createdAt,
    updatedAt: first(source.updatedAt, source.modifiedAt, source.lastLoginAt),
  });
}

export function normalizeHomeUsers(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeUser(item)),
      getHomeUserId
    ),
    (item) => first(item.updatedAt, item.lastLoginAt, item.createdAt)
  );
}

export function getHomeClientId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.clientId,
      raw.clienteId,
      raw.customerId,
      raw.id
    )
  );
}

export function normalizeHomeClient(item = {}) {
  const source = safeObject(item);
  const raw = sanitizeHomeRecord(source);
  const id = getHomeClientId(source);

  const name = firstVisual(
    [
      source.name,
      source.nombre,
      source.displayName,
      source.razonSocial,
      source.company,
      source.nombreContacto,
    ],
    "Cliente"
  );

  return sanitizeHomeRecord({
    ...raw,

    id: safeText(first(raw.id, id), id),

    clientId: safeText(first(raw.clientId, id), id),
    clienteId: safeText(first(raw.clienteId, id), id),
    customerId: safeText(first(raw.customerId, id), id),

    name,
    nombre: safeText(first(raw.nombre, name), name),
    displayName: safeText(first(raw.displayName, name), name),
    razonSocial: safeText(first(raw.razonSocial, name), name),

    active: first(raw.active, raw.isActive, raw.enabled, true),
    isActive: first(raw.active, raw.isActive, raw.enabled, true),

    createdAt: source.createdAt,
    updatedAt: first(source.updatedAt, source.modifiedAt),
  });
}

export function normalizeHomeClients(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeClient(item)),
      getHomeClientId
    ),
    (item) => first(item.updatedAt, item.createdAt)
  );
}

/* =========================================================
   ACTIVITY
========================================================= */

export function getHomeActivityId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.activityId,
      raw.eventId,
      raw.entityId,
      raw.id,
      raw.ticketId,
      raw.incidenciaId,
      raw.facturaId,
      raw.invoiceId,
      raw.userId,
      raw.clienteId
    )
  );
}

export function normalizeHomeActivity(item = {}) {
  const source = safeObject(item);
  const raw = sanitizeHomeRecord(source);

  const type = safeText(
    first(source.type, source.kind, source.category, HOME_ENTITY_TYPES.ACTIVITY),
    HOME_ENTITY_TYPES.ACTIVITY
  );

  const title = firstVisual(
    [source.title, source.name, source.subject, source.label],
    "Actividad registrada"
  );

  const entityId = safePublicId(
    first(
      source.entityId,
      source.id,
      source.ticketId,
      source.incidenciaId,
      source.facturaId,
      source.invoiceId,
      source.userId,
      source.clienteId
    )
  );

  const route = safeRoute(first(source.route, source.href, source.link, source.to, ""), "");

  return sanitizeHomeRecord({
    ...raw,

    type,
    kind: safeText(first(raw.kind, type), type),
    category: safeText(first(raw.category, type), type),

    title,

    text: safeText(
      first(source.text, source.description, source.message, source.detail, source.preview),
      "Sin detalle adicional."
    ),

    date: first(source.date, source.createdAt, source.updatedAt, source.timestamp, nowIso()),

    route,
    href: safeRoute(first(source.href, source.route, source.link, source.to), route),

    action: normalizeHomeKey(first(source.action, "open_activity")),

    entityId,
    id: safeText(first(raw.id, entityId), entityId),
  });
}

export function normalizeHomeActivityList(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeActivity(item)),
      getHomeActivityId
    ),
    (item) => item.date || item.updatedAt || item.createdAt
  );
}

export function buildHomeActivityFromCollections({
  tickets = [],
  invoices = [],
  users = [],
  clients = [],
  limit = DEFAULT_HOME_RECENT_LIMIT,
} = {}) {
  const ticketActivity = normalizeHomeTickets(tickets)
    .slice(0, limit)
    .map((item) => {
      const ticketId = getHomeTicketId(item);

      return normalizeHomeActivity({
        type: HOME_ENTITY_TYPES.TICKET,
        title: getHomeTicketSubject(item),
        text: `Incidencia ${ticketId || "sin ID"} · ${getHomeTicketStatusLabel(item)}`,
        date: getHomeTicketUpdatedAt(item) || getHomeTicketCreatedAt(item),
        route: HOME_ROUTES.INCIDENCIAS,
        href: HOME_ROUTES.INCIDENCIAS,
        action: "open_ticket",
        entityId: ticketId,
      });
    });

  const invoiceActivity = normalizeHomeInvoices(invoices)
    .slice(0, 4)
    .map((item) => {
      const invoiceId = getHomeInvoiceId(item);

      return normalizeHomeActivity({
        type: HOME_ENTITY_TYPES.INVOICE,
        title: invoiceId ? `Factura ${invoiceId}` : "Factura registrada",
        text: `${getHomeInvoiceAmount(item).toFixed(2)} ${safeText(item.currency || item.moneda, "EUR")}`,
        date: first(item.updatedAt, item.modifiedAt, item.createdAt, item.date),
        route: HOME_ROUTES.FACTURAS,
        href: HOME_ROUTES.FACTURAS,
        action: "open_invoice",
        entityId: invoiceId,
      });
    });

  const clientActivity = normalizeHomeClients(clients)
    .slice(0, 3)
    .map((item) => {
      const clientId = getHomeClientId(item);

      return normalizeHomeActivity({
        type: HOME_ENTITY_TYPES.CLIENT,
        title: firstVisual([item.name, item.nombre, item.razonSocial, item.company], "Cliente"),
        text: "Cliente sincronizado en el panel.",
        date: first(item.updatedAt, item.createdAt),
        route: HOME_ROUTES.CLIENTES,
        href: HOME_ROUTES.CLIENTES,
        action: "open_client",
        entityId: clientId,
      });
    });

  const userActivity = HOME_ROUTES.USUARIOS
    ? normalizeHomeUsers(users)
        .slice(0, 3)
        .map((item) => {
          const userId = getHomeUserId(item);

          return normalizeHomeActivity({
            type: HOME_ENTITY_TYPES.USER,
            title: firstVisual([item.name, item.nombre, item.displayName, item.fullName, item.username], "Usuario"),
            text: "Usuario disponible en el sistema.",
            date: first(item.lastLoginAt, item.updatedAt, item.createdAt),
            route: HOME_ROUTES.USUARIOS,
            href: HOME_ROUTES.USUARIOS,
            action: "open_user",
            entityId: userId,
          });
        })
    : [];

  return normalizeHomeActivityList([
    ...ticketActivity,
    ...invoiceActivity,
    ...clientActivity,
    ...userActivity,
  ]).slice(0, limit);
}

/* =========================================================
   WIDGETS
========================================================= */

export function getHomeWidgetId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(first(raw.widgetId, raw.widgetKey, raw.id, raw.key, raw.slug, raw.code));
}

export function getHomeWidgetTitle(item = {}) {
  const raw = safeObject(item);

  return safeText(first(raw.title, raw.name, raw.label, raw.heading), "Bloque");
}

export function normalizeHomeWidget(item = {}) {
  const source = safeObject(item);
  const raw = sanitizeHomeRecord(source);

  const id = getHomeWidgetId(source);
  const title = getHomeWidgetTitle(source);

  const route = safeRoute(first(source.route, source.href, source.link, source.to), "");

  return sanitizeHomeRecord({
    ...raw,

    widgetId: id,
    widgetKey: safeText(first(raw.widgetKey, raw.key, id), id),

    id: safeText(first(raw.id, id), id),
    key: safeText(first(raw.key, id), id),

    title,

    description: safeText(first(raw.description, raw.descripcion, raw.subtitle, raw.summary, raw.text), ""),
    subtitle: safeText(first(raw.subtitle, raw.description, raw.text), ""),
    text: safeText(first(raw.text, raw.description, raw.subtitle), ""),

    type: safeText(first(raw.type, raw.kind, raw.variant, raw.category), HOME_ENTITY_TYPES.WIDGET),
    kind: safeText(first(raw.kind, raw.type, raw.variant, raw.category), HOME_ENTITY_TYPES.WIDGET),
    variant: safeText(first(raw.variant, raw.type, raw.kind, raw.category), HOME_ENTITY_TYPES.WIDGET),

    value: first(raw.value, raw.total, raw.amount, raw.count, raw.metric, "—"),

    trend: first(raw.trend, raw.delta, raw.change, raw.variation, ""),
    status: safeText(first(raw.status, raw.estado, raw.state), "active"),

    route,
    href: safeRoute(first(source.href, source.route, source.link, source.to), route),

    updatedAt: first(raw.updatedAt, raw.lastUpdate, raw.modifiedAt, raw.createdAt, nowIso()),
  });
}

export function normalizeHomeWidgets(items = []) {
  return uniqueHomeBy(
    safeArray(items)
      .map((item) => normalizeHomeWidget(item))
      .filter((item) => Boolean(getHomeWidgetId(item) || getHomeWidgetTitle(item))),
    (item) => first(getHomeWidgetId(item), getHomeWidgetTitle(item), "")
  );
}

export function buildHomeWidgetsFromSummary(summary = {}, options = {}) {
  const data = safeObject(summary);
  const admin = Boolean(options.admin || data.admin);

  const base = [
    {
      id: admin ? "incidencias" : "mis-incidencias",
      widgetId: admin ? "incidencias" : "mis-incidencias",
      key: admin ? "incidencias" : "mis-incidencias",
      title: admin ? "Incidencias" : "Mis incidencias",
      description: admin ? "Tickets visibles en el panel." : "Tus solicitudes visibles.",
      value: safeNumber(data.totalTickets, 0),
      subtitle: `${safeNumber(data.openTickets, 0)} abiertas · ${safeNumber(data.urgentTickets, 0)} urgentes`,
      type: "tickets",
      kind: "metric",
      status: safeNumber(data.urgentTickets, 0) > 0 ? "warning" : "active",
      route: HOME_ROUTES.INCIDENCIAS,
      href: HOME_ROUTES.INCIDENCIAS,
    },
    {
      id: admin ? "facturacion" : "mis-facturas",
      widgetId: admin ? "facturacion" : "mis-facturas",
      key: admin ? "facturacion" : "mis-facturas",
      title: admin ? "Facturación" : "Mis facturas",
      description: admin ? "Facturas visibles y volumen agregado." : "Facturación visible para tu cuenta.",
      value: admin ? safeNumber(data.invoiceAmount, 0) : safeNumber(data.totalInvoices, 0),
      subtitle: admin
        ? `${safeNumber(data.totalInvoices, 0)} facturas · ${safeNumber(data.pendingInvoices, 0)} pendientes`
        : `${safeNumber(data.pendingInvoices, 0)} pendientes`,
      type: "invoices",
      kind: "metric",
      status: safeNumber(data.pendingInvoices, 0) > 0 ? "warning" : "active",
      route: HOME_ROUTES.FACTURAS,
      href: HOME_ROUTES.FACTURAS,
    },
  ];

  if (admin) {
    base.push({
      id: "clientes",
      widgetId: "clientes",
      key: "clientes",
      title: "Clientes",
      description: "Clientes visibles.",
      value: safeNumber(data.clientsCount, 0),
      subtitle: `${safeNumber(data.visibleClientsCount, 0)} visibles`,
      type: "clients",
      kind: "metric",
      status: "active",
      route: HOME_ROUTES.CLIENTES,
      href: HOME_ROUTES.CLIENTES,
    });

    if (HOME_ROUTES.USUARIOS) {
      base.push({
        id: "usuarios",
        widgetId: "usuarios",
        key: "usuarios",
        title: "Usuarios",
        description: "Usuarios del sistema.",
        value: safeNumber(data.usersCount, 0),
        subtitle: `${safeNumber(data.visibleUsersCount, 0)} visibles`,
        type: "users",
        kind: "metric",
        status: "active",
        route: HOME_ROUTES.USUARIOS,
        href: HOME_ROUTES.USUARIOS,
      });
    }
  } else {
    base.push({
      id: "adjuntos",
      widgetId: "adjuntos",
      key: "adjuntos",
      title: "Adjuntos",
      description: "Documentos vinculados a tus incidencias.",
      value: safeNumber(data.attachmentsCount, 0),
      subtitle: "Archivos visibles",
      type: "files",
      kind: "metric",
      status: "active",
      route: HOME_ROUTES.INCIDENCIAS,
      href: HOME_ROUTES.INCIDENCIAS,
    });
  }

  return normalizeHomeWidgets(base);
}

/* =========================================================
   SUMMARY
========================================================= */

export function buildHomeDerivedSummary({
  tickets = [],
  ticketsTotal = null,
  invoices = [],
  invoicesTotal = null,
  users = [],
  usersTotal = null,
  clients = [],
  clientsTotal = null,
  admin = false,
} = {}) {
  const ticketRows = normalizeHomeTickets(tickets);
  const invoiceRows = normalizeHomeInvoices(invoices);
  const userRows = admin ? normalizeHomeUsers(users) : [];
  const clientRows = admin ? normalizeHomeClients(clients) : [];

  const openTickets = ticketRows.filter(isHomeTicketOpenLike).length;
  const closedTickets = ticketRows.filter(isHomeTicketClosedLike).length;
  const urgentTickets = ticketRows.filter(isHomeTicketUrgent).length;
  const pendingInvoices = invoiceRows.filter(isHomeInvoicePendingLike).length;

  const invoiceAmount = invoiceRows.reduce((sum, item) => sum + getHomeInvoiceAmount(item), 0);
  const attachmentsCount = ticketRows.reduce((sum, item) => sum + getHomeTicketAttachmentsCount(item), 0);

  const finalTicketsTotal = Math.max(ticketRows.length, safeNumber(ticketsTotal, ticketRows.length));
  const finalInvoicesTotal = Math.max(invoiceRows.length, safeNumber(invoicesTotal, invoiceRows.length));
  const finalUsersTotal = admin ? Math.max(userRows.length, safeNumber(usersTotal, userRows.length)) : 0;
  const finalClientsTotal = admin ? Math.max(clientRows.length, safeNumber(clientsTotal, clientRows.length)) : 0;

  return sanitizeSummaryForRole(
    {
      totalTickets: finalTicketsTotal,
      ticketsTotal: finalTicketsTotal,
      incidenciasTotal: finalTicketsTotal,
      totalIncidencias: finalTicketsTotal,
      ticketsCount: finalTicketsTotal,
      incidenciasCount: finalTicketsTotal,

      visibleTickets: ticketRows.length,
      visibleTicketsCount: ticketRows.length,
      visibleIncidenciasCount: ticketRows.length,

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

      totalInvoices: finalInvoicesTotal,
      invoicesTotal: finalInvoicesTotal,
      facturasTotal: finalInvoicesTotal,
      totalFacturas: finalInvoicesTotal,
      invoicesCount: finalInvoicesTotal,
      facturasCount: finalInvoicesTotal,

      visibleInvoices: invoiceRows.length,
      visibleInvoicesCount: invoiceRows.length,
      visibleFacturasCount: invoiceRows.length,

      pendingInvoices,
      pendingFacturas: pendingInvoices,
      facturasPendientes: pendingInvoices,
      invoicesPending: pendingInvoices,

      invoiceAmount,
      billingTotal: invoiceAmount,
      totalBilling: invoiceAmount,
      totalFacturado: invoiceAmount,
      importeFacturas: invoiceAmount,
      facturacionVisible: invoiceAmount,
      facturacionTotal: invoiceAmount,

      usersCount: finalUsersTotal,
      usuariosCount: finalUsersTotal,
      totalUsers: finalUsersTotal,
      totalUsuarios: finalUsersTotal,
      visibleUsersCount: userRows.length,
      visibleUsuariosCount: userRows.length,

      clientsCount: finalClientsTotal,
      clientesCount: finalClientsTotal,
      customersCount: finalClientsTotal,
      totalClients: finalClientsTotal,
      totalClientes: finalClientsTotal,
      totalCustomers: finalClientsTotal,
      visibleClientsCount: clientRows.length,
      visibleClientesCount: clientRows.length,
      visibleCustomersCount: clientRows.length,

      attachmentsCount,
      filesCount: attachmentsCount,
      adjuntosCount: attachmentsCount,

      lastTicketUpdate: getLatestHomeTicketUpdate(ticketRows),
    },
    admin
  );
}

export function normalizeHomeSummary(rawSummary = {}, widgetSummary = {}, derivedSummary = {}, options = {}) {
  const raw = sanitizeHomeRecord(rawSummary);
  const widget = sanitizeHomeRecord(widgetSummary);
  const derived = sanitizeHomeRecord(derivedSummary);
  const admin = Boolean(options.admin);

  const totalTickets = maxNumber(raw.totalTickets, raw.ticketsTotal, raw.incidenciasTotal, widget.totalTickets, derived.totalTickets);
  const openTickets = maxNumber(raw.openTickets, raw.pendingTickets, raw.openIncidencias, widget.openTickets, derived.openTickets);
  const closedTickets = maxNumber(raw.closedTickets, raw.resolvedTickets, widget.closedTickets, derived.closedTickets);
  const urgentTickets = maxNumber(raw.urgentTickets, raw.urgentIncidencias, widget.urgentTickets, derived.urgentTickets);

  const totalInvoices = maxNumber(raw.totalInvoices, raw.invoicesTotal, raw.facturasTotal, widget.totalInvoices, derived.totalInvoices);
  const pendingInvoices = maxNumber(raw.pendingInvoices, raw.pendingFacturas, widget.pendingInvoices, derived.pendingInvoices);
  const invoiceAmount = maxNumber(raw.invoiceAmount, raw.billingTotal, raw.totalFacturado, widget.invoiceAmount, derived.invoiceAmount);

  const usersCount = admin
    ? maxNumber(raw.usersCount, raw.usuariosCount, widget.usersCount, derived.usersCount)
    : 0;

  const clientsCount = admin
    ? maxNumber(raw.clientsCount, raw.clientesCount, raw.customersCount, widget.clientsCount, derived.clientsCount)
    : 0;

  const attachmentsCount = maxNumber(raw.attachmentsCount, raw.filesCount, widget.attachmentsCount, derived.attachmentsCount);

  return sanitizeSummaryForRole(
    {
      ...derived,
      ...widget,
      ...raw,

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

      invoiceAmount,
      billingTotal: invoiceAmount,
      totalBilling: invoiceAmount,
      totalFacturado: invoiceAmount,
      importeFacturas: invoiceAmount,
      facturacionVisible: invoiceAmount,
      facturacionTotal: invoiceAmount,

      usersCount,
      usuariosCount: usersCount,
      totalUsers: usersCount,
      totalUsuarios: usersCount,

      clientsCount,
      clientesCount: clientsCount,
      customersCount: clientsCount,
      totalClients: clientsCount,
      totalClientes: clientsCount,
      totalCustomers: clientsCount,

      attachmentsCount,
      filesCount: attachmentsCount,
      adjuntosCount: attachmentsCount,

      lastTicketUpdate: first(raw.lastTicketUpdate, widget.lastTicketUpdate, derived.lastTicketUpdate, null),
    },
    admin
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

function summaryBlock(raw = {}) {
  const object = safeObject(raw);

  return safeObject(
    first(
      object.summary,
      object.stats,
      object.metrics,
      object.totals,
      object.counts,
      object.dashboard?.summary,
      {}
    )
  );
}

function widgetsBlock(raw = {}) {
  const object = safeObject(raw);

  return normalizeHomeWidgets(
    first(
      object.widgets,
      object.cards,
      object.kpis,
      object.blocks,
      object.dashboard?.widgets,
      []
    )
  );
}

function inferAdmin(raw = {}) {
  const object = safeObject(raw);

  const role = normalizeRole(
    first(
      object.role,
      object.rol,
      object.roles,
      object.meta?.role,
      object.meta?.rol,
      object.meta?.roles,
      ""
    ),
    ""
  );

  if (typeof object.admin === "boolean") return object.admin;
  if (typeof object.meta?.admin === "boolean") return object.meta.admin;

  return role === "admin";
}

export function normalizeHomeDashboard(payload = null) {
  const picked = unwrapHomeEnvelope(payload);
  let source = safeObject(picked);

  if (hasKeys(source.dashboard) && looksLikeHomeDashboard(source.dashboard) && !hasKeys(source.summary)) {
    source = safeObject(source.dashboard);
  }

  const raw = sanitizeHomeRecord(source);

  const admin = inferAdmin(source);
  const role = admin ? "admin" : "user";

  const ticketsBlock = pickHomeCollectionBlock(source, ["tickets", "incidencias"]);
  const invoicesBlock = pickHomeCollectionBlock(source, ["invoices", "facturas"]);

  const usersBlock = admin
    ? pickHomeCollectionBlock(source, ["users", "usuarios"])
    : { items: [], visibleCount: 0, total: 0, totalCount: 0, remoteCount: 0 };

  const clientsBlock = admin
    ? pickHomeCollectionBlock(source, ["clients", "clientes", "customers"])
    : { items: [], visibleCount: 0, total: 0, totalCount: 0, remoteCount: 0 };

  const activityBlock = pickHomeCollectionBlock(source, ["activity", "activities", "recent", "recentActivity"]);

  const tickets = normalizeHomeTickets(ticketsBlock.items);
  const invoices = normalizeHomeInvoices(invoicesBlock.items);
  const users = admin ? normalizeHomeUsers(usersBlock.items) : [];
  const clients = admin ? normalizeHomeClients(clientsBlock.items) : [];

  const explicitActivity = filterActivityForRole(
    normalizeHomeActivityList(activityBlock.items),
    admin
  );

  const activity = explicitActivity.length
    ? explicitActivity
    : filterActivityForRole(
        buildHomeActivityFromCollections({
          tickets,
          invoices,
          users: admin ? users : [],
          clients: admin ? clients : [],
        }),
        admin
      );

  const rawWidgets = filterWidgetsForRole(widgetsBlock(source), admin);
  const rawSummary = summaryBlock(source);

  const derivedSummary = buildHomeDerivedSummary({
    tickets,
    ticketsTotal: first(rawSummary.totalTickets, rawSummary.ticketsTotal, rawSummary.incidenciasTotal, ticketsBlock.remoteCount),

    invoices,
    invoicesTotal: first(rawSummary.totalInvoices, rawSummary.invoicesTotal, rawSummary.facturasTotal, invoicesBlock.remoteCount),

    users,
    usersTotal: admin
      ? first(rawSummary.usersCount, rawSummary.usuariosCount, usersBlock.remoteCount)
      : 0,

    clients,
    clientsTotal: admin
      ? first(rawSummary.clientsCount, rawSummary.clientesCount, rawSummary.customersCount, clientsBlock.remoteCount)
      : 0,

    admin,
  });

  const summary = normalizeHomeSummary(rawSummary, {}, derivedSummary, { admin });
  const widgets = rawWidgets.length
    ? rawWidgets
    : buildHomeWidgetsFromSummary(summary, { admin });

  const updatedAt = first(
    raw.updatedAt,
    raw.lastUpdate,
    raw.generatedAt,
    raw.createdAt,
    summary.updatedAt,
    summary.lastUpdate,
    nowIso()
  );

  return sanitizeHomeRecord({
    ...raw,

    ok: raw.ok !== false && raw.success !== false,
    success: raw.ok !== false && raw.success !== false,

    source: safeText(first(raw.source, admin ? "home-admin-normalized" : "home-user-normalized"), "home-normalized"),
    version: HOME_MODEL_VERSION,

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

    tickets,
    incidencias: tickets,

    ticketsTotal: summary.totalTickets,
    incidenciasTotal: summary.totalTickets,
    totalTickets: summary.totalTickets,
    totalIncidencias: summary.totalTickets,
    ticketsCount: summary.totalTickets,
    incidenciasCount: summary.totalTickets,

    visibleTicketsCount: tickets.length,
    visibleIncidenciasCount: tickets.length,

    invoices,
    facturas: invoices,

    invoicesTotal: summary.totalInvoices,
    facturasTotal: summary.totalInvoices,
    totalInvoices: summary.totalInvoices,
    totalFacturas: summary.totalInvoices,
    invoicesCount: summary.totalInvoices,
    facturasCount: summary.totalInvoices,

    visibleInvoicesCount: invoices.length,
    visibleFacturasCount: invoices.length,

    users: admin ? users : [],
    usuarios: admin ? users : [],

    usersTotal: admin ? summary.usersCount : 0,
    usuariosTotal: admin ? summary.usuariosCount : 0,
    totalUsers: admin ? summary.usersCount : 0,
    totalUsuarios: admin ? summary.usuariosCount : 0,
    usersCount: admin ? summary.usersCount : 0,
    usuariosCount: admin ? summary.usuariosCount : 0,

    visibleUsersCount: admin ? users.length : 0,
    visibleUsuariosCount: admin ? users.length : 0,

    clients: admin ? clients : [],
    clientes: admin ? clients : [],
    customers: admin ? clients : [],

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

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,

    activityCount: activity.length,
    recentCount: activity.length,
    visibleActivityCount: activity.length,

    updatedAt,
    generatedAt: first(raw.generatedAt, updatedAt),

    meta: {
      ...safeObject(raw.meta),

      role,
      admin,

      updatedAt,
      generatedAt: first(raw.generatedAt, updatedAt),

      widgetsCount: widgets.length,

      ticketsCount: summary.totalTickets,
      incidenciasCount: summary.totalTickets,
      visibleTicketsCount: tickets.length,
      visibleIncidenciasCount: tickets.length,

      invoicesCount: summary.totalInvoices,
      facturasCount: summary.totalInvoices,
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
      visibleActivityCount: activity.length,
    },
  });
}

/* =========================================================
   PAGINATION / FINDERS
========================================================= */

export function paginateHomeItems(
  items = [],
  page = DEFAULT_HOME_PAGE,
  pageSize = DEFAULT_HOME_PAGE_SIZE
) {
  const rows = safeArray(items);
  const size = Math.max(1, safeNumber(pageSize, DEFAULT_HOME_PAGE_SIZE));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil((total || 1) / size));

  const currentPage = Math.min(
    Math.max(1, safeNumber(page, DEFAULT_HOME_PAGE)),
    totalPages
  );

  const start = (currentPage - 1) * size;
  const pageItems = rows.slice(start, start + size);

  return {
    items: pageItems,
    pageItems,
    rows: pageItems,

    page: currentPage,
    currentPage,

    pageSize: size,
    limit: size,

    total,
    totalCount: total,

    totalPages,
    pages: totalPages,

    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,

    from: total ? start + 1 : 0,
    to: Math.min(start + size, total),
    rangeStart: total ? start + 1 : 0,
    rangeEnd: Math.min(start + size, total),
  };
}

export function findHomeTicketById(items = [], ticketId = "") {
  const id = normalizeHomeKey(ticketId);

  if (!id) return null;

  return (
    normalizeHomeTickets(items).find((item) =>
      getHomeTicketIdentities(item)
        .map(normalizeHomeKey)
        .includes(id)
    ) || null
  );
}

export function findHomeInvoiceById(items = [], invoiceId = "") {
  const id = normalizeHomeKey(invoiceId);

  if (!id) return null;

  return (
    normalizeHomeInvoices(items).find((item) => {
      const ids = uniqueStrings([
        getHomeInvoiceId(item),
        item.invoiceId,
        item.facturaId,
        item.id,
        item.numeroFacturaLegal,
        item.numeroFactura,
        item.invoiceNumber,
        item.number,
        item.numero,
        item.code,
      ]).map(normalizeHomeKey);

      return ids.includes(id);
    }) || null
  );
}

export function findHomeWidgetById(items = [], widgetId = "") {
  const id = normalizeHomeKey(widgetId);

  if (!id) return null;

  return (
    normalizeHomeWidgets(items).find((item) => {
      const ids = uniqueStrings([
        getHomeWidgetId(item),
        item.widgetId,
        item.widgetKey,
        item.id,
        item.key,
        item.slug,
        item.code,
        item.title,
        item.name,
      ]).map(normalizeHomeKey);

      return ids.includes(id);
    }) || null
  );
}

export function getLatestHomeTicketUpdate(tickets = []) {
  const timestamps = safeArray(tickets)
    .map((item) => toTimestamp(getHomeTicketUpdatedAt(item) || getHomeTicketCreatedAt(item)))
    .filter(Boolean);

  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

/* =========================================================
   TEMPLATE PAYLOAD
========================================================= */

export function buildHomeTemplatePayload(input = {}) {
  const source = sanitizeHomeRecord(input);
  const dashboard = normalizeHomeDashboard(first(source.dashboard, source, {}));

  const tickets = source.tickets || source.incidencias
    ? normalizeHomeTickets(first(source.tickets, source.incidencias, []))
    : dashboard.tickets;

  const invoices = source.invoices || source.facturas
    ? normalizeHomeInvoices(first(source.invoices, source.facturas, []))
    : dashboard.invoices;

  const users = dashboard.admin && (source.users || source.usuarios)
    ? normalizeHomeUsers(first(source.users, source.usuarios, []))
    : dashboard.users;

  const clients = dashboard.admin && (source.clients || source.clientes || source.customers)
    ? normalizeHomeClients(first(source.clients, source.clientes, source.customers, []))
    : dashboard.clients;

  const rawActivity = source.activity || source.recent || source.recentActivity
    ? normalizeHomeActivityList(first(source.activity, source.recent, source.recentActivity, []))
    : dashboard.activity.length
      ? dashboard.activity
      : buildHomeActivityFromCollections({
          tickets,
          invoices,
          users: dashboard.admin ? users : [],
          clients: dashboard.admin ? clients : [],
        });

  const page = safeNumber(first(source.page, DEFAULT_HOME_PAGE), DEFAULT_HOME_PAGE);
  const pageSize = safeNumber(first(source.pageSize, DEFAULT_HOME_PAGE_SIZE), DEFAULT_HOME_PAGE_SIZE);

  const pagination = paginateHomeItems(tickets, page, pageSize);

  const summary = normalizeHomeSummary(
    dashboard.summary,
    {},
    buildHomeDerivedSummary({
      tickets,
      ticketsTotal: dashboard.summary.totalTickets,

      invoices,
      invoicesTotal: dashboard.summary.totalInvoices,

      users: dashboard.admin ? users : [],
      usersTotal: dashboard.admin ? dashboard.summary.usersCount : 0,

      clients: dashboard.admin ? clients : [],
      clientsTotal: dashboard.admin ? dashboard.summary.clientsCount : 0,

      admin: dashboard.admin,
    }),
    {
      admin: dashboard.admin,
    }
  );

  const widgets = filterWidgetsForRole(
    dashboard.widgets?.length
      ? dashboard.widgets
      : buildHomeWidgetsFromSummary(summary, { admin: dashboard.admin }),
    dashboard.admin
  );

  const activity = filterActivityForRole(rawActivity, dashboard.admin);

  const finalDashboard = normalizeHomeDashboard({
    ...dashboard,

    summary,
    widgets,

    tickets,
    incidencias: tickets,

    invoices,
    facturas: invoices,

    users: dashboard.admin ? users : [],
    usuarios: dashboard.admin ? users : [],

    clients: dashboard.admin ? clients : [],
    clientes: dashboard.admin ? clients : [],
    customers: dashboard.admin ? clients : [],

    activity,
    recent: activity,
    recentActivity: activity,
  });

  return sanitizeHomeRecord({
    ...source,

    dashboard: finalDashboard,

    summary: finalDashboard.summary,
    stats: finalDashboard.summary,
    metrics: finalDashboard.summary,
    totals: finalDashboard.summary,
    counts: finalDashboard.summary,

    widgets: finalDashboard.widgets,

    tickets: finalDashboard.tickets,
    incidencias: finalDashboard.incidencias,

    invoices: finalDashboard.invoices,
    facturas: finalDashboard.facturas,

    users: finalDashboard.users,
    usuarios: finalDashboard.usuarios,

    clients: finalDashboard.clients,
    clientes: finalDashboard.clientes,

    activity: finalDashboard.activity,
    activities: finalDashboard.activity,
    recent: finalDashboard.activity,
    recentActivity: finalDashboard.activity,

    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
    pagination,
    pageItems: pagination.items,

    totalCount: finalDashboard.summary.totalTickets,
    remoteCount: finalDashboard.summary.totalTickets,

    lastUpdatedAt: first(
      source.lastUpdatedAt,
      source.lastSyncAt,
      finalDashboard.updatedAt,
      finalDashboard.generatedAt,
      ""
    ),

    requestId: safeText(
      first(
        source.requestId,
        finalDashboard.requestId,
        finalDashboard.meta?.requestId,
        ""
      ),
      ""
    ),
  });
}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeModel = Object.freeze({
  version: HOME_MODEL_VERSION,

  normalizeKey: normalizeHomeKey,
  uniqueBy: uniqueHomeBy,

  unwrapEnvelope: unwrapHomeEnvelope,
  looksLikeDashboard: looksLikeHomeDashboard,

  normalizeCollectionSource: normalizeHomeCollectionSource,
  pickCollectionBlock: pickHomeCollectionBlock,

  normalizeDashboard: normalizeHomeDashboard,

  normalizeSummary: normalizeHomeSummary,
  buildDerivedSummary: buildHomeDerivedSummary,
  buildWidgetsFromSummary: buildHomeWidgetsFromSummary,
  buildActivityFromCollections: buildHomeActivityFromCollections,

  normalizeTicket: normalizeHomeTicket,
  normalizeTickets: normalizeHomeTickets,
  getTicketId: getHomeTicketId,
  getTicketIdentities: getHomeTicketIdentities,
  getTicketStatus: getHomeTicketStatus,
  getTicketStatusKey: getHomeTicketStatusKey,
  getTicketStatusLabel: getHomeTicketStatusLabel,
  getTicketPriority: getHomeTicketPriority,
  getTicketPriorityKey: getHomeTicketPriorityKey,
  findTicketById: findHomeTicketById,

  normalizeInvoice: normalizeHomeInvoice,
  normalizeInvoices: normalizeHomeInvoices,
  getInvoiceId: getHomeInvoiceId,
  getInvoiceAmount: getHomeInvoiceAmount,
  getInvoiceStatusKey: getHomeInvoiceStatusKey,
  findInvoiceById: findHomeInvoiceById,

  normalizeUser: normalizeHomeUser,
  normalizeUsers: normalizeHomeUsers,
  getUserId: getHomeUserId,

  normalizeClient: normalizeHomeClient,
  normalizeClients: normalizeHomeClients,
  getClientId: getHomeClientId,

  normalizeActivity: normalizeHomeActivity,
  normalizeActivityList: normalizeHomeActivityList,
  getActivityId: getHomeActivityId,

  normalizeWidget: normalizeHomeWidget,
  normalizeWidgets: normalizeHomeWidgets,
  getWidgetId: getHomeWidgetId,
  findWidgetById: findHomeWidgetById,

  paginate: paginateHomeItems,

  getLatestTicketUpdate: getLatestHomeTicketUpdate,

  buildTemplatePayload: buildHomeTemplatePayload,
});

export default HomeModel;
