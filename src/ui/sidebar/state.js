/* =========================================================
   Onion Support - Sidebar State
   Archivo: /src/ui/sidebar/state.js

   Responsabilidad:
   - Estado runtime mínimo del sidebar.
   - initialized / mounted / open / logoutInFlight / root.
   - Sin storage.
   - Sin eventos.
   - Sin Router.
   - Sin Auth.
   - Sin rutas.
   - Sin viewport.
   - Sin indicadores.
   - Sin tooltips.
   - Sin dropdown.
   - Sin Store propio.
   - Sin DOM propio: delega en dom.js.
========================================================= */

import {
  getSidebarRoot,
  isConnected,
  isElement,
  setSidebarOpenState,
} from "./dom.js";

export const SIDEBAR_STATE_VERSION = "sidebar.state.v2";

/* =========================================================
   RUNTIME
========================================================= */

const runtime = {
  initialized: false,
  mounted: false,
  open: true,
  logoutInFlight: false,
  root: null,
};

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function contextOf(value = {}) {
  return isObject(value) ? value : {};
}

function visibleRoot(root = null) {
  return Boolean(
    isElement(root) &&
      isConnected(root) &&
      root.hidden !== true &&
      root.getAttribute?.("aria-hidden") !== "true"
  );
}

function resolveRoot(root = null) {
  if (isElement(root)) return root;

  if (isElement(runtime.root) && isConnected(runtime.root)) {
    return runtime.root;
  }

  return getSidebarRoot();
}

function ensureCoreState(AppCore = null) {
  if (!isObject(AppCore)) return null;

  try {
    AppCore.state = isObject(AppCore.state) ? AppCore.state : {};
    return AppCore.state;
  } catch {
    return null;
  }
}

function syncCoreState(AppCore = null) {
  const state = ensureCoreState(AppCore);

  if (!state) return false;

  try {
    state.sidebarInitialized = runtime.initialized;
    state.sidebarMounted = runtime.mounted;
    state.sidebarOpen = runtime.open;
    state.sidebarCollapsed = !runtime.open;
    state.sidebarLogoutInFlight = runtime.logoutInFlight;
    state.sidebarStateVersion = SIDEBAR_STATE_VERSION;

    return true;
  } catch {
    return false;
  }
}

function syncRootOpen(root = null) {
  const target = resolveRoot(root);

  if (!isElement(target)) return false;

  runtime.root = target;
  setSidebarOpenState(target, runtime.open);

  return true;
}

function updateMounted(root = null) {
  const target = resolveRoot(root);

  runtime.root = isElement(target) ? target : null;
  runtime.mounted = visibleRoot(runtime.root);

  return runtime.mounted;
}

/* =========================================================
   ROOT
========================================================= */

export function setSidebarRoot(root = null, AppCore = null) {
  runtime.root = isElement(root) ? root : null;

  if (runtime.root) {
    setSidebarOpenState(runtime.root, runtime.open);
  }

  runtime.mounted = visibleRoot(runtime.root);

  syncCoreState(AppCore);

  return runtime.root;
}

export function getSidebarRuntimeRoot() {
  return resolveRoot();
}

export function clearSidebarRoot(AppCore = null) {
  runtime.root = null;
  runtime.mounted = false;

  syncCoreState(AppCore);

  return true;
}

/* =========================================================
   LIFECYCLE STATE
========================================================= */

export function setSidebarInitialized(value = true, AppCore = null) {
  runtime.initialized = Boolean(value);

  syncCoreState(AppCore);

  return runtime.initialized;
}

export function setSidebarMounted(value = true, AppCore = null) {
  runtime.mounted = Boolean(value) && visibleRoot(resolveRoot());

  syncCoreState(AppCore);

  return runtime.mounted;
}

export function markSidebarMounted(root = null, AppCore = null) {
  const target = resolveRoot(root);

  syncRootOpen(target);
  updateMounted(target);
  syncCoreState(AppCore);

  return runtime.mounted;
}

export function markSidebarUnmounted(AppCore = null) {
  runtime.mounted = false;
  runtime.root = null;

  syncCoreState(AppCore);

  return true;
}

/* =========================================================
   OPEN STATE
========================================================= */

export function getSidebarOpen() {
  return runtime.open;
}

export function setSidebarOpen(open = true, context = {}) {
  const ctx = contextOf(context);
  const root = resolveRoot(ctx.root);

  runtime.open = Boolean(open);

  syncRootOpen(root);
  updateMounted(root);
  syncCoreState(ctx.AppCore || null);

  return runtime.open;
}

export function openSidebar(context = {}) {
  return setSidebarOpen(true, context);
}

export function closeSidebar(context = {}) {
  return setSidebarOpen(false, context);
}

export function toggleSidebar(context = {}) {
  return setSidebarOpen(!runtime.open, context);
}

/* =========================================================
   LOGOUT STATE
========================================================= */

export function getSidebarLogoutInFlight() {
  return runtime.logoutInFlight;
}

export function setSidebarLogoutInFlight(value = true, AppCore = null) {
  runtime.logoutInFlight = Boolean(value);

  syncCoreState(AppCore);

  return runtime.logoutInFlight;
}

export function beginSidebarLogout(AppCore = null) {
  return setSidebarLogoutInFlight(true, AppCore);
}

export function endSidebarLogout(AppCore = null) {
  return setSidebarLogoutInFlight(false, AppCore);
}

/* =========================================================
   SYNC / RESET
========================================================= */

export function syncSidebarState(context = {}) {
  const ctx = contextOf(context);
  const root = resolveRoot(ctx.root);

  syncRootOpen(root);
  updateMounted(root);
  syncCoreState(ctx.AppCore || null);

  return getSidebarState();
}

export function resetSidebarState(AppCore = null) {
  runtime.initialized = false;
  runtime.mounted = false;
  runtime.open = true;
  runtime.logoutInFlight = false;
  runtime.root = null;

  syncCoreState(AppCore);

  return getSidebarState();
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarState() {
  const root = resolveRoot();

  runtime.root = isElement(root) ? root : null;
  runtime.mounted = visibleRoot(runtime.root);

  return {
    version: SIDEBAR_STATE_VERSION,

    initialized: runtime.initialized,
    mounted: runtime.mounted,
    open: runtime.open,
    collapsed: !runtime.open,
    logoutInFlight: runtime.logoutInFlight,

    hasRoot: isElement(root),
    rootConnected: isConnected(root),
    rootHidden: Boolean(root?.hidden),
    rootAriaHidden: root?.getAttribute?.("aria-hidden") || "",
    rootOpen: root?.dataset?.open || "",

    policy: {
      runtimeOnly: true,
      noStorage: true,
      noEvents: true,
      noRouter: true,
      noAuth: true,
      noRoutes: true,
      noViewport: true,
      noIndicators: true,
      noTooltips: true,
      noDropdown: true,
      noOwnDom: true,
    },
  };
}

export function getSidebarStateSnapshot() {
  return getSidebarState();
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_STATE_VERSION,

  setSidebarRoot,
  getSidebarRuntimeRoot,
  clearSidebarRoot,

  setSidebarInitialized,
  setSidebarMounted,
  markSidebarMounted,
  markSidebarUnmounted,

  getSidebarOpen,
  setSidebarOpen,
  openSidebar,
  closeSidebar,
  toggleSidebar,

  getSidebarLogoutInFlight,
  setSidebarLogoutInFlight,
  beginSidebarLogout,
  endSidebarLogout,

  syncSidebarState,
  resetSidebarState,

  getSidebarState,
  getSidebarStateSnapshot,
};
