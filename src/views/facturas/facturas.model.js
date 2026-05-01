/* =========================================================
   Onion SPA - Facturas Model
   Archivo: src/views/facturas/facturas.model.js

   FINAL PRO SAAS PANEL · FACTURAS MODEL · 10/10
   PATCH · ID SAFE · INCIDENCIA PRESERVER · COSMOS ALIGNED
   PATCH · NO TICKET ID AS FACTURA ID

   RESPONSABILIDADES:
   - helpers seguros de datos
   - formatters de facturas
   - normalización del backend
   - labels y estilos de estado
   - extracción robusta de payloads
   - utilidades de ordenación / métricas
   - mantener paridad operativa con facturasView.js
   - preservar relación factura ↔ incidencia sin contaminar id de factura

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - normalización estable para store / actions / template
   - soporte para envelope backend legacy y API normalizada actual
   - métricas robustas
   - ordenación sin mutar origen
   - filtros seguros y predecibles
   - compat con Cosmos DB facturas partition key /clienteId
   - compat con facturas legacy + normalizadas v2/v3
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_FACTURAS_SORT = Object.freeze({
  field: "updatedAt",
  direction: "desc",
});

export const DEFAULT_FACTURA_CURRENCY = "EUR";

const OVERDUE_DAYS = 30;

const FACTURA_DOC_TYPES = new Set([
  "factura",
  "invoice",
]);

const NON_FACTURA_IDS_PREFIXES = Object.freeze([
  "FACTURA_COUNTER_",
  "INVOICE_COUNTER_",
  "COUNTER_",
]);

/* =========================================================
   HELPERS BASE
========================================================= */

function safeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
}

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function round2(value) {
  return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function toMs(value) {
  if (!value) return 0;

  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function pickFirst(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string" && !value.trim()) {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return undefined;
}

function uniqueList(values = []) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const text = safeString(value, "");
    const key = normalizeText(text);

    if (!text || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(text);
  }

  return out;
}

function sameIdentity(a = "", b = "") {
  const left = normalizeText(a);
  const right = normalizeText(b);

  return Boolean(left && right && left === right);
}

function compareText(a, b) {
  return safeString(a, "").localeCompare(
    safeString(b, ""),
    "es",
    {
      sensitivity: "base",
      numeric: true,
    }
  );
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/* =========================================================
   PAYLOAD / ENVELOPE HELPERS
========================================================= */

function isLikelyFactura(value) {
  if (!isObject(value)) {
    return false;
  }

  return Boolean(
    value.id ||
      value._id ||
      value.facturaId ||
      value.invoiceId ||
      value.numero ||
      value.code ||
      value.invoiceNumber ||
      value.numeroFacturaLegal ||
      value.numeroFacturaSistema ||
      value.tipoDocumento ||
      value.entityType ||
      value.total !== undefined ||
      value.totalFactura !== undefined ||
      value.importeTotal !== undefined ||
      value.amount !== undefined ||
      value.invoiceAmount !== undefined ||
      value.cliente ||
      value.client ||
      value.customer ||
      value.clienteSnapshot ||
      value.ticketId ||
      value.incidenciaId ||
      value.ticket ||
      value.incidencia
  );
}

function looksLikeFacturasEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    Array.isArray(obj.facturas) ||
      Array.isArray(obj.items) ||
      Array.isArray(obj.data) ||
      Array.isArray(obj.results) ||
      Array.isArray(obj.rows) ||
      Array.isArray(obj.records) ||
      Array.isArray(obj.list) ||
      Array.isArray(obj.collection) ||
      Array.isArray(obj.payload?.facturas) ||
      Array.isArray(obj.result?.facturas) ||
      Array.isArray(obj.data?.facturas)
  );
}

function resolveNestedArrayEnvelope(value) {
  const obj = safeObject(value);

  if (Array.isArray(value)) return value;

  const direct = pickFirst(
    obj.facturas,
    obj.items,
    obj.data,
    obj.results,
    obj.rows,
    obj.records,
    obj.list,
    obj.collection,

    obj.data?.facturas,
    obj.data?.items,
    obj.data?.results,
    obj.data?.rows,
    obj.data?.records,

    obj.result?.facturas,
    obj.result?.items,
    obj.result?.results,
    obj.result?.rows,
    obj.result?.records,

    obj.payload?.facturas,
    obj.payload?.items,
    obj.payload?.results,
    obj.payload?.rows,
    obj.payload?.records
  );

  if (Array.isArray(direct)) {
    return direct;
  }

  if (looksLikeFacturasEnvelope(obj.data)) {
    return resolveNestedArrayEnvelope(obj.data);
  }

  if (looksLikeFacturasEnvelope(obj.payload)) {
    return resolveNestedArrayEnvelope(obj.payload);
  }

  if (looksLikeFacturasEnvelope(obj.result)) {
    return resolveNestedArrayEnvelope(obj.result);
  }

  return [];
}

function unwrapFacturaPayload(value = {}) {
  if (isLikelyFactura(value)) {
    return safeObject(value);
  }

  const obj = safeObject(value);

  const direct = pickFirst(
    obj.factura,
    obj.invoice,
    obj.item,
    obj.record,

    obj.data?.factura,
    obj.data?.invoice,
    obj.data?.item,
    obj.data?.record,

    obj.result?.factura,
    obj.result?.invoice,
    obj.result?.item,
    obj.result?.record,

    obj.payload?.factura,
    obj.payload?.invoice,
    obj.payload?.item,
    obj.payload?.record
  );

  if (isLikelyFactura(direct)) {
    return safeObject(direct);
  }

  if (isLikelyFactura(obj.data)) {
    return safeObject(obj.data);
  }

  if (isLikelyFactura(obj.result)) {
    return safeObject(obj.result);
  }

  if (isLikelyFactura(obj.payload)) {
    return safeObject(obj.payload);
  }

  return obj;
}

function getRaw(item = {}) {
  const source = safeObject(item);
  return hasOwnKeys(source.raw) ? safeObject(source.raw) : source;
}

/* =========================================================
   TEXTO / FORMATO
========================================================= */

export function truncate(value = "", max = 140) {
  const text = safeString(value, "");
  const size = Math.max(1, safeNumber(max, 140));

  if (text.length <= size) {
    return text;
  }

  return `${text.slice(0, size).trim()}…`;
}

export function formatMoney(value, currency = DEFAULT_FACTURA_CURRENCY) {
  const amount = safeNumber(value, 0);
  const code = safeString(currency, DEFAULT_FACTURA_CURRENCY) || DEFAULT_FACTURA_CURRENCY;

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
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

export function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const diffMs = date.getTime() - Date.now();
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

/* =========================================================
   ESTADOS
========================================================= */

export function normalizeEstadoPago(value = "pending") {
  const map = {
    pagada: "paid",
    pagado: "paid",
    paid: "paid",
    cobrada: "paid",
    abonada: "paid",

    pendiente: "pending",
    pending: "pending",
    unpaid: "pending",

    parcial: "partial",
    partial: "partial",

    vencida: "overdue",
    vencido: "overdue",
    overdue: "overdue",

    borrador: "draft",
    draft: "draft",

    cancelada: "cancelled",
    cancelado: "cancelled",
    cancelled: "cancelled",
    canceled: "cancelled",
  };

  return map[normalizeText(value)] || "pending";
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

    cancelada: "cancelled",
    cancelado: "cancelled",
    cancelled: "cancelled",
    canceled: "cancelled",

    abonada: "paid",
    pagada: "paid",
    paid: "paid",
  };

  return map[normalizeText(value)] || "issued";
}

