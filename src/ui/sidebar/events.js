/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   SIDEBAR EVENTS · SIMPLE
   - DOM: click / keydown / resize
   - Core: auth/session/route/theme/lang ready
   - navegación SPA desde sidebar
   - active item + indicator delegados en state.js
   - firebreak local contra rutas stale
   - cleanup local idempotente por scope
   - sin abrir/cerrar sidebar por navegación
========================================================= */

import {
  getElements,
  isShellHidden,
  sanitizeFooterTooltipState,
} from "./dom.js";

import {
  syncActiveMenuItem as syncActiveMenuItemBase,
  syncActiveMenuIndicator as syncActiveMenuIndicatorBase,
  scheduleActiveMenuIndicator as scheduleActiveMenuIndicatorBase,
  isRealShellHidden as isRealShellHiddenBase,
} from "./state.js";

export const SIDEBAR_EVENTS_VERSION = "sidebar-events-v17-simple";

const SOURCE = "SidebarEvents";
const OWNER = "events.js";
const DEFAULT_SCOPE = "ui:sidebar";

const INDICATOR_DELAY_MS = 40;
const ROUTER_SETTLED_DELAY_MS = 140;
const RESIZE_DEBOUNCE_MS = 120;

const HANDLED_FLAG = "__onionSidebarHandled";

const ROUTE_ALIASES = Object.freeze({
  "/home": "/",
  "/dashboard": "/",
  "/inicio": "/",
  "/tickets": "/incidencias",
  "/ticket": "/incidencias",
  "/incidents": "/incidencias",
  "/incident": "/incidencias",
  "/incidencia": "/incidencias",
  "/invoices": "/facturas",
  "/invoice": "/facturas",
  "/billing": "/facturas",
  "/factura": "/facturas",
  "/users": "/usuarios",
  "/user": "/usuarios",
  "/usuario": "/usuarios",
  "/clients": "/clientes",
  "/client": "/clientes",
  "/customers": "/clientes",
  "/customer": "/clientes",
  "/cliente": "/clientes",
  "/account": "/cuenta",
  "/profile": "/cuenta",
  "/perfil": "/cuenta",
  "/settings": "/ajustes",
  "/config": "/ajustes",
  "/configuration": "/ajustes",
  "/configuracion": "/ajustes",
  "/configuración": "/ajustes",
  "/server": "/servidor",
});

const SIDEBAR_NAV_SELECTOR = [
  "[data-sidebar-nav='true']",
  "a[data-sidebar-item='true']",
  "a[data-spa]",
  "a[data-route]",
  "a[data-href]",
  "a[data-to]",
  "a[href]",
  ".menu-item[data-route]",
  ".menu-item[data-href]",
  ".menu-item[data-to]",
].join(",");

const DROPDOWN_NAV_SELECTOR = [
  "a[data-spa]",
  "a[data-route]",
  "a[data-href]",
  "a[data-to]",
  "a[href]",
  "button[data-route]",
  "button[data-href]",
  "button[data-to]",
].join(",");

const INTERACTIVE_SELECTOR = [
  "a[data-spa]",
  "a[href]",
  "button",
  "[role='button']",
  "[data-route]",
  "[data-action]",
  "[data-sidebar-action]",
].join(",");

const HARD_HIDDEN_SELECTOR = [
  "[hidden]",
  "[inert]",
  "[data-sidebar-visible='false']",
  "[data-role-visible='false']",
].join(",");

const ADMIN_HIDDEN_SELECTOR = "[data-admin-visible='false']";
const ARIA_HIDDEN_SELECTOR = "[aria-hidden='true']";

const ACCESS_RULE_ATTRS = Object.freeze([
  "data-role",
  "data-roles",
  "data-admin-only",
  "data-sidebar-admin-only",
  "data-requires-role",
  "data-requires-roles",
  "data-required-role",
  "data-required-roles",
  "data-sidebar-role",
  "data-sidebar-roles",
  "data-permission",
  "data-permissions",
  "data-sidebar-permission",
  "data-sidebar-permissions",
  "data-scope",
  "data-scopes",
]);

const AUTH_USER_EVENTS = Object.freeze([
  "app:user:change",
  "app:user:updated",
  "auth:user:change",
  "app:session:change",
  "app:session:restored",
  "auth:session:restored",
  "auth:session:applied",
  "auth:login:session-committed",
  "app:auth:ready",
  "app:auth:change",
  "auth:change",
  "auth:updated",
  "auth:restore:success",
  "auth:token:refreshed",
]);

const AUTH_STRONG_EVENTS = Object.freeze([
  "login:success",
  "auth:login:success",
  "app:login:success",
]);

const AUTH_CLEAR_EVENTS = Object.freeze([
  "auth:login:2fa-required",
  "auth:login:error",
  "app:session:cleared",
  "auth:session:cleared",
  "auth:logout",
  "auth:logout:success",
  "logout:success",
]);

const ROUTE_EVENTS = Object.freeze([
  "app:route:change",
  "app:events:route-synced",
  "app:router:state-synced",
  "app:router:initial-render:done",
  "router:route:change",
  "router:navigation:complete",
  "router:render:async-complete",
  "router:rendered:complete",
  "app:i18n:rerender:done",
]);

const READY_EVENTS = Object.freeze([
  "app:ready",
  "app:ui:ready",
  "app:boot:ready",
  "app:boot:complete",
  "router:bound",
]);

const VISUAL_ENV_EVENTS = Object.freeze([
  "app:lang:change",
  "i18n:change",
  "app:i18n:sync",
  "theme:change",
  "app:theme:change",
  "onion:theme:change",
]);

