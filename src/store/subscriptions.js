/* =========================================================
   Onion SPA - Store Subscriptions
   Archivo: src/store/subscriptions.js

   Responsabilidades:
   - registrar subscripciones globales
   - registrar subscripciones por path
   - registrar subscripciones por selector
   - encapsular altas / bajas seguras
   - soporte immediate inicial
========================================================= */

import {
  isFunction,
  deepClone,
} from "./helpers.js";

/* =========================================================
   INTERNAL
========================================================= */
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

/* =========================================================
   GLOBAL
========================================================= */
export function subscribe(
  listeners,
  listener
) {
  if (
    !isFunction(
      listener
    )
  ) {
    throw new Error(
      "subscribe(listener) requiere una función"
    );
  }

  listeners.add(
    listener
  );

  return () => {
    listeners.delete(
      listener
    );
  };
}

/* =========================================================
   KEY / PATH
========================================================= */
export function subscribeKey({
  AppCore,
  keyListeners,
  path,
  listener,
  get,
  snapshot,
  options = {},
}) {
  if (
    !path ||
    !isFunction(
      listener
    )
  ) {
    throw new Error(
      "subscribeKey(path, listener) requiere path y función"
    );
  }

  const watchedPath =
    String(path)
      .trim();

  if (
    !keyListeners.has(
      watchedPath
    )
  ) {
    keyListeners.set(
      watchedPath,
      new Set()
    );
  }

  const bucket =
    keyListeners.get(
      watchedPath
    );

  bucket.add(
    listener
  );

  if (
    options.immediate ===
    true
  ) {
    safeRun(
      AppCore,
      `Store key listener immediate error (${watchedPath})`,
      () => {
        listener({
          state:
            snapshot(),
          previousState:
            null,
          changedPaths:
            [
              watchedPath,
            ],
          timestamp:
            Date.now(),
          value:
            deepClone(
              get(
                watchedPath
              )
            ),
          path:
            watchedPath,
        });
      }
    );
  }

  return () => {
    const currentBucket =
      keyListeners.get(
        watchedPath
      );

    if (
      !currentBucket
    ) {
      return;
    }

    currentBucket.delete(
      listener
    );

    if (
      currentBucket.size ===
      0
    ) {
      keyListeners.delete(
        watchedPath
      );
    }
  };
}

/* =========================================================
   SELECTOR
========================================================= */
export function subscribeSelector({
  AppCore,
  selectorListeners,
  selector,
  listener,
  snapshot,
  shallowCloneRoot,
  state,
  options = {},
}) {
  if (
    !isFunction(
      selector
    ) ||
    !isFunction(
      listener
    )
  ) {
    throw new Error(
      "subscribeSelector(selector, listener) requiere dos funciones"
    );
  }

  const entry = {
    selector,
    listener,
    lastValue:
      deepClone(
        selector(
          shallowCloneRoot(
            state
          )
        )
      ),
  };

  selectorListeners.add(
    entry
  );

  if (
    options.immediate ===
    true
  ) {
    safeRun(
      AppCore,
      "Store selector immediate error",
      () => {
        listener({
          state:
            snapshot(),
          previousState:
            null,
          changedPaths:
            [],
          timestamp:
            Date.now(),
          value:
            deepClone(
              entry.lastValue
            ),
          previousValue:
            undefined,
        });
      }
    );
  }

  return () => {
    selectorListeners.delete(
      entry
    );
  };
}
