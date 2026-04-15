/* =========================================================
   Onion SPA - App Shell
   Archivo: src/app/shell.js

   Responsabilidades:
   - resolver elementos principales del shell SPA
   - controlar visibilidad global del shell
   - detectar rutas auth-like
   - aplicar política visual post-render
   - evitar flicker entre rutas
   - tolerar AppCore parcial / SSR

   HARDENING PRO:
   - idempotencia total
   - DOM safe
   - route detection robusta
   - eventos coherentes
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

  const raw =
    String(path || "/").trim() ||
    "/";

  return raw
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "") || "/";
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
    };
  }

  return {
    sidebar:
      AppCore?.dom?.sidebar ||
      document.querySelector(
        ".sidebar"
      ),

    topbar:
      AppCore?.dom?.topbar ||
      document.querySelector(
        ".topbar"
      ),

    tablehead:
      document.getElementById(
        "table-head"
      ) ||
      document.querySelector(
        ".table-head"
      ),

    tableheadContainer:
      AppCore?.dom
        ?.tableheadContainer ||
      document.getElementById(
        "tablehead-container"
      ),

    body:
      AppCore?.dom?.body ||
      document.body,
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
    )
  );
}

/* =========================================================
   VISIBILITY CORE
========================================================= */

function applyHidden(
  element,
  hidden = false
) {
  if (!element) {
    return;
  }

  element.hidden =
    Boolean(hidden);

  element.setAttribute(
    "aria-hidden",
    hidden
      ? "true"
      : "false"
  );
}

function applyBodyClasses(
  body,
  hidden = false
) {
  if (!body) {
    return;
  }

  const map = [
    "route-shell-hidden",
    "auth-screen",
    "route-auth",
    "login-no-scroll",
  ];

  for (const className of map) {
    body.classList.toggle(
      className,
      hidden
    );
  }

  body.classList.toggle(
    "route-shell-visible",
    !hidden
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
  } = getShellElements(
    AppCore
  );

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

  try {
    if (
      AppCore?.state
    ) {
      AppCore.state.shellVisible =
        !hidden;
    }
  } catch {}

  safeEmit(
    AppCore,
    "router:shell:change",
    {
      hidden,
      visible: !hidden,
    }
  );

  return !hidden;
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
      path || "/"
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
      path || "/"
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
      path || "/"
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
    getCurrentCanonicalPath(
      AppCore,
      Router
    );

  const publicPath =
    getCurrentPublicPath(
      AppCore
    );

  return (
    isLoginPath(
      AppCore,
      canonical
    ) ||
    isLoginPath(
      AppCore,
      publicPath
    ) ||
    isResetPasswordPath(
      AppCore,
      canonical
    ) ||
    isResetPasswordPath(
      AppCore,
      publicPath
    ) ||
    isResetPasswordConfirmPath(
      AppCore,
      canonical
    ) ||
    isResetPasswordConfirmPath(
      AppCore,
      publicPath
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
   POST-RENDER POLICY
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

  const hasViewContent =
    Boolean(
      viewContainer?.innerHTML
        ?.trim?.()
    );

  const authLike =
    isAuthLikeRoute(
      AppCore,
      Router
    );

  updateShellVisibilityByRoute(
    AppCore,
    Router
  );

  if (
    authLike ||
    hasViewContent
  ) {
    try {
      hideLoader?.(
        AppCore
      );
    } catch {}
  }

  return {
    authLike,
    hasViewContent,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getShellSnapshot(
  AppCore,
  Router
) {
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
      Boolean(
        getViewContainer(
          AppCore
        )
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
