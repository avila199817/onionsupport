/* =========================================================
   Onion Support - Home Index
   Archivo: /src/views/home/index.js

   Responsabilidad:
   - Controlador mínimo de la vista Home.
   - Montar template.
   - Hidratar desde cache/memoria.
   - Pintar inmediatamente sin bloquear el Router.
   - Cargar dashboard desde home.api.js sólo cuando toca.
   - NO refrescar al cambiar de vista si ya está cargado.
   - Refresh manual explícito.
   - Delegar navegación en Router.
   - Sin Store.
   - Sin storage.
   - Sin fetch directo.
   - Sin HTTP directo.
   - Sin selectors externos.
   - Sin modelos externos.
   - Sin bindings globales.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ROUTES,
} from "../../core/config.js";

import {
  loadHomeDashboard,
  hydrateHomeFromCache,
  hasFreshHomeDashboard,
  getHomeCacheState,
} from "./home.api.js";

import {
  renderHomeTemplate,
  renderHomeLoadingState,
  renderHomeErrorState,
} from "./home.template.js";

export const HOME_INDEX_VERSION = "home.index.solid.v4.no-remount-refresh";
export const HOME_VIEW_VERSION = HOME_INDEX_VERSION;

const SOURCE = "home.view";

const DEFAULT_CACHE_TTL_MS = 60000;
const ROUTER_EVENT_HANDLED_KEY = "__onionRouterHandled";

const ACTIONS = Object.freeze({
  RETRY: "retry",
  REFRESH: "refresh",
  RELOAD: "reload",

  CREATE_INCIDENCIA: "create_incidencia",
  CREATE_INCIDENCIA_ALT: "create-incidencia",

  NAVIGATE: "navigate",
});

const INSTANCES = new WeakMap();

let lastInstance = null;

const homeMemory = {
  dashboard: null,
  userKey: "",
  loaded: false,
  loadedAt: 0,
  error: "",
};

let sharedLoadPromise = null;

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

function first(...values) {
  for (const value of values.flat(Infinity)) {
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

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return "";
}

function safeError(error = null, fallback = "No se pudo cargar el Home.") {
  return cleanText(
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

function now() {
  return Date.now();
}

/* =========================================================
   CORE / ROUTER
========================================================= */

function getState() {
  try {
    return AppCore.getState?.() || AppCore.state || {};
  } catch {
    return AppCore.state || {};
  }
}

function getCurrentUser() {
  const state = getState();

  try {
    return AppCore.getCurrentUser?.() || state.user || state.currentUser || null;
  } catch {
    return state.user || state.currentUser || null;
  }
}

function getCurrentRole() {
  const state = getState();
  const user = safeObject(getCurrentUser(), {});

  return (
    normalizeRole(
      first(
        AppCore.getCurrentRole?.(),
        state.role,
        state.rol,
        state.roles,
        user.role,
        user.rol,
        user.roles,
        ""
      )
    ) || "user"
  );
}

function getCurrentUserKey() {
  const user = safeObject(getCurrentUser(), {});

  return cleanText(
    first(
      user.userId,
      user.uid,
      user.sub,
      user.id,
      user.email,
      user.emailLower,
      user.username,
      user.usernameLower,
      user.slug,
      ""
    ),
    ""
  ).toLowerCase();
}

function getRouter(context = {}) {
  return (
    context.Router ||
    context.router ||
    AppCore.router ||
    AppCore.Router ||
    AppCore.getModule?.("router") ||
    null
  );
}

function getRoutes() {
  return {
    incidencias: ROUTES.incidencias || "/incidencias",
    facturas: ROUTES.facturas || "/facturas",
    clientes: ROUTES.clientes || "/clientes",
    usuarios: ROUTES.usuarios || "/usuarios",
    servidor: ROUTES.servidor || "/servidor",
    cuenta: ROUTES.cuenta || "/cuenta",
    ajustes: ROUTES.ajustes || "/ajustes",
  };
}

function basePayload(extra = {}) {
  return {
    user: getCurrentUser(),
    role: getCurrentRole(),
    routes: getRoutes(),
    ...safeObject(extra),
  };
}

/* =========================================================
   MEMORY CACHE
========================================================= */

