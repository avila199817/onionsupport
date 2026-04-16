/* =========================================================
   Onion SPA - Incidencias View
   Archivo: src/views/incidencias/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único de la vista incidencias
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y incidenciasView.js
   - init / reload / destroy seguros
   - evitar duplicidad de lógica en index.js

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
========================================================= */

import IncidenciasView from "./incidenciasView.js";

export { IncidenciasView };
export default IncidenciasView;

/* =========================================================
   COMPAT LEGACY API
========================================================= */

export const init = (...args) =>
  IncidenciasView?.init?.(...args);

export const render = (...args) =>
  IncidenciasView?.render?.(...args);

export const reload = (...args) =>
  IncidenciasView?.reload?.(...args);

export const destroy = (...args) =>
  IncidenciasView?.destroy?.(...args);

/* =========================================================
   HELPERS EXTRA
========================================================= */

export const openTicket = (...args) =>
  IncidenciasView?.openTicket?.(...args);

export const createIncidencia = (...args) =>
  IncidenciasView?.createIncidencia?.(...args);

export const exportCsv = (...args) =>
  IncidenciasView?.exportCsv?.(...args);

export const goToPage = (...args) =>
  IncidenciasView?.goToPage?.(...args);

export const goPrevPage = (...args) =>
  IncidenciasView?.goPrevPage?.(...args);

export const goNextPage = (...args) =>
  IncidenciasView?.goNextPage?.(...args);

export const getItems = (...args) =>
  IncidenciasView?.getItems?.(...args);

export const getPageItems = (...args) =>
  IncidenciasView?.getPageItems?.(...args);

export const getTicketById = (...args) =>
  IncidenciasView?.getTicketById?.(...args);
