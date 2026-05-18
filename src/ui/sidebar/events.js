/* =========================================================
   Onion Support - Sidebar Events
   Archivo: /src/ui/sidebar/events.js

   Responsabilidad:
   - Un único listener delegado sobre el root del sidebar.
   - Click en enlace -> navigateFromSidebar().
   - Click en toggle -> toggleSidebar().
   - Click en logout -> handleLogout().
   - Sin navegación propia.
   - Sin active menu propio.
   - Sin indicadores.
   - Sin resize.
   - Sin dropdown.
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

export const SIDEBAR_EVENTS_VERSION = "sidebar.events.v1";

const HANDLED_FLAG = "__onionSidebarHandled";

let boundRoot = null;
let boundHandler = null;

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

function targetOf(event = null) {
  const target = event?.target || null;

  try {
    if (target?.nodeType === 3) return target.parentElement;
  } catch {
    // noop
  }

  return target;
}

function closest(target = null, selector = "") {
  if (!target || !selector) return null;

  try {
    return target.closest(selector);
  } catch {
    return null;
  }
}

function contains(parent = null, child = null) {
  if (!parent || !child) return false;

  try {
    return parent === child || parent.contains(child);
  } catch {
    return false;
  }
}

function resolveRoot(context = {}) {
  if (isElement(context.root)) return context.root;

  return getSidebarRoot();
}

/* =========================================================
   EVENT SAFETY
========================================================= */

function wasHandled(event = null) {
  return Boolean(event?.[HANDLED_FLAG]);
}

function markHandled(event = null, reason = "") {
  try {
    event[HANDLED_FLAG] = true;
    event.__onionSidebarReason = reason;
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

function browserShouldOwnClick(element = null, event = null) {
  if (!isElement(element)) return true;
  if (!isPlainLeftClick(event)) return true;
  if (element.hasAttribute("download")) return true;
  if (element.getAttribute("target") === "_blank") return true;

  return false;
}

function isHiddenOrDisabled(element = null) {
  if (!isElement(element)) return true;

  return Boolean(
    element.hidden ||
      element.getAttribute("aria-hidden") === "true" ||
      element.getAttribute("aria-disabled") === "true" ||
      element.dataset?.disabled === "true" ||
      element.closest("[hidden], [aria-hidden='true']")
  );
}

/* =========================================================
   LINK TARGET
========================================================= */

function getElementTarget(element = null) {
  if (!isElement(element)) return "";

  return text(
    element.dataset?.route ||
      element.dataset?.href ||
      element.dataset?.to ||
      element.getAttribute("data-route") ||
      element.getAttribute("data-href") ||
      element.getAttribute("data-to") ||
      element.getAttribute("href"),
    ""
  );
}

function closestInsideRoot(target = null, selector = "", root = null) {
  const element = closest(target, selector);

  if (!element || !contains(root, element)) return null;

  return element;
}

function sidebarLinkSelector() {
  return [
    SIDEBAR_SELECTORS.navLink,
    SIDEBAR_SELECTORS.brand,
    SIDEBAR_SELECTORS.link,
  ].join(",");
}

/* =========================================================
   OPTIONAL SYNC
========================================================= */

function syncAfterAction(context = {}) {
  try {
    if (isFunction(context.sync)) {
      context.sync();
      return true;
    }

    if (isFunction(context.refresh)) {
      context.refresh();
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

/* =========================================================
   HANDLER
========================================================= */

export function handleSidebarClick(event = null, context = {}) {
  if (wasHandled(event)) return false;

  const ctx = isObject(context) ? context : {};
  const root = resolveRoot(ctx);
  const target = targetOf(event);

  if (!isElement(root) || !target || !contains(root, target)) {
    return false;
  }

  const logoutButton = closestInsideRoot(
    target,
    SIDEBAR_SELECTORS.logout,
    root
  );

  if (logoutButton) {
    prevent(event);
    markHandled(event, "sidebar:logout");

    void handleLogout({
      ...ctx,
      root,
    }).finally(() => {
      syncAfterAction(ctx);
    });

    return true;
  }

  const toggleButton = closestInsideRoot(
    target,
    SIDEBAR_SELECTORS.toggle,
    root
  );

  if (toggleButton) {
    prevent(event);
    markHandled(event, "sidebar:toggle");

    toggleSidebar({
      ...ctx,
      root,
    });

    return true;
  }

  const link = closestInsideRoot(
    target,
    sidebarLinkSelector(),
    root
  );

  if (!link) return false;
  if (isHiddenOrDisabled(link)) return false;
  if (browserShouldOwnClick(link, event)) return false;

  const href = getElementTarget(link);

  if (!href) return false;

  prevent(event);
  markHandled(event, "sidebar:navigate");

  void navigateFromSidebar({
    ...ctx,
    root,
    target: href,
  }).finally(() => {
    syncAfterAction(ctx);
  });

  return true;
}

/* =========================================================
   BIND / UNBIND
========================================================= */

export function bindSidebarEvents(context = {}) {
  const root = resolveRoot(context);

  if (!isElement(root)) return false;

  if (boundRoot === root && boundHandler) {
    return true;
  }

  unbindSidebarEvents();

  boundHandler = (event) => {
    handleSidebarClick(event, context);
  };

  try {
    root.addEventListener("click", boundHandler);
    boundRoot = root;
    return true;
  } catch {
    boundRoot = null;
    boundHandler = null;
    return false;
  }
}

export function unbindSidebarEvents() {
  if (!boundRoot || !boundHandler) {
    boundRoot = null;
    boundHandler = null;
    return true;
  }

  try {
    boundRoot.removeEventListener("click", boundHandler);
  } catch {
    // noop
  }

  boundRoot = null;
  boundHandler = null;

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarEventsSnapshot() {
  return {
    version: SIDEBAR_EVENTS_VERSION,
    bound: Boolean(boundRoot && boundHandler),
    hasRoot: Boolean(boundRoot),
    rootId: boundRoot?.id || "",
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
