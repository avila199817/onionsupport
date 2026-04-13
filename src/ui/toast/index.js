/* =========================================================
   Onion SPA - Toast
   Archivo: src/ui/toast/index.js

   Responsabilidades:
   - ensamblar el módulo toast
   - exponer api pública única
   - inicialización segura
   - auto-init transparente al primer uso
   - bind de eventos globales
   - registro en AppCore.modules
========================================================= */

import { AppCore } from "../../core/index.js";

import { TOAST_SCOPE } from "./constants.js";

import {
  showToast,
  updateToast,
  dismissToast,
  clearToasts,
  successToast,
  errorToast,
  warningToast,
  infoToast,
  loadingToast,
  refreshAllToastsLanguage,
  resetToastApiState,
} from "./api.js";

import {
  bindToastGlobalEvents,
  bindToastDomEvents,
  unbindToastEvents,
} from "./events.js";

import {
  ensureToastContainer,
  ensureToastKeyframes,
} from "./dom.js";

const Toast = (() => {
  "use strict";

  let initialized = false;

  /* =========================================================
     INTERNAL
  ========================================================= */

  function ensureReady() {
    if (!initialized) {
      init();
    }

    return true;
  }

  function registerModule() {
    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules.has === "function" &&
        typeof AppCore.modules.register === "function" &&
        !AppCore.modules.has("toast")
      ) {
        AppCore.modules.register("toast", api);
      }
    } catch {}
  }

  function bindEvents() {
    bindToastGlobalEvents({
      show: showToast,
      update: updateToast,
      dismiss: dismissToast,
      clear: clearToasts,
      success: successToast,
      error: errorToast,
      warning: warningToast,
      info: infoToast,
      loading: loadingToast,
      refreshAllToastsLanguage,
    });

    bindToastDomEvents({
      dismiss: dismissToast,
    });
  }

  /* =========================================================
     LIFECYCLE
  ========================================================= */

  function init() {
    if (initialized) {
      ensureToastKeyframes();
      ensureToastContainer();
      return api;
    }

    ensureToastKeyframes();
    ensureToastContainer();

    bindEvents();
    registerModule();

    initialized = true;

    try {
      AppCore?.utils?.log?.(
        "Toast UI inicializado correctamente."
      );
    } catch {}

    return api;
  }

  function destroy() {
    try {
      unbindToastEvents();
    } catch {}

    try {
      resetToastApiState();
    } catch {}

    initialized = false;

    return true;
  }

  /* =========================================================
     SAFE PUBLIC API
  ========================================================= */

  function show(options = {}) {
    ensureReady();
    return showToast(options);
  }

  function update(id, patch = {}) {
    ensureReady();
    return updateToast(id, patch);
  }

  function dismiss(id) {
    ensureReady();
    return dismissToast(id);
  }

  function clear() {
    ensureReady();
    return clearToasts();
  }

  function success(message = "", options = {}) {
    ensureReady();
    return successToast(message, options);
  }

  function error(message = "", options = {}) {
    ensureReady();
    return errorToast(message, options);
  }

  function warning(message = "", options = {}) {
    ensureReady();
    return warningToast(message, options);
  }

  function info(message = "", options = {}) {
    ensureReady();
    return infoToast(message, options);
  }

  function loading(message = "", options = {}) {
    ensureReady();
    return loadingToast(message, options);
  }

  function refreshLanguage() {
    ensureReady();
    return refreshAllToastsLanguage();
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    init,
    destroy,

    show,
    update,
    dismiss,
    clear,

    success,
    error,
    warning,
    info,
    loading,

    refreshAllToastsLanguage: refreshLanguage,

    scope: TOAST_SCOPE,

    get initialized() {
      return initialized;
    },
  };

  return api;
})();

export { Toast };
export default Toast;
