/* =========================================================
   Onion SPA - Router
   Archivo: src/router/index.js

   FINAL EXTREME SYSTEM · ROUTER / NAVIGATION / RENDER PIPELINE · 12/10
   PATCH · CANONICAL/PUBLIC PATH HARD LOCKED
   PATCH · SIDEBAR ACTIVE ROUTE SAFE
   PATCH · ROUTE ALIASES SAFE
   PATCH · LOGIN/RESTORE DEADLOCK SAFE
   PATCH · RENDER TOKEN RACE SAFE
   PATCH · SHELL REPAIR DEDUPED
   PATCH · UI REPAIR LOOP SAFE
   PATCH · TOKEN ROUTES SAFE
   PATCH · DEBUG REDACTED

   RESPONSABILIDADES:
   - coordinar navegación SPA
   - resolver rutas canónicas y públicas
   - serializar renders para evitar race conditions
   - aplicar guards de acceso
   - conectar history, shell y render del router
   - exponer API pública estable
   - reparar shell / UI tras login, restore y navegación privada
   - evitar panel debajo del sidebar tras login
   - evitar deadlocks internos de navegación
   - evitar loops por eventos de reparación
   - mantener compatibilidad con AppCore / Auth / shell legacy
   - distinguir estrictamente canonicalPath y publicPath
   - soportar rutas públicas con /@username
   - soportar rutas técnicas con token en path/query/hash-router
   - no romper hash-router legacy
   - no duplicar eventos bus/window
   - no forzar sidebar open/close desde navegación

   FIXES CRÍTICOS:
   - renderToken se reserva al encolar, no al empezar executeRender()
   - renders obsoletos quedan cancelados lógicamente antes de pintar
   - redirects internos del guard NO llaman navigate() dentro del renderChain
   - elimina deadlock de already-authenticated -> navigate()
   - Router ignora sus propios app:ui:repair-request
   - safeEventOn usa window solo como fallback real
   - safeEmit NO duplica AppCore.events + window
   - reparación de shell reentrante protegida
   - navegación same-route/burst más controlada
   - reparación post-render no pisa navegación nueva
   - Router NO escucha app:user-ui:sync para evitar bucles
   - repairShellForRoute no emite app:ui:repair-request por defecto
   - aliases /tickets, /invoices, /users, etc. resuelven a canónicos
   - /@cristian/facturas NO puede caer a /
   - /@cristian/incidencias NO puede marcar Facturas
   - /facturas queda canonicalPath /facturas y publicPath /facturas o /@user/facturas
   - /incidencias queda canonicalPath /incidencias y publicPath /incidencias o /@user/incidencias

   FIX ROUTE SCOPE:
   - /@cristian/incidencias -> publicPath
   - /incidencias           -> canonicalPath
   - Router.render(path, options) respeta options.canonicalPath/options.publicPath
   - getRequestedData() no permite que /@usuario/ruta caiga a "/" salvo HOME real
   - /@usuario y /@usuario/ sí son HOME válido
   - navigate() conserva canonicalPath/publicPath en el render encolado
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
     INTERNAL STATE
  ===================================================== */

  const immutableRoutes =
    getImmutableRoutes();

  const PUBLIC_AUTH_PATHS =
    new Set([
      ROUTE_PATHS?.LOGIN || "/login",
      "/signin",
      "/sign-in",

      ROUTE_PATHS?.ACTIVATE_ACCOUNT || "/activate-account",

      ROUTE_PATHS?.RESET_PASSWORD || "/reset-password",
      ROUTE_PATHS?.RESET_PASSWORD_CONFIRM || "/reset-password/confirm",

      ROUTE_PATHS?.FORGOT_PASSWORD || "/forgot-password",
      ROUTE_PATHS?.RECOVER_PASSWORD || "/recover-password",
      ROUTE_PATHS?.PASSWORD_RESET || "/password-reset",

      "/2fa",
      "/otp",
    ]);

  const PUBLIC_AUTH_PREFIXES =
    [
      `${ROUTE_PATHS?.ACTIVATE_ACCOUNT || "/activate-account"}/`,
      `${ROUTE_PATHS?.RESET_PASSWORD_CONFIRM || "/reset-password/confirm"}/`,
    ];

  const TECHNICAL_ROUTE_BASES =
    [
      ROUTE_PATHS?.ACTIVATE_ACCOUNT || "/activate-account",
      ROUTE_PATHS?.RESET_PASSWORD_CONFIRM || "/reset-password/confirm",
    ];

  const NAV_BURST_MS =
    160;

  const POST_RENDER_REPAIR_DELAY =
    0;

  const EXTERNAL_REPAIR_THROTTLE_MS =
    140;

  const AUTH_READY_THROTTLE_MS =
    180;

  const SELF_REPAIR_SOURCE =
    "router.index";

  let bound =
    false;

  let configured =
    false;

  let renderChain =
    Promise.resolve();

  let renderToken =
    0;

  let activeRenderToken =
    0;

  let activeView =
    null;

  const disposers =
    [];

  let lastNavAt =
    0;

  let lastNavKey =
    "";

  let lastRenderedCanonicalPath =
    "";

  let lastRenderedPublicPath =
    "";

  let lastRenderedAt =
    0;

  let shellRepairDepth =
    0;

  let externalRepairInFlight =
    false;

  let lastExternalRepairKey =
    "";

  let lastExternalRepairAt =
    0;

  let authReadyInFlight =
    false;

  let lastAuthReadyAt =
    0;

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

  function safeBoolean(value, fallback = false) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    if (typeof value === "string") {
      const key =
        value
          .trim()
          .toLowerCase();

      if (
        [
          "true",
          "1",
          "yes",
          "si",
          "sí",
          "ok",
          "on",
        ].includes(key)
      ) {
        return true;
      }

      if (
        [
          "false",
          "0",
          "no",
          "off",
        ].includes(key)
      ) {
        return false;
      }
    }

    return fallback;
  }

  function redactForLog(value, depth = 0) {
    if (depth > 4) {
      return "[MaxDepth]";
    }

    if (
      value === null ||
      value === undefined
    ) {
      return value;
    }

    if (typeof value === "string") {
      return redactTokenInText(value);
    }

    if (
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (value instanceof Error) {
      return {
        name:
          value.name || "Error",
        message:
          redactTokenInText(value.message || ""),
        code:
          value.code || null,
        status:
          value.status || value.statusCode || null,
        stack:
          redactTokenInText(value.stack || ""),
      };
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        redactForLog(
          item,
          depth + 1
        )
      );
    }

    if (
      value &&
      typeof value === "object"
    ) {
      const output =
        {};

      for (const [key, item] of Object.entries(value)) {
        const lowerKey =
          String(key).toLowerCase();

        if (
          lowerKey.includes("token") ||
          lowerKey === "authorization" ||
          lowerKey === "password" ||
          lowerKey === "secret"
        ) {
          output[key] =
            item ? "***" : item;
          continue;
        }

        output[key] =
          redactForLog(
            item,
            depth + 1
          );
      }

      return output;
    }

    return value;
  }

  function safeLog(...args) {
    const safeArgs =
      args.map((item) =>
        redactForLog(item)
      );

    try {
      AppCore?.utils?.log?.(
        "[Router]",
        ...safeArgs
      );
    } catch {}
  }

  function safeWarn(...args) {
    const safeArgs =
      args.map((item) =>
        redactForLog(item)
      );

    try {
      AppCore?.utils?.warn?.(
        "[Router]",
        ...safeArgs
      );
    } catch {}

    try {
      if (AppCore?.config?.debug) {
        console.warn(
          "[Router]",
          ...safeArgs
        );
      }
    } catch {}
  }

  function safeError(...args) {
    const safeArgs =
      args.map((item) =>
        redactForLog(item)
      );

    try {
      AppCore?.utils?.error?.(
        "[Router]",
        ...safeArgs
      );
    } catch {
      try {
        console.error(
          "[Router]",
          ...safeArgs
        );
      } catch {}
    }
  }

  function safeEmit(eventName, payload = {}, options = {}) {
    const name =
      safeText(eventName, "");

    if (!name) {
      return false;
    }

    const opts =
      safeObject(options);

    const finalPayload =
      opts.redact === true
        ? redactForLog(payload)
        : payload;

    let busAvailable =
      false;

    let busEmitted =
      false;

    try {
      if (isFn(AppCore?.events?.emit)) {
        busAvailable =
          true;

        AppCore.events.emit(
          name,
          finalPayload
        );

        busEmitted =
          true;
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
        window.dispatchEvent(
          new CustomEvent(name, {
            detail:
              finalPayload,
          })
        );

        return true;
      } catch {}
    }

    return busEmitted;
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
        const off =
          AppCore.events.on(
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

  function isLatestRenderToken(token) {
    return Boolean(
      token &&
        token === renderToken
    );
  }

  function makeStaleResult(token, reason = "stale-render") {
    return {
      ok:
        false,
      skipped:
        true,
      stale:
        true,
      reason,
      token,
      currentToken:
        renderToken,
    };
  }

  function markRenderedRoute({
    canonicalPath = "",
    publicPath = "",
  } = {}) {
    lastRenderedCanonicalPath =
      stripSearchAndHash(canonicalPath || "");

    lastRenderedPublicPath =
      safeText(publicPath, "") ||
      lastRenderedCanonicalPath;

    lastRenderedAt =
      nowEpochMs();
  }

  /* =====================================================
     PATH HELPERS
  ===================================================== */

  function normalizePathnameOnly(pathname = "/") {
    let value =
      safeText(pathname, "/")
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) {
      value =
        `/${value}`;
    }

    if (value.length > 1) {
      value =
        value.replace(/\/+$/g, "") ||
        "/";
    }

    return value || "/";
  }

  function normalizeSearch(search = "") {
    const value =
      safeText(search, "");

    if (!value) {
      return "";
    }

    return value.startsWith("?")
      ? value
      : `?${value.replace(/^\?+/, "")}`;
  }

  function normalizeHash(hash = "") {
    const value =
      safeText(hash, "");

    if (!value) {
      return "";
    }

    return value.startsWith("#")
      ? value
      : `#${value.replace(/^#+/, "")}`;
  }

  function isHashRouterPath(value = "") {
    const raw =
      safeText(value, "");

    return (
      raw.startsWith("#/") ||
      raw.startsWith("#!")
    );
  }

  function normalizeHashRouterPath(value = "") {
    const raw =
      safeText(value, "");

    if (!raw) {
      return "/";
    }

    if (raw.startsWith("#!")) {
      return raw.replace(/^#!\/?/, "/") || "/";
    }

    return raw.replace(/^#\/?/, "/") || "/";
  }

  function splitFullPath(value = "/") {
    const raw =
      safeText(value, "/");

    if (isHashRouterPath(raw)) {
      return splitFullPath(
        normalizeHashRouterPath(raw)
      );
    }

    let pathname =
      raw;

    let search =
      "";

    let hash =
      "";

    const hashIndex =
      pathname.indexOf("#");

    if (hashIndex >= 0) {
      hash =
        pathname.slice(hashIndex);

      pathname =
        pathname.slice(0, hashIndex) ||
        "/";
    }

    const searchIndex =
      pathname.indexOf("?");

    if (searchIndex >= 0) {
      search =
        pathname.slice(searchIndex);

      pathname =
        pathname.slice(0, searchIndex) ||
        "/";
    }

    return {
      pathname:
        normalizePathnameOnly(pathname),
      search:
        normalizeSearch(search),
      hash:
        normalizeHash(hash),
    };
  }

  function normalizeLocalFullPath(path = "/") {
    const raw =
      safeText(path, "/");

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
        const parsed =
          new URL(
            raw,
            isBrowser()
              ? window.location.origin
              : "http://localhost"
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
    } =
      splitFullPath(raw);

    return `${pathname}${search}${hash}`;
  }

  function stripSearchAndHash(path = "/") {
    const raw =
      safeText(path, "/") ||
      "/";

    let value =
      raw
        .split("?")[0]
        .split("#")[0] ||
      "/";

    value =
      value
        .trim()
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) {
      value =
        `/${value}`;
    }

    if (value.length > 1) {
      value =
        value.replace(/\/+$/g, "") ||
        "/";
    }

    return value;
  }

  function isUsernameSegment(segment = "") {
    const raw =
      safeText(segment, "");

    return /^@[A-Za-z0-9._-]{1,80}$/.test(raw);
  }

  function isUsernameScopedPath(path = "") {
    const clean =
      stripSearchAndHash(path);

    const first =
      clean
        .split("/")
        .filter(Boolean)[0] ||
      "";

    return isUsernameSegment(first);
  }

  function getUsernameScopedSegments(path = "") {
    const {
      pathname,
    } =
      splitFullPath(path || "/");

    return pathname
      .split("/")
      .filter(Boolean);
  }

  function isUsernameHomePublicPath(path = "") {
    const segments =
      getUsernameScopedSegments(path);

    return Boolean(
      segments.length === 1 &&
        isUsernameSegment(segments[0])
    );
  }

  function shouldBlockUsernameHomeFallback({
    publicPath = "/",
    canonicalPath = "/",
  } = {}) {
    const cleanPublicPath =
      stripSearchAndHash(publicPath);

    const cleanCanonicalPath =
      stripSearchAndHash(canonicalPath);

    return Boolean(
      isUsernameScopedPath(cleanPublicPath) &&
        !isUsernameHomePublicPath(cleanPublicPath) &&
        cleanCanonicalPath === "/" &&
        cleanPublicPath !== "/"
    );
  }

  function stripUsernamePrefixLocal(path = "/") {
    const {
      pathname,
      search,
      hash,
    } =
      splitFullPath(path);

    const segments =
      pathname
        .split("/")
        .filter(Boolean);

    if (
      segments.length > 0 &&
      isUsernameSegment(segments[0])
    ) {
      const rest =
        segments
          .slice(1)
          .join("/");

      const cleanPathname =
        rest
          ? normalizePathnameOnly(`/${rest}`)
          : "/";

      return `${cleanPathname}${search}${hash}`;
    }

    return `${pathname}${search}${hash}`;
  }

  function applyRouteAliasSafe(path = "/") {
    const normalized =
      normalizeLocalFullPath(path || "/");

    const {
      pathname,
      search,
      hash,
    } =
      splitFullPath(normalized);

    try {
      if (isFn(resolveRouteAlias)) {
        const aliased =
          resolveRouteAlias(pathname);

        return `${normalizePathnameOnly(aliased || pathname)}${search}${hash}`;
      }
    } catch {}

    return `${pathname}${search}${hash}`;
  }

  function canonicalizePath(path = "/") {
    const normalized =
      normalizeLocalFullPath(path || "/");

    const stripped =
      stripUsernamePrefixLocal(normalized);

    const aliased =
      applyRouteAliasSafe(stripped);

    return normalizeLocalFullPath(aliased || "/");
  }

  function safePublicPath(path = "/") {
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

    return normalizeLocalFullPath(raw);
  }

  function safeCanonicalPath(path = "/") {
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

    return canonicalizePath(raw);
  }

  function isPublicAuthPath(path = "/") {
    const clean =
      stripSearchAndHash(
        canonicalizePath(path)
      );

    if (PUBLIC_AUTH_PATHS.has(clean)) {
      return true;
    }

    return PUBLIC_AUTH_PREFIXES.some(
      (prefix) =>
        clean.startsWith(prefix)
    );
  }

  function getTechnicalRouteBase(path = "/") {
    const clean =
      stripSearchAndHash(
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
          ? normalizeLocalFullPath(
              hash.replace(/^#!\/?/, "/")
            )
          : normalizeLocalFullPath(
              hash.replace(/^#\/?/, "/")
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
    const localCanonical =
      canonicalizePath(path);

    let helperCanonical =
      "";

    try {
      helperCanonical =
        normalizeCanonicalPath(
          AppCore,
          path
        ) || "";
    } catch {}

    helperCanonical =
      helperCanonical
        ? canonicalizePath(helperCanonical)
        : "";

    const localClean =
      stripSearchAndHash(localCanonical);

    const helperClean =
      stripSearchAndHash(helperCanonical);

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
        route:
          exact,
        canonicalPath:
          stripSearchAndHash(exact.path),
        rawCanonicalPath:
          cleanCanonical,
        matchedBy:
          "exact",
      };
    }

    const aliasCanonical =
      stripSearchAndHash(
        applyRouteAliasSafe(cleanCanonical)
      );

    if (aliasCanonical !== cleanCanonical) {
      const aliasMatch =
        immutableRoutes.find(
          (route) =>
            stripSearchAndHash(route?.path) === aliasCanonical
        );

      if (aliasMatch) {
        return {
          route:
            aliasMatch,
          canonicalPath:
            stripSearchAndHash(aliasMatch.path),
          rawCanonicalPath:
            cleanCanonical,
          matchedBy:
            "alias",
        };
      }
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
          route:
            technicalRoute,
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
            canonicalPath:
              stripSearchAndHash(route.path || cleanCanonical),
            rawCanonicalPath:
              cleanCanonical,
            matchedBy:
              "route.aliases",
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
      route:
        null,
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
    return Boolean(
      getRoute(path)
    );
  }

  function getCurrentComparable() {
    const canonical =
      safeCanonicalPath(
        getCurrentCanonicalPath(AppCore) ||
          AppCore?.state?.route ||
          lastRenderedCanonicalPath ||
          "/"
      );

    const publicPath =
      safePublicPath(
        getCurrentPublicPath(AppCore) ||
          AppCore?.state?.publicPath ||
          lastRenderedPublicPath ||
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
        return Boolean(
          Auth.isAuthenticated()
        );
      }
    } catch {}

    const state =
      safeObject(AppCore?.state);

    if (state.authenticated === true) {
      return true;
    }

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
        options.preservePublicPath === true ||
        options.preserveUrl === true ||
        options.protectedInitialUrl === true,

      skipHistory:
        options.skipHistory === true ||
        options.protectedInitialUrl === true ||
        (
          options.initialRender === true &&
          options.preserveUrl === true
        ),

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
        AppCore.state[name] =
          Boolean(value);
      }
    } catch {}

    try {
      AppCore?.setState?.({
        [name]:
          Boolean(value),
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
      ok:
        true,
      skipped:
        true,
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
        html:
          null,
        body:
          null,
        shell:
          null,
        main:
          null,
        appContent:
          null,
        view:
          null,
        sidebar:
          null,
        topbar:
          null,
        tablehead:
          null,
        tableheadContainer:
          null,
        loader:
          null,
      };
    }

    const shell =
      document.getElementById("app-shell") ||
      document.querySelector("[data-app-shell='true']") ||
      document.querySelector("[data-app-shell]") ||
      document.querySelector(".app-shell") ||
      document.querySelector(".layout") ||
      null;

    const main =
      document.getElementById("main-content") ||
      document.querySelector("main.main-content") ||
      document.querySelector(".main-content") ||
      document.querySelector("main[role='main']") ||
      document.querySelector("main") ||
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
      document.querySelector("#app-sidebar") ||
      document.querySelector(".sidebar") ||
      document.querySelector("#sidebar") ||
      document.querySelector("[data-sidebar-root]") ||
      document.querySelector("[data-sidebar='true']") ||
      null;

    const topbar =
      AppCore?.dom?.topbar ||
      document.querySelector("#app-topbar") ||
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
        AppCore.dom.appShell =
          shell;
        AppCore.dom.shell =
          shell;
        AppCore.dom.layout =
          shell;
        AppCore.dom.mainContent =
          main;
        AppCore.dom.main =
          main;
        AppCore.dom.appContent =
          appContent;
        AppCore.dom.viewContainer =
          view;
        AppCore.dom.sidebar =
          sidebar;
        AppCore.dom.topbar =
          topbar;
        AppCore.dom.tablehead =
          tablehead;
        AppCore.dom.tableheadContainer =
          tableheadContainer;
        AppCore.dom.loader =
          loader;
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
      el.hidden =
        next;
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
    if (
      !el ||
      !key
    ) {
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

      el.dataset[key] =
        String(value);
    } catch {}
  }

  function isShellHiddenRoute(route, canonicalPath = "/") {
    const canonical =
      stripSearchAndHash(
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
    } =
      getDomSnapshot();

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

      loader.dataset.loaderVisible =
        "false";

      loader.hidden =
        true;
    } catch {}

    safeEmit(
      "app:loader:hidden",
      {
        reason,
        source:
          SELF_REPAIR_SOURCE,
      }
    );

    return true;
  }

  function emitRepairRequest(payload = {}) {
    safeEmit(
      "app:ui:repair-request",
      {
        ...safeObject(payload),
        source:
          SELF_REPAIR_SOURCE,
      }
    );
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

    if (shellRepairDepth > 4) {
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
      } =
        getDomSnapshot();

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

        html.classList.add(
          "app-ready"
        );

        body.classList.add(
          "app-ready"
        );
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

      setDataset(
        html,
        "chrome",
        shellHidden ? "hidden" : "visible"
      );

      setDataset(
        body,
        "chrome",
        shellHidden ? "hidden" : "visible"
      );

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

        setDataset(body, "shell", "visible");
        setDataset(html, "shell", "visible");

        setDataset(shell, "shell", "visible");
        setDataset(shell, "chrome", "hidden");
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
            shellVisible:
              false,
            chromeVisible:
              false,
            appShellVisible:
              true,
            routeShellHidden:
              true,
            authScreen:
              true,
          });
        } catch {
          try {
            if (AppCore?.state) {
              AppCore.state.shellVisible =
                false;
              AppCore.state.chromeVisible =
                false;
              AppCore.state.appShellVisible =
                true;
              AppCore.state.routeShellHidden =
                true;
              AppCore.state.authScreen =
                true;
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

        setDataset(body, "shell", "visible");
        setDataset(html, "shell", "visible");

        setDataset(shell, "shell", "visible");
        setDataset(shell, "chrome", "visible");
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
            shellVisible:
              true,
            chromeVisible:
              true,
            appShellVisible:
              true,
            routeShellHidden:
              false,
            authScreen:
              false,
          });
        } catch {
          try {
            if (AppCore?.state) {
              AppCore.state.shellVisible =
                true;
              AppCore.state.chromeVisible =
                true;
              AppCore.state.appShellVisible =
                true;
              AppCore.state.routeShellHidden =
                false;
              AppCore.state.authScreen =
                false;
            }
          } catch {}
        }
      }

      setBusy(shell, false);
      setBusy(main, false);
      setBusy(appContent, false);
      setBusy(view, false);

      if (hideLoading) {
        hideLoader(
          `router:${phase}`
        );
      }

      if (emitRepair) {
        emitRepairRequest({
          phase,
          shellHidden,
          canonicalPath,
          publicPath,
          authenticated:
            isAuthenticated(),
        });
      }

      safeEmit(
        "router:shell:state",
        {
          phase,
          shellHidden,
          canonicalPath,
          publicPath,
          routePath:
            route?.path || null,
          routeName:
            route?.name || null,
          viewKey:
            route?.viewKey || null,
          viewName:
            route?.viewName || null,
          hasSidebar:
            Boolean(sidebar),
          hasTopbar:
            Boolean(topbar),
          hasShell:
            Boolean(shell),
          source:
            SELF_REPAIR_SOURCE,
        }
      );

      return true;
    } finally {
      shellRepairDepth =
        Math.max(
          0,
          shellRepairDepth - 1
        );
    }
  }

  function schedulePostRenderRepair(payload = {}) {
    const tokenAtSchedule =
      renderToken;

    afterPaint(() => {
      if (tokenAtSchedule !== renderToken) {
        return;
      }

      repairShellForRoute({
        ...payload,
        phase:
          `${payload.phase || "post-render"}:after-paint`,
        hideLoading:
          true,
        emitRepair:
          false,
      });
    });
  }

  function repairCurrentRoute(phase = "external-repair") {
    const path =
      getBrowserPath();

    const data =
      getRequestedData(
        path,
        {
          preservePublicPath:
            true,
          preserveUrl:
            true,
          source:
            "repair-current-route",
        }
      );

    return repairShellForRoute({
      route:
        data.route,
      canonicalPath:
        data.canonicalPath,
      publicPath:
        data.publicPath,
      phase,
      hideLoading:
        true,
      emitRepair:
        false,
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

  function shouldPreservePublicPath(options = {}) {
    return Boolean(
      options.preservePublicPath === true ||
        options.preservePath === true ||
        options.preserveUrl === true ||
        options.protectedInitialUrl === true ||
        options.initialRender === true
    );
  }

  function normalizeExplicitCanonical(input = "") {
    const raw =
      safeText(input, "");

    if (!raw) {
      return "";
    }

    return stripSearchAndHash(
      safeCanonicalPath(raw)
    );
  }

  function normalizeExplicitPublic(input = "") {
    const raw =
      safeText(input, "");

    if (!raw) {
      return "";
    }

    return safePublicPath(raw);
  }

  function getRequestedData(path = "/", options = {}) {
    const opts =
      safeObject(options);

    const explicitCanonicalPath =
      normalizeExplicitCanonical(
        opts.canonicalPath ||
          (
            typeof opts.route === "string"
              ? opts.route
              : opts.route?.path || ""
          )
      );

    const explicitPublicPath =
      normalizeExplicitPublic(
        opts.publicPath ||
          opts.requestedPath ||
          ""
      );

    const resolvedHref =
      resolveSpaHref(
        AppCore,
        path
      ) || path;

    const requestedPath =
      safePublicPath(resolvedHref);

    const canonicalInput =
      explicitCanonicalPath
        ? safeCanonicalPath(explicitCanonicalPath)
        : safeCanonicalPath(requestedPath);

    const match =
      getRouteMatch(canonicalInput);

    const route =
      match.route;

    const canonicalPath =
      match.canonicalPath;

    const rawCanonicalPath =
      match.rawCanonicalPath;

    const username =
      resolveUsername(
        explicitPublicPath ||
          requestedPath ||
          canonicalPath
      );

    let publicPath =
      explicitPublicPath ||
      requestedPath ||
      canonicalPath ||
      "/";

    if (
      !publicPath ||
      publicPath === "/"
    ) {
      publicPath =
        canonicalPath || "/";
    }

    if (
      canUsePublicSlugForRoute(route) &&
      !shouldPreservePublicPath(opts)
    ) {
      const builtPublicPath =
        buildPublicPath(
          AppCore,
          getRoute,
          canonicalPath,
          {
            username,
            resolvedUsername:
              username,
            fromPath:
              requestedPath,
            publicPath:
              requestedPath,
            canonicalPath,
          }
        );

      publicPath =
        safePublicPath(
          builtPublicPath ||
            publicPath ||
            canonicalPath
        );
    }

    if (match.matchedBy === "technical-prefix") {
      publicPath =
        safePublicPath(
          explicitPublicPath ||
            requestedPath ||
            publicPath
        );
    }

    if (
      match.matchedBy === "alias" ||
      match.matchedBy === "route.aliases"
    ) {
      publicPath =
        safePublicPath(
          explicitPublicPath ||
            canonicalPath ||
            publicPath
        );
    }

    if (
      isUsernameHomePublicPath(publicPath) &&
      stripSearchAndHash(canonicalPath) === "/"
    ) {
      return {
        requestedPath,
        canonicalPath:
          "/",
        rawCanonicalPath:
          rawCanonicalPath || "/",
        publicPath,
        route,
        username,
        matchedBy:
          match.matchedBy === "none"
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
      const repairedCanonical =
        stripSearchAndHash(
          safeCanonicalPath(publicPath)
        );

      const repairedMatch =
        getRouteMatch(repairedCanonical);

      if (repairedMatch.route) {
        return {
          requestedPath,
          canonicalPath:
            repairedMatch.canonicalPath,
          rawCanonicalPath:
            repairedMatch.rawCanonicalPath,
          publicPath,
          route:
            repairedMatch.route,
          username,
          matchedBy:
            `repaired-username-scope:${repairedMatch.matchedBy}`,
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
          matchedBy:
            match.matchedBy,
        }
      );

      return {
        requestedPath,
        canonicalPath:
          repairedCanonical || canonicalPath,
        rawCanonicalPath:
          repairedCanonical || rawCanonicalPath || canonicalPath,
        publicPath,
        route:
          null,
        username,
        matchedBy:
          "blocked-username-home-fallback",
      };
    }

    if (
      isUsernameScopedPath(publicPath) &&
      stripSearchAndHash(canonicalPath) === "/" &&
      stripSearchAndHash(publicPath) !== "/"
    ) {
      const repairedCanonical =
        stripSearchAndHash(
          safeCanonicalPath(publicPath)
        );

      const repairedMatch =
        getRouteMatch(repairedCanonical);

      if (repairedMatch.route) {
        return {
          requestedPath,
          canonicalPath:
            repairedMatch.canonicalPath,
          rawCanonicalPath:
            repairedMatch.rawCanonicalPath,
          publicPath,
          route:
            repairedMatch.route,
          username,
          matchedBy:
            `repaired-${repairedMatch.matchedBy}`,
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
      safePublicPath(
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

    activeView =
      null;

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
        safeCanonicalPath(canonicalPath || "/")
      );

    const safePublic =
      safePublicPath(
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
        canonicalPath:
          safeCanonical,
        publicPath:
          safePublic,
        currentResolvedUsername:
          username || null,
      });
    } catch {
      try {
        if (
          AppCore?.state &&
          typeof AppCore.state === "object"
        ) {
          AppCore.state.route =
            safeCanonical;
          AppCore.state.canonicalPath =
            safeCanonical;
          AppCore.state.publicPath =
            safePublic;
          AppCore.state.currentResolvedUsername =
            username || null;
        }
      } catch {}
    }

    markRenderedRoute({
      canonicalPath:
        safeCanonical,
      publicPath:
        safePublic,
    });

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
      nowEpochMs();
  }

  function isBurst(key = "") {
    return Boolean(
      key &&
        key === lastNavKey &&
        nowEpochMs() - lastNavAt < NAV_BURST_MS
    );
  }

  /* =====================================================
     INTERNAL REDIRECT
  ===================================================== */

  async function redirectInsideRender(target = "/", options = {}) {
    const redirectTarget =
      safePublicPath(
        target ||
          getDefaultHome()
      );

    const redirectData =
      getRequestedData(
        redirectTarget,
        {
          ...safeObject(options),
          preservePublicPath:
            true,
          preserveUrl:
            true,
        }
      );

    const redirectToken =
      ++renderToken;

    activeRenderToken =
      redirectToken;

    safeEmit(
      "router:internal-redirect",
      {
        target:
          redirectTarget,
        canonicalPath:
          redirectData.canonicalPath,
        publicPath:
          redirectData.publicPath,
        token:
          redirectToken,
        options:
          safeObject(options),
        source:
          SELF_REPAIR_SOURCE,
      }
    );

    return executeRender(
      redirectData.publicPath,
      {
        ...safeObject(options),
        canonicalPath:
          redirectData.canonicalPath,
        publicPath:
          redirectData.publicPath,
        force:
          true,
        forceRender:
          true,
        replaceState:
          options.replaceState !== false,
        source:
          options.source || "internal-redirect",
      },
      redirectToken
    );
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
        access &&
        typeof access === "object"
      ) {
        return {
          allowed:
            access.allowed !== false,
          ...access,
        };
      }

      return {
        allowed:
          true,
      };
    } catch (error) {
      safeError(
        "shouldAllowRoute() falló.",
        {
          route:
            route?.path || null,
          canonicalPath,
          publicPath,
          error,
        }
      );

      return {
        allowed:
          false,
        reason:
          "guard-error",
        error,
      };
    }
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
    const reason =
      access?.reason || "blocked";

    if (!isLatestRenderToken(token)) {
      return makeStaleResult(
        token,
        "guard-stale"
      );
    }

    if (reason === "not-authenticated") {
      destroyActiveView();

      const loginPublicPath =
        safePublicPath(
          access.redirectTo ||
            ROUTE_PATHS?.LOGIN ||
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

      if (!isLatestRenderToken(token)) {
        return makeStaleResult(
          token,
          "login-redirect-stale"
        );
      }

      const synced =
        syncState({
          canonicalPath:
            ROUTE_PATHS?.LOGIN || "/login",
          publicPath:
            loginPublicPath,
          username:
            null,
        });

      repairShellForRoute({
        route:
          getRoute(ROUTE_PATHS?.LOGIN || "/login"),
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
          found:
            true,
          forbidden:
            false,
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
          reason,
          token,
          source:
            SELF_REPAIR_SOURCE,
        }
      );

      return {
        ok:
          true,
        handled:
          true,
        redirected:
          true,
        reason,
      };
    }

    if (reason === "already-authenticated") {
      const target =
        safePublicPath(
          access.redirectTo ||
            getDefaultHome()
        );

      const targetData =
        getRequestedData(
          target,
          {
            preservePublicPath:
              true,
          }
        );

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

        return {
          ok:
            true,
          handled:
            true,
          skipped:
            true,
          reason:
            "already-authenticated:same-route",
        };
      }

      await redirectInsideRender(
        target,
        {
          replaceState:
            true,
          force:
            true,
          forceRender:
            true,
          source:
            "guard:already-authenticated",
        }
      );

      return {
        ok:
          true,
        handled:
          true,
        redirected:
          true,
        reason,
      };
    }

    /*
      Cualquier denial no gestionado se trata como forbidden.
      Esto evita el bug clásico:
        access.allowed === false
        handleDenied no reconoce reason
        render continúa como permitido.
    */
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

    if (!isLatestRenderToken(token)) {
      return makeStaleResult(
        token,
        "forbidden-stale"
      );
    }

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
        `guard:${reason}`,
      hideLoading:
        true,
    });

    safeEmit(
      "router:rendered",
      {
        found:
          true,
        forbidden:
          true,
        path:
          synced.publicPath,
        requestedPath:
          publicPath,
        canonicalPath:
          synced.canonicalPath,
        rawCanonicalPath:
          rawCanonicalPath || canonicalPath,
        publicPath:
          synced.publicPath,
        username:
          synced.username,
        reason,
        token,
        source:
          SELF_REPAIR_SOURCE,
      }
    );

    return {
      ok:
        true,
      handled:
        true,
      forbidden:
        true,
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

    activeRenderToken =
      token;

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
    } =
      getRequestedData(
        path,
        options
      );

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
        token,
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

    if (!isLatestRenderToken(token)) {
      return makeStaleResult(
        token,
        "after-before-render-stale"
      );
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

      if (!isLatestRenderToken(token)) {
        return makeStaleResult(
          token,
          "not-found-stale"
        );
      }

      const synced =
        syncState({
          canonicalPath,
          publicPath,
          username,
        });

      repairShellForRoute({
        route:
          null,
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
          found:
            false,
          forbidden:
            false,
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
          token,
          source:
            SELF_REPAIR_SOURCE,
        }
      );

      markInitialRouteRendered(true);

      return {
        ok:
          true,
        found:
          false,
        canonicalPath:
          synced.canonicalPath,
        publicPath:
          synced.publicPath,
        token,
      };
    }

    /* =====================
       GUARDS
    ===================== */

    const access =
      getAccessDecision({
        route,
        canonicalPath,
        publicPath,
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

    if (!isLatestRenderToken(token)) {
      return makeStaleResult(
        token,
        "after-ui-prep-stale"
      );
    }

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

      if (!isLatestRenderToken(token)) {
        try {
          view?.destroy?.();
        } catch {}

        return makeStaleResult(
          token,
          "after-view-render-stale"
        );
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
        synced.canonicalPath !==
        (ROUTE_PATHS?.LOGIN || "/login")
      ) {
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
          found:
            true,
          forbidden:
            false,
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
          route,
          routePath:
            route?.path || null,
          routeName:
            route?.name || null,
          viewKey:
            route?.viewKey || null,
          viewName:
            route?.viewName || null,
          durationMs:
            Math.round(
              nowMs() - startedAt
            ),
          token,
          source:
            SELF_REPAIR_SOURCE,
        }
      );

      safeLog(
        "render ok",
        synced
      );

      return {
        ok:
          true,
        found:
          true,
        canonicalPath:
          synced.canonicalPath,
        publicPath:
          synced.publicPath,
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
          token,
          source:
            SELF_REPAIR_SOURCE,
        },
        {
          redact:
            true,
        }
      );

      safeError(
        "render error",
        error
      );

      return {
        ok:
          false,
        error,
        canonicalPath:
          synced.canonicalPath,
        publicPath:
          synced.publicPath,
        token,
      };
    }
  }

  function render(path = "/", options = {}) {
    const token =
      ++renderToken;

    activeRenderToken =
      token;

    const opts =
      safeObject(options);

    renderChain =
      renderChain
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
    const opts =
      safeObject(options);

    const data =
      getRequestedData(
        path,
        opts
      );

    const key =
      `${data.publicPath}|${data.canonicalPath}`;

    const current =
      getCurrentComparable();

    const sameAsCurrent =
      current.canonical === data.canonicalPath &&
      current.publicPath === data.publicPath;

    const canSkipSame =
      Boolean(
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
          route:
            data.route,
          canonicalPath:
            data.canonicalPath,
          publicPath:
            data.publicPath,
          phase:
            "same-route-repair",
          hideLoading:
            true,
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

    const fromLogin =
      current.canonical === (ROUTE_PATHS?.LOGIN || "/login") &&
      data.canonicalPath !== (ROUTE_PATHS?.LOGIN || "/login") &&
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
      {
        ...opts,
        canonicalPath:
          data.canonicalPath,
        publicPath:
          data.publicPath,
        requestedPath:
          data.requestedPath,
      }
    );
  }

  function replace(path = "/", options = {}) {
    return navigate(
      path,
      {
        ...safeObject(options),
        replaceState:
          true,
      }
    );
  }

  function goAfterLogin(fallback = "/") {
    let redirect =
      "";

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
        replaceState:
          true,
        force:
          true,
        forceRender:
          true,
        source:
          "login",
        fromLogin:
          true,
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
      event.__onionSidebarEventsHandled
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

    if (link.hasAttribute("download")) {
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

    try {
      event.__onionRouterHandled =
        true;
    } catch {}

    navigate(
      href,
      {
        source:
          "link-click",
      }
    );
  }

  function onPopstate() {
    const path =
      getBrowserPath();

    const data =
      getRequestedData(
        path,
        {
          preservePublicPath:
            true,
          preserveUrl:
            true,
          source:
            "popstate",
        }
      );

    render(
      data.publicPath,
      {
        skipHistory:
          true,
        replaceState:
          true,
        force:
          true,
        forceRender:
          true,
        preservePublicPath:
          true,
        preserveUrl:
          true,
        canonicalPath:
          data.canonicalPath,
        publicPath:
          data.publicPath,
        requestedPath:
          data.requestedPath,
        source:
          "popstate",
      }
    );
  }

  function shouldSkipExternalRepair(detail = {}, eventType = "") {
    const source =
      safeText(detail?.source, "");

    if (
      source === SELF_REPAIR_SOURCE ||
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

    const phase =
      safeText(
        detail?.reason ||
          detail?.phase ||
          eventType ||
          "external-repair",
        "external-repair"
      );

    const current =
      getCurrentComparable();

    const key =
      [
        phase,
        current.canonical,
        current.publicPath,
        source,
      ].join("|");

    const now =
      nowEpochMs();

    if (
      key === lastExternalRepairKey &&
      now - lastExternalRepairAt < EXTERNAL_REPAIR_THROTTLE_MS
    ) {
      return true;
    }

    lastExternalRepairKey =
      key;

    lastExternalRepairAt =
      now;

    return false;
  }

  function onExternalRepair(event = null) {
    const detail =
      getEventDetail(event);

    const eventType =
      getEventType(event);

    if (
      shouldSkipExternalRepair(
        detail,
        eventType
      )
    ) {
      return;
    }

    externalRepairInFlight =
      true;

    try {
      const reason =
        detail?.reason ||
        detail?.phase ||
        eventType ||
        "external-repair";

      repairCurrentRoute(reason);
    } finally {
      externalRepairInFlight =
        false;
    }
  }

  function onAuthSessionReady(event = null) {
    const now =
      nowEpochMs();

    if (
      authReadyInFlight ||
      now - lastAuthReadyAt < AUTH_READY_THROTTLE_MS
    ) {
      return;
    }

    authReadyInFlight =
      true;

    lastAuthReadyAt =
      now;

    try {
      const current =
        getCurrentComparable();

      repairCurrentRoute(
        event?.type ||
          "auth-session-ready"
      );

      if (
        current.canonical === (ROUTE_PATHS?.LOGIN || "/login") &&
        isAuthenticated()
      ) {
        goAfterLogin("/");
      }
    } finally {
      authReadyInFlight =
        false;
    }
  }

  /* =====================================================
     REGISTRATION
  ===================================================== */

  function attachToAppCore() {
    try {
      AppCore.Router =
        api;
    } catch {}

    try {
      AppCore.router =
        api;
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

    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules === "object" &&
        !isFn(AppCore.modules.register)
      ) {
        AppCore.modules.Router =
          api;

        AppCore.modules.router =
          api;
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

    bound =
      true;

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
      "router:bound",
      {
        routes:
          immutableRoutes.map(
            (route) => route.path
          ),
        source:
          SELF_REPAIR_SOURCE,
      }
    );

    safeLog(
      "ready"
    );

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

    bound =
      false;

    safeEmit(
      "router:unbound",
      {
        source:
          SELF_REPAIR_SOURCE,
      }
    );

    return api;
  }

  /* =====================================================
     CONFIG
  ===================================================== */

  function configure(options = {}) {
    configured =
      true;

    attachToAppCore();

    safeEmit(
      "router:configured",
      {
        options:
          safeObject(options),
        source:
          SELF_REPAIR_SOURCE,
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

    const browserPath =
      getBrowserPath();

    const browserCanonicalPath =
      safeCanonicalPath(browserPath);

    let routesSnapshot =
      [];

    try {
      routesSnapshot =
        isFn(getRoutesSnapshot)
          ? getRoutesSnapshot()
          : immutableRoutes.map((route) => ({
              path:
                route.path,
              name:
                route.name || null,
              viewKey:
                route.viewKey || null,
              viewName:
                route.viewName || null,
              layout:
                route.layout || route.meta?.layout || null,
              shell:
                route.shell,
            }));
    } catch {
      routesSnapshot =
        immutableRoutes.map((route) => ({
          path:
            route.path,
          name:
            route.name || null,
          viewKey:
            route.viewKey || null,
          viewName:
            route.viewName || null,
          layout:
            route.layout || route.meta?.layout || null,
          shell:
            route.shell,
        }));
    }

    return redactForLog({
      configured,
      bound,

      renderToken,
      activeRenderToken,

      hasActiveView:
        Boolean(activeView),

      current:
        getCurrentComparable(),

      route:
        AppCore?.state?.route || "/",

      canonicalPath:
        AppCore?.state?.canonicalPath ||
        AppCore?.state?.route ||
        "/",

      publicPath:
        AppCore?.state?.publicPath || "/",

      browserPath,
      browserCanonicalPath,

      lastNavKey,
      lastNavAt,

      lastRenderedCanonicalPath,
      lastRenderedPublicPath,
      lastRenderedAt,

      shellRepairDepth,
      externalRepairInFlight,

      lastExternalRepairKey,
      lastExternalRepairAt,

      authReadyInFlight,
      lastAuthReadyAt,

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
        routesSnapshot,

      dom: {
        bodyClasses:
          dom.body?.className || "",

        htmlClasses:
          dom.html?.className || "",

        bodyShell:
          dom.body?.dataset?.shell || null,

        htmlShell:
          dom.html?.dataset?.shell || null,

        bodyChrome:
          dom.body?.dataset?.chrome || null,

        htmlChrome:
          dom.html?.dataset?.chrome || null,

        bodyRouteMode:
          dom.body?.dataset?.routeMode || null,

        htmlRouteMode:
          dom.html?.dataset?.routeMode || null,

        hasShell:
          Boolean(dom.shell),

        hasMain:
          Boolean(dom.main),

        hasAppContent:
          Boolean(dom.appContent),

        hasView:
          Boolean(dom.view),

        hasSidebar:
          Boolean(dom.sidebar),

        hasTopbar:
          Boolean(dom.topbar),

        hasTablehead:
          Boolean(dom.tablehead),

        hasLoader:
          Boolean(dom.loader),

        shellHidden:
          Boolean(dom.shell?.hidden),

        mainHidden:
          Boolean(dom.main?.hidden),

        appContentHidden:
          Boolean(dom.appContent?.hidden),

        viewHidden:
          Boolean(dom.view?.hidden),

        sidebarHidden:
          Boolean(dom.sidebar?.hidden),

        topbarHidden:
          Boolean(dom.topbar?.hidden),

        tableheadHidden:
          Boolean(dom.tablehead?.hidden),

        loaderHidden:
          Boolean(dom.loader?.hidden),
      },
    });
  }

  function debug(path = "") {
    const target =
      safeText(path, "");

    const snapshot =
      target
        ? {
            target:
              redactTokenInText(target),
            data:
              redactForLog(
                getRequestedData(
                  target,
                  {
                    preservePublicPath:
                      true,
                    preserveUrl:
                      true,
                  }
                )
              ),
            match:
              redactForLog(
                getRouteMatch(target)
              ),
            snapshot:
              getSnapshot(),
          }
        : getSnapshot();

    try {
      console.log(
        "[Router:debug]",
        snapshot
      );
    } catch {}

    return snapshot;
  }

  function repairShellPublic(payload = {}) {
    if (typeof payload === "string") {
      return repairCurrentRoute(payload);
    }

    const data =
      safeObject(payload);

    if (
      !data.route &&
      (
        data.canonicalPath ||
        data.publicPath
      )
    ) {
      const resolved =
        getRequestedData(
          data.publicPath ||
            data.canonicalPath ||
            getBrowserPath(),
          {
            preservePublicPath:
              true,
            preserveUrl:
              true,
          }
        );

      return repairShellForRoute({
        ...data,
        route:
          data.route || resolved.route,
        canonicalPath:
          data.canonicalPath || resolved.canonicalPath,
        publicPath:
          data.publicPath || resolved.publicPath,
      });
    }

    return repairShellForRoute(data);
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

    go:
      navigate,

    push:
      navigate,

    back:
      (...args) =>
        back(...args),

    goAfterLogin,

    repairShell:
      repairShellPublic,

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

    getRequestedData,

    getDefaultHome,

    safePath,

    safePublicPath,

    safeCanonicalPath,

    getSnapshot,

    debug,
  };

  return api;
})();

export default Router;
