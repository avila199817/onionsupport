/* =========================================================
   Onion SPA - Core Events
   Archivo: src/core/events.js

   CORE EVENTS · CLEAN BUS
   - Event bus único.
   - DOM CustomEvent en browser.
   - Fallback memory en server/no DOM.
   - once/off idempotente.
   - Wildcard "*" sólo memory/debug.
   - Firebreak simple anti storms.
   - Snapshots sin secretos.
========================================================= */

import {
  isBrowser as helperIsBrowser,
  normalizeListenerOptions,
} from "./helpers.js";

export const EVENTS_VERSION = "18.0.0-clean";
export const WILDCARD_EVENT = "*";

const DEFAULT_TARGET = "document";

const MAX_RECENT_EVENTS = 80;
const MAX_SYNC_DEPTH = 10;

const RATE_WINDOW_MS = 1000;
const MAX_ABSOLUTE_EMITS = 4000;
const MAX_NORMAL_EMITS = 900;
const MAX_NORMAL_EVENT_EMITS = 180;
const MAX_LOW_EMITS = 1200;
const MAX_LOW_EVENT_EMITS = 240;
const MAX_CRITICAL_EMITS = 2500;
const MAX_CRITICAL_EVENT_EMITS = 720;

const DROP_WARNING_MS = 2000;
const DROP_WARNING_EVENT_MS = 7000;

const CRITICAL_NAMES = new Set([
  "app:ready",
  "app:boot:start",
  "app:boot:ready",
  "app:boot:complete",
  "app:boot:error",

  "app:core:init:start",
  "app:core:ready",
  "app:core:init:error",
  "app:core:reboot",

  "app:state:change",
  "app:route:change",
  "app:public-path:change",
  "app:user:change",
  "app:auth:change",

  "app:session:applied",
  "app:session:loaded",
  "app:session:restored",
  "app:session:cleared",

  "router:before-render",
  "router:rendered",
  "router:render:error",

  "auth:login:success",
  "auth:logout:success",
  "auth:session:restored",
  "auth:session:cleared",
]);

const CRITICAL_PREFIXES = [
  "router:",
  "auth:",
  "app:core:",
  "app:session:",
];

const LOW_NAMES = new Set([
  "app:ui:ready",
  "app:ui:repair",
  "app:ui:repair-request",

  "app:module:registered",
  "app:module:replaced",
  "app:module:duplicate",

  "http:request:start",
  "http:request:attempt",
  "http:request:success",
  "http:request:error",
  "http:request:retry",
  "http:request:deduped",
  "http:request:complete",
  "http:pending:change",

  "app:request:start",
  "app:request:attempt",
  "app:request:success",
  "app:request:error",
  "app:request:retry",
  "app:request:deduped",
  "app:request:complete",
  "app:pending:change",
]);

const LOW_PREFIXES = [
  "sidebar:",
  "topbar:",
  "toast:",
  "tooltip:",
  "loader:",

  "app:user-ui:",
  "app:ui:",
  "app:module:",
  "app:http:",
  "app:request:",
  "app:pending:",

  "http:",
  "network:",
  "app:network:",
  "core:network:",
];

const SILENT_DROP_NAMES = new Set([
  "app:module:duplicate",
  "http:request:start",
  "http:request:attempt",
  "http:pending:change",
  "app:request:start",
  "app:request:attempt",
  "app:pending:change",
]);

