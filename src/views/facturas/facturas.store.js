/* =========================================================
   Onion SPA - Facturas Store
   Archivo: src/views/facturas/facturas.store.js

   FINAL PRO SYSTEM · STORE REAL · 10/10 EXTREME
   PATCH · ID RESOLUTION HARDENED · INCIDENCIA PRESERVER
   PATCH · STORE MULTISHAPE COMPAT · SORT SAFE · UPSERT SAFE

   RESPONSABILIDADES:
   - centralizar el acceso al Store del módulo de facturas
   - leer y escribir la colección normalizada
   - exponer helpers de consulta por id y ordenación
   - aislar la vista del shape interno del Store
   - mantener paridad operativa con facturasView / facturas.model
   - preservar relación factura ↔ incidencia para columna Incidencia
   - permitir lookup por id, _id, facturaId, invoiceId, numero y códigos legales
   - evitar duplicados cuando el backend cambia de id visible

   HARDENING PRO:
   - lectura tolerante a múltiples shapes del Store
   - escritura consistente por path y colección
   - sort robusto sin mutar origen
   - upsert por identidad flexible
   - deduplicación defensiva al append/set
   - compat con colección normalizada actual
   - no pierde ticketId / incidenciaId / incidencia / ticket / linkedTicket
   - no pierde raw.meta ni meta.hasIncidencia
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

const STORE_READ_PATHS = Object.freeze([
  FACTURAS_STORE_PATH,
  FACTURAS_COLLECTION_NAME,
  "collections.facturas",
  "data.facturas",
  "facturas",
]);

const STORE_WRITE_PATHS = Object.freeze([
  FACTURAS_STORE_PATH,
  "collections.facturas",
]);

const FALLBACK_SORT = Object.freeze({
  field: "updatedAt",
  direction: "desc",
});

/* =========================================================
   SAFE STORE ACCESS
========================================================= */

