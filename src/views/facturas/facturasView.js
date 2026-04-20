/* =========================================================
   Onion SPA - Facturas View
   Archivo: src/views/facturas/facturasView.js

   FINAL PRO SYSTEM · VIEW REAL · FULL PATCH PORTAL MODAL

   RESPONSABILIDADES:
   - render principal de facturas
   - modal detail en portal global (body)
   - rerender granular
   - cero conflicto con shell SPA
   - performance pro
   - cleanup enterprise
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
  const DETAIL_MODAL_ID = "facturas-detail-root";

  const state = createFacturasState();

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let bindingsCleanup = null;
  let renderToken = 0;

  /* =====================================================
     CORE HELPERS
  ===================================================== */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[FacturasView]", ...args);
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

      error: safeText(
        state?.view?.error,
        ""
      ),

      lastSyncAt:
        getFacturasLastSyncAt(state),

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
    renderDetailPortal();
  }

  /* =====================================================
     PORTAL MODAL
  ===================================================== */

  function getDetailRoot() {
    return document.getElementById(
      DETAIL_MODAL_ID
    );
  }

  function ensureDetailRoot() {
    let root = getDetailRoot();

    if (root) return root;

    root = document.createElement("div");
    root.id = DETAIL_MODAL_ID;

    document.body.appendChild(root);

    return root;
  }

  function destroyDetailRoot() {
    try {
      getDetailRoot()?.remove?.();
    } catch {}
  }

  function renderDetailPortal() {
    const root = ensureDetailRoot();

    const detail =
      getFacturasDetailData(state);

    const detailOpen =
      isFacturasDetailOpen(state);

    root.innerHTML =
      renderFacturasDetailModal({
        detailOpen,

        detailLoading: Boolean(
          state?.detail?.loading
        ),

        factura: detail,

        sendingFacturaId: safeText(
          state?.actions
            ?.sendingFacturaId,
          ""
        ),

        viewingFacturaId: safeText(
          state?.actions
            ?.viewingFacturaId,
          ""
        ),

        downloadingFacturaId:
          safeText(
            state?.actions
              ?.downloadingFacturaId,
            ""
          ),
      });
  }

  /* =====================================================
     TEMPLATE
  ===================================================== */

  function renderBody({
    items = [],
    templateState = {},
  } = {}) {
    if (
      templateState.loading &&
      !items.length
    ) {
      return renderLoadingState();
    }

    if (
      templateState.error &&
      !items.length
    ) {
      return renderErrorState(
        templateState.error
      );
    }

    return renderCards({
      items,
      state: templateState,
    });
  }

  function buildHtml() {
    const items = getItems();
    const templateState =
      getTemplateState();

    return `
      <section
        class="panel-content dashboard ready"
        data-facturas-scope="${escapeHtml(
          SCOPE
        )}"
      >
        <div
          class="content-wrapper"
          style="
            display:grid;
            gap:var(--space-lg);
          "
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
    `;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function render() {
    const container =
      getContainer();

    if (!container) return null;

    ensureBaseState();

    container.innerHTML =
      buildHtml();

    renderDetailPortal();

    setFacturasHydrated(
      state,
      true
    );

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

    renderDetailPortal();

    return true;
  }

  /* =====================================================
     DATA LOADERS
  ===================================================== */

  async function loadFacturas({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    const hasData =
      getItems().length > 0;

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

      setFacturasLoading(
        state,
        false
      );

      setFacturasRefreshing(
        state,
        false
      );

      setFacturasLoaded(
        state,
        true
      );

      setFacturasLastSyncAt(
        state,
        new Date().toISOString()
      );
    } catch (error) {
      setFacturasLoading(
        state,
        false
      );

      setFacturasRefreshing(
        state,
        false
      );

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

  async function loadFacturaDetail(
    id = ""
  ) {
    if (!id) return null;

    setFacturasDetailOpen(
      state,
      true
    );

    setFacturasDetailLoading(
      state,
      true
    );

    renderDetailOnly();

    try {
      const detail =
        await loadFacturaDetailById({
          state,
          render: () => {},
          facturaId: id,
          force: true,
        });

      setFacturasDetailLoading(
        state,
        false
      );

      if (detail) {
        setDetail(detail);
      }

      renderDetailOnly();

      return detail;
    } catch {
      setFacturasDetailLoading(
        state,
        false
      );

      renderDetailOnly();

      showToast(
        "No se pudo cargar detalle.",
        "error"
      );

      return null;
    }
  }

  /* =====================================================
     ACTIONS
  ===================================================== */

  async function openFactura(
    id = ""
  ) {
    const facturaId =
      safeText(id, "");

    if (!facturaId) return null;

    setFacturasOpeningFacturaId(
      state,
      facturaId
    );

    setFacturasDetailOpen(
      state,
      true
    );

    setFacturasDetailLoading(
      state,
      true
    );

    renderDetailOnly();

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

      safeEmit(
        "facturas:open:success",
        {
          facturaId,
          detail,
        }
      );

      renderDetailOnly();

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

      renderDetailOnly();
    }
  }

  async function openFacturaPdf(
    id = ""
  ) {
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

  async function downloadFacturaPdf(
    id = ""
  ) {
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

  async function sendFacturaToClient(
    id = ""
  ) {
    return sendFacturaToClientAction({
      facturaId: id,
      detail:
        getFacturasDetailData(state),

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
      filenamePrefix:
        "facturas",
    });
  }

  /* =====================================================
     BINDINGS
  ===================================================== */

  function bind() {
    cleanupBindings();

    const cleanup =
      bindFacturasView({
        scopeName: SCOPE,

        getContainer,

        getState: () => ({
          loading:
            isFacturasLoading(state),

          refreshing:
            isFacturasRefreshing(
              state
            ),

          detailOpen:
            isFacturasDetailOpen(
              state
            ),

          bootstrapped:
            isFacturasBootstrapped(
              state
            ),
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
      typeof cleanup ===
      "function"
        ? cleanup
        : null;
  }

  /* =====================================================
     LIFECYCLE
  ===================================================== */

  async function init() {
    if (
      initialized &&
      inflightInit
    ) {
      return inflightInit;
    }

    destroyed = false;
    initialized = true;

    inflightInit =
      (async () => {
        safeLog("init");

        const token =
          nextRenderToken();

        render();

        await loadFacturas();

        if (
          isActiveToken(token)
        ) {
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

    closeFacturasDetail(state);

    clearFacturasActionIds(
      state
    );

    destroyDetailRoot();

    safeLog("destroy");
  }

  /* =====================================================
     API
  ===================================================== */

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
