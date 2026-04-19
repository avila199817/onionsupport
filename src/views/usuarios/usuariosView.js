/* =========================================================
   Onion SPA - Usuarios View
   Archivo: src/views/usuarios/usuariosView.js

   FINAL PRO SYSTEM · VIEW REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista usuarios
   - render principal de header + tabla
   - paginación fija por vista
   - carga inicial robusta
   - refresh con loader SOLO en tabla
   - apertura de usuario con estado visual de loading
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
  usuariosState,
  setHydrated,
} from "./usuarios.state.js";

import {
  loadUsuarios,
  hydrateFromCache,
} from "./usuarios.api.js";

import {
  getUsuarios,
} from "./usuarios.store.js";

import {
  renderHeader,
  renderTable,
} from "./usuarios.table.template.js";

import {
  DEFAULT_PAGE_SIZE,
  normalizeUsuariosCollection,
  sortUsuariosByUpdatedDesc,
  paginateUsuarios,
  findUsuarioById,
} from "./usuarios.model.js";

import {
  openUsuarioAction,
  copyUsuarioIdAction,
  exportUsuariosCsvAction,
  createUsuarioAction,
  refreshUsuarioDetailAction,
} from "./usuarios.actions.js";

export const UsuariosView = (() => {
  "use strict";

  const SCOPE = "view:usuarios";

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
      AppCore?.utils?.log?.("[UsuariosView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[UsuariosView]", ...args);
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
      return usuariosState;
    }

    Object.assign(usuariosState, patch);

    return usuariosState;
  }

  function ensureBaseState() {
    const pageSize = Math.max(
      1,
      Number(usuariosState?.pageSize || DEFAULT_PAGE_SIZE)
    );

    if (!Number.isFinite(Number(usuariosState?.page))) {
      usuariosState.page = 1;
    }

    usuariosState.page = Math.max(1, Number(usuariosState.page || 1));
    usuariosState.pageSize = pageSize;

    if (typeof usuariosState.loading !== "boolean") {
      usuariosState.loading = false;
    }

    if (typeof usuariosState.refreshing !== "boolean") {
      usuariosState.refreshing = false;
    }

    if (typeof usuariosState.creating !== "boolean") {
      usuariosState.creating = false;
    }

    usuariosState.openingUserId =
      typeof usuariosState.openingUserId === "string"
        ? usuariosState.openingUserId
        : "";

    usuariosState.error =
      typeof usuariosState.error === "string"
        ? usuariosState.error
        : "";
  }

  function getRawItems() {
    try {
      return getUsuarios();
    } catch {
      return [];
    }
  }

  function getItems() {
    try {
      const raw = getRawItems();
      const normalized = normalizeUsuariosCollection(raw);

      return sortUsuariosByUpdatedDesc(normalized);
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function getPaginationMeta(items = []) {
    return paginateUsuarios(
      items,
      usuariosState.page || 1,
      usuariosState.pageSize || DEFAULT_PAGE_SIZE
    );
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (usuariosState.page !== pagination.page) {
      usuariosState.page = pagination.page;
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
      return "No se pudo cargar la colección de usuarios.";
    }

    const message =
      error?.message ||
      error?.response?.message ||
      error?.data?.message ||
      "No se pudo cargar la colección de usuarios.";

    return String(message).trim() || "No se pudo cargar la colección de usuarios.";
  }

  /* =====================================================
     MODAL BRIDGE
  ===================================================== */

  function openUsuarioModalBridge(detail = null) {
    if (!detail) {
      return false;
    }

    let handled = false;

    try {
      safeEmit("usuarios:modal:open", { detail });
      handled = true;
    } catch {}

    try {
      const globalHook =
        window?.OnionUsuariosModal?.open ||
        window?.renderUsuarioDetailModal ||
        window?.renderUsuarioModal;

      if (typeof globalHook === "function") {
        globalHook(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("modal bridge hook falló:", error);
    }

    if (!handled) {
      showToast(
        "Detalle cargado. Falta conectar usuarios.modal.js para abrir el popup.",
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
            state: usuariosState,
          })}

          ${renderTable({
            items,
            state: usuariosState,
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
      AppCore?.setDocumentTitle?.("Usuarios");
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
      await loadUsuarios({ force });

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

      safeWarn("loadUsuarios falló:", error);

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

    const pagination = paginateUsuarios(
      items,
      page,
      usuariosState.pageSize || DEFAULT_PAGE_SIZE
    );

    setState({
      page: pagination.page,
    });

    rerender();

    return pagination.page;
  }

  function goPrevPage() {
    return goToPage((usuariosState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((usuariosState.page || 1) + 1);
  }

  /* =====================================================
     ACTION FLOWS
  ===================================================== */

  async function handleOpenUsuario(userId = "") {
    const id = String(userId || "").trim();

    if (!id) {
      showToast("Usuario inválido.", "error");
      return null;
    }

    setState({
      openingUserId: id,
    });

    rerender();

    try {
      const detail = await openUsuarioAction({
        userId: id,
        preferFresh: true,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo abrir el usuario.", "error");
        return null;
      }

      openUsuarioModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleOpenUsuario falló:", error);
      showToast("No se pudo abrir el usuario.", "error");
      return null;
    } finally {
      setState({
        openingUserId: "",
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleRefreshUsuarioFromModal(userId = "") {
    const id = String(userId || "").trim();

    if (!id) {
      return null;
    }

    try {
      const detail = await refreshUsuarioDetailAction({
        userId: id,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo refrescar el usuario.", "error");
        return null;
      }

      openUsuarioModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleRefreshUsuarioFromModal falló:", error);
      showToast("No se pudo refrescar el usuario.", "error");
      return null;
    }
  }

  async function handleCopyUsuarioId(userId = "") {
    const ok = await copyUsuarioIdAction({
      userId,
      silent: false,
    });

    return ok;
  }

  function handleExportCsv() {
    return exportUsuariosCsvAction({
      silent: false,
    });
  }

  async function handleCreateUsuario() {
    if (usuariosState.creating) {
      return false;
    }

    setState({
      creating: true,
    });

    rerender();

    try {
      const ok = await createUsuarioAction({
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
      const openBtn = event.target.closest('[data-action="open-user"]');
      if (openBtn) {
        event.preventDefault();

        const userId = String(
          openBtn.dataset.userId ||
          openBtn.dataset.usuarioId ||
          ""
        ).trim();

        await handleOpenUsuario(userId);
        return;
      }

      const copyBtn = event.target.closest('[data-action="copy-user-id"]');
      if (copyBtn) {
        event.preventDefault();

        const userId = String(
          copyBtn.dataset.userId ||
          copyBtn.dataset.username ||
          ""
        ).trim();

        if (!userId) {
          return;
        }

        await handleCopyUsuarioId(userId);
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

      const exportBtn = event.target.closest("#usuarios-export-btn");
      if (exportBtn) {
        event.preventDefault();
        handleExportCsv();
        return;
      }

      const createBtn = event.target.closest("#usuarios-create-btn");
      if (createBtn) {
        event.preventDefault();
        await handleCreateUsuario();
        return;
      }

      const retryBtn = event.target.closest("#usuarios-retry-btn");
      if (retryBtn) {
        event.preventDefault();
        await reload({ force: true, asRefresh: false });
        return;
      }

      const refreshBtn = event.target.closest("#usuarios-refresh-btn");
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
      const userId =
        event?.detail?.userId ||
        event?.userId ||
        "";

      if (!userId) {
        return;
      }

      await handleRefreshUsuarioFromModal(userId);
    };

    const onCopy = async (event) => {
      const userId =
        event?.detail?.userId ||
        event?.userId ||
        "";

      if (!userId) {
        return;
      }

      await handleCopyUsuarioId(userId);
    };

    const eventBus = AppCore?.events;

    if (!eventBus?.on) {
      return () => {};
    }

    try {
      eventBus.on("usuarios:modal:refresh", onRefresh);
      eventBus.on("usuarios:modal:copy", onCopy);
    } catch (error) {
      safeWarn("bind modal bridge error:", error);
    }

    return () => {
      try {
        eventBus?.off?.("usuarios:modal:refresh", onRefresh);
      } catch {}

      try {
        eventBus?.off?.("usuarios:modal:copy", onCopy);
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
      openingUserId: "",
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

  function getCurrentUsuario(userId = "") {
    const items = getItems();
    return findUsuarioById(items, userId);
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    openUsuario: handleOpenUsuario,
    copyUsuarioId: handleCopyUsuarioId,
    exportCsv: handleExportCsv,
    createUsuario: handleCreateUsuario,

    goToPage,
    goPrevPage,
    goNextPage,

    getItems: getCurrentItems,
    getPageItems: getCurrentPageItems,
    getUsuarioById: getCurrentUsuario,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default UsuariosView;
