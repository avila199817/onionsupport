/* =========================================================
   Onion SPA - Store Subscriptions
   Archivo: src/store/subscriptions.js

   ONION SUPPORT · STORE SUBSCRIPTIONS
   GLOBAL / KEY / SELECTOR SUBSCRIPTIONS · FIREBREAK SAFE · 14/10

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
   - deduplicar subscripciones equivalentes
   - emitir diagnóstico opcional vía AppCore.events
   - tolerar AppCore parcial durante boot
   - cero throws accidentales en ejecución de listeners

   CONTRATO:
   - subscribe(listeners, listener, options)
   - subscribeKey({ AppCore, keyListeners, path, listener, get, snapshot, options })
   - subscribeSelector({ AppCore, selectorListeners, selector, listener, snapshot, shallowCloneRoot, state, options })
   - todos devuelven unsubscribe idempotente
========================================================= */

import {
  isFunction,
  deepClone,
  deepEqual,
} from "./helpers.js";

/* =========================================================
   VERSION
========================================================= */

export const STORE_SUBSCRIPTIONS_VERSION =
  "14.0.0";

/* =========================================================
   EVENTS
========================================================= */

const SUBSCRIPTION_EVENTS =
  Object.freeze({
    add:
      "store:subscription:add",

    remove:
      "store:subscription:remove",

    duplicate:
      "store:subscription:duplicate",

    immediate:
      "store:subscription:immediate",

    error:
      "store:subscription:error",
  });

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_SCOPE =
  "store:subscriptions";

const DEFAULT_LISTENER_LABEL =
  "Store listener error";

const DEFAULT_SELECTOR_LABEL =
  "Store selector error";

const UNSAFE_PATH_KEYS =
  new Set([
    "__proto__",
    "prototype",
    "constructor",
  ]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code/i;

const TOKENISH_TEXT_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)[^&#\s]+/gi;

/* =========================================================
   IDS
========================================================= */

const functionIds =
  new WeakMap();

let nextFunctionId =
  1;

let nextSubscriptionId =
  1;

/* =========================================================
   BASIC HELPERS
========================================================= */

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

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function getFunctionId(fn) {
  if (!isFunction(fn)) {
    return "fn:none";
  }

  try {
    if (!functionIds.has(fn)) {
      functionIds.set(
        fn,
        nextFunctionId++
      );
    }

    return `fn:${functionIds.get(fn)}`;
  } catch {
    return "fn:unknown";
  }
}

function createSubscriptionId(prefix = "sub") {
  const id =
    `${prefix}_${nextSubscriptionId}`;

  nextSubscriptionId += 1;

  return id;
}

function createNoopUnsubscribe() {
  const noop =
    () => false;

  try {
    noop.__storeUnsubscribeNoop =
      true;
  } catch {}

  return noop;
}

/* =========================================================
   LOG / EMIT / ERROR
========================================================= */

function redactText(value = "") {
  const text =
    safeText(value, "");

  if (!text) {
    return "";
  }

  try {
    return text.replace(
      TOKENISH_TEXT_RE,
      (match) => {
        if (/^bearer\s+/i.test(match)) {
          return "Bearer ***";
        }

        if (/^[?&#]/.test(match)) {
          return match.replace(/=.+$/g, "=***");
        }

        return "***";
      }
    );
  } catch {
    return text;
  }
}

function sanitizeError(error = null) {
  if (!error) {
    return null;
  }

  return {
    name:
      safeText(
        error?.name,
        "Error"
      ),

    message:
      redactText(
        safeText(
          error?.message || error,
          "Store subscription error."
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
      error?.status || null,

    stack:
      error?.stack
        ? "[stack]"
        : null,
  };
}

function sanitizePayload(value, depth = 0, keyHint = "") {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value
      ? "***"
      : null;
  }

  if (depth > 4) {
    return "[depth-limit]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (typeof value === "string") {
    return redactText(value);
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
    return sanitizeError(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizePayload(
          item,
          depth + 1,
          keyHint
        )
      );
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] =
        sanitizePayload(
          item,
          depth + 1,
          key
        );
    }

    return output;
  }

  try {
    return redactText(
      String(value)
    );
  } catch {
    return "[unserializable]";
  }
}

function safeEmit(AppCore, eventName, payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      sanitizePayload(payload)
    );

    return true;
  } catch {}

  return false;
}

