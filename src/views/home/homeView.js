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
   - Render paint-first: pinta estructura/cache/skeleton antes de cargar remoto.
   - Carga remota diferida tras primer paint.
   - Bindings delegados estables entre rerenders.
   - Render único final tras sincronizar datos reales.
   - Elimina inline styles/scripts antes de insertar HTML para cumplir CSP.
   - Elimina tooltips custom data-tooltip/data-tippy y conserva title nativo.
   - Corrige títulos genéricos de avatares con nombre real cuando existe.
   - No resuelve slug.
   - No ejecuta Auth guards.
   - No ejecuta Router guards.
   - No crea bridges globales.
   - No emite eventos externos.
   - No crea cache local propia.
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
  patchHomeState,
  syncHomeStateFromDashboard,
  getHomeStateSnapshot,
  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
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
  buildHomeTemplatePayload,
} from "./home.model.js";

import {
  bindHomeEvents,
  getHomeBindingsSnapshot,
} from "./home.bindings.js";

import {
  exportHomeCsvAction,
  navigateFromHomeAction,
  createHomeIncidenciaAction,
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
  isFunction,
  first,
  sanitizePayload,
} from "./home.utils.js";

export const HOME_VIEW_VERSION = "home.view.v19.clean-orchestrator";

export const HomeView = (() => {
  "use strict";

  const SOURCE = "views.home";
  const SCOPE = "view:home";
  const DEFAULT_PAGE_SIZE = 5;

  const INLINE_STYLE_ATTR_RE =
    /\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

  const INLINE_STYLE_TAG_RE =
    /<style\b[^>]*>[\s\S]*?<\/style>/gi;

  const SCRIPT_TAG_RE =
    /<script\b[^>]*>[\s\S]*?<\/script>/gi;

  const INLINE_EVENT_ATTR_RE =
    /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

  const GENERIC_AVATAR_TITLES = new Set([
    "avatar",
    "cliente",
    "client",
    "usuario",
    "user",
    "perfil",
    "profile",
    "contacto",
    "contact",
  ]);

  const TOOLTIP_ATTR_PREFIXES = Object.freeze([
    "data-tooltip",
    "data-tippy",
  ]);

  const INCIDENCIAS_ROUTE = safeInternalRoute(
    ROUTES?.incidencias,
    "/incidencias"
  );

  let initialized = false;
  let destroyed = false;
  let bootLoadRequested = false;

  let inflightLoad = null;
  let bindingsCleanup = null;
  let boundContainer = null;

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

  function hasKeys(value = {}) {
    return Boolean(isObject(value) && Object.keys(value).length > 0);
  }

  function getTimerHost() {
    if (typeof window !== "undefined") return window;
    return globalThis;
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
        /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  }

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeRole(value = "", fallback = "user") {
    if (Array.isArray(value)) {
      const roles = value.map((item) => normalizeRole(item, "")).filter(Boolean);

      if (roles.includes("admin")) return "admin";
      if (roles.includes("user")) return "user";

      return fallback;
    }

    const role = String(value || "").trim().toLowerCase();

    if (role === "admin") return "admin";
    if (role === "user") return "user";

    return fallback;
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      const host = getTimerHost();

      try {
        if (!isFunction(host.requestAnimationFrame)) {
          host.setTimeout(resolve, 0);
          return;
        }

        host.requestAnimationFrame(() => {
          host.requestAnimationFrame(resolve);
        });
      } catch {
        resolve();
      }
    });
  }

  function warn(label = "async", error = null) {
    const message = `[HomeView] ${safeText(label, "async")} falló: ${redact(error?.message || String(error || ""))}`;

    try {
      CoreModule?.AppCore?.utils?.warn?.(message);
      return true;
    } catch {
      // fallback abajo
    }

    try {
      console.warn(message);
      return true;
    } catch {
      return false;
    }
  }

  function runDeferred(label = "async", callback = null) {
    if (!isFunction(callback)) return false;

    Promise.resolve()
      .then(callback)
      .catch((error) => {
        warn(label, error);
      });

    return true;
  }

  /* =======================================================
     ROUTES
  ======================================================= */

  function pathFromInput(value = "/") {
    try {
      return configRoutePathFromUrlLike(value) || "/";
    } catch {
      const raw = safeText(value, "/");

      if (!raw) return "/";
      if (raw.startsWith("//")) return "/";
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "/";
      if (/[\r\n\t\\]/.test(raw)) return "/";

      return raw;
    }
  }

  function normalizePath(value = "/") {
    try {
      return configNormalizeRoutePath(pathFromInput(value)) || "/";
    } catch {
      let clean = safeText(pathFromInput(value), "/")
        .split("#")[0]
        .split("?")[0]
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");

      if (!clean.startsWith("/")) clean = `/${clean}`;
      if (clean.length > 1) clean = clean.replace(/\/+$/g, "") || "/";

      return clean || "/";
    }
  }

  function isBlockedRoute(value = "/") {
    const path = normalizePath(value);

    try {
      return configIsBlockedRoutePath(path) === true;
    } catch {
      const lower = path.toLowerCase();

      return Boolean(
        lower === "/home" ||
          lower === "/403" ||
          lower === "/404" ||
          lower === "/2fa" ||
          lower === "/mfa" ||
          lower === "/otp" ||
          lower.startsWith("/2fa/") ||
          lower.startsWith("/mfa/") ||
          lower.startsWith("/otp/")
      );
    }
  }

  function safeInternalRoute(value = "", fallback = "") {
    const path = normalizePath(value || fallback || "");

    if (!path) return "";
    if (!path.startsWith("/")) return "";
    if (path.startsWith("//")) return "";
    if (isBlockedRoute(path)) return "";

    return path;
  }

  /* =======================================================
     CORE / AUTH / USER
  ======================================================= */

  function resolveAppCore(context = currentContext) {
    const ctx = safeObject(context);

    return (
      ctx.AppCore ||
      ctx.appCore ||
      CoreModule?.AppCore ||
      CoreModule?.default?.AppCore ||
      null
    );
  }

  function resolveAuth(context = currentContext) {
    const ctx = safeObject(context);
    const AppCore = resolveAppCore(ctx);

    try {
      return (
        ctx.Auth ||
        ctx.auth ||
        AppCore?.auth ||
        AppCore?.Auth ||
        AppCore?.modules?.get?.("auth") ||
        AppCore?.modules?.get?.("Auth") ||
        AuthModule?.Auth ||
        AuthModule?.default ||
        null
      );
    } catch {
      return ctx.Auth || AuthModule?.Auth || AuthModule?.default || null;
    }
  }

  function safeAuthCall(auth = null, method = "", fallback = null, ...args) {
    try {
      const fn = auth?.[method];
      return isFunction(fn) ? fn.call(auth, ...args) : fallback;
    } catch {
      return fallback;
    }
  }

  function getAuthUser(context = currentContext) {
    const AppCore = resolveAppCore(context);
    const Auth = resolveAuth(context);
    const state = safeObject(AppCore?.state);

    return safeObject(
      first(
        safeAuthCall(Auth, "getCurrentUser", null),
        safeAuthCall(Auth, "getUser", null),
        AppCore?.getCurrentUser?.(),
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

  function getAuthRole(context = currentContext) {
    const AppCore = resolveAppCore(context);
    const Auth = resolveAuth(context);
    const state = safeObject(AppCore?.state);
    const user = getAuthUser(context);

    return normalizeRole(
      first(
        safeAuthCall(Auth, "getRole", ""),
        safeAuthCall(Auth, "getCurrentRole", ""),
        AppCore?.getCurrentRole?.(),
        state.role,
        state.rol,
        state.roles,
        state.userRole,
        user.role,
        user.rol,
        user.roles,
        ""
      ),
      ""
    );
  }

  function getSidebarUserViewModel(context = currentContext) {
    const AppCore = resolveAppCore(context);
    const Auth = resolveAuth(context);

    try {
      return getSidebarUser({
        AppCore,
        Auth,
        user: context?.user || context?.currentUser || null,
      });
    } catch {
      return {
        hasUser: false,
        displayName: "Usuario",
        name: "Usuario",
        role: getAuthRole(context) || "user",
        roles: [getAuthRole(context) || "user"],
        roleLabel: getAuthRole(context) === "admin" ? "Administrador" : "Estándar",
        isAdmin: getAuthRole(context) === "admin",
        isUser: getAuthRole(context) !== "admin",
        avatarUrl: "",
        initials: "U",
      };
    }
  }

  function resolveCurrentRole(payload = {}, options = {}) {
    const sidebarUser = getSidebarUserViewModel(currentContext);
    const authRole = getAuthRole(currentContext);
    const trustPayloadRole = options.trustPayloadRole === true;

    return normalizeRole(
      first(
        sidebarUser?.hasUser === true ? sidebarUser.role : "",
        authRole,
        homeState.role,
        homeState.rol,
        homeState.roles,
        trustPayloadRole ? payload?.role : "",
        trustPayloadRole ? payload?.rol : "",
        trustPayloadRole ? payload?.roles : "",
        "user"
      ),
      "user"
    );
  }

  /* =======================================================
     DOM
  ======================================================= */

  function resolveContainer(root = null, context = {}) {
    if (isElement(root)) return root;

    const ctx = safeObject(context);

    return (
      (isElement(ctx.renderRoot) && ctx.renderRoot) ||
      (isElement(ctx.renderHost) && ctx.renderHost) ||
      (isElement(ctx.viewContainer) && ctx.viewContainer) ||
      null
    );
  }

  function sanitizeHtml(html = "") {
    return String(html || "")
      .replace(SCRIPT_TAG_RE, "")
      .replace(INLINE_STYLE_TAG_RE, "")
      .replace(INLINE_STYLE_ATTR_RE, "")
      .replace(INLINE_EVENT_ATTR_RE, "");
  }

  function htmlToNode(html = "") {
    if (!isBrowser()) return null;

    try {
      const template = document.createElement("template");
      template.innerHTML = sanitizeHtml(html).trim();

      return template.content.firstElementChild || template.content;
    } catch {
      return null;
    }
  }

  function paintHtml(container = null, html = "") {
    if (!isElement(container)) return null;

    const node = htmlToNode(html);

    if (!node) return null;

    try {
      container.replaceChildren(node);
      markContainer(container);
      sanitizeRenderedDom(container);
      return node;
    } catch {
      try {
        container.innerHTML = sanitizeHtml(html);
        markContainer(container);
        sanitizeRenderedDom(container);
        return container.firstElementChild || container;
      } catch {
        return null;
      }
    }
  }

  function markContainer(container = null) {
    if (!isElement(container)) return false;

    try {
      container.dataset.homeView = "true";
      container.dataset.homeViewVersion = HOME_VIEW_VERSION;
      container.dataset.homeSource = SOURCE;
      container.setAttribute("aria-busy", homeState.loading || homeState.refreshing ? "true" : "false");
      return true;
    } catch {
      return false;
    }
  }

  function sanitizeRenderedDom(container = null) {
    if (!isElement(container)) return false;

    try {
      container.querySelectorAll("script, style").forEach((node) => node.remove());
    } catch {
      // noop
    }

    try {
      container.querySelectorAll("[style]").forEach((node) => node.removeAttribute("style"));
    } catch {
      // noop
    }

    try {
      container.querySelectorAll("*").forEach((node) => {
        for (const attr of [...node.attributes]) {
          const name = String(attr.name || "").toLowerCase();

          if (name.startsWith("on")) {
            node.removeAttribute(attr.name);
            continue;
          }

          if (TOOLTIP_ATTR_PREFIXES.some((prefix) => name === prefix || name.startsWith(`${prefix}-`))) {
            const value = safeText(attr.value, "");

            if (value && !node.hasAttribute("title")) {
              node.setAttribute("title", value);
            }

            node.removeAttribute(attr.name);
          }
        }
      });
    } catch {
      // noop
    }

    fixGenericAvatarTitles(container);

    return true;
  }

  function fixGenericAvatarTitles(container = null) {
    if (!isElement(container)) return false;

    try {
      container.querySelectorAll("[title]").forEach((node) => {
        const title = safeText(node.getAttribute("title"), "");
        const key = title.toLowerCase();

        if (!GENERIC_AVATAR_TITLES.has(key)) return;

        const label =
          node.getAttribute("aria-label") ||
          node.closest("[aria-label]")?.getAttribute("aria-label") ||
          node.closest("[data-ticket-row]")?.querySelector?.("strong")?.textContent ||
          "";

        if (safeText(label, "")) {
          node.setAttribute("title", safeText(label, ""));
        }
      });

      return true;
    } catch {
      return false;
    }
  }

  function paintError(container = currentContainer, error = null) {
    const message = redact(error?.message || error || "No se pudo renderizar el Home.");

    return paintHtml(container, renderHomeErrorState(message));
  }

  /* =======================================================
     DATA
  ======================================================= */

  function stateHasRealData() {
    return Boolean(
      safeArray(homeState.tickets).length ||
        safeArray(homeState.incidencias).length ||
        safeArray(homeState.invoices).length ||
        safeArray(homeState.facturas).length ||
        safeArray(homeState.widgets).length ||
        safeArray(homeState.cards).length ||
        safeArray(homeState.activity).length ||
        safeArray(homeState.recentActivity).length ||
        (homeState.admin && safeArray(homeState.users).length) ||
        (homeState.admin && safeArray(homeState.clients).length) ||
        hasKeys(homeState.summary)
    );
  }

  function hydrateFromCacheIfPossible() {
    try {
      const cached = hydrateHomeFromCache();

      if (cached?.hydrated === true && hasKeys(cached.dashboard)) {
        applyDashboardPayload(cached.dashboard, {
          replace: false,
          preserveExisting: true,
          source: "cache",
        });

        return true;
      }
    } catch {
      // fallback store abajo
    }

    return false;
  }

  function applyDashboardPayload(payload = {}, options = {}) {
    const raw = safeObject(payload);

    if (!hasKeys(raw)) return homeState;

    const role = resolveCurrentRole(raw, {
      trustPayloadRole: options.trustPayloadRole === true,
    });

    const dashboard = normalizeHomeDashboard({
      ...raw,
      role,
      rol: role,
      roles: [role],
      admin: role === "admin",
      meta: {
        ...safeObject(raw.meta),
        role,
        admin: role === "admin",
      },
    });

    syncHomeStateFromDashboard(dashboard, {
      replace: options.replace === true,
      preserveExisting: options.preserveExisting === true,
      role,
      requestId: first(options.requestId, dashboard.requestId, dashboard.meta?.requestId, ""),
      lastSyncAt: first(options.lastSyncAt, dashboard.lastSyncAt, dashboard.updatedAt, dashboard.meta?.updatedAt, ""),
    });

    replaceHomeStore(dashboard, {
      replace: options.replace === true,
      preserveExisting: options.preserveExisting === true,
      role,
      loaded: true,
      hydrated: true,
    });

    setLoaded(true);
    setHydrated(true);
    clearHomeError();

    return homeState;
  }

  function buildTemplatePayload(extra = {}) {
    const snapshot = getHomeStateSnapshot();
    const sidebarUser = getSidebarUserViewModel(currentContext);
    const role = resolveCurrentRole(snapshot);
    const admin = role === "admin";

    return buildHomeTemplatePayload({
      ...snapshot,
      ...safeObject(extra),

      state: {
        ...snapshot,
        ...safeObject(extra.state),
      },

      dashboard: snapshot.dashboard,

      role,
      rol: role,
      roles: [role],
      admin,

      user: sidebarUser,
      currentUser: sidebarUser,
      sidebarUser,
      sidebar: {
        user: sidebarUser,
      },
      layout: {
        sidebarUser,
      },
      context: {
        ...safeObject(currentContext),
        user: sidebarUser,
        sidebarUser,
      },

      summary: snapshot.summary,
      widgets: snapshot.widgets,
      cards: snapshot.widgets,
      kpis: snapshot.widgets,
      blocks: snapshot.widgets,

      tickets: snapshot.tickets,
      incidencias: snapshot.incidencias,

      invoices: snapshot.invoices,
      facturas: snapshot.facturas,

      users: admin ? snapshot.users : [],
      usuarios: admin ? snapshot.usuarios : [],

      clients: admin ? snapshot.clients : [],
      clientes: admin ? snapshot.clientes : [],
      customers: admin ? snapshot.customers : [],

      activity: snapshot.activity,
      recentActivity: snapshot.recentActivity,

      page: snapshot.page,
      pageSize: snapshot.pageSize,
      selectedTicketId: snapshot.selectedTicketId,
      selectedIncidenciaId: snapshot.selectedIncidenciaId,
    });
  }

  /* =======================================================
     RENDER
  ======================================================= */

  function renderNow(options = {}) {
    if (destroyed) return api;

    const container = resolveContainer(options.container || currentContainer, currentContext);

    if (!isElement(container)) return api;

    currentContainer = container;

    const seq = nextRenderSeq();

    try {
      const payload = buildTemplatePayload(options.payload || {});
      const html = renderHomeTemplate(payload);

      if (!isCurrentRender(seq)) return api;

      paintHtml(container, html);
      bindEvents(container);

      return api;
    } catch (error) {
      if (isCurrentRender(seq)) {
        setError(error);
        paintError(container, error);
        bindEvents(container);
      }

      return api;
    }
  }

  function requestRender(result = {}) {
    return renderNow({
      reason: "request-render",
      payload: {
        actionResult: sanitizePayload(result),
      },
    });
  }

  function renderLoadingIfNeeded() {
    if (stateHasRealData()) return false;

    setLoading(true);
    renderNow({
      reason: "initial-loading",
    });

    return true;
  }

  function shouldLoadOnMount(force = false) {
    if (force) return true;
    if (!homeState.loaded || !homeState.hydrated) return true;
    if (!stateHasRealData()) return true;
    return false;
  }

  /* =======================================================
     LOAD
  ======================================================= */

  async function loadData(options = {}) {
    const opts = safeObject(options);

    if (destroyed) return null;

    if (inflightLoad && opts.force !== true) {
      return inflightLoad;
    }

    const seq = nextLoadSeq();
    const asRefresh = opts.asRefresh === true || opts.force === true;

    if (asRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    renderNow({
      reason: asRefresh ? "refresh-start" : "load-start",
    });

    inflightLoad = (async () => {
      try {
        const dashboard = asRefresh
          ? await refreshHomeDashboard({
              force: true,
              returnStaleOnError: opts.returnStaleOnError !== false,
              params: opts.params || null,
            })
          : await loadHomeDashboard({
              force: opts.force === true,
              returnStaleOnError: opts.returnStaleOnError !== false,
              params: opts.params || null,
            });

        if (!isCurrentLoad(seq)) return dashboard;

        applyDashboardPayload(dashboard, {
          replace: true,
          preserveExisting: false,
          source: asRefresh ? "refresh" : "load",
        });

        setLoading(false);
        setRefreshing(false);
        setLoaded(true);
        setHydrated(true);
        clearHomeError();

        renderNow({
          reason: asRefresh ? "refresh-success" : "load-success",
        });

        return dashboard;
      } catch (error) {
        if (isCurrentLoad(seq)) {
          setLoading(false);
          setRefreshing(false);
          setError(error);

          renderNow({
            reason: asRefresh ? "refresh-error" : "load-error",
          });
        }

        return null;
      } finally {
        if (isCurrentLoad(seq)) {
          inflightLoad = null;
        }
      }
    })();

    return inflightLoad;
  }

  async function refresh(options = {}) {
    return loadData({
      ...safeObject(options),
      force: true,
      asRefresh: true,
      returnStaleOnError: true,
    });
  }

  async function reload(options = {}) {
    return loadData({
      ...safeObject(options),
      force: true,
      returnStaleOnError: true,
    });
  }

  /* =======================================================
     ACTION BRIDGE
  ======================================================= */

  function getState() {
    return getHomeStateSnapshot();
  }

  function patchState(patch = {}, result = {}) {
    patchHomeState(patch, {
      replace: false,
      source: SOURCE,
      result: sanitizePayload(result),
    });

    return true;
  }

  function setState(nextState = {}, result = {}) {
    patchHomeState(nextState, {
      replace: false,
      source: SOURCE,
      result: sanitizePayload(result),
    });

    return true;
  }

  function onStatePatch(patch = {}, result = {}) {
    return patchState(patch, result);
  }

  function onActionResult(_result = {}) {
    return true;
  }

  async function createFromHomeAction(options = {}) {
    setCreating(true);

    try {
      const result = await createHomeIncidenciaAction(options);
      return result;
    } finally {
      setCreating(false);
    }
  }

  async function navigateFromHome(options = {}) {
    setNavigatingAction(first(options.route, options.action, "navigate"));

    try {
      const result = await navigateFromHomeAction(options);
      return result;
    } finally {
      setNavigatingAction("");
    }
  }

  async function openHomeTicketDetail(options = {}) {
    const id = safeText(first(options.ticketId, options.incidenciaId, options.entityId, ""), "");

    if (id) setOpeningTicketId(id);

    try {
      const result = await actionOpenHomeTicketDetail(options);
      const selected = safeText(first(result?.selectedTicketId, result?.selectedIncidenciaId, id, ""), "");

      if (selected) setSelectedTicketId(selected);

      return result;
    } finally {
      setOpeningTicketId("");
    }
  }

  async function closeHomeTicketDetail(options = {}) {
    const result = await actionCloseHomeTicketDetail(options);
    setSelectedTicketId("");
    setOpeningTicketId("");

    return result;
  }

  function goToPage(page = 1) {
    setPage(Math.max(1, safeNumber(page, 1)));
    renderNow({
      reason: "page-go",
    });

    return true;
  }

  function goPrevPage() {
    return goToPage(Math.max(1, safeNumber(homeState.page, 1) - 1));
  }

  function goNextPage() {
    return goToPage(Math.max(1, safeNumber(homeState.page, 1) + 1));
  }

  function changePageSize(pageSize = DEFAULT_PAGE_SIZE) {
    setPageSize(Math.max(1, safeNumber(pageSize, DEFAULT_PAGE_SIZE)));
    setPage(1);

    renderNow({
      reason: "page-size",
    });

    return true;
  }

  /* =======================================================
     BINDINGS
  ======================================================= */

  function bindEvents(container = currentContainer) {
    if (!isElement(container)) return false;

    const cleanup = bindHomeEvents({
      scope: SCOPE,
      container,

      reload,
      refresh,
      loadHomeDashboard: loadData,

      exportHomeCsvAction,
      navigateFromHomeAction: navigateFromHome,
      runHomeQuickAction: actionRunHomeQuickAction,
      copyHomeWidgetIdAction,
      createFromHomeAction,

      openHomeTicketDetailAction: openHomeTicketDetail,
      closeHomeTicketDetailAction: closeHomeTicketDetail,
      reduceHomeActionState: actionReduceHomeActionState,

      getState,
      setState,
      patchState,
      updateState: patchState,

      requestRender,
      requestRerender: requestRender,
      rerender: requestRender,
      render: requestRender,
      onRenderRequest: requestRender,
      onRenderRequested: requestRender,

      onStatePatch,
      onActionResult,
      onHomeActionResult: onActionResult,

      goToPage,
      goPrevPage,
      goNextPage,
      changePageSize,
    });

    bindingsCleanup = cleanup;
    boundContainer = container;

    return true;
  }

  function unbindEvents() {
    try {
      if (isFunction(bindingsCleanup)) {
        bindingsCleanup();
      }
    } catch {
      // noop
    }

    bindingsCleanup = null;
    boundContainer = null;

    return true;
  }

  /* =======================================================
     LIFECYCLE
  ======================================================= */

  function mount(root = null, context = {}) {
    const container = resolveContainer(root, context);

    destroyed = false;
    initialized = true;
    currentContext = safeObject(context);
    currentContainer = container;

    if (!isElement(container)) return api;

    hydrateFromCacheIfPossible();

    if (!stateHasRealData()) {
      renderLoadingIfNeeded();
    } else {
      renderNow({
        reason: "mount-cache",
      });
    }

    if (shouldLoadOnMount(context.force === true)) {
      bootLoadRequested = true;

      runDeferred("boot-load", async () => {
        await waitForPaint();

        if (!destroyed) {
          await loadData({
            force: !stateHasRealData(),
            returnStaleOnError: true,
          });
        }
      });
    }

    return api;
  }

  function init(root = null, context = {}) {
    return mount(root, context);
  }

  function bootstrap(root = null, context = {}) {
    return mount(root, context);
  }

  function render(root = null, context = {}) {
    if (isElement(root)) {
      currentContainer = root;
    }

    currentContext = {
      ...safeObject(currentContext),
      ...safeObject(context),
    };

    return renderNow({
      container: currentContainer,
      reason: "render",
    });
  }

  function destroy() {
    destroyed = true;
    initialized = false;
    bootLoadRequested = false;

    renderSeq += 1;
    loadSeq += 1;

    inflightLoad = null;

    unbindEvents();

    currentContainer = null;
    currentContext = {};

    return api;
  }

  /* =======================================================
     SNAPSHOT
  ======================================================= */

  function getSnapshot() {
    const state = getHomeStateSnapshot();
    const sidebarUser = getSidebarUserViewModel(currentContext);

    return {
      version: HOME_VIEW_VERSION,
      source: SOURCE,

      initialized,
      destroyed,
      bootLoadRequested,

      hasContainer: isElement(currentContainer),
      bound: Boolean(bindingsCleanup && boundContainer),
      boundContainerConnected: Boolean(boundContainer?.isConnected),

      renderSeq,
      loadSeq,
      inflight: Boolean(inflightLoad),

      route: {
        incidencias: INCIDENCIAS_ROUTE,
      },

      user: sidebarUser?.hasUser
        ? {
            hasUser: true,
            slug: sidebarUser.slug || null,
            displayName: sidebarUser.displayName || sidebarUser.name || "Usuario",
            role: sidebarUser.role || "user",
            isAdmin: sidebarUser.isAdmin === true,
            hasAvatar: Boolean(sidebarUser.avatarUrl),
          }
        : {
            hasUser: false,
            role: resolveCurrentRole(state),
            isAdmin: resolveCurrentRole(state) === "admin",
            hasAvatar: false,
          },

      state: {
        role: state.role,
        admin: state.admin,
        loaded: state.loaded,
        hydrated: state.hydrated,
        loading: state.loading,
        refreshing: state.refreshing,
        creating: state.creating,

        selectedTicketId: state.selectedTicketId || "",
        selectedIncidenciaId: state.selectedIncidenciaId || "",
        openingTicketId: state.openingTicketId || "",

        error: redact(state.error || ""),
        requestId: state.requestId || "",
        lastSyncAt: state.lastSyncAt || "",

        counts: state.countsInfo || {
          widgets: safeArray(state.widgets).length,
          tickets: safeArray(state.tickets).length,
          invoices: safeArray(state.invoices).length,
          users: state.admin ? safeArray(state.users).length : 0,
          clients: state.admin ? safeArray(state.clients).length : 0,
          activity: safeArray(state.activity).length,
        },
      },

      modules: {
        api: getHomeApiSnapshot(),
        store: getHomeStoreSnapshot(),
        bindings: getHomeBindingsSnapshot(SCOPE),
        actions: getHomeActionsSnapshot(),
      },

      policy: {
        controllerOnly: true,

        renderDelegatedToTemplate: true,
        dataDelegatedToApi: true,
        runtimeStateDelegatedToHomeState: true,
        cacheDelegatedToHomeStore: true,
        modelDelegatedToHomeModel: true,
        domEventsDelegatedToBindings: true,
        actionsDelegatedToHomeActions: true,

        paintFirst: true,
        deferredRemoteLoad: true,
        stableBindings: true,
        mutableBindingsApi: true,

        noAuthGuards: true,
        noRouterGuards: true,
        noSlugResolution: true,

        noGlobalBridge: true,
        noExternalEvents: true,
        noOwnCache: true,
        noToastDirect: true,

        removesInlineStyles: true,
        removesInlineScripts: true,
        removesInlineEventHandlers: true,
        stripsCustomTooltips: true,

        userNeverKeepsAdminCache: true,
        noHomeRoute: true,
        noHealthServerReadyPing: true,

        snapshotRedacted: true,
      },
    };
  }

  function getDebugSnapshot() {
    return getSnapshot();
  }

  const api = {
    version: HOME_VIEW_VERSION,

    init,
    mount,
    bootstrap,
    render,
    destroy,
    cleanup: destroy,

    reload,
    refresh,
    loadData,

    requestRender,
    rerender: requestRender,

    getState,
    patchState,
    setState,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getSnapshot,
    getDebugSnapshot,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },

    get container() {
      return currentContainer;
    },
  };

  return api;
})();

export default HomeView;
