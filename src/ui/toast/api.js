/* =========================================================
   Onion SPA - Toast API
   Archivo: src/ui/toast/api.js

   Toast API limpio:
   - show / update / dismiss / clear
   - success / error / warning / info / loading
   - store + dom + timers + events sincronizados
   - límite máximo de items
   - replace por id
   - dedupe simple anti-spam
   - clear/reset anti-reentrada
   - SSR safe
   - sin lógica auth/router/http
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  TOAST_MAX_ITEMS,
  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
  TOAST_EXIT_DURATION,
  TOAST_REDUCED_MOTION_EXIT_DURATION,
} from "./constants.js";

import {
  nextToastId,
  normalizeToastType,
  normalizeToastDuration,
  safeText,
  prefersReducedMotion,
} from "./helpers.js";

import {
  resolveToastTitle,
  resolveToastMessage,
  getToastTitle,
  getToastMessage,
} from "./text.js";

import {
  ensureToastContainer,
  ensureToastKeyframes,
  createToastNode,
  patchToastNode,
  removeToastNode,
} from "./dom.js";

import {
  getToastItem,
  setToastItem,
  getToastIds,
  getActiveToasts,
  markToastDismissing,
  unmarkToastDismissing,
  isToastDismissing,
  deleteToastItem,
  resetToastStore,
  getToastItems,
} from "./store.js";

import {
  clearToastTimer,
  startToastTimer,
  pauseToastTimer,
  resumeToastTimer,
  runToastProgress,
} from "./timers.js";

import {
  emitToastShown,
  emitToastUpdated,
  emitToastDismissed,
} from "./events.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const TOAST_API_VERSION = "17.0.0-clean";

const SOURCE = "ui.toast.api";

const DEFAULT_DEDUPE_MS = 1200;
const CLEAR_DEDUPE_MS = 120;
const RESET_DEDUPE_MS = 120;

const EVENT_SOURCE_BLOCKLIST = new Set([
  "event-bus",
  "app-events",
  "toast-events",
  "toast:clear",
  "toast:reset",
  "toast-api:clear",
  "toast-api:reset",
]);

/* =========================================================
   RUNTIME
========================================================= */

let clearRunning = false;
let resetRunning = false;

let lastClearEmitAt = 0;
let lastResetEmitAt = 0;

const DEDUPE = new Map();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;

  const text = safeText(value, "").toLowerCase();

  if (["true", "1", "yes", "si", "sí", "on", "ok"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;

  return Boolean(fallback);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function warn(...args) {
  try {
    AppCore?.utils?.warn?.("[ToastAPI]", ...args);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn("[ToastAPI]", ...args);
  } catch {}
}

function errorLog(...args) {
  try {
    AppCore?.utils?.error?.("[ToastAPI]", ...args);
    return;
  } catch {}

  try {
    console.error("[ToastAPI]", ...args);
  } catch {}
}

function emit(eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    source: SOURCE,
    version: TOAST_API_VERSION,
    at: iso(),
    ...safeObject(payload),
  };

  let hasBus = false;
  let emitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      hasBus = true;
      AppCore.events.emit(name, detail);
      emitted = true;
    }
  } catch {}

  /*
    No duplicar bus + window salvo petición explícita.
  */
  if ((options.window === true || !hasBus) && isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      emitted = true;
    } catch {}
  }

  return emitted;
}

function nextFrame(callback) {
  if (!isFn(callback)) return false;

  if (!isBrowser()) {
    try {
      callback();
    } catch {}
    return true;
  }

  try {
    window.requestAnimationFrame(() => {
      try {
        callback();
      } catch {}
    });

    return true;
  } catch {}

  try {
    window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);

    return true;
  } catch {
    return false;
  }
}

function delay(callback, ms = 0) {
  if (!isFn(callback)) return null;

  if (!isBrowser()) {
    try {
      callback();
    } catch {}
    return null;
  }

  try {
    return window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, Math.max(0, safeNumber(ms, 0)));
  } catch {
    try {
      callback();
    } catch {}

    return null;
  }
}

function eventSource(options = {}) {
  return safeText(
    options.source ||
      options.origin ||
      options.eventSource ||
      "",
    ""
  );
}

function shouldEmitClear(options = {}) {
  if (options.silent === true || options.emit === false) return false;

  const source = eventSource(options);

  if (source && EVENT_SOURCE_BLOCKLIST.has(source)) return false;

  const stamp = now();

  if (stamp - lastClearEmitAt < CLEAR_DEDUPE_MS) return false;

  lastClearEmitAt = stamp;
  return true;
}

function shouldEmitReset(options = {}) {
  if (options.silent === true || options.emit === false) return false;

  const source = eventSource(options);

  if (source && EVENT_SOURCE_BLOCKLIST.has(source)) return false;

  const stamp = now();

  if (stamp - lastResetEmitAt < RESET_DEDUPE_MS) return false;

  lastResetEmitAt = stamp;
  return true;
}

/* =========================================================
   DOM
========================================================= */

function ensureDom() {
  if (!isBrowser()) return null;

  try {
    ensureToastKeyframes();
  } catch (error) {
    warn("ensureToastKeyframes falló.", error);
  }

  try {
    return ensureToastContainer();
  } catch (error) {
    warn("ensureToastContainer falló.", error);
    return null;
  }
}

function appendNode(item) {
  if (!item?.toastEl) return false;

  const container = ensureDom();
  if (!container) return false;

  try {
    if (!item.toastEl.isConnected) {
      container.appendChild(item.toastEl);
    }

    return true;
  } catch (error) {
    warn("No se pudo insertar toast.", error);
    return false;
  }
}

function showNode(item) {
  if (!item?.toastEl) return false;

  nextFrame(() => {
    if (!item?.toastEl?.isConnected || item.dismissed) return;

    try {
      item.toastEl.classList.add("show");
      item.toastEl.removeAttribute("aria-hidden");
    } catch {}
  });

  return true;
}

function hideNode(item) {
  const node = item?.toastEl;
  if (!node) return false;

  try {
    node.classList.remove("show");
    node.classList.add("is-dismissing");
    node.setAttribute("aria-hidden", "true");
    return true;
  } catch {
    return false;
  }
}

function progressNode(node = null) {
  if (!node) return null;

  try {
    return node.querySelector(".toast-progress") || null;
  } catch {
    return null;
  }
}

function createNode(item) {
  if (!item) return null;

  try {
    return createToastNode({
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      closable: item.closable,
    });
  } catch (error) {
    warn("createToastNode falló.", error);
    return null;
  }
}

function patchNode(item) {
  if (!item?.toastEl) return false;

  try {
    patchToastNode(item);
    return true;
  } catch {
    return false;
  }
}

function replaceNode(item) {
  if (!item) return false;

  const next = createNode(item);
  if (!next) return false;

  try {
    if (item.toastEl?.isConnected) {
      item.toastEl.replaceWith(next);
    }

    item.toastEl = next;
    item.progressEl = progressNode(next);
    item.interactionsBound = false;

    return true;
  } catch (error) {
    warn("No se pudo reemplazar toast node.", error);

    item.toastEl = next;
    item.progressEl = progressNode(next);
    item.interactionsBound = false;

    return false;
  }
}

function syncNode(item, options = {}) {
  if (!item) return false;

  if (options.replaceNode === true || !item.toastEl) {
    replaceNode(item);
  } else if (!patchNode(item)) {
    replaceNode(item);
  }

  appendNode(item);
  bindInteractions(item);

  return true;
}

/* =========================================================
   ITEM
========================================================= */

function buildItem({
  id,
  type,
  title,
  message,
  duration,
  closable,
  toastEl,
  progressEl,
  useDefaultTitle,
  useDefaultMessage,
  meta = {},
} = {}) {
  const createdAt = now();

  return {
    id,
    type,
    title,
    message,

    duration,
    remaining: duration,
    startedAt: 0,
    timeoutId: null,

    closable: Boolean(closable),

    toastEl: toastEl || null,
    progressEl: progressEl || null,

    createdAt,
    updatedAt: createdAt,

    dismissed: false,
    dismissReason: "",

    useDefaultTitle: Boolean(useDefaultTitle),
    useDefaultMessage: Boolean(useDefaultMessage),

    interactionsBound: false,

    meta: safeObject(meta),
  };
}

