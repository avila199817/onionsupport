/* =========================================================
   Onion Support - Sidebar DOM
   Archivo: /src/ui/sidebar/dom.js

   Responsabilidad:
   - Compat DOM mínima para Sidebar.
   - Sin imports.
   - Sin template legacy.
   - Sin dropdown complejo.
   - Sin tooltips complejos.
   - Sin duplicate cleanup pesado.
   - Sin eventos.
   - Sin magia negra.
   - El sidebar real vive en src/ui/sidebar/index.js.
========================================================= */

export const SIDEBAR_DOM_VERSION = "simple";

const SIDEBAR_MOUNT_ID = "sidebar-mount";
const SIDEBAR_ROOT_ID = "app-sidebar";
const LEGACY_ROOT_ID = "sidebar";
const VIEW_CONTAINER_ID = "view-container";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isElement(value = null) {
  try {
    return Boolean(value && value instanceof Element);
  } catch {
    return Boolean(value && typeof value.querySelector === "function");
  }
}

function isConnected(value = null) {
  if (!isElement(value)) return false;

  try {
    return value.isConnected === true;
  } catch {
    try {
      return document.contains(value);
    } catch {
      return false;
    }
  }
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function query(selector = "", root = null) {
  if (!isBrowser() || !selector) return null;

  const scope = isConnected(root) ? root : document;

  try {
    const node = scope.querySelector(selector);
    return isConnected(node) ? node : null;
  } catch {
    return null;
  }
}

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    const node = document.getElementById(id);
    return isConnected(node) ? node : null;
  } catch {
    return null;
  }
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

function setData(node = null, key = "", value = "") {
  if (!node || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete node.dataset[key];
    } else {
      node.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function clear(node = null) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    try {
      node.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

/* =========================================================
   APPCORE CACHE
========================================================= */

function domBag(AppCore = null) {
  if (!AppCore || typeof AppCore !== "object") return null;

  try {
    AppCore.dom = AppCore.dom && typeof AppCore.dom === "object" ? AppCore.dom : {};
    return AppCore.dom;
  } catch {
    return null;
  }
}

function setDom(AppCore = null, key = "", value = null) {
  const dom = domBag(AppCore);

  if (!dom || !key) return false;

  try {
    dom[key] = isConnected(value) ? value : null;
    return true;
  } catch {
    return false;
  }
}

function getCached(AppCore = null, key = "") {
  const node = AppCore?.dom?.[key];
  return isConnected(node) ? node : null;
}

/* =========================================================
   SHELL ELEMENTS
========================================================= */

export function getViewContainerEl(AppCore = null) {
  return (
    getCached(AppCore, "viewContainer") ||
    byId(VIEW_CONTAINER_ID) ||
    byId("app-content") ||
    byId("main-content") ||
    query("[data-router-view]") ||
    null
  );
}

export function getAppContentEl(AppCore = null) {
  return (
    getCached(AppCore, "appContent") ||
    byId("app-content") ||
    null
  );
}

export function getMainContentEl(AppCore = null) {
  return (
    getCached(AppCore, "mainContent") ||
    getCached(AppCore, "main") ||
    byId("main-content") ||
    byId("app-main") ||
    query("main") ||
    null
  );
}

export function getAppShellEl(AppCore = null) {
  return (
    getCached(AppCore, "appShell") ||
    getCached(AppCore, "shell") ||
    byId("app-shell") ||
    query("[data-app-shell]") ||
    document.body ||
    null
  );
}

export function getSidebarMountEl(AppCore = null) {
  return (
    getCached(AppCore, "sidebarMount") ||
    byId(SIDEBAR_MOUNT_ID) ||
    query("[data-sidebar-mount]") ||
    null
  );
}

/* =========================================================
   SIDEBAR ROOT
========================================================= */

export function resolveSidebarRoot(AppCore = null) {
  return (
    getCached(AppCore, "sidebar") ||
    getCached(AppCore, "sidebarRoot") ||
    byId(SIDEBAR_ROOT_ID) ||
    byId(LEGACY_ROOT_ID) ||
    query("[data-sidebar-root]") ||
    null
  );
}

export function getAllSidebarRoots() {
  if (!isBrowser()) return [];

  try {
    return [
      ...new Set(
        [
          ...document.querySelectorAll("#app-sidebar, #sidebar, [data-sidebar-root]"),
        ].filter(isConnected)
      ),
    ];
  } catch {
    return [];
  }
}

export function cleanupDuplicateSidebars(primary = null) {
  if (!isBrowser() || !primary) return false;

  let changed = false;

  for (const node of getAllSidebarRoots()) {
    if (node === primary) continue;

    try {
      node.remove();
      changed = true;
    } catch {
      // noop
    }
  }

  return changed;
}

function createSidebarRoot() {
  if (!isBrowser()) return null;

  const aside = document.createElement("aside");
  aside.id = SIDEBAR_ROOT_ID;
  aside.className = "sidebar app-sidebar";
  aside.dataset.sidebarRoot = "true";
  aside.setAttribute("aria-label", "Navegación principal");

  const nav = document.createElement("nav");
  nav.className = "sidebar-nav";
  nav.dataset.sidebarNav = "true";
  nav.setAttribute("aria-label", "Secciones");

  const footer = document.createElement("footer");
  footer.className = "sidebar-footer";
  footer.dataset.sidebarFooter = "true";

  aside.append(nav, footer);

  return aside;
}

export function mountSidebar(AppCore = null, options = {}) {
  if (!isBrowser()) return null;

  let sidebar = resolveSidebarRoot(AppCore);

  if (sidebar && options.force !== true) {
    cacheDomRefs(AppCore);
    return sidebar;
  }

  if (sidebar && options.force === true) {
    try {
      sidebar.remove();
    } catch {
      // noop
    }
  }

  const mount = getSidebarMountEl(AppCore);
  const target = mount || getAppShellEl(AppCore) || document.body;

  if (!target) return null;

  sidebar = createSidebarRoot();

  try {
    if (mount) {
      clear(mount);
      mount.appendChild(sidebar);
    } else {
      target.prepend(sidebar);
    }
  } catch {
    return null;
  }

  cacheDomRefs(AppCore);

  return sidebar;
}

/* =========================================================
   ELEMENTS
========================================================= */

export function cacheDomRefs(AppCore = null) {
  if (!isBrowser()) return null;

  const sidebar = resolveSidebarRoot(AppCore);
  const sidebarMount = getSidebarMountEl(AppCore);
  const sidebarMenu = sidebar?.querySelector?.("[data-sidebar-nav], .sidebar-nav, #sidebar-menu") || null;
  const sidebarRecents = sidebar?.querySelector?.("[data-sidebar-recents], .sidebar-recents") || null;
  const userToggle = sidebar?.querySelector?.("[data-sidebar-user-toggle], [data-user-toggle]") || null;
  const userDropdown = sidebar?.querySelector?.("[data-sidebar-user-dropdown], [data-user-dropdown]") || null;
  const logoutBtn = sidebar?.querySelector?.("[data-sidebar-logout], .sidebar-logout") || null;
  const avatarEl = sidebar?.querySelector?.("[data-sidebar-avatar], .sidebar-user-avatar, .sidebar-avatar") || null;
  const avatarImage = avatarEl?.querySelector?.("img, [data-avatar-image]") || null;
  const avatarFallback = avatarEl?.querySelector?.("[data-avatar-fallback]") || null;
  const nameEl = sidebar?.querySelector?.("[data-sidebar-name], [data-user-name], .sidebar-user-name") || null;
  const planEl = sidebar?.querySelector?.("[data-sidebar-user-plan], .sidebar-user-plan") || null;
  const logoEl = sidebar?.querySelector?.("[data-sidebar-logo], .sidebar-brand, .sidebar-logo") || null;
  const serverLink = sidebar?.querySelector?.("[href='/servidor'], [data-route='/servidor']") || null;

  const sidebarToggle =
    sidebar?.querySelector?.("[data-sidebar-toggle]") ||
    byId("toggleSidebar") ||
    byId("sidebarToggle") ||
    null;

  const mobileToggleBtn =
    byId("toggleSidebarMobile") ||
    byId("sidebarMobileToggle") ||
    query("[data-sidebar-mobile-toggle]") ||
    null;

  const refs = {
    html: document.documentElement || null,
    body: document.body || null,

    appShell: getAppShellEl(AppCore),
    shell: getAppShellEl(AppCore),
    layout: getAppShellEl(AppCore),

    appContent: getAppContentEl(AppCore),
    mainContent: getMainContentEl(AppCore),
    main: getMainContentEl(AppCore),
    viewContainer: getViewContainerEl(AppCore),

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

  for (const [key, value] of Object.entries(refs)) {
    setDom(AppCore, key, value);
  }

  try {
    AppCore.dom.__sidebarDomCacheVersion = SIDEBAR_DOM_VERSION;
    AppCore.dom.__sidebarDomCachedAt = Date.now();
  } catch {
    // noop
  }

  return refs;
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
    main: null,
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

export function getElements(AppCore = null) {
  if (!isBrowser()) return emptyElements();

  return {
    ...emptyElements(),
    ...(cacheDomRefs(AppCore) || {}),
  };
}

export function hasSidebarShell(AppCore = null) {
  return Boolean(resolveSidebarRoot(AppCore));
}

/* =========================================================
   SHELL HIDDEN
========================================================= */

export function isRealShellHidden(AppCore = null) {
  const state = AppCore?.state || {};
  const body = isBrowser() ? document.body : null;
  const html = isBrowser() ? document.documentElement : null;

  return Boolean(
    state.shellVisible === false ||
      state.chromeVisible === false ||
      state.routeShellHidden === true ||
      state.shellHidden === true ||
      state.authScreen === true ||
      state.routeMode === "auth" ||
      body?.classList?.contains?.("route-auth") ||
      body?.classList?.contains?.("shell-hidden") ||
      html?.dataset?.routeMode === "auth" ||
      body?.dataset?.routeMode === "auth" ||
      body?.dataset?.chrome === "hidden" ||
      html?.dataset?.chrome === "hidden"
  );
}

export function isSidebarDomHidden(AppCore = null) {
  const sidebar = resolveSidebarRoot(AppCore);

  return Boolean(
    sidebar?.hidden ||
      sidebar?.getAttribute?.("aria-hidden") === "true" ||
      sidebar?.dataset?.mode === "hidden"
  );
}

export function isLegacyShellHidden(AppCore = null) {
  return isRealShellHidden(AppCore);
}

export function isShellHidden(AppCore = null) {
  return isRealShellHidden(AppCore);
}

/* =========================================================
   VISIBILITY
========================================================= */

export function setSidebarHidden(AppCore = null, hidden = false) {
  const sidebar = resolveSidebarRoot(AppCore);
  const value = Boolean(hidden);

  setHidden(sidebar, value);

  if (sidebar) {
    setData(sidebar, "mode", value ? "hidden" : "desktop");
  }

  return true;
}

export function revealSidebarShell(AppCore = null) {
  return setSidebarHidden(AppCore, false);
}

/* =========================================================
   FOCUS / TOOLTIP COMPAT
========================================================= */

export function blurIfInside(element = null) {
  if (!isBrowser() || !element) return false;

  try {
    const active = document.activeElement;

    if (active && active !== document.body && element.contains(active)) {
      active.blur();
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

export function focusFirstInteractive(root = null) {
  if (!root) return false;

  try {
    const target = root.querySelector("a[href], button, input, select, textarea, [tabindex]");

    if (target?.focus) {
      target.focus({ preventScroll: true });
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

export function focusSidebar(AppCore = null) {
  const sidebar = resolveSidebarRoot(AppCore);

  if (!sidebar) return false;

  try {
    if (!sidebar.hasAttribute("tabindex")) sidebar.setAttribute("tabindex", "-1");
    sidebar.focus({ preventScroll: true });
    return true;
  } catch {
    return focusFirstInteractive(sidebar);
  }
}

export function restoreSidebarFocusAttrs(AppCore = null) {
  const sidebar = resolveSidebarRoot(AppCore);

  if (!sidebar) return false;

  try {
    if (sidebar.getAttribute("tabindex") === "-1") {
      sidebar.removeAttribute("tabindex");
    }

    return true;
  } catch {
    return false;
  }
}

export function sanitizeLogoTooltipState() {
  return true;
}

export function sanitizeFooterTooltipState() {
  return true;
}

export function sanitizeSidebarTooltipState() {
  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function elementSnapshot(node = null) {
  if (!node) {
    return {
      exists: false,
    };
  }

  return {
    exists: true,
    id: node.id || "",
    tag: node.tagName?.toLowerCase?.() || "",
    hidden: Boolean(node.hidden),
    ariaHidden: node.getAttribute?.("aria-hidden") || "",
    className: text(node.className, ""),
  };
}

export function getSidebarDomSnapshot(AppCore = null) {
  const elements = getElements(AppCore);

  return {
    version: SIDEBAR_DOM_VERSION,

    hasDocument: isBrowser(),

    hasSidebarMount: Boolean(elements.sidebarMount),
    hasSidebar: Boolean(elements.sidebar),
    hasSidebarMenu: Boolean(elements.sidebarMenu),
    hasLogoutBtn: Boolean(elements.logoutBtn),
    hasName: Boolean(elements.nameEl),
    hasAppShell: Boolean(elements.appShell),
    hasViewContainer: Boolean(elements.viewContainer),

    shellHidden: isShellHidden(AppCore),
    realShellHidden: isRealShellHidden(AppCore),
    sidebarDomHidden: isSidebarDomHidden(AppCore),

    nodes: {
      mount: elementSnapshot(elements.sidebarMount),
      sidebar: elementSnapshot(elements.sidebar),
      sidebarMenu: elementSnapshot(elements.sidebarMenu),
      footer: elementSnapshot(elements.sidebar?.querySelector?.("[data-sidebar-footer]")),
      appShell: elementSnapshot(elements.appShell),
      viewContainer: elementSnapshot(elements.viewContainer),
    },

    policy: {
      compatOnly: true,
      noTemplateImport: true,
      noDropdownComplex: true,
      noTooltipComplex: true,
      noEvents: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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

  resolveSidebarRoot,
  getAllSidebarRoots,
  cleanupDuplicateSidebars,
};
