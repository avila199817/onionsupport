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

export const UI_VERSION = "app.ui.v3";

let initialized = false;
let bridged = false;

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

/* =========================================================
   TOAST
========================================================= */

function getToast(AppCore = null, Toast = null) {
  return Toast || AppCore?.toast || AppCore?.Toast || null;
}

function normalizeToastInput(message = "", type = "info", options = {}) {
  if (isObject(message)) {
    const cleanOptions = {
      ...message,
      ...options,
    };

    return {
      message: cleanText(
        message.message ||
          message.text ||
          message.title,
        ""
      ),
      type: cleanText(
        message.type ||
          message.variant ||
          type,
        "info"
      ),
      options: cleanOptions,
    };
  }

  return {
    message: cleanText(message, ""),
    type: cleanText(type, "info"),
    options: isObject(options) ? options : {},
  };
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

function showToastWith(Toast = null, message = "", type = "info", options = {}) {
  if (!Toast) return null;

  const payload = normalizeToastInput(message, type, options);
  const toastMessage = payload.message;
  const toastType = normalizeToastType(payload.type);

  if (!toastMessage) return null;

  if (isFunction(Toast[toastType])) {
    return Toast[toastType](toastMessage, payload.options);
  }

  if (toastType === "warning" && isFunction(Toast.warn)) {
    return Toast.warn(toastMessage, payload.options);
  }

  if (isFunction(Toast.show)) {
    return Toast.show({
      ...payload.options,
      type: toastType,
      message: toastMessage,
    });
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

/* =========================================================
   PUBLIC API
========================================================= */

export function bindToastBridge({
  AppCore = null,
  Toast = null,
} = {}) {
  const toast = getToast(AppCore, Toast);

  if (!AppCore || !toast) {
    initialized = false;
    bridged = false;
    return false;
  }

  /*
    No pisar una implementación existente.
    Si AppCore.showToast ya existe, este módulo queda como compat pasiva.
  */
  if (isFunction(AppCore.showToast)) {
    initialized = true;
    bridged = AppCore.showToast.__onionToastBridge === true;
    return true;
  }

  AppCore.showToast = createToastBridge(toast);

  initialized = true;
  bridged = true;

  return true;
}

export function initUISystems(options = {}) {
  return bindToastBridge(options);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getUISystemsSnapshot() {
  return {
    version: UI_VERSION,

    initialized,
    bridged,

    policy: {
      toastBridgeOnly: true,
      idempotentBridge: true,
      doesNotOverrideExistingShowToast: true,

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
