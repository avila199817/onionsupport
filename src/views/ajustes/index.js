/* =========================================================
   Onion Support - Ajustes compatibility route
   Archivo: /src/views/ajustes/index.js

   COMPATIBILIDAD · CUENTA ES LA AUTORIDAD SELF-SERVICE

   /ajustes se conserva como URL privada legacy, pero no mantiene una
   segunda implementación de perfil/preferencias. La vista canónica es
   Cuenta y respeta exclusivamente las capacidades self reales del backend.
========================================================= */

import CuentaView, {
  CuentaView as CanonicalCuentaView,
  CuentaIndex,
  View,
  view,
  component,
  page,
  mount,
  init,
  bootstrap,
  render,
  destroy,
  unmount,
  cleanup,
  dispose,
  refresh,
  reload,
  getItem,
  getCuenta,
  getSessions,
  getSnapshot,
  getDebugSnapshot,
} from "../cuenta/index.js";

export const AJUSTES_INDEX_VERSION =
  "ajustes.compat.v1.cuenta-authority";

export const AJUSTES_VIEW_VERSION = AJUSTES_INDEX_VERSION;

export const AjustesView = CanonicalCuentaView;
export const AjustesIndex = CuentaIndex;
export const AjustesPage = CanonicalCuentaView;

export {
  View,
  view,
  component,
  page,
  mount,
  init,
  bootstrap,
  render,
  destroy,
  unmount,
  cleanup,
  dispose,
  refresh,
  reload,
  getItem,
  getCuenta,
  getSessions,
  getSnapshot,
  getDebugSnapshot,
};

export default CuentaView;
