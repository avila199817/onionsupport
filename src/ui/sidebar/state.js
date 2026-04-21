/* =========================================================
   Onion SPA - Sidebar State
   Archivo: src/ui/sidebar/state.js

   PRO HARDENED VERSION
   FIX REAL:
   - separación real desktop / mobile
   - desktop no depende de sidebarOpen transitorio
   - persistencia robusta
   - sync visual estable
   - tooltips coherentes
   - fallback a DOM / storage seguro
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

const LEGACY_SIDEBAR_OPEN_STORAGE_KEY = "sidebarOpen";

/* =========================================================
   INTERNAL SAFE HELPERS
========================================================= */
function ensureStateBag(AppCore) {
  if (!AppCore || typeof AppCore !== "object") return null;

  if (!AppCore.state || typeof AppCore.state !== "object") {
    AppCore.state = {};
  }

  return AppCore.state;
}

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
    const collapsedRaw = localStorage.getItem(
      DESKTOP_COLLAPSED_STORAGE_KEY
    );

    if (collapsedRaw === "true") return true;
    if (collapsedRaw === "false") return false;

    const legacyOpenRaw = localStorage.getItem(
      LEGACY_SIDEBAR_OPEN_STORAGE_KEY
    );

    if (legacyOpenRaw === "true") return false;
    if (legacyOpenRaw === "false") return true;

    return false;
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(value) {
  const collapsed = Boolean(value);

  try {
    localStorage.setItem(
      DESKTOP_COLLAPSED_STORAGE_KEY,
      String(collapsed)
    );
  } catch {
    /* noop */
  }

  try {
    localStorage.setItem(
      LEGACY_SIDEBAR_OPEN_STORAGE_KEY,
      String(!collapsed)
    );
  } catch {
    /* noop */
  }
}

/* =========================================================
   INTERNAL MEMORY
========================================================= */
function setDesktopMemory(AppCore, open) {
  const state = ensureStateBag(AppCore);
  if (!state) return;

  state.sidebarDesktopOpen = Boolean(open);
}

function setMobileMemory(AppCore, open) {
  const state = ensureStateBag(AppCore);
  if (!state) return;

  state.sidebarOpen = Boolean(open);
}

function syncSharedState(AppCore, open) {
  const state = ensureStateBag(AppCore);
  if (!state) return;

  state.sidebarOpen = Boolean(open);
}

/* =========================================================
   DOM FALLBACK STATE
========================================================= */
function resolveDomSidebarOpenState(AppCore) {
  const { sidebar, body } = getElements(AppCore);

  if (!sidebar && !body) {
    return null;
  }

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

  if (sidebar) {
    return true;
  }

  return null;
}

/* =========================================================
   DESIRED OPEN STATE
========================================================= */
function getDesktopDesiredOpenState(AppCore) {
  const state = ensureStateBag(AppCore);

  if (typeof state?.sidebarDesktopOpen === "boolean") {
    return state.sidebarDesktopOpen;
  }

  const fromDom = resolveDomSidebarOpenState(AppCore);
  if (typeof fromDom === "boolean") {
    setDesktopMemory(AppCore, fromDom);
    return fromDom;
  }

  const fromStorage = !getSavedSidebarCollapsed();
  setDesktopMemory(AppCore, fromStorage);
  return fromStorage;
}

function getMobileDesiredOpenState(AppCore) {
  const state = ensureStateBag(AppCore);

  if (typeof state?.sidebarOpen === "boolean") {
    return state.sidebarOpen;
  }

  const fromDom = resolveDomSidebarOpenState(AppCore);
  if (typeof fromDom === "boolean") {
    setMobileMemory(AppCore, fromDom);
    return fromDom;
  }

  return false;
}

/* =========================================================
   STATE HELPERS
========================================================= */
export function getDesiredSidebarOpenState(AppCore) {
  return isMobileViewport()
    ? getMobileDesiredOpenState(AppCore)
    : getDesktopDesiredOpenState(AppCore);
}

export function isSidebarCollapsedDesktop(AppCore) {
  if (isMobileViewport()) return false;
  return !getDesktopDesiredOpenState(AppCore);
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

    body?.classList.remove(
      "sidebar-open",
      "sidebar-collapsed"
    );

    closeDropdown?.();
    syncTooltipMode(AppCore, true);
    updateToggleLabel(AppCore, false);
    return;
  }

  sidebar.hidden = false;

  const mobile = isMobileViewport();
  const isOpen = getDesiredSidebarOpenState(AppCore);

  if (mobile) {
    setMobileMemory(AppCore, isOpen);

    sidebar.classList.toggle("open", isOpen);
    sidebar.classList.toggle("is-open", isOpen);
    sidebar.classList.remove("collapsed", "is-collapsed");

    body?.classList.toggle("sidebar-open", isOpen);
    body?.classList.remove("sidebar-collapsed");
  } else {
    setDesktopMemory(AppCore, isOpen);
    syncSharedState(AppCore, isOpen);

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

  if (mobile) {
    setMobileMemory(AppCore, nextOpen);
  } else {
    setDesktopMemory(AppCore, nextOpen);
    syncSharedState(AppCore, nextOpen);
    saveSidebarCollapsed(!nextOpen);
  }

  syncSidebarState(AppCore, closeDropdown);
}

export default {
  isMobileViewport,
  getSavedSidebarCollapsed,
  saveSidebarCollapsed,
  getDesiredSidebarOpenState,
  isSidebarCollapsedDesktop,
  syncTooltipMode,
  updateToggleLabel,
  syncSidebarState,
  setSidebarOpen,
};
