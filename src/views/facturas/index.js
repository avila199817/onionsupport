/* =========================================================
   Onion SPA - Facturas Module Index
   Archivo: src/views/facturas/index.js

   Responsabilidades:
   - punto único de entrada del módulo facturas
   - exportar la vista principal
   - exportar el modelo público del módulo
   - exportar utilidades y helpers reutilizables
   - centralizar la superficie pública del módulo
========================================================= */

/* =========================================================
   VIEW PRINCIPAL
========================================================= */

export { FacturasView } from "./facturasView.js";

/* =========================================================
   MODEL PÚBLICO
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
   UTILS REUTILIZABLES
========================================================= */

export {
  safeText,
  safeNumber,
  safeArray,
  escapeHtml,
  showToast,
} from "./facturas.utils.js";

/* =========================================================
   STATE
========================================================= */

export {
  createFacturasState,
  resetFacturasViewState,
  resetFacturasDetailState,
  resetFacturasInflightState,
  resetFacturasState,
  getFacturasViewState,
  getFacturasDetailState,
  getFacturasActionsState,
  getFacturasInflightState,
  isFacturasHydrated,
  isFacturasLoading,
  isFacturasLoaded,
  isFacturasRefreshing,
  isFacturasBootstrapped,
  getFacturasError,
  getFacturasRemoteCount,
  isFacturasDetailOpen,
  isFacturasDetailLoading,
  getFacturasDetailData,
  getFacturasSendingFacturaId,
  getFacturasDownloadingFacturaId,
  getFacturasViewingFacturaId,
  getFacturasInflightLoad,
  getFacturasInflightDetail,
  setFacturasHydrated,
  setFacturasLoading,
  setFacturasLoaded,
  setFacturasError,
  clearFacturasError,
  setFacturasRefreshing,
  setFacturasBootstrapped,
  setFacturasRemoteCount,
  setFacturasDetailOpen,
  setFacturasDetailLoading,
  setFacturasDetailData,
  openFacturasDetail,
  closeFacturasDetail,
  setFacturasSendingFacturaId,
  setFacturasDownloadingFacturaId,
  setFacturasViewingFacturaId,
  clearFacturasActionIds,
  setFacturasInflightLoad,
  setFacturasInflightDetail,
  getFacturasTemplateState,
} from "./facturas.state.js";

/* =========================================================
   STORE
========================================================= */

export {
  getFacturasStore,
  getSortedFacturasStore,
  getFacturaByIdStore,
  hasFacturasStore,
  countFacturasStore,
  setFacturasStore,
  appendFacturasStore,
  upsertFacturaStore,
  removeFacturaByIdStore,
  clearFacturasStore,
} from "./facturas.store.js";

/* =========================================================
   API
========================================================= */

export {
  fetchFacturasRequest,
  fetchFacturaDetailRequest,
  fetchFacturaPdfUrlRequest,
  sendFacturaRequest,
} from "./facturas.api.js";

/* =========================================================
   LOADERS
========================================================= */

export {
  loadFacturasCollection,
  loadFacturaDetailById,
} from "./facturas.loaders.js";

/* =========================================================
   ACTIONS
========================================================= */

export {
  openFacturaAction,
  openFacturaPdfAction,
  downloadFacturaPdfAction,
  sendFacturaToClientAction,
  exportFacturasCsvAction,
} from "./facturas.actions.js";

/* =========================================================
   BINDINGS
========================================================= */

export { bindFacturasView } from "./facturas.bindings.js";

/* =========================================================
   TEMPLATES
========================================================= */

export {
  renderHeader,
  renderCards,
  renderLoadingState,
  renderErrorState,
} from "./facturas.template.js";

export {
  renderMiniMeta,
  renderDetailStat,
  renderFacturasDetailContent,
  renderFacturasDetailModal,
} from "./facturas.detail.template.js";
