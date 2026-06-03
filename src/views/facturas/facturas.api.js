/* =========================================================
   Onion Support - Facturas API
   Archivo: /src/views/facturas/facturas.api.js

   PRODUCTIVO v4:
   - HTTP único vía core/http.js.
   - Sin DOM, sin Router, sin Store, sin fetch propio.
   - Listado paginado backend-first.
   - Cache runtime ligera + dedupe de inflight.
   - DTOs normalizados para la vista.
   - PDF cerrado: pide JSON al backend con json=true y resuelve SAS
     anidada file/pdf/blob sin eliminar query sig/SAS.
========================================================= */

import Http from "../../core/http.js";

export const FACTURAS_API_VERSION = "facturas.api.production.v4.pdf-sas-safe";

/* =========================================================
   ENDPOINTS / TIMEOUTS
========================================================= */

export const FACTURAS_ENDPOINT = "/api/facturas";
export const FACTURAS_TICKETS_ENDPOINT = "/api/tickets";

export const FACTURAS_TIMEOUT = 15000;
export const FACTURAS_LIST_TIMEOUT = 18000;
export const FACTURAS_DETAIL_TIMEOUT = 18000;
export const FACTURAS_CREATE_TIMEOUT = 45000;
export const FACTURAS_PDF_TIMEOUT = 45000;
export const FACTURAS_SEND_TIMEOUT = 30000;

export const FACTURAS_DEFAULT_PAGE = 1;
export const FACTURAS_DEFAULT_LIMIT = 100;
export const FACTURAS_MAX_LIMIT = 200;

const DEFAULT_CURRENCY = "EUR";
const MAX_INFLIGHT_REQUESTS = 24;
const PDF_JSON_QUERY = Object.freeze({ json: true, meta: true });

export const FACTURA_PDF_MODES = Object.freeze({
  VIEW: "view",
  INLINE: "inline",
  DOWNLOAD: "download",
  ATTACHMENT: "attachment",
});

/* =========================================================
   RUNTIME CACHE
========================================================= */

let loading = false;
let lastLoadedAt = null;
let lastError = null;
let lastStats = null;

let lastList = {
  items: [],
  total: 0,
  queryKey: "",
};

