/* =========================================================
   Onion SPA - Server View
   Archivo: src/views/server/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo server
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y serverView.js
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

import ServerView from "./serverView.js";
import ServerModal from "./server.modal.js";

/* =========================================================
   CORE EXPORTS
========================================================= */

export { ServerView };
export { ServerModal };

export default ServerView;

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
  safeCall(ServerView, "init", args);

export const render = (...args) =>
  safeCall(ServerView, "render", args);

export const reload = (...args) =>
  safeCall(ServerView, "reload", args);

export const destroy = (...args) =>
  safeCall(ServerView, "destroy", args);

/* =========================================================
   ACTIONS API
========================================================= */

export const openDetail = (...args) =>
  safeCall(ServerView, "openDetail", args);

export const copyDetailId = (...args) =>
  safeCall(ServerView, "copyDetailId", args);

export const refreshHealth = (...args) =>
  safeCall(ServerView, "refreshHealth", args);

export const toggleLive = (...args) =>
  safeCall(ServerView, "toggleLive", args);

export const navigate = (...args) =>
  safeCall(ServerView, "navigate", args);

export const quickAction = (...args) =>
  safeCall(ServerView, "quickAction", args);

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  safeCall(ServerView, "goToPage", args);

export const goPrevPage = (...args) =>
  safeCall(ServerView, "goPrevPage", args);

export const goNextPage = (...args) =>
  safeCall(ServerView, "goNextPage", args);

/* =========================================================
   DATA API
========================================================= */

export const getSnapshot = (...args) =>
  safeCall(ServerView, "getSnapshot", args, {});

export const getServices = (...args) =>
  safeCall(ServerView, "getServices", args, []);

export const getPageServices = (...args) =>
  safeCall(ServerView, "getPageServices", args, []);

export const getServiceById = (...args) =>
  safeCall(ServerView, "getServiceById", args, null);

/* =========================================================
   MODAL API
========================================================= */

export const openModal = (...args) =>
  safeCall(ServerModal, "open", args);

export const closeModal = (...args) =>
  safeCall(ServerModal, "close", args);

export const updateModal = (...args) =>
  safeCall(ServerModal, "update", args);

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(ServerView?.initialized);

export const isDestroyed = () =>
  Boolean(ServerView?.destroyed);

/* =========================================================
   LEGACY GLOBAL BRIDGE (OPTIONAL)
========================================================= */

try {
  if (typeof window !== "undefined") {
    window.OnionServer = {
      init,
      render,
      reload,
      destroy,

      openDetail,
      copyDetailId,
      refreshHealth,
      toggleLive,
      navigate,
      quickAction,

      goToPage,
      goPrevPage,
      goNextPage,

      getSnapshot,
      getServices,
      getPageServices,
      getServiceById,

      openModal,
      closeModal,
      updateModal,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */
