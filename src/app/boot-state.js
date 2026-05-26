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
   - Sin lógica de dominio.
========================================================= */

export const BOOT_STATE_VERSION = "app.boot-state.v4";

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

function isFunction(value) {
  return typeof value === "function";
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

function derivePhaseFromPayload(payload = {}) {
  const input = isObject(payload) ? payload : {};
  const explicit = normalizeBootPhase(input.bootPhase || input.phase);

  if (explicit !== BOOT_PHASES.IDLE) return explicit;

  if (input.fatal === true || input.appFatal === true) {
    return BOOT_PHASES.FATAL;
  }

  if (input.lastBootError || input.error || input.appError === true) {
    return BOOT_PHASES.ERROR;
  }

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
    input.appReady === true ||
    input.booted === true ||
    input.appBooted === true
  ) {
    return BOOT_PHASES.READY;
  }

  return BOOT_PHASES.IDLE;
}

function createBootPayload(options = {}) {
  const input = isObject(options) ? options : {};
  const phase = derivePhaseFromPayload(input);
  const error = normalizeError(input.error || input.lastBootError || null);

  if (phase === BOOT_PHASES.FATAL) {
    return {
      booted: false,
      booting: false,
      ready: false,
      loading: false,
      fatal: true,
      bootPhase: BOOT_PHASES.FATAL,
      lastBootError: error,
    };
  }

  if (phase === BOOT_PHASES.ERROR) {
    return {
      booted: false,
      booting: false,
      ready: false,
      loading: false,
      fatal: false,
      bootPhase: BOOT_PHASES.ERROR,
      lastBootError: error,
    };
  }

  if (phase === BOOT_PHASES.READY) {
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

  if (phase === BOOT_PHASES.BOOTING) {
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
  const input = isObject(payload) ? payload : {};
  const error = Boolean(input.lastBootError && !input.fatal);

  return {
    ...input,

    appBooted: Boolean(input.booted),
    appBooting: Boolean(input.booting),
    appLoading: Boolean(input.loading || input.booting),
    appReady: Boolean(input.ready),
    appFatal: Boolean(input.fatal),
    appError: error,
  };
}

function writeAppState(AppCore = null, payload = {}) {
  const patch = createStatePatch(payload);

  /*
    Vía preferente: Core.setState().
    Evita doble escritura y deja que Core normalice internamente.
  */
  if (isFunction(AppCore?.setState)) {
    try {
      AppCore.setState(patch, {
        source: "app.boot-state",
        silent: true,
        emit: false,
      });

      return patch;
    } catch {
      // fallback a mutación directa abajo
    }
  }

  const state = ensureStateTarget(AppCore);

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
    toggleClass(root, "app-booting", booting);
    toggleClass(root, "app-loading", booting);
    toggleClass(root, "app-ready", ready);
    toggleClass(root, "app-error", error);
    toggleClass(root, "app-fatal", fatal);

    setDataset(root, "appBooted", ready ? "true" : "false");
    setDataset(root, "appBooting", booting ? "true" : "false");
    setDataset(root, "appLoading", booting ? "true" : "false");
    setDataset(root, "appReady", ready ? "true" : "false");
    setDataset(root, "appError", error ? "true" : "false");
    setDataset(root, "appFatal", fatal ? "true" : "false");
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

  return Boolean(
    state.loading ||
      state.booting ||
      state.appLoading ||
      state.appBooting
  );
}

export function hasBootError(AppCore = null) {
  const state = readStateTarget(AppCore);

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
  const state = readStateTarget(AppCore);
  const phase = derivePhaseFromPayload(state);

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

      setStatePreferred: true,
      directStateMutationOnlyAsFallback: true,

      noImports: true,
      noEvents: true,
      noGlobalDebug: true,
      noComplexStore: true,

      noAuth: true,
      noRouter: true,
      noStorage: true,
      noNavigation: true,
      noDomainLogic: true,

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
