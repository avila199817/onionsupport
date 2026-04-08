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
  let modulesInitialized = false;
  let uiSystemsInitialized = false;

  /* =========================================================
     HELPERS
  ========================================================= */
  function getCurrentPath() {
    return AppCore.utils.normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}`
    );
  }

  function syncUserUI() {
    AppCore.syncUserUI();
  }

  function clearAppScope() {
    AppCore.cleanup.run(SCOPE);
  }

  function ensureScope() {
    return AppCore.cleanup.scope(SCOPE);
  }

  function closeUserDropdown() {
    const userDropdown = AppCore.dom.userDropdown;
    const userToggle = AppCore.dom.userToggle;

    if (userDropdown) {
      userDropdown.classList.remove("open");
      userDropdown.setAttribute("aria-hidden", "true");
    }

    if (userToggle) {
      userToggle.setAttribute("aria-expanded", "false");
    }
  }

  function openUserDropdown() {
    const userDropdown = AppCore.dom.userDropdown;
    const userToggle = AppCore.dom.userToggle;

    if (userDropdown) {
      userDropdown.classList.add("open");
      userDropdown.setAttribute("aria-hidden", "false");
    }

    if (userToggle) {
      userToggle.setAttribute("aria-expanded", "true");
    }
  }

  function toggleUserDropdown() {
    const userDropdown = AppCore.dom.userDropdown;
    if (!userDropdown) return;

    const isOpen = userDropdown.classList.contains("open");

    if (isOpen) {
      closeUserDropdown();
    } else {
      openUserDropdown();
    }
  }

  function closeSearchResults() {
    const results = AppCore.dom.searchResults;
    if (!results) return;

    results.hidden = true;
    results.innerHTML = "";
  }

  function getSearchItems() {
    const username = AppCore.getUserUsername?.() || AppCore.state.user?.username || "";

    return [
      { label: "Inicio", path: Router.buildPublicPath("/", { username }) },
      { label: "Incidencias", path: Router.buildPublicPath("/incidencias", { username }) },
      { label: "Facturas", path: Router.buildPublicPath("/facturas", { username }) },
      { label: "Usuarios", path: Router.buildPublicPath("/usuarios", { username }) },
      { label: "Clientes", path: Router.buildPublicPath("/clientes", { username }) },
      { label: "Cuenta", path: Router.buildPublicPath("/cuenta", { username }) },
      { label: "Ajustes", path: Router.buildPublicPath("/ajustes", { username }) },
      { label: "Login", path: "/login" },
    ];
  }

  function renderBootError(error) {
    if (!AppCore.dom.viewContainer) return;

    const message =
      error?.message ||
      error?.statusText ||
      error?.data?.message ||
      "Se produjo un error al iniciar la aplicación.";

    AppCore.setDocumentTitle("Error de inicio");

    if (AppCore.dom.sidebar) {
      AppCore.dom.sidebar.hidden = true;
    }

    if (AppCore.dom.topbar) {
      AppCore.dom.topbar.hidden = true;
    }

    AppCore.dom.viewContainer.innerHTML = `
      <section class="content-wrapper">
        <div class="panel-block" style="padding:24px;">
          <div style="display:grid; gap:16px;">
            <div style="font-size:32px; line-height:1;">⚠️</div>

            <div>
              <h2 style="margin:0 0 8px 0;">Error al iniciar la aplicación</h2>
              <p style="margin:0; color:var(--text-dim);">
                ${AppCore.utils.escapeHtml(message)}
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
          AppCore.utils.warn("No se pudo limpiar la sesión desde boot error.", sessionError);
        } finally {
          window.location.href = "/login";
        }
      });
    }
  }

  /* =========================================================
     UI GLOBAL
  ========================================================= */
  function bindSidebarToggle(scope) {
    const toggle = AppCore.dom.sidebarToggle || document.getElementById("toggleSidebar");
    if (!toggle) return;

    AppCore.cleanup.on(scope, toggle, "click", () => {
      AppCore.setSidebarOpen(!AppCore.state.sidebarOpen);
    });
  }

  function bindUserDropdown(scope) {
    const userToggle = AppCore.dom.userToggle || document.getElementById("userToggle");
    const userDropdown = AppCore.dom.userDropdown || document.getElementById("userDropdown");

    if (!userToggle || !userDropdown) return;

    userToggle.setAttribute("aria-haspopup", "menu");
    userToggle.setAttribute("aria-expanded", "false");
    userDropdown.setAttribute("aria-hidden", "true");

    AppCore.cleanup.on(scope, userToggle, "click", (event) => {
      event.stopPropagation();
      toggleUserDropdown();
    });

    AppCore.cleanup.on(scope, userToggle, "keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleUserDropdown();
      }

      if (event.key === "Escape") {
        closeUserDropdown();
      }
    });

    AppCore.cleanup.on(scope, document, "click", (event) => {
      const withinDropdown = userDropdown.contains(event.target);
      const withinToggle = userToggle.contains(event.target);

      if (!withinDropdown && !withinToggle) {
        closeUserDropdown();
      }
    });

    AppCore.cleanup.on(scope, document, "keydown", (event) => {
      if (event.key === "Escape") {
        closeUserDropdown();
      }
    });
  }

  function bindLogoutButton(scope) {
    const logoutBtn = AppCore.dom.logoutBtn || document.getElementById("logoutBtn");
    if (!logoutBtn) return;

    AppCore.cleanup.on(scope, logoutBtn, "click", async () => {
      try {
        await Auth.logout({
          silent: true,
          notifyServer: true,
        });
      } catch (error) {
        AppCore.utils.warn("Logout con error controlado", error);
      } finally {
        closeUserDropdown();
        syncUserUI();

        Router.navigate("/login", {
          replaceState: true,
          force: true,
        });
      }
    });
  }

  function bindSearchUI(scope) {
    const input = AppCore.dom.searchInput;
    const results = AppCore.dom.searchResults;

    if (!input || !results) return;

    function paintResults(matches) {
      if (!matches.length) {
        results.innerHTML = `
          <div class="search-empty text-dim" style="padding:12px 14px;">
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
              data-path="${AppCore.utils.escapeHtml(item.path)}"
            >
              ${AppCore.utils.escapeHtml(item.label)}
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
          item.label.toLowerCase().includes(term) ||
          item.path.toLowerCase().includes(term)
        );
      });

      paintResults(matches);
    }, 120);

    AppCore.cleanup.on(scope, input, "input", runSearch);

    AppCore.cleanup.on(scope, results, "click", (event) => {
      const btn = event.target.closest("[data-path]");
      if (!btn) return;

      const path = btn.getAttribute("data-path");
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

    AppCore.cleanup.on(scope, input, "keydown", (event) => {
      if (event.key === "Escape") {
        closeSearchResults();
      }
    });
  }

  function bindGlobalUI(scope) {
    bindSidebarToggle(scope);
    bindUserDropdown(scope);
    bindLogoutButton(scope);
    bindSearchUI(scope);
  }

  /* =========================================================
     ERRORES GLOBALES
  ========================================================= */
  function bindGlobalErrorHandlers(scope) {
    AppCore.cleanup.on(scope, window, "error", (event) => {
      AppCore.setError(event.error || event.message || "Error global no controlado");
      AppCore.utils.error("window.error", event.error || event.message);
    });

    AppCore.cleanup.on(scope, window, "unhandledrejection", (event) => {
      AppCore.setError(event.reason || "Promise rechazada sin control");
      AppCore.utils.error("unhandledrejection", event.reason);
    });
  }

  /* =========================================================
     EVENTOS APP
  ========================================================= */
  function bindAppEvents(scope) {
    AppCore.cleanup.event(scope, "app:user:change", () => {
      syncUserUI();
    });

    AppCore.cleanup.event(scope, "app:session:cleared", () => {
      syncUserUI();
      closeUserDropdown();
      closeSearchResults();
    });

    AppCore.cleanup.event(scope, "app:theme:change", () => {
      AppCore.utils.log("Tema cambiado a:", AppCore.state.theme);
    });

    AppCore.cleanup.event(scope, "auth:login:success", () => {
      syncUserUI();
      closeUserDropdown();

      Router.goAfterLogin("/");
    });

    AppCore.cleanup.event(scope, "router:rendered", ({ detail }) => {
      AppCore.setPublicPath(window.location.pathname + window.location.search);

      AppCore.utils.log("Ruta renderizada:", {
        publicPath: window.location.pathname + window.location.search,
        canonicalPath: detail?.canonicalPath || detail?.path || null,
        username: detail?.username || null,
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

    AppCore.utils.log("Estado auth:", {
      authenticated: AppCore.state.authenticated,
      role: AppCore.state.role,
      route: AppCore.state.route,
      publicPath: AppCore.state.publicPath,
    });
  }

  /* =========================================================
     BOOT STEPS
  ========================================================= */
  async function initCore() {
    await AppCore.init();
  }

  function initStoreAndModules() {
    if (!modulesInitialized) {
      if (typeof Store?.init === "function") {
        Store.init();
      }

      AppCore.modules.register("store", Store);
      AppCore.modules.register("auth", Auth);
      AppCore.modules.register("router", Router);

      if (SidebarUI) {
        AppCore.modules.register("sidebarUI", SidebarUI);
      }

      modulesInitialized = true;
      return;
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

    if (SidebarUI && !AppCore.modules.has("sidebarUI")) {
      AppCore.modules.register("sidebarUI", SidebarUI);
    }
  }

  function initUISystems() {
    if (uiSystemsInitialized) return;

    if (SidebarUI && typeof SidebarUI.init === "function") {
      SidebarUI.init();
    }

    uiSystemsInitialized = true;
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
      user: AppCore.state.user?.username || AppCore.state.user?.email || null,
    });

    return result;
  }

  function initRouter() {
    Router.bind();

    Router.render(getCurrentPath(), {
      skipHistory: true,
      replaceState: true,
      force: true,
    });

    AppCore.setPublicPath(window.location.pathname + window.location.search);
  }

  function finalizeBoot() {
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
      return;
    }

    if (booting) {
      AppCore.utils.warn("App ya está arrancando.");
      return;
    }

    booting = true;

    try {
      clearAppScope();

      await initCore();

      AppCore.setLoading(true);
      AppCore.setError(null);

      const scope = ensureScope();

      bindGlobalErrorHandlers(scope);
      bindAppEvents(scope);
      bindGlobalUI(scope);

      initStoreAndModules();
      initUISystems();

      await restoreAuthSession();
      await warmup();

      initRouter();
      finalizeBoot();

      booted = true;
    } catch (error) {
      booted = false;
      AppCore.setError(error);
      AppCore.utils.error("💥 Fallo en boot()", error);

      renderBootError(error);
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

    clearAppScope();

    if (!preserveError) {
      AppCore.setError(null);
    }

    await boot();
  }

  /* =========================================================
     EXPORT
  ========================================================= */
  return {
    boot,
    reboot,
  };
})();

/* =========================================================
   START
========================================================= */
AppCore.ready(() => {
  App.boot();
});