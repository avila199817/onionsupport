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

export const BOOT_STATE_VERSION = "app.boot-state.v2";

export const BOOT_PHASES = Object.freeze({
  IDLE: "idle",
  BOOTING: "booting",
  READY: "ready",
  ERROR: "error",
  FATAL: "fatal",
});

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function getStateTarget(target = null) {
  if (!isObject(target)) return null;

  if (!isObject(target.state)) {
    target.state = {};
  }

  return target.state;
}

function roots() {
  if (!isBrowser()) return [];
  return [document.documentElement, document.body].filter(Boolean);
}

/* =========================================================
   PHASE
========================================================= */

export function normalizeBootPhase(value = "") {
  const phase = cleanText(value, BOOT_PHASES.IDLE).toLowerCase();

  if (phase === BOOT_PHASES.BOOTING || phase === "loading") {
    return BOOT_PHASES.BOOTING;
  }

  if (phase === BOOT_PHASES.READY || phase === "done" || phase === "complete") {
    return BOOT_PHASES.READY;
  }

  if (phase === BOOT_PHASES.ERROR || phase === "failed" || phase === "fail") {
    return BOOT_PHASES.ERROR;
  }

  if (phase === BOOT_PHASES.FATAL) {
    return BOOT_PHASES.FATAL;
  }

  return BOOT_PHASES.IDLE;
}

function normalizeError(error = null) {
  if (!error) return null;

  return {
    name: cleanText(error?.name, "Error"),
    message: redact(error?.message || String(error)),
    code: error?.code || error?.status || error?.statusCode || null,
  };
}

function createBootPayload(options = {}) {
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

/* =========================================================
   WRITE
========================================================= */

function writeAppState(AppCore = null, payload = {}) {
  const state = getStateTarget(AppCore);

  if (!state) return payload;

  const patch = {
    ...payload,

    appBooted: payload.booted,
    appBooting: payload.booting,
    appReady: payload.ready,
    appFatal: payload.fatal,
  };

  Object.assign(state, patch);

  if (typeof AppCore?.setState === "function") {
    AppCore.setState(patch, {
      source: "app.boot-state",
      silent: true,
      emit: false,
    });
  }

  return patch;
}

export function syncDocumentBootState(payload = {}) {
  const booting = Boolean(payload.booting || payload.appBooting);
  const ready = Boolean(payload.ready || payload.appReady);
  const fatal = Boolean(payload.fatal || payload.appFatal);
  const error = Boolean(payload.lastBootError || payload.bootPhase === BOOT_PHASES.ERROR);

  const phase = normalizeBootPhase(payload.bootPhase);
  const appState = fatal
    ? "fatal"
    : error
      ? "error"
      : booting
        ? "booting"
        : ready
          ? "ready"
          : "idle";

  for (const root of roots()) {
    root.classList.toggle("app-booting", booting);
    root.classList.toggle("app-loading", booting);
    root.classList.toggle("app-ready", ready);
    root.classList.toggle("app-error", error && !fatal);
    root.classList.toggle("app-fatal", fatal);

    root.dataset.appBooting = String(booting);
    root.dataset.appLoading = String(booting);
    root.dataset.appReady = String(ready);
    root.dataset.appState = appState;
    root.dataset.bootPhase = phase;
  }

  return true;
}

/* =========================================================
   PUBLIC MARKERS
========================================================= */

export function markAppBootState(AppCore = null, options = {}) {
  const payload = createBootPayload(options);

  writeAppState(AppCore, payload);
  syncDocumentBootState(payload);

  return payload;
}

export function markBootStart(AppCore = null, options = {}) {
  return markAppBootState(AppCore, {
    ...options,
    phase: BOOT_PHASES.BOOTING,
    booting: true,
    loading: true,
  });
}

export function markBootReady(AppCore = null, options = {}) {
  return markAppBootState(AppCore, {
    ...options,
    phase: BOOT_PHASES.READY,
    ready: true,
  });
}

export function markBootError(AppCore = null, error = null, options = {}) {
  return markAppBootState(AppCore, {
    ...options,
    phase: BOOT_PHASES.ERROR,
    error,
  });
}

export function markBootFatal(AppCore = null, error = null, options = {}) {
  return markAppBootState(AppCore, {
    ...options,
    phase: BOOT_PHASES.FATAL,
    fatal: true,
    error,
  });
}

export function markBootIdle(AppCore = null, options = {}) {
  return markAppBootState(AppCore, {
    ...options,
    phase: BOOT_PHASES.IDLE,
  });
}

/* =========================================================
   READ
========================================================= */

export function isAppBooting(AppCore = null) {
  const state = getStateTarget(AppCore);
  return Boolean(state?.booting || state?.appBooting);
}

export function isAppReady(AppCore = null) {
  const state = getStateTarget(AppCore);
  return Boolean(state?.ready || state?.appReady);
}

export function isAppLoading(AppCore = null) {
  const state = getStateTarget(AppCore);
  return Boolean(state?.loading || state?.booting || state?.appBooting);
}

export function hasBootError(AppCore = null) {
  const state = getStateTarget(AppCore);
  return Boolean(state?.lastBootError || state?.fatal || state?.appFatal);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppBootStateSnapshot(AppCore = null) {
  const state = getStateTarget(AppCore) || {};

  return {
    version: BOOT_STATE_VERSION,

    booted: Boolean(state.booted || state.appBooted),
    booting: Boolean(state.booting || state.appBooting),
    ready: Boolean(state.ready || state.appReady),
    loading: Boolean(state.loading || state.booting || state.appBooting),
    fatal: Boolean(state.fatal || state.appFatal),

    phase: state.bootPhase || BOOT_PHASES.IDLE,
    error: state.lastBootError || null,
  };
}

export function getDocumentBootStateSnapshot() {
  if (!isBrowser()) {
    return {
      version: BOOT_STATE_VERSION,
      appState: "",
      bootPhase: "",
      appBooting: "",
      appReady: "",
    };
  }

  const html = document.documentElement;

  return {
    version: BOOT_STATE_VERSION,
    appState: html?.dataset?.appState || "",
    bootPhase: html?.dataset?.bootPhase || "",
    appBooting: html?.dataset?.appBooting || "",
    appReady: html?.dataset?.appReady || "",
  };
}

export function getBootStateSnapshot(AppCore = null) {
  return {
    version: BOOT_STATE_VERSION,
    app: getAppBootStateSnapshot(AppCore),
    document: getDocumentBootStateSnapshot(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  BOOT_STATE_VERSION,
  BOOT_PHASES,

  normalizeBootPhase,

  markAppBootState,
  markBootStart,
  markBootReady,
  markBootError,
  markBootFatal,
  markBootIdle,

  isAppBooting,
  isAppReady,
  isAppLoading,
  hasBootError,

  syncDocumentBootState,

  getAppBootStateSnapshot,
  getDocumentBootStateSnapshot,
  getBootStateSnapshot,
};
