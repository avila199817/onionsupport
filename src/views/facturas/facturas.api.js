/* =========================================================
   Onion Support - Facturas API
   Archivo: /src/views/facturas/facturas.api.js

   Responsabilidad:
   - Centralizar llamadas HTTP de Facturas.
   - Adaptar backend /api/facturas al frontend.
   - Normalizar DTOs ligeros para la vista.
   - Listar, crear, actualizar, eliminar y enviar facturas.
   - Ver/descargar PDF.
   - Buscar incidencias vinculables para crear factura.
   - Respetar el orden/paginación del backend.
   - Dedupe de peticiones simultáneas equivalentes.
   - Sin DOM.
   - Sin Router.
   - Sin Auth directo.
   - Sin Store.
   - Sin State externo.
   - Sin Model externo.
   - Sin utils externos.
   - Sin fetch propio.
========================================================= */

import Http from "../../core/http.js";

export const FACTURAS_API_VERSION = "facturas.api.fast.v3";

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

let lastList = {
  items: [],
  total: 0,
  queryKey: "",
};

let lastStats = null;

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

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "object") {
    return fallback;
  }

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

      clean =
        lastComma > lastDot
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

function toTimestamp(value = null) {
  if (!value) return 0;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = cleanText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  const time = date.getTime();

  return Number.isFinite(time) ? time : 0;
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

function safeUrl(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

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

function safeFilename(value = "", fallback = "factura") {
  const clean = cleanText(value, fallback)
    .replace(/[\\/:*?"<>|#]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 180);

  return clean || fallback;
}

export function resolveFacturaPdfFilename(id = "", options = {}) {
  const factura = safeObject(
    first(
      options.factura,
      options.invoice,
      options.item,
      options.data,
      {}
    )
  );

  const legalNumber = cleanText(
    first(
      options.numeroFacturaLegal,
      options.legalInvoiceNumber,
      options.numeroFactura,
      options.invoiceNumber,
      options.number,

      factura.numeroFacturaLegal,
      factura.legalInvoiceNumber,
      factura.numeroFactura,
      factura.invoiceNumber,
      factura.number,
      factura.numero,

      ""
    ),
    ""
  );

  if (legalNumber) {
    return `${safeFilename(legalNumber, "factura")}.pdf`;
  }

  return `${safeFilename(id, "factura")}.pdf`;
}

function encodeSegment(value = "") {
  const clean = cleanText(value, "");

  if (!clean) {
    throw new Error("FACTURA_ID_REQUIRED");
  }

  return encodeURIComponent(clean);
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

function mergeById(items = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const factura = safeObject(item);
    const id = cleanText(first(factura.id, factura.facturaId, factura.invoiceId, factura.number, factura.numeroFacturaLegal), "");

    if (!id) continue;
    if (!map.has(id)) map.set(id, factura);
  }

  return [...map.values()];
}

/* =========================================================
   ENDPOINT BUILDERS
========================================================= */

export function normalizeFacturaId(id = "") {
  const value = cleanText(id, "");

  if (!value) {
    throw new Error("FACTURA_ID_REQUIRED");
  }

  return value;
}

export function getFacturaEndpoint(id = "") {
  return `${FACTURAS_ENDPOINT}/${encodeSegment(normalizeFacturaId(id))}`;
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

  return ["view", "inline", "ver"].includes(normalized)
    ? getFacturaViewEndpoint(id)
    : getFacturaDownloadEndpoint(id);
}

/* =========================================================
   QUERY
========================================================= */

function cleanQueryValue(value) {
  if (value === undefined || value === null) return "";

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  const text = cleanText(value, "");

  if (!text) return "";
  if (hasSensitiveQuery(text)) return "";

  return text;
}

function appendQuery(params, key = "", value = "") {
  const name = cleanText(key, "");

  if (!name) return;

  if (Array.isArray(value)) {
    const list = value.map(cleanQueryValue).filter(Boolean);

    if (list.length) {
      params.set(name, list.join(","));
    }

    return;
  }

  const text = cleanQueryValue(value);

  if (text) {
    params.set(name, text);
  }
}

function normalizeSortMode(value = "") {
  const key = normalizeKey(value);

  if (["date_asc", "fecha_asc", "oldest", "oldest_first", "menor_fecha"].includes(key)) return "date_asc";
  if (["date_desc", "fecha_desc", "newest", "newest_first", "recent", "recent_desc", "mayor_fecha"].includes(key)) return "date_desc";
  if (["asc", "ascending"].includes(key)) return "date_asc";

  return "date_desc";
}

function resolveSort({ sort = "", sortBy = "", orderBy = "", sortMode = "", direction = "", sortDir = "", orderDir = "" } = {}) {
  const rawSort = cleanText(first(sortMode, sortBy, sort, orderBy, "date_desc"), "date_desc");
  const sortKey = normalizeKey(rawSort);
  const rawDirection = normalizeKey(first(sortDir, direction, orderDir, ""));

  if (["numero", "number", "invoice", "invoice_number", "factura", "numero_factura", "total", "amount", "importe", "cliente", "customer", "client", "estado_pago", "payment_status", "payment"].includes(sortKey)) {
    const finalDirection = rawDirection === "asc" ? "asc" : "desc";

    return {
      sort: sortKey,
      sortBy: sortKey,
      sortMode: sortKey,
      direction: finalDirection,
      sortDir: finalDirection,
    };
  }

  const mode = normalizeSortMode(rawSort);
  const directionFromMode = mode.endsWith("_asc") ? "asc" : "desc";
  const finalDirection = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : directionFromMode;

  return {
    sort: mode,
    sortBy: mode,
    sortMode: mode,
    direction: finalDirection,
    sortDir: finalDirection,
  };
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

  const finalPage = Math.max(1, number(page, FACTURAS_DEFAULT_PAGE));
  const finalLimit = Math.min(
    Math.max(1, number(limit, FACTURAS_DEFAULT_LIMIT)),
    FACTURAS_MAX_LIMIT
  );

  query.page = finalPage;
  query.limit = finalLimit;

  const finalSearch = cleanText(first(search, q), "");

  if (finalSearch) {
    query.q = finalSearch;
    query.search = finalSearch;
  }

  Object.assign(query, resolveSort({ sort, direction, sortBy, sortDir, orderBy, orderDir, sortMode }));

  if (includeStats !== undefined && includeStats !== null) {
    query.includeStats = Boolean(includeStats);
  }

  if (includeStatsAll) {
    query.includeStatsAll = true;
  }

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

    if (!key) continue;

    const clean = cleanQueryValue(value);

    if (!clean) continue;

    query[key] = clean;

    if (aliases[key]) {
      query[aliases[key]] = clean;
    }
  }

  return query;
}

export function buildFacturasListEndpoint(options = {}) {
  const params = new URLSearchParams();
  const query = buildListQuery(options);

  for (const [key, value] of Object.entries(query)) {
    appendQuery(params, key, value);
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
  if (Array.isArray(payload)) return payload;
  if (isBlob(payload)) return payload;

  const object = safeObject(payload, null);

  if (!object) return payload;

  if (
    Array.isArray(object.items) ||
    Array.isArray(object.rows) ||
    Array.isArray(object.results) ||
    Array.isArray(object.records) ||
    Array.isArray(object.docs) ||
    Array.isArray(object.documents) ||
    Array.isArray(object.value) ||
    Array.isArray(object.list) ||
    Array.isArray(object.facturas) ||
    Array.isArray(object.invoices)
  ) {
    return object;
  }

  if (
    object.factura ||
    object.invoice ||
    object.item ||
    object.detail ||
    object.file
  ) {
    return object;
  }

  const nested = first(
    object.data,
    object.payload,
    object.result,
    object.response,
    object.body
  );

  if (nested !== null && nested !== undefined && nested !== payload) {
    return unwrapEnvelope(nested, depth + 1);
  }

  return object;
}

function listFromPayload(payload = null) {
  if (Array.isArray(payload)) return payload;

  const object = safeObject(unwrapEnvelope(payload), {});

  for (const key of [
    "facturas",
    "items",
    "rows",
    "records",
    "results",
    "docs",
    "documents",
    "value",
    "list",
    "invoices",
    "data",
  ]) {
    if (Array.isArray(object[key])) return object[key];
  }

  return [];
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

function metaFromPayload(payload = null) {
  const object = safeObject(unwrapEnvelope(payload), {});
  const original = safeObject(payload, {});

  return safeObject(
    first(
      object.meta,
      object.paging,
      object.pagination,
      object.page,
      original.meta,
      original.paging,
      original.pagination,
      original.page,
      {}
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
  const hasMore = Boolean(first(envelope.hasMore, paging.hasMore, nextPage ? true : null, false));
  const offset = number(first(envelope.offset, paging.offset, requestMeta.offset, Math.max(0, (page - 1) * limit)), Math.max(0, (page - 1) * limit));

  return {
    ...paging,
    page,
    nextPage: nextPage === null || nextPage === undefined || nextPage === "" ? null : number(nextPage, null),
    totalPages,
    hasMore,
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

  return (
    first(
      looksLikeFactura(object.factura) ? object.factura : null,
      looksLikeFactura(object.invoice) ? object.invoice : null,
      looksLikeFactura(object.item) ? object.item : null,
      looksLikeFactura(object.detail) ? object.detail : null,
      looksLikeFactura(object.result) ? object.result : null,
      looksLikeFactura(object.data) ? object.data : null,
      looksLikeFactura(object.payload) ? object.payload : null,
      null
    ) || null
  );
}

function namedObjectFromPayload(payload = null, name = "") {
  const key = cleanText(name, "");

  if (!key) return {};

  const object = safeObject(unwrapEnvelope(payload), {});
  const original = safeObject(payload, {});

  return safeObject(
    first(
      object[key],
      object.data?.[key],
      object.payload?.[key],
      object.result?.[key],
      original[key],
      original.data?.[key],
      {}
    )
  );
}

/* =========================================================
   RELATIONS
========================================================= */

function relationIdFromArray(value = []) {
  for (const item of safeArray(value)) {
    if (typeof item === "string" && item.trim()) return item.trim();

    if (isObject(item)) {
      const id = cleanText(
        first(
          item.ticketId,
          item.incidenciaId,
          item.id,
          item.code,
          item.ticket?.ticketId,
          item.ticket?.id,
          item.incidencia?.ticketId,
          item.incidencia?.id
        ),
        ""
      );

      if (id) return id;
    }
  }

  return "";
}

function pickIncidenciaId(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  return cleanText(
    first(
      factura.ticketId,
      factura.incidenciaId,
      factura.relatedTicketId,
      factura.relatedIncidentId,
      factura.supportTicketId,
      factura.caseId,

      factura.ticket?.ticketId,
      factura.ticket?.incidenciaId,
      factura.ticket?.id,

      factura.incidencia?.ticketId,
      factura.incidencia?.incidenciaId,
      factura.incidencia?.id,

      factura.linkedTicket?.ticketId,
      factura.linkedTicket?.incidenciaId,
      factura.linkedTicket?.id,

      factura.relations?.ticket?.ticketId,
      factura.relations?.ticket?.incidenciaId,
      factura.relations?.ticket?.id,
      factura.relations?.incidencia?.ticketId,
      factura.relations?.incidencia?.incidenciaId,
      factura.relations?.incidencia?.id,

      factura.meta?.ticketId,
      factura.meta?.incidenciaId,
      factura.meta?.linkedTicketId,

      relationIdFromArray(factura.ticketIds),
      relationIdFromArray(factura.incidenciaIds),
      relationIdFromArray(factura.relatedTickets),
      relationIdFromArray(factura.relatedTicketIds),
      relationIdFromArray(factura.relatedIncidentIds),
      relationIdFromArray(factura.tickets),
      relationIdFromArray(factura.incidencias),

      raw.ticketId,
      raw.incidenciaId,
      raw.relatedTicketId,
      raw.relatedIncidentId,
      raw.supportTicketId,
      raw.caseId,

      raw.ticket?.ticketId,
      raw.ticket?.incidenciaId,
      raw.ticket?.id,

      raw.incidencia?.ticketId,
      raw.incidencia?.incidenciaId,
      raw.incidencia?.id,

      raw.linkedTicket?.ticketId,
      raw.linkedTicket?.incidenciaId,
      raw.linkedTicket?.id,

      raw.relations?.ticket?.ticketId,
      raw.relations?.ticket?.incidenciaId,
      raw.relations?.ticket?.id,
      raw.relations?.incidencia?.ticketId,
      raw.relations?.incidencia?.incidenciaId,
      raw.relations?.incidencia?.id,

      raw.meta?.ticketId,
      raw.meta?.incidenciaId,
      raw.meta?.linkedTicketId,

      relationIdFromArray(raw.ticketIds),
      relationIdFromArray(raw.incidenciaIds),
      relationIdFromArray(raw.relatedTickets),
      relationIdFromArray(raw.relatedTicketIds),
      relationIdFromArray(raw.relatedIncidentIds),
      relationIdFromArray(raw.tickets),
      relationIdFromArray(raw.incidencias)
    ),
    ""
  );
}

/* =========================================================
   DTO NORMALIZATION
========================================================= */

function normalizeLine(line = {}, index = 0) {
  const raw = safeObject(line);

  const quantity = number(first(raw.quantity, raw.cantidad, raw.qty, 1), 1);
  const unitPrice = number(first(raw.unitPrice, raw.precioUnitario, raw.price, raw.importeUnitario, 0), 0);
  const total = number(first(raw.total, raw.amount, raw.importe, quantity * unitPrice), quantity * unitPrice);
  const concept = safePublicText(first(raw.concept, raw.concepto, raw.description, raw.descripcion, raw.name), `Concepto ${index + 1}`);

  return {
    id: cleanText(first(raw.id, raw.lineId, `line-${index + 1}`), `line-${index + 1}`),
    concept,
    concepto: concept,
    description: safePublicText(first(raw.description, raw.descripcion, raw.concept, raw.concepto, concept), concept),
    descripcion: safePublicText(first(raw.descripcion, raw.description, raw.concepto, raw.concept, concept), concept),
    quantity,
    cantidad: quantity,
    unitPrice: round2(unitPrice),
    precio: round2(unitPrice),
    total: round2(total),
    importe: round2(total),
    taxRate: number(first(raw.taxRate, raw.iva, raw.vatRate, 0), 0),
  };
}

function normalizeAttachment(file = {}, index = 0) {
  const raw = safeObject(file);
  const name = safePublicText(first(raw.name, raw.filename, raw.fileName, raw.originalName, `adjunto-${index + 1}`), `adjunto-${index + 1}`);
  const contentType = cleanText(first(raw.contentType, raw.mimeType, raw.mimetype, raw.type, ""), "");
  const size = number(first(raw.size, raw.sizeBytes, raw.bytes, 0), 0);

  return {
    id: cleanText(first(raw.id, raw.attachmentId, raw.fileId, raw.blobName, name), name),
    name,
    filename: name,
    fileName: name,
    contentType: contentType || null,
    mimeType: contentType || null,
    size,
    sizeBytes: size,
    isPdf: normalizeKey(`${contentType} ${name}`).includes("pdf") || normalizeKey(name).endsWith("_pdf"),
  };
}

export function normalizeFactura(item = {}, options = {}) {
  const raw = safeObject(item);
  const rawNested = safeObject(raw.raw);
  const includeRaw = options?.includeRaw === true;

  const id = cleanText(
    first(
      raw.facturaId,
      raw.invoiceId,
      raw.id,
      raw._id,
      raw.number,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.numeroFactura,
      raw.numero,
      raw.code,
      rawNested.facturaId,
      rawNested.invoiceId,
      rawNested.id,
      rawNested._id,
      rawNested.number,
      rawNested.numeroFacturaLegal,
      rawNested.numeroFacturaSistema,
      rawNested.numeroFactura,
      rawNested.numero,
      rawNested.code
    ),
    ""
  );

  const numberValue = cleanText(
    first(
      raw.number,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.code,
      raw.numeroFacturaSistema,
      id
    ),
    id
  );

  const numeroFacturaLegal = cleanText(first(raw.numeroFacturaLegal, raw.numeroFactura, raw.invoiceNumber, numberValue), numberValue);
  const numeroFacturaSistema = cleanText(first(raw.numeroFacturaSistema, raw.systemInvoiceNumber, raw.numeroSistema, ""), "");

  const title = safePublicText(
    first(
      raw.title,
      raw.name,
      raw.conceptoPrincipal,
      raw.concepto,
      raw.descripcionPrincipal,
      raw.preview,
      numberValue
    ),
    numberValue || "Factura"
  );

  const estado = cleanText(first(raw.estado, raw.status, raw.invoiceStatus, raw.estadoFactura, ""), "");
  const paymentStatus = cleanText(first(raw.paymentStatus, raw.estadoPago, raw.payment?.status, estado, ""), "");

  const total = round2(
    first(
      raw.total,
      raw.amount,
      raw.importe,
      raw.importeTotal,
      raw.totalFactura,
      raw.facturaTotal,
      raw.facturaImporte,
      raw.importeFactura,
      raw.invoiceAmount,
      raw.totales?.total,
      raw.totals?.total,
      raw.resumen?.total,
      0
    )
  );

  const subtotal = round2(
    first(
      raw.subtotal,
      raw.baseImponible,
      raw.totales?.subtotal,
      raw.totals?.subtotal,
      raw.totales?.baseImponible,
      raw.totals?.baseImponible,
      0
    )
  );

  const tax = round2(
    first(
      raw.tax,
      raw.iva,
      raw.vat,
      raw.ivaTotal,
      raw.totales?.iva,
      raw.totals?.iva,
      raw.totales?.tax,
      raw.totals?.tax,
      0
    )
  );

  const paidAmount = round2(
    first(
      raw.paidAmount,
      raw.amountPaid,
      raw.pagado,
      raw.payment?.paidAmount,
      raw.totales?.pagado,
      ["paid", "pagada", "pagado"].includes(normalizeKey(paymentStatus)) ? total : 0
    )
  );

  const pendingAmount = round2(
    first(
      raw.pendingAmount,
      raw.amountPending,
      raw.pendiente,
      raw.payment?.pendingAmount,
      raw.totales?.pendiente,
      Math.max(0, total - paidAmount)
    )
  );

  const currency = cleanText(
    first(
      raw.currency,
      raw.moneda,
      raw.facturaCurrency,
      raw.totales?.currency,
      raw.totals?.currency,
      raw.payment?.currency,
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  ).toUpperCase();

  const incidenciaId = pickIncidenciaId(raw);

  const lines = safeArray(first(raw.lines, raw.lineas, raw.items, raw.concepts, raw.conceptos, [])).map(normalizeLine);
  const attachments = safeArray(first(raw.attachments, raw.files, raw.adjuntos, [])).map(normalizeAttachment);
  const attachmentsCount = number(first(raw.attachmentsCount, raw.filesCount, attachments.length), attachments.length);

  const clientName = safePublicText(
    first(
      raw.clientName,
      raw.clienteName,
      raw.clienteNombre,
      raw.customerName,
      raw.nombreContacto,
      raw.cliente?.displayName,
      raw.cliente?.name,
      raw.cliente?.nombre,
      raw.cliente?.nombreContacto,
      raw.client?.displayName,
      raw.client?.name,
      raw.customer?.displayName,
      raw.customer?.name
    ),
    "Cliente"
  );

  const companyName = safePublicText(
    first(
      raw.clienteEmpresa,
      raw.companyName,
      raw.company,
      raw.empresa,
      raw.razonSocial,
      raw.cliente?.razonSocial,
      raw.cliente?.empresa,
      raw.cliente?.companyName,
      raw.clienteSnapshot?.razonSocial,
      raw.clienteSnapshot?.empresa,
      raw.clienteSnapshot?.companyName,
      clientName
    ),
    clientName
  );

  const emailCliente = cleanText(first(raw.clienteEmail, raw.emailCliente, raw.clientEmail, raw.customerEmail, raw.email, raw.cliente?.email, raw.client?.email), "").toLowerCase();
  const clienteAvatar = safeUrl(first(raw.clienteAvatar, raw.clientAvatar, raw.avatar, raw.avatarUrl, raw.cliente?.avatar, raw.cliente?.avatarUrl, raw.cliente?.logo, raw.cliente?.logoUrl, ""));

  const issuedAt = first(raw.issuedAt, raw.fechaFactura, raw.fechaFacturaISO, raw.invoiceDate, raw.date, raw.createdAt, null);
  const updatedAt = first(raw.updatedAt, raw.modifiedAt, raw.fechaActualizacion, raw.lifecycle?.updatedAt, raw.sentAt, raw.fechaEnvio, raw.createdAt, null);
  const sentAt = first(raw.sentAt, raw.fechaEnvio, raw.mailSentAt, raw.email?.sentAt, raw.delivery?.sentAt, raw.delivery?.lastSentAt, null);
  const hasPdf = Boolean(first(raw.hasPdf, raw.pdfAvailable, raw.pdfUrl, raw.viewUrl, raw.downloadUrl, raw.file?.url, raw.file?.viewUrl, raw.file?.downloadUrl, raw.blobPath, raw.pdfPath, ""));
  const sent = Boolean(raw.delivery?.sent === true || raw.meta?.isSent === true || sentAt);

  const normalized = {
    id,
    facturaId: id,
    invoiceId: id,

    number: numberValue,
    numero: numberValue,
    code: numberValue,
    numeroFactura: numeroFacturaLegal,
    numeroFacturaLegal,
    numeroFacturaSistema,
    invoiceNumber: numeroFacturaLegal,

    title,
    name: title,
    concepto: safePublicText(first(raw.concepto, raw.conceptoPrincipal, title), title),
    preview: safePublicText(first(raw.preview, raw.description, raw.descripcion, title), title),
    description: safePublicText(first(raw.description, raw.descripcion, raw.preview, title), title),
    descripcion: safePublicText(first(raw.descripcion, raw.description, raw.preview, title), title),

    status: estado,
    estado: cleanText(first(raw.estado, estado), estado),
    estadoFactura: cleanText(first(raw.estadoFactura, estado), estado),
    paymentStatus,
    estadoPago: cleanText(first(raw.estadoPago, paymentStatus), paymentStatus),
    estadoPagoLabel: cleanText(first(raw.estadoPagoLabel, ""), ""),

    total,
    amount: total,
    importe: total,
    importeTotal: total,
    totalFactura: total,
    facturaTotal: total,
    invoiceAmount: total,

    subtotal,
    baseImponible: subtotal,
    tax,
    iva: tax,
    ivaTotal: tax,
    irpf: round2(first(raw.irpf, raw.irpfTotal, raw.retencionesTotal, 0)),
    irpfTotal: round2(first(raw.irpfTotal, raw.irpf, raw.retencionesTotal, 0)),

    paidAmount,
    paid: paidAmount,
    pagado: paidAmount,
    pendingAmount,
    pendiente: pendingAmount,

    currency,
    moneda: currency,
    facturaCurrency: currency,

    formaPago: cleanText(first(raw.formaPago, raw.metodoPago, raw.paymentMethod, raw.payment?.method, "—"), "—"),
    metodoPago: cleanText(first(raw.metodoPago, raw.formaPago, raw.paymentMethod, raw.payment?.method, "—"), "—"),
    paymentMethod: cleanText(first(raw.paymentMethod, raw.metodoPago, raw.formaPago, raw.payment?.method, "—"), "—"),

    clienteId: cleanText(first(raw.clienteId, raw.clientId, raw.customerId, raw.cliente?.clienteId, raw.cliente?.id), ""),
    clientId: cleanText(first(raw.clientId, raw.clienteId, raw.customerId, raw.client?.id), ""),
    customerId: cleanText(first(raw.customerId, raw.clientId, raw.clienteId), ""),
    userId: cleanText(first(raw.userId, raw.usuarioId, raw.cliente?.userId), ""),
    clienteIds: safeArray(raw.clienteIds),
    userIds: safeArray(raw.userIds),

    clientName,
    clienteName: clientName,
    clienteNombre: clientName,
    nombreContacto: clientName,
    contactName: clientName,
    customerName: clientName,

    clienteEmpresa: companyName,
    empresa: companyName,
    company: companyName,
    companyName,
    razonSocial: companyName,

    clienteEmail: emailCliente,
    emailCliente,
    clientEmail: emailCliente,
    customerEmail: emailCliente,
    email: emailCliente,

    clienteAvatar,
    clientAvatar: clienteAvatar,
    avatar: clienteAvatar,
    avatarUrl: clienteAvatar,

    cliente: {
      ...safeObject(raw.cliente),
      id: cleanText(first(raw.cliente?.id, raw.clienteId, raw.clientId, raw.customerId), "") || null,
      clienteId: cleanText(first(raw.cliente?.clienteId, raw.clienteId, raw.clientId, raw.customerId), "") || null,
      userId: cleanText(first(raw.cliente?.userId, raw.userId), "") || null,
      nombre: clientName,
      name: clientName,
      displayName: clientName,
      email: emailCliente,
      emailLower: emailCliente,
      avatar: clienteAvatar || null,
      avatarUrl: clienteAvatar || null,
      empresa: companyName,
      razonSocial: companyName,
      companyName,
    },
    clientes: safeArray(raw.clientes),
    clientesSnapshot: safeArray(raw.clientesSnapshot),

    ticketId: incidenciaId,
    incidenciaId,
    relatedTicketId: incidenciaId,
    relatedIncidentId: incidenciaId,
    ticketIds: safeArray(first(raw.ticketIds, raw.incidenciaIds, incidenciaId ? [incidenciaId] : [])),
    incidenciaIds: safeArray(first(raw.incidenciaIds, raw.ticketIds, incidenciaId ? [incidenciaId] : [])),
    ticket: safeObject(first(raw.ticket, raw.incidencia, raw.linkedTicket, {})),
    incidencia: safeObject(first(raw.incidencia, raw.ticket, raw.linkedTicket, {})),
    linkedTicket: safeObject(first(raw.linkedTicket, raw.incidencia, raw.ticket, {})),
    tickets: safeArray(first(raw.tickets, raw.incidencias, [])),
    incidencias: safeArray(first(raw.incidencias, raw.tickets, [])),
    relations: safeObject(raw.relations),
    relationType: cleanText(first(raw.relationType, raw.meta?.relationType, incidenciaId ? "linked_ticket" : ""), ""),

    hasIncidencia: Boolean(incidenciaId),
    hasLinkedTicket: Boolean(incidenciaId),

    lines,
    lineas: lines,
    items: lines,
    conceptos: lines,
    lineasCount: number(first(raw.lineasCount, raw.linesCount, lines.length), lines.length),

    pdfUrl: safeUrl(first(raw.pdfUrl, raw.file?.url, raw.file?.viewUrl, "")),
    viewUrl: safeUrl(first(raw.viewUrl, raw.pdfUrl, raw.file?.viewUrl, "")),
    downloadUrl: safeUrl(first(raw.downloadUrl, raw.file?.downloadUrl, "")),
    blobPath: cleanText(first(raw.blobPath, raw.pdfPath, raw.blobName, raw.document?.blobPath, ""), ""),
    blobName: cleanText(first(raw.blobName, raw.blobPath, raw.pdfPath, ""), ""),
    pdfPath: cleanText(first(raw.pdfPath, raw.blobPath, raw.blobName, ""), ""),
    hasPdf,
    pdfAvailable: Boolean(first(raw.pdfAvailable, hasPdf)),

    attachments,
    files: attachments,
    adjuntos: attachments,
    attachmentsCount,
    filesCount: attachmentsCount,

    links: safeObject(raw.links),

    createdAt: first(raw.createdAt, raw.fechaCreacion, raw.date, issuedAt, null),
    issuedAt,
    issueDate: first(raw.issueDate, issuedAt, null),
    invoiceDate: first(raw.invoiceDate, issuedAt, null),
    fecha: first(raw.fecha, issuedAt, null),
    fechaFactura: first(raw.fechaFactura, issuedAt, null),
    fechaFacturaISO: first(raw.fechaFacturaISO, issuedAt, null),
    dueAt: first(raw.dueAt, raw.fechaVencimiento, raw.vencimiento, null),
    paidAt: first(raw.paidAt, raw.fechaPago, raw.payment?.paidAt, null),
    fechaPago: first(raw.fechaPago, raw.paidAt, raw.payment?.paidAt, null),
    updatedAt,
    sentAt,
    fechaEnvio: sentAt,
    mailSentAt: first(raw.mailSentAt, sentAt, null),

    delivery: {
      ...safeObject(raw.delivery),
      sent,
      sentAt,
      sentTo: cleanText(first(raw.delivery?.sentTo, raw.enviadoA, emailCliente), "") || null,
      sentToAll: safeArray(raw.delivery?.sentToAll),
    },

    payment: {
      ...safeObject(raw.payment),
      status: paymentStatus,
      estadoPago: paymentStatus,
      paidAmount,
      pendingAmount,
      currency,
    },

    raw: includeRaw ? raw : undefined,

    meta: {
      ...safeObject(raw.meta),
      timestampMs: number(first(raw.meta?.timestampMs, toTimestamp(updatedAt), toTimestamp(issuedAt), toTimestamp(raw.createdAt)), 0),
      hasIncidencia: Boolean(incidenciaId),
      hasLinkedTicket: Boolean(incidenciaId),
      hasTicket: Boolean(incidenciaId),
      hasPdf,
      isSent: sent,
      incidenciaId,
      ticketId: incidenciaId,
      ticketIds: safeArray(first(raw.ticketIds, raw.incidenciaIds, incidenciaId ? [incidenciaId] : [])),
      incidenciaIds: safeArray(first(raw.incidenciaIds, raw.ticketIds, incidenciaId ? [incidenciaId] : [])),
    },
  };

  if (!includeRaw) {
    delete normalized.raw;
  }

  return normalized;
}

function normalizeFacturas(items = [], options = {}) {
  const preserveOrder = options?.preserveOrder !== false;
  const includeRaw = options?.includeRaw === true;
  const map = new Map();

  for (const item of safeArray(items)) {
    const factura = normalizeFactura(item, { includeRaw });
    const id = cleanText(first(factura.id, factura.facturaId, factura.number), "");

    if (!id) continue;
    if (!map.has(id)) map.set(id, factura);
  }

  const rows = [...map.values()];

  if (preserveOrder) return rows;

  return rows.sort((a, b) => {
    const left = toTimestamp(first(a.issuedAt, a.fechaFactura, a.updatedAt, a.createdAt));
    const right = toTimestamp(first(b.issuedAt, b.fechaFactura, b.updatedAt, b.createdAt));

    return right - left;
  });
}

export function normalizeIncidenciaForFactura(item = {}) {
  const raw = safeObject(item);

  const id = cleanText(first(raw.ticketId, raw.incidenciaId, raw.id, raw.code, raw.numero), "");

  return {
    id,
    ticketId: id,
    incidenciaId: id,
    subject: safePublicText(first(raw.subject, raw.asunto, raw.title, raw.name), "Incidencia"),
    title: safePublicText(first(raw.title, raw.subject, raw.asunto, raw.name), "Incidencia"),
    status: cleanText(first(raw.status, raw.estado, raw.state), "open"),
    priority: cleanText(first(raw.priority, raw.prioridad, raw.severity), "medium"),
    requesterName: safePublicText(first(raw.requesterName, raw.userName, raw.clientName, raw.clienteName), "Usuario"),
    clienteId: cleanText(first(raw.clienteId, raw.clientId, raw.cliente?.clienteId), ""),
    userId: cleanText(first(raw.userId, raw.usuarioId, raw.userRef?.userId), ""),
    createdAt: first(raw.createdAt, raw.fechaCreacion, raw.created_at, null),
    updatedAt: first(raw.updatedAt, raw.updated_at, raw.lastActivityAt, raw.createdAt, null),
  };
}

/* =========================================================
   NORMALIZED RESPONSES
========================================================= */

export function normalizeFacturasListResponse(payload = null, requestMeta = {}) {
  const rawItems = listFromPayload(payload);
  const items = normalizeFacturas(rawItems, {
    preserveOrder: true,
    includeRaw: requestMeta.includeRaw === true,
  });

  const paging = pagingFromPayload(payload, requestMeta, items.length);
  const total = paging.total;
  const envelope = safeObject(unwrapEnvelope(payload), {});

  return {
    ok: envelope.ok !== false,
    success: envelope.success !== false,
    requestId: first(envelope.requestId, safeObject(payload).requestId, null),

    items,
    facturas: items,
    data: items,
    invoices: items,

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
    fetchLimit: paging.fetchLimit,

    paging,

    stats: safeObject(first(namedObjectFromPayload(payload, "stats"), {})),
    statsAllMatched: safeObject(first(namedObjectFromPayload(payload, "statsAllMatched"), {})),
    filters: safeObject(first(namedObjectFromPayload(payload, "filters"), {})),
    diagnostics: safeObject(first(namedObjectFromPayload(payload, "diagnostics"), {})),

    meta: {
      ...metaFromPayload(payload),
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
    message: cleanText(
      first(
        safeObject(payload).message,
        safeObject(payload).data?.message,
        safeObject(payload).result?.message,
        "Factura enviada correctamente."
      ),
      "Factura enviada correctamente."
    ),
    meta: metaFromPayload(payload),
  };
}

export function normalizeFacturaPdfResponse(response = null, fallback = {}) {
  if (isBlob(response)) {
    return {
      ok: true,
      blob: response,
      size: response.size,
      contentType: response.type || "application/pdf",
      filename: cleanText(fallback.filename, "factura.pdf"),
    };
  }

  const object = safeObject(response);
  const blob = first(object.blob, object.data?.blob, object.file?.blob, null);

  const url = safeUrl(
    first(
      object.url,
      object.viewUrl,
      object.downloadUrl,
      object.pdfUrl,
      object.file?.url,
      object.file?.viewUrl,
      object.file?.downloadUrl,
      object.data?.url,
      object.data?.viewUrl,
      object.data?.downloadUrl,
      fallback.url,
      ""
    )
  );

  return {
    ok: Boolean(blob || url || object.ok !== false),
    blob: isBlob(blob) ? blob : null,
    url,
    viewUrl: safeUrl(first(object.viewUrl, object.file?.viewUrl, url)),
    downloadUrl: safeUrl(first(object.downloadUrl, object.file?.downloadUrl, url)),
    filename: cleanText(first(object.filename, object.fileName, object.file?.filename, fallback.filename), "factura.pdf"),
    contentType: cleanText(first(object.contentType, object.type, object.file?.contentType), "application/pdf"),
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

  const incidenciaId = cleanText(
    first(
      source.ticketId,
      source.incidenciaId,
      source.relatedTicketId,
      source.relatedIncidentId,
      source.ticket?.ticketId,
      source.incidencia?.ticketId
    ),
    ""
  );

  const clienteId = cleanText(first(source.clienteId, source.clientId, source.customerId), "");
  const clienteNombre = cleanText(first(source.clienteNombre, source.clientName, source.clienteName, source.customerName), "");
  const clienteEmail = cleanText(first(source.clienteEmail, source.emailCliente, source.clientEmail, source.customerEmail), "");

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

    paymentStatus: cleanText(first(source.paymentStatus, source.estadoPago, "pending"), "pending"),
    estadoPago: cleanText(first(source.estadoPago, source.paymentStatus, "pending"), "pending"),

    ...(clienteId
      ? {
          clienteId,
          clientId: clienteId,
          customerId: clienteId,
        }
      : {}),

    ...(clienteNombre
      ? {
          clienteNombre,
          clientName: clienteNombre,
          clienteName: clienteNombre,
        }
      : {}),

    ...(clienteEmail
      ? {
          clienteEmail,
          emailCliente: clienteEmail,
          clientEmail: clienteEmail,
        }
      : {}),

    ...(incidenciaId
      ? {
          ticketId: incidenciaId,
          incidenciaId,
          relatedTicketId: incidenciaId,
          relatedIncidentId: incidenciaId,
        }
      : {}),
  };
}

/* =========================================================
   HTTP
========================================================= */

async function getJson(endpoint = "", options = {}) {
  return Http.get(endpoint, {
    timeout: options.timeout || FACTURAS_TIMEOUT,
    query: safeObject(options.query || options.params),
    source: options.source || "views.facturas",
  });
}

async function postJson(endpoint = "", body = {}, options = {}) {
  return Http.post(endpoint, body, {
    timeout: options.timeout || FACTURAS_TIMEOUT,
    source: options.source || "views.facturas",
  });
}

async function putJson(endpoint = "", body = {}, options = {}) {
  if (!isFunction(Http.put)) {
    return patchJson(endpoint, body, options);
  }

  return Http.put(endpoint, body, {
    timeout: options.timeout || FACTURAS_TIMEOUT,
    source: options.source || "views.facturas",
  });
}

async function patchJson(endpoint = "", body = {}, options = {}) {
  if (!isFunction(Http.patch)) {
    return postJson(endpoint, body, options);
  }

  return Http.patch(endpoint, body, {
    timeout: options.timeout || FACTURAS_TIMEOUT,
    source: options.source || "views.facturas",
  });
}

async function deleteJson(endpoint = "", options = {}) {
  const fn = Http.delete || Http.del;

  if (!isFunction(fn)) {
    throw new Error("FACTURAS_DELETE_UNAVAILABLE");
  }

  return fn.call(Http, endpoint, {
    timeout: options.timeout || FACTURAS_TIMEOUT,
    source: options.source || "views.facturas",
  });
}

async function blobRequest(endpoint = "", options = {}) {
  if (isFunction(Http.blob)) {
    return Http.blob(endpoint, {
      timeout: options.timeout || FACTURAS_PDF_TIMEOUT,
      source: options.source || "views.facturas.blob",
    });
  }

  if (isFunction(Http.downloadBlob)) {
    return Http.downloadBlob(endpoint, {
      timeout: options.timeout || FACTURAS_PDF_TIMEOUT,
      autoDownload: false,
      filename: options.filename,
      source: options.source || "views.facturas.blob",
    });
  }

  if (isFunction(Http.get)) {
    return Http.get(endpoint, {
      timeout: options.timeout || FACTURAS_PDF_TIMEOUT,
      responseType: "blob",
      source: options.source || "views.facturas.blob",
    });
  }

  throw new Error("FACTURAS_BLOB_UNAVAILABLE");
}

async function downloadBlobRequest(endpoint = "", options = {}) {
  if (isFunction(Http.downloadBlob)) {
    return Http.downloadBlob(endpoint, {
      timeout: options.timeout || FACTURAS_PDF_TIMEOUT,
      autoDownload: options.autoDownload !== false,
      filename: options.filename,
      source: options.source || "views.facturas.download",
    });
  }

  return blobRequest(endpoint, options);
}

/* =========================================================
   LIST / DETAIL / STATS
========================================================= */

export async function fetchFacturasRequest(options = {}) {
  const query = buildListQuery(options);

  return getJson(FACTURAS_ENDPOINT, {
    timeout: options.timeout || FACTURAS_LIST_TIMEOUT,
    query,
    source: "views.facturas.list",
  });
}

export async function listFacturas(options = {}) {
  const query = buildListQuery(options);
  const queryKey = `list:${stableStringify(query)}`;

  if (options.dedupe !== false && inflight.has(queryKey)) {
    return inflight.get(queryKey);
  }

  loading = true;
  lastError = null;

  const task = (async () => {
    try {
      const response = await getJson(FACTURAS_ENDPOINT, {
        timeout: options.timeout || FACTURAS_LIST_TIMEOUT,
        query,
        source: "views.facturas.list",
      });

      const normalized = normalizeFacturasListResponse(response, {
        ...options,
        ...query,
      });

      const cacheAppend = options.cacheAppend === true || options.appendToCache === true;
      const cachedItems = cacheAppend
        ? mergeById([...lastList.items, ...normalized.items])
        : normalized.items;

      lastList = {
        items: cachedItems,
        total: normalized.total,
        queryKey,
      };

      if (normalized.stats && Object.keys(normalized.stats).length) {
        lastStats = normalized.stats;
      }

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

  if (options.dedupe !== false && inflight.has(key)) {
    return inflight.get(key);
  }

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

  if (options.dedupe !== false && inflight.has(key)) {
    return inflight.get(key);
  }

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
  const body = normalizeFacturaPayload(payload);

  const response = await postJson(FACTURAS_ENDPOINT, body, {
    timeout: options.timeout || FACTURAS_CREATE_TIMEOUT,
    source: "views.facturas.create",
  });

  return normalizeFacturaCreateResponse(response);
}

export async function createFactura(payload = {}, options = {}) {
  const response = await createFacturaRequest(payload, options);
  const created = response.item;

  if (created) {
    const nextItems = mergeById([normalizeFactura(created), ...lastList.items]);

    lastList = {
      ...lastList,
      items: nextItems,
      total: Math.max(number(lastList.total, 0) + 1, nextItems.length),
    };
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
    items: lastList.items.filter((item) => {
      return item.id !== facturaId && item.facturaId !== facturaId && item.invoiceId !== facturaId;
    }),
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
   PDF
========================================================= */

export async function viewFacturaPdfRequest(id = "", options = {}) {
  const facturaId = normalizeFacturaId(id);
  const endpoint = getFacturaPdfEndpoint(facturaId, FACTURA_PDF_MODES.VIEW);

  const response = await blobRequest(endpoint, {
    timeout: options.timeout || FACTURAS_PDF_TIMEOUT,
    filename: options.filename || resolveFacturaPdfFilename(facturaId, options),
    source: "views.facturas.pdf.view",
  });

  return normalizeFacturaPdfResponse(response, {
    filename: options.filename || resolveFacturaPdfFilename(facturaId, options),
  });
}

export async function downloadFacturaPdfRequest(id = "", options = {}) {
  const facturaId = normalizeFacturaId(id);
  const endpoint = getFacturaPdfEndpoint(facturaId, FACTURA_PDF_MODES.DOWNLOAD);

  return downloadBlobRequest(endpoint, {
    timeout: options.timeout || FACTURAS_PDF_TIMEOUT,
    autoDownload: options.autoDownload !== false,
    filename: options.filename || resolveFacturaPdfFilename(facturaId, options),
    source: "views.facturas.pdf.download",
  });
}

export async function fetchFacturaPdfRequest(
  id = "",
  mode = FACTURA_PDF_MODES.DOWNLOAD,
  options = {}
) {
  const normalizedMode = normalizeKey(mode);

  return ["view", "inline", "ver"].includes(normalizedMode)
    ? viewFacturaPdfRequest(id, options)
    : downloadFacturaPdfRequest(id, options);
}

/* =========================================================
   INCIDENCIAS VINCULABLES
========================================================= */

function listFromTicketPayload(payload = null) {
  if (Array.isArray(payload)) return payload;

  const object = safeObject(unwrapEnvelope(payload), {});

  for (const key of [
    "items",
    "rows",
    "records",
    "results",
    "docs",
    "documents",
    "value",
    "list",
    "tickets",
    "incidencias",
  ]) {
    if (Array.isArray(object[key])) return object[key];
  }

  return [];
}

export async function searchFacturaIncidencias({
  q = "",
  search = "",
  limit = 12,
  includeClosed = true,
} = {}) {
  const query = cleanText(first(q, search), "");

  if (query.length < 2) return [];

  const finalLimit = Math.min(Math.max(1, number(limit, 12)), 25);
  const key = `incidencias:${query}:${finalLimit}:${includeClosed ? "1" : "0"}`;

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const task = (async () => {
    const response = await getJson(FACTURAS_TICKETS_ENDPOINT, {
      timeout: FACTURAS_LIST_TIMEOUT,
      query: {
        q: query,
        search: query,
        limit: finalLimit,
        includeTotal: false,
        includeClosed,
      },
      source: "views.facturas.search-incidencias",
    });

    return listFromTicketPayload(response)
      .map(normalizeIncidenciaForFactura)
      .filter((item) => item.id)
      .slice(0, finalLimit);
  })();

  return setInflight(key, task);
}

/* =========================================================
   DOMAIN HELPERS
========================================================= */

export function hasFacturaIncidencia(item = {}) {
  return Boolean(pickIncidenciaId(item));
}

export function getFacturaIncidenciaId(item = {}) {
  return pickIncidenciaId(item);
}

export function getFacturaStableId(item = {}) {
  const factura = safeObject(item);

  return cleanText(
    first(
      factura.id,
      factura.facturaId,
      factura.invoiceId,
      factura.number,
      factura.numeroFacturaLegal,
      factura.numeroFacturaSistema,
      factura.numeroFactura,
      factura.numero,
      factura.invoiceNumber
    ),
    ""
  );
}

export function getFacturaAmount(item = {}) {
  const factura = safeObject(item);

  return round2(
    first(
      factura.total,
      factura.amount,
      factura.importe,
      factura.importeTotal,
      factura.totalFactura,
      factura.invoiceAmount,
      factura.facturaTotal,
      factura.facturaImporte,
      factura.importeFactura,
      factura.totales?.total,
      factura.totals?.total,
      factura.resumen?.total,
      0
    )
  );
}

export function computeFacturasStats(items = lastList.items) {
  const rows = safeArray(items);

  return rows.reduce(
    (acc, item) => {
      acc.total += 1;

      const payment = normalizeKey(first(item.paymentStatus, item.estadoPago, item.status, item.estado));
      const amount = getFacturaAmount(item);

      if (["paid", "pagada", "pagado", "completed", "complete"].includes(payment)) {
        acc.paid += 1;
        acc.paidAmount += amount;
      } else {
        acc.pending += 1;
        acc.pendingAmount += amount;
      }

      if (hasFacturaIncidencia(item)) {
        acc.withIncidencia += 1;
      }

      if (item.hasPdf || item.pdfAvailable || item.meta?.hasPdf || item.pdfUrl || item.viewUrl || item.downloadUrl) {
        acc.withPdf += 1;
      }

      if (item.delivery?.sent || item.meta?.isSent || item.sentAt || item.fechaEnvio) {
        acc.sent += 1;
      }

      acc.amount += amount;

      return acc;
    },
    {
      total: 0,
      paid: 0,
      pending: 0,
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
  lastList = {
    items: [],
    total: 0,
    queryKey: "",
  };

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
      noStore: true,
      noStateExternal: true,
      noModelExternal: true,
      noUtilsExternal: true,
      noDom: true,
      noRouter: true,
      preservesBackendOrder: true,
      dedupeInflightRequests: true,
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
