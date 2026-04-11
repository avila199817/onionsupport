/* =========================================================
   Onion SPA - App Bootstrap (FULL PRO SAAS PANEL · FINAL PRO SYSTEM v3)
   Archivo: src/app.js

   Responsabilidades:
   - arrancar AppCore
   - inicializar Store
   - bind del router
   - lanzar la primera renderización inmediata
   - restaurar sesión sin bloquear el primer paint
   - montar listeners globales
   - bind de UI global
   - inicializar SidebarUI / TopbarUI / Toast / i18n
   - apagar loader de forma robusta
   - aplicar failsafe anti-loader infinito real
   - evitar race conditions en boot / reboot
   - mantener compatibilidad con shell SPA actual
   - rerender de ruta al cambiar idioma
========================================================= */

import { AppCore } from "./core/core.js";
import { Store } from "./store/store.js";
import { Auth } from "./features/auth.js";
import { Router } from "./router/router.js";
import { SidebarUI } from "./ui/sidebar.js";
import { TopbarUI } from "./ui/topbar.js";
import { Toast } from "./ui/toast.js";
import { I18n } from "./i18n/index.js";

const App = (() => {
  "use strict";

  /* =========================================================
     CONFIG LOCAL APP
  ========================================================= */
  const SCOPE = "app:global";
  const BOOT_FAILSAFE_LOADER_MS = 2500;

  /* =========================================================
     FLAGS INTERNOS
  ========================================================= */
  let booted = false;
  let booting = false;
  let storeInitialized = false;
  let routerBound = false;
  let uiInitialized = false;
  let i18nInitialized = false;
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

  function registerModule(name, moduleRef) {
    if (!name || !moduleRef) return;
    if (AppCore.modules.has(name)) return;
    AppCore.modules.register(name, moduleRef);
  }

  function syncUserUI() {
    AppCore.syncUserUI?.();

    AppCore.events.emit("app:user-ui:sync", {
      user: AppCore.state.user || null,
      authenticated: Boolean(AppCore.state.authenticated),
      role: AppCore.state.role || null,
    });
  }

  function syncLangState() {
    try {
      const lang = I18n.getLang?.() || AppCore.state.lang || "es";

      AppCore.setState({
        lang,
      });

      document.documentElement.setAttribute("lang", lang);

      return lang;
    } catch {
      const fallbackLang = AppCore.state.lang || AppCore.config.defaultLang || "es";

      AppCore.setState({
        lang: fallbackLang,
      });

      document.documentElement.setAttribute("lang", fallbackLang);

      return fallbackLang;
    }
  }

  function getShellElements() {
    return {
      sidebar: AppCore.dom.sidebar || document.querySelector(".sidebar"),
      topbar: AppCore.dom.topbar || document.querySelector(".topbar"),
      tablehead:
        document.getElementById("table-head") ||
        document.querySelector(".table-head"),
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

  /* =========================================================
     I18N
  ========================================================= */
  function initI18n() {
    if (i18nInitialized) {
      syncLangState();
      return;
    }

    try {
      I18n.boot?.();
    } catch (error) {
      AppCore.utils.warn("I18n.boot falló; se continuará con fallback.", error);
    }

    syncLangState();
    registerModule("i18n", I18n);

    i18nInitialized = true;

    AppCore.utils.log("I18n inicializado.", {
      lang: AppCore.state.lang,
      available: I18n?.getAvailable?.() || [],
    });
  }

  function rerenderCurrentRoute() {
    const currentPath = getCurrentPublicPath();

    AppCore.utils.log("Rerender por cambio de idioma.", {
      path: currentPath,
      lang: AppCore.state.lang,
    });

    Router.render(currentPath, {
      skipHistory: true,
      replaceState: true,
      force: true,
    });

    AppCore.setPublicPath(currentPath);
    applyPostRenderLoaderPolicy();
    syncUserUI();
  }

  /* =========================================================
     LOADER / VISUAL BOOT CONTROL
  ========================================================= */
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

    loader.hidden = false;
    loader.setAttribute("aria-hidden", "false");
    loader.style.display = "";
    loader.style.opacity = "";
    loader.style.visibility = "";
    loader.style.pointerEvents = "";
  }

  function showLoader() {
    restoreLoaderInlineStyles();
    AppCore.setLoading(true);
  }

  function hideLoader() {
    AppCore.setLoading(false);
    forceHideLoader();
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
      const stillBooting = Boolean(booting || AppCore.state.booting);
      const loaderStillVisible = Boolean(AppCore.state.loading);

      if (!stillBooting && !loaderStillVisible) {
        return;
      }

      AppCore.utils.warn(
        "Failsafe loader aplicado: el arranque excedió el umbral previsto.",
        {
          booting,
          coreBooting: AppCore.state.booting,
          loading: AppCore.state.loading,
          route: AppCore.state.route,
          publicPath: AppCore.state.publicPath,
        }
      );

      hideLoader();
    }, BOOT_FAILSAFE_LOADER_MS);
  }

  /* =========================================================
     SHELL / VISIBILIDAD
  ========================================================= */
  function setShellVisibility(visible = true) {
    const hidden = !visible;
    const {
      sidebar,
      topbar,
      tablehead,
      tableheadContainer,
      body,
    } = getShellElements();

    if (sidebar) sidebar.hidden = hidden;
    if (topbar) topbar.hidden = hidden;
    if (tablehead) tablehead.hidden = hidden;
    if (tableheadContainer) tableheadContainer.hidden = hidden;

    if (body) {
      body.classList.toggle("route-shell-hidden", hidden);
      body.classList.toggle("auth-screen", hidden);
      body.classList.toggle("route-auth", hidden);
    }

    AppCore.events.emit("router:shell:change", {
      hidden,
    });
  }

  function isLoginPath(path = "") {
    const normalized = AppCore.utils.normalizePath(path || "/");
    return normalized === "/login" || normalized.startsWith("/login?");
  }

  function isAuthLikeRoute() {
    const currentCanonicalPath = getCurrentCanonicalPath();
    const currentPublicPath = getCurrentPublicPath();

    return (
      currentCanonicalPath === "/login" ||
      isLoginPath(currentPublicPath)
    );
  }

  function updateShellVisibilityByRoute() {
    if (isAuthLikeRoute()) {
      setShellVisibility(false);
      return;
    }

    setShellVisibility(true);
  }

  function applyPostRenderLoaderPolicy() {
    const viewContainer = getViewContainer();
    const hasViewContent = Boolean(viewContainer?.innerHTML?.trim());

    updateShellVisibilityByRoute();

    if (isAuthLikeRoute()) {
      hideLoader();
      return;
    }

    if (hasViewContent) {
      hideLoader();
    }
  }

  /* =========================================================
     ESTADO DE BOOT
  ========================================================= */
  function markAppBootState({
    booted: isBooted = false,
    booting: isBooting = false,
  } = {}) {
    AppCore.setState({
      booting: Boolean(isBooting),
      ready: Boolean(isBooted),
    });
  }

  function markStoreBootState({
    ready = false,
    booted = false,
  } = {}) {
    if (Store?.actions?.markReady) {
      Store.actions.markReady(Boolean(ready));
    }

    if (Store?.actions?.markBooted) {
      Store.actions.markBooted(Boolean(booted));
    }
  }

  /* =========================================================
     NAVEGACIÓN POST-SESSION
  ========================================================= */
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
    AppCore.clearDynamicContainers?.();
    setShellVisibility(false);
    hideLoader();

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
                class="ui-btn ui-btn-primary"
              >
                Reintentar
              </button>

              <button
                type="button"
                id="boot-reset-session-btn"
                class="ui-btn ui-btn-secondary"
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
     GLOBAL ERROR HANDLERS
  ========================================================= */
  function bindGlobalErrorHandlers(scope) {
    AppCore.cleanup.on(scope, window, "error", (event) => {
      const error = event?.error || {
        message: event?.message || "Error global no controlado",
      };

      AppCore.setError(error);
      AppCore.utils.error("window.error", error);

      Toast?.error?.(
        error?.message || "Se ha producido un error inesperado.",
        {
          title: "Error",
          duration: 5000,
        }
      );
    });

    AppCore.cleanup.on(scope, window, "unhandledrejection", (event) => {
      const reason = event?.reason || {
        message: "Promise rechazada sin control",
      };

      AppCore.setError(reason);
      AppCore.utils.error("unhandledrejection", reason);

      Toast?.error?.(
        reason?.message || "Se ha producido un error inesperado.",
        {
          title: "Error",
          duration: 5000,
        }
      );
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
    });

    AppCore.cleanup.event(scope, "app:lang:change", ({ detail }) => {
      const lang = String(detail?.lang || I18n.getLang?.() || "es");

      AppCore.setState({
        lang,
      });

      document.documentElement.setAttribute("lang", lang);

      rerenderCurrentRoute();

      Toast?.success?.(I18n.t("settings.languageChanged", {}, "Idioma actualizado"), {
        title: I18n.t("settings.language", {}, "Idioma"),
        duration: 2200,
      });

      AppCore.utils.log("Idioma cambiado.", {
        lang,
        route: getCurrentPublicPath(),
      });
    });

    AppCore.cleanup.event(scope, "auth:login:success", () => {
      syncUserUI();

      Toast?.success?.("Sesión iniciada correctamente.", {
        title: "Bienvenido",
        duration: 2800,
      });
    });

    AppCore.cleanup.event(scope, "auth:logout:success", () => {
      Toast?.info?.("Sesión cerrada correctamente.", {
        title: "Sesión finalizada",
        duration: 2200,
      });
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

      AppCore.events.emit("app:user-ui:sync", {
        route: publicPath,
      });

      AppCore.utils.log("Ruta renderizada:", {
        publicPath,
        canonicalPath: detail?.canonicalPath || detail?.path || null,
        username: detail?.username || null,
        found: Boolean(detail?.found),
        forbidden: Boolean(detail?.forbidden),
        lang: AppCore.state.lang,
      });
    });
  }

  /* =========================================================
     WARMUP / DIAGNÓSTICO
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

    registerModule("store", Store);
    registerModule("auth", Auth);
    registerModule("router", Router);
  }

  function initUISystems() {
    if (uiInitialized) return;

    registerModule("toast", Toast);
    registerModule("sidebarUI", SidebarUI);
    registerModule("topbarUI", TopbarUI);

    if (Toast && typeof Toast.init === "function") {
      Toast.init();
    }

    if (SidebarUI && typeof SidebarUI.init === "function") {
      SidebarUI.init();
    }

    if (TopbarUI && typeof TopbarUI.init === "function") {
      TopbarUI.init();
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
    let loadingToastId = null;

    try {
      loadingToastId = Toast?.loading?.("Restaurando sesión...", {
        title: "Inicializando",
        closable: false,
      });

      const result = await restoreAuthSession();

      await warmup();

      if (result?.ok && AppCore.state.authenticated) {
        if (loadingToastId && typeof Toast?.update === "function") {
          Toast.update(loadingToastId, {
            type: "success",
            title: "Sesión restaurada",
            message: "Tu sesión se ha recuperado correctamente.",
            duration: 1800,
            closable: true,
          });
        }

        navigateAfterSessionRestore();
      } else {
        if (loadingToastId) {
          if (typeof Toast?.dismiss === "function") {
            Toast.dismiss(loadingToastId);
          } else if (typeof Toast?.update === "function") {
            Toast.update(loadingToastId, {
              type: "info",
              title: "Inicialización completada",
              message: "Se continuará sin restaurar la sesión.",
              duration: 1800,
              closable: true,
            });
          }
        }

        applyPostRenderLoaderPolicy();
      }

      return result;
    } catch (error) {
      AppCore.utils.warn("restoreSession en background falló.", error);

      if (loadingToastId) {
        if (typeof Toast?.update === "function") {
          Toast.update(loadingToastId, {
            type: "warning",
            title: "Sesión no restaurada",
            message: "Se continuará sin restaurar la sesión.",
            duration: 2600,
            closable: true,
          });
        } else if (typeof Toast?.dismiss === "function") {
          Toast.dismiss(loadingToastId);
        }
      }

      applyPostRenderLoaderPolicy();

      return {
        ok: false,
        user: null,
        error,
      };
    }
  }

  /* =========================================================
     FINALIZACIÓN DE BOOT
  ========================================================= */
  function finalizeBoot() {
    clearBootFailsafeTimer();

    markStoreBootState({
      ready: true,
      booted: true,
    });

    booted = true;
    booting = false;

    markAppBootState({
      booted: true,
      booting: false,
    });

    hideLoader();
    updateShellVisibilityByRoute();

    AppCore.events.emit("app:ready", {
      route: AppCore.state.route,
      publicPath: AppCore.state.publicPath,
      user: AppCore.state.user,
      authenticated: AppCore.state.authenticated,
      lang: AppCore.state.lang,
    });

    AppCore.utils.log("🔥 Aplicación arrancada correctamente.", {
      route: AppCore.state.route,
      publicPath: AppCore.state.publicPath,
      username: AppCore.state.user?.username || null,
      authenticated: AppCore.state.authenticated,
      lang: AppCore.state.lang,
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

    markAppBootState({
      booted: false,
      booting: true,
    });

    clearBootFailsafeTimer();

    try {
      clearScope();

      await initCore();
      initI18n();

      AppCore.setError(null);
      showLoader();
      armBootFailsafeLoader();

      const scope = ensureScope();

      bindGlobalErrorHandlers(scope);
      bindAppEvents(scope);

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
      syncUserUI();
      syncLangState();

      /* =========================================
         Boot visual completado
      ========================================= */
      finalizeBoot();

      /* =========================================
         Restaurar sesión sin bloquear el login
      ========================================= */
      void restoreSessionInBackground();

      return api;
    } catch (error) {
      clearBootFailsafeTimer();

      booted = false;
      booting = false;

      markStoreBootState({
        ready: false,
        booted: false,
      });

      markAppBootState({
        booted: false,
        booting: false,
      });

      AppCore.setError(error);
      AppCore.utils.error("💥 Fallo en boot()", error);

      hideLoader();

      Toast?.error?.(
        error?.message || "No se pudo arrancar la aplicación.",
        {
          title: "Error de arranque",
          duration: 5000,
        }
      );

      renderBootError(error);

      return api;
    } finally {
      clearBootFailsafeTimer();
      booting = false;
      AppCore.setState({ booting: false });
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
    storeInitialized = false;
    routerBound = false;
    uiInitialized = false;
    i18nInitialized = false;
    sessionRestorePromise = null;

    clearBootFailsafeTimer();
    clearScope();

    if (!preserveError) {
      AppCore.setError(null);
    }

    markStoreBootState({
      ready: false,
      booted: false,
    });

    hideLoader();

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
