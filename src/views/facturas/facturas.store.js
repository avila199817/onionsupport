/* =========================================================
   Onion SPA - Facturas Store
   Archivo: src/views/facturas/facturas.store.js

   FINAL PRO SYSTEM · FACTURAS STORE · 10/10 EXTREME
   PATCH · STORE MULTISHAPE · ID SAFE · UPSERT SAFE
   PATCH · NO TICKET ID AS FACTURA ID · INCIDENCIA PRESERVER VIA MODEL
   PATCH · DEDUPE POR IDENTIDADES · SORT SAFE · STORE COMPAT

   RESPONSABILIDADES:
   - centralizar acceso al Store de facturas
   - leer/escribir colección normalizada
   - tolerar múltiples shapes internos del Store
   - lookup por id/_id/facturaId/invoiceId/número legal/sistema/código
   - deduplicar facturas aunque cambie el id visible del backend
   - preservar relación factura ↔ incidencia delegando en facturas.model.js
   - mantener compatibilidad con facturasView / loaders / actions
========================================================= */

import { Store } from "../../store/index.js";

import {
  safeArray,
  safeText,
  safeNumber,
} from "./facturas.utils.js";

import {
  DEFAULT_FACTURAS_SORT,
  normalizeFactura,
  sortFacturas,
  getFacturaIdentityList as getModelFacturaIdentityList,
  getFacturaPrimaryId,
  getFacturaIncidenciaId,
  buildFacturaIncidenciaPayload,
} from "./facturas.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

const FACTURAS_STORE_PATH = "entities.facturas";
const FACTURAS_COLLECTION_NAME = "facturas";

