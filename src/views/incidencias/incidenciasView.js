/* =========================================================
   Onion SPA - Incidencias View
   Archivo: src/views/incidencias/incidenciasView.js

   CLIENT EXPERIENCE MODE · VIEW REAL · HARDENED

   RESPONSABILIDADES:
   - punto de entrada real de la vista de incidencias
   - render principal de header + historial
   - paginación fija a 5 incidencias por vista
   - carga inicial robusta con fallback a cache
   - refresh con loader SOLO en la tabla
   - apertura de incidencia con estado visual de loading
   - apertura de modal de creación de incidencia
   - bind de eventos de pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar acciones y modales sin mezclar responsabilidades

   HARDENING PRO:
   - render inicial inmediato
   - carga posterior segura
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback elegante si los modales aún no existen
   - bloqueo de acciones antes de app ready
   - anti spam click en apertura rápida
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
  refreshTicketDetailAction,
} from "./incidencias.actions.js";

import IncidenciasCreateView from "./incidencias.create.modal.js";

export const IncidenciasView = (() => {
  "use strict";

  const SCOPE = "view:incidencias";

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let bindingsCleanup = null;
  let renderToken = 0;
  let pendingCreateRequest = false;
  let lastCreateClickAt = 0;

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

    incidenciasState.page = Math.max(
      1,
      Number(incidenciasState?.page || 1)
    );

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

    incidenciasState.lastSyncAt =
      typeof incidenciasState.lastSyncAt === "string"
        ? incidenciasState.lastSyncAt
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
      return sortIncidenciasByUpdatedDesc(
        normalizeIncidenciasCollection(getRawItems())
      );
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
      return "No se pudo cargar el historial de incidencias.";
    }

    return String(
      error?.message ||
      error?.response?.message ||
      error?.data?.message ||
      "No se pudo cargar el historial de incidencias."
    ).trim();
  }

  /* =====================================================
     APP READY HARDENING
  ===================================================== */

  function isDomReady() {
    return Boolean(
      typeof document !== "undefined" &&
      document.body &&
      document.readyState !== "loading"
    );
  }

  function isAppReady() {
    return Boolean(
      AppCore?.state?.ready ||
      AppCore?.state?.bootCompleted ||
      AppCore?.state?.appReady ||
      AppCore?.state?.authenticated !== undefined
    );
  }

  function canInteract() {
    return !destroyed && isDomReady() && isAppReady();
  }

  function throttleCreateClick() {
    const now = Date.now();

    if (now - lastCreateClickAt < 450) {
      return false;
    }

    lastCreateClickAt = now;
    return true;
  }

  /* =====================================================
     MODAL BRIDGES
  ===================================================== */

  function openTicketModalBridge(detail = null) {
    if (!detail) return false;

    let handled = false;

    try {
      safeEmit("incidencias:modal:open", { detail });
      handled = true;
    } catch {}

    try {
      const hook =
        window?.OnionIncidenciasModal?.open ||
        window?.renderIncidenciaTicketModal ||
        window?.renderTicketModal;

      if (typeof hook === "function") {
        hook(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("ticket modal bridge falló:", error);
    }

    return handled;
  }

  function openCreateModalBridge(draft = {}) {
    let handled = false;

    try {
      safeEmit("incidencias:create-modal:open", { draft });
      handled = true;
    } catch {}

    try {
      const hook =
        window?.OnionIncidenciasCreateModal?.open ||
        window?.renderIncidenciaCreateModal ||
        IncidenciasCreateView?.open;

      if (typeof hook === "function") {
        hook(draft);
        handled = true;
      }
    } catch (error) {
      safeWarn("create modal bridge falló:", error);
    }

    return handled;
  }

  function flushPendingCreate() {
    if (!pendingCreateRequest) return false;
    if (!canInteract()) return false;

    pendingCreateRequest = false;
    handleCreateIncidencia();

    return true;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function buildHtml() {
    const items = getItems();

    clampPageAgainstItems(items);

    return `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper" style="display:grid;gap:var(--space-lg);">
          ${renderHeader({ items, state: incidenciasState })}
          ${renderTable({ items, state: incidenciasState })}
        </div>
      </section>
    `;
  }

  function render() {
    const container = getContainer();

    if (!container) return null;

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Incidencias");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    container.innerHTML = buildHtml();

    try {
      setHydrated?.(true);
    } catch {}

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    const container = render();

    if (!destroyed) {
      bind();
    }

    return container;
  }

  /* =====================================================
     DATA
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

      return getItems();
    } catch (error) {
      const message = safeErrorMessage(error);

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
    } catch {}

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

    flushPendingCreate();

    return api;
  }

  /* =====================================================
     ACTIONS
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

  async function handleOpenTicket(ticketId = "") {
    const id = String(ticketId || "").trim();
    if (!id) return null;

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

      if (detail) {
        openTicketModalBridge(detail);
      }

      return detail;
    } catch {
      showToast("No se pudo abrir la incidencia.", "error");
      return null;
    } finally {
      setState({
        openingTicketId: "",
      });

      if (!destroyed) rerender();
    }
  }

  async function handleRefreshTicketFromModal(ticketId = "") {
    const id = String(ticketId || "").trim();
    if (!id) return null;

    try {
      const detail = await refreshTicketDetailAction({
        ticketId: id,
        silent: true,
      });

      if (detail) {
        openTicketModalBridge(detail);
      }

      return detail;
    } catch {
      showToast("No se pudo actualizar la incidencia.", "error");
      return null;
    }
  }

  async function handleCopyTicketId(ticketId = "") {
    return copyTicketIdAction({
      ticketId,
      silent: false,
    });
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

    if (!throttleCreateClick()) {
      return false;
    }

    if (!canInteract()) {
      pendingCreateRequest = true;
      showToast("La pantalla aún se está preparando.", "info");
      return false;
    }

    setState({
      creating: true,
    });

    rerender();

    try {
      const opened = openCreateModalBridge({});
      if (!opened) {
        showToast("No se pudo abrir el formulario.", "error");
      }
      return opened;
    } finally {
      setState({
        creating: false,
      });

      if (!destroyed) rerender();
    }
  }

  /* =====================================================
     BINDINGS
  ===================================================== */

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      const openBtn = event.target.closest('[data-action="open-ticket"]');
      if (openBtn) {
        event.preventDefault();
        await handleOpenTicket(openBtn.dataset.ticketId || "");
        return;
      }

      const copyBtn = event.target.closest('[data-action="copy-ticket-id"]');
      if (copyBtn) {
        event.preventDefault();
        await handleCopyTicketId(
          copyBtn.dataset.ticketId ||
          copyBtn.dataset.ticketCode ||
          ""
        );
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
    const bus = AppCore?.events;
    if (!bus?.on) {
      return () => {};
    }

    const onRefresh = async (event) => {
      await handleRefreshTicketFromModal(
        event?.detail?.ticketId ||
        event?.ticketId ||
        ""
      );
    };

    const onCopy = async (event) => {
      await handleCopyTicketId(
        event?.detail?.ticketId ||
        event?.ticketId ||
        ""
      );
    };

    const onCreated = async () => {
      await reload({
        force: true,
        asRefresh: true,
      });
    };

    try {
      bus.on("incidencias:modal:refresh", onRefresh);
      bus.on("incidencias:modal:copy", onCopy);
      bus.on("incidencias:create:success", onCreated);
      bus.on("app:ready", flushPendingCreate);
      bus.on("router:rendered", flushPendingCreate);
    } catch {}

    return () => {
      try { bus.off("incidencias:modal:refresh", onRefresh); } catch {}
      try { bus.off("incidencias:modal:copy", onCopy); } catch {}
      try { bus.off("incidencias:create:success", onCreated); } catch {}
      try { bus.off("app:ready", flushPendingCreate); } catch {}
      try { bus.off("router:rendered", flushPendingCreate); } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    const cleanups = [];
    cleanups.push(bindNativeActions(getContainer()));
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
     PUBLIC
  ===================================================== */

  async function reload(options = {}) {
    if (destroyed) return api;

    await renderAndLoad(options);

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

    pendingCreateRequest = false;

    safeLog("destroy");
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

    getItems: () => getItems(),
    getPageItems: () => getPaginationMeta(getItems()).items,
    getTicketById: (ticketId = "") =>
      findIncidenciaById(getItems(), ticketId),

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
