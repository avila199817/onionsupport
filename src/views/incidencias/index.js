/* =========================================================
   Onion Support - Incidencias Index
   Archivo: /src/views/incidencias/index.js

   Responsabilidad:
   - Entry público de Incidencias para el Router.
   - Exponer IncidenciasView desde incidenciasView.js.
   - No validar rutas.
   - No resolver slug.
   - No leer Auth.
   - No leer Router.
   - No tocar AppCore.
   - No tocar DOM.
   - No registrar globals.
   - No crear bridges.
   - No importar modales.
   - No duplicar acciones.
   - No duplicar filtros.
   - No duplicar paginación.
   - No duplicar lifecycle.
   - No bloquear render si Router ya resolvió Incidencias.
========================================================= */

import * as IncidenciasViewModule from "./incidenciasView.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const INCIDENCIAS_INDEX_VERSION = "incidencias.index.v1";

/* =========================================================
   VIEW RESOLUTION
========================================================= */

const View =
  IncidenciasViewModule.IncidenciasView ||
  IncidenciasViewModule.default ||
  IncidenciasViewModule.View ||
  null;

/* =========================================================
   EXPORTS
========================================================= */

export const INCIDENCIAS_VIEW_VERSION =
  IncidenciasViewModule.INCIDENCIAS_VIEW_VERSION ||
  IncidenciasViewModule.INCIDENCIAS_VERSION ||
  null;

export { View as IncidenciasView };

export const IncidenciasIndex = View;

export default View;
