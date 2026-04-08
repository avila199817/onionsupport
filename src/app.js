/* =========================================================
   Onion SPA - App Bootstrap (FULL PRO SAAS PANEL)
   Archivo: src/app.js

   Responsabilidades:
   - arrancar AppCore
   - inicializar Store
   - bind del router
   - lanzar la primera renderización INMEDIATA
   - restaurar sesión sin bloquear el primer paint
   - montar listeners globales
   - bind de UI global
   - apagar loader
   - aplicar failsafe anti-loader infinito
========================================================= */

import { AppCore } from "./core/core.js";
import { Store } from "./store/store.js";
import { Auth } from "./features/auth.js";
import { Router } from "./router/router.js";
import { SidebarUI } from "./ui/sidebar.js";

const App = (() => {
  "use strict";

  const SCOPE = "app:global";
  const BOOT_FAILSAFE_LOADER_MS = 1800;

  let booted = false;
  let booting = false;
  let storeInitialized = false;
  let routerBound = false;
  let uiInitialized = false;
  let bootFailsafeTimer = null;
  let sessionRestorePromise = null;

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

  function getCurrentCanonicalPath() {
    if (typeof Router?.getCurrentCanonicalPath === "function") {
      return Router.getCurrentCanonicalPath();
    }

    return AppCore.utils.normalizeCanonicalPath(getCurrentPublicPath());
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

  function getShellElements() {
    return {
      sidebar: AppCore.dom.sidebar || document.querySelector(".sidebar"),
      topbar: AppCore.dom.topbar || document.querySelector(".topbar"),
      topbarViewContainer:
        AppCore.dom.topbarViewContainer ||
        document.getElementById("topbarview-container"),
      tableheadContainer:
        AppCore.dom.tableheadContainer ||
        document.getElementById("tablehead-container"),
      body: AppCore.dom.body || document.body,
    };
  }

  function getViewContainer() {
    return (
      AppCore.dom.viewContainer ||
      document.getElementById("view-container") ||
      document.querySelector("#view-container")
    );
  }

  function getLoaderElement() {
    return AppCore.dom.loader || document.getElementById("app-loader");
  }

  function forceHideLoader() {
    const loader = getLoaderElement();

    if (document?.body) {
      document.body.classList.remove("loading");
    }

    if (loader) {
      loader.hidden = true;
      loader.setAttribute("aria-hidden", "true");
      loader.style.display = "none";
      loader.style.opacity = "0";
      loader.style.visibility = "hidden";
      loader.style.pointerEvents = "none";
    }
  }

  function restoreLoaderInlineStyles() {
    const loader = getLoaderElement();
    if (!loader) return;

    loader.style.display = "";
    loader.style.opacity = "";
    loader.style.visibility = "";
    loader.style.pointerEvents = "";
  }

  function closeSearchResults() {
    const results =
      AppCore.dom.searchResults ||
      document.getElementById("topbar-search-results");

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
    const {
      sidebar,
      topbar,
      topbarViewContainer,
      tableheadContainer,
      body,
    } = getShellElements();

    if (sidebar) sidebar.hidden = hidden;
    if (topbar) topbar.hidden = hidden;
    if (topbarViewContainer) topbarViewContainer.hidden = hidden;
    if (tableheadContainer) tableheadContainer.hidden = hidden;

    if (body) {
      body.classList.toggle("route-shell-hidden", hidden);
      body.classList.toggle("auth-screen", hidden);
      body.classList.toggle("route-auth", hidden);
    }
  }

  function markAppBootState({
    booted: isBooted = false,
    booting: isBooting = false,
  } = {}) {
    AppCore.setState({
      booting: Boolean(isBooting),
      ready: Boolean(isBooted),
    });
  }

  function clearBootFailsafeTimer() {
    if (bootFailsafeTimer) {
      window.clearTimeout(bootFailsafeTimer);
      bootFailsafeTimer = null;
    }
  }

  function armBootFailsafeLoader() {
    clearBootFailsafeTimer();

    bootFailsafeTimer = window.setTimeout(() => {
      AppCore.utils.warn("Failsafe loader aplicado tras el arranque inicial.");
      AppCore.setLoading(false);
      forceHideLoader();
    }, BOOT_FAILSAFE_LOADER_MS);
  }

  function isLoginPath(path = "") {
    const normalized = AppCore.utils.normalizePath(path || "/");
    return normalized === "/login" || normalized.startsWith("/login?");
  }

  function applyPostRenderLoaderPolicy() {
    const currentCanonicalPath = getCurrentCanonicalPath();
    const currentPublicPath = getCurrentPublicPath();
    const viewContainer = getViewContainer();
    const hasViewContent = Boolean(viewContainer?.innerHTML?.trim());

    if (
      currentCanonicalPath === "/login" ||
      isLoginPath(currentPublicPath)
    ) {
      AppCore.setLoading(false);
      forceHideLoader();
      setShellVisibility(false);
      return;
    }

    if (hasViewContent) {
      AppCore.setLoading(false);
      forceHideLoader();
    }
  }

  function navigateAfterSessionRestore() {
    if (!AppCore.state.authenticated) return;

    const currentCanonicalPath = getCurrentCanonicalPath();

    if (currentCanonicalPath === "/login") {
      const target =
        typeof Router.goAfterLogin === "function"
          ? null
          : typeof Auth.getPostLoginTarget === "function"
          ? Auth.getPostLoginTarget(AppCore.state.user)
          : "/";

      if (typeof Router.goAfterLogin === "function") {
        Router.goAfterLogin("/");
        return;
      }

      Router.navigate(target || "/", {
        replaceState: true,
        force: true,
      });
      return;
    }

    Router.render(getCurrentPublicPath(), {
      skipHistory: true,
      replaceState: true,
      force: true,
    });
  }

  /* =========================================================
     ERROR SCREEN
  ========================================================= */
  function renderBootError(error) {
    const container = getViewContainer();
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

    forceHideLoader();

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
          Auth.clearSessionLocal?.();
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
    const input =
      AppCore.dom.searchInput || document.getElementById("topbar-search");
    const results =
      AppCore.dom.searchResults ||
      document.getElementById("topbar-search-results");

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

    AppCore.cleanup.event(scope, "app:session:cleared", () => {
      syncUserUI();
      closeSearchResults();
    });

    AppCore.cleanup.event(scope, "auth:login:success", () => {
      syncUserUI();
      closeSearchResults();
    });

    AppCore.cleanup.event(scope, "auth:logout:success", () => {
      closeSearchResults();
    });

    AppCore.cleanup.event(scope, "router:before-render", ({ detail }) => {
      AppCore.utils.log("Router before render:", {
        path: detail?.path || null,
        canonicalPath: detail?.canonicalPath || null,
        username: detail?.username || null,
      });
    });

    AppCore.cleanup.event(scope, "router:rendered", ({ detail }) => {
      const publicPath = getCurrentPublicPath();

      AppCore.setPublicPath(publicPath);
      applyPostRenderLoaderPolicy();

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
    if (!storeInitialized) {
      if (typeof Store?.init === "function") {
        Store.init();
      }

      storeInitialized = true;
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
    if (sessionRestorePromise) {
      return sessionRestorePromise;
    }

    if (typeof Auth.restoreSession !== "function") {
      return {
        ok: false,
        user: null,
      };
    }

    sessionRestorePromise = (async () => {
      try {
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
      } finally {
        sessionRestorePromise = null;
      }
    })();

    return sessionRestorePromise;
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
    applyPostRenderLoaderPolicy();
  }

  async function restoreSessionInBackground() {
    try {
      const result = await restoreAuthSession();

      await warmup();

      if (result?.ok && AppCore.state.authenticated) {
        navigateAfterSessionRestore();
      } else {
        applyPostRenderLoaderPolicy();
      }

      return result;
    } catch (error) {
      AppCore.utils.warn("restoreSession en background falló.", error);
      applyPostRenderLoaderPolicy();
      return {
        ok: false,
        user: null,
        error,
      };
    }
  }

  function finalizeBoot() {
    if (Store?.actions?.markReady) {
      Store.actions.markReady(true);
    }

    if (Store?.actions?.markBooted) {
      Store.actions.markBooted(true);
    }

    AppCore.setLoading(false);
    forceHideLoader();
    armBootFailsafeLoader();

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
    clearBootFailsafeTimer();
    restoreLoaderInlineStyles();

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

      /* =========================================
         CLAVE:
         bind + primer render ANTES de restoreSession
      ========================================= */
      bindRouter();
      renderInitialRoute();

      /* =========================================
         UI después del primer render
      ========================================= */
      initUISystems();

      /* =========================================
         Boot visual completado
      ========================================= */
      finalizeBoot();

      booted = true;
      markAppBootState({ booted: true, booting: false });

      /* =========================================
         Restaurar sesión sin bloquear el login
      ========================================= */
      void restoreSessionInBackground();

      return api;
    } catch (error) {
      booted = false;
      markAppBootState({ booted: false, booting: false });
      AppCore.setError(error);
      AppCore.utils.error("💥 Fallo en boot()", error);

      AppCore.setLoading(false);
      forceHideLoader();
      renderBootError(error);

      return api;
    } finally {
      booting = false;
      AppCore.setLoading(false);
      applyPostRenderLoaderPolicy();
    }
  }

  /* =========================================================
     REBOOT CONTROLADO
  ========================================================= */
  async function reboot(options = {}) {
    const { preserveError = false } = options;

    booted = false;
    booting = false;
    sessionRestorePromise = null;

    clearBootFailsafeTimer();
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

    AppCore.setLoading(false);
    forceHideLoader();

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
