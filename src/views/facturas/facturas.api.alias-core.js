/* =========================================================
   Onion Support - Facturas API · Canonical Alias Boundary

   La implementación productiva previa vive en
   facturas.api.boundary.js. Esta última frontera normaliza también los
   registros técnicos que ya fueron convertidos por capas legacy y conservan
   el origen FACTURA_CREATE_IDEMP_* dentro de `raw`.

   Invariante:
   - ninguna fila, caché, petición de detalle ni acción usa un ID técnico;
   - el alias se resuelve siempre al facturaId canónico antes de tocar HTTP;
   - si el listado contiene alias + factura real, sólo queda la factura real.
========================================================= */

import * as Boundary from "./facturas.api.boundary.js";

export * from "./facturas.api.boundary.js";

export const FACTURA_CANONICAL_ALIAS_VERSION =
  "facturas.api.canonical-alias-boundary.v2";

const TECHNICAL_PREFIX = "FACTURA_CREATE_IDEMP_";
const aliasRegistry = new Map();
const MAX_ALIAS_REGISTRY = 256;

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

function isTechnicalIdentifier(value = "") {
  return text(value, "").startsWith(TECHNICAL_PREFIX);
}

function nestedObjects(value = {}) {
  const source = object(value, {});
  return [
    source.raw,
    source.raw?.raw,
    source.data,
    source.payload,
    source.result,
    source.item,
    source.factura,
    source.invoice,
  ].map((item) => object(item)).filter(Boolean);
}

export function isFacturaTechnicalRecord(value = null) {
  const source = object(value);
  if (!source) return false;

  if (typeof Boundary.isFacturaTechnicalRecord === "function" &&
      Boundary.isFacturaTechnicalRecord(source)) {
    return true;
  }

  if ([source.id, source._id, source.operationId].some(isTechnicalIdentifier)) {
    return true;
  }

  for (const candidate of nestedObjects(source)) {
    if (typeof Boundary.isFacturaTechnicalRecord === "function" &&
        Boundary.isFacturaTechnicalRecord(candidate)) {
      return true;
    }

    if ([candidate.id, candidate._id, candidate.operationId]
      .some(isTechnicalIdentifier)) {
      return true;
    }
  }

  return false;
}

function technicalHosts(value = null, depth = 0, seen = new Set()) {
  const source = object(value);
  if (!source || depth > 5 || seen.has(source)) return [];
  seen.add(source);

  const output = [];
  if (isFacturaTechnicalRecord(source)) output.push(source);

  for (const candidate of nestedObjects(source)) {
    output.push(...technicalHosts(candidate, depth + 1, seen));
  }

  return output;
}

function canonicalSnapshot(value = null, depth = 0, seen = new Set()) {
  const source = object(value);
  if (!source || depth > 5 || seen.has(source)) return null;
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

  for (const rawEnvelope of envelopes) {
    const envelope = object(rawEnvelope);
    if (!envelope) continue;

    for (const candidate of [
      envelope.factura,
      envelope.invoice,
      envelope.item,
      envelope.data?.factura,
      envelope.data?.invoice,
      envelope.data?.item,
      envelope.data,
      envelope.payload?.factura,
      envelope.payload?.invoice,
      envelope.payload?.item,
      envelope.payload,
      envelope.result?.factura,
      envelope.result?.invoice,
      envelope.result?.item,
      envelope.result,
    ]) {
      const item = object(candidate);
      if (!item || isFacturaTechnicalRecord(item)) continue;

      const id = canonicalIdentifier(item);
      if (id) return item;
    }
  }

  for (const candidate of nestedObjects(source)) {
    const resolved = canonicalSnapshot(candidate, depth + 1, seen);
    if (resolved) return resolved;
  }

  return null;
}

function canonicalIdentifier(value = null) {
  const source = object(value);
  if (!source) return "";

  const rootId = text(source.id, "");
  if (rootId && !isTechnicalIdentifier(rootId)) return rootId;

  for (const candidate of [
    source.facturaId,
    source.invoiceId,
    source.committedFacturaId,
    source.canonicalFacturaId,
    source.numeroFacturaLegal,
    source.legalInvoiceNumber,
    source.legalNumber,
  ]) {
    const id = text(candidate, "");
    if (id && !isTechnicalIdentifier(id)) return id;
  }

  return "";
}

