/* =========================================================
   Onion SPA - App Boot State
   Archivo: src/app/boot-state.js

   Boot state simple:
   - sincroniza AppCore / Store / document
   - fases de boot normalizadas
   - eventos deduplicados por firma
   - sin setLoading derivado
   - sin CSS inline
   - snapshots seguros
========================================================= */

import {
  BOOT_PHASES as APP_BOOT_PHASES,
  APP_EVENTS,
  STORE_EVENTS,
  APP_RUNTIME_KEYS,
  redactSensitiveText,
} from "./constants.js";

/* =========================================================
   VERSION
========================================================= */

export const BOOT_STATE_VERSION = "18.0.0-clean";

/* =========================================================
   PHASES / EVENTS
========================================================= */

export const BOOT_PHASES = Object.freeze({
  IDLE: APP_BOOT_PHASES?.idle || "idle",

  PREPARING: APP_BOOT_PHASES?.preparing || "preparing",
  BOOTING: APP_BOOT_PHASES?.booting || "booting",
  SERVICES: APP_BOOT_PHASES?.services || "services",
  STORE: APP_BOOT_PHASES?.store || "store",
  I18N: APP_BOOT_PHASES?.i18n || "i18n",
  UI: APP_BOOT_PHASES?.ui || "ui",
  RESTORING: APP_BOOT_PHASES?.restoring || "restoring",
  RENDERING: APP_BOOT_PHASES?.rendering || "rendering",
  BINDING: APP_BOOT_PHASES?.binding || "binding",
  FINALIZING: APP_BOOT_PHASES?.finalizing || "finalizing",

  READY: APP_BOOT_PHASES?.ready || "ready",

  ERROR: APP_BOOT_PHASES?.error || "error",
  FATAL: APP_BOOT_PHASES?.fatal || "fatal",

  REBOOTING: APP_BOOT_PHASES?.rebooting || "rebooting",
});

export const BOOT_EVENTS = Object.freeze({
  APP_STATE: APP_EVENTS?.bootState || "app:boot:state",
  APP_START: APP_EVENTS?.bootStart || "app:boot:start",
  APP_READY: APP_EVENTS?.bootReady || "app:boot:ready",
  APP_ERROR: APP_EVENTS?.bootError || "app:boot:error",
  APP_FATAL: APP_EVENTS?.bootFatal || "app:boot:fatal",

  STORE_STATE: STORE_EVENTS?.bootState || "store:boot:state",
  STORE_START: STORE_EVENTS?.bootStart || "store:boot:start",
  STORE_READY: STORE_EVENTS?.bootReady || "store:boot:ready",
  STORE_ERROR: STORE_EVENTS?.bootError || "store:boot:error",

  BOOT_STATE: "boot:state",
  BOOT_START: "boot:start",
  BOOT_READY: "boot:ready",
  BOOT_ERROR: "boot:error",
  BOOT_FATAL: "boot:fatal",
  REBOOT: "boot:reboot",

  DOCUMENT_STATE: "app:boot:document-state",
  DEBUG_READY: "app:boot-state:debug-ready",
});

const BOOTING_PHASES = Object.freeze([
  BOOT_PHASES.PREPARING,
  BOOT_PHASES.BOOTING,
  BOOT_PHASES.SERVICES,
  BOOT_PHASES.STORE,
  BOOT_PHASES.I18N,
  BOOT_PHASES.UI,
  BOOT_PHASES.RESTORING,
  BOOT_PHASES.RENDERING,
  BOOT_PHASES.BINDING,
  BOOT_PHASES.FINALIZING,
  BOOT_PHASES.REBOOTING,
]);

const ERROR_PHASES = Object.freeze([
  BOOT_PHASES.ERROR,
  BOOT_PHASES.FATAL,
]);

const TERMINAL_PHASES = Object.freeze([
  BOOT_PHASES.READY,
  BOOT_PHASES.ERROR,
  BOOT_PHASES.FATAL,
]);

const DOCUMENT_CLASSES = Object.freeze([
  "app-booting",
  "app-loading",
  "app-ready",
  "app-error",
  "app-fatal",
  "is-booting",
  "is-loading",
  "is-ready",
  "is-error",
  "is-fatal",
  "loading",
  "ready",
  "booting",
  "fatal",
]);

const SENSITIVE_QUERY_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "activation_token",
  "activate_token",
  "resetToken",
  "reset_token",
  "passwordResetToken",
  "password_reset_token",
  "confirmToken",
  "confirm_token",
  "code",
  "t",
  "otp",
  "totp",
  "access_token",
  "refresh_token",
  "id_token",
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
  "authorization",
  "auth",
  "jwt",
  "session",
  "sid",
]);

const TOKEN_ROUTE_PATHS = Object.freeze([
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/password-reset/confirm",
  "/password-reset-confirm",
]);

const SNAPSHOT_DEPTH = 5;
const SNAPSHOT_ARRAY_LIMIT = 80;
const SNAPSHOT_KEY_LIMIT = 120;

/* =========================================================
   INTERNAL STATE
========================================================= */

let appSignatures = new WeakMap();
let storeSignatures = new WeakMap();
let documentSignatures = new WeakMap();

let fallbackAppSignature = "";
let fallbackStoreSignature = "";
let fallbackDocumentSignature = "";
let debugBridgeReady = false;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isObjectLike(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) return true;
    if (["false", "0", "no", "off"].includes(key)) return false;
  }

  return Boolean(fallback);
}

function safeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function hasOwn(value, key) {
  try {
    return Object.prototype.hasOwnProperty.call(value, key);
  } catch {
    return false;
  }
}

