/* =========================================================
   Onion Support - Mobile Shell
   Archivo: /src/features/mobile-shell/index.js

   Responsabilidad:
   - Coordinar Topbar + Sidebar como un único chrome <= 900px.
   - Mantener el único trigger móvil dentro del Topbar.
   - Abrir Sidebar como drawer off-canvas sin desplazar la vista.
   - Cerrar por backdrop, navegación, Escape o historial.
   - Restaurar el estado desktop al abandonar el breakpoint móvil.
   - Sin HTTP, Auth, Router, Store ni lógica de dominio.
========================================================= */

import { SidebarUI } from "../../ui/sidebar/index.js";
import {
  ensureAppChromeTemplate,
  getAppChromeTemplateRefs,
  setAppChromeTemplateState,
} from "../../ui/chrome/template.js";

export const MOBILE_SHELL_VERSION =
  "mobile-shell.v2-unified-topbar-drawer-glass";

const MOBILE_QUERY = "(max-width: 900px)";
const SIDEBAR_ROOT_SELECTOR = "[data-sidebar-root='true'], #app-sidebar";
const SIDEBAR_NAV_LINK_SELECTOR =
  "[data-sidebar-nav-link='true'], [data-sidebar-brand='true']";
const MENU_TOGGLE_SELECTOR = "[data-topbar-menu-toggle='true']";
const BACKDROP_SELECTOR = "[data-app-chrome-backdrop='true']";
const CHROME_ROOT_SELECTOR = "#app-chrome, [data-app-chrome='true']";

let initialized = false;
let mediaQuery = null;
let desktopOpenBeforeMobile = true;
let stateObserver = null;
let chromeObserver = null;

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

  const refs = getAppChromeTemplateRefs();
  const mount =
    refs.sidebarMount ||
    document.getElementById("sidebar-mount") ||
    document.querySelector("[data-sidebar-mount]");

  return Boolean(
    mount &&
    mount.hidden !== true &&
    bodySidebarState() !== "hidden"
  );
}

function syncMobileShellState() {
  if (!isBrowser()) return false;

  ensureAppChromeTemplate();

  const mobile = isMobile();
  const visible = shellIsVisible();
  const open = mobile && visible && sidebarIsOpen();

  for (const node of [document.documentElement, document.body].filter(Boolean)) {
    if (mobile) {
      node.dataset.mobileShell = "true";
      node.dataset.mobileNavigation = open ? "open" : "closed";
    } else {
      delete node.dataset.mobileShell;
      delete node.dataset.mobileNavigation;
    }
  }

  setAppChromeTemplateState({
    mobile,
    visible,
    open,
  });

  return true;
}

function focusToggle() {
  const toggle = getAppChromeTemplateRefs().menuToggle;
  if (!toggle || typeof toggle.focus !== "function") return false;

  try {
    toggle.focus({ preventScroll: true });
  } catch {
    toggle.focus();
  }

  return true;
}

function openMobileSidebar() {
  if (!isMobile() || !shellIsVisible()) return false;

  try {
    SidebarUI.openSidebar?.();
  } catch {
    return false;
  }

  syncMobileShellState();
  return true;
}

function closeMobileSidebar({ focus = false } = {}) {
  if (!isMobile()) return false;

  try {
    SidebarUI.closeSidebar?.();
  } catch {
    return false;
  }

  syncMobileShellState();

  if (focus) {
    window.requestAnimationFrame(() => {
      focusToggle();
    });
  }

  return true;
}

function toggleMobileSidebar() {
  if (!isMobile() || !shellIsVisible()) return false;

  if (sidebarIsOpen()) {
    return closeMobileSidebar();
  }

  return openMobileSidebar();
}

function enterMobileMode() {
  if (!isBrowser()) return false;

  try {
    desktopOpenBeforeMobile = SidebarUI.getSnapshot?.().open !== false;
  } catch {
    desktopOpenBeforeMobile = true;
  }

  closeMobileSidebar();
  syncMobileShellState();
  return true;
}

function leaveMobileMode() {
  if (!isBrowser()) return false;

  syncMobileShellState();

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

  syncMobileShellState();
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
  const backdrop = target?.closest?.(BACKDROP_SELECTOR);

  if (!backdrop) return;

  /*
    El backdrop es una superficie real del chrome. El primer toque fuera
    pertenece al backdrop, cierra el drawer y nunca atraviesa al contenido.
  */
  event.preventDefault();
  event.stopPropagation();
  closeMobileSidebar();
}

function onDocumentClick(event) {
  if (!isMobile()) return;

  const target = eventElement(event.target);
  if (!target) return;

  const toggle = target.closest?.(MENU_TOGGLE_SELECTOR);

  if (toggle) {
    event.preventDefault();
    event.stopPropagation();
    toggleMobileSidebar();
    return;
  }

  const link = target.closest?.(SIDEBAR_NAV_LINK_SELECTOR);
  const sidebar = getSidebarRoot();

  if (!link || !sidebar?.contains?.(link)) return;

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

function mutationNeedsChromeSync(mutation) {
  if (mutation?.type !== "childList" || !mutation.addedNodes?.length) {
    return false;
  }

  for (const node of mutation.addedNodes) {
    if (node.nodeType !== 1) continue;

    if (
      node.matches?.(
        `${SIDEBAR_ROOT_SELECTOR}, [data-topbar-root='true'], #app-topbar`
      ) ||
      node.querySelector?.(
        `${SIDEBAR_ROOT_SELECTOR}, [data-topbar-root='true'], #app-topbar`
      )
    ) {
      return true;
    }
  }

  return false;
}

function attachStateObserver() {
  if (!isBrowser() || stateObserver || !document.body) return false;

  stateObserver = new MutationObserver(() => {
    syncMobileShellState();
  });

  stateObserver.observe(document.body, {
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

function attachChromeObserver() {
  if (!isBrowser() || chromeObserver) return false;

  const chrome =
    document.querySelector(CHROME_ROOT_SELECTOR) ||
    ensureAppChromeTemplate().chrome;

  if (!chrome) return false;

  chromeObserver = new MutationObserver((mutations) => {
    if (mutations.some(mutationNeedsChromeSync)) {
      syncMobileShellState();
    }
  });

  chromeObserver.observe(chrome, {
    childList: true,
    subtree: true,
  });

  return true;
}

function bindMediaQuery() {
  if (!mediaQuery) return false;

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", onMediaChange);
    return true;
  }

  mediaQuery.addListener?.(onMediaChange);
  return true;
}

function unbindMediaQuery() {
  if (!mediaQuery) return false;

  if (typeof mediaQuery.removeEventListener === "function") {
    mediaQuery.removeEventListener("change", onMediaChange);
    return true;
  }

  mediaQuery.removeListener?.(onMediaChange);
  return true;
}

function onPageShow() {
  syncMobileShellState();
}

export function initMobileShell() {
  if (!isBrowser() || initialized) return MOBILE_SHELL;

  initialized = true;
  mediaQuery = window.matchMedia(MOBILE_QUERY);

  ensureAppChromeTemplate();
  attachStateObserver();
  attachChromeObserver();

  if (mediaQuery.matches) {
    enterMobileMode();
  } else {
    syncMobileShellState();
  }

  bindMediaQuery();

  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeyDown);
  window.addEventListener("popstate", onHistoryNavigation);
  window.addEventListener("hashchange", onHistoryNavigation);
  window.addEventListener("pageshow", onPageShow);

  window.requestAnimationFrame(() => {
    syncMobileShellState();
  });

  return MOBILE_SHELL;
}

export function destroyMobileShell() {
  if (!isBrowser() || !initialized) return MOBILE_SHELL;

  unbindMediaQuery();

  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeyDown);
  window.removeEventListener("popstate", onHistoryNavigation);
  window.removeEventListener("hashchange", onHistoryNavigation);
  window.removeEventListener("pageshow", onPageShow);

  stateObserver?.disconnect?.();
  chromeObserver?.disconnect?.();
  stateObserver = null;
  chromeObserver = null;
  mediaQuery = null;
  initialized = false;

  for (const node of [document.documentElement, document.body].filter(Boolean)) {
    delete node.dataset.mobileShell;
    delete node.dataset.mobileNavigation;
  }

  setAppChromeTemplateState({
    mobile: false,
    visible: shellIsVisible(),
    open: false,
  });

  return MOBILE_SHELL;
}

export function getMobileShellSnapshot() {
  const refs = getAppChromeTemplateRefs();

  return Object.freeze({
    version: MOBILE_SHELL_VERSION,
    initialized,
    mobile: isMobile(),
    sidebarOpen: sidebarIsOpen(),
    shellVisible: shellIsVisible(),
    chromeMounted: Boolean(refs.chrome),
    menuToggleMounted: Boolean(refs.menuToggle),
    backdropMounted: Boolean(refs.backdrop),
    desktopOpenBeforeMobile,
  });
}

export const MOBILE_SHELL = Object.freeze({
  version: MOBILE_SHELL_VERSION,
  init: initMobileShell,
  destroy: destroyMobileShell,
  open: openMobileSidebar,
  close: closeMobileSidebar,
  toggle: toggleMobileSidebar,
  sync: syncMobileShellState,
  getSnapshot: getMobileShellSnapshot,
});

initMobileShell();

export default MOBILE_SHELL;
