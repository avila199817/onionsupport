/* =========================================================
   Onion Support - Incidencias Store
   Archivo: /src/views/incidencias/incidencias.store.js

   Responsabilidad:
   - Encapsular acceso al Store global para incidencias.
   - Leer/escribir colección normalizada completa.
   - Mantener índice derivado por id para búsquedas rápidas.
   - Dedupe por ticketId/id/code/ticketCode/incidenciaId.
   - Delegar normalización principal, stats y orden actualizado al modelo.
   - No limitar colecciones.
   - No paginar.
   - No llamar APIs.
   - No tocar DOM.
   - No registrar eventos.
   - No abrir modales.
   - No duplicar lógica de View/State/Actions.
========================================================= */

import { Store } from "../../store/index.js";

import {
  computeIncidenciasStats as computeIncidenciasStatsModel,
  normalizeIncidenciaModel,
  sortIncidenciasByUpdatedDesc as sortIncidenciasByUpdatedDescModel,
} from "./incidencias.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const INCIDENCIAS_STORE_VERSION = "incidencias.store.v3.solid";

export const STORE_PATH = "entities.incidencias";
export const STORE_COLLECTION_KEY = "incidencias";

export const STORE_BY_ID_PATH = "entities.incidenciasById";
export const STORE_DETAIL_PATH = "entities.incidenciasDetail";
export const STORE_META_PATH = "entities.incidenciasMeta";

const READ_PATHS = Object.freeze([
  STORE_PATH,
  STORE_COLLECTION_KEY,
  `collections.${STORE_COLLECTION_KEY}`,

  // Legacy read-only.
  "entities.tickets",
  "tickets",
  "collections.tickets",
]);

const WRITE_PATHS = Object.freeze([
  STORE_PATH,
  STORE_COLLECTION_KEY,
  `collections.${STORE_COLLECTION_KEY}`,
]);

const DETAIL_READ_PATHS = Object.freeze([
  STORE_BY_ID_PATH,
  STORE_DETAIL_PATH,
  "incidenciasById",
  "incidenciasDetail",

  // Legacy read-only.
  "entities.ticketsById",
  "ticketsById",
]);

const NESTED_OBJECT_KEYS = Object.freeze([
  "meta",
  "cliente",
  "client",
  "customer",
  "tecnico",
  "technician",
  "assignedTo",
  "assignedTechnician",
  "assignedUser",
  "agent",
  "assignee",
  "receptor",
  "createdBy",
  "requester",
  "requesterSnapshot",
  "owner",
  "usuario",
  "factura",
  "invoice",
  "billing",
  "linkedInvoices",
  "assignment",
  "lifecycle",
  "sla",
  "resolution",
  "relations",
  "visibility",
  "privacy",
  "audit",
  "search",
]);

const ARRAY_KEYS = Object.freeze([
  "attachments",
  "files",
  "adjuntos",
  "history",
  "comments",
  "timeline",
  "facturas",
  "invoices",
  "facturasRelacionadas",
  "linkedFacturas",
  "normalizedInvoices",
]);

const RAW_DROP_KEYS = new Set([
  "raw",
  "searchText",
]);

const EMPTY_SIGNATURE = "__empty__";

