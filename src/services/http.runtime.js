/* =========================================================
   Onion SPA - HTTP Runtime
   Archivo: src/services/http.runtime.js

   ONION SUPPORT · HTTP RUNTIME
   PENDING REQUESTS · ABORT SAFE · DELAY SAFE · EVENT SAFE

   Responsabilidades:
   - Gestionar esperas internas del servicio HTTP.
   - Controlar requests pendientes globales.
   - Emitir cambios de pending al event bus.
   - Exponer helpers de abort/cancelación.
   - Soportar delay cancelable por AbortSignal.
   - Exponer snapshot/reset de runtime.

   HARDENING EXTREMO:
   - delay cancelable robusto
   - fallback si AppCore.utils.sleep no existe
   - event bus seguro
   - pending counter anti-underflow
   - pending state siempre numérico
   - abort controller browser/server-safe
   - helpers de snapshot/reset
   - cero throws accidentales en eventos
========================================================= */

/* =========================================================
   RUNTIME STATE
========================================================= */

const runtimeState = {
  delaySeq:
    0,

  activeDelays:
    new Map(),

  pendingChanges:
    0,

  lastPendingAt:
    "",

  lastPendingSource:
    "",

  lastPendingRequestId:
    null,

  abortControllersCreated:
    0,

  abortControllersAborted:
    0,

  lastAbortAt:
    "",

  lastAbortReason:
    "",
};

/* =========================================================
   BASICS
========================================================= */

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

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
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

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function clampMs(ms = 0) {
  return Math.max(
    0,
    safeNumber(ms, 0)
  );
}

/* =========================================================
   REDACT / SANITIZE
========================================================= */

function redactRuntimeValue(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    output =
      output.replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token)=)([^&#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  return output;
}

function sanitizeRuntimePayload(value, depth = 0) {
  if (depth > 5) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactRuntimeValue(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value instanceof Error) {
    return {
      name:
        safeText(value.name, "Error"),

      message:
        redactRuntimeValue(value.message || ""),

      code:
        value.code || null,

      aborted:
        value.aborted === true,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizeRuntimePayload(item, depth + 1)
      );
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (
        /token|secret|password|authorization|credential|cookie/i.test(key)
      ) {
        output[key] =
          item ? "***" : item;

        continue;
      }

      output[key] =
        sanitizeRuntimePayload(item, depth + 1);
    }

    return output;
  }

  return redactRuntimeValue(String(value));
}

/* =========================================================
   EVENTS / LOGS
========================================================= */

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      sanitizeRuntimePayload(payload)
    );

    return true;
  } catch {}

  return false;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[HTTP Runtime]",
      ...args.map((item) => sanitizeRuntimePayload(item))
    );

    return;
  } catch {}

  try {
    console.warn(
      "[HTTP Runtime]",
      ...args.map((item) => sanitizeRuntimePayload(item))
    );
  } catch {}
}

/* =========================================================
   SLEEP
========================================================= */

function fallbackSleep(ms = 0) {
  const waitMs =
    clampMs(ms);

  return new Promise((resolve) => {
    try {
      setTimeout(
        resolve,
        waitMs
      );
    } catch {
      resolve();
    }
  });
}

function sleep(AppCore, ms = 0) {
  const waitMs =
    clampMs(ms);

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
  const reason =
    getSignalReason(signal);

  if (reason instanceof Error) {
    try {
      reason.aborted =
        true;
    } catch {}

    return reason;
  }

  const finalMessage =
    safeText(
      reason?.message || reason,
      message
    );

  try {
    if (typeof DOMException !== "undefined") {
      const error =
        new DOMException(
          finalMessage,
          "AbortError"
        );

      try {
        error.aborted =
          true;
      } catch {}

      return error;
    }
  } catch {}

  const error =
    new Error(finalMessage);

  error.name =
    "AbortError";

  error.code =
    "ABORT_ERR";

  error.aborted =
    true;

  return error;
}

function addAbortListener(signal, handler) {
  if (
    !isAbortSignal(signal) ||
    !isFn(handler)
  ) {
    return () => {};
  }

  try {
    signal.addEventListener(
      "abort",
      handler,
      {
        once:
          true,
      }
    );

    return () => {
      try {
        signal.removeEventListener(
          "abort",
          handler
        );
      } catch {}
    };
  } catch {
    return () => {};
  }
}

/* =========================================================
   DELAY IDS
========================================================= */

function getRequestId(meta = {}) {
  return safeText(
    safeObject(meta).requestId,
    ""
  ) || null;
}

function getDelayId(meta = {}) {
  const requestId =
    getRequestId(meta);

  runtimeState.delaySeq += 1;

  return requestId
    ? `delay_${requestId}_${runtimeState.delaySeq}`
    : `delay_${runtimeState.delaySeq}`;
}

function registerDelay(delayId, payload = {}) {
  runtimeState.activeDelays.set(
    delayId,
    {
      ...payload,
    }
  );
}

function unregisterDelay(delayId) {
  runtimeState.activeDelays.delete(
    delayId
  );
}

/* =========================================================
   DELAY
========================================================= */

export function delay(AppCore, ms = 0, signal = null, meta = {}) {
  const waitMs =
    clampMs(ms);

  const safeMeta =
    safeObject(meta);

  const requestId =
    getRequestId(safeMeta);

  const delayId =
    getDelayId(safeMeta);

  const startedAt =
    nowMs();

  const source =
    safeText(
      safeMeta.source,
      "http.runtime:delay"
    );

  const payloadBase = {
    delayId,

    ms:
      waitMs,

    requestId,

    source,
  };

  registerDelay(
    delayId,
    {
      ...payloadBase,

      startedAt,
    }
  );

  safeEmit(
    AppCore,
    "http:delay:start",
    {
      ...payloadBase,

      at:
        nowIso(startedAt),
    }
  );

  function finalize(type = "end", extra = {}) {
    unregisterDelay(delayId);

    safeEmit(
      AppCore,
      `http:delay:${type}`,
      {
        ...payloadBase,

        elapsedMs:
          nowMs() - startedAt,

        at:
          nowIso(),

        ...safeObject(extra),
      }
    );
  }

  if (isSignalAborted(signal)) {
    const error =
      createAbortError(
        signal,
        "Delay aborted before start"
      );

    finalize(
      "abort",
      {
        aborted:
          true,

        error,
      }
    );

    return Promise.reject(error);
  }

  if (!isAbortSignal(signal)) {
    return sleep(
      AppCore,
      waitMs
    )
      .then((result) => {
        finalize("end");
        return result;
      })
      .catch((error) => {
        finalize(
          "error",
          {
            error,
          }
        );

        throw error;
      });
  }

  return new Promise((resolve, reject) => {
    let settled =
      false;

    let timeoutId =
      null;

    let removeAbort =
      () => {};

    function cleanup() {
      try {
        removeAbort();
      } catch {}

      try {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      } catch {}

      timeoutId =
        null;
    }

    function settleEnd() {
      if (settled) {
        return;
      }

      settled =
        true;

      cleanup();
      finalize("end");
      resolve(true);
    }

    function settleAbort() {
      if (settled) {
        return;
      }

      settled =
        true;

      cleanup();

      const error =
        createAbortError(
          signal,
          "Delay aborted"
        );

      finalize(
        "abort",
        {
          aborted:
            true,

          error,
        }
      );

      reject(error);
    }

    removeAbort =
      addAbortListener(
        signal,
        settleAbort
      );

    try {
      timeoutId =
        setTimeout(
          settleEnd,
          waitMs
        );
    } catch (error) {
      settled =
        true;

      cleanup();

      finalize(
        "error",
        {
          error,
        }
      );

      reject(error);
    }
  });
}

/* =========================================================
   PENDING STATE
========================================================= */

function ensurePendingState(state) {
  if (
    !state ||
    typeof state !== "object"
  ) {
    return {
      pendingRequests:
        0,
    };
  }

  state.pendingRequests =
    Math.max(
      0,
      safeNumber(
        state.pendingRequests,
        0
      )
    );

  return state;
}

function emitPendingChange(AppCore, state, meta = {}, previous = 0) {
  const safeMeta =
    safeObject(meta);

  const pending =
    Math.max(
      0,
      safeNumber(
        state?.pendingRequests,
        0
      )
    );

  const source =
    safeText(
      safeMeta.source,
      "http.runtime:pending"
    );

  const requestId =
    safeText(
      safeMeta.requestId,
      ""
    ) || null;

  const at =
    nowIso();

  runtimeState.pendingChanges += 1;
  runtimeState.lastPendingAt =
    at;
  runtimeState.lastPendingSource =
    source;
  runtimeState.lastPendingRequestId =
    requestId;

  safeEmit(
    AppCore,
    "http:pending:change",
    {
      pending,

      previous:
        Math.max(
          0,
          safeNumber(previous, 0)
        ),

      source,

      requestId,

      at,

      underflowPrevented:
        Boolean(safeMeta.underflowPrevented),

      changeCount:
        runtimeState.pendingChanges,
    }
  );

  return pending;
}

export function incrementPendingRequests(AppCore, state, meta = {}) {
  const targetState =
    ensurePendingState(state);

  const previous =
    Math.max(
      0,
      safeNumber(
        targetState.pendingRequests,
        0
      )
    );

  targetState.pendingRequests =
    previous + 1;

  return emitPendingChange(
    AppCore,
    targetState,
    {
      ...safeObject(meta),

      source:
        meta?.source ||
        "http.runtime:increment",

      underflowPrevented:
        false,
    },
    previous
  );
}

