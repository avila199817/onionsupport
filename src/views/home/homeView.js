/* =========================================================
   Onion Support - Home View
   Archivo: /src/views/home/homeView.js

   Responsabilidad:
   - Controlador real de la vista Home.
   - Render principal con home.template.js.
   - Carga de datos delegada en home.api.js.
   - Estado runtime delegado en home.state.js.
   - Store/cache runtime delegado en home.store.js.
   - Modelo/normalización delegado en home.model.js.
   - Eventos DOM delegados en home.bindings.js.
   - Acciones delegadas en home.actions.js.
   - Renderiza dentro del host recibido por Router.
   - Devuelve API/controller, no el contenedor padre.
   - Sin validar rutas.
   - Sin resolver slug.
   - Sin Auth guards.
   - Sin Router guards.
   - Sin bridges globales.
   - Sin eventos externos.
   - Sin cache local propia.
   - Sin imports opcionales.
   - Sin modales de otras vistas.
   - Sin /home.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";

import renderHomeTemplate, {
  renderHomeErrorState,
} from "./home.template.js";

import {
  loadHomeDashboard,
  refreshHomeDashboard,
  hydrateHomeFromCache,
  getHomeApiSnapshot,
} from "./home.api.js";

import {
  homeState,
  syncHomeStateFromDashboard,
  getHomeStateSnapshot,
  setLoading,
  setRefreshing,
  setError,
  clearHomeError,
  setPage,
  setPageSize,
  setOpeningTicketId,
  setSelectedTicketId,
  setCreating,
  setNavigatingAction,
} from "./home.state.js";

import {
  replaceHomeStore,
  getHomeStoreSnapshot,
} from "./home.store.js";

import {
  normalizeHomeDashboard,
  normalizeHomeTickets,
  normalizeHomeInvoices,
  normalizeHomeUsers,
  normalizeHomeClients,
  normalizeHomeActivityList,
  buildHomeActivityFromCollections,
  findHomeTicketById,
  paginateHomeItems,
} from "./home.model.js";

import {
  bindHomeEvents,
  getHomeBindingsSnapshot,
} from "./home.bindings.js";

import {
  exportHomeCsvAction,
  navigateFromHomeAction,
  runHomeQuickAction,
  openHomeWidgetAction as actionOpenHomeWidget,
  copyHomeWidgetIdAction,
  getHomeActionsSnapshot,
} from "./home.actions.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  isObject,
  first,
  nowIso,
  sanitizePayload,
  showToast,
} from "./home.utils.js";

export const HOME_VIEW_VERSION = "home.view.v2";

export const HomeView = (() => {
  "use strict";

  const SOURCE = "views.home";
  const SCOPE = "view:home";
  const DEFAULT_PAGE_SIZE = 5;

  let initialized = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightLoad = null;

  let bindingsCleanup = null;
  let currentContainer = null;

  let renderSeq = 0;
  let loadSeq = 0;

  /* =======================================================
     BASICS
  ======================================================= */

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function isElement(value = null) {
    return Boolean(
      value &&
        typeof value === "object" &&
        value.nodeType === 1
    );
  }

  function nextRenderSeq() {
    renderSeq += 1;
    return renderSeq;
  }

  function nextLoadSeq() {
    loadSeq += 1;
    return loadSeq;
  }

  function isCurrentLoad(seq = 0) {
    return !destroyed && seq === loadSeq;
  }

  function isCurrentRender(seq = 0) {
    return !destroyed && seq === renderSeq;
  }

  function getState() {
    return isObject(AppCore?.state) ? AppCore.state : {};
  }

  function getCurrentUser() {
    const state = getState();

    return safeObject(
      first(
        state.user,
        state.currentUser,
        state.authUser,
        state.sessionUser,
        state.session?.user,
        state.sessionData?.user,
        {}
      )
    );
  }

  function getCurrentRole() {
    const state = getState();
    const user = getCurrentUser();

    const role = safeText(
      first(
        state.role,
        state.rol,
        state.userRole,
        user.role,
        user.rol,
        "user"
      ),
      "user"
    ).toLowerCase();

    return role === "admin" ? "admin" : "user";
  }

  function getContainer(candidate = null, context = {}) {
    if (!isBrowser()) return null;

    if (isElement(candidate)) return candidate;

    if (isElement(context?.renderRoot)) return context.renderRoot;
    if (isElement(context?.renderHost)) return context.renderHost;
    if (isElement(context?.viewContainer)) return context.viewContainer;

    return (
      AppCore?.dom?.routerViewHost ||
      AppCore?.dom?.viewHost ||
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      document.querySelector("[data-router-view-host='true']") ||
      document.querySelector("[data-router-view]") ||
      document.querySelector("[data-view-root]") ||
      document.getElementById("app-content") ||
      document.getElementById("main-content") ||
      null
    );
  }

  function setViewBusy(container = null, busy = false) {
    if (!isElement(container)) return false;

    try {
      container.setAttribute("aria-busy", busy ? "true" : "false");
      return true;
    } catch {
      return false;
    }
  }

  function safeErrorMessage(error = null) {
    return safeText(
      first(
        error?.response?.data?.message,
        error?.data?.message,
        error?.message,
        "No se pudo cargar el Home."
      ),
      "No se pudo cargar el Home."
    );
  }

  function htmlToElement(html = "") {
    if (!isBrowser()) return null;

    try {
      const template = document.createElement("template");
      template.innerHTML = String(html || "").trim();

      return template.content.firstElementChild || null;
    } catch {
      return null;
    }
  }

  function hasKeys(value = {}) {
    return Boolean(isObject(value) && Object.keys(value).length > 0);
  }

  /* =======================================================
     STATE NORMALIZATION
  ======================================================= */

  function ensureBaseState() {
    homeState.page = Math.max(1, safeNumber(homeState.page, 1));
    homeState.pageSize = Math.max(1, safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE));

    homeState.dashboard = safeObject(homeState.dashboard);
    homeState.summary = safeObject(homeState.summary);

    homeState.widgets = safeArray(homeState.widgets);

    homeState.tickets = safeArray(homeState.tickets);
    homeState.invoices = safeArray(homeState.invoices);
    homeState.users = safeArray(homeState.users);
    homeState.clients = safeArray(homeState.clients);
    homeState.activity = safeArray(homeState.activity);

    homeState.loading = Boolean(homeState.loading);
    homeState.refreshing = Boolean(homeState.refreshing);
    homeState.loaded = Boolean(homeState.loaded);
    homeState.hydrated = Boolean(homeState.hydrated);

    homeState.error = safeText(homeState.error, "");

    homeState.openingTicketId = safeText(homeState.openingTicketId, "");
    homeState.selectedTicketId = safeText(homeState.selectedTicketId, "");
    homeState.navigatingAction = safeText(homeState.navigatingAction, "");

    return homeState;
  }

  function hasDashboardData(dashboard = {}) {
    const data = safeObject(dashboard);

    return Boolean(
      hasKeys(data.summary) ||
        safeArray(data.widgets).length ||
        safeArray(data.tickets).length ||
        safeArray(data.incidencias).length ||
        safeArray(data.invoices).length ||
        safeArray(data.facturas).length ||
        safeArray(data.clients).length ||
        safeArray(data.clientes).length ||
        safeArray(data.users).length ||
        safeArray(data.usuarios).length ||
        safeArray(data.activity).length ||
        safeArray(data.recent).length ||
        safeNumber(data.totalTickets, 0) > 0 ||
        safeNumber(data.incidenciasTotal, 0) > 0 ||
        safeNumber(data.facturasTotal, 0) > 0 ||
        safeNumber(data.clientsCount, 0) > 0 ||
        safeNumber(data.clientesCount, 0) > 0 ||
        safeNumber(data.usersCount, 0) > 0
    );
  }

  function normalizeDashboardPayload(payload = {}) {
    const source = safeObject(
      first(
        payload?.dashboard,
        payload?.data?.dashboard,
        payload?.payload?.dashboard,
        payload?.result?.dashboard,
        payload
      )
    );

    const dashboard = normalizeHomeDashboard(source);

    const requestId = safeText(
      first(
        payload?.requestId,
        payload?.meta?.requestId,
        dashboard.requestId,
        dashboard.meta?.requestId,
        homeState.requestId,
        ""
      ),
      ""
    );

    const lastSyncAt = safeText(
      first(
        payload?.lastSyncAt,
        payload?.updatedAt,
        payload?.generatedAt,
        dashboard.updatedAt,
        dashboard.generatedAt,
        dashboard.meta?.updatedAt,
        nowIso()
      ),
      nowIso()
    );

    return {
      dashboard: {
        ...dashboard,
        requestId,
        updatedAt: lastSyncAt,
      },
      requestId,
      lastSyncAt,
    };
  }

  function applyDashboardPayload(payload = {}, options = {}) {
    const opts = safeObject(options);
    const normalized = normalizeDashboardPayload(payload);

    if (!hasDashboardData(normalized.dashboard)) {
      return null;
    }

    syncHomeStateFromDashboard(normalized.dashboard, {
      replace: opts.replace === true,
      requestId: normalized.requestId,
      lastSyncAt: normalized.lastSyncAt,
    });

    replaceHomeStore(
      {
        dashboard: normalized.dashboard,
        requestId: normalized.requestId,
        lastSyncAt: normalized.lastSyncAt,
      },
      {
        preserveExisting: opts.preserveExisting !== false,
        replace: opts.replace === true,
      }
    );

    clearHomeError();

    return normalized;
  }

  function hydrateBestEffort() {
    try {
      const cached = hydrateHomeFromCache?.();

      if (!cached?.hydrated) return false;

      const normalized = applyDashboardPayload(cached.dashboard || cached, {
        source: "home.cache",
        preserveExisting: true,
      });

      return Boolean(normalized);
    } catch {
      return false;
    }
  }

  /* =======================================================
     TEMPLATE PAYLOAD
  ======================================================= */

  function getTickets() {
    return normalizeHomeTickets(homeState.tickets);
  }

  function getInvoices() {
    return normalizeHomeInvoices(homeState.invoices);
  }

  function getUsers() {
    return normalizeHomeUsers(homeState.users);
  }

  function getClients() {
    return normalizeHomeClients(homeState.clients);
  }

  function getActivity() {
    const current = normalizeHomeActivityList(homeState.activity);

    if (current.length) return current;

    return normalizeHomeActivityList(
      buildHomeActivityFromCollections({
        tickets: getTickets(),
        invoices: getInvoices(),
        users: getUsers(),
        clients: getClients(),
      })
    );
  }

  function getPagination(items = getTickets()) {
    const rows = safeArray(items);

    try {
      return paginateHomeItems(
        rows,
        safeNumber(homeState.page, 1),
        safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE)
      );
    } catch {
      const pageSize = Math.max(1, safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE));
      const total = rows.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(Math.max(1, safeNumber(homeState.page, 1)), totalPages);
      const start = (page - 1) * pageSize;
      const pageItems = rows.slice(start, start + pageSize);

      return {
        items: pageItems,
        pageItems,
        page,
        currentPage: page,
        pageSize,
        totalPages,
        total,
        totalCount: total,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      };
    }
  }

  function buildDashboardForTemplate() {
    const tickets = getTickets();
    const invoices = getInvoices();
    const users = getUsers();
    const clients = getClients();
    const activity = getActivity();

    const summary = safeObject(homeState.summary);

    return {
      ...safeObject(homeState.dashboard),

      summary,
      stats: summary,
      metrics: summary,
      totals: summary,
      counts: summary,

      widgets: safeArray(homeState.widgets),

      tickets,
      incidencias: tickets,

      invoices,
      facturas: invoices,

      users,
      usuarios: users,

      clients,
      clientes: clients,
      customers: clients,

      activity,
      activities: activity,
      recent: activity,
      recentActivity: activity,

      ticketsTotal: Math.max(tickets.length, safeNumber(homeState.ticketsRemoteCount, tickets.length)),
      incidenciasTotal: Math.max(tickets.length, safeNumber(homeState.ticketsRemoteCount, tickets.length)),

      invoicesTotal: Math.max(invoices.length, safeNumber(homeState.invoicesRemoteCount, invoices.length)),
      facturasTotal: Math.max(invoices.length, safeNumber(homeState.invoicesRemoteCount, invoices.length)),

      usersTotal: Math.max(users.length, safeNumber(homeState.usersRemoteCount, users.length)),
      usuariosTotal: Math.max(users.length, safeNumber(homeState.usersRemoteCount, users.length)),

      clientsTotal: Math.max(clients.length, safeNumber(homeState.clientsRemoteCount, clients.length)),
      clientesTotal: Math.max(clients.length, safeNumber(homeState.clientsRemoteCount, clients.length)),

      updatedAt: homeState.lastSyncAt || "",
      requestId: homeState.requestId || "",
    };
  }

  function buildTemplatePayload() {
    ensureBaseState();

    const tickets = getTickets();
    const invoices = getInvoices();
    const users = getUsers();
    const clients = getClients();
    const activity = getActivity();
    const dashboard = buildDashboardForTemplate();
    const pagination = getPagination(tickets);

    return {
      user: getCurrentUser(),
      role: getCurrentRole(),

      dashboard,
      summary: safeObject(homeState.summary),
      stats: safeObject(homeState.summary),
      metrics: safeObject(homeState.summary),
      totals: safeObject(homeState.summary),

      widgets: safeArray(homeState.widgets),

      tickets,
      incidencias: tickets,

      invoices,
      facturas: invoices,

      users,
      usuarios: users,

      clients,
      clientes: clients,

      activity,
      recent: activity,
      recentActivity: activity,

      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,
      totalCount: pagination.totalCount || pagination.total || tickets.length,
      pageItems: pagination.items || pagination.pageItems || [],

      requestId: homeState.requestId || "",
      lastUpdatedAt: homeState.lastSyncAt || "",

      state: {
        ...getHomeStateSnapshot(),

        dashboard,
        summary: safeObject(homeState.summary),

        tickets,
        incidencias: tickets,

        invoices,
        facturas: invoices,

        users,
        usuarios: users,

        clients,
        clientes: clients,

        activity,
        recent: activity,
        recentActivity: activity,

        pagination,
      },
    };
  }

  /* =======================================================
     RENDER
  ======================================================= */

  function buildHtml() {
    const payload = buildTemplatePayload();

    return `
      <section
        class="panel-content home-view ready"
        data-view="home"
        data-home-scope="${SCOPE}"
      >
        <div class="content-wrapper home-view-wrapper">
          ${renderHomeTemplate(payload)}
        </div>
      </section>
    `;
  }

  function renderError(container = null, error = null) {
    if (!isElement(container)) return null;

    const node =
      htmlToElement(renderHomeErrorState(safeErrorMessage(error))) ||
      htmlToElement(`
        <section class="panel-content home-view home-view--error" data-view="home">
          <div class="content-wrapper home-view-wrapper">
            <div class="home-error-fallback" role="alert">
              <h1>No se pudo cargar el Home</h1>
              <p>${safeErrorMessage(error)}</p>
            </div>
          </div>
        </section>
      `);

    if (!node) return null;

    try {
      container.replaceChildren(node);
    } catch {
      try {
        container.innerHTML = "";
        container.appendChild(node);
      } catch {
        return null;
      }
    }

    return node;
  }

  function renderView(container = currentContainer) {
    if (destroyed || !isElement(container)) return null;

    const seq = nextRenderSeq();

    ensureBaseState();

    try {
      setViewBusy(container, Boolean(homeState.loading || homeState.refreshing));

      const node = htmlToElement(buildHtml());

      if (!node) {
        throw new Error("HOME_VIEW_NODE_EMPTY");
      }

      container.replaceChildren(node);
      setViewBusy(container, false);

      currentContainer = container;

      return isCurrentRender(seq) ? node : null;
    } catch (error) {
      setViewBusy(container, false);
      return renderError(container, error);
    }
  }

  function render(...args) {
    const container = getContainer(args[0], args[1]);

    if (!container) return null;

    destroyed = false;
    initialized = true;
    currentContainer = container;

    ensureBaseState();

    if (!homeState.hydrated && !hasVisibleData()) {
      hydrateBestEffort();
    }

    renderView(container);
    bind(container);

    if (!homeState.loaded && !inflightLoad) {
      void loadData({
        force: false,
        silent: hasVisibleData(),
        asRefresh: false,
      });
    }

    return api;
  }

  /* =======================================================
     DATA
  ======================================================= */

  function hasVisibleData() {
    return Boolean(
      getTickets().length ||
        getInvoices().length ||
        getUsers().length ||
        getClients().length ||
        getActivity().length ||
        hasKeys(homeState.summary) ||
        hasKeys(homeState.dashboard)
    );
  }

  async function loadData(options = {}) {
    if (destroyed) return false;
    if (inflightLoad) return inflightLoad;

    const seq = nextLoadSeq();
    const opts = safeObject(options);
    const refresh = opts.asRefresh === true;

    inflightLoad = (async () => {
      const hadData = hasVisibleData();

      clearHomeError();

      setLoading(!hadData && !refresh);
      setRefreshing(refresh);

      renderView(currentContainer);

      try {
        const response = refresh
          ? await refreshHomeDashboard({
              force: true,
              returnStaleOnError: true,
            })
          : await loadHomeDashboard({
              force: opts.force === true,
              returnStaleOnError: true,
            });

        if (!isCurrentLoad(seq)) return false;

        const normalized = applyDashboardPayload(response, {
          source: refresh ? "home.refresh" : "home.load",
          preserveExisting: true,
        });

        if (!normalized) {
          return false;
        }

        return true;
      } catch (error) {
        if (!isCurrentLoad(seq)) return false;

        const message = safeErrorMessage(error);

        setError(message);

        if (opts.silent !== true) {
          showToast(message, "error");
        }

        return false;
      } finally {
        if (isCurrentLoad(seq)) {
          setLoading(false);
          setRefreshing(false);

          renderView(currentContainer);

          if (!bindingsCleanup && currentContainer) {
            bind(currentContainer);
          }
        }

        inflightLoad = null;
      }
    })();

    return inflightLoad;
  }

  /* =======================================================
     ACTIONS
  ======================================================= */

  function rerender() {
    const node = renderView(currentContainer);

    if (!bindingsCleanup && currentContainer) {
      bind(currentContainer);
    }

    return node;
  }

  function goToPage(page = 1) {
    const pagination = getPagination(getTickets());
    const totalPages = Math.max(1, safeNumber(pagination.totalPages, 1));
    const nextPage = Math.min(Math.max(1, safeNumber(page, 1)), totalPages);

    setPage(nextPage);
    rerender();

    return nextPage;
  }

  function goPrevPage() {
    return goToPage(safeNumber(homeState.page, 1) - 1);
  }

  function goNextPage() {
    return goToPage(safeNumber(homeState.page, 1) + 1);
  }

  function changePageSize(value = DEFAULT_PAGE_SIZE) {
    const size = Math.max(1, safeNumber(value, DEFAULT_PAGE_SIZE));

    setPageSize(size);
    setPage(1);
    rerender();

    return size;
  }

  async function navigateTo(route = "", options = {}) {
    const target = safeText(route, "");

    if (!target) return false;

    setNavigatingAction(target);
    rerender();

    try {
      return await navigateFromHomeAction({
        route: target,
        payload: safeObject(options.payload),
        silent: options.silent === true,
      });
    } finally {
      setNavigatingAction("");
      rerender();
    }
  }

  async function runQuickAction(payload = {}) {
    return runHomeQuickAction(safeObject(payload));
  }

  async function openTicket(ticketId = "", payload = {}) {
    const id = safeText(ticketId || payload?.ticketId || payload?.incidenciaId, "");

    if (!id) return null;

    setOpeningTicketId(id);
    setSelectedTicketId(id);
    rerender();

    try {
      return await navigateFromHomeAction({
        route: "/incidencias",
        payload: {
          ...safeObject(payload),
          ticketId: id,
          incidenciaId: id,
        },
        silent: false,
      });
    } finally {
      setOpeningTicketId("");
      rerender();
    }
  }

  async function createIncidencia(draft = {}) {
    setCreating(true);
    rerender();

    try {
      return await navigateFromHomeAction({
        route: "/incidencias",
        payload: safeObject(draft),
        silent: false,
      });
    } finally {
      setCreating(false);
      rerender();
    }
  }

  /* =======================================================
     BINDINGS
  ======================================================= */

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {
      // noop
    }

    bindingsCleanup = null;
  }

  function bind(container = currentContainer) {
    cleanupBindings();

    if (destroyed || !isElement(container)) return false;

    bindingsCleanup = bindHomeEvents({
      scope: SCOPE,
      container,

      reload,
      refresh,

      loadHomeDashboard: () =>
        reload({
          force: true,
          asRefresh: true,
        }),

      exportHomeCsvAction,

      navigateFromHomeAction: ({ route = "", payload = {}, silent = false } = {}) =>
        navigateFromHomeAction({
          route,
          payload,
          silent,
        }),

      runHomeQuickAction: runQuickAction,

      openHomeWidgetAction: ({ widgetId = "", payload = {}, navigate = true, silent = false } = {}) =>
        actionOpenHomeWidget({
          widgetId,
          payload,
          navigate,
          silent,
        }),

      copyHomeWidgetIdAction,

      createFromHomeAction: ({ draft = {}, payload = {}, silent = false } = {}) =>
        createIncidencia(first(draft, payload, {}), {
          silent,
        }),

      goToPage,
      goPrevPage,
      goNextPage,
      changePageSize,
    });

    return true;
  }

  /* =======================================================
     LIFECYCLE
  ======================================================= */

  async function init(...args) {
    if (inflightInit) return inflightInit;

    destroyed = false;

    const container = getContainer(args[0], args[1]);

    currentContainer = container;

    inflightInit = (async () => {
      render(container, args[1]);

      if (inflightLoad) {
        await inflightLoad;
      }

      return api;
    })();

    try {
      return await inflightInit;
    } finally {
      inflightInit = null;
    }
  }

  function mount(...args) {
    return init(...args);
  }

  async function reload(options = {}) {
    await loadData({
      ...safeObject(options),
      force: options.force === true,
      asRefresh: options.asRefresh === true,
    });

    return api;
  }

  async function refresh(options = {}) {
    return reload({
      ...safeObject(options),
      force: true,
      asRefresh: true,
    });
  }

  function destroy() {
    destroyed = true;
    initialized = false;

    nextRenderSeq();
    nextLoadSeq();

    cleanupBindings();

    setLoading(false);
    setRefreshing(false);
    setCreating(false);
    setOpeningTicketId("");
    setSelectedTicketId("");
    setNavigatingAction("");

    inflightInit = null;
    inflightLoad = null;
    currentContainer = null;

    return true;
  }

  function unmount() {
    return destroy();
  }

  /* =======================================================
     SNAPSHOT
  ======================================================= */

  function getStateSnapshot() {
    const tickets = getTickets();
    const pagination = getPagination(tickets);

    return sanitizePayload({
      ...getHomeStateSnapshot(),

      initialized,
      destroyed,

      user: getCurrentUser(),
      role: getCurrentRole(),

      ticketsCount: tickets.length,
      invoicesCount: getInvoices().length,
      usersCount: getUsers().length,
      clientsCount: getClients().length,
      activityCount: getActivity().length,

      pagination,

      apiSnapshot: getHomeApiSnapshot?.(),
      storeSnapshot: getHomeStoreSnapshot?.(),
      bindingsSnapshot: getHomeBindingsSnapshot?.(SCOPE),
      actionsSnapshot: getHomeActionsSnapshot?.(),
    });
  }

  function getSnapshot() {
    return sanitizePayload({
      version: HOME_VIEW_VERSION,
      source: SOURCE,

      initialized,
      destroyed,

      loaded: Boolean(homeState.loaded),
      hydrated: Boolean(homeState.hydrated),
      loading: Boolean(homeState.loading),
      refreshing: Boolean(homeState.refreshing),

      error: homeState.error || "",

      ticketsCount: getTickets().length,
      invoicesCount: getInvoices().length,
      usersCount: getUsers().length,
      clientsCount: getClients().length,
      activityCount: getActivity().length,

      page: homeState.page,
      pageSize: homeState.pageSize,

      requestId: homeState.requestId || "",
      lastSyncAt: homeState.lastSyncAt || "",

      hasContainer: Boolean(currentContainer),
      hasBindings: Boolean(bindingsCleanup),

      hasInflightInit: Boolean(inflightInit),
      hasInflightLoad: Boolean(inflightLoad),
    });
  }

  /* =======================================================
     API
  ======================================================= */

  const api = {
    version: HOME_VIEW_VERSION,
    source: SOURCE,

    init,
    mount,

    render,
    scheduleRender: render,

    reload,
    refresh,

    destroy,
    unmount,
    cleanup: destroy,

    bind,

    navigateTo,
    navigate: navigateTo,

    openTicket,
    openIncidencia: openTicket,
    createIncidencia,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getItems: getTickets,
    getTickets,

    getInvoices,
    getFacturas: getInvoices,

    getUsers,
    getUsuarios: getUsers,

    getClients,
    getClientes: getClients,

    getActivity,

    getDashboard: () => safeObject(homeState.dashboard),
    getSummary: () => safeObject(homeState.summary),
    getWidgets: () => safeArray(homeState.widgets),

    getPageItems: () => safeArray(getPagination(getTickets()).items),
    getPagination: () => getPagination(getTickets()),

    getTicketById: (ticketId = "") =>
      findHomeTicketById(getTickets(), ticketId),

    hydrateBestEffort,

    getState: getStateSnapshot,
    getSnapshot,
    getDebugSnapshot: getSnapshot,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },

    get ready() {
      return initialized && !destroyed;
    },
  };

  return api;
})();

export default HomeView;
