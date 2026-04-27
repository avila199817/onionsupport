/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo home
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y homeView.js
   - init / render / reload / destroy seguros
   - aliases mount / unmount / refresh para compatibilidad
   - exponer modal / navegación / helpers públicos
   - evitar duplicidad de lógica en index.js
   - preservar this/contexto al delegar métodos
   - bridge global opcional para debug

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo no existe
   - no pisa bridges globales existentes sin mezclar
========================================================= */

import HomeView from "./homeView.js";
import HomeModal from "./home.modal.js";

/* =========================================================
   CORE EXPORTS
========================================================= */

export { HomeView };
export { HomeModal };

export default HomeView;

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFn(value) {
  return typeof value === "function";
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeCall(
  target,
  method,
  args = [],
  fallback = undefined
) {
  try {
    const source = safeObject(target);
    const fn = source?.[method];

    if (isFn(fn)) {
      /*
        Importante:
        apply(source, args) preserva this si HomeView/HomeModal
        usan estado interno como this.state / this.initialized.
      */
      return fn.apply(source, Array.isArray(args) ? args : []);
    }
  } catch (error) {
    try {
      console.warn(
        `[HomeIndex] ${String(method)} falló.`,
        error
      );
    } catch {}
  }

  return fallback;
}

function safeFlag(target, key, fallback = false) {
  try {
    return Boolean(target?.[key]);
  } catch {
    return Boolean(fallback);
  }
}

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  safeCall(HomeView, "init", args, null);

export const render = (...args) =>
  safeCall(HomeView, "render", args, null);

export const mount = (...args) =>
  safeCall(
    HomeView,
    "mount",
    args,
    safeCall(HomeView, "init", args, null)
  );

export const reload = (...args) =>
  safeCall(
    HomeView,
    "reload",
    args,
    safeCall(HomeView, "refresh", args, null)
  );

export const refresh = (...args) =>
  safeCall(
    HomeView,
    "refresh",
    args,
    safeCall(HomeView, "reload", args, null)
  );

export const destroy = (...args) =>
  safeCall(HomeView, "destroy", args, true);

export const unmount = (...args) =>
  safeCall(
    HomeView,
    "unmount",
    args,
    safeCall(HomeView, "destroy", args, true)
  );

/* =========================================================
   ACTIONS API
========================================================= */

export const openWidget = (...args) =>
  safeCall(HomeView, "openWidget", args, null);

export const copyWidgetId = (...args) =>
  safeCall(HomeView, "copyWidgetId", args, false);

export const exportCsv = (...args) =>
  safeCall(HomeView, "exportCsv", args, false);

export const navigate = (...args) =>
  safeCall(HomeView, "navigate", args, false);

export const quickAction = (...args) =>
  safeCall(HomeView, "quickAction", args, false);

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  safeCall(HomeView, "goToPage", args, false);

export const goPrevPage = (...args) =>
  safeCall(HomeView, "goPrevPage", args, false);

export const goNextPage = (...args) =>
  safeCall(HomeView, "goNextPage", args, false);

/* =========================================================
   DATA API
========================================================= */

export const getDashboard = (...args) =>
  safeCall(HomeView, "getDashboard", args, {});

export const getWidgets = (...args) =>
  safeCall(HomeView, "getWidgets", args, []);

export const getPageWidgets = (...args) =>
  safeCall(HomeView, "getPageWidgets", args, []);

export const getWidgetById = (...args) =>
  safeCall(HomeView, "getWidgetById", args, null);

export const getState = (...args) =>
  safeCall(HomeView, "getState", args, null);

export const getSnapshot = (...args) =>
  safeCall(
    HomeView,
    "getSnapshot",
    args,
    {
      initialized: isInitialized(),
      destroyed: isDestroyed(),
      hasHomeView: Boolean(HomeView),
      hasHomeModal: Boolean(HomeModal),
    }
  );

/* =========================================================
   MODAL API
========================================================= */

export const openModal = (...args) =>
  safeCall(
    HomeModal,
    "open",
    args,
    safeCall(HomeModal, "show", args, null)
  );

export const closeModal = (...args) =>
  safeCall(
    HomeModal,
    "close",
    args,
    safeCall(HomeModal, "hide", args, true)
  );

export const updateModal = (...args) =>
  safeCall(
    HomeModal,
    "update",
    args,
    safeCall(HomeModal, "patch", args, null)
  );

export const destroyModal = (...args) =>
  safeCall(HomeModal, "destroy", args, true);

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  safeFlag(HomeView, "initialized", false);

export const isDestroyed = () =>
  safeFlag(HomeView, "destroyed", false);

export const isReady = () =>
  Boolean(isInitialized() && !isDestroyed());

/* =========================================================
   PUBLIC MODULE API
========================================================= */

export const Home = Object.freeze({
  init,
  render,
  mount,

  reload,
  refresh,

  destroy,
  unmount,

  openWidget,
  copyWidgetId,
  exportCsv,
  navigate,
  quickAction,

  goToPage,
  goPrevPage,
  goNextPage,

  getDashboard,
  getWidgets,
  getPageWidgets,
  getWidgetById,
  getState,
  getSnapshot,

  openModal,
  closeModal,
  updateModal,
  destroyModal,

  isInitialized,
  isDestroyed,
  isReady,

  View: HomeView,
  Modal: HomeModal,
});

/* =========================================================
   LEGACY GLOBAL BRIDGE OPTIONAL
========================================================= */

try {
  if (isBrowser()) {
    window.OnionHome = {
      ...(window.OnionHome || {}),
      ...Home,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */
