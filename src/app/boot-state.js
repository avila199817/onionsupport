/* =========================================================
   Onion Support - App Boot State
   Archivo: /src/app/boot-state.js

   Responsabilidad:
   - Estado mínimo de boot.
   - Sin imports.
   - Sin eventos.
   - Sin debug global.
   - Sin Store complejo.
   - Sin snapshots grandes.
   - Sin Auth.
   - Sin Router.
   - Sin storage.
   - Sin navegación.
========================================================= */

export const BOOT_STATE_VERSION = "simple";

export const BOOT_PHASES = Object.freeze({
  IDLE: "idle",
  BOOTING: "booting",
  READY: "ready",
  ERROR: "error",
  FATAL: "fatal",
});

export const BOOT_EVENTS = Object.freeze({
  APP_STATE: "app:boot:state",
  APP_START: "app:boot:start",
  APP_READY: "app:boot:ready",
  APP_ERROR: "app:boot:error",
  APP_FATAL: "app:boot:fatal",
});

function stateOf(target = null) {
  if (!target || typeof target !== "object") return {};

  if (!target.state || typeof target.state !== "object") {
    target.state = {};
  }

  return target.state;
}

function normalizeError(error = null) {
  if (!error) return null;

  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    code: error?.code || error?.status || error?.statusCode || null,
  };
}

export function normalizeBootPhase(value = "") {
  const phase = String(value || "").toLowerCase();

  if (phase === "ready" || phase === "done" || phase === "complete") {
    return BOOT_PHASES.READY;
  }

  if (phase === "error" || phase === "failed" || phase === "fail") {
    return BOOT_PHASES.ERROR;
  }

  if (phase === "fatal") {
    return BOOT_PHASES.FATAL;
  }

  if (
    phase === "boot" ||
    phase === "booting" ||
    phase === "start" ||
    phase === "starting" ||
    phase === "loading"
  ) {
    return BOOT_PHASES.BOOTING;
  }

  return BOOT_PHASES.IDLE;
}

function payloadFrom(options = {}) {
  const phase = normalizeBootPhase(options.phase || options.bootPhase);
  const error = options.error || null;
  const fatal = phase === BOOT_PHASES.FATAL || options.fatal === true;

  if (fatal) {
    return {
      booted: false,
      booting: false,
      ready: false,
      loading: false,
      fatal: true,
      bootPhase: BOOT_PHASES.FATAL,
      lastBootError: normalizeError(error),
    };
  }

  if (phase === BOOT_PHASES.ERROR || error) {
    return {
      booted: false,
      booting: false,
      ready: false,
      loading: false,
      fatal: false,
      bootPhase: BOOT_PHASES.ERROR,
      lastBootError: normalizeError(error),
    };
  }

  if (phase === BOOT_PHASES.READY || options.ready === true) {
    return {
      booted: true,
      booting: false,
      ready: true,
      loading: false,
      fatal: false,
      bootPhase: BOOT_PHASES.READY,
      lastBootError: null,
    };
  }

  if (phase === BOOT_PHASES.BOOTING || options.booting === true || options.loading === true) {
    return {
      booted: false,
      booting: true,
      ready: false,
      loading: true,
      fatal: false,
      bootPhase: BOOT_PHASES.BOOTING,
      lastBootError: null,
    };
  }

  return {
    booted: false,
    booting: false,
    ready: false,
    loading: false,
    fatal: false,
    bootPhase: BOOT_PHASES.IDLE,
    lastBootError: null,
  };
}

function writeState(target = null, payload = {}) {
  const state = stateOf(target);

  Object.assign(state, payload, {
    appBooted: payload.booted,
    appBooting: payload.booting,
    appReady: payload.ready,
    appFatal: payload.fatal,
  });

  if (typeof target?.setState === "function") {
    try {
      target.setState(state, { silent: true, emit: false });
    } catch {
      // Compat mínima.
    }
  }

  return state;
}

export function syncDocumentBootState(payload = {}) {
  const booting = Boolean(payload.booting || payload.appBooting);
  const ready = Boolean(payload.ready || payload.appReady);
  const fatal = Boolean(payload.fatal || payload.appFatal);
  const error = Boolean(payload.lastBootError || payload.bootPhase === BOOT_PHASES.ERROR);
  const phase = payload.bootPhase || BOOT_PHASES.IDLE;

  const appState = fatal ? "fatal" : error ? "error" : booting ? "booting" : ready ? "ready" : "idle";

  for (const element of [document.documentElement, document.body].filter(Boolean)) {
    element.classList.toggle("app-booting", booting);
    element.classList.toggle("app-loading", booting);
    element.classList.toggle("app-ready", ready);
    element.classList.toggle("app-error", error && !fatal);
    element.classList.toggle("app-fatal", fatal);

    element.dataset.appBooting = booting ? "true" : "false";
    element.dataset.appLoading = booting ? "true" : "false";
    element.dataset.appReady = ready ? "true" : "false";
    element.dataset.appState = appState;
    element.dataset.bootPhase = phase;
    element.dataset.shellState = appState;
  }

  return true;
}

