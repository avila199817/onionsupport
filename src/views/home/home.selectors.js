/* =========================================================
   Onion Support - Home Selectors
   Archivo: /src/views/home/home.selectors.js

   Responsabilidad:
   - Selectores puros para Home.
   - Leer dashboard normalizado.
   - Leer colecciones para home.template.js.
   - Calcular métricas/cards ligeras alineadas con el template actual.
   - Formatear números, dinero y fechas.
   - Consumir usuario/rol ya resuelto desde sidebarUser cuando exista.
   - Construir filas visibles de Home sin duplicar lógica de modelo.
   - Limitar sólo vistas/listas recientes a 5 elementos.
   - Mantener contadores sobre el total completo disponible.
   - Preparar datos del modal de incidencia.
   - Preparar técnico asignado y facturas vinculadas desde home.model.js.
   - Home distinto para admin/user.
   - User nunca expone users/clientes.
   - Rutas base desde core/config.js.
   - Rutas admin reales desde core/config.js.
   - Bloqueos legacy desde core/config.js.
   - Sin quick actions visibles.
   - Sin widgets como fuente de cards principales.
   - Sin fetch.
   - Sin Auth.
   - Sin Router.
   - Sin Storage.
   - Sin CSS inline.
   - Sin rutas inventadas.
   - Sin /home.
   - Sin health/server/ready/ping.
   - Sin emails como identidad.
   - Sin raw/data/payload/response en salidas normalizadas.
========================================================= */

