/* =========================================================
   Onion SPA - Facturas Loaders
   Archivo: src/views/facturas/facturas.loaders.js

   FINAL PRO SYSTEM · LOADERS REAL · 10/10 EXTREME
   PATCH · API ALIGNED · STORE SAFE · DETAIL RACE SAFE
   PATCH · FACTURAS ARRAY + INCIDENCIA PRESERVER
   PATCH · NORMALIZED API COMPAT + LEGACY RESPONSE COMPAT
   PATCH · RAW PAYLOAD DEEP READER + STALE RESPONSE FALLBACK

   RESPONSABILIDADES:
   - cargar colección de facturas desde backend
   - cargar detalle individual de factura
   - sincronizar Store y estado local del módulo
   - controlar flags de loading / refresh / error / inflight
   - mantener paridad de flujo con incidenciasView
   - evitar estados colgados en render / inflight
   - preservar relación factura ↔ incidencia para columna Incidencia
   - preservar relación factura ↔ incidencia en detalle
   - tolerar respuestas normalizadas desde facturas.api.js
   - tolerar respuestas legacy del backend
   - leer datos reales dentro de raw/raw.data/raw.payload/raw.result
   - evitar tabla vacía si una respuesta stale trae datos y el store sigue vacío

   BACKEND ALINEADO:
   - GET /api/facturas
   - GET /api/facturas/:id

   API NORMALIZADA ESPERADA:
   - fetchFacturasRequest() -> {
       ok,
       items,
       facturas,
       total,
       count,
       remoteCount,
       page,
       limit,
       raw,
       meta
     }

   - fetchFacturaDetailRequest(id) -> {
       ok,
       item,
       factura,
       raw,
       meta
     }

   HARDENING PRO:
   - anti-race por token en colección
   - anti-race por id/token en detalle
   - loading inicial vs refreshing posterior
   - lastSyncAt coherente
   - remoteCount robusto
   - detalle con apertura previa segura
   - error de detalle no ensucia error global
   - no pisa detalle si llega una respuesta vieja
   - no rompe si normalizeFactura falla
   - no duplica inflight de colección
   - no devuelve inflight de detalle de otra factura
   - no descarta datos si el wrapper normalizado viene vacío pero raw trae facturas
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  normalizeFactura,
} from "./facturas.model.js";

import {
  fetchFacturasRequest,
  fetchFacturaDetailRequest,
} from "./facturas.api.js";

import {
  setFacturasStore,
  getFacturaByIdStore,
} from "./facturas.store.js";

import {
  safeText,
} from "./facturas.utils.js";

import {
  getFacturasInflightLoad,
  getFacturasInflightDetail,
  getFacturasDetailData,
  isFacturasLoaded,

  setFacturasLoading,
  setFacturasLoaded,
  setFacturasError,
  clearFacturasError,
  setFacturasRefreshing,
  setFacturasRemoteCount,
  setFacturasLastSyncAt,

  setFacturasDetailOpen,
  setFacturasDetailLoading,
  setFacturasDetailData,

  setFacturasInflightLoad,
  setFacturasInflightDetail,
} from "./facturas.state.js";

/* =========================================================
   MODULE STATE
========================================================= */

let collectionLoadToken = 0;
let detailLoadToken = 0;

/* =========================================================
   BASE HELPERS
========================================================= */

function safeRender(render) {
  try {
    if (typeof render === "function") {
      render();
      return true;
    }
  } catch {}

  return false;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function sameIdentity(a = "", b = "") {
  const left = normalizeText(a);
  const right = normalizeText(b);

  return Boolean(left && right && left === right);
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.("[FacturasLoaders]", ...args);
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[FacturasLoaders]", ...args);
  } catch {
    try {
      console.warn("[FacturasLoaders]", ...args);
    } catch {}
  }
}

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail: payload,
      })
    );
    emitted = true;
  } catch {}

  return emitted;
}

function safeErrorMessage(error = null, fallback = "") {
  return safeText(
    first(
      error?.data?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.payload?.message,
      error?.result?.message,
      error?.message,
      fallback
    ),
    fallback
  );
}

