/* =========================================================
   Onion SPA - Toast Bridge
   Archivo: src/ui/toast/toast.bridge.js

   Responsabilidades:
   - resolver el servicio de toast global
   - exponer una api uniforme para las vistas
   - evitar acoplar loginView al montaje real del toast
   - tolerar distintos nombres de método y providers legacy
========================================================= */

import AppCore from "../../core/core.js";

/* =========================================================
   HELPERS
========================================================= */

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isFunction(value) {
  return typeof value === "function";
}

function safeOptions(options = {}) {
  return isObject(options) ? options : {};
}

function tryCall(fn, ...args) {
  try {
    if (!isFunction(fn)) return null;
    return fn(...args);
  } catch (error) {
    try {
      AppCore?.utils?.log?.warn?.(
        "[ToastBridge] provider call error",
        error
      );
    } catch {}
    return null;
  }
}

/* =========================================================
   PROVIDER RESOLUTION
========================================================= */

export function resolveToastProvider(customProvider = null) {
  const candidates = [
    customProvider,
    AppCore?.services?.toast,
    AppCore?.toast,
    window?.OnionToast,
    window?.Toast,
    window?.toast,
    window?.uiToast,
  ];

  for (const candidate of candidates) {
    if (isObject(candidate)) {
      return candidate;
    }
  }

  return null;
}

/* =========================================================
   CORE DISPATCH
========================================================= */

function dispatch(provider, type, message, options = {}) {
  if (!provider) return null;

  const payload = safeOptions(options);

  const directMethodMap = {
    success: ["success"],
    error: ["error", "danger"],
    info: ["info"],
    warning: ["warning", "warn"],
    loading: ["loading"],
  };

  const directMethods = directMethodMap[type] || [];

  for (const methodName of directMethods) {
    if (isFunction(provider?.[methodName])) {
      return tryCall(provider[methodName].bind(provider), message, payload);
    }
  }

  if (isFunction(provider?.show)) {
    return tryCall(
      provider.show.bind(provider),
      message,
      {
        ...payload,
        type,
      }
    );
  }

  if (isFunction(provider?.open)) {
    return tryCall(
      provider.open.bind(provider),
      {
        message,
        ...payload,
        type,
      }
    );
  }

  return null;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function createToastBridge(customProvider = null) {
  const provider = resolveToastProvider(customProvider);

  return {
    provider,

    success(message, options = {}) {
      return dispatch(provider, "success", message, options);
    },

    error(message, options = {}) {
      return dispatch(provider, "error", message, options);
    },

    info(message, options = {}) {
      return dispatch(provider, "info", message, options);
    },

    warning(message, options = {}) {
      return dispatch(provider, "warning", message, options);
    },

    loading(message, options = {}) {
      return dispatch(
        provider,
        "loading",
        message,
        {
          persist: true,
          ...safeOptions(options),
        }
      );
    },

    dismiss(toastId = null) {
      if (!provider) return null;

      if (toastId !== null && toastId !== undefined) {
        if (isFunction(provider?.dismiss)) {
          return tryCall(provider.dismiss.bind(provider), toastId);
        }

        if (isFunction(provider?.hide)) {
          return tryCall(provider.hide.bind(provider), toastId);
        }

        if (isFunction(provider?.close)) {
          return tryCall(provider.close.bind(provider), toastId);
        }
      }

      if (isFunction(provider?.dismissAll)) {
        return tryCall(provider.dismissAll.bind(provider));
      }

      if (isFunction(provider?.clear)) {
        return tryCall(provider.clear.bind(provider));
      }

      return null;
    },

    exists() {
      return Boolean(provider);
    },
  };
}

/* =========================================================
   DEFAULT INSTANCE
========================================================= */

const ToastBridge = {
  of(customProvider = null) {
    return createToastBridge(customProvider);
  },

  resolve(customProvider = null) {
    return resolveToastProvider(customProvider);
  },
};

export default ToastBridge;
