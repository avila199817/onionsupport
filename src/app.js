/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: src/app.js

   Responsabilidades:
   - arrancar AppCore
   - inicializar Store
   - restaurar sesión
   - montar listeners globales
   - bind de UI global
   - bind del router
   - lanzar la primera renderización
   - apagar loader
========================================================= */

import { AppCore } from "./core/core.js";
import { Store } from "./store/store.js";
import { Auth } from "./features/auth.js";
import { Router } from "./router/router.js";
import { SidebarUI } from "./ui/sidebar.js";

const App = (() => {
  "use strict";

  const SCOPE = "app:global";

  let booted = false;
  let booting = false;
  let storeInitialized = false;
  let routerBound = false;
  let uiInitialized = false;

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function getCurrentPath() {
    return AppCore.utils.normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}`
    );
  }

  function getCurrentPublicPath() {
    return AppCore.utils.normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}`
    );
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function ensureScope() {
    return AppCore.cleanup.scope(SCOPE);
  }

  function clearScope() {
    AppCore.cleanup.run(SCOPE);
  }

  function syncUserUI() {
    AppCore.syncUserUI();
  }

  function closeSearchResults() {
    const results = AppCore.dom.searchResults;
    if (!results) return;

    results.hidden = true;
    results.innerHTML = "";
  }

  function getResolvedUsername() {
    return (
      Router.getCurrentResolvedUsername?.() ||
      AppCore.getUserUsername?.() ||
      AppCore.state.user?.username ||
      ""
    );
  }

  function getSearchItems() {
    const username = getResolvedUsername();

    return [
      {
        label: "Inicio",
        path: Router.buildPublicPath("/", { username }),
      },
      {
        label: "Incidencias",
        path: Router.buildPublicPath("/incidencias", { username }),
      },
      {
        label: "Facturas",
        path: Router.buildPublicPath("/facturas", { username }),
      },
      {
        label: "Usuarios",
        path: Router.buildPublicPath("/usuarios", { username }),
      },
      {
        label: "Clientes",
        path: Router.buildPublicPath("/clientes", { username }),
      },
      {
        label: "Cuenta",
        path: Router.buildPublicPath("/cuenta", { username }),
      },
      {
        label: "Ajustes",
        path: Router.buildPublicPath("/ajustes", { username }),
      },
      {
        label: "Login",
        path: "/login",
      },
    ];
  }

  function setShellVisibility(visible = true) {
    const hidden = !visible;

    if (AppCore.dom.sidebar) {
      AppCore.dom.sidebar.hidden = hidden;
    }

    if (AppCore.dom.topbar) {
      AppCore.dom.topbar.hidden = hidden;
    }

    if (AppCore.dom.topbarViewContainer) {
      AppCore.dom.topbarViewContainer.hidden = hidden;
    }

    if (AppCore.dom.tableheadContainer) {
      AppCore.dom.tableheadContainer.hidden = hidden;
    }

    if (AppCore.dom.body) {
      AppCore.dom.body.classList.toggle("route-shell-hidden", hidden);
      AppCore.dom.body.classList.toggle("auth-screen", hidden);
    }
  }

  function markAppBootState({ booted: isBooted = false, booting: isBooting = false } = {}) {
    AppCore.setState({
      booting: Boolean(isBooting),
      ready: Boolean(isBooted),
    });
  }

  /* =========================================================
     ERROR SCREEN
  ========================================================= */
  function renderBootError(error) {
    const container = AppCore.dom.viewContainer;
    if (!container) return;

    const message =
      error?.message ||
      error?.statusText ||
      error?.data?.message ||
      "Se produjo un error al iniciar la aplicación.";

    AppCore.setDocumentTitle("Error de inicio");
    AppCore.clearDynamicContainers();
    setShellVisibility(false);

    container.innerHTML = `
      <section class="content-wrapper">
        <div class="panel-block" style="padding:24px;">
          <div style="display:grid; gap:18px;">
            <div
              style="
                width:56px;
                height:56px;
                border-radius:16px;
                display:grid;
                place-items:center;
                border:1px solid rgba(255,255,255,.08);
                background:rgba(255,255,255,.04);
                font-size:28px;
              "
            >
              ⚠️
            </div>

            <div style="display:grid; gap:8px;">
              <h2 style="margin:0;">Error al iniciar la aplicación</h2>
              <p style="margin:0; color:var(--text-dim);">
                ${escapeHtml(message)}
              </p>
            </div>

            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <button
                type="button"
                id="boot-retry-btn"
                class="btn btn-primary"
              >
                Reintentar
              </button>

              <button
                type="button"
                id="boot-reset-session-btn"
                class="btn"
              >
                Limpiar sesión
              </button>
            </div>
          </div>
        </div>
      </section>
    `;

    const retryBtn = document.getElementById("boot-retry-btn");
    const resetSessionBtn = document.getElementById("boot-reset-session-btn");

    if (retryBtn) {
      AppCore.utils.on(retryBtn, "click", () => {
        window.location.reload();
      });
    }

    if (resetSessionBtn) {
      AppCore.utils.on(resetSessionBtn, "click", () => {
        try {
          Auth.clearSessionLocal();
        } catch (sessionError) {
          AppCore.utils.warn(
            "No se pudo limpiar la sesión desde la pantalla de error.",
            sessionError
          );
        } finally {
          window.location.href = "/login";
        }
      });
    }
  }

  /* =========================================================
     SEARCH UI
  ========================================================= */
  function bindSearchUI(scope) {
    const input = AppCore.dom.searchInput;
    const results = AppCore.dom.searchResults;

    if (!input || !results) return;

    function paintResults(matches = []) {
      if (!matches.length) {
        results.innerHTML = `
          <div
            class="search-empty text-dim"
            style="padding:12px 14px;"
          >
            Sin resultados
          </div>
        `;
        results.hidden = false;
        return;
      }

      results.innerHTML = matches
        .map(
          (item) => `
            <button
              type="button"
              class="search-result-item dropdown-item"
              data-path="${escapeHtml(item.path)}"
            >
              ${escapeHtml(item.label)}
            </button>
          `
        )
        .join("");

      results.hidden = false;
    }

    const runSearch = AppCore.utils.debounce(() => {
      const term = String(input.value || "").trim().toLowerCase();

      if (!term) {
        closeSearchResults();
        return;
      }

      const items = getSearchItems();

      const matches = items.filter((item) => {
        return (
          String(item.label || "").toLowerCase().includes(term) ||
          String(item.path || "").toLowerCase().includes(term)
        );
      });

      paintResults(matches);
    }, 120);

    AppCore.cleanup.on(scope, input, "input", runSearch);

    AppCore.cleanup.on(scope, input, "focus", () => {
      const term = String(input.value || "").trim();
      if (term) {
        runSearch();
      }
    });

    AppCore.cleanup.on(scope, input, "keydown", (event) => {
      if (event.key === "Escape") {
        closeSearchResults();
      }
    });

    AppCore.cleanup.on(scope, results, "click", (event) => {
      const button = event.target.closest("[data-path]");
      if (!button) return;

      const path = button.getAttribute("data-path");
      if (!path) return;

      input.value = "";
      closeSearchResults();

      Router.navigate(path);
    });

    AppCore.cleanup.on(scope, document, "click", (event) => {
      const withinInput = input.contains(event.target);
      const withinResults = results.contains(event.target);

      if (!withinInput && !withinResults) {
        closeSearchResults();
      }
    });
  }

  /* =========================================================
     GLOBAL ERROR HANDLERS
  ========================================================= */
  function bindGlobalErrorHandlers(scope) {
    AppCore.cleanup.on(scope, window, "error", (event) => {
      const error = event?.error || {
        message: event?.message || "Error global no controlado",
      };

      AppCore.setError(error);
      AppCore.utils.error("window.error", error);
    });

    AppCore.cleanup.on(scope, window, "unhandledrejection", (event) => {
      const reason = event?.reason || {
        message: "Promise rechazada sin control",
      };

      AppCore.setError(reason);
      AppCore.utils.error("unhandledrejection", reason);
    });
  }

  /* =========================================================
     GLOBAL APP EVENTS
  ========================================================= */
  function bindAppEvents(scope) {
    AppCore.cleanup.event(scope, "app:user:change", () => {
      syncUserUI();
    });

    AppCore.cleanup.event(scope, "app:user-ui:sync", () => {
      AppCore.utils.log("UI de usuario sincronizada.");
    });

    AppCore.cleanup.event(scope, "app:session:cleared", () => {
      syncUserUI();
      closeSearchResults();
    });

    AppCore.cleanup.event(scope, "app:theme:change", ({ detail }) => {
      AppCore.utils.log("Tema cambiado:", detail?.theme || AppCore.state.theme);
    });

    AppCore.cleanup.event(scope, "app:lang:change", ({ detail }) => {
      AppCore.utils.log("Idioma cambiado:", detail?.lang || AppCore.state.lang);
    });

    AppCore.cleanup.event(scope, "auth:login:success", () => {
      syncUserUI();
      closeSearchResults();

      Router.goAfterLogin("/");
    });

    AppCore.cleanup.event(scope, "auth:logout:success", () => {
      closeSearchResults();
    });

    AppCore.cleanup.event(scope, "router:rendered", ({ detail }) => {
      const publicPath = getCurrentPublicPath();

      AppCore.setPublicPath(publicPath);

      AppCore.utils.log("Ruta renderizada:", {
        publicPath,
        canonicalPath: detail?.canonicalPath || detail?.path || null,
        username: detail?.username || null,
        found: Boolean(detail?.found),
        forbidden: Boolean(detail?.forbidden),
      });
    });
  }

  /* =========================================================
     WARMUP
  ========================================================= */
  async function warmup() {
    AppCore.utils.log("Warmup app iniciado.");
    AppCore.utils.log("API configurada:", AppCore.config.apiBase);

    if (AppCore.state.token) {
      AppCore.utils.log("Token detectado en storage.");
    } else {
      AppCore.utils.log("No hay token en storage.");
    }

    if (AppCore.state.user?.username) {
      AppCore.utils.log("Username detectado:", AppCore.state.user.username);
    }

    AppCore.utils.log("Estado app:", {
      authenticated: AppCore.state.authenticated,
      role: AppCore.state.role,
      route: AppCore.state.route,
      publicPath: AppCore.state.publicPath,
      theme: AppCore.state.theme,
      lang: AppCore.state.lang,
    });
  }

  /* =========================================================
     INIT STEPS
  ========================================================= */
  async function initCore() {
    await AppCore.init();
  }

  function initStore() {
    if (storeInitialized) return;

    if (typeof Store?.init === "function") {
      Store.init();
    }

    if (!AppCore.modules.has("store")) {
      AppCore.modules.register("store", Store);
    }

    if (!AppCore.modules.has("auth")) {
      AppCore.modules.register("auth", Auth);
    }

    if (!AppCore.modules.has("router")) {
      AppCore.modules.register("router", Router);
    }

    storeInitialized = true;
  }

  function initUISystems() {
    if (uiInitialized) return;

    if (SidebarUI && typeof SidebarUI.init === "function") {
      SidebarUI.init();
    } else if (SidebarUI && !AppCore.modules.has("sidebarUI")) {
      AppCore.modules.register("sidebarUI", SidebarUI);
    }

    uiInitialized = true;
  }

  async function restoreAuthSession() {
    if (typeof Auth.restoreSession !== "function") {
      return {
        ok: false,
        user: null,
      };
    }

    const result = await Auth.restoreSession();

    syncUserUI();

    AppCore.utils.log("Resultado restoreSession():", {
      ok: Boolean(result?.ok),
      authenticated: AppCore.state.authenticated,
      user:
        AppCore.state.user?.username ||
        AppCore.state.user?.email ||
        null,
    });

    return result;
  }

  function bindRouter() {
    if (routerBound) return;

    Router.bind();
    routerBound = true;
  }

  function renderInitialRoute() {
    const currentPath = getCurrentPath();

    Router.render(currentPath, {
      skipHistory: true,
      replaceState: true,
      force: true,
    });

    AppCore.setPublicPath(getCurrentPublicPath());
  }

  function finalizeBoot() {
    if (Store?.actions?.markReady) {
      Store.actions.markReady(true);
    }

    if (Store?.actions?.markBooted) {
      Store.actions.markBooted(true);
    }

    AppCore.events.emit("app:ready", {
      route: AppCore.state.route,
      publicPath: AppCore.state.publicPath,
      user: AppCore.state.user,
      authenticated: AppCore.state.authenticated,
    });

    AppCore.utils.log("🔥 Aplicación arrancada correctamente.", {
      route: AppCore.state.route,
      publicPath: AppCore.state.publicPath,
      username: AppCore.state.user?.username || null,
      authenticated: AppCore.state.authenticated,
    });
  }

  /* =========================================================
     BOOT
  ========================================================= */
  async function boot() {
    if (booted) {
      AppCore.utils.warn("App ya arrancada.");
      return api;
    }

    if (booting) {
      AppCore.utils.warn("App ya está arrancando.");
      return api;
    }

    booting = true;
    markAppBootState({ booted: false, booting: true });

    try {
      clearScope();

      await initCore();

      AppCore.setLoading(true);
      AppCore.setError(null);

      const scope = ensureScope();

      bindGlobalErrorHandlers(scope);
      bindAppEvents(scope);
      bindSearchUI(scope);

      initStore();
      initUISystems();

      await restoreAuthSession();
      await warmup();

      bindRouter();
      renderInitialRoute();
      finalizeBoot();

      booted = true;
      markAppBootState({ booted: true, booting: false });

      return api;
    } catch (error) {
      booted = false;
      markAppBootState({ booted: false, booting: false });
      AppCore.setError(error);
      AppCore.utils.error("💥 Fallo en boot()", error);

      renderBootError(error);

      return api;
    } finally {
      booting = false;
      AppCore.setLoading(false);
    }
  }

  /* =========================================================
     REBOOT CONTROLADO
  ========================================================= */
  async function reboot(options = {}) {
    const { preserveError = false } = options;

    booted = false;
    booting = false;

    clearScope();

    if (!preserveError) {
      AppCore.setError(null);
    }

    if (Store?.actions?.markBooted) {
      Store.actions.markBooted(false);
    }

    if (Store?.actions?.markReady) {
      Store.actions.markReady(false);
    }

    return boot();
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  const api = {
    boot,
    reboot,
  };

  return api;
})();

/* =========================================================
   START
========================================================= */
AppCore.ready(() => {
  App.boot();
});
