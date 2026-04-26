/* =========================================================
   Onion SPA - App Boot State
   Archivo: src/app/boot-state.js

   Responsabilidades:
   - sincronizar estado de boot de AppCore
   - sincronizar estado de boot del Store
   - centralizar flags ready / booted / booting / loading
   - endurecer transiciones boot / reboot / error
   - evitar estados fantasma
   - emitir eventos de boot consistentes
   - exponer snapshots de diagnóstico seguros

   HARDENING PRO:
   - tolerancia total a módulos parciales
   - idempotencia fuerte
   - compatibilidad con AppCore.setState y mutación directa
   - compatibilidad con Store.actions y Store.setState
   - cero throws accidentales
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
  STORE_READY: "store:boot:ready",
  STORE_ERROR: "store:boot:error",

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
    typeof value === "object"
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
    return Object.prototype.hasOwnProperty.call(
      value,
      key
    );
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
  const ms =
    Date.now();

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
  const object =
    ensureObject(target);

  return safeInvoke(
    object?.[methodName],
    object,
    args
  );
}

function safeAssign(target, payload) {
  try {
    if (isObject(target)) {
      Object.assign(
        target,
        payload
      );
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

function emitCoreEvent(AppCore, eventName, detail = {}) {
  if (!eventName) {
    return false;
  }

  let emitted = false;

  try {
    const events =
      AppCore?.events;

    if (events?.emit) {
      events.emit(
        eventName,
        detail
      );
      emitted = true;
    }
  } catch {}

  if (
    safeWindowDispatch(
      eventName,
      detail
    )
  ) {
    emitted = true;
  }

  return emitted;
}

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

  const object =
    ensureObject(error);

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
    payload.stack =
      safeText(
        object.stack,
        ""
      );
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

function getPreviousAppBootState(AppCore) {
  const state =
    ensureObject(
      AppCore?.state
    );

  return {
    booted:
      Boolean(state.booted),
    booting:
      Boolean(state.booting),
    ready:
      Boolean(state.ready),
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
      state.lastBootError ||
      null,
  };
}

function getPreviousStoreBootState(Store) {
  const stateFromGetter =
    ensureObject(
      safeMethod(
        Store,
        "getState"
      )
    );

  const directState =
    ensureObject(
      Store?.state
    );

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
      state.lastBootError ||
      null,
  };
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeAppBootPayload(options = {}, previous = {}) {
  const input =
    ensureObject(options);

  let booted = hasOwn(input, "booted")
    ? safeBool(input.booted)
    : false;

  let booting = hasOwn(input, "booting")
    ? safeBool(input.booting)
    : false;

  let ready = hasOwn(input, "ready")
    ? safeBool(input.ready)
    : booted;

  let loading = hasOwn(input, "loading")
    ? safeBool(input.loading)
    : booting;

  const requestedPhase =
    safeText(
      input.phase,
      ""
    );

  const hasError =
    hasOwn(input, "error") &&
    Boolean(input.error);

  let phase =
    requestedPhase ||
    BOOT_PHASES.IDLE;

  if (booting) {
    booted = false;
    ready = false;
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
  } else if (
    hasError ||
    requestedPhase === BOOT_PHASES.ERROR
  ) {
    booted = false;
    ready = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.ERROR;
  } else {
    booted = false;
    ready = false;
    booting = false;
    loading = false;
    phase = requestedPhase || BOOT_PHASES.IDLE;
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
        input.action,
      phase
    );

  const clock =
    nowPayload();

  return {
    booted,
    booting,
    ready,
    loading,

    bootPhase:
      phase,

    bootCycleId:
      cycleId,

    bootUpdatedAt:
      clock.iso,

    bootUpdatedAtMs:
      clock.ms,

    lastBootReason:
      reason,

    lastBootError:
      phase === BOOT_PHASES.ERROR || hasError
        ? normalizeError(input.error)
        : null,
  };
}

function normalizeStoreBootPayload(options = {}, previous = {}) {
  const input =
    ensureObject(options);

  let ready = hasOwn(input, "ready")
    ? safeBool(input.ready)
    : false;

  let booted = hasOwn(input, "booted")
    ? safeBool(input.booted)
    : ready;

  let booting = hasOwn(input, "booting")
    ? safeBool(input.booting)
    : false;

  let loading = hasOwn(input, "loading")
    ? safeBool(input.loading)
    : booting;

  const requestedPhase =
    safeText(
      input.phase,
      ""
    );

  const hasError =
    hasOwn(input, "error") &&
    Boolean(input.error);

  let phase =
    requestedPhase ||
    BOOT_PHASES.IDLE;

  if (
    ready ||
    booted
  ) {
    ready = true;
    booted = true;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.READY;
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
    hasError ||
    requestedPhase === BOOT_PHASES.ERROR
  ) {
    ready = false;
    booted = false;
    booting = false;
    loading = false;
    phase = BOOT_PHASES.ERROR;
  } else {
    ready = false;
    booted = false;
    booting = false;
    loading = false;
    phase = requestedPhase || BOOT_PHASES.IDLE;
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
        input.action,
      phase
    );

  const clock =
    nowPayload();

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

    lastBootReason:
      reason,

    lastBootError:
      phase === BOOT_PHASES.ERROR || hasError
        ? normalizeError(input.error)
        : null,
  };
}

/* =========================================================
   APPLY
========================================================= */

function applyAppBootPayload(AppCore, payload) {
  safeAssign(
    AppCore?.state,
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

  return payload;
}

function applyStoreBootPayload(Store, payload) {
  safeAssign(
    Store?.state,
    payload
  );

  const actions =
    ensureObject(
      Store?.actions
    );

  safeMethod(
    actions,
    "markReady",
    [payload.ready]
  );

  safeMethod(
    actions,
    "markBooted",
    [payload.booted]
  );

  safeMethod(
    actions,
    "markBooting",
    [payload.booting]
  );

  safeMethod(
    actions,
    "setLoading",
    [payload.loading]
  );

  safeMethod(
    actions,
    "markLoading",
    [payload.loading]
  );

  safeMethod(
    actions,
    "set",
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
    payload
  );

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

  try {
    Store?.events?.emit?.(
      BOOT_EVENTS.STORE_STATE,
      eventPayload
    );
  } catch {}

  safeWindowDispatch(
    BOOT_EVENTS.STORE_STATE,
    eventPayload
  );

  if (
    changed ||
    safeBool(options?.forceEmit)
  ) {
    if (payload.bootPhase === BOOT_PHASES.READY) {
      try {
        Store?.events?.emit?.(
          BOOT_EVENTS.STORE_READY,
          eventPayload
        );
      } catch {}

      safeWindowDispatch(
        BOOT_EVENTS.STORE_READY,
        eventPayload
      );
    }

    if (payload.bootPhase === BOOT_PHASES.ERROR) {
      try {
        Store?.events?.emit?.(
          BOOT_EVENTS.STORE_ERROR,
          eventPayload
        );
      } catch {}

      safeWindowDispatch(
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

  markAppBootState(
    AppCore,
    payload
  );

  markStoreBootState(
    Store,
    payload
  );

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.BOOT_START,
    getBootStateSnapshot(
      AppCore,
      Store
    )
  );

  return getBootStateSnapshot(
    AppCore,
    Store
  );
}

export function markBootReady(AppCore, Store, options = {}) {
  const input =
    ensureObject(options);

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

  markAppBootState(
    AppCore,
    payload
  );

  markStoreBootState(
    Store,
    payload
  );

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.BOOT_READY,
    getBootStateSnapshot(
      AppCore,
      Store
    )
  );

  return getBootStateSnapshot(
    AppCore,
    Store
  );
}

export function markBootError(AppCore, Store, error = null, options = {}) {
  const input =
    ensureObject(options);

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

  markAppBootState(
    AppCore,
    payload
  );

  markStoreBootState(
    Store,
    payload
  );

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.BOOT_ERROR,
    getBootStateSnapshot(
      AppCore,
      Store
    )
  );

  return getBootStateSnapshot(
    AppCore,
    Store
  );
}

export function markRebootState(AppCore, Store, options = {}) {
  const input =
    ensureObject(options);

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

  markAppBootState(
    AppCore,
    payload
  );

  markStoreBootState(
    Store,
    payload
  );

  emitCoreEvent(
    AppCore,
    BOOT_EVENTS.REBOOT,
    getBootStateSnapshot(
      AppCore,
      Store
    )
  );

  return getBootStateSnapshot(
    AppCore,
    Store
  );
}

/* =========================================================
   DEBUG SNAPSHOTS
========================================================= */

export function getAppBootStateSnapshot(AppCore) {
  const state =
    ensureObject(
      AppCore?.state
    );

  return {
    hasCore:
      Boolean(AppCore),

    hasState:
      isObject(AppCore?.state),

    hasSetState:
      isFunction(AppCore?.setState),

    booted:
      Boolean(state.booted),

    booting:
      Boolean(state.booting),

    ready:
      Boolean(state.ready),

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

    reason:
      safeText(
        state.lastBootReason,
        ""
      ),

    hasError:
      Boolean(state.lastBootError),

    error:
      state.lastBootError ||
      null,
  };
}

export function getStoreBootStateSnapshot(Store) {
  const getterState =
    ensureObject(
      safeMethod(
        Store,
        "getState"
      )
    );

  const directState =
    ensureObject(
      Store?.state
    );

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

    hasSetState:
      isFunction(Store?.setState),

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

    reason:
      safeText(
        state.lastBootReason,
        ""
      ),

    hasError:
      Boolean(state.lastBootError),

    error:
      state.lastBootError ||
      null,
  };
}

export function getBootStateSnapshot(AppCore, Store) {
  const app =
    getAppBootStateSnapshot(AppCore);

  const store =
    getStoreBootStateSnapshot(Store);

  return {
    app,
    store,

    computed: {
      ready:
        Boolean(app.ready && store.ready),

      booted:
        Boolean(app.booted && store.booted),

      booting:
        Boolean(app.booting || store.booting),

      loading:
        Boolean(app.loading || store.loading),

      phase:
        app.phase === BOOT_PHASES.ERROR ||
        store.phase === BOOT_PHASES.ERROR
          ? BOOT_PHASES.ERROR
          : app.phase === BOOT_PHASES.BOOTING ||
              store.phase === BOOT_PHASES.BOOTING
            ? BOOT_PHASES.BOOTING
            : app.phase === BOOT_PHASES.READY &&
                store.phase === BOOT_PHASES.READY
              ? BOOT_PHASES.READY
              : BOOT_PHASES.IDLE,

      cycleId:
        Math.max(
          safeInteger(app.cycleId, 0),
          safeInteger(store.cycleId, 0)
        ),
    },
  };
}

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
  getBootStateSnapshot,
};
