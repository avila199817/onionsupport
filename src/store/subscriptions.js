/* =========================================================
   Onion SPA - Store Subscriptions
   Archivo: src/store/subscriptions.js

   Responsabilidades:
   - registrar subscripciones globales
   - registrar subscripciones por path
   - registrar subscripciones por selector
   - encapsular altas / bajas seguras
   - soporte immediate inicial
   - soporte once
   - soporte comparador custom para selectors
   - aislar errores de listeners/selectors
   - evitar unsubscribe doble problemático
   - snapshots desacoplados
   - hardening total para Store reactivo
========================================================= */

import {
  isFunction,
  deepClone,
  deepEqual,
} from "./helpers.js";

/* =========================================================
   INTERNAL
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

function safeBool(value) {
  return value === true;
}

function safeRun(
  AppCore,
  label,
  fn,
  fallback = undefined
) {
  try {
    if (
      typeof fn !== "function"
    ) {
      return fallback;
    }

    return fn();
  } catch (error) {
    try {
      AppCore?.utils?.error?.(
        label,
        error
      );
    } catch {}

    try {
      console.error(
        label,
        error
      );
    } catch {}

    return fallback;
  }
}

function safeClone(value) {
  try {
    return deepClone(value);
  } catch {
    return value;
  }
}

function normalizePath(path = "") {
  return safeText(path, "")
    .split(".")
    .map((part) =>
      safeText(part, "")
    )
    .filter(Boolean)
    .join(".");
}

function normalizeOptions(options = {}) {
  const opts =
    options &&
    typeof options === "object"
      ? options
      : {};

  return {
    immediate:
      opts.immediate === true ||
      opts.fireImmediately === true,

    once:
      opts.once === true,

    label:
      safeText(
        opts.label,
        ""
      ),

    equalityFn:
      isFunction(opts.equalityFn)
        ? opts.equalityFn
        : null,
  };
}

function buildBasePayload({
  snapshot,
  changedPaths = [],
  previousState = null,
} = {}) {
  return {
    state:
      isFunction(snapshot)
        ? snapshot()
        : null,

    previousState:
      previousState || null,

    changedPaths:
      Array.isArray(changedPaths)
        ? [...changedPaths]
        : [],

    timestamp:
      Date.now(),
  };
}

function callListener({
  AppCore,
  listener,
  payload,
  label = "Store listener error",
  once = false,
  unsubscribe = null,
} = {}) {
  safeRun(
    AppCore,
    label,
    () => {
      listener(payload);
    }
  );

  if (
    once &&
    isFunction(unsubscribe)
  ) {
    unsubscribe();
  }
}

function computeSelectorValue({
  AppCore,
  selector,
  shallowCloneRoot,
  state,
  label = "Store selector error",
} = {}) {
  return safeRun(
    AppCore,
    label,
    () =>
      selector(
        shallowCloneRoot(state)
      ),
    undefined
  );
}

function areSelectorValuesEqual(
  previousValue,
  nextValue,
  equalityFn = null
) {
  if (isFunction(equalityFn)) {
    try {
      return Boolean(
        equalityFn(
          previousValue,
          nextValue
        )
      );
    } catch {
      return false;
    }
  }

  return deepEqual(
    previousValue,
    nextValue
  );
}

/* =========================================================
   GLOBAL
========================================================= */

