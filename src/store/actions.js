/* =========================================================
   Onion SPA - Store Actions
   Archivo: src/store/actions.js

   Responsabilidades:
   - exponer acciones semánticas del store
   - agrupar mutaciones de app / session / ui / flags
   - centralizar operaciones sobre colecciones
   - hidratar slices desde AppCore
   - validaciones defensivas
   - evitar estados session fantasma
   - normalizar theme/lang/route antes de guardar
   - mantener Store sincronizable con AppCore sin romper si AppCore es parcial

   HARDENING EXTREMO:
   - authenticated sólo true con token + user usable
   - token/accessToken coherentes
   - role/roles normalizados
   - hydrateFromCore tolerante a AppCore parcial
   - acciones devuelven resultado estable
   - colecciones siempre normalizadas
   - flags saneados
   - cero throws accidentales salvo uso incorrecto real
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

/* =========================================================
   BASICS
========================================================= */

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeObject(
  value
) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeArray(
  value
) {
  return Array.isArray(value)
    ? value
    : [];
}

function cloneIfAny(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return deepClone(value);
}

function first(
  ...values
) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function toArray(
  value
) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value];
}

/* =========================================================
   APPCORE SAFE
========================================================= */

function getCoreState(
  AppCore
) {
  return safeObject(
    AppCore?.state
  );
}

function getConfig(
  AppCore
) {
  return safeObject(
    AppCore?.config
  );
}

function getAppName(
  AppCore
) {
  return safeText(
    getConfig(AppCore).appName,
    "Onion Support"
  );
}

function getDefaultTheme(
  AppCore
) {
  return normalizeTheme(
    first(
      getConfig(AppCore).defaultTheme,
      getCoreState(AppCore).theme,
      "system"
    )
  );
}

function getDefaultLang(
  AppCore
) {
  return normalizeLang(
    first(
      getConfig(AppCore).defaultLang,
      getCoreState(AppCore).lang,
      "es"
    )
  );
}

function safeResolveTitle(
  AppCore
) {
  try {
    return safeText(
      safeTitle(AppCore),
      getAppName(AppCore)
    );
  } catch {
    return getAppName(AppCore);
  }
}

function safeResolveTopbarTitle(
  AppCore
) {
  try {
    return safeText(
      safeTopbarTitle(AppCore),
      safeResolveTitle(AppCore)
    );
  } catch {
    return safeResolveTitle(AppCore);
  }
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizePathValue(
  value = "/"
) {
  let path =
    safeText(value, "/");

  path = path
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  return path || "/";
}

function normalizeTheme(
  theme = "system"
) {
  const value =
    safeText(theme, "system")
      .toLowerCase();

  if (value === "dark") {
    return "dark";
  }

  if (value === "light") {
    return "light";
  }

  if (
    value === "system" ||
    value === "auto" ||
    value === "browser" ||
    value === "os"
  ) {
    return "system";
  }

  return "system";
}

function normalizeLang(
  lang = "es"
) {
  const value =
    safeText(lang, "es")
      .toLowerCase()
      .replace("_", "-");

  if (!value) {
    return "es";
  }

  return value.split("-")[0] || "es";
}

function normalizeRole(
  value = ""
) {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoles(
  value
) {
  return toArray(value)
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);
}

function resolveRoleFromUser(
  user = null,
  explicitRole = null
) {
  const cleanUser =
    safeObject(user);

  const roles =
    normalizeRoles(
      first(
        explicitRole,
        cleanUser.role,
        cleanUser.rol,
        cleanUser.userRole,
        cleanUser.roles,
        cleanUser.permissions,
        cleanUser.scopes
      )
    );

  return (
    normalizeRole(
      first(
        explicitRole,
        cleanUser.role,
        cleanUser.rol,
        roles[0],
        ""
      )
    ) || null
  );
}

function hasUsableToken(
  token = ""
) {
  return Boolean(
    safeText(token, "")
  );
}

function hasUsableUser(
  user = null
) {
  const value =
    safeObject(user);

  return Boolean(
    safeText(value.id, "") ||
    safeText(value.userId, "") ||
    safeText(value.user_id, "") ||
    safeText(value._id, "") ||
    safeText(value.uid, "") ||
    safeText(value.username, "") ||
    safeText(value.userName, "") ||
    safeText(value.email, "") ||
    safeText(value.phone, "") ||
    safeText(value.telefono, "")
  );
}

function normalizeSessionPatch({
  state,
  authenticated = undefined,
  token = undefined,
  accessToken = undefined,
  user = undefined,
  role = undefined,
  roles = undefined,
  refreshToken = undefined,
  sessionId = undefined,
  sessionUserId = undefined,
} = {}) {
  const currentSession =
    safeObject(state?.session);

  const incomingToken =
    token !== undefined
      ? token
      : accessToken !== undefined
        ? accessToken
        : first(
            currentSession.token,
            currentSession.accessToken,
            null
          );

  const finalToken =
    safeText(incomingToken, "") || null;

  const finalUser =
    user !== undefined
      ? cloneIfAny(user)
      : cloneIfAny(currentSession.user);

  const usableToken =
    hasUsableToken(finalToken);

  const usableUser =
    hasUsableUser(finalUser);

  const finalAuthenticated =
    authenticated === false
      ? false
      : usableToken && usableUser;

  const finalRole =
    finalAuthenticated
      ? resolveRoleFromUser(
          finalUser,
          first(
            role,
            currentSession.role,
            null
          )
        )
      : null;

  const finalRoles =
    finalAuthenticated
      ? normalizeRoles(
          first(
            roles,
            finalUser?.roles,
            finalUser?.permissions,
            finalRole
          )
        )
      : [];

  return {
    authenticated:
      finalAuthenticated,

    token:
      usableToken ? finalToken : null,

    accessToken:
      usableToken ? finalToken : null,

    refreshToken:
      refreshToken !== undefined
        ? safeText(refreshToken, "") || null
        : currentSession.refreshToken || null,

    user:
      usableUser ? finalUser : null,

    role:
      finalRole,

    roles:
      finalRoles,

    sessionId:
      sessionId !== undefined
        ? safeText(sessionId, "") || null
        : currentSession.sessionId || null,

    sessionUserId:
      sessionUserId !== undefined
        ? safeText(sessionUserId, "") || null
        : currentSession.sessionUserId || null,
  };
}

function normalizeFlagKey(
  flag = ""
) {
  const value =
    safeText(flag, "");

  if (!value) {
    return "";
  }

  return value
    .replace(/^\.+|\.+$/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.:-]/g, "");
}

