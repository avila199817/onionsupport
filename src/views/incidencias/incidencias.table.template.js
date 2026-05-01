/* =========================================================
   Onion SPA - Incidencias Table Template
   Archivo: src/views/incidencias/incidencias.table.template.js

   FINAL PRODUCTION TEMPLATE · LIST VIEW · EXTREME SAAS MODE · 12/10
   PATCH · TABLE ALIGNMENT PREMIUM
   PATCH · FILTER PILLS READY · SEARCH REMOVED
   PATCH · CREATE BUTTON ACCENT LOCKED
   PATCH · FACTURAS VISUAL SYSTEM INSPIRED
   PATCH · TABLE SYSTEM LOCK · NO GLOBAL CSS BLEED
   PATCH · TOKEN ALIGNED · LIGHT/DARK PREMIUM
   PATCH · ROW ACCENT SAFE WITHOUT TR PSEUDO

   RESPONSABILIDADES:
   - render del hero/header de incidencias
   - render de tabla productiva con paginación real
   - render de filtros visuales compatibles con state/props/bindings
   - compatibilidad con IncidenciasView.js
   - estado loading visual en "Ver detalle" sin mover tabla
   - estado loading visual en "Crear nueva incidencia"
   - estado loading visual en refresh / retry / export
   - título compacto y responsive
   - fechas siempre en una sola línea
   - botón "Ver detalle" mantiene tamaño fijo durante loading
   - loader centrado dentro del botón sin cambiar layout
   - loading de tabla suave en carga / refresh
   - acciones compatibles con data-incidencias-action y data-action
   - pintar importe total de facturas asociadas al ticket
   - avatares fallback con colores intensos pseudo-RNG estables
   - dark/light mode 100% conectado a variables.css + ui.css
   - chips de estado alineados con tokens globales y contraste real
   - tabla blindada contra resets / layout / ui global
   - diseño premium coherente con Facturas

   HARDENING PRO:
   - no depende de imports externos
   - tolera payload heterogéneo
   - soporta state + props directas
   - paginación defensiva
   - responsive robusto
   - columna prioridad eliminada de tabla, pero badge interno conservado
   - importe blindado contra normalizadores intermedios
   - loading inline icon-only centrado sin cambiar tamaño del botón
   - CSS aplicable a .incidencias-view-root y [data-incidencias-scope]
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_PAGE_SIZE = 5;
const DEFAULT_CURRENCY = "EUR";
const STYLE_ID = "onion-incidencias-table-template-styles-v12";

const FILTERS = Object.freeze([
  { key: "all", label: "Todas" },
  { key: "open", label: "Abiertas" },
  { key: "pending", label: "Pendientes" },
  { key: "progress", label: "En proceso" },
  { key: "resolved", label: "Resueltas" },
  { key: "closed", label: "Cerradas" },
  { key: "urgent", label: "Urgentes" },
  { key: "attachments", label: "Con adjuntos" },
  { key: "billed", label: "Con importe" },
]);

/* =========================================================
   HELPERS
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
  if (!value) return "—";

  const ts = toTimestamp(value);
  if (!ts) return "—";

  try {
    return getDateTimeFormatter().format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatDateShort(value = null) {
  if (!value) return "—";

  const ts = toTimestamp(value);
  if (!ts) return "—";

  try {
    return getDateFormatter().format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  if (!value) return "Sin fecha";

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

function formatLastUpdate(value = null) {
  if (!value) return "Sin fecha";

  const ts = toTimestamp(value);
  if (!ts) return "Sin fecha";

  const diffHours = Math.abs(Date.now() - ts) / 3600000;

  if (diffHours <= 72) {
    return formatRelativeDate(value);
  }

  return formatDateTime(value);
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
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
    activity: `<svg ${common}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  };

  return icons[name] || "";
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
  const ticketId = getTicketId(item);
  const clientName = getClientName(item);
  const seed = `${ticketId}|${clientName}`;
  const [a, b] = AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length];

  return [
    `--inc-avatar-a:${a}`,
    `--inc-avatar-b:${b}`,
    `--inc-avatar-bg:linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
  ].join(";");
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getTicketId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.code,
      item.numero,
      item.ticketCode,
      item.id,
      item._id,
      raw.ticketId,
      raw.incidenciaId,
      raw.code,
      raw.numero,
      raw.ticketCode,
      raw.id,
      raw._id
    ),
    "INC-SIN-ID"
  );
}

function getSubject(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.subject,
      item.title,
      item.asunto,
      item.name,
      item.preview,
      raw.subject,
      raw.title,
      raw.asunto,
      raw.name,
      raw.preview
    ),
    "Incidencia sin asunto"
  );
}

function getDescription(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.description,
      item.descripcion,
      item.message,
      item.body,
      item.preview,
      item.text,
      raw.description,
      raw.descripcion,
      raw.message,
      raw.body,
      raw.preview,
      raw.text
    ),
    "Sin descripción."
  );
}

function getClientName(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.requesterName,
      item.requesterSnapshot?.name,
      item.requesterSnapshot?.displayName,
      item.createdBy?.name,
      item.createdBy?.displayName,
      item.cliente?.nombreContacto,
      item.cliente?.nombre,
      item.cliente?.name,
      item.cliente?.displayName,
      item.client?.name,
      item.customer?.name,
      item.receptor?.name,
      item.name,
      raw.clientName,
      raw.clienteNombre,
      raw.requesterName,
      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.displayName,
      raw.createdBy?.name,
      raw.createdBy?.displayName,
      raw.cliente?.nombreContacto,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.cliente?.displayName,
      raw.client?.name,
      raw.customer?.name,
      raw.receptor?.name,
      raw.name
    ),
    "Cliente"
  );
}

function getClientEmail(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.email,
      item.emailCliente,
      item.requesterSnapshot?.email,
      item.createdBy?.email,
      item.cliente?.email,
      item.cliente?.emailLower,
      item.client?.email,
      item.customer?.email,
      item.receptor?.email,
      raw.clientEmail,
      raw.clienteEmail,
      raw.email,
      raw.emailCliente,
      raw.requesterSnapshot?.email,
      raw.createdBy?.email,
      raw.cliente?.email,
      raw.cliente?.emailLower,
      raw.client?.email,
      raw.customer?.email,
      raw.receptor?.email
    ),
    ""
  ).toLowerCase();
}

function getAvatarUrl(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.requesterSnapshot?.avatar,
      item.requesterSnapshot?.avatarUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      item.customer?.avatar,
      item.customer?.avatarUrl,
      raw.clientAvatar,
      raw.avatar,
      raw.avatarUrl,
      raw.requesterSnapshot?.avatar,
      raw.requesterSnapshot?.avatarUrl,
      raw.cliente?.avatar,
      raw.cliente?.avatarUrl,
      raw.client?.avatar,
      raw.client?.avatarUrl,
      raw.customer?.avatar,
      raw.customer?.avatarUrl
    ),
    ""
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

function getStatusRaw(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.status,
    item.estado,
    item.state,
    item.lifecycle?.status,
    raw.status,
    raw.estado,
    raw.state,
    raw.lifecycle?.status
  );
}

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["pending", "pendiente", "new", "nueva", "nuevo", "created"].includes(key)) {
    return "pending";
  }

  if (["open", "abierta", "abierto"].includes(key)) {
    return "open";
  }

  if (
    [
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "proceso",
      "working",
      "trabajando",
      "assigned",
      "asignada",
      "asignado",
    ].includes(key)
  ) {
    return "progress";
  }

  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) {
    return "resolved";
  }

  if (
    [
      "closed",
      "cerrada",
      "cerrado",
      "cancelled",
      "cancelada",
      "cancelado",
      "archived",
      "archivada",
    ].includes(key)
  ) {
    return "closed";
  }

  return "pending";
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  if (key === "open") return "Abierta";
  if (key === "pending") return "Pendiente";
  if (key === "progress") return "En proceso";
  if (key === "resolved") return "Resuelta";
  if (key === "closed") return "Cerrada";

  return safeText(value, "Pendiente");
}

function getPriorityRaw(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.priority,
    item.prioridad,
    item.severity,
    item.urgency,
    item.sla?.priority,
    raw.priority,
    raw.prioridad,
    raw.severity,
    raw.urgency,
    raw.sla?.priority,
    "medium"
  );
}

function getPriorityKey(item = {}) {
  const key = normalizeKey(getPriorityRaw(item));

  if (["critical", "critica", "crítica", "critico", "crítico", "p0"].includes(key)) {
    return "critical";
  }

  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) {
    return "urgent";
  }

  if (["medium", "media", "normal", "p2"].includes(key)) {
    return "medium";
  }

  if (["low", "baja", "minor", "p3"].includes(key)) {
    return "low";
  }

  return "medium";
}

function getPriorityLabel(item = {}) {
  const key = getPriorityKey(item);

  if (key === "critical") return "Crítica";
  if (key === "urgent") return "Urgente";
  if (key === "medium") return "Media";
  if (key === "low") return "Baja";

  return "Media";
}

function getCategory(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.category,
      item.categoria,
      item.type,
      item.tipo,
      item.subcategory,
      item.subcategoria,
      raw.category,
      raw.categoria,
      raw.type,
      raw.tipo,
      raw.subcategory,
      raw.subcategoria
    ),
    "Soporte"
  );
}

function getAssignedTo(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.assignedTo?.name,
      item.assignedTo?.displayName,
      item.assignment?.agentName,
      item.assignment?.name,
      item.tecnico?.name,
      item.tecnico?.displayName,
      item.tecnico,
      item.agent,
      raw.assignedTo?.name,
      raw.assignedTo?.displayName,
      raw.assignment?.agentName,
      raw.assignment?.name,
      raw.tecnico?.name,
      raw.tecnico?.displayName,
      raw.tecnico,
      raw.agent
    ),
    "Sin asignar"
  );
}

function getImporteAmount(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.total,
    item.amount,
    item.importe,
    item.price,
    item.facturasTotal,
    item.invoicesTotal,
    item.importeFacturas,
    item.invoiceTotal,
    item.linkedInvoices?.total,
    item.linkedInvoices?.amount,
    item.linkedInvoices?.importe,
    item.meta?.invoicesTotal,
    item.meta?.invoiceTotal,
    raw.total,
    raw.amount,
    raw.importe,
    raw.price,
    raw.facturasTotal,
    raw.invoicesTotal,
    raw.importeFacturas,
    raw.invoiceTotal,
    raw.linkedInvoices?.total,
    raw.linkedInvoices?.amount,
    raw.linkedInvoices?.importe,
    raw.meta?.invoicesTotal,
    raw.meta?.invoiceTotal
  );
}

function getImporteCurrency(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.currency,
      item.moneda,
      item.linkedInvoices?.currency,
      item.linkedInvoices?.moneda,
      item.meta?.invoiceCurrency,
      item.meta?.currency,
      item.meta?.moneda,
      raw.currency,
      raw.moneda,
      raw.linkedInvoices?.currency,
      raw.linkedInvoices?.moneda,
      raw.meta?.invoiceCurrency,
      raw.meta?.currency,
      raw.meta?.moneda,
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  );
}

function getPaymentStatusKey(item = {}) {
  const raw = safeObject(item?.raw);

  const key = normalizeKey(
    first(
      item.paymentStatus,
      item.estadoPago,
      item.linkedInvoices?.paymentStatus,
      item.linkedInvoices?.estadoPago,
      raw.paymentStatus,
      raw.estadoPago,
      raw.linkedInvoices?.paymentStatus,
      raw.linkedInvoices?.estadoPago
    )
  );

  if (["paid", "pagada", "pagado", "cobrada", "cobrado"].includes(key)) return "paid";
  if (["pending", "pendiente", "unpaid"].includes(key)) return "pending";
  if (["partial", "parcial", "pago_parcial"].includes(key)) return "partial";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";

  return "";
}

function getImporteLabel(item = {}) {
  const amount = getImporteAmount(item);

  if (amount !== null && amount !== undefined && amount !== "") {
    const numericAmount = safeNumber(amount, NaN);

    if (Number.isFinite(numericAmount)) {
      return formatMoney(numericAmount, getImporteCurrency(item));
    }
  }

  const paymentKey = getPaymentStatusKey(item);

  if (paymentKey === "paid") return "Pagado";
  if (paymentKey === "pending") return "Pendiente";
  if (paymentKey === "partial") return "Parcial";
  if (paymentKey === "overdue") return "Vencido";

  return "—";
}

function getCreatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.createdAt,
    item.fechaCreacion,
    item.createdAtES,
    item.date,
    item.lifecycle?.createdAt,
    raw.createdAt,
    raw.fechaCreacion,
    raw.createdAtES,
    raw.date,
    raw.lifecycle?.createdAt
  );
}

function getUpdatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.updatedAt,
    item.lastUpdateAt,
    item.ultimaNovedad,
    item.modifiedAt,
    item.closedAt,
    item.createdAt,
    item.lifecycle?.updatedAt,
    item.lifecycle?.lastUpdateAt,
    item.audit?.updatedAt,
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

function compareIncidenciasNewestFirst(a = {}, b = {}) {
  const diff = getSortTimestamp(b) - getSortTimestamp(a);

  if (diff !== 0) return diff;

  return safeText(getTicketId(b), "").localeCompare(
    safeText(getTicketId(a), ""),
    "es",
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

function sortIncidenciasNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareIncidenciasNewestFirst);
}

function getAttachmentsCount(item = {}) {
  const raw = safeObject(item?.raw);

  const attachments = first(
    item.attachments,
    item.files,
    item.adjuntos,
    raw.attachments,
    raw.files,
    raw.adjuntos
  );

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(
    first(
      item.attachmentsCount,
      item.filesCount,
      item.adjuntosCount,
      raw.attachmentsCount,
      raw.filesCount,
      raw.adjuntosCount,
      0
    ),
    0
  );
}

function isClosedLike(item = {}) {
  return ["closed", "resolved"].includes(getStatusKey(getStatusRaw(item)));
}

function isOpenLike(item = {}) {
  return ["open", "pending", "progress"].includes(getStatusKey(getStatusRaw(item)));
}

function isUrgentLike(item = {}) {
  return ["urgent", "critical"].includes(getPriorityKey(item));
}

function hasImporteLike(item = {}) {
  const amount = safeNumber(getImporteAmount(item), NaN);
  return Number.isFinite(amount) && amount > 0;
}

/* =========================================================
   FILTERS
========================================================= */

