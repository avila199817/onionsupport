/* =========================================================
   Onion Support - App Boot State
   Archivo: /src/app/boot-state.js

   Responsabilidad:
   - Estado mínimo de boot.
   - Sin imports, eventos, debug global, Store complejo, Auth,
     Router, storage, navegación ni lógica de dominio.
========================================================= */

export const BOOT_STATE_VERSION = "app.boot-state.v5";

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

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
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
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function readState(AppCore = null) {
  return isPlainObject(AppCore?.state) ? AppCore.state : {};
}

function ensureState(AppCore = null) {
  if (!isPlainObject(AppCore)) return null;

  if (!isPlainObject(AppCore.state)) {
    AppCore.state = {};
  }

  return AppCore.state;
}

function documentRoots() {
  if (!isBrowser()) return [];
  return [document.documentElement, document.body].filter(Boolean);
}

function setDataset(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function toggleClass(element = null, className = "", enabled = false) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PHASE / ERROR
========================================================= */

export function normalizeBootPhase(value = "") {
  const phase = cleanText(value, BOOT_PHASES.IDLE).toLowerCase();

  if ([BOOT_PHASES.BOOTING, "boot", "loading"].includes(phase)) {
    return BOOT_PHASES.BOOTING;
  }

  if ([BOOT_PHASES.READY, "done", "complete", "completed"].includes(phase)) {
    return BOOT_PHASES.READY;
  }

  if ([BOOT_PHASES.ERROR, "failed", "fail"].includes(phase)) {
    return BOOT_PHASES.ERROR;
  }

  if ([BOOT_PHASES.FATAL, "critical"].includes(phase)) {
    return BOOT_PHASES.FATAL;
  }

  return BOOT_PHASES.IDLE;
}

function normalizeError(error = null) {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      name: "Error",
      message: redact(error),
      code: null,
      status: null,
    };
  }

  return {
    name: cleanText(error?.name, "Error"),
    message: redact(error?.message || String(error)),
    code: error?.code || error?.error || null,
    status: error?.status || error?.statusCode || error?.response?.status || null,
  };
}

function derivePhase(payload = {}) {
  const input = isPlainObject(payload) ? payload : {};
  const explicit = normalizeBootPhase(
    input.bootPhase ||
      input.phase ||
      input.appState
  );

  if (explicit !== BOOT_PHASES.IDLE) return explicit;

  if (input.fatal === true || input.appFatal === true) return BOOT_PHASES.FATAL;
  if (input.lastBootError || input.error || input.appError === true) return BOOT_PHASES.ERROR;

  if (
    input.booting === true ||
    input.loading === true ||
    input.appBooting === true ||
    input.appLoading === true
  ) {
    return BOOT_PHASES.BOOTING;
  }

  if (
    input.ready === true ||
    input.booted === true ||
    input.appReady === true ||
    input.appBooted === true
  ) {
    return BOOT_PHASES.READY;
  }

  return BOOT_PHASES.IDLE;
}

function phaseFlags(phase = BOOT_PHASES.IDLE) {
  return {
    booting: phase === BOOT_PHASES.BOOTING,
    ready: phase === BOOT_PHASES.READY,
    error: phase === BOOT_PHASES.ERROR,
    fatal: phase === BOOT_PHASES.FATAL,
  };
}

function createStatePatch(options = {}) {
  const input = isPlainObject(options) ? options : {};
  const phase = derivePhase(input);
  const flags = phaseFlags(phase);
  const lastBootError = flags.error || flags.fatal
    ? normalizeError(input.error || input.lastBootError)
    : null;

  return {
    booted: flags.ready,
    booting: flags.booting,
    ready: flags.ready,
    loading: flags.booting,
    fatal: flags.fatal,
    bootPhase: phase,
    lastBootError,

    appBooted: flags.ready,
    appBooting: flags.booting,
    appLoading: flags.booting,
    appReady: flags.ready,
    appError: flags.error,
    appFatal: flags.fatal,
  };
}

/* =========================================================
   WRITE
========================================================= */

function writeAppState(AppCore = null, patch = {}) {
  if (isFunction(AppCore?.setState)) {
    try {
      AppCore.setState(patch, {
        source: "app.boot-state",
        silent: true,
        emit: false,
      });

      return patch;
    } catch {
      // fallback below
    }
  }

  const state = ensureState(AppCore);

  if (state) {
    try {
      Object.assign(state, patch);
    } catch {
      // noop
    }
  }

  return patch;
}

export function syncDocumentBootState(payload = {}) {
  const phase = derivePhase(payload);
  const flags = phaseFlags(phase);
  const appState = flags.fatal
    ? BOOT_PHASES.FATAL
    : flags.error
      ? BOOT_PHASES.ERROR
      : flags.booting
        ? BOOT_PHASES.BOOTING
        : flags.ready
          ? BOOT_PHASES.READY
          : BOOT_PHASES.IDLE;

  for (const root of documentRoots()) {
    toggleClass(root, "app-booting", flags.booting);
    toggleClass(root, "app-loading", flags.booting);
    toggleClass(root, "app-ready", flags.ready);
    toggleClass(root, "app-error", flags.error);
    toggleClass(root, "app-fatal", flags.fatal);

    setDataset(root, "appBooted", flags.ready ? "true" : "false");
    setDataset(root, "appBooting", flags.booting ? "true" : "false");
    setDataset(root, "appLoading", flags.booting ? "true" : "false");
    setDataset(root, "appReady", flags.ready ? "true" : "false");
    setDataset(root, "appError", flags.error ? "true" : "false");
    setDataset(root, "appFatal", flags.fatal ? "true" : "false");
    setDataset(root, "appState", appState);
    setDataset(root, "bootPhase", phase);
  }

  return true;
}

/* =========================================================
   PUBLIC MARKERS
========================================================= */

export function markAppBootState(AppCore = null, options = {}) {
  const patch = createStatePatch(options);

  writeAppState(AppCore, patch);
  syncDocumentBootState(patch);

  return patch;
}

export function markBootStart(AppCore = null, options = {}) {
  return markAppBootState(AppCore, {
    ...options,
    phase: BOOT_PHASES.BOOTING,
  });
}

export function markBootReady(AppCore = null, options = {}) {
  return markAppBootState(AppCore, {
    ...options,
    phase: BOOT_PHASES.READY,
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
  const state = readState(AppCore);
  return Boolean(state.booting || state.appBooting);
}

export function isAppReady(AppCore = null) {
  const state = readState(AppCore);
  return Boolean(state.ready || state.appReady);
}

export function isAppLoading(AppCore = null) {
  const state = readState(AppCore);
  return Boolean(
    state.loading ||
      state.booting ||
      state.appLoading ||
      state.appBooting
  );
}

export function hasBootError(AppCore = null) {
  const state = readState(AppCore);
  return Boolean(
    state.lastBootError ||
      state.error ||
      state.fatal ||
      state.appFatal ||
      state.appError
  );
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppBootStateSnapshot(AppCore = null) {
  const state = readState(AppCore);
  const phase = derivePhase(state);
  const error = state.lastBootError || state.error
    ? normalizeError(state.lastBootError || state.error)
    : null;

  return {
    version: BOOT_STATE_VERSION,

    booted: Boolean(state.booted || state.appBooted),
    booting: Boolean(state.booting || state.appBooting),
    ready: Boolean(state.ready || state.appReady),
    loading: Boolean(
      state.loading ||
        state.booting ||
        state.appLoading ||
        state.appBooting
    ),
    fatal: Boolean(state.fatal || state.appFatal),

    phase,
    error,
  };
}

export function getDocumentBootStateSnapshot() {
  if (!isBrowser()) {
    return {
      version: BOOT_STATE_VERSION,
      appState: "",
      bootPhase: "",
    };
  }

  const dataset = document.documentElement?.dataset || {};

  return {
    version: BOOT_STATE_VERSION,
    appState: dataset.appState || "",
    bootPhase: dataset.bootPhase || "",
    appBooted: dataset.appBooted || "",
    appBooting: dataset.appBooting || "",
    appLoading: dataset.appLoading || "",
    appReady: dataset.appReady || "",
    appError: dataset.appError || "",
    appFatal: dataset.appFatal || "",
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
      noAuth: true,
      noRouter: true,
      noStorage: true,
      noNavigation: true,
      redactedSnapshot: true,
    },
  };
}

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