export function getEstadoPagoLabel(value = "pending") {
  const labels = {
    paid: "Pagada",
    pending: "Pendiente",
    partial: "Pago parcial",
    overdue: "Vencida",
    draft: "Borrador",
    cancelled: "Cancelada",
  };

  return labels[normalizeEstadoPago(value)] || "Pendiente";
}

export function getEstadoLabel(value = "issued") {
  const labels = {
    issued: "Emitida",
    sent: "Enviada",
    void: "Anulada",
    draft: "Borrador",
    cancelled: "Cancelada",
    paid: "Abonada",
  };

  return labels[normalizeEstado(value)] || "Emitida";
}

export function getEstadoPagoChipStyle(value = "pending") {
  const normalized = normalizeEstadoPago(value);

  const tones = {
    paid: `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `,
    pending: `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `,
    partial: `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `,
    overdue: `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `,
    draft: `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `,
    cancelled: `
      color:var(--text-dim);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `,
  };

  return tones[normalized] || tones.pending;
}

export function getEstadoChipStyle(value = "issued") {
  const normalized = normalizeEstado(value);

  const tones = {
    issued: `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `,
    sent: `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `,
    void: `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `,
    cancelled: `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `,
    draft: `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `,
    paid: `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `,
  };

  return tones[normalized] || tones.issued;
}

/* =========================================================
   DOCUMENT TYPE
========================================================= */

export function isFacturaDocument(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  const id = safeString(
    pickFirst(source.id, raw.id),
    ""
  );

  const tipoDocumento = normalizeText(
    pickFirst(source.tipoDocumento, raw.tipoDocumento)
  );

  const entityType = normalizeText(
    pickFirst(source.entityType, raw.entityType)
  );

  const tipo = normalizeText(
    pickFirst(source.tipo, raw.tipo)
  );

  if (NON_FACTURA_IDS_PREFIXES.some((prefix) => id.startsWith(prefix))) {
    return false;
  }

  if (tipo === "contador" || tipo === "counter" || entityType === "counter") {
    return false;
  }

  if (!tipoDocumento && !entityType) {
    return true;
  }

  return FACTURA_DOC_TYPES.has(tipoDocumento) || FACTURA_DOC_TYPES.has(entityType);
}

/* =========================================================
   FACTURA IDENTITY HELPERS
========================================================= */

export function getFacturaIdentityList(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return uniqueList([
    source.id,
    source._id,
    source.facturaId,
    source.invoiceId,

    source.numeroFacturaLegal,
    source.numeroFacturaSistema,
    source.numeroFactura,
    source.invoiceNumber,
    source.facturaNumero,
    source.facturaCode,
    source.code,
    source.numero,

    raw.id,
    raw._id,
    raw.facturaId,
    raw.invoiceId,

    raw.numeroFacturaLegal,
    raw.numeroFacturaSistema,
    raw.numeroFactura,
    raw.invoiceNumber,
    raw.facturaNumero,
    raw.facturaCode,
    raw.code,
    raw.numero,

    source.data?.id,
    source.data?.facturaId,
    source.data?.invoiceId,
    source.data?.numero,

    source.payload?.id,
    source.payload?.facturaId,
    source.payload?.invoiceId,
    source.payload?.numero,

    source.result?.id,
    source.result?.facturaId,
    source.result?.invoiceId,
    source.result?.numero,
  ]);
}

export function getFacturaPrimaryId(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeString(
    pickFirst(
      source.id,
      source._id,
      source.facturaId,
      source.invoiceId,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,

      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.numeroFactura,
      source.invoiceNumber,
      source.numero,

      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.numero
    ),
    ""
  );
}

export function sameFacturaIdentity(a = "", b = "") {
  return sameIdentity(a, b);
}

/* =========================================================
   HELPERS FACTURA
========================================================= */

export function getFacturaNumero(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return (
    safeString(source.numero) ||
    safeString(source.numeroFacturaLegal) ||
    safeString(source.numeroFacturaSistema) ||
    safeString(source.numeroFactura) ||
    safeString(source.invoiceNumber) ||
    safeString(source.facturaNumero) ||
    safeString(source.facturaCode) ||
    safeString(source.code) ||

    safeString(raw.numero) ||
    safeString(raw.numeroFacturaLegal) ||
    safeString(raw.numeroFacturaSistema) ||
    safeString(raw.numeroFactura) ||
    safeString(raw.invoiceNumber) ||
    safeString(raw.facturaNumero) ||
    safeString(raw.facturaCode) ||
    safeString(raw.code) ||

    safeString(source.id) ||
    safeString(source._id) ||
    safeString(source.facturaId) ||
    safeString(source.invoiceId) ||
    "—"
  );
}

export function getFacturaFecha(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return (
    safeString(source.fecha) ||
    safeString(source.fechaFactura) ||
    safeString(source.invoiceDate) ||
    safeString(source.issueDate) ||
    safeString(source.issuedAt) ||
    safeString(source.fechaServicio) ||
    safeString(source.createdAt) ||
    safeString(source.auditoria?.createdAt) ||

    safeString(raw.fecha) ||
    safeString(raw.fechaFactura) ||
    safeString(raw.invoiceDate) ||
    safeString(raw.issueDate) ||
    safeString(raw.issuedAt) ||
    safeString(raw.fechaServicio) ||
    safeString(raw.createdAt) ||
    safeString(raw.auditoria?.createdAt) ||
    null
  );
}

export function getFacturaUpdatedAt(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return (
    safeString(source.updatedAt) ||
    safeString(source.modifiedAt) ||
    safeString(source.fechaEnvio) ||
    safeString(source.sentAt) ||
    safeString(source.mailSentAt) ||
    safeString(source.delivery?.sentAt) ||
    safeString(source.auditoria?.updatedAt) ||

    safeString(raw.updatedAt) ||
    safeString(raw.modifiedAt) ||
    safeString(raw.fechaEnvio) ||
    safeString(raw.sentAt) ||
    safeString(raw.mailSentAt) ||
    safeString(raw.delivery?.sentAt) ||
    safeString(raw.auditoria?.updatedAt) ||

    getFacturaFecha(source) ||
    null
  );
}

export function getFacturaClienteObject(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeObject(
    pickFirst(
      source.cliente,
      source.client,
      source.customer,
      source.clienteSnapshot,
      raw.cliente,
      raw.client,
      raw.customer,
      raw.clienteSnapshot
    )
  );
}

export function getFacturaClienteNombre(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);
  const cliente = getFacturaClienteObject(source);

  return (
    safeString(cliente.nombre) ||
    safeString(cliente.nombreContacto) ||
    safeString(cliente.empresa) ||
    safeString(cliente.razonSocial) ||
    safeString(cliente.nombreFiscal) ||
    safeString(cliente.name) ||
    safeString(cliente.company) ||

    safeString(source.clienteNombre) ||
    safeString(source.clientName) ||
    safeString(source.customerName) ||
    safeString(source.nombreCliente) ||
    safeString(source.owner?.name) ||
    safeString(source.name) ||

    safeString(raw.clienteNombre) ||
    safeString(raw.clientName) ||
    safeString(raw.customerName) ||
    safeString(raw.nombreCliente) ||
    safeString(raw.owner?.name) ||
    safeString(raw.name) ||
    "Cliente"
  );
}

export function getFacturaClienteEmpresa(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);
  const cliente = getFacturaClienteObject(source);

  return (
    safeString(cliente.empresa) ||
    safeString(cliente.razonSocial) ||
    safeString(cliente.nombreFiscal) ||
    safeString(cliente.company) ||
    safeString(cliente.nombre) ||
    safeString(cliente.nombreContacto) ||

    safeString(source.clienteEmpresa) ||
    safeString(source.empresaCliente) ||
    safeString(source.clientCompany) ||

    safeString(raw.clienteEmpresa) ||
    safeString(raw.empresaCliente) ||
    safeString(raw.clientCompany) ||
    "-"
  );
}

