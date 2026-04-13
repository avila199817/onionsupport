/* =========================================================
   Onion SPA - Toast
   Archivo: src/ui/toast/index.js

   Responsabilidades:
   - ensamblar el módulo toast
   - exponer api pública única
   - inicialización segura
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

  function init() {
    if (initialized) {
      ensureToastKeyframes();
      ensureToastContainer();
      return api;
    }

    ensureToastKeyframes();
    ensureToastContainer();

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

    initialized = true;

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
      clearToasts();
    } catch {}

    try {
      resetToastApiState();
    } catch {}

    initialized = false;

    return true;
  }

  const api = {
    init,
    destroy,

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

    scope: TOAST_SCOPE,
  };

  return api;
})();

export { Toast };
export default Toast;
