/* =========================================================
   Onion SPA - Router
   Archivo: src/router/index.js

   Responsabilidades:
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
    } catch {}
  }

  function safeEmit(eventName, payload = {}) {
    try {
      AppCore?.events?.emit?.(
        eventName,
        payload
      );
    } catch {}
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

  function getRequestedPathData(
    pathname = "/"
  ) {
    const requestedPath =
      resolveSpaHref(
        AppCore,
        pathname
      );

    const canonicalPath =
      getCanonicalPath(
        requestedPath
      );

    const requestedUsername =
      extractUsernameFromPath(
        AppCore,
        requestedPath
      );

    const resolvedUsername =
      requestedUsername ||
      getCurrentResolvedUsername(
        AppCore
      ) ||
      null;

    return {
      requestedPath,
      canonicalPath,
      requestedUsername,
      resolvedUsername,
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

    return (
      buildPublicPath(
        AppCore,
        getRoute,
        routeNames.HOME,
        {
          username:
            getCurrentResolvedUsername(
              AppCore
            ) ||
            getCurrentUsername(
              AppCore
            ),
        }
      ) || routeNames.HOME
    );
  }

  function getCurrentComparablePaths() {
    const currentCanonicalPath =
      getCanonicalPath(
        AppCore.state.route ||
          "/"
      );

    const currentPublicPath =
      getCurrentPublicPath(
        AppCore
      );

    const normalizedCurrentPath =
      resolveSpaHref(
        AppCore,
        currentPublicPath
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
      typeof activeViewInstance
        .destroy !==
        "function"
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
      performance.now();

    const {
      requestedPath,
      canonicalPath,
      requestedUsername,
      resolvedUsername,
    } = getRequestedPathData(
      pathname
    );

    const route =
      getRoute(
        canonicalPath
      );

    emitBeforeRender(
      AppCore,
      {
        path: requestedPath,
        canonicalPath,
        publicPath:
          requestedPath,
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
      return;
    }

    if (!route) {
      destroyActiveView();

      renderRouteNotFound({
        AppCore,
        getRoute,
        updateHistory,
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
          requestedPath,
          canonicalPath,
          requestedUsername,
          options,
        });

      if (handled) {
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
          getCurrentUsername(
            AppCore
          ),
      },
    });

    try {
      destroyActiveView();

      const maybeView =
        await Promise.resolve(
          renderRouteSuccess({
            AppCore,
            route,
            requestedPath,
            canonicalPath,
            requestedUsername,
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

        return;
      }

      activeViewInstance =
        maybeView || null;

      safeEmit(
        "router:rendered",
        {
          path: requestedPath,
          canonicalPath,
          durationMs:
            Math.round(
              performance.now() -
                startedAt
            ),
        }
      );
    } catch (error) {
      destroyActiveView();

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

      safeError(
        "[Router] render error:",
        error
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
    } = getRequestedPathData(
      pathname
    );

    const navKey =
      `${requestedPath}|${canonicalPath}`;

    if (
      isNavigationBurst(
        navKey
      ) &&
      !options.force
    ) {
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
      requestedPath ===
        normalizedCurrentPath &&
      !options.force
    ) {
      return render(
        requestedPath,
        {
          ...options,
          skipHistory: true,
        }
      );
    }

    return render(
      requestedPath,
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
            getCurrentResolvedUsername(
              AppCore
            ) ||
            getCurrentUsername(
              AppCore
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
    render(
      getCurrentPublicPath(
        AppCore
      ),
      {
        skipHistory: true,
        replaceState: true,
        force: true,
      }
    );
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

    AppCore.utils.on(
      document,
      "click",
      handleDocumentClick
    );

    AppCore.utils.on(
      window,
      "popstate",
      handlePopState
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

  /* =========================================================
     API
  ========================================================= */

  const api = {
    routes:
      immutableRoutes,

    bind,

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
        ),

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
