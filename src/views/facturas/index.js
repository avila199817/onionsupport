/* =========================================================
   Onion SPA - Facturas Module Index
   Archivo: src/views/facturas/index.js

   Responsabilidades:
   - punto único de entrada del módulo facturas
   - exportar vista principal
   - exportar modelo público
   - exportar utilidades reutilizables
   - mantener imports limpios en toda la app
========================================================= */

/* =========================================================
   VIEW PRINCIPAL
========================================================= */

export { FacturasView } from "./facturasView.js";

/* =========================================================
   MODEL
========================================================= */

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

/* =========================================================
   HELPERS PÚBLICOS
========================================================= */

export {
  safeText,
  safeNumber,
  safeArray,
  escapeHtml,
  showToast,
} from "./facturas.utils.js";

/* =========================================================
   API (opcional público)
========================================================= */

export {
  fetchFacturasRequest,
  fetchFacturaDetailRequest,
  fetchFacturaPdfUrlRequest,
  sendFacturaRequest,
} from "./facturas.api.js";

/* =========================================================
   STORE (opcional público)
========================================================= */

export {
  getFacturasStore,
  getSortedFacturasStore,
  getFacturaByIdStore,
  setFacturasStore,
  clearFacturasStore,
} from "./facturas.store.js";

/* =========================================================
   ACTIONS (opcional público)
========================================================= */

export {
  openFacturaAction,
  openFacturaPdfAction,
  downloadFacturaPdfAction,
  sendFacturaToClientAction,
  exportFacturasCsvAction,
} from "./facturas.actions.js";

/* =========================================================
   LOADERS (opcional público)
========================================================= */

export {
  loadFacturasCollection,
  loadFacturaDetailById,
} from "./facturas.loaders.js";

/* =========================================================
   STATE (opcional público)
========================================================= */

export {
  createFacturasState,
  closeFacturasDetail,
  resetFacturasViewState,
  resetFacturasDetailState,
  resetFacturasInflightState,
} from "./facturas.state.js";
