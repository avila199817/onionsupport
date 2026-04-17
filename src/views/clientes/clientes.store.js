/* =========================================================
   Onion SPA - Clientes Store
   Archivo: src/views/clientes/clientes.store.js

   FINAL PRO SYSTEM · STORE LAYER · 10/10

   RESPONSABILIDADES:
   - encapsular Store global
   - leer / escribir colección clientes
   - helpers para API / View / Actions
   - búsquedas robustas por id
   - replace / append / update / upsert
   - deduplicación segura
   - persistencia estable para detalle modal

   HARDENING PRO:
   - añadido upsertClienteStore
   - normalización de ids
   - evita duplicados
   - no muta colecciones originales
   - ordenación consistente por updatedAt
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_PATH = "entities.clientes";
const STORE_COLLECTION_KEY = "clientes";

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
    row.clientId ||
      row.clienteId ||
      row.id ||
      row.code ||
      row.clientCode ||
      row.clienteCode
  );
}

function isSameItemId(item = {}, id = "") {
  const target = safeId(id);
  if (!target) return false;

  const row = safeObject(item);

  return (
    getItemId(row) === target ||
    safeId(row.id) === target ||
    safeId(row.clientId) === target ||
    safeId(row.clienteId) === target ||
    safeId(row.code) === target ||
    safeId(row.clientCode) === target ||
    safeId(row.clienteCode) === target
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
      row.modifiedAt ??
      row.lastUpdate ??
      row.lastContactAt ??
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

function mergeCliente(base = {}, patch = {}) {
  return {
    ...safeObject(base),
    ...safeObject(patch),
  };
}

function dedupeClientes(items = []) {
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
    map.set(id, mergeCliente(current, item));
  }

  return [...map.values(), ...anonymous];
}

function normalizeCollection(items = []) {
  return dedupeClientes(safeArray(items));
}

/* =========================================================
   GETTERS
========================================================= */

export function getClientes() {
  return normalizeCollection(readStoreCollection());
}

export function getSortedClientesStore() {
  return sortClientesByUpdatedDesc(getClientes());
}

export function getClienteById(id = "") {
  const target = safeId(id);

  if (!target) {
    return null;
  }

  const items = getClientes();

  return items.find((item) => isSameItemId(item, target)) || null;
}

export function getClienteByIdStore(id = "") {
  return getClienteById(id);
}

export function hasClientes() {
  return getClientes().length > 0;
}

export function getClientesCount() {
  return getClientes().length;
}

/* =========================================================
   SETTERS
========================================================= */

export function setClientes(items = []) {
  const next = normalizeCollection(items);
  writeStoreCollection(next);
  return next;
}

export function replaceClientesStore(items = []) {
  return setClientes(items);
}

export function clearClientes() {
  return setClientes([]);
}

export function appendClienteStore(item = null) {
  if (!item) {
    return getClientes();
  }

  const current = getClientes();
  const next = normalizeCollection([...current, safeObject(item)]);

  writeStoreCollection(next);

  return next;
}

export function updateClienteStore(id = "", patch = {}) {
  const target = safeId(id);

  if (!target) {
    return getClientes();
  }

  const current = getClientes();

  const next = current.map((item) =>
    isSameItemId(item, target)
      ? mergeCliente(item, patch)
      : item
  );

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   UPSERT
========================================================= */

export function upsertClienteStore(item = null) {
  if (!item) {
    return getClientes();
  }

  const incoming = safeObject(item);
  const targetId = getItemId(incoming);
  const current = getClientes();

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
    next[index] = mergeCliente(next[index], incoming);
    next = normalizeCollection(next);
  }

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   REMOVE
========================================================= */

export function removeClienteStore(id = "") {
  const target = safeId(id);

  if (!target) {
    return getClientes();
  }

  const next = getClientes().filter(
    (item) => !isSameItemId(item, target)
  );

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   HELPERS
========================================================= */

export function sortClientesByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getUpdatedTimestamp(a);
    const bTime = getUpdatedTimestamp(b);

    return bTime - aTime;
  });
}

export function sortClientesByCreatedDesc(items = []) {
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
  getClientes,
  getSortedClientesStore,
  getClienteById,
  getClienteByIdStore,
  hasClientes,
  getClientesCount,

  setClientes,
  replaceClientesStore,
  appendClienteStore,
  updateClienteStore,
  upsertClienteStore,
  removeClienteStore,
  clearClientes,

  sortClientesByUpdatedDesc,
  sortClientesByCreatedDesc,

  getItemId,
};
