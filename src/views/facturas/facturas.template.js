/* =========================================================
   Onion SPA - Facturas Template
   Archivo: src/views/facturas/facturas.template.js

   FINAL PRO SAAS PANEL · FACTURAS TEMPLATE · 10/10 EXTREME
   PATCH · TABLE SYSTEM LOCK · TOKEN ALIGNED · NO GLOBAL CSS BLEED
   PATCH · SINGLE STYLE OWNER · DATA-SCOPE READY · ACTION SAFE
   PATCH · TABLE ROW PSEUDO FIX · REAL TABLE LAYOUT PRESERVED
   PATCH · LIGHT/DARK TOKEN PERFECT FIT · ACTIONS COMPACT GRID
   PATCH · FILTER PILLS + SEARCH · FACTURAS CONTROL CENTER 10/10
   PATCH · SORT PILLS INLINE · NO ORDENAR LABEL · FILTER-ALIGNED UI

   RESPONSABILIDADES:
   - render premium de vista de facturas
   - alineación total con variables.css / layout.css / ui.css
   - hero operativo tipo centro de control
   - tabla compacta premium SaaS
   - filtros visuales:
     todas / pendientes / pagadas / vencidas
   - orden visual integrado:
     fecha mayor a menor / nº factura mayor a menor
   - búsqueda por factura, cliente, email, importe, forma de pago e incidencia
   - paginación real de 5 items por defecto sobre resultados filtrados
   - orden descendente por factura más reciente
   - acciones compatibles con data-facturas-action y data-action
   - botón admin "Crear factura"
   - envío de factura conectado a send-factura
   - estado "Enviar / Reenviar" según delivery/meta
   - bloqueo seguro de acciones sin PDF/email
   - loader icon-only estable sin mover layout
   - refresh overlay sin desplazar columnas
   - avatares fallback con color estable por cliente
   - chips de pago con contraste real dark/light
   - incidencia relacionada lista para modal
   - estados loading/error/empty blindados
   - HTML endurecido con escape/fallbacks

   FIX CLAVE:
   - NUNCA usar ::before sobre <tr>.
   - Algunos navegadores interpretan ::before en table-row como celda anónima.
   - Eso desplaza columnas y genera el hueco gigante a la izquierda.
   - La barra de estado ahora vive en .facturas-cell--main::before.
   - Hover y backgrounds se aplican sobre <td>, no sobre <tr>.
   - La tabla conserva display table real.

   PATCH UI ORDEN:
   - Se elimina el texto visible "Ordenar".
   - Los botones de orden se renderizan como pills homogéneas.
   - El bloque de orden queda integrado con los filtros y no como subgrupo roto.
   - Mismo lenguaje visual: altura, borde, radios, estados hover/focus/active.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_PAGE_SIZE = 5;
const DEFAULT_CURRENCY = "EUR";

const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "superadmin",
  "super_admin",
  "root",
  "owner",
]);

const STYLE_ID = "onion-facturas-template-styles-v15";

const FILTERS = Object.freeze([
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendientes" },
  { key: "paid", label: "Pagadas" },
  { key: "overdue", label: "Vencidas" },
]);

const SORT_OPTIONS = Object.freeze([
  {
    key: "date_desc",
    label: "Fecha ↓",
    title: "Ordenar por fecha de mayor a menor",
  },
  {
    key: "invoice_desc",
    label: "Nº factura ↓",
    title: "Ordenar por número de factura de mayor a menor",
  },
]);

/* =========================================================
   BASE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/€/g, "")
      .replace(/\$/g, "")
      .replace(/£/g, "")
      .replace(/%/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      if (lastComma > lastDot) {
        normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
      } else {
        normalized = normalized.replace(/,/g, "");
      }
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const n = Number(normalized);

    return Number.isFinite(n) ? n : fallback;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function normalizeText(value = "") {
  return safeText(value, "")
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

function normalizeRole(value = "") {
  return safeText(value, "").toLowerCase();
}

function isValidEmail(value = "") {
  const email = safeText(value, "").toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const key = normalizeText(value);

  if (["true", "1", "yes", "si", "sí", "on"].includes(key)) return true;
  if (["false", "0", "no", "off"].includes(key)) return false;

  return fallback;
}

function hashString(value = "") {
  const text = safeText(value, "onion");
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

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
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

  if (Number.isNaN(date.getTime())) return 0;

  return date.getTime();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/* =========================================================
   FORMATTERS
========================================================= */

const moneyFormatterCache = new Map();
const dateTimeFormatterCache = new Map();

