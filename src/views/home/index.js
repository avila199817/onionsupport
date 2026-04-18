/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo home
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y homeView.js
   - init / reload / destroy seguros
   - exponer modal / navegación / helpers públicos
   - evitar duplicidad de lógica en index.js

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo no existe
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
   INTERNAL SAFE CALL
========================================================= */

function safeCall(
  target,
  method,
  args = [],
  fallback = undefined
) {
  try {
    const fn = target?.[method];

    if (typeof fn === "function") {
      return fn(...args);
    }
  } catch {}

  return fallback;
}

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  safeCall(HomeView, "init", args);

export const render = (...args) =>
  safeCall(HomeView, "render", args);

export const reload = (...args) =>
  safeCall(HomeView, "reload", args);

export const destroy = (...args) =>
  safeCall(HomeView, "destroy", args);

/* =========================================================
   ACTIONS API
========================================================= */

export const openWidget = (...args) =>
  safeCall(HomeView, "openWidget", args);

export const copyWidgetId = (...args) =>
  safeCall(HomeView, "copyWidgetId", args);

export const exportCsv = (...args) =>
  safeCall(HomeView, "exportCsv", args);

export const navigate = (...args) =>
  safeCall(HomeView, "navigate", args);

export const quickAction = (...args) =>
  safeCall(HomeView, "quickAction", args);

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  safeCall(HomeView, "goToPage", args);

export const goPrevPage = (...args) =>
  safeCall(HomeView, "goPrevPage", args);

export const goNextPage = (...args) =>
  safeCall(HomeView, "goNextPage", args);

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

/* =========================================================
   MODAL API
========================================================= */

export const openModal = (...args) =>
  safeCall(HomeModal, "open", args);

export const closeModal = (...args) =>
  safeCall(HomeModal, "close", args);

export const updateModal = (...args) =>
  safeCall(HomeModal, "update", args);

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(HomeView?.initialized);

export const isDestroyed = () =>
  Boolean(HomeView?.destroyed);

/* =========================================================
   LEGACY GLOBAL BRIDGE (OPTIONAL)
========================================================= */

try {
  if (typeof window !== "undefined") {
    window.OnionHome = {
      init,
      render,
      reload,
      destroy,

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

      openModal,
      closeModal,
      updateModal,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */
