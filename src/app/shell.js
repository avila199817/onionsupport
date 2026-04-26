/* =========================================================
   Onion SPA - App Shell
   Archivo: src/app/shell.js

   STABLE VERSION · NO FLICKER · BOOT LOADER ALIGNED · FINAL 10/10

   RESPONSABILIDADES:
   - resolver elementos principales del shell
   - controlar visibilidad de sidebar/topbar/tablehead por ruta
   - no ocultar el shell principal de login/reset
   - mantener app-shell estable durante boot
   - sincronizar aria-busy / aria-hidden / data-shell
   - no esconder loader global antes de finalizeBoot
   - evitar re-toggle visual innecesario
   - snapshot robusto para debug

   ALINEADO CON:
   - src/app/index.js
   - src/app/loader.js
   - src/css/core/loader.css
   - index.html con #app-loader estático

   REGLA:
   - loader global lo decide App Bootstrap.
   - shell.js puede pedir hideLoader solo cuando NO hay boot activo.
   - durante boot, el CSS app-booting/app-loading mantiene #app-shell oculto.
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

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );
    }
  } catch {}
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
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

  raw = raw
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  const hashIndex = raw.indexOf("#");
  const queryIndex = raw.indexOf("?");

  let cutIndex = -1;

  if (queryIndex >= 0 && hashIndex >= 0) {
    cutIndex = Math.min(queryIndex, hashIndex);
  } else if (queryIndex >= 0) {
    cutIndex = queryIndex;
  } else if (hashIndex >= 0) {
    cutIndex = hashIndex;
  }

  const suffix =
    cutIndex >= 0
      ? raw.slice(cutIndex)
      : "";

  let pathname =
    cutIndex >= 0
      ? raw.slice(0, cutIndex)
      : raw;

  pathname =
    pathname.replace(/\/+$/g, "") ||
    "/";

  return `${pathname}${suffix}`;
}

function pathnameOnly(AppCore, path = "/") {
  const normalized = normalizePath(AppCore, path);

  return (
    normalized
      .split("?")[0]
      .split("#")[0]
      .replace(/\/+$/g, "") ||
    "/"
  );
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

function toggleClass(el, name, force) {
  if (!el || !name) return;

  try {
    el.classList.toggle(name, Boolean(force));
  } catch {}
}

function setAttribute(el, name, value) {
  if (!el || !name) return;

  try {
    if (value === null || value === undefined) {
      el.removeAttribute(name);
      return;
    }

    el.setAttribute(name, String(value));
  } catch {}
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      appShell: null,
      mainContent: null,
      appContent: null,
      viewContainer: null,

      sidebar: null,
      topbar: null,

      tablehead: null,
      tableheadContainer: null,

      loader: null,

      body: null,
      html: null,
    };
  }

  const appShell =
    document.getElementById("app-shell") ||
    document.querySelector("[data-app-shell='true']") ||
    null;

  const mainContent =
    document.getElementById("main-content") ||
    document.querySelector("main.main-content") ||
    null;

  const appContent =
    document.getElementById("app-content") ||
    document.querySelector("[data-app-content]") ||
    null;

  const viewContainer =
    AppCore?.dom?.viewContainer ||
    document.getElementById("view-container") ||
    document.querySelector("[data-view-root]") ||
    null;

  const sidebar =
    AppCore?.dom?.sidebar ||
    document.querySelector(".sidebar") ||
    document.querySelector("[data-sidebar-root]") ||
    null;

  const topbar =
    AppCore?.dom?.topbar ||
    document.querySelector(".topbar") ||
    document.querySelector("[data-topbar-root]") ||
    null;

  const tablehead =
    document.getElementById("table-head") ||
    document.querySelector(".table-head") ||
    null;

  const tableheadContainer =
    AppCore?.dom?.tableheadContainer ||
    document.getElementById("tablehead-container") ||
    document.querySelector("[data-tablehead-container]") ||
    null;

  const loader =
    AppCore?.dom?.loader ||
    document.getElementById("app-loader") ||
    document.querySelector("[data-app-loader='true']") ||
    null;

  try {
    if (AppCore?.dom) {
      AppCore.dom.appShell = appShell;
      AppCore.dom.mainContent = mainContent;
      AppCore.dom.appContent = appContent;
      AppCore.dom.viewContainer = viewContainer;
      AppCore.dom.sidebar = sidebar;
      AppCore.dom.topbar = topbar;
      AppCore.dom.tableheadContainer = tableheadContainer;
      AppCore.dom.loader = loader;
    }
  } catch {}

  return {
    appShell,
    mainContent,
    appContent,
    viewContainer,

    sidebar,
    topbar,

    tablehead,
    tableheadContainer,

    loader,

    body: document.body || null,
    html: document.documentElement || null,
  };
}

export function getViewContainer(AppCore) {
  if (!isBrowser()) return null;

  const el =
    AppCore?.dom?.viewContainer ||
    document.getElementById("view-container") ||
    document.querySelector("[data-view-root]") ||
    null;

  try {
    if (el && AppCore?.dom) {
      AppCore.dom.viewContainer = el;
    }
  } catch {}

  return el;
}

/* =========================================================
   STATE HELPERS
========================================================= */

function getCoreState(AppCore) {
  try {
    return safeObject(AppCore?.state);
  } catch {
    return {};
  }
}

function isBootingOrLoading(AppCore) {
  const state = getCoreState(AppCore);

  return Boolean(
    state.booting ||
      state.loading ||
      state.appBooting ||
      state.bootInProgress
  );
}

function hasBodyBootClass() {
  if (!isBrowser()) return false;

  try {
    return Boolean(
      document.body?.classList?.contains("app-booting") ||
        document.body?.classList?.contains("app-loading") ||
        document.documentElement?.classList?.contains("app-booting") ||
        document.documentElement?.classList?.contains("app-loading")
    );
  } catch {
    return false;
  }
}

function isLoaderVisible(AppCore) {
  const { loader } = getShellElements(AppCore);

  if (!loader) {
    return false;
  }

  try {
    return Boolean(
      !loader.hidden &&
        loader.getAttribute("aria-hidden") !== "true" &&
        !loader.classList.contains("is-hidden") &&
        !loader.classList.contains("has-hidden")
    );
  } catch {
    return false;
  }
}

/* =========================================================
   DOM MUTATORS
========================================================= */

function applyHidden(el, hidden = false) {
  if (!el) return;

  const next = Boolean(hidden);

  try {
    el.hidden = next;
  } catch {}

  setAttribute(
    el,
    "aria-hidden",
    next ? "true" : "false"
  );
}

function applyBusy(el, busy = false) {
  if (!el) return;

  const next = Boolean(busy);

  setAttribute(
    el,
    "aria-busy",
    next ? "true" : "false"
  );
}

function setAppShellBusy(AppCore, busy = false) {
  const {
    appShell,
    mainContent,
    viewContainer,
  } = getShellElements(AppCore);

  applyBusy(appShell, busy);
  applyBusy(mainContent, busy);
  applyBusy(viewContainer, busy);

  return Boolean(busy);
}

