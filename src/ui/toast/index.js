/* =========================================================
   Onion Support - Toast
   Archivo: /src/ui/toast/index.js

   Responsabilidad:
   - Toast UI mínimo autosuficiente.
   - API pública única.
   - Auto-init al primer uso.
   - DOM seguro con textContent.
   - Registro en AppCore sólo desde init/primer uso.
   - Sin registro global window.
   - Sin submódulos.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store global.
   - Sin i18n complejo.
   - Sin CSS runtime.
   - Sin CustomEvent.
   - Sin eventos AppCore.
   - Sin redeclaraciones.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";

export const TOAST_MODULE_VERSION = "toast.ui.v2";

const SOURCE = "ui.toast";
const CONTAINER_ID = "toast-container";
const MAX_TOASTS = 5;
const MAX_DURATION_MS = 600000;

const VALID_TYPES = new Set([
  "success",
  "error",
  "warning",
  "info",
  "loading",
]);

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
let boundContainer = null;
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

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function normalizeType(type = "info") {
  const clean = cleanText(type, "info").toLowerCase();
  return VALID_TYPES.has(clean) ? clean : "info";
}

function normalizeId(value = "") {
  return cleanText(value, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_.:-]/g, "")
    .slice(0, 120);
}

function createId() {
  sequence += 1;
  return `toast_${Date.now()}_${sequence}`;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
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

function patchToastNode(node = null, item = null) {
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
      title.textContent = redact(item.title || "");
      title.hidden = !cleanText(item.title, "");
    }

    if (message) {
      message.textContent = redact(item.message || "");
    }

    return true;
  } catch {
    return false;
  }
}

function createToastNode(item = {}) {
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
    globalThis.clearTimeout(timer);
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
    return Math.min(duration, MAX_DURATION_MS);
  }

  return DEFAULT_DURATIONS[item.type] ?? DEFAULT_DURATIONS.info;
}

function armTimer(item = {}) {
  if (!isBrowser() || !item?.id) return false;

  clearTimer(item.id);

  const duration = durationFor(item);

  if (!duration) return false;

  const timer = window.setTimeout(() => {
    dismissToast(item.id, {
      reason: "timeout",
    });
  }, duration);

  timers.set(item.id, timer);

  return true;
}

function enforceLimit() {
  while (items.size > MAX_TOASTS) {
    const firstId = items.keys().next().value;

    if (!firstId) break;

    dismissToast(firstId, {
      reason: "limit",
    });
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
      message: cleanText(input, ""),
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
      message: cleanText(message.message || message.text || "", ""),
    };
  }

  return {
    ...options,
    type,
    message: cleanText(message, ""),
  };
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
    AppCore.ui = isObject(AppCore.ui) ? AppCore.ui : {};
    AppCore.ui.toast = api;

    /*
      Core tiene setters para AppCore.toast/AppCore.Toast.
      Usamos ambos sólo como fachada del mismo módulo, sin cliente paralelo.
    */
    AppCore.toast = api;
    AppCore.Toast = api;

    AppCore.setShowToast?.(bridge);
    AppCore.modules?.register?.("toast", api);

    return true;
  } catch {
    return false;
  }
}

function unregisterToast() {
  try {
    if (AppCore.ui?.toast === api) {
      delete AppCore.ui.toast;
    }

    AppCore.modules?.remove?.("toast");

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   CORE API
========================================================= */

function ensureReady() {
  if (destroyed) destroyed = false;

  if (!initialized) {
    initToast();
  }

  getToastContainer();

  return true;
}

function showToast(input = {}, options = {}) {
  ensureReady();

  const payload = normalizeShowInput(input, options);
  const type = normalizeType(payload.type || "info");

  const title = redact(cleanText(payload.title || "", ""));

  const message = redact(
    cleanText(
      payload.message || payload.text || payload.description || "",
      type === "loading" ? "Cargando..." : ""
    )
  );

  if (!title && !message) return null;

  const id =
    normalizeId(payload.id || payload.toastId || payload.key) ||
    createId();

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
    ? {
        ...idOrPatch,
        ...patch,
      }
    : isObject(patch)
      ? patch
      : {};

  const type = normalizeType(nextPatch.type || current.type);

  const next = {
    ...current,
    ...nextPatch,
    id,
    type,
    title: redact(cleanText(nextPatch.title ?? current.title, "")),
    message: redact(cleanText(nextPatch.message ?? nextPatch.text ?? current.message, "")),
    persist: nextPatch.persist !== undefined
      ? nextPatch.persist === true
      : type === "loading",
    updatedAt: nowIso(),
  };

  items.set(id, next);
  patchToastNode(findToastNode(id), next);
  armTimer(next);

  return id;
}

function dismissToast(id = null, options = {}) {
  const toastId = normalizeId(id || "");

  if (!toastId) {
    return clearToasts(options);
  }

  clearTimer(toastId);
  items.delete(toastId);
  removeToastNode(toastId);

  return true;
}

function clearToasts(_options = {}) {
  for (const id of [...items.keys()]) {
    clearTimer(id);
    removeToastNode(id);
  }

  items.clear();

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
  const root = getToastContainer();

  if (!root) return false;

  if (eventsBound && boundContainer === root) {
    return true;
  }

  unbindToastEvents();

  try {
    root.addEventListener("click", onClick);
  } catch {
    return false;
  }

  boundContainer = root;

  clickCleanup = () => {
    try {
      root.removeEventListener("click", onClick);
    } catch {
      // noop
    }

    clickCleanup = null;
    boundContainer = null;
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
  boundContainer = null;
  eventsBound = false;

  return true;
}

/* =========================================================
   LIFECYCLE
========================================================= */

function initToast() {
  destroyed = false;

  if (initialized) {
    registerToast();
    bindToastEvents();
    return api;
  }

  initialized = true;

  getToastContainer();
  registerToast();
  bindToastEvents();

  return api;
}

function destroyToast(options = {}) {
  unbindToastEvents();

  if (options.clear !== false) {
    clearToasts({
      reason: "destroy",
    });
  }

  initialized = false;
  destroyed = true;

  unregisterToast();

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

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  const root = getToastContainer({
    create: false,
  });

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
      toastOnly: true,
      apiUnique: true,
      autoInitOnFirstUse: true,

      ownAuth: false,
      ownRouter: false,
      ownHttp: false,
      ownStore: false,
      submodules: false,

      textContentOnly: true,
      noCssRuntime: true,
      noCustomEvent: true,
      noAppCoreEvents: true,
      noWindowGlobal: true,
      noImportSideEffectRegistration: true,

      appCoreRegistrationOnly: true,
      snapshotRedacted: true,
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
  update: updateToast,

  dismiss: dismissToast,
  clear: clearToasts,
  reset: resetToasts,

  success: successToast,
  error: errorToast,
  warning: warningToast,
  warn: warnToast,
  info: infoToast,
  loading: loadingToast,

  exists: existsToast,
  ready,

  getSnapshot,
  getDebugSnapshot: getSnapshot,
  getState: getSnapshot,

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

export const Toast = api;

/* =========================================================
   NAMED EXPORTS
========================================================= */

export {
  initToast as init,
  destroyToast as destroy,
  ensureReady,
  registerToast as register,
  resolveToast as resolve,

  bindToastEvents as bindEvents,
  unbindToastEvents as unbindEvents,

  showToast as show,
  updateToast as update,

  dismissToast as dismiss,
  clearToasts as clear,
  resetToasts as reset,

  successToast as success,
  errorToast as error,
  warningToast as warning,
  warnToast as warn,
  infoToast as info,
  loadingToast as loading,

  existsToast as exists,
  ready,

  getSnapshot,
};

export default Toast;
