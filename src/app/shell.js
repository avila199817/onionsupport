/* =========================================================
   Onion SPA - App Shell
   Archivo: src/app/shell.js

   HARDENED VERSION
   FIX:
   - cero referencias libres
   - snapshot seguro
   - eventos robustos
   - shell visibility estable
   - loader anti-stuck
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeEmit(AppCore, name, payload = {}) {
  try {
    AppCore?.events?.emit?.(name, payload);
  } catch {}
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function normalizePath(AppCore, path = "/") {
  try {
    if (typeof AppCore?.utils?.normalizePath === "function") {
      return AppCore.utils.normalizePath(path);
    }
  } catch {}

  let raw = safeText(path, "/");

  if (!raw.startsWith("/")) {
    raw = `/${raw}`;
  }

  raw = raw.replace(/\/{2,}/g, "/").replace(/\/+$/g, "");

  return raw || "/";
}

function setDataset(el, key, value) {
  if (!el) return;

  try {
    if (value === null || value === undefined || value === "") {
      delete el.dataset[key];
      return;
    }

    el.dataset[key] = String(value);
  } catch {}
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      sidebar: null,
      topbar: null,
      tablehead: null,
      tableheadContainer: null,
      body: null,
      html: null,
    };
  }

  return {
    sidebar:
      AppCore?.dom?.sidebar ||
      document.querySelector(".sidebar") ||
      null,

    topbar:
      AppCore?.dom?.topbar ||
      document.querySelector(".topbar") ||
      null,

    tablehead:
      document.getElementById("table-head") ||
      document.querySelector(".table-head") ||
      null,

    tableheadContainer:
      AppCore?.dom?.tableheadContainer ||
      document.getElementById("tablehead-container") ||
      null,

    body: document.body || null,
    html: document.documentElement || null,
  };
}

export function getViewContainer(AppCore) {
  if (!isBrowser()) return null;

  return (
    AppCore?.dom?.viewContainer ||
    document.getElementById("view-container") ||
    null
  );
}

/* =========================================================
   HELPERS
========================================================= */

function applyHidden(el, hidden = false) {
  if (!el) return;

  el.hidden = Boolean(hidden);
  el.setAttribute(
    "aria-hidden",
    hidden ? "true" : "false"
  );
}

function toggleClass(el, name, force) {
  if (!el) return;

  try {
    el.classList.toggle(name, force);
  } catch {}
}

/* =========================================================
   SHELL VISIBILITY
========================================================= */

export function setShellVisibility(
  AppCore,
  visible = true
) {
  const hidden = !Boolean(visible);

  const {
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    body,
    html,
  } = getShellElements(AppCore);

  applyHidden(sidebar, hidden);
  applyHidden(topbar, hidden);
  applyHidden(tablehead, hidden);
  applyHidden(tableheadContainer, hidden);

  toggleClass(body, "route-shell-hidden", hidden);
  toggleClass(body, "route-shell-visible", !hidden);

  setDataset(body, "shell", hidden ? "hidden" : "visible");
  setDataset(html, "shell", hidden ? "hidden" : "visible");

  try {
    AppCore.state.shellVisible = !hidden;
  } catch {}

  const shellSnapshot = getShellSnapshot(AppCore);

  safeEmit(AppCore, "router:shell:change", {
    hidden,
    visible: !hidden,
    snapshot: shellSnapshot,
  });

  return !hidden;
}

/* =========================================================
   ROUTES
========================================================= */

export function isLoginPath(AppCore, path = "") {
  const p = normalizePath(AppCore, path);
  return p === "/login" || p.startsWith("/login?");
}

export function isResetPasswordPath(AppCore, path = "") {
  const p = normalizePath(AppCore, path);
  return (
    p === "/reset-password" ||
    p.startsWith("/reset-password?")
  );
}

export function isResetPasswordConfirmPath(
  AppCore,
  path = ""
) {
  const p = normalizePath(AppCore, path);

  return (
    p === "/reset-password/confirm" ||
    p.startsWith("/reset-password/confirm?")
  );
}

export function isAuthLikeRoute(AppCore, Router) {
  const canonical = normalizePath(
    AppCore,
    getCurrentCanonicalPath(AppCore, Router)
  );

  const publicPath = normalizePath(
    AppCore,
    getCurrentPublicPath(AppCore)
  );

  return [canonical, publicPath].some(
    (path) =>
      isLoginPath(AppCore, path) ||
      isResetPasswordPath(AppCore, path) ||
      isResetPasswordConfirmPath(AppCore, path)
  );
}

export function updateShellVisibilityByRoute(
  AppCore,
  Router
) {
  const authLike = isAuthLikeRoute(AppCore, Router);

  return setShellVisibility(AppCore, !authLike);
}

/* =========================================================
   LOADER
========================================================= */

function hideLoaderSafe(AppCore, hideLoader) {
  try {
    if (typeof hideLoader === "function") {
      hideLoader(AppCore);
      return true;
    }
  } catch {}

  const loader =
    AppCore?.dom?.loader ||
    document.getElementById("app-loader");

  if (!loader) return false;

  loader.hidden = true;
  loader.classList.add("is-hidden");
  loader.setAttribute("aria-hidden", "true");

  return true;
}

/* =========================================================
   POST RENDER
========================================================= */

export function applyPostRenderLoaderPolicy({
  AppCore,
  Router,
  hideLoader,
} = {}) {
  const view = getViewContainer(AppCore);

  const hasViewContent = Boolean(
    safeText(view?.innerHTML, "").trim()
  );

  const authLike = isAuthLikeRoute(AppCore, Router);

  const shellVisible = updateShellVisibilityByRoute(
    AppCore,
    Router
  );

  const loaderHidden =
    authLike || hasViewContent
      ? hideLoaderSafe(AppCore, hideLoader)
      : false;

  const shellSnapshot = getShellSnapshot(
    AppCore,
    Router
  );

  safeEmit(AppCore, "app:shell:post-render", {
    authLike,
    hasViewContent,
    shellVisible,
    loaderHidden,
    snapshot: shellSnapshot,
  });

  return shellSnapshot;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getShellSnapshot(
  AppCore,
  Router = null
) {
  const view = getViewContainer(AppCore);

  return {
    shellVisible: Boolean(
      AppCore?.state?.shellVisible
    ),

    authLike: isAuthLikeRoute(
      AppCore,
      Router
    ),

    canonical:
      getCurrentCanonicalPath(AppCore, Router),

    publicPath:
      getCurrentPublicPath(AppCore),

    hasView: Boolean(view),

    hasViewContent: Boolean(
      safeText(view?.innerHTML, "").trim()
    ),
  };
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  getShellElements,
  getViewContainer,
  setShellVisibility,
  isLoginPath,
  isResetPasswordPath,
  isResetPasswordConfirmPath,
  isAuthLikeRoute,
  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,
  getShellSnapshot,
};
