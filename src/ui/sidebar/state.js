/* =========================================================
   Onion SPA - Sidebar State
   Archivo: src/ui/sidebar/state.js

   Responsabilidades:
   - detectar viewport mobile
   - persistir collapsed/expanded en desktop
   - resolver estado deseado open/closed
   - sincronizar clases visuales del sidebar
   - actualizar aria / labels de toggles
   - activar modo tooltip CSS cuando proceda
========================================================= */

import { MOBILE_BREAKPOINT, DESKTOP_COLLAPSED_STORAGE_KEY } from "./constants.js";
import { getElements, isShellHidden, sanitizeFooterTooltipState } from "./dom.js";

/* =========================================================
   RESPONSIVE
========================================================= */
export function isMobileViewport(breakpoint = MOBILE_BREAKPOINT) {
  return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
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
   STATE HELPERS
========================================================= */
export function getDesiredSidebarOpenState(AppCore) {
  return Boolean(AppCore?.state?.sidebarOpen);
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
    sidebar.classList.remove("open", "is-open", "collapsed", "is-collapsed");

    body?.classList.remove("sidebar-open", "sidebar-collapsed");

    syncTooltipMode(AppCore, true);
    closeDropdown?.();
    updateToggleLabel(AppCore, false);
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

  if (AppCore?.state) {
    AppCore.state.sidebarOpen = nextOpen;
  }

  if (!mobile) {
    saveSidebarCollapsed(!nextOpen);
  }

  syncSidebarState(AppCore, closeDropdown);
}