function rememberAlias(technicalId = "", canonicalId = "") {
  const technical = text(technicalId, "");
  const canonical = text(canonicalId, "");

  if (!isTechnicalIdentifier(technical) ||
      !canonical ||
      isTechnicalIdentifier(canonical)) {
    return canonical;
  }

  if (aliasRegistry.size >= MAX_ALIAS_REGISTRY &&
      !aliasRegistry.has(technical)) {
    aliasRegistry.delete(aliasRegistry.keys().next().value);
  }

  aliasRegistry.set(technical, canonical);
  return canonical;
}

function registerAliases(value = null, canonicalId = "") {
  for (const host of technicalHosts(value)) {
    rememberAlias(host.id, canonicalId);
    rememberAlias(host._id, canonicalId);
    rememberAlias(host.operationId, canonicalId);
  }
}

function taxesFromLines(value = {}) {
  const source = object(value, {});
  const lines = Array.isArray(source.impuestos)
    ? source.impuestos
    : Array.isArray(source.taxes)
      ? source.taxes
      : [];

  let total = 0;
  let found = false;

  for (const raw of lines) {
    const item = object(raw);
    if (!item) continue;

    const amount = numberOrNull(first(
      item.importe,
      item.amount,
      item.total,
      item.value
    ));
    if (amount === null) continue;

    found = true;
    const type = key(first(item.tipo, item.type, item.name, item.label, ""));
    const negative =
      type.includes("irpf") ||
      type.includes("retencion") ||
      type.includes("withholding") ||
      key(item.sign) === "negative";

    total += negative ? -Math.abs(amount) : amount;
  }

  return found ? round2(total) : null;
}