function ensureStateShape(state = null) {
  if (!state || typeof state !== "object") {
    throw new Error("FACTURAS_STATE_REQUIRED");
  }

  if (!state.view || typeof state.view !== "object") {
    state.view = {};
  }

  if (!state.detail || typeof state.detail !== "object") {
    state.detail = {};
  }

  if (!state.inflight || typeof state.inflight !== "object") {
    state.inflight = {};
  }

  if (!state.actions || typeof state.actions !== "object") {
    state.actions = {};
  }

  return state;
}

function getFacturaIdentity(item = null) {
  const source = safeObject(item);
  const raw = safeObject(source.raw);

  return safeText(
    first(
      source.id,
      source._id,
      source.facturaId,
      source.invoiceId,
      source.numero,
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.invoiceNumber,
      source.code,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.invoiceNumber,
      raw.code
    ),
    ""
  );
}

function getFacturaIdentityList(item = null) {
  const source = safeObject(item);
  const raw = safeObject(source.raw);

  return [
    source.id,
    source._id,
    source.facturaId,
    source.invoiceId,
    source.numero,
    source.numeroFacturaLegal,
    source.numeroFacturaSistema,
    source.invoiceNumber,
    source.code,

    raw.id,
    raw._id,
    raw.facturaId,
    raw.invoiceId,
    raw.numero,
    raw.numeroFacturaLegal,
    raw.numeroFacturaSistema,
    raw.invoiceNumber,
    raw.code,
  ]
    .map((value) => safeText(value, ""))
    .filter(Boolean);
}

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
      item.linkedTicket?.id
    );

    if (candidate) {
      return safeText(candidate, "");
    }
  }

  return null;
}

/* =========================================================
   INCIDENCIA / TICKET PRESERVER
========================================================= */

function getRelatedIncidenciaId(item = {}) {
  const source = safeObject(item);
  const raw = safeObject(source.raw);

  const incidencia = safeObject(
    first(
      source.incidencia,
      raw.incidencia
    )
  );

  const ticket = safeObject(
    first(
      source.ticket,
      raw.ticket
    )
  );

  const linkedTicket = safeObject(
    first(
      source.linkedTicket,
      raw.linkedTicket
    )
  );

  const relatedTicket = safeObject(
    first(
      source.relatedTicket,
      raw.relatedTicket
    )
  );

  const relationTicket = safeObject(
    first(
      source.relations?.ticket,
      raw.relations?.ticket
    )
  );

  const relationIncidencia = safeObject(
    first(
      source.relations?.incidencia,
      raw.relations?.incidencia
    )
  );

  return safeText(
    first(
      source.ticketId,
      source.incidenciaId,

      incidencia.ticketId,
      incidencia.id,
      incidencia.incidenciaId,

      ticket.ticketId,
      ticket.id,
      ticket.incidenciaId,

      linkedTicket.ticketId,
      linkedTicket.id,
      linkedTicket.incidenciaId,

      relatedTicket.ticketId,
      relatedTicket.id,
      relatedTicket.incidenciaId,

      relationTicket.ticketId,
      relationTicket.id,
      relationTicket.incidenciaId,

      relationIncidencia.ticketId,
      relationIncidencia.id,
      relationIncidencia.incidenciaId,

      source.relatedTicketId,
      source.relatedIncidentId,
      source.supportTicketId,
      source.caseId,

      source.meta?.ticketId,
      source.meta?.incidenciaId,

      pickTicketIdFromArray(source.ticketIds),
      pickTicketIdFromArray(source.incidenciaIds),
      pickTicketIdFromArray(source.relatedTicketIds),
      pickTicketIdFromArray(source.relatedIncidentIds),
      pickTicketIdFromArray(source.linkedTickets),
      pickTicketIdFromArray(source.incidencias),
      pickTicketIdFromArray(source.tickets),
      pickTicketIdFromArray(source.relatedTickets),
      pickTicketIdFromArray(source.relations),
      pickTicketIdFromArray(source.facturasRelacionadas),
      pickTicketIdFromArray(source.linkedInvoices?.tickets),
      pickTicketIdFromArray(source.invoiceLinks),
      pickTicketIdFromArray(source.invoiceRelations),

      raw.ticketId,
      raw.incidenciaId,

      raw.incidencia?.ticketId,
      raw.incidencia?.id,
      raw.incidencia?.incidenciaId,

      raw.ticket?.ticketId,
      raw.ticket?.id,
      raw.ticket?.incidenciaId,

      raw.linkedTicket?.ticketId,
      raw.linkedTicket?.id,
      raw.linkedTicket?.incidenciaId,

      raw.relatedTicket?.ticketId,
      raw.relatedTicket?.id,
      raw.relatedTicket?.incidenciaId,

      raw.relations?.ticket?.ticketId,
      raw.relations?.ticket?.id,
      raw.relations?.ticket?.incidenciaId,

      raw.relations?.incidencia?.ticketId,
      raw.relations?.incidencia?.id,
      raw.relations?.incidencia?.incidenciaId,

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
      pickTicketIdFromArray(raw.relations),
      pickTicketIdFromArray(raw.facturasRelacionadas),
      pickTicketIdFromArray(raw.linkedInvoices?.tickets),
      pickTicketIdFromArray(raw.invoiceLinks),
      pickTicketIdFromArray(raw.invoiceRelations)
    ),
    ""
  );
}

