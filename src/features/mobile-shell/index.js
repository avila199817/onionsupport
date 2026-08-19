/* =========================================================
   Onion Support - Mobile Shell
   Archivo: /src/features/mobile-shell/index.js

   Responsabilidad:
   - Convertir Sidebar en drawer real <= 900px.
   - Mantener el trigger hamburguesa como único punto de entrada móvil.
   - Cerrar al navegar, pulsar Escape o tocar fuera del drawer.
   - Restaurar el estado desktop al abandonar el breakpoint móvil.
   - Sin HTTP, Auth, Router, Store ni lógica de dominio.
========================================================= */

import { SidebarUI } from "../../ui/sidebar/index.js";

export const MOBILE_SHELL_VERSION =
  "mobile-shell.v1-offcanvas-canonical";

const MOBILE_QUERY = "(max-width: 900px)";
const SIDEBAR_ROOT_SELECTOR = "[data-sidebar-root='true'], #app-sidebar";
const SIDEBAR_NAV_LINK_SELECTOR =
  "[data-sidebar-nav-link='true'], [data-sidebar-brand='true']";
const SIDEBAR_TOGGLE_SELECTOR = "[data-sidebar-toggle='true']";

let initialized = false;
let mediaQuery = null;
let desktopOpenBeforeMobile = true;
let observer = null;

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function eventElement(target = null) {
  if (!target) return null;
  return target.nodeType === 3 ? target.parentElement : target;
}

function getSidebarRoot() {
  if (!isBrowser()) return null;
  return document.querySelector(SIDEBAR_ROOT_SELECTOR);
}

function getSidebarToggle() {
  return getSidebarRoot()?.querySelector?.(SIDEBAR_TOGGLE_SELECTOR) || null;
}

function isMobile() {
  if (!isBrowser()) return false;

  if (!mediaQuery) {
    mediaQuery = window.matchMedia(MOBILE_QUERY);
  }

  return mediaQuery.matches === true;
}

function bodySidebarState() {
  if (!isBrowser()) return "hidden";

  return (
    document.body?.dataset?.sidebarState ||
    document.documentElement?.dataset?.sidebarState ||
    "hidden"
  );
}

function sidebarIsOpen() {
  if (!isBrowser()) return false;

  const state = bodySidebarState();
  if (state === "open") return true;
  if (state === "collapsed" || state === "hidden") return false;

  try {
    return SidebarUI.getSnapshot?.().open === true;
  } catch {
    return false;
  }
}

function shellIsVisible() {
  if (!isBrowser()) return false;

  const mount =
    document.getElementById("sidebar-mount") ||
    document.querySelector("[data-sidebar-mount]");

  return Boolean(
    mount &&
    mount.hidden !== true &&
    bodySidebarState() !== "hidden"
  );
}

function setMobileDocumentState() {
  if (!isBrowser()) return false;

  const mobile = isMobile();
  const open = mobile && sidebarIsOpen();

  for (const node of [document.documentElement, document.body].filter(Boolean)) {
    if (mobile) {
      node.dataset.mobileShell = "true";
      node.dataset.mobileNavigation = open ? "open" : "closed";
    } else {
      delete node.dataset.mobileShell;
      delete node.dataset.mobileNavigation;
    }
  }

  return true;
}

function focusToggle() {
  const toggle = getSidebarToggle();
  if (!toggle || typeof toggle.focus !== "function") return false;

  try {
    toggle.focus({ preventScroll: true });
  } catch {
    toggle.focus();
  }

  return true;
}

function closeMobileSidebar({ focus = false } = {}) {
  if (!isMobile()) return false;

  try {
    SidebarUI.closeSidebar?.();
  } catch {
    return false;
  }

  setMobileDocumentState();

  if (focus) {
    window.requestAnimationFrame(() => {
      focusToggle();
    });
  }

  return true;
}

function enterMobileMode() {
  if (!isBrowser()) return false;

  try {
    desktopOpenBeforeMobile = SidebarUI.getSnapshot?.().open !== false;
  } catch {
    desktopOpenBeforeMobile = true;
  }

  closeMobileSidebar();
  setMobileDocumentState();
  return true;
}

