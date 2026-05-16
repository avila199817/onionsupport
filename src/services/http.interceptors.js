/* =========================================================
   Onion SPA - HTTP Interceptors
   Archivo: src/services/http.interceptors.js

   HTTP INTERCEPTORS · FINAL SIMPLE
   - Hooks opcionales request / response / error
   - Registro, ejecución ordenada, enable/disable/eject/clear
   - Sin fetch, retry, refresh, Auth, Router, Toast, storage ni sesión
   - Snapshot seguro sin handlers ni tokens
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const INTERCEPTORS_VERSION = "20.0.0-final";

const TYPES = Object.freeze(["request", "response", "error"]);
const DEFAULT_TYPE = "request";
const MAX_RECENT = 30;

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const TOKENISH_TEXT_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)[^&#\s]+/gi;

let seq = 0;
let orderSeq = 0;

/* =========================================================
   BASICS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeInt(value, fallback = 0) {
  return Math.max(0, Math.trunc(safeNumber(value, fallback)));
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function isoNow(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function normalizeType(type = DEFAULT_TYPE) {
  const clean = safeText(type, DEFAULT_TYPE);
  return TYPES.includes(clean) ? clean : DEFAULT_TYPE;
}

function assertType(type = DEFAULT_TYPE) {
  const clean = safeText(type, "");

  if (!TYPES.includes(clean)) {
    throw new Error(`Tipo de interceptor inválido: ${clean}`);
  }

  return clean;
}

function nextId(type = DEFAULT_TYPE) {
  seq += 1;
  return `${normalizeType(type)}_${seq}`;
}

function nextOrder() {
  orderSeq += 1;
  return orderSeq;
}

function noopDisposer() {
  return false;
}

/* =========================================================
   SANITIZE
========================================================= */

function redactText(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "";

  try {
    return raw.replace(TOKENISH_TEXT_RE, (match) => {
      if (/^bearer\s+/i.test(match)) return "Bearer ***";
      if (/^[?&#]/.test(match)) return match.replace(/=.*/g, "=***");
      return "***";
    });
  } catch {
    return raw;
  }
}

function sanitizeError(error = null) {
  if (!error) return null;

  return {
    name: safeText(error?.name, "Error"),
    message: redactText(safeText(error?.message || error, "Interceptor error.")),
    code: error?.code || null,
    status: error?.status || error?.statusCode || null,
    timeout: error?.timeout === true,
    aborted: error?.aborted === true,
    at: isoNow(),
  };
}

function sanitizeValue(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (depth > 4) return "[depth-limit]";

  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return sanitizeError(value);

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitizeValue(item, depth + 1, keyHint, seen));
  }

  if (value && typeof value === "object") {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 60)) {
      output[key] = sanitizeValue(item, depth + 1, key, seen);
    }

    return output;
  }

  return redactText(String(value));
}

/* =========================================================
   STATE
========================================================= */

function createMeta() {
  return {
    version: INTERCEPTORS_VERSION,
    createdAt: isoNow(),
    registered: 0,
    replaced: 0,
    duplicates: 0,
    ejected: 0,
    cleared: 0,
    executed: 0,
    failed: 0,
    skipped: 0,
    onceRemoved: 0,
    rejectedRegisters: 0,
    lastRunAt: "",
    lastRunType: "",
    lastError: null,
    recent: [],
  };
}

export function createInterceptorsState() {
  return {
    request: [],
    response: [],
    error: [],
    meta: createMeta(),
  };
}

function ensureState(interceptors) {
  const state = isObject(interceptors) ? interceptors : createInterceptorsState();

  for (const type of TYPES) {
    if (!Array.isArray(state[type])) state[type] = [];
  }

  if (!isObject(state.meta)) state.meta = createMeta();

  const defaults = createMeta();

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in state.meta)) state.meta[key] = value;
  }

  if (!Array.isArray(state.meta.recent)) state.meta.recent = [];
  state.meta.version = INTERCEPTORS_VERSION;

  return state;
}

