/* =========================================================
   Onion Support - Toast API
   Archivo: /src/ui/toast/api.js

   Responsabilidad:
   - Compat mínima para imports legacy.
   - Delegar todo en src/ui/toast/index.js.
   - Sin store propio.
   - Sin DOM propio.
   - Sin timers propios.
   - Sin events propios.
   - Sin constants/helpers/text/dom/store/timers/events.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store global.
   - Sin CustomEvent.
   - Sin magia negra.
========================================================= */

import Toast from "./index.js";

export const TOAST_API_VERSION = "simple-bridge";

/* =========================================================
   CORE
========================================================= */

export function showToast(input = {}, options = {}) {
  return Toast.show(input, options);
}

export function updateToast(id = "", patch = {}) {
  return Toast.update(id, patch);
}

export function dismissToast(id = "", options = {}) {
  return Toast.dismiss(id, options);
}

export function clearToasts(options = {}) {
  return Toast.clear(options);
}

/* =========================================================
   SHORTCUTS
========================================================= */

export function successToast(message = "", options = {}) {
  return Toast.success(message, options);
}

export function errorToast(message = "", options = {}) {
  return Toast.error(message, options);
}

export function warningToast(message = "", options = {}) {
  return Toast.warning(message, options);
}

export function infoToast(message = "", options = {}) {
  return Toast.info(message, options);
}

export function loadingToast(message = "", options = {}) {
  return Toast.loading(message, options);
}

/* =========================================================
   LANGUAGE COMPAT
========================================================= */

export function refreshToastLanguage() {
  return null;
}

export function refreshAllToastsLanguage() {
  try {
    return Toast.refreshAllToastsLanguage?.() ?? 0;
  } catch {
    return 0;
  }
}

/* =========================================================
   RESET / SNAPSHOT
========================================================= */

export function resetToastApiState(options = {}) {
  return Toast.reset(options);
}

export function getToastApiSnapshot() {
  const snapshot = Toast.getSnapshot?.() || {};

  return {
    version: TOAST_API_VERSION,

    count: snapshot.count || 0,
    ids: Array.isArray(snapshot.items)
      ? snapshot.items.map((item) => item.id).filter(Boolean)
      : [],

    activeCount: snapshot.count || 0,
    clearRunning: false,
    resetRunning: false,

    dedupeCount: 0,

    items: Array.isArray(snapshot.items)
      ? snapshot.items.map((item) => ({
          id: item.id,
          type: item.type,
          duration: item.duration,
          persist: Boolean(item.persist),
          dismissed: false,
          dismissing: false,
          hasNode: true,
          connected: true,
          hasProgress: false,
          createdAt: item.createdAt || null,
          updatedAt: item.updatedAt || null,
        }))
      : [],

    source: "toast.api.bridge",
    delegated: true,
    target: "src/ui/toast/index.js",

    policy: {
      compatOnly: true,
      noOwnStore: true,
      noOwnDom: true,
      noOwnTimers: true,
      noOwnEvents: true,
      noImportsExceptIndex: true,
    },
  };
}

/* =========================================================
   ALIASES
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

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