function getDashboardKey(dashboard = null) {
  const raw = safeObject(dashboard, {});

  return cleanText(
    first(
      raw.userId,
      raw.uid,
      raw.sub,
      raw.user?.userId,
      raw.user?.id,
      raw.account?.userId,
      raw.account?.id,
      raw.ownerUserId,
      raw.scope?.userId,
      getCurrentUserKey(),
      ""
    ),
    ""
  ).toLowerCase();
}

function clearHomeMemory() {
  homeMemory.dashboard = null;
  homeMemory.userKey = "";
  homeMemory.loaded = false;
  homeMemory.loadedAt = 0;
  homeMemory.error = "";
  sharedLoadPromise = null;

  return true;
}

function setHomeMemory(dashboard = null, { loaded = true, error = "" } = {}) {
  if (!hasContent(dashboard)) return null;

  const key = getDashboardKey(dashboard);

  homeMemory.dashboard = dashboard;
  homeMemory.userKey = key;
  homeMemory.loaded = Boolean(loaded);
  homeMemory.loadedAt = loaded ? now() : homeMemory.loadedAt || 0;
  homeMemory.error = cleanText(error, "");

  return homeMemory.dashboard;
}

function syncMemoryUser() {
  const currentKey = getCurrentUserKey();

  if (homeMemory.userKey && currentKey && homeMemory.userKey !== currentKey) {
    clearHomeMemory();
    return true;
  }

  if (homeMemory.userKey && !currentKey) {
    clearHomeMemory();
    return true;
  }

  return false;
}

function getCachedDashboard() {
  try {
    const cached = hydrateHomeFromCache?.();
    return hasContent(cached) ? cached : null;
  } catch {
    return null;
  }
}

function cacheFresh(options = {}) {
  try {
    return hasFreshHomeDashboard?.({
      ttlMs: options.ttlMs ?? DEFAULT_CACHE_TTL_MS,
    }) === true;
  } catch {
    return false;
  }
}

function getInitialDashboard(options = {}) {
  syncMemoryUser();

  if (hasContent(homeMemory.dashboard)) {
    return {
      dashboard: homeMemory.dashboard,
      loaded: homeMemory.loaded,
      source: homeMemory.loaded ? "memory.loaded" : "memory.hydrated",
    };
  }

  const cached = getCachedDashboard();

  if (hasContent(cached)) {
    const fresh = cacheFresh(options);

    setHomeMemory(cached, {
      loaded: fresh,
    });

    return {
      dashboard: cached,
      loaded: fresh,
      source: fresh ? "api.cache.fresh" : "api.cache.stale",
    };
  }

  return {
    dashboard: null,
    loaded: false,
    source: "empty",
  };
}

function cacheState() {
  try {
    return getHomeCacheState?.() || null;
  } catch {
    return null;
  }
}

/* =========================================================
   DOM
========================================================= */

function renderHtml(host = null, html = "") {
  if (!host) return false;

  host.innerHTML = String(html || "");
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
  const element = target?.nodeType === 3
    ? target.parentElement
    : target;

  return element?.closest?.("[data-home-action], [data-action]") || null;
}

function actionFrom(node = null) {
  return cleanText(
    node?.dataset?.homeAction ||
      node?.dataset?.action ||
      "",
    ""
  );
}

/* =========================================================
   INSTANCE REGISTRY
========================================================= */

function destroyPrevious(host = null) {
  const previous = host ? INSTANCES.get(host) : null;

  if (previous?.destroy) {
    previous.destroy({
      remount: true,
    });

    return true;
  }

  return false;
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
  let lastRenderAt = null;

  let loadSeq = 0;

  function payload(extra = {}) {
    return basePayload({
      dashboard,
      loading,
      refreshing,
      error,

      ...safeObject(extra),
    });
  }

  function render(data = {}) {
    if (destroyed || !host) return false;

    lastRenderAt = now();

    try {
      host.dataset.view = "home";
      host.dataset.homeController = HOME_INDEX_VERSION;
      host.dataset.homeMounted = mounted ? "true" : "false";
      host.dataset.homeLoading = loading ? "true" : "false";
      host.dataset.homeRefreshing = refreshing ? "true" : "false";
      host.setAttribute("aria-busy", loading || refreshing ? "true" : "false");
    } catch {}

    return renderHtml(
      host,
      renderHomeTemplate(
        payload(data)
      )
    );
  }

  function renderLoading() {
    if (destroyed || !host) return false;

    lastRenderAt = now();

    if (hasContent(dashboard)) {
      return render({
        dashboard,
        loading: false,
        refreshing: true,
      });
    }

    return renderHtml(
      host,
      renderHomeLoadingState(
        payload({
          dashboard,
          loading: true,
          refreshing: false,
        })
      )
    );
  }

  function renderError(message = "No se pudo cargar el Home.") {
    if (destroyed || !host) return false;

    error = safeError(message, "No se pudo cargar el Home.");
    lastRenderAt = now();

    if (hasContent(dashboard)) {
      return render({
        dashboard: {
          ...dashboard,
          stale: true,
          error,
        },
        loading: false,
        refreshing: false,
        error,
      });
    }

    return renderHtml(
      host,
      renderHomeErrorState(error)
    );
  }

  async function fetchDashboard(options = {}) {
    const force = options.force === true || options.forceRefresh === true;

    if (!force && sharedLoadPromise) {
      return sharedLoadPromise;
    }

    const promise = Promise.resolve(
      loadHomeDashboard({
        returnStaleOnError: true,
        ttlMs: DEFAULT_CACHE_TTL_MS,
        ...safeObject(options),
        force,
      })
    );

    if (!force) {
      sharedLoadPromise = promise;
    }

    try {
      return await promise;
    } finally {
      if (sharedLoadPromise === promise) {
        sharedLoadPromise = null;
      }
    }
  }

  async function load(options = {}) {
    const seq = ++loadSeq;

    const force = options.force === true || options.forceRefresh === true;
    const silent = options.silent === true;

    error = "";

    if (!silent) {
      loading = !hasContent(dashboard);
      refreshing = force && hasContent(dashboard);

      if (loading) {
        renderLoading();
      } else {
        render({
          loading: false,
          refreshing,
          error: "",
        });
      }
    }

    try {
      const nextDashboard = await fetchDashboard({
        ...options,
        force,
        source: cleanText(options.source, `${SOURCE}.load`),
      });

      if (hasContent(nextDashboard)) {
        setHomeMemory(nextDashboard, {
          loaded: true,
          error: cleanText(nextDashboard?.error || "", ""),
        });
      }

      if (destroyed || seq !== loadSeq) {
        return nextDashboard || null;
      }

      dashboard = hasContent(nextDashboard)
        ? nextDashboard
        : dashboard;

      loading = false;
      refreshing = false;
      error = cleanText(nextDashboard?.error || "", "");

      render({
        dashboard,
        loading: false,
        refreshing: false,
        error,
      });

      return dashboard;
    } catch (loadError) {
      if (destroyed || seq !== loadSeq) {
        return null;
      }

      loading = false;
      refreshing = false;
      error = safeError(loadError, "No se pudo cargar el Home.");

      homeMemory.error = error;

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

      renderError(error);
      return null;
    }
  }

  async function refresh() {
    return load({
      force: true,
      silent: false,
      source: `${SOURCE}.refresh`,
    });
  }

  async function navigateTo(path = "") {
    const route = cleanText(path, "");

    if (!route) return false;

    const Router = getRouter(context);

    if (isFunction(Router?.navigate)) {
      await Router.navigate(route, {
        source: SOURCE,
      });

      return true;
    }

    return false;
  }

  async function handleAction(action = "", node = null) {
    const type = cleanText(action, "");
    const route = cleanText(
      node?.dataset?.route ||
        node?.dataset?.href ||
        "",
      ""
    );

    if (
      type === ACTIONS.RETRY ||
      type === ACTIONS.REFRESH ||
      type === ACTIONS.RELOAD
    ) {
      await refresh();
      return true;
    }

    if (
      type === ACTIONS.CREATE_INCIDENCIA ||
      type === ACTIONS.CREATE_INCIDENCIA_ALT
    ) {
      await navigateTo(route || ROUTES.incidencias || "/incidencias");
      return true;
    }

    if (type === ACTIONS.NAVIGATE) {
      await navigateTo(route);
      return true;
    }

    return false;
  }

  function onClick(event) {
    if (destroyed) return;

    const node = closestAction(event.target);

    if (!node || !host?.contains?.(node)) return;

    const action = actionFrom(node);

    if (!action) return;

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

  function shouldLoadOnMount(options = {}) {
    if (options.force === true || options.forceRefresh === true) return true;
    if (options.refreshOnMount === true) return true;
    if (!hasContent(dashboard)) return true;
    if (!homeMemory.loaded) return true;

    return false;
  }

  function mount(options = {}) {
    if (destroyed || !host) return controller;
    if (mounted) return controller;

    mounted = true;
    bind();

    const initial = getInitialDashboard(options);

    dashboard = initial.dashboard;
    mountedFrom = initial.source;

    loading = !hasContent(dashboard);
    refreshing = false;
    error = "";

    if (hasContent(dashboard)) {
      render({
        dashboard,
        loading: false,
        refreshing: false,
        error: "",
      });
    } else {
      renderLoading();
    }

    if (shouldLoadOnMount(options)) {
      void load({
        force: options.force === true || options.forceRefresh === true,
        silent: hasContent(dashboard),
        source: hasContent(dashboard)
          ? `${SOURCE}.mount.background.once`
          : `${SOURCE}.mount.initial`,
      });
    }

    return controller;
  }

  function destroy() {
    destroyed = true;
    mounted = false;

    loading = false;
    refreshing = false;

    loadSeq += 1;

    unbind();
    clearHost(host);
    clearInstance(host, controller);

    return true;
  }

  const controller = {
    version: HOME_VIEW_VERSION,

    mount,
    destroy,

    unmount: destroy,
    cleanup: destroy,
    dispose: destroy,

    refresh,
    reload: refresh,

    getDashboard() {
      return dashboard;
    },

    getState() {
      return this.getSnapshot();
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

        role: getCurrentRole(),

        error: redact(error),
        lastRenderAt,

        memory: {
          loaded: homeMemory.loaded,
          loadedAt: homeMemory.loadedAt,
          hasDashboard: hasContent(homeMemory.dashboard),
          userKey: homeMemory.userKey ? "***" : "",
          inFlight: Boolean(sharedLoadPromise),
          error: redact(homeMemory.error),
        },

        cache: cacheState(),
      };
    },

    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };

  return controller;
}

