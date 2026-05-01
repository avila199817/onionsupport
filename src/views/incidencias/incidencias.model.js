/* =========================================================
   Onion SPA - Incidencias Model
   Archivo: src/views/incidencias/incidencias.model.js

   EXTREME PRO SYSTEM · MODEL LAYER · 12/10
   PATCH · BACKEND CONTRACT PRESERVER
   PATCH · FACTURAS / BILLING / LINKED INVOICES HARDENED
   PATCH · TABLE + MODAL SAFE NORMALIZATION
   PATCH · NO DATA LOSS NORMALIZER

   RESPONSABILIDADES:
   - normalizar payloads heterogéneos backend/store/API
   - exponer modelo consistente Ticket/Incidencia
   - preservar aliases ricos del backend
   - preservar facturas vinculadas para tabla/modal
   - preservar numeroFacturaLegal / facturaTotal / linkedInvoices / billing
   - preservar adjuntos con viewUrl/downloadUrl/signedUrl/blobUrl
   - preservar cliente/técnico/receptor/createdBy
   - labels estado / prioridad
   - flags computados
   - avatars / initials
   - fechas base + timestamps robustos
   - historial limpio sin updates fantasma
   - collections helpers
   - sorting helpers
   - pagination helpers
   - stats helpers
   - defensive parsing enterprise ready

   CONTRATO BACKEND SOPORTADO:
   - listado: tickets/items/data/incidencias/results/rows
   - detalle: ticket/item/detail/incidencia/result/payload/data
   - facturas:
       facturaId / invoiceId / numeroFacturaLegal
       facturaTotal / facturaImporte / importeFactura / totalFactura / invoiceAmount
       facturasTotal / invoicesTotal / importeFacturas / invoiceTotal
       total / amount / importe / price
       linkedInvoices / factura / invoice / billing
       facturas / invoices / facturasRelacionadas
       meta.hasLinkedInvoices / meta.invoiceTotal / meta.invoicesTotal
   - adjuntos:
       attachments / files / adjuntos
       viewUrl / downloadUrl / signedUrl / blobUrl / publicUrl
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 5;
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

/* =========================================================
   SAFE CORE
========================================================= */

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

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/€/g, "")
      .replace(/%/g, "")
      .replace(/\s/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
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

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
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

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const key = normalizeText(value);

  if (["true", "1", "yes", "si", "sí", "on"].includes(key)) return true;
  if (["false", "0", "no", "off"].includes(key)) return false;

  return fallback;
}

function clampNumber(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = safeNumber(value, min);
  return Math.min(Math.max(n, min), max);
}

/* =========================================================
   IDS / HASH
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

/* =========================================================
   LABEL MAPS
========================================================= */

export function normalizeStatus(value = "") {
  const key = normalizeKey(value || "open");

  switch (key) {
    case "open":
    case "opened":
    case "abierta":
    case "abierto":
      return STATUS.OPEN;

    case "new":
    case "nuevo":
    case "nueva":
    case "created":
    case "pending":
    case "pendiente":
      return STATUS.PENDING;

    case "progress":
    case "in_progress":
    case "inprogress":
    case "in_progress_":
    case "en_proceso":
    case "en_curso":
    case "proceso":
    case "working":
    case "trabajando":
    case "assigned":
    case "asignada":
    case "asignado":
      return STATUS.IN_PROGRESS;

    case "resolved":
    case "resuelta":
    case "resuelto":
    case "solved":
      return STATUS.RESOLVED;

    case "closed":
    case "cerrada":
    case "cerrado":
    case "cancelled":
    case "cancelada":
    case "cancelado":
    case "archived":
    case "archivada":
    case "archivado":
      return STATUS.CLOSED;

    default:
      return STATUS.OPEN;
  }
}

export function normalizePriority(value = "") {
  const key = normalizeKey(value || "medium");

  switch (key) {
    case "low":
    case "baja":
    case "minor":
    case "p3":
      return PRIORITY.LOW;

    case "medium":
    case "media":
    case "normal":
    case "p2":
      return PRIORITY.MEDIUM;

    case "high":
    case "alta":
    case "p1":
      return PRIORITY.HIGH;

    case "urgent":
    case "urgente":
    case "critical":
    case "critica":
    case "crítica":
    case "critico":
    case "crítico":
    case "p0":
      return PRIORITY.URGENT;

    default:
      return PRIORITY.MEDIUM;
  }
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

export function toDate(value = null) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 9999999999 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = safeText(value, "");

  if (!raw) return null;

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
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
    safeNumber(raw.meta?.updatedAtMs, 0) ||
    safeNumber(raw.meta?.timestampMs, 0) ||
    toTimestamp(
      first(
        source.lastActivityAt,
        source.updatedAt,
        source.modifiedAt,
        source.closedAt,
        source.createdAt,
        raw.lastActivityAt,
        raw.updatedAt,
        raw.modifiedAt,
        raw.closedAt,
        raw.createdAt
      )
    ) ||
    (Number.isFinite(Number(source._ts)) ? Number(source._ts) * 1000 : 0) ||
    (Number.isFinite(Number(raw._ts)) ? Number(raw._ts) * 1000 : 0) ||
    0
  );
}

/* =========================================================
   INITIALS / AVATAR
========================================================= */

export function getInitials(value = "") {
  const text = normalizeWhitespace(value || "ON");
  const parts = text.split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return "ON";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => safeText(part[0], ""))
    .join("");

  return safeText(initials, "ON").toUpperCase();
}

export function getAvatarTheme(seed = "") {
  const themes = [
    "violet",
    "emerald",
    "blue",
    "amber",
    "rose",
    "purple",
    "cyan",
    "orange",
  ];

  return themes[hashString(seed) % themes.length];
}

/* =========================================================
   MONEY / FACTURAS HELPERS
========================================================= */

function normalizeMoney(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  let normalized = String(value)
    .trim()
    .replace(/€/g, "")
    .replace(/%/g, "")
    .replace(/\s/g, "");

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
  } else if (hasComma) {
    normalized = normalized.replace(/,/g, ".");
  }

  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : fallback;
}