function normalizeFinancialAliases(value = {}) {
  const result = { ...object(value, {}) };

  let base = numberOrNull(first(
    result.baseImponible,
    result.taxableBase,
    result.subtotal,
    result.base,
    result.importeBase,
    result.totales?.baseImponible,
    result.totals?.taxableBase,
    result.totales?.base,
    result.totals?.subtotal,
    result.resumen?.baseImponible,
    result.summary?.base
  ));

  let taxes = numberOrNull(first(
    result.impuestosTotal,
    result.taxAmount,
    result.taxesAmount,
    result.totalImpuestos,
    result.importeImpuestos,
    result.netTaxAmount,
    result.totales?.impuestos,
    result.totals?.taxes,
    result.resumen?.iva,
    result.summary?.taxes
  ));

  if (taxes === null) taxes = taxesFromLines(result);

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
      result.retencionesTotal,
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
    result.totals?.total,
    result.resumen?.total,
    result.summary?.total
  ));

  if ((total === null || total === 0) && pending !== null && pending + paid !== 0) {
    total = round2(pending + paid);
  }
  if ((total === null || total === 0) && base !== null && taxes !== null) {
    const calculated = round2(base + taxes);
    if (calculated !== 0) total = calculated;
  }
  if ((base === null || base === 0) && total !== null && taxes !== null) {
    const calculated = round2(total - taxes);
    if (calculated !== 0) base = calculated;
  }

  if (base !== null) {
    result.baseImponible = base;
    result.taxableBase = base;
    result.subtotal = base;
    result.base = base;
  }
  if (taxes !== null) {
    result.impuestosTotal = taxes;
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
    result.facturaTotal = total;
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

function stripTechnicalState(value = {}) {
  const result = { ...object(value, {}) };
  delete result.responseSnapshot;
  delete result.resultSnapshot;
  delete result.snapshot;
  delete result.operationHash;
  delete result.payloadHash;
  delete result.idempotencyVersion;
  delete result.ttl;
  delete result.ownerToken;
  delete result.leaseUntil;
  delete result.lastHeartbeatAt;
  return result;
}

function canonicalRaw(value = {}) {
  const raw = stripTechnicalState(value);
  delete raw.raw;
  raw.meta = {
    ...object(raw.meta, {}),
    technicalAliasRecovered:
      raw.meta?.technicalAliasRecovered === true,
    canonicalAliasVersion: FACTURA_CANONICAL_ALIAS_VERSION,
  };
  return raw;
}

export function canonicalizeFacturaListItem(value = null) {
  const outer = object(value);
  if (!outer) return null;

  const hosts = technicalHosts(outer);
  if (!hosts.length) return outer;

  const snapshot = canonicalSnapshot(outer);
  const source = snapshot
    ? object(Boundary.normalizeFactura(snapshot), snapshot)
    : { ...outer };

  const canonicalId =
    canonicalIdentifier(source) ||
    canonicalIdentifier(outer) ||
    hosts.map(canonicalIdentifier).find(Boolean) ||
    "";

  if (!canonicalId || isTechnicalIdentifier(canonicalId)) return null;

  registerAliases(outer, canonicalId);

  const legalNumber = [
    source.numeroFacturaLegal,
    source.legalInvoiceNumber,
    source.legalNumber,
    source.numeroFactura,
    source.invoiceNumber,
    source.number,
    outer.numeroFacturaLegal,
    outer.numeroFactura,
    outer.invoiceNumber,
    outer.number,
    source.numeroFacturaSistema,
    outer.numeroFacturaSistema,
    canonicalId,
  ]
    .map((candidate) => text(candidate, ""))
    .find((candidate) => candidate && !isTechnicalIdentifier(candidate)) || canonicalId;

  const systemNumber = text(first(
    source.numeroFacturaSistema,
    source.systemInvoiceNumber,
    outer.numeroFacturaSistema,
    hosts[0]?.numeroFacturaSistema,
    ""
  ), "");

  let canonical = normalizeFinancialAliases(stripTechnicalState({
    ...source,
    id: canonicalId,
    facturaId: canonicalId,
    invoiceId: canonicalId,
    ...(legalNumber
      ? {
          numeroFacturaLegal: legalNumber,
          numeroFactura: text(first(source.numeroFactura, legalNumber), legalNumber),
          invoiceNumber: text(first(source.invoiceNumber, legalNumber), legalNumber),
          number: text(first(source.number, legalNumber), legalNumber),
        }
      : {}),
    ...(systemNumber ? { numeroFacturaSistema: systemNumber } : {}),
    tipoDocumento: "factura",
    entityType: "invoice",
    type: "invoice",
    status: ["issued", "emitida", "sent", "enviada", "paid", "pagada", "draft", "borrador"]
      .includes(key(first(source.status, source.estado, "")))
        ? text(first(source.status, source.estado), "issued")
        : "issued",
    estado: ["issued", "emitida", "sent", "enviada", "paid", "pagada", "draft", "borrador"]
      .includes(key(first(source.estado, source.status, "")))
        ? text(first(source.estado, source.status), "issued")
        : "issued",
    meta: {
      ...object(source.meta, {}),
      technicalAliasRecovered: true,
      technicalAliasId: text(first(
        hosts[0]?.id,
        hosts[0]?._id,
        hosts[0]?.operationId,
        ""
      ), "") || null,
      canonicalAliasVersion: FACTURA_CANONICAL_ALIAS_VERSION,
    },
  }));

  canonical.raw = canonicalRaw(canonical);
  return canonical;
}

function canonicalPriority(value = {}) {
  const source = object(value, {});
  if (source.meta?.technicalAliasRecovered !== true &&
      !isFacturaTechnicalRecord(source)) {
    return 2;
  }
  return 1;
}

function mergeCanonical(left = {}, right = {}) {
  const preferred = canonicalPriority(right) >= canonicalPriority(left)
    ? right
    : left;
  const fallback = preferred === right ? left : right;

  return {
    ...fallback,
    ...preferred,
    meta: {
      ...object(fallback.meta, {}),
      ...object(preferred.meta, {}),
    },
    raw: canonicalRaw(preferred),
  };
}

function canonicalItems(items = []) {
  const map = new Map();
  let filtered = 0;

  for (const raw of Array.isArray(items) ? items : []) {
    const canonical = canonicalizeFacturaListItem(raw);
    if (!canonical) {
      filtered += 1;
      continue;
    }

    const id = canonicalIdentifier(canonical);
    if (!id) {
      filtered += 1;
      continue;
    }

    if (map.has(id)) {
      map.set(id, mergeCanonical(map.get(id), canonical));
      filtered += 1;
    } else {
      map.set(id, canonical);
    }
  }

  return {
    items: [...map.values()],
    filtered,
  };
}

function canonicalizeListResponse(response = null) {
  const source = object(response);
  if (!source) return response;

  const rawItems = Array.isArray(source.items)
    ? source.items
    : Array.isArray(source.facturas)
      ? source.facturas
      : Array.isArray(source.invoices)
        ? source.invoices
        : Array.isArray(source.data)
          ? source.data
          : [];

  const result = canonicalItems(rawItems);
  if (!result.filtered &&
      result.items.every((item, index) => item === rawItems[index])) {
    return source;
  }

  const rawTotal = Number(source.total);
  const total = Number.isFinite(rawTotal)
    ? Math.max(result.items.length, rawTotal - result.filtered)
    : result.items.length;

  return {
    ...source,
    items: result.items,
    facturas: result.items,
    invoices: result.items,
    data: result.items,
    count: result.items.length,
    total,
    remoteCount: Number.isFinite(Number(source.remoteCount))
      ? Math.max(result.items.length, Number(source.remoteCount) - result.filtered)
      : total,
    totalMatched: Number.isFinite(Number(source.totalMatched))
      ? Math.max(result.items.length, Number(source.totalMatched) - result.filtered)
      : total,
    stats: Boundary.computeFacturasStats(result.items),
    meta: {
      ...object(source.meta, {}),
      canonicalAliasesReconciled: result.filtered,
      canonicalAliasVersion: FACTURA_CANONICAL_ALIAS_VERSION,
    },
  };
}

export function resolveFacturaCanonicalId(id = "", options = {}) {
  const requested = text(id, "");
  if (!requested) return "";

  if (!isTechnicalIdentifier(requested)) return requested;

  const registered = aliasRegistry.get(requested);
  if (registered) return registered;

  for (const candidate of [
    options.factura,
    options.invoice,
    options.item,
    options.data,
    options.payload,
  ]) {
    const canonical = canonicalizeFacturaListItem(candidate);
    const resolved = canonicalIdentifier(canonical);
    if (resolved) {
      rememberAlias(requested, resolved);
      return resolved;
    }
  }

  return requested;
}

function canonicalizeDetailItem(value = null) {
  const canonical = canonicalizeFacturaListItem(value);
  if (canonical) return canonical;

  const normalized = object(Boundary.normalizeFactura(value), null);
  return normalized || value;
}

export function normalizeFactura(item = {}, options = {}) {
  const normalized = Boundary.normalizeFactura(item, options);
  return canonicalizeDetailItem(normalized);
}

export function normalizeFacturasListResponse(payload = null, requestMeta = {}) {
  return canonicalizeListResponse(
    Boundary.normalizeFacturasListResponse(payload, requestMeta)
  );
}

export function normalizeFacturaDetailResponse(payload = null) {
  const normalized = Boundary.normalizeFacturaDetailResponse(payload);
  const item = canonicalizeDetailItem(normalized?.item);

  return {
    ...normalized,
    ok: Boolean(item),
    item,
    factura: item,
    data: item,
    canonicalAliasVersion: FACTURA_CANONICAL_ALIAS_VERSION,
  };
}

export function normalizeFacturaCreateResponse(payload = null) {
  const normalized = Boundary.normalizeFacturaCreateResponse(payload);
  const item = canonicalizeDetailItem(normalized?.item);

  return {
    ...normalized,
    ok: Boolean(item),
    item,
    factura: item,
    data: item,
    created: Boolean(item),
    canonicalAliasVersion: FACTURA_CANONICAL_ALIAS_VERSION,
  };
}

export async function listFacturas(options = {}) {
  const response = await Boundary.listFacturas(options);
  const canonical = canonicalizeListResponse(response);

  if (canonical !== response && canonical?.contextKey) {
    Boundary.syncFacturasListCache(canonical);
  }

  return canonical;
}

export const fetchFacturas = listFacturas;

export async function loadFacturas(options = {}) {
  const response = await listFacturas(options);
  return response?.items || [];
}

export function hydrateFacturasFromCache() {
  const source = Boundary.hydrateFacturasFromCache();
  const canonical = canonicalizeListResponse(source);

  if (canonical !== source && canonical?.contextKey) {
    return canonicalizeListResponse(
      Boundary.syncFacturasListCache(canonical)
    );
  }

  return canonical;
}

export function syncFacturasListCache(snapshot = {}) {
  const canonical = canonicalizeListResponse({
    ...object(snapshot, {}),
    items: Array.isArray(snapshot?.items) ? snapshot.items : [],
  });

  return canonicalizeListResponse(
    Boundary.syncFacturasListCache(canonical)
  );
}

export function computeFacturasStats(items = []) {
  return Boundary.computeFacturasStats(canonicalItems(items).items);
}

export function getFacturaStableId(item = {}) {
  return canonicalIdentifier(canonicalizeFacturaListItem(item)) ||
    Boundary.getFacturaStableId(item);
}

export async function fetchFacturaDetailRequest(id = "", options = {}) {
  const requestId = resolveFacturaCanonicalId(id, options);
  const response = await Boundary.fetchFacturaDetailRequest(requestId, {
    ...options,
    dedupe: options.dedupe !== false && requestId === id,
  });
  const item = canonicalizeDetailItem(response?.item);

  if (isTechnicalIdentifier(id) && item) {
    rememberAlias(id, canonicalIdentifier(item));
  }

  return {
    ...response,
    ok: Boolean(item),
    item,
    factura: item,
    data: item,
    requestedId: id,
    canonicalRequestId: requestId,
    canonicalAliasVersion: FACTURA_CANONICAL_ALIAS_VERSION,
  };
}

export const getFacturaByIdRequest = fetchFacturaDetailRequest;

export async function getFacturaById(id = "", options = {}) {
  const response = await fetchFacturaDetailRequest(id, options);
  return response.item;
}

export const detailFactura = getFacturaById;

export async function createFacturaRequest(payload = {}, options = {}) {
  const response = await Boundary.createFacturaRequest(payload, options);
  const item = canonicalizeDetailItem(response?.item);

  return {
    ...response,
    item,
    factura: item,
    data: item,
    created: Boolean(item),
    canonicalAliasVersion: FACTURA_CANONICAL_ALIAS_VERSION,
  };
}

export async function createFactura(payload = {}, options = {}) {
  const response = await createFacturaRequest(payload, options);
  let created = response.item;

  const id = canonicalIdentifier(created);
  if (id) {
    try {
      const hydrated = await getFacturaById(id, {
        ...options,
        dedupe: false,
      });
      if (hydrated) created = hydrated;
    } catch {
      // El POST ya confirmó la creación. La lista revalidará después.
    }
  }

  return canonicalizeDetailItem(created);
}

export const createInvoice = createFactura;

function canonicalActionId(id = "", payload = {}, options = {}) {
  return resolveFacturaCanonicalId(id, {
    ...options,
    factura: first(options.factura, payload.factura, payload.item, payload.data),
  });
}

export async function updateFacturaRequest(id = "", payload = {}, options = {}) {
  return Boundary.updateFacturaRequest(
    canonicalActionId(id, payload, options),
    payload,
    options
  );
}

export async function updateFactura(id = "", payload = {}, options = {}) {
  return canonicalizeDetailItem(await Boundary.updateFactura(
    canonicalActionId(id, payload, options),
    payload,
    options
  ));
}

export const updateInvoice = updateFactura;

export async function patchFacturaRequest(id = "", payload = {}, options = {}) {
  return Boundary.patchFacturaRequest(
    canonicalActionId(id, payload, options),
    payload,
    options
  );
}

export async function patchFactura(id = "", payload = {}, options = {}) {
  return canonicalizeDetailItem(await Boundary.patchFactura(
    canonicalActionId(id, payload, options),
    payload,
    options
  ));
}

export const patchInvoice = patchFactura;

export async function removeFacturaRequest(id = "", options = {}) {
  return Boundary.removeFacturaRequest(
    resolveFacturaCanonicalId(id, options),
    options
  );
}

export async function removeFactura(id = "", options = {}) {
  return Boundary.removeFactura(
    resolveFacturaCanonicalId(id, options),
    options
  );
}

export const removeInvoice = removeFactura;

export async function sendFacturaRequest(id = "", payload = {}, options = {}) {
  return Boundary.sendFacturaRequest(
    canonicalActionId(id, payload, options),
    payload,
    options
  );
}

export async function sendFactura(id = "", payload = {}, options = {}) {
  return canonicalizeDetailItem(await Boundary.sendFactura(
    canonicalActionId(id, payload, options),
    payload,
    options
  ));
}

export async function markFacturaPaidRequest(
  id = "",
  payload = {},
  options = {}
) {
  return Boundary.markFacturaPaidRequest(
    canonicalActionId(id, payload, options),
    payload,
    options
  );
}

export async function markFacturaPaid(
  id = "",
  payload = {},
  options = {}
) {
  return canonicalizeDetailItem(await Boundary.markFacturaPaid(
    canonicalActionId(id, payload, options),
    payload,
    options
  ));
}

export const markInvoicePaid = markFacturaPaid;

export async function viewFacturaPdfRequest(id = "", options = {}) {
  return Boundary.viewFacturaPdfRequest(
    resolveFacturaCanonicalId(id, options),
    options
  );
}

export async function downloadFacturaPdfRequest(id = "", options = {}) {
  return Boundary.downloadFacturaPdfRequest(
    resolveFacturaCanonicalId(id, options),
    options
  );
}

export async function fetchFacturaPdfRequest(
  id = "",
  mode = Boundary.FACTURA_PDF_MODES.DOWNLOAD,
  options = {}
) {
  const normalizedMode = key(mode);
  return ["view", "inline", "ver", "open", "preview"].includes(normalizedMode)
    ? viewFacturaPdfRequest(id, options)
    : downloadFacturaPdfRequest(id, options);
}

export const downloadFactura = downloadFacturaPdfRequest;
export const viewFactura = viewFacturaPdfRequest;

export const FacturasApi = Object.freeze({
  ...Boundary.default,
  ...Boundary,
  FACTURA_CANONICAL_ALIAS_VERSION,
  isFacturaTechnicalRecord,
  canonicalizeFacturaListItem,
  resolveFacturaCanonicalId,
  normalizeFactura,
  normalizeFacturasListResponse,
  normalizeFacturaDetailResponse,
  normalizeFacturaCreateResponse,
  listFacturas,
  fetchFacturas,
  loadFacturas,
  hydrateFacturasFromCache,
  syncFacturasListCache,
  computeFacturasStats,
  getFacturaStableId,
  fetchFacturaDetailRequest,
  getFacturaByIdRequest,
  getFacturaById,
  detailFactura,
  createFacturaRequest,
  createFactura,
  createInvoice,
  updateFacturaRequest,
  updateFactura,
  updateInvoice,
  patchFacturaRequest,
  patchFactura,
  patchInvoice,
  removeFacturaRequest,
  removeFactura,
  removeInvoice,
  sendFacturaRequest,
  sendFactura,
  markFacturaPaidRequest,
  markFacturaPaid,
  markInvoicePaid,
  viewFacturaPdfRequest,
  downloadFacturaPdfRequest,
  fetchFacturaPdfRequest,
  downloadFactura,
  viewFactura,
});

export default FacturasApi;
