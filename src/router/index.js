/* =========================================================
   Onion SPA - Router
   Archivo: src/router/index.js

   ROUTER · SIMPLE
   - orquestador real de navegación SPA
   - helpers normalizan rutas
   - guards deciden acceso
   - render pinta vistas
   - history gestiona push/replace/popstate
   - sin Auth real, fetch, storage, Toast ni lógica de vistas
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";

import {
  getRouteNames,
  normalizePath as normalizePathHelper,
  normalizeCanonicalPath as normalizeCanonicalPathHelper,
  getCurrentPath as getCurrentPathHelper,
  getCurrentCanonicalPath as getCurrentCanonicalPathHelper,
  getCurrentPublicPath as getCurrentPublicPathHelper,
  getCurrentResolvedUsername,
  getCurrentUsername,
  extractUsernameFromPath as extractUsernameFromPathHelper,
  stripUsernamePrefix as stripUsernamePrefixHelper,
  resolveSpaHref as resolveSpaHrefHelper,
  isSlugCandidatePath as isSlugCandidatePathHelper,
  isSameCanonicalPath as isSameCanonicalPathHelper,
  isExternalHref,
  isUnsafeHref,
  isHashOnlyHref,
  canUsePublicSlugForRoute as canUsePublicSlugForRouteHelper,
  buildPublicPath as buildPublicPathHelper,
  getDefaultHomeTarget,
  getRedirectPath,
  redactTokenInText,
} from "./helpers.js";

import {
  ROUTE_PATHS,
  getImmutableRoutes,
  validateRoutesTable,
  resolveRouteAlias,
  getRoutesSnapshot,
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

export const ROUTER_VERSION = "21.0.0-simple";

export const Router = (() => {
  "use strict";

  const VERSION = ROUTER_VERSION;
  const SOURCE = "router.index";
  const routes = getImmutableRoutes();

  const LOGIN_PATH = ROUTE_PATHS?.LOGIN || "/login";
  const HOME_PATH = ROUTE_PATHS?.HOME || "/";

  const EVENTS = Object.freeze({
    configured: "router:configured",
    bound: "router:bound",
    unbound: "router:unbound",
    beforeRender: "router:before-render",
    rendered: "router:rendered",
    renderError: "router:render:error",
    renderStale: "router:render:stale",
    loaderHidden: "app:loader:hidden",
  });

  let configured = false;
  let bound = false;
  let renderSeq = 0;
  let renderQueue = Promise.resolve();
  let activeView = null;

  let lastNavKey = "";
  let lastNavAt = 0;
  let lastRenderedCanonicalPath = "";
  let lastRenderedPublicPath = "";
  let lastRenderedAt = 0;

  const disposers = [];

  /* =======================================================
     BASICS
  ======================================================= */

  const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
  const isFn = (value) => typeof value === "function";
  const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

  function safeObject(value, fallback = {}) {
    return isObject(value) ? value : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text || fallback;
  }

  function now() {
    try { return Date.now(); } catch { return 0; }
  }

  function iso(ms = now()) {
    try { return new Date(ms).toISOString(); } catch { return ""; }
  }

  function callHelper(fn, ...args) {
    try {
      return isFn(fn) ? fn(...args) : null;
    } catch {
      return null;
    }
  }

  function callCoreHelper(fn, ...args) {
    return callHelper(fn, AppCore, ...args) ?? callHelper(fn, ...args) ?? null;
  }

  function redact(value = "") {
    try {
      return redactTokenInText(value);
    } catch {
      return safeText(value, "");
    }
  }

  function sanitize(value, depth = 0, seen = new WeakSet(), keyHint = "") {
    if (depth > 4) return "[depth-limit]";
    if (/token|secret|password|authorization|credential|jwt|bearer|otp|mfa|2fa|code/i.test(keyHint)) return value ? "***" : value;
    if (typeof value === "string") return redact(value);
    if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "function") return "[function]";

    if (value instanceof Error) {
      return {
        name: value.name || "Error",
        message: redact(value.message || ""),
        status: value.status || value.statusCode || value.response?.status || null,
        code: value.code || value.data?.code || value.response?.data?.code || null,
      };
    }

    if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1, seen, keyHint));

    if (isObject(value)) {
      try {
        if (seen.has(value)) return "[circular]";
        seen.add(value);
      } catch {}

      return Object.fromEntries(
        Object.entries(value)
          .slice(0, 80)
          .map(([key, item]) => [key, sanitize(item, depth + 1, seen, key)])
      );
    }

    return String(value);
  }

  function emit(name, payload = {}, options = {}) {
    const eventName = safeText(name, "");
    if (!eventName || options.emit === false || options.emitEvents === false) return false;

    const detail = sanitize({ version: VERSION, source: SOURCE, at: iso(), ...safeObject(payload) });

    try {
      AppCore?.events?.emit?.(eventName, detail);
      return true;
    } catch {}

    try {
      if (isBrowser() && typeof CustomEvent !== "undefined") {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
        return true;
      }
    } catch {}

    return false;
  }

  function warn(...args) {
    try {
      AppCore?.utils?.warn?.("[Router]", ...args.map((item) => sanitize(item)));
    } catch {
      try {
        if (AppCore?.config?.debug) console.warn("[Router]", ...args.map((item) => sanitize(item)));
      } catch {}
    }
  }

  function onDom(target, event, handler, options = false) {
    if (!target || !event || !isFn(handler)) return () => {};

    try {
      target.addEventListener(event, handler, options);
      return () => {
        try { target.removeEventListener(event, handler, options); } catch {}
      };
    } catch {
      return () => {};
    }
  }

  function onEvent(name, handler) {
    if (!name || !isFn(handler)) return () => {};

    try {
      if (isFn(AppCore?.events?.on)) {
        const off = AppCore.events.on(name, handler);
        if (isFn(off)) return off;

        return () => {
          try { AppCore?.events?.off?.(name, handler); } catch {}
        };
      }
    } catch {}

    return isBrowser() ? onDom(window, name, handler) : () => {};
  }

  function afterPaint(callback) {
    if (!isFn(callback)) return;

    if (!isBrowser()) {
      try { callback(); } catch {}
      return;
    }

    try {
      requestAnimationFrame(() => requestAnimationFrame(callback));
    } catch {
      setTimeout(callback, 0);
    }
  }

  /* =======================================================
     PATH / ROUTE RESOLUTION
  ======================================================= */

  function browserPath() {
    if (!isBrowser()) return HOME_PATH;

    try {
      const { pathname, search, hash } = window.location;
      return normalizePublicPath(`${pathname || HOME_PATH}${search || ""}${hash || ""}`);
    } catch {
      return HOME_PATH;
    }
  }

  function normalizePublicPath(path = HOME_PATH) {
    return callCoreHelper(normalizePathHelper, path) || HOME_PATH;
  }

  function normalizeCanonicalPath(path = HOME_PATH) {
    return callCoreHelper(normalizeCanonicalPathHelper, path) || HOME_PATH;
  }

  function stripQuery(path = HOME_PATH) {
    return safeText(path, HOME_PATH).split("?")[0].split("#")[0] || HOME_PATH;
  }

  function routePath(route = null) {
    return stripQuery(route?.path || route?.canonicalPath || HOME_PATH);
  }

  function currentPublicPath() {
    return callCoreHelper(getCurrentPublicPathHelper) || AppCore?.state?.publicPath || browserPath();
  }

  function currentCanonicalPath() {
    return callCoreHelper(getCurrentCanonicalPathHelper) || AppCore?.state?.canonicalPath || AppCore?.state?.route || normalizeCanonicalPath(currentPublicPath());
  }

  function currentPath() {
    return callCoreHelper(getCurrentPathHelper) || currentPublicPath();
  }

  function usernameFor(path = HOME_PATH) {
    return (
      callCoreHelper(extractUsernameFromPathHelper, path) ||
      callCoreHelper(getCurrentResolvedUsername) ||
      callCoreHelper(getCurrentUsername) ||
      AppCore?.state?.currentResolvedUsername ||
      AppCore?.state?.resolvedUsername ||
      AppCore?.state?.user?.slug ||
      AppCore?.state?.user?.username ||
      null
    );
  }

  function sameCanonical(a = HOME_PATH, b = HOME_PATH) {
    return Boolean(callCoreHelper(isSameCanonicalPathHelper, a, b)) || normalizeCanonicalPath(a) === normalizeCanonicalPath(b);
  }

  function routeMatches(route, canonicalPath) {
    const clean = stripQuery(canonicalPath);
    const path = routePath(route);

    if (path === clean) return "exact";

    try {
      const alias = resolveRouteAlias(clean);
      if (alias && routePath(route) === stripQuery(alias)) return "alias";
    } catch {}

    for (const alias of safeArray(route?.aliases)) {
      try {
        const normalizedAlias = stripQuery(resolveRouteAlias(alias) || normalizeCanonicalPath(alias));
        if (normalizedAlias === clean) return "route.alias";
      } catch {
        if (stripQuery(alias) === clean) return "route.alias";
      }
    }

    try {
      if (isFn(route?.match) && route.match(clean)) return "route.match";
    } catch {}

    try {
      if (route?.pattern instanceof RegExp && route.pattern.test(clean)) return "route.pattern";
    } catch {}

    return "";
  }

  function getRouteMatch(path = HOME_PATH) {
    const publicPath = normalizePublicPath(path);
    const canonicalPath = normalizeCanonicalPath(publicPath);
    const clean = stripQuery(canonicalPath);

    for (const route of routes) {
      const matchedBy = routeMatches(route, clean);
      if (!matchedBy) continue;

      return {
        route,
        publicPath,
        canonicalPath: routePath(route),
        rawCanonicalPath: clean,
        matchedBy,
      };
    }

    return {
      route: null,
      publicPath,
      canonicalPath: clean || HOME_PATH,
      rawCanonicalPath: clean || HOME_PATH,
      matchedBy: "none",
    };
  }

  function getRoute(path = HOME_PATH) {
    return getRouteMatch(path).route;
  }

  function routeExists(path = HOME_PATH) {
    return Boolean(getRoute(path));
  }

  function preservePublicPath(options = {}) {
    return Boolean(
      options.preservePublicPath === true ||
        options.preservePath === true ||
        options.preserveUrl === true ||
        options.protectedInitialUrl === true ||
        options.initialRender === true ||
        options.skipHistory === true
    );
  }

  function buildRoutePublicPath(route, canonicalPath, requestedPath, options = {}) {
    if (!route || preservePublicPath(options)) return normalizePublicPath(requestedPath || canonicalPath);

    try {
      if (canUsePublicSlugForRouteHelper(route, getRouteNames(AppCore)) === false) {
        return normalizePublicPath(requestedPath || canonicalPath);
      }
    } catch {}

    const username = options.username || options.resolvedUsername || usernameFor(requestedPath || canonicalPath);

    return callCoreHelper(buildPublicPathHelper, getRoute, canonicalPath, {
      ...safeObject(options),
      username,
      resolvedUsername: username,
      fromPath: requestedPath,
      publicPath: requestedPath,
    }) || normalizePublicPath(requestedPath || canonicalPath);
  }

  function getRequestedData(path = HOME_PATH, options = {}) {
    const opts = safeObject(options);
    const requestedPath = normalizePublicPath(opts.publicPath || opts.requestedPath || path || HOME_PATH);
    const seed = opts.canonicalPath || opts.route?.path || requestedPath;
    const match = opts.route
      ? { route: opts.route, publicPath: requestedPath, canonicalPath: routePath(opts.route), rawCanonicalPath: normalizeCanonicalPath(seed), matchedBy: "provided" }
      : getRouteMatch(seed);

    const route = match.route;
    const canonicalPath = stripQuery(route ? routePath(route) : match.canonicalPath || normalizeCanonicalPath(seed));
    const rawCanonicalPath = stripQuery(match.rawCanonicalPath || normalizeCanonicalPath(seed));
    const publicPath = buildRoutePublicPath(route, canonicalPath, requestedPath, opts);
    const username = usernameFor(publicPath);

    return {
      requestedPath,
      canonicalPath,
      rawCanonicalPath,
      publicPath,
      route,
      username: username || null,
      matchedBy: match.matchedBy || "none",
    };
  }

  function currentComparable() {
    const canonicalPath = normalizeCanonicalPath(currentCanonicalPath() || AppCore?.state?.route || lastRenderedCanonicalPath || HOME_PATH);
    const publicPath = normalizePublicPath(currentPublicPath() || AppCore?.state?.publicPath || lastRenderedPublicPath || canonicalPath);

    return { canonicalPath, publicPath };
  }

  function getDefaultHome() {
    return getDefaultHomeTarget(AppCore, getRoute) || HOME_PATH;
  }

  /* =======================================================
     STATE / SHELL
  ======================================================= */

  function setState(patch = {}) {
    const data = safeObject(patch);

    try {
      AppCore?.setState?.(data, { source: SOURCE, emit: false, emitState: false, silent: true });
      return true;
    } catch {}

    try {
      AppCore?.patchState?.(data, { source: SOURCE, emit: false, silent: true });
      return true;
    } catch {}

    try {
      Object.assign(AppCore.state, data);
      return true;
    } catch {}

    return false;
  }

  function syncState({ canonicalPath = HOME_PATH, publicPath = HOME_PATH, username = null } = {}) {
    const canonical = stripQuery(normalizeCanonicalPath(canonicalPath || HOME_PATH));
    const publicValue = normalizePublicPath(publicPath || canonical);

    try { AppCore?.setRoute?.(canonical); } catch {}
    try { AppCore?.setPublicPath?.(publicValue); } catch {}

    setState({
      route: canonical,
      canonicalPath: canonical,
      publicPath: publicValue,
      currentResolvedUsername: username || null,
      initialRouteRendered: true,
      bootNavigationHandled: true,
    });

    lastRenderedCanonicalPath = canonical;
    lastRenderedPublicPath = publicValue;
    lastRenderedAt = now();

    return { canonicalPath: canonical, publicPath: publicValue, username: username || null };
  }

  function destroyActiveView() {
    if (!activeView) return false;

    try { activeView.destroy?.(); } catch (error) { warn("view destroy failed", error); }

    activeView = null;
    return true;
  }

  function hideLoader(reason = "router") {
    if (!isBrowser()) return false;

    let loader = null;

    try {
      loader = AppCore?.dom?.loader || document.getElementById("app-loader") || document.querySelector("[data-app-loader], .app-loader");
    } catch {}

    try {
      document.documentElement?.classList?.remove?.("app-loading");
      document.body?.classList?.remove?.("app-loading", "loading");
    } catch {}

    if (!loader) return false;

    try {
      loader.classList.remove("is-visible", "is-entering", "is-leaving", "app-loader--visible");
      loader.classList.add("is-hidden", "has-hidden", "loader-hidden");
      loader.setAttribute("aria-hidden", "true");
      loader.setAttribute("aria-busy", "false");
      loader.dataset.loaderVisible = "false";
      loader.dataset.loaderState = "hidden";
      loader.hidden = true;
    } catch {}

    emit(EVENTS.loaderHidden, { reason });
    return true;
  }

  function applyShell(route, canonicalPath, publicPath, phase = "router", hideLoading = false) {
    try { setShellMode(AppCore, route); } catch {}
    try { setActiveMenu(AppCore, canonicalPath); } catch {}
    try { setDocumentTitle(AppCore, route?.title || route?.label || route?.name || ""); } catch {}

    if (hideLoading) hideLoader(phase);
    return true;
  }

  function scheduleShell(route, canonicalPath, publicPath, phase = "post-render") {
    const seq = renderSeq;

    afterPaint(() => {
      if (seq !== renderSeq) return;
      applyShell(route, canonicalPath, publicPath, phase, true);
    });
  }

  function repairCurrentRoute(phase = "repair") {
    const data = getRequestedData(browserPath(), { preservePublicPath: true, preserveUrl: true });
    applyShell(data.route, data.canonicalPath, data.publicPath, phase, true);
    return true;
  }

  function repairShell(payload = {}) {
    if (typeof payload === "string") return repairCurrentRoute(payload);

    const data = safeObject(payload);
    const resolved = data.route
      ? data
      : getRequestedData(data.publicPath || data.canonicalPath || browserPath(), { preservePublicPath: true, preserveUrl: true });

    return applyShell(
      data.route || resolved.route,
      data.canonicalPath || resolved.canonicalPath,
      data.publicPath || resolved.publicPath,
      data.phase || "repair",
      data.hideLoading !== false
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  function shouldSkipHistory(options = {}) {
    return Boolean(options.skipHistory === true || options.protectedInitialUrl === true || (options.initialRender === true && options.preserveUrl === true));
  }

  function buildHistoryOptions(options = {}, data = {}) {
    return {
      ...safeObject(options),
      username: data.username || null,
      resolvedUsername: data.username || null,
      canonicalPath: data.canonicalPath,
      rawCanonicalPath: data.rawCanonicalPath,
      publicPath: data.publicPath,
      requestedPath: data.requestedPath,
      fromPath: data.requestedPath || data.publicPath,
      preservePath: Boolean(options.preservePath || options.preservePublicPath || options.preserveUrl || options.protectedInitialUrl),
      skipHistory: shouldSkipHistory(options),
      protectedInitialUrl: options.protectedInitialUrl === true,
    };
  }

  function isLatest(seq) {
    return Boolean(seq && seq === renderSeq);
  }

  function stale(seq, reason = "stale-render") {
    const payload = { ok: false, skipped: true, stale: true, reason, token: seq, currentToken: renderSeq };
    emit(EVENTS.renderStale, payload);
    return payload;
  }

  function accessDecision(route, canonicalPath, publicPath) {
    try {
      const access = shouldAllowRoute({
        AppCore,
        Auth,
        route,
        requestedCanonicalPath: canonicalPath,
        requestedPublicPath: publicPath,
        getRoute,
      });

      return isObject(access) ? { allowed: access.allowed !== false, ...access } : { allowed: true };
    } catch (error) {
      warn("guard failed", { canonicalPath, publicPath, error });
      return { allowed: false, reason: "guard-error", error };
    }
  }

  async function renderDenied(access, data, options, seq) {
    const reason = access?.reason || "blocked";

    if (!isLatest(seq)) return stale(seq, "guard-stale");

    if ((reason === "not-authenticated" || reason === "ghost-auth-blocked") && access.redirectTo) {
      destroyActiveView();

      await Promise.resolve(renderLoginRedirect({
        AppCore,
        getRoute,
        updateHistory,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        redirectTo: normalizePublicPath(access.redirectTo),
        clearDynamicContainers: () => clearDynamicContainers(AppCore),
        setActiveMenu: (path) => setActiveMenu(AppCore, path),
        setShellMode: (route) => setShellMode(AppCore, route),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      }));

      if (!isLatest(seq)) return stale(seq, "login-redirect-stale");

      const loginData = getRequestedData(access.redirectTo || LOGIN_PATH, { preservePublicPath: true, preserveUrl: true });
      const synced = syncState(loginData);

      applyShell(loginData.route, synced.canonicalPath, synced.publicPath, `guard:${reason}`, true);

      emit(EVENTS.rendered, {
        found: true,
        redirected: true,
        reason,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        redirectedFrom: data.canonicalPath,
        token: seq,
      });

      return { ok: true, handled: true, redirected: true, reason };
    }

    if (reason === "already-authenticated" && access.redirectTo) {
      return executeRender(access.redirectTo || getDefaultHome(), { ...safeObject(options), replaceState: true, force: true, forceRender: true, source: "guard:already-authenticated" }, seq);
    }

    destroyActiveView();
    clearDynamicContainers(AppCore);

    renderRouteForbidden({
      AppCore,
      getRoute,
      updateHistory,
      route: data.route,
      requestedPath: data.publicPath,
      canonicalPath: data.canonicalPath,
      requestedUsername: data.username,
      setShellMode: (route) => setShellMode(AppCore, route),
      setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
    });

    if (!isLatest(seq)) return stale(seq, "forbidden-stale");

    const synced = syncState(data);
    applyShell(data.route, synced.canonicalPath, synced.publicPath, `guard:${reason}`, true);

    emit(EVENTS.rendered, {
      found: true,
      forbidden: true,
      reason,
      canonicalPath: synced.canonicalPath,
      publicPath: synced.publicPath,
      username: synced.username,
      token: seq,
    });

    return { ok: true, handled: true, forbidden: true, reason };
  }

  async function executeRender(path = HOME_PATH, options = {}, seq = 0) {
    if (!isLatest(seq)) return stale(seq, "execute-start-stale");

    const startedAt = now();
    const data = getRequestedData(path, options);
    const histOptions = buildHistoryOptions(options, data);

    emitBeforeRender(AppCore, {
      path: data.publicPath,
      requestedPath: data.requestedPath,
      canonicalPath: data.canonicalPath,
      rawCanonicalPath: data.rawCanonicalPath,
      publicPath: data.publicPath,
      username: data.username,
      route: data.route,
      matchedBy: data.matchedBy,
      token: seq,
      options: histOptions,
    });

    emit(EVENTS.beforeRender, { canonicalPath: data.canonicalPath, publicPath: data.publicPath, token: seq });
    applyShell(data.route, data.canonicalPath, data.publicPath, "before-render", false);

    if (!isLatest(seq)) return stale(seq, "before-render-stale");

    if (!data.route) {
      destroyActiveView();
      clearDynamicContainers(AppCore);

      renderRouteNotFound({
        AppCore,
        getRoute,
        updateHistory,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        requestedUsername: data.username,
        setShellMode: (route) => setShellMode(AppCore, route),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });

      if (!isLatest(seq)) return stale(seq, "not-found-stale");

      const synced = syncState(data);
      applyShell(null, synced.canonicalPath, synced.publicPath, "not-found", true);

      emit(EVENTS.rendered, {
        found: false,
        canonicalPath: synced.canonicalPath,
        rawCanonicalPath: data.rawCanonicalPath,
        publicPath: synced.publicPath,
        username: synced.username,
        matchedBy: data.matchedBy,
        durationMs: Math.round(now() - startedAt),
        token: seq,
      });

      return { ok: true, found: false, canonicalPath: synced.canonicalPath, publicPath: synced.publicPath, token: seq };
    }

    const access = accessDecision(data.route, data.canonicalPath, data.publicPath);

    if (!access.allowed) {
      const denied = await renderDenied(access, data, options, seq);
      if (denied?.handled || denied?.stale) return denied;
    }

    if (!isLatest(seq)) return stale(seq, "after-guards-stale");

    clearDynamicContainers(AppCore);
    setActiveMenu(AppCore, data.canonicalPath);
    applyShell(data.route, data.canonicalPath, data.publicPath, "after-ui-prep", false);

    if (!shouldSkipHistory(histOptions)) {
      updateHistory({ AppCore, getRoute, pathname: data.publicPath, options: histOptions });
    }

    try {
      destroyActiveView();

      const view = await Promise.resolve(renderRouteSuccess({
        AppCore,
        route: data.route,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        requestedUsername: data.username,
        getRoute,
        setShellMode: (route) => setShellMode(AppCore, route),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      }));

      if (!isLatest(seq)) {
        try { view?.destroy?.(); } catch {}
        return stale(seq, "after-view-render-stale");
      }

      activeView = view || null;

      const synced = syncState(data);
      applyShell(data.route, synced.canonicalPath, synced.publicPath, "render-success", true);
      scheduleShell(data.route, synced.canonicalPath, synced.publicPath, "render-success:after-paint");

      emit(EVENTS.rendered, {
        found: true,
        forbidden: false,
        canonicalPath: synced.canonicalPath,
        rawCanonicalPath: data.rawCanonicalPath,
        publicPath: synced.publicPath,
        username: synced.username,
        matchedBy: data.matchedBy,
        routePath: data.route?.path || null,
        routeName: data.route?.name || null,
        viewKey: data.route?.viewKey || null,
        viewName: data.route?.viewName || null,
        durationMs: Math.round(now() - startedAt),
        token: seq,
      });

      return { ok: true, found: true, canonicalPath: synced.canonicalPath, publicPath: synced.publicPath, token: seq };
    } catch (error) {
      destroyActiveView();

      if (!isLatest(seq)) return stale(seq, "runtime-error-stale");

      renderRouteRuntimeError({
        AppCore,
        getRoute,
        route: data.route,
        error,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        requestedUsername: data.username,
        setShellMode: (route) => setShellMode(AppCore, route),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });

      const synced = syncState(data);
      applyShell(data.route, synced.canonicalPath, synced.publicPath, "runtime-error", true);

      emit(EVENTS.renderError, { error, canonicalPath: synced.canonicalPath, publicPath: synced.publicPath, token: seq });

      return { ok: false, error, canonicalPath: synced.canonicalPath, publicPath: synced.publicPath, token: seq };
    }
  }

  function render(path = HOME_PATH, options = {}) {
    const seq = ++renderSeq;

    renderQueue = renderQueue
      .catch((error) => {
        warn("render queue recovered", error);
      })
      .then(() => executeRender(path, safeObject(options), seq));

    return renderQueue;
  }

  function renderCurrent(options = {}) {
    return render(browserPath(), {
      preservePublicPath: true,
      preserveUrl: true,
      replaceState: true,
      source: "render-current",
      ...safeObject(options),
    });
  }

  /* =======================================================
     NAVIGATION
  ======================================================= */

  function noop(reason, data = {}) {
    return Promise.resolve({ ok: true, skipped: true, reason, canonicalPath: data.canonicalPath || null, publicPath: data.publicPath || null });
  }

  function isBurst(key = "") {
    return Boolean(key && key === lastNavKey && now() - lastNavAt < 160);
  }

  function rememberNav(key = "") {
    lastNavKey = String(key || "");
    lastNavAt = now();
  }

  function navigate(path = HOME_PATH, options = {}) {
    const opts = safeObject(options);
    const raw = safeText(path, HOME_PATH);

    try {
      if (isUnsafeHref(raw)) return noop("unsafe-href");
      if (isExternalHref(raw)) return noop("external-href");
      if (isHashOnlyHref(raw)) return noop("hash-only");
    } catch {}

    const resolved = callCoreHelper(resolveSpaHrefHelper, raw) || raw;
    const data = getRequestedData(resolved, opts);
    const key = `${data.publicPath}|${data.canonicalPath}`;
    const current = currentComparable();
    const same = current.canonicalPath === data.canonicalPath && current.publicPath === data.publicPath;
    const hasRendered = Boolean(activeView || lastRenderedCanonicalPath || AppCore?.state?.initialRouteRendered);

    if (hasRendered && same && opts.force !== true && opts.forceRender !== true) {
      applyShell(data.route, data.canonicalPath, data.publicPath, "same-route", true);
      return noop("same-route", data);
    }

    if (isBurst(key) && opts.force !== true && opts.forceRender !== true && opts.allowBurst !== true) {
      return noop("burst", data);
    }

    rememberNav(key);

    return render(data.publicPath, {
      ...opts,
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
      requestedPath: data.requestedPath,
    });
  }

  function replace(path = HOME_PATH, options = {}) {
    return navigate(path, { ...safeObject(options), replaceState: true });
  }

  function goAfterLogin(fallback = HOME_PATH, options = {}) {
    const target = getRedirectPath(AppCore) || fallback || getDefaultHome();

    return navigate(target, {
      replaceState: options.replaceState !== false,
      force: options.force !== false,
      forceRender: options.forceRender !== false,
      source: options.source || "login",
      fromLogin: true,
    });
  }

  /* =======================================================
     BINDINGS
  ======================================================= */

  function onClick(event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.__onionRouterHandled ||
      event.__onionSidebarHandled ||
      event.__onionSidebarEventsHandled
    ) {
      return;
    }

    const link = event.target?.closest?.("a[data-spa]");
    if (!link || link.hasAttribute("download")) return;

    const href = link.getAttribute("href") || "";
    const target = safeText(link.getAttribute("target"), "").toLowerCase();

    if (!href || target === "_blank") return;

    try {
      if (isHashOnlyHref(href) || isExternalHref(href) || isUnsafeHref(href)) return;
    } catch {}

    event.preventDefault();

    try { event.__onionRouterHandled = true; } catch {}

    navigate(href, { source: "link-click" });
  }

  function handlePopState() {
    render(browserPath(), {
      skipHistory: true,
      replaceState: true,
      force: true,
      forceRender: true,
      preservePublicPath: true,
      preserveUrl: true,
      source: "popstate",
    });
  }

  function isAuthenticated() {
    try {
      return Boolean(Auth?.isAuthenticated?.());
    } catch {
      return Boolean(AppCore?.state?.authenticated);
    }
  }

  function onAuthReady() {
    repairCurrentRoute("auth-ready");

    const current = currentComparable();
    if (current.canonicalPath === LOGIN_PATH && isAuthenticated()) {
      goAfterLogin(HOME_PATH, { source: "auth-ready" });
    }
  }

  function bindLinks() {
    if (!isBrowser()) return () => {};
    return onDom(document, "click", onClick);
  }

  function attachToAppCore() {
    try {
      AppCore.Router = api;
      AppCore.router = api;
    } catch {}

    try {
      AppCore?.modules?.register?.("Router", api, { overwrite: true, replace: true, aliases: ["router"], source: SOURCE });
      AppCore?.modules?.register?.("router", api, { overwrite: true, replace: true, aliases: ["Router"], source: SOURCE });
    } catch {}

    try {
      AppCore?.modules?.set?.("Router", api);
      AppCore?.modules?.set?.("router", api);
    } catch {}

    try {
      if (isBrowser()) window.__ONION_ROUTER__ = api;
    } catch {}

    return true;
  }

  function configure(options = {}) {
    if (configured) return api;

    configured = true;
    attachToAppCore();

    emit(EVENTS.configured, { options: safeObject(options) });
    return api;
  }

  function bind() {
    if (bound) return api;

    validateRoutesTable(AppCore, routes, normalizeCanonicalPathHelper);
    attachToAppCore();

    bound = true;

    if (isBrowser()) {
      disposers.push(bindLinks());
      disposers.push(onDom(window, "popstate", handlePopState));

      ["auth:login:success", "auth:session:applied", "auth:session:restored", "app:session:restored", "app:auth:ready"].forEach((name) => {
        disposers.push(onEvent(name, onAuthReady));
      });

      ["app:user:change", "auth:logout:success", "app:session:cleared", "app:ui:repair-request"].forEach((name) => {
        disposers.push(onEvent(name, () => repairCurrentRoute(name)));
      });
    }

    ensureInitialHistoryState({ AppCore });
    emit(EVENTS.bound, { routes: routes.map((route) => route.path) });

    return api;
  }

  function init(options = {}) {
    configure(options);
    bind();
    return api;
  }

  function start(options = {}) {
    init(options);
    if (options.render === false) return Promise.resolve(api);
    return renderCurrent({ initialRender: true, preserveUrl: true, source: "router.start", ...safeObject(options) });
  }

  function unbind() {
    if (!bound) return api;

    while (disposers.length) {
      try { disposers.pop()?.(); } catch {}
    }

    destroyActiveView();
    bound = false;
    emit(EVENTS.unbound);
    return api;
  }

  /* =======================================================
     SNAPSHOT / DEBUG
  ======================================================= */

  function getCurrentRoute() {
    return getRoute(currentCanonicalPath());
  }

  function getSnapshot() {
    let routeSnapshot = [];

    try {
      routeSnapshot = isFn(getRoutesSnapshot) ? getRoutesSnapshot() : routes;
    } catch {
      routeSnapshot = routes;
    }

    return sanitize({
      version: VERSION,
      configured,
      bound,
      renderSeq,
      hasActiveView: Boolean(activeView),
      current: currentComparable(),
      route: AppCore?.state?.route || HOME_PATH,
      canonicalPath: AppCore?.state?.canonicalPath || AppCore?.state?.route || HOME_PATH,
      publicPath: AppCore?.state?.publicPath || HOME_PATH,
      browserPath: browserPath(),
      lastNavKey,
      lastNavAt,
      lastNavAtIso: lastNavAt ? iso(lastNavAt) : "",
      lastRenderedCanonicalPath,
      lastRenderedPublicPath,
      lastRenderedAt,
      lastRenderedAtIso: lastRenderedAt ? iso(lastRenderedAt) : "",
      authenticated: isAuthenticated(),
      routes: routeSnapshot,
      policy: {
        ownAuth: false,
        ownStorage: false,
        ownTransport: false,
        ownToast: false,
        ownViewLogic: false,
      },
    });
  }

  function debug(path = "") {
    const target = safeText(path, "");
    const snapshot = target
      ? { target: redact(target), data: getRequestedData(target, { preservePublicPath: true, preserveUrl: true }), match: getRouteMatch(target), snapshot: getSnapshot() }
      : getSnapshot();

    try { console.log("[Router:debug]", sanitize(snapshot)); } catch {}

    return sanitize(snapshot);
  }

  const api = {
    version: VERSION,
    routes,

    init,
    start,
    configure,
    bind,
    unbind,
    destroy: unbind,

    getRoute,
    routeExists,
    getRouteMatch,
    getCurrentRoute,

    getCurrentPath: currentPath,
    getCurrentCanonicalPath: currentCanonicalPath,
    getCurrentPublicPath: currentPublicPath,
    getCurrentResolvedUsername: () => usernameFor(currentPublicPath()),

    navigate,
    replace,
    render,
    renderCurrent,

    go: navigate,
    push: navigate,
    back: (...args) => back(...args),
    handlePopState,
    bindLinks,

    goAfterLogin,

    repairShell,
    repairCurrentRoute,
    hideLoader,

    buildPublicPath: (canonicalPath = HOME_PATH, options = {}) => callCoreHelper(buildPublicPathHelper, getRoute, canonicalPath, options) || normalizePublicPath(canonicalPath),
    stripUsernamePrefix: (pathname = HOME_PATH) => callCoreHelper(stripUsernamePrefixHelper, pathname) || normalizePublicPath(pathname),
    extractUsernameFromPath: (pathname = HOME_PATH) => callCoreHelper(extractUsernameFromPathHelper, pathname) || usernameFor(pathname),
    resolveSpaHref: (href = HOME_PATH) => callCoreHelper(resolveSpaHrefHelper, href) || href,
    isSlugCandidatePath: (pathname = HOME_PATH) => Boolean(callCoreHelper(isSlugCandidatePathHelper, pathname)),
    isSameCanonicalPath: (a = HOME_PATH, b = HOME_PATH) => sameCanonical(a, b),
    canUsePublicSlugForRoute: (route) => canUsePublicSlugForRouteHelper(route, getRouteNames(AppCore)),

    getRequestedData,
    getDefaultHome,

    safePath: normalizePublicPath,
    safePublicPath: normalizePublicPath,
    safeCanonicalPath: normalizeCanonicalPath,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    getState: getSnapshot,
    debug,
  };

  attachToAppCore();
  return api;
})();

export default Router;
