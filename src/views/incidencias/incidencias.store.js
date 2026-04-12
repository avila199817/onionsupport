/* =========================================================
   Onion SPA - Incidencias Store
   Archivo: src/views/incidencias/incidencias.store.js

   Responsabilidades:
   - encapsular acceso al Store global
   - leer colección incidencias
   - escribir colección incidencias
   - aislar compatibilidad Store.actions / Store.set
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   GETTERS
========================================================= */

export function getIncidencias() {
  return Store.get("entities.incidencias") || [];
}

export function getIncidenciaById(id) {
  if (!id) return null;

  const items = getIncidencias();

  return (
    items.find(
      (item) =>
        String(item?.id ?? "") === String(id) ||
        String(item?.ticketId ?? "") === String(id)
    ) || null
  );
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
  const safeItems = Array.isArray(items) ? items : [];

  if (Store?.actions?.setCollection) {
    Store.actions.setCollection("incidencias", safeItems);
    return;
  }

  if (Store?.set) {
    Store.set("entities.incidencias", safeItems);
  }
}

export function clearIncidencias() {
  setIncidencias([]);
}

/* =========================================================
   HELPERS
========================================================= */

export function sortIncidenciasByUpdatedDesc(items = []) {
  return [...items].sort(
    (a, b) => (b?.meta?.timestampMs || 0) - (a?.meta?.timestampMs || 0)
  );
}
