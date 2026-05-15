/* =========================================================
   Onion SPA - Core Cleanup
   Archivo: src/core/cleanup.js

   ONION SUPPORT · CORE CLEANUP
   SCOPED DISPOSERS · DOM/BUS/TIMERS/OBSERVERS · 17/10

   Responsabilidades:
   - gestionar scopes de cleanup del Core
   - registrar listeners DOM por scope
   - registrar listeners de event bus por scope
   - registrar cleaners/disposers manuales por scope
   - limpiar recursos de forma segura e idempotente
   - soportar firmas legacy y modernas
   - evitar duplicados dentro del mismo scope
   - limpiar timers, raf, idle callbacks, observers y abort controllers
   - exponer snapshots de diagnóstico redacted

   Candados:
   - cleanup idempotente real
   - tolerancia total si faltan registry/events/utils
   - soporte DOM: cleanup.on(scope, target, event, handler, options)
   - soporte DOM: cleanup.event(scope, target, event, handler, options)
   - soporte DOM target string: "window" / "document" / "body" / "html"
   - soporte bus: cleanup.event(scope, eventName, handler, options)
   - soporte manual: cleanup.add(scope, disposer, label)
   - soporte timers: timeout / interval
   - soporte frame callbacks: raf / animationFrame / idle
   - soporte observer.disconnect()
   - soporte AbortController.abort(reason)
   - dedupe DOM por target/event/handler/options
   - dedupe bus por event/handler/options
   - once manual robusto para DOM y bus
   - wrappers defensivos contra errores sync/async
   - auto-unregister de recursos one-shot ejecutados
   - aliases: clear/dispose/run/runAll/off
   - cero throws accidentales
========================================================= */

const CLEANUP_VERSION = "17.0.0";

const DEFAULT_SCOPE = "global";
const DEFAULT_MANUAL_LABEL = "manual";

const CLEANUP_EVENTS = Object.freeze({
  ready: "cleanup:ready",
  disposed: "cleanup:disposed",
  error: "cleanup:error",
  scopeRun: "cleanup:scope:run",
  allRun: "cleanup:all:run",
  recordAdded: "cleanup:record:added",
  recordSkipped: "cleanup:record:skipped",
});

const SPECIAL_DOM_TARGETS = Object.freeze([
  "window",
  "document",
  "body",
  "html",
  "documentelement",
  "document-element",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const TOKENISH_TEXT_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)[^&#\s]+/i;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function redactText(value = "") {
  const text = safeText(value, "");

  if (!text) {
    return "";
  }

  try {
    return text
      .replace(/(bearer\s+)([a-z0-9._~+/=-]+)/gi, "$1***")
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/gi, "***");
  } catch {
    return TOKENISH_TEXT_RE.test(text) ? "***" : text;
  }
}

function sanitizeForSnapshot(value, depth = 0, keyHint = "") {
  if (depth > 4) {
    return "[MaxDepth]";
  }

  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : value;
  }

  if (typeof value === "string") {
    return redactText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactText(value.message || ""),
      stack: value.stack ? "[stack]" : "",
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeForSnapshot(item, depth + 1, keyHint));
  }

  if (isPlainObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = sanitizeForSnapshot(item, depth + 1, key);
    }

    return output;
  }

  try {
    return redactText(String(value));
  } catch {
    return "[Unserializable]";
  }
}

function safeWarn(utils, ...args) {
  const cleanArgs = args.map((item) => sanitizeForSnapshot(item));

  try {
    if (isFunction(utils?.warn)) {
      utils.warn("[Cleanup]", ...cleanArgs);
      return;
    }
  } catch {}

  try {
    console.warn("[Cleanup]", ...cleanArgs);
  } catch {}
}

function safeLog(utils, ...args) {
  try {
    utils?.log?.("[Cleanup]", ...args.map((item) => sanitizeForSnapshot(item)));
  } catch {}
}

function safeEmit(events, name, payload = {}) {
  const eventName = safeText(name, "");

  if (!eventName) {
    return false;
  }

  const cleanPayload = sanitizeForSnapshot(payload);

  try {
    if (isFunction(events?.emit)) {
      events.emit(eventName, cleanPayload);
      return true;
    }
  } catch {}

  try {
    if (isFunction(events?.dispatch)) {
      events.dispatch(eventName, cleanPayload);
      return true;
    }
  } catch {}

  try {
    if (isFunction(events?.trigger)) {
      events.trigger(eventName, cleanPayload);
      return true;
    }
  } catch {}

  return false;
}

function ensureMap(value) {
  return value instanceof Map ? value : new Map();
}

function createNoopDisposer() {
  const noop = () => false;

  try {
    noop.__cleanupNoop = true;
  } catch {}

  return noop;
}

/* =========================================================
   ENV HELPERS
========================================================= */

function getWindow() {
  try {
    if (typeof window !== "undefined") {
      return window;
    }
  } catch {}

  return null;
}

function getDocument() {
  try {
    if (typeof document !== "undefined") {
      return document;
    }
  } catch {}

  return null;
}

function getBody() {
  try {
    return getDocument()?.body || null;
  } catch {
    return null;
  }
}

function getHtml() {
  try {
    return getDocument()?.documentElement || null;
  } catch {
    return null;
  }
}

function isEventTargetLike(target) {
  return Boolean(
    target &&
      isFunction(target.addEventListener) &&
      isFunction(target.removeEventListener)
  );
}

function isAbortControllerLike(value) {
  return Boolean(value && isFunction(value.abort) && value.signal);
}

