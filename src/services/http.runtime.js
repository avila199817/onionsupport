/* =========================================================
   Onion SPA - HTTP Runtime
   Archivo: src/services/http.runtime.js

   Responsabilidades:
   - gestionar esperas internas del servicio HTTP
   - controlar requests pendientes globales
   - emitir cambios de pending al event bus
   - exponer helpers de abort / cancelación
========================================================= */

export function delay(AppCore, ms = 0) {
  return AppCore.utils.sleep(ms);
}

export function incrementPendingRequests(AppCore, state) {
  state.pendingRequests += 1;

  AppCore.events.emit("http:pending:change", {
    pending: state.pendingRequests,
  });

  return state.pendingRequests;
}

export function decrementPendingRequests(AppCore, state) {
  state.pendingRequests = Math.max(0, state.pendingRequests - 1);

  AppCore.events.emit("http:pending:change", {
    pending: state.pendingRequests,
  });

  return state.pendingRequests;
}

export function createAbortController() {
  return new AbortController();
}