function idFromOptions(options = {}) {
  return safeText(options.id || options.toastId || options.key, "") || nextToastId();
}

function normalizeInput(input = {}, maybeOptions = {}) {
  const source = isObject(input)
    ? {
        ...input,
        ...safeObject(maybeOptions),
      }
    : {
        ...safeObject(maybeOptions),
        message: input,
      };

  const type = normalizeToastType(source.type);

  const rawMessage =
    source.message !== undefined
      ? source.message
      : source.text;

  const useDefaultTitle = source.useDefaultTitle === true;

  const useDefaultMessage =
    source.useDefaultMessage !== undefined
      ? source.useDefaultMessage === true
      : !safeText(rawMessage, "") || type === TOAST_TYPE_LOADING;

  const title = resolveToastTitle(
    type,
    source.title,
    useDefaultTitle
  );

  const message = resolveToastMessage(
    type,
    source.message,
    source.text,
    useDefaultMessage
  );

  const duration = source.persist === true || source.persistent === true
    ? 0
    : normalizeToastDuration(type, source.duration);

  const closable = source.closable !== undefined
    ? source.closable !== false
    : type !== TOAST_TYPE_LOADING;

  return {
    id: idFromOptions(source),
    type,
    title,
    message,
    duration,
    closable,
    useDefaultTitle,
    useDefaultMessage,
    replace: source.replace !== false,
    replaceNode: source.replaceNode === true,
    dedupe: source.dedupe !== false,
    dedupeMs: Math.max(0, safeNumber(source.dedupeMs, DEFAULT_DEDUPE_MS)),
    dedupeKey: safeText(
      source.dedupeKey ||
        source.fingerprint ||
        `${type}:${safeText(title, "")}:${safeText(message, "")}`,
      ""
    ),
    meta: safeObject(source.meta),
  };
}

function shouldSkipDedupe(input) {
  if (!input?.dedupe || !input.dedupeKey) return false;

  const previous = DEDUPE.get(input.dedupeKey);
  const stamp = now();

  if (previous && stamp - previous.at < input.dedupeMs) {
    return previous.id || true;
  }

  DEDUPE.set(input.dedupeKey, {
    at: stamp,
    id: input.id,
  });

  return false;
}

function isPersistent(item) {
  return safeNumber(item?.duration, 0) <= 0;
}

/* =========================================================
   TIMERS / PROGRESS
========================================================= */

function clearTimer(item) {
  if (!item) return false;

  try {
    clearToastTimer(item);
    return true;
  } catch {
    return false;
  }
}

function syncProgress(item) {
  if (!item || item.dismissed) return false;

  if (isPersistent(item)) {
    item.remaining = 0;
    item.startedAt = 0;
    item.timeoutId = null;
    return true;
  }

  try {
    runToastProgress(item, item.duration);
    return true;
  } catch (error) {
    warn("runToastProgress falló.", error);
    return false;
  }
}

function syncTimer(item) {
  if (!item || item.dismissed) return false;

  clearTimer(item);

  if (isPersistent(item)) {
    item.remaining = 0;
    item.startedAt = 0;
    item.timeoutId = null;
    return true;
  }

  item.remaining = item.duration;
  item.startedAt = 0;

  try {
    startToastTimer(item);
    return true;
  } catch (error) {
    warn("startToastTimer falló.", error);
    return false;
  }
}

function bindInteractions(item) {
  const node = item?.toastEl;

  if (!node || item.interactionsBound) return false;

  try {
    node.addEventListener("mouseenter", () => pauseToastTimer(item));
    node.addEventListener("mouseleave", () => resumeToastTimer(item));
    node.addEventListener("focusin", () => pauseToastTimer(item));
    node.addEventListener("focusout", () => resumeToastTimer(item));

    item.interactionsBound = true;
    return true;
  } catch (error) {
    warn("No se pudieron vincular interacciones toast.", error);
    return false;
  }
}

