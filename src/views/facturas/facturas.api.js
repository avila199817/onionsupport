/* =========================================================
   Onion SPA - Facturas API
   Archivo: src/views/facturas/facturas.api.js

   API simple del módulo Facturas:
   - sin shared/api
   - sin apiClient paralelo
   - sin lógica enterprise
   - usa AppCore.http / AppCore.apiClient / AppCore.request
   - endpoints backend reales bajo /api/facturas
   - normaliza respuestas habituales sin pelearse con Cosmos
========================================================= */

import { AppCore } from "../../core/index.js";
import { normalizeFactura } from "./facturas.model.js";

import {
  safeText,
  safeNumber,
  safeArray,
} from "./facturas.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const FACTURAS_RESOURCE = "facturas";
export const FACTURAS_ENDPOINT = "/api/facturas";

export const FACTURAS_TIMEOUT = 15000;
export const FACTURAS_LIST_TIMEOUT = 18000;
export const FACTURAS_DETAIL_TIMEOUT = 16000;
export const FACTURAS_STATS_TIMEOUT = 18000;
export const FACTURAS_PDF_TIMEOUT = 45000;
export const FACTURAS_SEND_TIMEOUT = 30000;
export const FACTURAS_CREATE_TIMEOUT = 45000;

export const FACTURAS_DEFAULT_PAGE = 1;
export const FACTURAS_DEFAULT_LIMIT = 100;
export const FACTURAS_MAX_LIMIT = 200;

export const FACTURAS_DISPOSITIONS = Object.freeze({
  INLINE: "inline",
  ATTACHMENT: "attachment",
});

export const FACTURAS_PDF_MODES = Object.freeze({
  INLINE: "inline",
  VIEW: "view",
  VER: "ver",
  DOWNLOAD: "download",
  ATTACHMENT: "attachment",
});

export const FACTURAS_ENDPOINTS = Object.freeze({
  collection: FACTURAS_ENDPOINT,

  health: () => `${FACTURAS_ENDPOINT}/health`,
  healthPing: () => `${FACTURAS_ENDPOINT}/health/ping`,
  healthPrivate: () => `${FACTURAS_ENDPOINT}/_health`,
  stats: () => `${FACTURAS_ENDPOINT}/stats`,

  detail: (id) => getFacturaEndpoint(id),

  view: (id) => `${getFacturaEndpoint(id)}/view`,
  pdf: (id) => `${getFacturaEndpoint(id)}/view`,
  ver: (id) => `${getFacturaEndpoint(id)}/view`,

  download: (id) => `${getFacturaEndpoint(id)}/download`,
  descargar: (id) => `${getFacturaEndpoint(id)}/download`,

  pdfByDisposition: (id, disposition = FACTURAS_DISPOSITIONS.ATTACHMENT) =>
    buildFacturaPdfEndpoint(id, disposition),

  send: (id) => `${getFacturaEndpoint(id)}/send`,
  sendAlias: (id) => `${getFacturaEndpoint(id)}/send`,
});

/* =========================================================
   BASIC HELPERS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function hasKeys(value) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }

  return null;
}

function round2(value = 0) {
  const n = safeNumber(value, 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeQueryValue(value) {
  if (value === undefined || value === null) return "";

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  return String(value).trim();
}

function appendParam(params, name, value) {
  const key = safeText(name, "");
  if (!key) return;

  if (Array.isArray(value)) {
    const list = value
      .map((item) => normalizeQueryValue(item))
      .filter(Boolean);

    if (list.length) params.set(key, list.join(","));
    return;
  }

  const text = normalizeQueryValue(value);
  if (text) params.set(key, text);
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[FacturasApi]", ...args);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn("[FacturasApi]", ...args);
    }
  } catch {}
}

/* =========================================================
   HTTP CLIENT
========================================================= */

function getModule(name = "") {
  try {
    return AppCore?.modules?.get?.(name) || null;
  } catch {
    return null;
  }
}

export function getApiClient() {
  const client =
    AppCore?.Http ||
    AppCore?.http ||
    AppCore?.apiClient ||
    getModule("Http") ||
    getModule("http") ||
    getModule("api") ||
    getModule("apiClient") ||
    null;

  if (client) return client;

  if (typeof AppCore?.request === "function") {
    return AppCore.request;
  }

  throw new Error("FACTURAS_API_CLIENT_UNAVAILABLE");
}