function bucketOf(interceptors, type = DEFAULT_TYPE) {
  const state = ensureState(interceptors);
  const cleanType = assertType(type);

  if (!Array.isArray(state[cleanType])) state[cleanType] = [];
  return state[cleanType];
}

function pushRecent(interceptors, event = {}) {
  const state = ensureState(interceptors);

  state.meta.recent.unshift({
    ...sanitizeValue(event),
    at: isoNow(),
  });

  if (state.meta.recent.length > MAX_RECENT) {
    state.meta.recent.splice(MAX_RECENT);
  }

  return true;
}

function touchRun(interceptors, type = "") {
  const state = ensureState(interceptors);

  state.meta.executed = safeInt(state.meta.executed) + 1;
  state.meta.lastRunAt = isoNow();
  state.meta.lastRunType = safeText(type, "");

  return state;
}

function recordSkipped(interceptors, type = "") {
  const state = ensureState(interceptors);
  state.meta.skipped = safeInt(state.meta.skipped) + 1;
  pushRecent(state, { event: "skipped", type });
  return true;
}

function recordError(interceptors, type, entry, error) {
  const state = ensureState(interceptors);

  state.meta.failed = safeInt(state.meta.failed) + 1;
  state.meta.lastError = {
    type: safeText(type, ""),
    interceptorId: safeText(entry?.id, ""),
    interceptorName: safeText(entry?.name, ""),
    ...sanitizeError(error),
  };

  pushRecent(state, { event: "error", ...state.meta.lastError });
  return state.meta.lastError;
}

/* =========================================================
   ENTRY
========================================================= */

function normalizeEntry(candidate, index = 0, type = DEFAULT_TYPE) {
  const cleanType = normalizeType(type);

  if (isFn(candidate)) {
    return {
      id: `legacy_${cleanType}_${index}`,
      name: candidate.name || `legacy_${cleanType}_${index}`,
      handler: candidate,
      priority: 0,
      failOpen: true,
      once: false,
      enabled: true,
      order: index,
      createdAt: "",
      runCount: 0,
      errorCount: 0,
      lastRunAt: "",
      lastDurationMs: 0,
      lastError: null,
      tags: [],
      meta: null,
      ref: candidate,
    };
  }

  if (isObject(candidate) && isFn(candidate.handler)) {
    return {
      id: safeText(candidate.id, `itc_${cleanType}_${candidate.order || index}`),
      name: safeText(candidate.name, candidate.handler.name || `interceptor_${cleanType}_${index}`),
      handler: candidate.handler,
      priority: safeNumber(candidate.priority, 0),
      failOpen: candidate.failClosed === true ? false : candidate.failOpen !== false,
      once: candidate.once === true,
      enabled: candidate.enabled !== false,
      order: safeNumber(candidate.order, index),
      createdAt: candidate.createdAt || "",
      runCount: safeInt(candidate.runCount, 0),
      errorCount: safeInt(candidate.errorCount, 0),
      lastRunAt: candidate.lastRunAt || "",
      lastDurationMs: safeInt(candidate.lastDurationMs, 0),
      lastError: candidate.lastError || null,
      tags: safeArray(candidate.tags),
      meta: isObject(candidate.meta) ? sanitizeValue(candidate.meta) : null,
      ref: candidate.ref || candidate,
    };
  }

  return null;
}

function sortedEnabled(bucket = [], type = DEFAULT_TYPE) {
  return bucket
    .map((entry, index) => normalizeEntry(entry, index, type))
    .filter(Boolean)
    .filter((entry) => entry.enabled !== false)
    .sort((a, b) => {
      const priority = safeNumber(b.priority, 0) - safeNumber(a.priority, 0);
      return priority || safeNumber(a.order, 0) - safeNumber(b.order, 0);
    });
}

