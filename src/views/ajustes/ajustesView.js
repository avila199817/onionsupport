/* =========================================================
   Onion SPA - Ajustes View
   Archivo: src/views/ajustes/ajustesView.js

   FINAL PRO SYSTEM · VIEW REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista ajustes
   - render principal de header + cards simples
   - paginación fija por vista
   - carga inicial robusta
   - refresh con loader simple
   - apertura de ajuste con estado visual de loading
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
  ajustesState,
  setHydrated,
} from "./ajustes.state.js";

import {
  loadAjustes,
  hydrateFromCache,
} from "./ajustes.api.js";

import {
  getAjustes,
} from "./ajustes.store.js";

import {
  renderHeader,
  renderTable,
} from "./ajustes.table.template.js";

import {
  DEFAULT_PAGE_SIZE,
  normalizeAjustesCollection,
  sortAjustesByUpdatedDesc,
  paginateAjustes,
  findAjusteById,
  findAjusteByKey,
} from "./ajustes.model.js";

import {
  openAjusteAction,
  copyAjusteIdAction,
  copyAjusteKeyAction,
  exportAjustesCsvAction,
  createAjusteAction,
  refreshAjusteDetailAction,
} from "./ajustes.actions.js";

export const AjustesView = (() => {
  "use strict";

  const SCOPE = "view:ajustes";

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
      AppCore?.utils?.log?.("[AjustesView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[AjustesView]", ...args);
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
      return ajustesState;
    }

    Object.assign(ajustesState, patch);

    return ajustesState;
  }

  function ensureBaseState() {
    const pageSize = Math.max(
      1,
      Number(ajustesState?.pageSize || DEFAULT_PAGE_SIZE)
    );

    if (!Number.isFinite(Number(ajustesState?.page))) {
      ajustesState.page = 1;
    }

    ajustesState.page = Math.max(1, Number(ajustesState.page || 1));
    ajustesState.pageSize = pageSize;

    if (typeof ajustesState.loading !== "boolean") {
      ajustesState.loading = false;
    }

    if (typeof ajustesState.refreshing !== "boolean") {
      ajustesState.refreshing = false;
    }

    if (typeof ajustesState.saving !== "boolean") {
      ajustesState.saving = false;
    }

    ajustesState.openingSettingId =
      typeof ajustesState.openingSettingId === "string"
        ? ajustesState.openingSettingId
        : "";

    ajustesState.error =
      typeof ajustesState.error === "string"
        ? ajustesState.error
        : "";
  }

  function getRawItems() {
    try {
      return getAjustes();
    } catch {
      return [];
    }
  }

  function getItems() {
    try {
      const raw = getRawItems();
      const normalized = normalizeAjustesCollection(raw);

      return sortAjustesByUpdatedDesc(normalized);
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function getPaginationMeta(items = []) {
    return paginateAjustes(
      items,
      ajustesState.page || 1,
      ajustesState.pageSize || DEFAULT_PAGE_SIZE
    );
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (ajustesState.page !== pagination.page) {
      ajustesState.page = pagination.page;
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
      return "No se pudo cargar la colección de ajustes.";
    }

    const message =
      error?.message ||
      error?.response?.message ||
      error?.data?.message ||
      "No se pudo cargar la colección de ajustes.";

    return String(message).trim() || "No se pudo cargar la colección de ajustes.";
  }

  /* =====================================================
     MODAL BRIDGE
  ===================================================== */

  function openAjusteModalBridge(detail = null) {
    if (!detail) {
      return false;
    }

    let handled = false;

    try {
      safeEmit("ajustes:modal:open", { detail });
      handled = true;
    } catch {}

    try {
      const globalHook =
        window?.OnionAjustesModal?.open ||
        window?.renderAjusteModal;

      if (typeof globalHook === "function") {
        globalHook(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("modal bridge hook falló:", error);
    }

    if (!handled) {
      showToast(
        "Detalle cargado. Falta conectar ajustes.modal.js para abrir el popup.",
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
            state: ajustesState,
          })}

          ${renderTable({
            items,
            state: ajustesState,
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
      AppCore?.setDocumentTitle?.("Ajustes");
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
      await loadAjustes({ force });

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

      safeWarn("loadAjustes falló:", error);

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

    const pagination = paginateAjustes(
      items,
      page,
      ajustesState.pageSize || DEFAULT_PAGE_SIZE
    );

    setState({
      page: pagination.page,
    });

    rerender();

    return pagination.page;
  }

  function goPrevPage() {
    return goToPage((ajustesState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((ajustesState.page || 1) + 1);
  }

  /* =====================================================
     ACTION FLOWS
  ===================================================== */

  async function handleOpenAjuste(settingId = "") {
    const id = String(settingId || "").trim();

    if (!id) {
      showToast("Ajuste inválido.", "error");
      return null;
    }

    setState({
      openingSettingId: id,
    });

    rerender();

    try {
      const detail = await openAjusteAction({
        settingId: id,
        preferFresh: true,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo abrir el ajuste.", "error");
        return null;
      }

      openAjusteModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleOpenAjuste falló:", error);
      showToast("No se pudo abrir el ajuste.", "error");
      return null;
    } finally {
      setState({
        openingSettingId: "",
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleRefreshAjusteFromModal(settingId = "") {
    const id = String(settingId || "").trim();

    if (!id) {
      return null;
    }

    try {
      const detail = await refreshAjusteDetailAction({
        settingId: id,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo refrescar el ajuste.", "error");
        return null;
      }

      openAjusteModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleRefreshAjusteFromModal falló:", error);
      showToast("No se pudo refrescar el ajuste.", "error");
      return null;
    }
  }

  async function handleCopyAjusteId(settingId = "") {
    const ok = await copyAjusteIdAction({
      settingId,
      silent: false,
    });

    return ok;
  }

  async function handleCopyAjusteKey(key = "") {
    const ok = await copyAjusteKeyAction({
      item: {
        key,
      },
      silent: false,
    });

    return ok;
  }

  function handleExportCsv() {
    return exportAjustesCsvAction({
      silent: false,
    });
  }

  async function handleCreateAjuste() {
    if (ajustesState.saving) {
      return false;
    }

    setState({
      saving: true,
    });

    rerender();

    try {
      const ok = await createAjusteAction({
        silent: false,
      });

      return ok;
    } finally {
      setState({
        saving: false,
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
      const openBtn = event.target.closest('[data-action="open-ajuste"]');
      if (openBtn) {
        event.preventDefault();

        const settingId = String(
          openBtn.dataset.settingId ||
          openBtn.dataset.ajusteId ||
          openBtn.dataset.id ||
          ""
        ).trim();

        await handleOpenAjuste(settingId);
        return;
      }

      const copyIdBtn = event.target.closest('[data-action="copy-ajuste-id"]');
      if (copyIdBtn) {
        event.preventDefault();

        const settingId = String(
          copyIdBtn.dataset.settingId ||
          copyIdBtn.dataset.ajusteId ||
          copyIdBtn.dataset.id ||
          ""
        ).trim();

        if (!settingId) {
          return;
        }

        await handleCopyAjusteId(settingId);
        return;
      }

      const copyKeyBtn = event.target.closest('[data-action="copy-ajuste-key"]');
      if (copyKeyBtn) {
        event.preventDefault();

        const key = String(
          copyKeyBtn.dataset.key ||
          copyKeyBtn.dataset.settingKey ||
          ""
        ).trim();

        if (!key) {
          return;
        }

        await handleCopyAjusteKey(key);
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

      const exportBtn = event.target.closest("#ajustes-export-btn");
      if (exportBtn) {
        event.preventDefault();
        handleExportCsv();
        return;
      }

      const createBtn = event.target.closest("#ajustes-create-btn");
      if (createBtn) {
        event.preventDefault();
        await handleCreateAjuste();
        return;
      }

      const retryBtn = event.target.closest("#ajustes-retry-btn");
      if (retryBtn) {
        event.preventDefault();
        await reload({ force: true, asRefresh: false });
        return;
      }

      const refreshBtn = event.target.closest("#ajustes-refresh-btn");
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
      const settingId =
        event?.detail?.settingId ||
        event?.settingId ||
        "";

      if (!settingId) {
        return;
      }

      await handleRefreshAjusteFromModal(settingId);
    };

    const onCopyId = async (event) => {
      const settingId =
        event?.detail?.settingId ||
        event?.settingId ||
        "";

      if (!settingId) {
        return;
      }

      await handleCopyAjusteId(settingId);
    };

    const onCopyKey = async (event) => {
      const key =
        event?.detail?.key ||
        event?.key ||
        "";

      if (!key) {
        return;
      }

      await handleCopyAjusteKey(key);
    };

    const eventBus = AppCore?.events;

    if (!eventBus?.on) {
      return () => {};
    }

    try {
      eventBus.on("ajustes:modal:refresh", onRefresh);
      eventBus.on("ajustes:modal:copy-id", onCopyId);
      eventBus.on("ajustes:modal:copy-key", onCopyKey);
    } catch (error) {
      safeWarn("bind modal bridge error:", error);
    }

    return () => {
      try {
        eventBus?.off?.("ajustes:modal:refresh", onRefresh);
      } catch {}

      try {
        eventBus?.off?.("ajustes:modal:copy-id", onCopyId);
      } catch {}

      try {
        eventBus?.off?.("ajustes:modal:copy-key", onCopyKey);
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
      openingSettingId: "",
      saving: false,
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

  function getCurrentAjuste(settingId = "") {
    const items = getItems();
    return findAjusteById(items, settingId);
  }

  function getCurrentAjusteByKey(key = "") {
    const items = getItems();
    return findAjusteByKey(items, key);
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    openAjuste: handleOpenAjuste,
    copyAjusteId: handleCopyAjusteId,
    copyAjusteKey: handleCopyAjusteKey,
    exportCsv: handleExportCsv,
    createAjuste: handleCreateAjuste,

    goToPage,
    goPrevPage,
    goNextPage,

    getItems: getCurrentItems,
    getPageItems: getCurrentPageItems,
    getAjusteById: getCurrentAjuste,
    getAjusteByKey: getCurrentAjusteByKey,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default AjustesView;
