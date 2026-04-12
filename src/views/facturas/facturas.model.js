/* =========================================================
   Onion SPA - Facturas Model
   Archivo: src/views/facturas/facturas.model.js

   Responsabilidades:
   - helpers seguros de datos
   - formatters de facturas
   - normalización del backend
   - labels y estilos de estado
========================================================= */

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function toMs(value) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function truncate(value = "", max = 140) {
  const text = safeString(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export function formatMoney(value, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  }).format(safeNumber(value));
}

export function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatRelativeDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "Hace un momento";
  if (diff < hour) return `Hace ${Math.max(1, Math.floor(diff / minute))} min`;
  if (diff < day) return `Hace ${Math.max(1, Math.floor(diff / hour))} h`;
  if (diff < 7 * day) return `Hace ${Math.max(1, Math.floor(diff / day))} d`;

  return formatDate(value);
}

export function getInitials(value = "") {
  return (
    String(value || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || "ON"
  );
}

export function normalizeEstadoPago(value = "pending") {
  const map = {
    pagada: "paid",
    pagado: "paid",
    paid: "paid",
    abonada: "paid",

    pendiente: "pending",
    pending: "pending",
    unpaid: "pending",

    vencida: "overdue",
    overdue: "overdue",

    borrador: "draft",
    draft: "draft",

    cancelada: "cancelled",
    cancelado: "cancelled",
    cancelled: "cancelled",
    canceled: "cancelled",
  };

  const key = safeString(value).toLowerCase();
  return map[key] || "pending";
}

export function normalizeEstado(value = "issued") {
  const map = {
    emitida: "issued",
    emitido: "issued",
    issued: "issued",

    enviada: "sent",
    enviado: "sent",
    sent: "sent",

    anulada: "void",
    anulado: "void",
    void: "void",

    borrador: "draft",
    draft: "draft",
  };

  const key = safeString(value).toLowerCase();
  return map[key] || "issued";
}

export function getEstadoPagoLabel(value = "pending") {
  const labels = {
    paid: "Pagada",
    pending: "Pendiente",
    overdue: "Vencida",
    draft: "Borrador",
    cancelled: "Cancelada",
  };

  return labels[value] || "Pendiente";
}

export function getEstadoLabel(value = "issued") {
  const labels = {
    issued: "Emitida",
    sent: "Enviada",
    void: "Anulada",
    draft: "Borrador",
  };

  return labels[value] || "Emitida";
}

export function getEstadoPagoChipStyle(value = "pending") {
  const tones = {
    paid:
      "background:var(--success-bg); border-color:var(--border-success); color:var(--text-soft);",
    pending:
      "background:var(--warning-bg); border-color:var(--border-warning); color:var(--text-soft);",
    overdue:
      "background:var(--error-bg); border-color:var(--border-error); color:var(--text-soft);",
    draft:
      "background:var(--info-bg); border-color:var(--border-info); color:var(--text-soft);",
    cancelled:
      "background:var(--surface-glass); border-color:var(--border-soft); color:var(--text-muted);",
  };

  return tones[value] || tones.pending;
}

export function getEstadoChipStyle(value = "issued") {
  const tones = {
    issued:
      "background:var(--info-bg); border-color:var(--border-info); color:var(--text-soft);",
    sent:
      "background:var(--success-bg); border-color:var(--border-success); color:var(--text-soft);",
    void:
      "background:var(--surface-glass); border-color:var(--border-soft); color:var(--text-muted);",
    draft:
      "background:var(--accent-soft-2); border-color:var(--border-accent); color:var(--text-soft);",
  };

  return tones[value] || tones.issued;
}

export function normalizeFactura(item = {}) {
  const estadoPago = normalizeEstadoPago(item.estadoPago || "pending");
  const estado = normalizeEstado(item.estado || "issued");

  const clienteNombre =
    item.cliente?.nombre ||
    item.cliente?.nombreContacto ||
    item.name ||
    "Cliente";

  const clienteEmpresa =
    item.cliente?.empresa ||
    item.cliente?.razonSocial ||
    item.cliente?.nombreFiscal ||
    "-";

  const currency = safeString(item.moneda, "EUR");
  const fecha = item.fecha || item.fechaFactura || null;
  const fechaEnvio = item.fechaEnvio || null;
  const updatedAt = item.updatedAt || fechaEnvio || fecha || null;

  return {
    id: item.id ?? null,
    numero:
      item.numero ??
      item.numeroFacturaLegal ??
      item.numeroFacturaSistema ??
      item.id ??
      "--",

    fecha,
    fechaEnvio,
    updatedAt,

    estadoPago,
    estado,

    total: round2(item.total),
    baseImponible: round2(item.baseImponible),
    iva: round2(item.iva),
    irpf: round2(item.irpf),
    moneda: currency,

    formaPago: safeString(item.formaPago, "-"),
    preview: safeString(item.preview, "Sin detalle"),

    lineasCount: safeNumber(item.lineasCount, 0),
    attachmentsCount: safeNumber(item.attachmentsCount, 0),
    hasPdf: item.hasPdf === true || Boolean(item.blobPath),

    cliente: {
      id: item.cliente?.id ?? item.clienteId ?? null,
      nombre: clienteNombre,
      email: safeString(item.cliente?.email, "-"),
      empresa: clienteEmpresa,
      initials: getInitials(clienteEmpresa !== "-" ? clienteEmpresa : clienteNombre),
    },

    meta: {
      timestampMs: toMs(updatedAt) || toMs(fecha) || 0,
    },

    raw: item,
  };
}

export function extractFacturas(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.facturas)) return response.facturas;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data?.facturas)) return response.data.facturas;
  return [];
}

export function getRemoteCount(response, fallback = 0) {
  return safeNumber(response?.count, fallback) || fallback;
}
