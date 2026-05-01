/* =========================================================
   Onion SPA - Facturas API
   Archivo: src/views/facturas/facturas.api.js

   EXTREME PRODUCTION API · FACTURAS 10/10
   COSMOS ALIGNED · ROUTER ALIGNED · INCIDENCIA SAFE
   PDF INLINE / DOWNLOAD · SEND · CREATE · STATS · HEALTH

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo de facturas
   - alinear endpoints con /router/facturas/index.js
   - exponer listado, detalle, stats, health, PDF, descarga, envío y CRUD base
   - aislar la vista del acceso directo a AppCore.apiClient
   - reutilizar shared/api/collectionApi para mutaciones base
   - mantener endpoints y timeouts en un único punto
   - tolerar distintos shapes del cliente HTTP
   - preservar ticket/incidencia tras normalizeFactura()
   - soportar respuestas legacy + normalizadas v2/v3
   - preparar PDF para clientes HTTP que devuelven blob, response, url o payload JSON
   - mantener surface pública estable
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
  DOWNLOAD: "download",
  ATTACHMENT: "attachment",
});

export const FACTURAS_ENDPOINTS = Object.freeze({
  collection: FACTURAS_ENDPOINT,

  health: () => `${FACTURAS_ENDPOINT}/health`,
  healthPing: () => `${FACTURAS_ENDPOINT}/health/ping`,
  stats: () => `${FACTURAS_ENDPOINT}/stats`,

  detail: (id) => getFacturaEndpoint(id),

  pdf: (id) => `${getFacturaEndpoint(id)}/pdf`,
  view: (id) => `${getFacturaEndpoint(id)}/view`,
  ver: (id) => `${getFacturaEndpoint(id)}/ver`,

  descargar: (id) => `${getFacturaEndpoint(id)}/descargar`,
  download: (id) => `${getFacturaEndpoint(id)}/download`,

  pdfByDisposition: (id, disposition = FACTURAS_DISPOSITIONS.ATTACHMENT) =>
    buildFacturaPdfEndpoint(id, disposition),

  send: (id) => `${getFacturaEndpoint(id)}/enviar`,
  sendAlias: (id) => `${getFacturaEndpoint(id)}/send`,
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let text = value
      .trim()
      .replace(/€/g, "")
      .replace(/%/g, "")
      .replace(/\s+/g, "");

    const hasComma = text.includes(",");
    const hasDot = text.includes(".");

    if (hasComma && hasDot) {
      text = text.replace(/\./g, "").replace(/,/g, ".");
    } else if (hasComma) {
      text = text.replace(/,/g, ".");
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

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
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
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
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

function round2(value = 0) {
  const n = safeNumber(value, 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
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
      item.caseId,

      item.ticket?.ticketId,
      item.ticket?.incidenciaId,
      item.ticket?.id,

      item.incidencia?.ticketId,
      item.incidencia?.incidenciaId,
      item.incidencia?.id,

      item.linkedTicket?.ticketId,
      item.linkedTicket?.incidenciaId,
      item.linkedTicket?.id,

      item.relations?.ticket?.ticketId,
      item.relations?.ticket?.incidenciaId,
      item.relations?.ticket?.id
    );

    if (candidate) {
      return safeText(candidate, "");
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

      factura.relatedTicket?.id,
      factura.relatedTicket?.ticketId,
      factura.relatedTicket?.incidenciaId,

      factura.relatedTicketId,
      factura.relatedIncidentId,
      factura.supportTicketId,
      factura.caseId,

      factura.relations?.ticket?.id,
      factura.relations?.ticket?.ticketId,
      factura.relations?.ticket?.incidenciaId,
      factura.relations?.incidencia?.id,
      factura.relations?.incidencia?.ticketId,
      factura.relations?.incidencia?.incidenciaId,

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
      pickTicketIdFromArray(factura.invoiceLinks),
      pickTicketIdFromArray(factura.invoiceRelations),
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

      raw.relatedTicket?.id,
      raw.relatedTicket?.ticketId,
      raw.relatedTicket?.incidenciaId,

      raw.relatedTicketId,
      raw.relatedIncidentId,
      raw.supportTicketId,
      raw.caseId,

      raw.relations?.ticket?.id,
      raw.relations?.ticket?.ticketId,
      raw.relations?.ticket?.incidenciaId,
      raw.relations?.incidencia?.id,
      raw.relations?.incidencia?.ticketId,
      raw.relations?.incidencia?.incidenciaId,

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
      pickTicketIdFromArray(raw.invoiceLinks),
      pickTicketIdFromArray(raw.invoiceRelations),
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
    factura.relatedTicket,
    factura.relations?.ticket,
    factura.relations?.incidencia,

    raw.incidencia,
    raw.ticket,
    raw.linkedTicket,
    raw.relatedTicket,
    raw.relations?.ticket,
    raw.relations?.incidencia
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

  if (!finalId) return null;

  const subject = safeText(
    first(
      relation.subject,
      relation.asunto,
      relation.title,

      factura.incidencia?.subject,
      factura.incidencia?.asunto,
      factura.incidencia?.title,

      factura.ticket?.subject,
      factura.ticket?.asunto,
      factura.ticket?.title,

      raw.incidencia?.subject,
      raw.incidencia?.asunto,
      raw.incidencia?.title,

      raw.ticket?.subject,
      raw.ticket?.asunto,
      raw.ticket?.title
    ),
    ""
  );

  return {
    ...relation,

    id: finalId,
    ticketId: finalId,
    incidenciaId: finalId,

    subject,
    asunto: safeText(first(relation.asunto, subject), subject),
    title: safeText(first(relation.title, subject), subject),

    clienteId: safeText(
      first(
        relation.clienteId,
        factura.clienteId,
        factura.cliente?.id,
        factura.cliente?.clienteId,
        raw.clienteId,
        raw.cliente?.id,
        raw.cliente?.clienteId
      ),
      ""
    ),

    clienteNombre: safeText(
      first(
        relation.clienteNombre,
        factura.clienteNombre,
        factura.cliente?.nombre,
        factura.cliente?.nombreContacto,
        factura.cliente?.name,
        factura.cliente?.razonSocial,
        raw.clienteNombre,
        raw.cliente?.nombre,
        raw.cliente?.nombreContacto,
        raw.cliente?.name,
        raw.cliente?.razonSocial
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
        factura.ticketLinkAudit?.linkedAt,
        raw.ticketLinkAudit?.linkedAt,
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
        factura.ticketLinkAudit?.linkedAtES,
        raw.ticketLinkAudit?.linkedAtES,
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

  const payload = safeObject(incidenciaPayload, {
    id: incidenciaId,
    ticketId: incidenciaId,
    incidenciaId,
  });

  return {
    ...base,

    ticketId: safeText(first(base.ticketId, incidenciaId), incidenciaId),
    incidenciaId: safeText(first(base.incidenciaId, incidenciaId), incidenciaId),
    relatedTicketId: safeText(first(base.relatedTicketId, incidenciaId), incidenciaId),
    relatedIncidentId: safeText(first(base.relatedIncidentId, incidenciaId), incidenciaId),
    supportTicketId: safeText(first(base.supportTicketId, incidenciaId), incidenciaId),
    caseId: safeText(first(base.caseId, incidenciaId), incidenciaId),

    incidencia: isNonEmptyObject(base.incidencia)
      ? {
          ...payload,
          ...base.incidencia,
          id: safeText(first(base.incidencia?.id, incidenciaId), incidenciaId),
          ticketId: safeText(first(base.incidencia?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeText(first(base.incidencia?.incidenciaId, incidenciaId), incidenciaId),
        }
      : payload,

    ticket: isNonEmptyObject(base.ticket)
      ? {
          ...payload,
          ...base.ticket,
          id: safeText(first(base.ticket?.id, incidenciaId), incidenciaId),
          ticketId: safeText(first(base.ticket?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeText(first(base.ticket?.incidenciaId, incidenciaId), incidenciaId),
        }
      : payload,

    linkedTicket: isNonEmptyObject(base.linkedTicket)
      ? {
          ...payload,
          ...base.linkedTicket,
          id: safeText(first(base.linkedTicket?.id, incidenciaId), incidenciaId),
          ticketId: safeText(first(base.linkedTicket?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeText(first(base.linkedTicket?.incidenciaId, incidenciaId), incidenciaId),
        }
      : payload,

    relations: {
      ...safeObject(base.relations),
      ticket: {
        ...payload,
        ...safeObject(base.relations?.ticket),
        id: safeText(first(base.relations?.ticket?.id, incidenciaId), incidenciaId),
        ticketId: safeText(first(base.relations?.ticket?.ticketId, incidenciaId), incidenciaId),
        incidenciaId: safeText(
          first(base.relations?.ticket?.incidenciaId, incidenciaId),
          incidenciaId
        ),
      },
    },

    meta: {
      ...safeObject(base.meta),
      hasIncidencia: true,
      incidenciaId,
      ticketId: incidenciaId,
    },
  };
}

function normalizeFacturaSafe(source = {}) {
  const original = safeObject(source);
  const originalRaw = safeObject(original.raw, original);

  let normalized = null;

  try {
    normalized = normalizeFactura(original);
  } catch (error) {
    console.error("❌ FACTURAS NORMALIZE ERROR:", {
      message: error?.message || "UNKNOWN_ERROR",
      stack: error?.stack || null,
      source: original,
    });

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

  const incidenceSource = {
    ...originalRaw,
    ...original,
    ...model,
    raw: {
      ...originalRaw,
      ...safeObject(model.raw),
    },
  };

  const incidenciaPayload = buildIncidenciaPayload(incidenceSource, incidenciaId);

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

  const payload = safeObject(incidenciaPayload, {
    id: incidenciaId,
    ticketId: incidenciaId,
    incidenciaId,
  });

  return {
    ...model,

    ticketId: safeText(first(model.ticketId, incidenciaId), incidenciaId),
    incidenciaId: safeText(first(model.incidenciaId, incidenciaId), incidenciaId),
    relatedTicketId: safeText(first(model.relatedTicketId, incidenciaId), incidenciaId),
    relatedIncidentId: safeText(first(model.relatedIncidentId, incidenciaId), incidenciaId),
    supportTicketId: safeText(first(model.supportTicketId, incidenciaId), incidenciaId),
    caseId: safeText(first(model.caseId, incidenciaId), incidenciaId),

    incidencia: isNonEmptyObject(model.incidencia)
      ? {
          ...payload,
          ...model.incidencia,
          id: safeText(first(model.incidencia?.id, incidenciaId), incidenciaId),
          ticketId: safeText(first(model.incidencia?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeText(
            first(model.incidencia?.incidenciaId, incidenciaId),
            incidenciaId
          ),
        }
      : payload,

    ticket: isNonEmptyObject(model.ticket)
      ? {
          ...payload,
          ...model.ticket,
          id: safeText(first(model.ticket?.id, incidenciaId), incidenciaId),
          ticketId: safeText(first(model.ticket?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeText(first(model.ticket?.incidenciaId, incidenciaId), incidenciaId),
        }
      : payload,

    linkedTicket: isNonEmptyObject(model.linkedTicket)
      ? {
          ...payload,
          ...model.linkedTicket,
          id: safeText(first(model.linkedTicket?.id, incidenciaId), incidenciaId),
          ticketId: safeText(
            first(model.linkedTicket?.ticketId, incidenciaId),
            incidenciaId
          ),
          incidenciaId: safeText(
            first(model.linkedTicket?.incidenciaId, incidenciaId),
            incidenciaId
          ),
        }
      : payload,

    relations: {
      ...safeObject(model.relations),
      ticket: {
        ...payload,
        ...safeObject(model.relations?.ticket),
        id: safeText(first(model.relations?.ticket?.id, incidenciaId), incidenciaId),
        ticketId: safeText(
          first(model.relations?.ticket?.ticketId, incidenciaId),
          incidenciaId
        ),
        incidenciaId: safeText(
          first(model.relations?.ticket?.incidenciaId, incidenciaId),
          incidenciaId
        ),
      },
    },

    relationType: safeText(
      first(
        model.relationType,
        original.relationType,
        originalRaw.relationType,
        payload.relationType,
        "linked_ticket"
      ),
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
    obj.data?.resource,

    obj.result?.data,
    obj.result?.payload,
    obj.result?.resource,

    obj.payload?.data,
    obj.payload?.result,
    obj.payload?.resource,
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
      obj.totalMatched,

      obj.meta?.total,
      obj.meta?.count,
      obj.meta?.remoteCount,
      obj.meta?.totalMatched,

      obj.pagination?.total,
      obj.pagination?.count,
      obj.pagination?.totalItems,
      obj.pagination?.totalMatched,

      obj.data?.total,
      obj.data?.count,
      obj.data?.remoteCount,
      obj.data?.totalMatched,

      obj.result?.total,
      obj.result?.count,
      obj.result?.remoteCount,
      obj.result?.totalMatched,

      obj.payload?.total,
      obj.payload?.count,
      obj.payload?.remoteCount,
      obj.payload?.totalMatched
    );

    if (total !== null && total !== undefined) {
      return safeNumber(total, fallback);
    }
  }

  return fallback;
}

function extractFacturaDetail(payload = null) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

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

  const obj = safeObject(payload, null);

  if (obj && !Array.isArray(obj)) {
    return first(obj.data, obj.result, obj.payload, obj.resource, obj);
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
      obj.filters,

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

function extractStats(payload = null) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) continue;

    const stats = first(
      obj.stats,
      obj.data?.stats,
      obj.result?.stats,
      obj.payload?.stats
    );

    if (isNonEmptyObject(stats)) {
      return safeObject(stats);
    }
  }

  return {};
}

function extractRequestId(payload = null) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) continue;

    const requestId = safeText(
      first(
        obj.requestId,
        obj.data?.requestId,
        obj.result?.requestId,
        obj.payload?.requestId,
        obj.meta?.requestId
      ),
      ""
    );

    if (requestId) return requestId;
  }

  return "";
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
  const value = normalizeKey(
    safeText(disposition, FACTURAS_DISPOSITIONS.ATTACHMENT)
  );

  if (
    value === FACTURAS_DISPOSITIONS.INLINE ||
    value === FACTURAS_PDF_MODES.INLINE ||
    value === FACTURAS_PDF_MODES.VIEW ||
    value === "ver"
  ) {
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

export function buildFacturaPdfViewEndpoint(id = "") {
  return `${getFacturaEndpoint(id)}/pdf?disposition=inline`;
}

export function buildFacturaDownloadEndpoint(id = "") {
  return `${getFacturaEndpoint(id)}/descargar?disposition=attachment`;
}

function appendParam(params, name, value) {
  const key = safeText(name, "");
  if (!key) return;

  if (Array.isArray(value)) {
    const cleanValues = value
      .map((item) => normalizeQueryValue(item))
      .filter(Boolean);

    if (cleanValues.length) {
      params.set(key, cleanValues.join(","));
    }

    return;
  }

  const normalizedValue = normalizeQueryValue(value);

  if (normalizedValue) {
    params.set(key, normalizedValue);
  }
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

  if (finalLimit) {
    params.set("limit", String(finalLimit));
  }

  const finalSearch = safeText(first(search, q), "");

  if (finalSearch) {
    params.set("q", finalSearch);
    params.set("search", finalSearch);
  }

  const finalSort = safeText(first(sort, sortBy), "");
  const finalDirection = safeText(first(direction, sortDir), "");

  if (finalSort) {
    params.set("sort", finalSort);
    params.set("sortBy", finalSort);
  }

  if (finalDirection) {
    params.set("direction", finalDirection);
    params.set("sortDir", finalDirection);
  }

  const finalFilters = safeObject(filters);

  const aliases = {
    paymentStatus: "estadoPago",
    status: "estado",
    incidenciaId: "ticketId",
    relatedTicketId: "ticketId",
    relatedIncidentId: "ticketId",
    month: "mes",
    fechaDesde: "from",
    fechaHasta: "to",
    hasIncidencia: "withIncidencia",
    hasPdf: "withPdf",
  };

  for (const [rawKey, value] of Object.entries(finalFilters)) {
    const key = safeText(rawKey, "");
    if (!key) continue;

    appendParam(params, key, value);

    const alias = aliases[key];
    if (alias) {
      appendParam(params, alias, value);
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

  if (typeof client?.get === "function") {
    return client.get(endpoint, buildRequestOptions(options));
  }

  if (typeof client?.request === "function") {
    return client.request(endpoint, {
      method: "GET",
      ...buildRequestOptions(options),
    });
  }

  throw new Error("FACTURAS_API_METHOD_UNAVAILABLE:get");
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

async function apiPut(endpoint = "", body = {}, options = {}) {
  const client = getApiClient();

  if (typeof client?.put === "function") {
    return client.put(endpoint, body, buildRequestOptions(options));
  }

  if (typeof client?.request === "function") {
    return client.request(endpoint, {
      method: "PUT",
      body,
      ...buildRequestOptions(options),
    });
  }

  throw new Error("FACTURAS_API_METHOD_UNAVAILABLE:put");
}

async function apiPatch(endpoint = "", body = {}, options = {}) {
  const client = getApiClient();

  if (typeof client?.patch === "function") {
    return client.patch(endpoint, body, buildRequestOptions(options));
  }

  if (typeof client?.request === "function") {
    return client.request(endpoint, {
      method: "PATCH",
      body,
      ...buildRequestOptions(options),
    });
  }

  throw new Error("FACTURAS_API_METHOD_UNAVAILABLE:patch");
}

async function apiDelete(endpoint = "", options = {}) {
  const client = getApiClient();

  if (typeof client?.delete === "function") {
    return client.delete(endpoint, buildRequestOptions(options));
  }

  if (typeof client?.remove === "function") {
    return client.remove(endpoint, buildRequestOptions(options));
  }

  if (typeof client?.request === "function") {
    return client.request(endpoint, {
      method: "DELETE",
      ...buildRequestOptions(options),
    });
  }

  throw new Error("FACTURAS_API_METHOD_UNAVAILABLE:delete");
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
  const requestId = extractRequestId(payload);

  return {
    ok,
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

    raw: payload,

    filters: safeObject(first(payload?.filters, payload?.data?.filters, {})),

    stats: safeObject(first(payload?.stats, payload?.data?.stats, {})),

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
  const detail = extractFacturaDetail(payload);
  const item = detail ? normalizeFacturaSafe(detail) : null;

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
  const stats = extractStats(payload);

  return {
    ok: extractOk(payload, true),
    requestId: extractRequestId(payload),
    stats,
    raw: payload,
    meta: extractMeta(payload),
  };
}

export function normalizeFacturasHealthResponse(payload = null) {
  const obj = safeObject(extractFacturaDetail(payload), safeObject(payload));

  return {
    ok: extractOk(payload, true),
    requestId: extractRequestId(payload),
    health: obj,
    raw: payload,
    meta: extractMeta(payload),
  };
}

export function normalizeFacturaSendResponse(payload = null) {
  const obj = safeObject(extractFacturaDetail(payload), safeObject(payload));
  const factura = first(obj.factura, obj.data?.factura, obj.result?.factura);

  return {
    ok: extractOk(payload, true),
    requestId: extractRequestId(payload),

    sent: safeObject(first(obj.sent, obj.data?.sent, obj.result?.sent), null),
    factura: factura ? normalizeFacturaSafe(factura) : null,

    message: safeText(
      first(obj.message, obj.data?.message, obj.result?.message),
      "Factura enviada correctamente."
    ),

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

function extractBlobFromResponse(response = null) {
  if (!response) return null;

  if (isBlobLike(response)) return response;
  if (isBlobLike(response.data)) return response.data;
  if (isBlobLike(response.body)) return response.body;
  if (isBlobLike(response.result)) return response.result;
  if (isBlobLike(response.payload)) return response.payload;

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

export function resolveFacturaPdfUrl(response = null) {
  if (typeof response === "string") {
    return response;
  }

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
        obj?.pdfUrl,
        obj?.publicUrl,

        obj?.data?.file?.url,
        obj?.data?.url,
        obj?.data?.downloadUrl,
        obj?.data?.viewUrl,
        obj?.data?.pdfUrl,
        obj?.data?.publicUrl,

        obj?.result?.file?.url,
        obj?.result?.url,
        obj?.result?.downloadUrl,
        obj?.result?.viewUrl,
        obj?.result?.pdfUrl,
        obj?.result?.publicUrl,

        obj?.payload?.file?.url,
        obj?.payload?.url,
        obj?.payload?.downloadUrl,
        obj?.payload?.viewUrl,
        obj?.payload?.pdfUrl,
        obj?.payload?.publicUrl
      ),
      ""
    );

    if (url) return url;
  }

  return "";
}

export function createObjectUrlFromPdfResponse(response = null) {
  const blob = extractBlobFromResponse(response);

  if (!blob) return "";

  try {
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

export function normalizeFacturaPdfResponse(response = null, fallbackUrl = "") {
  const explicitUrl = resolveFacturaPdfUrl(response);
  const objectUrl = explicitUrl ? "" : createObjectUrlFromPdfResponse(response);
  const blob = extractBlobFromResponse(response);

  return {
    ok: true,
    url: explicitUrl || objectUrl || fallbackUrl || "",
    objectUrl,
    blob,
    raw: response,
    meta: extractMeta(response),
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
    searchParam: "q",
    sortByParam: "sort",
    sortDirParam: "direction",
    defaultPage: FACTURAS_DEFAULT_PAGE,
    defaultLimit: FACTURAS_DEFAULT_LIMIT,
    includeDefaults: false,
  },

  buildListOptions: ({ requestOptions }) => ({
    timeout: FACTURAS_LIST_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
  }),

  buildDetailOptions: ({ requestOptions }) => ({
    timeout: FACTURAS_DETAIL_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
  }),

  buildCreateOptions: ({ requestOptions }) => ({
    timeout: FACTURAS_CREATE_TIMEOUT,
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

export async function fetchFacturasHealthRequest(requestOptions = {}) {
  const response = await apiGet(FACTURAS_ENDPOINTS.health(), {
    timeout: FACTURAS_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
  });

  return normalizeFacturasHealthResponse(response);
}

export async function fetchFacturasStatsRequest(requestOptions = {}) {
  const response = await apiGet(FACTURAS_ENDPOINTS.stats(), {
    timeout: FACTURAS_STATS_TIMEOUT,
    auth: true,
    ...safeObject(requestOptions),
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
    ...safeObject(requestOptions),
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

export async function fetchFacturaDetailRequest(
  id,
  {
    timeout = FACTURAS_DETAIL_TIMEOUT,
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

export async function fetchFacturaPdfRequest(
  id,
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT,
  {
    timeout = FACTURAS_PDF_TIMEOUT,
    auth = true,
    responseType = "blob",
    raw = true,
    ...rest
  } = {}
) {
  const endpoint = buildFacturaPdfEndpoint(id, disposition);

  const response = await apiGet(endpoint, {
    timeout,
    auth,
    responseType,
    raw,
    ...rest,
  });

  return normalizeFacturaPdfResponse(response, endpoint);
}

export async function fetchFacturaPdfUrlRequest(
  id,
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT,
  options = {}
) {
  const result = await fetchFacturaPdfRequest(id, disposition, options);

  if (result.url) {
    return result.url;
  }

  return buildFacturaPdfEndpoint(id, disposition);
}

export async function viewFacturaPdfRequest(id, options = {}) {
  return fetchFacturaPdfRequest(id, FACTURAS_DISPOSITIONS.INLINE, options);
}

export async function downloadFacturaPdfRequest(id, options = {}) {
  return fetchFacturaPdfRequest(id, FACTURAS_DISPOSITIONS.ATTACHMENT, options);
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
  const response = await apiPost(FACTURAS_ENDPOINTS.send(id), safeObject(payload), {
    timeout,
    auth,
    ...rest,
  });

  return normalizeFacturaSendResponse(response);
}

export async function createFacturaRequest(
  payload = {},
  {
    timeout = FACTURAS_CREATE_TIMEOUT,
    auth = true,
    ...rest
  } = {}
) {
  const response = await apiPost(FACTURAS_ENDPOINT, safeObject(payload), {
    timeout,
    auth,
    ...rest,
  });

  return normalizeFacturaDetailResponse(response);
}

export async function updateFacturaRequest(
  id,
  payload = {},
  {
    timeout = FACTURAS_TIMEOUT,
    auth = true,
    ...rest
  } = {}
) {
  const response = await apiPut(getFacturaEndpoint(id), safeObject(payload), {
    timeout,
    auth,
    ...rest,
  });

  return normalizeFacturaDetailResponse(response);
}

export async function patchFacturaRequest(
  id,
  payload = {},
  {
    timeout = FACTURAS_TIMEOUT,
    auth = true,
    ...rest
  } = {}
) {
  const response = await apiPatch(getFacturaEndpoint(id), safeObject(payload), {
    timeout,
    auth,
    ...rest,
  });

  return normalizeFacturaDetailResponse(response);
}

export async function removeFacturaRequest(
  id,
  {
    timeout = FACTURAS_TIMEOUT,
    auth = true,
    ...rest
  } = {}
) {
  return apiDelete(getFacturaEndpoint(id), {
    timeout,
    auth,
    ...rest,
  });
}

/* =========================================================
   DOMAIN HELPERS PUBLIC
========================================================= */

