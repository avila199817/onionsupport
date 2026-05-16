/* =========================================================
   Onion SPA - Sidebar State
   Archivo: src/ui/sidebar/state.js

   SIDEBAR STATE · SIMPLE
   - estado visual desktop/mobile
   - desktop persiste collapsed
   - mobile no hereda desktop
   - state.js gobierna clases/aria/data attrs
   - state.js gobierna indicador CSS vars
   - navegación sólo sincroniza activo/indicador
========================================================= */

import {
  MOBILE_BREAKPOINT,
  DESKTOP_COLLAPSED_STORAGE_KEY,
} from "./constants.js";

import {
  getElements,
  isShellHidden as isDomShellHidden,
  isRealShellHidden as isDomRealShellHidden,
  sanitizeFooterTooltipState,
} from "./dom.js";

export const SIDEBAR_STATE_VERSION = "sidebar-state-v17-simple";

const SOURCE = "SidebarState";
const OWNER = "state.js";

const LEGACY_SIDEBAR_OPEN_STORAGE_KEY = "sidebarOpen";
const SIDEBAR_TRANSITION_MS = 380;
const INDICATOR_DELAY_MS = 32;
const INDICATOR_SETTLED_DELAY_MS = SIDEBAR_TRANSITION_MS + 36;

const MODE_DESKTOP = "desktop";
const MODE_MOBILE = "mobile";
const MODE_HIDDEN = "hidden";

const DATA_TRUE = "true";
const DATA_FALSE = "false";

const MENU_ITEM_SELECTOR = [
  ".menu-item",
  "a[data-spa]",
  "a[data-route]",
  "a[data-href]",
  "a[data-to]",
  "[data-sidebar-nav='true']",
].join(",");

const ACTIVE_ITEM_SELECTOR = [
  ".menu-item[aria-current='page']",
  ".menu-item[data-active='true']",
  ".menu-item.active",
  ".menu-item.is-active",
  ".menu-item.router-active",
  "[data-sidebar-nav='true'][aria-current='page']",
  "[data-sidebar-nav='true'][data-active='true']",
  "[data-sidebar-nav='true'].active",
  "[data-sidebar-nav='true'].is-active",
  "[data-sidebar-nav='true'].router-active",
].join(",");

const HIDDEN_ANCESTOR_SELECTOR = [
  "[hidden]",
  "[inert]",
  "[aria-hidden='true']",
  "[data-role-visible='false']",
  "[data-sidebar-visible='false']",
  "[data-admin-visible='false'][data-admin-only='true']",
  "[data-admin-visible='false'][data-sidebar-admin-only='true']",
  "[data-admin-visible='false'][data-role='admin']",
  "[data-admin-visible='false'][data-roles~='admin']",
  "[data-admin-visible='false'][data-requires-role='admin']",
  "[data-admin-visible='false'][data-required-role='admin']",
].join(",");

const ROUTE_ALIASES = Object.freeze({
  "/home": "/",
  "/dashboard": "/",
  "/inicio": "/",
  "/inici": "/",

  "/tickets": "/incidencias",
  "/ticket": "/incidencias",
  "/incidents": "/incidencias",
  "/incident": "/incidencias",
  "/incidencia": "/incidencias",
  "/incidencies": "/incidencias",

  "/invoices": "/facturas",
  "/invoice": "/facturas",
  "/billing": "/facturas",
  "/factura": "/facturas",
  "/factures": "/facturas",
  "/facturación": "/facturas",
  "/facturacion": "/facturas",

  "/users": "/usuarios",
  "/user": "/usuarios",
  "/usuario": "/usuarios",
  "/usuaris": "/usuarios",

  "/clients": "/clientes",
  "/client": "/clientes",
  "/customers": "/clientes",
  "/customer": "/clientes",
  "/cliente": "/clientes",

  "/account": "/cuenta",
  "/profile": "/cuenta",
  "/perfil": "/cuenta",
  "/compte": "/cuenta",

  "/settings": "/ajustes",
  "/config": "/ajustes",
  "/configuration": "/ajustes",
  "/configuracion": "/ajustes",
  "/configuración": "/ajustes",

  "/server": "/servidor",
});

let transitionTimer = null;
let transitionCleanup = null;
let indicatorTimer = null;
let indicatorRafA = 0;
let indicatorRafB = 0;
let indicatorGeneration = 0;
let lastStateSignature = "";
let lastActiveSignature = "";
let lastIndicatorSignature = "";
let lastTransitionReason = "";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function hasWindow() {
  return typeof window !== "undefined";
}

