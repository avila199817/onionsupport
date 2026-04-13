/* =========================================================
   Onion SPA - Store Actions
   Archivo: src/store/actions.js

   Responsabilidades:
   - exponer acciones semánticas del store
   - agrupar mutaciones de app / session / ui / flags
   - centralizar operaciones sobre colecciones
   - hidratar slices desde AppCore
   - validaciones defensivas
========================================================= */

import {
  deepClone,
  isFunction,
  normalizeCollection,
} from "./helpers.js";

import {
  ensureCollectionKey,
  normalizeMatcher,
} from "./collections.js";

import {
  safeTitle,
  safeTopbarTitle,
} from "./state.js";

export function createActions({
  AppCore,
  state,
  set,
  patch,
  update,
}) {
  function cloneIfAny(
    value
  ) {
    return value
      ? deepClone(value)
      : null;
  }

  return {
    /* =========================================================
       APP
    ========================================================= */
    markReady(
      value = true
    ) {
      set(
        "app.ready",
        Boolean(value)
      );
    },

    markBooted(
      value = true
    ) {
      set(
        "app.booted",
        Boolean(value)
      );
    },

    setInitialized(
      value = true
    ) {
      set(
        "app.initialized",
        Boolean(value)
      );
    },

    setBooting(
      value = false
    ) {
      set(
        "app.booting",
        Boolean(value)
      );
    },

    setRoute(
      route = "/"
    ) {
      set(
        "app.route",
        route || "/"
      );
    },

    setPublicPath(
      publicPath = "/"
    ) {
      set(
        "app.publicPath",
        publicPath || "/"
      );
    },

    setLoading(
      value
    ) {
      set(
        "app.loading",
        Boolean(value)
      );
    },

    setError(
      error = null
    ) {
      set(
        "app.lastError",
        error || null
      );
    },

    clearError() {
      set(
        "app.lastError",
        null
      );
    },

    /* =========================================================
       SESSION
    ========================================================= */
    setSession({
      authenticated,
      token,
      user,
      role,
    } = {}) {
      patch({
        session: {
          authenticated:
            Boolean(
              authenticated
            ),
          token:
            token ?? null,
          user:
            cloneIfAny(
              user
            ),
          role:
            role ??
            user?.role ??
            null,
        },
      });
    },

    clearSession() {
      patch({
        session: {
          authenticated:
            false,
          token: null,
          user: null,
          role: null,
        },
      });
    },

    setAuthenticated(
      value = false
    ) {
      set(
        "session.authenticated",
        Boolean(value)
      );
    },

    setToken(
      token = null
    ) {
      set(
        "session.token",
        token ?? null
      );
    },

    setUser(
      user = null
    ) {
      patch({
        session: {
          user:
            cloneIfAny(
              user
            ),
          role:
            user?.role ??
            state.session
              ?.role ??
            null,
        },
      });
    },

    setRole(
      role = null
    ) {
      set(
        "session.role",
        role ?? null
      );
    },

    /* =========================================================
       UI
    ========================================================= */
    setTheme(
      theme = "dark"
    ) {
      set(
        "ui.theme",
        theme
      );
    },

    setLang(
      lang = "es"
    ) {
      set(
        "ui.lang",
        lang
      );
    },

    setSidebarOpen(
      value
    ) {
      set(
        "ui.sidebarOpen",
        Boolean(value)
      );
    },

    setPageTitle(
      title =
        AppCore.config
          .appName
    ) {
      const finalTitle =
        title ||
        AppCore.config
          .appName;

      patch({
        ui: {
          pageTitle:
            finalTitle,
          topbarTitle:
            finalTitle,
        },
      });
    },

    setTopbarTitle(
      title =
        AppCore.config
          .appName
    ) {
      set(
        "ui.topbarTitle",
        title ||
          AppCore.config
            .appName
      );
    },

    /* =========================================================
       FLAGS
    ========================================================= */
    setFlag(
      flag,
      value
    ) {
      if (!flag) {
        throw new Error(
          "actions.setFlag(flag, value) requiere flag"
        );
      }

      set(
        `flags.${flag}`,
        Boolean(value)
      );
    },

    /* =========================================================
       COLLECTIONS
    ========================================================= */
    setCollection(
      key,
      items = []
    ) {
      ensureCollectionKey(
        state,
        key
      );

      set(
        `entities.${key}`,
        normalizeCollection(
          items
        )
      );
    },

    appendToCollection(
      key,
      item
    ) {
      ensureCollectionKey(
        state,
        key
      );

      update(
        `entities.${key}`,
        (list = []) => {
          const next =
            Array.isArray(
              list
            )
              ? [...list]
              : [];

          next.push(item);

          return next;
        }
      );
    },

    prependToCollection(
      key,
      item
    ) {
      ensureCollectionKey(
        state,
        key
      );

      update(
        `entities.${key}`,
        (list = []) => {
          const next =
            Array.isArray(
              list
            )
              ? [...list]
              : [];

          next.unshift(
            item
          );

          return next;
        }
      );
    },

    replaceCollectionItem(
      key,
      matcher,
      nextItem
    ) {
      ensureCollectionKey(
        state,
        key
      );

      const match =
        normalizeMatcher(
          matcher
        );

      update(
        `entities.${key}`,
        (list = []) => {
          if (
            !Array.isArray(
              list
            )
          ) {
            return [];
          }

          return list.map(
            (item) =>
              match(item)
                ? nextItem
                : item
          );
        }
      );
    },

    updateCollectionItem(
      key,
      matcher,
      updater
    ) {
      ensureCollectionKey(
        state,
        key
      );

      if (
        !isFunction(
          updater
        )
      ) {
        throw new Error(
          "updateCollectionItem requiere updater function"
        );
      }

      const match =
        normalizeMatcher(
          matcher
        );

      update(
        `entities.${key}`,
        (list = []) => {
          if (
            !Array.isArray(
              list
            )
          ) {
            return [];
          }

          return list.map(
            (item) => {
              if (
                !match(item)
              ) {
                return item;
              }

              return updater(
                deepClone(
                  item
                )
              );
            }
          );
        }
      );
    },

    upsertCollectionItem(
      key,
      item,
      matcher = null
    ) {
      ensureCollectionKey(
        state,
        key
      );

      update(
        `entities.${key}`,
        (list = []) => {
          const next =
            Array.isArray(
              list
            )
              ? [...list]
              : [];

          const match =
            matcher
              ? normalizeMatcher(
                  matcher
                )
              : (
                  current
                ) =>
                  current?.id ===
                  item?.id;

          const index =
            next.findIndex(
              (current) =>
                match(
                  current
                )
            );

          if (
            index >= 0
          ) {
            next[index] =
              item;
          } else {
            next.push(
              item
            );
          }

          return next;
        }
      );
    },

    removeCollectionItem(
      key,
      matcher
    ) {
      ensureCollectionKey(
        state,
        key
      );

      const match =
        normalizeMatcher(
          matcher
        );

      update(
        `entities.${key}`,
        (list = []) => {
          if (
            !Array.isArray(
              list
            )
          ) {
            return [];
          }

          return list.filter(
            (item) =>
              !match(
                item
              )
          );
        }
      );
    },

    clearCollection(
      key
    ) {
      ensureCollectionKey(
        state,
        key
      );

      set(
        `entities.${key}`,
        []
      );
    },

    /* =========================================================
       HYDRATE
    ========================================================= */
    hydrateFromCore() {
      patch({
        app: {
          ready:
            state.app
              .ready,
          booted:
            state.app
              .booted,
          route:
            AppCore.state
              .route,
          publicPath:
            AppCore.state
              .publicPath,
          loading:
            AppCore.state
              .loading,
          initialized:
            AppCore.state
              .initialized,
          booting:
            AppCore.state
              .booting,
          lastError:
            AppCore.state
              .lastError,
        },

        session: {
          authenticated:
            AppCore.state
              .authenticated,
          token:
            AppCore.state
              .token,
          user:
            cloneIfAny(
              AppCore.state
                .user
            ),
          role:
            AppCore.state
              .role,
        },

        ui: {
          theme:
            AppCore.state
              .theme,
          lang:
            AppCore.state
              .lang,
          sidebarOpen:
            AppCore.state
              .sidebarOpen,
          pageTitle:
            safeTitle(
              AppCore
            ),
          topbarTitle:
            safeTopbarTitle(
              AppCore
            ),
        },

        meta: {
          hydrated: true,
          updatedAt:
            Date.now(),
        },
      });
    },
  };
}