const localCleanups = new Map();
const scopeEpochs = new Map();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function hasWindow() {
  return typeof window !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const out = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return out || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeNumber(value, fallback = 0) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

function nowTs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = nowTs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function resolveScope(scope = DEFAULT_SCOPE) {
  return safeText(scope, DEFAULT_SCOPE);
}

function scoped(scope = DEFAULT_SCOPE, type = "local") {
  return `${resolveScope(scope)}:${safeText(type, "local")}`;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarEvents]", ...args);
    return;
  } catch {}

  try {
    console.warn("[SidebarEvents]", ...args);
  } catch {}
}

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.("[SidebarEvents]", ...args);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    source: SOURCE,
    owner: OWNER,
    version: SIDEBAR_EVENTS_VERSION,
    at: safeIsoDate(),
    ts: nowTs(),
    ...safeObject(payload),
  };

  let bus = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      bus = true;
      AppCore.events.emit(name, detail);
      return true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.emit("${name}") falló`, error);
  }

  if (!bus && isBrowser() && typeof CustomEvent !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    } catch {}
  }

  return false;
}

function safeTimeout(fn, ms = 0) {
  if (!isFn(fn)) return null;

  const delay = Math.max(0, Number(ms) || 0);
  const run = () => {
    try {
      fn();
    } catch {}
  };

  try {
    if (hasWindow()) return window.setTimeout(run, delay);
  } catch {}

  run();
  return null;
}

function clearTimeoutSafe(timer) {
  if (!timer) return false;

  try {
    if (hasWindow()) {
      window.clearTimeout(timer);
      return true;
    }
  } catch {}

  return false;
}

function raf(fn) {
  if (!isFn(fn)) return null;

  const run = () => {
    try {
      fn();
    } catch {}
  };

  try {
    if (hasWindow() && isFn(window.requestAnimationFrame)) return window.requestAnimationFrame(run);
  } catch {}

  return safeTimeout(run, 0);
}

function afterFrames(fn, frames = 2) {
  if (!isFn(fn)) return;

  const total = Math.max(1, Number(frames) || 1);

  const step = (left) => {
    if (left <= 0) {
      try {
        fn();
      } catch {}
      return;
    }

    raf(() => step(left - 1));
  };

  step(total);
}

function safeIsShellHidden(AppCore) {
  try {
    if (isFn(isRealShellHiddenBase)) return Boolean(isRealShellHiddenBase(AppCore));
  } catch {}

  try {
    return Boolean(isShellHidden(AppCore));
  } catch {
    return false;
  }
}

function resolveElements(AppCore, resolver) {
  if (isFn(resolver)) {
    try {
      return resolver() || getElements(AppCore);
    } catch {}
  }

  return getElements(AppCore);
}

function isElement(value = null) {
  if (!value) return false;

  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(value && typeof value.closest === "function");
  }
}

function getElementTarget(eventOrTarget = null) {
  const target = eventOrTarget?.target || eventOrTarget;
  if (isElement(target)) return target;

  try {
    if (target && target.nodeType === 3 && isElement(target.parentElement)) return target.parentElement;
  } catch {}

  return null;
}

function isConnectedElement(value = null) {
  if (!isElement(value)) return false;

  try {
    return value.isConnected !== false;
  } catch {
    return true;
  }
}

function containsElement(parent = null, child = null) {
  if (!parent || !child) return false;

  const element = isElement(child) ? child : getElementTarget(child);

  try {
    return parent === element || parent.contains(element || child);
  } catch {
    return false;
  }
}

function getEventDetail(eventOrPayload = {}) {
  if (eventOrPayload?.detail && typeof eventOrPayload.detail === "object") return eventOrPayload.detail;
  if (eventOrPayload?.payload && typeof eventOrPayload.payload === "object") return eventOrPayload.payload;
  return safeObject(eventOrPayload);
}

function preventDefaultAndStop(event) {
  try {
    event?.preventDefault?.();
  } catch {}

  try {
    event?.stopPropagation?.();
  } catch {}

  try {
    event?.stopImmediatePropagation?.();
  } catch {}
}

/* =========================================================
   HIDDEN / ACCESS
========================================================= */

function splitAccessValues(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[,\s|;]+/)
    .map((item) => item.replace(/[\s-]+/g, "_").trim())
    .filter(Boolean);
}

function boolAttr(value = "") {
  const text = safeText(value, "").toLowerCase();
  return value === "" || ["true", "1", "yes", "si", "sí", "on"].includes(text);
}

function hasAccessRuleAttr(element = null) {
  if (!element) return false;

  return ACCESS_RULE_ATTRS.some((attr) => {
    try {
      return element.hasAttribute?.(attr);
    } catch {
      return false;
    }
  });
}

function elementRequiresAdmin(element = null) {
  if (!element) return false;

  try {
    const adminOnly = element.getAttribute("data-admin-only");
    const sidebarAdminOnly = element.getAttribute("data-sidebar-admin-only");

    if (adminOnly !== null && boolAttr(adminOnly)) return true;
    if (sidebarAdminOnly !== null && boolAttr(sidebarAdminOnly)) return true;

    const values = [
      element.getAttribute("data-role"),
      element.getAttribute("data-roles"),
      element.getAttribute("data-sidebar-role"),
      element.getAttribute("data-sidebar-roles"),
      element.getAttribute("data-requires-role"),
      element.getAttribute("data-requires-roles"),
      element.getAttribute("data-required-role"),
      element.getAttribute("data-required-roles"),
      element.getAttribute("data-permission"),
      element.getAttribute("data-permissions"),
      element.getAttribute("data-sidebar-permission"),
      element.getAttribute("data-sidebar-permissions"),
      element.getAttribute("data-scope"),
      element.getAttribute("data-scopes"),
    ].flatMap(splitAccessValues);

    return values.some((value) => (
      value === "admin" ||
      value === "administrator" ||
      value === "superadmin" ||
      value === "super_admin" ||
      value === "owner" ||
      value === "root" ||
      value === "*" ||
      value.startsWith("admin:") ||
      value.startsWith("admin.") ||
      value.includes(":admin") ||
      value.includes(".admin")
    ));
  } catch {
    return false;
  }
}

function hiddenAncestor(element = null) {
  if (!element) return null;

  try {
    const hardHidden = element.closest?.(HARD_HIDDEN_SELECTOR);
    if (hardHidden) return hardHidden;

    const adminHidden = element.closest?.(ADMIN_HIDDEN_SELECTOR);
    if (adminHidden && (elementRequiresAdmin(adminHidden) || hasAccessRuleAttr(adminHidden))) return adminHidden;

    const ariaHidden = element.closest?.(ARIA_HIDDEN_SELECTOR);
    if (!ariaHidden) return null;

    const interactive = element.closest?.(INTERACTIVE_SELECTOR);
    if (!interactive) return ariaHidden;
    if (ariaHidden === interactive) return ariaHidden;
    if (!interactive.contains(ariaHidden)) return ariaHidden;

    return null;
  } catch {
    return null;
  }
}

function preventHiddenTargetClick(event) {
  const target = getElementTarget(event);
  if (!target || !hiddenAncestor(target)) return false;

  preventDefaultAndStop(event);
  markHandled(event, "hidden-target");

  return true;
}

/* =========================================================
   ROUTES
========================================================= */

function getBaseOrigin() {
  try {
    if (isBrowser() && window.location?.origin) return window.location.origin;
  } catch {}

  return "http://localhost";
}

function isUnsafeRoute(value = "") {
  const raw = safeText(value, "").toLowerCase();

  return (
    raw.startsWith("javascript:") ||
    raw.startsWith("data:") ||
    raw.startsWith("vbscript:") ||
    raw.startsWith("file:") ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:")
  );
}

function isProtocolHref(value = "") {
  return /^[a-z][a-z0-9+.-]*:/i.test(safeText(value, ""));
}

function isExternalHref(value = "") {
  const raw = safeText(value, "");
  if (!raw || !isProtocolHref(raw)) return false;

  try {
    const url = new URL(raw, getBaseOrigin());
    if (["http:", "https:"].includes(url.protocol)) return url.origin !== getBaseOrigin();
    return true;
  } catch {
    return true;
  }
}

function isHashOnlyHref(value = "") {
  const href = safeText(value, "");
  return Boolean(href.startsWith("#") && !href.startsWith("#/") && !href.startsWith("#!"));
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "/";
  return raw.startsWith("#!") ? raw.replace(/^#!\/?/, "/") : raw.replace(/^#\/?/, "/");
}

function normalizePathnameOnly(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .trim();

  if (!value) value = "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";

  return value;
}

function stripPublicUsernamePrefix(pathname = "/") {
  return safeText(pathname, "/").replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";
}

function applyRouteAlias(pathname = "/") {
  const clean = normalizePathnameOnly(pathname || "/");
  if (ROUTE_ALIASES[clean]) return ROUTE_ALIASES[clean];

  for (const [from, to] of Object.entries(ROUTE_ALIASES)) {
    if (from !== "/" && clean.startsWith(`${from}/`)) return `${to}${clean.slice(from.length)}`;
  }

  return clean;
}

function normalizeRoutePath(path = "/") {
  let value = safeText(path, "/");
  if (!value) return "/";
  if (isUnsafeRoute(value) || isExternalHref(value) || isHashOnlyHref(value)) return "";

  if (isHashRouterPath(value)) value = normalizeHashRouterPath(value);

  try {
    const parsed = new URL(value, getBaseOrigin());

    if (parsed.hash && isHashRouterPath(parsed.hash)) value = normalizeHashRouterPath(parsed.hash);
    else value = `${parsed.pathname || "/"}${parsed.search || ""}`;
  } catch {
    value = value.split("#")[0] || "/";
  }

  value = safeText(value, "/").replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;

  const queryIndex = value.indexOf("?");
  const pathname = queryIndex >= 0 ? value.slice(0, queryIndex) : value;
  const query = queryIndex >= 0 ? value.slice(queryIndex + 1) : "";
  const cleanPathname = applyRouteAlias(stripPublicUsernamePrefix(normalizePathnameOnly(pathname || "/")));

  return query ? `${cleanPathname}?${query}` : cleanPathname;
}

function stripQuery(path = "/") {
  return normalizeRoutePath(path).split("?")[0] || "/";
}

function getBrowserPath() {
  if (!isBrowser()) return "/";

  try {
    const hash = window.location.hash || "";
    if (hash && isHashRouterPath(hash)) return normalizeRoutePath(normalizeHashRouterPath(hash));

    return normalizeRoutePath(`${window.location.pathname || "/"}${window.location.search || ""}`);
  } catch {
    return "/";
  }
}

function getRouterCandidate(AppCore = null, Router = null) {
  if (Router) return Router;

  try {
    return (
      AppCore?.Router ||
      AppCore?.router ||
      AppCore?.modules?.Router ||
      AppCore?.modules?.router ||
      AppCore?.modules?.get?.("Router") ||
      AppCore?.modules?.get?.("router") ||
      null
    );
  } catch {
    return null;
  }
}

function getRouterPath(Router = null) {
  return normalizeRoutePath(first(
    Router?.getCurrentPublicPath?.(),
    Router?.getCurrentCanonicalPath?.(),
    Router?.getCurrentPath?.(),
    ""
  ));
}

function getAppStatePath(AppCore = null) {
  return normalizeRoutePath(first(
    AppCore?.state?.publicPath,
    AppCore?.state?.route,
    AppCore?.state?.canonicalPath,
    AppCore?.state?.lastRoute,
    ""
  ));
}

function explicitRoutes(payload = {}) {
  const detail = safeObject(payload);

  return [
    detail.publicPath,
    detail.path,
    detail.requestedPath,
    detail.canonicalPath,
    detail.route,
    detail.to,
    detail.url,
    detail.href,
    detail.current?.publicPath,
    detail.current?.path,
    detail.current?.route,
    detail.current?.canonicalPath,
    detail.next?.publicPath,
    detail.next?.path,
    detail.next?.route,
    detail.next?.canonicalPath,
    detail.payload?.publicPath,
    detail.payload?.path,
    detail.payload?.requestedPath,
    detail.payload?.canonicalPath,
    detail.payload?.route,
    detail.payload?.to,
    detail.payload?.url,
    detail.detail?.publicPath,
    detail.detail?.path,
    detail.detail?.requestedPath,
    detail.detail?.canonicalPath,
    detail.detail?.route,
    detail.detail?.to,
    detail.detail?.url,
  ].map((value) => normalizeRoutePath(value || "")).filter(Boolean);
}

function routeReasonPrefersExplicit(reason = "") {
  const key = safeText(reason, "").toLowerCase();
  return key.includes("sidebar") || key.includes("navigation") || key.includes("navigate") || key.includes("active-route") || key.includes("manual") || key.includes("click");
}

function pushRoute(list, value) {
  const route = normalizeRoutePath(value || "");
  if (route && !list.includes(route)) list.push(route);
  return list;
}

function resolveFreshRoute(payload = {}, AppCore = null, Router = null, options = {}) {
  const detail = safeObject(payload);
  const explicit = explicitRoutes(detail);
  const browser = getBrowserPath();
  const router = getRouterPath(getRouterCandidate(AppCore, Router));
  const appState = getAppStatePath(AppCore);
  const preferExplicit = options.preferExplicitRoute === true || options.forceRoute === true || detail.preferExplicitRoute === true || detail.forceRoute === true || routeReasonPrefersExplicit(first(options.reason, detail.reason, detail.type, detail.event, ""));
  const candidates = [];

  if (preferExplicit && explicit.some((route) => route && stripQuery(route) !== "/")) {
    explicit.forEach((value) => pushRoute(candidates, value));
    pushRoute(candidates, router);
    pushRoute(candidates, appState);
    pushRoute(candidates, browser);
  } else {
    pushRoute(candidates, browser);
    pushRoute(candidates, router);
    pushRoute(candidates, appState);
    explicit.forEach((value) => pushRoute(candidates, value));
  }

  return candidates[0] || "/";
}

function buildRoutePayload(ctx = {}, payload = {}, reason = "", options = {}) {
  const AppCore = ctx.AppCore;
  const Router = getRouterCandidate(AppCore, ctx.Router);
  const route = resolveFreshRoute(payload, AppCore, Router, { ...safeObject(options), reason });

  return {
    ...safeObject(payload),
    reason,
    route,
    publicPath: route,
    path: route,
    canonicalPath: stripQuery(route),
    currentPublicPath: route,
    browserPublicPath: getBrowserPath(),
    routerPublicPath: getRouterPath(Router),
    appPublicPath: getAppStatePath(AppCore),
  };
}

/* =========================================================
   NAVIGATION
========================================================= */

function isPrimaryClick(event) {
  return !event || !("button" in event) || event.button === 0;
}

function isModifiedClick(event) {
  return Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey);
}

function isDisabledInteractive(element = null) {
  return Boolean(element?.disabled || element?.hasAttribute?.("disabled") || element?.getAttribute?.("aria-disabled") === "true");
}

function shouldLetBrowserHandleNavigation(element = null, event = null) {
  if (!element) return true;
  if (!isPrimaryClick(event) || isModifiedClick(event)) return true;
  if (isDisabledInteractive(element) || element.hasAttribute?.("download")) return true;
  return safeText(element.getAttribute?.("target"), "").toLowerCase() === "_blank";
}

function getRouteFromElement(element = null) {
  if (!element) return "";

  return (
    safeText(element.getAttribute?.("data-route"), "") ||
    safeText(element.getAttribute?.("data-href"), "") ||
    safeText(element.getAttribute?.("data-to"), "") ||
    safeText(element.getAttribute?.("href"), "")
  );
}

function normalizeSidebarTarget(AppCore, Router, value = "") {
  let raw = safeText(value, "");
  if (!raw || isUnsafeRoute(raw) || isExternalHref(raw) || isHashOnlyHref(raw)) return "";

  try {
    if (isFn(Router?.resolveSpaHref)) raw = safeText(Router.resolveSpaHref(raw), raw);
  } catch {}

  if (!raw || isUnsafeRoute(raw) || isExternalHref(raw) || isHashOnlyHref(raw)) return "";

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw, getBaseOrigin());
      if (url.origin !== getBaseOrigin()) return "";
      raw = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return "";
  }

  try {
    if (isFn(AppCore?.utils?.normalizePath)) return normalizeRoutePath(AppCore.utils.normalizePath(raw || "/"));
  } catch {}

  return normalizeRoutePath(raw.startsWith("/") || raw.startsWith("#") ? raw : `/${raw}`);
}

async function navigateFromSidebar({ AppCore, Router, target = "", source = "sidebar" } = {}) {
  const finalRouter = getRouterCandidate(AppCore, Router);
  const cleanTarget = normalizeSidebarTarget(AppCore, finalRouter, target);
  if (!cleanTarget) return false;

  for (const method of ["navigate", "go", "push"]) {
    try {
      if (isFn(finalRouter?.[method])) {
        await Promise.resolve(finalRouter[method](cleanTarget, { source, force: false }));
        return true;
      }
    } catch (error) {
      safeWarn(AppCore, `Router.${method} falló desde sidebar.`, { target: cleanTarget, source, error });
      return false;
    }
  }

  try {
    if (isBrowser()) {
      window.history.pushState({}, "", cleanTarget);
      try {
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch {
        window.dispatchEvent(new Event("popstate"));
      }
      return true;
    }
  } catch {}

  return false;
}

function sidebarNavElement(target = null) {
  return getElementTarget(target)?.closest?.(SIDEBAR_NAV_SELECTOR) || null;
}

function dropdownNavElement(target = null) {
  return getElementTarget(target)?.closest?.(DROPDOWN_NAV_SELECTOR) || null;
}

/* =========================================================
   ACTIVE ITEM
========================================================= */

function menuItems(sidebarMenu = null) {
  if (!sidebarMenu) return [];

  try {
    return [...sidebarMenu.querySelectorAll(SIDEBAR_NAV_SELECTOR)].filter((item, index, list) => item && list.indexOf(item) === index);
  } catch {
    return [];
  }
}

function menuItemRoute(item = null) {
  return normalizeRoutePath(getRouteFromElement(item));
}

function visibleMenuItem(item = null) {
  if (!item || !isConnectedElement(item)) return false;

  try {
    if (item.hidden || hiddenAncestor(item)) return false;
    const style = window.getComputedStyle(item);
    if (style.display === "none" || style.visibility === "hidden" || safeNumber(style.opacity, 1) === 0) return false;
    const rect = item.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  } catch {
    return true;
  }
}

function clearActiveClasses(sidebarMenu = null) {
  for (const item of menuItems(sidebarMenu)) {
    try {
      item.classList?.remove?.("active", "is-active", "router-active");
      item.removeAttribute?.("aria-current");

      if (item.dataset) {
        delete item.dataset.active;
        delete item.dataset.matchedRoute;
        delete item.dataset.matchedCurrent;
        delete item.dataset.matchCandidateIndex;
        item.dataset.current = "false";
        item.dataset.selected = "false";
      }
    } catch {}
  }

  return true;
}

function setActiveClasses(item = null, matchedRoute = "", currentRoute = "") {
  if (!item) return false;

  try {
    item.classList?.add?.("active", "is-active", "router-active");
    item.setAttribute?.("aria-current", "page");

    if (item.dataset) {
      item.dataset.active = "true";
      item.dataset.current = "true";
      item.dataset.selected = "true";
      item.dataset.matchedRoute = safeText(matchedRoute, "");
      item.dataset.matchedCurrent = safeText(currentRoute || matchedRoute, "");
    }

    return true;
  } catch {
    return false;
  }
}

function routeScore(routePath = "/", currentPath = "/") {
  const route = normalizeRoutePath(routePath);
  const current = normalizeRoutePath(currentPath);
  const routeClean = stripQuery(route);
  const currentClean = stripQuery(current);

  if (!route || !current) return -1;
  if (route === current) return 10000 + route.length;
  if (routeClean === currentClean) return 9000 + routeClean.length;
  if (routeClean !== "/" && currentClean.startsWith(`${routeClean}/`)) return 5000 + routeClean.length;
  if (routeClean === "/" && currentClean === "/") return 1000;

  return -1;
}

function bestMenuItem(sidebarMenu = null, route = "/") {
  const targetRoute = normalizeRoutePath(route || "/");
  let best = null;
  let bestScore = -1;
  let bestRoute = "";

  for (const item of menuItems(sidebarMenu)) {
    if (!visibleMenuItem(item)) continue;

    const itemRoute = menuItemRoute(item);
    const score = routeScore(itemRoute, targetRoute);

    if (score > bestScore) {
      best = item;
      bestScore = score;
      bestRoute = itemRoute;
    }
  }

  if (bestScore < 0) return null;

  try {
    best.dataset.matchedRoute = bestRoute;
    best.dataset.matchedCurrent = targetRoute;
  } catch {}

  return best;
}

function optimisticActiveItem(sidebarMenu = null, item = null, currentRoute = "") {
  if (!sidebarMenu || !item) return false;

  clearActiveClasses(sidebarMenu);
  return setActiveClasses(item, menuItemRoute(item), currentRoute);
}

function syncLocalActiveMenuItem(ctx = {}, route = "/", options = {}) {
  const { sidebarMenu } = resolveElements(ctx.AppCore, ctx.getElements);
  if (!sidebarMenu) return null;

  const currentRoute = normalizeRoutePath(route || "/");
  const activeItem = bestMenuItem(sidebarMenu, currentRoute);
  if (!activeItem) return null;

  if (options.mutate !== false) {
    clearActiveClasses(sidebarMenu);
    setActiveClasses(activeItem, menuItemRoute(activeItem), currentRoute);
  }

  return activeItem;
}

/* =========================================================
   HANDLED / CLEANUP
========================================================= */

function markHandled(event, reason = "") {
  if (!event) return false;

  try {
    event[HANDLED_FLAG] = true;
    event.__onionSidebarReason = safeText(reason, "");
  } catch {}

  return true;
}

function wasHandled(event) {
  return Boolean(event?.[HANDLED_FLAG]);
}

function getScopeEpoch(scope) {
  return Number(scopeEpochs.get(resolveScope(scope)) || 0);
}

function bumpScopeEpoch(scope) {
  const scopeName = resolveScope(scope);
  const next = getScopeEpoch(scopeName) + 1;
  scopeEpochs.set(scopeName, next);
  return next;
}

function currentEpoch(scope, epoch) {
  return getScopeEpoch(scope) === epoch;
}

function pushCleanup(scope, cleanup) {
  if (!isFn(cleanup)) return;

  const scopeName = resolveScope(scope);
  const cleanups = localCleanups.get(scopeName) || [];
  cleanups.push(cleanup);
  localCleanups.set(scopeName, cleanups);
}

function runCleanups(scope) {
  const scopeName = resolveScope(scope);
  const cleanups = localCleanups.get(scopeName) || [];

  for (const cleanup of cleanups.splice(0)) {
    try {
      cleanup?.();
    } catch {}
  }

  localCleanups.delete(scopeName);
  return true;
}

function resetScope(scope) {
  const scopeName = resolveScope(scope);
  const epoch = bumpScopeEpoch(scopeName);
  runCleanups(scopeName);
  return epoch;
}

function disposeScope(scope) {
  const scopeName = resolveScope(scope);
  bumpScopeEpoch(scopeName);
  runCleanups(scopeName);
  return true;
}

function safeHandler(AppCore, scope, epoch, label, handler) {
  if (!isFn(handler)) return () => {};

  const scopeName = resolveScope(scope);

  return (...args) => {
    if (!currentEpoch(scopeName, epoch)) return undefined;

    try {
      const result = handler(...args);

      if (result && typeof result === "object" && isFn(result.catch)) {
        result.catch((error) => safeWarn(AppCore, `${label} falló async`, error));
      }

      return result;
    } catch (error) {
      safeWarn(AppCore, `${label} falló`, error);
      return undefined;
    }
  };
}

function bindDom(AppCore, scope, epoch, target, eventName, handler, options = undefined) {
  if (!target || !eventName || !isFn(handler) || !isFn(target.addEventListener)) return () => {};

  const wrapped = safeHandler(AppCore, scope, epoch, `DOM "${eventName}"`, handler);
  const cleanup = () => {
    try {
      target.removeEventListener(eventName, wrapped, options);
    } catch {}
  };

  try {
    target.addEventListener(eventName, wrapped, options);
    pushCleanup(scope, cleanup);
    return cleanup;
  } catch (error) {
    safeWarn(AppCore, `addEventListener falló para DOM "${eventName}"`, error);
    return () => {};
  }
}

function bindCoreEvent(AppCore, scope, epoch, eventName, handler) {
  const name = safeText(eventName, "");
  if (!name || !isFn(handler)) return () => {};

  const wrapped = safeHandler(AppCore, scope, epoch, `Core "${name}"`, handler);

  try {
    if (isFn(AppCore?.events?.on)) {
      const off = AppCore.events.on(name, wrapped);
      const cleanup = isFn(off) ? off : () => AppCore?.events?.off?.(name, wrapped);
      pushCleanup(scope, cleanup);
      return cleanup;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.on falló para "${name}"`, error);
  }

  if (hasWindow()) {
    const windowHandler = (event) => wrapped(event);
    try {
      window.addEventListener(name, windowHandler);
      const cleanup = () => window.removeEventListener(name, windowHandler);
      pushCleanup(scope, cleanup);
      return cleanup;
    } catch (error) {
      safeWarn(AppCore, `window.addEventListener falló para "${name}"`, error);
    }
  }

  return () => {};
}

/* =========================================================
   STATE BRIDGE
========================================================= */

function syncActiveMenuItem(ctx = {}, payload = {}) {
  const AppCore = ctx.AppCore;
  const Router = getRouterCandidate(AppCore, ctx.Router);
  const reason = safeText(payload?.reason || payload?.type || payload?.event || "sidebar-events:active-sync", "sidebar-events:active-sync");
  const routePayload = buildRoutePayload({ ...ctx, AppCore, Router }, payload, reason, payload);

  let baseItem = null;

  try {
    baseItem = syncActiveMenuItemBase(AppCore, { ...routePayload, mutate: true });
  } catch (error) {
    safeWarn(AppCore, "syncActiveMenuItemBase falló", error);
  }

  const fixedItem = syncLocalActiveMenuItem({ ...ctx, AppCore, Router }, routePayload.route, { mutate: true });

  if (fixedItem && fixedItem !== baseItem) {
    safeEmit(AppCore, "sidebar:active:item:overridden", {
      reason,
      route: routePayload.route,
      previousRoute: menuItemRoute(baseItem),
      fixedRoute: menuItemRoute(fixedItem),
    });
  }

  return fixedItem || baseItem || null;
}

function syncActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore = ctx.AppCore;
  const Router = getRouterCandidate(AppCore, ctx.Router);
  const reason = safeText(options.reason, "sidebar-events:indicator-sync");
  const routePayload = buildRoutePayload({ ...ctx, AppCore, Router }, options, reason, options);
  const activeItem = options.activeItem || syncLocalActiveMenuItem({ ...ctx, AppCore, Router }, routePayload.route, { mutate: true });

  try {
    return syncActiveMenuIndicatorBase(AppCore, {
      ...routePayload,
      activeItem,
      reveal: options.reveal !== false,
      force: options.force === true,
    });
  } catch (error) {
    safeWarn(AppCore, "syncActiveMenuIndicatorBase falló", error);
    return false;
  }
}

function scheduleActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore = ctx.AppCore;
  const Router = getRouterCandidate(AppCore, ctx.Router);
  const reason = safeText(options.reason, "sidebar-events:indicator-scheduled");
  const routePayload = buildRoutePayload({ ...ctx, AppCore, Router }, options, reason, options);
  const activeItem = options.activeItem || syncLocalActiveMenuItem({ ...ctx, AppCore, Router }, routePayload.route, { mutate: true });

  try {
    return scheduleActiveMenuIndicatorBase(AppCore, {
      ...routePayload,
      activeItem,
      delayMs: Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : INDICATOR_DELAY_MS,
      reveal: options.reveal !== false,
      force: options.force === true,
    });
  } catch (error) {
    safeWarn(AppCore, "scheduleActiveMenuIndicatorBase falló", error);
    return false;
  }
}

function hideActiveMenuIndicator(ctx = {}, reason = "hide") {
  const AppCore = ctx.AppCore;

  try {
    return syncActiveMenuIndicatorBase(AppCore, {
      reason: safeText(reason, "hide"),
      reveal: false,
      force: true,
    });
  } catch {
    const { sidebarMenu } = resolveElements(AppCore, ctx.getElements);
    if (!sidebarMenu) return false;

    try {
      sidebarMenu.dataset.indicatorReady = "false";
      sidebarMenu.dataset.indicatorReason = safeText(reason, "hide");
      sidebarMenu.style.setProperty("--sidebar-indicator-opacity", "0");
      return true;
    } catch {
      return false;
    }
  }
}

