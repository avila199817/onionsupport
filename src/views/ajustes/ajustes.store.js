/* =========================================================
   Onion SPA - Ajustes Store
   Archivo: src/views/ajustes/ajustes.store.js

   RESPONSABILIDADES:
   - capa de acceso/cache del módulo ajustes
   - usar exclusivamente el state REAL del módulo
   - NO depender de un Store global inexistente
   - leer / escribir la colección ajustesState.items
   - helpers para API / View / Actions
   - búsquedas robustas por id / key
   - replace / append / update / upsert / remove
   - deduplicación segura
   - ordenación consistente por updatedAt

   ARQUITECTURA:
   - Fuente real: ./ajustes.state.js
   - Sin dependencias de store global
   - Sin persistencia browser
   - Sin estado global inventado
========================================================= */

import {
  getItems,
  setItems,
  clearItems,
} from "./ajustes.state.js";

/* =========================================================
   SAFE
========================================================= */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeId(value) {
  return safeText(
    value,
    ""
  );
}

function safeTimestamp(
  value,
  fallback = 0
) {
  const n =
    Number(value);

  if (
    Number.isFinite(n)
  ) {
    return n;
  }

  const date =
    new Date(value);

  const ts =
    date.getTime();

  return Number.isFinite(ts)
    ? ts
    : fallback;
}

/* =========================================================
   ID / KEY HELPERS
========================================================= */

export function getItemId(
  item = {}
) {
  const row =
    safeObject(item);

  return safeId(
    row.settingId ||
      row.ajusteId ||
      row.paymentMethodId ||
      row.metodoPagoId ||
      row.id ||
      row.key ||
      row.slug ||
      row.code
  );
}

export function getItemKey(
  item = {}
) {
  const row =
    safeObject(item);

  return safeId(
    row.key ||
      row.settingKey ||
      row.slug ||
      row.code ||
      row.id
  );
}

function isSameItemId(
  item = {},
  id = ""
) {
  const target =
    safeId(id);

  if (!target) {
    return false;
  }

  const row =
    safeObject(item);

  return (
    getItemId(row) === target ||
    safeId(row.id) === target ||
    safeId(row.settingId) === target ||
    safeId(row.ajusteId) === target ||
    safeId(row.paymentMethodId) === target ||
    safeId(row.metodoPagoId) === target ||
    safeId(row.key) === target ||
    safeId(row.slug) === target ||
    safeId(row.code) === target
  );
}

function isSameItemKey(
  item = {},
  key = ""
) {
  const target =
    safeId(key);

  if (!target) {
    return false;
  }

  const row =
    safeObject(item);

  return (
    getItemKey(row) === target ||
    safeId(row.key) === target ||
    safeId(row.settingKey) === target ||
    safeId(row.slug) === target ||
    safeId(row.code) === target
  );
}

/* =========================================================
   TIMESTAMP HELPERS
========================================================= */

function getUpdatedTimestamp(
  item = {}
) {
  const row =
    safeObject(item);

  return safeTimestamp(
    row.updatedAtMs ??
      row.updatedAtTs ??
      row.meta?.timestampMs ??
      row.meta?.updatedAtMs ??
      row.updatedAt ??
      row.modifiedAt ??
      row.lastUpdate ??
      row.fechaActualizacion ??
      row.createdAt ??
      0,
    0
  );
}

/* =========================================================
   LOW LEVEL STATE ACCESS
========================================================= */

function readStoreCollection() {
  try {
    return safeArray(
      getItems()
    );
  } catch {
    return [];
  }
}

function writeStoreCollection(
  items = []
) {
  const list =
    safeArray(items);

  try {
    return safeArray(
      setItems(list)
    );
  } catch {
    /*
      No inventamos un segundo store si el state del módulo falla.
      Devolvemos la lista para mantener helpers puros/tolerantes.
    */
    return list;
  }
}

/* =========================================================
   NORMALIZE COLLECTION
========================================================= */

function mergeAjuste(
  base = {},
  patch = {}
) {
  return {
    ...safeObject(base),
    ...safeObject(patch),
  };
}