function buildIncidenciaPayload(item = {}) {
  const source = safeObject(item);
  const raw = safeObject(source.raw);

  const incidencia = safeObject(
    first(
      source.incidencia,
      raw.incidencia
    )
  );

  const ticket = safeObject(
    first(
      source.ticket,
      raw.ticket
    )
  );

  const linkedTicket = safeObject(
    first(
      source.linkedTicket,
      raw.linkedTicket
    )
  );

  const relatedTicket = safeObject(
    first(
      source.relatedTicket,
      raw.relatedTicket
    )
  );

  const relationTicket = safeObject(
    first(
      source.relations?.ticket,
      raw.relations?.ticket
    )
  );

  const incidenciaId = getRelatedIncidenciaId(source);

  if (!incidenciaId) {
    return null;
  }

  const subject = safeText(
    first(
      incidencia.subject,
      incidencia.asunto,
      incidencia.title,

      ticket.subject,
      ticket.asunto,
      ticket.title,

      linkedTicket.subject,
      linkedTicket.asunto,
      linkedTicket.title,

      relatedTicket.subject,
      relatedTicket.asunto,
      relatedTicket.title,

      relationTicket.subject,
      relationTicket.asunto,
      relationTicket.title,

      source.subject,
      source.asunto,
      source.title,
      raw.subject,
      raw.asunto,
      raw.title,

      "Incidencia relacionada"
    ),
    "Incidencia relacionada"
  );

  return {
    ...incidencia,

    id: incidenciaId,
    ticketId: incidenciaId,
    incidenciaId,
    code: safeText(first(incidencia.code, ticket.code, linkedTicket.code, incidenciaId), incidenciaId),
    ticketCode: safeText(first(incidencia.ticketCode, ticket.ticketCode, linkedTicket.ticketCode, incidenciaId), incidenciaId),

    subject,
    asunto: safeText(first(incidencia.asunto, subject), subject),
    title: safeText(first(incidencia.title, subject), subject),

    clienteId: safeText(
      first(
        incidencia.clienteId,
        ticket.clienteId,
        linkedTicket.clienteId,
        relatedTicket.clienteId,
        relationTicket.clienteId,
        source.clienteId,
        source.cliente?.id,
        raw.clienteId,
        raw.cliente?.id,
        ""
      ),
      ""
    ),

    clienteNombre: safeText(
      first(
        incidencia.clienteNombre,
        incidencia.name,
        incidencia.nombre,

        ticket.clienteNombre,
        ticket.name,
        ticket.nombre,

        linkedTicket.clienteNombre,
        linkedTicket.name,
        linkedTicket.nombre,

        relatedTicket.clienteNombre,
        relatedTicket.name,
        relatedTicket.nombre,

        relationTicket.clienteNombre,
        relationTicket.name,
        relationTicket.nombre,

        source.clienteNombre,
        source.cliente?.nombre,
        source.cliente?.nombreContacto,
        source.cliente?.name,

        raw.clienteNombre,
        raw.cliente?.nombre,
        raw.cliente?.nombreContacto,
        raw.cliente?.name,
        ""
      ),
      ""
    ),

    relationType: safeText(
      first(
        incidencia.relationType,
        ticket.relationType,
        linkedTicket.relationType,
        relatedTicket.relationType,
        relationTicket.relationType,
        source.relationType,
        raw.relationType,
        "linked_ticket"
      ),
      "linked_ticket"
    ),

    linkedAt: safeText(
      first(
        incidencia.linkedAt,
        ticket.linkedAt,
        linkedTicket.linkedAt,
        relatedTicket.linkedAt,
        relationTicket.linkedAt,
        source.linkedAt,
        raw.linkedAt,
        source.updatedAt,
        raw.updatedAt,
        ""
      ),
      ""
    ),

    linkedAtES: safeText(
      first(
        incidencia.linkedAtES,
        ticket.linkedAtES,
        linkedTicket.linkedAtES,
        relatedTicket.linkedAtES,
        relationTicket.linkedAtES,
        source.linkedAtES,
        raw.linkedAtES,
        source.updatedAtES,
        raw.updatedAtES,
        ""
      ),
      ""
    ),
  };
}

