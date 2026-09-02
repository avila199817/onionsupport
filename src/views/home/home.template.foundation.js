/* =========================================================
   Onion Support - Home Template · generated domain module
   Shared by /src/views/home/home.template.js
========================================================= */

export const HOME_TEMPLATE_VERSION =
  "home.template.private.v14.extreme-shared-icons";

export const HOME_ACTIONS = Object.freeze({
  RETRY: "retry",
  NAVIGATE: "navigate",
});

export const DEFAULT_ROUTES = Object.freeze({
  home: "/dashboard",
  incidencias: "/incidencias",
  facturas: "/facturas",
  clientes: "/clientes",
  usuarios: "/usuarios",
  servidor: "/servidor",
  cuenta: "/cuenta",
  ajustes: "/ajustes",
});

const STATUS_LABELS = Object.freeze({
  open: "Abierta",
  opened: "Abierta",
  new: "Nueva",
  pending: "Pendiente",
  in_progress: "En curso",
  progress: "En curso",
  processing: "En curso",
  resolved: "Resuelta",
  closed: "Cerrada",
  solved: "Resuelta",

  paid: "Pagada",
  unpaid: "Pendiente",
  pending_payment: "Pendiente",
  partial: "Parcial",
  overdue: "Vencida",
  issued: "Emitida",
  draft: "Borrador",
  cancelled: "Cancelada",
  canceled: "Cancelada",
  refunded: "Reembolsada",

  active: "Activo",
  inactive: "Inactivo",
  enabled: "Activo",
  disabled: "Inactivo",
});

const ICON_ALIASES = Object.freeze({
  home: "home",
  inicio: "home",
  dashboard: "home",

  incidencia: "incidencias",
  incidencias: "incidencias",
  ticket: "incidencias",
  tickets: "incidencias",

  factura: "facturas",
  facturas: "facturas",
  invoice: "facturas",
  invoices: "facturas",
  receipt: "facturas",

  cliente: "clientes",
  clientes: "clientes",
  client: "clientes",
  clients: "clientes",
  building: "clientes",

  usuario: "usuarios",
  usuarios: "usuarios",
  user: "usuarios",
  users: "usuarios",

  correo: "correo",
  mail: "correo",
  servidor: "servidor",
  server: "servidor",
  cuenta: "cuenta",
  account: "cuenta",

  activity: "activity",
  actividad: "activity",
  euro: "euro",
  alert: "alert",
  clock: "clock",
  arrow_right: "arrow-right",
  arrow: "arrow-right",
  refresh: "refresh",
});

const NUMBER_FORMATTER = new Intl.NumberFormat("es-ES");
const PERCENT_FORMATTER = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
});
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const MONEY_FORMATTERS = new Map();

/* =========================================================
   BASICS
========================================================= */

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function cleanText(value = "", fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

export function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

export function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

export function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w.:]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function classNames(...values) {
  return values
    .flat()
    .map((value) => cleanText(value, ""))
    .filter(Boolean)
    .join(" ");
}

export function statusKey(value = "") {
  const key = normalizeKey(value);

  if (["closed", "resolved", "solved", "paid"].includes(key)) return "success";
  if (["pending", "unpaid", "pending_payment", "partial", "draft"].includes(key)) return "warning";
  if (["overdue", "cancelled", "canceled"].includes(key)) return "error";
  if (["open", "opened", "new", "in_progress", "progress", "processing", "issued"].includes(key)) return "info";
  return "neutral";
}

export function visibleStatus(value = "") {
  const raw = cleanText(value, "");
  return STATUS_LABELS[normalizeKey(raw)] || raw || "Sin estado";
}

export function visibleText(value = "", fallback = "") {
  const text = cleanText(value, "");
  if (!text) return fallback;
  return STATUS_LABELS[normalizeKey(text)] || text;
}

export function isGenericInvoiceTitle(value = "") {
  return [
    "factura",
    "factura_disponible",
    "factura_disponible_para_consulta",
    "factura_disponible_para_consulta.",
  ].includes(normalizeKey(value));
}

export function hasAmount(value = null) {
  return optionalNumber(value) !== null;
}

/* =========================================================
   FORMATTERS
========================================================= */

export function formatNumber(value = 0) {
  try {
    return NUMBER_FORMATTER.format(number(value, 0));
  } catch {
    return String(number(value, 0));
  }
}

export function formatPercent(value = 0) {
  try {
    return `${PERCENT_FORMATTER.format(clamp(number(value, 0), 0, 100))} %`;
  } catch {
    return `${Math.round(clamp(number(value, 0), 0, 100))} %`;
  }
}

export function getMoneyFormatter(currency = "EUR") {
  const code = cleanText(currency, "EUR").toUpperCase();

  if (!MONEY_FORMATTERS.has(code)) {
    try {
      MONEY_FORMATTERS.set(
        code,
        new Intl.NumberFormat("es-ES", {
          style: "currency",
          currency: code,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    } catch {
      MONEY_FORMATTERS.set(code, null);
    }
  }

  return { code, formatter: MONEY_FORMATTERS.get(code) };
}

export function formatMoney(value = 0, currency = "EUR") {
  const amount = number(value, 0);
  const { code, formatter } = getMoneyFormatter(currency);

  if (formatter) {
    try {
      return formatter.format(amount);
    } catch {
      // fallback below
    }
  }

  return `${amount.toFixed(2).replace(".", ",")} ${code}`;
}

export function toDate(value = "") {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const time = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(time)) return null;

  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value = "") {
  const date = toDate(value);
  if (!date) return "Sin fecha";

  try {
    return DATE_TIME_FORMATTER.format(date).replace(/\./g, "");
  } catch {
    return date.toLocaleString("es-ES");
  }
}

export function initialsFrom(value = "") {
  return cleanText(value, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2) || "ON";
}

/* =========================================================
   SAFETY / IDENTIFIERS
========================================================= */

export function safeImageSrc(value = "") {
  const raw = cleanText(value, "");

  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|vbscript|file|data):/i.test(raw)) return "";
  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature|jwt|authorization)=/i.test(raw)) {
    return "";
  }

  if (raw.startsWith("/")) return raw;

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

export function safeRoute(value = "", fallback = "/") {
  const route = cleanText(value, fallback);

  if (!route.startsWith("/") || route.startsWith("//")) return fallback;
  if (/[\r\n\t\\]/.test(route)) return fallback;
  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature|jwt|authorization)=/i.test(route)) {
    return fallback;
  }

  return route;
}

export function safeDisplayId(value = "", fallback = "") {
  return cleanText(value, fallback)
    .replace(/[\r\n\t]/g, "")
    .slice(0, 96);
}

export function ticketDisplayId(source = {}) {
  return safeDisplayId(
    first(
      source.entityId,
      source.ticketId,
      source.incidenciaId,
      source.code,
      source.numero,
      source.id,
      ""
    ),
    ""
  );
}

export function invoiceDisplayId(source = {}) {
  return safeDisplayId(
    first(
      source.entityId,
      source.numeroFacturaLegal,
      source.invoiceNumber,
      source.number,
      source.facturaId,
      source.invoiceId,
      source.id,
      ""
    ),
    ""
  );
}

export function canonicalIconName(value = "activity") {
  const key = normalizeKey(value);
  return ICON_ALIASES[key] || "activity";
}

export function icon(name = "activity", className = "") {
  const iconName = canonicalIconName(name);
  const classes = classNames("app-icon", className);

  return `<span class="${attr(classes)}" data-app-icon="${attr(iconName)}" aria-hidden="true"></span>`;
}

/* =========================================================
   VIEW MODEL
========================================================= */

