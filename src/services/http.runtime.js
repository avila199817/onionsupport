/* =========================================================
   Onion Support - HTTP Runtime
   Archivo: /src/services/http.runtime.js

   Responsabilidad:
   - Runtime mínimo de compat para Services.
   - Pending counter.
   - sleep / delay cancelable.
   - AbortController helpers.
   - Reset y snapshot sin secretos.
   - Sin cliente HTTP.
   - Sin Auth.
   - Sin Router.
   - Sin Toast.
   - Sin loader.
   - Sin storage.
   - Sin eventos runtime.
   - Sin magia negra.
========================================================= */

export const HTTP_RUNTIME_VERSION = "simple";

export const HTTP_RUNTIME_EVENTS = Object.freeze({
  delayStart: "http:delay:start",
  delayEnd: "http:delay:end",
  delayAbort: "http:delay:abort",
  delayCancel: "http:delay:cancel",
  pendingChange: "http:pending:change",
  abortCreated: "http:abort-controller:created",
  abort: "http:abort-controller:abort",
  runtimeReset: "http:runtime:reset",
});

const fallbackState = {
  pendingRequests: 0,
};

const runtime = {
  delaySeq: 0,
  controllerSeq: 0,

  pendingChanges: 0,

  abortControllersCreated: 0,
  abortControllersAborted: 0,

  lastPendingAt: "",
  lastPendingSource: "",
  lastPendingRequestId: null,

  lastAbortAt: "",
  lastAbortReason: "",

  lastRuntimeResetAt: "",
};

const delays = new Map();
const controllers = new Map();
const controllerIds = new WeakMap();
const countedAborts = new WeakSet();

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function nowMs() {
  return Date.now();
}

