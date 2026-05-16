/* =========================================================
   Onion SPA - Reactive Store
   Archivo: src/store/index.js

   STORE SINGLETON · SIMPLE
   - estado reactivo por slices
   - sync mínimo con AppCore
   - get() clona / getRaw() explícito
   - patch/set/replace/remove sólo con cambios reales
   - subscriptions global/key/selector
   - batch sync/async con rollback opcional
   - sin Auth/HTTP/Router paralelos
========================================================= */

import { AppCore } from "../core/index.js";

import {
  collectChangedPaths,
  collectDiffPaths,
  deepClone,
  deepEqual,
  deleteByPath,
  getByPath,
  isFunction,
  mergeDeep,
  normalizePath as normalizeStorePath,
  safeNumber,
  safeObject,
  safeText,
  setByPath,
} from "./helpers.js";

import {
  buildInitialState,
  shallowCloneRoot,
  touchMeta,
} from "./state.js";

import {
  buildPayload,
  buildNotifySnapshot,
  notify,
} from "./notify.js";

import {
  getSubscriptionsSnapshot,
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

export const STORE_VERSION = "16.0.0-simple";

const SOURCE = "store";

const ROOT_CHANGED_PATHS = Object.freeze([
  "app",
  "session",
  "ui",
  "entities",
  "flags",
  "meta",
]);

const EVENTS = Object.freeze({
  init: "store:init",
  initSkip: "store:init:skip",
  initError: "store:init:error",
  destroy: "store:destroy",
  change: "store:change",
  notifyError: "store:notify:error",
  hydrateError: "store:hydrate:error",
  coreBindError: "store:core-bind:error",
  coreUnbindError: "store:core-unbind:error",
  batchStart: "store:batch:start",
  batchEnd: "store:batch:end",
  batchFlush: "store:batch:flush",
  batchRollback: "store:batch:rollback",
  batchError: "store:batch:error",
  error: "store:error",
});

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const TOKENISH_TEXT_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)[^&#\s]+/gi;

export const Store = (() => {
  "use strict";

  let initialized = false;
  let initializing = false;
  let destroyed = false;
  let mutationSeq = 0;
  let initStartedAt = 0;
  let initCompletedAt = 0;
  let lastError = null;

  const state = buildInitialState(AppCore);

  const listeners = new Set();
  const keyListeners = new Map();
  const selectorListeners = new Set();
  const coreUnsubscribers = [];

  let batchDepth = 0;
  let batchId = 0;
  let batchPreviousState = null;
  let batchStartedAt = 0;
  const batchChangedPaths = new Set();

  /* =======================================================
     BASICS
  ======================================================= */

  function now() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function iso(ms = now()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function clone(value, fallback = null) {
    if (value === undefined) return fallback;
    if (value === null) return null;

    try {
      return deepClone(value);
    } catch {}

    try {
      if (typeof structuredClone === "function") return structuredClone(value);
    } catch {}

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback === null ? value : fallback;
    }
  }

  function equals(left, right) {
    try {
      return deepEqual(left, right);
    } catch {}

    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return Object.is(left, right);
    }
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value instanceof Set) return [...value];
    if (value === null || value === undefined) return [];
    return [value];
  }

  function pathString(path = "") {
    try {
      const parts = normalizeStorePath(path);
      return Array.isArray(parts) ? parts.join(".") : safeText(parts, "");
    } catch {
      return safeText(path, "");
    }
  }

  function uniquePaths(paths = []) {
    const out = [];
    const seen = new Set();

    for (const item of asArray(paths).flat(Infinity)) {
      const path = pathString(item);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }

    return out;
  }

  function assertPath(path, method = "Store") {
    const clean = pathString(path);
    if (!clean) throw new Error(`${method}(path) requiere path.`);
    return clean;
  }

  function assertObject(value, method = "Store.patch") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${method}(value) requiere un objeto.`);
    }

    return value;
  }

  /* =======================================================
     REDACTION / EVENTS
  ======================================================= */

  function redactText(value = "") {
    const raw = safeText(value, "");
    if (!raw) return "";

    try {
      return raw.replace(TOKENISH_TEXT_RE, (match) => {
        if (/^bearer\s+/i.test(match)) return "Bearer ***";
        if (/^[?&#]/.test(match)) return match.replace(/=.+$/g, "=***");
        return "***";
      });
    } catch {
      return raw;
    }
  }

  function sanitize(value, depth = 0, keyHint = "", seen = new WeakSet()) {
    if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
    if (depth > 5) return "[depth-limit]";

    if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") return redactText(value);
    if (typeof value === "bigint") return String(value);
    if (typeof value === "function") return "[function]";

    if (value instanceof Error) {
      return {
        name: safeText(value.name, "Error"),
        message: redactText(safeText(value.message, "Error")),
        code: value.code || null,
        status: value.status || value.statusCode || null,
        stack: value.stack ? "[stack]" : null,
      };
    }

    if (Array.isArray(value)) {
      return value.slice(0, 100).map((item) => sanitize(item, depth + 1, keyHint, seen));
    }

    if (value && typeof value === "object") {
      try {
        if (seen.has(value)) return "[circular]";
        seen.add(value);
      } catch {}

      const output = {};

      for (const [key, item] of Object.entries(value).slice(0, 120)) {
        output[key] = sanitize(item, depth + 1, key, seen);
      }

      return output;
    }

    try {
      return redactText(String(value));
    } catch {
      return "[unserializable]";
    }
  }

  function normalizeError(error = null, source = SOURCE) {
    if (!error) return null;

    return {
      name: safeText(error?.name, "StoreError"),
      message: redactText(safeText(error?.message || error, "Store error.")),
      code: safeText(error?.code || error?.statusCode || "", "") || null,
      status: safeNumber(error?.status, 0) || null,
      source: safeText(source, SOURCE),
      at: iso(),
    };
  }

  function emit(eventName, payload = {}) {
    const name = safeText(eventName, "");
    if (!name) return false;

    try {
      AppCore?.events?.emit?.(
        name,
        sanitize({
          source: SOURCE,
          version: STORE_VERSION,
          ...safeObject(payload),
        })
      );

      return true;
    } catch {
      return false;
    }
  }

  function recordError(error, source = SOURCE) {
    lastError = normalizeError(error, source);

    emit(EVENTS.error, { error: lastError });

    try {
      AppCore?.utils?.error?.("[Store]", error, lastError);
    } catch {}

    try {
      if (AppCore?.config?.debug) console.error("[Store]", error, lastError);
    } catch {}

    return lastError;
  }

  function log(...args) {
    try {
      AppCore?.utils?.log?.("[Store]", ...args.map((item) => sanitize(item)));
    } catch {}
  }

  /* =======================================================
     ROOT STATE
  ======================================================= */

  function snapshot() {
    return clone(state, {});
  }

  function rootClone() {
    return clone(state, shallowCloneRoot(state));
  }

  function readClone(value, fallback = value) {
    if (value === undefined) return fallback;
    return clone(value, fallback);
  }

  function replaceRoot(nextState = {}) {
    const cleanNext = safeObject(nextState);

    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, cleanNext);

    return state;
  }

  function restoreRoot(previousState = {}) {
    replaceRoot(clone(previousState, {}));
    return state;
  }

  function touch() {
    try {
      touchMeta(state);
      return true;
    } catch {}

    try {
      state.meta = safeObject(state.meta);
      state.meta.updatedAt = iso();
      state.meta.version = state.meta.version || STORE_VERSION;
      return true;
    } catch {
      return false;
    }
  }

  function topLevelDiff(previousState = {}, nextState = {}) {
    const keys = [
      ...new Set([
        ...Object.keys(safeObject(previousState)),
        ...Object.keys(safeObject(nextState)),
      ]),
    ];

    return uniquePaths(keys.filter((key) => !equals(previousState?.[key], nextState?.[key])));
  }

  function patchChangedPaths(partialState = {}, previousState = null, nextState = null) {
    try {
      const paths = collectChangedPaths(partialState);
      if (Array.isArray(paths) && paths.length) return uniquePaths(paths);
    } catch {}

    try {
      const paths = collectDiffPaths(previousState, nextState);
      if (Array.isArray(paths) && paths.length) return uniquePaths(paths);
    } catch {}

    return uniquePaths(Object.keys(safeObject(partialState)));
  }

  function sanitizeChangedPaths(paths = []) {
    return uniquePaths(paths).map((path) => (SENSITIVE_KEY_RE.test(path) ? "[sensitive]" : path));
  }

  /* =======================================================
     NOTIFY / BATCH
  ======================================================= */

  function notifyNow(changedPaths = [], previousState = {}) {
    const paths = uniquePaths(changedPaths);
    if (!paths.length) return false;

    const startedAt = now();
    mutationSeq += 1;

    const payload = buildPayload(snapshot, paths, previousState);

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
        payload,
      });
    } catch (error) {
      recordError(error, "notify");

      emit(EVENTS.notifyError, {
        seq: mutationSeq,
        changedPaths: sanitizeChangedPaths(paths),
        error: normalizeError(error, "notify"),
      });
    }

    emit(EVENTS.change, {
      seq: mutationSeq,
      changedPaths: sanitizeChangedPaths(paths),
      changedCount: paths.length,
      durationMs: Math.max(0, now() - startedAt),
    });

    return true;
  }

  function queueOrNotify(changedPaths = [], previousState = {}) {
    const paths = uniquePaths(changedPaths);
    if (!paths.length) return false;

    if (batchDepth > 0) {
      for (const path of paths) batchChangedPaths.add(path);
      return true;
    }

    return notifyNow(paths, previousState);
  }

  function clearBatch() {
    batchDepth = 0;
    batchPreviousState = null;
    batchStartedAt = 0;
    batchChangedPaths.clear();
  }

  function beginBatch() {
    if (batchDepth === 0 && !batchPreviousState) {
      batchPreviousState = snapshot();
      batchStartedAt = now();
      batchChangedPaths.clear();
      batchId += 1;
    }

    batchDepth += 1;

    emit(EVENTS.batchStart, {
      batchId,
      depth: batchDepth,
    });

    return batchDepth;
  }

  function flushBatch() {
    if (batchDepth > 0 || !batchPreviousState) return false;

    const paths = uniquePaths([...batchChangedPaths]);
    const previousState = batchPreviousState;
    const currentBatchId = batchId;
    const startedAt = batchStartedAt;

    clearBatch();

    if (!paths.length) return false;

    const ok = notifyNow(paths, previousState);

    if (ok) {
      emit(EVENTS.batchFlush, {
        batchId: currentBatchId,
        changedCount: paths.length,
        changedPaths: sanitizeChangedPaths(paths),
        durationMs: startedAt ? Math.max(0, now() - startedAt) : 0,
      });
    }

    return ok;
  }

  function endBatch() {
    if (batchDepth <= 0) return false;

    batchDepth -= 1;

    emit(EVENTS.batchEnd, {
      batchId,
      depth: batchDepth,
    });

    if (batchDepth > 0) return false;
    return flushBatch();
  }

  function rollbackBatch(error = null) {
    const hadState = Boolean(batchPreviousState);
    const currentBatchId = batchId;

    if (batchPreviousState) restoreRoot(batchPreviousState);

    clearBatch();

    emit(EVENTS.batchRollback, {
      batchId: currentBatchId,
      restored: hadState,
      error: error ? normalizeError(error, "batch:rollback") : null,
      at: iso(),
    });

    return true;
  }

  function withBatch(fn, options = {}) {
    if (!isFunction(fn)) throw new Error("Store.withBatch(fn) requiere una función.");

    const opts = safeObject(options);
    const rollbackOnError = opts.rollbackOnError === true;

    beginBatch();

    try {
      const result = fn(api);

      if (result && typeof result.then === "function") {
        return result
          .then((value) => {
            endBatch();
            return value;
          })
          .catch((error) => {
            recordError(error, "batch:async");
            if (rollbackOnError) rollbackBatch(error);
            else endBatch();

            emit(EVENTS.batchError, {
              batchId,
              phase: "async",
              rollback: rollbackOnError,
              error: normalizeError(error, "batch:async"),
            });

            throw error;
          });
      }

      endBatch();
      return result;
    } catch (error) {
      recordError(error, "batch:sync");
      if (rollbackOnError) rollbackBatch(error);
      else endBatch();

      emit(EVENTS.batchError, {
        batchId,
        phase: "sync",
        rollback: rollbackOnError,
        error: normalizeError(error, "batch:sync"),
      });

      throw error;
    }
  }

  /* =======================================================
     READ API
  ======================================================= */

  function get(path = null, fallback = undefined) {
    if (!path) return rootClone();

    const value = getByPath(state, path, undefined);
    return value === undefined ? fallback : readClone(value, fallback);
  }

  function getRaw(path = null, fallback = undefined) {
    if (!path) return state;

    const value = getByPath(state, path, undefined);
    return value === undefined ? fallback : value;
  }

  function select(selector, fallback = undefined) {
    if (!isFunction(selector)) throw new Error("Store.select(selector) requiere una función.");

    try {
      const value = selector(rootClone());
      return value === undefined ? fallback : readClone(value, fallback);
    } catch (error) {
      recordError(error, "select");
      return fallback;
    }
  }

  /* =======================================================
     WRITE API
  ======================================================= */

  function set(path, value) {
    const cleanPath = assertPath(path, "Store.set");
    const currentValue = getRaw(cleanPath);

    if (equals(currentValue, value)) return readClone(currentValue);

    const previousState = batchDepth > 0 && batchPreviousState ? batchPreviousState : snapshot();

    setByPath(state, cleanPath, clone(value, value));
    touch();
    queueOrNotify([cleanPath], previousState);

    return get(cleanPath);
  }

  function patch(partialState = {}) {
    assertObject(partialState, "Store.patch");

    if (!Object.keys(partialState).length) return rootClone();

    const previousState = batchDepth > 0 && batchPreviousState ? batchPreviousState : snapshot();
    const nextState = mergeDeep(snapshot(), clone(partialState, {}));

    if (equals(state, nextState)) return rootClone();

    replaceRoot(nextState);
    touch();

    queueOrNotify(patchChangedPaths(partialState, previousState, nextState), previousState);

    return rootClone();
  }

  function replace(nextState = {}) {
    assertObject(nextState, "Store.replace");

    const cleanNext = clone(nextState, {});
    if (equals(state, cleanNext)) return rootClone();

    const previousState = batchDepth > 0 && batchPreviousState ? batchPreviousState : snapshot();

    replaceRoot(cleanNext);
    touch();

    const paths = topLevelDiff(previousState, cleanNext);
    queueOrNotify(paths.length ? paths : ROOT_CHANGED_PATHS, previousState);

    return rootClone();
  }

  function update(path, updater) {
    const cleanPath = assertPath(path, "Store.update");
    if (!isFunction(updater)) throw new Error("Store.update(path, updater) requiere una función.");

    const currentValue = get(cleanPath);
    const nextValue = updater(clone(currentValue, currentValue));

    return set(cleanPath, nextValue);
  }

  function remove(path) {
    const cleanPath = assertPath(path, "Store.remove");
    if (getRaw(cleanPath) === undefined) return false;

    const previousState = batchDepth > 0 && batchPreviousState ? batchPreviousState : snapshot();

    deleteByPath(state, cleanPath);
    touch();
    queueOrNotify([cleanPath], previousState);

    return true;
  }

  function reset() {
    const previousState = batchDepth > 0 && batchPreviousState ? batchPreviousState : snapshot();

    replaceRoot(buildInitialState(AppCore));
    touch();
    queueOrNotify(ROOT_CHANGED_PATHS, previousState);

    return rootClone();
  }

  /* =======================================================
     COLLECTION HELPERS
  ======================================================= */

  function push(path, item) {
    return update(path, (current = []) => {
      const list = Array.isArray(current) ? current : [];
      return [...list, clone(item, item)];
    });
  }

  function upsertById(path, item, idKey = "id") {
    const cleanIdKey = safeText(idKey, "id");

    return update(path, (current = []) => {
      const list = Array.isArray(current) ? current : [];
      const nextItem = clone(item, item);
      const nextId = nextItem?.[cleanIdKey];

      if (nextId === null || nextId === undefined || nextId === "") return [...list, nextItem];

      const index = list.findIndex((entry) => entry?.[cleanIdKey] === nextId);
      if (index < 0) return [...list, nextItem];

      return list.map((entry, entryIndex) => (
        entryIndex === index
          ? { ...safeObject(entry), ...safeObject(nextItem) }
          : entry
      ));
    });
  }

  function removeById(path, id, idKey = "id") {
    const cleanIdKey = safeText(idKey, "id");

    return update(path, (current = []) => {
      const list = Array.isArray(current) ? current : [];
      return list.filter((entry) => entry?.[cleanIdKey] !== id);
    });
  }

  function clearCollection(path) {
    return set(path, []);
  }

  /* =======================================================
     SUBSCRIPTIONS
  ======================================================= */

  function subscribe(listener, options = {}) {
    return createSubscription(listeners, listener, {
      ...safeObject(options),
      AppCore,
      snapshot,
    });
  }

  function subscribeKey(path, listener, options = {}) {
    const cleanPath = assertPath(path, "Store.subscribeKey");

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

  function subscribeSelector(selector, listener, options = {}) {
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

  /* =======================================================
     CORE SYNC
  ======================================================= */

  function unbindCore() {
    try {
      unbindCoreEvents({ AppCore, coreUnsubscribers });
      return true;
    } catch (error) {
      recordError(error, "core:unbind");

      emit(EVENTS.coreUnbindError, {
        error: normalizeError(error, "core:unbind"),
      });

      while (coreUnsubscribers.length) {
        try {
          coreUnsubscribers.pop()?.();
        } catch {}
      }

      return false;
    }
  }

  function hydrateFromCore() {
    try {
      actions?.hydrateFromCore?.();
      return true;
    } catch (error) {
      recordError(error, "hydrate");

      emit(EVENTS.hydrateError, {
        error: normalizeError(error, "hydrate"),
      });

      return false;
    }
  }

  function bindCore() {
    if (coreUnsubscribers.length > 0) return true;

    try {
      bindCoreEvents({
        AppCore,
        state,
        coreUnsubscribers,
        actions,
        patch,
      });

      return true;
    } catch (error) {
      recordError(error, "core:bind");

      emit(EVENTS.coreBindError, {
        error: normalizeError(error, "core:bind"),
      });

      return false;
    }
  }

  function attachToCore() {
    try {
      AppCore.Store = api;
      AppCore.store = api;
    } catch {}

    try {
      AppCore?.modules?.register?.("Store", api, {
        overwrite: true,
        replace: true,
        aliases: ["store"],
        source: SOURCE,
        silent: true,
      });
    } catch {}

    try {
      AppCore?.modules?.register?.("store", api, {
        overwrite: true,
        replace: true,
        aliases: ["Store"],
        source: SOURCE,
        silent: true,
      });
    } catch {}

    try {
      AppCore?.modules?.set?.("Store", api);
      AppCore?.modules?.set?.("store", api);
    } catch {}

    try {
      if (typeof window !== "undefined") {
        window.__ONION_STORE__ = api;
        window.Store = api;
      }
    } catch {}

    return true;
  }

  /* =======================================================
     ACTIONS / SELECTORS
  ======================================================= */

  const selectors = createSelectors({ AppCore, state });

  const actions = createActions({
    AppCore,
    state,
    get,
    getRaw,
    set,
    patch,
    replace,
    update,
    remove,
    withBatch,
    selectors,
  });

  /* =======================================================
     LIFECYCLE
  ======================================================= */

  function init(options = {}) {
    const opts = safeObject(options);

    if (initialized && opts.force !== true) {
      attachToCore();

      emit(EVENTS.initSkip, {
        reason: "already-initialized",
        initialized: true,
      });

      return api;
    }

    if (initializing && opts.force !== true) {
      emit(EVENTS.initSkip, {
        reason: "init-in-flight",
        initializing: true,
      });

      return api;
    }

    initializing = true;
    destroyed = false;
    initStartedAt = now();

    try {
      attachToCore();

      if (opts.force === true) unbindCore();
      if (opts.hydrate !== false) hydrateFromCore();

      bindCore();

      initialized = true;
      initCompletedAt = now();

      emit(EVENTS.init, {
        initialized: true,
        force: opts.force === true,
        hydrate: opts.hydrate !== false,
        durationMs: Math.max(0, initCompletedAt - initStartedAt),
        diagnostics: getDiagnostics(),
      });

      log("ready", {
        route: state.app?.route || null,
        publicPath: redactText(state.app?.publicPath || ""),
        authenticated: Boolean(state.session?.authenticated),
        theme: state.ui?.theme || null,
        lang: state.ui?.lang || null,
      });

      return api;
    } catch (error) {
      initialized = false;
      recordError(error, "init");

      emit(EVENTS.initError, {
        error: normalizeError(error, "init"),
        durationMs: Math.max(0, now() - initStartedAt),
      });

      throw error;
    } finally {
      initializing = false;
    }
  }

  function destroy(options = {}) {
    const opts = safeObject(options);

    unbindCore();

    listeners.clear();
    keyListeners.clear();
    selectorListeners.clear();
    clearBatch();

    if (opts.clearState === true) {
      replaceRoot(buildInitialState(AppCore));
      touch();
    }

    initialized = false;
    initializing = false;
    destroyed = true;

    if (opts.silent !== true) {
      emit(EVENTS.destroy, {
        destroyed: true,
        clearState: opts.clearState === true,
      });
    }

    return true;
  }

  function isInitialized() {
    return Boolean(initialized);
  }

  function isInitializing() {
    return Boolean(initializing);
  }

  /* =======================================================
     SNAPSHOT / DIAGNOSTICS
  ======================================================= */

  function getDiagnostics() {
    return {
      version: STORE_VERSION,

      initialized: Boolean(initialized),
      initializing: Boolean(initializing),
      destroyed: Boolean(destroyed),

      mutationSeq,

      listeners: listeners.size,
      keyListeners: keyListeners.size,
      selectorListeners: selectorListeners.size,
      coreUnsubscribers: coreUnsubscribers.length,

      batchDepth,
      batchId,
      batchChangedPaths: sanitizeChangedPaths([...batchChangedPaths]),
      hasBatchPreviousState: Boolean(batchPreviousState),

      route: state.app?.route || null,
      publicPath: redactText(state.app?.publicPath || "") || null,

      authenticated: Boolean(state.session?.authenticated),
      hasToken: Boolean(state.session?.hasToken),
      role: state.session?.role || null,
      username: state.session?.username || null,

      theme: state.ui?.theme || null,
      themeMode: state.ui?.themeMode || null,
      lang: state.ui?.lang || null,

      lastError,
      at: iso(),
    };
  }

  function getSnapshot(options = {}) {
    const opts = safeObject(options);

    const subscriptions = getSubscriptionsSnapshot({
      listeners,
      keyListeners,
      selectorListeners,
    });

    const notifySnapshot = buildNotifySnapshot({
      listeners,
      keyListeners,
      selectorListeners,
    });

    return {
      version: STORE_VERSION,

      initialized: Boolean(initialized),
      initializing: Boolean(initializing),
      destroyed: Boolean(destroyed),

      mutationSeq,
      diagnostics: getDiagnostics(),
      subscriptions,
      notify: notifySnapshot,

      state: opts.includeState === true ? sanitize(snapshot()) : null,
      rawState: opts.includeRawState === true ? snapshot() : null,

      init: {
        startedAt: initStartedAt ? iso(initStartedAt) : "",
        completedAt: initCompletedAt ? iso(initCompletedAt) : "",
        durationMs: initStartedAt && initCompletedAt ? Math.max(0, initCompletedAt - initStartedAt) : 0,
      },

      lastError,
      at: iso(),
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
    version: STORE_VERSION,
    events: EVENTS,
    state,

    init,
    destroy,

    isInitialized,
    isInitializing,

    get,
    getRaw,
    select,

    set,
    patch,
    replace,
    update,
    remove,
    delete: remove,
    del: remove,
    reset,

    beginBatch,
    endBatch,
    withBatch,
    rollbackBatch,

    push,
    upsertById,
    removeById,
    clearCollection,

    subscribe,
    subscribeKey,
    subscribePath: subscribeKey,
    subscribeSelector,

    snapshot,
    getSnapshot,
    getDebugSnapshot: getSnapshot,
    getDiagnostics,

    selectors,
    actions,
  };

  attachToCore();

  return api;
})();

export default Store;
