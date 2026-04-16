/* =========================================================
   Onion SPA - Usuarios View
   Archivo: src/views/usuarios/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   Responsabilidades:
   - punto de entrada único de la vista Usuarios
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y usuarios.view.js
   - init / render / reload / destroy seguros
   - evitar duplicidad de lógica en index.js
   - mantener superficie pública estable
   - blindar acceso a métodos opcionales del módulo view
========================================================= */

import UsuariosView from "./usuarios.view.js";

/* =========================================================
   INTERNAL
========================================================= */

function safeCall(
  methodName = "",
  args = []
) {
  const method =
    UsuariosView?.[methodName];

  if (
    typeof method !== "function"
  ) {
    return null;
  }

  return method(...args);
}

/* =========================================================
   PRIMARY EXPORT
========================================================= */

export { UsuariosView };
export default UsuariosView;

/* =========================================================
   COMPAT LEGACY API
========================================================= */

export const init = (...args) =>
  safeCall("init", args);

export const render = (...args) =>
  safeCall("render", args);

export const reload = (...args) =>
  safeCall("reload", args);

export const destroy = (...args) =>
  safeCall("destroy", args);

export const reset = (...args) =>
  safeCall("reset", args);

export const getState = (...args) =>
  safeCall("getState", args);

export const getStatus = (...args) =>
  safeCall("getStatus", args);

export const getElement = (...args) =>
  safeCall("getElement", args);

/* =========================================================
   NAMED EXPORTS DE APOYO
========================================================= */

export {
  init as usuariosInit,
  render as usuariosRender,
  reload as usuariosReload,
  destroy as usuariosDestroy,
  reset as usuariosReset,
  getState as getUsuariosViewState,
  getStatus as getUsuariosViewStatus,
  getElement as getUsuariosViewElement,
};