let collectionCacheSignature = "";
let collectionCacheItems = null;

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFn(value) {
  return typeof value === "function";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/€/g, "")
      .replace(/\$/g, "")
      .replace(/£/g, "")
      .replace(/%/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      normalized = lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(/,/g, ".")
        : normalized.replace(/,/g, "");
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const number = Number(normalized);
    return Number.isFinite(number) ? number : fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

function normalizeCompare(value = "") {
  return safeLower(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function removeRawKey(value = {}) {
  if (!isObject(value)) return {};

  return Object.entries(value).reduce((acc, [key, entry]) => {
    if (RAW_DROP_KEYS.has(key)) return acc;
    acc[key] = entry;
    return acc;
  }, {});
}

function buildRawSnapshot(current = {}, incoming = {}) {
  return {
    ...removeRawKey(safeObject(current.raw)),
    ...removeRawKey(current),
    ...removeRawKey(safeObject(incoming.raw)),
    ...removeRawKey(incoming),
  };
}

function invalidateCollectionCache() {
  collectionCacheSignature = "";
  collectionCacheItems = null;
}

function rememberCollection(signature = "", items = []) {
  collectionCacheSignature = safeText(signature, EMPTY_SIGNATURE);
  collectionCacheItems = safeArray(items).slice();
}

function readCachedCollection(signature = "") {
  const cleanSignature = safeText(signature, EMPTY_SIGNATURE);

  if (!collectionCacheItems || collectionCacheSignature !== cleanSignature) {
    return null;
  }

  return collectionCacheItems.slice();
}

/* =========================================================
   PATH / DATE HELPERS
========================================================= */

function getByPath(source = {}, path = "") {
  const cleanPath = safeText(path, "");

  if (!cleanPath) return undefined;

  return cleanPath.split(".").reduce((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return acc[key];
  }, source);
}

function setByPath(source = {}, path = "", value = null) {
  const root = safeObject(source);
  const parts = safeText(path, "").split(".").filter(Boolean);

  if (!parts.length) return false;

  let target = root;

  parts.slice(0, -1).forEach((part) => {
    if (!isObject(target[part])) target[part] = {};
    target = target[part];
  });

  target[parts[parts.length - 1]] = value;
  return true;
}

function parseSpanishDate(value = "") {
  const text = safeText(value, "");

  if (!text) return 0;

  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) return 0;

  const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
  const timestamp = date.getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function safeTimestamp(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const spanishTimestamp = parseSpanishDate(value);
  if (Number.isFinite(spanishTimestamp) && spanishTimestamp > 0) return spanishTimestamp;

  const nativeTimestamp = new Date(value).getTime();
  return Number.isFinite(nativeTimestamp) && nativeTimestamp > 0 ? nativeTimestamp : fallback;
}

function getCreatedTimestamp(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeTimestamp(
    first(
      row.createdAtMs,
      row.createdAtTs,
      row.createdAt,
      row.createdAtES,
      row.date,
      raw.createdAtMs,
      raw.createdAtTs,
      raw.createdAt,
      raw.createdAtES,
      raw.date,
      row._ts,
      raw._ts,
      0
    ),
    0
  );
}

function getUpdatedTimestamp(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeTimestamp(
    first(
      row.meta?.updatedAtMs,
      row.meta?.timestampMs,
      row.updatedAtTs,
      row.lastActivityAt,
      row.updatedAt,
      row.modifiedAt,
      row.closedAt,
      row.createdAt,
      raw.meta?.updatedAtMs,
      raw.meta?.timestampMs,
      raw.updatedAtTs,
      raw.lastActivityAt,
      raw.updatedAt,
      raw.modifiedAt,
      raw.closedAt,
      raw.createdAt,
      row._ts,
      raw._ts,
      0
    ),
    0
  );
}

/* =========================================================
   ID HELPERS
========================================================= */

export function getItemId(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.ticketId,
      row.incidenciaId,
      row.id,
      row.code,
      row.ticketCode,
      row._id,
      row.ticket?.ticketId,
      row.ticket?.incidenciaId,
      row.ticket?.id,
      row.ticket?.code,
      row.ticket?.ticketCode,
      row.item?.ticketId,
      row.item?.incidenciaId,
      row.item?.id,
      row.item?.code,
      row.item?.ticketCode,
      row.data?.ticketId,
      row.data?.incidenciaId,
      row.data?.id,
      row.data?.code,
      row.data?.ticketCode,
      row.detail?.ticketId,
      row.detail?.incidenciaId,
      row.detail?.id,
      row.detail?.code,
      row.detail?.ticketCode,
      row.incidencia?.ticketId,
      row.incidencia?.incidenciaId,
      row.incidencia?.id,
      row.incidencia?.code,
      row.incidencia?.ticketCode,
      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw.code,
      raw.ticketCode,
      raw._id
    ),
    ""
  );
}

export function getItemCandidateIds(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return uniqueStrings([
    row.ticketId,
    row.incidenciaId,
    row.id,
    row.code,
    row.ticketCode,
    row._id,
    row.entityId,
    row.ticket?.ticketId,
    row.ticket?.incidenciaId,
    row.ticket?.id,
    row.ticket?.code,
    row.ticket?.ticketCode,
    row.item?.ticketId,
    row.item?.incidenciaId,
    row.item?.id,
    row.item?.code,
    row.item?.ticketCode,
    row.data?.ticketId,
    row.data?.incidenciaId,
    row.data?.id,
    row.data?.code,
    row.data?.ticketCode,
    row.detail?.ticketId,
    row.detail?.incidenciaId,
    row.detail?.id,
    row.detail?.code,
    row.detail?.ticketCode,
    row.incidencia?.ticketId,
    row.incidencia?.incidenciaId,
    row.incidencia?.id,
    row.incidencia?.code,
    row.incidencia?.ticketCode,
    raw.ticketId,
    raw.incidenciaId,
    raw.id,
    raw.code,
    raw.ticketCode,
    raw._id,
    raw.entityId,
  ]);
}

function hasCandidateId(item = {}, id = "") {
  const target = normalizeCompare(id);

  if (!target) return false;

  return getItemCandidateIds(item).some((candidate) => normalizeCompare(candidate) === target);
}

function isSameItemId(item = {}, id = "") {
  return hasCandidateId(item, id);
}

function findExistingKeyForItem(aliasIndex = new Map(), item = {}) {
  for (const candidate of getItemCandidateIds(item)) {
    const normalized = normalizeCompare(candidate);

    if (normalized && aliasIndex.has(normalized)) {
      return aliasIndex.get(normalized);
    }
  }

  return "";
}

function registerAliases(aliasIndex = new Map(), primaryKey = "", item = {}) {
  const cleanPrimary = safeText(primaryKey, "");

  if (!cleanPrimary) return;

  getItemCandidateIds(item).forEach((candidate) => {
    const normalized = normalizeCompare(candidate);

    if (normalized) {
      aliasIndex.set(normalized, cleanPrimary);
    }
  });
}

/* =========================================================
   COLLECTION SIGNATURE
========================================================= */

function getSignaturePart(item = {}, index = 0) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return [
    getItemId(row) || `anon:${index}`,
    getUpdatedTimestamp(row),
    getCreatedTimestamp(row),
    first(row.status, row.estado, raw.status, raw.estado, ""),
    first(row.priority, row.prioridad, raw.priority, raw.prioridad, ""),
    first(row.title, row.subject, row.asunto, raw.title, raw.subject, raw.asunto, ""),
    first(row.clientName, row.clienteNombre, row.name, raw.clientName, raw.clienteNombre, raw.name, ""),
    first(row.assignedToName, row.technicianName, row.tecnico?.name, raw.assignedToName, raw.technicianName, raw.tecnico?.name, ""),
    first(row.attachmentsCount, row.filesCount, safeArray(row.attachments).length, safeArray(row.files).length, raw.attachmentsCount, raw.filesCount, ""),
    first(row.commentsCount, safeArray(row.comments).length, raw.commentsCount, ""),
    first(row.historyCount, safeArray(row.history).length, raw.historyCount, ""),
    first(row.facturasCount, row.invoicesCount, row.linkedInvoices?.count, raw.facturasCount, raw.invoicesCount, raw.linkedInvoices?.count, ""),
  ]
    .map((value) => safeText(value, ""))
    .join("~");
}

