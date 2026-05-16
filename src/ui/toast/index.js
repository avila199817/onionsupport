/* =========================================================
   Onion SPA - Toast
   Archivo: src/ui/toast/index.js

   Toast orchestrator limpio:
   - API pública única
   - auto-init al primer uso
   - bind global/DOM idempotente
   - bridge AppCore.setShowToast()
   - registro silencioso en AppCore/modules/window
   - sin auth/router/http/store global
   - sin estilos runtime
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  TOAST_VERSION,
  TOAST_SOURCE,
  TOAST_SCOPE,
} from "./constants.js";

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
  getToastApiSnapshot,
} from "./api.js";

import {
  bindToastGlobalEvents,
  bindToastDomEvents,
  unbindToastEvents,
  getToastEventsSnapshot,
} from "./events.js";

import {
  ensureToastContainer,
  ensureToastKeyframes,
  getToastDomSnapshot,
} from "./dom.js";

import {
  hasToastItem,
  getToastStoreSnapshot,
} from "./store.js";

import {
  getToastHelpersSnapshot,
  safeText,
} from "./helpers.js";

import {
  getToastTextSnapshot,
} from "./text.js";

/* =========================================================
   VERSION
========================================================= */

export const TOAST_MODULE_VERSION = TOAST_VERSION || "17.0.0-clean";

const SOURCE = TOAST_SOURCE || "ui.toast";

const GLOBAL_KEY = "__ONION_TOAST__";

const EVENTS = Object.freeze({
  init: "toast:init",
  initError: "toast:init:error",
  ready: "toast:ready",
  destroy: "toast:destroy",
  registered: "toast:module:registered",
  bridgeReady: "toast:bridge:ready",
});

/* =========================================================
   SINGLETON
========================================================= */

export const Toast = (() => {
  "use strict";

  /* =======================================================
     RUNTIME
  ======================================================= */

  let initialized = false;
  let initializing = false;
  let eventsBound = false;
  let destroyed = false;

  let initCount = 0;
  let bindCount = 0;
  let destroyCount = 0;
  let callCount = 0;
  let errorCount = 0;

  let lastInitAt = "";
  let lastBindAt = "";
  let lastDestroyAt = "";
  let lastCallAt = "";
  let lastError = null;

  /* =======================================================
     BASICS
  ======================================================= */

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function isFn(value) {
    return typeof value === "function";
  }

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function now() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function iso(ms = now()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function normalizeError(error = null, context = "toast") {
    if (!error) return null;

    const source = error?.error || error?.reason || error;

    return {
      context,
      name: safeText(source?.name || source?.constructor?.name, "Error"),
      message: safeText(source?.message || source?.reason || source, "Toast error."),
      code: source?.code || source?.data?.code || source?.response?.data?.code || null,
      status: source?.status || source?.statusCode || source?.response?.status || null,
      at: iso(),
    };
  }

  function recordError(error, context = "toast") {
    errorCount += 1;
    lastError = normalizeError(error, context);

    try {
      AppCore?.utils?.warn?.("[Toast]", lastError);
    } catch {}

    return lastError;
  }

  function emit(eventName = "", payload = {}, options = {}) {
    const name = safeText(eventName, "");
    if (!name) return false;

    const detail = {
      source: SOURCE,
      version: TOAST_MODULE_VERSION,
      scope: TOAST_SCOPE,
      at: iso(),
      ...safeObject(payload),
    };

    let hasBus = false;
    let emitted = false;

    try {
      if (isFn(AppCore?.events?.emit)) {
        hasBus = true;
        AppCore.events.emit(name, detail);
        emitted = true;
      }
    } catch {}

    if ((options.window === true || !hasBus) && isBrowser()) {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
        emitted = true;
      } catch {}
    }

    return emitted;
  }

  function log(...args) {
    try {
      AppCore?.utils?.log?.("[Toast]", ...args);
    } catch {}
  }

  /* =======================================================
     NORMALIZE INPUT
  ======================================================= */

  function isErrorLike(value) {
    return Boolean(
      value instanceof Error ||
        (
          value &&
          typeof value === "object" &&
          (
            safeText(value.message, "") ||
            safeText(value.name, "")
          )
        )
    );
  }

  function normalizeShowInput(input = {}, options = {}) {
    const opts = safeObject(options);

    if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
      return {
        ...opts,
        message: safeText(input, ""),
      };
    }

    if (isErrorLike(input)) {
      return {
        ...opts,
        type: "error",
        message: safeText(input.message, "Error inesperado."),
        error: input,
      };
    }

    return {
      ...safeObject(input),
      ...opts,
    };
  }

  function normalizeMessageOptions(message = "", options = {}) {
    const opts = safeObject(options);

    if (isErrorLike(message)) {
      return {
        message: safeText(message.message, "Error inesperado."),
        options: {
          ...opts,
          error: message,
        },
      };
    }

    if (isObject(message)) {
      return {
        message: safeText(message.message || message.text || "", ""),
        options: {
          ...message,
          ...opts,
        },
      };
    }

    return {
      message: safeText(message, ""),
      options: opts,
    };
  }

  /* =======================================================
     DOM / EVENTS
  ======================================================= */

  function ensureDom() {
    if (!isBrowser()) return false;

    try {
      ensureToastKeyframes?.();
    } catch (error) {
      recordError(error, "ensureToastKeyframes");
    }

    try {
      ensureToastContainer?.();
      return true;
    } catch (error) {
      recordError(error, "ensureToastContainer");
      return false;
    }
  }

  function actions() {
    return {
      show,
      showToast: show,

      update,
      updateToast: update,

      dismiss,
      dismissToast: dismiss,

      clear,
      clearToasts: clear,

      reset,
      resetToastApiState: reset,

      success,
      successToast: success,

      error,
      errorToast: error,

      warning,
      warn,
      warningToast: warning,

      info,
      infoToast: info,

      loading,
      loadingToast: loading,

      refreshLanguage,
      refreshAllToastsLanguage: refreshLanguage,
    };
  }

  function bindEvents() {
    if (eventsBound) return true;

    try {
      bindToastGlobalEvents(actions());
    } catch (error) {
      recordError(error, "bindToastGlobalEvents");
    }

    try {
      bindToastDomEvents(actions());
    } catch (error) {
      recordError(error, "bindToastDomEvents");
    }

    eventsBound = true;
    bindCount += 1;
    lastBindAt = iso();

    return true;
  }

  function unbindEvents() {
    if (!eventsBound) return true;

    try {
      unbindToastEvents();
    } catch (error) {
      recordError(error, "unbindToastEvents");
    }

    eventsBound = false;
    return true;
  }

  /* =======================================================
     BRIDGE / REGISTRATION
  ======================================================= */

  function showBridge(message = "", type = "info", options = {}) {
    if (isObject(type)) {
      return show(message, type);
    }

    return show({
      ...safeObject(options),
      type: safeText(type, "info"),
      message,
    });
  }

  function registerModuleName(name = "") {
    const clean = safeText(name, "");
    if (!clean) return false;

    try {
      const current = AppCore?.modules?.get?.(clean);

      if (current === api) return true;

      AppCore?.modules?.register?.(clean, api, {
        overwrite: true,
        replace: true,
        aliases: clean === "Toast" ? ["toast"] : ["Toast"],
        source: SOURCE,
        silent: true,
        emit: false,
      });

      return true;
    } catch {}

    try {
      AppCore?.modules?.set?.(clean, api, {
        source: SOURCE,
        silent: true,
        emit: false,
      });

      return true;
    } catch {}

    try {
      if (AppCore?.registry?.modules?.set) {
        AppCore.registry.modules.set(clean, api);
        return true;
      }
    } catch {}

    return false;
  }

  function registerCoreBridge() {
    let ok = false;

    try {
      AppCore.Toast = api;
      ok = true;
    } catch {}

    try {
      AppCore.toast = api;
      ok = true;
    } catch {}

    try {
      AppCore.setShowToast?.(showBridge);
      ok = true;
    } catch {}

    try {
      if (AppCore.services && typeof AppCore.services === "object") {
        AppCore.services.toast = api;
        AppCore.services.Toast = api;
        ok = true;
      }
    } catch {}

    try {
      if (AppCore.ui && typeof AppCore.ui === "object") {
        AppCore.ui.toast = api;
        AppCore.ui.Toast = api;
        ok = true;
      }
    } catch {}

    return ok;
  }

  function registerWindowBridge() {
    if (!isBrowser()) return false;

    let ok = false;

    try {
      window[GLOBAL_KEY] = api;
      window.OnionToast = api;
      ok = true;
    } catch {}

    try {
      window.OnionApp = window.OnionApp || {};
      window.OnionApp.Toast = api;
      window.OnionApp.toast = api;
      ok = true;
    } catch {}

    try {
      if (!window.Toast || window.Toast === api) {
        window.Toast = api;
        ok = true;
      }
    } catch {}

    return ok;
  }

  function register(options = {}) {
    const opts = safeObject(options);

    const modules = {
      Toast: registerModuleName("Toast"),
      toast: registerModuleName("toast"),
    };

    const core = registerCoreBridge();
    const win = opts.windowBridge === false ? false : registerWindowBridge();

    emit(EVENTS.registered, {
      modules,
      core,
      window: win,
    });

    emit(EVENTS.bridgeReady, {
      core,
      window: win,
      showBridge: true,
    });

    return Boolean(modules.Toast || modules.toast || core || win);
  }

  /* =======================================================
     LIFECYCLE
  ======================================================= */

  function init(options = {}) {
    const opts = safeObject(options);

    if (initialized && opts.force !== true) {
      ensureDom();
      register(opts);
      return api;
    }

    if (initializing) return api;

    initializing = true;
    destroyed = false;

    try {
      ensureDom();

      if (opts.bindEvents !== false && opts.events !== false) {
        bindEvents();
      }

      register(opts);

      initialized = true;
      initCount += 1;
      lastInitAt = iso();

      emit(EVENTS.init, {
        initialized: true,
        initCount,
      });

      emit(EVENTS.ready, {
        ready: true,
      });

      log("ready", {
        version: TOAST_MODULE_VERSION,
      });

      return api;
    } catch (error) {
      initialized = false;
      recordError(error, "init");

      emit(
        EVENTS.initError,
        {
          error: lastError,
        },
        {
          window: true,
        }
      );

      return api;
    } finally {
      initializing = false;
    }
  }

  function ensureReady() {
    if (destroyed) destroyed = false;

    if (!initialized && !initializing) {
      init();
    } else if (initialized) {
      ensureDom();
    }

    return true;
  }

  function destroy(options = {}) {
    const opts = safeObject(options);

    try {
      unbindEvents();
    } catch {}

    if (opts.clear !== false) {
      try {
        resetToastApiState({
          silent: true,
          source: "toast-index:destroy",
        });
      } catch (error) {
        recordError(error, "destroy:reset");
      }
    }

    initialized = false;
    initializing = false;
    destroyed = true;

    destroyCount += 1;
    lastDestroyAt = iso();

    emit(EVENTS.destroy, {
      destroyed: true,
      destroyCount,
    });

    return true;
  }

  /* =======================================================
     SAFE CALL
  ======================================================= */

  function call(fn, args = [], context = "toast") {
    ensureReady();

    callCount += 1;
    lastCallAt = iso();

    try {
      return fn(...args);
    } catch (error) {
      recordError(error, context);
      return null;
    }
  }

  /* =======================================================
     API CORE
  ======================================================= */

  function show(input = {}, options = {}) {
    return call(
      showToast,
      [
        normalizeShowInput(input, {
          source: SOURCE,
          ...safeObject(options),
        }),
      ],
      "show"
    );
  }

  function update(idOrPatch = "", patch = {}) {
    const id = isObject(idOrPatch)
      ? safeText(idOrPatch.id || idOrPatch.toastId || idOrPatch.key, "")
      : safeText(idOrPatch, "");

    const finalPatch = isObject(idOrPatch)
      ? {
          ...idOrPatch,
          ...safeObject(patch),
          source: SOURCE,
        }
      : {
          ...safeObject(patch),
          source: SOURCE,
        };

    if (!id) return null;

    return call(
      updateToast,
      [
        id,
        finalPatch,
      ],
      "update"
    );
  }

  function dismiss(id = null, options = {}) {
    const toastId = safeText(id, "");

    if (!toastId) {
      return clear(options);
    }

    return call(
      dismissToast,
      [
        toastId,
        {
          source: SOURCE,
          ...safeObject(options),
        },
      ],
      "dismiss"
    );
  }

  function clear(options = {}) {
    return call(
      clearToasts,
      [
        {
          source: "toast-api:clear",
          ...safeObject(options),
        },
      ],
      "clear"
    );
  }

  function reset(options = {}) {
    return call(
      resetToastApiState,
      [
        {
          source: "toast-api:reset",
          ...safeObject(options),
        },
      ],
      "reset"
    );
  }

  /* =======================================================
     API VARIANTS
  ======================================================= */

  function success(message = "", options = {}) {
    const normalized = normalizeMessageOptions(message, options);

    return call(
      successToast,
      [
        normalized.message,
        {
          source: SOURCE,
          ...normalized.options,
        },
      ],
      "success"
    );
  }

  function error(message = "", options = {}) {
    const normalized = normalizeMessageOptions(message, options);

    return call(
      errorToast,
      [
        normalized.message || "Error inesperado.",
        {
          source: SOURCE,
          ...normalized.options,
        },
      ],
      "error"
    );
  }

  function warning(message = "", options = {}) {
    const normalized = normalizeMessageOptions(message, options);

    return call(
      warningToast,
      [
        normalized.message,
        {
          source: SOURCE,
          ...normalized.options,
        },
      ],
      "warning"
    );
  }

  function warn(message = "", options = {}) {
    return warning(message, options);
  }

  function info(message = "", options = {}) {
    const normalized = normalizeMessageOptions(message, options);

    return call(
      infoToast,
      [
        normalized.message,
        {
          source: SOURCE,
          ...normalized.options,
        },
      ],
      "info"
    );
  }

  function loading(message = "", options = {}) {
    const normalized = normalizeMessageOptions(message, options);

    return call(
      loadingToast,
      [
        normalized.message,
        {
          source: SOURCE,
          persist: true,
          ...normalized.options,
        },
      ],
      "loading"
    );
  }

  /* =======================================================
     ALIASES / UTILITIES
  ======================================================= */

  function notify(message = "", options = {}) {
    return show(message, options);
  }

  function toast(message = "", options = {}) {
    return show(message, options);
  }

  function open(message = "", options = {}) {
    return show(message, options);
  }

  function push(message = "", options = {}) {
    return show(message, options);
  }

  function dismissAll(options = {}) {
    return clear(options);
  }

  function hide(id = null, options = {}) {
    return dismiss(id, options);
  }

  function close(id = null, options = {}) {
    return dismiss(id, options);
  }

  function remove(id = null, options = {}) {
    return dismiss(id, options);
  }

  function refreshLanguage() {
    return call(
      refreshAllToastsLanguage,
      [],
      "refreshLanguage"
    );
  }

  function exists(id = null) {
    const toastId = safeText(id, "");

    if (!toastId) return true;

    try {
      return hasToastItem(toastId);
    } catch {
      return false;
    }
  }

  function ready() {
    return Boolean(initialized && !destroyed);
  }

  function resolve() {
    ensureReady();
    return api;
  }

  /* =======================================================
     SNAPSHOT
  ======================================================= */

  function snapshotOf(fn, fallback = null) {
    try {
      return fn?.() ?? fallback;
    } catch (error) {
      recordError(error, "snapshot");
      return fallback;
    }
  }

  function getSnapshot(options = {}) {
    const deep = options?.deep === true;

    return {
      version: TOAST_MODULE_VERSION,
      source: SOURCE,
      scope: TOAST_SCOPE,

      initialized,
      initializing,
      eventsBound,
      destroyed,

      counters: {
        initCount,
        bindCount,
        destroyCount,
        callCount,
        errorCount,
      },

      timestamps: {
        lastInitAt,
        lastBindAt,
        lastDestroyAt,
        lastCallAt,
      },

      bridges: {
        coreToast: Boolean(AppCore?.Toast === api),
        coreToastLower: Boolean(AppCore?.toast === api),
        showToastBridge: true,
        modulesToast: Boolean(AppCore?.modules?.get?.("Toast") === api),
        modulesToastLower: Boolean(AppCore?.modules?.get?.("toast") === api),
        windowOnionToast: isBrowser() ? Boolean(window.OnionToast === api) : false,
        windowGlobalKey: isBrowser() ? Boolean(window[GLOBAL_KEY] === api) : false,
      },

      api: snapshotOf(getToastApiSnapshot, null),
      store: snapshotOf(getToastStoreSnapshot, null),

      deep: deep
        ? {
            dom: snapshotOf(getToastDomSnapshot, null),
            events: snapshotOf(getToastEventsSnapshot, null),
            helpers: snapshotOf(getToastHelpersSnapshot, null),
            text: snapshotOf(getToastTextSnapshot, null),
          }
        : null,

      lastError,

      at: iso(),
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
    TOAST_MODULE_VERSION,
    version: TOAST_MODULE_VERSION,
    source: SOURCE,
    scope: TOAST_SCOPE,

    init,
    destroy,
    ensureReady,
    register,
    resolve,

    bindEvents,
    unbindEvents,

    show,
    notify,
    toast,
    open,
    push,

    update,

    dismiss,
    hide,
    close,
    remove,

    clear,
    dismissAll,
    clearAll: clear,
    reset,

    success,
    error,
    warning,
    warn,
    info,
    loading,

    refreshLanguage,
    refreshAllToastsLanguage: refreshLanguage,

    exists,
    ready,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    getState: getSnapshot,

    bridge: showBridge,

    get initialized() {
      return Boolean(initialized);
    },

    get initializing() {
      return Boolean(initializing);
    },

    get eventsBound() {
      return Boolean(eventsBound);
    },

    get destroyed() {
      return Boolean(destroyed);
    },
  };

  try {
    register({
      windowBridge: true,
    });
  } catch {}

  return api;
})();

export function initToast(options = {}) {
  return Toast.init(options);
}

export function destroyToast(options = {}) {
  return Toast.destroy(options);
}

export const show = (...args) => Toast.show(...args);
export const notify = (...args) => Toast.notify(...args);
export const toast = (...args) => Toast.toast(...args);
export const update = (...args) => Toast.update(...args);
export const dismiss = (...args) => Toast.dismiss(...args);
export const clear = (...args) => Toast.clear(...args);

export const success = (...args) => Toast.success(...args);
export const error = (...args) => Toast.error(...args);
export const warning = (...args) => Toast.warning(...args);
export const warn = (...args) => Toast.warn(...args);
export const info = (...args) => Toast.info(...args);
export const loading = (...args) => Toast.loading(...args);

export default Toast;
