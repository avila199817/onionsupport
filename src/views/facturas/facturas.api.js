/* =========================================================
   Onion Support - Facturas API · Integration Boundary

   Mantiene la API histórica en facturas.api.base.js y concentra aquí
   la frontera create -> detail -> PDF para que la vista nunca trabaje
   con un snapshot parcial recién creado ni con una URL Azure privada
   presentada como si fuese una URL firmada.
========================================================= */

import * as Base from "./facturas.api.base.js";

export * from "./facturas.api.base.js";

export const FACTURAS_DOCUMENT_FLOW_VERSION =
  "facturas.api.document-flow.v1";

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

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
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
  const source = object(item);
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
    documentFlowVersion: FACTURAS_DOCUMENT_FLOW_VERSION,
  };
}

function facturaId(item = {}) {
  return text(first(
    item?.id,
    item?.facturaId,
    item?.invoiceId,
    item?.numeroFacturaLegal,
    item?.numeroFactura,
    item?.invoiceNumber,
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
