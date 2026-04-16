/* =========================================================
   Onion SPA - App Shell
   Archivo: src/app/shell.js

   RESPONSABILIDADES:
   - resolver elementos principales del shell SPA
   - controlar visibilidad global del shell
   - detectar rutas auth-like
   - aplicar política visual post-render
   - evitar flicker entre rutas
   - tolerar AppCore parcial / SSR
   - sincronizar estado shell en navegación

   NIVEL DIOS 10/10:
   - idempotencia total
   - DOM safe extremo
   - route detection robusta
   - cero repaints innecesarios
   - loader anti-stuck
   - compatibilidad legacy/full SPA
   - snapshots enterprise
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

function safeEmit(
  AppCore,
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function normalizePath(
  AppCore,
  path = "/"
) {
  try {
    if (
      typeof AppCore?.utils
        ?.normalizePath ===
      "function"
    ) {
      return AppCore.utils.normalizePath(
        path
      );
    }
  } catch {}

  let raw =
    safeText(path, "/");

  if (!raw.startsWith("/")) {
    raw = `/${raw}`;
  }

  raw = raw
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "");

  return raw || "/";
}

function setDataset(
  el,
  key,
  value
) {
  if (!el) return;

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete el.dataset[key];
      return;
    }

    el.dataset[key] =
      String(value);
  } catch {}
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements(
  AppCore
) {
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
      document.querySelector(
        ".sidebar"
      ) ||
      null,

    topbar:
      AppCore?.dom?.topbar ||
      document.querySelector(
        ".topbar"
      ) ||
      null,

    tablehead:
      document.getElementById(
        "table-head"
      ) ||
      document.querySelector(
        ".table-head"
      ) ||
      null,

    tableheadContainer:
      AppCore?.dom
        ?.tableheadContainer ||
      document.getElementById(
        "tablehead-container"
      ) ||
      null,

    body:
      AppCore?.dom?.body ||
      document.body ||
      null,

    html:
      AppCore?.dom?.html ||
      document.documentElement ||
      null,
  };
}

export function getViewContainer(
  AppCore
) {
  if (!isBrowser()) {
    return null;
  }

  return (
    AppCore?.dom
      ?.viewContainer ||
    document.getElementById(
      "view-container"
    ) ||
    document.querySelector(
      "#view-container"
    ) ||
    null
  );
}

/* =========================================================
   VISIBILITY HELPERS
========================================================= */

function applyHidden(
  element,
  hidden = false
) {
  if (!element) return;

  const next =
    Boolean(hidden);

  if (element.hidden !== next) {
    element.hidden = next;
  }

  if (
    element.getAttribute(
      "aria-hidden"
    ) !==
    String(next)
  ) {
    element.setAttribute(
      "aria-hidden",
      next
        ? "true"
        : "false"
    );
  }
}

function toggleClass(
  element,
  className,
  force
) {
  if (!element) return;

  try {
    element.classList.toggle(
      className,
      force
    );
  } catch {}
}

function applyBodyClasses(
  body,
  hidden = false
) {
  if (!body) return;

  const hiddenClasses = [
    "route-shell-hidden",
    "auth-screen",
    "route-auth",
    "login-no-scroll",
  ];

  hiddenClasses.forEach(
    (name) =>
      toggleClass(
        body,
        name,
        hidden
      )
  );

  toggleClass(
    body,
    "route-shell-visible",
    !hidden
  );

  setDataset(
    body,
    "shell",
    hidden
      ? "hidden"
      : "visible"
  );
}

/* =========================================================
   SHELL VISIBILITY
========================================================= */

export function setShellVisibility(
  AppCore,
  visible = true
) {
  const hidden =
    !Boolean(visible);

  const {
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    body,
    html,
  } = getShellElements(
    AppCore
  );

  const previous =
    Boolean(
      AppCore?.state
        ?.shellVisible
    );

  const next =
    !hidden;

  if (previous === next) {
    return next;
  }

  applyHidden(
    sidebar,
    hidden
  );

  applyHidden(
    topbar,
    hidden
  );

  applyHidden(
    tablehead,
    hidden
  );

  applyHidden(
    tableheadContainer,
    hidden
  );

  applyBodyClasses(
    body,
    hidden
  );

  setDataset(
    html,
    "shell",
    hidden
      ? "hidden"
      : "visible"
  );

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state ===
        "object"
    ) {
      AppCore.state.shellVisible =
        next;
    }
  } catch {}

  safeEmit(
    AppCore,
    "router:shell:change",
    {
      hidden,
      visible: next,
    }
  );

  return next;
}