const SILENT_DROP_PREFIXES = [
  "sidebar:indicator:",
  "sidebar:active:",
  "sidebar:visual:",
  "topbar:visual:",
  "tooltip:position:",
  "http:request:",
  "http:pending:",
  "app:request:",
  "app:pending:",
];

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const TOKENISH_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)[^&#\s]+/i;

/* =========================================================
   BASICS
========================================================= */

function browser() {
  try {
    if (typeof helperIsBrowser === "function") {
      return Boolean(helperIsBrowser());
    }
  } catch {}

  return typeof window !== "undefined" && typeof document !== "undefined";
}

function fn(value) {
  return typeof value === "function";
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const out = String(value).trim();
  return out || fallback;
}

function number(value, fallback = 0) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
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

function noopOff() {
  return () => false;
}

function startsWithAny(value = "", prefixes = []) {
  const clean = text(value, "");
  return prefixes.some((prefix) => clean.startsWith(prefix));
}

function eventClass(name = "") {
  const clean = text(name, "");

  if (CRITICAL_NAMES.has(clean) || startsWithAny(clean, CRITICAL_PREFIXES)) {
    return "critical";
  }

  if (LOW_NAMES.has(clean) || startsWithAny(clean, LOW_PREFIXES)) {
    return "low";
  }

  return "normal";
}

function silentDrop(name = "") {
  const clean = text(name, "");

  return (
    SILENT_DROP_NAMES.has(clean) ||
    startsWithAny(clean, SILENT_DROP_PREFIXES)
  );
}

function redactString(value = "") {
  const raw = text(value, "");

  if (!raw) return raw;

  try {
    return raw
      .replace(/(bearer\s+)([a-z0-9._~+/=-]+)/gi, "$1***")
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/gi, "***");
  } catch {
    return TOKENISH_RE.test(raw) ? "***" : raw;
  }
}

function preview(value, depth = 0, keyHint = "") {
  if (SENSITIVE_KEY_RE.test(text(keyHint, ""))) {
    return value ? "***" : value;
  }

  if (depth > 3) return "[MaxDepth]";

  if (value === null || value === undefined) return value;

  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactString(value.message || ""),
      stack: value.stack ? "[stack]" : "",
    };
  }

  if (value instanceof Date) {
    try {
      return value.toISOString();
    } catch {
      return String(value);
    }
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => preview(item, depth + 1, keyHint));
  }

  if (plainObject(value)) {
    const out = {};

    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      out[key] = preview(item, depth + 1, key);
    }

    return out;
  }

  try {
    return redactString(String(value));
  } catch {
    return "[Unserializable]";
  }
}

function warn(...args) {
  try {
    console.warn("[CoreEvents]", ...args.map((item) => preview(item)));
  } catch {}
}

/* =========================================================
   TARGETS / OPTIONS
========================================================= */

function eventTargetLike(target) {
  return Boolean(
    target &&
      fn(target.addEventListener) &&
      fn(target.removeEventListener) &&
      fn(target.dispatchEvent)
  );
}

function defaultTarget() {
  if (!browser()) return null;

  try {
    return document || null;
  } catch {
    return null;
  }
}

function windowTarget() {
  if (!browser()) return null;

  try {
    return window || null;
  } catch {
    return null;
  }
}

function resolveTarget(target = DEFAULT_TARGET) {
  if (eventTargetLike(target)) return target;

  const key = text(target, DEFAULT_TARGET).toLowerCase();

  if (key === "window") return windowTarget();
  if (key === "document") return defaultTarget();

  return defaultTarget();
}

function normalizeOptions(options = false) {
  try {
    if (typeof normalizeListenerOptions === "function") {
      const normalized = normalizeListenerOptions(options);

      if (
        normalized === true ||
        normalized === false ||
        plainObject(normalized)
      ) {
        return normalized;
      }
    }
  } catch {}

  if (options === true) return { capture: true };
  if (options === false || options === null || options === undefined) return false;

  return plainObject(options) ? { ...options } : false;
}

function optionsObject(options = false) {
  const normalized = normalizeOptions(options);
  return plainObject(normalized) ? normalized : {};
}

function wantsOnce(options = false) {
  return optionsObject(options).once === true;
}

function wantsBypass(options = false) {
  return optionsObject(options).bypassFirebreak === true;
}

function wantsMirror(options = false, fallback = false) {
  const value = optionsObject(options).mirrorToWindow;

  return typeof value === "boolean"
    ? value
    : Boolean(fallback);
}

function targetFromOptions(options = false) {
  return optionsObject(options).target || null;
}

function domOptions(options = false) {
  const normalized = normalizeOptions(options);

  if (normalized === true) return { capture: true };
  if (!plainObject(normalized)) return false;

  const out = {
    capture: Boolean(normalized.capture),
    passive: Boolean(normalized.passive),
  };

  if (normalized.signal) out.signal = normalized.signal;

  return out;
}

function removeOnceOption(options = false) {
  if (!plainObject(options)) return options;

  const { once, ...rest } = options;
  return rest;
}

/* =========================================================
   IDS / KEYS
========================================================= */

const handlerIds = new WeakMap();
const targetIds = new WeakMap();

let nextHandlerId = 1;
let nextTargetId = 1;

function handlerId(handler) {
  if (!fn(handler)) return "handler:none";

  try {
    if (!handlerIds.has(handler)) {
      handlerIds.set(handler, nextHandlerId++);
    }

    return `handler:${handlerIds.get(handler)}`;
  } catch {
    return "handler:unknown";
  }
}

function targetKey(target = DEFAULT_TARGET) {
  if (typeof target === "string") {
    return `target:${text(target, DEFAULT_TARGET).toLowerCase()}`;
  }

  if (!target) return `target:${DEFAULT_TARGET}`;

  try {
    if (!targetIds.has(target)) {
      targetIds.set(target, nextTargetId++);
    }

    return `target:${targetIds.get(target)}`;
  } catch {
    return "target:unknown";
  }
}

function optionsKey(options = false) {
  const normalized = domOptions(options);

  if (!plainObject(normalized)) {
    return "capture:false|passive:false|signal:false";
  }

  return [
    `capture:${Boolean(normalized.capture)}`,
    `passive:${Boolean(normalized.passive)}`,
    `signal:${Boolean(normalized.signal)}`,
  ].join("|");
}

function listenerKey({
  name = "",
  handler = null,
  options = false,
  targetRef = DEFAULT_TARGET,
} = {}) {
  return [
    targetKey(targetRef),
    text(name, ""),
    handlerId(handler),
    optionsKey(options),
  ].join("::");
}

/* =========================================================
   CUSTOM EVENT
========================================================= */

function createEvent(name = "", detail = {}) {
  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(name, {
        detail,
        bubbles: false,
        cancelable: false,
        composed: false,
      });
    }
  } catch {}

  try {
    if (!browser()) return null;

    const event = document.createEvent("CustomEvent");
    event.initCustomEvent(name, false, false, detail);

    return event;
  } catch {
    return null;
  }
}

function memoryEvent(name = "", detail = {}, target = null) {
  return {
    type: text(name, ""),
    detail,
    payload: detail,
    target,
    currentTarget: target,
    defaultPrevented: false,

    preventDefault() {
      this.defaultPrevented = true;
    },

    stopPropagation() {},
    stopImmediatePropagation() {},
  };
}

/* =========================================================
   FACTORY
========================================================= */

