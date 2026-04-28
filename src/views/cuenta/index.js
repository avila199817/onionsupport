/* =========================================================
   Onion SPA - Cuenta View
   Archivo: src/views/cuenta/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo cuenta
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y cuentaView.js
   - init / reload / destroy seguros
   - exponer save / theme / language / password / modal / helpers públicos
   - evitar duplicidad de lógica en index.js

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo no existe
   - bridge global opcional window.OnionCuenta
========================================================= */

import CuentaView from "./cuentaView.js";

/* =========================================================
   CORE EXPORTS
========================================================= */

export { CuentaView };

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

export const updateLanguage = (...args) =>
  safeCall(CuentaView, "updateLanguage", args);

export const refreshCuenta = (...args) =>
  safeCall(CuentaView, "refreshCuenta", args);

export const changePassword = (...args) =>
  safeCall(CuentaView, "changePassword", args);

export const openModal = (...args) =>
  safeCall(CuentaView, "openModal", args, false);

/* =========================================================
   DATA API
========================================================= */

export const getItem = (...args) =>
  safeCall(CuentaView, "getItem", args, null);

export const getSnapshot = (...args) =>
  safeCall(CuentaView, "getSnapshot", args, null);

export const getState = (...args) =>
  safeCall(CuentaView, "getState", args, null);

/* =========================================================
   ALIASES API
   Compatibilidad semántica con otros módulos / router legacy
========================================================= */

export const save = (...args) =>
  saveCuenta(...args);

export const refresh = (...args) =>
  refreshCuenta(...args);

export const updateCuentaTheme = (...args) =>
  updateTheme(...args);

export const updateCuentaLanguage = (...args) =>
  updateLanguage(...args);

export const openCuentaModal = (...args) =>
  openModal(...args);

export const getCuenta = (...args) =>
  getItem(...args);

export const getCuentaSnapshot = (...args) =>
  getSnapshot(...args);

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(CuentaView?.initialized);

export const isDestroyed = () =>
  Boolean(CuentaView?.destroyed);

/* =========================================================
   LEGACY GLOBAL BRIDGE OPTIONAL
========================================================= */

try {
  if (typeof window !== "undefined") {
    window.OnionCuenta = {
      init,
      render,
      reload,
      destroy,

      saveCuenta,
      save,

      updateTheme,
      updateCuentaTheme,

      updateLanguage,
      updateCuentaLanguage,

      refreshCuenta,
      refresh,

      changePassword,

      openModal,
      openCuentaModal,

      getItem,
      getCuenta,

      getSnapshot,
      getCuentaSnapshot,

      getState,

      isInitialized,
      isDestroyed,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */
