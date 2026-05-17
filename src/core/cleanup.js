/* =========================================================
   Onion SPA - Core Cleanup
   Archivo: src/core/cleanup.js

   CLEANUP KERNEL · SIMPLE
   - scopes con disposers idempotentes
   - DOM events / Event bus / manual disposers
   - timers / RAF / Idle
   - observers / AbortController
   - dedupe por scope
   - snapshots sin secretos
   - sin Auth, Router, Store, Storage, fetch ni UI
========================================================= */

export const CLEANUP_VERSION = "21.0.0-simple";
export const DEFAULT_SCOPE = "global";

export const CLEANUP_EVENTS = Object.freeze({
  ready: "cleanup:ready",
  added: "cleanup:record:added",
  skipped: "cleanup:record:skipped",
  disposed: "cleanup:disposed",
  scopeRun: "cleanup:scope:run",
  allRun: "cleanup:all:run",
  error: "cleanup:error",
});

const SPECIAL_TARGETS = new Set(["window", "document", "body", "html", "documentelement", "document-element"]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const TOKEN_TEXT_RE =
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+|[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)[^&#\s]+/gi;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPlainObject(value) {
  if (!isObject(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const output = String(value).trim();
  return output || fallback;
}

function lower(value, fallback = "") {
  return text(value, fallback).toLowerCase();
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

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

function noopDisposer() {
  const off = () => false;
  try {
    off.__cleanupNoop = true;
  } catch {}
  return off;
}

function ensureMap(value) {
  return value instanceof Map ? value : new Map();
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redact(value = "") {
  const raw = text(value, "");
  if (!raw) return "";

  try {
    return raw.replace(TOKEN_TEXT_RE, (match, bearerPrefix, queryPrefix) => {
      if (bearerPrefix) return `${bearerPrefix}***`;
      if (queryPrefix) return `${queryPrefix}***`;
      return "***";
    });
  } catch {
    return raw;
  }
}

function sanitize(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (depth > 5) return "[MaxDepth]";
  if (SENSITIVE_KEY_RE.test(text(keyHint, ""))) return value ? "***" : value;
  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redact(value.message || ""),
      stack: value.stack ? "[stack]" : "",
    };
  }

  if (Array.isArray(value)) return value.slice(0, 60).map((item) => sanitize(item, depth + 1, keyHint, seen));

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    } catch {}

    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 100)) output[key] = sanitize(item, depth + 1, key, seen);
    return output;
  }

  try {
    return redact(String(value));
  } catch {
    return "[Unserializable]";
  }
}

function emit(events, name, payload = {}) {
  const eventName = text(name, "");
  if (!eventName) return false;

  const safePayload = sanitize(payload);

  for (const method of ["emit", "dispatch", "trigger"]) {
    try {
      if (isFn(events?.[method])) {
        events[method](eventName, safePayload);
        return true;
      }
    } catch {}
  }

  return false;
}

function warn(utils, ...args) {
  const safeArgs = args.map((item) => sanitize(item));

  try {
    if (isFn(utils?.warn)) {
      utils.warn("[Cleanup]", ...safeArgs);
      return;
    }
  } catch {}

  try {
    console.warn("[Cleanup]", ...safeArgs);
  } catch {}
}

/* =========================================================
   TARGETS / RESOURCES
========================================================= */

function getWindow() {
  try {
    return typeof window !== "undefined" ? window : null;
  } catch {
    return null;
  }
}

function getDocument() {
  try {
    return typeof document !== "undefined" ? document : null;
  } catch {
    return null;
  }
}

function resolveSpecialTarget(name = "") {
  const key = lower(name, "");

  if (key === "window") return getWindow();
  if (key === "document") return getDocument();
  if (key === "body") return getDocument()?.body || null;
  if (key === "html" || key === "documentelement" || key === "document-element") return getDocument()?.documentElement || null;

  return null;
}

function isSpecialTarget(name = "") {
  return SPECIAL_TARGETS.has(lower(name, ""));
}

function isEventTarget(value) {
  return Boolean(value && isFn(value.addEventListener) && isFn(value.removeEventListener));
}

function resolveTarget(target) {
  if (isEventTarget(target)) return target;

  if (typeof target === "string") {
    const special = resolveSpecialTarget(target);
    if (special) return special;

    if (isBrowser()) {
      try {
        return document.querySelector(target);
      } catch {
        return null;
      }
    }
  }

  return null;
}

function isObserver(value) {
  return Boolean(value && isFn(value.disconnect));
}

function isAbortController(value) {
  return Boolean(value && isFn(value.abort) && value.signal);
}

/* =========================================================
   IDS / KEYS
========================================================= */

const targetIds = new WeakMap();
const handlerIds = new WeakMap();

let nextTargetId = 1;
let nextHandlerId = 1;
let nextResourceId = 1;

function targetId(target) {
  if (typeof target === "string") return `str:${lower(target, "target")}`;
  if (!target || (typeof target !== "object" && typeof target !== "function")) return "none";

  try {
    if (!targetIds.has(target)) targetIds.set(target, nextTargetId++);
    return `obj:${targetIds.get(target)}`;
  } catch {
    return "unknown";
  }
}

function handlerId(handler) {
  if (!isFn(handler)) return "none";

  try {
    if (!handlerIds.has(handler)) handlerIds.set(handler, nextHandlerId++);
    return `fn:${handlerIds.get(handler)}`;
  } catch {
    return "unknown";
  }
}

function resourceId(type = "resource") {
  const id = `${type}:${nextResourceId}`;
  nextResourceId += 1;
  return id;
}

function optionsKey(options = false) {
  if (options === true) return "capture:true|once:false|passive:false|signal:false";
  if (!options) return "capture:false|once:false|passive:false|signal:false";

  if (isPlainObject(options)) {
    return [
      `capture:${Boolean(options.capture)}`,
      `once:${Boolean(options.once)}`,
      `passive:${Boolean(options.passive)}`,
      `signal:${Boolean(options.signal)}`,
    ].join("|");
  }

  return String(options);
}

function domKey(target, eventName, handler, options) {
  return ["dom", targetId(target), text(eventName, ""), handlerId(handler), optionsKey(options)].join("::");
}

function busKey(eventName, handler, options) {
  return ["bus", text(eventName, ""), handlerId(handler), optionsKey(options)].join("::");
}

function manualKey(disposer, label = "manual") {
  return ["manual", handlerId(disposer), text(label, "manual")].join("::");
}

function resourceKey(type = "resource", label = "") {
  return [type, resourceId(type), text(label, "")].join("::");
}

/* =========================================================
   OPTIONS
========================================================= */

function wantsOnce(options = false) {
  return Boolean(isPlainObject(options) && options.once === true);
}

function domOptions(options = false) {
  if (options === true) return { capture: true };
  if (!options || !isPlainObject(options)) return false;

  const output = {
    capture: Boolean(options.capture),
    passive: Boolean(options.passive),
  };

  if (options.signal) output.signal = options.signal;

  return output;
}

function busOptions(options = false) {
  if (!isPlainObject(options)) return options;

  const { once, target, ...rest } = options;
  void once;
  void target;

  return rest;
}

/* =========================================================
   SCOPE
========================================================= */

function scopeName(value = DEFAULT_SCOPE) {
  return text(value, DEFAULT_SCOPE);
}

function createScope(name = DEFAULT_SCOPE) {
  const atMs = now();

  return {
    name: scopeName(name),
    records: new Map(),
    running: false,
    disposed: false,
    createdAt: iso(atMs),
    createdAtMs: atMs,
    lastRunAt: "",
    lastRunAtMs: 0,
    addedCount: 0,
    skippedCount: 0,
    disposedCount: 0,
    failedCount: 0,
    runCount: 0,
  };
}

function normalizeScope(value, name = DEFAULT_SCOPE) {
  if (isObject(value) && value.records instanceof Map) {
    value.name = scopeName(value.name || name);
    value.running = Boolean(value.running);
    value.disposed = Boolean(value.disposed);
    value.addedCount = number(value.addedCount, value.records.size);
    value.skippedCount = number(value.skippedCount, 0);
    value.disposedCount = number(value.disposedCount, 0);
    value.failedCount = number(value.failedCount, 0);
    value.runCount = number(value.runCount, 0);
    value.createdAt = text(value.createdAt, iso());
    value.createdAtMs = number(value.createdAtMs, now());
    value.lastRunAt = text(value.lastRunAt, "");
    value.lastRunAtMs = number(value.lastRunAtMs, 0);
    return value;
  }

  if (value instanceof Set) {
    const scope = createScope(name);

    for (const disposer of value) {
      if (!isFn(disposer)) continue;
      const key = manualKey(disposer, "legacy-set");
      scope.records.set(key, {
        key,
        type: "manual",
        label: "legacy-set",
        disposed: false,
        createdAt: iso(),
        createdAtMs: now(),
        dispose: disposer,
      });
    }

    scope.addedCount = scope.records.size;
    return scope;
  }

  return createScope(name);
}