function roundMoney(value, fallback = null) {
  const amount = normalizeMoney(value, fallback);

  if (!Number.isFinite(amount)) {
    return fallback;
  }

  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function collectInvoiceObjects(source = {}, raw = {}) {
  const output = [];

  const sourceLinked = safeObject(source.linkedInvoices);
  const rawLinked = safeObject(raw.linkedInvoices);

  const candidates = [
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
  ];

  candidates.forEach((candidate) => {
    if (hasOwnKeys(candidate)) {
      output.push(candidate);
    }
  });

  return output;
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

      source.billing?.numeroFacturaLegal,
      source.billing?.numeroFactura,
      source.billing?.invoiceNumber,
      source.billing?.legalNumber,

      source.factura?.numeroFacturaLegal,
      source.factura?.numeroFactura,
      source.factura?.invoiceNumber,
      source.factura?.legalNumber,
      source.factura?.number,

      source.invoice?.numeroFacturaLegal,
      source.invoice?.numeroFactura,
      source.invoice?.invoiceNumber,
      source.invoice?.legalNumber,
      source.invoice?.number,

      source.linkedInvoices?.numeroFacturaLegal,
      source.linkedInvoices?.numeroFactura,
      source.linkedInvoices?.invoiceNumber,

      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.legalInvoiceNumber,
      raw.facturaNumeroLegal,

      raw.billing?.numeroFacturaLegal,
      raw.billing?.numeroFactura,
      raw.billing?.invoiceNumber,
      raw.billing?.legalNumber,

      raw.factura?.numeroFacturaLegal,
      raw.factura?.numeroFactura,
      raw.factura?.invoiceNumber,
      raw.factura?.legalNumber,
      raw.factura?.number,

      raw.invoice?.numeroFacturaLegal,
      raw.invoice?.numeroFactura,
      raw.invoice?.invoiceNumber,
      raw.invoice?.legalNumber,
      raw.invoice?.number,

      raw.linkedInvoices?.numeroFacturaLegal,
      raw.linkedInvoices?.numeroFactura,
      raw.linkedInvoices?.invoiceNumber,

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

      source.billing?.facturaId,
      source.billing?.invoiceId,
      source.billing?.id,

      source.factura?.id,
      source.factura?.facturaId,
      source.factura?.invoiceId,
      source.factura?.documentId,

      source.invoice?.id,
      source.invoice?.facturaId,
      source.invoice?.invoiceId,
      source.invoice?.documentId,

      source.linkedInvoices?.primaryInvoiceId,

      raw.facturaId,
      raw.invoiceId,
      raw.linkedFacturaId,
      raw.linkedInvoiceId,

      raw.billing?.facturaId,
      raw.billing?.invoiceId,
      raw.billing?.id,

      raw.factura?.id,
      raw.factura?.facturaId,
      raw.factura?.invoiceId,
      raw.factura?.documentId,

      raw.invoice?.id,
      raw.invoice?.facturaId,
      raw.invoice?.invoiceId,
      raw.invoice?.documentId,

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

    ...invoices.flatMap((invoice) => [
      invoice?.id,
      invoice?.facturaId,
      invoice?.invoiceId,
      invoice?.documentId,
      invoice?.numeroFacturaLegal,
      invoice?.numeroFactura,
      invoice?.invoiceNumber,
      invoice?.legalNumber,
      invoice?.number,
    ]),
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

      source.billing?.currency,
      source.billing?.moneda,

      source.factura?.currency,
      source.factura?.moneda,

      source.invoice?.currency,
      source.invoice?.moneda,

      raw.facturaCurrency,
      raw.facturaMoneda,
      raw.currency,
      raw.moneda,

      raw.linkedInvoices?.currency,
      raw.linkedInvoices?.moneda,

      raw.meta?.invoiceCurrency,
      raw.meta?.currency,
      raw.meta?.moneda,

      raw.billing?.currency,
      raw.billing?.moneda,

      raw.factura?.currency,
      raw.factura?.moneda,

      raw.invoice?.currency,
      raw.invoice?.moneda,

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
    source.factura?.importeTotal,
    source.factura?.totalFactura,

    source.invoice?.total,
    source.invoice?.amount,
    source.invoice?.importe,
    source.invoice?.importeTotal,
    source.invoice?.totalFactura,

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
    raw.factura?.importeTotal,
    raw.factura?.totalFactura,

    raw.invoice?.total,
    raw.invoice?.amount,
    raw.invoice?.importe,
    raw.invoice?.importeTotal,
    raw.invoice?.totalFactura,

    ...invoices.map((invoice) => invoice?.total),
    ...invoices.map((invoice) => invoice?.amount),
    ...invoices.map((invoice) => invoice?.importe),
    ...invoices.map((invoice) => invoice?.importeTotal),
    ...invoices.map((invoice) => invoice?.totalFactura),
  ];

  for (const candidate of candidates) {
    const amount = roundMoney(candidate, null);

    if (amount !== null) {
      return amount;
    }
  }

  const invoiceNumber = resolveInvoiceNumber(source, raw);
  const invoiceIds = resolveInvoiceIds(source, raw);

  const hasInvoiceEvidence =
    Boolean(invoiceNumber) ||
    invoiceIds.length > 0 ||
    invoices.length > 0 ||
    bool(source.meta?.hasLinkedInvoices, false) ||
    bool(raw.meta?.hasLinkedInvoices, false) ||
    bool(source.meta?.hasInvoice, false) ||
    bool(raw.meta?.hasInvoice, false);

  if (hasInvoiceEvidence) {
    const genericAmount = roundMoney(
      first(
        source.total,
        source.amount,
        source.importe,
        source.price,
        raw.total,
        raw.amount,
        raw.importe,
        raw.price
      ),
      null
    );

    return genericAmount === null ? 0 : genericAmount;
  }

  return null;
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

  if (["paid", "pagada", "pagado", "cobrada", "cobrado"].includes(key)) {
    return "paid";
  }

  if (["pending", "pendiente", "unpaid"].includes(key)) {
    return "pending";
  }

  if (["partial", "parcial", "pago_parcial"].includes(key)) {
    return "partial";
  }

  if (["overdue", "vencida", "vencido"].includes(key)) {
    return "overdue";
  }

  return "";
}

function normalizeInvoiceLite(invoice = {}) {
  if (!hasOwnKeys(invoice)) return null;

  const raw = safeObject(invoice.raw);
  const total = resolveInvoiceAmount(invoice, raw);
  const finalTotal = total === null ? 0 : total;
  const numeroFacturaLegal = resolveInvoiceNumber(invoice, raw);
  const id = resolvePrimaryInvoiceId(invoice, raw);
  const currency = resolveInvoiceCurrency(invoice, raw);
  const estadoPago = getPaymentStatus(invoice, raw);

  const normalized = {
    ...invoice,

    id,
    facturaId: safeText(first(invoice.facturaId, raw.facturaId, id), id),
    invoiceId: safeText(first(invoice.invoiceId, raw.invoiceId, id), id),

    numeroFacturaLegal,
    numeroFactura: safeText(
      first(invoice.numeroFactura, raw.numeroFactura, numeroFacturaLegal),
      numeroFacturaLegal
    ),
    invoiceNumber: safeText(
      first(invoice.invoiceNumber, raw.invoiceNumber, numeroFacturaLegal),
      numeroFacturaLegal
    ),
    legalNumber: safeText(
      first(invoice.legalNumber, raw.legalNumber, numeroFacturaLegal),
      numeroFacturaLegal
    ),
    number: safeText(
      first(invoice.number, raw.number, numeroFacturaLegal),
      numeroFacturaLegal
    ),

    total: finalTotal,
    amount: finalTotal,
    importe: finalTotal,
    totalFactura: finalTotal,
    importeTotal: finalTotal,
    invoiceAmount: finalTotal,

    currency,
    moneda: currency,

    estadoPago,
    paymentStatus: estadoPago,

    raw: {
      ...raw,
      ...invoice,
    },
  };

  return normalized;
}