export function getFacturaClienteEmail(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);
  const cliente = getFacturaClienteObject(source);

  return (
    safeString(cliente.email) ||
    safeString(cliente.emailLower) ||
    safeString(cliente.mail) ||

    safeString(source.email) ||
    safeString(source.emailCliente) ||
    safeString(source.clienteEmail) ||
    safeString(source.clientEmail) ||
    safeString(source.customerEmail) ||
    safeString(source.owner?.email) ||

    safeString(raw.email) ||
    safeString(raw.emailCliente) ||
    safeString(raw.clienteEmail) ||
    safeString(raw.clientEmail) ||
    safeString(raw.customerEmail) ||
    safeString(raw.owner?.email) ||
    "-"
  );
}

export function getFacturaPreview(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  const lineas = safeArray(
    pickFirst(source.lineas, source.lines, source.items, raw.lineas, raw.lines, raw.items)
  );

  const firstLinea = safeObject(lineas[0]);

  return (
    safeString(source.preview) ||
    safeString(source.descripcion) ||
    safeString(source.description) ||
    safeString(source.concepto) ||

    safeString(raw.preview) ||
    safeString(raw.descripcion) ||
    safeString(raw.description) ||
    safeString(raw.concepto) ||

    safeString(firstLinea.descripcion) ||
    safeString(firstLinea.description) ||
    safeString(firstLinea.concepto) ||
    "Sin detalle"
  );
}

export function getFacturaCurrency(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeString(
    pickFirst(
      source.moneda,
      source.currency,
      source.facturaCurrency,
      source.payment?.currency,

      raw.moneda,
      raw.currency,
      raw.facturaCurrency,
      raw.payment?.currency,

      DEFAULT_FACTURA_CURRENCY
    ),
    DEFAULT_FACTURA_CURRENCY
  ) || DEFAULT_FACTURA_CURRENCY;
}

export function getFacturaTotal(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return round2(
    pickFirst(
      source.total,
      source.totalFactura,
      source.importeTotal,
      source.amount,
      source.invoiceAmount,
      source.importe,
      source.facturaTotal,
      source.totals?.total,
      source.resumen?.total,

      raw.total,
      raw.totalFactura,
      raw.importeTotal,
      raw.amount,
      raw.invoiceAmount,
      raw.importe,
      raw.facturaTotal,
      raw.totals?.total,
      raw.resumen?.total,
      0
    )
  );
}

export function getFacturaBaseImponible(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return round2(
    pickFirst(
      source.baseImponible,
      source.subtotal,
      source.taxableBase,
      source.resumen?.baseImponible,
      source.resumen?.subtotal,

      raw.baseImponible,
      raw.subtotal,
      raw.taxableBase,
      raw.resumen?.baseImponible,
      raw.resumen?.subtotal,
      0
    )
  );
}

export function getFacturaImpuestosTotal(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return round2(
    pickFirst(
      source.impuestosTotal,
      source.taxTotal,
      source.ivaTotal,
      source.iva,
      source.cuotaIVA,
      source.resumen?.impuestosTotal,

      raw.impuestosTotal,
      raw.taxTotal,
      raw.ivaTotal,
      raw.iva,
      raw.cuotaIVA,
      raw.resumen?.impuestosTotal,
      0
    )
  );
}

export function getFacturaDescuentoTotal(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return round2(
    pickFirst(
      source.descuentoTotal,
      source.discountTotal,
      source.resumen?.descuentoTotal,

      raw.descuentoTotal,
      raw.discountTotal,
      raw.resumen?.descuentoTotal,
      0
    )
  );
}

export function getFacturaPaidAmount(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  const direct = pickFirst(
    source.paidAmount,
    source.payment?.paidAmount,
    source.billing?.paidAmount,

    raw.paidAmount,
    raw.payment?.paidAmount,
    raw.billing?.paidAmount
  );

  if (direct !== undefined) {
    return round2(direct);
  }

  const estadoPago = normalizeEstadoPago(
    pickFirst(
      source.estadoPago,
      source.paymentStatus,
      source.payment?.status,
      raw.estadoPago,
      raw.paymentStatus,
      raw.payment?.status
    )
  );

  return estadoPago === "paid" ? getFacturaTotal(source) : 0;
}

export function getFacturaPendingAmount(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  const direct = pickFirst(
    source.pendingAmount,
    source.payment?.pendingAmount,
    source.billing?.pendingAmount,

    raw.pendingAmount,
    raw.payment?.pendingAmount,
    raw.billing?.pendingAmount
  );

  if (direct !== undefined) {
    return round2(direct);
  }

  return round2(Math.max(0, getFacturaTotal(source) - getFacturaPaidAmount(source)));
}

export function getEffectiveEstadoPago(item = {}, now = new Date()) {
  const source = safeObject(item);
  const raw = getRaw(source);

  const estadoPago = normalizeEstadoPago(
    pickFirst(
      source.estadoPago,
      source.paymentStatus,
      source.payment?.status,

      raw.estadoPago,
      raw.paymentStatus,
      raw.payment?.status,
      "pending"
    )
  );

  if (["paid", "cancelled", "draft", "overdue"].includes(estadoPago)) {
    return estadoPago;
  }

  const fechaFactura = getFacturaFecha(source);
  const fechaMs = toMs(fechaFactura);

  if (fechaMs) {
    const diffDays = (now.getTime() - fechaMs) / (1000 * 60 * 60 * 24);

    if (diffDays > OVERDUE_DAYS) {
      return "overdue";
    }
  }

  return estadoPago;
}

export function isFacturaPaid(item = {}) {
  return normalizeEstadoPago(item?.estadoPago) === "paid";
}

export function isFacturaPending(item = {}) {
  const status = normalizeEstadoPago(item?.estadoPago);
  return status === "pending" || status === "partial";
}

export function isFacturaOverdue(item = {}) {
  return normalizeEstadoPago(item?.estadoPago) === "overdue";
}

/* =========================================================
   INCIDENCIA / TICKET PRESERVER
========================================================= */

function pickTicketIdFromArray(value = []) {
  const items = safeArray(value);

  for (const item of items) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = pickFirst(
      item.ticketId,
      item.incidenciaId,
      item.id,
      item.code,
      item.numero,
      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId,

      item.ticket?.ticketId,
      item.ticket?.incidenciaId,
      item.ticket?.id,

      item.incidencia?.ticketId,
      item.incidencia?.incidenciaId,
      item.incidencia?.id,

      item.linkedTicket?.ticketId,
      item.linkedTicket?.incidenciaId,
      item.linkedTicket?.id
    );

    if (candidate) {
      return safeString(candidate, "");
    }
  }

  return null;
}

