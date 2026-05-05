/* =========================================================
   Onion SPA - Facturas Model
   Archivo: src/views/facturas/facturas.model.js

   FINAL PRO SAAS PANEL · FACTURAS MODEL · 10/10
   PATCH · ID SAFE · INCIDENCIA PRESERVER · COSMOS ALIGNED
   PATCH · NO TICKET ID AS FACTURA ID
   PATCH · NO CSS IN JS · CLASS HELPERS ONLY

   RESPONSABILIDADES:
   - helpers seguros de datos
   - formatters de facturas
   - normalización del backend
   - labels, tones y clases CSS de estado
   - extracción robusta de payloads
   - utilidades de ordenación / métricas / filtrado
   - mantener paridad operativa con facturasView.js
   - preservar relación factura ↔ incidencia sin contaminar id de factura

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - normalización estable para store / api / actions / template
   - soporte para envelope backend legacy y API normalizada actual
   - métricas robustas
   - ordenación sin mutar origen
   - filtros seguros y predecibles
   - compat con Cosmos DB facturas partition key /clienteId
   - compat con facturas legacy + normalizadas v2/v3
   - sin style="" ni CSS embebido en JS
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_FACTURAS_SORT = Object.freeze({
  field: "updatedAt",
  direction: "desc",
});

export const DEFAULT_FACTURA_CURRENCY = "EUR";

export const FACTURA_STATUS = Object.freeze({
  ISSUED: "issued",
  SENT: "sent",
  VOID: "void",
  DRAFT: "draft",
  CANCELLED: "cancelled",
  PAID: "paid",
});

export const FACTURA_PAYMENT_STATUS = Object.freeze({
  PAID: "paid",
  PENDING: "pending",
  PARTIAL: "partial",
  OVERDUE: "overdue",
  DRAFT: "draft",
  CANCELLED: "cancelled",
});

const OVERDUE_DAYS = 30;

const FACTURA_DOC_TYPES = new Set([
  "factura",
  "invoice",
]);

const NON_FACTURA_IDS_PREFIXES = Object.freeze([
  "FACTURA_COUNTER_",
  "INVOICE_COUNTER_",
  "COUNTER_",
  "LOCK_",
  "SEQUENCE_",
  "SEQ_",
]);

const PAYMENT_STATUS_ALIASES = Object.freeze({
  pagada: "paid",
  pagado: "paid",
  paid: "paid",
  cobrada: "paid",
  cobrado: "paid",
  abonada: "paid",
  abonado: "paid",

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
});

const FACTURA_STATUS_ALIASES = Object.freeze({
  emitida: "issued",
  emitido: "issued",
  issued: "issued",

  enviada: "sent",
  enviado: "sent",
  sent: "sent",

  anulada: "void",
  anulado: "void",
  void: "void",
  voided: "void",

  borrador: "draft",
  draft: "draft",

  cancelada: "cancelled",
  cancelado: "cancelled",
  cancelled: "cancelled",
  canceled: "cancelled",

  abonada: "paid",
  abonado: "paid",
  pagada: "paid",
  pagado: "paid",
  paid: "paid",
});

const PAYMENT_STATUS_LABELS = Object.freeze({
  paid: "Pagada",
  pending: "Pendiente",
  partial: "Pago parcial",
  overdue: "Vencida",
  draft: "Borrador",
  cancelled: "Cancelada",
});

const FACTURA_STATUS_LABELS = Object.freeze({
  issued: "Emitida",
  sent: "Enviada",
  void: "Anulada",
  draft: "Borrador",
  cancelled: "Cancelada",
  paid: "Abonada",
});

/* =========================================================
   BASE HELPERS
========================================================= */

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let text = value
      .trim()
      .replace(/€/g, "")
      .replace(/%/g, "")
      .replace(/\s+/g, "");

    const hasComma = text.includes(",");
    const hasDot = text.includes(".");

    if (hasComma && hasDot) {
      text = text.replace(/\./g, "").replace(/,/g, ".");
    } else if (hasComma) {
      text = text.replace(/,/g, ".");
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

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

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length);
}

function normalizeText(value = "") {
  return safeString(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function round2(value = 0) {
  const n = safeNumber(value, 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toMs(value) {
  if (!value) return 0;

  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function pickFirst(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return undefined;
}

function getPath(source = {}, path = "") {
  const parts = safeString(path, "").split(".").filter(Boolean);
  let cursor = source;

  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }

  return cursor;
}

function pickPath(source = {}, paths = []) {
  for (const path of safeArray(paths)) {
    const value = getPath(source, path);

    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return undefined;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];

  for (const value of safeArray(values).flat()) {
    const text = safeString(value, "");
    const key = normalizeText(text);

    if (!text || !key || seen.has(key)) continue;

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

function hashString(value = "") {
  const text = safeString(value, "");
  let hash = 0;

  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

/* =========================================================
   RAW / ENVELOPE HELPERS
========================================================= */

function getRaw(item = {}) {
  const source = safeObject(item);
  return hasOwnKeys(source.raw) ? safeObject(source.raw) : {};
}

function buildProbe(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return {
    ...raw,
    ...source,
    raw,
  };
}

function hasFacturaIdentitySignal(value = {}) {
  const source = safeObject(value);

  return Boolean(
    safeString(
      pickFirst(
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
        source.numero,
        source.code
      ),
      ""
    )
  );
}

function hasFacturaAmountSignal(value = {}) {
  const source = safeObject(value);

  return Boolean(
    source.total !== undefined ||
      source.totalFactura !== undefined ||
      source.importeTotal !== undefined ||
      source.amount !== undefined ||
      source.invoiceAmount !== undefined ||
      source.importe !== undefined ||
      source.facturaTotal !== undefined ||
      source.totals?.total !== undefined ||
      source.resumen?.total !== undefined
  );
}

function isLikelyFactura(value) {
  if (!isObject(value)) return false;

  const source = safeObject(value);

  return Boolean(
    hasFacturaIdentitySignal(source) ||
      hasFacturaAmountSignal(source) ||
      source.tipoDocumento ||
      source.entityType ||
      source.cliente ||
      source.client ||
      source.customer ||
      source.clienteSnapshot ||
      source.lineas ||
      source.lines ||
      source.impuestos ||
      source.taxes
  );
}

function getPayloadCandidates(payload = null) {
  if (!payload) return [];

  const obj = safeObject(payload, null);

  if (!obj) {
    return [payload].filter((item) => item !== undefined && item !== null);
  }

  return [
    payload,

    obj.data,
    obj.body,
    obj.result,
    obj.payload,
    obj.response,
    obj.resource,

    obj.data?.data,
    obj.data?.body,
    obj.data?.result,
    obj.data?.payload,
    obj.data?.resource,

    obj.result?.data,
    obj.result?.payload,
    obj.result?.resource,

    obj.payload?.data,
    obj.payload?.result,
    obj.payload?.resource,
  ].filter((item) => item !== undefined && item !== null);
}

function pickArrayEnvelope(obj = {}) {
  const source = safeObject(obj);

  const direct = pickFirst(
    Array.isArray(source) ? source : null,

    source.facturas,
    source.items,
    source.data,
    source.results,
    source.rows,
    source.records,
    source.list,
    source.collection,

    source.data?.facturas,
    source.data?.items,
    source.data?.results,
    source.data?.rows,
    source.data?.records,

    source.result?.facturas,
    source.result?.items,
    source.result?.results,
    source.result?.rows,
    source.result?.records,

    source.payload?.facturas,
    source.payload?.items,
    source.payload?.results,
    source.payload?.rows,
    source.payload?.records
  );

  return Array.isArray(direct) ? direct : null;
}

function unwrapFacturaPayload(value = {}) {
  if (isLikelyFactura(value)) {
    return safeObject(value);
  }

  const candidates = getPayloadCandidates(value);

  for (const candidate of candidates) {
    if (isLikelyFactura(candidate)) {
      return safeObject(candidate);
    }

    const obj = safeObject(candidate, null);
    if (!obj) continue;

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
  }

  return safeObject(value);
}

/* =========================================================
   TEXTO / FORMATO
========================================================= */

export function truncate(value = "", max = 140) {
  const text = safeString(value, "");
  const size = Math.max(1, safeNumber(max, 140));

  if (text.length <= size) return text;

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

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return "—";
  }
}

export function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return formatDate(value);
  }
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
    safeString(value, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || "ON"
  );
}

/* =========================================================
   ESTADOS / CLASES CSS
========================================================= */

export function normalizeEstadoPago(value = "pending") {
  return PAYMENT_STATUS_ALIASES[normalizeText(value)] || "pending";
}

export function normalizeEstado(value = "issued") {
  return FACTURA_STATUS_ALIASES[normalizeText(value)] || "issued";
}

export function getEstadoPagoLabel(value = "pending") {
  return PAYMENT_STATUS_LABELS[normalizeEstadoPago(value)] || PAYMENT_STATUS_LABELS.pending;
}

export function getEstadoLabel(value = "issued") {
  return FACTURA_STATUS_LABELS[normalizeEstado(value)] || FACTURA_STATUS_LABELS.issued;
}

export function getEstadoPagoTone(value = "pending") {
  return normalizeEstadoPago(value);
}

export function getEstadoTone(value = "issued") {
  return normalizeEstado(value);
}

export function getEstadoPagoChipClass(value = "pending") {
  return `facturas-chip facturas-chip--${getEstadoPagoTone(value)}`;
}

export function getEstadoChipClass(value = "issued") {
  return `facturas-chip facturas-chip--${getEstadoTone(value)}`;
}

export function getFacturaRowStatusClass(item = {}) {
  const status = getEffectiveEstadoPago(item);
  return `facturas-table-row--${status}`;
}

export function getFacturaAvatarToneIndex(item = {}) {
  const factura = buildProbe(item);

  const seed = safeString(
    pickFirst(
      factura.clienteNombre,
      factura.cliente?.empresa,
      factura.cliente?.nombre,
      factura.cliente?.email,
      factura.numero,
      factura.id,
      "ON"
    ),
    "ON"
  );

  return hashString(seed) % 10;
}

export function getFacturaAvatarToneClass(item = {}) {
  return `facturas-avatar--tone-${getFacturaAvatarToneIndex(item)}`;
}

/*
  Compatibilidad temporal:
  No devuelve CSS. Si algún template antiguo todavía importa estas funciones,
  no rompe, pero debe migrarse a getEstadoPagoChipClass/getEstadoChipClass.
*/
export function getEstadoPagoChipStyle() {
  return "";
}

export function getEstadoChipStyle() {
  return "";
}

/* =========================================================
   DOCUMENT TYPE
========================================================= */

export function isFacturaDocument(item = {}) {
  const source = buildProbe(item);

  const id = safeString(source.id, "");
  const tipoDocumento = normalizeText(source.tipoDocumento);
  const entityType = normalizeText(source.entityType);
  const tipo = normalizeText(source.tipo);

  if (NON_FACTURA_IDS_PREFIXES.some((prefix) => id.startsWith(prefix))) {
    return false;
  }

  if (
    tipo === "contador" ||
    tipo === "counter" ||
    entityType === "counter" ||
    tipoDocumento === "counter"
  ) {
    return false;
  }

  if (FACTURA_DOC_TYPES.has(tipoDocumento) || FACTURA_DOC_TYPES.has(entityType)) {
    return true;
  }

  return Boolean(hasFacturaIdentitySignal(source) || hasFacturaAmountSignal(source));
}

/* =========================================================
   FACTURA IDENTITY
========================================================= */

export function getFacturaIdentityList(item = {}) {
  const source = buildProbe(item);

  return uniqueStrings([
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
  ]);
}

export function getFacturaPrimaryId(item = {}) {
  const source = buildProbe(item);

  return safeString(
    pickFirst(
      source.id,
      source._id,
      source.facturaId,
      source.invoiceId,
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.numeroFactura,
      source.invoiceNumber,
      source.numero
    ),
    ""
  );
}

export function sameFacturaIdentity(a = "", b = "") {
  return sameIdentity(a, b);
}

/* =========================================================
   FACTURA FIELD HELPERS
========================================================= */

export function getFacturaNumero(item = {}) {
  const source = buildProbe(item);

  return safeString(
    pickFirst(
      source.numero,
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.numeroFactura,
      source.invoiceNumber,
      source.facturaNumero,
      source.facturaCode,
      source.code,
      source.facturaId,
      source.invoiceId,
      source.id
    ),
    "—"
  );
}

export function getFacturaFecha(item = {}) {
  const source = buildProbe(item);

  return (
    safeString(
      pickFirst(
        source.fecha,
        source.fechaFactura,
        source.invoiceDate,
        source.issueDate,
        source.issuedAt,
        source.fechaServicio,
        source.createdAt,
        source.auditoria?.createdAt
      ),
      ""
    ) || null
  );
}

export function getFacturaUpdatedAt(item = {}) {
  const source = buildProbe(item);

  return (
    safeString(
      pickFirst(
        source.updatedAt,
        source.modifiedAt,
        source.fechaEnvio,
        source.sentAt,
        source.mailSentAt,
        source.delivery?.sentAt,
        source.delivery?.lastSentAt,
        source.auditoria?.updatedAt,
        getFacturaFecha(source)
      ),
      ""
    ) || null
  );
}

export function getFacturaClienteObject(item = {}) {
  const source = buildProbe(item);

  return safeObject(
    pickFirst(
      source.cliente,
      source.client,
      source.customer,
      source.clienteSnapshot
    )
  );
}

export function getFacturaClienteId(item = {}) {
  const source = buildProbe(item);

  return safeString(
    pickFirst(
      source.clienteId,
      source.clientId,
      source.customerId,
      source.cliente?.id,
      source.cliente?.clienteId,
      source.client?.id,
      source.client?.clienteId,
      source.customer?.id,
      source.clienteSnapshot?.id,
      source.clienteSnapshot?.clienteId,
      source.userId
    ),
    ""
  );
}

export function getFacturaClienteNombre(item = {}) {
  const source = buildProbe(item);
  const cliente = getFacturaClienteObject(source);

  return safeString(
    pickFirst(
      cliente.nombre,
      cliente.nombreContacto,
      cliente.empresa,
      cliente.razonSocial,
      cliente.nombreFiscal,
      cliente.name,
      cliente.company,
      cliente.displayName,

      source.clienteNombre,
      source.clientName,
      source.customerName,
      source.nombreCliente,
      source.owner?.name,
      source.name
    ),
    "Cliente"
  );
}

export function getFacturaClienteEmpresa(item = {}) {
  const source = buildProbe(item);
  const cliente = getFacturaClienteObject(source);

  return safeString(
    pickFirst(
      cliente.empresa,
      cliente.razonSocial,
      cliente.nombreFiscal,
      cliente.company,
      cliente.nombre,
      cliente.nombreContacto,

      source.clienteEmpresa,
      source.empresaCliente,
      source.clientCompany
    ),
    "-"
  );
}

export function getFacturaClienteEmail(item = {}) {
  const source = buildProbe(item);
  const cliente = getFacturaClienteObject(source);

  return safeString(
    pickFirst(
      cliente.email,
      cliente.emailLower,
      cliente.mail,
      cliente.emailFacturacion,
      cliente.emailAdministracion,

      source.email,
      source.emailCliente,
      source.clienteEmail,
      source.clientEmail,
      source.customerEmail,
      source.owner?.email
    ),
    "-"
  );
}

export function getFacturaPreview(item = {}) {
  const source = buildProbe(item);

  const lineas = safeArray(
    pickFirst(source.lineas, source.lines, source.items)
  );

  const firstLinea = safeObject(lineas[0]);

  return safeString(
    pickFirst(
      source.preview,
      source.descripcion,
      source.description,
      source.concepto,

      firstLinea.descripcion,
      firstLinea.description,
      firstLinea.concepto
    ),
    "Sin detalle"
  );
}

export function getFacturaCurrency(item = {}) {
  const source = buildProbe(item);

  return safeString(
    pickFirst(
      source.moneda,
      source.currency,
      source.facturaCurrency,
      source.payment?.currency,
      DEFAULT_FACTURA_CURRENCY
    ),
    DEFAULT_FACTURA_CURRENCY
  ).toUpperCase();
}

export function getFacturaTotal(item = {}) {
  const source = buildProbe(item);

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
      0
    )
  );
}

export function getFacturaBaseImponible(item = {}) {
  const source = buildProbe(item);

  return round2(
    pickFirst(
      source.baseImponible,
      source.subtotal,
      source.taxableBase,
      source.resumen?.baseImponible,
      source.resumen?.subtotal,
      0
    )
  );
}

export function getFacturaTaxAmount(item = {}, targetType = "") {
  const source = buildProbe(item);
  const target = normalizeText(targetType);

  if (target === "iva") {
    const direct = pickFirst(
      source.ivaTotal,
      source.iva,
      source.cuotaIVA,
      source.resumen?.ivaTotal
    );

    if (direct !== undefined) return round2(direct);
  }

  if (target === "irpf") {
    const direct = pickFirst(
      source.irpfTotal,
      source.irpf,
      source.retencionesTotal,
      source.retencionIRPF,
      source.retencion,
      source.resumen?.irpfTotal
    );

    if (direct !== undefined) return round2(direct);
  }

  const impuestos = safeArray(pickFirst(source.impuestos, source.taxes));

  const found = impuestos.find((tax) => {
    const item = safeObject(tax);
    const type = normalizeText(pickFirst(item.tipo, item.type, item.nombre, item.name));

    return Boolean(type && (type === target || type.includes(target)));
  });

  return round2(found?.importe ?? found?.amount ?? 0);
}

export function getFacturaImpuestosTotal(item = {}) {
  const source = buildProbe(item);

  return round2(
    pickFirst(
      source.impuestosTotal,
      source.taxTotal,
      source.ivaTotal,
      source.iva,
      source.cuotaIVA,
      source.resumen?.impuestosTotal,
      getFacturaTaxAmount(source, "iva"),
      0
    )
  );
}

export function getFacturaDescuentoTotal(item = {}) {
  const source = buildProbe(item);

  return round2(
    pickFirst(
      source.descuentoTotal,
      source.discountTotal,
      source.resumen?.descuentoTotal,
      0
    )
  );
}

export function getFacturaPaidAmount(item = {}) {
  const source = buildProbe(item);

  const direct = pickFirst(
    source.paidAmount,
    source.payment?.paidAmount,
    source.billing?.paidAmount
  );

  if (direct !== undefined) {
    return round2(direct);
  }

  const estadoPago = normalizeEstadoPago(
    pickFirst(source.estadoPago, source.paymentStatus, source.payment?.status)
  );

  return estadoPago === "paid" ? getFacturaTotal(source) : 0;
}

export function getFacturaPendingAmount(item = {}) {
  const source = buildProbe(item);

  const direct = pickFirst(
    source.pendingAmount,
    source.payment?.pendingAmount,
    source.billing?.pendingAmount
  );

  if (direct !== undefined) {
    return round2(direct);
  }

  return round2(Math.max(0, getFacturaTotal(source) - getFacturaPaidAmount(source)));
}

export function getEffectiveEstadoPago(item = {}, now = new Date()) {
  const source = buildProbe(item);

  const estadoPago = normalizeEstadoPago(
    pickFirst(
      source.estadoPago,
      source.paymentStatus,
      source.payment?.status,
      "pending"
    )
  );

  if (["paid", "cancelled", "draft", "overdue"].includes(estadoPago)) {
    return estadoPago;
  }

  const fechaMs = toMs(getFacturaFecha(source));

  if (fechaMs) {
    const diffDays = (now.getTime() - fechaMs) / (1000 * 60 * 60 * 24);

    if (diffDays > OVERDUE_DAYS) {
      return "overdue";
    }
  }

  return estadoPago;
}

export function isFacturaPaid(item = {}) {
  return getEffectiveEstadoPago(item) === "paid";
}

export function isFacturaPending(item = {}) {
  const status = getEffectiveEstadoPago(item);
  return status === "pending" || status === "partial";
}

export function isFacturaOverdue(item = {}) {
  return getEffectiveEstadoPago(item) === "overdue";
}

export function isFacturaSent(item = {}) {
  const source = buildProbe(item);

  return Boolean(
    safeString(
      pickFirst(
        source.fechaEnvio,
        source.sentAt,
        source.mailSentAt,
        source.delivery?.sentAt,
        source.delivery?.lastSentAt,
        source.enviadoA,
        source.sentTo
      ),
      ""
    ) ||
      source.delivery?.sent === true ||
      source.meta?.isSent === true
  );
}

export function hasFacturaPdf(item = {}) {
  const source = buildProbe(item);

  if (
    safeBoolean(source.hasPdf, false) ||
    safeBoolean(source.pdfAvailable, false) ||
    safeString(source.pdfUrl, "") ||
    safeString(source.url, "") ||
    safeString(source.viewUrl, "") ||
    safeString(source.downloadUrl, "") ||
    safeString(source.blobPath, "") ||
    safeString(source.pdfBlobPath, "") ||
    safeString(source.file?.url, "") ||
    safeString(source.file?.blobPath, "")
  ) {
    return true;
  }

  const attachments = safeArray(
    pickFirst(source.attachments, source.files, source.adjuntos)
  );

  return attachments.some((entry) => {
    const file = safeObject(entry);

    const type = normalizeText(
      pickFirst(file.mimeType, file.contentType, file.mimetype, file.type)
    );

    const name = normalizeText(
      pickFirst(file.name, file.filename, file.fileName, file.url, file.path)
    );

    return type.includes("pdf") || name.endsWith(".pdf");
  });
}

/* =========================================================
   INCIDENCIA / TICKET PRESERVER
========================================================= */

const INCIDENCIA_DIRECT_PATHS = Object.freeze([
  "ticketId",
  "incidenciaId",
  "relatedTicketId",
  "relatedIncidentId",
  "supportTicketId",
  "caseId",

  "incidencia.ticketId",
  "incidencia.id",
  "incidencia.incidenciaId",

  "ticket.ticketId",
  "ticket.id",
  "ticket.incidenciaId",

  "linkedTicket.ticketId",
  "linkedTicket.id",
  "linkedTicket.incidenciaId",

  "relatedTicket.ticketId",
  "relatedTicket.id",
  "relatedTicket.incidenciaId",

  "relatedIncident.ticketId",
  "relatedIncident.id",
  "relatedIncident.incidenciaId",

  "relations.ticket.ticketId",
  "relations.ticket.id",
  "relations.ticket.incidenciaId",

  "relations.incidencia.ticketId",
  "relations.incidencia.id",
  "relations.incidencia.incidenciaId",

  "meta.ticketId",
  "meta.incidenciaId",
]);

const INCIDENCIA_ARRAY_PATHS = Object.freeze([
  "ticketIds",
  "incidenciaIds",
  "supportTicketIds",
  "relatedTicketIds",
  "relatedIncidentIds",
  "linkedTickets",
  "incidencias",
  "tickets",
  "relatedTickets",
  "relations",
  "relations.tickets",
  "relations.incidencias",
  "facturasRelacionadas",
  "linkedInvoices.tickets",
  "invoiceLinks",
  "invoiceRelations",
]);

function pickTicketIdFromArray(value = []) {
  const items = safeArray(value);

  for (const entry of items) {
    if (typeof entry === "string" && entry.trim()) {
      return entry.trim();
    }

    if (!isObject(entry)) continue;

    const item = safeObject(entry);
    const candidate = pickPath(item, INCIDENCIA_DIRECT_PATHS);

    if (candidate) {
      return safeString(candidate, "");
    }
  }

  return "";
}

function pickTicketIdFromArrays(source = {}) {
  for (const path of INCIDENCIA_ARRAY_PATHS) {
    const value = getPath(source, path);
    const found = pickTicketIdFromArray(value);

    if (found) return found;
  }

  return "";
}

function getFacturaRelationObject(item = {}) {
  const source = buildProbe(item);

  const relation = pickFirst(
    source.incidencia,
    source.ticket,
    source.linkedTicket,
    source.relatedTicket,
    source.relatedIncident,
    source.relations?.ticket,
    source.relations?.incidencia,
    safeArray(source.tickets)[0],
    safeArray(source.incidencias)[0],
    safeArray(source.relations?.tickets)[0],
    safeArray(source.relations?.incidencias)[0]
  );

  return safeObject(relation);
}

export function getFacturaIncidenciaId(item = {}) {
  const source = buildProbe(item);

  return safeString(
    pickFirst(
      pickPath(source, INCIDENCIA_DIRECT_PATHS),
      pickTicketIdFromArrays(source)
    ),
    ""
  );
}

export function hasFacturaIncidencia(item = {}) {
  return Boolean(getFacturaIncidenciaId(item));
}

export function buildFacturaIncidenciaPayload(item = {}) {
  const source = buildProbe(item);
  const relation = getFacturaRelationObject(source);
  const incidenciaId = getFacturaIncidenciaId(source);

  if (!incidenciaId) return null;

  const subject = safeString(
    pickFirst(
      relation.subject,
      relation.asunto,
      relation.title,
      source.subject,
      source.asunto,
      source.title,
      "Incidencia relacionada"
    ),
    "Incidencia relacionada"
  );

  return {
    ...relation,

    id: incidenciaId,
    ticketId: incidenciaId,
    incidenciaId,

    code: safeString(
      pickFirst(relation.code, relation.ticketCode, incidenciaId),
      incidenciaId
    ),

    ticketCode: safeString(
      pickFirst(relation.ticketCode, relation.code, incidenciaId),
      incidenciaId
    ),

    subject,
    asunto: safeString(pickFirst(relation.asunto, subject), subject),
    title: safeString(pickFirst(relation.title, subject), subject),

    status: safeString(pickFirst(relation.status, relation.estado, "open"), "open"),
    estado: safeString(pickFirst(relation.estado, relation.status, "open"), "open"),

    priority: safeString(pickFirst(relation.priority, relation.prioridad, "medium"), "medium"),
    prioridad: safeString(pickFirst(relation.prioridad, relation.priority, "medium"), "medium"),

    clienteId: safeString(
      pickFirst(
        relation.clienteId,
        source.clienteId,
        source.cliente?.id,
        source.clientId,
        source.client?.id,
        ""
      ),
      ""
    ),

    clienteNombre: safeString(
      pickFirst(
        relation.clienteNombre,
        relation.name,
        relation.nombre,
        getFacturaClienteNombre(source),
        ""
      ),
      ""
    ),

    relationType: safeString(
      pickFirst(relation.relationType, source.relationType, "linked_ticket"),
      "linked_ticket"
    ),

    linkedAt: safeString(
      pickFirst(relation.linkedAt, source.linkedAt, source.updatedAt, ""),
      ""
    ),

    linkedAtES: safeString(
      pickFirst(relation.linkedAtES, source.linkedAtES, source.updatedAtES, ""),
      ""
    ),
  };
}

function mergeRelationObject(existing = {}, payload = {}, incidenciaId = "") {
  const current = safeObject(existing);
  const next = safeObject(payload);

  return {
    ...next,
    ...current,

    id: safeString(pickFirst(current.id, current.ticketId, incidenciaId), incidenciaId),
    ticketId: safeString(pickFirst(current.ticketId, current.id, incidenciaId), incidenciaId),
    incidenciaId: safeString(pickFirst(current.incidenciaId, incidenciaId), incidenciaId),
  };
}

function mergeRawIncidencia(raw = {}, incidenciaId = "", incidenciaPayload = null) {
  const base = safeObject(raw);

  if (!incidenciaId) return base;

  const payload = safeObject(incidenciaPayload, {
    id: incidenciaId,
    ticketId: incidenciaId,
    incidenciaId,
  });

  return {
    ...base,

    ticketId: safeString(pickFirst(base.ticketId, incidenciaId), incidenciaId),
    incidenciaId: safeString(pickFirst(base.incidenciaId, incidenciaId), incidenciaId),
    relatedTicketId: safeString(pickFirst(base.relatedTicketId, incidenciaId), incidenciaId),
    relatedIncidentId: safeString(pickFirst(base.relatedIncidentId, incidenciaId), incidenciaId),
    supportTicketId: safeString(pickFirst(base.supportTicketId, incidenciaId), incidenciaId),
    caseId: safeString(pickFirst(base.caseId, incidenciaId), incidenciaId),

    incidencia: mergeRelationObject(base.incidencia, payload, incidenciaId),
    ticket: mergeRelationObject(base.ticket, payload, incidenciaId),
    linkedTicket: mergeRelationObject(base.linkedTicket, payload, incidenciaId),

    relations: {
      ...safeObject(base.relations),
      ticket: mergeRelationObject(base.relations?.ticket, payload, incidenciaId),
    },

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

  const raw = {
    ...getRaw(source),
    ...getRaw(base),
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
      pickFirst(base.relatedTicketId, source.relatedTicketId, nextRaw.relatedTicketId, incidenciaId),
      incidenciaId
    ),

    relatedIncidentId: safeString(
      pickFirst(base.relatedIncidentId, source.relatedIncidentId, nextRaw.relatedIncidentId, incidenciaId),
      incidenciaId
    ),

    supportTicketId: safeString(
      pickFirst(base.supportTicketId, source.supportTicketId, nextRaw.supportTicketId, incidenciaId),
      incidenciaId
    ),

    caseId: safeString(
      pickFirst(base.caseId, source.caseId, nextRaw.caseId, incidenciaId),
      incidenciaId
    ),

    incidencia: incidenciaPayload,
    ticket: mergeRelationObject(pickFirst(base.ticket, source.ticket, nextRaw.ticket), incidenciaPayload, incidenciaId),
    linkedTicket: mergeRelationObject(
      pickFirst(base.linkedTicket, source.linkedTicket, nextRaw.linkedTicket),
      incidenciaPayload,
      incidenciaId
    ),

    relations: {
      ...safeObject(base.relations),
      ticket: mergeRelationObject(base.relations?.ticket, incidenciaPayload, incidenciaId),
    },

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
  const probe = buildProbe(source);

  const facturaId = getFacturaPrimaryId(probe);
  const numero = getFacturaNumero(probe);

  const estadoPago = getEffectiveEstadoPago(probe);

  const estado = normalizeEstado(
    pickFirst(
      probe.estado,
      probe.status,
      estadoPago === "paid" ? "paid" : "issued"
    )
  );

  const clienteId = getFacturaClienteId(probe);
  const clienteNombre = getFacturaClienteNombre(probe);
  const clienteEmpresa = getFacturaClienteEmpresa(probe);
  const clienteEmail = getFacturaClienteEmail(probe);

  const currency = getFacturaCurrency(probe);
  const fecha = getFacturaFecha(probe);
  const updatedAt = getFacturaUpdatedAt(probe);

  const fechaEnvio = (
    safeString(
      pickFirst(
        probe.fechaEnvio,
        probe.sentAt,
        probe.mailSentAt,
        probe.delivery?.sentAt,
        probe.delivery?.lastSentAt
      ),
      ""
    ) || null
  );

  const lineas = safeArray(
    pickFirst(probe.lineas, probe.lines)
  );

  const impuestos = safeArray(
    pickFirst(probe.impuestos, probe.taxes)
  );

  const attachments = safeArray(
    pickFirst(probe.attachments, probe.files, probe.adjuntos)
  );

  const total = getFacturaTotal(probe);
  const baseImponible = getFacturaBaseImponible(probe);
  const impuestosTotal = getFacturaImpuestosTotal(probe);
  const descuentoTotal = getFacturaDescuentoTotal(probe);

  const pdfUrl = safeString(
    pickFirst(
      probe.pdfUrl,
      probe.file?.url,
      probe.url,
      probe.downloadUrl,
      probe.viewUrl,
      ""
    ),
    ""
  );

  const blobPath = safeString(
    pickFirst(
      probe.blobPath,
      probe.pdfBlobPath,
      probe.file?.blobPath,
      ""
    ),
    ""
  );

  const hasPdf = hasFacturaPdf(probe);

  const normalized = {
    ...source,

    id: facturaId || numero || "",
    _id: safeString(pickFirst(probe._id, facturaId), "") || null,

    facturaId: facturaId || numero || "",
    invoiceId: safeString(pickFirst(probe.invoiceId, facturaId, numero), facturaId || numero),

    numero,
    numeroFactura: safeString(pickFirst(probe.numeroFactura, probe.numeroFacturaLegal, numero), numero),
    numeroFacturaLegal: safeString(pickFirst(probe.numeroFacturaLegal, numero), ""),
    numeroFacturaSistema: safeString(probe.numeroFacturaSistema, ""),
    invoiceNumber: safeString(pickFirst(probe.invoiceNumber, numero), numero),
    code: safeString(pickFirst(probe.code, numero), numero),

    fecha,
    fechaFactura: safeString(pickFirst(probe.fechaFactura, fecha), fecha || "") || null,
    fechaEnvio,
    updatedAt,

    createdAt:
      safeString(
        pickFirst(
          probe.createdAt,
          probe.auditoria?.createdAt
        ),
        ""
      ) || null,

    estadoPago,
    paymentStatus: estadoPago,
    estado,
    status: estado,

    estadoPagoLabel: getEstadoPagoLabel(estadoPago),
    estadoLabel: getEstadoLabel(estado),

    estadoPagoTone: getEstadoPagoTone(estadoPago),
    estadoTone: getEstadoTone(estado),

    estadoPagoChipClass: getEstadoPagoChipClass(estadoPago),
    estadoChipClass: getEstadoChipClass(estado),

    rowStatusClass: getFacturaRowStatusClass({
      ...probe,
      estadoPago,
    }),

    total,
    amount: total,
    importe: total,
    importeTotal: total,

    subtotal: round2(
      pickFirst(
        probe.subtotal,
        probe.resumen?.subtotal,
        0
      )
    ),

    baseImponible,
    descuentoTotal,
    impuestosTotal,

    iva: getFacturaTaxAmount(probe, "iva"),
    ivaTotal: getFacturaTaxAmount(probe, "iva"),

    irpf: getFacturaTaxAmount(probe, "irpf"),
    irpfTotal: getFacturaTaxAmount(probe, "irpf"),

    moneda: currency,
    currency,

    paidAmount: getFacturaPaidAmount(probe),
    pendingAmount: getFacturaPendingAmount(probe),

    formaPago: safeString(
      pickFirst(
        probe.formaPago,
        probe.metodoPago,
        probe.paymentMethod,
        probe.payment?.method
      ),
      "—"
    ),

    metodoPago: safeString(
      pickFirst(
        probe.metodoPago,
        probe.formaPago,
        probe.paymentMethod,
        probe.payment?.method
      ),
      "—"
    ),

    cuentaPago: safeString(
      pickFirst(probe.cuentaPago, probe.paymentAccount),
      ""
    ),

    preview: getFacturaPreview(probe),

    lineasCount: safeNumber(
      pickFirst(probe.lineasCount),
      lineas.length
    ),

    attachmentsCount: safeNumber(
      pickFirst(probe.attachmentsCount),
      attachments.length
    ),

    hasPdf,
    pdfAvailable: hasPdf,
    pdfUrl,
    blobPath,

    isSent: isFacturaSent(probe),

    clienteId,
    clienteNombre,
    clienteEmpresa,
    clienteEmail,

    cliente: {
      ...safeObject(pickFirst(raw.cliente, raw.client, raw.customer, raw.clienteSnapshot)),
      ...safeObject(pickFirst(source.cliente, source.client, source.customer, source.clienteSnapshot)),

      id: clienteId || null,
      clienteId: clienteId || null,

      nombre: clienteNombre,

      nombreContacto: safeString(
        pickFirst(
          probe.cliente?.nombreContacto,
          probe.client?.contactName,
          clienteNombre
        ),
        clienteNombre
      ),

      empresa: clienteEmpresa,

      razonSocial: safeString(
        pickFirst(
          probe.cliente?.razonSocial,
          probe.client?.company,
          clienteEmpresa
        ),
        clienteEmpresa
      ),

      email: clienteEmail,
      emailLower: clienteEmail !== "-" ? normalizeText(clienteEmail) : "",

      telefono: safeString(
        pickFirst(
          probe.cliente?.telefono,
          probe.client?.phone,
          probe.telefonoCliente
        ),
        ""
      ),

      nif: safeString(
        pickFirst(
          probe.cliente?.nif,
          probe.cliente?.vatId,
          probe.client?.nif,
          probe.client?.vatId
        ),
        ""
      ),

      avatar:
        probe.cliente?.avatar ??
        probe.client?.avatar ??
        probe.customer?.avatar ??
        probe.owner?.avatar ??
        null,

      initials: getInitials(
        clienteEmpresa && clienteEmpresa !== "-"
          ? clienteEmpresa
          : clienteNombre
      ),

      avatarToneIndex: getFacturaAvatarToneIndex(probe),
      avatarToneClass: getFacturaAvatarToneClass(probe),

      direccion: {
        calle: safeString(
          pickFirst(
            probe.cliente?.direccion?.calle,
            probe.client?.address?.street
          ),
          ""
        ),

        linea2: safeString(
          pickFirst(
            probe.cliente?.direccion?.linea2,
            probe.client?.address?.line2
          ),
          ""
        ),

        cp: safeString(
          pickFirst(
            probe.cliente?.direccion?.cp,
            probe.client?.address?.zip
          ),
          ""
        ),

        ciudad: safeString(
          pickFirst(
            probe.cliente?.direccion?.ciudad,
            probe.client?.address?.city
          ),
          ""
        ),

        provincia: safeString(
          pickFirst(
            probe.cliente?.direccion?.provincia,
            probe.client?.address?.state
          ),
          ""
        ),

        pais: safeString(
          pickFirst(
            probe.cliente?.direccion?.pais,
            probe.client?.address?.country
          ),
          ""
        ),
      },
    },

    owner: {
      id: probe.owner?.id ?? probe.userId ?? null,

      name: safeString(
        pickFirst(probe.owner?.name, probe.name),
        ""
      ),

      email: safeString(probe.owner?.email, ""),
      avatar: probe.owner?.avatar ?? null,
    },

    concepto: safeString(
      pickFirst(
        probe.concepto,
        lineas[0]?.concepto,
        "Factura"
      ),
      "Factura"
    ),

    descripcion: safeString(
      pickFirst(
        probe.descripcion,
        probe.description,
        lineas[0]?.descripcion,
        lineas[0]?.description
      ),
      ""
    ),

    lineas: lineas.map((entry, index) => {
      const linea = safeObject(entry);

      return {
        id: linea.id ?? `linea-${index + 1}`,

        concepto: safeString(linea.concepto, ""),

        descripcion: safeString(
          pickFirst(linea.descripcion, linea.description),
          ""
        ),

        cantidad: safeNumber(linea.cantidad ?? linea.quantity, 0),
        precioUnitario: round2(linea.precioUnitario ?? linea.unitPrice),
        subtotal: round2(linea.subtotal),
        descuento: round2(linea.descuento ?? linea.discount),
        impuesto: round2(linea.impuesto ?? linea.tax),

        totalLinea: round2(
          pickFirst(
            linea.totalLinea,
            linea.total,
            linea.importe,
            linea.amount,
            0
          )
        ),

        raw: linea,
      };
    }),

    impuestos: impuestos.map((entry) => {
      const impuesto = safeObject(entry);

      return {
        tipo: safeString(
          pickFirst(impuesto.tipo, impuesto.type),
          ""
        ),

        nombre: safeString(
          pickFirst(impuesto.nombre, impuesto.name, impuesto.tipo, impuesto.type),
          ""
        ),

        porcentaje: safeNumber(
          impuesto.porcentaje ?? impuesto.percent ?? impuesto.rate,
          0
        ),

        base: round2(impuesto.base),
        importe: round2(impuesto.importe ?? impuesto.amount),

        raw: impuesto,
      };
    }),

    attachments: attachments.map((entry, index) => {
      const file = safeObject(entry);

      return {
        id: file.id ?? file.blobName ?? file.path ?? `attachment-${index + 1}`,

        name: safeString(
          pickFirst(
            file.name,
            file.filename,
            file.fileName,
            file.originalName,
            `archivo_${index + 1}`
          ),
          `archivo_${index + 1}`
        ),

        url: safeString(
          pickFirst(
            file.url,
            file.href,
            file.path,
            file.downloadUrl,
            "#"
          ),
          "#"
        ),

        size: safeNumber(file.size ?? file.sizeBytes, 0),

        mimeType: safeString(
          pickFirst(file.mimeType, file.contentType),
          ""
        ),

        raw: file,
      };
    }),

    notas: safeString(
      pickFirst(probe.notas, probe.observaciones),
      ""
    ),

    enviadoA: safeString(
      pickFirst(
        probe.enviadoA,
        probe.sentTo,
        probe.delivery?.lastSentTo
      ),
      ""
    ),

    sendHistory: safeArray(probe.sendHistory).map((entry) => {
      const history = safeObject(entry);

      return {
        at: safeString(history.at, "") || null,
        to: safeString(history.to, ""),
        byUserId: safeString(history.byUserId, ""),
        byRole: safeString(history.byRole, ""),
        channel: safeString(history.channel, "email"),
        requestId: safeString(history.requestId, ""),
        raw: history,
      };
    }),

    updatedBy: safeString(
      pickFirst(probe.updatedBy, probe.auditoria?.updatedBy),
      ""
    ),

    createdBy: safeString(
      pickFirst(probe.createdBy, probe.auditoria?.createdBy),
      ""
    ),

    estadoDetalle: safeString(probe.estadoDetalle, ""),

    tipoDocumento: safeString(
      pickFirst(probe.tipoDocumento, "factura"),
      "factura"
    ),

    entityType: safeString(
      pickFirst(probe.entityType, "invoice"),
      "invoice"
    ),

    meta: {
      ...safeObject(raw.meta),
      ...safeObject(source.meta),

      timestampMs: toMs(updatedAt) || toMs(fecha) || 0,
      fechaMs: toMs(fecha) || 0,
      updatedAtMs: toMs(updatedAt) || 0,

      isPaid: estadoPago === "paid",
      isPending: estadoPago === "pending" || estadoPago === "partial",
      isOverdue: estadoPago === "overdue",
      isSent: isFacturaSent(probe),

      hasPdf,
      identities: getFacturaIdentityList(probe),
    },

    raw: {
      ...raw,
      ...source,
    },
  };

  return preserveFacturaIncidenciaFields(normalized, source);
}

/* =========================================================
   RESPONSE EXTRACTION
========================================================= */

export function extractFacturas(response) {
  if (Array.isArray(response)) {
    return response;
  }

  const candidates = getPayloadCandidates(response);

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    const found = pickArrayEnvelope(candidate);

    if (Array.isArray(found)) {
      return found;
    }
  }

  return [];
}

export function extractNormalizedFacturas(response) {
  return extractFacturas(response)
    .filter(isFacturaDocument)
    .map(normalizeFactura);
}

export function getRemoteCount(response, fallback = 0) {
  const candidates = getPayloadCandidates(response);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) continue;

    const count = pickFirst(
      obj.total,
      obj.count,
      obj.remoteCount,
      obj.totalCount,
      obj.totalMatched,

      obj.meta?.total,
      obj.meta?.count,
      obj.meta?.remoteCount,
      obj.meta?.totalCount,
      obj.meta?.totalMatched,

      obj.pagination?.total,
      obj.pagination?.count,
      obj.pagination?.totalItems,
      obj.pagination?.totalMatched
    );

    if (count !== undefined) {
      return safeNumber(count, fallback);
    }
  }

  return fallback;
}