function normalizeInvoiceArray(source = {}, raw = {}) {
  const output = [];
  const seen = new Set();

  collectInvoiceObjects(source, raw)
    .map(normalizeInvoiceLite)
    .filter(Boolean)
    .forEach((invoice) => {
      const key =
        invoice.id ||
        invoice.facturaId ||
        invoice.invoiceId ||
        invoice.numeroFacturaLegal ||
        invoice.invoiceNumber ||
        "";

      if (key && seen.has(key)) {
        const index = output.findIndex((item) => {
          const candidates = uniqueStrings([
            item.id,
            item.facturaId,
            item.invoiceId,
            item.numeroFacturaLegal,
            item.invoiceNumber,
          ]);

          return candidates.includes(key);
        });

        if (index >= 0) {
          output[index] = {
            ...output[index],
            ...invoice,
            total: Math.max(
              safeNumber(output[index].total, 0),
              safeNumber(invoice.total, 0)
            ),
            amount: Math.max(
              safeNumber(output[index].amount, 0),
              safeNumber(invoice.amount, 0)
            ),
            importe: Math.max(
              safeNumber(output[index].importe, 0),
              safeNumber(invoice.importe, 0)
            ),
          };
        }

        return;
      }

      if (key) seen.add(key);
      output.push(invoice);
    });

  return output;
}