function beginSidebarLayoutTransition(ctx = {}, reason = "transition") {
  hideActiveMenuIndicator(ctx, `${reason}:begin`);
  safeEmit(ctx.AppCore, "sidebar:events:transition:begin", { reason });
  return true;
}

function endSidebarLayoutTransition(ctx = {}, reason = "transition") {
  const activeItem = syncActiveMenuItem(ctx, { reason: `${reason}:end` });
  scheduleActiveMenuIndicator(ctx, {
    reason: `${reason}:end`,
    activeItem,
    delayMs: 24,
    reveal: true,
    force: true,
  });
  safeEmit(ctx.AppCore, "sidebar:events:transition:end", { reason });
  return true;
}

/* =========================================================
   VISUAL COMMIT
========================================================= */

function createSidebarVisualCommitter(ctx = {}) {
  const timers = new Map();
  let committing = false;
  let lastReason = "";

  const clearTimer = (key = "default") => {
    const timer = timers.get(key);
    if (timer) {
      clearTimeoutSafe(timer);
      timers.delete(key);
    }
  };

  const commitNow = (options = {}) => {
    if (committing) return false;
    committing = true;

    const reason = safeText(options.reason, "visual-commit");
    lastReason = reason;

    try {
      if (options.closeDropdown === true) {
        try {
          ctx.closeDropdown?.();
        } catch {}
      }

      if (options.renderIdentity === true) {
        try {
          ctx.renderUser?.(reason, { payload: options.payload });
        } catch (error) {
          safeWarn(ctx.AppCore, `renderUser falló en ${reason}`, error);
        }

        try {
          ctx.applyRoleVisibility?.(reason, { payload: options.payload });
        } catch (error) {
          safeWarn(ctx.AppCore, `applyRoleVisibility falló en ${reason}`, error);
        }
      }

      if (options.syncState === true && !safeIsShellHidden(ctx.AppCore)) {
        try {
          ctx.syncSidebarState?.(reason, { payload: options.payload });
        } catch (error) {
          safeWarn(ctx.AppCore, `syncSidebarState falló en ${reason}`, error);
        }
      }

      if (options.sanitize !== false) {
        try {
          sanitizeFooterTooltipState(ctx.AppCore);
        } catch {}
      }

      const payload = buildRoutePayload(ctx, safeObject(options.payload), reason, options);
      const activeItem = syncActiveMenuItem(ctx, payload);

      if (options.indicator !== false) {
        scheduleActiveMenuIndicator(ctx, {
          ...payload,
          reason,
          activeItem,
          delayMs: options.indicatorDelayMs ?? INDICATOR_DELAY_MS,
          reveal: options.reveal !== false,
          force: options.force === true,
        });
      }

      safeEmit(ctx.AppCore, "sidebar:visual:committed", {
        reason,
        lastReason,
        route: payload.route,
        browserPublicPath: payload.browserPublicPath,
        routerPublicPath: payload.routerPublicPath,
        appPublicPath: payload.appPublicPath,
      });

      return true;
    } finally {
      committing = false;
    }
  };

  const schedule = (options = {}) => {
    const key = safeText(options.key, "default");
    clearTimer(key);

    const timer = safeTimeout(() => {
      timers.delete(key);
      afterFrames(() => commitNow(options), options.frames || 1);
    }, Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : 0);

    if (timer) timers.set(key, timer);
    return true;
  };

  const cancelAll = () => {
    timers.forEach((timer) => clearTimeoutSafe(timer));
    timers.clear();
    return true;
  };

  return {
    commitNow,
    schedule,
    cancelAll,
    hideIndicator: (reason = "hide") => hideActiveMenuIndicator(ctx, reason),
    beginTransition: (reason = "transition") => beginSidebarLayoutTransition(ctx, reason),
    endTransition: (reason = "transition") => endSidebarLayoutTransition(ctx, reason),
    getLastReason: () => lastReason,
  };
}

/* =========================================================
   DOM HANDLERS
========================================================= */

function insideSidebarArea(elements = {}, target = null) {
  const { sidebar, sidebarMenu, userToggle, userDropdown, toggleBtn, mobileToggleBtn, logoutBtn } = safeObject(elements);

  return Boolean(
    containsElement(sidebar, target) ||
      containsElement(sidebarMenu, target) ||
      containsElement(userToggle, target) ||
      containsElement(userDropdown, target) ||
      containsElement(toggleBtn, target) ||
      containsElement(mobileToggleBtn, target) ||
      containsElement(logoutBtn, target)
  );
}

export function handleDocumentClick({
  AppCore,
  Router,
  event,
  toggleSidebar,
  toggleDropdown,
  closeDropdown,
  handleLogout,
  getElements: resolver,
}) {
  if (wasHandled(event)) return;

  const elements = resolveElements(AppCore, resolver);
  const { toggleBtn, mobileToggleBtn, userToggle, userDropdown, logoutBtn, sidebarMenu } = elements;
  const target = getElementTarget(event);

  if (!target) return;
  if (insideSidebarArea(elements, target) && preventHiddenTargetClick(event)) return;

  if (toggleBtn && containsElement(toggleBtn, target)) {
    markHandled(event, "document-toggle-sidebar");
    preventDefaultAndStop(event);
    toggleSidebar?.();
    return;
  }

  if (mobileToggleBtn && containsElement(mobileToggleBtn, target)) {
    markHandled(event, "document-mobile-toggle-sidebar");
    preventDefaultAndStop(event);
    toggleSidebar?.();
    return;
  }

  if (userToggle && containsElement(userToggle, target)) {
    markHandled(event, "document-toggle-dropdown");
    preventDefaultAndStop(event);
    toggleDropdown?.();
    return;
  }

  if (logoutBtn && containsElement(logoutBtn, target)) {
    markHandled(event, "document-logout");
    preventDefaultAndStop(event);
    void handleLogout?.();
    return;
  }

  const sidebarNav = sidebarNavElement(target);
  if (sidebarNav && sidebarMenu?.contains?.(sidebarNav)) {
    handleSidebarMenuClick({ AppCore, Router, event, closeDropdown, getElements: resolver });
    return;
  }

  const dropdownNav = userDropdown && containsElement(userDropdown, target) ? dropdownNavElement(target) : null;
  if (dropdownNav) {
    if (shouldLetBrowserHandleNavigation(dropdownNav, event)) return;

    const finalRouter = getRouterCandidate(AppCore, Router);
    const targetPath = normalizeSidebarTarget(AppCore, finalRouter, getRouteFromElement(dropdownNav));
    if (!targetPath) return;

    markHandled(event, "sidebar-dropdown:navigate");
    preventDefaultAndStop(event);

    try {
      closeDropdown?.();
    } catch {}

    safeEmit(AppCore, "sidebar:dropdown:navigation:request", {
      target: targetPath,
      route: targetPath,
      publicPath: targetPath,
      path: targetPath,
      preferExplicitRoute: true,
      source: "sidebar-dropdown",
    });

    void navigateFromSidebar({ AppCore, Router: finalRouter, target: targetPath, source: "sidebar-dropdown" });
    return;
  }

  if (!containsElement(userDropdown, target) && !containsElement(userToggle, target)) {
    closeDropdown?.();
  }
}

