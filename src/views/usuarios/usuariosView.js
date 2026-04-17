/* =========================================================
   Onion SPA - Usuarios View
   Archivo: src/views/usuarios/usuariosView.js

   FINAL PRO SYSTEM · VIEW REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista usuarios
   - render principal de header + tabla
   - paginación fija a 5 usuarios por vista
   - carga inicial robusta
   - refresh con loader SOLO en tabla
   - apertura de usuario con estado visual de loading
   - bind de eventos de la pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar acciones sin mezclar responsabilidades

   HARDENING PRO:
   - render inicial inmediato
   - carga posterior segura
   - anti-race token
   - cleanup total
   - click delegation sólida
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
  sortUsuariosByCreatedDesc,
  paginateUsuarios,
  findUsuarioById,
} from "./usuarios.model.js";

import {
  openUsuarioAction,
  copyUsuarioIdAction,
  exportUsuariosCsvAction,
  createUsuarioAction,
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
     HELPERS
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
    Object.assign(usuariosState, patch);
    return usuariosState;
  }

  function ensureBaseState() {
    const pageSize = Math.max(
      1,
      Number(
        usuariosState?.pageSize ||
        DEFAULT_PAGE_SIZE ||
        5
      )
    );

    usuariosState.page = Math.max(
      1,
      Number(usuariosState?.page || 1)
    );

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

  function showToast(message = "", type = "info") {
    try {
      AppCore?.toast?.show?.(message, type);
      return;
    } catch {}

    try {
      console.log(`[Usuarios:${type}]`, message);
    } catch {}
  }

  function safeErrorMessage(error = null) {
    return String(
      error?.message ||
      error?.response?.message ||
      "No se pudo cargar la colección de usuarios."
    ).trim();
  }

  /* =====================================================
     DATA
  ===================================================== */

  function getItems() {
    try {
      const raw = getUsuarios();
      const normalized =
        normalizeUsuariosCollection(raw);

      return sortUsuariosByCreatedDesc(normalized);
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function clampPage(items = []) {
    const meta = paginateUsuarios(
      items,
      usuariosState.page,
      usuariosState.pageSize
    );

    usuariosState.page = meta.page;

    return meta;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function buildHtml() {
    const items = getItems();

    clampPage(items);

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
      safeWarn("No existe #view-container");
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
    if (destroyed) return null;

    const container = render();

    if (!destroyed) {
      bind();
    }

    return container;
  }

  /* =====================================================
     LOAD
  ===================================================== */

  async function loadData({
    force = false,
    asRefresh = false,
  } = {}) {
    const before = getItems();
    const hasData = before.length > 0;

    setState({
      loading: !hasData,
      refreshing: hasData && asRefresh,
      error: "",
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

      return getItems();
    } catch (error) {
      const message = safeErrorMessage(error);

      setState({
        loading: false,
        refreshing: false,
        error: message,
      });

      showToast(message, "error");

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

    render();

    await loadData({
      force,
      asRefresh,
    });

    if (!isActiveToken(token)) {
      return api;
    }

    render();

    return api;
  }

  /* =====================================================
     PAGE
  ===================================================== */

  function goToPage(page = 1) {
    const items = getItems();

    const meta = paginateUsuarios(
      items,
      page,
      usuariosState.pageSize
    );

    usuariosState.page = meta.page;

    rerender();

    return meta.page;
  }

  function goPrevPage() {
    return goToPage(
      Number(usuariosState.page || 1) - 1
    );
  }

  function goNextPage() {
    return goToPage(
      Number(usuariosState.page || 1) + 1
    );
  }

  /* =====================================================
     ACTIONS
  ===================================================== */

  async function handleOpenUser(userId = "") {
    const id = String(userId || "").trim();

    if (!id) return null;

    usuariosState.openingUserId = id;
    rerender();

    try {
      return await openUsuarioAction({
        userId: id,
        silent: false,
      });
    } catch (error) {
      showToast(
        "No se pudo abrir el usuario.",
        "error"
      );
      return null;
    } finally {
      usuariosState.openingUserId = "";

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleCopyId(userId = "") {
    return copyUsuarioIdAction({
      userId,
      silent: false,
    });
  }

  function handleExport() {
    return exportUsuariosCsvAction({
      silent: false,
    });
  }

  async function handleCreate() {
    if (usuariosState.creating) {
      return false;
    }

    usuariosState.creating = true;
    rerender();

    try {
      return await createUsuarioAction({
        silent: false,
      });
    } finally {
      usuariosState.creating = false;

      if (!destroyed) {
        rerender();
      }
    }
  }

  /* =====================================================
     EVENTS
  ===================================================== */

  function bindNative(container) {
    if (!container) return () => {};

    const onClick = async (event) => {
      const openBtn =
        event.target.closest(
          '[data-action="open-user"]'
        );

      if (openBtn) {
        event.preventDefault();

        await handleOpenUser(
          openBtn.dataset.userId
        );

        return;
      }

      const copyBtn =
        event.target.closest(
          '[data-action="copy-user-id"]'
        );

      if (copyBtn) {
        event.preventDefault();

        await handleCopyId(
          copyBtn.dataset.userId
        );

        return;
      }

      const prevBtn =
        event.target.closest(
          '[data-action="prev-page"]'
        );

      if (prevBtn) {
        event.preventDefault();
        goPrevPage();
        return;
      }

      const nextBtn =
        event.target.closest(
          '[data-action="next-page"]'
        );

      if (nextBtn) {
        event.preventDefault();
        goNextPage();
        return;
      }

      const exportBtn =
        event.target.closest(
          "#usuarios-export-btn"
        );

      if (exportBtn) {
        event.preventDefault();
        handleExport();
        return;
      }

      const createBtn =
        event.target.closest(
          "#usuarios-create-btn"
        );

      if (createBtn) {
        event.preventDefault();
        await handleCreate();
        return;
      }

      const retryBtn =
        event.target.closest(
          "#usuarios-retry-btn"
        );

      if (retryBtn) {
        event.preventDefault();
        await reload({
          force: true,
          asRefresh: false,
        });
      }
    };

    container.addEventListener(
      "click",
      onClick
    );

    return () => {
      container.removeEventListener(
        "click",
        onClick
      );
    };
  }

  function bind() {
    cleanupBindings();

    const container = getContainer();

    bindingsCleanup = bindNative(container);
  }

  /* =====================================================
     PUBLIC
  ===================================================== */

  async function reload(options = {}) {
    if (destroyed) return api;

    await renderAndLoad({
      force:
        options.force !== false,
      asRefresh:
        options.asRefresh !== false,
    });

    if (!destroyed) {
      bind();
    }

    return api;
  }

  async function init() {
    if (
      initialized &&
      inflightInit
    ) {
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

  function getCurrentItems() {
    return getItems();
  }

  function getCurrentPageItems() {
    const items = getItems();

    return paginateUsuarios(
      items,
      usuariosState.page,
      usuariosState.pageSize
    ).items;
  }

  function getCurrentUser(userId = "") {
    return findUsuarioById(
      getItems(),
      userId
    );
  }

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    openUser: handleOpenUser,
    copyUserId: handleCopyId,
    exportCsv: handleExport,
    createUsuario: handleCreate,

    goToPage,
    goPrevPage,
    goNextPage,

    getItems: getCurrentItems,
    getPageItems: getCurrentPageItems,
    getUserById: getCurrentUser,

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
