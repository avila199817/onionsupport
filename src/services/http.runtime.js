/* =========================================================
   Onion SPA - HTTP Runtime
   Archivo: src/services/http.runtime.js

   Responsabilidades:
   - gestionar esperas internas del servicio HTTP
   - controlar requests pendientes globales
   - emitir cambios de pending al event bus
   - exponer helpers de abort / cancelación
   - soportar delay cancelable por signal

   HARDENING EXTREMO:
   - delay cancelable robusto
   - fallback si AppCore.utils.sleep no existe
   - event bus seguro
   - pending counter anti-underflow
   - pending state siempre numérico
   - abort controller browser-safe
   - helpers de snapshot/reset
   - cero throws accidentales en eventos
========================================================= */

/* =========================================================
   RUNTIME STATE
========================================================= */

const runtimeState = {
  delaySeq: 0,
  activeDelays: new Map(),

  pendingChanges: 0,
  lastPendingAt: "",
  lastPendingSource: "",
  lastPendingRequestId: null,

  abortControllersCreated: 0,
};

/* =========================================================
   BASICS
========================================================= */

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function isFn(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : fallback;
}

function safeEmit(AppCore, eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, payload);
    return true;
  } catch {}

  return false;
}

function getRequestId(meta = {}) {
  return safeObject(meta).requestId || null;
}

function getDelayId(meta = {}) {
  const requestId = getRequestId(meta);

  runtimeState.delaySeq += 1;

  return requestId
    ? `delay_${requestId}_${runtimeState.delaySeq}`
    : `delay_${runtimeState.delaySeq}`;
}

function fallbackSleep(ms = 0) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, safeNumber(ms, 0)));
  });
}

function sleep(AppCore, ms = 0) {
  const waitMs = Math.max(0, safeNumber(ms, 0));

  try {
    if (isFn(AppCore?.utils?.sleep)) {
      return AppCore.utils.sleep(waitMs);
    }
  } catch {}

  return fallbackSleep(waitMs);
}

/* =========================================================
   ABORT HELPERS
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

export function createAbortError(signal = null, message = "Aborted") {
  const reason = getSignalReason(signal);

  if (reason instanceof Error) {
    return reason;
  }

  const finalMessage =
    safeText(
      reason?.message || reason,
      message
    );

  try {
    if (typeof DOMException !== "undefined") {
      return new DOMException(finalMessage, "AbortError");
    }
  } catch {}

  const error = new Error(finalMessage);
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  error.aborted = true;

  return error;
}

/* =========================================================
   DELAY
========================================================= */

