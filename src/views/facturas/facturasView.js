/* =========================================================
   Onion SPA - Facturas View
   Archivo: src/views/facturas/facturasView.js

   FINAL PRO SYSTEM · VIEW REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista facturas
   - render principal de header + cards
   - carga inicial robusta
   - refresh con loader SOLO en la colección principal
   - apertura de factura con estado visual de loading
   - bind de eventos de la pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar modal detalle y acciones sin mezclar responsabilidades

   HARDENING PRO:
   - render inicial inmediato
   - carga posterior segura
   - anti-race token
   - cleanup total
   - fallback elegante si el modal aún no existe
   - misma lógica operativa que incidenciasView.js
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

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let bindingsCleanup = null;
  let renderToken = 0;

  /* =====================================================
     HELPERS CORE
  ===================================================== */

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
    if (!error) {
      return "No se pudieron cargar las facturas.";
    }

    const message =
      error?.message ||
      error?.response?.message ||
      error?.response?.data?.message ||
      error?.data?.message ||
      "No se pudieron cargar las facturas.";

    return String(message).trim() || "No se pudieron cargar las facturas.";
  }

  /* =====================================================
     STATE HELPERS
  ===================================================== */

  function getItems() {
    try {
      return getSortedFacturasStore();
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function getTemplateState() {
    return getFacturasTemplateState(state);
  }

  function ensureBaseState() {
    if (typeof state.loading !== "boolean") {
      state.loading = false;
    }

    if (typeof state.refreshing !== "boolean") {
      state.refreshing = false;
    }

    if (typeof state.error !== "string") {
      state.error = "";
    }

    if (typeof state.detailLoading !== "boolean") {
      state.detailLoading = false;
    }

    if (typeof state.detailOpen !== "boolean") {
      state.detailOpen = false;
    }

    if (typeof state.hydrated !== "boolean") {
      setFacturasHydrated(state, false);
    }

    if (typeof state.bootstrapped !== "boolean") {
      setFacturasBootstrapped(state, false);
    }
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

  function closeDetail() {
    closeFacturasDetail(state);
  }

  function setLoading(value) {
    state.loading = Boolean(value);
    return state.loading;
  }

  function setRefreshing(value) {
    state.refreshing = Boolean(value);
    return state.refreshing;
  }

  function setError(value = "") {
    state.error = safeText(value, "");
    return state.error;
  }

  function setDetailLoading(value) {
    state.detailLoading = Boolean(value);
    return state.detailLoading;
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

  function setSelectedFacturaId(value = "") {
    state.selectedFacturaId = safeText(value, "");
    return state.selectedFacturaId;
  }

  function setLastSyncAt(value = "") {
    state.lastSyncAt = safeText(value, "");
    return state.lastSyncAt;
  }

  /* =====================================================
     MODAL BRIDGE
  ===================================================== */

  function openFacturaModalBridge(detail = null) {
    if (!detail) {
      return false;
    }

    let handled = false;

    try {
      safeEmit("facturas:modal:open", { detail });
      handled = true;
    } catch {}

    try {
      const globalHook =
        window?.OnionFacturasModal?.open ||
        window?.renderFacturaDetailModal ||
        window?.renderFacturaModal;

      if (typeof globalHook === "function") {
        globalHook(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("modal bridge hook falló:", error);
    }

    return handled;
  }

  /* =====================================================
     LOADERS
  ===================================================== */

  async function loadFacturas({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    const itemsBefore = getItems();
    const hasVisibleData = itemsBefore.length > 0;

    setError("");
    setLoading(!hasVisibleData && !silent);
    setRefreshing(hasVisibleData && asRefresh);

    render();

    try {
      const result = await loadFacturasCollection({
        state,
        render: () => {},
        silent,
        force,
      });

      setLoading(false);
      setRefreshing(false);
      setError("");
      setLastSyncAt(new Date().toISOString());

      return result;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadFacturasCollection falló:", error);

      setLoading(false);
      setRefreshing(false);
      setError(message);

      if (!silent) {
        showToast(message, "error");
      }

      return getItems();
    }
  }

  async function loadFacturaDetail(facturaId = "") {
    const id = safeText(facturaId, "");

    if (!id) {
      return null;
    }

    setSelectedFacturaId(id);
    setDetailLoading(true);

    render();

    try {
      const detail = await loadFacturaDetailById({
        state,
        render: () => {},
        facturaId: id,
      });

      setDetailLoading(false);

      if (detail) {
        setDetail(detail);
      }

      return detail;
    } catch (error) {
      setDetailLoading(false);
      safeWarn("loadFacturaDetailById falló:", error);
      showToast("No se pudo cargar el detalle de la factura.", "error");
      return null;
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
  } = {}) {
    const token = nextRenderToken();

    ensureBaseState();
    render();

    await loadFacturas({
      force,
      silent: false,
      asRefresh,
    });

    if (!isActiveToken(token)) {
      return api;
    }

    render();

    return api;
  }

  /* =====================================================
     ACTION FLOWS
  ===================================================== */

  async function openFactura(facturaId = "") {
    const id = safeText(facturaId, "");

    if (!id) {
      showToast("Factura inválida.", "error");
      return null;
    }

    setSelectedFacturaId(id);
    setViewingFacturaId(id);
    setDetailLoading(true);

    render();

    try {
      const detail = await openFacturaAction({
        facturaId: id,
        loadFacturaDetail,
      });

      if (!detail) {
        showToast("No se pudo abrir la factura.", "error");
        return null;
      }

      setDetail(detail);
      openFacturaModalBridge(detail);

      safeEmit("facturas:open:success", {
        facturaId: id,
        detail,
      });

      return detail;
    } catch (error) {
      safeWarn("openFactura falló:", error);
      showToast("No se pudo abrir la factura.", "error");
      return null;
    } finally {
      setViewingFacturaId("");
      setDetailLoading(false);

      if (!destroyed) {
        render();
      }
    }
  }

  async function openFacturaPdf(facturaId = "") {
    return openFacturaPdfAction({
      facturaId,
      onStart(id) {
        setViewingFacturaId(id);
        renderDetailOnly();
      },
      onEnd() {
        setViewingFacturaId("");
        renderDetailOnly();
      },
    });
  }

  async function downloadFacturaPdf(facturaId = "") {
    return downloadFacturaPdfAction({
      facturaId,
      onStart(id) {
        setDownloadingFacturaId(id);
        renderDetailOnly();
      },
      onEnd() {
        setDownloadingFacturaId("");
        renderDetailOnly();
      },
    });
  }

  async function sendFacturaToClient(facturaId = "") {
    return sendFacturaToClientAction({
      facturaId,
      detail: getFacturasDetailData(state),
      onStart(id) {
        setSendingFacturaId(id);
        renderDetailOnly();
      },
      onSent({ facturaId: sentId, response }) {
        const detail = getFacturasDetailData(state);

        if (detail?.id === sentId || detail?.facturaId === sentId) {
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
        await loadFacturas({
          force: true,
          silent: true,
          asRefresh: true,
        });

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

  /* =====================================================
     RENDER
  ===================================================== */

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

  function buildHtml() {
    const items = getItems();
    const templateState = getTemplateState();

    return `
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
  }

  function render() {
    const container = getContainer();

    if (!container) {
      safeWarn("No se encontró #view-container.");
      return null;
    }

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Facturas");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    container.innerHTML = buildHtml();

    setHydrated(true);

    return container;
  }

  function rerender() {
    if (destroyed) {
      return null;
    }

    const container = render();

    if (!destroyed) {
      bind();
    }

    return container;
  }

  function renderDetailOnly() {
    if (!isFacturasHydrated(state)) {
      return null;
    }

    return rerender();
  }

  /* =====================================================
     BINDINGS
  ===================================================== */

  function bindFacturasModalBridgeEvents() {
    const onClose = () => {
      closeDetail();

      if (!destroyed) {
        render();
      }
    };

    const eventBus = AppCore?.events;

    if (!eventBus?.on) {
      return () => {};
    }

    try {
      eventBus.on("facturas:modal:close", onClose);
    } catch (error) {
      safeWarn("bind facturas modal bridge error:", error);
    }

    return () => {
      try {
        eventBus?.off?.("facturas:modal:close", onClose);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    const cleanups = [];

    cleanups.push(
      bindFacturasView({
        scopeName: SCOPE,
        getContainer,
        getState: () => ({
          loading: isFacturasLoading(state),
          refreshing: isFacturasRefreshing(state),
          detailOpen: isFacturasDetailOpen(state),
          bootstrapped: isFacturasBootstrapped(state),
        }),
        render: rerender,
        loadFacturas: (options = {}) =>
          loadFacturas({
            force: Boolean(options?.force),
            silent: Boolean(options?.silent),
            asRefresh: Boolean(options?.asRefresh),
          }),
        openFactura,
        openFacturaPdf,
        downloadFacturaPdf,
        sendFacturaToClient,
        closeDetail,
        exportFacturasCsv,
        onBootstrap() {
          setBootstrapped(true);

          loadFacturas({
            force: false,
            silent: false,
            asRefresh: false,
          }).catch(() => {
            showToast("No se pudieron cargar las facturas.", "error");
          });
        },
      })
    );

    cleanups.push(bindFacturasModalBridgeEvents());

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =====================================================
     PUBLIC FLOWS
  ===================================================== */

  async function reload(options = {}) {
    if (destroyed) {
      return api;
    }

    const {
      force = true,
      asRefresh = true,
    } = options || {};

    try {
      await renderAndLoad({
        force,
        asRefresh,
      });
    } catch (error) {
      safeWarn("reload falló:", error);
    }

    if (!destroyed) {
      bind();
    }

    return api;
  }

  async function init() {
    if (initialized && inflightInit) {
      return inflightInit;
    }

    destroyed = false;
    initialized = true;

    ensureBaseState();

    inflightInit = (async () => {
      safeLog("init");

      await renderAndLoad({
        force: false,
        asRefresh: false,
      });

      if (!destroyed) {
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

    nextRenderToken();

    cleanupBindings();

    closeDetail();
    setViewingFacturaId("");
    setDownloadingFacturaId("");
    setSendingFacturaId("");
    setDetailLoading(false);
    setLoading(false);
    setRefreshing(false);
    setError("");
    setHydrated(false);
    setBootstrapped(false);

    safeLog("destroy");
  }

  /* =====================================================
     LEGACY API
  ===================================================== */

  function mount() {
    return init();
  }

  function unmount() {
    return destroy();
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    mount,
    unmount,
    render: rerender,
    reload,
    destroy,

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
