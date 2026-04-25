/* =========================================================
   Onion SPA - Facturas API
   Archivo: src/views/facturas/facturas.api.js

   FULL PRODUCTION API · FACTURAS 10/10 · INCIDENCIA SAFE
   PATCH · RELATION PRESERVE AFTER MODEL NORMALIZATION

   RESPONSABILIDADES:
   - centralizar las llamadas HTTP del módulo de facturas
   - exponer operaciones de listado, detalle, pdf y envío
   - aislar la vista del acceso directo al apiClient
   - reutilizar shared/api/collectionApi para mutaciones base
   - mantener endpoints y timeouts en un único punto
   - tolerar distintos shapes del cliente HTTP
   - mantener surface pública estable y clara

   HARDENING PRO:
   - validación defensiva de ids y disposition
   - helpers comunes para requests GET/POST
   - endpoints centralizados y extensibles
   - soporte inline / attachment robusto
   - normalización delegada al model del dominio
   - preservación explícita de ticket/incidencia tras normalizeFactura()
   - compatibilidad con backends que devuelven facturas/factura
   - integración limpia con AppCore.apiClient
========================================================= */

import { AppCore } from "../../core/index.js";
import { createCollectionApi } from "../../shared/api/index.js";
import { normalizeFactura } from "./facturas.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const FACTURAS_RESOURCE = "facturas";
export const FACTURAS_ENDPOINT = "/api/facturas";

export const FACTURAS_TIMEOUT = 15000;
export const FACTURAS_SEND_TIMEOUT = 20000;

export const FACTURAS_DEFAULT_PAGE = 1;
export const FACTURAS_DEFAULT_LIMIT = 20;

export const FACTURAS_DISPOSITIONS = Object.freeze({
  INLINE: "inline",
  ATTACHMENT: "attachment",
});

export const FACTURAS_ENDPOINTS = Object.freeze({
  collection: FACTURAS_ENDPOINT,
  detail: (id) => getFacturaEndpoint(id),
  pdf: (id, disposition = FACTURAS_DISPOSITIONS.ATTACHMENT) =>
    buildFacturaPdfEndpoint(id, disposition),
  send: (id) => `${getFacturaEndpoint(id)}/enviar`,
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
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

function isNonEmptyObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
}

function normalizeQueryValue(value) {
  if (value === undefined || value === null) return "";

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value).trim();
}

/* =========================================================
   RELATION / INCIDENCIA HELPERS
========================================================= */

