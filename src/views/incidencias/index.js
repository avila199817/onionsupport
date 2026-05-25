/* =========================================================
   Onion Support - Incidencias Index
   Archivo: /src/views/incidencias/index.js

   Responsabilidad:
   - Entry público de Incidencias para el Router.
   - Reexportar la vista principal.
   - No tocar DOM, Auth, Router, AppCore, modales, acciones,
     filtros, paginación ni lifecycle.
========================================================= */

import { IncidenciasView } from "./incidenciasView.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const INCIDENCIAS_INDEX_VERSION = "incidencias.index.v2";

/* =========================================================
   EXPORTS
========================================================= */

export { IncidenciasView };

export const IncidenciasIndex = IncidenciasView;

export default IncidenciasView;
