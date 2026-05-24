/* =========================================================
   Onion Support - App Events
   Archivo: /src/app/events.js

   Responsabilidad:
   - Compat mínima.
   - No registra eventos.
   - No escucha Router.
   - No escucha Auth.
   - No repara UI.
   - No emite eventos.
   - Sin imports.
========================================================= */

export const APP_EVENTS_VERSION = "app.events.v3";

/* =========================================================
   PUBLIC API
========================================================= */

export function bindAppEvents() {
  return false;
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

    policy: {
      compatibilityOnly: true,
      noopModule: true,

      noRegisteredEvents: true,
      noRouterListeners: true,
      noAuthListeners: true,
      noUiRepair: true,
      noEmits: true,
      noImports: true,

      noStorage: true,
      noFetch: true,
      noTimers: true,
      noGlobalBus: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  APP_EVENTS_VERSION,

  bindAppEvents,
  unbindAppEvents,
  isAppEventsBound,

  getAppEventsSnapshot,
};
