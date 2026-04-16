/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10

   Responsabilidades:
   - punto de entrada único de la vista Home
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y home.view.js
   - init / render / reload / destroy seguros
   - evitar duplicidad de lógica en index.js
   - mantener superficie pública estable
========================================================= */

import HomeView from "./home.view.js";

export { HomeView };
export default HomeView;

/* =========================================================
   COMPAT LEGACY API
========================================================= */

export const init = (...args) =>
  HomeView?.init?.(...args);

export const render = (...args) =>
  HomeView?.render?.(...args);

export const reload = (...args) =>
  HomeView?.reload?.(...args);

export const destroy = (...args) =>
  HomeView?.destroy?.(...args);

export const reset = (...args) =>
  HomeView?.reset?.(...args);

export const getState = (...args) =>
  HomeView?.getState?.(...args);

export const getStatus = (...args) =>
  HomeView?.getStatus?.(...args);

export const getElement = (...args) =>
  HomeView?.getElement?.(...args);

/* =========================================================
   NAMED EXPORTS DE APOYO
========================================================= */

export {
  init as homeInit,
  render as homeRender,
  reload as homeReload,
  destroy as homeDestroy,
  reset as homeReset,
  getState as getHomeViewState,
  getStatus as getHomeViewStatus,
  getElement as getHomeViewElement,
};
