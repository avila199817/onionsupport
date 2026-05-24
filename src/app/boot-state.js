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

export const BOOT_STATE_VERSION = "app.boot-state.v3";

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
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function readStateTarget(target = null) {
  return isObject(target?.state) ? target.state : {};
}

function ensureStateTarget(target = null) {
  if (!isObject(target)) return null;

  if (!isObject(target.state)) {
    target.state = {};
  }

  return target.state;
}

function roots() {
  if (!isBrowser()) return [];

  return [
    document.documentElement,
    document.body,
  ].filter(Boolean);
}

function setDataset(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete element.dataset[key];
    } else {
      element.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PHASE
========================================================= */

export function normalizeBootPhase(value = "") {
  const phase = cleanText(value, BOOT_PHASES.IDLE).toLowerCase();

  if (
    phase === BOOT_PHASES.BOOTING ||
    phase === "boot" ||
    phase === "loading"
  ) {
    return BOOT_PHASES.BOOTING;
  }

  if (
    phase === BOOT_PHASES.READY ||
    phase === "done" ||
    phase === "complete" ||
    phase === "completed"
  ) {
    return BOOT_PHASES.READY;
  }

  if (
    phase === BOOT_PHASES.ERROR ||
    phase === "failed" ||
    phase === "fail"
  ) {
    return BOOT_PHASES.ERROR;
  }

  if (
    phase === BOOT_PHASES.FATAL ||
    phase === "critical"
  ) {
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

function derivePhaseFromPayload(payload = {}) {
  const explicit = normalizeBootPhase(payload.bootPhase || payload.phase);

  if (explicit !== BOOT_PHASES.IDLE) return explicit;

  if (payload.fatal === true || payload.appFatal === true) return BOOT_PHASES.FATAL;
  if (payload.lastBootError || payload.error) return BOOT_PHASES.ERROR;
  if (payload.booting === true || payload.loading === true || payload.appBooting === true) return BOOT_PHASES.BOOTING;
  if (payload.ready === true || payload.appReady === true || payload.booted === true || payload.appBooted === true) return BOOT_PHASES.READY;

  return BOOT_PHASES.IDLE;
}

function createBootPayload(options = {}) {
  const input = isObject(options) ? options : {};
  const phase = derivePhaseFromPayload(input);
  const error = input.error || null;
  const fatal = phase === BOOT_PHASES.FATAL || input.fatal === true;

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

  if (phase === BOOT_PHASES.READY || input.ready === true) {
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

  if (phase === BOOT_PHASES.BOOTING || input.booting === true || input.loading === true) {
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

function createStatePatch(payload = {}) {
  return {
    ...payload,

    appBooted: Boolean(payload.booted),
    appBooting: Boolean(payload.booting),
    appLoading: Boolean(payload.loading || payload.booting),
    appReady: Boolean(payload.ready),
    appFatal: Boolean(payload.fatal),
    appError: Boolean(payload.lastBootError && !payload.fatal),
  };
}

function writeAppState(AppCore = null, payload = {}) {
  const patch = createStatePatch(payload);
  const state = ensureStateTarget(AppCore);

  if (state) {
    Object.assign(state, patch);
  }

  if (typeof AppCore?.setState === "function") {
    try {
      AppCore.setState(patch, {
        source: "app.boot-state",
        silent: true,
        emit: false,
      });
    } catch {
      // noop
    }
  }

  return patch;
}

export function syncDocumentBootState(payload = {}) {
  const phase = derivePhaseFromPayload(payload);

  const booting = phase === BOOT_PHASES.BOOTING;
  const ready = phase === BOOT_PHASES.READY;
  const fatal = phase === BOOT_PHASES.FATAL;
  const error = phase === BOOT_PHASES.ERROR;

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
    root.classList.toggle("app-error", error);
    root.classList.toggle("app-fatal", fatal);

    setDataset(root, "appBooted", String(ready));
    setDataset(root, "appBooting", String(booting));
    setDataset(root, "appLoading", String(booting));
    setDataset(root, "appReady", String(ready));
    setDataset(root, "appError", String(error));
    setDataset(root, "appFatal", String(fatal));
    setDataset(root, "appState", appState);
    setDataset(root, "bootPhase", phase);
  }

  return true;
}

/* =========================================================
   PUBLIC MARKERS
========================================================= */

export function markAppBootState(AppCore = null, options = {}) {
  const payload = createBootPayload(options);
  const patch = writeAppState(AppCore, payload);

  syncDocumentBootState(patch);

  return patch;
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
  const state = readStateTarget(AppCore);
  return Boolean(state.booting || state.appBooting);
}

export function isAppReady(AppCore = null) {
  const state = readStateTarget(AppCore);
  return Boolean(state.ready || state.appReady);
}

export function isAppLoading(AppCore = null) {
  const state = readStateTarget(AppCore);
  return Boolean(state.loading || state.booting || state.appLoading || state.appBooting);
}

export function hasBootError(AppCore = null) {
  const state = readStateTarget(AppCore);
  return Boolean(state.lastBootError || state.fatal || state.appFatal || state.appError);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppBootStateSnapshot(AppCore = null) {
  const state = readStateTarget(AppCore);

  const error = state.lastBootError
    ? normalizeError(state.lastBootError)
    : null;

  return {
    version: BOOT_STATE_VERSION,

    booted: Boolean(state.booted || state.appBooted),
    booting: Boolean(state.booting || state.appBooting),
    ready: Boolean(state.ready || state.appReady),
    loading: Boolean(state.loading || state.booting || state.appLoading || state.appBooting),
    fatal: Boolean(state.fatal || state.appFatal),

    phase: normalizeBootPhase(state.bootPhase || state.phase),
    error,
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
      appFatal: "",
    };
  }

  const html = document.documentElement;

  return {
    version: BOOT_STATE_VERSION,
    appState: html?.dataset?.appState || "",
    bootPhase: html?.dataset?.bootPhase || "",
    appBooted: html?.dataset?.appBooted || "",
    appBooting: html?.dataset?.appBooting || "",
    appLoading: html?.dataset?.appLoading || "",
    appReady: html?.dataset?.appReady || "",
    appError: html?.dataset?.appError || "",
    appFatal: html?.dataset?.appFatal || "",
  };
}

export function getBootStateSnapshot(AppCore = null) {
  return {
    version: BOOT_STATE_VERSION,
    app: getAppBootStateSnapshot(AppCore),
    document: getDocumentBootStateSnapshot(),

    policy: {
      bootStateOnly: true,
      noImports: true,
      noEvents: true,
      noGlobalDebug: true,
      noComplexStore: true,
      noAuth: true,
      noRouter: true,
      noStorage: true,
      noNavigation: true,
      redactedSnapshot: true,
    },
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