function pickTicketIdFromArray(value = []) {
  const items = safeArray(value);

  for (const item of items) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = first(
      item.ticketId,
      item.incidenciaId,
      item.id,
      item.code,
      item.numero,
      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId
    );

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function getIncidenciaIdFromFactura(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  return safeText(
    first(
      factura.ticketId,
      factura.incidenciaId,

      factura.incidencia?.id,
      factura.incidencia?.ticketId,
      factura.incidencia?.incidenciaId,

      factura.ticket?.id,
      factura.ticket?.ticketId,
      factura.ticket?.incidenciaId,

      factura.linkedTicket?.id,
      factura.linkedTicket?.ticketId,
      factura.linkedTicket?.incidenciaId,

      factura.relatedTicketId,
      factura.relatedIncidentId,
      factura.supportTicketId,
      factura.caseId,

      factura.meta?.ticketId,
      factura.meta?.incidenciaId,

      pickTicketIdFromArray(factura.ticketIds),
      pickTicketIdFromArray(factura.incidenciaIds),
      pickTicketIdFromArray(factura.relatedTicketIds),
      pickTicketIdFromArray(factura.relatedIncidentIds),
      pickTicketIdFromArray(factura.linkedTickets),
      pickTicketIdFromArray(factura.incidencias),
      pickTicketIdFromArray(factura.tickets),
      pickTicketIdFromArray(factura.relatedTickets),
      pickTicketIdFromArray(factura.facturasRelacionadas),
      pickTicketIdFromArray(factura.linkedInvoices?.tickets),
      pickTicketIdFromArray(factura.relations),

      raw.ticketId,
      raw.incidenciaId,

      raw.incidencia?.id,
      raw.incidencia?.ticketId,
      raw.incidencia?.incidenciaId,

      raw.ticket?.id,
      raw.ticket?.ticketId,
      raw.ticket?.incidenciaId,

      raw.linkedTicket?.id,
      raw.linkedTicket?.ticketId,
      raw.linkedTicket?.incidenciaId,

      raw.relatedTicketId,
      raw.relatedIncidentId,
      raw.supportTicketId,
      raw.caseId,

      raw.meta?.ticketId,
      raw.meta?.incidenciaId,

      pickTicketIdFromArray(raw.ticketIds),
      pickTicketIdFromArray(raw.incidenciaIds),
      pickTicketIdFromArray(raw.relatedTicketIds),
      pickTicketIdFromArray(raw.relatedIncidentIds),
      pickTicketIdFromArray(raw.linkedTickets),
      pickTicketIdFromArray(raw.incidencias),
      pickTicketIdFromArray(raw.tickets),
      pickTicketIdFromArray(raw.relatedTickets),
      pickTicketIdFromArray(raw.facturasRelacionadas),
      pickTicketIdFromArray(raw.linkedInvoices?.tickets),
      pickTicketIdFromArray(raw.relations)
    ),
    ""
  );
}

function getRelationObjectFromFactura(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  const candidate = first(
    factura.incidencia,
    factura.ticket,
    factura.linkedTicket,

    raw.incidencia,
    raw.ticket,
    raw.linkedTicket
  );

  return isNonEmptyObject(candidate) ? safeObject(candidate) : null;
}

function buildIncidenciaPayload(item = {}, incidenciaId = "") {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);
  const relation = getRelationObjectFromFactura(factura) || {};

  const finalId = safeText(
    first(
      incidenciaId,
      relation.id,
      relation.ticketId,
      relation.incidenciaId,
      factura.ticketId,
      factura.incidenciaId,
      raw.ticketId,
      raw.incidenciaId
    ),
    ""
  );

  if (!finalId) {
    return null;
  }

  return {
    id: finalId,
    ticketId: finalId,
    incidenciaId: finalId,

    subject: safeText(
      first(
        relation.subject,
        relation.asunto,
        factura.incidencia?.subject,
        factura.incidencia?.asunto,
        factura.ticket?.subject,
        factura.ticket?.asunto,
        raw.incidencia?.subject,
        raw.incidencia?.asunto,
        raw.ticket?.subject,
        raw.ticket?.asunto
      ),
      ""
    ),

    asunto: safeText(
      first(
        relation.asunto,
        relation.subject,
        factura.incidencia?.asunto,
        factura.incidencia?.subject,
        factura.ticket?.asunto,
        factura.ticket?.subject,
        raw.incidencia?.asunto,
        raw.incidencia?.subject,
        raw.ticket?.asunto,
        raw.ticket?.subject
      ),
      ""
    ),

    clienteId: safeText(
      first(
        relation.clienteId,
        factura.clienteId,
        factura.cliente?.id,
        raw.clienteId,
        raw.cliente?.id
      ),
      ""
    ),

    clienteNombre: safeText(
      first(
        relation.clienteNombre,
        factura.clienteNombre,
        factura.cliente?.nombre,
        factura.cliente?.nombreContacto,
        raw.clienteNombre,
        raw.cliente?.nombre,
        raw.cliente?.nombreContacto
      ),
      ""
    ),

    relationType: safeText(
      first(
        relation.relationType,
        factura.relationType,
        raw.relationType,
        "linked_ticket"
      ),
      "linked_ticket"
    ),

    linkedAt: safeText(
      first(
        relation.linkedAt,
        factura.linkedAt,
        raw.linkedAt,
        factura.updatedAt,
        raw.updatedAt
      ),
      ""
    ),

    linkedAtES: safeText(
      first(
        relation.linkedAtES,
        factura.linkedAtES,
        raw.linkedAtES,
        factura.updatedAtES,
        raw.updatedAtES
      ),
      ""
    ),
  };
}

function mergeIncidenciaIntoRaw(raw = {}, incidenciaId = "", incidenciaPayload = null) {
  const base = safeObject(raw);

  if (!incidenciaId) {
    return base;
  }

  return {
    ...base,

    ticketId: safeText(first(base.ticketId, incidenciaId), incidenciaId),
    incidenciaId: safeText(first(base.incidenciaId, incidenciaId), incidenciaId),
    relatedTicketId: safeText(
      first(base.relatedTicketId, incidenciaId),
      incidenciaId
    ),
    relatedIncidentId: safeText(
      first(base.relatedIncidentId, incidenciaId),
      incidenciaId
    ),

    incidencia: isNonEmptyObject(base.incidencia)
      ? {
          ...incidenciaPayload,
          ...base.incidencia,
          id: safeText(first(base.incidencia?.id, incidenciaId), incidenciaId),
          ticketId: safeText(
            first(base.incidencia?.ticketId, incidenciaId),
            incidenciaId
          ),
          incidenciaId: safeText(
            first(base.incidencia?.incidenciaId, incidenciaId),
            incidenciaId
          ),
        }
      : incidenciaPayload,

    ticket: isNonEmptyObject(base.ticket)
      ? {
          ...incidenciaPayload,
          ...base.ticket,
          id: safeText(first(base.ticket?.id, incidenciaId), incidenciaId),
          ticketId: safeText(
            first(base.ticket?.ticketId, incidenciaId),
            incidenciaId
          ),
          incidenciaId: safeText(
            first(base.ticket?.incidenciaId, incidenciaId),
            incidenciaId
          ),
        }
      : incidenciaPayload,
  };
}

function normalizeFacturaSafe(source = {}) {
  const original = safeObject(source);
  const originalRaw = safeObject(original.raw, original);

  let normalized = null;

  try {
    normalized = normalizeFactura(original);
  } catch (error) {
    console.error("❌ FACTURAS NORMALIZE ERROR:", error);
    normalized = original;
  }

  const model = safeObject(normalized, original);

  const incidenciaId = safeText(
    first(
      getIncidenciaIdFromFactura(model),
      getIncidenciaIdFromFactura(original),
      getIncidenciaIdFromFactura(originalRaw)
    ),
    ""
  );

  const incidenciaPayload = buildIncidenciaPayload(
    {
      ...originalRaw,
      ...original,
      ...model,
      raw: {
        ...originalRaw,
        ...safeObject(model.raw),
      },
    },
    incidenciaId
  );

  const mergedRaw = mergeIncidenciaIntoRaw(
    {
      ...originalRaw,
      ...safeObject(model.raw),
    },
    incidenciaId,
    incidenciaPayload
  );

  const mergedMeta = {
    ...safeObject(original.meta),
    ...safeObject(model.meta),

    hasIncidencia: Boolean(
      first(
        model.meta?.hasIncidencia,
        original.meta?.hasIncidencia,
        incidenciaId
      )
    ),

    incidenciaId: incidenciaId || model.meta?.incidenciaId || null,
    ticketId: incidenciaId || model.meta?.ticketId || null,
  };

  if (!incidenciaId) {
    return {
      ...model,
      raw: mergedRaw,
      meta: mergedMeta,
    };
  }

  return {
    ...model,

    ticketId: safeText(first(model.ticketId, incidenciaId), incidenciaId),
    incidenciaId: safeText(first(model.incidenciaId, incidenciaId), incidenciaId),
    relatedTicketId: safeText(
      first(model.relatedTicketId, incidenciaId),
      incidenciaId
    ),
    relatedIncidentId: safeText(
      first(model.relatedIncidentId, incidenciaId),
      incidenciaId
    ),

    incidencia: isNonEmptyObject(model.incidencia)
      ? {
          ...incidenciaPayload,
          ...model.incidencia,
          id: safeText(first(model.incidencia?.id, incidenciaId), incidenciaId),
          ticketId: safeText(
            first(model.incidencia?.ticketId, incidenciaId),
            incidenciaId
          ),
          incidenciaId: safeText(
            first(model.incidencia?.incidenciaId, incidenciaId),
            incidenciaId
          ),
        }
      : incidenciaPayload,

    ticket: isNonEmptyObject(model.ticket)
      ? {
          ...incidenciaPayload,
          ...model.ticket,
          id: safeText(first(model.ticket?.id, incidenciaId), incidenciaId),
          ticketId: safeText(
            first(model.ticket?.ticketId, incidenciaId),
            incidenciaId
          ),
          incidenciaId: safeText(
            first(model.ticket?.incidenciaId, incidenciaId),
            incidenciaId
          ),
        }
      : incidenciaPayload,

    relationType: safeText(
      first(model.relationType, original.relationType, originalRaw.relationType, "linked_ticket"),
      "linked_ticket"
    ),

    meta: mergedMeta,
    raw: mergedRaw,
  };
}