function findIndex(bucket = [], ref) {
  return bucket.findIndex((item) => {
    if (item === ref) return true;
    if (item?.id === ref) return true;
    if (item?.name === ref) return true;
    if (item?.handler === ref) return true;
    if (item?.ref === ref) return true;
    return false;
  });
}

function patchRuntime(bucket = [], entry, patch = {}) {
  if (!Array.isArray(bucket) || !entry?.id) return false;

  const target = bucket.find((item) => (
    item === entry.ref ||
    item?.id === entry.id ||
    item?.handler === entry.handler ||
    item?.ref === entry.ref
  ));

  if (target && isObject(target)) {
    Object.assign(target, patch);
    return true;
  }

  return false;
}

/* =========================================================
   REGISTER / EJECT
========================================================= */

function normalizeRegistration(handlerOrEntry, options = {}) {
  if (isFn(handlerOrEntry)) {
    return { handler: handlerOrEntry, options: safeObject(options) };
  }

  if (isObject(handlerOrEntry) && isFn(handlerOrEntry.handler)) {
    return {
      handler: handlerOrEntry.handler,
      options: { ...handlerOrEntry, ...safeObject(options) },
    };
  }

  return { handler: null, options: safeObject(options) };
}

function registerInterceptor(interceptors, type, handlerOrEntry, options = {}) {
  const cleanType = assertType(type);
  const state = ensureState(interceptors);
  const bucket = bucketOf(state, cleanType);
  const { handler, options: opts } = normalizeRegistration(handlerOrEntry, options);

  if (!isFn(handler)) {
    state.meta.rejectedRegisters = safeInt(state.meta.rejectedRegisters) + 1;
    pushRecent(state, { event: "register:rejected", type: cleanType, reason: "handler-missing" });
    throw new Error(`use${cleanType[0].toUpperCase()}${cleanType.slice(1)}(fn) requiere una función`);
  }

  const id = safeText(opts.id, "") || nextId(cleanType);
  const existingIndex = bucket.findIndex((entry) => entry?.id === id);

  if (existingIndex >= 0 && opts.replace !== true && opts.overwrite !== true) {
    state.meta.duplicates = safeInt(state.meta.duplicates) + 1;
    pushRecent(state, { event: "duplicate", type: cleanType, id });
    return noopDisposer;
  }

  if (existingIndex >= 0) {
    bucket.splice(existingIndex, 1);
    state.meta.replaced = safeInt(state.meta.replaced) + 1;
  }

  const entry = {
    id,
    name: safeText(opts.name, handler.name || id),
    handler,
    priority: safeNumber(opts.priority, 0),
    failOpen: opts.failClosed === true ? false : opts.failOpen !== false,
    once: opts.once === true,
    enabled: opts.enabled !== false,
    order: nextOrder(),
    createdAt: isoNow(),
    runCount: 0,
    errorCount: 0,
    lastRunAt: "",
    lastDurationMs: 0,
    lastError: null,
    tags: safeArray(opts.tags),
    meta: isObject(opts.meta) ? sanitizeValue(opts.meta) : null,
    ref: handler,
  };

  bucket.push(entry);

  state.meta.registered = safeInt(state.meta.registered) + 1;
  pushRecent(state, {
    event: existingIndex >= 0 ? "replaced" : "registered",
    type: cleanType,
    id: entry.id,
    name: entry.name,
    priority: entry.priority,
    once: entry.once,
  });

  let disposed = false;

  return () => {
    if (disposed) return false;
    disposed = true;

    const index = findIndex(bucket, entry.id);
    if (index < 0) return false;

    bucket.splice(index, 1);
    state.meta.ejected = safeInt(state.meta.ejected) + 1;
    pushRecent(state, { event: "ejected", type: cleanType, id: entry.id });
    return true;
  };
}

export function useRequest(interceptors, fn, options = {}) {
  return registerInterceptor(interceptors, "request", fn, options);
}

