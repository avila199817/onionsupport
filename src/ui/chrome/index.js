/* =========================================================
   Onion Support - App Chrome Controller
   Archivo: /src/ui/chrome/index.js

   APP CHROME V3

   Responsabilidad:
   - Coordinar Topbar + Sidebar como una única pieza de aplicación.
   - Mantener el drawer móvil sin alterar la geometría del contenido.
   - Gestionar trigger, backdrop, Escape, foco e historial.
   - Consumir la API pública de SidebarUI, sin duplicar navegación/Auth.
   - Sin HTTP, Router, Store ni lógica de dominio.
========================================================= */

import { SidebarUI } from "../sidebar/index.js";
import {
  ensureAppChromeTemplate,
  getAppChromeTemplateRefs,
  setAppChromeTemplateState,
} from "./template.js";

export const APP_CHROME_VERSION =
  "app-chrome.controller.v3-single-layout-authority";

const MOBILE_QUERY = "(max-width: 900px)";
const SIDEBAR_NAV_LINK_SELECTOR =
  "[data-sidebar-nav-link='true'], [data-sidebar-brand='true']";
const SIDEBAR_FOCUSABLE_SELECTOR = [
  "a[href]:not([aria-disabled='true'])",
  "button:not([disabled]):not([aria-disabled='true'])",
  "[tabindex]:not([tabindex='-1']):not([aria-disabled='true'])",
].join(",");

let initialized = false;
let mediaQuery = null;
let desktopOpenBeforeMobile = true;
let documentObserver = null;
let mountsObserver = null;

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

function isMobile() {
  if (!isBrowser()) return false;

  if (!mediaQuery) {
    mediaQuery = window.matchMedia(MOBILE_QUERY);
  }

  return mediaQuery.matches === true;
}

function sidebarState() {
  if (!isBrowser()) return "hidden";

  return (
    document.body?.dataset?.sidebarState ||
    document.documentElement?.dataset?.sidebarState ||
    "hidden"
  );
}

function sidebarIsOpen() {
  const state = sidebarState();
  if (state === "open") return true;
  if (state === "collapsed" || state === "hidden") return false;

  try {
    return SidebarUI.getSnapshot?.().open === true;
  } catch {
    return false;
  }
}

function chromeIsVisible() {
  const refs = getAppChromeTemplateRefs();

  return Boolean(
    refs.sidebarMount &&
    refs.topbarMount &&
    refs.sidebarMount.hidden !== true &&
    refs.topbarMount.hidden !== true &&
    sidebarState() !== "hidden"
  );
}

function setNodeInert(node = null, inert = false) {
  if (!node) return false;

  const next = inert === true;
  let changed = false;

  try {
    if ("inert" in node && node.inert !== next) {
      node.inert = next;
      changed = true;
    }
  } catch {
    // El focus trap mantiene fallback de teclado.
  }

  if (node.dataset) {
    const value = next ? "true" : "false";
    if (node.dataset.appChromeInert !== value) {
      node.dataset.appChromeInert = value;
      changed = true;
    }
  }

  return changed;
}

function syncBackgroundInteractivity(open = false) {
  if (!isBrowser()) return false;

  const refs = getAppChromeTemplateRefs();
  const main =
    document.getElementById("main-content") ||
    document.querySelector("[data-main-content='true']");

  let changed = false;
  changed = setNodeInert(main, open) || changed;
  changed = setNodeInert(refs.topbar, open) || changed;
  return changed;
}

