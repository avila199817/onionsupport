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
========================================================= */

import {
  deepClone,
  deepEqual,
} from "./helpers.js";

/* =========================================================
   INTERNAL
========================================================= */
function uniquePaths(
  changedPaths = []
) {
  return Array.from(
    new Set(
      Array.isArray(
        changedPaths
      )
        ? changedPaths.filter(
            Boolean
          )
        : []
    )
  );
}

function safeRun(
  AppCore,
  label,
  fn
) {
  try {
    fn();
  } catch (error) {
    AppCore?.utils?.error?.(
      label,
      error
    );
  }
}

function pathMatches(
  watchedPath = "",
  changedPath = ""
) {
  return (
    changedPath ===
      watchedPath ||
    changedPath.startsWith(
      `${watchedPath}.`
    ) ||
    watchedPath.startsWith(
      `${changedPath}.`
    )
  );
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
    typeof snapshot ===
    "function"
      ? snapshot()
      : snapshot;

  return {
    state: nextState,
    previousState:
      previousState ??
      null,
    changedPaths:
      uniquePaths(
        changedPaths
      ),
    timestamp:
      Date.now(),
  };
}

/* =========================================================
   SELECTOR LISTENERS
========================================================= */
export function notifySelectorListeners({
  AppCore,
  selectorListeners,
  shallowCloneRoot,
  state,
  payload,
}) {
  if (
    !selectorListeners
      ?.size
  ) {
    return;
  }

  selectorListeners.forEach(
    (entry) => {
      safeRun(
        AppCore,
        "Store selector listener error",
        () => {
          const nextValue =
            entry.selector(
              shallowCloneRoot(
                state
              )
            );

          if (
            deepEqual(
              nextValue,
              entry.lastValue
            )
          ) {
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

          entry.listener({
            ...payload,
            value:
              deepClone(
                nextValue
              ),
            previousValue,
          });
        }
      );
    }
  );
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
}) {
  const finalPayload = {
    ...payload,
    state:
      payload?.state ??
      snapshot(),
    changedPaths:
      uniquePaths(
        payload
          ?.changedPaths
      ),
    timestamp:
      payload
        ?.timestamp ??
      Date.now(),
  };

  /* =========================================
     GLOBAL LISTENERS
  ========================================= */
  listeners.forEach(
    (listener) => {
      safeRun(
        AppCore,
        "Store listener error",
        () => {
          listener(
            finalPayload
          );
        }
      );
    }
  );

  /* =========================================
     KEY LISTENERS
  ========================================= */
  if (
    finalPayload
      .changedPaths
      .length
  ) {
    Array.from(
      keyListeners.entries()
    ).forEach(
      ([
        watchedPath,
        bucket,
      ]) => {
        const matched =
          finalPayload.changedPaths.some(
            (
              changedPath
            ) =>
              pathMatches(
                watchedPath,
                changedPath
              )
          );

        if (!matched) {
          return;
        }

        bucket.forEach(
          (listener) => {
            safeRun(
              AppCore,
              `Store key listener error (${watchedPath})`,
              () => {
                listener({
                  ...finalPayload,
                  path:
                    watchedPath,
                  value:
                    deepClone(
                      get(
                        watchedPath
                      )
                    ),
                });
              }
            );
          }
        );
      }
    );
  }

  /* =========================================
     SELECTORS
  ========================================= */
  notifySelectorListeners({
    AppCore,
    selectorListeners,
    shallowCloneRoot,
    state,
    payload:
      finalPayload,
  });
}
