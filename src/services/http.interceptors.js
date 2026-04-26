/* =========================================================
   Onion SPA - HTTP Interceptors
   Archivo: src/services/http.interceptors.js

   Responsabilidades:
   - registrar interceptores request / response / error
   - ejecutar interceptores en cadena
   - permitir eject seguro
   - aislar fallos individuales
   - mantener orden FIFO por defecto
   - soportar prioridad, once y timeout
   - exponer snapshot debug

   HARDENING EXTREMO:
   - register idempotente opcional por id
   - disposer seguro
   - buckets autocurables
   - errores aislados si failOpen !== false
   - timeout por interceptor
   - prioridad descendente + FIFO estable
   - compatible con funciones legacy
   - compatible con entradas { handler }
   - sin mutar snapshot durante ejecución
========================================================= */

import { isFn } from "./http.helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const INTERCEPTORS_VERSION =
  "10.0.0";

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
  return Date.now();
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function noopDisposer() {
  return false;
}

function isValidType(type = "") {
  return INTERCEPTOR_TYPES.includes(type);
}

/* =========================================================
   STATE
========================================================= */

export function createInterceptorsState() {
  return {
    request:
      [],

    response:
      [],

    error:
      [],

    meta: {
      version:
        INTERCEPTORS_VERSION,

      createdAt:
        isoNow(),

      registered:
        0,

      ejected:
        0,

      executed:
        0,

      failed:
        0,

      timedOut:
        0,

      lastRunAt:
        "",

      lastError:
        null,
    },
  };
}

/* =========================================================
   INTERNAL STATE HELPERS
========================================================= */

function ensureState(interceptors) {
  if (!isObject(interceptors)) {
    return createInterceptorsState();
  }

  for (const type of INTERCEPTOR_TYPES) {
    if (!Array.isArray(interceptors[type])) {
      interceptors[type] = [];
    }
  }

  if (!isObject(interceptors.meta)) {
    interceptors.meta = {
      version:
        INTERCEPTORS_VERSION,

      createdAt:
        isoNow(),

      registered:
        0,

      ejected:
        0,

      executed:
        0,

      failed:
        0,

      timedOut:
        0,

      lastRunAt:
        "",

      lastError:
        null,
    };
  }

  return interceptors;
}

function ensureBucket(interceptors, type) {
  const state =
    ensureState(interceptors);

  if (!isValidType(type)) {
    throw new Error(
      `Tipo de interceptor inválido: ${type}`
    );
  }

  if (!Array.isArray(state[type])) {
    state[type] = [];
  }

  return state[type];
}

function recordError(interceptors, type, entry, error, timedOut = false) {
  const state =
    ensureState(interceptors);

  state.meta.failed += 1;

  if (timedOut) {
    state.meta.timedOut += 1;
  }

  state.meta.lastError = {
    type:
      safeText(type, ""),

    interceptorId:
      entry?.id || "",

    interceptorName:
      entry?.name || "",

    message:
      safeText(
        error?.message || error,
        "Interceptor error."
      ),

    timedOut:
      Boolean(timedOut),

    at:
      isoNow(),
  };
}

function touchRun(interceptors) {
  const state =
    ensureState(interceptors);

  state.meta.executed += 1;
  state.meta.lastRunAt =
    isoNow();
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeEntry(candidate, index = 0, type = "request") {
  if (isFn(candidate)) {
    return {
      id:
        `legacy_${type}_${index}`,

      name:
        candidate.name ||
        `legacy_${type}_${index}`,

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

      lastRunAt:
        "",

      lastDurationMs:
        0,

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
          `itc_${type}_${candidate.order || index}`
        ),

      name:
        safeText(
          candidate.name,
          candidate.handler.name ||
            `interceptor_${type}_${index}`
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

      lastRunAt:
        candidate.lastRunAt || "",

      lastDurationMs:
        toNonNegativeInt(
          candidate.lastDurationMs,
          0
        ),

      ref:
        candidate.ref || candidate,
    };
  }

  return null;
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
  if (!entry?.id) {
    return false;
  }

  const target =
    bucket.find((item) =>
      item?.id === entry.id ||
      item === entry.ref ||
      item?.handler === entry.handler
    );

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
      if (item === ref) {
        return true;
      }

      if (item?.id === ref) {
        return true;
      }

      if (item?.name === ref) {
        return true;
      }

      if (item?.handler === ref) {
        return true;
      }

      if (item?.ref === ref) {
        return true;
      }

      return false;
    });

  if (index >= 0) {
    bucket.splice(index, 1);
    return true;
  }

  return false;
}

/* =========================================================
   TIMEOUT
========================================================= */

