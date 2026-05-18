/* =========================================================
   Onion Support - Sidebar State
   Archivo: /src/ui/sidebar/state.js

   Responsabilidad:
   - Compat mínima de estado visual Sidebar.
   - Sin imports.
   - Sin storage.
   - Sin route aliases.
   - Sin username public slug.
   - Sin timers/RAF complejos.
   - Sin indicator CSS avanzado.
   - Sin transitions.
   - Sin CustomEvent.
   - Sin magia negra.
   - El sidebar real vive en src/ui/sidebar/index.js.
========================================================= */

export const SIDEBAR_STATE_VERSION = "simple";

const MOBILE_BREAKPOINT = 900;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function stateOf(AppCore = null) {
  try {
    AppCore.state = isObject(AppCore.state) ? AppCore.state : {};
    return AppCore.state;
  } catch {
    return {};
  }
}

function emit(AppCore = null, eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: "sidebar.state",
      version: SIDEBAR_STATE_VERSION,
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

/* =========================================================
   DOM
========================================================= */

function query(selector = "", root = null) {
  if (!isBrowser() || !selector) return null;

  const scope = root || document;

  try {
    return scope.querySelector(selector);
  } catch {
    return null;
  }
}

function queryAll(selector = "", root = null) {
  if (!isBrowser() || !selector) return [];

  const scope = root || document;

  try {
    return [...scope.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

function sidebarRoot() {
  if (!isBrowser()) return null;

  return (
    document.getElementById("app-sidebar") ||
    document.getElementById("sidebar") ||
    query("[data-sidebar-root]")
  );
}

function sidebarMenu() {
  const root = sidebarRoot();

  return (
    query("[data-sidebar-nav]", root) ||
    query(".sidebar-nav", root) ||
    query(".sidebar-menu", root) ||
    null
  );
}

function body() {
  return isBrowser() ? document.body : null;
}

function canonicalPath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/").split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function routeFromItem(item = null) {
  if (!item) return "";

  return canonicalPath(
    item.dataset?.route ||
      item.dataset?.href ||
      item.dataset?.to ||
      item.getAttribute?.("href") ||
      "/"
  );
}

/* =========================================================
   VIEWPORT / SHELL
========================================================= */

export function isMobileViewport(breakpoint = MOBILE_BREAKPOINT) {
  if (!isBrowser()) return false;

  const px = Number(breakpoint) || MOBILE_BREAKPOINT;

  try {
    return window.matchMedia(`(max-width: ${px}px)`).matches;
  } catch {
    return window.innerWidth <= px;
  }
}

export function isRealShellHidden(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};
  const root = sidebarRoot();
  const b = body();

  return Boolean(
    state.chromeHidden ||
      state.shellHidden ||
      state.routeShellHidden ||
      state.authScreen ||
      state.routeMode === "auth" ||
      b?.classList?.contains?.("route-auth") ||
      b?.classList?.contains?.("shell-hidden") ||
      root?.hidden ||
      root?.getAttribute?.("aria-hidden") === "true"
  );
}

/* =========================================================
   OPEN STATE
========================================================= */

export function getSavedSidebarCollapsed() {
  return false;
}

export function saveSidebarCollapsed() {
  return true;
}

export function getDesiredSidebarOpenState(AppCore = null) {
  const state = stateOf(AppCore);

  if (typeof state.sidebarOpen === "boolean") {
    return state.sidebarOpen;
  }

  if (isMobileViewport()) {
    return Boolean(state.sidebarMobileOpen);
  }

  if (typeof state.sidebarDesktopOpen === "boolean") {
    return state.sidebarDesktopOpen;
  }

  return true;
}

export function isSidebarCollapsedDesktop(AppCore = null) {
  return !isMobileViewport() && !getDesiredSidebarOpenState(AppCore);
}

function applyOpenDom(open = true) {
  const value = Boolean(open);
  const root = sidebarRoot();
  const b = body();

  if (root) {
    try {
      root.classList.toggle("is-open", value);
      root.classList.toggle("open", value);
      root.classList.toggle("is-collapsed", !value);
      root.classList.toggle("collapsed", !value);
      root.dataset.open = value ? "true" : "false";
      root.dataset.collapsed = value ? "false" : "true";
      root.dataset.viewport = isMobileViewport() ? "mobile" : "desktop";
    } catch {
      // noop
    }
  }

  try {
    b?.classList?.toggle?.("sidebar-open", value);
    b?.classList?.toggle?.("sidebar-collapsed", !value && !isMobileViewport());
  } catch {
    // noop
  }

  return true;
}

export function setSidebarOpen(AppCore = null, open = true, closeDropdown = null) {
  const value = Boolean(open);
  const state = stateOf(AppCore);
  const mobile = isMobileViewport();

  if (!value) {
    try {
      closeDropdown?.();
    } catch {
      // noop
    }
  }

  state.sidebarOpen = value;
  state.sidebarCollapsed = !value && !mobile;
  state.sidebarHidden = false;
  state.sidebarViewport = mobile ? "mobile" : "desktop";
  state.sidebarMode = state.sidebarViewport;

  if (mobile) {
    state.sidebarMobileOpen = value;
  } else {
    state.sidebarDesktopOpen = value;
  }

  applyOpenDom(value);

  emit(AppCore, "sidebar:state:synced", {
    open: value,
    mobile,
    collapsed: state.sidebarCollapsed,
  });

  return true;
}

export function syncSidebarState(AppCore = null) {
  if (isRealShellHidden(AppCore)) {
    const state = stateOf(AppCore);

    state.sidebarOpen = false;
    state.sidebarHidden = true;
    state.sidebarMode = "hidden";

    const root = sidebarRoot();

    if (root) {
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      root.dataset.mode = "hidden";
    }

    return true;
  }

  const root = sidebarRoot();

  if (root) {
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    root.dataset.mode = isMobileViewport() ? "mobile" : "desktop";
  }

  return setSidebarOpen(AppCore, getDesiredSidebarOpenState(AppCore));
}

export function repairSidebarState(AppCore = null, closeDropdown = null) {
  const state = stateOf(AppCore);

  if (typeof state.sidebarDesktopOpen !== "boolean") state.sidebarDesktopOpen = true;
  if (typeof state.sidebarMobileOpen !== "boolean") state.sidebarMobileOpen = false;

  return syncSidebarState(AppCore, closeDropdown);
}

export function resetSidebarStateRuntime(AppCore = null) {
  const state = stateOf(AppCore);

  state.sidebarOpen = true;
  state.sidebarDesktopOpen = true;
  state.sidebarMobileOpen = false;
  state.sidebarCollapsed = false;
  state.sidebarHidden = false;
  state.sidebarViewport = isMobileViewport() ? "mobile" : "desktop";
  state.sidebarMode = state.sidebarViewport;

  applyOpenDom(true);

  return true;
}

/* =========================================================
   ACTIVE MENU
========================================================= */

function currentPath(AppCore = null, options = {}) {
  const opts = isObject(options) ? options : {};
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return canonicalPath(
    opts.publicPath ||
      opts.path ||
      opts.route ||
      state.publicPath ||
      state.canonicalPath ||
      state.route ||
      (isBrowser() ? window.location.pathname : "/") ||
      "/"
  );
}

function clearActive(menu = null) {
  for (const item of queryAll("[data-sidebar-nav-link], a[data-spa], a[href]", menu)) {
    try {
      item.classList.remove("active", "is-active", "router-active");
      item.removeAttribute("aria-current");
      item.dataset.active = "false";
      item.dataset.current = "false";
      item.dataset.selected = "false";
    } catch {
      // noop
    }
  }
}

function setActive(item = null) {
  if (!item) return false;

  try {
    item.classList.add("active", "is-active", "router-active");
    item.setAttribute("aria-current", "page");
    item.dataset.active = "true";
    item.dataset.current = "true";
    item.dataset.selected = "true";
    return true;
  } catch {
    return false;
  }
}

export function syncActiveMenuItem(AppCore = null, options = {}) {
  const menu = sidebarMenu();

  if (!menu) return null;

  const current = currentPath(AppCore, options);

  clearActive(menu);

  let best = null;

  for (const item of queryAll("[data-sidebar-nav-link], a[data-spa], a[href]", menu)) {
    const route = routeFromItem(item);

    if (route === current) {
      best = item;
      break;
    }
  }

  if (best) setActive(best);

  emit(AppCore, "sidebar:active:item:synced", {
    matched: Boolean(best),
    route: best ? routeFromItem(best) : "",
    current,
  });

  return best;
}

/* =========================================================
   INDICATOR COMPAT
========================================================= */

export function syncActiveMenuIndicator(AppCore = null, options = {}) {
  const menu = sidebarMenu();

  if (!menu) return false;

  try {
    menu.dataset.indicatorReady = "false";
    menu.dataset.indicatorReason = options.reason || "disabled";
    menu.style.removeProperty("--sidebar-indicator-x");
    menu.style.removeProperty("--sidebar-indicator-y");
    menu.style.removeProperty("--sidebar-indicator-w");
    menu.style.removeProperty("--sidebar-indicator-h");
    menu.style.setProperty("--sidebar-indicator-opacity", "0");
  } catch {
    // noop
  }

  return true;
}

export function scheduleActiveMenuIndicator(AppCore = null, options = {}) {
  return syncActiveMenuIndicator(AppCore, options);
}

/* =========================================================
   TOOLTIP / LABEL COMPAT
========================================================= */

export function syncTooltipMode() {
  return false;
}

export function updateToggleLabel(AppCore = null, isOpen = null) {
  const open = typeof isOpen === "boolean" ? isOpen : getDesiredSidebarOpenState(AppCore);

  const toggle =
    query("[data-topbar-sidebar-toggle]") ||
    query("[data-sidebar-toggle]") ||
    query("#toggleSidebar");

  if (!toggle) return false;

  try {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Cerrar navegación" : "Abrir navegación");
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarStateSnapshot(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};
  const root = sidebarRoot();
  const menu = sidebarMenu();

  return {
    version: SIDEBAR_STATE_VERSION,

    mobile: isMobileViewport(),
    open: getDesiredSidebarOpenState(AppCore),
    collapsed: isSidebarCollapsedDesktop(AppCore),
    shellHidden: isRealShellHidden(AppCore),

    state: {
      sidebarOpen: state.sidebarOpen ?? null,
      sidebarDesktopOpen: state.sidebarDesktopOpen ?? null,
      sidebarMobileOpen: state.sidebarMobileOpen ?? null,
      sidebarCollapsed: state.sidebarCollapsed ?? null,
      sidebarHidden: state.sidebarHidden ?? null,
      sidebarViewport: state.sidebarViewport ?? null,
      sidebarMode: state.sidebarMode ?? null,
      route: state.route ?? null,
      publicPath: state.publicPath ?? null,
      canonicalPath: state.canonicalPath ?? null,
    },

    dom: {
      hasSidebar: Boolean(root),
      hasSidebarMenu: Boolean(menu),
      sidebarHidden: Boolean(root?.hidden),
      sidebarAriaHidden: root?.getAttribute?.("aria-hidden") || "",
      sidebarClassName: root?.className || "",
      sidebarOpenDataset: root?.dataset?.open || "",
      sidebarCollapsedDataset: root?.dataset?.collapsed || "",
      sidebarMode: root?.dataset?.mode || "",
    },

    indicator: {
      ready: menu?.dataset?.indicatorReady || "",
      reason: menu?.dataset?.indicatorReason || "",
    },

    policy: {
      compatOnly: true,
      noImports: true,
      noStorage: true,
      noAliases: true,
      noCssIndicator: true,
      noTimers: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_STATE_VERSION,

  isMobileViewport,
  isRealShellHidden,

  getSavedSidebarCollapsed,
  saveSidebarCollapsed,

  getDesiredSidebarOpenState,
  isSidebarCollapsedDesktop,

  syncTooltipMode,
  updateToggleLabel,

  syncActiveMenuItem,
  syncActiveMenuIndicator,
  scheduleActiveMenuIndicator,

  syncSidebarState,
  setSidebarOpen,
  repairSidebarState,
  resetSidebarStateRuntime,

  getSidebarStateSnapshot,
};
