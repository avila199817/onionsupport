/* =========================================================
   Onion SPA - Facturas Loaders
   Archivo: src/views/facturas/facturas.loaders.js

   FINAL PRO SYSTEM · LOADERS REAL · 10/10
   PATCH · FACTURAS ARRAY + INCIDENCIA PRESERVER

   RESPONSABILIDADES:
   - cargar colección de facturas desde backend
   - cargar detalle individual de factura
   - sincronizar Store y estado local del módulo
   - controlar flags de loading / refresh / error / inflight
   - mantener paridad de flujo con incidenciasView
   - evitar estados colgados en render / inflight
   - preservar relación factura ↔ incidencia para columna Incidencia

   HARDENING PRO:
   - anti-race básico por inflight
   - loading inicial vs refreshing posterior
   - lastSyncAt coherente
   - remoteCount robusto
   - detalle con apertura previa segura
   - error de detalle no rompe el estado principal
   - no ensucia error global con fallos de detalle
   - compatible con API normalizada:
     { items, total }
     { facturas, total }
     { data: { items/facturas } }
     { result: { items/facturas } }
     { payload: { items/facturas } }
     { item/factura }
========================================================= */

import {
  normalizeFactura,
} from "./facturas.model.js";

import {
  fetchFacturasRequest,
  fetchFacturaDetailRequest,
} from "./facturas.api.js";

import { setFacturasStore } from "./facturas.store.js";

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
   HELPERS
========================================================= */

function safeRender(render) {
  try {
    render?.();
  } catch {}
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

function safeErrorMessage(error = null, fallback = "") {
  return safeText(
    error?.data?.message ||
      error?.response?.data?.message ||
      error?.response?.message ||
      error?.message,
    fallback
  );
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

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema
    ),
    ""
  );
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
      item.caseId
    );

    if (candidate) {
      return candidate;
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
      pickTicketIdFromArray(raw.relations)
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

  const incidenciaId = getRelatedIncidenciaId(source);

  if (!incidenciaId) {
    return null;
  }

  return {
    ...incidencia,

    id: incidenciaId,
    ticketId: incidenciaId,
    incidenciaId,

    subject: safeText(
      first(
        incidencia.subject,
        incidencia.asunto,
        ticket.subject,
        ticket.asunto,
        linkedTicket.subject,
        linkedTicket.asunto,
        source.subject,
        source.asunto,
        raw.subject,
        raw.asunto,
        ""
      ),
      ""
    ),

    asunto: safeText(
      first(
        incidencia.asunto,
        incidencia.subject,
        ticket.asunto,
        ticket.subject,
        linkedTicket.asunto,
        linkedTicket.subject,
        source.asunto,
        source.subject,
        raw.asunto,
        raw.subject,
        ""
      ),
      ""
    ),

    clienteId: safeText(
      first(
        incidencia.clienteId,
        ticket.clienteId,
        linkedTicket.clienteId,
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
        linkedTicket.clienteNombre,
        source.cliente?.nombre,
        source.cliente?.name,
        raw.cliente?.nombre,
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
        source.linkedAt,
        raw.linkedAt,
        ""
      ),
      ""
    ),

    linkedAtES: safeText(
      first(
        incidencia.linkedAtES,
        ticket.linkedAtES,
        linkedTicket.linkedAtES,
        source.linkedAtES,
        raw.linkedAtES,
        ""
      ),
      ""
    ),
  };
}

function preserveIncidenciaFields(normalized = {}, original = {}) {
  const base = safeObject(normalized);
  const source = safeObject(original);

  const embeddedRaw = safeObject(base.raw);
  const sourceRaw = safeObject(source.raw);

  const raw = hasOwnKeys(embeddedRaw)
    ? embeddedRaw
    : hasOwnKeys(sourceRaw)
      ? sourceRaw
      : source;

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
    };
  }

  return {
    ...base,

    raw,

    ticketId: incidenciaId,
    incidenciaId,

    relatedTicketId: safeText(
      first(
        base.relatedTicketId,
        source.relatedTicketId,
        raw.relatedTicketId,
        incidenciaId
      ),
      incidenciaId
    ),

    relatedIncidentId: safeText(
      first(
        base.relatedIncidentId,
        source.relatedIncidentId,
        raw.relatedIncidentId,
        incidenciaId
      ),
      incidenciaId
    ),

    supportTicketId: safeText(
      first(
        base.supportTicketId,
        source.supportTicketId,
        raw.supportTicketId,
        incidenciaId
      ),
      incidenciaId
    ),

    caseId: safeText(
      first(
        base.caseId,
        source.caseId,
        raw.caseId,
        incidenciaId
      ),
      incidenciaId
    ),

    incidencia: incidenciaPayload,
    ticket: safeObject(
      first(
        base.ticket,
        source.ticket,
        raw.ticket,
        incidenciaPayload
      )
    ),

    linkedTicket: safeObject(
      first(
        base.linkedTicket,
        source.linkedTicket,
        raw.linkedTicket,
        incidenciaPayload
      )
    ),

    relationType: safeText(
      first(
        base.relationType,
        source.relationType,
        raw.relationType,
        incidenciaPayload?.relationType,
        "linked_ticket"
      ),
      "linked_ticket"
    ),

    meta: {
      ...safeObject(base.meta),
      hasIncidencia: true,
      incidenciaId,
      ticketId: incidenciaId,
    },
  };
}

function normalizeFacturaPreservingLinks(item = {}) {
  const original = safeObject(item);

  let normalized = {};

  try {
    normalized = normalizeFactura(original);
  } catch {
    normalized = original;
  }

  return preserveIncidenciaFields(normalized, original);
}

/* =========================================================
   RESPONSE NORMALIZERS
========================================================= */

function pickCollectionItems(response = null) {
  const obj = safeObject(response);

  return safeArray(
    first(
      obj.items,
      obj.facturas,
      obj.rows,
      obj.results,
      obj.data,

      obj.data?.items,
      obj.data?.facturas,
      obj.data?.rows,
      obj.data?.results,

      obj.result?.items,
      obj.result?.facturas,
      obj.result?.rows,
      obj.result?.results,

      obj.payload?.items,
      obj.payload?.facturas,
      obj.payload?.rows,
      obj.payload?.results,

      []
    )
  );
}

function pickCollectionTotal(response = null, fallback = 0) {
  const obj = safeObject(response);

  return safeNumber(
    first(
      obj.total,
      obj.count,
      obj.remoteCount,
      obj.totalCount,

      obj.data?.total,
      obj.data?.count,
      obj.data?.remoteCount,
      obj.data?.totalCount,

      obj.result?.total,
      obj.result?.count,
      obj.result?.remoteCount,
      obj.result?.totalCount,

      obj.payload?.total,
      obj.payload?.count,
      obj.payload?.remoteCount,
      obj.payload?.totalCount
    ),
    fallback
  );
}

function normalizeCollectionResponse(response = null) {
  const rawItems = pickCollectionItems(response);

  const items = rawItems.map((item) =>
    normalizeFacturaPreservingLinks(item)
  );

  const total = pickCollectionTotal(response, items.length);

  return {
    items,
    total,
    rawItems,
    raw: response,
  };
}

function pickDetailPayload(response = null) {
  const obj = safeObject(response);

  return first(
    obj.item,
    obj.factura,

    obj.data?.item,
    obj.data?.factura,

    obj.result?.item,
    obj.result?.factura,

    obj.payload?.item,
    obj.payload?.factura,

    obj.data,
    obj.result,
    obj.payload,

    null
  );
}

function normalizeDetailResponse(response = null) {
  const payload = pickDetailPayload(response);

  return payload
    ? normalizeFacturaPreservingLinks(payload)
    : null;
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
  if (!state) {
    throw new Error("FACTURAS_STATE_REQUIRED");
  }

  const inflight = getFacturasInflightLoad(state);

  if (inflight) {
    return inflight;
  }

  const shouldRefresh =
    Boolean(silent || isFacturasLoaded(state) || force);

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
      const response = await fetchFacturasRequest({
        ...safeObject(query),
      });

      const { items, total } =
        normalizeCollectionResponse(response);

      setFacturasStore(items);
      setFacturasRemoteCount(state, total);

      setFacturasLoading(state, false);
      setFacturasRefreshing(state, false);
      setFacturasLoaded(state, true);
      setFacturasLastSyncAt(state, new Date().toISOString());
      clearFacturasError(state);

      safeRender(render);

      return items;
    } catch (error) {
      setFacturasLoading(state, false);
      setFacturasRefreshing(state, false);
      setFacturasLoaded(state, true);

      setFacturasError(
        state,
        safeErrorMessage(
          error,
          "No se pudieron cargar las facturas."
        )
      );

      safeRender(render);
      throw error;
    } finally {
      setFacturasInflightLoad(state, null);
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
  if (!state) {
    throw new Error("FACTURAS_STATE_REQUIRED");
  }

  const id = safeText(facturaId, "");

  if (!id) {
    return null;
  }

  const currentDetail = getFacturasDetailData(state);
  const currentDetailId = getFacturaIdentity(currentDetail);

  if (!force && currentDetail && currentDetailId === id) {
    setFacturasDetailOpen(state, true);
    setFacturasDetailLoading(state, false);
    safeRender(render);
    return currentDetail;
  }

  const inflight = getFacturasInflightDetail(state);

  if (inflight) {
    return inflight;
  }

  setFacturasDetailOpen(state, true);
  setFacturasDetailLoading(state, true);

  safeRender(render);

  const promise = (async () => {
    try {
      const response = await fetchFacturaDetailRequest(id);
      const factura = normalizeDetailResponse(response);

      if (!factura) {
        throw new Error("FACTURA_DETAIL_EMPTY");
      }

      setFacturasDetailData(state, factura);
      setFacturasDetailOpen(state, true);
      setFacturasDetailLoading(state, false);

      safeRender(render);

      return factura;
    } catch (error) {
      setFacturasDetailLoading(state, false);

      if (!getFacturasDetailData(state)) {
        setFacturasDetailOpen(state, false);
      }

      safeRender(render);
      throw error;
    } finally {
      setFacturasInflightDetail(state, null);
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