function isObserverLike(value) {
  return Boolean(value && isFunction(value.disconnect));
}

function isSpecialDomTargetName(value = "") {
  return SPECIAL_DOM_TARGETS.includes(safeLower(value));
}

function resolveSpecialTarget(value) {
  const key = safeLower(value);

  if (key === "window") {
    return getWindow();
  }

  if (key === "document") {
    return getDocument();
  }

  if (key === "body") {
    return getBody();
  }

  if (key === "html" || key === "documentelement" || key === "document-element") {
    return getHtml();
  }

  return null;
}

function resolveEventTarget(target) {
  if (isEventTargetLike(target)) {
    return target;
  }

  if (typeof target === "string") {
    return resolveSpecialTarget(target);
  }

  return null;
}

/* =========================================================
   IDS FOR DEDUPE
========================================================= */

const targetIds = new WeakMap();
const handlerIds = new WeakMap();

let nextTargetId = 1;
let nextHandlerId = 1;
let nextResourceId = 1;

function getTargetId(target) {
  if (typeof target === "string") {
    return `target:${safeLower(target, "string")}`;
  }

  if (!target || (typeof target !== "object" && typeof target !== "function")) {
    return "target:none";
  }

  try {
    if (!targetIds.has(target)) {
      targetIds.set(target, nextTargetId++);
    }

    return `target:${targetIds.get(target)}`;
  } catch {
    return "target:unknown";
  }
}

function getHandlerId(handler) {
  if (!isFunction(handler)) {
    return "handler:none";
  }

  try {
    if (!handlerIds.has(handler)) {
      handlerIds.set(handler, nextHandlerId++);
    }

    return `handler:${handlerIds.get(handler)}`;
  } catch {
    return "handler:unknown";
  }
}

function createResourceId(type = "resource") {
  const id = `${safeText(type, "resource")}:${nextResourceId}`;
  nextResourceId += 1;
  return id;
}

/* =========================================================
   OPTIONS NORMALIZATION
========================================================= */

function wantsOnce(options = false) {
  return Boolean(isPlainObject(options) && options.once === true);
}

function normalizeDomOptions(options = false) {
  if (options === true) {
    return { capture: true };
  }

  if (options === false || options === undefined || options === null) {
    return false;
  }

  if (isPlainObject(options)) {
    const finalOptions = {
      capture: Boolean(options.capture),
      passive: Boolean(options.passive),
    };

    if (options.signal) {
      finalOptions.signal = options.signal;
    }

    return finalOptions;
  }

  return false;
}

function normalizeBusOptions(options = false) {
  if (!isPlainObject(options)) {
    return options;
  }

  const { once, target, ...rest } = options;
  return rest;
}

function normalizeOptionsForKey(options = false) {
  if (options === true) {
    return "capture:true|once:false|passive:false|signal:false|target:default";
  }

  if (options === false || options === undefined || options === null) {
    return "capture:false|once:false|passive:false|signal:false|target:default";
  }

  if (isPlainObject(options)) {
    const target = options.target
      ? typeof options.target === "string"
        ? `target:${safeLower(options.target, "custom")}`
        : getTargetId(options.target)
      : "target:default";

    return [
      `capture:${Boolean(options.capture)}`,
      `once:${Boolean(options.once)}`,
      `passive:${Boolean(options.passive)}`,
      `signal:${Boolean(options.signal)}`,
      target,
    ].join("|");
  }

  return String(options);
}

function makeDomKey(target, eventName, handler, options) {
  return [
    "dom",
    getTargetId(target),
    safeText(eventName, ""),
    getHandlerId(handler),
    normalizeOptionsForKey(options),
  ].join("::");
}

function makeBusKey(eventName, handler, options = false) {
  return [
    "bus",
    safeText(eventName, ""),
    getHandlerId(handler),
    normalizeOptionsForKey(options),
  ].join("::");
}

function makeManualKey(disposer, label = DEFAULT_MANUAL_LABEL) {
  return [
    "manual",
    getHandlerId(disposer),
    safeText(label, DEFAULT_MANUAL_LABEL),
  ].join("::");
}

function makeResourceKey(type = "resource", id = "", label = "") {
  return [
    safeText(type, "resource"),
    safeText(id, createResourceId(type)),
    safeText(label, ""),
  ].join("::");
}

/* =========================================================
   SCOPE NORMALIZATION
========================================================= */

function createScopeRecord(name = DEFAULT_SCOPE) {
  const createdAtMs = safeNow();

  return {
    name: safeText(name, DEFAULT_SCOPE),

    listeners: [],
    cleaners: [],
    disposers: [],

    keys: new Set(),
    records: new Map(),

    running: false,
    disposed: false,

    createdAt: safeIsoDate(createdAtMs),
    createdAtMs,

    lastRunAt: "",
    lastRunAtMs: 0,

    runCount: 0,
    disposedCount: 0,
    failedCount: 0,
    addedCount: 0,
    skippedCount: 0,
    manualDisposeCount: 0,
  };
}

