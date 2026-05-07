/* =========================================================
   Onion SPA - HTTP Interceptors
   Archivo: src/services/http.interceptors.js

   ONION SUPPORT · HTTP INTERCEPTORS
   FIFO STABLE · PRIORITY SAFE · FAIL OPEN · TIMEOUT SAFE

   Responsabilidades:
   - Registrar interceptores request / response / error.
   - Ejecutar interceptores en cadena.
   - Permitir eject seguro.
   - Aislar fallos individuales.
   - Mantener orden FIFO por defecto.
   - Soportar prioridad, once y timeout.
   - Exponer snapshot debug.
   - Soportar funciones legacy.
   - Soportar entradas { handler }.

   HARDENING EXTREMO:
   - Register idempotente opcional por id.
   - Disposer seguro.
   - Buckets autocurables.
   - Errores aislados si failOpen !== false.
   - Timeout por interceptor.
   - Prioridad descendente + FIFO estable.
   - Snapshot estable durante ejecución.
   - Runtime stats por interceptor.
   - Sin mutar la cadena mientras se ejecuta.
========================================================= */

import {
  isFn,
} from "./http.helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const INTERCEPTORS_VERSION =
  "11.0.0";

const INTERCEPTOR_TYPES =
  Object.freeze([
    "request",
    "response",
    "error",
  ]);

const DEFAULT_TIMEOUT_MS =
  0;

let interceptorSeq =
  0;

/* =========================================================
   BASICS
========================================================= */

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
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function toNonNegativeInt(value, fallback = 0) {
  return Math.max(
    0,
    Math.trunc(
      safeNumber(value, fallback)
    )
  );
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function isoNow(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function noopDisposer() {
  return false;
}

function isValidType(type = "") {
  return INTERCEPTOR_TYPES.includes(
    safeText(type, "")
  );
}

function nextInterceptorId(type = "interceptor") {
  interceptorSeq += 1;

  return `${type}_${interceptorSeq}`;
}

function sanitizeError(error = null) {
  if (!error) {
    return null;
  }

  return {
    name:
      safeText(error?.name, "Error"),

    message:
      safeText(
        error?.message || error,
        "Interceptor error."
      ),

    code:
      error?.code || null,

    timeout:
      error?.timeout === true,

    at:
      isoNow(),
  };
}

/* =========================================================
   STATE
========================================================= */

function createMeta() {
  return {
    version:
      INTERCEPTORS_VERSION,

    createdAt:
      isoNow(),

    registered:
      0,

    replaced:
      0,

    ejected:
      0,

    cleared:
      0,

    executed:
      0,

    failed:
      0,

    timedOut:
      0,

    skipped:
      0,

    lastRunAt:
      "",

    lastRunType:
      "",

    lastError:
      null,
  };
}

export function createInterceptorsState() {
  return {
    request:
      [],

    response:
      [],

    error:
      [],

    meta:
      createMeta(),
  };
}

/* =========================================================
   INTERNAL STATE HELPERS
========================================================= */

function ensureState(interceptors) {
  const state =
    isObject(interceptors)
      ? interceptors
      : createInterceptorsState();

  for (const type of INTERCEPTOR_TYPES) {
    if (!Array.isArray(state[type])) {
      state[type] = [];
    }
  }

  if (!isObject(state.meta)) {
    state.meta =
      createMeta();
  }

  const defaults =
    createMeta();

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in state.meta)) {
      state.meta[key] = value;
    }
  }

  return state;
}

function ensureBucket(interceptors, type) {
  const state =
    ensureState(interceptors);

  const cleanType =
    safeText(type, "");

  if (!isValidType(cleanType)) {
    throw new Error(
      `Tipo de interceptor inválido: ${cleanType}`
    );
  }

  if (!Array.isArray(state[cleanType])) {
    state[cleanType] = [];
  }

  return state[cleanType];
}

function touchRun(interceptors, type = "") {
  const state =
    ensureState(interceptors);

  state.meta.executed =
    toNonNegativeInt(
      state.meta.executed,
      0
    ) + 1;

  state.meta.lastRunAt =
    isoNow();

  state.meta.lastRunType =
    safeText(type, "");

  return state;
}

function recordError(interceptors, type, entry, error, timedOut = false) {
  const state =
    ensureState(interceptors);

  state.meta.failed =
    toNonNegativeInt(
      state.meta.failed,
      0
    ) + 1;

  if (timedOut) {
    state.meta.timedOut =
      toNonNegativeInt(
        state.meta.timedOut,
        0
      ) + 1;
  }

  state.meta.lastError = {
    type:
      safeText(type, ""),

    interceptorId:
      safeText(entry?.id, ""),

    interceptorName:
      safeText(entry?.name, ""),

    ...sanitizeError(error),

    timedOut:
      Boolean(timedOut),
  };

  return state.meta.lastError;
}

function recordSkipped(interceptors) {
  const state =
    ensureState(interceptors);

  state.meta.skipped =
    toNonNegativeInt(
      state.meta.skipped,
      0
    ) + 1;

  return true;
}

/* =========================================================
   ENTRY NORMALIZATION
========================================================= */

function normalizeEntry(candidate, index = 0, type = "request") {
  const cleanType =
    isValidType(type)
      ? type
      : "request";

  if (isFn(candidate)) {
    return {
      id:
        `legacy_${cleanType}_${index}`,

      name:
        candidate.name ||
        `legacy_${cleanType}_${index}`,

      handler:
        candidate,

      priority:
        0,

      timeoutMs:
        DEFAULT_TIMEOUT_MS,

      failOpen:
        true,

      once:
        false,

      enabled:
        true,

      order:
        index,

      createdAt:
        "",

      runCount:
        0,

      errorCount:
        0,

      timeoutCount:
        0,

      lastRunAt:
        "",

      lastDurationMs:
        0,

      lastError:
        null,

      ref:
        candidate,
    };
  }

  if (
    isObject(candidate) &&
    isFn(candidate.handler)
  ) {
    return {
      id:
        safeText(
          candidate.id,
          `itc_${cleanType}_${candidate.order || index}`
        ),

      name:
        safeText(
          candidate.name,
          candidate.handler.name ||
            `interceptor_${cleanType}_${index}`
        ),

      handler:
        candidate.handler,

      priority:
        safeNumber(
          candidate.priority,
          0
        ),

      timeoutMs:
        toNonNegativeInt(
          candidate.timeoutMs,
          DEFAULT_TIMEOUT_MS
        ),

      failOpen:
        candidate.failOpen !== false,

      once:
        candidate.once === true,

      enabled:
        candidate.enabled !== false,

      order:
        safeNumber(
          candidate.order,
          index
        ),

      createdAt:
        candidate.createdAt || "",

      runCount:
        toNonNegativeInt(
          candidate.runCount,
          0
        ),

      errorCount:
        toNonNegativeInt(
          candidate.errorCount,
          0
        ),

      timeoutCount:
        toNonNegativeInt(
          candidate.timeoutCount,
          0
        ),

      lastRunAt:
        candidate.lastRunAt || "",

      lastDurationMs:
        toNonNegativeInt(
          candidate.lastDurationMs,
          0
        ),

      lastError:
        candidate.lastError || null,

      ref:
        candidate.ref || candidate,
    };
  }

  return null;
}

function normalizeRegistrationInput(handlerOrEntry, options = {}, type = "request") {
  if (isFn(handlerOrEntry)) {
    return {
      handler:
        handlerOrEntry,

      options:
        safeObject(options),
    };
  }

  if (
    isObject(handlerOrEntry) &&
    isFn(handlerOrEntry.handler)
  ) {
    return {
      handler:
        handlerOrEntry.handler,

      options: {
        ...handlerOrEntry,
        ...safeObject(options),
      },
    };
  }

  return {
    handler:
      null,

    options:
      safeObject(options),
  };
}

function sortByPriority(entries = []) {
  return [...entries].sort((a, b) => {
    const priorityDiff =
      safeNumber(b?.priority, 0) -
      safeNumber(a?.priority, 0);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return (
      safeNumber(a?.order, 0) -
      safeNumber(b?.order, 0)
    );
  });
}

function snapshotBucket(bucket = [], type = "request") {
  return sortByPriority(
    bucket
      .map((entry, index) =>
        normalizeEntry(
          entry,
          index,
          type
        )
      )
      .filter(Boolean)
      .filter((entry) =>
        entry.enabled !== false
      )
  );
}

