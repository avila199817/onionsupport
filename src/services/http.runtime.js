/* =========================================================
   Onion SPA - HTTP Runtime
   Archivo: src/services/http.runtime.js

   Runtime HTTP fino:
   - pending counter seguro
   - delay cancelable
   - AbortController helpers
   - eventos internos opt-in
   - snapshot sin secretos
   - sin cliente HTTP paralelo
========================================================= */

export const HTTP_RUNTIME_VERSION = "16.0.0-clean";

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

const state = {
  delaySeq: 0,
  controllerSeq: 0,

  delays: new Map(),
  controllers: new Map(),

  pendingChanges: 0,
  pendingEmits: 0,
  pendingSilentChanges: 0,

  abortControllersCreated: 0,
  abortControllersAborted: 0,

  lastPendingAt: "",
  lastPendingSource: "",
  lastPendingRequestId: null,

  lastAbortAt: "",
  lastAbortReason: "",

  lastRuntimeResetAt: "",
};

const controllerIds = new WeakMap();
const countedAborts = new WeakSet();

/* =========================================================
   BASICS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowIso(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function clampMs(value = 0) {
  return Math.max(0, safeNumber(value, 0));
}

function requestIdFrom(meta = {}) {
  return safeText(safeObject(meta).requestId, "") || null;
}

function sourceFrom(meta = {}, fallback = "http.runtime") {
  return safeText(safeObject(meta).source, fallback);
}

/* =========================================================
   REDACTION
========================================================= */

function redactText(value = "") {
  let text = safeText(value, "");

  if (!text) return "";

  try {
    text = text
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|temporaryToken|temporary_token|twoFactorToken|two_factor_token|mfaToken|mfa_token|otpToken|otp_token)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/(?:2fa|otp|mfa)\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return text;
}

function sanitize(value, depth = 0, keyHint = "") {
  if (/token|secret|password|authorization|credential|cookie|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i.test(keyHint)) {
    return value ? "***" : null;
  }

  if (depth > 5) return "[MaxDepth]";

  if (typeof value === "string") return redactText(value);

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) {
    return {
      name: safeText(value.name, "Error"),
      message: redactText(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || null,
      aborted: value.aborted === true,
      timeout: value.timeout === true,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitize(item, depth + 1, keyHint));
  }

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitize(item, depth + 1, key);
    }

    return output;
  }

  return redactText(String(value));
}

/* =========================================================
   EVENTS
========================================================= */

function diagnosticsEnabled(AppCore, meta = {}) {
  const options = safeObject(meta);

  if (options.emitEvents === false) return false;

  if (
    options.emitRuntimeEvents === true ||
    options.emitHttpRuntimeEvents === true ||
    options.debugRuntimeEvents === true
  ) {
    return true;
  }

  try {
    const diagnostics = AppCore?.config?.diagnostics || {};

    return Boolean(
      diagnostics.httpRuntimeEvents === true ||
        diagnostics.httpLifecycleEvents === true ||
        AppCore?.config?.debugHttpRuntime === true
    );
  } catch {
    return false;
  }
}

function emit(AppCore, eventName = "", payload = {}, meta = {}) {
  const name = safeText(eventName, "");

  if (!name || !diagnosticsEnabled(AppCore, meta)) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(name, sanitize(payload));
    return true;
  } catch {
    return false;
  }
}

function warn(AppCore, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.warn?.("[HTTP Runtime]", ...clean);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug === true || AppCore?.config?.debugHttpRuntime === true) {
      console.warn("[HTTP Runtime]", ...clean);
    }
  } catch {}
}

/* =========================================================
   SLEEP / DELAY
========================================================= */

export function sleep(AppCore, ms = 0) {
  const wait = clampMs(ms);

  try {
    if (isFn(AppCore?.utils?.sleep)) {
      return AppCore.utils.sleep(wait);
    }
  } catch {}

  return new Promise((resolve) => {
    try {
      setTimeout(resolve, wait);
    } catch {
      resolve();
    }
  });
}

