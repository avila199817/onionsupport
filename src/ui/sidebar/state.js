/* =========================================================
   Onion SPA - Sidebar State
   Archivo: src/ui/sidebar/state.js

   PRO STABLE VERSION · NO AUTO COLLAPSE / NO STATE FLICKER

   FIXES:
   - fallback real a localStorage en desktop
   - no convertir undefined -> false sin criterio
   - shell hidden no destruye el estado visual del sidebar
   - sync más estable entre AppCore, DOM y body classes
   - labels / tooltips siempre coherentes
========================================================= */

import {
  MOBILE_BREAKPOINT,
  DESKTOP_COLLAPSED_STORAGE_KEY,
} from "./constants.js";

import {
  getElements,
  isShellHidden,
  sanitizeFooterTooltipState,
} from "./dom.js";

/* =========================================================
   RESPONSIVE
========================================================= */
export function isMobileViewport(
  breakpoint = MOBILE_BREAKPOINT
) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }

  return window.matchMedia(
    `(max-width: ${breakpoint}px)`
  ).matches;
}

/* =========================================================
   PERSISTENCIA
========================================================= */
export function getSavedSidebarCollapsed() {
  try {
    return (
      localStorage.getItem(
        DESKTOP_COLLAPSED_STORAGE_KEY
      ) === "true"
    );
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(value) {
  try {
    localStorage.setItem(
      DESKTOP_COLLAPSED_STORAGE_KEY,
      String(Boolean(value))
    );
  } catch {
    /* noop */
  }
}

/* =========================================================
   INTERNAL HELPERS
========================================================= */
function hasExplicitSidebarState(AppCore) {
  return (
    typeof AppCore?.state?.sidebarOpen === "boolean"
  );
}

function getDomDerivedSidebarState(AppCore) {
  const { sidebar, body } = getElements(AppCore);
  const mobile = isMobileViewport();

  if (mobile) {
    if (
      sidebar?.classList.contains("open") ||
      sidebar?.classList.contains("is-open")
    ) {
      return true;
    }

    if (body?.classList.contains("sidebar-open")) {
      return true;
    }

    return null;
  }

  if (
    sidebar?.classList.contains("collapsed") ||
    sidebar?.classList.contains("is-collapsed")
  ) {
    return false;
  }

  if (body?.classList.contains("sidebar-collapsed")) {
    return false;
  }

  if (
    sidebar &&
    !sidebar.classList.contains("collapsed") &&
    !sidebar.classList.contains("is-collapsed")
  ) {
    return true;
  }

  return null;
}

function ensureSidebarState(AppCore) {
  if (!AppCore?.state) return false;

  if (hasExplicitSidebarState(AppCore)) {
    return Boolean(AppCore.state.sidebarOpen);
  }

  const domState = getDomDerivedSidebarState(AppCore);
  if (typeof domState === "boolean") {
    AppCore.state.sidebarOpen = domState;
    return domState;
  }

  const fallback = isMobileViewport()
    ? false
    : !getSavedSidebarCollapsed();

  AppCore.state.sidebarOpen = fallback;
  return fallback;
}

function setAriaHidden(element, value) {
  if (!element) return;

  element.hidden = Boolean(value);
  element.setAttribute(
    "aria-hidden",
    value ? "true" : "false"
  );
}

/* =========================================================
   STATE HELPERS
========================================================= */
export function getDesiredSidebarOpenState(AppCore) {
  if (hasExplicitSidebarState(AppCore)) {
    return Boolean(AppCore.state.sidebarOpen);
  }

  const domState = getDomDerivedSidebarState(AppCore);
  if (typeof domState === "boolean") {
    return domState;
  }

  if (isMobileViewport()) {
    return false;
  }

  return !getSavedSidebarCollapsed();
}

export function isSidebarCollapsedDesktop(AppCore) {
  const { sidebar } = getElements(AppCore);

  if (!sidebar) return false;
  if (isMobileViewport()) return false;

  return (
    sidebar.classList.contains("collapsed") ||
    sidebar.classList.contains("is-collapsed")
  );
}

/* =========================================================
   TOOLTIPS
========================================================= */
export function syncTooltipMode(
  AppCore,
  isOpen = null
) {
  const { sidebar, body } = getElements(AppCore);
  if (!sidebar || !body) return;

  const open =
    typeof isOpen === "boolean"
      ? isOpen
      : getDesiredSidebarOpenState(AppCore);

  const enableCssTooltipMode =
    !isMobileViewport() &&
    !open &&
    !isShellHidden(AppCore);

  sidebar.classList.toggle(
    "sidebar-tooltips-active",
    enableCssTooltipMode
  );

  body.classList.toggle(
    "sidebar-tooltips-active",
    enableCssTooltipMode
  );

  sanitizeFooterTooltipState(AppCore);
}

/* =========================================================
   TOGGLE LABELS
========================================================= */
export function updateToggleLabel(
  AppCore,
  isOpen = null
) {
  const { toggleBtn, mobileToggleBtn } =
    getElements(AppCore);

  const open =
    typeof isOpen === "boolean"
      ? isOpen
      : getDesiredSidebarOpenState(AppCore);

  const desktopText = open
    ? "Contraer barra lateral"
    : "Expandir barra lateral";

  const mobileText = open
    ? "Cerrar navegación"
    : "Abrir navegación";

  if (toggleBtn) {
    toggleBtn.dataset.tooltip = desktopText;
    toggleBtn.setAttribute(
      "aria-label",
      desktopText
    );
    toggleBtn.setAttribute(
      "aria-expanded",
      String(open)
    );
    toggleBtn.classList.toggle("is-active", open);
    toggleBtn.removeAttribute("title");
  }

  if (mobileToggleBtn) {
    mobileToggleBtn.setAttribute(
      "aria-label",
      mobileText
    );
    mobileToggleBtn.setAttribute(
      "aria-expanded",
      String(open)
    );
    mobileToggleBtn.classList.toggle(
      "is-active",
      open
    );
    mobileToggleBtn.removeAttribute("title");
  }

  syncTooltipMode(AppCore, open);
}

/* =========================================================
   SINCRONIZACIÓN VISUAL
========================================================= */
export function syncSidebarState(
  AppCore,
  closeDropdown
) {
  if (AppCore?.state?.sidebarRouteTransition) {
    return getDesiredSidebarOpenState(AppCore);
  }

  const { sidebar, body } = getElements(AppCore);
  if (!sidebar) {
    return getDesiredSidebarOpenState(AppCore);
  }

  const mobile = isMobileViewport();
  const isOpen = ensureSidebarState(AppCore);
  const hidden = isShellHidden(AppCore);

  /* ------------------------------------------------------
     SHELL HIDDEN
     Importante:
     NO destruimos clases open/collapsed.
     Solo ocultamos el nodo y limpiamos tooltip/dropdown.
  ------------------------------------------------------ */
  if (hidden) {
    setAriaHidden(sidebar, true);

    if (mobile) {
      body?.classList.remove("sidebar-open");
    }

    syncTooltipMode(AppCore, true);
    closeDropdown?.();
    updateToggleLabel(AppCore, isOpen);

    AppCore?.events?.emit?.("sidebar:state:synced", {
      open: isOpen,
      mobile,
      hidden: true,
    });

    return isOpen;
  }

  /* ------------------------------------------------------
     SHELL VISIBLE
  ------------------------------------------------------ */
  setAriaHidden(sidebar, false);

  if (mobile) {
    sidebar.classList.toggle("open", isOpen);
    sidebar.classList.toggle("is-open", isOpen);

    sidebar.classList.remove("collapsed");
    sidebar.classList.remove("is-collapsed");

    body?.classList.toggle("sidebar-open", isOpen);
    body?.classList.remove("sidebar-collapsed");
  } else {
    sidebar.classList.toggle("collapsed", !isOpen);
    sidebar.classList.toggle(
      "is-collapsed",
      !isOpen
    );

    sidebar.classList.remove("open");
    sidebar.classList.remove("is-open");

    body?.classList.toggle(
      "sidebar-collapsed",
      !isOpen
    );
    body?.classList.remove("sidebar-open");
  }

  updateToggleLabel(AppCore, isOpen);

  AppCore?.events?.emit?.("sidebar:state:synced", {
    open: isOpen,
    mobile,
    hidden: false,
  });

  return isOpen;
}

/* =========================================================
   WRITE STATE
========================================================= */
export function setSidebarOpen(
  AppCore,
  open,
  closeDropdown
) {
  const nextOpen = Boolean(open);
  const mobile = isMobileViewport();

  if (AppCore?.state) {
    AppCore.state.sidebarOpen = nextOpen;
  }

  if (!mobile) {
    saveSidebarCollapsed(!nextOpen);
  }

  return syncSidebarState(AppCore, closeDropdown);
}
