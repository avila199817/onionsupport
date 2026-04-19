/* =========================================================
   Onion SPA - Facturas View
   Archivo: src/views/facturas/facturasView.js

   FINAL PRO SYSTEM · VIEW REAL · PATCH MODAL FIXED
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  renderHeader,
  renderCards,
  renderLoadingState,
  renderErrorState,
} from "./facturas.template.js";

import {
  renderFacturasDetailModal,
} from "./facturas.detail.template.js";

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
  setFacturasDetailOpen,
  setFacturasDetailLoading,
  setFacturasDetailData,
  setFacturasSendingFacturaId,
  setFacturasDownloadingFacturaId,
  setFacturasViewingFacturaId,
  setFacturasOpeningFacturaId,
  setFacturasLoading,
  setFacturasRefreshing,
  setFacturasLoaded,
  clearFacturasError,
  clearFacturasActionIds,
  closeFacturasDetail,
  setFacturasLastSyncAt,
  getFacturasLastSyncAt,
} from "./facturas.state.js";

import {
  loadFacturasCollection,
  loadFacturaDetailById,
} from "./facturas.loaders.js";

import {
  openFacturaAction,
  refreshFacturaDetailAction,
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

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let bindingsCleanup = null;
  let renderToken = 0;

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[FacturasView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[FacturasView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    try {
      AppCore?.events?.emit?.(event, payload);
    } catch {}
  }

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function safeErrorMessage(error = null) {
    return (
      error?.message ||
      error?.response?.message ||
      error?.response?.data?.message ||
      "No se pudieron cargar las facturas."
    );
  }

  function ensureBaseState() {
    if (!state.view) state.view = {};
    if (!state.detail) state.detail = {};
    if (!state.actions) state.actions = {};
    if (!state.inflight) state.inflight = {};
  }

  function getItems() {
    try {
      return getSortedFacturasStore();
    } catch {
      return [];
    }
  }

  function getTemplateState() {
    return {
      ...getFacturasTemplateState(state),
      error: safeText(state?.view?.error, ""),
      lastSyncAt: getFacturasLastSyncAt(state),
      selectedFacturaId: safeText(
        state?.view?.selectedFacturaId,
        ""
      ),
    };
  }

  function setDetail(data = null) {
    setFacturasDetailData(state, data);
    setFacturasDetailOpen(state, Boolean(data));
  }

  function closeDetail() {
    closeFacturasDetail(state);
    state.view.selectedFacturaId = "";
  }

  function renderBody({
    items = [],
    templateState = {},
  } = {}) {
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

  /* =====================================================
     MODAL FIX REAL
  ===================================================== */

  function buildHtml() {
    const items = getItems();
    const templateState = getTemplateState();

    const detail = getFacturasDetailData(state);
    const detailOpen = isFacturasDetailOpen(state);

    return `
      <section
        class="panel-content dashboard ready"
        data-facturas-scope="${escapeHtml(SCOPE)}"
      >
        <div
          class="content-wrapper"
          style="display:grid; gap:var(--space-lg);"
        >
          ${renderHeader({
            items,
            state: templateState,
          })}

          ${renderBody({
            items,
            templateState,
          })}
        </div>
      </section>

      ${renderFacturasDetailModal({
        detailOpen,
        detailLoading: Boolean(
          state?.detail?.loading
        ),
        factura: detail,
        sendingFacturaId: safeText(
          state?.actions?.sendingFacturaId,
          ""
        ),
        viewingFacturaId: safeText(
          state?.actions?.viewingFacturaId,
          ""
        ),
        downloadingFacturaId: safeText(
          state?.actions?.downloadingFacturaId,
          ""
        ),
      })}
    `;
  }

  function render() {
    const container = getContainer();

    if (!container) return null;

    ensureBaseState();

    container.innerHTML = buildHtml();

    setFacturasHydrated(state, true);

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    const result = render();

    if (!destroyed) {
      bind();
    }

    return result;
  }

  function renderDetailOnly() {
    if (!isFacturasHydrated(state)) {
      return null;
    }

    return rerender();
  }

  async function loadFacturas({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    const itemsBefore = getItems();
    const hasData = itemsBefore.length > 0;

    clearFacturasError(state);

    setFacturasLoading(
      state,
      !hasData && !silent
    );

    setFacturasRefreshing(
      state,
      hasData && asRefresh
    );

    render();

    try {
      await loadFacturasCollection({
        state,
        render: () => {},
        silent,
        force,
      });

      setFacturasLoading(state, false);
      setFacturasRefreshing(state, false);
      setFacturasLoaded(state, true);
      setFacturasLastSyncAt(
        state,
        new Date().toISOString()
      );
    } catch (error) {
      setFacturasLoading(state, false);
      setFacturasRefreshing(state, false);
      state.view.error =
        safeErrorMessage(error);

      if (!silent) {
        showToast(
          safeErrorMessage(error),
          "error"
        );
      }
    }

    render();
  }

  async function loadFacturaDetail(id = "") {
    if (!id) return null;

    setFacturasDetailOpen(state, true);
    setFacturasDetailLoading(state, true);

    render();

    try {
      const detail =
        await loadFacturaDetailById({
          state,
          render: () => {},
          facturaId: id,
          force: true,
        });

      setFacturasDetailLoading(state, false);

      if (detail) {
        setDetail(detail);
      }

      render();

      return detail;
    } catch {
      setFacturasDetailLoading(state, false);
      render();

      showToast(
        "No se pudo cargar detalle.",
        "error"
      );

      return null;
    }
  }

  async function openFactura(id = "") {
    const facturaId = safeText(id, "");

    if (!facturaId) return null;

    setFacturasOpeningFacturaId(
      state,
      facturaId
    );

    setFacturasDetailOpen(state, true);
    setFacturasDetailLoading(state, true);

    render();

    try {
      const detail =
        await openFacturaAction({
          facturaId,
          loadFacturaDetail,
          preferFresh: true,
          silent: true,
        });

      if (!detail) {
        throw new Error();
      }

      setDetail(detail);

      safeEmit("facturas:open:success", {
        facturaId,
        detail,
      });

      render();

      return detail;
    } catch {
      showToast(
        "No se pudo abrir la factura.",
        "error"
      );

      return null;
    } finally {
      setFacturasOpeningFacturaId(
        state,
        ""
      );

      setFacturasDetailLoading(
        state,
        false
      );

      render();
    }
  }

  async function openFacturaPdf(id = "") {
    return openFacturaPdfAction({
      facturaId: id,
      onStart(value) {
        setFacturasViewingFacturaId(
          state,
          value
        );
        renderDetailOnly();
      },
      onEnd() {
        setFacturasViewingFacturaId(
          state,
          ""
        );
        renderDetailOnly();
      },
    });
  }

  async function downloadFacturaPdf(id = "") {
    return downloadFacturaPdfAction({
      facturaId: id,
      onStart(value) {
        setFacturasDownloadingFacturaId(
          state,
          value
        );
        renderDetailOnly();
      },
      onEnd() {
        setFacturasDownloadingFacturaId(
          state,
          ""
        );
        renderDetailOnly();
      },
    });
  }

  async function sendFacturaToClient(id = "") {
    return sendFacturaToClientAction({
      facturaId: id,
      detail: getFacturasDetailData(state),

      onStart(value) {
        setFacturasSendingFacturaId(
          state,
          value
        );
        renderDetailOnly();
      },

      onEnd() {
        setFacturasSendingFacturaId(
          state,
          ""
        );
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

  function bind() {
    cleanupBindings();

    const cleanup = bindFacturasView({
      scopeName: SCOPE,
      getContainer,
      getState: () => ({
        loading: isFacturasLoading(state),
        refreshing:
          isFacturasRefreshing(state),
        detailOpen:
          isFacturasDetailOpen(state),
        bootstrapped:
          isFacturasBootstrapped(state),
      }),

      render: rerender,
      loadFacturas,
      openFactura,
      openFacturaPdf,
      downloadFacturaPdf,
      sendFacturaToClient,
      closeDetail,
      exportFacturasCsv,

      onBootstrap() {
        setFacturasBootstrapped(
          state,
          true
        );

        loadFacturas();
      },
    });

    bindingsCleanup =
      typeof cleanup === "function"
        ? cleanup
        : null;
  }

  async function init() {
    if (initialized && inflightInit) {
      return inflightInit;
    }

    destroyed = false;
    initialized = true;

    inflightInit = (async () => {
      safeLog("init");

      const token = nextRenderToken();

      render();

      await loadFacturas();

      if (isActiveToken(token)) {
        bind();
      }

      return api;
    })();

    try {
      return await inflightInit;
    } finally {
      inflightInit = null;
    }
  }

  function destroy() {
    destroyed = true;
    initialized = false;

    cleanupBindings();

    closeDetail();

    clearFacturasActionIds(state);

    safeLog("destroy");
  }

  const api = {
    init,
    mount: init,
    unmount: destroy,
    destroy,
    render: rerender,

    loadFacturas,
    openFactura,
    openFacturaPdf,
    downloadFacturaPdf,
    sendFacturaToClient,
    closeDetail,
    exportFacturasCsv,

    getItems,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default FacturasView;