function nowIso(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function clampMs(value = 0) {
  return Math.max(0, number(value, 0));
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function requestIdFrom(meta = {}) {
  return text(isObject(meta) ? meta.requestId : "", "") || null;
}

function sourceFrom(meta = {}, fallback = "http.runtime") {
  return text(isObject(meta) ? meta.source : "", fallback);
}

/* =========================================================
   ABORT BASICS
========================================================= */

export function isAbortSignal(signal = null) {
  return Boolean(
    signal &&
      typeof signal === "object" &&
      "aborted" in signal &&
      isFunction(signal.addEventListener)
  );
}

export function isSignalAborted(signal = null) {
  try {
    return Boolean(signal?.aborted);
  } catch {
    return false;
  }
}

export function getSignalReason(signal = null) {
  try {
    return signal?.reason || null;
  } catch {
    return null;
  }
}

export function isAbortError(error = null) {
  const name = text(error?.name, "").toLowerCase();
  const code = text(error?.code, "").toLowerCase();
  const message = text(error?.message, "").toLowerCase();

  return Boolean(
    error?.aborted === true ||
      name === "aborterror" ||
      code === "abort_err" ||
      message.includes("abort")
  );
}

export function createAbortError(signal = null, message = "Aborted") {
  const reason = getSignalReason(signal);
  const finalMessage = text(reason?.message || reason, message);

  try {
    if (typeof DOMException !== "undefined") {
      const error = new DOMException(finalMessage, "AbortError");

      try {
        error.aborted = true;
      } catch {
        // noop
      }

      return error;
    }
  } catch {
    // fallback abajo
  }

  const error = new Error(finalMessage);

  error.name = "AbortError";
  error.code = "ABORT_ERR";
  error.aborted = true;

  return error;
}

function addAbortListener(signal = null, handler = null) {
  if (!isAbortSignal(signal) || !isFunction(handler)) return () => false;

  try {
    signal.addEventListener("abort", handler, { once: true });

    return () => {
      try {
        signal.removeEventListener("abort", handler);
        return true;
      } catch {
        return false;
      }
    };
  } catch {
    return () => false;
  }
}

/* =========================================================
   SLEEP / DELAY
========================================================= */

function parseSleepArgs(arg1, arg2) {
  if (typeof arg1 === "number" || typeof arg1 === "string") {
    return {
      ms: arg1,
    };
  }

  return {
    ms: arg2,
  };
}

export function sleep(arg1, arg2 = 0) {
  const { ms } = parseSleepArgs(arg1, arg2);
  const wait = clampMs(ms);

  return new Promise((resolve) => {
    try {
      setTimeout(resolve, wait);
    } catch {
      resolve();
    }
  });
}

function parseDelayArgs(arg1, arg2, arg3, arg4) {
  if (typeof arg1 === "number" || typeof arg1 === "string") {
    return {
      ms: arg1,
      signal: isAbortSignal(arg2) ? arg2 : null,
      meta: isAbortSignal(arg2) ? (isObject(arg3) ? arg3 : {}) : (isObject(arg2) ? arg2 : {}),
    };
  }

  return {
    ms: arg2,
    signal: isAbortSignal(arg3) ? arg3 : null,
    meta: isObject(arg4) ? arg4 : {},
  };
}

function createDelayId(meta = {}) {
  runtime.delaySeq += 1;

  const requestId = requestIdFrom(meta);

  return requestId
    ? `delay_${requestId}_${runtime.delaySeq}`
    : `delay_${runtime.delaySeq}`;
}

export function delay(arg1, arg2 = 0, arg3 = null, arg4 = {}) {
  const parsed = parseDelayArgs(arg1, arg2, arg3, arg4);
  const wait = clampMs(parsed.ms);
  const signal = parsed.signal;
  const meta = parsed.meta;

  const delayId = createDelayId(meta);
  const requestId = requestIdFrom(meta);
  const source = sourceFrom(meta, "http.runtime:delay");
  const startedAt = nowMs();

  let settled = false;
  let timer = null;
  let removeAbortListener = () => false;
  let rejectRef = null;

  function cleanup() {
    try {
      removeAbortListener();
    } catch {
      // noop
    }

    try {
      if (timer) clearTimeout(timer);
    } catch {
      // noop
    }

    timer = null;
    delays.delete(delayId);
  }

  function cancel(reason = "delay-cancelled") {
    if (settled) return false;

    settled = true;
    cleanup();

    const error = createAbortError(
      {
        aborted: true,
        reason,
      },
      reason
    );

    try {
      rejectRef?.(error);
    } catch {
      // noop
    }

    return true;
  }

  if (isSignalAborted(signal)) {
    return Promise.reject(createAbortError(signal, "Delay aborted"));
  }

  const promise = new Promise((resolve, reject) => {
    rejectRef = reject;

    delays.set(delayId, {
      delayId,
      requestId,
      source,
      ms: wait,
      startedAt,
      startedAtIso: nowIso(startedAt),
      cancel,
    });

    if (isAbortSignal(signal)) {
      removeAbortListener = addAbortListener(signal, () => {
        if (settled) return;

        settled = true;
        cleanup();
        reject(createAbortError(signal, "Delay aborted"));
      });
    }

    try {
      timer = setTimeout(() => {
        if (settled) return;

        settled = true;
        cleanup();
        resolve(true);
      }, wait);
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });

  try {
    Object.defineProperty(promise, "delayId", {
      value: delayId,
      enumerable: false,
      configurable: true,
    });

    Object.defineProperty(promise, "cancel", {
      value: cancel,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // noop
  }

  return promise;
}

export function cancelDelay(delayId = "", reason = "delay-cancelled") {
  const id = text(delayId, "");

  if (!id) return false;

  const record = delays.get(id);

  if (!record || !isFunction(record.cancel)) return false;

  try {
    return Boolean(record.cancel(reason));
  } catch {
    return false;
  }
}

export function cancelActiveDelays(reason = "runtime-cancel-delays") {
  let count = 0;

  for (const id of [...delays.keys()]) {
    if (cancelDelay(id, reason)) count += 1;
  }

  return count;
}

/* =========================================================
   PENDING
========================================================= */

function resolveState(AppCore = null, targetState = null) {
  if (isObject(targetState)) return targetState;
  if (isObject(AppCore?.state)) return AppCore.state;
  if (isObject(AppCore) && "pendingRequests" in AppCore) return AppCore;

  return fallbackState;
}

function ensurePending(state = fallbackState) {
  if (!isObject(state)) return fallbackState;

  state.pendingRequests = Math.max(0, number(state.pendingRequests, 0));

  return state;
}

function setPending(AppCore = null, targetState = null, next = 0, meta = {}) {
  const state = ensurePending(resolveState(AppCore, targetState));
  const previous = state.pendingRequests;

  state.pendingRequests = Math.max(0, number(next, 0));

  runtime.pendingChanges += 1;
  runtime.lastPendingAt = nowIso();
  runtime.lastPendingSource = sourceFrom(meta, "http.runtime:pending");
  runtime.lastPendingRequestId = requestIdFrom(meta);

  return {
    pending: state.pendingRequests,
    previous,
  };
}

export function incrementPendingRequests(AppCore = null, targetState = null, meta = {}) {
  const state = ensurePending(resolveState(AppCore, targetState));

  return setPending(AppCore, state, state.pendingRequests + 1, {
    ...meta,
    source: meta?.source || "http.runtime:increment",
  }).pending;
}

export function decrementPendingRequests(AppCore = null, targetState = null, meta = {}) {
  const state = ensurePending(resolveState(AppCore, targetState));

  return setPending(AppCore, state, Math.max(0, state.pendingRequests - 1), {
    ...meta,
    source: meta?.source || "http.runtime:decrement",
  }).pending;
}

export function resetPendingRequests(AppCore = null, targetState = null, meta = {}) {
  return setPending(AppCore, targetState, 0, {
    ...meta,
    source: meta?.source || "http.runtime:reset",
  }).pending;
}

/* =========================================================
   ABORT CONTROLLERS
========================================================= */

function nextControllerId(meta = {}) {
  runtime.controllerSeq += 1;

  const requestId = requestIdFrom(meta);

  return requestId
    ? `abort_${requestId}_${runtime.controllerSeq}`
    : `abort_${runtime.controllerSeq}`;
}

function getControllerId(controller = null, meta = {}) {
  if (!controller) return "";

  try {
    if (!controllerIds.has(controller)) {
      controllerIds.set(controller, nextControllerId(meta));
    }

    return controllerIds.get(controller);
  } catch {
    return nextControllerId(meta);
  }
}

function markAborted(controller = null, reason = "aborted") {
  if (!controller) return false;

  try {
    if (countedAborts.has(controller)) return false;
    countedAborts.add(controller);
  } catch {
    // noop
  }

  const id = getControllerId(controller);

  runtime.abortControllersAborted += 1;
  runtime.lastAbortAt = nowIso();
  runtime.lastAbortReason = redact(reason);
  controllers.delete(id);

  return true;
}

export function createAbortController(metaOrReason = "") {
  const meta = isObject(metaOrReason)
    ? metaOrReason
    : {
        reason: text(metaOrReason, ""),
      };

  if (typeof AbortController === "undefined") {
    return {
      signal: null,
      supported: false,
      abort() {
        return false;
      },
    };
  }

  const controller = new AbortController();
  const id = getControllerId(controller, meta);

  runtime.abortControllersCreated += 1;

  controllers.set(id, {
    controllerId: id,
    requestId: requestIdFrom(meta),
    source: sourceFrom(meta, "http.runtime:createAbortController"),
    reason: redact(meta.reason || ""),
    createdAt: nowIso(),
  });

  addAbortListener(controller.signal, () => {
    markAborted(controller, getSignalReason(controller.signal) || meta.reason || "aborted");
  });

  return controller;
}

export function abortController(controller = null, reason = "aborted") {
  if (!controller || !isFunction(controller.abort)) return false;

  try {
    controller.abort(reason);
    markAborted(controller, reason);
    return true;
  } catch {
    try {
      controller.abort();
      markAborted(controller, reason);
      return true;
    } catch {
      return false;
    }
  }
}

export function mergeAbortSignals(signals = []) {
  const valid = Array.isArray(signals)
    ? signals.filter(isAbortSignal)
    : [signals].filter(isAbortSignal);

  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];

  try {
    if (typeof AbortSignal !== "undefined" && isFunction(AbortSignal.any)) {
      return AbortSignal.any(valid);
    }
  } catch {
    // fallback abajo
  }

  const controller = createAbortController({
    source: "http.runtime:mergeAbortSignals",
  });

  if (!controller?.signal) return valid[0] || null;

  for (const signal of valid) {
    if (isSignalAborted(signal)) {
      abortController(controller, getSignalReason(signal) || "merged-signal-aborted");
      break;
    }

    addAbortListener(signal, () => {
      abortController(controller, getSignalReason(signal) || "merged-signal-aborted");
    });
  }

  return controller.signal;
}

/* =========================================================
   SNAPSHOT / RESET
========================================================= */

export function getHttpRuntimeSnapshot(targetState = null) {
  const state = ensurePending(resolveState(null, targetState));
  const stamp = nowMs();

  return {
    version: HTTP_RUNTIME_VERSION,

    pendingRequests: state.pendingRequests,

    activeDelayCount: delays.size,
    activeDelays: [...delays.values()].map((item) => ({
      delayId: redact(item.delayId),
      requestId: redact(item.requestId || ""),
      source: item.source,
      ms: item.ms,
      startedAtIso: item.startedAtIso,
      elapsedMs: Math.max(0, stamp - number(item.startedAt, stamp)),
    })),

    activeControllerCount: controllers.size,
    activeControllers: [...controllers.values()].map((item) => ({
      controllerId: redact(item.controllerId),
      requestId: redact(item.requestId || ""),
      source: item.source,
      reason: redact(item.reason || ""),
      createdAt: item.createdAt,
    })),

    sequence: {
      delay: runtime.delaySeq,
      controller: runtime.controllerSeq,
    },

    pending: {
      changes: runtime.pendingChanges,
      lastAt: runtime.lastPendingAt,
      lastSource: runtime.lastPendingSource,
      lastRequestId: redact(runtime.lastPendingRequestId || ""),
    },

    abort: {
      created: runtime.abortControllersCreated,
      aborted: runtime.abortControllersAborted,
      lastAt: runtime.lastAbortAt,
      lastReason: redact(runtime.lastAbortReason),
    },

    lastRuntimeResetAt: runtime.lastRuntimeResetAt,

    policy: {
      runtimeOnly: true,
      ownHttpClient: false,
      ownAuth: false,
      ownRouter: false,
      ownToast: false,
      ownLoader: false,
      storage: false,
      events: false,
    },

    at: nowIso(),
  };
}

export function resetHttpRuntime(AppCore = null, targetState = null) {
  cancelActiveDelays("http-runtime-reset");

  delays.clear();
  controllers.clear();

  runtime.delaySeq = 0;
  runtime.controllerSeq = 0;

  runtime.pendingChanges = 0;
  runtime.lastPendingAt = "";
  runtime.lastPendingSource = "";
  runtime.lastPendingRequestId = null;

  runtime.abortControllersCreated = 0;
  runtime.abortControllersAborted = 0;
  runtime.lastAbortAt = "";
  runtime.lastAbortReason = "";

  runtime.lastRuntimeResetAt = nowIso();

  resetPendingRequests(AppCore, targetState, {
    source: "http.runtime:runtime-reset",
  });

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HTTP_RUNTIME_VERSION,
  HTTP_RUNTIME_EVENTS,

  sleep,
  delay,
  cancelDelay,
  cancelActiveDelays,

  incrementPendingRequests,
  decrementPendingRequests,
  resetPendingRequests,

  createAbortController,
  abortController,

  isAbortSignal,
  isSignalAborted,
  getSignalReason,
  isAbortError,
  createAbortError,
  mergeAbortSignals,

  getHttpRuntimeSnapshot,
  resetHttpRuntime,
};