export function isAbortSignal(signal = null) {
  return Boolean(
    signal &&
      typeof signal === "object" &&
      "aborted" in signal &&
      isFn(signal.addEventListener)
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
  const name = safeText(error?.name, "").toLowerCase();
  const code = safeText(error?.code, "").toLowerCase();
  const message = safeText(error?.message, "").toLowerCase();

  return Boolean(
    error?.aborted === true ||
      name === "aborterror" ||
      code === "abort_err" ||
      code === "20" ||
      message.includes("abort") ||
      message.includes("aborted")
  );
}

export function createAbortError(signal = null, message = "Aborted") {
  const reason = getSignalReason(signal);

  if (reason instanceof Error) {
    try {
      reason.aborted = true;
    } catch {}
    return reason;
  }

  const finalMessage = safeText(reason?.message || reason, message);

  try {
    if (typeof DOMException !== "undefined") {
      const error = new DOMException(finalMessage, "AbortError");

      try {
        error.aborted = true;
      } catch {}

      return error;
    }
  } catch {}

  const error = new Error(finalMessage);
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  error.aborted = true;

  return error;
}

function addAbortListener(signal, handler) {
  if (!isAbortSignal(signal) || !isFn(handler)) {
    return () => {};
  }

  try {
    signal.addEventListener("abort", handler, { once: true });

    return () => {
      try {
        signal.removeEventListener("abort", handler);
      } catch {}
    };
  } catch {
    return () => {};
  }
}

function createDelayId(meta = {}) {
  state.delaySeq += 1;

  const requestId = requestIdFrom(meta);

  return requestId
    ? `delay_${requestId}_${state.delaySeq}`
    : `delay_${state.delaySeq}`;
}

export function delay(AppCore, ms = 0, signal = null, meta = {}) {
  const wait = clampMs(ms);
  const options = safeObject(meta);

  const delayId = createDelayId(options);
  const requestId = requestIdFrom(options);
  const source = sourceFrom(options, "http.runtime:delay");
  const startedAt = nowMs();

  let settled = false;
  let timer = null;
  let removeAbort = () => {};
  let rejectRef = null;

  const base = {
    delayId,
    requestId,
    source,
    ms: wait,
  };

  function finish(type = "end", extra = {}) {
    state.delays.delete(delayId);

    emit(
      AppCore,
      type === "abort"
        ? HTTP_RUNTIME_EVENTS.delayAbort
        : type === "cancel"
          ? HTTP_RUNTIME_EVENTS.delayCancel
          : HTTP_RUNTIME_EVENTS.delayEnd,
      {
        ...base,
        elapsedMs: Math.max(0, nowMs() - startedAt),
        at: nowIso(),
        ...safeObject(extra),
      },
      options
    );
  }

  function cleanup() {
    try {
      removeAbort();
    } catch {}

    try {
      if (timer) clearTimeout(timer);
    } catch {}

    timer = null;
  }

  function cancel(reason = "delay-cancelled") {
    if (settled) return false;

    settled = true;
    cleanup();

    const error = createAbortError(
      { aborted: true, reason },
      reason
    );

    finish("cancel", {
      cancelled: true,
      reason,
      error,
    });

    try {
      rejectRef?.(error);
    } catch {}

    return true;
  }

  state.delays.set(delayId, {
    ...base,
    startedAt,
    startedAtIso: nowIso(startedAt),
    cancel,
  });

  emit(
    AppCore,
    HTTP_RUNTIME_EVENTS.delayStart,
    {
      ...base,
      at: nowIso(startedAt),
    },
    options
  );

  if (isSignalAborted(signal)) {
    const error = createAbortError(signal, "Delay aborted before start");

    finish("abort", {
      aborted: true,
      error,
    });

    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    rejectRef = reject;

    if (isAbortSignal(signal)) {
      removeAbort = addAbortListener(signal, () => {
        if (settled) return;

        settled = true;
        cleanup();

        const error = createAbortError(signal, "Delay aborted");

        finish("abort", {
          aborted: true,
          error,
        });

        reject(error);
      });
    }

    try {
      timer = setTimeout(() => {
        if (settled) return;

        settled = true;
        cleanup();
        finish("end");
        resolve(true);
      }, wait);
    } catch (error) {
      settled = true;
      cleanup();
      finish("abort", { error });
      reject(error);
    }
  });
}

export function cancelDelay(delayId = "", reason = "delay-cancelled") {
  const id = safeText(delayId, "");

  if (!id) return false;

  const record = state.delays.get(id);

  if (!record || !isFn(record.cancel)) {
    return false;
  }

  try {
    return Boolean(record.cancel(reason));
  } catch {
    return false;
  }
}

export function cancelActiveDelays(reason = "runtime-cancel-delays") {
  let cancelled = 0;

  for (const id of Array.from(state.delays.keys())) {
    if (cancelDelay(id, reason)) {
      cancelled += 1;
    }
  }

  return cancelled;
}

/* =========================================================
   PENDING
========================================================= */

function ensurePending(targetState) {
  if (!targetState || typeof targetState !== "object") {
    return { pendingRequests: 0 };
  }

  targetState.pendingRequests = Math.max(0, safeNumber(targetState.pendingRequests, 0));

  return targetState;
}

