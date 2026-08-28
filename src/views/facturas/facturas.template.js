/* =========================================================
   Onion Support · Facturas · Template principal
   PRODUCTIVO · CANÓNICO · 2026-08-19

   Responsabilidad:
   - Render HTML puro del listado de Facturas.
   - Cabecera, métricas, filtros, búsqueda, orden, tabla e infinite scroll.
   - Acciones declarativas para index.js; sin HTTP, Store, Router ni DOM.
   - Identidad visual de clientes alineada con Incidencias.
========================================================= */

import { renderFacturasCreateModal } from "./facturas.template.create.js";
import { renderFacturasDetailModal } from "./facturas.template.modal.js";

export const FACTURAS_TEMPLATE_VERSION =
  "facturas.template.private.v7.admin-visual-parity";

export const FACTURAS_ACTIONS = Object.freeze({
  REFRESH: "refresh",
  EXPORT: "export",
  CREATE_OPEN: "create-factura",
  FILTER: "filter",
  CLEAR_FILTERS: "clear-filters",
  CLEAR_SEARCH: "clear-search",
  SEARCH: "search",
  SORT: "sort",
  RETRY_PAGE: "retry-page",
  OPEN_FACTURA: "open-factura",
  VIEW_PDF: "view-factura-pdf",
  DOWNLOAD_PDF: "download-factura",
  SEND_FACTURA: "send-factura",
  OPEN_INCIDENCIA: "open-incidencia",
});

const DEFAULT_SKELETON_ROWS = 5;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CURRENCY = "EUR";

const FILTERS = Object.freeze([
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendientes" },
  { key: "paid", label: "Pagadas" },
  { key: "overdue", label: "Vencidas" },
]);

const SORT_OPTIONS = Object.freeze([
  {
    key: "date",
    label: "Fecha",
    desc: "date_desc",
    asc: "date_asc",
    modes: ["date_desc", "date_asc"],
    tooltipDesc: "Ordenar facturas de más recientes a más antiguas",
    tooltipAsc: "Ordenar facturas de más antiguas a más recientes",
  },
]);

/* =========================================================
   BASICS
========================================================= */

