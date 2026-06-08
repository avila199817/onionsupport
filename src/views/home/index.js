/* =========================================================
   Onion Support - Home Index
   Archivo: /src/views/home/index.js

   Producción v10:
   - Sin parpadeos al volver al Home.
   - Sin loader después de tener datos cargados.
   - Sin refresh automático en remount.
   - Sin borrar el host al desmontar.
   - Sin fetch directo.
   - Sin Store.
   - Sin storage propio.
   - Sin listeners globales.
   - Navegación delegada al Router/AppCore.
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
  renderHomeErrorState,
} from "./home.template.js";

export const HOME_INDEX_VERSION = "home.index.v10.no-flicker.memory-locked";
export const HOME_VIEW_VERSION = HOME_INDEX_VERSION;

const SOURCE = "home.view";
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const ROUTER_EVENT_HANDLED_KEY = "__onionRouterHandled";

const ACTIONS = Object.freeze({
  RETRY: "retry",
  REFRESH: "refresh",
  RELOAD: "reload",
  NAVIGATE: "navigate",
});

const REFRESH_ACTIONS = new Set([
  ACTIONS.RETRY,
  ACTIONS.REFRESH,
  ACTIONS.RELOAD,
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

const homeMemory = {
  dashboard: null,
  dashboardSignature: "",
  userKey: "",
  loaded: false,
  loadedAt: 0,
  error: "",
  source: "",
};

let sharedLoadPromise = null;
let sharedLoadUserKey = "";

/* =========================================================
   BASE
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

function now() {
  return Date.now();
}

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

  if (["admin", "administrator", "superadmin", "super_admin", "root", "owner"].includes(role)) {
    return "admin";
  }

  if (["user", "usuario", "client", "cliente"].includes(role)) {
    return "user";
  }

  return "";
}

function safeError(error = null, fallback = "No se pudo cargar el inicio.") {
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

function stableCopy(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    return value.map((item) => stableCopy(item, seen));
  }

  if (!isObject(value)) {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  return Object.keys(value)
    .sort()
    .reduce((output, key) => {
      const item = value[key];

      if (item === undefined || typeof item === "function") {
        return output;
      }

      output[key] = stableCopy(item, seen);
      return output;
    }, {});
}

function signature(value = null) {
  try {
    return JSON.stringify(stableCopy(value));
  } catch {
    return String(value ?? "");
  }
}

/* =========================================================
   CORE / USUARIO / RUTAS
========================================================= */

function getState() {
  try {
    return AppCore?.getState?.() || AppCore?.state || {};
  } catch {
    return AppCore?.state || {};
  }
}

