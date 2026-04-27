/* =========================================================
   Onion SPA - Sidebar DOM
   Archivo: src/ui/sidebar/dom.js

   FINAL PRO SYSTEM · SIDEBAR DOM · 10/10 · DROPDOWN HARDENED

   Responsabilidades:
   - montar el HTML del sidebar en el shell
   - priorizar #sidebar-mount cuando existe
   - cachear referencias DOM en AppCore
   - resolver elementos del módulo
   - detectar shell / main content
   - helpers de foco
   - sanear tooltips del footer del sidebar
   - sanear tooltip del logo del sidebar
   - rehidratar refs tras mount dinámico
   - mantener compatibilidad con AppCore.dom
   - resolver dropdown de usuario aunque cambien IDs/data/classes
   - soportar aria-controls entre toggle y dropdown

   HARDENING:
   - no duplica sidebar si ya existe
   - tolera AppCore.dom inexistente
   - tolera document inexistente
   - fallback robusto de shell/main
   - limpieza de title/data-tooltip/aria-describedby
   - evita tooltips fantasma tras re-render/i18n/live refresh
   - no mete el sidebar dentro del view-container
   - selector resolver ampliado para userToggle/userDropdown/logout
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
   LOCAL FALLBACK CONSTANTS
========================================================= */

const SIDEBAR_MOUNT_ID = "sidebar-mount";
const SIDEBAR_TOGGLE_ID = "toggleSidebar";
const SIDEBAR_MOBILE_TOGGLE_ID = "toggleSidebarMobile";
const SIDEBAR_LOGO_ID = "homeLink";

/* =========================================================
   SELECTOR FALLBACKS
========================================================= */

const SIDEBAR_SELECTORS = [
  `#${SIDEBAR_ROOT_ID}`,
  ".sidebar",
  "[data-sidebar='true']",
  "[data-sidebar-root]",
  "[data-sidebar]",
];

const SIDEBAR_MENU_SELECTORS = [
  `#${SIDEBAR_MENU_ID}`,
  "[data-sidebar-menu]",
  ".sidebar-menu",
  "[role='navigation']",
];

const SIDEBAR_RECENTS_SELECTORS = [
  `#${SIDEBAR_RECENTS_ID}`,
  "[data-sidebar-recents]",
  "[data-sidebar-recent]",
  ".sidebar-recents",
];

const SIDEBAR_TOGGLE_SELECTORS = [
  `#${SIDEBAR_TOGGLE_ID}`,
  "[data-sidebar-action='toggle-sidebar']",
  "[data-sidebar-toggle]",
  "[data-action='toggle-sidebar']",
  ".sidebar-toggle",
];

const SIDEBAR_MOBILE_TOGGLE_SELECTORS = [
  `#${SIDEBAR_MOBILE_TOGGLE_ID}`,
  "[data-sidebar-mobile-toggle]",
  "[data-sidebar-action='mobile-sidebar-toggle']",
  "[data-action='mobile-sidebar-toggle']",
  ".sidebar-mobile-toggle",
];

const USER_TOGGLE_SELECTORS = [
  `#${USER_TOGGLE_ID}`,
  "#sidebarUserToggle",
  "#sidebar-user-toggle",
  "#sidebarUserMenuToggle",
  "#sidebar-user-menu-toggle",
  "#userToggle",
  "#user-toggle",

  "[data-sidebar-action='toggle-user-dropdown']",
  "[data-sidebar-action='toggle-user-menu']",
  "[data-sidebar-action='user-toggle']",
  "[data-sidebar-action='user-dropdown']",
  "[data-sidebar-user-toggle]",
  "[data-user-toggle]",
  "[data-user-menu-toggle]",
  "[data-dropdown-toggle='user']",
  "[data-dropdown-target='user']",

  ".sidebar-user-toggle",
  ".sidebar-user__toggle",
  ".sidebar-footer-user-toggle",
  ".sidebar-footer__user-toggle",
  ".user-toggle",
  ".user-menu-toggle",

  `[aria-controls='${USER_DROPDOWN_ID}']`,
];

const USER_DROPDOWN_SELECTORS = [
  `#${USER_DROPDOWN_ID}`,
  "#sidebarUserDropdown",
  "#sidebar-user-dropdown",
  "#sidebarUserMenu",
  "#sidebar-user-menu",
  "#userDropdown",
  "#user-dropdown",
  "#userMenu",
  "#user-menu",

  "[data-user-dropdown]",
  "[data-user-menu]",
  "[data-sidebar-user-dropdown]",
  "[data-sidebar-user-menu]",
  "[data-dropdown='user']",
  "[data-dropdown-menu='user']",
  "[data-sidebar-dropdown='user']",

  ".sidebar-user-dropdown",
  ".sidebar-user-menu",
  ".sidebar-user__dropdown",
  ".sidebar-user__menu",
  ".sidebar-footer-user-dropdown",
  ".sidebar-footer-user-menu",
  ".sidebar-footer__user-dropdown",
  ".sidebar-footer__user-menu",
  ".user-dropdown",
  ".user-menu",
];

const LOGOUT_SELECTORS = [
  `#${LOGOUT_BUTTON_ID}`,
  "#logoutBtn",
  "#logoutButton",
  "#sidebarLogout",
  "#sidebar-logout",

  "[data-sidebar-action='logout']",
  "[data-action='logout']",
  "[data-logout]",
  "[data-sidebar-logout]",

  ".sidebar-logout",
  ".logout-button",
  ".logout-btn",
];

const AVATAR_SELECTORS = [
  `#${SIDEBAR_AVATAR_ID}`,
  "#sidebarAvatar",
  "#sidebar-avatar",
  "[data-sidebar-avatar]",
  "[data-user-avatar]",
  ".sidebar-avatar",
  ".sidebar-user-avatar",
];

const NAME_SELECTORS = [
  `#${SIDEBAR_NAME_ID}`,
  "#sidebarName",
  "#sidebar-name",
  "#sidebarUserName",
  "#sidebar-user-name",
  "[data-sidebar-name]",
  "[data-user-name]",
  ".sidebar-name",
  ".sidebar-user-name",
];

const LOGO_SELECTORS = [
  `#${SIDEBAR_LOGO_ID}`,
  "#sidebarLogo",
  "#sidebar-logo",
  "[data-sidebar-logo]",
  ".logo",
  "a.logo",
  ".sidebar-logo",
];

/* =========================================================
   SAFE HELPERS
========================================================= */

function hasDocument() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function isElement(value = null) {
  if (!value) {
    return false;
  }

  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(value && typeof value.querySelector === "function");
  }
}

function ensureDomBag(AppCore) {
  if (!AppCore) {
    return null;
  }

  if (!AppCore.dom || typeof AppCore.dom !== "object") {
    AppCore.dom = {};
  }

  return AppCore.dom;
}

function byId(id = "") {
  if (!hasDocument()) {
    return null;
  }

  const cleanId = safeText(id, "");

  if (!cleanId) {
    return null;
  }

  try {
    return document.getElementById(cleanId);
  } catch {
    return null;
  }
}

function query(selector = "", root = null) {
  if (!hasDocument()) {
    return null;
  }

  const cleanSelector = safeText(selector, "");

  if (!cleanSelector) {
    return null;
  }

  try {
    return (root || document).querySelector(cleanSelector);
  } catch {
    return null;
  }
}

function queryAll(selector = "", root = null) {
  if (!hasDocument()) {
    return [];
  }

  const cleanSelector = safeText(selector, "");

  if (!cleanSelector) {
    return [];
  }

  try {
    return Array.from((root || document).querySelectorAll(cleanSelector));
  } catch {
    return [];
  }
}

function queryFirst(selectors = [], root = null) {
  for (const selector of selectors) {
    const element = query(selector, root);

    if (element) {
      return element;
    }
  }

  return null;
}