function normalizeScopeRecord(scope, name = DEFAULT_SCOPE) {
  if (
    scope &&
    isObject(scope) &&
    Array.isArray(scope.listeners) &&
    Array.isArray(scope.cleaners)
  ) {
    if (!Array.isArray(scope.disposers)) scope.disposers = [];
    if (!(scope.keys instanceof Set)) scope.keys = new Set();
    if (!(scope.records instanceof Map)) scope.records = new Map();

    scope.name = safeText(scope.name, name || DEFAULT_SCOPE);
    scope.running = Boolean(scope.running);
    scope.disposed = Boolean(scope.disposed);
    scope.createdAt = safeText(scope.createdAt, safeIsoDate());
    scope.createdAtMs = safeNumber(scope.createdAtMs, safeNow());
    scope.lastRunAt = safeText(scope.lastRunAt, "");
    scope.lastRunAtMs = safeNumber(scope.lastRunAtMs, 0);
    scope.runCount = safeNumber(scope.runCount, 0);
    scope.disposedCount = safeNumber(scope.disposedCount, 0);
    scope.failedCount = safeNumber(scope.failedCount, 0);
    scope.addedCount = safeNumber(scope.addedCount, scope.records.size);
    scope.skippedCount = safeNumber(scope.skippedCount, 0);
    scope.manualDisposeCount = safeNumber(scope.manualDisposeCount, 0);

    return scope;
  }

  if (scope instanceof Set) {
    const record = createScopeRecord(name);

    for (const disposer of Array.from(scope)) {
      if (!isFunction(disposer)) {
        continue;
      }

      const key = makeManualKey(disposer, "legacy-set");

      const wrapped = () => {
        try {
          disposer();
          return true;
        } catch {
          return false;
        }
      };

      record.keys.add(key);
      record.records.set(key, {
        key,
        type: "manual",
        label: "legacy-set",
        disposer: wrapped,
        dispose: disposer,
        createdAt: safeIsoDate(),
        createdAtMs: safeNow(),
        disposed: false,
      });

      record.cleaners.push(wrapped);
      record.disposers.push(wrapped);
    }

    record.addedCount = record.records.size;
    return record;
  }

  return createScopeRecord(name);
}

function normalizeScopeName(value = DEFAULT_SCOPE) {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_SCOPE;
  }

  if (typeof value === "string") {
    return safeText(value, DEFAULT_SCOPE);
  }

  return DEFAULT_SCOPE;
}

/* =========================================================
   ARG NORMALIZATION
========================================================= */

function normalizeAddArgs(args = []) {
  const first = args[0];
  const second = args[1];
  const third = args[2];

  if (isPlainObject(first) && isFunction(first.disposer)) {
    return {
      scopeName: normalizeScopeName(first.scope || first.scopeName || DEFAULT_SCOPE),
      disposer: first.disposer,
      label: safeText(first.label, DEFAULT_MANUAL_LABEL),
    };
  }

  if (isFunction(first)) {
    return {
      scopeName: DEFAULT_SCOPE,
      disposer: first,
      label: safeText(second, DEFAULT_MANUAL_LABEL),
    };
  }

  if (typeof first === "string" && isFunction(second)) {
    return {
      scopeName: normalizeScopeName(first),
      disposer: second,
      label: safeText(third, DEFAULT_MANUAL_LABEL),
    };
  }

  if (typeof first === "string" && typeof second === "string" && isFunction(third)) {
    return {
      scopeName: normalizeScopeName(first),
      disposer: third,
      label: safeText(second, DEFAULT_MANUAL_LABEL),
    };
  }

  if (isPlainObject(second) && isFunction(second.disposer)) {
    return {
      scopeName: normalizeScopeName(first),
      disposer: second.disposer,
      label: safeText(second.label || third, DEFAULT_MANUAL_LABEL),
    };
  }

  return {
    scopeName: normalizeScopeName(first),
    disposer: second,
    label: safeText(third, DEFAULT_MANUAL_LABEL),
  };
}

function normalizeTimerArgs(fnOrDelay, delayOrFn, label = "") {
  let fn = fnOrDelay;
  let delay = delayOrFn;

  if (typeof fnOrDelay === "number" && isFunction(delayOrFn)) {
    fn = delayOrFn;
    delay = fnOrDelay;
  }

  return {
    fn,
    delay: Math.max(0, safeNumber(delay, 0)),
    label: safeText(label, "timer"),
  };
}

/* =========================================================
   FACTORY
========================================================= */

