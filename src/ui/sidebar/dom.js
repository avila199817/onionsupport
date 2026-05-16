/* =========================================================
   Onion SPA - Sidebar DOM
   Archivo: src/ui/sidebar/dom.js

   SIDEBAR DOM · SIMPLE
   - monta el sidebar una sola vez
   - cachea sólo nodos conectados
   - resuelve internos dentro del sidebar
   - permite toggles externos fuera de vistas
   - no monta dentro de view-container
   - distingue shell real de sidebar.hidden stale
   - helpers de foco/tooltips
========================================================= */

import { getSidebarTemplate } from "./template.js";

import {
  SIDEBAR_ROOT_ID,
  SIDEBAR_MENU_ID,
  SIDEBAR_RECENTS_ID,
  SIDEBAR_MOUNT_ID,

  SIDEBAR_TOGGLE_ID,
  SIDEBAR_TOGGLE_LEGACY_ID,
  SIDEBAR_MOBILE_TOGGLE_ID,
  SIDEBAR_MOBILE_TOGGLE_LEGACY_ID,

  SIDEBAR_LOGO_ID,
  SIDEBAR_LOGO_LEGACY_ID,

  USER_TOGGLE_ID,
  USER_TOGGLE_LEGACY_ID,
  USER_DROPDOWN_ID,
  USER_DROPDOWN_LEGACY_ID,

  LOGOUT_BUTTON_ID,
  LOGOUT_BUTTON_LEGACY_ID,

  SIDEBAR_AVATAR_ID,
  SIDEBAR_AVATAR_LEGACY_ID,
  SIDEBAR_AVATAR_IMAGE_ID,
  SIDEBAR_AVATAR_FALLBACK_ID,

  SIDEBAR_NAME_ID,
  SIDEBAR_NAME_LEGACY_ID,

  SIDEBAR_USER_PLAN_ID,
  SERVER_NAV_ID,

  SIDEBAR_SELECTORS as CONSTANT_SELECTORS,
  SIDEBAR_EVENTS,

  SIDEBAR_SHELL_HIDDEN_BODY_CLASSES,
  SIDEBAR_SHELL_VISIBLE_BODY_CLASSES,
} from "./constants.js";

export const SIDEBAR_DOM_VERSION = "sidebar-dom-v17-simple";

const SOURCE = "SidebarDOM";
const ORIGINAL_NONE = "__none__";
const VIEW_CONTAINER_ID = "view-container";
const DEBUG_TEXT_LIMIT = 90;

const CACHE_KEYS = Object.freeze([
  "html",
  "body",
  "appShell",
  "shell",
  "layout",
  "mainContent",
  "main",
  "appContent",
  "viewContainer",
  "sidebarMount",
  "sidebar",
  "sidebarRoot",
  "sidebarMenu",
  "sidebarRecents",
  "sidebarToggle",
  "toggleBtn",
  "mobileToggleBtn",
  "mobileSidebarToggle",
  "sidebarMobileToggle",
  "sidebarLogo",
  "serverLink",
  "userToggle",
  "userDropdown",
  "logoutBtn",
  "sidebarAvatar",
  "sidebarAvatarImage",
  "sidebarAvatarFallback",
  "sidebarName",
  "sidebarUserPlan",
]);

/* =========================================================
   SELECTORS
========================================================= */

const VIEW_SELECTORS = Object.freeze([
  `#${VIEW_CONTAINER_ID}`,
  "#router-view",
  "#app-view",
  "[data-view-root='true']",
  "[data-view-root]",
  "[data-router-view='true']",
  "[data-router-view]",
  "[data-router-outlet]",
  "[data-view-container='true']",
  "[data-view-container]",
  ".view-container",
  ".router-view",
]);

const APP_SHELL_SELECTORS = Object.freeze([
  "#app-shell",
  "[data-app-shell='true']",
  "[data-app-shell]",
  ".app-shell",
  ".app-layout",
  ".layout-shell",
  ".layout",
]);

const APP_CONTENT_SELECTORS = Object.freeze([
  "#app-content",
  "[data-app-content='true']",
  "[data-app-content]",
  ".app-content",
]);

const MAIN_SELECTORS = Object.freeze([
  "#main-content",
  "#app-main",
  "main#main-content",
  "main.main-content",
  ".main-content",
  "[data-main-content='true']",
  "[data-main-content]",
  "[data-app-main]",
  "main:not(#view-container)",
]);

const SIDEBAR_ROOT_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.root,
  `#${SIDEBAR_ROOT_ID}`,
  "aside.sidebar",
  ".sidebar[data-sidebar-root='true']",
  ".sidebar[data-sidebar-root]",
  "[data-sidebar-root='true']",
  "[data-sidebar-root]",
  "[data-sidebar='true']",
  "[data-component='sidebar']",
].filter(Boolean));

const SIDEBAR_MOUNT_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.mount,
  `#${SIDEBAR_MOUNT_ID}`,
  "[data-sidebar-mount='true']",
  "[data-sidebar-mount]",
].filter(Boolean));

const SIDEBAR_MENU_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.menu,
  `#${SIDEBAR_MENU_ID}`,
  ".sidebar-menu",
  "[data-sidebar-menu='true']",
  "[data-sidebar-menu]",
  "nav.sidebar-menu",
].filter(Boolean));

const SIDEBAR_RECENTS_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.recents,
  `#${SIDEBAR_RECENTS_ID}`,
  ".sidebar-recents",
  "[data-sidebar-recents='true']",
  "[data-sidebar-recents]",
  "[data-sidebar-recent]",
].filter(Boolean));

const SIDEBAR_TOGGLE_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.toggle,
  `#${SIDEBAR_TOGGLE_ID}`,
  `#${SIDEBAR_TOGGLE_LEGACY_ID}`,
  ".sidebar-toggle",
  "[data-sidebar-toggle='true']",
  "[data-sidebar-toggle]",
  "[data-sidebar-action='toggle-sidebar']",
  "[data-sidebar-action='sidebar-toggle']",
  "[data-action='toggle-sidebar']",
  "[data-action='sidebar-toggle']",
].filter(Boolean));

const SIDEBAR_MOBILE_TOGGLE_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.mobileToggle,
  `#${SIDEBAR_MOBILE_TOGGLE_ID}`,
  `#${SIDEBAR_MOBILE_TOGGLE_LEGACY_ID}`,
  ".sidebar-mobile-toggle",
  "[data-sidebar-mobile-toggle='true']",
  "[data-sidebar-mobile-toggle]",
  "[data-sidebar-action='mobile-sidebar-toggle']",
  "[data-sidebar-action='toggle-mobile-sidebar']",
  "[data-action='mobile-sidebar-toggle']",
  "[data-action='toggle-mobile-sidebar']",
].filter(Boolean));

const LOGO_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.logo,
  `#${SIDEBAR_LOGO_ID}`,
  `#${SIDEBAR_LOGO_LEGACY_ID}`,
  "a.logo",
  ".logo",
  ".sidebar-logo",
  "[data-sidebar-logo='true']",
  "[data-sidebar-logo]",
].filter(Boolean));

const USER_TOGGLE_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.userToggle,
  `#${USER_TOGGLE_ID}`,
  `#${USER_TOGGLE_LEGACY_ID}`,
  "#sidebar-user-toggle",
  "#sidebarUserMenuToggle",
  "#sidebar-user-menu-toggle",
  "#user-toggle",
  ".user[role='button']",
  ".sidebar-user-toggle",
  ".sidebar-user__toggle",
  ".sidebar-footer-user-toggle",
  ".sidebar-footer__user-toggle",
  ".user-toggle",
  ".user-menu-toggle",
  "[data-user-toggle='true']",
  "[data-user-toggle]",
  "[data-user-menu-toggle]",
  "[data-sidebar-user-toggle='true']",
  "[data-sidebar-user-toggle]",
  "[data-dropdown-toggle='user']",
  "[data-dropdown-target='user']",
  "[data-sidebar-action='toggle-user-dropdown']",
  "[data-sidebar-action='toggle-user-menu']",
  "[data-sidebar-action='user-toggle']",
  "[data-action='toggle-user-dropdown']",
  "[data-action='toggle-user-menu']",
  `[aria-controls='${USER_DROPDOWN_ID}']`,
  `[aria-controls='${USER_DROPDOWN_LEGACY_ID}']`,
].filter(Boolean));

const USER_DROPDOWN_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.userDropdown,
  `#${USER_DROPDOWN_ID}`,
  `#${USER_DROPDOWN_LEGACY_ID}`,
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
  "[data-user-dropdown='true']",
  "[data-user-dropdown]",
  "[data-user-menu]",
  "[data-sidebar-user-dropdown='true']",
  "[data-sidebar-user-dropdown]",
  "[data-sidebar-user-menu]",
  "[data-dropdown='user']",
  "[data-dropdown-menu='user']",
  "[data-sidebar-dropdown='user']",
].filter(Boolean));

const LOGOUT_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.logoutButton,
  `#${LOGOUT_BUTTON_ID}`,
  `#${LOGOUT_BUTTON_LEGACY_ID}`,
  "#logoutButton",
  "#sidebar-logout",
  ".sidebar-logout",
  ".logout-button",
  ".logout-btn",
  "[data-sidebar-action='logout']",
  "[data-action='logout']",
  "[data-logout]",
  "[data-sidebar-logout]",
].filter(Boolean));

const AVATAR_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.avatar,
  `#${SIDEBAR_AVATAR_ID}`,
  `#${SIDEBAR_AVATAR_LEGACY_ID}`,
  ".avatar[data-avatar-root='true']",
  ".sidebar-avatar",
  ".sidebar-user-avatar",
  "[data-avatar-root='true']",
  "[data-avatar-root]",
  "[data-sidebar-avatar='true']",
  "[data-sidebar-avatar]",
  "[data-user-avatar]",
].filter(Boolean));

const AVATAR_IMAGE_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.avatarImage,
  `#${SIDEBAR_AVATAR_IMAGE_ID}`,
  ".avatar-image",
  "[data-avatar-image='true']",
  "[data-avatar-image]",
  "img",
].filter(Boolean));

const AVATAR_FALLBACK_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.avatarFallback,
  `#${SIDEBAR_AVATAR_FALLBACK_ID}`,
  ".avatar-fallback",
  "[data-avatar-fallback='true']",
  "[data-avatar-fallback]",
].filter(Boolean));

const NAME_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.name,
  `#${SIDEBAR_NAME_ID}`,
  `#${SIDEBAR_NAME_LEGACY_ID}`,
  "#sidebarUserName",
  "#sidebar-user-name",
  ".sidebar-name",
  ".sidebar-user-name",
  ".user-info .name",
  "[data-sidebar-name='true']",
  "[data-sidebar-name]",
  "[data-user-name]",
].filter(Boolean));

const PLAN_SELECTORS = Object.freeze([
  `#${SIDEBAR_USER_PLAN_ID}`,
  ".plan",
  ".sidebar-user-plan",
  "[data-sidebar-user-plan]",
].filter(Boolean));

const SERVER_LINK_SELECTORS = Object.freeze([
  CONSTANT_SELECTORS?.serverLink,
  `#${SERVER_NAV_ID}`,
  "[data-sidebar-item-key='server']",
  "[data-nav-key='server']",
  "[data-route-key='server']",
  "[data-menu-key='server']",
  "[data-route='/servidor']",
  "[data-href='/servidor']",
  "[data-to='/servidor']",
  "[href='/servidor']",
].filter(Boolean));

const FOOTER_SELECTORS = Object.freeze([
  ".sidebar-footer",
  "[data-sidebar-footer='true']",
  "[data-sidebar-footer]",
]);

const TOOLTIP_SELECTORS = Object.freeze([
  "[title]",
  "[data-tooltip]",
  "[data-i18n-data-tooltip]",
  "[aria-describedby]",
]);

const FOCUSABLE_SELECTORS = Object.freeze([
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "details",
  "audio[controls]",
  "video[controls]",
  "[tabindex]",
  "[role='button']",
  "[role='link']",
  "[contenteditable='true']",
]);

const SHELL_HIDDEN_CLASSES = Object.freeze([
  ...(Array.isArray(SIDEBAR_SHELL_HIDDEN_BODY_CLASSES) ? SIDEBAR_SHELL_HIDDEN_BODY_CLASSES : []),
  "route-shell-hidden",
  "auth-screen",
  "route-auth",
]);

const SHELL_VISIBLE_CLASSES = Object.freeze([
  ...(Array.isArray(SIDEBAR_SHELL_VISIBLE_BODY_CLASSES) ? SIDEBAR_SHELL_VISIBLE_BODY_CLASSES : []),
  "route-shell-visible",
  "route-app",
]);

/* =========================================================
   BASIC HELPERS
========================================================= */

