/* =========================================================
   Onion SPA - Router Shell
   Archivo: src/router/shell.js

   Responsabilidades:
   - resolver elementos visuales del shell
   - limpiar contenedores dinámicos antes de render
   - actualizar título del documento
   - activar menú SPA según ruta actual
   - mostrar u ocultar shell por ruta
========================================================= */

import {
  normalizeCanonicalPath,
  resolveSpaHref,
} from "./helpers.js";

export function getShellElements(AppCore) {
  return {
    sidebar: AppCore.dom.sidebar || document.querySelector(".sidebar"),
    topbar: AppCore.dom.topbar || document.querySelector(".topbar"),
    tableheadContainer:
      AppCore.dom.tableheadContainer ||
      document.getElementById("tablehead-container"),
    body: AppCore.dom.body || document.body,
    mobileToggle:
      AppCore.dom.sidebarMobileToggle ||
      document.getElementById("toggleSidebarMobile"),
  };
}

export function clearDynamicContainers(AppCore) {
  AppCore.clearDynamicContainers?.();
}

export function setDocumentTitle(AppCore, title = AppCore.config.appName) {
  AppCore.setDocumentTitle?.(title);
}

export function setActiveMenu(AppCore, pathname = "/") {
  const currentCanonical = normalizeCanonicalPath(AppCore, pathname);
  const links = AppCore.utils.qsa("a[data-spa]");

  links.forEach((link) => {
    const href = resolveSpaHref(AppCore, link.getAttribute("href") || "/");
    const hrefCanonical = normalizeCanonicalPath(AppCore, href);
    const active = hrefCanonical === currentCanonical;

    link.classList.toggle("active", active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

export function setShellMode(AppCore, route = null) {
  const hideShell = Boolean(route?.hideShell);
  const {
    sidebar,
    topbar,
    tableheadContainer,
    body,
    mobileToggle,
  } = getShellElements(AppCore);

  if (sidebar) sidebar.hidden = hideShell;
  if (topbar) topbar.hidden = hideShell;
  if (tableheadContainer) tableheadContainer.hidden = hideShell;

  if (mobileToggle) {
    mobileToggle.hidden = hideShell;
    mobileToggle.setAttribute("aria-expanded", String(!hideShell));
  }

  if (body) {
    body.classList.toggle("route-auth", hideShell);
    body.classList.toggle("route-shell-hidden", hideShell);
    body.classList.toggle("auth-screen", hideShell);
  }

  AppCore.events.emit("router:shell:change", {
    hidden: hideShell,
    route: route?.path || null,
  });
}
