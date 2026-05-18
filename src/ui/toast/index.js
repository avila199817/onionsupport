/* =========================================================
   Onion Support - Toast
   Archivo: /src/ui/toast/index.js

   Responsabilidad:
   - Toast UI mínimo autosuficiente.
   - API pública única.
   - Auto-init al primer uso.
   - DOM seguro con textContent.
   - Registro en AppCore/window.
   - Sin submódulos.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store global.
   - Sin i18n complejo.
   - Sin CSS runtime.
   - Sin CustomEvent.
   - Sin redeclaraciones.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";

export const TOAST_MODULE_VERSION = "simple";

const SOURCE = "ui.toast";
const GLOBAL_KEY = "__ONION_TOAST__";
const CONTAINER_ID = "toast-container";
const MAX_TOASTS = 5;

const VALID_TYPES = new Set(["success", "error", "warning", "info", "loading"]);

const DEFAULT_DURATIONS = Object.freeze({
  success: 3500,
  error: 6000,
  warning: 5000,
  info: 4000,
  loading: 0,
});

let initialized = false;
let eventsBound = false;
let destroyed = false;
let sequence = 0;

let container = null;
let clickCleanup = null;

const items = new Map();
const timers = new Map();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeType(type = "info") {
  const clean = text(type, "info").toLowerCase();
  return VALID_TYPES.has(clean) ? clean : "info";
}

function normalizeId(value = "") {
  return text(value, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_.:-]/g, "")
    .slice(0, 120);
}

function createId() {
  sequence += 1;
  return `toast_${Date.now()}_${sequence}`;
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function emit(eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: TOAST_MODULE_VERSION,
      at: nowIso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   DOM
========================================================= */

function getToastContainer({ create = true } = {}) {
  if (!isBrowser()) return null;

  if (container && document.contains(container)) {
    return container;
  }

  container =
    document.getElementById(CONTAINER_ID) ||
    document.querySelector("[data-toast-container]") ||
    null;

  if (!container && create) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.className = "toast-container";
    container.dataset.toastContainer = "true";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "false");

    try {
      document.body.appendChild(container);
    } catch {
      container = null;
    }
  }

  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};
    AppCore.dom.toastContainer = container;
  } catch {
    // noop
  }

  return container;
}

function findToastNode(id = "") {
  const root = getToastContainer({ create: false });

  if (!root || !id) return null;

  try {
    return (
      [...root.querySelectorAll("[data-toast-id]")]
        .find((node) => node.dataset.toastId === id) || null
    );
  } catch {
    return null;
  }
}

function createToastNode(item) {
  const node = document.createElement("article");

  node.className = `toast toast--${item.type}`;
  node.dataset.toastId = item.id;
  node.dataset.toastType = item.type;
  node.setAttribute("role", item.type === "error" ? "alert" : "status");
  node.setAttribute("aria-live", item.type === "error" ? "assertive" : "polite");

  const body = document.createElement("div");
  body.className = "toast-body";

  const content = document.createElement("div");
  content.className = "toast-content";

  const title = document.createElement("strong");
  title.className = "toast-title";
  title.dataset.toastTitle = "true";

  const message = document.createElement("div");
  message.className = "toast-message";
  message.dataset.toastMessage = "true";

  const close = document.createElement("button");
  close.className = "toast-close";
  close.type = "button";
  close.textContent = "×";
  close.dataset.toastDismiss = item.id;
  close.setAttribute("aria-label", "Cerrar notificación");

  content.append(title, message);
  body.append(content, close);
  node.appendChild(body);

  patchToastNode(node, item);

  return node;
}

function patchToastNode(node, item) {
  if (!node || !item) return false;

  const type = normalizeType(item.type);

  try {
    node.className = `toast toast--${type}`;
    node.dataset.toastId = item.id;
    node.dataset.toastType = type;
    node.setAttribute("role", type === "error" ? "alert" : "status");
    node.setAttribute("aria-live", type === "error" ? "assertive" : "polite");

    const title = node.querySelector("[data-toast-title]");
    const message = node.querySelector("[data-toast-message]");

    if (title) {
      title.textContent = text(item.title, "");
      title.hidden = !text(item.title, "");
    }

    if (message) {
      message.textContent = text(item.message, "");
    }

    return true;
  } catch {
    return false;
  }
}

