/* =========================================================
   Onion SPA - App Boot State
   Archivo: src/app/boot-state.js

   ONION SUPPORT · APP BOOT STATE
   BOOT FLAGS · LOADER FLAGS · STORE SYNC · DOCUMENT SYNC · EXTREME 13/10

   RESPONSABILIDADES:
   - Sincronizar estado de boot de AppCore.
   - Sincronizar estado de boot del Store.
   - Centralizar flags ready / booted / booting / loading.
   - Endurecer transiciones boot / reboot / error.
   - Evitar estados fantasma.
   - Sincronizar clases/datasets de html/body.
   - Emitir eventos de boot consistentes sin duplicar bus + window.
   - Exponer snapshots de diagnóstico seguros.
   - Mantener compatibilidad con loader.js, shell.js e index.js.

   HARDENING:
   - Tolerancia total a módulos parciales.
   - Idempotencia fuerte.
   - Compatible con AppCore.setState / patchState / mutación directa.
   - Compatible con Store.actions / Store.setState / patchState.
   - Cero throws accidentales.
   - Normalización estricta de fases.
   - Firma comparable para evitar tormenta de eventos.
   - Redacción de tokens en errores, stacks, URLs y snapshots.
   - No duplica AppCore.events + window.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const BOOT_PHASES =
  Object.freeze({
    IDLE:
      "idle",

    BOOTING:
      "booting",

    READY:
      "ready",

    ERROR:
      "error",
  });

export const BOOT_EVENTS =
  Object.freeze({
    APP_STATE:
      "app:boot:state",

    APP_START:
      "app:boot:start",

    APP_READY:
      "app:boot:ready",

    APP_ERROR:
      "app:boot:error",

    STORE_STATE:
      "store:boot:state",

    STORE_START:
      "store:boot:start",

    STORE_READY:
      "store:boot:ready",

    STORE_ERROR:
      "store:boot:error",

    BOOT_STATE:
      "boot:state",

    BOOT_START:
      "boot:start",

    BOOT_READY:
      "boot:ready",

    BOOT_ERROR:
      "boot:error",

    REBOOT:
      "boot:reboot",

    DOCUMENT_STATE:
      "app:boot:document-state",
  });

const SENSITIVE_QUERY_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
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
  ]);

const DOCUMENT_BOOT_CLASSES =
  Object.freeze([
    "app-booting",
    "app-loading",
    "app-ready",
    "app-error",
    "app-fatal",
  ]);

const APP_SIGNATURES =
  new WeakMap();

const STORE_SIGNATURES =
  new WeakMap();

const DOCUMENT_SIGNATURES =
  new WeakMap();

let fallbackAppSignature =
  "";

let fallbackStoreSignature =
  "";

let fallbackDocumentSignature =
  "";

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
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
      value.trim().toLowerCase();

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

  const text =
    String(value).trim();

  return text || fallback;
}

function safeInteger(value, fallback = 0) {
  const number =
    Number(value);

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
    iso =
      new Date(ms).toISOString();
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
        Array.isArray(args)
          ? args
          : []
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
        configurable:
          true,
        enumerable:
          false,
        writable:
          true,
      }
    );

    return true;
  } catch {}

  try {
    target[key] =
      value;

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

/* =========================================================
   REDACTION
========================================================= */

function redactSensitiveText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
      const escaped =
        String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    }

    output =
      output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  return output;
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
      redactSensitiveText(
        normalized.message
      ),

    code:
      redactSensitiveText(
        normalized.code
      ),

    stack:
      normalized.stack
        ? redactSensitiveText(normalized.stack)
        : "",
  };
}

/* =========================================================
   EVENTS
========================================================= */

function safeWindowDispatch(eventName, detail = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(
        eventName,
        {
          detail,
        }
      )
    );

    return true;
  } catch {}

  return false;
}

function emitCoreEvent(AppCore, eventName, detail = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    ensureObject(options);

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        name,
        detail
      );

      busEmitted =
        true;
    }
  } catch {}

  /*
    Evita duplicar AppCore.events + window.
    window queda como fallback real o emisión forzada.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return (
      safeWindowDispatch(
        name,
        detail
      ) ||
      busEmitted
    );
  }

  return busEmitted;
}

function emitStoreEvent(Store, eventName, detail = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    ensureObject(options);

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(Store?.events?.emit)) {
      busAvailable =
        true;

      Store.events.emit(
        name,
        detail
      );

      busEmitted =
        true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return (
      safeWindowDispatch(
        name,
        detail
      ) ||
      busEmitted
    );
  }

  return busEmitted;
}

/* =========================================================
   ERROR / SIGNATURE
========================================================= */

function normalizeError(error) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return {
      name:
        "BootError",

      message:
        redactSensitiveText(error),

      code:
        "BOOT_ERROR",

      stack:
        "",
    };
  }

  const object =
    ensureObject(error);

  const payload = {
    name:
      safeText(
        object.name,
        "BootError"
      ),

    message:
      redactSensitiveText(
        safeText(
          object.message ||
            object.statusText ||
            object.detail ||
            object.reason?.message ||
            object.reason ||
            object.error ||
            "Error durante el boot de la aplicación.",
          "Error durante el boot de la aplicación."
        )
      ),

    code:
      redactSensitiveText(
        safeText(
          object.code ||
            object.status ||
            object.statusCode ||
            object.data?.code ||
            object.response?.status ||
            "BOOT_ERROR",
          "BOOT_ERROR"
        )
      ),

    stack:
      object.stack
        ? redactSensitiveText(
            safeText(object.stack, "")
          )
        : "",
  };

  return payload;
}

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
    fallbackStoreSignature =
      value;

    return;
  }

  if (type === "document") {
    fallbackDocumentSignature =
      value;

    return;
  }

  fallbackAppSignature =
    value;
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
    return String(Date.now());
  }
}

function getDocumentComparableSignature(payload = {}) {
  const data = {
    booting:
      Boolean(payload.booting),

    loading:
      Boolean(payload.loading),

    ready:
      Boolean(payload.ready),

    error:
      Boolean(payload.lastBootError),

    phase:
      safeText(payload.bootPhase, ""),
  };

  try {
    return JSON.stringify(data);
  } catch {
    return String(Date.now());
  }
}

/* =========================================================
   PREVIOUS STATE
========================================================= */

function getPreviousAppBootState(AppCore) {
  const state =
    ensureObject(AppCore?.state);

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

    bootPhase:
      safeText(
        state.bootPhase,
        BOOT_PHASES.IDLE
      ),

    bootCycleId:
      safeInteger(
        state.bootCycleId,
        0
      ),

    lastBootReason:
      safeText(
        state.lastBootReason,
        ""
      ),

    lastBootError:
      state.lastBootError || null,

    bootStartedAt:
      safeText(
        state.bootStartedAt,
        ""
      ),

    bootReadyAt:
      safeText(
        state.bootReadyAt,
        ""
      ),

    bootErrorAt:
      safeText(
        state.bootErrorAt,
        ""
      ),
  };
}

function getPreviousStoreBootState(Store) {
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

    bootPhase:
      safeText(
        state.bootPhase,
        BOOT_PHASES.IDLE
      ),

    bootCycleId:
      safeInteger(
        state.bootCycleId,
        0
      ),

    lastBootReason:
      safeText(
        state.lastBootReason,
        ""
      ),

    lastBootError:
      state.lastBootError || null,

    bootStartedAt:
      safeText(
        state.bootStartedAt,
        ""
      ),

    bootReadyAt:
      safeText(
        state.bootReadyAt,
        ""
      ),

    bootErrorAt:
      safeText(
        state.bootErrorAt,
        ""
      ),
  };
}

/* =========================================================
   NORMALIZERS
========================================================= */

export function normalizeBootPhase(value = "") {
  const phase =
    safeText(value, "").toLowerCase();

  if (
    phase === BOOT_PHASES.IDLE ||
    phase === BOOT_PHASES.BOOTING ||
    phase === BOOT_PHASES.READY ||
    phase === BOOT_PHASES.ERROR
  ) {
    return phase;
  }

  return "";
}

