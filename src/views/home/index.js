/* =========================================================
   Onion Support - Home Index
   Archivo: /src/views/home/index.js

   Responsabilidad:
   - Controlador mínimo de la vista Home.
   - Montar template.
   - Hidratar desde cache real en memoria.
   - Cargar dashboard desde home.api.js sólo cuando toca.
   - Evitar recarga innecesaria al cambiar de vista.
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

export const HOME_INDEX_VERSION = "home.index.cached.v3.real-hydration";
export const HOME_VIEW_VERSION = HOME_INDEX_VERSION;

const SOURCE = "home.view";

const DEFAULT_CACHE_TTL_MS = 60000;

const ACTIONS = Object.freeze({
  RETRY: "retry",
  CREATE_INCIDENCIA: "create_incidencia",
  NAVIGATE: "navigate",
});

const INSTANCES = new WeakMap();

let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeError(error = null) {
  if (!error) return "No se pudo cargar el Home.";

  return cleanText(
    error.message ||
      error.data?.message ||
      error.payload?.message ||
      error.response?.message ||
      "No se pudo cargar el Home.",
    "No se pudo cargar el Home."
  );
}

function now() {
  return Date.now();
}

function isDomNode(value = null) {
  return Boolean(
    typeof Node !== "undefined" &&
      value &&
      value instanceof Node
  );
}

/* =========================================================
   CORE / ROUTER
========================================================= */

function getCurrentUser() {
  try {
    return AppCore.getCurrentUser?.() || AppCore.state?.user || AppCore.state?.currentUser || null;
  } catch {
    return AppCore.state?.user || null;
  }
}

function getCurrentRole() {
  try {
    return AppCore.getCurrentRole?.() || AppCore.state?.role || "user";
  } catch {
    return "user";
  }
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
    ...extra,
  };
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

/* =========================================================
   INSTANCE REGISTRY
========================================================= */

function destroyPrevious(host = null) {
  const previous = INSTANCES.get(host);

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
  let loading = false;
  let dashboard = null;
  let lastError = null;
  let lastRenderAt = null;
  let loadSeq = 0;

  function getCachedDashboard() {
    try {
      const cached = hydrateHomeFromCache?.();
      return isObject(cached) ? cached : null;
    } catch {
      return null;
    }
  }

  function cacheFresh(options = {}) {
    try {
      if (
        hasFreshHomeDashboard?.({
          ttlMs: options.ttlMs ?? DEFAULT_CACHE_TTL_MS,
        }) !== true
      ) {
        return false;
      }

      return isObject(getCachedDashboard());
    } catch {
      return false;
    }
  }

  function cacheState() {
    try {
      return getHomeCacheState?.() || null;
    } catch {
      return null;
    }
  }

  function payload(extra = {}) {
    return basePayload({
      dashboard,
      loading,
      error: lastError,
      ...extra,
    });
  }

  function render(data = {}) {
    if (destroyed || !host) return false;

    lastRenderAt = now();

    return renderHtml(
      host,
      renderHomeTemplate(
        payload(data)
      )
    );
  }

  function renderLoading({ preferCached = true } = {}) {
    if (destroyed || !host) return false;

    lastRenderAt = now();

    if (preferCached && isObject(dashboard)) {
      return renderHtml(
        host,
        renderHomeTemplate(
          payload({
            dashboard,
            loading: true,
          })
        )
      );
    }

    return renderHtml(
      host,
      renderHomeLoadingState(
        payload({
          dashboard,
          loading: true,
        })
      )
    );
  }

  function renderError(error = null) {
    if (destroyed || !host) return false;

    const message = safeError(error);
    lastError = message;
    lastRenderAt = now();

    if (isObject(dashboard)) {
      return renderHtml(
        host,
        renderHomeTemplate(
          payload({
            dashboard: {
              ...dashboard,
              stale: true,
              error: message,
            },
            loading: false,
            error: message,
          })
        )
      );
    }

    return renderHtml(host, renderHomeErrorState(message));
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

  async function load(options = {}) {
    const seq = ++loadSeq;
    const force = options.force === true || options.forceRefresh === true;
    const fresh = !force && cacheFresh(options);

    lastError = null;

    if (fresh) {
      const cached = getCachedDashboard();

      if (isObject(cached)) {
        dashboard = cached;
        loading = false;

        render({
          dashboard,
          loading: false,
        });

        return dashboard;
      }
    }

    loading = true;

    renderLoading({
      preferCached: true,
    });

    try {
      const nextDashboard = await loadHomeDashboard({
        returnStaleOnError: true,
        ttlMs: DEFAULT_CACHE_TTL_MS,
        ...options,
      });

      if (destroyed || seq !== loadSeq) {
        return nextDashboard;
      }

      dashboard = nextDashboard;
      loading = false;
      lastError = cleanText(nextDashboard?.error || "", "");

      render({
        dashboard,
        loading: false,
        error: lastError,
      });

      return dashboard;
    } catch (error) {
      if (destroyed || seq !== loadSeq) {
        return null;
      }

      loading = false;
      renderError(error);

      return null;
    }
  }

  async function refresh() {
    return load({
      force: true,
      source: `${SOURCE}.refresh`,
    });
  }

  async function handleAction(action = "", node = null) {
    const type = cleanText(action, "");
    const route = cleanText(node?.dataset?.route || node?.dataset?.href || "", "");

    if (type === ACTIONS.RETRY) {
      await refresh();
      return true;
    }

    if (type === ACTIONS.CREATE_INCIDENCIA) {
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

    const action = cleanText(node.dataset.homeAction || node.dataset.action, "");

    if (!action) return;

    event.preventDefault();

    void handleAction(action, node);
  }

  function bind() {
    host?.addEventListener?.("click", onClick);
    return true;
  }

  function unbind() {
    host?.removeEventListener?.("click", onClick);
    return true;
  }

  async function mount(options = {}) {
    if (destroyed || !host) return null;
    if (mounted) return controller;

    mounted = true;
    bind();

    dashboard = getCachedDashboard();

    if (isObject(dashboard) && cacheFresh(options)) {
      loading = false;

      render({
        dashboard,
        loading: false,
      });

      return controller;
    }

    if (isObject(dashboard)) {
      loading = false;

      render({
        dashboard,
        loading: false,
      });

      void load({
        source: `${SOURCE}.background`,
      });

      return controller;
    }

    loading = true;

    renderLoading({
      preferCached: false,
    });

    void load({
      source: `${SOURCE}.initial`,
    });

    return controller;
  }

  function destroy() {
    destroyed = true;
    mounted = false;
    loading = false;
    loadSeq += 1;

    unbind();

    if (host) {
      clearHost(host);
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

    refresh,

    reload: refresh,

    getSnapshot() {
      return {
        version: HOME_VIEW_VERSION,

        mounted,
        destroyed,
        loading,

        hasHost: Boolean(host),
        hasDashboard: isObject(dashboard),

        role: getCurrentRole(),

        lastError,
        lastRenderAt,

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
   VIEW EXPORT
========================================================= */

export async function HomeView(host = null, context = {}) {
  if (!isDomNode(host)) {
    return null;
  }

  destroyPrevious(host);

  const controller = createHomeController(host, context);

  storeInstance(host, controller);

  return controller.mount();
}

export const HomeIndex = HomeView;

export function destroy() {
  try {
    return Boolean(lastInstance?.destroy?.());
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
    role: getCurrentRole(),
  };
}

export const getDebugSnapshot = getSnapshot;

export default HomeView;
