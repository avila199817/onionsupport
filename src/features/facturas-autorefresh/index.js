/* =========================================================
   Onion Support · Facturas · Autonomous Refresh
   PRODUCTIVO · V1

   Responsabilidad:
   - Mantener Facturas actualizada sin botón manual.
   - Revalidar sólo cuando la vista está visible y ociosa.
   - Pausar durante modales, operaciones busy o modo offline.
   - Revalidar al volver a foco/online si la vista quedó antigua.
   - No hace HTTP propio: usa el controlador canónico de Facturas.
========================================================= */

export const FACTURAS_AUTO_REFRESH_VERSION =
  "facturas.autorefresh.v1.smart-visible-controller";

const CONTROLLER_KEY = Symbol.for("onion.support.facturas.controller");
const ROOT_SELECTOR = ".facturas-view-root, [data-facturas-scope='true']";
const REFRESH_BUTTON_SELECTOR =
  "#facturas-refresh-btn, [data-facturas-action='refresh'], [data-action='refresh']#facturas-refresh-btn";
const MODAL_SELECTOR = [
  "[data-facturas-detail-modal='true']",
  "[data-role='facturas-detail-modal']",
  "[data-facturas-create-modal-panel='true']",
  "[data-facturas-create-root='true']",
].join(",");

const AUTO_REFRESH_INTERVAL_MS = 45_000;
const RETURN_REFRESH_STALE_MS = 15_000;
const BOOT_RETRY_MS = 350;

let timer = 0;
let observer = null;
let refreshing = false;
let lastRefreshAt = Date.now();

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function pageVisible() {
  return isBrowser() && document.visibilityState !== "hidden";
}

function viewRoot() {
  return isBrowser() ? document.querySelector(ROOT_SELECTOR) : null;
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

  const viewHost = document.querySelector("[data-view-container='true'], #view-container");
  try {
    return viewHost?.[CONTROLLER_KEY] || null;
  } catch {
    return null;
  }
}

function removeManualRefresh(root = viewRoot()) {
  if (!root) return false;

  let removed = false;
  root.querySelectorAll(REFRESH_BUTTON_SELECTOR).forEach((button) => {
    button.remove();
    removed = true;
  });

  return removed;
}

function modalOpen(root = viewRoot()) {
  if (!root) return false;
  return Boolean(root.querySelector(MODAL_SELECTOR));
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

async function refreshIfSafe({ forceStale = false } = {}) {
  if (!isBrowser() || refreshing || !pageVisible()) return false;
  if (navigator.onLine === false) return false;

  const root = viewRoot();
  if (!root || !root.isConnected) return false;

  removeManualRefresh(root);

  if (modalOpen(root)) return false;

  const now = Date.now();
  if (!forceStale && now - lastRefreshAt < AUTO_REFRESH_INTERVAL_MS - 1_000) {
    return false;
  }

  if (forceStale && now - lastRefreshAt < RETURN_REFRESH_STALE_MS) {
    return false;
  }

  const controller = findController(root);
  if (!controller || typeof controller.refresh !== "function") return false;
  if (controllerBusy(controller)) return false;

  refreshing = true;
  lastRefreshAt = now;

  try {
    await controller.refresh();
    removeManualRefresh(viewRoot());
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
  removeManualRefresh(viewRoot());
  void refreshIfSafe({ forceStale: true });
}

function startObserver() {
  if (!isBrowser() || typeof MutationObserver === "undefined") return false;

  observer?.disconnect?.();
  observer = new MutationObserver(() => {
    removeManualRefresh(viewRoot());
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  return true;
}

function boot() {
  if (!isBrowser()) return false;

  removeManualRefresh(viewRoot());
  schedule();
  startObserver();

  window.addEventListener("focus", onReturnToApp, { passive: true });
  window.addEventListener("online", onReturnToApp, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (pageVisible()) onReturnToApp();
  }, { passive: true });

  window.setTimeout(() => removeManualRefresh(viewRoot()), BOOT_RETRY_MS);
  return true;
}

boot();

export const FacturasAutoRefresh = Object.freeze({
  version: FACTURAS_AUTO_REFRESH_VERSION,
  refreshIfSafe,
  getSnapshot() {
    return {
      intervalMs: AUTO_REFRESH_INTERVAL_MS,
      returnStaleMs: RETURN_REFRESH_STALE_MS,
      refreshing,
      lastRefreshAt,
      viewMounted: Boolean(viewRoot()),
      manualRefreshVisible: Boolean(viewRoot()?.querySelector(REFRESH_BUTTON_SELECTOR)),
    };
  },
});

export default FacturasAutoRefresh;
