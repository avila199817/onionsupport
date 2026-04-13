/* =========================================================
   Onion SPA - Toast Bridge
   Archivo: src/ui/toast/toast.bridge.js

   Responsabilidades:
   - resolver el servicio de toast global
   - exponer una api uniforme para las vistas
   - evitar acoplar loginView al montaje real del toast
   - tolerar distintos nombres de método y providers legacy
   - resolver providers en caliente
   - soportar dismiss individual o global
   - soportar providers con firmas distintas
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

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeOptions(options = {}) {
  return isObject(options) ? options : {};
}

function safeLogWarn(...args) {
  try {
    const warn =
      AppCore?.utils?.warn ||
      AppCore?.utils?.log?.warn ||
      console?.warn;

    if (isFunction(warn)) {
      warn(...args);
    }
  } catch {}
}

function tryCall(fn, ...args) {
  try {
    if (!isFunction(fn)) return null;
    return fn(...args);
  } catch (error) {
    safeLogWarn("[ToastBridge] provider call error", error);
    return null;
  }
}

function hasToastShape(candidate) {
  if (!isObject(candidate)) return false;

  return [
    "init",
    "success",
    "error",
    "danger",
    "info",
    "warning",
    "warn",
    "loading",
    "show",
    "open",
    "push",
    "notify",
    "dismiss",
    "dismissAll",
    "hide",
    "close",
    "clear",
    "clearAll",
    "remove",
    "removeAll",
  ].some((key) => isFunction(candidate?.[key]));
}

function buildToastPayload(type, message, options = {}) {
  const payload = safeOptions(options);

  return {
    ...payload,
    type,
    message: isNonEmptyString(message) ? message.trim() : "",
  };
}

/* =========================================================
   PROVIDER RESOLUTION
========================================================= */

export function resolveToastProvider(customProvider = null) {
  const candidates = [
    customProvider,
    AppCore?.services?.toast,
    AppCore?.toast,
    AppCore?.ui?.toast,
    globalThis?.OnionToast,
    globalThis?.Toast,
    globalThis?.toast,
    globalThis?.uiToast,
  ];

  for (const candidate of candidates) {
    if (hasToastShape(candidate)) {
      return candidate;
    }
  }

  return null;
}

/* =========================================================
   CORE DISPATCH
========================================================= */

function callDirectMethod(provider, methodName, message, options = {}) {
  if (!provider || !isFunction(provider?.[methodName])) {
    return null;
  }

  const payload = safeOptions(options);

  /*
    Intentamos varias firmas comunes:
    1) method(message, options)
    2) method({ message, ...options })
    3) method(message)
  */
  let result = tryCall(
    provider[methodName].bind(provider),
    message,
    payload
  );

  if (result !== null && result !== undefined) {
    return result;
  }

  result = tryCall(
    provider[methodName].bind(provider),
    {
      message,
      ...payload,
    }
  );

  if (result !== null && result !== undefined) {
    return result;
  }

  return tryCall(
    provider[methodName].bind(provider),
    message
  );
}

function dispatchWithShowLike(provider, type, message, options = {}) {
  if (!provider) return null;

  const payload = buildToastPayload(type, message, options);

  const showLikeMethods = ["show", "open", "push", "notify"];

  for (const methodName of showLikeMethods) {
    if (!isFunction(provider?.[methodName])) continue;

    /*
      Intentamos varias firmas comunes:
      1) show(message, { type, ...options })
      2) show({ message, type, ...options })
      3) show(type, message, options)
    */
    let result = tryCall(
      provider[methodName].bind(provider),
      message,
      payload
    );

    if (result !== null && result !== undefined) {
      return result;
    }

    result = tryCall(
      provider[methodName].bind(provider),
      payload
    );

    if (result !== null && result !== undefined) {
      return result;
    }

    result = tryCall(
      provider[methodName].bind(provider),
      type,
      message,
      safeOptions(options)
    );

    if (result !== null && result !== undefined) {
      return result;
    }
  }

  return null;
}

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
    const result = callDirectMethod(
      provider,
      methodName,
      message,
      payload
    );

    if (result !== null && result !== undefined) {
      return result;
    }
  }

  return dispatchWithShowLike(
    provider,
    type,
    message,
    payload
  );
}

function dismissToast(provider, toastId = null) {
  if (!provider) return null;

  const hasId = toastId !== null && toastId !== undefined;

  if (hasId) {
    const itemDismissMethods = [
      "dismiss",
      "hide",
      "close",
      "remove",
    ];

    for (const methodName of itemDismissMethods) {
      if (!isFunction(provider?.[methodName])) continue;

      const result = tryCall(
        provider[methodName].bind(provider),
        toastId
      );

      if (result !== null && result !== undefined) {
        return result;
      }
    }
  }

  const globalDismissMethods = [
    "dismissAll",
    "clear",
    "clearAll",
    "removeAll",
  ];

  for (const methodName of globalDismissMethods) {
    if (!isFunction(provider?.[methodName])) continue;

    const result = tryCall(
      provider[methodName].bind(provider)
    );

    if (result !== null && result !== undefined) {
      return result;
    }
  }

  /*
    Fallback: si no hay clear global pero sí dismiss/hide/close/remove,
    intentamos llamarlos sin id por compatibilidad legacy.
  */
  if (!hasId) {
    const fallbackMethods = [
      "dismiss",
      "hide",
      "close",
      "remove",
    ];

    for (const methodName of fallbackMethods) {
      if (!isFunction(provider?.[methodName])) continue;

      const result = tryCall(
        provider[methodName].bind(provider)
      );

      if (result !== null && result !== undefined) {
        return result;
      }
    }
  }

  return null;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function createToastBridge(customProvider = null) {
  function getProvider() {
    return resolveToastProvider(customProvider);
  }

  return {
    get provider() {
      return getProvider();
    },

    resolve() {
      return getProvider();
    },

    exists() {
      return Boolean(getProvider());
    },

    ready() {
      return Boolean(getProvider());
    },

    init(...args) {
      const provider = getProvider();

      if (!provider) return null;
      if (!isFunction(provider?.init)) return null;

      return tryCall(provider.init.bind(provider), ...args);
    },

    success(message, options = {}) {
      return dispatch(
        getProvider(),
        "success",
        message,
        options
      );
    },

    error(message, options = {}) {
      return dispatch(
        getProvider(),
        "error",
        message,
        options
      );
    },

    info(message, options = {}) {
      return dispatch(
        getProvider(),
        "info",
        message,
        options
      );
    },

    warning(message, options = {}) {
      return dispatch(
        getProvider(),
        "warning",
        message,
        options
      );
    },

    warn(message, options = {}) {
      return dispatch(
        getProvider(),
        "warning",
        message,
        options
      );
    },

    loading(message, options = {}) {
      return dispatch(
        getProvider(),
        "loading",
        message,
        {
          persist: true,
          ...safeOptions(options),
        }
      );
    },

    show(message, options = {}) {
      const payload = safeOptions(options);
      const type = isNonEmptyString(payload.type)
        ? payload.type.trim().toLowerCase()
        : "info";

      return dispatch(
        getProvider(),
        type,
        message,
        payload
      );
    },

    dismiss(toastId = null) {
      return dismissToast(getProvider(), toastId);
    },

    clear() {
      return dismissToast(getProvider(), null);
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

  create(customProvider = null) {
    return createToastBridge(customProvider);
  },

  resolve(customProvider = null) {
    return resolveToastProvider(customProvider);
  },

  exists(customProvider = null) {
    return Boolean(resolveToastProvider(customProvider));
  },
};

export default ToastBridge;
