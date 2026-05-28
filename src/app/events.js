/* =========================================================
   Onion Support - App Events
   Archivo: /src/app/events.js

   Responsabilidad:
   - Compat mínima para imports antiguos.
   - No registra, escucha ni emite eventos.
   - El event bus canónico pertenece a /src/core/events.js.
   - Sin imports, timers, DOM, storage, fetch ni dominio.
========================================================= */

export const APP_EVENTS_VERSION = "app.events.v5";

/* =========================================================
   PUBLIC API
========================================================= */

export function bindAppEvents() {
  return true;
}

export function unbindAppEvents() {
  return true;
}

export function isAppEventsBound() {
  return false;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppEventsSnapshot() {
  return {
    version: APP_EVENTS_VERSION,

    bound: false,
    compatibilityOnly: true,

    policy: {
      noopModule: true,
      coreEventsOwnsEventBus: true,
      noRegisteredEvents: true,
      noRouterListeners: true,
      noAuthListeners: true,
      noUiRepair: true,
      noEmits: true,
      noImports: true,
      noDom: true,
      noStorage: true,
      noFetch: true,
      noTimers: true,
      noDomainLogic: true,
    },
  };
}

export default {
  APP_EVENTS_VERSION,

  bindAppEvents,
  unbindAppEvents,
  isAppEventsBound,

  getAppEventsSnapshot,
};
