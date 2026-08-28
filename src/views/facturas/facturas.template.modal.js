/* =========================================================
   Onion Support - Facturas Modal · Canonical Technical Guard

   La implementación visual estable vive en
   facturas.template.modal.base.js. Esta frontera garantiza que ningún
   registro técnico FACTURA_CREATE_IDEMP_* pueda entrar al renderer como si
   fuese una factura. Cuando existe responseSnapshot.factura, se promueve el
   documento canónico antes de calcular IDs, importes, impuestos o acciones.
========================================================= */

import BaseDefault, * as Base from "./facturas.template.modal.base.js";

export * from "./facturas.template.modal.base.js";

export const FACTURAS_MODAL_TEMPLATE_VERSION =
  "facturas.template.modal.productivo.v5.technical-snapshot-first";

export const FACTURAS_MODAL_TECHNICAL_GUARD_VERSION =
  "facturas.modal.technical-snapshot-first.v1";

const FACTURA_CREATE_IDEMPOTENCY_PREFIX = "FACTURA_CREATE_IDEMP_";

const TECHNICAL_TYPES = new Set([
  "idempotency",
  "idempotencia",
  "invoice_create_idempotency",
  "factura_create_idempotency",
  "invoice_create_operation",
  "factura_create_operation",
]);

const FALLBACK_KEYS = Object.freeze([
  "cliente",
  "clienteSnapshot",
  "client",
  "customer",
  "clienteId",
  "clientId",
  "customerId",
  "userId",
  "clienteNombre",
  "clienteName",
  "clientName",
  "customerName",
  "nombreContacto",
  "razonSocial",
  "companyName",
  "clienteEmail",
  "emailCliente",
  "clientEmail",
  "customerEmail",
  "email",
  "avatarUrl",
  "clienteAvatar",
  "clientAvatarUrl",
  "ticketId",
  "incidenciaId",
  "relatedTicketId",
  "relatedIncidentId",
  "ticketIds",
  "incidenciaIds",
  "incidencia",
  "ticket",
  "relations",
  "formaPago",
  "metodoPago",
  "paymentMethod",
  "fechaServicio",
  "serviceDate",
  "sentTo",
  "enviadoA",
  "recipientEmail",
  "sentAt",
  "fechaEnvio",
  "delivery",
  "file",
  "pdf",
  "document",
  "hasPdf",
  "pdfAvailable",
  "pdfUrl",
  "viewUrl",
  "downloadUrl",
  "signedUrl",
  "sasUrl",
]);

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function object(value, fallback = null) {
  return isObject(value) ? value : fallback;
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function key(value = "") {
  return text(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s.-]+/g, "_")
    .replace(/[^\w:]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;
    return value;
  }

  return null;
}

function empty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || typeof value === "object") return null;

  let normalized = String(value)
    .trim()
    .replace(/[€$£¥%]/g, "")
    .replace(/[^\d.,+\-\s]/g, "")
    .replace(/\s+/g, "");

  if (!normalized || normalized === "+" || normalized === "-") return null;

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(/,/g, ".")
      : normalized.replace(/,/g, "");
  } else if (hasComma) {
    normalized = normalized.replace(/,/g, ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function isFacturaModalTechnicalRecord(value = null) {
  const source = object(value);
  if (!source) return false;

  for (const candidate of [source.id, source._id, source.operationId]) {
    if (text(candidate, "").startsWith(FACTURA_CREATE_IDEMPOTENCY_PREFIX)) {
      return true;
    }
  }

  for (const candidate of [
    source.tipoDocumento,
    source.entityType,
    source.tipo,
    source.type,
    source.documentType,
    source.recordType,
  ]) {
    if (TECHNICAL_TYPES.has(key(candidate))) return true;
  }

  return Boolean(
    key(source.operation) === "factura_create" &&
      (
        text(source.operationHash, "") ||
        key(first(
          source.version,
          source.idempotencyVersion,
          source.meta?.idempotencyVersion,
          ""
        )).includes("idempotency")
      )
  );
}

function looksLikeCanonicalFactura(value = null) {
  const source = object(value);
  if (!source || isFacturaModalTechnicalRecord(source)) return false;

  const id = text(first(
    source.id,
    source.facturaId,
    source.invoiceId,
    source.numeroFacturaLegal,
    source.legalNumber,
    ""
  ), "");

  if (!id) return false;

  return Boolean(
    source.tipoDocumento ||
      source.entityType ||
      source.numeroFacturaLegal ||
      source.legalNumber ||
      source.total !== undefined ||
      source.totalFactura !== undefined ||
      source.baseImponible !== undefined ||
      source.pendingAmount !== undefined ||
      source.pendiente !== undefined ||
      Array.isArray(source.lineas) ||
      Array.isArray(source.impuestos)
  );
}

function snapshotCandidates(envelope = null) {
  const source = object(envelope);
  if (!source) return [];

  return [
    source.factura,
    source.invoice,
    source.item,
    source.data?.factura,
    source.data?.invoice,
    source.data?.item,
    source.data,
    source.payload?.factura,
    source.payload?.invoice,
    source.payload?.item,
    source.payload,
    source.result?.factura,
    source.result?.invoice,
    source.result?.item,
    source.result,
  ].map((value) => object(value)).filter(Boolean);
}

function findCanonicalSnapshot(value = null, depth = 0, seen = new Set()) {
  const source = object(value);
  if (!source || depth > 4 || seen.has(source)) return null;
  seen.add(source);

  const envelopes = [
    source.responseSnapshot,
    source.resultSnapshot,
    source.snapshot,
    source.meta?.responseSnapshot,
    source.meta?.resultSnapshot,
    source.meta?.createIdempotency?.responseSnapshot,
    source.createIdempotency?.responseSnapshot,
  ];

  for (const envelope of envelopes) {
    for (const candidate of snapshotCandidates(envelope)) {
      if (looksLikeCanonicalFactura(candidate)) return candidate;
    }
  }

  for (const candidate of [
    source.raw,
    source.raw?.raw,
    source.data,
    source.payload,
    source.result,
    source.item,
    source.factura,
    source.invoice,
  ]) {
    const resolved = findCanonicalSnapshot(candidate, depth + 1, seen);
    if (resolved) return resolved;
  }

  return null;
}

function findTechnicalHost(value = null) {
  const source = object(value);
  if (!source) return null;

  for (const candidate of [
    source,
    source.raw,
    source.raw?.raw,
    source.data,
    source.payload,
    source.result,
    source.item,
    source.factura,
    source.invoice,
  ]) {
    if (isFacturaModalTechnicalRecord(candidate)) return candidate;
  }

  return null;
}

function fillFallbacks(target = {}, outer = {}, technical = {}) {
  const result = { ...target };

  for (const name of FALLBACK_KEYS) {
    if (!empty(result[name])) continue;
    const candidate = first(outer?.[name], technical?.[name]);
    if (!empty(candidate)) result[name] = candidate;
  }

  return result;
}

function taxAmountFromLines(value = {}) {
  const lines = Array.isArray(value.impuestos)
    ? value.impuestos
    : Array.isArray(value.taxes)
      ? value.taxes
      : [];

  let total = 0;
  let found = false;

  for (const line of lines) {
    const item = object(line);
    if (!item) continue;

    const amount = numberOrNull(first(
      item.importe,
      item.amount,
      item.total,
      item.value
    ));

    if (amount === null) continue;
    found = true;

    const taxKey = key(first(item.tipo, item.taxType, item.name, item.label, ""));
    const negative =
      taxKey.includes("irpf") ||
      taxKey.includes("retencion") ||
      taxKey.includes("withholding") ||
      key(item.sign) === "negative";

    total += negative ? -Math.abs(amount) : amount;
  }

  return found ? round2(total) : null;
}

function repairFinancialAliases(value = {}) {
  const result = { ...value };

  let base = numberOrNull(first(
    result.baseImponible,
    result.taxableBase,
    result.subtotal,
    result.base,
    result.importeBase,
    result.totales?.baseImponible,
    result.totals?.taxableBase,
    result.totales?.base,
    result.totals?.subtotal
  ));

  let taxes = numberOrNull(first(
    result.taxAmount,
    result.taxesAmount,
    result.totalImpuestos,
    result.importeImpuestos,
    result.netTaxAmount,
    result.totales?.impuestos,
    result.totals?.taxes
  ));

  if (taxes === null) taxes = taxAmountFromLines(result);

  if (taxes === null) {
    const iva = numberOrNull(first(
      result.ivaImporte,
      result.importeIva,
      result.totalIva,
      result.ivaTotal,
      isObject(result.iva) ? first(result.iva.importe, result.iva.amount) : result.iva
    ));
    const retention = numberOrNull(first(
      result.irpfImporte,
      result.importeIrpf,
      result.totalIrpf,
      result.retencion,
      result.withholdingAmount,
      isObject(result.irpf) ? first(result.irpf.importe, result.irpf.amount) : result.irpf
    ));

    if (iva !== null || retention !== null) {
      taxes = round2((iva || 0) - Math.abs(retention || 0));
    }
  }

  const paid = numberOrNull(first(
    result.paidAmount,
    result.totalPagado,
    result.pagado,
    result.payment?.paidAmount,
    result.totales?.pagado,
    result.totals?.paid
  )) ?? 0;

  const pending = numberOrNull(first(
    result.pendingAmount,
    result.totalPendiente,
    result.pendiente,
    result.outstandingAmount,
    result.amountDue,
    result.payment?.pendingAmount,
    result.totales?.pendiente,
    result.totals?.pending
  ));

  let total = numberOrNull(first(
    result.total,
    result.totalFactura,
    result.importeTotal,
    result.amount,
    result.invoiceAmount,
    result.grandTotal,
    result.totalAmount,
    result.totales?.total,
    result.totals?.total
  ));

  if ((total === null || total === 0) && base !== null && taxes !== null) {
    const calculated = round2(base + taxes);
    if (calculated !== 0) total = calculated;
  }

  if ((total === null || total === 0) && pending !== null && pending + paid !== 0) {
    total = round2(pending + paid);
  }

  if ((base === null || base === 0) && total !== null && taxes !== null) {
    const calculated = round2(total - taxes);
    if (calculated !== 0) base = calculated;
  }

  if (base !== null) {
    result.baseImponible = base;
    result.taxableBase = base;
    result.subtotal = base;
  }

  if (taxes !== null) {
    result.taxAmount = taxes;
    result.taxesAmount = taxes;
    result.totalImpuestos = taxes;
  }

  if (total !== null) {
    result.total = total;
    result.totalFactura = total;
    result.importeTotal = total;
    result.amount = total;
    result.invoiceAmount = total;
  }

  result.paidAmount = paid;
  result.pagado = paid;

  if (pending !== null) {
    result.pendingAmount = Math.max(0, pending);
    result.pendiente = Math.max(0, pending);
  } else if (total !== null) {
    result.pendingAmount = Math.max(0, round2(total - paid));
    result.pendiente = result.pendingAmount;
  }

  return result;
}

export function resolveFacturaModalCanonical(value = null) {
  const outer = object(value);
  if (!outer) return value;

  const technical = findTechnicalHost(outer);
  if (!technical) return outer;

  const snapshot =
    findCanonicalSnapshot(technical) ||
    findCanonicalSnapshot(outer);

  if (!snapshot) return null;

  const snapshotRaw = object(snapshot.raw);
  const canonicalSource =
    snapshotRaw && !isFacturaModalTechnicalRecord(snapshotRaw)
      ? { ...snapshotRaw, ...snapshot }
      : { ...snapshot };

  let canonical = fillFallbacks(canonicalSource, outer, technical);

  const canonicalId = text(first(
    canonical.id,
    canonical.facturaId,
    canonical.invoiceId,
    technical.facturaId,
    technical.invoiceId,
    ""
  ), "");

  if (!canonicalId || canonicalId.startsWith(FACTURA_CREATE_IDEMPOTENCY_PREFIX)) {
    return null;
  }

  const legalNumber = text(first(
    canonical.numeroFacturaLegal,
    canonical.legalInvoiceNumber,
    canonical.legalNumber,
    canonical.numeroLegal,
    canonical.numeroFactura,
    canonical.invoiceNumber,
    canonical.number,
    ""
  ), "");

  const systemNumber = text(first(
    canonical.numeroFacturaSistema,
    canonical.systemInvoiceNumber,
    canonical.systemNumber,
    outer.numeroFacturaSistema,
    technical.numeroFacturaSistema,
    ""
  ), "");

  canonical = repairFinancialAliases({
    ...canonical,
    id: canonicalId,
    facturaId: canonicalId,
    invoiceId: canonicalId,
    ...(legalNumber
      ? {
          numeroFacturaLegal: legalNumber,
          numeroFactura: text(first(canonical.numeroFactura, legalNumber), legalNumber),
          invoiceNumber: text(first(canonical.invoiceNumber, legalNumber), legalNumber),
          number: text(first(canonical.number, legalNumber), legalNumber),
        }
      : {}),
    ...(systemNumber ? { numeroFacturaSistema: systemNumber } : {}),
    tipoDocumento: text(first(canonical.tipoDocumento, "factura"), "factura"),
    entityType: text(first(canonical.entityType, "invoice"), "invoice"),
    type: text(first(canonical.type, "invoice"), "invoice"),
    status: text(first(canonical.status, canonical.estado, "issued"), "issued"),
    estado: text(first(canonical.estado, canonical.status, "issued"), "issued"),
    meta: {
      ...object(canonical.meta, {}),
      technicalAliasRecovered: true,
      technicalAliasId: text(technical.id, "") || null,
      technicalAliasGuardVersion: FACTURAS_MODAL_TECHNICAL_GUARD_VERSION,
    },
  });

  // El renderer legacy inspecciona `raw`; debe apuntar también al documento
  // canónico para que ningún cero o ID técnico vuelva a ganar por fallback.
  canonical.raw = { ...canonical };
  delete canonical.raw.raw;
  delete canonical.raw.responseSnapshot;
  delete canonical.raw.resultSnapshot;
  delete canonical.raw.snapshot;

  return canonical;
}

function canonicalOptions(options = {}) {
  const source = object(options, {});
  const current = first(source.factura, source.item, source.detail, null);
  const canonical = resolveFacturaModalCanonical(current);

  return {
    ...source,
    factura: canonical,
    item: null,
    detail: null,
  };
}

export function renderHeaderActions(options = {}) {
  const source = object(options, {});
  return Base.renderHeaderActions({
    ...source,
    factura: resolveFacturaModalCanonical(source.factura),
  });
}

export function renderFacturasDetailContent(options = {}) {
  const source = object(options, {});
  return Base.renderFacturasDetailContent({
    ...source,
    factura: resolveFacturaModalCanonical(source.factura),
  });
}

export const renderFacturaDetailContent = renderFacturasDetailContent;

export function renderFacturasDetailModal(options = {}) {
  return Base.renderFacturasDetailModal(canonicalOptions(options));
}

export const renderFacturaDetailModal = renderFacturasDetailModal;

export function getFacturasModalTemplateSnapshot() {
  const snapshot = Base.getFacturasModalTemplateSnapshot();

  return {
    ...snapshot,
    version: FACTURAS_MODAL_TEMPLATE_VERSION,
    technicalGuardVersion: FACTURAS_MODAL_TECHNICAL_GUARD_VERSION,
    policy: {
      ...object(snapshot?.policy, {}),
      technicalIdempotencySnapshotFirst: true,
      technicalIdNeverRendered: true,
      financialFallbackReconciled: true,
    },
  };
}

const FacturasModalTemplate = Object.freeze({
  ...BaseDefault,
  FACTURAS_MODAL_TEMPLATE_VERSION,
  FACTURAS_MODAL_TECHNICAL_GUARD_VERSION,
  isFacturaModalTechnicalRecord,
  resolveFacturaModalCanonical,
  renderHeaderActions,
  renderFacturasDetailContent,
  renderFacturaDetailContent,
  renderFacturasDetailModal,
  renderFacturaDetailModal,
  getFacturasModalTemplateSnapshot,
});

export default FacturasModalTemplate;
