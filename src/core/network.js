/* =========================================================
   Onion SPA - Core Network
   Archivo: src/core/network.js

   Responsabilidades:
   - bind de eventos de conectividad del navegador
   - sincronizar estado online/offline
   - emitir eventos de red del core
   - registrar diagnóstico básico de conectividad
   - evitar listeners duplicados
   - exponer snapshot de red

   HARDENING EXTREMO:
   - idempotencia total
   - browser/server safe
   - cleanup scope estable
   - fallback si cleanup no existe
   - soporte navigator.connection
   - eventos online/offline/visibility/focus
   - estado online inicial sincronizado
   - cero throws accidentales
========================================================= */

import { isBrowser } from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const NETWORK_SCOPE =
  "core:network";

const NETWORK_EVENTS =
  Object.freeze({
    change:
      "app:network:change",

    online:
      "app:network:online",

    offline:
      "app:network:offline",

    state:
      "core:network:state",

    bound:
      "core:network:bound",

    unbound:
      "core:network:unbound",

    error:
      "core:network:error",
  });

/* =========================================================
   MODULE STATE
========================================================= */

let bound =
  false;

let lastOnline =
  null;

let lastReason =
  "";

let lastChangeAt =
  0;

const manualDisposers =
  [];

/* =========================================================
   HELPERS
========================================================= */

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

function isFunction(value) {
  return typeof value === "function";
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeEmit(events, name, payload = {}) {
  try {
    events?.emit?.(
      name,
      payload
    );

    return true;
  } catch {}

  return false;
}

function safeLog(utils, ...args) {
  try {
    utils?.log?.(
      "[Network]",
      ...args
    );
  } catch {}
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.(
      "[Network]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[Network]",
      ...args
    );
  } catch {}
}

function safeError(utils, events, error, source = "network") {
  const payload = {
    source:
      safeText(source, "network"),

    message:
      safeText(
        error?.message || error,
        "Network error."
      ),

    at:
      safeIsoDate(),
  };

  try {
    utils?.error?.(
      "[Network]",
      payload.message,
      error
    );
  } catch {}

  safeEmit(
    events,
    NETWORK_EVENTS.error,
    payload
  );

  return payload;
}

function getNavigatorOnline() {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
  } catch {}

  return null;
}

function getVisibilityState() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return document.visibilityState || null;
  } catch {}

  return null;
}

function getConnectionSnapshot() {
  if (!isBrowser()) {
    return null;
  }

  try {
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection ||
      null;

    if (!connection) {
      return null;
    }

    return {
      effectiveType:
        connection.effectiveType || null,

      type:
        connection.type || null,

      downlink:
        Number.isFinite(Number(connection.downlink))
          ? Number(connection.downlink)
          : null,

      rtt:
        Number.isFinite(Number(connection.rtt))
          ? Number(connection.rtt)
          : null,

      saveData:
        typeof connection.saveData === "boolean"
          ? connection.saveData
          : null,
    };
  } catch {}

  return null;
}

function getBrowserNetworkSnapshot() {
  return {
    browser:
      isBrowser(),

    online:
      getNavigatorOnline(),

    visibilityState:
      getVisibilityState(),

    connection:
      getConnectionSnapshot(),

    at:
      safeIsoDate(),
  };
}

function writeNetworkState(state, {
  online,
  reason = "sync",
  changed = false,
} = {}) {
  if (!state || typeof state !== "object") {
    return false;
  }

  const atMs =
    Date.now();

  try {
    state.online =
      online;

    state.offline =
      online === null
        ? null
        : !online;

    state.networkOnline =
      online;

    state.networkOffline =
      online === null
        ? null
        : !online;

    state.networkStatus =
      online === null
        ? "unknown"
        : online
          ? "online"
          : "offline";

    state.lastNetworkReason =
      safeText(reason, "sync");

    state.lastNetworkChangeAt =
      changed
        ? safeIsoDate(atMs)
        : state.lastNetworkChangeAt || "";

    state.lastNetworkChangeAtMs =
      changed
        ? atMs
        : state.lastNetworkChangeAtMs || 0;

    state.networkConnection =
      getConnectionSnapshot();

    return true;
  } catch {}

  return false;
}

