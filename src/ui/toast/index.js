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
   - compatibilidad bridge para Login / Auth Views
   - aliases legacy (warn / dismissAll / exists / ready)
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

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(...args);
    } catch {}
  }

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
        AppCore.modules.register(
          "toast",
          api
        );
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
      warn: warningToast,
      info: infoToast,
      loading: loadingToast,

      refreshAllToastsLanguage,
    });

    bindToastDomEvents({
      dismiss: dismissToast,
    });
  }

  function ensureDom() {
    ensureToastKeyframes();
    ensureToastContainer();
  }

  /* =========================================================
     LIFECYCLE
  ========================================================= */

  function init() {
    if (initialized) {
      ensureDom();
      return api;
    }

    ensureDom();
    bindEvents();
    registerModule();

    initialized = true;

    safeLog(
      "Toast UI inicializado correctamente."
    );

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

  /* =========================================================
     NORMALIZERS
  ========================================================= */

  function normalizeOptions(
    options = {}
  ) {
    return options &&
      typeof options === "object"
      ? options
      : {};
  }

  function normalizeShowInput(
    input = {}
  ) {
    if (
      typeof input === "string"
    ) {
      return {
        message: input,
      };
    }

    return normalizeOptions(
      input
    );
  }

  /* =========================================================
     SAFE PUBLIC API
  ========================================================= */

  function show(
    options = {}
  ) {
    ensureReady();

    return showToast(
      normalizeShowInput(
        options
      )
    );
  }

  function update(
    id,
    patch = {}
  ) {
    ensureReady();

    return updateToast(
      id,
      normalizeOptions(
        patch
      )
    );
  }

  function dismiss(id = null) {
    ensureReady();

    if (
      id === null ||
      id === undefined
    ) {
      return clearToasts();
    }

    return dismissToast(id);
  }

  function dismissAll() {
    ensureReady();
    return clearToasts();
  }

  function clear() {
    ensureReady();
    return clearToasts();
  }

  function success(
    message = "",
    options = {}
  ) {
    ensureReady();

    return successToast(
      message,
      normalizeOptions(
        options
      )
    );
  }

  function error(
    message = "",
    options = {}
  ) {
    ensureReady();

    return errorToast(
      message,
      normalizeOptions(
        options
      )
    );
  }

  function warning(
    message = "",
    options = {}
  ) {
    ensureReady();

    return warningToast(
      message,
      normalizeOptions(
        options
      )
    );
  }

  function warn(
    message = "",
    options = {}
  ) {
    return warning(
      message,
      options
    );
  }

  function info(
    message = "",
    options = {}
  ) {
    ensureReady();

    return infoToast(
      message,
      normalizeOptions(
        options
      )
    );
  }

  function loading(
    message = "",
    options = {}
  ) {
    ensureReady();

    return loadingToast(
      message,
      {
        persist: true,
        ...normalizeOptions(
          options
        ),
      }
    );
  }

  function refreshLanguage() {
    ensureReady();

    return refreshAllToastsLanguage();
  }

  function exists() {
    return true;
  }

  function ready() {
    return initialized;
  }

  function resolve() {
    return api;
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
    dismissAll,
    clear,

    success,
    error,
    warning,
    warn,
    info,
    loading,

    refreshAllToastsLanguage:
      refreshLanguage,

    exists,
    ready,
    resolve,

    scope: TOAST_SCOPE,

    get initialized() {
      return initialized;
    },
  };

  return api;
})();

export { Toast };
export default Toast;
