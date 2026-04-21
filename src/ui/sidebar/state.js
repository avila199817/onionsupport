/* =========================================================
   Onion SPA - Sidebar State
   Archivo: src/ui/sidebar/state.js

   PRO HARDENED VERSION
   FIX:
   - no colapsar por undefined durante cambios de ruta
   - fallback robusto a DOM / body / localStorage
   - desktop estable
   - mobile separado
   - tooltips coherentes
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
export function isMobileViewport(breakpoint = MOBILE_BREAKPOINT) {
  try {
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
  } catch {
    return false;
  }
}

/* =========================================================
   PERSISTENCIA
========================================================= */
export function getSavedSidebarCollapsed() {
  try {
    return localStorage.getItem(DESKTOP_COLLAPSED_STORAGE_KEY) === "true";
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
function resolveDomSidebarOpenState(AppCore) {
  const { sidebar, body } = getElements(AppCore);

  if (!sidebar && !body) return null;

  const mobile = isMobileViewport();

  if (mobile) {
    if (
      sidebar?.classList.contains("open") ||
      sidebar?.classList.contains("is-open") ||
      body?.classList.contains("sidebar-open")
    ) {
      return true;
    }

    return false;
  }

  if (
    sidebar?.classList.contains("collapsed") ||
    sidebar?.classList.contains("is-collapsed") ||
    body?.classList.contains("sidebar-collapsed")
  ) {
    return false;
  }

  if (
    sidebar?.classList.contains("open") ||
    sidebar?.classList.contains("is-open") ||
    body?.classList.contains("sidebar-open")
  ) {
    return true;
  }

  if (sidebar) {
    return true;
  }

  return null;
}

function persistResolvedState(AppCore, open) {
  if (!AppCore?.state || typeof AppCore.state !== "object") return;
  AppCore.state.sidebarOpen = Boolean(open);
}

/* =========================================================
   STATE HELPERS
========================================================= */
export function getDesiredSidebarOpenState(AppCore) {
  const explicit = AppCore?.state?.sidebarOpen;

  if (typeof explicit === "boolean") {
    return explicit;
  }

  const fromDom = resolveDomSidebarOpenState(AppCore);
  if (typeof fromDom === "boolean") {
    return fromDom;
  }

  if (isMobileViewport()) {
    return false;
  }

  return !getSavedSidebarCollapsed();
}

export function isSidebarCollapsedDesktop(AppCore) {
  if (isMobileViewport()) return false;
  return !getDesiredSidebarOpenState(AppCore);
}

/* =========================================================
   TOOLTIPS
========================================================= */
export function syncTooltipMode(AppCore, isOpen = null) {
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
export function updateToggleLabel(AppCore, isOpen = null) {
  const { toggleBtn, mobileToggleBtn, sidebar } = getElements(AppCore);
  if (!sidebar) return;

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
    toggleBtn.setAttribute("aria-label", desktopText);
    toggleBtn.setAttribute("aria-expanded", String(open));
    toggleBtn.classList.toggle("is-active", open);
    toggleBtn.removeAttribute("title");
  }

  if (mobileToggleBtn) {
    mobileToggleBtn.setAttribute("aria-label", mobileText);
    mobileToggleBtn.setAttribute("aria-expanded", String(open));
    mobileToggleBtn.classList.toggle("is-active", open);
    mobileToggleBtn.removeAttribute("title");
  }

  syncTooltipMode(AppCore, open);
}

/* =========================================================
   SINCRONIZACIÓN VISUAL
========================================================= */
export function syncSidebarState(AppCore, closeDropdown) {
  const { sidebar, body } = getElements(AppCore);
  if (!sidebar) return;

  if (isShellHidden(AppCore)) {
    sidebar.hidden = true;
    sidebar.classList.remove(
      "open",
      "is-open",
      "collapsed",
      "is-collapsed"
    );

    body?.classList.remove("sidebar-open", "sidebar-collapsed");

    closeDropdown?.();
    syncTooltipMode(AppCore, true);
    updateToggleLabel(AppCore, false);
    return;
  }

  sidebar.hidden = false;

  const mobile = isMobileViewport();
  const isOpen = getDesiredSidebarOpenState(AppCore);

  persistResolvedState(AppCore, isOpen);

  if (mobile) {
    sidebar.classList.toggle("open", isOpen);
    sidebar.classList.toggle("is-open", isOpen);
    sidebar.classList.remove("collapsed", "is-collapsed");

    body?.classList.toggle("sidebar-open", isOpen);
    body?.classList.remove("sidebar-collapsed");
  } else {
    sidebar.classList.toggle("collapsed", !isOpen);
    sidebar.classList.toggle("is-collapsed", !isOpen);
    sidebar.classList.remove("open", "is-open");

    body?.classList.toggle("sidebar-collapsed", !isOpen);
    body?.classList.remove("sidebar-open");
  }

  updateToggleLabel(AppCore, isOpen);

  AppCore?.events?.emit?.("sidebar:state:synced", {
    open: isOpen,
    mobile,
  });
}

/* =========================================================
   WRITE STATE
========================================================= */
export function setSidebarOpen(AppCore, open, closeDropdown) {
  const nextOpen = Boolean(open);
  const mobile = isMobileViewport();

  if (AppCore?.state && typeof AppCore.state === "object") {
    AppCore.state.sidebarOpen = nextOpen;
  }

  if (!mobile) {
    saveSidebarCollapsed(!nextOpen);
  }

  syncSidebarState(AppCore, closeDropdown);
}
