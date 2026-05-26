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
   - No crea bus propio.
   - Sin imports.
   - Sin timers.
   - Sin DOM.
   - Sin storage.
   - Sin fetch.
   - Sin lógica de dominio.

   Nota:
   - El event bus canónico pertenece a /src/core/events.js.
   - Este archivo sólo existe para compatibilidad con imports antiguos.
========================================================= */

export const APP_EVENTS_VERSION = "app.events.v4";

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

      coreEventsOwnsEventBus: true,
      appDoesNotCreateBus: true,

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
      noGlobalBus: true,
      noDomainLogic: true,

      snapshotMinimal: true,
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