/* =========================================================
   DESTROY / LIMIT
========================================================= */

function destroyItem(item) {
  if (!item) return false;

  clearTimer(item);

  try {
    removeToastNode(item);
  } catch {}

  try {
    deleteToastItem(item.id);
  } catch {}

  try {
    unmarkToastDismissing(item.id);
  } catch {}

  item.toastEl = null;
  item.progressEl = null;
  item.timeoutId = null;
  item.interactionsBound = false;

  return true;
}

function destroyById(id = "") {
  const item = getToastItem(id);
  return item ? destroyItem(item) : false;
}

function enforceLimit() {
  const active = getActiveToasts();
  let removed = 0;

  while (active.length > TOAST_MAX_ITEMS) {
    const oldest = active.shift();

    if (!oldest?.id) continue;

    if (
      dismissToast(oldest.id, {
        reason: "limit",
        emit: false,
        source: "toast-limit",
      })
    ) {
      removed += 1;
    }
  }

  return removed;
}

/* =========================================================
   PUBLIC: SHOW / UPDATE
========================================================= */

export function showToast(input = {}, maybeOptions = {}) {
  if (!isBrowser()) return null;

  const normalized = normalizeInput(input, maybeOptions);

  if (!normalized.message) {
    warn("showToast requiere message/text.");
    return null;
  }

  const duplicate = shouldSkipDedupe(normalized);

  if (duplicate) {
    return typeof duplicate === "string" ? duplicate : normalized.id;
  }

  if (!ensureDom()) return null;

  const existing = getToastItem(normalized.id);

  if (existing && !existing.dismissed && !isToastDismissing(normalized.id)) {
    if (normalized.replace) {
      return updateToast(normalized.id, {
        type: normalized.type,
        title: normalized.title,
        message: normalized.message,
        duration: normalized.duration,
        closable: normalized.closable,
        useDefaultTitle: normalized.useDefaultTitle,
        useDefaultMessage: normalized.useDefaultMessage,
        meta: normalized.meta,
        replaceNode: true,
      });
    }

    normalized.id = nextToastId();
  } else if (existing) {
    destroyItem(existing);
  }

  const toastEl = createNode(normalized);

  if (!toastEl) return null;

  const item = buildItem({
    ...normalized,
    toastEl,
    progressEl: progressNode(toastEl),
  });

  setToastItem(item.id, item);

  appendNode(item);
  bindInteractions(item);
  syncProgress(item);
  syncTimer(item);
  enforceLimit();
  showNode(item);

  try {
    emitToastShown(item);
  } catch (error) {
    warn("emitToastShown falló.", error);
  }

  return item.id;
}