/* =========================================================
   RESPONSE SHAPE HELPERS
========================================================= */

function getPayloadCandidates(payload = null) {
  const obj = safeObject(payload, null);

  if (!obj) {
    return [payload];
  }

  return [
    payload,

    obj.data,
    obj.body,
    obj.result,
    obj.payload,
    obj.response,

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

function pickArrayFromObject(obj = {}) {
  const source = safeObject(obj);

  const direct = first(
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

function extractFacturasList(payload = null) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    const found = pickArrayFromObject(candidate);

    if (Array.isArray(found)) {
      return found;
    }
  }

  return [];
}

function extractFacturasTotal(payload = null, fallback = 0) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) continue;

    const total = first(
      obj.total,
      obj.count,
      obj.remoteCount,

      obj.meta?.total,
      obj.meta?.count,
      obj.meta?.remoteCount,

      obj.pagination?.total,
      obj.pagination?.count,
      obj.pagination?.totalItems,

      obj.data?.total,
      obj.data?.count,
      obj.data?.remoteCount,

      obj.result?.total,
      obj.result?.count,
      obj.result?.remoteCount,

      obj.payload?.total,
      obj.payload?.count,
      obj.payload?.remoteCount
    );

    if (total !== null) {
      return safeNumber(total, fallback);
    }
  }

  return fallback;
}

function extractFacturaDetail(payload = null) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) {
      continue;
    }

    const detail = first(
      obj.factura,
      obj.item,
      obj.record,

      obj.data?.factura,
      obj.data?.item,
      obj.data?.record,

      obj.result?.factura,
      obj.result?.item,
      obj.result?.record,

      obj.payload?.factura,
      obj.payload?.item,
      obj.payload?.record
    );

    if (detail) {
      return detail;
    }
  }

  const obj = safeObject(payload, null);

  if (obj && !Array.isArray(obj)) {
    return first(obj.data, obj.result, obj.payload, obj);
  }

  return payload || null;
}

function extractOk(payload = null, fallback = true) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) continue;

    if (typeof obj.ok === "boolean") return obj.ok;
    if (typeof obj.success === "boolean") return obj.success;
  }

  return fallback;
}

function extractMeta(payload = null) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

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

    if (isNonEmptyObject(meta)) {
      return safeObject(meta);
    }
  }

  return {};
}

/* =========================================================
   CLIENT RESOLUTION
========================================================= */

export function getApiClient() {
  const globalHttp =
    typeof globalThis !== "undefined" ? globalThis.Http : null;

  const client =
    AppCore?.apiClient ||
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    globalHttp ||
    null;

  if (!client) {
    throw new Error("FACTURAS_API_CLIENT_UNAVAILABLE");
  }

  return client;
}

