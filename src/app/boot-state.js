/* =========================================================
   Onion SPA - App Boot State
   Archivo: /src/app/boot-state.js

   ONION SUPPORT · APP BOOT STATE
   BOOT FLAGS · LOADER FLAGS · STORE SYNC · DOCUMENT SYNC · 17/10

   Responsabilidades:
   - Sincronizar estado de boot de AppCore.
   - Sincronizar estado de boot del Store.
   - Centralizar flags ready / booted / booting / loading / appReady.
   - Endurecer transiciones boot / reboot / error / fatal.
   - Evitar estados fantasma.
   - Sincronizar clases/datasets de html/body.
   - Emitir eventos de boot consistentes sin duplicar bus + window.
   - Exponer snapshots de diagnóstico seguros.
   - Mantener compatibilidad con loader.js, shell.js e index.js.

   HARDENING:
   - Tolerancia total a módulos parciales.
   - Idempotencia fuerte por firma comparable.
   - Compatible con AppCore.setState / patchState / mutación directa.
   - Compatible con Store.actions / Store.setState / patchState.
   - Cero throws accidentales.
   - Normalización estricta de fases.
   - Soporte fases extendidas del boot.
   - Redacción de tokens en errores, stacks, URLs y snapshots.
   - No duplica AppCore.events + window.
   - No emite eventos Store si Store no existe.
   - Evita app-ready en estado fatal/error.
   - Sin CSS inline.
   - Sin estilos inyectados.

   FIXES 17:
   - phase READY limpia loading/booting aunque hubiera estado previo loading.
   - phase ERROR/FATAL limpia ready/booted.
   - reboot limpia errores y timestamps terminales.
   - document sync amplía limpieza de clases legacy.
   - AppCore.setLoading NO se llama aquí para evitar eventos derivados.
   - setState y patchState no se ejecutan ambos salvo fallback necesario.
   - sanitize circular-safe.
========================================================= */

/* =========================================================
   VERSION
========================================================= */

export const BOOT_STATE_VERSION = "17.0.0-core-aligned";

/* =========================================================
   CONSTANTS
========================================================= */

export const BOOT_PHASES = Object.freeze({
  IDLE: "idle",

  PREPARING: "preparing",
  BOOTING: "booting",
  SERVICES: "services",
  STORE: "store",
  I18N: "i18n",
  UI: "ui",
  RESTORING: "restoring",
  RENDERING: "rendering",
  BINDING: "binding",
  FINALIZING: "finalizing",

  READY: "ready",

  ERROR: "error",
  FATAL: "fatal",

  REBOOTING: "rebooting",
});

