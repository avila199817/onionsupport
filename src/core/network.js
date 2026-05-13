/* =========================================================
   Onion SPA - Core Network
   Archivo: src/core/network.js

   ONION SUPPORT · CORE NETWORK
   CONNECTIVITY EVENTS · STATE SYNC · CLEANUP SAFE · 13/10

   Responsabilidades:
   - bind de eventos de conectividad del navegador
   - sincronizar estado online/offline/unknown
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
   - soporte connection.onchange legacy
   - eventos online/offline/visibility/focus/pageshow/pagehide
   - estado online inicial sincronizado
   - contexto activo actualizable sin rebinder innecesario
   - handlers no capturan estado obsoleto tras reboot
   - setState opcional si se inyecta
   - mutación directa segura si no hay setState
   - no convierte unknown en offline por accidente
   - eventos con rate mínimo para señales ruidosas
   - cero throws accidentales
========================================================= */

import { isBrowser } from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const NETWORK_VERSION =
  "13.0.0";

const NETWORK_SCOPE =
  "core:network";

const MIN_PASSIVE_SYNC_INTERVAL_MS =
  350;

const MAX_RECENT_EVENTS =
  48;

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

    visibility:
      "core:network:visibility",

    focus:
      "core:network:focus",

    pageShow:
      "core:network:pageshow",

    pageHide:
      "core:network:pagehide",

    connection:
      "core:network:connection",

    error:
      "core:network:error",
  });

/* =========================================================
   MODULE STATE
========================================================= */

let bound =
  false;

let bindingId =
  0;

let lastOnline =
  null;

let lastStatus =
  "unknown";

let lastReason =
  "";

let lastChangeAt =
  0;

let lastSyncAt =
  0;

let lastVisibilityState =
  null;

let lastConnectionFingerprint =
  "";

let lastError =
  null;

const recentEvents =
  [];

const stats = {
  bind:
    0,

  unbind:
    0,

  sync:
    0,

  changed:
    0,

  online:
    0,

  offline:
    0,

  unknown:
    0,

  visibility:
    0,

  focus:
    0,

  pageShow:
    0,

  pageHide:
    0,

  connection:
    0,

  errors:
    0,

  manualDisposers:
    0,
};

const manualDisposers =
  new Set();

const activeContext = {
  state:
    null,

  events:
    null,

  cleanup:
    null,

  utils:
    null,

  setState:
    null,

  scope:
    NETWORK_SCOPE,
};

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

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeEmit(events, name, payload = {}) {
  const eventName =
    safeText(name, "");

  if (!eventName) {
    return false;
  }

  try {
    events?.emit?.(
      eventName,
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
  let emitted =
    false;

  try {
    if (isFunction(utils?.warn)) {
      utils.warn(
        "[Network]",
        ...args
      );

      emitted =
        true;
    }
  } catch {
    emitted =
      false;
  }

  if (emitted) {
    return;
  }

  try {
    console.warn(
      "[Network]",
      ...args
    );
  } catch {}
}

function pushRecent(type = "event", payload = {}) {
  const atMs =
    safeNow();

  recentEvents.unshift({
    type:
      safeText(type, "event"),

    ...sanitizePayload(payload),

    at:
      safeIsoDate(atMs),

    atMs,
  });

  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.splice(MAX_RECENT_EVENTS);
  }
}

function sanitizePayload(value, depth = 0) {
  if (depth > 4) {
    return "[depth-limit]";
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return value.slice(0, 500);
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value instanceof Error) {
    return {
      name:
        value.name || "Error",

      message:
        safeText(
          value.message,
          "Error"
        ),

      stack:
        value.stack
          ? "[stack]"
          : "",
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 40)
      .map((item) =>
        sanitizePayload(
          item,
          depth + 1
        )
      );
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] =
        sanitizePayload(
          item,
          depth + 1
        );
    }

    return output;
  }

  try {
    return String(value);
  } catch {
    return "[unserializable]";
  }
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

    name:
      safeText(
        error?.name,
        "Error"
      ),

    at:
      safeIsoDate(),
  };

  lastError =
    payload;

  stats.errors += 1;

  pushRecent(
    "error",
    payload
  );

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