export function getFacturaIncidenciaId(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  const incidencia = safeObject(pickFirst(source.incidencia, raw.incidencia));
  const ticket = safeObject(pickFirst(source.ticket, raw.ticket));
  const linkedTicket = safeObject(pickFirst(source.linkedTicket, raw.linkedTicket));
  const relatedTicket = safeObject(pickFirst(source.relatedTicket, raw.relatedTicket));
  const relatedIncident = safeObject(pickFirst(source.relatedIncident, raw.relatedIncident));

  const relationTicket = safeObject(pickFirst(source.relations?.ticket, raw.relations?.ticket));
  const relationIncidencia = safeObject(pickFirst(source.relations?.incidencia, raw.relations?.incidencia));

  return safeString(
    pickFirst(
      source.ticketId,
      source.incidenciaId,

      incidencia.ticketId,
      incidencia.id,
      incidencia.incidenciaId,

      ticket.ticketId,
      ticket.id,
      ticket.incidenciaId,

      linkedTicket.ticketId,
      linkedTicket.id,
      linkedTicket.incidenciaId,

      relatedTicket.ticketId,
      relatedTicket.id,
      relatedTicket.incidenciaId,

      relatedIncident.ticketId,
      relatedIncident.id,
      relatedIncident.incidenciaId,

      relationTicket.ticketId,
      relationTicket.id,
      relationTicket.incidenciaId,

      relationIncidencia.ticketId,
      relationIncidencia.id,
      relationIncidencia.incidenciaId,

      source.relatedTicketId,
      source.relatedIncidentId,
      source.supportTicketId,
      source.caseId,

      source.meta?.ticketId,
      source.meta?.incidenciaId,

      pickTicketIdFromArray(source.ticketIds),
      pickTicketIdFromArray(source.incidenciaIds),
      pickTicketIdFromArray(source.relatedTicketIds),
      pickTicketIdFromArray(source.relatedIncidentIds),
      pickTicketIdFromArray(source.linkedTickets),
      pickTicketIdFromArray(source.incidencias),
      pickTicketIdFromArray(source.tickets),
      pickTicketIdFromArray(source.relatedTickets),
      pickTicketIdFromArray(source.relations),
      pickTicketIdFromArray(source.facturasRelacionadas),
      pickTicketIdFromArray(source.linkedInvoices?.tickets),
      pickTicketIdFromArray(source.invoiceLinks),
      pickTicketIdFromArray(source.invoiceRelations),

      raw.ticketId,
      raw.incidenciaId,

      raw.incidencia?.ticketId,
      raw.incidencia?.id,
      raw.incidencia?.incidenciaId,

      raw.ticket?.ticketId,
      raw.ticket?.id,
      raw.ticket?.incidenciaId,

      raw.linkedTicket?.ticketId,
      raw.linkedTicket?.id,
      raw.linkedTicket?.incidenciaId,

      raw.relatedTicket?.ticketId,
      raw.relatedTicket?.id,
      raw.relatedTicket?.incidenciaId,

      raw.relatedIncident?.ticketId,
      raw.relatedIncident?.id,
      raw.relatedIncident?.incidenciaId,

      raw.relations?.ticket?.ticketId,
      raw.relations?.ticket?.id,
      raw.relations?.ticket?.incidenciaId,

      raw.relations?.incidencia?.ticketId,
      raw.relations?.incidencia?.id,
      raw.relations?.incidencia?.incidenciaId,

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
      pickTicketIdFromArray(raw.relations),
      pickTicketIdFromArray(raw.facturasRelacionadas),
      pickTicketIdFromArray(raw.linkedInvoices?.tickets),
      pickTicketIdFromArray(raw.invoiceLinks),
      pickTicketIdFromArray(raw.invoiceRelations)
    ),
    ""
  );
}

export function hasFacturaIncidencia(item = {}) {
  return Boolean(getFacturaIncidenciaId(item));
}

export function buildFacturaIncidenciaPayload(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  const incidencia = safeObject(pickFirst(source.incidencia, raw.incidencia));
  const ticket = safeObject(pickFirst(source.ticket, raw.ticket));
  const linkedTicket = safeObject(pickFirst(source.linkedTicket, raw.linkedTicket));
  const relatedTicket = safeObject(pickFirst(source.relatedTicket, raw.relatedTicket));
  const relationTicket = safeObject(pickFirst(source.relations?.ticket, raw.relations?.ticket));

  const incidenciaId = getFacturaIncidenciaId(source);

  if (!incidenciaId) {
    return null;
  }

  const subject = safeString(
    pickFirst(
      incidencia.subject,
      incidencia.asunto,
      incidencia.title,

      ticket.subject,
      ticket.asunto,
      ticket.title,

      linkedTicket.subject,
      linkedTicket.asunto,
      linkedTicket.title,

      relatedTicket.subject,
      relatedTicket.asunto,
      relatedTicket.title,

      relationTicket.subject,
      relationTicket.asunto,
      relationTicket.title,

      "Incidencia relacionada"
    ),
    "Incidencia relacionada"
  );

  return {
    ...incidencia,

    id: incidenciaId,
    ticketId: incidenciaId,
    incidenciaId,

    code: safeString(
      pickFirst(
        incidencia.code,
        ticket.code,
        linkedTicket.code,
        relatedTicket.code,
        relationTicket.code,
        incidenciaId
      ),
      incidenciaId
    ),

    ticketCode: safeString(
      pickFirst(
        incidencia.ticketCode,
        ticket.ticketCode,
        linkedTicket.ticketCode,
        relatedTicket.ticketCode,
        relationTicket.ticketCode,
        incidenciaId
      ),
      incidenciaId
    ),

    subject,
    asunto: safeString(pickFirst(incidencia.asunto, subject), subject),
    title: safeString(pickFirst(incidencia.title, subject), subject),

    clienteId: safeString(
      pickFirst(
        incidencia.clienteId,
        ticket.clienteId,
        linkedTicket.clienteId,
        relatedTicket.clienteId,
        relationTicket.clienteId,

        source.clienteId,
        source.cliente?.id,
        source.clientId,
        source.client?.id,

        raw.clienteId,
        raw.cliente?.id,
        raw.clientId,
        raw.client?.id,
        ""
      ),
      ""
    ),

    clienteNombre: safeString(
      pickFirst(
        incidencia.clienteNombre,
        incidencia.name,
        incidencia.nombre,

        ticket.clienteNombre,
        ticket.name,
        ticket.nombre,

        linkedTicket.clienteNombre,
        linkedTicket.name,
        linkedTicket.nombre,

        relatedTicket.clienteNombre,
        relatedTicket.name,
        relatedTicket.nombre,

        relationTicket.clienteNombre,
        relationTicket.name,
        relationTicket.nombre,

        getFacturaClienteNombre(source),
        ""
      ),
      ""
    ),

    relationType: safeString(
      pickFirst(
        incidencia.relationType,
        ticket.relationType,
        linkedTicket.relationType,
        relatedTicket.relationType,
        relationTicket.relationType,
        source.relationType,
        raw.relationType,
        "linked_ticket"
      ),
      "linked_ticket"
    ),

    linkedAt: safeString(
      pickFirst(
        incidencia.linkedAt,
        ticket.linkedAt,
        linkedTicket.linkedAt,
        relatedTicket.linkedAt,
        relationTicket.linkedAt,
        source.linkedAt,
        raw.linkedAt,
        source.updatedAt,
        raw.updatedAt,
        ""
      ),
      ""
    ),

    linkedAtES: safeString(
      pickFirst(
        incidencia.linkedAtES,
        ticket.linkedAtES,
        linkedTicket.linkedAtES,
        relatedTicket.linkedAtES,
        relationTicket.linkedAtES,
        source.linkedAtES,
        raw.linkedAtES,
        source.updatedAtES,
        raw.updatedAtES,
        ""
      ),
      ""
    ),
  };
}