function persistEntryRuntime(bucket, entry, patch = {}) {
  if (
    !Array.isArray(bucket) ||
    !entry?.id
  ) {
    return false;
  }

  const target =
    bucket.find((item) => {
      if (item === entry.ref) return true;
      if (item?.id === entry.id) return true;
      if (item?.handler === entry.handler) return true;
      if (item?.ref === entry.ref) return true;

      return false;
    });

  if (
    target &&
    isObject(target)
  ) {
    Object.assign(
      target,
      patch
    );

    return true;
  }

  return false;
}

/* =========================================================
   REMOVE
========================================================= */

function removeInterceptor(bucket, ref) {
  if (!Array.isArray(bucket)) {
    return false;
  }

  const index =
    bucket.findIndex((item) => {
      if (item === ref) return true;
      if (item?.id === ref) return true;
      if (item?.name === ref) return true;
      if (item?.handler === ref) return true;
      if (item?.ref === ref) return true;

      return false;
    });

  if (index >= 0) {
    bucket.splice(index, 1);
    return true;
  }

  return false;
}

function setInterceptorEnabled(bucket, ref, enabled) {
  if (!Array.isArray(bucket)) {
    return false;
  }

  const target =
    bucket.find((item) => {
      if (item === ref) return true;
      if (item?.id === ref) return true;
      if (item?.name === ref) return true;
      if (item?.handler === ref) return true;
      if (item?.ref === ref) return true;

      return false;
    });

  if (
    target &&
    isObject(target)
  ) {
    target.enabled =
      Boolean(enabled);

    return true;
  }

  return false;
}

/* =========================================================
   TIMEOUT
========================================================= */

async function runWithTimeout(promise, timeoutMs, label = "interceptor") {
  const finalTimeout =
    toNonNegativeInt(
      timeoutMs,
      0
    );

  if (finalTimeout <= 0) {
    return promise;
  }

  let timeoutId =
    null;

  let didTimeout =
    false;

  const timeoutPromise =
    new Promise((_, reject) => {
      try {
        timeoutId =
          setTimeout(() => {
            didTimeout =
              true;

            const error =
              new Error(
                `Interceptor timeout (${label})`
              );

            error.name =
              "InterceptorTimeoutError";

            error.timeout =
              true;

            reject(error);
          }, finalTimeout);
      } catch (error) {
        reject(error);
      }
    });

  try {
    return await Promise.race([
      promise,
      timeoutPromise,
    ]);
  } catch (error) {
    if (didTimeout) {
      try {
        error.timeout =
          true;
      } catch {}
    }

    throw error;
  } finally {
    try {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    } catch {}
  }
}

/* =========================================================
   REGISTER
========================================================= */