function mergeRawIncidencia(raw = {}, incidenciaId = "", incidenciaPayload = null) {
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

    supportTicketId: safeText(
      first(base.supportTicketId, incidenciaId),
      incidenciaId
    ),

    caseId: safeText(
      first(base.caseId, incidenciaId),
      incidenciaId
    ),

    incidencia: hasOwnKeys(base.incidencia)
      ? {
          ...incidenciaPayload,
          ...base.incidencia,
          id: safeText(first(base.incidencia?.id, incidenciaId), incidenciaId),
          ticketId: safeText(first(base.incidencia?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeText(first(base.incidencia?.incidenciaId, incidenciaId), incidenciaId),
        }
      : incidenciaPayload,

    ticket: hasOwnKeys(base.ticket)
      ? {
          ...incidenciaPayload,
          ...base.ticket,
          id: safeText(first(base.ticket?.id, incidenciaId), incidenciaId),
          ticketId: safeText(first(base.ticket?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeText(first(base.ticket?.incidenciaId, incidenciaId), incidenciaId),
        }
      : incidenciaPayload,

    linkedTicket: hasOwnKeys(base.linkedTicket)
      ? {
          ...incidenciaPayload,
          ...base.linkedTicket,
          id: safeText(first(base.linkedTicket?.id, incidenciaId), incidenciaId),
          ticketId: safeText(first(base.linkedTicket?.ticketId, incidenciaId), incidenciaId),
          incidenciaId: safeText(first(base.linkedTicket?.incidenciaId, incidenciaId), incidenciaId),
        }
      : incidenciaPayload,

    meta: {
      ...safeObject(base.meta),
      hasIncidencia: true,
      incidenciaId,
      ticketId: incidenciaId,
    },
  };
}

function preserveIncidenciaFields(normalized = {}, original = {}) {
  const base = safeObject(normalized);
  const source = safeObject(original);

  const embeddedRaw = safeObject(base.raw);
  const sourceRaw = safeObject(source.raw);

  const raw = {
    ...(hasOwnKeys(sourceRaw) ? sourceRaw : source),
    ...(hasOwnKeys(embeddedRaw) ? embeddedRaw : {}),
  };

  const probe = {
    ...source,
    ...base,
    raw,
  };

  const incidenciaId = getRelatedIncidenciaId(probe);
  const incidenciaPayload = buildIncidenciaPayload(probe);

  if (!incidenciaId) {
    return {
      ...base,

      raw,

      meta: {
        ...safeObject(source.meta),
        ...safeObject(base.meta),
        hasIncidencia: Boolean(
          first(
            base.meta?.hasIncidencia,
            source.meta?.hasIncidencia,
            false
          )
        ),
      },
    };
  }

  const nextRaw = mergeRawIncidencia(
    raw,
    incidenciaId,
    incidenciaPayload
  );

  return {
    ...base,

    ticketId: incidenciaId,
    incidenciaId,

    relatedTicketId: safeText(
      first(
        base.relatedTicketId,
        source.relatedTicketId,
        nextRaw.relatedTicketId,
        incidenciaId
      ),
      incidenciaId
    ),

    relatedIncidentId: safeText(
      first(
        base.relatedIncidentId,
        source.relatedIncidentId,
        nextRaw.relatedIncidentId,
        incidenciaId
      ),
      incidenciaId
    ),

    supportTicketId: safeText(
      first(
        base.supportTicketId,
        source.supportTicketId,
        nextRaw.supportTicketId,
        incidenciaId
      ),
      incidenciaId
    ),

    caseId: safeText(
      first(
        base.caseId,
        source.caseId,
        nextRaw.caseId,
        incidenciaId
      ),
      incidenciaId
    ),

    incidencia: incidenciaPayload,

    ticket: hasOwnKeys(first(base.ticket, source.ticket, nextRaw.ticket))
      ? {
          ...incidenciaPayload,
          ...safeObject(first(base.ticket, source.ticket, nextRaw.ticket)),
        }
      : incidenciaPayload,

    linkedTicket: hasOwnKeys(first(base.linkedTicket, source.linkedTicket, nextRaw.linkedTicket))
      ? {
          ...incidenciaPayload,
          ...safeObject(first(base.linkedTicket, source.linkedTicket, nextRaw.linkedTicket)),
        }
      : incidenciaPayload,

    relationType: safeText(
      first(
        base.relationType,
        source.relationType,
        nextRaw.relationType,
        incidenciaPayload?.relationType,
        "linked_ticket"
      ),
      "linked_ticket"
    ),

    meta: {
      ...safeObject(source.meta),
      ...safeObject(base.meta),
      hasIncidencia: true,
      incidenciaId,
      ticketId: incidenciaId,
    },

    raw: nextRaw,
  };
}

function normalizeFacturaPreservingLinks(item = {}) {
  const original = safeObject(item);

  let normalized = original;

  try {
    normalized = normalizeFactura(original);
  } catch (error) {
    safeWarn("normalizeFactura falló, usando payload original:", error);
    normalized = original;
  }

  return preserveIncidenciaFields(normalized, original);
}

/* =========================================================
   RESPONSE NORMALIZERS
   PATCH 10/10:
   - baja a raw / raw.data / raw.payload / raw.result
   - tolera wrappers normalizados con items=[] pero raw con datos reales
   - tolera backend legacy con facturas/items/data/results
   - no deja que total=0 de un wrapper vacío tape un raw con total real
========================================================= */

const COLLECTION_ARRAY_KEYS = Object.freeze([
  "items",
  "facturas",
  "invoices",
  "data",
  "rows",
  "results",
  "records",
  "list",
  "collection",
  "documents",
]);

const PAYLOAD_OBJECT_KEYS = Object.freeze([
  "data",
  "body",
  "result",
  "payload",
  "response",
  "raw",
]);

const TOTAL_KEYS = Object.freeze([
  "total",
  "count",
  "remoteCount",
  "totalCount",
  "totalItems",
  "matched",
  "totalMatched",
]);

function pushCandidate(output = [], value = null) {
  if (value === undefined || value === null) {
    return output;
  }

  output.push(value);

  return output;
}

function collectPayloadCandidates(value = null, output = [], seen = new WeakSet(), depth = 0) {
  if (value === undefined || value === null) {
    return output;
  }

  pushCandidate(output, value);

  if (depth >= 5) {
    return output;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return output;
  }

  if (seen.has(value)) {
    return output;
  }

  seen.add(value);

  for (const key of COLLECTION_ARRAY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      pushCandidate(output, value[key]);

      if (value[key] && typeof value[key] === "object" && !Array.isArray(value[key])) {
        collectPayloadCandidates(value[key], output, seen, depth + 1);
      }
    }
  }

  for (const key of PAYLOAD_OBJECT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      pushCandidate(output, value[key]);

      if (value[key] && typeof value[key] === "object" && !Array.isArray(value[key])) {
        collectPayloadCandidates(value[key], output, seen, depth + 1);
      }
    }
  }

  return output;
}

function getPayloadCandidates(payload = null) {
  return collectPayloadCandidates(payload).filter(
    (item) => item !== undefined && item !== null
  );
}

function pickArrayFromCandidate(candidate = null) {
  if (Array.isArray(candidate)) {
    return candidate;
  }

  const obj = safeObject(candidate, null);

  if (!obj) {
    return null;
  }

  let emptyArray = null;

  for (const key of COLLECTION_ARRAY_KEYS) {
    const value = obj[key];

    if (Array.isArray(value)) {
      if (value.length > 0) {
        return value;
      }

      if (!emptyArray) {
        emptyArray = value;
      }
    }
  }

  return emptyArray;
}

function pickCollectionItems(response = null) {
  const candidates = getPayloadCandidates(response);

  let emptyArray = null;

  for (const candidate of candidates) {
    const found = pickArrayFromCandidate(candidate);

    if (Array.isArray(found) && found.length > 0) {
      return found;
    }

    if (Array.isArray(found) && !emptyArray) {
      emptyArray = found;
    }
  }

  return emptyArray || [];
}

function readTotalFromObject(obj = null) {
  const source = safeObject(obj, null);

  if (!source) {
    return null;
  }

  for (const key of TOTAL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }

    const value = source[key];

    if (value === undefined || value === null || value === "") {
      continue;
    }

    const number = safeNumber(value, NaN);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  for (const containerKey of ["meta", "pagination", "pageInfo", "summary"]) {
    const nested = safeObject(source[containerKey], null);

    if (!nested) {
      continue;
    }

    for (const key of TOTAL_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(nested, key)) {
        continue;
      }

      const value = nested[key];

      if (value === undefined || value === null || value === "") {
        continue;
      }

      const number = safeNumber(value, NaN);

      if (Number.isFinite(number)) {
        return number;
      }
    }
  }

  return null;
}

