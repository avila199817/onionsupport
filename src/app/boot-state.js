/* =========================================================
   Onion SPA - App Boot State
   Archivo: src/app/boot-state.js

   ONION SUPPORT · APP BOOT STATE
   BOOT FLAGS · LOADER FLAGS · STORE SYNC · EXTREME 10/10

   RESPONSABILIDADES:
   - Sincronizar estado de boot de AppCore.
   - Sincronizar estado de boot del Store.
   - Centralizar flags ready / booted / booting / loading.
   - Endurecer transiciones boot / reboot / error.
   - Evitar estados fantasma.
   - Sincronizar clases/datasets de html/body.
   - Emitir eventos de boot consistentes sin duplicar bus + window.
   - Exponer snapshots de diagnóstico seguros.

   HARDENING:
   - Tolerancia total a módulos parciales.
   - Idempotencia fuerte.
   - Compatible con AppCore.setState / patchState / mutación directa.
   - Compatible con Store.actions / Store.setState / patchState.
   - Cero throws accidentales.
   - Normalización estricta de fases.
   - Firma comparable para evitar tormenta de eventos.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const BOOT_PHASES = Object.freeze({
  IDLE: "idle",
  BOOTING: "booting",
  READY: "ready",
  ERROR: "error",
});

export const BOOT_EVENTS = Object.freeze({
  APP_STATE: "app:boot:state",
  APP_START: "app:boot:start",
  APP_READY: "app:boot:ready",
  APP_ERROR: "app:boot:error",

  STORE_STATE: "store:boot:state",
  STORE_START: "store:boot:start",
  STORE_READY: "store:boot:ready",
  STORE_ERROR: "store:boot:error",

  BOOT_STATE: "boot:state",
  BOOT_START: "boot:start",
  BOOT_READY: "boot:ready",
  BOOT_ERROR: "boot:error",
  REBOOT: "boot:reboot",
});

const APP_SIGNATURES = new WeakMap();
const STORE_SIGNATURES = new WeakMap();

let fallbackAppSignature = "";
let fallbackStoreSignature = "";

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

function isWeakMapKey(value) {
  return (
    isObject(value) ||
    typeof value === "function"
  );
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
    return Object.prototype.hasOwnProperty.call(value, key);
  } catch {
    return false;
  }
}

function safeBool(value, fallback = false) {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
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

  const text = String(value).trim();

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
  const ms = Date.now();

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
        Array.isArray(args)
          ? args
          : []
      );
    }
  } catch {}

  return undefined;
}

function safeMethod(target, methodName, args = []) {
  const object = ensureObject(target);

  return safeInvoke(
    object?.[methodName],
    object,
    args
  );
}

function safeAssign(target, payload) {
  try {
    if (isObject(target)) {
      Object.assign(target, payload);
      return true;
    }
  } catch {}

  return false;
}

function safeWindowDispatch(eventName, detail = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail,
      })
    );

    return true;
  } catch {}

  return false;
}

/* =========================================================
   EVENTS
========================================================= */

function emitCoreEvent(AppCore, eventName, detail = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts = ensureObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(name, detail);
      busEmitted = true;
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
    return safeWindowDispatch(name, detail) || busEmitted;
  }

  return busEmitted;
}

function emitStoreEvent(Store, eventName, detail = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts = ensureObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(Store?.events?.emit)) {
      busAvailable = true;
      Store.events.emit(name, detail);
      busEmitted = true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return safeWindowDispatch(name, detail) || busEmitted;
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
      name: "BootError",
      message: error,
      code: "BOOT_ERROR",
    };
  }

  const object = ensureObject(error);

  const payload = {
    name:
      safeText(
        object.name,
        "BootError"
      ),

    message:
      safeText(
        object.message,
        "Error durante el boot de la aplicación."
      ),

    code:
      safeText(
        object.code ||
          object.status ||
          object.statusCode,
        "BOOT_ERROR"
      ),
  };

  if (object.stack) {
    payload.stack = safeText(object.stack, "");
  }

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
      map.set(key, value);
      return;
    }
  } catch {}

  if (type === "store") {
    fallbackStoreSignature = value;
    return;
  }

  fallbackAppSignature = value;
}