function markShellDomState(AppCore, {
  shellVisible = true,
  authLike = false,
  busy = false,
} = {}) {
  const {
    appShell,
    mainContent,
    appContent,
    viewContainer,
    body,
    html,
  } = getShellElements(AppCore);

  const visible = Boolean(shellVisible);
  const isAuth = Boolean(authLike);
  const isBusy = Boolean(busy);

  /*
    Importante:
    app-shell NO se oculta aquí para auth routes.
    Solo se ocultan sidebar/topbar. Login/reset necesitan main visible.
    Durante boot lo oculta CSS con app-booting/app-loading.
  */

  toggleClass(body, "route-auth", isAuth);
  toggleClass(body, "route-app", !isAuth);
  toggleClass(html, "route-auth", isAuth);
  toggleClass(html, "route-app", !isAuth);

  toggleClass(body, "route-shell-hidden", !visible);
  toggleClass(body, "route-shell-visible", visible);

  toggleClass(html, "route-shell-hidden", !visible);
  toggleClass(html, "route-shell-visible", visible);

  setDataset(body, "shell", visible ? "visible" : "hidden");
  setDataset(html, "shell", visible ? "visible" : "hidden");

  setDataset(body, "routeMode", isAuth ? "auth" : "app");
  setDataset(html, "routeMode", isAuth ? "auth" : "app");

  setDataset(appShell, "shell", visible ? "visible" : "hidden");
  setDataset(appShell, "routeMode", isAuth ? "auth" : "app");

  setDataset(mainContent, "routeMode", isAuth ? "auth" : "app");
  setDataset(appContent, "routeMode", isAuth ? "auth" : "app");
  setDataset(viewContainer, "routeMode", isAuth ? "auth" : "app");

  setAppShellBusy(AppCore, isBusy);

  return {
    visible,
    authLike: isAuth,
    busy: isBusy,
  };
}

function readShellVisibility(AppCore) {
  const {
    body,
    html,
    sidebar,
    topbar,
  } = getShellElements(AppCore);

  if (typeof AppCore?.state?.shellVisible === "boolean") {
    return AppCore.state.shellVisible;
  }

  const bodyShell = safeText(body?.dataset?.shell, "");
  if (bodyShell === "visible") return true;
  if (bodyShell === "hidden") return false;

  const htmlShell = safeText(html?.dataset?.shell, "");
  if (htmlShell === "visible") return true;
  if (htmlShell === "hidden") return false;

  if (
    body?.classList?.contains("route-shell-hidden") ||
    html?.classList?.contains("route-shell-hidden")
  ) {
    return false;
  }

  if (sidebar?.hidden || topbar?.hidden) {
    return false;
  }

  return true;
}

/* =========================================================
   SHELL VISIBILITY
========================================================= */

export function setShellVisibility(
  AppCore,
  visible = true,
  options = {}
) {
  const opts = safeObject(options);

  const nextVisible = Boolean(visible);
  const force = Boolean(opts.force);
  const emit = opts.emit !== false;

  const prevVisible = readShellVisibility(AppCore);

  const {
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
  } = getShellElements(AppCore);

  const hidden = !nextVisible;
  const authLike = Boolean(opts.authLike);

  const busy =
    opts.busy !== undefined
      ? Boolean(opts.busy)
      : isBootingOrLoading(AppCore);

  if (!force && prevVisible === nextVisible) {
    try {
      AppCore.state.shellVisible = nextVisible;
    } catch {}

    markShellDomState(AppCore, {
      shellVisible: nextVisible,
      authLike,
      busy,
    });

    return nextVisible;
  }

  /*
    Solo ocultamos cromado de shell:
    - sidebar
    - topbar
    - tablehead

    No ocultamos #app-shell completo porque contiene login/reset.
  */
  applyHidden(sidebar, hidden);
  applyHidden(topbar, hidden);
  applyHidden(tablehead, hidden);

  if (tableheadContainer) {
    setAttribute(
      tableheadContainer,
      "aria-hidden",
      hidden ? "true" : "false"
    );
  }

  markShellDomState(AppCore, {
    shellVisible: nextVisible,
    authLike,
    busy,
  });

  try {
    AppCore.state.shellVisible = nextVisible;
  } catch {}

  if (emit) {
    const shellSnapshot = getShellSnapshot(AppCore);

    safeEmit(AppCore, "router:shell:change", {
      hidden,
      visible: nextVisible,
      changed: prevVisible !== nextVisible,
      snapshot: shellSnapshot,
    });
  }

  return nextVisible;
}

/* =========================================================
   ROUTES
========================================================= */

export function isLoginPath(AppCore, path = "") {
  const p = pathnameOnly(AppCore, path);

  return (
    p === "/login" ||
    p === "/signin" ||
    p === "/sign-in"
  );
}