function pickCollectionTotal(response = null, fallback = 0) {
  const candidates = getPayloadCandidates(response);

  let zeroTotal = null;

  for (const candidate of candidates) {
    const total = readTotalFromObject(candidate);

    if (total === null) {
      continue;
    }

    if (total > 0) {
      return total;
    }

    if (total === 0) {
      zeroTotal = 0;
    }
  }

  return zeroTotal !== null ? zeroTotal : fallback;
}

function normalizeCollectionResponse(response = null) {
  const rawItems = pickCollectionItems(response);

  const items = rawItems
    .map((item) => normalizeFacturaPreservingLinks(item))
    .filter((item) => hasOwnKeys(item));

  const total = Math.max(
    pickCollectionTotal(response, items.length),
    items.length
  );

  return {
    items,
    facturas: items,
    total,
    count: items.length,
    remoteCount: total,
    rawItems,
    raw: response,
  };
}

function pickDetailPayload(response = null) {
  if (!response) {
    return null;
  }

  const candidates = getPayloadCandidates(response);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) {
      continue;
    }

    const detail = first(
      obj.item,
      obj.factura,
      obj.invoice,
      obj.record,

      obj.data?.item,
      obj.data?.factura,
      obj.data?.invoice,
      obj.data?.record,

      obj.result?.item,
      obj.result?.factura,
      obj.result?.invoice,
      obj.result?.record,

      obj.payload?.item,
      obj.payload?.factura,
      obj.payload?.invoice,
      obj.payload?.record,

      obj.raw?.item,
      obj.raw?.factura,
      obj.raw?.invoice,
      obj.raw?.record
    );

    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      return detail;
    }
  }

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj || Array.isArray(obj)) {
      continue;
    }

    if (
      obj.id ||
      obj.facturaId ||
      obj.invoiceId ||
      obj.numero ||
      obj.numeroFacturaLegal ||
      obj.numeroFacturaSistema ||
      obj.invoiceNumber
    ) {
      return obj;
    }
  }

  return null;
}