const inflight = new Map();

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return fallback;

  if (typeof value === "string") {
    let clean = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    if (!clean || clean === "-" || clean === "+") return fallback;

    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");

    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");

      clean = lastComma > lastDot
        ? clean.replace(/\./g, "").replace(/,/g, ".")
        : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean = clean.replace(/,/g, ".");
    }

    const parsed = Number(clean);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value = 0) {
  const parsed = number(value, 0);
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function redact(value = "") {
  return String(value ?? "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
    String(value || "")
  );
}

function safePublicText(value = "", fallback = "") {
  const text = redact(cleanText(value, ""));
  if (!text) return fallback;
  if (hasSensitiveQuery(text)) return fallback;
  return text;
}

function safeFilename(value = "", fallback = "factura") {
  const clean = cleanText(value, fallback)
    .replace(/[\\/:*?"<>|#]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 180);

  return clean || fallback;
}

function ensurePdfFilename(value = "", fallback = "factura.pdf") {
  const filename = safeFilename(value, fallback.replace(/\.pdf$/i, ""));
  return filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
}

function isSafeHttpUrl(value = "", { allowBlob = true } = {}) {
  const raw = cleanText(value, "");
  if (!raw) return false;
  if (raw.startsWith("//")) return false;
  if (/[\r\n\t\\]/.test(raw)) return false;
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return false;
  if (allowBlob && /^blob:/i.test(raw)) return true;
  if (!/^https:\/\//i.test(raw)) return false;

  try {
    const url = new URL(raw);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function safePublicUrl(value = "") {
  const raw = cleanText(value, "");
  if (!isSafeHttpUrl(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";
  return raw.startsWith("/") ? raw.replace(/\/{2,}/g, "/") : raw;
}

function safeSignedPdfUrl(value = "") {
  const raw = cleanText(value, "");
  if (!isSafeHttpUrl(raw)) return "";
  return raw;
}

function isPdfUrl(value = "") {
  const raw = cleanText(value, "");
  return Boolean(
    raw &&
      (
        /\.pdf(?:[?#]|$)/i.test(raw) ||
        /rsct=application%2Fpdf/i.test(raw) ||
        /rsct=application\/pdf/i.test(raw)
      )
  );
}

function toTimestamp(value = null) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value > 9999999999 ? value : value * 1000;

  const raw = cleanText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 9999999999 ? numeric : numeric * 1000;

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  const time = date.getTime();

  return Number.isFinite(time) ? time : 0;
}

function stableStringify(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${key}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function setInflight(key = "", promise = null) {
  if (!key || !promise) return promise;

  if (inflight.size >= MAX_INFLIGHT_REQUESTS) {
    inflight.delete(inflight.keys().next().value);
  }

  inflight.set(key, promise);

  promise.then(
    () => {
      if (inflight.get(key) === promise) inflight.delete(key);
    },
    () => {
      if (inflight.get(key) === promise) inflight.delete(key);
    }
  );

  return promise;
}

/* =========================================================
   ENDPOINT BUILDERS
========================================================= */

export function normalizeFacturaId(id = "") {
  const value = cleanText(id, "");
  if (!value) throw new Error("FACTURA_ID_REQUIRED");
  return value;
}

function encodeSegment(value = "") {
  return encodeURIComponent(normalizeFacturaId(value));
}

export function getFacturaEndpoint(id = "") {
  return `${FACTURAS_ENDPOINT}/${encodeSegment(id)}`;
}

export function getFacturaViewEndpoint(id = "") {
  return `${getFacturaEndpoint(id)}/view`;
}

export function getFacturaDownloadEndpoint(id = "") {
  return `${getFacturaEndpoint(id)}/download`;
}

export function getFacturaSendEndpoint(id = "") {
  return `${getFacturaEndpoint(id)}/send`;
}

export function getFacturaPdfEndpoint(id = "", mode = FACTURA_PDF_MODES.DOWNLOAD) {
  const normalized = normalizeKey(mode);
  return ["view", "inline", "ver", "open", "preview"].includes(normalized)
    ? getFacturaViewEndpoint(id)
    : getFacturaDownloadEndpoint(id);
}

/* =========================================================
   QUERY
========================================================= */

function cleanQueryValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";

  const text = cleanText(value, "");
  if (!text) return "";
  if (hasSensitiveQuery(text)) return "";
  return text;
}

function normalizeSortMode(value = "") {
  const key = normalizeKey(value);
  if (["date_asc", "fecha_asc", "oldest", "oldest_first", "menor_fecha", "asc", "ascending"].includes(key)) return "date_asc";
  return "date_desc";
}

function resolveSort({ sort = "", sortBy = "", orderBy = "", sortMode = "", direction = "", sortDir = "", orderDir = "" } = {}) {
  const rawSort = cleanText(first(sortMode, sortBy, sort, orderBy, "date_desc"), "date_desc");
  const sortKey = normalizeKey(rawSort);
  const rawDirection = normalizeKey(first(sortDir, direction, orderDir, ""));

  if (["numero", "number", "invoice", "invoice_number", "factura", "numero_factura", "total", "amount", "importe", "cliente", "customer", "client", "estado_pago", "payment_status", "payment"].includes(sortKey)) {
    const finalDirection = rawDirection === "asc" ? "asc" : "desc";
    return { sort: sortKey, sortBy: sortKey, sortMode: sortKey, direction: finalDirection, sortDir: finalDirection };
  }

  const mode = normalizeSortMode(rawSort);
  const directionFromMode = mode.endsWith("_asc") ? "asc" : "desc";
  const finalDirection = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : directionFromMode;

  return { sort: mode, sortBy: mode, sortMode: mode, direction: finalDirection, sortDir: finalDirection };
}

function buildListQuery({
  page = FACTURAS_DEFAULT_PAGE,
  limit = FACTURAS_DEFAULT_LIMIT,
  search = "",
  q = "",
  sort = "date_desc",
  direction = "desc",
  sortBy = "",
  sortDir = "",
  orderBy = "",
  orderDir = "",
  sortMode = "",
  includeStats = true,
  includeStatsAll = false,
  filters = {},
} = {}) {
  const query = {};

  query.page = Math.max(1, number(page, FACTURAS_DEFAULT_PAGE));
  query.limit = Math.min(Math.max(1, number(limit, FACTURAS_DEFAULT_LIMIT)), FACTURAS_MAX_LIMIT);

  const finalSearch = cleanText(first(search, q), "");
  if (finalSearch) {
    query.q = finalSearch;
    query.search = finalSearch;
  }

  Object.assign(query, resolveSort({ sort, direction, sortBy, sortDir, orderBy, orderDir, sortMode }));

  query.includeStats = Boolean(includeStats);
  if (includeStatsAll) query.includeStatsAll = true;

  const aliases = {
    paymentStatus: "estadoPago",
    estadoPago: "paymentStatus",
    status: "estado",
    estado: "status",
    incidenciaId: "ticketId",
    relatedTicketId: "ticketId",
    relatedIncidentId: "ticketId",
    month: "mes",
    mes: "month",
    fechaDesde: "from",
    fechaHasta: "to",
    hasIncidencia: "withIncidencia",
    withTicket: "withIncidencia",
    hasTicket: "withIncidencia",
    hasPdf: "withPdf",
  };

  for (const [rawKey, value] of Object.entries(safeObject(filters))) {
    const key = cleanText(rawKey, "");
    const clean = cleanQueryValue(value);

    if (!key || !clean) continue;

    query[key] = clean;
    if (aliases[key]) query[aliases[key]] = clean;
  }

  return query;
}

export function buildFacturasListEndpoint(options = {}) {
  const params = new URLSearchParams();
  const query = buildListQuery(options);

  for (const [key, value] of Object.entries(query)) {
    const clean = cleanQueryValue(value);
    if (clean) params.set(key, clean);
  }

  const qs = params.toString();
  return qs ? `${FACTURAS_ENDPOINT}?${qs}` : FACTURAS_ENDPOINT;
}

/* =========================================================
   RESPONSE UNWRAP
========================================================= */

function unwrapEnvelope(payload = null, depth = 0) {
  if (depth > 6) return payload;
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload) || isBlob(payload)) return payload;

  const object = safeObject(payload, null);
  if (!object) return payload;

  if (
    Array.isArray(object.items) ||
    Array.isArray(object.rows) ||
    Array.isArray(object.results) ||
    Array.isArray(object.records) ||
    Array.isArray(object.facturas) ||
    Array.isArray(object.invoices) ||
    object.factura ||
    object.invoice ||
    object.item ||
    object.detail ||
    object.file ||
    object.pdf ||
    object.blob
  ) {
    return object;
  }

  const nested = first(object.data, object.payload, object.result, object.response, object.body);
  if (nested !== null && nested !== undefined && nested !== payload) return unwrapEnvelope(nested, depth + 1);

  return object;
}

function listFromPayload(payload = null) {
  if (Array.isArray(payload)) return payload;

  const object = safeObject(unwrapEnvelope(payload), {});

  for (const key of ["facturas", "items", "rows", "records", "results", "docs", "documents", "value", "list", "invoices", "data"]) {
    if (Array.isArray(object[key])) return object[key];
  }

  return [];
}

function metaFromPayload(payload = null) {
  const object = safeObject(unwrapEnvelope(payload), {});
  const original = safeObject(payload, {});

  return safeObject(first(object.meta, object.paging, object.pagination, object.page, original.meta, original.paging, original.pagination, original.page, {}));
}

function totalFromPayload(payload = null, fallback = 0) {
  const object = safeObject(payload, {});
  const envelope = safeObject(unwrapEnvelope(payload), {});
  const paging = safeObject(first(envelope.paging, envelope.pagination, envelope.page, object.paging, object.pagination, object.page, {}));

  return Math.max(
    fallback,
    number(
      first(
        envelope.total,
        envelope.totalMatched,
        envelope.remoteCount,
        envelope.totalCount,
        envelope.meta?.total,
        envelope.meta?.count,
        envelope.meta?.totalCount,
        paging.total,
        paging.remoteCount,
        paging.totalCount,
        object.total,
        object.totalMatched,
        object.remoteCount,
        object.count,
        object.totalCount,
        fallback
      ),
      fallback
    )
  );
}

function pagingFromPayload(payload = null, requestMeta = {}, itemsCount = 0) {
  const envelope = safeObject(unwrapEnvelope(payload), {});
  const original = safeObject(payload, {});
  const paging = safeObject(first(envelope.paging, original.paging, envelope.pagination, original.pagination, envelope.page, original.page, {}));

  const page = number(first(envelope.page, paging.page, paging.currentPage, requestMeta.page, FACTURAS_DEFAULT_PAGE), FACTURAS_DEFAULT_PAGE);
  const limit = number(first(envelope.limit, paging.limit, paging.pageSize, requestMeta.limit, itemsCount || FACTURAS_DEFAULT_LIMIT), itemsCount || FACTURAS_DEFAULT_LIMIT);
  const total = totalFromPayload(payload, itemsCount);
  const nextPage = first(envelope.nextPage, paging.nextPage, null);
  const totalPages = number(first(envelope.totalPages, paging.totalPages, Math.ceil((total || 0) / (limit || 1))), Math.max(1, Math.ceil((total || 0) / (limit || 1))));
  const hasMore = first(envelope.hasMore, paging.hasMore, nextPage ? true : null, null);
  const offset = number(first(envelope.offset, paging.offset, requestMeta.offset, Math.max(0, (page - 1) * limit)), Math.max(0, (page - 1) * limit));

  return {
    ...paging,
    page,
    nextPage: nextPage === null || nextPage === undefined || nextPage === "" ? null : number(nextPage, null),
    totalPages,
    hasMore: hasMore === null ? itemsCount < total : Boolean(hasMore),
    offset,
    limit,
    returned: number(first(envelope.count, paging.returned, itemsCount), itemsCount),
    total,
    remoteCount: total,
    fetchLimit: number(first(envelope.fetchLimit, paging.fetchLimit, limit), limit),
    mode: cleanText(first(envelope.queryMode, paging.mode, paging.queryMode, ""), ""),
  };
}

function looksLikeFactura(value = null) {
  const item = safeObject(value, null);
  if (!item) return false;

  return Boolean(
    item.facturaId ||
      item.invoiceId ||
      item.id ||
      item._id ||
      item.numero ||
      item.number ||
      item.numeroFactura ||
      item.numeroFacturaLegal ||
      item.invoiceNumber ||
      item.total ||
      item.importe ||
      item.amount ||
      item.concepto
  );
}

function detailFromPayload(payload = null) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] || null;
  if (looksLikeFactura(payload)) return payload;

  const object = safeObject(unwrapEnvelope(payload), {});

  return first(
    looksLikeFactura(object.factura) ? object.factura : null,
    looksLikeFactura(object.invoice) ? object.invoice : null,
    looksLikeFactura(object.item) ? object.item : null,
    looksLikeFactura(object.detail) ? object.detail : null,
    looksLikeFactura(object.result) ? object.result : null,
    looksLikeFactura(object.data) ? object.data : null,
    looksLikeFactura(object.payload) ? object.payload : null,
    null
  );
}

function namedObjectFromPayload(payload = null, name = "") {
  const key = cleanText(name, "");
  if (!key) return {};

  const object = safeObject(unwrapEnvelope(payload), {});
  const original = safeObject(payload, {});

  return safeObject(first(object[key], object.data?.[key], object.payload?.[key], object.result?.[key], original[key], original.data?.[key], {}));
}

/* =========================================================
   FACTURA NORMALIZATION
========================================================= */

function getFacturaRawId(item = {}) {
  const raw = safeObject(item);
  return cleanText(first(raw.id, raw.facturaId, raw.invoiceId, raw.numeroFacturaLegal, raw.numeroFacturaSistema, raw.numeroFactura, raw.invoiceNumber, raw.number, raw.numero), "");
}

function getClientDisplayName(item = {}) {
  const raw = safeObject(item);
  const cliente = safeObject(raw.cliente);
  const snapshot = safeObject(raw.clienteSnapshot);
  const firstSnapshot = safeObject(safeArray(raw.clientesSnapshot)[0]);

  return safePublicText(
    first(
      raw.clientName,
      raw.clienteNombre,
      raw.clienteName,
      raw.customerName,
      raw.nombreCliente,
      cliente.nombreContacto,
      cliente.name,
      cliente.displayName,
      cliente.nombre,
      cliente.razonSocial,
      cliente.companyName,
      snapshot.nombreContacto,
      snapshot.name,
      snapshot.displayName,
      snapshot.razonSocial,
      firstSnapshot.nombreContacto,
      firstSnapshot.name,
      firstSnapshot.displayName,
      firstSnapshot.razonSocial
    ),
    "Cliente"
  );
}

function getCompanyName(item = {}) {
  const raw = safeObject(item);
  const cliente = safeObject(raw.cliente);
  const snapshot = safeObject(raw.clienteSnapshot);
  const firstSnapshot = safeObject(safeArray(raw.clientesSnapshot)[0]);

  return safePublicText(first(raw.razonSocial, raw.companyName, cliente.razonSocial, cliente.companyName, cliente.empresa, snapshot.razonSocial, snapshot.companyName, snapshot.empresa, firstSnapshot.razonSocial, firstSnapshot.companyName), "");
}

function getClientEmail(item = {}) {
  const raw = safeObject(item);
  const cliente = safeObject(raw.cliente);
  const snapshot = safeObject(raw.clienteSnapshot);
  const email = cleanText(first(raw.clienteEmail, raw.emailCliente, raw.clientEmail, raw.customerEmail, raw.email, raw.enviadoA, cliente.email, cliente.emailCliente, cliente.emailLower, snapshot.email, snapshot.emailLower), "").toLowerCase();
  return email.includes("@") ? email : "";
}

function getTicketIdsFromFactura(item = {}) {
  const raw = safeObject(item);
  const ticket = safeObject(raw.ticket);
  const incidencia = safeObject(raw.incidencia);
  const relationsTicket = safeObject(raw.relations?.ticket);

  return [
    ...new Set(
      [
        raw.ticketId,
        raw.incidenciaId,
        raw.relatedTicketId,
        raw.relatedIncidentId,
        raw.supportTicketId,
        ticket.ticketId,
        ticket.incidenciaId,
        ticket.id,
        incidencia.ticketId,
        incidencia.incidenciaId,
        incidencia.id,
        relationsTicket.ticketId,
        relationsTicket.incidenciaId,
        relationsTicket.id,
        ...safeArray(raw.ticketIds),
        ...safeArray(raw.incidenciaIds),
        ...safeArray(raw.relatedTicketIds),
        ...safeArray(raw.relatedIncidentIds),
        ...safeArray(raw.tickets).map((ticketItem) => first(ticketItem?.ticketId, ticketItem?.incidenciaId, ticketItem?.id)),
        ...safeArray(raw.incidencias).map((ticketItem) => first(ticketItem?.ticketId, ticketItem?.incidenciaId, ticketItem?.id)),
      ]
        .map((value) => cleanText(value, ""))
        .filter(Boolean)
    ),
  ];
}

function normalizePaymentStatus(value = "pending") {
  const key = normalizeKey(value || "pending");

  if (["paid", "pagada", "pagado", "abonada", "cobrada", "cobrado", "completed", "complete"].includes(key)) return "paid";
  if (["partial", "parcial"].includes(key)) return "partial";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";
  if (["cancelled", "canceled", "cancelada", "cancelado"].includes(key)) return "cancelled";
  if (["draft", "borrador"].includes(key)) return "draft";

  return "pending";
}

function paymentStatusLabel(status = "pending") {
  const key = normalizePaymentStatus(status);
  if (key === "paid") return "Pagada";
  if (key === "partial") return "Parcial";
  if (key === "overdue") return "Vencida";
  if (key === "cancelled") return "Cancelada";
  if (key === "draft") return "Borrador";
  return "Pendiente";
}

function normalizeFacturaPdfFields(raw = {}) {
  const item = safeObject(raw);
  const document = safeObject(item.document);
  const file = safeObject(first(item.file, item.pdf, item.blob, {}));
  const attachment = safeObject(safeArray(first(item.attachments, item.files, item.adjuntos, []))[0]);

  const publicUrl = safePublicUrl(first(item.publicBlobUrl, item.blobUrl, document.publicBlobUrl, document.blobUrl, document.url, file.publicBlobUrl, file.blobUrl, attachment.blobUrl, attachment.url));
  const signedUrl = safeSignedPdfUrl(first(item.signedUrl, item.sasUrl, item.viewUrl, item.downloadUrl, item.pdfUrl, file.signedUrl, file.sasUrl, file.viewUrl, file.downloadUrl, file.url, document.signedUrl, document.sasUrl, document.viewUrl, document.openUrl, document.pdfUrl));
  const blobPath = cleanText(first(item.blobPath, item.pdfPath, item.storagePath, item.storageKey, document.blobPath, document.pdfPath, document.storagePath, document.storageKey, file.blobPath, file.blobName, file.storagePath, attachment.blobPath, attachment.blobName), "");
  const contentType = cleanText(first(item.contentType, item.mimeType, item.mimetype, document.contentType, document.mimeType, document.mimetype, file.contentType, attachment.contentType), "");

  const hasPdf = Boolean(
    first(
      item.hasPdf,
      item.pdfAvailable,
      document.available,
      document.hasPdf,
      file.available,
      file.hasPdf,
      signedUrl,
      publicUrl,
      blobPath,
      normalizeKey(contentType).includes("pdf"),
      /\.pdf$/i.test(blobPath)
    )
  );

  return {
    hasPdf,
    pdfAvailable: Boolean(first(item.pdfAvailable, hasPdf)),
    pdfUrl: signedUrl || publicUrl,
    viewUrl: signedUrl || publicUrl,
    downloadUrl: signedUrl || publicUrl,
    publicBlobUrl: publicUrl,
    blobUrl: publicUrl,
    blobPath,
    pdfPath: blobPath,
    document: Object.keys(document).length ? document : null,
  };
}

export function normalizeFactura(item = {}, options = {}) {
  const raw = safeObject(item);
  const id = getFacturaRawId(raw);
  const facturaId = cleanText(first(raw.facturaId, raw.invoiceId, raw.id, id), id);
  const invoiceId = cleanText(first(raw.invoiceId, raw.facturaId, raw.id, id), id);

  const clienteId = cleanText(first(raw.clienteId, raw.clientId, raw.customerId, raw.cliente?.clienteId, raw.cliente?.id, raw.clienteSnapshot?.clienteId, raw.clienteSnapshot?.id, safeArray(raw.clienteIds)[0]), "");
  const userId = cleanText(first(raw.userId, raw.usuarioId, raw.cliente?.userId, raw.clienteSnapshot?.userId, safeArray(raw.userIds)[0]), "");
  const clienteNombre = getClientDisplayName(raw);
  const razonSocial = getCompanyName(raw);
  const clienteEmail = getClientEmail(raw);

  const total = round2(first(raw.total, raw.totalFactura, raw.importeTotal, raw.amount, raw.invoiceAmount, raw.importe, raw.facturaTotal, raw.totales?.total, raw.totals?.total, raw.resumen?.total, 0));
  const paidAmount = round2(first(raw.paidAmount, raw.pagado, raw.payment?.paidAmount, raw.totales?.pagado, normalizePaymentStatus(first(raw.paymentStatus, raw.estadoPago)) === "paid" ? total : 0));
  const pendingAmount = Math.max(0, round2(first(raw.pendingAmount, raw.pendiente, raw.payment?.pendingAmount, raw.totales?.pendiente, total - paidAmount)));
  const currency = cleanText(first(raw.currency, raw.moneda, raw.facturaCurrency, raw.payment?.currency, DEFAULT_CURRENCY), DEFAULT_CURRENCY).toUpperCase();

  const paymentStatus = normalizePaymentStatus(first(raw.paymentStatus, raw.estadoPago, raw.payment?.status, "pending"));
  const status = cleanText(first(raw.status, raw.estado, "issued"), "issued");

  const ticketIds = getTicketIdsFromFactura(raw);
  const ticketId = ticketIds[0] || "";
  const incidenciaSubject = cleanText(first(raw.incidenciaSubject, raw.ticketSubject, raw.ticket?.subject, raw.ticket?.asunto, raw.incidencia?.subject, raw.incidencia?.asunto, ticketId), ticketId);

  const pdf = normalizeFacturaPdfFields(raw);
  const issuedAt = cleanText(first(raw.issuedAt, raw.fechaFacturaISO, raw.fechaFactura, raw.fechaEmision, raw.lifecycle?.issuedAt, raw.createdAt), "");
  const createdAt = cleanText(first(raw.createdAt, raw.lifecycle?.createdAt, raw.auditoria?.createdAt, issuedAt), "");
  const updatedAt = cleanText(first(raw.updatedAt, raw.lastActivityAt, raw.lifecycle?.updatedAt, raw.lifecycle?.lastActivityAt, createdAt), "");
  const sentAt = cleanText(first(raw.sentAt, raw.fechaEnvio, raw.email?.sentAt, raw.delivery?.sentAt, raw.mailSentAt), "");

  const normalized = {
    ...raw,

    id,
    facturaId,
    invoiceId,

    numeroFacturaLegal: cleanText(first(raw.numeroFacturaLegal, raw.legalInvoiceNumber, raw.numeroFactura, raw.invoiceNumber, id), id),
    numeroFacturaSistema: cleanText(first(raw.numeroFacturaSistema, raw.systemInvoiceNumber), ""),
    numeroFactura: cleanText(first(raw.numeroFactura, raw.numeroFacturaLegal, raw.invoiceNumber, id), id),
    invoiceNumber: cleanText(first(raw.invoiceNumber, raw.numeroFacturaLegal, raw.numeroFactura, id), id),
    number: cleanText(first(raw.number, raw.numeroFacturaLegal, raw.numeroFactura, id), id),

    clienteId,
    clientId: clienteId,
    customerId: clienteId,
    userId,

    clienteNombre,
    clienteName: clienteNombre,
    clientName: clienteNombre,
    customerName: clienteNombre,
    razonSocial,
    companyName: razonSocial,

    clienteEmail,
    emailCliente: clienteEmail,
    clientEmail: clienteEmail,
    email: clienteEmail,

    avatarUrl: cleanText(first(raw.avatarUrl, raw.clienteAvatar, raw.clientAvatarUrl, raw.cliente?.avatarUrl, raw.cliente?.avatar, raw.userAvatarUrl), ""),

    status,
    estado: cleanText(first(raw.estado, raw.status, status), status),

    paymentStatus,
    estadoPago: paymentStatus,
    estadoPagoLabel: cleanText(first(raw.estadoPagoLabel, raw.payment?.statusLabel, paymentStatusLabel(paymentStatus)), paymentStatusLabel(paymentStatus)),

    total,
    amount: total,
    importe: total,
    totalFactura: total,
    facturaTotal: total,
    invoiceAmount: total,
    paidAmount,
    pendingAmount,
    currency,
    moneda: currency,

    ticketId,
    incidenciaId: ticketId,
    relatedTicketId: ticketId,
    relatedIncidentId: ticketId,
    ticketIds,
    incidenciaIds: ticketIds,
    incidenciaSubject,
    ticketSubject: incidenciaSubject,

    issuedAt,
    fechaFactura: cleanText(first(raw.fechaFactura, raw.fechaEmision, raw.issuedAt, issuedAt), issuedAt),
    fechaEmision: cleanText(first(raw.fechaEmision, raw.fechaFactura, issuedAt), issuedAt),
    createdAt,
    updatedAt,
    lastActivityAt: cleanText(first(raw.lastActivityAt, updatedAt), updatedAt),
    sentAt,
    fechaEnvio: sentAt,

    sent: Boolean(first(raw.sent, raw.email?.sent, raw.delivery?.sent, sentAt)),

    ...pdf,

    meta: {
      ...safeObject(raw.meta),
      hasPdf: pdf.hasPdf,
      pdfAvailable: pdf.pdfAvailable,
      ticketId,
      incidenciaId: ticketId,
      ticketIds,
      incidenciaIds: ticketIds,
    },
  };

  if (options.includeRaw === true) {
    normalized.raw = raw;
  } else {
    delete normalized.raw;
  }

  return normalized;
}

export function normalizeIncidenciaForFactura(item = {}) {
  const raw = safeObject(item);
  const id = cleanText(first(raw.ticketId, raw.incidenciaId, raw.id, raw.code, raw.numero), "");
  if (!id) return null;

  const subject = safePublicText(first(raw.subject, raw.asunto, raw.title, raw.name, raw.preview, raw.description, raw.descripcion), id);
  const status = cleanText(first(raw.status, raw.estado, raw.state), "");
  const category = cleanText(first(raw.category, raw.categoria, raw.tipo), "");

  return {
    ...raw,
    id,
    ticketId: id,
    incidenciaId: id,
    subject,
    asunto: subject,
    title: subject,
    clienteId: cleanText(first(raw.clienteId, raw.clientId, raw.cliente?.clienteId), ""),
    userId: cleanText(first(raw.userId, raw.usuarioId, raw.userRef?.userId), ""),
    requesterName: safePublicText(first(raw.requesterName, raw.userName, raw.clientName, raw.clienteName), "Usuario"),
    status,
    estado: status,
    category,
    categoria: category,
    facturaLinked: Boolean(raw.facturaLinked || raw.meta?.facturaLinked || raw.meta?.hasFactura || raw.facturaId || raw.invoiceId),
  };
}

function mergeById(items = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const factura = normalizeFactura(item);
    const id = getFacturaStableId(factura);
    if (!id) continue;
    if (!map.has(id)) map.set(id, factura);
  }

  return [...map.values()];
}

/* =========================================================
   NORMALIZED RESPONSES
========================================================= */

export function normalizeFacturasListResponse(payload = null, requestMeta = {}) {
  const envelope = safeObject(unwrapEnvelope(payload), {});
  const items = listFromPayload(payload).map((item) => normalizeFactura(item, { includeRaw: requestMeta.includeRaw === true }));
  const paging = pagingFromPayload(payload, requestMeta, items.length);
  const total = paging.total;
  const meta = metaFromPayload(payload);

  return {
    ok: envelope.ok !== false,
    success: envelope.success !== false,
    items,
    facturas: items,
    data: items,
    invoices: items,
    count: items.length,
    total,
    remoteCount: total,
    totalMatched: total,
    page: paging.page,
    nextPage: paging.nextPage,
    totalPages: paging.totalPages,
    hasMore: paging.hasMore,
    offset: paging.offset,
    limit: paging.limit,
    fetchLimit: paging.fetchLimit,
    paging,
    stats: safeObject(first(namedObjectFromPayload(payload, "stats"), {})),
    statsAllMatched: safeObject(first(namedObjectFromPayload(payload, "statsAllMatched"), {})),
    filters: safeObject(first(namedObjectFromPayload(payload, "filters"), {})),
    diagnostics: safeObject(first(namedObjectFromPayload(payload, "diagnostics"), {})),
    requestId: first(envelope.requestId, safeObject(payload).requestId, null),
    meta: {
      ...meta,
      total,
      count: items.length,
      remoteCount: total,
      totalMatched: total,
      page: paging.page,
      nextPage: paging.nextPage,
      totalPages: paging.totalPages,
      hasMore: paging.hasMore,
      offset: paging.offset,
      limit: paging.limit,
    },
  };
}

export function normalizeFacturaDetailResponse(payload = null) {
  const detail = detailFromPayload(payload);
  const item = detail ? normalizeFactura(detail, { includeRaw: true }) : null;

  return {
    ok: Boolean(item),
    item,
    factura: item,
    data: item,
    meta: metaFromPayload(payload),
  };
}

export function normalizeFacturasStatsResponse(payload = null) {
  const envelope = safeObject(unwrapEnvelope(payload), {});
  const stats = safeObject(first(namedObjectFromPayload(payload, "stats"), envelope.stats, envelope), {});

  return {
    ok: envelope.ok !== false,
    stats,
    meta: metaFromPayload(payload),
  };
}

export function normalizeFacturaCreateResponse(payload = null) {
  const detail = detailFromPayload(payload);
  const item = detail ? normalizeFactura(detail, { includeRaw: true }) : null;

  return {
    ok: Boolean(item),
    item,
    factura: item,
    data: item,
    created: Boolean(item),
    file: namedObjectFromPayload(payload, "file"),
    email: namedObjectFromPayload(payload, "email"),
    meta: metaFromPayload(payload),
  };
}

export function normalizeFacturaSendResponse(payload = null) {
  const detail = detailFromPayload(payload);
  const item = detail ? normalizeFactura(detail, { includeRaw: true }) : null;

  return {
    ok: true,
    item,
    factura: item,
    sent: namedObjectFromPayload(payload, "sent"),
    message: cleanText(first(safeObject(payload).message, safeObject(payload).data?.message, safeObject(payload).result?.message, "Factura enviada correctamente."), "Factura enviada correctamente."),
    meta: metaFromPayload(payload),
  };
}

function normalizePdfFileObject(file = {}, fallback = {}) {
  const raw = safeObject(file, {});
  const url = safeSignedPdfUrl(first(raw.url, raw.viewUrl, raw.downloadUrl, raw.signedUrl, raw.sasUrl, raw.pdfUrl, fallback.url, ""));
  const publicBlobUrl = safePublicUrl(first(raw.publicBlobUrl, raw.blobUrl, fallback.publicBlobUrl, fallback.blobUrl, ""));

  return {
    ...raw,
    url,
    signedUrl: safeSignedPdfUrl(first(raw.signedUrl, raw.sasUrl, url)),
    sasUrl: safeSignedPdfUrl(first(raw.sasUrl, raw.signedUrl, url)),
    viewUrl: safeSignedPdfUrl(first(raw.viewUrl, url)),
    downloadUrl: safeSignedPdfUrl(first(raw.downloadUrl, url)),
    publicBlobUrl,
    blobUrl: publicBlobUrl,
    filename: ensurePdfFilename(first(raw.filename, raw.fileName, raw.name, fallback.filename), "factura.pdf"),
    contentType: cleanText(first(raw.contentType, raw.type, raw.mimeType, fallback.contentType), "application/pdf"),
  };
}

export function normalizeFacturaPdfResponse(response = null, fallback = {}) {
  if (isBlob(response)) {
    return {
      ok: true,
      success: true,
      blob: response,
      size: response.size,
      contentType: response.type || "application/pdf",
      filename: ensurePdfFilename(fallback.filename, "factura.pdf"),
      raw: response,
    };
  }

  const object = safeObject(response, {});
  const envelope = safeObject(unwrapEnvelope(response), object);
  const fileObject = normalizePdfFileObject(first(envelope.file, envelope.pdf, envelope.blob, object.file, object.pdf, object.blob, object), fallback);
  const facturaRaw = first(envelope.factura, envelope.item, envelope.data, envelope.invoice, object.factura, object.item, null);
  const factura = looksLikeFactura(facturaRaw) ? normalizeFactura(facturaRaw, { includeRaw: true }) : null;

  return {
    ok: object.ok !== false && envelope.ok !== false,
    success: object.success !== false && envelope.success !== false,
    blob: isBlob(first(object.blob, object.data?.blob, object.file?.blob, null)) ? first(object.blob, object.data?.blob, object.file?.blob, null) : null,
    url: fileObject.url,
    signedUrl: fileObject.signedUrl,
    sasUrl: fileObject.sasUrl,
    viewUrl: fileObject.viewUrl,
    downloadUrl: fileObject.downloadUrl,
    publicBlobUrl: fileObject.publicBlobUrl,
    blobUrl: fileObject.blobUrl,
    filename: fileObject.filename,
    contentType: fileObject.contentType,
    file: fileObject,
    pdf: fileObject,
    factura,
    item: factura,
    data: factura,
    meta: safeObject(first(envelope.meta, object.meta, {})),
    requestId: first(envelope.requestId, object.requestId, null),
    raw: response,
  };
}

/* =========================================================
   PAYLOAD
========================================================= */

function stripUnsafePayload(payload = {}) {
  const source = safeObject(payload);
  const output = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (key === "raw") continue;
    if (key.startsWith("_")) continue;
    output[key] = value;
  }

  return output;
}

export function normalizeFacturaPayload(payload = {}) {
  const source = stripUnsafePayload(payload);
  const title = cleanText(first(source.title, source.name, source.concepto, source.conceptoPrincipal), "");
  const total = round2(first(source.total, source.amount, source.importe, source.totalFactura, 0));
  const currency = cleanText(first(source.currency, source.moneda, DEFAULT_CURRENCY), DEFAULT_CURRENCY).toUpperCase();
  const incidenciaId = cleanText(first(source.ticketId, source.incidenciaId, source.relatedTicketId, source.relatedIncidentId, source.ticket?.ticketId, source.incidencia?.ticketId), "");
  const clienteId = cleanText(first(source.clienteId, source.clientId, source.customerId), "");
  const clienteNombre = cleanText(first(source.clienteNombre, source.clientName, source.clienteName, source.customerName), "");
  const clienteEmail = cleanText(first(source.clienteEmail, source.emailCliente, source.clientEmail, source.customerEmail), "").toLowerCase();

  return {
    ...source,
    title,
    name: cleanText(first(source.name, title), title),
    concepto: cleanText(first(source.concepto, title), title),
    total,
    amount: total,
    importe: total,
    totalFactura: total,
    currency,
    moneda: currency,
    status: cleanText(first(source.status, source.estado, "issued"), "issued"),
    estado: cleanText(first(source.estado, source.status, "issued"), "issued"),
    paymentStatus: normalizePaymentStatus(first(source.paymentStatus, source.estadoPago, "pending")),
    estadoPago: normalizePaymentStatus(first(source.estadoPago, source.paymentStatus, "pending")),
    ...(clienteId ? { clienteId, clientId: clienteId, customerId: clienteId } : {}),
    ...(clienteNombre ? { clienteNombre, clientName: clienteNombre, clienteName: clienteNombre } : {}),
    ...(clienteEmail ? { clienteEmail, emailCliente: clienteEmail, clientEmail: clienteEmail } : {}),
    ...(incidenciaId ? { ticketId: incidenciaId, incidenciaId, relatedTicketId: incidenciaId, relatedIncidentId: incidenciaId } : {}),
  };
}

/* =========================================================
   HTTP
========================================================= */

async function httpRequest(method = "GET", endpoint = "", body = null, options = {}) {
  const timeout = options.timeout || FACTURAS_TIMEOUT;
  const source = options.source || "views.facturas";
  const query = safeObject(options.query || options.params);
  const headers = safeObject(options.headers);

  if (method === "GET" && isFunction(Http.get)) {
    return Http.get(endpoint, { timeout, query, headers, source });
  }

  if (method === "POST" && isFunction(Http.post)) {
    return Http.post(endpoint, body, { timeout, query, headers, source });
  }

  if (method === "PUT" && isFunction(Http.put)) {
    return Http.put(endpoint, body, { timeout, query, headers, source });
  }

  if (method === "PATCH" && isFunction(Http.patch)) {
    return Http.patch(endpoint, body, { timeout, query, headers, source });
  }

  if (method === "DELETE") {
    const fn = Http.delete || Http.del;
    if (isFunction(fn)) return fn.call(Http, endpoint, { timeout, query, headers, source });
  }

  if (isFunction(Http.request)) {
    return Http.request(endpoint, { method, body, data: body, timeout, query, headers, source });
  }

  if (method === "PUT") return httpRequest("PATCH", endpoint, body, options);
  if (method === "PATCH") return httpRequest("POST", endpoint, body, options);

  throw new Error(`FACTURAS_HTTP_${method}_UNAVAILABLE`);
}

async function getJson(endpoint = "", options = {}) {
  return httpRequest("GET", endpoint, null, options);
}

async function postJson(endpoint = "", body = {}, options = {}) {
  return httpRequest("POST", endpoint, body, options);
}

async function putJson(endpoint = "", body = {}, options = {}) {
  return httpRequest("PUT", endpoint, body, options);
}

async function patchJson(endpoint = "", body = {}, options = {}) {
  return httpRequest("PATCH", endpoint, body, options);
}

async function deleteJson(endpoint = "", options = {}) {
  return httpRequest("DELETE", endpoint, null, options);
}

/* =========================================================
   LIST / DETAIL / STATS
========================================================= */

export async function fetchFacturasRequest(options = {}) {
  const query = buildListQuery(options);

  return getJson(FACTURAS_ENDPOINT, {
    timeout: options.timeout || FACTURAS_LIST_TIMEOUT,
    query,
    source: "views.facturas.list.raw",
  });
}

export async function listFacturas(options = {}) {
  const query = buildListQuery(options);
  const queryKey = `list:${stableStringify(query)}`;

  if (options.dedupe !== false && inflight.has(queryKey)) return inflight.get(queryKey);

  loading = true;
  lastError = null;

  const task = (async () => {
    try {
      const response = await getJson(FACTURAS_ENDPOINT, {
        timeout: options.timeout || FACTURAS_LIST_TIMEOUT,
        query,
        source: "views.facturas.list",
      });

      const normalized = normalizeFacturasListResponse(response, { ...options, ...query });
      const cacheAppend = options.cacheAppend === true || options.appendToCache === true;
      const cachedItems = cacheAppend ? mergeById([...lastList.items, ...normalized.items]) : normalized.items;

      lastList = {
        items: cachedItems,
        total: normalized.total,
        queryKey,
      };

      if (normalized.stats && Object.keys(normalized.stats).length) lastStats = normalized.stats;
      lastLoadedAt = nowIso();

      return normalized;
    } catch (error) {
      lastError = normalizeError(error);

      if (options.returnStaleOnError !== false && lastList.items.length) {
        return {
          ok: false,
          success: false,
          stale: true,
          items: lastList.items,
          facturas: lastList.items,
          data: lastList.items,
          invoices: lastList.items,
          total: lastList.total,
          count: lastList.items.length,
          error: lastError,
        };
      }

      throw error;
    } finally {
      loading = false;
    }
  })();

  return setInflight(queryKey, task);
}

export async function loadFacturas(options = {}) {
  const response = await listFacturas(options);
  return response.items;
}

export async function fetchFacturaDetailRequest(id = "", options = {}) {
  const facturaId = normalizeFacturaId(id);
  const key = `detail:${facturaId}`;

  if (options.dedupe !== false && inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    const response = await getJson(getFacturaEndpoint(facturaId), {
      timeout: options.timeout || FACTURAS_DETAIL_TIMEOUT,
      source: "views.facturas.detail",
    });

    return normalizeFacturaDetailResponse(response);
  })();

  return setInflight(key, task);
}

export async function getFacturaById(id = "", options = {}) {
  const response = await fetchFacturaDetailRequest(id, options);
  return response.item;
}

export async function fetchFacturasStatsRequest(options = {}) {
  const query = safeObject(options.query || options.params || options.filters);
  const key = `stats:${stableStringify(query)}`;

  if (options.dedupe !== false && inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    const response = await getJson(`${FACTURAS_ENDPOINT}/stats`, {
      timeout: options.timeout || FACTURAS_LIST_TIMEOUT,
      query,
      source: "views.facturas.stats",
    });

    const normalized = normalizeFacturasStatsResponse(response);
    lastStats = normalized.stats;
    return normalized;
  })();

  return setInflight(key, task);
}

export async function loadFacturasStats(options = {}) {
  const response = await fetchFacturasStatsRequest(options);
  return response.stats;
}

/* =========================================================
   CREATE / UPDATE / DELETE / SEND
========================================================= */

export async function createFacturaRequest(payload = {}, options = {}) {
  const response = await postJson(FACTURAS_ENDPOINT, normalizeFacturaPayload(payload), {
    timeout: options.timeout || FACTURAS_CREATE_TIMEOUT,
    source: "views.facturas.create",
  });

  return normalizeFacturaCreateResponse(response);
}

export async function createFactura(payload = {}, options = {}) {
  const response = await createFacturaRequest(payload, options);
  const created = response.item;

  if (created) {
    const nextItems = mergeById([created, ...lastList.items]);
    lastList = { ...lastList, items: nextItems, total: Math.max(number(lastList.total, 0) + 1, nextItems.length) };
  }

  return created;
}

export async function updateFacturaRequest(id = "", payload = {}, options = {}) {
  const response = await putJson(getFacturaEndpoint(id), normalizeFacturaPayload(payload), {
    timeout: options.timeout || FACTURAS_TIMEOUT,
    source: "views.facturas.update",
  });

  return normalizeFacturaDetailResponse(response);
}

export async function updateFactura(id = "", payload = {}, options = {}) {
  const response = await updateFacturaRequest(id, payload, options);
  const updated = response.item;

  if (updated) {
    const stableId = getFacturaStableId(updated);
    lastList = {
      ...lastList,
      items: lastList.items.map((item) => getFacturaStableId(item) === stableId ? normalizeFactura(updated) : item),
    };
  }

  return updated;
}

export async function patchFacturaRequest(id = "", payload = {}, options = {}) {
  const response = await patchJson(getFacturaEndpoint(id), normalizeFacturaPayload(payload), {
    timeout: options.timeout || FACTURAS_TIMEOUT,
    source: "views.facturas.patch",
  });

  return normalizeFacturaDetailResponse(response);
}

export async function patchFactura(id = "", payload = {}, options = {}) {
  const response = await patchFacturaRequest(id, payload, options);
  const patched = response.item;

  if (patched) {
    const stableId = getFacturaStableId(patched);
    lastList = {
      ...lastList,
      items: lastList.items.map((item) => getFacturaStableId(item) === stableId ? normalizeFactura(patched) : item),
    };
  }

  return patched;
}

export async function removeFacturaRequest(id = "", options = {}) {
  return deleteJson(getFacturaEndpoint(id), {
    timeout: options.timeout || FACTURAS_TIMEOUT,
    source: "views.facturas.remove",
  });
}

export async function removeFactura(id = "", options = {}) {
  await removeFacturaRequest(id, options);

  const facturaId = normalizeFacturaId(id);
  lastList = {
    ...lastList,
    items: lastList.items.filter((item) => ![item.id, item.facturaId, item.invoiceId].includes(facturaId)),
    total: Math.max(0, number(lastList.total, 0) - 1),
  };

  return true;
}

export async function sendFacturaRequest(id = "", payload = {}, options = {}) {
  const response = await postJson(getFacturaSendEndpoint(id), safeObject(payload), {
    timeout: options.timeout || FACTURAS_SEND_TIMEOUT,
    source: "views.facturas.send",
  });

  return normalizeFacturaSendResponse(response);
}

export async function sendFactura(id = "", payload = {}, options = {}) {
  const response = await sendFacturaRequest(id, payload, options);
  const sentItem = response.item;

  if (sentItem) {
    const stableId = getFacturaStableId(sentItem);
    lastList = {
      ...lastList,
      items: lastList.items.map((item) => getFacturaStableId(item) === stableId ? normalizeFactura(sentItem) : item),
    };
  }

  return sentItem || response;
}

/* =========================================================
   PDF · CLOSED CONTRACT
========================================================= */

function buildPdfQuery(mode = FACTURA_PDF_MODES.VIEW, options = {}) {
  const normalized = normalizeKey(mode);
  const disposition = ["view", "inline", "ver", "open", "preview"].includes(normalized)
    ? "inline"
    : "attachment";

  return {
    ...PDF_JSON_QUERY,
    disposition,
    mode: disposition,
    ...(options.force === true ? { force: true } : {}),
  };
}

export async function viewFacturaPdfRequest(id = "", options = {}) {
  const facturaId = normalizeFacturaId(id);
  const filename = options.filename || resolveFacturaPdfFilename(facturaId, options);

  const response = await getJson(getFacturaPdfEndpoint(facturaId, FACTURA_PDF_MODES.VIEW), {
    timeout: options.timeout || FACTURAS_PDF_TIMEOUT,
    query: buildPdfQuery(FACTURA_PDF_MODES.VIEW, options),
    headers: {
      Accept: "application/json",
      "X-Onion-Pdf-Mode": "inline",
    },
    source: "views.facturas.pdf.view",
  });

  return normalizeFacturaPdfResponse(response, { filename });
}

export async function downloadFacturaPdfRequest(id = "", options = {}) {
  const facturaId = normalizeFacturaId(id);
  const filename = options.filename || resolveFacturaPdfFilename(facturaId, options);

  const response = await getJson(getFacturaPdfEndpoint(facturaId, FACTURA_PDF_MODES.DOWNLOAD), {
    timeout: options.timeout || FACTURAS_PDF_TIMEOUT,
    query: buildPdfQuery(FACTURA_PDF_MODES.DOWNLOAD, options),
    headers: {
      Accept: "application/json",
      "X-Onion-Pdf-Mode": "attachment",
    },
    source: "views.facturas.pdf.download",
  });

  return normalizeFacturaPdfResponse(response, { filename });
}

export async function fetchFacturaPdfRequest(id = "", mode = FACTURA_PDF_MODES.DOWNLOAD, options = {}) {
  const normalizedMode = normalizeKey(mode);
  return ["view", "inline", "ver", "open", "preview"].includes(normalizedMode)
    ? viewFacturaPdfRequest(id, options)
    : downloadFacturaPdfRequest(id, options);
}

/* =========================================================
   INCIDENCIAS VINCULABLES
========================================================= */

function listFromTicketPayload(payload = null) {
  if (Array.isArray(payload)) return payload;

  const object = safeObject(unwrapEnvelope(payload), {});

  for (const key of ["items", "rows", "records", "results", "docs", "documents", "value", "list", "tickets", "incidencias", "data"]) {
    if (Array.isArray(object[key])) return object[key];
  }

  return [];
}

export async function searchFacturaIncidencias({
  clienteId = "",
  userId = "",
  q = "",
  search = "",
  limit = 50,
  includeClosed = true,
  includeAll = true,
  onlyMine = false,
  timeout = FACTURAS_LIST_TIMEOUT,
} = {}) {
  const query = {
    limit: Math.min(Math.max(1, number(limit, 50)), 100),
    includeClosed: Boolean(includeClosed),
    includeAll: Boolean(includeAll),
    onlyMine: Boolean(onlyMine),
  };

  const term = cleanText(first(q, search), "");
  if (term) {
    query.q = term;
    query.search = term;
  }

  if (clienteId) query.clienteId = cleanText(clienteId, "");
  if (userId) query.userId = cleanText(userId, "");

  const response = await getJson(FACTURAS_TICKETS_ENDPOINT, {
    timeout,
    query,
    source: "views.facturas.ticket-search",
  });

  return listFromTicketPayload(response).map(normalizeIncidenciaForFactura).filter(Boolean);
}

/* =========================================================
   PUBLIC HELPERS
========================================================= */

export function hasFacturaIncidencia(item = {}) {
  return Boolean(getFacturaIncidenciaId(item));
}

export function getFacturaIncidenciaId(item = {}) {
  const raw = safeObject(item);
  return cleanText(first(raw.ticketId, raw.incidenciaId, raw.relatedTicketId, raw.relatedIncidentId, raw.meta?.ticketId, raw.meta?.incidenciaId, safeArray(raw.ticketIds)[0], safeArray(raw.incidenciaIds)[0]), "");
}

export function getFacturaStableId(item = {}) {
  const raw = safeObject(item);
  return cleanText(first(raw.id, raw.facturaId, raw.invoiceId, raw.numeroFacturaLegal, raw.numeroFactura, raw.invoiceNumber, raw.number), "");
}

export function getFacturaAmount(item = {}) {
  const raw = safeObject(item);
  return round2(first(raw.total, raw.totalFactura, raw.importeTotal, raw.amount, raw.invoiceAmount, raw.importe, raw.facturaTotal, raw.totals?.total, raw.totales?.total, raw.resumen?.total, 0));
}

export function resolveFacturaPdfFilename(id = "", options = {}) {
  const factura = safeObject(first(options.factura, options.invoice, options.item, options.data, {}));
  const legalNumber = cleanText(first(options.numeroFacturaLegal, options.legalInvoiceNumber, options.numeroFactura, options.invoiceNumber, options.number, factura.numeroFacturaLegal, factura.legalInvoiceNumber, factura.numeroFactura, factura.invoiceNumber, factura.number, factura.numero, ""), "");
  const company = cleanText(first(factura.razonSocial, factura.companyName, factura.cliente?.razonSocial, factura.cliente?.companyName, ""), "");
  const base = legalNumber
    ? `${safeFilename(legalNumber, "factura")}${company ? `__${safeFilename(company, "cliente")}` : ""}`
    : safeFilename(id, "factura");

  return ensurePdfFilename(base, "factura.pdf");
}

export function computeFacturasStats(items = lastList.items) {
  const rows = safeArray(items);

  return rows.reduce(
    (acc, item) => {
      acc.total += 1;

      const payment = normalizePaymentStatus(first(item.paymentStatus, item.estadoPago, item.status, item.estado));
      const amount = getFacturaAmount(item);

      if (payment === "paid") {
        acc.paid += 1;
        acc.paidAmount += amount;
      } else {
        acc.pending += 1;
        acc.pendingAmount += amount;
      }

      if (payment === "overdue") acc.overdue += 1;
      if (hasFacturaIncidencia(item)) acc.withIncidencia += 1;
      if (item.hasPdf || item.pdfAvailable || item.meta?.hasPdf || item.pdfUrl || item.viewUrl || item.downloadUrl) acc.withPdf += 1;
      if (item.delivery?.sent || item.meta?.isSent || item.sentAt || item.fechaEnvio || item.sent) acc.sent += 1;

      acc.amount += amount;
      return acc;
    },
    {
      total: 0,
      paid: 0,
      pending: 0,
      overdue: 0,
      sent: 0,
      withIncidencia: 0,
      withPdf: 0,
      amount: 0,
      paidAmount: 0,
      pendingAmount: 0,
    }
  );
}

/* =========================================================
   CACHE / ERROR / SNAPSHOT
========================================================= */

function normalizeError(error = null) {
  return {
    message: redact(error?.message || "No se pudieron cargar las facturas."),
    status: error?.status || error?.statusCode || error?.response?.status || null,
    code: error?.code || error?.error || null,
    at: nowIso(),
  };
}

export function hydrateFacturasFromCache() {
  return {
    items: safeArray(lastList.items),
    total: number(lastList.total, safeArray(lastList.items).length),
    stats: lastStats || computeFacturasStats(lastList.items),
    loadedAt: lastLoadedAt,
    hydrated: safeArray(lastList.items).length > 0,
  };
}

export function clearFacturasCache() {
  lastList = { items: [], total: 0, queryKey: "" };
  lastStats = null;
  lastLoadedAt = null;
  lastError = null;
  inflight.clear();
  return true;
}

export function getFacturasApiSnapshot() {
  return {
    version: FACTURAS_API_VERSION,
    endpoint: FACTURAS_ENDPOINT,
    loading,
    lastLoadedAt,
    lastError,
    cache: {
      items: lastList.items.length,
      total: lastList.total,
      hydrated: lastList.items.length > 0,
      queryKey: lastList.queryKey,
    },
    inflight: inflight.size,
    stats: lastStats || computeFacturasStats(lastList.items),
    policy: {
      apiOnly: true,
      singleHttpLayer: true,
      noFetch: true,
      noDom: true,
      noRouter: true,
      preservesBackendOrder: true,
      dedupeInflightRequests: true,
      pdfJsonSasContract: true,
      preservesSignedUrls: true,
    },
  };
}

/* =========================================================
   COMPAT EXPORTS
========================================================= */

export const fetchFacturas = listFacturas;
export const getFacturaByIdRequest = fetchFacturaDetailRequest;
export const detailFactura = getFacturaById;

export const createInvoice = createFactura;
export const updateInvoice = updateFactura;
export const patchInvoice = patchFactura;
export const removeInvoice = removeFactura;

export const downloadFactura = downloadFacturaPdfRequest;
export const viewFactura = viewFacturaPdfRequest;

/* =========================================================
   PUBLIC API
========================================================= */

export const FacturasApi = Object.freeze({
  version: FACTURAS_API_VERSION,

  endpoint: FACTURAS_ENDPOINT,
  ticketsEndpoint: FACTURAS_TICKETS_ENDPOINT,

  timeouts: Object.freeze({
    default: FACTURAS_TIMEOUT,
    list: FACTURAS_LIST_TIMEOUT,
    detail: FACTURAS_DETAIL_TIMEOUT,
    create: FACTURAS_CREATE_TIMEOUT,
    pdf: FACTURAS_PDF_TIMEOUT,
    send: FACTURAS_SEND_TIMEOUT,
  }),

  defaults: Object.freeze({
    page: FACTURAS_DEFAULT_PAGE,
    limit: FACTURAS_DEFAULT_LIMIT,
    maxLimit: FACTURAS_MAX_LIMIT,
  }),

  normalizeFacturaId,
  getFacturaEndpoint,
  getFacturaViewEndpoint,
  getFacturaDownloadEndpoint,
  getFacturaSendEndpoint,
  getFacturaPdfEndpoint,

  buildFacturasListEndpoint,

  normalizeFactura,
  normalizeIncidenciaForFactura,
  normalizeFacturaPayload,
  resolveFacturaPdfFilename,

  normalizeFacturasListResponse,
  normalizeFacturaDetailResponse,
  normalizeFacturasStatsResponse,
  normalizeFacturaCreateResponse,
  normalizeFacturaSendResponse,
  normalizeFacturaPdfResponse,

  listFacturas,
  loadFacturas,
  fetchFacturas,
  fetchFacturasRequest,

  fetchFacturaDetailRequest,
  getFacturaById,
  getFacturaByIdRequest,
  detailFactura,

  fetchFacturasStatsRequest,
  loadFacturasStats,

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

  viewFacturaPdfRequest,
  downloadFacturaPdfRequest,
  fetchFacturaPdfRequest,
  viewFactura,
  downloadFactura,

  searchFacturaIncidencias,

  hasFacturaIncidencia,
  getFacturaIncidenciaId,
  getFacturaStableId,
  getFacturaAmount,
  computeFacturasStats,

  hydrateFacturasFromCache,
  clearFacturasCache,

  getFacturasApiSnapshot,
  getSnapshot: getFacturasApiSnapshot,
});

export default FacturasApi;