function buildCollectionSignature(items = []) {
  const list = safeArray(items);

  if (!list.length) return EMPTY_SIGNATURE;

  return `${list.length}|${list.map(getSignaturePart).join("|")}`;
}

/* =========================================================
   NORMALIZATION / MERGE
========================================================= */

function normalizeStoreItem(item = {}) {
  const source = safeObject(item);

  try {
    return normalizeIncidenciaModel(source);
  } catch {
    return { ...source };
  }
}

function normalizeStoreItems(items = []) {
  return safeArray(items)
    .filter(isObject)
    .map(normalizeStoreItem);
}

function mergePlainObject(base = {}, patch = {}) {
  return {
    ...safeObject(base),
    ...safeObject(patch),
  };
}

function getArrayItemKey(item = {}, fallback = "") {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.id,
      row.attachmentId,
      row.fileId,
      row.commentId,
      row.historyId,
      row.eventId,
      row.ticketId,
      row.facturaId,
      row.invoiceId,
      row.numeroFacturaLegal,
      row.numeroFactura,
      row.invoiceNumber,
      row.path,
      row.blobName,
      row.storageKey,
      raw.id,
      raw.attachmentId,
      raw.fileId,
      raw.commentId,
      raw.historyId,
      raw.eventId,
      raw.facturaId,
      raw.invoiceId,
      raw.path,
      raw.blobName,
      raw.storageKey,
      fallback
    ),
    fallback
  );
}