function buildInvoicePatch(source = {}) {
  const item = safeObject(source);
  const raw = safeObject(item.raw);

  const invoiceIds = resolveInvoiceIds(item, raw);
  const primaryInvoiceId = resolvePrimaryInvoiceId(item, raw) || invoiceIds[0] || "";
  const numeroFacturaLegal = resolveInvoiceNumber(item, raw);
  const currency = resolveInvoiceCurrency(item, raw);
  const amount = resolveInvoiceAmount(item, raw);
  const normalizedAmount = amount === null ? null : roundMoney(amount, 0);
  const normalizedInvoices = normalizeInvoiceArray(item, raw);

  const declaredCount = resolveInvoiceCount(item, raw, invoiceIds);

  const hasInvoiceEvidence = Boolean(
    numeroFacturaLegal ||
      primaryInvoiceId ||
      invoiceIds.length ||
      declaredCount ||
      normalizedInvoices.length ||
      normalizedAmount !== null ||
      bool(item.meta?.hasLinkedInvoices, false) ||
      bool(raw.meta?.hasLinkedInvoices, false) ||
      bool(item.meta?.hasInvoice, false) ||
      bool(raw.meta?.hasInvoice, false) ||
      bool(item.meta?.hasFactura, false) ||
      bool(raw.meta?.hasFactura, false)
  );

  const finalAmount = normalizedAmount === null
    ? hasInvoiceEvidence
      ? 0
      : null
    : normalizedAmount;

  const sourceLinkedInvoices = safeObject(item.linkedInvoices);
  const rawLinkedInvoices = safeObject(raw.linkedInvoices);
  const linkedInvoices = hasOwnKeys(sourceLinkedInvoices)
    ? sourceLinkedInvoices
    : rawLinkedInvoices;

  const linkedInvoiceCount = Math.max(
    declaredCount,
    safeNumber(linkedInvoices.count, 0),
    invoiceIds.length,
    normalizedInvoices.length,
    hasInvoiceEvidence ? 1 : 0
  );

  const paymentStatus = getPaymentStatus(item, raw);

  const nextLinkedInvoices = {
    ...linkedInvoices,

    count: linkedInvoiceCount,
    ids: uniqueStrings(first(linkedInvoices.ids, invoiceIds)),
    primaryInvoiceId,

    numeroFacturaLegal,
    numeroFactura: safeText(
      first(linkedInvoices.numeroFactura, numeroFacturaLegal),
      numeroFacturaLegal
    ),
    invoiceNumber: safeText(
      first(linkedInvoices.invoiceNumber, numeroFacturaLegal),
      numeroFacturaLegal
    ),

    total: finalAmount,
    amount: finalAmount,
    importe: finalAmount,

    currency,
    moneda: currency,

    paymentStatus,
    estadoPago: paymentStatus,

    invoices: safeArray(first(linkedInvoices.invoices, normalizedInvoices)),
    facturas: safeArray(first(linkedInvoices.facturas, normalizedInvoices)),
  };

  const billing = {
    ...safeObject(raw.billing),
    ...safeObject(item.billing),

    facturaId: safeText(
      first(item.billing?.facturaId, raw.billing?.facturaId, primaryInvoiceId),
      primaryInvoiceId
    ),

    invoiceId: safeText(
      first(item.billing?.invoiceId, raw.billing?.invoiceId, primaryInvoiceId),
      primaryInvoiceId
    ),

    numeroFacturaLegal,
    numeroFactura: numeroFacturaLegal,
    invoiceNumber: numeroFacturaLegal,

    total: finalAmount,
    amount: finalAmount,
    importe: finalAmount,

    currency,
    moneda: currency,

    estadoPago: paymentStatus,
    paymentStatus,
  };

  const meta = {
    ...safeObject(raw.meta),
    ...safeObject(item.meta),

    hasLinkedInvoices: Boolean(
      item.meta?.hasLinkedInvoices ||
        raw.meta?.hasLinkedInvoices ||
        hasInvoiceEvidence
    ),

    hasInvoice: Boolean(
      item.meta?.hasInvoice ||
        raw.meta?.hasInvoice ||
        hasInvoiceEvidence
    ),

    hasFactura: Boolean(
      item.meta?.hasFactura ||
        raw.meta?.hasFactura ||
        hasInvoiceEvidence
    ),

    facturaLinked: Boolean(
      item.meta?.facturaLinked ||
        raw.meta?.facturaLinked ||
        hasInvoiceEvidence
    ),

    linkedInvoiceCount,
    invoiceCount: linkedInvoiceCount,

    invoicesTotal: finalAmount,
    invoiceTotal: finalAmount,
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
      linkedInvoices: nextLinkedInvoices,
      billing: hasOwnKeys(item.billing) || hasOwnKeys(raw.billing) ? billing : null,
      meta,
    };
  }

  return {
    hasInvoiceEvidence: true,

    facturaId: safeText(
      first(item.facturaId, raw.facturaId, item.invoiceId, raw.invoiceId, primaryInvoiceId),
      primaryInvoiceId
    ),

    invoiceId: safeText(
      first(item.invoiceId, raw.invoiceId, item.facturaId, raw.facturaId, primaryInvoiceId),
      primaryInvoiceId
    ),

    linkedFacturaId: safeText(
      first(item.linkedFacturaId, raw.linkedFacturaId, primaryInvoiceId),
      primaryInvoiceId
    ),

    linkedInvoiceId: safeText(
      first(item.linkedInvoiceId, raw.linkedInvoiceId, primaryInvoiceId),
      primaryInvoiceId
    ),

    facturaIds: uniqueStrings(first(item.facturaIds, raw.facturaIds, invoiceIds)),
    invoiceIds: uniqueStrings(first(item.invoiceIds, raw.invoiceIds, invoiceIds)),

    numeroFacturaLegal,
    numeroFactura: numeroFacturaLegal,
    invoiceNumber: numeroFacturaLegal,

    facturaRelacionada: safeText(
      first(
        item.facturaRelacionada,
        raw.facturaRelacionada,
        linkedInvoiceCount > 0
          ? `${linkedInvoiceCount} factura${linkedInvoiceCount === 1 ? "" : "s"} vinculada${linkedInvoiceCount === 1 ? "" : "s"}`
          : ""
      ),
      ""
    ),

    facturasCount: linkedInvoiceCount,
    invoicesCount: linkedInvoiceCount,

    factura: first(item.factura, raw.factura, normalizedInvoices[0], null),
    invoice: first(item.invoice, raw.invoice, normalizedInvoices[0], null),
    billing,

    facturas: safeArray(first(item.facturas, raw.facturas, normalizedInvoices)),
    invoices: safeArray(first(item.invoices, raw.invoices, normalizedInvoices)),
    facturasRelacionadas: safeArray(
      first(item.facturasRelacionadas, raw.facturasRelacionadas, normalizedInvoices)
    ),

    linkedInvoices: nextLinkedInvoices,

    facturasTotal: finalAmount,
    invoicesTotal: finalAmount,
    importeFacturas: finalAmount,
    invoiceTotal: finalAmount,

    facturaTotal: finalAmount,
    facturaImporte: finalAmount,
    importeFactura: finalAmount,
    totalFactura: finalAmount,
    invoiceAmount: finalAmount,

    total: finalAmount,
    amount: finalAmount,
    importe: finalAmount,
    price: finalAmount,

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

function getAttachmentPath(item = {}) {
  return safeText(
    first(
      item.path,
      item.storageKey,
      item.storagePath,
      item.blobPath,
      item.blobName,
      item.key
    ),
    ""
  );
}

function normalizeAttachment(file = {}, index = 0) {
  const item = safeObject(file);
  const raw = safeObject(item.raw);

  const name = safeText(
    first(
      item.name,
      item.filename,
      item.fileName,
      item.originalname,
      item.originalName,
      item.title,
      raw.name,
      raw.filename,
      raw.fileName,
      raw.originalname,
      raw.originalName,
      raw.title
    ),
    `archivo_${index + 1}`
  );

  const path = safeText(
    first(
      item.path,
      item.storageKey,
      item.storagePath,
      item.blobPath,
      item.blobName,
      item.key,
      raw.path,
      raw.storageKey,
      raw.storagePath,
      raw.blobPath,
      raw.blobName,
      raw.key
    ),
    ""
  );

  const id = safeText(
    first(
      item.id,
      item.fileId,
      item.attachmentId,
      item.blobName,
      item.storageKey,
      item.path,
      item.key,
      raw.id,
      raw.fileId,
      raw.attachmentId,
      raw.blobName,
      raw.storageKey,
      raw.path,
      raw.key
    ),
    path || `attachment-${index + 1}`
  );

  const viewUrl = safeText(
    first(
      item.viewUrl,
      item.openUrl,
      item.signedUrl,
      item.url,
      item.blobUrl,
      item.publicUrl,
      item.href,
      raw.viewUrl,
      raw.openUrl,
      raw.signedUrl,
      raw.url,
      raw.blobUrl,
      raw.publicUrl,
      raw.href
    ),
    ""
  );

  const downloadUrl = safeText(
    first(
      item.downloadUrl,
      item.signedUrl,
      item.url,
      item.blobUrl,
      item.publicUrl,
      item.href,
      raw.downloadUrl,
      raw.signedUrl,
      raw.url,
      raw.blobUrl,
      raw.publicUrl,
      raw.href
    ),
    viewUrl
  );

  const contentType = safeText(
    first(
      item.contentType,
      item.mimetype,
      item.mimeType,
      item.mime,
      item.type,
      raw.contentType,
      raw.mimetype,
      raw.mimeType,
      raw.mime,
      raw.type
    ),
    ""
  );

  const size = safeNumber(
    first(
      item.size,
      item.sizeBytes,
      item.contentLength,
      raw.size,
      raw.sizeBytes,
      raw.contentLength
    ),
    0
  );

  return {
    ...item,

    id,
    attachmentId: safeText(first(item.attachmentId, raw.attachmentId, id), id),
    fileId: safeText(first(item.fileId, raw.fileId, id), id),

    name,
    filename: safeText(
      first(
        item.filename,
        item.fileName,
        item.name,
        item.originalname,
        item.originalName,
        raw.filename,
        raw.fileName,
        raw.name,
        raw.originalname,
        raw.originalName
      ),
      name
    ),

    fileName: safeText(
      first(
        item.fileName,
        item.filename,
        item.name,
        raw.fileName,
        raw.filename,
        raw.name
      ),
      name
    ),

    originalName: safeText(
      first(
        item.originalName,
        item.originalname,
        raw.originalName,
        raw.originalname,
        name
      ),
      name
    ),

    url: safeText(
      first(
        item.url,
        viewUrl,
        downloadUrl,
        item.signedUrl,
        item.blobUrl,
        item.publicUrl,
        raw.url,
        raw.signedUrl,
        raw.blobUrl,
        raw.publicUrl
      ),
      ""
    ),

    viewUrl,
    openUrl: safeText(first(item.openUrl, raw.openUrl, viewUrl), viewUrl),
    downloadUrl,

    signedUrl: safeText(first(item.signedUrl, raw.signedUrl, viewUrl), ""),
    blobUrl: safeText(first(item.blobUrl, raw.blobUrl), ""),
    publicUrl: safeText(first(item.publicUrl, raw.publicUrl), ""),

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

    uploadedAt: first(
      item.uploadedAt,
      item.createdAt,
      item.date,
      item.timestamp,
      raw.uploadedAt,
      raw.createdAt,
      raw.date,
      raw.timestamp,
      null
    ),

    uploadedAtES: first(item.uploadedAtES, raw.uploadedAtES, null),
    createdAt: first(item.createdAt, item.uploadedAt, raw.createdAt, raw.uploadedAt, null),
    uploadedBy: first(item.uploadedBy, raw.uploadedBy, null),

    meta: {
      ...safeObject(raw.meta),
      ...safeObject(item.meta),
      hasBlobPath: Boolean(path),
    },

    raw: {
      ...raw,
      ...item,
    },
  };
}

function normalizeAttachments(value) {
  return safeArray(value).map(normalizeAttachment).filter(Boolean);
}

/* =========================================================
   HISTORY / COMMENTS
========================================================= */

function formatChange(change = {}) {
  const item = safeObject(change);
  const field = safeLower(item.field, "");
  const action = safeLower(item.action, "");

  if (field === "attachments" || field === "adjuntos" || field === "files") {
    const added = safeNumber(item.added, 0);
    const removed = safeNumber(item.removed, 0);

    if (action === "remove" || removed > 0) {
      return removed === 1
        ? "Se eliminó 1 adjunto."
        : `Se eliminaron ${removed} adjuntos.`;
    }

    if (added > 0) {
      return added === 1
        ? "Se añadió 1 adjunto."
        : `Se añadieron ${added} adjuntos.`;
    }

    return "Adjuntos actualizados.";
  }

  if (field === "status" || field === "estado") {
    const from = safeText(item.from, "—");
    const to = safeText(item.to, "—");

    if (from === to) return "";

    return `Estado actualizado: ${from} → ${to}.`;
  }

  if (field === "priority" || field === "prioridad") {
    const from = safeText(item.from, "—");
    const to = safeText(item.to, "—");

    if (from === to) return "";

    return `Prioridad actualizada: ${from} → ${to}.`;
  }

  if (
    field === "message" ||
    field === "descripcion" ||
    field === "description" ||
    field === "body"
  ) {
    const from = normalizeWhitespace(item.from);
    const to = normalizeWhitespace(item.to);

    if (from && to && from === to) {
      return "";
    }

    return "Descripción actualizada.";
  }

  if (field === "categoria" || field === "category" || field === "tipo") {
    const from = safeText(item.from, "—");
    const to = safeText(item.to, "—");

    if (from === to) return "";

    return `Categoría actualizada: ${from} → ${to}.`;
  }

  if (field) {
    const from = safeText(item.from, "");
    const to = safeText(item.to, "");

    if (from && to && from === to) return "";

    return `${field} actualizado.`;
  }

  return "";
}

function normalizeHistoryEntry(row = {}, index = 0) {
  const item = safeObject(row);

  const type = safeText(first(item.type, item.action), "event");
  const normalizedType = safeLower(type, "event");
  const changes = safeArray(item.changes);

  let title = safeText(
    first(
      item.title,
      item.action,
      item.type,
      item.message,
      item.text
    ),
    "Evento"
  );

  let body = safeText(
    first(
      item.description,
      item.detail,
      item.body
    ),
    ""
  );

  if (normalizedType === "created" || normalizedType === "creation") {
    title = "Incidencia creada";
    body = safeText(
      first(
        item.body,
        item.description,
        item.detail,
        item.message
      ),
      "La incidencia fue registrada."
    );
  }

  if (normalizedType === "update" || normalizedType === "updated") {
    const changeLines = changes.map(formatChange).filter(Boolean);

    title = "Actualización";
    body = safeText(first(changeLines.join("\n"), body), "");
  }

  if (normalizedType === "attachments_added") {
    title = "Adjuntos añadidos";
    body = safeText(
      first(
        item.body,
        item.description,
        item.detail,
        item.message,
        changes.map(formatChange).filter(Boolean).join("\n")
      ),
      "Se añadieron adjuntos."
    );
  }

  if (normalizedType === "comment") {
    title = "Comentario";
    body = safeText(
      first(
        item.message,
        item.text,
        item.body,
        item.comment,
        body
      ),
      ""
    );
  }

  const createdAt = first(
    item.createdAt,
    item.date,
    item.timestamp,
    item.updatedAt,
    null
  );

  return {
    id: safeText(
      first(
        item.id,
        item.eventId,
        item.historyId
      ),
      `h-${index + 1}`
    ),

    kind: "event",
    type: normalizedType,
    action: safeText(first(item.action, item.type), normalizedType),

    title,
    body,

    changes,

    createdAt,
    createdAtTs: toTimestamp(createdAt),

    author: safeText(
      first(
        item.byName,
        item.user,
        item.author,
        item.name,
        item.by,
        item.createdBy?.name,
        item.createdBy?.email
      ),
      "Sistema"
    ),

    by: safeText(first(item.by, item.userId, item.createdBy?.userId), ""),
    role: safeText(item.role, ""),

    raw: item,
  };
}

function normalizeCommentEntry(row = {}, index = 0) {
  const item = safeObject(row);

  const createdAt = first(
    item.createdAt,
    item.date,
    item.timestamp,
    item.updatedAt,
    null
  );

  return {
    id: safeText(
      first(
        item.id,
        item.commentId,
        item.messageId
      ),
      `c-${index + 1}`
    ),

    kind: "comment",
    type: "comment",
    action: "comment",

    title: "Comentario",

    body: safeText(
      first(
        item.message,
        item.text,
        item.body,
        item.comment
      ),
      ""
    ),

    createdAt,
    createdAtTs: toTimestamp(createdAt),

    author: safeText(
      first(
        item.byName,
        item.user,
        item.author,
        item.name,
        item.by,
        item.createdBy?.name,
        item.createdBy?.email
      ),
      "Usuario"
    ),

    by: safeText(first(item.by, item.userId, item.createdBy?.userId), ""),
    role: safeText(item.role, ""),

    raw: item,
  };
}

function isNoiseHistoryEntry(entry = {}) {
  const title = safeLower(entry.title, "");
  const body = safeLower(entry.body, "");
  const type = safeLower(entry.type, "");

  if (type === "update" && !safeText(entry.body, "")) return true;
  if (title === "update" && body === "update") return true;
  if (title === "actualización" && body === "update") return true;
  if (title === "actualizacion" && body === "update") return true;

  return false;
}

function normalizeHistory(value) {
  return safeArray(value)
    .map(normalizeHistoryEntry)
    .filter((entry) => !isNoiseHistoryEntry(entry));
}

function normalizeComments(value) {
  return safeArray(value)
    .map(normalizeCommentEntry)
    .filter((entry) => Boolean(safeText(entry.body, "")));
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

  if (Array.isArray(payload)) {
    return safeObject(payload[0]);
  }

  const source = safeObject(payload);

  if (!Object.keys(source).length) {
    return {};
  }

  const candidates = [
    source.ticket,
    source.detail,
    source.item,
    source.incidencia,
    source.result,
    source.payload,
    source.data,
    source,
  ];

  for (const candidate of candidates) {
    if (!isObject(candidate)) continue;

    if (looksLikeTicket(candidate)) {
      return candidate;
    }
  }

  if (isObject(source.data)) {
    return unwrapDetailPayload(source.data);
  }

  if (isObject(source.payload)) {
    return unwrapDetailPayload(source.payload);
  }

  return source;
}

/* =========================================================
   CORE NORMALIZER
========================================================= */

export function normalizeIncidenciaModel(payload = {}) {
  const source = safeObject(payload);
  const item = safeObject(unwrapDetailPayload(source));

  const raw = safeObject(item.raw);

  const clienteObject = safeObject(
    first(
      item.cliente,
      item.client,
      item.customer,
      raw.cliente,
      raw.client,
      raw.customer
    )
  );

  const tecnicoObject = safeObject(
    first(
      item.tecnico,
      item.assignedTo,
      item.assignee,
      raw.tecnico,
      raw.assignedTo,
      raw.assignee
    )
  );

  const createdByObject = safeObject(first(item.createdBy, raw.createdBy));
  const receptorObject = safeObject(first(item.receptor, raw.receptor));

  const ticketId = safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.id,
      item._id,
      item.code,
      item.ticketCode,

      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw._id,
      raw.code,
      raw.ticketCode
    ),
    ""
  );

  const id = safeText(
    first(
      item.id,
      item.ticketId,
      item.incidenciaId,
      item._id,
      raw.id,
      raw.ticketId,
      raw.incidenciaId,
      raw._id,
      ticketId
    ),
    ticketId
  );

  const ticketCode = safeText(
    first(
      item.ticketCode,
      item.code,
      raw.ticketCode,
      raw.code,
      ticketId,
      id
    ),
    ticketId || id
  );

  const title = safeText(
    first(
      item.title,
      item.subject,
      item.asunto,
      item.name,

      raw.title,
      raw.subject,
      raw.asunto,
      raw.name
    ),
    "Incidencia"
  );

  const message = safeText(
    first(
      item.message,
      item.descripcion,
      item.description,
      item.body,
      item.preview,

      raw.message,
      raw.descripcion,
      raw.description,
      raw.body,
      raw.preview
    ),
    ""
  );

  const description = safeText(
    first(
      item.description,
      item.descripcion,
      item.message,
      item.preview,
      item.body,

      raw.description,
      raw.descripcion,
      raw.message,
      raw.preview,
      raw.body
    ),
    "Sin descripción."
  );

  const clientName = safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.name,
      item.requesterName,
      item.requesterSnapshot?.name,
      item.requesterSnapshot?.displayName,

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
      raw.name,
      raw.requesterName,
      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.displayName
    ),
    "Cliente"
  );

  const clientEmail = safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.email,
      item.emailCliente,
      item.requesterSnapshot?.email,

      clienteObject.email,
      clienteObject.emailLower,
      receptorObject.email,
      createdByObject.email,

      raw.clientEmail,
      raw.clienteEmail,
      raw.email,
      raw.emailCliente,
      raw.requesterSnapshot?.email
    ),
    "Sin email"
  );

  const clientAvatar = safeText(
    first(
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.requesterSnapshot?.avatar,
      item.requesterSnapshot?.avatarUrl,

      clienteObject.avatar,
      clienteObject.avatarUrl,

      raw.clientAvatar,
      raw.avatar,
      raw.avatarUrl,
      raw.requesterSnapshot?.avatar,
      raw.requesterSnapshot?.avatarUrl
    ),
    ""
  );

  const assignedToName = safeText(
    first(
      tecnicoObject.name,
      tecnicoObject.nombre,
      tecnicoObject.displayName,

      item.assignedToName,
      item.assignment?.agentName,
      item.assignment?.name,

      typeof item.assignedTo === "string" ? item.assignedTo : null,
      typeof item.assignee === "string" ? item.assignee : null,
      typeof item.tecnico === "string" ? item.tecnico : null,

      raw.assignedToName,
      raw.assignment?.agentName,
      raw.assignment?.name
    ),
    "No asignado"
  );

  const status = normalizeStatus(
    first(
      item.status,
      item.estado,
      item.state,
      item.lifecycle?.status,
      raw.status,
      raw.estado,
      raw.state,
      raw.lifecycle?.status
    )
  );

  const priority = normalizePriority(
    first(
      item.priority,
      item.prioridad,
      item.severity,
      item.urgency,
      item.sla?.priority,

      raw.priority,
      raw.prioridad,
      raw.severity,
      raw.urgency,
      raw.sla?.priority
    )
  );

  const category = safeLower(
    first(
      item.category,
      item.categoria,
      item.tipo,
      item.type,
      item.subcategory,
      item.subcategoria,

      raw.category,
      raw.categoria,
      raw.tipo,
      raw.type,
      raw.subcategory,
      raw.subcategoria
    ),
    "general"
  );

  const sourceLabel = safeText(
    first(
      item.source,
      item.origen,
      item.channel,
      raw.source,
      raw.origen,
      raw.channel
    ),
    "panel"
  );

  const createdAt = first(
    item.createdAt,
    item.fechaCreacion,
    item.created_at,
    item.lifecycle?.createdAt,
    raw.createdAt,
    raw.fechaCreacion,
    raw.created_at,
    raw.lifecycle?.createdAt,
    null
  );

  const createdAtES = first(
    item.createdAtES,
    raw.createdAtES,
    null
  );

  const updatedAt = first(
    item.lastActivityAt,
    item.updatedAt,
    item.fechaActualizacion,
    item.updated_at,
    item.modifiedAt,
    item.lastUpdate,
    item.ultimaNovedad,
    item.closedAt,

    raw.lastActivityAt,
    raw.updatedAt,
    raw.fechaActualizacion,
    raw.updated_at,
    raw.modifiedAt,
    raw.lastUpdate,
    raw.ultimaNovedad,
    raw.closedAt,

    createdAt,
    null
  );

  const updatedAtES = first(
    item.lastActivityAtES,
    item.updatedAtES,
    raw.lastActivityAtES,
    raw.updatedAtES,
    null
  );

  const closedAt = first(
    item.closedAt,
    item.closed_at,
    raw.closedAt,
    raw.closed_at,
    null
  );

  const closedAtES = first(
    item.closedAtES,
    raw.closedAtES,
    null
  );

  const attachments = normalizeAttachments(
    first(
      item.attachments,
      item.files,
      item.adjuntos,
      raw.attachments,
      raw.files,
      raw.adjuntos
    )
  );

  const history = normalizeHistory(
    first(
      item.history,
      item.timeline,
      item.logs,
      raw.history,
      raw.timeline,
      raw.logs
    )
  );

  const comments = normalizeComments(
    first(
      item.comments,
      item.notes,
      item.messages,
      raw.comments,
      raw.notes,
      raw.messages
    )
  );

  const tagsRaw = first(
    item.tags,
    item.labels,
    raw.tags,
    raw.labels
  );

  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((x) => safeText(x, "")).filter(Boolean)
    : typeof tagsRaw === "string"
      ? tagsRaw.split(/[,\s|;]+/g).map((x) => safeText(x, "")).filter(Boolean)
      : [];

  const initials = getInitials(clientName);
  const avatarTheme = getAvatarTheme(ticketId || clientName || clientEmail);

  const assignedLower = safeLower(assignedToName);
  const isAssigned = Boolean(
    assignedLower &&
      assignedLower !== "no asignado" &&
      assignedLower !== "sin asignar"
  );

  const isOpen = status === STATUS.OPEN;
  const isPending = status === STATUS.PENDING;
  const isInProgress = status === STATUS.IN_PROGRESS;
  const isResolved = status === STATUS.RESOLVED;
  const isClosed = status === STATUS.CLOSED;
  const isUrgent = priority === PRIORITY.URGENT;
  const isHigh = priority === PRIORITY.HIGH;

  const createdAtTs = toTimestamp(createdAt);
  const updatedAtTs =
    toTimestamp(updatedAt) ||
    readTimestampFromItem(item) ||
    createdAtTs;

  const closedAtTs = toTimestamp(closedAt);

  const timeline = [...history, ...comments].sort(
    (a, b) => safeNumber(b.createdAtTs, toTimestamp(b.createdAt)) - safeNumber(a.createdAtTs, toTimestamp(a.createdAt))
  );

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

      raw.userId,
      raw.usuarioId,
      raw.ownerUserId,
      raw.createdByUserId,
      raw.receptorUserId,

      raw.requesterSnapshot?.userId,

      /*
        Fallback legacy al final:
        algunos documentos antiguos mezclan clienteId como owner.
      */
      item.clienteId,
      raw.clienteId
    ),
    ""
  );

  const clienteId = safeText(
    first(
      item.clienteId,
      receptorObject.clienteId,
      clienteObject.clienteId,
      clienteObject.id,

      raw.clienteId,
      raw.receptor?.clienteId,
      raw.cliente?.clienteId,
      raw.cliente?.id,

      /*
        Fallback legacy al final:
        si no existe clienteId explícito, se permite userId.
      */
      item.userId,
      raw.userId
    ),
    ""
  );

  const invoicePatch = buildInvoicePatch({
    ...raw,
    ...item,
    raw: {
      ...raw,
      ...item,
    },
  });

  const meta = {
    ...safeObject(raw.meta),
    ...safeObject(item.meta),
    ...safeObject(invoicePatch.meta),

    timestampMs: updatedAtTs || createdAtTs || readTimestampFromItem(item),

    isClosed,
    isActive: !isClosed,
    isAssigned,

    hasAttachments: attachments.length > 0,
    hasComments: comments.length > 0,
    hasHistory: history.length > 0,

    attachmentsCount: attachments.length,
    commentsCount: comments.length,
    historyCount: history.length,
  };

  const normalized = {
    ...item,

    /* identity */
    id,
    ticketId,
    incidenciaId: safeText(first(item.incidenciaId, raw.incidenciaId, ticketId), ticketId),
    code: safeText(first(item.code, item.ticketCode, raw.code, raw.ticketCode, ticketCode), ticketCode),
    ticketCode,

    tipoDocumento: safeText(first(item.tipoDocumento, raw.tipoDocumento), "ticket"),

    /* content */
    title,
    subject: safeText(first(item.subject, item.asunto, raw.subject, raw.asunto, title), title),
    asunto: safeText(first(item.asunto, item.subject, raw.asunto, raw.subject, title), title),

    description,
    descripcion: safeText(
      first(
        item.descripcion,
        item.message,
        item.description,
        raw.descripcion,
        raw.message,
        raw.description,
        description
      ),
      description
    ),
    message,
    preview: safeText(first(item.preview, raw.preview, message, description), description),

    /* relations */
    clientName,
    clienteNombre: safeText(first(item.clienteNombre, raw.clienteNombre, clientName), clientName),
    clientEmail,
    clienteEmail: safeText(first(item.clienteEmail, raw.clienteEmail, clientEmail), clientEmail),
    clientAvatar,
    assignedToName,

    cliente: {
      ...clienteObject,
      id: safeText(first(clienteObject.id, clienteObject.clienteId, clienteId), clienteId),
      userId: safeText(first(clienteObject.userId, userId), userId),
      clienteId: safeText(first(clienteObject.clienteId, clienteObject.id, clienteId), clienteId),
      nombre: safeText(first(clienteObject.nombre, clienteObject.name, clientName), clientName),
      name: safeText(first(clienteObject.name, clienteObject.nombre, clientName), clientName),
      email: safeText(first(clienteObject.email, clientEmail), clientEmail),
      avatar: safeText(first(clienteObject.avatar, clienteObject.avatarUrl, clientAvatar), clientAvatar),
      avatarUrl: safeText(first(clienteObject.avatarUrl, clienteObject.avatar, clientAvatar), clientAvatar),
      raw: clienteObject,
    },

    tecnico: {
      ...tecnicoObject,
      name: safeText(first(tecnicoObject.name, tecnicoObject.nombre, assignedToName), assignedToName),
      nombre: safeText(first(tecnicoObject.nombre, tecnicoObject.name, assignedToName), assignedToName),
      email: safeText(first(tecnicoObject.email), ""),
      raw: tecnicoObject,
    },

    assignedTo: first(
      item.assignedTo,
      raw.assignedTo,
      {
        name: assignedToName,
        nombre: assignedToName,
        email: safeText(first(tecnicoObject.email), ""),
      }
    ),

    createdBy: {
      ...createdByObject,
      userId: safeText(first(createdByObject.userId, createdByObject.id, item.createdByUserId, raw.createdByUserId, userId), ""),
      id: safeText(first(createdByObject.id, createdByObject.userId, item.createdByUserId, raw.createdByUserId, userId), ""),
      name: safeText(first(createdByObject.name, createdByObject.nombre, item.name, raw.name), ""),
      nombre: safeText(first(createdByObject.nombre, createdByObject.name, item.name, raw.name), ""),
      email: safeText(first(createdByObject.email, item.email, raw.email), ""),
      raw: createdByObject,
    },

    receptor: {
      ...receptorObject,
      userId: safeText(first(receptorObject.userId, receptorObject.id, userId), userId),
      id: safeText(first(receptorObject.id, receptorObject.userId, userId), userId),
      clienteId: safeText(first(receptorObject.clienteId, clienteId), clienteId),
      name: safeText(first(receptorObject.name, receptorObject.nombre, item.name, raw.name, clientName), clientName),
      nombre: safeText(first(receptorObject.nombre, receptorObject.name, item.name, raw.name, clientName), clientName),
      email: safeText(first(receptorObject.email, item.email, raw.email, clientEmail), clientEmail),
      raw: receptorObject,
    },

    requester: first(
      item.requester,
      item.user,
      item.usuario,
      raw.requester,
      raw.user,
      raw.usuario,
      receptorObject,
      clienteObject,
      createdByObject,
      null
    ),

    requesterSnapshot: {
      ...safeObject(raw.requesterSnapshot),
      ...safeObject(item.requesterSnapshot),
    },

    /* enums */
    status,
    estado: status,
    statusLabel: getStatusLabel(status),

    priority,
    prioridad: priority,
    priorityLabel: getPriorityLabel(priority),

    /* semantic fields */
    category,
    categoria: category,
    tipo: safeText(first(item.tipo, item.categoria, item.category, raw.tipo, raw.categoria, raw.category, category), category),
    source: sourceLabel,
    origen: safeText(first(item.origen, raw.origen, sourceLabel), sourceLabel),

    /* dates */
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

    /* visuals */
    initials,
    avatarTheme,

    /* collections */
    attachments,
    files: attachments,
    adjuntos: attachments,

    attachmentsCount: Math.max(
      safeNumber(first(item.attachmentsCount, raw.attachmentsCount), 0),
      safeNumber(first(item.filesCount, raw.filesCount), 0),
      attachments.length
    ),

    filesCount: Math.max(
      safeNumber(first(item.filesCount, raw.filesCount), 0),
      attachments.length
    ),

    history,
    historyCount: Math.max(
      safeNumber(first(item.historyCount, raw.historyCount), 0),
      history.length
    ),

    comments,
    commentsCount: Math.max(
      safeNumber(first(item.commentsCount, raw.commentsCount), 0),
      comments.length
    ),

    timeline,
    timelineCount: timeline.length,

    tags,

    /* invoice / billing preserved */
    ...invoicePatch,

    /* flags */
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

    /* misc */
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

    /* raw */
    raw: {
      ...raw,
      ...item,
      meta,
      attachments,
      files: attachments,
      adjuntos: attachments,
      linkedInvoices: invoicePatch.linkedInvoices,
      billing: invoicePatch.billing,
    },
  };

  return normalized;
}