export function delay(AppCore, ms = 0, signal = null, meta = {}) {
  const waitMs = Math.max(0, safeNumber(ms, 0));
  const requestId = getRequestId(meta);
  const delayId = getDelayId(meta);

  const startedAt = Date.now();

  const payloadBase = {
    delayId,
    ms: waitMs,
    requestId,
    source: safeText(meta?.source, "http.runtime:delay"),
  };

  safeEmit(AppCore, "http:delay:start", {
    ...payloadBase,
    at: nowIso(),
  });

  runtimeState.activeDelays.set(delayId, {
    delayId,
    ms: waitMs,
    requestId,
    startedAt,
    source: payloadBase.source,
  });

  function finalize(type = "end", extra = {}) {
    runtimeState.activeDelays.delete(delayId);

    safeEmit(AppCore, `http:delay:${type}`, {
      ...payloadBase,
      elapsedMs: Date.now() - startedAt,
      at: nowIso(),
      ...extra,
    });
  }

  if (!isAbortSignal(signal)) {
    return sleep(AppCore, waitMs).then((result) => {
      finalize("end");
      return result;
    });
  }

  return new Promise((resolve, reject) => {
    if (isSignalAborted(signal)) {
      const error = createAbortError(signal);

      finalize("abort", {
        aborted: true,
        error: {
          name: error.name,
          message: error.message,
        },
      });

      reject(error);
      return;
    }

    let settled = false;
    let timeoutId = null;

    function cleanup() {
      try {
        signal.removeEventListener("abort", onAbort);
      } catch {}

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    function settleEnd() {
      if (settled) return;

      settled = true;
      cleanup();
      finalize("end");
      resolve();
    }

    function onAbort() {
      if (settled) return;

      settled = true;
      cleanup();

      const error = createAbortError(signal);

      finalize("abort", {
        aborted: true,
        error: {
          name: error.name,
          message: error.message,
        },
      });

      reject(error);
    }

    try {
      signal.addEventListener("abort", onAbort, { once: true });
    } catch {
      reject(createAbortError(signal));
      return;
    }

    timeoutId = setTimeout(settleEnd, waitMs);
  });
}

/* =========================================================
   PENDING COUNTER
========================================================= */

function ensurePendingState(state) {
  if (!state || typeof state !== "object") {
    return {
      pendingRequests: 0,
    };
  }

  state.pendingRequests = Math.max(
    0,
    safeNumber(state.pendingRequests, 0)
  );

  return state;
}

function emitPendingChange(AppCore, state, meta = {}, previous = 0) {
  const pending = Math.max(
    0,
    safeNumber(state?.pendingRequests, 0)
  );

  const source = safeText(
    meta.source,
    "http.runtime:pending"
  );

  const requestId = meta.requestId || null;

  runtimeState.pendingChanges += 1;
  runtimeState.lastPendingAt = nowIso();
  runtimeState.lastPendingSource = source;
  runtimeState.lastPendingRequestId = requestId;

  safeEmit(AppCore, "http:pending:change", {
    pending,
    previous,
    source,
    requestId,
    at: runtimeState.lastPendingAt,
    underflowPrevented: Boolean(meta.underflowPrevented),
    changeCount: runtimeState.pendingChanges,
  });

  return pending;
}

export function incrementPendingRequests(AppCore, state, meta = {}) {
  const targetState = ensurePendingState(state);

  const previous = Math.max(
    0,
    safeNumber(targetState.pendingRequests, 0)
  );

  targetState.pendingRequests = previous + 1;

  return emitPendingChange(
    AppCore,
    targetState,
    {
      ...safeObject(meta),
      source: meta.source || "http.runtime:increment",
      underflowPrevented: false,
    },
    previous
  );
}

export function decrementPendingRequests(AppCore, state, meta = {}) {
  const targetState = ensurePendingState(state);

  const previous = Math.max(
    0,
    safeNumber(targetState.pendingRequests, 0)
  );

  const next = Math.max(0, previous - 1);

  targetState.pendingRequests = next;

  return emitPendingChange(
    AppCore,
    targetState,
    {
      ...safeObject(meta),
      source: meta.source || "http.runtime:decrement",
      underflowPrevented: previous === 0,
    },
    previous
  );
}

export function resetPendingRequests(AppCore, state, meta = {}) {
  const targetState = ensurePendingState(state);

  const previous = Math.max(
    0,
    safeNumber(targetState.pendingRequests, 0)
  );

  targetState.pendingRequests = 0;

  return emitPendingChange(
    AppCore,
    targetState,
    {
      ...safeObject(meta),
      source: meta.source || "http.runtime:reset",
      underflowPrevented: false,
    },
    previous
  );
}

/* =========================================================
   ABORT CONTROLLER
========================================================= */

export function createAbortController(reason = "") {
  if (typeof AbortController === "undefined") {
    return {
      signal: null,
      abort() {
        return false;
      },
      supported: false,
      reason: safeText(reason, ""),
    };
  }

  const controller = new AbortController();

  runtimeState.abortControllersCreated += 1;

  return controller;
}

export function abortController(controller, reason = "aborted") {
  if (!controller || !isFn(controller.abort)) {
    return false;
  }

  try {
    controller.abort(reason);
    return true;
  } catch {
    try {
      controller.abort();
      return true;
    } catch {}
  }

  return false;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHttpRuntimeSnapshot(state = null) {
  return {
    pendingRequests: Math.max(
      0,
      safeNumber(state?.pendingRequests, 0)
    ),

    activeDelays: Array.from(runtimeState.activeDelays.values()).map((item) => ({
      ...item,
      elapsedMs: Date.now() - item.startedAt,
    })),

    activeDelayCount: runtimeState.activeDelays.size,

    delaySeq: runtimeState.delaySeq,

    pendingChanges: runtimeState.pendingChanges,

    lastPendingAt: runtimeState.lastPendingAt,
    lastPendingSource: runtimeState.lastPendingSource,
    lastPendingRequestId: runtimeState.lastPendingRequestId,

    abortControllersCreated: runtimeState.abortControllersCreated,
  };
}

export default {
  delay,

  incrementPendingRequests,
  decrementPendingRequests,
  resetPendingRequests,

  createAbortController,
  abortController,

  isAbortSignal,
  isSignalAborted,
  getSignalReason,
  createAbortError,

  getHttpRuntimeSnapshot,
};
