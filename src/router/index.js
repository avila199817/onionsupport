/* =========================================================
   Onion Support - Router
   Archivo: /src/router/index.js

   Responsabilidad:
   - Orquestador mínimo de navegación SPA.
   - Buscar ruta.
   - Resolver home pública por slug: /@slug -> HomeView.
   - Consultar guard.
   - Renderizar vista.
   - Actualizar history.
   - Actualizar estado de ruta.
   - Sin Auth estático.
   - Sin fetch.
   - Sin storage.
   - Sin Toast.
   - Sin alias /home.
   - Sin rutas inventadas.
   - Sin 2FA/MFA/OTP.
========================================================= */

import { AppCore } from "../core/index.js";

import * as Routes from "./routes.js";
import * as RouteGuards from "./guards.js";
import * as History from "./history.js";
import * as Render from "./render.js";
import * as Shell from "./shell.js";

export const ROUTER_VERSION = "router.slug-home.v1";

const ROUTE_PATHS = Routes.ROUTE_PATHS || {
  HOME: "/",
  LOGIN: "/login",
};

const getImmutableRoutes = Routes.getImmutableRoutes || (() => []);

export const Router = (() => {
  "use strict";

  const SOURCE = "router";

  const HOME_PATH = ROUTE_PATHS.HOME || "/";
  const LOGIN_PATH = ROUTE_PATHS.LOGIN || "/login";

  const USER_HOME_PREFIX = "/@";
  const USER_HOME_RE = /^\/@([A-Za-z0-9][A-Za-z0-9._-]{0,95})$/;

  const routes = getImmutableRoutes();

  let initialized = false;
  let bound = false;
  let activeView = null;
  let renderSeq = 0;
  let renderPromise = Promise.resolve();

  const disposers = [];

  /* =======================================================
     BASICS
  ======================================================= */

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function text(value = "", fallback = "") {
    const output = String(value ?? "").trim();
    return output || fallback;
  }

  function readState() {
    return isObject(AppCore?.state) ? AppCore.state : {};
  }

  function emit(name = "", payload = {}) {
    const eventName = text(name, "");

    if (!eventName) return false;

    try {
      AppCore?.events?.emit?.(eventName, {
        source: SOURCE,
        version: ROUTER_VERSION,
        ...payload,
        token: null,
        accessToken: null,
        refreshToken: null,
      });

      return true;
    } catch {
      return false;
    }
  }

  function safeCall(fn, ...args) {
    try {
      return isFunction(fn) ? fn(...args) : null;
    } catch {
      return null;
    }
  }

  /* =======================================================
     PATHS
  ======================================================= */

  function normalizePublicPath(path = HOME_PATH) {
    let value = text(path, HOME_PATH);

    if (value.startsWith("#/")) value = value.slice(1);
    if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

    try {
      if (/^https?:\/\//i.test(value)) {
        const url = new URL(value);
        value = `${url.pathname || HOME_PATH}${url.search || ""}${url.hash || ""}`;
      }
    } catch {
      // noop
    }

    if (!value.startsWith("/")) value = `/${value}`;

    value = value.replace(/\/{2,}/g, "/");

    return value || HOME_PATH;
  }

  function normalizeCanonicalPath(path = HOME_PATH) {
    let canonical = normalizePublicPath(path).split("?")[0].split("#")[0] || HOME_PATH;

    if (canonical.length > 1) {
      canonical = canonical.replace(/\/+$/g, "") || HOME_PATH;
    }

    return canonical || HOME_PATH;
  }

  function browserPath() {
    if (!isBrowser()) return HOME_PATH;

    try {
      const hash = window.location.hash || "";

      if (hash.startsWith("#/") || hash.startsWith("#!")) {
        return normalizePublicPath(hash);
      }

      return normalizePublicPath(
        `${window.location.pathname || HOME_PATH}${window.location.search || ""}${hash}`
      );
    } catch {
      return HOME_PATH;
    }
  }

  function currentPublicPath() {
    return normalizePublicPath(readState().publicPath || browserPath());
  }

  function currentCanonicalPath() {
    return normalizeCanonicalPath(
      readState().canonicalPath ||
        readState().route ||
        currentPublicPath()
    );
  }

  function isUnsafeHref(href = "") {
    const value = text(href, "");

    return (
      !value ||
      value.startsWith("//") ||
      /^javascript:/i.test(value) ||
      /^data:/i.test(value) ||
      /^vbscript:/i.test(value) ||
      /^file:/i.test(value) ||
      /^mailto:/i.test(value) ||
      /^tel:/i.test(value) ||
      /[\r\n\t\\]/.test(value)
    );
  }

  function isExternalHref(href = "") {
    if (!isBrowser()) return false;

    const value = text(href, "");

    if (!/^https?:\/\//i.test(value)) return false;

    try {
      return new URL(value).origin !== window.location.origin;
    } catch {
      return true;
    }
  }

  function isHashOnlyHref(href = "") {
    const value = text(href, "");
    return value.startsWith("#") && !value.startsWith("#/") && !value.startsWith("#!");
  }

  /* =======================================================
     USER SLUG
  ======================================================= */

  function unwrapUser(payload = null) {
    if (!isObject(payload)) return null;

    const candidates = [
      payload.user,
      payload.usuario,
      payload.currentUser,
      payload.authUser,
      payload.sessionUser,
      payload.me,
      payload.account,
      payload.profile,
      payload.session?.user,
      payload.data?.user,
      payload.payload?.user,
      payload,
    ];

    return candidates.find((candidate) => isObject(candidate)) || null;
  }

  function getAuth() {
    try {
      return (
        AppCore?.Auth ||
        AppCore?.auth ||
        AppCore?.modules?.get?.("Auth") ||
        AppCore?.modules?.get?.("auth") ||
        null
      );
    } catch {
      return null;
    }
  }

  function getCurrentUser() {
    const Auth = getAuth();
    const state = readState();

    const candidates = [];

    try {
      if (isFunction(Auth?.getUser)) candidates.push(Auth.getUser());
      if (isFunction(Auth?.getCurrentUser)) candidates.push(Auth.getCurrentUser());

      candidates.push(Auth?.user);
      candidates.push(Auth?.currentUser);
    } catch {
      // noop
    }

    candidates.push(
      state.user,
      state.currentUser,
      state.authUser,
      state.sessionUser,
      state.session?.user,
      state.sessionData?.user,
      state
    );

    for (const candidate of candidates) {
      const user = unwrapUser(candidate);

      if (isObject(user)) return user;
    }

    return null;
  }

  function normalizeUserSlug(value = "") {
    const slug = text(value, "")
      .replace(/^@+/, "")
      .trim();

    if (!slug) return "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(slug)) return "";

    return slug;
  }

  function getCurrentUserSlug() {
    const user = getCurrentUser();
    const state = readState();

    return normalizeUserSlug(
      user?.slug ||
        user?.lookup?.slug ||
        user?.profile?.slug ||
        state.userSlug ||
        state.slug ||
        ""
    );
  }

  function buildUserHomePath(slug = getCurrentUserSlug()) {
    const clean = normalizeUserSlug(slug);

    return clean ? `${USER_HOME_PREFIX}${clean}` : HOME_PATH;
  }

  function extractSlugFromPath(path = HOME_PATH) {
    const canonical = normalizeCanonicalPath(path);
    const match = canonical.match(USER_HOME_RE);

    return match ? normalizeUserSlug(match[1]) : "";
  }

  function isUserHomePath(path = HOME_PATH) {
    return Boolean(extractSlugFromPath(path));
  }

  function getDefaultHome() {
    return buildUserHomePath();
  }

  function publicHomePathForRoute(route = null, requestedPublicPath = HOME_PATH) {
    if (!route || route.path !== HOME_PATH || route.public === true) {
      return normalizePublicPath(requestedPublicPath);
    }

    const current = normalizePublicPath(requestedPublicPath);
    const currentCanonical = normalizeCanonicalPath(current);

    if (isUserHomePath(current)) return current;

    if (currentCanonical === HOME_PATH) {
      return buildUserHomePath();
    }

    return current;
  }

  /* =======================================================
     ROUTES
  ======================================================= */

  function routePath(route = null) {
    return normalizeCanonicalPath(route?.path || HOME_PATH);
  }

  function getStaticRouteByCanonicalPath(canonicalPath = HOME_PATH) {
    return routes.find((item) => routePath(item) === canonicalPath) || null;
  }

  function getHomeRoute() {
    return getStaticRouteByCanonicalPath(HOME_PATH);
  }

  function getRouteMatch(path = HOME_PATH) {
    const requestedPublicPath = normalizePublicPath(path);
    const requestedCanonicalPath = normalizeCanonicalPath(requestedPublicPath);

    if (isUserHomePath(requestedCanonicalPath)) {
      const homeRoute = getHomeRoute();

      return {
        route: homeRoute,
        publicPath: requestedPublicPath,
        canonicalPath: HOME_PATH,
        routeParams: {
          slug: extractSlugFromPath(requestedCanonicalPath),
        },
        matchedBy: "user-home-slug",
      };
    }

    const route = getStaticRouteByCanonicalPath(requestedCanonicalPath);

    return {
      route,
      publicPath: publicHomePathForRoute(route, requestedPublicPath),
      canonicalPath: requestedCanonicalPath,
      routeParams: {},
      matchedBy: route ? "static" : "none",
    };
  }

  function getRoute(path = HOME_PATH) {
    return getRouteMatch(path).route;
  }

  function routeExists(path = HOME_PATH) {
    return Boolean(getRoute(path));
  }

  function getCurrentRoute() {
    return getRoute(currentPublicPath());
  }

  function canUsePublicSlugForRoute(path = HOME_PATH) {
    const canonical = normalizeCanonicalPath(path);
    return canonical === HOME_PATH || isUserHomePath(canonical);
  }

  function normalizeNavigationTarget(path = HOME_PATH, options = {}) {
    const publicPath = normalizePublicPath(path);
    const canonicalPath = normalizeCanonicalPath(publicPath);
    const useSlugHome = options.useSlugHome !== false && options.keepCanonicalHome !== true;

    if (useSlugHome && canonicalPath === HOME_PATH) {
      return buildUserHomePath();
    }

    return publicPath;
  }

  function isPublicAuthRoutePath(path = HOME_PATH) {
    return Routes.isPublicAuthPath?.(path) === true;
  }

  function isValidPostLoginTarget(path = "") {
    const target = normalizePublicPath(path);

    if (!target) return false;
    if (isPublicAuthRoutePath(target)) return false;

    return Boolean(getRoute(target));
  }

  function normalizePostLoginTarget(path = "", fallback = getDefaultHome()) {
    const target = normalizePublicPath(path || fallback || HOME_PATH);

    if (isValidPostLoginTarget(target)) {
      return normalizeNavigationTarget(target);
    }

    return normalizeNavigationTarget(fallback || HOME_PATH);
  }

  /* =======================================================
     STATE / SHELL
  ======================================================= */

  function setRouterState({
    canonicalPath = HOME_PATH,
    publicPath = HOME_PATH,
    routeParams = {},
  } = {}) {
    const canonical = normalizeCanonicalPath(canonicalPath);
    const visible = normalizePublicPath(publicPath || canonical);
    const params = isObject(routeParams) ? { ...routeParams } : {};

    const patch = {
      route: canonical,
      canonicalPath: canonical,
      publicPath: visible,
      routeParams: params,
      initialRouteRendered: true,
    };

    try {
      AppCore?.setState?.(patch, {
        source: SOURCE,
        silent: true,
        emit: false,
      });
    } catch {
      try {
        Object.assign(readState(), patch);
      } catch {
        // noop
      }
    }

    return {
      canonicalPath: canonical,
      publicPath: visible,
      routeParams: params,
    };
  }

  function updateShell(route = null, canonicalPath = HOME_PATH) {
    safeCall(Shell.setShellMode, AppCore, route);
    safeCall(Shell.setActiveMenu, AppCore, canonicalPath);
    safeCall(
      Shell.setDocumentTitle,
      AppCore,
      route?.title || route?.label || route?.name || "Onion Support"
    );

    return true;
  }

  function clearChrome() {
    safeCall(Shell.clearDynamicContainers, AppCore);
    return true;
  }

  function hideLoader() {
    if (!isBrowser()) return false;

    const loader = document.getElementById("app-loader");

    if (!loader) return false;

    try {
      loader.hidden = true;
      loader.classList.remove("is-visible");
      loader.setAttribute("aria-hidden", "true");
      loader.setAttribute("aria-busy", "false");
      return true;
    } catch {
      return false;
    }
  }

  function destroyActiveView() {
    if (!activeView) return false;

    for (const method of ["destroy", "unmount", "cleanup"]) {
      try {
        if (isFunction(activeView?.[method])) {
          activeView[method]();
          break;
        }
      } catch {
        // noop
      }
    }

    activeView = null;
    return true;
  }

  function viewRoot() {
    if (!isBrowser()) return null;

    return (
      document.getElementById("view-container") ||
      document.getElementById("app-content") ||
      document.getElementById("main-content") ||
      document.body ||
      null
    );
  }

  function renderFallback(title = "Onion Support", message = "") {
    const root = viewRoot();

    if (!root) return null;

    const section = document.createElement("section");
    section.className = "route-fallback-view";
    section.setAttribute("role", "status");

    const h1 = document.createElement("h1");
    h1.textContent = title;

    section.appendChild(h1);

    if (message) {
      const p = document.createElement("p");
      p.textContent = message;
      section.appendChild(p);
    }

    root.replaceChildren(section);

    return section;
  }

  /* =======================================================
     AUTH / GUARDS
  ======================================================= */

  function fallbackAllowRoute({ route, requestedPublicPath }) {
    if (!route) {
      return {
        allowed: false,
        reason: "not-found",
      };
    }

    if (route.public === true) {
      return {
        allowed: true,
        reason: "public",
      };
    }

    const Auth = getAuth();
    const authenticated =
      Auth?.isAuthenticated?.() === true ||
      readState().authenticated === true;

    if (!authenticated) {
      return {
        allowed: false,
        reason: "not-authenticated",
        redirectTo: `${LOGIN_PATH}?redirect=${encodeURIComponent(
          normalizePublicPath(requestedPublicPath || HOME_PATH)
        )}`,
      };
    }

    const roles = Array.isArray(route.roles) ? route.roles : [];

    if (!roles.length) {
      return {
        allowed: true,
        reason: "authenticated",
      };
    }

    const currentRole =
      Auth?.getRole?.() ||
      Auth?.getCurrentRole?.() ||
      readState().role ||
      "";

    return {
      allowed: roles.includes(currentRole),
      reason: roles.includes(currentRole) ? "role-match" : "insufficient-role",
    };
  }

  function checkAccess(route, canonicalPath, publicPath) {
    const shouldAllowRoute = RouteGuards.shouldAllowRoute;

    try {
      if (isFunction(shouldAllowRoute)) {
        const result = shouldAllowRoute({
          AppCore,
          Auth: getAuth(),
          route,
          requestedCanonicalPath: canonicalPath,
          requestedPublicPath: publicPath,
          getRoute,
        });

        return isObject(result)
          ? {
              allowed: result.allowed !== false,
              ...result,
            }
          : {
              allowed: result !== false,
            };
      }
    } catch (error) {
      return {
        allowed: false,
        reason: "guard-error",
        error,
      };
    }

    return fallbackAllowRoute({
      route,
      requestedCanonicalPath: canonicalPath,
      requestedPublicPath: publicPath,
    });
  }

  /* =======================================================
     HISTORY
  ======================================================= */

  function writeHistory(publicPath = HOME_PATH, options = {}) {
    if (options.skipHistory === true) return false;

    return Boolean(
      safeCall(History.updateHistory, {
        AppCore,
        getRoute,
        pathname: publicPath,
        options,
      })
    );
  }

  function initHistory() {
    safeCall(History.ensureInitialHistoryState, { AppCore });
    return true;
  }

  /* =======================================================
     RENDER HELPERS
  ======================================================= */

  function renderNotFound(data) {
    destroyActiveView();
    clearChrome();

    if (isFunction(Render.renderRouteNotFound)) {
      Render.renderRouteNotFound({
        AppCore,
        getRoute,
        updateHistory: History.updateHistory,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        routeParams: data.routeParams || {},
        setShellMode: (route) => Shell.setShellMode?.(AppCore, route),
        setDocumentTitle: (title) => Shell.setDocumentTitle?.(AppCore, title),
      });
    } else {
      renderFallback("Ruta no encontrada", "La vista solicitada no existe.");
    }

    const state = setRouterState(data);

    updateShell(null, state.canonicalPath);
    hideLoader();

    return {
      ok: true,
      found: false,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
    };
  }

  function renderForbidden(route, data, reason = "forbidden") {
    destroyActiveView();
    clearChrome();

    if (isFunction(Render.renderRouteForbidden)) {
      Render.renderRouteForbidden({
        AppCore,
        getRoute,
        updateHistory: History.updateHistory,
        route,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        routeParams: data.routeParams || {},
        setShellMode: (nextRoute) => Shell.setShellMode?.(AppCore, nextRoute),
        setDocumentTitle: (title) => Shell.setDocumentTitle?.(AppCore, title),
      });
    } else {
      renderFallback("Acceso no permitido", "No tienes permisos para ver esta vista.");
    }

    const state = setRouterState(data);

    updateShell(route, state.canonicalPath);
    hideLoader();

    return {
      ok: true,
      forbidden: true,
      reason,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
    };
  }

  function renderLogin(data, redirectTo = LOGIN_PATH) {
    destroyActiveView();
    clearChrome();

    const loginData = getRouteMatch(redirectTo);

    if (isFunction(Render.renderLoginRedirect)) {
      Render.renderLoginRedirect({
        AppCore,
        getRoute,
        updateHistory: History.updateHistory,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        routeParams: data.routeParams || {},
        redirectTo,
        clearDynamicContainers: () => clearChrome(),
        setActiveMenu: (path) => Shell.setActiveMenu?.(AppCore, path),
        setShellMode: (route) => Shell.setShellMode?.(AppCore, route),
        setDocumentTitle: (title) => Shell.setDocumentTitle?.(AppCore, title),
      });
    } else if (loginData.route?.render) {
      void loginData.route.render(viewRoot(), {
        route: loginData.route,
        requestedPath: loginData.publicPath,
        canonicalPath: loginData.canonicalPath,
        publicPath: loginData.publicPath,
        routeParams: loginData.routeParams || {},
      });
    } else {
      renderFallback("Acceso requerido", "Inicia sesión para continuar.");
    }

    const state = setRouterState(loginData);

    updateShell(loginData.route, state.canonicalPath);
    hideLoader();

    return {
      ok: true,
      redirected: true,
      redirectTo,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
    };
  }

  async function renderSuccess(route, data, options = {}) {
    destroyActiveView();
    clearChrome();
    updateShell(route, data.canonicalPath);
    writeHistory(data.publicPath, options);

    let view = null;

    if (isFunction(Render.renderRouteSuccess)) {
      view = await Render.renderRouteSuccess({
        AppCore,
        route,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        routeParams: data.routeParams || {},
        getRoute,
        setShellMode: (nextRoute) => Shell.setShellMode?.(AppCore, nextRoute),
        setDocumentTitle: (title) => Shell.setDocumentTitle?.(AppCore, title),
      });
    } else if (isFunction(route?.render)) {
      view = await route.render(viewRoot(), {
        route,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        routeParams: data.routeParams || {},
      });
    }

    activeView = view || null;

    const state = setRouterState(data);

    updateShell(route, state.canonicalPath);
    hideLoader();

    return {
      ok: true,
      found: true,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
      route,
    };
  }

  async function renderRuntimeError(route, data, error) {
    destroyActiveView();

    if (isFunction(Render.renderRouteRuntimeError)) {
      Render.renderRouteRuntimeError({
        AppCore,
        getRoute,
        route,
        error,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        routeParams: data.routeParams || {},
        setShellMode: (nextRoute) => Shell.setShellMode?.(AppCore, nextRoute),
        setDocumentTitle: (title) => Shell.setDocumentTitle?.(AppCore, title),
      });
    } else {
      renderFallback("Error de vista", "No se pudo renderizar esta vista.");
    }

    const state = setRouterState(data);

    updateShell(route, state.canonicalPath);
    hideLoader();

    emit("router:render:error", {
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      message: error?.message || "Render error",
    });

    return {
      ok: false,
      error,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
    };
  }

  async function executeRender(path = HOME_PATH, options = {}) {
    const seq = ++renderSeq;
    const data = getRouteMatch(path);

    emit("router:before-render", {
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
      matchedBy: data.matchedBy,
    });

    if (!data.route) {
      return renderNotFound(data);
    }

    const access = checkAccess(data.route, data.canonicalPath, data.publicPath);

    if (seq !== renderSeq) {
      return {
        ok: false,
        skipped: true,
        reason: "stale",
      };
    }

    if (!access.allowed) {
      if (access.redirectTo) {
        return renderLogin(data, access.redirectTo);
      }

      return renderForbidden(data.route, data, access.reason || "forbidden");
    }

    try {
      const result = await renderSuccess(data.route, data, options);

      emit("router:rendered", {
        canonicalPath: result.canonicalPath,
        publicPath: result.publicPath,
        found: true,
        matchedBy: data.matchedBy,
      });

      return result;
    } catch (error) {
      return renderRuntimeError(data.route, data, error);
    }
  }

  function render(path = HOME_PATH, options = {}) {
    renderPromise = renderPromise
      .catch(() => null)
      .then(() => executeRender(path, isObject(options) ? options : {}));

    return renderPromise;
  }

  function renderCurrent(options = {}) {
    return render(browserPath(), {
      ...options,
      replaceState: true,
      skipHistory: true,
      source: "render-current",
    });
  }

  /* =======================================================
     NAVIGATION
  ======================================================= */

  function navigate(path = HOME_PATH, options = {}) {
    const href = text(path, HOME_PATH);

    if (isUnsafeHref(href) || isExternalHref(href) || isHashOnlyHref(href)) {
      return Promise.resolve({
        ok: true,
        skipped: true,
        reason: "ignored-href",
      });
    }

    return render(normalizeNavigationTarget(href, options), options);
  }

  function replace(path = HOME_PATH, options = {}) {
    return navigate(path, {
      ...options,
      replaceState: true,
    });
  }

  function goAfterLogin(fallback = HOME_PATH, options = {}) {
    const target = normalizePostLoginTarget(
      readState().redirectAfterLogin ||
        readState().postLoginTarget ||
        fallback,
      getDefaultHome()
    );

    return navigate(target, {
      ...options,
      replaceState: true,
      force: true,
      source: "login",
    });
  }

  /* =======================================================
     EVENTS / BIND
  ======================================================= */

  function onDom(target, eventName, handler, options = false) {
    if (!target || !isFunction(target.addEventListener) || !isFunction(handler)) {
      return () => false;
    }

    try {
      target.addEventListener(eventName, handler, options);
    } catch {
      return () => false;
    }

    return () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {
        // noop
      }

      return true;
    };
  }

  function onClick(event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const link = event.target?.closest?.("a[data-spa]");

    if (!link || link.hasAttribute("download")) return;

    const href = link.getAttribute("href") || "";
    const target = text(link.getAttribute("target"), "").toLowerCase();

    if (!href || target === "_blank") return;
    if (isUnsafeHref(href) || isExternalHref(href) || isHashOnlyHref(href)) return;

    event.preventDefault();

    navigate(href, {
      source: "link-click",
    });
  }

  function handlePopState() {
    render(browserPath(), {
      skipHistory: true,
      replaceState: true,
      source: "popstate",
      useSlugHome: false,
    });
  }

  function attachToCore() {
    try {
      AppCore.Router = api;
      AppCore.router = api;
      AppCore.modules?.register?.("Router", api);
      AppCore.modules?.register?.("router", api);
    } catch {
      // noop
    }

    return true;
  }

  function bind() {
    if (bound) return api;

    if (isBrowser()) {
      disposers.push(onDom(document, "click", onClick));
      disposers.push(onDom(window, "popstate", handlePopState));
    }

    initHistory();

    bound = true;
    attachToCore();

    return api;
  }

  function unbind() {
    while (disposers.length) {
      try {
        disposers.pop()?.();
      } catch {
        // noop
      }
    }

    destroyActiveView();

    bound = false;

    return api;
  }

  function init() {
    if (initialized) return api;

    initialized = true;
    attachToCore();
    bind();

    return api;
  }

  function start(options = {}) {
    init();

    if (
      options.render === false ||
      options.skipInitialRender === true ||
      options.appManagedInitialRender === true
    ) {
      return Promise.resolve(api);
    }

    return renderCurrent({
      initialRender: true,
      preserveUrl: true,
      source: "router.start",
      ...options,
    }).then(() => api);
  }

  /* =======================================================
     SNAPSHOT
  ======================================================= */

  function getSnapshot() {
    return {
      version: ROUTER_VERSION,

      initialized,
      bound,

      renderSeq,
      hasActiveView: Boolean(activeView),

      route: readState().route || HOME_PATH,
      canonicalPath: currentCanonicalPath(),
      publicPath: currentPublicPath(),
      routeParams: readState().routeParams || {},

      defaultHome: getDefaultHome(),
      currentUserSlug: getCurrentUserSlug() || null,

      routes: routes.map((route) => ({
        path: route.path,
        name: route.name || route.id || "",
        title: route.title || route.label || "",
        public: Boolean(route.public),
        roles: Array.isArray(route.roles) ? route.roles : [],
      })),

      policy: {
        ownAuth: false,
        ownStorage: false,
        ownTransport: false,
        ownToast: false,
        ownViewLogic: false,

        publicSlugHome: true,
        homePath: HOME_PATH,
        homePublicPattern: "/@slug",
        noHomeAlias: true,
        noHomeRoute: true,

        repairStorm: false,
      },
    };
  }

  function debug(path = "") {
    const target = text(path, "");

    return target
      ? {
          target,
          match: getRouteMatch(target),
          snapshot: getSnapshot(),
        }
      : getSnapshot();
  }

  const api = {
    version: ROUTER_VERSION,
    routes,

    init,
    start,
    configure: init,

    bind,
    unbind,
    destroy: unbind,

    getRoute,
    routeExists,
    getRouteMatch,
    getCurrentRoute,

    getCurrentPath: currentPublicPath,
    getCurrentCanonicalPath: currentCanonicalPath,
    getCurrentPublicPath: currentPublicPath,

    navigate,
    replace,
    render,
    renderCurrent,

    go: navigate,
    push: navigate,
    back: (...args) => safeCall(History.back, ...args),
    handlePopState,
    bindLinks: bind,

    goAfterLogin,

    repairShell: () => true,
    repairCurrentRoute: () => renderCurrent({ source: "repair-current-route" }),
    hideLoader,

    buildPublicPath: normalizePublicPath,
    resolveSpaHref: normalizeNavigationTarget,

    buildUserHomePath,
    getDefaultHome,

    extractSlugFromPath,
    extractUsernameFromPath: extractSlugFromPath,

    stripUsernamePrefix: (path = HOME_PATH) => {
      return isUserHomePath(path) ? HOME_PATH : normalizePublicPath(path);
    },

    isSlugCandidatePath: isUserHomePath,
    isUserHomePath,
    canUsePublicSlugForRoute,

    isSameCanonicalPath: (a = HOME_PATH, b = HOME_PATH) =>
      normalizeCanonicalPath(a) === normalizeCanonicalPath(b),

    getRequestedData: getRouteMatch,

    safePath: normalizePublicPath,
    safePublicPath: normalizePublicPath,
    safeCanonicalPath: normalizeCanonicalPath,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    getState: getSnapshot,
    debug,
  };

  attachToCore();

  return api;
})();

export default Router;
