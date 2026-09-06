/* =========================================================
   Onion Support - Clientes Template Compatibility Facade
   Archivo: /src/views/clientes/clientes.template.legacy.js

   COMPAT ONLY · NO SECOND TEMPLATE/MODEL SYSTEM

   El modelo canónico vive en ./clientes.model.js y el template de listado en
   ./clientes.template.js. Este archivo sólo conserva imports históricos de los
   normalizadores; no renderiza ni mantiene una segunda lógica de presentación.
========================================================= */

export * from "./clientes.model.js";
export { default } from "./clientes.model.js";
