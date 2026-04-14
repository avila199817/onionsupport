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
   INTERNAL
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
    toastEl,
    progressEl,
    createdAt: Date.now(),
    dismissed: false,
    useDefaultTitle: Boolean(useDefaultTitle),
    useDefaultMessage: Boolean(useDefaultMessage),
    interactionsBound: false,
  };
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {}
}

function isPersistedToast(item) {
  return Number(item?.duration || 0) <= 0;
}

function syncToastProgress(item) {
  if (!item || item.dismissed) {
    return;
  }

  if (isPersistedToast(item)) {
    if (item?.progressEl) {
      item.progressEl.style.animation = "none";
      item.progressEl.style.opacity = "0";
      item.progressEl.style.transform = "";
    }
    return;
  }

  runToastProgress(item, item.duration);
}

function syncToastTimer(item) {
  if (!item || item.dismissed) {
    return;
  }

  clearToastTimer(item);

  if (isPersistedToast(item)) {
    item.remaining = 0;
    item.startedAt = 0;
    return;
  }

  item.remaining = item.duration;
  item.startedAt = 0;
  startToastTimer(item);
}

function registerToastInteractions(item) {
  const toastEl = item?.toastEl;

  if (!toastEl || item?.interactionsBound) {
    return;
  }

  toastEl.addEventListener("mouseenter", () => {
    pauseToastTimer(item);
  });

  toastEl.addEventListener("mouseleave", () => {
    resumeToastTimer(item);
  });

  item.interactionsBound = true;
}

function destroyToastItem(item) {
  if (!item) {
    return;
  }

  clearToastTimer(item);
  removeToastNode(item);

  deleteToastItem(item.id);
  unmarkToastDismissing(item.id);
}

function enforceToastLimit() {
  const active = getActiveToasts();

  while (active.length > TOAST_MAX_ITEMS) {
    const oldest = active.shift();

    if (oldest?.id) {
      dismissToast(oldest.id);
    }
  }
}

function createOrReplaceToastNode(item) {
  if (!item) {
    return item;
  }

  const nextNode = createToastNode({
    id: item.id,
    type: item.type,
    title: item.title,
    message: item.message,
    closable: item.closable,
  });

  if (item.toastEl?.isConnected) {
    item.toastEl.replaceWith(nextNode);
  }

  item.toastEl = nextNode;
  item.progressEl = nextNode.querySelector(".toast-progress");
  item.interactionsBound = false;

  return item;
}

/* =========================================================
   LANGUAGE
========================================================= */

export function refreshToastLanguage(item) {
  if (!item || item.dismissed) {
    return item;
  }

  if (item.useDefaultTitle) {
    item.title = getToastTitle(item.type);
  }

  if (item.useDefaultMessage) {
    item.message = getToastMessage(item.type);
  }

  patchToastNode(item);

  return item;
}

export function refreshAllToastsLanguage() {
  const items = getToastItems();

  items.forEach((item) => {
    refreshToastLanguage(item);
  });

  return true;
}

/* =========================================================
   SHOW
========================================================= */

export function showToast(options = {}) {
  ensureToastKeyframes();

  const container = ensureToastContainer();

  if (!container) {
    return null;
  }

  const type = normalizeToastType(options.type);
  const id = safeText(options.id, "") || nextToastId();

  const useDefaultTitle =
    options.useDefaultTitle === true;

  const useDefaultMessage =
    options.useDefaultMessage === true ||
    (
      type === TOAST_TYPE_LOADING &&
      !safeText(options.message ?? options.text, "")
    );

  const title = resolveToastTitle(
    type,
    options.title,
    useDefaultTitle
  );

  const message = resolveToastMessage(
    type,
    options.message,
    options.text,
    useDefaultMessage
  );

  if (!message) {
    safeWarn("[Toast] show requiere message/text.");
    return null;
  }

  const duration = normalizeToastDuration(
    type,
    options.duration
  );

  const closable = options.closable !== false;

  const existing = getToastItem(id);

  if (existing) {
    return updateToast(id, {
      type,
      title,
      message,
      duration,
      closable,
      useDefaultTitle,
      useDefaultMessage,
    });
  }

  const toastEl = createToastNode({
    id,
    type,
    title,
    message,
    closable,
  });

  const item = buildToastItem({
    id,
    type,
    title,
    message,
    duration,
    closable,
    toastEl,
    progressEl: toastEl.querySelector(".toast-progress"),
    useDefaultTitle,
    useDefaultMessage,
  });

  setToastItem(id, item);
  container.appendChild(toastEl);

  registerToastInteractions(item);
  syncToastProgress(item);
  syncToastTimer(item);
  enforceToastLimit();

  requestAnimationFrame(() => {
    if (item.toastEl?.isConnected && !item.dismissed) {
      item.toastEl.classList.add("show");
    }
  });

  emitToastShown(item);

  return id;
}

/* =========================================================
   UPDATE
========================================================= */