function mergeRawIncidencia(raw = {}, incidenciaId = "", incidenciaPayload = null) {
  const base = safeObject(raw);

  if (!incidenciaId) {
    return base;
  }

  return {
    ...base,

    ticketId: safeString(pickFirst(base.ticketId, incidenciaId), incidenciaId),
    incidenciaId: safeString(pickFirst(base.incidenciaId, incidenciaId), incidenciaId),

    relatedTicketId: safeString(
      pickFirst(base.relatedTicketId, incidenciaId),
      incidenciaId
    ),

    relatedIncidentId: safeString(
      pickFirst(base.relatedIncidentId, incidenciaId),
      incidenciaId
    ),

    supportTicketId: safeString(
      pickFirst(base.supportTicketId, incidenciaId),
      incidenciaId
    ),

    caseId: safeString(
      pickFirst(base.caseId, incidenciaId),
      incidenciaId
    ),

    incidencia: hasOwnKeys(base.incidencia)
      ? {
          ...incidenciaPayload,
          ...base.incidencia,
          id: safeString(pickFirst(base.incidencia?.id, incidenciaId), incidenciaId),
          ticketId: safeString(pickFirst(base.incidencia?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeString(pickFirst(base.incidencia?.incidenciaId, incidenciaId), incidenciaId),
        }
      : incidenciaPayload,

    ticket: hasOwnKeys(base.ticket)
      ? {
          ...incidenciaPayload,
          ...base.ticket,
          id: safeString(pickFirst(base.ticket?.id, incidenciaId), incidenciaId),
          ticketId: safeString(pickFirst(base.ticket?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeString(pickFirst(base.ticket?.incidenciaId, incidenciaId), incidenciaId),
        }
      : incidenciaPayload,

    linkedTicket: hasOwnKeys(base.linkedTicket)
      ? {
          ...incidenciaPayload,
          ...base.linkedTicket,
          id: safeString(pickFirst(base.linkedTicket?.id, incidenciaId), incidenciaId),
          ticketId: safeString(pickFirst(base.linkedTicket?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeString(pickFirst(base.linkedTicket?.incidenciaId, incidenciaId), incidenciaId),
        }
      : incidenciaPayload,

    meta: {
      ...safeObject(base.meta),
      hasIncidencia: true,
      incidenciaId,
      ticketId: incidenciaId,
    },
  };
}

function preserveFacturaIncidenciaFields(normalized = {}, original = {}) {
  const base = safeObject(normalized);
  const source = safeObject(original);

  const sourceRaw = getRaw(source);
  const baseRaw = getRaw(base);

  const raw = {
    ...sourceRaw,
    ...baseRaw,
  };

  const probe = {
    ...source,
    ...base,
    raw,
  };

  const incidenciaId = getFacturaIncidenciaId(probe);
  const incidenciaPayload = buildFacturaIncidenciaPayload(probe);

  if (!incidenciaId) {
    return {
      ...base,

      raw,

      meta: {
        ...safeObject(source.meta),
        ...safeObject(base.meta),
        hasIncidencia: Boolean(
          pickFirst(
            source.meta?.hasIncidencia,
            base.meta?.hasIncidencia,
            raw.meta?.hasIncidencia,
            false
          )
        ),
      },
    };
  }

  const nextRaw = mergeRawIncidencia(raw, incidenciaId, incidenciaPayload);

  return {
    ...base,

    ticketId: incidenciaId,
    incidenciaId,

    relatedTicketId: safeString(
      pickFirst(
        base.relatedTicketId,
        source.relatedTicketId,
        nextRaw.relatedTicketId,
        incidenciaId
      ),
      incidenciaId
    ),

    relatedIncidentId: safeString(
      pickFirst(
        base.relatedIncidentId,
        source.relatedIncidentId,
        nextRaw.relatedIncidentId,
        incidenciaId
      ),
      incidenciaId
    ),

    supportTicketId: safeString(
      pickFirst(
        base.supportTicketId,
        source.supportTicketId,
        nextRaw.supportTicketId,
        incidenciaId
      ),
      incidenciaId
    ),

    caseId: safeString(
      pickFirst(
        base.caseId,
        source.caseId,
        nextRaw.caseId,
        incidenciaId
      ),
      incidenciaId
    ),

    incidencia: incidenciaPayload,

    ticket: hasOwnKeys(pickFirst(base.ticket, source.ticket, nextRaw.ticket))
      ? {
          ...incidenciaPayload,
          ...safeObject(pickFirst(base.ticket, source.ticket, nextRaw.ticket)),
        }
      : incidenciaPayload,

    linkedTicket: hasOwnKeys(pickFirst(base.linkedTicket, source.linkedTicket, nextRaw.linkedTicket))
      ? {
          ...incidenciaPayload,
          ...safeObject(pickFirst(base.linkedTicket, source.linkedTicket, nextRaw.linkedTicket)),
        }
      : incidenciaPayload,

    relationType: safeString(
      pickFirst(
        base.relationType,
        source.relationType,
        nextRaw.relationType,
        incidenciaPayload?.relationType,
        "linked_ticket"
      ),
      "linked_ticket"
    ),

    meta: {
      ...safeObject(source.meta),
      ...safeObject(base.meta),
      ...safeObject(nextRaw.meta),
      hasIncidencia: true,
      incidenciaId,
      ticketId: incidenciaId,
    },

    raw: nextRaw,
  };
}

/* =========================================================
   NORMALIZACIÓN PRINCIPAL
========================================================= */

export function normalizeFactura(item = {}) {
  const source = unwrapFacturaPayload(item);
  const raw = getRaw(source);

  const facturaId = getFacturaPrimaryId(source);
  const numero = getFacturaNumero(source);

  const estadoPago = getEffectiveEstadoPago(source);

  const estado = normalizeEstado(
    pickFirst(
      source.estado,
      source.status,
      raw.estado,
      raw.status,
      "issued"
    )
  );

  const clienteNombre = getFacturaClienteNombre(source);
  const clienteEmpresa = getFacturaClienteEmpresa(source);
  const clienteEmail = getFacturaClienteEmail(source);

  const currency = getFacturaCurrency(source);
  const fecha = getFacturaFecha(source);

  const fechaEnvio =
    safeString(source.fechaEnvio) ||
    safeString(source.sentAt) ||
    safeString(source.mailSentAt) ||
    safeString(source.delivery?.sentAt) ||
    safeString(raw.fechaEnvio) ||
    safeString(raw.sentAt) ||
    safeString(raw.mailSentAt) ||
    safeString(raw.delivery?.sentAt) ||
    null;

  const updatedAt = getFacturaUpdatedAt(source);

  const lineas = safeArray(
    pickFirst(source.lineas, source.lines, raw.lineas, raw.lines)
  );

  const impuestos = safeArray(
    pickFirst(source.impuestos, source.taxes, raw.impuestos, raw.taxes)
  );

  const attachments = safeArray(
    pickFirst(
      source.attachments,
      source.files,
      source.adjuntos,
      raw.attachments,
      raw.files,
      raw.adjuntos
    )
  );

  const clienteId = pickFirst(
    source.clienteId,
    source.clientId,
    source.customerId,
    source.cliente?.id,
    source.client?.id,
    source.customer?.id,
    source.clienteSnapshot?.id,
    source.clienteSnapshot?.clienteId,

    raw.clienteId,
    raw.clientId,
    raw.customerId,
    raw.cliente?.id,
    raw.client?.id,
    raw.customer?.id,
    raw.clienteSnapshot?.id,
    raw.clienteSnapshot?.clienteId,

    source.userId,
    raw.userId,
    null
  );

  const total = getFacturaTotal(source);
  const baseImponible = getFacturaBaseImponible(source);
  const impuestosTotal = getFacturaImpuestosTotal(source);
  const descuentoTotal = getFacturaDescuentoTotal(source);

  const pdfUrl = safeString(
    pickFirst(
      source.pdfUrl,
      source.file?.url,
      source.url,
      source.downloadUrl,
      source.viewUrl,

      raw.pdfUrl,
      raw.file?.url,
      raw.url,
      raw.downloadUrl,
      raw.viewUrl,
      ""
    ),
    ""
  );

  const blobPath = safeString(
    pickFirst(
      source.blobPath,
      source.pdfBlobPath,
      source.file?.blobPath,
      raw.blobPath,
      raw.pdfBlobPath,
      raw.file?.blobPath,
      ""
    ),
    ""
  );

  const hasPdf = Boolean(
    safeBoolean(source.hasPdf, false) ||
      safeBoolean(source.pdfAvailable, false) ||
      safeBoolean(raw.hasPdf, false) ||
      safeBoolean(raw.pdfAvailable, false) ||
      pdfUrl ||
      blobPath
  );

  const normalized = {
    ...source,

    id: facturaId || numero || "",
    _id: safeString(pickFirst(source._id, raw._id), "") || null,
    facturaId: facturaId || numero || "",
    invoiceId: safeString(pickFirst(source.invoiceId, raw.invoiceId, facturaId || numero), facturaId || numero),

    numero,

    numeroFacturaLegal: safeString(
      pickFirst(source.numeroFacturaLegal, raw.numeroFacturaLegal),
      ""
    ),

    numeroFacturaSistema: safeString(
      pickFirst(source.numeroFacturaSistema, raw.numeroFacturaSistema),
      ""
    ),

    invoiceNumber: safeString(
      pickFirst(source.invoiceNumber, raw.invoiceNumber, numero),
      numero
    ),

    code: safeString(
      pickFirst(source.code, raw.code, numero),
      numero
    ),

    fecha,
    fechaFactura: safeString(
      pickFirst(source.fechaFactura, raw.fechaFactura, fecha),
      fecha || ""
    ) || null,

    fechaEnvio,
    updatedAt,

    createdAt:
      safeString(source.createdAt) ||
      safeString(source.auditoria?.createdAt) ||
      safeString(raw.createdAt) ||
      safeString(raw.auditoria?.createdAt) ||
      null,

    estadoPago,
    paymentStatus: estadoPago,

    estado,
    status: estado,

    total,
    amount: total,
    importe: total,
    importeTotal: total,

    subtotal: round2(
      pickFirst(
        source.subtotal,
        source.resumen?.subtotal,
        raw.subtotal,
        raw.resumen?.subtotal,
        0
      )
    ),

    baseImponible,
    descuentoTotal,
    impuestosTotal,

    iva: round2(
      pickFirst(
        source.iva,
        source.ivaTotal,
        source.cuotaIVA,
        raw.iva,
        raw.ivaTotal,
        raw.cuotaIVA,
        0
      )
    ),

    ivaTotal: round2(
      pickFirst(
        source.ivaTotal,
        source.iva,
        source.cuotaIVA,
        raw.ivaTotal,
        raw.iva,
        raw.cuotaIVA,
        0
      )
    ),

    irpf: round2(
      pickFirst(
        source.irpf,
        source.irpfTotal,
        source.retencionIRPF,
        source.retencion,
        raw.irpf,
        raw.irpfTotal,
        raw.retencionIRPF,
        raw.retencion,
        0
      )
    ),

    irpfTotal: round2(
      pickFirst(
        source.irpfTotal,
        source.irpf,
        source.retencionIRPF,
        source.retencion,
        raw.irpfTotal,
        raw.irpf,
        raw.retencionIRPF,
        raw.retencion,
        0
      )
    ),

    moneda: currency,
    currency,

    paidAmount: getFacturaPaidAmount(source),
    pendingAmount: getFacturaPendingAmount(source),

    formaPago:
      safeString(source.formaPago) ||
      safeString(source.metodoPago) ||
      safeString(source.paymentMethod) ||
      safeString(raw.formaPago) ||
      safeString(raw.metodoPago) ||
      safeString(raw.paymentMethod) ||
      "—",

    cuentaPago:
      safeString(source.cuentaPago) ||
      safeString(source.paymentAccount) ||
      safeString(raw.cuentaPago) ||
      safeString(raw.paymentAccount) ||
      "",

    preview: getFacturaPreview(source),

    lineasCount: safeNumber(
      pickFirst(source.lineasCount, raw.lineasCount),
      lineas.length
    ),

    attachmentsCount: safeNumber(
      pickFirst(source.attachmentsCount, raw.attachmentsCount),
      attachments.length
    ),

    hasPdf,
    pdfAvailable: hasPdf,
    pdfUrl,
    blobPath,

    clienteId,

    clienteNombre,
    clienteEmpresa,
    clienteEmail,

    cliente: {
      ...safeObject(pickFirst(raw.cliente, raw.client, raw.customer, raw.clienteSnapshot)),
      ...safeObject(pickFirst(source.cliente, source.client, source.customer, source.clienteSnapshot)),

      id: clienteId ?? null,

      nombre: clienteNombre,

      nombreContacto:
        safeString(source?.cliente?.nombreContacto) ||
        safeString(source?.client?.contactName) ||
        safeString(raw?.cliente?.nombreContacto) ||
        safeString(raw?.client?.contactName) ||
        clienteNombre,

      empresa: clienteEmpresa,

      razonSocial:
        safeString(source?.cliente?.razonSocial) ||
        safeString(source?.client?.company) ||
        safeString(raw?.cliente?.razonSocial) ||
        safeString(raw?.client?.company) ||
        clienteEmpresa,

      email: clienteEmail,

      telefono:
        safeString(source?.cliente?.telefono) ||
        safeString(source?.client?.phone) ||
        safeString(source?.telefonoCliente) ||
        safeString(raw?.cliente?.telefono) ||
        safeString(raw?.client?.phone) ||
        safeString(raw?.telefonoCliente) ||
        "",

      nif:
        safeString(source?.cliente?.nif) ||
        safeString(source?.cliente?.vatId) ||
        safeString(raw?.cliente?.nif) ||
        safeString(raw?.cliente?.vatId) ||
        "",

      avatar:
        source?.cliente?.avatar ??
        source?.client?.avatar ??
        source?.customer?.avatar ??
        source?.owner?.avatar ??
        raw?.cliente?.avatar ??
        raw?.client?.avatar ??
        raw?.customer?.avatar ??
        raw?.owner?.avatar ??
        null,

      initials: getInitials(
        clienteEmpresa && clienteEmpresa !== "-" ? clienteEmpresa : clienteNombre
      ),

      direccion: {
        calle:
          safeString(source?.cliente?.direccion?.calle) ||
          safeString(source?.client?.address?.street) ||
          safeString(raw?.cliente?.direccion?.calle) ||
          safeString(raw?.client?.address?.street),

        linea2:
          safeString(source?.cliente?.direccion?.linea2) ||
          safeString(source?.client?.address?.line2) ||
          safeString(raw?.cliente?.direccion?.linea2) ||
          safeString(raw?.client?.address?.line2),

        cp:
          safeString(source?.cliente?.direccion?.cp) ||
          safeString(source?.client?.address?.zip) ||
          safeString(raw?.cliente?.direccion?.cp) ||
          safeString(raw?.client?.address?.zip),

        ciudad:
          safeString(source?.cliente?.direccion?.ciudad) ||
          safeString(source?.client?.address?.city) ||
          safeString(raw?.cliente?.direccion?.ciudad) ||
          safeString(raw?.client?.address?.city),

        provincia:
          safeString(source?.cliente?.direccion?.provincia) ||
          safeString(source?.client?.address?.state) ||
          safeString(raw?.cliente?.direccion?.provincia) ||
          safeString(raw?.client?.address?.state),

        pais:
          safeString(source?.cliente?.direccion?.pais) ||
          safeString(source?.client?.address?.country) ||
          safeString(raw?.cliente?.direccion?.pais) ||
          safeString(raw?.client?.address?.country),
      },
    },

    owner: {
      id: source?.owner?.id ?? raw?.owner?.id ?? source?.userId ?? raw?.userId ?? null,

      name:
        safeString(source?.owner?.name) ||
        safeString(raw?.owner?.name) ||
        safeString(source?.name) ||
        safeString(raw?.name) ||
        "",

      email:
        safeString(source?.owner?.email) ||
        safeString(raw?.owner?.email) ||
        "",

      avatar: source?.owner?.avatar ?? raw?.owner?.avatar ?? null,
    },

    concepto:
      safeString(source.concepto) ||
      safeString(raw.concepto) ||
      safeString(lineas[0]?.concepto) ||
      "Factura",

    descripcion:
      safeString(source.descripcion) ||
      safeString(source.description) ||
      safeString(raw.descripcion) ||
      safeString(raw.description) ||
      safeString(lineas[0]?.descripcion) ||
      "",

    lineas: lineas.map((entry, index) => {
      const linea = safeObject(entry);

      return {
        id: linea.id ?? `linea-${index + 1}`,
        concepto: safeString(linea.concepto),
        descripcion: safeString(linea.descripcion || linea.description),
        cantidad: safeNumber(linea.cantidad ?? linea.quantity, 0),
        precioUnitario: round2(linea.precioUnitario ?? linea.unitPrice),
        subtotal: round2(linea.subtotal),
        descuento: round2(linea.descuento ?? linea.discount),
        impuesto: round2(linea.impuesto ?? linea.tax),
        totalLinea: round2(
          pickFirst(linea.totalLinea, linea.total, linea.importe, linea.amount, 0)
        ),
        raw: linea,
      };
    }),

    impuestos: impuestos.map((entry) => {
      const impuesto = safeObject(entry);

      return {
        tipo: safeString(impuesto.tipo || impuesto.type),
        nombre: safeString(impuesto.nombre || impuesto.name || impuesto.tipo || impuesto.type),
        porcentaje: safeNumber(impuesto.porcentaje ?? impuesto.percent ?? impuesto.rate, 0),
        base: round2(impuesto.base),
        importe: round2(impuesto.importe ?? impuesto.amount),
        raw: impuesto,
      };
    }),

    attachments: attachments.map((entry, index) => {
      const file = safeObject(entry);

      return {
        id: file.id ?? file.blobName ?? file.path ?? `attachment-${index + 1}`,

        name:
          safeString(file.name) ||
          safeString(file.filename) ||
          safeString(file.fileName) ||
          safeString(file.originalName) ||
          `archivo_${index + 1}`,

        url:
          safeString(file.url) ||
          safeString(file.href) ||
          safeString(file.path) ||
          safeString(file.downloadUrl) ||
          "#",

        size: safeNumber(file.size ?? file.sizeBytes, 0),

        mimeType:
          safeString(file.mimeType) ||
          safeString(file.contentType) ||
          "",

        raw: file,
      };
    }),

    notas:
      safeString(source.notas) ||
      safeString(source.observaciones) ||
      safeString(raw.notas) ||
      safeString(raw.observaciones) ||
      "",

    enviadoA:
      safeString(source.enviadoA) ||
      safeString(source.sentTo) ||
      safeString(raw.enviadoA) ||
      safeString(raw.sentTo) ||
      "",

    sendHistory: safeArray(
      pickFirst(source.sendHistory, raw.sendHistory)
    ).map((entry) => {
      const itemHistory = safeObject(entry);

      return {
        at: safeString(itemHistory?.at) || null,
        to: safeString(itemHistory?.to),
        byUserId: safeString(itemHistory?.byUserId),
        byRole: safeString(itemHistory?.byRole),
        channel: safeString(itemHistory?.channel, "email"),
        requestId: safeString(itemHistory?.requestId),
        raw: itemHistory,
      };
    }),

    updatedBy:
      safeString(source.updatedBy) ||
      safeString(source?.auditoria?.updatedBy) ||
      safeString(raw.updatedBy) ||
      safeString(raw?.auditoria?.updatedBy) ||
      "",

    createdBy:
      safeString(source.createdBy) ||
      safeString(source?.auditoria?.createdBy) ||
      safeString(raw.createdBy) ||
      safeString(raw?.auditoria?.createdBy) ||
      "",

    estadoDetalle:
      safeString(source.estadoDetalle) ||
      safeString(raw.estadoDetalle) ||
      "",

    tipoDocumento:
      safeString(source.tipoDocumento) ||
      safeString(raw.tipoDocumento) ||
      "factura",

    entityType:
      safeString(source.entityType) ||
      safeString(raw.entityType) ||
      "invoice",

    meta: {
      ...safeObject(raw.meta),
      ...safeObject(source.meta),

      timestampMs: toMs(updatedAt) || toMs(fecha) || 0,
      fechaMs: toMs(fecha) || 0,
      updatedAtMs: toMs(updatedAt) || 0,

      isPaid: estadoPago === "paid",
      isPending: estadoPago === "pending" || estadoPago === "partial",
      isOverdue: estadoPago === "overdue",

      identities: getFacturaIdentityList(source),
    },

    raw: {
      ...raw,
      ...source,
    },
  };

  return preserveFacturaIncidenciaFields(normalized, source);
}

/* =========================================================
   EXTRACCIÓN DE RESPUESTAS
========================================================= */

export function extractFacturas(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (looksLikeFacturasEnvelope(response)) {
    return resolveNestedArrayEnvelope(response);
  }

  const obj = safeObject(response);

  const direct = pickFirst(
    obj.facturas,
    obj.items,
    obj.rows,
    obj.results,
    obj.records,
    obj.list,
    obj.collection,

    obj.data?.facturas,
    obj.data?.items,
    obj.data?.rows,
    obj.data?.results,
    obj.data?.records,

    obj.result?.facturas,
    obj.result?.items,
    obj.result?.rows,
    obj.result?.results,
    obj.result?.records,

    obj.payload?.facturas,
    obj.payload?.items,
    obj.payload?.rows,
    obj.payload?.results,
    obj.payload?.records
  );

  return safeArray(direct);
}

export function extractNormalizedFacturas(response) {
  return extractFacturas(response)
    .filter(isFacturaDocument)
    .map(normalizeFactura);
}

export function getRemoteCount(response, fallback = 0) {
  const obj = safeObject(response);

  return safeNumber(
    pickFirst(
      obj.total,
      obj.count,
      obj.remoteCount,
      obj.totalCount,

      obj.meta?.total,
      obj.meta?.count,
      obj.meta?.remoteCount,
      obj.meta?.totalCount,

      obj.pagination?.total,
      obj.pagination?.count,
      obj.pagination?.totalItems,

      obj.data?.total,
      obj.data?.count,
      obj.data?.remoteCount,
      obj.data?.totalCount,

      obj.result?.total,
      obj.result?.count,
      obj.result?.remoteCount,
      obj.result?.totalCount,

      obj.payload?.total,
      obj.payload?.count,
      obj.payload?.remoteCount,
      obj.payload?.totalCount,

      fallback
    ),
    fallback
  );
}

export function extractStats(response) {
  const obj = safeObject(response);

  return (
    obj.stats ||
    obj.data?.stats ||
    obj.result?.stats ||
    obj.payload?.stats ||
    obj.meta?.stats ||
    null
  );
}

/* =========================================================
   MÉTRICAS
========================================================= */

export function sumFacturasTotal(items = []) {
  return round2(
    safeArray(items).reduce(
      (acc, item) => acc + getFacturaTotal(item),
      0
    )
  );
}

export function sumFacturasBase(items = []) {
  return round2(
    safeArray(items).reduce(
      (acc, item) => acc + getFacturaBaseImponible(item),
      0
    )
  );
}

export function countFacturasByEstadoPago(items = [], target = "pending") {
  const normalizedTarget = normalizeEstadoPago(target);

  return safeArray(items).reduce((acc, item) => {
    const factura = normalizeFactura(item);
    return acc + (normalizeEstadoPago(factura?.estadoPago) === normalizedTarget ? 1 : 0);
  }, 0);
}

export function countFacturasByEstado(items = [], target = "issued") {
  const normalizedTarget = normalizeEstado(target);

  return safeArray(items).reduce((acc, item) => {
    const factura = normalizeFactura(item);
    return acc + (normalizeEstado(factura?.estado) === normalizedTarget ? 1 : 0);
  }, 0);
}

export function computeFacturasStats(items = []) {
  const facturas = safeArray(items).map(normalizeFactura);

  const totalFacturas = facturas.length;
  const totalImporte = sumFacturasTotal(facturas);
  const totalBase = sumFacturasBase(facturas);

  const paidCount = countFacturasByEstadoPago(facturas, "paid");
  const pendingCount = facturas.filter(isFacturaPending).length;
  const overdueCount = facturas.filter(isFacturaOverdue).length;
  const partialCount = countFacturasByEstadoPago(facturas, "partial");
  const draftCount = countFacturasByEstadoPago(facturas, "draft");
  const cancelledCount = countFacturasByEstadoPago(facturas, "cancelled");
  const linkedTicketCount = facturas.filter(hasFacturaIncidencia).length;

  return {
    totalFacturas,
    totalImporte,
    totalBase,

    paidCount,
    pendingCount,
    overdueCount,
    partialCount,
    draftCount,
    cancelledCount,
    linkedTicketCount,

    countTotal: totalFacturas,
    countPagadas: paidCount,
    countPendientes: pendingCount,
    countVencidas: overdueCount,
    countConIncidencia: linkedTicketCount,

    byStatus: {
      paid: paidCount,
      pending: countFacturasByEstadoPago(facturas, "pending"),
      partial: partialCount,
      overdue: overdueCount,
      draft: draftCount,
      cancelled: cancelledCount,
    },
  };
}

/* =========================================================
   ORDENACIÓN
========================================================= */

export function sortFacturas(items = [], sort = DEFAULT_FACTURAS_SORT) {
  const field = safeString(sort?.field, DEFAULT_FACTURAS_SORT.field);
  const direction =
    safeString(sort?.direction, DEFAULT_FACTURAS_SORT.direction).toLowerCase() === "asc"
      ? 1
      : -1;

  const list = safeArray(items).map(normalizeFactura);

  list.sort((a, b) => {
    if (field === "cliente") {
      const av = normalizeText(
        pickFirst(a?.cliente?.empresa, a?.cliente?.nombre, a?.clienteNombre)
      );
      const bv = normalizeText(
        pickFirst(b?.cliente?.empresa, b?.cliente?.nombre, b?.clienteNombre)
      );

      return compareText(av, bv) * direction;
    }

    if (field === "numero") {
      return compareText(a?.numero, b?.numero) * direction;
    }

    if (field === "total") {
      return (safeNumber(a?.total, 0) - safeNumber(b?.total, 0)) * direction;
    }

    if (field === "fecha") {
      return (toMs(a?.fecha) - toMs(b?.fecha)) * direction;
    }

    if (field === "updatedAt") {
      return (toMs(a?.updatedAt) - toMs(b?.updatedAt)) * direction;
    }

    if (field === "estadoPago") {
      return compareText(a?.estadoPago, b?.estadoPago) * direction;
    }

    if (field === "estado") {
      return compareText(a?.estado, b?.estado) * direction;
    }

    const av = normalizeText(a?.[field]);
    const bv = normalizeText(b?.[field]);

    return compareText(av, bv) * direction;
  });

  return list;
}

/* =========================================================
   FILTRADO
========================================================= */

export function filterFacturas(items = [], filters = {}) {
  const query = normalizeText(filters?.query || filters?.search);
  const estadoPago = normalizeText(filters?.estadoPago);
  const estado = normalizeText(filters?.estado);
  const formaPago = normalizeText(filters?.formaPago);
  const clienteId = normalizeText(filters?.clienteId);
  const incidenciaId = normalizeText(filters?.incidenciaId || filters?.ticketId);

  return safeArray(items)
    .map(normalizeFactura)
    .filter((factura) => {
      const facturaIncidenciaId = normalizeText(getFacturaIncidenciaId(factura));

      const matchQuery =
        !query ||
        normalizeText(factura.numero).includes(query) ||
        normalizeText(factura.id).includes(query) ||
        normalizeText(factura.facturaId).includes(query) ||
        normalizeText(factura.invoiceId).includes(query) ||
        normalizeText(factura.cliente?.empresa).includes(query) ||
        normalizeText(factura.cliente?.nombre).includes(query) ||
        normalizeText(factura.cliente?.email).includes(query) ||
        normalizeText(factura.concepto).includes(query) ||
        normalizeText(factura.descripcion).includes(query) ||
        normalizeText(factura.preview).includes(query) ||
        facturaIncidenciaId.includes(query);

      const matchEstadoPago =
        !estadoPago ||
        estadoPago === "all" ||
        normalizeEstadoPago(factura.estadoPago) === normalizeEstadoPago(estadoPago);

      const matchEstado =
        !estado ||
        estado === "all" ||
        normalizeEstado(factura.estado) === normalizeEstado(estado);

      const matchFormaPago =
        !formaPago ||
        formaPago === "all" ||
        normalizeText(factura.formaPago).includes(formaPago);

      const matchClienteId =
        !clienteId ||
        normalizeText(factura.clienteId).includes(clienteId) ||
        normalizeText(factura.cliente?.id).includes(clienteId);

      const matchIncidenciaId =
        !incidenciaId ||
        facturaIncidenciaId.includes(incidenciaId);

      return (
        matchQuery &&
        matchEstadoPago &&
        matchEstado &&
        matchFormaPago &&
        matchClienteId &&
        matchIncidenciaId
      );
    });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_FACTURAS_SORT,
  DEFAULT_FACTURA_CURRENCY,

  truncate,
  formatMoney,
  formatDate,
  formatDateTime,
  formatRelativeDate,
  getInitials,

  normalizeEstadoPago,
  normalizeEstado,
  getEstadoPagoLabel,
  getEstadoLabel,
  getEstadoPagoChipStyle,
  getEstadoChipStyle,

  isFacturaDocument,

  getFacturaIdentityList,
  getFacturaPrimaryId,
  sameFacturaIdentity,

  getFacturaNumero,
  getFacturaFecha,
  getFacturaUpdatedAt,
  getFacturaClienteObject,
  getFacturaClienteNombre,
  getFacturaClienteEmpresa,
  getFacturaClienteEmail,
  getFacturaPreview,
  getFacturaCurrency,
  getFacturaTotal,
  getFacturaBaseImponible,
  getFacturaImpuestosTotal,
  getFacturaDescuentoTotal,
  getFacturaPaidAmount,
  getFacturaPendingAmount,
  getEffectiveEstadoPago,

  isFacturaPaid,
  isFacturaPending,
  isFacturaOverdue,

  getFacturaIncidenciaId,
  hasFacturaIncidencia,
  buildFacturaIncidenciaPayload,

  normalizeFactura,

  extractFacturas,
  extractNormalizedFacturas,
  getRemoteCount,
  extractStats,

  sumFacturasTotal,
  sumFacturasBase,
  countFacturasByEstadoPago,
  countFacturasByEstado,
  computeFacturasStats,

  sortFacturas,
  filterFacturas,
};
