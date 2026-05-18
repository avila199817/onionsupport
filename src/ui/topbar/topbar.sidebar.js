/* =========================================================
   Onion Support - Topbar Sidebar Bridge
   Archivo: /src/ui/topbar/topbar.sidebar.js

   Responsabilidad:
   - Compat mínima Topbar ↔ Sidebar.
   - Delegar en AppCore.SidebarUI si existe.
   - Fallback DOM simple para móvil.
   - Limpiar residuos mobile en desktop.
   - Sin imports.
   - Sin helpers externos.
   - Sin storage.
   - Sin CustomEvent.
   - Sin layout/offset permanente desde JS.
   - Sin magia negra.
   - El topbar real vive en src/ui/topbar/index.js.
========================================================= */

export const TOPBAR_SIDEBAR_VERSION = "simple";

const SOURCE = "topbar.sidebar";
const MOBILE_BREAKPOINT = 900;

const SIDEBAR_OPEN_CLASS = "sidebar-open";
const SIDEBAR_MOBILE_OPEN_CLASS = "sidebar-mobile-open";
const SIDEBAR_TOGGLE_ACTIVE_CLASS = "is-active";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

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

function emit(AppCore = null, eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: TOPBAR_SIDEBAR_VERSION,
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

function safeDom(getDom = null) {
  try {
    return isFunction(getDom) ? getDom() || {} : {};
  } catch {
    return {};
  }
}

function isElement(value = null) {
  return Boolean(value && value.nodeType === 1);
}

/* =========================================================
   DOM
========================================================= */

function query(selector = "") {
  if (!isBrowser() || !selector) return null;

  try {
    if (selector.startsWith("#")) {
      return document.getElementById(selector.slice(1));
    }

    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function bodyEl() {
  return isBrowser() ? document.body : null;
}

function sidebarEl(getDom = null) {
  const dom = safeDom(getDom);

  return (
    dom.sidebar ||
    query("#app-sidebar") ||
    query("#sidebar") ||
    query("[data-sidebar-root]") ||
    null
  );
}

function toggleEl(getDom = null) {
  const dom = safeDom(getDom);

  return (
    dom.mobileToggle ||
    dom.sidebarToggle ||
    dom.mobileSidebarToggle ||
    dom.toggleSidebarMobile ||
    query("[data-topbar-sidebar-toggle]") ||
    query("#toggleSidebarMobile") ||
    null
  );
}

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  try {
    node.hidden = Boolean(hidden);
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SIDEBAR MODULE
========================================================= */

export function getSidebarModule(AppCore = null) {
  try {
    return (
      AppCore?.SidebarUI ||
      AppCore?.Sidebar ||
      AppCore?.sidebarUI ||
      AppCore?.sidebar ||
      AppCore?.modules?.get?.("SidebarUI") ||
      AppCore?.modules?.get?.("Sidebar") ||
      AppCore?.modules?.get?.("sidebarUI") ||
      AppCore?.modules?.get?.("sidebar") ||
      null
    );
  } catch {
    return null;
  }
}

function callSidebar(sidebar = null, action = "", payload = {}) {
  if (!sidebar || !action) return false;

  const methods = {
    open: ["openSidebar", "open", "expandSidebar"],
    close: ["closeSidebar", "close", "collapseSidebar"],
    toggle: ["toggleSidebar", "toggle"],
  };

  for (const name of methods[action] || []) {
    try {
      if (!isFunction(sidebar?.[name])) continue;

      const result = sidebar[name]({
        source: SOURCE,
        mobile: true,
        ...payload,
      });

      return result !== false;
    } catch {
      // probar siguiente método
    }
  }

  return false;
}

/* =========================================================
   VIEWPORT / STATE
========================================================= */

function isMobile() {
  if (!isBrowser()) return false;

  try {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  } catch {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }
}

function routeChromeHidden(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};
  const body = bodyEl();

  return Boolean(
    state.chromeHidden ||
      state.shellHidden ||
      state.routeShellHidden ||
      state.routeMode === "auth" ||
      body?.classList?.contains?.("route-auth") ||
      body?.classList?.contains?.("shell-hidden") ||
      body?.dataset?.routeMode === "auth" ||
      body?.dataset?.chrome === "hidden"
  );
}

export function getSidebarMobileOpenState(sidebar = null) {
  if (!isBrowser()) return false;

  const node = sidebar || sidebarEl();
  const body = bodyEl();

  return Boolean(
    body?.classList?.contains?.(SIDEBAR_OPEN_CLASS) ||
      node?.classList?.contains?.("is-open") ||
      node?.classList?.contains?.("open") ||
      node?.classList?.contains?.(SIDEBAR_MOBILE_OPEN_CLASS) ||
      node?.dataset?.open === "true" ||
      node?.dataset?.mobileOpen === "true"
  );
}

/* =========================================================
   DOM FALLBACK
========================================================= */

function applyMobileDom(open = false, getDom = null) {
  const nextOpen = Boolean(open);
  const sidebar = sidebarEl(getDom);
  const body = bodyEl();

  try {
    body?.classList?.toggle?.(SIDEBAR_OPEN_CLASS, nextOpen);
  } catch {
    // noop
  }

  if (sidebar) {
    try {
      sidebar.classList.toggle("is-open", nextOpen);
      sidebar.classList.toggle("open", nextOpen);
      sidebar.classList.toggle(SIDEBAR_MOBILE_OPEN_CLASS, nextOpen);

      sidebar.dataset.open = nextOpen ? "true" : "false";
      sidebar.dataset.mobileOpen = nextOpen ? "true" : "false";
      sidebar.dataset.mode = isMobile() ? "mobile" : "desktop";

      sidebar.setAttribute("aria-hidden", nextOpen ? "false" : "true");

      if (nextOpen) sidebar.removeAttribute("inert");
      else sidebar.setAttribute("inert", "");
    } catch {
      // noop
    }
  }

  setMobileToggleState(getDom);

  return true;
}

function clearMobileResidue(getDom = null) {
  const sidebar = sidebarEl(getDom);
  const body = bodyEl();

  try {
    body?.classList?.remove?.(SIDEBAR_OPEN_CLASS, "sidebar-closing");
  } catch {
    // noop
  }

  if (sidebar) {
    try {
      sidebar.classList.remove(SIDEBAR_MOBILE_OPEN_CLASS, "mobile-open", "is-mobile-open");
      sidebar.dataset.mobileOpen = "false";
      sidebar.dataset.mobile = "false";
      sidebar.dataset.mode = "desktop";

      if (!routeChromeHidden()) {
        sidebar.setAttribute("aria-hidden", "false");
        sidebar.removeAttribute("inert");
      }
    } catch {
      // noop
    }
  }

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  return true;
}

/* =========================================================
   TOPBAR TOGGLE
========================================================= */

export function setMobileToggleState(getDom = null) {
  const toggle = toggleEl(getDom);

  if (!toggle) return false;

  const sidebar = sidebarEl(getDom);
  const mobile = isMobile();
  const open = mobile && getSidebarMobileOpenState(sidebar);

  try {
    toggle.hidden = !mobile;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    toggle.dataset.state = open ? "open" : "closed";
    toggle.dataset.mobile = mobile ? "true" : "false";
    toggle.classList.toggle(SIDEBAR_TOGGLE_ACTIVE_CLASS, open);

    if (sidebar?.id) {
      toggle.setAttribute("aria-controls", sidebar.id);
    }

    return true;
  } catch {
    return false;
  }
}

export function syncFixedTopbarOffset(getDom = null) {
  const topbar = safeDom(getDom).topbar || query("#app-topbar") || query("#topbar");

  if (!topbar) return false;

  try {
    topbar.style.left = "";
    topbar.style.right = "";
    topbar.style.width = "";
    topbar.style.marginLeft = "";
    topbar.style.marginRight = "";
    topbar.style.insetInlineStart = "";
    topbar.style.insetInlineEnd = "";
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ACTIONS
========================================================= */

export function openSidebarMobile({ AppCore = null, getDom = null } = {}) {
  if (!isMobile() || routeChromeHidden(AppCore)) {
    clearMobileResidue(getDom);
    return false;
  }

  const sidebar = getSidebarModule(AppCore);
  const handled = callSidebar(sidebar, "open", {
    open: true,
  });

  if (!handled) {
    applyMobileDom(true, getDom);
  }

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  emit(AppCore, "topbar:sidebar:mobile-synced", {
    open: true,
    handledByModule: handled,
    action: "open",
  });

  return true;
}

export function closeSidebarMobile({ AppCore = null, getDom = null } = {}) {
  if (!isMobile()) {
    clearMobileResidue(getDom);
    return false;
  }

  const sidebar = getSidebarModule(AppCore);
  const handled = callSidebar(sidebar, "close", {
    open: false,
  });

  if (!handled) {
    applyMobileDom(false, getDom);
  }

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  emit(AppCore, "topbar:sidebar:mobile-synced", {
    open: false,
    handledByModule: handled,
    action: "close",
  });

  return true;
}

export function toggleSidebarMobile({ AppCore = null, getDom = null } = {}) {
  if (!isMobile() || routeChromeHidden(AppCore)) {
    clearMobileResidue(getDom);
    return false;
  }

  const sidebar = sidebarEl(getDom);
  const nextOpen = !getSidebarMobileOpenState(sidebar);
  const sidebarModule = getSidebarModule(AppCore);

  const handled =
    callSidebar(sidebarModule, nextOpen ? "open" : "close", {
      open: nextOpen,
    }) ||
    callSidebar(sidebarModule, "toggle", {
      open: nextOpen,
    });

  if (!handled) {
    applyMobileDom(nextOpen, getDom);
  }

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  emit(AppCore, "topbar:sidebar:mobile-synced", {
    open: nextOpen,
    handledByModule: handled,
    action: "toggle",
  });

  return true;
}

export function handleViewportResize(getDom = null, closeSidebarMobileFn = null) {
  if (!isMobile()) {
    try {
      closeSidebarMobileFn?.();
    } catch {
      // noop
    }

    clearMobileResidue(getDom);
    return true;
  }

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
