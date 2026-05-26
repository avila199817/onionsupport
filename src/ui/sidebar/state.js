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
   - Sin estado de dropdown.
   - Sin avatar.
   - Sin Store propio.
   - Sin DOM propio: delega en dom.js.
   - Evitar escrituras repetidas en AppCore.state si el patch no cambia.
========================================================= */

import {
  getSidebarRoot,
  isConnected,
  isElement,
  setSidebarOpenState,
} from "./dom.js";

export const SIDEBAR_STATE_VERSION = "sidebar.state.v7.idempotent-core-sync";

const SOURCE = "sidebar.state";
const DEFAULT_OPEN = true;

/* =========================================================
   RUNTIME
========================================================= */

const runtime = {
  initialized: false,
  mounted: false,
  open: DEFAULT_OPEN,
  logoutInFlight: false,
  root: null,
};

const corePatchSignatures = new WeakMap();

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
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

function connectedRoot(root = null) {
  return Boolean(
    isElement(root) &&
      isConnected(root)
  );
}

function resolveRoot(root = null) {
  if (isElement(root)) return root;

  if (connectedRoot(runtime.root)) {
    return runtime.root;
  }

  return getSidebarRoot();
}

function rootSnapshot(root = null) {
  return {
    hasRoot: isElement(root),
    rootConnected: isConnected(root),
    rootVisible: visibleRoot(root),
    rootHidden: Boolean(root?.hidden),
    rootAriaHidden: root?.getAttribute?.("aria-hidden") || "",
    rootOpen: root?.dataset?.open || "",
    rootSidebarState: root?.dataset?.sidebarState || "",
  };
}

function stablePatchSignature(patch = {}) {
  try {
    return JSON.stringify(patch);
  } catch {
    return "";
  }
}

/* =========================================================
   CORE STATE SYNC
========================================================= */

function ensureCoreState(AppCore = null) {
  if (!isObject(AppCore)) return null;

  try {
    AppCore.state = isObject(AppCore.state) ? AppCore.state : {};
    return AppCore.state;
  } catch {
    return null;
  }
}

function createCorePatch(root = runtime.root) {
  const snapshot = rootSnapshot(root);

  return {
    sidebarInitialized: runtime.initialized,
    sidebarMounted: runtime.mounted,
    sidebarOpen: runtime.open,
    sidebarCollapsed: !runtime.open,
    sidebarLogoutInFlight: runtime.logoutInFlight,

    sidebarHasRoot: snapshot.hasRoot,
    sidebarRootConnected: snapshot.rootConnected,
    sidebarRootVisible: snapshot.rootVisible,
    sidebarRootHidden: snapshot.rootHidden,
    sidebarRootAriaHidden: snapshot.rootAriaHidden,
    sidebarRootOpen: snapshot.rootOpen,
    sidebarRootState: snapshot.rootSidebarState,

    sidebarStateVersion: SIDEBAR_STATE_VERSION,
  };
}

function markCorePatchSynced(AppCore = null, signature = "") {
  if (!isObject(AppCore) || !signature) return false;

  try {
    corePatchSignatures.set(AppCore, signature);
    return true;
  } catch {
    return false;
  }
}

function corePatchAlreadySynced(AppCore = null, signature = "") {
  if (!isObject(AppCore) || !signature) return false;

  try {
    return corePatchSignatures.get(AppCore) === signature;
  } catch {
    return false;
  }
}

function syncCoreState(AppCore = null) {
  if (!isObject(AppCore)) return false;

  const root = resolveRoot();
  const patch = createCorePatch(root);
  const signature = stablePatchSignature(patch);

  /*
    Evita AppCore.setState/Object.assign repetidos cuando no hay cambios.
    Esto reduce ruido y trabajo durante syncs frecuentes del sidebar.
  */
  if (signature && corePatchAlreadySynced(AppCore, signature)) {
    return true;
  }

  try {
    if (isFunction(AppCore.setState)) {
      AppCore.setState(patch, {
        source: SOURCE,
        silent: true,
        emit: false,
      });

      markCorePatchSynced(AppCore, signature);
      return true;
    }
  } catch {
    // fallback abajo
  }

  const state = ensureCoreState(AppCore);

  if (!state) return false;

  try {
    Object.assign(state, patch);
    markCorePatchSynced(AppCore, signature);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ROOT SYNC
========================================================= */

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
  const root = resolveRoot();

  runtime.root = isElement(root) ? root : null;
  runtime.mounted = Boolean(value) && visibleRoot(runtime.root);

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
  runtime.open = DEFAULT_OPEN;
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

  const snapshot = rootSnapshot(root);

  return {
    version: SIDEBAR_STATE_VERSION,

    initialized: runtime.initialized,
    mounted: runtime.mounted,
    open: runtime.open,
    collapsed: !runtime.open,
    logoutInFlight: runtime.logoutInFlight,

    ...snapshot,

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
      noDropdownState: true,
      noAvatarState: true,
      noStoreOwn: true,

      domDelegatedToDomJs: true,
      openStateDelegatedToDomJs: true,
      noOwnDom: true,

      syncsCoreStateSilently: true,
      skipsDuplicateCoreStatePatch: true,
      noSensitiveData: true,
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