function normalizeDetailResponse(response = null) {
  const payload = pickDetailPayload(response);

  return payload
    ? normalizeFacturaPreservingLinks(payload)
    : null;
}

/* =========================================================
   STORE FALLBACK / MERGE
========================================================= */

function findStoreFacturaById(facturaId = "") {
  const id = safeText(facturaId, "");

  if (!id) return null;

  try {
    const direct = getFacturaByIdStore(id);

    if (direct) {
      return normalizeFacturaPreservingLinks(direct);
    }
  } catch {}

  return null;
}

function mergeDetailWithStore(remoteDetail = {}, facturaId = "") {
  const remote = safeObject(remoteDetail);

  if (!hasOwnKeys(remote)) {
    return null;
  }

  const storeItem = findStoreFacturaById(facturaId || getFacturaIdentity(remote));

  if (!storeItem) {
    return normalizeFacturaPreservingLinks(remote);
  }

  const merged = {
    ...storeItem,
    ...remote,

    raw: {
      ...safeObject(storeItem.raw),
      ...safeObject(remote.raw),
    },

    meta: {
      ...safeObject(storeItem.meta),
      ...safeObject(remote.meta),
    },
  };

  const normalizedMerged = normalizeFacturaPreservingLinks(merged);

  if (getRelatedIncidenciaId(normalizedMerged)) {
    return normalizedMerged;
  }

  const storeRelationId = getRelatedIncidenciaId(storeItem);

  if (!storeRelationId) {
    return normalizedMerged;
  }

  return preserveIncidenciaFields(
    {
      ...normalizedMerged,
      ticketId: storeRelationId,
      incidenciaId: storeRelationId,
    },
    storeItem
  );
}