const STORE_READ_PATHS = Object.freeze([
  FACTURAS_STORE_PATH,
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

const TICKET_ID_PREFIXES = Object.freeze([
  "INC-",
  "TCK-",
  "TICKET-",
  "CASE-",
  "SUPPORT-",
]);

/* =========================================================
   SAFE BASE
========================================================= */

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

  for (const value of safeArray(values)) {
    const text = safeText(value, "");
    const key = normalizeText(text);

    if (!text || !key || key === "—" || seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(text);
  }

  return out;
}

function compareText(a, b) {
  return safeText(a, "").localeCompare(safeText(b, ""), "es", {
    sensitivity: "base",
    numeric: true,
  });
}

function compareDate(a, b) {
  const left = new Date(a || 0).getTime();
  const right = new Date(b || 0).getTime();

  return safeNumber(left, 0) - safeNumber(right, 0);
}

function isTicketLikeId(value = "") {
  const text = safeText(value, "").toUpperCase();
  return TICKET_ID_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/* =========================================================
   STORE ACCESS
========================================================= */

function safeGet(path = "", fallback = null) {
  const cleanPath = safeText(path, "");

  if (!cleanPath) return fallback;

  try {
    if (typeof Store?.get === "function") {
      const value = Store.get(cleanPath);
      return value === undefined || value === null ? fallback : value;
    }
  } catch {}

  try {
    const parts = cleanPath
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

function safeSet(path = "", value = null) {
  const cleanPath = safeText(path, "");

  if (!cleanPath) return false;

  try {
    if (typeof Store?.set === "function") {
      Store.set(cleanPath, value);
      return true;
    }
  } catch {}

  try {
    const parts = cleanPath
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

function safeGetCollection(name = "") {
  const collectionName = safeText(name, "");

  if (!collectionName) return null;

  try {
    if (typeof Store?.actions?.getCollection === "function") {
      return Store.actions.getCollection(collectionName);
    }
  } catch {}

  try {
    if (typeof Store?.getCollection === "function") {
      return Store.getCollection(collectionName);
    }
  } catch {}

  return null;
}

function safeSetCollection(name = "", value = []) {
  const collectionName = safeText(name, "");

  if (!collectionName) return false;

  try {
    if (typeof Store?.actions?.setCollection === "function") {
      Store.actions.setCollection(collectionName, value);
      return true;
    }
  } catch {}

  try {
    if (typeof Store?.setCollection === "function") {
      Store.setCollection(collectionName, value);
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   STORE SHAPE RESOLUTION
========================================================= */

function resolveCollectionShape(value = null) {
  if (Array.isArray(value)) {
    return value;
  }

  const obj = safeObject(value);

  return safeArray(
    first(
      obj.items,
      obj.facturas,
      obj.invoices,
      obj.data,
      obj.results,
      obj.rows,
      obj.records,
      obj.list,
      obj.collection,

      obj.data?.items,
      obj.data?.facturas,
      obj.data?.invoices,
      obj.data?.results,
      obj.data?.rows,
      obj.data?.records,

      obj.result?.items,
      obj.result?.facturas,
      obj.result?.invoices,
      obj.result?.results,
      obj.result?.rows,
      obj.result?.records,

      obj.payload?.items,
      obj.payload?.facturas,
      obj.payload?.invoices,
      obj.payload?.results,
      obj.payload?.rows,
      obj.payload?.records,

      []
    )
  );
}

function readRawFacturasStore() {
  const collectionValue = safeGetCollection(FACTURAS_COLLECTION_NAME);
  const collection = resolveCollectionShape(collectionValue);

  if (collection.length) {
    return collection;
  }

  for (const path of STORE_READ_PATHS) {
    const value = safeGet(path, null);
    const items = resolveCollectionShape(value);

    if (items.length) {
      return items;
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
   FACTURA NORMALIZATION / IDENTITIES
========================================================= */

function getFacturaRaw(item = {}) {
  const source = safeObject(item);
  return safeObject(source.raw);
}

function normalizeFacturaSafe(item = {}) {
  const source = safeObject(item);

  try {
    return normalizeFactura(source);
  } catch {
    return source;
  }
}

function getStrongFacturaIdentityList(item = {}) {
  const source = safeObject(item);
  const raw = getFacturaRaw(source);

  return uniqueList([
    source.facturaId,
    source.invoiceId,
    source.numeroFacturaLegal,
    source.numeroFacturaSistema,
    source.numeroFactura,
    source.invoiceNumber,
    source.facturaNumero,
    source.facturaCode,
    source.numero,
    source.code,

    raw.facturaId,
    raw.invoiceId,
    raw.numeroFacturaLegal,
    raw.numeroFacturaSistema,
    raw.numeroFactura,
    raw.invoiceNumber,
    raw.facturaNumero,
    raw.facturaCode,
    raw.numero,
    raw.code,
  ]);
}

export function getFacturaStoreIdentityList(item = {}) {
  const source = safeObject(item);
  const raw = getFacturaRaw(source);

  const incidenciaId = safeText(getFacturaIncidenciaId(source), "");
  const strongIds = getStrongFacturaIdentityList(source);

  const weakIds = uniqueList([
    source.id,
    source._id,

    raw.id,
    raw._id,

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

  let modelIds = [];

  try {
    modelIds = getModelFacturaIdentityList(source);
  } catch {
    modelIds = [];
  }

  return uniqueList([
    ...strongIds,
    ...weakIds,
    ...modelIds,
  ]).filter((candidate) => {
    if (!candidate) return false;

    /*
      Seguridad:
      si un id coincide con la incidencia vinculada y parece código de ticket,
      no se usa como identidad primaria de factura.
    */
    if (
      incidenciaId &&
      sameIdentity(candidate, incidenciaId) &&
      isTicketLikeId(candidate)
    ) {
      return false;
    }

    return true;
  });
}

export function getFacturaStoreId(item = {}) {
  const source = safeObject(item);

  const primaryId = safeText(getFacturaPrimaryId(source), "");
  const incidenciaId = safeText(getFacturaIncidenciaId(source), "");

  if (
    primaryId &&
    !(incidenciaId && sameIdentity(primaryId, incidenciaId) && isTicketLikeId(primaryId))
  ) {
    return primaryId;
  }

  return safeText(first(...getFacturaStoreIdentityList(source)), "");
}

export function getFacturaStoreNumber(item = {}) {
  const source = safeObject(item);
  const raw = getFacturaRaw(source);

  return safeText(
    first(
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.numeroFactura,
      source.invoiceNumber,
      source.facturaNumero,
      source.facturaCode,
      source.numero,
      source.code,

      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.facturaNumero,
      raw.facturaCode,
      raw.numero,
      raw.code
    ),
    ""
  );
}

function facturaMatchesId(item = {}, id = "") {
  const target = safeText(id, "");

  if (!target) return false;

  return getFacturaStoreIdentityList(item).some((candidate) =>
    sameIdentity(candidate, target)
  );
}

function getFacturaDedupeKey(item = {}) {
  const source = safeObject(item);

  const preferred = first(
    source.facturaId,
    source.invoiceId,
    source.numeroFacturaLegal,
    source.numeroFacturaSistema,
    source.numeroFactura,
    source.invoiceNumber,
    source.numero,
    source.code,
    source.id,
    source._id,
    ...getFacturaStoreIdentityList(source)
  );

  return normalizeText(preferred);
}

/* =========================================================
   INCIDENCIA HELPERS
========================================================= */

function facturaMatchesIncidenciaId(item = {}, id = "") {
  const target = safeText(id, "");

  if (!target) return false;

  return sameIdentity(getFacturaIncidenciaId(item), target);
}

function getFacturaIncidenciaPayloadSafe(item = {}) {
  try {
    return buildFacturaIncidenciaPayload(item);
  } catch {
    return null;
  }
}

/* =========================================================
   MERGE / DEDUPE
========================================================= */

function mergeFactura(current = {}, incoming = {}) {
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
      ...safeObject(mergedRaw.meta),
    },
  };

  const normalized = normalizeFacturaSafe(merged);

  /*
    El model ya preserva incidencia. Este bloque solo asegura que, si el merge
    dejó una relación visible, los flags meta quedan coherentes.
  */
  const incidenciaId = safeText(getFacturaIncidenciaId(normalized), "");

  if (!incidenciaId) {
    return normalized;
  }

  const incidenciaPayload = getFacturaIncidenciaPayloadSafe(normalized);

  return {
    ...normalized,

    ticketId: safeText(first(normalized.ticketId, incidenciaId), incidenciaId),
    incidenciaId: safeText(first(normalized.incidenciaId, incidenciaId), incidenciaId),

    incidencia: safeObject(first(normalized.incidencia, incidenciaPayload), incidenciaPayload || {}),
    ticket: safeObject(first(normalized.ticket, incidenciaPayload), incidenciaPayload || {}),
    linkedTicket: safeObject(first(normalized.linkedTicket, incidenciaPayload), incidenciaPayload || {}),

    meta: {
      ...safeObject(normalized.meta),
      hasIncidencia: true,
      ticketId: incidenciaId,
      incidenciaId,
    },

    raw: {
      ...safeObject(normalized.raw),
      ticketId: safeText(first(normalized.raw?.ticketId, incidenciaId), incidenciaId),
      incidenciaId: safeText(first(normalized.raw?.incidenciaId, incidenciaId), incidenciaId),

      meta: {
        ...safeObject(normalized.raw?.meta),
        hasIncidencia: true,
        ticketId: incidenciaId,
        incidenciaId,
      },
    },
  };
}

function findMatchingMapKey(map = new Map(), factura = {}) {
  const identities = getFacturaStoreIdentityList(factura);

  if (!identities.length) {
    return "";
  }

  for (const [key, current] of map.entries()) {
    const currentIdentities = getFacturaStoreIdentityList(current);

    const matches = identities.some((identity) =>
      currentIdentities.some((candidate) => sameIdentity(identity, candidate))
    );

    if (matches) {
      return key;
    }
  }

  return "";
}

function normalizeFacturaCollection(items = []) {
  return safeArray(items)
    .map((item) => normalizeFacturaSafe(item))
    .filter((item) => hasOwnKeys(item))
    .filter((item) => Boolean(getFacturaStoreId(item)));
}

function dedupeFacturas(items = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const normalized = normalizeFacturaSafe(item);
    const key = getFacturaDedupeKey(normalized);

    if (!key) {
      continue;
    }

    const matchingKey = findMatchingMapKey(map, normalized);
    const finalKey = matchingKey || key;
    const current = map.get(finalKey) || {};

    map.set(finalKey, mergeFactura(current, normalized));
  }

  return Array.from(map.values());
}

/* =========================================================
   READ API
========================================================= */

export function getFacturasStore() {
  return normalizeFacturaCollection(readRawFacturasStore());
}

export function getSortedFacturasStore(options = {}) {
  const opts = safeObject(options);

  const field = safeText(
    first(
      opts.field,
      opts.sortBy,
      opts.sort?.field,
      DEFAULT_FACTURAS_SORT?.field,
      FALLBACK_SORT.field
    ),
    FALLBACK_SORT.field
  );

  const direction = safeText(
    first(
      opts.direction,
      opts.sortDirection,
      opts.sort?.direction,
      DEFAULT_FACTURAS_SORT?.direction,
      FALLBACK_SORT.direction
    ),
    FALLBACK_SORT.direction
  ).toLowerCase() === "asc"
    ? "asc"
    : "desc";

  const items = getFacturasStore();

  try {
    return sortFacturas(items, {
      field,
      direction,
    });
  } catch {}

  const factor = direction === "asc" ? 1 : -1;
  const list = [...items];

  list.sort((a, b) => {
    if (field === "timestampMs") {
      return (safeNumber(a?.meta?.timestampMs, 0) - safeNumber(b?.meta?.timestampMs, 0)) * factor;
    }

    if (field === "fechaMs") {
      return (safeNumber(a?.meta?.fechaMs, 0) - safeNumber(b?.meta?.fechaMs, 0)) * factor;
    }

    if (field === "updatedAtMs") {
      return (safeNumber(a?.meta?.updatedAtMs, 0) - safeNumber(b?.meta?.updatedAtMs, 0)) * factor;
    }

    if (["fecha", "createdAt", "updatedAt"].includes(field)) {
      return compareDate(a?.[field], b?.[field]) * factor;
    }

    if (["total", "importe", "amount", "importeTotal", "totalFactura"].includes(field)) {
      return (safeNumber(a?.[field], 0) - safeNumber(b?.[field], 0)) * factor;
    }

    if (field === "cliente") {
      return compareText(
        first(a?.cliente?.empresa, a?.cliente?.nombre, a?.clienteNombre, a?.clientName),
        first(b?.cliente?.empresa, b?.cliente?.nombre, b?.clienteNombre, b?.clientName)
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

  return getFacturasStore().find((item) => facturaMatchesId(item, facturaId)) || null;
}

export function getFacturaByIncidenciaIdStore(id = "") {
  const incidenciaId = safeText(id, "");

  if (!incidenciaId) {
    return null;
  }

  return getFacturasStore().find((item) => facturaMatchesIncidenciaId(item, incidenciaId)) || null;
}

export function hasFacturasStore() {
  return getFacturasStore().length > 0;
}

export function countFacturasStore() {
  return getFacturasStore().length;
}

/* =========================================================
   WRITE API
========================================================= */

export function setFacturasStore(items = []) {
  return persistFacturasStore(items);
}

export function appendFacturasStore(items = []) {
  return persistFacturasStore([
    ...getFacturasStore(),
    ...safeArray(items),
  ]);
}

export function upsertFacturaStore(factura = null) {
  const normalized = normalizeFacturaSafe(factura);
  const facturaId = getFacturaStoreId(normalized);

  if (!facturaId) {
    return false;
  }

  const current = getFacturasStore();
  const incomingIdentities = getFacturaStoreIdentityList(normalized);

  const index = current.findIndex((item) =>
    incomingIdentities.some((identity) => facturaMatchesId(item, identity))
  );

  if (index < 0) {
    return persistFacturasStore([
      normalized,
      ...current,
    ]);
  }

  const next = [...current];
  next[index] = mergeFactura(next[index], normalized);

  return persistFacturasStore(next);
}

export function removeFacturaByIdStore(id = "") {
  const facturaId = safeText(id, "");

  if (!facturaId) {
    return false;
  }

  return persistFacturasStore(
    getFacturasStore().filter((item) => !facturaMatchesId(item, facturaId))
  );
}

export function clearFacturasStore() {
  return persistFacturasStore([]);
}

/* =========================================================
   DEBUG
========================================================= */

export function debugFacturasIncidenciasStore() {
  return getFacturasStore().map((item) => {
    const incidenciaPayload = getFacturaIncidenciaPayloadSafe(item);

    return {
      id: getFacturaStoreId(item),
      numero: getFacturaStoreNumber(item),
      identities: getFacturaStoreIdentityList(item),

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
          item.ticket?.asunto,
          incidenciaPayload?.subject,
          incidenciaPayload?.asunto
        ),
        ""
      ),
    };
  });
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

  getFacturaStoreIdentityList,
  getFacturaStoreId,
  getFacturaStoreNumber,

  debugFacturasIncidenciasStore,
};
