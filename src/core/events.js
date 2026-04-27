/* =========================================================
   Onion SPA - Core Events
   Archivo: src/core/events.js

   FINAL PRO SYSTEM · EVENT BUS / FIREBREAK SAFE · 10/10

   Responsabilidades:
   - centralizar el event bus del core
   - emitir eventos CustomEvent sobre document/window/custom target
   - registrar listeners persistentes o once
   - desacoplar módulos a través de eventos
   - funcionar con fallback in-memory si no hay DOM
   - exponer snapshot debug del bus

   HARDENING EXTREMO:
   - cero throws accidentales desde handlers
   - compatible browser/server
   - listeners idempotentes
   - off seguro por handler original
   - once robusto sin depender de once nativo
   - normalización de options
   - soporte document/window/custom target
   - métricas internas de emit/on/off/error/drop
   - payload estable: event.detail
   - wrapper defensivo de listeners DOM
   - protección contra recursión / tormentas de eventos
   - no congela la SPA si un módulo emite en bucle

   FIX FIREBREAK:
   - separa eventos críticos / normales / low-priority UI
   - eventos UI tipo sidebar:* ya no consumen el contador global normal
   - sidebar:user:rendered no queda bloqueado por max-total-rate
   - mantiene límites propios para eventos ruidosos
   - evita spam de consola durante drops repetidos
   - captura errores async de handlers con .catch()
========================================================= */