function isCurrentCollectionToken(state = {}, token = 0) {
  return Boolean(
    state &&
      state.inflight &&
      safeNumber(state.inflight.collectionToken, 0) === token
  );
}

function isCurrentDetailToken(state = {}, token = 0, facturaId = "") {
  return Boolean(
    state &&
      state.inflight &&
      safeNumber(state.inflight.detailToken, 0) === token &&
      sameIdentity(state.inflight.detailFacturaId, facturaId)
  );
}

/* =========================================================
   COLLECTION
========================================================= */

export async function loadFacturasCollection({
  state,
  render,
  silent = false,
  force = false,
  query = {},
} = {}) {
  ensureStateShape(state);

  const inflight = getFacturasInflightLoad(state);

  if (inflight && !force) {
    return inflight;
  }

  const token = collectionLoadToken + 1;
  collectionLoadToken = token;

  state.inflight.collectionToken = token;

  const hasLoaded = isFacturasLoaded(state);
  const shouldRefresh = Boolean(silent || hasLoaded || force);

  clearFacturasError(state);

  if (shouldRefresh) {
    setFacturasRefreshing(state, true);
    setFacturasLoading(state, false);
  } else {
    setFacturasLoading(state, true);
    setFacturasRefreshing(state, false);
  }

  safeRender(render);

  const promise = (async () => {
    try {
      safeEmit("facturas:load:request", {
        query: safeObject(query),
        silent,
        force,
        token,
      });

      const response = await fetchFacturasRequest({
        ...safeObject(query),
      });

      const normalized = normalizeCollectionResponse(response);
      const { items, total } = normalized;

      safeLog("Colección normalizada:", {
        rawItems: normalized.rawItems.length,
        items: items.length,
        total,
        responseKeys: response && typeof response === "object"
          ? Object.keys(response)
          : typeof response,
      });

      if (!isCurrentCollectionToken(state, token)) {
        safeLog("Colección obsoleta recibida:", {
          token,
          currentToken: state.inflight.collectionToken,
          count: items.length,
          total,
        });

        /*
          Salvavidas:
          Si una respuesta vieja trae datos reales y el estado actual sigue vacío,
          no dejamos la UI clavada en 0 registros.
        */
        const currentRemoteCount = safeNumber(
          first(
            state?.view?.remoteCount,
            state?.view?.totalCount,
            state?.remoteCount,
            0
          ),
          0
        );

        if (items.length > 0 && currentRemoteCount <= 0) {
          safeWarn("Aplicando colección obsoleta como fallback porque el store seguía vacío:", {
            token,
            count: items.length,
            total,
          });

          setFacturasStore(items);
          setFacturasRemoteCount(state, Math.max(total, items.length));

          setFacturasLoading(state, false);
          setFacturasRefreshing(state, false);
          setFacturasLoaded(state, true);
          setFacturasLastSyncAt(state, new Date().toISOString());
          clearFacturasError(state);

          safeEmit("facturas:load:stale-fallback", {
            total: Math.max(total, items.length),
            count: items.length,
            items,
            response,
            token,
          });

          safeRender(render);
        }

        return items;
      }

      setFacturasStore(items);
      setFacturasRemoteCount(state, Math.max(total, items.length));

      setFacturasLoading(state, false);
      setFacturasRefreshing(state, false);
      setFacturasLoaded(state, true);
      setFacturasLastSyncAt(state, new Date().toISOString());
      clearFacturasError(state);

      safeEmit("facturas:load:success", {
        total: Math.max(total, items.length),
        count: items.length,
        items,
        response,
        token,
      });

      safeRender(render);

      return items;
    } catch (error) {
      if (isCurrentCollectionToken(state, token)) {
        setFacturasLoading(state, false);
        setFacturasRefreshing(state, false);

        setFacturasError(
          state,
          safeErrorMessage(
            error,
            "No se pudieron cargar las facturas."
          )
        );

        /*
          Marcamos loaded=true para evitar skeleton infinito.
          La vista ya tiene error state + retry.
        */
        setFacturasLoaded(state, true);

        safeEmit("facturas:load:error", {
          error,
          message: safeErrorMessage(
            error,
            "No se pudieron cargar las facturas."
          ),
          token,
        });

        safeRender(render);
      }

      throw error;
    } finally {
      if (isCurrentCollectionToken(state, token)) {
        setFacturasInflightLoad(state, null);
        state.inflight.collectionToken = 0;
      }
    }
  })();

  setFacturasInflightLoad(state, promise);

  return promise;
}