function buildRequestOptions({
  timeout = FACTURAS_TIMEOUT,
  auth = true,
  responseType = "json",
  raw = false,
  cache = undefined,
  ...rest
} = {}) {
  return {
    timeout,
    auth,
    responseType,
    raw,
    ...(cache ? { cache } : {}),
    ...rest,
  };
}

async function apiRequest(method = "GET", endpoint = "", body = undefined, options = {}) {
  const client = getApiClient();
  const finalMethod = safeText(method, "GET").toUpperCase();
  const requestOptions = buildRequestOptions(options);

  if (!endpoint) {
    throw new Error("FACTURAS_API_ENDPOINT_REQUIRED");
  }

  if (typeof client === "function") {
    return client(endpoint, {
      method: finalMethod,
      ...(body !== undefined ? { body } : {}),
      ...requestOptions,
    });
  }

  if (finalMethod === "GET" && typeof client.get === "function") {
    return client.get(endpoint, requestOptions);
  }

  if (finalMethod === "POST" && typeof client.post === "function") {
    return client.post(endpoint, body, requestOptions);
  }

  if (finalMethod === "PUT" && typeof client.put === "function") {
    return client.put(endpoint, body, requestOptions);
  }

  if (finalMethod === "PATCH" && typeof client.patch === "function") {
    return client.patch(endpoint, body, requestOptions);
  }

  if (finalMethod === "DELETE") {
    if (typeof client.delete === "function") {
      return client.delete(endpoint, requestOptions);
    }

    if (typeof client.del === "function") {
      return client.del(endpoint, requestOptions);
    }

    if (typeof client.remove === "function") {
      return client.remove(endpoint, requestOptions);
    }
  }

  if (typeof client.request === "function") {
    return client.request(endpoint, {
      method: finalMethod,
      ...(body !== undefined ? { body } : {}),
      ...requestOptions,
    });
  }

  throw new Error(`FACTURAS_API_METHOD_UNAVAILABLE:${finalMethod}`);
}

const apiGet = (endpoint, options) =>
  apiRequest("GET", endpoint, undefined, options);

const apiPost = (endpoint, body, options) =>
  apiRequest("POST", endpoint, body, options);

const apiPut = (endpoint, body, options) =>
  apiRequest("PUT", endpoint, body, options);

const apiPatch = (endpoint, body, options) =>
  apiRequest("PATCH", endpoint, body, options);

const apiDelete = (endpoint, options) =>
  apiRequest("DELETE", endpoint, undefined, options);

/* =========================================================
   ENDPOINTS
========================================================= */

export function normalizeFacturaId(id = "") {
  const facturaId = safeText(id, "");

  if (!facturaId) {
    throw new Error("FACTURA_ID_REQUIRED");
  }

  return facturaId;
}

export function getFacturaEndpoint(id = "") {
  return `${FACTURAS_ENDPOINT}/${encodeURIComponent(normalizeFacturaId(id))}`;
}

export function normalizeFacturaPdfDisposition(disposition = "") {
  const value = safeText(disposition, FACTURAS_DISPOSITIONS.ATTACHMENT)
    .toLowerCase()
    .trim();

  return (
    value === FACTURAS_DISPOSITIONS.INLINE ||
    value === FACTURAS_PDF_MODES.INLINE ||
    value === FACTURAS_PDF_MODES.VIEW ||
    value === FACTURAS_PDF_MODES.VER
  )
    ? FACTURAS_DISPOSITIONS.INLINE
    : FACTURAS_DISPOSITIONS.ATTACHMENT;
}

export function buildFacturaPdfEndpoint(
  id = "",
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT
) {
  const finalDisposition = normalizeFacturaPdfDisposition(disposition);

  return finalDisposition === FACTURAS_DISPOSITIONS.INLINE
    ? FACTURAS_ENDPOINTS.view(id)
    : FACTURAS_ENDPOINTS.download(id);
}

export function buildFacturaPdfViewEndpoint(id = "") {
  return FACTURAS_ENDPOINTS.view(id);
}

export function buildFacturaDownloadEndpoint(id = "") {
  return FACTURAS_ENDPOINTS.download(id);
}

