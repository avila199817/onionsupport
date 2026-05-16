/* =========================================================
   Onion SPA - Toast Store
   Archivo: src/ui/toast/store.js

   Toast Store limpio:
   - estado interno del módulo toast
   - Map items + Set dismissing
   - ids normalizados
   - orden estable por createdAt
   - no expone Maps/Sets internos
   - snapshots sin DOM pesado
   - sin auth/router/http/store global
========================================================= */

import {
  normalizeToastId,
  safeNumber,
  safeObject,
  safeText,
  now,
  nowIso,
} from "./helpers.js";

/* =========================================================
   VERSION
========================================================= */

export const TOAST_STORE_VERSION = "17.0.0-clean";

/* =========================================================
   STATE
========================================================= */

const items = new Map();
const dismissing = new Set();

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isElement(value) {
  return Boolean(value && typeof value === "object" && value.nodeType === 1);
}

function isConnectedElement(element) {
  if (!isElement(element)) return false;

  try {
    if (typeof element.isConnected === "boolean") {
      return element.isConnected;
    }
  } catch {}

  try {
    return typeof document !== "undefined" && document.contains(element);
  } catch {
    return false;
  }
}

function normalizeId(id = "") {
  return normalizeToastId(id);
}

function validId(id = "") {
  return Boolean(normalizeId(id));
}

function cloneList(values = []) {
  return Array.isArray(values) ? [...values] : [];
}

/* =========================================================
   ITEM NORMALIZATION
========================================================= */

function normalizeTimestamp(value = null, fallback = now()) {
  const number = safeNumber(value, 0);
  return number > 0 ? number : fallback;
}

function normalizeItem(id = "", item = {}) {
  if (!isObject(item)) return null;

  const key = normalizeId(id || item.id);

  if (!key) return null;

  const createdAt = normalizeTimestamp(item.createdAt, now());

  item.id = key;
  item.type = safeText(item.type, "info");
  item.title = safeText(item.title, "");
  item.message = safeText(item.message, "");

  item.duration = safeNumber(item.duration, 0);
  item.remaining = safeNumber(item.remaining, item.duration);
  item.startedAt = safeNumber(item.startedAt, 0);
  item.timeoutId = item.timeoutId || null;

  item.createdAt = createdAt;
  item.updatedAt = normalizeTimestamp(item.updatedAt, createdAt);

  item.dismissed = item.dismissed === true;
  item.dismissReason = safeText(item.dismissReason, "");

  item.closable = item.closable !== false;

  item.toastEl = item.toastEl || null;
  item.progressEl = item.progressEl || null;

  item.useDefaultTitle = item.useDefaultTitle === true;
  item.useDefaultMessage = item.useDefaultMessage === true;

  item.interactionsBound = item.interactionsBound === true;
  item.paused = item.paused === true;

  item.meta = safeObject(item.meta);

  return item;
}

function isToastActive(item = null) {
  if (!isObject(item)) return false;
  if (item.dismissed === true) return false;
  if (dismissing.has(item.id)) return false;
  if (!item.toastEl) return false;

  return isConnectedElement(item.toastEl);
}

function byCreatedAtAsc(a, b) {
  const left = safeNumber(a?.createdAt, 0);
  const right = safeNumber(b?.createdAt, 0);

  if (left !== right) return left - right;

  return safeText(a?.id, "").localeCompare(safeText(b?.id, ""));
}

function byCreatedAtDesc(a, b) {
  return byCreatedAtAsc(b, a);
}

/* =========================================================
   CRUD
========================================================= */

export function setToastItem(id, item) {
  const normalized = normalizeItem(id, item);

  if (!normalized) return null;

  /*
    Si se reemplaza un toast con el mismo id, deja de estar en dismissing.
  */
  dismissing.delete(normalized.id);

  items.set(normalized.id, normalized);

  return normalized;
}

export function getToastItem(id) {
  const key = normalizeId(id);

  if (!key) return null;

  return items.get(key) || null;
}

export function hasToastItem(id) {
  const key = normalizeId(id);

  return key ? items.has(key) : false;
}

export function deleteToastItem(id) {
  const key = normalizeId(id);

  if (!key) return false;

  dismissing.delete(key);

  return items.delete(key);
}

export function replaceToastItem(id, item) {
  const key = normalizeId(id || item?.id);

  if (!key) return null;

  deleteToastItem(key);
  return setToastItem(key, item);
}

/* =========================================================
   LISTS
========================================================= */

export function getToastItems() {
  return cloneList(Array.from(items.values()));
}

export function getSortedToastItems() {
  return getToastItems().sort(byCreatedAtAsc);
}

export function getNewestToastItems() {
  return getToastItems().sort(byCreatedAtDesc);
}

export function getToastIds() {
  return cloneList(Array.from(items.keys()));
}

export function getToastCount() {
  return items.size;
}

export function getActiveToasts() {
  return getToastItems()
    .filter(isToastActive)
    .sort(byCreatedAtAsc);
}

export function getActiveToastCount() {
  return getActiveToasts().length;
}

export function getOldestActiveToast() {
  return getActiveToasts()[0] || null;
}

export function getNewestActiveToast() {
  const active = getActiveToasts();
  return active[active.length - 1] || null;
}

export function getOldestToast() {
  return getSortedToastItems()[0] || null;
}

export function getNewestToast() {
  return getNewestToastItems()[0] || null;
}

/* =========================================================
   DISMISSING
========================================================= */

export function markToastDismissing(id) {
  const key = normalizeId(id);

  if (!key) return false;

  dismissing.add(key);

  const item = getToastItem(key);

  if (item) {
    item.updatedAt = now();
  }

  return true;
}

export function unmarkToastDismissing(id) {
  const key = normalizeId(id);

  if (!key) return false;

  return dismissing.delete(key);
}

export function isToastDismissing(id) {
  const key = normalizeId(id);

  return key ? dismissing.has(key) : false;
}

export function getDismissingIds() {
  return cloneList(Array.from(dismissing.values()));
}

export function getDismissingCount() {
  return dismissing.size;
}

export function clearToastDismissing() {
  dismissing.clear();
  return true;
}

/* =========================================================
   UPDATE HELPERS
========================================================= */

export function patchToastItem(id, patch = {}) {
  const item = getToastItem(id);

  if (!item || !isObject(patch)) return null;

  Object.assign(item, patch, {
    id: item.id,
    updatedAt: now(),
  });

  return normalizeItem(item.id, item);
}

export function markToastPaused(id, paused = true) {
  return patchToastItem(id, {
    paused: Boolean(paused),
  });
}

export function markToastDismissed(id, reason = "dismiss") {
  return patchToastItem(id, {
    dismissed: true,
    dismissReason: safeText(reason, "dismiss"),
    dismissedAt: now(),
  });
}

export function unmarkToastDismissed(id) {
  return patchToastItem(id, {
    dismissed: false,
    dismissReason: "",
    dismissedAt: null,
  });
}

/* =========================================================
   BULK CLEANUP
========================================================= */

export function clearToastItems() {
  items.clear();
  return true;
}

export function deleteDismissedToasts() {
  let removed = 0;

  for (const item of getToastItems()) {
    if (item?.dismissed === true) {
      if (deleteToastItem(item.id)) removed += 1;
    }
  }

  return removed;
}

export function deleteDisconnectedToasts() {
  let removed = 0;

  for (const item of getToastItems()) {
    if (
      item?.dismissed === true ||
      !item?.toastEl ||
      !isConnectedElement(item.toastEl)
    ) {
      if (deleteToastItem(item.id)) removed += 1;
    }
  }

  return removed;
}

export function pruneToastStore() {
  return deleteDisconnectedToasts();
}

export function resetToastStore() {
  clearToastItems();
  clearToastDismissing();

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function itemSnapshot(item = null) {
  return {
    id: safeText(item?.id, ""),

    type: safeText(item?.type, ""),
    title: safeText(item?.title, ""),
    message: safeText(item?.message, ""),

    duration: safeNumber(item?.duration, 0),
    remaining: safeNumber(item?.remaining, 0),
    startedAt: safeNumber(item?.startedAt, 0),

    createdAt: safeNumber(item?.createdAt, 0),
    createdAtIso: item?.createdAt ? nowIso(item.createdAt) : "",

    updatedAt: safeNumber(item?.updatedAt, 0),
    updatedAtIso: item?.updatedAt ? nowIso(item.updatedAt) : "",

    dismissed: item?.dismissed === true,
    dismissReason: safeText(item?.dismissReason, ""),
    dismissing: isToastDismissing(item?.id),

    paused: item?.paused === true,
    closable: item?.closable !== false,

    useDefaultTitle: item?.useDefaultTitle === true,
    useDefaultMessage: item?.useDefaultMessage === true,

    hasTimeout: Boolean(item?.timeoutId),
    hasToastEl: Boolean(item?.toastEl),
    hasProgressEl: Boolean(item?.progressEl),
    connected: isConnectedElement(item?.toastEl),

    interactionsBound: item?.interactionsBound === true,
  };
}

export function getToastStoreSnapshot() {
  const all = getSortedToastItems();
  const active = all.filter(isToastActive);

  return {
    version: TOAST_STORE_VERSION,

    total: items.size,
    activeCount: active.length,
    dismissingCount: dismissing.size,

    ids: getToastIds(),
    dismissingIds: getDismissingIds(),

    active: active.map(itemSnapshot),
    items: all.map(itemSnapshot),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  TOAST_STORE_VERSION,

  setToastItem,
  getToastItem,
  hasToastItem,
  deleteToastItem,
  replaceToastItem,

  getToastItems,
  getSortedToastItems,
  getNewestToastItems,
  getToastIds,
  getToastCount,

  getActiveToasts,
  getActiveToastCount,
  getOldestActiveToast,
  getNewestActiveToast,
  getOldestToast,
  getNewestToast,

  markToastDismissing,
  unmarkToastDismissing,
  isToastDismissing,
  getDismissingIds,
  getDismissingCount,
  clearToastDismissing,

  patchToastItem,
  markToastPaused,
  markToastDismissed,
  unmarkToastDismissed,

  clearToastItems,
  deleteDismissedToasts,
  deleteDisconnectedToasts,
  pruneToastStore,
  resetToastStore,

  getToastStoreSnapshot,
};