function safeGet(path, fallback = null) {
  try {
    if (typeof Store?.get === "function") {
      const value = Store.get(path);
      return value === undefined || value === null ? fallback : value;
    }
  } catch {}

  try {
    const parts = String(path || "")
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);

    let cursor = Store?.state || Store?.data || Store;

    for (const part of parts) {
      if (!cursor || typeof cursor !== "object") {
        return fallback;
      }

      cursor = cursor[part];
    }

    return cursor === undefined || cursor === null ? fallback : cursor;
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

  try {
    const parts = String(path || "")
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);

    if (!parts.length) return false;

    const root = Store?.state || Store?.data || Store;

    if (!root || typeof root !== "object") {
      return false;
    }

    let cursor = root;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];

      if (!cursor[part] || typeof cursor[part] !== "object") {
        cursor[part] = {};
      }

      cursor = cursor[part];
    }

    cursor[parts[parts.length - 1]] = value;

    return true;
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

  try {
    if (typeof Store?.setCollection === "function") {
      Store.setCollection(name, value);
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   BASE HELPERS
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

function uniqueList(values = []) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const text = safeText(value, "");
    const key = normalizeText(text);

    if (!text || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(text);
  }

  return out;
}

function compareText(a, b) {
  return safeText(a, "").localeCompare(
    safeText(b, ""),
    "es",
    {
      sensitivity: "base",
      numeric: true,
    }
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
   FACTURA ID HELPERS
========================================================= */

function getFacturaRaw(item = {}) {
  return safeObject(item?.raw);
}

function getFacturaIdentityList(item = {}) {
  const source = safeObject(item);
  const raw = getFacturaRaw(source);

  return uniqueList([
    source.id,
    source._id,
    source.facturaId,
    source.invoiceId,
    source.numero,
    source.code,
    source.invoiceNumber,
    source.facturaNumero,
    source.facturaCode,
    source.numeroFactura,
    source.numeroFacturaLegal,
    source.numeroFacturaSistema,

    raw.id,
    raw._id,
    raw.facturaId,
    raw.invoiceId,
    raw.numero,
    raw.code,
    raw.invoiceNumber,
    raw.facturaNumero,
    raw.facturaCode,
    raw.numeroFactura,
    raw.numeroFacturaLegal,
    raw.numeroFacturaSistema,

    source.data?.id,
    source.data?.facturaId,
    source.data?.invoiceId,
    source.data?.numero,

    source.payload?.id,
    source.payload?.facturaId,
    source.payload?.invoiceId,
    source.payload?.numero,

    source.result?.id,
    source.result?.facturaId,
    source.result?.invoiceId,
    source.result?.numero,
  ]);
}

function getFacturaStoreId(item = {}) {
  return safeText(
    first(...getFacturaIdentityList(item)),
    ""
  );
}

function getFacturaStoreNumber(item = {}) {
  const source = safeObject(item);
  const raw = getFacturaRaw(source);

  return safeText(
    first(
      source.numero,
      source.code,
      source.invoiceNumber,
      source.facturaNumero,
      source.facturaCode,
      source.numeroFactura,
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,

      raw.numero,
      raw.code,
      raw.invoiceNumber,
      raw.facturaNumero,
      raw.facturaCode,
      raw.numeroFactura,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema
    ),
    ""
  );
}

function facturaMatchesId(item = {}, id = "") {
  const target = safeText(id, "");

  if (!target) return false;

  return getFacturaIdentityList(item).some((candidate) =>
    sameIdentity(candidate, target)
  );
}

function getFacturaDedupeKey(item = {}) {
  const identities = getFacturaIdentityList(item);

  const preferred = first(
    item?.id,
    item?._id,
    item?.facturaId,
    item?.invoiceId,
    item?.raw?.id,
    item?.raw?._id,
    item?.raw?.facturaId,
    item?.raw?.invoiceId,
    identities[0]
  );

  return normalizeText(preferred);
}

/* =========================================================
   INCIDENCIA / TICKET HELPERS
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
      item.linkedTicket?.id
    );

    if (candidate) {
      return safeText(candidate, "");
    }
  }

  return null;
}

function getRelatedIncidenciaId(item = {}) {
  const source = safeObject(item);
  const raw = getFacturaRaw(source);

  const incidencia = safeObject(first(source.incidencia, raw.incidencia));
  const ticket = safeObject(first(source.ticket, raw.ticket));
  const linkedTicket = safeObject(first(source.linkedTicket, raw.linkedTicket));
  const relatedTicket = safeObject(first(source.relatedTicket, raw.relatedTicket));
  const relatedIncident = safeObject(first(source.relatedIncident, raw.relatedIncident));

  const relationTicket = safeObject(first(source.relations?.ticket, raw.relations?.ticket));
  const relationIncidencia = safeObject(first(source.relations?.incidencia, raw.relations?.incidencia));

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

      relatedIncident.ticketId,
      relatedIncident.id,
      relatedIncident.incidenciaId,

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

      raw.relatedIncident?.ticketId,
      raw.relatedIncident?.id,
      raw.relatedIncident?.incidenciaId,

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
  const raw = getFacturaRaw(source);

  const incidencia = safeObject(first(source.incidencia, raw.incidencia));
  const ticket = safeObject(first(source.ticket, raw.ticket));
  const linkedTicket = safeObject(first(source.linkedTicket, raw.linkedTicket));
  const relatedTicket = safeObject(first(source.relatedTicket, raw.relatedTicket));

  const relationTicket = safeObject(first(source.relations?.ticket, raw.relations?.ticket));

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

    code: safeText(
      first(
        incidencia.code,
        ticket.code,
        linkedTicket.code,
        relatedTicket.code,
        relationTicket.code,
        incidenciaId
      ),
      incidenciaId
    ),

    ticketCode: safeText(
      first(
        incidencia.ticketCode,
        ticket.ticketCode,
        linkedTicket.ticketCode,
        relatedTicket.ticketCode,
        relationTicket.ticketCode,
        incidenciaId
      ),
      incidenciaId
    ),

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
        source.clientId,
        source.client?.id,

        raw.clienteId,
        raw.cliente?.id,
        raw.clientId,
        raw.client?.id,
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
        source.clientName,
        source.client?.name,

        raw.clienteNombre,
        raw.cliente?.nombre,
        raw.cliente?.nombreContacto,
        raw.cliente?.name,
        raw.clientName,
        raw.client?.name,
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

  const baseRaw = getFacturaRaw(base);
  const sourceRaw = getFacturaRaw(source);

  const raw = {
    ...(hasOwnKeys(sourceRaw) ? sourceRaw : source),
    ...(hasOwnKeys(baseRaw) ? baseRaw : {}),
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
            raw.meta?.hasIncidencia,
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
      ...safeObject(nextRaw.meta),
      hasIncidencia: true,
      incidenciaId,
      ticketId: incidenciaId,
    },

    raw: nextRaw,
  };
}

/* =========================================================
   FACTURA NORMALIZATION
========================================================= */

function normalizeFacturaPreservingLinks(item = {}) {
  const original = safeObject(item);

  let normalized = original;

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

  const mergedRaw = {
    ...getFacturaRaw(currentSafe),
    ...getFacturaRaw(incomingSafe),
  };

  const merged = {
    ...currentSafe,
    ...incomingSafe,

    raw: mergedRaw,

    meta: {
      ...safeObject(currentSafe.meta),
      ...safeObject(incomingSafe.meta),
    },
  };

  return preserveIncidenciaFields(merged, {
    ...currentSafe,
    ...incomingSafe,
    raw: mergedRaw,
  });
}

function normalizeFacturaCollection(items = []) {
  return safeArray(items)
    .map((item) => normalizeFacturaPreservingLinks(item))
    .filter((item) => Boolean(getFacturaStoreId(item)));
}

function findMatchingMapKey(map = new Map(), item = {}) {
  const identities = getFacturaIdentityList(item);

  for (const [key, existing] of map.entries()) {
    if (
      identities.some((identity) =>
        getFacturaIdentityList(existing).some((candidate) =>
          sameIdentity(identity, candidate)
        )
      )
    ) {
      return key;
    }
  }

  return "";
}

function dedupeFacturas(items = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const normalized = normalizeFacturaPreservingLinks(item);
    const primaryKey = getFacturaDedupeKey(normalized);

    if (!primaryKey) {
      continue;
    }

    const matchingKey = findMatchingMapKey(map, normalized);
    const finalKey = matchingKey || primaryKey;
    const current = map.get(finalKey) || {};

    map.set(
      finalKey,
      mergeFacturaPreservingLinks(current, normalized)
    );
  }

  return Array.from(map.values());
}

/* =========================================================
   STORE COLLECTION SHAPE
========================================================= */

function resolveStoreCollectionShape(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const obj = safeObject(value);

  return safeArray(
    first(
      obj.items,
      obj.facturas,
      obj.data,
      obj.results,
      obj.rows,
      obj.records,
      obj.collection,

      obj.data?.items,
      obj.data?.facturas,
      obj.data?.results,
      obj.data?.rows,

      obj.result?.items,
      obj.result?.facturas,
      obj.result?.results,
      obj.result?.rows,

      obj.payload?.items,
      obj.payload?.facturas,
      obj.payload?.results,
      obj.payload?.rows,

      []
    )
  );
}

function readRawFacturasStore() {
  for (const path of STORE_READ_PATHS) {
    const value = safeGet(path, null);
    const collection = resolveStoreCollectionShape(value);

    if (collection.length) {
      return collection;
    }
  }

  return [];
}

function persistFacturasStore(items = []) {
  const normalized = dedupeFacturas(items);

  let written = false;

  if (safeSetCollection(FACTURAS_COLLECTION_NAME, normalized)) {
    written = true;
  }

  for (const path of STORE_WRITE_PATHS) {
    if (safeSet(path, normalized)) {
      written = true;
    }
  }

  return written;
}

/* =========================================================
   READ
========================================================= */

export function getFacturasStore() {
  const raw = readRawFacturasStore();
  return normalizeFacturaCollection(raw);
}

export function getSortedFacturasStore({
  sortBy = DEFAULT_FACTURAS_SORT?.field || FALLBACK_SORT.field,
  direction = DEFAULT_FACTURAS_SORT?.direction || FALLBACK_SORT.direction,
} = {}) {
  const items = getFacturasStore();
  const field = safeText(sortBy, FALLBACK_SORT.field);
  const dir = safeText(direction, FALLBACK_SORT.direction).toLowerCase() === "asc"
    ? "asc"
    : "desc";

  try {
    if (typeof sortFacturas === "function") {
      return sortFacturas([...items], {
        field,
        direction: dir,
      });
    }
  } catch {}

  const factor = dir === "asc" ? 1 : -1;
  const list = [...items];

  list.sort((a, b) => {
    if (field === "timestampMs") {
      return compareNumber(a?.meta?.timestampMs, b?.meta?.timestampMs) * factor;
    }

    if (field === "fechaMs") {
      return compareNumber(a?.meta?.fechaMs, b?.meta?.fechaMs) * factor;
    }

    if (field === "updatedAtMs") {
      return compareNumber(a?.meta?.updatedAtMs, b?.meta?.updatedAtMs) * factor;
    }

    if (field === "fecha" || field === "createdAt" || field === "updatedAt") {
      return compareDate(a?.[field], b?.[field]) * factor;
    }

    if (field === "total" || field === "importe" || field === "amount") {
      return compareNumber(a?.[field], b?.[field]) * factor;
    }

    if (field === "cliente") {
      return compareText(
        first(a?.cliente?.nombre, a?.cliente?.nombreContacto, a?.clienteNombre, a?.clientName),
        first(b?.cliente?.nombre, b?.cliente?.nombreContacto, b?.clienteNombre, b?.clientName)
      ) * factor;
    }

    if (field === "numero") {
      return compareText(getFacturaStoreNumber(a), getFacturaStoreNumber(b)) * factor;
    }

    return compareText(a?.[field], b?.[field]) * factor;
  });

  return list;
}

export function getFacturaByIdStore(id = "") {
  const facturaId = safeText(id, "");

  if (!facturaId) {
    return null;
  }

  return (
    getFacturasStore().find((item) =>
      facturaMatchesId(item, facturaId)
    ) || null
  );
}

export function getFacturaByIncidenciaIdStore(id = "") {
  const incidenciaId = safeText(id, "");

  if (!incidenciaId) {
    return null;
  }

  return (
    getFacturasStore().find((item) =>
      sameIdentity(getRelatedIncidenciaId(item), incidenciaId)
    ) || null
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
  const index = current.findIndex((item) =>
    getFacturaIdentityList(normalized).some((identity) =>
      facturaMatchesId(item, identity)
    )
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

  const filtered = getFacturasStore().filter((item) =>
    !facturaMatchesId(item, facturaId)
  );

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

    identities: getFacturaIdentityList(item),

    ticketId: item.ticketId || null,
    incidenciaId: item.incidenciaId || null,
    relatedTicketId: item.relatedTicketId || null,
    relatedIncidentId: item.relatedIncidentId || null,

    rawTicketId: item.raw?.ticketId || null,
    rawIncidenciaId: item.raw?.incidenciaId || null,
    rawRelatedTicketId: item.raw?.relatedTicketId || null,
    rawRelatedIncidentId: item.raw?.relatedIncidentId || null,

    hasIncidencia: Boolean(item.meta?.hasIncidencia),
    metaTicketId: item.meta?.ticketId || null,
    metaIncidenciaId: item.meta?.incidenciaId || null,

    incidenciaSubject: safeText(
      first(
        item.incidencia?.subject,
        item.incidencia?.asunto,
        item.ticket?.subject,
        item.ticket?.asunto
      ),
      ""
    ),
  }));
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getFacturasStore,
  getSortedFacturasStore,
  getFacturaByIdStore,
  getFacturaByIncidenciaIdStore,
  hasFacturasStore,
  countFacturasStore,

  setFacturasStore,
  appendFacturasStore,
  upsertFacturaStore,
  removeFacturaByIdStore,
  clearFacturasStore,

  debugFacturasIncidenciasStore,
};