function getCurrentUser(context = {}) {
  const ctx = safeObject(context);
  const state = getState();

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
  const state = getState();
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

function getUserKeyFrom(value = null) {
  const user = safeObject(value, {});

  return cleanText(
    first(
      user.userId,
      user.uid,
      user.sub,
      user.id,
      user._id,
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

function getCurrentUserKey(context = {}) {
  return getUserKeyFrom(getCurrentUser(context));
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
    home: safeRoute(first(custom.home, ROUTES?.home, "/"), "/"),
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
  const ctx = safeObject(context);

  return {
    user: getCurrentUser(ctx),
    role: getCurrentRole(ctx),
    routes: getRoutes(ctx),
    ...safeObject(extra),
  };
}

/* =========================================================
   MEMORIA
========================================================= */

function getDashboardKey(dashboard = null, fallbackUserKey = "") {
  const source = safeObject(dashboard, {});
  const user = safeObject(source.user, {});
  const account = safeObject(source.account, {});
  const scope = safeObject(source.scope, {});

  return cleanText(
    first(
      source.userId,
      source.uid,
      source.sub,
      source.ownerUserId,
      user.userId,
      user.uid,
      user.sub,
      user.id,
      user.email,
      account.userId,
      account.id,
      scope.userId,
      fallbackUserKey,
      ""
    ),
    ""
  ).toLowerCase();
}

function clearHomeMemory() {
  homeMemory.dashboard = null;
  homeMemory.dashboardSignature = "";
  homeMemory.userKey = "";
  homeMemory.loaded = false;
  homeMemory.loadedAt = 0;
  homeMemory.error = "";
  homeMemory.source = "";

  sharedLoadPromise = null;
  sharedLoadUserKey = "";

  return true;
}

function setHomeMemory(
  dashboard = null,
  {
    loaded = true,
    error = "",
    source = "memory",
    userKey = "",
  } = {}
) {
  if (!hasContent(dashboard)) return null;

  const resolvedUserKey = getDashboardKey(dashboard, userKey);

  homeMemory.dashboard = dashboard;
  homeMemory.dashboardSignature = signature(dashboard);
  homeMemory.userKey = resolvedUserKey;
  homeMemory.loaded = Boolean(loaded);
  homeMemory.loadedAt = loaded ? now() : homeMemory.loadedAt || 0;
  homeMemory.error = cleanText(error, "");
  homeMemory.source = cleanText(source, "memory");

  return homeMemory.dashboard;
}

function syncMemoryUser(context = {}) {
  const currentKey = getCurrentUserKey(context);

  if (homeMemory.userKey && currentKey && homeMemory.userKey !== currentKey) {
    clearHomeMemory();
    return true;
  }

  return false;
}

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

function getHydratedDashboard() {
  try {
    const cached = hydrateHomeFromCache?.();
    return hasContent(cached) ? cached : null;
  } catch {
    return null;
  }
}

function isHydratedDashboardFresh(options = {}) {
  try {
    return hasFreshHomeDashboard?.({
      ttlMs: options.ttlMs ?? DEFAULT_CACHE_TTL_MS,
    }) === true;
  } catch {
    return false;
  }
}

function getInitialDashboard(context = {}, options = {}) {
  syncMemoryUser(context);

  const currentKey = getCurrentUserKey(context);
  const contextual = getContextDashboard(context, options);

  if (hasContent(contextual)) {
    setHomeMemory(contextual, {
      loaded: true,
      userKey: currentKey,
      source: "context",
    });

    return {
      dashboard: contextual,
      loaded: true,
      source: "context",
    };
  }

  if (hasContent(homeMemory.dashboard)) {
    return {
      dashboard: homeMemory.dashboard,
      loaded: homeMemory.loaded,
      source: homeMemory.loaded ? "memory.loaded" : "memory.hydrated",
    };
  }

  const hydrated = getHydratedDashboard();

  if (hasContent(hydrated)) {
    const fresh = isHydratedDashboardFresh(options);

    setHomeMemory(hydrated, {
      loaded: fresh,
      userKey: currentKey,
      source: fresh ? "api.cache.fresh" : "api.cache.stale",
    });

    return {
      dashboard: hydrated,
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
    host.dataset.homeMemoryLoaded = homeMemory.loaded ? "true" : "false";
    host.setAttribute("aria-busy", loading || refreshing ? "true" : "false");

    return true;
  } catch {
    return false;
  }
}

function renderHtml(host = null, html = "", cache = {}) {
  if (!host) return false;

  const next = String(html || "");

  if (cache.lastHTML === next || host.innerHTML === next) {
    cache.lastHTML = next;
    return false;
  }

  host.innerHTML = next;
  cache.lastHTML = next;

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
   REGISTRO DE INSTANCIAS
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
   CONTROLADOR
========================================================= */

function createHomeController(host = null, context = {}) {
  let destroyed = false;
  let mounted = false;
  let bound = false;

  let dashboard = null;
  let dashboardSignature = "";

  let loading = false;
  let refreshing = false;
  let error = "";

  let mountedFrom = "";
  let lastRenderAt = 0;
  let loadSeq = 0;

  const renderCache = {
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
        renderCache
      );
    } catch (renderError) {
      const message = safeError(renderError, "No se pudo pintar el inicio.");

      return renderHtml(
        host,
        renderHomeErrorState(message),
        renderCache
      );
    }
  }

  function renderInitialLoading() {
    if (destroyed || !host) return false;

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

    return renderHtml(
      host,
      renderHomeErrorState(error),
      renderCache
    );
  }

  function commitDashboard(nextDashboard = null, meta = {}) {
    if (!hasContent(nextDashboard)) return dashboard;

    dashboard = nextDashboard;
    dashboardSignature = signature(nextDashboard);

    setHomeMemory(nextDashboard, {
      loaded: meta.loaded !== false,
      error: meta.error || cleanText(nextDashboard?.error || "", ""),
      source: meta.source || SOURCE,
      userKey: meta.userKey || getCurrentUserKey(context),
    });

    return dashboard;
  }

  function shouldFetchOnMount(initial = {}, options = {}) {
    const opts = safeObject(options);
    const force = opts.force === true || opts.forceRefresh === true || opts.hardRefresh === true;

    if (force) return true;
    if (!hasContent(dashboard)) return true;
    if (initial.loaded === false && homeMemory.loaded === false) return true;

    return false;
  }

  async function fetchDashboard(options = {}) {
    const opts = safeObject(options);
    const force = opts.force === true || opts.forceRefresh === true || opts.hardRefresh === true;
    const userKey = getCurrentUserKey(context);

    if (!force && homeMemory.loaded && hasContent(homeMemory.dashboard)) {
      return homeMemory.dashboard;
    }

    if (
      !force &&
      sharedLoadPromise &&
      (!sharedLoadUserKey || !userKey || sharedLoadUserKey === userKey)
    ) {
      return sharedLoadPromise;
    }

    const promise = Promise.resolve(
      loadHomeDashboard({
        returnStaleOnError: true,
        ttlMs: opts.ttlMs ?? DEFAULT_CACHE_TTL_MS,
        ...opts,
        force,
        source: cleanText(opts.source, `${SOURCE}.load`),
      })
    );

    if (!force) {
      sharedLoadPromise = promise;
      sharedLoadUserKey = userKey;
    }

    try {
      return await promise;
    } finally {
      if (sharedLoadPromise === promise) {
        sharedLoadPromise = null;
        sharedLoadUserKey = "";
      }
    }
  }

  async function load(options = {}) {
    const opts = safeObject(options);
    const seq = ++loadSeq;

    const force = opts.force === true || opts.forceRefresh === true || opts.hardRefresh === true;
    const silent = opts.silent === true;
    const expectedUserKey = getCurrentUserKey(context);

    if (!force && homeMemory.loaded && hasContent(homeMemory.dashboard)) {
      dashboard = homeMemory.dashboard;
      dashboardSignature = homeMemory.dashboardSignature || signature(homeMemory.dashboard);

      loading = false;
      refreshing = false;
      error = homeMemory.error || "";

      if (!silent && mounted) {
        render({
          dashboard,
          loading: false,
          refreshing: false,
          error,
        });
      } else {
        setHostFlags(host, {
          mounted,
          loading: false,
          refreshing: false,
        });
      }

      return dashboard;
    }

    if (!silent) {
      loading = !hasContent(dashboard);
      refreshing = force && hasContent(dashboard);
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
      const nextDashboard = await fetchDashboard({
        ...opts,
        force,
        silent,
        source: cleanText(opts.source, force ? `${SOURCE}.refresh` : `${SOURCE}.load`),
      });

      const currentUserKey = getCurrentUserKey(context);

      if (expectedUserKey && currentUserKey && expectedUserKey !== currentUserKey) {
        return null;
      }

      if (hasContent(nextDashboard)) {
        setHomeMemory(nextDashboard, {
          loaded: true,
          error: cleanText(nextDashboard?.error || "", ""),
          source: cleanText(opts.source, SOURCE),
          userKey: expectedUserKey,
        });
      }

      if (destroyed || seq !== loadSeq) {
        return nextDashboard || null;
      }

      const beforeSignature = dashboardSignature;
      const beforeError = error;

      if (hasContent(nextDashboard)) {
        dashboard = nextDashboard;
        dashboardSignature = signature(nextDashboard);
      }

      loading = false;
      refreshing = false;
      error = cleanText(nextDashboard?.error || "", "");

      const changed =
        dashboardSignature !== beforeSignature ||
        error !== beforeError ||
        !renderCache.lastHTML;

      if (changed || !silent) {
        render({
          dashboard,
          loading: false,
          refreshing: false,
          error,
        });
      } else {
        setHostFlags(host, {
          mounted,
          loading: false,
          refreshing: false,
        });
      }

      return dashboard;
    } catch (loadError) {
      if (destroyed || seq !== loadSeq) {
        return null;
      }

      loading = false;
      refreshing = false;
      error = safeError(loadError, "No se pudo cargar el inicio.");
      homeMemory.error = error;

      if (hasContent(dashboard)) {
        if (!silent) {
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
        } else {
          setHostFlags(host, {
            mounted,
            loading: false,
            refreshing: false,
          });
        }

        return null;
      }

      renderHardError(error);
      return null;
    }
  }

  async function ensureLoaded(options = {}) {
    const opts = safeObject(options);

    if (homeMemory.loaded && hasContent(homeMemory.dashboard) && opts.force !== true) {
      dashboard = homeMemory.dashboard;
      dashboardSignature = homeMemory.dashboardSignature || signature(homeMemory.dashboard);

      if (mounted) {
        render({
          dashboard,
          loading: false,
          refreshing: false,
          error: homeMemory.error || "",
        });
      }

      return dashboard;
    }

    return load({
      ...opts,
      force: false,
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

    if (isFunction(router?.navigate)) {
      await router.navigate(route, {
        source: SOURCE,
      });

      return true;
    }

    if (isFunction(router?.go)) {
      await router.go(route, {
        source: SOURCE,
      });

      return true;
    }

    if (isFunction(router?.push)) {
      await router.push(route, {
        source: SOURCE,
      });

      return true;
    }

    if (isFunction(AppCore?.navigate)) {
      await AppCore.navigate(route, {
        source: SOURCE,
      });

      return true;
    }

    if (isBrowser()) {
      try {
        window.history.pushState(
          {
            source: SOURCE,
            route,
          },
          "",
          route
        );

        window.dispatchEvent(
          new PopStateEvent("popstate", {
            state: {
              source: SOURCE,
              route,
            },
          })
        );

        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  async function handleAction(action = "", node = null) {
    const type = cleanText(action, "");
    const route = cleanText(
      node?.dataset?.route ||
        node?.dataset?.href ||
        node?.getAttribute?.("data-route") ||
        node?.getAttribute?.("data-href") ||
        "",
      ""
    );

    if (REFRESH_ACTIONS.has(type)) {
      await refresh();
      return true;
    }

    if (NAVIGATION_ACTIONS.has(type)) {
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
    if (destroyed || !host) return controller;
    if (mounted) return controller;

    const opts = safeObject(options);
    const initial = getInitialDashboard(context, opts);

    mounted = true;
    bind();

    dashboard = initial.dashboard;
    dashboardSignature = hasContent(dashboard) ? signature(dashboard) : "";
    mountedFrom = initial.source;

    loading = !hasContent(dashboard);
    refreshing = false;
    error = homeMemory.error || "";

    if (hasContent(dashboard)) {
      render({
        dashboard,
        loading: false,
        refreshing: false,
        error: "",
      });
    } else {
      renderInitialLoading();
    }

    if (shouldFetchOnMount(initial, opts)) {
      void load({
        force: opts.force === true || opts.forceRefresh === true || opts.hardRefresh === true,
        silent: hasContent(dashboard),
        source: hasContent(dashboard)
          ? `${SOURCE}.mount.background.once`
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
      renderCache.lastHTML = "";
    }

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

    load,
    ensureLoaded,

    refresh,
    reload: refresh,

    getDashboard() {
      return dashboard || homeMemory.dashboard || null;
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
        role: getCurrentRole(context),

        error: redact(error),
        lastRenderAt,

        memory: {
          loaded: homeMemory.loaded,
          loadedAt: homeMemory.loadedAt,
          hasDashboard: hasContent(homeMemory.dashboard),
          userKey: homeMemory.userKey ? "***" : "",
          source: homeMemory.source,
          inFlight: Boolean(sharedLoadPromise),
          error: redact(homeMemory.error),
        },

        cache: getCacheState(),
      };
    },

    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };

  return controller;
}

/* =========================================================
   ENTRADA DE VISTA
========================================================= */

export function HomeView(host = null, context = {}) {
  if (!isDomNode(host)) {
    return null;
  }

  destroyPrevious(host);

  const controller = createHomeController(host, safeObject(context));

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

export function destroy(options = {}) {
  try {
    return Boolean(lastInstance?.destroy?.(options));
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
export const refreshHome = refresh;

export function loadHome(options = {}) {
  try {
    if (lastInstance?.ensureLoaded) {
      return lastInstance.ensureLoaded(options);
    }

    return homeMemory.dashboard || null;
  } catch {
    return homeMemory.dashboard || null;
  }
}

export const ensureHome = loadHome;
export const ensureLoaded = loadHome;

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

    memory: {
      loaded: homeMemory.loaded,
      loadedAt: homeMemory.loadedAt,
      hasDashboard: hasContent(homeMemory.dashboard),
      userKey: homeMemory.userKey ? "***" : "",
      source: homeMemory.source,
      inFlight: Boolean(sharedLoadPromise),
      error: redact(homeMemory.error),
    },

    cache: getCacheState(),
  };
}

export const getDebugSnapshot = getSnapshot;

export default HomeView;
