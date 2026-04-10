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
   - redirección automática a login sin sesión
   - redirección fuera de /login si ya hay sesión
   - nueva vista admin de servidor
   - nueva vista usuarios desacoplada
   - navegación SPA robusta con rutas canónicas y públicas
   - soporte mobile / desktop sin romper el shell
   - render serializado para evitar race conditions
========================================================= */

import { AppCore } from "../core/core.js";
import { Auth } from "../features/auth.js";
import { LoginView } from "../views/loginView.js";
import { HomeView } from "../views/homeView.js";
import { IncidenciasView } from "../views/incidenciasView.js";
import { FacturasView } from "../views/facturasView.js";
import { ServerView } from "../views/serverView.js";
import { UsuariosView } from "../views/usuariosView.js";

export const Router = (() => {
  "use strict";

  /* =========================================================
     STATE
  ========================================================= */
  let isBound = false;
  let lastRenderPromise = Promise.resolve();
  let renderCycle = 0;

  const ROUTER_CONFIG = {
    maxRouteLength: 2048,
    maxUsernameLength: 64,
  };

  const ROUTE_NAMES = {
    HOME: AppCore.config?.routes?.home || "/",
    LOGIN: AppCore.config?.routes?.login || "/login",
    SERVER: "/servidor",
    USERS: "/usuarios",
  };

  /* =========================================================
     TABLA DE RUTAS
     path = ruta canónica interna
  ========================================================= */
  const routes = [
    {
      path: "/",
      name: "home",
      title: "Onion Support",
      public: false,
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
      render: renderFacturasView,
    },
    {
      path: "/servidor",
      name: "servidor",
      title: "Servidor",
      public: false,
      roles: ["admin"],
      hideShell: false,
      render: renderServidorView,
    },
    {
      path: "/usuarios",
      name: "usuarios",
      title: "Usuarios",
      public: false,
      roles: ["admin"],
      hideShell: false,
      render: renderUsuariosView,
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

  const immutableRoutes = Object.freeze(
    routes.map((route) => Object.freeze({ ...route }))
  );

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function normalizePath(path = "/") {
    return AppCore.utils.normalizePath(path);
  }

  function normalizeRouteInput(path = "/") {
    const raw = String(path ?? "").trim();
    if (!raw) return "/";
    return raw.slice(0, ROUTER_CONFIG.maxRouteLength);
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function stripSearchAndHash(path = "/") {
    const raw = String(path || "/");
    const hashIndex = raw.indexOf("#");
    const searchIndex = raw.indexOf("?");

    let cutIndex = -1;

    if (searchIndex >= 0 && hashIndex >= 0) {
      cutIndex = Math.min(searchIndex, hashIndex);
    } else if (searchIndex >= 0) {
      cutIndex = searchIndex;
    } else if (hashIndex >= 0) {
      cutIndex = hashIndex;
    }

    return cutIndex >= 0 ? raw.slice(0, cutIndex) || "/" : raw || "/";
  }

  function sanitizeUsername(value = "") {
    const normalized = AppCore.utils.sanitizeUsername
      ? AppCore.utils.sanitizeUsername(value)
      : String(value || "")
          .trim()
          .replace(/^@+/, "")
          .replace(/\s+/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "")
          .toLowerCase();

    return normalized.slice(0, ROUTER_CONFIG.maxUsernameLength);
  }

  function extractUsernameFromPath(pathname = "/") {
    const normalized = normalizePath(pathname);
    const pathOnly = stripSearchAndHash(normalized);
    const match = pathOnly.match(/^\/@([^/]+)(?:\/|$)/i);

    if (!match) return null;

    return sanitizeUsername(match[1]);
  }

  function stripUsernamePrefix(pathname = "/") {
    const normalized = normalizePath(pathname);

    const hashIndex = normalized.indexOf("#");
    const queryIndex = normalized.indexOf("?");

    let splitIndex = -1;

    if (queryIndex >= 0 && hashIndex >= 0) {
      splitIndex = Math.min(queryIndex, hashIndex);
    } else if (queryIndex >= 0) {
      splitIndex = queryIndex;
    } else if (hashIndex >= 0) {
      splitIndex = hashIndex;
    }

    const pathOnly =
      splitIndex >= 0 ? normalized.slice(0, splitIndex) : normalized;
    const suffix = splitIndex >= 0 ? normalized.slice(splitIndex) : "";

    const stripped =
      (pathOnly || "/").replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";

    return normalizePath(`${stripped}${suffix}`);
  }

  function normalizeCanonicalPath(path = "/") {
    if (typeof AppCore.utils.normalizeCanonicalPath === "function") {
      return AppCore.utils.normalizeCanonicalPath(path);
    }

    const stripped = stripUsernamePrefix(path);
    return normalizePath(stripSearchAndHash(stripped));
  }

  function isExternalHref(href = "") {
    return /^(https?:|mailto:|tel:|javascript:)/i.test(
      String(href || "").trim()
    );
  }

  function isUnsafeHref(href = "") {
    return /^(javascript:|data:|vbscript:)/i.test(String(href || "").trim());
  }

  function isHashOnlyHref(href = "") {
    return String(href || "").trim().startsWith("#");
  }

  function isSameCanonicalPath(a = "/", b = "/") {
    return normalizeCanonicalPath(a) === normalizeCanonicalPath(b);
  }

  function getViewContainer() {
    return (
      AppCore.dom.viewContainer ||
      document.getElementById("view-container") ||
      document.querySelector("#view-container")
    );
  }

  function getShellElements() {
    return {
      sidebar: AppCore.dom.sidebar || document.querySelector(".sidebar"),
      topbar: AppCore.dom.topbar || document.querySelector(".topbar"),
      tableheadContainer:
        AppCore.dom.tableheadContainer ||
        document.getElementById("tablehead-container"),
      body: AppCore.dom.body || document.body,
      mobileToggle:
        AppCore.dom.sidebarMobileToggle ||
        document.getElementById("toggleSidebarMobile"),
    };
  }

  function getCurrentUrl() {
    return new URL(window.location.href);
  }

  function getCurrentPath() {
    return normalizePath(
      normalizeRouteInput(
        `${window.location.pathname || "/"}${window.location.search || ""}`
      )
    );
  }

  function getCurrentCanonicalPath() {
    return normalizeCanonicalPath(
      normalizeRouteInput(
        `${window.location.pathname || "/"}${window.location.search || ""}`
      )
    );
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

  function getCurrentResolvedUsername() {
    return (
      extractUsernameFromPath(window.location.pathname || "/") ||
      getCurrentUsername() ||
      null
    );
  }

  function getCurrentPublicPath() {
    return normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}`
    );
  }

  function getRoute(pathname = "/") {
    const canonical = normalizeCanonicalPath(pathname);
    return immutableRoutes.find((route) => route.path === canonical) || null;
  }

  function routeExists(pathname = "/") {
    return Boolean(getRoute(pathname));
  }

  function isSlugCandidatePath(pathname = "/") {
    const normalized = normalizePath(pathname);
    const pathOnly = stripSearchAndHash(normalized);
    return /^\/@[^/]+(?:\/|$)/i.test(pathOnly);
  }

  function canUsePublicSlugForRoute(route) {
    if (!route) return false;
    if (route.path === ROUTE_NAMES.LOGIN) return false;
    if (route.hideShell) return false;
    return true;
  }

  function resolveSpaHref(href = "/") {
    const raw = normalizeRouteInput(href);

    if (!raw) return ROUTE_NAMES.HOME;
    if (isUnsafeHref(raw)) return ROUTE_NAMES.HOME;
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

    if (!username) return canonical;

    if (canonical === ROUTE_NAMES.HOME) {
      return `/@${username}`;
    }

    return `/@${username}${canonical}`;
  }

  function getRedirectPath() {
    const url = getCurrentUrl();
    const redirect = url.searchParams.get("redirect");

    if (!redirect) return null;

    const resolved = resolveSpaHref(redirect);
    const canonical = normalizeCanonicalPath(resolved);

    if (!canonical || canonical === ROUTE_NAMES.LOGIN) {
      return null;
    }

    return canonical;
  }

  function buildLoginUrl(redirectPath = null) {
    const loginPath = normalizePath(ROUTE_NAMES.LOGIN);

    if (
      !redirectPath ||
      normalizeCanonicalPath(redirectPath) === ROUTE_NAMES.LOGIN
    ) {
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

  function buildStatePayload(pathname = "/", extras = {}) {
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

  function getDefaultHomeTarget() {
    return (
      buildPublicPath(ROUTE_NAMES.HOME, {
        username: getCurrentResolvedUsername() || getCurrentUsername(),
      }) || ROUTE_NAMES.HOME
    );
  }

  function clearDynamicContainers() {
    AppCore.clearDynamicContainers?.();
  }

  function setDocumentTitle(title = AppCore.config.appName) {
    AppCore.setDocumentTitle?.(title);
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
    const {
      sidebar,
      topbar,
      tableheadContainer,
      body,
      mobileToggle,
    } = getShellElements();

    if (sidebar) sidebar.hidden = hideShell;
    if (topbar) topbar.hidden = hideShell;
    if (tableheadContainer) tableheadContainer.hidden = hideShell;

    if (mobileToggle) {
      mobileToggle.hidden = hideShell;
      mobileToggle.setAttribute("aria-expanded", String(!hideShell));
    }

    if (body) {
      body.classList.toggle("route-auth", hideShell);
      body.classList.toggle("route-shell-hidden", hideShell);
      body.classList.toggle("auth-screen", hideShell);
    }

    AppCore.events.emit("router:shell:change", {
      hidden: hideShell,
      route: route?.path || null,
    });
  }

  function syncRouteState(canonicalPath = "/", publicPath = null) {
    const finalCanonical = normalizeCanonicalPath(canonicalPath);
    const finalPublicPath = normalizePath(
      publicPath ||
        `${window.location.pathname || "/"}${window.location.search || ""}` ||
        finalCanonical
    );

    AppCore.setRoute?.(finalCanonical);
    AppCore.setPublicPath?.(finalPublicPath);
  }

  function buildRenderPayload({
    path = null,
    canonicalPath = null,
    publicPath = null,
    username = null,
    route = null,
    found = false,
    forbidden = false,
    redirectedFrom = null,
  } = {}) {
    return {
      path,
      canonicalPath,
      publicPath,
      username,
      route,
      found,
      forbidden,
      redirectedFrom,
    };
  }

  function emitBeforeRender(payload = {}) {
    AppCore.events.emit("router:before-render", buildRenderPayload(payload));
  }

  function emitRendered(payload = {}) {
    AppCore.events.emit("router:rendered", buildRenderPayload(payload));
  }

  function validateRoutesTable() {
    const seen = new Set();

    immutableRoutes.forEach((route) => {
      if (!route || typeof route !== "object") {
        throw new Error("Router: existe una ruta inválida en la tabla.");
      }

      const normalizedPath = normalizeCanonicalPath(route.path || "/");

      if (!normalizedPath.startsWith("/")) {
        throw new Error(`Router: ruta inválida "${route.path}".`);
      }

      if (seen.has(normalizedPath)) {
        throw new Error(`Router: ruta duplicada detectada "${normalizedPath}".`);
      }

      if (typeof route.render !== "function") {
        throw new Error(`Router: la ruta "${normalizedPath}" no tiene render().`);
      }

      seen.add(normalizedPath);
    });
  }

  /* =========================================================
     GUARDS / ACCESS
  ========================================================= */
  function shouldAllowRoute(route, requestedCanonicalPath = "/") {
    if (!route) {
      return {
        allowed: false,
        reason: "not-found",
        redirectTo: null,
      };
    }

    if (route.path === ROUTE_NAMES.LOGIN && Auth.isAuthenticated()) {
      return {
        allowed: false,
        reason: "already-authenticated",
        redirectTo: getRedirectPath() || getDefaultHomeTarget(),
      };
    }

    if (route.public) {
      return {
        allowed: true,
        reason: null,
        redirectTo: null,
      };
    }

    if (!Auth.isAuthenticated()) {
      return {
        allowed: false,
        reason: "not-authenticated",
        redirectTo: buildLoginUrl(requestedCanonicalPath),
      };
    }

    if (route.roles?.length && !Auth.hasRole(...route.roles)) {
      return {
        allowed: false,
        reason: "insufficient-role",
        redirectTo: getDefaultHomeTarget(),
      };
    }

    return {
      allowed: true,
      reason: null,
      redirectTo: null,
    };
  }

  /* =========================================================
     HISTORY
  ========================================================= */
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

  function renderFacturasView() {
    FacturasView.render();
  }

  function renderServidorView() {
    ServerView.render();
  }

  function renderUsuariosView() {
    UsuariosView.render();
  }

  function renderGenericView(route) {
    const view = getViewContainer();

    if (!view) {
      AppCore.utils.warn(
        "Router: no se encontró #view-container para renderGenericView."
      );
      return;
    }

    const canonicalPath = AppCore.state.route || "/";
    const publicPath = getCurrentPublicPath();
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

    if (!view) {
      AppCore.utils.warn(
        "Router: no se encontró #view-container para renderForbiddenView."
      );
      return;
    }

    const homeHref = getDefaultHomeTarget();

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

    if (!view) {
      AppCore.utils.warn(
        "Router: no se encontró #view-container para renderNotFoundView."
      );
      return;
    }

    const homeHref = buildPublicPath(ROUTE_NAMES.HOME, {
      username:
        extractUsernameFromPath(requestedPath) ||
        getCurrentResolvedUsername() ||
        getCurrentUsername(),
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
              <a href="${escapeHtml(homeHref || ROUTE_NAMES.HOME)}" data-spa>Volver al inicio</a>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderRuntimeErrorView(error, route = null, requestedPath = "/") {
    const view = getViewContainer();
    if (!view) return;

    view.innerHTML = `
      <section class="content-wrapper">
        <div class="panel-block" style="padding:24px;">
          <div style="display:grid; gap:16px;">
            <h2 style="margin:0;">Error de navegación</h2>
            <p style="margin:0; color:var(--text-dim);">
              Ocurrió un error al renderizar esta vista. Intenta recargar.
            </p>
            <div style="display:grid; gap:8px; font-size:14px;">
              <div><strong>Ruta:</strong> ${escapeHtml(requestedPath)}</div>
              <div><strong>Vista:</strong> ${escapeHtml(route?.name || "desconocida")}</div>
              <div><strong>Error:</strong> ${escapeHtml(error?.message || "Error inesperado")}</div>
            </div>
            <div>
              <a href="${escapeHtml(getDefaultHomeTarget())}" data-spa>Volver al inicio</a>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /* =========================================================
     HELPERS DE RENDER
  ========================================================= */
  function getResolvedPublicPath(fallback = "/") {
    return (
      `${window.location.pathname || ""}${window.location.search || ""}` ||
      fallback
    );
  }

  function applyResolvedRouteState(canonicalPath, fallbackPublicPath) {
    const resolvedPublicPath = getResolvedPublicPath(fallbackPublicPath);
    syncRouteState(canonicalPath, resolvedPublicPath);
    return resolvedPublicPath;
  }

  function renderRouteSuccess({
    route,
    requestedPath,
    canonicalPath,
    requestedUsername,
  }) {
    const resolvedPublicPath = applyResolvedRouteState(
      canonicalPath,
      requestedPath
    );

    setShellMode(route);
    setDocumentTitle(route.title || AppCore.config.appName);

    route.render(route);

    emitRendered({
      path: requestedPath,
      canonicalPath,
      publicPath: resolvedPublicPath,
      username: requestedUsername || getCurrentResolvedUsername() || null,
      found: true,
      forbidden: false,
      route,
    });
  }

  function renderRouteForbidden({
    route,
    requestedPath,
    canonicalPath,
    requestedUsername,
    options = {},
  }) {
    updateHistory(canonicalPath, {
      ...options,
      username: requestedUsername || getCurrentUsername(),
    });

    const resolvedPublicPath = applyResolvedRouteState(
      canonicalPath,
      requestedPath
    );

    setShellMode(route);
    setDocumentTitle("Acceso denegado");
    renderForbiddenView(route);

    emitRendered({
      path: requestedPath,
      canonicalPath,
      publicPath: resolvedPublicPath,
      username: requestedUsername || getCurrentResolvedUsername(),
      found: true,
      forbidden: true,
      route,
    });
  }

  function renderRouteNotFound({
    requestedPath,
    canonicalPath,
    requestedUsername,
    options = {},
  }) {
    updateHistory(requestedPath, {
      ...options,
      preservePath: true,
    });

    const resolvedPublicPath = applyResolvedRouteState(
      canonicalPath,
      requestedPath
    );

    setShellMode(null);
    setDocumentTitle("404");
    renderNotFoundView(requestedPath);

    emitRendered({
      path: requestedPath,
      canonicalPath,
      publicPath: resolvedPublicPath,
      username: requestedUsername || getCurrentResolvedUsername() || null,
      found: false,
      forbidden: false,
      route: null,
    });
  }

  function renderLoginRedirect({
    canonicalPath,
    options = {},
  }) {
    const loginRoute = getRoute(ROUTE_NAMES.LOGIN);
    const loginUrl = buildLoginUrl(canonicalPath);

    updateHistory(loginUrl, {
      replaceState: true,
      preservePath: true,
      redirectedFrom: canonicalPath,
    });

    const resolvedPublicPath = applyResolvedRouteState(
      ROUTE_NAMES.LOGIN,
      loginUrl
    );

    clearDynamicContainers();
    setActiveMenu(ROUTE_NAMES.LOGIN);
    setShellMode(loginRoute);
    setDocumentTitle(loginRoute?.title || "Acceso");
    renderLoginView();

    emitRendered({
      path: loginUrl,
      canonicalPath: ROUTE_NAMES.LOGIN,
      publicPath: resolvedPublicPath,
      username: null,
      found: true,
      forbidden: false,
      redirectedFrom: canonicalPath,
      route: loginRoute,
    });
  }

  function performRedirect(targetPath, meta = {}, navOptions = {}) {
    navigate(targetPath, {
      replaceState: true,
      force: true,
      redirectedFrom: meta.redirectedFrom || null,
      ...navOptions,
    });
  }

  /* =========================================================
     RENDER CENTRAL
  ========================================================= */
  async function executeRender(pathname = "/", options = {}) {
    const cycleId = ++renderCycle;

    const requestedPath = resolveSpaHref(pathname);
    const canonicalPath = normalizeCanonicalPath(requestedPath);
    const requestedUsername = extractUsernameFromPath(requestedPath);
    const route = getRoute(canonicalPath);

    emitBeforeRender({
      path: requestedPath,
      canonicalPath,
      publicPath: requestedPath,
      username: requestedUsername || getCurrentResolvedUsername() || null,
      route,
    });

    clearDynamicContainers();
    setActiveMenu(canonicalPath);

    if (!route) {
      renderRouteNotFound({
        requestedPath,
        canonicalPath,
        requestedUsername,
        options,
      });
      return;
    }

    const access = shouldAllowRoute(route, canonicalPath);

    if (!access.allowed) {
      if (access.reason === "not-authenticated") {
        renderLoginRedirect({
          canonicalPath,
          options,
        });
        return;
      }

      if (access.reason === "already-authenticated") {
        performRedirect(access.redirectTo || getDefaultHomeTarget(), {
          redirectedFrom: canonicalPath,
        });
        return;
      }

      if (access.reason === "insufficient-role") {
        renderRouteForbidden({
          route,
          requestedPath,
          canonicalPath,
          requestedUsername,
          options,
        });
        return;
      }
    }

    updateHistory(canonicalPath, {
      ...options,
      username: requestedUsername || getCurrentUsername(),
    });

    try {
      renderRouteSuccess({
        route,
        requestedPath,
        canonicalPath,
        requestedUsername,
      });
    } catch (error) {
      if (cycleId !== renderCycle) {
        AppCore.utils.warn?.(
          "Router: render antiguo descartado por cambio de ciclo.",
          {
            cycleId,
            currentCycle: renderCycle,
            path: requestedPath,
          }
        );
        return;
      }

      AppCore.utils.error?.("Router render error:", error);

      const resolvedPublicPath = applyResolvedRouteState(
        canonicalPath,
        requestedPath
      );

      setShellMode(route);
      setDocumentTitle("Error");
      renderRuntimeErrorView(error, route, requestedPath);

      emitRendered({
        path: requestedPath,
        canonicalPath,
        publicPath: resolvedPublicPath,
        username: requestedUsername || getCurrentResolvedUsername() || null,
        found: true,
        forbidden: false,
        route,
      });
    }
  }

  function render(pathname = "/", options = {}) {
    lastRenderPromise = lastRenderPromise
      .catch(() => {})
      .then(() => executeRender(pathname, options));

    return lastRenderPromise;
  }

  function navigate(pathname = "/", options = {}) {
    const requestedPath = resolveSpaHref(pathname);
    const canonicalPath = normalizeCanonicalPath(requestedPath);
    const currentCanonicalPath = normalizeCanonicalPath(
      AppCore.state.route || "/"
    );
    const currentPath = getCurrentPublicPath();
    const normalizedCurrentPath = resolveSpaHref(currentPath);

    if (
      canonicalPath === currentCanonicalPath &&
      requestedPath === normalizedCurrentPath &&
      !options.force
    ) {
      return render(requestedPath, {
        ...options,
        skipHistory: true,
      });
    }

    return render(requestedPath, options);
  }

  function replace(pathname = "/", options = {}) {
    return navigate(pathname, {
      ...options,
      replaceState: true,
    });
  }

  function back() {
    window.history.back();
  }

  function goAfterLogin(fallback = "/") {
    const redirectPath = getRedirectPath();
    const nextCanonicalPath = normalizeCanonicalPath(redirectPath || fallback);
    const nextPublicPath = buildPublicPath(nextCanonicalPath, {
      username: getCurrentResolvedUsername() || getCurrentUsername(),
    });

    navigate(nextPublicPath || nextCanonicalPath, {
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

    const link = event.target?.closest?.("a[data-spa]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (!href) return;
    if (link.hasAttribute("download")) return;
    if ((link.getAttribute("target") || "").toLowerCase() === "_blank") return;
    if (isHashOnlyHref(href)) return;

    if (isUnsafeHref(href)) {
      event.preventDefault();
      AppCore.utils.warn("Router bloqueó href inseguro:", href);
      return;
    }

    if (isExternalHref(href)) {
      return;
    }

    event.preventDefault();
    navigate(href);
  }

  function handlePopState() {
    render(getCurrentPublicPath(), {
      skipHistory: true,
      replaceState: true,
      force: true,
    });
  }

  function bind() {
    if (isBound) return api;

    validateRoutesTable();
    isBound = true;

    AppCore.utils.on(document, "click", handleDocumentClick);
    AppCore.utils.on(window, "popstate", handlePopState);

    if (!window.history.state) {
      const initialPath = getCurrentPublicPath() || "/";
      const payload = buildStatePayload(initialPath);
      window.history.replaceState(payload, "", initialPath);
    }

    AppCore.events.emit("router:bound", {
      routes: immutableRoutes.map((route) => route.path),
    });

    return api;
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  const api = {
    routes: immutableRoutes,
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
    isSlugCandidatePath,
    isSameCanonicalPath,
  };

  return api;
})();