export function buildFacturasListEndpoint({
  page = FACTURAS_DEFAULT_PAGE,
  limit = FACTURAS_DEFAULT_LIMIT,
  search = "",
  q = "",
  sort = "",
  direction = "",
  sortBy = "",
  sortDir = "",
  filters = {},
} = {}) {
  const params = new URLSearchParams();

  const finalPage = Math.max(1, safeNumber(page, FACTURAS_DEFAULT_PAGE));
  const finalLimit = Math.min(
    Math.max(1, safeNumber(limit, FACTURAS_DEFAULT_LIMIT)),
    FACTURAS_MAX_LIMIT
  );

  if (finalPage !== FACTURAS_DEFAULT_PAGE) {
    params.set("page", String(finalPage));
  }

  params.set("limit", String(finalLimit));

  const finalSearch = safeText(first(search, q), "");
  if (finalSearch) {
    params.set("q", finalSearch);
    params.set("search", finalSearch);
  }

  const finalSort = safeText(first(sort, sortBy), "");
  if (finalSort) {
    params.set("sort", finalSort);
    params.set("sortBy", finalSort);
  }

  const finalDirection = safeText(first(direction, sortDir), "");
  if (finalDirection) {
    params.set("direction", finalDirection);
    params.set("sortDir", finalDirection);
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
    hasPdf: "withPdf",
  };

  Object.entries(asObject(filters)).forEach(([rawKey, value]) => {
    const key = safeText(rawKey, "");
    if (!key) return;

    appendParam(params, key, value);

    if (aliases[key]) {
      appendParam(params, aliases[key], value);
    }
  });

  const query = params.toString();

  return query ? `${FACTURAS_ENDPOINT}?${query}` : FACTURAS_ENDPOINT;
}

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function candidates(payload = null) {
  const obj = asObject(payload, null);

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

    obj.result?.data,
    obj.result?.payload,

    obj.payload?.data,
    obj.payload?.result,
  ].filter((item) => item !== undefined && item !== null);
}

function extractOk(payload = null, fallback = true) {
  for (const candidate of candidates(payload)) {
    const obj = asObject(candidate, null);
    if (!obj) continue;

    if (typeof obj.ok === "boolean") return obj.ok;
    if (typeof obj.success === "boolean") return obj.success;
  }

  return fallback;
}

function extractRequestId(payload = null) {
  for (const candidate of candidates(payload)) {
    const obj = asObject(candidate, null);
    if (!obj) continue;

    const requestId = safeText(
      first(
        obj.requestId,
        obj.meta?.requestId,
        obj.data?.requestId,
        obj.result?.requestId,
        obj.payload?.requestId
      ),
      ""
    );

    if (requestId) return requestId;
  }

  return "";
}

function extractMeta(payload = null) {
  for (const candidate of candidates(payload)) {
    const obj = asObject(candidate, null);
    if (!obj) continue;

    const meta = first(
      obj.meta,
      obj.pagination,
      obj.data?.meta,
      obj.data?.pagination,
      obj.result?.meta,
      obj.result?.pagination,
      obj.payload?.meta,
      obj.payload?.pagination
    );

    if (hasKeys(meta)) return asObject(meta);
  }

  return {};
}

