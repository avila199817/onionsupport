/* =========================================================
   Onion SPA - Facturas Store
   Archivo: src/views/facturas/facturas.store.js

   RESPONSABILIDADES:
   - centralizar el acceso al Store del módulo de facturas
   - leer y escribir la colección normalizada
   - exponer helpers de consulta por id y ordenación
   - aislar la vista del shape interno del Store
   - mantener paridad operativa con facturasView / facturas.model

   HARDENING PRO:
   - lectura tolerante a múltiples shapes del Store
   - escritura consistente por path y colección
   - sort robusto sin mutar origen
   - upsert por id / _id / facturaId
   - deduplicación defensiva al append
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

function getFacturaStoreId(item = {}) {
  const source = safeObject(item);

  return safeText(
    first(
      source.id,
      source._id,
      source.facturaId
    ),
    ""
  );
}

function normalizeFacturaCollection(items = []) {
  return safeArray(items)
    .map((item) => normalizeFactura(item))
    .filter((item) => Boolean(getFacturaStoreId(item)));
}

function dedupeFacturas(items = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const normalized = normalizeFactura(item);
    const id = getFacturaStoreId(normalized);

    if (!id) continue;

    map.set(id, normalized);
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

  return [];
}

function compareText(a, b) {
  return safeText(a, "").localeCompare(safeText(b, ""), "es");
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
  const raw =
    safeGet(FACTURAS_STORE_PATH, null) ??
    safeGet(FACTURAS_COLLECTION_NAME, null);

  const collection = resolveStoreCollectionShape(raw);

  return normalizeFacturaCollection(collection);
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
  if (!facturaId) return null;

  return (
    getFacturasStore().find(
      (item) => getFacturaStoreId(item) === facturaId
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
  const normalized = dedupeFacturas(items);

  if (safeSetCollection(FACTURAS_COLLECTION_NAME, normalized)) {
    safeSet(FACTURAS_STORE_PATH, normalized);
    return true;
  }

  return safeSet(FACTURAS_STORE_PATH, normalized);
}

export function appendFacturasStore(items = []) {
  const merged = dedupeFacturas([
    ...getFacturasStore(),
    ...safeArray(items),
  ]);

  return setFacturasStore(merged);
}

export function upsertFacturaStore(factura = null) {
  const normalized = normalizeFactura(factura);
  const facturaId = getFacturaStoreId(normalized);

  if (!facturaId) return false;

  const current = [...getFacturasStore()];
  const index = current.findIndex(
    (item) => getFacturaStoreId(item) === facturaId
  );

  if (index === -1) {
    current.unshift(normalized);
  } else {
    current[index] = {
      ...current[index],
      ...normalized,
    };
  }

  return setFacturasStore(current);
}

export function removeFacturaByIdStore(id = "") {
  const facturaId = safeText(id, "");
  if (!facturaId) return false;

  const filtered = getFacturasStore().filter(
    (item) => getFacturaStoreId(item) !== facturaId
  );

  return setFacturasStore(filtered);
}

export function clearFacturasStore() {
  return setFacturasStore([]);
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
};