export function extractStats(response) {
  const candidates = getPayloadCandidates(response);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) continue;

    const stats = pickFirst(
      obj.stats,
      obj.data?.stats,
      obj.result?.stats,
      obj.payload?.stats,
      obj.meta?.stats
    );

    if (hasOwnKeys(stats)) {
      return safeObject(stats);
    }
  }

  return null;
}

/* =========================================================
   METRICS
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
    return acc + (normalizeEstadoPago(factura.estadoPago) === normalizedTarget ? 1 : 0);
  }, 0);
}

export function countFacturasByEstado(items = [], target = "issued") {
  const normalizedTarget = normalizeEstado(target);

  return safeArray(items).reduce((acc, item) => {
    const factura = normalizeFactura(item);
    return acc + (normalizeEstado(factura.estado) === normalizedTarget ? 1 : 0);
  }, 0);
}

export function computeFacturasStats(items = []) {
  const facturas = safeArray(items).map(normalizeFactura);

  const totalFacturas = facturas.length;
  const totalImporte = sumFacturasTotal(facturas);
  const totalBase = sumFacturasBase(facturas);

  const paidCount = facturas.filter(isFacturaPaid).length;
  const pendingCount = facturas.filter(isFacturaPending).length;
  const overdueCount = facturas.filter(isFacturaOverdue).length;
  const partialCount = countFacturasByEstadoPago(facturas, "partial");
  const draftCount = countFacturasByEstadoPago(facturas, "draft");
  const cancelledCount = countFacturasByEstadoPago(facturas, "cancelled");
  const sentCount = facturas.filter(isFacturaSent).length;
  const linkedTicketCount = facturas.filter(hasFacturaIncidencia).length;
  const withPdfCount = facturas.filter(hasFacturaPdf).length;

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
    sentCount,
    linkedTicketCount,
    withPdfCount,

    countTotal: totalFacturas,
    countPagadas: paidCount,
    countPendientes: pendingCount,
    countVencidas: overdueCount,
    countEnviadas: sentCount,
    countConIncidencia: linkedTicketCount,
    countWithPdf: withPdfCount,

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
   SORT
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
        pickFirst(a.cliente?.empresa, a.cliente?.nombre, a.clienteNombre)
      );

      const bv = normalizeText(
        pickFirst(b.cliente?.empresa, b.cliente?.nombre, b.clienteNombre)
      );

      return compareText(av, bv) * direction;
    }

    if (field === "numero") {
      return compareText(a.numero, b.numero) * direction;
    }

    if (field === "total") {
      return (safeNumber(a.total, 0) - safeNumber(b.total, 0)) * direction;
    }

    if (field === "fecha") {
      return (toMs(a.fecha) - toMs(b.fecha)) * direction;
    }

    if (field === "updatedAt") {
      return (toMs(a.updatedAt) - toMs(b.updatedAt)) * direction;
    }

    if (field === "estadoPago") {
      return compareText(a.estadoPago, b.estadoPago) * direction;
    }

    if (field === "estado") {
      return compareText(a.estado, b.estado) * direction;
    }

    const av = normalizeText(a?.[field]);
    const bv = normalizeText(b?.[field]);

    return compareText(av, bv) * direction;
  });

  return list;
}

/* =========================================================
   FILTER
========================================================= */

