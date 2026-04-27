/* =========================================================
   Onion SPA - Store Notify
   Archivo: src/store/notify.js

   Responsabilidades:
   - construir payloads consistentes del store
   - notificar listeners globales
   - notificar listeners por path
   - notificar listeners por selector
   - aislar errores de subscribers
   - evitar mutaciones accidentales
   - deduplicar paths cambiados
   - soportar listeners corruptos sin romper el store
   - mantener payloads estables
   - proteger contra mutaciones cruzadas entre subscribers

   HARDENING PRO:
   - payload clonado por subscriber
   - errores aislados
   - path matching robusto padre/hijo
   - selector diff seguro
   - snapshots defensivos
   - tolerancia a Maps/Sets corruptos
   - cero throws accidentales durante notify
========================================================= */

import {
  deepClone,
  deepEqual,
  isFunction,
} from "./helpers.js";

/* =========================================================
   BASICS
========================================================= */

function safeText(
  value,
  fallback = ""
) {
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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeSet(value) {
  return value instanceof Set
    ? value
    : new Set();
}

function safeMap(value) {
  return value instanceof Map
    ? value
    : new Map();
}

function nowMs() {
  return Date.now();
}

function safeError(
  AppCore,
  label = "Store notify error",
  error = null
) {
  try {
    AppCore?.utils?.error?.(
      label,
      error
    );

    return;
  } catch {}

  try {
    console.error(
      label,
      error
    );
  } catch {}
}

function safeRun(
  AppCore,
  label,
  fn
) {
  try {
    if (isFunction(fn)) {
      return fn();
    }
  } catch (error) {
    safeError(
      AppCore,
      label,
      error
    );
  }

  return undefined;
}

/* =========================================================
   PATH HELPERS
========================================================= */

function normalizePath(path = "") {
  return safeText(path, "")
    .split(".")
    .map((part) =>
      part.trim()
    )
    .filter(Boolean)
    .join(".");
}

function uniquePaths(
  changedPaths = []
) {
  const paths =
    safeArray(changedPaths)
      .map(normalizePath)
      .filter(Boolean);

  return Array.from(
    new Set(paths)
  );
}

/**
 * Matching bidireccional:
 *
 * watched: session
 * changed: session.user        => match
 *
 * watched: session.user
 * changed: session             => match
 *
 * watched: session.user
 * changed: ui.theme            => no match
 */
function pathMatches(
  watchedPath = "",
  changedPath = ""
) {
  const watched =
    normalizePath(watchedPath);

  const changed =
    normalizePath(changedPath);

  if (!watched || !changed) {
    return false;
  }

  return (
    changed === watched ||
    changed.startsWith(`${watched}.`) ||
    watched.startsWith(`${changed}.`)
  );
}

function anyPathMatches(
  watchedPath = "",
  changedPaths = []
) {
  return uniquePaths(changedPaths).some(
    (changedPath) =>
      pathMatches(
        watchedPath,
        changedPath
      )
  );
}

/* =========================================================
   PAYLOAD SAFETY
========================================================= */

function clonePayload(payload = {}) {
  try {
    return deepClone(payload);
  } catch {
    return {
      ...payload,
      state:
        deepClone(payload?.state),
      previousState:
        deepClone(payload?.previousState),
      changedPaths:
        uniquePaths(payload?.changedPaths),
    };
  }
}

function freezePayload(payload = {}) {
  try {
    Object.freeze(payload.changedPaths);
  } catch {}

  try {
    Object.freeze(payload);
  } catch {}

  return payload;
}

function buildSubscriberPayload(payload = {}, extra = {}) {
  return freezePayload({
    ...clonePayload(payload),
    ...deepClone(extra),
  });
}

/* =========================================================
   PAYLOAD
========================================================= */

export function buildPayload(
  snapshot,
  changedPaths = [],
  previousState = null
) {
  const nextState =
    isFunction(snapshot)
      ? snapshot()
      : snapshot;

  return freezePayload({
    state:
      deepClone(nextState),

    previousState:
      previousState
        ? deepClone(previousState)
        : null,

    changedPaths:
      uniquePaths(changedPaths),

    timestamp:
      nowMs(),
  });
}

/* =========================================================
   GLOBAL LISTENERS
========================================================= */

export function notifyGlobalListeners({
  AppCore,
  listeners,
  payload,
} = {}) {
  const bucket =
    safeSet(listeners);

  if (!bucket.size) {
    return 0;
  }

  let notified = 0;

  Array.from(bucket).forEach((listener) => {
    if (!isFunction(listener)) {
      return;
    }

    safeRun(
      AppCore,
      "Store listener error",
      () => {
        listener(
          buildSubscriberPayload(payload)
        );

        notified += 1;
      }
    );
  });

  return notified;
}

/* =========================================================
   KEY LISTENERS
========================================================= */

export function notifyKeyListeners({
  AppCore,
  keyListeners,
  get,
  payload,
} = {}) {
  const map =
    safeMap(keyListeners);

  if (
    !map.size ||
    !isFunction(get)
  ) {
    return 0;
  }

  const changedPaths =
    uniquePaths(payload?.changedPaths);

  if (!changedPaths.length) {
    return 0;
  }

  let notified = 0;

  Array.from(map.entries()).forEach(
    ([
      watchedPath,
      bucket,
    ]) => {
      const path =
        normalizePath(watchedPath);

      if (!path) {
        return;
      }

      if (
        !anyPathMatches(
          path,
          changedPaths
        )
      ) {
        return;
      }

      safeSet(bucket).forEach((listener) => {
        if (!isFunction(listener)) {
          return;
        }

        safeRun(
          AppCore,
          `Store key listener error (${path})`,
          () => {
            listener(
              buildSubscriberPayload(
                payload,
                {
                  path,
                  value:
                    deepClone(
                      get(path)
                    ),
                }
              )
            );

            notified += 1;
          }
        );
      });
    }
  );

  return notified;
}

/* =========================================================
   SELECTOR LISTENERS
========================================================= */

function resolveSelectorState({
  shallowCloneRoot,
  state,
}) {
  if (isFunction(shallowCloneRoot)) {
    return shallowCloneRoot(state);
  }

  return {
    ...(state || {}),
  };
}

function getSelectorEquality(entry = {}) {
  if (
    isFunction(entry.equalityFn)
  ) {
    return entry.equalityFn;
  }

  if (
    isFunction(entry.compare)
  ) {
    return entry.compare;
  }

  return deepEqual;
}

export function notifySelectorListeners({
  AppCore,
  selectorListeners,
  shallowCloneRoot,
  state,
  payload,
} = {}) {
  const bucket =
    safeSet(selectorListeners);

  if (!bucket.size) {
    return 0;
  }

  let notified = 0;

  Array.from(bucket).forEach((entry) => {
    if (
      !entry ||
      !isFunction(entry.selector) ||
      !isFunction(entry.listener)
    ) {
      return;
    }

    safeRun(
      AppCore,
      "Store selector listener error",
      () => {
        const selectorState =
          resolveSelectorState({
            shallowCloneRoot,
            state,
          });

        const nextValue =
          entry.selector(
            selectorState
          );

        const equalityFn =
          getSelectorEquality(entry);

        const unchanged =
          equalityFn(
            nextValue,
            entry.lastValue
          );

        if (unchanged) {
          return;
        }

        const previousValue =
          deepClone(
            entry.lastValue
          );

        entry.lastValue =
          deepClone(
            nextValue
          );

        entry.listener(
          buildSubscriberPayload(
            payload,
            {
              value:
                deepClone(nextValue),
              previousValue,
            }
          )
        );

        notified += 1;
      }
    );
  });

  return notified;
}

/* =========================================================
   FINAL PAYLOAD
========================================================= */

function normalizeFinalPayload({
  payload,
  snapshot,
} = {}) {
  const state =
    payload?.state ??
    (
      isFunction(snapshot)
        ? snapshot()
        : null
    );

  return freezePayload({
    ...deepClone(payload || {}),

    state:
      deepClone(state),

    previousState:
      payload?.previousState
        ? deepClone(payload.previousState)
        : null,

    changedPaths:
      uniquePaths(
        payload?.changedPaths
      ),

    timestamp:
      payload?.timestamp ||
      nowMs(),
  });
}

/* =========================================================
   MAIN NOTIFY
========================================================= */

export function notify({
  AppCore,
  listeners,
  keyListeners,
  selectorListeners,
  get,
  snapshot,
  shallowCloneRoot,
  state,
  payload,
} = {}) {
  const finalPayload =
    normalizeFinalPayload({
      payload,
      snapshot,
    });

  const globalCount =
    notifyGlobalListeners({
      AppCore,
      listeners,
      payload:
        finalPayload,
    });

  const keyCount =
    notifyKeyListeners({
      AppCore,
      keyListeners,
      get,
      payload:
        finalPayload,
    });

  const selectorCount =
    notifySelectorListeners({
      AppCore,
      selectorListeners,
      shallowCloneRoot,
      state,
      payload:
        finalPayload,
    });

  try {
    AppCore?.events?.emit?.(
      "store:notify",
      {
        changedPaths:
          finalPayload.changedPaths,
        globalListeners:
          globalCount,
        keyListeners:
          keyCount,
        selectorListeners:
          selectorCount,
        timestamp:
          finalPayload.timestamp,
      }
    );
  } catch {}

  return {
    ok: true,
    globalListeners:
      globalCount,
    keyListeners:
      keyCount,
    selectorListeners:
      selectorCount,
    changedPaths:
      finalPayload.changedPaths,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  buildPayload,

  notifyGlobalListeners,
  notifyKeyListeners,
  notifySelectorListeners,

  notify,
};
