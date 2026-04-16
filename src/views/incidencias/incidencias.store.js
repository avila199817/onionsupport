/* =========================================================
   Onion SPA - Incidencias Store
   Archivo: src/views/incidencias/incidencias.store.js

   FINAL PRO SYSTEM · STORE LAYER · 10/10

   RESPONSABILIDADES:
   - encapsular Store global
   - leer / escribir colección incidencias
   - helpers para API / View / Actions
   - búsquedas robustas por id
   - replace / append / update / upsert
   - deduplicación segura
   - persistencia estable para detalle modal

   HARDENING PRO:
   - añadido upsertIncidenciaStore
   - normalización de ids
   - evita duplicados
   - no muta colecciones originales
   - ordenación consistente por updatedAt
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_PATH = "entities.incidencias";
const STORE_COLLECTION_KEY = "incidencias";

/* =========================================================
   SAFE
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

function safeTimestamp(value, fallback = 0) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    return n;
  }

  const date = new Date(value);
  const ts = date.getTime();

  return Number.isFinite(ts) ? ts : fallback;
}

/* =========================================================
   ID HELPERS
========================================================= */

export function getItemId(item = {}) {
  const row = safeObject(item);

  return safeId(
    row.ticketId ||
      row.id ||
      row.code ||
      row.ticketCode
  );
}

function isSameItemId(item = {}, id = "") {
  const target = safeId(id);
  if (!target) return false;

  const row = safeObject(item);

  return (
    getItemId(row) === target ||
    safeId(row.id) === target ||
    safeId(row.ticketId) === target ||
    safeId(row.code) === target ||
    safeId(row.ticketCode) === target
  );
}

/* =========================================================
   TIMESTAMP HELPERS
========================================================= */

function getUpdatedTimestamp(item = {}) {
  const row = safeObject(item);

  return safeTimestamp(
    row.updatedAtMs ??
      row.updatedAtTs ??
      row.meta?.timestampMs ??
      row.meta?.updatedAtMs ??
      row.updatedAt ??
      row.closedAt ??
      row.modifiedAt ??
      row.lastUpdate ??
      row.createdAt ??
      0,
    0
  );
}

/* =========================================================
   LOW LEVEL STORE ACCESS
========================================================= */

function readStoreCollection() {
  try {
    if (typeof Store?.get === "function") {
      return safeArray(Store.get(STORE_PATH));
    }
  } catch {}

  return [];
}

function writeStoreCollection(items = []) {
  const list = safeArray(items);

  try {
    if (Store?.actions?.setCollection) {
      Store.actions.setCollection(STORE_COLLECTION_KEY, list);
      return list;
    }
  } catch {}

  try {
    if (typeof Store?.set === "function") {
      Store.set(STORE_PATH, list);
      return list;
    }
  } catch {}

  return list;
}

/* =========================================================
   NORMALIZE COLLECTION
========================================================= */

function mergeIncidencia(base = {}, patch = {}) {
  return {
    ...safeObject(base),
    ...safeObject(patch),
  };
}

function dedupeIncidencias(items = []) {
  const list = safeArray(items);
  const map = new Map();
  const anonymous = [];

  for (const rawItem of list) {
    const item = safeObject(rawItem);
    const id = getItemId(item);

    if (!id) {
      anonymous.push(item);
      continue;
    }

    if (!map.has(id)) {
      map.set(id, item);
      continue;
    }

    const current = map.get(id);
    map.set(id, mergeIncidencia(current, item));
  }

  return [...map.values(), ...anonymous];
}

function normalizeCollection(items = []) {
  return dedupeIncidencias(safeArray(items));
}

/* =========================================================
   GETTERS
========================================================= */

export function getIncidencias() {
  return normalizeCollection(readStoreCollection());
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

/* =========================================================
   SETTERS
========================================================= */

export function setIncidencias(items = []) {
  const next = normalizeCollection(items);
  writeStoreCollection(next);
  return next;
}

export function replaceIncidenciasStore(items = []) {
  return setIncidencias(items);
}

export function clearIncidencias() {
  return setIncidencias([]);
}

export function appendIncidenciaStore(item = null) {
  if (!item) {
    return getIncidencias();
  }

  const current = getIncidencias();
  const next = normalizeCollection([...current, safeObject(item)]);

  writeStoreCollection(next);

  return next;
}

export function updateIncidenciaStore(id = "", patch = {}) {
  const target = safeId(id);

  if (!target) {
    return getIncidencias();
  }

  const current = getIncidencias();

  const next = current.map((item) =>
    isSameItemId(item, target)
      ? mergeIncidencia(item, patch)
      : item
  );

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   UPSERT
========================================================= */

export function upsertIncidenciaStore(item = null) {
  if (!item) {
    return getIncidencias();
  }

  const incoming = safeObject(item);
  const targetId = getItemId(incoming);
  const current = getIncidencias();

  if (!targetId) {
    const next = normalizeCollection([incoming, ...current]);
    writeStoreCollection(next);
    return next;
  }

  const index = current.findIndex((row) => getItemId(row) === targetId);

  let next = [];

  if (index === -1) {
    next = normalizeCollection([incoming, ...current]);
  } else {
    next = [...current];
    next[index] = mergeIncidencia(next[index], incoming);
    next = normalizeCollection(next);
  }

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
   HELPERS
========================================================= */

export function sortIncidenciasByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getUpdatedTimestamp(a);
    const bTime = getUpdatedTimestamp(b);

    return bTime - aTime;
  });
}

export function sortIncidenciasByCreatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = safeTimestamp(
      safeObject(a).createdAt ??
        safeObject(a).createdAtMs ??
        0,
      0
    );

    const bTime = safeTimestamp(
      safeObject(b).createdAt ??
        safeObject(b).createdAtMs ??
        0,
      0
    );

    return bTime - aTime;
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getIncidencias,
  getSortedIncidenciasStore,
  getIncidenciaById,
  getIncidenciaByIdStore,
  hasIncidencias,
  getIncidenciasCount,

  setIncidencias,
  replaceIncidenciasStore,
  appendIncidenciaStore,
  updateIncidenciaStore,
  upsertIncidenciaStore,
  removeIncidenciaStore,
  clearIncidencias,

  sortIncidenciasByUpdatedDesc,
  sortIncidenciasByCreatedDesc,

  getItemId,
};
