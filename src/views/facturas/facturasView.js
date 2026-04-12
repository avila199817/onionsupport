/* =========================================================
   Onion SPA - Facturas View (FINAL PRO CLEAN)
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
  setFacturasHydrated,
  setFacturasBootstrapped,
  closeFacturasDetail,
  setFacturasDetailData,
  setFacturasSendingFacturaId,
  setFacturasDownloadingFacturaId,
  setFacturasViewingFacturaId,
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
  const localState = createFacturasState();

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function getContainer() {
    return AppCore?.dom?.viewContainer || null;
  }

  function getStateForTemplate() {
    return {
      loading: localState.view.loading,
      loaded: localState.view.loaded,
      error: localState.view.error,
      refreshing: localState.view.refreshing,
      bootstrapped: localState.view.bootstrapped,
      remoteCount: localState.view.remoteCount,

      detailOpen: localState.detail.open,
      detailLoading: localState.detail.loading,
      detail: localState.detail.data,

      sendingFacturaId: localState.actions.sendingFacturaId,
      downloadingFacturaId: localState.actions.downloadingFacturaId,
      viewingFacturaId: localState.actions.viewingFacturaId,
    };
  }

  function getItems() {
    return getSortedFacturasStore();
  }

  function setDetail(factura = null) {
    setFacturasDetailData(localState, factura || null);
  }

  function closeDetail() {
    closeFacturasDetail(localState);
  }

  function setHydrated(value) {
    setFacturasHydrated(localState, value);
  }

  function setBootstrapped(value) {
    setFacturasBootstrapped(localState, value);
  }

  function setSendingFacturaId(value = "") {
    setFacturasSendingFacturaId(localState, value);
  }

  function setDownloadingFacturaId(value = "") {
    setFacturasDownloadingFacturaId(localState, value);
  }

  function setViewingFacturaId(value = "") {
    setFacturasViewingFacturaId(localState, value);
  }

  /* =========================================================
     LOADERS
  ========================================================= */
  async function loadFacturas({ silent = false } = {}) {
    return loadFacturasCollection({
      state: localState,
      render,
      silent,
    });
  }

  async function loadFacturaDetail(id) {
    return loadFacturaDetailById({
      state: localState,
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
      detail: localState.detail.data,
      onStart(facturaId) {
        setSendingFacturaId(facturaId);
        renderDetailOnly();
      },
      onSent({ facturaId, response }) {
        if (localState.detail.data?.id === facturaId) {
          localState.detail.data.enviadoA = safeText(
            response?.sent?.to,
            localState.detail.data.enviadoA
          );
          localState.detail.data.fechaEnvio = safeText(
            response?.sent?.at,
            localState.detail.data.fechaEnvio
          );
          setDetail(localState.detail.data);
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
    exportFacturasCsvAction();
  }

  /* =========================================================
     RENDER
  ========================================================= */
  function renderBody({ items = [], state = {} } = {}) {
    if (state.loading && !items.length) {
      return renderLoadingState();
    }

    if (state.error && !items.length) {
      return renderErrorState(state.error);
    }

    return renderCards({
      items,
      state,
    });
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    const items = getItems();
    const templateState = getStateForTemplate();

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
          ${renderBody({ items, state: templateState })}
        </div>
      </section>

      ${renderFacturasDetailModal({
        detailOpen: localState.detail.open,
        detailLoading: localState.detail.loading,
        factura: localState.detail.data,
        sendingFacturaId: localState.actions.sendingFacturaId,
      })}
    `;

    setHydrated(true);
    bind();
  }

  function renderDetailOnly() {
    if (!localState.view.hydrated) return;
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
        loading: localState.view.loading,
        refreshing: localState.view.refreshing,
        detailOpen: localState.detail.open,
        bootstrapped: localState.view.bootstrapped,
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

        loadFacturas().catch(() => {
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

    if (!localState.view.bootstrapped) {
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