function normalizeFilter(value = "") {
  const key = normalizeKey(value);

  if (!key || key === "todos" || key === "todas") return "all";

  if (
    [
      "all",
      "open",
      "pending",
      "progress",
      "in_progress",
      "resolved",
      "closed",
      "urgent",
      "attachments",
      "billed",
    ].includes(key)
  ) {
    return key === "in_progress" ? "progress" : key;
  }

  return "all";
}

function getActiveFilter(input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  return normalizeFilter(
    first(
      data.filter,
      data.statusFilter,
      data.activeFilter,
      runtime.filter,
      runtime.statusFilter,
      runtime.activeFilter,
      "all"
    )
  );
}

function itemMatchesFilter(item = {}, filter = "all") {
  const key = normalizeFilter(filter);
  const statusKey = getStatusKey(getStatusRaw(item));

  if (key === "all") return true;
  if (key === "open") return statusKey === "open";
  if (key === "pending") return statusKey === "pending";
  if (key === "progress") return statusKey === "progress";
  if (key === "resolved") return statusKey === "resolved";
  if (key === "closed") return statusKey === "closed";
  if (key === "urgent") return isUrgentLike(item);
  if (key === "attachments") return getAttachmentsCount(item) > 0;
  if (key === "billed") return hasImporteLike(item);

  return true;
}

function filterAndSortIncidencias(items = [], input = {}) {
  const activeFilter = getActiveFilter(input);

  return sortIncidenciasNewestFirst(items).filter((item) => {
    return itemMatchesFilter(item, activeFilter);
  });
}

function isFilterActive(input = {}) {
  return getActiveFilter(input) !== "all";
}

