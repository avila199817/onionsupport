/* =========================================================
   Onion SPA - Router
   Archivo: src/router/index.js

   RESPONSABILIDADES:
   - coordinar navegación SPA
   - resolver rutas canónicas y públicas
   - serializar renders para evitar race conditions
   - aplicar guards de acceso
   - conectar history, shell y render del router
   - exponer la API pública de navegación

   HARDENING EXTREMO:
   - destroy seguro de vista anterior
   - cancelación de renders obsoletos
   - anti double-navigation burst
   - protección popstate robusta
   - redirect centralizado
   - fallbacks seguros sin romper SPA
   - métricas / eventos enriquecidos
   - no perder username resuelto entre renders
   - no degradar publicPath contextualizado a canonicalPath plano
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
  let activeViewInstance = null;
  const listenerDisposers = [];

  let lastNavigationAt = 0;
  let lastNavigationKey = "";

  const immutableRoutes =
    getImmutableRoutes();

  const NAV_BURST_MS = 140;

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(...args);
    } catch {}
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(...args);
    } catch {
      console.error(...args);
    }
  }

  function safeEmit(
    eventName,
    payload = {}
  ) {
    try {
      AppCore?.events?.emit?.(
        eventName,
        payload
      );
    } catch {}
  }

  function nowMs() {
    try {
      if (
        typeof performance !==
          "undefined" &&
        typeof performance.now ===
          "function"
      ) {
        return performance.now();
      }
    } catch {}

    return Date.now();
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function normalizePath(path = "/") {
    const normalized =
      typeof path === "string"
        ? path.trim()
        : "/";

    if (!normalized) {
      return "/";
    }

    return normalized.startsWith("/")
      ? normalized
      : `/${normalized}`;
  }

  /* =========================================================
     INTERNAL HELPERS
  ========================================================= */

  function getCanonicalPath(
    pathname = "/"
  ) {
    return normalizeCanonicalPath(
      AppCore,
      pathname
    );
  }

  function getStableResolvedUsername(
    requestedPath = "/"
  ) {
    return (
      extractUsernameFromPath(
        AppCore,
        requestedPath
      ) ||
      getCurrentResolvedUsername(
        AppCore
      ) ||
      getCurrentUsername(
        AppCore
      ) ||
      AppCore?.state?.user
        ?.username ||
      null
    );
  }

  function getRequestedPathData(
    pathname = "/"
  ) {
    const requestedPath =
      normalizePath(
        resolveSpaHref(
          AppCore,
          pathname
        ) || pathname || "/"
      );

    const canonicalPath =
      normalizePath(
        getCanonicalPath(
          requestedPath
        )
      );

    const requestedUsername =
      extractUsernameFromPath(
        AppCore,
        requestedPath
      );

    const resolvedUsername =
      requestedUsername ||
      getStableResolvedUsername(
        requestedPath
      );

    const route =
      getRoute(canonicalPath);

    const computedPublicPath =
      canUsePublicSlugForRoute(route)
        ? buildPublicPath(
            AppCore,
            getRoute,
            canonicalPath,
            {
              username:
                resolvedUsername,
            }
          ) ||
          requestedPath
        : canonicalPath;

    return {
      requestedPath,
      canonicalPath,
      requestedUsername,
      resolvedUsername,
      route,
      publicPath: normalizePath(
        computedPublicPath ||
          requestedPath ||
          canonicalPath
      ),
    };
  }

  function getRoute(
    pathname = "/"
  ) {
    const canonical =
      getCanonicalPath(
        pathname
      );

    return (
      immutableRoutes.find(
        (route) =>
          route.path ===
          canonical
      ) || null
    );
  }

  function routeExists(
    pathname = "/"
  ) {
    return Boolean(
      getRoute(pathname)
    );
  }

  function canUsePublicSlugForRoute(
    route
  ) {
    const routeNames =
      getRouteNames(
        AppCore
      );

    if (!route) return false;

    if (
      route.path ===
      routeNames.LOGIN
    ) {
      return false;
    }

    if (route.hideShell) {
      return false;
    }

    return true;
  }

  function getDefaultHomeTarget() {
    const routeNames =
      getRouteNames(
        AppCore
      );

    const username =
      getStableResolvedUsername("/");

    return (
      buildPublicPath(
        AppCore,
        getRoute,
        routeNames.HOME,
        {
          username,
        }
      ) || routeNames.HOME
    );
  }

  function getCurrentComparablePaths() {
    const currentCanonicalPath =
      normalizePath(
        getCurrentCanonicalPath(
          AppCore
        ) ||
          AppCore?.state?.route ||
          "/"
      );

    const currentPublicPath =
      normalizePath(
        getCurrentPublicPath(
          AppCore
        ) ||
          AppCore?.state
            ?.publicPath ||
          currentCanonicalPath
      );

    const normalizedCurrentPath =
      normalizePath(
        resolveSpaHref(
          AppCore,
          currentPublicPath
        ) || currentPublicPath
      );

    return {
      currentCanonicalPath,
      currentPublicPath,
      normalizedCurrentPath,
    };
  }

  function applyCommonPreRenderUI(
    canonicalPath
  ) {
    clearDynamicContainers(
      AppCore
    );

    setActiveMenu(
      AppCore,
      canonicalPath
    );
  }

  function setShellModeSafe(
    routeArg
  ) {
    return setShellMode(
      AppCore,
      routeArg
    );
  }

  function setDocumentTitleSafe(
    title
  ) {
    return setDocumentTitle(
      AppCore,
      title
    );
  }

  function destroyActiveView() {
    if (
      !activeViewInstance ||
      !isFunction(
        activeViewInstance
          .destroy
      )
    ) {
      activeViewInstance =
        null;
      return;
    }

    try {
      activeViewInstance.destroy();
    } catch (error) {
      safeWarn(
        "[Router] destroy view error:",
        error
      );
    }

    activeViewInstance =
      null;
  }

  function rememberNavigationKey(
    key = ""
  ) {
    lastNavigationKey =
      String(key || "");
    lastNavigationAt =
      Date.now();
  }

  function isNavigationBurst(
    key = ""
  ) {
    const now = Date.now();

    return (
      key &&
      key === lastNavigationKey &&
      now - lastNavigationAt <
        NAV_BURST_MS
    );
  }

  function syncResolvedRouteState({
    canonicalPath = "/",
    publicPath = "/",
    username = null,
    route = null,
  } = {}) {
    const safeCanonical =
      normalizePath(
        canonicalPath || "/"
      );

    const nextRoute =
      route ||
      getRoute(safeCanonical);

    const safePublic =
      normalizePath(
        publicPath ||
          (
            canUsePublicSlugForRoute(
              nextRoute
            )
              ? buildPublicPath(
                  AppCore,
                  getRoute,
                  safeCanonical,
                  {
                    username:
                      username ||
                      getStableResolvedUsername(
                        safeCanonical
                      ),
                  }
                )
              : safeCanonical
          ) ||
          safeCanonical
      );

    const resolvedUsername =
      username ||
      extractUsernameFromPath(
        AppCore,
        safePublic
      ) ||
      getStableResolvedUsername(
        safePublic
      );

    AppCore?.setRoute?.(
      safeCanonical
    );

    AppCore?.setPublicPath?.(
      safePublic
    );

    AppCore?.setState?.({
      route: safeCanonical,
      publicPath: safePublic,
      currentResolvedUsername:
        resolvedUsername ||
        null,
    });

    return {
      canonicalPath:
        safeCanonical,
      publicPath:
        safePublic,
      username:
        resolvedUsername ||
        null,
    };
  }

  function redirectTo(
    targetPath,
    meta = {},
    navOptions = {}
  ) {
    return navigate(
      targetPath,
      {
        replaceState: true,
        force: true,
        redirectedFrom:
          meta.redirectedFrom ||
          null,
        ...navOptions,
      }
    );
  }

  /* =========================================================
     ACCESS
  ========================================================= */

  function resolveRouteAccess({
    route,
    canonicalPath,
  }) {
    return shouldAllowRoute({
      AppCore,
      Auth,
      route,
      requestedCanonicalPath:
        canonicalPath,
      getRoute,
    });
  }

  async function handleDeniedAccess({
    access,
    route,
    requestedPath,
    canonicalPath,
    requestedUsername,
    resolvedUsername,
    options,
  }) {
    if (
      access.reason ===
      "not-authenticated"
    ) {
      destroyActiveView();

      renderLoginRedirect({
        AppCore,
        getRoute,
        updateHistory,
        canonicalPath,
        clearDynamicContainers:
          () =>
            clearDynamicContainers(
              AppCore
            ),
        setActiveMenu:
          (pathArg) =>
            setActiveMenu(
              AppCore,
              pathArg
            ),
        setShellMode:
          (routeArg) =>
            setShellModeSafe(
              routeArg
            ),
        setDocumentTitle:
          (title) =>
            setDocumentTitleSafe(
              title
            ),
      });

      syncResolvedRouteState({
        canonicalPath:
          "/login",
        publicPath: "/login",
        username: null,
        route: getRoute("/login"),
      });

      return true;
    }

    if (
      access.reason ===
      "already-authenticated"
    ) {
      await redirectTo(
        access.redirectTo ||
          getDefaultHomeTarget(),
        {
          redirectedFrom:
            canonicalPath,
        }
      );

      return true;
    }

    if (
      access.reason ===
      "insufficient-role"
    ) {
      destroyActiveView();

      renderRouteForbidden({
        AppCore,
        getRoute,
        updateHistory,
        route,
        requestedPath,
        canonicalPath,
        requestedUsername,
        options,
        setShellMode:
          (routeArg) =>
            setShellModeSafe(
              routeArg
            ),
        setDocumentTitle:
          (title) =>
            setDocumentTitleSafe(
              title
            ),
      });

      syncResolvedRouteState({
        canonicalPath,
        publicPath:
          requestedPath,
        username:
          requestedUsername ||
          resolvedUsername,
        route,
      });

      return true;
    }

    return false;
  }

  /* =========================================================
     CORE RENDER
  ========================================================= */

  async function executeRender(
    pathname = "/",
    options = {}
  ) {
    const cycleId =
      ++renderCycle;

    const startedAt =
      nowMs();

    const {
      requestedPath,
      canonicalPath,
      requestedUsername,
      resolvedUsername,
      route,
      publicPath,
    } = getRequestedPathData(
      pathname
    );

    emitBeforeRender(
      AppCore,
      {
        path: requestedPath,
        canonicalPath,
        publicPath,
        username:
          resolvedUsername,
        route,
      }
    );

    applyCommonPreRenderUI(
      canonicalPath
    );

    if (
      cycleId !== renderCycle
    ) {
      safeEmit(
        "router:render:cancelled",
        {
          reason:
            "stale-pre-route",
          cycleId,
          renderCycle,
          path: requestedPath,
          canonicalPath,
        }
      );
      return;
    }

    if (!route) {
      destroyActiveView();

      renderRouteNotFound({
        AppCore,
        getRoute,
        updateHistory,
        requestedPath:
          publicPath,
        canonicalPath,
        requestedUsername:
          requestedUsername ||
          resolvedUsername,
        options,
        setShellMode:
          (routeArg) =>
            setShellModeSafe(
              routeArg
            ),
        setDocumentTitle:
          (title) =>
            setDocumentTitleSafe(
              title
            ),
      });

      syncResolvedRouteState({
        canonicalPath,
        publicPath,
        username:
          requestedUsername ||
          resolvedUsername,
        route: null,
      });

      safeEmit(
        "router:render:not-found",
        {
          path: publicPath,
          canonicalPath,
          cycleId,
          username:
            requestedUsername ||
            resolvedUsername ||
            null,
        }
      );

      return;
    }

    const access =
      resolveRouteAccess({
        route,
        canonicalPath,
      });

    if (!access.allowed) {
      const handled =
        await handleDeniedAccess({
          access,
          route,
          requestedPath:
            publicPath,
          canonicalPath,
          requestedUsername,
          resolvedUsername,
          options,
        });

      if (handled) {
        safeEmit(
          "router:render:blocked",
          {
            reason:
              access.reason,
            path: publicPath,
            canonicalPath,
            cycleId,
            username:
              requestedUsername ||
              resolvedUsername ||
              null,
          }
        );
        return;
      }
    }

    updateHistory({
      AppCore,
      getRoute,
      pathname:
        canonicalPath,
      options: {
        ...options,
        username:
          requestedUsername ||
          resolvedUsername ||
          getCurrentUsername(
            AppCore
          ) ||
          null,
      },
    });

    try {
      destroyActiveView();

      const maybeView =
        await Promise.resolve(
          renderRouteSuccess({
            AppCore,
            route,
            requestedPath:
              publicPath,
            canonicalPath,
            requestedUsername:
              requestedUsername ||
              resolvedUsername,
            setShellMode:
              (routeArg) =>
                setShellModeSafe(
                  routeArg
                ),
            setDocumentTitle:
              (title) =>
                setDocumentTitleSafe(
                  title
                ),
          })
        );

      if (
        cycleId !== renderCycle
      ) {
        try {
          maybeView?.destroy?.();
        } catch {}

        safeEmit(
          "router:render:cancelled",
          {
            reason:
              "stale-post-render",
            cycleId,
            renderCycle,
            path: publicPath,
            canonicalPath,
          }
        );

        return;
      }

      activeViewInstance =
        maybeView || null;

      const synced =
        syncResolvedRouteState({
          canonicalPath,
          publicPath,
          username:
            requestedUsername ||
            resolvedUsername,
          route,
        });

      safeEmit(
        "router:rendered",
        {
          path:
            synced.publicPath,
          canonicalPath:
            synced.canonicalPath,
          publicPath:
            synced.publicPath,
          username:
            synced.username,
          durationMs:
            Math.round(
              nowMs() -
                startedAt
            ),
        }
      );

      safeLog(
        "[Router] render",
        {
          publicPath:
            synced.publicPath,
          canonicalPath:
            synced.canonicalPath,
          username:
            synced.username,
          found: true,
          forbidden: false,
        }
      );
    } catch (error) {
      destroyActiveView();

      renderRouteRuntimeError({
        AppCore,
        getRoute,
        route,
        error,
        requestedPath:
          publicPath,
        canonicalPath,
        requestedUsername:
          requestedUsername ||
          resolvedUsername,
        cycleId,
        renderCycle,
        setShellMode:
          (routeArg) =>
            setShellModeSafe(
              routeArg
            ),
        setDocumentTitle:
          (title) =>
            setDocumentTitleSafe(
              title
            ),
      });

      syncResolvedRouteState({
        canonicalPath,
        publicPath,
        username:
          requestedUsername ||
          resolvedUsername,
        route,
      });

      safeError(
        "[Router] render error:",
        error
      );

      safeEmit(
        "router:render:error",
        {
          path: publicPath,
          canonicalPath,
          publicPath,
          username:
            requestedUsername ||
            resolvedUsername ||
            null,
          cycleId,
          durationMs:
            Math.round(
              nowMs() -
                startedAt
            ),
          error:
            String(
              error?.message ||
                error
            ),
        }
      );
    }
  }

  function render(
    pathname = "/",
    options = {}
  ) {
    lastRenderPromise =
      lastRenderPromise
        .catch(() => {})
        .then(() =>
          executeRender(
            pathname,
            options
          )
        );

    return lastRenderPromise;
  }

  /* =========================================================
     NAVIGATION
  ========================================================= */

  function navigate(
    pathname = "/",
    options = {}
  ) {
    const {
      requestedPath,
      canonicalPath,
      publicPath,
    } = getRequestedPathData(
      pathname
    );

    const navKey =
      `${publicPath}|${canonicalPath}`;

    if (
      isNavigationBurst(
        navKey
      ) &&
      !options.force
    ) {
      safeEmit(
        "router:navigate:skipped",
        {
          reason: "burst",
          pathname,
          requestedPath:
            publicPath,
          canonicalPath,
          navKey,
        }
      );
      return lastRenderPromise;
    }

    rememberNavigationKey(
      navKey
    );

    const {
      currentCanonicalPath,
      normalizedCurrentPath,
    } =
      getCurrentComparablePaths();

    if (
      canonicalPath ===
        currentCanonicalPath &&
      publicPath ===
        normalizedCurrentPath &&
      !options.force
    ) {
      safeEmit(
        "router:navigate:same-route",
        {
          pathname,
          requestedPath:
            publicPath,
          canonicalPath,
          navKey,
        }
      );

      return render(
        publicPath,
        {
          ...options,
          skipHistory: true,
        }
      );
    }

    return render(
      publicPath,
      options
    );
  }

  function replace(
    pathname = "/",
    options = {}
  ) {
    return navigate(
      pathname,
      {
        ...options,
        replaceState: true,
      }
    );
  }

  function goAfterLogin(
    fallback = "/"
  ) {
    const routeNames =
      getRouteNames(
        AppCore
      );

    const redirect =
      new URL(
        window.location.href
      ).searchParams.get(
        "redirect"
      );

    const nextCanonicalPath =
      getCanonicalPath(
        redirect || fallback
      );

    const nextPublicPath =
      buildPublicPath(
        AppCore,
        getRoute,
        nextCanonicalPath,
        {
          username:
            getStableResolvedUsername(
              nextCanonicalPath
            ),
        }
      );

    return navigate(
      nextPublicPath ||
        nextCanonicalPath ||
        routeNames.HOME,
      {
        replaceState: true,
        force: true,
      }
    );
  }

  /* =========================================================
     LISTENERS
  ========================================================= */

  function handleDocumentClick(
    event
  ) {
    if (
      event.defaultPrevented
    ) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const link =
      event.target?.closest?.(
        "a[data-spa]"
      );

    if (!link) {
      return;
    }

    const href =
      link.getAttribute(
        "href"
      ) || "";

    if (!href) {
      return;
    }

    if (
      link.hasAttribute(
        "download"
      )
    ) {
      return;
    }

    if (
      (
        link.getAttribute(
          "target"
        ) || ""
      ).toLowerCase() ===
      "_blank"
    ) {
      return;
    }

    if (
      isHashOnlyHref(href)
    ) {
      return;
    }

    if (
      isUnsafeHref(href)
    ) {
      event.preventDefault();

      safeWarn(
        "Router bloqueó href inseguro:",
        href
      );

      return;
    }

    if (
      isExternalHref(href)
    ) {
      return;
    }

    event.preventDefault();

    navigate(href);
  }

  function handlePopState() {
    const path =
      getCurrentPublicPath(
        AppCore
      ) ||
      window.location.pathname ||
      "/";

    render(path, {
      skipHistory: true,
      replaceState: true,
      force: true,
    });
  }

  /* =========================================================
     BIND
  ========================================================= */

  function bind() {
    if (isBound) {
      return api;
    }

    validateRoutesTable(
      AppCore,
      immutableRoutes,
      normalizeCanonicalPath
    );

    isBound = true;

    const offClick =
      AppCore.utils.on(
        document,
        "click",
        handleDocumentClick
      );

    const offPopstate =
      AppCore.utils.on(
        window,
        "popstate",
        handlePopState
      );

    listenerDisposers.push(
      offClick,
      offPopstate
    );

    ensureInitialHistoryState({
      AppCore,
    });

    safeEmit(
      "router:bound",
      {
        routes:
          immutableRoutes.map(
            (route) =>
              route.path
          ),
      }
    );

    safeLog(
      "[Router] ready",
      immutableRoutes.length
    );

    return api;
  }

  function unbind() {
    if (!isBound) {
      return api;
    }

    while (
      listenerDisposers.length
    ) {
      const dispose =
        listenerDisposers.pop();

      try {
        dispose?.();
      } catch (error) {
        safeWarn(
          "[Router] dispose error:",
          error
        );
      }
    }

    isBound = false;
    destroyActiveView();

    safeEmit(
      "router:unbound",
      {}
    );

    return api;
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    routes:
      immutableRoutes,

    bind,
    unbind,

    getRoute,
    routeExists,

    getCurrentPath: () =>
      getCurrentPath(
        AppCore
      ),

    getCurrentCanonicalPath:
      () =>
        getCurrentCanonicalPath(
          AppCore
        ),

    getCurrentResolvedUsername:
      () =>
        getCurrentResolvedUsername(
          AppCore
        ) ||
        getCurrentUsername(
          AppCore
        ) ||
        AppCore?.state?.user
          ?.username ||
        null,

    navigate,
    replace,
    render,
    back,
    goAfterLogin,

    buildPublicPath: (
      canonicalPath = "/",
      options = {}
    ) =>
      buildPublicPath(
        AppCore,
        getRoute,
        canonicalPath,
        options
      ),

    stripUsernamePrefix: (
      pathname = "/"
    ) =>
      stripUsernamePrefix(
        AppCore,
        pathname
      ),

    extractUsernameFromPath:
      (pathname = "/") =>
        extractUsernameFromPath(
          AppCore,
          pathname
        ),

    resolveSpaHref: (
      href = "/"
    ) =>
      resolveSpaHref(
        AppCore,
        href
      ),

    isSlugCandidatePath: (
      pathname = "/"
    ) =>
      isSlugCandidatePath(
        AppCore,
        pathname
      ),

    isSameCanonicalPath: (
      a = "/",
      b = "/"
    ) =>
      isSameCanonicalPath(
        AppCore,
        a,
        b
      ),

    canUsePublicSlugForRoute,
  };

  return api;
})();

export default Router;
