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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

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
  return safeArray(safeGet("entities.facturas", []));
}

export function getSortedFacturasStore() {
  return [...getFacturasStore()].sort(
    (a, b) => (b?.meta?.timestampMs || 0) - (a?.meta?.timestampMs || 0)
  );
}

export function getFacturaByIdStore(id = "") {
  const facturaId = safeText(id, "");
  if (!facturaId) return null;

  return (
    getFacturasStore().find((item) => String(item?.id) === String(facturaId)) || null
  );
}

export function setFacturasStore(items = []) {
  const normalized = safeArray(items);

  if (safeSetCollection("facturas", normalized)) {
    return true;
  }

  return safeSet("entities.facturas", normalized);
}

export function clearFacturasStore() {
  return setFacturasStore([]);
}