function assertMethod(client, method = "") {
  const name = safeText(method, "").toLowerCase();

  if (!name || typeof client?.[name] !== "function") {
    throw new Error(`FACTURAS_API_METHOD_UNAVAILABLE:${name || "unknown"}`);
  }

  return client[name].bind(client);
}

/* =========================================================
   ENDPOINT HELPERS
========================================================= */

export function normalizeFacturaId(id = "") {
  const facturaId = safeText(id, "");

  if (!facturaId) {
    throw new Error("FACTURA_ID_REQUIRED");
  }

  return facturaId;
}

export function getFacturaEndpoint(id = "") {
  const facturaId = normalizeFacturaId(id);
  return `${FACTURAS_ENDPOINT}/${encodeURIComponent(facturaId)}`;
}

export function normalizeFacturaPdfDisposition(disposition = "") {
  const value = safeText(
    disposition,
    FACTURAS_DISPOSITIONS.ATTACHMENT
  ).toLowerCase();

  if (value === FACTURAS_DISPOSITIONS.INLINE) {
    return FACTURAS_DISPOSITIONS.INLINE;
  }

  return FACTURAS_DISPOSITIONS.ATTACHMENT;
}

export function buildFacturaPdfEndpoint(
  id = "",
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT
) {
  const facturaId = normalizeFacturaId(id);
  const finalDisposition = normalizeFacturaPdfDisposition(disposition);

  if (finalDisposition === FACTURAS_DISPOSITIONS.INLINE) {
    return `${getFacturaEndpoint(facturaId)}/pdf?disposition=inline`;
  }

  return `${getFacturaEndpoint(facturaId)}/descargar?disposition=attachment`;
}

export function buildFacturasListEndpoint({
  page = FACTURAS_DEFAULT_PAGE,
  limit = FACTURAS_DEFAULT_LIMIT,
  search = "",
  sortBy = "",
  sortDir = "",
  filters = {},
} = {}) {
  const params = new URLSearchParams();

  const finalPage = Math.max(1, safeNumber(page, FACTURAS_DEFAULT_PAGE));
  const finalLimit = Math.max(1, safeNumber(limit, FACTURAS_DEFAULT_LIMIT));

  if (finalPage !== FACTURAS_DEFAULT_PAGE) {
    params.set("page", String(finalPage));
  }

  if (finalLimit) {
    params.set("limit", String(finalLimit));
  }

  const finalSearch = safeText(search, "");

  if (finalSearch) {
    params.set("search", finalSearch);
  }

  const finalSortBy = safeText(sortBy, "");
  const finalSortDir = safeText(sortDir, "");

  if (finalSortBy) {
    params.set("sortBy", finalSortBy);
  }

  if (finalSortDir) {
    params.set("sortDir", finalSortDir);
  }

  const finalFilters = safeObject(filters);

  for (const [key, value] of Object.entries(finalFilters)) {
    const name = safeText(key, "");

    if (!name) continue;

    if (Array.isArray(value)) {
      const cleanValues = value
        .map((item) => normalizeQueryValue(item))
        .filter(Boolean);

      if (cleanValues.length) {
        params.set(name, cleanValues.join(","));
      }

      continue;
    }

    const normalizedValue = normalizeQueryValue(value);

    if (normalizedValue) {
      params.set(name, normalizedValue);
    }
  }

  const query = params.toString();

  return query ? `${FACTURAS_ENDPOINT}?${query}` : FACTURAS_ENDPOINT;
}

/* =========================================================
   REQUEST HELPERS
========================================================= */

function buildRequestOptions({
  timeout = FACTURAS_TIMEOUT,
  auth = true,
  responseType = "auto",
  raw = false,
  extra = null,
} = {}) {
  return {
    timeout,
    auth,
    responseType,
    raw,
    ...safeObject(extra),
  };
}

