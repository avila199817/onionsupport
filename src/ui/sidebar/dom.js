/* =========================================================
   Onion SPA - Sidebar DOM
   Archivo: src/ui/sidebar/dom.js

   FINAL EXTREME SYSTEM · SIDEBAR DOM · RACE SAFE · 10/10

   Responsabilidades:
   - montar el HTML del sidebar en el shell
   - priorizar #sidebar-mount cuando existe
   - cachear referencias DOM en AppCore de forma segura
   - resolver elementos internos solo dentro del sidebar
   - permitir toggles externos controlados si viven fuera del sidebar
   - evitar resolver nodos transitorios de vistas durante router render
   - detectar shell / main content sin confundirlo con #view-container
   - helpers de foco
   - sanear tooltips del footer/logo del sidebar
   - rehidratar refs tras mount dinámico
   - mantener compatibilidad con AppCore.dom
   - resolver dropdown de usuario aunque cambien IDs/data/classes
   - soportar aria-controls entre toggle y dropdown
   - no duplicar sidebar
   - no romper si document/window no existen

   FIX CRÍTICO RACE:
   - no usa selectores genéricos globales para elementos internos
   - valida node.isConnected antes de reutilizar cache
   - getElements() no captura navs/logos/dropdowns de una vista
   - mountSidebar() no reemplaza mount si ya contiene sidebar válido
   - no monta nunca dentro de #view-container
   - deduplica sidebars duplicados si un repair anterior dejó clones
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

const DOM_CACHE_VERSION = "sidebar-dom-v5-race-safe";

/* =========================================================
   SELECTOR FALLBACKS
========================================================= */

const VIEW_CONTAINER_SELECTORS = [
  "#view-container",
  "[data-view-root]",
  "[data-router-view]",
  "[data-view-container]",
];

const APP_SHELL_SELECTORS = [
  "#app-shell",
  "[data-app-shell='true']",
  "[data-app-shell]",
  ".app-shell",
  ".app-layout",
  ".layout-shell",
  ".layout",
];

const MAIN_CONTENT_SELECTORS = [
  "#main-content",
  ".main-content",
  "main[role='main']",
  "main:not(#view-container)",
  "[data-main-content]",
  "[data-app-main]",
];

const SIDEBAR_SELECTORS = [
  `#${SIDEBAR_ROOT_ID}`,
  "aside.sidebar",
  ".sidebar[data-sidebar-root='true']",
  ".sidebar[data-sidebar-root]",
  "[data-sidebar-root='true']",
  "[data-sidebar-root]",
  "[data-sidebar='true']",
];

const SIDEBAR_MENU_SELECTORS = [
  `#${SIDEBAR_MENU_ID}`,
  ".sidebar-menu",
  "[data-sidebar-menu]",
  "nav.sidebar-menu",
];

const SIDEBAR_RECENTS_SELECTORS = [
  `#${SIDEBAR_RECENTS_ID}`,
  ".sidebar-recents",
  "[data-sidebar-recents]",
  "[data-sidebar-recent]",
];

const SIDEBAR_TOGGLE_SELECTORS = [
  `#${SIDEBAR_TOGGLE_ID}`,
  ".sidebar-toggle",
  "[data-sidebar-action='toggle-sidebar']",
  "[data-sidebar-action='sidebar-toggle']",
  "[data-sidebar-toggle]",
  "[data-action='toggle-sidebar']",
  "[data-action='sidebar-toggle']",
];

const SIDEBAR_MOBILE_TOGGLE_SELECTORS = [
  `#${SIDEBAR_MOBILE_TOGGLE_ID}`,
  ".sidebar-mobile-toggle",
  "[data-sidebar-mobile-toggle]",
  "[data-sidebar-action='mobile-sidebar-toggle']",
  "[data-sidebar-action='toggle-mobile-sidebar']",
  "[data-action='mobile-sidebar-toggle']",
  "[data-action='toggle-mobile-sidebar']",
];