function dedupeAjustes(
  items = []
) {
  const list =
    safeArray(items);

  const mapById =
    new Map();

  const mapByKey =
    new Map();

  const anonymous = [];

  for (
    const rawItem
    of list
  ) {
    const item =
      safeObject(
        rawItem
      );

    const id =
      getItemId(
        item
      );

    const key =
      getItemKey(
        item
      );

    if (
      !id &&
      !key
    ) {
      anonymous.push(
        item
      );

      continue;
    }

    const idHit =
      id
        ? mapById.get(id)
        : null;

    const keyHit =
      key
        ? mapByKey.get(key)
        : null;

    const current =
      idHit ||
      keyHit ||
      null;

    const merged =
      current
        ? mergeAjuste(
            current,
            item
          )
        : item;

    const finalId =
      getItemId(
        merged
      );

    const finalKey =
      getItemKey(
        merged
      );

    if (current) {
      const prevId =
        getItemId(
          current
        );

      const prevKey =
        getItemKey(
          current
        );

      if (prevId) {
        mapById.delete(
          prevId
        );
      }

      if (prevKey) {
        mapByKey.delete(
          prevKey
        );
      }
    }

    if (finalId) {
      mapById.set(
        finalId,
        merged
      );
    }

    if (finalKey) {
      mapByKey.set(
        finalKey,
        merged
      );
    }
  }

  const unique = [];
  const seen =
    new Set();

  for (
    const item
    of mapById.values()
  ) {
    const ref =
      getItemId(item) ||
      getItemKey(item) ||
      JSON.stringify(item);

    if (
      !seen.has(ref)
    ) {
      seen.add(ref);
      unique.push(item);
    }
  }

  for (
    const item
    of mapByKey.values()
  ) {
    const ref =
      getItemId(item) ||
      getItemKey(item) ||
      JSON.stringify(item);

    if (
      !seen.has(ref)
    ) {
      seen.add(ref);
      unique.push(item);
    }
  }

  return [
    ...unique,
    ...anonymous,
  ];
}

function normalizeCollection(
  items = []
) {
  return dedupeAjustes(
    safeArray(items)
  );
}

/* =========================================================
   GETTERS
========================================================= */

export function getAjustes() {
  return normalizeCollection(
    readStoreCollection()
  );
}

export function getSortedAjustesStore() {
  return sortAjustesByUpdatedDesc(
    getAjustes()
  );
}

export function getAjusteById(
  id = ""
) {
  const target =
    safeId(id);

  if (!target) {
    return null;
  }

  const items =
    getAjustes();

  return (
    items.find(
      (item) =>
        isSameItemId(
          item,
          target
        )
    ) ||
    null
  );
}

export function getAjusteByIdStore(
  id = ""
) {
  return getAjusteById(
    id
  );
}

export function getAjusteByKey(
  key = ""
) {
  const target =
    safeId(key);

  if (!target) {
    return null;
  }

  const items =
    getAjustes();

  return (
    items.find(
      (item) =>
        isSameItemKey(
          item,
          target
        )
    ) ||
    null
  );
}

export function getAjusteByKeyStore(
  key = ""
) {
  return getAjusteByKey(
    key
  );
}

export function hasAjustes() {
  return (
    getAjustes()
      .length > 0
  );
}

export function getAjustesCount() {
  return (
    getAjustes()
      .length
  );
}

/* =========================================================
   SETTERS
========================================================= */

export function setAjustes(
  items = []
) {
  const next =
    normalizeCollection(
      items
    );

  return writeStoreCollection(
    next
  );
}

export function replaceAjustesStore(
  items = []
) {
  return setAjustes(
    items
  );
}

export function clearAjustes() {
  try {
    clearItems();

    return [];
  } catch {
    return writeStoreCollection(
      []
    );
  }
}

export function appendAjusteStore(
  item = null
) {
  if (!item) {
    return getAjustes();
  }

  const current =
    getAjustes();

  const next =
    normalizeCollection([
      ...current,
      safeObject(item),
    ]);

  return writeStoreCollection(
    next
  );
}

export function updateAjusteStore(
  id = "",
  patch = {}
) {
  const target =
    safeId(id);

  if (!target) {
    return getAjustes();
  }

  const current =
    getAjustes();

  const next =
    current.map(
      (item) =>
        (
          isSameItemId(
            item,
            target
          ) ||
          isSameItemKey(
            item,
            target
          )
        )
          ? mergeAjuste(
              item,
              patch
            )
          : item
    );

  return writeStoreCollection(
    normalizeCollection(
      next
    )
  );
}

/* =========================================================
   UPSERT
========================================================= */

export function upsertAjusteStore(
  item = null
) {
  if (!item) {
    return getAjustes();
  }

  const incoming =
    safeObject(item);

  const targetId =
    getItemId(
      incoming
    );

  const targetKey =
    getItemKey(
      incoming
    );

  const current =
    getAjustes();

  if (
    !targetId &&
    !targetKey
  ) {
    const next =
      normalizeCollection([
        incoming,
        ...current,
      ]);

    return writeStoreCollection(
      next
    );
  }

  const index =
    current.findIndex(
      (row) =>
        (
          targetId &&
          getItemId(row) ===
            targetId
        ) ||
        (
          targetKey &&
          getItemKey(row) ===
            targetKey
        )
    );

  let next = [];

  if (
    index === -1
  ) {
    next =
      normalizeCollection([
        incoming,
        ...current,
      ]);
  } else {
    next = [
      ...current,
    ];

    next[index] =
      mergeAjuste(
        next[index],
        incoming
      );

    next =
      normalizeCollection(
        next
      );
  }

  return writeStoreCollection(
    next
  );
}

/* =========================================================
   REMOVE
========================================================= */

export function removeAjusteStore(
  idOrKey = ""
) {
  const target =
    safeId(
      idOrKey
    );

  if (!target) {
    return getAjustes();
  }

  const next =
    getAjustes()
      .filter(
        (item) =>
          !isSameItemId(
            item,
            target
          ) &&
          !isSameItemKey(
            item,
            target
          )
      );

  return writeStoreCollection(
    next
  );
}

/* =========================================================
   HELPERS
========================================================= */

export function sortAjustesByUpdatedDesc(
  items = []
) {
  return [
    ...safeArray(items),
  ].sort(
    (a, b) => {
      const aTime =
        getUpdatedTimestamp(
          a
        );

      const bTime =
        getUpdatedTimestamp(
          b
        );

      return (
        bTime -
        aTime
      );
    }
  );
}

export function sortAjustesByCreatedDesc(
  items = []
) {
  return [
    ...safeArray(items),
  ].sort(
    (a, b) => {
      const aTime =
        safeTimestamp(
          safeObject(a)
            .createdAt ??
          safeObject(a)
            .createdAtMs ??
          0,
          0
        );

      const bTime =
        safeTimestamp(
          safeObject(b)
            .createdAt ??
          safeObject(b)
            .createdAtMs ??
          0,
          0
        );

      return (
        bTime -
        aTime
      );
    }
  );
}

export function sortAjustesByTitleAsc(
  items = []
) {
  return [
    ...safeArray(items),
  ].sort(
    (a, b) => {
      const aTitle =
        safeText(
          safeObject(a)
            .title ||
          safeObject(a)
            .name ||
          safeObject(a)
            .label ||
          getItemKey(a),
          ""
        );

      const bTitle =
        safeText(
          safeObject(b)
            .title ||
          safeObject(b)
            .name ||
          safeObject(b)
            .label ||
          getItemKey(b),
          ""
        );

      return aTitle
        .localeCompare(
          bTitle,
          "es"
        );
    }
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getAjustes,
  getSortedAjustesStore,
  getAjusteById,
  getAjusteByIdStore,
  getAjusteByKey,
  getAjusteByKeyStore,
  hasAjustes,
  getAjustesCount,

  setAjustes,
  replaceAjustesStore,
  appendAjusteStore,
  updateAjusteStore,
  upsertAjusteStore,
  removeAjusteStore,
  clearAjustes,

  sortAjustesByUpdatedDesc,
  sortAjustesByCreatedDesc,
  sortAjustesByTitleAsc,

  getItemId,
  getItemKey,
};
