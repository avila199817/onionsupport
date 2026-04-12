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
   - rehidratar refs tras mount dinámico
   - mantener compatibilidad con AppCore.dom
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
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.querySelector("#app-content") ||
    document.querySelector(".main-content")
  );
}

export function getAppShellEl(AppCore) {
  return (
    AppCore?.dom?.layout ||
    AppCore?.dom?.appShell ||
    document.getElementById("app-shell") ||
    document.querySelector(".layout") ||
    document.body
  );
}

/* =========================================================
   MOUNT
========================================================= */
export function mountSidebar(AppCore) {
  if (typeof document === "undefined") {
    return null;
  }

  let sidebar = document.getElementById(SIDEBAR_ROOT_ID);
  if (sidebar) {
    return sidebar;
  }

  const mainContent = getMainContentEl(AppCore);
  const appShell = getAppShellEl(AppCore);

  if (mainContent?.parentElement) {
    mainContent.insertAdjacentHTML(
      "beforebegin",
      getSidebarTemplate()
    );
  } else if (appShell) {
    appShell.insertAdjacentHTML(
      "afterbegin",
      getSidebarTemplate()
    );
  } else if (document.body) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      getSidebarTemplate()
    );
  }

  sidebar = document.getElementById(SIDEBAR_ROOT_ID);

  return sidebar || null;
}

/* =========================================================
   CACHE DOM REFS
========================================================= */
export function cacheDomRefs(AppCore) {
  if (!AppCore?.dom || typeof document === "undefined") {
    return null;
  }

  const sidebar =
    document.getElementById(SIDEBAR_ROOT_ID) ||
    document.querySelector(".sidebar");

  const sidebarMenu =
    document.getElementById(SIDEBAR_MENU_ID) ||
    sidebar?.querySelector?.(".sidebar-menu") ||
    document.querySelector(".sidebar-menu");

  const sidebarRecents =
    document.getElementById(SIDEBAR_RECENTS_ID) ||
    sidebar?.querySelector?.(`#${SIDEBAR_RECENTS_ID}`) ||
    null;

  const sidebarToggle =
    document.getElementById("toggleSidebar") ||
    sidebar?.querySelector?.("#toggleSidebar") ||
    null;

  const mobileToggleBtn =
    document.getElementById("toggleSidebarMobile") ||
    sidebar?.querySelector?.("#toggleSidebarMobile") ||
    null;

  const userToggle =
    document.getElementById(USER_TOGGLE_ID) ||
    sidebar?.querySelector?.(`#${USER_TOGGLE_ID}`) ||
    null;

  const userDropdown =
    document.getElementById(USER_DROPDOWN_ID) ||
    sidebar?.querySelector?.(`#${USER_DROPDOWN_ID}`) ||
    null;

  const logoutBtn =
    document.getElementById(LOGOUT_BUTTON_ID) ||
    sidebar?.querySelector?.(`#${LOGOUT_BUTTON_ID}`) ||
    null;

  const avatarEl =
    document.getElementById(SIDEBAR_AVATAR_ID) ||
    sidebar?.querySelector?.(`#${SIDEBAR_AVATAR_ID}`) ||
    null;

  const nameEl =
    document.getElementById(SIDEBAR_NAME_ID) ||
    sidebar?.querySelector?.(`#${SIDEBAR_NAME_ID}`) ||
    null;

  const body = document.body || null;

  AppCore.dom.body = body;
  AppCore.dom.sidebar = sidebar || null;
  AppCore.dom.sidebarMenu = sidebarMenu || null;
  AppCore.dom.sidebarRecents = sidebarRecents || null;
  AppCore.dom.sidebarToggle = sidebarToggle || null;

  /* compatibilidad doble naming */
  AppCore.dom.mobileSidebarToggle =
    mobileToggleBtn || null;
  AppCore.dom.sidebarMobileToggle =
    mobileToggleBtn || null;

  AppCore.dom.userToggle = userToggle || null;
  AppCore.dom.userDropdown = userDropdown || null;
  AppCore.dom.logoutBtn = logoutBtn || null;
  AppCore.dom.sidebarAvatar = avatarEl || null;
  AppCore.dom.sidebarName = nameEl || null;

  return {
    sidebar: AppCore.dom.sidebar,
    sidebarMenu: AppCore.dom.sidebarMenu,
    sidebarRecents: AppCore.dom.sidebarRecents,
    sidebarToggle: AppCore.dom.sidebarToggle,
    mobileToggleBtn:
      AppCore.dom.sidebarMobileToggle,
    userToggle: AppCore.dom.userToggle,
    userDropdown: AppCore.dom.userDropdown,
    logoutBtn: AppCore.dom.logoutBtn,
    avatarEl: AppCore.dom.sidebarAvatar,
    nameEl: AppCore.dom.sidebarName,
  };
}

/* =========================================================
   ELEMENT RESOLUTION
========================================================= */
export function getElements(AppCore) {
  const cached = cacheDomRefs(AppCore) || {};

  return {
    body:
      AppCore?.dom?.body ||
      document.body ||
      null,

    sidebar:
      cached.sidebar ||
      AppCore?.dom?.sidebar ||
      document.getElementById(SIDEBAR_ROOT_ID) ||
      document.querySelector(".sidebar") ||
      null,

    sidebarMenu:
      cached.sidebarMenu ||
      AppCore?.dom?.sidebarMenu ||
      document.getElementById(SIDEBAR_MENU_ID) ||
      document.querySelector(".sidebar-menu") ||
      null,

    sidebarRecents:
      cached.sidebarRecents ||
      AppCore?.dom?.sidebarRecents ||
      document.getElementById(SIDEBAR_RECENTS_ID) ||
      null,

    toggleBtn:
      cached.sidebarToggle ||
      AppCore?.dom?.sidebarToggle ||
      document.getElementById("toggleSidebar") ||
      null,

    mobileToggleBtn:
      cached.mobileToggleBtn ||
      AppCore?.dom?.sidebarMobileToggle ||
      AppCore?.dom?.mobileSidebarToggle ||
      document.getElementById("toggleSidebarMobile") ||
      null,

    userToggle:
      cached.userToggle ||
      AppCore?.dom?.userToggle ||
      document.getElementById(USER_TOGGLE_ID) ||
      null,

    userDropdown:
      cached.userDropdown ||
      AppCore?.dom?.userDropdown ||
      document.getElementById(USER_DROPDOWN_ID) ||
      null,

    logoutBtn:
      cached.logoutBtn ||
      AppCore?.dom?.logoutBtn ||
      document.getElementById(LOGOUT_BUTTON_ID) ||
      null,

    avatarEl:
      cached.avatarEl ||
      AppCore?.dom?.sidebarAvatar ||
      document.getElementById(SIDEBAR_AVATAR_ID) ||
      null,

    nameEl:
      cached.nameEl ||
      AppCore?.dom?.sidebarName ||
      document.getElementById(SIDEBAR_NAME_ID) ||
      null,
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

    if (
      element &&
      activeEl &&
      element.contains(activeEl)
    ) {
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
  const {
    sidebar,
    userToggle,
    userDropdown,
    avatarEl,
    nameEl,
  } = getElements(AppCore);

  if (!sidebar) return;

  [userToggle, userDropdown, avatarEl, nameEl].forEach(
    (element) => {
      if (!element) return;
      element.removeAttribute("data-tooltip");
      element.removeAttribute("title");
    }
  );

  sidebar
    .querySelectorAll(
      ".sidebar-footer [data-tooltip], .sidebar-footer [title]"
    )
    .forEach((element) => {
      element.removeAttribute("data-tooltip");
      element.removeAttribute("title");
    });
}
