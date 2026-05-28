/* =========================================================
   Onion Support - Core Network
   Archivo: /src/core/network.js

   Responsabilidad:
   - Compat mínima de red.
   - Sin imports.
   - Sin fetch.
   - Sin healthcheck.
   - Sin Auth.
   - Sin Router.
   - Sin Store propio.
   - Sin Storage.
   - Sin UI.
   - Sólo online/offline.
   - Bind/unbind idempotente.
========================================================= */

export const NETWORK_VERSION = "core.network.v3";
export const NETWORK_SCOPE = "core:network";

export const NETWORK_EVENTS = Object.freeze({
  change: "app:network:change",
  online: "app:network:online",
  offline: "app:network:offline",
  state: "core:network:state",
  bound: "core:network:bound",
  unbound: "core:network:unbound",
});

let bound = false;
let stateRef = null;
let eventsRef = null;
let setStateRef = null;
let lastOnline = null;

const disposers = new Set();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function emit(events, name, payload = {}) {
  if (!name) return false;

  try {
    if (isFunction(events?.emit)) {
      events.emit(name, payload);
      return true;
    }

    if (isFunction(events?.dispatch)) {
      events.dispatch(name, payload);
      return true;
    }

    if (isFunction(events?.trigger)) {
      events.trigger(name, payload);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/* =========================================================
   READ
========================================================= */

function readOnline() {
  if (!isBrowser()) return null;

  try {
    return typeof navigator.onLine === "boolean" ? navigator.onLine : null;
  } catch {
    return null;
  }
}

function statusFromOnline(online = null) {
  if (online === true) return "online";
  if (online === false) return "offline";
  return "unknown";
}

function buildPatch(online = readOnline()) {
  const status = statusFromOnline(online);
  const offline = online === null ? null : !online;

  return {
    online,
    offline,

    networkOnline: online,
    networkOffline: offline,
    networkStatus: status,
  };
}

/* =========================================================
   WRITE
========================================================= */

function writeState(state = stateRef, patch = {}) {
  if (!isObject(patch)) return false;

  if (isFunction(setStateRef)) {
    try {
      setStateRef(patch, {
        source: NETWORK_SCOPE,
        silent: true,
        emit: false,
      });

      return true;
    } catch {
      // fallback a mutación directa abajo
    }
  }

  if (!isObject(state)) return false;

  try {
    Object.assign(state, patch);
    return true;
  } catch {
    return false;
  }
}

function sync(reason = "sync", shouldEmit = true) {
  const previousOnline = lastOnline;
  const online = readOnline();
  const changed = previousOnline !== online;

  lastOnline = online;

  const patch = buildPatch(online);

  writeState(stateRef, patch);

  const payload = {
    version: NETWORK_VERSION,
    online: patch.online,
    offline: patch.offline,
    status: patch.networkStatus,
    previousStatus: statusFromOnline(previousOnline),
    changed,
    reason,
    bound,
  };

  if (shouldEmit) {
    emit(eventsRef, NETWORK_EVENTS.state, payload);

    if (changed) {
      emit(eventsRef, NETWORK_EVENTS.change, payload);

      if (online === true) {
        emit(eventsRef, NETWORK_EVENTS.online, payload);
      }

      if (online === false) {
        emit(eventsRef, NETWORK_EVENTS.offline, payload);
      }
    }
  }

  return payload;
}

/* =========================================================
   LISTENERS
========================================================= */

function addWindowListener(name, handler) {
  if (!isBrowser() || !isFunction(window.addEventListener)) {
    return () => false;
  }

  try {
    window.addEventListener(name, handler, false);

    let disposed = false;

    const dispose = () => {
      if (disposed) return false;

      disposed = true;

      try {
        window.removeEventListener(name, handler, false);
        disposers.delete(dispose);
        return true;
      } catch {
        return false;
      }
    };

    disposers.add(dispose);

    return dispose;
  } catch {
    return () => false;
  }
}

function handleOnline() {
  sync("online", true);
}

function handleOffline() {
  sync("offline", true);
}

/* =========================================================
   PUBLIC API
========================================================= */

export function syncNetworkState({
  state = stateRef,
  events = eventsRef,
  setState = setStateRef,
  reason = "sync",
  emit: shouldEmit = true,
} = {}) {
  stateRef = state || stateRef;
  eventsRef = events || eventsRef;
  setStateRef = setState || setStateRef;

  return sync(reason, shouldEmit);
}

export function refreshNetworkContext(context = {}) {
  stateRef = context.state || stateRef;
  eventsRef = context.events || eventsRef;
  setStateRef = context.setState || setStateRef;

  return syncNetworkState({
    reason: "refresh",
    emit: context.emit === true,
  });
}

export function bindNetworkEvents({
  state = stateRef,
  events = eventsRef,
  setState = setStateRef,
  force = false,
} = {}) {
  stateRef = state || stateRef;
  eventsRef = events || eventsRef;
  setStateRef = setState || setStateRef;

  if (bound && !force) {
    sync("already-bound", false);
    return true;
  }

  if (bound && force) {
    unbindNetworkEvents();
  }

  if (!isBrowser()) {
    sync("server", false);
    return false;
  }

  addWindowListener("online", handleOnline);
  addWindowListener("offline", handleOffline);

  bound = true;

  const payload = sync("bind", false);

  emit(eventsRef, NETWORK_EVENTS.bound, payload);

  return true;
}

export function unbindNetworkEvents() {
  for (const dispose of [...disposers]) {
    try {
      dispose();
    } catch {
      // noop
    }
  }

  disposers.clear();
  bound = false;

  emit(eventsRef, NETWORK_EVENTS.unbound, {
    version: NETWORK_VERSION,
    online: lastOnline,
    status: statusFromOnline(lastOnline),
  });

  return true;
}

export function isNetworkOnline() {
  return readOnline() === true;
}

export function isNetworkOffline() {
  return readOnline() === false;
}

export function getNetworkStatus() {
  return statusFromOnline(readOnline());
}

export function getNetworkSnapshot({ state = stateRef } = {}) {
  const online = readOnline();

  return {
    version: NETWORK_VERSION,

    bound,
    listeners: disposers.size,

    online,
    offline: online === null ? null : !online,
    status: statusFromOnline(online),
    lastOnline,
    lastStatus: statusFromOnline(lastOnline),

    state: {
      online: state?.online ?? null,
      offline: state?.offline ?? null,
      networkOnline: state?.networkOnline ?? null,
      networkOffline: state?.networkOffline ?? null,
      networkStatus: state?.networkStatus || "",
    },

    policy: {
      minimalNetworkCompat: true,
      onlineOfflineOnly: true,

      noFetch: true,
      noHealthcheck: true,
      noAuth: true,
      noRouter: true,
      noStorage: true,
      noUi: true,

      setStatePreferred: true,
      directMutationOnlyAsFallback: true,

      bindIdempotent: true,
      unbindSupported: true,
      emitsChangeOnlyWhenStatusChanges: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