export function filterFacturas(items = [], filters = {}) {
  const query = normalizeText(filters?.query || filters?.search || filters?.q);
  const estadoPago = normalizeText(filters?.estadoPago || filters?.paymentStatus);
  const estado = normalizeText(filters?.estado || filters?.status);
  const formaPago = normalizeText(filters?.formaPago || filters?.paymentMethod);
  const clienteId = normalizeText(filters?.clienteId || filters?.clientId);
  const incidenciaId = normalizeText(
    filters?.incidenciaId ||
      filters?.ticketId ||
      filters?.relatedTicketId ||
      filters?.relatedIncidentId
  );

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
  FACTURA_STATUS,
  FACTURA_PAYMENT_STATUS,

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
  getEstadoPagoTone,
  getEstadoTone,
  getEstadoPagoChipClass,
  getEstadoChipClass,
  getFacturaRowStatusClass,
  getFacturaAvatarToneIndex,
  getFacturaAvatarToneClass,

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
  getFacturaClienteId,
  getFacturaClienteNombre,
  getFacturaClienteEmpresa,
  getFacturaClienteEmail,
  getFacturaPreview,
  getFacturaCurrency,
  getFacturaTotal,
  getFacturaBaseImponible,
  getFacturaTaxAmount,
  getFacturaImpuestosTotal,
  getFacturaDescuentoTotal,
  getFacturaPaidAmount,
  getFacturaPendingAmount,
  getEffectiveEstadoPago,

  isFacturaPaid,
  isFacturaPending,
  isFacturaOverdue,
  isFacturaSent,
  hasFacturaPdf,

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
