/* =========================================================
   Onion Support - Home Index
   Archivo: /src/views/home/index.js

   Responsabilidad:
   - Entry público de Home para el Router.
   - Exponer HomeView desde homeView.js.
   - No validar rutas.
   - No resolver slug.
   - No leer Auth.
   - No leer Router.
   - No tocar AppCore.
   - No tocar DOM.
   - No crear globals.
   - No duplicar lifecycle.
   - No duplicar lógica visual.
   - No bloquear render si Router ya resolvió Home.
   - Home visible /@{user.slug} lo resuelve Router.
   - Home interna / la resuelve routes/router.
========================================================= */

import {
  HomeView,
  HOME_VIEW_VERSION,
} from "./homeView.js";

export const HOME_INDEX_VERSION = "home.index.v5";

/* =========================================================
   EXPORTS
========================================================= */

export { HOME_VIEW_VERSION };
export { HomeView };

export const HomeIndex = HomeView;

export default HomeView;
