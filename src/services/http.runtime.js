/* =========================================================
   Onion SPA - HTTP Runtime
   Archivo: src/services/http.runtime.js

   HTTP RUNTIME · FINAL SIMPLE
   - Pending counter mínimo
   - delay cancelable
   - AbortController helpers
   - Reset y snapshot sin secretos
   - Sin cliente HTTP, Auth, Router, Toast, loader ni storage
========================================================= */

export const HTTP_RUNTIME_VERSION = "20.0.0-final";

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

const SENSITIVE_KEY_RE = /token|secret|password|authorization|credential|cookie|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const runtime = {
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

const isFn = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
   REDACTION / SANITIZE
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

function sanitize(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (depth > 4) return "[depth-limit]";

  if (typeof value === "string") return redactText(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: safeText(value.name, "Error"),
      message: redactText(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || null,
      aborted: value.aborted === true,
      timeout: value.timeout === true,
      stack: value.stack ? "[stack]" : null,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitize(item, depth + 1, keyHint, seen));
  }

  if (value && typeof value === "object") {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = sanitize(item, depth + 1, key, seen);
    }

    return output;
  }

  return redactText(String(value));
}

/* =========================================================
   EVENTS
========================================================= */

function diagnosticsEnabled(AppCore, meta = {}) {
  const opts = safeObject(meta);

  if (opts.emitEvents === false) return false;
  if (opts.emitRuntimeEvents === true || opts.emitHttpRuntimeEvents === true || opts.debugRuntimeEvents === true) return true;

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
  if (!name || !diagnosticsEnabled(AppCore, meta)) return false;

  try {
    AppCore?.events?.emit?.(name, sanitize({ version: HTTP_RUNTIME_VERSION, ...safeObject(payload) }));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ABORT BASICS
========================================================= */

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
  if (!isAbortSignal(signal) || !isFn(handler)) return () => {};

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

/* =========================================================
   SLEEP / DELAY
========================================================= */

function parseSleepArgs(arg1, arg2) {
  if (typeof arg1 === "number" || typeof arg1 === "string") {
    return { AppCore: null, ms: arg1 };
  }

  return { AppCore: arg1 || null, ms: arg2 };
}

export function sleep(arg1, arg2 = 0) {
  const { AppCore, ms } = parseSleepArgs(arg1, arg2);
  const wait = clampMs(ms);

  try {
    if (isFn(AppCore?.utils?.sleep)) return AppCore.utils.sleep(wait);
  } catch {}

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
      AppCore: null,
      ms: arg1,
      signal: isAbortSignal(arg2) ? arg2 : null,
      meta: isAbortSignal(arg2) ? safeObject(arg3) : safeObject(arg2),
    };
  }

  return {
    AppCore: arg1 || null,
    ms: arg2,
    signal: isAbortSignal(arg3) ? arg3 : null,
    meta: safeObject(arg4),
  };
}

function createDelayId(meta = {}) {
  runtime.delaySeq += 1;
  const requestId = requestIdFrom(meta);
  return requestId ? `delay_${requestId}_${runtime.delaySeq}` : `delay_${runtime.delaySeq}`;
}

export function delay(arg1, arg2 = 0, arg3 = null, arg4 = {}) {
  const parsed = parseDelayArgs(arg1, arg2, arg3, arg4);
  const AppCore = parsed.AppCore;
  const wait = clampMs(parsed.ms);
  const signal = parsed.signal;
  const meta = parsed.meta;

  const delayId = createDelayId(meta);
  const requestId = requestIdFrom(meta);
  const source = sourceFrom(meta, "http.runtime:delay");
  const startedAt = nowMs();

  let settled = false;
  let timer = null;
  let removeAbort = () => {};
  let rejectRef = null;

  const base = { delayId, requestId, source, ms: wait };

  const cleanup = () => {
    try {
      removeAbort();
    } catch {}

    try {
      if (timer) clearTimeout(timer);
    } catch {}

    timer = null;
  };

  const finish = (type = "end", extra = {}) => {
    runtime.delays.delete(delayId);

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
      meta
    );
  };

  const cancel = (reason = "delay-cancelled") => {
    if (settled) return false;

    settled = true;
    cleanup();

    const error = createAbortError({ aborted: true, reason }, reason);

    finish("cancel", { cancelled: true, reason: redactText(reason), error });

    try {
      rejectRef?.(error);
    } catch {}

    return true;
  };

  runtime.delays.set(delayId, {
    ...base,
    startedAt,
    startedAtIso: nowIso(startedAt),
    cancel,
  });

  emit(AppCore, HTTP_RUNTIME_EVENTS.delayStart, { ...base, at: nowIso(startedAt) }, meta);

  if (isSignalAborted(signal)) {
    const error = createAbortError(signal, "Delay aborted before start");
    runtime.delays.delete(delayId);
    finish("abort", { aborted: true, error });
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
        finish("abort", { aborted: true, error });
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

  const record = runtime.delays.get(id);
  if (!record || !isFn(record.cancel)) return false;

  try {
    return Boolean(record.cancel(reason));
  } catch {
    return false;
  }
}

export function cancelActiveDelays(reason = "runtime-cancel-delays") {
  let cancelled = 0;

  for (const id of Array.from(runtime.delays.keys())) {
    if (cancelDelay(id, reason)) cancelled += 1;
  }

  return cancelled;
}

/* =========================================================
   PENDING
========================================================= */

function ensurePending(targetState) {
  if (!targetState || typeof targetState !== "object") return { pendingRequests: 0 };
  targetState.pendingRequests = Math.max(0, safeNumber(targetState.pendingRequests, 0));
  return targetState;
}

