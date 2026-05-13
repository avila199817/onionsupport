/* =========================================================
   Onion SPA - Router
   Archivo: src/router/index.js

   ONION SUPPORT · ROUTER / NAVIGATION / RENDER PIPELINE
   CANONICAL/PUBLIC PATH HARD LOCKED · TOKEN ROUTES SAFE
   PRIVATE SPA · NO EVENT STORM · EXTREME 14/10

   RESPONSABILIDADES:
   - Coordinar navegación SPA.
   - Resolver rutas canónicas y públicas.
   - Serializar renders para evitar race conditions.
   - Aplicar guards de acceso sin deadlocks.
   - Conectar history, shell y render del router.
   - Exponer API pública estable.
   - Reparar shell tras login, restore y navegación privada.
   - Mantener sidebar/topbar/tablehead coherentes sin forzar sidebar open/close.
   - Mantener compatibilidad con AppCore / Auth / shell legacy.
   - Distinguir estrictamente:
       publicPath    = URL pública real, puede llevar /@usuario/query/hash.
       canonicalPath = ruta interna limpia, sin /@usuario/query/hash.
   - Soportar rutas públicas con /@username.
   - Soportar rutas técnicas con token en path/query/hash-router.
   - No romper hash-router legacy.
   - No duplicar AppCore.events + window.
   - No escuchar app:user-ui:sync para evitar bucles.
   - No emitir app:ui:repair-request desde router:rendered.
   - No permitir que /@usuario/incidencias caiga a /.
   - No permitir que /@usuario/facturas caiga a /.
   - Mantener aliases /tickets, /invoices, /users, etc. hacia canónicos.
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
  redactTokenInText,
} from "./helpers.js";

import {
  ROUTE_PATHS,
  getImmutableRoutes,
  validateRoutesTable,
  resolveRouteAlias,
  getRoutesSnapshot,
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
     VERSION / CONSTANTS
  ===================================================== */

  const ROUTER_VERSION = "14.0.0";
  const ROUTER_SOURCE = "router.index";

  const immutableRoutes = getImmutableRoutes();

  const LOGIN_PATH = ROUTE_PATHS?.LOGIN || "/login";
  const HOME_PATH = ROUTE_PATHS?.HOME || "/";
  const ACTIVATE_ACCOUNT_PATH = ROUTE_PATHS?.ACTIVATE_ACCOUNT || "/activate-account";
  const RESET_PASSWORD_CONFIRM_PATH = ROUTE_PATHS?.RESET_PASSWORD_CONFIRM || "/reset-password/confirm";

  const PUBLIC_AUTH_PATHS = new Set([
    LOGIN_PATH,
    "/signin",
    "/sign-in",

    ACTIVATE_ACCOUNT_PATH,

    ROUTE_PATHS?.RESET_PASSWORD || "/reset-password",
    RESET_PASSWORD_CONFIRM_PATH,

    ROUTE_PATHS?.FORGOT_PASSWORD || "/forgot-password",
    ROUTE_PATHS?.RECOVER_PASSWORD || "/recover-password",
    ROUTE_PATHS?.PASSWORD_RESET || "/password-reset",

    "/2fa",
    "/otp",
  ]);

  const PUBLIC_AUTH_PREFIXES = Object.freeze([
    `${ACTIVATE_ACCOUNT_PATH}/`,
    `${RESET_PASSWORD_CONFIRM_PATH}/`,
  ]);

  const TECHNICAL_ROUTE_BASES = Object.freeze([
    ACTIVATE_ACCOUNT_PATH,
    RESET_PASSWORD_CONFIRM_PATH,
  ]);

  const TOKEN_PARAM_NAMES = Object.freeze([
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
  ]);

  const NAV_BURST_MS = 160;
  const POST_RENDER_REPAIR_DELAY_MS = 0;
  const EXTERNAL_REPAIR_THROTTLE_MS = 140;
  const AUTH_READY_THROTTLE_MS = 180;
  const SHELL_REPAIR_MAX_DEPTH = 4;

  const ROUTER_EVENTS = Object.freeze({
    configured: "router:configured",
    bound: "router:bound",
    unbound: "router:unbound",
    beforeRender: "router:before-render",
    rendered: "router:rendered",
    renderError: "router:render:error",
    renderStale: "router:render:stale",
    internalRedirect: "router:internal-redirect",
    shellState: "router:shell:state",
    loaderHidden: "app:loader:hidden",
  });

  /* =====================================================
     INTERNAL STATE
  ===================================================== */

  let configured = false;
  let bound = false;

  let renderChain = Promise.resolve();
  let renderToken = 0;
  let activeRenderToken = 0;

  let activeView = null;

  const disposers = [];

  let lastNavAt = 0;
  let lastNavKey = "";

  let lastRenderedCanonicalPath = "";
  let lastRenderedPublicPath = "";
  let lastRenderedAt = 0;

  let shellRepairDepth = 0;

  let externalRepairInFlight = false;
  let lastExternalRepairKey = "";
  let lastExternalRepairAt = 0;

  let authReadyInFlight = false;
  let lastAuthReadyAt = 0;

  /* =====================================================
     SAFE BASICS
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

  function safeText(value, fallback = "") {
    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
  }

  function safeObject(value) {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    )
      ? value
      : {};
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
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

    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function nowEpochMs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function safeIsoDate(ms = nowEpochMs()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function safeCreateCustomEvent(name = "", detail = {}) {
    if (!isBrowser()) {
      return null;
    }

    const eventName = safeText(name, "");

    if (!eventName) {
      return null;
    }

    try {
      if (typeof CustomEvent === "function") {
        return new CustomEvent(eventName, {
          detail,
        });
      }
    } catch {}

    try {
      const event = document.createEvent("CustomEvent");

      event.initCustomEvent(
        eventName,
        false,
        false,
        detail
      );

      return event;
    } catch {
      return null;
    }
  }

  function isDomNodeLike(value) {
    if (!value || typeof value !== "object") {
      return false;
    }

    try {
      return Boolean(
        typeof Node !== "undefined" &&
          value instanceof Node
      );
    } catch {}

    try {
      return Boolean(
        value.nodeType &&
          value.nodeName
      );
    } catch {}

    return false;
  }

  /* =====================================================
     REDACTION / LOGGING
  ===================================================== */

  function redactSensitiveText(value = "") {
    let output = safeText(value, "");

    if (!output) {
      return "";
    }

    try {
      for (const name of TOKEN_PARAM_NAMES) {
        const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        output = output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
      }

      output = output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );

      output = output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );

      output = output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );

      output = output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
    } catch {}

    try {
      output = redactTokenInText(output);
    } catch {}

    return output;
  }

  function sanitizeForLog(value, depth = 0) {
    if (depth > 5) {
      return "[MaxDepth]";
    }

    if (typeof value === "string") {
      return redactSensitiveText(value);
    }

    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "function") {
      return "[Function]";
    }

    if (isDomNodeLike(value)) {
      return {
        node: safeText(value.nodeName, "Node"),
        id: safeText(value.id, ""),
        className: safeText(value.className?.baseVal || value.className, ""),
      };
    }

    if (value instanceof Error) {
      return {
        name: safeText(value.name, "Error"),
        message: redactSensitiveText(value.message || ""),
        code: value.code || null,
        status: value.status || value.statusCode || null,
        stack: redactSensitiveText(value.stack || ""),
      };
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 80)
        .map((item) => sanitizeForLog(item, depth + 1));
    }

    if (value && typeof value === "object") {
      const output = {};

      for (const [key, item] of Object.entries(value)) {
        const lowerKey = String(key).toLowerCase();

        if (
          lowerKey.includes("token") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("password") ||
          lowerKey.includes("authorization") ||
          lowerKey.includes("credential") ||
          lowerKey.includes("jwt") ||
          lowerKey.includes("bearer") ||
          lowerKey.includes("otp") ||
          lowerKey === "code"
        ) {
          output[key] = item ? "***" : item;
          continue;
        }

        output[key] = sanitizeForLog(item, depth + 1);
      }

      return output;
    }

    return String(value);
  }

  function safeLog(...args) {
    const cleanArgs = args.map((item) => sanitizeForLog(item));

    try {
      AppCore?.utils?.log?.("[Router]", ...cleanArgs);
    } catch {}
  }

  function safeWarn(...args) {
    const cleanArgs = args.map((item) => sanitizeForLog(item));

    let logged = false;

    try {
      if (isFn(AppCore?.utils?.warn)) {
        AppCore.utils.warn("[Router]", ...cleanArgs);
        logged = true;
      }
    } catch {
      logged = false;
    }

    if (logged) {
      return;
    }

    try {
      if (AppCore?.config?.debug) {
        console.warn("[Router]", ...cleanArgs);
      }
    } catch {}
  }

  function safeError(...args) {
    const cleanArgs = args.map((item) => sanitizeForLog(item));

    let logged = false;

    try {
      if (isFn(AppCore?.utils?.error)) {
        AppCore.utils.error("[Router]", ...cleanArgs);
        logged = true;
      }
    } catch {
      logged = false;
    }

    if (logged) {
      return;
    }

    try {
      console.error("[Router]", ...cleanArgs);
    } catch {}
  }

  function safeEmit(eventName = "", payload = {}, options = {}) {
    const name = safeText(eventName, "");

    if (!name) {
      return false;
    }

    const opts = safeObject(options);

    const finalPayload = sanitizeForLog({
      version: ROUTER_VERSION,
      source: ROUTER_SOURCE,
      ...safeObject(payload),
    });

    let busAvailable = false;
    let busEmitted = false;

    try {
      if (isFn(AppCore?.events?.emit)) {
        busAvailable = true;

        AppCore.events.emit(
          name,
          finalPayload
        );

        busEmitted = true;
      }
    } catch (error) {
      safeWarn(
        `AppCore.events.emit("${name}") falló.`,
        error
      );
    }

    if (
      opts.window === true ||
      (!busAvailable && isBrowser())
    ) {
      try {
        const event = safeCreateCustomEvent(
          name,
          finalPayload
        );

        if (event) {
          window.dispatchEvent(event);
          return true;
        }
      } catch {}
    }

    return busEmitted;
  }

  function safeOn(target, eventName, handler, options = false) {
    if (
      !target ||
      !eventName ||
      !isFn(handler)
    ) {
      return () => {};
    }

    try {
      if (isFn(AppCore?.utils?.on)) {
        const off = AppCore.utils.on(
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
        const off = AppCore.events.on(
          eventName,
          handler
        );

        if (isFn(off)) {
          return off;
        }

        return () => {
          try {
            AppCore?.events?.off?.(
              eventName,
              handler
            );
          } catch {}
        };
      }
    } catch (error) {
      safeWarn(
        `AppCore.events.on("${eventName}") falló.`,
        error
      );
    }

    if (!isBrowser()) {
      return () => {};
    }

    return safeOn(
      window,
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
      if (isFn(window.requestAnimationFrame)) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            try {
              callback();
            } catch {}
          });
        });

        return;
      }
    } catch {}

    try {
      window.setTimeout(() => {
        try {
          callback();
        } catch {}
      }, POST_RENDER_REPAIR_DELAY_MS);
    } catch {}
  }

  function getEventDetail(eventOrPayload = {}) {
    if (
      eventOrPayload?.detail &&
      typeof eventOrPayload.detail === "object"
    ) {
      return eventOrPayload.detail;
    }

    if (
      eventOrPayload?.payload &&
      typeof eventOrPayload.payload === "object"
    ) {
      return eventOrPayload.payload;
    }

    if (
      eventOrPayload &&
      typeof eventOrPayload === "object"
    ) {
      return eventOrPayload;
    }

    return {};
  }

  function getEventType(eventOrPayload = {}) {
    return safeText(
      eventOrPayload?.type ||
        eventOrPayload?.event ||
        eventOrPayload?.detail?.event ||
        eventOrPayload?.payload?.event ||
        "",
      ""
    );
  }

  /* =====================================================
     PATH NORMALIZATION
  ===================================================== */

  function getBaseOrigin() {
    if (
      isBrowser() &&
      window.location?.origin
    ) {
      return window.location.origin;
    }

    return "http://localhost";
  }

  function normalizePathnameOnly(pathname = "/") {
    let value = safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!value) {
      value = "/";
    }

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    const segments = value
      .split("/")
      .filter(Boolean);

    const output = [];

    for (const segment of segments) {
      if (segment === ".") {
        continue;
      }

      if (segment === "..") {
        output.pop();
        continue;
      }

      output.push(segment);
    }

    value = `/${output.join("/")}`;

    if (!value) {
      value = "/";
    }

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || "/";
    }

    return value;
  }

  function normalizeSearch(search = "") {
    const value = safeText(search, "");

    if (!value) {
      return "";
    }

    return value.startsWith("?")
      ? value
      : `?${value.replace(/^\?+/, "")}`;
  }

  function normalizeHash(hash = "") {
    const value = safeText(hash, "");

    if (!value) {
      return "";
    }

    return value.startsWith("#")
      ? value
      : `#${value.replace(/^#+/, "")}`;
  }

  function isHashRouterPath(value = "") {
    const raw = safeText(value, "");

    return (
      raw.startsWith("#/") ||
      raw.startsWith("#!")
    );
  }

  function normalizeHashRouterPath(value = "") {
    const raw = safeText(value, "");

    if (!raw) {
      return "/";
    }

    if (raw.startsWith("#!")) {
      return raw.replace(/^#!\/?/, "/") || "/";
    }

    return raw.replace(/^#\/?/, "/") || "/";
  }

  function splitFullPath(value = "/") {
    const raw = safeText(value, "/");

    if (isHashRouterPath(raw)) {
      return splitFullPath(
        normalizeHashRouterPath(raw)
      );
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
      pathname: normalizePathnameOnly(pathname),
      search: normalizeSearch(search),
      hash: normalizeHash(hash),
    };
  }

  function normalizeLocalFullPath(path = "/") {
    const raw = safeText(path, "/");

    if (!raw) {
      return "/";
    }

    if (isHashRouterPath(raw)) {
      return normalizeLocalFullPath(
        normalizeHashRouterPath(raw)
      );
    }

    try {
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
        const parsed = new URL(
          raw,
          getBaseOrigin()
        );

        if (
          parsed.hash &&
          isHashRouterPath(parsed.hash)
        ) {
          return normalizeLocalFullPath(
            normalizeHashRouterPath(parsed.hash)
          );
        }

        return normalizeLocalFullPath(
          `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
        );
      }
    } catch {}

    const {
      pathname,
      search,
      hash,
    } = splitFullPath(raw);

    return `${pathname}${search}${hash}`;
  }

  function stripSearchAndHash(path = "/") {
    const normalized = normalizeLocalFullPath(path || "/");

    return normalizePathnameOnly(
      normalized
        .split("?")[0]
        .split("#")[0] ||
        "/"
    );
  }

  function isUsernameSegment(segment = "") {
    return /^@[A-Za-z0-9._-]{1,80}$/.test(
      safeText(segment, "")
    );
  }

  function getPathSegments(path = "/") {
    const {
      pathname,
    } = splitFullPath(path || "/");

    return pathname
      .split("/")
      .filter(Boolean);
  }

  function isUsernameScopedPath(path = "") {
    const segments = getPathSegments(path);

    return Boolean(
      segments.length > 0 &&
        isUsernameSegment(segments[0])
    );
  }

  function isUsernameHomePublicPath(path = "") {
    const segments = getPathSegments(path);

    return Boolean(
      segments.length === 1 &&
        isUsernameSegment(segments[0])
    );
  }

  function stripUsernamePrefixLocal(path = "/") {
    const {
      pathname,
      search,
      hash,
    } = splitFullPath(path);

    const segments = pathname
      .split("/")
      .filter(Boolean);

    if (
      segments.length > 0 &&
      isUsernameSegment(segments[0])
    ) {
      const rest = segments.slice(1).join("/");

      const cleanPathname = rest
        ? normalizePathnameOnly(`/${rest}`)
        : "/";

      return `${cleanPathname}${search}${hash}`;
    }

    return `${pathname}${search}${hash}`;
  }

  function applyRouteAliasSafe(path = "/") {
    const normalized = normalizeLocalFullPath(path || "/");

    const {
      pathname,
      search,
      hash,
    } = splitFullPath(normalized);

    try {
      if (isFn(resolveRouteAlias)) {
        const aliased = resolveRouteAlias(pathname);

        return `${normalizePathnameOnly(aliased || pathname)}${search}${hash}`;
      }
    } catch {}

    return `${pathname}${search}${hash}`;
  }

  function canonicalizePath(path = "/") {
    const normalized = normalizeLocalFullPath(path || "/");
    const stripped = stripUsernamePrefixLocal(normalized);
    const aliased = applyRouteAliasSafe(stripped);

    return normalizeLocalFullPath(aliased || "/");
  }

  function safePublicPath(path = "/") {
    const raw = safeText(path, "/");

    if (
      isUnsafeHref(raw) ||
      isExternalHref(raw)
    ) {
      return "/";
    }

    if (isHashOnlyHref(raw)) {
      return raw;
    }

    return normalizeLocalFullPath(raw);
  }

  function safeCanonicalPath(path = "/") {
    const raw = safeText(path, "/");

    if (
      isUnsafeHref(raw) ||
      isExternalHref(raw)
    ) {
      return "/";
    }

    if (isHashOnlyHref(raw)) {
      return raw;
    }

    return canonicalizePath(raw);
  }

  function getBrowserPath() {
    if (!isBrowser()) {
      return "/";
    }

    try {
      const pathname = window.location.pathname || "/";
      const search = window.location.search || "";
      const hash = window.location.hash || "";

      if (
        hash &&
        isHashRouterPath(hash)
      ) {
        return normalizeLocalFullPath(
          normalizeHashRouterPath(hash)
        );
      }

      return normalizeLocalFullPath(
        `${pathname}${search}${hash}`
      );
    } catch {
      return "/";
    }
  }

  function safePath(path = "/") {
    return safePublicPath(path);
  }

  function getCanonical(path = "/") {
    const localCanonical = canonicalizePath(path);
    let helperCanonical = "";

    try {
      helperCanonical = normalizeCanonicalPath(
        AppCore,
        path
      ) || "";
    } catch {}

    helperCanonical = helperCanonical
      ? canonicalizePath(helperCanonical)
      : "";

    const localClean = stripSearchAndHash(localCanonical);
    const helperClean = stripSearchAndHash(helperCanonical);

    if (
      isUsernameScopedPath(path) &&
      (
        !helperClean ||
        helperClean === "/"
      ) &&
      localClean !== "/"
    ) {
      return localCanonical;
    }

    if (
      helperClean &&
      helperClean !== "/" &&
      helperClean === localClean
    ) {
      return helperCanonical;
    }

    if (
      helperClean &&
      helperClean !== "/" &&
      !isUsernameScopedPath(helperCanonical)
    ) {
      return helperCanonical;
    }

    return localCanonical || helperCanonical || "/";
  }

  function isPublicAuthPath(path = "/") {
    const clean = stripSearchAndHash(
      canonicalizePath(path)
    );

    if (PUBLIC_AUTH_PATHS.has(clean)) {
      return true;
    }

    return PUBLIC_AUTH_PREFIXES.some((prefix) =>
      clean.startsWith(prefix)
    );
  }

  function getTechnicalRouteBase(path = "/") {
    const clean = stripSearchAndHash(
      canonicalizePath(path)
    );

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

  function shouldBlockUsernameHomeFallback({
    publicPath = "/",
    canonicalPath = "/",
  } = {}) {
    const cleanPublicPath = stripSearchAndHash(publicPath);
    const cleanCanonicalPath = stripSearchAndHash(canonicalPath);

    return Boolean(
      isUsernameScopedPath(cleanPublicPath) &&
        !isUsernameHomePublicPath(cleanPublicPath) &&
        cleanCanonicalPath === "/" &&
        cleanPublicPath !== "/"
    );
  }

  function normalizeExplicitCanonical(input = "") {
    const raw = safeText(input, "");

    if (!raw) {
      return "";
    }

    return stripSearchAndHash(
      safeCanonicalPath(raw)
    );
  }

  function normalizeExplicitPublic(input = "") {
    const raw = safeText(input, "");

    if (!raw) {
      return "";
    }

    return safePublicPath(raw);
  }

  /* =====================================================
     ROUTE MATCHING
  ===================================================== */

  function getRouteMatch(path = "/") {
    const rawCanonical = getCanonical(path);
    const cleanCanonical = stripSearchAndHash(rawCanonical);

    const exact = immutableRoutes.find((route) =>
      stripSearchAndHash(route?.path) === cleanCanonical
    );

    if (exact) {
      return {
        route: exact,
        canonicalPath: stripSearchAndHash(exact.path),
        rawCanonicalPath: cleanCanonical,
        matchedBy: "exact",
      };
    }

    const aliasCanonical = stripSearchAndHash(
      applyRouteAliasSafe(cleanCanonical)
    );

    if (aliasCanonical !== cleanCanonical) {
      const aliasMatch = immutableRoutes.find((route) =>
        stripSearchAndHash(route?.path) === aliasCanonical
      );

      if (aliasMatch) {
        return {
          route: aliasMatch,
          canonicalPath: stripSearchAndHash(aliasMatch.path),
          rawCanonicalPath: cleanCanonical,
          matchedBy: "alias",
        };
      }
    }

    const technicalBase = getTechnicalRouteBase(cleanCanonical);

    if (technicalBase) {
      const technicalRoute = immutableRoutes.find((route) =>
        stripSearchAndHash(route?.path) === technicalBase
      );

      if (technicalRoute) {
        return {
          route: technicalRoute,
          canonicalPath: stripSearchAndHash(technicalRoute.path),
          rawCanonicalPath: cleanCanonical,
          matchedBy: "technical-prefix",
        };
      }
    }

    for (const route of immutableRoutes) {
      try {
        if (
          Array.isArray(route?.aliases) &&
          route.aliases
            .map((alias) =>
              stripSearchAndHash(
                applyRouteAliasSafe(alias)
              )
            )
            .includes(cleanCanonical)
        ) {
          return {
            route,
            canonicalPath: stripSearchAndHash(route.path || cleanCanonical),
            rawCanonicalPath: cleanCanonical,
            matchedBy: "route.aliases",
          };
        }
      } catch {}

      try {
        if (
          isFn(route?.match) &&
          route.match(cleanCanonical)
        ) {
          return {
            route,
            canonicalPath: stripSearchAndHash(route.path || cleanCanonical),
            rawCanonicalPath: cleanCanonical,
            matchedBy: "route.match",
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
            canonicalPath: stripSearchAndHash(route.path || cleanCanonical),
            rawCanonicalPath: cleanCanonical,
            matchedBy: "route.pattern",
          };
        }
      } catch {}
    }

    return {
      route: null,
      canonicalPath: cleanCanonical || "/",
      rawCanonicalPath: cleanCanonical || "/",
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
    if (!route) {
      return false;
    }

    const names = getRouteNames(AppCore);

    const routePath = stripSearchAndHash(route.path || "/");

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
      extractUsernameFromPath(AppCore, requestedPath) ||
      getCurrentResolvedUsername(AppCore) ||
      getCurrentUsername(AppCore) ||
      AppCore?.state?.user?.username ||
      AppCore?.state?.user?.slug ||
      null
    );
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

    const explicitCanonicalPath = normalizeExplicitCanonical(
      opts.canonicalPath ||
        (
          typeof opts.route === "string"
            ? opts.route
            : opts.route?.path || ""
        )
    );

    const explicitPublicPath = normalizeExplicitPublic(
      opts.publicPath ||
        opts.requestedPath ||
        ""
    );

    const resolvedHref = resolveSpaHref(
      AppCore,
      path
    ) || path;

    const requestedPath = safePublicPath(resolvedHref);

    const canonicalInput = explicitCanonicalPath
      ? safeCanonicalPath(explicitCanonicalPath)
      : safeCanonicalPath(requestedPath);

    const match = getRouteMatch(canonicalInput);

    let route = match.route;
    let canonicalPath = match.canonicalPath;
    let rawCanonicalPath = match.rawCanonicalPath;

    const username = resolveUsername(
      explicitPublicPath ||
        requestedPath ||
        canonicalPath
    );

    let publicPath = explicitPublicPath ||
      requestedPath ||
      canonicalPath ||
      "/";

    if (
      !publicPath ||
      publicPath === "/"
    ) {
      publicPath = canonicalPath || "/";
    }

    if (
      canUsePublicSlugForRoute(route) &&
      !shouldPreservePublicPath(opts)
    ) {
      const builtPublicPath = buildPublicPath(
        AppCore,
        getRoute,
        canonicalPath,
        {
          username,
          resolvedUsername: username,
          fromPath: requestedPath,
          publicPath: requestedPath,
          canonicalPath,
        }
      );

      publicPath = safePublicPath(
        builtPublicPath ||
          publicPath ||
          canonicalPath
      );
    }

    if (
      match.matchedBy === "technical-prefix" ||
      match.matchedBy === "alias" ||
      match.matchedBy === "route.aliases"
    ) {
      publicPath = safePublicPath(
        explicitPublicPath ||
          requestedPath ||
          publicPath ||
          canonicalPath
      );
    }

    if (
      isUsernameHomePublicPath(publicPath) &&
      stripSearchAndHash(canonicalPath) === "/"
    ) {
      return {
        requestedPath,
        canonicalPath: "/",
        rawCanonicalPath: rawCanonicalPath || "/",
        publicPath,
        route,
        username,
        matchedBy: match.matchedBy === "none"
          ? "username-home"
          : `username-home:${match.matchedBy}`,
      };
    }

    if (
      shouldBlockUsernameHomeFallback({
        publicPath,
        canonicalPath,
      })
    ) {
      const repairedCanonical = stripSearchAndHash(
        safeCanonicalPath(publicPath)
      );

      const repairedMatch = getRouteMatch(repairedCanonical);

      if (repairedMatch.route) {
        return {
          requestedPath,
          canonicalPath: repairedMatch.canonicalPath,
          rawCanonicalPath: repairedMatch.rawCanonicalPath,
          publicPath,
          route: repairedMatch.route,
          username,
          matchedBy: `repaired-username-scope:${repairedMatch.matchedBy}`,
        };
      }

      safeWarn(
        "Ruta pública con @usuario habría caído a HOME. Se bloquea fallback incorrecto.",
        {
          requestedPath,
          canonicalPath,
          rawCanonicalPath,
          publicPath,
          repairedCanonical,
          username,
          matchedBy: match.matchedBy,
        }
      );

      return {
        requestedPath,
        canonicalPath: repairedCanonical || canonicalPath,
        rawCanonicalPath: repairedCanonical || rawCanonicalPath || canonicalPath,
        publicPath,
        route: null,
        username,
        matchedBy: "blocked-username-home-fallback",
      };
    }

    if (
      isUsernameScopedPath(publicPath) &&
      stripSearchAndHash(canonicalPath) === "/" &&
      stripSearchAndHash(publicPath) !== "/"
    ) {
      const repairedCanonical = stripSearchAndHash(
        safeCanonicalPath(publicPath)
      );

      const repairedMatch = getRouteMatch(repairedCanonical);

      if (repairedMatch.route) {
        route = repairedMatch.route;
        canonicalPath = repairedMatch.canonicalPath;
        rawCanonicalPath = repairedMatch.rawCanonicalPath;

        return {
          requestedPath,
          canonicalPath,
          rawCanonicalPath,
          publicPath,
          route,
          username,
          matchedBy: `repaired-${repairedMatch.matchedBy}`,
        };
      }
    }

    return {
      requestedPath,
      canonicalPath,
      rawCanonicalPath,
      publicPath,
      route,
      username,
      matchedBy: match.matchedBy,
    };
  }

  function getDefaultHome() {
    const names = getRouteNames(AppCore);
    const username = resolveUsername("/");

    return (
      buildPublicPath(
        AppCore,
        getRoute,
        names.HOME || HOME_PATH,
        {
          username,
          resolvedUsername: username,
        }
      ) ||
      names.HOME ||
      HOME_PATH ||
      "/"
    );
  }

  function resolveSafeRedirect(value = "") {
    const raw = safeText(value, "");

    if (!raw) {
      return "";
    }

    if (
      isUnsafeHref(raw) ||
      isExternalHref(raw)
    ) {
      return "";
    }

    const resolved = safePublicPath(
      resolveSpaHref(
        AppCore,
        raw
      ) || raw
    );

    const canonical = getRouteMatch(resolved).canonicalPath;

    if (
      canonical === LOGIN_PATH ||
      isPublicAuthPath(canonical)
    ) {
      return "";
    }

    return resolved;
  }

  /* =====================================================
     AUTH
  ===================================================== */

  function hasUsableToken(token = "") {
    const text = safeText(token, "");

    if (!text) {
      return false;
    }

    const lower = text.toLowerCase();

    if (
      [
        "null",
        "undefined",
        "false",
        "true",
        "nan",
        "none",
        "[object object]",
      ].includes(lower)
    ) {
      return false;
    }

    if (/[\s\r\n\t]/.test(text)) {
      return false;
    }

    return true;
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
        const authResult = Boolean(Auth.isAuthenticated());

        if (!authResult) {
          return false;
        }

        const state = safeObject(AppCore?.state);

        const user =
          state.user ||
          state.session?.user ||
          state.currentUser ||
          state.authUser ||
          null;

        const token =
          state.token ||
          state.accessToken ||
          state.session?.token ||
          state.session?.accessToken ||
          "";

        return Boolean(
          hasUsableUser(user) ||
            hasUsableToken(token)
        );
      }
    } catch {}

    const state = safeObject(AppCore?.state);

    const token =
      state.token ||
      state.accessToken ||
      state.session?.token ||
      state.session?.accessToken ||
      "";

    const user =
      state.user ||
      state.session?.user ||
      state.currentUser ||
      state.authUser ||
      null;

    if (state.authenticated === true) {
      return Boolean(
        hasUsableUser(user) ||
          hasUsableToken(token)
      );
    }

    return Boolean(
      hasUsableToken(token) &&
        hasUsableUser(user)
    );
  }

  /* =====================================================
     STATE / HISTORY / FLAGS
  ===================================================== */

  function isLatestRenderToken(token) {
    return Boolean(
      token &&
        token === renderToken
    );
  }

  function makeStaleResult(token, reason = "stale-render") {
    const payload = {
      ok: false,
      skipped: true,
      stale: true,
      reason,
      token,
      currentToken: renderToken,
    };

    safeEmit(
      ROUTER_EVENTS.renderStale,
      payload
    );

    return payload;
  }

  function markRenderedRoute({
    canonicalPath = "",
    publicPath = "",
  } = {}) {
    lastRenderedCanonicalPath = stripSearchAndHash(canonicalPath || "");
    lastRenderedPublicPath = safeText(publicPath, "") || lastRenderedCanonicalPath;
    lastRenderedAt = nowEpochMs();
  }

  function syncState({
    canonicalPath = "/",
    publicPath = "/",
    username = null,
  } = {}) {
    const safeCanonical = stripSearchAndHash(
      safeCanonicalPath(canonicalPath || "/")
    );

    const safePublic = safePublicPath(
      publicPath ||
        safeCanonical
    );

    try {
      AppCore?.setRoute?.(safeCanonical);
    } catch {}

    try {
      AppCore?.setPublicPath?.(safePublic);
    } catch {}

    try {
      AppCore?.setState?.(
        {
          route: safeCanonical,
          canonicalPath: safeCanonical,
          publicPath: safePublic,
          currentResolvedUsername: username || null,
        },
        {
          source: ROUTER_SOURCE,
        }
      );
    } catch {
      try {
        if (
          AppCore?.state &&
          typeof AppCore.state === "object"
        ) {
          AppCore.state.route = safeCanonical;
          AppCore.state.canonicalPath = safeCanonical;
          AppCore.state.publicPath = safePublic;
          AppCore.state.currentResolvedUsername = username || null;
        }
      } catch {}
    }

    markRenderedRoute({
      canonicalPath: safeCanonical,
      publicPath: safePublic,
    });

    return {
      canonicalPath: safeCanonical,
      publicPath: safePublic,
      username: username || null,
    };
  }

  function getCurrentComparable() {
    const canonical = safeCanonicalPath(
      getCurrentCanonicalPath(AppCore) ||
        AppCore?.state?.route ||
        lastRenderedCanonicalPath ||
        "/"
    );

    const publicPath = safePublicPath(
      getCurrentPublicPath(AppCore) ||
        AppCore?.state?.publicPath ||
        lastRenderedPublicPath ||
        canonical
    );

    return {
      canonical: stripSearchAndHash(canonical),
      publicPath,
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
      AppCore?.setState?.(
        {
          [name]: Boolean(value),
        },
        {
          source: ROUTER_SOURCE,
        }
      );
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

  function shouldSkipHistory(options = {}) {
    return Boolean(
      options.skipHistory === true ||
        options.protectedInitialUrl === true ||
        (
          options.initialRender === true &&
          options.preserveUrl === true
        )
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
      resolvedUsername: username,

      canonicalPath,
      rawCanonicalPath,
      publicPath,
      requestedPath,

      fromPath: requestedPath || publicPath,

      preservePath: Boolean(
        options.preservePath === true ||
          options.preservePublicPath === true ||
          options.preserveUrl === true ||
          options.protectedInitialUrl === true
      ),

      skipHistory: shouldSkipHistory(options),

      protectedInitialUrl: options.protectedInitialUrl === true,
    };
  }

  function rememberNav(key = "") {
    lastNavKey = String(key || "");
    lastNavAt = nowEpochMs();
  }

  function isBurst(key = "") {
    return Boolean(
      key &&
        key === lastNavKey &&
        nowEpochMs() - lastNavAt < NAV_BURST_MS
    );
  }

  function resolveNoopNavigation(reason, data = {}) {
    safeLog(
      "navigation skipped",
      {
        reason,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
      }
    );

    return Promise.resolve({
      ok: true,
      skipped: true,
      reason,
      canonicalPath: data.canonicalPath || null,
      publicPath: data.publicPath || null,
    });
  }

  /* =====================================================
     DOM / SHELL
  ===================================================== */

  function queryFirst(selectors = []) {
    if (!isBrowser()) {
      return null;
    }

    for (const selector of safeArray(selectors)) {
      const cleanSelector = safeText(selector, "");

      if (!cleanSelector) {
        continue;
      }

      try {
        const el = cleanSelector.startsWith("#")
          ? document.getElementById(cleanSelector.slice(1))
          : document.querySelector(cleanSelector);

        if (el) {
          return el;
        }
      } catch {}
    }

    return null;
  }

  function getDomSnapshot() {
    if (!isBrowser()) {
      return {
        html: null,
        body: null,
        shell: null,
        main: null,
        appContent: null,
        view: null,
        sidebarMount: null,
        topbarMount: null,
        sidebar: null,
        topbar: null,
        tablehead: null,
        tableheadContainer: null,
        loader: null,
      };
    }

    const shell =
      AppCore?.dom?.appShell ||
      AppCore?.dom?.shell ||
      queryFirst([
        "#app-shell",
        "[data-app-shell='true']",
        "[data-app-shell]",
        ".app-shell",
        ".layout",
      ]);

    const main =
      AppCore?.dom?.mainContent ||
      AppCore?.dom?.main ||
      queryFirst([
        "#main-content",
        "main.main-content",
        ".main-content",
        "main[role='main']",
        "main",
      ]);

    const appContent =
      AppCore?.dom?.appContent ||
      queryFirst([
        "#app-content",
        "[data-app-content]",
      ]);

    const view =
      AppCore?.dom?.viewContainer ||
      queryFirst([
        "#view-container",
        "[data-view-root]",
        "[data-view-container='true']",
        "[data-router-view]",
      ]);

    const sidebarMount =
      AppCore?.dom?.sidebarMount ||
      queryFirst([
        "#sidebar-mount",
        "[data-sidebar-mount]",
      ]);

    const topbarMount =
      AppCore?.dom?.topbarMount ||
      queryFirst([
        "#topbar-mount",
        "[data-topbar-mount]",
      ]);

    const sidebar =
      AppCore?.dom?.sidebar ||
      queryFirst([
        "#app-sidebar",
        ".sidebar",
        "#sidebar",
        "[data-sidebar-root]",
        "[data-sidebar='true']",
        "[data-sidebar]",
      ]);

    const topbar =
      AppCore?.dom?.topbar ||
      queryFirst([
        "#app-topbar",
        ".topbar",
        "#topbar",
        "[data-topbar-root]",
        "[data-topbar='true']",
        "[data-topbar]",
      ]);

    const tablehead =
      AppCore?.dom?.tablehead ||
      queryFirst([
        "#table-head",
        ".table-head",
        "[data-tablehead]",
      ]);

    const tableheadContainer =
      AppCore?.dom?.tableheadContainer ||
      queryFirst([
        "#tablehead-container",
        "[data-tablehead-container]",
      ]);

    const loader =
      AppCore?.dom?.loader ||
      queryFirst([
        "#app-loader",
        "[data-app-loader='true']",
        "[data-app-loader]",
        ".app-loader",
      ]);

    try {
      if (AppCore?.dom) {
        AppCore.dom.appShell = shell;
        AppCore.dom.shell = shell;
        AppCore.dom.layout = shell;

        AppCore.dom.mainContent = main;
        AppCore.dom.main = main;
        AppCore.dom.appContent = appContent;
        AppCore.dom.viewContainer = view;

        AppCore.dom.sidebarMount = sidebarMount;
        AppCore.dom.topbarMount = topbarMount;
        AppCore.dom.sidebar = sidebar;
        AppCore.dom.topbar = topbar;

        AppCore.dom.tablehead = tablehead;
        AppCore.dom.tableheadContainer = tableheadContainer;
        AppCore.dom.loader = loader;
      }
    } catch {}

    return {
      html: document.documentElement || null,
      body: document.body || null,
      shell,
      main,
      appContent,
      view,
      sidebarMount,
      topbarMount,
      sidebar,
      topbar,
      tablehead,
      tableheadContainer,
      loader,
    };
  }

  function setHidden(el, hidden = false) {
    if (!el) {
      return false;
    }

    const next = Boolean(hidden);

    try {
      el.hidden = next;
    } catch {}

    try {
      el.setAttribute(
        "aria-hidden",
        next ? "true" : "false"
      );
    } catch {}

    return true;
  }

  function setBusy(el, busy = false) {
    if (!el) {
      return false;
    }

    try {
      el.setAttribute(
        "aria-busy",
        busy ? "true" : "false"
      );

      return true;
    } catch {
      return false;
    }
  }

  function setDataset(el, key, value) {
    if (
      !el ||
      !key
    ) {
      return false;
    }

    try {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        delete el.dataset[key];
      } else {
        el.dataset[key] = String(value);
      }

      return true;
    } catch {
      return false;
    }
  }

  function tableheadHasContent(tableheadContainer) {
    if (!tableheadContainer) {
      return false;
    }

    try {
      if (tableheadContainer.childElementCount > 0) {
        return true;
      }
    } catch {}

    try {
      return Boolean(
        safeText(tableheadContainer.textContent, "")
      );
    } catch {
      return false;
    }
  }

  function isShellHiddenRoute(route, canonicalPath = "/") {
    const canonical = stripSearchAndHash(
      canonicalPath ||
        route?.path ||
        "/"
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
      html?.classList?.remove?.("app-loading");
      body?.classList?.remove?.("app-loading", "loading");
    } catch {}

    if (!loader) {
      return false;
    }

    try {
      loader.classList.remove(
        "is-visible",
        "is-entering",
        "is-leaving",
        "app-loader--visible"
      );

      loader.classList.add(
        "is-hidden",
        "has-hidden"
      );

      loader.setAttribute("aria-hidden", "true");
      loader.setAttribute("aria-busy", "false");

      loader.dataset.loaderVisible = "false";
      loader.dataset.loaderState = "hidden";

      loader.hidden = true;
    } catch {}

    safeEmit(
      ROUTER_EVENTS.loaderHidden,
      {
        reason,
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
    emitRepair = false,
  } = {}) {
    if (!isBrowser()) {
      return false;
    }

    if (shellRepairDepth > SHELL_REPAIR_MAX_DEPTH) {
      safeWarn(
        "repairShellForRoute bloqueado por profundidad.",
        {
          phase,
          canonicalPath,
          publicPath,
          shellRepairDepth,
        }
      );

      return false;
    }

    shellRepairDepth += 1;

    try {
      const shellHidden = isShellHiddenRoute(
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
        sidebarMount,
        topbarMount,
        sidebar,
        topbar,
        tablehead,
        tableheadContainer,
      } = getDomSnapshot();

      if (!html || !body) {
        return false;
      }

      try {
        html.classList.remove("app-booting", "app-loading");
        body.classList.remove("app-booting", "app-loading", "loading");

        html.classList.add("app-ready");
        body.classList.add("app-ready");

        html.dataset.appState = "ready";
        html.dataset.appLoading = "false";

        body.dataset.appLoading = "false";
      } catch {}

      setDataset(html, "routeMode", shellHidden ? "auth" : "app");
      setDataset(body, "routeMode", shellHidden ? "auth" : "app");

      setDataset(html, "chrome", shellHidden ? "hidden" : "visible");
      setDataset(body, "chrome", shellHidden ? "hidden" : "visible");

      setDataset(html, "shell", "visible");
      setDataset(body, "shell", "visible");

      if (shellHidden) {
        try {
          body.classList.add(
            "auth-screen",
            "route-auth",
            "route-shell-hidden",
            "route-chrome-hidden"
          );

          body.classList.remove(
            "route-app",
            "route-shell-visible",
            "route-chrome-visible",
            "login-no-scroll",
            "sidebar-open",
            "sidebar-collapsed",
            "sidebar-transitioning",
            "sidebar-tooltips-active"
          );

          html.classList.add(
            "route-auth",
            "route-shell-hidden",
            "route-chrome-hidden"
          );

          html.classList.remove(
            "route-app",
            "route-shell-visible",
            "route-chrome-visible"
          );
        } catch {}

        setDataset(shell, "shell", "visible");
        setDataset(shell, "chrome", "hidden");
        setDataset(shell, "routeMode", "auth");
        setDataset(shell, "shellInteractive", "true");

        for (const el of [
          shell,
          main,
          appContent,
          view,
        ]) {
          setHidden(el, false);
          setBusy(el, false);
        }

        for (const el of [
          sidebarMount,
          topbarMount,
          sidebar,
          topbar,
          tablehead,
          tableheadContainer,
        ]) {
          setHidden(el, true);
        }

        try {
          AppCore?.setState?.(
            {
              shellVisible: false,
              chromeVisible: false,
              appShellVisible: true,
              routeShellHidden: true,
              shellHidden: true,
              authScreen: true,
              routeMode: "auth",
            },
            {
              source: ROUTER_SOURCE,
            }
          );
        } catch {
          try {
            if (AppCore?.state) {
              AppCore.state.shellVisible = false;
              AppCore.state.chromeVisible = false;
              AppCore.state.appShellVisible = true;
              AppCore.state.routeShellHidden = true;
              AppCore.state.shellHidden = true;
              AppCore.state.authScreen = true;
              AppCore.state.routeMode = "auth";
            }
          } catch {}
        }
      } else {
        try {
          body.classList.remove(
            "auth-screen",
            "login-no-scroll",
            "route-auth",
            "route-shell-hidden",
            "route-chrome-hidden"
          );

          body.classList.add(
            "route-app",
            "route-shell-visible",
            "route-chrome-visible"
          );

          html.classList.remove(
            "route-auth",
            "route-shell-hidden",
            "route-chrome-hidden"
          );

          html.classList.add(
            "route-app",
            "route-shell-visible",
            "route-chrome-visible"
          );
        } catch {}

        setDataset(shell, "shell", "visible");
        setDataset(shell, "chrome", "visible");
        setDataset(shell, "routeMode", "app");
        setDataset(shell, "shellInteractive", "true");

        for (const el of [
          shell,
          main,
          appContent,
          view,
          sidebarMount,
          topbarMount,
          sidebar,
          topbar,
        ]) {
          setHidden(el, false);
          setBusy(el, false);
        }

        const hasTableheadContent = tableheadHasContent(tableheadContainer);

        setHidden(tablehead, !hasTableheadContent);
        setHidden(tableheadContainer, !hasTableheadContent);

        try {
          AppCore?.setState?.(
            {
              shellVisible: true,
              chromeVisible: true,
              appShellVisible: true,
              routeShellHidden: false,
              shellHidden: false,
              authScreen: false,
              routeMode: "app",
            },
            {
              source: ROUTER_SOURCE,
            }
          );
        } catch {
          try {
            if (AppCore?.state) {
              AppCore.state.shellVisible = true;
              AppCore.state.chromeVisible = true;
              AppCore.state.appShellVisible = true;
              AppCore.state.routeShellHidden = false;
              AppCore.state.shellHidden = false;
              AppCore.state.authScreen = false;
              AppCore.state.routeMode = "app";
            }
          } catch {}
        }
      }

      if (hideLoading) {
        hideLoader(`router:${phase}`);
      }

      if (emitRepair) {
        safeEmit(
          "app:ui:repair-request",
          {
            source: ROUTER_SOURCE,
            phase,
            shellHidden,
            canonicalPath,
            publicPath,
            authenticated: isAuthenticated(),
            hardRepair: false,
            rebind: false,
          }
        );
      }

      safeEmit(
        ROUTER_EVENTS.shellState,
        {
          phase,
          shellHidden,
          canonicalPath,
          publicPath,
          routePath: route?.path || null,
          routeName: route?.name || null,
          viewKey: route?.viewKey || null,
          viewName: route?.viewName || null,
          hasSidebar: Boolean(sidebar || sidebarMount),
          hasTopbar: Boolean(topbar || topbarMount),
          hasShell: Boolean(shell),
        }
      );

      return true;
    } finally {
      shellRepairDepth = Math.max(
        0,
        shellRepairDepth - 1
      );
    }
  }

  function schedulePostRenderRepair(payload = {}) {
    const tokenAtSchedule = renderToken;

    afterPaint(() => {
      if (tokenAtSchedule !== renderToken) {
        return;
      }

      repairShellForRoute({
        ...payload,
        phase: `${payload.phase || "post-render"}:after-paint`,
        hideLoading: true,
        emitRepair: false,
      });
    });
  }

  function repairCurrentRoute(phase = "external-repair") {
    const path = getBrowserPath();

    const data = getRequestedData(
      path,
      {
        preservePublicPath: true,
        preserveUrl: true,
        source: "repair-current-route",
      }
    );

    return repairShellForRoute({
      route: data.route,
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
      phase,
      hideLoading: true,
      emitRepair: false,
    });
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
     ACCESS CONTROL
  ===================================================== */

  function getAccessDecision({
    route,
    canonicalPath,
    publicPath,
  } = {}) {
    try {
      const access = shouldAllowRoute({
        AppCore,
        Auth,
        route,
        requestedCanonicalPath: canonicalPath,
        requestedPublicPath: publicPath,
        getRoute,
      });

      if (
        access &&
        typeof access === "object"
      ) {
        return {
          allowed: access.allowed !== false,
          ...access,
        };
      }

      return {
        allowed: true,
      };
    } catch (error) {
      safeError(
        "shouldAllowRoute() falló.",
        {
          route: route?.path || null,
          canonicalPath,
          publicPath,
          error,
        }
      );

      return {
        allowed: false,
        reason: "guard-error",
        error,
      };
    }
  }

  async function redirectInsideRender(target = "/", options = {}) {
    const redirectTarget = safePublicPath(
      target ||
        getDefaultHome()
    );

    const redirectData = getRequestedData(
      redirectTarget,
      {
        ...safeObject(options),
        preservePublicPath: true,
        preserveUrl: true,
      }
    );

    const redirectToken = ++renderToken;
    activeRenderToken = redirectToken;

    safeEmit(
      ROUTER_EVENTS.internalRedirect,
      {
        target: redirectTarget,
        canonicalPath: redirectData.canonicalPath,
        publicPath: redirectData.publicPath,
        token: redirectToken,
        options: safeObject(options),
      }
    );

    return executeRender(
      redirectData.publicPath,
      {
        ...safeObject(options),
        canonicalPath: redirectData.canonicalPath,
        publicPath: redirectData.publicPath,
        requestedPath: redirectData.requestedPath,
        force: true,
        forceRender: true,
        replaceState: options.replaceState !== false,
        source: options.source || "internal-redirect",
      },
      redirectToken
    );
  }

  async function handleDenied({
    access,
    route,
    canonicalPath,
    publicPath,
    rawCanonicalPath,
    username,
    token,
  } = {}) {
    const reason = access?.reason || "blocked";

    if (!isLatestRenderToken(token)) {
      return makeStaleResult(
        token,
        "guard-stale"
      );
    }

    if (reason === "not-authenticated") {
      destroyActiveView();

      const loginPublicPath = safePublicPath(
        access.redirectTo ||
          LOGIN_PATH
      );

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

      if (!isLatestRenderToken(token)) {
        return makeStaleResult(
          token,
          "login-redirect-stale"
        );
      }

      const synced = syncState({
        canonicalPath: LOGIN_PATH,
        publicPath: loginPublicPath,
        username: null,
      });

      repairShellForRoute({
        route: getRoute(LOGIN_PATH),
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        phase: "guard:not-authenticated",
        hideLoading: true,
      });

      safeEmit(
        ROUTER_EVENTS.rendered,
        {
          found: true,
          forbidden: false,
          path: synced.publicPath,
          requestedPath: loginPublicPath,
          canonicalPath: synced.canonicalPath,
          rawCanonicalPath: rawCanonicalPath || canonicalPath,
          publicPath: synced.publicPath,
          username: null,
          redirectedFrom: canonicalPath,
          reason,
          token,
        }
      );

      return {
        ok: true,
        handled: true,
        redirected: true,
        reason,
      };
    }

    if (reason === "already-authenticated") {
      const target = safePublicPath(
        access.redirectTo ||
          getDefaultHome()
      );

      const targetData = getRequestedData(
        target,
        {
          preservePublicPath: true,
        }
      );

      const current = getCurrentComparable();

      if (
        current.canonical === targetData.canonicalPath &&
        current.publicPath === targetData.publicPath
      ) {
        repairShellForRoute({
          route: targetData.route,
          canonicalPath: targetData.canonicalPath,
          publicPath: targetData.publicPath,
          phase: "guard:already-authenticated:same-route",
          hideLoading: true,
        });

        return {
          ok: true,
          handled: true,
          skipped: true,
          reason: "already-authenticated:same-route",
        };
      }

      await redirectInsideRender(
        target,
        {
          replaceState: true,
          force: true,
          forceRender: true,
          source: "guard:already-authenticated",
        }
      );

      return {
        ok: true,
        handled: true,
        redirected: true,
        reason,
      };
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

    if (!isLatestRenderToken(token)) {
      return makeStaleResult(
        token,
        "forbidden-stale"
      );
    }

    const synced = syncState({
      canonicalPath,
      publicPath,
      username,
    });

    repairShellForRoute({
      route,
      canonicalPath: synced.canonicalPath,
      publicPath: synced.publicPath,
      phase: `guard:${reason}`,
      hideLoading: true,
    });

    safeEmit(
      ROUTER_EVENTS.rendered,
      {
        found: true,
        forbidden: true,
        path: synced.publicPath,
        requestedPath: publicPath,
        canonicalPath: synced.canonicalPath,
        rawCanonicalPath: rawCanonicalPath || canonicalPath,
        publicPath: synced.publicPath,
        username: synced.username,
        reason,
        token,
      }
    );

    return {
      ok: true,
      handled: true,
      forbidden: true,
      reason,
    };
  }

  /* =====================================================
     CORE RENDER
  ===================================================== */

  async function executeRender(path = "/", options = {}, token = 0) {
    if (!isLatestRenderToken(token)) {
      return makeStaleResult(
        token,
        "execute-start-stale"
      );
    }

    activeRenderToken = token;

    const startedAt = nowMs();

    const {
      requestedPath,
      canonicalPath,
      rawCanonicalPath,
      publicPath,
      route,
      username,
      matchedBy,
    } = getRequestedData(
      path,
      options
    );

    const historyOptions = getHistoryOptions(
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
        path: publicPath,
        requestedPath,
        canonicalPath,
        rawCanonicalPath,
        publicPath,
        username,
        route,
        matchedBy,
        token,
        options: historyOptions,
      }
    );

    repairShellForRoute({
      route,
      canonicalPath,
      publicPath,
      phase: "before-render",
      hideLoading: false,
    });

    if (!isLatestRenderToken(token)) {
      return makeStaleResult(
        token,
        "after-before-render-stale"
      );
    }

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
        requestedPath: publicPath,
        canonicalPath,
        requestedUsername: username,
        setShellMode: (nextRoute) => setShellMode(AppCore, nextRoute),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });

      if (!isLatestRenderToken(token)) {
        return makeStaleResult(
          token,
          "not-found-stale"
        );
      }

      const synced = syncState({
        canonicalPath,
        publicPath,
        username,
      });

      repairShellForRoute({
        route: null,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        phase: "not-found",
        hideLoading: true,
      });

      safeEmit(
        ROUTER_EVENTS.rendered,
        {
          found: false,
          forbidden: false,
          path: synced.publicPath,
          requestedPath,
          canonicalPath: synced.canonicalPath,
          rawCanonicalPath,
          publicPath: synced.publicPath,
          username: synced.username,
          matchedBy,
          durationMs: Math.round(nowMs() - startedAt),
          token,
        }
      );

      markInitialRouteRendered(true);

      return {
        ok: true,
        found: false,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        token,
      };
    }

    const access = getAccessDecision({
      route,
      canonicalPath,
      publicPath,
    });

    if (!access.allowed) {
      const handled = await handleDenied({
        access,
        route,
        canonicalPath,
        rawCanonicalPath,
        publicPath,
        username,
        token,
      });

      if (handled?.handled) {
        markInitialRouteRendered(true);
        return handled;
      }

      if (handled?.stale) {
        return handled;
      }
    }

    if (!isLatestRenderToken(token)) {
      return makeStaleResult(
        token,
        "after-guards-stale"
      );
    }

    clearDynamicContainers(AppCore);

    setActiveMenu(
      AppCore,
      canonicalPath
    );

    repairShellForRoute({
      route,
      canonicalPath,
      publicPath,
      phase: "after-ui-prep",
      hideLoading: false,
    });

    if (!isLatestRenderToken(token)) {
      return makeStaleResult(
        token,
        "after-ui-prep-stale"
      );
    }

    if (!shouldSkipHistory(historyOptions)) {
      updateHistory({
        AppCore,
        getRoute,
        pathname: publicPath,
        options: historyOptions,
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

      if (!isLatestRenderToken(token)) {
        try {
          view?.destroy?.();
        } catch {}

        return makeStaleResult(
          token,
          "after-view-render-stale"
        );
      }

      activeView = view || null;

      const synced = syncState({
        canonicalPath,
        publicPath,
        username,
      });

      if (synced.canonicalPath !== LOGIN_PATH) {
        markLoginNavigation(false);
      }

      markInitialRouteRendered(true);
      markBootNavigationHandled(true);

      repairShellForRoute({
        route,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        phase: "render-success",
        hideLoading: true,
      });

      schedulePostRenderRepair({
        route,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        phase: "render-success",
      });

      safeEmit(
        ROUTER_EVENTS.rendered,
        {
          found: true,
          forbidden: false,
          path: synced.publicPath,
          requestedPath,
          canonicalPath: synced.canonicalPath,
          rawCanonicalPath,
          publicPath: synced.publicPath,
          username: synced.username,
          matchedBy,
          route,
          routePath: route?.path || null,
          routeName: route?.name || null,
          viewKey: route?.viewKey || null,
          viewName: route?.viewName || null,
          durationMs: Math.round(nowMs() - startedAt),
          token,
        }
      );

      safeLog(
        "render ok",
        synced
      );

      return {
        ok: true,
        found: true,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        token,
      };
    } catch (error) {
      destroyActiveView();

      if (!isLatestRenderToken(token)) {
        return makeStaleResult(
          token,
          "runtime-error-stale"
        );
      }

      renderRouteRuntimeError({
        AppCore,
        getRoute,
        route,
        error,
        requestedPath: publicPath,
        canonicalPath,
        requestedUsername: username,
        setShellMode: (nextRoute) => setShellMode(AppCore, nextRoute),
        setDocumentTitle: (title) => setDocumentTitle(AppCore, title),
      });

      const synced = syncState({
        canonicalPath,
        publicPath,
        username,
      });

      repairShellForRoute({
        route,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        phase: "runtime-error",
        hideLoading: true,
      });

      safeEmit(
        ROUTER_EVENTS.renderError,
        {
          error,
          message: error?.message || String(error),
          canonicalPath: synced.canonicalPath,
          rawCanonicalPath,
          publicPath: synced.publicPath,
          token,
        }
      );

      safeError(
        "render error",
        error
      );

      return {
        ok: false,
        error,
        canonicalPath: synced.canonicalPath,
        publicPath: synced.publicPath,
        token,
      };
    }
  }

  function render(path = "/", options = {}) {
    const token = ++renderToken;
    activeRenderToken = token;

    const opts = safeObject(options);

    renderChain = renderChain
      .catch((error) => {
        safeWarn(
          "renderChain recovered",
          error
        );
      })
      .then(() =>
        executeRender(
          path,
          opts,
          token
        )
      );

    return renderChain;
  }

  /* =====================================================
     NAVIGATION
  ===================================================== */

  function navigate(path = "/", options = {}) {
    const opts = safeObject(options);

    const data = getRequestedData(
      path,
      opts
    );

    const key = `${data.publicPath}|${data.canonicalPath}`;

    const current = getCurrentComparable();

    const sameAsCurrent = Boolean(
      current.canonical === data.canonicalPath &&
        current.publicPath === data.publicPath
    );

    const canSkipSame = Boolean(
      activeView ||
        lastRenderedCanonicalPath ||
        AppCore?.state?.initialRouteRendered
    );

    if (
      canSkipSame &&
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
        repairShellForRoute({
          route: data.route,
          canonicalPath: data.canonicalPath,
          publicPath: data.publicPath,
          phase: "same-route-repair",
          hideLoading: true,
        });

        return resolveNoopNavigation(
          "same-route",
          data
        );
      }
    }

    if (
      isBurst(key) &&
      opts.forceRender !== true &&
      opts.force !== true &&
      opts.allowBurst !== true
    ) {
      return resolveNoopNavigation(
        "burst",
        data
      );
    }

    rememberNav(key);

    const fromLogin = Boolean(
      current.canonical === LOGIN_PATH &&
        data.canonicalPath !== LOGIN_PATH &&
        isAuthenticated()
    );

    if (
      fromLogin ||
      opts.source === "login" ||
      opts.fromLogin === true
    ) {
      markLoginNavigation(true);
    }

    repairShellForRoute({
      route: data.route,
      canonicalPath: data.canonicalPath,
      publicPath: data.publicPath,
      phase: "navigate",
      hideLoading: false,
    });

    return render(
      data.publicPath,
      {
        ...opts,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        requestedPath: data.requestedPath,
      }
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

  function goAfterLogin(fallback = "/", options = {}) {
    const opts = safeObject(options);

    let redirect = "";

    try {
      redirect = new URL(
        window.location.href
      ).searchParams.get("redirect") || "";
    } catch {}

    const resolvedRedirect = resolveSafeRedirect(redirect);

    const target =
      resolvedRedirect ||
      fallback ||
      getDefaultHome();

    return navigate(
      target,
      {
        replaceState: opts.replaceState !== false,
        force: opts.force !== false,
        forceRender: opts.forceRender !== false,
        source: opts.source || "login",
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

    if (
      event.__onionSidebarHandled ||
      event.__onionSidebarEventsHandled ||
      event.__onionRouterHandled
    ) {
      return;
    }

    const link = event.target?.closest?.("a[data-spa]");

    if (!link) {
      return;
    }

    const href = link.getAttribute("href") || "";

    if (!href) {
      return;
    }

    if (link.hasAttribute("download")) {
      return;
    }

    const target = safeText(
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

    try {
      event.__onionRouterHandled = true;
    } catch {}

    navigate(
      href,
      {
        source: "link-click",
      }
    );
  }

  function onPopstate() {
    const path = getBrowserPath();

    const data = getRequestedData(
      path,
      {
        preservePublicPath: true,
        preserveUrl: true,
        source: "popstate",
      }
    );

    render(
      data.publicPath,
      {
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
      }
    );
  }

  function shouldSkipExternalRepair(detail = {}, eventType = "") {
    const source = safeText(detail?.source, "");

    if (
      source === ROUTER_SOURCE ||
      source === "router" ||
      source === "router.index" ||
      source === "router.render"
    ) {
      return true;
    }

    if (
      shellRepairDepth > 0 ||
      externalRepairInFlight
    ) {
      return true;
    }

    const phase = safeText(
      detail?.reason ||
        detail?.phase ||
        eventType ||
        "external-repair",
      "external-repair"
    );

    const current = getCurrentComparable();

    const key = [
      phase,
      current.canonical,
      current.publicPath,
      source,
    ].join("|");

    const timestamp = nowEpochMs();

    if (
      key === lastExternalRepairKey &&
      timestamp - lastExternalRepairAt < EXTERNAL_REPAIR_THROTTLE_MS
    ) {
      return true;
    }

    lastExternalRepairKey = key;
    lastExternalRepairAt = timestamp;

    return false;
  }

  function onExternalRepair(event = null) {
    const detail = getEventDetail(event);
    const eventType = getEventType(event);

    if (
      shouldSkipExternalRepair(
        detail,
        eventType
      )
    ) {
      return;
    }

    externalRepairInFlight = true;

    try {
      const reason =
        detail?.reason ||
        detail?.phase ||
        eventType ||
        "external-repair";

      repairCurrentRoute(reason);
    } finally {
      externalRepairInFlight = false;
    }
  }

  function onAuthSessionReady(event = null) {
    const timestamp = nowEpochMs();

    if (
      authReadyInFlight ||
      timestamp - lastAuthReadyAt < AUTH_READY_THROTTLE_MS
    ) {
      return;
    }

    authReadyInFlight = true;
    lastAuthReadyAt = timestamp;

    try {
      const current = getCurrentComparable();

      repairCurrentRoute(
        event?.type ||
          "auth-session-ready"
      );

      if (
        current.canonical === LOGIN_PATH &&
        isAuthenticated()
      ) {
        goAfterLogin("/");
      }
    } finally {
      authReadyInFlight = false;
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
          api,
          {
            overwrite: true,
            replace: true,
            aliases: ["router"],
            source: ROUTER_SOURCE,
          }
        );

        AppCore.modules.register(
          "router",
          api,
          {
            overwrite: true,
            replace: true,
            aliases: ["Router"],
            source: ROUTER_SOURCE,
          }
        );
      }
    } catch {}

    try {
      if (isFn(AppCore?.modules?.set)) {
        AppCore.modules.set("Router", api);
        AppCore.modules.set("router", api);
      }
    } catch {}

    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules === "object" &&
        !isFn(AppCore.modules.register) &&
        !isFn(AppCore.modules.set)
      ) {
        AppCore.modules.Router = api;
        AppCore.modules.router = api;
      }
    } catch {}

    try {
      if (isBrowser()) {
        window.__ONION_ROUTER__ = api;
      }
    } catch {}

    return true;
  }

  /* =====================================================
     BIND / UNBIND / CONFIG
  ===================================================== */

  function configure(options = {}) {
    configured = true;

    attachToAppCore();

    safeEmit(
      ROUTER_EVENTS.configured,
      {
        options: safeObject(options),
        at: safeIsoDate(),
      }
    );

    return api;
  }

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
        "app:user:change",
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

      disposers.push(
        safeEventOn(
          "app:ui:repair-request",
          onExternalRepair
        )
      );
    }

    ensureInitialHistoryState({
      AppCore,
    });

    safeEmit(
      ROUTER_EVENTS.bound,
      {
        routes: immutableRoutes.map((route) => route.path),
        at: safeIsoDate(),
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
      const off = disposers.pop();

      try {
        off?.();
      } catch {}
    }

    destroyActiveView();

    bound = false;

    safeEmit(
      ROUTER_EVENTS.unbound,
      {
        at: safeIsoDate(),
      }
    );

    return api;
  }

  /* =====================================================
     DEBUG / SNAPSHOT
  ===================================================== */

  function getElementDebugSnapshot(el) {
    if (!el) {
      return {
        exists: false,
      };
    }

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
        shellInteractive: safeText(el.dataset?.shellInteractive, ""),
        loaderVisible: safeText(el.dataset?.loaderVisible, ""),
        loaderState: safeText(el.dataset?.loaderState, ""),
      },
    };
  }

  function getSnapshot() {
    const dom = getDomSnapshot();
    const browserPath = getBrowserPath();
    const browserCanonicalPath = safeCanonicalPath(browserPath);

    let routesSnapshot = [];

    try {
      routesSnapshot = isFn(getRoutesSnapshot)
        ? getRoutesSnapshot()
        : immutableRoutes.map((route) => ({
            path: route.path,
            name: route.name || null,
            viewKey: route.viewKey || null,
            viewName: route.viewName || null,
            layout: route.layout || route.meta?.layout || null,
            shell: route.shell,
          }));
    } catch {
      routesSnapshot = immutableRoutes.map((route) => ({
        path: route.path,
        name: route.name || null,
        viewKey: route.viewKey || null,
        viewName: route.viewName || null,
        layout: route.layout || route.meta?.layout || null,
        shell: route.shell,
      }));
    }

    return sanitizeForLog({
      version: ROUTER_VERSION,

      configured,
      bound,

      renderToken,
      activeRenderToken,

      hasActiveView: Boolean(activeView),

      current: getCurrentComparable(),

      route: AppCore?.state?.route || "/",

      canonicalPath:
        AppCore?.state?.canonicalPath ||
        AppCore?.state?.route ||
        "/",

      publicPath: AppCore?.state?.publicPath || "/",

      browserPath,
      browserCanonicalPath,

      lastNavKey,
      lastNavAt,
      lastNavAtIso: lastNavAt ? safeIsoDate(lastNavAt) : "",

      lastRenderedCanonicalPath,
      lastRenderedPublicPath,
      lastRenderedAt,
      lastRenderedAtIso: lastRenderedAt ? safeIsoDate(lastRenderedAt) : "",

      shellRepairDepth,
      externalRepairInFlight,

      lastExternalRepairKey,
      lastExternalRepairAt,
      lastExternalRepairAtIso: lastExternalRepairAt ? safeIsoDate(lastExternalRepairAt) : "",

      authReadyInFlight,
      lastAuthReadyAt,
      lastAuthReadyAtIso: lastAuthReadyAt ? safeIsoDate(lastAuthReadyAt) : "",

      loginNavigationHandled: Boolean(AppCore?.state?.loginNavigationHandled),
      initialRouteRendered: Boolean(AppCore?.state?.initialRouteRendered),
      bootNavigationHandled: Boolean(AppCore?.state?.bootNavigationHandled),

      authenticated: isAuthenticated(),

      routes: routesSnapshot,

      dom: {
        bodyClasses: dom.body?.className || "",
        htmlClasses: dom.html?.className || "",

        bodyShell: dom.body?.dataset?.shell || null,
        htmlShell: dom.html?.dataset?.shell || null,

        bodyChrome: dom.body?.dataset?.chrome || null,
        htmlChrome: dom.html?.dataset?.chrome || null,

        bodyRouteMode: dom.body?.dataset?.routeMode || null,
        htmlRouteMode: dom.html?.dataset?.routeMode || null,

        hasShell: Boolean(dom.shell),
        hasMain: Boolean(dom.main),
        hasAppContent: Boolean(dom.appContent),
        hasView: Boolean(dom.view),
        hasSidebarMount: Boolean(dom.sidebarMount),
        hasTopbarMount: Boolean(dom.topbarMount),
        hasSidebar: Boolean(dom.sidebar),
        hasTopbar: Boolean(dom.topbar),
        hasTablehead: Boolean(dom.tablehead),
        hasLoader: Boolean(dom.loader),

        shell: getElementDebugSnapshot(dom.shell),
        main: getElementDebugSnapshot(dom.main),
        appContent: getElementDebugSnapshot(dom.appContent),
        view: getElementDebugSnapshot(dom.view),
        sidebarMount: getElementDebugSnapshot(dom.sidebarMount),
        topbarMount: getElementDebugSnapshot(dom.topbarMount),
        sidebar: getElementDebugSnapshot(dom.sidebar),
        topbar: getElementDebugSnapshot(dom.topbar),
        tablehead: getElementDebugSnapshot(dom.tablehead),
        tableheadContainer: getElementDebugSnapshot(dom.tableheadContainer),
        loader: getElementDebugSnapshot(dom.loader),
      },
    });
  }

  function debug(path = "") {
    const target = safeText(path, "");

    const snapshot = target
      ? {
          target: redactSensitiveText(target),
          data: sanitizeForLog(
            getRequestedData(
              target,
              {
                preservePublicPath: true,
                preserveUrl: true,
              }
            )
          ),
          match: sanitizeForLog(getRouteMatch(target)),
          snapshot: getSnapshot(),
        }
      : getSnapshot();

    try {
      console.log("[Router:debug]", snapshot);
    } catch {}

    return snapshot;
  }

  function repairShellPublic(payload = {}) {
    if (typeof payload === "string") {
      return repairCurrentRoute(payload);
    }

    const data = safeObject(payload);

    if (
      !data.route &&
      (
        data.canonicalPath ||
        data.publicPath
      )
    ) {
      const resolved = getRequestedData(
        data.publicPath ||
          data.canonicalPath ||
          getBrowserPath(),
        {
          preservePublicPath: true,
          preserveUrl: true,
        }
      );

      return repairShellForRoute({
        ...data,
        route: data.route || resolved.route,
        canonicalPath: data.canonicalPath || resolved.canonicalPath,
        publicPath: data.publicPath || resolved.publicPath,
      });
    }

    return repairShellForRoute(data);
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    version: ROUTER_VERSION,

    routes: immutableRoutes,

    configure,
    bind,
    unbind,

    getRoute,
    routeExists,
    getRouteMatch,

    getCurrentPath: () => getCurrentPath(AppCore),

    getCurrentCanonicalPath: () => getCurrentCanonicalPath(AppCore),

    getCurrentPublicPath: () => getCurrentPublicPath(AppCore),

    getCurrentResolvedUsername: () =>
      resolveUsername(
        getCurrentPublicPath(AppCore) || "/"
      ),

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

    stripUsernamePrefix: (pathname = "/") =>
      stripUsernamePrefix(
        AppCore,
        pathname
      ),

    extractUsernameFromPath: (pathname = "/") =>
      extractUsernameFromPath(
        AppCore,
        pathname
      ),

    resolveSpaHref: (href = "/") =>
      resolveSpaHref(
        AppCore,
        href
      ),

    isSlugCandidatePath: (pathname = "/") =>
      isSlugCandidatePath(
        AppCore,
        pathname
      ),

    isSameCanonicalPath: (a = "/", b = "/") =>
      isSameCanonicalPath(
        AppCore,
        a,
        b
      ),

    canUsePublicSlugForRoute,

    getRequestedData,

    getDefaultHome,

    safePath,
    safePublicPath,
    safeCanonicalPath,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    getState: getSnapshot,

    debug,
  };

  return api;
})();

export default Router;