function removeToastNode(id = "") {
  const node = findToastNode(id);

  if (!node) return false;

  try {
    node.remove();
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   TIMERS
========================================================= */

function clearTimer(id = "") {
  const timer = timers.get(id);

  if (!timer) return false;

  try {
    window.clearTimeout(timer);
  } catch {
    // noop
  }

  timers.delete(id);
  return true;
}

function durationFor(item = {}) {
  if (item.persist === true) return 0;

  const duration = Number(item.duration);

  if (Number.isFinite(duration) && duration >= 0) {
    return duration;
  }

  return DEFAULT_DURATIONS[item.type] ?? DEFAULT_DURATIONS.info;
}

function armTimer(item = {}) {
  if (!isBrowser() || !item?.id) return false;

  clearTimer(item.id);

  const duration = durationFor(item);

  if (!duration) return false;

  const timer = window.setTimeout(() => {
    dismissToast(item.id, { reason: "timeout" });
  }, duration);

  timers.set(item.id, timer);

  return true;
}

function enforceLimit() {
  while (items.size > MAX_TOASTS) {
    const firstId = items.keys().next().value;

    if (!firstId) break;

    dismissToast(firstId, { reason: "limit" });
  }
}

/* =========================================================
   INPUT
========================================================= */

function normalizeShowInput(input = {}, options = {}) {
  const opts = isObject(options) ? options : {};

  if (input instanceof Error) {
    return {
      ...opts,
      type: "error",
      message: input.message || "Error inesperado.",
    };
  }

  if (
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean"
  ) {
    return {
      ...opts,
      message: text(input, ""),
    };
  }

  return {
    ...(isObject(input) ? input : {}),
    ...opts,
  };
}

function normalizeMessageInput(message = "", options = {}, type = "info") {
  if (message instanceof Error) {
    return {
      ...options,
      type: "error",
      message: message.message || "Error inesperado.",
    };
  }

  if (isObject(message)) {
    return {
      type,
      ...message,
      ...options,
      message: text(message.message || message.text || "", ""),
    };
  }

  return {
    ...options,
    type,
    message: text(message, ""),
  };
}

/* =========================================================
   CORE API
========================================================= */

function ensureReady() {
  if (destroyed) destroyed = false;
  if (!initialized) initToast();

  getToastContainer();

  return true;
}

function showToast(input = {}, options = {}) {
  ensureReady();

  const payload = normalizeShowInput(input, options);
  const type = normalizeType(payload.type || "info");

  const title = text(payload.title || "", "");
  const message = text(
    payload.message || payload.text || payload.description || "",
    type === "loading" ? "Cargando..." : ""
  );

  if (!title && !message) return null;

  const id = normalizeId(payload.id || payload.toastId || payload.key) || createId();

  const item = {
    id,
    type,
    title,
    message,
    duration: payload.duration,
    persist: payload.persist === true || type === "loading",
    createdAt: items.get(id)?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };

  items.set(id, item);

  const root = getToastContainer();

  if (root) {
    const current = findToastNode(id);

    if (current) {
      patchToastNode(current, item);
    } else {
      root.appendChild(createToastNode(item));
    }
  }

  armTimer(item);
  enforceLimit();

  emit("toast:show", { id, type });

  return id;
}

function updateToast(idOrPatch = "", patch = {}) {
  ensureReady();

  const id = isObject(idOrPatch)
    ? normalizeId(idOrPatch.id || idOrPatch.toastId || idOrPatch.key)
    : normalizeId(idOrPatch);

  if (!id || !items.has(id)) return null;

  const current = items.get(id);

  const nextPatch = isObject(idOrPatch)
    ? { ...idOrPatch, ...patch }
    : isObject(patch)
      ? patch
      : {};

  const type = normalizeType(nextPatch.type || current.type);

  const next = {
    ...current,
    ...nextPatch,
    id,
    type,
    title: text(nextPatch.title ?? current.title, ""),
    message: text(nextPatch.message ?? nextPatch.text ?? current.message, ""),
    persist: nextPatch.persist !== undefined
      ? nextPatch.persist === true
      : type === "loading",
    updatedAt: nowIso(),
  };

  items.set(id, next);
  patchToastNode(findToastNode(id), next);
  armTimer(next);

  emit("toast:update", { id, type });

  return id;
}

function dismissToast(id = null, options = {}) {
  ensureReady();

  const toastId = normalizeId(id || "");

  if (!toastId) {
    return clearToasts(options);
  }

  clearTimer(toastId);
  items.delete(toastId);
  removeToastNode(toastId);

  emit("toast:dismiss", {
    id: toastId,
    reason: options?.reason || "",
  });

  return true;
}

function clearToasts(options = {}) {
  ensureReady();

  for (const id of [...items.keys()]) {
    clearTimer(id);
    removeToastNode(id);
  }

  items.clear();

  emit("toast:clear", {
    reason: options?.reason || "",
  });

  return true;
}

function resetToasts(options = {}) {
  clearToasts(options);
  sequence = 0;
  return true;
}

/* =========================================================
   VARIANTS
========================================================= */

function successToast(message = "", options = {}) {
  return showToast(normalizeMessageInput(message, options, "success"));
}

function errorToast(message = "", options = {}) {
  return showToast(normalizeMessageInput(message, options, "error"));
}

function warningToast(message = "", options = {}) {
  return showToast(normalizeMessageInput(message, options, "warning"));
}

function warnToast(message = "", options = {}) {
  return warningToast(message, options);
}

function infoToast(message = "", options = {}) {
  return showToast(normalizeMessageInput(message, options, "info"));
}

function loadingToast(message = "", options = {}) {
  return showToast(
    normalizeMessageInput(
      message,
      {
        persist: true,
        duration: 0,
        ...options,
      },
      "loading"
    )
  );
}

/* =========================================================
   EVENTS
========================================================= */

function onClick(event) {
  const button = event.target?.closest?.("[data-toast-dismiss]");

  if (!button) return;

  event.preventDefault();
  dismissToast(button.dataset.toastDismiss || "");
}

function bindToastEvents() {
  ensureReady();

  if (eventsBound) return true;

  const root = getToastContainer();

  if (!root) return false;

  root.addEventListener("click", onClick);

  clickCleanup = () => {
    try {
      root.removeEventListener("click", onClick);
    } catch {
      // noop
    }

    clickCleanup = null;
  };

  eventsBound = true;
  return true;
}

function unbindToastEvents() {
  try {
    clickCleanup?.();
  } catch {
    // noop
  }

  clickCleanup = null;
  eventsBound = false;

  return true;
}

/* =========================================================
   REGISTRATION
========================================================= */

function bridge(message = "", type = "info", options = {}) {
  if (isObject(type)) {
    return showToast(message, type);
  }

  return showToast({
    ...options,
    type,
    message,
  });
}

function registerToast() {
  try {
    AppCore.Toast = api;
    AppCore.toast = api;

    AppCore.services = isObject(AppCore.services) ? AppCore.services : {};
    AppCore.services.Toast = api;
    AppCore.services.toast = api;

    AppCore.ui = isObject(AppCore.ui) ? AppCore.ui : {};
    AppCore.ui.Toast = api;
    AppCore.ui.toast = api;

    AppCore.setShowToast?.(bridge);

    AppCore.modules?.register?.("Toast", api);
    AppCore.modules?.register?.("toast", api);
  } catch {
    // noop
  }

  if (isBrowser()) {
    try {
      window[GLOBAL_KEY] = api;
      window.OnionToast = api;
      window.Toast = window.Toast || api;
    } catch {
      // noop
    }
  }

  return true;
}

/* =========================================================
   LIFECYCLE
========================================================= */

function initToast() {
  if (initialized) {
    registerToast();
    bindToastEvents();
    return api;
  }

  destroyed = false;
  initialized = true;

  getToastContainer();
  registerToast();
  bindToastEvents();

  emit("toast:ready", {
    initialized: true,
  });

  return api;
}

function destroyToast(options = {}) {
  unbindToastEvents();

  if (options.clear !== false) {
    clearToasts({ reason: "destroy" });
  }

  initialized = false;
  destroyed = true;

  emit("toast:destroy");

  return true;
}

function ready() {
  return Boolean(initialized && !destroyed);
}

function resolveToast() {
  ensureReady();
  return api;
}

function existsToast(id = null) {
  const toastId = normalizeId(id || "");
  return Boolean(toastId && items.has(toastId));
}

function refreshLanguage() {
  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  const root = getToastContainer({ create: false });

  return {
    version: TOAST_MODULE_VERSION,
    source: SOURCE,

    initialized,
    eventsBound,
    destroyed,

    count: items.size,

    items: [...items.values()].map((item) => ({
      id: item.id,
      type: item.type,
      title: redact(item.title),
      message: redact(item.message),
      persist: Boolean(item.persist),
      duration: durationFor(item),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),

    dom: {
      hasContainer: Boolean(root),
      containerId: root?.id || "",
    },

    policy: {
      ownAuth: false,
      ownRouter: false,
      ownHttp: false,
      ownStore: false,
      submodules: false,
      textContentOnly: true,
      noCssRuntime: true,
      noCustomEvent: true,
      noRedeclareExports: true,
    },
  };
}

/* =========================================================
   API
========================================================= */

const api = {
  TOAST_MODULE_VERSION,
  version: TOAST_MODULE_VERSION,
  source: SOURCE,

  init: initToast,
  destroy: destroyToast,
  ensureReady,
  register: registerToast,
  resolve: resolveToast,

  bindEvents: bindToastEvents,
  unbindEvents: unbindToastEvents,

  show: showToast,
  notify: showToast,
  toast: showToast,
  open: showToast,
  push: showToast,

  update: updateToast,

  dismiss: dismissToast,
  hide: dismissToast,
  close: dismissToast,
  remove: dismissToast,

  clear: clearToasts,
  dismissAll: clearToasts,
  clearAll: clearToasts,
  reset: resetToasts,

  success: successToast,
  error: errorToast,
  warning: warningToast,
  warn: warnToast,
  info: infoToast,
  loading: loadingToast,

  refreshLanguage,
  refreshAllToastsLanguage: refreshLanguage,

  exists: existsToast,
  ready,

  getSnapshot,
  getDebugSnapshot: getSnapshot,
  getState: getSnapshot,

  bridge,

  get initialized() {
    return initialized;
  },

  get eventsBound() {
    return eventsBound;
  },

  get destroyed() {
    return destroyed;
  },
};

registerToast();

export const Toast = api;

/* =========================================================
   NAMED EXPORTS
   Sin wrappers duplicados.
========================================================= */

export function initToastModule(options = {}) {
  return Toast.init(options);
}

export function destroyToastModule(options = {}) {
  return Toast.destroy(options);
}

export {
  initToast as init,
  destroyToast as destroy,
  ensureReady,
  registerToast as register,
  resolveToast as resolve,

  bindToastEvents as bindEvents,
  unbindToastEvents as unbindEvents,

  showToast as show,
  showToast as notify,
  showToast as toast,
  showToast as open,
  showToast as push,

  updateToast as update,

  dismissToast as dismiss,
  dismissToast as hide,
  dismissToast as close,
  dismissToast as remove,

  clearToasts as clear,
  clearToasts as dismissAll,
  clearToasts as clearAll,

  resetToasts as reset,

  successToast as success,
  errorToast as error,
  warningToast as warning,
  warnToast as warn,
  infoToast as info,
  loadingToast as loading,
};

export default Toast;
