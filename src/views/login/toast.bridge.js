/* =========================================================
   Onion SPA - Toast Bridge
   Archivo: src/views/login/toast.bridge.js

   Toast bridge limpio:
   - API uniforme para vistas
   - compatible AppCore.showToast / services.toast / módulos / global
   - dedupe anti-spam
   - dismiss individual/global
   - sin DOM propio
   - sin dependencia de provider concreto
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const TOAST_BRIDGE_VERSION = "17.0.0-clean";

const SOURCE = "toast.bridge";

const DEFAULT_DEDUPE_MS = 1200;
const DEFAULT_DURATION_MS = 4500;

const ACTIVE_TOASTS = new Map();
const LAST_EMITTED = new Map();

const TYPE_ALIASES = Object.freeze({
  danger: "error",
  fail: "error",
  failed: "error",

  warn: "warning",
  alert: "warning",

  ok: "success",
  done: "success",

  pending: "loading",
  progress: "loading",
});

const PROVIDER_METHODS = Object.freeze([
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
  "toast",
  "dismiss",
  "dismissAll",
  "hide",
  "close",
  "clear",
  "clearAll",
  "remove",
  "removeAll",
]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object");
}

function isFn(value) {
  return typeof value === "function";
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
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

function normalizeType(type = "info") {
  const key = safeText(type, "info").toLowerCase();
  return TYPE_ALIASES[key] || key || "info";
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[ToastBridge]", ...args);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn("[ToastBridge]", ...args);
  } catch {}
}

function safeCall(fn, thisArg = null, ...args) {
  if (!isFn(fn)) return null;

  try {
    return fn.apply(thisArg, args);
  } catch (error) {
    safeWarn("provider call failed", error);
    return null;
  }
}

/* =========================================================
   PROVIDER RESOLUTION
========================================================= */

function hasToastShape(candidate) {
  if (!candidate) return false;

  if (isFn(candidate)) return true;

  if (!isObject(candidate)) return false;

  return PROVIDER_METHODS.some((key) => isFn(candidate[key]));
}

function moduleCandidate(name = "") {
  try {
    return AppCore?.modules?.get?.(name) || null;
  } catch {
    return null;
  }
}

function globalCandidate(name = "") {
  try {
    return globalThis?.[name] || null;
  } catch {
    return null;
  }
}

export function resolveToastProvider(customProvider = null) {
  const candidates = [
    customProvider,

    AppCore?.showToast,
    AppCore?.toast,
    AppCore?.Toast,

    AppCore?.services?.toast,
    AppCore?.services?.Toast,
    AppCore?.services?.uiToast,

    AppCore?.ui?.toast,
    AppCore?.ui?.Toast,

    moduleCandidate("Toast"),
    moduleCandidate("toast"),
    moduleCandidate("ToastUI"),
    moduleCandidate("toastUI"),
    moduleCandidate("UiToast"),
    moduleCandidate("uiToast"),

    globalCandidate("OnionToast"),
    globalCandidate("Toast"),
    globalCandidate("toast"),
    globalCandidate("ToastUI"),
    globalCandidate("uiToast"),
  ];

  return candidates.find(hasToastShape) || null;
}

/* =========================================================
   PAYLOAD / DEDUPE
========================================================= */

function normalizeId(type, message, options = {}) {
  const opts = safeObject(options);

  return safeText(
    opts.id ||
      opts.toastId ||
      opts.key ||
      `${normalizeType(type)}:${safeText(message, "")}`,
    ""
  );
}

function buildPayload(type = "info", message = "", options = {}) {
  const opts = safeObject(options);
  const finalType = normalizeType(opts.type || type);
  const finalMessage = safeText(message || opts.message, "");

  return {
    duration: DEFAULT_DURATION_MS,
    ...opts,

    id: normalizeId(finalType, finalMessage, opts),
    type: finalType,
    message: finalMessage,

    source: opts.source || SOURCE,
  };
}

function getDedupeMs(options = {}) {
  const opts = safeObject(options);
  const ms = Number(opts.dedupeMs ?? opts.cooldownMs ?? DEFAULT_DEDUPE_MS);

  return Number.isFinite(ms) && ms >= 0
    ? ms
    : DEFAULT_DEDUPE_MS;
}

