/* =========================================================
   Onion SPA - Toast Store
   Archivo: src/ui/toast/store.js

   Responsabilidades:
   - estado interno del módulo toast
   - registro de items activos
   - control de dismissing
   - lectura ordenada
   - utilidades CRUD internas
   - endurecer ids / consistencia / snapshots
========================================================= */

/* =========================================================
   STATE
========================================================= */

const items = new Map();
const dismissing = new Set();

/* =========================================================
   HELPERS
========================================================= */

function normalizeId(id) {
  if (id === null || id === undefined) {
    return "";
  }

  return String(id).trim();
}

function isValidId(id) {
  return normalizeId(id).length > 0;
}

function cloneList(list = []) {
  return Array.isArray(list)
    ? [...list]
    : [];
}

/* =========================================================
   CRUD
========================================================= */

export function setToastItem(
  id,
  item
) {
  const key = normalizeId(id);

  if (!key) {
    return null;
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  item.id = key;

  items.set(key, item);

  return item;
}

export function getToastItem(
  id
) {
  const key = normalizeId(id);

  if (!key) {
    return null;
  }

  return items.get(key) || null;
}

export function hasToastItem(
  id
) {
  const key = normalizeId(id);

  if (!key) {
    return false;
  }

  return items.has(key);
}

export function deleteToastItem(
  id
) {
  const key = normalizeId(id);

  if (!key) {
    return false;
  }

  dismissing.delete(key);

  return items.delete(key);
}

/* =========================================================
   LIST
========================================================= */

export function getToastItems() {
  return cloneList(
    [...items.values()]
  );
}

export function getToastIds() {
  return cloneList(
    [...items.keys()]
  );
}

export function getToastCount() {
  return items.size;
}

export function clearToastItems() {
  items.clear();
  return true;
}

/* =========================================================
   DISMISSING
========================================================= */

export function markToastDismissing(
  id
) {
  const key = normalizeId(id);

  if (!key) {
    return false;
  }

  dismissing.add(key);
  return true;
}

export function unmarkToastDismissing(
  id
) {
  const key = normalizeId(id);

  if (!key) {
    return false;
  }

  dismissing.delete(key);
  return true;
}

export function isToastDismissing(
  id
) {
  const key = normalizeId(id);

  if (!key) {
    return false;
  }

  return dismissing.has(key);
}

export function getDismissingIds() {
  return cloneList(
    [...dismissing.values()]
  );
}

export function clearToastDismissing() {
  dismissing.clear();
  return true;
}

/* =========================================================
   ACTIVE / SORTED
========================================================= */

export function getActiveToasts() {
  return getToastItems()
    .filter((item) => {
      return (
        item &&
        item.dismissed !== true &&
        item.toastEl?.isConnected
      );
    })
    .sort((a, b) => {
      return (
        Number(a?.createdAt || 0) -
        Number(b?.createdAt || 0)
      );
    });
}

export function getNewestActiveToast() {
  const active =
    getActiveToasts();

  return (
    active[
      active.length - 1
    ] || null
  );
}

export function getOldestActiveToast() {
  const active =
    getActiveToasts();

  return active[0] || null;
}

/* =========================================================
   DEBUG SNAPSHOT
========================================================= */

export function getToastStoreSnapshot() {
  return {
    total: items.size,
    dismissing:
      dismissing.size,
    ids: getToastIds(),
    dismissingIds:
      getDismissingIds(),
    active: getActiveToasts().map(
      (item) => ({
        id: item?.id || "",
        type:
          item?.type || "",
        createdAt:
          item?.createdAt || 0,
        dismissed:
          item?.dismissed === true,
      })
    ),
  };
}

/* =========================================================
   RESET
========================================================= */

export function resetToastStore() {
  clearToastItems();
  clearToastDismissing();

  return true;
}
