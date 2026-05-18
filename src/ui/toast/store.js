/* =========================================================
   Onion Support - Toast Store
   Archivo: /src/ui/toast/store.js

   Responsabilidad:
   - Store mínimo de compat para Toast legacy.
   - Map items + Set dismissing internos.
   - Sin imports.
   - Sin DOM obligatorio.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store global.
   - Sin timers reales.
   - Snapshots redacted.
   - El Toast real vive en src/ui/toast/index.js.
========================================================= */

export const TOAST_STORE_VERSION = "simple";

const items = new Map();
const dismissing = new Set();

const TOKEN_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#]token=)[^&#\s]+/gi;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isElement(value) {
  return Boolean(value && typeof value === "object" && value.nodeType === 1);
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function now() {
  return Date.now();
}

function nowIso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function normalizeId(id = "") {
  return text(id, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9:_\-.]/g, "")
    .replace(/[-:._]{2,}/g, "-")
    .replace(/^[-:._]+|[-:._]+$/g, "")
    .slice(0, 120);
}

function cloneArray(value = []) {
  return Array.isArray(value) ? [...value] : [];
}

function redact(value = "") {
  const output = text(value, "");

  if (!output) return "";

  try {
    return output.replace(TOKEN_RE, (match) => {
      if (/^bearer\s+/i.test(match)) return "Bearer ***";
      if (/^[?&#]/.test(match)) return match.replace(/=.+$/g, "=***");
      return "***";
    });
  } catch {
    return output;
  }
}

function connected(node = null) {
  if (!isElement(node)) return false;

  try {
    if (typeof node.isConnected === "boolean") return node.isConnected;
  } catch {
    // noop
  }

  try {
    return typeof document !== "undefined" && document.contains(node);
  } catch {
    return false;
  }
}

/* =========================================================
   NORMALIZE ITEM
========================================================= */

function normalizeTimestamp(value = null, fallback = now()) {
  const output = number(value, 0);
  return output > 0 ? output : fallback;
}

function normalizeItem(id = "", item = {}) {
  if (!isObject(item)) return null;

  const key = normalizeId(id || item.id);

  if (!key) return null;

  const createdAt = normalizeTimestamp(item.createdAt, now());
  const duration = Math.max(0, number(item.duration, 0));

  return {
    ...item,

    id: key,
    type: text(item.type, "info"),
    title: text(item.title, ""),
    message: text(item.message, ""),

    duration,
    remaining: Math.max(0, number(item.remaining, duration)),
    startedAt: Math.max(0, number(item.startedAt, 0)),
    timeoutId: item.timeoutId || null,

    createdAt,
    updatedAt: normalizeTimestamp(item.updatedAt, createdAt),

    dismissed: item.dismissed === true,
    dismissedAt: item.dismissedAt ? number(item.dismissedAt, 0) : null,
    dismissReason: text(item.dismissReason, ""),

    closable: item.closable !== false,

    toastEl: item.toastEl || null,
    progressEl: item.progressEl || null,

    useDefaultTitle: item.useDefaultTitle === true,
    useDefaultMessage: item.useDefaultMessage === true,

    interactionsBound: item.interactionsBound === true,
    paused: item.paused === true,

    meta: isObject(item.meta) ? { ...item.meta } : {},
  };
}

function activeItem(item = null) {
  if (!isObject(item)) return false;
  if (!item.id) return false;
  if (item.dismissed === true) return false;
  if (dismissing.has(item.id)) return false;

  return true;
}

function byCreatedAtAsc(a, b) {
  const left = number(a?.createdAt, 0);
  const right = number(b?.createdAt, 0);

  if (left !== right) return left - right;

  return text(a?.id, "").localeCompare(text(b?.id, ""));
}

function byCreatedAtDesc(a, b) {
  return byCreatedAtAsc(b, a);
}

function touch(item = null) {
  if (!item) return false;

  try {
    item.updatedAt = now();
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   CRUD
========================================================= */

export function setToastItem(id, item) {
  const normalized = normalizeItem(id, item);

  if (!normalized) return null;

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
  return cloneArray([...items.values()]);
}

export function getSortedToastItems() {
  return getToastItems().sort(byCreatedAtAsc);
}

export function getNewestToastItems() {
  return getToastItems().sort(byCreatedAtDesc);
}

export function getToastIds() {
  return cloneArray([...items.keys()]);
}

export function getToastCount() {
  return items.size;
}

export function getActiveToasts() {
  return getToastItems()
    .filter(activeItem)
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
  touch(getToastItem(key));

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
  return cloneArray([...dismissing.values()]);
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

  const normalized = normalizeItem(item.id, item);

  if (!normalized) return null;

  items.set(normalized.id, normalized);

  return normalized;
}

export function markToastPaused(id, paused = true) {
  return patchToastItem(id, {
    paused: Boolean(paused),
  });
}

export function markToastDismissed(id, reason = "dismiss") {
  return patchToastItem(id, {
    dismissed: true,
    dismissReason: text(reason, "dismiss"),
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
    if (item?.dismissed === true && deleteToastItem(item.id)) {
      removed += 1;
    }
  }

  return removed;
}

export function deleteDisconnectedToasts() {
  let removed = 0;

  for (const item of getToastItems()) {
    const hasNode = Boolean(item?.toastEl);
    const disconnected = hasNode && !connected(item.toastEl);

    if (item?.dismissed === true || disconnected) {
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
    id: text(item?.id, ""),
    type: text(item?.type, ""),
    title: redact(item?.title || ""),
    message: redact(item?.message || ""),

    duration: number(item?.duration, 0),
    remaining: number(item?.remaining, 0),
    startedAt: number(item?.startedAt, 0),

    createdAt: number(item?.createdAt, 0),
    createdAtIso: item?.createdAt ? nowIso(item.createdAt) : "",

    updatedAt: number(item?.updatedAt, 0),
    updatedAtIso: item?.updatedAt ? nowIso(item.updatedAt) : "",

    dismissed: item?.dismissed === true,
    dismissedAt: item?.dismissedAt ? number(item.dismissedAt, 0) : null,
    dismissReason: text(item?.dismissReason, ""),
    dismissing: isToastDismissing(item?.id),

    paused: item?.paused === true,
    closable: item?.closable !== false,

    useDefaultTitle: item?.useDefaultTitle === true,
    useDefaultMessage: item?.useDefaultMessage === true,

    hasTimeout: Boolean(item?.timeoutId),
    hasToastEl: Boolean(item?.toastEl),
    hasProgressEl: Boolean(item?.progressEl),
    connected: connected(item?.toastEl),

    interactionsBound: item?.interactionsBound === true,
  };
}

export function getToastStoreSnapshot() {
  const all = getSortedToastItems();
  const active = all.filter(activeItem);

  return {
    version: TOAST_STORE_VERSION,

    total: items.size,
    activeCount: active.length,
    dismissingCount: dismissing.size,

    ids: getToastIds(),
    dismissingIds: getDismissingIds(),

    active: active.map(itemSnapshot),
    items: all.map(itemSnapshot),

    policy: {
      compatOnly: true,
      noImports: true,
      noGlobalStore: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      domOptional: true,
      redacted: true,
    },
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
