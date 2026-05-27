/* =========================================================
   Onion Support - Incidencias Model
   Archivo: /src/views/incidencias/incidencias.model.js

   Responsabilidad:
   - Normalizar payloads heterogéneos de tickets/incidencias.
   - Exponer un modelo estable para API, Store, View, tabla y modal.
   - Preservar cliente, técnico, adjuntos, historial, comentarios y facturas.
   - Calcular etiquetas, flags, fechas, stats, búsqueda, filtros y ordenación.
   - Mantener compatibilidad legacy con paginateIncidencias sin paginación visual real.
   - Orden canónico de lista: más nueva → más antigua.
   - No limitar la colección normalizada.
   - No importar AppCore.
   - No tocar DOM.
   - No llamar APIs.
   - No leer/escribir Store.
   - No registrar bridges ni eventos.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const INCIDENCIAS_MODEL_VERSION = "incidencias.model.v3.solid";

export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_VISIBLE_COUNT = 20;
export const DEFAULT_LOAD_MORE_BATCH = 20;
export const MAX_VISIBLE_COUNT = 10000;
export const DEFAULT_CURRENCY = "EUR";

export const STATUS = Object.freeze({
  OPEN: "open",
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

export const PRIORITY = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
});

export const FILTER = Object.freeze({
  ALL: "all",
  OPEN: "open",
  CLOSED: "closed",
});

const STATUS_ALIAS_MAP = Object.freeze({
  open: STATUS.OPEN,
  opened: STATUS.OPEN,
  active: STATUS.OPEN,
  activa: STATUS.OPEN,
  activo: STATUS.OPEN,
  abierta: STATUS.OPEN,
  abiertas: STATUS.OPEN,
  abierto: STATUS.OPEN,
  abiertos: STATUS.OPEN,

  new: STATUS.PENDING,
  nuevo: STATUS.PENDING,
  nueva: STATUS.PENDING,
  created: STATUS.PENDING,
  pending: STATUS.PENDING,
  pendiente: STATUS.PENDING,
  pendientes: STATUS.PENDING,

  progress: STATUS.IN_PROGRESS,
  in_progress: STATUS.IN_PROGRESS,
  inprogress: STATUS.IN_PROGRESS,
  en_proceso: STATUS.IN_PROGRESS,
  en_curso: STATUS.IN_PROGRESS,
  proceso: STATUS.IN_PROGRESS,
  working: STATUS.IN_PROGRESS,
  trabajando: STATUS.IN_PROGRESS,
  assigned: STATUS.IN_PROGRESS,
  asignada: STATUS.IN_PROGRESS,
  asignado: STATUS.IN_PROGRESS,

  resolved: STATUS.RESOLVED,
  resuelta: STATUS.RESOLVED,
  resueltas: STATUS.RESOLVED,
  resuelto: STATUS.RESOLVED,
  resueltos: STATUS.RESOLVED,
  solved: STATUS.RESOLVED,

  closed: STATUS.CLOSED,
  close: STATUS.CLOSED,
  archived: STATUS.CLOSED,
  archivada: STATUS.CLOSED,
  archivado: STATUS.CLOSED,
  cancelled: STATUS.CLOSED,
  canceled: STATUS.CLOSED,
  cancelada: STATUS.CLOSED,
  cancelado: STATUS.CLOSED,
  cerrada: STATUS.CLOSED,
  cerradas: STATUS.CLOSED,
  cerrado: STATUS.CLOSED,
  cerrados: STATUS.CLOSED,
});

const PRIORITY_ALIAS_MAP = Object.freeze({
  low: PRIORITY.LOW,
  baja: PRIORITY.LOW,
  minor: PRIORITY.LOW,
  menor: PRIORITY.LOW,
  p3: PRIORITY.LOW,

  medium: PRIORITY.MEDIUM,
  media: PRIORITY.MEDIUM,
  normal: PRIORITY.MEDIUM,
  p2: PRIORITY.MEDIUM,

  high: PRIORITY.HIGH,
  alta: PRIORITY.HIGH,
  p1: PRIORITY.HIGH,

  urgent: PRIORITY.URGENT,
  urgente: PRIORITY.URGENT,
  critical: PRIORITY.URGENT,
  critica: PRIORITY.URGENT,
  crítica: PRIORITY.URGENT,
  critico: PRIORITY.URGENT,
  crítico: PRIORITY.URGENT,
  p0: PRIORITY.URGENT,
});

const FILTER_ALIAS_MAP = Object.freeze({
  all: FILTER.ALL,
  todo: FILTER.ALL,
  todos: FILTER.ALL,
  todas: FILTER.ALL,

  open: FILTER.OPEN,
  opened: FILTER.OPEN,
  active: FILTER.OPEN,
  pending: FILTER.OPEN,
  progress: FILTER.OPEN,
  in_progress: FILTER.OPEN,
  inprogress: FILTER.OPEN,
  pendiente: FILTER.OPEN,
  pendientes: FILTER.OPEN,
  abierta: FILTER.OPEN,
  abiertas: FILTER.OPEN,
  abierto: FILTER.OPEN,
  abiertos: FILTER.OPEN,
  proceso: FILTER.OPEN,
  en_proceso: FILTER.OPEN,

  closed: FILTER.CLOSED,
  close: FILTER.CLOSED,
  resolved: FILTER.CLOSED,
  solved: FILTER.CLOSED,
  archived: FILTER.CLOSED,
  cancelled: FILTER.CLOSED,
  canceled: FILTER.CLOSED,
  cerrada: FILTER.CLOSED,
  cerradas: FILTER.CLOSED,
  cerrado: FILTER.CLOSED,
  cerrados: FILTER.CLOSED,
  resuelta: FILTER.CLOSED,
  resueltas: FILTER.CLOSED,
  resuelto: FILTER.CLOSED,
  resueltos: FILTER.CLOSED,
});

const OPEN_STATUS_KEYS = new Set([
  STATUS.OPEN,
  STATUS.PENDING,
  STATUS.IN_PROGRESS,
]);

const CLOSED_STATUS_KEYS = new Set([
  STATUS.RESOLVED,
  STATUS.CLOSED,
]);

const RAW_EXCLUDED_KEYS = new Set([
  "raw",
  "searchText",
  "timeline",
  "normalizedInvoices",
]);

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
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
      .replace(/\s+/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      normalized = lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(/,/g, ".")
        : normalized.replace(/,/g, "");
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length);
}

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

export function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const key = normalizeText(value);

  if (["true", "1", "yes", "y", "si", "sí", "on"].includes(key)) return true;
  if (["false", "0", "no", "n", "off"].includes(key)) return false;

  return fallback;
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

function clampNumber(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
  return Math.min(Math.max(safeNumber(value, min), min), max);
}

function removeRawKey(value = {}) {
  if (!isObject(value)) return {};

  return Object.entries(value).reduce((acc, [key, entry]) => {
    if (RAW_EXCLUDED_KEYS.has(key)) return acc;
    acc[key] = entry;
    return acc;
  }, {});
}

function buildRawSnapshot(item = {}, raw = {}, patch = {}) {
  return {
    ...removeRawKey(raw),
    ...removeRawKey(item),
    ...patch,
  };
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i.test(
    String(value || "")
  );
}

function safeImageSrc(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (hasSensitiveQuery(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(?:data|blob|javascript|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";

  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (raw.includes("/") || /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i.test(raw)) {
    const clean = raw
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .replace(/\/{2,}/g, "/");

    return clean ? `/${clean}` : "";
  }

  return "";
}

function safeFileUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(?:javascript|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";
  if (/^blob:/i.test(raw)) return raw;
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

function avatarFromObject(value = null) {
  if (typeof value === "string") return safeImageSrc(value);
  if (!isObject(value)) return "";

  return safeImageSrc(
    first(
      value.avatarUrl,
      value.avatarURL,
      value.avatar_url,
      value.avatar,
      value.assignedToAvatarUrl,
      value.assignedToAvatar,
      value.technicianAvatarUrl,
      value.technicianAvatar,
      value.tecnicoAvatarUrl,
      value.tecnicoAvatar,
      value.agentAvatarUrl,
      value.agentAvatar,
      value.photoUrl,
      value.photoURL,
      value.photo_url,
      value.photo,
      value.pictureUrl,
      value.pictureURL,
      value.picture_url,
      value.picture,
      value.imageUrl,
      value.imageURL,
      value.image_url,
      value.image,
      value.fotoUrl,
      value.fotoURL,
      value.foto_url,
      value.foto,
      value.imagenUrl,
      value.imagenURL,
      value.imagen_url,
      value.imagen,
      value.url,
      value.href,
      value.src,
      value.path,
      ""
    )
  );
}

/* =========================================================
   HASH / VISUALS
========================================================= */

function hashString(value = "") {
  const str = String(value || "onion");
  let hash = 2166136261;

  for (let index = 0; index < str.length; index += 1) {
    hash ^= str.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return Math.abs(hash >>> 0);
}

export function getInitials(value = "") {
  const text = normalizeWhitespace(value || "ON");
  const parts = text.split(/\s+/).filter(Boolean);

  if (!parts.length) return "ON";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || "ON";

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase() || "ON";
}

export function getAvatarTheme(seed = "") {
  const themes = ["violet", "emerald", "blue", "amber", "rose", "purple", "cyan", "orange"];
  return themes[hashString(seed) % themes.length];
}

/* =========================================================
   LABELS / FILTERS
========================================================= */

export function normalizeStatus(value = "") {
  const key = normalizeKey(value || STATUS.OPEN);
  return STATUS_ALIAS_MAP[key] || STATUS.OPEN;
}

export function normalizePriority(value = "") {
  const key = normalizeKey(value || PRIORITY.MEDIUM);
  return PRIORITY_ALIAS_MAP[key] || PRIORITY.MEDIUM;
}

export function normalizeFilter(value = FILTER.ALL) {
  const key = normalizeKey(value || FILTER.ALL);
  return FILTER_ALIAS_MAP[key] || FILTER.ALL;
}

export function isOpenStatus(value = "") {
  return OPEN_STATUS_KEYS.has(normalizeStatus(value));
}

export function isClosedStatus(value = "") {
  return CLOSED_STATUS_KEYS.has(normalizeStatus(value));
}

export function getStatusLabel(value = "") {
  switch (normalizeStatus(value)) {
    case STATUS.OPEN:
      return "Abierta";
    case STATUS.PENDING:
      return "Pendiente";
    case STATUS.IN_PROGRESS:
      return "En proceso";
    case STATUS.RESOLVED:
      return "Resuelta";
    case STATUS.CLOSED:
      return "Cerrada";
    default:
      return "Abierta";
  }
}

export function getPriorityLabel(value = "") {
  switch (normalizePriority(value)) {
    case PRIORITY.LOW:
      return "Baja";
    case PRIORITY.MEDIUM:
      return "Media";
    case PRIORITY.HIGH:
      return "Alta";
    case PRIORITY.URGENT:
      return "Urgente";
    default:
      return "Media";
  }
}

/* =========================================================
   DATES
========================================================= */

function parseSpanishDate(value = "") {
  const text = safeText(value, "");
  if (!text) return null;

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;

  const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));

  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDate(value = null) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 9999999999 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = safeText(value, "");
  if (!raw) return null;

  const spanishDate = parseSpanishDate(raw);
  if (spanishDate) return spanishDate;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric > 9999999999 ? numeric : numeric * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw.includes("T") || raw.includes("Z") ? raw : `${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toTimestamp(value = null) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

function readTimestampFromItem(item = {}) {
  const source = safeObject(item);
  const raw = safeObject(source.raw);

  return (
    safeNumber(source.meta?.updatedAtMs, 0) ||
    safeNumber(source.meta?.timestampMs, 0) ||
    safeNumber(source.updatedAtTs, 0) ||
    safeNumber(raw.meta?.updatedAtMs, 0) ||
    safeNumber(raw.meta?.timestampMs, 0) ||
    safeNumber(raw.updatedAtTs, 0) ||
    toTimestamp(first(source.lastActivityAt, source.updatedAt, source.modifiedAt, source.closedAt, source.createdAt, raw.lastActivityAt, raw.updatedAt, raw.modifiedAt, raw.closedAt, raw.createdAt)) ||
    (Number.isFinite(Number(source._ts)) ? Number(source._ts) * 1000 : 0) ||
    (Number.isFinite(Number(raw._ts)) ? Number(raw._ts) * 1000 : 0) ||
    0
  );
}

/* =========================================================
   MONEY / INVOICES
========================================================= */

function normalizeMoney(value, fallback = null) {
  const number = safeNumber(value, Number.NaN);
  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value, fallback = null) {
  const amount = normalizeMoney(value, fallback);
  if (!Number.isFinite(amount)) return fallback;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function collectInvoiceObjects(source = {}, raw = {}) {
  const sourceLinked = safeObject(source.linkedInvoices);
  const rawLinked = safeObject(raw.linkedInvoices);

  return [
    source.factura,
    source.invoice,
    source.billing,
    sourceLinked,
    raw.factura,
    raw.invoice,
    raw.billing,
    rawLinked,
    ...safeArray(source.facturas),
    ...safeArray(source.invoices),
    ...safeArray(source.facturasRelacionadas),
    ...safeArray(source.linkedFacturas),
    ...safeArray(sourceLinked.items),
    ...safeArray(sourceLinked.invoices),
    ...safeArray(sourceLinked.facturas),
    ...safeArray(raw.facturas),
    ...safeArray(raw.invoices),
    ...safeArray(raw.facturasRelacionadas),
    ...safeArray(raw.linkedFacturas),
    ...safeArray(rawLinked.items),
    ...safeArray(rawLinked.invoices),
    ...safeArray(rawLinked.facturas),
  ].filter(hasOwnKeys);
}

function resolveInvoiceNumber(source = {}, raw = {}) {
  const invoices = collectInvoiceObjects(source, raw);

  return safeText(
    first(
      source.numeroFacturaLegal,
      source.numeroFactura,
      source.invoiceNumber,
      source.legalInvoiceNumber,
      source.facturaNumeroLegal,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.legalInvoiceNumber,
      raw.facturaNumeroLegal,
      ...invoices.map((invoice) => invoice?.numeroFacturaLegal),
      ...invoices.map((invoice) => invoice?.numeroFactura),
      ...invoices.map((invoice) => invoice?.invoiceNumber),
      ...invoices.map((invoice) => invoice?.legalNumber),
      ...invoices.map((invoice) => invoice?.number)
    ),
    ""
  );
}

function resolvePrimaryInvoiceId(source = {}, raw = {}) {
  const invoices = collectInvoiceObjects(source, raw);

  return safeText(
    first(
      source.facturaId,
      source.invoiceId,
      source.linkedFacturaId,
      source.linkedInvoiceId,
      raw.facturaId,
      raw.invoiceId,
      raw.linkedFacturaId,
      raw.linkedInvoiceId,
      source.linkedInvoices?.primaryInvoiceId,
      raw.linkedInvoices?.primaryInvoiceId,
      ...safeArray(source.facturaIds),
      ...safeArray(source.invoiceIds),
      ...safeArray(source.linkedInvoices?.ids),
      ...safeArray(raw.facturaIds),
      ...safeArray(raw.invoiceIds),
      ...safeArray(raw.linkedInvoices?.ids),
      ...invoices.map((invoice) => invoice?.id),
      ...invoices.map((invoice) => invoice?.facturaId),
      ...invoices.map((invoice) => invoice?.invoiceId),
      ...invoices.map((invoice) => invoice?.documentId)
    ),
    ""
  );
}

function resolveInvoiceIds(source = {}, raw = {}) {
  const invoices = collectInvoiceObjects(source, raw);

  return uniqueStrings([
    source.facturaId,
    source.invoiceId,
    source.linkedFacturaId,
    source.linkedInvoiceId,
    source.numeroFacturaLegal,
    source.numeroFactura,
    source.invoiceNumber,
    raw.facturaId,
    raw.invoiceId,
    raw.linkedFacturaId,
    raw.linkedInvoiceId,
    raw.numeroFacturaLegal,
    raw.numeroFactura,
    raw.invoiceNumber,
    source.linkedInvoices?.primaryInvoiceId,
    raw.linkedInvoices?.primaryInvoiceId,
    ...safeArray(source.facturaIds),
    ...safeArray(source.invoiceIds),
    ...safeArray(source.linkedInvoices?.ids),
    ...safeArray(raw.facturaIds),
    ...safeArray(raw.invoiceIds),
    ...safeArray(raw.linkedInvoices?.ids),
    ...invoices.flatMap((invoice) => [invoice?.id, invoice?.facturaId, invoice?.invoiceId, invoice?.documentId, invoice?.numeroFacturaLegal, invoice?.numeroFactura, invoice?.invoiceNumber, invoice?.legalNumber, invoice?.number]),
  ]);
}

function resolveInvoiceCurrency(source = {}, raw = {}) {
  const invoices = collectInvoiceObjects(source, raw);

  return safeText(
    first(
      source.facturaCurrency,
      source.facturaMoneda,
      source.currency,
      source.moneda,
      source.linkedInvoices?.currency,
      source.linkedInvoices?.moneda,
      source.meta?.invoiceCurrency,
      source.meta?.currency,
      source.meta?.moneda,
      raw.facturaCurrency,
      raw.facturaMoneda,
      raw.currency,
      raw.moneda,
      raw.linkedInvoices?.currency,
      raw.linkedInvoices?.moneda,
      raw.meta?.invoiceCurrency,
      raw.meta?.currency,
      raw.meta?.moneda,
      ...invoices.map((invoice) => invoice?.currency),
      ...invoices.map((invoice) => invoice?.moneda),
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  ).toUpperCase();
}

function resolveInvoiceAmount(source = {}, raw = {}) {
  const invoices = collectInvoiceObjects(source, raw);

  const candidates = [
    source.facturaTotal,
    source.facturaImporte,
    source.importeFactura,
    source.totalFactura,
    source.invoiceAmount,
    source.facturasTotal,
    source.invoicesTotal,
    source.importeFacturas,
    source.invoiceTotal,
    source.linkedInvoices?.total,
    source.linkedInvoices?.amount,
    source.linkedInvoices?.importe,
    source.meta?.invoicesTotal,
    source.meta?.invoiceTotal,
    source.billing?.total,
    source.billing?.amount,
    source.billing?.importe,
    source.factura?.total,
    source.factura?.amount,
    source.factura?.importe,
    source.invoice?.total,
    source.invoice?.amount,
    source.invoice?.importe,
    raw.facturaTotal,
    raw.facturaImporte,
    raw.importeFactura,
    raw.totalFactura,
    raw.invoiceAmount,
    raw.facturasTotal,
    raw.invoicesTotal,
    raw.importeFacturas,
    raw.invoiceTotal,
    raw.linkedInvoices?.total,
    raw.linkedInvoices?.amount,
    raw.linkedInvoices?.importe,
    raw.meta?.invoicesTotal,
    raw.meta?.invoiceTotal,
    raw.billing?.total,
    raw.billing?.amount,
    raw.billing?.importe,
    raw.factura?.total,
    raw.factura?.amount,
    raw.factura?.importe,
    raw.invoice?.total,
    raw.invoice?.amount,
    raw.invoice?.importe,
    ...invoices.map((invoice) => invoice?.total),
    ...invoices.map((invoice) => invoice?.amount),
    ...invoices.map((invoice) => invoice?.importe),
    ...invoices.map((invoice) => invoice?.importeTotal),
    ...invoices.map((invoice) => invoice?.totalFactura),
  ];

  for (const candidate of candidates) {
    const amount = roundMoney(candidate, null);
    if (amount !== null) return amount;
  }

  const hasInvoiceEvidence = Boolean(
    resolveInvoiceNumber(source, raw) ||
      resolveInvoiceIds(source, raw).length ||
      invoices.length ||
      safeBoolean(source.meta?.hasLinkedInvoices, false) ||
      safeBoolean(raw.meta?.hasLinkedInvoices, false) ||
      safeBoolean(source.meta?.hasInvoice, false) ||
      safeBoolean(raw.meta?.hasInvoice, false) ||
      safeBoolean(source.meta?.hasFactura, false) ||
      safeBoolean(raw.meta?.hasFactura, false)
  );

  if (!hasInvoiceEvidence) return null;

  const genericAmount = roundMoney(first(source.total, source.amount, source.importe, source.price, raw.total, raw.amount, raw.importe, raw.price), null);
  return genericAmount === null ? 0 : genericAmount;
}

function resolveInvoiceCount(source = {}, raw = {}, invoiceIds = []) {
  const invoices = collectInvoiceObjects(source, raw);

  return Math.max(
    0,
    safeNumber(
      first(
        source.facturasCount,
        source.invoicesCount,
        source.linkedInvoices?.count,
        source.meta?.linkedInvoiceCount,
        source.meta?.invoiceCount,
        raw.facturasCount,
        raw.invoicesCount,
        raw.linkedInvoices?.count,
        raw.meta?.linkedInvoiceCount,
        raw.meta?.invoiceCount,
        invoiceIds.length,
        invoices.length
      ),
      Math.max(invoiceIds.length, invoices.length)
    )
  );
}

function getPaymentStatus(source = {}, raw = {}) {
  const key = normalizeKey(
    first(
      source.paymentStatus,
      source.estadoPago,
      source.statusPago,
      source.paidStatus,
      source.factura?.paymentStatus,
      source.factura?.estadoPago,
      source.invoice?.paymentStatus,
      source.invoice?.estadoPago,
      source.billing?.paymentStatus,
      source.billing?.estadoPago,
      source.linkedInvoices?.paymentStatus,
      source.linkedInvoices?.estadoPago,
      raw.paymentStatus,
      raw.estadoPago,
      raw.statusPago,
      raw.paidStatus,
      raw.factura?.paymentStatus,
      raw.factura?.estadoPago,
      raw.invoice?.paymentStatus,
      raw.invoice?.estadoPago,
      raw.billing?.paymentStatus,
      raw.billing?.estadoPago,
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

function normalizeInvoiceLite(invoice = {}) {
  if (!hasOwnKeys(invoice)) return null;

  const raw = safeObject(invoice.raw);
  const total = resolveInvoiceAmount(invoice, raw);
  const finalTotal = total === null ? 0 : total;
  const id = resolvePrimaryInvoiceId(invoice, raw);
  const numeroFacturaLegal = resolveInvoiceNumber(invoice, raw);
  const currency = resolveInvoiceCurrency(invoice, raw);
  const paymentStatus = getPaymentStatus(invoice, raw);

  if (!id && !numeroFacturaLegal && total === null) return null;

  return {
    ...removeRawKey(invoice),
    id,
    facturaId: safeText(first(invoice.facturaId, raw.facturaId, id), id),
    invoiceId: safeText(first(invoice.invoiceId, raw.invoiceId, id), id),
    numeroFacturaLegal,
    numeroFactura: safeText(first(invoice.numeroFactura, raw.numeroFactura, numeroFacturaLegal), numeroFacturaLegal),
    invoiceNumber: safeText(first(invoice.invoiceNumber, raw.invoiceNumber, numeroFacturaLegal), numeroFacturaLegal),
    legalNumber: safeText(first(invoice.legalNumber, raw.legalNumber, numeroFacturaLegal), numeroFacturaLegal),
    number: safeText(first(invoice.number, raw.number, numeroFacturaLegal), numeroFacturaLegal),
    total: finalTotal,
    amount: finalTotal,
    importe: finalTotal,
    totalFactura: finalTotal,
    importeTotal: finalTotal,
    invoiceAmount: finalTotal,
    currency,
    moneda: currency,
    paymentStatus,
    estadoPago: paymentStatus,
    raw: buildRawSnapshot(invoice, raw),
  };
}

function normalizeInvoiceArray(source = {}, raw = {}) {
  const output = [];
  const seen = new Set();

  collectInvoiceObjects(source, raw)
    .map(normalizeInvoiceLite)
    .filter(Boolean)
    .forEach((invoice) => {
      const key = normalizeText(first(invoice.id, invoice.facturaId, invoice.invoiceId, invoice.numeroFacturaLegal, invoice.invoiceNumber, `invoice-${output.length + 1}`));
      if (seen.has(key)) return;
      seen.add(key);
      output.push(invoice);
    });

  return output;
}

function buildInvoicePatch(source = {}, raw = {}) {
  const item = safeObject(source);
  const baseRaw = safeObject(raw);
  const invoiceIds = resolveInvoiceIds(item, baseRaw);
  const primaryInvoiceId = resolvePrimaryInvoiceId(item, baseRaw) || invoiceIds[0] || "";
  const numeroFacturaLegal = resolveInvoiceNumber(item, baseRaw);
  const currency = resolveInvoiceCurrency(item, baseRaw);
  const amount = resolveInvoiceAmount(item, baseRaw);
  const total = amount === null ? null : roundMoney(amount, 0);
  const normalizedInvoices = normalizeInvoiceArray(item, baseRaw);
  const declaredCount = resolveInvoiceCount(item, baseRaw, invoiceIds);
  const paymentStatus = getPaymentStatus(item, baseRaw);

  const hasInvoiceEvidence = Boolean(
    numeroFacturaLegal ||
      primaryInvoiceId ||
      invoiceIds.length ||
      declaredCount ||
      normalizedInvoices.length ||
      total !== null ||
      safeBoolean(item.meta?.hasLinkedInvoices, false) ||
      safeBoolean(baseRaw.meta?.hasLinkedInvoices, false) ||
      safeBoolean(item.meta?.hasInvoice, false) ||
      safeBoolean(baseRaw.meta?.hasInvoice, false) ||
      safeBoolean(item.meta?.hasFactura, false) ||
      safeBoolean(baseRaw.meta?.hasFactura, false)
  );

  const finalTotal = total === null ? (hasInvoiceEvidence ? 0 : null) : total;
  const linkedBase = { ...safeObject(baseRaw.linkedInvoices), ...safeObject(item.linkedInvoices) };
  const count = Math.max(declaredCount, safeNumber(linkedBase.count, 0), invoiceIds.length, normalizedInvoices.length, hasInvoiceEvidence ? 1 : 0);

  const linkedInvoices = {
    ...linkedBase,
    count,
    ids: uniqueStrings(first(linkedBase.ids, invoiceIds)),
    primaryInvoiceId,
    numeroFacturaLegal,
    numeroFactura: safeText(first(linkedBase.numeroFactura, numeroFacturaLegal), numeroFacturaLegal),
    invoiceNumber: safeText(first(linkedBase.invoiceNumber, numeroFacturaLegal), numeroFacturaLegal),
    total: finalTotal,
    amount: finalTotal,
    importe: finalTotal,
    currency,
    moneda: currency,
    paymentStatus,
    estadoPago: paymentStatus,
    invoices: safeArray(first(linkedBase.invoices, normalizedInvoices)),
    facturas: safeArray(first(linkedBase.facturas, normalizedInvoices)),
  };

  const billing = {
    ...safeObject(baseRaw.billing),
    ...safeObject(item.billing),
    facturaId: safeText(first(item.billing?.facturaId, baseRaw.billing?.facturaId, primaryInvoiceId), primaryInvoiceId),
    invoiceId: safeText(first(item.billing?.invoiceId, baseRaw.billing?.invoiceId, primaryInvoiceId), primaryInvoiceId),
    numeroFacturaLegal,
    numeroFactura: numeroFacturaLegal,
    invoiceNumber: numeroFacturaLegal,
    total: finalTotal,
    amount: finalTotal,
    importe: finalTotal,
    currency,
    moneda: currency,
    paymentStatus,
    estadoPago: paymentStatus,
  };

  const meta = {
    ...safeObject(baseRaw.meta),
    ...safeObject(item.meta),
    hasLinkedInvoices: Boolean(item.meta?.hasLinkedInvoices || baseRaw.meta?.hasLinkedInvoices || hasInvoiceEvidence),
    hasInvoice: Boolean(item.meta?.hasInvoice || baseRaw.meta?.hasInvoice || hasInvoiceEvidence),
    hasFactura: Boolean(item.meta?.hasFactura || baseRaw.meta?.hasFactura || hasInvoiceEvidence),
    facturaLinked: Boolean(item.meta?.facturaLinked || baseRaw.meta?.facturaLinked || hasInvoiceEvidence),
    linkedInvoiceCount: count,
    invoiceCount: count,
    invoicesTotal: finalTotal,
    invoiceTotal: finalTotal,
    invoiceCurrency: currency,
    numeroFacturaLegal,
    primaryInvoiceId,
  };

  if (!hasInvoiceEvidence) {
    return {
      hasInvoiceEvidence: false,
      amount: null,
      currency,
      numeroFacturaLegal: "",
      invoiceIds: [],
      normalizedInvoices: [],
      linkedInvoices,
      billing: hasOwnKeys(item.billing) || hasOwnKeys(baseRaw.billing) ? billing : null,
      meta,
    };
  }

  return {
    hasInvoiceEvidence: true,
    facturaId: safeText(first(item.facturaId, baseRaw.facturaId, item.invoiceId, baseRaw.invoiceId, primaryInvoiceId), primaryInvoiceId),
    invoiceId: safeText(first(item.invoiceId, baseRaw.invoiceId, item.facturaId, baseRaw.facturaId, primaryInvoiceId), primaryInvoiceId),
    linkedFacturaId: safeText(first(item.linkedFacturaId, baseRaw.linkedFacturaId, primaryInvoiceId), primaryInvoiceId),
    linkedInvoiceId: safeText(first(item.linkedInvoiceId, baseRaw.linkedInvoiceId, primaryInvoiceId), primaryInvoiceId),
    facturaIds: uniqueStrings(first(item.facturaIds, baseRaw.facturaIds, invoiceIds)),
    invoiceIds: uniqueStrings(first(item.invoiceIds, baseRaw.invoiceIds, invoiceIds)),
    numeroFacturaLegal,
    numeroFactura: numeroFacturaLegal,
    invoiceNumber: numeroFacturaLegal,
    facturaRelacionada: safeText(first(item.facturaRelacionada, baseRaw.facturaRelacionada, count > 0 ? `${count} factura${count === 1 ? "" : "s"} vinculada${count === 1 ? "" : "s"}` : ""), ""),
    facturasCount: count,
    invoicesCount: count,
    factura: first(item.factura, baseRaw.factura, normalizedInvoices[0], null),
    invoice: first(item.invoice, baseRaw.invoice, normalizedInvoices[0], null),
    billing,
    facturas: safeArray(first(item.facturas, baseRaw.facturas, normalizedInvoices)),
    invoices: safeArray(first(item.invoices, baseRaw.invoices, normalizedInvoices)),
    facturasRelacionadas: safeArray(first(item.facturasRelacionadas, baseRaw.facturasRelacionadas, normalizedInvoices)),
    linkedInvoices,
    facturasTotal: finalTotal,
    invoicesTotal: finalTotal,
    importeFacturas: finalTotal,
    invoiceTotal: finalTotal,
    facturaTotal: finalTotal,
    facturaImporte: finalTotal,
    importeFactura: finalTotal,
    totalFactura: finalTotal,
    invoiceAmount: finalTotal,
    total: finalTotal,
    amount: finalTotal,
    importe: finalTotal,
    price: finalTotal,
    currency,
    moneda: currency,
    facturaCurrency: currency,
    facturaMoneda: currency,
    paymentStatus,
    estadoPago: paymentStatus,
    meta,
    normalizedInvoices,
  };
}

/* =========================================================
   ATTACHMENTS
========================================================= */

function normalizeAttachment(file = {}, index = 0) {
  const item = safeObject(file);
  const raw = safeObject(item.raw);

  const path = safeText(first(item.path, item.storageKey, item.storagePath, item.blobPath, item.blobName, item.key, raw.path, raw.storageKey, raw.storagePath, raw.blobPath, raw.blobName, raw.key), "");
  const name = safeText(first(item.name, item.filename, item.fileName, item.originalname, item.originalName, item.title, raw.name, raw.filename, raw.fileName, raw.originalname, raw.originalName, raw.title, path.split("/").filter(Boolean).pop()), `archivo_${index + 1}`);
  const id = safeText(first(item.id, item.fileId, item.attachmentId, item.blobName, item.storageKey, item.path, item.key, raw.id, raw.fileId, raw.attachmentId, raw.blobName, raw.storageKey, raw.path, raw.key), path || `attachment-${index + 1}`);
  const viewUrl = safeFileUrl(first(item.viewUrl, item.openUrl, item.signedUrl, item.url, item.blobUrl, item.publicUrl, item.href, raw.viewUrl, raw.openUrl, raw.signedUrl, raw.url, raw.blobUrl, raw.publicUrl, raw.href));
  const downloadUrl = safeFileUrl(first(item.downloadUrl, item.signedUrl, item.url, item.blobUrl, item.publicUrl, item.href, raw.downloadUrl, raw.signedUrl, raw.url, raw.blobUrl, raw.publicUrl, raw.href, viewUrl));
  const contentType = safeText(first(item.contentType, item.mimetype, item.mimeType, item.mime, item.type, raw.contentType, raw.mimetype, raw.mimeType, raw.mime, raw.type), "");
  const size = safeNumber(first(item.size, item.sizeBytes, item.contentLength, raw.size, raw.sizeBytes, raw.contentLength), 0);

  return {
    ...removeRawKey(item),
    id,
    attachmentId: safeText(first(item.attachmentId, raw.attachmentId, id), id),
    fileId: safeText(first(item.fileId, raw.fileId, id), id),
    name,
    filename: safeText(first(item.filename, item.fileName, item.name, raw.filename, raw.fileName, raw.name), name),
    fileName: safeText(first(item.fileName, item.filename, item.name, raw.fileName, raw.filename, raw.name), name),
    originalName: safeText(first(item.originalName, item.originalname, raw.originalName, raw.originalname, name), name),
    url: safeFileUrl(first(item.url, viewUrl, downloadUrl, item.signedUrl, item.blobUrl, item.publicUrl, raw.url, raw.signedUrl, raw.blobUrl, raw.publicUrl)),
    viewUrl,
    openUrl: safeFileUrl(first(item.openUrl, raw.openUrl, viewUrl)),
    downloadUrl,
    signedUrl: safeFileUrl(first(item.signedUrl, raw.signedUrl, viewUrl)),
    blobUrl: safeFileUrl(first(item.blobUrl, raw.blobUrl)),
    publicUrl: safeFileUrl(first(item.publicUrl, raw.publicUrl)),
    path,
    storageKey: safeText(first(item.storageKey, raw.storageKey, path), path),
    storagePath: safeText(first(item.storagePath, raw.storagePath, path), path),
    blobPath: safeText(first(item.blobPath, raw.blobPath, path), path),
    blobName: safeText(first(item.blobName, raw.blobName, path), path),
    key: safeText(first(item.key, raw.key, path), path),
    size,
    sizeBytes: size,
    type: safeText(first(item.type, raw.type, contentType), contentType),
    contentType,
    mimetype: safeText(first(item.mimetype, raw.mimetype, contentType), contentType),
    mimeType: safeText(first(item.mimeType, raw.mimeType, contentType), contentType),
    source: safeText(first(item.source, raw.source), "user_upload"),
    uploadedAt: first(item.uploadedAt, item.createdAt, item.date, item.timestamp, raw.uploadedAt, raw.createdAt, raw.date, raw.timestamp, null),
    uploadedAtES: first(item.uploadedAtES, raw.uploadedAtES, null),
    createdAt: first(item.createdAt, item.uploadedAt, raw.createdAt, raw.uploadedAt, null),
    uploadedBy: first(item.uploadedBy, raw.uploadedBy, null),
    meta: {
      ...safeObject(raw.meta),
      ...safeObject(item.meta),
      hasBlobPath: Boolean(path),
      hasViewUrl: Boolean(viewUrl),
      hasDownloadUrl: Boolean(downloadUrl),
    },
    raw: buildRawSnapshot(item, raw),
  };
}

function normalizeAttachments(value) {
  const seen = new Set();
  const output = [];

  safeArray(value).forEach((file, index) => {
    const item = normalizeAttachment(file, index);
    const key = normalizeText(first(item.id, item.attachmentId, item.storageKey, item.path, item.name, `attachment-${index + 1}`));
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });

  return output;
}

/* =========================================================
   HISTORY / COMMENTS
========================================================= */

function formatChange(change = {}) {
  const item = safeObject(change);
  const field = safeLower(item.field, "");

  if (["attachments", "adjuntos", "files"].includes(field)) {
    const added = safeNumber(item.added, 0);
    const removed = safeNumber(item.removed, 0);
    if (removed > 0) return removed === 1 ? "Se eliminó 1 adjunto." : `Se eliminaron ${removed} adjuntos.`;
    if (added > 0) return added === 1 ? "Se añadió 1 adjunto." : `Se añadieron ${added} adjuntos.`;
    return "Adjuntos actualizados.";
  }

  if (["status", "estado"].includes(field)) {
    const from = safeText(item.from, "—");
    const to = safeText(item.to, "—");
    return from === to ? "" : `Estado actualizado: ${from} → ${to}.`;
  }

  if (["priority", "prioridad"].includes(field)) {
    const from = safeText(item.from, "—");
    const to = safeText(item.to, "—");
    return from === to ? "" : `Prioridad actualizada: ${from} → ${to}.`;
  }

  if (["message", "descripcion", "description", "body"].includes(field)) {
    const from = normalizeWhitespace(item.from);
    const to = normalizeWhitespace(item.to);
    return from && to && from === to ? "" : "Descripción actualizada.";
  }

  if (["categoria", "category", "tipo"].includes(field)) {
    const from = safeText(item.from, "—");
    const to = safeText(item.to, "—");
    return from === to ? "" : `Categoría actualizada: ${from} → ${to}.`;
  }

  if (!field) return "";

  const from = safeText(item.from, "");
  const to = safeText(item.to, "");

  if (from && to && from === to) return "";
  return `${field} actualizado.`;
}

function normalizeHistoryEntry(row = {}, index = 0) {
  const item = safeObject(row);
  const raw = safeObject(item.raw);
  const type = safeLower(first(item.type, item.action, raw.type, raw.action), "event");
  const changes = safeArray(first(item.changes, raw.changes));
  const createdAt = first(item.createdAt, item.date, item.timestamp, item.updatedAt, raw.createdAt, raw.date, raw.timestamp, raw.updatedAt, null);

  let title = safeText(first(item.title, item.action, item.type, item.message, item.text, raw.title, raw.action, raw.type, raw.message, raw.text), "Evento");
  let body = safeText(first(item.description, item.detail, item.body, raw.description, raw.detail, raw.body), "");

  if (["created", "creation"].includes(type)) {
    title = "Incidencia creada";
    body = safeText(first(item.body, item.description, item.detail, item.message, raw.body, raw.description, raw.detail, raw.message), "La incidencia fue registrada.");
  }

  if (["update", "updated"].includes(type)) {
    const changeLines = changes.map(formatChange).filter(Boolean);
    title = "Actualización";
    body = safeText(first(changeLines.join("\n"), body), "");
  }

  if (type === "attachments_added") {
    title = "Adjuntos añadidos";
    body = safeText(first(item.body, item.description, item.detail, item.message, raw.body, raw.description, raw.detail, raw.message, changes.map(formatChange).filter(Boolean).join("\n")), "Se añadieron adjuntos.");
  }

  if (type === "comment") {
    title = "Comentario";
    body = safeText(first(item.message, item.text, item.body, item.comment, raw.message, raw.text, raw.body, raw.comment, body), "");
  }

  return {
    id: safeText(first(item.id, item.eventId, item.historyId, raw.id, raw.eventId, raw.historyId), `h-${index + 1}`),
    kind: type === "comment" ? "comment" : "event",
    type,
    action: safeText(first(item.action, item.type, raw.action, raw.type), type),
    title,
    body,
    changes,
    createdAt,
    createdAtTs: toTimestamp(createdAt),
    author: safeText(first(item.byName, item.user, item.author, item.name, item.by, item.createdBy?.name, item.createdBy?.email, raw.byName, raw.user, raw.author, raw.name, raw.by, raw.createdBy?.name, raw.createdBy?.email), type === "comment" ? "Usuario" : "Sistema"),
    by: safeText(first(item.by, item.userId, item.createdBy?.userId, raw.by, raw.userId, raw.createdBy?.userId), ""),
    role: safeText(first(item.role, raw.role), ""),
    raw: buildRawSnapshot(item, raw),
  };
}

function normalizeCommentEntry(row = {}, index = 0) {
  const item = safeObject(row);
  const raw = safeObject(item.raw);
  const createdAt = first(item.createdAt, item.date, item.timestamp, item.updatedAt, raw.createdAt, raw.date, raw.timestamp, raw.updatedAt, null);

  return {
    id: safeText(first(item.id, item.commentId, item.messageId, raw.id, raw.commentId, raw.messageId), `c-${index + 1}`),
    kind: "comment",
    type: "comment",
    action: "comment",
    title: "Comentario",
    body: safeText(first(item.message, item.text, item.body, item.comment, raw.message, raw.text, raw.body, raw.comment), ""),
    createdAt,
    createdAtTs: toTimestamp(createdAt),
    author: safeText(first(item.byName, item.user, item.author, item.name, item.by, item.createdBy?.name, item.createdBy?.email, raw.byName, raw.user, raw.author, raw.name, raw.by, raw.createdBy?.name, raw.createdBy?.email), "Usuario"),
    by: safeText(first(item.by, item.userId, item.createdBy?.userId, raw.by, raw.userId, raw.createdBy?.userId), ""),
    role: safeText(first(item.role, raw.role), ""),
    raw: buildRawSnapshot(item, raw),
  };
}

function isNoiseHistoryEntry(entry = {}) {
  const title = safeLower(entry.title, "");
  const body = safeLower(entry.body, "");
  const type = safeLower(entry.type, "");

  if (type === "update" && !safeText(entry.body, "")) return true;
  if (title === "update" && body === "update") return true;
  if (["actualización", "actualizacion"].includes(title) && body === "update") return true;

  return false;
}

function dedupeTimeline(entries = []) {
  const seen = new Set();
  const output = [];

  safeArray(entries).forEach((entry, index) => {
    const item = safeObject(entry);
    const key = normalizeText(first(item.id, item.commentId, item.eventId, item.historyId, `${item.kind || "event"}-${item.type || "update"}-${item.createdAtTs || item.createdAt || index}-${item.body || ""}`));
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });

  return output;
}

function normalizeHistory(value) {
  return dedupeTimeline(
    safeArray(value)
      .map(normalizeHistoryEntry)
      .filter((entry) => !isNoiseHistoryEntry(entry))
  );
}

function normalizeComments(value) {
  return dedupeTimeline(
    safeArray(value)
      .map(normalizeCommentEntry)
      .filter((entry) => Boolean(safeText(entry.body, "")))
  );
}

/* =========================================================
   TECHNICIAN / REQUESTER
========================================================= */

function resolveTechnicianSource(item = {}, raw = {}) {
  const assignment = safeObject(first(item.assignment, raw.assignment));
  const assignedTo = first(item.assignedTo, raw.assignedTo);
  const tecnico = first(item.tecnico, raw.tecnico);
  const technician = first(item.technician, raw.technician);

  return {
    assignment,
    assignedTo: safeObject(typeof assignedTo === "object" ? assignedTo : {}),
    tecnico: safeObject(typeof tecnico === "object" ? tecnico : {}),
    technician: safeObject(typeof technician === "object" ? technician : {}),
    assignedToString: typeof assignedTo === "string" ? assignedTo : "",
    tecnicoString: typeof tecnico === "string" ? tecnico : "",
    technicianString: typeof technician === "string" ? technician : "",
  };
}

function resolveTechnicianId(item = {}, raw = {}) {
  const { assignment, assignedTo, tecnico, technician } = resolveTechnicianSource(item, raw);

  return safeText(
    first(
      item.assignedToUserId,
      item.assignedToId,
      item.assigneeId,
      item.technicianId,
      item.tecnicoId,
      item.agentId,
      raw.assignedToUserId,
      raw.assignedToId,
      raw.assigneeId,
      raw.technicianId,
      raw.tecnicoId,
      raw.agentId,
      assignment.assignedToUserId,
      assignment.assignedToId,
      assignment.assigneeId,
      assignment.technicianId,
      assignment.tecnicoId,
      assignment.agentId,
      assignment.userId,
      assignment.id,
      assignment.technician?.userId,
      assignment.technician?.id,
      assignment.assignedTo?.userId,
      assignment.assignedTo?.id,
      assignment.agent?.userId,
      assignment.agent?.id,
      assignedTo.userId,
      assignedTo.id,
      assignedTo.uid,
      assignedTo.sub,
      tecnico.userId,
      tecnico.id,
      tecnico.uid,
      tecnico.sub,
      technician.userId,
      technician.id,
      technician.uid,
      technician.sub,
      item.assignedTechnician?.userId,
      item.assignedTechnician?.id,
      item.assignedUser?.userId,
      item.assignedUser?.id,
      raw.assignedTechnician?.userId,
      raw.assignedTechnician?.id,
      raw.assignedUser?.userId,
      raw.assignedUser?.id,
      item.meta?.technicianUserId,
      item.meta?.assignedToUserId,
      item.meta?.assignedTechnicianUserId,
      item.meta?.lastTechnicianUserId,
      raw.meta?.technicianUserId,
      raw.meta?.assignedToUserId,
      raw.meta?.assignedTechnicianUserId,
      raw.meta?.lastTechnicianUserId,
      ""
    ),
    ""
  );
}

function resolveTechnicianName(item = {}, raw = {}) {
  const { assignment, assignedTo, tecnico, technician, assignedToString, tecnicoString, technicianString } = resolveTechnicianSource(item, raw);

  return safeText(
    first(
      item.technicianName,
      item.tecnicoName,
      item.tecnicoNombre,
      item.assignedToName,
      item.assignedName,
      item.assigneeName,
      item.agentName,
      raw.technicianName,
      raw.tecnicoName,
      raw.tecnicoNombre,
      raw.assignedToName,
      raw.assignedName,
      raw.assigneeName,
      raw.agentName,
      assignment.assignedToName,
      assignment.technicianName,
      assignment.tecnicoName,
      assignment.agentName,
      assignment.displayName,
      assignment.fullName,
      assignment.name,
      assignment.technician?.displayName,
      assignment.technician?.fullName,
      assignment.technician?.name,
      assignment.technician?.nombre,
      assignment.assignedTo?.displayName,
      assignment.assignedTo?.fullName,
      assignment.assignedTo?.name,
      assignment.assignedTo?.nombre,
      assignment.agent?.displayName,
      assignment.agent?.fullName,
      assignment.agent?.name,
      assignment.agent?.nombre,
      assignedTo.displayName,
      assignedTo.fullName,
      assignedTo.name,
      assignedTo.nombre,
      assignedTo.username,
      tecnico.displayName,
      tecnico.fullName,
      tecnico.name,
      tecnico.nombre,
      tecnico.username,
      technician.displayName,
      technician.fullName,
      technician.name,
      technician.nombre,
      technician.username,
      item.meta?.technicianName,
      item.meta?.assignedTechnicianName,
      item.meta?.lastTechnicianName,
      raw.meta?.technicianName,
      raw.meta?.assignedTechnicianName,
      raw.meta?.lastTechnicianName,
      assignedToString,
      tecnicoString,
      technicianString
    ),
    "No asignado"
  );
}

function resolveTechnicianEmail(item = {}, raw = {}) {
  const { assignment, assignedTo, tecnico, technician } = resolveTechnicianSource(item, raw);

  return safeLower(
    first(
      item.assignedToEmail,
      item.technicianEmail,
      item.tecnicoEmail,
      item.agentEmail,
      raw.assignedToEmail,
      raw.technicianEmail,
      raw.tecnicoEmail,
      raw.agentEmail,
      assignment.assignedToEmail,
      assignment.technicianEmail,
      assignment.tecnicoEmail,
      assignment.agentEmail,
      assignment.email,
      assignment.technician?.email,
      assignment.assignedTo?.email,
      assignment.agent?.email,
      assignedTo.email,
      assignedTo.emailLower,
      tecnico.email,
      tecnico.emailLower,
      technician.email,
      technician.emailLower,
      item.meta?.technicianEmail,
      item.meta?.assignedTechnicianEmail,
      item.meta?.lastTechnicianEmail,
      raw.meta?.technicianEmail,
      raw.meta?.assignedTechnicianEmail,
      raw.meta?.lastTechnicianEmail,
      ""
    ),
    ""
  );
}

function resolveTechnicianAvatar(item = {}, raw = {}) {
  const { assignment, assignedTo, tecnico, technician } = resolveTechnicianSource(item, raw);

  return safeImageSrc(
    first(
      avatarFromObject(technician),
      avatarFromObject(assignedTo),
      avatarFromObject(tecnico),
      avatarFromObject(item.assignedTechnician),
      avatarFromObject(item.assignedUser),
      avatarFromObject(raw.assignedTechnician),
      avatarFromObject(raw.assignedUser),
      avatarFromObject(assignment.technician),
      avatarFromObject(assignment.assignedTo),
      avatarFromObject(assignment.agent),
      avatarFromObject(assignment),
      item.technicianAvatarUrl,
      item.technicianAvatar,
      item.tecnicoAvatarUrl,
      item.tecnicoAvatar,
      item.assignedToAvatarUrl,
      item.assignedToAvatar,
      item.assignedAvatarUrl,
      item.assignedAvatar,
      item.agentAvatarUrl,
      item.agentAvatar,
      raw.technicianAvatarUrl,
      raw.technicianAvatar,
      raw.tecnicoAvatarUrl,
      raw.tecnicoAvatar,
      raw.assignedToAvatarUrl,
      raw.assignedToAvatar,
      raw.assignedAvatarUrl,
      raw.assignedAvatar,
      raw.agentAvatarUrl,
      raw.agentAvatar,
      item.meta?.technicianAvatarUrl,
      item.meta?.technicianAvatar,
      item.meta?.assignedTechnicianAvatarUrl,
      item.meta?.assignedTechnicianAvatar,
      item.meta?.assignedToAvatarUrl,
      item.meta?.assignedToAvatar,
      item.meta?.lastTechnicianAvatarUrl,
      item.meta?.lastTechnicianAvatar,
      raw.meta?.technicianAvatarUrl,
      raw.meta?.technicianAvatar,
      raw.meta?.assignedTechnicianAvatarUrl,
      raw.meta?.assignedTechnicianAvatar,
      raw.meta?.assignedToAvatarUrl,
      raw.meta?.assignedToAvatar,
      raw.meta?.lastTechnicianAvatarUrl,
      raw.meta?.lastTechnicianAvatar,
      ""
    )
  );
}

function buildTechnicianObject(item = {}, raw = {}) {
  const { assignment, assignedTo, tecnico, technician } = resolveTechnicianSource(item, raw);
  const userId = resolveTechnicianId(item, raw);
  const name = resolveTechnicianName(item, raw);
  const email = resolveTechnicianEmail(item, raw);
  const avatar = resolveTechnicianAvatar(item, raw);
  const initials = getInitials(name);

  return {
    ...removeRawKey(technician),
    ...removeRawKey(assignedTo),
    ...removeRawKey(tecnico),
    id: userId || technician.id || assignedTo.id || tecnico.id || "",
    userId: userId || technician.userId || assignedTo.userId || tecnico.userId || "",
    name,
    nombre: name,
    displayName: name,
    fullName: name,
    email: email || technician.email || assignedTo.email || tecnico.email || "",
    emailLower: email || technician.emailLower || assignedTo.emailLower || tecnico.emailLower || "",
    avatar: avatar || null,
    avatarUrl: avatar || null,
    photoUrl: avatar || null,
    pictureUrl: avatar || null,
    imageUrl: avatar || null,
    hasAvatar: Boolean(avatar),
    initials,
    iniciales: initials,
    assignmentPolicy: safeText(first(item.assignmentPolicy, raw.assignmentPolicy, assignment.policy, assignment.assignmentPolicy), ""),
    raw: { assignment: removeRawKey(assignment), assignedTo: removeRawKey(assignedTo), tecnico: removeRawKey(tecnico), technician: removeRawKey(technician) },
  };
}

function buildAssignmentObject(item = {}, raw = {}, technician = {}) {
  const assignment = safeObject(first(item.assignment, raw.assignment));
  const avatar = safeImageSrc(first(technician.avatarUrl, technician.avatar, ""));

  return {
    ...removeRawKey(assignment),
    status: safeText(first(assignment.status, "assigned"), "assigned"),
    policy: safeText(first(assignment.policy, assignment.assignmentPolicy, technician.assignmentPolicy), ""),
    assignedToUserId: safeText(first(assignment.assignedToUserId, technician.userId, technician.id), ""),
    userId: safeText(first(assignment.userId, technician.userId, technician.id), ""),
    id: safeText(first(assignment.id, technician.userId, technician.id), ""),
    assignedToName: safeText(first(assignment.assignedToName, technician.name), technician.name || ""),
    technicianName: safeText(first(assignment.technicianName, technician.name), technician.name || ""),
    tecnicoName: safeText(first(assignment.tecnicoName, technician.name), technician.name || ""),
    displayName: safeText(first(assignment.displayName, technician.displayName, technician.name), technician.name || ""),
    name: safeText(first(assignment.name, technician.name), technician.name || ""),
    assignedToEmail: safeLower(first(assignment.assignedToEmail, technician.email), ""),
    technicianEmail: safeLower(first(assignment.technicianEmail, technician.email), ""),
    email: safeLower(first(assignment.email, technician.email), ""),
    avatar: avatar || null,
    avatarUrl: avatar || null,
    assignedToAvatar: avatar || null,
    assignedToAvatarUrl: avatar || null,
    technicianAvatar: avatar || null,
    technicianAvatarUrl: avatar || null,
    agentAvatar: avatar || null,
    agentAvatarUrl: avatar || null,
    assignedToHasAvatar: Boolean(avatar),
    technicianHasAvatar: Boolean(avatar),
    technician: { ...safeObject(assignment.technician), ...technician },
    assignedTo: { ...safeObject(assignment.assignedTo), ...technician },
  };
}

/* =========================================================
   PAYLOAD UNWRAP
========================================================= */

function looksLikeTicket(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.ticketId ||
      obj.id ||
      obj._id ||
      obj.code ||
      obj.ticketCode ||
      obj.incidenciaId ||
      obj.subject ||
      obj.asunto ||
      obj.title ||
      obj.message ||
      obj.descripcion ||
      obj.description
  );
}

function unwrapDetailPayload(payload = {}) {
  if (!payload) return {};
  if (Array.isArray(payload)) return safeObject(payload[0]);

  const source = safeObject(payload);
  if (!Object.keys(source).length) return {};

  const candidates = [source.ticket, source.detail, source.item, source.incidencia, source.result, source.payload, source.data, source];

  for (const candidate of candidates) {
    if (isObject(candidate) && looksLikeTicket(candidate)) return candidate;
  }

  if (isObject(source.data)) return unwrapDetailPayload(source.data);
  if (isObject(source.payload)) return unwrapDetailPayload(source.payload);

  return source;
}

/* =========================================================
   MODEL NORMALIZER
========================================================= */

export function normalizeIncidenciaModel(payload = {}) {
  const source = safeObject(payload);
  const item = safeObject(unwrapDetailPayload(source));
  const raw = safeObject(item.raw);

  const clienteObject = safeObject(first(item.cliente, item.client, item.customer, raw.cliente, raw.client, raw.customer));
  const createdByObject = safeObject(first(item.createdBy, raw.createdBy));
  const receptorObject = safeObject(first(item.receptor, raw.receptor));
  const requesterSnapshot = safeObject(first(item.requesterSnapshot, raw.requesterSnapshot));

  const ticketId = safeText(first(item.ticketId, item.incidenciaId, item.id, item._id, item.code, item.ticketCode, raw.ticketId, raw.incidenciaId, raw.id, raw._id, raw.code, raw.ticketCode), "");
  const id = safeText(first(item.id, item.ticketId, item.incidenciaId, item._id, raw.id, raw.ticketId, raw.incidenciaId, raw._id, ticketId), ticketId);
  const ticketCode = safeText(first(item.ticketCode, item.code, raw.ticketCode, raw.code, ticketId, id), ticketId || id);

  const title = safeText(first(item.title, item.subject, item.asunto, item.name, raw.title, raw.subject, raw.asunto, raw.name), "Incidencia");
  const message = safeText(first(item.message, item.descripcion, item.description, item.body, item.preview, raw.message, raw.descripcion, raw.description, raw.body, raw.preview), "");
  const description = safeText(first(item.description, item.descripcion, item.message, item.preview, item.body, raw.description, raw.descripcion, raw.message, raw.preview, raw.body), "Sin descripción.");

  const clientName = safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.requesterName,
      requesterSnapshot.name,
      requesterSnapshot.displayName,
      clienteObject.nombreContacto,
      clienteObject.nombre,
      clienteObject.name,
      clienteObject.company,
      clienteObject.empresa,
      clienteObject.displayName,
      receptorObject.name,
      receptorObject.nombre,
      createdByObject.name,
      createdByObject.nombre,
      raw.clientName,
      raw.clienteNombre,
      raw.requesterName,
      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.displayName,
      item.name,
      raw.name
    ),
    "Cliente"
  );

  const clientEmail = safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.emailCliente,
      requesterSnapshot.email,
      clienteObject.email,
      clienteObject.emailLower,
      receptorObject.email,
      createdByObject.email,
      raw.clientEmail,
      raw.clienteEmail,
      raw.emailCliente,
      raw.requesterSnapshot?.email,
      item.email,
      raw.email
    ),
    "Sin email"
  );

  const clientAvatar = safeImageSrc(first(item.clientAvatar, item.avatar, item.avatarUrl, requesterSnapshot.avatar, requesterSnapshot.avatarUrl, clienteObject.avatar, clienteObject.avatarUrl, receptorObject.avatar, receptorObject.avatarUrl, raw.clientAvatar, raw.avatar, raw.avatarUrl, raw.requesterSnapshot?.avatar, raw.requesterSnapshot?.avatarUrl));

  const technician = buildTechnicianObject(item, raw);
  const assignedToName = technician.name || "No asignado";
  const assignedToEmail = technician.email || "";
  const assignedToUserId = technician.userId || technician.id || "";
  const assignedToAvatar = safeImageSrc(first(technician.avatarUrl, technician.avatar, ""));
  const assignment = buildAssignmentObject(item, raw, technician);

  const status = normalizeStatus(first(item.status, item.estado, item.state, item.lifecycle?.status, raw.status, raw.estado, raw.state, raw.lifecycle?.status));
  const priority = normalizePriority(first(item.priority, item.prioridad, item.severity, item.urgency, item.sla?.priority, raw.priority, raw.prioridad, raw.severity, raw.urgency, raw.sla?.priority));
  const category = safeLower(first(item.category, item.categoria, item.tipo, item.type, item.subcategory, item.subcategoria, raw.category, raw.categoria, raw.tipo, raw.type, raw.subcategory, raw.subcategoria), "general");
  const sourceLabel = safeText(first(item.source, item.origen, item.channel, raw.source, raw.origen, raw.channel), "panel");

  const createdAt = first(item.createdAt, item.fechaCreacion, item.created_at, item.lifecycle?.createdAt, raw.createdAt, raw.fechaCreacion, raw.created_at, raw.lifecycle?.createdAt, null);
  const createdAtES = first(item.createdAtES, raw.createdAtES, null);
  const updatedAt = first(item.lastActivityAt, item.updatedAt, item.fechaActualizacion, item.updated_at, item.modifiedAt, item.lastUpdate, item.ultimaNovedad, item.closedAt, raw.lastActivityAt, raw.updatedAt, raw.fechaActualizacion, raw.updated_at, raw.modifiedAt, raw.lastUpdate, raw.ultimaNovedad, raw.closedAt, createdAt, null);
  const updatedAtES = first(item.lastActivityAtES, item.updatedAtES, raw.lastActivityAtES, raw.updatedAtES, null);
  const closedAt = first(item.closedAt, item.closed_at, raw.closedAt, raw.closed_at, null);
  const closedAtES = first(item.closedAtES, raw.closedAtES, null);

  const attachments = normalizeAttachments(first(item.attachments, item.files, item.adjuntos, raw.attachments, raw.files, raw.adjuntos));
  const history = normalizeHistory(first(item.history, item.timeline, item.logs, raw.history, raw.timeline, raw.logs));
  const comments = normalizeComments(first(item.comments, item.notes, item.messages, raw.comments, raw.notes, raw.messages));

  const tagsRaw = first(item.tags, item.labels, raw.tags, raw.labels);
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((value) => safeText(value, "")).filter(Boolean)
    : typeof tagsRaw === "string"
      ? tagsRaw.split(/[,\s|;]+/g).map((value) => safeText(value, "")).filter(Boolean)
      : [];

  const initials = getInitials(clientName);
  const avatarTheme = getAvatarTheme(ticketId || clientName || clientEmail);

  const assignedLower = safeLower(assignedToName);
  const isAssigned = Boolean(assignedLower && assignedLower !== "no asignado" && assignedLower !== "sin asignar");

  const isOpen = status === STATUS.OPEN;
  const isPending = status === STATUS.PENDING;
  const isInProgress = status === STATUS.IN_PROGRESS;
  const isResolved = status === STATUS.RESOLVED;
  const isClosed = status === STATUS.CLOSED;
  const isUrgent = priority === PRIORITY.URGENT;
  const isHigh = priority === PRIORITY.HIGH;

  const createdAtTs = toTimestamp(createdAt);
  const updatedAtTs = toTimestamp(updatedAt) || readTimestampFromItem(item) || createdAtTs;
  const closedAtTs = toTimestamp(closedAt);

  const timeline = dedupeTimeline([...history, ...comments]).sort((a, b) => {
    return safeNumber(b.createdAtTs, toTimestamp(b.createdAt)) - safeNumber(a.createdAtTs, toTimestamp(a.createdAt));
  });

  const userId = safeText(
    first(
      item.userId,
      item.usuarioId,
      item.ownerUserId,
      item.createdByUserId,
      item.receptorUserId,
      receptorObject.userId,
      receptorObject.id,
      createdByObject.userId,
      createdByObject.id,
      clienteObject.userId,
      requesterSnapshot.userId,
      raw.userId,
      raw.usuarioId,
      raw.ownerUserId,
      raw.createdByUserId,
      raw.receptorUserId,
      raw.requesterSnapshot?.userId
    ),
    ""
  );

  const clienteId = safeText(
    first(
      item.clienteId,
      receptorObject.clienteId,
      clienteObject.clienteId,
      clienteObject.id,
      requesterSnapshot.clienteId,
      raw.clienteId,
      raw.receptor?.clienteId,
      raw.cliente?.clienteId,
      raw.cliente?.id,
      raw.requesterSnapshot?.clienteId
    ),
    ""
  );

  const invoicePatch = buildInvoicePatch(item, raw);

  const meta = {
    ...safeObject(raw.meta),
    ...safeObject(item.meta),
    ...safeObject(invoicePatch.meta),
    timestampMs: updatedAtTs || createdAtTs || readTimestampFromItem(item),
    updatedAtMs: updatedAtTs || createdAtTs || readTimestampFromItem(item),
    isClosed,
    isActive: !isClosed,
    isAssigned,
    technicianUserId: first(item.meta?.technicianUserId, raw.meta?.technicianUserId, assignedToUserId, ""),
    technicianName: first(item.meta?.technicianName, raw.meta?.technicianName, assignedToName, ""),
    technicianEmail: first(item.meta?.technicianEmail, raw.meta?.technicianEmail, assignedToEmail, ""),
    technicianAvatar: first(item.meta?.technicianAvatar, raw.meta?.technicianAvatar, assignedToAvatar, null),
    technicianAvatarUrl: first(item.meta?.technicianAvatarUrl, raw.meta?.technicianAvatarUrl, assignedToAvatar, null),
    technicianHasAvatar: Boolean(first(item.meta?.technicianAvatar, raw.meta?.technicianAvatar, assignedToAvatar, "")),
    hasAttachments: attachments.length > 0,
    hasComments: comments.length > 0,
    hasHistory: history.length > 0,
    attachmentsCount: attachments.length,
    commentsCount: comments.length,
    historyCount: history.length,
  };

  const cliente = {
    ...removeRawKey(clienteObject),
    id: safeText(first(clienteObject.id, clienteObject.clienteId, clienteId), clienteId),
    userId: safeText(first(clienteObject.userId, userId), userId),
    clienteId: safeText(first(clienteObject.clienteId, clienteObject.id, clienteId), clienteId),
    nombre: safeText(first(clienteObject.nombre, clienteObject.name, clientName), clientName),
    name: safeText(first(clienteObject.name, clienteObject.nombre, clientName), clientName),
    email: safeText(first(clienteObject.email, clientEmail), clientEmail),
    avatar: safeImageSrc(first(clienteObject.avatar, clienteObject.avatarUrl, clientAvatar)),
    avatarUrl: safeImageSrc(first(clienteObject.avatarUrl, clienteObject.avatar, clientAvatar)),
    raw: removeRawKey(clienteObject),
  };

  const normalized = {
    ...removeRawKey(item),
    id,
    ticketId,
    incidenciaId: safeText(first(item.incidenciaId, raw.incidenciaId, ticketId), ticketId),
    code: safeText(first(item.code, item.ticketCode, raw.code, raw.ticketCode, ticketCode), ticketCode),
    ticketCode,
    tipoDocumento: safeText(first(item.tipoDocumento, raw.tipoDocumento), "ticket"),
    title,
    subject: safeText(first(item.subject, item.asunto, raw.subject, raw.asunto, title), title),
    asunto: safeText(first(item.asunto, item.subject, raw.asunto, raw.subject, title), title),
    description,
    descripcion: safeText(first(item.descripcion, item.message, item.description, raw.descripcion, raw.message, raw.description, description), description),
    message,
    preview: safeText(first(item.preview, raw.preview, message, description), description),
    clientName,
    clienteNombre: safeText(first(item.clienteNombre, raw.clienteNombre, clientName), clientName),
    clientEmail,
    clienteEmail: safeText(first(item.clienteEmail, raw.clienteEmail, clientEmail), clientEmail),
    clientAvatar,
    avatar: safeImageSrc(first(item.avatar, raw.avatar, clientAvatar)),
    avatarUrl: safeImageSrc(first(item.avatarUrl, raw.avatarUrl, clientAvatar)),
    assignedToUserId,
    assignedToName,
    assignedToEmail,
    assignedToAvatar,
    assignedToAvatarUrl: assignedToAvatar,
    technician,
    technicianName: assignedToName,
    technicianAvatar: assignedToAvatar,
    technicianAvatarUrl: assignedToAvatar,
    tecnico: {
      ...technician,
      raw: removeRawKey(first(item.tecnico, raw.tecnico, technician.raw?.tecnico, {})),
    },
    assignedTo: {
      ...technician,
      raw: removeRawKey(first(item.assignedTo, raw.assignedTo, technician.raw?.assignedTo, {})),
    },
    assignment,
    cliente,
    client: cliente,
    customer: cliente,
    createdBy: {
      ...removeRawKey(createdByObject),
      userId: safeText(first(createdByObject.userId, createdByObject.id, item.createdByUserId, raw.createdByUserId, userId), ""),
      id: safeText(first(createdByObject.id, createdByObject.userId, item.createdByUserId, raw.createdByUserId, userId), ""),
      name: safeText(first(createdByObject.name, createdByObject.nombre), ""),
      nombre: safeText(first(createdByObject.nombre, createdByObject.name), ""),
      email: safeText(first(createdByObject.email), ""),
      raw: removeRawKey(createdByObject),
    },
    receptor: {
      ...removeRawKey(receptorObject),
      userId: safeText(first(receptorObject.userId, receptorObject.id, userId), userId),
      id: safeText(first(receptorObject.id, receptorObject.userId, userId), userId),
      clienteId: safeText(first(receptorObject.clienteId, clienteId), clienteId),
      name: safeText(first(receptorObject.name, receptorObject.nombre, clientName), clientName),
      nombre: safeText(first(receptorObject.nombre, receptorObject.name, clientName), clientName),
      email: safeText(first(receptorObject.email, clientEmail), clientEmail),
      avatar: safeImageSrc(first(receptorObject.avatar, receptorObject.avatarUrl, clientAvatar)),
      avatarUrl: safeImageSrc(first(receptorObject.avatarUrl, receptorObject.avatar, clientAvatar)),
      raw: removeRawKey(receptorObject),
    },
    requester: first(item.requester, item.user, item.usuario, raw.requester, raw.user, raw.usuario, receptorObject, clienteObject, createdByObject, null),
    requesterSnapshot: {
      ...removeRawKey(requesterSnapshot),
      name: safeText(first(requesterSnapshot.name, requesterSnapshot.displayName, clientName), clientName),
      displayName: safeText(first(requesterSnapshot.displayName, requesterSnapshot.name, clientName), clientName),
      email: safeText(first(requesterSnapshot.email, clientEmail), clientEmail),
      avatar: safeImageSrc(first(requesterSnapshot.avatar, clientAvatar)),
      avatarUrl: safeImageSrc(first(requesterSnapshot.avatarUrl, clientAvatar)),
      userId: safeText(first(requesterSnapshot.userId, userId), userId),
      clienteId: safeText(first(requesterSnapshot.clienteId, clienteId), clienteId),
    },
    status,
    estado: status,
    statusLabel: getStatusLabel(status),
    priority,
    prioridad: priority,
    priorityLabel: getPriorityLabel(priority),
    category,
    categoria: category,
    tipo: safeText(first(item.tipo, item.categoria, item.category, raw.tipo, raw.categoria, raw.category, category), category),
    source: sourceLabel,
    origen: safeText(first(item.origen, raw.origen, sourceLabel), sourceLabel),
    createdAt,
    createdAtES,
    updatedAt,
    updatedAtES,
    lastActivityAt: first(item.lastActivityAt, raw.lastActivityAt, updatedAt, null),
    lastActivityAtES: first(item.lastActivityAtES, raw.lastActivityAtES, updatedAtES, null),
    closedAt,
    closedAtES,
    createdAtTs,
    updatedAtTs,
    closedAtTs,
    fechaProgramada: first(item.fechaProgramada, raw.fechaProgramada, null),
    initials,
    avatarTheme,
    attachments,
    files: attachments,
    adjuntos: attachments,
    attachmentsCount: Math.max(safeNumber(first(item.attachmentsCount, raw.attachmentsCount), 0), safeNumber(first(item.filesCount, raw.filesCount), 0), attachments.length),
    filesCount: Math.max(safeNumber(first(item.filesCount, raw.filesCount), 0), attachments.length),
    history,
    historyCount: Math.max(safeNumber(first(item.historyCount, raw.historyCount), 0), history.length),
    comments,
    commentsCount: Math.max(safeNumber(first(item.commentsCount, raw.commentsCount), 0), comments.length),
    timeline,
    timelineCount: timeline.length,
    tags,
    ...invoicePatch,
    isAssigned,
    isOpen,
    isPending,
    isInProgress,
    isResolved,
    isClosed,
    isUrgent,
    isHigh,
    hasAttachments: attachments.length > 0,
    hasComments: comments.length > 0,
    hasHistory: history.length > 0,
    hasLinkedInvoices: Boolean(invoicePatch.hasInvoiceEvidence),
    hasInvoice: Boolean(invoicePatch.hasInvoiceEvidence),
    hasFactura: Boolean(invoicePatch.hasInvoiceEvidence),
    email: safeText(first(item.email, raw.email, clientEmail), clientEmail),
    name: safeText(first(item.name, raw.name, clientName), clientName),
    userId,
    clienteId,
    ip: safeText(first(item.ip, raw.ip), ""),
    meta,
    _ts: Number.isFinite(Number(item._ts))
      ? Number(item._ts)
      : Number.isFinite(Number(raw._ts))
        ? Number(raw._ts)
        : null,
  };

  normalized.searchText = getIncidenciaSearchText(normalized);

  normalized.raw = buildRawSnapshot(item, raw, {
    meta,
    tecnico: technician,
    assignedTo: technician,
    technician,
    assignment,
    attachments,
    files: attachments,
    adjuntos: attachments,
    comments,
    history,
    timeline,
    linkedInvoices: invoicePatch.linkedInvoices,
    billing: invoicePatch.billing,
  });

  return normalized;
}

/* =========================================================
   COLLECTION NORMALIZER
========================================================= */

export function unwrapIncidenciasPayload(payload = null) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const obj = safeObject(payload);

  if (Array.isArray(obj.tickets)) return obj.tickets;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.incidencias)) return obj.incidencias;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.list)) return obj.list;

  if (Array.isArray(obj?.payload?.tickets)) return obj.payload.tickets;
  if (Array.isArray(obj?.payload?.items)) return obj.payload.items;
  if (Array.isArray(obj?.payload?.data)) return obj.payload.data;
  if (Array.isArray(obj?.payload?.incidencias)) return obj.payload.incidencias;
  if (Array.isArray(obj?.data?.tickets)) return obj.data.tickets;
  if (Array.isArray(obj?.data?.items)) return obj.data.items;
  if (Array.isArray(obj?.data?.data)) return obj.data.data;
  if (Array.isArray(obj?.data?.incidencias)) return obj.data.incidencias;

  if (isObject(obj.data)) return unwrapIncidenciasPayload(obj.data);
  if (isObject(obj.payload)) return unwrapIncidenciasPayload(obj.payload);

  return [];
}

export function getIncidenciaIdentity(item = {}) {
  const source = safeObject(item);
  const raw = safeObject(source.raw);

  return safeText(first(source.ticketId, source.incidenciaId, source.id, source._id, source.ticketCode, source.code, raw.ticketId, raw.incidenciaId, raw.id, raw._id, raw.ticketCode, raw.code), "");
}

export function dedupeIncidenciasById(items = []) {
  const byId = new Map();
  const anonymous = [];

  for (const item of safeArray(items)) {
    const id = normalizeText(getIncidenciaIdentity(item));

    if (!id) {
      anonymous.push(item);
      continue;
    }

    const previous = byId.get(id);

    if (!previous) {
      byId.set(id, item);
      continue;
    }

    const previousTs = readTimestampFromItem(previous);
    const currentTs = readTimestampFromItem(item);
    byId.set(id, currentTs >= previousTs ? item : previous);
  }

  return [...byId.values(), ...anonymous];
}

export function normalizeIncidenciasCollection(payload = [], options = {}) {
  const opts = safeObject(options);
  const normalized = unwrapIncidenciasPayload(payload)
    .map(normalizeIncidenciaModel)
    .filter((item) => Boolean(item?.ticketId || item?.id));
  const deduped = opts.dedupe ? dedupeIncidenciasById(normalized) : normalized;
  return opts.sort ? sortIncidenciasByUpdatedDesc(deduped) : deduped;
}

/* =========================================================
   SEARCH / FILTER
========================================================= */

export function getIncidenciaSearchText(item = {}) {
  const source = safeObject(item);
  const raw = safeObject(source.raw);

  return normalizeText(
    [
      source.searchText,
      raw.search?.text,
      source.ticketId,
      source.id,
      source._id,
      source.code,
      source.ticketCode,
      source.incidenciaId,
      source.subject,
      source.title,
      source.asunto,
      source.description,
      source.descripcion,
      source.message,
      source.preview,
      source.clientName,
      source.clienteNombre,
      source.requesterName,
      source.name,
      source.email,
      source.clientEmail,
      source.clienteEmail,
      source.requesterSnapshot?.name,
      source.requesterSnapshot?.email,
      source.cliente?.nombre,
      source.cliente?.name,
      source.cliente?.email,
      source.client?.name,
      source.client?.email,
      source.assignedTo?.name,
      source.assignedTo?.email,
      source.assignment?.assignedToName,
      source.assignment?.assignedToEmail,
      source.tecnico?.name,
      source.tecnico?.email,
      source.technician?.name,
      source.technician?.email,
      source.category,
      source.categoria,
      source.subcategory,
      source.subcategoria,
      source.type,
      source.tipo,
      source.tags,
      source.status,
      source.estado,
      source.statusLabel,
      source.priority,
      source.prioridad,
      source.priorityLabel,
      source.numeroFacturaLegal,
      source.numeroFactura,
      source.invoiceNumber,
      source.facturaId,
      source.invoiceId,
      source.linkedInvoices?.numeroFacturaLegal,
      source.linkedInvoices?.invoiceNumber,
    ]
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => safeText(value, ""))
      .filter(Boolean)
      .join(" ")
  );
}

export function incidenciaMatchesFilter(item = {}, filter = FILTER.ALL) {
  const currentFilter = normalizeFilter(filter);

  if (currentFilter === FILTER.ALL) return true;

  const status = normalizeStatus(first(item?.status, item?.estado, item?.state, item?.raw?.status, item?.raw?.estado));

  if (currentFilter === FILTER.OPEN) return OPEN_STATUS_KEYS.has(status);
  if (currentFilter === FILTER.CLOSED) return CLOSED_STATUS_KEYS.has(status);

  return true;
}

export function incidenciaMatchesSearch(item = {}, query = "") {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) return true;

  const terms = normalizedQuery.split(" ").map((term) => term.trim()).filter(Boolean);
  if (!terms.length) return true;

  const haystack = normalizeText(item?.searchText || getIncidenciaSearchText(item));
  return terms.every((term) => haystack.includes(term));
}

export function filterIncidencias(items = [], options = {}) {
  const opts = safeObject(options);
  const filter = normalizeFilter(first(opts.filter, opts.statusFilter, opts.activeFilter, FILTER.ALL));
  const query = safeText(first(opts.query, opts.searchQuery, opts.search, opts.q, ""), "");

  return safeArray(items).filter((item) => incidenciaMatchesFilter(item, filter) && incidenciaMatchesSearch(item, query));
}

/* =========================================================
   SORT
========================================================= */

export function sortIncidenciasByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const left = safeNumber(readTimestampFromItem(a), safeNumber(a?.updatedAtTs, 0));
    const right = safeNumber(readTimestampFromItem(b), safeNumber(b?.updatedAtTs, 0));

    if (right !== left) return right - left;

    return safeText(b?.ticketId || b?.id, "").localeCompare(safeText(a?.ticketId || a?.id, ""), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function sortIncidenciasByPriorityDesc(items = []) {
  const weight = { urgent: 4, high: 3, medium: 2, low: 1 };

  return [...safeArray(items)].sort((a, b) => {
    const priorityDiff = safeNumber(weight[b?.priority], 0) - safeNumber(weight[a?.priority], 0);
    if (priorityDiff !== 0) return priorityDiff;
    return safeNumber(readTimestampFromItem(b), safeNumber(b?.updatedAtTs, 0)) - safeNumber(readTimestampFromItem(a), safeNumber(a?.updatedAtTs, 0));
  });
}

export function sortIncidenciasDefault(items = []) {
  return sortIncidenciasByUpdatedDesc(items);
}

/* =========================================================
   INCREMENTAL WINDOW / LEGACY PAGINATION COMPAT
========================================================= */

export function paginateIncidencias(items = [], page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const list = safeArray(items);
  const size = clampNumber(pageSize, 1, MAX_VISIBLE_COUNT);
  const pageMultiplier = clampNumber(page, 1, MAX_VISIBLE_COUNT);
  const total = list.length;
  const visibleLimit = Math.min(total, pageMultiplier * size);
  const pageItems = list.slice(0, visibleLimit);
  const remainingCount = Math.max(0, total - pageItems.length);

  return {
    mode: "infinite",
    infiniteScroll: true,
    paginationDisabled: true,
    page: 1,
    currentPage: 1,
    incidenciasPage: 1,
    pageSize: size,
    incidenciasPageSize: size,
    limit: size,
    total,
    totalCount: total,
    filteredTotal: total,
    filteredCount: total,
    totalPages: 1,
    pages: 1,
    items: pageItems,
    pageItems,
    rows: pageItems,
    visibleItems: pageItems,
    from: total === 0 ? 0 : 1,
    to: pageItems.length,
    rangeStart: total === 0 ? 0 : 1,
    rangeEnd: pageItems.length,
    hasPrev: false,
    hasNext: false,
    hasMore: remainingCount > 0,
    canLoadMore: remainingCount > 0,
    remainingCount,
    visibleCount: pageItems.length,
    visibleItemsCount: pageItems.length,
    loadedCount: pageItems.length,
  };
}

/* =========================================================
   STATS
========================================================= */

function getInvoiceAmountForStats(item = {}) {
  return roundMoney(
    first(
      item?.facturasTotal,
      item?.invoicesTotal,
      item?.importeFacturas,
      item?.invoiceTotal,
      item?.facturaTotal,
      item?.facturaImporte,
      item?.importeFactura,
      item?.totalFactura,
      item?.invoiceAmount,
      item?.linkedInvoices?.total,
      item?.linkedInvoices?.amount,
      item?.linkedInvoices?.importe,
      item?.meta?.invoiceTotal,
      item?.meta?.invoicesTotal,
      item?.total,
      item?.amount,
      item?.importe,
      0
    ),
    0
  );
}

function hasInvoicesForStats(item = {}) {
  return Boolean(
    item?.hasLinkedInvoices ||
      item?.hasInvoice ||
      item?.hasFactura ||
      item?.meta?.hasLinkedInvoices ||
      item?.meta?.hasInvoice ||
      item?.meta?.hasFactura ||
      safeNumber(item?.facturasCount, 0) > 0 ||
      safeNumber(item?.invoicesCount, 0) > 0 ||
      safeArray(item?.facturas).length > 0 ||
      safeArray(item?.invoices).length > 0 ||
      safeArray(item?.facturasRelacionadas).length > 0 ||
      safeText(item?.numeroFacturaLegal, "") ||
      safeText(item?.facturaId, "") ||
      safeText(item?.invoiceId, "")
  );
}

function hasAttachmentsForStats(item = {}) {
  return safeArray(item?.attachments).length > 0 || safeArray(item?.files).length > 0 || safeArray(item?.adjuntos).length > 0 || safeNumber(item?.attachmentsCount, 0) > 0 || safeNumber(item?.filesCount, 0) > 0;
}

function isAssignedForStats(item = {}) {
  const assignedValue = safeLower(first(item?.assignedToName, item?.technicianName, item?.tecnico?.name, item?.tecnico?.nombre, item?.technician?.name, item?.assignedTo?.name, typeof item?.assignedTo === "string" ? item.assignedTo : "", ""));
  return Boolean(assignedValue && assignedValue !== "no asignado" && assignedValue !== "sin asignar");
}

export function computeIncidenciasStats(items = []) {
  const stats = {
    total: 0,
    active: 0,
    open: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0,
    urgent: 0,
    high: 0,
    assigned: 0,
    unassigned: 0,
    withAttachments: 0,
    withInvoices: 0,
    totalImporte: 0,
    invoiceTotal: 0,
    invoicesTotal: 0,
  };

  for (const item of safeArray(items)) {
    stats.total += 1;

    const status = normalizeStatus(item?.status || item?.estado);
    const priority = normalizePriority(item?.priority || item?.prioridad);

    if (status === STATUS.OPEN) stats.open += 1;
    if (status === STATUS.PENDING) stats.pending += 1;
    if (status === STATUS.IN_PROGRESS) stats.inProgress += 1;
    if (status === STATUS.RESOLVED) stats.resolved += 1;
    if (status === STATUS.CLOSED) stats.closed += 1;
    if (priority === PRIORITY.URGENT) stats.urgent += 1;
    if (priority === PRIORITY.HIGH) stats.high += 1;
    if (isAssignedForStats(item)) stats.assigned += 1;
    if (hasAttachmentsForStats(item)) stats.withAttachments += 1;
    if (hasInvoicesForStats(item)) stats.withInvoices += 1;

    stats.totalImporte += safeNumber(getInvoiceAmountForStats(item), 0);
  }

  stats.active = Math.max(stats.total - stats.closed, 0);
  stats.unassigned = Math.max(stats.total - stats.assigned, 0);
  stats.totalImporte = roundMoney(stats.totalImporte, 0);
  stats.invoiceTotal = stats.totalImporte;
  stats.invoicesTotal = stats.totalImporte;

  return stats;
}

/* =========================================================
   FINDERS
========================================================= */

export function findIncidenciaById(items = [], ticketId = "") {
  const id = safeText(ticketId, "");
  if (!id) return null;

  const normalizedId = normalizeText(id);

  return safeArray(items).find((item) => {
    const candidates = uniqueStrings([
      item?.ticketId,
      item?.incidenciaId,
      item?.id,
      item?._id,
      item?.ticketCode,
      item?.code,
      item?.raw?.ticketId,
      item?.raw?.incidenciaId,
      item?.raw?.id,
      item?.raw?._id,
      item?.raw?.ticketCode,
      item?.raw?.code,
    ]);

    return candidates.some((candidate) => normalizeText(candidate) === normalizedId);
  }) || null;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  INCIDENCIAS_MODEL_VERSION,
  DEFAULT_PAGE_SIZE,
  DEFAULT_VISIBLE_COUNT,
  DEFAULT_LOAD_MORE_BATCH,
  MAX_VISIBLE_COUNT,
  DEFAULT_CURRENCY,
  STATUS,
  PRIORITY,
  FILTER,
  normalizeIncidenciaModel,
  normalizeIncidenciasCollection,
  unwrapIncidenciasPayload,
  dedupeIncidenciasById,
  getIncidenciaIdentity,
  sortIncidenciasByUpdatedDesc,
  sortIncidenciasByPriorityDesc,
  sortIncidenciasDefault,
  paginateIncidencias,
  computeIncidenciasStats,
  findIncidenciaById,
  normalizeText,
  normalizeKey,
  normalizeFilter,
  getIncidenciaSearchText,
  incidenciaMatchesFilter,
  incidenciaMatchesSearch,
  filterIncidencias,
  getStatusLabel,
  getPriorityLabel,
  normalizeStatus,
  normalizePriority,
  isOpenStatus,
  isClosedStatus,
  toDate,
  toTimestamp,
  getInitials,
  getAvatarTheme,
};
