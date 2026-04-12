/* =========================================================
   Onion SPA - Facturas Module Index
   Archivo: src/views/facturas/index.js

   Responsabilidades:
   - punto de entrada del módulo de facturas
   - reexportar la vista principal
   - reexportar helpers del modelo
========================================================= */

export { FacturasView } from "./facturasView.js";

export {
  truncate,
  formatMoney,
  formatDate,
  formatDateTime,
  formatRelativeDate,
  getInitials,
  normalizeEstadoPago,
  normalizeEstado,
  getEstadoPagoLabel,
  getEstadoLabel,
  getEstadoPagoChipStyle,
  getEstadoChipStyle,
  getFacturaNumero,
  getFacturaFecha,
  getFacturaUpdatedAt,
  getFacturaClienteNombre,
  getFacturaClienteEmpresa,
  getFacturaClienteEmail,
  getFacturaPreview,
  getFacturaCurrency,
  getFacturaTotal,
  getFacturaBaseImponible,
  getFacturaImpuestosTotal,
  getFacturaDescuentoTotal,
  isFacturaPaid,
  isFacturaPending,
  isFacturaOverdue,
  normalizeFactura,
  extractFacturas,
  extractNormalizedFacturas,
  getRemoteCount,
  extractStats,
  sumFacturasTotal,
  sumFacturasBase,
  countFacturasByEstadoPago,
  countFacturasByEstado,
  sortFacturas,
  filterFacturas,
} from "./facturas.model.js";