export function hasFacturaIncidencia(item = {}) {
  return Boolean(getIncidenciaIdFromFactura(item));
}

export function getFacturaIncidenciaId(item = {}) {
  return getIncidenciaIdFromFactura(item);
}

export function getFacturaStableId(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  return safeText(
    first(
      factura.id,
      factura.facturaId,
      factura.invoiceId,
      factura.numero,
      factura.numeroFacturaLegal,
      factura.numeroFacturaSistema,
      raw.id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema
    ),
    ""
  );
}

export function getFacturaAmount(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  return round2(
    first(
      factura.total,
      factura.amount,
      factura.importe,
      factura.importeTotal,
      factura.totalFactura,
      factura.invoiceAmount,
      factura.facturaTotal,
      factura.totals?.total,
      factura.resumen?.total,

      raw.total,
      raw.amount,
      raw.importe,
      raw.importeTotal,
      raw.totalFactura,
      raw.invoiceAmount,
      raw.facturaTotal,
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

  dispositions: FACTURAS_DISPOSITIONS,
  pdfModes: FACTURAS_PDF_MODES,
  endpoints: FACTURAS_ENDPOINTS,

  getApiClient,

  normalizeFactura: normalizeFacturaSafe,
  normalizeFacturaSafe,
  normalizeFacturaId,

  normalizeFacturasListResponse,
  normalizeFacturaDetailResponse,
  normalizeFacturasStatsResponse,
  normalizeFacturasHealthResponse,
  normalizeFacturaSendResponse,
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
  stats: fetchFacturasStatsRequest,

  list: fetchFacturasRequest,
  detail: fetchFacturaDetailRequest,

  create: createFacturaRequest,
  update: updateFacturaRequest,
  patch: patchFacturaRequest,
  remove: removeFacturaRequest,

  baseCreate: baseCollectionApi.create,
  baseUpdate: baseCollectionApi.update,
  basePatch: baseCollectionApi.patch,
  baseRemove: baseCollectionApi.remove,

  fetchFacturasHealthRequest,
  fetchFacturasStatsRequest,
  fetchFacturasRequest,
  fetchFacturaDetailRequest,

  fetchFacturaPdfRequest,
  fetchFacturaPdfUrlRequest,
  viewFacturaPdfRequest,
  downloadFacturaPdfRequest,

  sendFacturaRequest,
  createFacturaRequest,
  updateFacturaRequest,
  patchFacturaRequest,
  removeFacturaRequest,
});

export default FacturasApi;
