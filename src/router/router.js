/* =========================================================
   Onion SPA - Router
   Archivo: src/router/router.js

   Responsabilidades:
   - coordinar navegación SPA
   - resolver rutas canónicas y públicas
   - serializar renders para evitar race conditions
   - aplicar guards de acceso
   - conectar history, shell y render del router
   - exponer la API pública de navegación
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";

import {
  getRouteNames,
  normalizeCanonicalPath,
  getCurrentPath,
  getCurrentCanonicalPath,
  getCurrentResolvedUsername,
  getCurrentPublicPath,
  getCurrentUsername,
  extractUsernameFromPath,
  stripUsernamePrefix,
  resolveSpaHref,
  isSlugCandidatePath,
  isSameCanonicalPath,
  isExternalHref,
  isUnsafeHref,
  isHashOnlyHref,
  buildPublicPath,
} from "./helpers.js";

import {
  getImmutableRoutes,
  validateRoutesTable,
} from "./routes.js";

import { shouldAllowRoute } from "./guards.js";

import {
  updateHistory,
  ensureInitialHistoryState,
  back,
} from "./history.js";

import {
  emitBeforeRender,
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

export const Router = (() => {
  "use strict";

  /* =========================================================
     STATE
  ========================================================= */
  let isBound = false;
  let lastRenderPromise = Promise.resolve();
  let renderCycle = 0;

  const immutableRoutes = getImmutableRoutes();

  /* =========================================================
     LOOKUP DE RUTAS
  ========================================================= */
  function getRoute(pathname = "/") {
    const canonical = normalizeCanonicalPath(AppCore, pathname);
    return immutableRoutes.find((route) => route.path === canonical) || null;
  }

  function routeExists(pathname = "/") {
    return Boolean(getRoute(pathname));
  }

  function canUsePublicSlugForRoute(route) {
    const routeNames = getRouteNames(AppCore);

    if (!route) return false;
    if (route.path === routeNames.LOGIN) return false;
    if (route.hideShell) return false;

    return true;
  }

  function getDefaultHomeTarget() {
    const routeNames = getRouteNames(AppCore);

    return (
      buildPublicPath(AppCore, getRoute, routeNames.HOME, {
        username:
          getCurrentResolvedUsername(AppCore) ||
          getCurrentUsername(AppCore),
      }) || routeNames.HOME
    );
  }

  /* =========================================================
     REDIRECTS
  ========================================================= */
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

    const requestedPath = resolveSpaHref(AppCore, pathname);
    const canonicalPath = normalizeCanonicalPath(AppCore, requestedPath);
    const requestedUsername = extractUsernameFromPath(AppCore, requestedPath);
    const route = getRoute(canonicalPath);

    emitBeforeRender(AppCore, {
      path: requestedPath,
      canonicalPath,
      publicPath: requestedPath,
      username:
        requestedUsername || getCurrentResolvedUsername(AppCore) || null,
      route,
    });

    clearDynamicContainers(AppCore);
    setActiveMenu(AppCore, canonicalPath);

    if (!route) {
      renderRouteNotFound({
        AppCore,
        getRoute,
        updateHistory,
        requestedPath,
        canonicalPath,
        requestedUsername,
        options,
        setShellMode: (routeArg) => setShellMode(AppCore, routeArg),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });
      return;
    }

    const access = shouldAllowRoute({
      AppCore,
      Auth,
      route,
      requestedCanonicalPath: canonicalPath,
      getRoute,
    });

    if (!access.allowed) {
      if (access.reason === "not-authenticated") {
        renderLoginRedirect({
          AppCore,
          getRoute,
          updateHistory,
          canonicalPath,
          clearDynamicContainers: () => clearDynamicContainers(AppCore),
          setActiveMenu: (pathArg) => setActiveMenu(AppCore, pathArg),
          setShellMode: (routeArg) => setShellMode(AppCore, routeArg),
          setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
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
          AppCore,
          getRoute,
          updateHistory,
          route,
          requestedPath,
          canonicalPath,
          requestedUsername,
          options,
          setShellMode: (routeArg) => setShellMode(AppCore, routeArg),
          setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
        });
        return;
      }
    }

    updateHistory({
      AppCore,
      getRoute,
      pathname: canonicalPath,
      options: {
        ...options,
        username: requestedUsername || getCurrentUsername(AppCore),
      },
    });

    try {
      renderRouteSuccess({
        AppCore,
        route,
        requestedPath,
        canonicalPath,
        requestedUsername,
        setShellMode: (routeArg) => setShellMode(AppCore, routeArg),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });
    } catch (error) {
      renderRouteRuntimeError({
        AppCore,
        getRoute,
        route,
        error,
        requestedPath,
        canonicalPath,
        requestedUsername,
        cycleId,
        renderCycle,
        setShellMode: (routeArg) => setShellMode(AppCore, routeArg),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });
    }
  }

  function render(pathname = "/", options = {}) {
    lastRenderPromise = lastRenderPromise
      .catch(() => {})
      .then(() => executeRender(pathname, options));

    return lastRenderPromise;
  }

  /* =========================================================
     NAVEGACIÓN PÚBLICA
  ========================================================= */
  function navigate(pathname = "/", options = {}) {
    const requestedPath = resolveSpaHref(AppCore, pathname);
    const canonicalPath = normalizeCanonicalPath(AppCore, requestedPath);
    const currentCanonicalPath = normalizeCanonicalPath(
      AppCore,
      AppCore.state.route || "/"
    );
    const currentPath = getCurrentPublicPath(AppCore);
    const normalizedCurrentPath = resolveSpaHref(AppCore, currentPath);

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

  function goAfterLogin(fallback = "/") {
    const routeNames = getRouteNames(AppCore);
    const redirect = new URL(window.location.href).searchParams.get("redirect");

    const nextCanonicalPath = normalizeCanonicalPath(
      AppCore,
      redirect || fallback
    );

    const nextPublicPath = buildPublicPath(
      AppCore,
      getRoute,
      nextCanonicalPath,
      {
        username:
          getCurrentResolvedUsername(AppCore) ||
          getCurrentUsername(AppCore),
      }
    );

    navigate(nextPublicPath || nextCanonicalPath || routeNames.HOME, {
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
    render(getCurrentPublicPath(AppCore), {
      skipHistory: true,
      replaceState: true,
      force: true,
    });
  }

  /* =========================================================
     BIND
  ========================================================= */
  function bind() {
    if (isBound) return api;

    validateRoutesTable(AppCore, immutableRoutes, normalizeCanonicalPath);
    isBound = true;

    AppCore.utils.on(document, "click", handleDocumentClick);
    AppCore.utils.on(window, "popstate", handlePopState);

    ensureInitialHistoryState({
      AppCore,
    });

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

    getCurrentPath: () => getCurrentPath(AppCore),
    getCurrentCanonicalPath: () => getCurrentCanonicalPath(AppCore),
    getCurrentResolvedUsername: () => getCurrentResolvedUsername(AppCore),

    navigate,
    replace,
    render,
    back,
    goAfterLogin,

    buildPublicPath: (canonicalPath = "/", options = {}) =>
      buildPublicPath(AppCore, getRoute, canonicalPath, options),

    stripUsernamePrefix: (pathname = "/") =>
      stripUsernamePrefix(AppCore, pathname),

    extractUsernameFromPath: (pathname = "/") =>
      extractUsernameFromPath(AppCore, pathname),

    resolveSpaHref: (href = "/") => resolveSpaHref(AppCore, href),

    isSlugCandidatePath: (pathname = "/") =>
      isSlugCandidatePath(AppCore, pathname),

    isSameCanonicalPath: (a = "/", b = "/") =>
      isSameCanonicalPath(AppCore, a, b),

    canUsePublicSlugForRoute,
  };

  return api;
})();
