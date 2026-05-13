/* =========================================================
   Onion SPA - HTTP Runtime
   Archivo: src/services/http.runtime.js

   ONION SUPPORT · HTTP RUNTIME
   PENDING REQUESTS · ABORT SAFE · DELAY SAFE · EVENT SAFE · 14/10

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
   - abort directo contabilizado aunque llamen controller.abort()
   - tracking seguro de delays/controladores activos
   - cancelación masiva de delays
   - helpers de snapshot/reset
   - eventos sin tokens reales
   - cero throws accidentales en eventos
========================================================= */

/* =========================================================
   VERSION / EVENTS
========================================================= */

export const HTTP_RUNTIME_VERSION =
  "14.0.0";

export const HTTP_RUNTIME_EVENTS =
  Object.freeze({
    delayStart:
      "http:delay:start",

    delayEnd:
      "http:delay:end",

    delayAbort:
      "http:delay:abort",

    delayError:
      "http:delay:error",

    delayCancel:
      "http:delay:cancel",

    pendingChange:
      "http:pending:change",

    abortCreated:
      "http:abort-controller:created",

    abort:
      "http:abort-controller:abort",

    runtimeReset:
      "http:runtime:reset",
  });

/* =========================================================
   RUNTIME STATE
========================================================= */

const runtimeState = {
  version:
    HTTP_RUNTIME_VERSION,

  delaySeq:
    0,

  controllerSeq:
    0,

  activeDelays:
    new Map(),

  activeDelayControls:
    new Map(),

  activeControllers:
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

const controllerIds =
  new WeakMap();

const countedAbortedControllers =
  new WeakSet();

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

function isAnyObject(value) {
  return (
    value !== null &&
    typeof value === "object"
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

function normalizeMeta(meta = {}) {
  if (isObject(meta)) {
    return meta;
  }

  if (
    meta === null ||
    meta === undefined ||
    meta === ""
  ) {
    return {};
  }

  return {
    reason:
      safeText(meta, ""),
  };
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
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|temporaryToken|temporary_token|twoFactorToken|two_factor_token|mfaToken|mfa_token)=)([^&#\s]+)/gi,
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

  try {
    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function sanitizeRuntimePayload(value, depth = 0, keyHint = "") {
  if (
    /token|secret|password|authorization|credential|cookie|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i.test(
      safeText(keyHint, "")
    )
  ) {
    return value
      ? "***"
      : null;
  }

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

  if (typeof value === "bigint") {
    return String(value);
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

      status:
        value.status || value.statusCode || null,

      timeout:
        value.timeout === true,

      aborted:
        value.aborted === true,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizeRuntimePayload(
          item,
          depth + 1,
          keyHint
        )
      );
  }

  if (isAnyObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] =
        sanitizeRuntimePayload(
          item,
          depth + 1,
          key
        );
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
  const safeArgs =
    args.map((item) =>
      sanitizeRuntimePayload(item)
    );

  try {
    AppCore?.utils?.warn?.(
      "[HTTP Runtime]",
      ...safeArgs
    );

    return;
  } catch {}

  try {
    console.warn(
      "[HTTP Runtime]",
      ...safeArgs
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

export function sleep(AppCore, ms = 0) {
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

export function isAbortError(error = null) {
  const name =
    safeText(error?.name, "")
      .toLowerCase();

  const message =
    safeText(error?.message, "")
      .toLowerCase();

  const code =
    safeText(error?.code, "")
      .toLowerCase();

  return Boolean(
    error?.aborted === true ||
      name === "aborterror" ||
      code === "abort_err" ||
      code === "20" ||
      message.includes("aborted") ||
      message.includes("abort")
  );
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
   IDS
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

function getControllerId(controller = null, meta = {}) {
  if (!controller) {
    return "";
  }

  try {
    if (!controllerIds.has(controller)) {
      runtimeState.controllerSeq += 1;

      const requestId =
        getRequestId(meta);

      const id =
        requestId
          ? `abort_${requestId}_${runtimeState.controllerSeq}`
          : `abort_${runtimeState.controllerSeq}`;

      controllerIds.set(
        controller,
        id
      );
    }

    return controllerIds.get(controller);
  } catch {
    runtimeState.controllerSeq += 1;
    return `abort_${runtimeState.controllerSeq}`;
  }
}

/* =========================================================
   DELAY REGISTRY
========================================================= */

function registerDelay(delayId, payload = {}, controls = {}) {
  runtimeState.activeDelays.set(
    delayId,
    {
      ...payload,
    }
  );

  if (controls && isObject(controls)) {
    runtimeState.activeDelayControls.set(
      delayId,
      controls
    );
  }
}

function unregisterDelay(delayId) {
  runtimeState.activeDelays.delete(
    delayId
  );

  runtimeState.activeDelayControls.delete(
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

  let settled =
    false;

  let timeoutId =
    null;

  let removeAbort =
    () => {};

  let rejectRef =
    null;

  function finalize(type = "end", extra = {}) {
    unregisterDelay(delayId);

    safeEmit(
      AppCore,
      HTTP_RUNTIME_EVENTS[`delay${type[0].toUpperCase()}${type.slice(1)}`] ||
        `http:delay:${type}`,
      {
        ...payloadBase,

        elapsedMs:
          Math.max(
            0,
            nowMs() - startedAt
          ),

        at:
          nowIso(),

        ...safeObject(extra),
      }
    );
  }

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

  function settleEnd(resolve) {
    if (settled) {
      return;
    }

    settled =
      true;

    cleanup();
    finalize("end");
    resolve(true);
  }

  function settleAbort(reject, reason = "Delay aborted") {
    if (settled) {
      return;
    }

    settled =
      true;

    cleanup();

    const error =
      createAbortError(
        signal,
        reason
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

  function settleCancel(reason = "Delay cancelled") {
    if (settled) {
      return false;
    }

    settled =
      true;

    cleanup();

    const error =
      createAbortError(
        {
          reason,
          aborted:
            true,
        },
        reason
      );

    finalize(
      "cancel",
      {
        cancelled:
          true,

        reason,

        error,
      }
    );

    try {
      rejectRef?.(error);
    } catch {}

    return true;
  }

  registerDelay(
    delayId,
    {
      ...payloadBase,

      startedAt,

      startedAtIso:
        nowIso(startedAt),
    },
    {
      cancel:
        settleCancel,
    }
  );

  safeEmit(
    AppCore,
    HTTP_RUNTIME_EVENTS.delayStart,
    {
      ...payloadBase,

      at:
        nowIso(startedAt),
    }
  );

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

  return new Promise((resolve, reject) => {
    rejectRef =
      reject;

    if (isAbortSignal(signal)) {
      removeAbort =
        addAbortListener(
          signal,
          () => {
            settleAbort(
              reject,
              "Delay aborted"
            );
          }
        );
    }

    try {
      timeoutId =
        setTimeout(
          () => {
            settleEnd(resolve);
          },
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

export function cancelDelay(delayId = "", reason = "delay-cancelled") {
  const cleanId =
    safeText(delayId, "");

  if (!cleanId) {
    return false;
  }

  const control =
    runtimeState.activeDelayControls.get(cleanId);

  if (!control || !isFn(control.cancel)) {
    return false;
  }

  try {
    return Boolean(
      control.cancel(reason)
    );
  } catch {
    return false;
  }
}

export function cancelActiveDelays(reason = "runtime-cancel-delays") {
  let cancelled =
    0;

  for (const delayId of Array.from(runtimeState.activeDelayControls.keys())) {
    if (
      cancelDelay(
        delayId,
        reason
      )
    ) {
      cancelled += 1;
    }
  }

  return cancelled;
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
    HTTP_RUNTIME_EVENTS.pendingChange,
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

function markControllerAborted(controller, reason = "aborted", AppCore = null) {
  if (!controller) {
    return false;
  }

  try {
    if (countedAbortedControllers.has(controller)) {
      return false;
    }

    countedAbortedControllers.add(controller);
  } catch {}

  const cleanReason =
    safeText(reason, "aborted");

  const controllerId =
    getControllerId(controller);

  runtimeState.abortControllersAborted += 1;
  runtimeState.lastAbortAt =
    nowIso();
  runtimeState.lastAbortReason =
    redactRuntimeValue(cleanReason);

  runtimeState.activeControllers.delete(
    controllerId
  );

  safeEmit(
    AppCore,
    HTTP_RUNTIME_EVENTS.abort,
    {
      controllerId,

      reason:
        cleanReason,

      at:
        runtimeState.lastAbortAt,
    }
  );

  return true;
}

function wrapControllerAbort(controller, meta = {}) {
  if (
    !controller ||
    !isFn(controller.abort)
  ) {
    return controller;
  }

  const originalAbort =
    controller.abort.bind(controller);

  const AppCore =
    meta?.AppCore ||
    meta?.core ||
    null;

  try {
    controller.abort =
      function onionAbortControllerAbort(reason = "aborted") {
        const cleanReason =
          safeText(reason, "aborted");

        let result;

        try {
          result =
            originalAbort(cleanReason);
        } catch {
          result =
            originalAbort();
        } finally {
          markControllerAborted(
            controller,
            cleanReason,
            AppCore
          );
        }

        return result;
      };
  } catch {}

  return controller;
}

export function createAbortController(metaOrReason = "") {
  const meta =
    normalizeMeta(metaOrReason);

  const reason =
    safeText(
      meta.reason,
      safeText(metaOrReason, "")
    );

  if (typeof AbortController === "undefined") {
    return {
      signal:
        null,

      supported:
        false,

      reason,

      abort() {
        return false;
      },
    };
  }

  const controller =
    new AbortController();

  const controllerId =
    getControllerId(
      controller,
      meta
    );

  runtimeState.abortControllersCreated += 1;

  runtimeState.activeControllers.set(
    controllerId,
    {
      controllerId,

      requestId:
        getRequestId(meta),

      source:
        safeText(
          meta.source,
          "http.runtime:createAbortController"
        ),

      reason:
        redactRuntimeValue(reason),

      createdAt:
        nowIso(),
    }
  );

  wrapControllerAbort(
    controller,
    meta
  );

  safeEmit(
    meta?.AppCore || meta?.core || null,
    HTTP_RUNTIME_EVENTS.abortCreated,
    {
      controllerId,

      requestId:
        getRequestId(meta),

      source:
        safeText(
          meta.source,
          "http.runtime:createAbortController"
        ),

      at:
        nowIso(),
    }
  );

  return controller;
}

export function abortController(controller, reason = "aborted", AppCore = null) {
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

    markControllerAborted(
      controller,
      cleanReason,
      AppCore
    );

    return true;
  } catch {
    try {
      controller.abort();

      markControllerAborted(
        controller,
        cleanReason,
        AppCore
      );

      return true;
    } catch {}
  }

  return false;
}

/* =========================================================
   SIGNAL MERGE
========================================================= */

export function mergeAbortSignals(signals = []) {
  const validSignals =
    Array.isArray(signals)
      ? signals.filter(isAbortSignal)
      : [];

  if (!validSignals.length) {
    return null;
  }

  if (validSignals.length === 1) {
    return validSignals[0];
  }

  const controller =
    createAbortController({
      source:
        "http.runtime:mergeAbortSignals",
    });

  if (!controller?.signal) {
    return validSignals[0] || null;
  }

  const cleanups =
    [];

  function cleanup() {
    for (const dispose of cleanups.splice(0)) {
      try {
        dispose();
      } catch {}
    }
  }

  function abortFrom(signal) {
    if (controller.signal.aborted) {
      return;
    }

    try {
      controller.abort(
        getSignalReason(signal) ||
          "merged-signal-aborted"
      );
    } catch {
      try {
        controller.abort();
      } catch {}
    } finally {
      cleanup();
    }
  }

  for (const signal of validSignals) {
    if (isSignalAborted(signal)) {
      abortFrom(signal);
      break;
    }

    cleanups.push(
      addAbortListener(
        signal,
        () => {
          abortFrom(signal);
        }
      )
    );
  }

  return controller.signal;
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
    version:
      HTTP_RUNTIME_VERSION,

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
          Math.max(
            0,
            nowMs() - safeNumber(item.startedAt, nowMs())
          ),
      })),

    activeControllerCount:
      runtimeState.activeControllers.size,

    activeControllers:
      Array.from(
        runtimeState.activeControllers.values()
      ),

    delaySeq:
      runtimeState.delaySeq,

    controllerSeq:
      runtimeState.controllerSeq,

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

    at:
      nowIso(),
  });
}

export function resetHttpRuntime(AppCore = null, state = null, meta = {}) {
  cancelActiveDelays(
    "http-runtime-reset"
  );

  runtimeState.activeDelays.clear();
  runtimeState.activeDelayControls.clear();
  runtimeState.activeControllers.clear();

  runtimeState.delaySeq =
    0;

  runtimeState.controllerSeq =
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
    HTTP_RUNTIME_EVENTS.runtimeReset,
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
