/* =========================================================
   Onion SPA - Incidencias Store
   Archivo: src/views/incidencias/incidencias.store.js

   FINAL PRO SYSTEM · STORE LAYER · 10/10

   RESPONSABILIDADES:
   - encapsular Store global
   - leer / escribir colección incidencias
   - helpers para API / View / Actions / Modal
   - búsquedas robustas por id / ticketId / code / ticketCode
   - replace / append / update / upsert / remove
   - deduplicación segura por aliases de identidad
   - persistencia estable para detalle modal
   - ordenación consistente por updatedAt
   - compatibilidad con Store.set / Store.get / Store.actions.setCollection

   HARDENING PRO:
   - no muta colecciones originales
   - merge seguro preservando raw
   - lectura tolerante a distintas formas de Store
   - escritura multi-path defensiva
   - upsert sin duplicados aunque cambie id/code/ticketId
   - búsquedas case-insensitive sin romper ids originales
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_PATH = "entities.incidencias";
const STORE_COLLECTION_KEY = "incidencias";

const READ_PATHS = [
  STORE_PATH,
  STORE_COLLECTION_KEY,
  `collections.${STORE_COLLECTION_KEY}`,
];

/* =========================================================
   SAFE CORE
========================================================= */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeId(value) {
  return safeText(value, "");
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    return value;
  }

  return null;
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

function cloneArray(items = []) {
  return safeArray(items).map((item) => safeObject(item));
}

/* =========================================================
   PATH HELPERS
========================================================= */

function getByPath(source = {}, path = "") {
  const cleanPath = safeText(path, "");
  if (!cleanPath) return undefined;

  return cleanPath.split(".").reduce((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return acc[key];
  }, source);
}

/* =========================================================
   TIMESTAMP HELPERS
========================================================= */

function parseSpanishDate(value = "") {
  const text = safeText(value, "");
  if (!text) return 0;

  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) return 0;

  const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = match;

  const date = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss)
  );

  const ts = date.getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function safeTimestamp(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const nativeDate = new Date(value);
  const nativeTs = nativeDate.getTime();

  if (Number.isFinite(nativeTs) && nativeTs > 0) {
    return nativeTs;
  }

  const esTs = parseSpanishDate(value);

  if (Number.isFinite(esTs) && esTs > 0) {
    return esTs;
  }

  return fallback;
}

function getUpdatedTimestamp(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeTimestamp(
    first(
      row.updatedAtMs,
      row.updatedAtTs,
      row.meta?.timestampMs,
      row.meta?.updatedAtMs,
      row.updatedAt,
      row.updatedAtES,
      row.closedAt,
      row.closedAtES,
      row.modifiedAt,
      row.lastUpdate,
      row.createdAt,
      row.createdAtES,

      raw.updatedAtMs,
      raw.updatedAtTs,
      raw.updatedAt,
      raw.updatedAtES,
      raw.closedAt,
      raw.closedAtES,
      raw.modifiedAt,
      raw.lastUpdate,
      raw.createdAt,
      raw.createdAtES,

      0
    ),
    0
  );
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

  return safeId(
    first(
      row.ticketId,
      row.id,
      row.code,
      row.ticketCode,
      row._id,

      raw.ticketId,
      raw.id,
      raw.code,
      raw.ticketCode,
      raw._id
    )
  );
}

export function getItemCandidateIds(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return uniqueStrings([
    row.ticketId,
    row.id,
    row.code,
    row.ticketCode,
    row._id,

    row.ticket?.ticketId,
    row.ticket?.id,
    row.ticket?.code,
    row.ticket?.ticketCode,

    row.item?.ticketId,
    row.item?.id,
    row.item?.code,
    row.item?.ticketCode,

    row.data?.ticketId,
    row.data?.id,
    row.data?.code,
    row.data?.ticketCode,

    raw.ticketId,
    raw.id,
    raw.code,
    raw.ticketCode,
    raw._id,
  ]);
}

function normalizeIdForCompare(value = "") {
  return safeLower(value, "");
}

function hasCandidateId(item = {}, id = "") {
  const target = normalizeIdForCompare(id);
  if (!target) return false;

  return getItemCandidateIds(item).some(
    (candidate) => normalizeIdForCompare(candidate) === target
  );
}

function isSameItemId(item = {}, id = "") {
  return hasCandidateId(item, id);
}

function findExistingKeyForItem(aliasIndex = new Map(), item = {}) {
  const candidates = getItemCandidateIds(item);

  for (const candidate of candidates) {
    const normalized = normalizeIdForCompare(candidate);

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
    const normalized = normalizeIdForCompare(candidate);

    if (normalized) {
      aliasIndex.set(normalized, cleanPrimary);
    }
  });
}

/* =========================================================
   LOW LEVEL STORE ACCESS
========================================================= */

function readViaStoreGet() {
  if (typeof Store?.get !== "function") return [];

  for (const path of READ_PATHS) {
    try {
      const value = Store.get(path);

      if (Array.isArray(value)) {
        return value;
      }
    } catch {}
  }

  return [];
}

function readViaStoreState() {
  const stateCandidates = [
    Store?.state,
    Store?.data,
    Store?.snapshot,
    Store?.getState?.(),
  ];

  for (const state of stateCandidates) {
    const obj = safeObject(state);

    for (const path of READ_PATHS) {
      const value = getByPath(obj, path);

      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  return [];
}

function readViaStoreCollections() {
  const candidates = [
    Store?.collections?.[STORE_COLLECTION_KEY],
    Store?.entities?.[STORE_COLLECTION_KEY],
    Store?.entities?.incidencias,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function readStoreCollection() {
  const candidates = [
    readViaStoreGet(),
    readViaStoreState(),
    readViaStoreCollections(),
  ];

  for (const value of candidates) {
    if (Array.isArray(value) && value.length) {
      return cloneArray(value);
    }
  }

  for (const value of candidates) {
    if (Array.isArray(value)) {
      return [];
    }
  }

  return [];
}

function writeViaSet(path = "", list = []) {
  try {
    if (typeof Store?.set === "function") {
      Store.set(path, list);
      return true;
    }
  } catch {}

  return false;
}

function writeViaActions(list = []) {
  let wrote = false;

  try {
    if (typeof Store?.actions?.setCollection === "function") {
      Store.actions.setCollection(STORE_COLLECTION_KEY, list);
      wrote = true;
    }
  } catch {}

  try {
    if (typeof Store?.actions?.set === "function") {
      Store.actions.set(STORE_PATH, list);
      wrote = true;
    }
  } catch {}

  try {
    if (typeof Store?.actions?.replaceCollection === "function") {
      Store.actions.replaceCollection(STORE_COLLECTION_KEY, list);
      wrote = true;
    }
  } catch {}

  return wrote;
}

function writeDirectFallback(list = []) {
  try {
    if (Store && typeof Store === "object") {
      Store.entities = safeObject(Store.entities);
      Store.entities.incidencias = list;
      return true;
    }
  } catch {}

  return false;
}

function writeStoreCollection(items = []) {
  const list = cloneArray(items);

  let wrote = false;

  wrote = writeViaSet(STORE_PATH, list) || wrote;
  wrote = writeViaSet(STORE_COLLECTION_KEY, list) || wrote;
  wrote = writeViaSet(`collections.${STORE_COLLECTION_KEY}`, list) || wrote;
  wrote = writeViaActions(list) || wrote;
  wrote = writeDirectFallback(list) || wrote;

  return list;
}

/* =========================================================
   NORMALIZE / MERGE COLLECTION
========================================================= */

function mergeRaw(base = {}, patch = {}) {
  const baseRaw = safeObject(base.raw);
  const patchRaw = safeObject(patch.raw);

  if (!Object.keys(baseRaw).length && !Object.keys(patchRaw).length) {
    return undefined;
  }

  return {
    ...baseRaw,
    ...patchRaw,
  };
}

function mergeIncidencia(base = {}, patch = {}) {
  const current = safeObject(base);
  const incoming = safeObject(patch);

  const raw = mergeRaw(current, incoming);

  const merged = {
    ...current,
    ...incoming,
  };

  if (raw) {
    merged.raw = raw;
  }

  return merged;
}

function dedupeIncidencias(items = []) {
  const list = safeArray(items);
  const map = new Map();
  const aliasIndex = new Map();
  const anonymous = [];

  for (const rawItem of list) {
    const item = safeObject(rawItem);
    const primaryId = getItemId(item);

    if (!primaryId) {
      anonymous.push(item);
      continue;
    }

    const existingKey = findExistingKeyForItem(aliasIndex, item);
    const finalKey = existingKey || primaryId;

    if (!map.has(finalKey)) {
      map.set(finalKey, item);
      registerAliases(aliasIndex, finalKey, item);
      continue;
    }

    const current = map.get(finalKey);
    const merged = mergeIncidencia(current, item);

    map.set(finalKey, merged);
    registerAliases(aliasIndex, finalKey, merged);
  }

  return [...map.values(), ...anonymous];
}

function normalizeCollection(items = [], { sort = true } = {}) {
  const deduped = dedupeIncidencias(cloneArray(items));

  if (!sort) {
    return deduped;
  }

  return sortIncidenciasByUpdatedDesc(deduped);
}

/* =========================================================
   GETTERS
========================================================= */

export function getIncidencias() {
  return normalizeCollection(readStoreCollection());
}

export function getIncidenciasStore() {
  return getIncidencias();
}

export function getSortedIncidenciasStore() {
  return sortIncidenciasByUpdatedDesc(getIncidencias());
}

export function getIncidenciaById(id = "") {
  const target = safeId(id);

  if (!target) {
    return null;
  }

  const items = getIncidencias();

  return items.find((item) => isSameItemId(item, target)) || null;
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
  return {
    items: getIncidencias(),
    count: getIncidenciasCount(),
    hasItems: hasIncidencias(),
    lastReadAt: new Date().toISOString(),
  };
}

/* =========================================================
   SETTERS
========================================================= */

export function setIncidencias(items = []) {
  const next = normalizeCollection(items);
  writeStoreCollection(next);
  return next;
}

export function setIncidenciasStore(items = []) {
  return setIncidencias(items);
}

export function replaceIncidenciasStore(items = []) {
  return setIncidencias(items);
}

export function clearIncidencias() {
  return setIncidencias([]);
}

export function clearIncidenciasStore() {
  return clearIncidencias();
}

export function appendIncidenciaStore(item = null) {
  if (!item) {
    return getIncidencias();
  }

  const current = getIncidencias();
  const next = normalizeCollection([safeObject(item), ...current]);

  writeStoreCollection(next);

  return next;
}

export function updateIncidenciaStore(id = "", patch = {}) {
  const target = safeId(id);

  if (!target) {
    return getIncidencias();
  }

  const current = getIncidencias();
  let found = false;

  const next = current.map((item) => {
    if (!isSameItemId(item, target)) {
      return item;
    }

    found = true;

    return mergeIncidencia(item, {
      ...safeObject(patch),
      id: safeText(first(safeObject(patch).id, safeObject(patch).ticketId, item.id), item.id),
      ticketId: safeText(
        first(safeObject(patch).ticketId, safeObject(patch).id, item.ticketId),
        item.ticketId
      ),
    });
  });

  const normalized = normalizeCollection(next);

  writeStoreCollection(normalized);

  return found ? normalized : current;
}

/* =========================================================
   UPSERT
========================================================= */

export function upsertIncidenciaStore(item = null) {
  if (!item) {
    return getIncidencias();
  }

  const incoming = safeObject(item);
  const current = getIncidencias();
  const incomingIds = getItemCandidateIds(incoming);

  if (!incomingIds.length) {
    const next = normalizeCollection([incoming, ...current]);
    writeStoreCollection(next);
    return next;
  }

  let found = false;

  const next = current.map((row) => {
    const matches = incomingIds.some((id) => hasCandidateId(row, id));

    if (!matches) {
      return row;
    }

    found = true;
    return mergeIncidencia(row, incoming);
  });

  const finalItems = found
    ? normalizeCollection(next)
    : normalizeCollection([incoming, ...current]);

  writeStoreCollection(finalItems);

  return finalItems;
}

export function upsertManyIncidenciasStore(items = []) {
  const incoming = safeArray(items);

  if (!incoming.length) {
    return getIncidencias();
  }

  let next = getIncidencias();

  incoming.forEach((item) => {
    const current = next;
    const row = safeObject(item);
    const ids = getItemCandidateIds(row);

    if (!ids.length) {
      next = normalizeCollection([row, ...current]);
      return;
    }

    let found = false;

    next = current.map((existing) => {
      const matches = ids.some((id) => hasCandidateId(existing, id));

      if (!matches) {
        return existing;
      }

      found = true;
      return mergeIncidencia(existing, row);
    });

    if (!found) {
      next = [row, ...next];
    }

    next = normalizeCollection(next);
  });

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   REMOVE
========================================================= */

export function removeIncidenciaStore(id = "") {
  const target = safeId(id);

  if (!target) {
    return getIncidencias();
  }

  const next = getIncidencias().filter(
    (item) => !isSameItemId(item, target)
  );

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   SORT HELPERS
========================================================= */

export function sortIncidenciasByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getUpdatedTimestamp(a);
    const bTime = getUpdatedTimestamp(b);

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return safeText(getItemId(b)).localeCompare(safeText(getItemId(a)));
  });
}

export function sortIncidenciasByCreatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getCreatedTimestamp(a);
    const bTime = getCreatedTimestamp(b);

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return safeText(getItemId(b)).localeCompare(safeText(getItemId(a)));
  });
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

export function filterIncidenciasStore(predicate = null) {
  const items = getIncidencias();

  if (typeof predicate !== "function") {
    return items;
  }

  return items.filter(predicate);
}

export function mapIncidenciasStore(mapper = null) {
  const items = getIncidencias();

  if (typeof mapper !== "function") {
    return items;
  }

  return items.map(mapper);
}

export function patchIncidenciaStore(id = "", patch = {}) {
  return updateIncidenciaStore(id, patch);
}

/* =========================================================
   DEBUG
========================================================= */

export function getIncidenciasStoreDebugSnapshot() {
  const items = getIncidencias();

  return {
    path: STORE_PATH,
    collectionKey: STORE_COLLECTION_KEY,
    count: items.length,
    ids: items.map(getItemId).filter(Boolean),
    lastUpdatedAt: items[0]?.updatedAt || items[0]?.raw?.updatedAt || null,
    items,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_PATH,
  STORE_COLLECTION_KEY,

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

  sortIncidenciasByUpdatedDesc,
  sortIncidenciasByCreatedDesc,

  getItemId,
  getItemCandidateIds,
  getIncidenciasStoreDebugSnapshot,
};
