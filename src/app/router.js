/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: src/app/router.js

   Responsabilidades:
   - configurar dependencias del router
   - bind del router una sola vez
   - lanzar la primera renderización controlada
   - sincronizar publicPath tras render
   - aplicar política visual post-render

   HARDENING PRO:
   - await real del primer render
   - guards estrictos
   - no doble first-render
   - sync robusta de publicPath
   - tolerancia si Router falla
========================================================= */

import {
  getCurrentPath,
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   CONFIGURE
========================================================= */
export function configureRouter({
  Router,
  AppCore,
  Auth,
  state,
} = {}) {
  if (!Router || !AppCore) {
    return false;
  }

  if (state?.routerConfigured) {
    return true;
  }

  if (
    typeof Router.configure ===
    "function"
  ) {
    Router.configure({
      core: AppCore,
      auth: Auth,
    });
  }

  if (state) {
    state.routerConfigured = true;
  }

  return true;
}

/* =========================================================
   BIND
========================================================= */
export function bindRouter({
  Router,
  state,
} = {}) {
  if (!Router) {
    return false;
  }

  if (state?.routerBound) {
    return true;
  }

  if (
    typeof Router.bind ===
    "function"
  ) {
    Router.bind();
  }

  if (state) {
    state.routerBound = true;
  }

  return true;
}

/* =========================================================
   FIRST RENDER
========================================================= */
export async function renderInitialRoute({
  AppCore,
  Router,
  applyPostRenderLoaderPolicy,
} = {}) {
  if (!AppCore || !Router) {
    return false;
  }

  const currentPath =
    getCurrentPath(AppCore);

  try {
    if (
      typeof Router.render ===
      "function"
    ) {
      await Promise.resolve(
        Router.render(
          currentPath,
          {
            skipHistory: true,
            replaceState: true,
            force: true,
          }
        )
      );
    }

    if (
      typeof AppCore.setPublicPath ===
      "function"
    ) {
      AppCore.setPublicPath(
        getCurrentPublicPath(
          AppCore
        )
      );
    }

    applyPostRenderLoaderPolicy?.();

    return true;
  } catch (error) {
    AppCore?.utils?.error?.(
      "First render error:",
      error
    );

    applyPostRenderLoaderPolicy?.();

    throw error;
  }
}