function shouldSkipDuplicate(payload = {}) {
  if (payload.dedupe === false || payload.skipDedupe === true) return false;

  const id = safeText(payload.id, "");
  if (!id) return false;

  const ms = getDedupeMs(payload);
  if (ms <= 0) return false;

  const previous = LAST_EMITTED.get(id) || 0;
  const diff = now() - previous;

  if (diff < ms) return true;

  LAST_EMITTED.set(id, now());
  return false;
}

function rememberToast(logicalId = "", providerId = null) {
  const id = safeText(logicalId, "");
  if (!id) return false;

  ACTIVE_TOASTS.set(id, providerId ?? id);
  return true;
}

function forgetToast(id = "") {
  const key = safeText(id, "");
  if (!key) return false;

  ACTIVE_TOASTS.delete(key);
  return true;
}

function getProviderToastId(id = "") {
  const key = safeText(id, "");
  return ACTIVE_TOASTS.get(key) || key || null;
}

/* =========================================================
   DISMISS
========================================================= */

function callDismissMethod(provider, method, id = null) {
  if (!provider || !isFn(provider?.[method])) return null;

  if (id !== null && id !== undefined && id !== "") {
    return safeCall(provider[method], provider, id);
  }

  return safeCall(provider[method], provider);
}

function dismissToast(provider, toastId = null) {
  if (!provider) return null;

  const hasId = toastId !== null && toastId !== undefined && safeText(toastId, "") !== "";

  if (hasId) {
    const finalId = getProviderToastId(toastId);

    for (const method of ["dismiss", "hide", "close", "remove"]) {
      const result = callDismissMethod(provider, method, finalId);

      if (result !== null && result !== undefined) {
        forgetToast(toastId);
        return result;
      }
    }

    forgetToast(toastId);
    return null;
  }

  for (const method of ["dismissAll", "clear", "clearAll", "removeAll"]) {
    const result = callDismissMethod(provider, method);

    if (result !== null && result !== undefined) {
      ACTIVE_TOASTS.clear();
      return result;
    }
  }

  ACTIVE_TOASTS.clear();
  return null;
}

/* =========================================================
   DISPATCH
========================================================= */

function callDirectProvider(provider, method, payload) {
  if (!provider || !isFn(provider?.[method])) return null;

  const message = payload.message;

  const attempts = [
    () => provider[method](message, payload),
    () => provider[method](payload),
    () => provider[method](message),
  ];

  for (const attempt of attempts) {
    const result = safeCall(attempt, null);

    if (result !== null && result !== undefined) {
      return result;
    }
  }

  return null;
}

function callShowLikeProvider(provider, payload) {
  if (!provider) return null;

  const methods = ["show", "open", "push", "notify", "toast"];

  for (const method of methods) {
    if (!isFn(provider?.[method])) continue;

    const attempts = [
      () => provider[method](payload.message, payload),
      () => provider[method](payload),
      () => provider[method](payload.type, payload.message, payload),
    ];

    for (const attempt of attempts) {
      const result = safeCall(attempt, null);

      if (result !== null && result !== undefined) {
        return result;
      }
    }
  }

  return null;
}

function callFunctionProvider(provider, payload) {
  if (!isFn(provider)) return null;

  const attempts = [
    () => provider(payload.message, payload.type, payload),
    () => provider(payload.message, payload),
    () => provider(payload),
  ];

  for (const attempt of attempts) {
    const result = safeCall(attempt, null);

    if (result !== null && result !== undefined) {
      return result;
    }
  }

  return null;
}

function directMethodsForType(type = "info") {
  switch (normalizeType(type)) {
    case "success":
      return ["success"];

    case "error":
      return ["error", "danger"];

    case "warning":
      return ["warning", "warn"];

    case "loading":
      return ["loading"];

    case "info":
    default:
      return ["info"];
  }
}