async function runWithTimeout(promise, timeoutMs, label) {
  const finalTimeout =
    toNonNegativeInt(timeoutMs, 0);

  if (finalTimeout <= 0) {
    return promise;
  }

  let timeoutId =
    null;

  let didTimeout =
    false;

  const timeoutPromise =
    new Promise((_, reject) => {
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
    });

  try {
    return await Promise.race([
      promise,
      timeoutPromise,
    ]);
  } catch (error) {
    if (didTimeout) {
      error.timeout =
        true;
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/* =========================================================
   REGISTER
========================================================= */

function registerInterceptor(interceptors, type, fn, options = {}) {
  if (!isValidType(type)) {
    throw new Error(
      `Tipo de interceptor inválido: ${type}`
    );
  }

  if (!isFn(fn)) {
    throw new Error(
      `use${type[0].toUpperCase()}${type.slice(1)}(fn) requiere una función`
    );
  }

  const state =
    ensureState(interceptors);

  const bucket =
    ensureBucket(
      state,
      type
    );

  const opts =
    isObject(options)
      ? options
      : {};

  const id =
    safeText(
      opts.id,
      `${type}_${++interceptorSeq}`
    );

  const existing =
    bucket.find((entry) =>
      entry?.id === id
    );

  if (existing && opts.replace !== true) {
    return () =>
      removeInterceptor(
        bucket,
        id
      );
  }

  if (existing && opts.replace === true) {
    removeInterceptor(
      bucket,
      id
    );
  }

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

    order:
      ++interceptorSeq,

    createdAt:
      isoNow(),

    runCount:
      0,

    errorCount:
      0,

    lastRunAt:
      "",

    lastDurationMs:
      0,

    ref:
      fn,
  };

  bucket.push(entry);

  state.meta.registered += 1;

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
      state.meta.ejected += 1;
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
    state.meta.ejected += 1;
  }

  return removed;
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

  touchRun(state);

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

      const durationMs =
        nowMs() - startedAt;

      persistEntryRuntime(
        bucket,
        entry,
        {
          runCount:
            entry.runCount + 1,

          lastRunAt:
            isoNow(),

          lastDurationMs:
            durationMs,
        }
      );

      if (
        result &&
        typeof result === "object"
      ) {
        nextConfig =
          result;
      }
    } catch (interceptorError) {
      recordError(
        state,
        "request",
        entry,
        interceptorError,
        interceptorError?.timeout === true
      );

      persistEntryRuntime(
        bucket,
        entry,
        {
          errorCount:
            entry.errorCount + 1,

          lastRunAt:
            isoNow(),

          lastDurationMs:
            nowMs() - startedAt,
        }
      );

      if (!entry.failOpen) {
        throw interceptorError;
      }
    } finally {
      if (entry.once) {
        ejectInterceptor(
          state,
          "request",
          entry.id
        );
      }
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

  touchRun(state);

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

      const durationMs =
        nowMs() - startedAt;

      persistEntryRuntime(
        bucket,
        entry,
        {
          runCount:
            entry.runCount + 1,

          lastRunAt:
            isoNow(),

          lastDurationMs:
            durationMs,
        }
      );

      if (result !== undefined) {
        nextResponse =
          result;
      }
    } catch (interceptorError) {
      recordError(
        state,
        "response",
        entry,
        interceptorError,
        interceptorError?.timeout === true
      );

      persistEntryRuntime(
        bucket,
        entry,
        {
          errorCount:
            entry.errorCount + 1,

          lastRunAt:
            isoNow(),

          lastDurationMs:
            nowMs() - startedAt,
        }
      );

      if (!entry.failOpen) {
        throw interceptorError;
      }
    } finally {
      if (entry.once) {
        ejectInterceptor(
          state,
          "response",
          entry.id
        );
      }
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

  touchRun(state);

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

      const durationMs =
        nowMs() - startedAt;

      persistEntryRuntime(
        bucket,
        entry,
        {
          runCount:
            entry.runCount + 1,

          lastRunAt:
            isoNow(),

          lastDurationMs:
            durationMs,
        }
      );

      if (result !== undefined) {
        nextError =
          result;
      }
    } catch (interceptorError) {
      recordError(
        state,
        "error",
        entry,
        interceptorError,
        interceptorError?.timeout === true
      );

      persistEntryRuntime(
        bucket,
        entry,
        {
          errorCount:
            entry.errorCount + 1,

          lastRunAt:
            isoNow(),

          lastDurationMs:
            nowMs() - startedAt,
        }
      );

      /*
        Importante:
        En failOpen mantenemos el error original/actual.
        No sustituimos nextError por el error del interceptor.
      */
      if (!entry.failOpen) {
        throw interceptorError;
      }
    } finally {
      if (entry.once) {
        ejectInterceptor(
          state,
          "error",
          entry.id
        );
      }
    }
  }

  return nextError;
}

/* =========================================================
   DEBUG / MANAGEMENT
========================================================= */

export function clearInterceptors(interceptors, type = "") {
  const state =
    ensureState(interceptors);

  if (type) {
    const bucket =
      ensureBucket(
        state,
        type
      );

    const count =
      bucket.length;

    bucket.splice(0);

    state.meta.ejected += count;

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

export function getInterceptorsSnapshot(interceptors) {
  const state =
    ensureState(interceptors);

  function serialize(type) {
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

        lastRunAt:
          normalized?.lastRunAt || "",

        lastDurationMs:
          normalized?.lastDurationMs || 0,
      };
    });
  }

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

    request:
      serialize("request"),

    response:
      serialize("response"),

    error:
      serialize("error"),

    meta: {
      ...state.meta,
    },
  };
}

export default {
  createInterceptorsState,

  useRequest,
  useResponse,
  useError,

  ejectInterceptor,
  clearInterceptors,

  runRequestInterceptors,
  runResponseInterceptors,
  runErrorInterceptors,

  getInterceptorsSnapshot,
};
