/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: src/app/router.js

   RESPONSABILIDADES:
   - configurar Router con dependencias
   - bind listeners una sola vez
   - render inicial robusto
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
    console.error(...args);
  }
}

function isFunction(value) {
  return typeof value === "function";
}

function normalizePath(path = "/") {
  const raw =
    typeof path === "string"
      ? path.trim()
      : "/";

  if (!raw) {
    return "/";
  }

  const normalized =
    raw.startsWith("/")
      ? raw
      : `/${raw}`;

  return (
    normalized
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") || "/"
  );
}

function getSafeInitialPath() {
  return normalizePath(
    getCurrentPath(
      AppCore
    ) || "/"
  );
}

function shouldUsePath(value) {
  return (
    typeof value ===
      "string" &&
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

function getRenderOptions() {
  return {
    replaceState: true,
    force: true,
  };
}

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

  await Promise.resolve(
    Router.render(
      target,
      getRenderOptions()
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
    resolved
  );

  return true;
}

/* =========================================================
   INITIAL RENDER
========================================================= */

export async function renderInitialRoute() {
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
        getSafeInitialPath();

      try {
        safeLog(
          "Render inicial:",
          path
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
            shouldUsePath(
              "/"
            )
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
      AppCore?.state
        ?.route || "/",
    publicPath:
      AppCore?.state
        ?.publicPath ||
      "/",
  };
}

export default {
  configureRouter,
  bindRouter,
  renderInitialRoute,
  resetRouterBootstrap,
  getRouterBootstrapState,
};
