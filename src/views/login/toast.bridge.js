/* =========================================================
   Onion SPA - Toast Bridge (FULL PRO SYSTEM)
   Archivo: src/ui/toast/toast.bridge.js

   Responsabilidades:
   - resolver el servicio de toast global
   - exponer una api uniforme para las vistas
   - evitar acoplar módulos al provider real
   - tolerar providers legacy / múltiples firmas
   - deduplicar toasts por id / key
   - reemplazar toast existente si comparte id
   - soportar dismiss individual o global
   - cooldown anti-spam por mensaje
   - robustez enterprise production ready
========================================================= */

import AppCore from "../../core/core.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

const ACTIVE_TOASTS = new Map();
const LAST_EMITTED = new Map();

const DEFAULT_DEDUPE_MS = 1200;

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

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function now() {
  return Date.now();
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

function safeLog(...args) {
  try {
    const log =
      AppCore?.utils?.log ||
      console?.log;

    if (isFunction(log)) {
      log(...args);
    }
  } catch {}
}

function tryCall(fn, ...args) {
  try {
    if (!isFunction(fn)) {
      return null;
    }

    return fn(...args);
  } catch (error) {
    safeLogWarn(
      "[ToastBridge] provider call error",
      error
    );

    return null;
  }
}

function hasToastShape(candidate) {
  if (!isObject(candidate)) {
    return false;
  }

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
  ].some((key) =>
    isFunction(candidate?.[key])
  );
}

function normalizeType(type = "info") {
  const value = safeText(type, "info")
    .toLowerCase();

  const map = {
    warn: "warning",
    danger: "error",
  };

  return map[value] || value;
}

function normalizeId(
  type,
  message,
  options = {}
) {
  const payload = safeOptions(options);

  return safeText(
    payload.id ||
    payload.toastId ||
    payload.key ||
    `${normalizeType(type)}:${safeText(message, "")}`,
    ""
  );
}

function buildToastPayload(
  type,
  message,
  options = {}
) {
  const payload = safeOptions(options);

  return {
    ...payload,
    id: normalizeId(type, message, payload),
    type: normalizeType(type),
    message: safeText(message, ""),
  };
}

function getDedupeMs(options = {}) {
  const payload = safeOptions(options);

  return Number(
    payload.dedupeMs ??
    payload.cooldownMs ??
    DEFAULT_DEDUPE_MS
  ) || DEFAULT_DEDUPE_MS;
}

function shouldSkipDuplicate(
  type,
  message,
  options = {}
) {
  const id = normalizeId(
    type,
    message,
    options
  );

  const ms = getDedupeMs(options);

  const previous =
    LAST_EMITTED.get(id) || 0;

  const diff =
    now() - previous;

  if (diff < ms) {
    return true;
  }

  LAST_EMITTED.set(id, now());

  return false;
}

function rememberActiveToast(
  logicalId,
  providerToastId = null
) {
  if (!logicalId) return;

  ACTIVE_TOASTS.set(
    logicalId,
    providerToastId ?? logicalId
  );
}

function getActiveToastId(id = "") {
  return ACTIVE_TOASTS.get(id) || id;
}

function forgetActiveToast(id = "") {
  ACTIVE_TOASTS.delete(id);
}

/* =========================================================
   PROVIDER RESOLUTION
========================================================= */