function registerInterceptor(interceptors, type, handlerOrEntry, options = {}) {
  const cleanType =
    safeText(type, "");

  if (!isValidType(cleanType)) {
    throw new Error(
      `Tipo de interceptor inválido: ${cleanType}`
    );
  }

  const normalizedInput =
    normalizeRegistrationInput(
      handlerOrEntry,
      options,
      cleanType
    );

  const fn =
    normalizedInput.handler;

  const opts =
    normalizedInput.options;

  if (!isFn(fn)) {
    throw new Error(
      `use${cleanType[0].toUpperCase()}${cleanType.slice(1)}(fn) requiere una función`
    );
  }

  const state =
    ensureState(interceptors);

  const bucket =
    ensureBucket(
      state,
      cleanType
    );

  const id =
    safeText(
      opts.id,
      nextInterceptorId(cleanType)
    );

  const existingIndex =
    bucket.findIndex((entry) =>
      entry?.id === id
    );

  if (
    existingIndex >= 0 &&
    opts.replace !== true &&
    opts.overwrite !== true
  ) {
    const existing =
      bucket[existingIndex];

    let disposed =
      false;

    return () => {
      if (disposed) {
        return false;
      }

      disposed =
        true;

      const removed =
        removeInterceptor(
          bucket,
          existing?.id || id
        );

      if (removed) {
        state.meta.ejected =
          toNonNegativeInt(
            state.meta.ejected,
            0
          ) + 1;
      }

      return removed;
    };
  }

  if (
    existingIndex >= 0 &&
    (
      opts.replace === true ||
      opts.overwrite === true
    )
  ) {
    bucket.splice(
      existingIndex,
      1
    );

    state.meta.replaced =
      toNonNegativeInt(
        state.meta.replaced,
        0
      ) + 1;
  }

  const order =
    ++interceptorSeq;

  const entry = {
    id,

    name:
      safeText(
        opts.name,
        fn.name || id
      ),

    handler:
      fn,

    priority:
      safeNumber(
        opts.priority,
        0
      ),

    timeoutMs:
      toNonNegativeInt(
        opts.timeoutMs,
        DEFAULT_TIMEOUT_MS
      ),

    failOpen:
      opts.failOpen !== false,

    once:
      opts.once === true,

    enabled:
      opts.enabled !== false,

    order,

    createdAt:
      isoNow(),

    runCount:
      0,

    errorCount:
      0,

    timeoutCount:
      0,

    lastRunAt:
      "",

    lastDurationMs:
      0,

    lastError:
      null,

    ref:
      fn,
  };

  bucket.push(entry);

  state.meta.registered =
    toNonNegativeInt(
      state.meta.registered,
      0
    ) + 1;

  let disposed =
    false;

  return () => {
    if (disposed) {
      return false;
    }

    disposed =
      true;

    const removed =
      removeInterceptor(
        bucket,
        entry.id
      );

    if (removed) {
      state.meta.ejected =
        toNonNegativeInt(
          state.meta.ejected,
          0
        ) + 1;
    }

    return removed;
  };
}

/* =========================================================
   REGISTER API
========================================================= */

export function useRequest(interceptors, fn, options = {}) {
  return registerInterceptor(
    interceptors,
    "request",
    fn,
    options
  );
}

export function useResponse(interceptors, fn, options = {}) {
  return registerInterceptor(
    interceptors,
    "response",
    fn,
    options
  );
}

export function useError(interceptors, fn, options = {}) {
  return registerInterceptor(
    interceptors,
    "error",
    fn,
    options
  );
}

export function ejectInterceptor(interceptors, type, ref) {
  const state =
    ensureState(interceptors);

  const bucket =
    ensureBucket(
      state,
      type
    );

  const removed =
    removeInterceptor(
      bucket,
      ref
    );

  if (removed) {
    state.meta.ejected =
      toNonNegativeInt(
        state.meta.ejected,
        0
      ) + 1;
  }

  return removed;
}

export function enableInterceptor(interceptors, type, ref) {
  const state =
    ensureState(interceptors);

  const bucket =
    ensureBucket(
      state,
      type
    );

  return setInterceptorEnabled(
    bucket,
    ref,
    true
  );
}

export function disableInterceptor(interceptors, type, ref) {
  const state =
    ensureState(interceptors);

  const bucket =
    ensureBucket(
      state,
      type
    );

  return setInterceptorEnabled(
    bucket,
    ref,
    false
  );
}

/* =========================================================
   RUNTIME PATCH
========================================================= */

function patchRunSuccess(bucket, entry, startedAt) {
  const durationMs =
    nowMs() - startedAt;

  persistEntryRuntime(
    bucket,
    entry,
    {
      runCount:
        toNonNegativeInt(entry.runCount, 0) + 1,

      lastRunAt:
        isoNow(),

      lastDurationMs:
        durationMs,

      lastError:
        null,
    }
  );

  return durationMs;
}

function patchRunError(bucket, entry, startedAt, error) {
  const durationMs =
    nowMs() - startedAt;

  const timedOut =
    error?.timeout === true;

  persistEntryRuntime(
    bucket,
    entry,
    {
      errorCount:
        toNonNegativeInt(entry.errorCount, 0) + 1,

      timeoutCount:
        toNonNegativeInt(entry.timeoutCount, 0) + (timedOut ? 1 : 0),

      lastRunAt:
        isoNow(),

      lastDurationMs:
        durationMs,

      lastError:
        sanitizeError(error),
    }
  );

  return durationMs;
}

