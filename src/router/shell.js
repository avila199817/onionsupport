/* =========================================================
   Onion SPA - Router Shell
   Archivo: src/router/shell.js

   Responsabilidades:
   - resolver elementos visuales del shell
   - limpiar contenedores dinámicos antes de render
   - actualizar título del documento
   - activar menú SPA según ruta actual
   - mostrar u ocultar shell por ruta

   HARDENING:
   - guards de browser
   - sync robusto de aria-current
   - compatibilidad con mount dinámico
========================================================= */

import {
  normalizeCanonicalPath,
  resolveSpaHref,
} from "./helpers.js";

/* =========================================================
   INTERNAL
========================================================= */
function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeToggleHidden(element, hidden) {
  if (!element) return;
  element.hidden = Boolean(hidden);
}

function safeEmit(AppCore, eventName, payload) {
  AppCore?.events?.emit?.(eventName, payload);
}

/* =========================================================
   ELEMENTS
========================================================= */
export function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      sidebar: null,
      topbar: null,
      tableheadContainer: null,
      body: null,
      mobileToggle: null,
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

    tableheadContainer:
      AppCore?.dom?.tableheadContainer ||
      document.getElementById("tablehead-container") ||
      null,

    body:
      AppCore?.dom?.body ||
      document.body ||
      null,

    mobileToggle:
      AppCore?.dom?.sidebarMobileToggle ||
      AppCore?.dom?.mobileSidebarToggle ||
      document.getElementById("toggleSidebarMobile") ||
      null,
  };
}

/* =========================================================
   CORE BRIDGES
========================================================= */
export function clearDynamicContainers(AppCore) {
  AppCore?.clearDynamicContainers?.();
}

export function setDocumentTitle(
  AppCore,
  title = AppCore?.config?.appName
) {
  AppCore?.setDocumentTitle?.(title);
}

/* =========================================================
   ACTIVE MENU
========================================================= */
export function setActiveMenu(
  AppCore,
  pathname = "/"
) {
  if (!isBrowser()) {
    return;
  }

  const currentCanonical =
    normalizeCanonicalPath(
      AppCore,
      pathname
    );

  const links =
    AppCore?.utils?.qsa?.("a[data-spa]") ||
    Array.from(
      document.querySelectorAll("a[data-spa]")
    );

  links.forEach((link) => {
    const href =
      resolveSpaHref(
        AppCore,
        link.getAttribute("href") || "/"
      );

    const hrefCanonical =
      normalizeCanonicalPath(
        AppCore,
        href
      );

    const active =
      hrefCanonical === currentCanonical;

    link.classList.toggle(
      "active",
      active
    );

    if (active) {
      link.setAttribute(
        "aria-current",
        "page"
      );
    } else {
      link.removeAttribute(
        "aria-current"
      );
    }
  });
}

/* =========================================================
   SHELL MODE
========================================================= */
export function setShellMode(
  AppCore,
  route = null
) {
  const hideShell =
    Boolean(route?.hideShell);

  const {
    sidebar,
    topbar,
    tableheadContainer,
    body,
    mobileToggle,
  } = getShellElements(AppCore);

  safeToggleHidden(
    sidebar,
    hideShell
  );

  safeToggleHidden(
    topbar,
    hideShell
  );

  safeToggleHidden(
    tableheadContainer,
    hideShell
  );

  if (mobileToggle) {
    mobileToggle.hidden =
      hideShell;

    mobileToggle.setAttribute(
      "aria-expanded",
      String(!hideShell)
    );
  }

  if (body) {
    body.classList.toggle(
      "route-auth",
      hideShell
    );

    body.classList.toggle(
      "route-shell-hidden",
      hideShell
    );

    body.classList.toggle(
      "auth-screen",
      hideShell
    );
  }

  safeEmit(
    AppCore,
    "router:shell:change",
    {
      hidden: hideShell,
      route: route?.path || null,
    }
  );
}
