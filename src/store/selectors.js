/* =========================================================
   Onion SPA - Store Selectors
   Archivo: src/store/selectors.js

   Responsabilidades:
   - exponer selectores semánticos del store
   - leer estado derivado app / session / ui
   - leer colecciones de forma segura
   - devolver datos desacoplados (clone)
   - centralizar lecturas frecuentes
========================================================= */

import {
  deepClone,
} from "./helpers.js";

import {
  ensureCollectionKey,
} from "./collections.js";

/* =========================================================
   FACTORY
========================================================= */
export function createSelectors({
  AppCore,
  state,
}) {
  function cloneUser() {
    return state.session.user
      ? deepClone(
          state.session.user
        )
      : null;
  }

  function getCollection(
    key
  ) {
    ensureCollectionKey(
      state,
      key
    );

    const value =
      state.entities[key];

    if (
      Array.isArray(value)
    ) {
      return value.map(
        (item) =>
          deepClone(item)
      );
    }

    return deepClone(value);
  }

  return {
    /* =====================================
       APP
    ===================================== */
    isReady() {
      return Boolean(
        state.app.ready &&
          state.app.booted
      );
    },

    isInitialized() {
      return Boolean(
        state.app.initialized
      );
    },

    isBooting() {
      return Boolean(
        state.app.booting
      );
    },

    isLoading() {
      return Boolean(
        state.app.loading
      );
    },

    lastError() {
      return (
        deepClone(
          state.app
            .lastError
        ) || null
      );
    },

    currentRoute() {
      return (
        state.app.route ||
        "/"
      );
    },

    currentPublicPath() {
      return (
        state.app
          .publicPath ||
        "/"
      );
    },

    /* =====================================
       SESSION
    ===================================== */
    isAuthenticated() {
      return Boolean(
        state.session
          .authenticated
      );
    },

    currentUser() {
      return cloneUser();
    },

    currentRole() {
      return (
        state.session
          .role || null
      );
    },

    hasRole(
      ...roles
    ) {
      const current =
        String(
          state.session
            .role || ""
        )
          .trim()
          .toLowerCase();

      if (!current) {
        return false;
      }

      return roles
        .flat()
        .map((role) =>
          String(
            role || ""
          )
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
        .includes(
          current
        );
    },

    token() {
      return (
        state.session
          .token || null
      );
    },

    /* =====================================
       UI
    ===================================== */
    currentTheme() {
      return (
        state.ui.theme ||
        AppCore.config
          .defaultTheme ||
        "dark"
      );
    },

    currentLang() {
      return (
        state.ui.lang ||
        AppCore.config
          .defaultLang ||
        "es"
      );
    },

    isSidebarOpen() {
      return Boolean(
        state.ui
          .sidebarOpen
      );
    },

    pageTitle() {
      return (
        state.ui
          .pageTitle ||
        AppCore.config
          .appName
      );
    },

    topbarTitle() {
      return (
        state.ui
          .topbarTitle ||
        state.ui
          .pageTitle ||
        AppCore.config
          .appName
      );
    },

    /* =====================================
       ENTITIES
    ===================================== */
    collection(key) {
      return getCollection(
        key
      );
    },

    count(key) {
      ensureCollectionKey(
        state,
        key
      );

      const value =
        state.entities[key];

      if (
        Array.isArray(value)
      ) {
        return value.length;
      }

      return value
        ? 1
        : 0;
    },

    first(
      key
    ) {
      ensureCollectionKey(
        state,
        key
      );

      const value =
        state.entities[key];

      if (
        Array.isArray(value)
      ) {
        return value.length
          ? deepClone(
              value[0]
            )
          : null;
      }

      return deepClone(
        value
      );
    },

    find(
      key,
      predicate
    ) {
      ensureCollectionKey(
        state,
        key
      );

      const list =
        state.entities[key];

      if (
        !Array.isArray(
          list
        ) ||
        typeof predicate !==
          "function"
      ) {
        return null;
      }

      const item =
        list.find(
          predicate
        );

      return item
        ? deepClone(
            item
          )
        : null;
    },
  };
}
