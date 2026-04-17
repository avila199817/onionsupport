/* =========================================================
   Onion SPA - Cuenta Store
   Archivo: src/views/cuenta/cuenta.store.js

   FINAL PRO SYSTEM · STORE LAYER · 10/10

   RESPONSABILIDADES:
   - encapsular Store global
   - leer / escribir recurso único cuenta
   - helpers para API / View / Actions / Modal
   - búsquedas robustas por id lógico
   - replace / update / upsert
   - persistencia estable para modal / bindings / view

   HARDENING PRO:
   - añadido upsertCuentaStore
   - normalización de ids lógicos
   - soporta single resource + fallback colección
   - no muta estructuras originales
   - ordenación consistente por updatedAt
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_PATH = "entities.cuenta";
const STORE_COLLECTION_PATH = "entities.cuentaItems";
const STORE_KEY = "cuenta";
const STORE_COLLECTION_KEY = "cuentaItems";
const DEFAULT_RESOURCE_ID = "cuenta";

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

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
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

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

/* =========================================================
   ID HELPERS
========================================================= */

export function getCuentaItemId(item = {}) {
  const row = safeObject(item);

  return safeId(
    first(
      row.resourceId,
      row.userId,
      row.accountId,
      row.id,
      DEFAULT_RESOURCE_ID
    )
  );
}

function isSameCuentaItemId(item = {}, id = "") {
  const target = safeId(id);

  if (!target) return false;

  const row = safeObject(item);

  return (
    getCuentaItemId(row) === target ||
    safeId(row.resourceId) === target ||
    safeId(row.userId) === target ||
    safeId(row.accountId) === target ||
    safeId(row.id) === target
  );
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeCuentaItem(item = {}) {
  const row = safeObject(item);

  const darkMode =
    typeof row.darkMode === "boolean"
      ? row.darkMode
      : typeof row.theme === "string"
      ? String(row.theme).toLowerCase() === "dark"
      : true;

  const privacyMode =
    typeof row.privacyMode === "boolean"
      ? row.privacyMode
      : false;

  return {
    ...row,
    id: safeText(
      first(row.id, row.resourceId, DEFAULT_RESOURCE_ID),
      DEFAULT_RESOURCE_ID
    ),
    resourceId: safeText(
      first(row.resourceId, row.userId, row.accountId, row.id, DEFAULT_RESOURCE_ID),
      DEFAULT_RESOURCE_ID
    ),
    darkMode,
    privacyMode,
    theme: darkMode ? "dark" : "light",
    updatedAt: safeText(
      first(row.updatedAt, row.updated_at),
      ""
    ),
  };
}

function mergeCuenta(base = {}, patch = {}) {
  const current = normalizeCuentaItem(base);
  const incoming = safeObject(patch);

  const next = {
    ...current,
    ...incoming,
  };

  if (typeof incoming.darkMode !== "boolean" && typeof incoming.theme === "string") {
    next.darkMode = String(incoming.theme).toLowerCase() === "dark";
  } else if (typeof incoming.darkMode === "boolean") {
    next.darkMode = incoming.darkMode;
  } else {
    next.darkMode = current.darkMode;
  }

  if (typeof incoming.privacyMode === "boolean") {
    next.privacyMode = incoming.privacyMode;
  } else {
    next.privacyMode = current.privacyMode;
  }

  next.theme = next.darkMode ? "dark" : "light";
  next.resourceId = safeText(
    first(
      next.resourceId,
      next.userId,
      next.accountId,
      next.id,
      DEFAULT_RESOURCE_ID
    ),
    DEFAULT_RESOURCE_ID
  );

  next.id = safeText(
    first(next.id, next.resourceId, DEFAULT_RESOURCE_ID),
    DEFAULT_RESOURCE_ID
  );

  next.updatedAt = safeText(
    first(next.updatedAt, next.updated_at, current.updatedAt),
    safeText(current.updatedAt, "")
  );

  return next;
}

function normalizeCollection(items = []) {
  return dedupeCuentaItems(
    safeArray(items).map(normalizeCuentaItem)
  );
}

function dedupeCuentaItems(items = []) {
  const list = safeArray(items);
  const map = new Map();
  const anonymous = [];

  for (const rawItem of list) {
    const item = normalizeCuentaItem(rawItem);
    const id = getCuentaItemId(item);

    if (!id) {
      anonymous.push(item);
      continue;
    }

    if (!map.has(id)) {
      map.set(id, item);
      continue;
    }

    const current = map.get(id);
    map.set(id, mergeCuenta(current, item));
  }

  return [...map.values(), ...anonymous];
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
      row.updated_at ??
      row.lastUpdate ??
      row.modifiedAt ??
      0,
    0
  );
}

/* =========================================================
   LOW LEVEL STORE ACCESS
========================================================= */

function readStoreItem() {
  try {
    if (typeof Store?.get === "function") {
      const value = Store.get(STORE_PATH);

      if (value && typeof value === "object" && !Array.isArray(value)) {
        return normalizeCuentaItem(value);
      }
    }
  } catch {}

  return null;
}

function writeStoreItem(item = null) {
  const value = item ? normalizeCuentaItem(item) : null;

  try {
    if (Store?.actions?.set) {
      Store.actions.set(STORE_KEY, value);
      return value;
    }
  } catch {}

  try {
    if (typeof Store?.set === "function") {
      Store.set(STORE_PATH, value);
      return value;
    }
  } catch {}

  return value;
}

function readStoreCollection() {
  try {
    if (typeof Store?.get === "function") {
      return normalizeCollection(
        Store.get(STORE_COLLECTION_PATH)
      );
    }
  } catch {}

  return [];
}

function writeStoreCollection(items = []) {
  const list = normalizeCollection(items);

  try {
    if (Store?.actions?.setCollection) {
      Store.actions.setCollection(STORE_COLLECTION_KEY, list);
      return list;
    }
  } catch {}

  try {
    if (typeof Store?.set === "function") {
      Store.set(STORE_COLLECTION_PATH, list);
      return list;
    }
  } catch {}

  return list;
}

/* =========================================================
   GETTERS
========================================================= */

export function getCuentaStore() {
  return readStoreItem();
}

export function getCuentaByIdStore(id = DEFAULT_RESOURCE_ID) {
  const target = safeId(id);

  if (!target) {
    return getCuentaStore();
  }

  const item = getCuentaStore();

  if (item && isSameCuentaItemId(item, target)) {
    return item;
  }

  const list = getCuentasStore();

  return list.find((row) => isSameCuentaItemId(row, target)) || null;
}

export function getCuentaById(id = DEFAULT_RESOURCE_ID) {
  return getCuentaByIdStore(id);
}

export function hasCuentaStore() {
  return Boolean(getCuentaStore());
}

export function getCuentasStore() {
  const item = getCuentaStore();
  const list = readStoreCollection();

  if (item) {
    return dedupeCuentaItems([item, ...list]);
  }

  return normalizeCollection(list);
}

export function getSortedCuentasStore() {
  return sortCuentasByUpdatedDesc(
    getCuentasStore()
  );
}

export function getCuentasCount() {
  return getCuentasStore().length;
}

/* =========================================================
   SETTERS
========================================================= */

export function setCuentaStore(item = null) {
  const normalized = item ? normalizeCuentaItem(item) : null;

  writeStoreItem(normalized);

  if (normalized) {
    const currentList = readStoreCollection();
    const nextList = upsertIntoCollection(currentList, normalized);
    writeStoreCollection(nextList);
  }

  return normalized;
}

export function replaceCuentaStore(item = null) {
  return setCuentaStore(item);
}

export function clearCuentaStore() {
  writeStoreItem(null);
  writeStoreCollection([]);
  return null;
}

export function setCuentasStore(items = []) {
  const next = normalizeCollection(items);
  writeStoreCollection(next);

  if (next.length > 0) {
    writeStoreItem(next[0]);
  }

  return next;
}