export const BOOT_EVENTS = Object.freeze({
  APP_STATE: "app:boot:state",
  APP_START: "app:boot:start",
  APP_READY: "app:boot:ready",
  APP_ERROR: "app:boot:error",
  APP_FATAL: "app:boot:fatal",

  STORE_STATE: "store:boot:state",
  STORE_START: "store:boot:start",
  STORE_READY: "store:boot:ready",
  STORE_ERROR: "store:boot:error",

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

const TERMINAL_PHASES = Object.freeze([
  BOOT_PHASES.READY,
  BOOT_PHASES.ERROR,
  BOOT_PHASES.FATAL,
]);

const ERROR_PHASES = Object.freeze([
  BOOT_PHASES.ERROR,
  BOOT_PHASES.FATAL,
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

const DOCUMENT_STATE_CLASSES = Object.freeze([
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

const SANITIZE_MAX_DEPTH = 7;
const SANITIZE_MAX_ARRAY = 100;
const SANITIZE_MAX_KEYS = 140;

let APP_SIGNATURES = new WeakMap();
let STORE_SIGNATURES = new WeakMap();
let DOCUMENT_SIGNATURES = new WeakMap();

let fallbackAppSignature = "";
let fallbackStoreSignature = "";
let fallbackDocumentSignature = "";
let debugBridgeReady = false;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isObjectLike(value) {
  return (
    value !== null &&
    (
      typeof value === "object" ||
      typeof value === "function"
    )
  );
}

function isWeakMapKey(value) {
  return isObjectLike(value);
}

function isExtensibleObject(value) {
  try {
    return (
      isObjectLike(value) &&
      Object.isExtensible(value)
    );
  } catch {}

  return false;
}

function ensureObject(value) {
  return isObject(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function hasOwn(value, key) {
  try {
    return Object.prototype.hasOwnProperty.call(
      value,
      key
    );
  } catch {}

  return false;
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

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeInteger(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.trunc(number);
}

function nowPayload() {
  let ms = 0;

  try {
    ms = Date.now();
  } catch {
    ms = 0;
  }

  let iso = "";

  try {
    iso = new Date(ms).toISOString();
  } catch {
    iso = "";
  }

  return {
    ms,
    iso,
  };
}

function safeInvoke(fn, thisArg = null, args = []) {
  try {
    if (isFunction(fn)) {
      return fn.apply(
        thisArg,
        Array.isArray(args) ? args : []
      );
    }
  } catch {}

  return undefined;
}

function safeMethod(target, methodName, args = []) {
  if (
    !target ||
    !methodName
  ) {
    return undefined;
  }

  return safeInvoke(
    target?.[methodName],
    target,
    args
  );
}

function safeAssign(target, payload) {
  try {
    if (
      target &&
      typeof target === "object"
    ) {
      Object.assign(
        target,
        payload
      );

      return true;
    }
  } catch {}

  return false;
}

function safeDefineValue(target, key, value) {
  if (
    !target ||
    !key ||
    !isExtensibleObject(target)
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        configurable: true,
        enumerable: false,
        writable: true,
      }
    );

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {}

  return false;
}

function ensureMutableState(target, key = "state") {
  if (!target) {
    return {};
  }

  try {
    if (
      target[key] &&
      typeof target[key] === "object"
    ) {
      return target[key];
    }
  } catch {}

  try {
    if (isExtensibleObject(target)) {
      target[key] = {};
      return target[key];
    }
  } catch {}

  return {};
}

function safeArrayFromClassList(classList) {
  try {
    return Array.from(classList || []);
  } catch {}

  return [];
}

function hasUsableTarget(target) {
  return Boolean(
    target &&
    (
      isObjectLike(target) ||
      isFunction(target)
    )
  );
}

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function redactSensitiveText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
      const escaped =
        escapeRegExp(name);

      output = output.replace(
        new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    }

    for (const routePath of TOKEN_ROUTE_PATHS) {
      output = output.replace(
        new RegExp(`(${escapeRegExp(routePath)}\\/)([^/?#\\s]+)`, "gi"),
        "$1***"
      );
    }

    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
      "$1$2***"
    );

    output = output.replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
  } catch {}

  return output;
}

function isDomNodeLike(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  try {
    return Boolean(
      typeof Node !== "undefined" &&
      value instanceof Node
    );
  } catch {}

  try {
    return Boolean(
      value.nodeType &&
      value.nodeName
    );
  } catch {}

  return false;
}

function normalizeError(error) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return {
      name: "BootError",
      message: redactSensitiveText(error),
      code: "BOOT_ERROR",
      url: "",
      stack: "",
    };
  }

  const object =
    ensureObject(
      error?.error ||
      error?.reason ||
      error
    );

  const message =
    safeText(
      object.message ||
      object.statusText ||
      object.detail ||
      object.reason?.message ||
      object.reason ||
      object.error ||
      error?.message ||
      "Error durante el boot de la aplicación.",
      "Error durante el boot de la aplicación."
    );

  const code =
    safeText(
      object.code ||
      object.status ||
      object.statusCode ||
      object.data?.code ||
      object.response?.status ||
      object.response?.statusCode ||
      "BOOT_ERROR",
      "BOOT_ERROR"
    );

  const url =
    safeText(
      object.url ||
      object.href ||
      object.filename ||
      object.target?.src ||
      object.target?.href ||
      "",
      ""
    );

  return {
    name:
      safeText(
        object.name ||
        object.constructor?.name,
        "BootError"
      ),

    message:
      redactSensitiveText(message),

    code:
      redactSensitiveText(code),

    url:
      redactSensitiveText(url),

    stack:
      object.stack
        ? redactSensitiveText(
            safeText(object.stack, "")
          )
        : "",
  };
}

function sanitizeErrorForSnapshot(error = null) {
  if (!error) {
    return null;
  }

  const normalized =
    normalizeError(error);

  if (!normalized) {
    return null;
  }

  return {
    ...normalized,

    message:
      redactSensitiveText(normalized.message),

    code:
      redactSensitiveText(normalized.code),

    url:
      redactSensitiveText(normalized.url),

    stack:
      normalized.stack
        ? redactSensitiveText(normalized.stack)
        : "",
  };
}

function sanitizePayload(value, depth = 0, seen = null) {
  if (!seen) {
    try {
      seen = new WeakSet();
    } catch {
      seen = null;
    }
  }

  if (depth > SANITIZE_MAX_DEPTH) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
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

  if (isDomNodeLike(value)) {
    return {
      node:
        safeText(value.nodeName, "Node"),

      id:
        safeText(value.id, ""),

      className:
        safeText(
          value.className?.baseVal ||
          value.className,
          ""
        ),
    };
  }

  if (value instanceof Error) {
    return sanitizeErrorForSnapshot(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, SANITIZE_MAX_ARRAY)
      .map((item) =>
        sanitizePayload(
          item,
          depth + 1,
          seen
        )
      );
  }

  if (value instanceof Map) {
    return {
      type: "Map",
      size: value.size,
    };
  }

  if (value instanceof Set) {
    return {
      type: "Set",
      size: value.size,
    };
  }

  if (isObject(value)) {
    try {
      if (
        seen &&
        seen.has(value)
      ) {
        return "[Circular]";
      }

      seen?.add?.(value);
    } catch {}

    const output = {};

    const entries =
      Object.entries(value)
        .slice(0, SANITIZE_MAX_KEYS);

    for (const [key, item] of entries) {
      if (
        /token|secret|password|authorization|bearer|credential|jwt|otp|code|session|refresh/i.test(key)
      ) {
        if (
          item === null ||
          item === undefined ||
          item === "" ||
          typeof item === "boolean"
        ) {
          output[key] = item;
        } else {
          output[key] = "***";
        }

        continue;
      }

      output[key] =
        sanitizePayload(
          item,
          depth + 1,
          seen
        );
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   EVENTS
========================================================= */

function safeCreateCustomEvent(name, detail = {}) {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(
        name,
        {
          detail,
        }
      );
    }
  } catch {}

  try {
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

function safeWindowDispatch(eventName, detail = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    const event =
      safeCreateCustomEvent(
        eventName,
        sanitizePayload(detail)
      );

    if (!event) {
      return false;
    }

    window.dispatchEvent(event);
    return true;
  } catch {}

  return false;
}

function emitCoreEvent(AppCore, eventName, detail = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts = ensureObject(options);
  const payload = sanitizePayload(detail);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        name,
        payload
      );

      busEmitted = true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return (
      safeWindowDispatch(
        name,
        payload
      ) ||
      busEmitted
    );
  }

  return busEmitted;
}

function emitStoreEvent(Store, eventName, detail = {}, options = {}) {
  if (!hasUsableTarget(Store)) {
    return false;
  }

  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts = ensureObject(options);
  const payload = sanitizePayload(detail);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(Store?.events?.emit)) {
      busAvailable = true;

      Store.events.emit(
        name,
        payload
      );

      busEmitted = true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return (
      safeWindowDispatch(
        name,
        payload
      ) ||
      busEmitted
    );
  }

  return busEmitted;
}

/* =========================================================
   SIGNATURE
========================================================= */

function getSignatureStore(map, key, fallback) {
  try {
    if (isWeakMapKey(key)) {
      return map.get(key) || "";
    }
  } catch {}

  return fallback || "";
}

function setSignatureStore(map, key, value, type = "app") {
  try {
    if (isWeakMapKey(key)) {
      map.set(
        key,
        value
      );

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

function getComparableSignature(payload = {}) {
  const data = {
    booted:
      Boolean(payload.booted),

    booting:
      Boolean(payload.booting),

    ready:
      Boolean(payload.ready),

    loading:
      Boolean(payload.loading),

    appReady:
      Boolean(payload.appReady),

    appBooting:
      Boolean(payload.appBooting),

    appFatal:
      Boolean(payload.appFatal || payload.fatal),

    bootPhase:
      safeText(payload.bootPhase, ""),

    bootCycleId:
      safeInteger(payload.bootCycleId, 0),

    lastBootReason:
      safeText(payload.lastBootReason, ""),

    lastBootErrorMessage:
      safeText(payload.lastBootError?.message, ""),

    lastBootErrorCode:
      safeText(payload.lastBootError?.code, ""),
  };

  try {
    return JSON.stringify(data);
  } catch {
    return `${Date.now()}`;
  }
}

function getDocumentComparableSignature(payload = {}) {
  const names =
    getDocumentStateNames(payload);

  const data = {
    booting:
      Boolean(names.booting),

    loading:
      Boolean(names.loading),

    ready:
      Boolean(names.ready),

    error:
      Boolean(names.error),

    fatal:
      Boolean(names.fatal),

    phase:
      safeText(names.phase, ""),

    appState:
      safeText(names.appState, ""),

    shellState:
      safeText(names.shellState, ""),
  };

  try {
    return JSON.stringify(data);
  } catch {
    return `${Date.now()}`;
  }
}

/* =========================================================
   PHASE NORMALIZATION
========================================================= */

export function normalizeBootPhase(value = "") {
  const phase = safeText(value, "").toLowerCase();

  if (!phase) {
    return "";
  }

  const aliases = {
    start: BOOT_PHASES.BOOTING,
    starting: BOOT_PHASES.BOOTING,

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

  if (aliases[phase]) {
    return aliases[phase];
  }

  const values = Object.values(BOOT_PHASES);

  if (values.includes(phase)) {
    return phase;
  }

  return "";
}

function isBootingPhase(phase = "") {
  return BOOTING_PHASES.includes(
    normalizeBootPhase(phase)
  );
}

function isReadyPhase(phase = "") {
  return normalizeBootPhase(phase) === BOOT_PHASES.READY;
}

function isErrorPhase(phase = "") {
  return ERROR_PHASES.includes(
    normalizeBootPhase(phase)
  );
}

function isTerminalPhase(phase = "") {
  return TERMINAL_PHASES.includes(
    normalizeBootPhase(phase)
  );
}

function inferPhaseFromFlags({
  booted = false,
  booting = false,
  ready = false,
  loading = false,
  error = null,
  fatal = false,
} = {}) {
  if (fatal) {
    return BOOT_PHASES.FATAL;
  }

  if (error) {
    return BOOT_PHASES.ERROR;
  }

  if (booting || loading) {
    return BOOT_PHASES.BOOTING;
  }

  if (booted || ready) {
    return BOOT_PHASES.READY;
  }

  return BOOT_PHASES.IDLE;
}

function normalizeCycleId(input = {}, previous = {}) {
  if (hasOwn(input, "cycleId")) {
    return safeInteger(input.cycleId, 0);
  }

  if (hasOwn(input, "bootCycleId")) {
    return safeInteger(input.bootCycleId, 0);
  }

  return safeInteger(previous.bootCycleId, 0);
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

/* =========================================================
   PREVIOUS STATE
========================================================= */

function getPreviousAppBootState(AppCore) {
  const state = ensureObject(AppCore?.state);

  return {
    booted:
      Boolean(state.booted),

    booting:
      Boolean(state.booting),

    ready:
      Boolean(state.ready || state.appReady),

    loading:
      Boolean(state.loading),

    appReady:
      Boolean(state.appReady || state.ready),

    appBooting:
      Boolean(state.appBooting || state.booting),

    appFatal:
      Boolean(state.appFatal || state.fatal),

    bootPhase:
      normalizeBootPhase(state.bootPhase) || BOOT_PHASES.IDLE,

    bootCycleId:
      safeInteger(state.bootCycleId, 0),

    lastBootReason:
      safeText(state.lastBootReason, ""),

    lastBootError:
      state.lastBootError || null,

    bootStartedAt:
      safeText(state.bootStartedAt, ""),

    bootReadyAt:
      safeText(state.bootReadyAt, ""),

    bootErrorAt:
      safeText(state.bootErrorAt, ""),

    bootFatalAt:
      safeText(state.bootFatalAt, ""),
  };
}

function getPreviousStoreBootState(Store) {
  if (!hasUsableTarget(Store)) {
    return {
      ready: false,
      booted: false,
      booting: false,
      loading: false,
      fatal: false,
      bootPhase: BOOT_PHASES.IDLE,
      bootCycleId: 0,
      lastBootReason: "",
      lastBootError: null,
      bootStartedAt: "",
      bootReadyAt: "",
      bootErrorAt: "",
      bootFatalAt: "",
    };
  }

  const stateFromGetter =
    ensureObject(
      safeMethod(Store, "getState")
    );

  const directState =
    ensureObject(Store?.state);

  const state = {
    ...directState,
    ...stateFromGetter,
  };

  return {
    ready:
      Boolean(state.ready),

    booted:
      Boolean(state.booted),

    booting:
      Boolean(state.booting),

    loading:
      Boolean(state.loading),

    fatal:
      Boolean(state.fatal),

    bootPhase:
      normalizeBootPhase(state.bootPhase) || BOOT_PHASES.IDLE,

    bootCycleId:
      safeInteger(state.bootCycleId, 0),

    lastBootReason:
      safeText(state.lastBootReason, ""),

    lastBootError:
      state.lastBootError || null,

    bootStartedAt:
      safeText(state.bootStartedAt, ""),

    bootReadyAt:
      safeText(state.bootReadyAt, ""),

    bootErrorAt:
      safeText(state.bootErrorAt, ""),

    bootFatalAt:
      safeText(state.bootFatalAt, ""),
  };
}

/* =========================================================
   PAYLOAD NORMALIZATION
========================================================= */

function buildCommonBootTiming({
  phase,
  previous = {},
  input = {},
  clock = nowPayload(),
} = {}) {
  const cleanPhase =
    normalizeBootPhase(phase) || BOOT_PHASES.IDLE;

  const resetTiming =
    input.resetTiming === true;

  const previousTiming =
    resetTiming
      ? {}
      : previous;

  const booting =
    isBootingPhase(cleanPhase);

  const ready =
    cleanPhase === BOOT_PHASES.READY;

  const error =
    cleanPhase === BOOT_PHASES.ERROR;

  const fatal =
    cleanPhase === BOOT_PHASES.FATAL;

  return {
    bootStartedAt:
      safeText(input.bootStartedAt, "") ||
      (
        booting
          ? safeText(previousTiming.bootStartedAt, "") || clock.iso
          : safeText(previousTiming.bootStartedAt, "")
      ),

    bootReadyAt:
      safeText(input.bootReadyAt, "") ||
      (
        ready
          ? clock.iso
          : ""
      ),

    bootErrorAt:
      safeText(input.bootErrorAt, "") ||
      (
        error
          ? clock.iso
          : ""
      ),

    bootFatalAt:
      safeText(input.bootFatalAt, "") ||
      (
        fatal
          ? clock.iso
          : ""
      ),
  };
}

function normalizeAppBootPayload(options = {}, previous = {}) {
  const input = ensureObject(options);

  const requestedPhase =
    normalizeBootPhase(
      input.phase ||
      input.bootPhase ||
      ""
    );

  const hasExplicitError =
    hasOwn(input, "error") &&
    Boolean(input.error);

  const hasFatal =
    input.fatal === true ||
    requestedPhase === BOOT_PHASES.FATAL;

  const hasError =
    hasExplicitError ||
    requestedPhase === BOOT_PHASES.ERROR ||
    hasFatal;

  let booted =
    hasOwn(input, "booted")
      ? safeBool(input.booted)
      : Boolean(previous.booted);

  let booting =
    hasOwn(input, "booting")
      ? safeBool(input.booting)
      : Boolean(previous.booting);

  let ready =
    hasOwn(input, "ready")
      ? safeBool(input.ready)
      : Boolean(previous.ready || booted);

  let loading =
    hasOwn(input, "loading")
      ? safeBool(input.loading)
      : Boolean(previous.loading || booting);

  let phase =
    requestedPhase ||
    inferPhaseFromFlags({
      booted,
      booting,
      ready,
      loading,
      error:
        hasError
          ? input.error || true
          : null,
      fatal:
        hasFatal,
    });

  if (hasFatal || phase === BOOT_PHASES.FATAL) {
    booted = false;
    ready = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.FATAL;
  } else if (hasError || phase === BOOT_PHASES.ERROR) {
    booted = false;
    ready = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.ERROR;
  } else if (phase === BOOT_PHASES.READY) {
    booted = true;
    ready = true;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.READY;
  } else if (isBootingPhase(phase)) {
    booted = false;
    ready = false;
    booting = true;
    loading = true;
  } else if (
    booting ||
    loading
  ) {
    booted = false;
    ready = false;
    booting = true;
    loading = true;
    phase = BOOT_PHASES.BOOTING;
  } else if (
    booted ||
    ready
  ) {
    booted = true;
    ready = true;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.READY;
  } else {
    booted = false;
    ready = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.IDLE;
  }

  const cycleId =
    normalizeCycleId(input, previous);

  const reason =
    normalizeReason(input, phase);

  const clock =
    nowPayload();

  const timing =
    buildCommonBootTiming({
      phase,
      previous,
      input,
      clock,
    });

  const error =
    phase === BOOT_PHASES.ERROR ||
    phase === BOOT_PHASES.FATAL ||
    hasError
      ? normalizeError(input.error || previous.lastBootError)
      : null;

  return {
    booted,
    booting,
    ready,
    loading,

    appReady: ready,
    appBooting: booting,

    appFatal: phase === BOOT_PHASES.FATAL,
    fatal: phase === BOOT_PHASES.FATAL,

    bootPhase: phase,
    bootCycleId: cycleId,

    bootUpdatedAt: clock.iso,
    bootUpdatedAtMs: clock.ms,

    ...timing,

    lastBootReason: reason,
    lastBootError: error,
  };
}

function normalizeStoreBootPayload(options = {}, previous = {}) {
  const input = ensureObject(options);

  const requestedPhase =
    normalizeBootPhase(
      input.phase ||
      input.bootPhase ||
      ""
    );

  const hasExplicitError =
    hasOwn(input, "error") &&
    Boolean(input.error);

  const hasFatal =
    input.fatal === true ||
    requestedPhase === BOOT_PHASES.FATAL;

  const hasError =
    hasExplicitError ||
    requestedPhase === BOOT_PHASES.ERROR ||
    hasFatal;

  let ready =
    hasOwn(input, "ready")
      ? safeBool(input.ready)
      : Boolean(previous.ready);

  let booted =
    hasOwn(input, "booted")
      ? safeBool(input.booted)
      : Boolean(previous.booted || ready);

  let booting =
    hasOwn(input, "booting")
      ? safeBool(input.booting)
      : Boolean(previous.booting);

  let loading =
    hasOwn(input, "loading")
      ? safeBool(input.loading)
      : Boolean(previous.loading || booting);

  let phase =
    requestedPhase ||
    inferPhaseFromFlags({
      booted,
      booting,
      ready,
      loading,
      error:
        hasError
          ? input.error || true
          : null,
      fatal:
        hasFatal,
    });

  if (hasFatal || phase === BOOT_PHASES.FATAL) {
    ready = false;
    booted = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.FATAL;
  } else if (hasError || phase === BOOT_PHASES.ERROR) {
    ready = false;
    booted = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.ERROR;
  } else if (phase === BOOT_PHASES.READY) {
    ready = true;
    booted = true;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.READY;
  } else if (isBootingPhase(phase)) {
    ready = false;
    booted = false;
    booting = true;
    loading = true;
  } else if (
    booting ||
    loading
  ) {
    ready = false;
    booted = false;
    booting = true;
    loading = true;
    phase = BOOT_PHASES.BOOTING;
  } else if (
    ready ||
    booted
  ) {
    ready = true;
    booted = true;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.READY;
  } else {
    ready = false;
    booted = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.IDLE;
  }

  const cycleId =
    normalizeCycleId(input, previous);

  const reason =
    normalizeReason(input, phase);

  const clock =
    nowPayload();

  const timing =
    buildCommonBootTiming({
      phase,
      previous,
      input,
      clock,
    });

  const error =
    phase === BOOT_PHASES.ERROR ||
    phase === BOOT_PHASES.FATAL ||
    hasError
      ? normalizeError(input.error || previous.lastBootError)
      : null;

  return {
    ready,
    booted,
    booting,
    loading,

    fatal: phase === BOOT_PHASES.FATAL,

    bootPhase: phase,
    bootCycleId: cycleId,

    bootUpdatedAt: clock.iso,
    bootUpdatedAtMs: clock.ms,

    ...timing,

    lastBootReason: reason,
    lastBootError: error,
  };
}

/* =========================================================
   DOCUMENT STATE
========================================================= */

function setDataset(el, key, value) {
  if (
    !el ||
    !key
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete el.dataset[key];
      return true;
    }

    el.dataset[key] = String(value);
    return true;
  } catch {}

  return false;
}

function toggleClass(el, className, enabled) {
  if (
    !el ||
    !className
  ) {
    return false;
  }

  try {
    el.classList.toggle(
      className,
      Boolean(enabled)
    );

    return true;
  } catch {}

  return false;
}

function removeClasses(root, classNames = []) {
  if (!root) {
    return false;
  }

  try {
    for (const className of classNames) {
      root.classList.remove(className);
    }

    return true;
  } catch {}

  return false;
}

function getDocumentStateNames(payload = {}, options = {}) {
  const opts = ensureObject(options);

  const phase =
    normalizeBootPhase(payload.bootPhase) ||
    BOOT_PHASES.IDLE;

  const fatal =
    phase === BOOT_PHASES.FATAL ||
    Boolean(payload.fatal) ||
    Boolean(payload.appFatal) ||
    Boolean(opts.fatal === true);

  const error =
    fatal ||
    phase === BOOT_PHASES.ERROR ||
    Boolean(payload.lastBootError);

  const booting =
    !error &&
    (
      isBootingPhase(phase) ||
      Boolean(payload.booting)
    );

  const ready =
    !error &&
    !booting &&
    (
      phase === BOOT_PHASES.READY ||
      Boolean(payload.ready) ||
      Boolean(payload.appReady) ||
      Boolean(payload.booted)
    );

  const loading =
    !error &&
    (
      Boolean(payload.loading) ||
      booting
    );

  const appState =
    booting
      ? "booting"
      : fatal
        ? "fatal"
        : error
          ? "error"
          : ready
            ? "ready"
            : "idle";

  const shellState =
    booting
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
    ready,
    error,
    fatal,
    loading,
    appState,
    shellState,
  };
}

export function syncDocumentBootState(payload = {}, options = {}) {
  if (!isBrowser()) {
    return false;
  }

  const opts = ensureObject(options);

  const names =
    getDocumentStateNames(
      payload,
      opts
    );

  const roots = [
    document.documentElement,
    document.body,
  ].filter(Boolean);

  for (const root of roots) {
    removeClasses(
      root,
      DOCUMENT_STATE_CLASSES
    );

    toggleClass(
      root,
      "app-booting",
      names.booting
    );

    toggleClass(
      root,
      "is-booting",
      names.booting
    );

    toggleClass(
      root,
      "app-loading",
      names.loading
    );

    toggleClass(
      root,
      "is-loading",
      names.loading
    );

    toggleClass(
      root,
      "loading",
      names.loading
    );

    toggleClass(
      root,
      "app-ready",
      names.ready && !names.error && !names.fatal
    );

    toggleClass(
      root,
      "is-ready",
      names.ready && !names.error && !names.fatal
    );

    toggleClass(
      root,
      "app-error",
      names.error && !names.fatal
    );

    toggleClass(
      root,
      "is-error",
      names.error && !names.fatal
    );

    toggleClass(
      root,
      "app-fatal",
      names.fatal
    );

    toggleClass(
      root,
      "is-fatal",
      names.fatal
    );

    setDataset(
      root,
      "appLoading",
      names.loading ? "true" : "false"
    );

    setDataset(
      root,
      "appReady",
      names.ready && !names.error && !names.fatal ? "true" : "false"
    );

    setDataset(
      root,
      "appBooting",
      names.booting ? "true" : "false"
    );

    setDataset(
      root,
      "bootPhase",
      names.phase
    );

    setDataset(
      root,
      "appState",
      names.appState
    );

    setDataset(
      root,
      "shellState",
      names.shellState
    );

    setDataset(
      root,
      "bootError",
      names.error || names.fatal ? "true" : "false"
    );
  }

  return true;
}

function maybeEmitDocumentState(AppCore, payload = {}, options = {}) {
  const signature =
    getDocumentComparableSignature(payload);

  const previousSignature =
    getSignatureStore(
      DOCUMENT_SIGNATURES,
      AppCore,
      fallbackDocumentSignature
    );

  const changed =
    signature !== previousSignature;

  setSignatureStore(
    DOCUMENT_SIGNATURES,
    AppCore,
    signature,
    "document"
  );

  if (
    changed ||
    safeBool(options?.forceEmit)
  ) {
    const names =
      getDocumentStateNames(
        payload,
        options
      );

    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.DOCUMENT_STATE,
      {
        version: BOOT_STATE_VERSION,

        phase: names.phase,
        booting: names.booting,
        loading: names.loading,
        ready: names.ready,
        error: names.error,
        fatal: names.fatal,

        appState: names.appState,
        shellState: names.shellState,

        changed,
      }
    );
  }

  return changed;
}

/* =========================================================
   APPLY APP / STORE
========================================================= */

function callCoreStateMethod(AppCore, methodName, payload, options = {}) {
  if (
    !AppCore ||
    !isFunction(AppCore?.[methodName])
  ) {
    return false;
  }

  try {
    AppCore[methodName](
      payload,
      {
        source: "app:boot-state",
        emit: false,
        emitState: false,
        emitDerived: false,
        silent: true,
        ...ensureObject(options?.stateOptions),
      }
    );

    return true;
  } catch {}

  try {
    AppCore[methodName](payload);
    return true;
  } catch {}

  return false;
}

function applyAppBootPayload(AppCore, payload, options = {}) {
  const state =
    ensureMutableState(
      AppCore,
      "state"
    );

  safeAssign(
    state,
    payload
  );

  if (options?.skipSetState !== true) {
    const setOk =
      callCoreStateMethod(
        AppCore,
        "setState",
        payload,
        options
      );

    if (
      !setOk &&
      options?.skipPatchState !== true
    ) {
      callCoreStateMethod(
        AppCore,
        "patchState",
        payload,
        options
      );
    }
  } else if (options?.skipPatchState !== true) {
    callCoreStateMethod(
      AppCore,
      "patchState",
      payload,
      options
    );
  }

  syncDocumentBootState(
    payload,
    options
  );

  maybeEmitDocumentState(
    AppCore,
    payload,
    options
  );

  return payload;
}

function callStoreStateMethod(Store, methodName, payload, options = {}) {
  if (
    !Store ||
    !isFunction(Store?.[methodName])
  ) {
    return false;
  }

  try {
    Store[methodName](
      payload,
      {
        source: "app:boot-state",
        emit: false,
        silent: true,
        ...ensureObject(options?.stateOptions),
      }
    );

    return true;
  } catch {}

  try {
    Store[methodName](payload);
    return true;
  } catch {}

  return false;
}

function callStoreAction(actions, methodName, args = []) {
  if (
    !actions ||
    !isFunction(actions?.[methodName])
  ) {
    return false;
  }

  try {
    actions[methodName](
      ...(Array.isArray(args) ? args : [])
    );

    return true;
  } catch {}

  return false;
}

function applyStoreBootPayload(Store, payload, options = {}) {
  if (!hasUsableTarget(Store)) {
    return payload;
  }

  const state =
    ensureMutableState(
      Store,
      "state"
    );

  safeAssign(
    state,
    payload
  );

  let stateApplied = false;

  if (options?.skipSetState !== true) {
    stateApplied =
      callStoreStateMethod(
        Store,
        "setState",
        payload,
        options
      );
  }

  if (
    !stateApplied &&
    options?.skipPatchState !== true
  ) {
    stateApplied =
      callStoreStateMethod(
        Store,
        "patchState",
        payload,
        options
      );
  }

  if (!stateApplied) {
    stateApplied =
      callStoreStateMethod(
        Store,
        "set",
        payload,
        options
      );
  }

  if (!stateApplied) {
    stateApplied =
      callStoreStateMethod(
        Store,
        "patch",
        payload,
        options
      );
  }

  const actions =
    ensureObject(Store?.actions);

  callStoreAction(
    actions,
    "markReady",
    [
      payload.ready,
      payload,
    ]
  );

  callStoreAction(
    actions,
    "markBooted",
    [
      payload.booted,
      payload,
    ]
  );

  callStoreAction(
    actions,
    "markBooting",
    [
      payload.booting,
      payload,
    ]
  );

  callStoreAction(
    actions,
    "setLoading",
    [
      payload.loading,
      payload,
    ]
  );

  callStoreAction(
    actions,
    "markLoading",
    [
      payload.loading,
      payload,
    ]
  );

  callStoreAction(
    actions,
    "set",
    [
      payload,
    ]
  );

  callStoreAction(
    actions,
    "patch",
    [
      payload,
    ]
  );

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
    previous: sanitizePayload(previous),
  };
}

function emitAppBootEvents(AppCore, eventPayload, options = {}) {
  if (
    eventPayload.changed !== true &&
    !safeBool(options?.forceEmit) &&
    !safeBool(options?.emitUnchanged)
  ) {
    return false;
  }

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.APP_STATE,
    eventPayload
  );

  if (isBootingPhase(eventPayload.bootPhase)) {
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.APP_START,
      eventPayload
    );
  }

  if (eventPayload.bootPhase === BOOT_PHASES.READY) {
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.APP_READY,
      eventPayload
    );
  }

  if (eventPayload.bootPhase === BOOT_PHASES.ERROR) {
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.APP_ERROR,
      eventPayload
    );
  }

  if (eventPayload.bootPhase === BOOT_PHASES.FATAL) {
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.APP_FATAL,
      eventPayload
    );
  }

  return true;
}

