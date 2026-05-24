/* =========================================================
   Onion Support - App UI
   Archivo: /src/app/ui.js

   Responsabilidad:
   - Compat mínima de UI.
   - Bridge simple de Toast si existe.
   - No pisar AppCore.showToast si ya existe.
   - Sin Sidebar.
   - Sin Topbar.
   - Sin Router.
   - Sin Auth.
   - Sin Store.
   - Sin eventos.
   - Sin rutas.
   - Sin repair automático.
   - Sin debug.
========================================================= */

export const UI_VERSION = "app.ui.v4";

let initialized = false;
let bridged = false;
let lastBridgeReason = "idle";

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function safeCall(fn = null, context = null, ...args) {
  try {
    return isFunction(fn) ? fn.apply(context, args) : null;
  } catch {
    return null;
  }
}

/* =========================================================
   TOAST
========================================================= */

const SENSITIVE_OPTION_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "secret",
  "session",
  "password",
  "pwd",
  "key",
  "sig",
  "signature",
  "jwt",
  "authorization",
  "reset_token",
  "activation_token",
]);

const TEXT_OPTION_KEYS = new Set([
  "message",
  "text",
  "title",
  "description",
  "detail",
  "details",
]);

function getToast(AppCore = null, Toast = null) {
  return (
    Toast ||
    AppCore?.toast ||
    AppCore?.Toast ||
    AppCore?.ui?.toast ||
    AppCore?.ui?.Toast ||
    null
  );
}

function sanitizeToastOptions(options = {}) {
  if (!isObject(options)) return {};

  const output = {};

  for (const [key, value] of Object.entries(options)) {
    const cleanKey = cleanText(key, "");

    if (!cleanKey) continue;

    const lowerKey = cleanKey.toLowerCase();

    if (SENSITIVE_OPTION_KEYS.has(lowerKey)) {
      output[cleanKey] = "***";
      continue;
    }

    if (TEXT_OPTION_KEYS.has(lowerKey) && typeof value === "string") {
      output[cleanKey] = redact(value);
      continue;
    }

    output[cleanKey] = value;
  }

  return output;
}

function normalizeToastType(type = "info") {
  const value = cleanText(type, "info").toLowerCase();

  if (value === "warn") return "warning";
  if (value === "danger") return "error";

  if (value === "success") return "success";
  if (value === "error") return "error";
  if (value === "warning") return "warning";
  if (value === "info") return "info";

  return "info";
}

function normalizeToastInput(message = "", type = "info", options = {}) {
  if (isObject(message)) {
    const mergedOptions = sanitizeToastOptions({
      ...message,
      ...(isObject(options) ? options : {}),
    });

    return {
      message: redact(
        message.message ||
          message.text ||
          message.title ||
          ""
      ),
      type: normalizeToastType(
        message.type ||
          message.variant ||
          type
      ),
      options: mergedOptions,
    };
  }

  return {
    message: redact(message),
    type: normalizeToastType(type),
    options: sanitizeToastOptions(options),
  };
}

function showToastWith(Toast = null, message = "", type = "info", options = {}) {
  if (!Toast) return null;

  const payload = normalizeToastInput(message, type, options);
  const toastMessage = payload.message;
  const toastType = payload.type;

  if (!toastMessage) return null;

  if (isFunction(Toast[toastType])) {
    return safeCall(Toast[toastType], Toast, toastMessage, payload.options);
  }

  if (toastType === "warning" && isFunction(Toast.warn)) {
    return safeCall(Toast.warn, Toast, toastMessage, payload.options);
  }

  if (isFunction(Toast.show)) {
    return safeCall(Toast.show, Toast, {
      ...payload.options,
      type: toastType,
      message: toastMessage,
    });
  }

  if (isFunction(Toast)) {
    return safeCall(Toast, null, toastMessage, toastType, payload.options);
  }

  return null;
}

function createToastBridge(Toast = null) {
  const bridge = function showToast(message = "", type = "info", options = {}) {
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
  const toast = getToast(AppCore, Toast);

  if (!AppCore) {
    initialized = false;
    bridged = false;
    lastBridgeReason = "missing-app-core";
    return false;
  }

  if (!toast) {
    initialized = false;
    bridged = false;
    lastBridgeReason = "missing-toast";
    return false;
  }

  /*
    No pisar una implementación existente.
    Si AppCore.showToast ya existe, este módulo queda como compat pasiva.
  */
  if (isFunction(AppCore.showToast)) {
    initialized = true;
    bridged = isToastBridge(AppCore.showToast);
    lastBridgeReason = bridged ? "already-bridged" : "existing-showToast";
    return true;
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

    toastCapabilities: {
      callable: isFunction(toast),
      hasShow: isFunction(toast?.show),
      hasInfo: isFunction(toast?.info),
      hasSuccess: isFunction(toast?.success),
      hasWarning: isFunction(toast?.warning) || isFunction(toast?.warn),
      hasError: isFunction(toast?.error),
    },

    policy: {
      toastBridgeOnly: true,
      idempotentBridge: true,
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
      noDebug: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  UI_VERSION,

  initUISystems,
  bindToastBridge,

  getUISystemsSnapshot,
};
