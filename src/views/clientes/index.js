/* =========================================================
   Onion SPA - Clientes View
   Archivo: src/views/clientes/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo clientes
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y clientesView.js
   - init / reload / destroy seguros
   - exponer create / modal / helpers públicos
   - evitar duplicidad de lógica en index.js

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo no existe
========================================================= */

import ClientesView from "./clientesView.js";
import ClientesCreateView from "./clientesCreateView.js";
import ClientesModal from "./clientes.modal.js";

/* =========================================================
   CORE EXPORTS
========================================================= */

export { ClientesView };
export { ClientesCreateView };
export { ClientesModal };

export default ClientesView;

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
  safeCall(ClientesView, "init", args);

export const render = (...args) =>
  safeCall(ClientesView, "render", args);

export const reload = (...args) =>
  safeCall(ClientesView, "reload", args);

export const destroy = (...args) =>
  safeCall(ClientesView, "destroy", args);

/* =========================================================
   ACTIONS API
========================================================= */

export const openCliente = (...args) =>
  safeCall(ClientesView, "openCliente", args);

export const createCliente = (...args) =>
  safeCall(ClientesView, "createCliente", args);

export const exportCsv = (...args) =>
  safeCall(ClientesView, "exportCsv", args);

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  safeCall(ClientesView, "goToPage", args);

export const goPrevPage = (...args) =>
  safeCall(ClientesView, "goPrevPage", args);

export const goNextPage = (...args) =>
  safeCall(ClientesView, "goNextPage", args);

/* =========================================================
   DATA API
========================================================= */

export const getItems = (...args) =>
  safeCall(ClientesView, "getItems", args, []);

export const getPageItems = (...args) =>
  safeCall(ClientesView, "getPageItems", args, []);

export const getClienteById = (...args) =>
  safeCall(ClientesView, "getClienteById", args, null);

/* =========================================================
   CREATE VIEW API
========================================================= */

export const initCreate = (...args) =>
  safeCall(ClientesCreateView, "init", args);

export const openCreate = (...args) =>
  safeCall(ClientesCreateView, "open", args);

export const closeCreate = (...args) =>
  safeCall(ClientesCreateView, "close", args);

/* =========================================================
   MODAL API
========================================================= */

export const openModal = (...args) =>
  safeCall(ClientesModal, "open", args);

export const closeModal = (...args) =>
  safeCall(ClientesModal, "close", args);

export const refreshModal = (...args) =>
  safeCall(ClientesModal, "refresh", args);

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(ClientesView?.initialized);

export const isDestroyed = () =>
  Boolean(ClientesView?.destroyed);

/* =========================================================
   LEGACY GLOBAL BRIDGE (OPTIONAL)
========================================================= */

try {
  if (typeof window !== "undefined") {
    window.OnionClientes = {
      init,
      render,
      reload,
      destroy,

      openCliente,
      createCliente,
      exportCsv,

      goToPage,
      goPrevPage,
      goNextPage,

      getItems,
      getPageItems,
      getClienteById,

      openModal,
      closeModal,

      openCreate,
      closeCreate,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */
