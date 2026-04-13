/* =========================================================
   Onion SPA - Toast Store
   Archivo: src/ui/toast/store.js

   Responsabilidades:
   - estado interno del módulo toast
   - registro de items activos
   - control de dismissing
   - lectura ordenada
   - utilidades CRUD internas
========================================================= */

/* =========================================================
   STATE
========================================================= */

const items = new Map();
const dismissing = new Set();

/* =========================================================
   CRUD
========================================================= */

export function setToastItem(
  id,
  item
) {
  items.set(String(id), item);
  return item;
}

export function getToastItem(
  id
) {
  return items.get(
    String(id)
  );
}

export function hasToastItem(
  id
) {
  return items.has(
    String(id)
  );
}

export function deleteToastItem(
  id
) {
  return items.delete(
    String(id)
  );
}

/* =========================================================
   LIST
========================================================= */

export function getToastItems() {
  return [
    ...items.values(),
  ];
}

export function getToastIds() {
  return [
    ...items.keys(),
  ];
}

export function clearToastItems() {
  items.clear();
}

/* =========================================================
   DISMISSING
========================================================= */

export function markToastDismissing(
  id
) {
  dismissing.add(
    String(id)
  );
}

export function unmarkToastDismissing(
  id
) {
  dismissing.delete(
    String(id)
  );
}

export function isToastDismissing(
  id
) {
  return dismissing.has(
    String(id)
  );
}

export function clearToastDismissing() {
  dismissing.clear();
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
        (a.createdAt || 0) -
        (b.createdAt || 0)
      );
    });
}

/* =========================================================
   RESET
========================================================= */

export function resetToastStore() {
  clearToastItems();
  clearToastDismissing();
}
