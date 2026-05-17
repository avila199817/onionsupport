/* =========================================================
   Onion Support - Store Core Sync
   Archivo: /src/store/core-sync.js

   Responsabilidad:
   - Compat mínima.
   - No duplica Core.
   - No duplica Auth.
   - No duplica Router.
   - No duplica UI.
   - No escucha eventos masivos.
   - No guarda tokens.
   - Sin imports.
   - Sin magia negra.
========================================================= */

export const STORE_CORE_SYNC_VERSION = "simple";

const SYNC_EVENT = "app:state:change";

function isFunction(value) {
  return typeof value === "function";
}

function noop() {
  return false;
}

function pushUnsubscriber(list, off) {
  if (Array.isArray(list) && isFunction(off)) {
    list.push(off);
  }

  return off;
}

/* =========================================================
   EVENT COMPAT
========================================================= */

export function addCoreEvent({
  AppCore = null,
  coreUnsubscribers = null,
  eventName = "",
  handler = null,
} = {}) {
  if (!AppCore || !eventName || !isFunction(handler)) {
    return noop;
  }

  let off = null;

  try {
    if (isFunction(AppCore.events?.on)) {
      off = AppCore.events.on(eventName, handler);
    }
  } catch {
    off = null;
  }

  if (!isFunction(off)) {
    off = noop;
  }

  pushUnsubscriber(coreUnsubscribers, off);

  return off;
}

/* =========================================================
   BIND / UNBIND
========================================================= */

export function bindCoreEvents({
  AppCore = null,
  coreUnsubscribers = null,
  actions = null,
} = {}) {
  if (!AppCore || !actions) {
    return false;
  }

  if (Array.isArray(coreUnsubscribers) && coreUnsubscribers.length > 0) {
    return true;
  }

  try {
    actions.hydrateFromCore?.();
  } catch {
    // Store no debe romper por sync.
  }

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: SYNC_EVENT,
    handler: () => {
      try {
        actions.hydrateFromCore?.();
      } catch {
        // Store no debe romper por sync.
      }
    },
  });

  return true;
}

export function unbindCoreEvents({ coreUnsubscribers = null } = {}) {
  if (!Array.isArray(coreUnsubscribers)) {
    return true;
  }

  while (coreUnsubscribers.length) {
    const off = coreUnsubscribers.pop();

    try {
      off?.();
    } catch {
      // noop
    }
  }

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_CORE_SYNC_VERSION,
  addCoreEvent,
  bindCoreEvents,
  unbindCoreEvents,
};