function emitStoreBootEvents(Store, eventPayload, options = {}) {
  if (!hasUsableTarget(Store)) {
    return false;
  }

  if (
    eventPayload.changed !== true &&
    !safeBool(options?.forceEmit) &&
    !safeBool(options?.emitUnchanged)
  ) {
    return false;
  }

  emitStoreEvent(
    Store,
    BOOT_EVENTS.STORE_STATE,
    eventPayload
  );

  if (isBootingPhase(eventPayload.bootPhase)) {
    emitStoreEvent(
      Store,
      BOOT_EVENTS.STORE_START,
      eventPayload
    );
  }

  if (eventPayload.bootPhase === BOOT_PHASES.READY) {
    emitStoreEvent(
      Store,
      BOOT_EVENTS.STORE_READY,
      eventPayload
    );
  }

  if (isErrorPhase(eventPayload.bootPhase)) {
    emitStoreEvent(
      Store,
      BOOT_EVENTS.STORE_ERROR,
      eventPayload
    );
  }

  return true;
}

/* =========================================================
   APP STATE
========================================================= */

export function markAppBootState(AppCore, options = {}) {
  const previous =
    getPreviousAppBootState(AppCore);

  const payload =
    normalizeAppBootPayload(
      options,
      previous
    );

  const previousSignature =
    getSignatureStore(
      APP_SIGNATURES,
      AppCore,
      fallbackAppSignature
    );

  const signature =
    getComparableSignature(payload);

  const changed =
    signature !== previousSignature;

  setSignatureStore(
    APP_SIGNATURES,
    AppCore,
    signature,
    "app"
  );

  applyAppBootPayload(
    AppCore,
    payload,
    options
  );

  const eventPayload =
    buildEventPayload(
      payload,
      previous,
      changed
    );

  emitAppBootEvents(
    AppCore,
    eventPayload,
    options
  );

  return eventPayload;
}

/* =========================================================
   STORE STATE
========================================================= */

export function markStoreBootState(Store, options = {}) {
  const previous =
    getPreviousStoreBootState(Store);

  const payload =
    normalizeStoreBootPayload(
      options,
      previous
    );

  const previousSignature =
    getSignatureStore(
      STORE_SIGNATURES,
      Store,
      fallbackStoreSignature
    );

  const signature =
    getComparableSignature(payload);

  const changed =
    signature !== previousSignature;

  setSignatureStore(
    STORE_SIGNATURES,
    Store,
    signature,
    "store"
  );

  applyStoreBootPayload(
    Store,
    payload,
    options
  );

  const eventPayload =
    buildEventPayload(
      payload,
      previous,
      changed
    );

  emitStoreBootEvents(
    Store,
    eventPayload,
    options
  );

  return eventPayload;
}

/* =========================================================
   COMBINED HELPERS
========================================================= */

function emitCombinedBootEvents(AppCore, snapshot, phase = BOOT_PHASES.IDLE) {
  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.BOOT_STATE,
    snapshot
  );

  if (isBootingPhase(phase)) {
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.BOOT_START,
      snapshot
    );
  }

  if (phase === BOOT_PHASES.READY) {
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.BOOT_READY,
      snapshot
    );
  }

  if (phase === BOOT_PHASES.ERROR) {
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.BOOT_ERROR,
      snapshot
    );
  }

  if (phase === BOOT_PHASES.FATAL) {
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.BOOT_FATAL,
      snapshot
    );
  }

  if (phase === BOOT_PHASES.REBOOTING) {
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.REBOOT,
      snapshot
    );
  }

  return true;
}

