/* =========================================================
   Onion SPA - Sidebar DOM
   Archivo: src/ui/sidebar/dom.js

   Responsabilidades:
   - montar el HTML del sidebar en el shell
   - cachear referencias DOM en AppCore
   - resolver elementos del módulo
   - detectar shell / main content
   - helpers de foco
   - sanear tooltips del footer del sidebar
========================================================= */

import { getSidebarTemplate } from "./template.js";
import {
  SIDEBAR_ROOT_ID,
  SIDEBAR_MENU_ID,
  SIDEBAR_RECENTS_ID,
  USER_TOGGLE_ID,
  USER_DROPDOWN_ID,
  LOGOUT_BUTTON_ID,
  SIDEBAR_AVATAR_ID,
  SIDEBAR_NAME_ID,
} from "./constants.js";

/* =========================================================
   SHELL HELPERS
========================================================= */
export function getMainContentEl(AppCore) {
  return (
    AppCore?.dom?.mainContent ||
    document.getElementById("main-content") ||
    document.querySelector(".main-content")
  );
}

export function getAppShellEl(AppCore) {
  return (
    AppCore?.dom?.appShell ||
    document.getElementById("app-shell") ||
    document.querySelector(".layout")
  );
}

/* =========================================================
   MOUNT
========================================================= */
export function mountSidebar(AppCore) {
  let sidebar = document.getElementById(SIDEBAR_ROOT_ID);
  if (sidebar) return sidebar;

  const mainContent = getMainContentEl(AppCore);
  const appShell = getAppShellEl(AppCore);

  if (mainContent && mainContent.parentElement) {
    mainContent.insertAdjacentHTML("beforebegin", getSidebarTemplate());
  } else if (appShell) {
    appShell.insertAdjacentHTML("afterbegin", getSidebarTemplate());
  } else if (document.body) {
    document.body.insertAdjacentHTML("afterbegin", getSidebarTemplate());
  }

  sidebar = document.getElementById(SIDEBAR_ROOT_ID);
  return sidebar || null;
}

/* =========================================================
   CACHE DOM REFS
========================================================= */
export function cacheDomRefs(AppCore) {
  if (!AppCore?.dom) return;

  const sidebar = document.getElementById(SIDEBAR_ROOT_ID);
  const sidebarMenu = document.getElementById(SIDEBAR_MENU_ID);
  const sidebarRecents = document.getElementById(SIDEBAR_RECENTS_ID);
  const sidebarToggle = document.getElementById("toggleSidebar");
  const mobileToggleBtn = document.getElementById("toggleSidebarMobile");
  const userToggle = document.getElementById(USER_TOGGLE_ID);
  const userDropdown = document.getElementById(USER_DROPDOWN_ID);
  const logoutBtn = document.getElementById(LOGOUT_BUTTON_ID);
  const avatarEl = document.getElementById(SIDEBAR_AVATAR_ID);
  const nameEl = document.getElementById(SIDEBAR_NAME_ID);
  const body = document.body;

  AppCore.dom.body = body;
  AppCore.dom.sidebar = sidebar;
  AppCore.dom.sidebarMenu = sidebarMenu;
  AppCore.dom.sidebarRecents = sidebarRecents;
  AppCore.dom.sidebarToggle = sidebarToggle;
  AppCore.dom.mobileSidebarToggle = mobileToggleBtn;
  AppCore.dom.userToggle = userToggle;
  AppCore.dom.userDropdown = userDropdown;
  AppCore.dom.logoutBtn = logoutBtn;
  AppCore.dom.sidebarAvatar = avatarEl;
  AppCore.dom.sidebarName = nameEl;
}

/* =========================================================
   ELEMENT RESOLUTION
========================================================= */
export function getElements(AppCore) {
  return {
    body: AppCore?.dom?.body || document.body,

    sidebar:
      AppCore?.dom?.sidebar ||
      document.getElementById(SIDEBAR_ROOT_ID) ||
      document.querySelector(".sidebar"),

    sidebarMenu:
      AppCore?.dom?.sidebarMenu ||
      document.getElementById(SIDEBAR_MENU_ID) ||
      document.querySelector(".sidebar-menu"),

    sidebarRecents:
      AppCore?.dom?.sidebarRecents ||
      document.getElementById(SIDEBAR_RECENTS_ID),

    toggleBtn:
      AppCore?.dom?.sidebarToggle ||
      document.getElementById("toggleSidebar"),

    mobileToggleBtn:
      AppCore?.dom?.mobileSidebarToggle ||
      document.getElementById("toggleSidebarMobile"),

    userToggle:
      AppCore?.dom?.userToggle ||
      document.getElementById(USER_TOGGLE_ID),

    userDropdown:
      AppCore?.dom?.userDropdown ||
      document.getElementById(USER_DROPDOWN_ID),

    logoutBtn:
      AppCore?.dom?.logoutBtn ||
      document.getElementById(LOGOUT_BUTTON_ID),

    avatarEl:
      AppCore?.dom?.sidebarAvatar ||
      document.getElementById(SIDEBAR_AVATAR_ID),

    nameEl:
      AppCore?.dom?.sidebarName ||
      document.getElementById(SIDEBAR_NAME_ID),
  };
}

export function hasSidebarShell(AppCore) {
  const { sidebar } = getElements(AppCore);
  return Boolean(sidebar);
}

export function isShellHidden(AppCore) {
  return Boolean(
    document.body?.classList.contains("route-shell-hidden") ||
    AppCore?.dom?.body?.classList.contains("route-shell-hidden")
  );
}

/* =========================================================
   FOCUS / A11Y HELPERS
========================================================= */
export function blurIfInside(element) {
  try {
    const activeEl = document.activeElement;
    if (element && activeEl && element.contains(activeEl)) {
      activeEl.blur?.();
    }
  } catch {
    /* noop */
  }
}

/* =========================================================
   TOOLTIP SANITIZE
========================================================= */
export function sanitizeFooterTooltipState(AppCore) {
  const { sidebar, userToggle, userDropdown, avatarEl, nameEl } = getElements(AppCore);
  if (!sidebar) return;

  [userToggle, userDropdown, avatarEl, nameEl].forEach((element) => {
    if (!element) return;
    element.removeAttribute("data-tooltip");
    element.removeAttribute("title");
  });

  sidebar
    .querySelectorAll(".sidebar-footer [data-tooltip], .sidebar-footer [title]")
    .forEach((element) => {
      element.removeAttribute("data-tooltip");
      element.removeAttribute("title");
    });
}