/* =========================================================
   BROWSER SIGNALS
========================================================= */

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

function onlineToStatus(online = null) {
  if (online === true) {
    return "online";
  }

  if (online === false) {
    return "offline";
  }

  return "unknown";
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

function getDocumentHidden() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return typeof document.hidden === "boolean"
      ? document.hidden
      : null;
  } catch {}

  return null;
}

function getConnection() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return (
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection ||
      null
    );
  } catch {}

  return null;
}

function normalizeConnectionValue(value) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function getConnectionSnapshot() {
  const connection =
    getConnection();

  if (!connection) {
    return null;
  }

  try {
    return {
      effectiveType:
        connection.effectiveType || null,

      type:
        connection.type || null,

      downlink:
        normalizeConnectionValue(
          connection.downlink
        ),

      downlinkMax:
        normalizeConnectionValue(
          connection.downlinkMax
        ),

      rtt:
        normalizeConnectionValue(
          connection.rtt
        ),

      saveData:
        typeof connection.saveData === "boolean"
          ? connection.saveData
          : null,
    };
  } catch {}

  return null;
}

function connectionFingerprint(connection = null) {
  if (!connection) {
    return "";
  }

  try {
    return [
      connection.effectiveType || "",
      connection.type || "",
      connection.downlink ?? "",
      connection.downlinkMax ?? "",
      connection.rtt ?? "",
      connection.saveData ?? "",
    ].join("|");
  } catch {
    return "";
  }
}

function getBrowserNetworkSnapshot() {
  const online =
    getNavigatorOnline();

  return {
    browser:
      isBrowser(),

    online,

    status:
      onlineToStatus(online),

    visibilityState:
      getVisibilityState(),

    hidden:
      getDocumentHidden(),

    connection:
      getConnectionSnapshot(),

    at:
      safeIsoDate(),
  };
}

/* =========================================================
   ACTIVE CONTEXT
========================================================= */

function updateActiveContext({
  state,
  events,
  cleanup,
  utils,
  setState,
  scope = NETWORK_SCOPE,
} = {}) {
  if (state !== undefined) {
    activeContext.state =
      state || null;
  }

  if (events !== undefined) {
    activeContext.events =
      events || null;
  }

  if (cleanup !== undefined) {
    activeContext.cleanup =
      cleanup || null;
  }

  if (utils !== undefined) {
    activeContext.utils =
      utils || null;
  }

  if (setState !== undefined) {
    activeContext.setState =
      isFunction(setState)
        ? setState
        : null;
  }

  activeContext.scope =
    safeText(
      scope,
      NETWORK_SCOPE
    );

  return activeContext;
}

function getActiveContext() {
  return activeContext;
}

export function refreshNetworkContext(context = {}) {
  updateActiveContext(context);

  return getNetworkSnapshot({
    state:
      activeContext.state,
  });
}

/* =========================================================
   STATE PATCH
========================================================= */

function buildStatePatch({
  online,
  reason = "sync",
  changed = false,
} = {}) {
  const atMs =
    safeNow();

  const status =
    onlineToStatus(online);

  const connection =
    getConnectionSnapshot();

  const patch = {
    networkStatus:
      status,

    networkConnection:
      connection,

    networkVisibilityState:
      getVisibilityState(),

    networkHidden:
      getDocumentHidden(),

    lastNetworkReason:
      safeText(reason, "sync"),

    lastNetworkSyncAt:
      safeIsoDate(atMs),

    lastNetworkSyncAtMs:
      atMs,
  };

  if (changed) {
    patch.lastNetworkChangeAt =
      safeIsoDate(atMs);

    patch.lastNetworkChangeAtMs =
      atMs;
  }

  /*
    Importante:
    - unknown se mantiene como null.
    - no se permite convertir unknown en offline por accidente.
  */
  if (online === true || online === false) {
    patch.online =
      online;

    patch.offline =
      !online;

    patch.networkOnline =
      online;

    patch.networkOffline =
      !online;
  } else {
    patch.online =
      null;

    patch.offline =
      null;

    patch.networkOnline =
      null;

    patch.networkOffline =
      null;
  }

  return patch;
}

