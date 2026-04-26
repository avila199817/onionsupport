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

/* =========================================================
   STATE
========================================================= */

let configured = false;
let bound = false;
let firstRenderDone = false;
let initialRenderPromise = null;
let renderCycle = 0;

/* =========================================================
   CONSTANTS
========================================================= */

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

const RESET_TOKEN_PARAM_NAMES = [
  "token",
  "resetToken",
  "passwordResetToken",
  "code",
  "t",
];

const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATION_PATH,
    windowKey: "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
  }),

  Object.freeze({
    key: "resetConfirm",
    path: RESET_CONFIRM_PATH,
    windowKey: "__ONION_RESET_CONFIRM_INITIAL_URL__",
    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
  }),
]);

/* =========================================================
   HELPERS
========================================================= */

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.("[AppRouter]", ...args);
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[AppRouter]", ...args);
  } catch {}

  try {
    console.warn("[AppRouter]", ...args);
  } catch {}
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.("[AppRouter]", ...args);
  } catch {
    try {
      console.error("[AppRouter]", ...args);
    } catch {}
  }
}

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
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

  const text = String(value).trim();

  return text || fallback;
}

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
  let value = String(pathname || "/")
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
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function normalizeSearch(search = "") {
  const value = String(search || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = String(hash || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw = String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw = String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function splitPath(value = "/") {
  const raw = safeText(value, "/");

  if (isHashRouterPath(raw)) {
    return splitPath(
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
      const parsed = new URL(
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
    return "/";
  }
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

function getPathFromUrlLike(value = "") {
  const raw = safeText(value, "");

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

/* =========================================================
   PROTECTED TOKEN ROUTES
========================================================= */

function getCleanPath(path = "/") {
  return splitPath(
    normalizePath(path)
  ).pathname;
}

function matchesProtectedRoute(config, pathOrUrl = "") {
  if (!config) {
    return false;
  }

  const path = getPathFromUrlLike(pathOrUrl);
  const cleanPath = getCleanPath(path);

  return (
    cleanPath === config.path ||
    cleanPath.startsWith(`${config.path}/`)
  );
}

function getProtectedRouteConfig(value = "") {
  return (
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((config) =>
      matchesProtectedRoute(config, value)
    ) || null
  );
}

function getPathToken(config, value = "") {
  if (!config) {
    return "";
  }

  const path = getPathFromUrlLike(value);
  const cleanPath = getCleanPath(path);

  if (!cleanPath.startsWith(`${config.path}/`)) {
    return "";
  }

  const token = cleanPath
    .slice(`${config.path}/`.length)
    .split("/")[0];

  try {
    return safeText(
      decodeURIComponent(token || ""),
      ""
    );
  } catch {
    return safeText(token, "");
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

  const raw = safeText(value, "");

  if (!raw) {
    return false;
  }

  if (getPathToken(config, raw)) {
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
        config.tokenParamNames
      )
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenParamNames
      );
    }

    return false;
  } catch {
    const parts =
      splitPath(raw);

    if (
      hasTokenInSearch(
        parts.search,
        config.tokenParamNames
      )
    ) {
      return true;
    }

    if (
      parts.hash &&
      parts.hash.includes("?")
    ) {
      const query =
        parts.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenParamNames
      );
    }

    return false;
  }
}

function isProtectedPublicTokenPath(path = "") {
  const config =
    getProtectedRouteConfig(path);

  if (!config) {
    return false;
  }

  return hasProtectedTokenInUrlLike(
    config,
    path
  );
}

function redactTokenInText(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  let output = raw;

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    const escapedPath =
      config.path.replace(/\//g, "\\/");

    output = output.replace(
      new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
      "$1/***"
    );

    for (const name of config.tokenParamNames) {
      output = output.replace(
        new RegExp(`([?&]${name}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    }
  }

  return output;
}

/* =========================================================
   INITIAL URL STORAGE
========================================================= */

function getStoredInitialUrl(config) {
  if (!isBrowser() || !config?.windowKey) {
    return "";
  }

  try {
    return safeText(
      window[config.windowKey],
      ""
    );
  } catch {
    return "";
  }
}

function setStoredInitialUrl(config, value = "") {
  if (!isBrowser() || !config?.windowKey) {
    return false;
  }

  try {
    window[config.windowKey] = value;
    return true;
  } catch {
    return false;
  }
}

function getGlobalInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      window.__ONION_INITIAL_URL__,
      ""
    );
  } catch {
    return "";
  }
}

function setGlobalInitialUrl(value = "") {
  if (!isBrowser()) {
    return false;
  }

  try {
    if (!window.__ONION_INITIAL_URL__) {
      window.__ONION_INITIAL_URL__ = value;
    }

    return true;
  } catch {
    return false;
  }
}

function getActivationInitialUrl() {
  return getStoredInitialUrl(
    PROTECTED_PUBLIC_TOKEN_ROUTES[0]
  );
}

function getResetConfirmInitialUrl() {
  return getStoredInitialUrl(
    PROTECTED_PUBLIC_TOKEN_ROUTES[1]
  );
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

    for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
      if (
        matchesProtectedRoute(config, href) &&
        hasProtectedTokenInUrlLike(config, href) &&
        !getStoredInitialUrl(config)
      ) {
        setStoredInitialUrl(config, href);
      }
    }

    return true;
  } catch {
    return false;
  }
}

function resolveProtectedInitialPath() {
  captureInitialBrowserUrl();

  const candidates = [
    ...PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) =>
      getStoredInitialUrl(config)
    ),
    getGlobalInitialUrl(),
    getBrowserHref(),
    getBrowserPath(),
  ]
    .map((value) => safeText(value, ""))
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

    return {
      config,
      path:
        getPathFromUrlLike(candidate),
      url:
        candidate,
    };
  }

  return {
    config: null,
    path: "",
    url: "",
  };
}

function getSafeInitialPath() {
  const protectedInitial =
    resolveProtectedInitialPath();

  if (
    protectedInitial.config &&
    protectedInitial.path
  ) {
    return protectedInitial.path;
  }

  const browserPath =
    getBrowserPath();

  if (browserPath) {
    return browserPath;
  }

  return normalizePath(
    getCurrentPath(AppCore) ||
      "/"
  );
}

function shouldProtectInitialHistory(path = "/") {
  if (isProtectedPublicTokenPath(path)) {
    return true;
  }

  const protectedInitial =
    resolveProtectedInitialPath();

  return Boolean(
    protectedInitial.config &&
    protectedInitial.path
  );
}

function shouldUsePath(value) {
  return (
    typeof value === "string" &&
    value.trim()
  );
}

/* =========================================================
   STATE SYNC
========================================================= */

function syncResolvedRouteState(
  fallbackPath = "/"
) {
  const resolvedCanonicalPath =
    normalizePath(
      getCurrentCanonicalPath(
        AppCore,
        Router
      ) ||
        fallbackPath ||
        "/"
    );

  const resolvedPublicPath =
    normalizePath(
      getCurrentPublicPath(
        AppCore,
        Router
      ) ||
        fallbackPath ||
        resolvedCanonicalPath
    );

  try {
    AppCore?.setRoute?.(
      resolvedCanonicalPath
    );
  } catch {}

  try {
    AppCore?.setPublicPath?.(
      resolvedPublicPath
    );
  } catch {}

  try {
    AppCore?.setState?.({
      route:
        resolvedCanonicalPath,
      publicPath:
        resolvedPublicPath,
    });
  } catch {}

  return {
    canonicalPath:
      resolvedCanonicalPath,
    publicPath:
      resolvedPublicPath,
  };
}

function markInitialRenderDone(
  value = true
) {
  firstRenderDone =
    Boolean(value);

  try {
    AppCore?.setState?.({
      initialRouteRendered:
        Boolean(value),
    });
  } catch {}
}

function getRenderOptions(path = "/") {
  if (
    shouldProtectInitialHistory(path)
  ) {
    return {
      skipHistory: true,
      preservePath: true,
      replaceState: false,
      force: true,
      initialRender: true,
      protectedInitialUrl: true,
    };
  }

  return {
    replaceState: true,
    force: true,
    initialRender: true,
  };
}

/* =========================================================
   EARLY URL CAPTURE
========================================================= */

captureInitialBrowserUrl();

/* =========================================================
   CONFIGURE
========================================================= */

export function configureRouter() {
  if (configured) {
    return Router;
  }

  try {
    if (
      isFunction(
        Router?.configure
      )
    ) {
      Router.configure({
        core: AppCore,
        auth: Auth,
      });
    }

    configured = true;

    safeLog(
      "Router configurado."
    );
  } catch (error) {
    safeError(
      "Error configurando Router:",
      error
    );
  }

  return Router;
}

/* =========================================================
   BIND
========================================================= */

export function bindRouter() {
  configureRouter();

  if (bound) {
    return Router;
  }

  try {
    if (
      isFunction(
        Router?.bind
      )
    ) {
      Router.bind();
    }

    bound = true;

    safeLog(
      "Router listeners activos."
    );
  } catch (error) {
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

async function runInitialRender(
  path = "/",
  cycleId = 0
) {
  const target =
    normalizePath(path);

  const options =
    getRenderOptions(target);

  await Promise.resolve(
    Router.render(
      target,
      options
    )
  );

  if (
    cycleId !== renderCycle
  ) {
    return false;
  }

  const resolved =
    syncResolvedRouteState(
      target
    );

  applyPostRenderLoaderPolicy({
    AppCore,
    Router,
  });

  markInitialRenderDone(
    true
  );

  safeLog(
    "Render inicial completado.",
    {
      target:
        redactTokenInText(target),
      options,
      resolved: {
        canonicalPath:
          redactTokenInText(resolved.canonicalPath),
        publicPath:
          redactTokenInText(resolved.publicPath),
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
    Capturamos el path ANTES de bindRouter().
    Router.bind() puede inicializar History y tocar replaceState.
  */
  const initialPathBeforeBind =
    getSafeInitialPath();

  bindRouter();

  if (
    firstRenderDone
  ) {
    return true;
  }

  if (
    initialRenderPromise
  ) {
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
            "/"
        );

      try {
        safeLog(
          "Render inicial:",
          {
            path:
              redactTokenInText(path),
            protectedInitialUrl:
              shouldProtectInitialHistory(path),
            initialUrl:
              redactTokenInText(getGlobalInitialUrl()),
            activationInitialUrl:
              redactTokenInText(getActivationInitialUrl()),
            resetConfirmInitialUrl:
              redactTokenInText(getResetConfirmInitialUrl()),
          }
        );

        const ok =
          await runInitialRender(
            path,
            cycleId
          );

        if (ok) {
          return true;
        }

        return false;
      } catch (error) {
        safeWarn(
          "Fallo render inicial. Fallback '/'.",
          error
        );

        try {
          const fallback =
            shouldUsePath("/")
              ? "/"
              : path;

          const ok =
            await runInitialRender(
              fallback,
              cycleId
            );

          if (ok) {
            safeLog(
              "Fallback render inicial completado."
            );
          }

          return ok;
        } catch (fatal) {
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

export function resetRouterBootstrap() {
  firstRenderDone = false;
  initialRenderPromise = null;
  renderCycle = 0;

  try {
    AppCore?.setState?.({
      initialRouteRendered: false,
    });
  } catch {}

  return true;
}

export function getRouterBootstrapState() {
  const protectedInitial =
    resolveProtectedInitialPath();

  return {
    configured,
    bound,
    firstRenderDone,
    initialRenderInFlight:
      Boolean(
        initialRenderPromise
      ),
    renderCycle,

    route:
      AppCore?.state?.route || "/",

    publicPath:
      AppCore?.state?.publicPath || "/",

    initialUrl:
      redactTokenInText(
        getGlobalInitialUrl()
      ),

    activationInitialUrl:
      redactTokenInText(
        getActivationInitialUrl()
      ),

    resetConfirmInitialUrl:
      redactTokenInText(
        getResetConfirmInitialUrl()
      ),

    protectedInitialPath:
      redactTokenInText(
        protectedInitial.path
      ),

    protectedInitialRouteKey:
      protectedInitial.config?.key || "",

    currentBrowserPath:
      redactTokenInText(
        getBrowserPath()
      ),
  };
}

export default {
  configureRouter,
  bindRouter,
  renderInitialRoute,
  resetRouterBootstrap,
  getRouterBootstrapState,
};