export function markBootStart(AppCore, Store, options = {}) {
  const input = ensureObject(options);

  const phase =
    normalizeBootPhase(
      input.phase ||
      input.bootPhase
    ) ||
    BOOT_PHASES.BOOTING;

  const finalPhase =
    isBootingPhase(phase)
      ? phase
      : BOOT_PHASES.BOOTING;

  const payload = {
    ...input,

    booted: false,
    booting: true,
    ready: false,
    loading: true,

    phase: finalPhase,

    error: null,
    fatal: false,

    reason:
      safeText(
        input.reason,
        "boot-start"
      ),

    forceEmit:
      input.forceEmit !== false,
  };

  markAppBootState(
    AppCore,
    payload
  );

  markStoreBootState(
    Store,
    payload
  );

  const snapshot =
    getBootStateSnapshot(
      AppCore,
      Store
    );

  emitCombinedBootEvents(
    AppCore,
    snapshot,
    finalPhase
  );

  return snapshot;
}

export function markBootReady(AppCore, Store, options = {}) {
  const input = ensureObject(options);

  const payload = {
    ...input,

    booted: true,
    booting: false,
    ready: true,
    loading: false,

    phase: BOOT_PHASES.READY,

    fatal: false,
    error: null,

    reason:
      safeText(
        input.reason,
        "boot-ready"
      ),

    forceEmit:
      input.forceEmit !== false,
  };

  markAppBootState(
    AppCore,
    payload
  );

  markStoreBootState(
    Store,
    payload
  );

  const snapshot =
    getBootStateSnapshot(
      AppCore,
      Store
    );

  emitCombinedBootEvents(
    AppCore,
    snapshot,
    BOOT_PHASES.READY
  );

  return snapshot;
}

