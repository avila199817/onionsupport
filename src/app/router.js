/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: src/app/router.js

   Responsabilidades:
   - bind del router una sola vez
   - lanzar la primera renderización inmediata
   - sincronizar publicPath tras el render inicial
   - aplicar política visual post-render
========================================================= */

import { getCurrentPath, getCurrentPublicPath } from "./helpers.js";

export function bindRouter({
  Router,
  state,
}) {
  if (state?.routerBound) return;

  Router.bind();

  if (state) {
    state.routerBound = true;
  }
}

export function renderInitialRoute({
  AppCore,
  Router,
  applyPostRenderLoaderPolicy,
}) {
  const currentPath = getCurrentPath(AppCore);

  Router.render(currentPath, {
    skipHistory: true,
    replaceState: true,
    force: true,
  });

  AppCore.setPublicPath(getCurrentPublicPath(AppCore));
  applyPostRenderLoaderPolicy?.();
}
