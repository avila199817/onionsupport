/* =========================================================
   Onion SPA - Store Selectors
   Archivo: src/store/selectors.js

   Responsabilidades:
   - exponer selectores semánticos del store
   - leer estado derivado de app / session / ui
   - leer colecciones de forma segura
========================================================= */

import { deepClone } from "./helpers.js";
import { ensureCollectionKey } from "./collections.js";

export function createSelectors({ AppCore, state }) {
  return {
    isReady() {
      return Boolean(state.app.ready && state.app.booted);
    },

    isAuthenticated() {
      return Boolean(state.session.authenticated);
    },

    currentUser() {
      return state.session.user ? deepClone(state.session.user) : null;
    },

    currentRole() {
      return state.session.role || null;
    },

    currentRoute() {
      return state.app.route || "/";
    },

    currentPublicPath() {
      return state.app.publicPath || "/";
    },

    currentTheme() {
      return state.ui.theme || AppCore.config.defaultTheme || "dark";
    },

    currentLang() {
      return state.ui.lang || AppCore.config.defaultLang || "es";
    },

    collection(key) {
      ensureCollectionKey(state, key);
      const value = state.entities[key];
      return Array.isArray(value) ? [...value] : deepClone(value);
    },

    count(key) {
      ensureCollectionKey(state, key);
      const value = state.entities[key];
      return Array.isArray(value) ? value.length : value ? 1 : 0;
    },
  };
}