export function isResetPasswordPath(AppCore, path = "") {
  const p = pathnameOnly(AppCore, path);

  return (
    p === "/reset-password" ||
    p === "/forgot-password"
  );
}

export function isResetPasswordConfirmPath(
  AppCore,
  path = ""
) {
  const p = pathnameOnly(AppCore, path);

  return (
    p === "/reset-password/confirm" ||
    p.startsWith("/reset-password/confirm/")
  );
}

export function isActivateAccountPath(
  AppCore,
  path = ""
) {
  const p = pathnameOnly(AppCore, path);

  return (
    p === "/activate-account" ||
    p.startsWith("/activate-account/")
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
      isResetPasswordConfirmPath(AppCore, path) ||
      isActivateAccountPath(AppCore, path)
  );
}

export function updateShellVisibilityByRoute(
  AppCore,
  Router,
  options = {}
) {
  const authLike = isAuthLikeRoute(AppCore, Router);

  return setShellVisibility(
    AppCore,
    !authLike,
    {
      ...safeObject(options),
      authLike,
    }
  );
}

/* =========================================================
   LOADER
========================================================= */

function hideLoaderSafe(AppCore, hideLoader, options = {}) {
  const opts = safeObject(options);

  /*
    Regla anti-flicker:
    Durante boot/loading real NO escondemos loader desde shell.js
    salvo force explícito.

    El loader global debe ocultarse en finalizeBoot().
  */
  const bootBusy =
    isBootingOrLoading(AppCore) ||
    hasBodyBootClass();

  if (bootBusy && opts.force !== true) {
    return false;
  }

  try {
    if (typeof hideLoader === "function") {
      hideLoader(AppCore, {
        reason:
          opts.reason ||
          "shell-post-render",
        minVisibleMs:
          opts.minVisibleMs,
      });

      return true;
    }
  } catch {}

  const { loader } = getShellElements(AppCore);

  if (!loader) return false;

  try {
    loader.hidden = true;

    loader.classList.add(
      "is-hidden",
      "has-hidden"
    );

    loader.classList.remove(
      "is-visible",
      "is-leaving"
    );

    loader.setAttribute(
      "aria-hidden",
      "true"
    );

    loader.dataset.loaderVisible = "false";

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   POST RENDER
========================================================= */

export function applyPostRenderLoaderPolicy({
  AppCore,
  Router,
  hideLoader,
  forceHideLoader = false,
  hideLoaderOnPostRender = true,
  minVisibleMs = undefined,
} = {}) {
  const view = getViewContainer(AppCore);

  const hasViewContent = Boolean(
    safeText(view?.innerHTML, "").trim()
  );

  const authLike = isAuthLikeRoute(AppCore, Router);

  const shellVisible = updateShellVisibilityByRoute(
    AppCore,
    Router,
    {
      authLike,
      busy:
        !hasViewContent ||
        isBootingOrLoading(AppCore),
    }
  );

  /*
    Solo se intenta ocultar loader si:
    - hay contenido o ruta auth;
    - el caller no lo desactiva;
    - no estamos en boot/loading, salvo force.

    Esto evita que router/post-render mate el loader antes
    de que App.finalizeBoot() haya reparado UI y emitido app:ready.
  */
  const shouldConsiderHide =
    hideLoaderOnPostRender !== false &&
    (authLike || hasViewContent);

  const loaderHidden =
    shouldConsiderHide
      ? hideLoaderSafe(
          AppCore,
          hideLoader,
          {
            force: forceHideLoader,
            reason: "post-render",
            minVisibleMs,
          }
        )
      : false;

  if (hasViewContent) {
    setAppShellBusy(
      AppCore,
      isBootingOrLoading(AppCore)
    );
  }

  const shellSnapshot = getShellSnapshot(
    AppCore,
    Router
  );

  safeEmit(AppCore, "app:shell:post-render", {
    authLike,
    hasViewContent,
    shellVisible,
    loaderHidden,
    loaderVisible:
      isLoaderVisible(AppCore),
    bootBusy:
      isBootingOrLoading(AppCore) ||
      hasBodyBootClass(),
    snapshot: shellSnapshot,
  });

  return shellSnapshot;
}

/* =========================================================
   APP READY / BUSY HELPERS
========================================================= */

export function markShellReady(AppCore, options = {}) {
  const opts = safeObject(options);

  const authLike =
    opts.authLike !== undefined
      ? Boolean(opts.authLike)
      : false;

  setAppShellBusy(AppCore, false);

  markShellDomState(AppCore, {
    shellVisible:
      opts.shellVisible !== undefined
        ? Boolean(opts.shellVisible)
        : readShellVisibility(AppCore),
    authLike,
    busy: false,
  });

  safeEmit(AppCore, "app:shell:ready", {
    snapshot: getShellSnapshot(AppCore),
  });

  return true;
}

export function markShellBusy(AppCore, options = {}) {
  const opts = safeObject(options);

  setAppShellBusy(AppCore, true);

  markShellDomState(AppCore, {
    shellVisible:
      opts.shellVisible !== undefined
        ? Boolean(opts.shellVisible)
        : readShellVisibility(AppCore),
    authLike:
      Boolean(opts.authLike),
    busy: true,
  });

  safeEmit(AppCore, "app:shell:busy", {
    snapshot: getShellSnapshot(AppCore),
  });

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getShellSnapshot(
  AppCore,
  Router = null
) {
  const {
    appShell,
    mainContent,
    appContent,
    viewContainer,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    loader,
    body,
    html,
  } = getShellElements(AppCore);

  const state = getCoreState(AppCore);

  let bodyClasses = [];
  let htmlClasses = [];

  try {
    bodyClasses =
      Array.from(body?.classList || []);
  } catch {}

  try {
    htmlClasses =
      Array.from(html?.classList || []);
  } catch {}

  return {
    shellVisible:
      readShellVisibility(AppCore),

    authLike:
      isAuthLikeRoute(AppCore, Router),

    canonical:
      getCurrentCanonicalPath(AppCore, Router),

    publicPath:
      getCurrentPublicPath(AppCore),

    booting:
      Boolean(state.booting),

    loading:
      Boolean(state.loading),

    bodyBootClass:
      hasBodyBootClass(),

    loaderVisible:
      isLoaderVisible(AppCore),

    appShellExists:
      Boolean(appShell),

    appShellHidden:
      Boolean(appShell?.hidden),

    appShellBusy:
      safeText(
        appShell?.getAttribute?.("aria-busy"),
        ""
      ),

    mainContentExists:
      Boolean(mainContent),

    appContentExists:
      Boolean(appContent),

    hasView:
      Boolean(viewContainer),

    hasViewContent:
      Boolean(
        safeText(viewContainer?.innerHTML, "").trim()
      ),

    sidebarExists:
      Boolean(sidebar),

    sidebarHidden:
      Boolean(sidebar?.hidden),

    topbarExists:
      Boolean(topbar),

    topbarHidden:
      Boolean(topbar?.hidden),

    tableheadExists:
      Boolean(tablehead),

    tableheadHidden:
      Boolean(tablehead?.hidden),

    tableheadContainerExists:
      Boolean(tableheadContainer),

    loaderExists:
      Boolean(loader),

    loaderHidden:
      Boolean(loader?.hidden),

    bodyShell:
      safeText(body?.dataset?.shell, ""),

    htmlShell:
      safeText(html?.dataset?.shell, ""),

    bodyRouteMode:
      safeText(body?.dataset?.routeMode, ""),

    htmlRouteMode:
      safeText(html?.dataset?.routeMode, ""),

    bodyClasses,
    htmlClasses,
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
  isActivateAccountPath,
  isAuthLikeRoute,

  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,

  markShellReady,
  markShellBusy,

  getShellSnapshot,
};
