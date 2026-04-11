/* =========================================================
   Onion SPA - Store Notify
   Archivo: src/store/notify.js

   Responsabilidades:
   - construir payloads de cambio del store
   - notificar listeners globales
   - notificar listeners por path
   - notificar listeners por selector
========================================================= */

import {
  deepClone,
  deepEqual,
} from "./helpers.js";

export function buildPayload(snapshot, changedPaths = [], previousState = null) {
  return {
    state: snapshot(),
    previousState,
    changedPaths: Array.from(new Set(changedPaths)).filter(Boolean),
    timestamp: Date.now(),
  };
}

export function notifySelectorListeners({
  AppCore,
  selectorListeners,
  shallowCloneRoot,
  state,
  payload,
}) {
  selectorListeners.forEach((entry) => {
    try {
      const nextValue = entry.selector(shallowCloneRoot(state));

      if (deepEqual(nextValue, entry.lastValue)) {
        return;
      }

      const previousValue = deepClone(entry.lastValue);
      entry.lastValue = deepClone(nextValue);

      entry.listener({
        ...payload,
        value: nextValue,
        previousValue,
      });
    } catch (error) {
      AppCore.utils.error("Store selector listener error", error);
    }
  });
}

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
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (error) {
      AppCore.utils.error("Store listener error", error);
    }
  });

  if (payload?.changedPaths?.length) {
    Array.from(keyListeners.entries()).forEach(([watchedPath, bucket]) => {
      const matched = payload.changedPaths.some((changedPath) => {
        return (
          changedPath === watchedPath ||
          changedPath.startsWith(`${watchedPath}.`) ||
          watchedPath.startsWith(`${changedPath}.`)
        );
      });

      if (!matched) return;

      bucket.forEach((listener) => {
        try {
          listener({
            ...payload,
            value: get(watchedPath),
            path: watchedPath,
          });
        } catch (error) {
          AppCore.utils.error(
            `Store key listener error (${watchedPath})`,
            error
          );
        }
      });
    });
  }

  notifySelectorListeners({
    AppCore,
    selectorListeners,
    shallowCloneRoot,
    state,
    payload,
  });
}
