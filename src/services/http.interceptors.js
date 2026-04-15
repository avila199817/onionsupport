/* =========================================================
   Onion SPA - HTTP Interceptors
   Archivo: src/services/http.interceptors.js

   Responsabilidades:
   - registrar interceptores request / response / error
   - ejecutar interceptores en cadena
   - permitir eject seguro
   - aislar fallos individuales
   - mantener orden FIFO
========================================================= */

import { isFn } from "./http.helpers.js";

let interceptorSeq = 0;

const INTERCEPTOR_TYPES = new Set([
  "request",
  "response",
  "error",
]);

/* =========================================================
   STATE
========================================================= */
export function createInterceptorsState() {
  return {
    request: [],
    response: [],
    error: [],
  };
}

/* =========================================================
   INTERNAL
========================================================= */
function removeInterceptor(
  bucket,
  ref
) {
  const index =
    bucket.findIndex(
      (item) =>
        item === ref ||
        item?.id === ref ||
        item?.handler === ref
    );

  if (index >= 0) {
    bucket.splice(index, 1);
    return true;
  }

  return false;
}

function ensureBucket(
  interceptors,
  type
) {
  if (
    !INTERCEPTOR_TYPES.has(type)
  ) {
    throw new Error(
      `Tipo de interceptor inválido: ${type}`
    );
  }

  if (
    !interceptors ||
    !Array.isArray(
      interceptors[type]
    )
  ) {
    throw new Error(
      `Bucket de interceptores inválido: ${type}`
    );
  }

  return interceptors[type];
}

function toFiniteNumber(
  value,
  fallback = 0
) {
  const numeric = Number(value);

  return Number.isFinite(
    numeric
  )
    ? numeric
    : fallback;
}

function toNonNegativeInt(
  value,
  fallback = 0
) {
  return Math.max(
    0,
    Math.trunc(
      toFiniteNumber(
        value,
        fallback
      )
    )
  );
}

function normalizeEntry(
  candidate,
  index = 0
) {
  if (isFn(candidate)) {
    return {
      id: `legacy_${index}`,
      name: `legacy_${index}`,
      handler: candidate,
      priority: 0,
      timeoutMs: 0,
      failOpen: true,
      once: false,
      order: index,
      ref: candidate,
    };
  }

  if (
    candidate &&
    isFn(candidate.handler)
  ) {
    return {
      id:
        candidate.id ||
        `itc_${candidate.order || index}`,
      name:
        candidate.name ||
        candidate.handler
          .name ||
        `interceptor_${index}`,
      handler:
        candidate.handler,
      priority:
        toFiniteNumber(
          candidate.priority,
          0
        ),
      timeoutMs:
        toNonNegativeInt(
          candidate.timeoutMs,
          0
        ),
      failOpen:
        candidate.failOpen !==
        false,
      once:
        candidate.once === true,
      order: toFiniteNumber(
        candidate.order,
        index
      ),
      ref: candidate,
    };
  }

  return null;
}

function sortByPriority(
  entries = []
) {
  return [...entries].sort(
    (a, b) => {
      const priorityDiff =
        (b?.priority || 0) -
        (a?.priority || 0);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return (
        (a?.order || 0) -
        (b?.order || 0)
      );
    }
  );
}

