/* =========================================================
   Onion SPA - Core Network
   Archivo: src/core/network.js

   CORE NETWORK · CLEAN
   - Bind idempotente de conectividad
   - State sync seguro online/offline/unknown
   - Cleanup compatible
   - Sin event storm
========================================================= */

import { isBrowser } from "./helpers.js";

export const NETWORK_VERSION = "18.0.0-clean";
export const NETWORK_SCOPE = "core:network";

export const NETWORK_EVENTS = Object.freeze({
  change: "app:network:change",
  online: "app:network:online",
  offline: "app:network:offline",
  state: "core:network:state",
  bound: "core:network:bound",
  unbound: "core:network:unbound",
  visibility: "core:network:visibility",
  focus: "core:network:focus",
  pageShow: "core:network:pageshow",
  pageHide: "core:network:pagehide",
  connection: "core:network:connection",
  error: "core:network:error",
});

const MIN_PASSIVE_SYNC_MS = 350;
const MAX_RECENT = 36;

const PASSIVE_REASONS = new Set([
  "manual",
  "focus",
  "pageshow",
  "visibilitychange",
  "already-bound",
  "refresh-context",
  "snapshot",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

let bound = false;
let bindingId = 0;

let lastOnline = null;
let lastStatus = "unknown";
let lastReason = "";
let lastSyncAt = 0;
let lastChangeAt = 0;
let lastVisibilityState = null;
let lastHidden = null;
let lastConnectionFingerprint = "";
let lastError = null;

const manualDisposers = new Set();
const recent = [];

const stats = {
  bind: 0,
  unbind: 0,
  sync: 0,
  changed: 0,
  online: 0,
  offline: 0,
  unknown: 0,
  visibility: 0,
  focus: 0,
  pageShow: 0,
  pageHide: 0,
  connection: 0,
  throttled: 0,
  errors: 0,
};

const active = {
  state: null,
  events: null,
  cleanup: null,
  utils: null,
  setState: null,
  scope: NETWORK_SCOPE,
};

/* =========================================================
   BASICS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function clone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";

  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : value;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: safeText(value.message, "Error"),
      stack: value.stack ? "[stack]" : "",
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitize(item, depth + 1, keyHint));
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = sanitize(item, depth + 1, key);
    }

    return output;
  }

  try {
    return String(value);
  } catch {
    return "[unserializable]";
  }
}

function emit(events, name, payload = {}) {
  const eventName = safeText(name, "");
  if (!eventName) return false;

  const clean = sanitize({
    version: NETWORK_VERSION,
    source: "core.network",
    at: iso(),
    ...payload,
  });

  try {
    if (isFn(events?.emit)) {
      events.emit(eventName, clean);
      return true;
    }
  } catch {}

  try {
    if (isFn(events?.dispatch)) {
      events.dispatch(eventName, clean);
      return true;
    }
  } catch {}

  try {
    if (isFn(events?.trigger)) {
      events.trigger(eventName, clean);
      return true;
    }
  } catch {}

  return false;
}

function warn(utils, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    if (isFn(utils?.warn)) {
      utils.warn("[Network]", ...clean);
      return;
    }
  } catch {}

  try {
    if (utils?.debug === true) console.warn("[Network]", ...clean);
  } catch {}
}

function log(utils, ...args) {
  try {
    utils?.log?.("[Network]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function record(type = "event", payload = {}) {
  const atMs = now();

  recent.unshift({
    type,
    ...sanitize(payload),
    at: iso(atMs),
    atMs,
  });

  if (recent.length > MAX_RECENT) recent.splice(MAX_RECENT);
}

function recordError(error, source = "network") {
  const payload = {
    source,
    name: safeText(error?.name, "Error"),
    message: safeText(error?.message || error, "Network error."),
    at: iso(),
  };

  lastError = payload;
  stats.errors += 1;
  record("error", payload);

  try {
    active.utils?.error?.("[Network]", payload.message, error);
  } catch {}

  emit(active.events, NETWORK_EVENTS.error, payload);
  return payload;
}

/* =========================================================
   BROWSER SIGNALS
========================================================= */

function fallbackOnlineFromReason(reason = "") {
  const clean = safeText(reason, "");
  if (clean === "online") return true;
  if (clean === "offline") return false;
  return null;
}

function getNavigatorOnline(reason = "") {
  if (!isBrowser()) return null;

  try {
    if (typeof navigator.onLine === "boolean") return navigator.onLine;
  } catch {}

  return fallbackOnlineFromReason(reason);
}

function statusFromOnline(online = null) {
  if (online === true) return "online";
  if (online === false) return "offline";
  return "unknown";
}

function getVisibilityState() {
  if (!isBrowser()) return null;

  try {
    return document.visibilityState || null;
  } catch {
    return null;
  }
}

function getHidden() {
  if (!isBrowser()) return null;

  try {
    return typeof document.hidden === "boolean" ? document.hidden : null;
  } catch {
    return null;
  }
}

function getConnection() {
  if (!isBrowser()) return null;

  try {
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  } catch {
    return null;
  }
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function connectionSnapshot() {
  const connection = getConnection();
  if (!connection) return null;

  try {
    return {
      effectiveType: connection.effectiveType || null,
      type: connection.type || null,
      downlink: numeric(connection.downlink),
      downlinkMax: numeric(connection.downlinkMax),
      rtt: numeric(connection.rtt),
      saveData: typeof connection.saveData === "boolean" ? connection.saveData : null,
      supportsChangeEvent: isFn(connection.addEventListener),
      supportsOnChange: "onchange" in connection,
    };
  } catch {
    return null;
  }
}

function fingerprint(connection = connectionSnapshot()) {
  if (!connection) return "";

  return [
    connection.effectiveType || "",
    connection.type || "",
    connection.downlink ?? "",
    connection.downlinkMax ?? "",
    connection.rtt ?? "",
    connection.saveData ?? "",
  ].join("|");
}

function browserSnapshot() {
  const online = getNavigatorOnline();

  return {
    browser: isBrowser(),
    online,
    offline: online === null ? null : !online,
    status: statusFromOnline(online),
    visibilityState: getVisibilityState(),
    hidden: getHidden(),
    connection: connectionSnapshot(),
    at: iso(),
  };
}

/* =========================================================
   CONTEXT / STATE
========================================================= */

function updateContext(context = {}) {
  if (Object.prototype.hasOwnProperty.call(context, "state")) active.state = context.state || null;
  if (Object.prototype.hasOwnProperty.call(context, "events")) active.events = context.events || null;
  if (Object.prototype.hasOwnProperty.call(context, "cleanup")) active.cleanup = context.cleanup || null;
  if (Object.prototype.hasOwnProperty.call(context, "utils")) active.utils = context.utils || null;
  if (Object.prototype.hasOwnProperty.call(context, "setState")) active.setState = isFn(context.setState) ? context.setState : null;
  if (context.scope) active.scope = safeText(context.scope, NETWORK_SCOPE);

  return active;
}

function buildPatch({ online, reason = "sync", changed = false } = {}) {
  const atMs = now();
  const status = statusFromOnline(online);
  const connection = connectionSnapshot();

  const patch = {
    networkStatus: status,
    networkKnown: online === true || online === false,

    networkConnection: connection,
    networkEffectiveType: connection?.effectiveType || null,
    networkType: connection?.type || null,
    networkDownlink: connection?.downlink ?? null,
    networkDownlinkMax: connection?.downlinkMax ?? null,
    networkRtt: connection?.rtt ?? null,
    networkSaveData: connection?.saveData ?? null,

    networkVisibilityState: getVisibilityState(),
    networkHidden: getHidden(),

    lastNetworkReason: safeText(reason, "sync"),
    lastNetworkSyncAt: iso(atMs),
    lastNetworkSyncAtMs: atMs,
  };

  if (changed) {
    patch.lastNetworkChangeAt = iso(atMs);
    patch.lastNetworkChangeAtMs = atMs;
  }

  if (online === true || online === false) {
    patch.online = online;
    patch.offline = !online;
    patch.networkOnline = online;
    patch.networkOffline = !online;
  } else {
    patch.online = null;
    patch.offline = null;
    patch.networkOnline = null;
    patch.networkOffline = null;
  }

  return patch;
}

function writeState(state, patch = {}, setState = null) {
  if (!state || typeof state !== "object") return false;

  const unknown = patch.online === null || patch.networkOnline === null;

  if (isFn(setState) && !unknown) {
    try {
      setState(patch, {
        source: "core:network",
        emitDerived: false,
      });

      try {
        Object.assign(state, patch);
      } catch {}

      return true;
    } catch {}
  }

  try {
    Object.assign(state, patch);
    return true;
  } catch {
    return false;
  }
}

function buildPayload({ online, reason = "sync", changed = false, throttled = false, source = "network" } = {}) {
  const status = statusFromOnline(online);

  return {
    online,
    offline: online === null ? null : !online,
    status,
    known: online === true || online === false,

    reason: safeText(reason, "sync"),
    source: safeText(source, "network"),
    changed: Boolean(changed),
    throttled: Boolean(throttled),

    bound: Boolean(bound),
    bindingId,

    visibilityState: getVisibilityState(),
    hidden: getHidden(),
    connection: connectionSnapshot(),

    stateOnline: active.state?.online ?? null,
    stateOffline: active.state?.offline ?? null,
    stateStatus: active.state?.networkStatus || "",
  };
}

function shouldThrottle({ reason, force, online, status, visibilityState, hidden, connectionFp } = {}) {
  if (force) return false;
  if (!PASSIVE_REASONS.has(safeText(reason, ""))) return false;

  if (
    online !== lastOnline ||
    status !== lastStatus ||
    visibilityState !== lastVisibilityState ||
    hidden !== lastHidden ||
    connectionFp !== lastConnectionFingerprint
  ) {
    return false;
  }

  return lastSyncAt > 0 && now() - lastSyncAt < MIN_PASSIVE_SYNC_MS;
}

/* =========================================================
   SYNC
========================================================= */

export function syncNetworkState({
  state,
  events,
  utils,
  setState,
  reason = "sync",
  emit: shouldEmit = true,
  force = false,
  source = "network",
} = {}) {
  updateContext({ state, events, utils, setState });

  const online = getNavigatorOnline(reason);
  const status = statusFromOnline(online);
  const visibilityState = getVisibilityState();
  const hidden = getHidden();
  const connectionFp = fingerprint();

  if (shouldThrottle({ reason, force, online, status, visibilityState, hidden, connectionFp })) {
    stats.throttled += 1;

    const payload = buildPayload({
      online: lastOnline,
      reason: `${safeText(reason, "sync")}:throttled`,
      throttled: true,
      source,
    });

    if (shouldEmit) emit(active.events, NETWORK_EVENTS.state, payload);
    record("throttled", payload);

    return payload;
  }

  const changed = lastStatus !== status || lastOnline !== online;
  const patch = buildPatch({ online, reason, changed });

  writeState(active.state, patch, active.setState);

  lastOnline = online;
  lastStatus = status;
  lastReason = safeText(reason, "sync");
  lastSyncAt = now();
  lastVisibilityState = visibilityState;
  lastHidden = hidden;
  lastConnectionFingerprint = connectionFp;

  stats.sync += 1;

  if (changed) {
    lastChangeAt = lastSyncAt;
    stats.changed += 1;
  }

  const payload = buildPayload({ online, reason, changed, source });

  if (shouldEmit) {
    emit(active.events, NETWORK_EVENTS.state, payload);

    if (changed) {
      emit(active.events, NETWORK_EVENTS.change, payload);

      if (online === true) {
        stats.online += 1;
        emit(active.events, NETWORK_EVENTS.online, payload);
        log(active.utils, "Conectividad recuperada.", payload);
      } else if (online === false) {
        stats.offline += 1;
        emit(active.events, NETWORK_EVENTS.offline, payload);
        warn(active.utils, "El navegador está offline.", payload);
      } else {
        stats.unknown += 1;
      }
    }
  }

  record(changed ? "change" : "state", payload);
  return payload;
}

export function refreshNetworkContext(context = {}) {
  updateContext(context);

  return syncNetworkState({
    state: active.state,
    events: active.events,
    utils: active.utils,
    setState: active.setState,
    reason: "refresh-context",
    emit: context.emit === true,
    force: context.force === true,
    source: "refreshNetworkContext",
  });
}

/* =========================================================
   DISPOSERS / BINDING
========================================================= */

function normalizeDisposer(candidate) {
  if (isFn(candidate)) return candidate;
  if (isFn(candidate?.dispose)) return () => candidate.dispose();
  if (isFn(candidate?.off)) return () => candidate.off();
  if (isFn(candidate?.remove)) return () => candidate.remove();
  return null;
}

function addManualDisposer(disposer) {
  if (isFn(disposer)) manualDisposers.add(disposer);
  return disposer;
}

function clearManualDisposers() {
  for (const dispose of Array.from(manualDisposers)) {
    try {
      dispose?.();
    } catch {}
  }

  manualDisposers.clear();
}

function ensureCleanupScope(cleanup, scope = NETWORK_SCOPE) {
  try {
    if (isFn(cleanup?.ensureScope)) return Boolean(cleanup.ensureScope(scope));
  } catch {}

  try {
    if (isFn(cleanup?.scope)) return Boolean(cleanup.scope(scope));
  } catch {}

  return false;
}

function bindDom({ cleanup, scope, target, eventName, handler, options = { passive: true } } = {}) {
  if (!target || !eventName || !isFn(handler)) return () => false;

  try {
    if (isFn(cleanup?.event)) {
      const maybe = cleanup.event(scope, target, eventName, handler, options);
      const dispose = normalizeDisposer(maybe);
      if (dispose) return dispose;
    }
  } catch {}

  try {
    if (isFn(cleanup?.on)) {
      const maybe = cleanup.on(scope, target, eventName, handler, options);
      const dispose = normalizeDisposer(maybe);
      if (dispose) return dispose;
    }
  } catch {}

  try {
    target.addEventListener(eventName, handler, options);

    const dispose = () => {
      try {
        target.removeEventListener(eventName, handler, options);
        manualDisposers.delete(dispose);
        return true;
      } catch {
        return false;
      }
    };

    addManualDisposer(dispose);
    return dispose;
  } catch (error) {
    recordError(error, `bind:${eventName}`);
    return () => false;
  }
}

function bindConnection(cleanup, scope) {
  const connection = getConnection();
  if (!connection) return () => false;

  if (isFn(connection.addEventListener)) {
    return bindDom({
      cleanup,
      scope,
      target: connection,
      eventName: "change",
      handler: handleConnectionChange,
    });
  }

  try {
    const previous = connection.onchange;

    const wrapped = function wrappedConnectionChange(event) {
      try {
        if (isFn(previous)) previous.call(this, event);
      } catch {}

      handleConnectionChange(event);
    };

    connection.onchange = wrapped;

    const dispose = () => {
      try {
        if (connection.onchange === wrapped) connection.onchange = previous || null;
        manualDisposers.delete(dispose);
        return true;
      } catch {
        return false;
      }
    };

    addManualDisposer(dispose);
    return dispose;
  } catch (error) {
    recordError(error, "bind:connection-onchange");
    return () => false;
  }
}

/* =========================================================
   HANDLERS
========================================================= */

function handleOnline() {
  syncNetworkState({
    state: active.state,
    events: active.events,
    utils: active.utils,
    setState: active.setState,
    reason: "online",
    emit: true,
    source: "window:online",
  });
}

function handleOffline() {
  syncNetworkState({
    state: active.state,
    events: active.events,
    utils: active.utils,
    setState: active.setState,
    reason: "offline",
    emit: true,
    source: "window:offline",
  });
}

function handleVisibilityChange() {
  const before = lastVisibilityState;

  const payload = syncNetworkState({
    state: active.state,
    events: active.events,
    utils: active.utils,
    setState: active.setState,
    reason: "visibilitychange",
    emit: true,
    source: "document:visibilitychange",
  });

  if (payload?.throttled === true) return;

  const next = getVisibilityState();

  if (before !== next) {
    stats.visibility += 1;
    const eventPayload = { ...payload, visibilityState: next };
    emit(active.events, NETWORK_EVENTS.visibility, eventPayload);
    record("visibility", eventPayload);
  }
}

function handleFocus() {
  const payload = syncNetworkState({
    state: active.state,
    events: active.events,
    utils: active.utils,
    setState: active.setState,
    reason: "focus",
    emit: true,
    source: "window:focus",
  });

  if (payload?.throttled === true) return;

  stats.focus += 1;
  emit(active.events, NETWORK_EVENTS.focus, payload);
  record("focus", payload);
}

function handlePageShow(event = null) {
  const payload = syncNetworkState({
    state: active.state,
    events: active.events,
    utils: active.utils,
    setState: active.setState,
    reason: "pageshow",
    emit: true,
    source: "window:pageshow",
  });

  if (payload?.throttled === true) return;

  stats.pageShow += 1;

  const eventPayload = {
    ...payload,
    persisted: Boolean(event?.persisted),
  };

  emit(active.events, NETWORK_EVENTS.pageShow, eventPayload);
  record("pageshow", eventPayload);
}

function handlePageHide(event = null) {
  stats.pageHide += 1;

  const payload = {
    ...buildPayload({
      online: lastOnline,
      reason: "pagehide",
      changed: false,
      source: "window:pagehide",
    }),
    persisted: Boolean(event?.persisted),
  };

  emit(active.events, NETWORK_EVENTS.pageHide, payload);
  record("pagehide", payload);
}

function handleConnectionChange() {
  const before = lastConnectionFingerprint;

  const payload = syncNetworkState({
    state: active.state,
    events: active.events,
    utils: active.utils,
    setState: active.setState,
    reason: "connection-change",
    emit: before !== fingerprint(),
    source: "navigator:connection",
  });

  if (payload?.throttled === true) return;

  stats.connection += 1;

  const eventPayload = {
    ...payload,
    changed: before !== fingerprint(),
    connection: connectionSnapshot(),
  };

  emit(active.events, NETWORK_EVENTS.connection, eventPayload);
  record("connection", eventPayload);
}

/* =========================================================
   BIND / UNBIND
========================================================= */

export function bindNetworkEvents({
  state,
  events,
  cleanup,
  utils,
  setState,
  scope = NETWORK_SCOPE,
  force = false,
} = {}) {
  const previous = { ...active };

  updateContext({ state, events, cleanup, utils, setState, scope });

  if (!isBrowser()) {
    const patch = buildPatch({
      online: null,
      reason: "server",
      changed: false,
    });

    writeState(active.state, patch, active.setState);
    record("server", { status: "unknown" });

    return false;
  }

  if (bound && !force) {
    syncNetworkState({
      state: active.state,
      events: active.events,
      utils: active.utils,
      setState: active.setState,
      reason: "already-bound",
      emit: false,
      source: "bindNetworkEvents",
    });

    return true;
  }

  if (bound && force) {
    unbindNetworkEvents({
      cleanup: previous.cleanup || cleanup,
      events: previous.events || events,
      utils: previous.utils || utils,
      scope: previous.scope || scope,
    });

    updateContext({ state, events, cleanup, utils, setState, scope });
  }

  try {
    ensureCleanupScope(cleanup, scope);

    bindDom({ cleanup, scope, target: window, eventName: "online", handler: handleOnline });
    bindDom({ cleanup, scope, target: window, eventName: "offline", handler: handleOffline });
    bindDom({ cleanup, scope, target: document, eventName: "visibilitychange", handler: handleVisibilityChange });
    bindDom({ cleanup, scope, target: window, eventName: "focus", handler: handleFocus });
    bindDom({ cleanup, scope, target: window, eventName: "pageshow", handler: handlePageShow });
    bindDom({ cleanup, scope, target: window, eventName: "pagehide", handler: handlePageHide });
    bindConnection(cleanup, scope);

    bound = true;
    bindingId += 1;
    stats.bind += 1;

    lastVisibilityState = getVisibilityState();
    lastHidden = getHidden();
    lastConnectionFingerprint = fingerprint();

    const payload = syncNetworkState({
      state: active.state,
      events: active.events,
      utils: active.utils,
      setState: active.setState,
      reason: "bind",
      emit: false,
      force: true,
      source: "bindNetworkEvents",
    });

    const boundPayload = {
      ...payload,
      scope,
      bindingId,
      hasConnectionApi: Boolean(getConnection()),
    };

    emit(active.events, NETWORK_EVENTS.bound, boundPayload);
    record("bound", boundPayload);
    log(active.utils, "Network events activos.", boundPayload);

    return true;
  } catch (error) {
    recordError(error, "bindNetworkEvents");
    return false;
  }
}

export function unbindNetworkEvents({ cleanup, events, utils, scope = NETWORK_SCOPE } = {}) {
  const finalCleanup = cleanup || active.cleanup;
  const finalEvents = events || active.events;
  const finalUtils = utils || active.utils;
  const finalScope = safeText(scope || active.scope, NETWORK_SCOPE);

  try {
    if (isFn(finalCleanup?.run)) finalCleanup.run(finalScope);
    else if (isFn(finalCleanup?.clear)) finalCleanup.clear(finalScope);
    else if (isFn(finalCleanup?.dispose)) finalCleanup.dispose(finalScope);
  } catch (error) {
    recordError(error, "unbindNetworkEvents:cleanup");
  }

  clearManualDisposers();

  bound = false;
  stats.unbind += 1;

  const payload = {
    scope: finalScope,
    bindingId,
  };

  emit(finalEvents, NETWORK_EVENTS.unbound, payload);
  record("unbound", payload);
  log(finalUtils, "Network events desactivados.");

  return true;
}

/* =========================================================
   PUBLIC STATUS HELPERS
========================================================= */

export function isNetworkOnline() {
  return getNavigatorOnline() === true;
}

export function isNetworkOffline() {
  return getNavigatorOnline() === false;
}

export function getNetworkStatus() {
  return statusFromOnline(getNavigatorOnline());
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getNetworkSnapshot({ state, includeRecent = true } = {}) {
  const sourceState = state || active.state;
  const currentOnline = getNavigatorOnline();
  const connection = connectionSnapshot();

  return sanitize({
    version: NETWORK_VERSION,
    bound: Boolean(bound),
    bindingId,

    online: currentOnline,
    offline: currentOnline === null ? null : !currentOnline,
    status: statusFromOnline(currentOnline),
    known: currentOnline === true || currentOnline === false,

    lastOnline,
    lastStatus,
    lastReason,
    lastSyncAt,
    lastSyncAtIso: lastSyncAt ? iso(lastSyncAt) : "",
    lastChangeAt,
    lastChangeAtIso: lastChangeAt ? iso(lastChangeAt) : "",
    lastVisibilityState,
    lastHidden,
    lastConnectionFingerprint,
    currentConnectionFingerprint: fingerprint(connection),

    activeScope: active.scope,
    manualDisposerCount: manualDisposers.size,

    activeContext: {
      hasState: Boolean(active.state),
      hasEvents: Boolean(active.events),
      hasCleanup: Boolean(active.cleanup),
      hasUtils: Boolean(active.utils),
      hasSetState: Boolean(active.setState),
    },

    stats: {
      ...stats,
      manualDisposers: manualDisposers.size,
    },

    state: {
      online: sourceState?.online ?? null,
      offline: sourceState?.offline ?? null,
      networkOnline: sourceState?.networkOnline ?? null,
      networkOffline: sourceState?.networkOffline ?? null,
      networkKnown: sourceState?.networkKnown ?? null,
      networkStatus: sourceState?.networkStatus || "",
      lastNetworkReason: sourceState?.lastNetworkReason || "",
      lastNetworkSyncAt: sourceState?.lastNetworkSyncAt || "",
      lastNetworkChangeAt: sourceState?.lastNetworkChangeAt || "",
      visibilityState: sourceState?.networkVisibilityState || "",
      hidden: sourceState?.networkHidden ?? null,
      connection: sourceState?.networkConnection || null,
      effectiveType: sourceState?.networkEffectiveType || null,
      connectionType: sourceState?.networkType || null,
      downlink: sourceState?.networkDownlink ?? null,
      downlinkMax: sourceState?.networkDownlinkMax ?? null,
      rtt: sourceState?.networkRtt ?? null,
      saveData: sourceState?.networkSaveData ?? null,
    },

    browser: browserSnapshot(),
    recent: includeRecent === false ? [] : recent.map((item) => ({ ...item })),
    lastError: lastError ? clone(lastError, null) : null,
    at: iso(),
  });
}

export default {
  NETWORK_VERSION,
  NETWORK_SCOPE,
  NETWORK_EVENTS,

  bindNetworkEvents,
  bind: bindNetworkEvents,

  unbindNetworkEvents,
  unbind: unbindNetworkEvents,
  dispose: unbindNetworkEvents,

  refreshNetworkContext,
  syncNetworkState,

  isNetworkOnline,
  isNetworkOffline,
  getNetworkStatus,

  getNetworkSnapshot,
  getDebugSnapshot: getNetworkSnapshot,
  snapshot: getNetworkSnapshot,
};
