/* =========================================================
   Onion SPA - Core Events
   Archivo: src/core/events.js

   ONION SUPPORT · CORE EVENTS
   FINAL PRO SYSTEM · EVENT BUS / FIREBREAK SAFE · 15/10

   Responsabilidades:
   - centralizar el event bus del Core
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
   - redacción defensiva de tokens/secrets en snapshots
   - captura errores async de handlers con .catch()
   - soporte wildcard "*" en memoria para diagnóstico
   - firebreak HTTP/noisy events sin llenar consola
   - throttling global de warnings incluso con buses duplicados
   - alias snapshot/getSnapshot/getDebugSnapshot
========================================================= */

import {
  isBrowser,
  normalizeListenerOptions,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const EVENTS_VERSION =
  "15.0.0";

const DEFAULT_TARGET =
  "document";

const WILDCARD_EVENT =
  "*";

const MAX_RECENT_EVENTS =
  120;

const MAX_SYNC_EMIT_DEPTH =
  12;

const RATE_WINDOW_MS =
  1000;

const MAX_EMITS_PER_WINDOW =
  900;

const MAX_EMITS_PER_EVENT_PER_WINDOW =
  180;

const MAX_LOW_PRIORITY_EMITS_PER_WINDOW =
  1200;

const MAX_LOW_PRIORITY_EMITS_PER_EVENT_PER_WINDOW =
  240;

const MAX_CRITICAL_EMITS_PER_WINDOW =
  2500;

const MAX_CRITICAL_EMITS_PER_EVENT_PER_WINDOW =
  720;

const MAX_ABSOLUTE_EMITS_PER_WINDOW =
  5000;

const DROP_WARNING_INTERVAL_MS =
  1600;

const DROP_WARNING_PER_EVENT_INTERVAL_MS =
  7000;

const NOISY_RECENT_SAMPLE_MS =
  220;

const GLOBAL_DROP_GUARD_KEY =
  "__ONION_CORE_EVENTS_DROP_GUARD__";

const CRITICAL_EVENT_NAMES =
  new Set([
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
    "app:state:patched",

    "app:route:change",
    "app:public-path:change",

    "app:user:change",
    "app:token:change",
    "app:auth:change",

    "app:session:state",
    "app:session:applied",
    "app:session:loaded",
    "app:session:restored",
    "app:session:cleared",

    "app:loading:change",
    "app:error",

    "app:lang:change",
    "app:theme:change",

    "router:before-render",
    "router:rendered",
    "router:render:async-complete",
    "router:navigation:complete",
    "router:bound",
    "router:error",

    "auth:login:success",
    "auth:logout",
    "auth:logout:success",
    "auth:session:restored",
    "auth:session:cleared",
    "auth:restore:error",

    "app:request:error",
    "http:request:error",
  ]);

const CRITICAL_EVENT_PREFIXES =
  Object.freeze([
    "router:",
    "auth:",
    "app:core:",
    "app:session:",
  ]);

const LOW_PRIORITY_EVENT_PREFIXES =
  Object.freeze([
    "sidebar:",
    "topbar:",
    "toast:",
    "tooltip:",
    "loader:",

    "app:user-ui:",
    "app:ui:",
    "app:ui:module:",
    "app:ui:toast-bridge:",
    "app:boot:loader:",

    "app:module:",
    "app:http:",
    "app:request:",

    "http:",
    "network:",
    "app:network:",
    "core:network:",
  ]);

const LOW_PRIORITY_EVENT_NAMES =
  new Set([
    "app:ui:ready",
    "app:ui:repair",
    "app:ui:repair-request",
    "app:ui:init:start",
    "app:ui:init:success",
    "app:ui:init:error",

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

const SILENT_DROP_PREFIXES =
  Object.freeze([
    "sidebar:indicator:",
    "sidebar:active:",
    "sidebar:visual:",
    "topbar:visual:",
    "tooltip:position:",

    "http:request:",
    "http:pending:",
    "app:request:",
    "app:pending:",
  ]);

const SILENT_DROP_NAMES =
  new Set([
    "app:module:duplicate",

    "http:request:start",
    "http:request:attempt",
    "http:pending:change",

    "app:request:start",
    "app:request:attempt",
    "app:pending:change",
  ]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code/i;

const TOKENISH_TEXT_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)[^&#\s]+/i;

/* =========================================================
   BASICS
========================================================= */

function localIsBrowser() {
  try {
    if (typeof isBrowser === "function") {
      return Boolean(
        isBrowser()
      );
    }
  } catch {}

  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function getGlobalObject() {
  try {
    if (typeof globalThis !== "undefined") {
      return globalThis;
    }
  } catch {}

  try {
    if (typeof window !== "undefined") {
      return window;
    }
  } catch {}

  return null;
}

function getGlobalDropGuard() {
  const root =
    getGlobalObject();

  if (!root) {
    return {
      lastWarningAt:
        0,

      lastByKey:
        new Map(),

      suppressed:
        0,
    };
  }

  try {
    if (!root[GLOBAL_DROP_GUARD_KEY]) {
      Object.defineProperty(
        root,
        GLOBAL_DROP_GUARD_KEY,
        {
          value: {
            lastWarningAt:
              0,

            lastByKey:
              new Map(),

            suppressed:
              0,
          },

          configurable:
            true,

          enumerable:
            false,

          writable:
            true,
        }
      );
    }

    return root[GLOBAL_DROP_GUARD_KEY];
  } catch {}

  return {
    lastWarningAt:
      0,

    lastByKey:
      new Map(),

    suppressed:
      0,
  };
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
    console.warn(
      "[CoreEvents]",
      ...args
    );
  } catch {}
}

function createNoopOff() {
  return () => false;
}

function normalizeEventName(name = "") {
  return safeText(
    name,
    ""
  );
}

function normalizeOptions(options = false) {
  try {
    if (typeof normalizeListenerOptions === "function") {
      const normalized =
        normalizeListenerOptions(options);

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
      capture:
        true,
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
  if (
    isObject(options) &&
    options.target
  ) {
    return options.target;
  }

  const normalized =
    normalizeOptions(options);

  if (
    isObject(normalized) &&
    normalized.target
  ) {
    return normalized.target;
  }

  return null;
}

function normalizeDomOptions(options = false) {
  const normalized =
    normalizeOptions(options);

  if (normalized === true) {
    return {
      capture:
        true,
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

  const finalOptions = {
    capture:
      Boolean(normalized.capture),

    passive:
      Boolean(normalized.passive),
  };

  if (normalized.signal) {
    finalOptions.signal =
      normalized.signal;
  }

  return finalOptions;
}

function wantsOnce(options = false) {
  if (
    isObject(options) &&
    options.once === true
  ) {
    return true;
  }

  const normalized =
    normalizeOptions(options);

  return Boolean(
    isObject(normalized) &&
    normalized.once === true
  );
}

function withoutOnce(options = false) {
  if (!isObject(options)) {
    return options;
  }

  const {
    once,
    ...rest
  } = options;

  return rest;
}

function wantsFirebreakBypass(options = false) {
  if (
    isObject(options) &&
    options.bypassFirebreak === true
  ) {
    return true;
  }

  const normalized =
    normalizeOptions(options);

  return Boolean(
    isObject(normalized) &&
    normalized.bypassFirebreak === true
  );
}

function wantsWindowMirror(options = false, defaultValue = false) {
  if (
    isObject(options) &&
    typeof options.mirrorToWindow === "boolean"
  ) {
    return options.mirrorToWindow;
  }

  const normalized =
    normalizeOptions(options);

  if (
    isObject(normalized) &&
    typeof normalized.mirrorToWindow === "boolean"
  ) {
    return normalized.mirrorToWindow;
  }

  return Boolean(defaultValue);
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

  const key =
    safeText(
      target,
      DEFAULT_TARGET
    ).toLowerCase();

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
    if (typeof CustomEvent === "function") {
      return new CustomEvent(name, {
        detail,
        bubbles:
          false,
        cancelable:
          false,
        composed:
          false,
      });
    }
  } catch {}

  try {
    if (!localIsBrowser()) {
      return null;
    }

    const event =
      document.createEvent("CustomEvent");

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

/* =========================================================
   EVENT CLASSIFICATION
========================================================= */

function startsWithAny(value = "", prefixes = []) {
  const text =
    safeText(value, "");

  return prefixes.some((prefix) =>
    text.startsWith(prefix)
  );
}

function isCriticalEvent(name = "") {
  const eventName =
    normalizeEventName(name);

  return Boolean(
    CRITICAL_EVENT_NAMES.has(eventName) ||
    startsWithAny(
      eventName,
      CRITICAL_EVENT_PREFIXES
    )
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
  const eventName =
    normalizeEventName(name);

  return Boolean(
    SILENT_DROP_NAMES.has(eventName) ||
    startsWithAny(
      eventName,
      SILENT_DROP_PREFIXES
    )
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

const handlerIds =
  new WeakMap();

const targetIds =
  new WeakMap();

let nextHandlerId =
  1;

let nextTargetId =
  1;

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
  const normalized =
    normalizeDomOptions(options);

  if (normalized === true) {
    return "capture:true|passive:false|signal:false";
  }

  if (
    normalized === false ||
    normalized === null ||
    normalized === undefined
  ) {
    return "capture:false|passive:false|signal:false";
  }

  if (isObject(normalized)) {
    return [
      `capture:${Boolean(normalized.capture)}`,
      `passive:${Boolean(normalized.passive)}`,
      `signal:${Boolean(normalized.signal)}`,
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
   SAFE PREVIEW / REDACTION
========================================================= */

function redactString(value = "") {
  const text =
    safeText(value, "");

  if (!text) {
    return text;
  }

  try {
    return text
      .replace(
        /(bearer\s+)([a-z0-9._~+/=-]+)/gi,
        "$1***"
      )
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(
        /([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/gi,
        "***"
      );
  } catch {
    return TOKENISH_TEXT_RE.test(text)
      ? "***"
      : text;
  }
}

function shouldRedactKey(key = "") {
  return SENSITIVE_KEY_RE.test(
    safeText(key, "")
  );
}

function safePreview(value, depth = 0, keyHint = "") {
  if (shouldRedactKey(keyHint)) {
    return value
      ? "***"
      : null;
  }

  if (depth > 2) {
    return "[depth-limit]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (typeof value === "string") {
    return redactString(value);
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
        redactString(
          safeText(
            value.message,
            "Error"
          )
        ),

      stack:
        value.stack
          ? "[stack]"
          : "",
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
    return value
      .slice(0, 12)
      .map((item) =>
        safePreview(
          item,
          depth + 1,
          keyHint
        )
      );
  }

  if (isObject(value)) {
    const output = {};
    const entries =
      Object.entries(value).slice(0, 30);

    for (const [key, item] of entries) {
      output[key] =
        shouldRedactKey(key)
          ? item
            ? "***"
            : null
          : safePreview(
              item,
              depth + 1,
              key
            );
    }

    return output;
  }

  try {
    return redactString(
      String(value)
    );
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

  maxCriticalEmitsPerWindow = MAX_CRITICAL_EMITS_PER_WINDOW,
  maxCriticalEmitsPerEventPerWindow = MAX_CRITICAL_EMITS_PER_EVENT_PER_WINDOW,

  maxAbsoluteEmitsPerWindow = MAX_ABSOLUTE_EMITS_PER_WINDOW,

  rateWindowMs = RATE_WINDOW_MS,
} = {}) {
  const memoryListeners =
    new Map();

  const activeListeners =
    new Map();

  const recentEvents =
    [];

  const emitDepthByName =
    new Map();

  const eventRateMap =
    new Map();

  const recentSampleMap =
    new Map();

  const dropRateMap =
    new Map();

  let rateWindowStartedAt =
    safeNow();

  let normalEmitsInWindow =
    0;

  let lowPriorityEmitsInWindow =
    0;

  let criticalEmitsInWindow =
    0;

  let absoluteEmitsInWindow =
    0;

  let lastDropWarningAt =
    0;

  const state = {
    version:
      EVENTS_VERSION,

    target:
      typeof target === "string"
        ? safeText(
            target,
            DEFAULT_TARGET
          )
        : "custom",

    browser:
      localIsBrowser(),

    emitCount:
      0,

    onCount:
      0,

    offCount:
      0,

    onceCount:
      0,

    clearCount:
      0,

    errorCount:
      0,

    dropCount:
      0,

    silentDropCount:
      0,

    wildcardEmitCount:
      0,

    lastEvent:
      "",

    lastEventAt:
      0,

    lastError:
      null,

    lastDroppedEvent:
      null,
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

    const current =
      safeNow();

    const last =
      safeNumber(
        recentSampleMap.get(eventName),
        0
      );

    if (current - last < NOISY_RECENT_SAMPLE_MS) {
      return false;
    }

    recentSampleMap.set(
      eventName,
      current
    );

    return true;
  }

  function pushRecentEvent(type = "event", name = "", detail = {}) {
    if (!shouldSampleRecent(type, name)) {
      return;
    }

    const atMs =
      safeNow();

    recentEvents.unshift({
      type:
        safeText(
          type,
          "event"
        ),

      name:
        safeText(
          name,
          ""
        ),

      className:
        getEventClass(name),

      detail:
        safePreview(detail),

      at:
        safeIsoDate(atMs),

      atMs,
    });

    const limit =
      Math.max(
        1,
        safeNumber(
          maxRecentEvents,
          MAX_RECENT_EVENTS
        )
      );

    if (recentEvents.length > limit) {
      recentEvents.splice(limit);
    }
  }

  function recordError(source = "events", error = null, name = "") {
    state.errorCount += 1;

    state.lastError = {
      source:
        safeText(
          source,
          "events"
        ),

      name:
        safeText(
          name,
          ""
        ),

      message:
        redactString(
          safeText(
            error?.message || error,
            "Event bus error."
          )
        ),

      stack:
        error?.stack
          ? "[stack]"
          : "",

      at:
        safeIsoDate(),
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
        error:
          safePreview(error),
      }
    );
  }

  function shouldWarnDrop(name = "", reason = "") {
    const eventName =
      normalizeEventName(name);

    if (isSilentDropEvent(eventName)) {
      state.silentDropCount += 1;
      return false;
    }

    const guard =
      getGlobalDropGuard();

    const current =
      safeNow();

    const key =
      `${eventName}:${safeText(reason, "")}`;

    const lastByKey =
      safeNumber(
        guard.lastByKey?.get?.(key),
        0
      );

    if (
      current - lastByKey <
      DROP_WARNING_PER_EVENT_INTERVAL_MS
    ) {
      guard.suppressed =
        safeNumber(
          guard.suppressed,
          0
        ) + 1;

      return false;
    }

    const localLast =
      safeNumber(
        lastDropWarningAt,
        0
      );

    const globalLast =
      safeNumber(
        guard.lastWarningAt,
        0
      );

    if (
      current - localLast < DROP_WARNING_INTERVAL_MS ||
      current - globalLast < DROP_WARNING_INTERVAL_MS
    ) {
      guard.suppressed =
        safeNumber(
          guard.suppressed,
          0
        ) + 1;

      return false;
    }

    lastDropWarningAt =
      current;

    guard.lastWarningAt =
      current;

    try {
      guard.lastByKey.set(
        key,
        current
      );
    } catch {}

    return true;
  }

  function recordDrop(name = "", reason = "", detail = {}) {
    const eventName =
      normalizeEventName(name);

    state.dropCount += 1;

    const dropKey =
      `${eventName}:${safeText(reason, "")}`;

    dropRateMap.set(
      dropKey,
      safeNumber(
        dropRateMap.get(dropKey),
        0
      ) + 1
    );

    state.lastDroppedEvent = {
      name:
        eventName,

      reason:
        safeText(
          reason,
          ""
        ),

      className:
        getEventClass(eventName),

      at:
        safeIsoDate(),
    };

    pushRecentEvent(
      "drop",
      eventName,
      mergePreviewWithReason(
        reason,
        detail
      )
    );

    if (!shouldWarnDrop(eventName, reason)) {
      return;
    }

    safeWarn(
      `Evento bloqueado por firebreak: ${eventName}`,
      {
        reason,
        className:
          getEventClass(eventName),
        detail:
          safePreview(detail),
      }
    );
  }

  function resetRateWindowIfNeeded() {
    const current =
      safeNow();

    const windowMs =
      Math.max(
        100,
        safeNumber(
          rateWindowMs,
          RATE_WINDOW_MS
        )
      );

    if (current - rateWindowStartedAt <= windowMs) {
      return;
    }

    rateWindowStartedAt =
      current;

    normalEmitsInWindow =
      0;

    lowPriorityEmitsInWindow =
      0;

    criticalEmitsInWindow =
      0;

    absoluteEmitsInWindow =
      0;

    eventRateMap.clear();
    recentSampleMap.clear();
    dropRateMap.clear();
  }

  function shouldAllowEmit(eventName = "", options = {}) {
    const name =
      normalizeEventName(eventName);

    if (!name) {
      return false;
    }

    if (wantsFirebreakBypass(options)) {
      return true;
    }

    resetRateWindowIfNeeded();

    const eventClass =
      getEventClass(name);

    const currentDepth =
      safeNumber(
        emitDepthByName.get(name),
        0
      );

    if (
      currentDepth >=
      safeNumber(
        maxSyncEmitDepth,
        MAX_SYNC_EMIT_DEPTH
      )
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
      safeNumber(
        maxAbsoluteEmitsPerWindow,
        MAX_ABSOLUTE_EMITS_PER_WINDOW
      )
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

    const currentEventCount =
      safeNumber(
        eventRateMap.get(name),
        0
      ) + 1;

    eventRateMap.set(
      name,
      currentEventCount
    );

    if (eventClass === "critical") {
      criticalEmitsInWindow += 1;

      if (
        criticalEmitsInWindow >
        safeNumber(
          maxCriticalEmitsPerWindow,
          MAX_CRITICAL_EMITS_PER_WINDOW
        )
      ) {
        recordDrop(
          name,
          "max-critical-total-rate",
          {
            criticalEmitsInWindow,
            maxCriticalEmitsPerWindow,
          }
        );

        return false;
      }

      if (
        currentEventCount >
        safeNumber(
          maxCriticalEmitsPerEventPerWindow,
          MAX_CRITICAL_EMITS_PER_EVENT_PER_WINDOW
        )
      ) {
        recordDrop(
          name,
          "max-critical-event-rate",
          {
            currentEventCount,
            maxCriticalEmitsPerEventPerWindow,
          }
        );

        return false;
      }

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
      safeNumber(
        maxEmitsPerWindow,
        MAX_EMITS_PER_WINDOW
      )
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
    const name =
      normalizeEventName(eventName);

    const currentDepth =
      safeNumber(
        emitDepthByName.get(name),
        0
      );

    emitDepthByName.set(
      name,
      currentDepth + 1
    );
  }

  function endEmit(eventName = "") {
    const name =
      normalizeEventName(eventName);

    const currentDepth =
      safeNumber(
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
    const eventName =
      normalizeEventName(name);

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
      type:
        normalizeEventName(name),

      detail,
      payload:
        detail,

      target:
        targetRef,

      currentTarget:
        targetRef,

      defaultPrevented:
        false,

      preventDefault() {
        this.defaultPrevented =
          true;
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

  function callWildcardSafely({
    handler,
    eventName = "",
    payload = {},
    event = null,
  } = {}) {
    if (!isFunction(handler)) {
      return false;
    }

    try {
      const result =
        handler(
          eventName,
          payload,
          event
        );

      if (
        result &&
        typeof result === "object" &&
        isFunction(result.catch)
      ) {
        result.catch((error) => {
          recordError(
            "wildcard-handler:async",
            error,
            eventName
          );
        });
      }

      return true;
    } catch (error) {
      recordError(
        "wildcard-handler",
        error,
        eventName
      );

      return false;
    }
  }

  function emitMemory(name = "", detail = {}) {
    const eventName =
      normalizeEventName(name);

    const set =
      memoryListeners.get(eventName);

    if (
      !set ||
      !set.size
    ) {
      return false;
    }

    const eventLike =
      makeEventLike(
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

  function emitWildcardMemory(name = "", detail = {}, event = null) {
    const eventName =
      normalizeEventName(name);

    const set =
      memoryListeners.get(WILDCARD_EVENT);

    if (
      !set ||
      !set.size
    ) {
      return false;
    }

    state.wildcardEmitCount += 1;

    const eventLike =
      event ||
      makeEventLike(
        eventName,
        detail,
        null
      );

    for (const record of Array.from(set)) {
      callWildcardSafely({
        handler:
          record.handler,

        eventName,

        payload:
          detail,

        event:
          eventLike,
      });
    }

    return true;
  }

  function dispatchDomEvent({
    eventName = "",
    payload = {},
    domTarget = null,
    source = "dom-dispatch",
    wildcard = true,
  } = {}) {
    if (
      !localIsBrowser() ||
      !isEventTargetLike(domTarget)
    ) {
      return false;
    }

    try {
      const event =
        createCustomEvent(
          eventName,
          payload
        );

      if (!event) {
        return false;
      }

      const result =
        domTarget.dispatchEvent(event);

      if (wildcard) {
        emitWildcardMemory(
          eventName,
          payload,
          event
        );
      }

      return Boolean(result);
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
    const eventName =
      normalizeEventName(name);

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
    state.lastEvent =
      eventName;
    state.lastEventAt =
      safeNow();

    pushRecentEvent(
      "emit",
      eventName,
      payload
    );

    beginEmit(eventName);

    try {
      const optionsTarget =
        getOptionsTarget(options);

      const domTarget =
        resolveTarget(
          optionsTarget || target
        );

      let emitted =
        false;

      if (
        localIsBrowser() &&
        isEventTargetLike(domTarget)
      ) {
        emitted =
          dispatchDomEvent({
            eventName,
            payload,
            domTarget,
            source:
              "dom-dispatch",
            wildcard:
              true,
          });

        if (
          wantsWindowMirror(options, mirrorToWindow) &&
          domTarget !== getWindowTarget()
        ) {
          dispatchDomEvent({
            eventName,
            payload,
            domTarget:
              getWindowTarget(),
            source:
              "window-mirror",
            wildcard:
              false,
          });
        }
      } else {
        emitted =
          emitMemory(
            eventName,
            payload
          );

        emitWildcardMemory(
          eventName,
          payload,
          null
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

  function registerRecord(record) {
    if (!record?.key) {
      return false;
    }

    activeListeners.set(
      record.key,
      record
    );

    return true;
  }

  function on(name, handler, options = false) {
    const eventName =
      normalizeEventName(name);

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

    const finalOptions =
      normalizeDomOptions(options);

    const optionsTarget =
      getOptionsTarget(options);

    const targetRef =
      eventName === WILDCARD_EVENT
        ? "memory"
        : optionsTarget || target;

    const domTarget =
      eventName === WILDCARD_EVENT
        ? null
        : resolveTarget(targetRef);

    const key =
      makeListenerKey({
        name:
          eventName,

        handler,

        options:
          finalOptions,

        targetRef,
      });

    if (activeListeners.has(key)) {
      return (
        activeListeners.get(key)?.off ||
        createNoopOff()
      );
    }

    state.onCount += 1;

    let off =
      createNoopOff();

    let wrappedHandler =
      null;

    if (
      eventName !== WILDCARD_EVENT &&
      localIsBrowser() &&
      isEventTargetLike(domTarget)
    ) {
      wrappedHandler =
        makeSafeDomHandler(
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
      const set =
        getMemorySet(eventName);

      if (!set) {
        return createNoopOff();
      }

      wrappedHandler =
        makeSafeMemoryHandler(
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

    registerRecord({
      key,

      name:
        eventName,

      handler,
      originalHandler:
        handler,

      wrappedHandler,

      options:
        finalOptions,

      once:
        false,

      target:
        getTargetKey(targetRef),

      targetRef,

      targetName:
        typeof targetRef === "string"
          ? targetRef
          : "custom",

      off,

      createdAt:
        safeIsoDate(),
    });

    pushRecentEvent(
      "on",
      eventName,
      {
        key,
      }
    );

    return off;
  }

  function findActiveRecordsByOriginalHandler(name, handler) {
    const eventName =
      normalizeEventName(name);

    const matches = [];

    for (const record of activeListeners.values()) {
      if (
        eventName &&
        record.name !== eventName
      ) {
        continue;
      }

      if (
        record.handler === handler ||
        record.originalHandler === handler ||
        record.wrappedHandler === handler
      ) {
        matches.push(record);
      }
    }

    return matches;
  }

  function off(name, handler, options = false) {
    const eventName =
      normalizeEventName(name);

    if (
      !eventName ||
      !isFunction(handler)
    ) {
      return false;
    }

    const finalOptions =
      normalizeDomOptions(options);

    const optionsTarget =
      getOptionsTarget(options);

    const targetRef =
      eventName === WILDCARD_EVENT
        ? "memory"
        : optionsTarget || target;

    const key =
      makeListenerKey({
        name:
          eventName,

        handler,

        options:
          finalOptions,

        targetRef,
      });

    const record =
      activeListeners.get(key);

    if (
      record &&
      isFunction(record.off)
    ) {
      return record.off();
    }

    const matchingRecords =
      findActiveRecordsByOriginalHandler(
        eventName,
        handler
      );

    if (matchingRecords.length) {
      let removed =
        false;

      for (const item of matchingRecords) {
        try {
          removed =
            Boolean(item.off?.()) ||
            removed;
        } catch (error) {
          recordError(
            "off:matched",
            error,
            eventName
          );
        }
      }

      return removed;
    }

    const domTarget =
      resolveTarget(targetRef);

    try {
      if (
        eventName !== WILDCARD_EVENT &&
        localIsBrowser() &&
        isEventTargetLike(domTarget)
      ) {
        domTarget.removeEventListener(
          eventName,
          handler,
          finalOptions
        );
      } else {
        const set =
          memoryListeners.get(eventName);

        if (set) {
          for (const item of Array.from(set)) {
            if (
              item?.handler === handler ||
              item?.wrappedHandler === handler
            ) {
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
    const eventName =
      normalizeEventName(name);

    if (
      !eventName ||
      !isFunction(handler)
    ) {
      return createNoopOff();
    }

    state.onceCount += 1;

    let dispose =
      null;

    let called =
      false;

    const cleanOptions =
      withoutOnce(options);

    const wrappedOnce = (...args) => {
      if (called) {
        return;
      }

      called =
        true;

      try {
        dispose?.();
      } catch {}

      if (eventName === WILDCARD_EVENT) {
        try {
          const result =
            handler(...args);

          if (
            result &&
            typeof result === "object" &&
            isFunction(result.catch)
          ) {
            result.catch((error) => {
              recordError(
                "once-wildcard-handler:async",
                error,
                eventName
              );
            });
          }
        } catch (error) {
          recordError(
            "once-wildcard-handler",
            error,
            eventName
          );
        }

        return;
      }

      callHandlerSafely({
        handler,

        event:
          args[0],

        eventName,

        source:
          "once-handler",
      });
    };

    dispose =
      on(
        eventName,
        wrappedOnce,
        cleanOptions
      );

    const finalOptions =
      normalizeDomOptions(cleanOptions);

    const optionsTarget =
      getOptionsTarget(cleanOptions);

    const targetRef =
      eventName === WILDCARD_EVENT
        ? "memory"
        : optionsTarget || target;

    const wrappedKey =
      makeListenerKey({
        name:
          eventName,

        handler:
          wrappedOnce,

        options:
          finalOptions,

        targetRef,
      });

    const record =
      activeListeners.get(wrappedKey);

    if (record) {
      record.once =
        true;

      record.originalHandler =
        handler;

      record.wrappedHandler =
        wrappedOnce;
    }

    pushRecentEvent(
      "once",
      eventName,
      {
        key:
          wrappedKey,
      }
    );

    return dispose;
  }

  function clear(name = "") {
    const eventName =
      normalizeEventName(name);

    let count =
      0;

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
      eventName || WILDCARD_EVENT,
      {
        count,
      }
    );

    return count;
  }

  function listenerCount(name = "") {
    const eventName =
      normalizeEventName(name);

    if (!eventName) {
      return activeListeners.size;
    }

    let count =
      0;

    for (const record of activeListeners.values()) {
      if (record.name === eventName) {
        count += 1;
      }
    }

    return count;
  }

  function names() {
    const set =
      new Set();

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
    const globalGuard =
      getGlobalDropGuard();

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

      silentDropCount:
        state.silentDropCount,

      wildcardEmitCount:
        state.wildcardEmitCount,

      lastEvent:
        state.lastEvent,

      lastEventClass:
        getEventClass(state.lastEvent),

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

      globalDropGuard: {
        suppressed:
          safeNumber(
            globalGuard.suppressed,
            0
          ),

        lastWarningAt:
          safeNumber(
            globalGuard.lastWarningAt,
            0
          ),

        lastWarningAtIso:
          globalGuard.lastWarningAt
            ? safeIsoDate(globalGuard.lastWarningAt)
            : "",
      },

      firebreaks: {
        maxSyncEmitDepth,

        rateWindowMs,

        maxEmitsPerWindow,
        maxEmitsPerEventPerWindow,

        maxLowPriorityEmitsPerWindow,
        maxLowPriorityEmitsPerEventPerWindow,

        maxCriticalEmitsPerWindow,
        maxCriticalEmitsPerEventPerWindow,

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

        currentDropRates:
          Object.fromEntries(
            dropRateMap.entries()
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
    dropRateMap.clear();

    rateWindowStartedAt =
      safeNow();

    normalEmitsInWindow =
      0;

    lowPriorityEmitsInWindow =
      0;

    criticalEmitsInWindow =
      0;

    absoluteEmitsInWindow =
      0;

    lastDropWarningAt =
      0;

    state.emitCount =
      0;

    state.onCount =
      0;

    state.offCount =
      0;

    state.onceCount =
      0;

    state.clearCount =
      0;

    state.errorCount =
      0;

    state.dropCount =
      0;

    state.silentDropCount =
      0;

    state.wildcardEmitCount =
      0;

    state.lastEvent =
      "";

    state.lastEventAt =
      0;

    state.lastError =
      null;

    state.lastDroppedEvent =
      null;

    return getSnapshot();
  }

  return {
    version:
      EVENTS_VERSION,

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
    snapshot:
      getSnapshot,

    reset,
  };
}

export {
  EVENTS_VERSION,
  WILDCARD_EVENT,
};

export default {
  EVENTS_VERSION,
  WILDCARD_EVENT,
  createEvents,
};