function hasDocument() {
  return typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeBoolean(value, fallback = null) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const text = safeText(value, "").toLowerCase();
  if (["true", "yes", "si", "sí", "ok", "on", "open", "opened", "expanded"].includes(text)) return true;
  if (["false", "no", "off", "closed", "close", "collapsed"].includes(text)) return false;

  return fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.min(Math.max(safeNumber(value, min), min), max);
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

function ensureState(AppCore) {
  if (!AppCore || typeof AppCore !== "object") return null;

  try {
    if (!AppCore.state || typeof AppCore.state !== "object") AppCore.state = {};
    return AppCore.state;
  } catch {
    return null;
  }
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarState]", ...args);
    return;
  } catch {}

  try {
    console.warn("[SidebarState]", ...args);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    source: SOURCE,
    owner: OWNER,
    version: SIDEBAR_STATE_VERSION,
    ts: nowTs(),
    at: safeIsoDate(),
    ...safeObject(payload),
  };

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(name, detail);
      return true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.emit("${name}") falló.`, error);
  }

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function getHtmlElement() {
  if (!hasDocument()) return null;

  try {
    return document.documentElement || null;
  } catch {
    return null;
  }
}

function isElement(value) {
  if (!value) return false;

  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(value && isFn(value.getBoundingClientRect));
  }
}

function isConnectedElement(value) {
  if (!isElement(value)) return false;

  try {
    return value.isConnected !== false;
  } catch {
    return true;
  }
}

/* =========================================================
   DOM HELPERS
========================================================= */

function hasClass(element, className = "") {
  try {
    return Boolean(element?.classList?.contains?.(className));
  } catch {
    return false;
  }
}

function toggleClass(element, className = "", enabled = false) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function toggleClasses(element, classMap = {}) {
  if (!element) return false;

  for (const [className, enabled] of Object.entries(safeObject(classMap))) {
    toggleClass(element, className, enabled);
  }

  return true;
}

function removeClasses(element, ...classes) {
  if (!element) return false;

  try {
    element.classList.remove(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function setAttr(element, name = "", value = "") {
  if (!element || !name) return false;

  try {
    element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeAttr(element, name = "") {
  if (!element || !name) return false;

  try {
    element.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function setDataset(element, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete element.dataset[key];
    else element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function setStyleVar(element, name = "", value = "") {
  if (!element || !name) return false;

  try {
    element.style.setProperty(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeStyleVar(element, name = "") {
  if (!element || !name) return false;

  try {
    element.style.removeProperty(name);
    return true;
  } catch {
    return false;
  }
}

function setHiddenState(element, hidden = false) {
  if (!element) return false;

  const value = Boolean(hidden);

  try {
    element.hidden = value;
  } catch {}

  try {
    if (value) element.setAttribute("hidden", "");
    else element.removeAttribute("hidden");
  } catch {}

  setAttr(element, "aria-hidden", value ? "true" : "false");
  return true;
}

/* =========================================================
   TIMERS
========================================================= */

function safeRaf(callback) {
  if (!isFn(callback)) return 0;

  if (!isBrowser()) {
    try {
      callback();
    } catch {}
    return 0;
  }

  try {
    return window.requestAnimationFrame(() => {
      try {
        callback();
      } catch {}
    });
  } catch {}

  return safeSetTimeout(callback, 0) || 0;
}

function safeCancelRaf(id = 0) {
  if (!id || !isBrowser()) return false;

  try {
    window.cancelAnimationFrame(id);
    return true;
  } catch {
    return false;
  }
}

function safeSetTimeout(callback, ms = 0) {
  if (!isFn(callback)) return null;

  const delay = clampNumber(ms, 0, 60000);

  try {
    if (hasWindow()) {
      return window.setTimeout(() => {
        try {
          callback();
        } catch {}
      }, delay);
    }
  } catch {}

  try {
    callback();
  } catch {}

  return null;
}

function safeClearTimeout(timer) {
  if (!timer) return false;

  try {
    if (hasWindow()) {
      window.clearTimeout(timer);
      return true;
    }
  } catch {}

  return false;
}

function afterNextPaint(callback) {
  if (!isFn(callback)) return;
  safeRaf(() => safeRaf(callback));
}

/* =========================================================
   STORAGE
========================================================= */

function storageGet(AppCore, key = "") {
  const clean = safeText(key, "");
  if (!clean) return null;

  try {
    const value = AppCore?.storage?.get?.(clean);
    const parsed = safeBoolean(value, null);
    if (typeof parsed === "boolean") return parsed;
  } catch {}

  try {
    const value = AppCore?.storage?.getItem?.(clean);
    const parsed = safeBoolean(value, null);
    if (typeof parsed === "boolean") return parsed;
  } catch {}

  try {
    if (isBrowser()) {
      const parsed = safeBoolean(window.localStorage?.getItem?.(clean), null);
      if (typeof parsed === "boolean") return parsed;
    }
  } catch {}

  return null;
}

function storageSet(AppCore, key = "", value = false) {
  const clean = safeText(key, "");
  if (!clean) return false;

  let ok = false;
  const serialized = String(Boolean(value));

  try {
    AppCore?.storage?.set?.(clean, serialized);
    ok = true;
  } catch {}

  try {
    AppCore?.storage?.setItem?.(clean, serialized);
    ok = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.localStorage?.setItem?.(clean, serialized);
      ok = true;
    }
  } catch {}

  return ok;
}

function readSavedSidebarCollapsed(AppCore = null) {
  const saved = storageGet(AppCore, DESKTOP_COLLAPSED_STORAGE_KEY);
  if (typeof saved === "boolean") return saved;

  const legacyOpen = storageGet(AppCore, LEGACY_SIDEBAR_OPEN_STORAGE_KEY);
  if (typeof legacyOpen === "boolean") return !legacyOpen;

  return null;
}

export function getSavedSidebarCollapsed(AppCore = null) {
  const saved = readSavedSidebarCollapsed(AppCore);
  return typeof saved === "boolean" ? saved : false;
}

export function saveSidebarCollapsed(value, AppCore = null) {
  const collapsed = Boolean(value);
  const saved = storageSet(AppCore, DESKTOP_COLLAPSED_STORAGE_KEY, collapsed);

  // Compat legacy: sidebarOpen significa abierto.
  storageSet(AppCore, LEGACY_SIDEBAR_OPEN_STORAGE_KEY, !collapsed);

  return saved;
}

/* =========================================================
   VIEWPORT / SHELL
========================================================= */

export function isMobileViewport(breakpoint = MOBILE_BREAKPOINT) {
  if (!isBrowser()) return false;

  const px = safeNumber(breakpoint, MOBILE_BREAKPOINT);

  try {
    return window.matchMedia(`(max-width: ${px}px)`).matches;
  } catch {}

  try {
    return window.innerWidth <= px;
  } catch {
    return false;
  }
}

export function isRealShellHidden(AppCore) {
  if (!isBrowser()) return false;

  try {
    return Boolean(isDomRealShellHidden(AppCore));
  } catch {}

  const { body, appShell, shell, layout } = getElements(AppCore);
  const html = getHtmlElement();

  return Boolean(
    AppCore?.state?.shellVisible === false ||
      AppCore?.state?.routeShellHidden === true ||
      AppCore?.state?.authScreen === true ||
      body?.classList?.contains?.("route-shell-hidden") ||
      body?.classList?.contains?.("auth-screen") ||
      body?.dataset?.shell === "hidden" ||
      body?.dataset?.shellVisible === "false" ||
      body?.dataset?.routeMode === "auth" ||
      html?.dataset?.shell === "hidden" ||
      html?.dataset?.shellVisible === "false" ||
      html?.dataset?.routeMode === "auth" ||
      appShell?.hidden === true ||
      shell?.hidden === true ||
      layout?.hidden === true ||
      appShell?.getAttribute?.("aria-hidden") === "true" ||
      shell?.getAttribute?.("aria-hidden") === "true" ||
      layout?.getAttribute?.("aria-hidden") === "true"
  );
}

function isDomShellHiddenOnly(AppCore) {
  try {
    return Boolean(isDomShellHidden(AppCore));
  } catch {
    return false;
  }
}

/* =========================================================
   MEMORY
========================================================= */

function setMode(AppCore, mode = "") {
  const state = ensureState(AppCore);
  const clean = safeText(mode, "");
  if (!state || !clean) return false;

  state.sidebarMode = clean;
  state.sidebarLastMode = clean;
  return true;
}

function setDerived(AppCore, { open = false, mobile = false, collapsed = false, hidden = false } = {}) {
  const state = ensureState(AppCore);
  if (!state) return false;

  state.sidebarOpen = Boolean(open);
  state.sidebarCollapsed = Boolean(collapsed);
  state.sidebarHidden = Boolean(hidden);
  state.sidebarViewport = mobile ? MODE_MOBILE : MODE_DESKTOP;
  return true;
}

function setDesktopMemory(AppCore, open) {
  const state = ensureState(AppCore);
  if (!state) return false;

  const value = Boolean(open);
  state.sidebarDesktopOpen = value;
  setMode(AppCore, MODE_DESKTOP);
  setDerived(AppCore, { open: value, mobile: false, collapsed: !value, hidden: false });
  return true;
}

function setMobileMemory(AppCore, open) {
  const state = ensureState(AppCore);
  if (!state) return false;

  const value = Boolean(open);
  state.sidebarMobileOpen = value;
  setMode(AppCore, MODE_MOBILE);
  setDerived(AppCore, { open: value, mobile: true, collapsed: false, hidden: false });
  return true;
}

function setHiddenMemory(AppCore) {
  const state = ensureState(AppCore);
  if (!state) return false;

  setMode(AppCore, MODE_HIDDEN);
  setDerived(AppCore, { open: false, mobile: isMobileViewport(), collapsed: false, hidden: true });
  return true;
}

function domOpenState(AppCore, { allowDesktopDom = true, allowMobileDom = false } = {}) {
  const { sidebar, body } = getElements(AppCore);
  if (!sidebar && !body) return null;

  const mobile = isMobileViewport();
  const mode = safeText(sidebar?.dataset?.mode || body?.dataset?.sidebarMode || "", "");

  if (mobile) {
    if (!allowMobileDom || mode !== MODE_MOBILE) return null;
    return Boolean(hasClass(sidebar, "open") || hasClass(sidebar, "is-open") || hasClass(body, "sidebar-open") || sidebar?.dataset?.open === DATA_TRUE);
  }

  if (!allowDesktopDom) return null;

  if (hasClass(sidebar, "collapsed") || hasClass(sidebar, "is-collapsed") || hasClass(body, "sidebar-collapsed") || sidebar?.dataset?.collapsed === DATA_TRUE || sidebar?.dataset?.open === DATA_FALSE) {
    return false;
  }

  return sidebar ? true : null;
}

function getDesktopDesiredOpenState(AppCore) {
  const state = ensureState(AppCore);
  if (typeof state?.sidebarDesktopOpen === "boolean") return state.sidebarDesktopOpen;

  const savedCollapsed = readSavedSidebarCollapsed(AppCore);
  if (typeof savedCollapsed === "boolean") {
    const open = !savedCollapsed;
    setDesktopMemory(AppCore, open);
    return open;
  }

  const fromDom = domOpenState(AppCore, { allowDesktopDom: true, allowMobileDom: false });
  if (typeof fromDom === "boolean") {
    setDesktopMemory(AppCore, fromDom);
    return fromDom;
  }

  setDesktopMemory(AppCore, true);
  return true;
}

function getMobileDesiredOpenState(AppCore) {
  const state = ensureState(AppCore);
  if (typeof state?.sidebarMobileOpen === "boolean") return state.sidebarMobileOpen;

  if (state?.sidebarLastMode === MODE_MOBILE && typeof state?.sidebarOpen === "boolean") {
    setMobileMemory(AppCore, state.sidebarOpen);
    return state.sidebarOpen;
  }

  const fromDom = domOpenState(AppCore, { allowDesktopDom: false, allowMobileDom: true });
  if (typeof fromDom === "boolean") {
    setMobileMemory(AppCore, fromDom);
    return fromDom;
  }

  setMobileMemory(AppCore, false);
  return false;
}

export function getDesiredSidebarOpenState(AppCore) {
  return isMobileViewport() ? getMobileDesiredOpenState(AppCore) : getDesktopDesiredOpenState(AppCore);
}

export function isSidebarCollapsedDesktop(AppCore) {
  return !isMobileViewport() && !getDesktopDesiredOpenState(AppCore);
}

/* =========================================================
   ROUTES / ACTIVE ITEM
========================================================= */

function routerCandidate(AppCore = null) {
  try {
    return AppCore?.Router || AppCore?.router || AppCore?.modules?.get?.("Router") || AppCore?.modules?.get?.("router") || AppCore?.modules?.Router || AppCore?.modules?.router || null;
  } catch {
    return null;
  }
}

function isUnsafeRoute(value = "") {
  const raw = safeText(value, "").toLowerCase();
  return raw.startsWith("javascript:") || raw.startsWith("data:") || raw.startsWith("vbscript:") || raw.startsWith("file:") || raw.startsWith("mailto:") || raw.startsWith("tel:");
}

function isHashOnlyRoute(value = "") {
  const raw = safeText(value, "");
  return raw === "#" || /^#[A-Za-z0-9_-]+$/.test(raw);
}

function isExternalHttpUrl(value = "") {
  const raw = safeText(value, "");
  if (!/^https?:\/\//i.test(raw)) return false;

  try {
    const origin = isBrowser() ? window.location.origin : "http://localhost";
    return new URL(raw, origin).origin !== origin;
  } catch {
    return true;
  }
}

function stripPublicUsernamePrefix(pathname = "/") {
  return safeText(pathname, "/").replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";
}

function applyRouteAlias(pathname = "/") {
  const clean = safeText(pathname, "/") || "/";
  if (ROUTE_ALIASES[clean]) return ROUTE_ALIASES[clean];

  for (const [from, to] of Object.entries(ROUTE_ALIASES)) {
    if (from !== "/" && clean.startsWith(`${from}/`)) return `${to}${clean.slice(from.length)}`;
  }

  return clean;
}

function normalizePathLike(path = "/") {
  let value = safeText(path, "").replace(/\\/g, "/").trim();
  if (!value) return "";
  if (isUnsafeRoute(value) || isExternalHttpUrl(value) || isHashOnlyRoute(value)) return "";

  try {
    const url = new URL(value, isBrowser() ? window.location.origin : "http://localhost");

    if (isBrowser() && url.origin !== window.location.origin && ["http:", "https:"].includes(url.protocol)) return "";

    if (url.hash && (url.hash.startsWith("#/") || url.hash.startsWith("#!"))) {
      value = url.hash.replace(/^#!\/?/, "/").replace(/^#\/?/, "/");
    } else {
      value = `${url.pathname || "/"}${url.search || ""}`;
    }
  } catch {
    if (value.startsWith("#/") || value.startsWith("#!")) value = value.replace(/^#!\/?/, "/").replace(/^#\/?/, "/");
    else value = value.split("#")[0] || "/";
  }

  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/{2,}/g, "/");

  const queryIndex = value.indexOf("?");
  const rawPathname = queryIndex >= 0 ? value.slice(0, queryIndex) : value;
  const query = queryIndex >= 0 ? value.slice(queryIndex + 1) : "";

  let pathname = stripPublicUsernamePrefix(rawPathname || "/");
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.replace(/\/+$/g, "") || "/";
  pathname = applyRouteAlias(pathname);

  return query ? `${pathname}?${query}` : pathname;
}

function stripQuery(path = "/") {
  return (normalizePathLike(path || "/") || "/").split("?")[0] || "/";
}

function getBrowserPublicPath() {
  if (!isBrowser()) return "/";

  try {
    const hash = safeText(window.location.hash, "");
    if (hash.startsWith("#/") || hash.startsWith("#!")) return normalizePathLike(hash.replace(/^#!\/?/, "/").replace(/^#\/?/, "/")) || "/";
    return normalizePathLike(`${window.location.pathname || "/"}${window.location.search || ""}`) || "/";
  } catch {
    return "/";
  }
}

function explicitPathCandidates(options = {}) {
  const opts = safeObject(options);
  const payload = safeObject(opts.payload);
  const detail = safeObject(opts.detail);
  const route = safeObject(opts.route);

  return [
    opts.currentPath,
    opts.routePath,
    opts.path,
    opts.publicPath,
    opts.canonicalPath,
    opts.href,
    opts.url,
    opts.to,
    route.publicPath,
    route.canonicalPath,
    route.path,
    detail.publicPath,
    detail.canonicalPath,
    detail.path,
    detail.href,
    detail.url,
    detail.to,
    payload.publicPath,
    payload.path,
    payload.requestedPath,
    payload.canonicalPath,
    payload.to,
    payload.url,
    payload.route,
    safeObject(payload.resolved).publicPath,
    safeObject(payload.resolved).canonicalPath,
  ].map((value) => normalizePathLike(value || "")).filter(Boolean);
}

function shouldPreferExplicitRoute(options = {}) {
  const opts = safeObject(options);
  const reason = safeText(opts.reason, "").toLowerCase();

  return Boolean(
    opts.preferExplicitRoute === true ||
      opts.forceRoute === true ||
      opts.activeItem ||
      reason.includes("navigation") ||
      reason.includes("navigate") ||
      reason.includes("router") ||
      reason.includes("active-route") ||
      reason.includes("click")
  );
}

function pushUniquePath(list, value) {
  const normalized = normalizePathLike(value || "");
  if (normalized && !list.includes(normalized)) list.push(normalized);
  return list;
}

function getCurrentPublicPathCandidates(AppCore, options = {}) {
  const candidates = [];
  const explicit = explicitPathCandidates(options);
  const browserPath = getBrowserPublicPath();

  if (shouldPreferExplicitRoute(options)) {
    explicit.forEach((value) => pushUniquePath(candidates, value));
    pushUniquePath(candidates, browserPath);
  } else {
    pushUniquePath(candidates, browserPath);
    explicit.forEach((value) => pushUniquePath(candidates, value));
  }

  const Router = routerCandidate(AppCore);

  try { pushUniquePath(candidates, Router?.getCurrentPublicPath?.()); } catch {}
  try { pushUniquePath(candidates, Router?.getCurrentCanonicalPath?.()); } catch {}
  try { pushUniquePath(candidates, Router?.getCurrentPath?.()); } catch {}

  pushUniquePath(candidates, AppCore?.state?.publicPath);
  pushUniquePath(candidates, AppCore?.state?.route);
  pushUniquePath(candidates, AppCore?.state?.canonicalPath);
  pushUniquePath(candidates, AppCore?.state?.lastRoute);

  return [...new Set(candidates)].length ? [...new Set(candidates)] : ["/"];
}

function getCurrentPublicPath(AppCore, options = {}) {
  return getCurrentPublicPathCandidates(AppCore, options)[0] || "/";
}

function getMenuItemRoute(item = null) {
  if (!item) return "";

  const raw = safeText(item.dataset?.route || item.dataset?.href || item.dataset?.to || item.dataset?.publicPath || item.getAttribute?.("data-route") || item.getAttribute?.("data-href") || item.getAttribute?.("data-to") || item.getAttribute?.("data-public-path") || item.getAttribute?.("href") || "", "");

  return normalizePathLike(raw);
}

function isElementVisible(element = null) {
  if (!element || !isBrowser()) return false;

  try {
    if (!isConnectedElement(element) || element.hidden || element.closest?.(HIDDEN_ANCESTOR_SELECTOR)) return false;

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || safeNumber(style.opacity, 1) === 0) return false;

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  } catch {
    return true;
  }
}

function getMenuItems(sidebarMenu = null) {
  if (!sidebarMenu) return [];

  try {
    return [...sidebarMenu.querySelectorAll(MENU_ITEM_SELECTOR)].filter((item, index, list) => item && list.indexOf(item) === index);
  } catch {
    return [];
  }
}

function clearActiveItemClasses(sidebarMenu = null) {
  for (const item of getMenuItems(sidebarMenu)) {
    try {
      item.classList.remove("active", "is-active", "router-active");
      item.removeAttribute("aria-current");
      delete item.dataset.active;
      delete item.dataset.matchedRoute;
      delete item.dataset.matchedCurrent;
      delete item.dataset.matchCandidateIndex;
      item.dataset.current = DATA_FALSE;
      item.dataset.selected = DATA_FALSE;
    } catch {}
  }

  return true;
}

function setActiveItemClasses(item = null) {
  if (!item) return false;

  try {
    item.classList.add("active", "is-active", "router-active");
    item.setAttribute("aria-current", "page");
    item.dataset.active = DATA_TRUE;
    item.dataset.current = DATA_TRUE;
    item.dataset.selected = DATA_TRUE;
    return true;
  } catch {
    return false;
  }
}

function scoreRouteMatch(routePath = "/", currentPath = "/") {
  const route = normalizePathLike(routePath);
  const current = normalizePathLike(currentPath);

  if (!route || !current) return -1;

  const routeClean = stripQuery(route);
  const currentClean = stripQuery(current);

  if (route === current) return 10000;
  if (routeClean === currentClean) return 9000;
  if (routeClean !== "/" && currentClean.startsWith(`${routeClean}/`)) return 5000 + routeClean.length;
  if (routeClean === "/" && currentClean === "/") return 1000;

  return -1;
}

function findBestMenuItemForPath(sidebarMenu = null, current = "/") {
  let best = null;
  let bestScore = -1;
  let bestRoute = "";

  for (const item of getMenuItems(sidebarMenu)) {
    if (!isElementVisible(item)) continue;

    const routePath = getMenuItemRoute(item);
    const score = scoreRouteMatch(routePath, current);

    if (score > bestScore) {
      best = item;
      bestScore = score;
      bestRoute = routePath;
    }
  }

  if (!best || bestScore < 0) return null;

  try {
    best.dataset.matchedRoute = bestRoute;
    best.dataset.matchedCurrent = normalizePathLike(current);
  } catch {}

  return best;
}

function findBestMenuItemForCurrentPath(AppCore, sidebarMenu = null, options = {}) {
  if (!sidebarMenu) return null;

  const paths = getCurrentPublicPathCandidates(AppCore, options).map((path) => normalizePathLike(path || "")).filter(Boolean);

  for (let index = 0; index < paths.length; index += 1) {
    const best = findBestMenuItemForPath(sidebarMenu, paths[index]);
    if (!best) continue;

    try {
      best.dataset.matchCandidateIndex = String(index);
    } catch {}

    return best;
  }

  return null;
}

function emitStateSynced(AppCore, payload = {}, options = {}) {
  const data = safeObject(payload);
  const signature = [data.open, data.mobile, data.hidden, data.collapsed, data.realShellHidden, data.domShellHidden, data.transitioning].map(String).join("|");

  if (signature === lastStateSignature && options.force !== true) return false;

  lastStateSignature = signature;
  return safeEmit(AppCore, "sidebar:state:synced", data);
}

function emitActiveSynced(AppCore, payload = {}, options = {}) {
  const data = safeObject(payload);
  const signature = [data.matched, data.route, data.matchedRoute, data.matchedCurrent, data.matchCandidateIndex].map(String).join("|");

  if (signature === lastActiveSignature && options.force !== true) return false;

  lastActiveSignature = signature;
  return safeEmit(AppCore, "sidebar:active:item:synced", data);
}

function emitIndicatorSynced(AppCore, payload = {}, options = {}) {
  const signature = safeText(payload.signature, "");
  if (signature && signature === lastIndicatorSignature && options.force !== true) return false;
  return safeEmit(AppCore, "sidebar:indicator:synced", payload);
}

export function syncActiveMenuItem(AppCore, options = {}) {
  const { sidebarMenu } = getElements(AppCore);
  if (!sidebarMenu) return null;

  const opts = safeObject(options);
  const best = findBestMenuItemForCurrentPath(AppCore, sidebarMenu, opts);

  if (opts.mutate !== false) {
    clearActiveItemClasses(sidebarMenu);
    if (best) setActiveItemClasses(best);
  }

  const payload = {
    reason: safeText(opts.reason, "sync-active-item"),
    matched: Boolean(best),
    route: getMenuItemRoute(best),
    matchedRoute: best?.dataset?.matchedRoute || "",
    matchedCurrent: best?.dataset?.matchedCurrent || "",
    matchCandidateIndex: best?.dataset?.matchCandidateIndex || "",
    currentPublicPath: getCurrentPublicPath(AppCore, opts),
    candidates: getCurrentPublicPathCandidates(AppCore, opts),
  };

  emitActiveSynced(AppCore, payload, { force: opts.forceEmit === true });
  return best;
}

function resolveActiveMenuItem(AppCore, sidebarMenu = null, options = {}) {
  if (!sidebarMenu) return null;

  const synced = syncActiveMenuItem(AppCore, { ...safeObject(options), mutate: true, reason: safeText(options?.reason, "resolve-active-menu-item") });
  if (synced && isElementVisible(synced)) return synced;

  try {
    const candidate = sidebarMenu.querySelector(ACTIVE_ITEM_SELECTOR);
    return candidate && isElementVisible(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/* =========================================================
   INDICATOR
========================================================= */

function clearIndicatorSchedule() {
  indicatorGeneration += 1;

  safeCancelRaf(indicatorRafA);
  safeCancelRaf(indicatorRafB);
  indicatorRafA = 0;
  indicatorRafB = 0;

  if (indicatorTimer) {
    safeClearTimeout(indicatorTimer);
    indicatorTimer = null;
  }
}

function buildIndicatorSignature({ route = "", current = "", x = 0, y = 0, width = 0, height = 0, reveal = true } = {}) {
  return [route, current, Math.round(x), Math.round(y), Math.round(width), Math.round(height), reveal ? "1" : "0"].join("|");
}

function isSidebarTransitioning(AppCore) {
  const { sidebar, sidebarMenu, body } = getElements(AppCore);
  const html = getHtmlElement();

  return Boolean(
    transitionTimer ||
      hasClass(sidebar, "is-transitioning") ||
      hasClass(sidebarMenu, "is-transitioning") ||
      hasClass(body, "sidebar-transitioning") ||
      hasClass(html, "sidebar-transitioning") ||
      sidebar?.dataset?.transitioning === DATA_TRUE ||
      sidebarMenu?.dataset?.transitioning === DATA_TRUE ||
      body?.dataset?.sidebarTransitioning === DATA_TRUE
  );
}

function disableActiveMenuIndicator(AppCore, reason = "disabled") {
  clearIndicatorSchedule();

  const { sidebarMenu } = getElements(AppCore);
  if (!sidebarMenu) return false;

  setDataset(sidebarMenu, "indicatorReady", DATA_FALSE);
  setDataset(sidebarMenu, "indicatorReason", reason);
  setStyleVar(sidebarMenu, "--sidebar-indicator-opacity", "0");

  return true;
}

function clearActiveMenuIndicator(AppCore, reason = "clear") {
  clearIndicatorSchedule();

  const { sidebarMenu } = getElements(AppCore);
  if (!sidebarMenu) return false;

  setDataset(sidebarMenu, "indicatorReady", DATA_FALSE);
  setDataset(sidebarMenu, "indicatorReason", reason);
  setDataset(sidebarMenu, "indicatorRoute", "");
  setDataset(sidebarMenu, "indicatorCurrent", "");

  removeStyleVar(sidebarMenu, "--sidebar-indicator-x");
  removeStyleVar(sidebarMenu, "--sidebar-indicator-y");
  removeStyleVar(sidebarMenu, "--sidebar-indicator-w");
  removeStyleVar(sidebarMenu, "--sidebar-indicator-h");
  setStyleVar(sidebarMenu, "--sidebar-indicator-opacity", "0");

  lastIndicatorSignature = "";
  return true;
}

export function syncActiveMenuIndicator(AppCore, options = {}) {
  const opts = safeObject(options);
  const reason = safeText(opts.reason, "sync");
  const reveal = opts.reveal !== false;
  const { sidebar, sidebarMenu } = getElements(AppCore);

  if (!isBrowser() || !sidebar || !sidebarMenu || isRealShellHidden(AppCore)) {
    return clearActiveMenuIndicator(AppCore, `${reason}:unavailable`);
  }

  if (isSidebarTransitioning(AppCore) && opts.force !== true) {
    return disableActiveMenuIndicator(AppCore, `${reason}:transitioning`);
  }

  let activeItem = opts.activeItem || null;
  if (!activeItem || !isConnectedElement(activeItem) || !isElementVisible(activeItem)) {
    activeItem = resolveActiveMenuItem(AppCore, sidebarMenu, opts);
  }

  if (!activeItem || !isElementVisible(activeItem)) {
    return disableActiveMenuIndicator(AppCore, `${reason}:no-active-item`);
  }

  try {
    const menuRect = sidebarMenu.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();

    if (!menuRect || !itemRect || menuRect.width <= 0 || itemRect.width <= 0 || itemRect.height <= 0) {
      return disableActiveMenuIndicator(AppCore, `${reason}:bad-rect`);
    }

    const menuWidth = clampNumber(menuRect.width, 0, 10000);
    const x = clampNumber(itemRect.left - menuRect.left, 0, Math.max(menuWidth, itemRect.width));
    const y = clampNumber(itemRect.top - menuRect.top, 0, 100000);
    const width = clampNumber(itemRect.width, 1, Math.max(menuWidth, itemRect.width));
    const height = clampNumber(itemRect.height, 1, 1000);
    const route = normalizePathLike(activeItem.dataset?.matchedRoute || getMenuItemRoute(activeItem) || "");
    const current = normalizePathLike(activeItem.dataset?.matchedCurrent || getCurrentPublicPath(AppCore, opts));

    const signature = buildIndicatorSignature({ route, current, x, y, width, height, reveal });

    if (signature === lastIndicatorSignature && opts.force !== true) return true;

    setStyleVar(sidebarMenu, "--sidebar-indicator-x", `${Math.round(x)}px`);
    setStyleVar(sidebarMenu, "--sidebar-indicator-y", `${Math.round(y)}px`);
    setStyleVar(sidebarMenu, "--sidebar-indicator-w", `${Math.round(width)}px`);
    setStyleVar(sidebarMenu, "--sidebar-indicator-h", `${Math.round(height)}px`);
    setStyleVar(sidebarMenu, "--sidebar-indicator-opacity", reveal ? "1" : "0");

    setDataset(sidebarMenu, "indicatorReady", DATA_TRUE);
    setDataset(sidebarMenu, "indicatorRoute", route);
    setDataset(sidebarMenu, "indicatorCurrent", current);
    setDataset(sidebarMenu, "indicatorReason", reason);

    lastIndicatorSignature = signature;

    emitIndicatorSynced(AppCore, {
      reason,
      route,
      current,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      reveal: Boolean(reveal),
      signature,
    }, { force: opts.force === true });

    return true;
  } catch (error) {
    safeWarn(AppCore, "No se pudo sincronizar indicador activo.", error);
    return disableActiveMenuIndicator(AppCore, `${reason}:error`);
  }
}

export function scheduleActiveMenuIndicator(AppCore, options = {}) {
  const opts = safeObject(options);
  const reason = safeText(opts.reason, "scheduled");
  const delay = clampNumber(opts.delayMs ?? INDICATOR_DELAY_MS, 0, 5000);
  const generation = indicatorGeneration + 1;

  clearIndicatorSchedule();
  indicatorGeneration = generation;

  const run = () => {
    if (generation !== indicatorGeneration) return;

    indicatorRafA = safeRaf(() => {
      indicatorRafA = 0;
      if (generation !== indicatorGeneration) return;

      indicatorRafB = safeRaf(() => {
        indicatorRafB = 0;
        if (generation !== indicatorGeneration) return;

        syncActiveMenuIndicator(AppCore, {
          ...opts,
          reason,
          reveal: opts.reveal !== false,
          force: opts.force === true,
        });
      });
    });
  };

  if (delay > 0) {
    indicatorTimer = safeSetTimeout(() => {
      indicatorTimer = null;
      run();
    }, delay);
    return true;
  }

  run();
  return true;
}

/* =========================================================
   TRANSITION
========================================================= */

function cleanupTransitionListener() {
  try {
    transitionCleanup?.();
  } catch {}

  transitionCleanup = null;
}

function clearTransitionTimer() {
  if (transitionTimer) {
    safeClearTimeout(transitionTimer);
    transitionTimer = null;
  }
}

function setTransitioning(AppCore, enabled = false, reason = "") {
  const { sidebar, sidebarMenu, body } = getElements(AppCore);
  const html = getHtmlElement();

  toggleClasses(sidebar, { "is-transitioning": enabled });
  toggleClasses(sidebarMenu, { "is-transitioning": enabled });
  toggleClasses(body, { "sidebar-transitioning": enabled });
  toggleClasses(html, { "sidebar-transitioning": enabled });

  setDataset(sidebar, "transitioning", enabled ? DATA_TRUE : "");
  setDataset(sidebarMenu, "transitioning", enabled ? DATA_TRUE : "");
  setDataset(body, "sidebarTransitioning", enabled ? DATA_TRUE : "");

  if (enabled) disableActiveMenuIndicator(AppCore, `${reason || "transition"}:start`);
  return true;
}

function finishSidebarTransition(AppCore, reason = "finish") {
  clearTransitionTimer();
  cleanupTransitionListener();
  setTransitioning(AppCore, false, reason);

  const activeItem = syncActiveMenuItem(AppCore, { reason: `${reason}:active-final`, mutate: true, forceRoute: true, forceEmit: true });

  scheduleActiveMenuIndicator(AppCore, {
    reason: `${reason}:indicator-final`,
    delayMs: INDICATOR_DELAY_MS,
    reveal: true,
    force: true,
    activeItem,
  });

  safeEmit(AppCore, "sidebar:transition:finish", { reason });
  return true;
}

function beginSidebarTransition(AppCore, reason = "state-change", durationMs = SIDEBAR_TRANSITION_MS) {
  if (!isBrowser()) return false;

  const { sidebar } = getElements(AppCore);
  if (!sidebar) return false;

  lastTransitionReason = reason;
  clearIndicatorSchedule();
  clearTransitionTimer();
  cleanupTransitionListener();
  setTransitioning(AppCore, true, reason);

  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    finishSidebarTransition(AppCore, reason);
  };

  const onTransitionEnd = (event) => {
    if (event?.target === sidebar) finish();
  };

  try {
    sidebar.addEventListener("transitionend", onTransitionEnd);
    transitionCleanup = () => sidebar.removeEventListener("transitionend", onTransitionEnd);
  } catch {
    transitionCleanup = null;
  }

  transitionTimer = safeSetTimeout(finish, clampNumber(durationMs, 80, 2000));
  safeEmit(AppCore, "sidebar:transition:start", { reason, durationMs: SIDEBAR_TRANSITION_MS });

  return true;
}

/* =========================================================
   TOOLTIPS / LABELS
========================================================= */

export function syncTooltipMode(AppCore, isOpen = null) {
  const { sidebar, body } = getElements(AppCore);
  if (!sidebar || !body) return false;

  const open = typeof isOpen === "boolean" ? isOpen : getDesiredSidebarOpenState(AppCore);
  const mobile = isMobileViewport();
  const enabled = !mobile && !open && !isRealShellHidden(AppCore) && !isSidebarTransitioning(AppCore);

  toggleClass(sidebar, "sidebar-tooltips-active", enabled);
  toggleClass(body, "sidebar-tooltips-active", enabled);
  setDataset(sidebar, "tooltipMode", enabled ? "compact" : "off");
  setDataset(body, "sidebarTooltipMode", enabled ? "compact" : "off");

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch {}

  return enabled;
}

export function updateToggleLabel(AppCore, isOpen = null) {
  const { toggleBtn, mobileToggleBtn, sidebar } = getElements(AppCore);
  const open = typeof isOpen === "boolean" ? isOpen : getDesiredSidebarOpenState(AppCore);
  const mobile = isMobileViewport();
  const collapsed = !mobile && !open;
  const desktopText = open ? "Contraer barra lateral" : "Expandir barra lateral";
  const mobileText = open ? "Cerrar navegación" : "Abrir navegación";

  if (toggleBtn) {
    setAttr(toggleBtn, "aria-label", desktopText);
    setAttr(toggleBtn, "aria-expanded", String(open));
    setAttr(toggleBtn, "type", "button");
    setDataset(toggleBtn, "state", open ? "open" : "closed");
    setDataset(toggleBtn, "tooltip", desktopText);
    setDataset(toggleBtn, "i18nDataTooltip", open ? "sidebar.toggle.collapse" : "sidebar.toggle.expand");
    toggleClass(toggleBtn, "is-active", open);
    removeAttr(toggleBtn, "title");
  }

  if (mobileToggleBtn) {
    setAttr(mobileToggleBtn, "aria-label", mobileText);
    setAttr(mobileToggleBtn, "aria-expanded", String(open));
    setAttr(mobileToggleBtn, "type", "button");
    setDataset(mobileToggleBtn, "state", open ? "open" : "closed");
    setDataset(mobileToggleBtn, "tooltip", mobileText);
    setDataset(mobileToggleBtn, "i18nDataTooltip", open ? "sidebar.toggle.close" : "sidebar.toggle.open");
    toggleClass(mobileToggleBtn, "is-active", open);
    removeAttr(mobileToggleBtn, "title");
  }

  if (sidebar) {
    setDataset(sidebar, "open", open ? DATA_TRUE : DATA_FALSE);
    setDataset(sidebar, "collapsed", collapsed ? DATA_TRUE : DATA_FALSE);
    setDataset(sidebar, "viewport", mobile ? MODE_MOBILE : MODE_DESKTOP);
  }

  syncTooltipMode(AppCore, open);
  return true;
}

/* =========================================================
   VISUAL STATE
========================================================= */

function syncHiddenShellState(AppCore, closeDropdown) {
  const { sidebar, sidebarMenu, body } = getElements(AppCore);
  if (!sidebar) return false;

  clearTransitionTimer();
  cleanupTransitionListener();
  setHiddenMemory(AppCore);
  setTransitioning(AppCore, false, "hidden-shell");
  clearActiveMenuIndicator(AppCore, "hidden-shell");

  try {
    closeDropdown?.();
  } catch {}

  removeClasses(sidebar, "open", "is-open", "collapsed", "is-collapsed", "sidebar-tooltips-active", "is-transitioning", "is-visual-syncing");
  removeClasses(sidebarMenu, "is-transitioning", "is-visual-syncing");
  removeClasses(body, "sidebar-open", "sidebar-collapsed", "sidebar-tooltips-active", "sidebar-transitioning", "sidebar-visual-syncing");

  setHiddenState(sidebar, true);
  setDataset(sidebar, "open", DATA_FALSE);
  setDataset(sidebar, "collapsed", DATA_FALSE);
  setDataset(sidebar, "mode", MODE_HIDDEN);
  setDataset(sidebar, "viewport", "");
  setDataset(sidebar, "transitioning", "");
  setDataset(sidebarMenu, "transitioning", "");
  setDataset(body, "sidebarMode", MODE_HIDDEN);
  setDataset(body, "sidebarTransitioning", "");
  updateToggleLabel(AppCore, false);

  emitStateSynced(AppCore, {
    open: false,
    mobile: isMobileViewport(),
    hidden: true,
    realShellHidden: true,
    domShellHidden: isDomShellHiddenOnly(AppCore),
    collapsed: false,
    transitioning: false,
  }, { force: true });

  return true;
}

function syncVisibleSidebarBase(AppCore, { sidebar, body, mobile, open } = {}) {
  if (!sidebar) return false;

  const collapsed = !mobile && !open;

  setHiddenState(sidebar, false);

  if (mobile) {
    setMobileMemory(AppCore, open);
    toggleClasses(sidebar, { open, "is-open": open, collapsed: false, "is-collapsed": false });
    toggleClasses(body, { "sidebar-open": open, "sidebar-collapsed": false });
    setDataset(sidebar, "mode", MODE_MOBILE);
    setDataset(body, "sidebarMode", MODE_MOBILE);
  } else {
    setDesktopMemory(AppCore, open);
    toggleClasses(sidebar, { open: false, "is-open": false, collapsed, "is-collapsed": collapsed });
    toggleClasses(body, { "sidebar-open": false, "sidebar-collapsed": collapsed });
    setDataset(sidebar, "mode", MODE_DESKTOP);
    setDataset(body, "sidebarMode", MODE_DESKTOP);
  }

  setDataset(sidebar, "open", open ? DATA_TRUE : DATA_FALSE);
  setDataset(sidebar, "collapsed", collapsed ? DATA_TRUE : DATA_FALSE);
  setDataset(sidebar, "viewport", mobile ? MODE_MOBILE : MODE_DESKTOP);
  updateToggleLabel(AppCore, open);

  return true;
}

function syncSidebarStateInternal(AppCore, closeDropdown, options = {}) {
  const opts = safeObject(options);
  const { sidebar, body } = getElements(AppCore);

  if (!sidebar) return false;
  if (isRealShellHidden(AppCore)) return syncHiddenShellState(AppCore, closeDropdown);

  const mobile = isMobileViewport();
  const open = getDesiredSidebarOpenState(AppCore);
  const collapsed = !open && !mobile;
  const synced = syncVisibleSidebarBase(AppCore, { sidebar, body, mobile, open });

  const activeItem = syncActiveMenuItem(AppCore, { ...opts, reason: opts.reason || "sync-sidebar-state", mutate: true });

  if (isSidebarTransitioning(AppCore)) {
    disableActiveMenuIndicator(AppCore, `${opts.reason || "sync-sidebar-state"}:transitioning`);
  } else {
    scheduleActiveMenuIndicator(AppCore, {
      ...opts,
      reason: opts.reason || "sync-sidebar-state",
      delayMs: opts.indicatorDelayMs ?? INDICATOR_DELAY_MS,
      reveal: true,
      force: opts.forceIndicator === true,
      activeItem,
    });
  }

  emitStateSynced(AppCore, {
    open,
    mobile,
    hidden: false,
    realShellHidden: false,
    domShellHidden: isDomShellHiddenOnly(AppCore),
    collapsed,
    transitioning: isSidebarTransitioning(AppCore),
  }, { force: opts.forceEmit === true });

  return synced;
}

export function syncSidebarState(AppCore, closeDropdown) {
  return syncSidebarStateInternal(AppCore, closeDropdown, { reason: "sync-sidebar-state" });
}

export function setSidebarOpen(AppCore, open, closeDropdown) {
  const nextOpen = Boolean(open);
  const mobile = isMobileViewport();
  const previousOpen = getDesiredSidebarOpenState(AppCore);
  const changed = previousOpen !== nextOpen;
  const collapsed = !nextOpen && !mobile;

  if (isRealShellHidden(AppCore)) {
    syncHiddenShellState(AppCore, closeDropdown);
    safeEmit(AppCore, "sidebar:state:change:blocked", { reason: "shell-hidden", requestedOpen: nextOpen, previousOpen, mobile });
    return false;
  }

  if (!changed) {
    const synced = syncSidebarStateInternal(AppCore, closeDropdown, {
      reason: "set-sidebar-open:no-change",
      forceIndicator: true,
      forceEmit: true,
    });

    safeEmit(AppCore, "sidebar:state:unchanged", { open: nextOpen, previousOpen, changed: false, mobile, collapsed });
    return synced;
  }

  safeEmit(AppCore, "sidebar:state:change:start", { open: nextOpen, previousOpen, changed, mobile, collapsed });

  beginSidebarTransition(AppCore, mobile ? "mobile-open-change" : "desktop-collapse-change", SIDEBAR_TRANSITION_MS);

  if (mobile) {
    setMobileMemory(AppCore, nextOpen);
  } else {
    setDesktopMemory(AppCore, nextOpen);
    saveSidebarCollapsed(!nextOpen, AppCore);
  }

  const synced = syncSidebarStateInternal(AppCore, closeDropdown, { reason: "set-sidebar-open", forceEmit: true });

  afterNextPaint(() => {
    scheduleActiveMenuIndicator(AppCore, {
      reason: "set-sidebar-open:settled",
      delayMs: INDICATOR_SETTLED_DELAY_MS,
      reveal: true,
      force: true,
    });
  });

  safeEmit(AppCore, "sidebar:state:change", {
    transitionManaged: true,
    open: nextOpen,
    previousOpen,
    changed,
    mobile,
    collapsed,
    transitioning: true,
  });

  return synced;
}

export function repairSidebarState(AppCore, closeDropdown) {
  const state = ensureState(AppCore);
  if (!state) return false;

  const mobile = isMobileViewport();

  if (typeof state.sidebarDesktopOpen !== "boolean") {
    const savedCollapsed = readSavedSidebarCollapsed(AppCore);
    state.sidebarDesktopOpen = typeof savedCollapsed === "boolean" ? !savedCollapsed : true;
  }

  if (typeof state.sidebarMobileOpen !== "boolean") state.sidebarMobileOpen = false;

  if (isRealShellHidden(AppCore)) return syncHiddenShellState(AppCore, closeDropdown);

  if (mobile) setMobileMemory(AppCore, Boolean(state.sidebarMobileOpen));
  else setDesktopMemory(AppCore, Boolean(state.sidebarDesktopOpen));

  const synced = syncSidebarStateInternal(AppCore, closeDropdown, {
    reason: "repair-sidebar-state",
    forceEmit: true,
    forceIndicator: true,
    indicatorDelayMs: isSidebarTransitioning(AppCore) ? INDICATOR_SETTLED_DELAY_MS : INDICATOR_DELAY_MS,
  });

  safeEmit(AppCore, "sidebar:state:repaired", {
    mobile,
    open: Boolean(state.sidebarOpen),
    desktopOpen: Boolean(state.sidebarDesktopOpen),
    mobileOpen: Boolean(state.sidebarMobileOpen),
    mode: state.sidebarMode || "",
  });

  return synced;
}

/* =========================================================
   RUNTIME / SNAPSHOT
========================================================= */

export function resetSidebarStateRuntime(AppCore = null, reason = "reset-runtime") {
  clearIndicatorSchedule();
  clearTransitionTimer();
  cleanupTransitionListener();
  setTransitioning(AppCore, false, reason);

  lastStateSignature = "";
  lastActiveSignature = "";
  lastIndicatorSignature = "";
  lastTransitionReason = "";

  safeEmit(AppCore, "sidebar:state:runtime-reset", { reason });
  return true;
}

export function getSidebarStateSnapshot(AppCore) {
  const { sidebar, sidebarMenu, body, appShell, shell, layout } = getElements(AppCore);
  const mobile = isMobileViewport();
  const open = getDesiredSidebarOpenState(AppCore);
  const collapsed = !open && !mobile;
  const activeItem = sidebarMenu ? resolveActiveMenuItem(AppCore, sidebarMenu, { reason: "snapshot" }) : null;

  return {
    version: SIDEBAR_STATE_VERSION,
    mobile,
    open,
    collapsed,
    transitioning: isSidebarTransitioning(AppCore),
    lastTransitionReason,
    shellHidden: isDomShellHiddenOnly(AppCore),
    realShellHidden: isRealShellHidden(AppCore),
    state: {
      sidebarOpen: AppCore?.state?.sidebarOpen ?? null,
      sidebarDesktopOpen: AppCore?.state?.sidebarDesktopOpen ?? null,
      sidebarMobileOpen: AppCore?.state?.sidebarMobileOpen ?? null,
      sidebarCollapsed: AppCore?.state?.sidebarCollapsed ?? null,
      sidebarHidden: AppCore?.state?.sidebarHidden ?? null,
      sidebarViewport: AppCore?.state?.sidebarViewport ?? null,
      sidebarMode: AppCore?.state?.sidebarMode ?? null,
      sidebarLastMode: AppCore?.state?.sidebarLastMode ?? null,
      shellVisible: AppCore?.state?.shellVisible ?? null,
      route: AppCore?.state?.route ?? null,
      publicPath: AppCore?.state?.publicPath ?? null,
      canonicalPath: AppCore?.state?.canonicalPath ?? null,
      lastRoute: AppCore?.state?.lastRoute ?? null,
    },
    storage: {
      savedCollapsed: readSavedSidebarCollapsed(AppCore),
      collapsedKey: DESKTOP_COLLAPSED_STORAGE_KEY,
      legacyOpenKey: LEGACY_SIDEBAR_OPEN_STORAGE_KEY,
    },
    dom: {
      hasSidebar: Boolean(sidebar),
      hasSidebarMenu: Boolean(sidebarMenu),
      sidebarHidden: Boolean(sidebar?.hidden),
      sidebarAriaHidden: sidebar?.getAttribute?.("aria-hidden") || null,
      sidebarClasses: sidebar?.className || "",
      sidebarMenuClasses: sidebarMenu?.className || "",
      bodyClasses: body?.className || "",
      appShellHidden: Boolean(appShell?.hidden),
      shellHidden: Boolean(shell?.hidden),
      layoutHidden: Boolean(layout?.hidden),
      sidebarOpenDataset: sidebar?.dataset?.open || null,
      sidebarCollapsedDataset: sidebar?.dataset?.collapsed || null,
      sidebarMode: sidebar?.dataset?.mode || null,
      sidebarViewport: sidebar?.dataset?.viewport || null,
      sidebarTransitioning: sidebar?.dataset?.transitioning || null,
      sidebarMenuTransitioning: sidebarMenu?.dataset?.transitioning || null,
      bodySidebarMode: body?.dataset?.sidebarMode || null,
    },
    route: {
      currentPublicPath: getCurrentPublicPath(AppCore),
      browserPublicPath: getBrowserPublicPath(),
      candidates: getCurrentPublicPathCandidates(AppCore),
      activeRoute: getMenuItemRoute(activeItem),
      activeMatchedRoute: activeItem?.dataset?.matchedRoute || "",
      activeMatchedCurrent: activeItem?.dataset?.matchedCurrent || "",
      activeCandidateIndex: activeItem?.dataset?.matchCandidateIndex || "",
    },
    indicator: {
      ready: sidebarMenu?.dataset?.indicatorReady || null,
      reason: sidebarMenu?.dataset?.indicatorReason || null,
      route: sidebarMenu?.dataset?.indicatorRoute || null,
      current: sidebarMenu?.dataset?.indicatorCurrent || null,
      activeRoute: getMenuItemRoute(activeItem),
      currentPublicPath: getCurrentPublicPath(AppCore),
      lastSignature: lastIndicatorSignature,
      generation: indicatorGeneration,
      x: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-x") || "",
      y: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-y") || "",
      width: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-w") || "",
      height: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-h") || "",
      opacity: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-opacity") || "",
    },
  };
}

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