function computeFilterCounts(items = []) {
  const rows = safeArray(items);

  return FILTERS.reduce((acc, filter) => {
    acc[filter.key] = rows.filter((item) => itemMatchesFilter(item, filter.key)).length;
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
      const amount = safeNumber(getImporteAmount(item), 0);

      acc.total += 1;
      acc.totalImporte += amount;
      acc.attachmentsCount += getAttachmentsCount(item);

      if (isOpenLike(item)) acc.openCount += 1;
      if (isClosedLike(item)) acc.closedCount += 1;
      if (isUrgentLike(item)) acc.urgentCount += 1;

      return acc;
    },
    {
      total: 0,
      openCount: 0,
      closedCount: 0,
      urgentCount: 0,
      attachmentsCount: 0,
      totalImporte: 0,
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
        runtime.incidenciasPageSize,
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

  const allItems = filterAndSortIncidencias(items, data);
  const pageSize = normalizePageSize(data);
  const filtering = isFilterActive(data);

  const remoteTotal = Math.max(
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        runtime.totalCount,
        runtime.remoteCount,
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
        runtime.incidenciasPage,
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
    <span class="incidencias-inline-loading">
      <span class="incidencias-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="incidencias-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="incidencias-loader-only"
      role="status"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      data-tooltip="${escapeHtml(label)}"
    >
      <span class="incidencias-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = getInitials(fullName);
  const avatarUrl = getAvatarUrl(item);
  const avatarStyle = getAvatarStyle(item);

  if (avatarUrl) {
    return `
      <div
        class="incidencias-avatar"
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
        <span class="incidencias-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="incidencias-avatar incidencias-avatar--fallback"
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      style="${escapeHtml(avatarStyle)}"
    >
      <span class="incidencias-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const rawStatus = getStatusRaw(item);
  const key = getStatusKey(rawStatus);
  const label = getStatusLabel(rawStatus);

  return `
    <span class="incidencias-chip incidencias-chip--${escapeHtml(key)}">
      <span class="incidencias-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderPriorityBadge(item = {}) {
  const key = getPriorityKey(item);
  const label = getPriorityLabel(item);

  return `
    <span
      class="incidencias-mini-badge incidencias-mini-badge--${escapeHtml(key)}"
      title="${escapeHtml(`Prioridad ${label}`)}"
      data-tooltip="${escapeHtml(`Prioridad ${label}`)}"
    >
      ${key === "critical" || key === "urgent" ? icon("alert") : icon("activity")}
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAssignedBadge(item = {}) {
  const assigned = getAssignedTo(item);

  return `
    <span
      class="incidencias-mini-badge incidencias-mini-badge--agent"
      title="${escapeHtml(`Técnico · ${assigned}`)}"
      data-tooltip="${escapeHtml(`Técnico · ${assigned}`)}"
    >
      ${icon("users")}
      ${escapeHtml(assigned)}
    </span>
  `;
}

function renderImporteChip(item = {}) {
  const label = getImporteLabel(item);
  const isMoney = /€|EUR|\$|USD|£|GBP/i.test(label);
  const paymentKey = getPaymentStatusKey(item) || "idle";

  if (isMoney) {
    return `
      <span class="incidencias-importe incidencias-importe--money incidencias-importe--${escapeHtml(paymentKey)}">
        ${icon("euro")}
        ${escapeHtml(label)}
      </span>
    `;
  }

  return `
    <span class="incidencias-importe incidencias-importe--status incidencias-importe--${escapeHtml(paymentKey)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderActionButton({
  action = "detail",
  ticketId = "",
  label = "Ver detalle",
  loadingLabel = "Cargando detalle",
  loading = false,
  disabled = false,
  iconName = "eye",
  tooltip = "",
} = {}) {
  const finalDisabled = disabled || loading;
  const finalTooltip = tooltip || label;

  return `
    <button
      type="button"
      class="incidencias-detail-btn${loading ? " is-loading" : ""}"
      data-incidencias-action="${escapeHtml(action)}"
      data-action="${escapeHtml(action === "detail" ? "open-ticket" : action)}"
      data-ticket-id="${escapeHtml(ticketId)}"
      title="${escapeHtml(finalTooltip)}"
      data-tooltip="${escapeHtml(finalTooltip)}"
      ${finalDisabled ? 'disabled aria-disabled="true"' : ""}
      ${loading ? 'aria-busy="true"' : ""}
    >
      ${
        loading
          ? renderLoaderOnly(loadingLabel)
          : `
            <span class="incidencias-action-icon">${icon(iconName)}</span>
            <span class="incidencias-btn-text">${escapeHtml(label)}</span>
          `
      }
    </button>
  `;
}

function renderRow(item = {}, state = {}) {
  const runtime = safeObject(state);

  const ticketId = getTicketId(item);
  const subject = getSubject(item);
  const description = getDescription(item);
  const clientName = getClientName(item);
  const clientEmail = getClientEmail(item) || "Sin email";
  const createdAtRaw = getCreatedAt(item);
  const updatedAtRaw = getUpdatedAt(item);
  const createdAt = formatDateTime(createdAtRaw);
  const updatedAt = formatLastUpdate(updatedAtRaw);
  const attachmentsCount = getAttachmentsCount(item);
  const category = getCategory(item);
  const statusKey = getStatusKey(getStatusRaw(item));

  const openingTicketId = safeText(
    first(
      runtime.openingTicketId,
      runtime.openingIncidenciaId,
      runtime.detailTicketId,
      runtime.loadingTicketId
    ),
    ""
  );

  const isOpening = openingTicketId === ticketId;

  return `
    <tr
      class="incidencias-row incidencias-row--${escapeHtml(statusKey)}"
      data-ticket-row="true"
      data-ticket-id="${escapeHtml(ticketId)}"
      data-incidencia-id="${escapeHtml(ticketId)}"
    >
      <td class="incidencias-cell incidencias-cell--main">
        <div class="incidencias-main">
          ${renderAvatar(item)}

          <div class="incidencias-main-copy">
            <div class="incidencias-ticket-line">
              <span class="incidencias-ticket-id">${escapeHtml(ticketId)}</span>
              <span class="incidencias-category-pill">${escapeHtml(category)}</span>
            </div>

            <div class="incidencias-ticket-subject">${escapeHtml(subject)}</div>
            <div class="incidencias-ticket-description">${escapeHtml(description)}</div>

            <div class="incidencias-client-line">
              <span class="incidencias-client-name">${escapeHtml(clientName)}</span>
              <span class="incidencias-client-separator">·</span>
              <span class="incidencias-client-email">${escapeHtml(clientEmail)}</span>
            </div>

            <div class="incidencias-row-badges">
              ${renderPriorityBadge(item)}
              ${renderAssignedBadge(item)}
            </div>
          </div>
        </div>
      </td>

      <td class="incidencias-cell incidencias-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--date">
        <span
          class="incidencias-date-inline"
          title="${escapeHtml(createdAt)}"
          data-tooltip="${escapeHtml(createdAt)}"
        >
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--date">
        <span
          class="incidencias-date-inline"
          title="${escapeHtml(formatDateTime(updatedAtRaw))}"
          data-tooltip="${escapeHtml(formatDateTime(updatedAtRaw))}"
        >
          ${escapeHtml(updatedAt)}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--importe">
        ${renderImporteChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--attachments">
        <span
          class="incidencias-attachments-pill"
          title="${escapeHtml(`${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`)}"
          data-tooltip="${escapeHtml(`${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`)}"
        >
          ${icon("paperclip")}
          ${escapeHtml(String(attachmentsCount))}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--actions">
        ${renderActionButton({
          ticketId,
          loading: isOpening,
          label: "Detalle",
          loadingLabel: "Cargando detalle",
          iconName: "eye",
          tooltip: "Abrir detalle de incidencia",
        })}
      </td>
    </tr>
  `;
}

function renderPagination(pagination = {}, state = {}) {
  const runtime = safeObject(state);
  const loading = Boolean(runtime.loading);
  const refreshing = Boolean(runtime.refreshing);

  return `
    <div class="incidencias-pagination" aria-label="Paginación de incidencias">
      <button
        type="button"
        class="incidencias-pagination-btn"
        data-incidencias-action="prev-page"
        data-action="prev-page"
        data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
        ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Anterior
      </button>

      <span class="incidencias-pagination-status">
        ${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}
      </span>

      <button
        type="button"
        class="incidencias-pagination-btn incidencias-pagination-btn--next"
        data-incidencias-action="next-page"
        data-action="next-page"
        data-page="${escapeHtml(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
        ${!pagination.hasNext || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Siguiente
      </button>
    </div>
  `;
}

function renderFilters(input = {}, pagination = {}) {
  const data = safeObject(input);
  const items = safeArray(first(data.items, data.rows, data.tickets, data.incidencias));
  const counts = computeFilterCounts(items);
  const activeFilter = normalizeFilter(pagination.activeFilter || getActiveFilter(data));
  const filtering = activeFilter !== "all";

  return `
    <div class="incidencias-filters" aria-label="Filtros de incidencias">
      <div class="incidencias-filter-pills">
        ${FILTERS.map((filter) => {
          const isActive = filter.key === activeFilter;
          const count = counts[filter.key] ?? 0;

          return `
            <button
              type="button"
              class="incidencias-filter-pill${isActive ? " is-active" : ""}"
              data-incidencias-action="filter"
              data-action="filter-incidencias"
              data-filter="${escapeHtml(filter.key)}"
              data-filter-status="${escapeHtml(filter.key)}"
              aria-pressed="${isActive ? "true" : "false"}"
            >
              <span>${escapeHtml(filter.label)}</span>
              <strong>${escapeHtml(String(count))}</strong>
            </button>
          `;
        }).join("")}
      </div>

      ${
        filtering
          ? `
            <button
              type="button"
              class="incidencias-filter-reset"
              data-incidencias-action="clear-filters"
              data-action="clear-filters"
            >
              ${icon("close")}
              Limpiar filtros
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderEmptyState({ hasError = false, filtering = false } = {}) {
  return `
    <div class="incidencias-empty">
      <div class="incidencias-empty-icon" aria-hidden="true">
        ${hasError ? icon("alert") : icon("ticket")}
      </div>

      <h3 class="incidencias-empty-title">
        ${
          hasError
            ? "No se pudieron cargar las incidencias"
            : filtering
              ? "No hay incidencias con este filtro"
              : "No hay incidencias para mostrar"
        }
      </h3>

      <p class="incidencias-empty-text">
        ${
          hasError
            ? "Puedes reintentar la carga desde el botón de actualizar."
            : filtering
              ? "Cambia el filtro activo o limpia filtros para volver al historial completo."
              : "Cuando haya solicitudes registradas aparecerán aquí con su estado, seguimiento, adjuntos, facturación asociada y acciones disponibles."
        }
      </p>

      ${
        hasError
          ? `
            <button
              type="button"
              class="incidencias-btn incidencias-btn--primary"
              data-incidencias-action="retry"
              data-action="retry"
            >
              ${icon("refresh")}
              <span class="incidencias-btn-text">Reintentar</span>
            </button>
          `
          : filtering
            ? `
              <button
                type="button"
                class="incidencias-btn"
                data-incidencias-action="clear-filters"
                data-action="clear-filters"
              >
                ${icon("close")}
                <span class="incidencias-btn-text">Limpiar filtros</span>
              </button>
            `
            : ""
      }
    </div>
  `;
}

function renderTableLoading(rows = DEFAULT_PAGE_SIZE) {
  return `
    <div class="incidencias-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
        .map(
          () => `
            <div class="incidencias-table-loading-row">
              <div class="incidencias-skeleton incidencias-skeleton--avatar"></div>

              <div class="incidencias-table-loading-copy">
                <div class="incidencias-skeleton incidencias-skeleton--xs"></div>
                <div class="incidencias-skeleton incidencias-skeleton--lg"></div>
                <div class="incidencias-skeleton incidencias-skeleton--md"></div>
              </div>

              <div class="incidencias-skeleton incidencias-skeleton--pill"></div>
              <div class="incidencias-skeleton incidencias-skeleton--date"></div>
              <div class="incidencias-skeleton incidencias-skeleton--date"></div>
              <div class="incidencias-skeleton incidencias-skeleton--amount"></div>
              <div class="incidencias-skeleton incidencias-skeleton--attach"></div>
              <div class="incidencias-skeleton incidencias-skeleton--btn"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="incidencias-refresh-overlay" aria-live="polite">
      <div class="incidencias-refresh-card">
        ${renderSpinner("Actualizando historial...")}
      </div>
    </div>
  `;
}

/* =========================================================
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style id="${STYLE_ID}">
      :where(.incidencias-view-root, [data-incidencias-scope]){
        --inc-row-accent:var(--accent, #6f59d9);
        --inc-row-accent-soft:var(--accent-soft, rgba(111,89,217,.12));
        --inc-create-bg:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #6f59d9 0%, #5f45d8 55%, #4f37bf 100%)));
        --inc-create-bg-hover:var(--inc-create-bg);
        --inc-create-border:var(--btn-primary-border, color-mix(in srgb, var(--accent, #6f59d9) 46%, transparent));
        --inc-table-row-height:88px;

        display:grid;
        gap:var(--view-section-gap, var(--space-lg, 18px));
        color:var(--text, #f5f5f5);
        font-family:var(--font-family, inherit);
        min-inline-size:0;
        inline-size:100%;
        container-type:inline-size;
      }

      :where(.incidencias-view-root, [data-incidencias-scope]) *,
      :where(.incidencias-view-root, [data-incidencias-scope]) *::before,
      :where(.incidencias-view-root, [data-incidencias-scope]) *::after{
        box-sizing:border-box;
      }

      .incidencias-hero{
        position:relative;
        overflow:hidden;
        border-radius:var(--view-hero-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--view-hero-border, var(--panel-border, var(--border-default, rgba(255,255,255,.08))));
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #6f59d9) 12%, transparent), transparent 38%),
          radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--info, #3b82a6) 10%, transparent), transparent 34%),
          radial-gradient(circle at 68% 110%, color-mix(in srgb, var(--success, #22c55e) 7%, transparent), transparent 36%),
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #262626))));
        box-shadow:var(--view-hero-shadow, var(--panel-shadow, var(--shadow-md, 0 14px 30px rgba(0,0,0,.22))));
        padding:var(--space-xl, 22px) var(--space-xl, 24px);
        isolation:isolate;
        min-inline-size:0;
      }

      .incidencias-hero::after{
        content:"";
        position:absolute;
        inset:auto -8% -38% 48%;
        block-size:220px;
        pointer-events:none;
        background:radial-gradient(circle, color-mix(in srgb, var(--accent, #6f59d9) 10%, transparent), transparent 68%);
        filter:blur(10px);
        opacity:.82;
        z-index:0;
      }

      .incidencias-hero > *{
        position:relative;
        z-index:1;
      }

      .incidencias-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-lg, 18px);
        align-items:start;
      }

      .incidencias-hero-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-xs, 10px);
      }

      .incidencias-page-title{
        margin:0;
        max-inline-size:100%;
        font-size:clamp(var(--font-3xl, 24px), 2.6vw, var(--font-5xl, 40px));
        line-height:var(--line-tight, 1.08);
        letter-spacing:var(--view-title-letter, -.05em);
        font-weight:var(--view-title-weight, var(--weight-black, 800));
        color:var(--text-strong, #ffffff);
        white-space:normal;
      }

      .incidencias-page-subtitle{
        margin:0;
        max-inline-size:900px;
        font-size:var(--font-lg, 15px);
        line-height:var(--line-relaxed, 1.58);
        color:var(--view-subtitle-color, var(--text-muted, rgba(245,245,245,.70)));
      }

      .incidencias-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:var(--space-xs, 10px);
        flex-wrap:wrap;
      }

      .incidencias-btn{
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

      .incidencias-btn svg{
        inline-size:16px;
        block-size:16px;
      }

      .incidencias-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
        box-shadow:var(--shadow-md, 0 14px 30px rgba(0,0,0,.22));
      }

      .incidencias-btn:active{
        transform:translateY(0) scale(var(--ui-active-scale, .985));
      }

      .incidencias-btn--primary{
        border-color:var(--btn-primary-border, var(--accent-border, rgba(255,255,255,.05)));
        background:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #6f59d9 0%, #5f45d8 55%, #4f37bf 100%)));
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22));
      }

      .incidencias-btn--primary:hover{
        background:var(--btn-primary-bg-hover, var(--btn-primary-bg));
        color:var(--btn-primary-text, #ffffff);
      }

      .incidencias-btn--create{
        border-color:var(--inc-create-border);
        background:var(--inc-create-bg);
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:
          0 12px 28px color-mix(in srgb, var(--accent, #6f59d9), transparent 78%),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.10));
      }

      .incidencias-btn--create:hover{
        transform:translateY(-2px);
        border-color:var(--inc-create-border);
        background:var(--inc-create-bg-hover);
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:
          0 16px 34px color-mix(in srgb, var(--accent, #6f59d9), transparent 74%),
          0 0 0 1px color-mix(in srgb, var(--text-on-accent, #ffffff) 18%, transparent) inset;
        filter:none;
      }

      .incidencias-btn--create:active{
        transform:translateY(0) scale(var(--ui-active-scale, .985));
        background:var(--inc-create-bg);
      }

      .incidencias-btn:focus-visible,
      .incidencias-detail-btn:focus-visible,
      .incidencias-pagination-btn:focus-visible,
      .incidencias-filter-pill:focus-visible,
      .incidencias-filter-reset:focus-visible{
        outline:none;
        box-shadow:var(--focus-ring, 0 0 0 4px rgba(113,113,122,.16));
      }

      .incidencias-btn.is-loading,
      .incidencias-detail-btn.is-loading{
        cursor:wait;
        opacity:.94;
      }

      .incidencias-btn:disabled,
      .incidencias-detail-btn:disabled,
      .incidencias-detail-btn[aria-disabled="true"]{
        pointer-events:none;
        opacity:.54;
        filter:saturate(.75);
      }

      .incidencias-hero-meta{
        margin-block-start:var(--space-md, 14px);
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .incidencias-meta-pill{
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

      .incidencias-meta-pill svg{
        inline-size:14px;
        block-size:14px;
      }

      .incidencias-stats{
        margin-block-start:var(--space-md, 16px);
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .incidencias-stat-card{
        --inc-stat-color:var(--accent, #6f59d9);

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

      .incidencias-stat-card::after{
        content:"";
        position:absolute;
        inset:auto -20% -44% auto;
        inline-size:120px;
        block-size:120px;
        border-radius:50%;
        pointer-events:none;
        background:color-mix(in srgb, var(--inc-stat-color) 16%, transparent);
        filter:blur(8px);
      }

      .incidencias-stat-card--open{
        --inc-stat-color:var(--accent, #6f59d9);
        border-color:var(--accent-border, var(--border-accent, rgba(113,113,122,.30)));
      }

      .incidencias-stat-card--closed{
        --inc-stat-color:var(--success, #22c55e);
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .incidencias-stat-card--urgent{
        --inc-stat-color:var(--error, #ef4444);
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .incidencias-stat-card--amount{
        --inc-stat-color:var(--info, #94a3b8);
        border-color:var(--border-info, rgba(148,163,184,.28));
      }

      .incidencias-stat-label{
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        color:var(--text-dim, rgba(245,245,245,.50));
      }

      .incidencias-stat-value{
        font-size:clamp(28px, 3vw, var(--font-5xl, 40px));
        line-height:.92;
        letter-spacing:var(--letter-tight, -.03em);
        font-weight:var(--weight-black, 800);
        color:var(--text-strong, #ffffff);
      }

      .incidencias-stat-text{
        font-size:var(--font-base, 14px);
        line-height:var(--line-normal, 1.42);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .incidencias-history{
        overflow:hidden;
        border-radius:var(--data-table-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--data-table-border, var(--card-border, var(--border-default, rgba(255,255,255,.082))));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--data-table-bg, var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88))));
        box-shadow:var(--data-table-shadow, var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24))));
        min-inline-size:0;
      }

      .incidencias-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-md, 14px);
        align-items:start;
        padding:var(--space-md, 14px) var(--space-lg, 18px) var(--space-sm, 12px);
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
      }

      .incidencias-history-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 2px);
      }

      .incidencias-history-title{
        margin:0;
        font-size:var(--section-title-size, var(--font-xl, 16px));
        line-height:var(--line-snug, 1.22);
        font-weight:var(--section-title-weight, var(--weight-bold, 700));
        color:var(--section-title-color, var(--text-strong, #ffffff));
      }

      .incidencias-history-subtitle{
        margin:0;
        font-size:var(--section-subtitle-size, var(--font-sm, 12px));
        line-height:var(--line-normal, 1.42);
        color:var(--section-subtitle-color, var(--text-dim, rgba(245,245,245,.50)));
      }

      .incidencias-pagination{
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .incidencias-pagination-status{
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

      .incidencias-pagination-btn{
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

      .incidencias-pagination-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        border-color:var(--border-strong, rgba(255,255,255,.12));
      }

      .incidencias-pagination-btn[disabled],
      .incidencias-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
        pointer-events:none;
        transform:none;
      }

      .incidencias-filters{
        grid-column:1 / -1;
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-xs, 10px);
        align-items:center;
        padding-block-start:var(--space-xs, 4px);
      }

      .incidencias-filter-pills{
        min-inline-size:0;
        display:flex;
        align-items:center;
        gap:var(--space-2xs, 6px);
        overflow-x:auto;
        scrollbar-width:none;
        padding-block:2px;
      }

      .incidencias-filter-pills::-webkit-scrollbar{
        display:none;
      }

      .incidencias-filter-pill{
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
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .incidencias-filter-pill strong{
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

      .incidencias-filter-pill:hover{
        transform:translateY(-1px);
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
      }

      .incidencias-filter-pill.is-active{
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 42%, var(--border-strong, rgba(255,255,255,.12)));
        background:color-mix(in srgb, var(--accent, #6f59d9) 14%, var(--badge-bg, rgba(255,255,255,.048)));
        color:var(--accent-active, var(--text-strong, #ffffff));
        box-shadow:0 8px 20px color-mix(in srgb, var(--accent, #6f59d9), transparent 88%);
      }

      .incidencias-filter-reset{
        appearance:none;
        min-block-size:calc(34px * var(--ui-scale, 1));
        padding-inline:11px;
        border-radius:999px;
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:7px;
        font:inherit;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        cursor:pointer;
        white-space:nowrap;
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .incidencias-filter-reset:hover{
        transform:translateY(-1px);
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
        border-color:var(--border-strong, rgba(255,255,255,.12));
      }

      .incidencias-filter-reset svg{
        inline-size:13px;
        block-size:13px;
      }

      .incidencias-table-wrap{
        position:relative;
        min-block-size:120px;
        min-inline-size:0;
      }

      .incidencias-table-wrap.is-refreshing .incidencias-table-shell{
        opacity:.56;
        filter:blur(.7px);
      }

      .incidencias-table-shell{
        inline-size:100%;
        max-inline-size:100%;
        overflow-x:auto;
        overflow-y:hidden;
        scrollbar-width:thin;
        scrollbar-color:var(--scrollbar-thumb, rgba(255,255,255,.12)) transparent;
      }

      .incidencias-table-shell::-webkit-scrollbar{
        block-size:var(--scrollbar-size, 10px);
      }

      .incidencias-table-shell::-webkit-scrollbar-track{
        background:transparent;
      }

      .incidencias-table-shell::-webkit-scrollbar-thumb{
        border:2px solid transparent;
        border-radius:999px;
        background:var(--scrollbar-thumb, rgba(255,255,255,.12));
        background-clip:padding-box;
      }

      .incidencias-table{
        display:table !important;
        inline-size:100%;
        min-inline-size:1320px;
        table-layout:fixed;
        border-collapse:separate;
        border-spacing:0;
        background:var(--table-bg, transparent);
        margin:0;
      }

      .incidencias-table colgroup{
        display:table-column-group !important;
      }

      .incidencias-table col{
        display:table-column !important;
      }

      .incidencias-table thead{
        display:table-header-group !important;
      }

      .incidencias-table tbody{
        display:table-row-group !important;
      }

      .incidencias-table tr{
        display:table-row !important;
      }

      .incidencias-table th,
      .incidencias-table td{
        display:table-cell !important;
      }

      .incidencias-table thead th{
        position:sticky;
        top:0;
        z-index:2;
        block-size:44px;
        padding:var(--table-cell-padding-y, 12px) var(--table-cell-padding-x, 12px);
        text-align:center;
        vertical-align:middle;
        font-size:var(--data-table-head-font-size, var(--font-xs, 11px));
        font-weight:var(--data-table-head-font-weight, var(--weight-bold, 700));
        letter-spacing:var(--data-table-head-letter, .075em);
        text-transform:uppercase;
        color:var(--data-table-head-text, var(--text-dim, rgba(245,245,245,.50)));
        background:var(--data-table-head-bg, var(--table-head-bg, rgba(255,255,255,.020)));
        border-bottom:1px solid var(--table-head-border, var(--border-default, rgba(255,255,255,.082)));
        white-space:nowrap;
      }

      .incidencias-table thead th:first-child{
        text-align:left;
        padding-inline-start:24px;
      }

      .incidencias-table tbody tr{
        block-size:var(--inc-table-row-height);
      }

      .incidencias-table tbody td{
        padding:calc(12px * var(--ui-scale, 1)) var(--table-cell-padding-x, 12px);
        vertical-align:middle;
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
        background:transparent;
      }

      .incidencias-table tbody tr:last-child td{
        border-bottom:none;
      }

      .incidencias-table tbody tr:nth-child(even) td{
        background:color-mix(in srgb, var(--surface-elevated, rgba(39,39,42,.88)) 86%, transparent);
      }

      .incidencias-row{
        --inc-row-accent:var(--accent, #6f59d9);
      }

      .incidencias-row:hover{
        background:var(--data-table-row-hover, var(--table-row-hover, rgba(255,255,255,.024)));
      }

      .incidencias-row--pending{
        --inc-row-accent:var(--warning, #f59e0b);
      }

      .incidencias-row--open{
        --inc-row-accent:var(--accent, #6f59d9);
      }

      .incidencias-row--progress{
        --inc-row-accent:var(--info, #94a3b8);
      }

      .incidencias-row--resolved,
      .incidencias-row--closed{
        --inc-row-accent:var(--success, #22c55e);
      }

      .incidencias-cell{
        min-inline-size:0;
      }

      .incidencias-cell--main{
        position:relative;
        text-align:left;
        padding-inline-start:18px !important;
      }

      .incidencias-cell--main::before{
        content:"";
        position:absolute;
        inset-block:10px;
        inset-inline-start:0;
        inline-size:3px;
        border-radius:0 999px 999px 0;
        background:var(--inc-row-accent);
        opacity:.68;
        transform:scaleY(.72);
        transition:
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .incidencias-row:hover .incidencias-cell--main::before{
        opacity:1;
        transform:scaleY(1);
      }

      .incidencias-cell--status,
      .incidencias-cell--date,
      .incidencias-cell--importe,
      .incidencias-cell--attachments,
      .incidencias-cell--actions{
        text-align:center;
      }

      .incidencias-cell--status > *,
      .incidencias-cell--importe > *,
      .incidencias-cell--attachments > *,
      .incidencias-cell--actions > *{
        margin-inline:auto;
      }

      .incidencias-main{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1))) minmax(0, 1fr);
        gap:var(--space-sm, 12px);
        align-items:center;
        min-inline-size:0;
        padding-inline-start:6px;
      }

      .incidencias-avatar{
        position:relative;
        inline-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        block-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        border-radius:var(--radius-pill, 999px);
        overflow:hidden;
        flex:0 0 var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        background:var(--inc-avatar-bg, linear-gradient(135deg, #55555d 0%, #303036 100%));
        box-shadow:
          0 10px 22px color-mix(in srgb, var(--inc-avatar-b, #000000) 22%, transparent),
          0 0 0 3px color-mix(in srgb, var(--inc-avatar-a, #71717a) 24%, transparent),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
        transform:translateZ(0);
      }

      .incidencias-avatar::after{
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

      .incidencias-avatar img{
        position:relative;
        z-index:1;
        display:block;
        inline-size:100%;
        block-size:100%;
        object-fit:cover;
      }

      .incidencias-avatar-fallback{
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

      .incidencias-avatar[data-fallback="true"] .incidencias-avatar-fallback,
      .incidencias-avatar--fallback .incidencias-avatar-fallback{
        display:flex;
      }

      .incidencias-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .incidencias-main-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 3px);
      }

      .incidencias-ticket-line{
        display:flex;
        align-items:center;
        gap:7px;
        min-inline-size:0;
      }

      .incidencias-ticket-id{
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

      .incidencias-category-pill{
        flex:0 0 auto;
        max-inline-size:130px;
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
        text-transform:uppercase;
      }

      .incidencias-ticket-subject{
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

      .incidencias-ticket-description{
        font-size:var(--font-md, 13px);
        line-height:1.3;
        color:var(--text-dim, rgba(245,245,245,.50));
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .incidencias-client-line{
        display:flex;
        align-items:center;
        gap:5px;
        min-inline-size:0;
        color:var(--text-muted, rgba(245,245,245,.70));
        font-size:var(--font-xs, 11px);
        line-height:1.22;
        font-weight:var(--weight-semibold, 600);
      }

      .incidencias-client-name,
      .incidencias-client-email{
        min-inline-size:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .incidencias-client-separator{
        color:var(--text-faint, rgba(245,245,245,.34));
      }

      .incidencias-row-badges{
        display:flex;
        align-items:center;
        flex-wrap:wrap;
        gap:5px;
        margin-block-start:3px;
      }

      .incidencias-mini-badge{
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
        max-inline-size:160px;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .incidencias-mini-badge svg{
        inline-size:12px;
        block-size:12px;
        flex:0 0 auto;
      }

      .incidencias-mini-badge--critical,
      .incidencias-mini-badge--urgent{
        color:var(--error, #ef4444);
        background:var(--error-bg, rgba(239,68,68,.10));
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .incidencias-mini-badge--medium{
        color:var(--warning, #f59e0b);
        background:var(--warning-bg, rgba(245,158,11,.10));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .incidencias-mini-badge--low{
        color:var(--info, #94a3b8);
        background:var(--info-bg, rgba(148,163,184,.10));
        border-color:var(--border-info, rgba(148,163,184,.28));
      }

      .incidencias-mini-badge--agent{
        color:var(--text-dim, rgba(245,245,245,.50));
      }

      .incidencias-chip{
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

      .incidencias-chip-dot{
        inline-size:6px;
        block-size:6px;
        border-radius:999px;
        background:currentColor;
        box-shadow:0 0 0 3px color-mix(in srgb, currentColor 16%, transparent);
      }

      .incidencias-chip--pending{
        color:var(--warning, #f59e0b);
        background:color-mix(in srgb, var(--warning-bg, rgba(245,158,11,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .incidencias-chip--open{
        color:var(--text-strong, #ffffff);
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--text-strong, #ffffff), transparent 94%),
            transparent 48%
          ),
          color-mix(
            in srgb,
            var(--accent, #3f3f46) 34%,
            var(--surface-active, rgba(255,255,255,.066)) 66%
          );
        border-color:color-mix(
          in srgb,
          var(--accent, #3f3f46) 54%,
          var(--border-strong, rgba(255,255,255,.12)) 46%
        );
      }

      .incidencias-chip--progress{
        color:var(--info, #94a3b8);
        background:color-mix(in srgb, var(--info-bg, rgba(148,163,184,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-info, rgba(148,163,184,.28));
      }

      .incidencias-chip--resolved,
      .incidencias-chip--closed{
        color:var(--success, #22c55e);
        background:color-mix(in srgb, var(--success-bg, rgba(34,197,94,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .incidencias-date-inline{
        display:inline-flex;
        justify-content:center;
        inline-size:100%;
        white-space:nowrap;
        font-size:var(--font-md, 13px);
        line-height:1.2;
        font-weight:var(--weight-semibold, 600);
        font-variant-numeric:tabular-nums;
        color:var(--data-table-cell-text, var(--text-soft, rgba(245,245,245,.88)));
      }

      .incidencias-importe,
      .incidencias-attachments-pill{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:5px;
        min-block-size:calc(30px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        white-space:nowrap;
        border:1px solid transparent;
      }

      .incidencias-importe{
        min-inline-size:86px;
      }

      .incidencias-importe svg,
      .incidencias-attachments-pill svg{
        inline-size:13px;
        block-size:13px;
        flex:0 0 auto;
      }

      .incidencias-importe--money{
        color:var(--chip-text, var(--text-soft, rgba(245,245,245,.88)));
        background:var(--chip-bg, rgba(255,255,255,.034));
        border-color:var(--chip-border, rgba(255,255,255,.07));
      }

      .incidencias-importe--paid{
        color:var(--success, #22c55e);
        background:var(--success-bg, rgba(34,197,94,.10));
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .incidencias-importe--pending,
      .incidencias-importe--partial{
        color:var(--warning, #f59e0b);
        background:var(--warning-bg, rgba(245,158,11,.10));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .incidencias-importe--overdue{
        color:var(--error, #ef4444);
        background:var(--error-bg, rgba(239,68,68,.10));
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .incidencias-importe--status,
      .incidencias-importe--idle{
        color:var(--text-dim, rgba(245,245,245,.50));
        background:var(--chip-bg, rgba(255,255,255,.034));
        border-color:var(--chip-border, rgba(255,255,255,.07));
      }

      .incidencias-attachments-pill{
        min-inline-size:48px;
        color:var(--chip-text, var(--text-soft, rgba(245,245,245,.88)));
        background:var(--chip-bg, rgba(255,255,255,.034));
        border-color:var(--chip-border, rgba(255,255,255,.07));
      }

      .incidencias-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .incidencias-detail-btn{
        appearance:none;
        inline-size:calc(112px * var(--ui-scale, 1));
        min-inline-size:calc(112px * var(--ui-scale, 1));
        max-inline-size:calc(112px * var(--ui-scale, 1));
        min-block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        padding-inline:var(--space-xs, 8px);
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
        gap:6px;
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          filter var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .incidencias-action-icon{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .incidencias-action-icon svg{
        inline-size:14px;
        block-size:14px;
      }

      .incidencias-detail-btn:hover{
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
        transform:translateY(var(--ui-hover-lift, -1px));
      }

      .incidencias-detail-btn:active{
        transform:translateY(0) scale(var(--ui-active-scale, .985));
      }

      .incidencias-detail-btn.is-loading{
        justify-content:center;
      }

      .incidencias-loader-only{
        display:inline-flex;
        inline-size:16px;
        block-size:16px;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .incidencias-inline-loading{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:var(--space-xs, 7px);
        white-space:nowrap;
      }

      .incidencias-inline-loading-text{
        display:inline-block;
      }

      .incidencias-inline-spinner{
        inline-size:14px;
        block-size:14px;
        border-radius:var(--radius-pill, 999px);
        border:2px solid var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:currentColor;
        animation:incidenciasSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .incidencias-refresh-overlay{
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

      .incidencias-refresh-card{
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

      .incidencias-table-loading{
        padding:var(--space-sm, 12px) var(--space-lg, 18px) var(--space-md, 16px);
        display:grid;
        gap:var(--space-sm, 12px);
      }

      .incidencias-table-loading-row{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, 44px) minmax(220px, 1.45fr) 112px 140px 140px 108px 62px 112px;
        gap:var(--space-sm, 12px);
        align-items:center;
      }

      .incidencias-table-loading-copy{
        display:grid;
        gap:var(--space-xs, 7px);
      }

      .incidencias-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:var(--skeleton-radius, var(--radius-md, 13px));
        background:var(--skeleton-bg, rgba(255,255,255,.050));
      }

      .incidencias-skeleton::after{
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
        animation:incidenciasSkeleton 1.2s var(--ease-standard, ease-in-out) infinite;
      }

      .incidencias-skeleton--avatar{
        inline-size:var(--avatar-size-lg, 44px);
        block-size:var(--avatar-size-lg, 44px);
        border-radius:var(--radius-pill, 999px);
      }

      .incidencias-skeleton--xs{
        inline-size:120px;
        block-size:var(--skeleton-height-sm, 10px);
      }

      .incidencias-skeleton--lg{
        inline-size:74%;
        block-size:var(--skeleton-height-md, 14px);
      }

      .incidencias-skeleton--md{
        inline-size:56%;
        block-size:12px;
      }

      .incidencias-skeleton--pill{
        inline-size:92px;
        block-size:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .incidencias-skeleton--date{
        inline-size:124px;
        block-size:12px;
      }

      .incidencias-skeleton--amount{
        inline-size:96px;
        block-size:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .incidencias-skeleton--attach{
        inline-size:48px;
        block-size:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .incidencias-skeleton--btn{
        inline-size:calc(112px * var(--ui-scale, 1));
        block-size:var(--btn-height-sm, 34px);
        border-radius:var(--radius-md, 12px);
      }

      .incidencias-empty{
        display:grid;
        justify-items:center;
        gap:var(--space-xs, 8px);
        padding:var(--space-4xl, 44px) var(--space-lg, 20px) var(--space-5xl, 48px);
        text-align:center;
      }

      .incidencias-empty-icon{
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

      .incidencias-empty-icon svg{
        inline-size:24px;
        block-size:24px;
      }

      .incidencias-empty-title{
        margin:0;
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .incidencias-empty-text{
        margin:0;
        max-inline-size:58ch;
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .incidencias-error{
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

      .incidencias-error-title{
        margin:0;
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .incidencias-error-text{
        margin:0;
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      @keyframes incidenciasSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes incidenciasSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .incidencias-hero,
      [data-theme="light"] .incidencias-history{
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #6f59d9) 9%, transparent), transparent 38%),
          radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--info, #3b82a6) 7%, transparent), transparent 34%),
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #ffffff))));
      }

      [data-theme="light"] .incidencias-stat-card{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--card-bg, var(--surface-elevated, #ffffff));
      }

      [data-theme="light"] .incidencias-btn--create{
        --inc-create-bg:var(--btn-primary-bg, linear-gradient(135deg, var(--accent, #6f59d9) 0%, var(--accent-hover, #5f45d8) 100%));
        --inc-create-bg-hover:var(--inc-create-bg);
        --inc-create-border:color-mix(in srgb, var(--accent, #6f59d9) 44%, transparent);
      }

      [data-theme="light"] .incidencias-filter-pill.is-active{
        color:var(--accent-active, #533cb6);
        background:var(--accent-soft, rgba(111,89,217,.125));
        border-color:var(--accent-border-strong, rgba(111,89,217,.36));
      }

      [data-theme="light"] .incidencias-chip--open{
        color:var(--accent-active, #533cb6);
        background:var(--accent-soft, rgba(111,89,217,.125));
        border-color:var(--accent-border-strong, rgba(111,89,217,.36));
      }

      [data-theme="light"] .incidencias-chip--pending{
        color:var(--warning-hover, #9c6110);
        background:var(--warning-soft, rgba(192,122,22,.12));
        border-color:var(--border-warning, rgba(217,119,6,.245));
      }

      [data-theme="light"] .incidencias-chip--progress{
        color:var(--info-hover, #2f6d8d);
        background:var(--info-soft, rgba(59,130,166,.12));
        border-color:var(--border-info, rgba(59,130,166,.245));
      }

      [data-theme="light"] .incidencias-chip--resolved,
      [data-theme="light"] .incidencias-chip--closed{
        color:var(--success-hover, #157a4f);
        background:var(--success-soft, rgba(31,157,104,.12));
        border-color:var(--border-success, rgba(22,163,74,.245));
      }

      [data-theme="light"] .incidencias-mini-badge--critical,
      [data-theme="light"] .incidencias-mini-badge--urgent{
        color:var(--error-hover, #b52a39);
        background:var(--error-soft, rgba(216,60,77,.12));
        border-color:var(--border-error, rgba(220,38,38,.245));
      }

      [data-theme="light"] .incidencias-mini-badge--medium{
        color:var(--warning-hover, #9c6110);
        background:var(--warning-soft, rgba(192,122,22,.12));
        border-color:var(--border-warning, rgba(217,119,6,.245));
      }

      [data-theme="light"] .incidencias-mini-badge--low{
        color:var(--info-hover, #2f6d8d);
        background:var(--info-soft, rgba(59,130,166,.12));
        border-color:var(--border-info, rgba(59,130,166,.245));
      }

      [data-theme="light"] .incidencias-importe--paid{
        color:var(--success-hover, #157a4f);
        background:var(--success-soft, rgba(31,157,104,.12));
        border-color:var(--border-success, rgba(22,163,74,.245));
      }

      [data-theme="light"] .incidencias-importe--pending,
      [data-theme="light"] .incidencias-importe--partial{
        color:var(--warning-hover, #9c6110);
        background:var(--warning-soft, rgba(192,122,22,.12));
        border-color:var(--border-warning, rgba(217,119,6,.245));
      }

      [data-theme="light"] .incidencias-importe--overdue{
        color:var(--error-hover, #b52a39);
        background:var(--error-soft, rgba(216,60,77,.12));
        border-color:var(--border-error, rgba(220,38,38,.245));
      }

      @media (max-width: 1240px){
        .incidencias-stats{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }

        .incidencias-filters{
          grid-template-columns:1fr;
        }
      }

      @media (max-width: 1180px){
        .incidencias-hero{
          padding:var(--space-lg, 20px);
        }

        .incidencias-hero-top{
          grid-template-columns:1fr;
        }

        .incidencias-hero-actions{
          justify-content:flex-start;
        }
      }

      @media (max-width: 760px){
        :where(.incidencias-view-root, [data-incidencias-scope]){
          gap:var(--space-md, 16px);
        }

        .incidencias-hero{
          padding:var(--space-lg, 18px) var(--space-md, 16px);
          border-radius:var(--radius-xl, 18px);
        }

        .incidencias-history{
          border-radius:var(--radius-xl, 18px);
        }

        .incidencias-history-head{
          grid-template-columns:1fr;
          padding:var(--space-md, 14px) var(--space-md, 14px) var(--space-sm, 12px);
        }

        .incidencias-pagination{
          justify-content:flex-start;
        }

        .incidencias-stats{
          grid-template-columns:1fr;
        }

        .incidencias-page-title{
          font-size:clamp(var(--font-3xl, 24px), 8vw, var(--font-4xl, 34px));
          line-height:1;
        }

        .incidencias-page-subtitle{
          font-size:var(--font-base, 14px);
        }

        .incidencias-hero-actions{
          inline-size:100%;
        }

        .incidencias-btn{
          flex:1 1 auto;
        }

        .incidencias-table{
          min-inline-size:1160px;
        }
      }

      @media (max-width: 520px){
        .incidencias-meta-pill{
          inline-size:100%;
          justify-content:center;
        }

        .incidencias-hero-actions{
          display:grid;
          grid-template-columns:1fr;
        }

        .incidencias-btn{
          inline-size:100%;
        }

        .incidencias-filter-pills{
          margin-inline:-2px;
        }
      }

      @media (prefers-reduced-motion: reduce){
        :where(.incidencias-view-root, [data-incidencias-scope]) *,
        :where(.incidencias-view-root, [data-incidencias-scope]) *::before,
        :where(.incidencias-view-root, [data-incidencias-scope]) *::after{
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

  const items = sortIncidenciasNewestFirst(
    safeArray(first(data.items, data.rows, data.tickets, data.incidencias))
  );

  const state = safeObject(data.state);
  const stats = computeStats(items);

  const remoteCount = Math.max(
    stats.total,
    safeNumber(
      first(
        data.remoteCount,
        data.totalCount,
        state.remoteCount,
        state.totalCount,
        stats.total
      ),
      stats.total
    )
  );

  const updatedAt = first(
    data.lastUpdatedAt,
    state.lastSyncAt,
    data.updatedAt,
    state.updatedAt,
    ...items.map((item) => getUpdatedAt(item))
  );

  const title = safeText(
    first(data.title, state.title, "Tus incidencias y solicitudes"),
    "Tus incidencias y solicitudes"
  );

  const subtitle = safeText(
    first(
      data.subtitle,
      state.subtitle,
      "Consulta el estado de tus incidencias, revisa las actualizaciones más recientes y crea nuevas solicitudes desde una vista clara, cercana y fácil de seguir."
    ),
    ""
  );

  const creating = Boolean(first(state.creating, state.creatingIncidencia, data.creating));
  const refreshing = Boolean(first(state.refreshing, data.refreshing));
  const loading = Boolean(first(state.loading, data.loading));

  const includeStyles = data.includeStyles !== false;

  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="incidencias-hero">
      <div class="incidencias-hero-top">
        <div class="incidencias-hero-copy">
          <h1 class="incidencias-page-title">${escapeHtml(title)}</h1>
          <p class="incidencias-page-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <div class="incidencias-hero-actions">
          <button
            type="button"
            id="incidencias-refresh-btn"
            class="incidencias-btn${refreshing ? " is-loading" : ""}"
            data-incidencias-action="refresh"
            data-action="refresh"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : `${icon("refresh")}<span class="incidencias-btn-text">Actualizar</span>`
            }
          </button>

          <button
            type="button"
            id="incidencias-export-btn"
            class="incidencias-btn"
            data-incidencias-action="export"
            data-action="export-csv"
            ${loading || refreshing || !items.length ? "disabled" : ""}
          >
            ${icon("export")}
            <span class="incidencias-btn-text">Exportar historial</span>
          </button>

          <button
            type="button"
            id="incidencias-create-btn"
            class="incidencias-btn incidencias-btn--primary incidencias-btn--create${creating ? " is-loading" : ""}"
            data-incidencias-action="create"
            data-action="create-incidencia"
            ${creating ? 'disabled aria-busy="true"' : ""}
          >
            ${
              creating
                ? renderSpinner("Abriendo...")
                : `${icon("plus")}<span class="incidencias-btn-text">Crear incidencia</span>`
            }
          </button>
        </div>
      </div>

      <div class="incidencias-hero-meta">
        <span class="incidencias-meta-pill">
          ${icon("ticket")}
          ${escapeHtml(`${remoteCount} solicitudes registradas`)}
        </span>

        <span class="incidencias-meta-pill">
          ${icon("refresh")}
          ${
            updatedAt
              ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
              : "Sin actualizaciones recientes"
          }
        </span>

        <span class="incidencias-meta-pill">
          ${icon("paperclip")}
          ${escapeHtml(`${stats.attachmentsCount} adjuntos`)}
        </span>

        <span class="incidencias-meta-pill">
          ${icon("euro")}
          ${escapeHtml(formatMoney(stats.totalImporte, DEFAULT_CURRENCY))}
        </span>
      </div>

      <div class="incidencias-stats">
        <article class="incidencias-stat-card incidencias-stat-card--open">
          <div class="incidencias-stat-label">Abiertas</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.openCount))}</div>
          <div class="incidencias-stat-text">Solicitudes activas, pendientes o en proceso.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--closed">
          <div class="incidencias-stat-label">Cerradas</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.closedCount))}</div>
          <div class="incidencias-stat-text">Casos resueltos, cerrados o archivados.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--urgent">
          <div class="incidencias-stat-label">Urgentes</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.urgentCount))}</div>
          <div class="incidencias-stat-text">Incidencias marcadas como urgentes o críticas.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--amount">
          <div class="incidencias-stat-label">Importe asociado</div>
          <div class="incidencias-stat-value">${escapeHtml(formatMoney(stats.totalImporte, DEFAULT_CURRENCY))}</div>
          <div class="incidencias-stat-text">Total vinculado a facturas visibles.</div>
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

    <section class="incidencias-history">
      ${renderTableLoading(DEFAULT_PAGE_SIZE)}
    </section>
  `;
}

export function renderErrorState(
  message = "No se pudieron cargar las incidencias.",
  { includeStyles = false } = {}
) {
  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="incidencias-error">
      <h3 class="incidencias-error-title">No se pudo renderizar la vista de incidencias</h3>
      <p class="incidencias-error-text">${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}</p>
    </section>
  `;
}

/* =========================================================
   TABLE
========================================================= */

export function renderTable(input = {}) {
  const data = safeObject(input);

  const items = safeArray(first(data.items, data.rows, data.tickets, data.incidencias));
  const state = safeObject(data.state);

  const pagination = getPagination(items, data);

  const loading = Boolean(first(state.loading, data.loading));
  const refreshing = Boolean(first(state.refreshing, data.refreshing));
  const hasError = Boolean(safeText(first(state.error, data.error), ""));

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;

  const includeStyles = Boolean(data.includeStyles);

  const subtitle = showInitialLoading
    ? "Cargando incidencias..."
    : pagination.filtering
      ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} filtradas · ${pagination.unfilteredCount} totales`
      : `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`;

  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="incidencias-history">
      <div class="incidencias-history-head">
        <div class="incidencias-history-copy">
          <h2 class="incidencias-history-title">Historial de incidencias</h2>
          <p class="incidencias-history-subtitle">
            ${escapeHtml(subtitle)}
          </p>
        </div>

        ${renderPagination(pagination, state)}
        ${renderFilters(data, pagination)}
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || DEFAULT_PAGE_SIZE))
          : `
            <div class="incidencias-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    <div class="incidencias-table-shell">
                      <table class="incidencias-table" role="table" aria-label="Listado de incidencias">
                        <colgroup>
                          <col>
                          <col style="width:138px;">
                          <col style="width:174px;">
                          <col style="width:174px;">
                          <col style="width:142px;">
                          <col style="width:86px;">
                          <col style="width:146px;">
                        </colgroup>

                        <thead>
                          <tr>
                            <th scope="col">Incidencia / cliente</th>
                            <th scope="col">Estado</th>
                            <th scope="col">Creación</th>
                            <th scope="col">Última novedad</th>
                            <th scope="col">Importe</th>
                            <th scope="col">Adj.</th>
                            <th scope="col">Acciones</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${pagination.pageItems.map((item) => renderRow(item, state)).join("")}
                        </tbody>
                      </table>
                    </div>
                  `
                  : renderEmptyState({
                      hasError,
                      filtering: pagination.filtering,
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

export const renderCards = renderTable;

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderIncidenciasTableTemplate(input = {}) {
  const data = safeObject(input);

  const items = safeArray(first(data.items, data.rows, data.tickets, data.incidencias));
  const state = safeObject(data.state);

  if (state.error && !items.length) {
    return `
      <section class="incidencias-view-root" data-incidencias-scope="true">
        ${renderStyles()}
        ${renderErrorState(state.error, { includeStyles: false })}
      </section>
    `;
  }

  const payload = {
    ...data,
    items,
    state,
    includeStyles: false,
  };

  return `
    <section class="incidencias-view-root" data-incidencias-scope="true">
      ${renderStyles()}
      ${renderHeader(payload)}
      ${renderTable(payload)}
    </section>
  `;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default renderIncidenciasTableTemplate;