import {
  ROUTES as CORE_ROUTES,
  isAdminRoute as configIsAdminRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import {
  DEFAULT_HOME_RECENT_LIMIT,

  normalizeHomeDashboard,
  normalizeHomeWidgets,
  normalizeHomeTickets,
  normalizeHomeInvoices,
  normalizeHomeUsers,
  normalizeHomeClients,
  normalizeHomeActivityList,
  buildHomeActivityFromCollections,

  findHomeTicketById,
  resolveHomeTicketInvoices,
  resolveHomeTicketTechnician,

  getHomeTicketId,
  getHomeTicketSubject,
  getHomeTicketDescription,
  getHomeTicketStatusKey as modelTicketStatusKey,
  getHomeTicketStatusLabel as modelTicketStatusLabel,
  getHomeTicketPriorityKey as modelTicketPriorityKey,
  getHomeTicketPriorityLabel as modelTicketPriorityLabel,
  getHomeTicketCategory,
  getHomeTicketCreatedAt,
  getHomeTicketUpdatedAt,

  getHomeInvoiceId,
  getHomeInvoiceAmount as modelGetInvoiceAmount,
  getHomeInvoicePaidAmount as modelGetInvoicePaidAmount,
  getHomeInvoicePendingAmount as modelGetInvoicePendingAmount,
  getHomeInvoiceCurrency as modelGetInvoiceCurrency,
  getHomeInvoiceStatusKey as modelInvoiceStatusKey,
  getHomeInvoiceStatusLabel as modelInvoiceStatusLabel,
  isHomeInvoicePaid as modelIsInvoicePaid,
  isHomeInvoicePendingLike as modelIsInvoicePendingLike,

  getHomeUserId,
  getHomeClientId,
  getHomeWidgetId,
} from "./home.model.js";

export const HOME_SELECTORS_VERSION = "home.selectors.v11.template-aligned";

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 5;
export const DEFAULT_RECENT_LIMIT = DEFAULT_HOME_RECENT_LIMIT || 5;
export const DEFAULT_CURRENCY = "EUR";
export const DEFAULT_LOCALE = "es-ES";

const ACTIONS = Object.freeze({
  NAVIGATE: "navigate_home",
  CREATE_INCIDENCIA: "create_incidencia",
  OPEN_TICKET_DETAIL: "open_ticket_detail",
  CLOSE_TICKET_DETAIL: "close_ticket_detail",
});

export const VALID_ROLES = Object.freeze(["admin", "user"]);

export const TICKET_STATUS_KEYS = Object.freeze({
  PENDING: "pending",
  OPEN: "open",
  PROGRESS: "progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

export const TICKET_OPEN_KEYS = Object.freeze([
  TICKET_STATUS_KEYS.PENDING,
  TICKET_STATUS_KEYS.OPEN,
  TICKET_STATUS_KEYS.PROGRESS,
]);

export const TICKET_CLOSED_KEYS = Object.freeze([
  TICKET_STATUS_KEYS.RESOLVED,
  TICKET_STATUS_KEYS.CLOSED,
]);

export const INVOICE_STATUS_KEYS = Object.freeze({
  PAID: "paid",
  PENDING: "pending",
  OVERDUE: "overdue",
  PARTIAL: "partial",
  CANCELLED: "cancelled",
  DRAFT: "draft",
});

export const INVOICE_PENDING_KEYS = Object.freeze([
  INVOICE_STATUS_KEYS.PENDING,
  INVOICE_STATUS_KEYS.OVERDUE,
  INVOICE_STATUS_KEYS.PARTIAL,
]);

const RAW_KEYS = new Set([
  "raw",
  "data",
  "payload",
  "response",
  "body",
  "request",
  "headers",
  "config",
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
  /token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|session|sessionId|session_id|email|correo|mail|phone|telefono|teléfono|address|direccion|dirección|nif|dni|iban|bank|cuenta|account|ipRaw|ip|userAgent/i;

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i;

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;

const JWT_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

const ADMIN_ENTITY_RE =
  /(^|[\s._/-])(clientes?|clients?|customers?|usuarios?|users?|members?|directorio|directory|servidor|server)([\s._/-]|$)/i;

/* =========================================================
   SAFE HELPERS
========================================================= */

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function hasKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

export function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeNumber(value, fallback = 0) {
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

export function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

export function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

export function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function clampNumber(value = 0, min = 0, max = Number.POSITIVE_INFINITY) {
  const number = safeNumber(value, min);
  return Math.min(Math.max(number, min), max);
}

export function roundMoney(value = 0) {
  const number = safeNumber(value, NaN);
  return Number.isFinite(number)
    ? Math.round((number + Number.EPSILON) * 100) / 100
    : 0;
}

export function getPath(object = {}, path = "") {
  const root = safeObject(object, null);
  const cleanPath = safeText(path, "");

  if (!root || !cleanPath) return undefined;

  return cleanPath.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc?.[key];
  }, root);
}

export function firstPath(object = {}, paths = []) {
  return first(...safeArray(paths).map((path) => getPath(object, path)));
}

export function uniqueBy(items = [], picker = (item) => item) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const key = normalizeKey(picker(item));

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

export function isSameIdentity(a = "", b = "") {
  const left = normalizeKey(a);
  const right = normalizeKey(b);

  return Boolean(left && right && left === right);
}

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(JWT_RE, "***");
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function sanitizeValue(value, keyHint = "") {
  if (RAW_KEYS.has(keyHint)) return undefined;
  if (COSMOS_META_KEYS.has(keyHint)) return undefined;
  if (isSensitiveKey(keyHint)) return undefined;

  if (typeof value === "string") return redact(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (RAW_KEYS.has(key)) continue;
      if (COSMOS_META_KEYS.has(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizeValue(item, key);

      if (clean !== undefined) output[key] = clean;
    }

    return output;
  }

  return value;
}

function sanitizeObject(value = {}) {
  return safeObject(sanitizeValue(value), {});
}

function hasSensitiveQuery(value = "") {
  return SENSITIVE_QUERY_RE.test(String(value || ""));
}

function isEmailLike(value = "") {
  const text = safeText(value, "");
  return Boolean(text && EMAIL_RE.test(text));
}

function visualText(value = "", fallback = "Usuario") {
  const text = redact(safeText(value, ""));

  if (!text) return fallback;
  if (isEmailLike(text)) return fallback;

  return text;
}

function firstVisual(values = [], fallback = "Usuario") {
  for (const value of safeArray(values)) {
    if (isObject(value)) continue;

    const text = safeText(value, "");

    if (!text || isEmailLike(text)) continue;

    return redact(text);
  }

  return fallback;
}

function safeImageSrc(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (raw.length > 2048) return "";
  if (hasSensitiveQuery(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(?:data|blob|javascript|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";

  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

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

    if (!path.startsWith("/")) path = `/${path}`;
    if (path.length > 1) path = path.replace(/\/+$/g, "") || "/";

    return path || "";
  }
}

function isBlockedRoute(value = "") {
  const path = routePathOnly(value);
  const lower = path.toLowerCase();

  if (!path) return true;

  try {
    return configIsBlockedRoutePath(path) === true;
  } catch {
    return Boolean(
      lower === "/home" ||
        lower === "/403" ||
        lower === "/404" ||
        lower === "/2fa" ||
        lower === "/mfa" ||
        lower === "/otp" ||
        lower.startsWith("/2fa/") ||
        lower.startsWith("/mfa/") ||
        lower.startsWith("/otp/")
    );
  }
}

export function normalizeRoute(route = "") {
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
  const configured = normalizeRoute(CORE_ROUTES?.[name]);
  if (configured) return configured;
  return fallback ? normalizeRoute(fallback) : "";
}

export const HOME_ROUTES = Object.freeze({
  INCIDENCIAS: routeFromCore("incidencias", "/incidencias"),
  FACTURAS: routeFromCore("facturas", "/facturas"),
  CLIENTES: routeFromCore("clientes", "/clientes"),
  USUARIOS: routeFromCore("usuarios", ""),
  SERVIDOR: routeFromCore("servidor", ""),
  CUENTA: routeFromCore("cuenta", "/cuenta"),
  AJUSTES: routeFromCore("ajustes", "/ajustes"),
});

function getRoutePath(route = "") {
  return normalizeRoute(route).split("?")[0].split("#")[0] || "";
}

function isAdminOnlyRoute(route = "") {
  const path = getRoutePath(route);
  const clientes = getRoutePath(HOME_ROUTES.CLIENTES);
  const usuarios = getRoutePath(HOME_ROUTES.USUARIOS);
  const servidor = getRoutePath(HOME_ROUTES.SERVIDOR);

  if (!path) return false;

  try {
    if (configIsAdminRoute(path) === true) return true;
  } catch {
    // fallback local mínimo
  }

  return (
    Boolean(clientes && (path === clientes || path.startsWith(`${clientes}/`))) ||
    Boolean(usuarios && (path === usuarios || path.startsWith(`${usuarios}/`))) ||
    Boolean(servidor && (path === servidor || path.startsWith(`${servidor}/`)))
  );
}

function isAdminEntityValue(value = "") {
  return ADMIN_ENTITY_RE.test(String(value || "").toLowerCase());
}

/* =========================================================
   FORMATTERS
========================================================= */

const numberFormatterCache = new Map();
const moneyFormatterCache = new Map();
const dateFormatterCache = new Map();

export function getNumberFormatter(locale = DEFAULT_LOCALE) {
  const cleanLocale = safeText(locale, DEFAULT_LOCALE);
  const key = `${cleanLocale}:number`;

  if (numberFormatterCache.has(key)) return numberFormatterCache.get(key);

  const formatter = new Intl.NumberFormat(cleanLocale, {
    maximumFractionDigits: 0,
  });

  numberFormatterCache.set(key, formatter);

  return formatter;
}

export function formatNumber(value = 0, locale = DEFAULT_LOCALE) {
  const number = safeNumber(value, NaN);

  if (!Number.isFinite(number)) return "0";

  try {
    return getNumberFormatter(locale).format(number);
  } catch {
    return String(Math.round(number));
  }
}

export function getMoneyFormatter(currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) {
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();
  const cleanLocale = safeText(locale, DEFAULT_LOCALE);
  const key = `${cleanLocale}:${code}`;

  if (moneyFormatterCache.has(key)) return moneyFormatterCache.get(key);

  const formatter = new Intl.NumberFormat(cleanLocale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  moneyFormatterCache.set(key, formatter);

  return formatter;
}

export function formatMoney(value = 0, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) {
  const amount = safeNumber(value, NaN);

  if (!Number.isFinite(amount)) return "—";

  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  try {
    return getMoneyFormatter(code, locale).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

export function toTimestamp(value = null) {
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
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+-\s+|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
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

export function getDateTimeFormatter(locale = DEFAULT_LOCALE) {
  const cleanLocale = safeText(locale, DEFAULT_LOCALE);
  const key = `${cleanLocale}:date-time`;

  if (dateFormatterCache.has(key)) return dateFormatterCache.get(key);

  const formatter = new Intl.DateTimeFormat(cleanLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  dateFormatterCache.set(key, formatter);

  return formatter;
}

export function getDateFormatter(locale = DEFAULT_LOCALE) {
  const cleanLocale = safeText(locale, DEFAULT_LOCALE);
  const key = `${cleanLocale}:date`;

  if (dateFormatterCache.has(key)) return dateFormatterCache.get(key);

  const formatter = new Intl.DateTimeFormat(cleanLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  dateFormatterCache.set(key, formatter);

  return formatter;
}

export function formatDateTime(value = null, locale = DEFAULT_LOCALE) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "—";

  try {
    return getDateTimeFormatter(locale).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

export function formatDateShort(value = null, locale = DEFAULT_LOCALE) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "—";

  try {
    return getDateFormatter(locale).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

export function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffMin = Math.round((timestamp - Date.now()) / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

  const hours = Math.round(absMin / 60);

  if (hours < 24) {
    return diffMin > 0 ? `En ${hours} h` : `Hace ${hours} h`;
  }

  const days = Math.round(hours / 24);

  if (days <= 7) {
    return diffMin > 0
      ? `En ${days} día${days === 1 ? "" : "s"}`
      : `Hace ${days} día${days === 1 ? "" : "s"}`;
  }

  return formatDateShort(value);
}

export function formatLastUpdate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffHours = Math.abs(Date.now() - timestamp) / 3600000;

  return diffHours <= 72 ? formatRelativeDate(value) : formatDateTime(value);
}

export function getInitials(value = "", fallback = "ON") {
  const text = normalizeWhitespace(visualText(value, ""));

  if (!text) return fallback;

  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || fallback;
  }

  return `${parts[0]?.[0] || ""}${parts[parts.length - 1]?.[0] || ""}`.toUpperCase() || fallback;
}

/* =========================================================
   USER / ROLE
========================================================= */

export function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = String(value || "").trim().toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return "";
}

export function isAdminRole(role = "") {
  return normalizeRole(role) === "admin";
}

export function isUserRole(role = "") {
  return normalizeRole(role) === "user";
}

function roleFromAdminFlag(value = {}) {
  const source = safeObject(value);

  if (
    source.admin === true ||
    source.isAdmin === true ||
    source.meta?.admin === true ||
    source.dashboard?.admin === true ||
    source.dashboard?.meta?.admin === true
  ) {
    return "admin";
  }

  return "";
}

export function getDashboard(input = {}) {
  const data = safeObject(input);

  return safeObject(
    first(
      data.dashboard,
      data.state?.dashboard,
      data.home,
      data.data?.dashboard,
      data.payload?.dashboard,
      data.result?.dashboard,
      {}
    )
  );
}

export function getNormalizedDashboard(input = {}) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);

  try {
    return normalizeHomeDashboard(hasKeys(dashboard) ? dashboard : data);
  } catch {
    return sanitizeObject(dashboard);
  }
}

function getUserSource(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getDashboard(data);

  return safeObject(
    first(
      data.sidebarUser,
      data.sidebar?.user,
      data.layout?.sidebarUser,
      data.context?.sidebarUser,
      data.context?.user,

      state.sidebarUser,
      state.sidebar?.user,
      state.user,
      state.currentUser,
      state.session?.user,

      data.user,
      data.currentUser,
      data.authUser,
      data.sessionUser,
      data.session?.user,
      data.auth?.user,

      dashboard.sidebarUser,
      dashboard.sidebar?.user,
      dashboard.user,
      dashboard.currentUser,

      data.profile,
      dashboard.profile,
      {}
    )
  );
}

function publicUser(user = {}) {
  const raw = safeObject(user);

  const role =
    normalizeRole(first(raw.role, raw.rol, raw.roles, "")) ||
    roleFromAdminFlag(raw) ||
    "user";

  const displayName = firstVisual(
    [
      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,

      raw.profile?.displayName,
      raw.profile?.fullName,
      raw.profile?.name,
      raw.profile?.nombre,
      raw.profile?.publicName,

      raw.username,
      raw.userName,
      raw.slug,
      raw.lookup?.slug,
    ],
    "Usuario"
  );

  const avatarUrl = safeImageSrc(
    first(
      raw.avatarUrl,
      raw.avatarURL,
      raw.avatar_url,
      raw.avatar,

      raw.photoUrl,
      raw.photoURL,
      raw.photo_url,
      raw.photo,

      raw.pictureUrl,
      raw.pictureURL,
      raw.picture_url,
      raw.picture,

      raw.imageUrl,
      raw.imageURL,
      raw.image_url,
      raw.image,

      raw.fotoUrl,
      raw.fotoURL,
      raw.foto_url,
      raw.foto,

      raw.imagenUrl,
      raw.imagenURL,
      raw.imagen_url,
      raw.imagen,

      raw.profile?.avatarUrl,
      raw.profile?.avatar,
      raw.profile?.photoUrl,
      raw.profile?.photoURL,
      raw.profile?.picture,
      raw.profile?.pictureUrl,
      raw.profile?.image,
      raw.profile?.imageUrl,

      raw.media?.avatarUrl,
      raw.media?.avatar,
      raw.media?.photoUrl,
      raw.media?.photoURL,
      raw.media?.picture,
      raw.media?.pictureUrl,
      raw.media?.image,
      raw.media?.imageUrl
    )
  );

  return sanitizeObject({
    hasUser: raw.hasUser !== false,

    displayName,
    name: displayName,
    fullName: displayName,

    avatarUrl,
    avatar: avatarUrl,
    photoUrl: avatarUrl,
    photoURL: avatarUrl,
    picture: avatarUrl,
    pictureUrl: avatarUrl,
    image: avatarUrl,
    imageUrl: avatarUrl,
    foto: avatarUrl,
    fotoUrl: avatarUrl,
    imagen: avatarUrl,
    imagenUrl: avatarUrl,

    initials: safeText(first(raw.initials, raw.iniciales, getInitials(displayName, "U")), "U")
      .slice(0, 3)
      .toUpperCase(),

    role,
    rol: role,
    roles: [role],

    roleLabel: safeText(
      first(raw.roleLabel, role === "admin" ? "Administrador" : "Estándar"),
      role === "admin" ? "Administrador" : "Estándar"
    ),

    isAdmin: role === "admin",
    isUser: role === "user",
  });
}

export function getUser(input = {}) {
  return publicUser(getUserSource(input));
}

export function getRole(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getDashboard(data);
  const user = getUser(data);

  return (
    normalizeRole(
      first(
        user.role,
        user.rol,
        user.roles,

        data.role,
        data.rol,
        data.roles,

        state.role,
        state.rol,
        state.roles,

        dashboard.role,
        dashboard.rol,
        dashboard.roles,
        dashboard.meta?.role,

        ""
      )
    ) ||
    roleFromAdminFlag(data) ||
    roleFromAdminFlag(state) ||
    roleFromAdminFlag(dashboard) ||
    "user"
  );
}

export function canSeeUsersModule(input = {}) {
  return isAdminRole(getRole(input)) && Boolean(HOME_ROUTES.USUARIOS);
}

export function canSeeClientsModule(input = {}) {
  return isAdminRole(getRole(input)) && Boolean(HOME_ROUTES.CLIENTES);
}

export function getDisplayName(input = {}) {
  return getUser(input).displayName || "Usuario";
}

export function getAvatarUrl(input = {}) {
  return getUser(input).avatarUrl || "";
}

/* =========================================================
   SUMMARY
========================================================= */

export function getSummary(input = {}) {
  const dashboard = getNormalizedDashboard(input);
  const data = safeObject(input);
  const state = safeObject(data.state);
  const admin = isAdminRole(getRole(input));

  const summary = safeObject(
    first(
      data.summary,
      state.summary,
      dashboard.summary,
      dashboard.stats,
      dashboard.metrics,
      dashboard.totals,
      dashboard.counts,
      {}
    )
  );

  if (admin) return sanitizeObject(summary);

  return sanitizeObject({
    ...summary,

    usersCount: 0,
    usuariosCount: 0,
    totalUsers: 0,
    totalUsuarios: 0,
    usersTotal: 0,
    usuariosTotal: 0,

    clientsCount: 0,
    clientesCount: 0,
    customersCount: 0,
    totalClients: 0,
    totalClientes: 0,
    totalCustomers: 0,
    clientsTotal: 0,
    clientesTotal: 0,
    customersTotal: 0,
  });
}

export function getSummaryValue(summary = {}, keys = [], fallback = 0) {
  const source = safeObject(summary);

  return safeNumber(
    first(
      ...safeArray(keys).map((key) => source[key]),
      fallback
    ),
    fallback
  );
}

export function getBestSummaryNumber(input = {}, keys = [], fallback = 0) {
  return getSummaryValue(getSummary(input), keys, fallback);
}

/* =========================================================
   COLLECTIONS
========================================================= */

export function unwrapCollectionPayload(value = null) {
  if (Array.isArray(value)) return value;

  const object = safeObject(value, null);

  if (!object) return [];

  return safeArray(
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
}

export function getRemoteCountFromCollection(value = null, fallback = 0) {
  if (Array.isArray(value)) return Math.max(value.length, fallback);

  const object = safeObject(value, null);

  if (!object) return fallback;

  return Math.max(
    fallback,
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
        fallback
      ),
      fallback
    )
  );
}

export function normalizeCollection(value = null, aliases = []) {
  const items = unwrapCollectionPayload(value);

  if (items.length) {
    const remoteCount = getRemoteCountFromCollection(value, items.length);

    return {
      items,
      total: remoteCount,
      totalCount: remoteCount,
      remoteCount,
      visibleCount: items.length,
    };
  }

  const object = safeObject(value, null);

  if (object) {
    for (const alias of safeArray(aliases)) {
      const candidate = object[alias];

      if (Array.isArray(candidate)) {
        return normalizeCollection(candidate, aliases);
      }

      if (isObject(candidate)) {
        const normalized = normalizeCollection(candidate, aliases);

        if (normalized.items.length || normalized.remoteCount > 0) {
          return normalized;
        }
      }
    }
  }

  return {
    items: [],
    total: 0,
    totalCount: 0,
    remoteCount: 0,
    visibleCount: 0,
  };
}

export function resolveCollectionSource(input = {}, aliases = []) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getNormalizedDashboard(input);

  const sources = [
    data,
    state,
    dashboard,
    dashboard.collections,
    dashboard.resources,
    dashboard.lists,
  ].filter(hasKeys);

  for (const source of sources) {
    for (const alias of safeArray(aliases)) {
      const value = source?.[alias];

      if (Array.isArray(value)) return normalizeCollection(value, aliases);

      if (isObject(value)) {
        const normalized = normalizeCollection(value, aliases);

        if (normalized.items.length || normalized.remoteCount > 0) {
          return normalized;
        }
      }
    }
  }

  return normalizeCollection([], aliases);
}

/* =========================================================
   WIDGETS
   Compatibilidad: se normalizan, pero ya no gobiernan las cards principales.
========================================================= */

export function getWidgets(input = {}) {
  const dashboard = getNormalizedDashboard(input);
  const admin = isAdminRole(getRole(input));

  return normalizeHomeWidgets(
    first(
      input.widgets,
      input.state?.widgets,
      dashboard.widgets,
      dashboard.cards,
      dashboard.kpis,
      dashboard.blocks,
      []
    ),
    admin
  );
}

export function getWidgetId(item = {}) {
  return getHomeWidgetId(item);
}

export function getWidgetTitle(item = {}) {
  return safeText(first(item.label, item.title, item.name), "Métrica");
}

export function getWidgetText(item = {}) {
  return safeText(first(item.text, item.description, item.subtitle), "");
}

export function getWidgetValue(item = {}) {
  return first(item.value, item.count, item.total, 0);
}

export function getWidgetTrend(item = {}) {
  return safeText(first(item.trend, item.delta, item.change), "");
}

export function getWidgetType(item = {}) {
  return normalizeKey(first(item.type, item.kind, item.modifier, item.variant, "widget"));
}

export function getWidgetRoute(item = {}) {
  const explicit = normalizeRoute(first(item.route, item.href, item.to, ""));

  if (explicit) return explicit;

  const identity = normalizeKey(
    [
      item.id,
      item.key,
      item.type,
      item.kind,
      item.modifier,
      item.iconName,
      item.label,
      item.title,
      item.text,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (identity.includes("factur") || identity.includes("invoice") || identity.includes("billing")) {
    return HOME_ROUTES.FACTURAS;
  }

  if (identity.includes("cliente") || identity.includes("client") || identity.includes("customer")) {
    return HOME_ROUTES.CLIENTES;
  }

  if (identity.includes("usuario") || identity.includes("user") || identity.includes("member")) {
    return HOME_ROUTES.USUARIOS;
  }

  return HOME_ROUTES.INCIDENCIAS;
}

export function getWidgetNumericValue(item = {}) {
  return safeNumber(getWidgetValue(item), 0);
}

/* =========================================================
   TICKETS
========================================================= */

export function getTicketIdentity(item = {}) {
  return getTicketId(item);
}

export function getTicketId(item = {}) {
  return getHomeTicketId(item);
}

export function getTicketUniqueKey(item = {}) {
  return normalizeKey(getTicketId(item));
}

export function getTicketSubject(item = {}) {
  return getHomeTicketSubject(item);
}

export function getTicketDescription(item = {}) {
  return getHomeTicketDescription(item);
}

export function getTicketOwnerName(item = {}) {
  return visualText(
    first(
      item.ownerName,
      item.requesterName,
      item.clientName,
      item.userName,
      item.createdByName,
      item.authorName
    ),
    "Usuario"
  );
}

export function getTicketOwnerEmail() {
  return "";
}

export function getTicketAvatarUrl(item = {}) {
  return safeImageSrc(
    first(
      item.avatarUrl,
      item.requesterAvatarUrl,
      item.userAvatarUrl,
      item.photoUrl,
      item.photoURL,
      ""
    )
  );
}

export function getTicketStatus(item = {}) {
  return getTicketStatusKey(item);
}

export function getTicketStatusKey(item = {}) {
  try {
    return modelTicketStatusKey(item);
  } catch {
    return safeText(first(item.status, item.estado, "pending"), "pending");
  }
}

export function getTicketStatusLabel(item = {}) {
  try {
    return modelTicketStatusLabel(item);
  } catch {
    const key = getTicketStatusKey(item);

    if (key === "open") return "Abierta";
    if (key === "progress") return "En curso";
    if (key === "resolved") return "Resuelta";
    if (key === "closed") return "Cerrada";

    return "Pendiente";
  }
}

export function getTicketPriorityRaw(item = {}) {
  return safeText(first(item.priority, item.prioridad, item.severity, item.urgency), "medium");
}

export function getTicketPriorityKey(item = {}) {
  try {
    return modelTicketPriorityKey(item);
  } catch {
    const key = normalizeKey(getTicketPriorityRaw(item));

    if (["critical", "critica", "critico", "p0", "blocker"].includes(key)) return "critical";
    if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) return "urgent";
    if (["low", "baja", "minor", "p3"].includes(key)) return "low";

    return "medium";
  }
}

export function getTicketPriorityLabel(item = {}) {
  try {
    return modelTicketPriorityLabel(item);
  } catch {
    const key = getTicketPriorityKey(item);

    if (key === "critical") return "Crítica";
    if (key === "urgent") return "Alta";
    if (key === "low") return "Baja";

    return "Media";
  }
}

export function isTicketUrgent(item = {}) {
  return ["critical", "urgent"].includes(getTicketPriorityKey(item));
}

export function isTicketClosedLike(item = {}) {
  return TICKET_CLOSED_KEYS.includes(getTicketStatusKey(item));
}

export function isTicketOpenLike(item = {}) {
  return TICKET_OPEN_KEYS.includes(getTicketStatusKey(item));
}

export function getTicketCategory(item = {}) {
  return getHomeTicketCategory(item);
}

export function getTicketTechnician(item = {}, users = []) {
  try {
    return resolveHomeTicketTechnician(item, users);
  } catch {
    const name = safeText(
      first(
        item.technicianName,
        item.tecnicoName,
        item.assignedToName,
        item.assignedTo
      ),
      "Sin asignar"
    );

    return {
      id: "",
      userId: "",
      displayName: name,
      name,
      initials: getInitials(name, "?"),
      avatarUrl: "",
      assigned: name !== "Sin asignar",
    };
  }
}

export function getTicketAssignedTo(item = {}, users = []) {
  return getTicketTechnician(item, users);
}

export function getTicketCreatedAt(item = {}) {
  return getHomeTicketCreatedAt(item);
}

export function getTicketUpdatedAt(item = {}) {
  return getHomeTicketUpdatedAt(item);
}

export function getTicketAttachmentsCount(item = {}) {
  const attachments = first(item.attachments, item.files, item.adjuntos, item.documents);

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

export function getTicketSortTimestamp(item = {}) {
  return toTimestamp(first(getTicketUpdatedAt(item), item.lastActivityAt, getTicketCreatedAt(item)));
}

export function compareTicketsNewestFirst(a = {}, b = {}) {
  const diff = getTicketSortTimestamp(b) - getTicketSortTimestamp(a);

  if (diff !== 0) return diff;

  return safeText(getTicketId(b)).localeCompare(
    safeText(getTicketId(a)),
    DEFAULT_LOCALE,
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

export function sortTicketsNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareTicketsNewestFirst);
}

export function getRecentTickets(input = {}, limit = DEFAULT_RECENT_LIMIT) {
  return sortTicketsNewestFirst(getCollections(input).tickets).slice(0, clampNumber(limit, 1, 50));
}

export function getTicketLinkedInvoices(ticket = {}, invoices = []) {
  try {
    return resolveHomeTicketInvoices(ticket, invoices);
  } catch {
    return safeArray(first(ticket.invoices, ticket.facturas, []));
  }
}

export function buildTicketTableRow(ticket = {}, input = {}) {
  const collections = getCollections(input);
  const normalized = normalizeHomeTickets([ticket], {
    invoices: collections.invoices,
    users: collections.users,
  })[0] || safeObject(ticket);

  const technician = getTicketTechnician(normalized, collections.users);
  const linkedInvoices = getTicketLinkedInvoices(normalized, collections.invoices);
  const ticketId = getTicketId(normalized);

  return sanitizeObject({
    ...normalized,

    id: ticketId,
    ticketId,
    incidenciaId: ticketId,

    subject: getTicketSubject(normalized),
    title: getTicketSubject(normalized),
    description: getTicketDescription(normalized),
    preview: getTicketDescription(normalized),

    status: getTicketStatusKey(normalized),
    statusKey: getTicketStatusKey(normalized),
    statusLabel: getTicketStatusLabel(normalized),

    priority: getTicketPriorityKey(normalized),
    priorityKey: getTicketPriorityKey(normalized),
    priorityLabel: getTicketPriorityLabel(normalized),

    category: getTicketCategory(normalized),

    ownerName: getTicketOwnerName(normalized),
    avatarUrl: getTicketAvatarUrl(normalized),
    initials: getInitials(getTicketOwnerName(normalized), "U"),

    technician,
    tecnico: technician,
    assignedTo: technician.displayName,
    assignedToName: technician.displayName,

    invoices: linkedInvoices,
    facturas: linkedInvoices,
    invoiceIds: linkedInvoices.map(getInvoiceId).filter(Boolean),
    facturaIds: linkedInvoices.map(getInvoiceId).filter(Boolean),

    createdAt: getTicketCreatedAt(normalized),
    updatedAt: getTicketUpdatedAt(normalized),

    attachmentsCount: getTicketAttachmentsCount(normalized),

    action: ACTIONS.OPEN_TICKET_DETAIL,
    dataAction: ACTIONS.OPEN_TICKET_DETAIL,
  });
}

export function getTicketTableRows(input = {}, limit = DEFAULT_PAGE_SIZE) {
  const collections = getCollections(input);
  const pagination = getPagination(collections.tickets, input);
  const rows = pagination.pageItems.length
    ? pagination.pageItems
    : collections.tickets.slice(0, clampNumber(limit, 1, 50));

  return rows.map((ticket) => buildTicketTableRow(ticket, input));
}

export function getSelectedTicketId(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return safeText(
    first(
      data.selectedTicketId,
      data.selectedIncidenciaId,
      state.selectedTicketId,
      state.selectedIncidenciaId,
      ""
    ),
    ""
  );
}

export function getSelectedTicket(input = {}) {
  const selectedTicketId = getSelectedTicketId(input);

  if (!selectedTicketId) return null;

  return findHomeTicketById(getCollections(input).tickets, selectedTicketId);
}

export function buildTicketModalData(input = {}) {
  const ticket = getSelectedTicket(input);
  const collections = getCollections(input);

  if (!ticket) {
    return {
      open: false,
      ticket: null,
      incidencia: null,
      invoices: [],
      facturas: [],
      technician: null,
      tecnico: null,
    };
  }

  const row = buildTicketTableRow(ticket, input);

  return {
    open: true,
    ticket: row,
    incidencia: row,
    ticketId: row.ticketId,
    incidenciaId: row.incidenciaId,
    invoices: row.invoices,
    facturas: row.facturas,
    technician: row.technician || getTicketTechnician(row, collections.users),
    tecnico: row.tecnico || getTicketTechnician(row, collections.users),
  };
}

/* =========================================================
   INVOICES
========================================================= */

export function getInvoiceIdentity(item = {}) {
  return getInvoiceId(item);
}

export function getInvoiceId(item = {}) {
  return getHomeInvoiceId(item);
}

export function getInvoiceUniqueKey(item = {}) {
  return normalizeKey(getInvoiceId(item));
}

export function getInvoiceAmount(item = {}) {
  try {
    return modelGetInvoiceAmount(item);
  } catch {
    return safeNumber(first(item.total, item.amount, item.importe, 0), 0);
  }
}

export function getInvoicePaidAmount(item = {}) {
  try {
    return modelGetInvoicePaidAmount(item);
  } catch {
    return isInvoicePaid(item) ? getInvoiceAmount(item) : 0;
  }
}

export function getInvoicePendingAmount(item = {}) {
  try {
    return modelGetInvoicePendingAmount(item);
  } catch {
    return isInvoicePendingLike(item)
      ? Math.max(0, getInvoiceAmount(item) - getInvoicePaidAmount(item))
      : 0;
  }
}

export function getInvoiceCurrency(item = {}) {
  try {
    return modelGetInvoiceCurrency(item);
  } catch {
    return safeText(first(item.currency, item.moneda, DEFAULT_CURRENCY), DEFAULT_CURRENCY).toUpperCase();
  }
}

export function getInvoiceStatusKey(item = {}) {
  try {
    return modelInvoiceStatusKey(item);
  } catch {
    const key = normalizeKey(first(item.paymentStatus, item.estadoPago, item.status, item.estado, "pending"));

    if (["paid", "pagada", "pagado", "cobrada", "cobrado"].includes(key)) return "paid";
    if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";
    if (["partial", "parcial", "pago_parcial"].includes(key)) return "partial";
    if (["cancelled", "canceled", "cancelada", "cancelado"].includes(key)) return "cancelled";
    if (["draft", "borrador"].includes(key)) return "draft";

    return "pending";
  }
}

export function getInvoiceStatusLabel(item = {}) {
  try {
    return modelInvoiceStatusLabel(item);
  } catch {
    const key = getInvoiceStatusKey(item);

    if (key === "paid") return "Pagada";
    if (key === "overdue") return "Vencida";
    if (key === "partial") return "Parcial";
    if (key === "cancelled") return "Cancelada";
    if (key === "draft") return "Borrador";

    return "Pendiente";
  }
}

export function isInvoicePaid(item = {}) {
  try {
    return modelIsInvoicePaid(item);
  } catch {
    return getInvoiceStatusKey(item) === "paid";
  }
}

export function isInvoicePendingLike(item = {}) {
  try {
    return modelIsInvoicePendingLike(item);
  } catch {
    return INVOICE_PENDING_KEYS.includes(getInvoiceStatusKey(item));
  }
}

export function getInvoiceDate(item = {}) {
  return first(item.issuedAt, item.createdAt, item.date, item.fechaEmision);
}

export function getInvoiceUpdatedAt(item = {}) {
  return first(item.updatedAt, item.paidAt, item.issuedAt, item.createdAt);
}

export function compareInvoicesNewestFirst(a = {}, b = {}) {
  return toTimestamp(getInvoiceUpdatedAt(b)) - toTimestamp(getInvoiceUpdatedAt(a));
}

export function sortInvoicesNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareInvoicesNewestFirst);
}

export function getRecentInvoices(input = {}, limit = DEFAULT_RECENT_LIMIT) {
  return sortInvoicesNewestFirst(getCollections(input).invoices).slice(0, clampNumber(limit, 1, 50));
}

export function buildInvoiceRow(invoice = {}) {
  const invoiceId = getInvoiceId(invoice);

  return sanitizeObject({
    ...invoice,

    id: invoiceId,
    invoiceId,
    facturaId: invoiceId,

    title: safeText(first(invoice.title, invoice.name, invoice.concepto, `Factura ${invoiceId}`), "Factura"),

    amount: getInvoiceAmount(invoice),
    paidAmount: getInvoicePaidAmount(invoice),
    pendingAmount: getInvoicePendingAmount(invoice),
    currency: getInvoiceCurrency(invoice),

    status: getInvoiceStatusKey(invoice),
    statusKey: getInvoiceStatusKey(invoice),
    statusLabel: getInvoiceStatusLabel(invoice),

    paid: isInvoicePaid(invoice),
    isPaid: isInvoicePaid(invoice),

    date: getInvoiceDate(invoice),
    updatedAt: getInvoiceUpdatedAt(invoice),
  });
}

export function getInvoiceRows(input = {}, limit = DEFAULT_RECENT_LIMIT) {
  return getRecentInvoices(input, limit).map(buildInvoiceRow);
}

/* =========================================================
   USERS / CLIENTS
========================================================= */

export function getUserId(item = {}) {
  return getHomeUserId(item);
}

export function getUserUniqueKey(item = {}) {
  return normalizeKey(getUserId(item));
}

export function isActiveUser(item = {}) {
  return item.active !== false && item.isActive !== false && item.enabled !== false;
}

export function getClientId(item = {}) {
  return getHomeClientId(item);
}

export function getClientUniqueKey(item = {}) {
  return normalizeKey(getClientId(item));
}

export function isActiveClient(item = {}) {
  return item.active !== false && item.isActive !== false && item.enabled !== false;
}

/* =========================================================
   COLLECTIONS / STATS
========================================================= */

export function getCollections(input = {}) {
  const data = safeObject(input);
  const dashboard = getNormalizedDashboard(data);
  const admin = isAdminRole(getRole(data));

  const rawInvoices = first(
    data.invoices,
    data.facturas,
    data.state?.invoices,
    data.state?.facturas,
    dashboard.invoices,
    dashboard.facturas,
    []
  );

  const rawUsers = admin
    ? first(
        data.users,
        data.usuarios,
        data.state?.users,
        data.state?.usuarios,
        dashboard.users,
        dashboard.usuarios,
        []
      )
    : [];

  const tickets = normalizeHomeTickets(
    first(
      data.tickets,
      data.incidencias,
      data.state?.tickets,
      data.state?.incidencias,
      dashboard.tickets,
      dashboard.incidencias,
      []
    ),
    {
      invoices: rawInvoices,
      users: rawUsers,
    }
  );

  const invoices = normalizeHomeInvoices(rawInvoices);

  const users = admin
    ? normalizeHomeUsers(rawUsers)
    : [];

  const clients = admin
    ? normalizeHomeClients(
        first(
          data.clients,
          data.clientes,
          data.customers,
          data.state?.clients,
          data.state?.clientes,
          data.state?.customers,
          dashboard.clients,
          dashboard.clientes,
          dashboard.customers,
          []
        )
      )
    : [];

  const widgets = normalizeHomeWidgets(
    first(
      data.widgets,
      data.cards,
      data.kpis,
      data.blocks,
      data.state?.widgets,
      data.state?.cards,
      dashboard.widgets,
      dashboard.cards,
      []
    ),
    admin
  );

  const activity = normalizeHomeActivityList(
    first(
      data.activity,
      data.recentActivity,
      data.recent,
      data.state?.activity,
      data.state?.recentActivity,
      dashboard.activity,
      dashboard.recentActivity,
      []
    ),
    admin
  );

  return {
    tickets,
    incidencias: tickets,

    invoices,
    facturas: invoices,

    users,
    usuarios: users,

    clients,
    clientes: clients,
    customers: clients,

    widgets,
    cards: widgets,
    kpis: widgets,
    blocks: widgets,

    activity,
    recent: activity,
    recentActivity: activity,
  };
}

export function getLatestDateFromTickets(tickets = []) {
  const timestamps = safeArray(tickets)
    .map((ticket) => toTimestamp(first(getTicketUpdatedAt(ticket), getTicketCreatedAt(ticket))))
    .filter(Boolean);

  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : "";
}

export function computeHomeStats(input = {}) {
  const collections = getCollections(input);
  const summary = getSummary(input);
  const admin = isAdminRole(getRole(input));

  const pendingTickets = collections.tickets.filter((ticket) => getTicketStatusKey(ticket) === "pending").length;
  const openTickets = collections.tickets.filter((ticket) => getTicketStatusKey(ticket) === "open").length;
  const progressTickets = collections.tickets.filter((ticket) => getTicketStatusKey(ticket) === "progress").length;
  const resolvedTickets = collections.tickets.filter((ticket) => getTicketStatusKey(ticket) === "resolved").length;
  const closedTickets = collections.tickets.filter((ticket) => getTicketStatusKey(ticket) === "closed").length;

  const paidInvoices = collections.invoices.filter(isInvoicePaid).length;
  const pendingInvoices = collections.invoices.filter(isInvoicePendingLike).length;
  const invoiceAmount = collections.invoices.reduce((total, invoice) => total + getInvoicePaidAmount(invoice), 0);

  return sanitizeObject({
    role: getRole(input),
    admin,

    totalTickets: getSummaryValue(summary, ["totalTickets", "ticketsTotal", "incidenciasTotal", "ticketsCount", "incidenciasCount"], collections.tickets.length),
    activeTickets: getSummaryValue(summary, ["activeTickets", "activeIncidencias"], pendingTickets + openTickets + progressTickets),
    pendingTickets: getSummaryValue(summary, ["pendingTickets", "pendingIncidencias"], pendingTickets),
    openTickets: getSummaryValue(summary, ["openTickets", "openIncidencias"], openTickets),
    progressTickets: getSummaryValue(summary, ["progressTickets", "progressIncidencias"], progressTickets),
    resolvedTickets: getSummaryValue(summary, ["resolvedTickets", "resolvedIncidencias"], resolvedTickets),
    closedTickets: getSummaryValue(summary, ["closedTickets", "closedIncidencias"], closedTickets),

    totalInvoices: getSummaryValue(summary, ["totalInvoices", "invoicesTotal", "facturasTotal", "invoicesCount", "facturasCount"], collections.invoices.length),
    paidInvoices: getSummaryValue(summary, ["paidInvoices", "paidFacturas"], paidInvoices),
    pendingInvoices: getSummaryValue(summary, ["pendingInvoices", "pendingFacturas"], pendingInvoices),
    invoiceAmount: getSummaryValue(summary, ["invoiceAmount", "paidInvoiceAmount", "billingTotal", "totalFacturado"], invoiceAmount),
    paidInvoiceAmount: getSummaryValue(summary, ["paidInvoiceAmount", "invoiceAmount"], invoiceAmount),

    totalUsers: admin ? getSummaryValue(summary, ["totalUsers", "usersTotal", "usuariosTotal", "usersCount", "usuariosCount"], collections.users.length) : 0,
    totalClients: admin ? getSummaryValue(summary, ["totalClients", "totalClientes", "totalCustomers", "clientsCount", "clientesCount", "customersCount"], collections.clients.length) : 0,

    latestTicketAt: getLatestDateFromTickets(collections.tickets),
  });
}

export function getStatusPills(input = {}) {
  const stats = computeHomeStats(input);

  return [
    {
      key: "pending",
      label: "Pendientes",
      value: stats.pendingTickets,
      status: "pending",
    },
    {
      key: "open",
      label: "Abiertas",
      value: stats.openTickets,
      status: "open",
    },
    {
      key: "progress",
      label: "En curso",
      value: stats.progressTickets,
      status: "progress",
    },
    {
      key: "closed",
      label: "Cerradas",
      value: stats.closedTickets,
      status: "closed",
    },
  ];
}

function statCard({
  id = "",
  label = "",
  value = 0,
  text = "",
  iconName = "activity",
  route = "",
  modifier = "",
  adminOnly = false,
} = {}) {
  const safeRoute = normalizeRoute(route);

  if (!safeRoute) return null;

  if (adminOnly && !isAdminOnlyRoute(safeRoute)) {
    return null;
  }

  return sanitizeObject({
    id,
    key: id,
    widgetId: id,
    label,
    title: label,
    value,
    text,
    iconName,
    route: safeRoute,
    href: safeRoute,
    modifier,
    adminOnly,
    action: ACTIONS.NAVIGATE,
    dataAction: ACTIONS.NAVIGATE,
  });
}

export function getStatCards(input = {}) {
  const admin = isAdminRole(getRole(input));
  const stats = computeHomeStats(input);

  return [
    statCard({
      id: "incidencias",
      label: admin ? "Incidencias" : "Mis incidencias",
      value: stats.totalTickets,
      text: "Incidencias visibles en el panel.",
      iconName: "ticket",
      route: HOME_ROUTES.INCIDENCIAS,
      modifier: "tickets",
    }),
    statCard({
      id: "facturas-totales",
      label: "Facturas totales",
      value: stats.totalInvoices,
      text: `Importe total: ${formatNumber(stats.invoiceAmount)}`,
      iconName: "euro",
      route: HOME_ROUTES.FACTURAS,
      modifier: "invoice-total",
    }),
    admin
      ? statCard({
          id: "clientes",
          label: "Clientes",
          value: stats.totalClients,
          text: "Clientes visibles.",
          iconName: "client",
          route: HOME_ROUTES.CLIENTES,
          modifier: "clients",
          adminOnly: true,
        })
      : null,
    admin && HOME_ROUTES.USUARIOS
      ? statCard({
          id: "usuarios",
          label: "Usuarios",
          value: stats.totalUsers,
          text: "Usuarios visibles.",
          iconName: "users",
          route: HOME_ROUTES.USUARIOS,
          modifier: "users",
          adminOnly: true,
        })
      : null,
  ].filter(Boolean);
}

/*
   Compatibilidad de API pública:
   El template actual no pinta quick actions. Se mantiene export estable,
   pero no se generan accesos rápidos duplicados.
*/
export function getQuickActions() {
  return [];
}

/* =========================================================
   ACTIVITY / PAGINATION
========================================================= */

function activityVisibleForRole(input = {}, item = {}) {
  if (isAdminRole(getRole(input))) return true;

  const type = normalizeKey(first(item.type, item.kind, item.category, ""));

  if (["client", "cliente", "customer", "user", "usuario", "member", "server", "servidor"].includes(type)) {
    return false;
  }

  const route = normalizeRoute(first(item.route, item.href, item.link, item.to, ""));

  if (route && isAdminOnlyRoute(route)) return false;

  const identity = [
    item.entity,
    item.resource,
    item.collection,
    item.targetType,
    item.meta?.entity,
    item.meta?.type,
    type,
  ]
    .filter(Boolean)
    .join(" ");

  return !isAdminEntityValue(identity);
}

export function buildSyntheticActivity(input = {}, limit = DEFAULT_RECENT_LIMIT) {
  const collections = getCollections(input);
  const admin = isAdminRole(getRole(input));

  return normalizeHomeActivityList(
    buildHomeActivityFromCollections({
      tickets: collections.tickets,
      invoices: collections.invoices,
      users: admin ? collections.users : [],
      clients: admin ? collections.clients : [],
      limit,
    }),
    admin
  )
    .filter((item) => activityVisibleForRole(input, item))
    .slice(0, clampNumber(limit, 1, 50));
}

export function getActivity(input = {}, limit = DEFAULT_RECENT_LIMIT) {
  const collections = getCollections(input);
  const max = clampNumber(limit, 1, 50);

  const activity = collections.activity.length
    ? normalizeHomeActivityList(collections.activity, isAdminRole(getRole(input)))
    : buildSyntheticActivity(input, max);

  return activity
    .filter((item) => activityVisibleForRole(input, item))
    .slice(0, max);
}

export function getActivityTitle(item = {}) {
  return safeText(first(item.title, item.name, item.subject, item.label), "Actividad registrada");
}

export function getActivityText(item = {}) {
  return safeText(first(item.text, item.description, item.message, item.detail, item.preview), "Sin detalle adicional.");
}

export function getActivityDate(item = {}) {
  return first(item.date, item.createdAt, item.updatedAt, item.timestamp);
}

export function getActivityType(item = {}) {
  const key = normalizeKey(first(item.type, item.kind, item.category, "activity"));

  if (["factura", "invoice", "billing", "bill"].includes(key)) return "invoice";
  if (["ticket", "incidencia", "support", "issue"].includes(key)) return "ticket";
  if (["cliente", "client", "customer"].includes(key)) return "client";
  if (["usuario", "user", "member"].includes(key)) return "user";

  return key || "activity";
}

export function getPagination(items = [], input = {}) {
  const rows = safeArray(items);
  const data = safeObject(input);
  const state = safeObject(data.state);

  const pageSize = clampNumber(first(data.pageSize, state.pageSize, DEFAULT_PAGE_SIZE), 1, 50);
  const totalCount = Math.max(
    rows.length,
    safeNumber(first(data.totalCount, data.remoteCount, state.totalCount, rows.length), rows.length)
  );
  const totalPages = Math.max(1, Math.ceil((totalCount || 1) / pageSize));
  const page = clampNumber(first(data.page, state.page, 1), 1, totalPages);
  const start = (page - 1) * pageSize;
  const pageItems = rows.slice(start, start + pageSize);

  return {
    allItems: rows,
    pageItems,
    items: pageItems,
    page,
    currentPage: page,
    pageSize,
    totalPages,
    totalCount,
    total: totalCount,
    rangeStart: totalCount && pageItems.length ? start + 1 : 0,
    rangeEnd: totalCount ? Math.min(start + pageItems.length, totalCount) : 0,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

/* =========================================================
   TEMPLATE DATA
========================================================= */

export function buildHomeTemplateData(input = {}) {
  const source = safeObject(input);
  const dashboard = getNormalizedDashboard(source);
  const role = getRole(source);
  const admin = isAdminRole(role);
  const user = getUser(source);

  const scopedSource = {
    ...source,
    role,
    admin,
  };

  const collections = getCollections(scopedSource);
  const tickets = collections.tickets;
  const invoices = collections.invoices;
  const users = admin ? collections.users : [];
  const clients = admin ? collections.clients : [];
  const activity = getActivity(scopedSource, DEFAULT_RECENT_LIMIT);
  const summary = getSummary(scopedSource);
  const stats = computeHomeStats(scopedSource);
  const pagination = getPagination(tickets, scopedSource);
  const ticketRows = getTicketTableRows(scopedSource);
  const invoiceRows = getInvoiceRows(scopedSource);
  const selectedTicketId = getSelectedTicketId(scopedSource);
  const selectedTicket = selectedTicketId ? getSelectedTicket(scopedSource) : null;
  const ticketModal = buildTicketModalData(scopedSource);
  const widgets = getWidgets(scopedSource);

  return sanitizeObject({
    role,
    admin,

    user,
    currentUser: user,
    sidebarUser: user,

    displayName: user.displayName,
    name: user.displayName,
    fullName: user.displayName,
    avatarUrl: user.avatarUrl,
    initials: user.initials,

    dashboard,
    summary,
    stats,

    statCards: getStatCards(scopedSource),
    statusPills: getStatusPills(scopedSource),
    widgets,
    quickActions: [],

    tickets,
    incidencias: tickets,
    recentTickets: getRecentTickets(scopedSource),
    recentIncidencias: getRecentTickets(scopedSource),
    ticketRows,
    incidenceRows: ticketRows,
    tableRows: ticketRows,

    invoices,
    facturas: invoices,
    recentInvoices: getRecentInvoices(scopedSource),
    recentFacturas: getRecentInvoices(scopedSource),
    invoiceRows,
    facturaRows: invoiceRows,

    users,
    usuarios: users,

    clients,
    clientes: clients,
    customers: clients,

    activity,
    recentActivity: activity,

    collections: {
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
      widgets,
    },

    pagination,
    pageItems: pagination.pageItems,

    selectedTicketId,
    selectedIncidenciaId: selectedTicketId,
    selectedTicket,
    selectedIncidencia: selectedTicket,
    ticketModal,
    incidenciaModal: ticketModal,

    lastUpdatedAt: first(
      source.lastUpdatedAt,
      source.lastSyncAt,
      source.state?.lastUpdatedAt,
      source.state?.lastSyncAt,
      dashboard.updatedAt,
      dashboard.generatedAt,
      dashboard.lastSyncAt,
      ""
    ),
    requestId: safeText(
      first(
        source.requestId,
        source.state?.requestId,
        dashboard.requestId,
        dashboard.meta?.requestId,
        ""
      ),
      ""
    ),
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeSelectorsSnapshot() {
  return sanitizeObject({
    version: HOME_SELECTORS_VERSION,
    source: "views.home.selectors",

    routes: HOME_ROUTES,

    policy: {
      selectorsOnly: true,
      templateAligned: true,
      modelBackedNormalization: true,

      statCardsIgnoreLegacyWidgets: true,
      noQuickActionsVisible: true,
      twoUserCardsOnly: true,
      adminCardsOnlyForAdmin: true,

      noFetch: true,
      noAuth: true,
      noRouter: true,
      noStorage: true,
      noCssInline: true,

      routesFromCoreConfig: true,
      adminRoutesFromCoreConfig: true,
      blockedRoutesFromCoreConfig: true,

      userNeverExposesUsersClients: true,
      limitsOnlyVisibleLists: true,
      countersUseFullTotals: true,

      ticketModalPreparedHere: true,
      technicianAndInvoicesFromModel: true,

      noHomeRoute: true,
      noHealthServerReadyPing: true,
      noEmailIdentity: true,
      noRawBackendPayloadInOutput: true,

      snapshotRedacted: true,
    },
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HOME_SELECTORS_VERSION,

  DEFAULT_PAGE_SIZE,
  DEFAULT_RECENT_LIMIT,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  HOME_ROUTES,
  VALID_ROLES,
  TICKET_STATUS_KEYS,
  TICKET_OPEN_KEYS,
  TICKET_CLOSED_KEYS,
  INVOICE_STATUS_KEYS,
  INVOICE_PENDING_KEYS,

  safeText,
  safeNumber,
  safeArray,
  safeObject,
  isObject,
  hasKeys,
  first,
  normalizeWhitespace,
  normalizeText,
  normalizeKey,
  clampNumber,
  roundMoney,
  getPath,
  firstPath,
  uniqueBy,
  toTimestamp,
  normalizeRoute,
  isSameIdentity,

  getNumberFormatter,
  formatNumber,
  getMoneyFormatter,
  formatMoney,
  getDateTimeFormatter,
  getDateFormatter,
  formatDateTime,
  formatDateShort,
  formatRelativeDate,
  formatLastUpdate,

  getInitials,

  getDashboard,
  getNormalizedDashboard,
  getSummary,
  getSummaryValue,
  getBestSummaryNumber,

  unwrapCollectionPayload,
  normalizeCollection,
  getRemoteCountFromCollection,
  resolveCollectionSource,

  getWidgets,
  getWidgetId,
  getWidgetTitle,
  getWidgetText,
  getWidgetValue,
  getWidgetTrend,
  getWidgetType,
  getWidgetRoute,
  getWidgetNumericValue,

  normalizeRole,
  getUser,
  getRole,
  isAdminRole,
  isUserRole,
  canSeeUsersModule,
  canSeeClientsModule,
  getDisplayName,
  getAvatarUrl,

  getTicketIdentity,
  getTicketId,
  getTicketUniqueKey,
  getTicketSubject,
  getTicketDescription,
  getTicketOwnerName,
  getTicketOwnerEmail,
  getTicketAvatarUrl,
  getTicketStatus,
  getTicketStatusKey,
  getTicketStatusLabel,
  getTicketPriorityRaw,
  getTicketPriorityKey,
  getTicketPriorityLabel,
  isTicketUrgent,
  isTicketClosedLike,
  isTicketOpenLike,
  getTicketCategory,
  getTicketTechnician,
  getTicketAssignedTo,
  getTicketCreatedAt,
  getTicketUpdatedAt,
  getTicketAttachmentsCount,
  getTicketSortTimestamp,
  compareTicketsNewestFirst,
  sortTicketsNewestFirst,
  getRecentTickets,
  getTicketLinkedInvoices,
  buildTicketTableRow,
  getTicketTableRows,
  getSelectedTicketId,
  getSelectedTicket,
  buildTicketModalData,

  getInvoiceIdentity,
  getInvoiceId,
  getInvoiceUniqueKey,
  getInvoiceAmount,
  getInvoicePaidAmount,
  getInvoicePendingAmount,
  getInvoiceCurrency,
  getInvoiceStatusKey,
  getInvoiceStatusLabel,
  isInvoicePaid,
  isInvoicePendingLike,
  getInvoiceDate,
  getInvoiceUpdatedAt,
  compareInvoicesNewestFirst,
  sortInvoicesNewestFirst,
  getRecentInvoices,
  buildInvoiceRow,
  getInvoiceRows,

  getUserId,
  getUserUniqueKey,
  isActiveUser,

  getClientId,
  getClientUniqueKey,
  isActiveClient,

  getCollections,
  getLatestDateFromTickets,
  computeHomeStats,
  getStatusPills,
  getStatCards,
  getQuickActions,

  buildSyntheticActivity,
  getActivity,
  getActivityTitle,
  getActivityText,
  getActivityDate,
  getActivityType,

  getPagination,
  buildHomeTemplateData,

  getHomeSelectorsSnapshot,
  getDebugSnapshot: getHomeSelectorsSnapshot,
};
