/* =========================================================
   Onion SPA - Facturas Module Index
   Archivo: src/views/facturas/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo facturas
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y facturasView.js
   - init / reload / destroy seguros
   - exponer modal / helpers públicos
   - evitar duplicidad de lógica en index.js

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo no existe
========================================================= */

import FacturasView from "./facturasView.js";

/* =========================================================
   CORE EXPORTS
========================================================= */

export { FacturasView };
export default FacturasView;

/* =========================================================
   INTERNAL SAFE CALL
========================================================= */

function safeCall(target, method, args = [], fallback = undefined) {
  try {
    const fn = target?.[method];

    if (typeof fn === "function") {
      return fn(...args);
    }
  } catch {}

  return fallback;
}

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  safeCall(FacturasView, "init", args);

export const mount = (...args) =>
  safeCall(FacturasView, "mount", args);

export const render = (...args) =>
  safeCall(FacturasView, "render", args);

export const reload = (...args) =>
  safeCall(FacturasView, "reload", args);

export const destroy = (...args) =>
  safeCall(FacturasView, "destroy", args);

export const unmount = (...args) =>
  safeCall(FacturasView, "unmount", args);

/* =========================================================
   ACTIONS API
========================================================= */

export const loadFacturas = (...args) =>
  safeCall(FacturasView, "loadFacturas", args);

export const openFactura = (...args) =>
  safeCall(FacturasView, "openFactura", args);

export const openFacturaPdf = (...args) =>
  safeCall(FacturasView, "openFacturaPdf", args);

export const downloadFacturaPdf = (...args) =>
  safeCall(FacturasView, "downloadFacturaPdf", args);

export const sendFacturaToClient = (...args) =>
  safeCall(FacturasView, "sendFacturaToClient", args);

export const closeDetail = (...args) =>
  safeCall(FacturasView, "closeDetail", args);

export const exportFacturasCsv = (...args) =>
  safeCall(FacturasView, "exportFacturasCsv", args);

/* =========================================================
   DATA API
========================================================= */

export const getItems = (...args) =>
  safeCall(FacturasView, "getItems", args, []);

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
  safeObject,
  safeBoolean,
  first,
  normalizeWhitespace,
  escapeHtml,
  truncate as truncateText,
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
  getFacturasLastSyncAt,
  getFacturasPage,
  getFacturasPageSize,

  isFacturasDetailOpen,
  isFacturasDetailLoading,
  getFacturasDetailData,

  getFacturasSendingFacturaId,
  getFacturasDownloadingFacturaId,
  getFacturasViewingFacturaId,
  getFacturasOpeningFacturaId,

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
  setFacturasLastSyncAt,
  setFacturasPage,
  setFacturasPageSize,

  setFacturasDetailOpen,
  setFacturasDetailLoading,
  setFacturasDetailData,
  openFacturasDetail,
  closeFacturasDetail,

  setFacturasSendingFacturaId,
  setFacturasDownloadingFacturaId,
  setFacturasViewingFacturaId,
  setFacturasOpeningFacturaId,
  clearFacturasActionIds,

  setFacturasInflightLoad,
  setFacturasInflightDetail,

  patchFacturasViewState,
  patchFacturasDetailState,

  getFacturasTemplateState,
  getFacturasStateSnapshot,
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
  getFacturaDetailFromStoreAction,
  getFacturaDetailAction,
  openFacturaAction,
  refreshFacturaDetailAction,
  openFacturaPdfAction,
  downloadFacturaPdfAction,
  sendFacturaToClientAction,
  copyFacturaIdAction,
  exportFacturasCsvAction,

  getFacturaIdAction,
  getFacturaNumberAction,
  getFacturaClientAction,
  getFacturaEmailAction,
  getFacturaDateAction,
  getFacturaEstadoPagoAction,
  getFacturaEstadoAction,
  getFacturaFormaPagoAction,
  getFacturaMonedaAction,
  getFacturaTotalAction,
  normalizeFacturaDetailAction,
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
  renderSectionCard,
  renderHeaderActions,
  renderFacturasDetailContent,
  renderFacturasDetailModal,
} from "./facturas.detail.template.js";

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(FacturasView?.initialized);

export const isDestroyed = () =>
  Boolean(FacturasView?.destroyed);

/* =========================================================
   LEGACY GLOBAL BRIDGE (OPTIONAL)
========================================================= */

try {
  if (typeof window !== "undefined") {
    window.OnionFacturas = {
      init,
      mount,
      render,
      reload,
      destroy,
      unmount,

      loadFacturas,
      openFactura,
      openFacturaPdf,
      downloadFacturaPdf,
      sendFacturaToClient,
      closeDetail,
      exportFacturasCsv,

      getItems,

      isInitialized,
      isDestroyed,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */
