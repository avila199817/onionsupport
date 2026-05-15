/* =========================================================
   Onion SPA - Router
   Archivo: src/router/index.js

   Router SPA simple:
   - publicPath conserva /@usuario, query y hash.
   - canonicalPath limpia /@usuario, query/hash y aliases.
   - Auth/guards delegados.
   - Render serializado anti race.
   - Rutas técnicas con token preservadas.
   - Sin event storm.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";

import {
  getRouteNames,
  normalizeCanonicalPath as normalizeCanonicalPathHelper,
  getCurrentPath as getCurrentPathHelper,
  getCurrentCanonicalPath as getCurrentCanonicalPathHelper,
  getCurrentResolvedUsername,
  getCurrentPublicPath as getCurrentPublicPathHelper,
  getCurrentUsername,
  extractUsernameFromPath as extractUsernameFromPathHelper,
  stripUsernamePrefix as stripUsernamePrefixHelper,
  resolveSpaHref as resolveSpaHrefHelper,
  isSlugCandidatePath,
  isSameCanonicalPath,
  isExternalHref,
  isUnsafeHref,
  isHashOnlyHref,
  buildPublicPath as buildPublicPathHelper,
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

export const Router = (() => {
  "use strict";

  const VERSION = "15.0.0-clean";
  const SOURCE = "router.index";

  const routes = getImmutableRoutes();

  const LOGIN_PATH = ROUTE_PATHS?.LOGIN || "/login";
  const HOME_PATH = ROUTE_PATHS?.HOME || "/";
  const ACTIVATE_PATH = ROUTE_PATHS?.ACTIVATE_ACCOUNT || "/activate-account";
  const RESET_CONFIRM_PATH = ROUTE_PATHS?.RESET_PASSWORD_CONFIRM || "/reset-password/confirm";

  const PUBLIC_PATHS = new Set([
    LOGIN_PATH,
    "/signin",
    "/sign-in",
    ACTIVATE_PATH,
    ROUTE_PATHS?.RESET_PASSWORD || "/reset-password",
    RESET_CONFIRM_PATH,
    ROUTE_PATHS?.FORGOT_PASSWORD || "/forgot-password",
    ROUTE_PATHS?.RECOVER_PASSWORD || "/recover-password",
    ROUTE_PATHS?.PASSWORD_RESET || "/password-reset",
    "/password-reset/confirm",
    "/2fa",
    "/otp",
    "/mfa",
  ].filter(Boolean));

  const TECHNICAL_BASES = [
    ACTIVATE_PATH,
    RESET_CONFIRM_PATH,
    "/password-reset/confirm",
    "/2fa",
    "/otp",
    "/mfa",
  ];

  const TOKEN_PARAMS = [
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "otpToken",
    "otp_token",
  ];

  const EVENTS = Object.freeze({
    configured: "router:configured",
    bound: "router:bound",
    unbound: "router:unbound",
    rendered: "router:rendered",
    renderError: "router:render:error",
    renderStale: "router:render:stale",
    internalRedirect: "router:internal-redirect",
    shellState: "router:shell:state",
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

  let shellRepairDepth = 0;
  let externalRepairInFlight = false;
  let lastExternalRepairKey = "";
  let lastExternalRepairAt = 0;

  let authReadyInFlight = false;
  let lastAuthReadyAt = 0;

  const disposers = [];

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function isFn(value) {
    return typeof value === "function";
  }

  function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  }

  function now() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function iso(ms = now()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function callHelper(fn, ...args) {
    try {
      return isFn(fn) ? fn(...args) : "";
    } catch {
      return "";
    }
  }

  function callCoreHelper(fn, ...args) {
    return callHelper(fn, AppCore, ...args) || callHelper(fn, ...args) || "";
  }

  function redact(value = "") {
    let text = safeText(value, "");

    if (!text) return "";

    try {
      text = redactTokenInText(text);
    } catch {}

    for (const name of TOKEN_PARAMS) {
      try {
        const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        text = text.replace(new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"), "$1***");
      } catch {}
    }

    try {
      text = text
        .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
        .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
        .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
        .replace(/(\/(?:2fa|otp|mfa)\/)([^/?#\s]+)/gi, "$1***")
        .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
        .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
    } catch {}

    return text;
  }

  function sanitize(value, depth = 0, seen = new WeakSet()) {
    if (depth > 6) return "[MaxDepth]";

    if (typeof value === "string") return redact(value);
    if (value === null || value === undefined) return value;
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "function") return "[Function]";

    if (value instanceof Error) {
      return {
        name: value.name || "Error",
        message: redact(value.message || ""),
        status: value.status || value.statusCode || value.response?.status || null,
        code: value.code || value.data?.code || value.response?.data?.code || null,
      };
    }

    if (Array.isArray(value)) {
      return value.slice(0, 80).map((item) => sanitize(item, depth + 1, seen));
    }

    if (isObject(value)) {
      try {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      } catch {}

      const output = {};

      for (const [key, item] of Object.entries(value).slice(0, 120)) {
        const lower = key.toLowerCase();

        if (
          lower.includes("token") ||
          lower.includes("secret") ||
          lower.includes("password") ||
          lower.includes("authorization") ||
          lower.includes("credential") ||
          lower.includes("jwt") ||
          lower.includes("bearer") ||
          lower.includes("otp") ||
          lower === "code"
        ) {
          output[key] = item ? "***" : item;
          continue;
        }

        output[key] = sanitize(item, depth + 1, seen);
      }

      return output;
    }

    return String(value);
  }

  function log(...args) {
    try {
      AppCore?.utils?.log?.("[Router]", ...args.map((item) => sanitize(item)));
    } catch {}
  }

  function warn(...args) {
    try {
      AppCore?.utils?.warn?.("[Router]", ...args.map((item) => sanitize(item)));
      return;
    } catch {}

    try {
      if (AppCore?.config?.debug) console.warn("[Router]", ...args.map((item) => sanitize(item)));
    } catch {}
  }

  function errorLog(...args) {
    try {
      AppCore?.utils?.error?.("[Router]", ...args.map((item) => sanitize(item)));
      return;
    } catch {}

    try {
      console.error("[Router]", ...args.map((item) => sanitize(item)));
    } catch {}
  }

  function emit(name, payload = {}, options = {}) {
    const eventName = safeText(name, "");
    if (!eventName) return false;

    const detail = sanitize({
      version: VERSION,
      source: SOURCE,
      at: iso(),
      ...safeObject(payload),
    });

    let emitted = false;
    let hasBus = false;

    try {
      if (isFn(AppCore?.events?.emit)) {
        hasBus = true;
        AppCore.events.emit(eventName, detail);
        emitted = true;
      }
    } catch {}

    if ((options.window === true || !hasBus) && isBrowser()) {
      try {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
        emitted = true;
      } catch {}
    }

    return emitted;
  }

  function onDom(target, event, handler, options = false) {
    if (!target || !event || !isFn(handler)) return () => {};

    try {
      target.addEventListener(event, handler, options);
      return () => {
        try {
          target.removeEventListener(event, handler, options);
        } catch {}
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
          try {
            AppCore?.events?.off?.(name, handler);
          } catch {}
        };
      }
    } catch {}

    return isBrowser()
      ? onDom(window, name, handler)
      : () => {};
  }

  function afterPaint(callback) {
    if (!isFn(callback)) return;

    if (!isBrowser()) {
      try {
        callback();
      } catch {}
      return;
    }

    try {
      requestAnimationFrame(() => requestAnimationFrame(callback));
    } catch {
      setTimeout(callback, 0);
    }
  }

  function origin() {
    if (isBrowser() && window.location?.origin) return window.location.origin;
    return "http://localhost";
  }

  function isHashRouterPath(value = "") {
    const text = safeText(value, "");
    return text.startsWith("#/") || text.startsWith("#!");
  }

  function normalizeHashRouterPath(value = "") {
    const text = safeText(value, "");
    if (!text) return "/";
    if (text.startsWith("#!")) return text.replace(/^#!\/?/, "/") || "/";
    return text.replace(/^#\/?/, "/") || "/";
  }

  function normalizePathname(pathname = "/") {
    let value = safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) value = `/${value}`;

    const stack = [];

    for (const part of value.split("/").filter(Boolean)) {
      if (part === ".") continue;
      if (part === "..") {
        stack.pop();
        continue;
      }
      stack.push(part);
    }

    value = `/${stack.join("/")}`;
    return value.length > 1 ? value.replace(/\/+$/g, "") : value;
  }

  function splitFullPath(value = "/") {
    let raw = safeText(value, "/");

    if (isHashRouterPath(raw)) {
      raw = normalizeHashRouterPath(raw);
    }

    let pathname = raw;
    let search = "";
    let hash = "";

    const hashIndex = pathname.indexOf("#");
    if (hashIndex >= 0) {
      hash = pathname.slice(hashIndex);
      pathname = pathname.slice(0, hashIndex) || "/";
    }

    const searchIndex = pathname.indexOf("?");
    if (searchIndex >= 0) {
      search = pathname.slice(searchIndex);
      pathname = pathname.slice(0, searchIndex) || "/";
    }

    return {
      pathname: normalizePathname(pathname),
      search: search ? (search.startsWith("?") ? search : `?${search}`) : "",
      hash: hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "",
    };
  }

  function toLocalPath(value = "/") {
    let raw = safeText(value, "/");

    if (isHashRouterPath(raw)) {
      return toLocalPath(normalizeHashRouterPath(raw));
    }

    try {
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
        const parsed = new URL(raw, origin());

        if (parsed.origin !== origin()) {
          return raw;
        }

        if (parsed.hash && isHashRouterPath(parsed.hash)) {
          return toLocalPath(normalizeHashRouterPath(parsed.hash));
        }

        raw = `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
      }
    } catch {}

    const { pathname, search, hash } = splitFullPath(raw);
    return `${pathname}${search}${hash}`;
  }

  function stripSearchAndHash(path = "/") {
    return splitFullPath(toLocalPath(path)).pathname;
  }

  function firstSegment(path = "/") {
    return splitFullPath(path).pathname.split("/").filter(Boolean)[0] || "";
  }

  function isUsernameSegment(value = "") {
    return /^@[A-Za-z0-9._-]{1,80}$/.test(safeText(value, ""));
  }

  function localStripUsername(path = "/") {
    const { pathname, search, hash } = splitFullPath(path);
    const segments = pathname.split("/").filter(Boolean);

    if (segments.length && isUsernameSegment(segments[0])) {
      const rest = segments.slice(1).join("/");
      return `${rest ? normalizePathname(`/${rest}`) : "/"}${search}${hash}`;
    }

    return `${pathname}${search}${hash}`;
  }

  function localExtractUsername(path = "/") {
    const segment = firstSegment(path);
    return isUsernameSegment(segment) ? segment.slice(1) : "";
  }

  function applyAlias(path = "/") {
    const { pathname, search, hash } = splitFullPath(path);

    try {
      const alias = resolveRouteAlias(pathname);
      return `${normalizePathname(alias || pathname)}${search}${hash}`;
    } catch {
      return `${pathname}${search}${hash}`;
    }
  }

  function collapseTechnical(path = "/") {
    const { pathname, search, hash } = splitFullPath(path);

    for (const base of TECHNICAL_BASES) {
      if (pathname === base || pathname.startsWith(`${base}/`)) {
        return `${base}${search}${hash}`;
      }
    }

    return `${pathname}${search}${hash}`;
  }

  function hrefIsUnsafe(href = "") {
    try {
      return Boolean(isUnsafeHref(href));
    } catch {
      const text = safeText(href, "");
      return Boolean(
        !text ||
        text.startsWith("//") ||
        /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text) ||
        /[\r\n\t]/.test(text)
      );
    }
  }

  function hrefIsExternal(href = "") {
    try {
      return Boolean(isExternalHref(href));
    } catch {
      try {
        return new URL(href, origin()).origin !== origin();
      } catch {
        return false;
      }
    }
  }

  function hrefIsHashOnly(href = "") {
    try {
      return Boolean(isHashOnlyHref(href));
    } catch {
      return safeText(href, "").startsWith("#") && !isHashRouterPath(href);
    }
  }

  function resolveHref(href = "/") {
    const raw = safeText(href, "/");

    if (hrefIsUnsafe(raw)) return "/";
    if (hrefIsExternal(raw)) return raw;
    if (hrefIsHashOnly(raw)) return raw;

    return callCoreHelper(resolveSpaHrefHelper, raw) || raw;
  }

  function normalizePublicPathLocal(path = "/") {
    const href = resolveHref(path);

    if (hrefIsExternal(href) || hrefIsUnsafe(href)) return "/";

    return toLocalPath(href);
  }

  function normalizeCanonicalPathLocal(path = "/") {
    const publicPath = normalizePublicPathLocal(path);
    let canonical = localStripUsername(publicPath);

    canonical = collapseTechnical(canonical);
    canonical = applyAlias(canonical);
    canonical = collapseTechnical(canonical);

    let helperCanonical = callCoreHelper(normalizeCanonicalPathHelper, publicPath);
    if (helperCanonical) {
      helperCanonical = collapseTechnical(applyAlias(localStripUsername(helperCanonical)));
    }

    const localClean = stripSearchAndHash(canonical);
    const helperClean = helperCanonical ? stripSearchAndHash(helperCanonical) : "";

    if (localExtractUsername(publicPath) && helperClean === "/" && localClean !== "/") {
      return localClean;
    }

    return helperClean || localClean || "/";
  }

  function currentBrowserPath() {
    if (!isBrowser()) return "/";

    try {
      const { pathname, search, hash } = window.location;

      if (hash && isHashRouterPath(hash)) {
        return toLocalPath(normalizeHashRouterPath(hash));
      }

      return toLocalPath(`${pathname || "/"}${search || ""}${hash || ""}`);
    } catch {
      return "/";
    }
  }

  function currentPublicPath() {
    return (
      callCoreHelper(getCurrentPublicPathHelper) ||
      AppCore?.state?.publicPath ||
      currentBrowserPath()
    );
  }

  function currentCanonicalPath() {
    return (
      callCoreHelper(getCurrentCanonicalPathHelper) ||
      AppCore?.state?.canonicalPath ||
      AppCore?.state?.route ||
      normalizeCanonicalPathLocal(currentPublicPath())
    );
  }

  function currentPath() {
    return callCoreHelper(getCurrentPathHelper) || currentPublicPath();
  }

  function usernameFor(path = "/") {
    return (
      callCoreHelper(extractUsernameFromPathHelper, path) ||
      localExtractUsername(path) ||
      callCoreHelper(getCurrentResolvedUsername) ||
      callCoreHelper(getCurrentUsername) ||
      AppCore?.state?.user?.slug ||
      AppCore?.state?.user?.username ||
      ""
    );
  }

  function isPublicAuthPath(path = "/") {
    const clean = normalizeCanonicalPathLocal(path);

    if (PUBLIC_PATHS.has(clean)) return true;

    for (const item of PUBLIC_PATHS) {
      if (clean.startsWith(`${item}/`)) return true;
    }

    return false;
  }

  function technicalBaseFor(path = "/") {
    const clean = normalizeCanonicalPathLocal(path);

    for (const base of TECHNICAL_BASES) {
      if (clean === base || clean.startsWith(`${base}/`)) return base;
    }

    return "";
  }

  function routeClean(path = "/") {
    return stripSearchAndHash(path);
  }

  function getRouteMatch(path = "/") {
    const canonical = normalizeCanonicalPathLocal(path);
    const clean = routeClean(canonical);

    const exact = routes.find((route) => routeClean(route?.path) === clean);
    if (exact) {
      return {
        route: exact,
        canonicalPath: routeClean(exact.path),
        rawCanonicalPath: clean,
        matchedBy: "exact",
      };
    }

    const aliased = routeClean(applyAlias(clean));
    if (aliased !== clean) {
      const aliasMatch = routes.find((route) => routeClean(route?.path) === aliased);
      if (aliasMatch) {
        return {
          route: aliasMatch,
          canonicalPath: routeClean(aliasMatch.path),
          rawCanonicalPath: clean,
          matchedBy: "alias",
        };
      }
    }

    const technical = technicalBaseFor(clean);
    if (technical) {
      const technicalMatch = routes.find((route) => routeClean(route?.path) === technical);
      if (technicalMatch) {
        return {
          route: technicalMatch,
          canonicalPath: routeClean(technicalMatch.path),
          rawCanonicalPath: clean,
          matchedBy: "technical",
        };
      }
    }

    for (const route of routes) {
      const aliases = safeArray(route?.aliases).map((alias) => routeClean(applyAlias(alias)));

      if (aliases.includes(clean)) {
        return {
          route,
          canonicalPath: routeClean(route.path || clean),
          rawCanonicalPath: clean,
          matchedBy: "route.aliases",
        };
      }

      try {
        if (isFn(route?.match) && route.match(clean)) {
          return {
            route,
            canonicalPath: routeClean(route.path || clean),
            rawCanonicalPath: clean,
            matchedBy: "route.match",
          };
        }
      } catch {}

      try {
        if (route?.pattern instanceof RegExp && route.pattern.test(clean)) {
          return {
            route,
            canonicalPath: routeClean(route.path || clean),
            rawCanonicalPath: clean,
            matchedBy: "route.pattern",
          };
        }
      } catch {}
    }

    return {
      route: null,
      canonicalPath: clean || "/",
      rawCanonicalPath: clean || "/",
      matchedBy: "none",
    };
  }

  function getRoute(path = "/") {
    return getRouteMatch(path).route;
  }

  function routeExists(path = "/") {
    return Boolean(getRoute(path));
  }

  function canUsePublicSlugForRoute(route) {
    if (!route) return false;

    const path = routeClean(route.path || "/");

    if (path === LOGIN_PATH || isPublicAuthPath(path)) return false;

    if (
      route.hideShell === true ||
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

  function shouldPreservePublicPath(options = {}) {
    return Boolean(
      options.preservePublicPath === true ||
      options.preservePath === true ||
      options.preserveUrl === true ||
      options.protectedInitialUrl === true ||
      options.initialRender === true ||
      options.skipHistory === true
    );
  }

  function getRequestedData(path = "/", options = {}) {
    const opts = safeObject(options);

    const explicitPublic = opts.publicPath || opts.requestedPath || "";
    const publicPath = normalizePublicPathLocal(explicitPublic || path || "/");

    const canonicalSeed = opts.canonicalPath || opts.route?.path || publicPath;
    let match = getRouteMatch(canonicalSeed);

    let route = match.route;
    let canonicalPath = match.canonicalPath;
    let rawCanonicalPath = match.rawCanonicalPath;

    const username = usernameFor(publicPath || canonicalPath);

    let finalPublicPath = publicPath || canonicalPath || "/";

    if (route && canUsePublicSlugForRoute(route) && !shouldPreservePublicPath(opts)) {
      const built = callCoreHelper(
        buildPublicPathHelper,
        getRoute,
        canonicalPath,
        {
          username,
          resolvedUsername: username,
          fromPath: finalPublicPath,
          publicPath: finalPublicPath,
          canonicalPath,
        }
      );

      finalPublicPath = normalizePublicPathLocal(built || finalPublicPath);
    }

    if (
      route &&
      (match.matchedBy === "alias" || match.matchedBy === "technical" || match.matchedBy === "route.aliases")
    ) {
      finalPublicPath = normalizePublicPathLocal(explicitPublic || path || finalPublicPath);
    }

    if (!route && localExtractUsername(finalPublicPath)) {
      const repairedCanonical = normalizeCanonicalPathLocal(finalPublicPath);
      const repaired = getRouteMatch(repairedCanonical);

      if (repaired.route) {
        match = repaired;
        route = repaired.route;
        canonicalPath = repaired.canonicalPath;
        rawCanonicalPath = repaired.rawCanonicalPath;
      }
    }

    return {
      requestedPath: normalizePublicPathLocal(path || finalPublicPath),
      canonicalPath: routeClean(canonicalPath || "/"),
      rawCanonicalPath: routeClean(rawCanonicalPath || canonicalPath || "/"),
      publicPath: finalPublicPath,
      route,
      username: username || null,
      matchedBy: match.matchedBy,
    };
  }

  function getDefaultHome() {
    const names = callCoreHelper(getRouteNames) || {};
    const home = names.HOME || HOME_PATH || "/";
    const username = usernameFor(home);

    const built = callCoreHelper(
      buildPublicPathHelper,
      getRoute,
      home,
      {
        username,
        resolvedUsername: username,
      }
    );

    return normalizePublicPathLocal(built || home || "/");
  }

  function resolveSafeRedirect(value = "") {
    const raw = safeText(value, "");
    if (!raw || hrefIsUnsafe(raw) || hrefIsExternal(raw)) return "";

    const path = normalizePublicPathLocal(raw);
    const canonical = normalizeCanonicalPathLocal(path);

    if (canonical === LOGIN_PATH || isPublicAuthPath(canonical)) return "";

    return path;
  }

  function isAuthenticated() {
    try {
      return Boolean(Auth?.isAuthenticated?.());
    } catch {
      return Boolean(AppCore?.state?.authenticated);
    }
  }

  function setState(patch = {}) {
    try {
      AppCore?.setState?.(
        patch,
        {
          source: SOURCE,
          emit: false,
          emitState: false,
          silent: true,
        }
      );
    } catch {
      try {
        Object.assign(AppCore.state, patch);
      } catch {}
    }
  }

  function syncState({ canonicalPath = "/", publicPath = "/", username = null } = {}) {
    const canonical = routeClean(normalizeCanonicalPathLocal(canonicalPath || "/"));
    const publicValue = normalizePublicPathLocal(publicPath || canonical);

    try {
      AppCore?.setRoute?.(canonical);
    } catch {}

    try {
      AppCore?.setPublicPath?.(publicValue);
    } catch {}

    setState({
      route: canonical,
      canonicalPath: canonical,
      publicPath: publicValue,
      currentResolvedUsername: username || null,
    });

    lastRenderedCanonicalPath = canonical;
    lastRenderedPublicPath = publicValue;
    lastRenderedAt = now();

    return {
      canonicalPath: canonical,
      publicPath: publicValue,
      username: username || null,
    };
  }

  function currentComparable() {
    const canonical = routeClean(
      normalizeCanonicalPathLocal(
        currentCanonicalPath() ||
          AppCore?.state?.route ||
          lastRenderedCanonicalPath ||
          "/"
      )
    );

    const publicPath = normalizePublicPathLocal(
      currentPublicPath() ||
        AppCore?.state?.publicPath ||
        lastRenderedPublicPath ||
        canonical
    );

    return { canonical, publicPath };
  }

  function setFlag(name, value = true) {
    if (!name) return;
    setState({ [name]: Boolean(value) });
  }

  function shouldSkipHistory(options = {}) {
    return Boolean(
      options.skipHistory === true ||
      options.protectedInitialUrl === true ||
      (options.initialRender === true && options.preserveUrl === true)
    );
  }

  function historyOptions(options = {}, data = {}) {
    return {
      ...safeObject(options),
      username: data.username || null,
      resolvedUsername: data.username || null,
      canonicalPath: data.canonicalPath,
      rawCanonicalPath: data.rawCanonicalPath,
      publicPath: data.publicPath,
      requestedPath: data.requestedPath,
      fromPath: data.requestedPath || data.publicPath,
      preservePath: Boolean(
        options.preservePath ||
          options.preservePublicPath ||
          options.preserveUrl ||
          options.protectedInitialUrl
      ),
      skipHistory: shouldSkipHistory(options),
      protectedInitialUrl: options.protectedInitialUrl === true,
    };
  }

  function isBurst(key = "") {
    return Boolean(key && key === lastNavKey && now() - lastNavAt < 160);
  }

  function rememberNav(key = "") {
    lastNavKey = String(key || "");
    lastNavAt = now();
  }

  function query(selectors = []) {
    if (!isBrowser()) return null;

    for (const selector of safeArray(selectors)) {
      try {
        const el = selector.startsWith("#")
          ? document.getElementById(selector.slice(1))
          : document.querySelector(selector);

        if (el) return el;
      } catch {}
    }

    return null;
  }

  function dom() {
    if (!isBrowser()) return {};

    const result = {
      html: document.documentElement,
      body: document.body,
      shell: AppCore?.dom?.appShell || AppCore?.dom?.shell || query(["#app-shell", "[data-app-shell]", ".app-shell"]),
      main: AppCore?.dom?.mainContent || AppCore?.dom?.main || query(["#main-content", "main[role='main']", "main"]),
      appContent: AppCore?.dom?.appContent || query(["#app-content", "[data-app-content]"]),
      view: AppCore?.dom?.viewContainer || query(["#view-container", "[data-router-view]", "[data-view-container]"]),
      sidebarMount: AppCore?.dom?.sidebarMount || query(["#sidebar-mount", "[data-sidebar-mount]"]),
      topbarMount: AppCore?.dom?.topbarMount || query(["#topbar-mount", "[data-topbar-mount]"]),
      sidebar: AppCore?.dom?.sidebar || query(["#app-sidebar", "#sidebar", "[data-sidebar-root]", ".sidebar"]),
      topbar: AppCore?.dom?.topbar || query(["#app-topbar", "#topbar", "[data-topbar-root]", ".topbar"]),
      tablehead: AppCore?.dom?.tablehead || query(["#table-head", "[data-tablehead]", ".table-head"]),
      tableheadContainer: AppCore?.dom?.tableheadContainer || query(["#tablehead-container", "[data-tablehead-container]"]),
      loader: AppCore?.dom?.loader || query(["#app-loader", "[data-app-loader]", ".app-loader"]),
    };

    try {
      if (AppCore?.dom) Object.assign(AppCore.dom, result);
    } catch {}

    return result;
  }

  function setHidden(el, hidden) {
    if (!el) return;

    try {
      el.hidden = Boolean(hidden);
    } catch {}

    try {
      el.setAttribute("aria-hidden", hidden ? "true" : "false");
    } catch {}
  }

  function setBusy(el, busy) {
    try {
      el?.setAttribute?.("aria-busy", busy ? "true" : "false");
    } catch {}
  }

  function tableheadHasContent(container) {
    if (!container) return false;

    try {
      if (container.childElementCount > 0) return true;
    } catch {}

    try {
      return Boolean(safeText(container.textContent, ""));
    } catch {
      return false;
    }
  }

  function routeHidesShell(route, canonicalPath = "/") {
    const canonical = routeClean(canonicalPath || route?.path || "/");

    return Boolean(
      isPublicAuthPath(canonical) ||
        route?.shell === false ||
        route?.hideShell === true ||
        route?.showShell === false ||
        route?.layout === "auth" ||
        route?.layout === "public" ||
        route?.meta?.layout === "auth" ||
        route?.meta?.layout === "public"
    );
  }

  function hideLoader(reason = "router") {
    const { html, body, loader } = dom();

    try {
      html?.classList?.remove?.("app-loading");
      body?.classList?.remove?.("app-loading", "loading");
    } catch {}

    if (!loader) return false;

    try {
      loader.classList.remove("is-visible", "is-entering", "is-leaving", "app-loader--visible");
      loader.classList.add("is-hidden", "has-hidden");
      loader.setAttribute("aria-hidden", "true");
      loader.setAttribute("aria-busy", "false");
      loader.dataset.loaderVisible = "false";
      loader.dataset.loaderState = "hidden";
      loader.hidden = true;
    } catch {}

    emit(EVENTS.loaderHidden, { reason });
    return true;
  }

  function repairShell({
    route = null,
    canonicalPath = "/",
    publicPath = "/",
    phase = "router",
    hideLoading = false,
  } = {}) {
    if (!isBrowser()) return false;

    if (shellRepairDepth > 4) return false;
    shellRepairDepth += 1;

    try {
      const d = dom();
      const hiddenChrome = routeHidesShell(route, canonicalPath);

      try {
        d.html?.classList?.remove?.("app-booting", "app-loading");
        d.body?.classList?.remove?.("app-booting", "app-loading", "loading");
        d.html?.classList?.add?.("app-ready");
        d.body?.classList?.add?.("app-ready");
      } catch {}

      for (const root of [d.html, d.body]) {
        if (!root) continue;

        try {
          root.dataset.routeMode = hiddenChrome ? "auth" : "app";
          root.dataset.chrome = hiddenChrome ? "hidden" : "visible";
          root.dataset.shell = "visible";

          root.classList.toggle("route-auth", hiddenChrome);
          root.classList.toggle("route-app", !hiddenChrome);
          root.classList.toggle("route-shell-hidden", hiddenChrome);
          root.classList.toggle("route-shell-visible", !hiddenChrome);
          root.classList.toggle("route-chrome-hidden", hiddenChrome);
          root.classList.toggle("route-chrome-visible", !hiddenChrome);
          root.classList.toggle("auth-screen", hiddenChrome && root === d.body);
        } catch {}
      }

      for (const el of [d.shell, d.main, d.appContent, d.view]) {
        setHidden(el, false);
        setBusy(el, false);
      }

      for (const el of [d.sidebarMount, d.topbarMount, d.sidebar, d.topbar]) {
        setHidden(el, hiddenChrome);
        setBusy(el, false);
      }

      const hasTablehead = !hiddenChrome && tableheadHasContent(d.tableheadContainer);
      setHidden(d.tablehead, !hasTablehead);
      setHidden(d.tableheadContainer, !hasTablehead);

      setState({
        shellVisible: !hiddenChrome,
        chromeVisible: !hiddenChrome,
        appShellVisible: true,
        routeShellHidden: hiddenChrome,
        shellHidden: hiddenChrome,
        authScreen: hiddenChrome,
        routeMode: hiddenChrome ? "auth" : "app",
      });

      if (hideLoading) hideLoader(`router:${phase}`);

      emit(EVENTS.shellState, {
        phase,
        shellHidden: hiddenChrome,
        canonicalPath,
        publicPath,
        routePath: route?.path || null,
        routeName: route?.name || null,
        viewKey: route?.viewKey || null,
        viewName: route?.viewName || null,
      });

      return true;
    } finally {
      shellRepairDepth = Math.max(0, shellRepairDepth - 1);
    }
  }

  function scheduleRepair(payload = {}) {
    const seq = renderSeq;

    afterPaint(() => {
      if (seq !== renderSeq) return;
      repairShell({ ...payload, phase: `${payload.phase || "post-render"}:after-paint`, hideLoading: true });
    });
  }

  function repairCurrentRoute(phase = "external-repair") {
    const data = getRequestedData(currentBrowserPath(), {
      preservePublicPath: true,
      preserveUrl: true,
    });

    return repairShell({
      route: data.route,
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
      phase,
      hideLoading: true,
    });
  }

  function destroyActiveView() {
    if (!activeView) return false;

    try {
      activeView.destroy?.();
    } catch (error) {
      warn("view destroy failed", error);
    }

    activeView = null;
    return true;
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

      return isObject(access)
        ? { allowed: access.allowed !== false, ...access }
        : { allowed: true };
    } catch (error) {
      errorLog("guard failed", { canonicalPath, publicPath, error });

      return {
        allowed: false,
        reason: "guard-error",
        error,
      };
    }
  }

  function stale(seq, reason = "stale-render") {
    const payload = {
      ok: false,
      skipped: true,
      stale: true,
      reason,
      token: seq,
      currentToken: renderSeq,
    };

    emit(EVENTS.renderStale, payload);
    return payload;
  }

  function isLatest(seq) {
    return Boolean(seq && seq === renderSeq);
  }

  async function renderRedirect(target, options = {}) {
    const data = getRequestedData(target || getDefaultHome(), {
      ...safeObject(options),
      preservePublicPath: true,
      preserveUrl: true,
    });

    emit(EVENTS.internalRedirect, {
      target,
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
    });

    return executeRender(data.publicPath, {
      ...safeObject(options),
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
      requestedPath: data.requestedPath,
      force: true,
      forceRender: true,
      replaceState: options.replaceState !== false,
      source: options.source || "internal-redirect",
    }, renderSeq);
  }

  async function handleDenied({ access, data, seq }) {
    const reason = access?.reason || "blocked";
    const { route, canonicalPath, rawCanonicalPath, publicPath, username } = data;

    if (!isLatest(seq)) return stale(seq, "guard-stale");

    if (reason === "not-authenticated") {
      destroyActiveView();

      const loginPublicPath = normalizePublicPathLocal(access.redirectTo || LOGIN_PATH);

      await renderLoginRedirect({
        AppCore,
        getRoute,
        updateHistory,
        canonicalPath,
        publicPath,
        redirectTo: loginPublicPath,
        clearDynamicContainers: () => clearDynamicContainers(AppCore),
        setActiveMenu: (path) => setActiveMenu(AppCore, path),
        setShellMode: (nextRoute) => setShellMode(AppCore, nextRoute),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });

      if (!isLatest(seq)) return stale(seq, "login-redirect-stale");

      const synced = syncState({
        canonicalPath: LOGIN_PATH,
        publicPath: loginPublicPath,
        username: null,
      });

      repairShell({
        route: getRoute(LOGIN_PATH),
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        phase: "guard:not-authenticated",
        hideLoading: true,
      });

      emit(EVENTS.rendered, {
        found: true,
        forbidden: false,
        redirected: true,
        reason,
        canonicalPath: synced.canonicalPath,
        rawCanonicalPath,
        publicPath: synced.publicPath,
        redirectedFrom: canonicalPath,
        token: seq,
      });

      return { ok: true, handled: true, redirected: true, reason };
    }

    if (reason === "already-authenticated") {
      return renderRedirect(access.redirectTo || getDefaultHome(), {
        replaceState: true,
        force: true,
        forceRender: true,
        source: "guard:already-authenticated",
      });
    }

    destroyActiveView();
    clearDynamicContainers(AppCore);

    renderRouteForbidden({
      AppCore,
      getRoute,
      updateHistory,
      route,
      requestedPath: publicPath,
      canonicalPath,
      requestedUsername: username,
      setShellMode: (nextRoute) => setShellMode(AppCore, nextRoute),
      setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
    });

    if (!isLatest(seq)) return stale(seq, "forbidden-stale");

    const synced = syncState({ canonicalPath, publicPath, username });

    repairShell({
      route,
      canonicalPath: synced.canonicalPath,
      publicPath: synced.publicPath,
      phase: `guard:${reason}`,
      hideLoading: true,
    });

    emit(EVENTS.rendered, {
      found: true,
      forbidden: true,
      reason,
      canonicalPath: synced.canonicalPath,
      rawCanonicalPath,
      publicPath: synced.publicPath,
      username: synced.username,
      token: seq,
    });

    return { ok: true, handled: true, forbidden: true, reason };
  }

  async function executeRender(path = "/", options = {}, seq = 0) {
    if (!isLatest(seq)) return stale(seq, "execute-start-stale");

    const startedAt = now();
    const data = getRequestedData(path, options);
    const {
      requestedPath,
      canonicalPath,
      rawCanonicalPath,
      publicPath,
      route,
      username,
      matchedBy,
    } = data;

    const histOptions = historyOptions(options, data);

    emitBeforeRender(AppCore, {
      path: publicPath,
      requestedPath,
      canonicalPath,
      rawCanonicalPath,
      publicPath,
      username,
      route,
      matchedBy,
      token: seq,
      options: histOptions,
    });

    repairShell({
      route,
      canonicalPath,
      publicPath,
      phase: "before-render",
      hideLoading: false,
    });

    if (!isLatest(seq)) return stale(seq, "before-render-stale");

    if (!route) {
      destroyActiveView();
      clearDynamicContainers(AppCore);
      setActiveMenu(AppCore, canonicalPath);

      renderRouteNotFound({
        AppCore,
        getRoute,
        updateHistory,
        requestedPath: publicPath,
        canonicalPath,
        requestedUsername: username,
        setShellMode: (nextRoute) => setShellMode(AppCore, nextRoute),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });

      if (!isLatest(seq)) return stale(seq, "not-found-stale");

      const synced = syncState({ canonicalPath, publicPath, username });

      repairShell({
        route: null,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        phase: "not-found",
        hideLoading: true,
      });

      setFlag("initialRouteRendered", true);

      emit(EVENTS.rendered, {
        found: false,
        forbidden: false,
        canonicalPath: synced.canonicalPath,
        rawCanonicalPath,
        publicPath: synced.publicPath,
        username: synced.username,
        matchedBy,
        durationMs: Math.round(now() - startedAt),
        token: seq,
      });

      return {
        ok: true,
        found: false,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        token: seq,
      };
    }

    const access = accessDecision(route, canonicalPath, publicPath);

    if (!access.allowed) {
      const denied = await handleDenied({ access, data, seq });
      if (denied?.handled || denied?.stale) {
        setFlag("initialRouteRendered", true);
        return denied;
      }
    }

    if (!isLatest(seq)) return stale(seq, "after-guards-stale");

    clearDynamicContainers(AppCore);
    setActiveMenu(AppCore, canonicalPath);

    repairShell({
      route,
      canonicalPath,
      publicPath,
      phase: "after-ui-prep",
      hideLoading: false,
    });

    if (!shouldSkipHistory(histOptions)) {
      updateHistory({
        AppCore,
        getRoute,
        pathname: publicPath,
        options: histOptions,
      });
    }

    try {
      destroyActiveView();

      const view = await Promise.resolve(
        renderRouteSuccess({
          AppCore,
          route,
          requestedPath: publicPath,
          canonicalPath,
          requestedUsername: username,
          getRoute,
          setShellMode: (nextRoute) => setShellMode(AppCore, nextRoute),
          setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
        })
      );

      if (!isLatest(seq)) {
        try {
          view?.destroy?.();
        } catch {}
        return stale(seq, "after-view-render-stale");
      }

      activeView = view || null;

      const synced = syncState({ canonicalPath, publicPath, username });

      if (synced.canonicalPath !== LOGIN_PATH) {
        setFlag("loginNavigationHandled", false);
      }

      setFlag("initialRouteRendered", true);
      setFlag("bootNavigationHandled", true);

      repairShell({
        route,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        phase: "render-success",
        hideLoading: true,
      });

      scheduleRepair({
        route,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        phase: "render-success",
      });

      emit(EVENTS.rendered, {
        found: true,
        forbidden: false,
        canonicalPath: synced.canonicalPath,
        rawCanonicalPath,
        publicPath: synced.publicPath,
        username: synced.username,
        matchedBy,
        routePath: route?.path || null,
        routeName: route?.name || null,
        viewKey: route?.viewKey || null,
        viewName: route?.viewName || null,
        durationMs: Math.round(now() - startedAt),
        token: seq,
      });

      log("render ok", synced);

      return {
        ok: true,
        found: true,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        token: seq,
      };
    } catch (err) {
      destroyActiveView();

      if (!isLatest(seq)) return stale(seq, "runtime-error-stale");

      renderRouteRuntimeError({
        AppCore,
        getRoute,
        route,
        error: err,
        requestedPath: publicPath,
        canonicalPath,
        requestedUsername: username,
        setShellMode: (nextRoute) => setShellMode(AppCore, nextRoute),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });

      const synced = syncState({ canonicalPath, publicPath, username });

      repairShell({
        route,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        phase: "runtime-error",
        hideLoading: true,
      });

      emit(EVENTS.renderError, {
        error: err,
        message: err?.message || String(err),
        canonicalPath: synced.canonicalPath,
        rawCanonicalPath,
        publicPath: synced.publicPath,
        token: seq,
      });

      errorLog("render error", err);

      return {
        ok: false,
        error: err,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        token: seq,
      };
    }
  }

  function render(path = "/", options = {}) {
    const seq = ++renderSeq;

    renderQueue = renderQueue
      .catch((err) => warn("render queue recovered", err))
      .then(() => executeRender(path, safeObject(options), seq));

    return renderQueue;
  }

  function noop(reason, data = {}) {
    log("navigation skipped", { reason, canonicalPath: data.canonicalPath, publicPath: data.publicPath });

    return Promise.resolve({
      ok: true,
      skipped: true,
      reason,
      canonicalPath: data.canonicalPath || null,
      publicPath: data.publicPath || null,
    });
  }

  function navigate(path = "/", options = {}) {
    const opts = safeObject(options);
    const raw = safeText(path, "/");

    if (hrefIsUnsafe(raw)) return noop("unsafe-href");
    if (hrefIsExternal(raw)) return noop("external-href");
    if (hrefIsHashOnly(raw)) return noop("hash-only");

    const data = getRequestedData(raw, opts);
    const key = `${data.publicPath}|${data.canonicalPath}`;
    const current = currentComparable();

    const same = current.canonical === data.canonicalPath && current.publicPath === data.publicPath;
    const hasRendered = Boolean(activeView || lastRenderedCanonicalPath || AppCore?.state?.initialRouteRendered);

    if (hasRendered && same && opts.forceRender !== true) {
      if (opts.force === true && isBurst(key)) return noop("duplicate-force-burst", data);

      if (opts.force !== true) {
        repairShell({
          route: data.route,
          canonicalPath: data.canonicalPath,
          publicPath: data.publicPath,
          phase: "same-route",
          hideLoading: true,
        });

        return noop("same-route", data);
      }
    }

    if (isBurst(key) && opts.force !== true && opts.forceRender !== true && opts.allowBurst !== true) {
      return noop("burst", data);
    }

    rememberNav(key);

    if (
      (current.canonical === LOGIN_PATH && data.canonicalPath !== LOGIN_PATH && isAuthenticated()) ||
      opts.source === "login" ||
      opts.fromLogin === true
    ) {
      setFlag("loginNavigationHandled", true);
    }

    repairShell({
      route: data.route,
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
      phase: "navigate",
      hideLoading: false,
    });

    return render(data.publicPath, {
      ...opts,
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
      requestedPath: data.requestedPath,
    });
  }

  function replace(path = "/", options = {}) {
    return navigate(path, {
      ...safeObject(options),
      replaceState: true,
    });
  }

  function goAfterLogin(fallback = "/", options = {}) {
    let redirect = "";

    try {
      redirect = new URL(window.location.href).searchParams.get("redirect") || "";
    } catch {}

    const target = resolveSafeRedirect(redirect) || fallback || getDefaultHome();

    return navigate(target, {
      replaceState: options.replaceState !== false,
      force: options.force !== false,
      forceRender: options.forceRender !== false,
      source: options.source || "login",
      fromLogin: true,
    });
  }

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

    if (!href || target === "_blank" || hrefIsHashOnly(href) || hrefIsExternal(href)) return;

    event.preventDefault();

    if (hrefIsUnsafe(href)) return;

    try {
      event.__onionRouterHandled = true;
    } catch {}

    navigate(href, { source: "link-click" });
  }

  function onPopstate() {
    const data = getRequestedData(currentBrowserPath(), {
      preservePublicPath: true,
      preserveUrl: true,
      source: "popstate",
    });

    render(data.publicPath, {
      skipHistory: true,
      replaceState: true,
      force: true,
      forceRender: true,
      preservePublicPath: true,
      preserveUrl: true,
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
      requestedPath: data.requestedPath,
      source: "popstate",
    });
  }

  function eventDetail(eventOrPayload = {}) {
    if (isObject(eventOrPayload?.detail)) return eventOrPayload.detail;
    if (isObject(eventOrPayload?.payload)) return eventOrPayload.payload;
    if (isObject(eventOrPayload)) return eventOrPayload;
    return {};
  }

  function shouldSkipExternalRepair(detail = {}, eventType = "") {
    const source = safeText(detail.source, "");

    if (source === SOURCE || source === "router" || source === "router.index") return true;
    if (shellRepairDepth > 0 || externalRepairInFlight) return true;

    const current = currentComparable();
    const phase = safeText(detail.reason || detail.phase || eventType || "external-repair", "external-repair");
    const key = `${phase}|${current.canonical}|${current.publicPath}|${source}`;
    const stamp = now();

    if (key === lastExternalRepairKey && stamp - lastExternalRepairAt < 140) return true;

    lastExternalRepairKey = key;
    lastExternalRepairAt = stamp;

    return false;
  }

  function onExternalRepair(event = null) {
    const detail = eventDetail(event);
    const eventType = safeText(event?.type, "");

    if (shouldSkipExternalRepair(detail, eventType)) return;

    externalRepairInFlight = true;

    try {
      repairCurrentRoute(detail.reason || detail.phase || eventType || "external-repair");
    } finally {
      externalRepairInFlight = false;
    }
  }

  function onAuthReady(event = null) {
    const stamp = now();

    if (authReadyInFlight || stamp - lastAuthReadyAt < 180) return;

    authReadyInFlight = true;
    lastAuthReadyAt = stamp;

    try {
      const current = currentComparable();

      repairCurrentRoute(event?.type || "auth-ready");

      if (current.canonical === LOGIN_PATH && isAuthenticated()) {
        goAfterLogin("/");
      }
    } finally {
      authReadyInFlight = false;
    }
  }

  function attachToAppCore() {
    try {
      AppCore.Router = api;
      AppCore.router = api;
    } catch {}

    try {
      AppCore?.modules?.register?.("Router", api, {
        overwrite: true,
        replace: true,
        aliases: ["router"],
        source: SOURCE,
      });

      AppCore?.modules?.register?.("router", api, {
        overwrite: true,
        replace: true,
        aliases: ["Router"],
        source: SOURCE,
      });
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
    configured = true;
    attachToAppCore();

    emit(EVENTS.configured, {
      options: safeObject(options),
    });

    return api;
  }

  function bind() {
    if (bound) return api;

    validateRoutesTable(AppCore, routes, normalizeCanonicalPathHelper);
    attachToAppCore();

    bound = true;

    if (isBrowser()) {
      disposers.push(onDom(document, "click", onClick));
      disposers.push(onDom(window, "popstate", onPopstate));

      [
        "auth:login:success",
        "auth:session:applied",
        "auth:session:restored",
        "app:session:restored",
        "app:auth:ready",
      ].forEach((name) => disposers.push(onEvent(name, onAuthReady)));

      [
        "app:user:change",
        "auth:logout:success",
        "app:session:cleared",
        "app:ui:repair-request",
      ].forEach((name) => disposers.push(onEvent(name, onExternalRepair)));
    }

    ensureInitialHistoryState({ AppCore });

    emit(EVENTS.bound, {
      routes: routes.map((route) => route.path),
    });

    log("ready");
    return api;
  }

  function unbind() {
    if (!bound) return api;

    while (disposers.length) {
      try {
        disposers.pop()?.();
      } catch {}
    }

    destroyActiveView();
    bound = false;

    emit(EVENTS.unbound);
    return api;
  }

  function elementSnapshot(el) {
    if (!el) return { exists: false };

    return {
      exists: true,
      id: safeText(el.id, ""),
      tag: safeText(el.tagName?.toLowerCase?.(), ""),
      hidden: Boolean(el.hidden),
      ariaHidden: safeText(el.getAttribute?.("aria-hidden"), ""),
      ariaBusy: safeText(el.getAttribute?.("aria-busy"), ""),
      className: safeText(el.className?.baseVal || el.className, ""),
      dataset: {
        shell: safeText(el.dataset?.shell, ""),
        chrome: safeText(el.dataset?.chrome, ""),
        routeMode: safeText(el.dataset?.routeMode, ""),
        loaderState: safeText(el.dataset?.loaderState, ""),
      },
    };
  }

  function getSnapshot() {
    const d = dom();

    let routeSnapshot = [];

    try {
      routeSnapshot = isFn(getRoutesSnapshot)
        ? getRoutesSnapshot()
        : routes;
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

      route: AppCore?.state?.route || "/",
      canonicalPath: AppCore?.state?.canonicalPath || AppCore?.state?.route || "/",
      publicPath: AppCore?.state?.publicPath || "/",

      browserPath: currentBrowserPath(),
      browserCanonicalPath: normalizeCanonicalPathLocal(currentBrowserPath()),

      lastNavKey,
      lastNavAt,
      lastNavAtIso: lastNavAt ? iso(lastNavAt) : "",

      lastRenderedCanonicalPath,
      lastRenderedPublicPath,
      lastRenderedAt,
      lastRenderedAtIso: lastRenderedAt ? iso(lastRenderedAt) : "",

      shellRepairDepth,
      externalRepairInFlight,
      authReadyInFlight,

      authenticated: isAuthenticated(),

      routes: routeSnapshot,

      dom: {
        bodyClasses: d.body?.className || "",
        htmlClasses: d.html?.className || "",
        bodyRouteMode: d.body?.dataset?.routeMode || null,
        htmlRouteMode: d.html?.dataset?.routeMode || null,

        hasShell: Boolean(d.shell),
        hasMain: Boolean(d.main),
        hasAppContent: Boolean(d.appContent),
        hasView: Boolean(d.view),
        hasSidebarMount: Boolean(d.sidebarMount),
        hasTopbarMount: Boolean(d.topbarMount),
        hasSidebar: Boolean(d.sidebar),
        hasTopbar: Boolean(d.topbar),
        hasTablehead: Boolean(d.tablehead),
        hasLoader: Boolean(d.loader),

        shell: elementSnapshot(d.shell),
        main: elementSnapshot(d.main),
        appContent: elementSnapshot(d.appContent),
        view: elementSnapshot(d.view),
        sidebarMount: elementSnapshot(d.sidebarMount),
        topbarMount: elementSnapshot(d.topbarMount),
        sidebar: elementSnapshot(d.sidebar),
        topbar: elementSnapshot(d.topbar),
        tablehead: elementSnapshot(d.tablehead),
        tableheadContainer: elementSnapshot(d.tableheadContainer),
        loader: elementSnapshot(d.loader),
      },
    });
  }

  function debug(path = "") {
    const target = safeText(path, "");

    const snapshot = target
      ? {
          target: redact(target),
          data: getRequestedData(target, { preservePublicPath: true, preserveUrl: true }),
          match: getRouteMatch(target),
          snapshot: getSnapshot(),
        }
      : getSnapshot();

    try {
      console.log("[Router:debug]", sanitize(snapshot));
    } catch {}

    return sanitize(snapshot);
  }

  function repairShellPublic(payload = {}) {
    if (typeof payload === "string") return repairCurrentRoute(payload);

    const data = safeObject(payload);

    if (!data.route && (data.canonicalPath || data.publicPath)) {
      const resolved = getRequestedData(data.publicPath || data.canonicalPath || currentBrowserPath(), {
        preservePublicPath: true,
        preserveUrl: true,
      });

      return repairShell({
        ...data,
        route: data.route || resolved.route,
        canonicalPath: data.canonicalPath || resolved.canonicalPath,
        publicPath: data.publicPath || resolved.publicPath,
      });
    }

    return repairShell(data);
  }

  const api = {
    version: VERSION,
    routes,

    configure,
    bind,
    unbind,

    getRoute,
    routeExists,
    getRouteMatch,

    getCurrentPath: currentPath,
    getCurrentCanonicalPath: currentCanonicalPath,
    getCurrentPublicPath: currentPublicPath,

    getCurrentResolvedUsername: () => usernameFor(currentPublicPath()),

    navigate,
    replace,
    render,

    go: navigate,
    push: navigate,
    back: (...args) => back(...args),

    goAfterLogin,

    repairShell: repairShellPublic,
    repairCurrentRoute,
    hideLoader,

    buildPublicPath: (canonicalPath = "/", options = {}) =>
      callCoreHelper(buildPublicPathHelper, getRoute, canonicalPath, options),

    stripUsernamePrefix: (pathname = "/") =>
      callCoreHelper(stripUsernamePrefixHelper, pathname) || localStripUsername(pathname),

    extractUsernameFromPath: (pathname = "/") =>
      callCoreHelper(extractUsernameFromPathHelper, pathname) || localExtractUsername(pathname),

    resolveSpaHref: (href = "/") =>
      callCoreHelper(resolveSpaHrefHelper, href) || href,

    isSlugCandidatePath: (pathname = "/") =>
      Boolean(callCoreHelper(isSlugCandidatePath, pathname)),

    isSameCanonicalPath: (a = "/", b = "/") =>
      Boolean(callCoreHelper(isSameCanonicalPath, a, b)) ||
      normalizeCanonicalPathLocal(a) === normalizeCanonicalPathLocal(b),

    canUsePublicSlugForRoute,
    getRequestedData,
    getDefaultHome,

    safePath: normalizePublicPathLocal,
    safePublicPath: normalizePublicPathLocal,
    safeCanonicalPath: normalizeCanonicalPathLocal,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    getState: getSnapshot,

    debug,
  };

  attachToAppCore();

  return api;
})();

export default Router;
