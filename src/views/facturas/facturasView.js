/* =========================================================
   Onion SPA - Facturas View (FINAL PRO CLEAN V3)
   Archivo: src/views/facturas/facturasView.js

   Responsabilidades:
   - orquestar la vista principal de facturas
   - componer render principal + modal detalle
   - delegar api / store / state / actions / bindings
   - mantener la vista limpia, modular y escalable
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  renderHeader,
  renderCards,
  renderLoadingState,
  renderErrorState,
} from "./facturas.template.js";

import { renderFacturasDetailModal } from "./facturas.detail.template.js";

import { getSortedFacturasStore } from "./facturas.store.js";

import {
  createFacturasState,
  getFacturasTemplateState,
  isFacturasHydrated,
  isFacturasBootstrapped,
  isFacturasLoading,
  isFacturasRefreshing,
  isFacturasDetailOpen,
  getFacturasDetailData,
  setFacturasHydrated,
  setFacturasBootstrapped,
  setFacturasDetailData,
  setFacturasSendingFacturaId,
  setFacturasDownloadingFacturaId,
  setFacturasViewingFacturaId,
  closeFacturasDetail,
} from "./facturas.state.js";

import {
  loadFacturasCollection,
  loadFacturaDetailById,
} from "./facturas.loaders.js";

import {
  openFacturaAction,
  openFacturaPdfAction,
  downloadFacturaPdfAction,
  sendFacturaToClientAction,
  exportFacturasCsvAction,
} from "./facturas.actions.js";

import { bindFacturasView } from "./facturas.bindings.js";

import {
  escapeHtml,
  safeText,
  showToast,
} from "./facturas.utils.js";

export const FacturasView = (() => {
  "use strict";

  const SCOPE = "view:facturas";
  const state = createFacturasState();

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function getContainer() {
    return AppCore?.dom?.viewContainer || null;
  }

  function getItems() {
    return getSortedFacturasStore();
  }

  function getTemplateState() {
    return getFacturasTemplateState(state);
  }

  function setHydrated(value) {
    setFacturasHydrated(state, value);
  }

  function setBootstrapped(value) {
    setFacturasBootstrapped(state, value);
  }

  function setDetail(factura = null) {
    setFacturasDetailData(state, factura || null);
  }

  function setSendingFacturaId(value = "") {
    setFacturasSendingFacturaId(state, value);
  }

  function setDownloadingFacturaId(value = "") {
    setFacturasDownloadingFacturaId(state, value);
  }

  function setViewingFacturaId(value = "") {
    setFacturasViewingFacturaId(state, value);
  }

  function closeDetail() {
    closeFacturasDetail(state);
  }

  /* =========================================================
     LOADERS
  ========================================================= */
  async function loadFacturas({ silent = false } = {}) {
    return loadFacturasCollection({
      state,
      render,
      silent,
    });
  }

  async function loadFacturaDetail(id) {
    return loadFacturaDetailById({
      state,
      render,
      facturaId: id,
    });
  }

  /* =========================================================
     ACTIONS
  ========================================================= */
  async function openFactura(id) {
    return openFacturaAction({
      facturaId: id,
      loadFacturaDetail,
    });
  }

  async function openFacturaPdf(id) {
    return openFacturaPdfAction({
      facturaId: id,
      onStart(facturaId) {
        setViewingFacturaId(facturaId);
        renderDetailOnly();
      },
      onEnd() {
        setViewingFacturaId("");
        renderDetailOnly();
      },
    });
  }

  async function downloadFacturaPdf(id) {
    return downloadFacturaPdfAction({
      facturaId: id,
      onStart(facturaId) {
        setDownloadingFacturaId(facturaId);
        renderDetailOnly();
      },
      onEnd() {
        setDownloadingFacturaId("");
        renderDetailOnly();
      },
    });
  }

  async function sendFacturaToClient(id) {
    return sendFacturaToClientAction({
      facturaId: id,
      detail: getFacturasDetailData(state),
      onStart(facturaId) {
        setSendingFacturaId(facturaId);
        renderDetailOnly();
      },
      onSent({ facturaId, response }) {
        const detail = getFacturasDetailData(state);

        if (detail?.id === facturaId) {
          detail.enviadoA = safeText(
            response?.sent?.to,
            detail.enviadoA
          );

          detail.fechaEnvio = safeText(
            response?.sent?.at,
            detail.fechaEnvio
          );

          setDetail(detail);
        }
      },
      async reloadFacturas() {
        await loadFacturas({ silent: true });
        render();
      },
      onEnd() {
        setSendingFacturaId("");
        renderDetailOnly();
      },
    });
  }

  function exportFacturasCsv() {
    return exportFacturasCsvAction({
      items: getItems(),
      filenamePrefix: "facturas",
    });
  }

  /* =========================================================
     RENDER
  ========================================================= */
  function renderBody({ items = [], templateState = {} } = {}) {
    if (templateState.loading && !items.length) {
      return renderLoadingState();
    }

    if (templateState.error && !items.length) {
      return renderErrorState(templateState.error);
    }

    return renderCards({
      items,
      state: templateState,
    });
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    const items = getItems();
    const templateState = getTemplateState();

    AppCore?.cleanup?.run?.(SCOPE);
    AppCore?.setDocumentTitle?.("Facturas");
    AppCore?.clearDynamicContainers?.();

    container.innerHTML = `
      <section
        class="panel-content dashboard ready"
        data-facturas-scope="${escapeHtml(SCOPE)}"
      >
        <div class="content-wrapper" style="display:grid; gap:var(--space-lg);">
          ${renderHeader({ items, state: templateState })}
          ${renderBody({ items, templateState })}
        </div>
      </section>

      ${renderFacturasDetailModal({
        detailOpen: templateState.detailOpen,
        detailLoading: templateState.detailLoading,
        factura: templateState.detail,
        sendingFacturaId: templateState.sendingFacturaId,
      })}
    `;

    setHydrated(true);
    bind();
  }

  function renderDetailOnly() {
    if (!isFacturasHydrated(state)) return;
    render();
  }

  /* =========================================================
     BINDINGS
  ========================================================= */
  function bind() {
    bindFacturasView({
      scopeName: SCOPE,
      getContainer,
      getState: () => ({
        loading: isFacturasLoading(state),
        refreshing: isFacturasRefreshing(state),
        detailOpen: isFacturasDetailOpen(state),
        bootstrapped: isFacturasBootstrapped(state),
      }),
      render,
      loadFacturas,
      openFactura,
      openFacturaPdf,
      downloadFacturaPdf,
      sendFacturaToClient,
      closeDetail,
      exportFacturasCsv,
      onBootstrap() {
        setBootstrapped(true);

        loadFacturas({ silent: false }).catch(() => {
          showToast("No se pudieron cargar las facturas.", "error");
        });
      },
    });
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */
  function mount() {
    render();

    if (!isFacturasBootstrapped(state)) {
      bind();
    }
  }

  function unmount() {
    AppCore?.cleanup?.run?.(SCOPE);
    closeDetail();
    setHydrated(false);
    setBootstrapped(false);
  }

  function reload() {
    return loadFacturas({ silent: false });
  }

  return {
    mount,
    unmount,
    render,
    reload,
    loadFacturas,
    openFactura,
    closeDetail,
  };
})();
