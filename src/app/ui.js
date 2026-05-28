/* =========================================================
   Onion Support - App UI
   Archivo: /src/app/ui.js

   Responsabilidad:
   - Compat mínima de UI.
   - Bridge pasivo de Toast si existe.
   - No pisar AppCore.showToast si ya existe.
   - Sin Sidebar, Topbar, Router, Auth, Store, eventos, rutas,
     repair automático, debug global, fetch, storage ni dominio.
========================================================= */

export const UI_VERSION = "app.ui.v6";

const TOAST_TYPES = Object.freeze({
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
});

const TEXT_KEYS = Object.freeze([
  "message",
  "text",
  "title",
  "description",
  "detail",
  "details",
]);

const SENSITIVE_KEYS = Object.freeze([
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "secret",
  "session",
  "password",
  "pwd",
  "key",
  "sig",
  "signature",
  "jwt",
  "authorization",
  "resettoken",
  "activationtoken",
]);

let initialized = false;
let bridged = false;
let lastBridgeReason = "idle";

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .replace(/[_\-. \s]/g, "");
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

function safeCall(fn = null, context = null, ...args) {
  try {
    return isFunction(fn) ? fn.apply(context, args) : null;
  } catch {
    return null;
  }
}

/* =========================================================
   TOAST RESOLVE
========================================================= */

function getModule(AppCore = null, name = "") {
  return safeCall(AppCore?.modules?.get, AppCore?.modules, name);
}

function getToast(AppCore = null, Toast = null) {
  return (
    Toast ||
    AppCore?.toast ||
    AppCore?.Toast ||
    AppCore?.ui?.toast ||
    AppCore?.ui?.Toast ||
    getModule(AppCore, "toast") ||
    getModule(AppCore, "Toast") ||
    null
  );
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEYS.includes(normalizeKey(key));
}

function isTextKey(key = "") {
  return TEXT_KEYS.includes(normalizeKey(key));
}

function sanitizeToastOptions(options = {}) {
  if (!isPlainObject(options)) return {};

  const output = {};

  for (const [key, value] of Object.entries(options)) {
    const cleanKey = cleanText(key, "");
    if (!cleanKey) continue;

    if (isSensitiveKey(cleanKey)) {
      output[cleanKey] = "***";
      continue;
    }

    output[cleanKey] = isTextKey(cleanKey) && typeof value === "string"
      ? redact(value)
      : value;
  }

  return output;
}

function normalizeToastType(type = TOAST_TYPES.INFO) {
  const value = cleanText(type, TOAST_TYPES.INFO).toLowerCase();

  if (value === "warn") return TOAST_TYPES.WARNING;
  if (value === "danger") return TOAST_TYPES.ERROR;

  if (
    value === TOAST_TYPES.INFO ||
    value === TOAST_TYPES.SUCCESS ||
    value === TOAST_TYPES.WARNING ||
    value === TOAST_TYPES.ERROR
  ) {
    return value;
  }

  return TOAST_TYPES.INFO;
}

function readToastMessage(input = null) {
  if (!isPlainObject(input)) return redact(input);

  for (const key of TEXT_KEYS) {
    const value = input[key];

    if (typeof value === "string" && cleanText(value, "")) {
      return redact(value);
    }
  }

  return "";
}

function normalizeToastInput(message = "", type = TOAST_TYPES.INFO, options = {}) {
  if (isPlainObject(message)) {
    return {
      message: readToastMessage(message),
      type: normalizeToastType(message.type || message.variant || type),
      options: sanitizeToastOptions({
        ...message,
        ...(isPlainObject(options) ? options : {}),
      }),
    };
  }

  return {
    message: readToastMessage(message),
    type: normalizeToastType(type),
    options: sanitizeToastOptions(options),
  };
}

function showToastWith(Toast = null, message = "", type = TOAST_TYPES.INFO, options = {}) {
  if (!Toast) return null;

  const payload = normalizeToastInput(message, type, options);

  if (!payload.message) return null;

  if (isFunction(Toast[payload.type])) {
    return safeCall(Toast[payload.type], Toast, payload.message, payload.options);
  }

  if (payload.type === TOAST_TYPES.WARNING && isFunction(Toast.warn)) {
    return safeCall(Toast.warn, Toast, payload.message, payload.options);
  }

  if (isFunction(Toast.show)) {
    return safeCall(Toast.show, Toast, {
      ...payload.options,
      type: payload.type,
      message: payload.message,
    });
  }

  if (isFunction(Toast)) {
    return safeCall(Toast, null, payload.message, payload.type, payload.options);
  }

  return null;
}

function createToastBridge(Toast = null) {
  const bridge = function showToast(message = "", type = TOAST_TYPES.INFO, options = {}) {
    return showToastWith(Toast, message, type, options);
  };

  try {
    Object.defineProperties(bridge, {
      __onionToastBridge: {
        value: true,
        enumerable: false,
      },
      __onionSource: {
        value: "app.ui",
        enumerable: false,
      },
      __onionVersion: {
        value: UI_VERSION,
        enumerable: false,
      },
    });
  } catch {
    // noop
  }

  return bridge;
}

function isToastBridge(value = null) {
  return Boolean(isFunction(value) && value.__onionToastBridge === true);
}

/* =========================================================
   PUBLIC API
========================================================= */

export function bindToastBridge({
  AppCore = null,
  Toast = null,
} = {}) {
  if (!AppCore) {
    initialized = false;
    bridged = false;
    lastBridgeReason = "missing-app-core";
    return false;
  }

  if (isFunction(AppCore.showToast)) {
    initialized = true;
    bridged = isToastBridge(AppCore.showToast);
    lastBridgeReason = bridged ? "already-bridged" : "existing-showToast";
    return true;
  }

  const toast = getToast(AppCore, Toast);

  if (!toast) {
    initialized = false;
    bridged = false;
    lastBridgeReason = "missing-toast";
    return false;
  }

  try {
    AppCore.showToast = createToastBridge(toast);
  } catch {
    initialized = false;
    bridged = false;
    lastBridgeReason = "assign-failed";
    return false;
  }

  initialized = true;
  bridged = true;
  lastBridgeReason = "bridge-created";

  return true;
}

export function initUISystems(options = {}) {
  return bindToastBridge(options);
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getToastCapabilities(toast = null) {
  return {
    callable: isFunction(toast),
    hasShow: isFunction(toast?.show),
    hasInfo: isFunction(toast?.info),
    hasSuccess: isFunction(toast?.success),
    hasWarning: isFunction(toast?.warning) || isFunction(toast?.warn),
    hasError: isFunction(toast?.error),
  };
}

export function getUISystemsSnapshot({
  AppCore = null,
  Toast = null,
} = {}) {
  const toast = getToast(AppCore, Toast);
  const showToast = AppCore?.showToast || null;

  return {
    version: UI_VERSION,

    initialized,
    bridged,
    lastBridgeReason,

    hasToast: Boolean(toast),
    hasShowToast: isFunction(showToast),
    showToastIsBridge: isToastBridge(showToast),

    toastCapabilities: getToastCapabilities(toast),

    policy: {
      toastBridgeOnly: true,
      idempotentBridge: true,
      passiveWhenCoreShowToastExists: true,
      doesNotOverrideExistingShowToast: true,
      redactsToastText: true,
      noSidebar: true,
      noTopbar: true,
      noRouter: true,
      noAuth: true,
      noStore: true,
      noEvents: true,
      noRoutes: true,
      noRepair: true,
      noDebugGlobal: true,
      noFetch: true,
      noStorage: true,
      noDomainLogic: true,
    },
  };
}

export default {
  UI_VERSION,

  initUISystems,
  bindToastBridge,

  getUISystemsSnapshot,
};
