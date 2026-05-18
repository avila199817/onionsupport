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
   - Sin DOM propio: delega en dom.js.
========================================================= */

import {
  getSidebarRoot,
  isElement,
  setSidebarOpenState,
} from "./dom.js";

export const SIDEBAR_STATE_VERSION = "sidebar.state.v1";

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

function resolveRoot(root = null) {
  if (isElement(root)) return root;
  if (isElement(runtime.root)) return runtime.root;

  return getSidebarRoot();
}

function ensureCoreState(AppCore = null) {
  if (!AppCore || typeof AppCore !== "object") return null;

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

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ROOT
========================================================= */

export function setSidebarRoot(root = null, AppCore = null) {
  runtime.root = isElement(root) ? root : null;
  runtime.mounted = isElement(runtime.root) && runtime.root.hidden !== true;

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
  runtime.mounted = Boolean(value);

  syncCoreState(AppCore);

  return runtime.mounted;
}

export function markSidebarMounted(root = null, AppCore = null) {
  if (root) setSidebarRoot(root, AppCore);

  runtime.mounted = Boolean(resolveRoot());
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
  const AppCore = context.AppCore || null;
  const root = resolveRoot(context.root);

  runtime.open = Boolean(open);

  if (root) {
    runtime.root = root;
    setSidebarOpenState(root, runtime.open);
  }

  syncCoreState(AppCore);

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
  const AppCore = context.AppCore || null;
  const root = resolveRoot(context.root);

  runtime.root = root;
  runtime.mounted = Boolean(root && root.hidden !== true);

  if (root) {
    setSidebarOpenState(root, runtime.open);
  }

  syncCoreState(AppCore);

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

  return {
    version: SIDEBAR_STATE_VERSION,

    initialized: runtime.initialized,
    mounted: runtime.mounted,
    open: runtime.open,
    collapsed: !runtime.open,
    logoutInFlight: runtime.logoutInFlight,

    hasRoot: Boolean(root),
    rootHidden: Boolean(root?.hidden),
    rootOpen: root?.dataset?.open || "",
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