export function markAppBootState(AppCore = null, options = {}) {
  const payload = payloadFrom(options);

  writeState(AppCore, payload);
  syncDocumentBootState(payload);

  return payload;
}

export function markStoreBootState(Store = null, options = {}) {
  const payload = payloadFrom(options);

  writeState(Store, payload);

  return payload;
}

export function markBootStart(AppCore = null, Store = null, options = {}) {
  const payload = {
    ...options,
    phase: BOOT_PHASES.BOOTING,
    booting: true,
    loading: true,
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  return getBootStateSnapshot(AppCore, Store);
}

export function markBootReady(AppCore = null, Store = null, options = {}) {
  const payload = {
    ...options,
    phase: BOOT_PHASES.READY,
    ready: true,
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  return getBootStateSnapshot(AppCore, Store);
}

export function markBootError(AppCore = null, Store = null, error = null, options = {}) {
  const payload = {
    ...options,
    phase: options.fatal ? BOOT_PHASES.FATAL : BOOT_PHASES.ERROR,
    error,
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  return getBootStateSnapshot(AppCore, Store);
}

export function markBootFatal(AppCore = null, Store = null, error = null, options = {}) {
  return markBootError(AppCore, Store, error, {
    ...options,
    fatal: true,
  });
}

export function markRebootState(AppCore = null, Store = null, options = {}) {
  const payload = {
    ...options,
    phase: BOOT_PHASES.IDLE,
  };

  markAppBootState(AppCore, payload);
  markStoreBootState(Store, payload);

  return getBootStateSnapshot(AppCore, Store);
}

export function isAppBooting(AppCore = null) {
  const state = stateOf(AppCore);
  return Boolean(state.booting || state.appBooting);
}

export function isAppReady(AppCore = null) {
  const state = stateOf(AppCore);
  return Boolean(state.ready || state.appReady);
}

export function isAppLoading(AppCore = null) {
  const state = stateOf(AppCore);
  return Boolean(state.loading || state.booting || state.appBooting);
}

export function hasBootError(AppCore = null) {
  const state = stateOf(AppCore);
  return Boolean(state.lastBootError || state.fatal || state.appFatal);
}

export function resetBootStateSignatures() {
  return true;
}

export function getAppBootStateSnapshot(AppCore = null) {
  const state = stateOf(AppCore);

  return {
    version: BOOT_STATE_VERSION,
    booted: Boolean(state.booted || state.appBooted),
    booting: Boolean(state.booting || state.appBooting),
    ready: Boolean(state.ready || state.appReady),
    loading: Boolean(state.loading),
    fatal: Boolean(state.fatal || state.appFatal),
    phase: state.bootPhase || BOOT_PHASES.IDLE,
    error: state.lastBootError || null,
  };
}

export function getStoreBootStateSnapshot(Store = null) {
  const state = stateOf(Store);

  return {
    version: BOOT_STATE_VERSION,
    booted: Boolean(state.booted || state.appBooted),
    booting: Boolean(state.booting || state.appBooting),
    ready: Boolean(state.ready || state.appReady),
    loading: Boolean(state.loading),
    fatal: Boolean(state.fatal || state.appFatal),
    phase: state.bootPhase || BOOT_PHASES.IDLE,
    error: state.lastBootError || null,
  };
}

export function getDocumentBootStateSnapshot() {
  const html = document.documentElement;

  return {
    version: BOOT_STATE_VERSION,
    appState: html?.dataset?.appState || "",
    bootPhase: html?.dataset?.bootPhase || "",
    appBooting: html?.dataset?.appBooting || "",
    appReady: html?.dataset?.appReady || "",
  };
}

export function getBootStateSnapshot(AppCore = null, Store = null) {
  return {
    version: BOOT_STATE_VERSION,
    app: getAppBootStateSnapshot(AppCore),
    store: getStoreBootStateSnapshot(Store),
    document: getDocumentBootStateSnapshot(),
  };
}

export function exposeBootStateDebugApi(AppCore = null, Store = null) {
  return {
    version: BOOT_STATE_VERSION,
    markBootStart: (options = {}) => markBootStart(AppCore, Store, options),
    markBootReady: (options = {}) => markBootReady(AppCore, Store, options),
    markBootError: (error = null, options = {}) => markBootError(AppCore, Store, error, options),
    markBootFatal: (error = null, options = {}) => markBootFatal(AppCore, Store, error, options),
    getSnapshot: () => getBootStateSnapshot(AppCore, Store),
  };
}

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