export function createCleanup(input = {}) {
  const hasDepsShape =
    isPlainObject(input) &&
    (
      Object.prototype.hasOwnProperty.call(input, "registry") ||
      Object.prototype.hasOwnProperty.call(input, "events") ||
      Object.prototype.hasOwnProperty.call(input, "bus") ||
      Object.prototype.hasOwnProperty.call(input, "utils") ||
      Object.prototype.hasOwnProperty.call(input, "logger")
    );

  const deps = hasDepsShape
    ? input
    : {
        registry: isObject(input) ? input : {},
      };

  const registry = isObject(deps.registry) ? deps.registry : {};
  const events = deps.events || deps.bus || registry.events || registry.bus || null;
  const utils = deps.utils || deps.logger || registry.utils || registry.logger || null;

  registry.scopes = ensureMap(registry.scopes);

  function reportError({
    scope,
    key = "",
    type = "cleanup",
    label = "",
    error,
    source = "cleanup",
  } = {}) {
    const payload = {
      scope: scope?.name || "",
      key: redactText(key || ""),
      type: safeText(type, "cleanup"),
      label: redactText(label || ""),
      source: safeText(source, "cleanup"),
      message: redactText(safeText(error?.message || error, "Cleanup error.")),
      name: safeText(error?.name, "Error"),
      at: safeIsoDate(),
    };

    safeWarn(
      utils,
      `Error limpiando "${payload.label || payload.type}" en scope "${payload.scope || DEFAULT_SCOPE}".`,
      error
    );

    safeEmit(events, CLEANUP_EVENTS.error, payload);

    return payload;
  }

  function ensureScope(name = DEFAULT_SCOPE) {
    const scopeName = normalizeScopeName(name);
    const existing = registry.scopes.get(scopeName);
    const normalized = normalizeScopeRecord(existing, scopeName);

    if (existing !== normalized) {
      registry.scopes.set(scopeName, normalized);
    }

    return normalized;
  }

  function hasScope(name = DEFAULT_SCOPE) {
    return registry.scopes.has(normalizeScopeName(name));
  }

  function getScope(name = DEFAULT_SCOPE) {
    return ensureScope(name);
  }

  function removeRecordFromScope(scope, key = "") {
    if (!scope || !key) {
      return false;
    }

    const record = scope.records?.get?.(key);

    if (!record) {
      return false;
    }

    const disposer = record.disposer;

    try {
      scope.records.delete(key);
    } catch {}

    try {
      scope.keys?.delete?.(key);
    } catch {}

    scope.listeners = safeArray(scope.listeners).filter((item) => item !== disposer);
    scope.cleaners = safeArray(scope.cleaners).filter((item) => item !== disposer);
    scope.disposers = safeArray(scope.disposers).filter((item) => item !== disposer);

    return true;
  }

  function disposeRecordInternal(scope, key = "", reason = "manual") {
    if (!scope || !key) {
      return { ran: false, ok: false, failed: false, missing: true };
    }

    const record = scope.records?.get?.(key);

    if (!record) {
      return { ran: false, ok: false, failed: false, missing: true };
    }

    if (record.disposed === true) {
      removeRecordFromScope(scope, key);
      return { ran: false, ok: false, failed: false, disposed: true };
    }

    record.disposed = true;
    record.disposedAt = safeIsoDate();
    record.disposedReason = safeText(reason, "manual");

    try {
      const result = isFunction(record.dispose) ? record.dispose() : undefined;

      if (result && typeof result === "object" && isFunction(result.catch)) {
        result.catch((error) => {
          reportError({
            scope,
            key,
            type: record.type,
            label: record.label,
            error,
            source: `${record.type}:async`,
          });
        });
      }

      safeEmit(events, CLEANUP_EVENTS.disposed, {
        scope: scope?.name || "",
        key: redactText(key),
        type: record.type || "manual",
        label: redactText(record.label || ""),
        reason: record.disposedReason,
        at: record.disposedAt,
      });

      removeRecordFromScope(scope, key);

      return { ran: true, ok: true, failed: false };
    } catch (error) {
      reportError({
        scope,
        key,
        type: record.type,
        label: record.label,
        error,
        source: record.type || "cleanup",
      });

      removeRecordFromScope(scope, key);

      return { ran: true, ok: false, failed: true };
    }
  }

  function pushRecord(scope, key, recordInput = {}) {
    if (!scope || !key || !isFunction(recordInput.dispose)) {
      return createNoopDisposer();
    }

    if (scope.keys.has(key)) {
      const existing = scope.records.get(key);

      scope.skippedCount = safeNumber(scope.skippedCount, 0) + 1;

      safeEmit(events, CLEANUP_EVENTS.recordSkipped, {
        scope: scope.name,
        key: redactText(key),
        type: existing?.type || recordInput.type || "unknown",
        label: redactText(existing?.label || recordInput.label || ""),
        reason: "duplicate",
        at: safeIsoDate(),
      });

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    const publicDisposer = () => {
      const result = disposeRecordInternal(scope, key, "manual");

      if (result.ran) {
        scope.manualDisposeCount = safeNumber(scope.manualDisposeCount, 0) + 1;
      }

      return result.ok === true;
    };

    try {
      publicDisposer.__cleanupWrapped = true;
      publicDisposer.__cleanupType = safeText(recordInput.type, "manual");
      publicDisposer.__cleanupKey = key;
      publicDisposer.__cleanupLabel = safeText(recordInput.label, "");
      publicDisposer.__cleanupScope = scope?.name || "";
    } catch {}

    const createdAtMs = safeNow();

    const record = {
      key,
      type: safeText(recordInput.type, "manual"),
      label: safeText(recordInput.label, ""),
      eventName: safeText(recordInput.eventName, ""),
      targetType: safeText(recordInput.targetType, ""),
      createdAt: safeIsoDate(createdAtMs),
      createdAtMs,
      disposed: false,
      disposedAt: "",
      disposedReason: "",
      dispose: recordInput.dispose,
      disposer: publicDisposer,
    };

    scope.keys.add(key);
    scope.records.set(key, record);

    if (record.type === "dom") {
      scope.listeners.push(publicDisposer);
    } else {
      scope.cleaners.push(publicDisposer);
    }

    scope.disposers.push(publicDisposer);
    scope.disposed = false;
    scope.addedCount = safeNumber(scope.addedCount, 0) + 1;

    safeEmit(events, CLEANUP_EVENTS.recordAdded, {
      scope: scope.name,
      key: redactText(key),
      type: record.type,
      label: redactText(record.label),
      eventName: redactText(record.eventName),
      targetType: record.targetType,
      at: record.createdAt,
    });

    return publicDisposer;
  }

  function callHandlerSafely({
    scope,
    key = "",
    type = "handler",
    label = "",
    handler,
    thisArg = null,
    args = [],
  } = {}) {
    if (!isFunction(handler)) {
      return false;
    }

    try {
      const result = handler.apply(thisArg, safeArray(args));

      if (result && typeof result === "object" && isFunction(result.catch)) {
        result.catch((error) => {
          reportError({
            scope,
            key,
            type,
            label,
            error,
            source: `${type}:async-handler`,
          });
        });
      }

      return true;
    } catch (error) {
      reportError({
        scope,
        key,
        type,
        label,
        error,
        source: `${type}:handler`,
      });

      return false;
    }
  }

  function registerDomListener(
    scopeName = DEFAULT_SCOPE,
    target,
    eventName,
    handler,
    options = false
  ) {
    const scope = ensureScope(scopeName);
    const finalTarget = resolveEventTarget(target);
    const cleanEvent = safeText(eventName, "");

    if (!isEventTargetLike(finalTarget) || !cleanEvent || !isFunction(handler)) {
      return createNoopDisposer();
    }

    const key = makeDomKey(finalTarget, cleanEvent, handler, options);

    if (scope.keys.has(key)) {
      const existing = scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    const once = wantsOnce(options);
    const domOptions = normalizeDomOptions(options);

    let publicDisposer = null;

    const wrappedHandler = function cleanupDomHandler(eventObject) {
      if (once) {
        try {
          publicDisposer?.();
        } catch {}
      }

      return callHandlerSafely({
        scope,
        key,
        type: "dom",
        label: cleanEvent,
        handler,
        thisArg: this,
        args: [eventObject],
      });
    };

    try {
      finalTarget.addEventListener(cleanEvent, wrappedHandler, domOptions);
    } catch (error) {
      reportError({
        scope,
        key,
        type: "dom",
        label: cleanEvent,
        error,
        source: "dom:addEventListener",
      });

      return createNoopDisposer();
    }

    publicDisposer = pushRecord(scope, key, {
      type: "dom",
      label: cleanEvent,
      eventName: cleanEvent,
      targetType: finalTarget?.constructor?.name || typeof finalTarget,
      dispose: () => {
        finalTarget.removeEventListener(cleanEvent, wrappedHandler, domOptions);
      },
    });

    return publicDisposer;
  }

  function registerBusListener(scopeName = DEFAULT_SCOPE, eventName, handler, options = false) {
    const scope = ensureScope(scopeName);
    const cleanEvent = safeText(eventName, "");

    if (!cleanEvent || !isFunction(handler)) {
      return createNoopDisposer();
    }

    if (!isFunction(events?.on)) {
      return createNoopDisposer();
    }

    const key = makeBusKey(cleanEvent, handler, options);

    if (scope.keys.has(key)) {
      const existing = scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    const once = wantsOnce(options);
    const busOptions = normalizeBusOptions(options);

    let publicDisposer = null;

    const wrappedHandler = function cleanupBusHandler(eventObject) {
      if (once) {
        try {
          publicDisposer?.();
        } catch {}
      }

      return callHandlerSafely({
        scope,
        key,
        type: "bus",
        label: cleanEvent,
        handler,
        thisArg: this,
        args: [eventObject],
      });
    };

    let offBus = null;

    try {
      offBus = events.on(cleanEvent, wrappedHandler, busOptions);
    } catch (error) {
      reportError({
        scope,
        key,
        type: "bus",
        label: cleanEvent,
        error,
        source: "bus:on",
      });

      return createNoopDisposer();
    }

    if (!isFunction(offBus)) {
      offBus = () => {
        try {
          events?.off?.(cleanEvent, wrappedHandler, busOptions);
        } catch {}
      };
    }

    publicDisposer = pushRecord(scope, key, {
      type: "bus",
      label: cleanEvent,
      eventName: cleanEvent,
      targetType: "event-bus",
      dispose: offBus,
    });

    return publicDisposer;
  }

  function add(...args) {
    const normalized = normalizeAddArgs(args);
    const scope = ensureScope(normalized.scopeName);

    if (!isFunction(normalized.disposer)) {
      return createNoopDisposer();
    }

    const key = makeManualKey(normalized.disposer, normalized.label);

    if (scope.keys.has(key)) {
      const existing = scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    return pushRecord(scope, key, {
      type: "manual",
      label: normalized.label,
      targetType: "manual",
      dispose: normalized.disposer,
    });
  }

  function on(scopeName = DEFAULT_SCOPE, target, eventName, handler, options = false) {
    /*
      Principal:
        cleanup.on(scope, target, event, handler, options)

      Legacy DOM:
        cleanup.on(target, event, handler, options)
    */

    if (
      (
        isEventTargetLike(scopeName) ||
        (typeof scopeName === "string" && isSpecialDomTargetName(scopeName))
      ) &&
      typeof target === "string" &&
      isFunction(eventName)
    ) {
      return registerDomListener(
        DEFAULT_SCOPE,
        scopeName,
        target,
        eventName,
        handler || false
      );
    }

    return registerDomListener(scopeName, target, eventName, handler, options);
  }

  function event(scopeName = DEFAULT_SCOPE, targetOrName, eventNameOrHandler, handlerOrOptions, maybeOptions) {
    /*
      DOM:
        cleanup.event(scope, window, "resize", handler, options)
        cleanup.event(scope, "window", "resize", handler, options)

      Bus:
        cleanup.event(scope, "app:ready", handler, options)

      Legacy:
        cleanup.event("app:ready", handler, options)
        cleanup.event("window", "resize", handler, options)
    */

    if (
      typeof scopeName === "string" &&
      isSpecialDomTargetName(scopeName) &&
      typeof targetOrName === "string" &&
      isFunction(eventNameOrHandler)
    ) {
      return registerDomListener(
        DEFAULT_SCOPE,
        scopeName,
        targetOrName,
        eventNameOrHandler,
        handlerOrOptions || false
      );
    }

    if (typeof scopeName === "string" && isFunction(targetOrName)) {
      return registerBusListener(
        DEFAULT_SCOPE,
        scopeName,
        targetOrName,
        eventNameOrHandler || false
      );
    }

    const looksLikeDomSignature =
      isEventTargetLike(targetOrName) ||
      (
        typeof targetOrName === "string" &&
        isSpecialDomTargetName(targetOrName) &&
        typeof eventNameOrHandler === "string" &&
        isFunction(handlerOrOptions)
      );

    if (looksLikeDomSignature) {
      return registerDomListener(
        scopeName,
        targetOrName,
        eventNameOrHandler,
        handlerOrOptions,
        maybeOptions || false
      );
    }

    return registerBusListener(
      scopeName,
      targetOrName,
      eventNameOrHandler,
      handlerOrOptions || false
    );
  }

  function bus(scopeName = DEFAULT_SCOPE, eventName, handler, options = false) {
    if (typeof scopeName === "string" && isFunction(eventName)) {
      return registerBusListener(
        DEFAULT_SCOPE,
        scopeName,
        eventName,
        handler || false
      );
    }

    return registerBusListener(scopeName, eventName, handler, options);
  }

  function windowEvent(scopeName = DEFAULT_SCOPE, eventName, handler, options = false) {
    return registerDomListener(scopeName, "window", eventName, handler, options);
  }

  function documentEvent(scopeName = DEFAULT_SCOPE, eventName, handler, options = false) {
    return registerDomListener(scopeName, "document", eventName, handler, options);
  }

  function timeout(scopeName = DEFAULT_SCOPE, fnOrDelay, delayOrFn = 0, label = "timeout") {
    if (isFunction(scopeName) || typeof scopeName === "number") {
      return timeout(DEFAULT_SCOPE, scopeName, fnOrDelay, delayOrFn || "timeout");
    }

    const args = normalizeTimerArgs(fnOrDelay, delayOrFn, label);

    if (!isFunction(args.fn)) {
      return createNoopDisposer();
    }

    const scope = ensureScope(scopeName);
    let key = "";

    const timerId = setTimeout(() => {
      callHandlerSafely({
        scope,
        key,
        type: "timeout",
        label: args.label,
        handler: args.fn,
        thisArg: null,
        args: [],
      });

      if (key) {
        disposeRecordInternal(scope, key, "timeout-fired");
      }
    }, args.delay);

    key = makeResourceKey("timeout", createResourceId("timeout"), args.label);

    return pushRecord(scope, key, {
      type: "timeout",
      label: args.label,
      targetType: "timer",
      dispose: () => {
        clearTimeout(timerId);
      },
    });
  }

  function interval(scopeName = DEFAULT_SCOPE, fnOrDelay, delayOrFn = 0, label = "interval") {
    if (isFunction(scopeName) || typeof scopeName === "number") {
      return interval(DEFAULT_SCOPE, scopeName, fnOrDelay, delayOrFn || "interval");
    }

    const args = normalizeTimerArgs(fnOrDelay, delayOrFn, label);

    if (!isFunction(args.fn)) {
      return createNoopDisposer();
    }

    const scope = ensureScope(scopeName);
    const key = makeResourceKey("interval", createResourceId("interval"), args.label);

    const timerId = setInterval(() => {
      callHandlerSafely({
        scope,
        key,
        type: "interval",
        label: args.label,
        handler: args.fn,
        thisArg: null,
        args: [],
      });
    }, args.delay);

    return pushRecord(scope, key, {
      type: "interval",
      label: args.label,
      targetType: "timer",
      dispose: () => {
        clearInterval(timerId);
      },
    });
  }

  function raf(scopeName = DEFAULT_SCOPE, fn, label = "raf") {
    if (isFunction(scopeName)) {
      return raf(DEFAULT_SCOPE, scopeName, fn || "raf");
    }

    const win = getWindow();

    if (!win || !isFunction(win.requestAnimationFrame)) {
      return timeout(scopeName, fn, 0, label);
    }

    if (!isFunction(fn)) {
      return createNoopDisposer();
    }

    const scope = ensureScope(scopeName);
    let key = "";

    const frameId = win.requestAnimationFrame((time) => {
      callHandlerSafely({
        scope,
        key,
        type: "raf",
        label,
        handler: fn,
        thisArg: null,
        args: [time],
      });

      if (key) {
        disposeRecordInternal(scope, key, "raf-fired");
      }
    });

    key = makeResourceKey("raf", createResourceId("raf"), label);

    return pushRecord(scope, key, {
      type: "raf",
      label,
      targetType: "animation-frame",
      dispose: () => {
        try {
          win.cancelAnimationFrame(frameId);
        } catch {}
      },
    });
  }

  function idle(scopeName = DEFAULT_SCOPE, fn, options = {}, label = "idle") {
    if (isFunction(scopeName)) {
      return idle(DEFAULT_SCOPE, scopeName, fn || {}, options || "idle");
    }

    const win = getWindow();

    if (!win || !isFunction(win.requestIdleCallback)) {
      return timeout(scopeName, fn, 0, label);
    }

    if (!isFunction(fn)) {
      return createNoopDisposer();
    }

    const scope = ensureScope(scopeName);
    let key = "";

    const idleId = win.requestIdleCallback((deadline) => {
      callHandlerSafely({
        scope,
        key,
        type: "idle",
        label,
        handler: fn,
        thisArg: null,
        args: [deadline],
      });

      if (key) {
        disposeRecordInternal(scope, key, "idle-fired");
      }
    }, isPlainObject(options) ? options : {});

    key = makeResourceKey("idle", createResourceId("idle"), label);

    return pushRecord(scope, key, {
      type: "idle",
      label,
      targetType: "idle-callback",
      dispose: () => {
        try {
          win.cancelIdleCallback(idleId);
        } catch {}
      },
    });
  }

  function observer(scopeName = DEFAULT_SCOPE, observerRef, label = "observer") {
    if (isObserverLike(scopeName)) {
      return observer(DEFAULT_SCOPE, scopeName, observerRef || "observer");
    }

    const scope = ensureScope(scopeName);

    if (!isObserverLike(observerRef)) {
      return createNoopDisposer();
    }

    const key = makeResourceKey("observer", getTargetId(observerRef), label);

    if (scope.keys.has(key)) {
      const existing = scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    return pushRecord(scope, key, {
      type: "observer",
      label,
      targetType: observerRef?.constructor?.name || "observer",
      dispose: () => {
        observerRef.disconnect();
      },
    });
  }

  function abortController(
    scopeName = DEFAULT_SCOPE,
    controller,
    label = "abort-controller",
    reason = "cleanup"
  ) {
    if (isAbortControllerLike(scopeName)) {
      return abortController(
        DEFAULT_SCOPE,
        scopeName,
        controller || "abort-controller",
        label || "cleanup"
      );
    }

    const scope = ensureScope(scopeName);

    if (!isAbortControllerLike(controller)) {
      return createNoopDisposer();
    }

    const key = makeResourceKey("abort", getTargetId(controller), label);

    if (scope.keys.has(key)) {
      const existing = scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    return pushRecord(scope, key, {
      type: "abort",
      label,
      targetType: "AbortController",
      dispose: () => {
        try {
          controller.abort(reason);
        } catch {
          try {
            controller.abort();
          } catch {}
        }
      },
    });
  }

  function off(scopeName = DEFAULT_SCOPE, keyOrDisposer = "") {
    if (isFunction(scopeName)) {
      try {
        const result = scopeName();
        return result !== false;
      } catch (error) {
        reportError({
          scope: null,
          key: "",
          type: "manual",
          label: "direct-disposer",
          error,
          source: "off:function",
        });

        return false;
      }
    }

    const scopeNameFinal = normalizeScopeName(scopeName);
    const scope = registry.scopes.get(scopeNameFinal);

    if (!scope) {
      return false;
    }

    if (isFunction(keyOrDisposer)) {
      try {
        const result = keyOrDisposer();
        return result !== false;
      } catch (error) {
        reportError({
          scope,
          key: "",
          type: "manual",
          label: "direct-disposer",
          error,
          source: "off:function",
        });

        return false;
      }
    }

    const key = safeText(keyOrDisposer, "");

    if (!key) {
      return false;
    }

    const result = disposeRecordInternal(scope, key, "off");
    return result.ok === true;
  }

  function run(scopeName = DEFAULT_SCOPE, options = {}) {
    const cleanScopeName = normalizeScopeName(scopeName);
    const scope = registry.scopes.get(cleanScopeName);
    const opts = isPlainObject(options) ? options : {};

    if (!scope) {
      return {
        scope: cleanScopeName,
        disposed: 0,
        failed: 0,
        durationMs: 0,
        deleted: false,
        missing: true,
        running: false,
        at: safeIsoDate(),
      };
    }

    if (scope.running) {
      return {
        scope: cleanScopeName,
        disposed: 0,
        failed: 0,
        durationMs: 0,
        deleted: false,
        missing: false,
        running: true,
        at: safeIsoDate(),
      };
    }

    scope.running = true;

    const startedAtMs = safeNow();

    let disposed = 0;
    let failed = 0;

    try {
      const keys = Array.from(scope.records instanceof Map ? scope.records.keys() : []);

      for (const key of keys) {
        const result = disposeRecordInternal(scope, key, "scope-run");

        if (result.ran && result.ok) {
          disposed += 1;
        } else if (result.ran && result.failed) {
          failed += 1;
        }
      }
    } finally {
      scope.listeners = [];
      scope.cleaners = [];
      scope.disposers = [];

      try {
        scope.keys?.clear?.();
      } catch {}

      try {
        scope.records?.clear?.();
      } catch {}

      scope.running = false;
      scope.disposed = true;

      scope.lastRunAtMs = safeNow();
      scope.lastRunAt = safeIsoDate(scope.lastRunAtMs);

      scope.runCount = safeNumber(scope.runCount, 0) + 1;
      scope.disposedCount = safeNumber(scope.disposedCount, 0) + disposed;
      scope.failedCount = safeNumber(scope.failedCount, 0) + failed;
    }

    const payload = {
      scope: cleanScopeName,
      disposed,
      failed,
      durationMs: Math.max(0, safeNumber(scope.lastRunAtMs - startedAtMs, 0)),
      deleted: opts.deleteScope !== false,
      missing: false,
      running: false,
      at: scope.lastRunAt,
    };

    safeEmit(events, CLEANUP_EVENTS.scopeRun, payload);

    if (opts.deleteScope !== false) {
      registry.scopes.delete(cleanScopeName);
    } else {
      registry.scopes.set(cleanScopeName, scope);
    }

    return payload;
  }

  function clear(scopeName = DEFAULT_SCOPE) {
    return run(scopeName);
  }

  function dispose(scopeName = DEFAULT_SCOPE) {
    return run(scopeName);
  }

  function reset(scopeName = DEFAULT_SCOPE) {
    return run(scopeName, {
      deleteScope: false,
    });
  }

  function runAll(options = {}) {
    const names = Array.from(registry.scopes.keys());
    const results = [];

    for (const scopeName of names) {
      results.push(run(scopeName, options));
    }

    const payload = {
      count: results.length,
      disposed: results.reduce((total, item) => total + safeNumber(item?.disposed, 0), 0),
      failed: results.reduce((total, item) => total + safeNumber(item?.failed, 0), 0),
      at: safeIsoDate(),
    };

    safeEmit(events, CLEANUP_EVENTS.allRun, payload);

    return results;
  }

  function clearAll() {
    return runAll();
  }

  function disposeAll() {
    return runAll();
  }

  function resetAll() {
    return runAll({
      deleteScope: false,
    });
  }

  function getScopeSnapshot(scopeName = DEFAULT_SCOPE) {
    const cleanScopeName = normalizeScopeName(scopeName);
    const scope = registry.scopes.get(cleanScopeName);

    if (!scope) {
      return {
        exists: false,
        name: cleanScopeName,
      };
    }

    const records = scope.records instanceof Map
      ? Array.from(scope.records.values())
      : [];

    return {
      exists: true,
      name: scope.name || cleanScopeName,

      listenerCount: safeArray(scope.listeners).length,
      cleanerCount: safeArray(scope.cleaners).length,
      disposerCount: safeArray(scope.disposers).length,
      keyCount: scope.keys?.size || 0,
      recordCount: records.length,

      running: Boolean(scope.running),
      disposed: Boolean(scope.disposed),

      createdAt: scope.createdAt || "",
      createdAtMs: safeNumber(scope.createdAtMs, 0),

      lastRunAt: scope.lastRunAt || "",
      lastRunAtMs: safeNumber(scope.lastRunAtMs, 0),

      runCount: safeNumber(scope.runCount, 0),
      disposedCount: safeNumber(scope.disposedCount, 0),
      failedCount: safeNumber(scope.failedCount, 0),
      addedCount: safeNumber(scope.addedCount, 0),
      skippedCount: safeNumber(scope.skippedCount, 0),
      manualDisposeCount: safeNumber(scope.manualDisposeCount, 0),

      records: records.map((record) => ({
        key: redactText(record.key),
        type: record.type,
        label: redactText(record.label),
        eventName: redactText(record.eventName),
        targetType: record.targetType,
        disposed: Boolean(record.disposed),
        createdAt: record.createdAt,
        disposedAt: record.disposedAt || "",
      })),
    };
  }

  function getSnapshot() {
    const names = Array.from(registry.scopes.keys());
    const scopes = names.map((name) => getScopeSnapshot(name));

    return {
      version: CLEANUP_VERSION,

      scopeCount: names.length,

      totalListeners: scopes.reduce((total, item) => total + safeNumber(item.listenerCount, 0), 0),
      totalCleaners: scopes.reduce((total, item) => total + safeNumber(item.cleanerCount, 0), 0),
      totalDisposers: scopes.reduce((total, item) => total + safeNumber(item.disposerCount, 0), 0),
      totalRecords: scopes.reduce((total, item) => total + safeNumber(item.recordCount, 0), 0),

      scopes,

      at: safeIsoDate(),
    };
  }

  function size(scopeName = "") {
    const cleanScope = safeText(scopeName, "");

    if (cleanScope) {
      const scope = registry.scopes.get(cleanScope);

      if (!scope) {
        return 0;
      }

      return (
        safeArray(scope.listeners).length +
        safeArray(scope.cleaners).length +
        safeArray(scope.disposers).length
      );
    }

    let total = 0;

    for (const scope of registry.scopes.values()) {
      total +=
        safeArray(scope.listeners).length +
        safeArray(scope.cleaners).length +
        safeArray(scope.disposers).length;
    }

    return total;
  }

  const api = {
    version: CLEANUP_VERSION,
    events: CLEANUP_EVENTS,

    scope(name = DEFAULT_SCOPE) {
      const scopeName = normalizeScopeName(name);
      ensureScope(scopeName);
      return scopeName;
    },

    ensureScope,
    getScope,
    hasScope,

    on,
    event,
    bus,
    windowEvent,
    documentEvent,

    add,
    off,

    timeout,
    interval,

    raf,
    animationFrame: raf,

    idle,
    idleCallback: idle,

    observer,
    abortController,
    abort: abortController,

    run,
    clear,
    dispose,
    reset,

    runAll,
    clearAll,
    disposeAll,
    resetAll,

    size,

    getScopeSnapshot,
    getSnapshot,
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,
  };

  safeEmit(events, CLEANUP_EVENTS.ready, {
    version: CLEANUP_VERSION,
    at: safeIsoDate(),
  });

  safeLog(utils, "Cleanup ready.", {
    version: CLEANUP_VERSION,
  });

  return api;
}

export {
  CLEANUP_VERSION,
  DEFAULT_SCOPE,
  CLEANUP_EVENTS,
};

export default {
  CLEANUP_VERSION,
  DEFAULT_SCOPE,
  CLEANUP_EVENTS,
  createCleanup,
};