function hasDocument() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarDOM]", ...args);
    return;
  } catch {}

  try {
    console.warn("[SidebarDOM]", ...args);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    source: SOURCE,
    version: SIDEBAR_DOM_VERSION,
    at: safeIsoDate(),
    ...safeObject(payload),
  };

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(name, detail);
      return true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.emit("${name}") falló.`, error);
  }

  try {
    if (hasDocument() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   ELEMENT HELPERS
========================================================= */

function isElement(value = null) {
  if (!value) return false;

  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(value && typeof value.querySelector === "function");
  }
}

function isConnectedNode(value = null) {
  if (!isElement(value)) return false;

  try {
    return value.isConnected === true;
  } catch {}

  try {
    return document.contains(value);
  } catch {
    return false;
  }
}

function containsElement(parent = null, child = null) {
  if (!parent || !child) return false;

  try {
    return parent === child || parent.contains(child);
  } catch {
    return false;
  }
}

function selectorList(selectors = []) {
  if (Array.isArray(selectors)) return selectors.map((item) => safeText(item, "")).filter(Boolean).join(",");
  return safeText(selectors, "");
}

function byId(id = "") {
  if (!hasDocument()) return null;

  const cleanId = safeText(id, "");
  if (!cleanId) return null;

  try {
    const element = document.getElementById(cleanId);
    return isConnectedNode(element) ? element : null;
  } catch {
    return null;
  }
}

function query(selector = "", root = null) {
  if (!hasDocument()) return null;

  const clean = safeText(selector, "");
  if (!clean) return null;

  const scope = root && isConnectedNode(root) ? root : document;

  try {
    const element = scope.querySelector(clean);
    return isConnectedNode(element) ? element : null;
  } catch {
    return null;
  }
}

function queryAll(selector = "", root = null) {
  if (!hasDocument()) return [];

  const clean = safeText(selector, "");
  if (!clean) return [];

  const scope = root && isConnectedNode(root) ? root : document;

  try {
    return [...scope.querySelectorAll(clean)].filter(isConnectedNode);
  } catch {
    return [];
  }
}

function queryFirst(selectors = [], root = null) {
  for (const selector of safeArray(selectors)) {
    const element = query(selector, root);
    if (element) return element;
  }

  return null;
}

function queryFirstWhere(selectors = [], root = null, predicate = null) {
  for (const selector of safeArray(selectors)) {
    for (const element of queryAll(selector, root)) {
      if (!isFunction(predicate) || predicate(element)) return element;
    }
  }

  return null;
}

function matchesAny(element = null, selectors = []) {
  if (!isConnectedNode(element)) return false;

  const selector = selectorList(selectors);
  if (!selector) return false;

  try {
    return Boolean(element.matches?.(selector));
  } catch {
    return false;
  }
}

function closestAny(element = null, selectors = []) {
  if (!isConnectedNode(element)) return null;

  const selector = selectorList(selectors);
  if (!selector) return null;

  try {
    const closest = element.closest?.(selector);
    return isConnectedNode(closest) ? closest : null;
  } catch {
    return null;
  }
}

function escapeCssIdent(value = "") {
  const text = safeText(value, "");
  if (!text) return "";

  try {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(text);
  } catch {}

  return text.replace(/["\\#.:,[\]>+~*=|^$()\s]/g, "\\$&");
}

function setAttr(element = null, name = "", value = "") {
  if (!element || !name) return false;

  try {
    if (value === null || value === undefined || value === "") element.removeAttribute(name);
    else element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeAttr(element = null, name = "") {
  if (!element || !name) return false;

  try {
    element.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function setDataset(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete element.dataset[key];
    else element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function setHidden(element = null, hidden = false) {
  if (!element) return false;

  const value = Boolean(hidden);

  try {
    element.hidden = value;
  } catch {}

  try {
    if (value) element.setAttribute("hidden", "");
    else element.removeAttribute("hidden");
  } catch {}

  setAttr(element, "aria-hidden", value ? "true" : "false");
  return true;
}

/* =========================================================
   APPCORE DOM CACHE
========================================================= */

function ensureDomBag(AppCore) {
  if (!AppCore || typeof AppCore !== "object") return null;

  try {
    if (!AppCore.dom || typeof AppCore.dom !== "object") AppCore.dom = {};
    return AppCore.dom;
  } catch {
    return AppCore.dom || null;
  }
}

function getCachedElement(AppCore, key = "") {
  const element = AppCore?.dom?.[key];
  return isConnectedNode(element) ? element : null;
}

function clearDeadDomRefs(AppCore) {
  for (const key of CACHE_KEYS) {
    try {
      if (AppCore?.dom?.[key] && !isConnectedNode(AppCore.dom[key])) AppCore.dom[key] = null;
    } catch {}
  }

  return true;
}

function setDomRef(dom, key = "", element = null) {
  if (!dom || !key) return false;

  try {
    dom[key] = isConnectedNode(element) ? element : null;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   VIEW / SHELL SAFETY
========================================================= */

function isViewContainer(element = null) {
  if (!isElement(element)) return false;
  return Boolean(element.id === VIEW_CONTAINER_ID || matchesAny(element, VIEW_SELECTORS));
}

function isInsideViewContainer(element = null) {
  if (!isElement(element)) return false;
  return Boolean(isViewContainer(element) || closestAny(element, VIEW_SELECTORS));
}

function isUnsafeMountTarget(element = null) {
  return !isConnectedNode(element) || isInsideViewContainer(element);
}

function isSafeExternalControl(element = null) {
  return Boolean(isConnectedNode(element) && !isInsideViewContainer(element));
}

/* =========================================================
   SCOPED RESOLUTION
========================================================= */

function getScopedId(id = "", root = null) {
  const element = byId(id);
  if (!element) return null;
  if (root && !containsElement(root, element)) return null;
  return element;
}

function resolveScopedElement(id = "", selectors = [], root = null) {
  if (!root || !isConnectedNode(root)) return null;
  return getScopedId(id, root) || queryFirst(selectors, root) || null;
}

function resolveSafeDocumentControl(id = "", selectors = [], AppCore = null) {
  const appShell = getAppShellEl(AppCore);
  const root = appShell && !isUnsafeMountTarget(appShell) ? appShell : document;
  const idElement = byId(id);

  if (isSafeExternalControl(idElement)) return idElement;
  return queryFirstWhere(selectors, root, isSafeExternalControl);
}

/* =========================================================
   SIDEBAR ROOT
========================================================= */

function isSidebarCandidate(element = null) {
  if (!isConnectedNode(element) || isInsideViewContainer(element)) return false;

  return Boolean(
    element.id === SIDEBAR_ROOT_ID ||
      matchesAny(element, SIDEBAR_ROOT_SELECTORS)
  );
}

function scoreSidebarCandidate(element = null, AppCore = null) {
  if (!isSidebarCandidate(element)) return -1;

  let score = 0;
  const mount = getSidebarMountEl(AppCore);

  if (mount && containsElement(mount, element)) score += 100;
  if (element.id === SIDEBAR_ROOT_ID) score += 80;
  if (element.getAttribute?.("data-sidebar-root") !== null) score += 30;
  if (element.getAttribute?.("data-component") === "sidebar") score += 20;
  if (element.tagName?.toLowerCase?.() === "aside") score += 10;
  if (element.querySelector?.(selectorList(SIDEBAR_MENU_SELECTORS))) score += 10;
  if (element.querySelector?.(selectorList(USER_TOGGLE_SELECTORS))) score += 8;

  return score;
}

function resolveSidebarRoot(AppCore = null) {
  const cached = getCachedElement(AppCore, "sidebar") || getCachedElement(AppCore, "sidebarRoot");
  if (isSidebarCandidate(cached)) return cached;

  const idMatch = byId(SIDEBAR_ROOT_ID);
  if (isSidebarCandidate(idMatch)) return idMatch;

  const candidates = queryAll(selectorList(SIDEBAR_ROOT_SELECTORS), document)
    .filter(isSidebarCandidate)
    .sort((a, b) => scoreSidebarCandidate(b, AppCore) - scoreSidebarCandidate(a, AppCore));

  return candidates[0] || null;
}

function getAllSidebarRoots() {
  if (!hasDocument()) return [];

  return [...new Set(queryAll(selectorList(SIDEBAR_ROOT_SELECTORS), document).filter(isSidebarCandidate))];
}

function cleanupDuplicateSidebars(primary = null, AppCore = null) {
  if (!primary || !hasDocument()) return false;

  let removed = false;
  const primaryScore = scoreSidebarCandidate(primary, AppCore);

  for (const candidate of getAllSidebarRoots()) {
    if (!candidate || candidate === primary) continue;
    if (scoreSidebarCandidate(candidate, AppCore) > primaryScore) continue;

    const removable = candidate.id === SIDEBAR_ROOT_ID ||
      candidate.getAttribute?.("data-sidebar-root") !== null ||
      candidate.getAttribute?.("data-sidebar") === "true" ||
      candidate.getAttribute?.("data-component") === "sidebar" ||
      candidate.classList?.contains?.("sidebar");

    if (!removable) continue;

    try {
      candidate.remove();
      removed = true;
    } catch {}
  }

  return removed;
}

/* =========================================================
   SHELL RESOLVERS
========================================================= */

export function getViewContainerEl(AppCore) {
  if (!hasDocument()) return null;

  const cached = getCachedElement(AppCore, "viewContainer");
  if (cached && isViewContainer(cached)) return cached;

  return byId(VIEW_CONTAINER_ID) || queryFirst(VIEW_SELECTORS) || null;
}

export function getAppContentEl(AppCore) {
  if (!hasDocument()) return null;

  const cached = getCachedElement(AppCore, "appContent");
  if (cached && !isUnsafeMountTarget(cached)) return cached;

  return queryFirstWhere(APP_CONTENT_SELECTORS, document, (element) => !isUnsafeMountTarget(element));
}

export function getSidebarMountEl(AppCore) {
  if (!hasDocument()) return null;

  const cached = getCachedElement(AppCore, "sidebarMount");
  if (cached && !isUnsafeMountTarget(cached)) return cached;

  return queryFirstWhere(SIDEBAR_MOUNT_SELECTORS, document, (element) => !isUnsafeMountTarget(element));
}

export function getMainContentEl(AppCore) {
  if (!hasDocument()) return null;

  const cached = getCachedElement(AppCore, "mainContent") || getCachedElement(AppCore, "main");
  if (cached && !isViewContainer(cached) && !isInsideViewContainer(cached)) return cached;

  return queryFirstWhere(MAIN_SELECTORS, document, (element) => element && !isViewContainer(element) && !isInsideViewContainer(element));
}

export function getAppShellEl(AppCore) {
  if (!hasDocument()) return null;

  const cached = getCachedElement(AppCore, "appShell") || getCachedElement(AppCore, "shell") || getCachedElement(AppCore, "layout");
  if (cached && !isUnsafeMountTarget(cached)) return cached;

  return queryFirstWhere(APP_SHELL_SELECTORS, document, (element) => !isUnsafeMountTarget(element)) || document.body || null;
}

/* =========================================================
   USER DROPDOWN RESOLUTION
========================================================= */

function resolveControlledDropdownFromToggle(toggle = null, sidebar = null) {
  if (!toggle || !sidebar) return null;

  const controls = safeText(toggle.getAttribute?.("aria-controls") || toggle.dataset?.controls || toggle.dataset?.target || toggle.dataset?.dropdownTarget || "", "");
  if (!controls) return null;

  const controlled = getScopedId(controls, sidebar) || query(`#${escapeCssIdent(controls)}`, sidebar);
  return controlled && containsElement(sidebar, controlled) ? controlled : null;
}

function resolveUserToggle(sidebar = null) {
  return resolveScopedElement(USER_TOGGLE_ID, USER_TOGGLE_SELECTORS, sidebar) ||
    query(".sidebar-footer button[aria-expanded],.sidebar-footer [role='button'][aria-expanded],[data-sidebar-footer] button[aria-expanded],[data-sidebar-footer] [role='button'][aria-expanded]", sidebar);
}

function resolveUserDropdown(sidebar = null, userToggle = null) {
  return resolveControlledDropdownFromToggle(userToggle, sidebar) ||
    resolveScopedElement(USER_DROPDOWN_ID, USER_DROPDOWN_SELECTORS, sidebar) ||
    query(".sidebar-footer [role='menu'],.sidebar-footer .dropdown-menu,[data-sidebar-footer] [role='menu'],[data-sidebar-footer] .dropdown-menu", sidebar);
}

function ensureDropdownControlLink(userToggle = null, userDropdown = null) {
  if (!userToggle || !userDropdown) return false;

  try {
    if (!userDropdown.id) userDropdown.id = USER_DROPDOWN_ID || "user-dropdown";

    userToggle.setAttribute("aria-controls", userDropdown.id);
    if (!userToggle.getAttribute("aria-haspopup")) userToggle.setAttribute("aria-haspopup", "menu");
    if (!userDropdown.getAttribute("role")) userDropdown.setAttribute("role", "menu");

    return true;
  } catch {
    return false;
  }
}

function ensureDropdownClosed(userToggle = null, userDropdown = null) {
  if (userToggle) {
    setAttr(userToggle, "aria-expanded", "false");
    setDataset(userToggle, "state", "closed");
    setDataset(userToggle, "dropdownOpen", "false");
  }

  if (userDropdown) {
    setHidden(userDropdown, true);
    setDataset(userDropdown, "state", "closed");
    setDataset(userDropdown, "open", "false");
    setDataset(userDropdown, "dropdownState", "closed");
  }

  return true;
}

/* =========================================================
   TOOLTIP SANITIZE
========================================================= */

function removeTooltipAttributes(element = null) {
  if (!element) return false;

  removeAttr(element, "title");
  removeAttr(element, "data-tooltip");
  removeAttr(element, "data-i18n-data-tooltip");
  removeAttr(element, "aria-describedby");

  return true;
}

export function sanitizeLogoTooltipState(AppCore) {
  const sidebar = resolveSidebarRoot(AppCore);
  if (!sidebar) return false;

  const logo = resolveScopedElement(SIDEBAR_LOGO_ID, LOGO_SELECTORS, sidebar);
  if (!logo || !containsElement(sidebar, logo)) return false;

  removeTooltipAttributes(logo);
  queryAll(selectorList(TOOLTIP_SELECTORS), logo).forEach(removeTooltipAttributes);

  return true;
}

export function sanitizeFooterTooltipState(AppCore) {
  const sidebar = resolveSidebarRoot(AppCore);
  if (!sidebar) return false;

  const userToggle = resolveUserToggle(sidebar);
  const userDropdown = resolveUserDropdown(sidebar, userToggle);
  const avatarEl = resolveScopedElement(SIDEBAR_AVATAR_ID, AVATAR_SELECTORS, sidebar);
  const nameEl = resolveScopedElement(SIDEBAR_NAME_ID, NAME_SELECTORS, sidebar);

  [userToggle, userDropdown, avatarEl, nameEl].forEach((element) => {
    if (element && containsElement(sidebar, element)) removeTooltipAttributes(element);
  });

  const footer = queryFirst(FOOTER_SELECTORS, sidebar);
  if (footer) queryAll(selectorList(TOOLTIP_SELECTORS), footer).forEach(removeTooltipAttributes);

  return true;
}

export function sanitizeSidebarTooltipState(AppCore) {
  return Boolean(sanitizeLogoTooltipState(AppCore) || sanitizeFooterTooltipState(AppCore));
}

/* =========================================================
   ATTRIBUTE MEMORY / FOCUS
========================================================= */

function rememberAttribute(element = null, datasetKey = "", attrName = "") {
  if (!element || !datasetKey || !attrName) return false;

  try {
    if (Object.prototype.hasOwnProperty.call(element.dataset, datasetKey)) return true;

    const value = element.getAttribute(attrName);
    element.dataset[datasetKey] = value === null ? ORIGINAL_NONE : value;
    return true;
  } catch {
    return false;
  }
}

function restoreAttribute(element = null, datasetKey = "", attrName = "") {
  if (!element || !datasetKey || !attrName) return false;

  try {
    if (!Object.prototype.hasOwnProperty.call(element.dataset, datasetKey)) return false;

    const value = element.dataset[datasetKey];

    if (!value || value === ORIGINAL_NONE) element.removeAttribute(attrName);
    else element.setAttribute(attrName, value);

    delete element.dataset[datasetKey];
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   TEMPLATE / MOUNT
========================================================= */

function templateToFragment(templateOutput = "") {
  if (!hasDocument()) return null;

  try {
    if (templateOutput instanceof DocumentFragment) return templateOutput.cloneNode(true);
  } catch {}

  try {
    if (isElement(templateOutput)) {
      const fragment = document.createDocumentFragment();
      fragment.appendChild(templateOutput.cloneNode(true));
      return fragment;
    }
  } catch {}

  const html = String(templateOutput || "").trim();
  if (!html) return null;

  try {
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content;
  } catch {
    return null;
  }
}

function appendSidebarTemplate(target, templateOutput = "", mode = "append") {
  if (!target || !templateOutput || !hasDocument() || isUnsafeMountTarget(target)) return false;

  const fragment = templateToFragment(templateOutput);
  if (!fragment) return false;

  try {
    if (mode === "replace") target.replaceChildren(fragment);
    else if (mode === "prepend") target.prepend(fragment);
    else target.appendChild(fragment);

    return true;
  } catch {
    return false;
  }
}

function insertSidebarBeforeMain(appShell = null, mainContent = null, templateOutput = "") {
  if (!appShell || !mainContent || !templateOutput) return false;
  if (isUnsafeMountTarget(appShell) || isViewContainer(mainContent) || mainContent.parentElement !== appShell) return false;

  const fragment = templateToFragment(templateOutput);
  if (!fragment) return false;

  try {
    appShell.insertBefore(fragment, mainContent);
    return true;
  } catch {
    return appendSidebarTemplate(appShell, templateOutput, "prepend");
  }
}

function ensureSidebarStaticAttrs(sidebar = null) {
  if (!sidebar) return false;

  try {
    if (!sidebar.id) sidebar.id = SIDEBAR_ROOT_ID;
    sidebar.setAttribute("data-sidebar-root", "true");
    sidebar.setAttribute("data-sidebar", "true");
    sidebar.setAttribute("data-component", "sidebar");

    if (!sidebar.getAttribute("aria-label")) sidebar.setAttribute("aria-label", "Barra lateral principal");
    if (!sidebar.getAttribute("role")) sidebar.setAttribute("role", "complementary");
  } catch {}

  return true;
}

function normalizeMountedSidebarStructure(AppCore, sidebar = null) {
  if (!sidebar) return false;

  ensureSidebarStaticAttrs(sidebar);

  const userToggle = resolveUserToggle(sidebar);
  const userDropdown = resolveUserDropdown(sidebar, userToggle);

  ensureDropdownControlLink(userToggle, userDropdown);
  ensureDropdownClosed(userToggle, userDropdown);

  const sidebarMenu = resolveScopedElement(SIDEBAR_MENU_ID, SIDEBAR_MENU_SELECTORS, sidebar);
  if (sidebarMenu) {
    setDataset(sidebarMenu, "sidebarMenu", "true");
    removeAttr(sidebarMenu, "inert");
    removeAttr(sidebarMenu, "aria-disabled");
  }

  sanitizeSidebarTooltipState(AppCore);
  return true;
}

export function mountSidebar(AppCore, options = {}) {
  if (!hasDocument()) return null;

  const opts = safeObject(options);
  clearDeadDomRefs(AppCore);
  ensureDomBag(AppCore);

  let sidebar = resolveSidebarRoot(AppCore);

  if (sidebar && opts.force !== true) {
    normalizeMountedSidebarStructure(AppCore, sidebar);
    cleanupDuplicateSidebars(sidebar, AppCore);
    cacheDomRefs(AppCore);

    safeEmit(AppCore, SIDEBAR_EVENTS?.domMounted || "sidebar:dom:mounted", {
      reused: true,
      mounted: true,
      hasSidebar: true,
      reason: safeText(opts.reason, "reuse"),
    });

    return sidebar;
  }

  if (sidebar && opts.force === true) {
    try {
      sidebar.remove();
    } catch {}
  }

  const templateOutput = getSidebarTemplate(opts.templateOptions || {});
  const mount = getSidebarMountEl(AppCore);
  const appShell = getAppShellEl(AppCore);
  const mainContent = getMainContentEl(AppCore);
  let mounted = false;

  if (mount && !isUnsafeMountTarget(mount)) {
    const existing = queryFirst(SIDEBAR_ROOT_SELECTORS, mount);

    if (existing && opts.force !== true) {
      sidebar = existing;
      mounted = true;
    } else {
      mounted = appendSidebarTemplate(mount, templateOutput, "replace");
    }
  }

  if (!mounted && appShell && !isUnsafeMountTarget(appShell) && mainContent && mainContent.parentElement === appShell) {
    mounted = insertSidebarBeforeMain(appShell, mainContent, templateOutput);
  }

  if (!mounted && appShell && !isUnsafeMountTarget(appShell)) {
    mounted = appendSidebarTemplate(appShell, templateOutput, "prepend");
  }

  if (!mounted && document.body && !isUnsafeMountTarget(document.body)) {
    mounted = appendSidebarTemplate(document.body, templateOutput, "prepend");
  }

  sidebar = resolveSidebarRoot(AppCore);

  if (sidebar) {
    normalizeMountedSidebarStructure(AppCore, sidebar);
    cleanupDuplicateSidebars(sidebar, AppCore);
  }

  const refs = cacheDomRefs(AppCore);

  ensureDropdownControlLink(refs?.userToggle, refs?.userDropdown);
  ensureDropdownClosed(refs?.userToggle, refs?.userDropdown);
  sanitizeSidebarTooltipState(AppCore);

  safeEmit(AppCore, SIDEBAR_EVENTS?.domMounted || "sidebar:dom:mounted", {
    reused: false,
    mounted: Boolean(mounted),
    hasSidebar: Boolean(sidebar),
    reason: safeText(opts.reason, "mount"),
    target: mount ? "sidebar-mount" : appShell ? "app-shell" : "body",
  });

  return sidebar || null;
}

/* =========================================================
   CACHE / ELEMENTS
========================================================= */

export function cacheDomRefs(AppCore) {
  if (!hasDocument()) return null;

  const dom = ensureDomBag(AppCore);
  if (!dom) return null;

  clearDeadDomRefs(AppCore);

  const body = document.body || null;
  const html = document.documentElement || null;
  const sidebarMount = getSidebarMountEl(AppCore);
  const sidebar = resolveSidebarRoot(AppCore);

  const sidebarMenu = sidebar ? resolveScopedElement(SIDEBAR_MENU_ID, SIDEBAR_MENU_SELECTORS, sidebar) : null;
  const sidebarRecents = sidebar ? resolveScopedElement(SIDEBAR_RECENTS_ID, SIDEBAR_RECENTS_SELECTORS, sidebar) : null;

  const sidebarToggle = sidebar
    ? resolveScopedElement(SIDEBAR_TOGGLE_ID, SIDEBAR_TOGGLE_SELECTORS, sidebar) || resolveSafeDocumentControl(SIDEBAR_TOGGLE_ID, SIDEBAR_TOGGLE_SELECTORS, AppCore)
    : null;

  const mobileToggleBtn = sidebar
    ? resolveScopedElement(SIDEBAR_MOBILE_TOGGLE_ID, SIDEBAR_MOBILE_TOGGLE_SELECTORS, sidebar) || resolveSafeDocumentControl(SIDEBAR_MOBILE_TOGGLE_ID, SIDEBAR_MOBILE_TOGGLE_SELECTORS, AppCore)
    : null;

  const userToggle = sidebar ? resolveScopedElement(USER_TOGGLE_ID, USER_TOGGLE_SELECTORS, sidebar) || resolveUserToggle(sidebar) : null;
  const userDropdown = sidebar ? resolveScopedElement(USER_DROPDOWN_ID, USER_DROPDOWN_SELECTORS, sidebar) || resolveUserDropdown(sidebar, userToggle) : null;

  ensureDropdownControlLink(userToggle, userDropdown);

  const logoutBtn = sidebar ? resolveScopedElement(LOGOUT_BUTTON_ID, LOGOUT_SELECTORS, sidebar) : null;
  const avatarEl = sidebar ? resolveScopedElement(SIDEBAR_AVATAR_ID, AVATAR_SELECTORS, sidebar) : null;
  const avatarImage = avatarEl ? queryFirst(AVATAR_IMAGE_SELECTORS, avatarEl) : null;
  const avatarFallback = avatarEl ? queryFirst(AVATAR_FALLBACK_SELECTORS, avatarEl) : null;
  const nameEl = sidebar ? resolveScopedElement(SIDEBAR_NAME_ID, NAME_SELECTORS, sidebar) : null;
  const planEl = sidebar ? resolveScopedElement(SIDEBAR_USER_PLAN_ID, PLAN_SELECTORS, sidebar) : null;
  const logoEl = sidebar ? resolveScopedElement(SIDEBAR_LOGO_ID, LOGO_SELECTORS, sidebar) : null;
  const serverLink = sidebar ? resolveScopedElement(SERVER_NAV_ID, SERVER_LINK_SELECTORS, sidebar) : null;

  const appShell = getAppShellEl(AppCore);
  const appContent = getAppContentEl(AppCore);
  const mainContent = getMainContentEl(AppCore);
  const viewContainer = getViewContainerEl(AppCore);

  dom.__sidebarDomCacheVersion = SIDEBAR_DOM_VERSION;
  dom.__sidebarDomCachedAt = safeNow();

  setDomRef(dom, "html", html);
  setDomRef(dom, "body", body);
  setDomRef(dom, "appShell", appShell);
  setDomRef(dom, "shell", appShell);
  setDomRef(dom, "layout", appShell);
  setDomRef(dom, "appContent", appContent);
  setDomRef(dom, "mainContent", mainContent);
  setDomRef(dom, "main", mainContent);
  setDomRef(dom, "viewContainer", viewContainer);
  setDomRef(dom, "sidebarMount", sidebarMount);
  setDomRef(dom, "sidebar", sidebar);
  setDomRef(dom, "sidebarRoot", sidebar);
  setDomRef(dom, "sidebarMenu", sidebarMenu);
  setDomRef(dom, "sidebarRecents", sidebarRecents);
  setDomRef(dom, "sidebarToggle", sidebarToggle);
  setDomRef(dom, "toggleBtn", sidebarToggle);
  setDomRef(dom, "mobileToggleBtn", mobileToggleBtn);
  setDomRef(dom, "mobileSidebarToggle", mobileToggleBtn);
  setDomRef(dom, "sidebarMobileToggle", mobileToggleBtn);
  setDomRef(dom, "userToggle", userToggle);
  setDomRef(dom, "userDropdown", userDropdown);
  setDomRef(dom, "logoutBtn", logoutBtn);
  setDomRef(dom, "sidebarAvatar", avatarEl);
  setDomRef(dom, "sidebarAvatarImage", avatarImage);
  setDomRef(dom, "sidebarAvatarFallback", avatarFallback);
  setDomRef(dom, "sidebarName", nameEl);
  setDomRef(dom, "sidebarUserPlan", planEl);
  setDomRef(dom, "sidebarLogo", logoEl);
  setDomRef(dom, "serverLink", serverLink);

  return {
    html,
    body,
    appShell,
    shell: appShell,
    layout: appShell,
    appContent,
    mainContent,
    viewContainer,
    sidebarMount,
    sidebar,
    sidebarRoot: sidebar,
    sidebarMenu,
    sidebarRecents,
    sidebarToggle,
    toggleBtn: sidebarToggle,
    mobileToggleBtn,
    mobileSidebarToggle: mobileToggleBtn,
    sidebarMobileToggle: mobileToggleBtn,
    userToggle,
    userDropdown,
    logoutBtn,
    avatarEl,
    avatarImage,
    avatarFallback,
    nameEl,
    planEl,
    logoEl,
    serverLink,
  };
}

function emptyElements() {
  return {
    html: null,
    body: null,
    appShell: null,
    shell: null,
    layout: null,
    appContent: null,
    mainContent: null,
    viewContainer: null,
    sidebarMount: null,
    sidebar: null,
    sidebarRoot: null,
    sidebarMenu: null,
    sidebarRecents: null,
    sidebarToggle: null,
    toggleBtn: null,
    mobileToggleBtn: null,
    mobileSidebarToggle: null,
    sidebarMobileToggle: null,
    userToggle: null,
    userDropdown: null,
    logoutBtn: null,
    avatarEl: null,
    avatarImage: null,
    avatarFallback: null,
    nameEl: null,
    planEl: null,
    logoEl: null,
    serverLink: null,
  };
}

export function getElements(AppCore) {
  if (!hasDocument()) return emptyElements();

  const cached = cacheDomRefs(AppCore) || {};
  const dom = safeObject(AppCore?.dom);

  return {
    ...emptyElements(),

    html: cached.html || dom.html || document.documentElement || null,
    body: cached.body || dom.body || document.body || null,

    appShell: cached.appShell || getCachedElement(AppCore, "appShell") || getAppShellEl(AppCore),
    shell: cached.shell || getCachedElement(AppCore, "shell") || getAppShellEl(AppCore),
    layout: cached.layout || getCachedElement(AppCore, "layout") || getAppShellEl(AppCore),
    appContent: cached.appContent || getCachedElement(AppCore, "appContent") || getAppContentEl(AppCore),
    mainContent: cached.mainContent || getCachedElement(AppCore, "mainContent") || getCachedElement(AppCore, "main") || getMainContentEl(AppCore),
    viewContainer: cached.viewContainer || getCachedElement(AppCore, "viewContainer") || getViewContainerEl(AppCore),

    sidebarMount: cached.sidebarMount || getCachedElement(AppCore, "sidebarMount") || getSidebarMountEl(AppCore),
    sidebar: cached.sidebar || getCachedElement(AppCore, "sidebar") || resolveSidebarRoot(AppCore),
    sidebarRoot: cached.sidebarRoot || getCachedElement(AppCore, "sidebarRoot") || resolveSidebarRoot(AppCore),

    sidebarMenu: cached.sidebarMenu || getCachedElement(AppCore, "sidebarMenu"),
    sidebarRecents: cached.sidebarRecents || getCachedElement(AppCore, "sidebarRecents"),

    sidebarToggle: cached.sidebarToggle || getCachedElement(AppCore, "sidebarToggle"),
    toggleBtn: cached.toggleBtn || cached.sidebarToggle || getCachedElement(AppCore, "toggleBtn") || getCachedElement(AppCore, "sidebarToggle"),

    mobileToggleBtn: cached.mobileToggleBtn || getCachedElement(AppCore, "mobileToggleBtn") || getCachedElement(AppCore, "sidebarMobileToggle"),
    mobileSidebarToggle: cached.mobileSidebarToggle || getCachedElement(AppCore, "mobileSidebarToggle") || getCachedElement(AppCore, "sidebarMobileToggle"),
    sidebarMobileToggle: cached.sidebarMobileToggle || getCachedElement(AppCore, "sidebarMobileToggle") || getCachedElement(AppCore, "mobileToggleBtn"),

    userToggle: cached.userToggle || getCachedElement(AppCore, "userToggle"),
    userDropdown: cached.userDropdown || getCachedElement(AppCore, "userDropdown"),
    logoutBtn: cached.logoutBtn || getCachedElement(AppCore, "logoutBtn"),

    avatarEl: cached.avatarEl || getCachedElement(AppCore, "sidebarAvatar"),
    avatarImage: cached.avatarImage || getCachedElement(AppCore, "sidebarAvatarImage"),
    avatarFallback: cached.avatarFallback || getCachedElement(AppCore, "sidebarAvatarFallback"),
    nameEl: cached.nameEl || getCachedElement(AppCore, "sidebarName"),
    planEl: cached.planEl || getCachedElement(AppCore, "sidebarUserPlan"),
    logoEl: cached.logoEl || getCachedElement(AppCore, "sidebarLogo"),
    serverLink: cached.serverLink || getCachedElement(AppCore, "serverLink"),
  };
}

export function hasSidebarShell(AppCore) {
  const { sidebar } = getElements(AppCore);
  return Boolean(sidebar && isConnectedNode(sidebar));
}

/* =========================================================
   SHELL HIDDEN
========================================================= */

function hasExplicitShellVisibleSignal(AppCore, body = null, html = null) {
  return Boolean(
    AppCore?.state?.shellVisible === true ||
      AppCore?.state?.routeShellHidden === false ||
      AppCore?.state?.authScreen === false ||
      SHELL_VISIBLE_CLASSES.some((className) => body?.classList?.contains?.(className)) ||
      body?.dataset?.shell === "visible" ||
      body?.dataset?.shellVisible === "true" ||
      body?.dataset?.chrome === "visible" ||
      body?.dataset?.routeMode === "app" ||
      body?.dataset?.routeMode === "shell" ||
      html?.dataset?.shell === "visible" ||
      html?.dataset?.shellVisible === "true" ||
      html?.dataset?.chrome === "visible" ||
      html?.dataset?.routeMode === "app" ||
      html?.dataset?.routeMode === "shell"
  );
}

export function isRealShellHidden(AppCore) {
  if (!hasDocument()) return false;

  const { body, html, appShell, shell, layout } = getElements(AppCore);

  const hiddenByState = AppCore?.state?.shellVisible === false ||
    AppCore?.state?.chromeVisible === false ||
    AppCore?.state?.routeShellHidden === true ||
    AppCore?.state?.shellHidden === true ||
    AppCore?.state?.authScreen === true;

  const hiddenByBody = SHELL_HIDDEN_CLASSES.some((className) => body?.classList?.contains?.(className)) ||
    body?.dataset?.shell === "hidden" ||
    body?.dataset?.shellVisible === "false" ||
    body?.dataset?.chrome === "hidden" ||
    body?.dataset?.routeMode === "auth";

  const hiddenByHtml = html?.dataset?.shell === "hidden" ||
    html?.dataset?.shellVisible === "false" ||
    html?.dataset?.chrome === "hidden" ||
    html?.dataset?.routeMode === "auth";

  const hiddenByShellNode =
    appShell?.classList?.contains?.("route-shell-hidden") ||
    shell?.classList?.contains?.("route-shell-hidden") ||
    layout?.classList?.contains?.("route-shell-hidden") ||
    appShell?.hidden === true ||
    shell?.hidden === true ||
    layout?.hidden === true ||
    appShell?.getAttribute?.("aria-hidden") === "true" ||
    shell?.getAttribute?.("aria-hidden") === "true" ||
    layout?.getAttribute?.("aria-hidden") === "true";

  const visibleSignal = hasExplicitShellVisibleSignal(AppCore, body, html);

  if (visibleSignal && !hiddenByState && !hiddenByBody && !hiddenByHtml && !hiddenByShellNode) return false;

  return Boolean(hiddenByState || hiddenByBody || hiddenByHtml || hiddenByShellNode);
}

export function isSidebarDomHidden(AppCore) {
  if (!hasDocument()) return false;

  const { sidebar } = getElements(AppCore);

  return Boolean(
    sidebar?.hidden === true ||
      sidebar?.dataset?.mode === "hidden" ||
      sidebar?.getAttribute?.("aria-hidden") === "true"
  );
}

export function isLegacyShellHidden(AppCore) {
  return Boolean(isRealShellHidden(AppCore) || isSidebarDomHidden(AppCore));
}

export function isShellHidden(AppCore) {
  return isRealShellHidden(AppCore);
}

/* =========================================================
   VISIBILITY
========================================================= */

export function setSidebarHidden(AppCore, hidden = false) {
  const shouldHide = Boolean(hidden);
  const { sidebar, sidebarToggle, mobileToggleBtn, userToggle, userDropdown } = getElements(AppCore);

  if (shouldHide) {
    [sidebar, sidebarToggle, mobileToggleBtn, userToggle, userDropdown].forEach((element) => setHidden(element, true));

    if (sidebar) {
      setDataset(sidebar, "mode", "hidden");
      setDataset(sidebar, "open", "false");
      setDataset(sidebar, "collapsed", "false");
    }

    ensureDropdownClosed(userToggle, userDropdown);
    return true;
  }

  [sidebar, sidebarToggle, mobileToggleBtn, userToggle].forEach((element) => {
    setHidden(element, false);
    removeAttr(element, "inert");
  });

  ensureDropdownControlLink(userToggle, userDropdown);
  ensureDropdownClosed(userToggle, userDropdown);

  if (sidebar) {
    if (sidebar.dataset?.mode === "hidden") setDataset(sidebar, "mode", "desktop");
    if (!sidebar.dataset?.open) setDataset(sidebar, "open", "true");
    if (!sidebar.dataset?.collapsed) setDataset(sidebar, "collapsed", "false");
  }

  return true;
}

export function revealSidebarShell(AppCore, reason = "reveal-sidebar-shell") {
  const { body, html, sidebar, sidebarToggle, mobileToggleBtn, userToggle, userDropdown } = getElements(AppCore);

  [sidebar, sidebarToggle, mobileToggleBtn, userToggle].forEach((element) => {
    setHidden(element, false);
    removeAttr(element, "inert");
  });

  ensureDropdownControlLink(userToggle, userDropdown);
  ensureDropdownClosed(userToggle, userDropdown);

  if (sidebar) {
    if (sidebar.dataset?.mode === "hidden") setDataset(sidebar, "mode", "desktop");
    if (!sidebar.dataset?.open) setDataset(sidebar, "open", "true");
    if (!sidebar.dataset?.collapsed) setDataset(sidebar, "collapsed", "false");
    setDataset(sidebar, "ready", sidebar.dataset?.ready || "true");
  }

  try {
    body?.classList?.remove?.("sidebar-hidden", "route-chrome-hidden");
    html?.classList?.remove?.("route-chrome-hidden");
  } catch {}

  safeEmit(AppCore, SIDEBAR_EVENTS?.domRevealed || "sidebar:dom:revealed", { reason });
  return true;
}

/* =========================================================
   FOCUS HELPERS
========================================================= */

export function blurIfInside(element) {
  if (!hasDocument()) return false;

  try {
    const activeEl = document.activeElement;

    if (element && activeEl && activeEl !== document.body && containsElement(element, activeEl)) {
      activeEl.blur?.();
      return true;
    }
  } catch {}

  return false;
}

export function focusFirstInteractive(root = null) {
  if (!root) return false;

  try {
    const selector = FOCUSABLE_SELECTORS
      .map((item) => `${item}:not([disabled]):not([hidden]):not([aria-hidden='true']):not([inert])`)
      .join(",");

    const target = root.querySelector(selector);

    if (target && isFunction(target.focus)) {
      target.focus({ preventScroll: true });
      return true;
    }
  } catch {}

  try {
    const fallback = root.querySelector("a[href], button, [tabindex]");
    fallback?.focus?.({ preventScroll: true });
    return Boolean(fallback);
  } catch {
    return false;
  }
}

export function focusSidebar(AppCore) {
  const { sidebar } = getElements(AppCore);
  if (!sidebar) return false;

  try {
    rememberAttribute(sidebar, "sidebarOriginalTabindex", "tabindex");
    if (!sidebar.hasAttribute("tabindex")) sidebar.setAttribute("tabindex", "-1");
    sidebar.focus({ preventScroll: true });
    return true;
  } catch {
    return focusFirstInteractive(sidebar);
  }
}

export function restoreSidebarFocusAttrs(AppCore) {
  const { sidebar } = getElements(AppCore);
  if (!sidebar) return false;

  return restoreAttribute(sidebar, "sidebarOriginalTabindex", "tabindex");
}

/* =========================================================
   SNAPSHOT
========================================================= */

function elementDebug(element = null) {
  if (!isElement(element)) return { exists: false };

  let text = "";

  try {
    text = safeText(element.textContent, "").slice(0, DEBUG_TEXT_LIMIT);
  } catch {}

  return {
    exists: true,
    id: element.id || "",
    tag: element.tagName || "",
    connected: isConnectedNode(element),
    hidden: Boolean(element.hidden),
    inert: Boolean(element.hasAttribute?.("inert")),
    ariaHidden: element.getAttribute?.("aria-hidden") || "",
    ariaExpanded: element.getAttribute?.("aria-expanded") || "",
    ariaControls: element.getAttribute?.("aria-controls") || "",
    role: element.getAttribute?.("role") || "",
    className: safeText(element.className, ""),
    dataAction: element.getAttribute?.("data-action") || element.getAttribute?.("data-sidebar-action") || "",
    dataMode: element.dataset?.mode || "",
    dataState: element.dataset?.state || "",
    dataOpen: element.dataset?.open || "",
    dataCollapsed: element.dataset?.collapsed || "",
    dataReady: element.dataset?.ready || "",
    insideViewContainer: isInsideViewContainer(element),
    parentHidden: Boolean(element.closest?.("[hidden],[inert],[aria-hidden='true']")),
    hasText: Boolean(text),
    textPreview: text,
  };
}

export function getSidebarDomSnapshot(AppCore) {
  const elements = getElements(AppCore);
  const roots = getAllSidebarRoots();

  return {
    version: SIDEBAR_DOM_VERSION,
    hasDocument: hasDocument(),
    duplicateSidebarCount: Math.max(0, roots.length - 1),
    sidebarRootCount: roots.length,

    hasSidebarMount: Boolean(elements.sidebarMount),
    hasSidebar: Boolean(elements.sidebar),
    hasSidebarMenu: Boolean(elements.sidebarMenu),
    hasSidebarRecents: Boolean(elements.sidebarRecents),
    hasToggle: Boolean(elements.sidebarToggle || elements.toggleBtn),
    hasMobileToggle: Boolean(elements.mobileToggleBtn),
    hasUserToggle: Boolean(elements.userToggle),
    hasUserDropdown: Boolean(elements.userDropdown),
    hasLogoutBtn: Boolean(elements.logoutBtn),
    hasAvatar: Boolean(elements.avatarEl),
    hasAvatarImage: Boolean(elements.avatarImage),
    hasAvatarFallback: Boolean(elements.avatarFallback),
    hasName: Boolean(elements.nameEl),
    hasPlan: Boolean(elements.planEl),
    hasLogo: Boolean(elements.logoEl),
    hasServerLink: Boolean(elements.serverLink),
    hasAppShell: Boolean(elements.appShell),
    hasAppContent: Boolean(elements.appContent),
    hasMainContent: Boolean(elements.mainContent),
    hasViewContainer: Boolean(elements.viewContainer),

    shellHidden: isShellHidden(AppCore),
    realShellHidden: isRealShellHidden(AppCore),
    legacyShellHidden: isLegacyShellHidden(AppCore),
    sidebarDomHidden: isSidebarDomHidden(AppCore),
    sidebarHidden: Boolean(elements.sidebar?.hidden),
    sidebarConnected: isConnectedNode(elements.sidebar),
    sidebarClasses: elements.sidebar?.className || "",
    bodyClasses: elements.body?.className || "",
    bodyRouteMode: elements.body?.dataset?.routeMode || "",
    bodyShell: elements.body?.dataset?.shell || "",
    bodyShellVisible: elements.body?.dataset?.shellVisible || "",
    bodyChrome: elements.body?.dataset?.chrome || "",
    htmlRouteMode: elements.html?.dataset?.routeMode || "",
    htmlShell: elements.html?.dataset?.shell || "",
    htmlShellVisible: elements.html?.dataset?.shellVisible || "",
    htmlChrome: elements.html?.dataset?.chrome || "",

    cache: {
      version: AppCore?.dom?.__sidebarDomCacheVersion || "",
      cachedAt: AppCore?.dom?.__sidebarDomCachedAt || 0,
      cachedAtIso: AppCore?.dom?.__sidebarDomCachedAt ? safeIsoDate(AppCore.dom.__sidebarDomCachedAt) : "",
    },

    nodes: {
      mount: elementDebug(elements.sidebarMount),
      sidebar: elementDebug(elements.sidebar),
      sidebarMenu: elementDebug(elements.sidebarMenu),
      sidebarRecents: elementDebug(elements.sidebarRecents),
      appShell: elementDebug(elements.appShell),
      appContent: elementDebug(elements.appContent),
      mainContent: elementDebug(elements.mainContent),
      viewContainer: elementDebug(elements.viewContainer),
      sidebarToggle: elementDebug(elements.sidebarToggle || elements.toggleBtn),
      mobileToggleBtn: elementDebug(elements.mobileToggleBtn),
      userToggle: elementDebug(elements.userToggle),
      userDropdown: elementDebug(elements.userDropdown),
      logoutBtn: elementDebug(elements.logoutBtn),
      avatarEl: elementDebug(elements.avatarEl),
      avatarImage: elementDebug(elements.avatarImage),
      avatarFallback: elementDebug(elements.avatarFallback),
      nameEl: elementDebug(elements.nameEl),
      planEl: elementDebug(elements.planEl),
      logoEl: elementDebug(elements.logoEl),
      serverLink: elementDebug(elements.serverLink),
    },
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export {
  resolveSidebarRoot,
  getAllSidebarRoots,
  cleanupDuplicateSidebars,
};

export default {
  SIDEBAR_DOM_VERSION,

  getSidebarMountEl,
  getMainContentEl,
  getAppContentEl,
  getAppShellEl,
  getViewContainerEl,

  mountSidebar,
  cacheDomRefs,
  getElements,

  hasSidebarShell,

  isShellHidden,
  isRealShellHidden,
  isLegacyShellHidden,
  isSidebarDomHidden,

  setSidebarHidden,
  revealSidebarShell,

  blurIfInside,
  focusFirstInteractive,
  focusSidebar,
  restoreSidebarFocusAttrs,

  sanitizeLogoTooltipState,
  sanitizeFooterTooltipState,
  sanitizeSidebarTooltipState,

  getSidebarDomSnapshot,
};