function setPending(AppCore, targetState, next, meta = {}, previous = null) {
  const options = safeObject(meta);
  const root = ensurePending(targetState);

  const before = previous === null
    ? Math.max(0, safeNumber(root.pendingRequests, 0))
    : Math.max(0, safeNumber(previous, 0));

  root.pendingRequests = Math.max(0, safeNumber(next, 0));

  const payload = {
    pending: root.pendingRequests,
    previous: before,
    source: sourceFrom(options, "http.runtime:pending"),
    requestId: requestIdFrom(options),
    underflowPrevented: Boolean(options.underflowPrevented),
    changeCount: state.pendingChanges + 1,
    at: nowIso(),
  };

  state.pendingChanges += 1;
  state.lastPendingAt = payload.at;
  state.lastPendingSource = payload.source;
  state.lastPendingRequestId = payload.requestId;

  if (emit(AppCore, HTTP_RUNTIME_EVENTS.pendingChange, payload, options)) {
    state.pendingEmits += 1;
  } else {
    state.pendingSilentChanges += 1;
  }

  return root.pendingRequests;
}

export function incrementPendingRequests(AppCore, targetState, meta = {}) {
  const root = ensurePending(targetState);
  const previous = root.pendingRequests;

  return setPending(
    AppCore,
    root,
    previous + 1,
    {
      ...safeObject(meta),
      source: meta?.source || "http.runtime:increment",
      underflowPrevented: false,
    },
    previous
  );
}

export function decrementPendingRequests(AppCore, targetState, meta = {}) {
  const root = ensurePending(targetState);
  const previous = root.pendingRequests;

  return setPending(
    AppCore,
    root,
    Math.max(0, previous - 1),
    {
      ...safeObject(meta),
      source: meta?.source || "http.runtime:decrement",
      underflowPrevented: previous === 0,
    },
    previous
  );
}

export function resetPendingRequests(AppCore, targetState, meta = {}) {
  const root = ensurePending(targetState);
  const previous = root.pendingRequests;

  return setPending(
    AppCore,
    root,
    0,
    {
      ...safeObject(meta),
      source: meta?.source || "http.runtime:reset",
      underflowPrevented: false,
    },
    previous
  );
}

/* =========================================================
   ABORT CONTROLLERS
========================================================= */

function getControllerId(controller, meta = {}) {
  if (!controller) return "";

  try {
    if (!controllerIds.has(controller)) {
      state.controllerSeq += 1;

      const requestId = requestIdFrom(meta);

      controllerIds.set(
        controller,
        requestId
          ? `abort_${requestId}_${state.controllerSeq}`
          : `abort_${state.controllerSeq}`
      );
    }

    return controllerIds.get(controller);
  } catch {
    state.controllerSeq += 1;
    return `abort_${state.controllerSeq}`;
  }
}

function markAborted(controller, reason = "aborted", AppCore = null, meta = {}) {
  if (!controller) return false;

  try {
    if (countedAborts.has(controller)) return false;
    countedAborts.add(controller);
  } catch {}

  const id = getControllerId(controller, meta);
  const cleanReason = redactText(reason);

  state.abortControllersAborted += 1;
  state.lastAbortAt = nowIso();
  state.lastAbortReason = cleanReason;
  state.controllers.delete(id);

  emit(
    AppCore,
    HTTP_RUNTIME_EVENTS.abort,
    {
      controllerId: id,
      reason: cleanReason,
      at: state.lastAbortAt,
    },
    meta
  );

  return true;
}

function wrapAbort(controller, meta = {}) {
  if (!controller || !isFn(controller.abort) || controller.__onionAbortWrapped) {
    return controller;
  }

  const originalAbort = controller.abort.bind(controller);
  const AppCore = meta.AppCore || meta.core || null;

  try {
    controller.abort = function onionAbort(reason = "aborted") {
      const cleanReason = safeText(reason, "aborted");
      let result;

      try {
        result = originalAbort(cleanReason);
      } catch {
        result = originalAbort();
      } finally {
        markAborted(controller, cleanReason, AppCore, meta);
      }

      return result;
    };

    controller.__onionAbortWrapped = true;
  } catch {}

  return controller;
}

export function createAbortController(metaOrReason = "") {
  const meta = isObject(metaOrReason)
    ? metaOrReason
    : { reason: safeText(metaOrReason, "") };

  if (typeof AbortController === "undefined") {
    return {
      signal: null,
      supported: false,
      reason: safeText(meta.reason, ""),
      abort() {
        return false;
      },
    };
  }

  const controller = wrapAbort(new AbortController(), meta);
  const id = getControllerId(controller, meta);

  state.abortControllersCreated += 1;

  state.controllers.set(id, {
    controllerId: id,
    requestId: requestIdFrom(meta),
    source: sourceFrom(meta, "http.runtime:createAbortController"),
    reason: redactText(meta.reason || ""),
    createdAt: nowIso(),
  });

  emit(
    meta.AppCore || meta.core || null,
    HTTP_RUNTIME_EVENTS.abortCreated,
    {
      controllerId: id,
      requestId: requestIdFrom(meta),
      source: sourceFrom(meta, "http.runtime:createAbortController"),
      at: nowIso(),
    },
    meta
  );

  return controller;
}

