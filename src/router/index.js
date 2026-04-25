/* =========================================================
   Onion SPA - Router
   Archivo: src/router/index.js

   RESPONSABILIDADES:
   - coordinar navegación SPA
   - resolver rutas canónicas y públicas
   - serializar renders para evitar race conditions
   - aplicar guards de acceso
   - conectar history, shell y render del router
   - exponer API pública estable

   NIVEL DIOS / HARDENING EXTREMO:
   - navegación serializada real
   - cancelación lógica de renders obsoletos
   - anti burst navigation
   - popstate robusto
   - destroy seguro de vistas
   - preserva username contextualizado
   - no degrada /@slug
   - preserva query/hash públicos
   - no destruye /activate-account?token=...
   - eventos ricos
   - cero throws accidentales
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";

import {
  getRouteNames,
  normalizeCanonicalPath,
  normalizePath,
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

import {
  shouldAllowRoute,
} from "./guards.js";

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

  /* =====================================================
     INTERNAL STATE
  ===================================================== */

  const immutableRoutes =
    getImmutableRoutes();

  const PUBLIC_AUTH_PATHS =
    new Set([
      "/login",
      "/activate-account",
      "/reset-password",
      "/forgot-password",
      "/recover-password",
      "/password-reset",
    ]);

  let bound = false;

  let renderChain =
    Promise.resolve();

  let renderToken = 0;

  let activeView = null;

  const disposers = [];

  let lastNavAt = 0;
  let lastNavKey = "";

  const NAV_BURST_MS = 140;

  /* =====================================================
     SAFE HELPERS
  ===================================================== */

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
      try {
        console.error(...args);
      } catch {}
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

  function isFn(value) {
    return (
      typeof value === "function"
    );
  }

  function nowMs() {
    try {
      if (
        typeof performance !== "undefined" &&
        isFn(performance.now)
      ) {
        return performance.now();
      }
    } catch {}

    return Date.now();
  }

  function safeText(
    value,
    fallback = ""
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    const text =
      String(value).trim();

    return text || fallback;
  }

  /**
   * Normaliza paths internos sin destruir query/hash.
   *
   * Ejemplo:
   *   /activate-account?token=abc
   *   -> /activate-account?token=abc
   */
  function safePath(
    path = "/"
  ) {
    const raw =
      safeText(path, "/");

    if (
      isUnsafeHref(raw) ||
      isExternalHref(raw)
    ) {
      return "/";
    }

    if (
      isHashOnlyHref(raw)
    ) {
      return raw;
    }

    const withSlash =
      raw.startsWith("/")
        ? raw
        : `/${raw}`;

    return normalizePath(
      AppCore,
      withSlash
    );
  }

  /* =====================================================
     ROUTE HELPERS
  ===================================================== */

  function getCanonical(
    path = "/"
  ) {
    return safePath(
      normalizeCanonicalPath(
        AppCore,
        path
      )
    );
  }

  function getRoute(
    path = "/"
  ) {
    const canonical =
      getCanonical(path);

    return (
      immutableRoutes.find(
        (route) =>
          route.path === canonical
      ) || null
    );
  }

  function routeExists(
    path = "/"
  ) {
    return Boolean(
      getRoute(path)
    );
  }

  function canUsePublicSlugForRoute(
    route
  ) {
    if (!route) {
      return false;
    }

    const names =
      getRouteNames(
        AppCore
      );

    const routePath =
      getCanonical(
        route.path || "/"
      );

    if (
      routePath === names.LOGIN
    ) {
      return false;
    }

    if (
      PUBLIC_AUTH_PATHS.has(
        routePath
      )
    ) {
      return false;
    }

    if (route.hideShell) {
      return false;
    }

    return true;
  }

  function resolveUsername(
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

  /**
   * Resuelve datos de navegación.
   *
   * IMPORTANTE:
   * - requestedPath conserva query/hash
   * - canonicalPath NO tiene query/hash
   * - publicPath conserva query/hash
   */
  function getRequestedData(
    path = "/"
  ) {
    const resolvedHref =
      resolveSpaHref(
        AppCore,
        path
      ) || path;

    const requestedPath =
      safePath(
        resolvedHref
      );

    const canonicalPath =
      getCanonical(
        requestedPath
      );

    const route =
      getRoute(
        canonicalPath
      );

    const username =
      resolveUsername(
        requestedPath
      );

    let publicPath =
      requestedPath;

    if (
      canUsePublicSlugForRoute(
        route
      )
    ) {
      publicPath =
        safePath(
          buildPublicPath(
            AppCore,
            getRoute,
            requestedPath,
            {
              username,
              resolvedUsername:
                username,
              fromPath:
                requestedPath,
            }
          ) ||
            requestedPath
        );
    }

    return {
      requestedPath,
      canonicalPath,
      route,
      username,
      publicPath,
    };
  }

  function getCurrentComparable() {
    const canonical =
      safePath(
        getCurrentCanonicalPath(
          AppCore
        ) ||
          AppCore?.state?.route ||
          "/"
      );

    const publicPath =
      safePath(
        getCurrentPublicPath(
          AppCore
        ) ||
          AppCore?.state
            ?.publicPath ||
          canonical
      );

    return {
      canonical,
      publicPath,
    };
  }

  function getDefaultHome() {
    const names =
      getRouteNames(
        AppCore
      );

    const username =
      resolveUsername("/");

    return (
      buildPublicPath(
        AppCore,
        getRoute,
        names.HOME,
        {
          username,
          resolvedUsername:
            username,
        }
      ) ||
      names.HOME
    );
  }

  /* =====================================================
     VIEW LIFECYCLE
  ===================================================== */

  function destroyActiveView() {
    if (!activeView) {
      return;
    }

    try {
      if (
        isFn(
          activeView.destroy
        )
      ) {
        activeView.destroy();
      }
    } catch (error) {
      safeWarn(
        "[Router] destroy error",
        error
      );
    }

    activeView = null;
  }

  /* =====================================================
     STATE SYNC
  ===================================================== */

  function syncState({
    canonicalPath = "/",
    publicPath = "/",
    username = null,
  } = {}) {
    const safeCanonical =
      getCanonical(
        canonicalPath
      );

    const safePublic =
      safePath(
        publicPath ||
          safeCanonical
      );

    try {
      AppCore?.setRoute?.(
        safeCanonical
      );
    } catch {}

    try {
      AppCore?.setPublicPath?.(
        safePublic
      );
    } catch {}

    try {
      AppCore?.setState?.({
        route:
          safeCanonical,
        publicPath:
          safePublic,
        currentResolvedUsername:
          username ||
          null,
      });
    } catch {}

    return {
      canonicalPath:
        safeCanonical,
      publicPath:
        safePublic,
      username:
        username ||
        null,
    };
  }

  /* =====================================================
     NAV BURST
  ===================================================== */

  function rememberNav(
    key = ""
  ) {
    lastNavKey =
      String(key);
    lastNavAt =
      Date.now();
  }

  function isBurst(
    key = ""
  ) {
    return (
      key &&
      key === lastNavKey &&
      Date.now() - lastNavAt <
        NAV_BURST_MS
    );
  }

  /* =====================================================
     ACCESS CONTROL
  ===================================================== */

  async function handleDenied({
    access,
    route,
    canonicalPath,
    publicPath,
    username,
  }) {
    if (
      access.reason ===
      "not-authenticated"
    ) {
      destroyActiveView();

      await renderLoginRedirect({
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
          (p) =>
            setActiveMenu(
              AppCore,
              p
            ),
        setShellMode:
          (r) =>
            setShellMode(
              AppCore,
              r
            ),
        setDocumentTitle:
          (t) =>
            setDocumentTitle(
              AppCore,
              t
            ),
      });

      syncState({
        canonicalPath:
          "/login",
        publicPath:
          "/login",
        username:
          null,
      });

      return true;
    }

    if (
      access.reason ===
      "already-authenticated"
    ) {
      await navigate(
        access.redirectTo ||
          getDefaultHome(),
        {
          replaceState: true,
          force: true,
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
        requestedPath:
          publicPath,
        canonicalPath,
        requestedUsername:
          username,
        setShellMode:
          (r) =>
            setShellMode(
              AppCore,
              r
            ),
        setDocumentTitle:
          (t) =>
            setDocumentTitle(
              AppCore,
              t
            ),
      });

      syncState({
        canonicalPath,
        publicPath,
        username,
      });

      return true;
    }

    return false;
  }

  /* =====================================================
     CORE RENDER
  ===================================================== */

  async function executeRender(
    path = "/",
    options = {}
  ) {
    const token =
      ++renderToken;

    const startedAt =
      nowMs();

    const {
      requestedPath,
      canonicalPath,
      publicPath,
      route,
      username,
    } = getRequestedData(
      path
    );

    emitBeforeRender(
      AppCore,
      {
        path:
          publicPath,
        requestedPath,
        canonicalPath,
        publicPath,
        username,
        route,
      }
    );

    clearDynamicContainers(
      AppCore
    );

    setActiveMenu(
      AppCore,
      canonicalPath
    );

    if (
      token !== renderToken
    ) {
      return;
    }

    /* 404 */

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
          username,
        setShellMode:
          (r) =>
            setShellMode(
              AppCore,
              r
            ),
        setDocumentTitle:
          (t) =>
            setDocumentTitle(
              AppCore,
              t
            ),
      });

      syncState({
        canonicalPath,
        publicPath,
        username,
      });

      safeEmit(
        "router:rendered",
        {
          found: false,
          forbidden: false,
          path:
            publicPath,
          requestedPath,
          canonicalPath,
          publicPath,
          username,
        }
      );

      return;
    }

    /* GUARDS */

    const access =
      shouldAllowRoute({
        AppCore,
        Auth,
        route,
        requestedCanonicalPath:
          canonicalPath,
        requestedPublicPath:
          publicPath,
        getRoute,
      });

    if (
      !access.allowed
    ) {
      const handled =
        await handleDenied({
          access,
          route,
          canonicalPath,
          publicPath,
          username,
        });

      if (handled) {
        return;
      }
    }

    /* HISTORY */

    updateHistory({
      AppCore,
      getRoute,
      pathname:
        publicPath,
      options: {
        ...options,
        username,
        resolvedUsername:
          username,
        canonicalPath,
      },
    });

    /* SUCCESS */

    try {
      destroyActiveView();

      const view =
        await Promise.resolve(
          renderRouteSuccess({
            AppCore,
            route,
            requestedPath:
              publicPath,
            canonicalPath,
            requestedUsername:
              username,
            getRoute,
            setShellMode:
              (r) =>
                setShellMode(
                  AppCore,
                  r
                ),
            setDocumentTitle:
              (t) =>
                setDocumentTitle(
                  AppCore,
                  t
                ),
          })
        );

      if (
        token !== renderToken
      ) {
        try {
          view?.destroy?.();
        } catch {}
        return;
      }

      activeView =
        view || null;

      const synced =
        syncState({
          canonicalPath,
          publicPath,
          username,
        });

      safeEmit(
        "router:rendered",
        {
          found: true,
          forbidden: false,
          path:
            synced.publicPath,
          requestedPath,
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
        "[Router] render ok",
        synced
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
          username,
        setShellMode:
          (r) =>
            setShellMode(
              AppCore,
              r
            ),
        setDocumentTitle:
          (t) =>
            setDocumentTitle(
              AppCore,
              t
            ),
      });

      syncState({
        canonicalPath,
        publicPath,
        username,
      });

      safeError(
        "[Router] render error",
        error
      );
    }
  }

  function render(
    path = "/",
    options = {}
  ) {
    renderChain =
      renderChain
        .catch(() => {})
        .then(() =>
          executeRender(
            path,
            options
          )
        );

    return renderChain;
  }

  /* =====================================================
     NAVIGATION
  ===================================================== */

  function navigate(
    path = "/",
    options = {}
  ) {
    const data =
      getRequestedData(
        path
      );

    const key =
      `${data.publicPath}|${data.canonicalPath}`;

    if (
      isBurst(key) &&
      !options.force
    ) {
      return renderChain;
    }

    rememberNav(key);

    const current =
      getCurrentComparable();

    if (
      current.canonical ===
        data.canonicalPath &&
      current.publicPath ===
        data.publicPath &&
      !options.force
    ) {
      return render(
        data.publicPath,
        {
          ...options,
          skipHistory: true,
        }
      );
    }

    return render(
      data.publicPath,
      options
    );
  }

  function replace(
    path = "/",
    options = {}
  ) {
    return navigate(
      path,
      {
        ...options,
        replaceState: true,
      }
    );
  }

  function goAfterLogin(
    fallback = "/"
  ) {
    let redirect =
      null;

    try {
      redirect =
        new URL(
          window.location.href
        ).searchParams.get(
          "redirect"
        );
    } catch {}

    return navigate(
      redirect ||
        fallback ||
        getDefaultHome(),
      {
        replaceState: true,
        force: true,
      }
    );
  }

  /* =====================================================
     DOM EVENTS
  ===================================================== */

  function onClick(
    event
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0
    ) {
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

    const target =
      (
        link.getAttribute(
          "target"
        ) || ""
      ).toLowerCase();

    if (
      target === "_blank"
    ) {
      return;
    }

    if (
      isHashOnlyHref(
        href
      )
    ) {
      return;
    }

    if (
      isUnsafeHref(
        href
      )
    ) {
      event.preventDefault();
      return;
    }

    if (
      isExternalHref(
        href
      )
    ) {
      return;
    }

    event.preventDefault();

    navigate(href);
  }

  function onPopstate() {
    const path =
      getCurrentPublicPath(
        AppCore
      ) ||
      getCurrentPath(
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

  /* =====================================================
     BIND
  ===================================================== */

  function bind() {
    if (bound) {
      return api;
    }

    validateRoutesTable(
      AppCore,
      immutableRoutes,
      normalizeCanonicalPath
    );

    bound = true;

    const offClick =
      AppCore.utils.on(
        document,
        "click",
        onClick
      );

    const offPop =
      AppCore.utils.on(
        window,
        "popstate",
        onPopstate
      );

    disposers.push(
      offClick,
      offPop
    );

    ensureInitialHistoryState({
      AppCore,
    });

    safeEmit(
      "router:bound",
      {
        routes:
          immutableRoutes.map(
            (r) => r.path
          ),
      }
    );

    safeLog(
      "[Router] ready"
    );

    return api;
  }

  function unbind() {
    if (!bound) {
      return api;
    }

    while (
      disposers.length
    ) {
      const off =
        disposers.pop();

      try {
        off?.();
      } catch {}
    }

    destroyActiveView();

    bound = false;

    safeEmit(
      "router:unbound",
      {}
    );

    return api;
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    routes:
      immutableRoutes,

    bind,
    unbind,

    getRoute,
    routeExists,

    getCurrentPath:
      () =>
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
        resolveUsername(
          getCurrentPublicPath(
            AppCore
          ) || "/"
        ),

    navigate,
    replace,
    render,
    back,
    goAfterLogin,

    buildPublicPath:
      (
        canonicalPath = "/",
        options = {}
      ) =>
        buildPublicPath(
          AppCore,
          getRoute,
          canonicalPath,
          options
        ),

    stripUsernamePrefix:
      (
        pathname = "/"
      ) =>
        stripUsernamePrefix(
          AppCore,
          pathname
        ),

    extractUsernameFromPath:
      (
        pathname = "/"
      ) =>
        extractUsernameFromPath(
          AppCore,
          pathname
        ),

    resolveSpaHref:
      (
        href = "/"
      ) =>
        resolveSpaHref(
          AppCore,
          href
        ),

    isSlugCandidatePath:
      (
        pathname = "/"
      ) =>
        isSlugCandidatePath(
          AppCore,
          pathname
        ),

    isSameCanonicalPath:
      (
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