function removeOnceIfNeeded(state, type, entry) {
  if (!entry?.once) {
    return false;
  }

  try {
    return ejectInterceptor(
      state,
      type,
      entry.id
    );
  } catch {
    return false;
  }
}

/* =========================================================
   RUN REQUEST
========================================================= */

export async function runRequestInterceptors(interceptors, requestConfig) {
  const state =
    ensureState(interceptors);

  const bucket =
    ensureBucket(
      state,
      "request"
    );

  let nextConfig =
    requestConfig;

  const snapshot =
    snapshotBucket(
      bucket,
      "request"
    );

  if (!snapshot.length) {
    recordSkipped(state);
    return nextConfig;
  }

  touchRun(
    state,
    "request"
  );

  for (const entry of snapshot) {
    const startedAt =
      nowMs();

    try {
      const result =
        await runWithTimeout(
          Promise.resolve(
            entry.handler(
              nextConfig,
              {
                type:
                  "request",

                interceptor:
                  entry,
              }
            )
          ),
          entry.timeoutMs,
          `${entry.name}:request`
        );

      patchRunSuccess(
        bucket,
        entry,
        startedAt
      );

      if (
        result &&
        typeof result === "object"
      ) {
        nextConfig =
          result;
      }
    } catch (interceptorError) {
      patchRunError(
        bucket,
        entry,
        startedAt,
        interceptorError
      );

      recordError(
        state,
        "request",
        entry,
        interceptorError,
        interceptorError?.timeout === true
      );

      if (entry.failOpen === false) {
        throw interceptorError;
      }
    } finally {
      removeOnceIfNeeded(
        state,
        "request",
        entry
      );
    }
  }

  return nextConfig;
}

/* =========================================================
   RUN RESPONSE
========================================================= */

export async function runResponseInterceptors(interceptors, response, requestConfig) {
  const state =
    ensureState(interceptors);

  const bucket =
    ensureBucket(
      state,
      "response"
    );

  let nextResponse =
    response;

  const snapshot =
    snapshotBucket(
      bucket,
      "response"
    );

  if (!snapshot.length) {
    recordSkipped(state);
    return nextResponse;
  }

  touchRun(
    state,
    "response"
  );

  for (const entry of snapshot) {
    const startedAt =
      nowMs();

    try {
      const result =
        await runWithTimeout(
          Promise.resolve(
            entry.handler(
              nextResponse,
              requestConfig,
              {
                type:
                  "response",

                interceptor:
                  entry,
              }
            )
          ),
          entry.timeoutMs,
          `${entry.name}:response`
        );

      patchRunSuccess(
        bucket,
        entry,
        startedAt
      );

      if (result !== undefined) {
        nextResponse =
          result;
      }
    } catch (interceptorError) {
      patchRunError(
        bucket,
        entry,
        startedAt,
        interceptorError
      );

      recordError(
        state,
        "response",
        entry,
        interceptorError,
        interceptorError?.timeout === true
      );

      if (entry.failOpen === false) {
        throw interceptorError;
      }
    } finally {
      removeOnceIfNeeded(
        state,
        "response",
        entry
      );
    }
  }

  return nextResponse;
}

/* =========================================================
   RUN ERROR
========================================================= */

export async function runErrorInterceptors(interceptors, error, requestConfig) {
  const state =
    ensureState(interceptors);

  const bucket =
    ensureBucket(
      state,
      "error"
    );

  let nextError =
    error;

  const snapshot =
    snapshotBucket(
      bucket,
      "error"
    );

  if (!snapshot.length) {
    recordSkipped(state);
    return nextError;
  }

  touchRun(
    state,
    "error"
  );

  for (const entry of snapshot) {
    const startedAt =
      nowMs();

    try {
      const result =
        await runWithTimeout(
          Promise.resolve(
            entry.handler(
              nextError,
              requestConfig,
              {
                type:
                  "error",

                interceptor:
                  entry,
              }
            )
          ),
          entry.timeoutMs,
          `${entry.name}:error`
        );

      patchRunSuccess(
        bucket,
        entry,
        startedAt
      );

      if (result !== undefined) {
        nextError =
          result;
      }
    } catch (interceptorError) {
      patchRunError(
        bucket,
        entry,
        startedAt,
        interceptorError
      );

      recordError(
        state,
        "error",
        entry,
        interceptorError,
        interceptorError?.timeout === true
      );

      /*
        En failOpen mantenemos el error original/actual.
        No sustituimos nextError por el error del interceptor.
      */
      if (entry.failOpen === false) {
        throw interceptorError;
      }
    } finally {
      removeOnceIfNeeded(
        state,
        "error",
        entry
      );
    }
  }

  return nextError;
}