function extractArray(payload = null) {
  for (const candidate of candidates(payload)) {
    if (Array.isArray(candidate)) return candidate;

    const obj = asObject(candidate, null);
    if (!obj) continue;

    const list = first(
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

    if (Array.isArray(list)) return list;
  }

  return [];
}

function extractTotal(payload = null, fallback = 0) {
  for (const candidate of candidates(payload)) {
    const obj = asObject(candidate, null);
    if (!obj) continue;

    const total = first(
      obj.total,
      obj.count,
      obj.remoteCount,
      obj.totalMatched,

      obj.meta?.total,
      obj.meta?.count,
      obj.meta?.remoteCount,
      obj.meta?.totalMatched,

      obj.pagination?.total,
      obj.pagination?.count,
      obj.pagination?.totalItems,

      obj.data?.total,
      obj.data?.count,
      obj.result?.total,
      obj.result?.count,
      obj.payload?.total,
      obj.payload?.count
    );

    if (total !== null && total !== undefined) {
      return safeNumber(total, fallback);
    }
  }

  return fallback;
}

function extractDetail(payload = null) {
  for (const candidate of candidates(payload)) {
    const obj = asObject(candidate, null);
    if (!obj) continue;

    const detail = first(
      obj.factura,
      obj.item,
      obj.record,
      obj.invoice,

      obj.data?.factura,
      obj.data?.item,
      obj.data?.record,
      obj.data?.invoice,

      obj.result?.factura,
      obj.result?.item,
      obj.result?.record,
      obj.result?.invoice,

      obj.payload?.factura,
      obj.payload?.item,
      obj.payload?.record,
      obj.payload?.invoice
    );

    if (detail) return detail;
  }

  const obj = asObject(payload, null);

  if (obj && !Array.isArray(obj)) {
    return first(obj.data, obj.result, obj.payload, obj.resource, obj);
  }

  return payload || null;
}

function extractNamedObject(payload = null, name = "") {
  const key = safeText(name, "");
  if (!key) return null;

  for (const candidate of candidates(payload)) {
    const obj = asObject(candidate, null);
    if (!obj) continue;

    const found = first(
      obj[key],
      obj.data?.[key],
      obj.result?.[key],
      obj.payload?.[key]
    );

    if (hasKeys(found)) return asObject(found);
  }

  return null;
}

function extractStats(payload = null) {
  const stats = extractNamedObject(payload, "stats");
  return stats || {};
}

function extractFilters(payload = null) {
  const filters = extractNamedObject(payload, "filters");
  return filters || {};
}

/* =========================================================
   FACTURA MODEL HELPERS
========================================================= */

function normalizeFacturaSafe(source = {}) {
  const original = asObject(source);

  try {
    return normalizeFactura(original) || original;
  } catch (error) {
    safeWarn("normalizeFactura() falló; usando payload original.", {
      message: error?.message || "UNKNOWN_ERROR",
    });

    return original;
  }
}

function relationIdFromArray(value = []) {
  for (const item of safeArray(value)) {
    if (typeof item === "string" && item.trim()) return item.trim();

    if (isObject(item)) {
      const id = safeText(
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

function pickRelationId(item = {}) {
  const factura = asObject(item);
  const raw = asObject(factura.raw);

  return safeText(
    first(
      factura.ticketId,
      factura.incidenciaId,
      factura.relatedTicketId,
      factura.relatedIncidentId,

      factura.ticket?.ticketId,
      factura.ticket?.incidenciaId,
      factura.ticket?.id,

      factura.incidencia?.ticketId,
      factura.incidencia?.incidenciaId,
      factura.incidencia?.id,

      factura.relations?.ticket?.ticketId,
      factura.relations?.ticket?.incidenciaId,
      factura.relations?.ticket?.id,

      factura.meta?.ticketId,
      factura.meta?.incidenciaId,
      factura.meta?.linkedTicketId,

      relationIdFromArray(factura.ticketIds),
      relationIdFromArray(factura.incidenciaIds),
      relationIdFromArray(factura.relatedTickets),
      relationIdFromArray(factura.tickets),
      relationIdFromArray(factura.incidencias),

      raw.ticketId,
      raw.incidenciaId,
      raw.relatedTicketId,
      raw.relatedIncidentId,

      raw.ticket?.ticketId,
      raw.ticket?.incidenciaId,
      raw.ticket?.id,

      raw.incidencia?.ticketId,
      raw.incidencia?.incidenciaId,
      raw.incidencia?.id,

      raw.relations?.ticket?.ticketId,
      raw.relations?.ticket?.incidenciaId,
      raw.relations?.ticket?.id,

      raw.meta?.ticketId,
      raw.meta?.incidenciaId,
      raw.meta?.linkedTicketId,

      relationIdFromArray(raw.ticketIds),
      relationIdFromArray(raw.incidenciaIds),
      relationIdFromArray(raw.relatedTickets),
      relationIdFromArray(raw.tickets),
      relationIdFromArray(raw.incidencias)
    ),
    ""
  );
}

function withRelationMeta(item = {}) {
  const model = normalizeFacturaSafe(item);
  const relationId = pickRelationId(model);

  if (!relationId) return model;

  return {
    ...model,

    ticketId: model.ticketId || relationId,
    incidenciaId: model.incidenciaId || relationId,
    relatedTicketId: model.relatedTicketId || relationId,
    relatedIncidentId: model.relatedIncidentId || relationId,

    meta: {
      ...asObject(model.meta),
      hasIncidencia: true,
      hasLinkedTicket: true,
      incidenciaId: asObject(model.meta).incidenciaId || relationId,
      ticketId: asObject(model.meta).ticketId || relationId,
      linkedTicketId: asObject(model.meta).linkedTicketId || relationId,
    },

    raw: {
      ...asObject(item.raw, item),
      ...asObject(model.raw),
      ticketId: asObject(model.raw).ticketId || relationId,
      incidenciaId: asObject(model.raw).incidenciaId || relationId,
      meta: {
        ...asObject(asObject(item.raw).meta),
        ...asObject(asObject(model.raw).meta),
        hasIncidencia: true,
        hasLinkedTicket: true,
        incidenciaId: relationId,
        ticketId: relationId,
        linkedTicketId: relationId,
      },
    },
  };
}

/* =========================================================
   NORMALIZERS
========================================================= */

export function normalizeFacturasListResponse(payload = null, requestMeta = {}) {
  const rawItems = extractArray(payload);
  const items = rawItems.map((item) => withRelationMeta(item));

  const meta = extractMeta(payload);
  const total = extractTotal(payload, items.length);
  const requestId = extractRequestId(payload);

  const page = safeNumber(
    first(meta.page, meta.currentPage, requestMeta.page, FACTURAS_DEFAULT_PAGE),
    FACTURAS_DEFAULT_PAGE
  );

  const limit = safeNumber(
    first(meta.limit, meta.pageSize, requestMeta.limit, items.length || FACTURAS_DEFAULT_LIMIT),
    items.length || FACTURAS_DEFAULT_LIMIT
  );

  return {
    ok: extractOk(payload, true),
    requestId,

    items,
    facturas: items,
    data: items,

    total,
    count: items.length,
    remoteCount: total,
    totalMatched: safeNumber(first(meta.totalMatched, total), total),

    page,
    limit,

    hasItems: items.length > 0,
    isEmpty: items.length === 0,

    filters: extractFilters(payload),
    stats: extractStats(payload),

    raw: payload,

    meta: {
      ...meta,
      requestId,
      total,
      count: items.length,
      remoteCount: total,
      page,
      limit,
    },
  };
}

export function normalizeFacturaDetailResponse(payload = null) {
  const detail = extractDetail(payload);
  const item = detail ? withRelationMeta(detail) : null;

  return {
    ok: extractOk(payload, Boolean(item)),
    requestId: extractRequestId(payload),

    item,
    factura: item,
    data: item,

    raw: payload,
    meta: extractMeta(payload),
  };
}

export function normalizeFacturasStatsResponse(payload = null) {
  return {
    ok: extractOk(payload, true),
    requestId: extractRequestId(payload),
    stats: extractStats(payload),
    raw: payload,
    meta: extractMeta(payload),
  };
}

export function normalizeFacturasHealthResponse(payload = null) {
  const body = asObject(payload);

  return {
    ok: extractOk(payload, true),
    requestId: extractRequestId(payload),
    health: body,
    data: body,
    raw: payload,
    meta: extractMeta(payload),
  };
}

export function normalizeFacturaSendResponse(payload = null) {
  const detail = extractDetail(payload);
  const item = detail ? withRelationMeta(detail) : null;

  return {
    ok: extractOk(payload, true),
    requestId: extractRequestId(payload),

    sent: extractNamedObject(payload, "sent"),
    factura: item,
    item,
    data: item,

    message: safeText(
      first(
        asObject(payload).message,
        asObject(payload).data?.message,
        asObject(payload).result?.message,
        "Factura enviada correctamente."
      ),
      "Factura enviada correctamente."
    ),

    raw: payload,
    meta: extractMeta(payload),
  };
}

export function normalizeFacturaCreateResponse(payload = null) {
  const detail = extractDetail(payload);
  const item = detail ? withRelationMeta(detail) : null;

  return {
    ok: extractOk(payload, Boolean(item)),
    requestId: extractRequestId(payload),

    item,
    factura: item,
    data: item,

    file: extractNamedObject(payload, "file"),
    email: extractNamedObject(payload, "email"),
    counter: extractNamedObject(payload, "counter"),

    created: Boolean(item),
    raw: payload,
    meta: extractMeta(payload),
  };
}

/* =========================================================
   PDF HELPERS
========================================================= */

function isBlobLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.size === "number" &&
      typeof value.type === "string"
  );
}

function isArrayBufferLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.byteLength === "number" &&
      typeof value.slice === "function"
  );
}

function isResponseLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.blob === "function"
  );
}