/* =========================================================
   DETAIL
========================================================= */

export async function loadFacturaDetailById({
  state,
  render,
  facturaId = "",
  force = true,
} = {}) {
  ensureStateShape(state);

  const id = safeText(facturaId, "");

  if (!id) {
    return null;
  }

  const currentDetail = getFacturasDetailData(state);
  const currentDetailIds = getFacturaIdentityList(currentDetail);

  if (
    !force &&
    currentDetail &&
    currentDetailIds.some((candidate) => sameIdentity(candidate, id))
  ) {
    setFacturasDetailOpen(state, true);
    setFacturasDetailLoading(state, false);
    safeRender(render);
    return currentDetail;
  }

  const inflight = getFacturasInflightDetail(state);
  const inflightId = safeText(state?.inflight?.detailFacturaId, "");

  if (inflight && sameIdentity(inflightId, id)) {
    return inflight;
  }

  const token = detailLoadToken + 1;
  detailLoadToken = token;

  state.inflight.detailToken = token;
  state.inflight.detailFacturaId = id;

  const storeFallback = findStoreFacturaById(id);

  setFacturasDetailOpen(state, true);
  setFacturasDetailLoading(state, true);

  if (storeFallback) {
    setFacturasDetailData(state, storeFallback);
  }

  safeRender(render);

  const promise = (async () => {
    try {
      safeEmit("facturas:detail:load:request", {
        facturaId: id,
        token,
        hasStoreFallback: Boolean(storeFallback),
      });

      const response = await fetchFacturaDetailRequest(id);
      const remoteFactura = normalizeDetailResponse(response);

      if (!remoteFactura) {
        throw new Error("FACTURA_DETAIL_EMPTY");
      }

      const factura = mergeDetailWithStore(remoteFactura, id);

      if (!factura) {
        throw new Error("FACTURA_DETAIL_EMPTY_AFTER_MERGE");
      }

      if (!isCurrentDetailToken(state, token, id)) {
        safeLog("Ignorando detalle obsoleto:", {
          facturaId: id,
          token,
          currentToken: state.inflight.detailToken,
          currentFacturaId: state.inflight.detailFacturaId,
        });

        return factura;
      }

      setFacturasDetailData(state, factura);
      setFacturasDetailOpen(state, true);
      setFacturasDetailLoading(state, false);

      safeEmit("facturas:detail:load:success", {
        facturaId: id,
        detail: factura,
        response,
        token,
      });

      safeRender(render);

      return factura;
    } catch (error) {
      if (isCurrentDetailToken(state, token, id)) {
        setFacturasDetailLoading(state, false);

        if (storeFallback) {
          setFacturasDetailData(state, storeFallback);
          setFacturasDetailOpen(state, true);

          safeEmit("facturas:detail:load:fallback", {
            facturaId: id,
            detail: storeFallback,
            error,
            token,
          });

          safeRender(render);

          return storeFallback;
        }

        if (!getFacturasDetailData(state)) {
          setFacturasDetailOpen(state, false);
        }

        safeEmit("facturas:detail:load:error", {
          facturaId: id,
          error,
          message: safeErrorMessage(
            error,
            "No se pudo cargar el detalle de la factura."
          ),
          token,
        });

        safeRender(render);
      }

      throw error;
    } finally {
      if (isCurrentDetailToken(state, token, id)) {
        setFacturasInflightDetail(state, null);
        state.inflight.detailToken = 0;
        state.inflight.detailFacturaId = "";
      }
    }
  })();

  setFacturasInflightDetail(state, promise);

  return promise;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  loadFacturasCollection,
  loadFacturaDetailById,
};
