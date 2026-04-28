/* =========================================================
   Onion SPA - Toast API
   Archivo: src/ui/toast/api.js

   Responsabilidades:
   - api pública del sistema toast
   - show / update / dismiss / clear
   - atajos success / error / warning / info / loading
   - integrar store + dom + timers + events
   - limitar máximo de toasts
   - refresco live de idioma
   - soportar replace por id de forma estable
   - endurecer dismiss / clear / reset
   - proteger SSR/no-browser
   - evitar timers huérfanos
   - evitar nodos zombie
   - mantener estado store/dom/timers consistente

   FIX CRÍTICO:
   - evitar recursión infinita clearToasts() -> toast:clear -> clearToasts()
   - safeEmit no duplica AppCore.events + window cuando existe bus
   - clearToasts soporta silent / emit:false / source app-events
   - clearToasts queda protegido por lock anti reentrada
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  TOAST_MAX_ITEMS,
  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
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
   RUNTIME GUARDS
========================================================= */

let clearToastsRunning = false;
let resetToastApiRunning = false;
let lastClearToastsEmitAt = 0;
let lastResetToastEmitAt = 0;

const CLEAR_TOASTS_EMIT_DEDUPE_MS = 120;
const RESET_TOAST_EMIT_DEDUPE_MS = 120;

const EVENT_SOURCE_BLOCKLIST = new Set([
  "event-bus",
  "app-events",
  "toast-events",
  "toast:clear",
  "toast:reset",
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "on"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(key)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeWarn(...args) {
  let emittedByCore = false;

  try {
    if (typeof AppCore?.utils?.warn === "function") {
      AppCore.utils.warn(
        "[ToastAPI]",
        ...args
      );

      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.warn(
      "[ToastAPI]",
      ...args
    );
  } catch {}
}

function safeError(...args) {
  let emittedByCore = false;

  try {
    if (typeof AppCore?.utils?.error === "function") {
      AppCore.utils.error(
        "[ToastAPI]",
        ...args
      );

      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.error(
      "[ToastAPI]",
      ...args
    );
  } catch {}
}

function safeEmit(eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    isObject(options)
      ? options
      : {};

  let busAvailable = false;
  let emitted = false;

  try {
    if (
      typeof AppCore?.events?.emit === "function"
    ) {
      busAvailable = true;

      AppCore.events.emit(
        name,
        payload
      );

      emitted = true;
    }
  } catch {}

  /*
    CRÍTICO:
    Si existe AppCore.events, NO duplicamos en window por defecto.
    Emitir por bus + window puede duplicar listeners y provocar loops.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    } catch {}
  }

  return emitted;
}

function nextFrame(callback) {
  if (!isFunction(callback)) {
    return false;
  }

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
  } catch {}

  try {
    callback();
  } catch {}

  return true;
}

function safeDelay(callback, delay = 0) {
  if (!isFunction(callback)) {
    return null;
  }

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
    }, Math.max(0, safeNumber(delay, 0)));
  } catch {}

  try {
    callback();
  } catch {}

  return null;
}

function getEventSource(options = {}) {
  return safeText(
    options?.source ||
      options?.origin ||
      options?.eventSource ||
      "",
    ""
  );
}

function shouldEmitClearToastsEvent(options = {}) {
  if (options?.silent === true) {
    return false;
  }

  if (options?.emit === false) {
    return false;
  }

  const source =
    getEventSource(options);

  if (
    source &&
    EVENT_SOURCE_BLOCKLIST.has(source)
  ) {
    return false;
  }

  const now =
    Date.now();

  if (
    now - lastClearToastsEmitAt <
    CLEAR_TOASTS_EMIT_DEDUPE_MS
  ) {
    return false;
  }

  lastClearToastsEmitAt =
    now;

  return true;
}

function shouldEmitResetToastEvent(options = {}) {
  if (options?.silent === true) {
    return false;
  }

  if (options?.emit === false) {
    return false;
  }

  const source =
    getEventSource(options);

  if (
    source &&
    EVENT_SOURCE_BLOCKLIST.has(source)
  ) {
    return false;
  }

  const now =
    Date.now();

  if (
    now - lastResetToastEmitAt <
    RESET_TOAST_EMIT_DEDUPE_MS
  ) {
    return false;
  }

  lastResetToastEmitAt =
    now;

  return true;
}

/* =========================================================
   DOM SAFETY
========================================================= */

function ensureToastDom() {
  try {
    ensureToastKeyframes();
  } catch (error) {
    safeWarn(
      "No se pudieron asegurar keyframes.",
      error
    );
  }

  try {
    return ensureToastContainer();
  } catch (error) {
    safeWarn(
      "No se pudo asegurar contenedor.",
      error
    );

    return null;
  }
}

function appendToastNode(item) {
  if (!item?.toastEl) {
    return false;
  }

  const container = ensureToastDom();

  if (!container) {
    return false;
  }

  try {
    if (!item.toastEl.isConnected) {
      container.appendChild(item.toastEl);
    }

    return true;
  } catch (error) {
    safeWarn(
      "No se pudo insertar toast en DOM.",
      error
    );

    return false;
  }
}

function showToastNode(item) {
  if (!item?.toastEl) {
    return false;
  }

  nextFrame(() => {
    if (
      item.toastEl?.isConnected &&
      !item.dismissed
    ) {
      item.toastEl.classList.add("show");
      item.toastEl.removeAttribute("aria-hidden");
    }
  });

  return true;
}

function hideToastNode(item) {
  const toastEl =
    item?.toastEl || null;

  if (!toastEl) {
    return false;
  }

  try {
    toastEl.classList.remove("show");
    toastEl.style.pointerEvents = "none";
    toastEl.setAttribute("aria-hidden", "true");

    return true;
  } catch {}

  return false;
}

/* =========================================================
   ITEM FACTORY
========================================================= */

function buildToastItem({
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

    createdAt: Date.now(),
    updatedAt: Date.now(),

    dismissed: false,

    useDefaultTitle: Boolean(useDefaultTitle),
    useDefaultMessage: Boolean(useDefaultMessage),

    interactionsBound: false,

    meta: isObject(meta)
      ? meta
      : {},
  };
}

function resolveToastId(options = {}) {
  const explicit =
    safeText(options.id, "");

  return explicit || nextToastId();
}

function resolveUseDefaultTitle(options = {}) {
  return options.useDefaultTitle === true;
}

function resolveUseDefaultMessage(type, options = {}) {
  const explicit =
    options.useDefaultMessage;

  if (explicit !== undefined) {
    return explicit === true;
  }

  const message =
    safeText(
      options.message ??
        options.text,
      ""
    );

  return (
    !message ||
    type === TOAST_TYPE_LOADING
  );
}

function resolveToastDuration(type, options = {}) {
  if (
    options.persist === true ||
    options.persistent === true
  ) {
    return 0;
  }

  return normalizeToastDuration(
    type,
    options.duration
  );
}

function resolveToastClosable(type, options = {}) {
  if (options.closable !== undefined) {
    return options.closable !== false;
  }

  if (type === TOAST_TYPE_LOADING) {
    return false;
  }

  return true;
}

function normalizeToastInput(options = {}) {
  const input =
    isObject(options)
      ? options
      : {
          message: safeText(options, ""),
        };

  const type =
    normalizeToastType(input.type);

  const id =
    resolveToastId(input);

  const useDefaultTitle =
    resolveUseDefaultTitle(input);

  const useDefaultMessage =
    resolveUseDefaultMessage(
      type,
      input
    );

  const title =
    resolveToastTitle(
      type,
      input.title,
      useDefaultTitle
    );

  const message =
    resolveToastMessage(
      type,
      input.message,
      input.text,
      useDefaultMessage
    );

  const duration =
    resolveToastDuration(
      type,
      input
    );

  const closable =
    resolveToastClosable(
      type,
      input
    );

  return {
    id,
    type,
    title,
    message,
    duration,
    closable,
    useDefaultTitle,
    useDefaultMessage,
    meta:
      isObject(input.meta)
        ? input.meta
        : {},
  };
}

/* =========================================================
   TIMER / PROGRESS
========================================================= */

function isPersistedToast(item) {
  return Number(item?.duration || 0) <= 0;
}

function syncToastProgress(item) {
  if (
    !item ||
    item.dismissed
  ) {
    return false;
  }

  if (isPersistedToast(item)) {
    try {
      if (item.progressEl) {
        item.progressEl.style.animation = "none";
        item.progressEl.style.opacity = "0";
        item.progressEl.style.transform = "";
      }
    } catch {}

    return true;
  }

  try {
    runToastProgress(
      item,
      item.duration
    );

    return true;
  } catch (error) {
    safeWarn(
      "No se pudo iniciar progreso toast.",
      error
    );

    return false;
  }
}

function syncToastTimer(item) {
  if (
    !item ||
    item.dismissed
  ) {
    return false;
  }

  try {
    clearToastTimer(item);
  } catch {}

  if (isPersistedToast(item)) {
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
    safeWarn(
      "No se pudo iniciar timer toast.",
      error
    );

    return false;
  }
}

/* =========================================================
   INTERACTIONS
========================================================= */

function registerToastInteractions(item) {
  const toastEl =
    item?.toastEl || null;

  if (
    !toastEl ||
    item.interactionsBound
  ) {
    return false;
  }

  try {
    toastEl.addEventListener(
      "mouseenter",
      () => {
        pauseToastTimer(item);
      }
    );

    toastEl.addEventListener(
      "mouseleave",
      () => {
        resumeToastTimer(item);
      }
    );

    toastEl.addEventListener(
      "focusin",
      () => {
        pauseToastTimer(item);
      }
    );

    toastEl.addEventListener(
      "focusout",
      () => {
        resumeToastTimer(item);
      }
    );

    item.interactionsBound = true;

    return true;
  } catch (error) {
    safeWarn(
      "No se pudieron registrar interacciones toast.",
      error
    );

    return false;
  }
}

/* =========================================================
   DESTROY
========================================================= */

function destroyToastItem(item) {
  if (!item) {
    return false;
  }

  try {
    clearToastTimer(item);
  } catch {}

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

function destroyToastById(id) {
  const item =
    getToastItem(id);

  if (!item) {
    return false;
  }

  return destroyToastItem(item);
}

/* =========================================================
   LIMIT
========================================================= */

function enforceToastLimit() {
  const active =
    getActiveToasts();

  let removed = 0;

  while (
    active.length > TOAST_MAX_ITEMS
  ) {
    const oldest =
      active.shift();

    if (!oldest?.id) {
      continue;
    }

    if (
      dismissToast(
        oldest.id,
        {
          reason: "limit",
          emit: false,
          source: "toast-limit",
        }
      )
    ) {
      removed += 1;
    }
  }

  return removed;
}

/* =========================================================
   NODE REPLACE / PATCH
========================================================= */

function createFreshToastNode(item) {
  if (!item) {
    return null;
  }

  try {
    return createToastNode({
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      closable: item.closable,
    });
  } catch (error) {
    safeWarn(
      "No se pudo crear nodo toast.",
      error
    );

    return null;
  }
}

function createOrReplaceToastNode(item) {
  if (!item) {
    return item;
  }

  const nextNode =
    createFreshToastNode(item);

  if (!nextNode) {
    return item;
  }

  try {
    if (item.toastEl?.isConnected) {
      item.toastEl.replaceWith(nextNode);
    }

    item.toastEl = nextNode;
    item.progressEl =
      nextNode.querySelector(".toast-progress");

    item.interactionsBound = false;
  } catch (error) {
    safeWarn(
      "No se pudo reemplazar nodo toast.",
      error
    );
  }

  return item;
}

function patchExistingToastNode(item) {
  if (!item?.toastEl) {
    return false;
  }

  try {
    patchToastNode(item);
    return true;
  } catch {
    return false;
  }
}

function syncToastNode(item, { replaceNode = false } = {}) {
  if (!item) {
    return false;
  }

  if (
    replaceNode ||
    !item.toastEl
  ) {
    createOrReplaceToastNode(item);
  } else if (!patchExistingToastNode(item)) {
    createOrReplaceToastNode(item);
  }

  appendToastNode(item);
  registerToastInteractions(item);

  return true;
}

/* =========================================================
   LANGUAGE
========================================================= */

export function refreshToastLanguage(item) {
  if (
    !item ||
    item.dismissed
  ) {
    return item;
  }

  if (item.useDefaultTitle) {
    item.title =
      getToastTitle(item.type);
  }

  if (item.useDefaultMessage) {
    item.message =
      getToastMessage(item.type);
  }

  item.updatedAt = Date.now();

  patchExistingToastNode(item);

  return item;
}

export function refreshAllToastsLanguage() {
  const items =
    getToastItems();

  let refreshed = 0;

  items.forEach((item) => {
    if (
      refreshToastLanguage(item)
    ) {
      refreshed += 1;
    }
  });

  safeEmit(
    "toast:language:refresh",
    {
      refreshed,
    }
  );

  return true;
}

/* =========================================================
   SHOW
========================================================= */

export function showToast(options = {}) {
  const normalized =
    normalizeToastInput(options);

  if (!normalized.message) {
    safeWarn(
      "showToast requiere message/text."
    );

    return null;
  }

  const container =
    ensureToastDom();

  if (!container) {
    return null;
  }

  const existing =
    getToastItem(normalized.id);

  if (existing) {
    return updateToast(
      normalized.id,
      {
        type:
          normalized.type,
        title:
          normalized.title,
        message:
          normalized.message,
        duration:
          normalized.duration,
        closable:
          normalized.closable,
        useDefaultTitle:
          normalized.useDefaultTitle,
        useDefaultMessage:
          normalized.useDefaultMessage,
        meta:
          normalized.meta,
        replaceNode:
          true,
      }
    );
  }

  const toastEl =
    createToastNode({
      id:
        normalized.id,
      type:
        normalized.type,
      title:
        normalized.title,
      message:
        normalized.message,
      closable:
        normalized.closable,
    });

  const item =
    buildToastItem({
      id:
        normalized.id,
      type:
        normalized.type,
      title:
        normalized.title,
      message:
        normalized.message,
      duration:
        normalized.duration,
      closable:
        normalized.closable,
      toastEl,
      progressEl:
        toastEl?.querySelector?.(".toast-progress") ||
        null,
      useDefaultTitle:
        normalized.useDefaultTitle,
      useDefaultMessage:
        normalized.useDefaultMessage,
      meta:
        normalized.meta,
    });

  setToastItem(
    item.id,
    item
  );

  appendToastNode(item);
  registerToastInteractions(item);
  syncToastProgress(item);
  syncToastTimer(item);
  enforceToastLimit();
  showToastNode(item);

  try {
    emitToastShown(item);
  } catch (error) {
    safeWarn(
      "emitToastShown falló.",
      error
    );
  }

  return item.id;
}

/* =========================================================
   UPDATE
========================================================= */

export function updateToast(id, patch = {}) {
  const normalizedId =
    safeText(id, "");

  if (!normalizedId) {
    return null;
  }

  const item =
    getToastItem(normalizedId);

  if (
    !item ||
    item.dismissed
  ) {
    return null;
  }

  const patchObject =
    isObject(patch)
      ? patch
      : {};

  const nextType =
    patchObject.type !== undefined
      ? normalizeToastType(
          patchObject.type
        )
      : item.type;

  const nextUseDefaultTitle =
    patchObject.useDefaultTitle !== undefined
      ? patchObject.useDefaultTitle === true
      : item.useDefaultTitle;

  const nextUseDefaultMessage =
    patchObject.useDefaultMessage !== undefined
      ? patchObject.useDefaultMessage === true
      : item.useDefaultMessage;

  const nextTitle =
    patchObject.title !== undefined
      ? resolveToastTitle(
          nextType,
          patchObject.title,
          nextUseDefaultTitle
        )
      : (
          nextUseDefaultTitle
            ? getToastTitle(nextType)
            : item.title
        );

  const nextMessage =
    patchObject.message !== undefined ||
    patchObject.text !== undefined
      ? resolveToastMessage(
          nextType,
          patchObject.message,
          patchObject.text,
          nextUseDefaultMessage
        )
      : (
          nextUseDefaultMessage
            ? getToastMessage(nextType)
            : item.message
        );

  if (!nextMessage) {
    safeWarn(
      "updateToast requiere message/text."
    );

    return null;
  }

  const nextDuration =
    patchObject.duration !== undefined ||
    patchObject.persist !== undefined ||
    patchObject.persistent !== undefined
      ? resolveToastDuration(
          nextType,
          patchObject
        )
      : item.duration;

  const nextClosable =
    patchObject.closable !== undefined
      ? patchObject.closable !== false
      : (
          nextType === TOAST_TYPE_LOADING
            ? false
            : item.closable
        );

  try {
    clearToastTimer(item);
  } catch {}

  item.type = nextType;
  item.title = nextTitle;
  item.message = nextMessage;
  item.duration = nextDuration;
  item.remaining = nextDuration;
  item.startedAt = 0;
  item.closable = nextClosable;
  item.useDefaultTitle = nextUseDefaultTitle;
  item.useDefaultMessage = nextUseDefaultMessage;
  item.updatedAt = Date.now();

  if (isObject(patchObject.meta)) {
    item.meta = {
      ...(isObject(item.meta) ? item.meta : {}),
      ...patchObject.meta,
    };
  }

  syncToastNode(
    item,
    {
      replaceNode:
        patchObject.replaceNode === true,
    }
  );

  syncToastProgress(item);
  syncToastTimer(item);
  showToastNode(item);

  try {
    emitToastUpdated(item);
  } catch (error) {
    safeWarn(
      "emitToastUpdated falló.",
      error
    );
  }

  return item.id;
}

/* =========================================================
   DISMISS
========================================================= */

export function dismissToast(id, options = {}) {
  const normalizedId =
    safeText(id, "");

  if (!normalizedId) {
    return false;
  }

  const item =
    getToastItem(normalizedId);

  if (!item) {
    return false;
  }

  if (
    item.dismissed ||
    isToastDismissing(normalizedId)
  ) {
    return false;
  }

  const reason =
    safeText(
      options.reason,
      "dismiss"
    );

  markToastDismissing(normalizedId);

  item.dismissed = true;
  item.dismissReason = reason;
  item.dismissedAt = Date.now();

  try {
    clearToastTimer(item);
  } catch {}

  const toastEl =
    item.toastEl;

  if (!toastEl) {
    destroyToastItem(item);

    try {
      emitToastDismissed(item);
    } catch {}

    return true;
  }

  hideToastNode(item);

  const delay =
    prefersReducedMotion()
      ? 0
      : safeNumber(
          options.delay,
          220
        );

  safeDelay(() => {
    destroyToastItem(item);
  }, delay);

  try {
    emitToastDismissed(item);
  } catch (error) {
    safeWarn(
      "emitToastDismissed falló.",
      error
    );
  }

  return true;
}

/* =========================================================
   CLEAR
========================================================= */

export function clearToasts(options = {}) {
  const opts =
    isObject(options)
      ? options
      : {};

  /*
    CRÍTICO:
    Si toast:clear vuelve a llamar clearToasts() desde events.js,
    cortamos la reentrada en seco.
  */
  if (clearToastsRunning) {
    return false;
  }

  clearToastsRunning = true;

  try {
    const immediate =
      safeBool(
        opts.immediate,
        false
      );

    const ids =
      [...getToastIds()];

    let cleared = 0;

    ids.forEach((id) => {
      if (immediate) {
        if (destroyToastById(id)) {
          cleared += 1;
        }

        return;
      }

      if (
        dismissToast(
          id,
          {
            reason:
              opts.reason ||
              "clear",
            delay:
              opts.delay,
            emit:
              false,
            source:
              "clear-toasts",
          }
        )
      ) {
        cleared += 1;
      }
    });

    if (
      shouldEmitClearToastsEvent(opts)
    ) {
      safeEmit(
        "toast:clear",
        {
          cleared,
          immediate,
          reason:
            opts.reason ||
            "clear",
          source:
            opts.source ||
            "toast-api",
        }
      );
    }

    return true;
  } finally {
    clearToastsRunning = false;
  }
}

/* =========================================================
   SHORTCUTS
========================================================= */

export function successToast(message = "", options = {}) {
  const normalizedMessage =
    safeText(message, "");

  return showToast({
    ...options,
    type: TOAST_TYPE_SUCCESS,
    message: normalizedMessage,
    useDefaultMessage:
      !normalizedMessage,
  });
}

export function errorToast(message = "", options = {}) {
  const normalizedMessage =
    message instanceof Error
      ? safeText(
          message.message,
          "Error inesperado"
        )
      : safeText(message, "");

  return showToast({
    ...options,
    type: TOAST_TYPE_ERROR,
    message: normalizedMessage,
    useDefaultMessage:
      !normalizedMessage,
    meta: {
      ...(isObject(options.meta) ? options.meta : {}),
      error:
        message instanceof Error
          ? message
          : options.error || null,
    },
  });
}

export function warningToast(message = "", options = {}) {
  const normalizedMessage =
    safeText(message, "");

  return showToast({
    ...options,
    type: TOAST_TYPE_WARNING,
    message: normalizedMessage,
    useDefaultMessage:
      !normalizedMessage,
  });
}

export function infoToast(message = "", options = {}) {
  const normalizedMessage =
    safeText(message, "");

  return showToast({
    ...options,
    type: TOAST_TYPE_INFO,
    message: normalizedMessage,
    useDefaultMessage:
      !normalizedMessage,
  });
}

export function loadingToast(message = "", options = {}) {
  const normalizedMessage =
    safeText(message, "");

  return showToast({
    ...options,
    type: TOAST_TYPE_LOADING,
    message: normalizedMessage,
    useDefaultMessage:
      !normalizedMessage,
    duration: 0,
    persist: true,
    closable:
      options.closable ??
      false,
  });
}

/* =========================================================
   RESET
========================================================= */

export function resetToastApiState(options = {}) {
  const opts =
    isObject(options)
      ? options
      : {};

  if (resetToastApiRunning) {
    return false;
  }

  resetToastApiRunning = true;

  try {
    const items =
      getToastItems();

    items.forEach((item) => {
      try {
        clearToastTimer(item);
      } catch {}

      try {
        removeToastNode(item);
      } catch {}

      try {
        unmarkToastDismissing(item.id);
      } catch {}
    });

    try {
      resetToastStore();
    } catch (error) {
      safeError(
        "resetToastStore falló.",
        error
      );
    }

    if (
      shouldEmitResetToastEvent(opts)
    ) {
      safeEmit(
        "toast:reset",
        {
          count:
            items.length,
          reason:
            opts.reason ||
            "reset",
          source:
            opts.source ||
            "toast-api",
        }
      );
    }

    return true;
  } finally {
    resetToastApiRunning = false;
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getToastApiSnapshot() {
  const items =
    getToastItems();

  return {
    count:
      items.length,

    ids:
      getToastIds(),

    maxItems:
      TOAST_MAX_ITEMS,

    activeCount:
      getActiveToasts().length,

    clearToastsRunning,
    resetToastApiRunning,
    lastClearToastsEmitAt,
    lastResetToastEmitAt,

    items:
      items.map((item) => ({
        id:
          item.id,

        type:
          item.type,

        duration:
          item.duration,

        remaining:
          item.remaining,

        dismissed:
          Boolean(item.dismissed),

        dismissing:
          isToastDismissing(item.id),

        hasNode:
          Boolean(item.toastEl),

        connected:
          Boolean(item.toastEl?.isConnected),

        hasProgress:
          Boolean(item.progressEl),

        useDefaultTitle:
          Boolean(item.useDefaultTitle),

        useDefaultMessage:
          Boolean(item.useDefaultMessage),

        createdAt:
          item.createdAt,

        updatedAt:
          item.updatedAt || null,
      })),
  };
}

export default {
  showToast,
  updateToast,
  dismissToast,
  clearToasts,

  successToast,
  errorToast,
  warningToast,
  infoToast,
  loadingToast,

  refreshToastLanguage,
  refreshAllToastsLanguage,

  resetToastApiState,
  getToastApiSnapshot,
};