export function useResponse(interceptors, fn, options = {}) {
  return registerInterceptor(interceptors, "response", fn, options);
}

export function useError(interceptors, fn, options = {}) {
  return registerInterceptor(interceptors, "error", fn, options);
}

export function ejectInterceptor(interceptors, type, ref) {
  const state = ensureState(interceptors);
  const cleanType = assertType(type);
  const bucket = bucketOf(state, cleanType);
  const index = findIndex(bucket, ref);

  if (index < 0) return false;

  bucket.splice(index, 1);
  state.meta.ejected = safeInt(state.meta.ejected) + 1;
  pushRecent(state, {
    event: "ejected",
    type: cleanType,
    ref: typeof ref === "function" ? "[handler]" : safeText(ref, "[handler]"),
  });

  return true;
}

function setEnabled(interceptors, type, ref, enabled) {
  const bucket = bucketOf(interceptors, type);
  const index = findIndex(bucket, ref);

  if (index < 0 || !isObject(bucket[index])) return false;

  bucket[index].enabled = Boolean(enabled);
  return true;
}

export function enableInterceptor(interceptors, type, ref) {
  return setEnabled(interceptors, type, ref, true);
}

export function disableInterceptor(interceptors, type, ref) {
  return setEnabled(interceptors, type, ref, false);
}

/* =========================================================
   RUNNER
========================================================= */

function buildContext(type, entry, extra = {}) {
  return {
    type,
    interceptor: {
      id: entry.id,
      name: entry.name,
      priority: entry.priority,
      once: entry.once,
      failOpen: entry.failOpen,
      order: entry.order,
      tags: entry.tags || [],
      meta: entry.meta || null,
    },
    ...extra,
  };
}

function patchSuccess(bucket, entry, startedAt) {
  const durationMs = nowMs() - startedAt;

  patchRuntime(bucket, entry, {
    runCount: safeInt(entry.runCount) + 1,
    lastRunAt: isoNow(),
    lastDurationMs: durationMs,
    lastError: null,
  });

  return durationMs;
}

function patchFailure(bucket, entry, startedAt, error) {
  const durationMs = nowMs() - startedAt;

  patchRuntime(bucket, entry, {
    errorCount: safeInt(entry.errorCount) + 1,
    lastRunAt: isoNow(),
    lastDurationMs: durationMs,
    lastError: sanitizeError(error),
  });

  return durationMs;
}

function removeOnce(state, type, entry) {
  if (!entry?.once) return false;

  const removed = ejectInterceptor(state, type, entry.id);

  if (removed) {
    state.meta.onceRemoved = safeInt(state.meta.onceRemoved) + 1;
  }

  return removed;
}

async function runChain({ interceptors, type, initialValue, requestConfig, invoke, applyResult } = {}) {
  const state = ensureState(interceptors);
  const bucket = bucketOf(state, type);
  const entries = sortedEnabled(bucket, type);

  let current = initialValue;

  if (!entries.length) {
    recordSkipped(state, type);
    return current;
  }

  touchRun(state, type);

  for (const entry of entries) {
    const startedAt = nowMs();

    try {
      const result = await entry.handler(...invoke(entry, current, requestConfig));

      patchSuccess(bucket, entry, startedAt);
      current = applyResult(current, result);
    } catch (error) {
      patchFailure(bucket, entry, startedAt, error);
      recordError(state, type, entry, error);

      if (entry.failOpen === false) throw error;
    } finally {
      removeOnce(state, type, entry);
    }
  }

  return current;
}

export function runRequestInterceptors(interceptors, requestConfig) {
  return runChain({
    interceptors,
    type: "request",
    initialValue: requestConfig,
    requestConfig,

    invoke(entry, current) {
      return [current, buildContext("request", entry)];
    },

    applyResult(current, result) {
      return result && typeof result === "object" ? result : current;
    },
  });
}

