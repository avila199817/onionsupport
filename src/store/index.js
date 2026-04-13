/* =========================================================
   Onion SPA - Reactive Store (FULL PRO SAAS PANEL)
   Archivo: src/store/store.js

   Responsabilidades:
   - estado global reactivo
   - subscripciones globales y por clave
   - acciones centralizadas
   - sync fino con AppCore
   - selectores seguros
   - actualización inmutable por slices
   - helpers de colecciones
   - prevención de notificaciones inútiles
   - init idempotente
========================================================= */

import { AppCore } from "../core/index.js";

import {
  isFunction,
  deepClone,
  deepEqual,
  getByPath,
  setByPath,
  deleteByPath,
  mergeDeep,
  collectChangedPaths,
} from "./helpers.js";

import {
  touchMeta,
  buildInitialState,
  shallowCloneRoot,
} from "./state.js";

import {
  buildPayload,
  notify,
} from "./notify.js";

import {
  subscribe as createSubscription,
  subscribeKey as createKeySubscription,
  subscribeSelector as createSelectorSubscription,
} from "./subscriptions.js";

import { createSelectors } from "./selectors.js";
import { createActions } from "./actions.js";

import {
  bindCoreEvents,
  unbindCoreEvents,
} from "./core-sync.js";

export const Store = (() => {
  "use strict";

  let initialized = false;

  /* =========================================================
     ESTADO INTERNO
  ========================================================= */
  const state =
    buildInitialState(
      AppCore
    );

  /* =========================================================
     LISTENERS
  ========================================================= */
  const listeners =
    new Set();

  const keyListeners =
    new Map();

  const selectorListeners =
    new Set();

  const coreUnsubscribers =
    [];

  /* =========================================================
     READ HELPERS
  ========================================================= */
  function snapshot() {
    return deepClone(state);
  }

  function get(
    path = null,
    fallback = undefined
  ) {
    if (!path) {
      return shallowCloneRoot(
        state
      );
    }

    const value =
      getByPath(
        state,
        path
      );

    return value ===
      undefined
      ? fallback
      : value;
  }

  function select(
    selector,
    fallback = undefined
  ) {
    if (
      !isFunction(selector)
    ) {
      throw new Error(
        "select(selector) requiere una función"
      );
    }

    try {
      const result =
        selector(
          shallowCloneRoot(
            state
          )
        );

      return result ===
        undefined
        ? fallback
        : result;
    } catch (error) {
      AppCore.utils.error(
        "Store select error",
        error
      );

      return fallback;
    }
  }

  /* =========================================================
     INTERNAL NOTIFY
  ========================================================= */
  function emitChange(
    changedPaths = [],
    previousState = {}
  ) {
    notify({
      AppCore,
      listeners,
      keyListeners,
      selectorListeners,
      get,
      snapshot,
      shallowCloneRoot,
      state,
      payload:
        buildPayload(
          snapshot,
          changedPaths,
          previousState
        ),
    });
  }

  /* =========================================================
     WRITE API
  ========================================================= */
  function set(
    path,
    value
  ) {
    if (!path) {
      throw new Error(
        "Store.set(path, value) requiere path"
      );
    }

    const currentValue =
      get(path);

    if (
      deepEqual(
        currentValue,
        value
      )
    ) {
      return currentValue;
    }

    const previousState =
      snapshot();

    setByPath(
      state,
      path,
      deepClone(value)
    );

    touchMeta(state);

    emitChange(
      [path],
      previousState
    );

    return get(path);
  }

  function patch(
    partialState = {}
  ) {
    if (
      partialState ===
        null ||
      typeof partialState !==
        "object" ||
      Array.isArray(
        partialState
      )
    ) {
      throw new Error(
        "Store.patch(partialState) requiere un objeto"
      );
    }

    const previousState =
      snapshot();

    const nextState =
      mergeDeep(
        state,
        partialState
      );

    if (
      deepEqual(
        state,
        nextState
      )
    ) {
      return shallowCloneRoot(
        state
      );
    }

    Object.keys(
      state
    ).forEach((key) => {
      if (
        !(key in nextState)
      ) {
        delete state[key];
      }
    });

    Object.keys(
      nextState
    ).forEach((key) => {
      state[key] =
        nextState[key];
    });

    touchMeta(state);

    emitChange(
      collectChangedPaths(
        partialState
      ),
      previousState
    );

    return shallowCloneRoot(
      state
    );
  }

  function update(
    path,
    updater
  ) {
    if (
      !path ||
      !isFunction(
        updater
      )
    ) {
      throw new Error(
        "update(path, updater) requiere path y función"
      );
    }

    const currentValue =
      get(path);

    const nextValue =
      updater(
        deepClone(
          currentValue
        )
      );

    return set(
      path,
      nextValue
    );
  }

  function remove(
    path
  ) {
    if (!path) {
      throw new Error(
        "Store.remove(path) requiere path"
      );
    }

    const currentValue =
      get(path);

    if (
      currentValue ===
      undefined
    ) {
      return false;
    }

    const previousState =
      snapshot();

    deleteByPath(
      state,
      path
    );

    touchMeta(state);

    emitChange(
      [path],
      previousState
    );

    return true;
  }

  function reset() {
    const previousState =
      snapshot();

    const next =
      buildInitialState(
        AppCore
      );

    Object.keys(
      state
    ).forEach((key) => {
      delete state[key];
    });

    Object.keys(
      next
    ).forEach((key) => {
      state[key] =
        next[key];
    });

    touchMeta(state);

    emitChange(
      [
        "app",
        "session",
        "ui",
        "entities",
        "flags",
        "meta",
      ],
      previousState
    );

    return shallowCloneRoot(
      state
    );
  }

  /* =========================================================
     ACTIONS / SELECTORS
  ========================================================= */
  const actions =
    createActions({
      AppCore,
      state,
      set,
      patch,
      update,
    });

  const selectors =
    createSelectors({
      AppCore,
      state,
    });

  /* =========================================================
     SUBSCRIPTIONS
  ========================================================= */
  function subscribe(
    listener
  ) {
    return createSubscription(
      listeners,
      listener
    );
  }

  function subscribeKey(
    path,
    listener,
    options = {}
  ) {
    return createKeySubscription(
      {
        AppCore,
        keyListeners,
        path,
        listener,
        get,
        snapshot,
        options,
      }
    );
  }

  function subscribeSelector(
    selector,
    listener,
    options = {}
  ) {
    return createSelectorSubscription(
      {
        AppCore,
        selectorListeners,
        selector,
        listener,
        snapshot,
        shallowCloneRoot,
        state,
        options,
      }
    );
  }

  /* =========================================================
     LIFECYCLE
  ========================================================= */
  function init() {
    if (initialized) {
      AppCore.utils.warn(
        "Store ya estaba inicializado."
      );

      return api;
    }

    actions.hydrateFromCore();

    bindCoreEvents({
      AppCore,
      state,
      coreUnsubscribers,
      actions,
      patch,
    });

    initialized = true;

    AppCore.utils.log(
      "Store inicializado correctamente.",
      {
        route:
          state.app
            ?.route,
        publicPath:
          state.app
            ?.publicPath,
        authenticated:
          state.session
            ?.authenticated,
        theme:
          state.ui
            ?.theme,
        lang:
          state.ui
            ?.lang,
      }
    );

    return api;
  }

  function destroy() {
    unbindCoreEvents({
      AppCore,
      coreUnsubscribers,
    });

    listeners.clear();
    keyListeners.clear();
    selectorListeners.clear();

    initialized = false;

    return true;
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */
  const api = {
    state,

    init,
    destroy,

    get,
    set,
    patch,
    update,
    remove,
    reset,

    snapshot,
    select,

    subscribe,
    subscribeKey,
    subscribeSelector,

    selectors,
    actions,
  };

  return api;
})();
