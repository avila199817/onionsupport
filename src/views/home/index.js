/* =========================================================
   Onion Support - Home Index
   Archivo: /src/views/home/index.js

   Responsabilidad:
   - Controlar el ciclo de vida DOM de la vista Inicio.
   - Delegar datos/cache/dedupe exclusivamente a home.api.js.
   - Delegar HTML exclusivamente a home.template.js.
   - Mantener un único listener delegado de acciones sobre el host.
   - Navegar mediante Router/AppCore, sin HTTP, Store ni Storage propios.
   - Mantener el DOM al desmontar para evitar parpadeos entre rutas.
========================================================= */

import { AppCore } from "../../core/index.js";
import { ROUTES } from "../../core/config.js";

import {
  HOME_CACHE_TTL_MS,
  loadHomeDashboard,
  hydrateHomeFromCache,
  hasFreshHomeDashboard,
  clearHomeDashboardCache,
  getHomeCacheState,
} from "./home.api.js";

import {
  renderHomeTemplate,
  renderHomeErrorState,
} from "./home.template.js";

export const HOME_INDEX_VERSION = "home.index.v11.single-cache.production";
export const HOME_VIEW_VERSION = HOME_INDEX_VERSION;

const SOURCE = "home.view";
const ROUTER_EVENT_HANDLED_KEY = "__onionRouterHandled";

const ACTIONS = Object.freeze({
  RETRY: "retry",
  NAVIGATE: "navigate",
});

const REFRESH_ACTIONS = new Set([
  ACTIONS.RETRY,
  "refresh",
  "reload",
  "reintentar",
  "actualizar",
]);

const NAVIGATION_ACTIONS = new Set([
  ACTIONS.NAVIGATE,
  "go",
  "open",
  "abrir",
  "ir",
]);

const INSTANCES = new WeakMap();
let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function isDomNode(value = null) {
  return Boolean(
    typeof Node !== "undefined" &&
      value &&
      value instanceof Node
  );
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/* No aplanar arrays: pueden ser datos válidos completos. */
function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function hasContent(value = null) {
  return isObject(value) && Object.keys(value).length > 0;
}

function now() {
  return Date.now();
}

function safeError(error = null, fallback = "No se pudo cargar el inicio.") {
  const message = cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      error?.response?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );

  return redact(message) || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

/* =========================================================
   CORE / USER / ROUTES
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (["admin", "administrator", "administrador", "superadmin", "super_admin", "root", "owner"].includes(role)) {
    return "admin";
  }

  if (["user", "usuario", "client", "cliente"].includes(role)) {
    return "user";
  }

  return "";
}

function getCoreState() {
  try {
    return AppCore?.getState?.() || AppCore?.state || {};
  } catch {
    return AppCore?.state || {};
  }
}

function getCurrentUser(context = {}) {
  const ctx = safeObject(context);
  const state = getCoreState();

  try {
    return first(
      ctx.user,
      ctx.currentUser,
      ctx.session?.user,
      AppCore?.getCurrentUser?.(),
      state.user,
      state.currentUser,
      state.session?.user,
      null
    );
  } catch {
    return first(
      ctx.user,
      ctx.currentUser,
      ctx.session?.user,
      state.user,
      state.currentUser,
      state.session?.user,
      null
    );
  }
}

function getCurrentRole(context = {}) {
  const ctx = safeObject(context);
  const state = getCoreState();
  const user = safeObject(getCurrentUser(ctx), {});

  return (
    normalizeRole(
      first(
        ctx.role,
        ctx.rol,
        ctx.roles,
        ctx.userRole,
        user.role,
        user.rol,
        user.roles,
        AppCore?.getCurrentRole?.(),
        state.role,
        state.rol,
        state.roles,
        "user"
      )
    ) || "user"
  );
}

function safeRoute(value = "", fallback = "/") {
  const route = cleanText(value, fallback);

  if (!route.startsWith("/")) return fallback;
  if (route.startsWith("//")) return fallback;
  if (/[\r\n\t\\]/.test(route)) return fallback;
  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature|jwt|authorization)=/i.test(route)) {
    return fallback;
  }

  return route;
}

function getRoutes(context = {}) {
  const custom = safeObject(context.routes);

  return {
    home: safeRoute(
      first(custom.home, ROUTES?.privateHome, ROUTES?.dashboard, "/dashboard"),
      "/dashboard"
    ),
    incidencias: safeRoute(first(custom.incidencias, ROUTES?.incidencias, "/incidencias"), "/incidencias"),
    facturas: safeRoute(first(custom.facturas, ROUTES?.facturas, "/facturas"), "/facturas"),
    clientes: safeRoute(first(custom.clientes, ROUTES?.clientes, "/clientes"), "/clientes"),
    usuarios: safeRoute(first(custom.usuarios, ROUTES?.usuarios, "/usuarios"), "/usuarios"),
    servidor: safeRoute(first(custom.servidor, ROUTES?.servidor, "/servidor"), "/servidor"),
    cuenta: safeRoute(first(custom.cuenta, ROUTES?.cuenta, "/cuenta"), "/cuenta"),
    ajustes: safeRoute(first(custom.ajustes, ROUTES?.ajustes, "/ajustes"), "/ajustes"),
  };
}

function getRouter(context = {}) {
  const ctx = safeObject(context);

  try {
    return (
      ctx.Router ||
      ctx.router ||
      AppCore?.router ||
      AppCore?.Router ||
      AppCore?.getModule?.("router") ||
      null
    );
  } catch {
    return ctx.Router || ctx.router || AppCore?.router || AppCore?.Router || null;
  }
}

function basePayload(context = {}, extra = {}) {
  return {
    user: getCurrentUser(context),
    role: getCurrentRole(context),
    routes: getRoutes(context),
    ...safeObject(extra),
  };
}

/* =========================================================
   INITIAL DATA
========================================================= */

function getContextDashboard(context = {}, options = {}) {
  const ctx = safeObject(context);
  const opts = safeObject(options);

  return first(
    opts.dashboard,
    opts.homeDashboard,
    opts.home,
    opts.data?.dashboard,
    opts.data?.home,
    ctx.dashboard,
    ctx.homeDashboard,
    ctx.home,
    ctx.data?.dashboard,
    ctx.data?.home,
    null
  );
}

function getCachedDashboard() {
  try {
    const dashboard = hydrateHomeFromCache?.();
    return hasContent(dashboard) ? dashboard : null;
  } catch {
    return null;
  }
}

function isCachedDashboardFresh(ttlMs = HOME_CACHE_TTL_MS) {
  try {
    return hasFreshHomeDashboard?.({ ttlMs }) === true;
  } catch {
    return false;
  }
}

function getInitialDashboard(context = {}, options = {}) {
  const opts = safeObject(options);
  const ttlMs = opts.ttlMs ?? HOME_CACHE_TTL_MS;
  const cached = getCachedDashboard();

  if (cached) {
    return {
      dashboard: cached,
      fresh: isCachedDashboardFresh(ttlMs),
      source: "api.cache",
    };
  }

  const contextual = getContextDashboard(context, opts);

  if (hasContent(contextual)) {
    /*
       Contexto = semilla visual, no cache autoritativo.
       Siempre se valida en background para no dejar un dashboard parcial
       bloqueando la carga real.
    */
    return {
      dashboard: contextual,
      fresh: false,
      source: "context.seed",
    };
  }

  return {
    dashboard: null,
    fresh: false,
    source: "empty",
  };
}

function getCacheState() {
  try {
    return getHomeCacheState?.() || null;
  } catch {
    return null;
  }
}

/* =========================================================
   DOM
========================================================= */

function setHostFlags(host = null, state = {}) {
  if (!host) return false;

  try {
    const loading = Boolean(state.loading);
    const refreshing = Boolean(state.refreshing);

    host.dataset.view = "home";
    host.dataset.homeController = HOME_INDEX_VERSION;
    host.dataset.homeMounted = state.mounted ? "true" : "false";
    host.dataset.homeLoading = loading ? "true" : "false";
    host.dataset.homeRefreshing = refreshing ? "true" : "false";
    host.setAttribute("aria-busy", loading || refreshing ? "true" : "false");

    return true;
  } catch {
    return false;
  }
}

function renderHtml(host = null, html = "", renderState = {}) {
  if (!host) return false;

  const next = String(html || "");

  if (renderState.lastHTML === next || host.innerHTML === next) {
    renderState.lastHTML = next;
    return false;
  }

  host.innerHTML = next;
  renderState.lastHTML = next;

  return true;
}

function clearHost(host = null) {
  if (!host) return false;

  try {
    host.replaceChildren();
    return true;
  } catch {
    try {
      host.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

function closestAction(target = null) {
  const element = target?.nodeType === 3 ? target.parentElement : target;
  return element?.closest?.("[data-home-action], [data-action]") || null;
}

function actionFrom(node = null) {
  return cleanText(
    node?.dataset?.homeAction ||
      node?.dataset?.action ||
      node?.getAttribute?.("data-home-action") ||
      node?.getAttribute?.("data-action") ||
      "",
    ""
  );
}

function isKnownAction(action = "") {
  return REFRESH_ACTIONS.has(action) || NAVIGATION_ACTIONS.has(action);
}

/* =========================================================
   INSTANCES
========================================================= */

function destroyPrevious(host = null) {
  const previous = host ? INSTANCES.get(host) : null;

  if (!previous?.destroy) return false;

  previous.destroy({
    keepDom: true,
    remount: true,
  });

  return true;
}

function storeInstance(host = null, instance = null) {
  if (!host || !instance) return false;

  INSTANCES.set(host, instance);
  lastInstance = instance;
  return true;
}

function clearInstance(host = null, instance = null) {
  if (host && INSTANCES.get(host) === instance) {
    INSTANCES.delete(host);
  }

  if (lastInstance === instance) {
    lastInstance = null;
  }

  return true;
}

/* =========================================================
   CONTROLLER
========================================================= */

function createHomeController(host = null, context = {}) {
  let destroyed = false;
  let mounted = false;
  let bound = false;

  let dashboard = null;
  let loading = false;
  let refreshing = false;
  let error = "";

  let mountedFrom = "";
  let lastRenderAt = 0;
  let loadSeq = 0;

  const renderState = {
    lastHTML: "",
  };

  function viewPayload(extra = {}) {
    const data = safeObject(extra);

    return basePayload(context, {
      dashboard: data.dashboard ?? dashboard,
      loading: data.loading ?? loading,
      refreshing: data.refreshing ?? refreshing,
      error: data.error ?? error,
    });
  }

  function render(extra = {}) {
    if (destroyed || !host) return false;

    const data = safeObject(extra);
    lastRenderAt = now();

    setHostFlags(host, {
      mounted,
      loading: data.loading ?? loading,
      refreshing: data.refreshing ?? refreshing,
    });

    try {
      return renderHtml(
        host,
        renderHomeTemplate(viewPayload(data)),
        renderState
      );
    } catch (renderError) {
      const message = safeError(renderError, "No se pudo pintar el inicio.");
      return renderHtml(host, renderHomeErrorState(message), renderState);
    }
  }

  function renderInitialLoading() {
    loading = true;
    refreshing = false;
    error = "";

    return render({
      loading: true,
      refreshing: false,
      error: "",
    });
  }

  function renderHardError(message = "No se pudo cargar el inicio.") {
    if (destroyed || !host) return false;

    loading = false;
    refreshing = false;
    error = safeError(message, "No se pudo cargar el inicio.");
    lastRenderAt = now();

    setHostFlags(host, {
      mounted,
      loading: false,
      refreshing: false,
    });

    return renderHtml(host, renderHomeErrorState(error), renderState);
  }

  async function load(options = {}) {
    const opts = safeObject(options);
    const seq = ++loadSeq;
    const force = opts.force === true || opts.forceRefresh === true || opts.hardRefresh === true;
    const silent = opts.silent === true;
    const hadDashboard = hasContent(dashboard);

    if (!silent) {
      loading = !hadDashboard;
      refreshing = force && hadDashboard;
      error = "";

      if (loading) {
        renderInitialLoading();
      } else {
        setHostFlags(host, {
          mounted,
          loading: false,
          refreshing,
        });
      }
    }

    try {
      const nextDashboard = await loadHomeDashboard({
        ...opts,
        force,
        returnStaleOnError: true,
      });

      if (destroyed || seq !== loadSeq) {
        return nextDashboard || null;
      }

      if (hasContent(nextDashboard)) {
        dashboard = nextDashboard;
      }

      loading = false;
      refreshing = false;
      error = cleanText(nextDashboard?.error, "");

      render({
        dashboard,
        loading: false,
        refreshing: false,
        error,
      });

      return dashboard;
    } catch (loadError) {
      if (destroyed || seq !== loadSeq) return null;

      loading = false;
      refreshing = false;
      error = safeError(loadError, "No se pudo cargar el inicio.");

      if (hasContent(dashboard)) {
        render({
          dashboard: {
            ...dashboard,
            stale: true,
            error,
          },
          loading: false,
          refreshing: false,
          error,
        });
        return null;
      }

      renderHardError(error);
      return null;
    }
  }

  async function ensureLoaded(options = {}) {
    const opts = safeObject(options);
    const force = opts.force === true || opts.forceRefresh === true || opts.hardRefresh === true;
    const ttlMs = opts.ttlMs ?? HOME_CACHE_TTL_MS;

    if (!force && hasContent(dashboard) && isCachedDashboardFresh(ttlMs)) {
      return dashboard;
    }

    return load({
      ...opts,
      force,
      silent: opts.silent !== false,
      source: cleanText(opts.source, `${SOURCE}.ensure`),
    });
  }

  async function refresh() {
    return load({
      force: true,
      silent: false,
      source: `${SOURCE}.manual-refresh`,
    });
  }

  async function navigateTo(path = "") {
    const route = safeRoute(path, "");
    if (!route) return false;

    const router = getRouter(context);

    for (const method of ["navigate", "go", "push"]) {
      if (!isFunction(router?.[method])) continue;

      await router[method](route, { source: SOURCE });
      return true;
    }

    if (isFunction(AppCore?.navigate)) {
      await AppCore.navigate(route, { source: SOURCE });
      return true;
    }

    if (!isBrowser()) return false;

    try {
      const state = { source: SOURCE, route };
      window.history.pushState(state, "", route);
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
      return true;
    } catch {
      return false;
    }
  }

  async function handleAction(action = "", node = null) {
    const type = cleanText(action, "");

    if (REFRESH_ACTIONS.has(type)) {
      await refresh();
      return true;
    }

    if (NAVIGATION_ACTIONS.has(type)) {
      const route = cleanText(
        node?.dataset?.route ||
          node?.dataset?.href ||
          node?.getAttribute?.("data-route") ||
          node?.getAttribute?.("data-href") ||
          "",
        ""
      );

      return navigateTo(route);
    }

    return false;
  }

  function onClick(event) {
    if (destroyed) return;

    const node = closestAction(event.target);
    if (!node || !host?.contains?.(node)) return;

    const action = actionFrom(node);
    if (!isKnownAction(action)) return;

    event.preventDefault();
    event.stopPropagation();
    event[ROUTER_EVENT_HANDLED_KEY] = true;

    void handleAction(action, node);
  }

  function bind() {
    if (bound || !host) return false;
    host.addEventListener("click", onClick);
    bound = true;
    return true;
  }

  function unbind() {
    if (!bound || !host) return false;
    host.removeEventListener("click", onClick);
    bound = false;
    return true;
  }

  function mount(options = {}) {
    if (destroyed || !host || mounted) return controller;

    const opts = safeObject(options);
    const initial = getInitialDashboard(context, opts);
    const force = opts.force === true || opts.forceRefresh === true || opts.hardRefresh === true;

    mounted = true;
    bind();

    dashboard = initial.dashboard;
    mountedFrom = initial.source;
    loading = !hasContent(dashboard);
    refreshing = false;
    error = cleanText(dashboard?.error, "");

    if (hasContent(dashboard)) {
      render({
        dashboard,
        loading: false,
        refreshing: false,
        error,
      });
    } else {
      renderInitialLoading();
    }

    if (force || !initial.fresh) {
      void load({
        ...opts,
        force,
        silent: hasContent(dashboard),
        source: hasContent(dashboard)
          ? `${SOURCE}.mount.background`
          : `${SOURCE}.mount.initial`,
      });
    }

    return controller;
  }

  function destroy(options = {}) {
    const opts = safeObject(options);

    if (destroyed) return true;

    destroyed = true;
    mounted = false;
    loading = false;
    refreshing = false;
    loadSeq += 1;

    unbind();

    if (opts.keepDom === false || opts.clearDom === true || opts.clear === true) {
      clearHost(host);
      renderState.lastHTML = "";
    }

    clearInstance(host, controller);
    return true;
  }

  const controller = {
    version: HOME_VIEW_VERSION,

    mount,
    destroy,
    unmount: destroy,

    load,
    ensureLoaded,
    refresh,
    reload: refresh,

    getDashboard() {
      return dashboard || getCachedDashboard() || null;
    },

    getSnapshot() {
      return {
        version: HOME_VIEW_VERSION,
        mounted,
        destroyed,
        loading,
        refreshing,
        hasHost: Boolean(host),
        hasDashboard: hasContent(dashboard),
        mountedFrom,
        role: getCurrentRole(context),
        error: redact(error),
        lastRenderAt,
        cache: getCacheState(),
      };
    },
  };

  return controller;
}

/* =========================================================
   PUBLIC VIEW
========================================================= */

export function HomeView(host = null, context = {}) {
  if (!isDomNode(host)) return null;

  destroyPrevious(host);

  const controller = createHomeController(host, safeObject(context));
  storeInstance(host, controller);

  return controller.mount(safeObject(context));
}

export function destroy(options = {}) {
  try {
    return Boolean(lastInstance?.destroy?.(options));
  } catch {
    return false;
  }
}

export function refresh() {
  try {
    return lastInstance?.refresh?.() || null;
  } catch {
    return null;
  }
}

export function loadHome(options = {}) {
  try {
    if (lastInstance?.ensureLoaded) {
      return lastInstance.ensureLoaded(options);
    }

    return loadHomeDashboard({
      ...safeObject(options),
      returnStaleOnError: true,
    });
  } catch {
    return null;
  }
}

export function getDashboard() {
  try {
    return lastInstance?.getDashboard?.() || getCachedDashboard() || null;
  } catch {
    return getCachedDashboard();
  }
}

export function clearHomeViewCache() {
  return clearHomeDashboardCache();
}

export function clearHomeDom() {
  try {
    return Boolean(lastInstance?.destroy?.({
      keepDom: false,
      clearDom: true,
    }));
  } catch {
    return false;
  }
}

export function getSnapshot() {
  if (lastInstance?.getSnapshot) {
    return lastInstance.getSnapshot();
  }

  return {
    version: HOME_VIEW_VERSION,
    mounted: false,
    hasInstance: false,
    role: getCurrentRole({}),
    cache: getCacheState(),
  };
}

export const getDebugSnapshot = getSnapshot;

export default HomeView;
