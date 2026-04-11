/* =========================================================
   Onion SPA - App Shell
   Archivo: src/app/shell.js

   Responsabilidades:
   - resolver elementos principales del shell SPA
   - controlar visibilidad global del shell
   - detectar rutas auth-like
   - aplicar política visual post-render
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   ELEMENTS
========================================================= */
export function getShellElements(AppCore) {
  return {
    sidebar: AppCore.dom.sidebar || document.querySelector(".sidebar"),
    topbar: AppCore.dom.topbar || document.querySelector(".topbar"),
    tablehead:
      document.getElementById("table-head") ||
      document.querySelector(".table-head"),
    tableheadContainer:
      AppCore.dom.tableheadContainer ||
      document.getElementById("tablehead-container"),
    body: AppCore.dom.body || document.body,
  };
}

export function getViewContainer(AppCore) {
  return (
    AppCore.dom.viewContainer ||
    document.getElementById("view-container") ||
    document.querySelector("#view-container")
  );
}

/* =========================================================
   SHELL VISIBILITY
========================================================= */
export function setShellVisibility(AppCore, visible = true) {
  const hidden = !visible;
  const {
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    body,
  } = getShellElements(AppCore);

  if (sidebar) sidebar.hidden = hidden;
  if (topbar) topbar.hidden = hidden;
  if (tablehead) tablehead.hidden = hidden;
  if (tableheadContainer) tableheadContainer.hidden = hidden;

  if (body) {
    body.classList.toggle("route-shell-hidden", hidden);
    body.classList.toggle("auth-screen", hidden);
    body.classList.toggle("route-auth", hidden);
  }

  AppCore.events.emit("router:shell:change", {
    hidden,
  });
}

/* =========================================================
   ROUTE MODE
========================================================= */
export function isLoginPath(AppCore, path = "") {
  const normalized = AppCore.utils.normalizePath(path || "/");
  return normalized === "/login" || normalized.startsWith("/login?");
}

export function isAuthLikeRoute(AppCore, Router) {
  const currentCanonicalPath = getCurrentCanonicalPath(AppCore, Router);
  const currentPublicPath = getCurrentPublicPath(AppCore);

  return (
    currentCanonicalPath === "/login" ||
    isLoginPath(AppCore, currentPublicPath)
  );
}

export function updateShellVisibilityByRoute(AppCore, Router) {
  if (isAuthLikeRoute(AppCore, Router)) {
    setShellVisibility(AppCore, false);
    return;
  }

  setShellVisibility(AppCore, true);
}

/* =========================================================
   POST-RENDER POLICY
========================================================= */
export function applyPostRenderLoaderPolicy({
  AppCore,
  Router,
  hideLoader,
}) {
  const viewContainer = getViewContainer(AppCore);
  const hasViewContent = Boolean(viewContainer?.innerHTML?.trim());

  updateShellVisibilityByRoute(AppCore, Router);

  if (isAuthLikeRoute(AppCore, Router)) {
    hideLoader(AppCore);
    return;
  }

  if (hasViewContent) {
    hideLoader(AppCore);
  }
}