function syncDocumentState({ mobile, visible, open }) {
  const navigation =
    !visible
      ? "hidden"
      : open
        ? "open"
        : "closed";

  for (const node of [document.documentElement, document.body].filter(Boolean)) {
    node.dataset.appChromeMode = mobile ? "mobile" : "desktop";
    node.dataset.appChromeNavigation = navigation;

    /* Compatibilidad temporal con diagnósticos anteriores. */
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

export function syncAppChrome() {
  if (!isBrowser()) return false;

  ensureAppChromeTemplate();

  const mobile = isMobile();
  const visible = chromeIsVisible();
  const open = mobile && visible && sidebarIsOpen();

  syncDocumentState({ mobile, visible, open });

  setAppChromeTemplateState({
    mobile,
    visible,
    open,
  });

  syncBackgroundInteractivity(open);
  return true;
}

function isFocusable(node = null) {
  if (!node || typeof node.focus !== "function") return false;

  if (
    node.hidden === true ||
    node.disabled === true ||
    node.getAttribute?.("aria-hidden") === "true" ||
    node.getAttribute?.("aria-disabled") === "true"
  ) {
    return false;
  }

  try {
    return node.getClientRects().length > 0;
  } catch {
    return true;
  }
}

function focusNode(node = null) {
  if (!isFocusable(node)) return false;

  try {
    node.focus({ preventScroll: true });
  } catch {
    try {
      node.focus();
    } catch {
      return false;
    }
  }

  return true;
}

function sidebarFocusableItems() {
  const sidebar = getAppChromeTemplateRefs().sidebar;
  if (!sidebar) return [];

  try {
    return Array.from(
      sidebar.querySelectorAll(SIDEBAR_FOCUSABLE_SELECTOR)
    ).filter(isFocusable);
  } catch {
    return [];
  }
}

function focusMenuToggle() {
  return focusNode(getAppChromeTemplateRefs().menuToggle);
}

function focusSidebarEntry() {
  const refs = getAppChromeTemplateRefs();
  const sidebar = refs.sidebar;
  if (!sidebar) return false;

  const target =
    sidebar.querySelector?.(
      "[data-sidebar-nav-link='true'][aria-current='page']"
    ) ||
    sidebar.querySelector?.("[data-sidebar-brand='true']") ||
    sidebarFocusableItems()[0] ||
    null;

  return focusNode(target);
}

export function openAppChromeNavigation({ focus = true } = {}) {
  if (!isMobile() || !chromeIsVisible()) return false;

  try {
    SidebarUI.openSidebar?.();
  } catch {
    return false;
  }

  syncAppChrome();

  if (focus) {
    window.requestAnimationFrame(focusSidebarEntry);
  }

  return true;
}

export function closeAppChromeNavigation({ focus = false } = {}) {
  if (!isMobile()) return false;

  try {
    SidebarUI.closeSidebar?.();
  } catch {
    return false;
  }

  syncAppChrome();

  if (focus) {
    window.requestAnimationFrame(focusMenuToggle);
  }

  return true;
}

export function toggleAppChromeNavigation() {
  if (!isMobile() || !chromeIsVisible()) return false;

  return sidebarIsOpen()
    ? closeAppChromeNavigation({ focus: true })
    : openAppChromeNavigation({ focus: true });
}

function enterMobileMode() {
  try {
    desktopOpenBeforeMobile = SidebarUI.getSnapshot?.().open !== false;
  } catch {
    desktopOpenBeforeMobile = true;
  }

  closeAppChromeNavigation({ focus: false });
  syncAppChrome();
}

function leaveMobileMode() {
  syncBackgroundInteractivity(false);

  if (desktopOpenBeforeMobile && chromeIsVisible()) {
    try {
      SidebarUI.openSidebar?.();
    } catch {
      // Puede desmontarse durante una transición de ruta.
    }
  }

  syncAppChrome();
}

function onMediaChange(event) {
  if (event.matches) {
    enterMobileMode();
  } else {
    leaveMobileMode();
  }
}

function onPointerDown(event) {
  if (!isMobile() || !sidebarIsOpen()) return;

  const target = eventElement(event.target);
  const backdrop = target?.closest?.("[data-app-chrome-backdrop='true']");
  if (!backdrop) return;

  event.preventDefault();
  event.stopPropagation();
  closeAppChromeNavigation({ focus: true });
}

function onClick(event) {
  if (!isMobile()) return;

  const target = eventElement(event.target);
  if (!target) return;

  if (target.closest?.("[data-topbar-menu-toggle='true']")) {
    event.preventDefault();
    event.stopPropagation();
    toggleAppChromeNavigation();
    return;
  }

  const link = target.closest?.(SIDEBAR_NAV_LINK_SELECTOR);
  const sidebar = getAppChromeTemplateRefs().sidebar;

  if (!link || !sidebar?.contains?.(link)) return;

  window.queueMicrotask(() => {
    closeAppChromeNavigation({ focus: false });
  });
}

function trapTab(event) {
  if (event.key !== "Tab" || !sidebarIsOpen()) return false;

  const items = sidebarFocusableItems();
  if (!items.length) {
    event.preventDefault();
    return true;
  }

  const sidebar = getAppChromeTemplateRefs().sidebar;
  const active = document.activeElement;
  const first = items[0];
  const last = items.at(-1);
  const inside = sidebar?.contains?.(active) === true;

  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      focusNode(last);
      return true;
    }
    return false;
  }

  if (!inside || active === last) {
    event.preventDefault();
    focusNode(first);
    return true;
  }

  return false;
}

function onKeyDown(event) {
  if (!isMobile() || !sidebarIsOpen()) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeAppChromeNavigation({ focus: true });
    return;
  }

  trapTab(event);
}

function onHistoryNavigation() {
  if (isMobile() && sidebarIsOpen()) {
    closeAppChromeNavigation({ focus: false });
  }
}

function attachObservers() {
  if (!isBrowser()) return false;

  if (!documentObserver && document.body) {
    documentObserver = new MutationObserver(syncAppChrome);
    documentObserver.observe(document.body, {
      attributes: true,
      attributeFilter: [
        "class",
        "data-sidebar-state",
        "data-sidebar-open",
        "data-sidebar-hidden",
      ],
    });
  }

  if (!mountsObserver) {
    const refs = ensureAppChromeTemplate();
    const targets = [refs.topbarMount, refs.sidebarMount].filter(Boolean);

    if (targets.length) {
      mountsObserver = new MutationObserver(syncAppChrome);

      for (const target of targets) {
        mountsObserver.observe(target, {
          childList: true,
          attributes: true,
          attributeFilter: ["hidden", "aria-hidden"],
        });
      }
    }
  }

  return true;
}

function bindMediaQuery() {
  if (!mediaQuery) return false;

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", onMediaChange);
  } else {
    mediaQuery.addListener?.(onMediaChange);
  }

  return true;
}

function unbindMediaQuery() {
  if (!mediaQuery) return false;

  if (typeof mediaQuery.removeEventListener === "function") {
    mediaQuery.removeEventListener("change", onMediaChange);
  } else {
    mediaQuery.removeListener?.(onMediaChange);
  }

  return true;
}

export function initAppChrome() {
  if (!isBrowser() || initialized) return AppChromeUI;

  initialized = true;
  mediaQuery = window.matchMedia(MOBILE_QUERY);

  ensureAppChromeTemplate();
  attachObservers();
  bindMediaQuery();

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("popstate", onHistoryNavigation);
  window.addEventListener("hashchange", onHistoryNavigation);
  window.addEventListener("pageshow", syncAppChrome);

  if (mediaQuery.matches) {
    enterMobileMode();
  } else {
    syncAppChrome();
  }

  window.requestAnimationFrame(syncAppChrome);
  return AppChromeUI;
}

export function destroyAppChrome() {
  if (!isBrowser() || !initialized) return AppChromeUI;

  unbindMediaQuery();

  document.removeEventListener("pointerdown", onPointerDown, true);
  document.removeEventListener("click", onClick);
  document.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("popstate", onHistoryNavigation);
  window.removeEventListener("hashchange", onHistoryNavigation);
  window.removeEventListener("pageshow", syncAppChrome);

  documentObserver?.disconnect?.();
  mountsObserver?.disconnect?.();
  documentObserver = null;
  mountsObserver = null;
  mediaQuery = null;
  initialized = false;

  syncBackgroundInteractivity(false);

  for (const node of [document.documentElement, document.body].filter(Boolean)) {
    delete node.dataset.appChromeMode;
    delete node.dataset.appChromeNavigation;
    delete node.dataset.mobileShell;
    delete node.dataset.mobileNavigation;
  }

  setAppChromeTemplateState({
    mobile: false,
    visible: chromeIsVisible(),
    open: false,
  });

  return AppChromeUI;
}

export function getAppChromeSnapshot() {
  const refs = getAppChromeTemplateRefs();

  return Object.freeze({
    version: APP_CHROME_VERSION,
    initialized,
    mobile: isMobile(),
    visible: chromeIsVisible(),
    sidebarOpen: sidebarIsOpen(),
    chromeMounted: Boolean(refs.chrome),
    topbarMounted: Boolean(refs.topbar),
    sidebarMounted: Boolean(refs.sidebar),
    menuToggleMounted: Boolean(refs.menuToggle),
    backdropMounted: Boolean(refs.backdrop),
    desktopOpenBeforeMobile,
  });
}

export const AppChromeUI = Object.freeze({
  version: APP_CHROME_VERSION,
  init: initAppChrome,
  destroy: destroyAppChrome,
  sync: syncAppChrome,
  open: openAppChromeNavigation,
  close: closeAppChromeNavigation,
  toggle: toggleAppChromeNavigation,
  getSnapshot: getAppChromeSnapshot,
});

initAppChrome();

export default AppChromeUI;
