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
   - Lee usuario/rol sólo desde contexto/AppCore/state ya resuelto.
   - Lee colecciones desde homeState raíz y fallback dashboard.
   - Recarga si Home está marcado como loaded pero no hay datos reales.
   - Render inmediato tras sincronizar datos reales.
   - No resuelve slug.
   - No ejecuta Auth guards.
   - No ejecuta Router guards.
   - No crea bridges globales.
   - No emite eventos externos.
   - No crea cache local propia.
   - No usa imports opcionales.
   - No abre modales de otras vistas.
   - No usa Toast directo.
   - No usa /home.
========================================================= */

import {
  ROUTES,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
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

export const HOME_VIEW_VERSION = "home.view.v10";

export const HomeView = (() => {
  "use strict";

  const SOURCE = "views.home";
  const SCOPE = "view:home";

  const DEFAULT_PAGE_SIZE = 5;

  const SENSITIVE_QUERY_RE =
    /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i;

  const ADMIN_ENTITY_RE =
    /(^|[\s._-])(admin|users?|usuarios?|clients?|clientes?|customers?)([\s._-]|$)/i;

  const INCIDENCIAS_ROUTE = safeInternalRoute(
    ROUTES?.incidencias,
    "/incidencias"
  );

  let initialized = false;
  let destroyed = false;
  let bootLoadRequested = false;

  let inflightLoad = null;
  let bindingsCleanup = null;

  let currentContainer = null;
  let currentContext = {};

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

  function isFunction(value) {
    return typeof value === "function";
  }

  function hasKeys(value = {}) {
    return Boolean(isObject(value) && Object.keys(value).length > 0);
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
      .replace(
        /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
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

  function hasSensitiveQuery(value = "") {
    return SENSITIVE_QUERY_RE.test(String(value || ""));
  }

  function pathFromInput(value = "/") {
    try {
      return configRoutePathFromUrlLike(value) || "/";
    } catch {
      return "/";
    }
  }

  function normalizePathname(value = "/") {
    try {
      return configNormalizeRoutePath(value) || "/";
    } catch {
      let path = safeText(value, "/")
        .split("?")[0]
        .split("#")[0]
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");

      if (!path.startsWith("/")) {
        path = `/${path}`;
      }

      if (path.length > 1) {
        path = path.replace(/\/+$/g, "") || "/";
      }

      return path || "/";
    }
  }

  function isBlockedRoute(value = "") {
    try {
      return configIsBlockedRoutePath(value) === true;
    } catch {
      const path = normalizePathname(value).toLowerCase();

      return Boolean(
        path === "/home" ||
          path === "/403" ||
          path === "/404" ||
          path === "/2fa" ||
          path === "/mfa" ||
          path === "/otp" ||
          path.startsWith("/2fa/") ||
          path.startsWith("/mfa/") ||
          path.startsWith("/otp/")
      );
    }
  }

  function safeInternalRoute(route = "", fallback = "") {
    const raw = safeText(route, "");
    const safeFallback = safeText(fallback, "");

    if (!raw) return safeFallback;
    if (!raw.startsWith("/")) return safeFallback;
    if (raw.startsWith("//")) return safeFallback;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return safeFallback;
    if (/[\r\n\t\\]/.test(raw)) return safeFallback;
    if (hasSensitiveQuery(raw)) return safeFallback;

    const normalizedInput = pathFromInput(raw);

    if (!normalizedInput || !normalizedInput.startsWith("/")) {
      return safeFallback;
    }

    if (normalizedInput.startsWith("//")) {
      return safeFallback;
    }

    const hashIndex = normalizedInput.indexOf("#");
    const beforeHash = hashIndex >= 0
      ? normalizedInput.slice(0, hashIndex)
      : normalizedInput;

    const searchIndex = beforeHash.indexOf("?");
    const pathnameRaw = searchIndex >= 0
      ? beforeHash.slice(0, searchIndex)
      : beforeHash;

    const search = searchIndex >= 0
      ? beforeHash.slice(searchIndex)
      : "";

    const pathname = normalizePathname(pathnameRaw);

    if (!pathname || isBlockedRoute(pathname)) {
      return safeFallback;
    }

    if (search && hasSensitiveQuery(search)) {
      return safeFallback;
    }

    return `${pathname}${search}`;
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

  function normalizeRenderContext(candidate = null, context = {}) {
    if (isElement(candidate)) return safeObject(context);

    return {
      ...safeObject(candidate),
      ...safeObject(context),
    };
  }

  function rememberContext(context = {}) {
    const next = safeObject(context);

    if (!hasKeys(next)) return currentContext;

    currentContext = {
      ...currentContext,
      ...next,
    };

    return currentContext;
  }

  function getContainer(candidate = null, context = {}) {
    if (!isBrowser()) return null;
    if (isElement(candidate)) return candidate;

    const ctx = normalizeRenderContext(candidate, context);

    if (isElement(ctx.container)) return ctx.container;
    if (isElement(ctx.host)) return ctx.host;
    if (isElement(ctx.root)) return ctx.root;
    if (isElement(ctx.el)) return ctx.el;
    if (isElement(ctx.renderRoot)) return ctx.renderRoot;
    if (isElement(ctx.renderHost)) return ctx.renderHost;
    if (isElement(ctx.viewContainer)) return ctx.viewContainer;
    if (isElement(ctx.routerViewHost)) return ctx.routerViewHost;

    return (
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

  function readSnapshot(read, ...args) {
    try {
      return isFunction(read) ? sanitizePayload(read(...args)) : null;
    } catch {
      return null;
    }
  }

  function safeCall(fn = null, ...args) {
    try {
      return isFunction(fn) ? fn(...args) : null;
    } catch {
      return null;
    }
  }

  function firstArray(...values) {
    for (const value of values) {
      if (Array.isArray(value) && value.length) {
        return value;
      }
    }

    return [];
  }

  /* =======================================================
     USER / ROLE CONTEXT
  ======================================================= */

  function normalizeRole(value = "") {
    if (Array.isArray(value)) {
      const roles = value.map(normalizeRole).filter(Boolean);

      if (roles.includes("admin")) return "admin";
      if (roles.includes("user")) return "user";

      return "";
    }

    const role = String(value || "").trim().toLowerCase();

    if (role === "admin") return "admin";
    if (role === "user") return "user";

    return "";
  }

  function roleFromAdminFlag(value = {}) {
    const source = safeObject(value);

    if (
      source.admin === true ||
      source.isAdmin === true ||
      source.meta?.admin === true ||
      source.dashboard?.admin === true ||
      source.dashboard?.meta?.admin === true
    ) {
      return "admin";
    }

    return "";
  }

  function extractRoleFromData(value = {}) {
    const source = safeObject(value);

    return (
      normalizeRole(
        first(
          source.role,
          source.rol,
          source.userRole,
          source.roles,
          source.meta?.role,
          source.meta?.rol,
          source.meta?.roles,
          source.dashboard?.role,
          source.dashboard?.rol,
          source.dashboard?.roles,
          source.dashboard?.meta?.role,
          source.dashboard?.meta?.rol,
          source.dashboard?.meta?.roles,
          ""
        )
      ) ||
      roleFromAdminFlag(source) ||
      ""
    );
  }

  function getContextCore() {
    const ctx = safeObject(currentContext);

    return first(
      ctx.AppCore,
      ctx.appCore,
      ctx.core,
      null
    );
  }

  function getCoreState() {
    const core = getContextCore();
    return safeObject(core?.state);
  }

  function getCurrentUser() {
    const ctx = safeObject(currentContext);
    const dashboard = safeObject(homeState.dashboard);
    const core = getContextCore();
    const coreState = getCoreState();

    return safeObject(
      first(
        ctx.user,
        ctx.currentUser,
        ctx.authUser,
        ctx.sessionUser,
        ctx.session?.user,
        ctx.sessionData?.user,

        safeCall(core?.getCurrentUser?.bind?.(core) || core?.getCurrentUser),
        coreState.user,
        coreState.currentUser,
        coreState.authUser,
        coreState.sessionUser,
        coreState.session?.user,
        coreState.sessionData?.user,

        homeState.user,
        dashboard.user,
        dashboard.currentUser,
        {}
      )
    );
  }

  function getContextRole() {
    const ctx = safeObject(currentContext);
    const coreState = getCoreState();
    const user = getCurrentUser();

    return normalizeRole(
      first(
        ctx.role,
        ctx.rol,
        ctx.userRole,
        ctx.roles,

        user.role,
        user.rol,
        user.roles,

        coreState.role,
        coreState.rol,
        coreState.userRole,
        coreState.roles,

        ""
      )
    );
  }

  function getStoredRole() {
    return (
      extractRoleFromData(homeState) ||
      extractRoleFromData(homeState.dashboard) ||
      ""
    );
  }

  function getCurrentRole() {
    return getContextRole() || getStoredRole() || "user";
  }

  function isAdmin() {
    return getCurrentRole() === "admin";
  }

  function getPayloadRole(payload = {}, source = {}) {
    return extractRoleFromData(payload) || extractRoleFromData(source);
  }

  function getPublicUserSnapshot(user = getCurrentUser()) {
    if (!hasKeys(user)) return null;

    const displayName =
      safeText(
        first(
          user.displayName,
          user.fullName,
          user.name,
          user.nombre,
          user.profile?.displayName,
          user.profile?.fullName,
          user.username,
          user.userName
        ),
        ""
      ) || null;

    return {
      hasId: Boolean(user.id || user.userId),
      username: safeText(user.username || user.userName, "") || null,
      slug: safeText(user.slug || user.lookup?.slug || user.profile?.slug, "") || null,
      displayName,
      name: displayName,
      role: getCurrentRole(),
    };
  }

  function getTemplateUser() {
    return safeObject(getPublicUserSnapshot());
  }

  /* =======================================================
     ROLE SCOPING
  ======================================================= */

  function isAdminEntityValue(value = "") {
    return ADMIN_ENTITY_RE.test(String(value || "").toLowerCase());
  }

  function stripAdminSummaryForUser(summary = {}, admin = isAdmin()) {
    const source = safeObject(summary);

    if (admin || !hasKeys(source)) return source;

    return Object.fromEntries(
      Object.entries(source).filter(([key]) => !isAdminEntityValue(key))
    );
  }

  function filterWidgetsForRole(widgets = [], admin = isAdmin()) {
    const rows = safeArray(widgets);

    if (admin) return rows;

    return rows.filter((widget) => {
      const item = safeObject(widget);

      const requiredRole = normalizeRole(
        first(
          item.requiredRole,
          item.role,
          item.meta?.requiredRole,
          item.meta?.role,
          item.roles,
          item.meta?.roles,
          ""
        )
      );

      if (requiredRole === "admin") return false;

      const identity = safeText(
        first(
          item.entity,
          item.resource,
          item.collection,
          item.type,
          item.kind,
          item.widgetId,
          item.id,
          item.name,
          ""
        ),
        ""
      );

      return !isAdminEntityValue(identity);
    });
  }

  function filterActivityForRole(items = [], admin = isAdmin()) {
    const rows = normalizeHomeActivityList(items);

    if (admin) return rows;

    return rows.filter((item) => {
      const row = safeObject(item);

      const identity = safeText(
        first(
          row.type,
          row.kind,
          row.category,
          row.entity,
          row.resource,
          row.collection,
          row.targetType,
          row.meta?.type,
          row.meta?.entity,
          ""
        ),
        ""
      );

      return !isAdminEntityValue(identity);
    });
  }

  function stripAdminDashboardForRole(dashboard = {}, admin = isAdmin()) {
    const source = safeObject(dashboard);

    if (!hasKeys(source)) return {};
    if (admin) return source;

    const activity = filterActivityForRole(
      first(
        source.activity,
        source.activities,
        source.recent,
        source.recentActivity,
        []
      ),
      false
    );

    return {
      ...source,

      users: [],
      usuarios: [],

      clients: [],
      clientes: [],
      customers: [],

      summary: stripAdminSummaryForUser(source.summary, false),
      widgets: filterWidgetsForRole(source.widgets, false),

      activity,
      activities: activity,
      recent: activity,
      recentActivity: activity,

      meta: {
        ...safeObject(source.meta),
        role: "user",
        admin: false,
      },
    };
  }

  function dashboardRoleMismatch(payload = {}, source = {}, effectiveRole = getCurrentRole()) {
    const contextRole = getContextRole();
    const payloadRole = getPayloadRole(payload, source);

    if (!payloadRole) return false;

    if (contextRole) {
      return payloadRole !== contextRole;
    }

    const storedRole = getStoredRole();

    return Boolean(storedRole && payloadRole !== effectiveRole);
  }

  /* =======================================================
     STATE SHAPE
  ======================================================= */

  function ensureBaseState() {
    const admin = isAdmin();

    homeState.page = Math.max(1, safeNumber(homeState.page, 1));
    homeState.pageSize = Math.max(
      1,
      safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE)
    );

    homeState.dashboard = stripAdminDashboardForRole(
      safeObject(homeState.dashboard),
      admin
    );

    homeState.summary = stripAdminSummaryForUser(
      safeObject(homeState.summary),
      admin
    );

    homeState.widgets = filterWidgetsForRole(
      safeArray(homeState.widgets),
      admin
    );

    homeState.tickets = safeArray(homeState.tickets);
    homeState.incidencias = safeArray(homeState.incidencias);

    homeState.invoices = safeArray(homeState.invoices);
    homeState.facturas = safeArray(homeState.facturas);

    homeState.users = admin ? safeArray(homeState.users) : [];
    homeState.usuarios = admin ? safeArray(homeState.usuarios) : [];

    homeState.clients = admin ? safeArray(homeState.clients) : [];
    homeState.clientes = admin ? safeArray(homeState.clientes) : [];
    homeState.customers = admin ? safeArray(homeState.customers) : [];

    homeState.activity = filterActivityForRole(homeState.activity, admin);
    homeState.activities = filterActivityForRole(homeState.activities, admin);
    homeState.recent = filterActivityForRole(homeState.recent, admin);
    homeState.recentActivity = filterActivityForRole(homeState.recentActivity, admin);

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

  function normalizeDashboardPayload(payload = {}, options = {}) {
    const opts = safeObject(options);

    const source = safeObject(
      first(
        payload?.dashboard,
        payload?.data?.dashboard,
        payload?.payload?.dashboard,
        payload?.result?.dashboard,
        payload
      )
    );

    if (!hasKeys(source)) {
      return null;
    }

    const contextRole = getContextRole();
    const payloadRole = getPayloadRole(payload, source);
    const trustedPayloadRole = opts.trustPayloadRole === true ? payloadRole : "";
    const role = contextRole || trustedPayloadRole || getCurrentRole() || "user";
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

    const roleScopedDashboard = stripAdminDashboardForRole(
      {
        ...dashboard,
        role,
        admin,
        requestId,
        updatedAt: lastSyncAt,
        lastSyncAt,
        meta: {
          ...safeObject(dashboard.meta),
          role,
          admin,
          requestId,
          updatedAt: lastSyncAt,
          lastSyncAt,
        },
      },
      admin
    );

    return {
      dashboard: roleScopedDashboard,
      requestId,
      lastSyncAt,
      role,
      admin,
      roleMismatch: dashboardRoleMismatch(payload, source, role),
    };
  }

  function applyDashboardPayload(payload = {}, options = {}) {
    const opts = safeObject(options);

    const normalized = normalizeDashboardPayload(payload, {
      trustPayloadRole: opts.trustPayloadRole === true,
    });

    if (!normalized || !hasKeys(normalized.dashboard)) {
      return null;
    }

    const storedRole = getStoredRole();
    const replace =
      opts.replace === true ||
      normalized.roleMismatch ||
      !normalized.admin ||
      Boolean(storedRole && storedRole !== normalized.role);

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
      const cached = hydrateHomeFromCache();

      if (!cached?.hydrated) return false;

      const normalized = applyDashboardPayload(cached.dashboard || cached, {
        preserveExisting: true,
        trustPayloadRole: false,
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
    return normalizeHomeTickets(
      firstArray(
        homeState.tickets,
        homeState.incidencias,

        homeState.dashboard?.tickets,
        homeState.dashboard?.incidencias,

        homeState.dashboard?.collections?.tickets,
        homeState.dashboard?.collections?.incidencias
      )
    );
  }

  function getInvoices() {
    return normalizeHomeInvoices(
      firstArray(
        homeState.invoices,
        homeState.facturas,

        homeState.dashboard?.invoices,
        homeState.dashboard?.facturas,

        homeState.dashboard?.collections?.invoices,
        homeState.dashboard?.collections?.facturas
      )
    );
  }

  function getUsers() {
    if (!isAdmin()) return [];

    return normalizeHomeUsers(
      firstArray(
        homeState.users,
        homeState.usuarios,

        homeState.dashboard?.users,
        homeState.dashboard?.usuarios,

        homeState.dashboard?.collections?.users,
        homeState.dashboard?.collections?.usuarios
      )
    );
  }

  function getClients() {
    if (!isAdmin()) return [];

    return normalizeHomeClients(
      firstArray(
        homeState.clients,
        homeState.clientes,
        homeState.customers,

        homeState.dashboard?.clients,
        homeState.dashboard?.clientes,
        homeState.dashboard?.customers,

        homeState.dashboard?.collections?.clients,
        homeState.dashboard?.collections?.clientes,
        homeState.dashboard?.collections?.customers
      )
    );
  }

  function getSummary() {
    const summary = hasKeys(homeState.summary)
      ? homeState.summary
      : homeState.dashboard?.summary;

    return stripAdminSummaryForUser(summary, isAdmin());
  }

  function getWidgets() {
    const widgets = firstArray(
      homeState.widgets,
      homeState.cards,
      homeState.kpis,
      homeState.blocks,

      homeState.dashboard?.widgets,
      homeState.dashboard?.cards,
      homeState.dashboard?.kpis,
      homeState.dashboard?.blocks
    );

    return filterWidgetsForRole(widgets, isAdmin());
  }

  function getActivity() {
    const current = filterActivityForRole(
      firstArray(
        homeState.activity,
        homeState.activities,
        homeState.recent,
        homeState.recentActivity,

        homeState.dashboard?.activity,
        homeState.dashboard?.activities,
        homeState.dashboard?.recent,
        homeState.dashboard?.recentActivity
      ),
      isAdmin()
    );

    if (current.length) return current;

    return filterActivityForRole(
      buildHomeActivityFromCollections({
        tickets: getTickets(),
        invoices: getInvoices(),
        users: getUsers(),
        clients: getClients(),
      }),
      isAdmin()
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
      const pageSize = Math.max(
        1,
        safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE)
      );

      const total = rows.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(
        Math.max(1, safeNumber(homeState.page, 1)),
        totalPages
      );

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
    const summary = getSummary();
    const widgets = getWidgets();

    return normalizeHomeDashboard({
      ...stripAdminDashboardForRole(homeState.dashboard, admin),

      role,
      admin,

      summary,
      widgets,

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
        lastSyncAt: homeState.lastSyncAt || "",
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
    const summary = getSummary();
    const widgets = getWidgets();

    return buildHomeTemplatePayload({
      user: getTemplateUser(),
      role,

      dashboard,

      summary,
      widgets,

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
        summary,

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

  function hasVisibleData() {
    return Boolean(
      getTickets().length ||
        getInvoices().length ||
        (isAdmin() && getUsers().length) ||
        (isAdmin() && getClients().length) ||
        getActivity().length ||
        getWidgets().length ||
        hasKeys(getSummary()) ||
        hasKeys(stripAdminDashboardForRole(homeState.dashboard, isAdmin()))
    );
  }

  function hasCollectionData() {
    return Boolean(
      getTickets().length ||
        getInvoices().length ||
        (isAdmin() && getUsers().length) ||
        (isAdmin() && getClients().length)
    );
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
      setViewBusy(container, false);
    } catch {
      try {
        container.textContent = "";
        container.appendChild(node);
        setViewBusy(container, false);
      } catch {
        return null;
      }
    }

    return node;
  }

  function renderView(container = currentContainer) {
    if (destroyed || !isElement(container)) return null;

    const seq = nextRenderSeq();
    const busy = Boolean(homeState.loading || homeState.refreshing);

    ensureBaseState();

    try {
      setViewBusy(container, busy);

      const node = htmlToElement(buildHtml());

      if (!node) {
        throw new Error("HOME_VIEW_NODE_EMPTY");
      }

      container.replaceChildren(node);
      currentContainer = container;

      setViewBusy(container, busy);

      return isCurrentRender(seq) ? node : null;
    } catch (error) {
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
    const context = normalizeRenderContext(args[0], args[1]);
    rememberContext(context);

    const container = getContainer(args[0], context);

    if (!container) return null;

    destroyed = false;
    initialized = true;
    currentContainer = container;

    ensureBaseState();

    if (!homeState.hydrated && !hasCollectionData()) {
      hydrateBestEffort();
    }

    renderAndBind(container);

    const needsBootLoad = !bootLoadRequested;
    const needsDataLoad = !homeState.loaded || !hasCollectionData();

    if ((needsBootLoad || needsDataLoad) && !inflightLoad) {
      bootLoadRequested = true;

      void loadData({
        force: homeState.loaded === true || needsBootLoad,
        asRefresh: false,
      });
    }

    return api;
  }

  function rerender() {
    return renderAndBind(currentContainer);
  }

  /* =======================================================
     DATA
  ======================================================= */

  async function loadData(options = {}) {
    if (destroyed) return false;

    const opts = safeObject(options);
    const forceLoad = opts.force === true || opts.asRefresh === true;

    if (inflightLoad && !forceLoad) return inflightLoad;

    const seq = nextLoadSeq();
    const refresh = opts.asRefresh === true;

    let request;

    request = (async () => {
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
          replace: true,
          preserveExisting: false,
          trustPayloadRole: true,
        });

        if (normalized && isCurrentLoad(seq)) {
          setLoading(false);
          setRefreshing(false);
          renderAndBind(currentContainer);
        }

        return Boolean(normalized);
      } catch (error) {
        if (!isCurrentLoad(seq)) return false;

        setError(safeErrorMessage(error));

        return false;
      } finally {
        if (isCurrentLoad(seq)) {
          setLoading(false);
          setRefreshing(false);

          renderAndBind(currentContainer);
        }

        if (inflightLoad === request) {
          inflightLoad = null;
        }
      }
    })();

    inflightLoad = request;

    return request;
  }

  /* =======================================================
     ACTIONS
  ======================================================= */

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
    const opts = safeObject(options);
    const target = safeInternalRoute(route, "");

    if (!target) return false;

    setNavigatingAction(target);
    rerender();

    try {
      return await navigateFromHomeAction({
        route: target,
        payload: safeObject(opts.payload),
        silent: opts.silent === true,
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
    const source = safeObject(payload);
    const id = safeText(
      first(ticketId, source.ticketId, source.incidenciaId, ""),
      ""
    );

    if (!id) return null;

    setOpeningTicketId(id);
    setSelectedTicketId(id);
    rerender();

    try {
      return await navigateTo(INCIDENCIAS_ROUTE, {
        payload: {
          ...source,
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
    const opts = safeObject(options);

    setCreating(true);
    rerender();

    try {
      return await navigateTo(INCIDENCIAS_ROUTE, {
        payload: safeObject(draft),
        silent: opts.silent === true,
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
      if (typeof bindingsCleanup === "function") {
        bindingsCleanup();
      } else if (
        bindingsCleanup &&
        typeof bindingsCleanup.cleanup === "function"
      ) {
        bindingsCleanup.cleanup();
      }
    } catch {
      // noop
    }

    bindingsCleanup = null;
  }

  function bind(container = currentContainer) {
    cleanupBindings();

    if (destroyed || !isElement(container)) return false;

    try {
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

        openHomeWidgetAction: ({
          widgetId = "",
          payload = {},
          navigate = true,
          silent = false,
        } = {}) =>
          actionOpenHomeWidget({
            widgetId,
            payload,
            navigate,
            silent,
          }),

        copyHomeWidgetIdAction,

        createFromHomeAction: ({ draft = {}, payload = {}, silent = false } = {}) =>
          createIncidencia(hasKeys(draft) ? draft : payload, {
            silent,
          }),

        goToPage,
        goPrevPage,
        goNextPage,
        changePageSize,
      });

      return true;
    } catch {
      bindingsCleanup = null;
      return false;
    }
  }

  /* =======================================================
     LIFECYCLE
  ======================================================= */

  function init(...args) {
    destroyed = false;

    const rendered = render(...args);

    return rendered || api;
  }

  function mount(...args) {
    return init(...args);
  }

  async function reload(options = {}) {
    const opts = safeObject(options);

    await loadData({
      ...opts,
      force: opts.force === true,
      asRefresh: opts.asRefresh === true,
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
    bootLoadRequested = false;

    nextRenderSeq();
    nextLoadSeq();

    cleanupBindings();

    setLoading(false);
    setRefreshing(false);
    setCreating(false);
    setOpeningTicketId("");
    setSelectedTicketId("");
    setNavigatingAction("");

    inflightLoad = null;
    currentContainer = null;
    currentContext = {};

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

      apiSnapshot: readSnapshot(getHomeApiSnapshot),
      storeSnapshot: readSnapshot(getHomeStoreSnapshot),
      bindingsSnapshot: readSnapshot(getHomeBindingsSnapshot, SCOPE),
      actionsSnapshot: readSnapshot(getHomeActionsSnapshot),
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
      hasInflightLoad: Boolean(inflightLoad),
      bootLoadRequested,

      contract: {
        controllerOnly: true,
        renderDelegatedToTemplate: true,
        apiDelegated: true,
        stateDelegated: true,
        storeDelegated: true,
        modelDelegated: true,
        bindingsDelegated: true,
        actionsDelegated: true,

        readsUserFromResolvedContext: true,
        readsCollectionsFromDashboardFallback: true,
        reloadsWhenLoadedButEmpty: true,
        immediateRenderAfterDashboardSync: true,

        noSlugResolution: true,
        noAuthGuards: true,
        noRouterGuards: true,
        noGlobalBridge: true,
        noExternalEvents: true,
        noCrossViewModals: true,
        noToastDirect: true,
        noHomeRoute: true,

        userScopedCollections: true,
        stripsAdminDataForUser: true,
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
    scheduleRender: rerender,

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
    getSummary,
    getWidgets,

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