export function handleSidebarMenuClick({ AppCore, Router, event, closeDropdown, getElements: resolver }) {
  if (wasHandled(event)) return;
  if (!isPrimaryClick(event) || isModifiedClick(event)) return;

  const { sidebarMenu } = resolveElements(AppCore, resolver);
  if (!sidebarMenu) return;

  const target = getElementTarget(event);
  if (!target) return;
  if (preventHiddenTargetClick(event)) return;

  const link = sidebarNavElement(target);
  if (!link || !sidebarMenu.contains(link)) return;
  if (shouldLetBrowserHandleNavigation(link, event)) return;

  const finalRouter = getRouterCandidate(AppCore, Router);
  const targetPath = normalizeSidebarTarget(AppCore, finalRouter, getRouteFromElement(link));
  if (!targetPath) return;

  markHandled(event, "sidebar-menu:navigate");
  preventDefaultAndStop(event);

  try {
    closeDropdown?.();
  } catch {}

  safeEmit(AppCore, "sidebar:navigation:request", {
    target: targetPath,
    route: targetPath,
    publicPath: targetPath,
    path: targetPath,
    preferExplicitRoute: true,
    source: "sidebar-menu",
  });

  optimisticActiveItem(sidebarMenu, link, targetPath);

  const ctx = { AppCore, Router: finalRouter, getElements: resolver };
  const activeItem = syncLocalActiveMenuItem(ctx, targetPath, { mutate: true });

  scheduleActiveMenuIndicator(ctx, {
    reason: "sidebar-menu:navigate",
    route: targetPath,
    publicPath: targetPath,
    path: targetPath,
    preferExplicitRoute: true,
    forceRoute: true,
    activeItem,
    delayMs: 24,
    reveal: true,
    force: true,
  });

  void navigateFromSidebar({ AppCore, Router: finalRouter, target: targetPath, source: "sidebar-menu" });
}

export function handleUserToggleKeydown({ AppCore, event, toggleDropdown, closeDropdown, openDropdown, getElements: resolver }) {
  if (wasHandled(event)) return;

  const { userToggle } = resolveElements(AppCore, resolver);
  const target = getElementTarget(event);

  if (!userToggle || !target || !containsElement(userToggle, target)) return;

  if (event.key === "Enter" || event.key === " ") {
    markHandled(event, "user-toggle-keyboard-toggle");
    preventDefaultAndStop(event);
    toggleDropdown?.();
    return;
  }

  if (event.key === "Escape") {
    markHandled(event, "user-toggle-keyboard-close");
    preventDefaultAndStop(event);
    closeDropdown?.();
    return;
  }

  if (event.key === "ArrowDown") {
    markHandled(event, "user-toggle-keyboard-open");
    preventDefaultAndStop(event);
    openDropdown?.({ focusFirst: true });
  }
}

export function handleGlobalKeydown({ event, closeDropdown }) {
  if (wasHandled(event)) return;
  if (event?.key === "Escape") closeDropdown?.();
}

export function handleResize({ AppCore, Router, syncSidebarState, closeDropdown, getElements: resolver }) {
  try {
    syncSidebarState?.();
  } catch {}

  try {
    closeDropdown?.();
  } catch {}

  const ctx = { AppCore, Router: getRouterCandidate(AppCore, Router), getElements: resolver };
  const payload = buildRoutePayload(ctx, {}, "resize", { force: true });
  const activeItem = syncActiveMenuItem(ctx, payload);

  scheduleActiveMenuIndicator(ctx, {
    ...payload,
    reason: "resize",
    activeItem,
    delayMs: 96,
    reveal: true,
    force: true,
  });
}

/* =========================================================
   DOM BINDS
========================================================= */

export function bindDomEvents(ctx = {}) {
  const { AppCore, scope, Router, handleLogout, toggleSidebar, toggleDropdown, openDropdown, closeDropdown, syncSidebarState, getElements: resolver } = ctx;

  if (!isBrowser()) return () => {};

  const scopeName = resolveScope(scope);
  const localScope = scoped(scopeName, "dom");
  const epoch = resetScope(localScope);

  const clickHandler = (event) => handleDocumentClick({
    AppCore,
    Router,
    event,
    toggleSidebar,
    toggleDropdown,
    closeDropdown,
    handleLogout,
    getElements: resolver,
  });

  bindDom(AppCore, localScope, epoch, window, "click", clickHandler, true);
  bindDom(AppCore, localScope, epoch, document, "click", clickHandler, true);

  bindDom(AppCore, localScope, epoch, document, "keydown", (event) => {
    handleUserToggleKeydown({ AppCore, event, toggleDropdown, closeDropdown, openDropdown, getElements: resolver });
    handleGlobalKeydown({ event, closeDropdown });
  });

  let resizeTimer = null;

  const resizeHandler = () => {
    clearTimeoutSafe(resizeTimer);
    resizeTimer = safeTimeout(() => {
      resizeTimer = null;
      handleResize({ AppCore, Router, syncSidebarState, closeDropdown, getElements: resolver });
    }, RESIZE_DEBOUNCE_MS);
  };

  pushCleanup(localScope, () => {
    clearTimeoutSafe(resizeTimer);
    resizeTimer = null;
  });

  bindDom(AppCore, localScope, epoch, window, "resize", resizeHandler);
  bindDom(AppCore, localScope, epoch, window, "orientationchange", resizeHandler);

  const routeWindowHandler = (reason) => {
    const localCtx = { AppCore, Router: getRouterCandidate(AppCore, Router), getElements: resolver };
    const payload = buildRoutePayload(localCtx, {}, reason, { force: true });
    const activeItem = syncActiveMenuItem(localCtx, payload);

    scheduleActiveMenuIndicator(localCtx, {
      ...payload,
      reason,
      activeItem,
      delayMs: 48,
      reveal: true,
      force: true,
    });
  };

  bindDom(AppCore, localScope, epoch, window, "popstate", () => routeWindowHandler("window:popstate"));
  bindDom(AppCore, localScope, epoch, window, "hashchange", () => routeWindowHandler("window:hashchange"));

  safeEmit(AppCore, "sidebar:dom-events:bound", { scope: scopeName, localScope, epoch });

  return () => disposeScope(localScope);
}

