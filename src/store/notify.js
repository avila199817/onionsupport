/* =========================================================
   Onion SPA - Store Notify
   Archivo: src/store/notify.js

   ONION SUPPORT · STORE NOTIFY
   PAYLOADS · GLOBAL / KEY / SELECTOR LISTENERS · FIREBREAK SAFE · 14/10

   Responsabilidades:
   - construir payloads consistentes del store
   - notificar listeners globales
   - notificar listeners por path
   - notificar listeners por selector
   - aislar errores de subscribers
   - evitar mutaciones accidentales
   - deduplicar paths cambiados
   - soportar listeners corruptos sin romper el store
   - mantener payloads estables
   - proteger contra mutaciones cruzadas entre subscribers
   - emitir diagnóstico store:notify sin filtrar secretos
   - soportar Set/Map/Array parcial sin romper
   - soportar path matching padre/hijo bidireccional

   HARDENING EXTREMO:
   - payload clonado por subscriber
   - errores aislados sync/async
   - path matching robusto padre/hijo
   - selector diff seguro
   - snapshots defensivos
   - tolerancia a Maps/Sets corruptos
   - cleanup opcional de listeners corruptos
   - no muta payload base
   - no comparte referencias entre subscribers
   - no rompe si un selector falla
   - no rompe si equalityFn falla
   - no rompe si AppCore está parcial
   - cero throws accidentales durante notify
========================================================= */

import {
  deepClone,
  deepEqual,
  isFunction,
} from "./helpers.js";

/* =========================================================
   VERSION
========================================================= */

export const STORE_NOTIFY_VERSION =
  "14.0.0";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_NOTIFY_EVENT =
  "store:notify";

const STORE_NOTIFY_ERROR_EVENT =
  "store:notify:error";

const STORE_NOTIFY_LISTENER_ERROR_EVENT =
  "store:listener:error";

const STORE_NOTIFY_SELECTOR_ERROR_EVENT =
  "store:selector:error";

const STORE_NOTIFY_KEY_ERROR_EVENT =
  "store:key-listener:error";

const DEFAULT_MAX_CHANGED_PATHS =
  500;

const MAX_SAFE_CLONE_DEPTH =
  8;

const MAX_SAFE_ARRAY_ITEMS =
  2000;

const MAX_SAFE_OBJECT_KEYS =
  500;

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code/i;

const TOKENISH_TEXT_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)[^&#\s]+/gi;

const UNSAFE_PATH_KEYS =
  new Set([
    "__proto__",
    "prototype",
    "constructor",
  ]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isAnyObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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

function safeError(AppCore, label = "Store notify error", error = null, extra = {}) {
  try {
    AppCore?.utils?.error?.(
      label,
      error,
      extra
    );

    return true;
  } catch {}

  try {
    console.error(
      label,
      error,
      extra
    );

    return true;
  } catch {}

  return false;
}

function safeWarn(AppCore, label = "Store notify warning", payload = {}) {
  try {
    AppCore?.utils?.warn?.(
      label,
      payload
    );

    return true;
  } catch {}

  try {
    console.warn(
      label,
      payload
    );

    return true;
  } catch {}

  return false;
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
      payload
    );

    return true;
  } catch {}

  return false;
}

function safeRun(AppCore, label, fn, eventName = STORE_NOTIFY_ERROR_EVENT, extra = {}) {
  try {
    if (isFunction(fn)) {
      const result =
        fn();

      if (
        result &&
        typeof result === "object" &&
        isFunction(result.catch)
      ) {
        result.catch((error) => {
          reportSubscriberError(
            AppCore,
            label,
            error,
            {
              ...extra,
              async:
                true,
              eventName,
            }
          );
        });
      }

      return result;
    }
  } catch (error) {
    reportSubscriberError(
      AppCore,
      label,
      error,
      {
        ...extra,
        async:
          false,
        eventName,
      }
    );
  }

  return undefined;
}