export function markBootError(AppCore, Store, error = null, options = {}) {
  const input = ensureObject(options);

  const fatal =
    input.fatal === true;

  const phase =
    fatal
      ? BOOT_PHASES.FATAL
      : BOOT_PHASES.ERROR;

  const payload = {
    ...input,

    booted: false,
    booting: false,
    ready: false,
    loading: false,

    phase,

    error,
    fatal,

    reason:
      safeText(
        input.reason,
        fatal ? "boot-fatal" : "boot-error"
      ),

    forceEmit:
      input.forceEmit !== false,
  };

  markAppBootState(
    AppCore,
    payload
  );

  markStoreBootState(
    Store,
    payload
  );

  const snapshot =
    getBootStateSnapshot(
      AppCore,
      Store
    );

  emitCombinedBootEvents(
    AppCore,
    snapshot,
    phase
  );

  return snapshot;
}

export function markBootFatal(AppCore, Store, error = null, options = {}) {
  return markBootError(
    AppCore,
    Store,
    error,
    {
      ...ensureObject(options),
      fatal: true,
      reason:
        safeText(
          options?.reason,
          "boot-fatal"
        ),
    }
  );
}

export function markRebootState(AppCore, Store, options = {}) {
  const input = ensureObject(options);

  const rebooting =
    input.booting === true ||
    input.loading === true;

  const phase =
    rebooting
      ? BOOT_PHASES.REBOOTING
      : BOOT_PHASES.IDLE;

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

    reason:
      safeText(
        input.reason,
        "reboot-reset"
      ),

    forceEmit:
      input.forceEmit !== false,
  };

  markAppBootState(
    AppCore,
    payload
  );

  markStoreBootState(
    Store,
    payload
  );

  const snapshot =
    getBootStateSnapshot(
      AppCore,
      Store
    );

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.BOOT_STATE,
    snapshot
  );

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.REBOOT,
    snapshot
  );

  return snapshot;
}