function buildPayload({
  state,
  online,
  reason = "sync",
  changed = false,
} = {}) {
  return {
    online,

    offline:
      online === null
        ? null
        : !online,

    status:
      online === null
        ? "unknown"
        : online
          ? "online"
          : "offline",

    reason:
      safeText(reason, "sync"),

    changed:
      Boolean(changed),

    bound:
      Boolean(bound),

    visibilityState:
      getVisibilityState(),

    connection:
      getConnectionSnapshot(),

    stateOnline:
      state?.online ?? null,

    at:
      safeIsoDate(),
  };
}

function emitNetworkState({
  state,
  events,
  utils,
  online,
  reason = "sync",
  changed = false,
  silent = false,
} = {}) {
  const payload =
    buildPayload({
      state,
      online,
      reason,
      changed,
    });

  if (!silent) {
    safeEmit(
      events,
      NETWORK_EVENTS.state,
      payload
    );

    safeEmit(
      events,
      NETWORK_EVENTS.change,
      payload
    );

    if (online === true) {
      safeEmit(
        events,
        NETWORK_EVENTS.online,
        payload
      );

      safeLog(
        utils,
        "Conectividad recuperada.",
        payload
      );
    } else if (online === false) {
      safeEmit(
        events,
        NETWORK_EVENTS.offline,
        payload
      );

      safeWarn(
        utils,
        "El navegador está offline.",
        payload
      );
    }
  }

  return payload;
}

function addManualDisposer(disposer) {
  if (isFunction(disposer)) {
    manualDisposers.push(disposer);
  }

  return disposer;
}

function bindDomEvent({
  cleanup,
  scope = NETWORK_SCOPE,
  target,
  eventName,
  handler,
  options = false,
} = {}) {
  if (
    !target ||
    !eventName ||
    !isFunction(handler)
  ) {
    return () => false;
  }

  try {
    if (isFunction(cleanup?.on)) {
      return cleanup.on(
        scope,
        target,
        eventName,
        handler,
        options
      );
    }
  } catch {}

  try {
    if (isFunction(cleanup?.event)) {
      return cleanup.event(
        scope,
        target,
        eventName,
        handler,
        options
      );
    }
  } catch {}

  try {
    target.addEventListener(
      eventName,
      handler,
      options
    );

    const off = () => {
      try {
        target.removeEventListener(
          eventName,
          handler,
          options
        );

        return true;
      } catch {
        return false;
      }
    };

    addManualDisposer(off);

    return off;
  } catch {}

  return () => false;
}

/* =========================================================
   STATE SYNC
========================================================= */

export function syncNetworkState({
  state,
  events,
  utils,
  reason = "sync",
  emit = true,
  force = false,
} = {}) {
  const online =
    getNavigatorOnline();

  const changed =
    force ||
    lastOnline !== online;

  writeNetworkState(
    state,
    {
      online,
      reason,
      changed,
    }
  );

  lastOnline =
    online;

  lastReason =
    safeText(reason, "sync");

  if (changed) {
    lastChangeAt =
      Date.now();
  }

  return emitNetworkState({
    state,
    events,
    utils,
    online,
    reason,
    changed,
    silent:
      emit === false,
  });
}

/* =========================================================
   BIND / UNBIND
========================================================= */

