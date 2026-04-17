/* =========================================================
   Onion SPA - Cuenta
   Archivo: src/views/cuenta/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo cuenta
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y cuentaView.js
   - init / reload / destroy seguros
   - exponer modal / helpers públicos
   - evitar duplicidad de lógica en index.js

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo no existe
========================================================= */

import CuentaView from "./cuentaView.js";
import CuentaModal from "./cuenta.modal.js";

/* =========================================================
   CORE EXPORTS
========================================================= */

export { CuentaView };
export { CuentaModal };

export default CuentaView;

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
  safeCall(CuentaView, "init", args);

export const render = (...args) =>
  safeCall(CuentaView, "render", args);

export const reload = (...args) =>
  safeCall(CuentaView, "reload", args);

export const destroy = (...args) =>
  safeCall(CuentaView, "destroy", args);

/* =========================================================
   ACTIONS API
========================================================= */

export const saveCuenta = (...args) =>
  safeCall(CuentaView, "saveCuenta", args);

export const updateTheme = (...args) =>
  safeCall(CuentaView, "updateTheme", args);

export const refreshCuenta = (...args) =>
  safeCall(CuentaView, "refreshCuenta", args);

export const openModalFromView = (...args) =>
  safeCall(CuentaView, "openModal", args);

/* =========================================================
   DATA API
========================================================= */

export const getItem = (...args) =>
  safeCall(CuentaView, "getItem", args, null);

export const getSnapshot = (...args) =>
  safeCall(CuentaView, "getSnapshot", args, null);

/* =========================================================
   MODAL API
========================================================= */

export const openModal = (...args) =>
  safeCall(CuentaModal, "open", args);

export const closeModal = (...args) =>
  safeCall(CuentaModal, "close", args);

export const updateModal = (...args) =>
  safeCall(CuentaModal, "update", args);

export const getModalState = (...args) =>
  safeCall(CuentaModal, "getState", args, null);

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(CuentaView?.initialized);

export const isDestroyed = () =>
  Boolean(CuentaView?.destroyed);

/* =========================================================
   LEGACY GLOBAL BRIDGE (OPTIONAL)
========================================================= */

try {
  if (typeof window !== "undefined") {
    window.OnionCuenta = {
      init,
      render,
      reload,
      destroy,

      saveCuenta,
      updateTheme,
      refreshCuenta,

      getItem,
      getSnapshot,

      openModalFromView,
      openModal,
      closeModal,
      updateModal,
      getModalState,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */
