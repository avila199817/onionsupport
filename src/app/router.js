/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: src/app/router.js

   RESPONSABILIDADES:
   - configurar Router con dependencias
   - bind listeners una sola vez
   - render inicial robusto
   - capturar URL inicial antes de que Router/History puedan tocarla
   - preservar token de activación hasta que ActivateAccountView lo lea
   - preservar token de reset hasta que ConfirmResetPasswordView lo lea
   - sincronizar route/publicPath tras primer paint
   - integrarse con loader boot
   - tolerar fallos sin romper SPA

   HARDENING EXTREMO:
   - idempotencia total
   - safe logs
   - logs sin tokens reales
   - fallback route "/"
   - render serializado
   - no doble initial render
   - no bindRouter() dentro de renderInitialRoute()
   - no sobrescribir route/publicPath inconsistentes
   - anti stale boot calls
   - snapshot debug enterprise
   - protección de /activate-account?token=...
   - protección de /activate-account/<token>
   - protección de /reset-password/confirm?token=...
   - protección de /reset-password/confirm/<token>
========================================================= */

import { AppCore } from "../core/index.js";
import { Router } from "../router/index.js";
import { Auth } from "../features/auth/index.js";

import {
  getCurrentPath,
  getCurrentPublicPath,
  getCurrentCanonicalPath,
} from "./helpers.js";

import {
  applyPostRenderLoaderPolicy,
} from "./shell.js";

import {
  APP_RUNTIME_KEYS,
  APP_STATE_KEYS,
  APP_ROUTES,
  APP_EVENTS,
  ROUTER_EVENTS,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
} from "./constants.js";

/* =========================================================
   STATE
========================================================= */

let configured = false;
let bound = false;
let firstRenderDone = false;
let initialRenderPromise = null;
let renderCycle = 0;

const routerBootState = {
  lastInitialPath: "",
  lastRenderedPath: "",
  lastResolvedCanonicalPath: "",
  lastResolvedPublicPath: "",
  lastRenderAt: 0,
  lastRenderOk: false,
  lastRenderError: null,
  lastProtectedRouteKey: "",
  capturedInitialUrlAt: 0,
};

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ROUTE =
  APP_ROUTES?.home || "/";

const LOGIN_ROUTE =
  APP_ROUTES?.login || "/login";

const INITIAL_URL_KEY =
  APP_RUNTIME_KEYS?.initialUrl ||
  "__ONION_INITIAL_URL__";

const PROTECTED_ROUTES =
  Array.isArray(PROTECTED_PUBLIC_TOKEN_ROUTES)
    ? PROTECTED_PUBLIC_TOKEN_ROUTES
    : [];

const ROUTER_BOOT_EVENTS =
  Object.freeze({
    configured:
      "app:router:configured",

    bound:
      "app:router:bound",

    initialUrlCaptured:
      "app:router:initial-url:captured",

    initialRenderStart:
      "app:router:initial-render:start",

    initialRenderDone:
      "app:router:initial-render:done",

    initialRenderError:
      "app:router:initial-render:error",

    initialRenderFallback:
      "app:router:initial-render:fallback",

    stateSynced:
      "app:router:state-synced",
  });

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function ensureObject(value) {
  return isObject(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
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

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function normalizeError(error = null) {
  if (!error) {
    return null;
  }

  return {
    name:
      safeText(
        error?.name,
        "RouterBootstrapError"
      ),

    message:
      safeText(
        error?.message || error,
        "Error en bootstrap Router."
      ),

    code:
      safeText(
        error?.code ||
          error?.status ||
          error?.statusCode,
        ""
      ),
  };
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(
      "[AppRouter]",
      ...args
    );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AppRouter]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AppRouter]",
      ...args
    );
  } catch {}
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(
      "[AppRouter]",
      ...args
    );
  } catch {}

  try {
    console.error(
      "[AppRouter]",
      ...args
    );
  } catch {}
}

function safeWindowDispatch(eventName, payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail:
          payload,
      })
    );

    return true;
  } catch {}

  return false;
}

