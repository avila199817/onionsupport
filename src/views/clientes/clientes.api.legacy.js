/* =========================================================
   Onion Support - Clientes API Compatibility Facade
   Archivo: /src/views/clientes/clientes.api.legacy.js

   COMPAT ONLY · NO SECOND API SYSTEM

   La autoridad HTTP, paginación, detalle, creación y modelo vive únicamente
   en ./clientes.api.js y ./clientes.model.js. Este archivo existe sólo para
   imports históricos y no contiene estado, cache, normalizadores ni red.
========================================================= */

export * from "./clientes.api.js";
export { default } from "./clientes.api.js";
