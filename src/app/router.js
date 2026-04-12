/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: src/app/router.js

   Responsabilidades:
   - configurar dependencias del router
   - bind del router una sola vez
   - lanzar la primera renderización controlada
   - sincronizar publicPath tras render
   - aplicar política visual post-render
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
  if (!Router) return;

  if (state?.routerConfigured) {
    return;
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
}

/* =========================================================
   BIND
========================================================= */
export function bindRouter({
  Router,
  state,
} = {}) {
  if (!Router) return;

  if (state?.routerBound) {
    return;
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
}

/* =========================================================
   FIRST RENDER
========================================================= */
export function renderInitialRoute({
  AppCore,
  Router,
  applyPostRenderLoaderPolicy,
} = {}) {
  if (!AppCore || !Router) {
    return;
  }

  const currentPath =
    getCurrentPath(AppCore);

  if (
    typeof Router.render ===
    "function"
  ) {
    Router.render(
      currentPath,
      {
        skipHistory: true,
        replaceState: true,
        force: true,
      }
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
}