function reportError(AppCore, label, error, extra = {}) {
  const payload = {
    ok:
      false,

    scope:
      DEFAULT_SCOPE,

    label:
      safeText(label, "Store subscription error"),

    type:
      safeText(extra.type, ""),

    path:
      safeText(extra.path, ""),

    id:
      safeText(extra.id, ""),

    error:
      sanitizeError(error),

    at:
      safeIsoDate(),
  };

  try {
    AppCore?.utils?.error?.(
      payload.label,
      error,
      payload
    );
  } catch {}

  try {
    console.error(
      payload.label,
      error,
      payload
    );
  } catch {}

  safeEmit(
    AppCore,
    SUBSCRIPTION_EVENTS.error,
    payload
  );

  return payload;
}

function safeRun(AppCore, label, fn, fallback = undefined, extra = {}) {
  try {
    if (!isFunction(fn)) {
      return fallback;
    }

    const result =
      fn();

    if (
      result &&
      typeof result === "object" &&
      isFunction(result.catch)
    ) {
      result.catch((error) => {
        reportError(
          AppCore,
          label,
          error,
          {
            ...extra,
            async:
              true,
          }
        );
      });
    }

    return result;
  } catch (error) {
    reportError(
      AppCore,
      label,
      error,
      {
        ...extra,
        async:
          false,
      }
    );

    return fallback;
  }
}

/* =========================================================
   CLONE / FREEZE
========================================================= */

function safeClone(value, fallback = value) {
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

function safeFreeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function clonePayload(payload = {}) {
  const source =
    safeObject(payload);

  return {
    ...safeClone(
      source,
      {}
    ),

    state:
      safeClone(
        source.state,
        null
      ),

    previousState:
      safeClone(
        source.previousState,
        null
      ),

    changedPaths:
      safeArray(source.changedPaths)
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean),
  };
}

/* =========================================================
   PATH HELPERS
========================================================= */

function isUnsafePathKey(key = "") {
  return UNSAFE_PATH_KEYS.has(
    safeText(key, "")
  );
}

function normalizePath(path = "") {
  if (Array.isArray(path)) {
    return path
      .map((part) =>
        safeText(part, "")
      )
      .filter(Boolean)
      .filter((part) =>
        !isUnsafePathKey(part)
      )
      .join(".");
  }

  return safeText(path, "")
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .map((part) =>
      safeText(part, "")
    )
    .filter(Boolean)
    .filter((part) =>
      !isUnsafePathKey(part)
    )
    .join(".");
}

function normalizeChangedPaths(changedPaths = []) {
  return Array.from(
    new Set(
      safeArray(changedPaths)
        .flat(Infinity)
        .map(normalizePath)
        .filter(Boolean)
    )
  );
}

/* =========================================================
   OPTIONS
========================================================= */

function normalizeOptions(options = {}) {
  const opts =
    safeObject(options);

  return {
    immediate:
      opts.immediate === true ||
      opts.fireImmediately === true ||
      opts.emitCurrent === true,

    once:
      opts.once === true,

    label:
      safeText(
        opts.label,
        ""
      ),

    name:
      safeText(
        opts.name,
        ""
      ),

    equalityFn:
      isFunction(opts.equalityFn)
        ? opts.equalityFn
        : isFunction(opts.compare)
          ? opts.compare
          : null,

    AppCore:
      opts.AppCore || null,

    snapshot:
      isFunction(opts.snapshot)
        ? opts.snapshot
        : null,

    get:
      isFunction(opts.get)
        ? opts.get
        : null,

    cleanupInvalid:
      safeBool(
        opts.cleanupInvalid,
        false
      ),

    meta:
      safeObject(
        opts.meta,
        null
      ),
  };
}

function buildSubscriptionMeta({
  id,
  type,
  path = "",
  label = "",
  name = "",
  once = false,
  immediate = false,
  listener = null,
  selector = null,
  meta = null,
} = {}) {
  const createdAtMs =
    safeNow();

  return {
    id:
      safeText(id, ""),

    type:
      safeText(type, ""),

    path:
      normalizePath(path),

    label:
      safeText(label, ""),

    name:
      safeText(name, ""),

    once:
      Boolean(once),

    immediate:
      Boolean(immediate),

    listenerId:
      getFunctionId(listener),

    selectorId:
      selector
        ? getFunctionId(selector)
        : "",

    active:
      true,

    meta:
      meta
        ? safeClone(meta, null)
        : null,

    createdAt:
      safeIsoDate(createdAtMs),

    createdAtMs,

    unsubscribedAt:
      "",

    unsubscribedAtMs:
      0,
  };
}

function emitAdd(AppCore, meta) {
  safeEmit(
    AppCore,
    SUBSCRIPTION_EVENTS.add,
    {
      subscription:
        meta,
    }
  );
}

function emitRemove(AppCore, meta, reason = "unsubscribe") {
  safeEmit(
    AppCore,
    SUBSCRIPTION_EVENTS.remove,
    {
      subscription:
        {
          ...meta,
          active:
            false,
        },

      reason:
        safeText(reason, "unsubscribe"),
    }
  );
}

function emitDuplicate(AppCore, meta) {
  safeEmit(
    AppCore,
    SUBSCRIPTION_EVENTS.duplicate,
    {
      subscription:
        meta,
    }
  );
}

function emitImmediate(AppCore, meta) {
  safeEmit(
    AppCore,
    SUBSCRIPTION_EVENTS.immediate,
    {
      subscription:
        meta,
    }
  );
}

/* =========================================================
   PAYLOAD
========================================================= */

function buildBasePayload({
  snapshot,
  changedPaths = [],
  previousState = null,
} = {}) {
  const timestamp =
    safeNow();

  const currentState =
    isFunction(snapshot)
      ? safeRun(
          null,
          "Store subscription snapshot error",
          () => snapshot(),
          null
        )
      : null;

  return safeFreeze({
    state:
      safeClone(
        currentState,
        currentState
      ),

    previousState:
      previousState
        ? safeClone(
            previousState,
            null
          )
        : null,

    changedPaths:
      normalizeChangedPaths(
        changedPaths
      ),

    timestamp,

    timestampIso:
      safeIsoDate(timestamp),
  });
}

function buildListenerPayload(payload = {}, extra = {}) {
  return safeFreeze({
    ...clonePayload(payload),
    ...safeClone(
      extra,
      {}
    ),
  });
}

function callListener({
  AppCore,
  listener,
  payload,
  label = DEFAULT_LISTENER_LABEL,
  once = false,
  unsubscribe = null,
  type = "",
  id = "",
  path = "",
} = {}) {
  const result =
    safeRun(
      AppCore,
      label,
      () => {
        return listener(
          payload
        );
      },
      undefined,
      {
        type,
        id,
        path,
      }
    );

  if (
    once &&
    isFunction(unsubscribe)
  ) {
    try {
      unsubscribe("once");
    } catch {}
  }

  return result;
}

/* =========================================================
   SELECTOR HELPERS
========================================================= */

function computeSelectorValue({
  AppCore,
  selector,
  shallowCloneRoot,
  state,
  label = DEFAULT_SELECTOR_LABEL,
} = {}) {
  return safeRun(
    AppCore,
    label,
    () => {
      const source =
        isFunction(shallowCloneRoot)
          ? shallowCloneRoot(state)
          : safeClone(
              state,
              {}
            );

      return selector(source);
    },
    undefined,
    {
      type:
        "selector",
    }
  );
}

function areSelectorValuesEqual(previousValue, nextValue, equalityFn = null) {
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

  try {
    return deepEqual(
      previousValue,
      nextValue
    );
  } catch {
    return Object.is(
      previousValue,
      nextValue
    );
  }
}

/* =========================================================
   DEDUPE HELPERS
========================================================= */

function findExistingGlobalWrapper(listeners, listener, options = {}) {
  if (!listeners || !isFunction(listeners[Symbol.iterator])) {
    return null;
  }

  const listenerId =
    getFunctionId(listener);

  const label =
    safeText(options.label, "");

  const once =
    Boolean(options.once);

  for (const item of Array.from(listeners)) {
    try {
      if (
        item?.__storeSubscriptionType === "global" &&
        item?.__storeListenerId === listenerId &&
        item?.__storeLabel === label &&
        item?.__storeOnce === once
      ) {
        return item;
      }
    } catch {}
  }

  return null;
}

function findExistingKeyEntry(bucket, listener, options = {}) {
  if (!bucket || !isFunction(bucket[Symbol.iterator])) {
    return null;
  }

  const listenerId =
    getFunctionId(listener);

  const label =
    safeText(options.label, "");

  const once =
    Boolean(options.once);

  for (const item of Array.from(bucket)) {
    try {
      if (
        item?.__storeSubscriptionType === "key" &&
        item?.listenerId === listenerId &&
        item?.label === label &&
        item?.once === once
      ) {
        return item;
      }
    } catch {}
  }

  return null;
}