function getMoneyFormatter(currency = DEFAULT_CURRENCY) {
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  if (moneyFormatterCache.has(code)) {
    return moneyFormatterCache.get(code);
  }

  const formatter = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  moneyFormatterCache.set(code, formatter);

  return formatter;
}

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const amount = safeNumber(value, NaN);

  if (!Number.isFinite(amount)) return "—";

  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  try {
    return getMoneyFormatter(code).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

function getDateTimeFormatter() {
  const key = "es-ES:date-time";

  if (dateTimeFormatterCache.has(key)) {
    return dateTimeFormatterCache.get(key);
  }

  const formatter = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  dateTimeFormatterCache.set(key, formatter);

  return formatter;
}

function getDateFormatter() {
  const key = "es-ES:date";

  if (dateTimeFormatterCache.has(key)) {
    return dateTimeFormatterCache.get(key);
  }

  const formatter = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  dateTimeFormatterCache.set(key, formatter);

  return formatter;
}

function formatDateTime(value = null) {
  const ts = toTimestamp(value);
  if (!ts) return "—";

  try {
    return getDateTimeFormatter().format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatDateShort(value = null) {
  const ts = toTimestamp(value);
  if (!ts) return "—";

  try {
    return getDateFormatter().format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  const ts = toTimestamp(value);
  if (!ts) return "Sin fecha";

  const diffMs = ts - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

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
  const common = `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

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
   AUTH / ROLE
========================================================= */

function hasPermission(state = {}, permission = "") {
  const runtime = safeObject(state);
  const target = safeText(permission, "");

  if (!target) return false;

  const permissions = first(
    runtime.permissions,
    runtime.user?.permissions,
    runtime.currentUser?.permissions,
    runtime.session?.user?.permissions,
    runtime.auth?.user?.permissions
  );

  if (Array.isArray(permissions)) {
    return permissions.includes(target);
  }

  if (typeof permissions === "string") {
    return permissions
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .includes(target);
  }

  return false;
}

function isAdminState(state = {}) {
  const runtime = safeObject(state);

  if (
    runtime.canCreateFactura === true ||
    runtime.view?.canCreateFactura === true ||
    hasPermission(runtime, "facturas:create")
  ) {
    return true;
  }

  const role = normalizeRole(
    first(
      runtime.role,
      runtime.rol,
      runtime.user?.role,
      runtime.user?.rol,
      runtime.currentUser?.role,
      runtime.currentUser?.rol,
      runtime.session?.user?.role,
      runtime.session?.user?.rol,
      runtime.auth?.role,
      runtime.auth?.user?.role,
      runtime.auth?.user?.rol
    )
  );

  return ADMIN_ROLES.has(role);
}

/* =========================================================
   DOMAIN HELPERS
========================================================= */

function pickTicketIdFromArray(value = []) {
  const items = safeArray(value);

  for (const item of items) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }

    if (!item || typeof item !== "object") continue;

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

    if (candidate) return safeText(candidate, "");
  }

  return "";
}

function getFacturaId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.id,
      item._id,
      item.facturaId,
      item.invoiceId,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      item.numero,
      raw.id,
      raw._id,
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
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.numeroFacturaLegal,
      item.numero,
      item.invoiceNumber,
      item.code,
      item.facturaId,
      item.invoiceId,
      item.numeroFacturaSistema,
      item.id,
      raw.numeroFacturaLegal,
      raw.numero,
      raw.invoiceNumber,
      raw.code,
      raw.facturaId,
      raw.invoiceId,
      raw.numeroFacturaSistema,
      raw.id
    ),
    "Factura sin número"
  );
}

function getFacturaSistema(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
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

function getClientName(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clienteNombre,
      item.cliente?.nombreContacto,
      item.cliente?.nombre,
      item.cliente?.name,
      item.cliente?.displayName,
      item.clientName,
      item.client?.name,
      item.customer?.name,
      item.name,
      item.nombre,
      item.clienteEmpresa,
      item.cliente?.empresa,
      item.cliente?.razonSocial,
      item.company,
      raw.clienteNombre,
      raw.cliente?.nombreContacto,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.cliente?.displayName,
      raw.clientName,
      raw.client?.name,
      raw.customer?.name,
      raw.name,
      raw.nombre,
      raw.clienteEmpresa,
      raw.cliente?.empresa,
      raw.cliente?.razonSocial,
      raw.company
    ),
    "Cliente"
  );
}

function getClientEmail(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clienteEmail,
      item.cliente?.email,
      item.cliente?.emailLower,
      item.email,
      item.emailCliente,
      item.clientEmail,
      item.client?.email,
      item.customer?.email,
      raw.clienteEmail,
      raw.emailCliente,
      raw.cliente?.email,
      raw.cliente?.emailLower,
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
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clienteAvatar,
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      raw.clienteAvatar,
      raw.clientAvatar,
      raw.avatar,
      raw.avatarUrl,
      raw.cliente?.avatar,
      raw.cliente?.avatarUrl,
      raw.client?.avatar,
      raw.client?.avatarUrl
    ),
    ""
  );
}

function getClientStableKey(item = {}) {
  const raw = safeObject(item?.raw);

  return normalizeKey(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.userId,
      item.uid,
      item.cliente?.id,
      item.cliente?.userId,
      item.client?.id,
      item.client?.userId,
      item.customer?.id,
      item.customer?.userId,
      item.clienteEmail,
      item.emailCliente,
      item.clientEmail,
      item.email,
      item.cliente?.email,
      item.client?.email,
      item.customer?.email,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.userId,
      raw.uid,
      raw.cliente?.id,
      raw.cliente?.userId,
      raw.client?.id,
      raw.client?.userId,
      raw.customer?.id,
      raw.customer?.userId,
      raw.clienteEmail,
      raw.emailCliente,
      raw.clientEmail,
      raw.email,
      raw.cliente?.email,
      raw.client?.email,
      raw.customer?.email,
      getClientName(item)
    )
  );
}

function getInitials(value = "") {
  const text = normalizeWhitespace(value);

  if (!text) return "ON";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

function getEstadoPagoKey(value = "") {
  const key = normalizeKey(value);

  if (["paid", "pagada", "pagado", "cobrada", "cobrado", "abonada", "abonado"].includes(key)) {
    return "paid";
  }

  if (["pending", "pendiente", "unpaid", "sin_pagar"].includes(key)) {
    return "pending";
  }

  if (["partial", "parcial", "pago_parcial"].includes(key)) {
    return "partial";
  }

  if (["overdue", "vencida", "vencido"].includes(key)) {
    return "overdue";
  }

  if (["cancelled", "canceled", "cancelada", "cancelado", "anulada", "anulado"].includes(key)) {
    return "cancelled";
  }

  if (["draft", "borrador"].includes(key)) {
    return "draft";
  }

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

  return safeText(value, "Pendiente");
}

function getEstadoPagoChipClass(value = "") {
  return `facturas-chip--${getEstadoPagoKey(value) || "pending"}`;
}

function getPaymentRaw(item = {}) {
  const raw = safeObject(item?.raw);

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

function getIncidenciaId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
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
      item.meta?.incidenciaId,
      pickTicketIdFromArray(item.ticketIds),
      pickTicketIdFromArray(item.incidenciaIds),
      pickTicketIdFromArray(item.relatedTicketIds),
      pickTicketIdFromArray(item.relatedIncidentIds),
      pickTicketIdFromArray(item.linkedTickets),
      pickTicketIdFromArray(item.incidencias),
      pickTicketIdFromArray(item.tickets),
      pickTicketIdFromArray(item.relatedTickets),
      pickTicketIdFromArray(item.facturasRelacionadas),
      pickTicketIdFromArray(item.linkedInvoices?.tickets),
      pickTicketIdFromArray(item.relations),
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
      raw.meta?.incidenciaId,
      pickTicketIdFromArray(raw.ticketIds),
      pickTicketIdFromArray(raw.incidenciaIds),
      pickTicketIdFromArray(raw.relatedTicketIds),
      pickTicketIdFromArray(raw.relatedIncidentIds),
      pickTicketIdFromArray(raw.linkedTickets),
      pickTicketIdFromArray(raw.incidencias),
      pickTicketIdFromArray(raw.tickets),
      pickTicketIdFromArray(raw.relatedTickets),
      pickTicketIdFromArray(raw.facturasRelacionadas),
      pickTicketIdFromArray(raw.linkedInvoices?.tickets),
      pickTicketIdFromArray(raw.relations)
    ),
    ""
  );
}

function getIncidenciaSubject(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
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
  const raw = safeObject(item?.raw);

  return first(
    item.total,
    item.amount,
    item.importe,
    item.importeTotal,
    item.totalFactura,
    item.facturaTotal,
    item.invoiceAmount,
    raw.total,
    raw.amount,
    raw.importe,
    raw.importeTotal,
    raw.totalFactura,
    raw.facturaTotal,
    raw.invoiceAmount,
    0
  );
}

function getCurrency(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.moneda,
      item.currency,
      item.facturaCurrency,
      raw.moneda,
      raw.currency,
      raw.facturaCurrency,
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  );
}

function getTotalLabel(item = {}) {
  return formatMoney(getTotalRaw(item), getCurrency(item));
}

function getTotalCaption(item = {}) {
  const raw = safeObject(item?.raw);

  const taxIncluded = first(
    item.taxIncluded,
    item.impuestosIncluidos,
    item.ivaIncluido,
    raw.taxIncluded,
    raw.impuestosIncluidos,
    raw.ivaIncluido
  );

  if (taxIncluded === false) return "Impuestos no incl.";

  return "Impuestos incl.";
}

function getFormaPago(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.formaPago,
      item.metodoPago,
      item.paymentMethod,
      item.payment?.method,
      raw.formaPago,
      raw.metodoPago,
      raw.paymentMethod,
      raw.payment?.method
    ),
    "—"
  );
}

function getCreatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.fechaFactura,
    item.fecha,
    item.issueDate,
    item.createdAt,
    item.fechaCreacion,
    raw.fechaFactura,
    raw.fecha,
    raw.issueDate,
    raw.createdAt,
    raw.fechaCreacion
  );
}

function getUpdatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.updatedAt,
    item.fechaEnvio,
    item.delivery?.lastSentAt,
    item.sentAt,
    item.mailSentAt,
    item.fechaActualizacion,
    item.lastUpdateAt,
    raw.updatedAt,
    raw.fechaEnvio,
    raw.delivery?.lastSentAt,
    raw.sentAt,
    raw.mailSentAt,
    raw.fechaActualizacion,
    raw.lastUpdateAt
  );
}

function getSentAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.fechaEnvio,
    item.sentAt,
    item.mailSentAt,
    item.delivery?.lastSentAt,
    item.meta?.lastSentAt,
    raw.fechaEnvio,
    raw.sentAt,
    raw.mailSentAt,
    raw.delivery?.lastSentAt,
    raw.meta?.lastSentAt
  );
}

function getSortTimestamp(item = {}) {
  const raw = safeObject(item?.raw);

  return (
    safeNumber(item?.meta?.updatedAtMs, 0) ||
    safeNumber(item?.meta?.timestampMs, 0) ||
    safeNumber(raw?.meta?.updatedAtMs, 0) ||
    safeNumber(raw?.meta?.timestampMs, 0) ||
    toTimestamp(getUpdatedAt(item)) ||
    toTimestamp(getCreatedAt(item)) ||
    toTimestamp(raw?._ts) ||
    0
  );
}

function compareFacturasNewestFirst(a = {}, b = {}) {
  const diff = getSortTimestamp(b) - getSortTimestamp(a);

  if (diff !== 0) return diff;

  return safeText(getFacturaNumero(b), "").localeCompare(
    safeText(getFacturaNumero(a), ""),
    "es",
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

function sortFacturasNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareFacturasNewestFirst);
}

function sortFacturasByInvoiceDesc(items = []) {
  return [...safeArray(items)].sort((a, b) =>
    safeText(getFacturaNumero(b), "").localeCompare(safeText(getFacturaNumero(a), ""), "es", {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function hasPdf(item = {}) {
  const raw = safeObject(item?.raw);

  if (
    bool(
      first(
        item.pdfAvailable,
        item.hasPdf,
        item.meta?.hasPdf,
        raw.pdfAvailable,
        raw.hasPdf,
        raw.meta?.hasPdf
      ),
      false
    )
  ) {
    return true;
  }

  if (
    first(
      item.blobPath,
      item.blobName,
      item.pdfPath,
      item.pdfUrl,
      item.downloadUrl,
      item.viewUrl,
      item.pdf,
      raw.blobPath,
      raw.blobName,
      raw.pdfPath,
      raw.pdfUrl,
      raw.downloadUrl,
      raw.viewUrl,
      raw.pdf
    )
  ) {
    return true;
  }

  const files = safeArray(
    first(
      item.attachments,
      item.files,
      item.adjuntos,
      raw.attachments,
      raw.files,
      raw.adjuntos,
      []
    )
  );

  return files.some((file) => {
    const value = safeObject(file);

    const type = normalizeText(
      first(value.contentType, value.mimeType, value.mimetype, value.type)
    );

    const name = normalizeText(
      first(value.name, value.filename, value.fileName, value.url)
    );

    return type.includes("pdf") || name.endsWith(".pdf");
  });
}

function isFacturaSent(item = {}) {
  const raw = safeObject(item?.raw);

  return Boolean(
    first(
      item.fechaEnvio,
      item.sentAt,
      item.mailSentAt,
      item.delivery?.lastSentAt,
      item.meta?.lastSentAt,
      item.meta?.isSent,
      raw.fechaEnvio,
      raw.sentAt,
      raw.mailSentAt,
      raw.delivery?.lastSentAt,
      raw.meta?.lastSentAt,
      raw.meta?.isSent
    )
  );
}

function canSendFactura(item = {}) {
  return hasPdf(item) && isValidEmail(getClientEmail(item));
}

/* =========================================================
   AVATAR PALETTE
========================================================= */

const AVATAR_PALETTE = Object.freeze([
  ["#7c3aed", "#ec4899"],
  ["#2563eb", "#06b6d4"],
  ["#f97316", "#ef4444"],
  ["#16a34a", "#14b8a6"],
  ["#db2777", "#9333ea"],
  ["#ca8a04", "#ea580c"],
  ["#0891b2", "#4f46e5"],
  ["#e11d48", "#f59e0b"],
  ["#0f766e", "#84cc16"],
  ["#4338ca", "#c026d3"],
]);

function getAvatarStyle(item = {}) {
  const seed = getClientStableKey(item);
  const [a, b] = AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length];

  return [
    `--fac-avatar-a:${a}`,
    `--fac-avatar-b:${b}`,
    `--fac-avatar-bg:linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
  ].join(";");
}

/* =========================================================
   FILTERS / SEARCH
========================================================= */

function normalizeFilter(value = "") {
  const key = normalizeKey(value);

  if (!key || ["all", "todo", "todos", "todas", "total"].includes(key)) return "all";

  if (
    [
      "pending",
      "pendiente",
      "pendientes",
      "partial",
      "parcial",
      "draft",
      "borrador",
      "unpaid",
      "sin_pagar",
    ].includes(key)
  ) {
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
  const runtime = safeObject(data.state);

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
  const key = normalizeFilter(filter);
  return FILTERS.find((item) => item.key === key)?.label || "Todas";
}

function getSearchQuery(input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  return normalizeWhitespace(
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
    )
  );
}

function normalizeSort(value = "") {
  const key = normalizeKey(value);

  if (
    [
      "invoice_desc",
      "factura_desc",
      "numero_desc",
      "n_factura_desc",
      "num_factura_desc",
      "number_desc",
    ].includes(key)
  ) {
    return "invoice_desc";
  }

  return "date_desc";
}

function getSortMode(input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  return normalizeSort(
    first(
      data.sort,
      data.sortBy,
      data.orderBy,
      data.sortMode,
      runtime.sort,
      runtime.sortBy,
      runtime.orderBy,
      runtime.sortMode,
      "date_desc"
    )
  );
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
  const raw = safeObject(item?.raw);

  return [
    getFacturaId(item),
    getFacturaNumero(item),
    getFacturaSistema(item),
    getClientName(item),
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

function filterAndSortFacturas(items = [], input = {}) {
  const activeFilter = getActiveFilter(input);
  const searchQuery = getSearchQuery(input);
  const sortMode = getSortMode(input);

  const filtered = safeArray(items).filter((item) => {
    return itemMatchesFilter(item, activeFilter) && itemMatchesSearch(item, searchQuery);
  });

  return sortMode === "invoice_desc"
    ? sortFacturasByInvoiceDesc(filtered)
    : sortFacturasNewestFirst(filtered);
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
  const rows = safeArray(items);

  return rows.reduce(
    (acc, item) => {
      const total = safeNumber(getTotalRaw(item), 0);
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
  const runtime = safeObject(data.state);

  return clamp(
    safeNumber(
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
  const runtime = safeObject(data.state);

  const allItems = filterAndSortFacturas(items, data);
  const pageSize = normalizePageSize(data);
  const filtering = isFilterActive(data);

  const remoteTotal = Math.max(
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        data.totalMatched,
        runtime.totalCount,
        runtime.remoteCount,
        runtime.totalMatched,
        runtime.total,
        allItems.length
      ),
      allItems.length
    ),
    allItems.length
  );

  const reportedTotal = filtering ? allItems.length : remoteTotal;

  const totalPagesFromProps = filtering
    ? 0
    : safeNumber(first(data.totalPages, runtime.totalPages), 0);

  const totalPages = Math.max(
    1,
    totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = clamp(
    safeNumber(
      first(
        data.page,
        runtime.page,
        runtime.currentPage,
        runtime.facturasPage,
        1
      ),
      1
    ),
    1,
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = allItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = reportedTotal
    ? Math.min(startIndex + pageItems.length, reportedTotal)
    : 0;

  return {
    allItems,
    pageItems,
    pageSize,
    currentPage,
    totalPages,
    totalCount: reportedTotal,
    unfilteredCount: safeArray(items).length,
    remoteTotal,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
    filtering,
    activeFilter: getActiveFilter(data),
    searchQuery: getSearchQuery(data),
  };
}

/* =========================================================
   BUSY STATE
========================================================= */

function resolveBusyMeta(item = {}, state = {}) {
  const runtime = safeObject(state);
  const facturaId = getFacturaId(item);

  return {
    facturaId,
    isOpening: safeText(runtime.openingFacturaId, "") === facturaId,
    isViewingPdf: safeText(runtime.viewingFacturaId, "") === facturaId,
    isDownloading: safeText(runtime.downloadingFacturaId, "") === facturaId,
    isSending: safeText(runtime.sendingFacturaId, "") === facturaId,
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderMaybeStyles(includeStyles = false) {
  return includeStyles ? renderStyles() : "";
}

function renderSpinner(label = "") {
  return `
    <span class="facturas-inline-loading">
      <span class="facturas-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="facturas-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="facturas-loader-only"
      role="status"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      data-tooltip="${escapeHtml(label)}"
    >
      <span class="facturas-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = getInitials(fullName);
  const avatarUrl = getClientAvatar(item);
  const avatarStyle = getAvatarStyle(item);

  if (avatarUrl) {
    return `
      <div
        class="facturas-avatar"
        title="${escapeHtml(fullName)}"
        aria-label="${escapeHtml(fullName)}"
        data-tooltip="${escapeHtml(fullName)}"
        style="${escapeHtml(avatarStyle)}"
      >
        <img
          src="${escapeHtml(avatarUrl)}"
          alt="${escapeHtml(fullName)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'; this.parentNode.setAttribute('data-fallback','true');"
        />
        <span class="facturas-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="facturas-avatar facturas-avatar--fallback"
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      style="${escapeHtml(avatarStyle)}"
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
    <span class="facturas-chip ${klass}">
      <span class="facturas-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderDeliveryBadge(item = {}) {
  const sent = isFacturaSent(item);
  const sentAt = getSentAt(item);

  if (sent) {
    const title = sentAt
      ? `Enviada · ${formatDateTime(sentAt)}`
      : "Factura enviada";

    return `
      <span
        class="facturas-mini-badge facturas-mini-badge--sent"
        title="${escapeHtml(title)}"
        data-tooltip="${escapeHtml(title)}"
      >
        ${icon("check")}
        Enviada
      </span>
    `;
  }

  return `
    <span
      class="facturas-mini-badge facturas-mini-badge--idle"
      title="Factura no enviada todavía"
      data-tooltip="Factura no enviada todavía"
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
        title="PDF disponible"
        data-tooltip="PDF disponible"
      >
        ${icon("pdf")}
        PDF
      </span>
    `;
  }

  return `
    <span
      class="facturas-mini-badge facturas-mini-badge--blocked"
      title="PDF no disponible"
      data-tooltip="PDF no disponible"
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
      data-action="open-incidencia"
      data-facturas-action="open-incidencia"
      data-ticket-id="${escapeHtml(incidenciaId)}"
      data-incidencia-id="${escapeHtml(incidenciaId)}"
      data-factura-id="${escapeHtml(facturaId)}"
      title="${escapeHtml(tooltip)}"
      data-tooltip="${escapeHtml(tooltip)}"
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

  return `
    <div class="facturas-pagination" aria-label="Paginación de facturas">
      <button
        type="button"
        class="facturas-pagination-btn"
        data-action="prev-page"
        data-facturas-action="prev-page"
        data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
        ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Anterior
      </button>

      <span class="facturas-pagination-status">
        ${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}
      </span>

      <button
        type="button"
        class="facturas-pagination-btn facturas-pagination-btn--next"
        data-action="next-page"
        data-facturas-action="next-page"
        data-page="${escapeHtml(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
        ${!pagination.hasNext || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
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
        value="${escapeHtml(searchQuery)}"
        placeholder="Buscar factura, cliente, email, importe..."
        autocomplete="off"
        spellcheck="false"
        data-facturas-action="search"
        data-action="search-facturas"
        data-facturas-search-input="true"
        aria-label="Buscar facturas por cliente, email, importe o número de factura"
      />

      ${
        searchQuery
          ? `
            <button
              type="button"
              class="facturas-search-clear"
              data-facturas-action="clear-search"
              data-action="clear-search"
              title="Limpiar búsqueda"
              data-tooltip="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
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
  const items = safeArray(first(data.items, data.rows, data.facturas, data.invoices));
  const counts = computeFilterCounts(items, data);
  const activeFilter = normalizeFilter(pagination.activeFilter || getActiveFilter(data));
  const sortMode = getSortMode(data);

  return `
    <div class="facturas-filters" aria-label="Filtros, orden y búsqueda de facturas">
      <div class="facturas-filter-pills" aria-label="Filtrar facturas por estado de pago">
        ${FILTERS.map((filter) => {
          const isActive = filter.key === activeFilter;
          const count = counts[filter.key] ?? 0;

          return `
            <button
              type="button"
              class="facturas-filter-pill${isActive ? " is-active" : ""}"
              data-facturas-action="filter"
              data-action="filter-facturas"
              data-filter="${escapeHtml(filter.key)}"
              data-filter-status="${escapeHtml(filter.key)}"
              data-payment-filter="${escapeHtml(filter.key)}"
              aria-pressed="${isActive ? "true" : "false"}"
            >
              <span>${escapeHtml(filter.label)}</span>
              <strong>${escapeHtml(String(count))}</strong>
            </button>
          `;
        }).join("")}
      </div>

      <div class="facturas-sort-pills" role="group" aria-label="Ordenar listado de facturas">
        ${SORT_OPTIONS.map((option) => {
          const isActive = option.key === sortMode;

          return `
            <button
              type="button"
              class="facturas-sort-pill${isActive ? " is-active" : ""}"
              data-facturas-action="sort"
              data-action="sort-facturas"
              data-sort="${escapeHtml(option.key)}"
              title="${escapeHtml(option.title)}"
              data-tooltip="${escapeHtml(option.title)}"
              aria-label="${escapeHtml(option.title)}"
              aria-pressed="${isActive ? "true" : "false"}"
            >
              <span>${escapeHtml(option.label)}</span>
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
  const finalDisabled = disabled || loading;
  const finalTooltip = tooltip || label;

  return `
    <button
      type="button"
      class="facturas-action-btn ${klass}${loading ? " is-loading" : ""}"
      data-action="${escapeHtml(action)}"
      data-facturas-action="${escapeHtml(action)}"
      data-factura-id="${escapeHtml(facturaId)}"
      title="${escapeHtml(finalTooltip)}"
      data-tooltip="${escapeHtml(finalTooltip)}"
      ${finalDisabled ? 'disabled aria-disabled="true"' : ""}
      ${ariaBusy || loading ? 'aria-busy="true"' : ""}
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

function renderRow(item = {}, state = {}) {
  const busy = resolveBusyMeta(item, state);

  const facturaId = busy.facturaId;
  const numero = getFacturaNumero(item);
  const numeroSistema = getFacturaSistema(item);
  const clientName = getClientName(item);
  const clientEmail = getClientEmailLabel(item);
  const createdAtRaw = getCreatedAt(item);
  const createdAt = formatDateTime(createdAtRaw);
  const total = getTotalLabel(item);
  const totalCaption = getTotalCaption(item);
  const formaPago = getFormaPago(item);
  const pdfAvailable = hasPdf(item);
  const sent = isFacturaSent(item);
  const canSend = canSendFactura(item);

  const sendLabel = sent ? "Reenviar" : "Enviar";
  const sendTooltip = !pdfAvailable
    ? "No se puede enviar: falta PDF"
    : !isValidEmail(getClientEmail(item))
      ? "No se puede enviar: falta email válido"
      : sent
        ? "Reenviar factura al cliente"
        : "Enviar factura al cliente";

  const paymentKey = getEstadoPagoKey(getPaymentRaw(item));

  return `
    <tr
      class="facturas-table-row facturas-table-row--${escapeHtml(paymentKey)}"
      data-factura-id="${escapeHtml(facturaId)}"
      data-sent="${sent ? "true" : "false"}"
      data-has-pdf="${pdfAvailable ? "true" : "false"}"
      data-row-click-disabled="true"
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
          title="${escapeHtml(createdAt)}"
          data-tooltip="${escapeHtml(createdAt)}"
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
            action: "open-factura",
            facturaId,
            label: "Detalle",
            loadingLabel: "Abriendo detalle",
            iconName: "detail",
            loading: busy.isOpening,
            tooltip: "Abrir detalle de factura",
            ariaBusy: busy.isOpening,
          })}

          ${renderActionButton({
            action: "view-factura-pdf",
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
            action: "download-factura",
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
            action: "send-factura",
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
      ${Array.from({ length: rows })
        .map(
          () => `
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
          `
        )
        .join("")}
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
              data-facturas-action="clear-filters"
              data-action="clear-filters"
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
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style id="${STYLE_ID}">
      :where(.facturas-view-root, [data-facturas-scope]){
        --fac-row-accent:var(--accent, #6f59d9);
        --fac-row-accent-soft:var(--accent-soft, rgba(111,89,217,.12));
        --fac-table-min-width:1040px;
        --fac-actions-width:178px;

        display:grid;
        gap:var(--view-section-gap, var(--space-lg, 18px));
        color:var(--text, #f5f5f5);
        font-family:var(--font-family, inherit);
        min-inline-size:0;
        inline-size:100%;
        container-type:inline-size;
      }

      :where(.facturas-view-root, [data-facturas-scope]) *,
      :where(.facturas-view-root, [data-facturas-scope]) *::before,
      :where(.facturas-view-root, [data-facturas-scope]) *::after{
        box-sizing:border-box;
      }

      .facturas-hero{
        position:relative;
        overflow:hidden;
        border-radius:var(--view-hero-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--view-hero-border, var(--panel-border, var(--border-default, rgba(255,255,255,.08))));
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #6f59d9) 10%, transparent), transparent 38%),
          radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--info, #3b82a6) 8%, transparent), transparent 34%),
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #262626))));
        box-shadow:var(--view-hero-shadow, var(--panel-shadow, var(--shadow-md, 0 14px 30px rgba(0,0,0,.22))));
        padding:var(--space-xl, 22px) var(--space-xl, 24px);
        isolation:isolate;
        min-inline-size:0;
      }

      .facturas-hero::after{
        content:"";
        position:absolute;
        inset:auto -8% -38% 48%;
        block-size:220px;
        pointer-events:none;
        background:radial-gradient(circle, color-mix(in srgb, var(--accent, #6f59d9) 9%, transparent), transparent 68%);
        filter:blur(10px);
        opacity:.8;
        z-index:0;
      }

      .facturas-hero > *{
        position:relative;
        z-index:1;
      }

      .facturas-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-lg, 18px);
        align-items:start;
      }

      .facturas-hero-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-xs, 10px);
      }

      .facturas-page-title{
        margin:0;
        max-inline-size:100%;
        font-size:clamp(var(--font-3xl, 24px), 2.6vw, var(--font-5xl, 40px));
        line-height:var(--line-tight, 1.08);
        letter-spacing:var(--view-title-letter, -.05em);
        font-weight:var(--view-title-weight, var(--weight-black, 800));
        color:var(--text-strong, #ffffff);
        white-space:normal;
      }

      .facturas-page-subtitle{
        margin:0;
        max-inline-size:880px;
        font-size:var(--font-lg, 15px);
        line-height:var(--line-relaxed, 1.58);
        color:var(--view-subtitle-color, var(--text-muted, rgba(245,245,245,.70)));
      }

      .facturas-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:var(--space-xs, 10px);
        flex-wrap:wrap;
      }

      .facturas-btn{
        appearance:none;
        min-block-size:var(--btn-height, 42px);
        padding-inline:var(--space-md, 16px);
        border-radius:var(--btn-radius, var(--radius-md, 13px));
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        text-decoration:none;
        white-space:nowrap;
        box-shadow:var(--btn-secondary-shadow, var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16)));
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          filter var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-btn svg{
        inline-size:16px;
        block-size:16px;
      }

      .facturas-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
        box-shadow:var(--shadow-md, 0 14px 30px rgba(0,0,0,.22));
      }

      .facturas-btn:active{
        transform:translateY(0) scale(var(--ui-active-scale, .985));
      }

      .facturas-btn--primary{
        border-color:var(--btn-primary-border, var(--accent-border, rgba(255,255,255,.05)));
        background:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #55555d 0%, #3f3f46 55%, #2f2f35 100%)));
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22));
      }

      .facturas-btn--create{
        border-color:color-mix(in srgb, var(--success, #22c55e) 32%, var(--btn-primary-border, transparent));
        background:var(--gradient-success, linear-gradient(180deg, #22c55e 0%, #16a34a 100%));
        color:var(--text-on-accent, #ffffff);
        box-shadow:
          0 10px 24px color-mix(in srgb, var(--success, #22c55e), transparent 82%),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
      }

      .facturas-btn:focus-visible,
      .facturas-action-btn:focus-visible,
      .facturas-pagination-btn:focus-visible,
      .facturas-incidencia-link:focus-visible,
      .facturas-filter-pill:focus-visible,
      .facturas-sort-pill:focus-visible,
      .facturas-search-input:focus-visible,
      .facturas-search-clear:focus-visible{
        outline:none;
        box-shadow:var(--focus-ring, 0 0 0 4px rgba(113,113,122,.16));
      }

      .facturas-btn.is-loading,
      .facturas-action-btn.is-loading{
        cursor:wait;
        opacity:.94;
      }

      .facturas-btn:disabled,
      .facturas-action-btn:disabled,
      .facturas-action-btn[aria-disabled="true"]{
        pointer-events:none;
        opacity:.54;
        filter:saturate(.75);
      }

      .facturas-hero-meta{
        margin-block-start:var(--space-md, 14px);
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .facturas-meta-pill{
        min-block-size:calc(30px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        border:1px solid var(--badge-border, var(--border-default, rgba(255,255,255,.07)));
        background:var(--badge-bg, rgba(255,255,255,.048));
        color:var(--badge-text, var(--text-muted, rgba(245,245,245,.70)));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        gap:7px;
        white-space:nowrap;
      }

      .facturas-meta-pill svg{
        inline-size:14px;
        block-size:14px;
      }

      .facturas-stats{
        margin-block-start:var(--space-md, 16px);
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .facturas-stat-card{
        position:relative;
        display:grid;
        gap:var(--space-xs, 8px);
        min-block-size:calc(124px * var(--ui-scale, 1));
        padding:var(--space-md, 16px) var(--space-lg, 18px);
        border-radius:var(--card-radius, 18px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
        overflow:hidden;
      }

      .facturas-stat-card::after{
        content:"";
        position:absolute;
        inset:auto -20% -44% auto;
        inline-size:120px;
        block-size:120px;
        border-radius:50%;
        pointer-events:none;
        background:color-mix(in srgb, var(--fac-stat-color, var(--accent, #6f59d9)) 16%, transparent);
        filter:blur(8px);
      }

      .facturas-stat-card--accent{
        --fac-stat-color:var(--accent, #6f59d9);
        border-color:var(--accent-border, var(--border-accent, rgba(113,113,122,.30)));
      }

      .facturas-stat-card--success{
        --fac-stat-color:var(--success, #22c55e);
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .facturas-stat-card--warning{
        --fac-stat-color:var(--warning, #f59e0b);
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .facturas-stat-card--danger{
        --fac-stat-color:var(--error, #ef4444);
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .facturas-stat-label{
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        color:var(--text-dim, rgba(245,245,245,.50));
      }

      .facturas-stat-value{
        font-size:clamp(28px, 3vw, var(--font-5xl, 40px));
        line-height:.92;
        letter-spacing:var(--letter-tight, -.03em);
        font-weight:var(--weight-black, 800);
        color:var(--text-strong, #ffffff);
      }

      .facturas-stat-text{
        font-size:var(--font-base, 14px);
        line-height:var(--line-normal, 1.42);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .facturas-history{
        overflow:hidden;
        border-radius:var(--data-table-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--data-table-border, var(--card-border, var(--border-default, rgba(255,255,255,.082))));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--data-table-bg, var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88))));
        box-shadow:var(--data-table-shadow, var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24))));
        min-inline-size:0;
      }

      .facturas-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-md, 14px);
        align-items:start;
        padding:var(--space-md, 14px) var(--space-lg, 18px) var(--space-sm, 12px);
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
      }

      .facturas-history-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 2px);
      }

      .facturas-history-title{
        margin:0;
        font-size:var(--section-title-size, var(--font-xl, 16px));
        line-height:var(--line-snug, 1.22);
        font-weight:var(--section-title-weight, var(--weight-bold, 700));
        color:var(--section-title-color, var(--text-strong, #ffffff));
      }

      .facturas-history-subtitle{
        margin:0;
        font-size:var(--section-subtitle-size, var(--font-sm, 12px));
        line-height:var(--line-normal, 1.42);
        color:var(--section-subtitle-color, var(--text-dim, rgba(245,245,245,.50)));
      }

      .facturas-pagination{
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .facturas-pagination-status{
        min-block-size:calc(34px * var(--ui-scale, 1));
        padding-inline:10px;
        border-radius:var(--radius-pill, 999px);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-dim, rgba(245,245,245,.50));
        background:var(--badge-bg, rgba(255,255,255,.048));
        border:1px solid var(--badge-border, rgba(255,255,255,.07));
      }

      .facturas-pagination-btn{
        appearance:none;
        min-block-size:calc(38px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 14px);
        border-radius:var(--radius-md, 13px);
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-sm, 12px);
        font-weight:var(--weight-bold, 700);
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-pagination-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        border-color:var(--border-strong, rgba(255,255,255,.12));
      }

      .facturas-pagination-btn[disabled],
      .facturas-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
        pointer-events:none;
        transform:none;
      }

      .facturas-filters{
        grid-column:1 / -1;
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto minmax(280px, 430px);
        gap:var(--space-sm, 12px);
        align-items:center;
        padding-block-start:var(--space-xs, 4px);
        min-inline-size:0;
      }

      .facturas-filter-pills,
      .facturas-sort-pills{
        min-inline-size:0;
        display:flex;
        align-items:center;
        gap:var(--space-2xs, 6px);
        overflow-x:auto;
        overflow-y:hidden;
        scrollbar-width:none;
        padding-block:2px;
      }

      .facturas-sort-pills{
        justify-content:center;
        flex-wrap:nowrap;
        min-inline-size:max-content;
      }

      .facturas-filter-pills::-webkit-scrollbar,
      .facturas-sort-pills::-webkit-scrollbar{
        display:none;
      }

      .facturas-filter-pill,
      .facturas-sort-pill{
        appearance:none;
        min-block-size:calc(34px * var(--ui-scale, 1));
        padding-inline:11px 8px;
        border-radius:999px;
        border:1px solid var(--badge-border, rgba(255,255,255,.07));
        background:var(--badge-bg, rgba(255,255,255,.048));
        color:var(--badge-text, var(--text-muted, rgba(245,245,245,.70)));
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:7px;
        font:inherit;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        line-height:1;
        white-space:nowrap;
        cursor:pointer;
        flex:0 0 auto;
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-sort-pill{
        padding-inline:12px;
      }

      .facturas-filter-pill strong{
        min-inline-size:22px;
        min-block-size:20px;
        padding-inline:6px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        color:inherit;
        background:color-mix(in srgb, currentColor 10%, transparent);
        font-size:10px;
        font-weight:900;
      }

      .facturas-filter-pill:hover,
      .facturas-sort-pill:hover{
        transform:translateY(-1px);
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
      }

      .facturas-filter-pill.is-active,
      .facturas-sort-pill.is-active{
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 42%, var(--border-strong, rgba(255,255,255,.12)));
        background:color-mix(in srgb, var(--accent, #6f59d9) 14%, var(--badge-bg, rgba(255,255,255,.048)));
        color:var(--accent-active, var(--text-strong, #ffffff));
        box-shadow:0 8px 20px color-mix(in srgb, var(--accent, #6f59d9), transparent 88%);
      }

      .facturas-search{
        position:relative;
        min-inline-size:0;
        inline-size:100%;
        display:flex;
        align-items:center;
      }

      .facturas-search-icon{
        position:absolute;
        inset-inline-start:12px;
        inset-block:0;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        color:var(--text-dim, rgba(245,245,245,.50));
        pointer-events:none;
      }

      .facturas-search-icon svg{
        inline-size:14px;
        block-size:14px;
      }

      .facturas-search-input{
        appearance:none;
        inline-size:100%;
        min-inline-size:0;
        min-block-size:calc(36px * var(--ui-scale, 1));
        border-radius:999px;
        border:1px solid var(--input-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--input-bg, rgba(255,255,255,.045));
        color:var(--input-text, var(--text, #f5f5f5));
        padding:0 38px 0 36px;
        font:inherit;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-semibold, 600);
        line-height:1;
        outline:none;
        box-shadow:var(--input-shadow, none);
        transition:
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-search-input::placeholder{
        color:var(--input-placeholder, var(--text-faint, rgba(245,245,245,.34)));
      }

      .facturas-search-input:hover{
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--input-bg-hover, var(--btn-secondary-bg-hover, rgba(255,255,255,.062)));
      }

      .facturas-search-input:focus{
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 42%, var(--border-strong, rgba(255,255,255,.12)));
        background:var(--input-bg-focus, var(--input-bg, rgba(255,255,255,.045)));
      }

      .facturas-search-clear{
        appearance:none;
        position:absolute;
        inset-inline-end:6px;
        inset-block:50% auto;
        transform:translateY(-50%);
        inline-size:26px;
        block-size:26px;
        border-radius:999px;
        border:1px solid transparent;
        background:transparent;
        color:var(--text-dim, rgba(245,245,245,.50));
        display:inline-flex;
        align-items:center;
        justify-content:center;
        cursor:pointer;
        padding:0;
        transition:
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-search-clear:hover{
        color:var(--text-strong, #ffffff);
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        border-color:var(--border-default, rgba(255,255,255,.09));
      }

      .facturas-search-clear svg{
        inline-size:13px;
        block-size:13px;
      }

      .facturas-table-wrap{
        position:relative;
        min-block-size:120px;
        min-inline-size:0;
      }

      .facturas-table-wrap.is-refreshing .facturas-table-shell{
        opacity:.56;
        filter:blur(.7px);
        transition:
          opacity var(--duration-fast, .18s) var(--ease-standard, ease),
          filter var(--duration-fast, .18s) var(--ease-standard, ease);
      }

      .facturas-table-shell{
        inline-size:100%;
        max-inline-size:100%;
        overflow-x:auto;
        overflow-y:hidden;
        scrollbar-width:thin;
        scrollbar-color:var(--scrollbar-thumb, rgba(255,255,255,.12)) transparent;
        transition:
          opacity var(--duration-fast, .18s) var(--ease-standard, ease),
          filter var(--duration-fast, .18s) var(--ease-standard, ease);
      }

      .facturas-table-shell::-webkit-scrollbar{
        block-size:var(--scrollbar-size, 10px);
      }

      .facturas-table-shell::-webkit-scrollbar-track{
        background:transparent;
      }

      .facturas-table-shell::-webkit-scrollbar-thumb{
        border:2px solid transparent;
        border-radius:999px;
        background:var(--scrollbar-thumb, rgba(255,255,255,.12));
        background-clip:padding-box;
      }

      .facturas-table{
        display:table !important;
        inline-size:100%;
        min-inline-size:var(--fac-table-min-width);
        table-layout:fixed;
        border-collapse:separate;
        border-spacing:0;
        background:var(--table-bg, transparent);
        margin:0;
      }

      .facturas-table colgroup{
        display:table-column-group !important;
      }

      .facturas-table col{
        display:table-column !important;
      }

      .facturas-table thead{
        display:table-header-group !important;
      }

      .facturas-table tbody{
        display:table-row-group !important;
      }

      .facturas-table tr{
        display:table-row !important;
      }

      .facturas-table th,
      .facturas-table td{
        display:table-cell !important;
      }

      .facturas-table thead th{
        position:sticky;
        top:0;
        z-index:2;
        padding:var(--table-cell-padding-y, 12px) var(--table-cell-padding-x, 12px);
        text-align:left;
        font-size:var(--data-table-head-font-size, var(--font-xs, 11px));
        font-weight:var(--data-table-head-font-weight, var(--weight-bold, 700));
        letter-spacing:var(--data-table-head-letter, .075em);
        text-transform:uppercase;
        color:var(--data-table-head-text, var(--text-dim, rgba(245,245,245,.50)));
        background:var(--data-table-head-bg, var(--table-head-bg, rgba(255,255,255,.020)));
        border-bottom:1px solid var(--table-head-border, var(--border-default, rgba(255,255,255,.082)));
        white-space:nowrap;
      }

      .facturas-table tbody td{
        padding:calc(12px * var(--ui-scale, 1)) var(--table-cell-padding-x, 12px);
        vertical-align:middle;
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
        background:transparent;
        transition:
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-table tbody tr:last-child td{
        border-bottom:none;
      }

      .facturas-table tbody tr:nth-child(even) > td{
        background:color-mix(in srgb, var(--surface-elevated, rgba(39,39,42,.88)) 86%, transparent);
      }

      .facturas-table-row{
        --fac-row-accent:var(--accent, #6f59d9);
      }

      .facturas-table-row:hover > td{
        background:var(--data-table-row-hover, var(--table-row-hover, rgba(255,255,255,.024)));
      }

      .facturas-table-row--paid{
        --fac-row-accent:var(--success, #22c55e);
      }

      .facturas-table-row--pending,
      .facturas-table-row--partial,
      .facturas-table-row--draft{
        --fac-row-accent:var(--warning, #f59e0b);
      }

      .facturas-table-row--overdue,
      .facturas-table-row--cancelled{
        --fac-row-accent:var(--error, #ef4444);
      }

      .facturas-cell{
        min-inline-size:0;
      }

      .facturas-cell--main{
        position:relative;
        padding-inline-start:calc(var(--table-cell-padding-x, 12px) + 10px) !important;
      }

      .facturas-cell--main::before{
        content:"";
        position:absolute;
        inset-block:12px;
        inset-inline-start:0;
        inline-size:3px;
        border-radius:0 999px 999px 0;
        background:var(--fac-row-accent);
        opacity:.70;
        transform:scaleY(.76);
        transform-origin:center;
        transition:
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-table-row:hover .facturas-cell--main::before{
        opacity:1;
        transform:scaleY(1);
      }

      .facturas-main{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1))) minmax(0, 1fr);
        gap:var(--space-sm, 12px);
        align-items:center;
        min-inline-size:0;
      }

      .facturas-avatar{
        position:relative;
        inline-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        block-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        border-radius:var(--radius-pill, 999px);
        overflow:hidden;
        flex:0 0 var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        background:var(--fac-avatar-bg, linear-gradient(135deg, #55555d 0%, #303036 100%));
        box-shadow:
          0 10px 22px color-mix(in srgb, var(--fac-avatar-b, #000000) 22%, transparent),
          0 0 0 3px color-mix(in srgb, var(--fac-avatar-a, #71717a) 24%, transparent),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
        transform:translateZ(0);
      }

      .facturas-avatar::after{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        background:
          radial-gradient(circle at 30% 22%, rgba(255,255,255,.42), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.08));
        pointer-events:none;
        mix-blend-mode:screen;
      }

      .facturas-avatar img{
        position:relative;
        z-index:1;
        display:block;
        inline-size:100%;
        block-size:100%;
        object-fit:cover;
      }

      .facturas-avatar-fallback{
        position:absolute;
        inset:0;
        z-index:2;
        display:none;
        align-items:center;
        justify-content:center;
        font-size:var(--font-2xl, 19px);
        font-weight:var(--weight-black, 800);
        color:var(--avatar-text, #ffffff);
        letter-spacing:-.035em;
        text-shadow:
          0 1px 2px rgba(0,0,0,.22),
          0 0 16px rgba(255,255,255,.20);
      }

      .facturas-avatar[data-fallback="true"] .facturas-avatar-fallback,
      .facturas-avatar--fallback .facturas-avatar-fallback{
        display:flex;
      }

      .facturas-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .facturas-main-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 3px);
      }

      .facturas-factura-line{
        display:flex;
        align-items:center;
        gap:7px;
        min-inline-size:0;
      }

      .facturas-factura-id{
        min-inline-size:0;
        font-size:var(--font-sm, 12px);
        line-height:var(--line-snug, 1.22);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.055em;
        color:var(--text-dim, rgba(245,245,245,.50));
        text-transform:uppercase;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .facturas-system-id{
        flex:0 1 auto;
        max-inline-size:124px;
        min-block-size:20px;
        padding-inline:7px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        font-size:10px;
        font-weight:800;
        letter-spacing:.045em;
        color:var(--text-dim, rgba(245,245,245,.50));
        background:var(--badge-bg, rgba(255,255,255,.048));
        border:1px solid var(--badge-border, rgba(255,255,255,.07));
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .facturas-factura-client{
        font-size:var(--font-lg, 15px);
        line-height:1.14;
        font-weight:var(--weight-black, 800);
        letter-spacing:var(--letter-tight, -.03em);
        color:var(--text-strong, #ffffff);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .facturas-factura-email{
        font-size:var(--font-md, 13px);
        line-height:1.3;
        color:var(--text-dim, rgba(245,245,245,.50));
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .facturas-row-badges{
        display:flex;
        align-items:center;
        flex-wrap:wrap;
        gap:5px;
        margin-block-start:3px;
      }

      .facturas-mini-badge{
        min-block-size:20px;
        padding-inline:7px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        gap:4px;
        border:1px solid var(--badge-border, rgba(255,255,255,.07));
        background:var(--badge-bg, rgba(255,255,255,.048));
        color:var(--text-dim, rgba(245,245,245,.50));
        font-size:10px;
        font-weight:800;
        line-height:1;
        letter-spacing:.035em;
        text-transform:uppercase;
        white-space:nowrap;
      }

      .facturas-mini-badge svg{
        inline-size:12px;
        block-size:12px;
      }

      .facturas-mini-badge--sent{
        color:var(--success, #22c55e);
        background:var(--success-bg, rgba(34,197,94,.10));
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .facturas-mini-badge--pdf{
        color:var(--info, #94a3b8);
        background:var(--info-bg, rgba(148,163,184,.10));
        border-color:var(--border-info, rgba(148,163,184,.28));
      }

      .facturas-mini-badge--blocked{
        color:var(--error, #ef4444);
        background:var(--error-bg, rgba(239,68,68,.10));
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .facturas-chip{
        min-block-size:var(--chip-height, calc(26px * var(--ui-scale, 1)));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:7px;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
        box-shadow:var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
      }

      .facturas-chip-dot{
        inline-size:6px;
        block-size:6px;
        border-radius:999px;
        background:currentColor;
        box-shadow:0 0 0 3px color-mix(in srgb, currentColor 16%, transparent);
      }

      .facturas-chip--pending,
      .facturas-chip--partial{
        color:var(--warning, #f59e0b);
        background:color-mix(in srgb, var(--warning-bg, rgba(245,158,11,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .facturas-chip--draft{
        color:var(--text-soft, rgba(245,245,245,.88));
        background:var(--chip-bg, rgba(255,255,255,.034));
        border-color:var(--chip-border, rgba(255,255,255,.07));
      }

      .facturas-chip--paid{
        color:var(--success, #22c55e);
        background:color-mix(in srgb, var(--success-bg, rgba(34,197,94,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .facturas-chip--overdue,
      .facturas-chip--cancelled{
        color:var(--error, #ef4444);
        background:color-mix(in srgb, var(--error-bg, rgba(239,68,68,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .facturas-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:var(--font-md, 13px);
        line-height:1.2;
        font-weight:var(--weight-semibold, 600);
        font-variant-numeric:tabular-nums;
        color:var(--data-table-cell-text, var(--text-soft, rgba(245,245,245,.88)));
      }

      .facturas-total-stack{
        display:grid;
        gap:var(--space-3xs, 2px);
        min-inline-size:0;
      }

      .facturas-total-value{
        font-size:var(--font-base, 14px);
        line-height:1.15;
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
        white-space:nowrap;
      }

      .facturas-total-caption{
        font-size:var(--font-xs, 11px);
        line-height:1.15;
        color:var(--text-muted, rgba(245,245,245,.70));
        white-space:nowrap;
        font-weight:var(--weight-bold, 700);
      }

      .facturas-total-meta{
        font-size:var(--font-xs, 11px);
        line-height:1.15;
        color:var(--text-dim, rgba(245,245,245,.50));
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .facturas-incidencia-link{
        appearance:none;
        max-inline-size:100%;
        min-block-size:calc(30px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 10px);
        border-radius:var(--radius-pill, 999px);
        border:1px solid var(--accent-border, rgba(113,113,122,.28));
        background:var(--accent-soft, rgba(63,63,70,.18));
        color:var(--text-strong, #ffffff);
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.025em;
        text-transform:uppercase;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:6px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-incidencia-link svg{
        inline-size:14px;
        block-size:14px;
        flex:0 0 auto;
      }

      .facturas-incidencia-link span{
        min-inline-size:0;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .facturas-incidencia-link:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--accent-ghost, rgba(63,63,70,.10));
        border-color:var(--accent-border-strong, rgba(113,113,122,.42));
      }

      .facturas-incidencia-empty{
        color:var(--text-dim, rgba(245,245,245,.50));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-semibold, 600);
      }

      .facturas-cell--actions{
        width:1%;
        white-space:nowrap;
        text-align:end;
      }

      .facturas-actions{
        display:grid;
        grid-template-columns:repeat(2, minmax(76px, 1fr));
        gap:var(--space-2xs, 6px);
        inline-size:100%;
        max-inline-size:var(--fac-actions-width);
        min-inline-size:0;
        justify-content:end;
        margin-inline-start:auto;
      }

      .facturas-action-btn{
        appearance:none;
        inline-size:100%;
        min-inline-size:0;
        min-block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        padding-inline:7px;
        border-radius:var(--radius-md, 10px);
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:5px;
        white-space:nowrap;
        box-shadow:none;
        overflow:hidden;
        transition:
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          filter var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-action-icon{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .facturas-action-icon svg{
        inline-size:14px;
        block-size:14px;
      }

      .facturas-action-btn .facturas-btn-text{
        min-inline-size:0;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .facturas-action-btn:hover{
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
        transform:translateY(var(--ui-hover-lift, -1px));
      }

      .facturas-action-btn:active{
        transform:translateY(0) scale(var(--ui-active-scale, .985));
      }

      .facturas-action-btn.is-loading{
        min-block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        justify-content:center;
      }

      .facturas-action-btn--primary{
        border-color:var(--btn-primary-border, var(--accent-border, rgba(255,255,255,.05)));
        background:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #55555d 0%, #3f3f46 55%, #2f2f35 100%)));
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
      }

      .facturas-action-btn--primary:hover{
        background:var(--btn-primary-bg-hover, var(--btn-primary-bg));
        color:var(--btn-primary-text, #ffffff);
        box-shadow:var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22));
      }

      .facturas-action-btn--success{
        border-color:color-mix(in srgb, var(--success, #22c55e) 32%, var(--btn-primary-border, transparent));
        background:var(--gradient-success, linear-gradient(180deg, #22c55e 0%, #16a34a 100%));
        color:var(--text-on-accent, #ffffff);
      }

      .facturas-loader-only{
        display:inline-flex;
        inline-size:16px;
        block-size:16px;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .facturas-inline-loading{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:var(--space-xs, 7px);
        white-space:nowrap;
      }

      .facturas-inline-loading-text{
        display:inline-block;
      }

      .facturas-inline-spinner{
        inline-size:14px;
        block-size:14px;
        border-radius:var(--radius-pill, 999px);
        border:2px solid var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:currentColor;
        animation:facturasSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .facturas-refresh-overlay{
        position:absolute;
        inset:0;
        z-index:3;
        display:grid;
        place-items:center;
        pointer-events:none;
        background:color-mix(in srgb, var(--backdrop-bg, rgba(10,10,12,.28)) 72%, transparent);
        backdrop-filter:var(--blur-sm, blur(8px));
        -webkit-backdrop-filter:var(--blur-sm, blur(8px));
      }

      .facturas-refresh-card{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-block-size:var(--btn-height, 42px);
        padding-inline:var(--space-md, 16px);
        border-radius:var(--radius-md, 14px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:var(--popover-bg, var(--surface-elevated-strong, rgba(44,44,48,.94)));
        color:var(--text-soft, rgba(245,245,245,.88));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
        box-shadow:var(--shadow-lg, 0 20px 46px rgba(0,0,0,.28));
      }

      .facturas-table-loading{
        padding:var(--space-sm, 12px) var(--space-lg, 18px) var(--space-md, 16px);
        display:grid;
        gap:var(--space-sm, 12px);
      }

      .facturas-table-loading-row{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, 44px) minmax(190px, 1.1fr) 102px 130px 108px 150px 178px;
        gap:var(--space-xs, 10px);
        align-items:center;
      }

      .facturas-table-loading-copy{
        display:grid;
        gap:var(--space-xs, 7px);
      }

      .facturas-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:var(--skeleton-radius, var(--radius-md, 13px));
        background:var(--skeleton-bg, rgba(255,255,255,.050));
      }

      .facturas-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          var(--skeleton-shine, rgba(255,255,255,.095)),
          transparent
        );
        animation:facturasSkeleton 1.2s var(--ease-standard, ease-in-out) infinite;
      }

      .facturas-skeleton--avatar{
        inline-size:var(--avatar-size-lg, 44px);
        block-size:var(--avatar-size-lg, 44px);
        border-radius:var(--radius-pill, 999px);
      }

      .facturas-skeleton--xs{
        inline-size:120px;
        block-size:var(--skeleton-height-sm, 10px);
      }

      .facturas-skeleton--lg{
        inline-size:74%;
        block-size:var(--skeleton-height-md, 14px);
      }

      .facturas-skeleton--md{
        inline-size:56%;
        block-size:12px;
      }

      .facturas-skeleton--pill{
        inline-size:86px;
        block-size:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .facturas-skeleton--date{
        inline-size:124px;
        block-size:12px;
      }

      .facturas-skeleton--amount{
        inline-size:92px;
        block-size:30px;
      }

      .facturas-skeleton--ticket{
        inline-size:148px;
        block-size:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .facturas-skeleton--actions{
        inline-size:178px;
        block-size:calc((var(--btn-height-sm, 34px) * 2) + var(--space-2xs, 6px));
        border-radius:var(--radius-md, 12px);
      }

      .facturas-empty{
        display:grid;
        justify-items:center;
        gap:var(--space-xs, 8px);
        padding:var(--space-4xl, 44px) var(--space-lg, 20px) var(--space-5xl, 48px);
        text-align:center;
      }

      .facturas-empty-icon{
        inline-size:54px;
        block-size:54px;
        display:grid;
        place-items:center;
        border-radius:var(--radius-xl, 18px);
        border:1px solid var(--state-empty-border, rgba(148,163,184,.20));
        background:var(--state-empty-bg, rgba(148,163,184,.10));
        color:var(--state-empty-icon, var(--info, #94a3b8));
        box-shadow:var(--shadow-soft, 0 8px 18px rgba(0,0,0,.13));
      }

      .facturas-empty-icon svg{
        inline-size:24px;
        block-size:24px;
      }

      .facturas-empty-title{
        margin:0;
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .facturas-empty-text{
        margin:0;
        max-inline-size:58ch;
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .facturas-error{
        display:grid;
        justify-items:start;
        gap:var(--space-xs, 10px);
        padding:var(--space-xl, 24px) var(--space-xl, 22px);
        border-radius:var(--card-radius-lg, 22px);
        border:1px solid var(--border-error, rgba(239,68,68,.30));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          color-mix(in srgb, var(--error-bg, rgba(239,68,68,.10)) 46%, var(--card-bg, transparent));
        box-shadow:var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16));
      }

      .facturas-error-title{
        margin:0;
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .facturas-error-text{
        margin:0;
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      @keyframes facturasSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes facturasSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .facturas-hero,
      [data-theme="light"] .facturas-history{
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #6f59d9) 9%, transparent), transparent 38%),
          radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--info, #3b82a6) 7%, transparent), transparent 34%),
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #ffffff))));
      }

      [data-theme="light"] .facturas-stat-card{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--card-bg, var(--surface-elevated, #ffffff));
      }

      [data-theme="light"] .facturas-table tbody tr:nth-child(even) > td{
        background:rgba(23,32,51,.012);
      }

      [data-theme="light"] .facturas-table-row:hover > td{
        background:var(--data-table-row-hover, rgba(23,32,51,.023));
      }

      [data-theme="light"] .facturas-filter-pill.is-active,
      [data-theme="light"] .facturas-sort-pill.is-active{
        color:var(--accent-active, #533cb6);
        background:var(--accent-soft, rgba(111,89,217,.125));
        border-color:var(--accent-border-strong, rgba(111,89,217,.36));
      }

      [data-theme="light"] .facturas-search-input{
        color:var(--input-text, var(--text, #111827));
        background:var(--input-bg, rgba(255,255,255,.76));
        border-color:var(--input-border, var(--border-default, rgba(15,23,42,.10)));
      }

      [data-theme="light"] .facturas-search-icon,
      [data-theme="light"] .facturas-search-clear{
        color:var(--text-dim, rgba(15,23,42,.50));
      }

      [data-theme="light"] .facturas-search-clear:hover{
        color:var(--text-strong, #111827);
        background:var(--btn-secondary-bg-hover, rgba(15,23,42,.052));
      }

      [data-theme="light"] .facturas-chip--pending,
      [data-theme="light"] .facturas-chip--partial{
        color:var(--warning-hover, #9c6110);
        background:var(--warning-soft, rgba(192,122,22,.12));
        border-color:var(--border-warning, rgba(217,119,6,.245));
      }

      [data-theme="light"] .facturas-chip--draft{
        color:var(--text-muted, rgba(23,32,51,.70));
        background:var(--chip-bg, rgba(23,32,51,.040));
        border-color:var(--chip-border, rgba(23,32,51,.075));
      }

      [data-theme="light"] .facturas-chip--paid{
        color:var(--success-hover, #157a4f);
        background:var(--success-soft, rgba(31,157,104,.12));
        border-color:var(--border-success, rgba(22,163,74,.245));
      }

      [data-theme="light"] .facturas-chip--overdue,
      [data-theme="light"] .facturas-chip--cancelled{
        color:var(--error-hover, #b52a39);
        background:var(--error-soft, rgba(216,60,77,.12));
        border-color:var(--border-error, rgba(220,38,38,.245));
      }

      [data-theme="light"] .facturas-incidencia-link{
        color:var(--accent-active, #533cb6);
        background:var(--accent-soft, rgba(111,89,217,.125));
        border-color:var(--accent-border-strong, rgba(111,89,217,.36));
      }

      @media (max-width: 1240px){
        .facturas-filters{
          grid-template-columns:1fr;
        }

        .facturas-sort-pills{
          justify-content:flex-start;
          min-inline-size:0;
        }

        .facturas-search{
          max-inline-size:560px;
        }
      }

      @media (max-width: 1180px){
        :where(.facturas-view-root, [data-facturas-scope]){
          --fac-table-min-width:1010px;
          --fac-actions-width:170px;
        }

        .facturas-hero{
          padding:var(--space-lg, 20px);
        }

        .facturas-hero-top{
          grid-template-columns:1fr;
        }

        .facturas-hero-actions{
          justify-content:flex-start;
        }

        .facturas-stats{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }

        .facturas-actions{
          grid-template-columns:repeat(2, minmax(72px, 1fr));
        }
      }

      @media (max-width: 760px){
        :where(.facturas-view-root, [data-facturas-scope]){
          --fac-table-min-width:980px;
          --fac-actions-width:164px;
          gap:var(--space-md, 16px);
        }

        .facturas-hero{
          padding:var(--space-lg, 18px) var(--space-md, 16px);
          border-radius:var(--radius-xl, 18px);
        }

        .facturas-history{
          border-radius:var(--radius-xl, 18px);
        }

        .facturas-history-head{
          grid-template-columns:1fr;
          padding:var(--space-md, 14px) var(--space-md, 14px) var(--space-sm, 12px);
        }

        .facturas-pagination{
          justify-content:flex-start;
        }

        .facturas-stats{
          grid-template-columns:1fr;
        }

        .facturas-page-title{
          font-size:clamp(var(--font-3xl, 24px), 8vw, var(--font-4xl, 34px));
          line-height:1;
        }

        .facturas-page-subtitle{
          font-size:var(--font-base, 14px);
        }

        .facturas-hero-actions{
          inline-size:100%;
        }

        .facturas-btn{
          flex:1 1 auto;
        }

        .facturas-search{
          max-inline-size:none;
        }
      }

      @media (max-width: 520px){
        .facturas-meta-pill{
          inline-size:100%;
          justify-content:center;
        }

        .facturas-hero-actions{
          display:grid;
          grid-template-columns:1fr;
        }

        .facturas-btn{
          inline-size:100%;
        }

        .facturas-filter-pills,
        .facturas-sort-pills{
          margin-inline:-2px;
        }
      }

      @media (prefers-reduced-motion: reduce){
        :where(.facturas-view-root, [data-facturas-scope]) *,
        :where(.facturas-view-root, [data-facturas-scope]) *::before,
        :where(.facturas-view-root, [data-facturas-scope]) *::after{
          animation:none !important;
          transition:none !important;
        }
      }
    </style>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);

  const rows = sortFacturasNewestFirst(
    safeArray(first(data.items, data.rows, data.facturas, data.invoices))
  );

  const runtime = safeObject(data.state);

  const stats = computeStats(rows);
  const canCreateFactura = isAdminState(runtime);

  const updatedAt = first(
    data.lastUpdatedAt,
    runtime.lastSyncAt,
    data.updatedAt,
    runtime.updatedAt,
    ...rows.map((item) => getUpdatedAt(item))
  );

  const remoteCount = Math.max(
    stats.total,
    safeNumber(
      first(
        data.remoteCount,
        data.totalCount,
        data.totalMatched,
        runtime.remoteCount,
        runtime.totalCount,
        runtime.totalMatched,
        stats.total
      ),
      stats.total
    )
  );

  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const loading = Boolean(first(runtime.loading, data.loading));
  const creating = Boolean(first(runtime.creating, runtime.creatingFactura, data.creating));

  const includeStyles = data.includeStyles !== false;

  return `
    ${renderMaybeStyles(includeStyles)}

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
            data-action="export"
            data-facturas-action="export"
            ${loading || refreshing || !rows.length ? "disabled" : ""}
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
                  data-action="create-factura"
                  data-facturas-action="create-factura"
                  aria-label="Crear nueva factura"
                  ${creating ? 'disabled aria-busy="true"' : ""}
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
            data-action="refresh"
            data-facturas-action="refresh"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
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

export function renderLoadingState({ includeStyles = false } = {}) {
  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="facturas-history">
      ${renderTableLoading(DEFAULT_PAGE_SIZE)}
    </section>
  `;
}

export function renderErrorState(
  message = "No se pudieron cargar las facturas.",
  { includeStyles = false } = {}
) {
  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="facturas-error">
      <h3 class="facturas-error-title">No se pudo renderizar la vista de facturas</h3>
      <p class="facturas-error-text">${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}</p>
    </section>
  `;
}

/* =========================================================
   MAIN TABLE
========================================================= */

export function renderCards(input = {}) {
  const data = safeObject(input);

  const items = safeArray(first(data.items, data.rows, data.facturas, data.invoices));
  const runtime = safeObject(data.state);

  const pagination = getPagination(items, data);

  const loading = Boolean(first(runtime.loading, data.loading));
  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const hasError = Boolean(safeText(first(runtime.error, data.error), ""));

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;
  const includeStyles = Boolean(data.includeStyles);

  const activeFilterLabel = getFilterLabel(pagination.activeFilter);
  const searchQuery = pagination.searchQuery;

  const activeCriteria = [
    pagination.activeFilter !== "all" ? activeFilterLabel : "",
    searchQuery ? `búsqueda “${searchQuery}”` : "",
  ].filter(Boolean);

  const subtitle = showInitialLoading
    ? "Cargando facturas..."
    : pagination.filtering
      ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · ${activeCriteria.join(" · ")}`
      : `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`;

  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="facturas-history">
      <div class="facturas-history-head">
        <div class="facturas-history-copy">
          <h2 class="facturas-history-title">Historial de facturas</h2>
          <p class="facturas-history-subtitle">
            ${escapeHtml(subtitle)}
          </p>
        </div>

        ${renderPagination(pagination, runtime)}
        ${renderFilters({ ...data, items }, pagination)}
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
                          <col style="width:33%;">
                          <col style="width:10%;">
                          <col style="width:14%;">
                          <col style="width:12%;">
                          <col style="width:16%;">
                          <col style="width:15%;">
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

/* =========================================================
   ALIAS PARA COMPATIBILIDAD
========================================================= */

export const renderTable = renderCards;

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderFacturasTemplate(input = {}) {
  const data = safeObject(input);

  const items = safeArray(first(data.items, data.rows, data.facturas, data.invoices));
  const rows = sortFacturasNewestFirst(items);
  const runtime = safeObject(data.state);

  if (runtime.error && !rows.length) {
    return `
      <section class="facturas-view-root" data-facturas-scope="true">
        ${renderStyles()}
        ${renderErrorState(runtime.error, { includeStyles: false })}
      </section>
    `;
  }

  const payload = {
    ...data,
    items: rows,
    state: runtime,
    includeStyles: false,
  };

  return `
    <section class="facturas-view-root" data-facturas-scope="true">
      ${renderStyles()}
      ${renderHeader(payload)}
      ${renderCards(payload)}
    </section>
  `;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  renderHeader,
  renderCards,
  renderTable,
  renderLoadingState,
  renderErrorState,
  renderFacturasTemplate,
};
