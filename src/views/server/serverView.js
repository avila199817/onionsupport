/* =========================================================
   Onion SPA - Server View
   Archivo: src/views/server/serverView.js

   FINAL PRO SYSTEM · VIEW REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista server
   - render principal de header + dashboard técnico
   - paginación fija de servicios por vista
   - carga inicial robusta
   - refresh con loader SOLO en dashboard principal
   - apertura de detalle técnico con estado visual de loading
   - bind de eventos de la pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar actions y modal sin mezclar responsabilidades

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
  serverState,
  setHydrated,
} from "./server.state.js";

import {
  loadServerSnapshot,
  loadServerHealth,
  hydrateServerFromCache,
  setServerAutoRefresh,
} from "./server.api.js";

import {
  getServerSnapshotStore,
  getServerServices,
  getServerServiceByIdStore,
} from "./server.store.js";

import {
  renderHeader,
  renderDashboard,
} from "./server.template.js";

import {
  DEFAULT_PAGE_SIZE,
  normalizeServerSnapshotModel,
  normalizeServerServiceModel,
  sortServerServicesByLatencyDesc,
  paginateServerServices,
  findServerServiceById,
} from "./server.model.js";

import {
  openServerDetailAction,
  copyServerDetailIdAction,
  navigateFromServerAction,
  runServerQuickAction,
  refreshServerSnapshotAction,
  startServerLiveAction,
  stopServerLiveAction,
} from "./server.actions.js";

export const ServerView = (() => {
  "use strict";

  const SCOPE = "view:server";
  const LIVE_KEY = "server:view";

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
      AppCore?.utils?.log?.("[ServerView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[ServerView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    try {
      AppCore?.events?.emit?.(event, payload);
    } catch {}
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
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
      return serverState;
    }

    Object.assign(serverState, patch);

    return serverState;
  }

  function ensureBaseState() {
    const pageSize = Math.max(
      1,
      Number(serverState?.pageSize || DEFAULT_PAGE_SIZE)
    );

    if (!Number.isFinite(Number(serverState?.page))) {
      serverState.page = 1;
    }

    serverState.page = Math.max(1, Number(serverState.page || 1));
    serverState.pageSize = pageSize;

    if (typeof serverState.loading !== "boolean") {
      serverState.loading = false;
    }

    if (typeof serverState.refreshing !== "boolean") {
      serverState.refreshing = false;
    }

    if (typeof serverState.autoRefresh !== "boolean") {
      serverState.autoRefresh = true;
    }

    serverState.openingDetailId =
      typeof serverState.openingDetailId === "string"
        ? serverState.openingDetailId
        : "";

    serverState.selectedDetailId =
      typeof serverState.selectedDetailId === "string"
        ? serverState.selectedDetailId
        : "";

    serverState.error =
      typeof serverState.error === "string"
        ? serverState.error
        : "";
  }

  function getRawSnapshot() {
    try {
      return getServerSnapshotStore();
    } catch {
      return {};
    }
  }

  function getSnapshot() {
    try {
      const raw = getRawSnapshot();
      return normalizeServerSnapshotModel(raw);
    } catch (error) {
      safeWarn("getSnapshot falló:", error);
      return normalizeServerSnapshotModel({});
    }
  }

  function getServices() {
    try {
      const snapshot = getSnapshot();
      const raw =
        getServerServices?.() ||
        safeObject(snapshot).services ||
        [];

      return sortServerServicesByLatencyDesc(
        raw.map((item) => normalizeServerServiceModel(item))
      );
    } catch (error) {
      safeWarn("getServices falló:", error);
      return [];
    }
  }

  function getPaginationMeta(items = []) {
    return paginateServerServices(
      items,
      serverState.page || 1,
      serverState.pageSize || DEFAULT_PAGE_SIZE
    );
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (serverState.page !== pagination.page) {
      serverState.page = pagination.page;
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
      return "No se pudo cargar el panel Server.";
    }

    const message =
      error?.message ||
      error?.response?.message ||
      error?.response?.data?.message ||
      error?.data?.message ||
      "No se pudo cargar el panel Server.";

    return String(message).trim() || "No se pudo cargar el panel Server.";
  }

  /* =====================================================
     MODAL BRIDGE
  ===================================================== */

  function openServerModalBridge(detail = null) {
    if (!detail) {
      return false;
    }

    let handled = false;

    try {
      safeEmit("server:modal:open", { detail });
      handled = true;
    } catch {}

    try {
      const globalHook =
        window?.OnionServerModal?.open ||
        window?.renderServerDetailModal ||
        window?.renderServerModal;

      if (typeof globalHook === "function") {
        globalHook(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("modal bridge hook falló:", error);
    }

    if (!handled) {
      showToast(
        "Detalle técnico cargado. Falta conectar server.modal.js para abrir el popup.",
        "info"
      );
    }

    return handled;
  }

  /* =====================================================
     LIVE REFRESH
  ===================================================== */

  async function onLiveTick() {
    if (destroyed) {
      return;
    }

    if (serverState.loading || serverState.refreshing) {
      return;
    }

    await reload({
      force: true,
      asRefresh: true,
      silent: true,
      keepLiveState: true,
    });
  }

  function ensureLiveRefresh() {
    try {
      stopServerLiveAction?.({
        key: LIVE_KEY,
      });
    } catch {}

    if (!serverState.autoRefresh || destroyed) {
      return false;
    }

    try {
      return Boolean(
        startServerLiveAction?.({
          key: LIVE_KEY,
          onTick: onLiveTick,
        })
      );
    } catch (error) {
      safeWarn("ensureLiveRefresh falló:", error);
      return false;
    }
  }

  function stopLiveRefresh() {
    try {
      stopServerLiveAction?.({
        key: LIVE_KEY,
      });
    } catch {}
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function buildHtml() {
    const snapshot = getSnapshot();
    const services = getServices();

    clampPageAgainstItems(services);

    return `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader({
            snapshot,
            state: serverState,
          })}

          ${renderDashboard({
            snapshot,
            state: serverState,
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
      AppCore?.setDocumentTitle?.("Servidor");
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
    const servicesBefore = getServices();
    const hasVisibleData = servicesBefore.length > 0;

    setState({
      error: "",
      loading: !hasVisibleData && !silent,
      refreshing: hasVisibleData && asRefresh,
    });

    render();

    try {
      await loadServerSnapshot({
        force,
      });

      try {
        await loadServerHealth?.({
          silent: true,
        });
      } catch {}

      setState({
        loading: false,
        refreshing: false,
        error: "",
        lastSyncAt: new Date().toISOString(),
      });

      const servicesAfter = getServices();

      clampPageAgainstItems(servicesAfter);

      return getSnapshot();
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadServerSnapshot falló:", error);

      setState({
        loading: false,
        refreshing: false,
        error: message,
      });

      if (!silent) {
        showToast(message, "error");
      }

      return getSnapshot();
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
    silent = false,
  } = {}) {
    const token = nextRenderToken();

    try {
      hydrateServerFromCache?.();
    } catch (error) {
      safeWarn("hydrateServerFromCache falló:", error);
    }

    ensureBaseState();
    render();

    await loadData({
      force,
      silent,
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
    const items = getServices();

    const pagination = paginateServerServices(
      items,
      page,
      serverState.pageSize || DEFAULT_PAGE_SIZE
    );

    setState({
      page: pagination.page,
    });

    rerender();

    return pagination.page;
  }

  function goPrevPage() {
    return goToPage((serverState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((serverState.page || 1) + 1);
  }

  /* =====================================================
     ACTION FLOWS
  ===================================================== */

  async function handleOpenDetail(detailId = "") {
    const id = String(detailId || "").trim();

    if (!id) {
      showToast("Detalle inválido.", "error");
      return null;
    }

    setState({
      openingDetailId: id,
      selectedDetailId: id,
    });

    rerender();

    try {
      const detail = await openServerDetailAction({
        detailId: id,
        preferFresh: false,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo abrir el detalle técnico.", "error");
        return null;
      }

      openServerModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleOpenDetail falló:", error);
      showToast("No se pudo abrir el detalle técnico.", "error");
      return null;
    } finally {
      setState({
        openingDetailId: "",
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleRefreshDetailFromModal(detailId = "") {
    const id = String(detailId || "").trim();

    if (!id) {
      return null;
    }

    try {
      await refreshServerSnapshotAction?.({
        silent: true,
      });

      const detail =
        getServerServiceByIdStore?.(id) ||
        findServerServiceById(getServices(), id) ||
        null;

      if (!detail) {
        showToast("No se pudo refrescar el detalle técnico.", "error");
        return null;
      }

      openServerModalBridge(detail);

      if (!destroyed) {
        rerender();
      }

      return detail;
    } catch (error) {
      safeWarn("handleRefreshDetailFromModal falló:", error);
      showToast("No se pudo refrescar el detalle técnico.", "error");
      return null;
    }
  }

  async function handleCopyDetailId(detailId = "") {
    const ok = await copyServerDetailIdAction?.({
      detailId,
      silent: false,
    });

    return ok;
  }

  async function handleRefreshHealth() {
    try {
      await loadServerHealth?.({
        silent: false,
      });

      if (!destroyed) {
        rerender();
      }

      return true;
    } catch (error) {
      safeWarn("handleRefreshHealth falló:", error);
      showToast("No se pudo refrescar el health.", "error");
      return false;
    }
  }

  async function handleNavigate(route = "") {
    const target = String(route || "").trim();

    if (!target) {
      return false;
    }

    try {
      return await navigateFromServerAction?.({
        route: target,
        silent: false,
      });
    } catch (error) {
      safeWarn("handleNavigate falló:", error);
      showToast("No se pudo navegar desde Server.", "error");
      return false;
    }
  }

  async function handleQuickAction({
    action = "",
    route = "",
    payload = {},
  } = {}) {
    try {
      return await runServerQuickAction?.({
        action,
        route,
        payload,
        silent: false,
      });
    } catch (error) {
      safeWarn("handleQuickAction falló:", error);
      showToast("No se pudo ejecutar la acción rápida.", "error");
      return false;
    }
  }

  async function handleToggleLive() {
    const next = !Boolean(serverState.autoRefresh);

    setServerAutoRefresh?.(next);
    setState({
      autoRefresh: next,
    });

    if (next) {
      ensureLiveRefresh();
      showToast("Tiempo real activado.", "success");
    } else {
      stopLiveRefresh();
      showToast("Tiempo real pausado.", "info");
    }

    rerender();

    return next;
  }

  /* =====================================================
     CLICK DELEGATION
  ===================================================== */

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      const openBtn = event.target.closest(
        '[data-action="open-server-detail"]'
      );

      if (openBtn) {
        event.preventDefault();

        const detailId = String(
          openBtn.dataset.detailId ||
            openBtn.dataset.serviceId ||
            ""
        ).trim();

        await handleOpenDetail(detailId);
        return;
      }

      const copyBtn = event.target.closest(
        '[data-action="copy-server-detail-id"]'
      );

      if (copyBtn) {
        event.preventDefault();

        const detailId = String(
          copyBtn.dataset.detailId ||
            copyBtn.dataset.serviceId ||
            ""
        ).trim();

        if (!detailId) {
          return;
        }

        await handleCopyDetailId(detailId);
        return;
      }

      const quickBtn = event.target.closest(
        '[data-action="run-server-quick-action"]'
      );

      if (quickBtn) {
        event.preventDefault();

        const action = String(
          quickBtn.dataset.serverAction ||
            quickBtn.dataset.actionName ||
            ""
        ).trim();

        const route = String(
          quickBtn.dataset.route ||
            quickBtn.dataset.href ||
            ""
        ).trim();

        let payload = {};

        try {
          payload = quickBtn.dataset.payload
            ? JSON.parse(quickBtn.dataset.payload)
            : {};
        } catch {}

        await handleQuickAction({
          action,
          route,
          payload,
        });

        return;
      }

      const navBtn = event.target.closest(
        '[data-action="navigate-server"]'
      );

      if (navBtn) {
        event.preventDefault();

        const route = String(
          navBtn.dataset.route ||
            navBtn.dataset.href ||
            ""
        ).trim();

        await handleNavigate(route);
        return;
      }

      const healthBtn = event.target.closest(
        "#server-health-btn, [data-action='load-server-health']"
      );

      if (healthBtn) {
        event.preventDefault();
        await handleRefreshHealth();
        return;
      }

      const liveBtn = event.target.closest(
        "#server-toggle-live-btn, [data-action='toggle-server-live']"
      );

      if (liveBtn) {
        event.preventDefault();
        await handleToggleLive();
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

      const retryBtn = event.target.closest("#server-retry-btn");
      if (retryBtn) {
        event.preventDefault();
        await reload({ force: true, asRefresh: false });
        return;
      }

      const refreshBtn = event.target.closest(
        "#server-refresh-btn, [data-action='refresh-server']"
      );
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
      const detailId =
        event?.detail?.detailId ||
        event?.detail?.serviceId ||
        event?.detailId ||
        event?.serviceId ||
        "";

      if (!detailId) {
        return;
      }

      await handleRefreshDetailFromModal(detailId);
    };

    const onCopy = async (event) => {
      const detailId =
        event?.detail?.detailId ||
        event?.detail?.serviceId ||
        event?.detailId ||
        event?.serviceId ||
        "";

      if (!detailId) {
        return;
      }

      await handleCopyDetailId(detailId);
    };

    const onNavigate = async (event) => {
      const route =
        event?.detail?.route ||
        event?.route ||
        "";

      if (!route) {
        return;
      }

      await handleNavigate(route);
    };

    const eventBus = AppCore?.events;

    if (!eventBus?.on) {
      return () => {};
    }

    try {
      eventBus.on("server:modal:refresh", onRefresh);
      eventBus.on("server:modal:copy", onCopy);
      eventBus.on("server:modal:navigate", onNavigate);
    } catch (error) {
      safeWarn("bind modal bridge error:", error);
    }

    return () => {
      try {
        eventBus?.off?.("server:modal:refresh", onRefresh);
      } catch {}

      try {
        eventBus?.off?.("server:modal:copy", onCopy);
      } catch {}

      try {
        eventBus?.off?.("server:modal:navigate", onNavigate);
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
      silent = false,
      keepLiveState = true,
    } = options || {};

    try {
      await renderAndLoad({
        force,
        asRefresh,
        silent,
      });
    } catch (error) {
      safeWarn("reload falló:", error);
    }

    if (!destroyed) {
      bind();

      if (keepLiveState && serverState.autoRefresh) {
        ensureLiveRefresh();
      }
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
        silent: false,
      });

      if (!destroyed) {
        bind();
        if (serverState.autoRefresh) {
          ensureLiveRefresh();
        }
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
    stopLiveRefresh();

    setState({
      openingDetailId: "",
      selectedDetailId: "",
      refreshing: false,
      loading: false,
    });

    safeLog("destroy");
  }

  /* =====================================================
     EXTRAS ÚTILES
  ===================================================== */

  function getCurrentSnapshot() {
    return getSnapshot();
  }

  function getCurrentServices() {
    return getServices();
  }

  function getCurrentPageServices() {
    const items = getServices();
    const pagination = getPaginationMeta(items);
    return pagination.items;
  }

  function getCurrentService(detailId = "") {
    const items = getServices();
    return findServerServiceById(items, detailId);
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    openDetail: handleOpenDetail,
    copyDetailId: handleCopyDetailId,
    navigate: handleNavigate,
    quickAction: handleQuickAction,
    refreshHealth: handleRefreshHealth,
    toggleLive: handleToggleLive,

    goToPage,
    goPrevPage,
    goNextPage,

    getSnapshot: getCurrentSnapshot,
    getServices: getCurrentServices,
    getPageServices: getCurrentPageServices,
    getServiceById: getCurrentService,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default ServerView;