function getBlobFromResponse(response = null) {
  if (!response) return null;

  if (isBlobLike(response)) return response;
  if (isBlobLike(response.data)) return response.data;
  if (isBlobLike(response.body)) return response.body;
  if (isBlobLike(response.result)) return response.result;
  if (isBlobLike(response.payload)) return response.payload;
  if (isBlobLike(response.blob)) return response.blob;

  if (isArrayBufferLike(response)) {
    return new Blob([response], { type: "application/pdf" });
  }

  if (isArrayBufferLike(response.data)) {
    return new Blob([response.data], { type: "application/pdf" });
  }

  if (isArrayBufferLike(response.body)) {
    return new Blob([response.body], { type: "application/pdf" });
  }

  return null;
}

function isPrivateFacturaPdfEndpoint(url = "") {
  const value = safeText(url, "");

  if (!value || value.startsWith("blob:")) return false;

  try {
    const parsed = new URL(value, window.location.origin);
    const pathname = parsed.pathname || "";

    return (
      pathname.includes("/api/facturas/") &&
      (
        pathname.endsWith("/view") ||
        pathname.endsWith("/download") ||
        pathname.endsWith("/pdf") ||
        pathname.endsWith("/descargar")
      )
    );
  } catch {
    return (
      value.includes("/api/facturas/") &&
      (
        value.includes("/view") ||
        value.includes("/download") ||
        value.includes("/pdf") ||
        value.includes("/descargar")
      )
    );
  }
}

export function resolveFacturaPdfUrl(response = null) {
  if (typeof response === "string") return response;

  for (const candidate of candidates(response)) {
    const obj = asObject(candidate, null);
    if (!obj) continue;

    const url = safeText(
      first(
        obj.file?.url,
        obj.file?.viewUrl,
        obj.file?.downloadUrl,
        obj.file?.sasUrl,
        obj.file?.signedUrl,
        obj.file?.publicUrl,

        obj.url,
        obj.downloadUrl,
        obj.viewUrl,
        obj.pdfUrl,
        obj.publicUrl,
        obj.sasUrl,
        obj.signedUrl,
        obj.location,

        obj.data?.file?.url,
        obj.data?.file?.viewUrl,
        obj.data?.file?.downloadUrl,
        obj.data?.url,
        obj.data?.downloadUrl,
        obj.data?.viewUrl,
        obj.data?.pdfUrl,

        obj.result?.file?.url,
        obj.result?.file?.viewUrl,
        obj.result?.file?.downloadUrl,
        obj.result?.url,
        obj.result?.downloadUrl,
        obj.result?.viewUrl,
        obj.result?.pdfUrl
      ),
      ""
    );

    if (url) return url;
  }

  return "";
}

export function createObjectUrlFromPdfResponse(response = null) {
  const blob = getBlobFromResponse(response);

  if (!blob) return "";

  try {
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

export function normalizeFacturaPdfResponse(response = null, fallbackUrl = "") {
  const file = extractNamedObject(response, "file") || {};
  const blob = getBlobFromResponse(response);
  const explicitUrl = resolveFacturaPdfUrl(response);

  const publicExplicitUrl =
    explicitUrl && !isPrivateFacturaPdfEndpoint(explicitUrl)
      ? explicitUrl
      : "";

  const objectUrl = publicExplicitUrl ? "" : createObjectUrlFromPdfResponse(response);
  const finalUrl = publicExplicitUrl || objectUrl || "";

  return {
    ok: extractOk(response, Boolean(finalUrl || blob || isResponseLike(response))),
    requestId: extractRequestId(response),

    url: finalUrl,
    viewUrl: safeText(first(file.viewUrl, finalUrl), ""),
    downloadUrl: safeText(first(file.downloadUrl, finalUrl), ""),

    objectUrl,
    blob,

    file: {
      ...file,
      url: safeText(first(file.url, finalUrl), ""),
      viewUrl: safeText(first(file.viewUrl, finalUrl), ""),
      downloadUrl: safeText(first(file.downloadUrl, finalUrl), ""),
    },

    response,
    raw: response,

    fallbackUrl: safeText(
      fallbackUrl && !isPrivateFacturaPdfEndpoint(fallbackUrl)
        ? fallbackUrl
        : "",
      ""
    ),

    meta: extractMeta(response),
  };
}

/* =========================================================
   REQUESTS
========================================================= */

export async function fetchFacturasHealthRequest(requestOptions = {}) {
  const response = await apiGet(FACTURAS_ENDPOINTS.health(), {
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...asObject(requestOptions),
  });

  return normalizeFacturasHealthResponse(response);
}

export async function fetchFacturasHealthPingRequest(requestOptions = {}) {
  const response = await apiGet(FACTURAS_ENDPOINTS.healthPing(), {
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...asObject(requestOptions),
  });

  return normalizeFacturasHealthResponse(response);
}

export async function fetchFacturasStatsRequest(requestOptions = {}) {
  const response = await apiGet(FACTURAS_ENDPOINTS.stats(), {
    timeout: FACTURAS_STATS_TIMEOUT,
    auth: true,
    ...asObject(requestOptions),
  });

  return normalizeFacturasStatsResponse(response);
}

export async function fetchFacturasRequest(
  {
    page = FACTURAS_DEFAULT_PAGE,
    limit = FACTURAS_DEFAULT_LIMIT,
    search = "",
    q = "",
    sort = "recent",
    direction = "desc",
    sortBy = "",
    sortDir = "",
    filters = {},
  } = {},
  requestOptions = {}
) {
  const endpoint = buildFacturasListEndpoint({
    page,
    limit,
    search,
    q,
    sort,
    direction,
    sortBy,
    sortDir,
    filters,
  });

  const response = await apiGet(endpoint, {
    timeout: FACTURAS_LIST_TIMEOUT,
    auth: true,
    ...asObject(requestOptions),
  });

  return normalizeFacturasListResponse(response, {
    page,
    limit,
    search: first(search, q, ""),
    sort: first(sort, sortBy, ""),
    direction: first(direction, sortDir, ""),
    filters,
  });
}

export async function fetchFacturaDetailRequest(id, options = {}) {
  const response = await apiGet(getFacturaEndpoint(id), {
    timeout: FACTURAS_DETAIL_TIMEOUT,
    auth: true,
    ...asObject(options),
  });

  return normalizeFacturaDetailResponse(response);
}

export async function fetchFacturaPdfRequest(
  id,
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT,
  options = {}
) {
  const endpoint = buildFacturaPdfEndpoint(id, disposition);

  const response = await apiGet(endpoint, {
    timeout: FACTURAS_PDF_TIMEOUT,
    auth: true,
    responseType: "auto",
    raw: false,
    cache: "no-store",
    ...asObject(options),
  });

  return normalizeFacturaPdfResponse(response, "");
}

export async function fetchFacturaPdfUrlRequest(
  id,
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT,
  options = {}
) {
  const result = await fetchFacturaPdfRequest(id, disposition, options);

  if (result?.url && !isPrivateFacturaPdfEndpoint(result.url)) {
    return result.url;
  }

  if (result?.blob || result?.objectUrl || result?.response || result?.raw) {
    return result;
  }

  throw new Error("FACTURA_PDF_URL_MISSING");
}

export function viewFacturaPdfRequest(id, options = {}) {
  return fetchFacturaPdfRequest(id, FACTURAS_DISPOSITIONS.INLINE, options);
}

export function downloadFacturaPdfRequest(id, options = {}) {
  return fetchFacturaPdfRequest(id, FACTURAS_DISPOSITIONS.ATTACHMENT, options);
}

export async function sendFacturaRequest(id, payload = {}, options = {}) {
  const response = await apiPost(FACTURAS_ENDPOINTS.send(id), asObject(payload), {
    timeout: FACTURAS_SEND_TIMEOUT,
    auth: true,
    ...asObject(options),
  });

  return normalizeFacturaSendResponse(response);
}

export function sendFacturaAliasRequest(id, payload = {}, options = {}) {
  return sendFacturaRequest(id, payload, options);
}

export async function createFacturaRequest(payload = {}, options = {}) {
  const response = await apiPost(FACTURAS_ENDPOINT, asObject(payload), {
    timeout: FACTURAS_CREATE_TIMEOUT,
    auth: true,
    ...asObject(options),
  });

  return normalizeFacturaCreateResponse(response);
}

export async function updateFacturaRequest(id, payload = {}, options = {}) {
  const response = await apiPut(getFacturaEndpoint(id), asObject(payload), {
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...asObject(options),
  });

  return normalizeFacturaDetailResponse(response);
}

export async function patchFacturaRequest(id, payload = {}, options = {}) {
  const response = await apiPatch(getFacturaEndpoint(id), asObject(payload), {
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...asObject(options),
  });

  return normalizeFacturaDetailResponse(response);
}

export function removeFacturaRequest(id, options = {}) {
  return apiDelete(getFacturaEndpoint(id), {
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...asObject(options),
  });
}

/* =========================================================
   DOMAIN HELPERS
========================================================= */

export function hasFacturaIncidencia(item = {}) {
  return Boolean(pickRelationId(item));
}

export function getFacturaIncidenciaId(item = {}) {
  return pickRelationId(item);
}

export function getFacturaStableId(item = {}) {
  const factura = asObject(item);
  const raw = asObject(factura.raw);

  return safeText(
    first(
      factura.id,
      factura.facturaId,
      factura.invoiceId,
      factura.numero,
      factura.numeroFacturaLegal,
      factura.numeroFacturaSistema,
      factura.invoiceNumber,

      raw.id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.invoiceNumber
    ),
    ""
  );
}

export function getFacturaAmount(item = {}) {
  const factura = asObject(item);
  const raw = asObject(factura.raw);

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

      raw.total,
      raw.amount,
      raw.importe,
      raw.importeTotal,
      raw.totalFactura,
      raw.invoiceAmount,
      raw.facturaTotal,
      raw.facturaImporte,
      raw.importeFactura,
      raw.totales?.total,
      raw.totals?.total,
      raw.resumen?.total,

      0
    )
  );
}