/* =========================================================
   FACTORY
========================================================= */

export function createCleanup(input = {}) {
  const deps = isPlainObject(input) && ("registry" in input || "events" in input || "bus" in input || "utils" in input)
    ? input
    : { registry: isObject(input) ? input : {} };

  const registry = isObject(deps.registry) ? deps.registry : {};
  const events = deps.events || deps.bus || registry.events || registry.bus || null;
  const utils = deps.utils || registry.utils || null;

  registry.scopes = ensureMap(registry.scopes);

  function ensureScope(name = DEFAULT_SCOPE) {
    const clean = scopeName(name);
    const current = registry.scopes.get(clean);
    const normalized = normalizeScope(current, clean);

    if (current !== normalized) registry.scopes.set(clean, normalized);
    return normalized;
  }

  function hasScope(name = DEFAULT_SCOPE) {
    return registry.scopes.has(scopeName(name));
  }

  function getScope(name = DEFAULT_SCOPE) {
    return ensureScope(name);
  }

  function reportError(scope, record, error, source = "cleanup") {
    if (scope) scope.failedCount += 1;

    const payload = {
      scope: scope?.name || "",
      key: redact(record?.key || ""),
      type: record?.type || "cleanup",
      label: redact(record?.label || ""),
      source,
      name: error?.name || "Error",
      message: redact(error?.message || String(error)),
      at: iso(),
    };

    warn(utils, "cleanup error", payload);
    emit(events, CLEANUP_EVENTS.error, payload);

    return payload;
  }

  function removeRecord(scope, key) {
    if (!scope?.records?.has?.(key)) return false;
    scope.records.delete(key);
    return true;
  }

  function disposeRecord(scope, key, reason = "manual") {
    const record = scope?.records?.get?.(key);
    if (!record) return { ran: false, ok: false, missing: true };

    if (record.disposed === true) {
      removeRecord(scope, key);
      return { ran: false, ok: false, disposed: true };
    }

    record.disposed = true;
    record.disposedAt = iso();
    record.reason = reason;

    try {
      const result = record.dispose?.();

      if (result && typeof result === "object" && isFn(result.catch)) {
        result.catch((error) => reportError(scope, record, error, `${record.type}:async`));
      }

      scope.disposedCount += 1;
      removeRecord(scope, key);

      emit(events, CLEANUP_EVENTS.disposed, {
        scope: scope.name,
        key: redact(key),
        type: record.type,
        label: redact(record.label || ""),
        reason,
        at: record.disposedAt,
      });

      return { ran: true, ok: true };
    } catch (error) {
      reportError(scope, record, error, record.type);
      removeRecord(scope, key);
      return { ran: true, ok: false, failed: true };
    }
  }

  function addRecord(scope, key, recordInput = {}) {
    if (!scope || !key || !isFn(recordInput.dispose)) return noopDisposer();

    if (scope.records.has(key)) {
      const existing = scope.records.get(key);
      scope.skippedCount += 1;

      emit(events, CLEANUP_EVENTS.skipped, {
        scope: scope.name,
        key: redact(key),
        type: existing?.type || recordInput.type || "",
        label: redact(existing?.label || recordInput.label || ""),
        reason: "duplicate",
        at: iso(),
      });

      return existing?.disposer || noopDisposer();
    }

    const disposer = () => disposeRecord(scope, key, "manual").ok === true;

    try {
      disposer.__cleanup = true;
      disposer.__cleanupKey = key;
      disposer.__cleanupScope = scope.name;
      disposer.__cleanupType = recordInput.type || "manual";
    } catch {}

    const atMs = now();

    const record = {
      key,
      type: text(recordInput.type, "manual"),
      label: text(recordInput.label, ""),
      eventName: text(recordInput.eventName, ""),
      targetType: text(recordInput.targetType, ""),
      createdAt: iso(atMs),
      createdAtMs: atMs,
      disposed: false,
      dispose: recordInput.dispose,
      disposer,
    };

    scope.records.set(key, record);
    scope.addedCount += 1;
    scope.disposed = false;

    emit(events, CLEANUP_EVENTS.added, {
      scope: scope.name,
      key: redact(key),
      type: record.type,
      label: redact(record.label),
      eventName: redact(record.eventName),
      targetType: record.targetType,
      at: record.createdAt,
    });

    return disposer;
  }

  function callHandler(scope, record, handler, thisArg, args = []) {
    if (!isFn(handler)) return false;

    try {
      const result = handler.apply(thisArg, args);

      if (result && typeof result === "object" && isFn(result.catch)) {
        result.catch((error) => reportError(scope, record, error, `${record?.type || "handler"}:async`));
      }

      return true;
    } catch (error) {
      reportError(scope, record, error, `${record?.type || "handler"}:handler`);
      return false;
    }
  }

  /* =======================================================
     REGISTRATION
  ======================================================= */

  function add(...args) {
    let finalScope = DEFAULT_SCOPE;
    let disposer = null;
    let label = "manual";

    if (isPlainObject(args[0]) && isFn(args[0].disposer)) {
      finalScope = scopeName(args[0].scope || args[0].scopeName || DEFAULT_SCOPE);
      disposer = args[0].disposer;
      label = text(args[0].label, "manual");
    } else if (isFn(args[0])) {
      disposer = args[0];
      label = text(args[1], "manual");
    } else {
      finalScope = scopeName(args[0]);
      disposer = args[1];
      label = text(args[2], "manual");
    }

    if (!isFn(disposer)) return noopDisposer();

    const scope = ensureScope(finalScope);

    return addRecord(scope, manualKey(disposer, label), {
      type: "manual",
      label,
      targetType: "manual",
      dispose: disposer,
    });
  }

  function registerDom(scopeInput, targetInput, eventName, handler, options = false) {
    const scope = ensureScope(scopeInput);
    const target = resolveTarget(targetInput);
    const event = text(eventName, "");

    if (!target || !event || !isFn(handler)) return noopDisposer();

    const key = domKey(target, event, handler, options);

    if (scope.records.has(key)) {
      scope.skippedCount += 1;
      return scope.records.get(key)?.disposer || noopDisposer();
    }

    const once = wantsOnce(options);
    const finalOptions = domOptions(options);
    const recordRef = { key, type: "dom", label: event };
    let publicDisposer = null;

    const wrapped = function cleanupDomHandler(eventObject) {
      if (once) {
        try {
          publicDisposer?.();
        } catch {}
      }

      return callHandler(scope, recordRef, handler, this, [eventObject]);
    };

    try {
      target.addEventListener(event, wrapped, finalOptions);
    } catch (error) {
      reportError(scope, recordRef, error, "dom:addEventListener");
      return noopDisposer();
    }

    publicDisposer = addRecord(scope, key, {
      type: "dom",
      label: event,
      eventName: event,
      targetType: target?.constructor?.name || typeof target,
      dispose: () => target.removeEventListener(event, wrapped, finalOptions),
    });

    if (isPlainObject(options) && options.signal && isFn(options.signal.addEventListener)) {
      try {
        options.signal.addEventListener("abort", () => publicDisposer?.(), { once: true });
      } catch {}
    }

    return publicDisposer;
  }

  function registerBus(scopeInput, eventName, handler, options = false) {
    const scope = ensureScope(scopeInput);
    const event = text(eventName, "");

    if (!event || !isFn(handler) || !isFn(events?.on)) return noopDisposer();

    const key = busKey(event, handler, options);

    if (scope.records.has(key)) {
      scope.skippedCount += 1;
      return scope.records.get(key)?.disposer || noopDisposer();
    }

    const once = wantsOnce(options);
    const finalOptions = busOptions(options);
    const recordRef = { key, type: "bus", label: event };
    let publicDisposer = null;

    const wrapped = function cleanupBusHandler(payload) {
      if (once) {
        try {
          publicDisposer?.();
        } catch {}
      }

      return callHandler(scope, recordRef, handler, this, [payload]);
    };

    let offBus = null;

    try {
      offBus = events.on(event, wrapped, finalOptions);
    } catch (error) {
      reportError(scope, recordRef, error, "bus:on");
      return noopDisposer();
    }

    if (!isFn(offBus)) {
      offBus = () => {
        try {
          events?.off?.(event, wrapped, finalOptions);
        } catch {}
      };
    }

    publicDisposer = addRecord(scope, key, {
      type: "bus",
      label: event,
      eventName: event,
      targetType: "event-bus",
      dispose: offBus,
    });

    return publicDisposer;
  }

  function on(...args) {
    if ((isEventTarget(args[0]) || (typeof args[0] === "string" && isSpecialTarget(args[0]))) && typeof args[1] === "string" && isFn(args[2])) {
      return registerDom(DEFAULT_SCOPE, args[0], args[1], args[2], args[3]);
    }

    if (typeof args[0] === "string" && isFn(args[1])) return registerBus(DEFAULT_SCOPE, args[0], args[1], args[2]);
    if (typeof args[0] === "string" && typeof args[1] === "string" && isFn(args[2])) return registerBus(args[0], args[1], args[2], args[3]);

    return registerDom(args[0], args[1], args[2], args[3], args[4]);
  }

  function event(...args) {
    if ((isEventTarget(args[0]) || (typeof args[0] === "string" && isSpecialTarget(args[0]))) && typeof args[1] === "string" && isFn(args[2])) {
      return registerDom(DEFAULT_SCOPE, args[0], args[1], args[2], args[3]);
    }

    if (typeof args[0] === "string" && isFn(args[1])) return registerBus(DEFAULT_SCOPE, args[0], args[1], args[2]);

    if (isEventTarget(args[1]) || (typeof args[1] === "string" && (isSpecialTarget(args[1]) || (typeof args[2] === "string" && isFn(args[3]))))) {
      return registerDom(args[0], args[1], args[2], args[3], args[4]);
    }

    return registerBus(args[0], args[1], args[2], args[3]);
  }

  function bus(...args) {
    if (typeof args[0] === "string" && isFn(args[1])) return registerBus(DEFAULT_SCOPE, args[0], args[1], args[2]);
    return registerBus(args[0], args[1], args[2], args[3]);
  }

  function windowEvent(scopeInput = DEFAULT_SCOPE, eventName, handler, options = false) {
    return registerDom(scopeInput, "window", eventName, handler, options);
  }

  function documentEvent(scopeInput = DEFAULT_SCOPE, eventName, handler, options = false) {
    return registerDom(scopeInput, "document", eventName, handler, options);
  }

  /* =======================================================
     TIMERS / RESOURCES
  ======================================================= */

  function normalizeTimerArgs(scopeInput, fnOrDelay, delayOrFn, label = "timer") {
    if (isFn(scopeInput) || typeof scopeInput === "number") {
      return {
        scope: DEFAULT_SCOPE,
        fn: isFn(scopeInput) ? scopeInput : delayOrFn,
        delay: isFn(scopeInput) ? delayOrFn : scopeInput,
        label: isFn(scopeInput) ? delayOrFn || label : label,
      };
    }

    if (typeof fnOrDelay === "number" && isFn(delayOrFn)) {
      return { scope: scopeInput, fn: delayOrFn, delay: fnOrDelay, label };
    }

    return { scope: scopeInput, fn: fnOrDelay, delay: delayOrFn, label };
  }

  function timeout(scopeInput = DEFAULT_SCOPE, fnOrDelay, delayOrFn = 0, label = "timeout") {
    const args = normalizeTimerArgs(scopeInput, fnOrDelay, delayOrFn, label);
    if (!isFn(args.fn)) return noopDisposer();

    const scope = ensureScope(args.scope);
    const key = resourceKey("timeout", args.label);

    const timerId = setTimeout(() => {
      const record = scope.records.get(key);
      callHandler(scope, record, args.fn, null, []);
      disposeRecord(scope, key, "timeout-fired");
    }, Math.max(0, number(args.delay, 0)));

    return addRecord(scope, key, {
      type: "timeout",
      label: text(args.label, "timeout"),
      targetType: "timer",
      dispose: () => clearTimeout(timerId),
    });
  }

  function interval(scopeInput = DEFAULT_SCOPE, fnOrDelay, delayOrFn = 0, label = "interval") {
    const args = normalizeTimerArgs(scopeInput, fnOrDelay, delayOrFn, label);
    if (!isFn(args.fn)) return noopDisposer();

    const scope = ensureScope(args.scope);
    const key = resourceKey("interval", args.label);

    const timerId = setInterval(() => {
      const record = scope.records.get(key);
      callHandler(scope, record, args.fn, null, []);
    }, Math.max(0, number(args.delay, 0)));

    return addRecord(scope, key, {
      type: "interval",
      label: text(args.label, "interval"),
      targetType: "timer",
      dispose: () => clearInterval(timerId),
    });
  }

  function raf(scopeInput = DEFAULT_SCOPE, fn = null, label = "raf") {
    if (isFn(scopeInput)) return raf(DEFAULT_SCOPE, scopeInput, fn || "raf");
    if (!isFn(fn)) return noopDisposer();

    const win = getWindow();
    if (!win || !isFn(win.requestAnimationFrame)) return timeout(scopeInput, fn, 0, label);

    const scope = ensureScope(scopeInput);
    const key = resourceKey("raf", label);

    const id = win.requestAnimationFrame((time) => {
      const record = scope.records.get(key);
      callHandler(scope, record, fn, null, [time]);
      disposeRecord(scope, key, "raf-fired");
    });

    return addRecord(scope, key, {
      type: "raf",
      label: text(label, "raf"),
      targetType: "animation-frame",
      dispose: () => win.cancelAnimationFrame(id),
    });
  }

  function idle(scopeInput = DEFAULT_SCOPE, fn = null, options = {}, label = "idle") {
    if (isFn(scopeInput)) return idle(DEFAULT_SCOPE, scopeInput, fn || {}, options || "idle");
    if (!isFn(fn)) return noopDisposer();

    const win = getWindow();
    if (!win || !isFn(win.requestIdleCallback)) return timeout(scopeInput, fn, 0, label);

    const scope = ensureScope(scopeInput);
    const key = resourceKey("idle", label);

    const id = win.requestIdleCallback((deadline) => {
      const record = scope.records.get(key);
      callHandler(scope, record, fn, null, [deadline]);
      disposeRecord(scope, key, "idle-fired");
    }, isPlainObject(options) ? options : {});

    return addRecord(scope, key, {
      type: "idle",
      label: text(label, "idle"),
      targetType: "idle-callback",
      dispose: () => win.cancelIdleCallback(id),
    });
  }

  function observer(scopeInput = DEFAULT_SCOPE, observerRef = null, label = "observer") {
    if (isObserver(scopeInput)) return observer(DEFAULT_SCOPE, scopeInput, observerRef || "observer");
    if (!isObserver(observerRef)) return noopDisposer();

    const scope = ensureScope(scopeInput);
    const key = ["observer", targetId(observerRef), text(label, "observer")].join("::");

    return addRecord(scope, key, {
      type: "observer",
      label: text(label, "observer"),
      targetType: observerRef?.constructor?.name || "observer",
      dispose: () => observerRef.disconnect(),
    });
  }

  function abortController(scopeInput = DEFAULT_SCOPE, controller = null, label = "abort-controller", reason = "cleanup") {
    if (isAbortController(scopeInput)) return abortController(DEFAULT_SCOPE, scopeInput, controller || "abort-controller", label || "cleanup");
    if (!isAbortController(controller)) return noopDisposer();

    const scope = ensureScope(scopeInput);
    const key = ["abort", targetId(controller), text(label, "abort-controller")].join("::");

    return addRecord(scope, key, {
      type: "abort",
      label: text(label, "abort-controller"),
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

  /* =======================================================
     DISPOSE
  ======================================================= */

  function off(scopeInput = DEFAULT_SCOPE, keyOrDisposer = "") {
    if (isFn(scopeInput)) {
      try {
        return scopeInput() !== false;
      } catch (error) {
        warn(utils, "direct disposer failed", error);
        return false;
      }
    }

    const scope = registry.scopes.get(scopeName(scopeInput));
    if (!scope) return false;

    if (isFn(keyOrDisposer)) {
      try {
        return keyOrDisposer() !== false;
      } catch (error) {
        warn(utils, "direct disposer failed", error);
        return false;
      }
    }

    const key = text(keyOrDisposer, "");
    if (!key) return false;

    return disposeRecord(scope, key, "off").ok === true;
  }

  function run(scopeInput = DEFAULT_SCOPE, options = {}) {
    const cleanScope = scopeName(scopeInput);
    const scope = registry.scopes.get(cleanScope);

    if (!scope) return { scope: cleanScope, missing: true, disposed: 0, failed: 0, durationMs: 0, at: iso() };
    if (scope.running) return { scope: cleanScope, running: true, disposed: 0, failed: 0, durationMs: 0, at: iso() };

    scope.running = true;

    const startedAt = now();
    let disposed = 0;
    let failed = 0;

    try {
      for (const key of [...scope.records.keys()]) {
        const result = disposeRecord(scope, key, "scope-run");
        if (result.ran && result.ok) disposed += 1;
        if (result.ran && result.failed) failed += 1;
      }
    } finally {
      scope.running = false;
      scope.disposed = true;
      scope.lastRunAtMs = now();
      scope.lastRunAt = iso(scope.lastRunAtMs);
      scope.runCount += 1;
    }

    const payload = {
      scope: cleanScope,
      missing: false,
      disposed,
      failed,
      durationMs: Math.max(0, scope.lastRunAtMs - startedAt),
      deleted: options.deleteScope !== false,
      at: scope.lastRunAt,
    };

    emit(events, CLEANUP_EVENTS.scopeRun, payload);

    if (options.deleteScope !== false) registry.scopes.delete(cleanScope);
    else registry.scopes.set(cleanScope, scope);

    return payload;
  }

  function runAll(options = {}) {
    const names = [...registry.scopes.keys()];
    const results = names.map((name) => run(name, options));

    const payload = {
      count: results.length,
      disposed: results.reduce((total, item) => total + number(item.disposed, 0), 0),
      failed: results.reduce((total, item) => total + number(item.failed, 0), 0),
      at: iso(),
    };

    emit(events, CLEANUP_EVENTS.allRun, payload);

    return results;
  }

  const clear = (scopeInput = DEFAULT_SCOPE) => run(scopeInput);
  const dispose = (scopeInput = DEFAULT_SCOPE) => run(scopeInput);
  const reset = (scopeInput = DEFAULT_SCOPE) => run(scopeInput, { deleteScope: false });

  const clearAll = () => runAll();
  const disposeAll = () => runAll();
  const resetAll = () => runAll({ deleteScope: false });

  /* =======================================================
     SNAPSHOT
  ======================================================= */

  function getScopeSnapshot(scopeInput = DEFAULT_SCOPE) {
    const cleanScope = scopeName(scopeInput);
    const scope = registry.scopes.get(cleanScope);

    if (!scope) return { exists: false, name: cleanScope };

    const records = [...scope.records.values()];

    return {
      exists: true,
      name: scope.name,
      running: Boolean(scope.running),
      disposed: Boolean(scope.disposed),
      createdAt: scope.createdAt,
      lastRunAt: scope.lastRunAt,
      recordCount: records.length,
      addedCount: scope.addedCount,
      skippedCount: scope.skippedCount,
      disposedCount: scope.disposedCount,
      failedCount: scope.failedCount,
      runCount: scope.runCount,
      records: records.map((record) => ({
        key: redact(record.key),
        type: record.type,
        label: redact(record.label),
        eventName: redact(record.eventName),
        targetType: record.targetType,
        disposed: Boolean(record.disposed),
        createdAt: record.createdAt,
      })),
    };
  }

  function getSnapshot() {
    const names = [...registry.scopes.keys()];
    const scopes = names.map(getScopeSnapshot);

    return {
      version: CLEANUP_VERSION,
      scopeCount: scopes.length,
      totalRecords: scopes.reduce((total, item) => total + number(item.recordCount, 0), 0),
      totalDisposed: scopes.reduce((total, item) => total + number(item.disposedCount, 0), 0),
      totalFailed: scopes.reduce((total, item) => total + number(item.failedCount, 0), 0),
      scopes,
      at: iso(),
      policy: {
        scopedDisposersOnly: true,
        idempotent: true,
        ownAuth: false,
        ownRouter: false,
        ownStorage: false,
        ownUi: false,
      },
    };
  }

  function size(scopeInput = "") {
    const cleanScope = text(scopeInput, "");
    if (cleanScope) return registry.scopes.get(cleanScope)?.records?.size || 0;

    let total = 0;
    for (const scope of registry.scopes.values()) total += scope.records?.size || 0;
    return total;
  }

  const api = {
    version: CLEANUP_VERSION,
    events: CLEANUP_EVENTS,

    scope(name = DEFAULT_SCOPE) {
      return ensureScope(name);
    },

    ensureScope,
    getScope,
    hasScope,

    add,
    off,

    on,
    event,
    bus,
    windowEvent,
    documentEvent,

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

  emit(events, CLEANUP_EVENTS.ready, { version: CLEANUP_VERSION, at: iso() });

  return api;
}

export default {
  CLEANUP_VERSION,
  DEFAULT_SCOPE,
  CLEANUP_EVENTS,
  createCleanup,
};