export function updateToast(id = "", patch = {}) {
  const toastId = safeText(id, "");

  if (!toastId) return null;

  const item = getToastItem(toastId);

  if (!item || item.dismissed) return null;

  const input = safeObject(patch);

  const nextType = input.type !== undefined
    ? normalizeToastType(input.type)
    : item.type;

  const nextUseDefaultTitle = input.useDefaultTitle !== undefined
    ? input.useDefaultTitle === true
    : item.useDefaultTitle;

  const nextUseDefaultMessage = input.useDefaultMessage !== undefined
    ? input.useDefaultMessage === true
    : item.useDefaultMessage;

  const nextTitle = input.title !== undefined
    ? resolveToastTitle(nextType, input.title, nextUseDefaultTitle)
    : nextUseDefaultTitle
      ? getToastTitle(nextType)
      : item.title;

  const nextMessage = input.message !== undefined || input.text !== undefined
    ? resolveToastMessage(nextType, input.message, input.text, nextUseDefaultMessage)
    : nextUseDefaultMessage
      ? getToastMessage(nextType)
      : item.message;

  if (!nextMessage) {
    warn("updateToast requiere message/text.");
    return null;
  }

  const nextDuration =
    input.duration !== undefined ||
    input.persist !== undefined ||
    input.persistent !== undefined
      ? input.persist === true || input.persistent === true
        ? 0
        : normalizeToastDuration(nextType, input.duration)
      : item.duration;

  const nextClosable = input.closable !== undefined
    ? input.closable !== false
    : nextType !== TOAST_TYPE_LOADING && item.closable !== false;

  clearTimer(item);

  item.type = nextType;
  item.title = nextTitle;
  item.message = nextMessage;
  item.duration = nextDuration;
  item.remaining = nextDuration;
  item.startedAt = 0;
  item.closable = nextClosable;
  item.useDefaultTitle = nextUseDefaultTitle;
  item.useDefaultMessage = nextUseDefaultMessage;
  item.updatedAt = now();

  if (isObject(input.meta)) {
    item.meta = {
      ...safeObject(item.meta),
      ...input.meta,
    };
  }

  syncNode(item, {
    replaceNode: input.replaceNode === true,
  });

  syncProgress(item);
  syncTimer(item);
  showNode(item);

  try {
    emitToastUpdated(item);
  } catch (error) {
    warn("emitToastUpdated falló.", error);
  }

  return item.id;
}

/* =========================================================
   PUBLIC: DISMISS / CLEAR
========================================================= */

export function dismissToast(id = "", options = {}) {
  const toastId = safeText(id, "");

  if (!toastId) return false;

  const item = getToastItem(toastId);

  if (!item) return false;

  if (item.dismissed || isToastDismissing(toastId)) return false;

  const opts = safeObject(options);
  const reason = safeText(opts.reason, "dismiss");

  markToastDismissing(toastId);

  item.dismissed = true;
  item.dismissReason = reason;
  item.dismissedAt = now();

  clearTimer(item);

  const delayMs = prefersReducedMotion()
    ? TOAST_REDUCED_MOTION_EXIT_DURATION
    : safeNumber(opts.delay, TOAST_EXIT_DURATION);

  hideNode(item);

  const snapshot = {
    id: item.id,
    type: item.type,
    reason,
  };

  delay(() => {
    destroyItem(item);
  }, delayMs);

  try {
    emitToastDismissed(item);
  } catch (error) {
    warn("emitToastDismissed falló.", error);
  }

  return snapshot.id;
}

export function clearToasts(options = {}) {
  const opts = safeObject(options);

  if (clearRunning) return false;

  clearRunning = true;

  try {
    const ids = [...getToastIds()];
    const immediate = safeBool(opts.immediate, false);

    let cleared = 0;

    ids.forEach((id) => {
      if (immediate) {
        if (destroyById(id)) cleared += 1;
        return;
      }

      if (
        dismissToast(id, {
          reason: opts.reason || "clear",
          delay: opts.delay,
          emit: false,
          source: "toast-api:clear",
        })
      ) {
        cleared += 1;
      }
    });

    if (shouldEmitClear(opts)) {
      emit("toast:clear", {
        cleared,
        immediate,
        reason: opts.reason || "clear",
        source: opts.source || SOURCE,
      });
    }

    return true;
  } finally {
    clearRunning = false;
  }
}

/* =========================================================
   SHORTCUTS
========================================================= */

export function successToast(message = "", options = {}) {
  return showToast({
    ...safeObject(options),
    type: TOAST_TYPE_SUCCESS,
    message: safeText(message, ""),
    useDefaultMessage: !safeText(message, ""),
  });
}

export function errorToast(message = "", options = {}) {
  const text = message instanceof Error
    ? safeText(message.message, "Error inesperado")
    : safeText(message, "");

  return showToast({
    ...safeObject(options),
    type: TOAST_TYPE_ERROR,
    message: text,
    useDefaultMessage: !text,
    meta: {
      ...safeObject(options.meta),
      error: message instanceof Error ? message : options.error || null,
    },
  });
}

