/* =========================================================
   Onion SPA - Facturas Store
   Archivo: src/views/facturas/facturas.store.js

   Responsabilidades:
   - centralizar el acceso al Store del módulo de facturas
   - leer y escribir la colección normalizada
   - exponer helpers de consulta por id y ordenación
   - aislar la vista del shape interno del Store
========================================================= */

import { Store } from "../../store/index.js";
import { safeArray, safeText } from "./facturas.utils.js";

const FACTURAS_STORE_PATH = "entities.facturas";
const FACTURAS_COLLECTION_NAME = "facturas";

function safeGet(path, fallback = []) {
  try {
    if (typeof Store?.get === "function") {
      return Store.get(path) ?? fallback;
    }
  } catch {
    /* noop */
  }

  return fallback;
}

function safeSet(path, value) {
  try {
    if (typeof Store?.set === "function") {
      Store.set(path, value);
      return true;
    }
  } catch {
    /* noop */
  }

  return false;
}

function safeSetCollection(name, value) {
  try {
    if (typeof Store?.actions?.setCollection === "function") {
      Store.actions.setCollection(name, value);
      return true;
    }
  } catch {
    /* noop */
  }

  return false;
}

export function getFacturasStore() {
  return safeArray(safeGet(FACTURAS_STORE_PATH, []));
}

export function getSortedFacturasStore({
  sortBy = "timestampMs",
  direction = "desc",
} = {}) {
  const factor = direction === "asc" ? 1 : -1;
  const items = [...getFacturasStore()];

  items.sort((a, b) => {
    if (sortBy === "timestampMs") {
      return ((a?.meta?.timestampMs || 0) - (b?.meta?.timestampMs || 0)) * factor;
    }

    if (sortBy === "fecha") {
      return (
        (new Date(a?.fecha || 0).getTime() - new Date(b?.fecha || 0).getTime()) *
        factor
      );
    }

    if (sortBy === "updatedAt") {
      return (
        (new Date(a?.updatedAt || 0).getTime() -
          new Date(b?.updatedAt || 0).getTime()) *
        factor
      );
    }

    if (sortBy === "total") {
      return ((Number(a?.total) || 0) - (Number(b?.total) || 0)) * factor;
    }

    return (
      safeText(a?.[sortBy], "").localeCompare(safeText(b?.[sortBy], ""), "es") *
      factor
    );
  });

  return items;
}

export function getFacturaByIdStore(id = "") {
  const facturaId = safeText(id, "");
  if (!facturaId) return null;

  return (
    getFacturasStore().find((item) => String(item?.id) === String(facturaId)) || null
  );
}

export function hasFacturasStore() {
  return getFacturasStore().length > 0;
}

export function countFacturasStore() {
  return getFacturasStore().length;
}

export function setFacturasStore(items = []) {
  const normalized = safeArray(items);

  if (safeSetCollection(FACTURAS_COLLECTION_NAME, normalized)) {
    return true;
  }

  return safeSet(FACTURAS_STORE_PATH, normalized);
}

export function appendFacturasStore(items = []) {
  const nextItems = [...getFacturasStore(), ...safeArray(items)];
  return setFacturasStore(nextItems);
}

export function upsertFacturaStore(factura = null) {
  if (!factura || !factura.id) return false;

  const current = getFacturasStore();
  const index = current.findIndex((item) => String(item?.id) === String(factura.id));

  if (index === -1) {
    current.unshift(factura);
  } else {
    current[index] = factura;
  }

  return setFacturasStore(current);
}

export function removeFacturaByIdStore(id = "") {
  const facturaId = safeText(id, "");
  if (!facturaId) return false;

  const filtered = getFacturasStore().filter(
    (item) => String(item?.id) !== String(facturaId)
  );

  return setFacturasStore(filtered);
}

export function clearFacturasStore() {
  return setFacturasStore([]);
}
