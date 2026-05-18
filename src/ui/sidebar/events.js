/* =========================================================
   Onion Support - Sidebar Events
   Archivo: /src/ui/sidebar/events.js

   Responsabilidad:
   - Compat mínima de eventos Sidebar.
   - Sin imports.
   - Sin submódulos.
   - Sin route aliases.
   - Sin username public slug.
   - Sin core event storms.
   - Sin theme/lang listeners.
   - Sin CustomEvent.
   - Sin timers complejos.
   - Sin magia negra.
   - El sidebar real vive en src/ui/sidebar/index.js.
========================================================= */

export const SIDEBAR_EVENTS_VERSION = "simple";

const SOURCE = "sidebar.events";
const DEFAULT_SCOPE = "ui:sidebar";
const HANDLED_FLAG = "__onionSidebarHandled";

const cleanups = new Map();

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

function scopeName(scope = DEFAULT_SCOPE) {
  return text(scope, DEFAULT_SCOPE);
}

function emit(AppCore = null, eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: SIDEBAR_EVENTS_VERSION,
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

function sidebarRoot(AppCore = null, resolver = null) {
  try {
    const elements = isFunction(resolver) ? resolver() : null;

    if (elements?.sidebar) return elements.sidebar;
    if (elements?.sidebarRoot) return elements.sidebarRoot;
  } catch {
    // noop
  }

  if (!isBrowser()) return null;

  return (
    AppCore?.dom?.sidebar ||
    AppCore?.dom?.sidebarRoot ||
    document.getElementById("app-sidebar") ||
    document.getElementById("sidebar") ||
    query("[data-sidebar-root]")
  );
}

function sidebarMenu(AppCore = null, resolver = null) {
  try {
    const elements = isFunction(resolver) ? resolver() : null;

    if (elements?.sidebarMenu) return elements.sidebarMenu;
  } catch {
    // noop
  }

  const root = sidebarRoot(AppCore, resolver);

  return (
    query("[data-sidebar-nav]", root) ||
    query(".sidebar-nav", root) ||
    query(".sidebar-menu", root) ||
    null
  );
}

function targetOf(eventOrTarget = null) {
  const target = eventOrTarget?.target || eventOrTarget;

  try {
    if (target?.nodeType === 3) return target.parentElement;
  } catch {
    // noop
  }

  return target || null;
}

function closest(target = null, selector = "") {
  try {
    return target?.closest?.(selector) || null;
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

function markHandled(event = null, reason = "") {
  try {
    event[HANDLED_FLAG] = true;
    event.__onionSidebarReason = reason;
    return true;
  } catch {
    return false;
  }
}

function wasHandled(event = null) {
  return Boolean(event?.[HANDLED_FLAG]);
}

function prevent(event = null) {
  try {
    event?.preventDefault?.();
  } catch {
    // noop
  }

  try {
    event?.stopPropagation?.();
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   ROUTES
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/");

  if (!value) return "";
  if (/^(javascript:|data:|vbscript:|file:|mailto:|tel:)/i.test(value)) return "";
  if (value.startsWith("//")) return "";

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  try {
    if (/^https?:\/\//i.test(value) && isBrowser()) {
      const url = new URL(value, window.location.origin);

      if (url.origin !== window.location.origin) return "";

      value = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return "";
  }

  if (value.startsWith("#")) return "";

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function canonicalPath(path = "/") {
  let value = normalizePath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function routeFromElement(element = null) {
  if (!element) return "";

  return normalizePath(
    element.dataset?.route ||
      element.dataset?.href ||
      element.dataset?.to ||
      element.getAttribute?.("data-route") ||
      element.getAttribute?.("data-href") ||
      element.getAttribute?.("data-to") ||
      element.getAttribute?.("href") ||
      ""
  );
}

function currentPath(AppCore = null, Router = null, payload = {}) {
  try {
    const routerPath =
      Router?.getCurrentCanonicalPath?.() ||
      Router?.getCurrentPublicPath?.() ||
      Router?.getCurrentPath?.();

    if (routerPath) return canonicalPath(routerPath);
  } catch {
    // noop
  }

  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return canonicalPath(
    payload.publicPath ||
      payload.path ||
      payload.route ||
      state.canonicalPath ||
      state.route ||
      state.publicPath ||
      (isBrowser() ? window.location.pathname : "/") ||
      "/"
  );
}

function getRouter(AppCore = null, Router = null) {
  try {
    return (
      Router ||
      AppCore?.Router ||
      AppCore?.router ||
      AppCore?.modules?.get?.("Router") ||
      AppCore?.modules?.get?.("router") ||
      null
    );
  } catch {
    return Router || null;
  }
}

async function navigate(AppCore = null, Router = null, target = "", source = SOURCE) {
  const path = normalizePath(target);

  if (!path) return false;

  const router = getRouter(AppCore, Router);

  try {
    if (isFunction(router?.navigate)) {
      await router.navigate(path, {
        source,
      });
      return true;
    }

    if (isFunction(router?.push)) {
      await router.push(path, {
        source,
      });
      return true;
    }

    if (isFunction(router?.go)) {
      await router.go(path, {
        source,
      });
      return true;
    }
  } catch {
    return false;
  }

  if (!isBrowser()) return false;

  try {
    window.location.assign(path);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ACTIVE MENU
========================================================= */

function menuItems(menu = null) {
  if (!menu) return [];

  try {
    return [
      ...menu.querySelectorAll("[data-sidebar-nav-link], a[data-spa], a[href], [data-route]"),
    ];
  } catch {
    return [];
  }
}

function clearActive(menu = null) {
  for (const item of menuItems(menu)) {
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

  return true;
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

export function syncActiveMenuItem(ctx = {}, payload = {}) {
  const AppCore = ctx.AppCore || ctx;
  const Router = getRouter(AppCore, ctx.Router);
  const menu = sidebarMenu(AppCore, ctx.getElements);

  if (!menu) return null;

  const current = currentPath(AppCore, Router, payload);

  clearActive(menu);

  let active = null;

  for (const item of menuItems(menu)) {
    if (canonicalPath(routeFromElement(item)) === current) {
      active = item;
      break;
    }
  }

  if (active) setActive(active);

  emit(AppCore, "sidebar:active:item:synced", {
    matched: Boolean(active),
    route: active ? routeFromElement(active) : "",
    current,
  });

  return active;
}

export function syncActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore = ctx.AppCore || ctx;
  const menu = sidebarMenu(AppCore, ctx.getElements);

  if (!menu) return false;

  try {
    menu.dataset.indicatorReady = "false";
    menu.dataset.indicatorReason = options.reason || "disabled";
    menu.style.setProperty("--sidebar-indicator-opacity", "0");
  } catch {
    // noop
  }

  return true;
}

export function scheduleActiveMenuIndicator(ctx = {}, options = {}) {
  syncActiveMenuItem(ctx, options);
  return syncActiveMenuIndicator(ctx, options);
}

export function hideActiveMenuIndicator(ctx = {}, reason = "hide") {
  return syncActiveMenuIndicator(ctx, {
    reason,
    reveal: false,
  });
}

export function beginSidebarLayoutTransition(ctx = {}, reason = "transition") {
  return hideActiveMenuIndicator(ctx, `${reason}:begin`);
}

export function endSidebarLayoutTransition(ctx = {}, reason = "transition") {
  syncActiveMenuItem(ctx, {
    reason: `${reason}:end`,
  });

  return syncActiveMenuIndicator(ctx, {
    reason: `${reason}:end`,
  });
}

/* =========================================================
   HANDLERS
========================================================= */

function hiddenTarget(target = null) {
  const hidden = closest(
    target,
    "[hidden], [inert], [aria-hidden='true'], [data-sidebar-visible='false'], [data-role-visible='false'], [data-admin-visible='false']"
  );

  return Boolean(hidden);
}

function primaryClick(event = null) {
  return !event || event.button === 0;
}

function modifiedClick(event = null) {
  return Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey);
}

function browserShouldHandle(element = null, event = null) {
  if (!element) return true;
  if (!primaryClick(event) || modifiedClick(event)) return true;
  if (element.hasAttribute?.("download")) return true;
  if (element.getAttribute?.("target") === "_blank") return true;
  return false;
}

export function handleSidebarMenuClick({
  AppCore = null,
  Router = null,
  event = null,
  closeDropdown = null,
  getElements = null,
} = {}) {
  if (wasHandled(event)) return false;

  const menu = sidebarMenu(AppCore, getElements);
  const target = targetOf(event);
  const link = closest(target, "[data-sidebar-nav-link], a[data-spa], a[href], [data-route]");

  if (!menu || !link || !contains(menu, link)) return false;
  if (hiddenTarget(link)) {
    prevent(event);
    markHandled(event, "hidden-target");
    return false;
  }

  if (browserShouldHandle(link, event)) return false;

  const path = routeFromElement(link);

  if (!path) return false;

  prevent(event);
  markHandled(event, "sidebar-menu:navigate");

  try {
    closeDropdown?.();
  } catch {
    // noop
  }

  clearActive(menu);
  setActive(link);

  emit(AppCore, "sidebar:navigation:request", {
    target: path,
  });

  void navigate(AppCore, Router, path, "sidebar-menu").then(() => {
    syncActiveMenuItem({ AppCore, Router, getElements }, { path });
  });

  return true;
}

export function handleDocumentClick({
  AppCore = null,
  Router = null,
  event = null,
  toggleSidebar = null,
  toggleDropdown = null,
  closeDropdown = null,
  handleLogout = null,
  getElements = null,
} = {}) {
  if (wasHandled(event)) return false;

  const root = sidebarRoot(AppCore, getElements);
  const target = targetOf(event);

  if (!target) return false;

  const sidebarToggle = closest(target, "[data-sidebar-toggle], [data-topbar-sidebar-toggle]");
  if (sidebarToggle) {
    prevent(event);
    markHandled(event, "sidebar-toggle");
    toggleSidebar?.();
    return true;
  }

  const userToggle = closest(target, "[data-sidebar-user-toggle], [data-user-toggle]");
  if (userToggle && root && contains(root, userToggle)) {
    prevent(event);
    markHandled(event, "user-toggle");
    toggleDropdown?.();
    return true;
  }

  const logout = closest(target, "[data-sidebar-logout]");
  if (logout && root && contains(root, logout)) {
    prevent(event);
    markHandled(event, "logout");
    void handleLogout?.();
    return true;
  }

  if (handleSidebarMenuClick({ AppCore, Router, event, closeDropdown, getElements })) {
    return true;
  }

  if (root && !contains(root, target)) {
    try {
      closeDropdown?.();
    } catch {
      // noop
    }
  }

  return false;
}

export function handleUserToggleKeydown({
  event = null,
  toggleDropdown = null,
  closeDropdown = null,
  openDropdown = null,
} = {}) {
  if (wasHandled(event)) return false;

  if (event?.key === "Enter" || event?.key === " ") {
    prevent(event);
    markHandled(event, "user-toggle:key");
    toggleDropdown?.();
    return true;
  }

  if (event?.key === "Escape") {
    prevent(event);
    markHandled(event, "user-toggle:escape");
    closeDropdown?.();
    return true;
  }

  if (event?.key === "ArrowDown") {
    prevent(event);
    markHandled(event, "user-toggle:arrow-down");
    openDropdown?.();
    return true;
  }

  return false;
}

export function handleGlobalKeydown({ event = null, closeDropdown = null } = {}) {
  if (event?.key !== "Escape") return false;

  closeDropdown?.();
  return true;
}

export function handleResize({
  AppCore = null,
  Router = null,
  syncSidebarState = null,
  closeDropdown = null,
  getElements = null,
} = {}) {
  try {
    syncSidebarState?.();
  } catch {
    // noop
  }

  try {
    closeDropdown?.();
  } catch {
    // noop
  }

  syncActiveMenuItem({
    AppCore,
    Router,
    getElements,
  });

  return true;
}

/* =========================================================
   BIND / CLEANUP
========================================================= */

function addCleanup(scope = DEFAULT_SCOPE, cleanup = null) {
  if (!isFunction(cleanup)) return false;

  const key = scopeName(scope);
  const list = cleanups.get(key) || [];

  list.push(cleanup);
  cleanups.set(key, list);

  return true;
}

function bind(target = null, eventName = "", handler = null, options = undefined, scope = DEFAULT_SCOPE) {
  if (!target || !eventName || !isFunction(handler) || !isFunction(target.addEventListener)) {
    return false;
  }

  try {
    target.addEventListener(eventName, handler, options);
    addCleanup(scope, () => target.removeEventListener(eventName, handler, options));
    return true;
  } catch {
    return false;
  }
}

export function bindDomEvents(ctx = {}) {
  if (!isBrowser()) return () => {};

  const AppCore = ctx.AppCore || null;
  const scope = scopeName(ctx.scope);
  const root = sidebarRoot(AppCore, ctx.getElements);

  disposeSidebarEvents(scope);

  if (!root) return () => {};

  const clickHandler = (event) => handleDocumentClick({
    ...ctx,
    event,
  });

  const keyHandler = (event) => {
    handleUserToggleKeydown({
      ...ctx,
      event,
    });
    handleGlobalKeydown({
      ...ctx,
      event,
    });
  };

  bind(root, "click", clickHandler, false, scope);
  bind(root, "keydown", keyHandler, false, scope);

  emit(AppCore, "sidebar:dom-events:bound", {
    scope,
  });

  return () => disposeSidebarEvents(scope);
}

export function bindCoreEvents(ctx = {}) {
  const AppCore = ctx.AppCore || null;
  const scope = scopeName(ctx.scope);

  emit(AppCore, "sidebar:core-events:bound", {
    scope,
    noop: true,
  });

  return () => true;
}

export function disposeSidebarEvents(scope = DEFAULT_SCOPE) {
  const key = scopeName(scope);
  const list = cleanups.get(key) || [];

  while (list.length) {
    try {
      list.pop()?.();
    } catch {
      // noop
    }
  }

  cleanups.delete(key);

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarEventsSnapshot(scope = DEFAULT_SCOPE) {
  const key = scopeName(scope);

  return {
    version: SIDEBAR_EVENTS_VERSION,

    scope: key,
    cleanupCount: cleanups.get(key)?.length || 0,

    hasBrowser: isBrowser(),

    currentRoute: isBrowser()
      ? canonicalPath(window.location.pathname)
      : "/",

    policy: {
      compatOnly: true,
      noImports: true,
      noCoreEventStorm: true,
      noRouteAliases: true,
      noCustomEvent: true,
      noTimers: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_EVENTS_VERSION,

  bindDomEvents,
  bindCoreEvents,
  disposeSidebarEvents,
  getSidebarEventsSnapshot,

  handleDocumentClick,
  handleSidebarMenuClick,
  handleUserToggleKeydown,
  handleGlobalKeydown,
  handleResize,

  syncActiveMenuItem,
  syncActiveMenuIndicator,
  scheduleActiveMenuIndicator,
  hideActiveMenuIndicator,

  beginSidebarLayoutTransition,
  endSidebarLayoutTransition,
};
