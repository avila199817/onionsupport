/* =========================================================
   Onion SPA - Sidebar State
   Archivo: src/ui/sidebar/state.js

   FINAL EXTREME SYSTEM · DESKTOP/MOBILE STABLE · APPLE INDICATOR · 10/10

   Responsabilidades:
   - resolver estado visual del sidebar
   - separar estado desktop y mobile
   - persistir estado desktop colapsado
   - no mezclar sidebarOpen mobile con desktop
   - sincronizar clases / aria / data attrs
   - mantener tooltips coherentes
   - evitar auto-collapse fantasma al navegar
   - soportar fallback DOM / storage seguro
   - no alterar estado si el shell real está oculto
   - evitar que sidebar.hidden stale deje el sidebar bloqueado
   - emitir eventos de sincronización
   - activar indicador activo deslizante tipo Apple
   - recalcular indicador al cambiar vista / colapsar / expandir / reparar
   - ocultar indicador durante transición para evitar burbuja flotante

   REGLAS:
   - Desktop:
     - estado fuente: AppCore.state.sidebarDesktopOpen
     - fallback: storage sidebar-collapsed / sidebarOpen legacy
     - default: abierto
   - Mobile:
     - estado fuente real: AppCore.state.sidebarMobileOpen
     - compat visible: AppCore.state.sidebarOpen
     - fallback: DOM mobile
     - default: cerrado
   - Navegación:
     - NO debe abrir/cerrar sidebar
     - solo resincroniza clases visuales
   - Dropdown:
     - syncSidebarState no cierra dropdown salvo shell real oculto
     - sidebar.hidden stale no debe bloquear apertura posterior
   - Indicador:
     - se posiciona con CSS vars sobre .sidebar-menu
     - usa .menu-item.active / [aria-current="page"] / ruta actual
     - se desactiva si no hay item activo visible
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

const LEGACY_SIDEBAR_OPEN_STORAGE_KEY = "sidebarOpen";

const SIDEBAR_TRANSITION_MS = 380;
const INDICATOR_RECALC_DELAY_MS = 32;
const INDICATOR_SETTLED_DELAY_MS = SIDEBAR_TRANSITION_MS + 28;

/* =========================================================
   MODULE RUNTIME
========================================================= */

let sidebarTransitionTimer = null;
let sidebarTransitionEndCleanup = null;
let indicatorRaf = 0;
let indicatorTimer = null;

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeBoolean(value, fallback = null) {
  if (typeof value === "boolean") {
    return value;
  }

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

  return Number.isFinite(n)
    ? n
    : fallback;
}

function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
  const n = safeNumber(value, min);

  return Math.min(
    Math.max(n, min),
    max
  );
}

function ensureStateBag(AppCore) {
  if (!AppCore || typeof AppCore !== "object") {
    return null;
  }

  if (!AppCore.state || typeof AppCore.state !== "object") {
    AppCore.state = {};
  }

  return AppCore.state;
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarState]", ...args);
  } catch {}

  try {
    console.warn("[SidebarState]", ...args);
  } catch {}
}