export function runResponseInterceptors(interceptors, response, requestConfig) {
  return runChain({
    interceptors,
    type: "response",
    initialValue: response,
    requestConfig,

    invoke(entry, current, cfg) {
      return [current, cfg, buildContext("response", entry)];
    },

    applyResult(current, result) {
      return result !== undefined ? result : current;
    },
  });
}

export function runErrorInterceptors(interceptors, error, requestConfig) {
  return runChain({
    interceptors,
    type: "error",
    initialValue: error,
    requestConfig,

    invoke(entry, current, cfg) {
      return [current, cfg, buildContext("error", entry)];
    },

    applyResult(current, result) {
      return result !== undefined ? result : current;
    },
  });
}

/* =========================================================
   MANAGEMENT
========================================================= */

export function clearInterceptors(interceptors, type = "") {
  const state = ensureState(interceptors);
  const cleanType = safeText(type, "");

  if (cleanType) {
    const bucket = bucketOf(state, cleanType);
    const count = bucket.length;

    bucket.splice(0);

    state.meta.ejected = safeInt(state.meta.ejected) + count;
    state.meta.cleared = safeInt(state.meta.cleared) + count;
    pushRecent(state, { event: "cleared", type: cleanType, count });

    return count;
  }

  let total = 0;

  for (const item of TYPES) {
    total += clearInterceptors(state, item);
  }

  return total;
}

export function resetInterceptorsRuntime(interceptors) {
  const state = ensureState(interceptors);

  for (const type of TYPES) {
    const bucket = bucketOf(state, type);

    for (const entry of bucket) {
      if (!isObject(entry)) continue;

      entry.runCount = 0;
      entry.errorCount = 0;
      entry.lastRunAt = "";
      entry.lastDurationMs = 0;
      entry.lastError = null;
    }
  }

  state.meta.executed = 0;
  state.meta.failed = 0;
  state.meta.skipped = 0;
  state.meta.lastRunAt = "";
  state.meta.lastRunType = "";
  state.meta.lastError = null;
  state.meta.recent = [];

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function serializeBucket(state, type) {
  return bucketOf(state, type).map((entry, index) => {
    const normalized = normalizeEntry(entry, index, type);

    return {
      id: normalized?.id || "",
      name: normalized?.name || "",
      priority: normalized?.priority || 0,
      failOpen: normalized?.failOpen !== false,
      once: normalized?.once === true,
      enabled: normalized?.enabled !== false,
      order: normalized?.order || 0,
      createdAt: normalized?.createdAt || "",
      runCount: normalized?.runCount || 0,
      errorCount: normalized?.errorCount || 0,
      lastRunAt: normalized?.lastRunAt || "",
      lastDurationMs: normalized?.lastDurationMs || 0,
      lastError: normalized?.lastError ? sanitizeError(normalized.lastError) : null,
      tags: normalized?.tags || [],
      meta: normalized?.meta || null,
    };
  });
}

export function getInterceptorsSnapshot(interceptors) {
  const state = ensureState(interceptors);

  return sanitizeValue({
    version: INTERCEPTORS_VERSION,
    counts: {
      request: state.request.length,
      response: state.response.length,
      error: state.error.length,
    },
    activeCounts: {
      request: sortedEnabled(state.request, "request").length,
      response: sortedEnabled(state.response, "response").length,
      error: sortedEnabled(state.error, "error").length,
    },
    request: serializeBucket(state, "request"),
    response: serializeBucket(state, "response"),
    error: serializeBucket(state, "error"),
    meta: {
      ...state.meta,
      lastError: state.meta.lastError ? sanitizeError(state.meta.lastError) : null,
      recent: safeArray(state.meta.recent).slice(0, MAX_RECENT).map((item) => sanitizeValue(item)),
    },
    policy: {
      ownFetch: false,
      ownRetry: false,
      ownRefresh: false,
      ownAuth: false,
      ownRouter: false,
      ownToast: false,
      ownStorage: false,
    },
    at: isoNow(),
  });
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
};
