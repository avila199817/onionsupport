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

export const APP_EVENTS_VERSION = "app.events.v2";

/* =========================================================
   PUBLIC API
========================================================= */

export function bindAppEvents() {
  return false;
}

export function unbindAppEvents() {
  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppEventsSnapshot() {
  return {
    version: APP_EVENTS_VERSION,

    bound: false,

    policy: {
      noRegisteredEvents: true,
      noRouterListeners: true,
      noAuthListeners: true,
      noUiRepair: true,
      noEmits: true,
      noImports: true,
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

  getAppEventsSnapshot,
};