/* =========================================================
   ROUTE HELPERS
========================================================= */

export function isLoginPath(
  AppCore,
  path = ""
) {
  const normalized =
    normalizePath(
      AppCore,
      path
    );

  return (
    normalized === "/login" ||
    normalized.startsWith(
      "/login?"
    )
  );
}

export function isResetPasswordPath(
  AppCore,
  path = ""
) {
  const normalized =
    normalizePath(
      AppCore,
      path
    );

  return (
    normalized ===
      "/reset-password" ||
    normalized.startsWith(
      "/reset-password?"
    )
  );
}

export function isResetPasswordConfirmPath(
  AppCore,
  path = ""
) {
  const normalized =
    normalizePath(
      AppCore,
      path
    );

  return (
    normalized ===
      "/reset-password/confirm" ||
    normalized.startsWith(
      "/reset-password/confirm?"
    )
  );
}

export function isAuthLikeRoute(
  AppCore,
  Router
) {
  const canonical =
    normalizePath(
      AppCore,
      getCurrentCanonicalPath(
        AppCore,
        Router
      )
    );

  const publicPath =
    normalizePath(
      AppCore,
      getCurrentPublicPath(
        AppCore
      )
    );

  const candidates = [
    canonical,
    publicPath,
  ];

  return candidates.some(
    (path) =>
      isLoginPath(
        AppCore,
        path
      ) ||
      isResetPasswordPath(
        AppCore,
        path
      ) ||
      isResetPasswordConfirmPath(
        AppCore,
        path
      )
  );
}

export function updateShellVisibilityByRoute(
  AppCore,
  Router
) {
  const authLike =
    isAuthLikeRoute(
      AppCore,
      Router
    );

  return setShellVisibility(
    AppCore,
    !authLike
  );
}

/* =========================================================
   LOADER POLICY
========================================================= */

function hideLoaderSafe(
  AppCore,
  hideLoader
) {
  try {
    if (
      typeof hideLoader ===
      "function"
    ) {
      hideLoader(AppCore);
      return true;
    }
  } catch {}

  const loader =
    AppCore?.dom?.loader ||
    document.getElementById(
      "app-loader"
    );

  if (!loader) {
    return false;
  }

  loader.hidden = true;
  loader.setAttribute(
    "aria-hidden",
    "true"
  );

  loader.classList.add(
    "is-hidden"
  );

  return true;
}

/* =========================================================
   POST RENDER POLICY
========================================================= */

export function applyPostRenderLoaderPolicy({
  AppCore,
  Router,
  hideLoader,
} = {}) {
  const viewContainer =
    getViewContainer(
      AppCore
    );

  const html =
    safeText(
      viewContainer?.innerHTML,
      ""
    );

  const hasViewContent =
    html.trim().length > 0;

  const authLike =
    isAuthLikeRoute(
      AppCore,
      Router
    );

  const shellVisible =
    updateShellVisibilityByRoute(
      AppCore,
      Router
    );

  let loaderHidden = false;

  if (
    authLike ||
    hasViewContent
  ) {
    loaderHidden =
      hideLoaderSafe(
        AppCore,
        hideLoader
      );
  }

  const snapshot = {
    authLike,
    hasViewContent,
    shellVisible,
    loaderHidden,
  };

  safeEmit(
    AppCore,
    "app:shell:post-render",
    snapshot
  );

  return snapshot;
}

/* =========================================================
   DEBUG
========================================================= */

export function getShellSnapshot(
  AppCore,
  Router
) {
  const view =
    getViewContainer(
      AppCore
    );

  return {
    shellVisible:
      Boolean(
        AppCore?.state
          ?.shellVisible
      ),

    authLike:
      isAuthLikeRoute(
        AppCore,
        Router
      ),

    canonical:
      getCurrentCanonicalPath(
        AppCore,
        Router
      ),

    publicPath:
      getCurrentPublicPath(
        AppCore
      ),

    hasView:
      Boolean(view),

    hasViewContent:
      Boolean(
        safeText(
          view?.innerHTML,
          ""
        ).trim()
      ),
  };
}

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
