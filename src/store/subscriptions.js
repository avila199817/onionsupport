/* =========================================================
   Onion SPA - Store Subscriptions
   Archivo: src/store/subscriptions.js

   Responsabilidades:
   - registrar subscripciones globales
   - registrar subscripciones por path
   - registrar subscripciones por selector
   - encapsular altas y bajas de listeners del store
========================================================= */

import {
  isFunction,
  deepClone,
} from "./helpers.js";

export function subscribe(listeners, listener) {
  if (!isFunction(listener)) {
    throw new Error("subscribe(listener) requiere una función");
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function subscribeKey({
  AppCore,
  keyListeners,
  path,
  listener,
  get,
  snapshot,
  options = {},
}) {
  if (!path || !isFunction(listener)) {
    throw new Error("subscribeKey(path, listener) requiere path y función");
  }

  if (!keyListeners.has(path)) {
    keyListeners.set(path, new Set());
  }

  keyListeners.get(path).add(listener);

  if (options.immediate === true) {
    try {
      listener({
        state: snapshot(),
        previousState: null,
        changedPaths: [path],
        timestamp: Date.now(),
        value: get(path),
        path,
      });
    } catch (error) {
      AppCore.utils.error(`Store key listener immediate error (${path})`, error);
    }
  }

  return () => {
    const bucket = keyListeners.get(path);
    if (!bucket) return;

    bucket.delete(listener);

    if (bucket.size === 0) {
      keyListeners.delete(path);
    }
  };
}

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
  if (!isFunction(selector) || !isFunction(listener)) {
    throw new Error(
      "subscribeSelector(selector, listener) requiere dos funciones"
    );
  }

  const entry = {
    selector,
    listener,
    lastValue: deepClone(selector(shallowCloneRoot(state))),
  };

  selectorListeners.add(entry);

  if (options.immediate === true) {
    try {
      listener({
        state: snapshot(),
        previousState: null,
        changedPaths: [],
        timestamp: Date.now(),
        value: deepClone(entry.lastValue),
        previousValue: undefined,
      });
    } catch (error) {
      AppCore.utils.error("Store selector immediate error", error);
    }
  }

  return () => {
    selectorListeners.delete(entry);
  };
}
