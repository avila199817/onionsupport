/* =========================================================
   Onion Support - Home Index
   Archivo: /src/views/home/index.js

   Responsabilidad:
   - Entry público de Home para el Router.
   - Reexportar HomeView sin añadir lógica.
   - Sin Auth, Router, AppCore, DOM, slug, rutas ni lifecycle propio.
========================================================= */

import {
  HomeView,
  HOME_VIEW_VERSION,
} from "./homeView.js";

export const HOME_INDEX_VERSION = "home.index.v7";

export {
  HomeView,
  HOME_VIEW_VERSION,
};

export const HomeIndex = HomeView;

export default HomeView;