function mergeArrayById(baseItems = [], patchItems = []) {
  const output = [];
  const index = new Map();

  [...safeArray(baseItems), ...safeArray(patchItems)].forEach((item, position) => {
    const row = safeObject(item);
    const key = normalizeCompare(getArrayItemKey(row, `__anon_${position}`));

    if (!index.has(key)) {
      index.set(key, output.length);
      output.push(row);
      return;
    }

    const currentIndex = index.get(key);
    output[currentIndex] = mergePlainObject(output[currentIndex], row);
  });

  return output;
}

function mergeNestedObjects(current = {}, incoming = {}) {
  const base = safeObject(current);
  const patch = safeObject(incoming);

  const merged = {
    ...base,
    ...patch,
  };

  NESTED_OBJECT_KEYS.forEach((key) => {
    if (isObject(base[key]) || isObject(patch[key])) {
      merged[key] = mergePlainObject(base[key], patch[key]);
    }
  });

  ARRAY_KEYS.forEach((key) => {
    if (Array.isArray(base[key]) || Array.isArray(patch[key])) {
      merged[key] = mergeArrayById(base[key], patch[key]);
    }
  });

  const attachments = mergeArrayById(
    first(base.attachments, base.files, base.adjuntos, []),
    first(patch.attachments, patch.files, patch.adjuntos, [])
  );

  if (attachments.length) {
    merged.attachments = attachments;
    merged.files = attachments;
    merged.adjuntos = attachments;
    merged.attachmentsCount = safeNumber(
      first(
        patch.attachmentsCount,
        patch.filesCount,
        base.attachmentsCount,
        base.filesCount,
        attachments.length
      ),
      attachments.length
    );
    merged.filesCount = merged.attachmentsCount;
    merged.adjuntosCount = merged.attachmentsCount;
  }

  const id = safeText(
    first(
      patch.ticketId,
      patch.incidenciaId,
      patch.id,
      patch.code,
      patch.ticketCode,
      base.ticketId,
      base.incidenciaId,
      base.id,
      base.code,
      base.ticketCode
    ),
    ""
  );

  if (id) {
    merged.id = safeText(first(patch.id, base.id, id), id);
    merged.ticketId = safeText(first(patch.ticketId, base.ticketId, id), id);
    merged.incidenciaId = safeText(first(patch.incidenciaId, base.incidenciaId, id), id);
    merged.code = safeText(first(patch.code, patch.ticketCode, base.code, base.ticketCode, id), id);
    merged.ticketCode = safeText(first(patch.ticketCode, patch.code, base.ticketCode, base.code, id), id);
  }

  merged.raw = buildRawSnapshot(base, patch);
  merged.meta = mergePlainObject(base.meta, patch.meta);

  return normalizeStoreItem(merged);
}

