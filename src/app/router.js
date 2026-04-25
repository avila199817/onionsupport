/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: src/app/router.js

   RESPONSABILIDADES:
   - configurar Router con dependencias
   - bind listeners una sola vez
   - render inicial robusto
   - capturar URL inicial antes de que Router/History puedan tocarla
   - preservar token de activación hasta que ActivateAccountView lo lea
   - sincronizar route/publicPath tras primer paint
   - integrarse con loader boot
   - tolerar fallos sin romper SPA

   HARDENING EXTREMO:
   - idempotencia total
   - safe logs
   - fallback route "/"
   - render serializado
   - no doble initial render
   - no sobrescribir route/publicPath inconsistentes
   - anti stale boot calls
   - snapshot debug enterprise
   - protección de /activate-account?token=...
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

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

/* =========================================================
   HELPERS
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
  } catch {
    try {
      console.error(...args);
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

function splitPath(value = "/") {
  const raw =
    safeText(value, "/");

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname:
      normalizePathnameOnly(pathname),
    search,
    hash,
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

  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);

      if (
        parsed.hash &&
        /^#\/[^/]/.test(parsed.hash)
      ) {
        return normalizePath(
          parsed.hash.replace(/^#/, "")
        );
      }

      return normalizePath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  if (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  ) {
    return normalizePath(
      raw.replace(/^#\/?/, "/")
    );
  }

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
      /^#\/[^/]/.test(hash)
    ) {
      return normalizePath(
        hash.replace(/^#/, "")
      );
    }

    return normalizePath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return "/";
  }
}

function getPathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed =
      new URL(
        raw,
        isBrowser()
          ? window.location.origin
          : "http://localhost"
      );

    if (
      parsed.hash &&
      /^#\/[^/]/.test(parsed.hash)
    ) {
      return normalizePath(
        parsed.hash.replace(/^#/, "")
      );
    }

    return normalizePath(
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return normalizePath(raw);
  }
}

function isActivationPath(path = "") {
  const normalized =
    normalizePath(path);

  const cleanPath =
    splitPath(normalized).pathname;

  return (
    cleanPath === ACTIVATION_PATH ||
    cleanPath.startsWith(`${ACTIVATION_PATH}/`)
  );
}

function hasActivationTokenInSearch(search = "") {
  try {
    const params =
      new URLSearchParams(search || "");

    return ACTIVATION_TOKEN_PARAM_NAMES.some(
      (name) =>
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

function hasActivationTokenInUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  try {
    const parsed =
      new URL(
        raw,
        isBrowser()
          ? window.location.origin
          : "http://localhost"
      );

    if (
      hasActivationTokenInSearch(parsed.search)
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash.split("?").slice(1).join("?");

      return hasActivationTokenInSearch(
        query ? `?${query}` : ""
      );
    }
  } catch {
    const parts =
      splitPath(raw);

    if (
      hasActivationTokenInSearch(parts.search)
    ) {
      return true;
    }

    if (
      parts.hash &&
      parts.hash.includes("?")
    ) {
      const query =
        parts.hash.split("?").slice(1).join("?");

      return hasActivationTokenInSearch(
        query ? `?${query}` : ""
      );
    }
  }

  return false;
}

function getActivationInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__,
    ""
  );
}

function getGlobalInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_INITIAL_URL__,
    ""
  );
}

function captureInitialBrowserUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href =
      window.location.href;

    if (!window.__ONION_INITIAL_URL__) {
      window.__ONION_INITIAL_URL__ = href;
    }

    if (
      isActivationPath(getPathFromUrlLike(href)) &&
      !window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
    ) {
      window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__ = href;
    }

    return true;
  } catch {
    return false;
  }
}

function getSafeInitialPath() {
  captureInitialBrowserUrl();

  const activationInitialUrl =
    getActivationInitialUrl();

  if (
    activationInitialUrl &&
    hasActivationTokenInUrlLike(activationInitialUrl)
  ) {
    return getPathFromUrlLike(
      activationInitialUrl
    );
  }

  const globalInitialUrl =
    getGlobalInitialUrl();

  if (
    globalInitialUrl &&
    isActivationPath(
      getPathFromUrlLike(globalInitialUrl)
    ) &&
    hasActivationTokenInUrlLike(globalInitialUrl)
  ) {
    return getPathFromUrlLike(
      globalInitialUrl
    );
  }

  const browserPath =
    getBrowserPath();

  if (
    isActivationPath(browserPath)
  ) {
    return browserPath;
  }

  return normalizePath(
    getCurrentPath(AppCore) ||
      browserPath ||
      "/"
  );
}

function shouldProtectInitialHistory(path = "/") {
  if (
    isActivationPath(path)
  ) {
    return true;
  }

  const activationInitialUrl =
    getActivationInitialUrl();

  if (
    activationInitialUrl &&
    isActivationPath(
      getPathFromUrlLike(activationInitialUrl)
    )
  ) {
    return true;
  }

  const globalInitialUrl =
    getGlobalInitialUrl();

  if (
    globalInitialUrl &&
    isActivationPath(
      getPathFromUrlLike(globalInitialUrl)
    )
  ) {
    return true;
  }

  return false;
}

function shouldUsePath(value) {
  return (
    typeof value === "string" &&
    value.trim()
  );
}

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
      target,
      options,
      resolved,
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
            path,
            protectedInitialUrl:
              shouldProtectInitialHistory(path),
            initialUrl:
              getGlobalInitialUrl(),
            activationInitialUrl:
              getActivationInitialUrl(),
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

  return true;
}

export function getRouterBootstrapState() {
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
      getGlobalInitialUrl(),

    activationInitialUrl:
      getActivationInitialUrl(),

    currentBrowserPath:
      getBrowserPath(),
  };
}

export default {
  configureRouter,
  bindRouter,
  renderInitialRoute,
  resetRouterBootstrap,
  getRouterBootstrapState,
};
