/* =========================================================
   Onion SPA - Facturas Module Index
   Archivo: src/views/facturas/index.js

   Responsabilidades:
   - punto de entrada del módulo de facturas
   - reexportar la vista principal
   - reexportar utilidades del módulo si se necesitan externamente
   - mantener imports limpios y consistentes
========================================================= */

export { FacturasView } from "./facturasView.js";

export {
  extractFacturas,
  normalizeFactura,
  normalizeEstado,
  normalizeEstadoPago,
  getEstadoLabel,
  getEstadoPagoLabel,
  getEstadoChipStyle,
  getEstadoPagoChipStyle,
  formatMoney,
  formatDate,
  formatRelativeDate,
  truncate,
  getRemoteCount,
} from "./facturas.model.js";
