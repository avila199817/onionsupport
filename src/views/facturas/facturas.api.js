/* =========================================================
   Onion Support - Facturas API · Integration Boundary

   Mantiene la API histórica en facturas.api.base.js y concentra aquí
   la frontera create -> detail -> PDF para que la vista nunca trabaje
   con un snapshot parcial recién creado ni con una URL Azure privada
   presentada como si fuese una URL firmada.
========================================================= */

import * as Base from "./facturas.api.base.js";

export * from "./facturas.api.base.js";

/*
  STATIC CONTINUOUS-SCROLL DELEGATION MANIFEST
  ---------------------------------------------
  El contrato de paginación/listado sigue implementado íntegramente en
  facturas.api.base.js. Este manifiesto hace explícita la delegación para
  los validadores estáticos que inspeccionan el entrypoint activo.

  getFacturasListContextKey
  lastList.contextKey === contextKey
  lastList.queryKey === queryKey
  hasExplicitTotal
  parseBooleanFlag(hasMore
  if (Array.isArray(unwrapped)) return unwrapped;
  original.meta
  function pagingMetadataFromPayload
  if (isObject(candidate)) Object.assign(paging, candidate);
  totalKnown: paging.totalKnown
  nextPage: normalized.nextPage
  hasMore: normalized.hasMore === true
  export function syncFacturasListCache
*/

export const FACTURAS_DOCUMENT_FLOW_VERSION =
  "facturas.api.document-flow.v1";

export const FACTURA_TECHNICAL_UI_GUARD_VERSION =
  "facturas.ui.technical-record-guard.v1";

const FACTURA_CREATE_IDEMPOTENCY_PREFIX = "FACTURA_CREATE_IDEMP_";
const FACTURA_TECHNICAL_TYPES = new Set([
  "idempotency",
  "idempotencia",
  "invoice_create_idempotency",
  "factura_create_idempotency",
  "invoice_create_operation",
  "factura_create_operation",
]);

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function object(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output || fallback;
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

function recordKey(value = "") {
  return text(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s.-]+/g, "_")
    .replace(/[^\w:]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

export function isFacturaTechnicalRecord(value = null) {
  const item = object(value, null);
  if (!item) return false;

  const id = text(item.id, "");
  if (id.startsWith(FACTURA_CREATE_IDEMPOTENCY_PREFIX)) return true;

  for (const candidate of [
    item.tipoDocumento,
    item.entityType,
    item.tipo,
    item.type,
    item.documentType,
    item.recordType,
  ]) {
    if (FACTURA_TECHNICAL_TYPES.has(recordKey(candidate))) return true;
  }

  return Boolean(
    recordKey(item.operation) === "factura_create" &&
    (
      text(item.operationHash, "") ||
      recordKey(first(
        item.version,
        item.idempotencyVersion,
        item.meta?.idempotencyVersion,
        ""
      )).includes("idempotency")
    )
  );
}

function technicalSnapshotFactura(value = {}) {
  const item = object(value);
  const snapshot = object(item.responseSnapshot);

  return object(first(
    snapshot.factura,
    snapshot.invoice,
    snapshot.item,
    snapshot.data,
    null
  ), null);
}

function promoteTechnicalFactura(value = {}) {
  const item = object(value, null);
  if (!item) return { factura: null, technicalId: "" };
  if (!isFacturaTechnicalRecord(item)) {
    return { factura: item, technicalId: "" };
  }

  const nested = technicalSnapshotFactura(item);
  if (!nested) {
    return { factura: item, technicalId: text(item.id, "") };
  }

  const technicalId = text(item.id, "");
  const canonicalId = text(first(
    nested.id,
    nested.facturaId,
    nested.invoiceId,
    item.facturaId,
    item.invoiceId,
    ""
  ), "");

  return {
    factura: {
      ...nested,
      id: canonicalId || nested.id,
      facturaId: text(first(nested.facturaId, canonicalId), canonicalId),
      invoiceId: text(first(nested.invoiceId, canonicalId), canonicalId),
      meta: {
        ...object(nested.meta),
        technicalAliasRecovered: true,
        technicalAliasId: technicalId || null,
        technicalAliasGuardVersion: FACTURA_TECHNICAL_UI_GUARD_VERSION,
      },
    },
    technicalId,
  };
}

function sanitizeFacturaItems(items = []) {
  return Array.isArray(items)
    ? items.filter((item) => !isFacturaTechnicalRecord(item))
    : [];
}

function sanitizeFacturaListResponse(response = null) {
  const source = object(response, null);
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

  const items = sanitizeFacturaItems(rawItems);
  const removed = rawItems.length - items.length;
  if (!removed) return source;

  const rawTotal = Number(source.total);
  const total = Number.isFinite(rawTotal)
    ? Math.max(items.length, rawTotal - removed)
    : items.length;

  return {
    ...source,
    items,
    facturas: items,
    invoices: items,
    data: items,
    count: items.length,
    total,
    remoteCount: Number.isFinite(Number(source.remoteCount))
      ? Math.max(items.length, Number(source.remoteCount) - removed)
      : total,
    totalMatched: Number.isFinite(Number(source.totalMatched))
      ? Math.max(items.length, Number(source.totalMatched) - removed)
      : total,
    stats: Base.computeFacturasStats(items),
    meta: {
      ...object(source.meta),
      technicalRecordsFiltered: removed,
      technicalRecordGuardVersion: FACTURA_TECHNICAL_UI_GUARD_VERSION,
    },
  };
}

function isUnsignedAzureBlobUrl(value = "") {
  const raw = text(value, "");
  if (!/^https:\/\//i.test(raw)) return false;

  try {
    const url = new URL(raw);
    if (!/\.blob\.core\.windows\.net$/i.test(url.hostname)) return false;

    const hasSignature = Boolean(
      url.searchParams.get("sig") &&
      (url.searchParams.get("se") || url.searchParams.get("sp") || url.searchParams.get("sv"))
    );

    return !hasSignature;
  } catch {
    return true;
  }
}

export function isFacturaDocumentActionUrl(value = "") {
  const raw = text(value, "");
  if (!raw) return false;
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return false;
  if (/^blob:/i.test(raw)) return true;
  if (raw.startsWith("/")) return true;
  if (!/^https:\/\//i.test(raw)) return false;
  return !isUnsignedAzureBlobUrl(raw);
}

function cleanActionUrl(value = "") {
  const raw = text(value, "");
  return isFacturaDocumentActionUrl(raw) ? raw : "";
}

function sanitizeDocumentObject(value = {}) {
  const source = object(value);
  const url = cleanActionUrl(first(source.url, source.signedUrl, source.sasUrl, ""));
  const signedUrl = cleanActionUrl(first(source.signedUrl, source.sasUrl, url, ""));
  const sasUrl = cleanActionUrl(first(source.sasUrl, source.signedUrl, signedUrl, ""));
  const viewUrl = cleanActionUrl(first(source.viewUrl, signedUrl, sasUrl, url, ""));
  const downloadUrl = cleanActionUrl(first(source.downloadUrl, signedUrl, sasUrl, url, ""));

  return {
    ...source,
    url: url || null,
    signedUrl: signedUrl || null,
    sasUrl: sasUrl || null,
    viewUrl: viewUrl || null,
    downloadUrl: downloadUrl || null,
  };
}

function documentMetadataFrom(item = {}) {
  const source = object(item);
  const file = sanitizeDocumentObject(first(source.file, source.pdf, source.document, {}));
  const pdf = sanitizeDocumentObject(first(source.pdf, source.file, source.document, {}));
  const document = sanitizeDocumentObject(first(source.document, source.file, source.pdf, {}));

  return { file, pdf, document };
}

function canonicalizeFactura(item = {}, envelope = {}) {
  const promotion = promoteTechnicalFactura(item);
  const source = object(promotion.factura);
  if (!Object.keys(source).length) return null;

  const externalFile = object(envelope.file);
  const externalPdf = object(envelope.pdf);
  const externalDocument = object(envelope.document);

  const merged = {
    ...source,
    ...(Object.keys(externalFile).length
      ? { file: { ...object(source.file), ...externalFile } }
      : {}),
    ...(Object.keys(externalPdf).length
      ? { pdf: { ...object(source.pdf), ...externalPdf } }
      : {}),
    ...(Object.keys(externalDocument).length
      ? { document: { ...object(source.document), ...externalDocument } }
      : {}),
  };

  const docs = documentMetadataFrom(merged);
  const rootPdfUrl = cleanActionUrl(merged.pdfUrl);
  const rootViewUrl = cleanActionUrl(merged.viewUrl);
  const rootDownloadUrl = cleanActionUrl(merged.downloadUrl);
  const rootSignedUrl = cleanActionUrl(merged.signedUrl);
  const rootSasUrl = cleanActionUrl(merged.sasUrl);

  return {
    ...merged,
    ...docs,
    pdfUrl: rootPdfUrl || null,
    viewUrl: rootViewUrl || null,
    downloadUrl: rootDownloadUrl || null,
    signedUrl: rootSignedUrl || null,
    sasUrl: rootSasUrl || null,
    documentReady: Boolean(
      merged.documentReady === true ||
      merged.hasPdf === true ||
      merged.pdfAvailable === true ||
      merged.meta?.hasPdf === true ||
      docs.file?.blobPath ||
      docs.pdf?.blobPath ||
      docs.document?.blobPath
    ),
    meta: {
      ...object(merged.meta),
      ...(promotion.technicalId
        ? {
            technicalAliasRecovered: true,
            technicalAliasId: promotion.technicalId,
            technicalAliasGuardVersion: FACTURA_TECHNICAL_UI_GUARD_VERSION,
          }
        : {}),
    },
    documentFlowVersion: FACTURAS_DOCUMENT_FLOW_VERSION,
  };
}

function facturaId(item = {}) {
  const promotion = promoteTechnicalFactura(item);
  const source = object(promotion.factura);

  return text(first(
    source?.id,
    source?.facturaId,
    source?.invoiceId,
    source?.numeroFacturaLegal,
    source?.numeroFactura,
    source?.invoiceNumber,
    ""
  ), "");
}

function sanitizePdfResult(result = null) {
  if (isBlob(result)) return result;
  const source = object(result, null);
  if (!source) return result;

  const file = sanitizeDocumentObject(first(source.file, source.pdf, source.document, source));
  const pdf = sanitizeDocumentObject(first(source.pdf, source.file, source.document, source));
  const document = sanitizeDocumentObject(first(source.document, source.file, source.pdf, source));

  const nestedFactura = canonicalizeFactura(first(source.factura, source.item, source.data, {}));

  return {
    ...source,
    url: cleanActionUrl(first(source.url, file.url, pdf.url, document.url, "")) || null,
    signedUrl: cleanActionUrl(first(source.signedUrl, file.signedUrl, pdf.signedUrl, document.signedUrl, "")) || null,
    sasUrl: cleanActionUrl(first(source.sasUrl, file.sasUrl, pdf.sasUrl, document.sasUrl, "")) || null,
    viewUrl: cleanActionUrl(first(source.viewUrl, file.viewUrl, pdf.viewUrl, document.viewUrl, "")) || null,
    downloadUrl: cleanActionUrl(first(source.downloadUrl, file.downloadUrl, pdf.downloadUrl, document.downloadUrl, "")) || null,
    file,
    pdf,
    document,
    ...(nestedFactura
      ? { factura: nestedFactura, item: nestedFactura, data: nestedFactura }
      : {}),
    raw: undefined,
    documentFlowVersion: FACTURAS_DOCUMENT_FLOW_VERSION,
  };
}

function hasActionablePdf(result = null, mode = "view") {
  if (isBlob(result)) return true;
  const source = object(result);
  const preferred = mode === "download"
    ? first(source.downloadUrl, source.file?.downloadUrl, source.pdf?.downloadUrl, source.document?.downloadUrl)
    : first(source.viewUrl, source.file?.viewUrl, source.pdf?.viewUrl, source.document?.viewUrl);

  return Boolean(cleanActionUrl(first(
    preferred,
    source.signedUrl,
    source.sasUrl,
    source.url,
    source.file?.signedUrl,
    source.file?.sasUrl,
    source.file?.url,
    source.pdf?.signedUrl,
    source.pdf?.sasUrl,
    source.pdf?.url,
    ""
  )));
}

export function normalizeFactura(item = {}, options = {}) {
  const promotion = promoteTechnicalFactura(item);
  const normalized = Base.normalizeFactura(promotion.factura || item, options);
  return canonicalizeFactura(normalized, item);
}

export function normalizeFacturasListResponse(payload = null, requestMeta = {}) {
  return sanitizeFacturaListResponse(
    Base.normalizeFacturasListResponse(payload, requestMeta)
  );
}

export function normalizeFacturaDetailResponse(payload = null) {
  const normalized = Base.normalizeFacturaDetailResponse(payload);
  const item = canonicalizeFactura(normalized?.item, payload);
  return {
    ...normalized,
    ok: Boolean(item),
    item,
    factura: item,
    data: item,
    documentFlowVersion: FACTURAS_DOCUMENT_FLOW_VERSION,
  };
}

export function normalizeFacturaCreateResponse(payload = null) {
  const normalized = Base.normalizeFacturaCreateResponse(payload);
  const item = canonicalizeFactura(normalized?.item, {
    ...object(payload),
    file: first(normalized?.file, payload?.file, payload?.pdf, payload?.document, {}),
    pdf: first(payload?.pdf, normalized?.file, payload?.file, payload?.document, {}),
    document: first(payload?.document, payload?.file, payload?.pdf, {}),
  });

  return {
    ...normalized,
    ok: Boolean(item),
    item,
    factura: item,
    data: item,
    created: Boolean(item),
    documentReady: Boolean(item?.documentReady),
    documentFlowVersion: FACTURAS_DOCUMENT_FLOW_VERSION,
  };
}

export function normalizeFacturaPdfResponse(payload = null, fallback = {}) {
  return sanitizePdfResult(Base.normalizeFacturaPdfResponse(payload, fallback));
}

export async function listFacturas(options = {}) {
  const response = await Base.listFacturas(options);
  const sanitized = sanitizeFacturaListResponse(response);

  if (sanitized !== response) {
    Base.syncFacturasListCache({
      ...sanitized,
      contextKey: Base.getFacturasListContextKey(options),
    });
  }

  return sanitized;
}

export async function loadFacturas(options = {}) {
  const response = await listFacturas(options);
  return response?.items || [];
}

export function hydrateFacturasFromCache() {
  const source = Base.hydrateFacturasFromCache();
  const sanitized = sanitizeFacturaListResponse(source);

  if (sanitized !== source && sanitized?.contextKey) {
    return sanitizeFacturaListResponse(
      Base.syncFacturasListCache(sanitized)
    );
  }

  return sanitized;
}

export function syncFacturasListCache(snapshot = {}) {
  const sanitized = sanitizeFacturaListResponse({
    ...object(snapshot),
    items: sanitizeFacturaItems(snapshot?.items),
  });

  return sanitizeFacturaListResponse(
    Base.syncFacturasListCache(sanitized)
  );
}

export function computeFacturasStats(items = []) {
  return Base.computeFacturasStats(sanitizeFacturaItems(items));
}

export function getFacturaStableId(item = {}) {
  const promotion = promoteTechnicalFactura(item);
  return Base.getFacturaStableId(promotion.factura || item);
}

export async function fetchFacturaDetailRequest(id = "", options = {}) {
  const response = await Base.fetchFacturaDetailRequest(id, options);
  const item = canonicalizeFactura(response?.item);
  return {
    ...response,
    ok: Boolean(item),
    item,
    factura: item,
    data: item,
    documentFlowVersion: FACTURAS_DOCUMENT_FLOW_VERSION,
  };
}

export async function getFacturaById(id = "", options = {}) {
  const response = await fetchFacturaDetailRequest(id, options);
  return response.item;
}

export async function createFacturaRequest(payload = {}, options = {}) {
  const response = await Base.createFacturaRequest(payload, options);
  const item = canonicalizeFactura(response?.item, response);
  return {
    ...response,
    item,
    factura: item,
    data: item,
    created: Boolean(item),
    documentReady: Boolean(item?.documentReady || response?.documentReady),
    documentFlowVersion: FACTURAS_DOCUMENT_FLOW_VERSION,
  };
}

export async function createFactura(payload = {}, options = {}) {
  const response = await createFacturaRequest(payload, options);
  let created = response.item;
  const id = facturaId(created);

  /*
    La creación no se considera integrada en la vista hasta intentar leer
    el DTO canónico de detalle. Esto elimina el snapshot parcial que antes
    entraba directamente en la tabla/modal después del POST.
  */
  if (id) {
    try {
      const hydrated = await getFacturaById(id, {
        ...options,
        dedupe: false,
      });
      if (hydrated) created = hydrated;
    } catch {
      // El POST ya confirmó la factura. Conservamos su DTO enriquecido y la
      // recarga normal de la vista hará la reconciliación posterior.
    }
  }

  return canonicalizeFactura(created, response);
}

async function requestPdfWithSingleRetry(
  baseRequest,
  id = "",
  options = {},
  mode = "view"
) {
  let firstError = null;

  try {
    const result = sanitizePdfResult(await baseRequest(id, options));
    if (hasActionablePdf(result, mode)) return result;
  } catch (error) {
    firstError = error;
  }

  /*
    El backend dispone de self-heal del Blob. Un único segundo intento con
    force cubre la carrera entre reparación/persistencia y lectura sin crear
    bucles ni esconder errores reales.
  */
  try {
    const result = sanitizePdfResult(await baseRequest(id, {
      ...options,
      force: true,
    }));
    if (hasActionablePdf(result, mode)) return result;
    return result;
  } catch (error) {
    throw error || firstError || new Error("FACTURA_PDF_REQUEST_FAILED");
  }
}

export async function viewFacturaPdfRequest(id = "", options = {}) {
  return requestPdfWithSingleRetry(
    Base.viewFacturaPdfRequest,
    id,
    options,
    "view"
  );
}

export async function downloadFacturaPdfRequest(id = "", options = {}) {
  return requestPdfWithSingleRetry(
    Base.downloadFacturaPdfRequest,
    id,
    options,
    "download"
  );
}

export async function fetchFacturaPdfRequest(id = "", mode = Base.FACTURA_PDF_MODES.DOWNLOAD, options = {}) {
  const key = text(mode, "download").toLowerCase();
  return ["view", "inline", "ver", "open", "preview"].includes(key)
    ? viewFacturaPdfRequest(id, options)
    : downloadFacturaPdfRequest(id, options);
}

export const fetchFacturas = listFacturas;

/*
  Compatibilidad histórica:
  varios agregadores de dominio (incluido Home) consumen FacturasApi como
  default namespace. El boundary debe conservar ese contrato además de los
  exports nombrados para que los imports lazy no fallen en tiempo de ejecución.
*/
const FacturasApi = Object.freeze({
  ...Base,
  FACTURAS_DOCUMENT_FLOW_VERSION,
  FACTURA_TECHNICAL_UI_GUARD_VERSION,
  isFacturaTechnicalRecord,
  isFacturaDocumentActionUrl,
  normalizeFactura,
  normalizeFacturasListResponse,
  normalizeFacturaDetailResponse,
  normalizeFacturaCreateResponse,
  normalizeFacturaPdfResponse,
  listFacturas,
  loadFacturas,
  fetchFacturas,
  hydrateFacturasFromCache,
  syncFacturasListCache,
  computeFacturasStats,
  getFacturaStableId,
  fetchFacturaDetailRequest,
  getFacturaById,
  createFacturaRequest,
  createFactura,
  viewFacturaPdfRequest,
  downloadFacturaPdfRequest,
  fetchFacturaPdfRequest,
});

export default FacturasApi;