export function subscribe(
  listeners,
  listener,
  options = {}
) {
  if (
    !listeners ||
    typeof listeners.add !== "function" ||
    typeof listeners.delete !== "function"
  ) {
    throw new Error(
      "subscribe(listener) requiere un registry Set válido"
    );
  }

  if (
    !isFunction(listener)
  ) {
    throw new Error(
      "subscribe(listener) requiere una función"
    );
  }

  const opts =
    normalizeOptions(options);

  let active = true;

  const wrappedListener = (payload) => {
    if (!active) {
      return;
    }

    listener(payload);

    if (opts.once) {
      unsubscribe();
    }
  };

  function unsubscribe() {
    if (!active) {
      return false;
    }

    active = false;

    try {
      listeners.delete(
        wrappedListener
      );
    } catch {}

    return true;
  }

  listeners.add(
    wrappedListener
  );

  return unsubscribe;
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
  const watchedPath =
    normalizePath(path);

  if (
    !watchedPath ||
    !isFunction(listener)
  ) {
    throw new Error(
      "subscribeKey(path, listener) requiere path y función"
    );
  }

  if (
    !keyListeners ||
    typeof keyListeners.has !== "function" ||
    typeof keyListeners.set !== "function" ||
    typeof keyListeners.get !== "function" ||
    typeof keyListeners.delete !== "function"
  ) {
    throw new Error(
      "subscribeKey requiere keyListeners Map válido"
    );
  }

  if (
    !isFunction(get) ||
    !isFunction(snapshot)
  ) {
    throw new Error(
      "subscribeKey requiere get() y snapshot() válidos"
    );
  }

  const opts =
    normalizeOptions(options);

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

  let active = true;

  function unsubscribe() {
    if (!active) {
      return false;
    }

    active = false;

    const currentBucket =
      keyListeners.get(
        watchedPath
      );

    if (!currentBucket) {
      return true;
    }

    try {
      currentBucket.delete(
        wrappedListener
      );
    } catch {}

    if (
      currentBucket.size === 0
    ) {
      try {
        keyListeners.delete(
          watchedPath
        );
      } catch {}
    }

    return true;
  }

  const wrappedListener = (payload = {}) => {
    if (!active) {
      return;
    }

    callListener({
      AppCore,
      listener,
      once: opts.once,
      unsubscribe,
      label:
        opts.label ||
        `Store key listener error (${watchedPath})`,
      payload: {
        ...payload,

        path:
          watchedPath,

        value:
          safeClone(
            get(watchedPath)
          ),
      },
    });
  };

  bucket.add(
    wrappedListener
  );

  if (opts.immediate) {
    const immediatePayload = {
      ...buildBasePayload({
        snapshot,
        changedPaths: [
          watchedPath,
        ],
        previousState: null,
      }),

      path:
        watchedPath,

      value:
        safeClone(
          get(watchedPath)
        ),
    };

    callListener({
      AppCore,
      listener,
      once: opts.once,
      unsubscribe,
      label:
        opts.label ||
        `Store key listener immediate error (${watchedPath})`,
      payload:
        immediatePayload,
    });
  }

  return unsubscribe;
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
    !isFunction(selector) ||
    !isFunction(listener)
  ) {
    throw new Error(
      "subscribeSelector(selector, listener) requiere dos funciones"
    );
  }

  if (
    !selectorListeners ||
    typeof selectorListeners.add !== "function" ||
    typeof selectorListeners.delete !== "function"
  ) {
    throw new Error(
      "subscribeSelector requiere selectorListeners Set válido"
    );
  }

  if (
    !isFunction(snapshot) ||
    !isFunction(shallowCloneRoot)
  ) {
    throw new Error(
      "subscribeSelector requiere snapshot() y shallowCloneRoot() válidos"
    );
  }

  const opts =
    normalizeOptions(options);

  let active = true;

  const initialValue =
    computeSelectorValue({
      AppCore,
      selector,
      shallowCloneRoot,
      state,
      label:
        opts.label ||
        "Store selector initial error",
    });

  const entry = {
    selector,
    listener,
    equalityFn:
      opts.equalityFn,

    active: true,

    lastValue:
      safeClone(
        initialValue
      ),
  };

  function unsubscribe() {
    if (!active) {
      return false;
    }

    active = false;
    entry.active = false;

    try {
      selectorListeners.delete(
        entry
      );
    } catch {}

    return true;
  }

  selectorListeners.add(
    entry
  );

  if (opts.immediate) {
    const payload = {
      ...buildBasePayload({
        snapshot,
        changedPaths: [],
        previousState: null,
      }),

      value:
        safeClone(
          entry.lastValue
        ),

      previousValue:
        undefined,
    };

    callListener({
      AppCore,
      listener,
      once: opts.once,
      unsubscribe,
      label:
        opts.label ||
        "Store selector immediate error",
      payload,
    });
  }

  return unsubscribe;
}

/* =========================================================
   SELECTOR NOTIFY HELPER
   Nota:
   - Este helper queda exportado por si quieres mover aquí
     notifySelectorListeners desde notify.js más adelante.
   - No rompe compatibilidad con el notify.js actual.
========================================================= */

export function shouldNotifySelectorEntry(
  entry,
  nextValue
) {
  if (
    !entry ||
    entry.active === false
  ) {
    return false;
  }

  return !areSelectorValuesEqual(
    entry.lastValue,
    nextValue,
    entry.equalityFn || null
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  subscribe,
  subscribeKey,
  subscribeSelector,
  shouldNotifySelectorEntry,
};
