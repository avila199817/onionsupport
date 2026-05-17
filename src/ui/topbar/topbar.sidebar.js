/* =========================================================
   Onion SPA - Topbar Sidebar Bridge
   Archivo: src/ui/topbar/topbar.sidebar.js

   TOPBAR SIDEBAR BRIDGE · SIMPLE
   - puente entre TopbarUI y SidebarUI
   - controla sidebar mobile desde el botón del topbar
   - en desktop sólo limpia residuos mobile
   - no toca collapsed desktop ni clases estructurales desktop
   - no aplica layout/offsets permanentes desde JS
========================================================= */

import {
  TOPBAR_SEARCH_CONFIG,
  isMobileViewport,
} from "./topbar.helpers.js";

export const TOPBAR_SIDEBAR_VERSION = "topbar-sidebar-v16-simple";

const SOURCE = "topbar";
const BRIDGE = "topbar.sidebar";

const DEFAULT_BREAKPOINT = 900;
const DEFAULT_SIDEBAR_ID = "sidebar";

const BODY_SIDEBAR_OPEN_CLASS = "sidebar-open";
const BODY_SIDEBAR_CLOSING_CLASS = "sidebar-closing";
const BODY_ROUTE_SHELL_HIDDEN_CLASS = "route-shell-hidden";
const BODY_AUTH_SCREEN_CLASS = "auth-screen";
const MOBILE_TOGGLE_ACTIVE_CLASS = "is-active";

const SYNC_EVENT_NAME = "sidebar:state:synced";
const TOPBAR_SYNC_EVENT_NAME = "topbar:sidebar:mobile-synced";

const MOBILE_MODE_CLASSES = Object.freeze([
  "is-mobile",
  "mobile-open",
  "is-mobile-open",
  "sidebar-mobile-open",
]);

const MOBILE_OPEN_CLASSES = Object.freeze([
  "open",
  "is-open",
  "sidebar-open",
  "mobile-open",
  "is-mobile-open",
  "sidebar-mobile-open",
]);

const MOBILE_DATA_KEYS = Object.freeze([
  "mobileOpen",
  "mobile",
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeCall(fn, ...args) {
  if (!isFn(fn)) return undefined;

  try {
    return fn(...args);
  } catch {
    return undefined;
  }
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isElement(value) {
  return Boolean(value && value.nodeType === 1);
}

function bodyEl() {
  if (!isBrowser()) return null;
  return document.body || document.documentElement || null;
}

function htmlEl() {
  if (!isBrowser()) return null;
  return document.documentElement || null;
}

function nextFrame(callback) {
  if (!isFn(callback)) return false;

  if (!isBrowser()) {
    safeCall(callback);
    return true;
  }

  try {
    window.requestAnimationFrame(() => safeCall(callback));
    return true;
  } catch {}

  try {
    window.setTimeout(() => safeCall(callback), 0);
    return true;
  } catch {
    safeCall(callback);
    return true;
  }
}

function breakpoint() {
  return Number(TOPBAR_SEARCH_CONFIG?.mobileBreakpoint) || DEFAULT_BREAKPOINT;
}

function setAttr(element, name = "", value = "") {
  if (!isElement(element) || !name) return false;

  try {
    element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeAttr(element, name = "") {
  if (!isElement(element) || !name) return false;

  try {
    element.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function toggleClass(element, className = "", enabled = false) {
  if (!isElement(element) || !className) return false;

  try {
    element.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function safeGetDom(getDom) {
  try {
    if (isFn(getDom)) return getDom() || {};
  } catch {}

  return {};
}

function isVisibleElement(element) {
  if (!isElement(element)) return false;

  try {
    if (element.hidden === true) return false;
    const style = window.getComputedStyle?.(element);
    if (!style) return true;
    return style.display !== "none" && style.visibility !== "hidden";
  } catch {
    return true;
  }
}

/* =========================================================
   EVENTS
========================================================= */

function emitSidebarEvent(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    source: SOURCE,
    bridge: BRIDGE,
    version: TOPBAR_SIDEBAR_VERSION,
    ...safeObject(payload),
  };

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(name, detail);
      return true;
    }
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function emitMobileSync(AppCore, payload = {}, options = {}) {
  const detail = {
    source: SOURCE,
    bridge: BRIDGE,
    ...safeObject(payload),
  };

  emitSidebarEvent(AppCore, TOPBAR_SYNC_EVENT_NAME, detail);

  // Sólo emitimos legacy si el fallback DOM aplicó el estado.
  // Si SidebarUI gestionó la acción, dejamos que emita sus propios eventos.
  if (options.legacy === true) emitSidebarEvent(AppCore, SYNC_EVENT_NAME, detail);

  return true;
}

/* =========================================================
   SIDEBAR MODULE
========================================================= */

export function getSidebarModule(AppCore) {
  const names = ["SidebarUI", "sidebar", "Sidebar", "sidebarUI", "ui:sidebar"];

  try {
    if (isFn(AppCore?.modules?.get)) {
      for (const name of names) {
        const found = AppCore.modules.get(name);
        if (found) return found;
      }
    }

    const modules = AppCore?.modules;
    if (modules && typeof modules === "object") {
      for (const key of ["SidebarUI", "Sidebar", "sidebar", "sidebarUI"]) {
        if (modules[key]) return modules[key];
      }
    }

    if (AppCore?.SidebarUI) return AppCore.SidebarUI;
    if (AppCore?.Sidebar) return AppCore.Sidebar;
    if (AppCore?.sidebar) return AppCore.sidebar;

    if (isBrowser() && window?.OnionSidebarUI) return window.OnionSidebarUI;
    if (isBrowser() && window?.SidebarUI) return window.SidebarUI;
  } catch {}

  return null;
}

function callSidebarAction(sidebarModule, action = "", payload = {}) {
  if (!sidebarModule) return false;

  const map = {
    open: [
      "openMobileSidebar",
      "openSidebarMobile",
      "openMobile",
      "showMobileSidebar",
      "showSidebarMobile",
      "openSidebar",
      "open",
    ],
    close: [
      "closeMobileSidebar",
      "closeSidebarMobile",
      "closeMobile",
      "hideMobileSidebar",
      "hideSidebarMobile",
      "closeSidebar",
      "close",
    ],
    toggle: [
      "toggleMobileSidebar",
      "toggleSidebarMobile",
      "toggleMobile",
      "toggleSidebar",
      "toggle",
    ],
  };

  for (const name of map[action] || []) {
    const fn = sidebarModule?.[name];
    if (!isFn(fn)) continue;

    try {
      const result = fn.call(sidebarModule, {
        source: SOURCE,
        mobile: true,
        ...safeObject(payload),
      });

      return result !== false;
    } catch {}
  }

  return false;
}

/* =========================================================
   VIEWPORT / SHELL
========================================================= */

function mobileContext() {
  try {
    return Boolean(isMobileViewport(breakpoint()));
  } catch {}

  if (!isBrowser()) return false;

  try {
    return window.innerWidth < breakpoint();
  } catch {
    return false;
  }
}

function desktopContext() {
  return !mobileContext();
}

function shouldUseMobileSidebarMode(getDom) {
  if (!isBrowser()) return false;
  if (mobileContext()) return true;

  const { mobileToggle } = safeGetDom(getDom);
  return isVisibleElement(mobileToggle);
}

function routeShellHidden() {
  const body = bodyEl();
  const html = htmlEl();

  return Boolean(
    body?.classList?.contains?.(BODY_ROUTE_SHELL_HIDDEN_CLASS) ||
      html?.classList?.contains?.(BODY_ROUTE_SHELL_HIDDEN_CLASS) ||
      body?.classList?.contains?.(BODY_AUTH_SCREEN_CLASS) ||
      html?.classList?.contains?.(BODY_AUTH_SCREEN_CLASS) ||
      body?.dataset?.shell === "hidden" ||
      html?.dataset?.shell === "hidden" ||
      body?.dataset?.routeMode === "auth" ||
      html?.dataset?.routeMode === "auth"
  );
}

/* =========================================================
   OFFSET CLEANUP
========================================================= */

export function syncFixedTopbarOffset(getDom) {
  const { topbar } = safeGetDom(getDom);
  if (!isElement(topbar)) return false;

  // Layout lo gobierna CSS. Sólo limpiamos residuos legacy inline.
  try {
    topbar.style.left = "";
    topbar.style.right = "";
    topbar.style.width = "";
    topbar.style.insetInlineStart = "";
    topbar.style.insetInlineEnd = "";
    topbar.style.marginLeft = "";
    topbar.style.marginRight = "";
  } catch {}

  return true;
}

/* =========================================================
   VISUAL STATE
========================================================= */

function sidebarId(sidebar) {
  if (!isElement(sidebar)) return DEFAULT_SIDEBAR_ID;

  const existing = safeText(sidebar.id, "");
  if (existing) return existing;

  try {
    sidebar.id = DEFAULT_SIDEBAR_ID;
    return sidebar.id;
  } catch {
    return DEFAULT_SIDEBAR_ID;
  }
}

function restoreDesktopSidebarAccessibility(sidebar) {
  if (!isElement(sidebar)) return false;

  // En desktop no tocamos collapsed ni clases estructurales.
  if (!routeShellHidden() && sidebar.hidden !== true) {
    setAttr(sidebar, "aria-hidden", "false");
    removeAttr(sidebar, "inert");
  }

  try {
    sidebar.dataset.mode = "desktop";
    sidebar.dataset.mobileOpen = "false";

    if (!routeShellHidden()) sidebar.dataset.open = "true";

    if (["closed", "open"].includes(safeText(sidebar.dataset.state, ""))) {
      sidebar.dataset.state = "desktop";
    }
  } catch {}

  return true;
}

function clearMobileSidebarResidue(sidebar) {
  const body = bodyEl();

  try {
    body?.classList?.remove?.(BODY_SIDEBAR_OPEN_CLASS, BODY_SIDEBAR_CLOSING_CLASS);
  } catch {}

  if (!isElement(sidebar)) return false;

  // En desktop no quitamos open/is-open genéricos: pueden ser estructurales.
  try {
    MOBILE_MODE_CLASSES.forEach((className) => sidebar.classList.remove(className));
  } catch {}

  try {
    MOBILE_DATA_KEYS.forEach((key) => {
      if (key in sidebar.dataset) sidebar.dataset[key] = "false";
    });
  } catch {}

  restoreDesktopSidebarAccessibility(sidebar);
  return true;
}

function applyMobileSidebarState(sidebar, open = false) {
  const body = bodyEl();
  const nextOpen = Boolean(open);

  if (desktopContext()) {
    clearMobileSidebarResidue(sidebar);
    return true;
  }

  if (isElement(sidebar)) {
    try {
      MOBILE_OPEN_CLASSES.forEach((className) => toggleClass(sidebar, className, nextOpen));
      MOBILE_MODE_CLASSES.forEach((className) => toggleClass(sidebar, className, nextOpen));
    } catch {}

    try {
      sidebar.dataset.mode = "mobile";
      sidebar.dataset.state = nextOpen ? "open" : "closed";
      sidebar.dataset.open = String(nextOpen);
      sidebar.dataset.mobileOpen = String(nextOpen);
      sidebar.setAttribute("aria-hidden", String(!nextOpen));

      if (nextOpen) sidebar.removeAttribute("inert");
      else sidebar.setAttribute("inert", "");
    } catch {}
  }

  try {
    body?.classList?.toggle?.(BODY_SIDEBAR_OPEN_CLASS, nextOpen);
    if (!nextOpen) body?.classList?.remove?.(BODY_SIDEBAR_CLOSING_CLASS);
  } catch {}

  return true;
}

function forceCloseMobileVisualState(getDom) {
  const { sidebar } = safeGetDom(getDom);

  clearMobileSidebarResidue(sidebar);
  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  return true;
}

/* =========================================================
   STATE
========================================================= */

export function getSidebarMobileOpenState(sidebar) {
  if (desktopContext()) return false;

  const body = bodyEl();
  const bodyOpen = Boolean(body?.classList?.contains?.(BODY_SIDEBAR_OPEN_CLASS));

  const classOpen = Boolean(
    isElement(sidebar) && MOBILE_OPEN_CLASSES.some((className) => sidebar.classList?.contains?.(className))
  );

  const dataState = safeText(sidebar?.dataset?.state, "").toLowerCase();
  const dataOpen = isElement(sidebar) && ["open", "opened", "true"].includes(dataState);
  const dataMobileOpen = isElement(sidebar) && safeText(sidebar.dataset?.mobileOpen, "").toLowerCase() === "true";
  const ariaOpen = isElement(sidebar) && sidebar.getAttribute?.("aria-hidden") === "false" && (bodyOpen || classOpen || dataOpen || dataMobileOpen);

  return Boolean(bodyOpen || classOpen || dataOpen || dataMobileOpen || ariaOpen);
}

export function setMobileToggleState(getDom) {
  const { mobileToggle, sidebar } = safeGetDom(getDom);
  if (!isElement(mobileToggle)) return false;

  const desktop = desktopContext();
  const open = !desktop && getSidebarMobileOpenState(sidebar);
  const id = sidebarId(sidebar);

  try {
    mobileToggle.setAttribute("aria-expanded", String(open));
    mobileToggle.setAttribute("aria-controls", id);
    mobileToggle.setAttribute("aria-label", open ? "Cerrar navegación" : "Abrir navegación");
    mobileToggle.setAttribute("data-tooltip", open ? "Cerrar navegación" : "Abrir navegación");
    mobileToggle.removeAttribute("title");

    mobileToggle.dataset.state = open ? "open" : "closed";
    mobileToggle.dataset.mobile = String(!desktop);
    mobileToggle.classList.toggle(MOBILE_TOGGLE_ACTIVE_CLASS, open);

    // CSS decide la estética; hidden evita foco accidental en desktop.
    mobileToggle.hidden = desktop;
  } catch {}

  return true;
}

function postMobileActionSync({ AppCore, getDom, requestedOpen = false, handledByModule = false, reason = "mobile-action" } = {}) {
  nextFrame(() => {
    const { sidebar } = safeGetDom(getDom);
    const realOpen = getSidebarMobileOpenState(sidebar);

    setMobileToggleState(getDom);
    syncFixedTopbarOffset(getDom);

    emitMobileSync(
      AppCore,
      {
        open: realOpen,
        requestedOpen: Boolean(requestedOpen),
        handledByModule: Boolean(handledByModule),
        reason,
      },
      {
        legacy: !handledByModule,
      }
    );
  });

  return true;
}

/* =========================================================
   PUBLIC ACTIONS
========================================================= */

export function openSidebarMobile({ AppCore, getDom } = {}) {
  if (!shouldUseMobileSidebarMode(getDom)) {
    forceCloseMobileVisualState(getDom);
    return false;
  }

  const { sidebar } = safeGetDom(getDom);

  if (getSidebarMobileOpenState(sidebar)) {
    setMobileToggleState(getDom);
    syncFixedTopbarOffset(getDom);
    return true;
  }

  const sidebarModule = getSidebarModule(AppCore);
  const handledByModule = callSidebarAction(sidebarModule, "open", { open: true });

  if (!handledByModule) {
    if (!isElement(sidebar)) {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
      return false;
    }

    applyMobileSidebarState(sidebar, true);
  }

  postMobileActionSync({ AppCore, getDom, requestedOpen: true, handledByModule, reason: "open" });
  return true;
}

export function closeSidebarMobile({ AppCore, getDom } = {}) {
  if (!shouldUseMobileSidebarMode(getDom)) {
    forceCloseMobileVisualState(getDom);
    return false;
  }

  const { sidebar } = safeGetDom(getDom);

  if (!getSidebarMobileOpenState(sidebar)) {
    setMobileToggleState(getDom);
    syncFixedTopbarOffset(getDom);
    return true;
  }

  const sidebarModule = getSidebarModule(AppCore);
  const handledByModule = callSidebarAction(sidebarModule, "close", { open: false });

  if (!handledByModule) {
    if (!isElement(sidebar)) {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
      return false;
    }

    applyMobileSidebarState(sidebar, false);
  }

  postMobileActionSync({ AppCore, getDom, requestedOpen: false, handledByModule, reason: "close" });
  return true;
}

export function toggleSidebarMobile({ AppCore, getDom } = {}) {
  if (!shouldUseMobileSidebarMode(getDom)) {
    forceCloseMobileVisualState(getDom);
    return false;
  }

  const { sidebar } = safeGetDom(getDom);
  const nextOpen = !getSidebarMobileOpenState(sidebar);
  const sidebarModule = getSidebarModule(AppCore);

  const handledByExplicitMethod = callSidebarAction(sidebarModule, nextOpen ? "open" : "close", { open: nextOpen });
  const handledByModule = handledByExplicitMethod || callSidebarAction(sidebarModule, "toggle", { open: nextOpen });

  if (!handledByModule) {
    if (!isElement(sidebar)) {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
      return false;
    }

    applyMobileSidebarState(sidebar, nextOpen);
  }

  postMobileActionSync({ AppCore, getDom, requestedOpen: nextOpen, handledByModule, reason: "toggle" });
  return true;
}

export function handleViewportResize(getDom, closeSidebarMobileFn) {
  void closeSidebarMobileFn;

  if (desktopContext()) {
    forceCloseMobileVisualState(getDom);
    return true;
  }

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  return true;
}

export default {
  TOPBAR_SIDEBAR_VERSION,

  getSidebarModule,

  syncFixedTopbarOffset,
  getSidebarMobileOpenState,

  setMobileToggleState,

  openSidebarMobile,
  closeSidebarMobile,
  toggleSidebarMobile,

  handleViewportResize,
};
