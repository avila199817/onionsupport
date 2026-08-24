/* =========================================================
   Onion Support · Facturas · Autonomous Refresh
   Archivo: /src/features/facturas-autorefresh/index.js

   Responsabilidad:
   - Revalidar Facturas sólo cuando la vista está visible, online y ociosa.
   - Pausar durante modales, operaciones busy o interacción reciente.
   - Revalidar al recuperar foco/online si los datos quedaron antiguos.
   - Usar exclusivamente el controlador canónico de Facturas.
   - Escuchar interacción únicamente dentro del mount persistente del Router.
   - No corregir ni borrar DOM generado por el template.
   - Cargar la confirmación visual del cobro/factura definitiva de la ruta.
========================================================= */

import "../facturas-paid-confirm/index.js";

export const FACTURAS_AUTO_REFRESH_VERSION =
  "facturas.autorefresh.v5-paid-confirm";

const CONTROLLER_KEY = Symbol.for("onion.support.facturas.controller");
const ROOT_SELECTOR = ".facturas-view-root, [data-facturas-scope='true']";
const VIEW_HOST_SELECTOR = "[data-view-container='true'], #view-container";
const MODAL_SELECTOR = [
  "[data-facturas-detail-modal='true']",
  "[data-role='facturas-detail-modal']",
  "[data-facturas-create-modal-panel='true']",
  "[data-facturas-create-root='true']",
].join(",");
const EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [role='textbox']";

const AUTO_REFRESH_INTERVAL_MS = 45_000;
const RETURN_REFRESH_STALE_MS = 15_000;
const USER_IDLE_GRACE_MS = 12_000;

let timer = 0;
let refreshing = false;
let lastRefreshAt = Date.now();
let lastInteractionAt = 0;
let installed = false;
let interactionHost = null;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function pageVisible() {
  return isBrowser() && document.visibilityState !== "hidden";
}

function viewHost() {
  return isBrowser() ? document.querySelector(VIEW_HOST_SELECTOR) : null;
}

function viewRoot() {
  return viewHost()?.querySelector?.(ROOT_SELECTOR) || null;
}

function findController(root = viewRoot()) {
  if (!root) return null;

  let node = root;
  while (node) {
    try {
      if (node[CONTROLLER_KEY]) return node[CONTROLLER_KEY];
    } catch {
      // noop
    }
    node = node.parentElement;
  }

  try {
    return viewHost()?.[CONTROLLER_KEY] || null;
  } catch {
    return null;
  }
}

function modalOpen(root = viewRoot()) {
  return Boolean(root?.querySelector?.(MODAL_SELECTOR));
}

function userIsInteracting(root = viewRoot(), now = Date.now()) {
  if (!root) return false;

  const active = document.activeElement;
  if (active && root.contains(active) && active.matches?.(EDITABLE_SELECTOR)) {
    return true;
  }

  return now - lastInteractionAt < USER_IDLE_GRACE_MS;
}

function controllerBusy(controller = null) {
  if (!controller || typeof controller.getSnapshot !== "function") return true;

  try {
    const snapshot = controller.getSnapshot() || {};
    return Boolean(
      snapshot.loading ||
      snapshot.refreshing ||
      snapshot.loadingMore ||
      snapshot.creating ||
      snapshot.destroyed ||
      snapshot.mounted === false
    );
  } catch {
    return true;
  }
}

export async function refreshIfSafe({ forceStale = false } = {}) {
  if (!isBrowser() || refreshing || !pageVisible()) return false;
  if (navigator.onLine === false) return false;

  const root = viewRoot();
  if (!root?.isConnected || modalOpen(root)) return false;

  const now = Date.now();
  if (userIsInteracting(root, now)) return false;

  const minAge = forceStale
    ? RETURN_REFRESH_STALE_MS
    : AUTO_REFRESH_INTERVAL_MS - 1_000;

  if (now - lastRefreshAt < minAge) return false;

  const controller = findController(root);
  if (!controller || typeof controller.refresh !== "function") return false;
  if (controllerBusy(controller)) return false;

  refreshing = true;
  lastRefreshAt = now;

  try {
    await controller.refresh();
    return true;
  } catch {
    return false;
  } finally {
    refreshing = false;
  }
}

function schedule() {
  if (!isBrowser()) return false;

  if (timer) window.clearInterval(timer);
  timer = window.setInterval(() => {
    void refreshIfSafe();
  }, AUTO_REFRESH_INTERVAL_MS);
  return true;
}

function onReturnToApp() {
  void refreshIfSafe({ forceStale: true });
}

function onVisibilityChange() {
  if (pageVisible()) onReturnToApp();
}

function onUserInteraction(event) {
  const root = viewRoot();
  if (!root || !event?.target || !root.contains(event.target)) return;
  lastInteractionAt = Date.now();
}

function bindInteractionHost() {
  if (!isBrowser() || interactionHost) return Boolean(interactionHost);

  const host = viewHost();
  if (!host) return false;

  for (const eventName of ["pointerdown", "input", "keydown"]) {
    host.addEventListener(eventName, onUserInteraction, {
      passive: true,
      capture: true,
    });
  }

  interactionHost = host;
  return true;
}

function unbindInteractionHost() {
  const host = interactionHost;
  interactionHost = null;
  if (!host) return false;

  for (const eventName of ["pointerdown", "input", "keydown"]) {
    host.removeEventListener(eventName, onUserInteraction, true);
  }

  return true;
}

export function installFacturasAutoRefresh() {
  if (!isBrowser() || installed) return false;

  const host = viewHost();
  if (!host) return false;

  installed = true;
  schedule();
  bindInteractionHost();

  window.addEventListener("focus", onReturnToApp, { passive: true });
  window.addEventListener("online", onReturnToApp, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange, { passive: true });

  return true;
}

export function destroyFacturasAutoRefresh() {
  if (!isBrowser() || !installed) return false;
  installed = false;

  if (timer) window.clearInterval(timer);
  timer = 0;

  window.removeEventListener("focus", onReturnToApp);
  window.removeEventListener("online", onReturnToApp);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  unbindInteractionHost();

  refreshing = false;
  lastInteractionAt = 0;
  return true;
}

installFacturasAutoRefresh();

export const FacturasAutoRefresh = Object.freeze({
  version: FACTURAS_AUTO_REFRESH_VERSION,
  refreshIfSafe,
  install: installFacturasAutoRefresh,
  destroy: destroyFacturasAutoRefresh,
  getSnapshot() {
    return Object.freeze({
      intervalMs: AUTO_REFRESH_INTERVAL_MS,
      returnStaleMs: RETURN_REFRESH_STALE_MS,
      idleGraceMs: USER_IDLE_GRACE_MS,
      refreshing,
      lastRefreshAt,
      lastInteractionAt,
      viewMounted: Boolean(viewRoot()),
      interactionScope: interactionHost ? "router-view" : "none",
      installed,
    });
  },
});

export default FacturasAutoRefresh;
