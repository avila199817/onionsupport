/* =========================================================
   Onion Support - Home View
   Archivo: /src/views/home/homeView.js

   Responsabilidad:
   - Controlador real de la vista Home.
   - Render principal con home.template.js.
   - Carga de datos delegada en home.api.js.
   - Estado delegado en home.state.js.
   - Modelo delegado en home.model.js.
   - Eventos DOM delegados en home.bindings.js.
   - Acciones delegadas en home.actions.js.
   - Sin validar rutas.
   - Sin resolver slug.
   - Sin Auth guards.
   - Sin Router guards.
   - Sin bridges globales.
   - Sin eventos externos masivos.
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
  normalizeHomeDashboardResponse,
  getHomeApiSnapshot,
} from "./home.api.js";

import {
  homeState,
  syncHomeStateFromDashboard,
  getHomeStateSnapshot,
  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setError,
  clearHomeError,
  setDashboard,
  setSummary,
  setTickets,
  setInvoices,
  setUsers,
  setClients,
  setRecent,
  setRequestId,
  setLastSyncAt,
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
  getHomeActionsSnapshot,
} from "./home.actions.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  isObject,
  isFunction,
  first,
  nowIso,
  sanitizePayload,
  showToast,
} from "./home.utils.js";

export const HOME_VIEW_VERSION = "home.view.v1";

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

  function isCurrentRender(seq = 0) {
    return !destroyed && seq === renderSeq;
  }

  function getState() {
    return isObject(AppCore?.state) ? AppCore.state : {};
  }

  function getCurrentUser() {
    const state = getState();

    return (
      safeObject(
        first(
          state.user,
          state.currentUser,
          state.authUser,
          state.sessionUser,
          state.session?.user,
          {}
        )
      ) || {}
    );
  }

  function getCurrentRole() {
    const state = getState();
    const user = getCurrentUser();

    const role = safeText(
      first(
        state.role,
        state.rol,
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
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      document.getElementById("app-content") ||
      document.getElementById("main-content") ||
      document.querySelector("[data-router-view]") ||
      document.querySelector("[data-view-root]") ||
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

  function getDashboardSource(payload = {}) {
    const response = safeObject(
      normalizeHomeDashboardResponse?.(payload) || payload
    );

    return safeObject(
      first(
        response.dashboard,
        response.data?.dashboard,
        response.payload?.dashboard,
        response.result?.dashboard,
        response
      )
    );
  }

  function normalizeDashboardPayload(payload = {}) {
    const response = safeObject(
      normalizeHomeDashboardResponse?.(payload) || payload
    );

    const rawDashboard = getDashboardSource(response);
    const dashboard = normalizeHomeDashboard(rawDashboard);

    const summary = safeObject(
      first(
        dashboard.summary,
        dashboard.stats,
        dashboard.metrics,
        dashboard.totals,
        dashboard.counts,
        response.summary,
        response.stats,
        {}
      )
    );

    const tickets = normalizeHomeTickets(
      first(
        dashboard.tickets,
        dashboard.incidencias,
        response.tickets,
        response.incidencias,
        []
      )
    );

    const invoices = normalizeHomeInvoices(
      first(
        dashboard.invoices,
        dashboard.facturas,
        response.invoices,
        response.facturas,
        []
      )
    );

    const users = normalizeHomeUsers(
      first(
        dashboard.users,
        dashboard.usuarios,
        response.users,
        response.usuarios,
        []
      )
    );

    const clients = normalizeHomeClients(
      first(
        dashboard.clients,
        dashboard.clientes,
        dashboard.customers,
        response.clients,
        response.clientes,
        response.customers,
        []
      )
    );

    const rawActivity = normalizeHomeActivityList(
      first(
        dashboard.activity,
        dashboard.activities,
        dashboard.recent,
        dashboard.recentActivity,
        response.activity,
        response.activities,
        response.recent,
        response.recentActivity,
        []
      )
    );

    const activity = rawActivity.length
      ? rawActivity
      : normalizeHomeActivityList(
          buildHomeActivityFromCollections({
            tickets,
            invoices,
            users,
            clients,
          })
        );

    const requestId = safeText(
      first(
        response.requestId,
        response.meta?.requestId,
        dashboard.requestId,
        dashboard.meta?.requestId,
        homeState.requestId,
        ""
      ),
      ""
    );

    const lastSyncAt = safeText(
      first(
        response.lastSyncAt,
        response.updatedAt,
        response.generatedAt,
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

        summary,
        stats: summary,
        metrics: summary,
        totals: summary,
        counts: summary,

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

        updatedAt: lastSyncAt,
        requestId,
      },

      summary,
      tickets,
      invoices,
      users,
      clients,
      activity,
      requestId,
      lastSyncAt,
    };
  }

  function applyDashboardPayload(payload = {}, options = {}) {
    const opts = safeObject(options);
    const normalized = normalizeDashboardPayload(payload);

    syncHomeStateFromDashboard(normalized.dashboard, {
      replace: opts.replace === true,
      requestId: normalized.requestId,
      lastSyncAt: normalized.lastSyncAt,
    });

    setDashboard(normalized.dashboard, {
      replace: opts.replace === true,
    });

    setSummary(normalized.summary, {
      replace: opts.replace === true,
    });

    setTickets(normalized.tickets, {
      remoteCount: normalized.tickets.length,
    });

    setInvoices(normalized.invoices, {
      remoteCount: normalized.invoices.length,
    });

    setUsers(normalized.users, {
      remoteCount: normalized.users.length,
    });

    setClients(normalized.clients, {
      remoteCount: normalized.clients.length,
    });

    setRecent(normalized.activity, {
      remoteCount: normalized.activity.length,
    });

    setRequestId(normalized.requestId);
    setLastSyncAt(normalized.lastSyncAt);

    replaceHomeStore(
      {
        dashboard: normalized.dashboard,
        summary: normalized.summary,
        widgets: safeArray(normalized.dashboard.widgets),

        tickets: normalized.tickets,
        incidencias: normalized.tickets,

        invoices: normalized.invoices,
        facturas: normalized.invoices,

        users: normalized.users,
        usuarios: normalized.users,

        clients: normalized.clients,
        clientes: normalized.clients,

        activity: normalized.activity,
        recent: normalized.activity,
        recentActivity: normalized.activity,

        requestId: normalized.requestId,
        lastSyncAt: normalized.lastSyncAt,
      },
      {
        preserveExisting: opts.preserveExisting !== false,
        reason: opts.source || SOURCE,
      }
    );

    clearHomeError();
    setLoaded(true);
    setHydrated(true);

    return normalized;
  }

  function hydrateBestEffort() {
    try {
      const cached = hydrateHomeFromCache?.();

      if (cached) {
        applyDashboardPayload(cached.dashboard || cached, {
          source: "home.cache",
          preserveExisting: true,
        });

        setHydrated(true);
        return true;
      }
    } catch {
      // noop
    }

    return false;
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
    try {
      return paginateHomeItems(
        items,
        safeNumber(homeState.page, 1),
        safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE)
      );
    } catch {
      const pageSize = Math.max(1, safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE));
      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(Math.max(1, safeNumber(homeState.page, 1)), totalPages);
      const start = (page - 1) * pageSize;

      return {
        items: items.slice(start, start + pageSize),
        pageItems: items.slice(start, start + pageSize),
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

  function renderView(container = currentContainer) {
    if (destroyed || !isElement(container)) return null;

    const seq = nextRenderSeq();

    ensureBaseState();

    try {
      setViewBusy(container, Boolean(homeState.loading || homeState.refreshing));
      container.innerHTML = buildHtml();
      setViewBusy(container, false);

      currentContainer = container;

      return isCurrentRender(seq) ? container : null;
    } catch (error) {
      setViewBusy(container, false);

      try {
        container.innerHTML = renderHomeErrorState(safeErrorMessage(error));
      } catch {
        // noop
      }

      return container;
    }
  }

  function render(...args) {
    const container = getContainer(args[0], args[1]);

    if (!container) return null;

    currentContainer = container;

    const node = renderView(container);

    if (node) {
      bind(container);
    }

    return node;
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
        Object.keys(safeObject(homeState.summary)).length ||
        Object.keys(safeObject(homeState.dashboard)).length
    );
  }

  async function loadData(options = {}) {
    if (destroyed) return false;
    if (inflightLoad) return inflightLoad;

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

        applyDashboardPayload(response, {
          source: refresh ? "home.refresh" : "home.load",
          preserveExisting: true,
        });

        setLoaded(true);
        setHydrated(true);
        clearHomeError();

        return true;
      } catch (error) {
        const message = safeErrorMessage(error);

        setError(message);
        setLoaded(true);

        if (opts.silent !== true) {
          showToast(message, "error");
        }

        return false;
      } finally {
        setLoading(false);
        setRefreshing(false);

        renderView(currentContainer);
        bind(currentContainer);

        inflightLoad = null;
      }
    })();

    return inflightLoad;
  }

  /* =======================================================
     ACTIONS
  ======================================================= */

  function goToPage(page = 1) {
    const pagination = getPagination(getTickets());
    const totalPages = Math.max(1, safeNumber(pagination.totalPages, 1));
    const nextPage = Math.min(Math.max(1, safeNumber(page, 1)), totalPages);

    setPage(nextPage);
    renderView(currentContainer);

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
    renderView(currentContainer);

    return size;
  }

  async function navigateTo(route = "", options = {}) {
    const target = safeText(route, "");

    if (!target) return false;

    setNavigatingAction(target);
    renderView(currentContainer);

    try {
      return await navigateFromHomeAction({
        route: target,
        payload: safeObject(options.payload),
        silent: options.silent === true,
      });
    } finally {
      setNavigatingAction("");
      renderView(currentContainer);
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
    renderView(currentContainer);

    try {
      return await runHomeQuickAction({
        action: "open-ticket",
        route: "/incidencias",
        payload: {
          ...safeObject(payload),
          ticketId: id,
          incidenciaId: id,
        },
      });
    } finally {
      setOpeningTicketId("");
      renderView(currentContainer);
    }
  }

  async function createIncidencia(draft = {}) {
    setCreating(true);
    renderView(currentContainer);

    try {
      return await runHomeQuickAction({
        action: "create-incidencia",
        route: "/incidencias",
        payload: safeObject(draft),
      });
    } finally {
      setCreating(false);
      renderView(currentContainer);
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

      openHomeWidgetAction: ({ widgetId = "", payload = {} } = {}) =>
        openTicket(widgetId, payload),

      copyHomeWidgetIdAction: ({ widgetId = "" } = {}) =>
        runHomeQuickAction({
          action: "copy-id",
          payload: {
            widgetId,
          },
        }),

      createFromHomeAction: ({ draft = {}, payload = {} } = {}) =>
        createIncidencia(first(draft, payload, {})),
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
      initialized = true;

      ensureBaseState();
      hydrateBestEffort();

      renderView(container);
      bind(container);

      await loadData({
        force: false,
        silent: hasVisibleData(),
        asRefresh: false,
      });

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