async function apiGet(endpoint = "", options = {}) {
  const client = getApiClient();
  const request = assertMethod(client, "get");

  return request(endpoint, buildRequestOptions(options));
}

async function apiPost(endpoint = "", body = {}, options = {}) {
  const client = getApiClient();

  if (typeof client?.post === "function") {
    return client.post(endpoint, body, buildRequestOptions(options));
  }

  if (typeof client?.request === "function") {
    return client.request(endpoint, {
      method: "POST",
      body,
      ...buildRequestOptions(options),
    });
  }

  throw new Error("FACTURAS_API_METHOD_UNAVAILABLE:post");
}

/* =========================================================
   NORMALIZERS
========================================================= */

export function normalizeFacturasListResponse(payload = null, requestMeta = {}) {
  const rawItems = extractFacturasList(payload);
  const items = rawItems.map((item) => normalizeFacturaSafe(item));

  const total = extractFacturasTotal(payload, items.length);
  const meta = extractMeta(payload);

  const page = safeNumber(
    first(
      meta.page,
      meta.currentPage,
      meta.pagination?.page,
      requestMeta.page,
      FACTURAS_DEFAULT_PAGE
    ),
    FACTURAS_DEFAULT_PAGE
  );

  const limit = safeNumber(
    first(
      meta.limit,
      meta.pageSize,
      meta.pagination?.limit,
      meta.pagination?.pageSize,
      requestMeta.limit,
      items.length || FACTURAS_DEFAULT_LIMIT
    ),
    items.length || FACTURAS_DEFAULT_LIMIT
  );

  const ok = extractOk(payload, true);

  return {
    ok,
    items,
    facturas: items,

    total,
    count: items.length,
    remoteCount: total,

    page,
    limit,

    hasItems: items.length > 0,
    isEmpty: items.length === 0,

    raw: payload,
    meta: {
      ...meta,
      total,
      count: items.length,
      remoteCount: total,
      page,
      limit,
    },
  };
}

export function normalizeFacturaDetailResponse(payload = null) {
  const detail = extractFacturaDetail(payload);
  const item = detail ? normalizeFacturaSafe(detail) : null;

  return {
    ok: extractOk(payload, Boolean(item)),
    item,
    factura: item,
    raw: payload,
    meta: extractMeta(payload),
  };
}

/* =========================================================
   COLLECTION API BASE
========================================================= */

const baseCollectionApi = createCollectionApi(FACTURAS_RESOURCE, {
  client: {
    get: (...args) => getApiClient().get(...args),
    post: (...args) => getApiClient().post(...args),
    put: (...args) => getApiClient().put(...args),
    patch: (...args) => getApiClient().patch(...args),
    delete: (...args) => getApiClient().delete(...args),
  },

  basePath: FACTURAS_ENDPOINT,

  mapItem: normalizeFacturaSafe,
  mapDetail: normalizeFacturaSafe,

  normalizeListResponse(payload) {
    return normalizeFacturasListResponse(payload);
  },

  normalizeDetail(payload) {
    return normalizeFacturaDetailResponse(payload);
  },

  listQueryConfig: {
    pageParam: "page",
    limitParam: "limit",
    searchParam: "search",
    sortByParam: "sortBy",
    sortDirParam: "sortDir",
    defaultPage: FACTURAS_DEFAULT_PAGE,
    defaultLimit: FACTURAS_DEFAULT_LIMIT,
    includeDefaults: false,
  },

  buildListOptions: ({ requestOptions }) => ({
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
  }),

  buildDetailOptions: ({ requestOptions }) => ({
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
  }),

  buildCreateOptions: ({ requestOptions }) => ({
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
  }),

  buildUpdateOptions: ({ requestOptions }) => ({
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
  }),

  buildPatchOptions: ({ requestOptions }) => ({
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
  }),

  buildRemoveOptions: ({ requestOptions }) => ({
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
  }),
});

/* =========================================================
   PUBLIC REQUESTS
========================================================= */