/* =========================================================
   ERROR / REDACTION
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
          "Store notify error."
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
      ) || null,

    stack:
      error?.stack
        ? "[stack]"
        : null,
  };
}

function sanitizeValue(value, depth = 0, keyHint = "") {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value
      ? "***"
      : null;
  }

  if (depth > MAX_SAFE_CLONE_DEPTH) {
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
      .slice(0, MAX_SAFE_ARRAY_ITEMS)
      .map((item) =>
        sanitizeValue(
          item,
          depth + 1,
          keyHint
        )
      );
  }

  if (isAnyObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, MAX_SAFE_OBJECT_KEYS)) {
      output[key] =
        sanitizeValue(
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

function reportSubscriberError(AppCore, label, error, extra = {}) {
  const payload = {
    ok:
      false,

    label:
      safeText(label, "Store notify error"),

    error:
      sanitizeError(error),

    scope:
      safeText(extra.scope, "store:notify"),

    path:
      safeText(extra.path, ""),

    listenerType:
      safeText(extra.listenerType, ""),

    async:
      Boolean(extra.async),

    at:
      safeIsoDate(),
  };

  safeError(
    AppCore,
    payload.label,
    error,
    payload
  );

  safeEmit(
    AppCore,
    extra.eventName || STORE_NOTIFY_ERROR_EVENT,
    payload
  );

  return payload;
}

/* =========================================================
   COLLECTION COERCION
========================================================= */

function toArrayFromSetLike(value) {
  if (!value) {
    return [];
  }

  if (value instanceof Set) {
    return Array.from(value);
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {}
  }

  return [];
}

function safeSet(value) {
  if (value instanceof Set) {
    return value;
  }

  try {
    return new Set(
      toArrayFromSetLike(value)
    );
  } catch {
    return new Set();
  }
}

function safeMap(value) {
  if (value instanceof Map) {
    return value;
  }

  if (Array.isArray(value)) {
    try {
      return new Map(value);
    } catch {
      return new Map();
    }
  }

  if (isObject(value)) {
    try {
      return new Map(
        Object.entries(value)
      );
    } catch {
      return new Map();
    }
  }

  return new Map();
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
      part.trim()
    )
    .filter(Boolean)
    .filter((part) =>
      !isUnsafePathKey(part)
    )
    .join(".");
}

function uniquePaths(changedPaths = []) {
  const limit =
    DEFAULT_MAX_CHANGED_PATHS;

  const paths =
    safeArray(changedPaths)
      .flat(Infinity)
      .map(normalizePath)
      .filter(Boolean)
      .slice(0, limit);

  return Array.from(
    new Set(paths)
  );
}

/**
 * Matching bidireccional:
 *
 * watched: session
 * changed: session.user        => match
 *
 * watched: session.user
 * changed: session             => match
 *
 * watched: session.user
 * changed: ui.theme            => no match
 */
export function pathMatches(watchedPath = "", changedPath = "") {
  const watched =
    normalizePath(watchedPath);

  const changed =
    normalizePath(changedPath);

  if (!watched || !changed) {
    return false;
  }

  return (
    changed === watched ||
    changed.startsWith(`${watched}.`) ||
    watched.startsWith(`${changed}.`)
  );
}

function anyPathMatches(watchedPath = "", changedPaths = []) {
  const path =
    normalizePath(watchedPath);

  if (!path) {
    return false;
  }

  return uniquePaths(changedPaths).some((changedPath) =>
    pathMatches(
      path,
      changedPath
    )
  );
}

function getPathDepth(path = "") {
  const clean =
    normalizePath(path);

  if (!clean) {
    return 0;
  }

  return clean.split(".").length;
}

/* =========================================================
   CLONE / FREEZE
========================================================= */

