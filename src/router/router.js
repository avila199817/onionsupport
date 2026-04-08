/* =========================================================
   Onion SPA - Router
   Archivo: src/router/router.js

   Responsabilidades:
   - tabla de rutas
   - navegación SPA
   - history API
   - 404
   - activación de menú
   - guard por auth / rol
   - integración con vistas externas
   - control de shell por ruta
   - soporte slug público /@username
========================================================= */

import { AppCore } from "../core/core.js";
import { Auth } from "../features/auth.js";
import { LoginView } from "../views/loginView.js";
import { HomeView } from "../views/homeView.js";
import { IncidenciasView } from "../views/incidenciasView.js";

export const Router = (() => {
  "use strict";

  let isBound = false;

  /* =========================================================
     TABLA DE RUTAS
     path = ruta canónica interna
  ========================================================= */
  const routes = [
    {
      path: "/",
      name: "home",
      title: "Onion Support",
      public: true,
      roles: [],
      hideShell: false,
      render: renderHomeView,
    },
    {
      path: "/incidencias",
      name: "incidencias",
      title: "Incidencias",
      public: false,
      roles: [],
      hideShell: false,
      render: renderIncidenciasView,
    },
    {
      path: "/facturas",
      name: "facturas",
      title: "Facturas",
      public: false,
      roles: [],
      hideShell: false,
      render: renderGenericView,
    },
    {
      path: "/usuarios",
      name: "usuarios",
      title: "Usuarios",
      public: false,
      roles: ["admin"],
      hideShell: false,
      render: renderGenericView,
    },
    {
      path: "/clientes",
      name: "clientes",
      title: "Clientes",
      public: false,
      roles: ["admin"],
      hideShell: false,
      render: renderGenericView,
    },
    {
      path: "/cuenta",
      name: "cuenta",
      title: "Cuenta",
      public: false,
      roles: [],
      hideShell: false,
      render: renderGenericView,
    },
    {
      path: "/ajustes",
      name: "ajustes",
      title: "Ajustes",
      public: false,
      roles: [],
      hideShell: false,
      render: renderGenericView,
    },
    {
      path: "/login",
      name: "login",
      title: "Acceso",
      public: true,
      roles: [],
      hideShell: true,
      render: renderLoginView,
    },
  ];

  const ROUTE_NAMES = {
    HOME: "/",
    LOGIN: AppCore.config?.routes?.login || "/login",
  };

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function normalizePath(path = "/") {
    return AppCore.utils.normalizePath(path);
  }

  function normalizeCanonicalPath(path = "/") {
    return AppCore.utils.normalizeCanonicalPath
      ? AppCore.utils.normalizeCanonicalPath(path)
      : stripUsernamePrefix(normalizePath(path));
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function isExternalHref(href = "") {
    return /^(https?:|mailto:|tel:|javascript:)/i.test(String(href || "").trim());
  }

  function isHashOnlyHref(href = "") {
    return String(href || "").trim().startsWith("#");
  }

  function getViewContainer() {
    return AppCore.dom.viewContainer;
  }

  function getCurrentUrl() {
    return new URL(window.location.href);
  }

  function getRoute(pathname = "/") {
    const canonical = normalizeCanonicalPath(pathname);
    return routes.find((route) => route.path === canonical) || null;
  }

  function routeExists(pathname = "/") {
    return Boolean(getRoute(pathname));
  }

  /* =========================================================
     USERNAME / SLUG SYSTEM
     URL pública:
     - /@cristian
     - /@cristian/incidencias
     - /@cristian/facturas
  ========================================================= */
  function sanitizeUsername(value = "") {
    return AppCore.utils.sanitizeUsername
      ? AppCore.utils.sanitizeUsername(value)
      : String(value || "")
          .trim()
          .replace(/^@+/, "")
          .replace(/\s+/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "")
          .toLowerCase();
  }

  function getCurrentUsername() {
    return sanitizeUsername(
      AppCore.state.user?.username ||
      AppCore.state.user?.userName ||
      AppCore.state.user?.nick ||
      AppCore.state.user?.alias ||
      ""
    );
  }

  function extractUsernameFromPath(pathname = "/") {
    const normalized = normalizePath(pathname);
    const pathOnly = normalized.split("?")[0].split("#")[0] || "/";
    const match = pathOnly.match(/^\/@([^/]+)(?:\/|$)/i);

    if (!match) return null;

    return sanitizeUsername(match[1]);
  }

  function stripUsernamePrefix(pathname = "/") {
    const normalized = normalizePath(pathname);
    const [pathOnly, suffix = ""] = normalized.split(/([?#].*)/, 2);
    const stripped = (pathOnly || "/").replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";
    return normalizePath(`${stripped}${suffix}`);
  }

  function getCurrentPath() {
    return normalizePath(window.location.pathname + window.location.search);
  }

  function getCurrentCanonicalPath() {
    return normalizeCanonicalPath(window.location.pathname || "/");
  }

  function getCurrentResolvedUsername() {
    return (
      extractUsernameFromPath(window.location.pathname || "/") ||
      getCurrentUsername() ||
      null
    );
  }

  function resolveSpaHref(href = "/") {
    const raw = String(href || "").trim();

    if (!raw) return ROUTE_NAMES.HOME;
    if (isExternalHref(raw)) return raw;
    if (isHashOnlyHref(raw)) return raw;

    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        return normalizePath(`${url.pathname}${url.search}${url.hash}`);
      } catch {
        return ROUTE_NAMES.HOME;
      }
    }

    if (raw.startsWith("/")) {
      return normalizePath(raw);
    }

    if (raw.startsWith("@")) {
      return normalizePath(`/${raw}`);
    }

    if (raw.startsWith("./")) {
      return normalizePath(`/${raw.slice(2)}`);
    }

    if (raw.startsWith("../")) {
      const cleaned = raw.replace(/^(\.\.\/)+/, "");
      return normalizePath(`/${cleaned}`);
    }

    return normalizePath(`/${raw}`);
  }

  function isSlugCandidatePath(pathname = "/") {
    const normalized = normalizePath(pathname);
    const pathOnly = normalized.split("?")[0].split("#")[0] || "/";
    return /^\/@[^/]+(?:\/|$)/i.test(pathOnly);
  }

  function canUsePublicSlugForRoute(route) {
    if (!route) return false;
    if (route.path === ROUTE_NAMES.LOGIN) return false;
    if (route.hideShell) return false;
    return true;
  }

  function buildPublicPath(canonicalPath = "/", options = {}) {
    const canonical = normalizeCanonicalPath(canonicalPath);
    const route = getRoute(canonical);

    if (!route) return canonical;
    if (!canUsePublicSlugForRoute(route)) return canonical;

    const username = sanitizeUsername(
      options.username ||
      extractUsernameFromPath(options.fromPath || "") ||
      getCurrentResolvedUsername() ||
      getCurrentUsername()
    );

    if (!username) {
      return canonical;
    }

    if (canonical === "/") {
      return `/@${username}`;
    }

    return `/@${username}${canonical}`;
  }

  function getRedirectPath() {
    const url = getCurrentUrl();
    const redirect = url.searchParams.get("redirect");

    if (!redirect) return null;

    const resolved = resolveSpaHref(redirect);
    return normalizeCanonicalPath(resolved);
  }

  function buildLoginUrl(redirectPath = null) {
    const loginPath = normalizePath(ROUTE_NAMES.LOGIN);

    if (!redirectPath || normalizeCanonicalPath(redirectPath) === ROUTE_NAMES.LOGIN) {
      return loginPath;
    }

    const url = new URL(window.location.origin + loginPath);
    url.searchParams.set("redirect", normalizeCanonicalPath(redirectPath));

    return `${url.pathname}${url.search}`;
  }

  function buildHistoryUrl(pathname = "/", options = {}) {
    const normalized = resolveSpaHref(pathname);
    const canonical = normalizeCanonicalPath(normalized);
    const route = getRoute(canonical);

    let finalPath = normalized;

    if (!options.preservePath) {
      if (route && canUsePublicSlugForRoute(route)) {
        finalPath = buildPublicPath(canonical, {
          username: options.username,
          fromPath: normalized,
        });
      } else {
        finalPath = canonical;
      }
    }

    const url = new URL(window.location.origin + finalPath);

    if (options.withRedirect) {
      const redirectCanonical = normalizeCanonicalPath(options.withRedirect);
      if (redirectCanonical && redirectCanonical !== ROUTE_NAMES.LOGIN) {
        url.searchParams.set("redirect", redirectCanonical);
      }
    }

    return `${url.pathname}${url.search}${url.hash}`;
  }

  function buildStatePayload(pathname, extras = {}) {
    const normalized = normalizePath(pathname);
    const canonicalPath = normalizeCanonicalPath(normalized);
    const username = extractUsernameFromPath(normalized) || null;

    return {
      path: normalized,
      canonicalPath,
      username,
      ...extras,
    };
  }

  function clearDynamicContainers() {
    AppCore.clearDynamicContainers();
  }

  function setDocumentTitle(title = AppCore.config.appName) {
    AppCore.setDocumentTitle(title);
  }

  function setActiveMenu(pathname = "/") {
    const currentCanonical = normalizeCanonicalPath(pathname);
    const links = AppCore.utils.qsa("a[data-spa]");

    links.forEach((link) => {
      const href = resolveSpaHref(link.getAttribute("href") || "/");
      const hrefCanonical = normalizeCanonicalPath(href);
      const active = hrefCanonical === currentCanonical;

      link.classList.toggle("active", active);

      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function setShellMode(route = null) {
    const hideShell = Boolean(route?.hideShell);

    if (AppCore.dom.sidebar) {
      AppCore.dom.sidebar.hidden = hideShell;
    }

    if (AppCore.dom.topbar) {
      AppCore.dom.topbar.hidden = hideShell;
    }

    if (AppCore.dom.body) {
      AppCore.dom.body.classList.toggle("route-auth", hideShell);
      AppCore.dom.body.classList.toggle("route-shell-hidden", hideShell);
    }

    AppCore.events.emit("router:shell:change", {
      hidden: hideShell,
      route: route?.path || null,
    });
  }

  function shouldAllowRoute(route) {
    if (!route) {
      return {
        allowed: false,
        reason: "not-found",
      };
    }

    if (route.public) {
      return {
        allowed: true,
        reason: null,
      };
    }

    if (!Auth.isAuthenticated()) {
      return {
        allowed: false,
        reason: "not-authenticated",
        redirectTo: ROUTE_NAMES.LOGIN,
      };
    }

    if (route.roles?.length && !Auth.hasRole(...route.roles)) {
      return {
        allowed: false,
        reason: "insufficient-role",
        redirectTo: ROUTE_NAMES.HOME,
      };
    }

    return {
      allowed: true,
      reason: null,
    };
  }

  function updateHistory(pathname = "/", options = {}) {
    if (options.skipHistory) return;

    const targetUrl = buildHistoryUrl(pathname, {
      username: options.username,
      preservePath: Boolean(options.preservePath),
      withRedirect: options.withRedirect || null,
    });

    const payload = buildStatePayload(targetUrl, {
      redirectedFrom: options.redirectedFrom
        ? normalizeCanonicalPath(options.redirectedFrom)
        : null,
      redirectTo: options.withRedirect
        ? normalizeCanonicalPath(options.withRedirect)
        : null,
    });

    if (options.replaceState) {
      window.history.replaceState(payload, "", targetUrl);
    } else {
      window.history.pushState(payload, "", targetUrl);
    }
  }

  /* =========================================================
     VISTAS
  ========================================================= */
  function renderHomeView() {
    HomeView.render();
  }

  function renderIncidenciasView() {
    IncidenciasView.render();
  }

  function renderGenericView(route) {
    const view = getViewContainer();
    if (!view) return;

    const canonicalPath = AppCore.state.route || "/";
    const publicPath = window.location.pathname || "/";
    const resolvedUsername = getCurrentResolvedUsername();

    view.innerHTML = `
      <section class="content-wrapper">
        <div class="panel-block" style="padding:24px;">
          <div style="display:grid; gap:16px;">
            <div>
              <h2 style="margin:0 0 8px 0;">${escapeHtml(route?.title || "Vista")}</h2>
              <p style="margin:0; color:var(--text-dim);">
                Esta sección ya está conectada al router y lista para evolucionar.
              </p>
            </div>

            <div style="display:grid; gap:8px; font-size:14px;">
              <div><strong>Ruta canónica:</strong> ${escapeHtml(canonicalPath)}</div>
              <div><strong>Ruta pública:</strong> ${escapeHtml(publicPath)}</div>
              <div><strong>Usuario slug:</strong> ${escapeHtml(resolvedUsername || "Sin username")}</div>
              <div><strong>Usuario:</strong> ${escapeHtml(
                AppCore.state.user?.username ||
                AppCore.state.user?.name ||
                AppCore.state.user?.email ||
                "No autenticado"
              )}</div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderLoginView() {
    LoginView.render();
  }

  function renderForbiddenView(route = null) {
    const view = getViewContainer();
    if (!view) return;

    const homeHref = buildPublicPath("/", {
      username: getCurrentResolvedUsername(),
    });

    view.innerHTML = `
      <section class="content-wrapper">
        <div class="panel-block" style="padding:24px;">
          <div style="display:grid; gap:16px;">
            <h2 style="margin:0;">Acceso denegado</h2>
            <p style="margin:0; color:var(--text-dim);">
              No tienes permisos para entrar en esta sección.
            </p>
            <div style="display:grid; gap:8px; font-size:14px;">
              <div><strong>Ruta:</strong> ${escapeHtml(route?.path || AppCore.state.route || "/")}</div>
              <div><strong>Rol actual:</strong> ${escapeHtml(AppCore.state.role || "Sin rol")}</div>
            </div>
            <div>
              <a href="${escapeHtml(homeHref)}" data-spa>Volver al inicio</a>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderNotFoundView(requestedPath = "/") {
    const view = getViewContainer();
    if (!view) return;

    const homeHref = buildPublicPath("/", {
      username:
        extractUsernameFromPath(requestedPath) ||
        getCurrentResolvedUsername(),
    });

    view.innerHTML = `
      <section class="content-wrapper">
        <div class="panel-block" style="padding:24px;">
          <div style="display:grid; gap:16px;">
            <h2 style="margin:0;">404</h2>
            <p style="margin:0; color:var(--text-dim);">
              La ruta no existe en la SPA.
            </p>
            <div style="display:grid; gap:8px; font-size:14px;">
              <div><strong>Solicitada:</strong> ${escapeHtml(requestedPath)}</div>
              <div><strong>Canónica:</strong> ${escapeHtml(normalizeCanonicalPath(requestedPath))}</div>
            </div>
            <div>
              <a href="${escapeHtml(homeHref)}" data-spa>Volver al inicio</a>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /* =========================================================
     ESTADO DE RUTA
  ========================================================= */
  function syncRouteState(canonicalPath = "/", publicPath = null) {
    const finalCanonical = normalizeCanonicalPath(canonicalPath);
    const finalPublicPath = normalizePath(
      publicPath || window.location.pathname || finalCanonical
    );

    AppCore.setRoute(finalCanonical);
    AppCore.setPublicPath(finalPublicPath);
  }

  function emitRendered(payload = {}) {
    AppCore.events.emit("router:rendered", {
      path: payload.path || null,
      canonicalPath: payload.canonicalPath || null,
      publicPath: payload.publicPath || window.location.pathname || null,
      username: payload.username || null,
      found: Boolean(payload.found),
      forbidden: Boolean(payload.forbidden),
      redirectedFrom: payload.redirectedFrom || null,
      route: payload.route || null,
    });
  }

  /* =========================================================
     RENDER CENTRAL
  ========================================================= */
  function render(pathname = "/", options = {}) {
    const requestedPath = resolveSpaHref(pathname);
    const canonicalPath = normalizeCanonicalPath(requestedPath);
    const requestedUsername = extractUsernameFromPath(requestedPath);
    const route = getRoute(canonicalPath);
    const access = shouldAllowRoute(route);

    clearDynamicContainers();
    setActiveMenu(canonicalPath);

    if (!route) {
      updateHistory(requestedPath, {
        ...options,
        preservePath: true,
      });

      syncRouteState(canonicalPath, requestedPath);
      setShellMode(null);
      setDocumentTitle("404");
      renderNotFoundView(requestedPath);

      emitRendered({
        path: requestedPath,
        canonicalPath,
        publicPath: window.location.pathname || requestedPath,
        username: requestedUsername || getCurrentResolvedUsername(),
        found: false,
        route: null,
      });

      return;
    }

    if (!access.allowed) {
      if (access.reason === "not-authenticated") {
        const loginRoute = getRoute(access.redirectTo || ROUTE_NAMES.LOGIN);
        const redirectTarget = canonicalPath;
        const loginUrl = buildLoginUrl(redirectTarget);

        updateHistory(loginUrl, {
          replaceState: true,
          preservePath: true,
          redirectedFrom: redirectTarget,
        });

        syncRouteState(ROUTE_NAMES.LOGIN, window.location.pathname + window.location.search);
        clearDynamicContainers();
        setActiveMenu(ROUTE_NAMES.LOGIN);
        setShellMode(loginRoute);
        setDocumentTitle(loginRoute?.title || "Acceso");
        renderLoginView();

        emitRendered({
          path: loginUrl,
          canonicalPath: ROUTE_NAMES.LOGIN,
          publicPath: window.location.pathname + window.location.search,
          username: null,
          found: true,
          route: loginRoute,
          redirectedFrom: redirectTarget,
        });

        return;
      }

      if (access.reason === "insufficient-role") {
        updateHistory(canonicalPath, {
          ...options,
          username: requestedUsername || getCurrentUsername(),
        });

        syncRouteState(canonicalPath, window.location.pathname || canonicalPath);
        setShellMode(route);
        setDocumentTitle("Acceso denegado");
        renderForbiddenView(route);

        emitRendered({
          path: requestedPath,
          canonicalPath,
          publicPath: window.location.pathname || requestedPath,
          username: requestedUsername || getCurrentResolvedUsername(),
          found: true,
          forbidden: true,
          route,
        });

        return;
      }
    }

    if (
      route.path === ROUTE_NAMES.LOGIN &&
      Auth.isAuthenticated() &&
      !options.allowWhenAuthenticated
    ) {
      const redirectPath = getRedirectPath();
      const fallbackPath = buildPublicPath("/", {
        username: getCurrentResolvedUsername() || getCurrentUsername(),
      });

      navigate(redirectPath || fallbackPath, {
        replaceState: true,
        force: true,
      });

      return;
    }

    updateHistory(canonicalPath, {
      ...options,
      username: requestedUsername || getCurrentUsername(),
    });

    syncRouteState(canonicalPath, window.location.pathname || canonicalPath);
    setShellMode(route);
    setDocumentTitle(route.title || AppCore.config.appName);
    route.render(route);

    emitRendered({
      path: requestedPath,
      canonicalPath,
      publicPath: window.location.pathname || requestedPath,
      username: requestedUsername || getCurrentResolvedUsername() || null,
      found: true,
      route,
    });
  }

  function navigate(pathname = "/", options = {}) {
    const requestedPath = resolveSpaHref(pathname);
    const canonicalPath = normalizeCanonicalPath(requestedPath);
    const currentCanonicalPath = normalizeCanonicalPath(AppCore.state.route || "/");

    if (canonicalPath === currentCanonicalPath && !options.force) {
      render(requestedPath, {
        ...options,
        skipHistory: true,
      });
      return;
    }

    render(requestedPath, options);
  }

  function replace(pathname = "/", options = {}) {
    navigate(pathname, {
      ...options,
      replaceState: true,
    });
  }

  function back() {
    window.history.back();
  }

  function goAfterLogin(fallback = "/") {
    const redirectPath = getRedirectPath();
    const nextPath = redirectPath || normalizeCanonicalPath(fallback);

    navigate(nextPath, {
      replaceState: true,
      force: true,
    });
  }

  /* =========================================================
     LISTENERS GLOBALES
  ========================================================= */
  function handleDocumentClick(event) {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest("a[data-spa]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (!href) return;
    if (isExternalHref(href)) return;
    if (isHashOnlyHref(href)) return;
    if (link.hasAttribute("download")) return;
    if ((link.getAttribute("target") || "").toLowerCase() === "_blank") return;

    event.preventDefault();
    navigate(href);
  }

  function handlePopState() {
    render(window.location.pathname + window.location.search, {
      skipHistory: true,
      replaceState: true,
      force: true,
    });
  }

  function bind() {
    if (isBound) return;

    isBound = true;

    AppCore.utils.on(document, "click", handleDocumentClick);
    AppCore.utils.on(window, "popstate", handlePopState);

    if (!window.history.state) {
      const initialPath = window.location.pathname + window.location.search;
      const payload = buildStatePayload(initialPath);
      window.history.replaceState(payload, "", initialPath);
    }

    AppCore.events.emit("router:bound", {
      routes: routes.map((route) => route.path),
    });
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    routes,
    bind,

    getRoute,
    routeExists,

    getCurrentPath,
    getCurrentCanonicalPath,
    getCurrentResolvedUsername,

    navigate,
    replace,
    render,
    back,
    goAfterLogin,

    buildPublicPath,
    buildLoginUrl,
    stripUsernamePrefix,
    extractUsernameFromPath,
    resolveSpaHref,
  };
})();