export function decrementPendingRequests(AppCore, state, meta = {}) {
  const targetState =
    ensurePendingState(state);

  const previous =
    Math.max(
      0,
      safeNumber(
        targetState.pendingRequests,
        0
      )
    );

  const next =
    Math.max(
      0,
      previous - 1
    );

  targetState.pendingRequests =
    next;

  return emitPendingChange(
    AppCore,
    targetState,
    {
      ...safeObject(meta),

      source:
        meta?.source ||
        "http.runtime:decrement",

      underflowPrevented:
        previous === 0,
    },
    previous
  );
}

export function resetPendingRequests(AppCore, state, meta = {}) {
  const targetState =
    ensurePendingState(state);

  const previous =
    Math.max(
      0,
      safeNumber(
        targetState.pendingRequests,
        0
      )
    );

  targetState.pendingRequests =
    0;

  return emitPendingChange(
    AppCore,
    targetState,
    {
      ...safeObject(meta),

      source:
        meta?.source ||
        "http.runtime:reset",

      underflowPrevented:
        false,
    },
    previous
  );
}

/* =========================================================
   ABORT CONTROLLER
========================================================= */

export function createAbortController(reason = "") {
  const cleanReason =
    safeText(reason, "");

  if (typeof AbortController === "undefined") {
    return {
      signal:
        null,

      supported:
        false,

      reason:
        cleanReason,

      abort() {
        return false;
      },
    };
  }

  const controller =
    new AbortController();

  runtimeState.abortControllersCreated += 1;

  return controller;
}

export function abortController(controller, reason = "aborted") {
  if (
    !controller ||
    !isFn(controller.abort)
  ) {
    return false;
  }

  const cleanReason =
    safeText(reason, "aborted");

  try {
    controller.abort(cleanReason);

    runtimeState.abortControllersAborted += 1;
    runtimeState.lastAbortAt =
      nowIso();
    runtimeState.lastAbortReason =
      redactRuntimeValue(cleanReason);

    return true;
  } catch {
    try {
      controller.abort();

      runtimeState.abortControllersAborted += 1;
      runtimeState.lastAbortAt =
        nowIso();
      runtimeState.lastAbortReason =
        redactRuntimeValue(cleanReason);

      return true;
    } catch {}
  }

  return false;
}

/* =========================================================
   SNAPSHOT / RESET
========================================================= */

export function getHttpRuntimeSnapshot(state = null) {
  const pending =
    Math.max(
      0,
      safeNumber(
        state?.pendingRequests,
        0
      )
    );

  return sanitizeRuntimePayload({
    pendingRequests:
      pending,

    activeDelayCount:
      runtimeState.activeDelays.size,

    activeDelays:
      Array.from(
        runtimeState.activeDelays.values()
      ).map((item) => ({
        ...item,

        elapsedMs:
          nowMs() - safeNumber(item.startedAt, nowMs()),
      })),

    delaySeq:
      runtimeState.delaySeq,

    pendingChanges:
      runtimeState.pendingChanges,

    lastPendingAt:
      runtimeState.lastPendingAt,

    lastPendingSource:
      runtimeState.lastPendingSource,

    lastPendingRequestId:
      runtimeState.lastPendingRequestId,

    abortControllersCreated:
      runtimeState.abortControllersCreated,

    abortControllersAborted:
      runtimeState.abortControllersAborted,

    lastAbortAt:
      runtimeState.lastAbortAt,

    lastAbortReason:
      runtimeState.lastAbortReason,
  });
}

export function resetHttpRuntime(AppCore = null, state = null, meta = {}) {
  runtimeState.activeDelays.clear();

  runtimeState.delaySeq =
    0;

  runtimeState.pendingChanges =
    0;

  runtimeState.lastPendingAt =
    "";

  runtimeState.lastPendingSource =
    "";

  runtimeState.lastPendingRequestId =
    null;

  runtimeState.abortControllersCreated =
    0;

  runtimeState.abortControllersAborted =
    0;

  runtimeState.lastAbortAt =
    "";

  runtimeState.lastAbortReason =
    "";

  if (state && typeof state === "object") {
    resetPendingRequests(
      AppCore,
      state,
      {
        ...safeObject(meta),

        source:
          meta?.source ||
          "http.runtime:runtime-reset",
      }
    );
  }

  safeEmit(
    AppCore,
    "http:runtime:reset",
    {
      at:
        nowIso(),

      source:
        meta?.source ||
        "http.runtime:reset",
    }
  );

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
  resetHttpRuntime,
};
