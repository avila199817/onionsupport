/* =========================================================
   Onion Support - Topbar Boundary
   Archivo: /src/ui/topbar/index.js

   Mantiene el controlador canónico completo en index.base.js y carga la
   mejora visual/operativa del Topbar como side effect progresivo.

   - Todas las exports históricas permanecen 1:1.
   - El motor de búsqueda sigue viviendo en index.base.js.
   - Search launcher + centro de notificaciones viven en
     /src/features/topbar-executive/index.js.
========================================================= */

import "../../features/topbar-executive/index.js";

export * from "./index.base.js";
export { default } from "./index.base.js";