export function resolveToastProvider(
  customProvider = null
) {
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
   DISPATCH CORE
========================================================= */

function callDirectMethod(
  provider,
  methodName,
  message,
  options = {}
) {
  if (
    !provider ||
    !isFunction(provider?.[methodName])
  ) {
    return null;
  }

  const payload =
    safeOptions(options);

  let result = tryCall(
    provider[methodName].bind(provider),
    message,
    payload
  );

  if (
    result !== null &&
    result !== undefined
  ) {
    return result;
  }

  result = tryCall(
    provider[methodName].bind(provider),
    {
      message,
      ...payload,
    }
  );

  if (
    result !== null &&
    result !== undefined
  ) {
    return result;
  }

  return tryCall(
    provider[methodName].bind(provider),
    message
  );
}

function dispatchWithShowLike(
  provider,
  type,
  message,
  options = {}
) {
  if (!provider) {
    return null;
  }

  const payload =
    buildToastPayload(
      type,
      message,
      options
    );

  const methods = [
    "show",
    "open",
    "push",
    "notify",
  ];

  for (const methodName of methods) {
    if (
      !isFunction(provider?.[methodName])
    ) {
      continue;
    }

    let result = tryCall(
      provider[methodName].bind(provider),
      message,
      payload
    );

    if (
      result !== null &&
      result !== undefined
    ) {
      return result;
    }

    result = tryCall(
      provider[methodName].bind(provider),
      payload
    );

    if (
      result !== null &&
      result !== undefined
    ) {
      return result;
    }

    result = tryCall(
      provider[methodName].bind(provider),
      type,
      message,
      payload
    );

    if (
      result !== null &&
      result !== undefined
    ) {
      return result;
    }
  }

  return null;
}

function dismissToast(
  provider,
  toastId = null
) {
  if (!provider) {
    return null;
  }

  const hasId =
    toastId !== null &&
    toastId !== undefined &&
    toastId !== "";

  if (hasId) {
    const finalId =
      getActiveToastId(toastId);

    const methods = [
      "dismiss",
      "hide",
      "close",
      "remove",
    ];

    for (const methodName of methods) {
      if (
        !isFunction(provider?.[methodName])
      ) {
        continue;
      }

      const result = tryCall(
        provider[methodName].bind(provider),
        finalId
      );

      if (
        result !== null &&
        result !== undefined
      ) {
        forgetActiveToast(toastId);
        return result;
      }
    }
  }

  const globalMethods = [
    "dismissAll",
    "clear",
    "clearAll",
    "removeAll",
  ];

  for (const methodName of globalMethods) {
    if (
      !isFunction(provider?.[methodName])
    ) {
      continue;
    }

    const result = tryCall(
      provider[methodName].bind(provider)
    );

    if (
      result !== null &&
      result !== undefined
    ) {
      ACTIVE_TOASTS.clear();
      return result;
    }
  }

  return null;
}

function dispatch(
  provider,
  type,
  message,
  options = {}
) {
  if (!provider) {
    return null;
  }

  const payload =
    buildToastPayload(
      type,
      message,
      options
    );

  const normalizedType =
    payload.type;

  const logicalId =
    payload.id;

  if (
    shouldSkipDuplicate(
      normalizedType,
      message,
      payload
    )
  ) {
    return logicalId;
  }

  dismissToast(
    provider,
    logicalId
  );

  const directMethodMap = {
    success: ["success"],
    error: ["error", "danger"],
    info: ["info"],
    warning: ["warning", "warn"],
    loading: ["loading"],
  };

  const directMethods =
    directMethodMap[
      normalizedType
    ] || [];

  for (const methodName of directMethods) {
    const result =
      callDirectMethod(
        provider,
        methodName,
        message,
        payload
      );

    if (
      result !== null &&
      result !== undefined
    ) {
      rememberActiveToast(
        logicalId,
        result
      );

      return result;
    }
  }

  const result =
    dispatchWithShowLike(
      provider,
      normalizedType,
      message,
      payload
    );

  rememberActiveToast(
    logicalId,
    result
  );

  return result;
}

/* =========================================================
   PUBLIC FACTORY
========================================================= */

export function createToastBridge(
  customProvider = null
) {
  function getProvider() {
    return resolveToastProvider(
      customProvider
    );
  }

  return {
    get provider() {
      return getProvider();
    },

    resolve() {
      return getProvider();
    },

    exists() {
      return Boolean(
        getProvider()
      );
    },

    ready() {
      return Boolean(
        getProvider()
      );
    },

    init(...args) {
      const provider =
        getProvider();

      if (!provider) {
        return null;
      }

      if (
        !isFunction(
          provider?.init
        )
      ) {
        return null;
      }

      return tryCall(
        provider.init.bind(
          provider
        ),
        ...args
      );
    },

    success(
      message,
      options = {}
    ) {
      return dispatch(
        getProvider(),
        "success",
        message,
        options
      );
    },

    error(
      message,
      options = {}
    ) {
      return dispatch(
        getProvider(),
        "error",
        message,
        options
      );
    },

    info(
      message,
      options = {}
    ) {
      return dispatch(
        getProvider(),
        "info",
        message,
        options
      );
    },

    warning(
      message,
      options = {}
    ) {
      return dispatch(
        getProvider(),
        "warning",
        message,
        options
      );
    },

    warn(
      message,
      options = {}
    ) {
      return dispatch(
        getProvider(),
        "warning",
        message,
        options
      );
    },

    loading(
      message,
      options = {}
    ) {
      return dispatch(
        getProvider(),
        "loading",
        message,
        {
          persist: true,
          ...safeOptions(
            options
          ),
        }
      );
    },

    show(
      message,
      options = {}
    ) {
      const payload =
        safeOptions(options);

      const type =
        normalizeType(
          payload.type ||
          "info"
        );

      return dispatch(
        getProvider(),
        type,
        message,
        payload
      );
    },

    dismiss(
      toastId = null
    ) {
      return dismissToast(
        getProvider(),
        toastId
      );
    },

    clear() {
      return dismissToast(
        getProvider(),
        null
      );
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const ToastBridge = {
  of(
    customProvider = null
  ) {
    return createToastBridge(
      customProvider
    );
  },

  create(
    customProvider = null
  ) {
    return createToastBridge(
      customProvider
    );
  },

  resolve(
    customProvider = null
  ) {
    return resolveToastProvider(
      customProvider
    );
  },

  exists(
    customProvider = null
  ) {
    return Boolean(
      resolveToastProvider(
        customProvider
      )
    );
  },

  dismiss(id = null) {
    return createToastBridge()
      .dismiss(id);
  },

  clear() {
    return createToastBridge()
      .clear();
  },
};

export default ToastBridge;
