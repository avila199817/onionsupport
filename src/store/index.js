/* =========================================================
   Onion SPA - Reactive Store
   Archivo: src/store/index.js

   ONION SUPPORT · STORE SINGLETON
   REACTIVE STATE · APPCORE SYNC · BATCH SAFE · EXTREME 10/10

   Responsabilidades:
   - estado global reactivo de la SPA
   - subscripciones globales, por clave y por selector
   - acciones centralizadas
   - selectores seguros
   - sync fino con AppCore
   - actualización inmutable por slices
   - helpers de colecciones
   - prevención de notificaciones inútiles
   - init idempotente
   - batch updates robustos con rollback sync/async
   - diagnóstico runtime seguro
   - destroy limpio sin listeners huérfanos

   HARDENING:
   - get(path) devuelve clones para evitar mutaciones accidentales
   - getRaw(path) queda explícitamente como acceso interno/raw
   - patch no depende de si mergeDeep es mutante o inmutable
   - eventos seguros aunque AppCore esté parcial
   - rollback de batch si withBatch síncrono/async falla
   - destroy limpia listeners, core listeners y batch
   - init idempotente sin duplicar core listeners
   - notificaciones sólo si hay cambios reales
   - snapshots/eventos sin token leakage accidental
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

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_VERSION =
  "14.0.0";

const STORE_SCOPE =
  "store";

const ROOT_CHANGED_PATHS =
  Object.freeze([
    "app",
    "session",
    "ui",
    "entities",
    "flags",
    "meta",
  ]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code/i;

const STORE_EVENTS =
  Object.freeze({
    init:
      "store:init",

    initSkip:
      "store:init:skip",

    initError:
      "store:init:error",

    destroy:
      "store:destroy",

    change:
      "store:change",

    notifyError:
      "store:notify:error",

    hydrateError:
      "store:hydrate:error",

    coreBindError:
      "store:core-bind:error",

    coreUnbindError:
      "store:core-unbind:error",

    batchStart:
      "store:batch:start",

    batchEnd:
      "store:batch:end",

    batchFlush:
      "store:batch:flush",

    batchRollback:
      "store:batch:rollback",

    batchError:
      "store:batch:error",

    error:
      "store:error",
  });

/* =========================================================
   STORE SINGLETON
========================================================= */