export function createEvents({
  target = DEFAULT_TARGET,
  mirrorToWindow = false,

  maxRecentEvents = MAX_RECENT_EVENTS,

  maxSyncEmitDepth = MAX_SYNC_DEPTH,

  rateWindowMs = RATE_WINDOW_MS,

  maxAbsoluteEmitsPerWindow = MAX_ABSOLUTE_EMITS,

  maxEmitsPerWindow = MAX_NORMAL_EMITS,
  maxEmitsPerEventPerWindow = MAX_NORMAL_EVENT_EMITS,

  maxLowPriorityEmitsPerWindow = MAX_LOW_EMITS,
  maxLowPriorityEmitsPerEventPerWindow = MAX_LOW_EVENT_EMITS,

  maxCriticalEmitsPerWindow = MAX_CRITICAL_EMITS,
  maxCriticalEmitsPerEventPerWindow = MAX_CRITICAL_EVENT_EMITS,
} = {}) {
  const memory = new Map();
  const active = new Map();
  const recent = [];

  const depthByName = new Map();
  const eventRate = new Map();
  const dropRate = new Map();

  let windowStartedAt = now();

  let absoluteCount = 0;
  let normalCount = 0;
  let lowCount = 0;
  let criticalCount = 0;

  let lastDropWarningAt = 0;
  const lastDropWarningByKey = new Map();

  const state = {
    version: EVENTS_VERSION,

    target: typeof target === "string" ? target : "custom",
    browser: browser(),

    emitCount: 0,
    onCount: 0,
    offCount: 0,
    onceCount: 0,
    clearCount: 0,
    errorCount: 0,
    dropCount: 0,
    silentDropCount: 0,
    wildcardEmitCount: 0,

    lastEvent: "",
    lastEventAt: 0,

    lastError: null,
    lastDroppedEvent: null,
  };

  function pushRecent(type = "event", name = "", detail = {}) {
    const atMs = now();

    recent.unshift({
      type,
      name,
      className: eventClass(name),
      detail: preview(detail),
      at: iso(atMs),
      atMs,
    });

    const limit = Math.max(1, number(maxRecentEvents, MAX_RECENT_EVENTS));

    if (recent.length > limit) {
      recent.splice(limit);
    }
  }

  function recordError(source = "events", error = null, name = "") {
    state.errorCount += 1;

    state.lastError = {
      source: text(source, "events"),
      name: text(name, ""),
      message: redactString(text(error?.message || error, "Event bus error.")),
      stack: error?.stack ? "[stack]" : "",
      at: iso(),
    };

    pushRecent("error", name, state.lastError);

    warn(state.lastError.message, {
      source,
      name,
    });
  }

  function resetWindowIfNeeded() {
    const current = now();
    const windowMs = Math.max(100, number(rateWindowMs, RATE_WINDOW_MS));

    if (current - windowStartedAt <= windowMs) return;

    windowStartedAt = current;

    absoluteCount = 0;
    normalCount = 0;
    lowCount = 0;
    criticalCount = 0;

    eventRate.clear();
    dropRate.clear();
  }

  function warnDrop(name = "", reason = "") {
    if (silentDrop(name)) {
      state.silentDropCount += 1;
      return false;
    }

    const current = now();
    const key = `${name}:${reason}`;

    if (current - number(lastDropWarningAt, 0) < DROP_WARNING_MS) {
      return false;
    }

    if (current - number(lastDropWarningByKey.get(key), 0) < DROP_WARNING_EVENT_MS) {
      return false;
    }

    lastDropWarningAt = current;
    lastDropWarningByKey.set(key, current);

    return true;
  }

  function recordDrop(name = "", reason = "", detail = {}) {
    state.dropCount += 1;

    const key = `${name}:${reason}`;
    dropRate.set(key, number(dropRate.get(key), 0) + 1);

    state.lastDroppedEvent = {
      name,
      reason,
      className: eventClass(name),
      at: iso(),
    };

    pushRecent("drop", name, {
      reason,
      ...preview(detail),
    });

    if (warnDrop(name, reason)) {
      warn(`Evento bloqueado por firebreak: ${name}`, {
        reason,
        className: eventClass(name),
        detail: preview(detail),
      });
    }
  }

  function allowEmit(name = "", options = false) {
    const eventName = text(name, "");
    if (!eventName) return false;

    if (wantsBypass(options)) return true;

    resetWindowIfNeeded();

    const depth = number(depthByName.get(eventName), 0);

    if (depth >= number(maxSyncEmitDepth, MAX_SYNC_DEPTH)) {
      recordDrop(eventName, "max-sync-depth", {
        depth,
        maxSyncEmitDepth,
      });

      return false;
    }

    absoluteCount += 1;

    if (absoluteCount > number(maxAbsoluteEmitsPerWindow, MAX_ABSOLUTE_EMITS)) {
      recordDrop(eventName, "max-absolute-rate", {
        absoluteCount,
        maxAbsoluteEmitsPerWindow,
      });

      return false;
    }

    const currentEventRate = number(eventRate.get(eventName), 0) + 1;
    eventRate.set(eventName, currentEventRate);

    const cls = eventClass(eventName);

    if (cls === "critical") {
      criticalCount += 1;

      if (criticalCount > number(maxCriticalEmitsPerWindow, MAX_CRITICAL_EMITS)) {
        recordDrop(eventName, "max-critical-total-rate", {
          criticalCount,
          maxCriticalEmitsPerWindow,
        });

        return false;
      }

      if (currentEventRate > number(maxCriticalEmitsPerEventPerWindow, MAX_CRITICAL_EVENT_EMITS)) {
        recordDrop(eventName, "max-critical-event-rate", {
          currentEventRate,
          maxCriticalEmitsPerEventPerWindow,
        });

        return false;
      }

      return true;
    }

    if (cls === "low") {
      lowCount += 1;

      if (lowCount > number(maxLowPriorityEmitsPerWindow, MAX_LOW_EMITS)) {
        recordDrop(eventName, "max-low-priority-rate", {
          lowCount,
          maxLowPriorityEmitsPerWindow,
        });

        return false;
      }

      if (currentEventRate > number(maxLowPriorityEmitsPerEventPerWindow, MAX_LOW_EVENT_EMITS)) {
        recordDrop(eventName, "max-low-priority-event-rate", {
          currentEventRate,
          maxLowPriorityEmitsPerEventPerWindow,
        });

        return false;
      }

      return true;
    }

    normalCount += 1;

    if (normalCount > number(maxEmitsPerWindow, MAX_NORMAL_EMITS)) {
      recordDrop(eventName, "max-normal-total-rate", {
        normalCount,
        maxEmitsPerWindow,
      });

      return false;
    }

    if (currentEventRate > number(maxEmitsPerEventPerWindow, MAX_NORMAL_EVENT_EMITS)) {
      recordDrop(eventName, "max-normal-event-rate", {
        currentEventRate,
        maxEmitsPerEventPerWindow,
      });

      return false;
    }

    return true;
  }

  function begin(name = "") {
    const eventName = text(name, "");
    depthByName.set(eventName, number(depthByName.get(eventName), 0) + 1);
  }

  function end(name = "") {
    const eventName = text(name, "");
    const depth = number(depthByName.get(eventName), 0);

    if (depth <= 1) {
      depthByName.delete(eventName);
      return;
    }

    depthByName.set(eventName, depth - 1);
  }

  function getMemorySet(name = "") {
    const eventName = text(name, "");
    if (!eventName) return null;

    if (!memory.has(eventName)) {
      memory.set(eventName, new Set());
    }

    return memory.get(eventName);
  }

  function callHandler(handler, event, name = "", source = "handler") {
    if (!fn(handler)) return false;

    try {
      const result = handler(event);

      if (result && typeof result === "object" && fn(result.catch)) {
        result.catch((error) => {
          recordError(`${source}:async`, error, name);
        });
      }

      return true;
    } catch (error) {
      recordError(source, error, name);
      return false;
    }
  }

  function callWildcard(handler, name = "", payload = {}, event = null) {
    if (!fn(handler)) return false;

    try {
      const result = handler(name, payload, event);

      if (result && typeof result === "object" && fn(result.catch)) {
        result.catch((error) => {
          recordError("wildcard:async", error, name);
        });
      }

      return true;
    } catch (error) {
      recordError("wildcard", error, name);
      return false;
    }
  }

  function emitMemory(name = "", payload = {}) {
    const eventName = text(name, "");
    const set = memory.get(eventName);

    if (!set || !set.size) return false;

    const event = memoryEvent(eventName, payload, null);

    for (const record of Array.from(set)) {
      callHandler(record.handler, event, eventName, "memory");
    }

    return true;
  }

  function emitWildcard(name = "", payload = {}, event = null) {
    const set = memory.get(WILDCARD_EVENT);

    if (!set || !set.size) return false;

    state.wildcardEmitCount += 1;

    const eventLike = event || memoryEvent(name, payload, null);

    for (const record of Array.from(set)) {
      callWildcard(record.handler, name, payload, eventLike);
    }

    return true;
  }

  function dispatchDom(name = "", payload = {}, targetRef = null, wildcard = true) {
    if (!browser() || !eventTargetLike(targetRef)) return false;

    try {
      const event = createEvent(name, payload);
      if (!event) return false;

      const ok = targetRef.dispatchEvent(event);

      if (wildcard) {
        emitWildcard(name, payload, event);
      }

      return Boolean(ok);
    } catch (error) {
      recordError("dom-dispatch", error, name);
      return false;
    }
  }

  function emit(name, detail = {}, options = false) {
    const eventName = text(name, "");

    if (!eventName) return false;
    if (!allowEmit(eventName, options)) return false;

    const payload = detail === undefined ? {} : detail;

    state.emitCount += 1;
    state.lastEvent = eventName;
    state.lastEventAt = now();

    pushRecent("emit", eventName, payload);
    begin(eventName);

    try {
      const eventTarget = resolveTarget(targetFromOptions(options) || target);
      let emitted = false;

      if (browser() && eventTargetLike(eventTarget)) {
        emitted = dispatchDom(eventName, payload, eventTarget, true);

        if (wantsMirror(options, mirrorToWindow) && eventTarget !== windowTarget()) {
          dispatchDom(eventName, payload, windowTarget(), false);
        }
      } else {
        emitted = emitMemory(eventName, payload);
        emitWildcard(eventName, payload, null);
      }

      return emitted;
    } finally {
      end(eventName);
    }
  }

  function safeDomHandler(name, handler) {
    return function onDomEvent(event) {
      return callHandler(handler, event, name, "dom");
    };
  }

  function register(record) {
    if (!record?.key) return false;

    active.set(record.key, record);
    return true;
  }

  function attachAbortCleanup(record, signal) {
    if (!record || !signal || !fn(signal.addEventListener)) return;
    if (signal.aborted) return;

    const onAbort = () => {
      try {
        active.delete(record.key);
      } catch {}

      pushRecent("off:signal", record.name, {
        key: record.key,
      });
    };

    try {
      signal.addEventListener("abort", onAbort, { once: true });

      record.signalCleanup = () => {
        try {
          signal.removeEventListener("abort", onAbort);
        } catch {}
      };
    } catch {}
  }

  function on(name, handler, options = false) {
    const eventName = text(name, "");

    if (!eventName || !fn(handler)) return noopOff();

    if (wantsOnce(options)) {
      return once(eventName, handler, removeOnceOption(options));
    }

    const finalOptions = domOptions(options);
    const targetOption = targetFromOptions(options);

    const targetRef =
      eventName === WILDCARD_EVENT
        ? "memory"
        : targetOption || target;

    const domTarget =
      eventName === WILDCARD_EVENT
        ? null
        : resolveTarget(targetRef);

    const key = listenerKey({
      name: eventName,
      handler,
      options: finalOptions,
      targetRef,
    });

    if (active.has(key)) {
      return active.get(key)?.off || noopOff();
    }

    state.onCount += 1;

    let off = noopOff();
    let actualHandler = handler;
    let memoryRecord = null;

    if (
      eventName !== WILDCARD_EVENT &&
      browser() &&
      eventTargetLike(domTarget)
    ) {
      actualHandler = safeDomHandler(eventName, handler);

      try {
        domTarget.addEventListener(eventName, actualHandler, finalOptions);
      } catch (error) {
        recordError("dom-add", error, eventName);
        return noopOff();
      }

      off = () => {
        if (!active.has(key)) return false;

        try {
          domTarget.removeEventListener(eventName, actualHandler, finalOptions);
        } catch (error) {
          recordError("dom-remove", error, eventName);
        }

        const record = active.get(key);

        try {
          record?.signalCleanup?.();
        } catch {}

        active.delete(key);

        state.offCount += 1;

        pushRecent("off", eventName, {
          key,
        });

        return true;
      };
    } else {
      const set = getMemorySet(eventName);
      if (!set) return noopOff();

      memoryRecord = {
        key,
        name: eventName,
        handler,
      };

      set.add(memoryRecord);

      off = () => {
        if (!active.has(key)) return false;

        try {
          set.delete(memoryRecord);
        } catch {}

        active.delete(key);

        state.offCount += 1;

        pushRecent("off", eventName, {
          key,
        });

        return true;
      };
    }

    const record = {
      key,
      name: eventName,

      handler,
      originalHandler: handler,
      actualHandler,

      options: finalOptions,
      once: false,

      target: targetKey(targetRef),
      targetRef,
      targetName: typeof targetRef === "string" ? targetRef : "custom",

      off,
      signalCleanup: null,

      createdAt: iso(),
    };

    register(record);

    if (memoryRecord) {
      memoryRecord.record = record;
    }

    if (plainObject(finalOptions) && finalOptions.signal) {
      attachAbortCleanup(record, finalOptions.signal);
    }

    pushRecent("on", eventName, {
      key,
    });

    return off;
  }

  function findByOriginal(name = "", handler = null) {
    const eventName = text(name, "");
    const matches = [];

    for (const record of active.values()) {
      if (eventName && record.name !== eventName) continue;

      if (
        record.handler === handler ||
        record.originalHandler === handler ||
        record.actualHandler === handler ||
        record.onceWrapper === handler
      ) {
        matches.push(record);
      }
    }

    return matches;
  }

  function off(name, handler, options = false) {
    if (fn(name) && !handler) {
      try {
        return name() !== false;
      } catch (error) {
        recordError("off:disposer", error, "");
        return false;
      }
    }

    const eventName = text(name, "");

    if (!eventName || !fn(handler)) return false;

    const finalOptions = domOptions(options);
    const targetOption = targetFromOptions(options);

    const targetRef =
      eventName === WILDCARD_EVENT
        ? "memory"
        : targetOption || target;

    const key = listenerKey({
      name: eventName,
      handler,
      options: finalOptions,
      targetRef,
    });

    const record = active.get(key);

    if (record && fn(record.off)) {
      return record.off();
    }

    const matches = findByOriginal(eventName, handler);

    if (!matches.length) return false;

    let removed = false;

    for (const item of matches) {
      try {
        removed = Boolean(item.off?.()) || removed;
      } catch (error) {
        recordError("off:matched", error, eventName);
      }
    }

    return removed;
  }

  function once(name, handler, options = false) {
    const eventName = text(name, "");

    if (!eventName || !fn(handler)) return noopOff();

    state.onceCount += 1;

    let disposed = false;
    let dispose = noopOff();

    const wrapped = (...args) => {
      if (disposed) return;

      disposed = true;

      try {
        dispose();
      } catch {}

      if (eventName === WILDCARD_EVENT) {
        try {
          const result = handler(...args);

          if (result && typeof result === "object" && fn(result.catch)) {
            result.catch((error) => {
              recordError("once-wildcard:async", error, eventName);
            });
          }
        } catch (error) {
          recordError("once-wildcard", error, eventName);
        }

        return;
      }

      callHandler(handler, args[0], eventName, "once");
    };

    dispose = on(eventName, wrapped, removeOnceOption(options));

    const finalOptions = domOptions(removeOnceOption(options));
    const targetOption = targetFromOptions(removeOnceOption(options));

    const targetRef =
      eventName === WILDCARD_EVENT
        ? "memory"
        : targetOption || target;

    const key = listenerKey({
      name: eventName,
      handler: wrapped,
      options: finalOptions,
      targetRef,
    });

    const record = active.get(key);

    if (record) {
      record.once = true;
      record.originalHandler = handler;
      record.onceWrapper = wrapped;
    }

    pushRecent("once", eventName, {
      key,
    });

    return dispose;
  }

  function clear(name = "") {
    const eventName = text(name, "");
    let count = 0;

    for (const record of Array.from(active.values())) {
      if (eventName && record.name !== eventName) continue;

      try {
        if (record.off?.()) count += 1;
      } catch (error) {
        recordError("clear", error, record.name);
      }
    }

    if (eventName) {
      memory.delete(eventName);
    } else {
      memory.clear();
    }

    state.clearCount += 1;

    pushRecent("clear", eventName || WILDCARD_EVENT, {
      count,
    });

    return count;
  }

  function listenerCount(name = "") {
    const eventName = text(name, "");

    if (!eventName) return active.size;

    let count = 0;

    for (const record of active.values()) {
      if (record.name === eventName) count += 1;
    }

    return count;
  }

  function names() {
    const out = new Set();

    for (const record of active.values()) {
      if (record.name) out.add(record.name);
    }

    for (const key of memory.keys()) {
      out.add(key);
    }

    return Array.from(out);
  }

  function getSnapshot() {
    return {
      version: state.version,

      target: state.target,
      browser: browser(),

      emitCount: state.emitCount,
      onCount: state.onCount,
      offCount: state.offCount,
      onceCount: state.onceCount,
      clearCount: state.clearCount,
      errorCount: state.errorCount,
      dropCount: state.dropCount,
      silentDropCount: state.silentDropCount,
      wildcardEmitCount: state.wildcardEmitCount,

      lastEvent: state.lastEvent,
      lastEventClass: eventClass(state.lastEvent),
      lastEventAt: state.lastEventAt,
      lastEventAtIso: state.lastEventAt ? iso(state.lastEventAt) : "",

      lastError: state.lastError,
      lastDroppedEvent: state.lastDroppedEvent,

      listenerCount: listenerCount(),
      eventNames: names(),

      firebreak: {
        rateWindowMs,
        maxSyncEmitDepth,

        absoluteCount,
        normalCount,
        lowCount,
        criticalCount,

        eventRate: Object.fromEntries(eventRate.entries()),
        dropRate: Object.fromEntries(dropRate.entries()),
        depthByName: Object.fromEntries(depthByName.entries()),
      },

      listeners: Array.from(active.values()).map((record) => ({
        key: record.key,
        name: record.name,
        className: eventClass(record.name),
        once: Boolean(record.once),
        target: record.target,
        targetName: record.targetName,
        createdAt: record.createdAt,
      })),

      recent: recent.map((item) => ({ ...item })),
    };
  }

  function reset() {
    clear();

    memory.clear();
    active.clear();
    recent.splice(0);

    depthByName.clear();
    eventRate.clear();
    dropRate.clear();

    windowStartedAt = now();

    absoluteCount = 0;
    normalCount = 0;
    lowCount = 0;
    criticalCount = 0;

    lastDropWarningAt = 0;
    lastDropWarningByKey.clear();

    state.emitCount = 0;
    state.onCount = 0;
    state.offCount = 0;
    state.onceCount = 0;
    state.clearCount = 0;
    state.errorCount = 0;
    state.dropCount = 0;
    state.silentDropCount = 0;
    state.wildcardEmitCount = 0;

    state.lastEvent = "";
    state.lastEventAt = 0;
    state.lastError = null;
    state.lastDroppedEvent = null;

    return getSnapshot();
  }

  return {
    version: EVENTS_VERSION,

    emit,
    dispatch: emit,
    trigger: emit,

    on,
    addEventListener: on,

    off,
    removeEventListener: off,

    once,

    clear,
    removeAllListeners: clear,

    listenerCount,

    names,
    eventNames: names,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,

    reset,
  };
}

export default {
  EVENTS_VERSION,
  WILDCARD_EVENT,
  createEvents,
};
