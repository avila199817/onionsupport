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

export const APP_EVENTS_VERSION = "simple";

let bound = false;

export function bindAppEvents() {
  bound = true;
  return true;
}

export function unbindAppEvents() {
  bound = false;
  return true;
}

export function requestUiRepair(reason = "manual") {
  return {
    ok: true,
    ignored: true,
    reason,
  };
}

export function getAppEventsSnapshot() {
  return {
    version: APP_EVENTS_VERSION,
    bound,
  };
}

export function resetAppEventsState() {
  bound = false;
  return getAppEventsSnapshot();
}

export default {
  APP_EVENTS_VERSION,
  bindAppEvents,
  unbindAppEvents,
  requestUiRepair,
  getAppEventsSnapshot,
  resetAppEventsState,
};