/* =========================================================
   CORE BINDS
========================================================= */

export function bindCoreEvents(ctx = {}) {
  const { AppCore, scope, Router, renderUser, applyRoleVisibility, syncSidebarState, closeDropdown, getElements: resolver } = ctx;
  const scopeName = resolveScope(scope);
  const localScope = scoped(scopeName, "core");
  const epoch = resetScope(localScope);
  const visualCtx = {
    ...ctx,
    AppCore,
    Router: getRouterCandidate(AppCore, Router),
    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    closeDropdown,
    getElements: resolver,
  };

  const visualCommitter = createSidebarVisualCommitter(visualCtx);

  const bindMany = (events, handler) => {
    events.forEach((eventName) => bindCoreEvent(AppCore, localScope, epoch, eventName, handler));
  };

  const commitIdentity = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "identity",
      reason: safeText(detail.reason || detail.type || detail.event || "identity", "identity"),
      payload: detail,
      renderIdentity: true,
      syncState: false,
      closeDropdown: false,
      delayMs: 16,
      frames: 1,
      indicatorDelayMs: 48,
      force: true,
    });
  };

  const commitIdentityAndState = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "identity-state",
      reason: safeText(detail.reason || detail.type || detail.event || "identity-state", "identity-state"),
      payload: detail,
      renderIdentity: true,
      syncState: true,
      closeDropdown: false,
      delayMs: 24,
      frames: 1,
      indicatorDelayMs: 56,
      force: true,
    });
  };

  const commitSessionCleared = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "session-cleared",
      reason: safeText(detail.reason || detail.type || detail.event || "session-cleared", "session-cleared"),
      payload: detail,
      renderIdentity: true,
      syncState: true,
      closeDropdown: true,
      delayMs: 24,
      frames: 1,
      indicatorDelayMs: 56,
      force: true,
    });
  };

  const commitRoute = (eventName) => (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);
    const payload = buildRoutePayload(visualCtx, detail, eventName, { preferExplicitRoute: false, force: true });

    visualCommitter.schedule({
      key: "route",
      reason: eventName,
      payload,
      renderIdentity: false,
      syncState: false,
      closeDropdown: false,
      delayMs: 24,
      frames: 2,
      indicatorDelayMs: 32,
      force: true,
    });
  };

  const commitRouterRendered = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);
    const payload = buildRoutePayload(visualCtx, detail, "router:rendered", { preferExplicitRoute: false, force: true });

    visualCommitter.schedule({
      key: "router-rendered",
      reason: "router:rendered",
      payload,
      renderIdentity: false,
      syncState: false,
      closeDropdown: true,
      delayMs: 0,
      frames: 2,
      indicatorDelayMs: 48,
      force: true,
    });

    visualCommitter.schedule({
      key: "router-rendered-settled",
      reason: "router:rendered:settled",
      payload,
      renderIdentity: false,
      syncState: false,
      closeDropdown: false,
      delayMs: ROUTER_SETTLED_DELAY_MS,
      frames: 2,
      indicatorDelayMs: 0,
      force: true,
    });
  };

  bindMany(AUTH_USER_EVENTS, commitIdentity);
  bindMany(AUTH_STRONG_EVENTS, commitIdentityAndState);
  bindMany(AUTH_CLEAR_EVENTS, commitSessionCleared);

  bindCoreEvent(AppCore, localScope, epoch, "router:before-render", () => {
    try {
      closeDropdown?.();
    } catch {}

    visualCommitter.hideIndicator("router:before-render");
  });

  bindCoreEvent(AppCore, localScope, epoch, "router:rendered", commitRouterRendered);
  bindMany(ROUTE_EVENTS, (event, eventName) => commitRoute(eventName)(event));

  bindCoreEvent(AppCore, localScope, epoch, "app:ui:repair-request", (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "ui-repair-request",
      reason: "app:ui:repair-request",
      payload: detail,
      renderIdentity: true,
      syncState: detail.syncState === true,
      closeDropdown: false,
      delayMs: 32,
      frames: 2,
      indicatorDelayMs: 56,
      force: true,
    });
  });

  bindMany(["sidebar:indicator:refresh-request", "sidebar:active:invalidated"], (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "indicator-refresh-request",
      reason: safeText(detail.reason || "sidebar:indicator:refresh-request", "sidebar:indicator:refresh-request"),
      payload: detail,
      renderIdentity: false,
      syncState: false,
      closeDropdown: false,
      delayMs: 32,
      frames: 2,
      indicatorDelayMs: 32,
      force: true,
    });
  });

  bindMany(READY_EVENTS, (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "app-ready",
      reason: safeText(detail.reason || detail.type || detail.event || "app-ready", "app-ready"),
      payload: detail,
      renderIdentity: true,
      syncState: false,
      closeDropdown: false,
      delayMs: 64,
      frames: 2,
      indicatorDelayMs: 56,
      force: true,
    });
  });

  bindMany(VISUAL_ENV_EVENTS, (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);
    const payload = buildRoutePayload(visualCtx, detail, "visual-env-change", { preferExplicitRoute: false, force: true });

    visualCommitter.schedule({
      key: "visual-env-change",
      reason: safeText(detail.reason || detail.type || detail.event || "visual-env-change", "visual-env-change"),
      payload,
      renderIdentity: true,
      syncState: false,
      closeDropdown: false,
      delayMs: 48,
      frames: 2,
      indicatorDelayMs: 56,
      force: true,
    });
  });

  safeEmit(AppCore, "sidebar:core-events:bound", { scope: scopeName, localScope, epoch });
  safeLog(AppCore, "core events bound", { scope: scopeName, localScope, epoch });

  return () => {
    visualCommitter.cancelAll();
    disposeScope(localScope);
  };
}

/* =========================================================
   PUBLIC CLEANUP / SNAPSHOT
========================================================= */

export function disposeSidebarEvents(scope = DEFAULT_SCOPE) {
  const scopeName = resolveScope(scope);

  disposeScope(scoped(scopeName, "dom"));
  disposeScope(scoped(scopeName, "core"));
  disposeScope(scopeName);

  return true;
}

export function getSidebarEventsSnapshot(scope = DEFAULT_SCOPE) {
  const scopeName = resolveScope(scope);
  const domScope = scoped(scopeName, "dom");
  const coreScope = scoped(scopeName, "core");

  return {
    version: SIDEBAR_EVENTS_VERSION,
    scope: scopeName,
    epochs: {
      root: getScopeEpoch(scopeName),
      dom: getScopeEpoch(domScope),
      core: getScopeEpoch(coreScope),
    },
    cleanupCounts: {
      root: localCleanups.get(scopeName)?.length || 0,
      dom: localCleanups.get(domScope)?.length || 0,
      core: localCleanups.get(coreScope)?.length || 0,
    },
    hasWindow: hasWindow(),
    hasBrowser: isBrowser(),
    currentRoute: getBrowserPath(),
  };
}

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