function mergeIncidencia(base = {}, patch = {}, { normalized = false } = {}) {
  const current = normalized ? safeObject(base) : normalizeStoreItem(base);
  const incoming = normalized ? safeObject(patch) : normalizeStoreItem(patch);

  return mergeNestedObjects(current, incoming);
}

function mergeByFreshness(previous = {}, incoming = {}) {
  const previousTs = getUpdatedTimestamp(previous);
  const incomingTs = getUpdatedTimestamp(incoming);

  if (incomingTs >= previousTs) {
    return mergeIncidencia(previous, incoming, { normalized: true });
  }

  return mergeIncidencia(incoming, previous, { normalized: true });
}

function dedupeIncidencias(items = [], { normalized = false } = {}) {
  const list = normalized
    ? safeArray(items).filter(isObject)
    : normalizeStoreItems(items);

  const map = new Map();
  const aliasIndex = new Map();
  const anonymous = [];

  list.forEach((item) => {
    const primaryId = getItemId(item);

    if (!primaryId) {
      anonymous.push(item);
      return;
    }

    const existingKey = findExistingKeyForItem(aliasIndex, item);
    const finalKey = existingKey || primaryId;

    if (!map.has(finalKey)) {
      map.set(finalKey, item);
      registerAliases(aliasIndex, finalKey, item);
      return;
    }

    const merged = mergeByFreshness(map.get(finalKey), item);

    map.set(finalKey, merged);
    registerAliases(aliasIndex, finalKey, merged);
  });

  return [...map.values(), ...anonymous];
}

function normalizeCollection(items = [], { sort = true, normalized = false } = {}) {
  const deduped = dedupeIncidencias(items, { normalized });

  return sort ? sortIncidenciasByUpdatedDescModel(deduped) : deduped;
}

/* =========================================================
   STORE READ
========================================================= */

function objectMapToArray(value = {}) {
  return Object.values(safeObject(value)).filter(isObject);
}

function collectionValueToArray(value = null) {
  if (Array.isArray(value)) return value;
  if (isObject(value)) return objectMapToArray(value);
  return [];
}

function getStoreStateCandidates() {
  const output = [];

  try {
    if (Store?.state) output.push(Store.state);
  } catch {}

  try {
    if (Store?.data) output.push(Store.data);
  } catch {}

  try {
    if (Store?.snapshot) output.push(Store.snapshot);
  } catch {}

  try {
    if (isFn(Store?.getState)) output.push(Store.getState());
  } catch {}

  return output;
}

function readViaStoreGet(paths = READ_PATHS) {
  if (!isFn(Store?.get)) return null;

  for (const path of paths) {
    try {
      const value = Store.get(path);
      if (Array.isArray(value) || isObject(value)) return value;
    } catch {}
  }

  return null;
}

function readViaStoreState(paths = READ_PATHS) {
  const states = getStoreStateCandidates();

  for (const state of states) {
    const source = safeObject(state);

    for (const path of paths) {
      const value = getByPath(source, path);
      if (Array.isArray(value) || isObject(value)) return value;
    }
  }

  return null;
}

function readViaStoreDirect() {
  const candidates = [
    Store?.collections?.[STORE_COLLECTION_KEY],
    Store?.entities?.[STORE_COLLECTION_KEY],
    Store?.entities?.incidencias,
    Store?.collections?.tickets,
    Store?.entities?.tickets,
  ];

  for (const value of candidates) {
    if (Array.isArray(value) || isObject(value)) return value;
  }

  return null;
}

function readStoreCollectionValue() {
  const candidates = [
    readViaStoreGet(READ_PATHS),
    readViaStoreState(READ_PATHS),
    readViaStoreDirect(),
  ];

  for (const value of candidates) {
    if (Array.isArray(value) || isObject(value)) return value;
  }

  return [];
}

function readStoreCollection() {
  return collectionValueToArray(readStoreCollectionValue());
}

