/* =========================================================
   Onion SPA - Incidencias Store
   Archivo: src/views/incidencias/incidencias.store.js

   Responsabilidades:
   - encapsular Store global
   - leer / escribir colección incidencias
   - helpers para API / View / Actions
   - búsquedas robustas por id

   FIX CRÍTICO:
   - añadido upsertIncidenciaStore
   - normalización de ids
   - evita duplicados
   - detalle modal persistente
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   SAFE
========================================================= */

function safeArray(
  value
) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeId(
  value
) {
  return String(
    value ?? ""
  ).trim();
}

function getItemId(
  item = {}
) {
  return safeId(
    item?.ticketId ||
      item?.id ||
      item?.code
  );
}

/* =========================================================
   GETTERS
========================================================= */

export function getIncidencias() {
  return safeArray(
    Store.get(
      "entities.incidencias"
    ) || []
  );
}

export function getSortedIncidenciasStore() {
  return sortIncidenciasByUpdatedDesc(
    getIncidencias()
  );
}

export function getIncidenciaById(
  id
) {
  const target =
    safeId(id);

  if (!target) {
    return null;
  }

  const items =
    getIncidencias();

  return (
    items.find(
      (item) =>
        getItemId(item) ===
          target ||
        safeId(
          item?.id
        ) === target ||
        safeId(
          item?.ticketId
        ) === target ||
        safeId(
          item?.code
        ) === target
    ) || null
  );
}

export function getIncidenciaByIdStore(
  id
) {
  return getIncidenciaById(
    id
  );
}

export function hasIncidencias() {
  return (
    getIncidencias()
      .length > 0
  );
}

export function getIncidenciasCount() {
  return getIncidencias()
    .length;
}

/* =========================================================
   SETTERS
========================================================= */

export function setIncidencias(
  items = []
) {
  const safeItems =
    safeArray(items);

  if (
    Store?.actions
      ?.setCollection
  ) {
    Store.actions.setCollection(
      "incidencias",
      safeItems
    );

    return safeItems;
  }

  if (Store?.set) {
    Store.set(
      "entities.incidencias",
      safeItems
    );
  }

  return safeItems;
}

export function replaceIncidenciasStore(
  items = []
) {
  return setIncidencias(
    items
  );
}

export function clearIncidencias() {
  return setIncidencias(
    []
  );
}

export function appendIncidenciaStore(
  item = null
) {
  if (!item) {
    return getIncidencias();
  }

  const current =
    getIncidencias();

  const next = [
    ...current,
    item,
  ];

  setIncidencias(
    next
  );

  return next;
}

export function updateIncidenciaStore(
  id,
  patch = {}
) {
  const target =
    safeId(id);

  if (!target) {
    return getIncidencias();
  }

  const next =
    getIncidencias().map(
      (item) => {
        const match =
          getItemId(
            item
          ) === target;

        return match
          ? {
              ...item,
              ...patch,
            }
          : item;
      }
    );

  setIncidencias(
    next
  );

  return next;
}

/* =========================================================
   UPSERT (FIX CLAVE)
========================================================= */

export function upsertIncidenciaStore(
  item = null
) {
  if (!item) {
    return getIncidencias();
  }

  const targetId =
    getItemId(item);

  if (!targetId) {
    return appendIncidenciaStore(
      item
    );
  }

  const current =
    getIncidencias();

  const index =
    current.findIndex(
      (row) =>
        getItemId(
          row
        ) === targetId
    );

  let next = [];

  if (index === -1) {
    next = [
      item,
      ...current,
    ];
  } else {
    next = [...current];

    next[index] = {
      ...next[index],
      ...item,
    };
  }

  setIncidencias(next);

  return next;
}

/* =========================================================
   HELPERS
========================================================= */

export function sortIncidenciasByUpdatedDesc(
  items = []
) {
  return safeArray(
    items
  ).sort(
    (a, b) => {
      const aTime =
        Number(
          a?.updatedAtMs ??
            a?.meta
              ?.timestampMs ??
            new Date(
              a?.updatedAt ||
                a?.createdAt ||
                0
            ).getTime()
        ) || 0;

      const bTime =
        Number(
          b?.updatedAtMs ??
            b?.meta
              ?.timestampMs ??
            new Date(
              b?.updatedAt ||
                b?.createdAt ||
                0
            ).getTime()
        ) || 0;

      return (
        bTime - aTime
      );
    }
  );
}

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
  clearIncidencias,
  sortIncidenciasByUpdatedDesc,
};