function leaveMobileMode() {
  if (!isBrowser()) return false;

  setMobileDocumentState();

  if (
    desktopOpenBeforeMobile &&
    shellIsVisible()
  ) {
    try {
      SidebarUI.openSidebar?.();
    } catch {
      // El shell puede estar desmontándose por cambio de ruta.
    }
  }

  setMobileDocumentState();
  return true;
}

function onMediaChange(event) {
  if (event.matches) {
    enterMobileMode();
  } else {
    leaveMobileMode();
  }
}

function onDocumentPointerDown(event) {
  if (!isMobile() || !sidebarIsOpen()) return;

  const target = eventElement(event.target);
  const root = getSidebarRoot();

  if (!target || !root || root.contains(target)) return;

  /*
    El primer toque fuera sólo cierra el drawer. Evita activar accidentalmente
    un botón o enlace que estaba oscurecido por la navegación abierta.
  */
  event.preventDefault();
  event.stopPropagation();
  closeMobileSidebar();
}

function onDocumentClick(event) {
  if (!isMobile()) return;

  const target = eventElement(event.target);
  const link = target?.closest?.(SIDEBAR_NAV_LINK_SELECTOR);

  if (!link || !getSidebarRoot()?.contains(link)) return;

  window.queueMicrotask(() => {
    closeMobileSidebar();
  });
}

function onDocumentKeyDown(event) {
  if (
    event.key !== "Escape" ||
    !isMobile() ||
    !sidebarIsOpen()
  ) {
    return;
  }

  event.preventDefault();
  closeMobileSidebar({ focus: true });
}

function onHistoryNavigation() {
  if (!isMobile() || !sidebarIsOpen()) return;
  closeMobileSidebar();
}

function attachObserver() {
  if (!isBrowser() || observer || !document.body) return false;

  observer = new MutationObserver(() => {
    setMobileDocumentState();
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: [
      "class",
      "data-sidebar-state",
      "data-sidebar-open",
      "data-sidebar-hidden",
    ],
  });

  return true;
}

export function initMobileShell() {
  if (!isBrowser() || initialized) return MOBILE_SHELL;

  initialized = true;
  mediaQuery = window.matchMedia(MOBILE_QUERY);

  if (mediaQuery.matches) {
    enterMobileMode();
  } else {
    setMobileDocumentState();
  }

  mediaQuery.addEventListener?.("change", onMediaChange);
  mediaQuery.addListener?.(onMediaChange);

  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeyDown);
  window.addEventListener("popstate", onHistoryNavigation);
  window.addEventListener("hashchange", onHistoryNavigation);
  window.addEventListener("pageshow", setMobileDocumentState);

  attachObserver();

  window.requestAnimationFrame(() => {
    setMobileDocumentState();
  });

  return MOBILE_SHELL;
}

export function destroyMobileShell() {
  if (!isBrowser() || !initialized) return MOBILE_SHELL;

  mediaQuery?.removeEventListener?.("change", onMediaChange);
  mediaQuery?.removeListener?.(onMediaChange);

  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeyDown);
  window.removeEventListener("popstate", onHistoryNavigation);
  window.removeEventListener("hashchange", onHistoryNavigation);
  window.removeEventListener("pageshow", setMobileDocumentState);

  observer?.disconnect?.();
  observer = null;
  mediaQuery = null;
  initialized = false;

  for (const node of [document.documentElement, document.body].filter(Boolean)) {
    delete node.dataset.mobileShell;
    delete node.dataset.mobileNavigation;
  }

  return MOBILE_SHELL;
}

export function getMobileShellSnapshot() {
  return Object.freeze({
    version: MOBILE_SHELL_VERSION,
    initialized,
    mobile: isMobile(),
    sidebarOpen: sidebarIsOpen(),
    shellVisible: shellIsVisible(),
    desktopOpenBeforeMobile,
  });
}

export const MOBILE_SHELL = Object.freeze({
  version: MOBILE_SHELL_VERSION,
  init: initMobileShell,
  destroy: destroyMobileShell,
  getSnapshot: getMobileShellSnapshot,
});

initMobileShell();

export default MOBILE_SHELL;