/* =========================================================
   MANAGEMENT
========================================================= */

export function clearInterceptors(interceptors, type = "") {
  const state =
    ensureState(interceptors);

  const cleanType =
    safeText(type, "");

  if (cleanType) {
    const bucket =
      ensureBucket(
        state,
        cleanType
      );

    const count =
      bucket.length;

    bucket.splice(0);

    state.meta.ejected =
      toNonNegativeInt(
        state.meta.ejected,
        0
      ) + count;

    state.meta.cleared =
      toNonNegativeInt(
        state.meta.cleared,
        0
      ) + count;

    return count;
  }

  let total =
    0;

  for (const interceptorType of INTERCEPTOR_TYPES) {
    total += clearInterceptors(
      state,
      interceptorType
    );
  }

  return total;
}

export function resetInterceptorsRuntime(interceptors) {
  const state =
    ensureState(interceptors);

  for (const type of INTERCEPTOR_TYPES) {
    const bucket =
      ensureBucket(
        state,
        type
      );

    for (const entry of bucket) {
      if (isObject(entry)) {
        entry.runCount =
          0;

        entry.errorCount =
          0;

        entry.timeoutCount =
          0;

        entry.lastRunAt =
          "";

        entry.lastDurationMs =
          0;

        entry.lastError =
          null;
      }
    }
  }

  state.meta.executed =
    0;

  state.meta.failed =
    0;

  state.meta.timedOut =
    0;

  state.meta.skipped =
    0;

  state.meta.lastRunAt =
    "";

  state.meta.lastRunType =
    "";

  state.meta.lastError =
    null;

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function serializeBucket(state, type) {
  return ensureBucket(
    state,
    type
  ).map((entry, index) => {
    const normalized =
      normalizeEntry(
        entry,
        index,
        type
      );

    return {
      id:
        normalized?.id || "",

      name:
        normalized?.name || "",

      priority:
        normalized?.priority || 0,

      timeoutMs:
        normalized?.timeoutMs || 0,

      failOpen:
        normalized?.failOpen !== false,

      once:
        normalized?.once === true,

      enabled:
        normalized?.enabled !== false,

      order:
        normalized?.order || 0,

      createdAt:
        normalized?.createdAt || "",

      runCount:
        normalized?.runCount || 0,

      errorCount:
        normalized?.errorCount || 0,

      timeoutCount:
        normalized?.timeoutCount || 0,

      lastRunAt:
        normalized?.lastRunAt || "",

      lastDurationMs:
        normalized?.lastDurationMs || 0,

      lastError:
        normalized?.lastError || null,
    };
  });
}

export function getInterceptorsSnapshot(interceptors) {
  const state =
    ensureState(interceptors);

  return {
    version:
      INTERCEPTORS_VERSION,

    counts: {
      request:
        state.request.length,

      response:
        state.response.length,

      error:
        state.error.length,
    },

    activeCounts: {
      request:
        snapshotBucket(
          state.request,
          "request"
        ).length,

      response:
        snapshotBucket(
          state.response,
          "response"
        ).length,

      error:
        snapshotBucket(
          state.error,
          "error"
        ).length,
    },

    request:
      serializeBucket(
        state,
        "request"
      ),

    response:
      serializeBucket(
        state,
        "response"
      ),

    error:
      serializeBucket(
        state,
        "error"
      ),

    meta: {
      ...state.meta,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  createInterceptorsState,

  useRequest,
  useResponse,
  useError,

  ejectInterceptor,
  enableInterceptor,
  disableInterceptor,
  clearInterceptors,
  resetInterceptorsRuntime,

  runRequestInterceptors,
  runResponseInterceptors,
  runErrorInterceptors,

  getInterceptorsSnapshot,
};
