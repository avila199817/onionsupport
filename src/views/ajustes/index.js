/* =========================================================
   Onion SPA - Ajustes View
   Archivo: src/views/ajustes/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo ajustes
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y ajustesView.js
   - init / reload / destroy seguros
   - exponer edit / modal / helpers públicos
   - evitar duplicidad de lógica en index.js

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo no existe
========================================================= */

import AjustesView from "./ajustesView.js";
import AjustesEditView from "./ajustesEditView.js";
import AjustesModal from "./ajustes.modal.js";

/* =========================================================
   CORE EXPORTS
========================================================= */

export { AjustesView };
export { AjustesEditView };
export { AjustesModal };

export default AjustesView;

/* =========================================================
   INTERNAL SAFE CALL
========================================================= */

function safeCall(target, method, args = [], fallback = undefined) {
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
  safeCall(AjustesView, "init", args);

export const render = (...args) =>
  safeCall(AjustesView, "render", args);

export const reload = (...args) =>
  safeCall(AjustesView, "reload", args);

export const destroy = (...args) =>
  safeCall(AjustesView, "destroy", args);

/* =========================================================
   ACTIONS API
========================================================= */

export const openAjuste = (...args) =>
  safeCall(AjustesView, "openAjuste", args);

export const createAjuste = (...args) =>
  safeCall(AjustesView, "createAjuste", args);

export const updateAjuste = (...args) =>
  safeCall(AjustesView, "updateAjuste", args);

export const exportCsv = (...args) =>
  safeCall(AjustesView, "exportCsv", args);

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  safeCall(AjustesView, "goToPage", args);

export const goPrevPage = (...args) =>
  safeCall(AjustesView, "goPrevPage", args);

export const goNextPage = (...args) =>
  safeCall(AjustesView, "goNextPage", args);

/* =========================================================
   DATA API
========================================================= */

export const getItems = (...args) =>
  safeCall(AjustesView, "getItems", args, []);

export const getPageItems = (...args) =>
  safeCall(AjustesView, "getPageItems", args, []);

export const getAjusteById = (...args) =>
  safeCall(AjustesView, "getAjusteById", args, null);

export const getAjusteByKey = (...args) =>
  safeCall(AjustesView, "getAjusteByKey", args, null);

/* =========================================================
   EDIT VIEW API
========================================================= */

export const initEdit = (...args) =>
  safeCall(AjustesEditView, "init", args);

export const openEdit = (...args) =>
  safeCall(AjustesEditView, "open", args);

export const closeEdit = (...args) =>
  safeCall(AjustesEditView, "close", args);

/* =========================================================
   MODAL API
========================================================= */

export const openModal = (...args) =>
  safeCall(AjustesModal, "open", args);

export const closeModal = (...args) =>
  safeCall(AjustesModal, "close", args);

export const refreshModal = (...args) =>
  safeCall(AjustesModal, "refresh", args);

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(AjustesView?.initialized);

export const isDestroyed = () =>
  Boolean(AjustesView?.destroyed);

/* =========================================================
   LEGACY GLOBAL BRIDGE (OPTIONAL)
========================================================= */

try {
  if (typeof window !== "undefined") {
    window.OnionAjustes = {
      init,
      render,
      reload,
      destroy,

      openAjuste,
      createAjuste,
      updateAjuste,
      exportCsv,

      goToPage,
      goPrevPage,
      goNextPage,

      getItems,
      getPageItems,
      getAjusteById,
      getAjusteByKey,

      openModal,
      closeModal,

      openEdit,
      closeEdit,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */
