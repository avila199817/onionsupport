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
   - Detalle de incidencia abre modal sin navegar.
   - Home distinto para admin/user.
   - User no arrastra usuarios/clientes de cache admin.
   - Renderiza dentro del host recibido por Router.
   - Devuelve API/controller, no el contenedor padre.
   - Usuario/rol/avatar salen del mismo view-model canónico del sidebar.
   - Lee colecciones desde homeState raíz y fallback dashboard.
   - Recarga si Home está marcado como loaded pero no hay datos reales.
   - Render único y estable tras sincronizar datos reales.
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
   - No expone health/server/ready/ping.
========================================================= */

import {
  ROUTES,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import * as CoreModule from "../../core/index.js";
import * as AuthModule from "../../features/auth/index.js";

import { getSidebarUser } from "../../ui/sidebar/user.js";

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
  runHomeQuickAction as actionRunHomeQuickAction,
  openHomeTicketDetailAction as actionOpenHomeTicketDetail,
  closeHomeTicketDetailAction as actionCloseHomeTicketDetail,
  reduceHomeActionState as actionReduceHomeActionState,
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
  sanitizePayload,
} from "./home.utils.js";

export const HOME_VIEW_VERSION = "home.view.v13";

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

      if (!path.startsWith("/")) path = `/${path}`;
      if (path.length > 1) path = path.replace(/\/+$/g, "") || "/";

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

    if (!normalizedInput || !normalizedInput.startsWith("/")) return safeFallback;
    if (normalizedInput.startsWith("//")) return safeFallback;

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

    if (!pathname || isBlockedRoute(pathname)) return safeFallback;
    if (search && hasSensitiveQuery(search)) return safeFallback;

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
      if (Array.isArray(value) && value.length) return value;
    }

    return [];
  }

  function hasOwn(value = {}, key = "") {
    return Object.prototype.hasOwnProperty.call(safeObject(value), key);
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
      CoreModule.AppCore,
      CoreModule.appCore,
      CoreModule.Core,
      CoreModule.core,
      CoreModule.default,
      null
    );
  }

  function getContextAuth() {
    const ctx = safeObject(currentContext);

    return first(
      ctx.Auth,
      ctx.auth,
      AuthModule.Auth,
      AuthModule.auth,
      AuthModule.default,
      null
    );
  }

  function getCoreState() {
    const core = getContextCore();
    return safeObject(core?.state);
  }

  function getResolvedSidebarUser() {
    const ctx = safeObject(currentContext);
    const core = getContextCore();
    const auth = getContextAuth();
    const coreState = getCoreState();
    const dashboard = safeObject(homeState.dashboard);

    const directUser = first(
      ctx.sidebarUser,
      ctx.sidebar?.user,
      ctx.layout?.sidebarUser,
      ctx.context?.sidebarUser,
      ctx.context?.user,

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
      coreState.auth?.user,

      homeState.sidebarUser,
      homeState.user,

      dashboard.sidebarUser,
      dashboard.user,
      dashboard.currentUser,

      null
    );

    return safeObject(
      safeCall(getSidebarUser, {
        ...ctx,

        AppCore: core,
        Auth: auth,

        user: directUser,
        currentUser: directUser,

        profile: first(
          ctx.profile,
          directUser?.profile,
          coreState.profile,
          coreState.user?.profile,
          coreState.currentUser?.profile,
          dashboard.profile,
          dashboard.user?.profile,
          null
        ),

        media: first(
          ctx.media,
          directUser?.media,
          coreState.media,
          coreState.user?.media,
          coreState.currentUser?.media,
          dashboard.media,
          dashboard.user?.media,
          null
        ),

        account: first(
          ctx.account,
          directUser?.account,
          coreState.account,
          dashboard.account,
          null
        ),

        me: first(
          ctx.me,
          coreState.me,
          dashboard.me,
          null
        ),

        role: first(
          ctx.role,
          ctx.rol,
          ctx.userRole,
          directUser?.role,
          directUser?.rol,
          coreState.role,
          coreState.rol,
          dashboard.role,
          dashboard.rol,
          null
        ),

        roles: first(
          ctx.roles,
          directUser?.roles,
          coreState.roles,
          dashboard.roles,
          null
        ),
      })
    );
  }

  function getCurrentUser() {
    const sidebarUser = getResolvedSidebarUser();

    if (sidebarUser.hasUser === true) {
      return sidebarUser;
    }

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
    const sidebarUser = getResolvedSidebarUser();
    const user = getCurrentUser();

    return normalizeRole(
      first(
        ctx.role,
        ctx.rol,
        ctx.userRole,
        ctx.roles,

        sidebarUser.role,
        sidebarUser.rol,
        sidebarUser.roles,

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
    const sidebarUser = getResolvedSidebarUser();
    const source = sidebarUser.hasUser === true
      ? sidebarUser
      : safeObject(user);

    if (!hasKeys(source)) return null;

    const displayName =
      safeText(
        first(
          source.displayName,
          source.fullName,
          source.name,
          source.nombre,
          source.profile?.displayName,
          source.profile?.fullName,
          source.username,
          source.userName
        ),
        ""
      ) || null;

    const role = normalizeRole(
      first(
        source.role,
        source.rol,
        source.roles,
        getCurrentRole()
      )
    ) || "user";

    const avatarUrl = safeText(
      first(
        source.avatarUrl,
        source.avatar,
        source.photoUrl,
        source.photoURL,
        source.picture,
        source.pictureUrl,
        source.image,
        source.imageUrl,
        source.foto,
        source.fotoUrl,
        source.imagen,
        source.imagenUrl,
        ""
      ),
      ""
    );

    const initials = safeText(
      first(
        source.initials,
        source.iniciales,
        displayName
          ? displayName
              .split(/\s+/)
              .filter(Boolean)
              .map((part, index, parts) =>
                index === 0 || index === parts.length - 1 ? part[0] : ""
              )
              .join("")
              .slice(0, 2)
              .toUpperCase()
          : ""
      ),
      "U"
    )
      .slice(0, 3)
      .toUpperCase();

    const roleLabel = safeText(
      first(
        source.roleLabel,
        role === "admin" ? "Administrador" : "Estándar"
      ),
      role === "admin" ? "Administrador" : "Estándar"
    );

    return {
      hasUser: Boolean(
        source.hasUser === true ||
          source.id ||
          source.userId ||
          source.uid ||
          source.sub ||
          source.username ||
          source.userName ||
          source.slug ||
          displayName
      ),

      hasId: Boolean(source.id || source.userId),

      id: safeText(source.id, "") || null,
      userId: safeText(source.userId || source.id, "") || null,

      username: safeText(source.username || source.userName, "") || null,
      slug: safeText(source.slug || source.lookup?.slug || source.profile?.slug, "") || null,

      displayName,
      name: displayName,
      fullName: displayName,

      hasAvatar: Boolean(avatarUrl),
      avatarUrl,
      avatar: avatarUrl,
      photoUrl: avatarUrl,
      photoURL: avatarUrl,
      picture: avatarUrl,
      pictureUrl: avatarUrl,
      image: avatarUrl,
      imageUrl: avatarUrl,
      foto: avatarUrl,
      fotoUrl: avatarUrl,
      imagen: avatarUrl,
      imagenUrl: avatarUrl,

      initials,

      role,
      rol: role,
      roles: [role],
      roleLabel,

      isAdmin: role === "admin",
      isUser: role === "user",
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

    if (contextRole) return payloadRole !== contextRole;

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

    const selectedTicketId = safeText(
      first(homeState.selectedTicketId, homeState.selectedIncidenciaId, ""),
      ""
    );

    homeState.openingTicketId = safeText(homeState.openingTicketId, "");
    homeState.selectedTicketId = selectedTicketId;
    homeState.selectedIncidenciaId = selectedTicketId;
    homeState.navigatingAction = safeText(homeState.navigatingAction, "");

    return homeState;
  }

  function getRawRuntimeState() {
    return {
      ...homeState,
      selectedTicketId: safeText(first(homeState.selectedTicketId, homeState.selectedIncidenciaId, ""), ""),
      selectedIncidenciaId: safeText(first(homeState.selectedIncidenciaId, homeState.selectedTicketId, ""), ""),
    };
  }

  function patchRuntimeState(patch = {}, result = {}) {
    const data = safeObject(patch);

    if (!hasKeys(data)) return false;

    if (hasOwn(data, "loading")) setLoading(Boolean(data.loading));
    if (hasOwn(data, "refreshing")) setRefreshing(Boolean(data.refreshing));
    if (hasOwn(data, "creating")) setCreating(Boolean(data.creating));

    if (hasOwn(data, "error")) {
      const error = redact(safeText(data.error, ""));

      if (error) {
        setError(error);
      } else {
        clearHomeError();
      }
    }

    if (hasOwn(data, "page")) {
      setPage(Math.max(1, safeNumber(data.page, 1)));
    }

    if (hasOwn(data, "pageSize")) {
      setPageSize(Math.max(1, safeNumber(data.pageSize, DEFAULT_PAGE_SIZE)));
    }

    if (
      hasOwn(data, "selectedTicketId") ||
      hasOwn(data, "selectedIncidenciaId") ||
      hasOwn(data, "ticketId") ||
      hasOwn(data, "incidenciaId")
    ) {
      const selectedTicketId = safeText(
        first(data.selectedTicketId, data.selectedIncidenciaId, data.ticketId, data.incidenciaId, ""),
        ""
      );

      setSelectedTicketId(selectedTicketId);
      homeState.selectedIncidenciaId = selectedTicketId;
    }

    if (hasOwn(data, "openingTicketId")) {
      setOpeningTicketId(safeText(data.openingTicketId, ""));
    }

    if (hasOwn(data, "navigatingAction")) {
      setNavigatingAction(redact(safeText(data.navigatingAction, "")));
    }

    ensureBaseState();

    return {
      ok: true,
      source: SOURCE,
      result: sanitizePayload(result),
      state: getRawRuntimeState(),
    };
  }

  function setRuntimeState(nextState = {}, result = {}) {
    return patchRuntimeState(nextState, result);
  }

  function applyHomeActionResult(result = null, options = {}) {
    if (!isObject(result)) return result;

    const opts = safeObject(options);
    const patch = safeObject(result.statePatch);
    let applied = false;

    if (hasKeys(patch)) {
      applied = Boolean(patchRuntimeState(patch, result));
    } else {
      const nextState = safeCall(actionReduceHomeActionState, homeState, result);

      if (hasKeys(nextState)) {
        applied = Boolean(patchRuntimeState(nextState, result));
      }
    }

    if (applied && opts.render !== false) {
      rerender();
    }

    return result;
  }

  /* =======================================================
     DASHBOARD APPLY
  ======================================================= */

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

    if (!hasKeys(source)) return null;

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
        ""
      ),
      ""
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

    if (!normalized || !hasKeys(normalized.dashboard)) return null;

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

  function getTickets() {
    const rawTickets = firstArray(
      homeState.tickets,
      homeState.incidencias,

      homeState.dashboard?.tickets,
      homeState.dashboard?.incidencias,

      homeState.dashboard?.collections?.tickets,
      homeState.dashboard?.collections?.incidencias
    );

    return normalizeHomeTickets(rawTickets, {
      invoices: getInvoices(),
      users: isAdmin() ? getUsers() : [],
    });
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

  function buildRuntimeStateForTemplate({
    role,
    admin,
    dashboard,
    summary,
    tickets,
    invoices,
    users,
    clients,
    activity,
    pagination,
  }) {
    const selectedTicketId = safeText(
      first(homeState.selectedTicketId, homeState.selectedIncidenciaId, ""),
      ""
    );

    return {
      role,
      admin,

      loading: Boolean(homeState.loading),
      refreshing: Boolean(homeState.refreshing),
      loaded: Boolean(homeState.loaded),
      hydrated: Boolean(homeState.hydrated),
      creating: Boolean(homeState.creating),

      error: redact(homeState.error || ""),
      openingTicketId: safeText(homeState.openingTicketId, ""),
      selectedTicketId,
      selectedIncidenciaId: selectedTicketId,
      navigatingAction: redact(homeState.navigatingAction || ""),

      page: pagination.page,
      pageSize: pagination.pageSize,

      requestId: homeState.requestId || "",
      lastUpdatedAt: homeState.lastSyncAt || "",
      lastSyncAt: homeState.lastSyncAt || "",

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
    };
  }

  function buildTemplatePayload() {
    ensureBaseState();

    const templateUser = getTemplateUser();

    const role = normalizeRole(
      first(
        templateUser.role,
        templateUser.rol,
        templateUser.roles,
        getCurrentRole()
      )
    ) || "user";

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

    const selectedTicketId = safeText(
      first(homeState.selectedTicketId, homeState.selectedIncidenciaId, ""),
      ""
    );

    const runtimeState = buildRuntimeStateForTemplate({
      role,
      admin,
      dashboard,
      summary,
      tickets,
      invoices,
      users,
      clients,
      activity,
      pagination,
    });

    return buildHomeTemplatePayload({
      user: templateUser,
      currentUser: templateUser,
      sidebarUser: templateUser,

      sidebar: {
        user: templateUser,
      },

      layout: {
        sidebarUser: templateUser,
      },

      context: {
        user: templateUser,
        sidebarUser: templateUser,
      },

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

      selectedTicketId,
      selectedIncidenciaId: selectedTicketId,

      requestId: homeState.requestId || "",
      lastUpdatedAt: homeState.lastSyncAt || "",

      state: {
        ...runtimeState,

        user: templateUser,
        currentUser: templateUser,
        sidebarUser: templateUser,

        sidebar: {
          user: templateUser,
        },
      },
    });
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

      if (!node) throw new Error("HOME_VIEW_NODE_EMPTY");

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

    if (node && isElement(container)) bind(container);

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
      const hadData = hasCollectionData();

      clearHomeError();

      setLoading(!hadData && !refresh);
      setRefreshing(refresh);
      setViewBusy(currentContainer, !hadData || refresh);

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

        return Boolean(normalized);
      } catch (error) {
        if (!isCurrentLoad(seq)) return false;

        setError(safeErrorMessage(error));

        return false;
      } finally {
        if (isCurrentLoad(seq)) {
          setLoading(false);
          setRefreshing(false);
          setViewBusy(currentContainer, false);
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
      const result = await navigateFromHomeAction({
        route: target,
        payload: safeObject(opts.payload),
        silent: opts.silent === true,
      });

      return applyHomeActionResult(result, {
        render: false,
      });
    } finally {
      setNavigatingAction("");
      rerender();
    }
  }

  async function runQuickAction(payload = {}) {
    const result = await actionRunHomeQuickAction(safeObject(payload));

    return applyHomeActionResult(result, {
      render: true,
    });
  }

  async function openTicket(ticketId = "", payload = {}) {
    const source = safeObject(payload);
    const id = safeText(
      first(ticketId, source.ticketId, source.incidenciaId, source.entityId, source.id, ""),
      ""
    );

    if (!id) return null;

    setOpeningTicketId(id);
    rerender();

    try {
      const result = await actionOpenHomeTicketDetail({
        ticketId: id,
        incidenciaId: id,
        entityId: id,
        payload: {
          ...source,
          ticketId: id,
          incidenciaId: id,
        },
        silent: false,
      });

      return applyHomeActionResult(result, {
        render: true,
      });
    } finally {
      if (homeState.openingTicketId) {
        setOpeningTicketId("");
        rerender();
      }
    }
  }

  async function closeTicket() {
    const result = await actionCloseHomeTicketDetail();

    return applyHomeActionResult(result, {
      render: true,
    });
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

        runHomeQuickAction: actionRunHomeQuickAction,

        openHomeTicketDetailAction: actionOpenHomeTicketDetail,
        closeHomeTicketDetailAction: actionCloseHomeTicketDetail,
        reduceHomeActionState: actionReduceHomeActionState,

        getState: getRawRuntimeState,
        setState: setRuntimeState,
        patchState: patchRuntimeState,
        updateState: patchRuntimeState,

        requestRender: rerender,
        requestRerender: rerender,
        rerender,
        render: rerender,

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
    homeState.selectedIncidenciaId = "";
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
    const selectedTicketId = safeText(
      first(homeState.selectedTicketId, homeState.selectedIncidenciaId, ""),
      ""
    );

    return sanitizePayload({
      ...getHomeStateSnapshot(),

      initialized,
      destroyed,

      user: getPublicUserSnapshot(),
      role: getCurrentRole(),
      admin: isAdmin(),

      selectedTicketId,
      selectedIncidenciaId: selectedTicketId,

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
    const selectedTicketId = safeText(
      first(homeState.selectedTicketId, homeState.selectedIncidenciaId, ""),
      ""
    );

    return sanitizePayload({
      version: HOME_VIEW_VERSION,
      source: SOURCE,

      initialized,
      destroyed,

      user: getPublicUserSnapshot(),
      role: getCurrentRole(),
      admin: isAdmin(),

      loaded: Boolean(homeState.loaded),
      hydrated: Boolean(homeState.hydrated),
      loading: Boolean(homeState.loading),
      refreshing: Boolean(homeState.refreshing),

      error: redact(homeState.error || ""),

      selectedTicketId,
      selectedIncidenciaId: selectedTicketId,

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

        readsUserFromSidebarViewModel: true,
        passesSidebarUserToTemplate: true,
        readsCollectionsFromDashboardFallback: true,
        reloadsWhenLoadedButEmpty: true,
        optimizedSingleRenderAfterLoad: true,

        ticketDetailModalState: true,
        ticketDetailDoesNotNavigate: true,
        ticketDetailUsesStatePatch: true,

        noSlugResolution: true,
        noAuthGuards: true,
        noRouterGuards: true,
        noGlobalBridge: true,
        noExternalEvents: true,
        noCrossViewModals: true,
        noToastDirect: true,
        noHomeRoute: true,
        noHealthServer: true,

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
    rerender,

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
    openTicketDetail: openTicket,
    openIncidenciaDetail: openTicket,

    closeTicket,
    closeIncidencia: closeTicket,
    closeTicketDetail: closeTicket,
    closeIncidenciaDetail: closeTicket,

    applyHomeActionResult,
    patchRuntimeState,
    setRuntimeState,
    runQuickAction,

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
