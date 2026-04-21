/* =========================================================
   Onion SPA - Topbar Sidebar Bridge
   Archivo: src/ui/topbar/topbar.sidebar.js

   Responsabilidades:
   - integrar TopbarUI con SidebarUI
   - gestionar toggle mobile del sidebar
   - sincronizar estado aria del botón mobile
   - mantener limpio el offset visual del topbar
========================================================= */

import {
  TOPBAR_SEARCH_CONFIG,
  isMobileViewport,
} from "./topbar.helpers.js";

export function getSidebarModule(AppCore) {
  try {
    if (AppCore?.modules?.get && typeof AppCore.modules.get === "function") {
      const found = AppCore.modules.get("sidebar");
      if (found) return found;
    }

    if (AppCore?.modules && typeof AppCore.modules === "object") {
      if (AppCore.modules.sidebar) {
        return AppCore.modules.sidebar;
      }

      if (AppCore.modules.get?.("SidebarUI")) {
        return AppCore.modules.get("SidebarUI");
      }
    }

    if (AppCore?.sidebar) {
      return AppCore.sidebar;
    }

    return null;
  } catch {
    return null;
  }
}

export function syncFixedTopbarOffset(getDom) {
  const { topbar } = getDom();
  if (!topbar) return;

  topbar.style.left = "";
  topbar.style.right = "";
  topbar.style.width = "";
  topbar.style.insetInlineStart = "";
  topbar.style.insetInlineEnd = "";
}

export function getSidebarMobileOpenState(sidebar) {
  return Boolean(
    sidebar &&
      (sidebar.classList.contains("open") ||
        sidebar.classList.contains("is-open"))
  );
}

export function setMobileToggleState(getDom) {
  const { mobileToggle, sidebar } = getDom();
  if (!mobileToggle) return;

  const isDesktop = !isMobileViewport(
    TOPBAR_SEARCH_CONFIG.mobileBreakpoint
  );
  const isOpen = getSidebarMobileOpenState(sidebar);

  mobileToggle.setAttribute("aria-expanded", String(isOpen));
  mobileToggle.setAttribute(
    "aria-label",
    isOpen ? "Cerrar navegación" : "Abrir navegación"
  );
  mobileToggle.classList.toggle("is-active", isOpen);
  mobileToggle.hidden = isDesktop;
}

function isMobileOnlyContext() {
  return isMobileViewport(
    TOPBAR_SEARCH_CONFIG.mobileBreakpoint
  );
}

export function openSidebarMobile({
  AppCore,
  getDom,
}) {
  if (!isMobileOnlyContext()) {
    setMobileToggleState(getDom);
    return;
  }

  const sidebarModule = getSidebarModule(AppCore);

  if (
    sidebarModule?.openSidebar &&
    typeof sidebarModule.openSidebar === "function"
  ) {
    sidebarModule.openSidebar();

    window.setTimeout(() => {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
    }, 0);

    return;
  }

  const { sidebar } = getDom();
  if (!sidebar) return;

  sidebar.classList.add("open", "is-open");
  document.body?.classList.add("sidebar-open");

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);
}

export function closeSidebarMobile({
  AppCore,
  getDom,
}) {
  if (!isMobileOnlyContext()) {
    setMobileToggleState(getDom);
    return;
  }

  const sidebarModule = getSidebarModule(AppCore);

  if (
    sidebarModule?.closeSidebar &&
    typeof sidebarModule.closeSidebar === "function"
  ) {
    sidebarModule.closeSidebar();

    window.setTimeout(() => {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
    }, 0);

    return;
  }

  const { sidebar } = getDom();
  if (!sidebar) return;

  sidebar.classList.remove("open", "is-open");
  document.body?.classList.remove("sidebar-open");

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);
}

export function toggleSidebarMobile({
  AppCore,
  getDom,
}) {
  if (!isMobileOnlyContext()) {
    setMobileToggleState(getDom);
    return;
  }

  const sidebarModule = getSidebarModule(AppCore);

  if (
    sidebarModule?.toggleSidebar &&
    typeof sidebarModule.toggleSidebar === "function"
  ) {
    sidebarModule.toggleSidebar();

    window.setTimeout(() => {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
    }, 0);

    return;
  }

  const { sidebar } = getDom();
  if (!sidebar) return;

  const nextOpen = !getSidebarMobileOpenState(sidebar);

  sidebar.classList.toggle("open", nextOpen);
  sidebar.classList.toggle("is-open", nextOpen);
  document.body?.classList.toggle("sidebar-open", nextOpen);

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);
}

export function handleViewportResize(getDom, closeSidebarMobileFn) {
  void closeSidebarMobileFn;
  setMobileToggleState(getDom);

  syncFixedTopbarOffset(getDom);
}