function nowPayload() {
  let ms = 0;

  try {
    ms = Date.now();
  } catch {}

  let iso = "";

  try {
    iso = new Date(ms).toISOString();
  } catch {}

  return { ms, iso };
}

function call(fn, thisArg = null, args = []) {
  try {
    if (isFunction(fn)) return fn.apply(thisArg, Array.isArray(args) ? args : []);
  } catch {}

  return undefined;
}

function assign(target, payload) {
  try {
    if (target && typeof target === "object") {
      Object.assign(target, payload);
      return true;
    }
  } catch {}

  return false;
}

function canDefine(value) {
  try {
    return isObjectLike(value) && Object.isExtensible(value);
  } catch {
    return false;
  }
}

function defineHidden(target, key, value) {
  if (!target || !key || !canDefine(target)) return false;

  try {
    Object.defineProperty(target, key, {
      value,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {}

  return false;
}

function getMutableState(target) {
  if (!target) return {};

  try {
    if (target.state && typeof target.state === "object") return target.state;
  } catch {}

  try {
    if (canDefine(target)) {
      target.state = {};
      return target.state;
    }
  } catch {}

  return {};
}

function getStoreState(Store) {
  const direct = safeObject(Store?.state);
  const getter = safeObject(call(Store?.getState, Store));

  return {
    ...direct,
    ...getter,
  };
}

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value = "") {
  let output = safeText(value, "");

  if (!output) return "";

  try {
    output = redactSensitiveText(output);
  } catch {}

  for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const routePath of TOKEN_ROUTE_PATHS) {
    try {
      output = output.replace(
        new RegExp(`(${escapeRegExp(routePath)}\\/)([^/?#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi, "$1$2***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function normalizeError(error = null) {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      name: "BootError",
      message: redact(error),
      code: "BOOT_ERROR",
      status: null,
      url: "",
      stack: "",
    };
  }

  const source = error?.error || error?.reason || error;
  const object = typeof source === "object" && source ? source : {};

  const message = safeText(
    object.message ||
      object.statusText ||
      object.detail ||
      object.error ||
      object.reason?.message ||
      object.reason ||
      error?.message ||
      "Error durante el boot de la aplicación.",
    "Error durante el boot de la aplicación."
  );

  return {
    name: safeText(object.name || object.constructor?.name, "BootError"),
    message: redact(message),
    code: redact(
      safeText(
        object.code ||
          object.data?.code ||
          object.response?.data?.code ||
          object.statusCode ||
          object.status ||
          "BOOT_ERROR",
        "BOOT_ERROR"
      )
    ),
    status: object.status || object.statusCode || object.response?.status || null,
    url: redact(
      safeText(
        object.url ||
          object.href ||
          object.filename ||
          object.target?.src ||
          object.target?.href ||
          "",
        ""
      )
    ),
    stack: object.stack ? redact(safeText(object.stack, "")) : "",
  };
}

function isDomNodeLike(value) {
  if (!value || typeof value !== "object") return false;

  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {}

  try {
    return Boolean(value.nodeType && value.nodeName);
  } catch {}

  return false;
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (depth > SNAPSHOT_DEPTH) return "[MaxDepth]";

  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) return normalizeError(value);

  if (isDomNodeLike(value)) {
    return {
      node: safeText(value.nodeName, "Node"),
      id: safeText(value.id, ""),
      className: safeText(value.className?.baseVal || value.className, ""),
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, SNAPSHOT_ARRAY_LIMIT)
      .map((item) => sanitize(item, depth + 1, seen));
  }

  if (value instanceof Map) {
    return { type: "Map", size: value.size };
  }

  if (value instanceof Set) {
    return { type: "Set", size: value.size };
  }

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, SNAPSHOT_KEY_LIMIT)) {
      if (/token|secret|password|authorization|bearer|credential|jwt|otp|mfa|2fa|refresh|access/i.test(key)) {
        output[key] = item ? "***" : item;
        continue;
      }

      output[key] = sanitize(item, depth + 1, seen);
    }

    return output;
  }

  return redact(String(value));
}

/* =========================================================
   EVENT EMIT
========================================================= */

function createCustomEvent(name, detail = {}) {
  if (!isBrowser()) return null;

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(name, { detail });
    }
  } catch {}

  try {
    const event = document.createEvent("CustomEvent");
    event.initCustomEvent(name, false, false, detail);
    return event;
  } catch {
    return null;
  }
}

function emitWindow(eventName, payload = {}) {
  if (!isBrowser() || !eventName) return false;

  try {
    const event = createCustomEvent(eventName, sanitize(payload));
    if (!event) return false;

    window.dispatchEvent(event);
    return true;
  } catch {}

  return false;
}

function emitCoreEvent(AppCore, eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = sanitize(payload);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(name, detail);
      busEmitted = true;
    }
  } catch {}

  if (options.window === true || (!busAvailable && isBrowser())) {
    return emitWindow(name, detail) || busEmitted;
  }

  return busEmitted;
}

function emitStoreEvent(Store, eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!Store || !name) return false;

  const detail = sanitize(payload);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(Store?.events?.emit)) {
      busAvailable = true;
      Store.events.emit(name, detail);
      busEmitted = true;
    }
  } catch {}

  if (options.window === true || (!busAvailable && isBrowser())) {
    return emitWindow(name, detail) || busEmitted;
  }

  return busEmitted;
}

/* =========================================================
   SIGNATURES
========================================================= */

function getSignature(map, key, fallback = "") {
  try {
    if (isObjectLike(key)) return map.get(key) || "";
  } catch {}

  return fallback;
}

function setSignature(map, key, value, type = "app") {
  try {
    if (isObjectLike(key)) {
      map.set(key, value);
      return;
    }
  } catch {}

  if (type === "store") {
    fallbackStoreSignature = value;
    return;
  }

  if (type === "document") {
    fallbackDocumentSignature = value;
    return;
  }

  fallbackAppSignature = value;
}

function comparableSignature(payload = {}) {
  const data = {
    booted: Boolean(payload.booted),
    booting: Boolean(payload.booting),
    ready: Boolean(payload.ready),
    loading: Boolean(payload.loading),
    fatal: Boolean(payload.fatal || payload.appFatal),
    bootPhase: safeText(payload.bootPhase, ""),
    bootCycleId: safeInt(payload.bootCycleId, 0),
    lastBootReason: safeText(payload.lastBootReason, ""),
    lastBootErrorMessage: safeText(payload.lastBootError?.message, ""),
    lastBootErrorCode: safeText(payload.lastBootError?.code, ""),
  };

  try {
    return JSON.stringify(data);
  } catch {
    return String(Date.now());
  }
}

/* =========================================================
   PHASE NORMALIZATION
========================================================= */

export function normalizeBootPhase(value = "") {
  const phase = safeText(value, "").toLowerCase();

  if (!phase) return "";

  const aliases = {
    idle: BOOT_PHASES.IDLE,

    start: BOOT_PHASES.BOOTING,
    starting: BOOT_PHASES.BOOTING,
    boot: BOOT_PHASES.BOOTING,
    booting: BOOT_PHASES.BOOTING,

    init: BOOT_PHASES.PREPARING,
    initializing: BOOT_PHASES.PREPARING,
    prepare: BOOT_PHASES.PREPARING,
    preparing: BOOT_PHASES.PREPARING,

    service: BOOT_PHASES.SERVICES,
    services: BOOT_PHASES.SERVICES,

    store: BOOT_PHASES.STORE,

    lang: BOOT_PHASES.I18N,
    language: BOOT_PHASES.I18N,
    i18n: BOOT_PHASES.I18N,

    ui: BOOT_PHASES.UI,

    auth: BOOT_PHASES.RESTORING,
    session: BOOT_PHASES.RESTORING,
    restore: BOOT_PHASES.RESTORING,
    restoring: BOOT_PHASES.RESTORING,

    render: BOOT_PHASES.RENDERING,
    rendering: BOOT_PHASES.RENDERING,

    bind: BOOT_PHASES.BINDING,
    binding: BOOT_PHASES.BINDING,

    finalize: BOOT_PHASES.FINALIZING,
    finalizing: BOOT_PHASES.FINALIZING,

    complete: BOOT_PHASES.READY,
    completed: BOOT_PHASES.READY,
    done: BOOT_PHASES.READY,
    success: BOOT_PHASES.READY,
    ready: BOOT_PHASES.READY,

    failure: BOOT_PHASES.ERROR,
    failed: BOOT_PHASES.ERROR,
    error: BOOT_PHASES.ERROR,

    fatal: BOOT_PHASES.FATAL,

    reboot: BOOT_PHASES.REBOOTING,
    rebooting: BOOT_PHASES.REBOOTING,
  };

  return aliases[phase] || "";
}

function isBootingPhase(phase = "") {
  return BOOTING_PHASES.includes(normalizeBootPhase(phase));
}

function isReadyPhase(phase = "") {
  return normalizeBootPhase(phase) === BOOT_PHASES.READY;
}

function isErrorPhase(phase = "") {
  return ERROR_PHASES.includes(normalizeBootPhase(phase));
}

function isTerminalPhase(phase = "") {
  return TERMINAL_PHASES.includes(normalizeBootPhase(phase));
}

function inferPhase({ booted = false, booting = false, ready = false, loading = false, error = null, fatal = false } = {}) {
  if (fatal) return BOOT_PHASES.FATAL;
  if (error) return BOOT_PHASES.ERROR;
  if (booting || loading) return BOOT_PHASES.BOOTING;
  if (booted || ready) return BOOT_PHASES.READY;
  return BOOT_PHASES.IDLE;
}

/* =========================================================
   PREVIOUS STATE
========================================================= */

function readAppBootState(AppCore) {
  const state = safeObject(AppCore?.state);

  return {
    booted: Boolean(state.booted),
    booting: Boolean(state.booting),
    ready: Boolean(state.ready || state.appReady),
    loading: Boolean(state.loading),
    appReady: Boolean(state.appReady || state.ready),
    appBooting: Boolean(state.appBooting || state.booting),
    appFatal: Boolean(state.appFatal || state.fatal),
    fatal: Boolean(state.fatal || state.appFatal),

    bootPhase: normalizeBootPhase(state.bootPhase) || BOOT_PHASES.IDLE,
    bootCycleId: safeInt(state.bootCycleId, 0),

    lastBootReason: safeText(state.lastBootReason, ""),
    lastBootError: state.lastBootError || null,

    bootStartedAt: safeText(state.bootStartedAt, ""),
    bootReadyAt: safeText(state.bootReadyAt, ""),
    bootErrorAt: safeText(state.bootErrorAt, ""),
    bootFatalAt: safeText(state.bootFatalAt, ""),
  };
}

function readStoreBootState(Store) {
  const state = getStoreState(Store);

  return {
    ready: Boolean(state.ready),
    booted: Boolean(state.booted),
    booting: Boolean(state.booting),
    loading: Boolean(state.loading),
    fatal: Boolean(state.fatal),

    bootPhase: normalizeBootPhase(state.bootPhase) || BOOT_PHASES.IDLE,
    bootCycleId: safeInt(state.bootCycleId, 0),

    lastBootReason: safeText(state.lastBootReason, ""),
    lastBootError: state.lastBootError || null,

    bootStartedAt: safeText(state.bootStartedAt, ""),
    bootReadyAt: safeText(state.bootReadyAt, ""),
    bootErrorAt: safeText(state.bootErrorAt, ""),
    bootFatalAt: safeText(state.bootFatalAt, ""),
  };
}

/* =========================================================
   PAYLOAD NORMALIZATION
========================================================= */

function normalizeCycleId(input = {}, previous = {}) {
  if (hasOwn(input, "cycleId")) return safeInt(input.cycleId, 0);
  if (hasOwn(input, "bootCycleId")) return safeInt(input.bootCycleId, 0);
  return safeInt(previous.bootCycleId, 0);
}

function normalizeReason(input = {}, phase = BOOT_PHASES.IDLE) {
  return safeText(
    input.reason ||
      input.source ||
      input.action ||
      input.lastBootReason,
    phase || BOOT_PHASES.IDLE
  );
}

function buildTiming({ phase, input = {}, previous = {}, clock = nowPayload() } = {}) {
  const reset = input.resetTiming === true;
  const old = reset ? {} : previous;

  const booting = isBootingPhase(phase);
  const ready = phase === BOOT_PHASES.READY;
  const error = phase === BOOT_PHASES.ERROR;
  const fatal = phase === BOOT_PHASES.FATAL;

  return {
    bootStartedAt:
      safeText(input.bootStartedAt, "") ||
      (booting ? safeText(old.bootStartedAt, "") || clock.iso : safeText(old.bootStartedAt, "")),

    bootReadyAt:
      safeText(input.bootReadyAt, "") ||
      (ready ? clock.iso : reset ? "" : safeText(old.bootReadyAt, "")),

    bootErrorAt:
      safeText(input.bootErrorAt, "") ||
      (error ? clock.iso : reset || ready ? "" : safeText(old.bootErrorAt, "")),

    bootFatalAt:
      safeText(input.bootFatalAt, "") ||
      (fatal ? clock.iso : reset || ready ? "" : safeText(old.bootFatalAt, "")),
  };
}

function normalizeBootPayload(inputValue = {}, previous = {}, mode = "app") {
  const input = safeObject(inputValue);

  const requestedPhase = normalizeBootPhase(input.phase || input.bootPhase || "");
  const explicitFatal = input.fatal === true || requestedPhase === BOOT_PHASES.FATAL;
  const explicitError = Boolean(input.error) || requestedPhase === BOOT_PHASES.ERROR || explicitFatal;

  let booted = hasOwn(input, "booted") ? safeBool(input.booted) : Boolean(previous.booted);
  let ready = hasOwn(input, "ready") ? safeBool(input.ready) : Boolean(previous.ready || booted);
  let booting = hasOwn(input, "booting") ? safeBool(input.booting) : Boolean(previous.booting);
  let loading = hasOwn(input, "loading") ? safeBool(input.loading) : Boolean(previous.loading || booting);

  let phase =
    requestedPhase ||
    inferPhase({
      booted,
      ready,
      booting,
      loading,
      error: explicitError,
      fatal: explicitFatal,
    });

  if (phase === BOOT_PHASES.FATAL || explicitFatal) {
    phase = BOOT_PHASES.FATAL;
    booted = false;
    ready = false;
    booting = false;
    loading = false;
  } else if (phase === BOOT_PHASES.ERROR || explicitError) {
    phase = BOOT_PHASES.ERROR;
    booted = false;
    ready = false;
    booting = false;
    loading = false;
  } else if (phase === BOOT_PHASES.READY) {
    booted = true;
    ready = true;
    booting = false;
    loading = false;
  } else if (isBootingPhase(phase)) {
    booted = false;
    ready = false;
    booting = true;
    loading = true;
  } else {
    phase = BOOT_PHASES.IDLE;
    booted = false;
    ready = false;
    booting = false;
    loading = false;
  }

  const clock = nowPayload();

  const base = {
    booted,
    booting,
    ready,
    loading,

    fatal: phase === BOOT_PHASES.FATAL,

    bootPhase: phase,
    bootCycleId: normalizeCycleId(input, previous),

    bootUpdatedAt: clock.iso,
    bootUpdatedAtMs: clock.ms,

    ...buildTiming({
      phase,
      input,
      previous,
      clock,
    }),

    lastBootReason: normalizeReason(input, phase),
    lastBootError: isErrorPhase(phase) ? normalizeError(input.error || previous.lastBootError) : null,
  };

  if (mode === "app") {
    return {
      ...base,
      appReady: base.ready,
      appBooting: base.booting,
      appFatal: base.fatal,
    };
  }

  return base;
}

/* =========================================================
   DOCUMENT SYNC
========================================================= */

function setDataset(el, key, value) {
  try {
    if (!el || !key) return false;

    if (value === null || value === undefined || value === "") {
      delete el.dataset[key];
      return true;
    }

    el.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function removeClasses(el, classNames = []) {
  try {
    if (!el) return false;
    el.classList.remove(...classNames);
    return true;
  } catch {
    return false;
  }
}

function toggleClass(el, className, enabled) {
  try {
    if (!el || !className) return false;
    el.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function getDocumentState(payload = {}) {
  const phase = normalizeBootPhase(payload.bootPhase) || BOOT_PHASES.IDLE;

  const fatal = phase === BOOT_PHASES.FATAL || Boolean(payload.fatal || payload.appFatal);
  const error = fatal || phase === BOOT_PHASES.ERROR || Boolean(payload.lastBootError);
  const booting = !error && (isBootingPhase(phase) || Boolean(payload.booting));
  const loading = !error && (Boolean(payload.loading) || booting);
  const ready = !error && !booting && (isReadyPhase(phase) || Boolean(payload.ready || payload.appReady || payload.booted));

  const appState = booting
    ? "booting"
    : fatal
      ? "fatal"
      : error
        ? "error"
        : ready
          ? "ready"
          : "idle";

  return {
    phase,
    booting,
    loading,
    ready,
    error,
    fatal,
    appState,
    shellState: appState,
  };
}

export function syncDocumentBootState(payload = {}) {
  if (!isBrowser()) return false;

  const state = getDocumentState(payload);
  const roots = [document.documentElement, document.body].filter(Boolean);

  for (const root of roots) {
    removeClasses(root, DOCUMENT_CLASSES);

    toggleClass(root, "app-booting", state.booting);
    toggleClass(root, "is-booting", state.booting);

    toggleClass(root, "app-loading", state.loading);
    toggleClass(root, "is-loading", state.loading);
    toggleClass(root, "loading", state.loading);

    toggleClass(root, "app-ready", state.ready);
    toggleClass(root, "is-ready", state.ready);

    toggleClass(root, "app-error", state.error && !state.fatal);
    toggleClass(root, "is-error", state.error && !state.fatal);

    toggleClass(root, "app-fatal", state.fatal);
    toggleClass(root, "is-fatal", state.fatal);

    setDataset(root, "appLoading", state.loading ? "true" : "false");
    setDataset(root, "appReady", state.ready ? "true" : "false");
    setDataset(root, "appBooting", state.booting ? "true" : "false");
    setDataset(root, "bootPhase", state.phase);
    setDataset(root, "appState", state.appState);
    setDataset(root, "shellState", state.shellState);
    setDataset(root, "bootError", state.error || state.fatal ? "true" : "false");
  }

  return true;
}

function maybeEmitDocumentState(AppCore, payload = {}, options = {}) {
  const state = getDocumentState(payload);

  const signature = comparableSignature({
    booted: state.ready,
    booting: state.booting,
    ready: state.ready,
    loading: state.loading,
    fatal: state.fatal,
    bootPhase: state.phase,
  });

  const previous = getSignature(documentSignatures, AppCore, fallbackDocumentSignature);
  const changed = signature !== previous;

  setSignature(documentSignatures, AppCore, signature, "document");

  if (changed || options.forceEmit === true) {
    emitCoreEvent(AppCore, BOOT_EVENTS.DOCUMENT_STATE, {
      version: BOOT_STATE_VERSION,
      ...state,
      changed,
    });
  }

  return changed;
}

/* =========================================================
   STATE WRITE
========================================================= */

function callStateMethod(target, methodName, payload, options = {}) {
  if (!target || !isFunction(target?.[methodName])) return false;

  try {
    target[methodName](payload, {
      source: "app:boot-state",
      emit: false,
      emitState: false,
      emitDerived: false,
      silent: true,
      ...safeObject(options.stateOptions),
    });

    return true;
  } catch {}

  try {
    target[methodName](payload);
    return true;
  } catch {}

  return false;
}

function writeAppState(AppCore, payload = {}, options = {}) {
  const state = getMutableState(AppCore);
  assign(state, payload);

  if (options.skipSetState !== true) {
    const ok = callStateMethod(AppCore, "setState", payload, options);
    if (!ok && options.skipPatchState !== true) {
      callStateMethod(AppCore, "patchState", payload, options);
    }
  } else if (options.skipPatchState !== true) {
    callStateMethod(AppCore, "patchState", payload, options);
  }

  syncDocumentBootState(payload);
  maybeEmitDocumentState(AppCore, payload, options);

  return payload;
}

function callStoreAction(Store, methodName, args = []) {
  const actions = safeObject(Store?.actions);

  if (!isFunction(actions?.[methodName])) return false;

  try {
    actions[methodName](...(Array.isArray(args) ? args : []));
    return true;
  } catch {
    return false;
  }
}

function writeStoreState(Store, payload = {}, options = {}) {
  if (!Store) return payload;

  const state = getMutableState(Store);
  assign(state, payload);

  let ok = false;

  if (options.skipSetState !== true) {
    ok = callStateMethod(Store, "setState", payload, options);
  }

  if (!ok && options.skipPatchState !== true) {
    ok = callStateMethod(Store, "patchState", payload, options);
  }

  if (!ok) ok = callStateMethod(Store, "set", payload, options);
  if (!ok) callStateMethod(Store, "patch", payload, options);

  callStoreAction(Store, "markReady", [payload.ready, payload]);
  callStoreAction(Store, "markBooted", [payload.booted, payload]);
  callStoreAction(Store, "markBooting", [payload.booting, payload]);
  callStoreAction(Store, "setLoading", [payload.loading, payload]);
  callStoreAction(Store, "markLoading", [payload.loading, payload]);

  return payload;
}

/* =========================================================
   EVENT PAYLOADS
========================================================= */

function buildEventPayload(payload = {}, previous = {}, changed = false) {
  return {
    version: BOOT_STATE_VERSION,
    ...payload,
    changed: Boolean(changed),
    previous: sanitize(previous),
  };
}

function shouldEmit(eventPayload = {}, options = {}) {
  return Boolean(
    eventPayload.changed === true ||
      options.forceEmit === true ||
      options.emitUnchanged === true
  );
}

function emitAppBootEvents(AppCore, eventPayload = {}, options = {}) {
  if (!shouldEmit(eventPayload, options)) return false;

  emitCoreEvent(AppCore, BOOT_EVENTS.APP_STATE, eventPayload);

  if (isBootingPhase(eventPayload.bootPhase)) {
    emitCoreEvent(AppCore, BOOT_EVENTS.APP_START, eventPayload);
  }

  if (eventPayload.bootPhase === BOOT_PHASES.READY) {
    emitCoreEvent(AppCore, BOOT_EVENTS.APP_READY, eventPayload);
  }

  if (eventPayload.bootPhase === BOOT_PHASES.ERROR) {
    emitCoreEvent(AppCore, BOOT_EVENTS.APP_ERROR, eventPayload);
  }

  if (eventPayload.bootPhase === BOOT_PHASES.FATAL) {
    emitCoreEvent(AppCore, BOOT_EVENTS.APP_FATAL, eventPayload);
  }

  return true;
}

function emitStoreBootEvents(Store, eventPayload = {}, options = {}) {
  if (!Store || !shouldEmit(eventPayload, options)) return false;

  emitStoreEvent(Store, BOOT_EVENTS.STORE_STATE, eventPayload);

  if (isBootingPhase(eventPayload.bootPhase)) {
    emitStoreEvent(Store, BOOT_EVENTS.STORE_START, eventPayload);
  }

  if (eventPayload.bootPhase === BOOT_PHASES.READY) {
    emitStoreEvent(Store, BOOT_EVENTS.STORE_READY, eventPayload);
  }

  if (isErrorPhase(eventPayload.bootPhase)) {
    emitStoreEvent(Store, BOOT_EVENTS.STORE_ERROR, eventPayload);
  }

  return true;
}

function emitCombinedBootEvents(AppCore, snapshot, phase = BOOT_PHASES.IDLE) {
  emitCoreEvent(AppCore, BOOT_EVENTS.BOOT_STATE, snapshot);

  if (isBootingPhase(phase)) emitCoreEvent(AppCore, BOOT_EVENTS.BOOT_START, snapshot);
  if (phase === BOOT_PHASES.READY) emitCoreEvent(AppCore, BOOT_EVENTS.BOOT_READY, snapshot);
  if (phase === BOOT_PHASES.ERROR) emitCoreEvent(AppCore, BOOT_EVENTS.BOOT_ERROR, snapshot);
  if (phase === BOOT_PHASES.FATAL) emitCoreEvent(AppCore, BOOT_EVENTS.BOOT_FATAL, snapshot);
  if (phase === BOOT_PHASES.REBOOTING) emitCoreEvent(AppCore, BOOT_EVENTS.REBOOT, snapshot);

  return true;
}

/* =========================================================
   APP / STORE MARKERS
========================================================= */

export function markAppBootState(AppCore, options = {}) {
  const previous = readAppBootState(AppCore);
  const payload = normalizeBootPayload(options, previous, "app");

  const signature = comparableSignature(payload);
  const previousSignature = getSignature(appSignatures, AppCore, fallbackAppSignature);
  const changed = signature !== previousSignature;

  setSignature(appSignatures, AppCore, signature, "app");

  writeAppState(AppCore, payload, options);

  const eventPayload = buildEventPayload(payload, previous, changed);
  emitAppBootEvents(AppCore, eventPayload, options);

  return eventPayload;
}

export function markStoreBootState(Store, options = {}) {
  const previous = readStoreBootState(Store);
  const payload = normalizeBootPayload(options, previous, "store");

  const signature = comparableSignature(payload);
  const previousSignature = getSignature(storeSignatures, Store, fallbackStoreSignature);
  const changed = signature !== previousSignature;

  setSignature(storeSignatures, Store, signature, "store");

  writeStoreState(Store, payload, options);

  const eventPayload = buildEventPayload(payload, previous, changed);
  emitStoreBootEvents(Store, eventPayload, options);

  return eventPayload;
}

/* =========================================================
   COMBINED MARKERS
========================================================= */

export function markBootStart(AppCore, Store, options = {}) {
  const input = safeObject(options);

  const phase = normalizeBootPhase(input.phase || input.bootPhase) || BOOT_PHASES.BOOTING;
  const finalPhase = isBootingPhase(phase) ? phase : BOOT_PHASES.BOOTING;

  const payload = {
    ...input,
    booted: false,
    booting: true,
    ready: false,
    loading: true,
    phase: finalPhase,
    error: null,
    fatal: false,
    reason: safeText(input.reason, "boot-start"),
    forceEmit: input.forceEmit !== false,
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  const snapshot = getBootStateSnapshot(AppCore, Store);
  emitCombinedBootEvents(AppCore, snapshot, finalPhase);

  return snapshot;
}

export function markBootReady(AppCore, Store, options = {}) {
  const input = safeObject(options);

  const payload = {
    ...input,
    booted: true,
    booting: false,
    ready: true,
    loading: false,
    phase: BOOT_PHASES.READY,
    fatal: false,
    error: null,
    reason: safeText(input.reason, "boot-ready"),
    forceEmit: input.forceEmit !== false,
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  const snapshot = getBootStateSnapshot(AppCore, Store);
  emitCombinedBootEvents(AppCore, snapshot, BOOT_PHASES.READY);

  return snapshot;
}

export function markBootError(AppCore, Store, error = null, options = {}) {
  const input = safeObject(options);
  const fatal = input.fatal === true;
  const phase = fatal ? BOOT_PHASES.FATAL : BOOT_PHASES.ERROR;

  const payload = {
    ...input,
    booted: false,
    booting: false,
    ready: false,
    loading: false,
    phase,
    error,
    fatal,
    reason: safeText(input.reason, fatal ? "boot-fatal" : "boot-error"),
    forceEmit: input.forceEmit !== false,
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  const snapshot = getBootStateSnapshot(AppCore, Store);
  emitCombinedBootEvents(AppCore, snapshot, phase);

  return snapshot;
}

export function markBootFatal(AppCore, Store, error = null, options = {}) {
  return markBootError(AppCore, Store, error, {
    ...safeObject(options),
    fatal: true,
    reason: safeText(options?.reason, "boot-fatal"),
  });
}

export function markRebootState(AppCore, Store, options = {}) {
  const input = safeObject(options);
  const rebooting = input.booting === true || input.loading === true;
  const phase = rebooting ? BOOT_PHASES.REBOOTING : BOOT_PHASES.IDLE;

  const payload = {
    ...input,
    booted: false,
    booting: rebooting,
    ready: false,
    loading: rebooting,
    phase,
    lastBootError: null,
    error: null,
    fatal: false,
    resetTiming: true,
    reason: safeText(input.reason, "reboot-reset"),
    forceEmit: input.forceEmit !== false,
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  const snapshot = getBootStateSnapshot(AppCore, Store);

  emitCoreEvent(AppCore, BOOT_EVENTS.BOOT_STATE, snapshot);
  emitCoreEvent(AppCore, BOOT_EVENTS.REBOOT, snapshot);

  return snapshot;
}

/* =========================================================
   READ HELPERS
========================================================= */

export function isAppBooting(AppCore) {
  const state = safeObject(AppCore?.state);

  return Boolean(
    state.booting ||
      state.appBooting ||
      isBootingPhase(state.bootPhase)
  );
}

export function isAppReady(AppCore) {
  const state = safeObject(AppCore?.state);
  const phase = normalizeBootPhase(state.bootPhase);

  return Boolean(
    (state.ready || state.appReady || state.booted || phase === BOOT_PHASES.READY) &&
      !state.lastBootError &&
      phase !== BOOT_PHASES.ERROR &&
      phase !== BOOT_PHASES.FATAL &&
      !state.appFatal &&
      !state.fatal
  );
}

export function isAppLoading(AppCore) {
  const state = safeObject(AppCore?.state);

  return Boolean(
    state.loading ||
      state.booting ||
      state.appBooting ||
      isBootingPhase(state.bootPhase)
  );
}

export function hasBootError(AppCore) {
  const state = safeObject(AppCore?.state);
  const phase = normalizeBootPhase(state.bootPhase);

  return Boolean(
    state.lastBootError ||
      phase === BOOT_PHASES.ERROR ||
      phase === BOOT_PHASES.FATAL ||
      state.appFatal ||
      state.fatal
  );
}

export function resetBootStateSignatures() {
  appSignatures = new WeakMap();
  storeSignatures = new WeakMap();
  documentSignatures = new WeakMap();

  fallbackAppSignature = "";
  fallbackStoreSignature = "";
  fallbackDocumentSignature = "";

  return true;
}

/* =========================================================
   SNAPSHOTS
========================================================= */

export function getAppBootStateSnapshot(AppCore) {
  const state = safeObject(AppCore?.state);
  const phase = normalizeBootPhase(state.bootPhase) || BOOT_PHASES.IDLE;

  return sanitize({
    version: BOOT_STATE_VERSION,

    hasCore: Boolean(AppCore),
    hasState: isObject(AppCore?.state),
    hasSetState: isFunction(AppCore?.setState),
    hasPatchState: isFunction(AppCore?.patchState),

    booted: Boolean(state.booted),
    booting: Boolean(state.booting),
    ready: Boolean(state.ready || state.appReady),
    loading: Boolean(state.loading),

    appReady: Boolean(state.appReady || state.ready),
    appBooting: Boolean(state.appBooting || state.booting),
    appFatal: Boolean(state.appFatal || state.fatal),

    phase,
    isBootingPhase: isBootingPhase(phase),
    isTerminalPhase: isTerminalPhase(phase),

    cycleId: safeInt(state.bootCycleId, 0),

    updatedAt: safeText(state.bootUpdatedAt, ""),
    updatedAtMs: safeInt(state.bootUpdatedAtMs, 0),

    startedAt: safeText(state.bootStartedAt, ""),
    readyAt: safeText(state.bootReadyAt, ""),
    errorAt: safeText(state.bootErrorAt, ""),
    fatalAt: safeText(state.bootFatalAt, ""),

    reason: safeText(state.lastBootReason, ""),
    hasError: Boolean(state.lastBootError),
    error: normalizeError(state.lastBootError),
  });
}

export function getStoreBootStateSnapshot(Store) {
  const state = getStoreState(Store);
  const phase = normalizeBootPhase(state.bootPhase) || BOOT_PHASES.IDLE;

  return sanitize({
    version: BOOT_STATE_VERSION,

    hasStore: Boolean(Store),
    hasState: isObject(Store?.state),
    hasActions: Boolean(Store?.actions),
    hasEvents: Boolean(Store?.events),

    hasSetState: isFunction(Store?.setState),
    hasPatchState: isFunction(Store?.patchState),

    ready: Boolean(state.ready),
    booted: Boolean(state.booted),
    booting: Boolean(state.booting),
    loading: Boolean(state.loading),
    fatal: Boolean(state.fatal),

    phase,
    isBootingPhase: isBootingPhase(phase),
    isTerminalPhase: isTerminalPhase(phase),

    cycleId: safeInt(state.bootCycleId, 0),

    updatedAt: safeText(state.bootUpdatedAt, ""),
    updatedAtMs: safeInt(state.bootUpdatedAtMs, 0),

    startedAt: safeText(state.bootStartedAt, ""),
    readyAt: safeText(state.bootReadyAt, ""),
    errorAt: safeText(state.bootErrorAt, ""),
    fatalAt: safeText(state.bootFatalAt, ""),

    reason: safeText(state.lastBootReason, ""),
    hasError: Boolean(state.lastBootError),
    error: normalizeError(state.lastBootError),
  });
}

export function getDocumentBootStateSnapshot() {
  if (!isBrowser()) {
    return {
      version: BOOT_STATE_VERSION,
      hasDocument: false,
    };
  }

  const read = (el) => {
    if (!el) return { exists: false };

    let classes = [];

    try {
      classes = Array.from(el.classList || []);
    } catch {}

    return {
      exists: true,
      appLoading: safeText(el.dataset?.appLoading, ""),
      appReady: safeText(el.dataset?.appReady, ""),
      appBooting: safeText(el.dataset?.appBooting, ""),
      appState: safeText(el.dataset?.appState, ""),
      bootPhase: safeText(el.dataset?.bootPhase, ""),
      shellState: safeText(el.dataset?.shellState, ""),
      bootError: safeText(el.dataset?.bootError, ""),
      classes,
      className: safeText(el.className, ""),
    };
  };

  return sanitize({
    version: BOOT_STATE_VERSION,
    hasDocument: true,
    html: read(document.documentElement),
    body: read(document.body),
  });
}

export function getBootStateSnapshot(AppCore, Store) {
  const app = getAppBootStateSnapshot(AppCore);
  const store = getStoreBootStateSnapshot(Store);
  const documentState = getDocumentBootStateSnapshot();

  const phase =
    app.phase === BOOT_PHASES.FATAL || store.phase === BOOT_PHASES.FATAL
      ? BOOT_PHASES.FATAL
      : app.phase === BOOT_PHASES.ERROR || store.phase === BOOT_PHASES.ERROR
        ? BOOT_PHASES.ERROR
        : isBootingPhase(app.phase) || isBootingPhase(store.phase)
          ? BOOT_PHASES.BOOTING
          : app.phase === BOOT_PHASES.READY && (store.phase === BOOT_PHASES.READY || !store.hasStore)
            ? BOOT_PHASES.READY
            : BOOT_PHASES.IDLE;

  return sanitize({
    version: BOOT_STATE_VERSION,

    app,
    store,
    document: documentState,

    computed: {
      ready: Boolean(app.ready && (store.ready || !store.hasStore) && phase === BOOT_PHASES.READY),
      booted: Boolean(app.booted && (store.booted || !store.hasStore) && phase === BOOT_PHASES.READY),
      booting: Boolean(app.booting || store.booting || isBootingPhase(phase)),
      loading: Boolean(app.loading || store.loading || isBootingPhase(phase)),
      hasError: Boolean(app.hasError || store.hasError || phase === BOOT_PHASES.ERROR || phase === BOOT_PHASES.FATAL),
      fatal: Boolean(app.appFatal || store.fatal || phase === BOOT_PHASES.FATAL),
      phase,
      cycleId: Math.max(safeInt(app.cycleId, 0), safeInt(store.cycleId, 0)),
    },
  });
}

/* =========================================================
   DEBUG API
========================================================= */

export function exposeBootStateDebugApi(AppCore = null, Store = null) {
  const api = {
    version: BOOT_STATE_VERSION,

    BOOT_PHASES,
    BOOT_EVENTS,

    normalizeBootPhase,

    markAppBootState: (options = {}) => markAppBootState(AppCore, options),
    markStoreBootState: (options = {}) => markStoreBootState(Store, options),

    markBootStart: (options = {}) => markBootStart(AppCore, Store, options),
    markBootReady: (options = {}) => markBootReady(AppCore, Store, options),
    markBootError: (error = null, options = {}) => markBootError(AppCore, Store, error, options),
    markBootFatal: (error = null, options = {}) => markBootFatal(AppCore, Store, error, options),
    markRebootState: (options = {}) => markRebootState(AppCore, Store, options),

    isAppBooting: () => isAppBooting(AppCore),
    isAppReady: () => isAppReady(AppCore),
    isAppLoading: () => isAppLoading(AppCore),
    hasBootError: () => hasBootError(AppCore),

    getSnapshot: () => getBootStateSnapshot(AppCore, Store),
    getAppSnapshot: () => getAppBootStateSnapshot(AppCore),
    getStoreSnapshot: () => getStoreBootStateSnapshot(Store),
    getDocumentSnapshot: getDocumentBootStateSnapshot,

    resetSignatures: resetBootStateSignatures,
  };

  try {
    if (isBrowser()) {
      window[APP_RUNTIME_KEYS?.bootState || "__ONION_BOOT_STATE__"] = api;
    }
  } catch {}

  try {
    defineHidden(AppCore, "BootState", api);
  } catch {}

  if (!debugBridgeReady) {
    debugBridgeReady = true;

    emitCoreEvent(AppCore, BOOT_EVENTS.DEBUG_READY, {
      version: BOOT_STATE_VERSION,
      at: nowPayload().iso,
    });
  }

  return api;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  BOOT_STATE_VERSION,

  BOOT_PHASES,
  BOOT_EVENTS,

  normalizeBootPhase,

  markAppBootState,
  markStoreBootState,

  markBootStart,
  markBootReady,
  markBootError,
  markBootFatal,
  markRebootState,

  isAppBooting,
  isAppReady,
  isAppLoading,
  hasBootError,

  syncDocumentBootState,

  getAppBootStateSnapshot,
  getStoreBootStateSnapshot,
  getDocumentBootStateSnapshot,
  getBootStateSnapshot,

  resetBootStateSignatures,
  exposeBootStateDebugApi,
};