async function runWithTimeout(
  promise,
  timeoutMs,
  label
) {
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    return promise;
  }

  let timeoutId = null;

  const timeoutPromise =
    new Promise(
      (_, reject) => {
        timeoutId = setTimeout(
          () => {
            reject(
              new Error(
                `Interceptor timeout (${label})`
              )
            );
          },
          timeoutMs
        );
      }
    );

  try {
    return await Promise.race([
      promise,
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function registerInterceptor(
  interceptors,
  type,
  fn,
  options = {}
) {
  if (!isFn(fn)) {
    throw new Error(
      `use${type[0].toUpperCase()}${type.slice(1)}(fn) requiere una función`
    );
  }

  const bucket =
    ensureBucket(
      interceptors,
      type
    );

  const entry = {
    id:
      options.id ||
      `${type}_${++interceptorSeq}`,
    name:
      options.name ||
      fn.name ||
      `${type}_${interceptorSeq}`,
    handler: fn,
    priority: toFiniteNumber(
      options.priority,
      0
    ),
    timeoutMs:
      toNonNegativeInt(
        options.timeoutMs,
        0
      ),
    failOpen:
      options.failOpen !==
      false,
    once:
      options.once === true,
    order: interceptorSeq,
  };

  bucket.push(entry);

  return () =>
    removeInterceptor(
      bucket,
      entry.id
    );
}

/* =========================================================
   REGISTER
========================================================= */
export function useRequest(
  interceptors,
  fn,
  options = {}
) {
  return registerInterceptor(
    interceptors,
    "request",
    fn,
    options
  );
}

export function useResponse(
  interceptors,
  fn,
  options = {}
) {
  return registerInterceptor(
    interceptors,
    "response",
    fn,
    options
  );
}

export function useError(
  interceptors,
  fn,
  options = {}
) {
  return registerInterceptor(
    interceptors,
    "error",
    fn,
    options
  );
}

export function ejectInterceptor(
  interceptors,
  type,
  ref
) {
  const bucket =
    ensureBucket(
      interceptors,
      type
    );
  return removeInterceptor(
    bucket,
    ref
  );
}

/* =========================================================
   RUN REQUEST
========================================================= */
export async function runRequestInterceptors(
  interceptors,
  requestConfig
) {
  const bucket =
    ensureBucket(
      interceptors,
      "request"
    );

  let nextConfig =
    requestConfig;

  const snapshot =
    sortByPriority(
      bucket.map(
        normalizeEntry
      ).filter(Boolean)
    );

  for (const entry of snapshot) {
    try {
      const result =
        await runWithTimeout(
          Promise.resolve(
            entry.handler(
              nextConfig
            )
          ),
          entry.timeoutMs,
          `${entry.name}:request`
        );

      if (
        result &&
        typeof result ===
          "object"
      ) {
        nextConfig = result;
      }
    } catch (error) {
      if (!entry.failOpen) {
        throw error;
      }
    } finally {
      if (entry.once) {
        removeInterceptor(
          bucket,
          entry.ref ||
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
export async function runResponseInterceptors(
  interceptors,
  response,
  requestConfig
) {
  const bucket =
    ensureBucket(
      interceptors,
      "response"
    );

  let nextResponse =
    response;

  const snapshot =
    sortByPriority(
      bucket.map(
        normalizeEntry
      ).filter(Boolean)
    );

  for (const entry of snapshot) {
    try {
      const result =
        await runWithTimeout(
          Promise.resolve(
            entry.handler(
              nextResponse,
              requestConfig
            )
          ),
          entry.timeoutMs,
          `${entry.name}:response`
        );

      if (
        result !==
        undefined
      ) {
        nextResponse =
          result;
      }
    } catch (error) {
      if (!entry.failOpen) {
        throw error;
      }
    } finally {
      if (entry.once) {
        removeInterceptor(
          bucket,
          entry.ref ||
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
export async function runErrorInterceptors(
  interceptors,
  error,
  requestConfig
) {
  const bucket =
    ensureBucket(
      interceptors,
      "error"
    );

  let nextError = error;

  const snapshot =
    sortByPriority(
      bucket.map(
        normalizeEntry
      ).filter(Boolean)
    );

  for (const entry of snapshot) {
    try {
      const result =
        await runWithTimeout(
          Promise.resolve(
            entry.handler(
              nextError,
              requestConfig
            )
          ),
          entry.timeoutMs,
          `${entry.name}:error`
        );

      if (
        result !==
        undefined
      ) {
        nextError = result;
      }
    } catch (error) {
      if (!entry.failOpen) {
        throw error;
      }
      nextError = error;
    } finally {
      if (entry.once) {
        removeInterceptor(
          bucket,
          entry.ref ||
            entry.id
        );
      }
    }
  }

  return nextError;
}
