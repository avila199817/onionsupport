import { Store } from "../../store/index.js";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getFacturasStore() {
  try {
    return safeArray(Store?.get?.("entities.facturas", []));
  } catch {
    return [];
  }
}

export function getSortedFacturasStore() {
  return [...getFacturasStore()].sort(
    (a, b) => (b.meta?.timestampMs || 0) - (a.meta?.timestampMs || 0)
  );
}

export function getFacturaByIdStore(id = "") {
  return (
    getFacturasStore().find((item) => String(item?.id) === String(id)) || null
  );
}

export function setFacturasStore(items = []) {
  try {
    if (typeof Store?.actions?.setCollection === "function") {
      Store.actions.setCollection("facturas", items);
      return true;
    }
  } catch {}

  try {
    if (typeof Store?.set === "function") {
      Store.set("entities.facturas", items);
      return true;
    }
  } catch {}

  return false;
}
