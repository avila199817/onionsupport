/* =========================================================
   Onion SPA - Facturas Store
   Archivo: src/views/facturas/facturas.store.js

   RESPONSABILIDADES:
   - centralizar el acceso al Store del módulo de facturas
   - leer y escribir la colección normalizada
   - exponer helpers de consulta por id y ordenación
   - aislar la vista del shape interno del Store
   - mantener paridad operativa con facturasView / facturas.model
   - preservar relación factura ↔ incidencia para columna Incidencia

   HARDENING PRO:
   - lectura tolerante a múltiples shapes del Store
   - escritura consistente por path y colección
   - sort robusto sin mutar origen
   - upsert por id / _id / facturaId
   - deduplicación defensiva al append
   - compat con colección normalizada actual
   - no pierde ticketId / incidenciaId / incidencia / ticket / linkedTicket
========================================================= */

import { Store } from "../../store/index.js";

import {
  safeArray,
  safeText,
  safeNumber,
} from "./facturas.utils.js";

import {
  normalizeFactura,
  sortFacturas,
  DEFAULT_FACTURAS_SORT,
} from "./facturas.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

const FACTURAS_STORE_PATH = "entities.facturas";
const FACTURAS_COLLECTION_NAME = "facturas";

/* =========================================================
   SAFE STORE ACCESS
========================================================= */

function safeGet(path, fallback = []) {
  try {
    if (typeof Store?.get === "function") {
      return Store.get(path) ?? fallback;
    }
  } catch {}

  return fallback;
}

function safeSet(path, value) {
  try {
    if (typeof Store?.set === "function") {
      Store.set(path, value);
      return true;
    }
  } catch {}

  return false;
}

function safeSetCollection(name, value) {
  try {
    if (typeof Store?.actions?.setCollection === "function") {
      Store.actions.setCollection(name, value);
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   HELPERS
========================================================= */

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

function getFacturaStoreId(item = {}) {
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

function getFacturaStoreNumber(item = {}) {
  const source = safeObject(item);
  const raw = safeObject(source.raw);

  return safeText(
    first(
      source.numero,
      source.code,
      source.facturaNumero,
      source.facturaCode,
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,

      raw.numero,
      raw.code,
      raw.facturaNumero,
      raw.facturaCode,
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

  const mergedProbe = {
    ...source,
    ...base,
    raw,
  };

  const incidenciaId = getRelatedIncidenciaId(mergedProbe);
  const incidenciaPayload = buildIncidenciaPayload(mergedProbe);

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
    ticket: safeObject(first(base.ticket, source.ticket, raw.ticket, incidenciaPayload)),
    linkedTicket: safeObject(first(base.linkedTicket, source.linkedTicket, raw.linkedTicket, incidenciaPayload)),

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

function mergeFacturaPreservingLinks(current = {}, incoming = {}) {
  const currentSafe = safeObject(current);
  const incomingSafe = safeObject(incoming);

  const merged = {
    ...currentSafe,
    ...incomingSafe,

    raw: {
      ...safeObject(currentSafe.raw),
      ...safeObject(incomingSafe.raw),
    },

    meta: {
      ...safeObject(currentSafe.meta),
      ...safeObject(incomingSafe.meta),
    },
  };

  return preserveIncidenciaFields(merged, {
    ...currentSafe,
    ...incomingSafe,
    raw: merged.raw,
  });
}

/* =========================================================
   COLLECTION NORMALIZATION
========================================================= */

function normalizeFacturaCollection(items = []) {
  return safeArray(items)
    .map((item) => normalizeFacturaPreservingLinks(item))
    .filter((item) => Boolean(getFacturaStoreId(item)));
}

function dedupeFacturas(items = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const normalized = normalizeFacturaPreservingLinks(item);
    const id = getFacturaStoreId(normalized);

    if (!id) {
      continue;
    }

    const current = map.get(id) || {};

    map.set(
      id,
      mergeFacturaPreservingLinks(current, normalized)
    );
  }

  return Array.from(map.values());
}

function resolveStoreCollectionShape(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const obj = safeObject(value);

  if (Array.isArray(obj.items)) {
    return obj.items;
  }

  if (Array.isArray(obj.facturas)) {
    return obj.facturas;
  }

  if (Array.isArray(obj.data)) {
    return obj.data;
  }

  if (Array.isArray(obj.results)) {
    return obj.results;
  }

  if (Array.isArray(obj.rows)) {
    return obj.rows;
  }

  return [];
}

function readRawFacturasStore() {
  const byPath = safeGet(FACTURAS_STORE_PATH, null);
  const byCollection = safeGet(FACTURAS_COLLECTION_NAME, null);

  const fromPath = resolveStoreCollectionShape(byPath);
  const fromCollection = resolveStoreCollectionShape(byCollection);

  if (fromPath.length) {
    return fromPath;
  }

  if (fromCollection.length) {
    return fromCollection;
  }

  return [];
}

function persistFacturasStore(items = []) {
  const normalized = dedupeFacturas(items);

  const collectionWritten = safeSetCollection(
    FACTURAS_COLLECTION_NAME,
    normalized
  );

  const pathWritten = safeSet(
    FACTURAS_STORE_PATH,
    normalized
  );

  return Boolean(collectionWritten || pathWritten);
}

function compareText(a, b) {
  return safeText(a, "").localeCompare(
    safeText(b, ""),
    "es"
  );
}

function compareNumber(a, b) {
  return safeNumber(a, 0) - safeNumber(b, 0);
}

function compareDate(a, b) {
  const left = new Date(a || 0).getTime();
  const right = new Date(b || 0).getTime();

  return safeNumber(left, 0) - safeNumber(right, 0);
}

/* =========================================================
   READ
========================================================= */

export function getFacturasStore() {
  const raw = readRawFacturasStore();
  return normalizeFacturaCollection(raw);
}

export function getSortedFacturasStore({
  sortBy = DEFAULT_FACTURAS_SORT.field,
  direction = DEFAULT_FACTURAS_SORT.direction,
} = {}) {
  const items = getFacturasStore();

  if (
    sortBy === DEFAULT_FACTURAS_SORT.field ||
    sortBy === "updatedAt" ||
    sortBy === "fecha" ||
    sortBy === "cliente" ||
    sortBy === "numero" ||
    sortBy === "total"
  ) {
    return sortFacturas(items, {
      field: sortBy,
      direction,
    });
  }

  const factor = direction === "asc" ? 1 : -1;
  const list = [...items];

  list.sort((a, b) => {
    if (sortBy === "timestampMs") {
      return compareNumber(
        a?.meta?.timestampMs,
        b?.meta?.timestampMs
      ) * factor;
    }

    if (sortBy === "fechaMs") {
      return compareNumber(
        a?.meta?.fechaMs,
        b?.meta?.fechaMs
      ) * factor;
    }

    if (sortBy === "updatedAtMs") {
      return compareNumber(
        a?.meta?.updatedAtMs,
        b?.meta?.updatedAtMs
      ) * factor;
    }

    if (sortBy === "fecha") {
      return compareDate(a?.fecha, b?.fecha) * factor;
    }

    if (sortBy === "updatedAt") {
      return compareDate(a?.updatedAt, b?.updatedAt) * factor;
    }

    if (sortBy === "total") {
      return compareNumber(a?.total, b?.total) * factor;
    }

    return compareText(a?.[sortBy], b?.[sortBy]) * factor;
  });

  return list;
}

export function getFacturaByIdStore(id = "") {
  const facturaId = safeText(id, "");

  if (!facturaId) {
    return null;
  }

  return (
    getFacturasStore().find((item) => {
      return (
        getFacturaStoreId(item) === facturaId ||
        getFacturaStoreNumber(item) === facturaId
      );
    }) || null
  );
}

export function hasFacturasStore() {
  return getFacturasStore().length > 0;
}

export function countFacturasStore() {
  return getFacturasStore().length;
}

/* =========================================================
   WRITE
========================================================= */

export function setFacturasStore(items = []) {
  return persistFacturasStore(items);
}

export function appendFacturasStore(items = []) {
  const merged = dedupeFacturas([
    ...getFacturasStore(),
    ...safeArray(items),
  ]);

  return persistFacturasStore(merged);
}

export function upsertFacturaStore(factura = null) {
  const normalized = normalizeFacturaPreservingLinks(factura);
  const facturaId = getFacturaStoreId(normalized);

  if (!facturaId) {
    return false;
  }

  const current = [...getFacturasStore()];
  const index = current.findIndex(
    (item) => getFacturaStoreId(item) === facturaId
  );

  if (index === -1) {
    current.unshift(normalized);
  } else {
    current[index] = mergeFacturaPreservingLinks(
      current[index],
      normalized
    );
  }

  return persistFacturasStore(current);
}

export function removeFacturaByIdStore(id = "") {
  const facturaId = safeText(id, "");

  if (!facturaId) {
    return false;
  }

  const filtered = getFacturasStore().filter((item) => {
    return (
      getFacturaStoreId(item) !== facturaId &&
      getFacturaStoreNumber(item) !== facturaId
    );
  });

  return persistFacturasStore(filtered);
}

export function clearFacturasStore() {
  return persistFacturasStore([]);
}

/* =========================================================
   DEBUG HELPERS
========================================================= */

export function debugFacturasIncidenciasStore() {
  return getFacturasStore().map((item) => ({
    id: getFacturaStoreId(item),
    numero: getFacturaStoreNumber(item),
    ticketId: item.ticketId || null,
    incidenciaId: item.incidenciaId || null,
    rawTicketId: item.raw?.ticketId || null,
    rawIncidenciaId: item.raw?.incidenciaId || null,
    hasIncidencia: Boolean(item.meta?.hasIncidencia),
  }));
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getFacturasStore,
  getSortedFacturasStore,
  getFacturaByIdStore,
  hasFacturasStore,
  countFacturasStore,

  setFacturasStore,
  appendFacturasStore,
  upsertFacturaStore,
  removeFacturaByIdStore,
  clearFacturasStore,

  debugFacturasIncidenciasStore,
};
