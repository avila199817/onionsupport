/* =========================================================
   Onion Support - Sidebar Events
   Archivo: /src/ui/sidebar/events.js

   Responsabilidad:
   - Un único listener delegado sobre el root del sidebar.
   - Click en enlace -> navigateFromSidebar().
   - Click en toggle -> toggleSidebar().
   - Click en logout -> handleLogout().
   - Respetar el dropdown de cuenta sin gestionarlo.
   - Normalizar target usando Router.buildPublicPath si existe.
   - Sin navegación propia.
   - Sin active menu propio.
   - Sin indicadores.
   - Sin resize.
   - Sin abrir/cerrar dropdown.
   - Sin keydown custom.
   - Sin core event storms.
   - Sin CustomEvent.
   - Sin timers.
========================================================= */

import {
  SIDEBAR_SELECTORS,
} from "./constants.js";

import {
  getSidebarRoot,
  isElement,
} from "./dom.js";

import {
  handleLogout,
  navigateFromSidebar,
  toggleSidebar,
} from "./actions.js";

export const SIDEBAR_EVENTS_VERSION = "sidebar.events.v3";

const HANDLED_FLAG = "__onionSidebarHandled";

const DROPDOWN_TRIGGER_SELECTOR = "[data-sidebar-dropdown-trigger]";
const DROPDOWN_MENU_SELECTOR = "[data-sidebar-dropdown-menu]";
const DROPDOWN_ITEM_SELECTOR = "[data-sidebar-dropdown-item='true']";

let boundRoot = null;
let boundController = null;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function eventTarget(event = null) {
  const target = event?.target || null;
  return target?.nodeType === 3 ? target.parentElement : target;
}

function contains(root = null, element = null) {
  try {
    return Boolean(root && element && (root === element || root.contains(element)));
  } catch {
    return false;
  }
}

function closestInside(root = null, target = null, selector = "") {
  if (!isElement(root) || !target || !selector) return null;

  try {
    const element = target.closest?.(selector);
    return contains(root, element) ? element : null;
  } catch {
    return null;
  }
}

function resolveRoot(context = {}) {
  return isElement(context.root) ? context.root : getSidebarRoot();
}

/* =========================================================
   EVENT SAFETY
========================================================= */

function wasHandled(event = null) {
  return Boolean(event?.[HANDLED_FLAG]);
}

function markHandled(event = null) {
  try {
    event[HANDLED_FLAG] = true;
    return true;
  } catch {
    return false;
  }
}

function prevent(event = null) {
  try {
    event?.preventDefault?.();
  } catch {
    // noop
  }

  return true;
}

function isPlainLeftClick(event = null) {
  if (!event) return true;

  return (
    event.button === 0 &&
    event.metaKey !== true &&
    event.ctrlKey !== true &&
    event.shiftKey !== true &&
    event.altKey !== true
  );
}

function browserOwnsClick(link = null, event = null) {
  if (!isElement(link)) return true;
  if (!isPlainLeftClick(event)) return true;
  if (link.hasAttribute("download")) return true;

  const target = text(link.getAttribute("target"), "").toLowerCase();

  return target === "_blank";
}

function isBlocked(element = null) {
  if (!isElement(element)) return true;

  return Boolean(
    element.hidden ||
      element.disabled === true ||
      element.getAttribute("aria-hidden") === "true" ||
      element.getAttribute("aria-disabled") === "true" ||
      element.dataset?.disabled === "true" ||
      element.closest("[hidden], [aria-hidden='true'], [aria-disabled='true'], [data-disabled='true']")
  );
}

function isSafeInternalHref(value = "") {
  const href = text(value, "");

  return Boolean(
    href &&
      href.startsWith("/") &&
      !href.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(href) &&
      !/[\r\n\t\\]/.test(href)
  );
}

/* =========================================================
   SELECTORS
========================================================= */

function selectorList(...selectors) {
  return selectors
    .flat()
    .map((selector) => text(selector, ""))
    .filter(Boolean)
    .join(",");
}

function sidebarLinkSelector() {
  return selectorList(
    SIDEBAR_SELECTORS.navLink,
    SIDEBAR_SELECTORS.brand,
    SIDEBAR_SELECTORS.link,
    "a[data-spa]",
    "a[data-sidebar-link='true']",
    "a[data-sidebar-nav-link='true']",
    "a[data-sidebar-dropdown-item='true']"
  );
}

function sidebarToggleSelector() {
  return selectorList(
    SIDEBAR_SELECTORS.toggle,
    "[data-sidebar-toggle='true']",
    "[data-sidebar-action='toggle']"
  );
}

function sidebarLogoutSelector() {
  return selectorList(
    SIDEBAR_SELECTORS.logout,
    "[data-sidebar-logout='true']",
    "[data-sidebar-action='logout']",
    "[data-sidebar-menu-action='logout']"
  );
}

/* =========================================================
   TARGETS
========================================================= */

function getLinkTarget(link = null) {
  if (!isElement(link)) return "";

  return text(
    link.dataset?.route ||
      link.dataset?.href ||
      link.dataset?.to ||
      link.getAttribute("data-route") ||
      link.getAttribute("data-href") ||
      link.getAttribute("data-to") ||
      link.getAttribute("href"),
    ""
  );
}

function normalizeNavigationTarget(target = "", context = {}) {
  const href = text(target, "");

  if (!isSafeInternalHref(href)) return "";

  try {
    if (isFunction(context.Router?.buildPublicPath)) {
      const publicPath = context.Router.buildPublicPath(href, {
        useSlugHome: true,
        useSlugPrivate: true,
      });

      return isSafeInternalHref(publicPath) ? publicPath : href;
    }
  } catch {
    // noop
  }

  return href;
}

/* =========================================================
   HANDLER
========================================================= */

export function handleSidebarClick(event = null, context = {}) {
  if (wasHandled(event)) return false;

  const ctx = isObject(context) ? context : {};
  const root = resolveRoot(ctx);
  const target = eventTarget(event);

  if (!isElement(root) || !contains(root, target)) {
    return false;
  }

  /*
    El trigger del dropdown lo gestiona dropdown.js.
    Este módulo no debe abrir/cerrar menús.
  */
  const dropdownTrigger = closestInside(root, target, DROPDOWN_TRIGGER_SELECTOR);

  if (dropdownTrigger && !isBlocked(dropdownTrigger)) {
    return false;
  }

  const logout = closestInside(root, target, sidebarLogoutSelector());

  if (logout && !isBlocked(logout)) {
    prevent(event);
    markHandled(event);

    void handleLogout({
      ...ctx,
      root,
    });

    return true;
  }

  const toggle = closestInside(root, target, sidebarToggleSelector());

  if (toggle && !isBlocked(toggle)) {
    prevent(event);
    markHandled(event);

    toggleSidebar({
      ...ctx,
      root,
    });

    return true;
  }

  const link = closestInside(root, target, sidebarLinkSelector());

  if (!link) return false;
  if (isBlocked(link)) return false;
  if (browserOwnsClick(link, event)) return false;

  const rawHref = getLinkTarget(link);
  const href = normalizeNavigationTarget(rawHref, ctx);

  if (!isSafeInternalHref(href)) return false;

  prevent(event);
  markHandled(event);

  void navigateFromSidebar({
    ...ctx,
    root,
    target: href,
  });

  /*
    Si el click viene desde el menú de cuenta, dropdown.js cerrará el menú
    con su propio listener. Aquí no se duplica esa responsabilidad.
  */
  void closestInside(root, target, DROPDOWN_MENU_SELECTOR);
  void closestInside(root, target, DROPDOWN_ITEM_SELECTOR);

  return true;
}

/* =========================================================
   BIND / UNBIND
========================================================= */

export function bindSidebarEvents(context = {}) {
  const root = resolveRoot(context);

  if (!isElement(root)) return false;

  if (boundRoot === root && boundController) {
    return true;
  }

  unbindSidebarEvents();

  const controller = new AbortController();

  const handler = (event) => {
    handleSidebarClick(event, context);
  };

  try {
    root.addEventListener("click", handler, {
      signal: controller.signal,
    });

    boundRoot = root;
    boundController = controller;

    return true;
  } catch {
    boundRoot = null;
    boundController = null;
    return false;
  }
}

export function unbindSidebarEvents() {
  try {
    boundController?.abort?.();
  } catch {
    // noop
  }

  boundRoot = null;
  boundController = null;

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarEventsSnapshot() {
  return {
    version: SIDEBAR_EVENTS_VERSION,

    bound: Boolean(boundRoot && boundController),
    hasRoot: isElement(boundRoot),
    rootId: boundRoot?.id || "",

    policy: {
      delegatedOnly: true,
      ownNavigation: false,
      ownActiveMenu: false,
      ownIndicators: false,
      ownResize: false,
      ownDropdown: false,
      dropdownAware: true,
      ownKeydown: false,
      ownCustomEvent: false,
      ownTimers: false,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_EVENTS_VERSION,

  handleSidebarClick,

  bindSidebarEvents,
  unbindSidebarEvents,

  getSidebarEventsSnapshot,
};