/* =========================================================
   EXTRA HELPERS
========================================================= */

export function isAppBooting(AppCore) {
  const state = ensureObject(AppCore?.state);

  return Boolean(
    state.booting ||
    state.appBooting ||
    isBootingPhase(state.bootPhase)
  );
}

export function isAppReady(AppCore) {
  const state = ensureObject(AppCore?.state);

  return Boolean(
    (
      state.ready ||
      state.appReady ||
      state.booted ||
      state.bootPhase === BOOT_PHASES.READY
    ) &&
    !state.lastBootError &&
    state.bootPhase !== BOOT_PHASES.ERROR &&
    state.bootPhase !== BOOT_PHASES.FATAL &&
    !state.appFatal &&
    !state.fatal
  );
}

export function isAppLoading(AppCore) {
  const state = ensureObject(AppCore?.state);

  return Boolean(
    state.loading ||
    state.booting ||
    state.appBooting ||
    isBootingPhase(state.bootPhase)
  );
}

export function hasBootError(AppCore) {
  const state = ensureObject(AppCore?.state);

  return Boolean(
    state.lastBootError ||
    state.bootPhase === BOOT_PHASES.ERROR ||
    state.bootPhase === BOOT_PHASES.FATAL ||
    state.appFatal ||
    state.fatal
  );
}

export function resetBootStateSignatures() {
  APP_SIGNATURES = new WeakMap();
  STORE_SIGNATURES = new WeakMap();
  DOCUMENT_SIGNATURES = new WeakMap();

  fallbackAppSignature = "";
  fallbackStoreSignature = "";
  fallbackDocumentSignature = "";

  return true;
}

/* =========================================================
   DEBUG SNAPSHOTS
========================================================= */

export function getAppBootStateSnapshot(AppCore) {
  const state = ensureObject(AppCore?.state);

  return sanitizePayload({
    version: BOOT_STATE_VERSION,

    hasCore:
      Boolean(AppCore),

    hasState:
      isObject(AppCore?.state),

    hasSetState:
      isFunction(AppCore?.setState),

    hasPatchState:
      isFunction(AppCore?.patchState),

    hasSetLoading:
      isFunction(AppCore?.setLoading),

    booted:
      Boolean(state.booted),

    booting:
      Boolean(state.booting),

    ready:
      Boolean(state.ready || state.appReady),

    loading:
      Boolean(state.loading),

    appReady:
      Boolean(state.appReady || state.ready),

    appBooting:
      Boolean(state.appBooting || state.booting),

    appFatal:
      Boolean(state.appFatal || state.fatal),

    phase:
      normalizeBootPhase(state.bootPhase) || BOOT_PHASES.IDLE,

    isBootingPhase:
      isBootingPhase(state.bootPhase),

    isTerminalPhase:
      isTerminalPhase(state.bootPhase),

    cycleId:
      safeInteger(state.bootCycleId, 0),

    updatedAt:
      safeText(state.bootUpdatedAt, ""),

    updatedAtMs:
      safeInteger(state.bootUpdatedAtMs, 0),

    startedAt:
      safeText(state.bootStartedAt, ""),

    readyAt:
      safeText(state.bootReadyAt, ""),

    errorAt:
      safeText(state.bootErrorAt, ""),

    fatalAt:
      safeText(state.bootFatalAt, ""),

    reason:
      safeText(state.lastBootReason, ""),

    hasError:
      Boolean(state.lastBootError),

    error:
      sanitizeErrorForSnapshot(state.lastBootError),
  });
}

