/* =========================================================
   Onion SPA - Incidencias View
   Archivo: src/views/incidencias/incidenciasView.js

   FINAL PRO SYSTEM · VIEW REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista incidencias
   - render principal de header + tabla
   - paginación fija a 5 incidencias por vista
   - carga inicial robusta
   - refresh con loader SOLO en tabla
   - apertura de ticket con estado visual de loading
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
  incidenciasState,
  setHydrated,
} from "./incidencias.state.js";

import {
  loadIncidencias,
  hydrateFromCache,
} from "./incidencias.api.js";

import {
  getIncidencias,
} from "./incidencias.store.js";

import {
  renderHeader,
  renderTable,
} from "./incidencias.table.template.js";

import {
  DEFAULT_PAGE_SIZE,
  normalizeIncidenciasCollection,
  sortIncidenciasByUpdatedDesc,
  paginateIncidencias,
  findIncidenciaById,
} from "./incidencias.model.js";

import {
  openTicketAction,
  copyTicketIdAction,
  exportIncidenciasCsvAction,
  createIncidenciaAction,
  refreshTicketDetailAction,
} from "./incidencias.actions.js";

export const IncidenciasView = (() => {
  "use strict";

  const SCOPE = "view:incidencias";

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
      AppCore?.utils?.log?.("[IncidenciasView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[IncidenciasView]", ...args);
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
      return incidenciasState;
    }

    Object.assign(incidenciasState, patch);

    return incidenciasState;
  }

  function ensureBaseState() {
    const pageSize = Math.max(
      1,
      Number(incidenciasState?.pageSize || DEFAULT_PAGE_SIZE)
    );

    if (!Number.isFinite(Number(incidenciasState?.page))) {
      incidenciasState.page = 1;
    }

    incidenciasState.page = Math.max(1, Number(incidenciasState.page || 1));
    incidenciasState.pageSize = pageSize;

    if (typeof incidenciasState.loading !== "boolean") {
      incidenciasState.loading = false;
    }

    if (typeof incidenciasState.refreshing !== "boolean") {
      incidenciasState.refreshing = false;
    }

    if (typeof incidenciasState.creating !== "boolean") {
      incidenciasState.creating = false;
    }

    incidenciasState.openingTicketId =
      typeof incidenciasState.openingTicketId === "string"
        ? incidenciasState.openingTicketId
        : "";

    incidenciasState.error =
      typeof incidenciasState.error === "string"
        ? incidenciasState.error
        : "";
  }

  function getRawItems() {
    try {
      return getIncidencias();
    } catch {
      return [];
    }
  }

  function getItems() {
    try {
      const raw = getRawItems();
      const normalized = normalizeIncidenciasCollection(raw);

      return sortIncidenciasByUpdatedDesc(normalized);
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function getPaginationMeta(items = []) {
    return paginateIncidencias(
      items,
      incidenciasState.page || 1,
      incidenciasState.pageSize || DEFAULT_PAGE_SIZE
    );
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (incidenciasState.page !== pagination.page) {
      incidenciasState.page = pagination.page;
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
      return "No se pudo cargar la colección de incidencias.";
    }

    const message =
      error?.message ||
      error?.response?.message ||
      error?.data?.message ||
      "No se pudo cargar la colección de incidencias.";

    return String(message).trim() || "No se pudo cargar la colección de incidencias.";
  }

  /* =====================================================
     MODAL BRIDGE
  ===================================================== */

  function openTicketModalBridge(detail = null) {
    if (!detail) {
      return false;
    }

    let handled = false;

    try {
      safeEmit("incidencias:modal:open", { detail });
      handled = true;
    } catch {}

    try {
      const globalHook =
        window?.OnionIncidenciasModal?.open ||
        window?.renderIncidenciaTicketModal ||
        window?.renderTicketModal;

      if (typeof globalHook === "function") {
        globalHook(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("modal bridge hook falló:", error);
    }

    if (!handled) {
      showToast(
        "Detalle cargado. Falta conectar incidencias.modal.js para abrir el popup.",
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
            state: incidenciasState,
          })}

          ${renderTable({
            items,
            state: incidenciasState,
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
      AppCore?.setDocumentTitle?.("Incidencias");
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
      await loadIncidencias({ force });

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

      safeWarn("loadIncidencias falló:", error);

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

    const pagination = paginateIncidencias(
      items,
      page,
      incidenciasState.pageSize || DEFAULT_PAGE_SIZE
    );

    setState({
      page: pagination.page,
    });

    rerender();

    return pagination.page;
  }

  function goPrevPage() {
    return goToPage((incidenciasState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((incidenciasState.page || 1) + 1);
  }

  /* =====================================================
     ACTION FLOWS
  ===================================================== */

  async function handleOpenTicket(ticketId = "") {
    const id = String(ticketId || "").trim();

    if (!id) {
      showToast("Ticket inválido.", "error");
      return null;
    }

    setState({
      openingTicketId: id,
    });

    rerender();

    try {
      const detail = await openTicketAction({
        ticketId: id,
        preferFresh: true,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo abrir la incidencia.", "error");
        return null;
      }

      openTicketModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleOpenTicket falló:", error);
      showToast("No se pudo abrir la incidencia.", "error");
      return null;
    } finally {
      setState({
        openingTicketId: "",
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleRefreshTicketFromModal(ticketId = "") {
    const id = String(ticketId || "").trim();

    if (!id) {
      return null;
    }

    try {
      const detail = await refreshTicketDetailAction({
        ticketId: id,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo refrescar el ticket.", "error");
        return null;
      }

      openTicketModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleRefreshTicketFromModal falló:", error);
      showToast("No se pudo refrescar el ticket.", "error");
      return null;
    }
  }

  async function handleCopyTicketId(ticketId = "") {
    const ok = await copyTicketIdAction({
      ticketId,
      silent: false,
    });

    return ok;
  }

  function handleExportCsv() {
    return exportIncidenciasCsvAction({
      silent: false,
    });
  }

  async function handleCreateIncidencia() {
    if (incidenciasState.creating) {
      return false;
    }

    setState({
      creating: true,
    });

    rerender();

    try {
      const ok = await createIncidenciaAction({
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
      const openBtn = event.target.closest('[data-action="open-ticket"]');
      if (openBtn) {
        event.preventDefault();

        const ticketId = String(openBtn.dataset.ticketId || "").trim();

        await handleOpenTicket(ticketId);
        return;
      }

      const copyBtn = event.target.closest('[data-action="copy-ticket-id"]');
      if (copyBtn) {
        event.preventDefault();

        const ticketId = String(
          copyBtn.dataset.ticketId || copyBtn.dataset.ticketCode || ""
        ).trim();

        if (!ticketId) {
          return;
        }

        await handleCopyTicketId(ticketId);
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

      const exportBtn = event.target.closest("#incidencias-export-btn");
      if (exportBtn) {
        event.preventDefault();
        handleExportCsv();
        return;
      }

      const createBtn = event.target.closest("#incidencias-create-btn");
      if (createBtn) {
        event.preventDefault();
        await handleCreateIncidencia();
        return;
      }

      const retryBtn = event.target.closest("#incidencias-retry-btn");
      if (retryBtn) {
        event.preventDefault();
        await reload({ force: true, asRefresh: false });
        return;
      }

      const refreshBtn = event.target.closest("#incidencias-refresh-btn");
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
      const ticketId =
        event?.detail?.ticketId ||
        event?.ticketId ||
        "";

      if (!ticketId) {
        return;
      }

      await handleRefreshTicketFromModal(ticketId);
    };

    const onCopy = async (event) => {
      const ticketId =
        event?.detail?.ticketId ||
        event?.ticketId ||
        "";

      if (!ticketId) {
        return;
      }

      await handleCopyTicketId(ticketId);
    };

    const eventBus = AppCore?.events;

    if (!eventBus?.on) {
      return () => {};
    }

    try {
      eventBus.on("incidencias:modal:refresh", onRefresh);
      eventBus.on("incidencias:modal:copy", onCopy);
    } catch (error) {
      safeWarn("bind modal bridge error:", error);
    }

    return () => {
      try {
        eventBus?.off?.("incidencias:modal:refresh", onRefresh);
      } catch {}

      try {
        eventBus?.off?.("incidencias:modal:copy", onCopy);
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
      openingTicketId: "",
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

  function getCurrentTicket(ticketId = "") {
    const items = getItems();
    return findIncidenciaById(items, ticketId);
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    openTicket: handleOpenTicket,
    copyTicketId: handleCopyTicketId,
    exportCsv: handleExportCsv,
    createIncidencia: handleCreateIncidencia,

    goToPage,
    goPrevPage,
    goNextPage,

    getItems: getCurrentItems,
    getPageItems: getCurrentPageItems,
    getTicketById: getCurrentTicket,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default IncidenciasView;