export function replaceCuentasStore(items = []) {
  return setCuentasStore(items);
}

/* =========================================================
   UPDATE / UPSERT
========================================================= */

function upsertIntoCollection(collection = [], item = null) {
  const incoming = item ? normalizeCuentaItem(item) : null;
  const current = normalizeCollection(collection);

  if (!incoming) {
    return current;
  }

  const targetId = getCuentaItemId(incoming);

  if (!targetId) {
    return normalizeCollection([incoming, ...current]);
  }

  const index = current.findIndex(
    (row) => getCuentaItemId(row) === targetId
  );

  let next = [];

  if (index === -1) {
    next = normalizeCollection([incoming, ...current]);
  } else {
    next = [...current];
    next[index] = mergeCuenta(next[index], incoming);
    next = normalizeCollection(next);
  }

  return next;
}

export function updateCuentaStore(id = DEFAULT_RESOURCE_ID, patch = {}) {
  const target = safeId(id);

  if (!target) {
    return getCuentaStore();
  }

  const currentItem = getCuentaByIdStore(target);

  if (!currentItem) {
    const fallback = mergeCuenta(
      { resourceId: target, id: target },
      patch
    );

    setCuentaStore(fallback);
    return fallback;
  }

  const nextItem = mergeCuenta(currentItem, patch);

  writeStoreItem(nextItem);

  const nextList = upsertIntoCollection(
    readStoreCollection(),
    nextItem
  );

  writeStoreCollection(nextList);

  return nextItem;
}

export function upsertCuentaStore(item = null) {
  if (!item) {
    return getCuentaStore();
  }

  const incoming = normalizeCuentaItem(item);
  const targetId = getCuentaItemId(incoming);

  if (!targetId) {
    setCuentaStore(incoming);
    return incoming;
  }

  const current = getCuentaByIdStore(targetId);

  const nextItem = current
    ? mergeCuenta(current, incoming)
    : incoming;

  writeStoreItem(nextItem);

  const nextList = upsertIntoCollection(
    readStoreCollection(),
    nextItem
  );

  writeStoreCollection(nextList);

  return nextItem;
}

/* =========================================================
   REMOVE
========================================================= */

export function removeCuentaStore(id = DEFAULT_RESOURCE_ID) {
  const target = safeId(id);

  if (!target) {
    return getCuentaStore();
  }

  const currentItem = getCuentaStore();

  if (currentItem && isSameCuentaItemId(currentItem, target)) {
    writeStoreItem(null);
  }

  const nextList = getCuentasStore().filter(
    (item) => !isSameCuentaItemId(item, target)
  );

  writeStoreCollection(nextList);

  const fallback = nextList[0] || null;
  writeStoreItem(fallback);

  return fallback;
}

/* =========================================================
   HELPERS
========================================================= */

export function sortCuentasByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getUpdatedTimestamp(a);
    const bTime = getUpdatedTimestamp(b);

    return bTime - aTime;
  });
}

export function sortCuentasBySecurityDesc(items = []) {
  const weight = {
    hardened: 3,
    privacy: 2,
    standard: 1,
  };

  return [...safeArray(items)].sort((a, b) => {
    const aStatus = safeText(
      safeObject(a).status,
      "standard"
    ).toLowerCase();

    const bStatus = safeText(
      safeObject(b).status,
      "standard"
    ).toLowerCase();

    return (weight[bStatus] || 0) - (weight[aStatus] || 0);
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getCuentaStore,
  getCuentaByIdStore,
  getCuentaById,
  hasCuentaStore,

  getCuentasStore,
  getSortedCuentasStore,
  getCuentasCount,

  setCuentaStore,
  replaceCuentaStore,
  clearCuentaStore,

  setCuentasStore,
  replaceCuentasStore,

  updateCuentaStore,
  upsertCuentaStore,
  removeCuentaStore,

  sortCuentasByUpdatedDesc,
  sortCuentasBySecurityDesc,

  getCuentaItemId,
};
