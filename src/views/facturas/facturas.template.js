/* =========================================================
   Onion Support - Facturas Template
   Archivo: /src/views/facturas/facturas.template.js

   Responsabilidad:
   - Render HTML puro de la vista Facturas.
   - Header, stats, filtros, búsqueda, orden y tabla.
   - Integrar modal de creación y modal de detalle.
   - Exponer data-action/data-facturas-action para index.js.
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

export const FACTURAS_TEMPLATE_VERSION = "facturas.template.v1";

export const FACTURAS_ACTIONS = Object.freeze({
  REFRESH: "refresh",
  EXPORT: "export",

  CREATE_OPEN: "create-factura",

  FILTER: "filter",
  CLEAR_FILTERS: "clear-filters",
  CLEAR_SEARCH: "clear-search",
  SEARCH: "search",
  SORT: "sort",

  PREV_PAGE: "prev-page",
  NEXT_PAGE: "next-page",

  OPEN_FACTURA: "open-factura",
  VIEW_PDF: "view-factura-pdf",
  DOWNLOAD_PDF: "download-factura",
  SEND_FACTURA: "send-factura",

  OPEN_INCIDENCIA: "open-incidencia",
});

const DEFAULT_PAGE_SIZE = 5;
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

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

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
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");

      clean =
        lastComma > lastDot
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

  const key = normalizeText(value);

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

/* =========================================================
   INPUT
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

  const role = normalizeKey(
    first(
      data.role,
      data.rol,
      runtime.role,
      runtime.rol,
      data.user?.role,
      data.user?.rol,
      runtime.user?.role,
      runtime.user?.rol,
      ""
    )
  );

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

function isDateOnlyValue(value = null) {
  const raw = cleanText(value, "");

  return /^\d{4}-\d{2}-\d{2}$/.test(raw) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw);
}

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = cleanText(value, "");

  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const esMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (esMatch) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esMatch;

    const date = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss)
    );

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

function formatDateTooltip(value = null) {
  return isDateOnlyValue(value) ? formatDateShort(value) : formatDateTime(value);
}

function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffMs = timestamp - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";
  if (absMin < 60) return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;
  }

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

function getFacturaId(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.id,
      item.facturaId,
      item.invoiceId,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      item.numero,
      raw.id,
      raw.facturaId,
      raw.invoiceId,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.numero
    ),
    "FAC-SIN-ID"
  );
}

function getFacturaNumero(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.numeroFacturaLegal,
      item.numeroFactura,
      item.number,
      item.invoiceNumber,
      item.numero,
      item.code,
      item.facturaId,
      item.invoiceId,
      item.id,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.number,
      raw.invoiceNumber,
      raw.numero,
      raw.code,
      raw.facturaId,
      raw.invoiceId,
      raw.id
    ),
    "Factura sin número"
  );
}

function getFacturaSistema(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.numeroFacturaSistema,
      item.systemInvoiceNumber,
      raw.numeroFacturaSistema,
      raw.systemInvoiceNumber,
      ""
    ),
    ""
  );
}

function getCompanyName(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.clienteEmpresa,
      item.empresa,
      item.company,
      item.companyName,
      item.razonSocial,
      item.cliente?.razonSocial,
      item.cliente?.companyName,
      item.cliente?.empresa,
      item.client?.razonSocial,
      item.client?.companyName,
      item.customer?.razonSocial,
      item.customer?.companyName,
      item.clienteSnapshot?.razonSocial,
      raw.clienteEmpresa,
      raw.empresa,
      raw.company,
      raw.companyName,
      raw.razonSocial,
      raw.cliente?.razonSocial,
      raw.cliente?.companyName,
      raw.cliente?.empresa,
      raw.client?.razonSocial,
      raw.client?.companyName,
      raw.customer?.razonSocial,
      raw.customer?.companyName,
      raw.clienteSnapshot?.razonSocial
    ),
    ""
  );
}

function getContactName(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.clienteNombre,
      item.nombreContacto,
      item.contactName,
      item.cliente?.nombreContacto,
      item.cliente?.nombre,
      item.cliente?.name,
      item.cliente?.displayName,
      item.clienteSnapshot?.nombreContacto,
      item.clientName,
      item.client?.name,
      item.customer?.name,
      item.name,
      item.nombre,
      raw.clienteNombre,
      raw.nombreContacto,
      raw.contactName,
      raw.cliente?.nombreContacto,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.cliente?.displayName,
      raw.clienteSnapshot?.nombreContacto,
      raw.clientName,
      raw.client?.name,
      raw.customer?.name,
      raw.name,
      raw.nombre
    ),
    ""
  );
}

function getClientName(item = {}) {
  return cleanText(first(getCompanyName(item), getContactName(item)), "Cliente");
}

function getClientSecondaryName(item = {}) {
  const company = getCompanyName(item);
  const contact = getContactName(item);

  if (company && contact && normalizeText(company) !== normalizeText(contact)) {
    return contact;
  }

  return "";
}

function getClientEmail(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.clienteEmail,
      item.emailCliente,
      item.cliente?.email,
      item.cliente?.emailLower,
      item.clienteSnapshot?.email,
      item.email,
      item.clientEmail,
      item.client?.email,
      item.customer?.email,
      raw.clienteEmail,
      raw.emailCliente,
      raw.cliente?.email,
      raw.cliente?.emailLower,
      raw.clienteSnapshot?.email,
      raw.email,
      raw.clientEmail,
      raw.client?.email,
      raw.customer?.email
    ),
    ""
  ).toLowerCase();
}

function getClientEmailLabel(item = {}) {
  return getClientEmail(item) || "Sin email";
}

function getClientAvatar(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.clienteAvatar,
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.logo,
      item.logoUrl,
      item.photo,
      item.photoUrl,
      item.picture,
      item.pictureUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.cliente?.logo,
      item.cliente?.logoUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      item.customer?.avatar,
      item.customer?.avatarUrl,
      raw.clienteAvatar,
      raw.clientAvatar,
      raw.avatar,
      raw.avatarUrl,
      raw.logo,
      raw.logoUrl,
      raw.photo,
      raw.photoUrl,
      raw.picture,
      raw.pictureUrl,
      raw.cliente?.avatar,
      raw.cliente?.avatarUrl,
      raw.cliente?.logo,
      raw.cliente?.logoUrl,
      raw.client?.avatar,
      raw.client?.avatarUrl,
      raw.customer?.avatar,
      raw.customer?.avatarUrl
    ),
    ""
  );
}

function getClientStableKey(item = {}) {
  const raw = getRaw(item);

  return normalizeKey(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.userId,
      item.uid,
      item.clienteEmail,
      item.emailCliente,
      item.clientEmail,
      item.email,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.userId,
      raw.uid,
      raw.clienteEmail,
      raw.emailCliente,
      raw.clientEmail,
      raw.email,
      getClientName(item)
    )
  );
}

function getInitials(value = "") {
  const text = cleanText(value, "");

  if (!text) return "ON";

  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

function getAvatarToneClass(item = {}) {
  return `facturas-avatar--tone-${hashString(getClientStableKey(item)) % 10}`;
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

function getEstadoPagoChipClass(value = "") {
  return `facturas-chip--${getEstadoPagoKey(value) || "pending"}`;
}

function getPaymentRaw(item = {}) {
  const raw = getRaw(item);

  return first(
    item.estadoPago,
    item.paymentStatus,
    item.payment?.status,
    item.billing?.paymentStatus,
    raw.estadoPago,
    raw.paymentStatus,
    raw.payment?.status,
    raw.billing?.paymentStatus
  );
}

function pickTicketIdFromArray(value = []) {
  for (const item of safeArray(value)) {
    if (typeof item === "string" && item.trim()) return item.trim();

    if (!isObject(item)) continue;

    const candidate = first(
      item.ticketId,
      item.incidenciaId,
      item.id,
      item.code,
      item.numero,
      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId
    );

    if (candidate) return cleanText(candidate, "");
  }

  return "";
}

function getIncidenciaId(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.incidencia?.id,
      item.incidencia?.ticketId,
      item.incidencia?.incidenciaId,
      item.ticket?.id,
      item.ticket?.ticketId,
      item.ticket?.incidenciaId,
      item.linkedTicket?.id,
      item.linkedTicket?.ticketId,
      item.linkedTicket?.incidenciaId,
      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId,
      item.meta?.ticketId,
      item.meta?.linkedTicketId,
      item.meta?.incidenciaId,
      pickTicketIdFromArray(item.ticketIds),
      pickTicketIdFromArray(item.incidenciaIds),
      pickTicketIdFromArray(item.relatedTicketIds),
      pickTicketIdFromArray(item.relatedIncidentIds),
      pickTicketIdFromArray(item.linkedTickets),
      pickTicketIdFromArray(item.incidencias),
      pickTicketIdFromArray(item.tickets),
      pickTicketIdFromArray(item.relatedTickets),

      raw.ticketId,
      raw.incidenciaId,
      raw.incidencia?.id,
      raw.incidencia?.ticketId,
      raw.incidencia?.incidenciaId,
      raw.ticket?.id,
      raw.ticket?.ticketId,
      raw.ticket?.incidenciaId,
      raw.linkedTicket?.id,
      raw.linkedTicket?.ticketId,
      raw.linkedTicket?.incidenciaId,
      raw.relatedTicketId,
      raw.relatedIncidentId,
      raw.supportTicketId,
      raw.caseId,
      raw.meta?.ticketId,
      raw.meta?.linkedTicketId,
      raw.meta?.incidenciaId,
      pickTicketIdFromArray(raw.ticketIds),
      pickTicketIdFromArray(raw.incidenciaIds),
      pickTicketIdFromArray(raw.relatedTicketIds),
      pickTicketIdFromArray(raw.relatedIncidentIds),
      pickTicketIdFromArray(raw.linkedTickets),
      pickTicketIdFromArray(raw.incidencias),
      pickTicketIdFromArray(raw.tickets),
      pickTicketIdFromArray(raw.relatedTickets)
    ),
    ""
  );
}

function getIncidenciaSubject(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.incidencia?.subject,
      item.incidencia?.asunto,
      item.incidencia?.title,
      item.ticket?.subject,
      item.ticket?.asunto,
      item.ticket?.title,
      item.linkedTicket?.subject,
      item.linkedTicket?.asunto,
      item.linkedTicket?.title,

      raw.incidencia?.subject,
      raw.incidencia?.asunto,
      raw.incidencia?.title,
      raw.ticket?.subject,
      raw.ticket?.asunto,
      raw.ticket?.title,
      raw.linkedTicket?.subject,
      raw.linkedTicket?.asunto,
      raw.linkedTicket?.title,
      ""
    ),
    ""
  );
}

function getTotalRaw(item = {}) {
  const raw = getRaw(item);

  return first(
    item.total,
    item.amount,
    item.importe,
    item.importeTotal,
    item.totalFactura,
    item.facturaTotal,
    item.invoiceAmount,
    item.totales?.total,
    raw.total,
    raw.amount,
    raw.importe,
    raw.importeTotal,
    raw.totalFactura,
    raw.facturaTotal,
    raw.invoiceAmount,
    raw.totales?.total,
    0
  );
}

function getCurrency(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.moneda,
      item.currency,
      item.facturaCurrency,
      item.totales?.currency,
      item.payment?.currency,
      item.meta?.currency,
      raw.moneda,
      raw.currency,
      raw.facturaCurrency,
      raw.totales?.currency,
      raw.payment?.currency,
      raw.meta?.currency,
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  );
}

function getTotalLabel(item = {}) {
  return formatMoney(getTotalRaw(item), getCurrency(item));
}

function getTotalCaption(item = {}) {
  const raw = getRaw(item);

  const taxIncluded = first(
    item.taxIncluded,
    item.impuestosIncluidos,
    item.ivaIncluido,
    raw.taxIncluded,
    raw.impuestosIncluidos,
    raw.ivaIncluido
  );

  return taxIncluded === false ? "Impuestos no incl." : "Impuestos incl.";
}

function getFormaPago(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.formaPago,
      item.metodoPago,
      item.paymentMethod,
      item.payment?.methodLabel,
      item.payment?.method,
      raw.formaPago,
      raw.metodoPago,
      raw.paymentMethod,
      raw.payment?.methodLabel,
      raw.payment?.method
    ),
    "—"
  );
}

function getCreatedAt(item = {}) {
  const raw = getRaw(item);

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

    raw.fechaFactura,
    raw.fechaFacturaISO,
    raw.lifecycle?.issuedAt,
    raw.issueDate,
    raw.issuedAt,
    raw.fecha,
    raw.createdAt,
    raw.lifecycle?.createdAt,
    raw.fechaCreacion
  );
}

function getUpdatedAt(item = {}) {
  const raw = getRaw(item);

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

    raw.updatedAt,
    raw.lifecycle?.updatedAt,
    raw.lastActivityAt,
    raw.lifecycle?.lastActivityAt,
    raw.fechaEnvio,
    raw.delivery?.lastSentAt,
    raw.sentAt,
    raw.mailSentAt,
    raw.fechaActualizacion,
    raw.lastUpdateAt
  );
}

function getSentAt(item = {}) {
  const raw = getRaw(item);

  return first(
    item.fechaEnvio,
    item.sentAt,
    item.mailSentAt,
    item.email?.sentAt,
    item.delivery?.lastSentAt,
    item.lifecycle?.sentAt,
    item.meta?.lastSentAt,

    raw.fechaEnvio,
    raw.sentAt,
    raw.mailSentAt,
    raw.email?.sentAt,
    raw.delivery?.lastSentAt,
    raw.lifecycle?.sentAt,
    raw.meta?.lastSentAt
  );
}

function getSortTimestamp(item = {}) {
  const raw = getRaw(item);

  return (
    number(item?.meta?.updatedAtMs, 0) ||
    number(item?.meta?.timestampMs, 0) ||
    number(raw?.meta?.updatedAtMs, 0) ||
    number(raw?.meta?.timestampMs, 0) ||
    toTimestamp(getUpdatedAt(item)) ||
    toTimestamp(getCreatedAt(item)) ||
    toTimestamp(raw?._ts) ||
    0
  );
}

function getEmissionTimestamp(item = {}) {
  return toTimestamp(getCreatedAt(item)) || getSortTimestamp(item);
}

function compareFacturaNumeroAsc(a = {}, b = {}) {
  return cleanText(getFacturaNumero(a), "").localeCompare(
    cleanText(getFacturaNumero(b), ""),
    "es",
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

function compareFacturaNumeroDesc(a = {}, b = {}) {
  return cleanText(getFacturaNumero(b), "").localeCompare(
    cleanText(getFacturaNumero(a), ""),
    "es",
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

function compareFacturasDateDesc(a = {}, b = {}) {
  const diff = getEmissionTimestamp(b) - getEmissionTimestamp(a);
  return diff || compareFacturaNumeroDesc(a, b);
}

function compareFacturasDateAsc(a = {}, b = {}) {
  const diff = getEmissionTimestamp(a) - getEmissionTimestamp(b);
  return diff || compareFacturaNumeroAsc(a, b);
}

function sortFacturasNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareFacturasDateDesc);
}

function sortFacturasOldestFirst(items = []) {
  return [...safeArray(items)].sort(compareFacturasDateAsc);
}

function hasPdf(item = {}) {
  const raw = getRaw(item);

  if (
    bool(
      first(
        item.pdfAvailable,
        item.hasPdf,
        item.document?.available,
        item.meta?.hasPdf,
        raw.pdfAvailable,
        raw.hasPdf,
        raw.document?.available,
        raw.meta?.hasPdf
      ),
      false
    )
  ) {
    return true;
  }

  return Boolean(
    first(
      item.blobPath,
      item.blobName,
      item.pdfPath,
      item.pdfUrl,
      item.downloadUrl,
      item.viewUrl,
      item.pdf,
      item.document?.blobPath,
      item.document?.fileName,
      raw.blobPath,
      raw.blobName,
      raw.pdfPath,
      raw.pdfUrl,
      raw.downloadUrl,
      raw.viewUrl,
      raw.pdf,
      raw.document?.blobPath,
      raw.document?.fileName
    )
  );
}

function isValidEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isFacturaSent(item = {}) {
  const raw = getRaw(item);

  const sentDate = first(
    item.fechaEnvio,
    item.sentAt,
    item.mailSentAt,
    item.email?.sentAt,
    item.delivery?.lastSentAt,
    item.lifecycle?.sentAt,
    item.meta?.lastSentAt,
    raw.fechaEnvio,
    raw.sentAt,
    raw.mailSentAt,
    raw.email?.sentAt,
    raw.delivery?.lastSentAt,
    raw.lifecycle?.sentAt,
    raw.meta?.lastSentAt
  );

  if (sentDate) return true;

  return bool(
    first(
      item.email?.sent,
      item.delivery?.sent,
      item.lifecycle?.sent,
      item.meta?.isSent,
      item.meta?.hasEmailSent,
      raw.email?.sent,
      raw.delivery?.sent,
      raw.lifecycle?.sent,
      raw.meta?.isSent,
      raw.meta?.hasEmailSent
    ),
    false
  );
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

  if (["pending", "pendiente", "pendientes", "partial", "parcial", "draft", "borrador", "unpaid", "sin_pagar"].includes(key)) {
    return "pending";
  }

  if (["paid", "pagada", "pagado", "pagadas", "cobrada", "cobrado"].includes(key)) {
    return "paid";
  }

  if (["overdue", "vencida", "vencido", "vencidas"].includes(key)) {
    return "overdue";
  }

  return "all";
}

function getActiveFilter(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);

  return normalizeFilter(
    first(
      data.filter,
      data.paymentFilter,
      data.statusFilter,
      data.activeFilter,
      data.facturasFilter,
      runtime.filter,
      runtime.paymentFilter,
      runtime.statusFilter,
      runtime.activeFilter,
      runtime.facturasFilter,
      "all"
    )
  );
}

function getFilterLabel(filter = "all") {
  return FILTERS.find((item) => item.key === normalizeFilter(filter))?.label || "Todas";
}

function getSearchQuery(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);

  return cleanText(
    first(
      data.search,
      data.searchQuery,
      data.query,
      data.q,
      data.term,
      data.keyword,
      data.facturasSearch,
      runtime.search,
      runtime.searchQuery,
      runtime.query,
      runtime.q,
      runtime.term,
      runtime.keyword,
      runtime.facturasSearch,
      ""
    ),
    ""
  );
}

function normalizeSort(value = "") {
  const key = normalizeKey(value);

  if (
    [
      "date_asc",
      "fecha_asc",
      "emission_asc",
      "issue_date_asc",
      "fecha_emision_asc",
      "oldest",
      "oldest_first",
      "menor_fecha",
      "invoice_asc",
      "factura_asc",
      "numero_asc",
      "n_factura_asc",
      "num_factura_asc",
      "number_asc",
      "invoice_number_asc",
      "menor_factura",
    ].includes(key)
  ) {
    return "date_asc";
  }

  return "date_desc";
}

function getSortMode(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);

  return normalizeSort(
    first(
      data.sort,
      data.sortBy,
      data.orderBy,
      data.sortMode,
      data.facturasSort,
      runtime.sort,
      runtime.sortBy,
      runtime.orderBy,
      runtime.sortMode,
      runtime.facturasSort,
      "date_desc"
    )
  );
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
  const active = option.modes.includes(mode);

  if (!active) return option.desc;

  return mode.endsWith("_desc") ? option.asc : option.desc;
}

function getSortButtonLabel(option = SORT_OPTIONS[0], currentSortMode = "date_desc") {
  const mode = normalizeSort(currentSortMode);
  const active = option.modes.includes(mode);

  if (!active) return `${option.label} ↓`;

  return `${option.label} ${mode.endsWith("_asc") ? "↑" : "↓"}`;
}

function getSortButtonTooltip(option = SORT_OPTIONS[0], currentSortMode = "date_desc") {
  const nextMode = getNextSortMode(option, currentSortMode);
  return nextMode.endsWith("_asc") ? option.tooltipAsc : option.tooltipDesc;
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
  const raw = getRaw(item);

  return [
    getFacturaId(item),
    getFacturaNumero(item),
    getFacturaSistema(item),
    getCompanyName(item),
    getContactName(item),
    getClientName(item),
    getClientSecondaryName(item),
    getClientEmail(item),
    getClientEmailLabel(item),
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
    item.blobPath,
    item.blobName,
    item.pdfPath,

    raw.clienteId,
    raw.clientId,
    raw.customerId,
    raw.userId,
    raw.uid,
    raw.blobPath,
    raw.blobName,
    raw.pdfPath,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" · ");
}

function itemMatchesSearch(item = {}, query = "") {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) return true;

  const terms = normalizedQuery.split(" ").filter(Boolean);
  const haystack = getSearchHaystack(item);

  return terms.every((term) => haystack.includes(term));
}

function filterFacturas(items = [], input = {}) {
  const filter = getActiveFilter(input);
  const search = getSearchQuery(input);

  return safeArray(items)
    .filter((item) => itemMatchesFilter(item, filter))
    .filter((item) => itemMatchesSearch(item, search));
}

function sortFacturas(items = [], input = {}) {
  return getSortMode(input) === "date_asc"
    ? sortFacturasOldestFirst(items)
    : sortFacturasNewestFirst(items);
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
    acc[filter.key] = searchableRows.filter((item) =>
      itemMatchesFilter(item, filter.key)
    ).length;

    return acc;
  }, {});
}

/* =========================================================
   STATS / PAGINATION
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

function normalizePageSize(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);

  return clamp(
    number(
      first(
        data.pageSize,
        runtime.pageSize,
        runtime.limit,
        runtime.facturasPageSize,
        DEFAULT_PAGE_SIZE
      ),
      DEFAULT_PAGE_SIZE
    ),
    1,
    50
  );
}

function getPagination(items = [], input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);

  const rawItems = safeArray(items);
  const filteredAndSortedItems = filterAndSortFacturas(rawItems, data);
  const pageSize = normalizePageSize(data);
  const filtering = isFilterActive(data);

  const remoteTotal = Math.max(
    number(
      first(
        data.totalCount,
        data.remoteCount,
        data.totalMatched,
        data.total,
        runtime.totalCount,
        runtime.remoteCount,
        runtime.totalMatched,
        runtime.total,
        rawItems.length
      ),
      rawItems.length
    ),
    rawItems.length
  );

  const reportedTotal = filtering ? filteredAndSortedItems.length : remoteTotal;

  const totalPagesFromProps = filtering
    ? 0
    : number(first(data.totalPages, runtime.totalPages), 0);

  const totalPages = Math.max(
    1,
    totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = clamp(
    number(
      first(data.page, runtime.page, runtime.currentPage, runtime.facturasPage, 1),
      1
    ),
    1,
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = filteredAndSortedItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = reportedTotal
    ? Math.min(startIndex + pageItems.length, reportedTotal)
    : 0;

  const sortMode = getSortMode(data);

  return {
    allItems: filteredAndSortedItems,
    pageItems,
    pageSize,
    currentPage,
    totalPages,
    totalCount: reportedTotal,
    unfilteredCount: rawItems.length,
    remoteTotal,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
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
  const klass = getEstadoPagoChipClass(rawStatus);

  return `
    <span class="facturas-chip ${attr(klass)}">
      <span class="facturas-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderDeliveryBadge(item = {}) {
  const sent = isFacturaSent(item);
  const sentAt = getSentAt(item);

  if (sent) {
    const tooltip = sentAt
      ? `Enviada · ${formatDateTooltip(sentAt)}`
      : "Factura enviada";

    return `
      <span
        class="facturas-mini-badge facturas-mini-badge--sent"
        ${tooltipAttrs(tooltip, tooltip)}
      >
        ${icon("check")}
        Enviada
      </span>
    `;
  }

  return `
    <span
      class="facturas-mini-badge facturas-mini-badge--idle"
      ${tooltipAttrs("Factura no enviada todavía", "Factura no enviada todavía")}
    >
      ${icon("mail")}
      No enviada
    </span>
  `;
}

function renderPdfBadge(item = {}) {
  if (hasPdf(item)) {
    return `
      <span
        class="facturas-mini-badge facturas-mini-badge--pdf"
        ${tooltipAttrs("PDF disponible", "PDF disponible")}
      >
        ${icon("pdf")}
        PDF
      </span>
    `;
  }

  return `
    <span
      class="facturas-mini-badge facturas-mini-badge--blocked"
      ${tooltipAttrs("PDF no disponible", "PDF no disponible")}
    >
      ${icon("lock")}
      Sin PDF
    </span>
  `;
}

function renderIncidenciaLink(item = {}) {
  const incidenciaId = getIncidenciaId(item);
  const incidenciaSubject = getIncidenciaSubject(item);
  const facturaId = getFacturaId(item);

  if (!incidenciaId) {
    return `<span class="facturas-incidencia-empty">—</span>`;
  }

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

function renderPagination(pagination = {}, state = {}) {
  const runtime = safeObject(state);
  const loading = Boolean(runtime.loading);
  const refreshing = Boolean(runtime.refreshing);

  const prevDisabled = !pagination.hasPrev || loading || refreshing;
  const nextDisabled = !pagination.hasNext || loading || refreshing;

  return `
    <div class="facturas-pagination" aria-label="Paginación de facturas">
      <button
        type="button"
        class="facturas-pagination-btn"
        ${actionAttrs(FACTURAS_ACTIONS.PREV_PAGE)}
        data-page="${attr(String(Math.max(1, pagination.currentPage - 1)))}"
        ${disabledAttrs(prevDisabled)}
      >
        Anterior
      </button>

      <span class="facturas-pagination-status">
        ${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}
      </span>

      <button
        type="button"
        class="facturas-pagination-btn facturas-pagination-btn--next"
        ${actionAttrs(FACTURAS_ACTIONS.NEXT_PAGE)}
        data-page="${attr(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
        ${disabledAttrs(nextDisabled)}
      >
        Siguiente
      </button>
    </div>
  `;
}

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

function renderFilters(input = {}, pagination = {}) {
  const data = safeObject(input);
  const items = getInputItems(data);
  const counts = computeFilterCounts(items, data);
  const activeFilter = normalizeFilter(pagination.activeFilter || getActiveFilter(data));
  const sortMode = normalizeSort(pagination.sortMode || getSortMode(data));

  return `
    <div class="facturas-filters" aria-label="Filtros, orden y búsqueda de facturas">
      <div
        class="facturas-filter-pills"
        role="group"
        aria-label="Filtrar facturas por estado de pago"
      >
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
              <span>${escapeHtml(label)}</span>
            </button>
          `;
        }).join("")}
      </div>

      ${renderSearch(data)}
    </div>
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

  const classes = [
    "facturas-action-btn",
    klass,
    loading ? "is-loading" : "",
  ]
    .map((item) => cleanText(item, ""))
    .filter(Boolean)
    .join(" ");

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
  const createdAtTooltip = formatDateTooltip(createdAtRaw);
  const total = getTotalLabel(item);
  const totalCaption = getTotalCaption(item);
  const formaPago = getFormaPago(item);
  const pdfAvailable = hasPdf(item);
  const sent = isFacturaSent(item);
  const canSend = canSendFactura(item);

  const sendLabel = sent ? "Reenviar" : "Enviar";
  const sendTooltip = !pdfAvailable
    ? "No se puede enviar: falta PDF"
    : !getClientEmail(item)
      ? "No se puede enviar: falta email válido"
      : sent
        ? "Reenviar factura al cliente"
        : "Enviar factura al cliente";

  const paymentKey = getEstadoPagoKey(getPaymentRaw(item));

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

              ${
                numeroSistema && numeroSistema !== numero
                  ? `<span class="facturas-system-id">${escapeHtml(numeroSistema)}</span>`
                  : ""
              }
            </div>

            <div class="facturas-factura-client">${escapeHtml(clientName)}</div>

            ${
              secondaryName
                ? `<div class="facturas-factura-contact">${escapeHtml(secondaryName)}</div>`
                : ""
            }

            <div class="facturas-factura-email">
              ${escapeHtml(clientEmail)}
            </div>

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
        <span
          class="facturas-date-inline"
          ${tooltipAttrs(createdAtTooltip, `Fecha de emisión ${createdAtTooltip}`)}
        >
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

function renderTableLoading(rows = DEFAULT_PAGE_SIZE) {
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

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const rows = sortFacturasNewestFirst(getInputItems(data));
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

  const remoteCount = Math.max(
    stats.total,
    number(
      first(
        data.remoteCount,
        data.totalCount,
        data.totalMatched,
        data.total,
        runtime.remoteCount,
        runtime.totalCount,
        runtime.totalMatched,
        runtime.total,
        stats.total
      ),
      stats.total
    )
  );

  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const loading = Boolean(first(runtime.loading, data.loading));
  const creating = Boolean(first(runtime.creating, runtime.creatingFactura, data.creating));

  return `
    <section class="facturas-hero">
      <div class="facturas-hero-top">
        <div class="facturas-hero-copy">
          <h1 class="facturas-page-title">Centro de control de facturas</h1>
          <p class="facturas-page-subtitle">
            Gestiona emisión, seguimiento, consulta, descarga y envío de documentos fiscales desde una vista clara, premium y conectada con sus incidencias relacionadas.
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
          ${
            updatedAt
              ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
              : "Sin actualizaciones recientes"
          }
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
        ${renderTableLoading(DEFAULT_PAGE_SIZE)}
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
  const pagination = getPagination(items, data);

  const loading = Boolean(first(runtime.loading, data.loading));
  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const hasError = Boolean(cleanText(first(runtime.error, data.error), ""));

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;

  const activeFilterLabel = getFilterLabel(pagination.activeFilter);
  const searchQuery = pagination.searchQuery;
  const sortDirection = getSortDirection(pagination.sortMode);
  const sortLabel = sortDirection === "asc"
    ? "fecha ascendente"
    : "fecha descendente";

  const activeCriteria = [
    pagination.activeFilter !== "all" ? activeFilterLabel : "",
    searchQuery ? `búsqueda “${searchQuery}”` : "",
    sortLabel ? `orden ${sortLabel}` : "",
  ].filter(Boolean);

  const subtitle = showInitialLoading
    ? "Cargando facturas..."
    : pagination.filtering
      ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · ${activeCriteria.join(" · ")}`
      : `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages} · orden ${sortLabel}`;

  return `
    <section class="facturas-history">
      <div class="facturas-history-head">
        <div class="facturas-history-copy">
          <h2 class="facturas-history-title">Historial de facturas</h2>
          <p class="facturas-history-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        ${renderPagination(pagination, runtime)}
        ${renderFilters(data, pagination)}
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || DEFAULT_PAGE_SIZE))
          : `
            <div class="facturas-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
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
                          ${pagination.pageItems.map((item) => renderRow(item, runtime)).join("")}
                        </tbody>
                      </table>
                    </div>
                  `
                  : renderEmptyState({
                      hasError,
                      filtering: pagination.filtering,
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
      aria-busy="${payload.loading || runtime.loading || runtime.refreshing ? "true" : "false"}"
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

  if (!scope || typeof scope.querySelectorAll !== "function") {
    return false;
  }

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
      paginationMarkup: true,
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
