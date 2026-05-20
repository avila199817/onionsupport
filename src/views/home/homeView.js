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
   - Home distinto para admin/user.
   - User no arrastra usuarios/clientes de cache admin.
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
   - Sin Toast directo.
   - Sin /home.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ROUTES,
} from "../../core/config.js";

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
  buildHomeTemplatePayload,
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
} from "./home.utils.js";

export const HOME_VIEW_VERSION = "home.view.v4";

export const HomeView = (() => {
  "use strict";

  const SOURCE = "views.home";
  const SCOPE = "view:home";

  const HOME_ROUTE = ROUTES.home || ROUTES.root || "/";
  const INCIDENCIAS_ROUTE = ROUTES.incidencias || "/incidencias";

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
    return Boolean(value && typeof value === "object" && value.nodeType === 1);
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

  function redact(value = "") {
    return String(value || "")
      .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
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

  function normalizeRole(value = "") {
    if (Array.isArray(value)) {
      const roles = value
        .map(normalizeRole)
        .filter(Boolean);

      if (roles.includes("admin")) return "admin";
      if (roles.includes("user")) return "user";

      return "";
    }

    const role = String(value || "").toLowerCase();

    if (role === "admin") return "admin";
    if (role === "user") return "user";

    return "";
  }

  function getCurrentRole() {
    const state = getState();
    const user = getCurrentUser();

    return (
      normalizeRole(
        first(
          state.role,
          state.rol,
          state.userRole,
          state.roles,
          user.role,
          user.rol,
          user.roles,
          ""
        )
      ) || "user"
    );
  }

  function isAdmin() {
    return getCurrentRole() === "admin";
  }

  function getPublicUserSnapshot(user = getCurrentUser()) {
    if (!hasKeys(user)) return null;

    return {
      hasId: Boolean(user.id || user.userId),
      username: safeText(user.username || user.userName, "") || null,
      slug: safeText(user.slug || user.lookup?.slug || user.profile?.slug, "") || null,
      displayName:
        safeText(
          first(
            user.displayName,
            user.fullName,
            user.name,
            user.nombre,
            user.profile?.displayName,
            user.profile?.fullName,
            user.username
          ),
          ""
        ) || null,
      role: getCurrentRole(),
    };
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
      document.querySelector("[data-router-view-host='true']") ||
      document.getElementById("view-container") ||
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
    return redact(
      safeText(
        first(
          error?.response?.data?.message,
          error?.data?.message,
          error?.message,
          "No se pudo cargar el Home."
        ),
        "No se pudo cargar el Home."
      )
    );
  }

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function hasSensitiveQuery(value = "") {
    return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=/i.test(
      String(value || "")
    );
  }

  function safeHomeRoute(route = "", fallback = "") {
    const raw = safeText(route, "");

    if (!raw) return fallback;
    if (!raw.startsWith("/")) return fallback;
    if (raw.startsWith("//")) return fallback;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
    if (/[\r\n\t\\]/.test(raw)) return fallback;
    if (hasSensitiveQuery(raw)) return fallback;

    const normalized = raw.replace(/\/{2,}/g, "/") || fallback;
    const canonical = normalized.split("?")[0].split("#")[0] || HOME_ROUTE;

    if (canonical === "/home") return fallback;

    return normalized;
  }

  function dashboardRoleMismatch(raw = {}) {
    const currentRole = getCurrentRole();
    const data = safeObject(raw);

    const sourceRole = safeText(
      first(
        data.role,
        data.meta?.role,
        data.dashboard?.role,
        data.dashboard?.meta?.role,
        ""
      ),
      ""
    ).toLowerCase();

    if (!sourceRole) return false;

    return sourceRole !== currentRole;
  }

  function stripAdminCollectionsForUser(dashboard = {}) {
    const source = safeObject(dashboard);

    if (isAdmin()) return source;

    return {
      ...source,

      users: [],
      usuarios: [],

      clients: [],
      clientes: [],
      customers: [],

      meta: {
        ...safeObject(source.meta),
        role: "user",
        admin: false,
      },
    };
  }

  /* =======================================================
     STATE SHAPE
  ======================================================= */

  function ensureBaseState() {
    homeState.page = Math.max(1, safeNumber(homeState.page, 1));
    homeState.pageSize = Math.max(1, safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE));

    homeState.dashboard = safeObject(homeState.dashboard);
    homeState.summary = safeObject(homeState.summary);

    homeState.widgets = safeArray(homeState.widgets);

    homeState.tickets = safeArray(homeState.tickets);
    homeState.invoices = safeArray(homeState.invoices);

    homeState.users = isAdmin() ? safeArray(homeState.users) : [];
    homeState.clients = isAdmin() ? safeArray(homeState.clients) : [];

    homeState.activity = safeArray(homeState.activity);

    homeState.loading = Boolean(homeState.loading);
    homeState.refreshing = Boolean(homeState.refreshing);
    homeState.loaded = Boolean(homeState.loaded);
    homeState.hydrated = Boolean(homeState.hydrated);

    homeState.error = redact(safeText(homeState.error, ""));

    homeState.openingTicketId = safeText(homeState.openingTicketId, "");
    homeState.selectedTicketId = safeText(homeState.selectedTicketId, "");
    homeState.navigatingAction = safeText(homeState.navigatingAction, "");

    return homeState;
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

    const role = getCurrentRole();
    const admin = role === "admin";

    const dashboard = normalizeHomeDashboard({
      ...source,
      role,
      admin,
      meta: {
        ...safeObject(source.meta),
        role,
        admin,
      },
    });

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

    const roleScopedDashboard = stripAdminCollectionsForUser({
      ...dashboard,
      role,
      admin,
      requestId,
      updatedAt: lastSyncAt,
      meta: {
        ...safeObject(dashboard.meta),
        role,
        admin,
        requestId,
        updatedAt: lastSyncAt,
      },
    });

    return {
      dashboard: roleScopedDashboard,
      requestId,
      lastSyncAt,
      roleMismatch: dashboardRoleMismatch(source),
    };
  }

  function applyDashboardPayload(payload = {}, options = {}) {
    const opts = safeObject(options);
    const normalized = normalizeDashboardPayload(payload);

    if (!hasKeys(normalized.dashboard)) {
      return null;
    }

    const currentIsUser = !isAdmin();
    const replace = opts.replace === true || normalized.roleMismatch || currentIsUser;

    syncHomeStateFromDashboard(normalized.dashboard, {
      replace,
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
        preserveExisting: replace ? false : opts.preserveExisting !== false,
        replace,
      }
    );

    ensureBaseState();
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
     DATA READ
  ======================================================= */

  function getTickets() {
    return normalizeHomeTickets(homeState.tickets);
  }

  function getInvoices() {
    return normalizeHomeInvoices(homeState.invoices);
  }

  function getUsers() {
    return isAdmin() ? normalizeHomeUsers(homeState.users) : [];
  }

  function getClients() {
    return isAdmin() ? normalizeHomeClients(homeState.clients) : [];
  }

  function filterActivityForRole(items = []) {
    const rows = normalizeHomeActivityList(items);

    if (isAdmin()) return rows;

    return rows.filter((item) => {
      const type = safeText(first(item.type, item.kind, item.category), "").toLowerCase();
      return type !== "client" && type !== "cliente" && type !== "user" && type !== "usuario";
    });
  }

  function getActivity() {
    const current = filterActivityForRole(homeState.activity);

    if (current.length) return current;

    return filterActivityForRole(
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
    const role = getCurrentRole();
    const admin = role === "admin";

    const tickets = getTickets();
    const invoices = getInvoices();
    const users = admin ? getUsers() : [];
    const clients = admin ? getClients() : [];
    const activity = getActivity();

    return normalizeHomeDashboard({
      ...stripAdminCollectionsForUser(homeState.dashboard),

      role,
      admin,

      summary: safeObject(homeState.summary),
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

      requestId: homeState.requestId || "",
      updatedAt: homeState.lastSyncAt || "",
      lastSyncAt: homeState.lastSyncAt || "",

      meta: {
        ...safeObject(homeState.meta),
        role,
        admin,
        requestId: homeState.requestId || "",
        updatedAt: homeState.lastSyncAt || "",
      },
    });
  }

  function buildTemplatePayload() {
    ensureBaseState();

    const role = getCurrentRole();
    const admin = role === "admin";

    const tickets = getTickets();
    const invoices = getInvoices();
    const users = admin ? getUsers() : [];
    const clients = admin ? getClients() : [];
    const activity = getActivity();
    const dashboard = buildDashboardForTemplate();
    const pagination = getPagination(tickets);

    return buildHomeTemplatePayload({
      user: getCurrentUser(),
      role,

      dashboard,

      summary: safeObject(homeState.summary),
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

      requestId: homeState.requestId || "",
      lastUpdatedAt: homeState.lastSyncAt || "",

      state: {
        ...getHomeStateSnapshot(),

        role,
        admin,

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
    });
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

    const message = safeErrorMessage(error);

    const node =
      htmlToElement(renderHomeErrorState(message)) ||
      htmlToElement(`
        <section class="panel-content home-view home-view--error" data-view="home">
          <div class="content-wrapper home-view-wrapper">
            <div class="home-error-fallback" role="alert">
              <h1>No se pudo cargar el Home</h1>
              <p>${escapeHtml(message)}</p>
            </div>
          </div>
        </section>
      `);

    if (!node) return null;

    try {
      container.replaceChildren(node);
    } catch {
      try {
        container.textContent = "";
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

  function renderAndBind(container = currentContainer) {
    const node = renderView(container);

    if (node && isElement(container)) {
      bind(container);
    }

    return node;
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

    renderAndBind(container);

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
        (isAdmin() && getUsers().length) ||
        (isAdmin() && getClients().length) ||
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

      renderAndBind(currentContainer);

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
          replace: true,
          preserveExisting: false,
        });

        return Boolean(normalized);
      } catch (error) {
        if (!isCurrentLoad(seq)) return false;

        const message = safeErrorMessage(error);

        setError(message);

        return false;
      } finally {
        if (isCurrentLoad(seq)) {
          setLoading(false);
          setRefreshing(false);

          renderAndBind(currentContainer);
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
    return renderAndBind(currentContainer);
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
    const target = safeHomeRoute(route, "");

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
        route: INCIDENCIAS_ROUTE,
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

  async function createIncidencia(draft = {}, options = {}) {
    setCreating(true);
    rerender();

    try {
      return await navigateFromHomeAction({
        route: INCIDENCIAS_ROUTE,
        payload: safeObject(draft),
        silent: options.silent === true,
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
        navigateTo(route, {
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

      user: getPublicUserSnapshot(),
      role: getCurrentRole(),
      admin: isAdmin(),

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

      role: getCurrentRole(),
      admin: isAdmin(),

      loaded: Boolean(homeState.loaded),
      hydrated: Boolean(homeState.hydrated),
      loading: Boolean(homeState.loading),
      refreshing: Boolean(homeState.refreshing),

      error: redact(homeState.error || ""),

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

      policy: {
        controllerOnly: true,

        renderDelegatedToTemplate: true,
        apiDelegated: true,
        stateDelegated: true,
        storeDelegated: true,
        modelDelegated: true,
        bindingsDelegated: true,
        actionsDelegated: true,

        noRouteValidation: true,
        noSlugResolution: true,
        noAuthGuards: true,
        noRouterGuards: true,
        noGlobalBridge: true,
        noExternalEvents: true,
        noOwnLocalCache: true,
        noOptionalImports: true,
        noCrossViewModals: true,
        noToastDirect: true,

        homeInternalPath: HOME_ROUTE,
        noHomeRoute: true,

        userDoesNotCarryAdminUsersClients: true,
        rebindsAfterEveryRender: true,

        snapshotRedacted: true,
      },
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

    getDashboard: () => buildDashboardForTemplate(),
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