function getStorage(AppCore = null) {
  try {
    const storage = AppCore?.storage;

    if (
      storage &&
      (
        typeof storage.get === "function" ||
        typeof storage.set === "function" ||
        typeof storage.remove === "function"
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

    if (storage?.get) {
      const value = storage.get(cleanKey);
      const parsed = safeBoolean(value, null);

      if (typeof parsed === "boolean") {
        return parsed;
      }
    }
  } catch {}

  return null;
}

function writeToAppStorage(AppCore, key = "", value = false) {
  const cleanKey = safeText(key, "");
  if (!cleanKey) return false;

  try {
    const storage = getStorage(AppCore);

    if (storage?.set) {
      storage.set(cleanKey, String(Boolean(value)));
      return true;
    }
  } catch {}

  return false;
}

function readFromLocalStorage(key = "") {
  const cleanKey = safeText(key, "");
  if (!cleanKey || !isBrowser()) return null;

  try {
    const value = window.localStorage?.getItem?.(cleanKey);
    const parsed = safeBoolean(value, null);

    if (typeof parsed === "boolean") {
      return parsed;
    }
  } catch {}

  return null;
}

function writeToLocalStorage(key = "", value = false) {
  const cleanKey = safeText(key, "");
  if (!cleanKey || !isBrowser()) return false;

  try {
    window.localStorage?.setItem?.(
      cleanKey,
      String(Boolean(value))
    );

    return true;
  } catch {
    return false;
  }
}

function removeClass(el, ...classes) {
  if (!el) return false;

  try {
    el.classList.remove(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function toggleClass(el, className = "", enabled = false) {
  if (!el || !className) return false;

  try {
    el.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function setAttr(el, name = "", value = "") {
  if (!el || !name) return false;

  try {
    el.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeAttr(el, name = "") {
  if (!el || !name) return false;

  try {
    el.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function setDataset(el, key = "", value = "") {
  if (!el || !key) return false;

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete el.dataset[key];
      return true;
    }

    el.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function setStyleVar(el, name = "", value = "") {
  if (!el || !name) {
    return false;
  }

  try {
    el.style.setProperty(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeStyleVar(el, name = "") {
  if (!el || !name) {
    return false;
  }

  try {
    el.style.removeProperty(name);
    return true;
  } catch {
    return false;
  }
}

function getHtmlElement() {
  if (!isBrowser()) return null;

  try {
    return document.documentElement || null;
  } catch {
    return null;
  }
}

function getBodyElement() {
  if (!isBrowser()) return null;

  try {
    return document.body || null;
  } catch {
    return null;
  }
}

function safeRequestAnimationFrame(callback) {
  if (typeof callback !== "function") {
    return 0;
  }

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
    window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}

  return 0;
}

function safeCancelAnimationFrame(id = 0) {
  if (!id || !isBrowser()) {
    return false;
  }

  try {
    window.cancelAnimationFrame(id);
    return true;
  } catch {
    return false;
  }
}

function afterNextPaint(callback) {
  if (typeof callback !== "function") {
    return;
  }

  safeRequestAnimationFrame(() => {
    safeRequestAnimationFrame(callback);
  });
}

function safeSetTimeout(callback, ms = 0) {
  if (typeof callback !== "function") {
    return null;
  }

  try {
    return setTimeout(() => {
      try {
        callback();
      } catch {}
    }, ms);
  } catch {
    try {
      callback();
    } catch {}

    return null;
  }
}

function safeClearTimeout(timer) {
  if (!timer) {
    return false;
  }

  try {
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

function clearIndicatorSchedule() {
  if (indicatorRaf) {
    safeCancelAnimationFrame(indicatorRaf);
    indicatorRaf = 0;
  }

  if (indicatorTimer) {
    safeClearTimeout(indicatorTimer);
    indicatorTimer = null;
  }
}

/* =========================================================
   RESPONSIVE
========================================================= */

export function isMobileViewport(breakpoint = MOBILE_BREAKPOINT) {
  if (!isBrowser()) {
    return false;
  }

  try {
    return window.matchMedia(
      `(max-width: ${safeNumber(breakpoint, MOBILE_BREAKPOINT)}px)`
    ).matches;
  } catch {
    return false;
  }
}

/* =========================================================
   REAL SHELL HIDDEN RESOLUTION
========================================================= */

export function isRealShellHidden(AppCore) {
  if (!isBrowser()) {
    return false;
  }

  const {
    body,
    appShell,
    shell,
    layout,
  } = getElements(AppCore);

  const html = getHtmlElement();

  /*
    Importante:
    NO usamos sidebar.hidden como fuente.
    dom.js/isShellHidden() sí lo usa, y eso puede dejar la UI bloqueada
    después de una ruta pública/auth si no se rehidrata perfecto.
  */
  return Boolean(
    AppCore?.state?.shellVisible === false ||
      AppCore?.state?.routeShellHidden === true ||
      AppCore?.state?.authScreen === true ||

      body?.classList?.contains?.("route-shell-hidden") ||
      body?.classList?.contains?.("auth-screen") ||
      body?.dataset?.shell === "hidden" ||
      body?.dataset?.shellVisible === "false" ||

      html?.dataset?.shell === "hidden" ||
      html?.dataset?.shellVisible === "false" ||

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
   PERSISTENCE
========================================================= */

function readSavedSidebarCollapsed(AppCore = null) {
  /*
    Nueva clave:
      true  => desktop colapsado
      false => desktop abierto
  */
  const fromAppStorage = readFromAppStorage(
    AppCore,
    DESKTOP_COLLAPSED_STORAGE_KEY
  );

  if (typeof fromAppStorage === "boolean") {
    return fromAppStorage;
  }

  const fromLocalStorage = readFromLocalStorage(
    DESKTOP_COLLAPSED_STORAGE_KEY
  );

  if (typeof fromLocalStorage === "boolean") {
    return fromLocalStorage;
  }

  /*
    Legacy:
      sidebarOpen=true  => NO collapsed
      sidebarOpen=false => collapsed
  */
  const legacyFromAppStorage = readFromAppStorage(
    AppCore,
    LEGACY_SIDEBAR_OPEN_STORAGE_KEY
  );

  if (typeof legacyFromAppStorage === "boolean") {
    return !legacyFromAppStorage;
  }

  const legacyFromLocalStorage = readFromLocalStorage(
    LEGACY_SIDEBAR_OPEN_STORAGE_KEY
  );

  if (typeof legacyFromLocalStorage === "boolean") {
    return !legacyFromLocalStorage;
  }

  return null;
}

export function getSavedSidebarCollapsed(AppCore = null) {
  const saved = readSavedSidebarCollapsed(AppCore);

  return typeof saved === "boolean"
    ? saved
    : false;
}

export function saveSidebarCollapsed(value, AppCore = null) {
  const collapsed = Boolean(value);

  const appOk = writeToAppStorage(
    AppCore,
    DESKTOP_COLLAPSED_STORAGE_KEY,
    collapsed
  );

  const localOk = writeToLocalStorage(
    DESKTOP_COLLAPSED_STORAGE_KEY,
    collapsed
  );

  /*
    Legacy compat:
      sidebarOpen = !collapsed
  */
  writeToAppStorage(
    AppCore,
    LEGACY_SIDEBAR_OPEN_STORAGE_KEY,
    !collapsed
  );

  writeToLocalStorage(
    LEGACY_SIDEBAR_OPEN_STORAGE_KEY,
    !collapsed
  );

  return Boolean(appOk || localOk);
}

/* =========================================================
   INTERNAL MEMORY
========================================================= */

function setModeMemory(AppCore, mode = "") {
  const state = ensureStateBag(AppCore);
  if (!state) return false;

  const cleanMode = safeText(mode, "");

  if (cleanMode) {
    state.sidebarMode = cleanMode;
    state.sidebarLastMode = cleanMode;
  }

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

  /*
    Fuente real mobile.
    sidebarOpen queda como compat visible actual.
  */
  state.sidebarMobileOpen = Boolean(open);
  state.sidebarOpen = Boolean(open);

  setModeMemory(AppCore, "mobile");

  return true;
}

function syncSharedState(AppCore, open) {
  const state = ensureStateBag(AppCore);
  if (!state) return false;

  /*
    Compatibilidad:
    sidebarOpen representa estado visible actual.
    Desktop real vive en sidebarDesktopOpen.
    Mobile real vive en sidebarMobileOpen.
  */
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

  if (!sidebar && !body) {
    return null;
  }

  const mobile = isMobileViewport();

  if (mobile) {
    if (
      sidebar?.classList?.contains?.("open") ||
      sidebar?.classList?.contains?.("is-open") ||
      body?.classList?.contains?.("sidebar-open") ||
      sidebar?.dataset?.open === "true"
    ) {
      return true;
    }

    return false;
  }

  if (
    sidebar?.classList?.contains?.("collapsed") ||
    sidebar?.classList?.contains?.("is-collapsed") ||
    body?.classList?.contains?.("sidebar-collapsed") ||
    sidebar?.dataset?.collapsed === "true"
  ) {
    return false;
  }

  if (
    sidebar?.dataset?.open === "false" ||
    sidebar?.dataset?.collapsed === "true"
  ) {
    return false;
  }

  if (sidebar) {
    return true;
  }

  return null;
}

/* =========================================================
   DESIRED OPEN STATE
========================================================= */

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

  /*
    Default natural desktop.
  */
  setDesktopMemory(AppCore, true);
  syncSharedState(AppCore, true);

  return true;
}

function getMobileDesiredOpenState(AppCore) {
  const state = ensureStateBag(AppCore);

  /*
    Fuente real mobile. Evita heredar desktopOpen/sidebarOpen
    cuando se cambia de viewport.
  */
  if (typeof state?.sidebarMobileOpen === "boolean") {
    return state.sidebarMobileOpen;
  }

  /*
    Compat legacy solo si el último modo conocido fue mobile.
    Así no heredamos sidebarOpen=true de desktop.
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

  /*
    Default natural mobile.
  */
  setMobileMemory(AppCore, false);

  return false;
}

export function getDesiredSidebarOpenState(AppCore) {
  return isMobileViewport()
    ? getMobileDesiredOpenState(AppCore)
    : getDesktopDesiredOpenState(AppCore);
}

export function isSidebarCollapsedDesktop(AppCore) {
  if (isMobileViewport()) {
    return false;
  }

  return !getDesktopDesiredOpenState(AppCore);
}

/* =========================================================
   ACTIVE ROUTE / MENU INDICATOR
========================================================= */

function stripPublicUsernamePrefix(pathname = "/") {
  const value =
    safeText(pathname, "/")
      .replace(/^\/@[^/]+(?=\/|$)/i, "");

  return value || "/";
}

function normalizePathLike(path = "/") {
  let value =
    safeText(path, "/")
      .replace(/\\/g, "/")
      .trim();

  if (!value) {
    return "/";
  }

  try {
    const url = new URL(
      value,
      isBrowser()
        ? window.location.origin
        : "http://localhost"
    );

    if (
      url.hash &&
      (
        url.hash.startsWith("#/") ||
        url.hash.startsWith("#!")
      )
    ) {
      value = url.hash
        .replace(/^#!\/?/, "/")
        .replace(/^#\/?/, "/");
    } else {
      value = `${url.pathname || "/"}${url.search || ""}`;
    }
  } catch {
    if (
      value.startsWith("#/") ||
      value.startsWith("#!")
    ) {
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

  const [pathname, query = ""] = value.split("?");

  let cleanPathname = stripPublicUsernamePrefix(pathname || "/");

  if (
    cleanPathname.length > 1 &&
    cleanPathname.endsWith("/")
  ) {
    cleanPathname = cleanPathname.replace(/\/+$/g, "") || "/";
  }

  return query
    ? `${cleanPathname}?${query}`
    : cleanPathname;
}

function stripQuery(path = "/") {
  return normalizePathLike(path).split("?")[0] || "/";
}

function getCurrentPublicPath(AppCore) {
  const fromState =
    safeText(
      AppCore?.state?.publicPath ||
        AppCore?.state?.route ||
        AppCore?.state?.canonicalPath ||
        "",
      ""
    );

  if (fromState) {
    return normalizePathLike(fromState);
  }

  if (!isBrowser()) {
    return "/";
  }

  try {
    const hash = safeText(window.location.hash, "");

    if (
      hash.startsWith("#/") ||
      hash.startsWith("#!")
    ) {
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

function getMenuItemRoute(item = null) {
  if (!item) {
    return "";
  }

  return safeText(
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
}

function isElementVisible(element = null) {
  if (!element || !isBrowser()) {
    return false;
  }

  try {
    if (element.hidden) {
      return false;
    }

    if (
      element.closest?.(
        [
          "[hidden]",
          "[inert]",
          "[aria-hidden='true']",
          "[data-role-visible='false']",
          "[data-admin-visible='false']",
          "[data-sidebar-visible='false']",
        ].join(",")
      )
    ) {
      return false;
    }

    const style = window.getComputedStyle(element);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      safeNumber(style.opacity, 1) === 0
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();

    return (
      rect.width > 0 &&
      rect.height > 0
    );
  } catch {
    return true;
  }
}

function getMenuItems(sidebarMenu = null) {
  if (!sidebarMenu) {
    return [];
  }

  try {
    return Array.from(
      sidebarMenu.querySelectorAll(
        [
          ".menu-item",
          "a[data-spa]",
          "a[data-route]",
          "[data-sidebar-nav='true']",
        ].join(",")
      )
    ).filter((item, index, array) => {
      return (
        item &&
        array.indexOf(item) === index
      );
    });
  } catch {
    return [];
  }
}

function clearActiveItemClasses(sidebarMenu = null) {
  const items = getMenuItems(sidebarMenu);

  for (const item of items) {
    try {
      item.classList.remove("active", "is-active");
      item.removeAttribute("aria-current");
      delete item.dataset.active;
    } catch {}
  }

  return true;
}

function setActiveItemClasses(item = null) {
  if (!item) {
    return false;
  }

  try {
    item.classList.add("active", "is-active");
    item.setAttribute("aria-current", "page");
    item.dataset.active = "true";
    return true;
  } catch {
    return false;
  }
}

function findBestMenuItemForCurrentPath(AppCore, sidebarMenu = null) {
  if (!sidebarMenu) {
    return null;
  }

  const currentPath = getCurrentPublicPath(AppCore);
  const currentClean = stripQuery(currentPath);

  const items = getMenuItems(sidebarMenu);

  let best = null;
  let bestScore = -1;

  for (const item of items) {
    if (!isElementVisible(item)) {
      continue;
    }

    const route = getMenuItemRoute(item);

    if (!route) {
      continue;
    }

    const routePath = normalizePathLike(route);
    const routeClean = stripQuery(routePath);

    let score = -1;

    if (routePath === currentPath) {
      score = 1000 + routePath.length;
    } else if (routeClean === currentClean) {
      score = 900 + routeClean.length;
    } else if (
      routeClean !== "/" &&
      currentClean.startsWith(`${routeClean}/`)
    ) {
      score = 500 + routeClean.length;
    } else if (
      routeClean === "/" &&
      currentClean === "/"
    ) {
      score = 100;
    }

    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  return bestScore >= 0
    ? best
    : null;
}

export function syncActiveMenuItem(AppCore, options = {}) {
  const {
    sidebarMenu,
  } = getElements(AppCore);

  if (!sidebarMenu) {
    return null;
  }

  const opts =
    options && typeof options === "object"
      ? options
      : {};

  const shouldMutate =
    opts.mutate !== false;

  const best =
    findBestMenuItemForCurrentPath(
      AppCore,
      sidebarMenu
    );

  if (shouldMutate) {
    clearActiveItemClasses(sidebarMenu);

    if (best) {
      setActiveItemClasses(best);
    }
  }

  safeEmit(AppCore, "sidebar:active:item:synced", {
    reason:
      safeText(opts.reason, "sync-active-item"),
    matched:
      Boolean(best),
    route:
      getMenuItemRoute(best),
    currentPublicPath:
      getCurrentPublicPath(AppCore),
  });

  return best;
}

function resolveActiveMenuItem(AppCore, sidebarMenu = null) {
  if (!sidebarMenu) {
    return null;
  }

  const directSelectors = [
    ".menu-item[aria-current='page']",
    ".menu-item.active",
    ".menu-item.is-active",
    ".menu-item[data-active='true']",
    "[data-sidebar-nav='true'][aria-current='page']",
    "[data-sidebar-nav='true'].active",
    "[data-sidebar-nav='true'].is-active",
  ];

  for (const selector of directSelectors) {
    try {
      const candidate = sidebarMenu.querySelector(selector);

      if (candidate && isElementVisible(candidate)) {
        return candidate;
      }
    } catch {}
  }

  return syncActiveMenuItem(AppCore, {
    mutate:
      true,
    reason:
      "resolve-active-menu-item",
  });
}

function isSidebarTransitioning(AppCore) {
  const {
    sidebar,
    body,
  } = getElements(AppCore);

  const html = getHtmlElement();

  return Boolean(
    sidebarTransitionTimer ||
      sidebar?.classList?.contains?.("is-transitioning") ||
      body?.classList?.contains?.("sidebar-transitioning") ||
      html?.classList?.contains?.("sidebar-transitioning") ||
      sidebar?.dataset?.transitioning === "true"
  );
}

function disableActiveMenuIndicator(AppCore, reason = "disabled") {
  const {
    sidebarMenu,
  } = getElements(AppCore);

  if (!sidebarMenu) {
    return false;
  }

  setDataset(sidebarMenu, "indicatorReady", "false");
  setStyleVar(sidebarMenu, "--sidebar-indicator-opacity", "0");

  safeEmit(AppCore, "sidebar:indicator:disabled", {
    reason,
  });

  return true;
}

function clearActiveMenuIndicator(AppCore, reason = "clear") {
  clearIndicatorSchedule();

  const {
    sidebarMenu,
  } = getElements(AppCore);

  if (!sidebarMenu) {
    return false;
  }

  setDataset(sidebarMenu, "indicatorReady", "");
  removeStyleVar(sidebarMenu, "--sidebar-indicator-x");
  removeStyleVar(sidebarMenu, "--sidebar-indicator-y");
  removeStyleVar(sidebarMenu, "--sidebar-indicator-w");
  removeStyleVar(sidebarMenu, "--sidebar-indicator-h");
  removeStyleVar(sidebarMenu, "--sidebar-indicator-opacity");

  safeEmit(AppCore, "sidebar:indicator:cleared", {
    reason,
  });

  return true;
}

export function syncActiveMenuIndicator(AppCore, options = {}) {
  const opts =
    options && typeof options === "object"
      ? options
      : {};

  const reason =
    safeText(opts.reason, "sync");

  const reveal =
    opts.reveal !== false;

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
    return clearActiveMenuIndicator(
      AppCore,
      `${reason}:unavailable`
    );
  }

  if (
    isSidebarTransitioning(AppCore) &&
    opts.force !== true
  ) {
    return disableActiveMenuIndicator(
      AppCore,
      `${reason}:transitioning`
    );
  }

  const activeItem =
    opts.activeItem ||
    resolveActiveMenuItem(
      AppCore,
      sidebarMenu
    );

  if (!activeItem || !isElementVisible(activeItem)) {
    return disableActiveMenuIndicator(
      AppCore,
      `${reason}:no-active-item`
    );
  }

  try {
    const menuRect =
      sidebarMenu.getBoundingClientRect();

    const itemRect =
      activeItem.getBoundingClientRect();

    if (
      !menuRect ||
      !itemRect ||
      itemRect.width <= 0 ||
      itemRect.height <= 0
    ) {
      return disableActiveMenuIndicator(
        AppCore,
        `${reason}:bad-rect`
      );
    }

    const menuWidth =
      clampNumber(menuRect.width, 0, 10000);

    const x =
      clampNumber(
        itemRect.left - menuRect.left,
        0,
        menuWidth
      );

    const y =
      clampNumber(
        itemRect.top - menuRect.top,
        0,
        100000
      );

    const width =
      clampNumber(
        itemRect.width,
        1,
        Math.max(menuWidth, itemRect.width)
      );

    const height =
      clampNumber(
        itemRect.height,
        1,
        1000
      );

    setStyleVar(sidebarMenu, "--sidebar-indicator-x", `${Math.round(x)}px`);
    setStyleVar(sidebarMenu, "--sidebar-indicator-y", `${Math.round(y)}px`);
    setStyleVar(sidebarMenu, "--sidebar-indicator-w", `${Math.round(width)}px`);
    setStyleVar(sidebarMenu, "--sidebar-indicator-h", `${Math.round(height)}px`);
    setStyleVar(sidebarMenu, "--sidebar-indicator-opacity", reveal ? "1" : "0");

    setDataset(sidebarMenu, "indicatorReady", "true");
    setDataset(sidebarMenu, "indicatorRoute", getMenuItemRoute(activeItem) || "");
    setDataset(sidebarMenu, "indicatorReason", reason);

    safeEmit(AppCore, "sidebar:indicator:synced", {
      reason,
      route:
        getMenuItemRoute(activeItem),
      x:
        Math.round(x),
      y:
        Math.round(y),
      width:
        Math.round(width),
      height:
        Math.round(height),
      reveal:
        Boolean(reveal),
    });

    return true;
  } catch (error) {
    safeWarn(
      AppCore,
      "No se pudo sincronizar indicador activo.",
      error
    );

    return disableActiveMenuIndicator(
      AppCore,
      `${reason}:error`
    );
  }
}

export function scheduleActiveMenuIndicator(AppCore, options = {}) {
  const opts =
    options && typeof options === "object"
      ? options
      : {};

  const reason =
    safeText(opts.reason, "scheduled");

  const delay =
    clampNumber(
      opts.delayMs,
      0,
      5000
    );

  const reveal =
    opts.reveal !== false;

  const force =
    opts.force === true;

  clearIndicatorSchedule();

  if (delay > 0) {
    indicatorTimer = safeSetTimeout(() => {
      indicatorTimer = null;

      indicatorRaf = safeRequestAnimationFrame(() => {
        indicatorRaf = 0;

        syncActiveMenuIndicator(AppCore, {
          reason,
          reveal,
          force,
        });
      });
    }, delay);

    return true;
  }

  indicatorRaf = safeRequestAnimationFrame(() => {
    indicatorRaf = 0;

    syncActiveMenuIndicator(AppCore, {
      reason,
      reveal,
      force,
    });
  });

  return true;
}

/* =========================================================
   SIDEBAR TRANSITION GUARD
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
    body,
  } = getElements(AppCore);

  const html =
    getHtmlElement();

  toggleClass(
    sidebar,
    "is-transitioning",
    enabled
  );

  toggleClass(
    body,
    "sidebar-transitioning",
    enabled
  );

  toggleClass(
    html,
    "sidebar-transitioning",
    enabled
  );

  setDataset(
    sidebar,
    "transitioning",
    enabled ? "true" : ""
  );

  setDataset(
    body,
    "sidebarTransitioning",
    enabled ? "true" : ""
  );

  if (enabled) {
    disableActiveMenuIndicator(
      AppCore,
      `${reason || "transition"}:start`
    );
  }

  return true;
}

function finishSidebarTransition(AppCore, reason = "finish") {
  clearSidebarTransitionTimer();
  cleanupSidebarTransitionListener();

  setSidebarTransitioning(
    AppCore,
    false,
    reason
  );

  syncActiveMenuItem(AppCore, {
    reason:
      `${reason}:active-final`,
    mutate:
      true,
  });

  scheduleActiveMenuIndicator(AppCore, {
    reason:
      `${reason}:indicator-final`,
    delayMs:
      INDICATOR_RECALC_DELAY_MS,
    reveal:
      true,
    force:
      true,
  });

  safeEmit(AppCore, "sidebar:transition:finish", {
    reason,
  });

  return true;
}

function beginSidebarTransition(AppCore, reason = "state-change", durationMs = SIDEBAR_TRANSITION_MS) {
  if (!isBrowser()) {
    return false;
  }

  const {
    sidebar,
  } = getElements(AppCore);

  if (!sidebar) {
    return false;
  }

  clearIndicatorSchedule();
  clearSidebarTransitionTimer();
  cleanupSidebarTransitionListener();

  setSidebarTransitioning(
    AppCore,
    true,
    reason
  );

  const finish = () => {
    finishSidebarTransition(
      AppCore,
      reason
    );
  };

  const onTransitionEnd = (event) => {
    if (
      event?.target !== sidebar ||
      ![
        "inline-size",
        "width",
        "transform",
      ].includes(event?.propertyName)
    ) {
      return;
    }

    finish();
  };

  try {
    sidebar.addEventListener(
      "transitionend",
      onTransitionEnd
    );

    sidebarTransitionEndCleanup = () => {
      try {
        sidebar.removeEventListener(
          "transitionend",
          onTransitionEnd
        );
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
    reason,
    durationMs:
      clampNumber(durationMs, 80, 2000),
  });

  return true;
}

/* =========================================================
   TOOLTIPS
========================================================= */

export function syncTooltipMode(AppCore, isOpen = null) {
  const {
    sidebar,
    body,
  } = getElements(AppCore);

  if (!sidebar || !body) {
    return false;
  }

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

  toggleClass(
    sidebar,
    "sidebar-tooltips-active",
    enabled
  );

  toggleClass(
    body,
    "sidebar-tooltips-active",
    enabled
  );

  setDataset(
    sidebar,
    "tooltipMode",
    enabled ? "compact" : "off"
  );

  setDataset(
    body,
    "sidebarTooltipMode",
    enabled ? "compact" : "off"
  );

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch {}

  return enabled;
}

/* =========================================================
   TOGGLE LABELS
========================================================= */

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

  const mobile =
    isMobileViewport();

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

    toggleClass(toggleBtn, "is-active", open);

    /*
      Solo tooltip custom. Nunca title nativo.
    */
    setDataset(toggleBtn, "tooltip", desktopText);
    setDataset(
      toggleBtn,
      "i18nDataTooltip",
      open
        ? "sidebar.toggle.collapse"
        : "sidebar.toggle.expand"
    );

    removeAttr(toggleBtn, "title");
  }

  if (mobileToggleBtn) {
    setAttr(mobileToggleBtn, "aria-label", mobileText);
    setAttr(mobileToggleBtn, "aria-expanded", String(open));
    setAttr(mobileToggleBtn, "type", "button");

    toggleClass(mobileToggleBtn, "is-active", open);

    setDataset(mobileToggleBtn, "tooltip", mobileText);
    setDataset(
      mobileToggleBtn,
      "i18nDataTooltip",
      open
        ? "sidebar.toggle.close"
        : "sidebar.toggle.open"
    );

    removeAttr(mobileToggleBtn, "title");
  }

  if (sidebar) {
    setDataset(sidebar, "open", open ? "true" : "false");
    setDataset(sidebar, "collapsed", open ? "false" : "true");
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
    body,
  } = getElements(AppCore);

  if (!sidebar) {
    return false;
  }

  clearSidebarTransitionTimer();
  cleanupSidebarTransitionListener();
  setSidebarTransitioning(AppCore, false, "hidden-shell");

  try {
    sidebar.hidden = true;
    sidebar.setAttribute("aria-hidden", "true");
  } catch {}

  removeClass(
    sidebar,
    "open",
    "is-open",
    "collapsed",
    "is-collapsed",
    "sidebar-tooltips-active",
    "is-transitioning"
  );

  removeClass(
    body,
    "sidebar-open",
    "sidebar-collapsed",
    "sidebar-tooltips-active",
    "sidebar-transitioning"
  );

  setDataset(sidebar, "open", "false");
  setDataset(sidebar, "collapsed", "false");
  setDataset(sidebar, "mode", "hidden");
  setDataset(sidebar, "viewport", "");
  setDataset(body, "sidebarMode", "hidden");

  try {
    closeDropdown?.();
  } catch {}

  clearActiveMenuIndicator(
    AppCore,
    "hidden-shell"
  );

  syncTooltipMode(AppCore, true);
  updateToggleLabel(AppCore, false);

  safeEmit(AppCore, "sidebar:state:synced", {
    open: false,
    mobile: isMobileViewport(),
    hidden: true,
    realShellHidden: true,
    domShellHidden: isDomShellHiddenOnly(AppCore),
  });

  return true;
}

function syncVisibleSidebarBase(AppCore, {
  sidebar,
  body,
  mobile,
  open,
} = {}) {
  if (!sidebar) {
    return false;
  }

  try {
    sidebar.hidden = false;
    sidebar.setAttribute("aria-hidden", "false");
  } catch {}

  if (mobile) {
    setMobileMemory(AppCore, open);

    toggleClass(sidebar, "open", open);
    toggleClass(sidebar, "is-open", open);

    removeClass(
      sidebar,
      "collapsed",
      "is-collapsed"
    );

    toggleClass(body, "sidebar-open", open);

    removeClass(
      body,
      "sidebar-collapsed"
    );

    setDataset(sidebar, "mode", "mobile");
    setDataset(body, "sidebarMode", "mobile");
  } else {
    setDesktopMemory(AppCore, open);
    syncSharedState(AppCore, open);

    toggleClass(sidebar, "collapsed", !open);
    toggleClass(sidebar, "is-collapsed", !open);

    removeClass(
      sidebar,
      "open",
      "is-open"
    );

    toggleClass(body, "sidebar-collapsed", !open);

    removeClass(
      body,
      "sidebar-open"
    );

    setDataset(sidebar, "mode", "desktop");
    setDataset(body, "sidebarMode", "desktop");
  }

  setDataset(sidebar, "open", open ? "true" : "false");
  setDataset(sidebar, "collapsed", open ? "false" : "true");
  setDataset(sidebar, "viewport", mobile ? "mobile" : "desktop");

  updateToggleLabel(AppCore, open);

  return true;
}

export function syncSidebarState(AppCore, closeDropdown) {
  const {
    sidebar,
    body,
  } = getElements(AppCore);

  if (!sidebar) {
    return false;
  }

  /*
    Fix crítico:
    No usar isShellHidden(AppCore) aquí directamente.
    dom.js considera sidebar.hidden === true como shell hidden.
    Eso puede dejar el sidebar bloqueado tras login/auth route/router repair.
  */
  if (isRealShellHidden(AppCore)) {
    return syncHiddenShellState(
      AppCore,
      closeDropdown
    );
  }

  const mobile = isMobileViewport();
  const open = getDesiredSidebarOpenState(AppCore);

  const synced = syncVisibleSidebarBase(AppCore, {
    sidebar,
    body,
    mobile,
    open,
  });

  syncActiveMenuItem(AppCore, {
    reason:
      "sync-sidebar-state",
    mutate:
      true,
  });

  if (isSidebarTransitioning(AppCore)) {
    disableActiveMenuIndicator(
      AppCore,
      "sync-sidebar-state:transitioning"
    );
  } else {
    scheduleActiveMenuIndicator(AppCore, {
      reason:
        "sync-sidebar-state",
      delayMs:
        INDICATOR_RECALC_DELAY_MS,
      reveal:
        true,
    });
  }

  safeEmit(AppCore, "sidebar:state:synced", {
    open,
    mobile,
    hidden: false,
    realShellHidden: false,
    domShellHidden: isDomShellHiddenOnly(AppCore),
    collapsed: !open && !mobile,
    transitioning: isSidebarTransitioning(AppCore),
  });

  return synced;
}

/* =========================================================
   WRITE STATE
========================================================= */

export function setSidebarOpen(AppCore, open, closeDropdown) {
  const nextOpen = Boolean(open);
  const mobile = isMobileViewport();
  const previousOpen = getDesiredSidebarOpenState(AppCore);
  const changed = previousOpen !== nextOpen;

  /*
    Si la shell real está oculta, no persistimos ni mezclamos estado.
    Solo resincronizamos oculto.
  */
  if (isRealShellHidden(AppCore)) {
    syncHiddenShellState(AppCore, closeDropdown);

    safeEmit(AppCore, "sidebar:state:change:blocked", {
      reason: "shell-hidden",
      requestedOpen: nextOpen,
      previousOpen,
      mobile,
    });

    return false;
  }

  safeEmit(AppCore, "sidebar:state:change:start", {
    open: nextOpen,
    previousOpen,
    changed,
    mobile,
    collapsed: !nextOpen && !mobile,
  });

  if (changed) {
    beginSidebarTransition(
      AppCore,
      mobile
        ? "mobile-open-change"
        : "desktop-collapse-change",
      SIDEBAR_TRANSITION_MS
    );
  }

  if (mobile) {
    setMobileMemory(AppCore, nextOpen);
  } else {
    setDesktopMemory(AppCore, nextOpen);
    syncSharedState(AppCore, nextOpen);

    saveSidebarCollapsed(
      !nextOpen,
      AppCore
    );
  }

  const synced = syncSidebarState(
    AppCore,
    closeDropdown
  );

  if (changed) {
    afterNextPaint(() => {
      scheduleActiveMenuIndicator(AppCore, {
        reason:
          "set-sidebar-open:settled",
        delayMs:
          INDICATOR_SETTLED_DELAY_MS,
        reveal:
          true,
        force:
          true,
      });
    });
  } else {
    scheduleActiveMenuIndicator(AppCore, {
      reason:
        "set-sidebar-open:no-change",
      delayMs:
        INDICATOR_RECALC_DELAY_MS,
      reveal:
        true,
      force:
        true,
    });
  }

  safeEmit(AppCore, "sidebar:state:change", {
    open: nextOpen,
    previousOpen,
    changed,
    mobile,
    collapsed: !nextOpen && !mobile,
    transitioning: changed,
  });

  return synced;
}

/* =========================================================
   REPAIR HELPERS
========================================================= */

export function repairSidebarState(AppCore, closeDropdown) {
  const state = ensureStateBag(AppCore);

  if (!state) {
    return false;
  }

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

  const synced =
    syncSidebarState(AppCore, closeDropdown);

  scheduleActiveMenuIndicator(AppCore, {
    reason:
      "repair-sidebar-state",
    delayMs:
      isSidebarTransitioning(AppCore)
        ? INDICATOR_SETTLED_DELAY_MS
        : INDICATOR_RECALC_DELAY_MS,
    reveal:
      true,
    force:
      true,
  });

  safeEmit(AppCore, "sidebar:state:repaired", {
    mobile,
    open:
      Boolean(state.sidebarOpen),
    desktopOpen:
      Boolean(state.sidebarDesktopOpen),
    mobileOpen:
      Boolean(state.sidebarMobileOpen),
  });

  return synced;
}

/* =========================================================
   DEBUG
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

  const activeItem =
    sidebarMenu
      ? resolveActiveMenuItem(AppCore, sidebarMenu)
      : null;

  return {
    mobile,
    open,
    collapsed: !open && !mobile,
    transitioning:
      isSidebarTransitioning(AppCore),

    shellHidden:
      isDomShellHiddenOnly(AppCore),

    realShellHidden:
      isRealShellHidden(AppCore),

    state: {
      sidebarOpen:
        AppCore?.state?.sidebarOpen ?? null,

      sidebarDesktopOpen:
        AppCore?.state?.sidebarDesktopOpen ?? null,

      sidebarMobileOpen:
        AppCore?.state?.sidebarMobileOpen ?? null,

      sidebarMode:
        AppCore?.state?.sidebarMode ?? null,

      sidebarLastMode:
        AppCore?.state?.sidebarLastMode ?? null,

      shellVisible:
        AppCore?.state?.shellVisible ?? null,
    },

    storage: {
      savedCollapsed:
        readSavedSidebarCollapsed(AppCore),

      collapsedKey:
        DESKTOP_COLLAPSED_STORAGE_KEY,

      legacyOpenKey:
        LEGACY_SIDEBAR_OPEN_STORAGE_KEY,
    },

    dom: {
      hasSidebar:
        Boolean(sidebar),

      hasSidebarMenu:
        Boolean(sidebarMenu),

      sidebarHidden:
        Boolean(sidebar?.hidden),

      sidebarAriaHidden:
        sidebar?.getAttribute?.("aria-hidden") || null,

      sidebarClasses:
        sidebar?.className || "",

      bodyClasses:
        body?.className || "",

      appShellHidden:
        Boolean(appShell?.hidden),

      shellHidden:
        Boolean(shell?.hidden),

      layoutHidden:
        Boolean(layout?.hidden),

      sidebarOpenDataset:
        sidebar?.dataset?.open || null,

      sidebarCollapsedDataset:
        sidebar?.dataset?.collapsed || null,

      sidebarMode:
        sidebar?.dataset?.mode || null,

      sidebarViewport:
        sidebar?.dataset?.viewport || null,

      sidebarTransitioning:
        sidebar?.dataset?.transitioning || null,

      bodySidebarMode:
        body?.dataset?.sidebarMode || null,
    },

    indicator: {
      ready:
        sidebarMenu?.dataset?.indicatorReady || null,

      reason:
        sidebarMenu?.dataset?.indicatorReason || null,

      route:
        sidebarMenu?.dataset?.indicatorRoute || null,

      activeRoute:
        getMenuItemRoute(activeItem),

      currentPublicPath:
        getCurrentPublicPath(AppCore),

      x:
        sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-x") || "",

      y:
        sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-y") || "",

      width:
        sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-w") || "",

      height:
        sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-h") || "",

      opacity:
        sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-opacity") || "",
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