const USER_TOGGLE_SELECTORS = [
  `#${USER_TOGGLE_ID}`,
  "#sidebarUserToggle",
  "#sidebar-user-toggle",
  "#sidebarUserMenuToggle",
  "#sidebar-user-menu-toggle",
  "#userToggle",
  "#user-toggle",

  ".user[role='button']",
  ".sidebar-user-toggle",
  ".sidebar-user__toggle",
  ".sidebar-footer-user-toggle",
  ".sidebar-footer__user-toggle",
  ".user-toggle",
  ".user-menu-toggle",

  "[data-sidebar-action='toggle-user-dropdown']",
  "[data-sidebar-action='toggle-user-menu']",
  "[data-sidebar-action='user-toggle']",
  "[data-sidebar-action='user-dropdown']",
  "[data-sidebar-user-toggle]",
  "[data-user-toggle]",
  "[data-user-menu-toggle]",
  "[data-dropdown-toggle='user']",
  "[data-dropdown-target='user']",

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

  ".user-dropdown",
  ".user-menu",
  ".sidebar-user-dropdown",
  ".sidebar-user-menu",
  ".sidebar-user__dropdown",
  ".sidebar-user__menu",
  ".sidebar-footer-user-dropdown",
  ".sidebar-footer-user-menu",
  ".sidebar-footer__user-dropdown",
  ".sidebar-footer__user-menu",

  "[data-user-dropdown]",
  "[data-user-menu]",
  "[data-sidebar-user-dropdown]",
  "[data-sidebar-user-menu]",
  "[data-dropdown='user']",
  "[data-dropdown-menu='user']",
  "[data-sidebar-dropdown='user']",
];

const LOGOUT_SELECTORS = [
  `#${LOGOUT_BUTTON_ID}`,
  "#logoutBtn",
  "#logoutButton",
  "#sidebarLogout",
  "#sidebar-logout",

  ".sidebar-logout",
  ".logout-button",
  ".logout-btn",

  "[data-sidebar-action='logout']",
  "[data-action='logout']",
  "[data-logout]",
  "[data-sidebar-logout]",
];

const AVATAR_SELECTORS = [
  `#${SIDEBAR_AVATAR_ID}`,
  "#sidebarAvatar",
  "#sidebar-avatar",
  ".avatar[data-avatar-root='true']",
  ".sidebar-avatar",
  ".sidebar-user-avatar",
  "[data-sidebar-avatar]",
  "[data-user-avatar]",
];

const NAME_SELECTORS = [
  `#${SIDEBAR_NAME_ID}`,
  "#sidebarName",
  "#sidebar-name",
  "#sidebarUserName",
  "#sidebar-user-name",
  ".sidebar-name",
  ".sidebar-user-name",
  ".user-info .name",
  "[data-sidebar-name]",
  "[data-user-name]",
];

const LOGO_SELECTORS = [
  `#${SIDEBAR_LOGO_ID}`,
  "#sidebarLogo",
  "#sidebar-logo",
  "a.logo",
  ".logo",
  ".sidebar-logo",
  "[data-sidebar-logo]",
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

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
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

function isConnectedNode(value = null) {
  if (!isElement(value)) {
    return false;
  }

  try {
    return value.isConnected !== false;
  } catch {
    return true;
  }
}

function ensureDomBag(AppCore) {
  if (!AppCore || typeof AppCore !== "object") {
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
    const element = document.getElementById(cleanId);

    return isConnectedNode(element) ? element : null;
  } catch {
    return null;
  }
}

function escapeCssIdent(value = "") {
  const text = safeText(value, "");

  if (!text) {
    return "";
  }

  try {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(text);
    }
  } catch {}

  return text.replace(/["\\#.:,[\]>+~*=|^$()\s]/g, "\\$&");
}

function containsElement(parent = null, child = null) {
  if (!parent || !child) {
    return false;
  }

  try {
    return parent === child || parent.contains(child);
  } catch {
    return false;
  }
}

function isViewContainer(element = null) {
  if (!isElement(element)) {
    return false;
  }

  try {
    return Boolean(
      element.id === "view-container" ||
        element.matches?.(VIEW_CONTAINER_SELECTORS.join(","))
    );
  } catch {
    return false;
  }
}

function isInsideViewContainer(element = null) {
  if (!isElement(element)) {
    return false;
  }

  try {
    return Boolean(
      isViewContainer(element) ||
        element.closest?.(VIEW_CONTAINER_SELECTORS.join(","))
    );
  } catch {
    return false;
  }
}

function isUnsafeMountTarget(element = null) {
  if (!isElement(element)) {
    return true;
  }

  if (!isConnectedNode(element)) {
    return true;
  }

  return isInsideViewContainer(element);
}

function query(selector = "", root = null) {
  if (!hasDocument()) {
    return null;
  }

  const cleanSelector = safeText(selector, "");

  if (!cleanSelector) {
    return null;
  }

  const scope = root && isConnectedNode(root)
    ? root
    : document;

  try {
    const element = scope.querySelector(cleanSelector);

    return isConnectedNode(element) ? element : null;
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

  const scope = root && isConnectedNode(root)
    ? root
    : document;

  try {
    return Array.from(scope.querySelectorAll(cleanSelector))
      .filter(isConnectedNode);
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

function queryFirstDocument(selectors = []) {
  return queryFirst(selectors, document);
}

function queryFirstInsideSidebar(selectors = [], sidebar = null) {
  if (!sidebar || !isConnectedNode(sidebar)) {
    return null;
  }

  return queryFirst(selectors, sidebar);
}

function getCachedElement(AppCore, key = "") {
  const dom = AppCore?.dom;

  if (!dom || typeof dom !== "object") {
    return null;
  }

  const element = dom[key];

  return isConnectedNode(element) ? element : null;
}

function getScopedId(id = "", root = null) {
  const element = byId(id);

  if (!element) {
    return null;
  }

  if (root && !containsElement(root, element)) {
    return null;
  }

  return element;
}

function resolveScopedElement(id = "", selectors = [], root = null) {
  if (!root || !isConnectedNode(root)) {
    return null;
  }

  return (
    getScopedId(id, root) ||
    queryFirstInsideSidebar(selectors, root) ||
    null
  );
}

function resolveSafeDocumentControl(id = "", selectors = [], AppCore = null) {
  /*
    Usado solo para controles que pueden vivir fuera del sidebar
    —por ejemplo el toggle mobile en topbar—.
    Nunca aceptamos controles dentro de #view-container.
  */
  const appShell = getAppShellEl(AppCore);
  const root = appShell && !isUnsafeMountTarget(appShell)
    ? appShell
    : document;

  const byIdResult = byId(id);

  if (byIdResult && !isInsideViewContainer(byIdResult)) {
    return byIdResult;
  }

  for (const selector of selectors) {
    const element = query(selector, root);

    if (element && !isInsideViewContainer(element)) {
      return element;
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

  try {
    const template = document.createElement("template");
    template.innerHTML = String(html || "").trim();

    return template.content;
  } catch {
    return null;
  }
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

/* =========================================================
   SPECIAL RESOLVERS
========================================================= */

function isSidebarCandidate(element = null) {
  if (!isConnectedNode(element)) {
    return false;
  }

  if (isInsideViewContainer(element)) {
    return false;
  }

  try {
    return Boolean(
      element.id === SIDEBAR_ROOT_ID ||
        element.matches?.(SIDEBAR_SELECTORS.join(","))
    );
  } catch {
    return false;
  }
}

function resolveSidebarRoot(AppCore = null) {
  const cached =
    getCachedElement(AppCore, "sidebar") ||
    getCachedElement(AppCore, "sidebarRoot");

  if (isSidebarCandidate(cached)) {
    return cached;
  }

  const idMatch = byId(SIDEBAR_ROOT_ID);

  if (isSidebarCandidate(idMatch)) {
    return idMatch;
  }

  const candidates = queryAll(SIDEBAR_SELECTORS.join(","), document)
    .filter(isSidebarCandidate);

  return candidates[0] || null;
}

function getAllSidebarRoots() {
  if (!hasDocument()) {
    return [];
  }

  const items = queryAll(SIDEBAR_SELECTORS.join(","), document)
    .filter(isSidebarCandidate);

  return Array.from(new Set(items));
}

function cleanupDuplicateSidebars(primary = null) {
  if (!primary || !hasDocument()) {
    return false;
  }

  const roots = getAllSidebarRoots();
  let removed = false;

  roots.forEach((candidate) => {
    if (!candidate || candidate === primary) {
      return;
    }

    /*
      Solo eliminamos clones inequívocos del sidebar.
      No tocamos nodos que no parezcan raíz real del sidebar.
    */
    const sameHardId = candidate.id === SIDEBAR_ROOT_ID;
    const markedRoot =
      candidate.getAttribute?.("data-sidebar-root") !== null ||
      candidate.getAttribute?.("data-sidebar") === "true";

    if (!sameHardId && !markedRoot) {
      return;
    }

    try {
      candidate.remove();
      removed = true;
    } catch {}
  });

  return removed;
}

function resolveControlledDropdownFromToggle(userToggle = null, sidebar = null) {
  if (!userToggle || !sidebar) {
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

  const escaped = escapeCssIdent(controls);

  const controlled =
    getScopedId(controls, sidebar) ||
    query(`#${escaped}`, sidebar) ||
    null;

  if (!controlled) {
    return null;
  }

  if (!containsElement(sidebar, controlled)) {
    return null;
  }

  return controlled;
}

function resolveUserToggle(sidebar = null) {
  const local = queryFirstInsideSidebar(USER_TOGGLE_SELECTORS, sidebar);

  if (local) {
    return local;
  }

  /*
    Fallback controlado:
    solo dentro del sidebar.
    Nunca global, porque una vista puede tener .user-toggle o role button.
  */
  return query(
    [
      ".sidebar-footer button[aria-expanded]",
      ".sidebar-footer [role='button'][aria-expanded]",
      "[data-sidebar-footer] button[aria-expanded]",
      "[data-sidebar-footer] [role='button'][aria-expanded]",
    ].join(","),
    sidebar
  );
}

function resolveUserDropdown(sidebar = null, userToggle = null) {
  const byControl = resolveControlledDropdownFromToggle(userToggle, sidebar);

  if (byControl) {
    return byControl;
  }

  const local = queryFirstInsideSidebar(USER_DROPDOWN_SELECTORS, sidebar);

  if (local) {
    return local;
  }

  /*
    Fallback final:
    menú cercano dentro del footer.
  */
  return query(
    [
      ".sidebar-footer [role='menu']",
      ".sidebar-footer .dropdown-menu",
      "[data-sidebar-footer] [role='menu']",
      "[data-sidebar-footer] .dropdown-menu",
    ].join(","),
    sidebar
  );
}

/* =========================================================
   SHELL HELPERS
========================================================= */

export function getSidebarMountEl(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  const cached = getCachedElement(AppCore, "sidebarMount");

  if (cached && !isUnsafeMountTarget(cached)) {
    return cached;
  }

  const mount =
    byId(SIDEBAR_MOUNT_ID) ||
    query("[data-sidebar-mount]") ||
    null;

  return mount && !isUnsafeMountTarget(mount)
    ? mount
    : null;
}

export function getViewContainerEl(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  const cached = getCachedElement(AppCore, "viewContainer");

  if (cached && isViewContainer(cached)) {
    return cached;
  }

  return (
    byId("view-container") ||
    query("[data-view-root]") ||
    query("[data-router-view]") ||
    query("[data-view-container]") ||
    null
  );
}

export function getMainContentEl(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  const cached =
    getCachedElement(AppCore, "mainContent") ||
    getCachedElement(AppCore, "main");

  if (cached && !isViewContainer(cached) && !isInsideViewContainer(cached)) {
    return cached;
  }

  /*
    Importante:
    NO usar #view-container como mainContent.
    El sidebar jamás debe montarse pegado al view.
  */
  for (const selector of MAIN_CONTENT_SELECTORS) {
    const element = query(selector);

    if (element && !isViewContainer(element) && !isInsideViewContainer(element)) {
      return element;
    }
  }

  return null;
}

export function getAppShellEl(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  const cached =
    getCachedElement(AppCore, "appShell") ||
    getCachedElement(AppCore, "shell") ||
    getCachedElement(AppCore, "layout");

  if (cached && !isUnsafeMountTarget(cached)) {
    return cached;
  }

  for (const selector of APP_SHELL_SELECTORS) {
    const element = query(selector);

    if (element && !isUnsafeMountTarget(element)) {
      return element;
    }
  }

  return document.body || null;
}

/* =========================================================
   TOOLTIP SANITIZE
========================================================= */

export function sanitizeLogoTooltipState(AppCore) {
  const sidebar = resolveSidebarRoot(AppCore);

  if (!sidebar) {
    return false;
  }

  const logo =
    resolveScopedElement(SIDEBAR_LOGO_ID, LOGO_SELECTORS, sidebar);

  if (!logo || !containsElement(sidebar, logo)) {
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
  const sidebar = resolveSidebarRoot(AppCore);

  if (!sidebar) {
    return false;
  }

  const userToggle = resolveUserToggle(sidebar);
  const userDropdown = resolveUserDropdown(sidebar, userToggle);

  const avatarEl =
    resolveScopedElement(SIDEBAR_AVATAR_ID, AVATAR_SELECTORS, sidebar);

  const nameEl =
    resolveScopedElement(SIDEBAR_NAME_ID, NAME_SELECTORS, sidebar);

  [
    userToggle,
    userDropdown,
    avatarEl,
    nameEl,
  ].forEach((element) => {
    if (element && containsElement(sidebar, element)) {
      removeTooltipAttributes(element);
    }
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

  if (isUnsafeMountTarget(target)) {
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

function insertSidebarBeforeMain(appShell = null, mainContent = null, html = "") {
  if (!appShell || !mainContent || !html) {
    return false;
  }

  if (isUnsafeMountTarget(appShell) || isViewContainer(mainContent)) {
    return false;
  }

  if (mainContent.parentElement !== appShell) {
    return false;
  }

  try {
    mainContent.insertAdjacentHTML("beforebegin", html);
    return true;
  } catch {
    return appendSidebarHtml(appShell, html, "prepend");
  }
}

export function mountSidebar(AppCore) {
  if (!hasDocument()) {
    return null;
  }

  const dom = ensureDomBag(AppCore);

  let sidebar = resolveSidebarRoot(AppCore);

  if (sidebar) {
    cleanupDuplicateSidebars(sidebar);
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
    1. #sidebar-mount si existe y no es #view-container.
    2. app-shell antes del main.
    3. app-shell prepend.
    4. body prepend.

    Importante:
    Si #sidebar-mount existe pero contiene sidebar válido,
    no se reemplaza. Evita carreras con reparaciones de UI.
  */
  if (mount && !isUnsafeMountTarget(mount)) {
    const existingInMount = queryFirst(SIDEBAR_SELECTORS, mount);

    if (!existingInMount) {
      appendSidebarHtml(mount, html, "replace");
    }
  } else if (
    appShell &&
    !isUnsafeMountTarget(appShell) &&
    mainContent &&
    mainContent.parentElement === appShell
  ) {
    insertSidebarBeforeMain(appShell, mainContent, html);
  } else if (appShell && !isUnsafeMountTarget(appShell)) {
    appendSidebarHtml(appShell, html, "prepend");
  } else if (document.body && !isUnsafeMountTarget(document.body)) {
    appendSidebarHtml(document.body, html, "prepend");
  }

  sidebar = resolveSidebarRoot(AppCore);

  if (sidebar) {
    cleanupDuplicateSidebars(sidebar);
  }

  if (dom) {
    dom.__sidebarDomCacheVersion = DOM_CACHE_VERSION;
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
    getSidebarMountEl(AppCore) ||
    null;

  const sidebar =
    resolveSidebarRoot(AppCore);

  /*
    Sin sidebar no cacheamos elementos internos genéricos.
    Esto evita capturar navegación, logo o dropdown de una vista.
  */
  const sidebarMenu = sidebar
    ? resolveScopedElement(SIDEBAR_MENU_ID, SIDEBAR_MENU_SELECTORS, sidebar)
    : null;

  const sidebarRecents = sidebar
    ? resolveScopedElement(SIDEBAR_RECENTS_ID, SIDEBAR_RECENTS_SELECTORS, sidebar)
    : null;

  /*
    Toggle desktop:
    - preferimos dentro del sidebar
    - permitimos control externo con ID/selectores seguros fuera del view
  */
  const sidebarToggle = sidebar
    ? (
        resolveScopedElement(SIDEBAR_TOGGLE_ID, SIDEBAR_TOGGLE_SELECTORS, sidebar) ||
        resolveSafeDocumentControl(SIDEBAR_TOGGLE_ID, SIDEBAR_TOGGLE_SELECTORS, AppCore)
      )
    : null;

  /*
    Toggle mobile:
    puede vivir en topbar, por eso se permite externo controlado.
  */
  const mobileToggleBtn = sidebar
    ? (
        resolveScopedElement(SIDEBAR_MOBILE_TOGGLE_ID, SIDEBAR_MOBILE_TOGGLE_SELECTORS, sidebar) ||
        resolveSafeDocumentControl(SIDEBAR_MOBILE_TOGGLE_ID, SIDEBAR_MOBILE_TOGGLE_SELECTORS, AppCore)
      )
    : null;

  const userToggle = sidebar
    ? (
        resolveScopedElement(USER_TOGGLE_ID, USER_TOGGLE_SELECTORS, sidebar) ||
        resolveUserToggle(sidebar)
      )
    : null;

  const userDropdown = sidebar
    ? (
        resolveScopedElement(USER_DROPDOWN_ID, USER_DROPDOWN_SELECTORS, sidebar) ||
        resolveUserDropdown(sidebar, userToggle)
      )
    : null;

  const logoutBtn = sidebar
    ? resolveScopedElement(LOGOUT_BUTTON_ID, LOGOUT_SELECTORS, sidebar)
    : null;

  const avatarEl = sidebar
    ? resolveScopedElement(SIDEBAR_AVATAR_ID, AVATAR_SELECTORS, sidebar)
    : null;

  const nameEl = sidebar
    ? resolveScopedElement(SIDEBAR_NAME_ID, NAME_SELECTORS, sidebar)
    : null;

  const logoEl = sidebar
    ? resolveScopedElement(SIDEBAR_LOGO_ID, LOGO_SELECTORS, sidebar)
    : null;

  const appShell = getAppShellEl(AppCore);
  const mainContent = getMainContentEl(AppCore);
  const viewContainer = getViewContainerEl(AppCore);

  dom.__sidebarDomCacheVersion = DOM_CACHE_VERSION;
  dom.__sidebarDomCachedAt = safeNow();

  dom.body = body;

  dom.appShell = appShell || null;
  dom.shell = appShell || null;
  dom.layout = appShell || null;

  dom.mainContent = mainContent || null;
  dom.main = mainContent || null;
  dom.viewContainer = viewContainer || null;

  dom.sidebarMount = sidebarMount || null;
  dom.sidebar = sidebar || null;
  dom.sidebarRoot = sidebar || null;

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
  const dom = safeObject(AppCore?.dom);

  const sidebar =
    cached.sidebar ||
    getCachedElement(AppCore, "sidebar") ||
    getCachedElement(AppCore, "sidebarRoot") ||
    resolveSidebarRoot(AppCore) ||
    null;

  const userToggle = sidebar
    ? (
        cached.userToggle ||
        getCachedElement(AppCore, "userToggle") ||
        resolveScopedElement(USER_TOGGLE_ID, USER_TOGGLE_SELECTORS, sidebar) ||
        resolveUserToggle(sidebar)
      )
    : null;

  const userDropdown = sidebar
    ? (
        cached.userDropdown ||
        getCachedElement(AppCore, "userDropdown") ||
        resolveScopedElement(USER_DROPDOWN_ID, USER_DROPDOWN_SELECTORS, sidebar) ||
        resolveUserDropdown(sidebar, userToggle)
      )
    : null;

  return {
    body:
      cached.body ||
      dom.body ||
      document.body ||
      null,

    appShell:
      cached.appShell ||
      getCachedElement(AppCore, "appShell") ||
      getCachedElement(AppCore, "shell") ||
      getCachedElement(AppCore, "layout") ||
      getAppShellEl(AppCore) ||
      null,

    shell:
      cached.shell ||
      getCachedElement(AppCore, "shell") ||
      getCachedElement(AppCore, "appShell") ||
      getCachedElement(AppCore, "layout") ||
      getAppShellEl(AppCore) ||
      null,

    layout:
      cached.layout ||
      getCachedElement(AppCore, "layout") ||
      getCachedElement(AppCore, "appShell") ||
      getCachedElement(AppCore, "shell") ||
      getAppShellEl(AppCore) ||
      null,

    mainContent:
      cached.mainContent ||
      getCachedElement(AppCore, "mainContent") ||
      getCachedElement(AppCore, "main") ||
      getMainContentEl(AppCore) ||
      null,

    viewContainer:
      cached.viewContainer ||
      getCachedElement(AppCore, "viewContainer") ||
      getViewContainerEl(AppCore) ||
      null,

    sidebarMount:
      cached.sidebarMount ||
      getCachedElement(AppCore, "sidebarMount") ||
      getSidebarMountEl(AppCore) ||
      null,

    sidebar,

    sidebarMenu:
      sidebar
        ? (
            cached.sidebarMenu ||
            getCachedElement(AppCore, "sidebarMenu") ||
            resolveScopedElement(SIDEBAR_MENU_ID, SIDEBAR_MENU_SELECTORS, sidebar)
          )
        : null,

    sidebarRecents:
      sidebar
        ? (
            cached.sidebarRecents ||
            getCachedElement(AppCore, "sidebarRecents") ||
            resolveScopedElement(SIDEBAR_RECENTS_ID, SIDEBAR_RECENTS_SELECTORS, sidebar)
          )
        : null,

    toggleBtn:
      sidebar
        ? (
            cached.toggleBtn ||
            cached.sidebarToggle ||
            getCachedElement(AppCore, "sidebarToggle") ||
            resolveScopedElement(SIDEBAR_TOGGLE_ID, SIDEBAR_TOGGLE_SELECTORS, sidebar) ||
            resolveSafeDocumentControl(SIDEBAR_TOGGLE_ID, SIDEBAR_TOGGLE_SELECTORS, AppCore)
          )
        : null,

    mobileToggleBtn:
      sidebar
        ? (
            cached.mobileToggleBtn ||
            getCachedElement(AppCore, "sidebarMobileToggle") ||
            getCachedElement(AppCore, "mobileSidebarToggle") ||
            resolveScopedElement(SIDEBAR_MOBILE_TOGGLE_ID, SIDEBAR_MOBILE_TOGGLE_SELECTORS, sidebar) ||
            resolveSafeDocumentControl(SIDEBAR_MOBILE_TOGGLE_ID, SIDEBAR_MOBILE_TOGGLE_SELECTORS, AppCore)
          )
        : null,

    userToggle,

    userDropdown,

    logoutBtn:
      sidebar
        ? (
            cached.logoutBtn ||
            getCachedElement(AppCore, "logoutBtn") ||
            resolveScopedElement(LOGOUT_BUTTON_ID, LOGOUT_SELECTORS, sidebar)
          )
        : null,

    avatarEl:
      sidebar
        ? (
            cached.avatarEl ||
            getCachedElement(AppCore, "sidebarAvatar") ||
            resolveScopedElement(SIDEBAR_AVATAR_ID, AVATAR_SELECTORS, sidebar)
          )
        : null,

    nameEl:
      sidebar
        ? (
            cached.nameEl ||
            getCachedElement(AppCore, "sidebarName") ||
            resolveScopedElement(SIDEBAR_NAME_ID, NAME_SELECTORS, sidebar)
          )
        : null,

    logoEl:
      sidebar
        ? (
            cached.logoEl ||
            getCachedElement(AppCore, "sidebarLogo") ||
            resolveScopedElement(SIDEBAR_LOGO_ID, LOGO_SELECTORS, sidebar)
          )
        : null,
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
    layout,
    sidebar,
  } = getElements(AppCore);

  const html = document.documentElement || null;

  /*
    Ojo:
    Esta función mantiene compat legacy e incluye sidebar.hidden.
    Para decisiones interactivas críticas, state.js usa isRealShellHidden()
    y evita bloquearse por sidebar.hidden stale.
  */
  return Boolean(
    body?.classList?.contains?.("route-shell-hidden") ||
      body?.classList?.contains?.("auth-screen") ||
      body?.dataset?.shell === "hidden" ||
      body?.dataset?.shellVisible === "false" ||
      body?.dataset?.routeMode === "auth" ||

      html?.dataset?.shell === "hidden" ||
      html?.dataset?.shellVisible === "false" ||
      html?.dataset?.routeMode === "auth" ||

      appShell?.classList?.contains?.("route-shell-hidden") ||
      shell?.classList?.contains?.("route-shell-hidden") ||
      layout?.classList?.contains?.("route-shell-hidden") ||

      appShell?.hidden === true ||
      shell?.hidden === true ||
      layout?.hidden === true ||

      appShell?.getAttribute?.("aria-hidden") === "true" ||
      shell?.getAttribute?.("aria-hidden") === "true" ||
      layout?.getAttribute?.("aria-hidden") === "true" ||

      sidebar?.hidden === true ||
      sidebar?.dataset?.mode === "hidden" ||
      sidebar?.getAttribute?.("aria-hidden") === "true" ||

      AppCore?.state?.shellVisible === false ||
      AppCore?.state?.routeShellHidden === true ||
      AppCore?.state?.authScreen === true
  );
}

/* =========================================================
   VISIBILITY HELPERS
========================================================= */

export function setSidebarHidden(AppCore, hidden = false) {
  const {
    sidebar,
    toggleBtn,
    mobileToggleBtn,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  [
    sidebar,
    toggleBtn,
    mobileToggleBtn,
    userToggle,
    userDropdown,
  ].forEach((element) => {
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
        "a[href]:not([hidden]):not([aria-hidden='true']):not([inert])",
        "button:not([disabled]):not([hidden]):not([aria-hidden='true']):not([inert])",
        "input:not([disabled]):not([hidden]):not([aria-hidden='true']):not([inert])",
        "select:not([disabled]):not([hidden]):not([aria-hidden='true']):not([inert])",
        "textarea:not([disabled]):not([hidden]):not([aria-hidden='true']):not([inert])",
        "[tabindex]:not([tabindex='-1']):not([hidden]):not([aria-hidden='true']):not([inert])",
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
    connected: isConnectedNode(element),
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
    insideViewContainer: isInsideViewContainer(element),
    parentHidden: Boolean(
      element.closest?.("[hidden],[inert],[aria-hidden='true']")
    ),
  };
}

export function getSidebarDomSnapshot(AppCore) {
  const elements = getElements(AppCore);
  const roots = getAllSidebarRoots();

  return {
    version: DOM_CACHE_VERSION,
    hasDocument: hasDocument(),

    duplicateSidebarCount:
      Math.max(0, roots.length - 1),

    sidebarRootCount:
      roots.length,

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
    sidebarConnected: isConnectedNode(elements.sidebar),
    sidebarClasses: elements.sidebar?.className || "",
    bodyClasses: elements.body?.className || "",

    cache: {
      version: AppCore?.dom?.__sidebarDomCacheVersion || "",
      cachedAt: AppCore?.dom?.__sidebarDomCachedAt || 0,
    },

    mount: getElementDebug(elements.sidebarMount),
    sidebar: getElementDebug(elements.sidebar),
    sidebarMenu: getElementDebug(elements.sidebarMenu),
    appShell: getElementDebug(elements.appShell),
    mainContent: getElementDebug(elements.mainContent),
    viewContainer: getElementDebug(elements.viewContainer),

    toggleBtn: getElementDebug(elements.toggleBtn),
    mobileToggleBtn: getElementDebug(elements.mobileToggleBtn),

    userToggle: getElementDebug(elements.userToggle),
    userDropdown: getElementDebug(elements.userDropdown),
    logoutBtn: getElementDebug(elements.logoutBtn),

    avatarEl: getElementDebug(elements.avatarEl),
    nameEl: getElementDebug(elements.nameEl),
    logoEl: getElementDebug(elements.logoEl),
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