export async function fetchFacturasRequest(
  {
    page = FACTURAS_DEFAULT_PAGE,
    limit = FACTURAS_DEFAULT_LIMIT,
    search = "",
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
    sortBy,
    sortDir,
    filters,
  });

  const response = await apiGet(endpoint, {
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
  });

  return normalizeFacturasListResponse(response, {
    page,
    limit,
    search,
    sortBy,
    sortDir,
    filters,
  });
}

export async function fetchFacturaDetailRequest(
  id,
  {
    timeout = FACTURAS_TIMEOUT,
    auth = true,
    ...rest
  } = {}
) {
  const response = await apiGet(getFacturaEndpoint(id), {
    timeout,
    auth,
    ...rest,
  });

  return normalizeFacturaDetailResponse(response);
}

export async function fetchFacturaPdfUrlRequest(
  id,
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT,
  {
    timeout = FACTURAS_TIMEOUT,
    auth = true,
    ...rest
  } = {}
) {
  return apiGet(FACTURAS_ENDPOINTS.pdf(id, disposition), {
    timeout,
    auth,
    ...rest,
  });
}

export async function sendFacturaRequest(
  id,
  payload = {},
  {
    timeout = FACTURAS_SEND_TIMEOUT,
    auth = true,
    ...rest
  } = {}
) {
  return apiPost(FACTURAS_ENDPOINTS.send(id), safeObject(payload), {
    timeout,
    auth,
    ...rest,
  });
}

/* =========================================================
   OPTIONAL HELPERS
========================================================= */

export function resolveFacturaPdfUrl(response = null) {
  const candidates = getPayloadCandidates(response);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) continue;

    const url = safeText(
      first(
        obj?.file?.url,
        obj?.url,
        obj?.downloadUrl,
        obj?.viewUrl,

        obj?.data?.file?.url,
        obj?.data?.url,
        obj?.data?.downloadUrl,
        obj?.data?.viewUrl,

        obj?.result?.file?.url,
        obj?.result?.url,
        obj?.result?.downloadUrl,
        obj?.result?.viewUrl,

        obj?.payload?.file?.url,
        obj?.payload?.url,
        obj?.payload?.downloadUrl,
        obj?.payload?.viewUrl
      ),
      ""
    );

    if (url) {
      return url;
    }
  }

  return "";
}

export function hasFacturaIncidencia(item = {}) {
  return Boolean(getIncidenciaIdFromFactura(item));
}

export function getFacturaIncidenciaId(item = {}) {
  return getIncidenciaIdFromFactura(item);
}

/* =========================================================
   PUBLIC API
========================================================= */

export const FacturasApi = Object.freeze({
  resource: FACTURAS_RESOURCE,
  endpoint: FACTURAS_ENDPOINT,

  timeouts: Object.freeze({
    default: FACTURAS_TIMEOUT,
    send: FACTURAS_SEND_TIMEOUT,
  }),

  dispositions: FACTURAS_DISPOSITIONS,
  endpoints: FACTURAS_ENDPOINTS,

  getApiClient,

  normalizeFactura: normalizeFacturaSafe,
  normalizeFacturaSafe,
  normalizeFacturaId,
  normalizeFacturasListResponse,
  normalizeFacturaDetailResponse,

  getFacturaEndpoint,
  buildFacturasListEndpoint,
  normalizeFacturaPdfDisposition,
  buildFacturaPdfEndpoint,
  resolveFacturaPdfUrl,

  hasFacturaIncidencia,
  getFacturaIncidenciaId,

  list: fetchFacturasRequest,
  detail: fetchFacturaDetailRequest,

  create: baseCollectionApi.create,
  update: baseCollectionApi.update,
  patch: baseCollectionApi.patch,
  remove: baseCollectionApi.remove,

  fetchFacturasRequest,
  fetchFacturaDetailRequest,
  fetchFacturaPdfUrlRequest,
  sendFacturaRequest,
});

export default FacturasApi;
