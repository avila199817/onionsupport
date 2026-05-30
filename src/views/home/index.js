/* =========================================================
   Onion Support - Home Index
   Archivo: /src/views/home/index.js

   Responsabilidad:
   - Controlador mínimo de la vista Home.
   - Montar template.
   - Cargar dashboard desde home.api.js.
   - Delegar navegación en Router.
   - Sin Store, state externo, selectors, model, bindings ni homeView.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ROUTES,
} from "../../core/config.js";

import {
  loadHomeDashboard,
  hydrateHomeFromCache,
} from "./home.api.js";

import {
  renderHomeTemplate,
  renderHomeLoadingState,
  renderHomeErrorState,
} from "./home.template.js";

export const HOME_INDEX_VERSION = "home.index.minimal.v1";
export const HOME_VIEW_VERSION = HOME_INDEX_VERSION;

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
      "No se pudo cargar el Home.",
    "No se pudo cargar el Home."
  );
}

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

function renderHtml(host = null, html = "") {
  if (!host) return false;

  host.innerHTML = html;
  return true;
}

function createHomeController(host = null, context = {}) {
  let destroyed = false;
  let loading = false;
  let dashboard = hydrateHomeFromCache();

  async function navigateTo(path = "") {
    const route = cleanText(path, "");

    if (!route) return false;

    const Router = getRouter(context);

    if (isFunction(Router?.navigate)) {
      await Router.navigate(route, {
        source: "home",
      });

      return true;
    }

    return false;
  }

  function render(data = {}) {
    if (destroyed || !host) return false;

    return renderHtml(
      host,
      renderHomeTemplate(
        basePayload({
          dashboard,
          loading,
          ...data,
        })
      )
    );
  }

  function renderLoading() {
    if (destroyed || !host) return false;

    return renderHtml(
      host,
      renderHomeLoadingState(
        basePayload({
          dashboard,
          loading: true,
        })
      )
    );
  }

  function renderError(error = null) {
    if (destroyed || !host) return false;

    return renderHtml(host, renderHomeErrorState(safeError(error)));
  }

  async function load(options = {}) {
    loading = true;
    renderLoading();

    try {
      dashboard = await loadHomeDashboard({
        returnStaleOnError: true,
        ...options,
      });

      loading = false;
      render();

      return dashboard;
    } catch (error) {
      loading = false;
      renderError(error);
      return null;
    }
  }

  async function handleAction(action = "", node = null) {
    const route = cleanText(node?.dataset?.route || node?.dataset?.href || "", "");

    if (action === "retry") {
      await load({
        force: true,
      });
      return true;
    }

    if (action === "create_incidencia") {
      await navigateTo(route || ROUTES.incidencias || "/incidencias");
      return true;
    }

    if (action === "navigate") {
      await navigateTo(route);
      return true;
    }

    return false;
  }

  function onClick(event) {
    const target = event.target?.nodeType === 3
      ? event.target.parentElement
      : event.target;

    const node = target?.closest?.("[data-home-action], [data-action]");

    if (!node) return;

    const action = cleanText(node.dataset.homeAction || node.dataset.action, "");

    if (!action) return;

    event.preventDefault();

    void handleAction(action, node);
  }

  function bind() {
    host?.addEventListener?.("click", onClick);
  }

  function unbind() {
    host?.removeEventListener?.("click", onClick);
  }

  return {
    version: HOME_VIEW_VERSION,

    async mount() {
      bind();
      renderLoading();
      void load();

      return this;
    },

    destroy() {
      destroyed = true;
      unbind();

      if (host) {
        host.replaceChildren();
      }

      return true;
    },

    unmount() {
      return this.destroy();
    },

    cleanup() {
      return this.destroy();
    },

    refresh() {
      return load({
        force: true,
      });
    },

    getSnapshot() {
      return {
        version: HOME_VIEW_VERSION,
        destroyed,
        loading,
        hasHost: Boolean(host),
        hasDashboard: isObject(dashboard),
        role: getCurrentRole(),
      };
    },
  };
}

export async function HomeView(host = null, context = {}) {
  const controller = createHomeController(host, context);
  return controller.mount();
}

export const HomeIndex = HomeView;

export default HomeView;