function setPending(AppCore, targetState, next, meta = {}, previous = null) {
  const opts = safeObject(meta);
  const root = ensurePending(targetState);
  const before = previous === null
    ? Math.max(0, safeNumber(root.pendingRequests, 0))
    : Math.max(0, safeNumber(previous, 0));

  root.pendingRequests = Math.max(0, safeNumber(next, 0));

  const payload = {
    pending: root.pendingRequests,
    previous: before,
    source: sourceFrom(opts, "http.runtime:pending"),
    requestId: requestIdFrom(opts),
    underflowPrevented: Boolean(opts.underflowPrevented),
    changeCount: runtime.pendingChanges + 1,
    at: nowIso(),
  };

  runtime.pendingChanges += 1;
  runtime.lastPendingAt = payload.at;
  runtime.lastPendingSource = payload.source;
  runtime.lastPendingRequestId = payload.requestId;

  if (emit(AppCore, HTTP_RUNTIME_EVENTS.pendingChange, payload, opts)) {
    runtime.pendingEmits += 1;
  } else {
    runtime.pendingSilentChanges += 1;
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
      runtime.controllerSeq += 1;
      const requestId = requestIdFrom(meta);
      controllerIds.set(controller, requestId ? `abort_${requestId}_${runtime.controllerSeq}` : `abort_${runtime.controllerSeq}`);
    }

    return controllerIds.get(controller);
  } catch {
    runtime.controllerSeq += 1;
    return `abort_${runtime.controllerSeq}`;
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

  runtime.abortControllersAborted += 1;
  runtime.lastAbortAt = nowIso();
  runtime.lastAbortReason = cleanReason;
  runtime.controllers.delete(id);

  emit(AppCore, HTTP_RUNTIME_EVENTS.abort, { controllerId: id, reason: cleanReason, at: runtime.lastAbortAt }, meta);
  return true;
}

function wrapAbort(controller, meta = {}) {
  if (!controller || !isFn(controller.abort) || controller.__onionAbortWrapped) return controller;

  const originalAbort = controller.abort.bind(controller);
  const AppCore = meta.AppCore || meta.core || null;

  try {
    controller.abort = function onionAbort(reason = "aborted") {
      const cleanReason = safeText(reason?.message || reason, "aborted");
      let result;

      try {
        result = originalAbort(reason);
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
  const meta = isObject(metaOrReason) ? metaOrReason : { reason: safeText(metaOrReason, "") };

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

  runtime.abortControllersCreated += 1;
  runtime.controllers.set(id, {
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
  if (!controller || !isFn(controller.abort)) return false;

  const cleanReason = safeText(reason?.message || reason, "aborted");

  try {
    controller.abort(reason);
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
  const valid = safeArray(signals).filter(isAbortSignal);
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];

  try {
    if (typeof AbortSignal !== "undefined" && isFn(AbortSignal.any)) return AbortSignal.any(valid);
  } catch {}

  const controller = createAbortController({ source: "http.runtime:mergeAbortSignals" });
  if (!controller?.signal) return valid[0] || null;

  const cleanups = [];
  const cleanup = () => {
    while (cleanups.length) {
      try {
        cleanups.pop()?.();
      } catch {}
    }
  };

  const abortFrom = (signal) => {
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
  };

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
    activeDelayCount: runtime.delays.size,
    activeDelays: Array.from(runtime.delays.values()).map((item) => ({
      delayId: item.delayId,
      requestId: item.requestId,
      source: item.source,
      ms: item.ms,
      startedAtIso: item.startedAtIso,
      elapsedMs: Math.max(0, stamp - safeNumber(item.startedAt, stamp)),
    })),
    activeControllerCount: runtime.controllers.size,
    activeControllers: Array.from(runtime.controllers.values()),
    delaySeq: runtime.delaySeq,
    controllerSeq: runtime.controllerSeq,
    pendingChanges: runtime.pendingChanges,
    pendingEmits: runtime.pendingEmits,
    pendingSilentChanges: runtime.pendingSilentChanges,
    lastPendingAt: runtime.lastPendingAt,
    lastPendingSource: runtime.lastPendingSource,
    lastPendingRequestId: runtime.lastPendingRequestId,
    abortControllersCreated: runtime.abortControllersCreated,
    abortControllersAborted: runtime.abortControllersAborted,
    lastAbortAt: runtime.lastAbortAt,
    lastAbortReason: runtime.lastAbortReason,
    lastRuntimeResetAt: runtime.lastRuntimeResetAt,
    policy: {
      ownHttpClient: false,
      ownAuth: false,
      ownRouter: false,
      ownToast: false,
      ownLoader: false,
      storage: false,
    },
    at: nowIso(),
  });
}

export function resetHttpRuntime(AppCore = null, targetState = null, meta = {}) {
  const options = safeObject(meta);

  cancelActiveDelays("http-runtime-reset");

  runtime.delays.clear();
  runtime.controllers.clear();
  runtime.delaySeq = 0;
  runtime.controllerSeq = 0;
  runtime.pendingChanges = 0;
  runtime.pendingEmits = 0;
  runtime.pendingSilentChanges = 0;
  runtime.lastPendingAt = "";
  runtime.lastPendingSource = "";
  runtime.lastPendingRequestId = null;
  runtime.abortControllersCreated = 0;
  runtime.abortControllersAborted = 0;
  runtime.lastAbortAt = "";
  runtime.lastAbortReason = "";
  runtime.lastRuntimeResetAt = nowIso();

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
      at: runtime.lastRuntimeResetAt,
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