function getComparableSignature(payload = {}) {
  const data = {
    booted: Boolean(payload.booted),
    booting: Boolean(payload.booting),
    ready: Boolean(payload.ready),
    loading: Boolean(payload.loading),
    bootPhase: safeText(payload.bootPhase, ""),
    bootCycleId: safeInteger(payload.bootCycleId, 0),
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
   PREVIOUS STATE
========================================================= */

function getPreviousAppBootState(AppCore) {
  const state = ensureObject(AppCore?.state);

  return {
    booted: Boolean(state.booted),
    booting: Boolean(state.booting),
    ready: Boolean(state.ready),
    loading: Boolean(state.loading),

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
  };
}

function getPreviousStoreBootState(Store) {
  const stateFromGetter = ensureObject(
    safeMethod(Store, "getState")
  );

  const directState = ensureObject(Store?.state);

  const state = {
    ...directState,
    ...stateFromGetter,
  };

  return {
    ready: Boolean(state.ready),
    booted: Boolean(state.booted),
    booting: Boolean(state.booting),
    loading: Boolean(state.loading),

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
  };
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeBootPhase(value = "") {
  const phase = safeText(value, "").toLowerCase();

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

function normalizeAppBootPayload(options = {}, previous = {}) {
  const input = ensureObject(options);

  let booted = hasOwn(input, "booted")
    ? safeBool(input.booted)
    : Boolean(previous.booted);

  let booting = hasOwn(input, "booting")
    ? safeBool(input.booting)
    : Boolean(previous.booting);

  let ready = hasOwn(input, "ready")
    ? safeBool(input.ready)
    : Boolean(previous.ready || booted);

  let loading = hasOwn(input, "loading")
    ? safeBool(input.loading)
    : Boolean(previous.loading || booting);

  const requestedPhase = normalizeBootPhase(
    input.phase || input.bootPhase || ""
  );

  const hasError =
    hasOwn(input, "error") &&
    Boolean(input.error);

  let phase =
    requestedPhase ||
    safeText(previous.bootPhase, BOOT_PHASES.IDLE);

  if (
    hasError ||
    requestedPhase === BOOT_PHASES.ERROR
  ) {
    booted = false;
    ready = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.ERROR;
  } else if (booting) {
    booted = false;
    ready = false;
    loading = true;
    phase = BOOT_PHASES.BOOTING;
  } else if (
    booted ||
    ready ||
    requestedPhase === BOOT_PHASES.READY
  ) {
    booted = true;
    ready = true;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.READY;
  } else if (requestedPhase === BOOT_PHASES.IDLE) {
    booted = false;
    ready = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.IDLE;
  } else {
    booted = false;
    ready = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.IDLE;
  }

  const cycleId = hasOwn(input, "cycleId")
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

  const clock = nowPayload();

  return {
    booted,
    booting,
    ready,
    loading,

    bootPhase: phase,
    bootCycleId: cycleId,

    bootUpdatedAt: clock.iso,
    bootUpdatedAtMs: clock.ms,

    lastBootReason: reason,

    lastBootError:
      phase === BOOT_PHASES.ERROR || hasError
        ? normalizeError(input.error)
        : null,
  };
}

function normalizeStoreBootPayload(options = {}, previous = {}) {
  const input = ensureObject(options);

  let ready = hasOwn(input, "ready")
    ? safeBool(input.ready)
    : Boolean(previous.ready);

  let booted = hasOwn(input, "booted")
    ? safeBool(input.booted)
    : Boolean(previous.booted || ready);

  let booting = hasOwn(input, "booting")
    ? safeBool(input.booting)
    : Boolean(previous.booting);

  let loading = hasOwn(input, "loading")
    ? safeBool(input.loading)
    : Boolean(previous.loading || booting);

  const requestedPhase = normalizeBootPhase(
    input.phase || input.bootPhase || ""
  );

  const hasError =
    hasOwn(input, "error") &&
    Boolean(input.error);

  let phase =
    requestedPhase ||
    safeText(previous.bootPhase, BOOT_PHASES.IDLE);

  if (
    hasError ||
    requestedPhase === BOOT_PHASES.ERROR
  ) {
    ready = false;
    booted = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.ERROR;
  } else if (
    ready ||
    booted ||
    requestedPhase === BOOT_PHASES.READY
  ) {
    ready = true;
    booted = true;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.READY;
  } else if (
    booting ||
    loading ||
    requestedPhase === BOOT_PHASES.BOOTING
  ) {
    ready = false;
    booted = false;
    booting = true;
    loading = true;
    phase = BOOT_PHASES.BOOTING;
  } else {
    ready = false;
    booted = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.IDLE;
  }

  const cycleId = hasOwn(input, "cycleId")
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

  const clock = nowPayload();

  return {
    ready,
    booted,
    booting,
    loading,

    bootPhase: phase,
    bootCycleId: cycleId,

    bootUpdatedAt: clock.iso,
    bootUpdatedAtMs: clock.ms,

    lastBootReason: reason,

    lastBootError:
      phase === BOOT_PHASES.ERROR || hasError
        ? normalizeError(input.error)
        : null,
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
    el.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {}

  return false;
}

function syncDocumentBootState(payload = {}) {
  if (!isBrowser()) {
    return false;
  }

  const phase = safeText(payload.bootPhase, BOOT_PHASES.IDLE);

  const booting = phase === BOOT_PHASES.BOOTING || Boolean(payload.booting);
  const ready = phase === BOOT_PHASES.READY || Boolean(payload.ready);
  const error = phase === BOOT_PHASES.ERROR || Boolean(payload.lastBootError);
  const loading = Boolean(payload.loading || booting);

  const roots = [
    document.documentElement,
    document.body,
  ].filter(Boolean);

  for (const root of roots) {
    toggleClass(root, "app-booting", booting);
    toggleClass(root, "app-loading", loading);
    toggleClass(root, "app-ready", ready || error);
    toggleClass(root, "app-error", error);

    setDataset(root, "appLoading", loading ? "true" : "false");
    setDataset(root, "appReady", ready ? "true" : "false");
    setDataset(root, "appBooting", booting ? "true" : "false");
    setDataset(root, "bootPhase", phase);

    if (root === document.body) {
      setDataset(
        root,
        "shellState",
        booting
          ? "booting"
          : error
            ? "error"
            : ready
              ? "ready"
              : "idle"
      );
    }
  }

  return true;
}

/* =========================================================
   APPLY
========================================================= */

function applyAppBootPayload(AppCore, payload) {
  /*
    Mutación directa primero para que los módulos que leen AppCore.state
    inmediatamente después vean el estado actualizado.
  */
  safeAssign(AppCore?.state, payload);

  safeMethod(AppCore, "setState", [payload]);
  safeMethod(AppCore, "patchState", [payload]);

  syncDocumentBootState(payload);

  return payload;
}

function applyStoreBootPayload(Store, payload) {
  safeAssign(Store?.state, payload);

  const actions = ensureObject(Store?.actions);

  safeMethod(actions, "markReady", [payload.ready]);
  safeMethod(actions, "markBooted", [payload.booted]);
  safeMethod(actions, "markBooting", [payload.booting]);
  safeMethod(actions, "setLoading", [payload.loading]);
  safeMethod(actions, "markLoading", [payload.loading]);
  safeMethod(actions, "set", [payload]);

  safeMethod(Store, "setState", [payload]);
  safeMethod(Store, "patchState", [payload]);
  safeMethod(Store, "set", [payload]);
  safeMethod(Store, "patch", [payload]);

  return payload;
}

/* =========================================================
   APP STATE
========================================================= */

export function markAppBootState(AppCore, options = {}) {
  const previous = getPreviousAppBootState(AppCore);

  const payload = normalizeAppBootPayload(
    options,
    previous
  );

  const previousSignature = getSignatureStore(
    APP_SIGNATURES,
    AppCore,
    fallbackAppSignature
  );

  const signature = getComparableSignature(payload);
  const changed = signature !== previousSignature;

  setSignatureStore(
    APP_SIGNATURES,
    AppCore,
    signature,
    "app"
  );

  applyAppBootPayload(AppCore, payload);

  const eventPayload = {
    ...payload,
    changed,
    previous,
  };

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.APP_STATE,
    eventPayload
  );

  if (
    changed ||
    safeBool(options?.forceEmit)
  ) {
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
  const previous = getPreviousStoreBootState(Store);

  const payload = normalizeStoreBootPayload(
    options,
    previous
  );

  const previousSignature = getSignatureStore(
    STORE_SIGNATURES,
    Store,
    fallbackStoreSignature
  );

  const signature = getComparableSignature(payload);
  const changed = signature !== previousSignature;

  setSignatureStore(
    STORE_SIGNATURES,
    Store,
    signature,
    "store"
  );

  applyStoreBootPayload(Store, payload);

  const eventPayload = {
    ...payload,
    changed,
    previous,
  };

  emitStoreEvent(
    Store,
    BOOT_EVENTS.STORE_STATE,
    eventPayload
  );

  if (
    changed ||
    safeBool(options?.forceEmit)
  ) {
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
  const input = ensureObject(options);

  const payload = {
    ...input,
    booted: false,
    booting: true,
    ready: false,
    loading: true,
    phase: BOOT_PHASES.BOOTING,
    reason:
      safeText(
        input.reason,
        "boot-start"
      ),
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  const snapshot = getBootStateSnapshot(AppCore, Store);

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
  const input = ensureObject(options);

  const payload = {
    ...input,
    booted: true,
    booting: false,
    ready: true,
    loading: false,
    phase: BOOT_PHASES.READY,
    reason:
      safeText(
        input.reason,
        "boot-ready"
      ),
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  const snapshot = getBootStateSnapshot(AppCore, Store);

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
  const input = ensureObject(options);

  const payload = {
    ...input,
    booted: false,
    booting: false,
    ready: false,
    loading: false,
    phase: BOOT_PHASES.ERROR,
    error,
    reason:
      safeText(
        input.reason,
        "boot-error"
      ),
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  const snapshot = getBootStateSnapshot(AppCore, Store);

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
  const input = ensureObject(options);

  const payload = {
    ...input,
    booted: false,
    booting: false,
    ready: false,
    loading: false,
    phase: BOOT_PHASES.IDLE,
    reason:
      safeText(
        input.reason,
        "reboot-reset"
      ),
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  const snapshot = getBootStateSnapshot(AppCore, Store);

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
   DEBUG SNAPSHOTS
========================================================= */

export function getAppBootStateSnapshot(AppCore) {
  const state = ensureObject(AppCore?.state);

  return {
    hasCore: Boolean(AppCore),
    hasState: isObject(AppCore?.state),
    hasSetState: isFunction(AppCore?.setState),
    hasPatchState: isFunction(AppCore?.patchState),

    booted: Boolean(state.booted),
    booting: Boolean(state.booting),
    ready: Boolean(state.ready),
    loading: Boolean(state.loading),

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

    reason:
      safeText(
        state.lastBootReason,
        ""
      ),

    hasError:
      Boolean(state.lastBootError),

    error:
      state.lastBootError || null,
  };
}

export function getStoreBootStateSnapshot(Store) {
  const getterState = ensureObject(
    safeMethod(Store, "getState")
  );

  const directState = ensureObject(Store?.state);

  const state = {
    ...directState,
    ...getterState,
  };

  return {
    hasStore: Boolean(Store),
    hasState: isObject(Store?.state),
    hasActions: Boolean(Store?.actions),
    hasSetState: isFunction(Store?.setState),
    hasPatchState: isFunction(Store?.patchState),

    ready: Boolean(state.ready),
    booted: Boolean(state.booted),
    booting: Boolean(state.booting),
    loading: Boolean(state.loading),

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

    reason:
      safeText(
        state.lastBootReason,
        ""
      ),

    hasError:
      Boolean(state.lastBootError),

    error:
      state.lastBootError || null,
  };
}

export function getDocumentBootStateSnapshot() {
  if (!isBrowser()) {
    return {
      hasDocument: false,
    };
  }

  const html = document.documentElement || null;
  const body = document.body || null;

  const read = (el) => {
    if (!el) {
      return {
        exists: false,
      };
    }

    return {
      exists: true,
      appLoading: safeText(el.dataset?.appLoading, ""),
      appReady: safeText(el.dataset?.appReady, ""),
      appBooting: safeText(el.dataset?.appBooting, ""),
      bootPhase: safeText(el.dataset?.bootPhase, ""),
      shellState: safeText(el.dataset?.shellState, ""),
      className: safeText(el.className, ""),
    };
  };

  return {
    hasDocument: true,
    html: read(html),
    body: read(body),
  };
}

export function getBootStateSnapshot(AppCore, Store) {
  const app = getAppBootStateSnapshot(AppCore);
  const store = getStoreBootStateSnapshot(Store);
  const documentState = getDocumentBootStateSnapshot();

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
          : BOOT_PHASES.IDLE;

  return {
    app,
    store,
    document: documentState,

    computed: {
      ready:
        Boolean(app.ready && store.ready),

      booted:
        Boolean(app.booted && store.booted),

      booting:
        Boolean(app.booting || store.booting),

      loading:
        Boolean(app.loading || store.loading),

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
   DEFAULT EXPORT
========================================================= */

export default {
  BOOT_PHASES,
  BOOT_EVENTS,

  markAppBootState,
  markStoreBootState,

  markBootStart,
  markBootReady,
  markBootError,
  markRebootState,

  getAppBootStateSnapshot,
  getStoreBootStateSnapshot,
  getDocumentBootStateSnapshot,
  getBootStateSnapshot,
};
