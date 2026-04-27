/* =========================================================
   Onion SPA - Toast
   Archivo: src/ui/toast/index.js

   Responsabilidades:
   - ensamblar el módulo toast
   - exponer API pública única
   - inicialización segura e idempotente
   - auto-init transparente al primer uso
   - bind de eventos globales
   - bind de eventos DOM
   - registro robusto en AppCore.modules
   - compatibilidad bridge para Login / Auth Views
   - aliases legacy: warn / dismissAll / exists / ready
   - bridge opcional window.OnionToast
   - snapshot debug
   - destroy seguro
   - cero throws accidentales
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

  /* =========================================================
     INTERNAL STATE
  ========================================================= */

  let initialized = false;
  let initializing = false;
  let eventsBound = false;
  let destroyed = false;

  /* =========================================================
     BASICS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeText(value, fallback = "") {
    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    const text =
      String(value).trim();

    return text || fallback;
  }

  function isObject(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function normalizeOptions(options = {}) {
    return isObject(options)
      ? options
      : {};
  }

  function normalizeShowInput(input = {}) {
    if (
      typeof input === "string"
    ) {
      return {
        message: input,
      };
    }

    if (
      input instanceof Error
    ) {
      return {
        message:
          safeText(
            input.message,
            "Error inesperado"
          ),
        error: input,
        type: "error",
      };
    }

    return normalizeOptions(input);
  }

  /* =========================================================
     SAFE OPS
  ========================================================= */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(
        "[Toast]",
        ...args
      );
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(
        "[Toast]",
        ...args
      );
    } catch {}

    try {
      console.warn(
        "[Toast]",
        ...args
      );
    } catch {}
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(
        "[Toast]",
        ...args
      );
    } catch {}

    try {
      console.error(
        "[Toast]",
        ...args
      );
    } catch {}
  }

  function safeEmit(eventName, payload = {}) {
    const name =
      safeText(eventName, "");

    if (!name) {
      return false;
    }

    let emitted = false;

    try {
      AppCore?.events?.emit?.(
        name,
        payload
      );

      emitted = true;
    } catch {}

    try {
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(name, {
            detail: payload,
          })
        );

        emitted = true;
      }
    } catch {}

    return emitted;
  }

  /* =========================================================
     DOM
  ========================================================= */

  function ensureDom() {
    try {
      ensureToastKeyframes();
    } catch (error) {
      safeWarn(
        "No se pudieron asegurar keyframes toast.",
        error
      );
    }

    try {
      ensureToastContainer();
    } catch (error) {
      safeWarn(
        "No se pudo asegurar contenedor toast.",
        error
      );
    }

    return true;
  }

  /* =========================================================
     MODULE REGISTRATION
  ========================================================= */

  function registerInModulesObject() {
    try {
      if (!AppCore) {
        return false;
      }

      AppCore.modules =
        AppCore.modules || {};

      if (
        AppCore.modules &&
        typeof AppCore.modules === "object"
      ) {
        AppCore.modules.toast = api;
        AppCore.modules.Toast = api;
        return true;
      }
    } catch {}

    return false;
  }

  function registerInModulesRegistry() {
    try {
      const modules =
        AppCore?.modules;

      if (!modules) {
        return false;
      }

      if (
        isFunction(modules.has) &&
        isFunction(modules.register)
      ) {
        if (!modules.has("toast")) {
          modules.register(
            "toast",
            api
          );
        }

        return true;
      }

      if (
        isFunction(modules.set)
      ) {
        modules.set(
          "toast",
          api
        );

        return true;
      }
    } catch {}

    return false;
  }

  function registerAppCoreBridge() {
    try {
      if (!AppCore) {
        return false;
      }

      AppCore.Toast = api;
      AppCore.toast = api;

      return true;
    } catch {}

    return false;
  }

  function registerWindowBridge() {
    if (!isBrowser()) {
      return false;
    }

    try {
      window.OnionToast = api;

      if (!window.Toast) {
        window.Toast = api;
      }

      window.OnionApp =
        window.OnionApp || {};

      window.OnionApp.Toast = api;
      window.OnionApp.toast = api;

      return true;
    } catch {}

    return false;
  }

  function registerModule() {
    const registryOk =
      registerInModulesRegistry();

    const objectOk =
      registerInModulesObject();

    const coreOk =
      registerAppCoreBridge();

    const windowOk =
      registerWindowBridge();

    safeEmit(
      "toast:module:registered",
      {
        registryOk,
        objectOk,
        coreOk,
        windowOk,
        scope: TOAST_SCOPE,
      }
    );

    return Boolean(
      registryOk ||
      objectOk ||
      coreOk ||
      windowOk
    );
  }

  /* =========================================================
     EVENTS
  ========================================================= */

  function bindEvents() {
    if (eventsBound) {
      return true;
    }

    try {
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
    } catch (error) {
      safeWarn(
        "bindToastGlobalEvents falló.",
        error
      );
    }

    try {
      bindToastDomEvents({
        dismiss: dismissToast,
      });
    } catch (error) {
      safeWarn(
        "bindToastDomEvents falló.",
        error
      );
    }

    eventsBound = true;

    safeEmit(
      "toast:events:bound",
      {
        scope: TOAST_SCOPE,
      }
    );

    return true;
  }

  function unbindEvents() {
    if (!eventsBound) {
      return true;
    }

    try {
      unbindToastEvents();
    } catch (error) {
      safeWarn(
        "unbindToastEvents falló.",
        error
      );
    }

    eventsBound = false;

    safeEmit(
      "toast:events:unbound",
      {
        scope: TOAST_SCOPE,
      }
    );

    return true;
  }

  /* =========================================================
     LIFECYCLE
  ========================================================= */

  function init() {
    if (initialized) {
      ensureDom();
      registerModule();
      return api;
    }

    if (initializing) {
      return api;
    }

    initializing = true;
    destroyed = false;

    try {
      ensureDom();
      bindEvents();
      registerModule();

      initialized = true;

      safeEmit(
        "toast:init",
        {
          initialized: true,
          scope: TOAST_SCOPE,
        }
      );

      safeLog(
        "Toast UI inicializado correctamente."
      );

      return api;
    } catch (error) {
      initialized = false;

      safeError(
        "No se pudo inicializar Toast.",
        error
      );

      safeEmit(
        "toast:init:error",
        {
          error,
          message:
            safeText(
              error?.message,
              "Toast init error"
            ),
          scope: TOAST_SCOPE,
        }
      );

      return api;
    } finally {
      initializing = false;
    }
  }

  function destroy() {
    try {
      unbindEvents();
    } catch {}

    try {
      clearToasts();
    } catch {}

    try {
      resetToastApiState();
    } catch {}

    initialized = false;
    initializing = false;
    destroyed = true;

    safeEmit(
      "toast:destroy",
      {
        destroyed: true,
        scope: TOAST_SCOPE,
      }
    );

    return true;
  }

  function ensureReady() {
    if (!initialized) {
      init();
    }

    return true;
  }

  /* =========================================================
     PUBLIC API · CORE
  ========================================================= */

  function show(options = {}) {
    ensureReady();

    return showToast(
      normalizeShowInput(
        options
      )
    );
  }

  function update(id, patch = {}) {
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
      id === undefined ||
      id === ""
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

  /* =========================================================
     PUBLIC API · VARIANTS
  ========================================================= */

  function success(message = "", options = {}) {
    ensureReady();

    return successToast(
      message,
      normalizeOptions(
        options
      )
    );
  }

  function error(message = "", options = {}) {
    ensureReady();

    if (
      message instanceof Error
    ) {
      return errorToast(
        safeText(
          message.message,
          "Error inesperado"
        ),
        {
          error: message,
          ...normalizeOptions(options),
        }
      );
    }

    return errorToast(
      message,
      normalizeOptions(
        options
      )
    );
  }

  function warning(message = "", options = {}) {
    ensureReady();

    return warningToast(
      message,
      normalizeOptions(
        options
      )
    );
  }

  function warn(message = "", options = {}) {
    return warning(
      message,
      options
    );
  }

  function info(message = "", options = {}) {
    ensureReady();

    return infoToast(
      message,
      normalizeOptions(
        options
      )
    );
  }

  function loading(message = "", options = {}) {
    ensureReady();

    return loadingToast(
      message,
      {
        persist: true,
        ...normalizeOptions(options),
      }
    );
  }

  /* =========================================================
     PUBLIC API · LANGUAGE / LEGACY
  ========================================================= */

  function refreshLanguage() {
    ensureReady();

    return refreshAllToastsLanguage();
  }

  function exists() {
    /*
      Alias legacy:
      históricamente algunas vistas sólo validan que Toast existe.
    */
    return true;
  }

  function ready() {
    return Boolean(
      initialized
    );
  }

  function resolve() {
    ensureReady();

    return api;
  }

  /* =========================================================
     DEBUG
  ========================================================= */

  function getSnapshot() {
    return {
      initialized:
        Boolean(initialized),

      initializing:
        Boolean(initializing),

      eventsBound:
        Boolean(eventsBound),

      destroyed:
        Boolean(destroyed),

      scope:
        TOAST_SCOPE,

      hasAppCore:
        Boolean(AppCore),

      hasEventBus:
        Boolean(AppCore?.events),

      hasModules:
        Boolean(AppCore?.modules),

      hasWindowBridge:
        isBrowser()
          ? Boolean(window.OnionToast)
          : false,
    };
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

    refreshLanguage,

    exists,
    ready,
    resolve,

    getSnapshot,

    scope: TOAST_SCOPE,

    get initialized() {
      return Boolean(initialized);
    },

    get eventsBound() {
      return Boolean(eventsBound);
    },
  };

  return api;
})();

export { Toast };
export default Toast;