/* =========================================================
   FACTORY
========================================================= */

export function createActions({
  AppCore,
  state,
  set,
  patch,
  update,
}) {
  /* =========================================================
     APP HELPERS
  ========================================================= */

  function setAppPatch(
    value = {}
  ) {
    return patch({
      app: {
        ...value,
      },
    });
  }

  function setSessionPatch(
    value = {}
  ) {
    const sessionPatch =
      normalizeSessionPatch({
        state,
        ...value,
      });

    return patch({
      session: sessionPatch,
    });
  }

  function getCurrentToken() {
    return first(
      state?.session?.token,
      state?.session?.accessToken,
      null
    );
  }

  function getCurrentUser() {
    return first(
      state?.session?.user,
      null
    );
  }

  return {
    /* =========================================================
       APP
    ========================================================= */

    markReady(
      value = true
    ) {
      const ready =
        Boolean(value);

      return setAppPatch({
        ready,
        loading:
          ready ? false : state.app?.loading,
        booting:
          ready ? false : state.app?.booting,
      });
    },

    markBooted(
      value = true
    ) {
      const booted =
        Boolean(value);

      return setAppPatch({
        booted,
        booting:
          booted ? false : state.app?.booting,
      });
    },

    setInitialized(
      value = true
    ) {
      return set(
        "app.initialized",
        Boolean(value)
      );
    },

    setBooting(
      value = false
    ) {
      const booting =
        Boolean(value);

      return setAppPatch({
        booting,
        loading:
          booting ? true : state.app?.loading,
      });
    },

    setRoute(
      route = "/"
    ) {
      return set(
        "app.route",
        normalizePathValue(route)
      );
    },

    setPublicPath(
      publicPath = "/"
    ) {
      return set(
        "app.publicPath",
        normalizePathValue(publicPath)
      );
    },

    setLoading(
      value = false
    ) {
      return set(
        "app.loading",
        Boolean(value)
      );
    },

    setError(
      error = null
    ) {
      return set(
        "app.lastError",
        error || null
      );
    },

    clearError() {
      return set(
        "app.lastError",
        null
      );
    },

    /* =========================================================
       SESSION
    ========================================================= */

    setSession({
      authenticated = undefined,
      token = undefined,
      accessToken = undefined,
      refreshToken = undefined,
      user = undefined,
      role = undefined,
      roles = undefined,
      sessionId = undefined,
      sessionUserId = undefined,
    } = {}) {
      return setSessionPatch({
        authenticated,
        token,
        accessToken,
        refreshToken,
        user,
        role,
        roles,
        sessionId,
        sessionUserId,
      });
    },

    clearSession() {
      return patch({
        session: {
          authenticated: false,
          token: null,
          accessToken: null,
          refreshToken: null,
          user: null,
          role: null,
          roles: [],
          sessionId: null,
          sessionUserId: null,
        },
      });
    },

    setAuthenticated(
      value = false
    ) {
      if (!value) {
        return setSessionPatch({
          authenticated: false,
        });
      }

      return setSessionPatch({
        authenticated: true,
        token:
          getCurrentToken(),
        user:
          getCurrentUser(),
      });
    },

    setToken(
      token = null
    ) {
      return setSessionPatch({
        token,
        accessToken: token,
        user:
          getCurrentUser(),
      });
    },

    setAccessToken(
      token = null
    ) {
      return setSessionPatch({
        token,
        accessToken: token,
        user:
          getCurrentUser(),
      });
    },

    setRefreshToken(
      refreshToken = null
    ) {
      return set(
        "session.refreshToken",
        safeText(refreshToken, "") || null
      );
    },

    setUser(
      user = null
    ) {
      return setSessionPatch({
        token:
          getCurrentToken(),
        user,
        role:
          user?.role ??
          user?.rol ??
          state.session?.role ??
          null,
      });
    },

    setRole(
      role = null
    ) {
      return setSessionPatch({
        token:
          getCurrentToken(),
        user:
          getCurrentUser(),
        role:
          normalizeRole(role) || null,
      });
    },

    setRoles(
      roles = []
    ) {
      return setSessionPatch({
        token:
          getCurrentToken(),
        user:
          getCurrentUser(),
        roles:
          normalizeRoles(roles),
      });
    },

    /* =========================================================
       UI
    ========================================================= */

    setTheme(
      theme = getDefaultTheme(AppCore)
    ) {
      return set(
        "ui.theme",
        normalizeTheme(theme)
      );
    },

    setLang(
      lang = getDefaultLang(AppCore)
    ) {
      return set(
        "ui.lang",
        normalizeLang(lang)
      );
    },

    setSidebarOpen(
      value = false
    ) {
      return set(
        "ui.sidebarOpen",
        Boolean(value)
      );
    },

    setPageTitle(
      title = getAppName(AppCore)
    ) {
      const finalTitle =
        safeText(
          title,
          getAppName(AppCore)
        );

      return patch({
        ui: {
          pageTitle:
            finalTitle,
          topbarTitle:
            finalTitle,
        },
      });
    },

    setTopbarTitle(
      title = getAppName(AppCore)
    ) {
      return set(
        "ui.topbarTitle",
        safeText(
          title,
          getAppName(AppCore)
        )
      );
    },

    resetTitles() {
      const title =
        getAppName(AppCore);

      return patch({
        ui: {
          pageTitle:
            title,
          topbarTitle:
            title,
        },
      });
    },

    /* =========================================================
       FLAGS
    ========================================================= */

    setFlag(
      flag,
      value
    ) {
      const key =
        normalizeFlagKey(flag);

      if (!key) {
        throw new Error(
          "actions.setFlag(flag, value) requiere flag válido"
        );
      }

      return set(
        `flags.${key}`,
        Boolean(value)
      );
    },

    clearFlag(
      flag
    ) {
      const key =
        normalizeFlagKey(flag);

      if (!key) {
        throw new Error(
          "actions.clearFlag(flag) requiere flag válido"
        );
      }

      return set(
        `flags.${key}`,
        false
      );
    },

    setFlags(
      flags = {}
    ) {
      const source =
        safeObject(flags);

      const next = {};

      Object.entries(source).forEach(
        ([key, value]) => {
          const flagKey =
            normalizeFlagKey(key);

          if (!flagKey) {
            return;
          }

          next[flagKey] =
            Boolean(value);
        }
      );

      return patch({
        flags: next,
      });
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

      return set(
        `entities.${key}`,
        normalizeCollection(items)
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

      return update(
        `entities.${key}`,
        (list = []) => {
          const next =
            Array.isArray(list)
              ? [...list]
              : [];

          next.push(
            deepClone(item)
          );

          return normalizeCollection(next);
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

      return update(
        `entities.${key}`,
        (list = []) => {
          const next =
            Array.isArray(list)
              ? [...list]
              : [];

          next.unshift(
            deepClone(item)
          );

          return normalizeCollection(next);
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
        normalizeMatcher(matcher);

      return update(
        `entities.${key}`,
        (list = []) => {
          if (!Array.isArray(list)) {
            return [];
          }

          return normalizeCollection(
            list.map((item) =>
              match(item)
                ? deepClone(nextItem)
                : item
            )
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

      if (!isFunction(updater)) {
        throw new Error(
          "actions.updateCollectionItem requiere updater function"
        );
      }

      const match =
        normalizeMatcher(matcher);

      return update(
        `entities.${key}`,
        (list = []) => {
          if (!Array.isArray(list)) {
            return [];
          }

          return normalizeCollection(
            list.map((item) => {
              if (!match(item)) {
                return item;
              }

              return updater(
                deepClone(item)
              );
            })
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

      return update(
        `entities.${key}`,
        (list = []) => {
          const next =
            Array.isArray(list)
              ? [...list]
              : [];

          const cleanItem =
            deepClone(item);

          const match =
            matcher
              ? normalizeMatcher(matcher)
              : (current) =>
                  first(
                    current?.id,
                    current?._id,
                    current?.uuid,
                    current?.ticketId,
                    current?.clienteId,
                    current?.facturaId
                  ) ===
                  first(
                    cleanItem?.id,
                    cleanItem?._id,
                    cleanItem?.uuid,
                    cleanItem?.ticketId,
                    cleanItem?.clienteId,
                    cleanItem?.facturaId
                  );

          const index =
            next.findIndex((current) =>
              match(current)
            );

          if (index >= 0) {
            next[index] =
              cleanItem;
          } else {
            next.push(
              cleanItem
            );
          }

          return normalizeCollection(next);
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
        normalizeMatcher(matcher);

      return update(
        `entities.${key}`,
        (list = []) => {
          if (!Array.isArray(list)) {
            return [];
          }

          return normalizeCollection(
            list.filter((item) =>
              !match(item)
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

      return set(
        `entities.${key}`,
        []
      );
    },

    clearCollections() {
      return patch({
        entities: {},
      });
    },

    /* =========================================================
       HYDRATE
    ========================================================= */

    hydrateFromCore() {
      const coreState =
        getCoreState(AppCore);

      const token =
        first(
          coreState.token,
          coreState.accessToken,
          coreState.session?.token,
          coreState.session?.accessToken,
          null
        );

      const user =
        first(
          coreState.user,
          coreState.currentUser,
          coreState.sessionUser,
          coreState.authUser,
          coreState.session?.user,
          null
        );

      const sessionPatch =
        normalizeSessionPatch({
          state,
          authenticated:
            first(
              coreState.authenticated,
              coreState.session?.authenticated,
              false
            ),
          token,
          accessToken:
            token,
          refreshToken:
            coreState.refreshToken ??
            coreState.session?.refreshToken ??
            state.session?.refreshToken ??
            null,
          user,
          role:
            first(
              coreState.role,
              coreState.rol,
              coreState.userRole,
              coreState.session?.role,
              user?.role,
              user?.rol,
              null
            ),
          roles:
            first(
              coreState.roles,
              coreState.session?.roles,
              user?.roles,
              []
            ),
          sessionId:
            first(
              coreState.sessionId,
              coreState.session?.sessionId,
              state.session?.sessionId,
              null
            ),
          sessionUserId:
            first(
              coreState.sessionUserId,
              coreState.session?.sessionUserId,
              state.session?.sessionUserId,
              null
            ),
        });

      return patch({
        app: {
          ready:
            Boolean(
              first(
                coreState.ready,
                state.app?.ready,
                false
              )
            ),

          booted:
            Boolean(
              first(
                coreState.booted,
                state.app?.booted,
                false
              )
            ),

          route:
            normalizePathValue(
              first(
                coreState.route,
                state.app?.route,
                "/"
              )
            ),

          publicPath:
            normalizePathValue(
              first(
                coreState.publicPath,
                state.app?.publicPath,
                coreState.route,
                "/"
              )
            ),

          loading:
            Boolean(
              first(
                coreState.loading,
                state.app?.loading,
                false
              )
            ),

          initialized:
            Boolean(
              first(
                coreState.initialized,
                state.app?.initialized,
                false
              )
            ),

          booting:
            Boolean(
              first(
                coreState.booting,
                state.app?.booting,
                false
              )
            ),

          lastError:
            first(
              coreState.lastError,
              state.app?.lastError,
              null
            ),
        },

        session:
          sessionPatch,

        ui: {
          theme:
            normalizeTheme(
              first(
                coreState.theme,
                state.ui?.theme,
                getDefaultTheme(AppCore)
              )
            ),

          lang:
            normalizeLang(
              first(
                coreState.lang,
                state.ui?.lang,
                getDefaultLang(AppCore)
              )
            ),

          sidebarOpen:
            Boolean(
              first(
                coreState.sidebarOpen,
                state.ui?.sidebarOpen,
                false
              )
            ),

          pageTitle:
            safeResolveTitle(AppCore),

          topbarTitle:
            safeResolveTopbarTitle(AppCore),
        },

        meta: {
          hydrated: true,
          updatedAt: Date.now(),
        },
      });
    },
  };
}
