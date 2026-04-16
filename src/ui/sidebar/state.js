/* =========================================================
   Onion SPA - Sidebar State
   Archivo: src/ui/sidebar/state.js

   Responsabilidades:
   - detectar viewport mobile
   - mantener sidebar siempre abierto en desktop
   - resolver estado deseado open/closed
   - sincronizar clases visuales del sidebar
   - actualizar aria / labels de toggles
   - activar modo tooltip CSS cuando proceda
========================================================= */

import { MOBILE_BREAKPOINT } from "./constants.js";
import { getElements, isShellHidden, sanitizeFooterTooltipState } from "./dom.js";

/* =========================================================
   RESPONSIVE
========================================================= */
export function isMobileViewport(breakpoint = MOBILE_BREAKPOINT) {
  return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
}

/* =========================================================
   PERSISTENCIA
   DESACTIVADA: sidebar siempre abierto en desktop
========================================================= */
export function getSavedSidebarCollapsed() {
  return false;
}

export function saveSidebarCollapsed() {
  /* noop */
}

/* =========================================================
   STATE HELPERS
========================================================= */
export function getDesiredSidebarOpenState(AppCore) {
  if (isMobileViewport()) {
    return Boolean(AppCore?.state?.sidebarOpen);
  }

  return true;
}

export function isSidebarCollapsedDesktop(AppCore) {
  const { sidebar } = getElements(AppCore);
  if (!sidebar) return false;
  if (isMobileViewport()) return false;

  return false;
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
      : !isSidebarCollapsedDesktop(AppCore);

  const enableCssTooltipMode =
    !isMobileViewport() &&
    !open &&
    !isShellHidden(AppCore);

  sidebar.classList.toggle("sidebar-tooltips-active", enableCssTooltipMode);
  body.classList.toggle("sidebar-tooltips-active", enableCssTooltipMode);

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
      : !(
          sidebar.classList.contains("collapsed") ||
          sidebar.classList.contains("is-collapsed")
        );

  const desktopText = "Barra lateral fija abierta";

  const mobileText = open
    ? "Cerrar navegación"
    : "Abrir navegación";

  if (toggleBtn) {
    toggleBtn.dataset.tooltip = desktopText;
    toggleBtn.setAttribute("aria-label", desktopText);
    toggleBtn.setAttribute("aria-expanded", "true");
    toggleBtn.classList.add("is-active");
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
    sidebar.classList.remove("open", "is-open", "collapsed", "is-collapsed");

    body?.classList.remove("sidebar-open", "sidebar-collapsed");

    syncTooltipMode(AppCore, true);
    closeDropdown?.();
    updateToggleLabel(AppCore, true);
    return;
  }

  sidebar.hidden = false;

  const mobile = isMobileViewport();
  const isOpen = getDesiredSidebarOpenState(AppCore);

  if (mobile) {
    sidebar.classList.toggle("open", isOpen);
    sidebar.classList.toggle("is-open", isOpen);
    sidebar.classList.remove("collapsed", "is-collapsed");

    body?.classList.toggle("sidebar-open", isOpen);
    body?.classList.remove("sidebar-collapsed");
  } else {
    sidebar.classList.remove("collapsed", "is-collapsed");
    sidebar.classList.add("open", "is-open");

    body?.classList.remove("sidebar-collapsed");
    body?.classList.add("sidebar-open");
  }

  updateToggleLabel(AppCore, isOpen);

  AppCore?.events?.emit?.("sidebar:state:synced", {
    open: mobile ? isOpen : true,
    mobile,
  });
}

/* =========================================================
   WRITE STATE
========================================================= */
export function setSidebarOpen(AppCore, open, closeDropdown) {
  const mobile = isMobileViewport();

  if (AppCore?.state) {
    AppCore.state.sidebarOpen = mobile ? Boolean(open) : true;
  }

  syncSidebarState(AppCore, closeDropdown);
}