function dispatch(provider, type = "info", message = "", options = {}) {
  if (!provider) return null;

  const payload = buildPayload(type, message, options);
  const logicalId = payload.id;

  if (!payload.message && payload.allowEmpty !== true) {
    return null;
  }

  if (shouldSkipDuplicate(payload)) {
    return logicalId;
  }

  if (payload.replace !== false && logicalId) {
    dismissToast(provider, logicalId);
  }

  let result = null;

  if (isFn(provider)) {
    result = callFunctionProvider(provider, payload);
  } else {
    for (const method of directMethodsForType(payload.type)) {
      result = callDirectProvider(provider, method, payload);

      if (result !== null && result !== undefined) {
        break;
      }
    }

    if (result === null || result === undefined) {
      result = callShowLikeProvider(provider, payload);
    }
  }

  if (logicalId) {
    rememberToast(logicalId, result ?? logicalId);
  }

  return result ?? logicalId;
}

/* =========================================================
   FACTORY
========================================================= */

export function createToastBridge(customProvider = null) {
  function provider() {
    return resolveToastProvider(customProvider);
  }

  function send(type, message, options = {}) {
    return dispatch(provider(), type, message, options);
  }

  return {
    version: TOAST_BRIDGE_VERSION,

    get provider() {
      return provider();
    },

    resolve() {
      return provider();
    },

    exists() {
      return Boolean(provider());
    },

    ready() {
      return Boolean(provider());
    },

    init(...args) {
      const current = provider();

      if (!current || !isFn(current.init)) return null;

      return safeCall(current.init, current, ...args);
    },

    success(message, options = {}) {
      return send("success", message, options);
    },

    error(message, options = {}) {
      return send("error", message, options);
    },

    danger(message, options = {}) {
      return send("error", message, options);
    },

    info(message, options = {}) {
      return send("info", message, options);
    },

    warning(message, options = {}) {
      return send("warning", message, options);
    },

    warn(message, options = {}) {
      return send("warning", message, options);
    },

    loading(message, options = {}) {
      return send("loading", message, {
        persist: true,
        duration: 0,
        ...safeObject(options),
      });
    },

    show(message, options = {}) {
      const opts = safeObject(options);
      return send(opts.type || "info", message, opts);
    },

    notify(message, options = {}) {
      return this.show(message, options);
    },

    dismiss(toastId = null) {
      return dismissToast(provider(), toastId);
    },

    clear() {
      return dismissToast(provider(), null);
    },

    getSnapshot() {
      return {
        version: TOAST_BRIDGE_VERSION,
        source: SOURCE,
        hasProvider: Boolean(provider()),
        activeCount: ACTIVE_TOASTS.size,
        lastCount: LAST_EMITTED.size,
        activeIds: Array.from(ACTIVE_TOASTS.keys()),
        at: iso(),
      };
    },

    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };
}

/* =========================================================
   DEFAULT SINGLETON
========================================================= */

const defaultBridge = createToastBridge();

const ToastBridge = {
  version: TOAST_BRIDGE_VERSION,

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

  ready(customProvider = null) {
    return Boolean(resolveToastProvider(customProvider));
  },

  success(message, options = {}) {
    return defaultBridge.success(message, options);
  },

  error(message, options = {}) {
    return defaultBridge.error(message, options);
  },

  danger(message, options = {}) {
    return defaultBridge.error(message, options);
  },

  info(message, options = {}) {
    return defaultBridge.info(message, options);
  },

  warning(message, options = {}) {
    return defaultBridge.warning(message, options);
  },

  warn(message, options = {}) {
    return defaultBridge.warning(message, options);
  },

  loading(message, options = {}) {
    return defaultBridge.loading(message, options);
  },

  show(message, options = {}) {
    return defaultBridge.show(message, options);
  },

  notify(message, options = {}) {
    return defaultBridge.notify(message, options);
  },

  dismiss(id = null) {
    return defaultBridge.dismiss(id);
  },

  clear() {
    return defaultBridge.clear();
  },

  getSnapshot() {
    return defaultBridge.getSnapshot();
  },

  getDebugSnapshot() {
    return defaultBridge.getSnapshot();
  },
};

export default ToastBridge;