/* =========================================================
   PUBLIC API
========================================================= */

export const FacturasApi = Object.freeze({
  resource: FACTURAS_RESOURCE,
  endpoint: FACTURAS_ENDPOINT,

  timeouts: Object.freeze({
    default: FACTURAS_TIMEOUT,
    list: FACTURAS_LIST_TIMEOUT,
    detail: FACTURAS_DETAIL_TIMEOUT,
    stats: FACTURAS_STATS_TIMEOUT,
    pdf: FACTURAS_PDF_TIMEOUT,
    send: FACTURAS_SEND_TIMEOUT,
    create: FACTURAS_CREATE_TIMEOUT,
  }),

  defaults: Object.freeze({
    page: FACTURAS_DEFAULT_PAGE,
    limit: FACTURAS_DEFAULT_LIMIT,
    maxLimit: FACTURAS_MAX_LIMIT,
  }),

  dispositions: FACTURAS_DISPOSITIONS,
  pdfModes: FACTURAS_PDF_MODES,
  endpoints: FACTURAS_ENDPOINTS,

  getApiClient,

  normalizeFactura: withRelationMeta,
  normalizeFacturaSafe: withRelationMeta,
  normalizeFacturaId,

  normalizeFacturasListResponse,
  normalizeFacturaDetailResponse,
  normalizeFacturasStatsResponse,
  normalizeFacturasHealthResponse,
  normalizeFacturaSendResponse,
  normalizeFacturaCreateResponse,
  normalizeFacturaPdfResponse,

  getFacturaEndpoint,
  buildFacturasListEndpoint,
  normalizeFacturaPdfDisposition,
  buildFacturaPdfEndpoint,
  buildFacturaPdfViewEndpoint,
  buildFacturaDownloadEndpoint,

  resolveFacturaPdfUrl,
  createObjectUrlFromPdfResponse,

  hasFacturaIncidencia,
  getFacturaIncidenciaId,
  getFacturaStableId,
  getFacturaAmount,

  health: fetchFacturasHealthRequest,
  healthPing: fetchFacturasHealthPingRequest,
  stats: fetchFacturasStatsRequest,

  list: fetchFacturasRequest,
  detail: fetchFacturaDetailRequest,

  create: createFacturaRequest,
  update: updateFacturaRequest,
  patch: patchFacturaRequest,
  remove: removeFacturaRequest,

  baseCreate: createFacturaRequest,
  baseUpdate: updateFacturaRequest,
  basePatch: patchFacturaRequest,
  baseRemove: removeFacturaRequest,

  fetchFacturasHealthRequest,
  fetchFacturasHealthPingRequest,
  fetchFacturasStatsRequest,
  fetchFacturasRequest,
  fetchFacturaDetailRequest,

  fetchFacturaPdfRequest,
  fetchFacturaPdfUrlRequest,
  viewFacturaPdfRequest,
  downloadFacturaPdfRequest,

  sendFacturaRequest,
  sendFacturaAliasRequest,
  createFacturaRequest,
  updateFacturaRequest,
  patchFacturaRequest,
  removeFacturaRequest,
});

export default FacturasApi;
