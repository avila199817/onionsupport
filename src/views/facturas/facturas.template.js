/* =========================================================
   Onion Support - Facturas Template
   Archivo: /src/views/facturas/facturas.template.js

   Responsabilidad:
   - Render HTML puro de la vista Facturas.
   - Header, stats, filtros, búsqueda, orden y tabla.
   - Integrar modal de creación y modal de detalle.
   - Exponer data-action/data-facturas-action para index.js.
   - Exponer sentinel para scroll infinito.
   - Mantener clases CSS externas facturas-*.
   - Sin AppCore.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin State externo.
   - Sin lógica de negocio real.
========================================================= */

import {
  renderFacturasCreateModal,
} from "./facturas.template.create.js";

import {
  renderFacturasDetailModal,
} from "./facturas.template.modal.js";

export const FACTURAS_TEMPLATE_VERSION = "facturas.template.infinite.v2";

export const FACTURAS_ACTIONS = Object.freeze({
  REFRESH: "refresh",
  EXPORT: "export",

  CREATE_OPEN: "create-factura",

  FILTER: "filter",
  CLEAR_FILTERS: "clear-filters",
  CLEAR_SEARCH: "clear-search",
  SEARCH: "search",
  SORT: "sort",
  LOAD_MORE: "load-more",

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

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
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
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return fallback;

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

function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

function htmlAttrs(attrs = {}) {
  return Object.entries(safeObject(attrs))
    .map(([key, value]) => {
      if (!key) return "";
      if (value === false || value === null || value === undefined) return "";
      if (value === true) return escapeHtml(key);

      return `${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function tooltipAttrs(tooltip = "", ariaLabel = "") {
  const cleanTooltip = cleanText(tooltip, "");
  const cleanAria = cleanText(ariaLabel, cleanTooltip);

  return htmlAttrs({
    "aria-label": cleanAria || false,
    "data-tooltip": cleanTooltip || false,
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
  const cleanAction = cleanText(action, "");
  const cleanFacturaId = cleanText(facturaId, "");

  return htmlAttrs({
    "data-action": cleanAction,
    "data-facturas-action": cleanAction,
    "data-factura-id": cleanFacturaId || false,
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

  if (["true", "1", "yes", "si", "sí", "on"].includes(key)) return true;
  if (["false", "0", "no", "off"].includes(key)) return false;

  return fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hashString(value = "") {
  const text = cleanText(value, "onion");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return Math.abs(hash >>> 0);
}

function readPath(source = {}, path = "") {
  const parts = cleanText(path, "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

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
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function safeImageSrc(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(raw)) return "";

  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

/* =========================================================
   INPUT / STATE
========================================================= */

function getInputItems(input = {}) {
  const data = safeObject(input);

  return safeArray(
    first(
      data.items,
      data.rows,
      data.facturas,
      data.invoices,
      data.data?.items,
      data.data?.facturas,
      data.payload?.items,
      data.payload?.facturas,
      []
    )
  );
}

function getRuntimeState(input = {}) {
  const data = safeObject(input);

  return safeObject(
    first(
      data.state,
      data.viewState,
      data.runtime,
      data.meta?.state,
      {}
    )
  );
}

function isAdmin(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);
  const role = normalizeKey(first(data.role, data.rol, runtime.role, runtime.rol, data.user?.role, data.user?.rol, ""));

  return (
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

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

function formatDateShort(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

function formatDateTime(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "Sin fecha";

  const diffMin = Math.round((timestamp - Date.now()) / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";
  if (absMin < 60) return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;

  const diffHours = Math.round(absMin / 60);
  if (diffHours < 24) return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDateShort(value);
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    export: `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    detail: `<svg ${common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    download: `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    send: `<svg ${common}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    pdf: `<svg ${common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 17v-5"/><path d="M8 12h2a1.5 1.5 0 0 1 0 3H8"/><path d="M13 17v-5h1.5a2.5 2.5 0 0 1 0 5H13"/><path d="M18 12h-2v5"/></svg>`,
    lock: `<svg ${common}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
    mail: `<svg ${common}><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>`,
    check: `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    calendar: `<svg ${common}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
    filter: `<svg ${common}><path d="M22 3H2l8 9.46V19l4 2v-8.54Z"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   DOMAIN PICKERS
========================================================= */

function getRaw(item = {}) {
  return safeObject(item?.raw);
}

function fromItem(item = {}, paths = [], fallback = "") {
  const raw = getRaw(item);
  return cleanText(first(firstPath(item, paths), firstPath(raw, paths)), fallback);
}

function getFacturaId(item = {}) {
  return fromItem(item, [
    "id",
    "facturaId",
    "invoiceId",
    "numeroFacturaLegal",
    "numeroFacturaSistema",
    "numeroFactura",
    "numero",
    "number",
  ], "FAC-SIN-ID");
}

function getFacturaNumero(item = {}) {
  return fromItem(item, [
    "numeroFacturaLegal",
    "numeroFactura",
    "number",
    "invoiceNumber",
    "numero",
    "code",
    "facturaId",
    "invoiceId",
    "id",
  ], "Factura sin número");
}

function getFacturaSistema(item = {}) {
  return fromItem(item, ["numeroFacturaSistema", "systemInvoiceNumber", "systemNumber"], "");
}

function getCompanyName(item = {}) {
  return fromItem(item, [
    "clienteEmpresa",
    "empresa",
    "company",
    "companyName",
    "razonSocial",
    "cliente.razonSocial",
    "cliente.companyName",
    "cliente.empresa",
    "client.razonSocial",
    "client.companyName",
    "customer.razonSocial",
    "customer.companyName",
    "clienteSnapshot.razonSocial",
  ], "");
}

function getContactName(item = {}) {
  return fromItem(item, [
    "clienteNombre",
    "nombreContacto",
    "contactName",
    "cliente.nombreContacto",
    "cliente.nombre",
    "cliente.name",
    "cliente.displayName",
    "clienteSnapshot.nombreContacto",
    "clientName",
    "client.name",
    "customer.name",
    "name",
    "nombre",
  ], "");
}

function getClientName(item = {}) {
  return cleanText(first(getCompanyName(item), getContactName(item)), "Cliente");
}

function getClientSecondaryName(item = {}) {
  const company = getCompanyName(item);
  const contact = getContactName(item);

  return company && contact && normalizeText(company) !== normalizeText(contact)
    ? contact
    : "";
}

function getClientEmail(item = {}) {
  return fromItem(item, [
    "clienteEmail",
    "emailCliente",
    "cliente.email",
    "cliente.emailLower",
    "clienteSnapshot.email",
    "email",
    "clientEmail",
    "client.email",
    "customer.email",
  ], "").toLowerCase();
}

function getClientEmailLabel(item = {}) {
  return getClientEmail(item) || "Sin email";
}

function getClientAvatar(item = {}) {
  return safeImageSrc(firstPath(item, [
    "clienteAvatar",
    "clientAvatar",
    "avatar",
    "avatarUrl",
    "logo",
    "logoUrl",
    "photo",
    "photoUrl",
    "picture",
    "pictureUrl",
    "cliente.avatar",
    "cliente.avatarUrl",
    "cliente.logo",
    "cliente.logoUrl",
    "client.avatar",
    "client.avatarUrl",
    "customer.avatar",
    "customer.avatarUrl",
  ]) || firstPath(getRaw(item), [
    "clienteAvatar",
    "clientAvatar",
    "avatar",
    "avatarUrl",
    "logo",
    "logoUrl",
    "photo",
    "photoUrl",
    "picture",
    "pictureUrl",
    "cliente.avatar",
    "cliente.avatarUrl",
    "client.avatar",
    "client.avatarUrl",
  ]));
}

function getInitials(value = "") {
  const text = cleanText(value, "");
  if (!text) return "ON";

  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

function getAvatarToneClass(item = {}) {
  const stable = first(
    item.clienteId,
    item.clientId,
    item.customerId,
    item.userId,
    item.uid,
    getClientEmail(item),
    getClientName(item)
  );

  return `facturas-avatar--tone-${hashString(stable) % 10}`;
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
  const key = getEstadoPagoKey(value);

  if (key === "paid") return "Pagada";
  if (key === "pending") return "Pendiente";
  if (key === "partial") return "Pago parcial";
  if (key === "overdue") return "Vencida";
  if (key === "cancelled") return "Cancelada";
  if (key === "draft") return "Borrador";

  return cleanText(value, "Pendiente");
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

function getIncidenciaId(item = {}) {
  const direct = fromItem(item, [
    "ticketId",
    "incidenciaId",
    "incidencia.id",
    "incidencia.ticketId",
    "incidencia.incidenciaId",
    "ticket.id",
    "ticket.ticketId",
    "ticket.incidenciaId",
    "linkedTicket.id",
    "linkedTicket.ticketId",
    "linkedTicket.incidenciaId",
    "relatedTicketId",
    "relatedIncidentId",
    "supportTicketId",
    "caseId",
    "meta.ticketId",
    "meta.linkedTicketId",
    "meta.incidenciaId",
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

function getIncidenciaSubject(item = {}) {
  return fromItem(item, [
    "incidencia.subject",
    "incidencia.asunto",
    "incidencia.title",
    "ticket.subject",
    "ticket.asunto",
    "ticket.title",
    "linkedTicket.subject",
    "linkedTicket.asunto",
    "linkedTicket.title",
  ], "");
}

function getTotalRaw(item = {}) {
  return first(
    item.total,
    item.amount,
    item.importe,
    item.importeTotal,
    item.totalFactura,
    item.facturaTotal,
    item.invoiceAmount,
    item.totales?.total,
    getRaw(item).total,
    getRaw(item).amount,
    getRaw(item).importe,
    getRaw(item).importeTotal,
    getRaw(item).totalFactura,
    getRaw(item).facturaTotal,
    getRaw(item).invoiceAmount,
    getRaw(item).totales?.total,
    0
  );
}

function getCurrency(item = {}) {
  return fromItem(item, ["moneda", "currency", "facturaCurrency", "totales.currency", "payment.currency", "meta.currency"], DEFAULT_CURRENCY).toUpperCase();
}

function getTotalLabel(item = {}) {
  return formatMoney(getTotalRaw(item), getCurrency(item));
}

function getTotalCaption(item = {}) {
  const taxIncluded = first(item.taxIncluded, item.impuestosIncluidos, item.ivaIncluido, getRaw(item).taxIncluded, getRaw(item).impuestosIncluidos, getRaw(item).ivaIncluido);
  return taxIncluded === false ? "Impuestos no incl." : "Impuestos incl.";
}

function getFormaPago(item = {}) {
  return fromItem(item, ["formaPago", "metodoPago", "paymentMethod", "payment.methodLabel", "payment.method"], "—");
}

function getCreatedAt(item = {}) {
  return first(
    item.fechaFactura,
    item.fechaFacturaISO,
    item.lifecycle?.issuedAt,
    item.issueDate,
    item.issuedAt,
    item.fecha,
    item.createdAt,
    item.lifecycle?.createdAt,
    item.fechaCreacion,
    getRaw(item).fechaFactura,
    getRaw(item).fechaFacturaISO,
    getRaw(item).lifecycle?.issuedAt,
    getRaw(item).issueDate,
    getRaw(item).issuedAt,
    getRaw(item).fecha,
    getRaw(item).createdAt,
    getRaw(item).lifecycle?.createdAt,
    getRaw(item).fechaCreacion
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.lifecycle?.updatedAt,
    item.lastActivityAt,
    item.lifecycle?.lastActivityAt,
    item.fechaEnvio,
    item.delivery?.lastSentAt,
    item.sentAt,
    item.mailSentAt,
    item.fechaActualizacion,
    item.lastUpdateAt,
    getRaw(item).updatedAt,
    getRaw(item).lifecycle?.updatedAt,
    getRaw(item).lastActivityAt,
    getRaw(item).lifecycle?.lastActivityAt,
    getRaw(item).fechaEnvio,
    getRaw(item).delivery?.lastSentAt,
    getRaw(item).sentAt,
    getRaw(item).mailSentAt,
    getRaw(item).fechaActualizacion,
    getRaw(item).lastUpdateAt
  );
}

function getSentAt(item = {}) {
  return first(item.fechaEnvio, item.sentAt, item.mailSentAt, item.email?.sentAt, item.delivery?.lastSentAt, item.lifecycle?.sentAt, item.meta?.lastSentAt, getRaw(item).fechaEnvio, getRaw(item).sentAt, getRaw(item).email?.sentAt);
}

function getSortTimestamp(item = {}) {
  return (
    number(item?.meta?.updatedAtMs, 0) ||
    number(item?.meta?.timestampMs, 0) ||
    number(getRaw(item)?.meta?.updatedAtMs, 0) ||
    number(getRaw(item)?.meta?.timestampMs, 0) ||
    toTimestamp(getUpdatedAt(item)) ||
    toTimestamp(getCreatedAt(item)) ||
    toTimestamp(getRaw(item)?._ts) ||
    0
  );
}

function getEmissionTimestamp(item = {}) {
  return toTimestamp(getCreatedAt(item)) || getSortTimestamp(item);
}

function hasPdf(item = {}) {
  if (bool(first(item.pdfAvailable, item.hasPdf, item.document?.available, item.meta?.hasPdf, getRaw(item).pdfAvailable, getRaw(item).hasPdf), false)) return true;

  return Boolean(first(item.blobPath, item.blobName, item.pdfPath, item.pdfUrl, item.downloadUrl, item.viewUrl, item.pdf, item.document?.blobPath, item.document?.fileName, getRaw(item).blobPath, getRaw(item).blobName, getRaw(item).pdfPath, getRaw(item).pdfUrl, getRaw(item).downloadUrl, getRaw(item).viewUrl, getRaw(item).document?.blobPath));
}

function isFacturaSent(item = {}) {
  if (getSentAt(item)) return true;

  return bool(first(item.email?.sent, item.delivery?.sent, item.lifecycle?.sent, item.meta?.isSent, item.meta?.hasEmailSent, getRaw(item).email?.sent, getRaw(item).delivery?.sent, getRaw(item).meta?.isSent), false);
}

function isValidEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function canSendFactura(item = {}) {
  return hasPdf(item) && isValidEmail(getClientEmail(item));
}

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

function getActiveFilter(input = {}) {
  return normalizeFilter(getRuntimeValue(input, ["filter", "paymentFilter", "statusFilter", "activeFilter", "facturasFilter"], "all"));
}

function getFilterLabel(filter = "all") {
  return FILTERS.find((item) => item.key === normalizeFilter(filter))?.label || "Todas";
}

function getSearchQuery(input = {}) {
  return cleanText(getRuntimeValue(input, ["search", "searchQuery", "query", "q", "term", "keyword", "facturasSearch"], ""), "");
}

function normalizeSort(value = "") {
  const key = normalizeKey(value);
  return [
    "date_asc",
    "fecha_asc",
    "emission_asc",
    "issue_date_asc",
    "fecha_emision_asc",
    "oldest",
    "oldest_first",
    "menor_fecha",
  ].includes(key)
    ? "date_asc"
    : "date_desc";
}

function getSortMode(input = {}) {
  return normalizeSort(getRuntimeValue(input, ["sort", "sortBy", "orderBy", "sortMode", "facturasSort"], "date_desc"));
}

function getSortDirection(sortMode = "date_desc") {
  return normalizeSort(sortMode).endsWith("_asc") ? "asc" : "desc";
}

function getSortOption(sortMode = "date_desc") {
  const mode = normalizeSort(sortMode);
  return SORT_OPTIONS.find((option) => option.modes.includes(mode)) || SORT_OPTIONS[0];
}

function getNextSortMode(option = SORT_OPTIONS[0], currentSortMode = "date_desc") {
  const mode = normalizeSort(currentSortMode);
  return option.modes.includes(mode) && mode.endsWith("_desc") ? option.asc : option.desc;
}

function getSortButtonLabel(option = SORT_OPTIONS[0], currentSortMode = "date_desc") {
  const mode = normalizeSort(currentSortMode);
  const active = option.modes.includes(mode);

  if (!active) return `${option.label} ↓`;
  return `${option.label} ${mode.endsWith("_asc") ? "↑" : "↓"}`;
}

function getSortButtonTooltip(option = SORT_OPTIONS[0], currentSortMode = "date_desc") {
  return getNextSortMode(option, currentSortMode).endsWith("_asc") ? option.tooltipAsc : option.tooltipDesc;
}

function itemMatchesFilter(item = {}, filter = "all") {
  const key = normalizeFilter(filter);
  const paymentKey = getEstadoPagoKey(getPaymentRaw(item));

  if (key === "all") return true;
  if (key === "pending") return ["pending", "partial", "draft"].includes(paymentKey);
  if (key === "paid") return paymentKey === "paid";
  if (key === "overdue") return paymentKey === "overdue";

  return true;
}

function getSearchHaystack(item = {}) {
  return [
    getFacturaId(item),
    getFacturaNumero(item),
    getFacturaSistema(item),
    getCompanyName(item),
    getContactName(item),
    getClientName(item),
    getClientEmail(item),
    getEstadoPagoLabel(getPaymentRaw(item)),
    getTotalLabel(item),
    getFormaPago(item),
    getIncidenciaId(item),
    getIncidenciaSubject(item),
    getCreatedAt(item),
    getUpdatedAt(item),
    item.clienteId,
    item.clientId,
    item.customerId,
    item.userId,
    item.uid,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" · ");
}

function itemMatchesSearch(item = {}, query = "") {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;

  const haystack = getSearchHaystack(item);
  return normalizedQuery.split(" ").filter(Boolean).every((term) => haystack.includes(term));
}

function compareFacturaNumeroAsc(a = {}, b = {}) {
  return cleanText(getFacturaNumero(a), "").localeCompare(cleanText(getFacturaNumero(b), ""), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareFacturaNumeroDesc(a = {}, b = {}) {
  return cleanText(getFacturaNumero(b), "").localeCompare(cleanText(getFacturaNumero(a), ""), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortFacturas(items = [], input = {}) {
  const sortMode = getSortMode(input);

  return [...safeArray(items)].sort((a, b) => {
    const diff = sortMode === "date_asc"
      ? getEmissionTimestamp(a) - getEmissionTimestamp(b)
      : getEmissionTimestamp(b) - getEmissionTimestamp(a);

    if (diff) return diff;
    return sortMode === "date_asc" ? compareFacturaNumeroAsc(a, b) : compareFacturaNumeroDesc(a, b);
  });
}

function filterFacturas(items = [], input = {}) {
  const filter = getActiveFilter(input);
  const search = getSearchQuery(input);

  return safeArray(items)
    .filter((item) => itemMatchesFilter(item, filter))
    .filter((item) => itemMatchesSearch(item, search));
}

function filterAndSortFacturas(items = [], input = {}) {
  return sortFacturas(filterFacturas(items, input), input);
}

function isFilterActive(input = {}) {
  return getActiveFilter(input) !== "all" || Boolean(getSearchQuery(input));
}

function computeFilterCounts(items = [], input = {}) {
  const rows = safeArray(items);
  const searchQuery = getSearchQuery(input);
  const searchableRows = rows.filter((item) => itemMatchesSearch(item, searchQuery));

  return FILTERS.reduce((acc, filter) => {
    acc[filter.key] = searchableRows.filter((item) => itemMatchesFilter(item, filter.key)).length;
    return acc;
  }, {});
}

/* =========================================================
   STATS / LIST STATE
========================================================= */

function computeStats(items = []) {
  return safeArray(items).reduce(
    (acc, item) => {
      const total = number(getTotalRaw(item), 0);
      const paymentKey = getEstadoPagoKey(getPaymentRaw(item));

      acc.total += 1;
      acc.totalImporte += total;

      if (paymentKey === "paid") {
        acc.paidCount += 1;
        acc.totalPagado += total;
      }

      if (["pending", "partial", "draft"].includes(paymentKey)) {
        acc.pendingCount += 1;
        acc.totalPendiente += total;
      }

      if (paymentKey === "overdue") {
        acc.overdueCount += 1;
        acc.totalVencido += total;
      }

      if (hasPdf(item)) acc.pdfCount += 1;
      if (isFacturaSent(item)) acc.sentCount += 1;
      if (getIncidenciaId(item)) acc.incidenciaCount += 1;

      return acc;
    },
    {
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
    }
  );
}

function getRemoteTotal(input = {}, fallback = 0) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);

  return Math.max(
    number(first(data.totalCount, data.remoteCount, data.totalMatched, data.total, runtime.totalCount, runtime.remoteCount, runtime.totalMatched, runtime.total, fallback), fallback),
    fallback
  );
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
  const sortMode = getSortMode(data);

  return {
    allItems: visibleItems,
    visibleItems,
    pageItems: visibleItems,
    batchSize,
    pageSize: batchSize,
    currentPage,
    nextPage,
    totalPages: Math.max(1, Math.ceil((remoteTotal || loadedCount || 1) / batchSize)),
    totalCount: filtering ? visibleCount : remoteTotal,
    unfilteredCount: loadedCount,
    loadedCount,
    visibleCount,
    remoteTotal,
    rangeStart: visibleCount ? 1 : 0,
    rangeEnd: visibleCount,
    hasPrev: false,
    hasNext: hasMore,
    hasMore,
    loadingMore,
    filtering,
    activeFilter: getActiveFilter(data),
    searchQuery: getSearchQuery(data),
    sortMode,
    sortDirection: getSortDirection(sortMode),
    sortOption: getSortOption(sortMode),
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
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="facturas-inline-loading">
      <span class="facturas-inline-spinner" aria-hidden="true"></span>
      ${label ? `<span class="facturas-inline-loading-text">${escapeHtml(label)}</span>` : ""}
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="facturas-loader-only"
      role="status"
      ${tooltipAttrs(label, label)}
    >
      <span class="facturas-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = getInitials(fullName);
  const avatarUrl = getClientAvatar(item);
  const toneClass = getAvatarToneClass(item);

  if (avatarUrl) {
    return `
      <div
        class="facturas-avatar has-image ${attr(toneClass)}"
        ${tooltipAttrs(fullName, fullName)}
        data-fallback="false"
        data-facturas-avatar="true"
      >
        <img
          class="facturas-avatar-img"
          src="${attr(avatarUrl)}"
          alt="${attr(fullName)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          data-facturas-avatar-img="true"
        >
        <span class="facturas-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="facturas-avatar facturas-avatar--fallback ${attr(toneClass)}"
      ${tooltipAttrs(fullName, fullName)}
      data-fallback="true"
      data-facturas-avatar="true"
    >
      <span class="facturas-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderEstadoPagoChip(item = {}) {
  const rawStatus = getPaymentRaw(item);
  const label = getEstadoPagoLabel(rawStatus);
  const key = getEstadoPagoKey(rawStatus);

  return `
    <span class="facturas-chip facturas-chip--${attr(key)}">
      <span class="facturas-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderDeliveryBadge(item = {}) {
  const sent = isFacturaSent(item);
  const sentAt = getSentAt(item);

  if (sent) {
    const tooltip = sentAt ? `Enviada · ${formatDateTime(sentAt)}` : "Factura enviada";

    return `
      <span class="facturas-mini-badge facturas-mini-badge--sent" ${tooltipAttrs(tooltip, tooltip)}>
        ${icon("check")}
        Enviada
      </span>
    `;
  }

  return `
    <span class="facturas-mini-badge facturas-mini-badge--idle" ${tooltipAttrs("Factura no enviada todavía", "Factura no enviada todavía")}>
      ${icon("mail")}
      No enviada
    </span>
  `;
}

function renderPdfBadge(item = {}) {
  if (hasPdf(item)) {
    return `
      <span class="facturas-mini-badge facturas-mini-badge--pdf" ${tooltipAttrs("PDF disponible", "PDF disponible")}>
        ${icon("pdf")}
        PDF
      </span>
    `;
  }

  return `
    <span class="facturas-mini-badge facturas-mini-badge--blocked" ${tooltipAttrs("PDF no disponible", "PDF no disponible")}>
      ${icon("lock")}
      Sin PDF
    </span>
  `;
}

function renderIncidenciaLink(item = {}) {
  const incidenciaId = getIncidenciaId(item);
  const incidenciaSubject = getIncidenciaSubject(item);
  const facturaId = getFacturaId(item);

  if (!incidenciaId) return `<span class="facturas-incidencia-empty">—</span>`;

  const tooltip = incidenciaSubject
    ? `Abrir incidencia · ${incidenciaSubject}`
    : "Abrir incidencia relacionada";

  return `
    <button
      type="button"
      class="facturas-incidencia-link"
      ${actionAttrs(FACTURAS_ACTIONS.OPEN_INCIDENCIA, facturaId)}
      data-ticket-id="${attr(incidenciaId)}"
      data-incidencia-id="${attr(incidenciaId)}"
      ${tooltipAttrs(tooltip, tooltip)}
    >
      ${icon("ticket")}
      <span>${escapeHtml(incidenciaId)}</span>
    </button>
  `;
}

function renderActionButton({
  klass = "",
  action = "",
  facturaId = "",
  label = "",
  loadingLabel = "",
  iconName = "",
  loading = false,
  disabled = false,
  tooltip = "",
  ariaBusy = false,
} = {}) {
  const finalDisabled = Boolean(disabled || loading);
  const finalBusy = Boolean(ariaBusy || loading);
  const finalTooltip = tooltip || label;
  const classes = ["facturas-action-btn", klass, loading ? "is-loading" : ""].map((item) => cleanText(item, "")).filter(Boolean).join(" ");

  return `
    <button
      type="button"
      class="${attr(classes)}"
      ${actionAttrs(action, facturaId)}
      ${tooltipAttrs(finalTooltip, finalTooltip)}
      ${disabledAttrs(finalDisabled, finalBusy)}
    >
      ${
        loading
          ? renderLoaderOnly(loadingLabel || label)
          : `
            <span class="facturas-action-icon">${icon(iconName)}</span>
            <span class="facturas-btn-text">${escapeHtml(label)}</span>
          `
      }
    </button>
  `;
}

/* =========================================================
   FILTERS
========================================================= */

function renderSearch(input = {}) {
  const searchQuery = getSearchQuery(input);

  return `
    <div class="facturas-search" role="search" aria-label="Buscar facturas">
      <span class="facturas-search-icon" aria-hidden="true">
        ${icon("search")}
      </span>

      <input
        id="facturas-search-input"
        class="facturas-search-input"
        type="search"
        value="${attr(searchQuery)}"
        placeholder="Buscar factura, cliente, email, importe..."
        autocomplete="off"
        spellcheck="false"
        data-facturas-action="${FACTURAS_ACTIONS.SEARCH}"
        data-action="${FACTURAS_ACTIONS.SEARCH}"
        data-field="search"
        data-facturas-search-input="true"
        aria-label="Buscar facturas por cliente, email, importe o número de factura"
      >

      ${
        searchQuery
          ? `
            <button
              type="button"
              class="facturas-search-clear"
              data-facturas-action="${FACTURAS_ACTIONS.CLEAR_SEARCH}"
              data-action="${FACTURAS_ACTIONS.CLEAR_SEARCH}"
              ${tooltipAttrs("Limpiar búsqueda", "Limpiar búsqueda")}
            >
              ${icon("close")}
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderFilters(input = {}, listState = {}) {
  const data = safeObject(input);
  const items = getInputItems(data);
  const counts = computeFilterCounts(items, data);
  const activeFilter = normalizeFilter(listState.activeFilter || getActiveFilter(data));
  const sortMode = normalizeSort(listState.sortMode || getSortMode(data));

  return `
    <div class="facturas-filters" aria-label="Filtros, orden y búsqueda de facturas">
      <div class="facturas-filter-pills" role="group" aria-label="Filtrar facturas por estado de pago">
        ${FILTERS.map((filter) => {
          const active = filter.key === activeFilter;
          const count = counts[filter.key] ?? 0;

          return `
            <button
              type="button"
              class="facturas-filter-pill${active ? " is-active" : ""}"
              data-facturas-action="${FACTURAS_ACTIONS.FILTER}"
              data-action="${FACTURAS_ACTIONS.FILTER}"
              data-filter="${attr(filter.key)}"
              data-filter-status="${attr(filter.key)}"
              data-payment-filter="${attr(filter.key)}"
              aria-pressed="${active ? "true" : "false"}"
            >
              <span>${escapeHtml(filter.label)}</span>
              <strong>${escapeHtml(String(count))}</strong>
            </button>
          `;
        }).join("")}
      </div>

      <div
        class="facturas-sort-pills"
        role="group"
        aria-label="Ordenar listado de facturas"
        data-current-sort="${attr(sortMode)}"
      >
        ${SORT_OPTIONS.map((option) => {
          const active = option.modes.includes(sortMode);
          const nextSortMode = getNextSortMode(option, sortMode);
          const nextDirection = getSortDirection(nextSortMode);
          const label = getSortButtonLabel(option, sortMode);
          const tooltip = getSortButtonTooltip(option, sortMode);

          return `
            <button
              type="button"
              class="facturas-sort-pill${active ? " is-active" : ""}"
              data-facturas-action="${FACTURAS_ACTIONS.SORT}"
              data-action="${FACTURAS_ACTIONS.SORT}"
              data-sort="${attr(nextSortMode)}"
              data-sort-mode="${attr(nextSortMode)}"
              data-facturas-sort="${attr(nextSortMode)}"
              data-current-sort="${attr(sortMode)}"
              data-next-sort="${attr(nextSortMode)}"
              data-sort-key="${attr(option.key)}"
              data-sort-direction="${attr(nextDirection)}"
              ${tooltipAttrs(tooltip, tooltip)}
              aria-pressed="${active ? "true" : "false"}"
            >
              ${icon("calendar")}
              <span>${escapeHtml(label)}</span>
            </button>
          `;
        }).join("")}
      </div>

      ${renderSearch(data)}
    </div>
  `;
}

/* =========================================================
   ROW / TABLE
========================================================= */

function renderRow(item = {}, state = {}) {
  const busy = resolveBusyMeta(item, state);
  const facturaId = busy.facturaId;
  const numero = getFacturaNumero(item);
  const numeroSistema = getFacturaSistema(item);
  const clientName = getClientName(item);
  const secondaryName = getClientSecondaryName(item);
  const clientEmail = getClientEmailLabel(item);
  const createdAtRaw = getCreatedAt(item);
  const createdAt = formatDateShort(createdAtRaw);
  const createdAtTooltip = formatDateTime(createdAtRaw);
  const total = getTotalLabel(item);
  const totalCaption = getTotalCaption(item);
  const formaPago = getFormaPago(item);
  const pdfAvailable = hasPdf(item);
  const sent = isFacturaSent(item);
  const canSend = canSendFactura(item);
  const paymentKey = getEstadoPagoKey(getPaymentRaw(item));

  const sendLabel = sent ? "Reenviar" : "Enviar";
  const sendTooltip = !pdfAvailable
    ? "No se puede enviar: falta PDF"
    : !getClientEmail(item)
      ? "No se puede enviar: falta email válido"
      : sent
        ? "Reenviar factura al cliente"
        : "Enviar factura al cliente";

  return `
    <tr
      class="facturas-table-row facturas-table-row--${attr(paymentKey)}"
      data-facturas-row="true"
      data-factura-id="${attr(facturaId)}"
      data-sent="${sent ? "true" : "false"}"
      data-has-pdf="${pdfAvailable ? "true" : "false"}"
      data-row-click-disabled="false"
      tabindex="0"
      aria-label="Abrir detalle de factura ${attr(numero)}"
    >
      <td class="facturas-cell facturas-cell--main">
        <div class="facturas-main">
          ${renderAvatar(item)}

          <div class="facturas-main-copy">
            <div class="facturas-factura-line">
              <span class="facturas-factura-id">${escapeHtml(numero)}</span>
              ${numeroSistema && numeroSistema !== numero ? `<span class="facturas-system-id">${escapeHtml(numeroSistema)}</span>` : ""}
            </div>

            <div class="facturas-factura-client">${escapeHtml(clientName)}</div>
            ${secondaryName ? `<div class="facturas-factura-contact">${escapeHtml(secondaryName)}</div>` : ""}
            <div class="facturas-factura-email">${escapeHtml(clientEmail)}</div>

            <div class="facturas-row-badges">
              ${renderDeliveryBadge(item)}
              ${renderPdfBadge(item)}
            </div>
          </div>
        </div>
      </td>

      <td class="facturas-cell facturas-cell--status">
        ${renderEstadoPagoChip(item)}
      </td>

      <td class="facturas-cell facturas-cell--date">
        <span class="facturas-date-inline" ${tooltipAttrs(createdAtTooltip, `Fecha de emisión ${createdAtTooltip}`)}>
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="facturas-cell facturas-cell--amount">
        <div class="facturas-total-stack">
          <span class="facturas-total-value">${escapeHtml(total)}</span>
          <span class="facturas-total-caption">${escapeHtml(totalCaption)}</span>
          <span class="facturas-total-meta">${escapeHtml(formaPago)}</span>
        </div>
      </td>

      <td class="facturas-cell facturas-cell--incidencia">
        ${renderIncidenciaLink(item)}
      </td>

      <td class="facturas-cell facturas-cell--actions">
        <div class="facturas-actions">
          ${renderActionButton({
            action: FACTURAS_ACTIONS.OPEN_FACTURA,
            facturaId,
            label: "Detalle",
            loadingLabel: "Abriendo detalle",
            iconName: "detail",
            loading: busy.isOpening,
            tooltip: "Abrir detalle de factura",
            ariaBusy: busy.isOpening,
          })}

          ${renderActionButton({
            action: FACTURAS_ACTIONS.VIEW_PDF,
            facturaId,
            label: "Ver PDF",
            loadingLabel: "Abriendo PDF",
            iconName: "eye",
            loading: busy.isViewingPdf,
            disabled: !pdfAvailable,
            tooltip: pdfAvailable ? "Ver PDF de factura" : "PDF no disponible",
            ariaBusy: busy.isViewingPdf,
          })}

          ${renderActionButton({
            klass: "facturas-action-btn--primary",
            action: FACTURAS_ACTIONS.DOWNLOAD_PDF,
            facturaId,
            label: "Descargar",
            loadingLabel: "Descargando factura",
            iconName: "download",
            loading: busy.isDownloading,
            disabled: !pdfAvailable,
            tooltip: pdfAvailable ? "Descargar factura PDF" : "PDF no disponible",
            ariaBusy: busy.isDownloading,
          })}

          ${renderActionButton({
            klass: "facturas-action-btn--success",
            action: FACTURAS_ACTIONS.SEND_FACTURA,
            facturaId,
            label: sendLabel,
            loadingLabel: "Enviando factura",
            iconName: "send",
            loading: busy.isSending,
            disabled: !canSend,
            tooltip: sendTooltip,
            ariaBusy: busy.isSending,
          })}
        </div>
      </td>
    </tr>
  `;
}

function renderTableLoading(rows = DEFAULT_SKELETON_ROWS) {
  return `
    <div class="facturas-table-loading" aria-hidden="true">
      ${Array.from({ length: rows }).map(() => `
        <div class="facturas-table-loading-row">
          <div class="facturas-skeleton facturas-skeleton--avatar"></div>

          <div class="facturas-table-loading-copy">
            <div class="facturas-skeleton facturas-skeleton--xs"></div>
            <div class="facturas-skeleton facturas-skeleton--lg"></div>
            <div class="facturas-skeleton facturas-skeleton--md"></div>
          </div>

          <div class="facturas-skeleton facturas-skeleton--pill"></div>
          <div class="facturas-skeleton facturas-skeleton--date"></div>
          <div class="facturas-skeleton facturas-skeleton--amount"></div>
          <div class="facturas-skeleton facturas-skeleton--ticket"></div>
          <div class="facturas-skeleton facturas-skeleton--actions"></div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="facturas-refresh-overlay" aria-live="polite">
      <div class="facturas-refresh-card">
        ${renderSpinner("Actualizando facturas...")}
      </div>
    </div>
  `;
}

function renderEmptyState({ hasError = false, filtering = false, searchQuery = "" } = {}) {
  return `
    <div class="facturas-empty">
      <div class="facturas-empty-icon" aria-hidden="true">
        ${hasError ? icon("lock") : filtering ? icon("filter") : icon("detail")}
      </div>

      <h3 class="facturas-empty-title">
        ${
          hasError
            ? "No se pudieron cargar las facturas"
            : filtering
              ? "No hay facturas con este criterio"
              : "No hay facturas para mostrar"
        }
      </h3>

      <p class="facturas-empty-text">
        ${
          hasError
            ? "Puedes reintentar la carga desde el botón de actualizar."
            : filtering
              ? searchQuery
                ? `No se encontraron facturas para “${escapeHtml(searchQuery)}”. Prueba con otro cliente, email, número de factura o incidencia.`
                : "Cambia el filtro activo para volver al historial completo."
              : "Cuando haya documentos registrados aparecerán aquí con su PDF, estado de pago, incidencia relacionada y acciones disponibles."
        }
      </p>

      ${
        filtering
          ? `
            <button
              type="button"
              class="facturas-btn"
              data-facturas-action="${FACTURAS_ACTIONS.CLEAR_FILTERS}"
              data-action="${FACTURAS_ACTIONS.CLEAR_FILTERS}"
            >
              ${icon("close")}
              <span class="facturas-btn-text">Limpiar filtros</span>
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderInfiniteScrollFooter(listState = {}, state = {}) {
  const runtime = safeObject(state);
  const loading = Boolean(runtime.loading);
  const refreshing = Boolean(runtime.refreshing);
  const loadingMore = Boolean(first(listState.loadingMore, runtime.loadingMore, runtime.loadingNextPage));
  const hasMore = Boolean(listState.hasMore);
  const hasRows = number(listState.visibleCount, 0) > 0;
  const blocked = loading || refreshing || loadingMore;

  const statusText = hasMore
    ? "Sigue bajando para cargar más facturas."
    : hasRows
      ? "No hay más facturas."
      : "";

  const statusHtml = loadingMore
    ? renderSpinner("Cargando más facturas...")
    : statusText
      ? escapeHtml(statusText)
      : "";

  return `
    <div
      class="facturas-infinite"
      data-facturas-infinite="true"
      data-loaded="${attr(String(listState.loadedCount || 0))}"
      data-visible="${attr(String(listState.visibleCount || 0))}"
      data-total="${attr(String(listState.remoteTotal || listState.totalCount || 0))}"
      data-has-more="${hasMore ? "true" : "false"}"
      aria-live="polite"
    >
      <div
        class="facturas-infinite-sentinel"
        data-facturas-infinite-sentinel="true"
        data-facturas-action="${FACTURAS_ACTIONS.LOAD_MORE}"
        data-action="${FACTURAS_ACTIONS.LOAD_MORE}"
        data-next-page="${attr(String(listState.nextPage || 1))}"
        data-disabled="${blocked || !hasMore ? "true" : "false"}"
        aria-hidden="true"
      ></div>

      ${
        statusHtml
          ? `
            <div class="facturas-infinite-status${loadingMore ? " is-loading" : ""}${!hasMore && hasRows ? " is-complete" : ""}">
              ${statusHtml}
            </div>
          `
          : ""
      }
    </div>
  `;
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

  const updatedAt = first(
    data.lastUpdatedAt,
    runtime.lastSyncAt,
    data.updatedAt,
    runtime.updatedAt,
    ...rows.map((item) => getUpdatedAt(item))
  );

  const remoteCount = getRemoteTotal(data, stats.total);
  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const loading = Boolean(first(runtime.loading, data.loading));
  const creating = Boolean(first(runtime.creating, runtime.creatingFactura, data.creating));

  return `
    <section class="facturas-hero">
      <div class="facturas-hero-top">
        <div class="facturas-hero-copy">
          <h1 class="facturas-page-title">Centro de control de facturas</h1>
          <p class="facturas-page-subtitle">
            Gestiona emisión, seguimiento, consulta, descarga y envío de documentos fiscales y conectada con sus incidencias.
          </p>
        </div>

        <div class="facturas-hero-actions">
          <button
            type="button"
            id="facturas-export-btn"
            class="facturas-btn"
            data-action="${FACTURAS_ACTIONS.EXPORT}"
            data-facturas-action="${FACTURAS_ACTIONS.EXPORT}"
            ${disabledAttrs(loading || refreshing || !rows.length)}
          >
            ${icon("export")}
            <span class="facturas-btn-text">Exportar CSV</span>
          </button>

          ${
            canCreateFactura
              ? `
                <button
                  type="button"
                  id="facturas-create-btn"
                  class="facturas-btn facturas-btn--create${creating ? " is-loading" : ""}"
                  data-action="${FACTURAS_ACTIONS.CREATE_OPEN}"
                  data-facturas-action="${FACTURAS_ACTIONS.CREATE_OPEN}"
                  aria-label="Crear nueva factura"
                  ${disabledAttrs(creating, creating)}
                >
                  ${
                    creating
                      ? renderSpinner("Abriendo...")
                      : `${icon("plus")}<span class="facturas-btn-text">Crear factura</span>`
                  }
                </button>
              `
              : ""
          }

          <button
            type="button"
            id="facturas-refresh-btn"
            class="facturas-btn facturas-btn--primary${refreshing ? " is-loading" : ""}"
            data-action="${FACTURAS_ACTIONS.REFRESH}"
            data-facturas-action="${FACTURAS_ACTIONS.REFRESH}"
            ${disabledAttrs(refreshing || loading, refreshing)}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : `${icon("refresh")}<span class="facturas-btn-text">Actualizar</span>`
            }
          </button>
        </div>
      </div>

      <div class="facturas-hero-meta">
        <span class="facturas-meta-pill">
          ${icon("detail")}
          ${escapeHtml(`${remoteCount} registros remotos`)}
        </span>

        <span class="facturas-meta-pill">
          ${icon("refresh")}
          ${updatedAt ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`) : "Sin actualizaciones recientes"}
        </span>

        <span class="facturas-meta-pill">
          ${icon("pdf")}
          ${escapeHtml(`${stats.pdfCount} con PDF`)}
        </span>

        <span class="facturas-meta-pill">
          ${icon("mail")}
          ${escapeHtml(`${stats.sentCount} enviadas`)}
        </span>
      </div>

      <div class="facturas-stats">
        <article class="facturas-stat-card facturas-stat-card--accent">
          <div class="facturas-stat-label">Facturas visibles</div>
          <div class="facturas-stat-value">${escapeHtml(String(stats.total))}</div>
          <div class="facturas-stat-text">Documentos actualmente cargados en pantalla.</div>
        </article>

        <article class="facturas-stat-card facturas-stat-card--success">
          <div class="facturas-stat-label">Importe agregado</div>
          <div class="facturas-stat-value">${escapeHtml(formatMoney(stats.totalImporte, DEFAULT_CURRENCY))}</div>
          <div class="facturas-stat-text">Suma de la colección actualmente visible.</div>
        </article>

        <article class="facturas-stat-card facturas-stat-card--warning">
          <div class="facturas-stat-label">Pendientes</div>
          <div class="facturas-stat-value">${escapeHtml(String(stats.pendingCount))}</div>
          <div class="facturas-stat-text">Facturas con cobro pendiente, parcial o en borrador.</div>
        </article>

        <article class="facturas-stat-card facturas-stat-card--danger">
          <div class="facturas-stat-label">Vencidas / pagadas</div>
          <div class="facturas-stat-value">${escapeHtml(`${stats.overdueCount} / ${stats.paidCount}`)}</div>
          <div class="facturas-stat-text">Balance rápido entre deuda vencida y cobros cerrados.</div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   LOADING / ERROR
========================================================= */

export function renderFacturasLoadingState(input = {}) {
  return `
    <section
      class="facturas-view-root facturas-view-root--loading"
      data-facturas-scope="true"
      data-template-version="${attr(FACTURAS_TEMPLATE_VERSION)}"
      aria-busy="true"
    >
      ${renderHeader({ ...safeObject(input), loading: true })}
      <section class="facturas-history">
        ${renderTableLoading(DEFAULT_SKELETON_ROWS)}
      </section>
    </section>
  `;
}

export function renderFacturasErrorState(message = "No se pudieron cargar las facturas.") {
  return `
    <section
      class="facturas-view-root facturas-view-root--error"
      data-facturas-scope="true"
      data-template-version="${attr(FACTURAS_TEMPLATE_VERSION)}"
    >
      <section class="facturas-error">
        <h3 class="facturas-error-title">No se pudo renderizar la vista de facturas</h3>
        <p class="facturas-error-text">${escapeHtml(cleanText(message, "Error desconocido al cargar la vista."))}</p>

        <button
          type="button"
          class="facturas-btn facturas-btn--primary"
          data-facturas-action="${FACTURAS_ACTIONS.REFRESH}"
          data-action="${FACTURAS_ACTIONS.REFRESH}"
        >
          ${icon("refresh")}
          <span class="facturas-btn-text">Reintentar</span>
        </button>
      </section>
    </section>
  `;
}

export const renderLoadingState = renderFacturasLoadingState;
export const renderErrorState = renderFacturasErrorState;

/* =========================================================
   MAIN TABLE
========================================================= */

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
  const sortDirection = getSortDirection(listState.sortMode);
  const sortLabel = sortDirection === "asc" ? "fecha ascendente" : "fecha descendente";

  const activeCriteria = [
    listState.activeFilter !== "all" ? activeFilterLabel : "",
    searchQuery ? `búsqueda “${searchQuery}”` : "",
    sortLabel ? `orden ${sortLabel}` : "",
  ].filter(Boolean);

  const visibleLabel = `${listState.visibleCount} ${listState.visibleCount === 1 ? "factura" : "facturas"}`;
  const loadedLabel = `${listState.loadedCount} ${listState.loadedCount === 1 ? "cargada" : "cargadas"}`;
  const remoteLabel = `${listState.remoteTotal} ${listState.remoteTotal === 1 ? "registro" : "registros"}`;

  const subtitle = showInitialLoading
    ? "Cargando facturas..."
    : listState.filtering
      ? `Mostrando ${visibleLabel} de ${loadedLabel}${activeCriteria.length ? ` · ${activeCriteria.join(" · ")}` : ""}`
      : `Mostrando ${visibleLabel} de ${remoteLabel} · ${listState.hasMore ? "scroll infinito activo" : "historial completo"} · orden ${sortLabel}`;

  return `
    <section class="facturas-history">
      <div class="facturas-history-head">
        <div class="facturas-history-copy">
          <h2 class="facturas-history-title">Historial de facturas</h2>
          <p class="facturas-history-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        ${renderFilters(data, listState)}
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(DEFAULT_SKELETON_ROWS)
          : `
            <div class="facturas-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                listState.visibleItems.length
                  ? `
                    <div class="facturas-table-shell">
                      <table class="facturas-table" role="table" aria-label="Listado de facturas">
                        <colgroup>
                          <col class="facturas-table-col--main">
                          <col class="facturas-table-col--status">
                          <col class="facturas-table-col--date">
                          <col class="facturas-table-col--amount">
                          <col class="facturas-table-col--incidencia">
                          <col class="facturas-table-col--actions">
                        </colgroup>

                        <thead>
                          <tr>
                            <th scope="col">Factura / cliente</th>
                            <th scope="col">Pago</th>
                            <th scope="col">Fecha de emisión</th>
                            <th scope="col">Total</th>
                            <th scope="col">Incidencia</th>
                            <th scope="col">Acciones</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${listState.visibleItems.map((item) => renderRow(item, runtime)).join("")}
                        </tbody>
                      </table>
                    </div>

                    ${renderInfiniteScrollFooter(listState, runtime)}
                  `
                  : renderEmptyState({
                      hasError,
                      filtering: listState.filtering,
                      searchQuery,
                    })
              }
            </div>
          `
      }
    </section>
  `;
}

export const renderTable = renderCards;

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderFacturasTemplate(input = {}) {
  const data = safeObject(input);
  const items = getInputItems(data);
  const runtime = getRuntimeState(data);

  if (runtime.error && !items.length) {
    return renderFacturasErrorState(runtime.error);
  }

  const payload = {
    ...data,
    items,
    state: runtime,
  };

  return `
    <section
      class="facturas-view-root"
      data-facturas-scope="true"
      data-template-version="${attr(FACTURAS_TEMPLATE_VERSION)}"
      data-total="${attr(String(first(data.total, data.remoteCount, items.length)))}"
      data-count="${attr(String(items.length))}"
      aria-busy="${payload.loading || runtime.loading || runtime.refreshing || runtime.loadingMore ? "true" : "false"}"
    >
      ${
        cleanText(first(data.error, runtime.error), "")
          ? `
            <div class="facturas-alert facturas-alert--error" role="alert">
              ${icon("lock")}
              <span>${escapeHtml(cleanText(first(data.error, runtime.error), ""))}</span>
            </div>
          `
          : ""
      }

      ${renderHeader(payload)}
      ${renderCards(payload)}

      ${renderFacturasCreateModal(data.createModal || {})}
      ${renderFacturasDetailModal(data.detailModal || {})}
    </section>
  `;
}

/* =========================================================
   OPTIONAL DOM HARDENING
========================================================= */

export function bindFacturasTemplateDom(root = null) {
  const scope =
    root ||
    (typeof document !== "undefined"
      ? document.querySelector(".facturas-view-root, [data-facturas-scope]")
      : null);

  if (!scope || typeof scope.querySelectorAll !== "function") return false;

  const images = scope.querySelectorAll("[data-facturas-avatar-img='true']");

  images.forEach((img) => {
    if (!img || img.dataset.facturasAvatarBound === "true") return;

    img.dataset.facturasAvatarBound = "true";
    const avatar = img.closest("[data-facturas-avatar='true']");

    const setFallback = () => {
      if (avatar) {
        avatar.setAttribute("data-fallback", "true");
        avatar.classList.add("facturas-avatar--fallback");
        avatar.classList.remove("has-image");
      }

      try {
        img.hidden = true;
      } catch {
        // noop
      }
    };

    img.addEventListener("error", setFallback, { passive: true });

    if (img.complete && img.naturalWidth === 0) {
      setFallback();
    }
  });

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

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

      optionalAvatarFallbackBinding: true,
    },
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export const renderFacturasViewTemplate = renderFacturasTemplate;

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
