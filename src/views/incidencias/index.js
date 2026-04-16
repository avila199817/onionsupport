/* =========================================================
   Onion SPA - Incidencias View
   Archivo: src/views/incidencias/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo incidencias
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y incidenciasView.js
   - init / reload / destroy seguros
   - exponer create / modal / helpers públicos
   - evitar duplicidad de lógica en index.js

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo no existe
========================================================= */

import IncidenciasView from "./incidenciasView.js";
import IncidenciasCreateView from "./incidenciasCreateView.js";
import IncidenciasModal from "./incidencias.modal.js";

/* =========================================================
   CORE EXPORTS
========================================================= */

export { IncidenciasView };
export { IncidenciasCreateView };
export { IncidenciasModal };

export default IncidenciasView;

/* =========================================================
   INTERNAL SAFE CALL
========================================================= */

function safeCall(target, method, args = [], fallback = undefined) {
  try {
    const fn = target?.[method];

    if (typeof fn === "function") {
      return fn(...args);
    }
  } catch {}

  return fallback;
}

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  safeCall(IncidenciasView, "init", args);

export const render = (...args) =>
  safeCall(IncidenciasView, "render", args);

export const reload = (...args) =>
  safeCall(IncidenciasView, "reload", args);

export const destroy = (...args) =>
  safeCall(IncidenciasView, "destroy", args);

/* =========================================================
   ACTIONS API
========================================================= */

export const openTicket = (...args) =>
  safeCall(IncidenciasView, "openTicket", args);

export const createIncidencia = (...args) =>
  safeCall(IncidenciasView, "createIncidencia", args);

export const exportCsv = (...args) =>
  safeCall(IncidenciasView, "exportCsv", args);

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  safeCall(IncidenciasView, "goToPage", args);

export const goPrevPage = (...args) =>
  safeCall(IncidenciasView, "goPrevPage", args);

export const goNextPage = (...args) =>
  safeCall(IncidenciasView, "goNextPage", args);

/* =========================================================
   DATA API
========================================================= */

export const getItems = (...args) =>
  safeCall(IncidenciasView, "getItems", args, []);

export const getPageItems = (...args) =>
  safeCall(IncidenciasView, "getPageItems", args, []);

export const getTicketById = (...args) =>
  safeCall(IncidenciasView, "getTicketById", args, null);

/* =========================================================
   CREATE VIEW API
========================================================= */

export const initCreate = (...args) =>
  safeCall(IncidenciasCreateView, "init", args);

export const openCreate = (...args) =>
  safeCall(IncidenciasCreateView, "open", args);

export const closeCreate = (...args) =>
  safeCall(IncidenciasCreateView, "close", args);

/* =========================================================
   MODAL API
========================================================= */

export const openModal = (...args) =>
  safeCall(IncidenciasModal, "open", args);

export const closeModal = (...args) =>
  safeCall(IncidenciasModal, "close", args);

export const refreshModal = (...args) =>
  safeCall(IncidenciasModal, "refresh", args);

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(IncidenciasView?.initialized);

export const isDestroyed = () =>
  Boolean(IncidenciasView?.destroyed);

/* =========================================================
   LEGACY GLOBAL BRIDGE (OPTIONAL)
========================================================= */

try {
  if (typeof window !== "undefined") {
    window.OnionIncidencias = {
      init,
      render,
      reload,
      destroy,

      openTicket,
      createIncidencia,
      exportCsv,

      goToPage,
      goPrevPage,
      goNextPage,

      getItems,
      getPageItems,
      getTicketById,

      openModal,
      closeModal,

      openCreate,
      closeCreate,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */
