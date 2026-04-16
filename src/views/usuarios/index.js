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
========================================================= */

import UsuariosView from "./usuarios.view.js";

export { UsuariosView };
export default UsuariosView;

/* =========================================================
   COMPAT LEGACY API
========================================================= */

export const init = (...args) =>
  UsuariosView?.init?.(...args);

export const render = (...args) =>
  UsuariosView?.render?.(...args);

export const reload = (...args) =>
  UsuariosView?.reload?.(...args);

export const destroy = (...args) =>
  UsuariosView?.destroy?.(...args);

export const reset = (...args) =>
  UsuariosView?.reset?.(...args);

export const getState = (...args) =>
  UsuariosView?.getState?.(...args);

export const getStatus = (...args) =>
  UsuariosView?.getStatus?.(...args);

export const getElement = (...args) =>
  UsuariosView?.getElement?.(...args);

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
