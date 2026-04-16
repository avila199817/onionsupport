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

   HARDENING PRO:
   - idempotencia total
   - safe logs
   - fallback route "/"
   - render serializado
   - no doble initial render
   - no sobrescribir route/publicPath con valores inconsistentes
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

function normalizeInitialPath(path) {
  if (typeof path !== "string") {
    return "/";
  }

  const trimmed = path.trim();

  if (!trimmed) {
    return "/";
  }

  return trimmed.startsWith("/")
    ? trimmed
    : `/${trimmed}`;
}

function getSafeInitialPath() {
  return normalizeInitialPath(
    getCurrentPath(AppCore) || "/"
  );
}

function syncResolvedRouteState(fallbackPath) {
  const resolvedCanonicalPath =
    normalizeInitialPath(
      getCurrentCanonicalPath(
        AppCore,
        Router
      ) || fallbackPath || "/"
    );

  const resolvedPublicPath =
    normalizeInitialPath(
      getCurrentPublicPath(
        AppCore,
        Router
      ) || fallbackPath || resolvedCanonicalPath
    );

  AppCore?.setRoute?.(
    resolvedCanonicalPath
  );

  AppCore?.setPublicPath?.(
    resolvedPublicPath
  );

  AppCore?.setState?.({
    route: resolvedCanonicalPath,
    publicPath: resolvedPublicPath,
  });

  return {
    canonicalPath:
      resolvedCanonicalPath,
    publicPath:
      resolvedPublicPath,
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
      isFunction(Router?.bind)
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
   INITIAL RENDER
========================================================= */

export async function renderInitialRoute() {
  bindRouter();

  if (firstRenderDone) {
    return true;
  }

  if (initialRenderPromise) {
    return initialRenderPromise;
  }

  initialRenderPromise =
    (async () => {
      const path =
        getSafeInitialPath();

      try {
        safeLog(
          "Render inicial:",
          path
        );

        await Promise.resolve(
          Router.render(path, {
            replaceState: true,
            force: true,
          })
        );

        const resolved =
          syncResolvedRouteState(
            path
          );

        applyPostRenderLoaderPolicy({
          AppCore,
          Router,
        });

        firstRenderDone = true;

        AppCore?.setState?.({
          initialRouteRendered: true,
        });

        safeLog(
          "Render inicial completado.",
          resolved
        );

        return true;
      } catch (error) {
        safeWarn(
          "Fallo render inicial. Fallback '/'.",
          error
        );

        try {
          await Promise.resolve(
            Router.render("/", {
              replaceState: true,
              force: true,
            })
          );

          const resolved =
            syncResolvedRouteState(
              "/"
            );

          applyPostRenderLoaderPolicy({
            AppCore,
            Router,
          });

          firstRenderDone = true;

          AppCore?.setState?.({
            initialRouteRendered: true,
          });

          safeLog(
            "Fallback render inicial completado.",
            resolved
          );

          return true;
        } catch (fatal) {
          safeError(
            "Render inicial fatal:",
            fatal
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
   PUBLIC API
========================================================= */

export function getRouterBootstrapState() {
  return {
    configured,
    bound,
    firstRenderDone,
    initialRenderInFlight:
      Boolean(
        initialRenderPromise
      ),
  };
}

export default {
  configureRouter,
  bindRouter,
  renderInitialRoute,
  getRouterBootstrapState,
};
