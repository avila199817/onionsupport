/* =========================================================
   Onion SPA - Sidebar State
   Archivo: src/ui/sidebar/state.js

   FINAL EXTREME SYSTEM · DESKTOP/MOBILE STABLE · APPLE INDICATOR · 11/10
   ROUTE SAFE · INDICATOR RACE SAFE · NO STALE ACTIVE ITEM
   TOKEN DRIVEN · CSS VAR OWNER · ZERO DUPLICATE DISPATCH

   Responsabilidades:
   - Resolver estado visual del sidebar.
   - Separar estado desktop y mobile.
   - Persistir solo estado desktop colapsado.
   - No mezclar sidebarOpen mobile con desktop.
   - Sincronizar clases / aria / data attrs.
   - Mantener tooltips coherentes.
   - No auto-colapsar al navegar.
   - No cerrar dropdown salvo shell real oculta.
   - Evitar que sidebar.hidden stale bloquee el sidebar tras login/router repair.
   - Emitir eventos mínimos y deduplicados.
   - Resolver item activo por ruta real antes que por clases stale.
   - Posicionar indicador Apple mediante CSS vars en .sidebar-menu.
   - state.js es el único dueño de:
     --sidebar-indicator-x/y/w/h/opacity.

   Reglas:
   - Desktop:
     - fuente real: AppCore.state.sidebarDesktopOpen
     - persistencia: sidebar-collapsed
     - default: abierto
   - Mobile:
     - fuente real: AppCore.state.sidebarMobileOpen
     - compat visible: AppCore.state.sidebarOpen
     - default: cerrado
   - Navegación:
     - no abre/cierra sidebar
     - solo resincroniza activo e indicador
   - Eventos:
     - AppCore.events si existe
     - window solo fallback
     - nunca doble dispatch
========================================================= */

import {
  MOBILE_BREAKPOINT,
  DESKTOP_COLLAPSED_STORAGE_KEY,
} from "./constants.js";

import {
  getElements,
  isShellHidden,
  sanitizeFooterTooltipState,
} from "./dom.js";

/* =========================================================
   CONSTANTS
========================================================= */

const SOURCE = "SidebarState";

const LEGACY_SIDEBAR_OPEN_STORAGE_KEY = "sidebarOpen";

const SIDEBAR_TRANSITION_MS = 380;
const INDICATOR_RECALC_DELAY_MS = 32;
const INDICATOR_SETTLED_DELAY_MS = SIDEBAR_TRANSITION_MS + 36;

const ROUTE_CURRENT_VALUE = "page";

const STATE_EMIT_MIN_INTERVAL_MS = 24;
const ACTIVE_EMIT_MIN_INTERVAL_MS = 24;

const DATA_TRUE = "true";
const DATA_FALSE = "false";

const TRANSITION_PROPS = new Set([
  "inline-size",
  "width",
  "max-inline-size",
  "transform",
  "margin-inline-start",
]);

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
  "[data-sidebar-nav='true'][aria-current='page']",
  "[data-sidebar-nav='true'][data-active='true']",
  "[data-sidebar-nav='true'].active",
  "[data-sidebar-nav='true'].is-active",
].join(",");

const HIDDEN_ANCESTOR_SELECTOR = [
  "[hidden]",
  "[inert]",
  "[aria-hidden='true']",
  "[data-role-visible='false']",
  "[data-admin-visible='false']",
  "[data-sidebar-visible='false']",
].join(",");

/*
  La clave izquierda puede venir de href/data-route.
  La derecha debe ser la ruta canónica interna.
*/
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
  "/incidencia-client": "/incidencias",

  "/invoices": "/facturas",
  "/invoice": "/facturas",
  "/billing": "/facturas",
  "/factura": "/facturas",
  "/factures": "/facturas",
  "/facturacio": "/facturas",
  "/facturación": "/facturas",
  "/facturacion": "/facturas",

  "/users": "/usuarios",
  "/user": "/usuarios",
  "/usuario": "/usuarios",
  "/usuaris": "/usuarios",
  "/usuari": "/usuarios",

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
  "/configuracio": "/ajustes",
  "/configuració": "/ajustes",

  "/server": "/servidor",
  "/servidor": "/servidor",
});

/* =========================================================
   RUNTIME
========================================================= */

let sidebarTransitionTimer = null;
let sidebarTransitionEndCleanup = null;

let indicatorRafA = 0;
let indicatorRafB = 0;
let indicatorTimer = null;
let indicatorGeneration = 0;

let lastStateSignature = "";
let lastStateEmitAt = 0;

let lastActiveSignature = "";
let lastActiveEmitAt = 0;

let lastIndicatorSignature = "";
let lastIndicatorReason = "";
let lastTransitionReason = "";

/* =========================================================
   BASE HELPERS
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

function nowTs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function safeBoolean(value, fallback = null) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(key)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
  const n = safeNumber(value, min);
  return Math.min(Math.max(n, min), max);
}

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function ensureStateBag(AppCore) {
  if (!AppCore || typeof AppCore !== "object") return null;

  if (!AppCore.state || typeof AppCore.state !== "object") {
    AppCore.state = {};
  }

  return AppCore.state;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarState]", ...args);
  } catch {}

  try {
    console.warn("[SidebarState]", ...args);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(name, payload);
      return true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.emit("${name}") falló.`, error);
  }

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );
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

function getBodyElement() {
  if (!hasDocument()) return null;

  try {
    return document.body || null;
  } catch {
    return null;
  }
}

function isElement(value) {
  if (!value) return false;

  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(value && isFunction(value.getBoundingClientRect));
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
   DOM MUTATION HELPERS
========================================================= */

function hasClass(element, className = "") {
  if (!element || !className) return false;

  try {
    return element.classList.contains(className);
  } catch {
    return false;
  }
}

function addClass(element, ...classes) {
  if (!element) return false;

  try {
    element.classList.add(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function removeClass(element, ...classes) {
  if (!element) return false;

  try {
    element.classList.remove(...classes.filter(Boolean));
    return true;
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
    if (value === null || value === undefined || value === "") {
      delete element.dataset[key];
      return true;
    }

    element.dataset[key] = String(value);
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

  try {
    element.hidden = Boolean(hidden);
    setAttr(element, "aria-hidden", hidden ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   TIMER / RAF HELPERS
========================================================= */

function safeRequestAnimationFrame(callback) {
  if (!isFunction(callback)) return 0;

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

  try {
    return window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}

  return 0;
}

function safeCancelAnimationFrame(id = 0) {
  if (!id || !isBrowser()) return false;

  try {
    window.cancelAnimationFrame(id);
    return true;
  } catch {
    return false;
  }
}

function safeSetTimeout(callback, ms = 0) {
  if (!isFunction(callback)) return null;

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
  if (!isFunction(callback)) return;

  safeRequestAnimationFrame(() => {
    safeRequestAnimationFrame(callback);
  });
}

/* =========================================================
   STORAGE
========================================================= */

function getStorage(AppCore = null) {
  try {
    const storage = AppCore?.storage;

    if (
      storage &&
      (
        isFunction(storage.get) ||
        isFunction(storage.set) ||
        isFunction(storage.remove) ||
        isFunction(storage.getItem) ||
        isFunction(storage.setItem) ||
        isFunction(storage.removeItem)
      )
    ) {
      return storage;
    }
  } catch {}

  return null;
}

function readFromAppStorage(AppCore, key = "") {
  const cleanKey = safeText(key, "");
  if (!cleanKey) return null;

  try {
    const storage = getStorage(AppCore);

    if (isFunction(storage?.get)) {
      const parsed = safeBoolean(storage.get(cleanKey), null);
      if (typeof parsed === "boolean") return parsed;
    }

    if (isFunction(storage?.getItem)) {
      const parsed = safeBoolean(storage.getItem(cleanKey), null);
      if (typeof parsed === "boolean") return parsed;
    }
  } catch {}

  return null;
}

function writeToAppStorage(AppCore, key = "", value = false) {
  const cleanKey = safeText(key, "");
  if (!cleanKey) return false;

  try {
    const storage = getStorage(AppCore);

    if (isFunction(storage?.set)) {
      storage.set(cleanKey, String(Boolean(value)));
      return true;
    }

    if (isFunction(storage?.setItem)) {
      storage.setItem(cleanKey, String(Boolean(value)));
      return true;
    }
  } catch {}

  return false;
}

function readFromLocalStorage(key = "") {
  const cleanKey = safeText(key, "");
  if (!cleanKey || !isBrowser()) return null;

  try {
    const parsed = safeBoolean(window.localStorage?.getItem?.(cleanKey), null);
    if (typeof parsed === "boolean") return parsed;
  } catch {}

  return null;
}

function writeToLocalStorage(key = "", value = false) {
  const cleanKey = safeText(key, "");
  if (!cleanKey || !isBrowser()) return false;

  try {
    window.localStorage?.setItem?.(cleanKey, String(Boolean(value)));
    return true;
  } catch {
    return false;
  }
}

function readSavedSidebarCollapsed(AppCore = null) {
  const fromAppStorage = readFromAppStorage(AppCore, DESKTOP_COLLAPSED_STORAGE_KEY);
  if (typeof fromAppStorage === "boolean") return fromAppStorage;

  const fromLocalStorage = readFromLocalStorage(DESKTOP_COLLAPSED_STORAGE_KEY);
  if (typeof fromLocalStorage === "boolean") return fromLocalStorage;

  /*
    Legacy:
    sidebarOpen=true  => desktop abierto
    sidebarOpen=false => desktop colapsado
  */
  const legacyFromAppStorage = readFromAppStorage(AppCore, LEGACY_SIDEBAR_OPEN_STORAGE_KEY);
  if (typeof legacyFromAppStorage === "boolean") return !legacyFromAppStorage;

  const legacyFromLocalStorage = readFromLocalStorage(LEGACY_SIDEBAR_OPEN_STORAGE_KEY);
  if (typeof legacyFromLocalStorage === "boolean") return !legacyFromLocalStorage;

  return null;
}

export function getSavedSidebarCollapsed(AppCore = null) {
  const saved = readSavedSidebarCollapsed(AppCore);
  return typeof saved === "boolean" ? saved : false;
}

export function saveSidebarCollapsed(value, AppCore = null) {
  const collapsed = Boolean(value);

  const appOk = writeToAppStorage(AppCore, DESKTOP_COLLAPSED_STORAGE_KEY, collapsed);
  const localOk = writeToLocalStorage(DESKTOP_COLLAPSED_STORAGE_KEY, collapsed);

  writeToAppStorage(AppCore, LEGACY_SIDEBAR_OPEN_STORAGE_KEY, !collapsed);
  writeToLocalStorage(LEGACY_SIDEBAR_OPEN_STORAGE_KEY, !collapsed);

  return Boolean(appOk || localOk);
}

/* =========================================================
   RESPONSIVE
========================================================= */

export function isMobileViewport(breakpoint = MOBILE_BREAKPOINT) {
  if (!isBrowser()) return false;

  try {
    return window.matchMedia(
      `(max-width: ${safeNumber(breakpoint, MOBILE_BREAKPOINT)}px)`
    ).matches;
  } catch {
    return false;
  }
}

/* =========================================================
   SHELL HIDDEN
========================================================= */

export function isRealShellHidden(AppCore) {
  if (!isBrowser()) return false;

  const {
    body,
    appShell,
    shell,
    layout,
  } = getElements(AppCore);

  const html = getHtmlElement();

  /*
    No usamos sidebar.hidden como fuente real.
    sidebar.hidden puede quedar stale después de login/auth/router repair.
  */
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

      appShell?.classList?.contains?.("route-shell-hidden") ||
      shell?.classList?.contains?.("route-shell-hidden") ||
      layout?.classList?.contains?.("route-shell-hidden") ||

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
    return Boolean(isShellHidden(AppCore));
  } catch {
    return false;
  }
}

/* =========================================================
   STATE MEMORY
========================================================= */

function setModeMemory(AppCore, mode = "") {
  const state = ensureStateBag(AppCore);
  if (!state) return false;

  const cleanMode = safeText(mode, "");
  if (!cleanMode) return false;

  state.sidebarMode = cleanMode;
  state.sidebarLastMode = cleanMode;

  return true;
}

function setDesktopMemory(AppCore, open) {
  const state = ensureStateBag(AppCore);
  if (!state) return false;

  state.sidebarDesktopOpen = Boolean(open);
  state.sidebarOpen = Boolean(open);

  setModeMemory(AppCore, "desktop");

  return true;
}

function setMobileMemory(AppCore, open) {
  const state = ensureStateBag(AppCore);
  if (!state) return false;

  state.sidebarMobileOpen = Boolean(open);
  state.sidebarOpen = Boolean(open);

  setModeMemory(AppCore, "mobile");

  return true;
}

function syncSharedState(AppCore, open) {
  const state = ensureStateBag(AppCore);
  if (!state) return false;

  state.sidebarOpen = Boolean(open);

  return true;
}

/* =========================================================
   DOM FALLBACK STATE
========================================================= */

function resolveDomSidebarOpenState(AppCore) {
  const {
    sidebar,
    body,
  } = getElements(AppCore);

  if (!sidebar && !body) return null;

  const mobile = isMobileViewport();

  if (mobile) {
    if (
      hasClass(sidebar, "open") ||
      hasClass(sidebar, "is-open") ||
      hasClass(body, "sidebar-open") ||
      sidebar?.dataset?.open === DATA_TRUE
    ) {
      return true;
    }

    return false;
  }

  if (
    hasClass(sidebar, "collapsed") ||
    hasClass(sidebar, "is-collapsed") ||
    hasClass(body, "sidebar-collapsed") ||
    sidebar?.dataset?.collapsed === DATA_TRUE ||
    sidebar?.dataset?.open === DATA_FALSE
  ) {
    return false;
  }

  return sidebar ? true : null;
}

function getDesktopDesiredOpenState(AppCore) {
  const state = ensureStateBag(AppCore);

  if (typeof state?.sidebarDesktopOpen === "boolean") {
    return state.sidebarDesktopOpen;
  }

  const savedCollapsed = readSavedSidebarCollapsed(AppCore);

  if (typeof savedCollapsed === "boolean") {
    const open = !savedCollapsed;
    setDesktopMemory(AppCore, open);
    syncSharedState(AppCore, open);
    return open;
  }

  const fromDom = resolveDomSidebarOpenState(AppCore);

  if (typeof fromDom === "boolean") {
    setDesktopMemory(AppCore, fromDom);
    syncSharedState(AppCore, fromDom);
    return fromDom;
  }

  setDesktopMemory(AppCore, true);
  syncSharedState(AppCore, true);

  return true;
}

function getMobileDesiredOpenState(AppCore) {
  const state = ensureStateBag(AppCore);

  if (typeof state?.sidebarMobileOpen === "boolean") {
    return state.sidebarMobileOpen;
  }

  /*
    Solo aceptamos sidebarOpen legacy si el último modo fue mobile.
    Evita heredar desktopOpen=true al entrar en viewport mobile.
  */
  if (
    state?.sidebarLastMode === "mobile" &&
    typeof state?.sidebarOpen === "boolean"
  ) {
    setMobileMemory(AppCore, state.sidebarOpen);
    return state.sidebarOpen;
  }

  const fromDom = resolveDomSidebarOpenState(AppCore);

  if (typeof fromDom === "boolean") {
    setMobileMemory(AppCore, fromDom);
    return fromDom;
  }

  setMobileMemory(AppCore, false);

  return false;
}

export function getDesiredSidebarOpenState(AppCore) {
  return isMobileViewport()
    ? getMobileDesiredOpenState(AppCore)
    : getDesktopDesiredOpenState(AppCore);
}

export function isSidebarCollapsedDesktop(AppCore) {
  if (isMobileViewport()) return false;
  return !getDesktopDesiredOpenState(AppCore);
}

/* =========================================================
   ROUTE HELPERS
========================================================= */

function stripPublicUsernamePrefix(pathname = "/") {
  const value = safeText(pathname, "/").replace(/^\/@[^/]+(?=\/|$)/i, "");
  return value || "/";
}

function isUnsafeRouteValue(value = "") {
  const raw = safeText(value, "").toLowerCase();

  return Boolean(
    raw.startsWith("javascript:") ||
      raw.startsWith("data:") ||
      raw.startsWith("vbscript:") ||
      raw.startsWith("file:") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("tel:")
  );
}

function isHashOnlyRouteValue(value = "") {
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

function applyRouteAlias(pathname = "/") {
  const clean = safeText(pathname, "/") || "/";

  if (ROUTE_ALIASES[clean]) {
    return ROUTE_ALIASES[clean];
  }

  for (const [from, to] of Object.entries(ROUTE_ALIASES)) {
    if (from !== "/" && clean.startsWith(`${from}/`)) {
      return `${to}${clean.slice(from.length)}`;
    }
  }

  return clean;
}

function normalizePathLike(path = "/") {
  let value = safeText(path, "/").replace(/\\/g, "/").trim();

  if (!value) return "/";

  if (
    isUnsafeRouteValue(value) ||
    isExternalHttpUrl(value) ||
    isHashOnlyRouteValue(value)
  ) {
    return "";
  }

  try {
    const url = new URL(
      value,
      isBrowser() ? window.location.origin : "http://localhost"
    );

    if (
      isBrowser() &&
      url.origin !== window.location.origin &&
      (url.protocol === "http:" || url.protocol === "https:")
    ) {
      return "";
    }

    if (url.hash && (url.hash.startsWith("#/") || url.hash.startsWith("#!"))) {
      value = url.hash
        .replace(/^#!\/?/, "/")
        .replace(/^#\/?/, "/");
    } else {
      value = `${url.pathname || "/"}${url.search || ""}`;
    }
  } catch {
    if (value.startsWith("#/") || value.startsWith("#!")) {
      value = value
        .replace(/^#!\/?/, "/")
        .replace(/^#\/?/, "/");
    } else {
      value = value.split("#")[0] || "/";
    }
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\/{2,}/g, "/");

  const queryIndex = value.indexOf("?");
  const rawPathname = queryIndex >= 0 ? value.slice(0, queryIndex) : value;
  const query = queryIndex >= 0 ? value.slice(queryIndex + 1) : "";

  let pathname = stripPublicUsernamePrefix(rawPathname || "/");

  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.replace(/\/+$/g, "") || "/";
  }

  pathname = applyRouteAlias(pathname);

  return query ? `${pathname}?${query}` : pathname;
}

function stripQuery(path = "/") {
  const normalized = normalizePathLike(path);
  return normalized.split("?")[0] || "/";
}

function getBrowserPublicPath() {
  if (!isBrowser()) return "/";

  try {
    const hash = safeText(window.location.hash, "");

    if (hash.startsWith("#/") || hash.startsWith("#!")) {
      return normalizePathLike(
        hash
          .replace(/^#!\/?/, "/")
          .replace(/^#\/?/, "/")
      );
    }

    return normalizePathLike(
      `${window.location.pathname || "/"}${window.location.search || ""}`
    );
  } catch {
    return "/";
  }
}

function getExplicitPathCandidates(options = {}) {
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
    route.href,
    route.url,

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
  ]
    .map((value) => normalizePathLike(value || ""))
    .filter(Boolean);
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
      reason.includes("sidebar-ui:active-route") ||
      reason.includes("sync-active-route") ||
      reason.includes("open-activity") ||
      reason.includes("route-marker") ||
      reason.includes("click")
  );
}

function pushUniquePath(list, value) {
  const normalized = normalizePathLike(value || "");

  if (normalized && !list.includes(normalized)) {
    list.push(normalized);
  }

  return list;
}

function getCurrentPublicPathCandidates(AppCore, options = {}) {
  const opts = safeObject(options);
  const candidates = [];

  const explicit = getExplicitPathCandidates(opts);
  const browserPath = getBrowserPublicPath();

  /*
    Orden crítico:
    - navegación explícita: payload primero
    - sync normal: window.location primero
    - AppCore.state al final porque puede venir stale
  */
  if (shouldPreferExplicitRoute(opts)) {
    explicit.forEach((value) => pushUniquePath(candidates, value));
    pushUniquePath(candidates, browserPath);
  } else {
    pushUniquePath(candidates, browserPath);
    explicit.forEach((value) => pushUniquePath(candidates, value));
  }

  pushUniquePath(candidates, AppCore?.state?.publicPath);
  pushUniquePath(candidates, AppCore?.state?.route);
  pushUniquePath(candidates, AppCore?.state?.canonicalPath);
  pushUniquePath(candidates, AppCore?.state?.lastRoute);

  try {
    pushUniquePath(candidates, AppCore?.router?.getCurrentPublicPath?.());
  } catch {}

  try {
    pushUniquePath(candidates, AppCore?.router?.getCurrentCanonicalPath?.());
  } catch {}

  try {
    pushUniquePath(candidates, AppCore?.router?.getCurrentPath?.());
  } catch {}

  return uniqueArray(candidates).length ? uniqueArray(candidates) : ["/"];
}

function getCurrentPublicPath(AppCore, options = {}) {
  return getCurrentPublicPathCandidates(AppCore, options)[0] || "/";
}

function getMenuItemRoute(item = null) {
  if (!item) return "";

  const raw = safeText(
    item.dataset?.route ||
      item.dataset?.href ||
      item.dataset?.to ||
      item.getAttribute?.("data-route") ||
      item.getAttribute?.("data-href") ||
      item.getAttribute?.("data-to") ||
      item.getAttribute?.("href") ||
      "",
    ""
  );

  if (
    !raw ||
    isUnsafeRouteValue(raw) ||
    isExternalHttpUrl(raw) ||
    isHashOnlyRouteValue(raw)
  ) {
    return "";
  }

  return raw;
}

function isElementVisible(element = null) {
  if (!element || !isBrowser()) return false;

  try {
    if (!isConnectedElement(element)) return false;
    if (element.hidden) return false;
    if (element.closest?.(HIDDEN_ANCESTOR_SELECTOR)) return false;

    const style = window.getComputedStyle(element);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      safeNumber(style.opacity, 1) === 0
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0;
  } catch {
    return true;
  }
}

function getMenuItems(sidebarMenu = null) {
  if (!sidebarMenu) return [];

  try {
    return Array.from(sidebarMenu.querySelectorAll(MENU_ITEM_SELECTOR))
      .filter((item, index, array) => item && array.indexOf(item) === index);
  } catch {
    return [];
  }
}

function clearActiveItemClasses(sidebarMenu = null) {
  const items = getMenuItems(sidebarMenu);

  for (const item of items) {
    try {
      item.classList.remove("active", "is-active", "router-active");
      item.removeAttribute("aria-current");
      delete item.dataset.active;
      delete item.dataset.matchedRoute;
      delete item.dataset.matchedCurrent;
      delete item.dataset.matchCandidateIndex;
    } catch {}
  }

  return true;
}

function setActiveItemClasses(item = null) {
  if (!item) return false;

  try {
    item.classList.add("active", "is-active", "router-active");
    item.setAttribute("aria-current", ROUTE_CURRENT_VALUE);
    item.dataset.active = DATA_TRUE;
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

  if (routeClean !== "/" && currentClean.startsWith(`${routeClean}/`)) {
    return 5000 + routeClean.length;
  }

  if (routeClean === "/" && currentClean === "/") {
    return 1000;
  }

  return -1;
}

function findBestMenuItemForSinglePath(sidebarMenu = null, current = "/") {
  const items = getMenuItems(sidebarMenu);

  let best = null;
  let bestScore = -1;
  let bestRoute = "";

  for (const item of items) {
    if (!isElementVisible(item)) continue;

    const route = getMenuItemRoute(item);
    if (!route) continue;

    const routePath = normalizePathLike(route);
    if (!routePath) continue;

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

  const paths = getCurrentPublicPathCandidates(AppCore, options)
    .map((path) => normalizePathLike(path || ""))
    .filter(Boolean);

  if (!paths.length) return null;

  /*
    No elegimos el match global más largo.
    Probamos candidatos por fiabilidad y devolvemos el primer match.
    Así /facturas visible gana a AppCore stale /incidencias.
  */
  for (let index = 0; index < paths.length; index += 1) {
    const best = findBestMenuItemForSinglePath(sidebarMenu, paths[index]);

    if (best) {
      try {
        best.dataset.matchCandidateIndex = String(index);
      } catch {}

      return best;
    }
  }

  return null;
}

/* =========================================================
   DEDUPED EVENT EMITTERS
========================================================= */

function buildStateSignature(payload = {}) {
  const data = safeObject(payload);

  return [
    data.open,
    data.mobile,
    data.hidden,
    data.collapsed,
    data.realShellHidden,
    data.transitioning,
  ].map((value) => String(value)).join("|");
}

function emitStateSynced(AppCore, payload = {}, options = {}) {
  const opts = safeObject(options);
  const signature = buildStateSignature(payload);
  const ts = nowTs();

  const repeated =
    signature === lastStateSignature &&
    ts - lastStateEmitAt < STATE_EMIT_MIN_INTERVAL_MS;

  if (repeated && opts.force !== true) return false;

  lastStateSignature = signature;
  lastStateEmitAt = ts;

  return safeEmit(AppCore, "sidebar:state:synced", {
    ...payload,
    source: SOURCE,
    owner: "state.js",
    ts,
  });
}

function buildActiveSignature(payload = {}) {
  const data = safeObject(payload);

  return [
    data.matched,
    data.route,
    data.matchedRoute,
    data.matchedCurrent,
    data.matchCandidateIndex,
  ].map((value) => String(value)).join("|");
}

function emitActiveSynced(AppCore, payload = {}, options = {}) {
  const opts = safeObject(options);
  const signature = buildActiveSignature(payload);
  const ts = nowTs();

  const repeated =
    signature === lastActiveSignature &&
    ts - lastActiveEmitAt < ACTIVE_EMIT_MIN_INTERVAL_MS;

  if (repeated && opts.force !== true) return false;

  lastActiveSignature = signature;
  lastActiveEmitAt = ts;

  return safeEmit(AppCore, "sidebar:active:item:synced", {
    ...payload,
    source: SOURCE,
    ts,
  });
}

/* =========================================================
   ACTIVE ITEM
========================================================= */

export function syncActiveMenuItem(AppCore, options = {}) {
  const {
    sidebarMenu,
  } = getElements(AppCore);

  if (!sidebarMenu) return null;

  const opts = safeObject(options);
  const mutate = opts.mutate !== false;

  const best = findBestMenuItemForCurrentPath(AppCore, sidebarMenu, opts);

  if (mutate) {
    clearActiveItemClasses(sidebarMenu);

    if (best) {
      setActiveItemClasses(best);
    }
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

  emitActiveSynced(AppCore, payload, {
    force: opts.forceEmit === true,
  });

  return best;
}

function resolveActiveMenuItem(AppCore, sidebarMenu = null, options = {}) {
  if (!sidebarMenu) return null;

  const synced = syncActiveMenuItem(AppCore, {
    ...safeObject(options),
    mutate: true,
    reason: safeText(options?.reason, "resolve-active-menu-item"),
  });

  if (synced && isElementVisible(synced)) {
    return synced;
  }

  try {
    const candidate = sidebarMenu.querySelector(ACTIVE_ITEM_SELECTOR);
    return candidate && isElementVisible(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/* =========================================================
   INDICATOR SCHEDULING
========================================================= */

function clearIndicatorSchedule() {
  indicatorGeneration += 1;

  if (indicatorRafA) {
    safeCancelAnimationFrame(indicatorRafA);
    indicatorRafA = 0;
  }

  if (indicatorRafB) {
    safeCancelAnimationFrame(indicatorRafB);
    indicatorRafB = 0;
  }

  if (indicatorTimer) {
    safeClearTimeout(indicatorTimer);
    indicatorTimer = null;
  }
}

function buildIndicatorSignature({
  route = "",
  current = "",
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  reveal = true,
} = {}) {
  return [
    route,
    current,
    Math.round(x),
    Math.round(y),
    Math.round(width),
    Math.round(height),
    reveal ? "1" : "0",
  ].join("|");
}

function isSidebarTransitioning(AppCore) {
  const {
    sidebar,
    sidebarMenu,
    body,
  } = getElements(AppCore);

  const html = getHtmlElement();

  return Boolean(
    sidebarTransitionTimer ||
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

  const {
    sidebarMenu,
  } = getElements(AppCore);

  if (!sidebarMenu) return false;

  setDataset(sidebarMenu, "indicatorReady", DATA_FALSE);
  setDataset(sidebarMenu, "indicatorReason", reason);
  setStyleVar(sidebarMenu, "--sidebar-indicator-opacity", "0");

  lastIndicatorReason = reason;

  safeEmit(AppCore, "sidebar:indicator:disabled", {
    source: SOURCE,
    reason,
  });

  return true;
}

function clearActiveMenuIndicator(AppCore, reason = "clear") {
  clearIndicatorSchedule();

  const {
    sidebarMenu,
  } = getElements(AppCore);

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
  lastIndicatorReason = reason;

  safeEmit(AppCore, "sidebar:indicator:cleared", {
    source: SOURCE,
    reason,
  });

  return true;
}

export function syncActiveMenuIndicator(AppCore, options = {}) {
  const opts = safeObject(options);
  const reason = safeText(opts.reason, "sync");
  const reveal = opts.reveal !== false;

  const {
    sidebar,
    sidebarMenu,
  } = getElements(AppCore);

  if (
    !isBrowser() ||
    !sidebar ||
    !sidebarMenu ||
    isRealShellHidden(AppCore)
  ) {
    return clearActiveMenuIndicator(AppCore, `${reason}:unavailable`);
  }

  if (isSidebarTransitioning(AppCore) && opts.force !== true) {
    return disableActiveMenuIndicator(AppCore, `${reason}:transitioning`);
  }

  let activeItem = opts.activeItem || null;

  if (
    !activeItem ||
    !isConnectedElement(activeItem) ||
    !isElementVisible(activeItem)
  ) {
    activeItem = resolveActiveMenuItem(AppCore, sidebarMenu, opts);
  }

  if (!activeItem || !isElementVisible(activeItem)) {
    return disableActiveMenuIndicator(AppCore, `${reason}:no-active-item`);
  }

  try {
    const menuRect = sidebarMenu.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();

    if (
      !menuRect ||
      !itemRect ||
      menuRect.width <= 0 ||
      itemRect.width <= 0 ||
      itemRect.height <= 0
    ) {
      return disableActiveMenuIndicator(AppCore, `${reason}:bad-rect`);
    }

    const menuWidth = clampNumber(menuRect.width, 0, 10000);

    const x = clampNumber(
      itemRect.left - menuRect.left,
      0,
      Math.max(menuWidth, itemRect.width)
    );

    const y = clampNumber(
      itemRect.top - menuRect.top,
      0,
      100000
    );

    const width = clampNumber(
      itemRect.width,
      1,
      Math.max(menuWidth, itemRect.width)
    );

    const height = clampNumber(
      itemRect.height,
      1,
      1000
    );

    const route = normalizePathLike(
      activeItem.dataset?.matchedRoute ||
        getMenuItemRoute(activeItem) ||
        ""
    );

    const current = normalizePathLike(
      activeItem.dataset?.matchedCurrent ||
        getCurrentPublicPath(AppCore, opts)
    );

    const signature = buildIndicatorSignature({
      route,
      current,
      x,
      y,
      width,
      height,
      reveal,
    });

    if (
      signature === lastIndicatorSignature &&
      reason === lastIndicatorReason
    ) {
      return true;
    }

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
    lastIndicatorReason = reason;

    safeEmit(AppCore, "sidebar:indicator:synced", {
      source: SOURCE,
      reason,
      route,
      current,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      reveal: Boolean(reveal),
    });

    return true;
  } catch (error) {
    safeWarn(AppCore, "No se pudo sincronizar indicador activo.", error);
    return disableActiveMenuIndicator(AppCore, `${reason}:error`);
  }
}

export function scheduleActiveMenuIndicator(AppCore, options = {}) {
  const opts = safeObject(options);

  const reason = safeText(opts.reason, "scheduled");
  const delay = clampNumber(opts.delayMs, 0, 5000);
  const reveal = opts.reveal !== false;
  const force = opts.force === true;

  const generation = indicatorGeneration + 1;

  clearIndicatorSchedule();
  indicatorGeneration = generation;

  const run = () => {
    if (generation !== indicatorGeneration) return;

    indicatorRafA = safeRequestAnimationFrame(() => {
      indicatorRafA = 0;
      if (generation !== indicatorGeneration) return;

      indicatorRafB = safeRequestAnimationFrame(() => {
        indicatorRafB = 0;
        if (generation !== indicatorGeneration) return;

        syncActiveMenuIndicator(AppCore, {
          ...opts,
          reason,
          reveal,
          force,
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
   TRANSITION GUARD
========================================================= */

function cleanupSidebarTransitionListener() {
  try {
    sidebarTransitionEndCleanup?.();
  } catch {}

  sidebarTransitionEndCleanup = null;
}

function clearSidebarTransitionTimer() {
  if (sidebarTransitionTimer) {
    safeClearTimeout(sidebarTransitionTimer);
    sidebarTransitionTimer = null;
  }
}

function setSidebarTransitioning(AppCore, enabled = false, reason = "") {
  const {
    sidebar,
    sidebarMenu,
    body,
  } = getElements(AppCore);

  const html = getHtmlElement();

  toggleClasses(sidebar, {
    "is-transitioning": enabled,
  });

  toggleClasses(sidebarMenu, {
    "is-transitioning": enabled,
  });

  toggleClasses(body, {
    "sidebar-transitioning": enabled,
  });

  toggleClasses(html, {
    "sidebar-transitioning": enabled,
  });

  setDataset(sidebar, "transitioning", enabled ? DATA_TRUE : "");
  setDataset(sidebarMenu, "transitioning", enabled ? DATA_TRUE : "");
  setDataset(body, "sidebarTransitioning", enabled ? DATA_TRUE : "");

  if (enabled) {
    disableActiveMenuIndicator(AppCore, `${reason || "transition"}:start`);
  }

  return true;
}

function finishSidebarTransition(AppCore, reason = "finish") {
  clearSidebarTransitionTimer();
  cleanupSidebarTransitionListener();

  setSidebarTransitioning(AppCore, false, reason);

  const activeItem = syncActiveMenuItem(AppCore, {
    reason: `${reason}:active-final`,
    mutate: true,
    forceRoute: true,
    forceEmit: true,
  });

  scheduleActiveMenuIndicator(AppCore, {
    reason: `${reason}:indicator-final`,
    delayMs: INDICATOR_RECALC_DELAY_MS,
    reveal: true,
    force: true,
    activeItem,
  });

  safeEmit(AppCore, "sidebar:transition:finish", {
    source: SOURCE,
    reason,
  });

  return true;
}

function beginSidebarTransition(AppCore, reason = "state-change", durationMs = SIDEBAR_TRANSITION_MS) {
  if (!isBrowser()) return false;

  const {
    sidebar,
  } = getElements(AppCore);

  if (!sidebar) return false;

  lastTransitionReason = reason;

  clearIndicatorSchedule();
  clearSidebarTransitionTimer();
  cleanupSidebarTransitionListener();

  setSidebarTransitioning(AppCore, true, reason);

  const finish = () => {
    finishSidebarTransition(AppCore, reason);
  };

  const onTransitionEnd = (event) => {
    const propertyName = safeText(event?.propertyName, "");

    if (
      event?.target !== sidebar ||
      !TRANSITION_PROPS.has(propertyName)
    ) {
      return;
    }

    finish();
  };

  try {
    sidebar.addEventListener("transitionend", onTransitionEnd);

    sidebarTransitionEndCleanup = () => {
      try {
        sidebar.removeEventListener("transitionend", onTransitionEnd);
      } catch {}
    };
  } catch {
    sidebarTransitionEndCleanup = null;
  }

  sidebarTransitionTimer = safeSetTimeout(
    finish,
    clampNumber(durationMs, 80, 2000)
  );

  safeEmit(AppCore, "sidebar:transition:start", {
    source: SOURCE,
    reason,
    durationMs: clampNumber(durationMs, 80, 2000),
  });

  return true;
}

/* =========================================================
   TOOLTIPS / LABELS
========================================================= */

export function syncTooltipMode(AppCore, isOpen = null) {
  const {
    sidebar,
    body,
  } = getElements(AppCore);

  if (!sidebar || !body) return false;

  const open =
    typeof isOpen === "boolean"
      ? isOpen
      : getDesiredSidebarOpenState(AppCore);

  const mobile = isMobileViewport();

  const enabled =
    !mobile &&
    !open &&
    !isRealShellHidden(AppCore) &&
    !isSidebarTransitioning(AppCore);

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
  const {
    toggleBtn,
    mobileToggleBtn,
    sidebar,
  } = getElements(AppCore);

  const open =
    typeof isOpen === "boolean"
      ? isOpen
      : getDesiredSidebarOpenState(AppCore);

  const mobile = isMobileViewport();
  const collapsed = !mobile && !open;

  const desktopText = open
    ? "Contraer barra lateral"
    : "Expandir barra lateral";

  const mobileText = open
    ? "Cerrar navegación"
    : "Abrir navegación";

  if (toggleBtn) {
    setAttr(toggleBtn, "aria-label", desktopText);
    setAttr(toggleBtn, "aria-expanded", String(open));
    setAttr(toggleBtn, "type", "button");

    setDataset(toggleBtn, "state", open ? "open" : "closed");
    setDataset(toggleBtn, "tooltip", desktopText);
    setDataset(
      toggleBtn,
      "i18nDataTooltip",
      open ? "sidebar.toggle.collapse" : "sidebar.toggle.expand"
    );

    toggleClass(toggleBtn, "is-active", open);
    removeAttr(toggleBtn, "title");
  }

  if (mobileToggleBtn) {
    setAttr(mobileToggleBtn, "aria-label", mobileText);
    setAttr(mobileToggleBtn, "aria-expanded", String(open));
    setAttr(mobileToggleBtn, "type", "button");

    setDataset(mobileToggleBtn, "state", open ? "open" : "closed");
    setDataset(mobileToggleBtn, "tooltip", mobileText);
    setDataset(
      mobileToggleBtn,
      "i18nDataTooltip",
      open ? "sidebar.toggle.close" : "sidebar.toggle.open"
    );

    toggleClass(mobileToggleBtn, "is-active", open);
    removeAttr(mobileToggleBtn, "title");
  }

  if (sidebar) {
    setDataset(sidebar, "open", open ? DATA_TRUE : DATA_FALSE);
    setDataset(sidebar, "collapsed", collapsed ? DATA_TRUE : DATA_FALSE);
    setDataset(sidebar, "viewport", mobile ? "mobile" : "desktop");
  }

  syncTooltipMode(AppCore, open);

  return true;
}

/* =========================================================
   VISUAL SYNC
========================================================= */

function syncHiddenShellState(AppCore, closeDropdown) {
  const {
    sidebar,
    sidebarMenu,
    body,
  } = getElements(AppCore);

  if (!sidebar) return false;

  clearSidebarTransitionTimer();
  cleanupSidebarTransitionListener();

  setSidebarTransitioning(AppCore, false, "hidden-shell");
  clearActiveMenuIndicator(AppCore, "hidden-shell");

  try {
    closeDropdown?.();
  } catch {}

  removeClass(
    sidebar,
    "open",
    "is-open",
    "collapsed",
    "is-collapsed",
    "sidebar-tooltips-active",
    "is-transitioning",
    "is-visual-syncing"
  );

  removeClass(
    sidebarMenu,
    "is-transitioning",
    "is-visual-syncing"
  );

  removeClass(
    body,
    "sidebar-open",
    "sidebar-collapsed",
    "sidebar-tooltips-active",
    "sidebar-transitioning",
    "sidebar-visual-syncing"
  );

  setHiddenState(sidebar, true);

  setDataset(sidebar, "open", DATA_FALSE);
  setDataset(sidebar, "collapsed", DATA_FALSE);
  setDataset(sidebar, "mode", "hidden");
  setDataset(sidebar, "viewport", "");
  setDataset(sidebar, "transitioning", "");

  setDataset(sidebarMenu, "transitioning", "");

  setDataset(body, "sidebarMode", "hidden");
  setDataset(body, "sidebarTransitioning", "");

  updateToggleLabel(AppCore, false);

  setDataset(sidebar, "mode", "hidden");
  setDataset(sidebar, "collapsed", DATA_FALSE);
  setDataset(sidebar, "viewport", "");
  setDataset(body, "sidebarMode", "hidden");

  emitStateSynced(
    AppCore,
    {
      open: false,
      mobile: isMobileViewport(),
      hidden: true,
      realShellHidden: true,
      domShellHidden: isDomShellHiddenOnly(AppCore),
      collapsed: false,
      transitioning: false,
    },
    {
      force: true,
    }
  );

  return true;
}

function syncVisibleSidebarBase(AppCore, {
  sidebar,
  body,
  mobile,
  open,
} = {}) {
  if (!sidebar) return false;

  const collapsed = !mobile && !open;

  setHiddenState(sidebar, false);

  if (mobile) {
    setMobileMemory(AppCore, open);

    toggleClasses(sidebar, {
      open,
      "is-open": open,
      collapsed: false,
      "is-collapsed": false,
    });

    toggleClasses(body, {
      "sidebar-open": open,
      "sidebar-collapsed": false,
    });

    setDataset(sidebar, "mode", "mobile");
    setDataset(body, "sidebarMode", "mobile");
  } else {
    setDesktopMemory(AppCore, open);
    syncSharedState(AppCore, open);

    toggleClasses(sidebar, {
      open: false,
      "is-open": false,
      collapsed,
      "is-collapsed": collapsed,
    });

    toggleClasses(body, {
      "sidebar-open": false,
      "sidebar-collapsed": collapsed,
    });

    setDataset(sidebar, "mode", "desktop");
    setDataset(body, "sidebarMode", "desktop");
  }

  setDataset(sidebar, "open", open ? DATA_TRUE : DATA_FALSE);
  setDataset(sidebar, "collapsed", collapsed ? DATA_TRUE : DATA_FALSE);
  setDataset(sidebar, "viewport", mobile ? "mobile" : "desktop");

  updateToggleLabel(AppCore, open);

  return true;
}

function syncSidebarStateInternal(AppCore, closeDropdown, options = {}) {
  const opts = safeObject(options);

  const {
    sidebar,
    body,
  } = getElements(AppCore);

  if (!sidebar) return false;

  if (isRealShellHidden(AppCore)) {
    return syncHiddenShellState(AppCore, closeDropdown);
  }

  const mobile = isMobileViewport();
  const open = getDesiredSidebarOpenState(AppCore);
  const collapsed = !open && !mobile;

  const synced = syncVisibleSidebarBase(AppCore, {
    sidebar,
    body,
    mobile,
    open,
  });

  const activeItem = syncActiveMenuItem(AppCore, {
    ...opts,
    reason: opts.reason || "sync-sidebar-state",
    mutate: true,
  });

  if (isSidebarTransitioning(AppCore)) {
    disableActiveMenuIndicator(
      AppCore,
      `${opts.reason || "sync-sidebar-state"}:transitioning`
    );
  } else {
    scheduleActiveMenuIndicator(AppCore, {
      ...opts,
      reason: opts.reason || "sync-sidebar-state",
      delayMs: opts.indicatorDelayMs ?? INDICATOR_RECALC_DELAY_MS,
      reveal: true,
      force: opts.forceIndicator === true,
      activeItem,
    });
  }

  emitStateSynced(
    AppCore,
    {
      open,
      mobile,
      hidden: false,
      realShellHidden: false,
      domShellHidden: isDomShellHiddenOnly(AppCore),
      collapsed,
      transitioning: isSidebarTransitioning(AppCore),
    },
    {
      force: opts.forceEmit === true,
    }
  );

  return synced;
}

export function syncSidebarState(AppCore, closeDropdown) {
  return syncSidebarStateInternal(AppCore, closeDropdown, {
    reason: "sync-sidebar-state",
  });
}

/* =========================================================
   WRITE STATE
========================================================= */

export function setSidebarOpen(AppCore, open, closeDropdown) {
  const nextOpen = Boolean(open);
  const mobile = isMobileViewport();
  const previousOpen = getDesiredSidebarOpenState(AppCore);
  const changed = previousOpen !== nextOpen;
  const collapsed = !nextOpen && !mobile;

  if (isRealShellHidden(AppCore)) {
    syncHiddenShellState(AppCore, closeDropdown);

    safeEmit(AppCore, "sidebar:state:change:blocked", {
      source: SOURCE,
      reason: "shell-hidden",
      requestedOpen: nextOpen,
      previousOpen,
      mobile,
    });

    return false;
  }

  if (!changed) {
    const synced = syncSidebarStateInternal(AppCore, closeDropdown, {
      reason: "set-sidebar-open:no-change",
      forceIndicator: true,
      forceEmit: true,
    });

    safeEmit(AppCore, "sidebar:state:unchanged", {
      source: SOURCE,
      open: nextOpen,
      previousOpen,
      changed: false,
      mobile,
      collapsed,
    });

    return synced;
  }

  safeEmit(AppCore, "sidebar:state:change:start", {
    source: SOURCE,
    open: nextOpen,
    previousOpen,
    changed,
    mobile,
    collapsed,
  });

  beginSidebarTransition(
    AppCore,
    mobile ? "mobile-open-change" : "desktop-collapse-change",
    SIDEBAR_TRANSITION_MS
  );

  if (mobile) {
    setMobileMemory(AppCore, nextOpen);
  } else {
    setDesktopMemory(AppCore, nextOpen);
    syncSharedState(AppCore, nextOpen);
    saveSidebarCollapsed(!nextOpen, AppCore);
  }

  const synced = syncSidebarStateInternal(AppCore, closeDropdown, {
    reason: "set-sidebar-open",
    forceEmit: true,
  });

  afterNextPaint(() => {
    scheduleActiveMenuIndicator(AppCore, {
      reason: "set-sidebar-open:settled",
      delayMs: INDICATOR_SETTLED_DELAY_MS,
      reveal: true,
      force: true,
    });
  });

  safeEmit(AppCore, "sidebar:state:change", {
    source: SOURCE,
    owner: "state.js",
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

/* =========================================================
   REPAIR
========================================================= */

export function repairSidebarState(AppCore, closeDropdown) {
  const state = ensureStateBag(AppCore);
  if (!state) return false;

  const mobile = isMobileViewport();

  if (typeof state.sidebarDesktopOpen !== "boolean") {
    const savedCollapsed = readSavedSidebarCollapsed(AppCore);

    state.sidebarDesktopOpen =
      typeof savedCollapsed === "boolean"
        ? !savedCollapsed
        : true;
  }

  if (typeof state.sidebarMobileOpen !== "boolean") {
    state.sidebarMobileOpen = false;
  }

  if (mobile) {
    state.sidebarOpen = Boolean(state.sidebarMobileOpen);
    state.sidebarMode = "mobile";
    state.sidebarLastMode = "mobile";
  } else {
    state.sidebarOpen = Boolean(state.sidebarDesktopOpen);
    state.sidebarMode = "desktop";
    state.sidebarLastMode = "desktop";
  }

  const synced = syncSidebarStateInternal(AppCore, closeDropdown, {
    reason: "repair-sidebar-state",
    forceEmit: true,
    forceIndicator: true,
    indicatorDelayMs: isSidebarTransitioning(AppCore)
      ? INDICATOR_SETTLED_DELAY_MS
      : INDICATOR_RECALC_DELAY_MS,
  });

  safeEmit(AppCore, "sidebar:state:repaired", {
    source: SOURCE,
    mobile,
    open: Boolean(state.sidebarOpen),
    desktopOpen: Boolean(state.sidebarDesktopOpen),
    mobileOpen: Boolean(state.sidebarMobileOpen),
  });

  return synced;
}

/* =========================================================
   DEBUG SNAPSHOT
========================================================= */

export function getSidebarStateSnapshot(AppCore) {
  const {
    sidebar,
    sidebarMenu,
    body,
    appShell,
    shell,
    layout,
  } = getElements(AppCore);

  const mobile = isMobileViewport();
  const open = getDesiredSidebarOpenState(AppCore);
  const collapsed = !open && !mobile;

  const activeItem = sidebarMenu
    ? resolveActiveMenuItem(AppCore, sidebarMenu, {
        reason: "snapshot",
      })
    : null;

  return {
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
      lastReason: lastIndicatorReason,
      generation: indicatorGeneration,

      x: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-x") || "",
      y: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-y") || "",
      width: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-w") || "",
      height: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-h") || "",
      opacity: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-opacity") || "",
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
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

  getSidebarStateSnapshot,
};
