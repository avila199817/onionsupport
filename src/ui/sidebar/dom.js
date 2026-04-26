/* =========================================================
   Onion SPA - Sidebar DOM
   Archivo: src/ui/sidebar/dom.js

   FINAL PRO SYSTEM · SIDEBAR DOM · 10/10

   Responsabilidades:
   - montar el HTML del sidebar en el shell
   - cachear referencias DOM en AppCore
   - resolver elementos del módulo
   - detectar shell / main content
   - helpers de foco
   - sanear tooltips del footer del sidebar
   - sanear tooltip del logo del sidebar
   - rehidratar refs tras mount dinámico
   - mantener compatibilidad con AppCore.dom

   HARDENING:
   - no duplica sidebar si ya existe
   - tolera AppCore.dom inexistente
   - tolera document inexistente
   - fallback robusto de shell/main
   - limpieza de title/data-tooltip/aria-describedby en footer y logo
   - evita tooltips fantasma tras re-render/i18n/live refresh
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
   SAFE HELPERS
========================================================= */

function hasDocument() {
  return typeof document !== "undefined";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function ensureDomBag(AppCore) {
  if (!AppCore) return null;

  if (!AppCore.dom || typeof AppCore.dom !== "object") {
    AppCore.dom = {};
  }

  return AppCore.dom;
}

function byId(id = "") {
  if (!hasDocument()) return null;

  const cleanId = safeText(id, "");
  if (!cleanId) return null;

  return document.getElementById(cleanId);
}

function query(selector = "", root = null) {
  if (!hasDocument()) return null;

  const cleanSelector = safeText(selector, "");
  if (!cleanSelector) return null;

  try {
    return (root || document).querySelector(cleanSelector);
  } catch {
    return null;
  }
}

function queryAll(selector = "", root = null) {
  if (!hasDocument()) return [];

  const cleanSelector = safeText(selector, "");
  if (!cleanSelector) return [];

  try {
    return Array.from((root || document).querySelectorAll(cleanSelector));
  } catch {
    return [];
  }
}

function removeTooltipAttributes(element = null) {
  if (!element) return;

  try {
    element.removeAttribute("title");
    element.removeAttribute("data-tooltip");
    element.removeAttribute("data-i18n-data-tooltip");
    element.removeAttribute("aria-describedby");
  } catch {}
}

/* =========================================================
   SHELL HELPERS
========================================================= */

export function getMainContentEl(AppCore) {
  if (!hasDocument()) return null;

  return (
    AppCore?.dom?.mainContent ||
    AppCore?.dom?.viewContainer ||
    byId("app-content") ||
    byId("main-content") ||
    byId("view-container") ||
    query("#app-content") ||
    query("#main-content") ||
    query(".main-content") ||
    query("main") ||
    null
  );
}

export function getAppShellEl(AppCore) {
  if (!hasDocument()) return null;

  return (
    AppCore?.dom?.layout ||
    AppCore?.dom?.appShell ||
    byId("app-shell") ||
    byId("layout") ||
    query(".layout") ||
    query(".app-shell") ||
    document.body ||
    null
  );
}

/* =========================================================
   TOOLTIP SANITIZE
========================================================= */

export function sanitizeLogoTooltipState(AppCore) {
  const { sidebar } = getElements(AppCore);

  if (!sidebar) return false;

  const logo =
    byId("homeLink") ||
    query(".logo", sidebar) ||
    query("a.logo", sidebar);

  if (!logo) return false;

  removeTooltipAttributes(logo);

  /*
    Defensa extra:
    si algún refresh i18n/tooltip volvió a inyectar atributos
    en imágenes internas del logo, los limpiamos también.
  */
  queryAll("[data-tooltip], [title], [aria-describedby]", logo).forEach(
    (element) => {
      removeTooltipAttributes(element);
    }
  );

  return true;
}

export function sanitizeFooterTooltipState(AppCore) {
  const {
    sidebar,
    userToggle,
    userDropdown,
    avatarEl,
    nameEl,
  } = getElements(AppCore);

  if (!sidebar) return false;

  [userToggle, userDropdown, avatarEl, nameEl].forEach((element) => {
    removeTooltipAttributes(element);
  });

  queryAll(
    ".sidebar-footer [data-tooltip], .sidebar-footer [title], .sidebar-footer [aria-describedby]",
    sidebar
  ).forEach((element) => {
    removeTooltipAttributes(element);
  });

  return true;
}

export function sanitizeSidebarTooltipState(AppCore) {
  const logoOk = sanitizeLogoTooltipState(AppCore);
  const footerOk = sanitizeFooterTooltipState(AppCore);

  return Boolean(logoOk || footerOk);
}

/* =========================================================
   MOUNT
========================================================= */

export function mountSidebar(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  ensureDomBag(AppCore);

  let sidebar = byId(SIDEBAR_ROOT_ID);

  if (sidebar) {
    cacheDomRefs(AppCore);
    sanitizeSidebarTooltipState(AppCore);
    return sidebar;
  }

  const mainContent = getMainContentEl(AppCore);
  const appShell = getAppShellEl(AppCore);
  const html = getSidebarTemplate();

  try {
    if (mainContent?.parentElement) {
      mainContent.insertAdjacentHTML("beforebegin", html);
    } else if (appShell) {
      appShell.insertAdjacentHTML("afterbegin", html);
    } else if (document.body) {
      document.body.insertAdjacentHTML("afterbegin", html);
    }
  } catch {
    try {
      document.body?.insertAdjacentHTML?.("afterbegin", html);
    } catch {}
  }

  sidebar = byId(SIDEBAR_ROOT_ID);

  cacheDomRefs(AppCore);
  sanitizeSidebarTooltipState(AppCore);

  return sidebar || null;
}

/* =========================================================
   CACHE DOM REFS
========================================================= */

export function cacheDomRefs(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  const dom = ensureDomBag(AppCore);
  if (!dom) return null;

  const sidebar =
    byId(SIDEBAR_ROOT_ID) ||
    query(".sidebar");

  const sidebarMenu =
    byId(SIDEBAR_MENU_ID) ||
    query(".sidebar-menu", sidebar) ||
    query(".sidebar-menu");

  const sidebarRecents =
    byId(SIDEBAR_RECENTS_ID) ||
    query(`#${SIDEBAR_RECENTS_ID}`, sidebar) ||
    null;

  const sidebarToggle =
    byId("toggleSidebar") ||
    query("#toggleSidebar", sidebar) ||
    null;

  const mobileToggleBtn =
    byId("toggleSidebarMobile") ||
    query("#toggleSidebarMobile", sidebar) ||
    null;

  const userToggle =
    byId(USER_TOGGLE_ID) ||
    query(`#${USER_TOGGLE_ID}`, sidebar) ||
    null;

  const userDropdown =
    byId(USER_DROPDOWN_ID) ||
    query(`#${USER_DROPDOWN_ID}`, sidebar) ||
    null;

  const logoutBtn =
    byId(LOGOUT_BUTTON_ID) ||
    query(`#${LOGOUT_BUTTON_ID}`, sidebar) ||
    null;

  const avatarEl =
    byId(SIDEBAR_AVATAR_ID) ||
    query(`#${SIDEBAR_AVATAR_ID}`, sidebar) ||
    null;

  const nameEl =
    byId(SIDEBAR_NAME_ID) ||
    query(`#${SIDEBAR_NAME_ID}`, sidebar) ||
    null;

  const logoEl =
    byId("homeLink") ||
    query(".logo", sidebar) ||
    query("a.logo", sidebar) ||
    null;

  const body = document.body || null;

  dom.body = body;
  dom.sidebar = sidebar || null;
  dom.sidebarMenu = sidebarMenu || null;
  dom.sidebarRecents = sidebarRecents || null;
  dom.sidebarToggle = sidebarToggle || null;
  dom.sidebarLogo = logoEl || null;

  /*
    Compatibilidad doble naming.
  */
  dom.mobileSidebarToggle = mobileToggleBtn || null;
  dom.sidebarMobileToggle = mobileToggleBtn || null;

  dom.userToggle = userToggle || null;
  dom.userDropdown = userDropdown || null;
  dom.logoutBtn = logoutBtn || null;
  dom.sidebarAvatar = avatarEl || null;
  dom.sidebarName = nameEl || null;

  return {
    body: dom.body,
    sidebar: dom.sidebar,
    sidebarMenu: dom.sidebarMenu,
    sidebarRecents: dom.sidebarRecents,
    sidebarToggle: dom.sidebarToggle,
    mobileToggleBtn: dom.sidebarMobileToggle,
    userToggle: dom.userToggle,
    userDropdown: dom.userDropdown,
    logoutBtn: dom.logoutBtn,
    avatarEl: dom.sidebarAvatar,
    nameEl: dom.sidebarName,
    logoEl: dom.sidebarLogo,
  };
}

/* =========================================================
   ELEMENT RESOLUTION
========================================================= */

export function getElements(AppCore) {
  if (!hasDocument()) {
    return {
      body: null,
      sidebar: null,
      sidebarMenu: null,
      sidebarRecents: null,
      toggleBtn: null,
      mobileToggleBtn: null,
      userToggle: null,
      userDropdown: null,
      logoutBtn: null,
      avatarEl: null,
      nameEl: null,
      logoEl: null,
    };
  }

  const cached = cacheDomRefs(AppCore) || {};
  const dom = AppCore?.dom || {};

  const sidebar =
    cached.sidebar ||
    dom.sidebar ||
    byId(SIDEBAR_ROOT_ID) ||
    query(".sidebar") ||
    null;

  return {
    body:
      cached.body ||
      dom.body ||
      document.body ||
      null,

    sidebar,

    sidebarMenu:
      cached.sidebarMenu ||
      dom.sidebarMenu ||
      byId(SIDEBAR_MENU_ID) ||
      query(".sidebar-menu", sidebar) ||
      query(".sidebar-menu") ||
      null,

    sidebarRecents:
      cached.sidebarRecents ||
      dom.sidebarRecents ||
      byId(SIDEBAR_RECENTS_ID) ||
      query(`#${SIDEBAR_RECENTS_ID}`, sidebar) ||
      null,

    toggleBtn:
      cached.sidebarToggle ||
      dom.sidebarToggle ||
      byId("toggleSidebar") ||
      query("#toggleSidebar", sidebar) ||
      null,

    mobileToggleBtn:
      cached.mobileToggleBtn ||
      dom.sidebarMobileToggle ||
      dom.mobileSidebarToggle ||
      byId("toggleSidebarMobile") ||
      query("#toggleSidebarMobile", sidebar) ||
      null,

    userToggle:
      cached.userToggle ||
      dom.userToggle ||
      byId(USER_TOGGLE_ID) ||
      query(`#${USER_TOGGLE_ID}`, sidebar) ||
      null,

    userDropdown:
      cached.userDropdown ||
      dom.userDropdown ||
      byId(USER_DROPDOWN_ID) ||
      query(`#${USER_DROPDOWN_ID}`, sidebar) ||
      null,

    logoutBtn:
      cached.logoutBtn ||
      dom.logoutBtn ||
      byId(LOGOUT_BUTTON_ID) ||
      query(`#${LOGOUT_BUTTON_ID}`, sidebar) ||
      null,

    avatarEl:
      cached.avatarEl ||
      dom.sidebarAvatar ||
      byId(SIDEBAR_AVATAR_ID) ||
      query(`#${SIDEBAR_AVATAR_ID}`, sidebar) ||
      null,

    nameEl:
      cached.nameEl ||
      dom.sidebarName ||
      byId(SIDEBAR_NAME_ID) ||
      query(`#${SIDEBAR_NAME_ID}`, sidebar) ||
      null,

    logoEl:
      cached.logoEl ||
      dom.sidebarLogo ||
      byId("homeLink") ||
      query(".logo", sidebar) ||
      query("a.logo", sidebar) ||
      null,
  };
}

export function hasSidebarShell(AppCore) {
  const { sidebar } = getElements(AppCore);
  return Boolean(sidebar);
}

export function isShellHidden(AppCore) {
  if (!hasDocument()) return false;

  return Boolean(
    document.body?.classList.contains("route-shell-hidden") ||
      AppCore?.dom?.body?.classList.contains("route-shell-hidden") ||
      AppCore?.dom?.layout?.classList?.contains?.("route-shell-hidden") ||
      AppCore?.dom?.appShell?.classList?.contains?.("route-shell-hidden")
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
      return true;
    }
  } catch {}

  return false;
}

export function focusFirstInteractive(root = null) {
  if (!root) return false;

  try {
    const target = root.querySelector(
      [
        "a[href]:not([hidden]):not([aria-hidden='true'])",
        "button:not([disabled]):not([hidden]):not([aria-hidden='true'])",
        "[tabindex]:not([tabindex='-1']):not([hidden]):not([aria-hidden='true'])",
      ].join(",")
    );

    if (target && typeof target.focus === "function") {
      target.focus();
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getMainContentEl,
  getAppShellEl,

  mountSidebar,
  cacheDomRefs,
  getElements,

  hasSidebarShell,
  isShellHidden,

  blurIfInside,
  focusFirstInteractive,

  sanitizeLogoTooltipState,
  sanitizeFooterTooltipState,
  sanitizeSidebarTooltipState,
};
