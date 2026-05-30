/* =========================================================
   Onion Support - Toast
   Archivo: /src/ui/toast/index.js

   Responsabilidad:
   - Toast UI mínimo autosuficiente.
   - API pública única.
   - Auto-init al primer uso.
   - DOM seguro con textContent.
   - Registro mínimo en AppCore.
   - Sin submódulos, sin Auth, sin Router, sin HTTP,
     sin Store, sin i18n, sin CSS runtime y sin eventos globales.
========================================================= */

import { AppCore } from "../../core/index.js";

export const TOAST_VERSION = "toast.minimal.v1";

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
let sequence = 0;
let container = null;

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
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeType(type = "info") {
  const value = cleanText(type, "info").toLowerCase();
  return VALID_TYPES.has(value) ? value : "info";
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
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

/* =========================================================
   DOM
========================================================= */

function getContainer() {
  if (!isBrowser()) return null;

  if (container && document.contains(container)) {
    return container;
  }

  container =
    document.getElementById(CONTAINER_ID) ||
    document.querySelector("[data-toast-container]") ||
    null;

  if (!container) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.className = "toast-container";
    container.dataset.toastContainer = "true";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "false");

    document.body.appendChild(container);
  }

  return container;
}

function findNode(id = "") {
  const root = getContainer();

  if (!root || !id) return null;

  return root.querySelector(`[data-toast-id="${CSS.escape(id)}"]`);
}

function createNode(item) {
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

  patchNode(node, item);

  return node;
}

function patchNode(node, item) {
  if (!node || !item) return false;

  const type = normalizeType(item.type);

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
}

function renderItem(item) {
  const root = getContainer();

  if (!root) return false;

  const current = findNode(item.id);

  if (current) {
    patchNode(current, item);
    return true;
  }

  root.appendChild(createNode(item));
  return true;
}

function removeNode(id = "") {
  const node = findNode(id);

  if (!node) return false;

  node.remove();
  return true;
}

/* =========================================================
   TIMERS
========================================================= */

function clearTimer(id = "") {
  const timer = timers.get(id);

  if (!timer) return false;

  clearTimeout(timer);
  timers.delete(id);

  return true;
}

function getDuration(item) {
  if (item.persist === true) return 0;

  const duration = Number(item.duration);

  if (Number.isFinite(duration) && duration >= 0) {
    return Math.min(duration, MAX_DURATION_MS);
  }

  return DEFAULT_DURATIONS[item.type] ?? DEFAULT_DURATIONS.info;
}

function armTimer(item) {
  clearTimer(item.id);

  const duration = getDuration(item);

  if (!duration) return false;

  const timer = window.setTimeout(() => {
    dismissToast(item.id);
  }, duration);

  timers.set(item.id, timer);

  return true;
}

function enforceLimit() {
  while (items.size > MAX_TOASTS) {
    const firstId = items.keys().next().value;

    if (!firstId) break;

    dismissToast(firstId);
  }
}

/* =========================================================
   INPUT
========================================================= */

function normalizeInput(input = {}, options = {}) {
  if (input instanceof Error) {
    return {
      ...options,
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
      ...options,
      message: cleanText(input, ""),
    };
  }

  return {
    ...(isObject(input) ? input : {}),
    ...(isObject(options) ? options : {}),
  };
}

function normalizeMessage(message = "", options = {}, type = "info") {
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
   CORE BRIDGE
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
    AppCore.ui.toast = Toast;

    AppCore.toast = Toast;
    AppCore.Toast = Toast;

    AppCore.setShowToast?.(bridge);
    AppCore.registerModule?.("toast", Toast, {
      overwrite: true,
    });
    AppCore.modules?.register?.("toast", Toast, {
      overwrite: true,
    });

    return true;
  } catch {
    return false;
  }
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

function bindEvents() {
  const root = getContainer();

  if (!root || root.dataset.toastEventsBound === "true") return false;

  root.addEventListener("click", onClick);
  root.dataset.toastEventsBound = "true";

  return true;
}

/* =========================================================
   API
========================================================= */

function initToast() {
  if (!isBrowser()) return Toast;

  if (initialized) {
    registerToast();
    return Toast;
  }

  initialized = true;

  getContainer();
  bindEvents();
  registerToast();

  return Toast;
}

function ensureReady() {
  if (!initialized) {
    initToast();
  }

  getContainer();

  return true;
}

function showToast(input = {}, options = {}) {
  ensureReady();

  const payload = normalizeInput(input, options);
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
    createdAt: items.get(id)?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  items.set(id, item);
  renderItem(item);
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
        ...(isObject(patch) ? patch : {}),
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
    updatedAt: new Date().toISOString(),
  };

  items.set(id, next);
  renderItem(next);
  armTimer(next);

  return id;
}

function dismissToast(id = null) {
  const toastId = normalizeId(id || "");

  if (!toastId) {
    return clearToasts();
  }

  clearTimer(toastId);
  items.delete(toastId);
  removeNode(toastId);

  return true;
}

function clearToasts() {
  for (const id of [...items.keys()]) {
    clearTimer(id);
    removeNode(id);
  }

  items.clear();

  return true;
}

function resetToasts() {
  clearToasts();
  sequence = 0;

  return true;
}

function successToast(message = "", options = {}) {
  return showToast(normalizeMessage(message, options, "success"));
}

function errorToast(message = "", options = {}) {
  return showToast(normalizeMessage(message, options, "error"));
}

function warningToast(message = "", options = {}) {
  return showToast(normalizeMessage(message, options, "warning"));
}

function warnToast(message = "", options = {}) {
  return warningToast(message, options);
}

function infoToast(message = "", options = {}) {
  return showToast(normalizeMessage(message, options, "info"));
}

function loadingToast(message = "", options = {}) {
  return showToast(
    normalizeMessage(
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

function existsToast(id = "") {
  return items.has(normalizeId(id));
}

function ready() {
  return initialized;
}

function getSnapshot() {
  return {
    version: TOAST_VERSION,
    initialized,
    count: items.size,
    hasContainer: Boolean(container && isBrowser() && document.contains(container)),
    items: [...items.values()].map((item) => ({
      id: item.id,
      type: item.type,
      message: redact(item.message),
      persist: Boolean(item.persist),
      duration: getDuration(item),
    })),
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export const Toast = {
  version: TOAST_VERSION,

  init: initToast,
  ensureReady,
  register: registerToast,

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
};

export {
  initToast as init,
  ensureReady,
  registerToast as register,

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
