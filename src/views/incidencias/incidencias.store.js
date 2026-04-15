/* =========================================================
   Onion SPA - Incidencias Store
   Archivo: src/views/incidencias/incidencias.store.js

   Responsabilidades:
   - encapsular acceso al Store global
   - leer colección incidencias
   - escribir colección incidencias
   - aislar compatibilidad Store.actions / Store.set
   - exponer helpers compatibles con API / View / Actions
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   SAFE
========================================================= */

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeId(value) {
  return String(
    value ?? ""
  ).trim();
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
          safeId(
            item?.id
          ) === target ||
          safeId(
            item?.ticketId
          ) === target ||
          safeId(
            item?.code
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

export function clearIncidencias() {
  return setIncidencias(
    []
  );
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
