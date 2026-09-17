import { cleanText } from "../../core/presentation-text.js";
import { escapeHtml } from "../../core/escape-html.js";
import { isObject, firstNonEmpty } from "../../core/objects.js";
import { safeArray } from "../../core/arrays.js";
import { clamp, finiteNumber } from "../../core/numbers.js";
import { TIMESTAMP_POLICIES, toDate } from "../../core/dates.js";
import { CURRENCY_POLICIES, DATE_PRESETS, currencyCode, dateFormatter, formatCurrency, formatDecimal } from "../../core/format.js";

export { isObject, safeArray };
export { cleanText, escapeHtml };

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

const PERCENT_FORMATTER = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
});
/* =========================================================
   BASICS
========================================================= */

export function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

export function homeLabelKey(value = "") {
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

/* Un IDENTIFICADOR no es una etiqueta. Home resume varios dominios y recibe dos
 * clases de valor: códigos del backend (`pending_payment`, `in_progress`) y texto
 * ya redactado (home.template.activity.js:255 admite `source.text`). Mezclarlos
 * hacía que un código sin lectura declarada se pintara tal cual, en inglés y con
 * guiones bajos, como si fuera una etiqueta de esta tabla.
 *
 * - Código conocido  -> su lectura declarada arriba.
 * - Código NO conocido -> cadena vacía, para que mande el texto por defecto que
 *   declara cada llamada («Emitida», «Actualizada», «Sin estado»). No se inventa
 *   su significado ni se enseña el identificador.
 * - Texto libre      -> se conserva tal cual; no es un enum y no se traduce. */
const CODE_SHAPE = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/u;

export function visibleStatus(value = "") {
  const raw = cleanText(value, "");
  const declared = STATUS_LABELS[homeLabelKey(raw)];
  if (declared) return declared;
  return CODE_SHAPE.test(raw.toLowerCase()) ? "" : raw;
}

export function visibleText(value = "", fallback = "") {
  const text = cleanText(value, "");
  if (!text) return fallback;
  return STATUS_LABELS[homeLabelKey(text)] || text;
}

export function isGenericInvoiceTitle(value = "") {
  return [
    "factura",
    "factura_disponible",
    "factura_disponible_para_consulta",
    "factura_disponible_para_consulta.",
  ].includes(homeLabelKey(value));
}

export function hasAmount(value = null) {
  return finiteNumber(value, null) !== null;
}

/* =========================================================
   FORMATTERS
========================================================= */

export function formatNumber(value = 0) {
  return formatDecimal(finiteNumber(value, 0));
}

export function formatPercent(value = 0) {
  try {
    return `${PERCENT_FORMATTER.format(clamp(finiteNumber(value, 0), 0, 100))} %`;
  } catch {
    return `${Math.round(clamp(finiteNumber(value, 0), 0, 100))} %`;
  }
}

export function formatMoney(value = 0, currency = "EUR") {
  return formatCurrency(finiteNumber(value, 0), currencyCode(currency, "EUR"), CURRENCY_POLICIES.standard);
}

export function formatDate(value = "") {
  const date = toDate(value, TIMESTAMP_POLICIES.epoch);
  if (!date) return "Sin fecha";

  try {
    return dateFormatter(DATE_PRESETS.shortMonthDateTime).format(date).replace(/\./g, "");
  } catch {
    return date.toLocaleString("es-ES");
  }
}

export { avatarInitials as initialsFrom } from "../../features/avatar-system/identity.js";

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
    firstNonEmpty(
      source.displayId,
      source.ticketId,
      source.incidenciaId,
      source.code,
      source.numero,
      source.id,
      source.entityId,
      ""
    ),
    ""
  );
}

export function invoiceDisplayId(source = {}) {
  return safeDisplayId(
    firstNonEmpty(
      source.displayId,
      source.numeroFacturaLegal,
      source.invoiceNumber,
      source.number,
      source.facturaId,
      source.invoiceId,
      source.id,
      source.entityId,
      ""
    ),
    ""
  );
}

function canonicalIconName(value = "activity") {
  const key = homeLabelKey(value);
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

