/* =========================================================
   Onion SPA - Sidebar State
   Archivo: src/ui/sidebar/state.js

   PRO HARDENED VERSION · DESKTOP/MOBILE STABLE

   Responsabilidades:
   - resolver estado visual del sidebar
   - separar estado desktop y mobile
   - persistir estado desktop colapsado
   - no mezclar sidebarOpen mobile con desktop
   - sincronizar clases / aria / data attrs
   - mantener tooltips coherentes
   - evitar auto-collapse fantasma al navegar
   - soportar fallback DOM / storage seguro
   - no alterar estado si el shell está oculto
   - emitir eventos de sincronización

   REGLAS:
   - Desktop:
     - estado fuente: AppCore.state.sidebarDesktopOpen
     - fallback: storage sidebar-collapsed / sidebarOpen legacy
     - default: abierto
   - Mobile:
     - estado fuente: AppCore.state.sidebarOpen
     - fallback: DOM
     - default: cerrado
   - Navegación:
     - NO debe abrir/cerrar sidebar
     - solo resincroniza clases visuales
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

    if (["true", "1", "yes", "si", "sí"].includes(key)) return true;
    if (["false", "0", "no"].includes(key)) return false;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
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

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {}

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
  if (!el) return;

  try {
    el.classList.remove(...classes.filter(Boolean));
  } catch {}
}

function toggleClass(el, className = "", enabled = false) {
  if (!el || !className) return;

  try {
    el.classList.toggle(className, Boolean(enabled));
  } catch {}
}

function setAttr(el, name = "", value = "") {
  if (!el || !name) return;

  try {
    el.setAttribute(name, String(value));
  } catch {}
}

function removeAttr(el, name = "") {
  if (!el || !name) return;

  try {
    el.removeAttribute(name);
  } catch {}
}

function setDataset(el, key = "", value = "") {
  if (!el || !key) return;

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete el.dataset[key];
      return;
    }

    el.dataset[key] = String(value);
  } catch {}
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
      `(max-width: ${Number(breakpoint) || MOBILE_BREAKPOINT}px)`
    ).matches;
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

function setDesktopMemory(AppCore, open) {
  const state = ensureStateBag(AppCore);
  if (!state) return false;

  state.sidebarDesktopOpen = Boolean(open);

  return true;
}

function setMobileMemory(AppCore, open) {
  const state = ensureStateBag(AppCore);
  if (!state) return false;

  state.sidebarOpen = Boolean(open);

  return true;
}

function syncSharedState(AppCore, open) {
  const state = ensureStateBag(AppCore);
  if (!state) return false;

  /*
    Compatibilidad:
    sidebarOpen queda como estado visible actual,
    pero desktop tiene su fuente real en sidebarDesktopOpen.
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
      body?.classList?.contains?.("sidebar-open")
    ) {
      return true;
    }

    return false;
  }

  if (
    sidebar?.classList?.contains?.("collapsed") ||
    sidebar?.classList?.contains?.("is-collapsed") ||
    body?.classList?.contains?.("sidebar-collapsed")
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

  if (typeof state?.sidebarOpen === "boolean") {
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
    !isShellHidden(AppCore);

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

  const desktopText = open
    ? "Contraer barra lateral"
    : "Expandir barra lateral";

  const mobileText = open
    ? "Cerrar navegación"
    : "Abrir navegación";

  if (toggleBtn) {
    setAttr(toggleBtn, "aria-label", desktopText);
    setAttr(toggleBtn, "aria-expanded", String(open));

    toggleClass(toggleBtn, "is-active", open);

    /*
      Solo tooltip custom. Nunca title nativo.
    */
    toggleBtn.dataset.tooltip = desktopText;
    toggleBtn.dataset.i18nDataTooltip =
      open
        ? "sidebar.toggle.collapse"
        : "sidebar.toggle.expand";

    removeAttr(toggleBtn, "title");
  }

  if (mobileToggleBtn) {
    setAttr(mobileToggleBtn, "aria-label", mobileText);
    setAttr(mobileToggleBtn, "aria-expanded", String(open));

    toggleClass(mobileToggleBtn, "is-active", open);

    mobileToggleBtn.dataset.tooltip = mobileText;
    mobileToggleBtn.dataset.i18nDataTooltip =
      open
        ? "sidebar.toggle.close"
        : "sidebar.toggle.open";

    removeAttr(mobileToggleBtn, "title");
  }

  if (sidebar) {
    setDataset(sidebar, "open", open ? "true" : "false");
    setDataset(sidebar, "collapsed", open ? "false" : "true");
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

  try {
    sidebar.hidden = true;
    sidebar.setAttribute("aria-hidden", "true");
  } catch {}

  removeClass(
    sidebar,
    "open",
    "is-open",
    "collapsed",
    "is-collapsed"
  );

  removeClass(
    body,
    "sidebar-open",
    "sidebar-collapsed",
    "sidebar-tooltips-active"
  );

  setDataset(sidebar, "open", "false");
  setDataset(sidebar, "collapsed", "false");
  setDataset(sidebar, "mode", "hidden");

  try {
    closeDropdown?.();
  } catch {}

  syncTooltipMode(AppCore, true);
  updateToggleLabel(AppCore, false);

  safeEmit(AppCore, "sidebar:state:synced", {
    open: false,
    mobile: isMobileViewport(),
    hidden: true,
  });

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

  if (isShellHidden(AppCore)) {
    return syncHiddenShellState(
      AppCore,
      closeDropdown
    );
  }

  const mobile = isMobileViewport();
  const open = getDesiredSidebarOpenState(AppCore);

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

  updateToggleLabel(AppCore, open);

  safeEmit(AppCore, "sidebar:state:synced", {
    open,
    mobile,
    hidden: false,
    collapsed: !open && !mobile,
  });

  return true;
}

/* =========================================================
   WRITE STATE
========================================================= */

export function setSidebarOpen(AppCore, open, closeDropdown) {
  const nextOpen = Boolean(open);
  const mobile = isMobileViewport();

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

  safeEmit(AppCore, "sidebar:state:change", {
    open: nextOpen,
    mobile,
    collapsed: !nextOpen && !mobile,
  });

  return synced;
}

/* =========================================================
   DEBUG
========================================================= */

export function getSidebarStateSnapshot(AppCore) {
  const {
    sidebar,
    body,
  } = getElements(AppCore);

  const mobile = isMobileViewport();
  const open = getDesiredSidebarOpenState(AppCore);

  return {
    mobile,
    open,
    collapsed: !open && !mobile,
    shellHidden: isShellHidden(AppCore),

    state: {
      sidebarOpen:
        AppCore?.state?.sidebarOpen ?? null,
      sidebarDesktopOpen:
        AppCore?.state?.sidebarDesktopOpen ?? null,
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
      hasSidebar: Boolean(sidebar),
      sidebarHidden:
        Boolean(sidebar?.hidden),
      sidebarClasses:
        sidebar?.className || "",
      bodyClasses:
        body?.className || "",
      sidebarOpenDataset:
        sidebar?.dataset?.open || null,
      sidebarCollapsedDataset:
        sidebar?.dataset?.collapsed || null,
      sidebarMode:
        sidebar?.dataset?.mode || null,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  isMobileViewport,

  getSavedSidebarCollapsed,
  saveSidebarCollapsed,

  getDesiredSidebarOpenState,
  isSidebarCollapsedDesktop,

  syncTooltipMode,
  updateToggleLabel,
  syncSidebarState,
  setSidebarOpen,

  getSidebarStateSnapshot,
};