/* =========================================================
   COLLECTION NORMALIZER
========================================================= */

export function unwrapIncidenciasPayload(payload = null) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

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

  if (obj.data && typeof obj.data === "object") {
    return unwrapIncidenciasPayload(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return unwrapIncidenciasPayload(obj.payload);
  }

  return [];
}

export function normalizeIncidenciasCollection(payload = []) {
  return unwrapIncidenciasPayload(payload)
    .map(normalizeIncidenciaModel)
    .filter((item) => Boolean(item?.ticketId || item?.id));
}

/* =========================================================
   SORT
========================================================= */

export function sortIncidenciasByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const left = safeNumber(readTimestampFromItem(a), safeNumber(a?.updatedAtTs, 0));
    const right = safeNumber(readTimestampFromItem(b), safeNumber(b?.updatedAtTs, 0));

    const diff = right - left;

    if (diff !== 0) return diff;

    return safeText(b?.ticketId || b?.id, "").localeCompare(
      safeText(a?.ticketId || a?.id, ""),
      "es",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  });
}

export function sortIncidenciasByPriorityDesc(items = []) {
  const weight = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...safeArray(items)].sort((a, b) => {
    const priorityDiff =
      safeNumber(weight[b.priority]) - safeNumber(weight[a.priority]);

    if (priorityDiff !== 0) return priorityDiff;

    return (
      safeNumber(readTimestampFromItem(b), safeNumber(b?.updatedAtTs, 0)) -
      safeNumber(readTimestampFromItem(a), safeNumber(a?.updatedAtTs, 0))
    );
  });
}

export function sortIncidenciasDefault(items = []) {
  return sortIncidenciasByUpdatedDesc(sortIncidenciasByPriorityDesc(items));
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateIncidencias(
  items = [],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const list = safeArray(items);

  const size = clampNumber(pageSize, 1, 100);
  const total = list.length;

  const totalPages = Math.max(
    1,
    Math.ceil((total || 1) / size)
  );

  const current = clampNumber(page, 1, totalPages);

  const start = (current - 1) * size;
  const end = start + size;

  const pageItems = list.slice(start, end);

  return {
    page: current,
    currentPage: current,
    incidenciasPage: current,

    pageSize: size,
    incidenciasPageSize: size,

    total,
    totalCount: total,
    totalPages,

    items: pageItems,
    pageItems,

    from: total === 0 ? 0 : start + 1,
    to: Math.min(end, total),

    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: Math.min(end, total),

    hasPrev: current > 1,
    hasNext: current < totalPages,
  };
}

/* =========================================================
   STATS
========================================================= */

export function computeIncidenciasStats(items = []) {
  const list = safeArray(items);

  const total = list.length;
  const open = list.filter((x) => normalizeStatus(x?.status || x?.estado) === STATUS.OPEN).length;
  const pending = list.filter((x) => normalizeStatus(x?.status || x?.estado) === STATUS.PENDING).length;
  const inProgress = list.filter((x) => normalizeStatus(x?.status || x?.estado) === STATUS.IN_PROGRESS).length;
  const resolved = list.filter((x) => normalizeStatus(x?.status || x?.estado) === STATUS.RESOLVED).length;
  const closed = list.filter((x) => normalizeStatus(x?.status || x?.estado) === STATUS.CLOSED).length;

  const urgent = list.filter((x) => normalizePriority(x?.priority || x?.prioridad) === PRIORITY.URGENT).length;
  const high = list.filter((x) => normalizePriority(x?.priority || x?.prioridad) === PRIORITY.HIGH).length;

  const assigned = list.filter((x) => {
    const assigned = safeLower(
      first(
        x?.assignedToName,
        x?.tecnico?.name,
        x?.tecnico?.nombre,
        typeof x?.assignedTo === "string" ? x.assignedTo : x?.assignedTo?.name,
        ""
      )
    );

    return Boolean(
      assigned &&
        assigned !== "no asignado" &&
        assigned !== "sin asignar"
    );
  }).length;

  const withAttachments = list.filter((x) => {
    return (
      safeArray(x?.attachments).length > 0 ||
      safeArray(x?.files).length > 0 ||
      safeArray(x?.adjuntos).length > 0 ||
      safeNumber(x?.attachmentsCount, 0) > 0 ||
      safeNumber(x?.filesCount, 0) > 0
    );
  }).length;

  const withInvoices = list.filter((x) => {
    return Boolean(
      x?.hasLinkedInvoices ||
        x?.hasInvoice ||
        x?.hasFactura ||
        x?.meta?.hasLinkedInvoices ||
        x?.meta?.hasInvoice ||
        x?.meta?.hasFactura ||
        safeNumber(x?.facturasCount, 0) > 0 ||
        safeNumber(x?.invoicesCount, 0) > 0 ||
        safeArray(x?.facturas).length > 0 ||
        safeArray(x?.invoices).length > 0 ||
        safeArray(x?.facturasRelacionadas).length > 0 ||
        safeText(x?.numeroFacturaLegal, "") ||
        safeText(x?.facturaId, "") ||
        safeText(x?.invoiceId, "")
    );
  }).length;

  const totalImporte = list.reduce((acc, item) => {
    const amount = roundMoney(
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

    return acc + safeNumber(amount, 0);
  }, 0);

  return {
    total,
    active: Math.max(total - closed, 0),

    open,
    pending,
    inProgress,
    resolved,
    closed,

    urgent,
    high,

    assigned,
    unassigned: Math.max(total - assigned, 0),

    withAttachments,
    withInvoices,

    totalImporte: roundMoney(totalImporte, 0),
    invoiceTotal: roundMoney(totalImporte, 0),
    invoicesTotal: roundMoney(totalImporte, 0),
  };
}

/* =========================================================
   FINDERS
========================================================= */

export function findIncidenciaById(items = [], ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) return null;

  const normalizedId = normalizeText(id);

  return (
    safeArray(items).find((item) => {
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
    }) || null
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  DEFAULT_CURRENCY,

  STATUS,
  PRIORITY,

  normalizeIncidenciaModel,
  normalizeIncidenciasCollection,
  unwrapIncidenciasPayload,

  sortIncidenciasByUpdatedDesc,
  sortIncidenciasByPriorityDesc,
  sortIncidenciasDefault,

  paginateIncidencias,
  computeIncidenciasStats,
  findIncidenciaById,

  getStatusLabel,
  getPriorityLabel,
  normalizeStatus,
  normalizePriority,

  toDate,
  toTimestamp,

  getInitials,
  getAvatarTheme,
};
