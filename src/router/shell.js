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
   - cero throws accidentales
   - no toca history
   - no modifica query/hash
   - no destruye /activate-account?token=...
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

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeToggleHidden(element, hidden) {
  if (!element) return false;

  try {
    element.hidden = Boolean(hidden);
    return true;
  } catch {
    return false;
  }
}

function safeSetAttribute(element, name, value) {
  if (!element || !name) return false;

  try {
    element.setAttribute(
      name,
      String(value)
    );
    return true;
  } catch {
    return false;
  }
}

function safeRemoveAttribute(element, name) {
  if (!element || !name) return false;

  try {
    element.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function safeClassToggle(element, className, enabled) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(
      className,
      Boolean(enabled)
    );
    return true;
  } catch {
    return false;
  }
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
    return true;
  } catch {
    return false;
  }
}

function safeWarn(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.warn?.(
      ...args
    );
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
      tableheadContainer: null,
      body: null,
      mobileToggle: null,
      shell: null,
      viewContainer: null,
    };
  }

  const body =
    AppCore?.dom?.body ||
    document.body ||
    null;

  return {
    sidebar:
      AppCore?.dom?.sidebar ||
      document.querySelector(".sidebar") ||
      document.getElementById("sidebar") ||
      null,

    topbar:
      AppCore?.dom?.topbar ||
      document.querySelector(".topbar") ||
      document.getElementById("topbar") ||
      null,

    tableheadContainer:
      AppCore?.dom?.tableheadContainer ||
      document.getElementById("tablehead-container") ||
      document.querySelector("[data-tablehead-container]") ||
      null,

    body,

    mobileToggle:
      AppCore?.dom?.sidebarMobileToggle ||
      AppCore?.dom?.mobileSidebarToggle ||
      document.getElementById("toggleSidebarMobile") ||
      document.querySelector("[data-sidebar-mobile-toggle]") ||
      null,

    shell:
      AppCore?.dom?.shell ||
      document.getElementById("app-shell") ||
      document.querySelector("[data-app-shell]") ||
      null,

    viewContainer:
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null,
  };
}

/* =========================================================
   CORE BRIDGES
========================================================= */

export function clearDynamicContainers(AppCore) {
  try {
    if (
      typeof AppCore?.clearDynamicContainers === "function"
    ) {
      AppCore.clearDynamicContainers();
      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "[Router Shell] clearDynamicContainers failed",
      error
    );
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    const {
      tableheadContainer,
    } = getShellElements(AppCore);

    if (tableheadContainer) {
      tableheadContainer.innerHTML = "";
    }

    return true;
  } catch {
    return false;
  }
}

export function setDocumentTitle(
  AppCore,
  title = AppCore?.config?.appName
) {
  const appName =
    safeText(
      AppCore?.config?.appName,
      "Onion Support"
    );

  const finalTitle =
    safeText(
      title,
      appName
    );

  try {
    if (
      typeof AppCore?.setDocumentTitle === "function"
    ) {
      AppCore.setDocumentTitle(finalTitle);
      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "[Router Shell] setDocumentTitle failed",
      error
    );
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    document.title =
      finalTitle === appName
        ? appName
        : `${finalTitle} · ${appName}`;

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ACTIVE MENU
========================================================= */

function getSpaLinks(AppCore) {
  if (!isBrowser()) {
    return [];
  }

  try {
    const fromCore =
      AppCore?.utils?.qsa?.(
        "a[data-spa]"
      );

    if (fromCore) {
      return Array.from(fromCore);
    }
  } catch {}

  try {
    return Array.from(
      document.querySelectorAll("a[data-spa]")
    );
  } catch {
    return [];
  }
}

export function setActiveMenu(
  AppCore,
  pathname = "/"
) {
  if (!isBrowser()) {
    return false;
  }

  let currentCanonical = "/";

  try {
    currentCanonical =
      normalizeCanonicalPath(
        AppCore,
        pathname || "/"
      );
  } catch {
    currentCanonical = "/";
  }

  const links =
    getSpaLinks(AppCore);

  links.forEach((link) => {
    if (!link) return;

    let active = false;

    try {
      const href =
        link.getAttribute("href") || "/";

      const resolvedHref =
        resolveSpaHref(
          AppCore,
          href
        );

      const hrefCanonical =
        normalizeCanonicalPath(
          AppCore,
          resolvedHref
        );

      active =
        hrefCanonical === currentCanonical;
    } catch {
      active = false;
    }

    safeClassToggle(
      link,
      "active",
      active
    );

    if (active) {
      safeSetAttribute(
        link,
        "aria-current",
        "page"
      );
    } else {
      safeRemoveAttribute(
        link,
        "aria-current"
      );
    }
  });

  return true;
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

  const routePath =
    safeText(
      route?.path,
      null
    );

  const {
    sidebar,
    topbar,
    tableheadContainer,
    body,
    mobileToggle,
    shell,
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

  safeToggleHidden(
    shell,
    false
  );

  if (mobileToggle) {
    safeToggleHidden(
      mobileToggle,
      hideShell
    );

    safeSetAttribute(
      mobileToggle,
      "aria-expanded",
      String(!hideShell)
    );

    safeSetAttribute(
      mobileToggle,
      "aria-hidden",
      String(hideShell)
    );
  }

  if (body) {
    safeClassToggle(
      body,
      "route-auth",
      hideShell
    );

    safeClassToggle(
      body,
      "route-shell-hidden",
      hideShell
    );

    safeClassToggle(
      body,
      "auth-screen",
      hideShell
    );

    safeClassToggle(
      body,
      "shell-visible",
      !hideShell
    );

    safeClassToggle(
      body,
      "shell-hidden",
      hideShell
    );

    try {
      body.dataset.shellHidden =
        hideShell ? "true" : "false";

      body.dataset.routeMode =
        hideShell ? "auth" : "shell";

      if (routePath) {
        body.dataset.currentRoute =
          routePath;
      } else {
        delete body.dataset.currentRoute;
      }
    } catch {}
  }

  safeEmit(
    AppCore,
    "router:shell:change",
    {
      hidden: hideShell,
      route: routePath,
    }
  );

  return {
    hidden: hideShell,
    route: routePath,
  };
}
