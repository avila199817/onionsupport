/* =========================================================
   Onion Support - Router
   Archivo: /src/router/index.js

   Responsabilidad:
   - Orquestador mínimo de navegación SPA.
   - Buscar ruta.
   - Consultar guard.
   - Renderizar vista.
   - Actualizar history.
   - Sin Auth estático.
   - Sin fetch.
   - Sin storage.
   - Sin Toast.
   - Sin username public slug.
   - Sin repair/event storm.
   - Sin rutas inventadas.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../core/index.js";

import {
  ROUTE_PATHS,
  getImmutableRoutes,
} from "./routes.js";

import {
  shouldAllowRoute,
} from "./guards.js";

import {
  updateHistory,
  ensureInitialHistoryState,
  back,
} from "./history.js";

import {
  renderRouteSuccess,
  renderRouteForbidden,
  renderRouteNotFound,
  renderLoginRedirect,
  renderRouteRuntimeError,
} from "./render.js";

import {
  clearDynamicContainers,
  setDocumentTitle,
  setActiveMenu,
  setShellMode,
} from "./shell.js";

export const ROUTER_VERSION = "simple";

export const Router = (() => {
  "use strict";

  const SOURCE = "router";
  const HOME_PATH = ROUTE_PATHS?.HOME || "/";
  const LOGIN_PATH = ROUTE_PATHS?.LOGIN || "/login";

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

  function emit(name = "", payload = {}) {
    try {
      AppCore?.events?.emit?.(name, {
        source: SOURCE,
        version: ROUTER_VERSION,
        ...payload,
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

    if (value.startsWith("#/")) {
      value = value.slice(1);
    }

    if (value.startsWith("#!")) {
      value = value.replace(/^#!\/?/, "/");
    }

    try {
      if (/^https?:\/\//i.test(value)) {
        const url = new URL(value);
        value = `${url.pathname || HOME_PATH}${url.search || ""}${url.hash || ""}`;
      }
    } catch {
      // noop
    }

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    return value || HOME_PATH;
  }

  function normalizeCanonicalPath(path = HOME_PATH) {
    const publicPath = normalizePublicPath(path);
    let canonical = publicPath.split("?")[0].split("#")[0] || HOME_PATH;

    if (canonical.length > 1) {
      canonical = canonical.replace(/\/+$/g, "");
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
    return normalizePublicPath(AppCore?.state?.publicPath || browserPath());
  }

  function currentCanonicalPath() {
    return normalizeCanonicalPath(
      AppCore?.state?.canonicalPath ||
        AppCore?.state?.route ||
        currentPublicPath()
    );
  }

  function isExternalHref(href = "") {
    const value = text(href, "");

    return /^https?:\/\//i.test(value) && isBrowser() && !value.startsWith(window.location.origin);
  }

  function isUnsafeHref(href = "") {
    const value = text(href, "");

    return (
      !value ||
      value.startsWith("//") ||
      /^javascript:/i.test(value) ||
      /^data:/i.test(value) ||
      /^vbscript:/i.test(value)
    );
  }

  function isHashOnlyHref(href = "") {
    const value = text(href, "");
    return value.startsWith("#") && !value.startsWith("#/") && !value.startsWith("#!");
  }

  /* =======================================================
     ROUTES
  ======================================================= */

  function routePath(route = null) {
    return normalizeCanonicalPath(route?.path || HOME_PATH);
  }

  function getRouteMatch(path = HOME_PATH) {
    const publicPath = normalizePublicPath(path);
    const canonicalPath = normalizeCanonicalPath(publicPath);

    const route = routes.find((item) => {
      if (routePath(item) === canonicalPath) return true;

      try {
        if (isFunction(item.match) && item.match(canonicalPath)) return true;
      } catch {
        // noop
      }

      try {
        if (item.pattern instanceof RegExp) {
          item.pattern.lastIndex = 0;
          return item.pattern.test(canonicalPath);
        }
      } catch {
        // noop
      }

      return false;
    }) || null;

    return {
      route,
      publicPath,
      canonicalPath,
    };
  }

  function getRoute(path = HOME_PATH) {
    return getRouteMatch(path).route;
  }

  function routeExists(path = HOME_PATH) {
    return Boolean(getRoute(path));
  }

  function getCurrentRoute() {
    return getRoute(currentCanonicalPath());
  }

  /* =======================================================
     STATE / SHELL
  ======================================================= */

  function setRouterState({ canonicalPath = HOME_PATH, publicPath = HOME_PATH } = {}) {
    const canonical = normalizeCanonicalPath(canonicalPath);
    const visible = normalizePublicPath(publicPath || canonical);

    try {
      AppCore?.setRoute?.(canonical);
    } catch {
      // noop
    }

    try {
      AppCore?.setPublicPath?.(visible);
    } catch {
      // noop
    }

    try {
      AppCore?.setState?.(
        {
          route: canonical,
          canonicalPath: canonical,
          publicPath: visible,
          initialRouteRendered: true,
        },
        {
          source: SOURCE,
          silent: true,
          emit: false,
        }
      );
    } catch {
      try {
        Object.assign(AppCore.state, {
          route: canonical,
          canonicalPath: canonical,
          publicPath: visible,
          initialRouteRendered: true,
        });
      } catch {
        // noop
      }
    }

    return {
      canonicalPath: canonical,
      publicPath: visible,
    };
  }

  function updateShell(route = null, canonicalPath = HOME_PATH) {
    try {
      setShellMode(AppCore, route);
    } catch {
      // noop
    }

    try {
      setActiveMenu(AppCore, canonicalPath);
    } catch {
      // noop
    }

    try {
      setDocumentTitle(AppCore, route?.title || route?.label || route?.name || "Onion Support");
    } catch {
      // noop
    }

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
    } catch {
      // noop
    }

    return true;
  }

  function destroyActiveView() {
    if (!activeView) return false;

    try {
      activeView.destroy?.();
    } catch {
      // noop
    }

    activeView = null;

    return true;
  }

  /* =======================================================
     AUTH / GUARDS
  ======================================================= */

  function getAuth() {
    try {
      return AppCore?.Auth || AppCore?.auth || AppCore?.modules?.get?.("Auth") || null;
    } catch {
      return null;
    }
  }

  function checkAccess(route, canonicalPath, publicPath) {
    try {
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
    } catch (error) {
      return {
        allowed: false,
        reason: "guard-error",
        error,
      };
    }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  function renderNotFound(data) {
    destroyActiveView();
    clearDynamicContainers(AppCore);

    renderRouteNotFound({
      AppCore,
      getRoute,
      updateHistory,
      requestedPath: data.publicPath,
      canonicalPath: data.canonicalPath,
      setShellMode: (route) => setShellMode(AppCore, route),
      setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
    });

    const state = setRouterState(data);
    updateShell(null, state.canonicalPath);
    hideLoader();

    return {
      ok: true,
      found: false,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
    };
  }

  function renderForbidden(route, data, reason = "forbidden") {
    destroyActiveView();
    clearDynamicContainers(AppCore);

    renderRouteForbidden({
      AppCore,
      getRoute,
      updateHistory,
      route,
      requestedPath: data.publicPath,
      canonicalPath: data.canonicalPath,
      setShellMode: (nextRoute) => setShellMode(AppCore, nextRoute),
      setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
    });

    const state = setRouterState(data);
    updateShell(route, state.canonicalPath);
    hideLoader();

    return {
      ok: true,
      forbidden: true,
      reason,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
    };
  }

  function renderLogin(data, redirectTo = LOGIN_PATH) {
    destroyActiveView();
    clearDynamicContainers(AppCore);

    renderLoginRedirect({
      AppCore,
      getRoute,
      updateHistory,
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
      redirectTo,
      clearDynamicContainers: () => clearDynamicContainers(AppCore),
      setActiveMenu: (path) => setActiveMenu(AppCore, path),
      setShellMode: (route) => setShellMode(AppCore, route),
      setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
    });

    const loginData = getRouteMatch(redirectTo);
    const state = setRouterState(loginData);

    updateShell(loginData.route, state.canonicalPath);
    hideLoader();

    return {
      ok: true,
      redirected: true,
      redirectTo,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
    };
  }

  async function renderSuccess(route, data, options = {}) {
    destroyActiveView();
    clearDynamicContainers(AppCore);
    updateShell(route, data.canonicalPath);

    if (options.skipHistory !== true) {
      updateHistory({
        AppCore,
        getRoute,
        pathname: data.publicPath,
        options,
      });
    }

    const view = await Promise.resolve(
      renderRouteSuccess({
        AppCore,
        route,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        getRoute,
        setShellMode: (nextRoute) => setShellMode(AppCore, nextRoute),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      })
    );

    activeView = view || null;

    const state = setRouterState(data);

    updateShell(route, state.canonicalPath);
    hideLoader();

    return {
      ok: true,
      found: true,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      route,
    };
  }

  async function executeRender(path = HOME_PATH, options = {}) {
    const seq = ++renderSeq;
    const data = getRouteMatch(path);

    emit("router:before-render", {
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
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
      });

      return result;
    } catch (error) {
      destroyActiveView();

      renderRouteRuntimeError({
        AppCore,
        getRoute,
        route: data.route,
        error,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        setShellMode: (route) => setShellMode(AppCore, route),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });

      const state = setRouterState(data);
      updateShell(data.route, state.canonicalPath);
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
      };
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

    return render(normalizePublicPath(href), options);
  }

  function replace(path = HOME_PATH, options = {}) {
    return navigate(path, {
      ...options,
      replaceState: true,
    });
  }

  function goAfterLogin(fallback = HOME_PATH, options = {}) {
    const target =
      AppCore?.state?.redirectAfterLogin ||
      AppCore?.state?.postLoginTarget ||
      fallback ||
      HOME_PATH;

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

    target.addEventListener(eventName, handler, options);

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
    navigate(href, { source: "link-click" });
  }

  function handlePopState() {
    render(browserPath(), {
      skipHistory: true,
      replaceState: true,
      source: "popstate",
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

    try {
      ensureInitialHistoryState({ AppCore });
    } catch {
      // noop
    }

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

    if (options.render === false || options.skipInitialRender === true || options.appManagedInitialRender === true) {
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

      routes: routes.map((route) => ({
        path: route.path,
        name: route.name || route.id || "",
        title: route.title || route.label || "",
      })),

      policy: {
        ownAuth: false,
        ownStorage: false,
        ownTransport: false,
        ownToast: false,
        ownViewLogic: false,
        usernamePublicSlug: false,
        repairStorm: false,
      },
    };
  }

  function readState() {
    return isObject(AppCore?.state) ? AppCore.state : {};
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
    back: (...args) => back(...args),
    handlePopState,
    bindLinks: bind,

    goAfterLogin,

    repairShell: () => true,
    repairCurrentRoute: () => renderCurrent({ source: "repair-current-route" }),
    hideLoader,

    buildPublicPath: normalizePublicPath,
    stripUsernamePrefix: normalizePublicPath,
    extractUsernameFromPath: () => null,
    resolveSpaHref: normalizePublicPath,
    isSlugCandidatePath: () => false,
    isSameCanonicalPath: (a = HOME_PATH, b = HOME_PATH) => normalizeCanonicalPath(a) === normalizeCanonicalPath(b),
    canUsePublicSlugForRoute: () => false,

    getRequestedData: getRouteMatch,
    getDefaultHome: () => HOME_PATH,

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
