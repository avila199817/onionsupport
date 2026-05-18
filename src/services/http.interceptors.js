/* =========================================================
   Onion Support - HTTP Interceptors
   Archivo: /src/services/http.interceptors.js

   Responsabilidad:
   - Compat mínima para imports legacy.
   - Interceptors desactivados.
   - Sin pipeline paralelo.
   - Sin ejecución de handlers.
   - Sin fetch.
   - Sin retry.
   - Sin refresh.
   - Sin Auth.
   - Sin Router.
   - Sin Toast.
   - Sin storage.
   - Sin sesión.
   - Sin magia negra.
========================================================= */

export const INTERCEPTORS_VERSION = "simple-disabled";

const TYPES = Object.freeze(["request", "response", "error"]);
const DISABLED_REASON = "HTTP interceptors desactivados: el transporte real vive en src/core/http.js.";

let sequence = 0;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function normalizeType(type = "request") {
  const clean = text(type, "request");
  return TYPES.includes(clean) ? clean : "request";
}

function nextId(type = "request") {
  sequence += 1;
  return `${normalizeType(type)}_${sequence}`;
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   STATE
========================================================= */

export function createInterceptorsState() {
  return {
    request: [],
    response: [],
    error: [],

    disabled: true,

    meta: {
      version: INTERCEPTORS_VERSION,
      disabled: true,
      reason: DISABLED_REASON,
      createdAt: nowIso(),

      registered: 0,
      ejected: 0,
      cleared: 0,
      executed: 0,
      skipped: 0,
    },
  };
}

function ensureState(interceptors = null) {
  const state = isObject(interceptors)
    ? interceptors
    : createInterceptorsState();

  for (const type of TYPES) {
    if (!Array.isArray(state[type])) {
      state[type] = [];
    }
  }

  if (!isObject(state.meta)) {
    state.meta = {};
  }

  state.disabled = true;
  state.meta.version = INTERCEPTORS_VERSION;
  state.meta.disabled = true;
  state.meta.reason = DISABLED_REASON;

  return state;
}

function bucketOf(interceptors = null, type = "request") {
  const state = ensureState(interceptors);
  const cleanType = normalizeType(type);

  if (!Array.isArray(state[cleanType])) {
    state[cleanType] = [];
  }

  return state[cleanType];
}

function disabledDisposer() {
  return false;
}

/* =========================================================
   REGISTER COMPAT
   No se guardan handlers reales.
========================================================= */

function registerCompat(interceptors, type, handlerOrEntry, options = {}) {
  const state = ensureState(interceptors);
  const cleanType = normalizeType(type);
  const bucket = bucketOf(state, cleanType);

  const handler = isFunction(handlerOrEntry)
    ? handlerOrEntry
    : isFunction(handlerOrEntry?.handler)
      ? handlerOrEntry.handler
      : null;

  if (!handler) {
    return disabledDisposer;
  }

  const id = text(
    options?.id ||
      handlerOrEntry?.id ||
      handler.name ||
      nextId(cleanType),
    nextId(cleanType)
  );

  bucket.push({
    id,
    type: cleanType,
    name: text(options?.name || handlerOrEntry?.name || handler.name || id, id),
    disabled: true,
    noop: true,
    registeredAt: nowIso(),
  });

  state.meta.registered = Number(state.meta.registered || 0) + 1;
  state.meta.lastRegisterAt = nowIso();
  state.meta.lastRegisterType = cleanType;

  return () => ejectInterceptor(state, cleanType, id);
}

export function useRequest(interceptors, fn, options = {}) {
  return registerCompat(interceptors, "request", fn, options);
}

export function useResponse(interceptors, fn, options = {}) {
  return registerCompat(interceptors, "response", fn, options);
}

export function useError(interceptors, fn, options = {}) {
  return registerCompat(interceptors, "error", fn, options);
}

/* =========================================================
   MANAGEMENT
========================================================= */

function findIndex(bucket = [], ref = null) {
  const value = text(ref?.id || ref?.name || ref, "");

  if (!value && !isFunction(ref)) return -1;

  return bucket.findIndex((item) => {
    if (item === ref) return true;
    if (isFunction(ref) && item?.handler === ref) return true;

    return (
      item?.id === value ||
      item?.name === value
    );
  });
}

export function ejectInterceptor(interceptors, type = "request", ref = null) {
  const state = ensureState(interceptors);
  const bucket = bucketOf(state, type);
  const index = findIndex(bucket, ref);

  if (index < 0) return false;

  bucket.splice(index, 1);

  state.meta.ejected = Number(state.meta.ejected || 0) + 1;
  state.meta.lastEjectAt = nowIso();

  return true;
}

export function enableInterceptor() {
  return false;
}

export function disableInterceptor() {
  return false;
}

export function clearInterceptors(interceptors, type = "") {
  const state = ensureState(interceptors);
  const cleanType = text(type, "");

  if (cleanType && TYPES.includes(cleanType)) {
    const bucket = bucketOf(state, cleanType);
    const count = bucket.length;

    bucket.splice(0);

    state.meta.cleared = Number(state.meta.cleared || 0) + count;
    state.meta.lastClearAt = nowIso();

    return count;
  }

  let count = 0;

  for (const item of TYPES) {
    count += clearInterceptors(state, item);
  }

  return count;
}

export function resetInterceptorsRuntime(interceptors) {
  const state = ensureState(interceptors);

  state.meta.executed = 0;
  state.meta.skipped = 0;
  state.meta.lastRunAt = "";
  state.meta.lastRunType = "";

  return true;
}

/* =========================================================
   RUNNERS
   No ejecutan handlers. Devuelven el valor original.
========================================================= */

function markSkipped(interceptors, type = "request") {
  const state = ensureState(interceptors);

  state.meta.skipped = Number(state.meta.skipped || 0) + 1;
  state.meta.lastRunAt = nowIso();
  state.meta.lastRunType = normalizeType(type);

  return true;
}

export function runRequestInterceptors(interceptors, requestConfig) {
  markSkipped(interceptors, "request");
  return Promise.resolve(requestConfig);
}

export function runResponseInterceptors(interceptors, response) {
  markSkipped(interceptors, "response");
  return Promise.resolve(response);
}

export function runErrorInterceptors(interceptors, error) {
  markSkipped(interceptors, "error");
  return Promise.resolve(error);
}

/* =========================================================
   SNAPSHOT
========================================================= */

function serializeBucket(bucket = []) {
  return bucket.map((item) => ({
    id: text(item?.id, ""),
    name: text(item?.name, ""),
    type: text(item?.type, ""),
    disabled: true,
    noop: true,
    registeredAt: text(item?.registeredAt, ""),
  }));
}

export function getInterceptorsSnapshot(interceptors = null) {
  const state = ensureState(interceptors);

  return {
    version: INTERCEPTORS_VERSION,

    disabled: true,
    reason: DISABLED_REASON,

    counts: {
      request: state.request.length,
      response: state.response.length,
      error: state.error.length,
    },

    activeCounts: {
      request: 0,
      response: 0,
      error: 0,
    },

    request: serializeBucket(state.request),
    response: serializeBucket(state.response),
    error: serializeBucket(state.error),

    meta: {
      version: INTERCEPTORS_VERSION,
      disabled: true,
      reason: DISABLED_REASON,

      registered: Number(state.meta.registered || 0),
      ejected: Number(state.meta.ejected || 0),
      cleared: Number(state.meta.cleared || 0),
      executed: 0,
      skipped: Number(state.meta.skipped || 0),

      lastRunAt: text(state.meta.lastRunAt, ""),
      lastRunType: text(state.meta.lastRunType, ""),
      lastRegisterAt: text(state.meta.lastRegisterAt, ""),
      lastRegisterType: text(state.meta.lastRegisterType, ""),
      lastClearAt: text(state.meta.lastClearAt, ""),
      lastEjectAt: text(state.meta.lastEjectAt, ""),
    },

    policy: {
      compatibilityOnly: true,
      handlersExecuted: false,
      ownFetch: false,
      ownRetry: false,
      ownRefresh: false,
      ownAuth: false,
      ownRouter: false,
      ownToast: false,
      ownStorage: false,
      noPipelineParallel: true,
      noSecrets: true,
    },

    at: nowIso(),
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function redactInterceptorText(value = "") {
  return redact(value);
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  INTERCEPTORS_VERSION,

  createInterceptorsState,

  useRequest,
  useResponse,
  useError,

  ejectInterceptor,
  enableInterceptor,
  disableInterceptor,
  clearInterceptors,
  resetInterceptorsRuntime,

  runRequestInterceptors,
  runResponseInterceptors,
  runErrorInterceptors,

  getInterceptorsSnapshot,
  redactInterceptorText,
};
