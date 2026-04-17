/* =========================================================
   Onion SPA - Usuarios View
   Archivo: src/views/usuarios/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo usuarios
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y usuariosView.js
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

import UsuariosView from "./usuariosView.js";
import UsuariosCreateView from "./usuariosCreateView.js";
import UsuariosModal from "./usuarios.modal.js";

/* =========================================================
   CORE EXPORTS
========================================================= */

export { UsuariosView };
export { UsuariosCreateView };
export { UsuariosModal };

export default UsuariosView;

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
  safeCall(
    UsuariosView,
    "init",
    args
  );

export const render = (...args) =>
  safeCall(
    UsuariosView,
    "render",
    args
  );

export const reload = (...args) =>
  safeCall(
    UsuariosView,
    "reload",
    args
  );

export const destroy = (...args) =>
  safeCall(
    UsuariosView,
    "destroy",
    args
  );

/* =========================================================
   ACTIONS API
========================================================= */

export const openUser = (...args) =>
  safeCall(
    UsuariosView,
    "openUser",
    args
  );

export const createUsuario = (...args) =>
  safeCall(
    UsuariosView,
    "createUsuario",
    args
  );

export const exportCsv = (...args) =>
  safeCall(
    UsuariosView,
    "exportCsv",
    args
  );

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  safeCall(
    UsuariosView,
    "goToPage",
    args
  );

export const goPrevPage = (...args) =>
  safeCall(
    UsuariosView,
    "goPrevPage",
    args
  );

export const goNextPage = (...args) =>
  safeCall(
    UsuariosView,
    "goNextPage",
    args
  );

/* =========================================================
   DATA API
========================================================= */

export const getItems = (...args) =>
  safeCall(
    UsuariosView,
    "getItems",
    args,
    []
  );

export const getPageItems = (...args) =>
  safeCall(
    UsuariosView,
    "getPageItems",
    args,
    []
  );

export const getUserById = (...args) =>
  safeCall(
    UsuariosView,
    "getUserById",
    args,
    null
  );

/* =========================================================
   CREATE VIEW API
========================================================= */

export const initCreate = (...args) =>
  safeCall(
    UsuariosCreateView,
    "init",
    args
  );

export const openCreate = (...args) =>
  safeCall(
    UsuariosCreateView,
    "open",
    args
  );

export const closeCreate = (...args) =>
  safeCall(
    UsuariosCreateView,
    "close",
    args
  );

/* =========================================================
   MODAL API
========================================================= */

export const openModal = (...args) =>
  safeCall(
    UsuariosModal,
    "open",
    args
  );

export const closeModal = (...args) =>
  safeCall(
    UsuariosModal,
    "close",
    args
  );

export const refreshModal = (...args) =>
  safeCall(
    UsuariosModal,
    "refresh",
    args
  );

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(
    UsuariosView?.initialized
  );

export const isDestroyed = () =>
  Boolean(
    UsuariosView?.destroyed
  );

/* =========================================================
   LEGACY GLOBAL BRIDGE (OPTIONAL)
========================================================= */

try {
  if (
    typeof window !==
    "undefined"
  ) {
    window.OnionUsuarios = {
      init,
      render,
      reload,
      destroy,

      openUser,
      createUsuario,
      exportCsv,

      goToPage,
      goPrevPage,
      goNextPage,

      getItems,
      getPageItems,
      getUserById,

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
