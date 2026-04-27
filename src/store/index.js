/* =========================================================
   Onion SPA - Reactive Store (FULL PRO SAAS PANEL)
   Archivo: src/store/index.js

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
   - batch updates robustos
   - diagnóstico runtime

   HARDENING:
   - no expone mutaciones accidentales por get(path)
   - patch no depende de mergeDeep mutante/inmutable
   - eventos seguros aunque AppCore esté parcial
   - rollback de batch si withBatch síncrono/async falla
   - destroy limpia listeners y batch
   - init idempotente sin duplicar core listeners
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
  let mutationSeq = 0;

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

  let batchDepth = 0;
  let batchPreviousState = null;

  const batchChangedPaths =
    new Set();

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function nowMs() {
    return Date.now();
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

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function safeObject(value) {
    return value &&
      typeof value === "object" &&
      !Array.isArray(value)
      ? value
      : {};
  }

  function safeEmit(eventName, payload = {}) {
    try {
      AppCore?.events?.emit?.(
        eventName,
        payload
      );

      return true;
    } catch {
      return false;
    }
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(
        ...args
      );
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(
        ...args
      );
    } catch {}

    try {
      console.warn(...args);
    } catch {}
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(
        ...args
      );
    } catch {}

    try {
      console.error(...args);
    } catch {}
  }

  function normalizePath(path = "") {
    return safeText(path, "");
  }

  function assertPath(path, method = "Store") {
    const clean =
      normalizePath(path);

    if (!clean) {
      throw new Error(
        `${method}(path) requiere path`
      );
    }

    return clean;
  }

  function assertPlainObject(value, method = "Store.patch") {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new Error(
        `${method}(partialState) requiere un objeto`
      );
    }

    return value;
  }

  function cloneForRead(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return value;
    }

    return deepClone(value);
  }

  function getRootReadClone() {
    return shallowCloneRoot(
      state
    );
  }

  function incrementMutationSeq() {
    mutationSeq += 1;
    return mutationSeq;
  }

  function replaceRoot(nextState = {}) {
    Object.keys(state).forEach((key) => {
      delete state[key];
    });

    Object.keys(nextState).forEach((key) => {
      state[key] = nextState[key];
    });

    return state;
  }

  function restoreRoot(previousState = {}) {
    replaceRoot(
      deepClone(previousState)
    );

    return state;
  }

  function buildPatchChangedPaths(partialState = {}) {
    const paths =
      collectChangedPaths(
        partialState
      );

    if (
      Array.isArray(paths) &&
      paths.length
    ) {
      return paths
        .map((path) =>
          safeText(path, "")
        )
        .filter(Boolean);
    }

    return Object.keys(
      safeObject(partialState)
    );
  }

  /* =========================================================
     READ API
  ========================================================= */

  function snapshot() {
    return deepClone(state);
  }

  function get(
    path = null,
    fallback = undefined
  ) {
    if (!path) {
      return getRootReadClone();
    }

    const value =
      getByPath(
        state,
        path
      );

    if (
      value === undefined
    ) {
      return fallback;
    }

    return cloneForRead(
      value
    );
  }

  function getRaw(
    path = null,
    fallback = undefined
  ) {
    if (!path) {
      return state;
    }

    const value =
      getByPath(
        state,
        path
      );

    return value === undefined
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
        "Store.select(selector) requiere una función"
      );
    }

    try {
      const result =
        selector(
          getRootReadClone()
        );

      return result === undefined
        ? fallback
        : result;
    } catch (error) {
      safeError(
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
    const cleanChangedPaths =
      safeArray(changedPaths)
        .map((path) =>
          safeText(path, "")
        )
        .filter(Boolean);

    if (!cleanChangedPaths.length) {
      return false;
    }

    const seq =
      incrementMutationSeq();

    const startedAt =
      nowMs();

    try {
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
            cleanChangedPaths,
            previousState
          ),
      });
    } catch (error) {
      safeError(
        "Store notify error",
        error
      );

      safeEmit(
        "store:notify:error",
        {
          seq,
          changedPaths:
            cleanChangedPaths,
          message:
            error?.message ||
            String(error),
        }
      );
    }

    safeEmit(
      "store:change",
      {
        seq,
        changedPaths:
          [...cleanChangedPaths],
        changedCount:
          cleanChangedPaths.length,
        durationMs:
          nowMs() - startedAt,
      }
    );

    return true;
  }

  function startBatchIfNeeded() {
    if (
      batchDepth === 0 &&
      !batchPreviousState
    ) {
      batchPreviousState =
        snapshot();
    }

    batchDepth += 1;

    return batchDepth;
  }

  function queueBatchPaths(
    changedPaths = []
  ) {
    if (
      !Array.isArray(changedPaths)
    ) {
      return;
    }

    changedPaths.forEach((path) => {
      const clean =
        safeText(path, "");

      if (!clean) return;

      batchChangedPaths.add(clean);
    });
  }

  function flushBatchIfReady() {
    if (batchDepth > 0) {
      return false;
    }

    if (!batchPreviousState) {
      return false;
    }

    const changedPaths =
      Array.from(
        batchChangedPaths
      );

    const previousState =
      batchPreviousState;

    batchPreviousState = null;
    batchChangedPaths.clear();

    if (!changedPaths.length) {
      return false;
    }

    const flushed =
      emitChange(
        changedPaths,
        previousState
      );

    if (flushed) {
      safeEmit(
        "store:batch:flush",
        {
          changedCount:
            changedPaths.length,
          changedPaths,
        }
      );
    }

    return flushed;
  }

  function emitOrQueueChange(
    changedPaths = [],
    previousState = {}
  ) {
    if (batchDepth > 0) {
      queueBatchPaths(
        changedPaths
      );
      return true;
    }

    return emitChange(
      changedPaths,
      previousState
    );
  }

  function clearBatchState() {
    batchDepth = 0;
    batchPreviousState = null;
    batchChangedPaths.clear();
  }

  /* =========================================================
     WRITE API
  ========================================================= */

  function set(
    path,
    value
  ) {
    const cleanPath =
      assertPath(
        path,
        "Store.set"
      );

    const currentValue =
      getRaw(cleanPath);

    if (
      deepEqual(
        currentValue,
        value
      )
    ) {
      return cloneForRead(
        currentValue
      );
    }

    const previousState =
      batchDepth > 0 && batchPreviousState
        ? batchPreviousState
        : snapshot();

    setByPath(
      state,
      cleanPath,
      deepClone(value)
    );

    touchMeta(state);

    emitOrQueueChange(
      [cleanPath],
      previousState
    );

    return get(cleanPath);
  }

  function patch(
    partialState = {}
  ) {
    assertPlainObject(
      partialState,
      "Store.patch"
    );

    if (
      Object.keys(partialState).length === 0
    ) {
      return getRootReadClone();
    }

    const previousState =
      batchDepth > 0 && batchPreviousState
        ? batchPreviousState
        : snapshot();

    /*
      Importante:
      mergeDeep puede estar implementado como mutante o como inmutable.
      Por eso fusionamos sobre un clon, nunca sobre state directamente.
    */
    const base =
      snapshot();

    const nextState =
      mergeDeep(
        base,
        deepClone(partialState)
      );

    if (
      deepEqual(
        state,
        nextState
      )
    ) {
      return getRootReadClone();
    }

    replaceRoot(
      nextState
    );

    touchMeta(state);

    emitOrQueueChange(
      buildPatchChangedPaths(
        partialState
      ),
      previousState
    );

    return getRootReadClone();
  }

  function replace(
    nextState = {}
  ) {
    assertPlainObject(
      nextState,
      "Store.replace"
    );

    const previousState =
      batchDepth > 0 && batchPreviousState
        ? batchPreviousState
        : snapshot();

    const cleanNext =
      deepClone(nextState);

    if (
      deepEqual(
        state,
        cleanNext
      )
    ) {
      return getRootReadClone();
    }

    replaceRoot(cleanNext);

    touchMeta(state);

    emitOrQueueChange(
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

    return getRootReadClone();
  }

  function update(
    path,
    updater
  ) {
    const cleanPath =
      assertPath(
        path,
        "Store.update"
      );

    if (
      !isFunction(updater)
    ) {
      throw new Error(
        "Store.update(path, updater) requiere una función"
      );
    }

    const currentValue =
      get(cleanPath);

    const nextValue =
      updater(
        deepClone(
          currentValue
        )
      );

    return set(
      cleanPath,
      nextValue
    );
  }

  function remove(
    path
  ) {
    const cleanPath =
      assertPath(
        path,
        "Store.remove"
      );

    const currentValue =
      getRaw(cleanPath);

    if (
      currentValue === undefined
    ) {
      return false;
    }

    const previousState =
      batchDepth > 0 && batchPreviousState
        ? batchPreviousState
        : snapshot();

    deleteByPath(
      state,
      cleanPath
    );

    touchMeta(state);

    emitOrQueueChange(
      [cleanPath],
      previousState
    );

    return true;
  }

  function reset() {
    const previousState =
      batchDepth > 0 && batchPreviousState
        ? batchPreviousState
        : snapshot();

    const next =
      buildInitialState(
        AppCore
      );

    replaceRoot(next);

    touchMeta(state);

    emitOrQueueChange(
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

    return getRootReadClone();
  }

  /* =========================================================
     BATCH API
  ========================================================= */

  function beginBatch() {
    const depth =
      startBatchIfNeeded();

    safeEmit(
      "store:batch:start",
      {
        depth,
      }
    );

    return depth;
  }

  function endBatch() {
    if (batchDepth === 0) {
      return false;
    }

    batchDepth -= 1;

    safeEmit(
      "store:batch:end",
      {
        depth: batchDepth,
      }
    );

    if (batchDepth > 0) {
      return false;
    }

    return flushBatchIfReady();
  }

  function rollbackBatch(error = null) {
    if (
      batchPreviousState
    ) {
      restoreRoot(
        batchPreviousState
      );
    }

    clearBatchState();

    safeEmit(
      "store:batch:rollback",
      {
        message:
          error?.message ||
          String(error || ""),
      }
    );

    return true;
  }

  function withBatch(fn, options = {}) {
    if (!isFunction(fn)) {
      throw new Error(
        "Store.withBatch(fn) requiere una función"
      );
    }

    const rollbackOnError =
      options.rollbackOnError === true;

    beginBatch();

    let result;

    try {
      result = fn(api);
    } catch (error) {
      if (rollbackOnError) {
        rollbackBatch(error);
      } else {
        endBatch();
      }

      throw error;
    }

    if (
      result &&
      typeof result.then === "function"
    ) {
      return result
        .then((value) => {
          endBatch();
          return value;
        })
        .catch((error) => {
          if (rollbackOnError) {
            rollbackBatch(error);
          } else {
            endBatch();
          }

          throw error;
        });
    }

    endBatch();
    return result;
  }

  /* =========================================================
     COLLECTION HELPERS
  ========================================================= */

  function push(
    path,
    item
  ) {
    return update(
      path,
      (current = []) => {
        const list =
          Array.isArray(current)
            ? current
            : [];

        return [
          ...list,
          deepClone(item),
        ];
      }
    );
  }

  function upsertById(
    path,
    item,
    idKey = "id"
  ) {
    const cleanIdKey =
      safeText(idKey, "id");

    return update(
      path,
      (current = []) => {
        const list =
          Array.isArray(current)
            ? current
            : [];

        const nextItem =
          deepClone(item);

        const nextId =
          nextItem?.[cleanIdKey];

        if (
          nextId === null ||
          nextId === undefined ||
          nextId === ""
        ) {
          return [
            ...list,
            nextItem,
          ];
        }

        const index =
          list.findIndex(
            (entry) =>
              entry?.[cleanIdKey] === nextId
          );

        if (index < 0) {
          return [
            ...list,
            nextItem,
          ];
        }

        return list.map((entry, entryIndex) =>
          entryIndex === index
            ? {
                ...entry,
                ...nextItem,
              }
            : entry
        );
      }
    );
  }

  function removeById(
    path,
    id,
    idKey = "id"
  ) {
    const cleanIdKey =
      safeText(idKey, "id");

    return update(
      path,
      (current = []) => {
        const list =
          Array.isArray(current)
            ? current
            : [];

        return list.filter(
          (entry) =>
            entry?.[cleanIdKey] !== id
        );
      }
    );
  }

  function clearCollection(path) {
    return set(
      path,
      []
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
    const cleanPath =
      assertPath(
        path,
        "Store.subscribeKey"
      );

    return createKeySubscription({
      AppCore,
      keyListeners,
      path: cleanPath,
      listener,
      get,
      snapshot,
      options,
    });
  }

  function subscribeSelector(
    selector,
    listener,
    options = {}
  ) {
    return createSelectorSubscription({
      AppCore,
      selectorListeners,
      selector,
      listener,
      snapshot,
      shallowCloneRoot,
      state,
      options,
    });
  }

  /* =========================================================
     LIFECYCLE
  ========================================================= */

  function init(options = {}) {
    if (initialized) {
      safeWarn(
        "Store ya estaba inicializado."
      );

      return api;
    }

    const startedAt =
      nowMs();

    const shouldHydrate =
      options.hydrate !== false;

    if (shouldHydrate) {
      try {
        actions.hydrateFromCore();
      } catch (error) {
        safeError(
          "Store hydrateFromCore error",
          error
        );

        safeEmit(
          "store:hydrate:error",
          {
            message:
              error?.message ||
              String(error),
          }
        );
      }
    }

    try {
      bindCoreEvents({
        AppCore,
        state,
        coreUnsubscribers,
        actions,
        patch,
      });
    } catch (error) {
      safeError(
        "Store bindCoreEvents error",
        error
      );

      safeEmit(
        "store:core-bind:error",
        {
          message:
            error?.message ||
            String(error),
        }
      );
    }

    initialized = true;

    safeEmit(
      "store:init",
      {
        initialized: true,
        durationMs:
          nowMs() - startedAt,
      }
    );

    safeLog(
      "Store inicializado correctamente.",
      {
        route:
          state.app?.route,
        publicPath:
          state.app?.publicPath,
        authenticated:
          state.session?.authenticated,
        theme:
          state.ui?.theme,
        lang:
          state.ui?.lang,
      }
    );

    return api;
  }

  function destroy(options = {}) {
    const {
      clearState = false,
      silent = false,
    } = options;

    try {
      unbindCoreEvents({
        AppCore,
        coreUnsubscribers,
      });
    } catch (error) {
      safeError(
        "Store unbindCoreEvents error",
        error
      );
    }

    listeners.clear();
    keyListeners.clear();
    selectorListeners.clear();

    clearBatchState();

    if (clearState) {
      replaceRoot(
        buildInitialState(
          AppCore
        )
      );

      touchMeta(state);
    }

    initialized = false;

    if (!silent) {
      safeEmit(
        "store:destroy",
        {
          initialized: false,
          clearState:
            Boolean(clearState),
        }
      );
    }

    return true;
  }

  function getDiagnostics() {
    return {
      initialized,

      mutationSeq,

      listeners:
        listeners.size,

      keyListeners:
        keyListeners.size,

      selectorListeners:
        selectorListeners.size,

      coreUnsubscribers:
        coreUnsubscribers.length,

      batchDepth,

      batchedPaths:
        batchChangedPaths.size,

      batchedChangedPaths:
        Array.from(
          batchChangedPaths
        ),

      hasBatchPreviousState:
        Boolean(batchPreviousState),

      stateKeys:
        Object.keys(state),

      route:
        state.app?.route || null,

      publicPath:
        state.app?.publicPath || null,

      authenticated:
        Boolean(
          state.session?.authenticated
        ),

      theme:
        state.ui?.theme || null,

      lang:
        state.ui?.lang || null,
    };
  }

  function isInitialized() {
    return Boolean(initialized);
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  const api = {
    state,

    init,
    destroy,
    isInitialized,

    get,
    getRaw,
    set,
    patch,
    replace,
    update,
    remove,
    reset,

    beginBatch,
    endBatch,
    withBatch,
    rollbackBatch,

    snapshot,
    select,

    push,
    upsertById,
    removeById,
    clearCollection,

    subscribe,
    subscribeKey,
    subscribeSelector,

    getDiagnostics,

    selectors,
    actions,
  };

  return api;
})();

export default Store;
