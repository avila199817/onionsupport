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
   - anti doble render post-login
   - popstate robusto
   - destroy seguro de vistas
   - preserva username contextualizado
   - no degrada /@slug
   - preserva query/hash públicos
   - no destruye /activate-account?token=...
   - no destruye /activate-account/<token>
   - no destruye /reset-password/confirm/<token>
   - respeta skipHistory / preservePath / protectedInitialUrl
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

  const PUBLIC_AUTH_PATHS = new Set([
    "/login",
    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
  ]);

  const PUBLIC_AUTH_PREFIXES = [
    "/activate-account/",
    "/reset-password/confirm/",
  ];

  let bound = false;

  let renderChain =
    Promise.resolve();

  let renderToken = 0;

  let activeView = null;

  const disposers = [];

  let lastNavAt = 0;
  let lastNavKey = "";

  const NAV_BURST_MS = 160;

  /* =====================================================
     SAFE HELPERS
  ===================================================== */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(...args);
    } catch {}

    try {
      console.warn(...args);
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

  function safeEmit(eventName, payload = {}) {
    try {
      AppCore?.events?.emit?.(
        eventName,
        payload
      );
    } catch {}
  }

  function isFn(value) {
    return typeof value === "function";
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

  function safeText(value, fallback = "") {
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

  function safeOn(
    target,
    eventName,
    handler,
    options
  ) {
    if (
      !target ||
      !eventName ||
      !isFn(handler)
    ) {
      return () => {};
    }

    try {
      if (
        isFn(AppCore?.utils?.on)
      ) {
        const off =
          AppCore.utils.on(
            target,
            eventName,
            handler,
            options
          );

        if (isFn(off)) {
          return off;
        }
      }
    } catch {}

    try {
      target.addEventListener(
        eventName,
        handler,
        options
      );

      return () => {
        try {
          target.removeEventListener(
            eventName,
            handler,
            options
          );
        } catch {}
      };
    } catch {
      return () => {};
    }
  }

  function stripSearchAndHash(path = "/") {
    const raw =
      safeText(path, "/") || "/";

    let value =
      raw.split("?")[0].split("#")[0] || "/";

    value = value
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    if (value.length > 1) {
      value =
        value.replace(/\/+$/g, "") || "/";
    }

    return value;
  }

  function isPublicAuthPath(path = "/") {
    const clean =
      stripSearchAndHash(path);

    if (PUBLIC_AUTH_PATHS.has(clean)) {
      return true;
    }

    return PUBLIC_AUTH_PREFIXES.some((prefix) => {
      return clean.startsWith(prefix);
    });
  }

  function isAuthenticated() {
    try {
      if (
        typeof Auth?.isAuthenticated === "function"
      ) {
        return Boolean(Auth.isAuthenticated());
      }
    } catch {}

    return Boolean(
      AppCore?.state?.authenticated ||
        AppCore?.state?.isAuthenticated ||
        AppCore?.state?.token ||
        AppCore?.state?.accessToken ||
        AppCore?.state?.user
    );
  }

  function getBrowserPath() {
    if (!isBrowser()) {
      return "/";
    }

    try {
      const pathname =
        window.location.pathname || "/";

      const search =
        window.location.search || "";

      const hash =
        window.location.hash || "";

      return `${pathname}${search}${hash}`;
    } catch {
      return "/";
    }
  }

  /**
   * Normaliza paths internos sin destruir query/hash.
   *
   * Ejemplo:
   *   /activate-account?token=abc
   *   -> /activate-account?token=abc
   */
  function safePath(path = "/") {
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

    const normalized =
      raw.startsWith("/")
        ? raw
        : `/${raw}`;

    return normalizePath(
      AppCore,
      normalized
    );
  }

  function shouldSkipHistory(options = {}) {
    return (
      options.skipHistory === true ||
      options.protectedInitialUrl === true
    );
  }

  function getHistoryOptions(
    options = {},
    {
      username = null,
      canonicalPath = "/",
      publicPath = "/",
      requestedPath = "/",
    } = {}
  ) {
    return {
      ...options,

      username,
      resolvedUsername:
        username,

      canonicalPath,
      publicPath,
      requestedPath,
      fromPath:
        requestedPath || publicPath,

      preservePath:
        options.preservePath === true ||
        options.protectedInitialUrl === true,

      skipHistory:
        options.skipHistory === true ||
        options.protectedInitialUrl === true,

      protectedInitialUrl:
        options.protectedInitialUrl === true,
    };
  }

  function setTransientFlag(name, value) {
    try {
      if (
        AppCore?.state &&
        typeof AppCore.state === "object"
      ) {
        AppCore.state[name] = Boolean(value);
      }
    } catch {}

    try {
      AppCore?.setState?.({
        [name]: Boolean(value),
      });
    } catch {}
  }

  function markLoginNavigation(value = true) {
    setTransientFlag(
      "loginNavigationHandled",
      value
    );
  }

  function isSameRenderedPath(data = {}) {
    const current =
      getCurrentComparable();

    return (
      current.canonical === data.canonicalPath &&
      current.publicPath === data.publicPath
    );
  }

  function resolveNoopNavigation(reason, data = {}) {
    safeLog(
      "[Router] navigation skipped",
      {
        reason,
        canonicalPath:
          data.canonicalPath,
        publicPath:
          data.publicPath,
      }
    );

    return Promise.resolve({
      ok: true,
      skipped: true,
      reason,
      canonicalPath:
        data.canonicalPath || null,
      publicPath:
        data.publicPath || null,
    });
  }

  /* =====================================================
     ROUTE HELPERS
  ===================================================== */

  function getCanonical(path = "/") {
    return safePath(
      normalizeCanonicalPath(
        AppCore,
        path
      )
    );
  }

  function getRoute(path = "/") {
    const canonical =
      getCanonical(path);

    return (
      immutableRoutes.find(
        (route) =>
          route.path === canonical
      ) || null
    );
  }

  function routeExists(path = "/") {
    return Boolean(
      getRoute(path)
    );
  }

  function canUsePublicSlugForRoute(route) {
    if (!route) {
      return false;
    }

    const names =
      getRouteNames(AppCore);

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
      isPublicAuthPath(routePath)
    ) {
      return false;
    }

    if (route.hideShell) {
      return false;
    }

    return true;
  }

  function resolveUsername(requestedPath = "/") {
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
      AppCore?.state?.user?.username ||
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
  function getRequestedData(path = "/") {
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
              publicPath:
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
          AppCore?.state?.publicPath ||
          canonical
      );

    return {
      canonical,
      publicPath,
    };
  }

  function getDefaultHome() {
    const names =
      getRouteNames(AppCore);

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

  function resolveSafeRedirect(value = "") {
    const raw =
      safeText(value, "");

    if (!raw) {
      return "";
    }

    if (
      isUnsafeHref(raw) ||
      isExternalHref(raw)
    ) {
      return "";
    }

    const resolved =
      safePath(
        resolveSpaHref(
          AppCore,
          raw
        ) || raw
      );

    const canonical =
      getCanonical(resolved);

    if (
      canonical === "/login" ||
      isPublicAuthPath(canonical)
    ) {
      return "";
    }

    return resolved;
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
          username || null,
      });
    } catch {}

    return {
      canonicalPath:
        safeCanonical,
      publicPath:
        safePublic,
      username:
        username || null,
    };
  }

  /* =====================================================
     NAV BURST
  ===================================================== */

  function rememberNav(key = "") {
    lastNavKey =
      String(key);

    lastNavAt =
      Date.now();
  }

  function isBurst(key = "") {
    return (
      key &&
      key === lastNavKey &&
      Date.now() - lastNavAt < NAV_BURST_MS
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

      const loginPublicPath =
        safePath(
          access.redirectTo ||
            "/login"
        );

      await renderLoginRedirect({
        AppCore,
        getRoute,
        updateHistory,
        canonicalPath,
        publicPath,
        redirectTo:
          loginPublicPath,
        clearDynamicContainers:
          () =>
            clearDynamicContainers(
              AppCore
            ),
        setActiveMenu:
          (path) =>
            setActiveMenu(
              AppCore,
              path
            ),
        setShellMode:
          (nextRoute) =>
            setShellMode(
              AppCore,
              nextRoute
            ),
        setDocumentTitle:
          (title) =>
            setDocumentTitle(
              AppCore,
              title
            ),
      });

      syncState({
        canonicalPath:
          "/login",
        publicPath:
          loginPublicPath,
        username:
          null,
      });

      return true;
    }

    if (
      access.reason ===
      "already-authenticated"
    ) {
      const target =
        safePath(
          access.redirectTo ||
            getDefaultHome()
        );

      if (
        isSameRenderedPath(
          getRequestedData(target)
        )
      ) {
        return true;
      }

      await navigate(
        target,
        {
          replaceState: true,
          force: false,
          source:
            "guard:already-authenticated",
        }
      );

      return true;
    }

    if (
      access.reason ===
      "insufficient-role"
    ) {
      destroyActiveView();

      clearDynamicContainers(
        AppCore
      );

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
          (nextRoute) =>
            setShellMode(
              AppCore,
              nextRoute
            ),
        setDocumentTitle:
          (title) =>
            setDocumentTitle(
              AppCore,
              title
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
    } = getRequestedData(path);

    const historyOptions =
      getHistoryOptions(
        options,
        {
          username,
          canonicalPath,
          publicPath,
          requestedPath,
        }
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
        options:
          historyOptions,
      }
    );

    if (
      token !== renderToken
    ) {
      return;
    }

    /* 404 */

    if (!route) {
      destroyActiveView();

      clearDynamicContainers(
        AppCore
      );

      setActiveMenu(
        AppCore,
        canonicalPath
      );

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
          (nextRoute) =>
            setShellMode(
              AppCore,
              nextRoute
            ),
        setDocumentTitle:
          (title) =>
            setDocumentTitle(
              AppCore,
              title
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

    if (
      token !== renderToken
    ) {
      return;
    }

    /* UI PREP */

    clearDynamicContainers(
      AppCore
    );

    setActiveMenu(
      AppCore,
      canonicalPath
    );

    /* HISTORY */

    if (
      !shouldSkipHistory(historyOptions)
    ) {
      updateHistory({
        AppCore,
        getRoute,
        pathname:
          publicPath,
        options:
          historyOptions,
      });
    }

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
              (nextRoute) =>
                setShellMode(
                  AppCore,
                  nextRoute
                ),
            setDocumentTitle:
              (title) =>
                setDocumentTitle(
                  AppCore,
                  title
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

      if (
        canonicalPath !== "/login"
      ) {
        markLoginNavigation(false);
      }

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
              nowMs() - startedAt
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
          (nextRoute) =>
            setShellMode(
              AppCore,
              nextRoute
            ),
        setDocumentTitle:
          (title) =>
            setDocumentTitle(
              AppCore,
              title
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
      getRequestedData(path);

    const key =
      `${data.publicPath}|${data.canonicalPath}`;

    const current =
      getCurrentComparable();

    const sameAsCurrent =
      current.canonical === data.canonicalPath &&
      current.publicPath === data.publicPath;

    /*
      Anti doble render:
      - Si ya estamos en la misma ruta y no se pide forceRender,
        no volvemos a pintar.
      - forceRender queda como escape hatch real.
    */
    if (
      activeView &&
      sameAsCurrent &&
      options.forceRender !== true
    ) {
      if (
        options.force === true &&
        isBurst(key)
      ) {
        return resolveNoopNavigation(
          "duplicate-force-burst",
          data
        );
      }

      if (
        options.force !== true
      ) {
        return resolveNoopNavigation(
          "same-route",
          data
        );
      }
    }

    /*
      Anti burst incluso con force=true salvo forceRender explícito.
      Esto evita:
        Auth.login navega
        LoginView navega otra vez
        restore/session intenta navegar otra vez
    */
    if (
      activeView &&
      isBurst(key) &&
      options.forceRender !== true
    ) {
      return resolveNoopNavigation(
        "burst",
        data
      );
    }

    rememberNav(key);

    const fromLogin =
      current.canonical === "/login" &&
      data.canonicalPath !== "/login" &&
      isAuthenticated();

    if (
      fromLogin ||
      options.source === "login" ||
      options.fromLogin === true
    ) {
      markLoginNavigation(true);
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

    const resolvedRedirect =
      resolveSafeRedirect(
        redirect || ""
      );

    const target =
      resolvedRedirect ||
      fallback ||
      getDefaultHome();

    return navigate(
      target,
      {
        replaceState: true,
        force: false,
        source: "login",
        fromLogin: true,
      }
    );
  }

  /* =====================================================
     DOM EVENTS
  ===================================================== */

  function onClick(event) {
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
      isHashOnlyHref(href)
    ) {
      return;
    }

    if (
      isUnsafeHref(href)
    ) {
      event.preventDefault();
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

  function onPopstate() {
    const path =
      getBrowserPath();

    render(
      path,
      {
        skipHistory: true,
        replaceState: true,
        force: true,
        source: "popstate",
      }
    );
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

    if (isBrowser()) {
      const offClick =
        safeOn(
          document,
          "click",
          onClick
        );

      const offPop =
        safeOn(
          window,
          "popstate",
          onPopstate
        );

      disposers.push(
        offClick,
        offPop
      );
    }

    ensureInitialHistoryState({
      AppCore,
    });

    safeEmit(
      "router:bound",
      {
        routes:
          immutableRoutes.map(
            (route) => route.path
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
     CONFIG
  ===================================================== */

  function configure() {
    return api;
  }

  /* =====================================================
     DEBUG
  ===================================================== */

  function getSnapshot() {
    return {
      bound,
      renderToken,
      hasActiveView:
        Boolean(activeView),
      current:
        getCurrentComparable(),
      route:
        AppCore?.state?.route || "/",
      publicPath:
        AppCore?.state?.publicPath || "/",
      lastNavKey,
      lastNavAt,
      loginNavigationHandled:
        Boolean(
          AppCore?.state?.loginNavigationHandled
        ),
    };
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    routes:
      immutableRoutes,

    configure,

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

    getCurrentPublicPath:
      () =>
        getCurrentPublicPath(
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

    getSnapshot,
  };

  return api;
})();

export default Router;
