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
  setFacturasError,
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

  function ensureBaseState() {
    if (!state.view || typeof state.view !== "object") {
      state.view = createFacturasState().view;
    }

    if (!state.detail || typeof state.detail !== "object") {
      state.detail = createFacturasState().detail;
    }

    if (!state.actions || typeof state.actions !== "object") {
      state.actions = createFacturasState().actions;
    }

    if (!state.inflight || typeof state.inflight !== "object") {
      state.inflight = createFacturasState().inflight;
    }

    if (typeof state.view.selectedFacturaId !== "string") {
      state.view.selectedFacturaId = "";
    }

    if (typeof state.view.lastSyncAt !== "string") {
      setFacturasLastSyncAt(state, "");
    }

    if (typeof state.view.hydrated !== "boolean") {
      setFacturasHydrated(state, false);
    }

    if (typeof state.view.bootstrapped !== "boolean") {
      setFacturasBootstrapped(state, false);
    }

    if (typeof state.view.loading !== "boolean") {
      setFacturasLoading(state, false);
    }

    if (typeof state.view.refreshing !== "boolean") {
      setFacturasRefreshing(state, false);
    }

    if (typeof state.view.loaded !== "boolean") {
      setFacturasLoaded(state, false);
    }

    if (typeof state.detail.open !== "boolean") {
      setFacturasDetailOpen(state, false);
    }

    if (typeof state.detail.loading !== "boolean") {
      setFacturasDetailLoading(state, false);
    }

    if (typeof state.actions.sendingFacturaId !== "string") {
      setFacturasSendingFacturaId(state, "");
    }

    if (typeof state.actions.downloadingFacturaId !== "string") {
      setFacturasDownloadingFacturaId(state, "");
    }

    if (typeof state.actions.viewingFacturaId !== "string") {
      setFacturasViewingFacturaId(state, "");
    }

    if (typeof state.actions.openingFacturaId !== "string") {
      setFacturasOpeningFacturaId(state, "");
    }
  }

  function getItems() {
    try {
      return getSortedFacturasStore();
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function getTemplateState() {
    const snapshot = getFacturasTemplateState(state);

    return {
      ...snapshot,
      lastSyncAt: getFacturasLastSyncAt(state),
      selectedFacturaId: safeText(state?.view?.selectedFacturaId, ""),
    };
  }

  function setHydrated(value) {
    setFacturasHydrated(state, value);
  }

  function setBootstrapped(value) {
    setFacturasBootstrapped(state, value);
  }

  function setDetail(factura = null) {
    setFacturasDetailData(state, factura || null);
    setFacturasDetailOpen(state, Boolean(factura));
    return getFacturasDetailData(state);
  }

  function closeDetail() {
    closeFacturasDetail(state);
    state.view.selectedFacturaId = "";
    return true;
  }

  function setLoading(value) {
    setFacturasLoading(state, value);
    return isFacturasLoading(state);
  }

  function setRefreshing(value) {
    setFacturasRefreshing(state, value);
    return isFacturasRefreshing(state);
  }

  function setLoaded(value) {
    setFacturasLoaded(state, value);
    return Boolean(state?.view?.loaded);
  }

  function setError(value = "") {
    const text = safeText(value, "");

    if (text) {
      setFacturasError(state, text);
      return text;
    }

    clearFacturasError(state);
    return "";
  }

  function clearError() {
    clearFacturasError(state);
    return "";
  }

  function setDetailLoading(value) {
    setFacturasDetailLoading(state, value);
    return Boolean(state?.detail?.loading);
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

  function setOpeningFacturaId(value = "") {
    setFacturasOpeningFacturaId(state, value);
  }

  function setSelectedFacturaId(value = "") {
    state.view.selectedFacturaId = safeText(value, "");
    return state.view.selectedFacturaId;
  }

  function setLastSyncAt(value = "") {
    setFacturasLastSyncAt(state, value);
    return getFacturasLastSyncAt(state);
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

    if (!handled) {
      showToast(
        "Detalle cargado. Falta conectar facturas.modal.js para abrir el popup.",
        "info"
      );
    }

    return handled;
  }

  /* =====================================================
     DATA LOAD
  ===================================================== */

  async function loadFacturas({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    const itemsBefore = getItems();
    const hasVisibleData = itemsBefore.length > 0;

    clearError();
    setLoading(!hasVisibleData && !silent);
    setRefreshing(hasVisibleData && asRefresh);

    render();

    try {
      const result = await loadFacturasCollection({
        state,
        render: () => {},
        silent: Boolean(silent || force || asRefresh),
      });

      setLoading(false);
      setRefreshing(false);
      setLoaded(true);
      clearError();
      setLastSyncAt(new Date().toISOString());

      return result;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadFacturasCollection falló:", error);

      setLoading(false);
      setRefreshing(false);
      setLoaded(true);
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
    setFacturasDetailOpen(state, true);
    setDetailLoading(true);

    render();

    try {
      const detail = await loadFacturaDetailById({
        state,
        render: () => {},
        facturaId: id,
        force: true,
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
    setOpeningFacturaId(id);
    setFacturasDetailOpen(state, true);
    setDetailLoading(true);

    render();

    try {
      const detail = await openFacturaAction({
        facturaId: id,
        loadFacturaDetail,
        preferFresh: true,
        silent: true,
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
      setOpeningFacturaId("");
      setDetailLoading(false);

      if (!destroyed) {
        render();
      }
    }
  }

  async function handleRefreshFacturaFromModal(facturaId = "") {
    const id = safeText(facturaId, "");

    if (!id) {
      return null;
    }

    try {
      const detail = await refreshFacturaDetailAction({
        facturaId: id,
        loadFacturaDetail,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo refrescar la factura.", "error");
        return null;
      }

      setDetail(detail);
      openFacturaModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleRefreshFacturaFromModal falló:", error);
      showToast("No se pudo refrescar la factura.", "error");
      return null;
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
      silent: false,
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
      silent: false,
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
          const nextDetail = {
            ...detail,
            enviadoA: safeText(
              response?.sent?.to,
              detail.enviadoA
            ),
            fechaEnvio: safeText(
              response?.sent?.at,
              detail.fechaEnvio
            ),
          };

          setDetail(nextDetail);
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
      silent: false,
    });
  }

  function exportFacturasCsv() {
    return exportFacturasCsvAction({
      items: getItems(),
      filenamePrefix: "facturas",
      silent: false,
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

    const onRefresh = async (event) => {
      const facturaId =
        event?.detail?.facturaId ||
        event?.facturaId ||
        "";

      if (!facturaId) {
        return;
      }

      await handleRefreshFacturaFromModal(facturaId);
    };

    const onViewPdf = async (event) => {
      const facturaId =
        event?.detail?.facturaId ||
        event?.facturaId ||
        "";

      if (!facturaId) {
        return;
      }

      await openFacturaPdf(facturaId);
    };

    const onDownloadPdf = async (event) => {
      const facturaId =
        event?.detail?.facturaId ||
        event?.facturaId ||
        "";

      if (!facturaId) {
        return;
      }

      await downloadFacturaPdf(facturaId);
    };

    const onSend = async (event) => {
      const facturaId =
        event?.detail?.facturaId ||
        event?.facturaId ||
        "";

      if (!facturaId) {
        return;
      }

      await sendFacturaToClient(facturaId);
    };

    const eventBus = AppCore?.events;

    if (!eventBus?.on) {
      return () => {};
    }

    try {
      eventBus.on("facturas:modal:close", onClose);
      eventBus.on("facturas:modal:refresh", onRefresh);
      eventBus.on("facturas:modal:view-pdf", onViewPdf);
      eventBus.on("facturas:modal:download-pdf", onDownloadPdf);
      eventBus.on("facturas:modal:send", onSend);
    } catch (error) {
      safeWarn("bind facturas modal bridge error:", error);
    }

    return () => {
      try {
        eventBus?.off?.("facturas:modal:close", onClose);
      } catch {}

      try {
        eventBus?.off?.("facturas:modal:refresh", onRefresh);
      } catch {}

      try {
        eventBus?.off?.("facturas:modal:view-pdf", onViewPdf);
      } catch {}

      try {
        eventBus?.off?.("facturas:modal:download-pdf", onDownloadPdf);
      } catch {}

      try {
        eventBus?.off?.("facturas:modal:send", onSend);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    const cleanups = [];

    const bindingsCleanupFn = bindFacturasView({
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
    });

    if (typeof bindingsCleanupFn === "function") {
      cleanups.push(bindingsCleanupFn);
    }

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
    clearFacturasActionIds(state);
    setOpeningFacturaId("");
    setDetailLoading(false);
    setLoading(false);
    setRefreshing(false);
    setLoaded(false);
    clearError();
    setHydrated(false);
    setBootstrapped(false);
    setSelectedFacturaId("");
    setLastSyncAt("");

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
