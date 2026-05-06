/* =========================================================
   Onion SPA - Server View
   Archivo: src/views/server/serverView.js

   FINAL PRO SYSTEM · VIEW REAL · HARDENED · 12/10
   SERVER OBSERVABILITY · CSP CLEAN · NO INLINE CSS

   RESPONSABILIDADES:
   - punto de entrada real de la vista Server
   - render principal de header + dashboard técnico
   - paginación fija de servicios por vista
   - carga inicial robusta con fallback a cache
   - refresh con loader SOLO en dashboard principal
   - apertura de detalle técnico con estado visual de loading
   - bind de eventos de la pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar actions y modal sin mezclar responsabilidades
   - mantener compatibilidad con server.template.js CSP clean
   - conectar acciones nuevas y legacy:
     · refresh / refresh-server
     · refresh-health / load-server-health
     · toggle-live / toggle-server-live
     · open-server-detail
     · copy-server-detail-id
     · navigate-server
     · run-server-quick-action

   HARDENING PRO:
   - render inicial inmediato
   - carga posterior segura
   - anti-race token
   - anti doble reload
   - cleanup total
   - click delegation sólida
   - bridge AppCore + window events
   - fallback elegante si el modal aún no existe
   - live refresh controlado por key estable
   - sin CSS inline
   - sin estilos inyectados
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

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:server";
  const LIVE_KEY = "server:view";
  const PAGE_SIZE = Number(DEFAULT_PAGE_SIZE || 6) || 6;

  const LIVE_TOAST = Object.freeze({
    on: "Tiempo real activado.",
    off: "Tiempo real pausado.",
  });

  /* =========================================================
     LOCAL RUNTIME
  ========================================================= */

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let inflightReload = null;
  let bindingsCleanup = null;
  let renderToken = 0;

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

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

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value).trim();

    return text || fallback;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);

    return Number.isFinite(n) ? n : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;

      return value;
    }

    return null;
  }

  function normalizeKey(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "")
      .trim();
  }

  function getEventPayload(event = null) {
    return safeObject(
      first(
        event?.detail,
        event?.payload,
        event
      )
    );
  }

  function safeEmit(event = "", payload = {}) {
    const eventName = safeText(event, "");
    if (!eventName) return false;

    let emitted = false;

    try {
      AppCore?.events?.emit?.(eventName, payload);
      emitted = true;
    } catch {}

    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: payload,
          })
        );
        emitted = true;
      }
    } catch {}

    return emitted;
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

  function waitForPaint() {
    return new Promise((resolve) => {
      try {
        if (typeof window === "undefined") {
          resolve();
          return;
        }

        if (typeof window.requestAnimationFrame !== "function") {
          window.setTimeout(resolve, 0);
          return;
        }

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      } catch {
        resolve();
      }
    });
  }

  function showToast(message = "", type = "info") {
    const text = safeText(message, "");
    if (!text) return;

    try {
      if (typeof AppCore?.toast?.[type] === "function") {
        AppCore.toast[type](text);
        return;
      }
    } catch {}

    try {
      AppCore?.toast?.show?.(text, type);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.[type]?.(text);
    } catch {}
  }

  function safeErrorMessage(error = null) {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        error?.error,
        "No se pudo cargar el panel Server."
      ),
      "No se pudo cargar el panel Server."
    );
  }

  /* =========================================================
     CLEANUP
  ========================================================= */

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  /* =========================================================
     STATE HELPERS
  ========================================================= */

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
      safeNumber(
        first(
          serverState?.pageSize,
          serverState?.serverPageSize,
          PAGE_SIZE
        ),
        PAGE_SIZE
      )
    );

    if (!Number.isFinite(Number(serverState?.page))) {
      serverState.page = 1;
    }

    serverState.page = Math.max(1, safeNumber(serverState.page, 1));
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

    serverState.openingDetailId = safeText(serverState.openingDetailId, "");
    serverState.selectedDetailId = safeText(serverState.selectedDetailId, "");
    serverState.error = safeText(serverState.error, "");

    return serverState;
  }

  function markIdle() {
    setState({
      loading: false,
      refreshing: false,
    });
  }

  function markLoadedOk() {
    setState({
      loading: false,
      refreshing: false,
      loaded: true,
      hydrated: true,
      error: "",
      lastSyncAt: new Date().toISOString(),
      pageSize: PAGE_SIZE,
    });

    try {
      setHydrated?.(true);
    } catch {}
  }

  /* =========================================================
     DATA READERS
  ========================================================= */

  function getRawSnapshot() {
    try {
      return getServerSnapshotStore?.() || {};
    } catch {
      return {};
    }
  }

  function getSnapshot() {
    try {
      return normalizeServerSnapshotModel(getRawSnapshot());
    } catch (error) {
      safeWarn("getSnapshot falló:", error);
      return normalizeServerSnapshotModel({});
    }
  }

  function getRawServicesFromStore(snapshot = {}) {
    try {
      const fromStore = getServerServices?.();

      if (Array.isArray(fromStore)) {
        return fromStore;
      }
    } catch {}

    const safeSnapshot = safeObject(snapshot);

    return safeArray(safeSnapshot.services);
  }

  function getServices() {
    try {
      const snapshot = getSnapshot();
      const raw = getRawServicesFromStore(snapshot);

      return sortServerServicesByLatencyDesc(
        safeArray(raw).map((item) => normalizeServerServiceModel(item))
      );
    } catch (error) {
      safeWarn("getServices falló:", error);
      return [];
    }
  }

  function getPaginationMeta(items = []) {
    return paginateServerServices(
      safeArray(items),
      serverState.page || 1,
      serverState.pageSize || PAGE_SIZE
    );
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (safeNumber(serverState.page, 1) !== pagination.page) {
      serverState.page = pagination.page;
    }

    serverState.pageSize = PAGE_SIZE;

    return pagination;
  }

  function hydrateBestEffort() {
    let hydrated = false;

    try {
      hydrateServerFromCache?.();
    } catch (error) {
      safeWarn("hydrateServerFromCache falló:", error);
    }

    try {
      const services = getServices();

      if (services.length) {
        setState({
          hydrated: true,
          loaded: true,
        });

        setHydrated?.(true);
        hydrated = true;
      }
    } catch {}

    return hydrated;
  }

  /* =========================================================
     MODAL BRIDGE
  ========================================================= */

  function openServerModalBridge(detail = null) {
    if (!detail) return false;

    let handled = false;

    try {
      safeEmit("server:modal:open", { detail });
      handled = true;
    } catch {}

    try {
      const modal = window?.OnionServerModal;

      if (modal?.getState?.()?.isOpen && typeof modal.update === "function") {
        modal.update(detail);
        handled = true;
      } else if (typeof modal?.open === "function") {
        modal.open(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("OnionServerModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderServerDetailModal ||
        window?.renderServerModal ||
        window?.openServerDetailModal;

      if (typeof hook === "function") {
        hook(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("server modal hook falló:", error);
    }

    if (!handled) {
      showToast(
        "Detalle técnico cargado. Falta conectar server.modal.js para abrir el popup.",
        "info"
      );
    }

    return handled;
  }

  /* =========================================================
     LIVE REFRESH
  ========================================================= */

  async function onLiveTick() {
    if (destroyed) return;
    if (serverState.loading || serverState.refreshing) return;
    if (inflightReload) return;

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

  function persistLiveState(next = false) {
    try {
      setServerAutoRefresh?.(Boolean(next));
    } catch {}
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function buildHtml() {
    const snapshot = getSnapshot();
    const services = getServices();

    clampPageAgainstItems(services);

    return `
      <section class="panel-content dashboard ready" data-view="server">
        <div class="content-wrapper server-content-wrapper">
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

    try {
      setHydrated?.(true);
    } catch {}

    setState({
      hydrated: true,
    });

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

  /* =========================================================
     DATA LOAD
  ========================================================= */

  async function loadData({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) return getSnapshot();

    const servicesBefore = getServices();
    const hasVisibleData = servicesBefore.length > 0;

    setState({
      error: "",
      loading: !hasVisibleData && !silent,
      refreshing: hasVisibleData && asRefresh,
      pageSize: PAGE_SIZE,
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
      } catch (healthError) {
        safeWarn("loadServerHealth parcial falló:", healthError);
      }

      const servicesAfter = getServices();

      clampPageAgainstItems(servicesAfter);
      markLoadedOk();

      return getSnapshot();
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadServerSnapshot falló:", error);

      setState({
        error: message,
        loaded: true,
        hydrated: true,
        loading: false,
        refreshing: false,
      });

      try {
        setHydrated?.(true);
      } catch {}

      if (!silent) {
        showToast(message, "error");
      }

      return getSnapshot();
    } finally {
      markIdle();
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
    silent = false,
  } = {}) {
    const token = nextRenderToken();

    hydrateBestEffort();
    ensureBaseState();

    render();

    if (!destroyed) {
      bind();
    }

    await loadData({
      force,
      silent,
      asRefresh,
    });

    if (!isActiveToken(token)) {
      return api;
    }

    render();

    if (!destroyed) {
      bind();
    }

    return api;
  }

  /* =========================================================
     PAGE ACTIONS
  ========================================================= */

  function goToPage(page = 1) {
    if (serverState.loading || serverState.refreshing) {
      return serverState.page || 1;
    }

    const items = getServices();

    const pagination = paginateServerServices(
      items,
      page,
      serverState.pageSize || PAGE_SIZE
    );

    setState({
      page: pagination.page,
      pageSize: PAGE_SIZE,
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

  function changePageSize() {
    setState({
      pageSize: PAGE_SIZE,
      page: 1,
    });

    rerender();

    return PAGE_SIZE;
  }

  /* =========================================================
     ACTION FLOWS
  ========================================================= */

  async function handleOpenDetail(detailId = "") {
    const id = safeText(detailId, "");

    if (!id) {
      showToast("Detalle inválido.", "error");
      return null;
    }

    if (serverState.openingDetailId) {
      return null;
    }

    setState({
      openingDetailId: id,
      selectedDetailId: id,
    });

    rerender();
    await waitForPaint();

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
    const id = safeText(detailId, "");

    if (!id) return null;

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
    const id = safeText(detailId, "");

    if (!id) {
      showToast("No hay referencia técnica para copiar.", "error");
      return false;
    }

    try {
      return await copyServerDetailIdAction?.({
        detailId: id,
        silent: false,
      });
    } catch (error) {
      safeWarn("handleCopyDetailId falló:", error);
      showToast("No se pudo copiar la referencia técnica.", "error");
      return false;
    }
  }

  async function handleRefreshHealth() {
    if (destroyed) return false;

    try {
      setState({
        refreshingHealth: true,
      });

      await loadServerHealth?.({
        silent: false,
      });

      setState({
        refreshingHealth: false,
        lastHealthSyncAt: new Date().toISOString(),
      });

      if (!destroyed) {
        rerender();
      }

      return true;
    } catch (error) {
      safeWarn("handleRefreshHealth falló:", error);

      setState({
        refreshingHealth: false,
      });

      showToast("No se pudo refrescar el health.", "error");

      if (!destroyed) {
        rerender();
      }

      return false;
    }
  }

  async function handleNavigate(route = "") {
    const target = safeText(route, "");

    if (!target) return false;

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
    const finalAction = safeText(action, "");
    const finalRoute = safeText(route, "");

    if (!finalAction && !finalRoute) {
      showToast("Acción rápida inválida.", "error");
      return false;
    }

    try {
      return await runServerQuickAction?.({
        action: finalAction,
        route: finalRoute,
        payload: safeObject(payload),
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

    persistLiveState(next);

    setState({
      autoRefresh: next,
    });

    if (next) {
      ensureLiveRefresh();
      showToast(LIVE_TOAST.on, "success");
    } else {
      stopLiveRefresh();
      showToast(LIVE_TOAST.off, "info");
    }

    rerender();

    return next;
  }

  /* =========================================================
     DOM HELPERS
  ========================================================= */

  function closestAction(event, selectors = []) {
    const list = safeArray(selectors).filter(Boolean);
    if (!list.length) return null;

    try {
      return event.target?.closest?.(list.join(",")) || null;
    } catch {
      return null;
    }
  }

  function getDetailIdFromElement(element = null) {
    if (!element) return "";

    return safeText(
      first(
        element.dataset?.detailId,
        element.dataset?.serviceId,
        element.dataset?.id,
        element.getAttribute?.("data-detail-id"),
        element.getAttribute?.("data-service-id"),
        element.getAttribute?.("data-id")
      ),
      ""
    );
  }

  function getRouteFromElement(element = null) {
    if (!element) return "";

    return safeText(
      first(
        element.dataset?.route,
        element.dataset?.href,
        element.getAttribute?.("data-route"),
        element.getAttribute?.("data-href")
      ),
      ""
    );
  }

  function getQuickActionPayload(element = null) {
    if (!element) return {};

    const raw = safeText(
      first(
        element.dataset?.payload,
        element.getAttribute?.("data-payload")
      ),
      ""
    );

    if (!raw) return {};

    try {
      return safeObject(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      if (destroyed) return;

      const openBtn = closestAction(event, [
        '[data-action="open-server-detail"]',
        '[data-server-action="open-detail"]',
      ]);

      if (openBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenDetail(getDetailIdFromElement(openBtn));
        return;
      }

      const copyBtn = closestAction(event, [
        '[data-action="copy-server-detail-id"]',
        '[data-server-action="copy-detail-id"]',
      ]);

      if (copyBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyDetailId(getDetailIdFromElement(copyBtn));
        return;
      }

      const quickBtn = closestAction(event, [
        '[data-action="run-server-quick-action"]',
        '[data-server-action="quick-action"]',
      ]);

      if (quickBtn) {
        event.preventDefault();
        event.stopPropagation();

        const action = safeText(
          first(
            quickBtn.dataset?.serverAction,
            quickBtn.dataset?.actionName,
            quickBtn.getAttribute?.("data-server-action-name"),
            quickBtn.getAttribute?.("data-action-name")
          ),
          ""
        );

        await handleQuickAction({
          action,
          route: getRouteFromElement(quickBtn),
          payload: getQuickActionPayload(quickBtn),
        });

        return;
      }

      const navBtn = closestAction(event, [
        '[data-action="navigate-server"]',
        '[data-server-action="navigate"]',
      ]);

      if (navBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleNavigate(getRouteFromElement(navBtn));
        return;
      }

      const pageBtn = closestAction(event, [
        '[data-action="page"]',
        '[data-server-action="page"]',
      ]);

      if (pageBtn) {
        event.preventDefault();

        const page = safeNumber(
          first(
            pageBtn.dataset?.page,
            pageBtn.getAttribute?.("data-page")
          ),
          serverState.page || 1
        );

        goToPage(page);
        return;
      }

      const prevBtn = closestAction(event, [
        '[data-action="prev-page"]',
        '[data-server-action="prev-page"]',
      ]);

      if (prevBtn) {
        event.preventDefault();
        goPrevPage();
        return;
      }

      const nextBtn = closestAction(event, [
        '[data-action="next-page"]',
        '[data-server-action="next-page"]',
      ]);

      if (nextBtn) {
        event.preventDefault();
        goNextPage();
        return;
      }

      const healthBtn = closestAction(event, [
        "#server-health-btn",
        '[data-action="refresh-health"]',
        '[data-action="load-server-health"]',
        '[data-server-action="refresh-health"]',
      ]);

      if (healthBtn) {
        event.preventDefault();
        await handleRefreshHealth();
        return;
      }

      const liveBtn = closestAction(event, [
        "#server-toggle-live-btn",
        '[data-action="toggle-live"]',
        '[data-action="toggle-server-live"]',
        '[data-server-action="toggle-live"]',
      ]);

      if (liveBtn) {
        event.preventDefault();
        await handleToggleLive();
        return;
      }

      const retryBtn = closestAction(event, [
        "#server-retry-btn",
        '[data-action="retry"]',
        '[data-server-action="retry"]',
      ]);

      if (retryBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: false,
          silent: false,
        });

        return;
      }

      const refreshBtn = closestAction(event, [
        "#server-refresh-btn",
        '[data-action="refresh"]',
        '[data-action="refresh-server"]',
        '[data-server-action="refresh"]',
      ]);

      if (refreshBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: true,
          silent: false,
        });
      }
    };

    const onChange = (event) => {
      if (destroyed) return;

      const pageSizeField = closestAction(event, [
        '[data-server-field="page-size"]',
        '[data-field="page-size"]',
      ]);

      if (pageSizeField) {
        changePageSize(PAGE_SIZE);
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("change", onChange);

    return () => {
      try {
        container.removeEventListener("click", onClick);
        container.removeEventListener("change", onChange);
      } catch {}
    };
  }

  function bindModalBridgeEvents() {
    const bus = AppCore?.events;

    if (!bus?.on) {
      return () => {};
    }

    const onRefresh = async (event) => {
      const payload = getEventPayload(event);

      await handleRefreshDetailFromModal(
        payload.detailId ||
          payload.serviceId ||
          payload.detail?.detailId ||
          payload.detail?.serviceId ||
          payload.detail?.id ||
          ""
      );
    };

    const onCopy = async (event) => {
      const payload = getEventPayload(event);

      await handleCopyDetailId(
        payload.detailId ||
          payload.serviceId ||
          payload.detail?.detailId ||
          payload.detail?.serviceId ||
          payload.detail?.id ||
          ""
      );
    };

    const onNavigate = async (event) => {
      const payload = getEventPayload(event);

      await handleNavigate(
        payload.route ||
          payload.href ||
          payload.detail?.route ||
          payload.detail?.href ||
          ""
      );
    };

    const onRefreshAll = async () => {
      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    try {
      bus.on("server:modal:refresh", onRefresh);
      bus.on("server:modal:copy", onCopy);
      bus.on("server:modal:navigate", onNavigate);

      bus.on("server:refresh", onRefreshAll);
      bus.on("server:snapshot:updated", onRefreshAll);
      bus.on("server:health:updated", onRefreshAll);
    } catch (error) {
      safeWarn("bind modal bridge error:", error);
    }

    return () => {
      try { bus.off("server:modal:refresh", onRefresh); } catch {}
      try { bus.off("server:modal:copy", onCopy); } catch {}
      try { bus.off("server:modal:navigate", onNavigate); } catch {}

      try { bus.off("server:refresh", onRefreshAll); } catch {}
      try { bus.off("server:snapshot:updated", onRefreshAll); } catch {}
      try { bus.off("server:health:updated", onRefreshAll); } catch {}
    };
  }

  function bindWindowEvents() {
    const onRefresh = async (event) => {
      const payload = getEventPayload(event);

      await handleRefreshDetailFromModal(
        payload.detailId ||
          payload.serviceId ||
          payload.detail?.detailId ||
          payload.detail?.serviceId ||
          payload.detail?.id ||
          ""
      );
    };

    const onCopy = async (event) => {
      const payload = getEventPayload(event);

      await handleCopyDetailId(
        payload.detailId ||
          payload.serviceId ||
          payload.detail?.detailId ||
          payload.detail?.serviceId ||
          payload.detail?.id ||
          ""
      );
    };

    const onNavigate = async (event) => {
      const payload = getEventPayload(event);

      await handleNavigate(
        payload.route ||
          payload.href ||
          payload.detail?.route ||
          payload.detail?.href ||
          ""
      );
    };

    const onRefreshAll = async () => {
      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    try {
      window.addEventListener("server:modal:refresh", onRefresh);
      window.addEventListener("server:modal:copy", onCopy);
      window.addEventListener("server:modal:navigate", onNavigate);

      window.addEventListener("server:refresh", onRefreshAll);
      window.addEventListener("server:snapshot:updated", onRefreshAll);
      window.addEventListener("server:health:updated", onRefreshAll);
    } catch {}

    return () => {
      try {
        window.removeEventListener("server:modal:refresh", onRefresh);
        window.removeEventListener("server:modal:copy", onCopy);
        window.removeEventListener("server:modal:navigate", onNavigate);

        window.removeEventListener("server:refresh", onRefreshAll);
        window.removeEventListener("server:snapshot:updated", onRefreshAll);
        window.removeEventListener("server:health:updated", onRefreshAll);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    if (destroyed) return;

    const container = getContainer();
    const cleanups = [];

    cleanups.push(bindNativeActions(container));
    cleanups.push(bindModalBridgeEvents());
    cleanups.push(bindWindowEvents());

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =========================================================
     PUBLIC FLOWS
  ========================================================= */

  async function reload(options = {}) {
    if (destroyed) {
      return api;
    }

    if (inflightReload) {
      return inflightReload;
    }

    const {
      force = true,
      asRefresh = true,
      silent = false,
      keepLiveState = true,
    } = safeObject(options);

    inflightReload = (async () => {
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
    })();

    try {
      return await inflightReload;
    } finally {
      inflightReload = null;
    }
  }

  async function init() {
    if (destroyed) {
      destroyed = false;
    }

    if (inflightInit) {
      return inflightInit;
    }

    if (initialized && !destroyed) {
      ensureBaseState();
      rerender();

      if (serverState.autoRefresh) {
        ensureLiveRefresh();
      }

      return api;
    }

    initialized = true;

    inflightInit = (async () => {
      safeLog("init");

      hydrateBestEffort();

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
      refreshingHealth: false,
      loading: false,
      pageSize: PAGE_SIZE,
    });

    inflightReload = null;

    safeLog("destroy");
  }

  /* =========================================================
     EXTRAS ÚTILES
  ========================================================= */

  function getCurrentSnapshot() {
    return getSnapshot();
  }

  function getCurrentServices() {
    return getServices();
  }

  function getCurrentPageServices() {
    const items = getServices();
    const pagination = getPaginationMeta(items);

    return safeArray(pagination.items);
  }

  function getCurrentService(detailId = "") {
    const id = safeText(detailId, "");

    if (!id) return null;

    try {
      return (
        getServerServiceByIdStore?.(id) ||
        findServerServiceById(getServices(), id) ||
        null
      );
    } catch {
      return findServerServiceById(getServices(), id);
    }
  }

  /* =========================================================
     API
  ========================================================= */

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
    changePageSize,

    getSnapshot: getCurrentSnapshot,
    getServices: getCurrentServices,
    getPageServices: getCurrentPageServices,
    getServiceById: getCurrentService,

    getState: () => ({
      ...serverState,
      initialized,
      destroyed,
      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      pageSize: PAGE_SIZE,
    }),

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