export function updateToast(id, patch = {}) {
  const item = getToastItem(id);

  if (!item || item.dismissed) {
    return null;
  }

  const nextType =
    patch.type !== undefined
      ? normalizeToastType(patch.type)
      : item.type;

  const nextUseDefaultTitle =
    patch.useDefaultTitle !== undefined
      ? patch.useDefaultTitle === true
      : item.useDefaultTitle;

  const nextUseDefaultMessage =
    patch.useDefaultMessage !== undefined
      ? patch.useDefaultMessage === true
      : item.useDefaultMessage;

  const nextTitle =
    patch.title !== undefined
      ? resolveToastTitle(
          nextType,
          patch.title,
          nextUseDefaultTitle
        )
      : item.title;

  const nextMessage =
    patch.message !== undefined || patch.text !== undefined
      ? resolveToastMessage(
          nextType,
          patch.message,
          patch.text,
          nextUseDefaultMessage
        )
      : item.message;

  if (!nextMessage) {
    safeWarn("[Toast] update requiere message/text.");
    return null;
  }

  const nextDuration =
    patch.duration !== undefined
      ? normalizeToastDuration(
          nextType,
          patch.duration
        )
      : item.duration;

  const nextClosable =
    patch.closable !== undefined
      ? patch.closable !== false
      : item.closable;

  clearToastTimer(item);

  item.type = nextType;
  item.title = nextTitle;
  item.message = nextMessage;
  item.duration = nextDuration;
  item.remaining = nextDuration;
  item.startedAt = 0;
  item.closable = nextClosable;
  item.useDefaultTitle = nextUseDefaultTitle;
  item.useDefaultMessage = nextUseDefaultMessage;

  createOrReplaceToastNode(item);

  if (!item.toastEl?.isConnected) {
    ensureToastContainer()?.appendChild(item.toastEl);
  }

  registerToastInteractions(item);
  syncToastProgress(item);
  syncToastTimer(item);

  requestAnimationFrame(() => {
    if (item.toastEl?.isConnected && !item.dismissed) {
      item.toastEl.classList.add("show");
    }
  });

  emitToastUpdated(item);

  return item.id;
}

/* =========================================================
   DISMISS
========================================================= */

export function dismissToast(id) {
  const normalizedId = safeText(id, "");

  if (!normalizedId) {
    return false;
  }

  const item = getToastItem(normalizedId);

  if (!item) {
    return false;
  }

  if (item.dismissed) {
    return false;
  }

  if (isToastDismissing(normalizedId)) {
    return false;
  }

  markToastDismissing(normalizedId);
  item.dismissed = true;

  clearToastTimer(item);

  const toastEl = item.toastEl;

  if (!toastEl) {
    destroyToastItem(item);
    emitToastDismissed(item);
    return true;
  }

  toastEl.classList.remove("show");
  toastEl.style.pointerEvents = "none";

  const delay = prefersReducedMotion() ? 0 : 220;

  window.setTimeout(() => {
    destroyToastItem(item);
  }, delay);

  emitToastDismissed(item);

  return true;
}

/* =========================================================
   CLEAR
========================================================= */

export function clearToasts() {
  const ids = [...getToastIds()];

  ids.forEach((id) => {
    dismissToast(id);
  });

  return true;
}

/* =========================================================
   SHORTCUTS
========================================================= */

export function successToast(message = "", options = {}) {
  const normalizedMessage = safeText(message, "");

  return showToast({
    ...options,
    type: TOAST_TYPE_SUCCESS,
    message: normalizedMessage,
    useDefaultMessage: !normalizedMessage,
  });
}

export function errorToast(message = "", options = {}) {
  const normalizedMessage = safeText(message, "");

  return showToast({
    ...options,
    type: TOAST_TYPE_ERROR,
    message: normalizedMessage,
    useDefaultMessage: !normalizedMessage,
  });
}

export function warningToast(message = "", options = {}) {
  const normalizedMessage = safeText(message, "");

  return showToast({
    ...options,
    type: TOAST_TYPE_WARNING,
    message: normalizedMessage,
    useDefaultMessage: !normalizedMessage,
  });
}

export function infoToast(message = "", options = {}) {
  const normalizedMessage = safeText(message, "");

  return showToast({
    ...options,
    type: TOAST_TYPE_INFO,
    message: normalizedMessage,
    useDefaultMessage: !normalizedMessage,
  });
}

export function loadingToast(message = "", options = {}) {
  const normalizedMessage = safeText(message, "");

  return showToast({
    ...options,
    type: TOAST_TYPE_LOADING,
    message: normalizedMessage,
    useDefaultMessage: !normalizedMessage,
    duration: 0,
    closable: options.closable ?? false,
  });
}

/* =========================================================
   RESET
========================================================= */

export function resetToastApiState() {
  const items = getToastItems();

  items.forEach((item) => {
    try {
      clearToastTimer(item);
      removeToastNode(item);
    } catch {}
  });

  resetToastStore();

  return true;
}