function readStoreDetailMap() {
  const candidates = [
    readViaStoreGet(DETAIL_READ_PATHS),
    readViaStoreState(DETAIL_READ_PATHS),
    Store?.entities?.incidenciasById,
    Store?.entities?.incidenciasDetail,
    Store?.incidenciasById,
  ];

  for (const value of candidates) {
    if (isObject(value)) return safeObject(value);
  }

  return {};
}

/* =========================================================
   STORE WRITE
========================================================= */

function writeViaSet(path = "", value = null) {
  try {
    if (isFn(Store?.set)) {
      Store.set(path, value);
      return true;
    }
  } catch {}

  return false;
}

function writeViaActions(list = []) {
  let wrote = false;

  try {
    if (isFn(Store?.actions?.setCollection)) {
      Store.actions.setCollection(STORE_COLLECTION_KEY, list);
      wrote = true;
    }
  } catch {}

  try {
    if (isFn(Store?.actions?.replaceCollection)) {
      Store.actions.replaceCollection(STORE_COLLECTION_KEY, list);
      wrote = true;
    }
  } catch {}

  try {
    if (isFn(Store?.actions?.set)) {
      Store.actions.set(STORE_PATH, list);
      wrote = true;
    }
  } catch {}

  try {
    if (isFn(Store?.commit)) {
      Store.commit(STORE_PATH, list);
      wrote = true;
    }
  } catch {}

  return wrote;
}

function writeDirectFallback(list = []) {
  try {
    if (!Store || typeof Store !== "object") return false;

    Store.entities = safeObject(Store.entities);
    Store.collections = safeObject(Store.collections);

    Store.entities.incidencias = list;
    Store.collections.incidencias = list;
    Store[STORE_COLLECTION_KEY] = list;

    return true;
  } catch {
    return false;
  }
}

function buildDetailMap(items = []) {
  const map = {};

  safeArray(items).forEach((item) => {
    const row = safeObject(item);
    const primaryId = getItemId(row);

    if (!primaryId) return;

    getItemCandidateIds(row).forEach((id) => {
      const key = normalizeCompare(id);
      if (key) map[key] = row;
    });

    map[primaryId] = row;
    map[normalizeCompare(primaryId)] = row;
  });

  return map;
}

function writeDetailMap(items = []) {
  const detailMap = buildDetailMap(items);

  writeViaSet(STORE_BY_ID_PATH, detailMap);
  writeViaSet(STORE_DETAIL_PATH, detailMap);
  writeViaSet("incidenciasById", detailMap);

  try {
    if (Store && typeof Store === "object") {
      Store.entities = safeObject(Store.entities);
      Store.entities.incidenciasById = detailMap;
      Store.entities.incidenciasDetail = detailMap;
      Store.incidenciasById = detailMap;
    }
  } catch {}

  return detailMap;
}

function writeMeta(list = []) {
  const items = safeArray(list);

  const meta = {
    count: items.length,
    ids: items.map(getItemId).filter(Boolean),
    updatedAt: new Date().toISOString(),
    order: "updated_desc",
    source: "incidencias.store",
    version: INCIDENCIAS_STORE_VERSION,
  };

  writeViaSet(STORE_META_PATH, meta);

  try {
    if (Store && typeof Store === "object") {
      Store.entities = safeObject(Store.entities);
      Store.entities.incidenciasMeta = meta;
      setByPath(Store, STORE_META_PATH, meta);
    }
  } catch {}

  return meta;
}

function writeStoreCollection(items = [], options = {}) {
  const opts = safeObject(options);
  const list = normalizeCollection(items, {
    normalized: Boolean(opts.normalized),
    sort: opts.sort !== false,
  });

  let wrote = false;

  WRITE_PATHS.forEach((path) => {
    wrote = writeViaSet(path, list) || wrote;
  });

  wrote = writeViaActions(list) || wrote;
  wrote = writeDirectFallback(list) || wrote;

  writeDetailMap(list);
  writeMeta(list);

  invalidateCollectionCache();
  rememberCollection(buildCollectionSignature(list), list);

  return list.slice();
}

