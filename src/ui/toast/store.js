/* =========================================================
   Onion SPA - Toast Store
   Archivo: src/ui/toast/store.js

   Responsabilidades:
   - estado interno del módulo toast
   - registro de items activos
   - control de dismissing
   - lectura ordenada
   - utilidades CRUD internas
   - snapshots de diagnóstico
   - endurecer ids / consistencia / resets

   HARDENING:
   - ids normalizados de forma estable
   - no expone referencias internas de Sets/Maps
   - tolera items corruptos
   - limpia dismissing al borrar/reemplazar
   - orden estable por createdAt
   - active toasts robustos aunque el DOM esté en transición
========================================================= */

/* =========================================================
   STATE
========================================================= */

const items = new Map();
const dismissing = new Set();

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_TOAST_ID_LENGTH = 160;

/* =========================================================
   BASICS
========================================================= */

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

function safeNumber(value, fallback = 0) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function cloneList(list = []) {
  return Array.isArray(list)
    ? [...list]
    : [];
}

/* =========================================================
   ID HELPERS
========================================================= */

function normalizeId(id) {
  const raw =
    safeText(id, "");

  if (!raw) {
    return "";
  }

  return raw
    .replace(/\s+/g, "-")
    .replace(/[^\w:.-]/g, "")
    .slice(0, MAX_TOAST_ID_LENGTH)
    .trim();
}

function isValidId(id) {
  return Boolean(
    normalizeId(id)
  );
}

/* =========================================================
   ITEM HELPERS
========================================================= */

function normalizeToastItem(id, item) {
  const key =
    normalizeId(id || item?.id);

  if (!key || !isObject(item)) {
    return null;
  }

  item.id = key;

  if (!item.createdAt) {
    item.createdAt = Date.now();
  }

  if (item.dismissed !== true) {
    item.dismissed = false;
  }

  return item;
}

function isElementConnected(element) {
  try {
    if (!element) {
      return false;
    }

    if (typeof element.isConnected === "boolean") {
      return element.isConnected;
    }

    if (
      typeof document !== "undefined" &&
      typeof document.contains === "function"
    ) {
      return document.contains(element);
    }
  } catch {}

  return false;
}

function isToastActive(item) {
  if (!isObject(item)) {
    return false;
  }

  if (item.dismissed === true) {
    return false;
  }

  /*
    Si aún no tiene toastEl, no lo consideramos activo visual.
    Si existe pero está desconectado, probablemente está saliendo
    o quedó huérfano tras un destroy.
  */
  if (!item.toastEl) {
    return false;
  }

  return isElementConnected(item.toastEl);
}

function sortByCreatedAtAsc(a, b) {
  const left =
    safeNumber(a?.createdAt, 0);

  const right =
    safeNumber(b?.createdAt, 0);

  if (left === right) {
    return safeText(a?.id).localeCompare(
      safeText(b?.id)
    );
  }

  return left - right;
}

function toDebugItem(item) {
  return {
    id: safeText(item?.id, ""),
    type: safeText(item?.type, ""),
    title: safeText(item?.title, ""),
    message: safeText(item?.message, ""),
    duration: safeNumber(item?.duration, 0),
    remaining: safeNumber(item?.remaining, 0),
    createdAt: safeNumber(item?.createdAt, 0),
    startedAt: safeNumber(item?.startedAt, 0),
    dismissed: item?.dismissed === true,
    dismissing: isToastDismissing(item?.id),
    connected: isElementConnected(item?.toastEl),
    closable: item?.closable !== false,
    hasToastEl: Boolean(item?.toastEl),
    hasProgressEl: Boolean(item?.progressEl),
  };
}

/* =========================================================
   CRUD
========================================================= */

export function setToastItem(id, item) {
  const normalized =
    normalizeToastItem(id, item);

  if (!normalized) {
    return null;
  }

  /*
    Si se reemplaza un toast con el mismo id, ese id ya no debe
    seguir marcado como dismissing.
  */
  dismissing.delete(normalized.id);

  items.set(
    normalized.id,
    normalized
  );

  return normalized;
}

export function getToastItem(id) {
  const key =
    normalizeId(id);

  if (!key) {
    return null;
  }

  return items.get(key) || null;
}

export function hasToastItem(id) {
  const key =
    normalizeId(id);

  if (!key) {
    return false;
  }

  return items.has(key);
}

export function deleteToastItem(id) {
  const key =
    normalizeId(id);

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
    Array.from(items.values())
  );
}

export function getToastIds() {
  return cloneList(
    Array.from(items.keys())
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

export function markToastDismissing(id) {
  const key =
    normalizeId(id);

  if (!key) {
    return false;
  }

  dismissing.add(key);

  return true;
}

export function unmarkToastDismissing(id) {
  const key =
    normalizeId(id);

  if (!key) {
    return false;
  }

  return dismissing.delete(key);
}

export function isToastDismissing(id) {
  const key =
    normalizeId(id);

  if (!key) {
    return false;
  }

  return dismissing.has(key);
}

export function getDismissingIds() {
  return cloneList(
    Array.from(dismissing.values())
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
    .filter(isToastActive)
    .sort(sortByCreatedAtAsc);
}

export function getNewestActiveToast() {
  const active =
    getActiveToasts();

  return active[active.length - 1] || null;
}

export function getOldestActiveToast() {
  const active =
    getActiveToasts();

  return active[0] || null;
}

export function getSortedToastItems() {
  return getToastItems()
    .sort(sortByCreatedAtAsc);
}

/* =========================================================
   BULK HELPERS
========================================================= */

export function deleteDismissedToasts() {
  let removed = 0;

  getToastItems().forEach((item) => {
    if (item?.dismissed === true) {
      if (deleteToastItem(item.id)) {
        removed += 1;
      }
    }
  });

  return removed;
}

export function deleteDisconnectedToasts() {
  let removed = 0;

  getToastItems().forEach((item) => {
    if (
      item?.dismissed === true ||
      !item?.toastEl ||
      !isElementConnected(item.toastEl)
    ) {
      if (deleteToastItem(item.id)) {
        removed += 1;
      }
    }
  });

  return removed;
}

/* =========================================================
   DEBUG SNAPSHOT
========================================================= */

export function getToastStoreSnapshot() {
  const all =
    getSortedToastItems();

  const active =
    getActiveToasts();

  return {
    total: items.size,
    activeCount: active.length,
    dismissing: dismissing.size,

    ids: getToastIds(),
    dismissingIds: getDismissingIds(),

    active:
      active.map(toDebugItem),

    items:
      all.map(toDebugItem),
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

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  setToastItem,
  getToastItem,
  hasToastItem,
  deleteToastItem,

  getToastItems,
  getToastIds,
  getToastCount,
  clearToastItems,

  markToastDismissing,
  unmarkToastDismissing,
  isToastDismissing,
  getDismissingIds,
  clearToastDismissing,

  getActiveToasts,
  getNewestActiveToast,
  getOldestActiveToast,
  getSortedToastItems,

  deleteDismissedToasts,
  deleteDisconnectedToasts,

  getToastStoreSnapshot,
  resetToastStore,
};