function removeUndefinedKeys(object = {}) {
  const output =
    {};

  for (const [key, value] of Object.entries(object || {})) {
    if (value !== undefined) {
      output[key] =
        value;
    }
  }

  return output;
}

function patchHasUnknownOnline(patch = {}) {
  return (
    patch.online === null ||
    patch.offline === null ||
    patch.networkOnline === null ||
    patch.networkOffline === null
  );
}

function writeNetworkState(state, patch = {}, setState = null) {
  if (!state || typeof state !== "object") {
    return false;
  }

  const cleanPatch =
    removeUndefinedKeys(patch);

  /*
    Si online es unknown, evitamos setState porque otros normalizadores
    podrían convertir null en false. Mutación directa controlada.
  */
  if (
    isFunction(setState) &&
    !patchHasUnknownOnline(cleanPatch)
  ) {
    try {
      setState(cleanPatch, {
        source:
          "core:network",

        emitDerived:
          false,
      });

      return true;
    } catch {}
  }

  try {
    Object.assign(
      state,
      cleanPatch
    );

    return true;
  } catch {}

  return false;
}

function buildPayload({
  state,
  online,
  reason = "sync",
  changed = false,
  source = "network",
} = {}) {
  const status =
    onlineToStatus(online);

  return {
    version:
      NETWORK_VERSION,

    online,

    offline:
      online === null
        ? null
        : !online,

    status,

    reason:
      safeText(reason, "sync"),

    source:
      safeText(source, "network"),

    changed:
      Boolean(changed),

    bound:
      Boolean(bound),

    bindingId,

    visibilityState:
      getVisibilityState(),

    hidden:
      getDocumentHidden(),

    connection:
      getConnectionSnapshot(),

    stateOnline:
      state?.online ?? null,

    stateOffline:
      state?.offline ?? null,

    stateStatus:
      state?.networkStatus || "",

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
  source = "network",
} = {}) {
  const payload =
    buildPayload({
      state,
      online,
      reason,
      changed,
      source,
    });

  if (silent) {
    return payload;
  }

  safeEmit(
    events,
    NETWORK_EVENTS.state,
    payload
  );

  if (changed) {
    stats.changed += 1;

    safeEmit(
      events,
      NETWORK_EVENTS.change,
      payload
    );

    if (online === true) {
      stats.online += 1;

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
      stats.offline += 1;

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
    } else {
      stats.unknown += 1;
    }
  }

  pushRecent(
    changed ? "change" : "state",
    payload
  );

  return payload;
}

function shouldThrottlePassiveSync(reason = "", force = false, nextOnline = null, nextStatus = "unknown") {
  if (force) {
    return false;
  }

  if (
    nextOnline !== lastOnline ||
    nextStatus !== lastStatus
  ) {
    return false;
  }

  const cleanReason =
    safeText(reason, "");

  if (
    cleanReason === "online" ||
    cleanReason === "offline" ||
    cleanReason === "connection-change" ||
    cleanReason === "bind" ||
    cleanReason === "force"
  ) {
    return false;
  }

  const current =
    safeNow();

  return (
    lastSyncAt > 0 &&
    current - lastSyncAt < MIN_PASSIVE_SYNC_INTERVAL_MS
  );
}

/* =========================================================
   MANUAL DISPOSERS
========================================================= */

function addManualDisposer(disposer) {
  if (isFunction(disposer)) {
    manualDisposers.add(disposer);

    stats.manualDisposers =
      manualDisposers.size;
  }

  return disposer;
}

function removeManualDisposer(disposer) {
  try {
    manualDisposers.delete(disposer);

    stats.manualDisposers =
      manualDisposers.size;
  } catch {}
}

function clearManualDisposers() {
  for (const dispose of Array.from(manualDisposers)) {
    try {
      dispose();
    } catch {}
  }

  manualDisposers.clear();

  stats.manualDisposers =
    0;
}