export function abortController(controller, reason = "aborted", AppCore = null) {
  if (!controller || !isFn(controller.abort)) {
    return false;
  }

  const cleanReason = safeText(reason, "aborted");

  try {
    controller.abort(cleanReason);
    markAborted(controller, cleanReason, AppCore);
    return true;
  } catch {
    try {
      controller.abort();
      markAborted(controller, cleanReason, AppCore);
      return true;
    } catch {
      return false;
    }
  }
}

export function mergeAbortSignals(signals = []) {
  const valid = Array.isArray(signals)
    ? signals.filter(isAbortSignal)
    : [];

  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];

  try {
    if (typeof AbortSignal !== "undefined" && isFn(AbortSignal.any)) {
      return AbortSignal.any(valid);
    }
  } catch {}

  const controller = createAbortController({
    source: "http.runtime:mergeAbortSignals",
  });

  if (!controller?.signal) {
    return valid[0] || null;
  }

  const cleanups = [];

  function cleanup() {
    while (cleanups.length) {
      try {
        cleanups.pop()?.();
      } catch {}
    }
  }

  function abortFrom(signal) {
    if (controller.signal.aborted) return;

    try {
      controller.abort(getSignalReason(signal) || "merged-signal-aborted");
    } catch {
      try {
        controller.abort();
      } catch {}
    } finally {
      cleanup();
    }
  }

  for (const signal of valid) {
    if (isSignalAborted(signal)) {
      abortFrom(signal);
      break;
    }

    cleanups.push(addAbortListener(signal, () => abortFrom(signal)));
  }

  return controller.signal;
}

/* =========================================================
   SNAPSHOT / RESET
========================================================= */

export function getHttpRuntimeSnapshot(targetState = null) {
  const pending = Math.max(0, safeNumber(targetState?.pendingRequests, 0));
  const stamp = nowMs();

  return sanitize({
    version: HTTP_RUNTIME_VERSION,

    pendingRequests: pending,

    activeDelayCount: state.delays.size,
    activeDelays: Array.from(state.delays.values()).map((item) => ({
      delayId: item.delayId,
      requestId: item.requestId,
      source: item.source,
      ms: item.ms,
      startedAtIso: item.startedAtIso,
      elapsedMs: Math.max(0, stamp - safeNumber(item.startedAt, stamp)),
    })),

    activeControllerCount: state.controllers.size,
    activeControllers: Array.from(state.controllers.values()),

    delaySeq: state.delaySeq,
    controllerSeq: state.controllerSeq,

    pendingChanges: state.pendingChanges,
    pendingEmits: state.pendingEmits,
    pendingSilentChanges: state.pendingSilentChanges,

    lastPendingAt: state.lastPendingAt,
    lastPendingSource: state.lastPendingSource,
    lastPendingRequestId: state.lastPendingRequestId,

    abortControllersCreated: state.abortControllersCreated,
    abortControllersAborted: state.abortControllersAborted,

    lastAbortAt: state.lastAbortAt,
    lastAbortReason: state.lastAbortReason,

    lastRuntimeResetAt: state.lastRuntimeResetAt,

    at: nowIso(),
  });
}

export function resetHttpRuntime(AppCore = null, targetState = null, meta = {}) {
  const options = safeObject(meta);

  cancelActiveDelays("http-runtime-reset");

  state.delays.clear();
  state.controllers.clear();

  state.delaySeq = 0;
  state.controllerSeq = 0;

  state.pendingChanges = 0;
  state.pendingEmits = 0;
  state.pendingSilentChanges = 0;

  state.lastPendingAt = "";
  state.lastPendingSource = "";
  state.lastPendingRequestId = null;

  state.abortControllersCreated = 0;
  state.abortControllersAborted = 0;
  state.lastAbortAt = "";
  state.lastAbortReason = "";

  state.lastRuntimeResetAt = nowIso();

  if (targetState && typeof targetState === "object") {
    resetPendingRequests(AppCore, targetState, {
      ...options,
      source: options.source || "http.runtime:runtime-reset",
    });
  }

  emit(
    AppCore,
    HTTP_RUNTIME_EVENTS.runtimeReset,
    {
      at: state.lastRuntimeResetAt,
      source: options.source || "http.runtime:reset",
    },
    options
  );

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