function safeEmit(eventName, payload = {}) {
  if (!eventName) {
    return false;
  }

  let emitted = false;

  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );

    emitted = true;
  } catch {}

  if (
    safeWindowDispatch(
      eventName,
      payload
    )
  ) {
    emitted = true;
  }

  return emitted;
}

/* =========================================================
   PATH UTILS
========================================================= */

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
  let value =
    String(pathname || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      "/";
  }

  return value;
}

function normalizeSearch(search = "") {
  const value =
    String(search || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    String(hash || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function splitPath(value = "/") {
  const raw =
    safeText(value, "/");

  if (isHashRouterPath(raw)) {
    return splitPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname = raw;
  let search = "";
  let hash = "";

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

function normalizePath(path = "/") {
  const raw =
    typeof path === "string"
      ? path.trim()
      : "/";

  if (!raw) {
    return "/";
  }

  if (isHashRouterPath(raw)) {
    return normalizePath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizePath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizePath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } = splitPath(raw);

  return `${pathname}${search}${hash}`;
}

function getCleanPath(path = "/") {
  return splitPath(
    normalizePath(path)
  ).pathname;
}

function getBrowserHref() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      window.location.href,
      ""
    );
  } catch {
    return "";
  }
}

function getBrowserPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const pathname =
      window.location.pathname || DEFAULT_ROUTE;

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizePath(
        normalizeHashRouterPath(hash)
      );
    }

    return normalizePath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

function getPathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizePath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizePath(
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return normalizePath(
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return normalizePath(raw);
  }
}

function shouldUsePath(value) {
  return (
    typeof value === "string" &&
    Boolean(value.trim())
  );
}

/* =========================================================
   TOKEN REDACTION
========================================================= */

function redactTokenInText(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  let output =
    raw;

  for (const config of PROTECTED_ROUTES) {
    const path =
      safeText(config?.path, "");

    if (!path) {
      continue;
    }

    const escapedPath =
      path.replace(/\//g, "\\/");

    try {
      output = output.replace(
        new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
        "$1/***"
      );
    } catch {}

    for (const name of config.tokenParamNames || []) {
      try {
        output = output.replace(
          new RegExp(`([?&#]${name}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
      } catch {}
    }
  }

  try {
    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

/* =========================================================
   PROTECTED TOKEN ROUTES
========================================================= */

function matchesProtectedRoute(config, pathOrUrl = "") {
  if (!config?.path) {
    return false;
  }

  const path =
    getPathFromUrlLike(pathOrUrl);

  const cleanPath =
    getCleanPath(path);

  return (
    cleanPath === config.path ||
    cleanPath.startsWith(`${config.path}/`)
  );
}

function getProtectedRouteConfig(value = "") {
  return (
    PROTECTED_ROUTES.find((config) =>
      matchesProtectedRoute(
        config,
        value
      )
    ) || null
  );
}

function getPathToken(config, value = "") {
  if (!config?.path) {
    return "";
  }

  const path =
    getPathFromUrlLike(value);

  const cleanPath =
    getCleanPath(path);

  if (!cleanPath.startsWith(`${config.path}/`)) {
    return "";
  }

  const token =
    cleanPath
      .slice(`${config.path}/`.length)
      .split("/")[0];

  try {
    return safeText(
      decodeURIComponent(token || ""),
      ""
    );
  } catch {
    return safeText(
      token,
      ""
    );
  }
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return names.some((name) =>
      Boolean(
        safeText(
          params.get(name),
          ""
        )
      )
    );
  } catch {
    return false;
  }
}

function hasProtectedTokenInUrlLike(config, value = "") {
  if (!config) {
    return false;
  }

  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  if (
    getPathToken(
      config,
      raw
    )
  ) {
    return true;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      hasTokenInSearch(
        parsed.search,
        config.tokenParamNames || []
      )
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenParamNames || []
      );
    }

    return false;
  } catch {
    const parts =
      splitPath(raw);

    if (
      hasTokenInSearch(
        parts.search,
        config.tokenParamNames || []
      )
    ) {
      return true;
    }

    if (
      parts.hash &&
      parts.hash.includes("?")
    ) {
      const query =
        parts.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenParamNames || []
      );
    }

    return false;
  }
}

function isProtectedPublicTokenPath(path = "") {
  const config =
    getProtectedRouteConfig(path);

  return Boolean(
    config &&
    hasProtectedTokenInUrlLike(
      config,
      path
    )
  );
}

/* =========================================================
   INITIAL URL STORAGE
========================================================= */

function getWindowValue(key = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return "";
  }

  try {
    return safeText(
      window[key],
      ""
    );
  } catch {
    return "";
  }
}

function setWindowValue(key = "", value = "", onlyIfMissing = false) {
  if (
    !isBrowser() ||
    !key
  ) {
    return false;
  }

  try {
    if (
      onlyIfMissing &&
      window[key]
    ) {
      return true;
    }

    window[key] =
      value;

    return true;
  } catch {
    return false;
  }
}

function getStoredInitialUrl(config) {
  return getWindowValue(
    config?.windowKey || ""
  );
}

function setStoredInitialUrl(config, value = "") {
  return setWindowValue(
    config?.windowKey || "",
    value,
    true
  );
}

function getGlobalInitialUrl() {
  return getWindowValue(
    INITIAL_URL_KEY
  );
}

function setGlobalInitialUrl(value = "") {
  return setWindowValue(
    INITIAL_URL_KEY,
    value,
    true
  );
}

function getProtectedStoredUrls() {
  return PROTECTED_ROUTES
    .map((config) =>
      getStoredInitialUrl(config)
    )
    .filter(Boolean);
}

function captureInitialBrowserUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href =
      getBrowserHref();

    if (!href) {
      return false;
    }

    setGlobalInitialUrl(href);

    let protectedCaptured =
      false;

    for (const config of PROTECTED_ROUTES) {
      if (
        matchesProtectedRoute(
          config,
          href
        ) &&
        hasProtectedTokenInUrlLike(
          config,
          href
        ) &&
        !getStoredInitialUrl(config)
      ) {
        setStoredInitialUrl(
          config,
          href
        );

        protectedCaptured =
          true;
      }
    }

    routerBootState.capturedInitialUrlAt =
      Date.now();

    safeEmit(
      ROUTER_BOOT_EVENTS.initialUrlCaptured,
      {
        href:
          redactTokenInText(href),

        protectedCaptured,

        at:
          safeIsoDate(
            routerBootState.capturedInitialUrlAt
          ),
      }
    );

    return true;
  } catch {
    return false;
  }
}

function getStateInitialUrlCandidates() {
  const state =
    ensureObject(
      AppCore?.state
    );

  return [
    state[APP_STATE_KEYS?.bootProtectedInitialUrl],
    state[APP_STATE_KEYS?.bootActivationInitialUrl],
    state[APP_STATE_KEYS?.bootResetConfirmInitialUrl],
    state.bootProtectedInitialUrl,
    state.bootActivationInitialUrl,
    state.bootResetConfirmInitialUrl,
  ]
    .map((value) =>
      safeText(value, "")
    )
    .filter(Boolean);
}

function resolveProtectedInitialContext(value = "") {
  captureInitialBrowserUrl();

  const explicit =
    safeText(value, "");

  const candidates = [
    explicit,
    ...getProtectedStoredUrls(),
    ...getStateInitialUrlCandidates(),
    getGlobalInitialUrl(),
    getBrowserHref(),
    getBrowserPath(),
  ]
    .map((candidate) =>
      safeText(candidate, "")
    )
    .filter(Boolean);

  for (const candidate of candidates) {
    const config =
      getProtectedRouteConfig(candidate);

    if (!config) {
      continue;
    }

    if (
      !hasProtectedTokenInUrlLike(
        config,
        candidate
      )
    ) {
      continue;
    }

    const path =
      getPathFromUrlLike(candidate);

    return {
      config,
      key:
        config.key || "",
      path,
      cleanPath:
        getCleanPath(path),
      url:
        candidate,
      hasToken:
        true,
      redactedPath:
        redactTokenInText(path),
      redactedUrl:
        redactTokenInText(candidate),
    };
  }

  return {
    config:
      null,
    key:
      "",
    path:
      "",
    cleanPath:
      "",
    url:
      "",
    hasToken:
      false,
    redactedPath:
      "",
    redactedUrl:
      "",
  };
}

function exposeInitialContextToCore(context = {}) {
  const data =
    ensureObject(context);

  const payload = {
    bootProtectedInitialUrl:
      data.url || "",

    bootProtectedInitialPath:
      data.path || "",

    bootIsPublicTokenRoute:
      Boolean(data.config),

    bootHasPublicToken:
      Boolean(data.hasToken),

    bootProtectedRouteKey:
      data.key || "",
  };

  try {
    AppCore?.setState?.(payload);
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        payload
      );
    }
  } catch {}

  return payload;
}

function getSafeInitialPath() {
  const protectedInitial =
    resolveProtectedInitialContext();

  if (
    protectedInitial.config &&
    protectedInitial.path
  ) {
    exposeInitialContextToCore(
      protectedInitial
    );

    return protectedInitial.path;
  }

  const browserPath =
    getBrowserPath();

  if (browserPath) {
    return browserPath;
  }

  return normalizePath(
    getCurrentPublicPath(
      AppCore,
      Router
    ) ||
      getCurrentPath(
        AppCore
      ) ||
      DEFAULT_ROUTE
  );
}

function shouldProtectInitialHistory(path = "/") {
  if (
    isProtectedPublicTokenPath(path)
  ) {
    return true;
  }

  const protectedInitial =
    resolveProtectedInitialContext(path);

  return Boolean(
    protectedInitial.config &&
    protectedInitial.path
  );
}

/* =========================================================
   STATE SYNC
========================================================= */

function safeSetState(payload = {}) {
  const cleanPayload =
    ensureObject(payload);

  try {
    AppCore?.setState?.(
      cleanPayload
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        cleanPayload
      );
    }
  } catch {}
}

function safeSetRoute(route = DEFAULT_ROUTE) {
  const cleanRoute =
    normalizePath(route || DEFAULT_ROUTE);

  try {
    AppCore?.setRoute?.(
      cleanRoute
    );
  } catch {}

  safeSetState({
    route:
      cleanRoute,
  });

  return cleanRoute;
}

function safeSetPublicPath(publicPath = DEFAULT_ROUTE) {
  const cleanPublicPath =
    normalizePath(publicPath || DEFAULT_ROUTE);

  try {
    AppCore?.setPublicPath?.(
      cleanPublicPath
    );
  } catch {}

  safeSetState({
    publicPath:
      cleanPublicPath,
  });

  return cleanPublicPath;
}

function syncResolvedRouteState(fallbackPath = DEFAULT_ROUTE, meta = {}) {
  const target =
    normalizePath(
      fallbackPath || DEFAULT_ROUTE
    );

  const protectedContext =
    meta.protectedContext?.config
      ? meta.protectedContext
      : resolveProtectedInitialContext(target);

  let resolvedCanonicalPath =
    normalizePath(
      getCurrentCanonicalPath(
        AppCore,
        Router
      ) ||
        target ||
        DEFAULT_ROUTE
    );

  let resolvedPublicPath =
    normalizePath(
      getCurrentPublicPath(
        AppCore,
        Router
      ) ||
        target ||
        resolvedCanonicalPath ||
        DEFAULT_ROUTE
    );

  if (
    protectedContext.config &&
    protectedContext.path
  ) {
    const publicHasToken =
      hasProtectedTokenInUrlLike(
        protectedContext.config,
        resolvedPublicPath
      );

    if (!publicHasToken) {
      resolvedPublicPath =
        normalizePath(
          protectedContext.path
        );
    }

    if (
      !matchesProtectedRoute(
        protectedContext.config,
        resolvedCanonicalPath
      )
    ) {
      resolvedCanonicalPath =
        normalizePath(
          protectedContext.cleanPath ||
            getCleanPath(protectedContext.path) ||
            protectedContext.config.path
        );
    }
  }

  const route =
    safeSetRoute(
      resolvedCanonicalPath
    );

  const publicPath =
    safeSetPublicPath(
      resolvedPublicPath
    );

  const payload = {
    canonicalPath:
      route,

    publicPath,

    protectedRouteKey:
      protectedContext.key || "",

    protectedInitialUrl:
      protectedContext.url || "",

    protectedInitialPath:
      protectedContext.path || "",
  };

  routerBootState.lastResolvedCanonicalPath =
    route;

  routerBootState.lastResolvedPublicPath =
    publicPath;

  safeEmit(
    ROUTER_BOOT_EVENTS.stateSynced,
    {
      ...payload,
      canonicalPath:
        redactTokenInText(route),
      publicPath:
        redactTokenInText(publicPath),
      protectedInitialUrl:
        redactTokenInText(payload.protectedInitialUrl),
      protectedInitialPath:
        redactTokenInText(payload.protectedInitialPath),
    }
  );

  return payload;
}

function markInitialRenderDone(value = true) {
  firstRenderDone =
    Boolean(value);

  safeSetState({
    initialRouteRendered:
      Boolean(value),
  });
}

/* =========================================================
   RENDER OPTIONS
========================================================= */

function getRenderOptions(path = DEFAULT_ROUTE, meta = {}) {
  const protectedContext =
    meta.protectedContext?.config
      ? meta.protectedContext
      : resolveProtectedInitialContext(path);

  if (
    protectedContext.config &&
    protectedContext.hasToken
  ) {
    return {
      skipHistory:
        true,

      preservePath:
        true,

      preserveUrl:
        true,

      preserveSearch:
        true,

      preserveHash:
        true,

      replaceState:
        false,

      force:
        true,

      initialRender:
        true,

      protectedInitialUrl:
        true,

      protectedRouteKey:
        protectedContext.key || "",

      protectedInitialPath:
        protectedContext.path || "",

      protectedInitialUrlValue:
        protectedContext.url || "",

      source:
        "app-router-bootstrap",
    };
  }

  return {
    replaceState:
      true,

    force:
      true,

    initialRender:
      true,

    source:
      "app-router-bootstrap",
  };
}

/* =========================================================
   EARLY URL CAPTURE
========================================================= */

captureInitialBrowserUrl();

/* =========================================================
   CONFIGURE
========================================================= */

function exposeRouterToCore() {
  try {
    AppCore.Router =
      Router;
  } catch {}

  try {
    AppCore.router =
      Router;
  } catch {}

  try {
    AppCore.modules =
      AppCore.modules || {};

    AppCore.modules.Router =
      Router;

    AppCore.modules.router =
      Router;
  } catch {}

  return true;
}

export function configureRouter() {
  captureInitialBrowserUrl();

  if (configured) {
    exposeRouterToCore();
    return Router;
  }

  exposeRouterToCore();

  try {
    if (
      isFunction(
        Router?.configure
      )
    ) {
      Router.configure({
        core:
          AppCore,

        AppCore,

        auth:
          Auth,

        Auth,

        source:
          "app-router-bootstrap",
      });
    }

    configured =
      true;

    safeEmit(
      ROUTER_BOOT_EVENTS.configured,
      {
        configured:
          true,

        at:
          safeIsoDate(),
      }
    );

    safeLog(
      "Router configurado."
    );
  } catch (error) {
    routerBootState.lastRenderError =
      normalizeError(error);

    safeError(
      "Error configurando Router:",
      error
    );
  }

  exposeRouterToCore();

  return Router;
}

/* =========================================================
   BIND
========================================================= */

export function bindRouter() {
  captureInitialBrowserUrl();
  configureRouter();

  if (bound) {
    return Router;
  }

  const protectedInitial =
    resolveProtectedInitialContext();

  try {
    if (
      isFunction(
        Router?.bind
      )
    ) {
      Router.bind({
        core:
          AppCore,

        auth:
          Auth,

        initialRenderDone:
          Boolean(firstRenderDone),

        protectedInitialUrl:
          Boolean(protectedInitial.config),

        protectedRouteKey:
          protectedInitial.key || "",

        protectedInitialPath:
          protectedInitial.path || "",

        preserveInitialUrl:
          Boolean(protectedInitial.config),

        source:
          "app-router-bootstrap",
      });
    }

    bound =
      true;

    safeEmit(
      ROUTER_BOOT_EVENTS.bound,
      {
        bound:
          true,

        initialRenderDone:
          Boolean(firstRenderDone),

        protectedInitialUrl:
          Boolean(protectedInitial.config),

        protectedRouteKey:
          protectedInitial.key || "",

        at:
          safeIsoDate(),
      }
    );

    safeLog(
      "Router listeners activos.",
      {
        initialRenderDone:
          Boolean(firstRenderDone),

        protectedInitialUrl:
          Boolean(protectedInitial.config),

        protectedRouteKey:
          protectedInitial.key || "",
      }
    );
  } catch (error) {
    routerBootState.lastRenderError =
      normalizeError(error);

    safeError(
      "Error bind Router:",
      error
    );
  }

  return Router;
}

/* =========================================================
   INTERNAL RENDER
========================================================= */

async function runInitialRender(path = DEFAULT_ROUTE, cycleId = 0, meta = {}) {
  const target =
    normalizePath(path || DEFAULT_ROUTE);

  const protectedContext =
    meta.protectedContext?.config
      ? meta.protectedContext
      : resolveProtectedInitialContext(target);

  const options =
    getRenderOptions(
      target,
      {
        protectedContext,
      }
    );

  routerBootState.lastInitialPath =
    target;

  routerBootState.lastProtectedRouteKey =
    protectedContext.key || "";

  safeEmit(
    ROUTER_BOOT_EVENTS.initialRenderStart,
    {
      target:
        redactTokenInText(target),

      options:
        {
          ...options,
          protectedInitialPath:
            redactTokenInText(
              options.protectedInitialPath || ""
            ),
          protectedInitialUrlValue:
            redactTokenInText(
              options.protectedInitialUrlValue || ""
            ),
        },

      cycleId,

      protectedRouteKey:
        protectedContext.key || "",

      at:
        safeIsoDate(),
    }
  );

  if (
    !isFunction(
      Router?.render
    )
  ) {
    safeWarn(
      "Router.render no disponible. Se sincroniza estado mínimo."
    );

    syncResolvedRouteState(
      target,
      {
        protectedContext,
      }
    );

    applyPostRenderLoaderPolicy({
      AppCore,
      Router,
    });

    return false;
  }

  await Promise.resolve(
    Router.render(
      target,
      options
    )
  );

  if (
    cycleId !== renderCycle
  ) {
    safeWarn(
      "Render inicial stale omitido.",
      {
        cycleId,
        activeCycle:
          renderCycle,
      }
    );

    return false;
  }

  const resolved =
    syncResolvedRouteState(
      target,
      {
        protectedContext,
      }
    );

  try {
    applyPostRenderLoaderPolicy({
      AppCore,
      Router,
    });
  } catch (error) {
    safeWarn(
      "applyPostRenderLoaderPolicy() falló.",
      error
    );
  }

  markInitialRenderDone(
    true
  );

  routerBootState.lastRenderedPath =
    target;

  routerBootState.lastRenderAt =
    Date.now();

  routerBootState.lastRenderOk =
    true;

  routerBootState.lastRenderError =
    null;

  safeEmit(
    ROUTER_BOOT_EVENTS.initialRenderDone,
    {
      ok:
        true,

      target:
        redactTokenInText(target),

      resolved:
        {
          canonicalPath:
            redactTokenInText(
              resolved.canonicalPath
            ),

          publicPath:
            redactTokenInText(
              resolved.publicPath
            ),
        },

      cycleId,

      protectedRouteKey:
        protectedContext.key || "",

      at:
        safeIsoDate(
          routerBootState.lastRenderAt
        ),
    }
  );

  safeLog(
    "Render inicial completado.",
    {
      target:
        redactTokenInText(target),

      options:
        {
          ...options,
          protectedInitialPath:
            redactTokenInText(
              options.protectedInitialPath || ""
            ),
          protectedInitialUrlValue:
            redactTokenInText(
              options.protectedInitialUrlValue || ""
            ),
        },

      resolved:
        {
          canonicalPath:
            redactTokenInText(
              resolved.canonicalPath
            ),

          publicPath:
            redactTokenInText(
              resolved.publicPath
            ),
        },
    }
  );

  return true;
}

/* =========================================================
   INITIAL RENDER
========================================================= */

export async function renderInitialRoute() {
  /*
    CRÍTICO:
    NO llamar bindRouter() aquí.

    El orden correcto en src/app/index.js es:
    1. configureRouter()
    2. renderInitialRoute()
    3. bindRouter()

    Router.bind() puede inicializar History/popstate y tocar replaceState.
    Por eso el primer render debe decidirse con la URL capturada antes.
  */

  captureInitialBrowserUrl();
  configureRouter();

  const initialPathBeforeBind =
    getSafeInitialPath();

  if (firstRenderDone) {
    safeLog(
      "renderInitialRoute omitido: primer render ya completado.",
      {
        route:
          redactTokenInText(
            AppCore?.state?.route || DEFAULT_ROUTE
          ),

        publicPath:
          redactTokenInText(
            AppCore?.state?.publicPath || DEFAULT_ROUTE
          ),
      }
    );

    return true;
  }

  if (initialRenderPromise) {
    return initialRenderPromise;
  }

  const cycleId =
    ++renderCycle;

  initialRenderPromise =
    (async () => {
      const path =
        normalizePath(
          initialPathBeforeBind ||
            getSafeInitialPath() ||
            DEFAULT_ROUTE
        );

      const protectedContext =
        resolveProtectedInitialContext(path);

      try {
        safeLog(
          "Render inicial:",
          {
            path:
              redactTokenInText(path),

            protectedInitialUrl:
              Boolean(protectedContext.config),

            protectedRouteKey:
              protectedContext.key || "",

            initialUrl:
              redactTokenInText(
                getGlobalInitialUrl()
              ),

            protectedInitialPath:
              redactTokenInText(
                protectedContext.path || ""
              ),
          }
        );

        const ok =
          await runInitialRender(
            path,
            cycleId,
            {
              protectedContext,
            }
          );

        return Boolean(ok);
      } catch (error) {
        routerBootState.lastRenderOk =
          false;

        routerBootState.lastRenderError =
          normalizeError(error);

        safeEmit(
          ROUTER_BOOT_EVENTS.initialRenderError,
          {
            path:
              redactTokenInText(path),

            protectedInitialUrl:
              Boolean(protectedContext.config),

            protectedRouteKey:
              protectedContext.key || "",

            error:
              routerBootState.lastRenderError,

            at:
              safeIsoDate(),
          }
        );

        safeWarn(
          "Fallo render inicial.",
          {
            path:
              redactTokenInText(path),

            protectedInitialUrl:
              Boolean(protectedContext.config),

            protectedRouteKey:
              protectedContext.key || "",

            error,
          }
        );

        try {
          const fallback =
            protectedContext.config?.path
              ? protectedContext.config.path
              : shouldUsePath(DEFAULT_ROUTE)
                ? DEFAULT_ROUTE
                : LOGIN_ROUTE;

          safeEmit(
            ROUTER_BOOT_EVENTS.initialRenderFallback,
            {
              from:
                redactTokenInText(path),

              to:
                redactTokenInText(fallback),

              protectedInitialUrl:
                Boolean(protectedContext.config),

              protectedRouteKey:
                protectedContext.key || "",

              at:
                safeIsoDate(),
            }
          );

          const ok =
            await runInitialRender(
              fallback,
              cycleId,
              {
                protectedContext,
                fallbackFor:
                  path,
              }
            );

          if (ok) {
            safeLog(
              "Fallback render inicial completado.",
              {
                fallback:
                  redactTokenInText(fallback),
              }
            );
          }

          return Boolean(ok);
        } catch (fatal) {
          routerBootState.lastRenderOk =
            false;

          routerBootState.lastRenderError =
            normalizeError(fatal);

          safeError(
            "Render inicial fatal:",
            fatal
          );

          markInitialRenderDone(
            false
          );

          return false;
        }
      } finally {
        initialRenderPromise =
          null;
      }
    })();

  return initialRenderPromise;
}

/* =========================================================
   RESET / DEBUG
========================================================= */

export function resetRouterBootstrap(options = {}) {
  const {
    resetConfigured = false,
    resetBound = false,
  } = ensureObject(options);

  firstRenderDone =
    false;

  initialRenderPromise =
    null;

  renderCycle =
    0;

  if (resetConfigured) {
    configured =
      false;
  }

  if (resetBound) {
    bound =
      false;
  }

  routerBootState.lastInitialPath =
    "";

  routerBootState.lastRenderedPath =
    "";

  routerBootState.lastResolvedCanonicalPath =
    "";

  routerBootState.lastResolvedPublicPath =
    "";

  routerBootState.lastRenderAt =
    0;

  routerBootState.lastRenderOk =
    false;

  routerBootState.lastRenderError =
    null;

  routerBootState.lastProtectedRouteKey =
    "";

  safeSetState({
    initialRouteRendered:
      false,
  });

  return true;
}

export function getRouterBootstrapState() {
  const protectedInitial =
    resolveProtectedInitialContext();

  let routerSnapshot =
    null;

  try {
    routerSnapshot =
      Router?.getSnapshot?.() ||
      null;
  } catch {}

  return {
    configured:
      Boolean(configured),

    bound:
      Boolean(bound),

    firstRenderDone:
      Boolean(firstRenderDone),

    initialRenderInFlight:
      Boolean(initialRenderPromise),

    renderCycle:
      safeNumber(renderCycle, 0),

    route:
      redactTokenInText(
        AppCore?.state?.route || DEFAULT_ROUTE
      ),

    publicPath:
      redactTokenInText(
        AppCore?.state?.publicPath || DEFAULT_ROUTE
      ),

    initialUrl:
      redactTokenInText(
        getGlobalInitialUrl()
      ),

    protectedInitialUrl:
      redactTokenInText(
        protectedInitial.url || ""
      ),

    protectedInitialPath:
      redactTokenInText(
        protectedInitial.path || ""
      ),

    protectedInitialRouteKey:
      protectedInitial.key || "",

    hasProtectedInitialToken:
      Boolean(
        protectedInitial.config &&
        protectedInitial.hasToken
      ),

    currentBrowserPath:
      redactTokenInText(
        getBrowserPath()
      ),

    browserHref:
      redactTokenInText(
        getBrowserHref()
      ),

    lastInitialPath:
      redactTokenInText(
        routerBootState.lastInitialPath
      ),

    lastRenderedPath:
      redactTokenInText(
        routerBootState.lastRenderedPath
      ),

    lastResolvedCanonicalPath:
      redactTokenInText(
        routerBootState.lastResolvedCanonicalPath
      ),

    lastResolvedPublicPath:
      redactTokenInText(
        routerBootState.lastResolvedPublicPath
      ),

    lastRenderAt:
      routerBootState.lastRenderAt,

    lastRenderAtIso:
      routerBootState.lastRenderAt
        ? safeIsoDate(routerBootState.lastRenderAt)
        : "",

    lastRenderOk:
      Boolean(routerBootState.lastRenderOk),

    lastRenderError:
      routerBootState.lastRenderError,

    lastProtectedRouteKey:
      routerBootState.lastProtectedRouteKey,

    capturedInitialUrlAt:
      routerBootState.capturedInitialUrlAt,

    capturedInitialUrlAtIso:
      routerBootState.capturedInitialUrlAt
        ? safeIsoDate(routerBootState.capturedInitialUrlAt)
        : "",

    routerSnapshot,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  configureRouter,
  bindRouter,
  renderInitialRoute,

  resetRouterBootstrap,
  getRouterBootstrapState,
};