export function getStoreBootStateSnapshot(Store) {
  const getterState =
    hasUsableTarget(Store)
      ? ensureObject(
          safeMethod(Store, "getState")
        )
      : {};

  const directState =
    ensureObject(Store?.state);

  const state = {
    ...directState,
    ...getterState,
  };

  return sanitizePayload({
    version: BOOT_STATE_VERSION,

    hasStore:
      Boolean(Store),

    hasState:
      isObject(Store?.state),

    hasActions:
      Boolean(Store?.actions),

    hasEvents:
      Boolean(Store?.events),

    hasSetState:
      isFunction(Store?.setState),

    hasPatchState:
      isFunction(Store?.patchState),

    ready:
      Boolean(state.ready),

    booted:
      Boolean(state.booted),

    booting:
      Boolean(state.booting),

    loading:
      Boolean(state.loading),

    fatal:
      Boolean(state.fatal),

    phase:
      normalizeBootPhase(state.bootPhase) || BOOT_PHASES.IDLE,

    isBootingPhase:
      isBootingPhase(state.bootPhase),

    isTerminalPhase:
      isTerminalPhase(state.bootPhase),

    cycleId:
      safeInteger(state.bootCycleId, 0),

    updatedAt:
      safeText(state.bootUpdatedAt, ""),

    updatedAtMs:
      safeInteger(state.bootUpdatedAtMs, 0),

    startedAt:
      safeText(state.bootStartedAt, ""),

    readyAt:
      safeText(state.bootReadyAt, ""),

    errorAt:
      safeText(state.bootErrorAt, ""),

    fatalAt:
      safeText(state.bootFatalAt, ""),

    reason:
      safeText(state.lastBootReason, ""),

    hasError:
      Boolean(state.lastBootError),

    error:
      sanitizeErrorForSnapshot(state.lastBootError),
  });
}

export function getDocumentBootStateSnapshot() {
  if (!isBrowser()) {
    return {
      version: BOOT_STATE_VERSION,
      hasDocument: false,
    };
  }

  const html =
    document.documentElement || null;

  const body =
    document.body || null;

  const read = (el) => {
    if (!el) {
      return {
        exists: false,
      };
    }

    return {
      exists: true,

      appLoading:
        safeText(el.dataset?.appLoading, ""),

      appReady:
        safeText(el.dataset?.appReady, ""),

      appBooting:
        safeText(el.dataset?.appBooting, ""),

      appState:
        safeText(el.dataset?.appState, ""),

      bootPhase:
        safeText(el.dataset?.bootPhase, ""),

      shellState:
        safeText(el.dataset?.shellState, ""),

      bootError:
        safeText(el.dataset?.bootError, ""),

      classes:
        safeArrayFromClassList(el.classList),

      className:
        safeText(el.className, ""),
    };
  };

  return sanitizePayload({
    version: BOOT_STATE_VERSION,

    hasDocument: true,

    html:
      read(html),

    body:
      read(body),
  });
}

export function getBootStateSnapshot(AppCore, Store) {
  const app =
    getAppBootStateSnapshot(AppCore);

  const store =
    getStoreBootStateSnapshot(Store);

  const documentState =
    getDocumentBootStateSnapshot();

  const phase =
    app.phase === BOOT_PHASES.FATAL ||
    store.phase === BOOT_PHASES.FATAL
      ? BOOT_PHASES.FATAL
      : app.phase === BOOT_PHASES.ERROR ||
          store.phase === BOOT_PHASES.ERROR
        ? BOOT_PHASES.ERROR
        : isBootingPhase(app.phase) ||
            isBootingPhase(store.phase)
          ? BOOT_PHASES.BOOTING
          : app.phase === BOOT_PHASES.READY &&
              (
                store.phase === BOOT_PHASES.READY ||
                !store.hasStore
              )
            ? BOOT_PHASES.READY
            : BOOT_PHASES.IDLE;

  return sanitizePayload({
    version: BOOT_STATE_VERSION,

    app,
    store,
    document: documentState,

    computed: {
      ready:
        Boolean(
          app.ready &&
          (
            store.ready ||
            !store.hasStore
          ) &&
          phase === BOOT_PHASES.READY
        ),

      booted:
        Boolean(
          app.booted &&
          (
            store.booted ||
            !store.hasStore
          ) &&
          phase === BOOT_PHASES.READY
        ),

      booting:
        Boolean(
          app.booting ||
          store.booting ||
          isBootingPhase(phase)
        ),

      loading:
        Boolean(
          app.loading ||
          store.loading ||
          isBootingPhase(phase)
        ),

      hasError:
        Boolean(
          app.hasError ||
          store.hasError ||
          phase === BOOT_PHASES.ERROR ||
          phase === BOOT_PHASES.FATAL
        ),

      fatal:
        Boolean(
          app.appFatal ||
          store.fatal ||
          phase === BOOT_PHASES.FATAL
        ),

      phase,

      cycleId:
        Math.max(
          safeInteger(app.cycleId, 0),
          safeInteger(store.cycleId, 0)
        ),
    },
  });
}

/* =========================================================
   DEBUG API
========================================================= */

function defineBootApiOnCore(AppCore, api) {
  if (
    !AppCore ||
    !api
  ) {
    return false;
  }

  return safeDefineValue(
    AppCore,
    "BootState",
    api
  );
}

export function exposeBootStateDebugApi(AppCore = null, Store = null) {
  const api = {
    version: BOOT_STATE_VERSION,

    BOOT_PHASES,
    BOOT_EVENTS,

    normalizeBootPhase,

    markAppBootState:
      (options = {}) =>
        markAppBootState(
          AppCore,
          options
        ),

    markStoreBootState:
      (options = {}) =>
        markStoreBootState(
          Store,
          options
        ),

    markBootStart:
      (options = {}) =>
        markBootStart(
          AppCore,
          Store,
          options
        ),

    markBootReady:
      (options = {}) =>
        markBootReady(
          AppCore,
          Store,
          options
        ),

    markBootError:
      (error = null, options = {}) =>
        markBootError(
          AppCore,
          Store,
          error,
          options
        ),

    markBootFatal:
      (error = null, options = {}) =>
        markBootFatal(
          AppCore,
          Store,
          error,
          options
        ),

    markRebootState:
      (options = {}) =>
        markRebootState(
          AppCore,
          Store,
          options
        ),

    isAppBooting:
      () =>
        isAppBooting(AppCore),

    isAppReady:
      () =>
        isAppReady(AppCore),

    isAppLoading:
      () =>
        isAppLoading(AppCore),

    hasBootError:
      () =>
        hasBootError(AppCore),

    getSnapshot:
      () =>
        getBootStateSnapshot(
          AppCore,
          Store
        ),

    getAppSnapshot:
      () =>
        getAppBootStateSnapshot(AppCore),

    getStoreSnapshot:
      () =>
        getStoreBootStateSnapshot(Store),

    getDocumentSnapshot:
      getDocumentBootStateSnapshot,

    resetSignatures:
      resetBootStateSignatures,
  };

  try {
    if (isBrowser()) {
      window.__ONION_BOOT_STATE__ = api;
    }
  } catch {}

  try {
    defineBootApiOnCore(
      AppCore,
      api
    );
  } catch {}

  if (!debugBridgeReady) {
    debugBridgeReady = true;

    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.DEBUG_READY,
      {
        version: BOOT_STATE_VERSION,
        at: nowPayload().iso,
      }
    );
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