function inferPhaseFromFlags({
  booted = false,
  booting = false,
  ready = false,
  loading = false,
  error = null,
} = {}) {
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

function normalizeAppBootPayload(options = {}, previous = {}) {
  const input =
    ensureObject(options);

  const requestedPhase =
    normalizeBootPhase(
      input.phase ||
        input.bootPhase ||
        ""
    );

  const hasError =
    (
      hasOwn(input, "error") &&
      Boolean(input.error)
    ) ||
    requestedPhase === BOOT_PHASES.ERROR ||
    input.fatal === true;

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
        hasError ? input.error || true : null,
    });

  if (
    hasError ||
    phase === BOOT_PHASES.ERROR
  ) {
    booted =
      false;

    ready =
      false;

    booting =
      false;

    loading =
      false;

    phase =
      BOOT_PHASES.ERROR;
  } else if (
    phase === BOOT_PHASES.BOOTING ||
    booting
  ) {
    booted =
      false;

    ready =
      false;

    booting =
      true;

    loading =
      true;

    phase =
      BOOT_PHASES.BOOTING;
  } else if (
    phase === BOOT_PHASES.READY ||
    booted ||
    ready
  ) {
    booted =
      true;

    ready =
      true;

    booting =
      false;

    loading =
      false;

    phase =
      BOOT_PHASES.READY;
  } else {
    booted =
      false;

    ready =
      false;

    booting =
      false;

    loading =
      false;

    phase =
      BOOT_PHASES.IDLE;
  }

  const cycleId =
    hasOwn(input, "cycleId")
      ? safeInteger(input.cycleId, 0)
      : hasOwn(input, "bootCycleId")
        ? safeInteger(input.bootCycleId, 0)
        : safeInteger(previous.bootCycleId, 0);

  const reason =
    safeText(
      input.reason ||
        input.source ||
        input.action ||
        input.lastBootReason,
      phase
    );

  const clock =
    nowPayload();

  const startedAt =
    phase === BOOT_PHASES.BOOTING
      ? clock.iso
      : safeText(previous.bootStartedAt, "");

  const readyAt =
    phase === BOOT_PHASES.READY
      ? clock.iso
      : safeText(previous.bootReadyAt, "");

  const errorAt =
    phase === BOOT_PHASES.ERROR
      ? clock.iso
      : safeText(previous.bootErrorAt, "");

  const error =
    phase === BOOT_PHASES.ERROR || hasError
      ? normalizeError(input.error || previous.lastBootError)
      : null;

  return {
    booted,
    booting,
    ready,
    loading,

    appReady:
      ready,

    appBooting:
      booting,

    bootPhase:
      phase,

    bootCycleId:
      cycleId,

    bootUpdatedAt:
      clock.iso,

    bootUpdatedAtMs:
      clock.ms,

    bootStartedAt:
      startedAt,

    bootReadyAt:
      readyAt,

    bootErrorAt:
      errorAt,

    lastBootReason:
      reason,

    lastBootError:
      error,
  };
}

