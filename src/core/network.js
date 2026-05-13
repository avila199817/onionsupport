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
  "12.0.0";

const NETWORK_SCOPE =
  "core:network";

const MIN_PASSIVE_SYNC_INTERVAL_MS =
  350;

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

    lastNetworkChangeAt:
      changed
        ? safeIsoDate(atMs)
        : undefined,

    lastNetworkChangeAtMs:
      changed
        ? atMs
        : undefined,
  };

  /*
    Importante:
    No pasar booleans null por setState del Core si online es desconocido,
    porque algunos normalizadores booleanos podrían convertir null -> false.
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
    Si online es unknown, evitamos setState para no convertir null en false.
    El módulo network ya emite sus eventos propios.
  */
  if (
    isFunction(setState) &&
    !patchHasUnknownOnline(cleanPatch)
  ) {
    try {
      setState(cleanPatch, {
        source:
          "core:network",
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

function shouldThrottlePassiveSync(reason = "", force = false) {
  if (force) {
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
  }

  return disposer;
}

function removeManualDisposer(disposer) {
  try {
    manualDisposers.delete(disposer);
  } catch {}
}

function clearManualDisposers() {
  for (const dispose of Array.from(manualDisposers)) {
    try {
      dispose();
    } catch {}
  }

  manualDisposers.clear();
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
    Fallback legacy.
  */
  try {
    const previous =
      connection.onchange;

    connection.onchange =
      function networkConnectionOnChange(event) {
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

    const off = () => {
      try {
        if (connection.onchange === handler) {
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

  if (
    shouldThrottlePassiveSync(
      reason,
      force
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

  const online =
    getNavigatorOnline();

  const status =
    onlineToStatus(online);

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
        false,
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
  }
}

function handleFocus() {
  const ctx =
    getActiveContext();

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
        false,
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
}

function handlePageShow(event = null) {
  const ctx =
    getActiveContext();

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
        false,
      force:
        false,
      source:
        "window:pageshow",
    });

  safeEmit(
    ctx.events,
    NETWORK_EVENTS.pageShow,
    {
      ...payload,
      persisted:
        Boolean(event?.persisted),
    }
  );
}

function handlePageHide(event = null) {
  const ctx =
    getActiveContext();

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

  safeEmit(
    ctx.events,
    NETWORK_EVENTS.pageHide,
    {
      ...payload,
      persisted:
        Boolean(event?.persisted),
    }
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

  safeEmit(
    ctx.events,
    NETWORK_EVENTS.connection,
    {
      ...payload,
      changed,
      connection,
    }
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

    safeEmit(
      events,
      NETWORK_EVENTS.bound,
      {
        ...payload,
        scope,
        bindingId,
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

  safeEmit(
    finalEvents,
    NETWORK_EVENTS.unbound,
    {
      version:
        NETWORK_VERSION,

      scope:
        finalScope,

      bindingId,

      at:
        safeIsoDate(),
    }
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

  return {
    version:
      NETWORK_VERSION,

    bound:
      Boolean(bound),

    bindingId,

    online:
      getNavigatorOnline(),

    status:
      onlineToStatus(
        getNavigatorOnline()
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