/* =========================================================
   BIND HELPERS
========================================================= */

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
    if (isFunction(cleanup?.event)) {
      const dispose =
        cleanup.event(
          scope,
          target,
          eventName,
          handler,
          options
        );

      if (isFunction(dispose)) {
        return dispose;
      }

      if (dispose === true) {
        return () => true;
      }
    }
  } catch {}

  try {
    if (isFunction(cleanup?.on)) {
      const dispose =
        cleanup.on(
          scope,
          target,
          eventName,
          handler,
          options
        );

      if (isFunction(dispose)) {
        return dispose;
      }

      if (dispose === true) {
        return () => true;
      }
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

        removeManualDisposer(off);

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

function bindConnectionChange({
  cleanup,
  scope,
  connection,
  handler,
} = {}) {
  if (!connection || !isFunction(handler)) {
    return () => false;
  }

  if (isFunction(connection.addEventListener)) {
    return bindDomEvent({
      cleanup,
      scope,
      target:
        connection,
      eventName:
        "change",
      handler,
    });
  }

  /*
    Fallback legacy:
    - conserva onchange anterior
    - restaura sólo si sigue apuntando a nuestro wrapper
  */
  try {
    const previous =
      connection.onchange;

    const wrapped = function networkConnectionOnChange(event) {
      try {
        if (isFunction(previous)) {
          previous.call(
            this,
            event
          );
        }
      } catch {}

      handler(event);
    };

    connection.onchange =
      wrapped;

    const off = () => {
      try {
        if (connection.onchange === wrapped) {
          connection.onchange =
            previous || null;
        }

        removeManualDisposer(off);

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
  setState,
  reason = "sync",
  emit = true,
  force = false,
  source = "network",
} = {}) {
  const ctx =
    updateActiveContext({
      state,
      events,
      utils,
      setState,
    });

  const online =
    getNavigatorOnline();

  const status =
    onlineToStatus(online);

  if (
    shouldThrottlePassiveSync(
      reason,
      force,
      online,
      status
    )
  ) {
    return buildPayload({
      state:
        ctx.state,
      online:
        lastOnline,
      reason:
        `${safeText(reason, "sync")}:throttled`,
      changed:
        false,
      source,
    });
  }

  const changed =
    force === true ||
    lastOnline !== online ||
    lastStatus !== status;

  const patch =
    buildStatePatch({
      online,
      reason,
      changed,
    });

  writeNetworkState(
    ctx.state,
    patch,
    ctx.setState
  );

  lastOnline =
    online;

  lastStatus =
    status;

  lastReason =
    safeText(reason, "sync");

  lastSyncAt =
    safeNow();

  stats.sync += 1;

  if (changed) {
    lastChangeAt =
      lastSyncAt;
  }

  const connection =
    getConnectionSnapshot();

  lastConnectionFingerprint =
    connectionFingerprint(
      connection
    );

  return emitNetworkState({
    state:
      ctx.state,
    events:
      ctx.events,
    utils:
      ctx.utils,
    online,
    reason,
    changed,
    silent:
      emit === false,
    source,
  });
}

/* =========================================================
   EVENT HANDLERS
========================================================= */

function handleOnline() {
  const ctx =
    getActiveContext();

  syncNetworkState({
    state:
      ctx.state,
    events:
      ctx.events,
    utils:
      ctx.utils,
    setState:
      ctx.setState,
    reason:
      "online",
    emit:
      true,
    force:
      false,
    source:
      "window:online",
  });
}

function handleOffline() {
  const ctx =
    getActiveContext();

  syncNetworkState({
    state:
      ctx.state,
    events:
      ctx.events,
    utils:
      ctx.utils,
    setState:
      ctx.setState,
    reason:
      "offline",
    emit:
      true,
    force:
      false,
    source:
      "window:offline",
  });
}

function handleVisibilityChange() {
  const ctx =
    getActiveContext();

  const nextVisibility =
    getVisibilityState();

  const changed =
    lastVisibilityState !== nextVisibility;

  lastVisibilityState =
    nextVisibility;

  if (changed) {
    stats.visibility += 1;
  }

  const payload =
    syncNetworkState({
      state:
        ctx.state,
      events:
        ctx.events,
      utils:
        ctx.utils,
      setState:
        ctx.setState,
      reason:
        "visibilitychange",
      emit:
        true,
      force:
        false,
      source:
        "document:visibilitychange",
    });

  if (changed) {
    safeEmit(
      ctx.events,
      NETWORK_EVENTS.visibility,
      {
        ...payload,
        visibilityState:
          nextVisibility,
      }
    );

    pushRecent(
      "visibility",
      {
        ...payload,
        visibilityState:
          nextVisibility,
      }
    );
  }
}

function handleFocus() {
  const ctx =
    getActiveContext();

  stats.focus += 1;

  const payload =
    syncNetworkState({
      state:
        ctx.state,
      events:
        ctx.events,
      utils:
        ctx.utils,
      setState:
        ctx.setState,
      reason:
        "focus",
      emit:
        true,
      force:
        false,
      source:
        "window:focus",
    });

  safeEmit(
    ctx.events,
    NETWORK_EVENTS.focus,
    payload
  );

  pushRecent(
    "focus",
    payload
  );
}

function handlePageShow(event = null) {
  const ctx =
    getActiveContext();

  stats.pageShow += 1;

  const payload =
    syncNetworkState({
      state:
        ctx.state,
      events:
        ctx.events,
      utils:
        ctx.utils,
      setState:
        ctx.setState,
      reason:
        "pageshow",
      emit:
        true,
      force:
        false,
      source:
        "window:pageshow",
    });

  const finalPayload = {
    ...payload,
    persisted:
      Boolean(event?.persisted),
  };

  safeEmit(
    ctx.events,
    NETWORK_EVENTS.pageShow,
    finalPayload
  );

  pushRecent(
    "pageshow",
    finalPayload
  );
}

function handlePageHide(event = null) {
  const ctx =
    getActiveContext();

  stats.pageHide += 1;

  const payload =
    buildPayload({
      state:
        ctx.state,
      online:
        lastOnline,
      reason:
        "pagehide",
      changed:
        false,
      source:
        "window:pagehide",
    });

  const finalPayload = {
    ...payload,
    persisted:
      Boolean(event?.persisted),
  };

  safeEmit(
    ctx.events,
    NETWORK_EVENTS.pageHide,
    finalPayload
  );

  pushRecent(
    "pagehide",
    finalPayload
  );
}

function handleConnectionChange() {
  const ctx =
    getActiveContext();

  const connection =
    getConnectionSnapshot();

  const fingerprint =
    connectionFingerprint(
      connection
    );

  const changed =
    fingerprint !== lastConnectionFingerprint;

  lastConnectionFingerprint =
    fingerprint;

  stats.connection += 1;

  const payload =
    syncNetworkState({
      state:
        ctx.state,
      events:
        ctx.events,
      utils:
        ctx.utils,
      setState:
        ctx.setState,
      reason:
        "connection-change",
      emit:
        changed,
      force:
        false,
      source:
        "navigator:connection",
    });

  const finalPayload = {
    ...payload,
    changed,
    connection,
  };

  safeEmit(
    ctx.events,
    NETWORK_EVENTS.connection,
    finalPayload
  );

  pushRecent(
    "connection",
    finalPayload
  );
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
  updateActiveContext({
    state,
    events,
    cleanup,
    utils,
    setState,
    scope,
  });

  if (!isBrowser()) {
    const patch =
      buildStatePatch({
        online:
          null,
        reason:
          "server",
        changed:
          false,
      });

    writeNetworkState(
      state,
      patch,
      setState
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
      setState,
      reason:
        "already-bound",
      emit:
        false,
      force:
        false,
      source:
        "bindNetworkEvents",
    });

    return true;
  }

  if (
    bound &&
    force
  ) {
    unbindNetworkEvents({
      cleanup:
        activeContext.cleanup || cleanup,
      events:
        activeContext.events || events,
      utils:
        activeContext.utils || utils,
      scope:
        activeContext.scope || scope,
    });
  }

  try {
    cleanup?.scope?.(scope);
  } catch {}

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

    bindDomEvent({
      cleanup,
      scope,
      target:
        window,
      eventName:
        "pageshow",
      handler:
        handlePageShow,
    });

    bindDomEvent({
      cleanup,
      scope,
      target:
        window,
      eventName:
        "pagehide",
      handler:
        handlePageHide,
    });

    const connection =
      getConnection();

    if (connection) {
      bindConnectionChange({
        cleanup,
        scope,
        connection,
        handler:
          handleConnectionChange,
      });
    }

    bound =
      true;

    bindingId += 1;

    stats.bind += 1;

    lastVisibilityState =
      getVisibilityState();

    lastConnectionFingerprint =
      connectionFingerprint(
        getConnectionSnapshot()
      );

    const payload =
      syncNetworkState({
        state,
        events,
        utils,
        setState,
        reason:
          "bind",
        emit:
          false,
        force:
          true,
        source:
          "bindNetworkEvents",
      });

    const boundPayload = {
      ...payload,
      scope,
      bindingId,
    };

    safeEmit(
      events,
      NETWORK_EVENTS.bound,
      boundPayload
    );

    pushRecent(
      "bound",
      boundPayload
    );

    safeLog(
      utils,
      "Network events activos.",
      boundPayload
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
  const finalCleanup =
    cleanup ||
    activeContext.cleanup;

  const finalEvents =
    events ||
    activeContext.events;

  const finalUtils =
    utils ||
    activeContext.utils;

  const finalScope =
    safeText(
      scope ||
        activeContext.scope,
      NETWORK_SCOPE
    );

  try {
    if (isFunction(finalCleanup?.run)) {
      finalCleanup.run(finalScope);
    } else if (isFunction(finalCleanup?.clear)) {
      finalCleanup.clear(finalScope);
    } else if (isFunction(finalCleanup?.dispose)) {
      finalCleanup.dispose(finalScope);
    }
  } catch (error) {
    safeError(
      finalUtils,
      finalEvents,
      error,
      "unbindNetworkEvents:cleanup"
    );
  }

  clearManualDisposers();

  bound =
    false;

  stats.unbind += 1;

  const payload = {
    version:
      NETWORK_VERSION,

    scope:
      finalScope,

    bindingId,

    at:
      safeIsoDate(),
  };

  safeEmit(
    finalEvents,
    NETWORK_EVENTS.unbound,
    payload
  );

  pushRecent(
    "unbound",
    payload
  );

  safeLog(
    finalUtils,
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
  const sourceState =
    state ||
    activeContext.state;

  const currentOnline =
    getNavigatorOnline();

  return {
    version:
      NETWORK_VERSION,

    bound:
      Boolean(bound),

    bindingId,

    online:
      currentOnline,

    status:
      onlineToStatus(
        currentOnline
      ),

    lastOnline,

    lastStatus,

    lastReason,

    lastSyncAt,

    lastSyncAtIso:
      lastSyncAt
        ? safeIsoDate(lastSyncAt)
        : "",

    lastChangeAt,

    lastChangeAtIso:
      lastChangeAt
        ? safeIsoDate(lastChangeAt)
        : "",

    lastVisibilityState,

    lastConnectionFingerprint,

    manualDisposerCount:
      manualDisposers.size,

    activeScope:
      activeContext.scope,

    stats: {
      ...stats,
      manualDisposers:
        manualDisposers.size,
    },

    state: {
      online:
        sourceState?.online ?? null,

      offline:
        sourceState?.offline ?? null,

      networkOnline:
        sourceState?.networkOnline ?? null,

      networkOffline:
        sourceState?.networkOffline ?? null,

      networkStatus:
        sourceState?.networkStatus || "",

      lastNetworkReason:
        sourceState?.lastNetworkReason || "",

      lastNetworkSyncAt:
        sourceState?.lastNetworkSyncAt || "",

      lastNetworkChangeAt:
        sourceState?.lastNetworkChangeAt || "",

      visibilityState:
        sourceState?.networkVisibilityState || "",

      hidden:
        sourceState?.networkHidden ?? null,

      connection:
        sourceState?.networkConnection || null,
    },

    browser:
      getBrowserNetworkSnapshot(),

    recent:
      recentEvents.map((item) => ({
        ...item,
      })),

    lastError,
  };
}

/* =========================================================
   EXPORT
========================================================= */

export {
  NETWORK_VERSION,
  NETWORK_SCOPE,
  NETWORK_EVENTS,
};

export default {
  NETWORK_VERSION,
  NETWORK_SCOPE,
  NETWORK_EVENTS,

  bindNetworkEvents,
  unbindNetworkEvents,
  refreshNetworkContext,
  syncNetworkState,
  getNetworkSnapshot,
};