const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const safeObject = (value, fallback = {}) => (isObject(value) ? value : fallback);
const safeArray = (value) => (Array.isArray(value) ? value : []);

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
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }
  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "boolean" || typeof value === "object") return fallback;

  if (typeof value === "string") {
    let clean = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    if (!clean || clean === "-" || clean === "+") return fallback;

    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");

    if (hasComma && hasDot) {
      clean = clean.lastIndexOf(",") > clean.lastIndexOf(".")
        ? clean.replace(/\./g, "").replace(/,/g, ".")
        : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean = clean.replace(/,/g, ".");
    }

    const parsed = Number(clean);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const attr = (value = "") => escapeHtml(cleanText(value, ""));

function htmlAttrs(attrs = {}) {
  return Object.entries(safeObject(attrs))
    .map(([key, value]) => {
      if (!key || value === false || value === null || value === undefined) return "";
      if (value === true) return escapeHtml(key);
      return `${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function tooltipAttrs(tooltip = "", ariaLabel = "") {
  const text = cleanText(tooltip, "");
  return htmlAttrs({
    title: text || false,
    "data-tooltip": text || false,
    "aria-label": cleanText(ariaLabel, text) || false,
  });
}

function disabledAttrs(disabled = false, busy = false) {
  return htmlAttrs({
    disabled: Boolean(disabled),
    "aria-disabled": disabled ? "true" : false,
    "aria-busy": busy ? "true" : false,
  });
}

function actionAttrs(action = "", facturaId = "") {
  const type = cleanText(action, "");
  const id = cleanText(facturaId, "");
  return htmlAttrs({
    "data-action": type,
    "data-facturas-action": type,
    "data-factura-id": id || false,
  });
}

function normalizeText(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const key = normalizeKey(value);
  if (["true", "1", "yes", "si", "on"].includes(key)) return true;
  if (["false", "0", "no", "off"].includes(key)) return false;
  return fallback;
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function hashIdentity(value = "") {
  const text = cleanText(value, "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function readPath(source = {}, path = "") {
  const parts = cleanText(path, "").split(".").filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current?.[part];
  }
  return current;
}

function firstPath(source = {}, paths = []) {
  for (const path of safeArray(paths)) {
    const value = readPath(source, path);
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }
  return null;
}

function safeImageSrc(value = "") {
  const raw = cleanText(value, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(raw)) return "";
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");
  if (/^https:\/\//i.test(raw)) {
    try { return new URL(raw).href; } catch { return ""; }
  }
  return "";
}

/* =========================================================
   INPUT / STATE
========================================================= */

function getInputItems(input = {}) {
  const data = safeObject(input);
  return safeArray(first(
    data.items,
    data.rows,
    data.facturas,
    data.invoices,
    data.data?.items,
    data.data?.facturas,
    data.payload?.items,
    data.payload?.facturas,
    []
  ));
}

function getRuntimeState(input = {}) {
  const data = safeObject(input);
  return safeObject(first(data.state, data.viewState, data.runtime, data.meta?.state, {}));
}

function isAdmin(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);
  const role = normalizeKey(first(
    data.role,
    data.rol,
    runtime.role,
    runtime.rol,
    data.user?.role,
    data.user?.rol,
    ""
  ));

  return Boolean(
    data.admin === true ||
    runtime.admin === true ||
    runtime.canCreateFactura === true ||
    data.canCreateFactura === true ||
    role === "admin"
  );
}

/* =========================================================
   DATE / MONEY
========================================================= */

const MONEY_FORMATTERS = new Map();
const DATE_SHORT = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function toTimestamp(value = null) {
  if (!value) return 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value > 9999999999 ? value : value * 1000;

  const raw = cleanText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 9999999999 ? numeric : numeric * 1000;

  const esMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (esMatch) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esMatch;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const amount = number(value, NaN);
  const code = cleanText(currency, DEFAULT_CURRENCY).toUpperCase();
  if (!Number.isFinite(amount)) return "—";

  let formatter = MONEY_FORMATTERS.get(code);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      MONEY_FORMATTERS.set(code, formatter);
    } catch {
      return `${amount.toFixed(2).replace(".", ",")} ${code}`;
    }
  }
  return formatter.format(amount);
}

function formatDateShort(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";
  try { return DATE_SHORT.format(new Date(timestamp)); } catch { return "—"; }
}

function formatDateTime(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";
  try { return DATE_TIME.format(new Date(timestamp)); } catch { return "—"; }
}

function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "Sin fecha";
  const diffMin = Math.round((timestamp - Date.now()) / 60000);
  const absMin = Math.abs(diffMin);
  if (absMin < 1) return "Ahora mismo";
  if (absMin < 60) return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  const hours = Math.round(absMin / 60);
  if (hours < 24) return diffMin > 0 ? `En ${hours} h` : `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days <= 7) return diffMin > 0 ? `En ${days} día${days === 1 ? "" : "s"}` : `Hace ${days} día${days === 1 ? "" : "s"}`;
  return formatDateShort(value);
}

/* =========================================================
   ICONS
========================================================= */

const ICON_COMMON = `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
const ICONS = Object.freeze({
  refresh: `<svg ${ICON_COMMON}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
  export: `<svg ${ICON_COMMON}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
  plus: `<svg ${ICON_COMMON}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
  detail: `<svg ${ICON_COMMON}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`,
  eye: `<svg ${ICON_COMMON}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  download: `<svg ${ICON_COMMON}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
  send: `<svg ${ICON_COMMON}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  ticket: `<svg ${ICON_COMMON}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
  pdf: `<svg ${ICON_COMMON}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 17v-5"/><path d="M8 12h2a1.5 1.5 0 0 1 0 3H8"/><path d="M13 17v-5h1.5a2.5 2.5 0 0 1 0 5H13"/><path d="M18 12h-2v5"/></svg>`,
  lock: `<svg ${ICON_COMMON}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
  mail: `<svg ${ICON_COMMON}><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>`,
  check: `<svg ${ICON_COMMON}><path d="m20 6-11 11-5-5"/></svg>`,
  search: `<svg ${ICON_COMMON}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  close: `<svg ${ICON_COMMON}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  calendar: `<svg ${ICON_COMMON}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  filter: `<svg ${ICON_COMMON}><path d="M22 3H2l8 9.46V19l4 2v-8.54Z"/></svg>`,
  alert: `<svg ${ICON_COMMON}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
});
const icon = (name = "") => ICONS[name] || "";

/* =========================================================
   DOMAIN GETTERS
========================================================= */

const getRaw = (item = {}) => safeObject(item?.raw);

function fromItem(item = {}, paths = [], fallback = "") {
  const raw = getRaw(item);
  return cleanText(first(firstPath(item, paths), firstPath(raw, paths)), fallback);
}

function getFacturaId(item = {}) {
  return fromItem(item, ["id", "facturaId", "invoiceId", "numeroFacturaLegal", "numeroFacturaSistema", "numeroFactura", "numero", "number"], "FAC-SIN-ID");
}

function getFacturaNumero(item = {}) {
  return fromItem(item, ["numeroFacturaLegal", "numeroFactura", "number", "invoiceNumber", "numero", "code", "facturaId", "invoiceId", "id"], "Factura sin número");
}

const getFacturaSistema = (item = {}) => fromItem(item, ["numeroFacturaSistema", "systemInvoiceNumber", "systemNumber"], "");

function getCompanyName(item = {}) {
  return fromItem(item, [
    "clienteEmpresa", "empresa", "company", "companyName", "razonSocial",
    "cliente.razonSocial", "cliente.companyName", "cliente.empresa",
    "client.razonSocial", "client.companyName", "customer.razonSocial",
    "customer.companyName", "clienteSnapshot.razonSocial",
  ], "");
}

function getContactName(item = {}) {
  return fromItem(item, [
    "clienteNombre", "nombreContacto", "contactName", "cliente.nombreContacto",
    "cliente.nombre", "cliente.name", "cliente.displayName", "clienteSnapshot.nombreContacto",
    "clientName", "client.name", "customer.name", "name", "nombre",
  ], "");
}

const getClientName = (item = {}) => cleanText(first(getCompanyName(item), getContactName(item)), "Cliente");

function getClientSecondaryName(item = {}) {
  const company = getCompanyName(item);
  const contact = getContactName(item);
  return company && contact && normalizeText(company) !== normalizeText(contact) ? contact : "";
}

function getClientEmail(item = {}) {
  return fromItem(item, [
    "clienteEmail", "emailCliente", "cliente.email", "cliente.emailLower",
    "clienteSnapshot.email", "email", "clientEmail", "client.email", "customer.email",
  ], "").toLowerCase();
}

const getClientEmailLabel = (item = {}) => getClientEmail(item) || "Sin email";

function getClientAvatar(item = {}) {
  const paths = [
    "clienteAvatar", "clientAvatar", "avatar", "avatarUrl", "logo", "logoUrl",
    "photo", "photoUrl", "picture", "pictureUrl", "cliente.avatar", "cliente.avatarUrl",
    "cliente.logo", "cliente.logoUrl", "client.avatar", "client.avatarUrl",
    "customer.avatar", "customer.avatarUrl",
  ];
  return safeImageSrc(firstPath(item, paths) || firstPath(getRaw(item), paths));
}

function getInitials(value = "") {
  const text = cleanText(value, "");
  if (!text) return "ON";
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

function getAvatarToneClass(item = {}) {
  const identity = getClientEmail(item) || getClientName(item);
  return `facturas-avatar--tone-${hashIdentity(identity) % 10}`;
}

function getPaymentRaw(item = {}) {
  return first(
    item.estadoPago,
    item.paymentStatus,
    item.payment?.status,
    item.billing?.paymentStatus,
    getRaw(item).estadoPago,
    getRaw(item).paymentStatus,
    getRaw(item).payment?.status,
    getRaw(item).billing?.paymentStatus,
    "pending"
  );
}

function getEstadoPagoKey(value = "") {
  const key = normalizeKey(value);
  if (["paid", "pagada", "pagado", "cobrada", "cobrado", "abonada", "abonado"].includes(key)) return "paid";
  if (["pending", "pendiente", "unpaid", "sin_pagar"].includes(key)) return "pending";
  if (["partial", "parcial", "pago_parcial"].includes(key)) return "partial";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";
  if (["cancelled", "canceled", "cancelada", "cancelado", "anulada", "anulado"].includes(key)) return "cancelled";
  if (["draft", "borrador"].includes(key)) return "draft";
  return "pending";
}

function getEstadoPagoLabel(value = "") {
  return {
    paid: "Pagada",
    pending: "Pendiente",
    partial: "Pago parcial",
    overdue: "Vencida",
    cancelled: "Cancelada",
    draft: "Borrador",
  }[getEstadoPagoKey(value)] || cleanText(value, "Pendiente");
}

function getIncidenciaId(item = {}) {
  const direct = fromItem(item, [
    "ticketId", "incidenciaId", "incidencia.id", "incidencia.ticketId",
    "incidencia.incidenciaId", "ticket.id", "ticket.ticketId", "ticket.incidenciaId",
    "linkedTicket.id", "linkedTicket.ticketId", "linkedTicket.incidenciaId",
    "relatedTicketId", "relatedIncidentId", "supportTicketId", "caseId",
    "meta.ticketId", "meta.linkedTicketId", "meta.incidenciaId",
  ], "");
  if (direct) return direct;

  for (const list of [item.ticketIds, item.incidenciaIds, item.relatedTicketIds, item.relatedIncidentIds, item.linkedTickets, item.incidencias, item.tickets]) {
    for (const entry of safeArray(list)) {
      if (typeof entry === "string" && entry.trim()) return cleanText(entry, "");
      if (isObject(entry)) {
        const id = cleanText(first(entry.ticketId, entry.incidenciaId, entry.id, entry.code, entry.numero), "");
        if (id) return id;
      }
    }
  }
  return "";
}

const getIncidenciaSubject = (item = {}) => fromItem(item, [
  "incidencia.subject", "incidencia.asunto", "incidencia.title",
  "ticket.subject", "ticket.asunto", "ticket.title",
  "linkedTicket.subject", "linkedTicket.asunto", "linkedTicket.title",
], "");

function getTotalRaw(item = {}) {
  return first(
    item.total, item.amount, item.importe, item.importeTotal, item.totalFactura,
    item.facturaTotal, item.invoiceAmount, item.totales?.total,
    getRaw(item).total, getRaw(item).amount, getRaw(item).importe,
    getRaw(item).importeTotal, getRaw(item).totalFactura, getRaw(item).facturaTotal,
    getRaw(item).invoiceAmount, getRaw(item).totales?.total, 0
  );
}

const getCurrency = (item = {}) => fromItem(item, ["moneda", "currency", "facturaCurrency", "totales.currency", "payment.currency", "meta.currency"], DEFAULT_CURRENCY).toUpperCase();
const getTotalLabel = (item = {}) => formatMoney(getTotalRaw(item), getCurrency(item));

function getTotalCaption(item = {}) {
  const raw = getRaw(item);
  const taxIncluded = first(item.taxIncluded, item.impuestosIncluidos, item.ivaIncluido, raw.taxIncluded, raw.impuestosIncluidos, raw.ivaIncluido);
  return taxIncluded === false ? "Impuestos no incl." : "Impuestos incl.";
}

const getFormaPago = (item = {}) => fromItem(item, ["formaPago", "metodoPago", "paymentMethod", "payment.methodLabel", "payment.method"], "—");

function getCreatedAt(item = {}) {
  const raw = getRaw(item);
  return first(
    item.fechaFactura, item.fechaFacturaISO, item.lifecycle?.issuedAt, item.issueDate,
    item.issuedAt, item.fecha, item.createdAt, item.lifecycle?.createdAt, item.fechaCreacion,
    raw.fechaFactura, raw.fechaFacturaISO, raw.lifecycle?.issuedAt, raw.issueDate,
    raw.issuedAt, raw.fecha, raw.createdAt, raw.lifecycle?.createdAt, raw.fechaCreacion
  );
}

function getUpdatedAt(item = {}) {
  const raw = getRaw(item);
  return first(
    item.updatedAt, item.lifecycle?.updatedAt, item.lastActivityAt, item.lifecycle?.lastActivityAt,
    item.fechaEnvio, item.delivery?.lastSentAt, item.sentAt, item.mailSentAt,
    item.fechaActualizacion, item.lastUpdateAt,
    raw.updatedAt, raw.lifecycle?.updatedAt, raw.lastActivityAt, raw.lifecycle?.lastActivityAt,
    raw.fechaEnvio, raw.delivery?.lastSentAt, raw.sentAt, raw.mailSentAt,
    raw.fechaActualizacion, raw.lastUpdateAt, getCreatedAt(item)
  );
}

function getSentAt(item = {}) {
  const raw = getRaw(item);
  return first(item.fechaEnvio, item.sentAt, item.mailSentAt, item.email?.sentAt, item.delivery?.lastSentAt, item.lifecycle?.sentAt, item.meta?.lastSentAt, raw.fechaEnvio, raw.sentAt, raw.email?.sentAt);
}

function getSortTimestamp(item = {}) {
  const raw = getRaw(item);
  return number(item?.meta?.updatedAtMs, 0) || number(item?.meta?.timestampMs, 0) ||
    number(raw?.meta?.updatedAtMs, 0) || number(raw?.meta?.timestampMs, 0) ||
    toTimestamp(getUpdatedAt(item)) || toTimestamp(getCreatedAt(item)) || toTimestamp(raw?._ts) || 0;
}

const getEmissionTimestamp = (item = {}) => toTimestamp(getCreatedAt(item)) || getSortTimestamp(item);

function hasPdf(item = {}) {
  const raw = getRaw(item);
  if (bool(first(item.pdfAvailable, item.hasPdf, item.document?.available, item.meta?.hasPdf, raw.pdfAvailable, raw.hasPdf), false)) return true;
  return Boolean(first(
    item.blobPath, item.blobName, item.pdfPath, item.pdfUrl, item.downloadUrl, item.viewUrl,
    item.pdf, item.document?.blobPath, item.document?.fileName,
    raw.blobPath, raw.blobName, raw.pdfPath, raw.pdfUrl, raw.downloadUrl, raw.viewUrl, raw.document?.blobPath
  ));
}

function isFacturaSent(item = {}) {
  const raw = getRaw(item);
  if (getSentAt(item)) return true;
  return bool(first(item.email?.sent, item.delivery?.sent, item.lifecycle?.sent, item.meta?.isSent, item.meta?.hasEmailSent, raw.email?.sent, raw.delivery?.sent, raw.meta?.isSent), false);
}

const isValidEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanText(value, "").toLowerCase());
const canSendFactura = (item = {}) => hasPdf(item) && isValidEmail(getClientEmail(item));

/* =========================================================
   FILTER / SEARCH / SORT
========================================================= */

function normalizeFilter(value = "") {
  const key = normalizeKey(value);
  if (!key || ["all", "todo", "todos", "todas", "total"].includes(key)) return "all";
  if (["pending", "pendiente", "pendientes", "partial", "parcial", "draft", "borrador", "unpaid", "sin_pagar"].includes(key)) return "pending";
  if (["paid", "pagada", "pagado", "pagadas", "cobrada", "cobrado"].includes(key)) return "paid";
  if (["overdue", "vencida", "vencido", "vencidas"].includes(key)) return "overdue";
  return "all";
}

function getRuntimeValue(input = {}, keys = [], fallback = "") {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);
  for (const key of safeArray(keys)) {
    const value = first(data[key], runtime[key]);
    if (value !== null && value !== undefined && !(typeof value === "string" && !value.trim())) return value;
  }
  return fallback;
}

const getActiveFilter = (input = {}) => normalizeFilter(getRuntimeValue(input, ["filter", "paymentFilter", "statusFilter", "activeFilter", "facturasFilter"], "all"));
const getFilterLabel = (filter = "all") => FILTERS.find((item) => item.key === normalizeFilter(filter))?.label || "Todas";
const getSearchQuery = (input = {}) => cleanText(getRuntimeValue(input, ["search", "searchQuery", "query", "q", "term", "keyword", "facturasSearch"], ""), "");

function normalizeSort(value = "") {
  const key = normalizeKey(value);
  return ["date_asc", "fecha_asc", "emission_asc", "issue_date_asc", "fecha_emision_asc", "oldest", "oldest_first", "menor_fecha"].includes(key)
    ? "date_asc"
    : "date_desc";
}

const getSortMode = (input = {}) => normalizeSort(getRuntimeValue(input, ["sort", "sortBy", "orderBy", "sortMode", "facturasSort"], "date_desc"));
const getSortDirection = (sortMode = "date_desc") => normalizeSort(sortMode).endsWith("_asc") ? "asc" : "desc";
const getSortOption = (sortMode = "date_desc") => SORT_OPTIONS.find((option) => option.modes.includes(normalizeSort(sortMode))) || SORT_OPTIONS[0];
const getNextSortMode = (option = SORT_OPTIONS[0], current = "date_desc") => option.modes.includes(normalizeSort(current)) && normalizeSort(current).endsWith("_desc") ? option.asc : option.desc;

function getSortButtonLabel(option = SORT_OPTIONS[0], current = "date_desc") {
  const mode = normalizeSort(current);
  return `${option.label} ${mode.endsWith("_asc") ? "↑" : "↓"}`;
}

function getSortButtonTooltip(option = SORT_OPTIONS[0], current = "date_desc") {
  return getNextSortMode(option, current).endsWith("_asc") ? option.tooltipAsc : option.tooltipDesc;
}

function itemMatchesFilter(item = {}, filter = "all") {
  const key = normalizeFilter(filter);
  const payment = getEstadoPagoKey(getPaymentRaw(item));
  if (key === "all") return true;
  if (key === "pending") return ["pending", "partial", "draft"].includes(payment);
  if (key === "paid") return payment === "paid";
  if (key === "overdue") return payment === "overdue";
  return true;
}

function getSearchHaystack(item = {}) {
  return [
    getFacturaId(item), getFacturaNumero(item), getFacturaSistema(item),
    getCompanyName(item), getContactName(item), getClientName(item), getClientEmail(item),
    getEstadoPagoLabel(getPaymentRaw(item)), getTotalLabel(item), getFormaPago(item),
    getIncidenciaId(item), getIncidenciaSubject(item), getCreatedAt(item), getUpdatedAt(item),
    item.clienteId, item.clientId, item.customerId, item.userId, item.uid,
  ].map(normalizeText).filter(Boolean).join(" · ");
}

function itemMatchesSearch(item = {}, query = "") {
  const normalized = normalizeText(query);
  if (!normalized) return true;
  const haystack = getSearchHaystack(item);
  return normalized.split(" ").filter(Boolean).every((term) => haystack.includes(term));
}

function sortFacturas(items = [], input = {}) {
  const mode = getSortMode(input);
  return [...safeArray(items)].sort((a, b) => {
    const dateDiff = mode === "date_asc"
      ? getEmissionTimestamp(a) - getEmissionTimestamp(b)
      : getEmissionTimestamp(b) - getEmissionTimestamp(a);
    if (dateDiff) return dateDiff;
    return cleanText(mode === "date_asc" ? getFacturaNumero(a) : getFacturaNumero(b), "")
      .localeCompare(cleanText(mode === "date_asc" ? getFacturaNumero(b) : getFacturaNumero(a), ""), "es", { numeric: true, sensitivity: "base" });
  });
}

function filterAndSortFacturas(items = [], input = {}) {
  const filter = getActiveFilter(input);
  const search = getSearchQuery(input);
  return sortFacturas(safeArray(items)
    .filter((item) => itemMatchesFilter(item, filter))
    .filter((item) => itemMatchesSearch(item, search)), input);
}

const isFilterActive = (input = {}) => getActiveFilter(input) !== "all" || Boolean(getSearchQuery(input));

function computeFilterCounts(items = [], input = {}) {
  const search = getSearchQuery(input);
  const searchable = safeArray(items).filter((item) => itemMatchesSearch(item, search));
  return FILTERS.reduce((acc, filter) => {
    acc[filter.key] = searchable.filter((item) => itemMatchesFilter(item, filter.key)).length;
    return acc;
  }, {});
}

/* =========================================================
   STATS / LIST STATE
========================================================= */

function computeStats(items = []) {
  return safeArray(items).reduce((acc, item) => {
    const total = number(getTotalRaw(item), 0);
    const payment = getEstadoPagoKey(getPaymentRaw(item));
    acc.total += 1;
    acc.totalImporte += total;
    if (payment === "paid") { acc.paidCount += 1; acc.totalPagado += total; }
    if (["pending", "partial", "draft"].includes(payment)) { acc.pendingCount += 1; acc.totalPendiente += total; }
    if (payment === "overdue") { acc.overdueCount += 1; acc.totalVencido += total; }
    if (hasPdf(item)) acc.pdfCount += 1;
    if (isFacturaSent(item)) acc.sentCount += 1;
    if (getIncidenciaId(item)) acc.incidenciaCount += 1;
    return acc;
  }, {
    total: 0,
    totalImporte: 0,
    totalPagado: 0,
    totalPendiente: 0,
    totalVencido: 0,
    pendingCount: 0,
    paidCount: 0,
    overdueCount: 0,
    pdfCount: 0,
    sentCount: 0,
    incidenciaCount: 0,
  });
}

function getRemoteTotal(input = {}, fallback = 0) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);
  return Math.max(number(first(
    data.totalCount, data.remoteCount, data.totalMatched, data.total,
    runtime.totalCount, runtime.remoteCount, runtime.totalMatched, runtime.total,
    fallback
  ), fallback), fallback);
}

function getBatchSize(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);
  return clamp(number(first(data.batchSize, data.limit, data.pageSize, runtime.batchSize, runtime.limit, runtime.pageSize, DEFAULT_BATCH_SIZE), DEFAULT_BATCH_SIZE), 1, 200);
}

function getListState(items = [], input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);
  const rawItems = safeArray(items);
  const visibleItems = filterAndSortFacturas(rawItems, data);
  const loadedCount = rawItems.length;
  const visibleCount = visibleItems.length;
  const remoteTotal = getRemoteTotal(data, loadedCount);
  const batchSize = getBatchSize(data);
  const filtering = isFilterActive(data);
  const currentPage = Math.max(1, number(first(data.page, runtime.page, runtime.currentPage, runtime.facturasPage, 1), 1));
  const nextPage = Math.max(1, number(first(data.nextPage, runtime.nextPage, currentPage + 1), currentPage + 1));
  const explicitHasMore = first(data.hasMore, data.more, data.canLoadMore, runtime.hasMore, runtime.more, runtime.canLoadMore, null);
  const hasMore = explicitHasMore === null ? loadedCount < remoteTotal : bool(explicitHasMore, false);
  const loadingMore = Boolean(first(data.loadingMore, data.loadingNextPage, runtime.loadingMore, runtime.loadingNextPage, false));
  const loadMoreError = cleanText(first(data.loadMoreError, runtime.loadMoreError, ""), "");
  const sortMode = getSortMode(data);

  return {
    visibleItems,
    batchSize,
    currentPage,
    nextPage,
    totalPages: Math.max(1, Math.ceil((remoteTotal || loadedCount || 1) / batchSize)),
    totalCount: filtering ? visibleCount : remoteTotal,
    loadedCount,
    visibleCount,
    remoteTotal,
    hasMore,
    loadingMore,
    loadMoreError,
    filtering,
    activeFilter: getActiveFilter(data),
    searchQuery: getSearchQuery(data),
    sortMode,
    sortDirection: getSortDirection(sortMode),
  };
}

function resolveBusyMeta(item = {}, state = {}) {
  const runtime = safeObject(state);
  const facturaId = getFacturaId(item);
  return {
    facturaId,
    isOpening: cleanText(runtime.openingFacturaId, "") === facturaId,
    isViewingPdf: cleanText(runtime.viewingFacturaId, "") === facturaId,
    isDownloading: cleanText(runtime.downloadingFacturaId, "") === facturaId,
    isSending: cleanText(runtime.sendingFacturaId, "") === facturaId,
  };
}

/* =========================================================
   SMALL PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `<span class="facturas-inline-loading"><span class="facturas-inline-spinner" aria-hidden="true"></span>${label ? `<span class="facturas-inline-loading-text">${escapeHtml(label)}</span>` : ""}</span>`;
}

function renderLoaderOnly(label = "Cargando") {
  return `<span class="facturas-loader-only" role="status" ${tooltipAttrs(label, label)}><span class="facturas-inline-spinner" aria-hidden="true"></span></span>`;
}

function renderAvatar(item = {}) {
  const name = getClientName(item);
  const avatarUrl = getClientAvatar(item);
  const toneClass = getAvatarToneClass(item);
  return `
    <span class="facturas-avatar ${attr(toneClass)}${avatarUrl ? " has-image" : " facturas-avatar--fallback"}"
      ${tooltipAttrs(name, name)} data-fallback="${avatarUrl ? "false" : "true"}" data-facturas-avatar="true" aria-hidden="true">
      ${avatarUrl ? `<img class="facturas-avatar-img" src="${attr(avatarUrl)}" alt="" width="42" height="42" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" data-facturas-avatar-img="true">` : ""}
      <span class="facturas-avatar-fallback">${escapeHtml(getInitials(name))}</span>
    </span>`;
}

function renderEstadoPagoChip(item = {}) {
  const raw = getPaymentRaw(item);
  const key = getEstadoPagoKey(raw);
  return `<span class="facturas-chip facturas-chip--${attr(key)}"><span class="facturas-chip-dot" aria-hidden="true"></span><span>${escapeHtml(getEstadoPagoLabel(raw))}</span></span>`;
}

function renderDeliveryBadge(item = {}) {
  const sent = isFacturaSent(item);
  const sentAt = getSentAt(item);
  const tooltip = sent ? (sentAt ? `Enviada · ${formatDateTime(sentAt)}` : "Factura enviada") : "Factura no enviada todavía";
  return `<span class="facturas-mini-badge facturas-mini-badge--${sent ? "sent" : "idle"}" ${tooltipAttrs(tooltip, tooltip)}>${icon(sent ? "check" : "mail")}<span>${sent ? "Enviada" : "No enviada"}</span></span>`;
}

function renderPdfBadge(item = {}) {
  const available = hasPdf(item);
  const label = available ? "PDF" : "Sin PDF";
  return `<span class="facturas-mini-badge facturas-mini-badge--${available ? "pdf" : "blocked"}" ${tooltipAttrs(available ? "PDF disponible" : "PDF no disponible", available ? "PDF disponible" : "PDF no disponible")}>${icon(available ? "pdf" : "lock")}<span>${label}</span></span>`;
}

function renderIncidenciaLink(item = {}) {
  const incidenciaId = getIncidenciaId(item);
  if (!incidenciaId) return `<span class="facturas-incidencia-empty">—</span>`;
  const subject = getIncidenciaSubject(item);
  const tooltip = subject ? `Abrir incidencia · ${subject}` : "Abrir incidencia relacionada";
  return `<button type="button" class="facturas-incidencia-link" ${actionAttrs(FACTURAS_ACTIONS.OPEN_INCIDENCIA, getFacturaId(item))} data-ticket-id="${attr(incidenciaId)}" data-incidencia-id="${attr(incidenciaId)}" ${tooltipAttrs(tooltip, tooltip)}>${icon("ticket")}<span>${escapeHtml(incidenciaId)}</span></button>`;
}

function renderActionButton({ klass = "", action = "", facturaId = "", label = "", loadingLabel = "", iconName = "", loading = false, disabled = false, tooltip = "" } = {}) {
  const finalDisabled = Boolean(disabled || loading);
  const classes = ["facturas-action-btn", klass, loading ? "is-loading" : ""].map((item) => cleanText(item, "")).filter(Boolean).join(" ");
  return `<button type="button" class="${attr(classes)}" ${actionAttrs(action, facturaId)} ${tooltipAttrs(tooltip || label, tooltip || label)} ${disabledAttrs(finalDisabled, loading)}>${loading ? renderLoaderOnly(loadingLabel || label) : `<span class="facturas-action-icon">${icon(iconName)}</span><span class="facturas-btn-text">${escapeHtml(label)}</span>`}</button>`;
}

/* =========================================================
   FILTERS
========================================================= */

function renderSearch(input = {}) {
  const searchQuery = getSearchQuery(input);
  return `
    <div class="facturas-search" role="search" aria-label="Buscar facturas">
      <span class="facturas-search-icon" aria-hidden="true">${icon("search")}</span>
      <input id="facturas-search-input" class="facturas-search-input" type="search" value="${attr(searchQuery)}"
        placeholder="Buscar factura, cliente, email, importe..." autocomplete="off" spellcheck="false"
        data-facturas-action="${FACTURAS_ACTIONS.SEARCH}" data-action="${FACTURAS_ACTIONS.SEARCH}"
        data-field="search" data-facturas-search-input="true" aria-label="Buscar facturas por cliente, email, importe o número">
      ${searchQuery ? `<button type="button" class="facturas-search-clear" data-facturas-action="${FACTURAS_ACTIONS.CLEAR_SEARCH}" data-action="${FACTURAS_ACTIONS.CLEAR_SEARCH}" ${tooltipAttrs("Limpiar búsqueda", "Limpiar búsqueda")}>${icon("close")}</button>` : ""}
    </div>`;
}

function renderFilters(input = {}, listState = {}) {
  const data = safeObject(input);
  const activeFilter = normalizeFilter(listState.activeFilter || getActiveFilter(data));
  const sortMode = normalizeSort(listState.sortMode || getSortMode(data));
  const option = getSortOption(sortMode);
  const nextSortMode = getNextSortMode(option, sortMode);
  const tooltip = getSortButtonTooltip(option, sortMode);

  return `
    <div class="facturas-filters" aria-label="Filtros, orden y búsqueda de facturas">
      <div class="facturas-filter-pills" role="group" aria-label="Filtrar facturas por estado de pago">
        ${FILTERS.map((filter) => {
          const active = filter.key === activeFilter;
          return `<button type="button" class="facturas-filter-pill${active ? " is-active" : ""}" data-facturas-action="${FACTURAS_ACTIONS.FILTER}" data-action="${FACTURAS_ACTIONS.FILTER}" data-filter="${attr(filter.key)}" data-filter-status="${attr(filter.key)}" data-payment-filter="${attr(filter.key)}" aria-pressed="${active ? "true" : "false"}"><span>${escapeHtml(filter.label)}</span></button>`;
        }).join("")}
      </div>
      <div class="facturas-sort-pills" role="group" aria-label="Ordenar listado de facturas" data-current-sort="${attr(sortMode)}">
        <button type="button" class="facturas-sort-pill is-active" data-facturas-action="${FACTURAS_ACTIONS.SORT}" data-action="${FACTURAS_ACTIONS.SORT}" data-sort="${attr(nextSortMode)}" data-sort-mode="${attr(nextSortMode)}" data-facturas-sort="${attr(nextSortMode)}" data-current-sort="${attr(sortMode)}" data-next-sort="${attr(nextSortMode)}" data-sort-key="date" data-sort-direction="${attr(getSortDirection(nextSortMode))}" ${tooltipAttrs(tooltip, tooltip)} aria-pressed="true">${icon("calendar")}<span>${escapeHtml(getSortButtonLabel(option, sortMode))}</span></button>
      </div>
      ${renderSearch(data)}
    </div>`;
}

/* =========================================================
   TABLE
========================================================= */

function renderRow(item = {}, state = {}) {
  const busy = resolveBusyMeta(item, state);
  const facturaId = busy.facturaId;
  const numero = getFacturaNumero(item);
  const numeroSistema = getFacturaSistema(item);
  const clientName = getClientName(item);
  const secondaryName = getClientSecondaryName(item);
  const clientEmail = getClientEmailLabel(item);
  const createdRaw = getCreatedAt(item);
  const total = getTotalLabel(item);
  const pdfAvailable = hasPdf(item);
  const sent = isFacturaSent(item);
  const canSend = canSendFactura(item);
  const paymentKey = getEstadoPagoKey(getPaymentRaw(item));
  const sendLabel = sent ? "Reenviar" : "Enviar";
  const sendTooltip = !pdfAvailable
    ? "No se puede enviar: falta PDF"
    : !getClientEmail(item)
      ? "No se puede enviar: falta email válido"
      : sent ? "Reenviar factura al cliente" : "Enviar factura al cliente";

  return `
    <tr class="facturas-table-row facturas-table-row--${attr(paymentKey)}" data-facturas-row="true" data-factura-id="${attr(facturaId)}" data-sent="${sent ? "true" : "false"}" data-has-pdf="${pdfAvailable ? "true" : "false"}" data-row-click-disabled="false" tabindex="0" role="button" aria-label="Abrir detalle de factura ${attr(numero)}">
      <td class="facturas-cell facturas-cell--main">
        <div class="facturas-main">${renderAvatar(item)}<div class="facturas-main-copy">
          <div class="facturas-factura-line"><span class="facturas-factura-id">${escapeHtml(numero)}</span>${numeroSistema && numeroSistema !== numero ? `<span class="facturas-system-id">${escapeHtml(numeroSistema)}</span>` : ""}</div>
          <div class="facturas-factura-client">${escapeHtml(clientName)}</div>
          ${secondaryName ? `<div class="facturas-factura-contact">${escapeHtml(secondaryName)}</div>` : ""}
          <div class="facturas-factura-email">${escapeHtml(clientEmail)}</div>
          <div class="facturas-row-badges">${renderDeliveryBadge(item)}${renderPdfBadge(item)}</div>
        </div></div>
      </td>
      <td class="facturas-cell facturas-cell--status">${renderEstadoPagoChip(item)}</td>
      <td class="facturas-cell facturas-cell--date"><span class="facturas-date-inline" ${tooltipAttrs(formatDateTime(createdRaw), `Fecha de emisión ${formatDateTime(createdRaw)}`)}>${escapeHtml(formatDateShort(createdRaw))}</span></td>
      <td class="facturas-cell facturas-cell--amount"><div class="facturas-total-stack"><span class="facturas-total-value">${escapeHtml(total)}</span><span class="facturas-total-caption">${escapeHtml(getTotalCaption(item))}</span><span class="facturas-total-meta">${escapeHtml(getFormaPago(item))}</span></div></td>
      <td class="facturas-cell facturas-cell--incidencia">${renderIncidenciaLink(item)}</td>
      <td class="facturas-cell facturas-cell--actions"><div class="facturas-actions">
        ${renderActionButton({ action: FACTURAS_ACTIONS.OPEN_FACTURA, facturaId, label: "Detalle", loadingLabel: "Abriendo detalle", iconName: "detail", loading: busy.isOpening, tooltip: "Abrir detalle de factura" })}
        ${renderActionButton({ action: FACTURAS_ACTIONS.VIEW_PDF, facturaId, label: "Ver PDF", loadingLabel: "Abriendo PDF", iconName: "eye", loading: busy.isViewingPdf, disabled: !pdfAvailable, tooltip: pdfAvailable ? "Ver PDF de factura" : "PDF no disponible" })}
        ${renderActionButton({ klass: "facturas-action-btn--primary", action: FACTURAS_ACTIONS.DOWNLOAD_PDF, facturaId, label: "Descargar", loadingLabel: "Descargando factura", iconName: "download", loading: busy.isDownloading, disabled: !pdfAvailable, tooltip: pdfAvailable ? "Descargar factura PDF" : "PDF no disponible" })}
        ${renderActionButton({ klass: "facturas-action-btn--primary", action: FACTURAS_ACTIONS.SEND_FACTURA, facturaId, label: sendLabel, loadingLabel: "Enviando factura", iconName: "send", loading: busy.isSending, disabled: !canSend, tooltip: sendTooltip })}
      </div></td>
    </tr>`;
}

function renderTableLoading(rows = DEFAULT_SKELETON_ROWS) {
  return `<div class="facturas-table-loading" aria-hidden="true">${Array.from({ length: rows }).map(() => `
    <div class="facturas-table-loading-row">
      <span class="facturas-skeleton facturas-skeleton--avatar"></span>
      <div class="facturas-table-loading-copy"><span class="facturas-skeleton facturas-skeleton--xs"></span><span class="facturas-skeleton facturas-skeleton--lg"></span><span class="facturas-skeleton facturas-skeleton--md"></span></div>
      <span class="facturas-skeleton facturas-skeleton--pill"></span><span class="facturas-skeleton facturas-skeleton--date"></span><span class="facturas-skeleton facturas-skeleton--amount"></span><span class="facturas-skeleton facturas-skeleton--ticket"></span><span class="facturas-skeleton facturas-skeleton--actions"></span>
    </div>`).join("")}</div>`;
}

function renderRefreshOverlay() {
  return `<div class="facturas-refresh-overlay" aria-hidden="true"><div class="facturas-refresh-card">${renderSpinner("Actualizando facturas...")}</div></div>`;
}

function renderEmptyState({ hasError = false, filtering = false, searchQuery = "" } = {}) {
  const title = hasError ? "No se pudieron cargar las facturas" : filtering ? "No hay facturas con esos filtros" : "Todavía no hay facturas";
  const text = hasError
    ? "Vuelve a intentarlo. Si el problema continúa, revisa la conexión con el servicio de facturación."
    : filtering
      ? searchQuery ? `No se encontraron facturas para “${searchQuery}”. Prueba con otro cliente, email, número o incidencia.` : "Cambia el filtro activo para volver al historial completo."
      : "Cuando haya documentos registrados aparecerán aquí con su estado de pago, PDF, incidencia vinculada y acciones disponibles.";

  const liveAttributes = hasError
    ? ""
    : 'role="status" aria-live="polite" aria-atomic="true"';
  return `<div id="facturas-empty-state" class="facturas-empty" tabindex="-1" ${liveAttributes}><div class="facturas-empty-icon" aria-hidden="true">${icon(hasError ? "lock" : filtering ? "filter" : "detail")}</div><h3 class="facturas-empty-title">${escapeHtml(title)}</h3><p class="facturas-empty-text">${escapeHtml(text)}</p>${filtering ? `<button type="button" class="facturas-btn" data-facturas-action="${FACTURAS_ACTIONS.CLEAR_FILTERS}" data-action="${FACTURAS_ACTIONS.CLEAR_FILTERS}">${icon("close")}<span class="facturas-btn-text">Limpiar filtros</span></button>` : ""}</div>`;
}

function renderInfiniteScrollFooter(listState = {}, state = {}) {
  const runtime = safeObject(state);
  const loadingMore = Boolean(first(listState.loadingMore, runtime.loadingMore, runtime.loadingNextPage));
  const refreshing = Boolean(runtime.refreshing);
  const hasMore = Boolean(listState.hasMore);
  const hasRows = number(listState.visibleCount, 0) > 0;
  const listError = cleanText(runtime.error, "");
  const loadMoreError = cleanText(first(listState.loadMoreError, runtime.loadMoreError, ""), "");
  if (listError) {
    return `<div class="facturas-infinite" data-facturas-infinite="true" data-has-more="false" tabindex="-1"><div class="facturas-infinite-status is-error"><span class="facturas-infinite-error-icon" aria-hidden="true">${icon("alert")}</span><span>Actualización detenida.</span><button type="button" class="facturas-btn facturas-infinite-retry" data-facturas-action="${FACTURAS_ACTIONS.REFRESH}" data-action="${FACTURAS_ACTIONS.REFRESH}">${icon("refresh")}<span>Reintentar</span></button></div></div>`;
  }
  const status = loadMoreError
    ? `<span class="facturas-infinite-error-icon" aria-hidden="true">${icon("alert")}</span><span>${escapeHtml(loadMoreError)}</span><button type="button" class="facturas-btn facturas-infinite-retry" data-facturas-action="${FACTURAS_ACTIONS.RETRY_PAGE}" data-action="${FACTURAS_ACTIONS.RETRY_PAGE}">${icon("refresh")}<span>Reintentar</span></button>`
    : loadingMore
    ? renderSpinner("Cargando más facturas...")
    : refreshing
      ? renderSpinner("Actualizando facturas...")
    : hasMore ? "El historial continúa al desplazarte." : hasRows ? "Has visto todas las facturas disponibles." : "";

  return `<div class="facturas-infinite" data-facturas-infinite="true" data-loaded="${attr(String(listState.loadedCount || 0))}" data-visible="${attr(String(listState.visibleCount || 0))}" data-total="${attr(String(listState.remoteTotal || listState.totalCount || 0))}" data-has-more="${hasMore ? "true" : "false"}" tabindex="-1" role="status" aria-live="polite" aria-atomic="true">
    ${hasMore && !loadingMore && !refreshing && !loadMoreError ? '<div class="facturas-infinite-sentinel" data-facturas-infinite-sentinel="true" aria-hidden="true"></div>' : ""}
    ${status ? `<div class="facturas-infinite-status${loadingMore || refreshing ? " is-loading" : ""}${loadMoreError ? " is-error" : ""}${!hasMore && hasRows ? " is-complete" : ""}">${status}</div>` : ""}
  </div>`;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const rows = sortFacturas(getInputItems(data), { sort: "date_desc" });
  const runtime = getRuntimeState(data);
  const stats = computeStats(rows);
  const canCreateFactura = isAdmin(data);
  const updatedAt = first(data.lastUpdatedAt, runtime.lastSyncAt, data.updatedAt, runtime.updatedAt, ...rows.map(getUpdatedAt));
  const remoteCount = getRemoteTotal(data, stats.total);
  const exportIsPartial = remoteCount > rows.length;
  const exportLabel = exportIsPartial ? "Exportar cargadas" : "Exportar CSV";
  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const loading = Boolean(first(runtime.loading, data.loading));
  const creating = Boolean(first(runtime.creating, runtime.creatingFactura, data.creating));

  return `<section class="facturas-hero">
    <div class="facturas-hero-top">
      <div class="facturas-hero-copy"><h1 class="facturas-page-title">Facturas</h1><p class="facturas-page-subtitle">Gestiona facturas, cobros, documentos PDF y su incidencia vinculada desde un único historial.</p></div>
      <div class="facturas-hero-actions">
        <button type="button" id="facturas-export-btn" class="facturas-btn" data-action="${FACTURAS_ACTIONS.EXPORT}" data-facturas-action="${FACTURAS_ACTIONS.EXPORT}" ${disabledAttrs(loading || refreshing || !rows.length)}>${icon("export")}<span class="facturas-btn-text">${escapeHtml(exportLabel)}</span></button>
        ${canCreateFactura ? `<button type="button" id="facturas-create-btn" class="facturas-btn facturas-btn--create${creating ? " is-loading" : ""}" data-action="${FACTURAS_ACTIONS.CREATE_OPEN}" data-facturas-action="${FACTURAS_ACTIONS.CREATE_OPEN}" aria-label="Crear nueva factura" ${disabledAttrs(creating, creating)}>${creating ? renderSpinner("Abriendo...") : `${icon("plus")}<span class="facturas-btn-text">Crear factura</span>`}</button>` : ""}
      </div>
    </div>
    <div class="facturas-hero-meta">
      <span class="facturas-meta-pill">${icon("detail")}<span>${escapeHtml(`${remoteCount} facturas`)}</span></span>
      <span class="facturas-meta-pill">${icon("refresh")}<span>${updatedAt ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`) : "Sin actualizaciones recientes"}</span></span>
      <span class="facturas-meta-pill">${icon("pdf")}<span>${escapeHtml(`${stats.pdfCount} con PDF`)}</span></span>
      <span class="facturas-meta-pill">${icon("mail")}<span>${escapeHtml(`${stats.sentCount} enviadas`)}</span></span>
    </div>
    <div class="facturas-stats">
      <article class="facturas-stat-card facturas-stat-card--accent"><div class="facturas-stat-label">Facturas cargadas</div><div class="facturas-stat-value">${escapeHtml(String(stats.total))}</div><div class="facturas-stat-text">Documentos disponibles en la sesión actual.</div></article>
      <article class="facturas-stat-card facturas-stat-card--success"><div class="facturas-stat-label">Importe visible</div><div class="facturas-stat-value">${escapeHtml(formatMoney(stats.totalImporte, DEFAULT_CURRENCY))}</div><div class="facturas-stat-text">Suma de las facturas cargadas actualmente.</div></article>
      <article class="facturas-stat-card facturas-stat-card--warning"><div class="facturas-stat-label">Pendientes</div><div class="facturas-stat-value">${escapeHtml(String(stats.pendingCount))}</div><div class="facturas-stat-text">Cobro pendiente, parcial o documento en borrador.</div></article>
      <article class="facturas-stat-card facturas-stat-card--danger"><div class="facturas-stat-label">Vencidas / pagadas</div><div class="facturas-stat-value">${escapeHtml(`${stats.overdueCount} / ${stats.paidCount}`)}</div><div class="facturas-stat-text">Balance rápido del estado de cobro.</div></article>
    </div>
  </section>`;
}

/* =========================================================
   STATES / MAIN TABLE
========================================================= */

export function renderFacturasLoadingState(input = {}) {
  const data = safeObject(input);
  const payload = {
    ...data,
    loading: true,
    state: { ...getRuntimeState(data), loading: true },
  };
  return `<section class="facturas-view-root facturas-view-root--loading" data-facturas-scope="true" data-template-version="${attr(FACTURAS_TEMPLATE_VERSION)}" aria-busy="true">${renderHeader(payload)}${renderCards(payload)}</section>`;
}

export function renderFacturasErrorState(message = "No se pudieron cargar las facturas.") {
  return `<section class="facturas-view-root facturas-view-root--error" data-facturas-scope="true" data-template-version="${attr(FACTURAS_TEMPLATE_VERSION)}"><section id="facturas-fatal-error" class="facturas-error" role="alert" aria-atomic="true" tabindex="-1"><h3 class="facturas-error-title">No se pudo cargar Facturas</h3><p class="facturas-error-text">${escapeHtml(cleanText(message, "Error desconocido al cargar la vista."))}</p><button type="button" class="facturas-btn facturas-btn--primary" data-facturas-action="${FACTURAS_ACTIONS.REFRESH}" data-action="${FACTURAS_ACTIONS.REFRESH}">${icon("refresh")}<span class="facturas-btn-text">Reintentar</span></button></section></section>`;
}

export const renderLoadingState = renderFacturasLoadingState;
export const renderErrorState = renderFacturasErrorState;

export function renderCards(input = {}) {
  const data = safeObject(input);
  const items = getInputItems(data);
  const runtime = getRuntimeState(data);
  const listState = getListState(items, data);
  const loading = Boolean(first(runtime.loading, data.loading));
  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const hasError = Boolean(cleanText(first(runtime.error, data.error), ""));
  const showInitialLoading = loading && !listState.visibleItems.length;
  const showRefreshOverlay = refreshing && listState.visibleItems.length;
  const activeFilterLabel = getFilterLabel(listState.activeFilter);
  const searchQuery = listState.searchQuery;
  const sortLabel = listState.sortDirection === "asc" ? "fecha ascendente" : "fecha descendente";
  const activeCriteria = [
    listState.activeFilter !== "all" ? activeFilterLabel : "",
    searchQuery ? `búsqueda “${searchQuery}”` : "",
  ].filter(Boolean);

  const visibleLabel = `${listState.visibleCount} ${listState.visibleCount === 1 ? "factura" : "facturas"}`;
  const loadedLabel = `${listState.loadedCount} ${listState.loadedCount === 1 ? "cargada" : "cargadas"}`;
  const remoteLabel = `${listState.remoteTotal} ${listState.remoteTotal === 1 ? "factura" : "facturas"}`;
  const subtitle = showInitialLoading
    ? "Cargando facturas..."
    : listState.filtering
      ? `Mostrando ${visibleLabel} de ${loadedLabel}${activeCriteria.length ? ` · ${activeCriteria.join(" · ")}` : ""}`
      : `Mostrando ${visibleLabel} de ${remoteLabel} · orden ${sortLabel}`;

  return `<section class="facturas-history">
    <div class="facturas-history-head"><div class="facturas-history-copy"><h2 class="facturas-history-title">Historial de facturas</h2><p class="facturas-history-subtitle">${escapeHtml(subtitle)}</p></div>${renderFilters(data, listState)}</div>
    ${showInitialLoading ? `<span id="facturas-list-status" class="facturas-loading-status" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">Cargando facturas...</span>${renderTableLoading(DEFAULT_SKELETON_ROWS)}` : `<div class="facturas-table-wrap${refreshing ? " is-refreshing" : ""}">${showRefreshOverlay ? renderRefreshOverlay() : ""}${listState.visibleItems.length ? `<div class="facturas-table-shell"><table class="facturas-table" role="table" aria-label="Listado de facturas"><colgroup><col class="facturas-table-col--main"><col class="facturas-table-col--status"><col class="facturas-table-col--date"><col class="facturas-table-col--amount"><col class="facturas-table-col--incidencia"><col class="facturas-table-col--actions"></colgroup><thead><tr><th scope="col">Factura / cliente</th><th scope="col">Pago</th><th scope="col">Emitida</th><th scope="col">Total</th><th scope="col">Incidencia</th><th scope="col">Acciones</th></tr></thead><tbody>${listState.visibleItems.map((item) => renderRow(item, runtime)).join("")}</tbody></table></div>${renderInfiniteScrollFooter(listState, runtime)}` : renderEmptyState({ hasError, filtering: listState.filtering, searchQuery })}</div>`}
  </section>`;
}

export const renderTable = renderCards;

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderFacturasTemplate(input = {}) {
  const data = safeObject(input);
  const items = getInputItems(data);
  const runtime = getRuntimeState(data);
  if (runtime.error && !items.length) return renderFacturasErrorState(runtime.error);

  const payload = { ...data, items, state: runtime };
  return `<section class="facturas-view-root" data-facturas-scope="true" data-template-version="${attr(FACTURAS_TEMPLATE_VERSION)}" data-total="${attr(String(first(data.total, data.remoteCount, items.length)))}" data-count="${attr(String(items.length))}" aria-busy="${payload.loading || runtime.loading || runtime.refreshing || runtime.loadingMore ? "true" : "false"}">
    ${cleanText(first(data.error, runtime.error), "") ? `<div class="facturas-alert facturas-alert--error" role="alert">${icon("lock")}<span>${escapeHtml(cleanText(first(data.error, runtime.error), ""))}</span></div>` : ""}
    ${renderHeader(payload)}${renderCards(payload)}${renderFacturasCreateModal(data.createModal || {})}${renderFacturasDetailModal(data.detailModal || {})}
  </section>`;
}

export const renderFacturasViewTemplate = renderFacturasTemplate;

/* =========================================================
   OPTIONAL DOM HARDENING
========================================================= */

export function bindFacturasTemplateDom(root = null) {
  const scope = root || (typeof document !== "undefined" ? document.querySelector(".facturas-view-root, [data-facturas-scope]") : null);
  if (!scope || typeof scope.querySelectorAll !== "function") return false;

  scope.querySelectorAll("[data-facturas-avatar-img='true']").forEach((img) => {
    if (!img || img.dataset.facturasAvatarBound === "true") return;
    img.dataset.facturasAvatarBound = "true";
    const avatar = img.closest("[data-facturas-avatar='true']");
    const setFallback = () => {
      if (avatar) {
        avatar.setAttribute("data-fallback", "true");
        avatar.classList.add("facturas-avatar--fallback");
        avatar.classList.remove("has-image");
      }
      try { img.hidden = true; } catch { /* noop */ }
    };
    img.addEventListener("error", setFallback, { passive: true });
    if (img.complete && img.naturalWidth === 0) setFallback();
  });

  return true;
}

export function getFacturasTemplateSnapshot() {
  return {
    version: FACTURAS_TEMPLATE_VERSION,
    actions: FACTURAS_ACTIONS,
    filters: FILTERS,
    sortOptions: SORT_OPTIONS,
    policy: {
      templateMain: true,
      includesCreateModal: true,
      includesDetailModal: true,
      noAppCore: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
      noStateExternal: true,
      tableMarkup: true,
      filtersMarkup: true,
      searchMarkup: true,
      paginationMarkup: false,
      infiniteScrollMarkup: true,
      pdfActions: true,
      sendActions: true,
      openIncidenciaAction: true,
      identityAvatarTone: "email-or-name",
      optionalAvatarFallbackBinding: true,
    },
  };
}

export default {
  FACTURAS_TEMPLATE_VERSION,
  FACTURAS_ACTIONS,
  renderHeader,
  renderCards,
  renderTable,
  renderLoadingState,
  renderErrorState,
  renderFacturasLoadingState,
  renderFacturasErrorState,
  renderFacturasTemplate,
  renderFacturasViewTemplate,
  bindFacturasTemplateDom,
  getFacturasTemplateSnapshot,
};
