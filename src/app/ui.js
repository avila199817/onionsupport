/* =========================================================
   Onion Support - App UI
   Archivo: /src/app/ui.js

   Responsabilidad:
   - Compat mínima de UI.
   - Bridge simple de Toast si existe.
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

export const UI_VERSION = "simple";

let initialized = false;

function getToast(AppCore = null, Toast = null) {
  return Toast || AppCore?.Toast || AppCore?.toast || null;
}

function showToastWith(Toast = null, message = "", type = "info", options = {}) {
  if (!Toast || !message) return null;

  const variant = type === "warn" ? "warning" : type;

  if (typeof Toast[variant] === "function") {
    return Toast[variant](message, options);
  }

  if (variant === "warning" && typeof Toast.warn === "function") {
    return Toast.warn(message, options);
  }

  if (typeof Toast.show === "function") {
    return Toast.show({
      ...options,
      type: variant,
      message,
    });
  }

  return null;
}

export function bindToastBridge({ AppCore = null, Toast = null } = {}) {
  const toast = getToast(AppCore, Toast);

  if (!AppCore || !toast) return false;

  AppCore.showToast = (message = "", type = "info", options = {}) => {
    if (message && typeof message === "object") {
      return showToastWith(
        toast,
        message.message || message.text || message.title || "",
        message.type || message.variant || type,
        message
      );
    }

    return showToastWith(toast, message, type, options);
  };

  return true;
}

export function initUISystems(options = {}) {
  initialized = true;
  bindToastBridge(options);

  return true;
}

export function syncUserUI() {
  return true;
}

export function repairUISystems() {
  return true;
}

export function unbindUISystems() {
  initialized = false;
  return true;
}

export function bindAppLanguageSync() {
  return true;
}

export function bindUIRepairSync() {
  return true;
}

export function bindUIRouteSync() {
  return true;
}

export function bindUISessionSync() {
  return true;
}

export function bindUIThemeSync() {
  return true;
}

export function bindUIRuntimeEvents() {
  return true;
}

export function getUISystemsSnapshot() {
  return {
    version: UI_VERSION,
    initialized,
  };
}

export function resetUIRuntimeState() {
  initialized = false;
  return getUISystemsSnapshot();
}

export default {
  UI_VERSION,

  initUISystems,
  syncUserUI,
  repairUISystems,
  unbindUISystems,

  bindToastBridge,

  bindAppLanguageSync,
  bindUIRepairSync,
  bindUIRouteSync,
  bindUISessionSync,
  bindUIThemeSync,
  bindUIRuntimeEvents,

  getUISystemsSnapshot,
  resetUIRuntimeState,
};