import {
  isBrowser,
  normalizeListenerOptions,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_TARGET = "document";

const MAX_RECENT_EVENTS = 80;

const EVENTS_VERSION = "10.2.0";

/*
  Firebreaks.

  Regla:
  - eventos críticos: no se bloquean por rate normal, solo por recursión
  - eventos normales: rate normal
  - eventos low-priority UI: rate separado más generoso
*/
const MAX_SYNC_EMIT_DEPTH = 12;

const RATE_WINDOW_MS = 1000;

const MAX_EMITS_PER_WINDOW = 900;
const MAX_EMITS_PER_EVENT_PER_WINDOW = 180;

const MAX_LOW_PRIORITY_EMITS_PER_WINDOW = 1800;
const MAX_LOW_PRIORITY_EMITS_PER_EVENT_PER_WINDOW = 360;

const MAX_ABSOLUTE_EMITS_PER_WINDOW = 5000;

const DROP_WARNING_INTERVAL_MS = 1200;
const NOISY_RECENT_SAMPLE_MS = 160;

/*
  Eventos críticos del lifecycle. No deben quedarse bloqueados por ruido UI.
*/
const CRITICAL_EVENT_NAMES = new Set([
  "app:ready",
  "app:boot:ready",
  "app:boot:complete",
  "app:boot:error",

  "app:route:change",

  "router:before-render",
  "router:rendered",
  "router:render:async-complete",
  "router:navigation:complete",
  "router:bound",

  "auth:login:success",
  "auth:logout",
  "auth:logout:success",
  "auth:session:restored",
  "auth:session:cleared",

  "app:session:restored",
  "app:session:cleared",
  "app:auth:change",

  "app:lang:change",
  "app:theme:change",
]);

/*
  Eventos UI/telemetría que pueden repetirse durante boot/render.
  Tienen rate propio, no consumen max-total-rate normal.
*/
const LOW_PRIORITY_EVENT_PREFIXES = Object.freeze([
  "sidebar:",
  "topbar:",
  "toast:",
  "app:user-ui:",
  "app:ui:module:",
  "app:ui:toast-bridge:",
  "app:boot:loader:",
]);

const LOW_PRIORITY_EVENT_NAMES = new Set([
  "app:ui:ready",
  "app:ui:repair",
  "app:ui:repair-request",
  "app:ui:init:start",
  "app:ui:init:success",
  "app:ui:init:error",
]);

const SILENT_DROP_PREFIXES = Object.freeze([
  "sidebar:indicator:",
  "sidebar:active:",
  "sidebar:visual:",
]);

/* =========================================================
   BASICS
========================================================= */

function localIsBrowser() {
  try {
    if (typeof isBrowser === "function") {
      return Boolean(isBrowser());
    }
  } catch {}

  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
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

function safeWarn(...args) {
  try {
    console.warn("[CoreEvents]", ...args);
  } catch {}
}

function createNoopOff() {
  return () => false;
}

function normalizeEventName(name = "") {
  return safeText(name, "");
}

function normalizeOptions(options = false) {
  try {
    if (typeof normalizeListenerOptions === "function") {
      const normalized = normalizeListenerOptions(options);

      if (
        normalized === true ||
        normalized === false ||
        isObject(normalized)
      ) {
        return normalized;
      }
    }
  } catch {}

  if (options === true) {
    return {
      capture: true,
    };
  }

  if (
    options === false ||
    options === null ||
    options === undefined
  ) {
    return false;
  }

  if (isObject(options)) {
    return {
      ...options,
    };
  }

  return false;
}

function getOptionsTarget(options = false) {
  if (!isObject(options)) {
    return null;
  }

  return options.target || null;
}

function normalizeDomOptions(options = false) {
  const normalized = normalizeOptions(options);

  if (normalized === true) {
    return {
      capture: true,
    };
  }

  if (
    normalized === false ||
    normalized === null ||
    normalized === undefined
  ) {
    return false;
  }

  if (!isObject(normalized)) {
    return false;
  }

  /*
    No pasamos once aquí.
    once se controla manualmente para poder limpiar activeListeners.
    target tampoco pertenece a addEventListener.
  */
  return {
    capture: Boolean(normalized.capture),
    passive: Boolean(normalized.passive),
  };
}

function wantsOnce(options = false) {
  const normalized = normalizeOptions(options);

  return Boolean(
    isObject(normalized) &&
    normalized.once
  );
}

function withoutOnce(options = false) {
  const normalized = normalizeOptions(options);

  if (!isObject(normalized)) {
    return normalized;
  }

  const {
    once,
    ...rest
  } = normalized;

  return rest;
}

function wantsFirebreakBypass(options = false) {
  const normalized = normalizeOptions(options);

  return Boolean(
    isObject(normalized) &&
    normalized.bypassFirebreak === true
  );
}

function isEventTargetLike(target) {
  return Boolean(
    target &&
    isFunction(target.addEventListener) &&
    isFunction(target.removeEventListener) &&
    isFunction(target.dispatchEvent)
  );
}

function getDefaultTarget() {
  if (!localIsBrowser()) {
    return null;
  }

  try {
    return document || null;
  } catch {
    return null;
  }
}

function getWindowTarget() {
  if (!localIsBrowser()) {
    return null;
  }

  try {
    return window || null;
  } catch {
    return null;
  }
}

function resolveTarget(target = DEFAULT_TARGET) {
  if (isEventTargetLike(target)) {
    return target;
  }

  const key = safeText(target, DEFAULT_TARGET).toLowerCase();

  if (key === "window") {
    return getWindowTarget();
  }

  if (key === "document") {
    return getDefaultTarget();
  }

  return getDefaultTarget();
}

function createCustomEvent(name, detail = {}) {
  try {
    return new CustomEvent(name, {
      detail,
      bubbles: false,
      cancelable: false,
      composed: false,
    });
  } catch {
    try {
      if (!localIsBrowser()) {
        return null;
      }

      const event = document.createEvent("CustomEvent");

      event.initCustomEvent(
        name,
        false,
        false,
        detail
      );

      return event;
    } catch {
      return null;
    }
  }
}

/* =========================================================
   EVENT CLASSIFICATION
========================================================= */

function startsWithAny(value = "", prefixes = []) {
  const text = safeText(value, "");

  return prefixes.some((prefix) =>
    text.startsWith(prefix)
  );
}

function isCriticalEvent(name = "") {
  return CRITICAL_EVENT_NAMES.has(
    normalizeEventName(name)
  );
}

function isLowPriorityEvent(name = "") {
  const eventName =
    normalizeEventName(name);

  return Boolean(
    LOW_PRIORITY_EVENT_NAMES.has(eventName) ||
    startsWithAny(
      eventName,
      LOW_PRIORITY_EVENT_PREFIXES
    )
  );
}

function isSilentDropEvent(name = "") {
  return startsWithAny(
    normalizeEventName(name),
    SILENT_DROP_PREFIXES
  );
}

function getEventClass(name = "") {
  const eventName =
    normalizeEventName(name);

  if (isCriticalEvent(eventName)) {
    return "critical";
  }

  if (isLowPriorityEvent(eventName)) {
    return "low-priority";
  }

  return "normal";
}

/* =========================================================
   IDS / DEDUPE
========================================================= */

const handlerIds = new WeakMap();
const targetIds = new WeakMap();

let nextHandlerId = 1;
let nextTargetId = 1;

function getHandlerId(handler) {
  if (!isFunction(handler)) {
    return "handler:none";
  }

  try {
    if (!handlerIds.has(handler)) {
      handlerIds.set(
        handler,
        nextHandlerId++
      );
    }

    return `handler:${handlerIds.get(handler)}`;
  } catch {
    return "handler:unknown";
  }
}

function getTargetKey(target = DEFAULT_TARGET) {
  if (typeof target === "string") {
    return `target:${safeText(target, DEFAULT_TARGET).toLowerCase()}`;
  }

  if (!target) {
    return `target:${DEFAULT_TARGET}`;
  }

  try {
    if (!targetIds.has(target)) {
      targetIds.set(
        target,
        nextTargetId++
      );
    }

    return `target:${targetIds.get(target)}`;
  } catch {
    return "target:unknown";
  }
}

function normalizeOptionsForKey(options = false) {
  const normalized = normalizeDomOptions(options);

  if (normalized === true) {
    return "capture:true|passive:false";
  }

  if (
    normalized === false ||
    normalized === null ||
    normalized === undefined
  ) {
    return "capture:false|passive:false";
  }

  if (isObject(normalized)) {
    return [
      `capture:${Boolean(normalized.capture)}`,
      `passive:${Boolean(normalized.passive)}`,
    ].join("|");
  }

  return String(normalized);
}

function makeListenerKey({
  name = "",
  handler = null,
  options = false,
  targetRef = DEFAULT_TARGET,
} = {}) {
  return [
    getTargetKey(targetRef),
    normalizeEventName(name),
    getHandlerId(handler),
    normalizeOptionsForKey(options),
  ].join("::");
}

/* =========================================================
   SAFE PREVIEW
========================================================= */

function safePreview(value, depth = 0) {
  if (depth > 2) {
    return "[depth-limit]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 12)
      .map((item) => safePreview(item, depth + 1));
  }

  if (isObject(value)) {
    const output = {};
    const entries = Object.entries(value).slice(0, 30);

    for (const [key, item] of entries) {
      output[key] = safePreview(item, depth + 1);
    }

    return output;
  }

  try {
    return String(value);
  } catch {
    return "[unserializable]";
  }
}

function mergePreviewWithReason(reason = "", detail = {}) {
  const preview =
    safePreview(detail);

  if (isObject(preview)) {
    return {
      reason,
      ...preview,
    };
  }

  return {
    reason,
    detail:
      preview,
  };
}

/* =========================================================
   FACTORY
========================================================= */

export function createEvents({
  target = DEFAULT_TARGET,
  mirrorToWindow = false,
  maxRecentEvents = MAX_RECENT_EVENTS,

  maxSyncEmitDepth = MAX_SYNC_EMIT_DEPTH,

  maxEmitsPerWindow = MAX_EMITS_PER_WINDOW,
  maxEmitsPerEventPerWindow = MAX_EMITS_PER_EVENT_PER_WINDOW,

  maxLowPriorityEmitsPerWindow = MAX_LOW_PRIORITY_EMITS_PER_WINDOW,
  maxLowPriorityEmitsPerEventPerWindow = MAX_LOW_PRIORITY_EMITS_PER_EVENT_PER_WINDOW,

  maxAbsoluteEmitsPerWindow = MAX_ABSOLUTE_EMITS_PER_WINDOW,

  rateWindowMs = RATE_WINDOW_MS,
} = {}) {
  const memoryListeners = new Map();
  const activeListeners = new Map();
  const recentEvents = [];

  const emitDepthByName = new Map();
  const eventRateMap = new Map();

  const recentSampleMap = new Map();

  let rateWindowStartedAt = safeNow();

  let normalEmitsInWindow = 0;
  let lowPriorityEmitsInWindow = 0;
  let criticalEmitsInWindow = 0;
  let absoluteEmitsInWindow = 0;

  let lastDropWarningAt = 0;

  const state = {
    version: EVENTS_VERSION,
    target: safeText(target, DEFAULT_TARGET),
    browser: localIsBrowser(),

    emitCount: 0,
    onCount: 0,
    offCount: 0,
    onceCount: 0,
    clearCount: 0,
    errorCount: 0,
    dropCount: 0,

    lastEvent: "",
    lastEventAt: 0,
    lastError: null,
    lastDroppedEvent: null,
  };

  function shouldSampleRecent(type = "event", name = "") {
    const eventName =
      normalizeEventName(name);

    if (type !== "emit") {
      return true;
    }

    if (
      isCriticalEvent(eventName) ||
      !isLowPriorityEvent(eventName)
    ) {
      return true;
    }

    const now =
      safeNow();

    const last =
      safeNumber(
        recentSampleMap.get(eventName),
        0
      );

    if (now - last < NOISY_RECENT_SAMPLE_MS) {
      return false;
    }

    recentSampleMap.set(
      eventName,
      now
    );

    return true;
  }

  function pushRecentEvent(type = "event", name = "", detail = {}) {
    if (!shouldSampleRecent(type, name)) {
      return;
    }

    const atMs = safeNow();

    recentEvents.unshift({
      type: safeText(type, "event"),
      name: safeText(name, ""),
      className:
        getEventClass(name),
      detail: safePreview(detail),
      at: safeIsoDate(atMs),
      atMs,
    });

    const limit = Math.max(
      1,
      safeNumber(maxRecentEvents, MAX_RECENT_EVENTS)
    );

    if (recentEvents.length > limit) {
      recentEvents.splice(limit);
    }
  }

  function recordError(source = "events", error = null, name = "") {
    state.errorCount += 1;

    state.lastError = {
      source: safeText(source, "events"),
      name: safeText(name, ""),
      message: safeText(
        error?.message || error,
        "Event bus error."
      ),
      stack: safeText(error?.stack, ""),
      at: safeIsoDate(),
    };

    pushRecentEvent(
      "error",
      name,
      {
        source,
        message:
          state.lastError.message,
      }
    );

    safeWarn(
      state.lastError.message,
      {
        source,
        name,
        error,
      }
    );
  }

  function recordDrop(name = "", reason = "", detail = {}) {
    state.dropCount += 1;

    state.lastDroppedEvent = {
      name: safeText(name, ""),
      reason: safeText(reason, ""),
      className:
        getEventClass(name),
      at: safeIsoDate(),
    };

    pushRecentEvent(
      "drop",
      name,
      mergePreviewWithReason(
        reason,
        detail
      )
    );

    const now = safeNow();

    if (
      isSilentDropEvent(name) &&
      now - lastDropWarningAt < DROP_WARNING_INTERVAL_MS * 4
    ) {
      return;
    }

    /*
      No spamear consola si precisamente estamos cortando una tormenta.
    */
    if (now - lastDropWarningAt > DROP_WARNING_INTERVAL_MS) {
      lastDropWarningAt = now;

      safeWarn(
        `Evento bloqueado por firebreak: ${name}`,
        {
          reason,
          className:
            getEventClass(name),
          detail,
        }
      );
    }
  }

  function resetRateWindowIfNeeded() {
    const now = safeNow();

    const windowMs = Math.max(
      100,
      safeNumber(rateWindowMs, RATE_WINDOW_MS)
    );

    if (now - rateWindowStartedAt <= windowMs) {
      return;
    }

    rateWindowStartedAt = now;

    normalEmitsInWindow = 0;
    lowPriorityEmitsInWindow = 0;
    criticalEmitsInWindow = 0;
    absoluteEmitsInWindow = 0;

    eventRateMap.clear();
    recentSampleMap.clear();
  }

  function shouldAllowEmit(eventName = "", options = {}) {
    const name = normalizeEventName(eventName);

    if (!name) {
      return false;
    }

    if (wantsFirebreakBypass(options)) {
      return true;
    }

    resetRateWindowIfNeeded();

    const eventClass =
      getEventClass(name);

    const currentDepth = safeNumber(
      emitDepthByName.get(name),
      0
    );

    if (
      currentDepth >=
      safeNumber(maxSyncEmitDepth, MAX_SYNC_EMIT_DEPTH)
    ) {
      recordDrop(
        name,
        "max-sync-depth",
        {
          currentDepth,
          maxSyncEmitDepth,
        }
      );

      return false;
    }

    absoluteEmitsInWindow += 1;

    if (
      absoluteEmitsInWindow >
      safeNumber(maxAbsoluteEmitsPerWindow, MAX_ABSOLUTE_EMITS_PER_WINDOW)
    ) {
      recordDrop(
        name,
        "max-absolute-rate",
        {
          absoluteEmitsInWindow,
          maxAbsoluteEmitsPerWindow,
        }
      );

      return false;
    }

    const currentEventCount = safeNumber(
      eventRateMap.get(name),
      0
    ) + 1;

    eventRateMap.set(
      name,
      currentEventCount
    );

    if (eventClass === "critical") {
      criticalEmitsInWindow += 1;
      return true;
    }

    if (eventClass === "low-priority") {
      lowPriorityEmitsInWindow += 1;

      if (
        lowPriorityEmitsInWindow >
        safeNumber(
          maxLowPriorityEmitsPerWindow,
          MAX_LOW_PRIORITY_EMITS_PER_WINDOW
        )
      ) {
        recordDrop(
          name,
          "max-low-priority-rate",
          {
            lowPriorityEmitsInWindow,
            maxLowPriorityEmitsPerWindow,
          }
        );

        return false;
      }

      if (
        currentEventCount >
        safeNumber(
          maxLowPriorityEmitsPerEventPerWindow,
          MAX_LOW_PRIORITY_EMITS_PER_EVENT_PER_WINDOW
        )
      ) {
        recordDrop(
          name,
          "max-low-priority-event-rate",
          {
            currentEventCount,
            maxLowPriorityEmitsPerEventPerWindow,
          }
        );

        return false;
      }

      return true;
    }

    normalEmitsInWindow += 1;

    if (
      normalEmitsInWindow >
      safeNumber(maxEmitsPerWindow, MAX_EMITS_PER_WINDOW)
    ) {
      recordDrop(
        name,
        "max-total-rate",
        {
          normalEmitsInWindow,
          maxEmitsPerWindow,
        }
      );

      return false;
    }

    if (
      currentEventCount >
      safeNumber(
        maxEmitsPerEventPerWindow,
        MAX_EMITS_PER_EVENT_PER_WINDOW
      )
    ) {
      recordDrop(
        name,
        "max-event-rate",
        {
          currentEventCount,
          maxEmitsPerEventPerWindow,
        }
      );

      return false;
    }

    return true;
  }

  function beginEmit(eventName = "") {
    const name = normalizeEventName(eventName);

    const currentDepth = safeNumber(
      emitDepthByName.get(name),
      0
    );

    emitDepthByName.set(
      name,
      currentDepth + 1
    );
  }

  function endEmit(eventName = "") {
    const name = normalizeEventName(eventName);

    const currentDepth = safeNumber(
      emitDepthByName.get(name),
      0
    );

    if (currentDepth <= 1) {
      emitDepthByName.delete(name);
      return;
    }

    emitDepthByName.set(
      name,
      currentDepth - 1
    );
  }

  function getMemorySet(name = "") {
    const eventName = normalizeEventName(name);

    if (!eventName) {
      return null;
    }

    if (!memoryListeners.has(eventName)) {
      memoryListeners.set(
        eventName,
        new Set()
      );
    }

    return memoryListeners.get(eventName);
  }

  function makeEventLike(name = "", detail = {}, targetRef = null) {
    return {
      type: normalizeEventName(name),
      detail,
      payload: detail,
      target: targetRef,
      currentTarget: targetRef,
      defaultPrevented: false,

      preventDefault() {
        this.defaultPrevented = true;
      },

      stopPropagation() {},
      stopImmediatePropagation() {},
    };
  }

  function callHandlerSafely({
    handler,
    event,
    eventName = "",
    source = "handler",
  } = {}) {
    if (!isFunction(handler)) {
      return false;
    }

    try {
      const result =
        handler(event);

      if (
        result &&
        typeof result === "object" &&
        isFunction(result.catch)
      ) {
        result.catch((error) => {
          recordError(
            `${source}:async`,
            error,
            eventName
          );
        });
      }

      return true;
    } catch (error) {
      recordError(
        source,
        error,
        eventName
      );

      return false;
    }
  }

  function emitMemory(name = "", detail = {}) {
    const eventName = normalizeEventName(name);
    const set = memoryListeners.get(eventName);

    if (!set || !set.size) {
      return false;
    }

    const eventLike = makeEventLike(
      eventName,
      detail,
      null
    );

    for (const record of Array.from(set)) {
      callHandlerSafely({
        handler:
          record.wrappedHandler ||
          record.handler,
        event:
          eventLike,
        eventName,
        source:
          "memory-handler",
      });
    }

    return true;
  }

  function dispatchDomEvent({
    eventName = "",
    payload = {},
    domTarget = null,
    source = "dom-dispatch",
  } = {}) {
    if (
      !localIsBrowser() ||
      !isEventTargetLike(domTarget)
    ) {
      return false;
    }

    try {
      const event = createCustomEvent(
        eventName,
        payload
      );

      if (!event) {
        return false;
      }

      /*
        Las excepciones de listeners DOM nativos no siempre se propagan
        al try/catch de dispatchEvent. Por eso los listeners de este bus
        se registran envueltos.
      */
      return Boolean(
        domTarget.dispatchEvent(event)
      );
    } catch (error) {
      recordError(
        source,
        error,
        eventName
      );

      return false;
    }
  }

  function emit(name, detail = {}, options = {}) {
    const eventName = normalizeEventName(name);

    if (!eventName) {
      return false;
    }

    if (!shouldAllowEmit(eventName, options)) {
      return false;
    }

    const payload =
      detail === undefined
        ? {}
        : detail;

    state.emitCount += 1;
    state.lastEvent = eventName;
    state.lastEventAt = safeNow();

    pushRecentEvent(
      "emit",
      eventName,
      payload
    );

    beginEmit(eventName);

    try {
      const optionsTarget = getOptionsTarget(options);

      const domTarget = resolveTarget(
        optionsTarget || target
      );

      let emitted = false;

      if (
        localIsBrowser() &&
        isEventTargetLike(domTarget)
      ) {
        emitted = dispatchDomEvent({
          eventName,
          payload,
          domTarget,
          source:
            "dom-dispatch",
        });

        if (
          mirrorToWindow &&
          domTarget !== getWindowTarget()
        ) {
          dispatchDomEvent({
            eventName,
            payload,
            domTarget:
              getWindowTarget(),
            source:
              "window-mirror",
          });
        }
      } else {
        emitted = emitMemory(
          eventName,
          payload
        );
      }

      return emitted;
    } finally {
      endEmit(eventName);
    }
  }

  function makeSafeDomHandler(eventName, handler) {
    return function safeDomHandler(event) {
      return callHandlerSafely({
        handler,
        event,
        eventName,
        source:
          "dom-handler",
      });
    };
  }

  function makeSafeMemoryHandler(eventName, handler) {
    return function safeMemoryHandler(event) {
      return callHandlerSafely({
        handler,
        event,
        eventName,
        source:
          "memory-handler",
      });
    };
  }

  function on(name, handler, options = false) {
    const eventName = normalizeEventName(name);

    if (
      !eventName ||
      !isFunction(handler)
    ) {
      return createNoopOff();
    }

    if (wantsOnce(options)) {
      return once(
        eventName,
        handler,
        withoutOnce(options)
      );
    }

    const finalOptions = normalizeDomOptions(options);
    const optionsTarget = getOptionsTarget(options);
    const targetRef = optionsTarget || target;
    const domTarget = resolveTarget(targetRef);

    const key = makeListenerKey({
      name: eventName,
      handler,
      options: finalOptions,
      targetRef,
    });

    if (activeListeners.has(key)) {
      return activeListeners.get(key)?.off || createNoopOff();
    }

    state.onCount += 1;

    let off = createNoopOff();
    let wrappedHandler = null;

    if (
      localIsBrowser() &&
      isEventTargetLike(domTarget)
    ) {
      wrappedHandler = makeSafeDomHandler(
        eventName,
        handler
      );

      try {
        domTarget.addEventListener(
          eventName,
          wrappedHandler,
          finalOptions
        );

        off = () => {
          if (!activeListeners.has(key)) {
            return false;
          }

          try {
            domTarget.removeEventListener(
              eventName,
              wrappedHandler,
              finalOptions
            );
          } catch (error) {
            recordError(
              "dom-remove",
              error,
              eventName
            );
          }

          activeListeners.delete(key);

          state.offCount += 1;

          pushRecentEvent(
            "off",
            eventName,
            {
              key,
            }
          );

          return true;
        };
      } catch (error) {
        recordError(
          "dom-add",
          error,
          eventName
        );

        return createNoopOff();
      }
    } else {
      const set = getMemorySet(eventName);

      if (!set) {
        return createNoopOff();
      }

      wrappedHandler = makeSafeMemoryHandler(
        eventName,
        handler
      );

      const memoryRecord = {
        key,
        name:
          eventName,
        handler,
        wrappedHandler,
      };

      set.add(memoryRecord);

      off = () => {
        if (!activeListeners.has(key)) {
          return false;
        }

        try {
          set.delete(memoryRecord);
        } catch {}

        activeListeners.delete(key);

        state.offCount += 1;

        pushRecentEvent(
          "off",
          eventName,
          {
            key,
          }
        );

        return true;
      };
    }

    activeListeners.set(
      key,
      {
        key,
        name:
          eventName,
        handler,
        wrappedHandler,
        options:
          finalOptions,
        once:
          false,
        target:
          getTargetKey(targetRef),
        targetName:
          typeof targetRef === "string"
            ? targetRef
            : "custom",
        off,
        createdAt:
          safeIsoDate(),
      }
    );

    pushRecentEvent(
      "on",
      eventName,
      {
        key,
      }
    );

    return off;
  }

  function off(name, handler, options = false) {
    const eventName = normalizeEventName(name);

    if (
      !eventName ||
      !isFunction(handler)
    ) {
      return false;
    }

    const finalOptions = normalizeDomOptions(options);
    const optionsTarget = getOptionsTarget(options);
    const targetRef = optionsTarget || target;

    const key = makeListenerKey({
      name:
        eventName,
      handler,
      options:
        finalOptions,
      targetRef,
    });

    const record = activeListeners.get(key);

    if (
      record &&
      isFunction(record.off)
    ) {
      return record.off();
    }

    /*
      Fallback directo:
      solo útil si alguien registró fuera del mapa.
      En listeners de este bus normalmente no se usa porque el handler real
      registrado en DOM es el wrapper.
    */
    const domTarget = resolveTarget(targetRef);

    try {
      if (
        localIsBrowser() &&
        isEventTargetLike(domTarget)
      ) {
        domTarget.removeEventListener(
          eventName,
          handler,
          finalOptions
        );
      } else {
        const set = memoryListeners.get(eventName);

        if (set) {
          for (const item of Array.from(set)) {
            if (item?.handler === handler) {
              set.delete(item);
            }
          }
        }
      }

      state.offCount += 1;

      pushRecentEvent(
        "off:fallback",
        eventName,
        {}
      );

      return true;
    } catch (error) {
      recordError(
        "off",
        error,
        eventName
      );

      return false;
    }
  }

  function once(name, handler, options = false) {
    const eventName = normalizeEventName(name);

    if (
      !eventName ||
      !isFunction(handler)
    ) {
      return createNoopOff();
    }

    state.onceCount += 1;

    let dispose = null;

    const wrappedOnce = (event) => {
      try {
        dispose?.();
      } catch {}

      callHandlerSafely({
        handler,
        event,
        eventName,
        source:
          "once-handler",
      });
    };

    dispose = on(
      eventName,
      wrappedOnce,
      withoutOnce(options)
    );

    pushRecentEvent(
      "once",
      eventName,
      {}
    );

    return dispose;
  }

  function clear(name = "") {
    const eventName = normalizeEventName(name);

    let count = 0;

    for (const record of Array.from(activeListeners.values())) {
      if (
        eventName &&
        record.name !== eventName
      ) {
        continue;
      }

      try {
        if (record.off?.()) {
          count += 1;
        }
      } catch (error) {
        recordError(
          "clear",
          error,
          record.name
        );
      }
    }

    if (eventName) {
      memoryListeners.delete(eventName);
    } else {
      memoryListeners.clear();
    }

    state.clearCount += 1;

    pushRecentEvent(
      "clear",
      eventName || "*",
      {
        count,
      }
    );

    return count;
  }

  function listenerCount(name = "") {
    const eventName = normalizeEventName(name);

    if (!eventName) {
      return activeListeners.size;
    }

    let count = 0;

    for (const record of activeListeners.values()) {
      if (record.name === eventName) {
        count += 1;
      }
    }

    return count;
  }

  function names() {
    const set = new Set();

    for (const record of activeListeners.values()) {
      if (record.name) {
        set.add(record.name);
      }
    }

    for (const key of memoryListeners.keys()) {
      set.add(key);
    }

    return Array.from(set);
  }

  function getSnapshot() {
    return {
      version:
        state.version,

      target:
        state.target,

      browser:
        localIsBrowser(),

      emitCount:
        state.emitCount,

      onCount:
        state.onCount,

      offCount:
        state.offCount,

      onceCount:
        state.onceCount,

      clearCount:
        state.clearCount,

      errorCount:
        state.errorCount,

      dropCount:
        state.dropCount,

      lastEvent:
        state.lastEvent,

      lastEventAt:
        state.lastEventAt,

      lastEventAtIso:
        state.lastEventAt
          ? safeIsoDate(state.lastEventAt)
          : "",

      lastError:
        state.lastError,

      lastDroppedEvent:
        state.lastDroppedEvent,

      listenerCount:
        listenerCount(),

      eventNames:
        names(),

      firebreaks: {
        maxSyncEmitDepth,

        rateWindowMs,

        maxEmitsPerWindow,
        maxEmitsPerEventPerWindow,

        maxLowPriorityEmitsPerWindow,
        maxLowPriorityEmitsPerEventPerWindow,

        maxAbsoluteEmitsPerWindow,

        currentNormalEmitsInWindow:
          normalEmitsInWindow,

        currentLowPriorityEmitsInWindow:
          lowPriorityEmitsInWindow,

        currentCriticalEmitsInWindow:
          criticalEmitsInWindow,

        currentAbsoluteEmitsInWindow:
          absoluteEmitsInWindow,

        currentEventRates:
          Object.fromEntries(
            eventRateMap.entries()
          ),

        currentEmitDepth:
          Object.fromEntries(
            emitDepthByName.entries()
          ),
      },

      listeners:
        Array.from(activeListeners.values()).map((record) => ({
          key:
            record.key,

          name:
            record.name,

          className:
            getEventClass(record.name),

          once:
            Boolean(record.once),

          target:
            record.target,

          targetName:
            record.targetName,

          createdAt:
            record.createdAt,
        })),

      recent:
        recentEvents.map((item) => ({
          ...item,
        })),
    };
  }

  function reset() {
    clear();

    memoryListeners.clear();
    activeListeners.clear();
    recentEvents.splice(0);

    emitDepthByName.clear();
    eventRateMap.clear();
    recentSampleMap.clear();

    rateWindowStartedAt = safeNow();

    normalEmitsInWindow = 0;
    lowPriorityEmitsInWindow = 0;
    criticalEmitsInWindow = 0;
    absoluteEmitsInWindow = 0;

    lastDropWarningAt = 0;

    state.emitCount = 0;
    state.onCount = 0;
    state.offCount = 0;
    state.onceCount = 0;
    state.clearCount = 0;
    state.errorCount = 0;
    state.dropCount = 0;

    state.lastEvent = "";
    state.lastEventAt = 0;
    state.lastError = null;
    state.lastDroppedEvent = null;

    return getSnapshot();
  }

  return {
    emit,

    on,
    off,
    once,

    clear,

    listenerCount,
    names,

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,

    reset,
  };
}

export default {
  createEvents,
};
