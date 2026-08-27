/* =========================================================
   Onion Support - Topbar Executive Boundary
   Archivo: /src/features/topbar-executive/index.js

   Conserva el runtime visual/notificaciones en index.base.js y añade el
   bridge del bus AppCore en events.js. Ambos módulos son progresivos y no
   sustituyen el controlador de búsqueda del Topbar.
========================================================= */

import "./events.js";

export * from "./index.base.js";
export { default } from "./index.base.js";
