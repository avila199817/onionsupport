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
   - reparar shell / UI tras login, restore y navegación privada
   - evitar panel debajo del sidebar tras login

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
   - reparación DOM post-render
   - cero throws accidentales

   FIX CRÍTICO POST-LOGIN:
   - al salir de /login limpia auth-screen / login-no-scroll
   - fuerza shell visible en rutas privadas
   - desbloquea #app-shell / #main-content / #view-container
   - oculta loader si la vista ya pintó
   - emite app:ui:repair-request para re-sincronizar avatar/topbar/sidebar

   FIX 10/10:
   - route matching tolerante para rutas técnicas con token en path
   - canonical interno estable aunque publicPath conserve token/query/hash
   - Auth fallback no marca autenticado sólo por token o sólo por user
   - registro seguro en AppCore.modules.register sin mutar módulos congelados
   - listeners de reparación post-auth / post-restore / post-logout
   - configure() compatible con bootstrap legacy
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

/* =========================================================
   SINGLETON
========================================================= */

export const Router = (() => {
  "use strict";

  /* =====================================================
     INTERNAL STATE
  ===================================================== */

  const immutableRoutes =
    getImmutableRoutes();

  const PUBLIC_AUTH_PATHS = new Set([
    "/login",
    "/signin",
    "/sign-in",
    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
    "/2fa",
    "/otp",
  ]);

  const PUBLIC_AUTH_PREFIXES = [
    "/activate-account/",
    "/reset-password/confirm/",
  ];

  const TECHNICAL_ROUTE_BASES = [
    "/activate-account",
    "/reset-password/confirm",
  ];

  const NAV_BURST_MS = 160;
  const POST_RENDER_REPAIR_DELAY = 0;

  let bound = false;
  let configured = false;

  let renderChain =
    Promise.resolve();

  let renderToken = 0;

  let activeView = null;

  const disposers = [];

  let lastNavAt = 0;
  let lastNavKey = "";

  /* =====================================================
     SAFE HELPERS
  ===================================================== */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
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

  function safeObject(value) {
    return value &&
      typeof value === "object" &&
      !Array.isArray(value)
      ? value
      : {};
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(
        "[Router]",
        ...args
      );
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(
        "[Router]",
        ...args
      );
    } catch {}

    try {
      if (AppCore?.config?.debug) {
        console.warn(
          "[Router]",
          ...args
        );
      }
    } catch {}
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(
        "[Router]",
        ...args
      );
    } catch {
      try {
        console.error(
          "[Router]",
          ...args
        );
      } catch {}
    }
  }

  function safeEmit(eventName, payload = {}) {
    const name =
      safeText(eventName, "");

    if (!name) {
      return false;
    }

    let emitted = false;

    try {
      AppCore?.events?.emit?.(
        name,
        payload
      );

      emitted = true;
    } catch {}

    try {
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(name, {
            detail: payload,
          })
        );

        emitted = true;
      }
    } catch {}

    return emitted;
  }

  function safeOn(
    target,
    eventName,
    handler,
    options = false
  ) {
    if (
      !target ||
      !eventName ||
      !isFn(handler)
    ) {
      return () => {};
    }

    try {
      if (isFn(AppCore?.utils?.on)) {
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

  function safeEventOn(eventName, handler) {
    if (
      !eventName ||
      !isFn(handler)
    ) {
      return () => {};
    }

    try {
      if (isFn(AppCore?.events?.on)) {
        return AppCore.events.on(
          eventName,
          handler
        );
      }
    } catch {}

    if (!isBrowser()) {
      return () => {};
    }

    return safeOn(
      document,
      eventName,
      handler
    );
  }

  function afterPaint(callback) {
    if (!isFn(callback)) {
      return;
    }

    if (!isBrowser()) {
      try {
        callback();
      } catch {}

      return;
    }

    try {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          try {
            callback();
          } catch {}
        });
      });

      return;
    } catch {}

    try {
      window.setTimeout(() => {
        try {
          callback();
        } catch {}
      }, POST_RENDER_REPAIR_DELAY);
    } catch {}
  }

  /* =====================================================
     PATH HELPERS
  ===================================================== */

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

  function getSearchAndHash(path = "/") {
    const raw =
      safeText(path, "");

    if (!raw) {
      return "";
    }

    const queryIndex =
      raw.indexOf("?");

    const hashIndex =
      raw.indexOf("#");

    let index = -1;

    if (
      queryIndex >= 0 &&
      hashIndex >= 0
    ) {
      index = Math.min(
        queryIndex,
        hashIndex
      );
    } else if (queryIndex >= 0) {
      index = queryIndex;
    } else if (hashIndex >= 0) {
      index = hashIndex;
    }

    return index >= 0
      ? raw.slice(index)
      : "";
  }

  function isPublicAuthPath(path = "/") {
    const clean =
      stripSearchAndHash(path);

    if (PUBLIC_AUTH_PATHS.has(clean)) {
      return true;
    }

    return PUBLIC_AUTH_PREFIXES.some(
      (prefix) => clean.startsWith(prefix)
    );
  }

  function getTechnicalRouteBase(path = "/") {
    const clean =
      stripSearchAndHash(path);

    for (const base of TECHNICAL_ROUTE_BASES) {
      if (
        clean === base ||
        clean.startsWith(`${base}/`)
      ) {
        return base;
      }
    }

    return "";
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

      if (
        hash &&
        (
          hash.startsWith("#/") ||
          hash.startsWith("#!")
        )
      ) {
        return hash.startsWith("#!")
          ? hash.replace(/^#!\/?/, "/")
          : hash.replace(/^#\/?/, "/");
      }

      return `${pathname}${search}${hash}`;
    } catch {
      return "/";
    }
  }

  function safePath(path = "/") {
    const raw =
      safeText(path, "/");

    if (
      isUnsafeHref(raw) ||
      isExternalHref(raw)
    ) {
      return "/";
    }

    if (isHashOnlyHref(raw)) {
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

  function getCanonical(path = "/") {
    return normalizeCanonicalPath(
      AppCore,
      path
    );
  }

  function getRouteMatch(path = "/") {
    const rawCanonical =
      getCanonical(path);

    const cleanCanonical =
      stripSearchAndHash(rawCanonical);

    const exact =
      immutableRoutes.find(
        (route) =>
          stripSearchAndHash(route?.path) === cleanCanonical
      );

    if (exact) {
      return {
        route: exact,
        canonicalPath:
          stripSearchAndHash(exact.path),
        rawCanonicalPath:
          cleanCanonical,
        matchedBy:
          "exact",
      };
    }

    const technicalBase =
      getTechnicalRouteBase(cleanCanonical);

    if (technicalBase) {
      const technicalRoute =
        immutableRoutes.find(
          (route) =>
            stripSearchAndHash(route?.path) === technicalBase
        );

      if (technicalRoute) {
        return {
          route: technicalRoute,
          canonicalPath:
            stripSearchAndHash(technicalRoute.path),
          rawCanonicalPath:
            cleanCanonical,
          matchedBy:
            "technical-prefix",
        };
      }
    }

    for (const route of immutableRoutes) {
      try {
        if (
          isFn(route?.match) &&
          route.match(cleanCanonical)
        ) {
          return {
            route,
            canonicalPath:
              stripSearchAndHash(route.path || cleanCanonical),
            rawCanonicalPath:
              cleanCanonical,
            matchedBy:
              "route.match",
          };
        }
      } catch {}

      try {
        if (
          route?.pattern instanceof RegExp &&
          route.pattern.test(cleanCanonical)
        ) {
          return {
            route,
            canonicalPath:
              stripSearchAndHash(route.path || cleanCanonical),
            rawCanonicalPath:
              cleanCanonical,
            matchedBy:
              "route.pattern",
          };
        }
      } catch {}
    }

    return {
      route: null,
      canonicalPath:
        cleanCanonical || "/",
      rawCanonicalPath:
        cleanCanonical || "/",
      matchedBy:
        "none",
    };
  }

  function getRoute(path = "/") {
    return getRouteMatch(path).route;
  }

  function routeExists(path = "/") {
    return Boolean(getRoute(path));
  }

  function getCurrentComparable() {
    const canonical =
      safePath(
        getCurrentCanonicalPath(AppCore) ||
          AppCore?.state?.route ||
          "/"
      );

    const publicPath =
      safePath(
        getCurrentPublicPath(AppCore) ||
          AppCore?.state?.publicPath ||
          canonical
      );

    return {
      canonical:
        stripSearchAndHash(canonical),
      publicPath,
    };
  }

  /* =====================================================
     AUTH HELPERS
  ===================================================== */

  function hasUsableToken(token = "") {
    return Boolean(
      safeText(token, "")
    );
  }

  function hasUsableUser(user = null) {
    if (
      !user ||
      typeof user !== "object" ||
      Array.isArray(user)
    ) {
      return false;
    }

    return Boolean(
      safeText(user.id, "") ||
        safeText(user.userId, "") ||
        safeText(user.user_id, "") ||
        safeText(user._id, "") ||
        safeText(user.uid, "") ||
        safeText(user.username, "") ||
        safeText(user.userName, "") ||
        safeText(user.email, "") ||
        safeText(user.phone, "") ||
        safeText(user.telefono, "")
    );
  }

  function isAuthenticated() {
    try {
      if (isFn(Auth?.isAuthenticated)) {
        return Boolean(Auth.isAuthenticated());
      }
    } catch {}

    const state =
      safeObject(AppCore?.state);

    const token =
      state.token ||
      state.accessToken ||
      state.session?.token ||
      state.session?.accessToken ||
      "";

    const user =
      state.user ||
      state.session?.user ||
      null;

    return Boolean(
      hasUsableToken(token) &&
        hasUsableUser(user)
    );
  }

  /* =====================================================
     HISTORY OPTIONS
  ===================================================== */

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
      rawCanonicalPath = "/",
    } = {}
  ) {
    return {
      ...safeObject(options),

      username,
      resolvedUsername:
        username,

      canonicalPath,
      rawCanonicalPath,
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

  /* =====================================================
     FLAGS
  ===================================================== */

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

  function markInitialRouteRendered(value = true) {
    setTransientFlag(
      "initialRouteRendered",
      value
    );
  }

  function markBootNavigationHandled(value = true) {
    setTransientFlag(
      "bootNavigationHandled",
      value
    );
  }

  function resolveNoopNavigation(reason, data = {}) {
    safeLog(
      "navigation skipped",
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
     DOM / SHELL REPAIR
  ===================================================== */

  function getDomSnapshot() {
    if (!isBrowser()) {
      return {
        html: null,
        body: null,
        shell: null,
        main: null,
        appContent: null,
        view: null,
        sidebar: null,
        topbar: null,
        tablehead: null,
        tableheadContainer: null,
        loader: null,
      };
    }

    const shell =
      document.getElementById("app-shell") ||
      document.querySelector("[data-app-shell='true']") ||
      null;

    const main =
      document.getElementById("main-content") ||
      document.querySelector("main.main-content") ||
      document.querySelector(".main-content") ||
      null;

    const appContent =
      document.getElementById("app-content") ||
      document.querySelector("[data-app-content]") ||
      null;

    const view =
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      document.querySelector("[data-view-root]") ||
      document.querySelector("[data-view-container='true']") ||
      null;

    const sidebar =
      AppCore?.dom?.sidebar ||
      document.querySelector(".sidebar") ||
      document.querySelector("#sidebar") ||
      document.querySelector("[data-sidebar-root]") ||
      document.querySelector("[data-sidebar='true']") ||
      null;

    const topbar =
      AppCore?.dom?.topbar ||
      document.querySelector(".topbar") ||
      document.querySelector("#topbar") ||
      document.querySelector("[data-topbar-root]") ||
      document.querySelector("[data-topbar='true']") ||
      null;

    const tablehead =
      document.getElementById("table-head") ||
      document.querySelector(".table-head") ||
      null;

    const tableheadContainer =
      AppCore?.dom?.tableheadContainer ||
      document.getElementById("tablehead-container") ||
      document.querySelector("[data-tablehead-container]") ||
      null;

    const loader =
      AppCore?.dom?.loader ||
      document.getElementById("app-loader") ||
      document.querySelector("[data-app-loader='true']") ||
      document.querySelector(".app-loader") ||
      null;

    try {
      if (AppCore?.dom) {
        AppCore.dom.appShell = shell;
        AppCore.dom.mainContent = main;
        AppCore.dom.appContent = appContent;
        AppCore.dom.viewContainer = view;
        AppCore.dom.sidebar = sidebar;
        AppCore.dom.topbar = topbar;
        AppCore.dom.tableheadContainer = tableheadContainer;
        AppCore.dom.loader = loader;
      }
    } catch {}

    return {
      html:
        document.documentElement || null,
      body:
        document.body || null,
      shell,
      main,
      appContent,
      view,
      sidebar,
      topbar,
      tablehead,
      tableheadContainer,
      loader,
    };
  }

  function setHidden(el, hidden = false) {
    if (!el) {
      return;
    }

    const next =
      Boolean(hidden);

    try {
      el.hidden = next;
    } catch {}

    try {
      el.setAttribute(
        "aria-hidden",
        next ? "true" : "false"
      );
    } catch {}
  }

  function setBusy(el, busy = false) {
    if (!el) {
      return;
    }

    try {
      el.setAttribute(
        "aria-busy",
        busy ? "true" : "false"
      );
    } catch {}
  }

  function setDataset(el, key, value) {
    if (!el || !key) {
      return;
    }

    try {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        delete el.dataset[key];
        return;
      }

      el.dataset[key] = String(value);
    } catch {}
  }

  function isShellHiddenRoute(route, canonicalPath = "/") {
    const canonical =
      stripSearchAndHash(
        canonicalPath || route?.path || "/"
      );

    if (
      route?.shell === false ||
      route?.hideShell === true ||
      route?.showShell === false ||
      route?.layout === "auth" ||
      route?.layout === "public" ||
      route?.meta?.shell === false ||
      route?.meta?.hideShell === true ||
      route?.meta?.showShell === false ||
      route?.meta?.layout === "auth" ||
      route?.meta?.layout === "public"
    ) {
      return true;
    }

    return isPublicAuthPath(canonical);
  }

  function hideLoader(reason = "router") {
    const {
      html,
      body,
      loader,
    } = getDomSnapshot();

    try {
      html?.classList?.remove?.(
        "app-loading"
      );

      body?.classList?.remove?.(
        "app-loading",
        "loading"
      );
    } catch {}

    if (!loader) {
      return false;
    }

    try {
      loader.classList.remove(
        "is-visible",
        "is-leaving",
        "app-loader--visible"
      );

      loader.classList.add(
        "is-hidden",
        "has-hidden"
      );

      loader.setAttribute(
        "aria-hidden",
        "true"
      );

      loader.setAttribute(
        "aria-busy",
        "false"
      );

      loader.dataset.loaderVisible = "false";
      loader.hidden = true;
    } catch {}

    safeEmit(
      "app:loader:hidden",
      {
        reason,
        source: "router.index",
      }
    );

    return true;
  }

  function repairShellForRoute({
    route = null,
    canonicalPath = "/",
    publicPath = "/",
    phase = "router",
    hideLoading = false,
  } = {}) {
    if (!isBrowser()) {
      return false;
    }

    const shellHidden =
      isShellHiddenRoute(
        route,
        canonicalPath
      );

    const {
      html,
      body,
      shell,
      main,
      appContent,
      view,
      sidebar,
      topbar,
      tablehead,
      tableheadContainer,
    } = getDomSnapshot();

    if (!html || !body) {
      return false;
    }

    try {
      html.classList.remove(
        "app-booting",
        "app-loading"
      );

      body.classList.remove(
        "app-booting",
        "app-loading",
        "loading"
      );

      html.classList.add("app-ready");
      body.classList.add("app-ready");
    } catch {}

    setDataset(
      html,
      "routeMode",
      shellHidden ? "auth" : "app"
    );

    setDataset(
      body,
      "routeMode",
      shellHidden ? "auth" : "app"
    );

    if (shellHidden) {
      try {
        body.classList.add(
          "auth-screen",
          "route-auth",
          "route-shell-hidden"
        );

        body.classList.remove(
          "route-app",
          "route-shell-visible",
          "login-no-scroll"
        );

        html.classList.add(
          "route-auth",
          "route-shell-hidden"
        );

        html.classList.remove(
          "route-app",
          "route-shell-visible"
        );
      } catch {}

      setDataset(body, "shell", "hidden");
      setDataset(html, "shell", "hidden");

      setDataset(shell, "shell", "hidden");
      setDataset(shell, "routeMode", "auth");

      setHidden(shell, false);
      setHidden(main, false);
      setHidden(appContent, false);
      setHidden(view, false);

      setHidden(sidebar, true);
      setHidden(topbar, true);
      setHidden(tablehead, true);

      try {
        AppCore?.setState?.({
          shellVisible: false,
        });
      } catch {
        try {
          if (AppCore?.state) {
            AppCore.state.shellVisible = false;
          }
        } catch {}
      }
    } else {
      try {
        body.classList.remove(
          "auth-screen",
          "login-no-scroll",
          "route-auth",
          "route-shell-hidden"
        );

        body.classList.add(
          "route-app",
          "route-shell-visible"
        );

        html.classList.remove(
          "route-auth",
          "route-shell-hidden"
        );

        html.classList.add(
          "route-app",
          "route-shell-visible"
        );
      } catch {}

      setDataset(body, "shell", "visible");
      setDataset(html, "shell", "visible");

      setDataset(shell, "shell", "visible");
      setDataset(shell, "routeMode", "app");

      setHidden(shell, false);
      setHidden(main, false);
      setHidden(appContent, false);
      setHidden(view, false);
      setHidden(sidebar, false);
      setHidden(topbar, false);

      const hasTableheadContent =
        Boolean(
          tableheadContainer &&
            safeText(
              tableheadContainer.innerHTML,
              ""
            )
        );

      if (tablehead) {
        setHidden(
          tablehead,
          !hasTableheadContent
        );
      }

      try {
        AppCore?.setState?.({
          shellVisible: true,
        });
      } catch {
        try {
          if (AppCore?.state) {
            AppCore.state.shellVisible = true;
          }
        } catch {}
      }
    }

    setBusy(shell, false);
    setBusy(main, false);
    setBusy(appContent, false);
    setBusy(view, false);

    if (hideLoading) {
      hideLoader(`router:${phase}`);
    }

    safeEmit(
      "app:ui:repair-request",
      {
        phase,
        shellHidden,
        canonicalPath,
        publicPath,
        authenticated:
          isAuthenticated(),
        source:
          "router.index",
      }
    );

    safeEmit(
      "router:shell:state",
      {
        phase,
        shellHidden,
        canonicalPath,
        publicPath,
        hasSidebar:
          Boolean(sidebar),
        hasTopbar:
          Boolean(topbar),
        hasShell:
          Boolean(shell),
      }
    );

    return true;
  }

  function schedulePostRenderRepair(payload = {}) {
    afterPaint(() => {
      repairShellForRoute({
        ...payload,
        phase:
          `${payload.phase || "post-render"}:after-paint`,
        hideLoading: true,
      });
    });
  }

  function repairCurrentRoute(phase = "external-repair") {
    const path =
      getBrowserPath();

    const data =
      getRequestedData(path);

    return repairShellForRoute({
      route:
        data.route,
      canonicalPath:
        data.canonicalPath,
      publicPath:
        data.publicPath,
      phase,
      hideLoading: true,
    });
  }

  /* =====================================================
     ROUTE HELPERS
  ===================================================== */

  function canUsePublicSlugForRoute(route) {
    if (!route) {
      return false;
    }

    const names =
      getRouteNames(AppCore);

    const routePath =
      stripSearchAndHash(
        route.path || "/"
      );

    if (
      routePath === names.LOGIN ||
      isPublicAuthPath(routePath)
    ) {
      return false;
    }

    if (
      route.hideShell ||
      route.shell === false ||
      route.showShell === false ||
      route.layout === "auth" ||
      route.layout === "public" ||
      route.meta?.layout === "auth" ||
      route.meta?.layout === "public"
    ) {
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
      getCurrentResolvedUsername(AppCore) ||
      getCurrentUsername(AppCore) ||
      AppCore?.state?.user?.username ||
      AppCore?.state?.user?.slug ||
      null
    );
  }

  function getRequestedData(path = "/") {
    const resolvedHref =
      resolveSpaHref(
        AppCore,
        path
      ) || path;

    const requestedPath =
      safePath(resolvedHref);

    const match =
      getRouteMatch(requestedPath);

    const route =
      match.route;

    const canonicalPath =
      match.canonicalPath;

    const rawCanonicalPath =
      match.rawCanonicalPath;

    const username =
      resolveUsername(requestedPath);

    let publicPath =
      requestedPath;

    if (canUsePublicSlugForRoute(route)) {
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

    /*
      Rutas técnicas:
      canonical se queda en la ruta base,
      publicPath conserva token/query/hash.
    */
    if (
      match.matchedBy === "technical-prefix"
    ) {
      publicPath =
        safePath(requestedPath);
    }

    return {
      requestedPath,
      canonicalPath,
      rawCanonicalPath,
      publicPath,
      route,
      username,
      matchedBy:
        match.matchedBy,
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
      names.HOME ||
      "/"
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
      getRouteMatch(resolved).canonicalPath;

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
      return false;
    }

    try {
      if (isFn(activeView.destroy)) {
        activeView.destroy();
      }
    } catch (error) {
      safeWarn(
        "destroy error",
        error
      );
    }

    activeView = null;

    return true;
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
      stripSearchAndHash(
        canonicalPath || "/"
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
      String(key || "");

    lastNavAt =
      Date.now();
  }

  function isBurst(key = "") {
    return Boolean(
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
    rawCanonicalPath,
    username,
  }) {
    const reason =
      access?.reason || "blocked";

    if (reason === "not-authenticated") {
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
            clearDynamicContainers(AppCore),
        setActiveMenu:
          (path) =>
            setActiveMenu(AppCore, path),
        setShellMode:
          (nextRoute) =>
            setShellMode(AppCore, nextRoute),
        setDocumentTitle:
          (title) =>
            setDocumentTitle(AppCore, title),
      });

      const synced =
        syncState({
          canonicalPath:
            "/login",
          publicPath:
            loginPublicPath,
          username:
            null,
        });

      repairShellForRoute({
        route:
          getRoute("/login"),
        canonicalPath:
          synced.canonicalPath,
        publicPath:
          synced.publicPath,
        phase:
          "guard:not-authenticated",
        hideLoading:
          true,
      });

      safeEmit(
        "router:rendered",
        {
          found: true,
          forbidden: false,
          path:
            synced.publicPath,
          requestedPath:
            loginPublicPath,
          canonicalPath:
            synced.canonicalPath,
          rawCanonicalPath:
            rawCanonicalPath || canonicalPath,
          publicPath:
            synced.publicPath,
          username:
            null,
          redirectedFrom:
            canonicalPath,
        }
      );

      return true;
    }

    if (reason === "already-authenticated") {
      const target =
        safePath(
          access.redirectTo ||
            getDefaultHome()
        );

      const targetData =
        getRequestedData(target);

      const current =
        getCurrentComparable();

      if (
        current.canonical === targetData.canonicalPath &&
        current.publicPath === targetData.publicPath
      ) {
        repairShellForRoute({
          route:
            targetData.route,
          canonicalPath:
            targetData.canonicalPath,
          publicPath:
            targetData.publicPath,
          phase:
            "guard:already-authenticated:same-route",
          hideLoading:
            true,
        });

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

    if (reason === "insufficient-role") {
      destroyActiveView();

      clearDynamicContainers(AppCore);

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
            setShellMode(AppCore, nextRoute),
        setDocumentTitle:
          (title) =>
            setDocumentTitle(AppCore, title),
      });

      const synced =
        syncState({
          canonicalPath,
          publicPath,
          username,
        });

      repairShellForRoute({
        route,
        canonicalPath:
          synced.canonicalPath,
        publicPath:
          synced.publicPath,
        phase:
          "guard:insufficient-role",
        hideLoading:
          true,
      });

      safeEmit(
        "router:rendered",
        {
          found: true,
          forbidden: true,
          path:
            synced.publicPath,
          canonicalPath:
            synced.canonicalPath,
          rawCanonicalPath:
            rawCanonicalPath || canonicalPath,
          publicPath:
            synced.publicPath,
          username:
            synced.username,
          reason,
        }
      );

      return true;
    }

    return false;
  }

  /* =====================================================
     CORE RENDER
  ===================================================== */

  async function executeRender(path = "/", options = {}) {
    const token =
      ++renderToken;

    const startedAt =
      nowMs();

    const {
      requestedPath,
      canonicalPath,
      rawCanonicalPath,
      publicPath,
      route,
      username,
      matchedBy,
    } = getRequestedData(path);

    const historyOptions =
      getHistoryOptions(
        options,
        {
          username,
          canonicalPath,
          rawCanonicalPath,
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
        rawCanonicalPath,
        publicPath,
        username,
        route,
        matchedBy,
        options:
          historyOptions,
      }
    );

    repairShellForRoute({
      route,
      canonicalPath,
      publicPath,
      phase:
        "before-render",
      hideLoading:
        false,
    });

    if (token !== renderToken) {
      return;
    }

    /* =====================
       404
    ===================== */

    if (!route) {
      destroyActiveView();

      clearDynamicContainers(AppCore);

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
            setShellMode(AppCore, nextRoute),
        setDocumentTitle:
          (title) =>
            setDocumentTitle(AppCore, title),
      });

      const synced =
        syncState({
          canonicalPath,
          publicPath,
          username,
        });

      repairShellForRoute({
        route: null,
        canonicalPath:
          synced.canonicalPath,
        publicPath:
          synced.publicPath,
        phase:
          "not-found",
        hideLoading:
          true,
      });

      safeEmit(
        "router:rendered",
        {
          found: false,
          forbidden: false,
          path:
            synced.publicPath,
          requestedPath,
          canonicalPath:
            synced.canonicalPath,
          rawCanonicalPath,
          publicPath:
            synced.publicPath,
          username:
            synced.username,
          matchedBy,
          durationMs:
            Math.round(
              nowMs() - startedAt
            ),
        }
      );

      markInitialRouteRendered(true);

      return;
    }

    /* =====================
       GUARDS
    ===================== */

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

    if (!access.allowed) {
      const handled =
        await handleDenied({
          access,
          route,
          canonicalPath,
          rawCanonicalPath,
          publicPath,
          username,
        });

      if (handled) {
        markInitialRouteRendered(true);
        return;
      }
    }

    if (token !== renderToken) {
      return;
    }

    /* =====================
       UI PREP
    ===================== */

    clearDynamicContainers(AppCore);

    setActiveMenu(
      AppCore,
      canonicalPath
    );

    repairShellForRoute({
      route,
      canonicalPath,
      publicPath,
      phase:
        "after-ui-prep",
      hideLoading:
        false,
    });

    /* =====================
       HISTORY
    ===================== */

    if (!shouldSkipHistory(historyOptions)) {
      updateHistory({
        AppCore,
        getRoute,
        pathname:
          publicPath,
        options:
          historyOptions,
      });
    }

    /* =====================
       SUCCESS
    ===================== */

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
                setShellMode(AppCore, nextRoute),
            setDocumentTitle:
              (title) =>
                setDocumentTitle(AppCore, title),
          })
        );

      if (token !== renderToken) {
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

      if (canonicalPath !== "/login") {
        markLoginNavigation(false);
      }

      markInitialRouteRendered(true);
      markBootNavigationHandled(true);

      repairShellForRoute({
        route,
        canonicalPath:
          synced.canonicalPath,
        publicPath:
          synced.publicPath,
        phase:
          "render-success",
        hideLoading:
          true,
      });

      schedulePostRenderRepair({
        route,
        canonicalPath:
          synced.canonicalPath,
        publicPath:
          synced.publicPath,
        phase:
          "render-success",
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
          rawCanonicalPath,
          publicPath:
            synced.publicPath,
          username:
            synced.username,
          matchedBy,
          durationMs:
            Math.round(
              nowMs() - startedAt
            ),
        }
      );

      safeLog(
        "render ok",
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
            setShellMode(AppCore, nextRoute),
        setDocumentTitle:
          (title) =>
            setDocumentTitle(AppCore, title),
      });

      const synced =
        syncState({
          canonicalPath,
          publicPath,
          username,
        });

      repairShellForRoute({
        route,
        canonicalPath:
          synced.canonicalPath,
        publicPath:
          synced.publicPath,
        phase:
          "runtime-error",
        hideLoading:
          true,
      });

      safeEmit(
        "router:render:error",
        {
          error,
          message:
            error?.message ||
            String(error),
          canonicalPath:
            synced.canonicalPath,
          rawCanonicalPath,
          publicPath:
            synced.publicPath,
        }
      );

      safeError(
        "render error",
        error
      );
    }
  }

  function render(path = "/", options = {}) {
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

  function navigate(path = "/", options = {}) {
    const opts =
      safeObject(options);

    const data =
      getRequestedData(path);

    const key =
      `${data.publicPath}|${data.canonicalPath}`;

    const current =
      getCurrentComparable();

    const sameAsCurrent =
      current.canonical === data.canonicalPath &&
      current.publicPath === data.publicPath;

    if (
      activeView &&
      sameAsCurrent &&
      opts.forceRender !== true
    ) {
      if (
        opts.force === true &&
        isBurst(key)
      ) {
        return resolveNoopNavigation(
          "duplicate-force-burst",
          data
        );
      }

      if (opts.force !== true) {
        return resolveNoopNavigation(
          "same-route",
          data
        );
      }
    }

    if (
      activeView &&
      isBurst(key) &&
      opts.forceRender !== true
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
      opts.source === "login" ||
      opts.fromLogin === true
    ) {
      markLoginNavigation(true);
    }

    repairShellForRoute({
      route:
        data.route,
      canonicalPath:
        data.canonicalPath,
      publicPath:
        data.publicPath,
      phase:
        "navigate",
      hideLoading:
        false,
    });

    return render(
      data.publicPath,
      opts
    );
  }

  function replace(path = "/", options = {}) {
    return navigate(
      path,
      {
        ...safeObject(options),
        replaceState: true,
      }
    );
  }

  function goAfterLogin(fallback = "/") {
    let redirect = "";

    try {
      redirect =
        new URL(
          window.location.href
        ).searchParams.get("redirect") || "";
    } catch {}

    const resolvedRedirect =
      resolveSafeRedirect(redirect);

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
      link.getAttribute("href") || "";

    if (!href) {
      return;
    }

    if (
      link.hasAttribute("download")
    ) {
      return;
    }

    const target =
      safeText(
        link.getAttribute("target"),
        ""
      ).toLowerCase();

    if (target === "_blank") {
      return;
    }

    if (isHashOnlyHref(href)) {
      return;
    }

    if (isUnsafeHref(href)) {
      event.preventDefault();
      return;
    }

    if (isExternalHref(href)) {
      return;
    }

    event.preventDefault();

    navigate(href, {
      source:
        "link-click",
    });
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

  function onExternalRepair(event = null) {
    const reason =
      event?.detail?.reason ||
      event?.type ||
      "external-repair";

    repairCurrentRoute(reason);
  }

  function onAuthSessionReady(event = null) {
    const current =
      getCurrentComparable();

    repairCurrentRoute(
      event?.type ||
        "auth-session-ready"
    );

    if (
      current.canonical === "/login" &&
      isAuthenticated()
    ) {
      goAfterLogin("/");
    }
  }

  /* =====================================================
     REGISTRATION
  ===================================================== */

  function attachToAppCore() {
    try {
      AppCore.Router = api;
    } catch {}

    try {
      AppCore.router = api;
    } catch {}

    try {
      if (isFn(AppCore?.modules?.register)) {
        AppCore.modules.register(
          "Router",
          api
        );

        AppCore.modules.register(
          "router",
          api
        );
      }
    } catch {}

    return true;
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

    attachToAppCore();

    bound = true;

    if (isBrowser()) {
      disposers.push(
        safeOn(
          document,
          "click",
          onClick
        )
      );

      disposers.push(
        safeOn(
          window,
          "popstate",
          onPopstate
        )
      );

      [
        "auth:login:success",
        "auth:session:applied",
        "auth:session:restored",
        "app:session:restored",
        "app:auth:ready",
      ].forEach((eventName) => {
        disposers.push(
          safeEventOn(
            eventName,
            onAuthSessionReady
          )
        );
      });

      [
        "app:ui:repair",
        "app:ui:repair-request",
        "app:user:change",
        "app:user-ui:sync",
        "auth:logout:success",
        "app:session:cleared",
      ].forEach((eventName) => {
        disposers.push(
          safeEventOn(
            eventName,
            onExternalRepair
          )
        );
      });
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

    safeLog("ready");

    return api;
  }

  function unbind() {
    if (!bound) {
      return api;
    }

    while (disposers.length) {
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

  function configure(options = {}) {
    configured = true;

    attachToAppCore();

    safeEmit(
      "router:configured",
      {
        options:
          safeObject(options),
      }
    );

    return api;
  }

  /* =====================================================
     DEBUG
  ===================================================== */

  function getSnapshot() {
    const dom =
      getDomSnapshot();

    return {
      configured,
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

      initialRouteRendered:
        Boolean(
          AppCore?.state?.initialRouteRendered
        ),

      bootNavigationHandled:
        Boolean(
          AppCore?.state?.bootNavigationHandled
        ),

      authenticated:
        isAuthenticated(),

      routes:
        immutableRoutes.map((route) => ({
          path:
            route.path,
          name:
            route.name || null,
          layout:
            route.layout || route.meta?.layout || null,
          shell:
            route.shell,
        })),

      dom: {
        bodyClasses:
          dom.body?.className || "",

        htmlClasses:
          dom.html?.className || "",

        bodyShell:
          dom.body?.dataset?.shell || null,

        htmlShell:
          dom.html?.dataset?.shell || null,

        bodyRouteMode:
          dom.body?.dataset?.routeMode || null,

        htmlRouteMode:
          dom.html?.dataset?.routeMode || null,

        hasShell:
          Boolean(dom.shell),

        hasMain:
          Boolean(dom.main),

        hasView:
          Boolean(dom.view),

        hasSidebar:
          Boolean(dom.sidebar),

        hasTopbar:
          Boolean(dom.topbar),

        hasLoader:
          Boolean(dom.loader),

        shellHidden:
          Boolean(dom.shell?.hidden),

        sidebarHidden:
          Boolean(dom.sidebar?.hidden),

        topbarHidden:
          Boolean(dom.topbar?.hidden),

        loaderHidden:
          Boolean(dom.loader?.hidden),
      },
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
    getRouteMatch,

    getCurrentPath:
      () =>
        getCurrentPath(AppCore),

    getCurrentCanonicalPath:
      () =>
        getCurrentCanonicalPath(AppCore),

    getCurrentPublicPath:
      () =>
        getCurrentPublicPath(AppCore),

    getCurrentResolvedUsername:
      () =>
        resolveUsername(
          getCurrentPublicPath(AppCore) || "/"
        ),

    navigate,
    replace,
    render,

    back:
      (...args) =>
        back(...args),

    goAfterLogin,

    repairShell:
      repairShellForRoute,

    repairCurrentRoute,

    hideLoader,

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
      (pathname = "/") =>
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

    resolveSpaHref:
      (href = "/") =>
        resolveSpaHref(
          AppCore,
          href
        ),

    isSlugCandidatePath:
      (pathname = "/") =>
        isSlugCandidatePath(
          AppCore,
          pathname
        ),

    isSameCanonicalPath:
      (a = "/", b = "/") =>
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