export function bindNetworkEvents({
  state,
  events,
  cleanup,
  utils,
  scope = NETWORK_SCOPE,
  force = false,
} = {}) {
  if (!isBrowser()) {
    writeNetworkState(
      state,
      {
        online:
          null,
        reason:
          "server",
        changed:
          false,
      }
    );

    return false;
  }

  if (
    bound &&
    !force
  ) {
    syncNetworkState({
      state,
      events,
      utils,
      reason:
        "already-bound",
      emit:
        false,
    });

    return true;
  }

  if (
    bound &&
    force
  ) {
    unbindNetworkEvents({
      cleanup,
      events,
      utils,
      scope,
    });
  }

  try {
    cleanup?.scope?.(scope);
  } catch {}

  const handleOnline = () => {
    syncNetworkState({
      state,
      events,
      utils,
      reason:
        "online",
      emit:
        true,
      force:
        true,
    });
  };

  const handleOffline = () => {
    syncNetworkState({
      state,
      events,
      utils,
      reason:
        "offline",
      emit:
        true,
      force:
        true,
    });
  };

  const handleVisibilityChange = () => {
    syncNetworkState({
      state,
      events,
      utils,
      reason:
        "visibilitychange",
      emit:
        false,
      force:
        false,
    });
  };

  const handleFocus = () => {
    syncNetworkState({
      state,
      events,
      utils,
      reason:
        "focus",
      emit:
        false,
      force:
        false,
    });
  };

  const handleConnectionChange = () => {
    syncNetworkState({
      state,
      events,
      utils,
      reason:
        "connection-change",
      emit:
        true,
      force:
        false,
    });
  };

  try {
    bindDomEvent({
      cleanup,
      scope,
      target:
        window,
      eventName:
        "online",
      handler:
        handleOnline,
    });

    bindDomEvent({
      cleanup,
      scope,
      target:
        window,
      eventName:
        "offline",
      handler:
        handleOffline,
    });

    bindDomEvent({
      cleanup,
      scope,
      target:
        document,
      eventName:
        "visibilitychange",
      handler:
        handleVisibilityChange,
    });

    bindDomEvent({
      cleanup,
      scope,
      target:
        window,
      eventName:
        "focus",
      handler:
        handleFocus,
    });

    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection ||
      null;

    if (
      connection &&
      isFunction(connection.addEventListener)
    ) {
      bindDomEvent({
        cleanup,
        scope,
        target:
          connection,
        eventName:
          "change",
        handler:
          handleConnectionChange,
      });
    }

    bound =
      true;

    const payload =
      syncNetworkState({
        state,
        events,
        utils,
        reason:
          "bind",
        emit:
          false,
        force:
          true,
      });

    safeEmit(
      events,
      NETWORK_EVENTS.bound,
      {
        ...payload,
        scope,
      }
    );

    safeLog(
      utils,
      "Network events activos.",
      payload
    );

    return true;
  } catch (error) {
    safeError(
      utils,
      events,
      error,
      "bindNetworkEvents"
    );

    return false;
  }
}

export function unbindNetworkEvents({
  cleanup,
  events,
  utils,
  scope = NETWORK_SCOPE,
} = {}) {
  try {
    if (isFunction(cleanup?.run)) {
      cleanup.run(scope);
    } else if (isFunction(cleanup?.clear)) {
      cleanup.clear(scope);
    } else if (isFunction(cleanup?.dispose)) {
      cleanup.dispose(scope);
    }
  } catch (error) {
    safeError(
      utils,
      events,
      error,
      "unbindNetworkEvents:cleanup"
    );
  }

  for (const dispose of manualDisposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

  bound =
    false;

  safeEmit(
    events,
    NETWORK_EVENTS.unbound,
    {
      scope,
      at:
        safeIsoDate(),
    }
  );

  safeLog(
    utils,
    "Network events desactivados."
  );

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getNetworkSnapshot({
  state,
} = {}) {
  return {
    bound:
      Boolean(bound),

    online:
      getNavigatorOnline(),

    lastOnline,

    lastReason,

    lastChangeAt,

    lastChangeAtIso:
      lastChangeAt
        ? safeIsoDate(lastChangeAt)
        : "",

    state: {
      online:
        state?.online ?? null,

      offline:
        state?.offline ?? null,

      networkStatus:
        state?.networkStatus || "",

      lastNetworkReason:
        state?.lastNetworkReason || "",

      lastNetworkChangeAt:
        state?.lastNetworkChangeAt || "",
    },

    browser:
      getBrowserNetworkSnapshot(),
  };
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  bindNetworkEvents,
  unbindNetworkEvents,
  syncNetworkState,
  getNetworkSnapshot,
};