export const Store = (() => {
  "use strict";

  let initialized =
    false;

  let initializing =
    false;

  let destroyed =
    false;

  let mutationSeq =
    0;

  let initStartedAt =
    0;

  let initCompletedAt =
    0;

  let lastError =
    null;

  /* =======================================================
     ESTADO INTERNO
  ======================================================= */

  const state =
    buildInitialState(
      AppCore
    );

  /* =======================================================
     LISTENERS
  ======================================================= */

  const listeners =
    new Set();

  const keyListeners =
    new Map();

  const selectorListeners =
    new Set();

  const coreUnsubscribers =
    [];

  /* =======================================================
     BATCH STATE
  ======================================================= */

  let batchDepth =
    0;

  let batchId =
    0;

  let batchPreviousState =
    null;

  let batchStartedAt =
    0;

  const batchChangedPaths =
    new Set();

  /* =======================================================
     SAFE HELPERS
  ======================================================= */

  function nowMs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function nowIso(ms = nowMs()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
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

  function safeNumber(value, fallback = 0) {
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function safeBool(value, fallback = false) {
    if (value === true) return true;
    if (value === false) return false;
    if (value === 1) return true;
    if (value === 0) return false;

    if (typeof value === "string") {
      const clean =
        value.trim().toLowerCase();

      if (
        [
          "true",
          "1",
          "yes",
          "si",
          "sí",
          "on",
          "enabled",
        ].includes(clean)
      ) {
        return true;
      }

      if (
        [
          "false",
          "0",
          "no",
          "off",
          "disabled",
        ].includes(clean)
      ) {
        return false;
      }
    }

    return Boolean(fallback);
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function safeObject(value, fallback = {}) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    )
      ? value
      : fallback;
  }

  function hasOwn(object, key) {
    try {
      return Object.prototype.hasOwnProperty.call(
        object,
        key
      );
    } catch {
      return false;
    }
  }

  function safeClone(value, fallback = null) {
    if (value === undefined) {
      return fallback;
    }

    if (value === null) {
      return null;
    }

    try {
      return deepClone(value);
    } catch {}

    try {
      if (typeof structuredClone === "function") {
        return structuredClone(value);
      }
    } catch {}

    try {
      return JSON.parse(
        JSON.stringify(value)
      );
    } catch {
      return fallback;
    }
  }

  function safeEqual(a, b) {
    try {
      return deepEqual(
        a,
        b
      );
    } catch {}

    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return Object.is(a, b);
    }
  }

  function safeRedactText(value = "") {
    let text =
      safeText(value, "");

    if (!text) {
      return "";
    }

    try {
      text =
        AppCore?.utils?.redactTokenInText?.(text) ||
        text;
    } catch {}

    try {
      text =
        text
          .replace(
            /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
            "$1***"
          )
          .replace(
            /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
            "***"
          )
          .replace(
            /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)([^&#\s]+)/gi,
            "$1***"
          );
    } catch {}

    return text;
  }

  function sanitizeForEvent(value, depth = 0, keyHint = "") {
    if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
      return value
        ? "***"
        : null;
    }

    if (depth > 5) {
      return "[depth-limit]";
    }

    if (
      value === null ||
      value === undefined
    ) {
      return value;
    }

    if (typeof value === "string") {
      return safeRedactText(value);
    }

    if (
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "bigint") {
      return String(value);
    }

    if (typeof value === "function") {
      return "[function]";
    }

    if (value instanceof Error) {
      return {
        name:
          value.name || "Error",

        message:
          safeRedactText(
            value.message || "Error"
          ),

        code:
          value.code || null,

        status:
          value.status ||
          value.statusCode ||
          null,

        stack:
          value.stack
            ? "[stack]"
            : null,
      };
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 100)
        .map((item) =>
          sanitizeForEvent(
            item,
            depth + 1,
            keyHint
          )
        );
    }

    if (
      value &&
      typeof value === "object"
    ) {
      const output = {};

      for (const [key, item] of Object.entries(value).slice(0, 120)) {
        output[key] =
          SENSITIVE_KEY_RE.test(key)
            ? item
              ? "***"
              : null
            : sanitizeForEvent(
                item,
                depth + 1,
                key
              );
      }

      return output;
    }

    try {
      return safeRedactText(
        String(value)
      );
    } catch {
      return "[unserializable]";
    }
  }

  function normalizeError(error = null) {
    if (!error) {
      return null;
    }

    const payload = {
      name:
        safeText(
          error?.name,
          "StoreError"
        ),

      message:
        safeRedactText(
          safeText(
            error?.message || error,
            "Store error."
          )
        ),

      code:
        safeText(
          error?.code ||
            error?.statusCode ||
            "",
          ""
        ),

      status:
        safeNumber(
          error?.status,
          0
        ),

      at:
        nowIso(),
    };

    return payload;
  }

  function recordError(error, source = "store") {
    const payload =
      normalizeError(error);

    lastError = {
      ...payload,
      source:
        safeText(source, STORE_SCOPE),
    };

    safeEmit(
      STORE_EVENTS.error,
      lastError
    );

    return lastError;
  }

  function safeEmit(eventName, payload = {}) {
    const name =
      safeText(eventName, "");

    if (!name) {
      return false;
    }

    const safePayload =
      sanitizeForEvent({
        source:
          STORE_SCOPE,

        version:
          STORE_VERSION,

        ...safeObject(payload),
      });

    try {
      AppCore?.events?.emit?.(
        name,
        safePayload
      );

      return true;
    } catch {
      return false;
    }
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(
        "[Store]",
        ...args.map((item) =>
          sanitizeForEvent(item)
        )
      );
    } catch {}
  }

  function safeWarn(...args) {
    let logged =
      false;

    try {
      if (isFunction(AppCore?.utils?.warn)) {
        AppCore.utils.warn(
          "[Store]",
          ...args.map((item) =>
            sanitizeForEvent(item)
          )
        );

        logged =
          true;
      }
    } catch {
      logged =
        false;
    }

    if (logged) {
      return;
    }

    try {
      if (AppCore?.config?.debug || AppCore?.state?.debug) {
        console.warn(
          "[Store]",
          ...args.map((item) =>
            sanitizeForEvent(item)
          )
        );
      }
    } catch {}
  }

  function safeError(...args) {
    let logged =
      false;

    try {
      if (isFunction(AppCore?.utils?.error)) {
        AppCore.utils.error(
          "[Store]",
          ...args.map((item) =>
            sanitizeForEvent(item)
          )
        );

        logged =
          true;
      }
    } catch {
      logged =
        false;
    }

    if (logged) {
      return;
    }

    try {
      console.error(
        "[Store]",
        ...args.map((item) =>
          sanitizeForEvent(item)
        )
      );
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
        `${method}(path) requiere path.`
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
        `${method}(partialState) requiere un objeto.`
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

    return safeClone(
      value,
      value
    );
  }

  function getRootReadClone() {
    return safeClone(
      state,
      shallowCloneRoot(state)
    );
  }

  function getRootShallowClone() {
    try {
      return shallowCloneRoot(state);
    } catch {
      return {
        ...state,
      };
    }
  }

  function incrementMutationSeq() {
    mutationSeq += 1;
    return mutationSeq;
  }

  function replaceRoot(nextState = {}) {
    const cleanNext =
      safeObject(nextState);

    Object.keys(state).forEach((key) => {
      delete state[key];
    });

    Object.keys(cleanNext).forEach((key) => {
      state[key] =
        cleanNext[key];
    });

    return state;
  }

  function restoreRoot(previousState = {}) {
    replaceRoot(
      safeClone(
        previousState,
        {}
      )
    );

    return state;
  }

  function normalizeChangedPaths(paths = []) {
    return Array.from(
      new Set(
        safeArray(paths)
          .flat(Infinity)
          .map((path) =>
            safeText(path, "")
          )
          .filter(Boolean)
      )
    );
  }

  function pathMayContainSensitiveData(path = "") {
    return SENSITIVE_KEY_RE.test(
      safeText(path, "")
    );
  }

  function sanitizeChangedPaths(paths = []) {
    return normalizeChangedPaths(paths)
      .map((path) =>
        pathMayContainSensitiveData(path)
          ? "[sensitive]"
          : path
      );
  }

  function buildPatchChangedPaths(partialState = {}, previousState = null, nextState = null) {
    let paths = [];

    try {
      paths =
        collectChangedPaths(
          partialState
        );
    } catch {
      paths =
        [];
    }

    if (
      Array.isArray(paths) &&
      paths.length
    ) {
      return normalizeChangedPaths(paths);
    }

    if (
      previousState &&
      nextState &&
      typeof previousState === "object" &&
      typeof nextState === "object"
    ) {
      const keys =
        Array.from(
          new Set([
            ...Object.keys(previousState),
            ...Object.keys(nextState),
          ])
        );

      return normalizeChangedPaths(
        keys.filter((key) =>
          !safeEqual(
            previousState[key],
            nextState[key]
          )
        )
      );
    }

    return normalizeChangedPaths(
      Object.keys(
        safeObject(partialState)
      )
    );
  }

  function getTopLevelChangedPaths(previousState = {}, nextState = {}) {
    const keys =
      Array.from(
        new Set([
          ...Object.keys(
            safeObject(previousState)
          ),
          ...Object.keys(
            safeObject(nextState)
          ),
        ])
      );

    return normalizeChangedPaths(
      keys.filter((key) =>
        !safeEqual(
          previousState?.[key],
          nextState?.[key]
        )
      )
    );
  }

  function touchStoreMeta() {
    try {
      touchMeta(state);
    } catch {
      try {
        state.meta =
          safeObject(state.meta);

        state.meta.updatedAt =
          nowIso();

        state.meta.version =
          state.meta.version || STORE_VERSION;
      } catch {}
    }
  }

  function getCoreSnapshot() {
    try {
      return AppCore?.getSnapshot?.() || null;
    } catch {
      return null;
    }
  }

  /* =======================================================
     READ API
  ======================================================= */

  function snapshot() {
    return safeClone(
      state,
      {}
    );
  }

  function getSnapshot(options = {}) {
    const opts =
      safeObject(options);

    const includeState =
      opts.includeState === true;

    const includeCore =
      opts.includeCore === true;

    return {
      version:
        STORE_VERSION,

      initialized:
        Boolean(initialized),

      initializing:
        Boolean(initializing),

      destroyed:
        Boolean(destroyed),

      mutationSeq,

      listeners:
        listeners.size,

      keyListeners:
        keyListeners.size,

      selectorListeners:
        selectorListeners.size,

      coreUnsubscribers:
        coreUnsubscribers.length,

      batch: {
        depth:
          batchDepth,

        id:
          batchId,

        startedAt:
          batchStartedAt
            ? nowIso(batchStartedAt)
            : "",

        changedPaths:
          sanitizeChangedPaths(
            Array.from(batchChangedPaths)
          ),

        hasPreviousState:
          Boolean(batchPreviousState),
      },

      app: {
        route:
          state.app?.route || null,

        publicPath:
          safeRedactText(
            state.app?.publicPath || ""
          ) || null,
      },

      session: {
        authenticated:
          Boolean(state.session?.authenticated),

        hasToken:
          Boolean(state.session?.hasToken),

        role:
          state.session?.role || null,

        username:
          state.session?.username || null,
      },

      ui: {
        theme:
          state.ui?.theme || null,

        themeMode:
          state.ui?.themeMode || null,

        lang:
          state.ui?.lang || null,
      },

      meta: {
        createdAt:
          state.meta?.createdAt || null,

        updatedAt:
          state.meta?.updatedAt || null,
      },

      init: {
        startedAt:
          initStartedAt
            ? nowIso(initStartedAt)
            : "",

        completedAt:
          initCompletedAt
            ? nowIso(initCompletedAt)
            : "",

        durationMs:
          initStartedAt && initCompletedAt
            ? initCompletedAt - initStartedAt
            : 0,
      },

      lastError,

      state:
        includeState
          ? sanitizeForEvent(snapshot())
          : null,

      core:
        includeCore
          ? getCoreSnapshot()
          : null,

      at:
        nowIso(),
    };
  }

  function get(path = null, fallback = undefined) {
    if (!path) {
      return getRootReadClone();
    }

    const value =
      getByPath(
        state,
        path
      );

    if (value === undefined) {
      return fallback;
    }

    return cloneForRead(value);
  }

  function getRaw(path = null, fallback = undefined) {
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

  function select(selector, fallback = undefined) {
    if (!isFunction(selector)) {
      throw new Error(
        "Store.select(selector) requiere una función."
      );
    }

    try {
      const result =
        selector(
          getRootReadClone()
        );

      return result === undefined
        ? fallback
        : cloneForRead(result);
    } catch (error) {
      recordError(
        error,
        "select"
      );

      safeError(
        "Store select error.",
        error
      );

      return fallback;
    }
  }

  /* =======================================================
     INTERNAL NOTIFY
  ======================================================= */

  function emitChange(changedPaths = [], previousState = {}) {
    const cleanChangedPaths =
      normalizeChangedPaths(changedPaths);

    if (!cleanChangedPaths.length) {
      return false;
    }

    const seq =
      incrementMutationSeq();

    const startedAt =
      nowMs();

    const payload =
      buildPayload(
        snapshot,
        cleanChangedPaths,
        previousState
      );

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
      recordError(
        error,
        "notify"
      );

      safeError(
        "Store notify error.",
        error
      );

      safeEmit(
        STORE_EVENTS.notifyError,
        {
          seq,
          changedPaths:
            sanitizeChangedPaths(cleanChangedPaths),

          message:
            error?.message ||
            String(error),
        }
      );
    }

    safeEmit(
      STORE_EVENTS.change,
      {
        seq,

        changedPaths:
          sanitizeChangedPaths(cleanChangedPaths),

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

      batchStartedAt =
        nowMs();

      batchId += 1;
    }

    batchDepth += 1;

    return batchDepth;
  }

  function queueBatchPaths(changedPaths = []) {
    for (const path of normalizeChangedPaths(changedPaths)) {
      batchChangedPaths.add(path);
    }
  }

  function flushBatchIfReady() {
    if (batchDepth > 0) {
      return false;
    }

    if (!batchPreviousState) {
      return false;
    }

    const changedPaths =
      normalizeChangedPaths(
        Array.from(batchChangedPaths)
      );

    const previousState =
      batchPreviousState;

    const currentBatchId =
      batchId;

    const currentStartedAt =
      batchStartedAt;

    batchPreviousState =
      null;

    batchStartedAt =
      0;

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
        STORE_EVENTS.batchFlush,
        {
          batchId:
            currentBatchId,

          changedCount:
            changedPaths.length,

          changedPaths:
            sanitizeChangedPaths(changedPaths),

          durationMs:
            currentStartedAt
              ? nowMs() - currentStartedAt
              : 0,
        }
      );
    }

    return flushed;
  }

  function emitOrQueueChange(changedPaths = [], previousState = {}) {
    const cleanChangedPaths =
      normalizeChangedPaths(changedPaths);

    if (!cleanChangedPaths.length) {
      return false;
    }

    if (batchDepth > 0) {
      queueBatchPaths(
        cleanChangedPaths
      );

      return true;
    }

    return emitChange(
      cleanChangedPaths,
      previousState
    );
  }

  function clearBatchState() {
    batchDepth =
      0;

    batchPreviousState =
      null;

    batchStartedAt =
      0;

    batchChangedPaths.clear();
  }

  /* =======================================================
     WRITE API
  ======================================================= */

  function set(path, value) {
    const cleanPath =
      assertPath(
        path,
        "Store.set"
      );

    const currentValue =
      getRaw(cleanPath);

    if (
      safeEqual(
        currentValue,
        value
      )
    ) {
      return cloneForRead(currentValue);
    }

    const previousState =
      batchDepth > 0 && batchPreviousState
        ? batchPreviousState
        : snapshot();

    setByPath(
      state,
      cleanPath,
      safeClone(value)
    );

    touchStoreMeta();

    emitOrQueueChange(
      [cleanPath],
      previousState
    );

    return get(cleanPath);
  }

  function patch(partialState = {}) {
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
      Siempre se fusiona sobre un clon.
    */
    const base =
      snapshot();

    const nextState =
      mergeDeep(
        base,
        safeClone(partialState, {})
      );

    if (
      safeEqual(
        state,
        nextState
      )
    ) {
      return getRootReadClone();
    }

    replaceRoot(
      nextState
    );

    touchStoreMeta();

    const changedPaths =
      buildPatchChangedPaths(
        partialState,
        previousState,
        nextState
      );

    emitOrQueueChange(
      changedPaths,
      previousState
    );

    return getRootReadClone();
  }

  function replace(nextState = {}) {
    assertPlainObject(
      nextState,
      "Store.replace"
    );

    const previousState =
      batchDepth > 0 && batchPreviousState
        ? batchPreviousState
        : snapshot();

    const cleanNext =
      safeClone(
        nextState,
        {}
      );

    if (
      safeEqual(
        state,
        cleanNext
      )
    ) {
      return getRootReadClone();
    }

    replaceRoot(
      cleanNext
    );

    touchStoreMeta();

    const changedPaths =
      getTopLevelChangedPaths(
        previousState,
        cleanNext
      );

    emitOrQueueChange(
      changedPaths.length
        ? changedPaths
        : ROOT_CHANGED_PATHS,
      previousState
    );

    return getRootReadClone();
  }

  function update(path, updater) {
    const cleanPath =
      assertPath(
        path,
        "Store.update"
      );

    if (!isFunction(updater)) {
      throw new Error(
        "Store.update(path, updater) requiere una función."
      );
    }

    const currentValue =
      get(cleanPath);

    const nextValue =
      updater(
        safeClone(
          currentValue,
          currentValue
        )
      );

    return set(
      cleanPath,
      nextValue
    );
  }

  function remove(path) {
    const cleanPath =
      assertPath(
        path,
        "Store.remove"
      );

    const currentValue =
      getRaw(cleanPath);

    if (currentValue === undefined) {
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

    touchStoreMeta();

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

    touchStoreMeta();

    emitOrQueueChange(
      ROOT_CHANGED_PATHS,
      previousState
    );

    return getRootReadClone();
  }

  /* =======================================================
     BATCH API
  ======================================================= */

  function beginBatch() {
    const depth =
      startBatchIfNeeded();

    safeEmit(
      STORE_EVENTS.batchStart,
      {
        batchId,
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
      STORE_EVENTS.batchEnd,
      {
        batchId,
        depth:
          batchDepth,
      }
    );

    if (batchDepth > 0) {
      return false;
    }

    return flushBatchIfReady();
  }

  function rollbackBatch(error = null) {
    const hadBatch =
      Boolean(batchPreviousState);

    const currentBatchId =
      batchId;

    if (batchPreviousState) {
      restoreRoot(
        batchPreviousState
      );
    }

    clearBatchState();

    const payload = {
      batchId:
        currentBatchId,

      restored:
        hadBatch,

      message:
        error?.message ||
        String(error || ""),

      at:
        nowIso(),
    };

    safeEmit(
      STORE_EVENTS.batchRollback,
      payload
    );

    return true;
  }

  function withBatch(fn, options = {}) {
    if (!isFunction(fn)) {
      throw new Error(
        "Store.withBatch(fn) requiere una función."
      );
    }

    const opts =
      safeObject(options);

    const rollbackOnError =
      opts.rollbackOnError === true;

    beginBatch();

    let result;

    try {
      result =
        fn(api);
    } catch (error) {
      recordError(
        error,
        "withBatch:sync"
      );

      if (rollbackOnError) {
        rollbackBatch(error);
      } else {
        endBatch();
      }

      safeEmit(
        STORE_EVENTS.batchError,
        {
          batchId,
          phase:
            "sync",
          rollback:
            Boolean(rollbackOnError),
          error:
            normalizeError(error),
        }
      );

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
          recordError(
            error,
            "withBatch:async"
          );

          if (rollbackOnError) {
            rollbackBatch(error);
          } else {
            endBatch();
          }

          safeEmit(
            STORE_EVENTS.batchError,
            {
              batchId,
              phase:
                "async",
              rollback:
                Boolean(rollbackOnError),
              error:
                normalizeError(error),
            }
          );

          throw error;
        });
    }

    endBatch();

    return result;
  }

  /* =======================================================
     COLLECTION HELPERS
  ======================================================= */

  function push(path, item) {
    return update(
      path,
      (current = []) => {
        const list =
          Array.isArray(current)
            ? current
            : [];

        return [
          ...list,
          safeClone(item),
        ];
      }
    );
  }

  function upsertById(path, item, idKey = "id") {
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
          safeClone(
            item,
            item
          );

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
          list.findIndex((entry) =>
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
                ...safeObject(entry),
                ...safeObject(nextItem),
              }
            : entry
        );
      }
    );
  }

  function removeById(path, id, idKey = "id") {
    const cleanIdKey =
      safeText(idKey, "id");

    return update(
      path,
      (current = []) => {
        const list =
          Array.isArray(current)
            ? current
            : [];

        return list.filter((entry) =>
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

  /* =======================================================
     ACTIONS / SELECTORS
  ======================================================= */

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

  /* =======================================================
     SUBSCRIPTIONS
  ======================================================= */

  function subscribe(listener) {
    return createSubscription(
      listeners,
      listener
    );
  }

  function subscribeKey(path, listener, options = {}) {
    const cleanPath =
      assertPath(
        path,
        "Store.subscribeKey"
      );

    return createKeySubscription({
      AppCore,
      keyListeners,
      path:
        cleanPath,
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

  function clearCoreUnsubscribers() {
    try {
      unbindCoreEvents({
        AppCore,
        coreUnsubscribers,
      });

      return true;
    } catch (error) {
      recordError(
        error,
        "core-unbind"
      );

      safeError(
        "Store unbindCoreEvents error.",
        error
      );

      safeEmit(
        STORE_EVENTS.coreUnbindError,
        {
          message:
            error?.message ||
            String(error),
        }
      );

      try {
        while (coreUnsubscribers.length) {
          const dispose =
            coreUnsubscribers.pop();

          try {
            dispose?.();
          } catch {}
        }
      } catch {}

      return false;
    }
  }

  function hydrateFromCoreSafe() {
    try {
      actions?.hydrateFromCore?.();

      return true;
    } catch (error) {
      recordError(
        error,
        "hydrate"
      );

      safeError(
        "Store hydrateFromCore error.",
        error
      );

      safeEmit(
        STORE_EVENTS.hydrateError,
        {
          message:
            error?.message ||
            String(error),
        }
      );

      return false;
    }
  }

  function bindCoreEventsSafe() {
    if (coreUnsubscribers.length > 0) {
      return true;
    }

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
      recordError(
        error,
        "core-bind"
      );

      safeError(
        "Store bindCoreEvents error.",
        error
      );

      safeEmit(
        STORE_EVENTS.coreBindError,
        {
          message:
            error?.message ||
            String(error),
        }
      );

      return false;
    }
  }

  /* =======================================================
     LIFECYCLE
  ======================================================= */

  function init(options = {}) {
    const opts =
      safeObject(options);

    if (initialized && opts.force !== true) {
      safeEmit(
        STORE_EVENTS.initSkip,
        {
          initialized:
            true,

          reason:
            "already-initialized",
        }
      );

      return api;
    }

    if (initializing && opts.force !== true) {
      safeEmit(
        STORE_EVENTS.initSkip,
        {
          initializing:
            true,

          reason:
            "init-in-flight",
        }
      );

      return api;
    }

    initializing =
      true;

    destroyed =
      false;

    initStartedAt =
      nowMs();

    try {
      if (opts.force === true) {
        clearCoreUnsubscribers();
      }

      const shouldHydrate =
        opts.hydrate !== false;

      if (shouldHydrate) {
        hydrateFromCoreSafe();
      }

      bindCoreEventsSafe();

      initialized =
        true;

      initCompletedAt =
        nowMs();

      safeEmit(
        STORE_EVENTS.init,
        {
          initialized:
            true,

          force:
            opts.force === true,

          hydrate:
            shouldHydrate,

          durationMs:
            initCompletedAt - initStartedAt,

          diagnostics:
            getDiagnostics(),
        }
      );

      safeLog(
        "Store inicializado correctamente.",
        {
          route:
            state.app?.route,
          publicPath:
            safeRedactText(
              state.app?.publicPath || ""
            ),
          authenticated:
            state.session?.authenticated,
          theme:
            state.ui?.theme,
          lang:
            state.ui?.lang,
        }
      );

      return api;
    } catch (error) {
      initialized =
        false;

      recordError(
        error,
        "init"
      );

      safeEmit(
        STORE_EVENTS.initError,
        {
          message:
            error?.message ||
            String(error),
          durationMs:
            nowMs() - initStartedAt,
        }
      );

      throw error;
    } finally {
      initializing =
        false;
    }
  }

  function destroy(options = {}) {
    const opts =
      safeObject(options);

    const clearState =
      opts.clearState === true;

    const silent =
      opts.silent === true;

    clearCoreUnsubscribers();

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

      touchStoreMeta();
    }

    initialized =
      false;

    initializing =
      false;

    destroyed =
      true;

    if (!silent) {
      safeEmit(
        STORE_EVENTS.destroy,
        {
          initialized:
            false,

          destroyed:
            true,

          clearState:
            Boolean(clearState),
        }
      );
    }

    return true;
  }

  function isInitialized() {
    return Boolean(initialized);
  }

  function isInitializing() {
    return Boolean(initializing);
  }

  function getDiagnostics() {
    return {
      version:
        STORE_VERSION,

      initialized:
        Boolean(initialized),

      initializing:
        Boolean(initializing),

      destroyed:
        Boolean(destroyed),

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

      batchId,

      batchedPaths:
        batchChangedPaths.size,

      batchedChangedPaths:
        sanitizeChangedPaths(
          Array.from(batchChangedPaths)
        ),

      hasBatchPreviousState:
        Boolean(batchPreviousState),

      stateKeys:
        Object.keys(state),

      route:
        state.app?.route || null,

      publicPath:
        safeRedactText(
          state.app?.publicPath || ""
        ) || null,

      authenticated:
        Boolean(
          state.session?.authenticated
        ),

      hasToken:
        Boolean(
          state.session?.hasToken
        ),

      role:
        state.session?.role || null,

      username:
        state.session?.username || null,

      theme:
        state.ui?.theme || null,

      themeMode:
        state.ui?.themeMode || null,

      lang:
        state.ui?.lang || null,

      lastError,

      at:
        nowIso(),
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
    version:
      STORE_VERSION,

    events:
      STORE_EVENTS,

    state,

    init,
    destroy,

    isInitialized,
    isInitializing,

    get,
    getRaw,

    set,
    patch,
    replace,
    update,
    remove,

    delete:
      remove,

    del:
      remove,

    reset,

    beginBatch,
    endBatch,
    withBatch,
    rollbackBatch,

    snapshot,
    getSnapshot,
    getDebugSnapshot:
      getSnapshot,

    select,

    push,
    upsertById,
    removeById,
    clearCollection,

    subscribe,

    subscribeKey,
    subscribePath:
      subscribeKey,

    subscribeSelector,

    getDiagnostics,

    selectors,
    actions,
  };

  try {
    if (
      typeof window !== "undefined" &&
      window
    ) {
      window.__ONION_STORE__ =
        api;

      window.Store =
        window.Store || api;
    }
  } catch {}

  return api;
})();

export default Store;