function queryFirstGlobalThenLocal(selectors = [], root = null) {
  for (const selector of selectors) {
    const globalMatch = query(selector);

    if (globalMatch) {
      return globalMatch;
    }

    const localMatch = root ? query(selector, root) : null;

    if (localMatch) {
      return localMatch;
    }
  }

  return null;
}

function setHidden(element = null, hidden = false) {
  if (!element) {
    return false;
  }

  try {
    element.hidden = Boolean(hidden);
  } catch {}

  try {
    element.setAttribute(
      "aria-hidden",
      hidden ? "true" : "false"
    );
  } catch {}

  return true;
}

function removeTooltipAttributes(element = null) {
  if (!element) {
    return false;
  }

  try {
    element.removeAttribute("title");
    element.removeAttribute("data-tooltip");
    element.removeAttribute("data-i18n-data-tooltip");
    element.removeAttribute("aria-describedby");
  } catch {}

  return true;
}

function toFragment(html = "") {
  if (!hasDocument()) {
    return null;
  }

  const template = document.createElement("template");
  template.innerHTML = String(html || "").trim();

  return template.content;
}

/* =========================================================
   SPECIAL RESOLVERS
========================================================= */

function resolveSidebarRoot() {
  return queryFirstGlobalThenLocal(SIDEBAR_SELECTORS) || null;
}

function resolveControlledDropdownFromToggle(userToggle = null, sidebar = null) {
  if (!userToggle) {
    return null;
  }

  const controls = safeText(
    userToggle.getAttribute?.("aria-controls") ||
      userToggle.dataset?.controls ||
      userToggle.dataset?.target ||
      userToggle.dataset?.dropdownTarget ||
      "",
    ""
  );

  if (!controls) {
    return null;
  }

  const controlled =
    byId(controls) ||
    query(`#${CSS.escape ? CSS.escape(controls) : controls}`, sidebar) ||
    query(`#${CSS.escape ? CSS.escape(controls) : controls}`);

  return controlled || null;
}

function resolveUserToggle(sidebar = null) {
  const toggle =
    queryFirstGlobalThenLocal(USER_TOGGLE_SELECTORS, sidebar);

  if (toggle) {
    return toggle;
  }

  /*
    Fallback final:
    botón dentro del footer que controle un dropdown mediante aria-expanded.
  */
  return (
    query(
      [
        ".sidebar-footer button[aria-expanded]",
        "[data-sidebar-footer] button[aria-expanded]",
        ".sidebar-footer [role='button'][aria-expanded]",
        "[data-sidebar-footer] [role='button'][aria-expanded]",
      ].join(","),
      sidebar
    ) || null
  );
}

function resolveUserDropdown(sidebar = null, userToggle = null) {
  const byControl =
    resolveControlledDropdownFromToggle(userToggle, sidebar);

  if (byControl) {
    return byControl;
  }

  const dropdown =
    queryFirstGlobalThenLocal(USER_DROPDOWN_SELECTORS, sidebar);

  if (dropdown) {
    return dropdown;
  }

  /*
    Fallback final:
    menú cercano dentro del footer.
  */
  return (
    query(
      [
        ".sidebar-footer [role='menu']",
        "[data-sidebar-footer] [role='menu']",
        ".sidebar-footer .dropdown-menu",
        "[data-sidebar-footer] .dropdown-menu",
      ].join(","),
      sidebar
    ) || null
  );
}

/* =========================================================
   SHELL HELPERS
========================================================= */

export function getSidebarMountEl(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  return (
    AppCore?.dom?.sidebarMount ||
    byId(SIDEBAR_MOUNT_ID) ||
    query("[data-sidebar-mount]") ||
    null
  );
}

export function getMainContentEl(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  /*
    Importante:
    NO usar viewContainer como mainContent.
    El sidebar jamás debe montarse pegado a #view-container.
  */
  return (
    AppCore?.dom?.mainContent ||
    AppCore?.dom?.main ||
    byId("main-content") ||
    query("#main-content") ||
    query(".main-content") ||
    query("main[role='main']") ||
    query("main") ||
    null
  );
}

export function getAppShellEl(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  return (
    AppCore?.dom?.appShell ||
    AppCore?.dom?.shell ||
    AppCore?.dom?.layout ||
    byId("app-shell") ||
    query("[data-app-shell='true']") ||
    query("[data-app-shell]") ||
    query(".app-shell") ||
    query(".layout") ||
    document.body ||
    null
  );
}

export function getViewContainerEl(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  return (
    AppCore?.dom?.viewContainer ||
    byId("view-container") ||
    query("[data-view-root]") ||
    null
  );
}

/* =========================================================
   TOOLTIP SANITIZE
========================================================= */

export function sanitizeLogoTooltipState(AppCore) {
  const { sidebar, logoEl } = getElements(AppCore);

  const logo =
    logoEl ||
    byId(SIDEBAR_LOGO_ID) ||
    queryFirst(LOGO_SELECTORS, sidebar);

  if (!logo) {
    return false;
  }

  removeTooltipAttributes(logo);

  queryAll(
    "[data-tooltip], [data-i18n-data-tooltip], [title], [aria-describedby]",
    logo
  ).forEach((element) => {
    removeTooltipAttributes(element);
  });

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

  if (!sidebar) {
    return false;
  }

  [
    userToggle,
    userDropdown,
    avatarEl,
    nameEl,
  ].forEach((element) => {
    removeTooltipAttributes(element);
  });

  queryAll(
    [
      ".sidebar-footer [data-tooltip]",
      ".sidebar-footer [data-i18n-data-tooltip]",
      ".sidebar-footer [title]",
      ".sidebar-footer [aria-describedby]",
      "[data-sidebar-footer] [data-tooltip]",
      "[data-sidebar-footer] [data-i18n-data-tooltip]",
      "[data-sidebar-footer] [title]",
      "[data-sidebar-footer] [aria-describedby]",
    ].join(","),
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

function appendSidebarHtml(target, html = "", mode = "append") {
  if (!target || !hasDocument()) {
    return false;
  }

  const fragment = toFragment(html);

  if (!fragment) {
    return false;
  }

  try {
    if (mode === "replace") {
      target.replaceChildren(fragment);
      return true;
    }

    if (mode === "prepend") {
      target.prepend(fragment);
      return true;
    }

    target.appendChild(fragment);
    return true;
  } catch {
    return false;
  }
}

export function mountSidebar(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  const dom = ensureDomBag(AppCore);

  let sidebar = byId(SIDEBAR_ROOT_ID) || resolveSidebarRoot();

  if (sidebar) {
    cacheDomRefs(AppCore);
    sanitizeSidebarTooltipState(AppCore);
    return sidebar;
  }

  const html = getSidebarTemplate();

  const mount = getSidebarMountEl(AppCore);
  const appShell = getAppShellEl(AppCore);
  const mainContent = getMainContentEl(AppCore);

  /*
    Orden correcto:
    1. #sidebar-mount si existe.
    2. app-shell antes del main.
    3. app-shell prepend.
    4. body prepend.
  */
  if (mount) {
    appendSidebarHtml(mount, html, "replace");
  } else if (appShell && mainContent && mainContent.parentElement === appShell) {
    try {
      mainContent.insertAdjacentHTML("beforebegin", html);
    } catch {
      appendSidebarHtml(appShell, html, "prepend");
    }
  } else if (appShell) {
    appendSidebarHtml(appShell, html, "prepend");
  } else {
    appendSidebarHtml(document.body, html, "prepend");
  }

  sidebar = byId(SIDEBAR_ROOT_ID) || resolveSidebarRoot();

  if (dom) {
    dom.sidebarMount = mount || byId(SIDEBAR_MOUNT_ID) || null;
  }

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

  if (!dom) {
    return null;
  }

  const body = document.body || null;

  const sidebarMount =
    byId(SIDEBAR_MOUNT_ID) ||
    query("[data-sidebar-mount]") ||
    null;

  const sidebar =
    byId(SIDEBAR_ROOT_ID) ||
    resolveSidebarRoot();

  const sidebarMenu =
    byId(SIDEBAR_MENU_ID) ||
    queryFirst(SIDEBAR_MENU_SELECTORS, sidebar) ||
    queryFirst(SIDEBAR_MENU_SELECTORS) ||
    null;

  const sidebarRecents =
    byId(SIDEBAR_RECENTS_ID) ||
    queryFirst(SIDEBAR_RECENTS_SELECTORS, sidebar) ||
    null;

  const sidebarToggle =
    byId(SIDEBAR_TOGGLE_ID) ||
    queryFirst(SIDEBAR_TOGGLE_SELECTORS, sidebar) ||
    null;

  const mobileToggleBtn =
    byId(SIDEBAR_MOBILE_TOGGLE_ID) ||
    queryFirst(SIDEBAR_MOBILE_TOGGLE_SELECTORS, sidebar) ||
    null;

  const userToggle =
    byId(USER_TOGGLE_ID) ||
    resolveUserToggle(sidebar) ||
    null;

  const userDropdown =
    byId(USER_DROPDOWN_ID) ||
    resolveUserDropdown(sidebar, userToggle) ||
    null;

  const logoutBtn =
    byId(LOGOUT_BUTTON_ID) ||
    queryFirst(LOGOUT_SELECTORS, sidebar) ||
    null;

  const avatarEl =
    byId(SIDEBAR_AVATAR_ID) ||
    queryFirst(AVATAR_SELECTORS, sidebar) ||
    null;

  const nameEl =
    byId(SIDEBAR_NAME_ID) ||
    queryFirst(NAME_SELECTORS, sidebar) ||
    null;

  const logoEl =
    byId(SIDEBAR_LOGO_ID) ||
    queryFirst(LOGO_SELECTORS, sidebar) ||
    null;

  const appShell = getAppShellEl(AppCore);
  const mainContent = getMainContentEl(AppCore);
  const viewContainer = getViewContainerEl(AppCore);

  dom.body = body;

  dom.appShell = appShell || null;
  dom.shell = appShell || null;
  dom.layout = appShell || null;

  dom.mainContent = mainContent || null;
  dom.main = mainContent || null;
  dom.viewContainer = viewContainer || null;

  dom.sidebarMount = sidebarMount || null;
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

    appShell: dom.appShell,
    shell: dom.shell,
    layout: dom.layout,
    mainContent: dom.mainContent,
    viewContainer: dom.viewContainer,

    sidebarMount: dom.sidebarMount,
    sidebar: dom.sidebar,
    sidebarMenu: dom.sidebarMenu,
    sidebarRecents: dom.sidebarRecents,

    sidebarToggle: dom.sidebarToggle,
    toggleBtn: dom.sidebarToggle,

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

      appShell: null,
      shell: null,
      layout: null,
      mainContent: null,
      viewContainer: null,

      sidebarMount: null,
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
    resolveSidebarRoot() ||
    null;

  const userToggle =
    cached.userToggle ||
    dom.userToggle ||
    byId(USER_TOGGLE_ID) ||
    resolveUserToggle(sidebar) ||
    null;

  const userDropdown =
    cached.userDropdown ||
    dom.userDropdown ||
    byId(USER_DROPDOWN_ID) ||
    resolveUserDropdown(sidebar, userToggle) ||
    null;

  return {
    body:
      cached.body ||
      dom.body ||
      document.body ||
      null,

    appShell:
      cached.appShell ||
      dom.appShell ||
      dom.shell ||
      dom.layout ||
      getAppShellEl(AppCore) ||
      null,

    shell:
      cached.shell ||
      dom.shell ||
      dom.appShell ||
      dom.layout ||
      getAppShellEl(AppCore) ||
      null,

    layout:
      cached.layout ||
      dom.layout ||
      dom.appShell ||
      dom.shell ||
      getAppShellEl(AppCore) ||
      null,

    mainContent:
      cached.mainContent ||
      dom.mainContent ||
      dom.main ||
      getMainContentEl(AppCore) ||
      null,

    viewContainer:
      cached.viewContainer ||
      dom.viewContainer ||
      getViewContainerEl(AppCore) ||
      null,

    sidebarMount:
      cached.sidebarMount ||
      dom.sidebarMount ||
      getSidebarMountEl(AppCore) ||
      null,

    sidebar,

    sidebarMenu:
      cached.sidebarMenu ||
      dom.sidebarMenu ||
      byId(SIDEBAR_MENU_ID) ||
      queryFirst(SIDEBAR_MENU_SELECTORS, sidebar) ||
      queryFirst(SIDEBAR_MENU_SELECTORS) ||
      null,

    sidebarRecents:
      cached.sidebarRecents ||
      dom.sidebarRecents ||
      byId(SIDEBAR_RECENTS_ID) ||
      queryFirst(SIDEBAR_RECENTS_SELECTORS, sidebar) ||
      null,

    toggleBtn:
      cached.toggleBtn ||
      cached.sidebarToggle ||
      dom.sidebarToggle ||
      byId(SIDEBAR_TOGGLE_ID) ||
      queryFirst(SIDEBAR_TOGGLE_SELECTORS, sidebar) ||
      null,

    mobileToggleBtn:
      cached.mobileToggleBtn ||
      dom.sidebarMobileToggle ||
      dom.mobileSidebarToggle ||
      byId(SIDEBAR_MOBILE_TOGGLE_ID) ||
      queryFirst(SIDEBAR_MOBILE_TOGGLE_SELECTORS, sidebar) ||
      null,

    userToggle,

    userDropdown,

    logoutBtn:
      cached.logoutBtn ||
      dom.logoutBtn ||
      byId(LOGOUT_BUTTON_ID) ||
      queryFirst(LOGOUT_SELECTORS, sidebar) ||
      null,

    avatarEl:
      cached.avatarEl ||
      dom.sidebarAvatar ||
      byId(SIDEBAR_AVATAR_ID) ||
      queryFirst(AVATAR_SELECTORS, sidebar) ||
      null,

    nameEl:
      cached.nameEl ||
      dom.sidebarName ||
      byId(SIDEBAR_NAME_ID) ||
      queryFirst(NAME_SELECTORS, sidebar) ||
      null,

    logoEl:
      cached.logoEl ||
      dom.sidebarLogo ||
      byId(SIDEBAR_LOGO_ID) ||
      queryFirst(LOGO_SELECTORS, sidebar) ||
      null,
  };
}

export function hasSidebarShell(AppCore) {
  const { sidebar } = getElements(AppCore);

  return Boolean(sidebar);
}

export function isShellHidden(AppCore) {
  if (!hasDocument()) {
    return false;
  }

  const {
    body,
    appShell,
    shell,
    sidebar,
  } = getElements(AppCore);

  return Boolean(
    body?.classList?.contains?.("route-shell-hidden") ||
      body?.classList?.contains?.("auth-screen") ||
      body?.dataset?.shell === "hidden" ||
      document.documentElement?.dataset?.shell === "hidden" ||
      appShell?.classList?.contains?.("route-shell-hidden") ||
      shell?.classList?.contains?.("route-shell-hidden") ||
      sidebar?.hidden === true ||
      AppCore?.state?.shellVisible === false
  );
}

/* =========================================================
   VISIBILITY HELPERS
========================================================= */

export function setSidebarHidden(AppCore, hidden = false) {
  const {
    sidebar,
    sidebarMenu,
    sidebarRecents,
    toggleBtn,
    mobileToggleBtn,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  [
    sidebar,
    sidebarMenu,
    sidebarRecents,
    toggleBtn,
    mobileToggleBtn,
    userToggle,
    userDropdown,
  ].forEach((element) => {
    if (element === sidebarMenu || element === sidebarRecents) {
      return;
    }

    setHidden(element, hidden);
  });

  return true;
}

/* =========================================================
   FOCUS / A11Y HELPERS
========================================================= */

export function blurIfInside(element) {
  if (!hasDocument()) {
    return false;
  }

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
  if (!root) {
    return false;
  }

  try {
    const target = root.querySelector(
      [
        "a[href]:not([hidden]):not([aria-hidden='true'])",
        "button:not([disabled]):not([hidden]):not([aria-hidden='true'])",
        "input:not([disabled]):not([hidden]):not([aria-hidden='true'])",
        "select:not([disabled]):not([hidden]):not([aria-hidden='true'])",
        "textarea:not([disabled]):not([hidden]):not([aria-hidden='true'])",
        "[tabindex]:not([tabindex='-1']):not([hidden]):not([aria-hidden='true'])",
      ].join(",")
    );

    if (target && typeof target.focus === "function") {
      target.focus({
        preventScroll: true,
      });

      return true;
    }
  } catch {
    try {
      const fallback = root.querySelector("a[href], button, [tabindex]");

      fallback?.focus?.();
      return Boolean(fallback);
    } catch {}
  }

  return false;
}

export function focusSidebar(AppCore) {
  const { sidebar } = getElements(AppCore);

  if (!sidebar) {
    return false;
  }

  try {
    if (!sidebar.hasAttribute("tabindex")) {
      sidebar.setAttribute("tabindex", "-1");
    }

    sidebar.focus({
      preventScroll: true,
    });

    return true;
  } catch {
    return focusFirstInteractive(sidebar);
  }
}

/* =========================================================
   DEBUG
========================================================= */

function getElementDebug(element = null) {
  if (!isElement(element)) {
    return null;
  }

  return {
    id: element.id || "",
    tag: element.tagName || "",
    hidden: Boolean(element.hidden),
    inert: Boolean(element.hasAttribute?.("inert")),
    ariaHidden: element.getAttribute?.("aria-hidden") || "",
    ariaExpanded: element.getAttribute?.("aria-expanded") || "",
    ariaControls: element.getAttribute?.("aria-controls") || "",
    className: element.className || "",
    dataAction:
      element.getAttribute?.("data-action") ||
      element.getAttribute?.("data-sidebar-action") ||
      "",
    parentHidden: Boolean(
      element.closest?.("[hidden],[inert],[aria-hidden='true']")
    ),
  };
}

export function getSidebarDomSnapshot(AppCore) {
  const elements = getElements(AppCore);

  return {
    hasDocument: hasDocument(),

    hasSidebarMount: Boolean(elements.sidebarMount),
    hasSidebar: Boolean(elements.sidebar),
    hasSidebarMenu: Boolean(elements.sidebarMenu),
    hasSidebarRecents: Boolean(elements.sidebarRecents),

    hasToggle: Boolean(elements.toggleBtn),
    hasMobileToggle: Boolean(elements.mobileToggleBtn),

    hasUserToggle: Boolean(elements.userToggle),
    hasUserDropdown: Boolean(elements.userDropdown),
    hasLogoutBtn: Boolean(elements.logoutBtn),

    hasAvatar: Boolean(elements.avatarEl),
    hasName: Boolean(elements.nameEl),
    hasLogo: Boolean(elements.logoEl),

    hasAppShell: Boolean(elements.appShell),
    hasMainContent: Boolean(elements.mainContent),
    hasViewContainer: Boolean(elements.viewContainer),

    shellHidden: isShellHidden(AppCore),

    sidebarHidden: Boolean(elements.sidebar?.hidden),
    sidebarClasses: elements.sidebar?.className || "",
    bodyClasses: elements.body?.className || "",

    userToggle: getElementDebug(elements.userToggle),
    userDropdown: getElementDebug(elements.userDropdown),
    logoutBtn: getElementDebug(elements.logoutBtn),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getSidebarMountEl,
  getMainContentEl,
  getAppShellEl,
  getViewContainerEl,

  mountSidebar,
  cacheDomRefs,
  getElements,

  hasSidebarShell,
  isShellHidden,
  setSidebarHidden,

  blurIfInside,
  focusFirstInteractive,
  focusSidebar,

  sanitizeLogoTooltipState,
  sanitizeFooterTooltipState,
  sanitizeSidebarTooltipState,

  getSidebarDomSnapshot,
};