/* =========================================================
   GETTERS
========================================================= */

export function getIncidencias() {
  const rawItems = readStoreCollection();
  const signature = buildCollectionSignature(rawItems);
  const cached = readCachedCollection(signature);

  if (cached) return cached;

  const list = normalizeCollection(rawItems);

  rememberCollection(signature, list);

  return list.slice();
}

export function getIncidenciasStore() {
  return getIncidencias();
}

export function getSortedIncidenciasStore() {
  return getIncidencias();
}

export function getIncidenciaById(id = "") {
  const target = safeText(id, "");

  if (!target) return null;

  const normalizedTarget = normalizeCompare(target);
  const detailMap = readStoreDetailMap();

  if (detailMap[normalizedTarget]) {
    return normalizeStoreItem(detailMap[normalizedTarget]);
  }

  if (detailMap[target]) {
    return normalizeStoreItem(detailMap[target]);
  }

  return getIncidencias().find((item) => isSameItemId(item, target)) || null;
}

export function getIncidenciaByIdStore(id = "") {
  return getIncidenciaById(id);
}

export function hasIncidencias() {
  return getIncidencias().length > 0;
}

export function getIncidenciasCount() {
  return getIncidencias().length;
}

export function getIncidenciasSnapshot() {
  const items = getIncidencias();

  return {
    items,
    count: items.length,
    hasItems: items.length > 0,
    ids: items.map(getItemId).filter(Boolean),
    order: "updated_desc",
    lastReadAt: new Date().toISOString(),
  };
}

/* =========================================================
   SETTERS
========================================================= */

export function setIncidencias(items = []) {
  return writeStoreCollection(items);
}

export function setIncidenciasStore(items = []) {
  return setIncidencias(items);
}

export function replaceIncidenciasStore(items = []) {
  return setIncidencias(items);
}

export function clearIncidencias() {
  return writeStoreCollection([]);
}

export function clearIncidenciasStore() {
  return clearIncidencias();
}

export function appendIncidenciaStore(item = null) {
  if (!item) return getIncidencias();

  return writeStoreCollection([
    ...readStoreCollection(),
    item,
  ]);
}

export function updateIncidenciaStore(id = "", patch = {}) {
  const target = safeText(id, "");

  if (!target) return getIncidencias();

  const current = getIncidencias();
  const nextPatch = safeObject(patch);
  let found = false;

  const next = current.map((item) => {
    if (!isSameItemId(item, target)) return item;

    found = true;

    return mergeIncidencia(
      item,
      {
        ...nextPatch,
        ticketId: first(nextPatch.ticketId, nextPatch.id, target),
      },
      { normalized: false }
    );
  });

  if (!found) return current;

  return writeStoreCollection(next, { normalized: true });
}

export function patchIncidenciaStore(id = "", patch = {}) {
  return updateIncidenciaStore(id, patch);
}

/* =========================================================
   UPSERT
========================================================= */

export function upsertIncidenciaStore(item = null) {
  if (!item) return getIncidencias();

  return writeStoreCollection([
    ...readStoreCollection(),
    item,
  ]);
}

export function upsertManyIncidenciasStore(items = []) {
  const incoming = safeArray(items).filter(isObject);

  if (!incoming.length) return getIncidencias();

  return writeStoreCollection([
    ...readStoreCollection(),
    ...incoming,
  ]);
}

/* =========================================================
   REMOVE
========================================================= */

export function removeIncidenciaStore(id = "") {
  const target = safeText(id, "");

  if (!target) return getIncidencias();

  const next = getIncidencias().filter((item) => !isSameItemId(item, target));

  return writeStoreCollection(next, { normalized: true });
}

/* =========================================================
   SORT HELPERS
========================================================= */

export function sortIncidenciasByUpdatedDesc(items = []) {
  return sortIncidenciasByUpdatedDescModel(normalizeStoreItems(items));
}

export function sortIncidenciasByCreatedDesc(items = []) {
  return [...normalizeStoreItems(items)].sort((a, b) => {
    const aTime = getCreatedTimestamp(a);
    const bTime = getCreatedTimestamp(b);

    if (bTime !== aTime) return bTime - aTime;

    return safeText(getItemId(b)).localeCompare(safeText(getItemId(a)), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

export function filterIncidenciasStore(predicate = null) {
  const items = getIncidencias();

  return isFn(predicate) ? items.filter(predicate) : items;
}

export function mapIncidenciasStore(mapper = null) {
  const items = getIncidencias();

  return isFn(mapper) ? items.map(mapper) : items;
}

export function findIncidenciaStore(predicate = null) {
  const items = getIncidencias();

  return isFn(predicate) ? items.find(predicate) || null : null;
}

/* =========================================================
   STATS HELPERS
========================================================= */

export function computeIncidenciasStoreStats(items = getIncidencias()) {
  const stats = computeIncidenciasStatsModel(safeArray(items));

  const closed = safeNumber(stats.closed, 0) + safeNumber(stats.resolved, 0);
  const active = Math.max(safeNumber(stats.total, 0) - closed, 0);
  const open = safeNumber(stats.open, 0) +
    safeNumber(stats.pending, 0) +
    safeNumber(stats.inProgress, 0);
  const urgent = safeNumber(stats.urgent, 0) + safeNumber(stats.high, 0);

  return {
    ...stats,
    open,
    closed,
    active,
    urgent,
    withAttachments: safeNumber(stats.withAttachments, 0),
    withInvoices: safeNumber(stats.withInvoices, 0),
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getIncidenciasStoreDebugSnapshot() {
  const items = getIncidencias();
  const detailMap = readStoreDetailMap();

  return {
    version: INCIDENCIAS_STORE_VERSION,
    path: STORE_PATH,
    collectionKey: STORE_COLLECTION_KEY,
    byIdPath: STORE_BY_ID_PATH,
    detailPath: STORE_DETAIL_PATH,
    count: items.length,
    detailKeys: Object.keys(detailMap || {}).length,
    ids: items.map(getItemId).filter(Boolean),
    firstId: getItemId(items[0] || {}),
    lastId: getItemId(items[items.length - 1] || {}),
    firstUpdatedAt:
      items[0]?.lastActivityAt ||
      items[0]?.updatedAt ||
      items[0]?.raw?.lastActivityAt ||
      items[0]?.raw?.updatedAt ||
      null,
    order: "updated_desc",
    cache: {
      hasCache: Boolean(collectionCacheItems),
      signature: collectionCacheSignature,
      count: collectionCacheItems?.length || 0,
    },
    stats: computeIncidenciasStoreStats(items),
    items,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  INCIDENCIAS_STORE_VERSION,
  STORE_PATH,
  STORE_COLLECTION_KEY,
  STORE_BY_ID_PATH,
  STORE_DETAIL_PATH,
  STORE_META_PATH,
  getIncidencias,
  getIncidenciasStore,
  getSortedIncidenciasStore,
  getIncidenciaById,
  getIncidenciaByIdStore,
  getIncidenciasSnapshot,
  hasIncidencias,
  getIncidenciasCount,
  setIncidencias,
  setIncidenciasStore,
  replaceIncidenciasStore,
  appendIncidenciaStore,
  updateIncidenciaStore,
  patchIncidenciaStore,
  upsertIncidenciaStore,
  upsertManyIncidenciasStore,
  removeIncidenciaStore,
  clearIncidencias,
  clearIncidenciasStore,
  filterIncidenciasStore,
  mapIncidenciasStore,
  findIncidenciaStore,
  sortIncidenciasByUpdatedDesc,
  sortIncidenciasByCreatedDesc,
  computeIncidenciasStoreStats,
  getItemId,
  getItemCandidateIds,
  getIncidenciasStoreDebugSnapshot,
};