function findExistingSelectorEntry(bucket, selector, listener, options = {}) {
  if (!bucket || !isFunction(bucket[Symbol.iterator])) {
    return null;
  }

  const selectorId =
    getFunctionId(selector);

  const listenerId =
    getFunctionId(listener);

  const label =
    safeText(options.label, "");

  const once =
    Boolean(options.once);

  for (const item of Array.from(bucket)) {
    try {
      if (
        item?.__storeSubscriptionType === "selector" &&
        item?.selectorId === selectorId &&
        item?.listenerId === listenerId &&
        item?.label === label &&
        item?.once === once
      ) {
        return item;
      }
    } catch {}
  }

  return null;
}

/* =========================================================
   GLOBAL
========================================================= */

export function subscribe(listeners, listener, options = {}) {
  if (
    !listeners ||
    typeof listeners.add !== "function" ||
    typeof listeners.delete !== "function"
  ) {
    throw new Error(
      "subscribe(listener) requiere un registry Set válido."
    );
  }

  if (!isFunction(listener)) {
    throw new Error(
      "subscribe(listener) requiere una función."
    );
  }

  const opts =
    normalizeOptions(options);

  const AppCore =
    opts.AppCore || null;

  const existing =
    findExistingGlobalWrapper(
      listeners,
      listener,
      opts
    );

  if (existing?.__storeUnsubscribe) {
    emitDuplicate(
      AppCore,
      existing.__storeSubscriptionMeta || {}
    );

    return existing.__storeUnsubscribe;
  }

  const id =
    createSubscriptionId("global");

  const meta =
    buildSubscriptionMeta({
      id,
      type:
        "global",
      label:
        opts.label,
      name:
        opts.name,
      once:
        opts.once,
      immediate:
        opts.immediate,
      listener,
      meta:
        opts.meta,
    });

  let active =
    true;

  function unsubscribe(reason = "unsubscribe") {
    if (!active) {
      return false;
    }

    active =
      false;

    meta.active =
      false;

    meta.unsubscribedAtMs =
      safeNow();

    meta.unsubscribedAt =
      safeIsoDate(
        meta.unsubscribedAtMs
      );

    try {
      listeners.delete(
        wrappedListener
      );
    } catch {}

    emitRemove(
      AppCore,
      meta,
      reason
    );

    return true;
  }

  const wrappedListener =
    function storeGlobalSubscription(payload = {}) {
      if (!active) {
        return;
      }

      callListener({
        AppCore,
        listener,
        once:
          opts.once,
        unsubscribe,
        type:
          "global",
        id,
        label:
          opts.label ||
          DEFAULT_LISTENER_LABEL,
        payload:
          buildListenerPayload(
            payload,
            {
              listenerType:
                "global",

              subscription:
                meta,
            }
          ),
      });
    };

  try {
    wrappedListener.__storeSubscriptionType =
      "global";

    wrappedListener.__storeListenerId =
      getFunctionId(listener);

    wrappedListener.__storeOriginal =
      listener;

    wrappedListener.__storeLabel =
      opts.label;

    wrappedListener.__storeOnce =
      opts.once;

    wrappedListener.__storeSubscriptionMeta =
      meta;

    wrappedListener.__storeUnsubscribe =
      unsubscribe;
  } catch {}

  listeners.add(
    wrappedListener
  );

  emitAdd(
    AppCore,
    meta
  );

  if (
    opts.immediate &&
    opts.snapshot
  ) {
    emitImmediate(
      AppCore,
      meta
    );

    callListener({
      AppCore,
      listener,
      once:
        opts.once,
      unsubscribe,
      type:
        "global",
      id,
      label:
        opts.label ||
        "Store global listener immediate error",
      payload:
        buildListenerPayload(
          buildBasePayload({
            snapshot:
              opts.snapshot,
            changedPaths:
              [],
            previousState:
              null,
          }),
          {
            listenerType:
              "global",
            immediate:
              true,
            subscription:
              meta,
          }
        ),
    });
  }

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
} = {}) {
  const watchedPath =
    normalizePath(path);

  if (
    !watchedPath ||
    !isFunction(listener)
  ) {
    throw new Error(
      "subscribeKey(path, listener) requiere path y función."
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
      "subscribeKey requiere keyListeners Map válido."
    );
  }

  if (
    !isFunction(get) ||
    !isFunction(snapshot)
  ) {
    throw new Error(
      "subscribeKey requiere get() y snapshot() válidos."
    );
  }

  const opts =
    normalizeOptions(options);

  if (!keyListeners.has(watchedPath)) {
    keyListeners.set(
      watchedPath,
      new Set()
    );
  }

  const bucket =
    keyListeners.get(watchedPath);

  const existing =
    findExistingKeyEntry(
      bucket,
      listener,
      opts
    );

  if (existing?.unsubscribe) {
    emitDuplicate(
      AppCore,
      existing.meta || {}
    );

    return existing.unsubscribe;
  }

  const id =
    createSubscriptionId("key");

  const meta =
    buildSubscriptionMeta({
      id,
      type:
        "key",
      path:
        watchedPath,
      label:
        opts.label,
      name:
        opts.name,
      once:
        opts.once,
      immediate:
        opts.immediate,
      listener,
      meta:
        opts.meta,
    });

  let active =
    true;

  function unsubscribe(reason = "unsubscribe") {
    if (!active) {
      return false;
    }

    active =
      false;

    meta.active =
      false;

    meta.unsubscribedAtMs =
      safeNow();

    meta.unsubscribedAt =
      safeIsoDate(
        meta.unsubscribedAtMs
      );

    const currentBucket =
      keyListeners.get(
        watchedPath
      );

    if (currentBucket) {
      try {
        currentBucket.delete(
          entry
        );
      } catch {}

      if (currentBucket.size === 0) {
        try {
          keyListeners.delete(
            watchedPath
          );
        } catch {}
      }
    }

    emitRemove(
      AppCore,
      meta,
      reason
    );

    return true;
  }

  const entry = {
    __storeSubscriptionType:
      "key",

    id,
    type:
      "key",

    path:
      watchedPath,

    listener,

    listenerId:
      getFunctionId(listener),

    label:
      opts.label,

    name:
      opts.name,

    once:
      opts.once,

    active:
      true,

    meta,

    unsubscribe,

    createdAt:
      meta.createdAt,

    createdAtMs:
      meta.createdAtMs,
  };

  bucket.add(
    entry
  );

  emitAdd(
    AppCore,
    meta
  );

  if (opts.immediate) {
    emitImmediate(
      AppCore,
      meta
    );

    const immediatePayload =
      buildListenerPayload(
        buildBasePayload({
          snapshot,
          changedPaths: [
            watchedPath,
          ],
          previousState:
            null,
        }),
        {
          listenerType:
            "key",

          immediate:
            true,

          path:
            watchedPath,

          value:
            safeClone(
              get(watchedPath),
              undefined
            ),

          subscription:
            meta,
        }
      );

    callListener({
      AppCore,
      listener,
      once:
        opts.once,
      unsubscribe,
      type:
        "key",
      id,
      path:
        watchedPath,
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
} = {}) {
  if (
    !isFunction(selector) ||
    !isFunction(listener)
  ) {
    throw new Error(
      "subscribeSelector(selector, listener) requiere dos funciones."
    );
  }

  if (
    !selectorListeners ||
    typeof selectorListeners.add !== "function" ||
    typeof selectorListeners.delete !== "function"
  ) {
    throw new Error(
      "subscribeSelector requiere selectorListeners Set válido."
    );
  }

  if (
    !isFunction(snapshot) ||
    !isFunction(shallowCloneRoot)
  ) {
    throw new Error(
      "subscribeSelector requiere snapshot() y shallowCloneRoot() válidos."
    );
  }

  const opts =
    normalizeOptions(options);

  const existing =
    findExistingSelectorEntry(
      selectorListeners,
      selector,
      listener,
      opts
    );

  if (existing?.unsubscribe) {
    emitDuplicate(
      AppCore,
      existing.meta || {}
    );

    return existing.unsubscribe;
  }

  const id =
    createSubscriptionId("selector");

  const meta =
    buildSubscriptionMeta({
      id,
      type:
        "selector",
      label:
        opts.label,
      name:
        opts.name ||
        selector.name ||
        "",
      once:
        opts.once,
      immediate:
        opts.immediate,
      listener,
      selector,
      meta:
        opts.meta,
    });

  let active =
    true;

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

  function unsubscribe(reason = "unsubscribe") {
    if (!active) {
      return false;
    }

    active =
      false;

    meta.active =
      false;

    meta.unsubscribedAtMs =
      safeNow();

    meta.unsubscribedAt =
      safeIsoDate(
        meta.unsubscribedAtMs
      );

    entry.active =
      false;

    try {
      selectorListeners.delete(
        entry
      );
    } catch {}

    emitRemove(
      AppCore,
      meta,
      reason
    );

    return true;
  }

  const entry = {
    __storeSubscriptionType:
      "selector",

    id,
    type:
      "selector",

    selector,
    listener,

    selectorId:
      getFunctionId(selector),

    listenerId:
      getFunctionId(listener),

    equalityFn:
      opts.equalityFn,

    compare:
      opts.equalityFn,

    label:
      opts.label,

    name:
      opts.name ||
      selector.name ||
      "",

    once:
      opts.once,

    active:
      true,

    lastValue:
      safeClone(
        initialValue,
        initialValue
      ),

    meta,

    unsubscribe,

    createdAt:
      meta.createdAt,

    createdAtMs:
      meta.createdAtMs,
  };

  selectorListeners.add(
    entry
  );

  emitAdd(
    AppCore,
    meta
  );

  if (opts.immediate) {
    emitImmediate(
      AppCore,
      meta
    );

    const payload =
      buildListenerPayload(
        buildBasePayload({
          snapshot,
          changedPaths:
            [],
          previousState:
            null,
        }),
        {
          listenerType:
            "selector",

          immediate:
            true,

          value:
            safeClone(
              entry.lastValue,
              entry.lastValue
            ),

          previousValue:
            undefined,

          selectorName:
            meta.name || null,

          subscription:
            meta,
        }
      );

    callListener({
      AppCore,
      listener,
      once:
        opts.once,
      unsubscribe,
      type:
        "selector",
      id,
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
========================================================= */

export function shouldNotifySelectorEntry(entry, nextValue) {
  if (
    !entry ||
    entry.active === false
  ) {
    return false;
  }

  return !areSelectorValuesEqual(
    entry.lastValue,
    nextValue,
    entry.equalityFn ||
      entry.compare ||
      null
  );
}

/* =========================================================
   SNAPSHOT HELPERS
========================================================= */

function getGlobalSubscriptionEntries(listeners) {
  return Array.from(
    listeners || []
  )
    .filter((item) =>
      item?.__storeSubscriptionType === "global"
    )
    .map((item) => ({
      ...(item.__storeSubscriptionMeta || {}),
      active:
        true,
    }));
}

function getKeySubscriptionEntries(keyListeners) {
  const output =
    [];

  try {
    for (const [path, bucket] of keyListeners.entries()) {
      for (const entry of Array.from(bucket || [])) {
        output.push({
          id:
            entry.id || "",

          type:
            "key",

          path:
            normalizePath(path),

          label:
            entry.label || "",

          name:
            entry.name || "",

          once:
            Boolean(entry.once),

          active:
            entry.active !== false,

          createdAt:
            entry.createdAt || "",

          createdAtMs:
            entry.createdAtMs || 0,
        });
      }
    }
  } catch {}

  return output;
}

function getSelectorSubscriptionEntries(selectorListeners) {
  return Array.from(
    selectorListeners || []
  ).map((entry) => ({
    id:
      entry.id || "",

    type:
      "selector",

    label:
      entry.label || "",

    name:
      entry.name || "",

    selectorName:
      safeText(
        entry.selector?.name,
        ""
      ),

    once:
      Boolean(entry.once),

    active:
      entry.active !== false,

    hasLastValue:
      entry.lastValue !== undefined,

    createdAt:
      entry.createdAt || "",

    createdAtMs:
      entry.createdAtMs || 0,
  }));
}

export function getSubscriptionsSnapshot({
  listeners,
  keyListeners,
  selectorListeners,
} = {}) {
  const globalEntries =
    getGlobalSubscriptionEntries(
      listeners
    );

  const keyEntries =
    getKeySubscriptionEntries(
      keyListeners || new Map()
    );

  const selectorEntries =
    getSelectorSubscriptionEntries(
      selectorListeners || new Set()
    );

  return {
    version:
      STORE_SUBSCRIPTIONS_VERSION,

    counts: {
      global:
        globalEntries.length,

      key:
        keyEntries.length,

      selector:
        selectorEntries.length,

      total:
        globalEntries.length +
        keyEntries.length +
        selectorEntries.length,
    },

    global:
      globalEntries,

    key:
      keyEntries,

    selector:
      selectorEntries,

    at:
      safeIsoDate(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_SUBSCRIPTIONS_VERSION,

  subscribe,
  subscribeKey,
  subscribeSelector,

  shouldNotifySelectorEntry,

  getSubscriptionsSnapshot,
};
