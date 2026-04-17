/* =========================================================
   Onion SPA - Clientes View
   Archivo: src/views/clientes/clientesView.js

   FINAL PRO SYSTEM · VIEW REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista clientes
   - render principal de header + tabla
   - paginación fija por vista
   - carga inicial robusta
   - refresh con loader SOLO en tabla
   - apertura de cliente con estado visual de loading
   - bind de eventos de la pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar acciones y modal sin mezclar responsabilidades

   HARDENING PRO:
   - render inicial inmediato
   - carga posterior segura
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback elegante si el modal aún no existe
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  clientesState,
  setHydrated,
} from "./clientes.state.js";

import {
  loadClientes,
  hydrateFromCache,
} from "./clientes.api.js";

import {
  getClientes,
} from "./clientes.store.js";

import {
  renderHeader,
  renderTable,
} from "./clientes.table.template.js";

import {
  DEFAULT_PAGE_SIZE,
  normalizeClientesCollection,
  sortClientesByUpdatedDesc,
  paginateClientes,
  findClienteById,
} from "./clientes.model.js";

import {
  openClienteAction,
  copyClienteIdAction,
  exportClientesCsvAction,
  createClienteAction,
  refreshClienteDetailAction,
} from "./clientes.actions.js";

export const ClientesView = (() => {
  "use strict";

  const SCOPE = "view:clientes";

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
      AppCore?.utils?.log?.("[ClientesView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[ClientesView]", ...args);
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

  function setState(patch = {}) {
    if (!patch || typeof patch !== "object") {
      return clientesState;
    }

    Object.assign(clientesState, patch);

    return clientesState;
  }

  function ensureBaseState() {
    const pageSize = Math.max(
      1,
      Number(clientesState?.pageSize || DEFAULT_PAGE_SIZE)
    );

    if (!Number.isFinite(Number(clientesState?.page))) {
      clientesState.page = 1;
    }

    clientesState.page = Math.max(1, Number(clientesState.page || 1));
    clientesState.pageSize = pageSize;

    if (typeof clientesState.loading !== "boolean") {
      clientesState.loading = false;
    }

    if (typeof clientesState.refreshing !== "boolean") {
      clientesState.refreshing = false;
    }

    if (typeof clientesState.creating !== "boolean") {
      clientesState.creating = false;
    }

    clientesState.openingClientId =
      typeof clientesState.openingClientId === "string"
        ? clientesState.openingClientId
        : "";

    clientesState.error =
      typeof clientesState.error === "string"
        ? clientesState.error
        : "";
  }

  function getRawItems() {
    try {
      return getClientes();
    } catch {
      return [];
    }
  }

  function getItems() {
    try {
      const raw = getRawItems();
      const normalized = normalizeClientesCollection(raw);

      return sortClientesByUpdatedDesc(normalized);
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function getPaginationMeta(items = []) {
    return paginateClientes(
      items,
      clientesState.page || 1,
      clientesState.pageSize || DEFAULT_PAGE_SIZE
    );
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (clientesState.page !== pagination.page) {
      clientesState.page = pagination.page;
    }

    return pagination;
  }

  function showToast(message = "", type = "info") {
    try {
      if (typeof AppCore?.toast?.[type] === "function") {
        AppCore.toast[type](message);
        return;
      }
    } catch {}

    try {
      AppCore?.toast?.show?.(message, type);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.[type]?.(message);
    } catch {}
  }

  function safeErrorMessage(error = null) {
    if (!error) {
      return "No se pudo cargar la colección de clientes.";
    }

    const message =
      error?.message ||
      error?.response?.message ||
      error?.data?.message ||
      "No se pudo cargar la colección de clientes.";

    return String(message).trim() || "No se pudo cargar la colección de clientes.";
  }

  /* =====================================================
     MODAL BRIDGE
  ===================================================== */

  function openClienteModalBridge(detail = null) {
    if (!detail) {
      return false;
    }

    let handled = false;

    try {
      safeEmit("clientes:modal:open", { detail });
      handled = true;
    } catch {}

    try {
      const globalHook =
        window?.OnionClientesModal?.open ||
        window?.renderClienteDetailModal ||
        window?.renderClienteModal;

      if (typeof globalHook === "function") {
        globalHook(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("modal bridge hook falló:", error);
    }

    if (!handled) {
      showToast(
        "Detalle cargado. Falta conectar clientes.modal.js para abrir el popup.",
        "info"
      );
    }

    return handled;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function buildHtml() {
    const items = getItems();

    clampPageAgainstItems(items);

    return `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader({
            items,
            state: clientesState,
          })}

          ${renderTable({
            items,
            state: clientesState,
          })}
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
      AppCore?.setDocumentTitle?.("Clientes");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    container.innerHTML = buildHtml();

    setHydrated?.(true);

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

  /* =====================================================
     DATA LOAD
  ===================================================== */

  async function loadData({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    const itemsBefore = getItems();
    const hasVisibleData = itemsBefore.length > 0;

    setState({
      error: "",
      loading: !hasVisibleData && !silent,
      refreshing: hasVisibleData && asRefresh,
    });

    render();

    try {
      await loadClientes({ force });

      setState({
        loading: false,
        refreshing: false,
        error: "",
        lastSyncAt: new Date().toISOString(),
      });

      const itemsAfter = getItems();

      clampPageAgainstItems(itemsAfter);

      return itemsAfter;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadClientes falló:", error);

      setState({
        loading: false,
        refreshing: false,
        error: message,
      });

      if (!silent) {
        showToast(message, "error");
      }

      return getItems();
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
  } = {}) {
    const token = nextRenderToken();

    try {
      hydrateFromCache?.();
    } catch (error) {
      safeWarn("hydrateFromCache falló:", error);
    }

    ensureBaseState();
    render();

    await loadData({
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
     PAGE ACTIONS
  ===================================================== */

  function goToPage(page = 1) {
    const items = getItems();

    const pagination = paginateClientes(
      items,
      page,
      clientesState.pageSize || DEFAULT_PAGE_SIZE
    );

    setState({
      page: pagination.page,
    });

    rerender();

    return pagination.page;
  }

  function goPrevPage() {
    return goToPage((clientesState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((clientesState.page || 1) + 1);
  }

  /* =====================================================
     ACTION FLOWS
  ===================================================== */

  async function handleOpenCliente(clientId = "") {
    const id = String(clientId || "").trim();

    if (!id) {
      showToast("Cliente inválido.", "error");
      return null;
    }

    setState({
      openingClientId: id,
    });

    rerender();

    try {
      const detail = await openClienteAction({
        clientId: id,
        preferFresh: true,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo abrir el cliente.", "error");
        return null;
      }

      openClienteModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleOpenCliente falló:", error);
      showToast("No se pudo abrir el cliente.", "error");
      return null;
    } finally {
      setState({
        openingClientId: "",
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleRefreshClienteFromModal(clientId = "") {
    const id = String(clientId || "").trim();

    if (!id) {
      return null;
    }

    try {
      const detail = await refreshClienteDetailAction({
        clientId: id,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo refrescar el cliente.", "error");
        return null;
      }

      openClienteModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleRefreshClienteFromModal falló:", error);
      showToast("No se pudo refrescar el cliente.", "error");
      return null;
    }
  }

  async function handleCopyClienteId(clientId = "") {
    const ok = await copyClienteIdAction({
      clientId,
      silent: false,
    });

    return ok;
  }

  function handleExportCsv() {
    return exportClientesCsvAction({
      silent: false,
    });
  }

  async function handleCreateCliente() {
    if (clientesState.creating) {
      return false;
    }

    setState({
      creating: true,
    });

    rerender();

    try {
      const ok = await createClienteAction({
        silent: false,
      });

      return ok;
    } finally {
      setState({
        creating: false,
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  /* =====================================================
     CLICK DELEGATION
  ===================================================== */

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      const openBtn = event.target.closest('[data-action="open-client"]');
      if (openBtn) {
        event.preventDefault();

        const clientId = String(openBtn.dataset.clientId || "").trim();

        await handleOpenCliente(clientId);
        return;
      }

      const copyBtn = event.target.closest('[data-action="copy-client-id"]');
      if (copyBtn) {
        event.preventDefault();

        const clientId = String(
          copyBtn.dataset.clientId || copyBtn.dataset.clientCode || ""
        ).trim();

        if (!clientId) {
          return;
        }

        await handleCopyClienteId(clientId);
        return;
      }

      const prevBtn = event.target.closest('[data-action="prev-page"]');
      if (prevBtn) {
        event.preventDefault();
        goPrevPage();
        return;
      }

      const nextBtn = event.target.closest('[data-action="next-page"]');
      if (nextBtn) {
        event.preventDefault();
        goNextPage();
        return;
      }

      const exportBtn = event.target.closest("#clientes-export-btn");
      if (exportBtn) {
        event.preventDefault();
        handleExportCsv();
        return;
      }

      const createBtn = event.target.closest("#clientes-create-btn");
      if (createBtn) {
        event.preventDefault();
        await handleCreateCliente();
        return;
      }

      const retryBtn = event.target.closest("#clientes-retry-btn");
      if (retryBtn) {
        event.preventDefault();
        await reload({ force: true, asRefresh: false });
        return;
      }

      const refreshBtn = event.target.closest("#clientes-refresh-btn");
      if (refreshBtn) {
        event.preventDefault();
        await reload({ force: true, asRefresh: true });
      }
    };

    container.addEventListener("click", onClick);

    return () => {
      container.removeEventListener("click", onClick);
    };
  }

  function bindModalBridgeEvents() {
    const onRefresh = async (event) => {
      const clientId =
        event?.detail?.clientId ||
        event?.clientId ||
        "";

      if (!clientId) {
        return;
      }

      await handleRefreshClienteFromModal(clientId);
    };

    const onCopy = async (event) => {
      const clientId =
        event?.detail?.clientId ||
        event?.clientId ||
        "";

      if (!clientId) {
        return;
      }

      await handleCopyClienteId(clientId);
    };

    const eventBus = AppCore?.events;

    if (!eventBus?.on) {
      return () => {};
    }

    try {
      eventBus.on("clientes:modal:refresh", onRefresh);
      eventBus.on("clientes:modal:copy", onCopy);
    } catch (error) {
      safeWarn("bind modal bridge error:", error);
    }

    return () => {
      try {
        eventBus?.off?.("clientes:modal:refresh", onRefresh);
      } catch {}

      try {
        eventBus?.off?.("clientes:modal:copy", onCopy);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    const container = getContainer();
    const cleanups = [];

    cleanups.push(bindNativeActions(container));
    cleanups.push(bindModalBridgeEvents());

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

    setState({
      openingClientId: "",
      creating: false,
      refreshing: false,
      loading: false,
    });

    safeLog("destroy");
  }

  /* =====================================================
     EXTRAS ÚTILES
  ===================================================== */

  function getCurrentItems() {
    return getItems();
  }

  function getCurrentPageItems() {
    const items = getItems();
    const pagination = getPaginationMeta(items);
    return pagination.items;
  }

  function getCurrentCliente(clientId = "") {
    const items = getItems();
    return findClienteById(items, clientId);
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    openCliente: handleOpenCliente,
    copyClienteId: handleCopyClienteId,
    exportCsv: handleExportCsv,
    createCliente: handleCreateCliente,

    goToPage,
    goPrevPage,
    goNextPage,

    getItems: getCurrentItems,
    getPageItems: getCurrentPageItems,
    getClienteById: getCurrentCliente,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default ClientesView;