function normalizeStoreBootPayload(options = {}, previous = {}) {
  const input =
    ensureObject(options);

  const requestedPhase =
    normalizeBootPhase(
      input.phase ||
        input.bootPhase ||
        ""
    );

  const hasError =
    (
      hasOwn(input, "error") &&
      Boolean(input.error)
    ) ||
    requestedPhase === BOOT_PHASES.ERROR ||
    input.fatal === true;

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
        hasError ? input.error || true : null,
    });

  if (
    hasError ||
    phase === BOOT_PHASES.ERROR
  ) {
    ready =
      false;

    booted =
      false;

    booting =
      false;

    loading =
      false;

    phase =
      BOOT_PHASES.ERROR;
  } else if (
    phase === BOOT_PHASES.READY ||
    ready ||
    booted
  ) {
    ready =
      true;

    booted =
      true;

    booting =
      false;

    loading =
      false;

    phase =
      BOOT_PHASES.READY;
  } else if (
    phase === BOOT_PHASES.BOOTING ||
    booting ||
    loading
  ) {
    ready =
      false;

    booted =
      false;

    booting =
      true;

    loading =
      true;

    phase =
      BOOT_PHASES.BOOTING;
  } else {
    ready =
      false;

    booted =
      false;

    booting =
      false;

    loading =
      false;

    phase =
      BOOT_PHASES.IDLE;
  }

  const cycleId =
    hasOwn(input, "cycleId")
      ? safeInteger(input.cycleId, 0)
      : hasOwn(input, "bootCycleId")
        ? safeInteger(input.bootCycleId, 0)
        : safeInteger(previous.bootCycleId, 0);

  const reason =
    safeText(
      input.reason ||
        input.source ||
        input.action ||
        input.lastBootReason,
      phase
    );

  const clock =
    nowPayload();

  const startedAt =
    phase === BOOT_PHASES.BOOTING
      ? clock.iso
      : safeText(previous.bootStartedAt, "");

  const readyAt =
    phase === BOOT_PHASES.READY
      ? clock.iso
      : safeText(previous.bootReadyAt, "");

  const errorAt =
    phase === BOOT_PHASES.ERROR
      ? clock.iso
      : safeText(previous.bootErrorAt, "");

  const error =
    phase === BOOT_PHASES.ERROR || hasError
      ? normalizeError(input.error || previous.lastBootError)
      : null;

  return {
    ready,
    booted,
    booting,
    loading,

    bootPhase:
      phase,

    bootCycleId:
      cycleId,

    bootUpdatedAt:
      clock.iso,

    bootUpdatedAtMs:
      clock.ms,

    bootStartedAt:
      startedAt,

    bootReadyAt:
      readyAt,

    bootErrorAt:
      errorAt,

    lastBootReason:
      reason,

    lastBootError:
      error,
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

    el.dataset[key] =
      String(value);

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

function removeDocumentBootClasses(root) {
  if (!root) {
    return false;
  }

  try {
    for (const className of DOCUMENT_BOOT_CLASSES) {
      root.classList.remove(className);
    }

    return true;
  } catch {}

  return false;
}

export function syncDocumentBootState(payload = {}, options = {}) {
  if (!isBrowser()) {
    return false;
  }

  const opts =
    ensureObject(options);

  const phase =
    normalizeBootPhase(payload.bootPhase) ||
    BOOT_PHASES.IDLE;

  const booting =
    phase === BOOT_PHASES.BOOTING ||
    Boolean(payload.booting);

  const ready =
    phase === BOOT_PHASES.READY ||
    Boolean(payload.ready);

  const error =
    phase === BOOT_PHASES.ERROR ||
    Boolean(payload.lastBootError);

  const loading =
    Boolean(payload.loading || booting);

  const fatal =
    Boolean(error && opts.fatal !== false);

  const appState =
    booting
      ? "booting"
      : error
        ? "fatal"
        : ready
          ? "ready"
          : "idle";

  const shellState =
    booting
      ? "booting"
      : error
        ? "fatal"
        : ready
          ? "ready"
          : "idle";

  const roots =
    [
      document.documentElement,
      document.body,
    ].filter(Boolean);

  for (const root of roots) {
    removeDocumentBootClasses(root);

    toggleClass(
      root,
      "app-booting",
      booting
    );

    toggleClass(
      root,
      "app-loading",
      loading
    );

    toggleClass(
      root,
      "app-ready",
      ready || error
    );

    toggleClass(
      root,
      "app-error",
      error
    );

    toggleClass(
      root,
      "app-fatal",
      fatal
    );

    setDataset(
      root,
      "appLoading",
      loading ? "true" : "false"
    );

    setDataset(
      root,
      "appReady",
      ready ? "true" : "false"
    );

    setDataset(
      root,
      "appBooting",
      booting ? "true" : "false"
    );

    setDataset(
      root,
      "bootPhase",
      phase
    );

    setDataset(
      root,
      "appState",
      appState
    );

    setDataset(
      root,
      "shellState",
      shellState
    );

    if (error) {
      setDataset(
        root,
        "bootError",
        "true"
      );
    } else {
      setDataset(
        root,
        "bootError",
        "false"
      );
    }
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
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.DOCUMENT_STATE,
      {
        phase:
          payload.bootPhase,

        booting:
          Boolean(payload.booting),

        loading:
          Boolean(payload.loading),

        ready:
          Boolean(payload.ready),

        error:
          Boolean(payload.lastBootError),

        changed,
      }
    );
  }

  return changed;
}