function safeClone(value, fallback = null) {
  if (value === undefined) {
    return fallback;
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

function clonePayload(payload = {}) {
  const source =
    isObject(payload)
      ? payload
      : {};

  try {
    return deepClone(source);
  } catch {}

  return {
    ...source,

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
      uniquePaths(
        source.changedPaths
      ),
  };
}

function freezeShallow(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function freezePayload(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  try {
    if (Array.isArray(payload.changedPaths)) {
      Object.freeze(payload.changedPaths);
    }
  } catch {}

  return freezeShallow(payload);
}

function buildSubscriberPayload(payload = {}, extra = {}) {
  const base =
    clonePayload(payload);

  const ext =
    safeClone(
      extra,
      {}
    ) || {};

  return freezePayload({
    ...base,
    ...ext,
  });
}

/* =========================================================
   PAYLOAD
========================================================= */

export function buildPayload(snapshot, changedPaths = [], previousState = null) {
  const timestamp =
    safeNow();

  const nextState =
    isFunction(snapshot)
      ? safeRun(
          null,
          "Store snapshot builder error",
          () => snapshot()
        )
      : snapshot;

  return freezePayload({
    version:
      STORE_NOTIFY_VERSION,

    state:
      safeClone(
        nextState,
        {}
      ),

    previousState:
      previousState
        ? safeClone(
            previousState,
            null
          )
        : null,

    changedPaths:
      uniquePaths(changedPaths),

    timestamp,

    timestampIso:
      safeIsoDate(timestamp),
  });
}

/* =========================================================
   GLOBAL LISTENERS
========================================================= */

function shouldRemoveInvalidListeners(options = {}) {
  return options?.cleanupInvalid === true;
}

export function notifyGlobalListeners({
  AppCore,
  listeners,
  payload,
  options = {},
} = {}) {
  const bucket =
    safeSet(listeners);

  if (!bucket.size) {
    return 0;
  }

  let notified =
    0;

  for (const listener of Array.from(bucket)) {
    if (!isFunction(listener)) {
      if (shouldRemoveInvalidListeners(options)) {
        try {
          bucket.delete(listener);
        } catch {}
      }

      continue;
    }

    safeRun(
      AppCore,
      "Store global listener error",
      () => {
        listener(
          buildSubscriberPayload(
            payload,
            {
              listenerType:
                "global",
            }
          )
        );

        notified += 1;
      },
      STORE_NOTIFY_LISTENER_ERROR_EVENT,
      {
        listenerType:
          "global",
      }
    );
  }

  return notified;
}

/* =========================================================
   KEY LISTENERS
========================================================= */

function resolvePathValue(get, path = "") {
  if (!isFunction(get)) {
    return undefined;
  }

  try {
    return get(path);
  } catch {
    return undefined;
  }
}

function normalizeKeyListenerEntry(entry, fallbackPath = "") {
  if (isFunction(entry)) {
    return {
      listener:
        entry,

      once:
        false,

      path:
        fallbackPath,
    };
  }

  if (isObject(entry) && isFunction(entry.listener)) {
    return {
      ...entry,

      path:
        normalizePath(
          entry.path ||
            fallbackPath
        ),

      once:
        entry.once === true,
    };
  }

  return null;
}

function notifyKeyListenerEntry({
  AppCore,
  get,
  payload,
  path,
  changedPaths,
  entry,
  bucket,
} = {}) {
  const normalizedEntry =
    normalizeKeyListenerEntry(
      entry,
      path
    );

  if (!normalizedEntry) {
    return false;
  }

  const listener =
    normalizedEntry.listener;

  if (!isFunction(listener)) {
    return false;
  }

  const value =
    safeClone(
      resolvePathValue(
        get,
        path
      ),
      undefined
    );

  const previousValue =
    payload?.previousState
      ? getValueByPath(
          payload.previousState,
          path
        )
      : undefined;

  safeRun(
    AppCore,
    `Store key listener error (${path})`,
    () => {
      listener(
        buildSubscriberPayload(
          payload,
          {
            listenerType:
              "key",

            path,

            value:
              safeClone(
                value,
                value
              ),

            previousValue:
              safeClone(
                previousValue,
                previousValue
              ),

            matchedPaths:
              changedPaths.filter((changedPath) =>
                pathMatches(
                  path,
                  changedPath
                )
              ),
          }
        )
      );
    },
    STORE_NOTIFY_KEY_ERROR_EVENT,
    {
      listenerType:
        "key",
      path,
    }
  );

  if (normalizedEntry.once === true) {
    try {
      bucket?.delete?.(entry);
    } catch {}
  }

  return true;
}

function getValueByPath(source = {}, path = "") {
  const keys =
    normalizePath(path)
      .split(".")
      .filter(Boolean);

  if (!keys.length) {
    return safeClone(
      source,
      source
    );
  }

  let current =
    source;

  for (const key of keys) {
    if (
      current === null ||
      current === undefined
    ) {
      return undefined;
    }

    current =
      current[key];
  }

  return safeClone(
    current,
    current
  );
}

export function notifyKeyListeners({
  AppCore,
  keyListeners,
  get,
  payload,
  options = {},
} = {}) {
  const map =
    safeMap(keyListeners);

  if (
    !map.size ||
    !isFunction(get)
  ) {
    return 0;
  }

  const changedPaths =
    uniquePaths(payload?.changedPaths);

  if (!changedPaths.length) {
    return 0;
  }

  let notified =
    0;

  const entries =
    Array.from(map.entries())
      .sort(([pathA], [pathB]) =>
        getPathDepth(pathA) - getPathDepth(pathB)
      );

  for (const [watchedPath, bucketRaw] of entries) {
    const path =
      normalizePath(watchedPath);

    if (!path) {
      continue;
    }

    if (
      !anyPathMatches(
        path,
        changedPaths
      )
    ) {
      continue;
    }

    const bucket =
      safeSet(bucketRaw);

    for (const entry of Array.from(bucket)) {
      const ok =
        notifyKeyListenerEntry({
          AppCore,
          get,
          payload,
          path,
          changedPaths,
          entry,
          bucket,
        });

      if (ok) {
        notified += 1;
      } else if (shouldRemoveInvalidListeners(options)) {
        try {
          bucket.delete(entry);
        } catch {}
      }
    }
  }

  return notified;
}

/* =========================================================
   SELECTOR LISTENERS
========================================================= */

function resolveSelectorState({
  shallowCloneRoot,
  state,
}) {
  try {
    if (isFunction(shallowCloneRoot)) {
      return shallowCloneRoot(state);
    }
  } catch {}

  return safeClone(
    state,
    {}
  ) || {};
}

function getSelectorEquality(entry = {}) {
  if (isFunction(entry.equalityFn)) {
    return entry.equalityFn;
  }

  if (isFunction(entry.compare)) {
    return entry.compare;
  }

  return deepEqual;
}

function runSelector(entry, selectorState) {
  try {
    return {
      ok:
        true,

      value:
        entry.selector(selectorState),
    };
  } catch (error) {
    return {
      ok:
        false,

      error,
    };
  }
}

function runEquality(entry, nextValue, previousValue) {
  const equalityFn =
    getSelectorEquality(entry);

  try {
    return Boolean(
      equalityFn(
        nextValue,
        previousValue
      )
    );
  } catch {
    try {
      return deepEqual(
        nextValue,
        previousValue
      );
    } catch {
      return false;
    }
  }
}

function getSelectorListener(entry = {}) {
  if (isFunction(entry.listener)) {
    return entry.listener;
  }

  if (isFunction(entry.callback)) {
    return entry.callback;
  }

  if (isFunction(entry.handler)) {
    return entry.handler;
  }

  return null;
}

export function notifySelectorListeners({
  AppCore,
  selectorListeners,
  shallowCloneRoot,
  state,
  payload,
  options = {},
} = {}) {
  const bucket =
    safeSet(selectorListeners);

  if (!bucket.size) {
    return 0;
  }

  let notified =
    0;

  const selectorState =
    resolveSelectorState({
      shallowCloneRoot,
      state,
    });

  for (const entry of Array.from(bucket)) {
    if (
      !entry ||
      !isFunction(entry.selector)
    ) {
      if (shouldRemoveInvalidListeners(options)) {
        try {
          bucket.delete(entry);
        } catch {}
      }

      continue;
    }

    const listener =
      getSelectorListener(entry);

    if (!isFunction(listener)) {
      if (shouldRemoveInvalidListeners(options)) {
        try {
          bucket.delete(entry);
        } catch {}
      }

      continue;
    }

    const selectorResult =
      runSelector(
        entry,
        selectorState
      );

    if (!selectorResult.ok) {
      reportSubscriberError(
        AppCore,
        "Store selector execution error",
        selectorResult.error,
        {
          listenerType:
            "selector",
          eventName:
            STORE_NOTIFY_SELECTOR_ERROR_EVENT,
        }
      );

      if (entry.removeOnError === true) {
        try {
          bucket.delete(entry);
        } catch {}
      }

      continue;
    }

    const nextValue =
      selectorResult.value;

    const previousValue =
      safeClone(
        entry.lastValue,
        entry.lastValue
      );

    const unchanged =
      runEquality(
        entry,
        nextValue,
        entry.lastValue
      );

    if (unchanged) {
      continue;
    }

    try {
      entry.lastValue =
        safeClone(
          nextValue,
          nextValue
        );
    } catch {
      entry.lastValue =
        nextValue;
    }

    safeRun(
      AppCore,
      "Store selector listener error",
      () => {
        listener(
          buildSubscriberPayload(
            payload,
            {
              listenerType:
                "selector",

              value:
                safeClone(
                  nextValue,
                  nextValue
                ),

              previousValue,

              selectorName:
                safeText(
                  entry.name ||
                    entry.selector?.name ||
                    "",
                  ""
                ),
            }
          )
        );

        notified += 1;
      },
      STORE_NOTIFY_SELECTOR_ERROR_EVENT,
      {
        listenerType:
          "selector",
      }
    );

    if (entry.once === true) {
      try {
        bucket.delete(entry);
      } catch {}
    }
  }

  return notified;
}

/* =========================================================
   FINAL PAYLOAD
========================================================= */

function normalizeFinalPayload({
  payload,
  snapshot,
} = {}) {
  const timestamp =
    safeNumber(
      payload?.timestamp,
      safeNow()
    );

  const state =
    payload?.state ??
    (
      isFunction(snapshot)
        ? safeRun(
            null,
            "Store snapshot builder error",
            () => snapshot()
          )
        : null
    );

  return freezePayload({
    version:
      payload?.version ||
      STORE_NOTIFY_VERSION,

    ...clonePayload(payload || {}),

    state:
      safeClone(
        state,
        {}
      ),

    previousState:
      payload?.previousState
        ? safeClone(
            payload.previousState,
            null
          )
        : null,

    changedPaths:
      uniquePaths(
        payload?.changedPaths
      ),

    timestamp,

    timestampIso:
      payload?.timestampIso ||
      safeIsoDate(timestamp),
  });
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
  options = {},
} = {}) {
  const startedAt =
    safeNow();

  const finalPayload =
    normalizeFinalPayload({
      payload,
      snapshot,
    });

  if (!finalPayload.changedPaths.length) {
    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "no-changed-paths",

      globalListeners:
        0,

      keyListeners:
        0,

      selectorListeners:
        0,

      changedPaths:
        [],
    };
  }

  let globalCount =
    0;

  let keyCount =
    0;

  let selectorCount =
    0;

  try {
    globalCount =
      notifyGlobalListeners({
        AppCore,
        listeners,
        payload:
          finalPayload,
        options,
      });
  } catch (error) {
    reportSubscriberError(
      AppCore,
      "Store global notify phase error",
      error,
      {
        listenerType:
          "global",
        eventName:
          STORE_NOTIFY_ERROR_EVENT,
      }
    );
  }

  try {
    keyCount =
      notifyKeyListeners({
        AppCore,
        keyListeners,
        get,
        payload:
          finalPayload,
        options,
      });
  } catch (error) {
    reportSubscriberError(
      AppCore,
      "Store key notify phase error",
      error,
      {
        listenerType:
          "key",
        eventName:
          STORE_NOTIFY_ERROR_EVENT,
      }
    );
  }

  try {
    selectorCount =
      notifySelectorListeners({
        AppCore,
        selectorListeners,
        shallowCloneRoot,
        state,
        payload:
          finalPayload,
        options,
      });
  } catch (error) {
    reportSubscriberError(
      AppCore,
      "Store selector notify phase error",
      error,
      {
        listenerType:
          "selector",
        eventName:
          STORE_NOTIFY_ERROR_EVENT,
      }
    );
  }

  const result = {
    ok:
      true,

    version:
      STORE_NOTIFY_VERSION,

    globalListeners:
      globalCount,

    keyListeners:
      keyCount,

    selectorListeners:
      selectorCount,

    totalListeners:
      globalCount + keyCount + selectorCount,

    changedPaths:
      finalPayload.changedPaths,

    timestamp:
      finalPayload.timestamp,

    durationMs:
      Math.max(
        0,
        safeNow() - startedAt
      ),
  };

  safeEmit(
    AppCore,
    STORE_NOTIFY_EVENT,
    {
      ...result,

      /*
        No emitimos state/previousState en el evento diagnóstico
        para evitar payloads enormes y leaks indirectos.
      */
      state:
        undefined,

      previousState:
        undefined,
    }
  );

  return result;
}

/* =========================================================
   DEBUG HELPERS
========================================================= */

export function buildNotifySnapshot({
  listeners,
  keyListeners,
  selectorListeners,
} = {}) {
  const keyMap =
    safeMap(keyListeners);

  return {
    version:
      STORE_NOTIFY_VERSION,

    globalListeners:
      safeSet(listeners).size,

    keyListenerPaths:
      Array.from(
        keyMap.keys()
      ).map(normalizePath),

    keyListenerCount:
      Array.from(
        keyMap.values()
      ).reduce((total, bucket) =>
        total + safeSet(bucket).size,
        0
      ),

    selectorListeners:
      safeSet(selectorListeners).size,

    at:
      safeIsoDate(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_NOTIFY_VERSION,

  buildPayload,

  pathMatches,

  notifyGlobalListeners,
  notifyKeyListeners,
  notifySelectorListeners,

  notify,

  buildNotifySnapshot,
};