export function warningToast(message = "", options = {}) {
  return showToast({
    ...safeObject(options),
    type: TOAST_TYPE_WARNING,
    message: safeText(message, ""),
    useDefaultMessage: !safeText(message, ""),
  });
}

export function infoToast(message = "", options = {}) {
  return showToast({
    ...safeObject(options),
    type: TOAST_TYPE_INFO,
    message: safeText(message, ""),
    useDefaultMessage: !safeText(message, ""),
  });
}

export function loadingToast(message = "", options = {}) {
  return showToast({
    ...safeObject(options),
    type: TOAST_TYPE_LOADING,
    message: safeText(message, ""),
    useDefaultMessage: !safeText(message, ""),
    duration: 0,
    persist: true,
    closable: options.closable ?? false,
    dedupeMs: options.dedupeMs ?? 0,
  });
}

/* =========================================================
   LANGUAGE
========================================================= */

export function refreshToastLanguage(item = null) {
  if (!item || item.dismissed) return null;

  if (item.useDefaultTitle) {
    item.title = getToastTitle(item.type);
  }

  if (item.useDefaultMessage) {
    item.message = getToastMessage(item.type);
  }

  item.updatedAt = now();
  patchNode(item);

  return item;
}

export function refreshAllToastsLanguage() {
  const items = getToastItems();
  let refreshed = 0;

  items.forEach((item) => {
    if (refreshToastLanguage(item)) refreshed += 1;
  });

  emit("toast:language:refresh", {
    refreshed,
  });

  return refreshed;
}

/* =========================================================
   RESET
========================================================= */

export function resetToastApiState(options = {}) {
  const opts = safeObject(options);

  if (resetRunning) return false;

  resetRunning = true;

  try {
    const items = getToastItems();

    items.forEach((item) => {
      destroyItem(item);
    });

    try {
      resetToastStore();
    } catch (error) {
      errorLog("resetToastStore falló.", error);
    }

    DEDUPE.clear();

    if (shouldEmitReset(opts)) {
      emit("toast:reset", {
        count: items.length,
        reason: opts.reason || "reset",
        source: opts.source || SOURCE,
      });
    }

    return true;
  } finally {
    resetRunning = false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getToastApiSnapshot() {
  const items = getToastItems();

  return {
    version: TOAST_API_VERSION,

    count: items.length,
    ids: getToastIds(),
    maxItems: TOAST_MAX_ITEMS,
    activeCount: getActiveToasts().length,

    clearRunning,
    resetRunning,

    lastClearEmitAt,
    lastClearEmitAtIso: lastClearEmitAt ? iso(lastClearEmitAt) : "",

    lastResetEmitAt,
    lastResetEmitAtIso: lastResetEmitAt ? iso(lastResetEmitAt) : "",

    dedupeCount: DEDUPE.size,

    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      duration: item.duration,
      remaining: item.remaining,
      dismissed: Boolean(item.dismissed),
      dismissing: isToastDismissing(item.id),
      hasNode: Boolean(item.toastEl),
      connected: Boolean(item.toastEl?.isConnected),
      hasProgress: Boolean(item.progressEl),
      useDefaultTitle: Boolean(item.useDefaultTitle),
      useDefaultMessage: Boolean(item.useDefaultMessage),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || null,
    })),
  };
}

/* =========================================================
   ALIASES / DEFAULT
========================================================= */

export const show = showToast;
export const update = updateToast;
export const dismiss = dismissToast;
export const clear = clearToasts;

export const success = successToast;
export const error = errorToast;
export const warning = warningToast;
export const warn = warningToast;
export const info = infoToast;
export const loading = loadingToast;

export default {
  TOAST_API_VERSION,

  showToast,
  updateToast,
  dismissToast,
  clearToasts,

  show,
  update,
  dismiss,
  clear,

  successToast,
  errorToast,
  warningToast,
  infoToast,
  loadingToast,

  success,
  error,
  warning,
  warn,
  info,
  loading,

  refreshToastLanguage,
  refreshAllToastsLanguage,

  resetToastApiState,
  getToastApiSnapshot,
};