/* =========================================================
   VIEW ENTRY
========================================================= */

export async function HomeView(host = null, context = {}) {
  if (!isDomNode(host)) {
    return null;
  }

  destroyPrevious(host);

  const controller = createHomeController(host, context);

  storeInstance(host, controller);

  return controller.mount(
    safeObject(context)
  );
}

export const HomeIndex = HomeView;

export const View = HomeView;
export const view = HomeView;
export const component = HomeView;
export const page = HomeView;

export const mount = HomeView;
export const init = HomeView;
export const bootstrap = HomeView;
export const render = HomeView;

export function destroy() {
  try {
    return Boolean(lastInstance?.destroy?.());
  } catch {
    return false;
  }
}

export const unmount = destroy;
export const cleanup = destroy;
export const dispose = destroy;

export function refresh() {
  try {
    return lastInstance?.refresh?.() || null;
  } catch {
    return null;
  }
}

export const reload = refresh;
export const loadHome = refresh;
export const refreshHome = refresh;

export function getDashboard() {
  try {
    return lastInstance?.getDashboard?.() || homeMemory.dashboard || null;
  } catch {
    return homeMemory.dashboard || null;
  }
}

export function clearHomeViewCache() {
  return clearHomeMemory();
}

export function getSnapshot() {
  if (lastInstance?.getSnapshot) {
    return lastInstance.getSnapshot();
  }

  return {
    version: HOME_VIEW_VERSION,
    mounted: false,
    hasInstance: false,
    role: getCurrentRole(),
    memory: {
      loaded: homeMemory.loaded,
      loadedAt: homeMemory.loadedAt,
      hasDashboard: hasContent(homeMemory.dashboard),
      userKey: homeMemory.userKey ? "***" : "",
      inFlight: Boolean(sharedLoadPromise),
      error: redact(homeMemory.error),
    },
    cache: cacheState(),
  };
}

export const getDebugSnapshot = getSnapshot;

export default HomeView;