/* =========================================================
   APPLY
========================================================= */

function applyAppBootPayload(AppCore, payload, options = {}) {
  const state =
    ensureMutableState(
      AppCore,
      "state"
    );

  /*
    Mutación directa primero para que los módulos que leen AppCore.state
    inmediatamente después vean el estado actualizado.
  */
  safeAssign(
    state,
    payload
  );

  safeMethod(
    AppCore,
    "setState",
    [payload]
  );

  safeMethod(
    AppCore,
    "patchState",
    [payload]
  );

  try {
    if (payload.loading !== undefined) {
      safeMethod(
        AppCore,
        "setLoading",
        [payload.loading]
      );
    }
  } catch {}

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

function applyStoreBootPayload(Store, payload) {
  const state =
    ensureMutableState(
      Store,
      "state"
    );

  safeAssign(
    state,
    payload
  );

  const actions =
    ensureObject(Store?.actions);

  safeMethod(
    actions,
    "markReady",
    [payload.ready, payload]
  );

  safeMethod(
    actions,
    "markBooted",
    [payload.booted, payload]
  );

  safeMethod(
    actions,
    "markBooting",
    [payload.booting, payload]
  );

  safeMethod(
    actions,
    "setLoading",
    [payload.loading, payload]
  );

  safeMethod(
    actions,
    "markLoading",
    [payload.loading, payload]
  );

  safeMethod(
    actions,
    "set",
    [payload]
  );

  safeMethod(
    actions,
    "patch",
    [payload]
  );

  safeMethod(
    Store,
    "setState",
    [payload]
  );

  safeMethod(
    Store,
    "patchState",
    [payload]
  );

  safeMethod(
    Store,
    "set",
    [payload]
  );

  safeMethod(
    Store,
    "patch",
    [payload]
  );

  return payload;
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

  const eventPayload = {
    ...payload,
    changed,
    previous,
  };

  if (
    changed ||
    safeBool(options?.forceEmit) ||
    safeBool(options?.emitUnchanged)
  ) {
    emitCoreEvent(
      AppCore,
      BOOT_EVENTS.APP_STATE,
      eventPayload
    );

    if (payload.bootPhase === BOOT_PHASES.BOOTING) {
      emitCoreEvent(
        AppCore,
        BOOT_EVENTS.APP_START,
        eventPayload
      );
    }

    if (payload.bootPhase === BOOT_PHASES.READY) {
      emitCoreEvent(
        AppCore,
        BOOT_EVENTS.APP_READY,
        eventPayload
      );
    }

    if (payload.bootPhase === BOOT_PHASES.ERROR) {
      emitCoreEvent(
        AppCore,
        BOOT_EVENTS.APP_ERROR,
        eventPayload
      );
    }
  }

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
    payload
  );

  const eventPayload = {
    ...payload,
    changed,
    previous,
  };

  if (
    changed ||
    safeBool(options?.forceEmit) ||
    safeBool(options?.emitUnchanged)
  ) {
    emitStoreEvent(
      Store,
      BOOT_EVENTS.STORE_STATE,
      eventPayload
    );

    if (payload.bootPhase === BOOT_PHASES.BOOTING) {
      emitStoreEvent(
        Store,
        BOOT_EVENTS.STORE_START,
        eventPayload
      );
    }

    if (payload.bootPhase === BOOT_PHASES.READY) {
      emitStoreEvent(
        Store,
        BOOT_EVENTS.STORE_READY,
        eventPayload
      );
    }

    if (payload.bootPhase === BOOT_PHASES.ERROR) {
      emitStoreEvent(
        Store,
        BOOT_EVENTS.STORE_ERROR,
        eventPayload
      );
    }
  }

  return eventPayload;
}

/* =========================================================
   COMBINED HELPERS
========================================================= */

export function markBootStart(AppCore, Store, options = {}) {
  const input =
    ensureObject(options);

  const payload = {
    ...input,

    booted:
      false,

    booting:
      true,

    ready:
      false,

    loading:
      true,

    phase:
      BOOT_PHASES.BOOTING,

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

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.BOOT_STATE,
    snapshot
  );

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.BOOT_START,
    snapshot
  );

  return snapshot;
}

export function markBootReady(AppCore, Store, options = {}) {
  const input =
    ensureObject(options);

  const payload = {
    ...input,

    booted:
      true,

    booting:
      false,

    ready:
      true,

    loading:
      false,

    phase:
      BOOT_PHASES.READY,

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

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.BOOT_STATE,
    snapshot
  );

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.BOOT_READY,
    snapshot
  );

  return snapshot;
}

export function markBootError(AppCore, Store, error = null, options = {}) {
  const input =
    ensureObject(options);

  const payload = {
    ...input,

    booted:
      false,

    booting:
      false,

    ready:
      false,

    loading:
      false,

    phase:
      BOOT_PHASES.ERROR,

    error,

    fatal:
      input.fatal !== false,

    reason:
      safeText(
        input.reason,
        "boot-error"
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
    BOOT_EVENTS.BOOT_ERROR,
    snapshot
  );

  return snapshot;
}

export function markRebootState(AppCore, Store, options = {}) {
  const input =
    ensureObject(options);

  const payload = {
    ...input,

    booted:
      false,

    booting:
      false,

    ready:
      false,

    loading:
      false,

    phase:
      BOOT_PHASES.IDLE,

    lastBootError:
      null,

    error:
      null,

    fatal:
      false,

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
  const state =
    ensureObject(AppCore?.state);

  return Boolean(
    state.booting ||
      state.appBooting ||
      state.bootPhase === BOOT_PHASES.BOOTING
  );
}

export function isAppReady(AppCore) {
  const state =
    ensureObject(AppCore?.state);

  return Boolean(
    state.ready ||
      state.appReady ||
      state.booted ||
      state.bootPhase === BOOT_PHASES.READY
  );
}

export function hasBootError(AppCore) {
  const state =
    ensureObject(AppCore?.state);

  return Boolean(
    state.lastBootError ||
      state.bootPhase === BOOT_PHASES.ERROR
  );
}

export function resetBootStateSignatures() {
  fallbackAppSignature =
    "";

  fallbackStoreSignature =
    "";

  fallbackDocumentSignature =
    "";

  return true;
}

/* =========================================================
   DEBUG SNAPSHOTS
========================================================= */

export function getAppBootStateSnapshot(AppCore) {
  const state =
    ensureObject(AppCore?.state);

  return {
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

    phase:
      safeText(
        state.bootPhase,
        BOOT_PHASES.IDLE
      ),

    cycleId:
      safeInteger(
        state.bootCycleId,
        0
      ),

    updatedAt:
      safeText(
        state.bootUpdatedAt,
        ""
      ),

    updatedAtMs:
      safeInteger(
        state.bootUpdatedAtMs,
        0
      ),

    startedAt:
      safeText(
        state.bootStartedAt,
        ""
      ),

    readyAt:
      safeText(
        state.bootReadyAt,
        ""
      ),

    errorAt:
      safeText(
        state.bootErrorAt,
        ""
      ),

    reason:
      safeText(
        state.lastBootReason,
        ""
      ),

    hasError:
      Boolean(state.lastBootError),

    error:
      sanitizeErrorForSnapshot(
        state.lastBootError
      ),
  };
}

export function getStoreBootStateSnapshot(Store) {
  const getterState =
    ensureObject(
      safeMethod(Store, "getState")
    );

  const directState =
    ensureObject(Store?.state);

  const state = {
    ...directState,
    ...getterState,
  };

  return {
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

    phase:
      safeText(
        state.bootPhase,
        BOOT_PHASES.IDLE
      ),

    cycleId:
      safeInteger(
        state.bootCycleId,
        0
      ),

    updatedAt:
      safeText(
        state.bootUpdatedAt,
        ""
      ),

    updatedAtMs:
      safeInteger(
        state.bootUpdatedAtMs,
        0
      ),

    startedAt:
      safeText(
        state.bootStartedAt,
        ""
      ),

    readyAt:
      safeText(
        state.bootReadyAt,
        ""
      ),

    errorAt:
      safeText(
        state.bootErrorAt,
        ""
      ),

    reason:
      safeText(
        state.lastBootReason,
        ""
      ),

    hasError:
      Boolean(state.lastBootError),

    error:
      sanitizeErrorForSnapshot(
        state.lastBootError
      ),
  };
}

export function getDocumentBootStateSnapshot() {
  if (!isBrowser()) {
    return {
      hasDocument:
        false,
    };
  }

  const html =
    document.documentElement || null;

  const body =
    document.body || null;

  const read = (el) => {
    if (!el) {
      return {
        exists:
          false,
      };
    }

    return {
      exists:
        true,

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

  return {
    hasDocument:
      true,

    html:
      read(html),

    body:
      read(body),
  };
}

export function getBootStateSnapshot(AppCore, Store) {
  const app =
    getAppBootStateSnapshot(AppCore);

  const store =
    getStoreBootStateSnapshot(Store);

  const documentState =
    getDocumentBootStateSnapshot();

  const phase =
    app.phase === BOOT_PHASES.ERROR ||
    store.phase === BOOT_PHASES.ERROR
      ? BOOT_PHASES.ERROR
      : app.phase === BOOT_PHASES.BOOTING ||
          store.phase === BOOT_PHASES.BOOTING
        ? BOOT_PHASES.BOOTING
        : app.phase === BOOT_PHASES.READY &&
            store.phase === BOOT_PHASES.READY
          ? BOOT_PHASES.READY
          : app.phase === BOOT_PHASES.READY &&
              !store.hasStore
            ? BOOT_PHASES.READY
            : BOOT_PHASES.IDLE;

  return {
    app,
    store,
    document:
      documentState,

    computed: {
      ready:
        Boolean(
          app.ready &&
            (
              store.ready ||
              !store.hasStore
            )
        ),

      booted:
        Boolean(
          app.booted &&
            (
              store.booted ||
              !store.hasStore
            )
        ),

      booting:
        Boolean(
          app.booting ||
            store.booting
        ),

      loading:
        Boolean(
          app.loading ||
            store.loading
        ),

      hasError:
        Boolean(
          app.hasError ||
            store.hasError
        ),

      phase,

      cycleId:
        Math.max(
          safeInteger(app.cycleId, 0),
          safeInteger(store.cycleId, 0)
        ),
    },
  };
}

/* =========================================================
   DEBUG API
========================================================= */

export function exposeBootStateDebugApi(AppCore = null, Store = null) {
  const api = {
    BOOT_PHASES,
    BOOT_EVENTS,

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

    markRebootState:
      (options = {}) =>
        markRebootState(
          AppCore,
          Store,
          options
        ),

    getSnapshot:
      () =>
        getBootStateSnapshot(
          AppCore,
          Store
        ),

    resetSignatures:
      resetBootStateSignatures,
  };

  try {
    if (isBrowser()) {
      window.__ONION_BOOT_STATE__ =
        api;
    }
  } catch {}

  try {
    defineBootApiOnCore(
      AppCore,
      api
    );
  } catch {}

  return api;
}

function defineBootApiOnCore(AppCore, api) {
  if (!AppCore || !api) {
    return false;
  }

  return safeDefineValue(
    AppCore,
    "BootState",
    api
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  BOOT_PHASES,
  BOOT_EVENTS,

  normalizeBootPhase,

  markAppBootState,
  markStoreBootState,

  markBootStart,
  markBootReady,
  markBootError,
  markRebootState,

  isAppBooting,
  isAppReady,
  hasBootError,

  syncDocumentBootState,

  getAppBootStateSnapshot,
  getStoreBootStateSnapshot,
  getDocumentBootStateSnapshot,
  getBootStateSnapshot,

  resetBootStateSignatures,
  exposeBootStateDebugApi,
};
