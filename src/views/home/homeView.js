/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/homeView.js

   FINAL PRO SYSTEM · VIEW REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista home
   - render principal de header + dashboard
   - paginación fija de widgets por vista
   - carga inicial robusta
   - refresh con loader SOLO en dashboard principal
   - apertura de widget con estado visual de loading
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
  homeState,
  setHydrated,
} from "./home.state.js";

import {
  loadHomeDashboard,
  loadHomeHealth,
  hydrateHomeFromCache,
} from "./home.api.js";

import {
  getHomeDashboardStore,
  getHomeWidgets,
  getHomeWidgetByIdStore,
} from "./home.store.js";

import {
  renderHeader,
  renderDashboard,
} from "./home.template.js";

import {
  DEFAULT_PAGE_SIZE,
  normalizeHomeDashboardModel,
  normalizeHomeWidgetModel,
  sortHomeWidgetsByUpdatedDesc,
  paginateHomeWidgets,
  findHomeWidgetById,
} from "./home.model.js";

import {
  openHomeWidgetAction,
  copyHomeWidgetIdAction,
  exportHomeCsvAction,
  navigateFromHomeAction,
  runHomeQuickAction,
  refreshHomeDashboardAction,
} from "./home.actions.js";

export const HomeView = (() => {
  "use strict";

  const SCOPE = "view:home";

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
      AppCore?.utils?.log?.("[HomeView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[HomeView]", ...args);
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
      return homeState;
    }

    Object.assign(homeState, patch);

    return homeState;
  }

  function ensureBaseState() {
    const pageSize = Math.max(
      1,
      Number(homeState?.pageSize || DEFAULT_PAGE_SIZE)
    );

    if (!Number.isFinite(Number(homeState?.page))) {
      homeState.page = 1;
    }

    homeState.page = Math.max(1, Number(homeState.page || 1));
    homeState.pageSize = pageSize;

    if (typeof homeState.loading !== "boolean") {
      homeState.loading = false;
    }

    if (typeof homeState.refreshing !== "boolean") {
      homeState.refreshing = false;
    }

    homeState.openingWidgetId =
      typeof homeState.openingWidgetId === "string"
        ? homeState.openingWidgetId
        : "";

    homeState.selectedWidgetId =
      typeof homeState.selectedWidgetId === "string"
        ? homeState.selectedWidgetId
        : "";

    homeState.error =
      typeof homeState.error === "string"
        ? homeState.error
        : "";
  }

  function getRawDashboard() {
    try {
      return getHomeDashboardStore();
    } catch {
      return {};
    }
  }

  function getDashboard() {
    try {
      const raw = getRawDashboard();
      return normalizeHomeDashboardModel(raw);
    } catch (error) {
      safeWarn("getDashboard falló:", error);
      return normalizeHomeDashboardModel({});
    }
  }

  function getWidgets() {
    try {
      const raw =
        getHomeWidgets?.() ||
        safeObject(getDashboard()).widgets ||
        [];

      return sortHomeWidgetsByUpdatedDesc(
        raw.map((item) => normalizeHomeWidgetModel(item))
      );
    } catch (error) {
      safeWarn("getWidgets falló:", error);
      return [];
    }
  }

  function getPaginationMeta(items = []) {
    return paginateHomeWidgets(
      items,
      homeState.page || 1,
      homeState.pageSize || DEFAULT_PAGE_SIZE
    );
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (homeState.page !== pagination.page) {
      homeState.page = pagination.page;
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
      return "No se pudo cargar el dashboard Home.";
    }

    const message =
      error?.message ||
      error?.response?.message ||
      error?.response?.data?.message ||
      error?.data?.message ||
      "No se pudo cargar el dashboard Home.";

    return String(message).trim() || "No se pudo cargar el dashboard Home.";
  }

  /* =====================================================
     MODAL BRIDGE
  ===================================================== */

  function openHomeModalBridge(detail = null) {
    if (!detail) {
      return false;
    }

    let handled = false;

    try {
      safeEmit("home:modal:open", { detail });
      handled = true;
    } catch {}

    try {
      const globalHook =
        window?.OnionHomeModal?.open ||
        window?.renderHomeWidgetModal ||
        window?.renderWidgetModal;

      if (typeof globalHook === "function") {
        globalHook(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("modal bridge hook falló:", error);
    }

    if (!handled) {
      showToast(
        "Detalle cargado. Falta conectar home.modal.js para abrir el popup.",
        "info"
      );
    }

    return handled;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function buildHtml() {
    const dashboard = getDashboard();
    const widgets = getWidgets();

    clampPageAgainstItems(widgets);

    return `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader({
            dashboard,
            state: homeState,
          })}

          ${renderDashboard({
            dashboard,
            state: homeState,
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
      AppCore?.setDocumentTitle?.("Home");
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
    const widgetsBefore = getWidgets();
    const hasVisibleData = widgetsBefore.length > 0;

    setState({
      error: "",
      loading: !hasVisibleData && !silent,
      refreshing: hasVisibleData && asRefresh,
    });

    render();

    try {
      await loadHomeDashboard({
        force,
        allowLegacyFallback: true,
      });

      try {
        await loadHomeHealth?.({
          silent: true,
        });
      } catch {}

      setState({
        loading: false,
        refreshing: false,
        error: "",
        lastSyncAt: new Date().toISOString(),
      });

      const widgetsAfter = getWidgets();

      clampPageAgainstItems(widgetsAfter);

      return getDashboard();
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadHomeDashboard falló:", error);

      setState({
        loading: false,
        refreshing: false,
        error: message,
      });

      if (!silent) {
        showToast(message, "error");
      }

      return getDashboard();
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
  } = {}) {
    const token = nextRenderToken();

    try {
      hydrateHomeFromCache?.();
    } catch (error) {
      safeWarn("hydrateHomeFromCache falló:", error);
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
    const items = getWidgets();

    const pagination = paginateHomeWidgets(
      items,
      page,
      homeState.pageSize || DEFAULT_PAGE_SIZE
    );

    setState({
      page: pagination.page,
    });

    rerender();

    return pagination.page;
  }

  function goPrevPage() {
    return goToPage((homeState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((homeState.page || 1) + 1);
  }

  /* =====================================================
     ACTION FLOWS
  ===================================================== */

  async function handleOpenWidget(widgetId = "") {
    const id = String(widgetId || "").trim();

    if (!id) {
      showToast("Widget inválido.", "error");
      return null;
    }

    setState({
      openingWidgetId: id,
      selectedWidgetId: id,
    });

    rerender();

    try {
      const detail = await openHomeWidgetAction({
        widgetId: id,
        preferFresh: false,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo abrir el widget.", "error");
        return null;
      }

      openHomeModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleOpenWidget falló:", error);
      showToast("No se pudo abrir el widget.", "error");
      return null;
    } finally {
      setState({
        openingWidgetId: "",
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleRefreshWidgetFromModal(widgetId = "") {
    const id = String(widgetId || "").trim();

    if (!id) {
      return null;
    }

    try {
      await refreshHomeDashboardAction({
        silent: true,
      });

      const detail =
        getHomeWidgetByIdStore?.(id) ||
        findHomeWidgetById(getWidgets(), id) ||
        null;

      if (!detail) {
        showToast("No se pudo refrescar el widget.", "error");
        return null;
      }

      openHomeModalBridge(detail);

      if (!destroyed) {
        rerender();
      }

      return detail;
    } catch (error) {
      safeWarn("handleRefreshWidgetFromModal falló:", error);
      showToast("No se pudo refrescar el widget.", "error");
      return null;
    }
  }

  async function handleCopyWidgetId(widgetId = "") {
    const ok = await copyHomeWidgetIdAction({
      widgetId,
      silent: false,
    });

    return ok;
  }

  function handleExportCsv() {
    return exportHomeCsvAction({
      silent: false,
    });
  }

  async function handleNavigate(route = "") {
    const target = String(route || "").trim();

    if (!target) {
      return false;
    }

    try {
      return await navigateFromHomeAction({
        route: target,
        silent: false,
      });
    } catch (error) {
      safeWarn("handleNavigate falló:", error);
      showToast("No se pudo navegar desde Home.", "error");
      return false;
    }
  }

  async function handleQuickAction({
    action = "",
    route = "",
    payload = {},
  } = {}) {
    try {
      return await runHomeQuickAction({
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

  /* =====================================================
     CLICK DELEGATION
  ===================================================== */

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      const openBtn = event.target.closest(
        '[data-action="open-home-widget"]'
      );

      if (openBtn) {
        event.preventDefault();

        const widgetId = String(
          openBtn.dataset.widgetId ||
            openBtn.dataset.widgetKey ||
            ""
        ).trim();

        await handleOpenWidget(widgetId);
        return;
      }

      const copyBtn = event.target.closest(
        '[data-action="copy-home-widget-id"]'
      );

      if (copyBtn) {
        event.preventDefault();

        const widgetId = String(
          copyBtn.dataset.widgetId ||
            copyBtn.dataset.widgetKey ||
            ""
        ).trim();

        if (!widgetId) {
          return;
        }

        await handleCopyWidgetId(widgetId);
        return;
      }

      const quickBtn = event.target.closest(
        '[data-action="run-home-quick-action"]'
      );

      if (quickBtn) {
        event.preventDefault();

        const action = String(
          quickBtn.dataset.quickAction ||
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
        '[data-action="navigate-home"]'
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

      const exportBtn = event.target.closest("#home-export-btn");
      if (exportBtn) {
        event.preventDefault();
        handleExportCsv();
        return;
      }

      const retryBtn = event.target.closest("#home-retry-btn");
      if (retryBtn) {
        event.preventDefault();
        await reload({ force: true, asRefresh: false });
        return;
      }

      const refreshBtn = event.target.closest("#home-refresh-btn");
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
      const widgetId =
        event?.detail?.widgetId ||
        event?.widgetId ||
        "";

      if (!widgetId) {
        return;
      }

      await handleRefreshWidgetFromModal(widgetId);
    };

    const onCopy = async (event) => {
      const widgetId =
        event?.detail?.widgetId ||
        event?.widgetId ||
        "";

      if (!widgetId) {
        return;
      }

      await handleCopyWidgetId(widgetId);
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
      eventBus.on("home:modal:refresh", onRefresh);
      eventBus.on("home:modal:copy", onCopy);
      eventBus.on("home:modal:navigate", onNavigate);
    } catch (error) {
      safeWarn("bind modal bridge error:", error);
    }

    return () => {
      try {
        eventBus?.off?.("home:modal:refresh", onRefresh);
      } catch {}

      try {
        eventBus?.off?.("home:modal:copy", onCopy);
      } catch {}

      try {
        eventBus?.off?.("home:modal:navigate", onNavigate);
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
      openingWidgetId: "",
      selectedWidgetId: "",
      refreshing: false,
      loading: false,
    });

    safeLog("destroy");
  }

  /* =====================================================
     EXTRAS ÚTILES
  ===================================================== */

  function getCurrentDashboard() {
    return getDashboard();
  }

  function getCurrentWidgets() {
    return getWidgets();
  }

  function getCurrentPageWidgets() {
    const items = getWidgets();
    const pagination = getPaginationMeta(items);
    return pagination.items;
  }

  function getCurrentWidget(widgetId = "") {
    const items = getWidgets();
    return findHomeWidgetById(items, widgetId);
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    openWidget: handleOpenWidget,
    copyWidgetId: handleCopyWidgetId,
    exportCsv: handleExportCsv,
    navigate: handleNavigate,
    quickAction: handleQuickAction,

    goToPage,
    goPrevPage,
    goNextPage,

    getDashboard: getCurrentDashboard,
    getWidgets: getCurrentWidgets,
    getPageWidgets: getCurrentPageWidgets,
    getWidgetById: getCurrentWidget,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default HomeView;
