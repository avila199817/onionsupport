/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: src/app/router.js

   Responsabilidades:
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
========================================================= */

import { AppCore } from "../core/index.js";
import { Router } from "../router/index.js";
import { Auth } from "../features/auth/index.js";

import {
  getCurrentPath,
  getCurrentPublicPath,
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

/* =========================================================
   CONFIGURE
========================================================= */

export function configureRouter() {
  if (configured) {
    return Router;
  }

  try {
    if (
      typeof Router?.configure ===
      "function"
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
      typeof Router?.bind ===
      "function"
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

  const path =
    getCurrentPath(
      AppCore
    ) || "/";

  try {
    safeLog(
      "Render inicial:",
      path
    );

    await Promise.resolve(
      Router.render(
        path,
        {
          replaceState: true,
          force: true,
        }
      )
    );

    const publicPath =
      getCurrentPublicPath(
        AppCore
      ) || path;

    AppCore?.setRoute?.(path);
    AppCore?.setPublicPath?.(
      publicPath
    );

    applyPostRenderLoaderPolicy?.(
      AppCore
    );

    firstRenderDone = true;

    safeLog(
      "Render inicial completado."
    );

    return true;
  } catch (error) {
    safeWarn(
      "Fallo render inicial. Fallback '/'.",
      error
    );

    try {
      await Promise.resolve(
        Router.render(
          "/",
          {
            replaceState: true,
            force: true,
          }
        )
      );

      firstRenderDone = true;

      return true;
    } catch (fatal) {
      safeError(
        "Render inicial fatal:",
        fatal
      );

      return false;
    }
  }
}

/* =========================================================
   PUBLIC API
========================================================= */

export function getRouterBootstrapState() {
  return {
    configured,
    bound,
    firstRenderDone,
  };
}

export default {
  configureRouter,
  bindRouter,
  renderInitialRoute,
  getRouterBootstrapState,
};
