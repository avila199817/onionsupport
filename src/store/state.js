/* =========================================================
   Onion SPA - Store State
   Archivo: src/store/state.js

   Responsabilidades:
   - construir estado inicial del store
   - exponer snapshots raíz seguros
   - resolver títulos desde DOM / AppCore
   - tocar metadata reactiva
   - clonar slices sin referencias peligrosas
========================================================= */

import {
  isBrowser,
  deepClone,
  normalizeCollection,
} from "./helpers.js";

/* =========================================================
   TITLES
========================================================= */
export function safeTitle(
  AppCore
) {
  const fallback =
    AppCore?.config
      ?.appName ||
    "Onion Support";

  if (
    !isBrowser()
  ) {
    return fallback;
  }

  return (
    String(
      document.title ||
        ""
    ).trim() ||
    fallback
  );
}

export function safeTopbarTitle(
  AppCore
) {
  const domTitle =
    AppCore?.dom
      ?.topbarTitle
      ?.textContent;

  return (
    String(
      domTitle ||
        ""
    ).trim() ||
    safeTitle(
      AppCore
    ) ||
    AppCore?.config
      ?.appName ||
    "Onion Support"
  );
}

/* =========================================================
   META
========================================================= */
export function touchMeta(
  state
) {
  if (
    !state?.meta
  ) {
    return;
  }

  state.meta.updatedAt =
    Date.now();
}

/* =========================================================
   INITIAL STATE
========================================================= */
export function buildInitialState(
  AppCore
) {
  const appName =
    AppCore?.config
      ?.appName ||
    "Onion Support";

  const defaultTheme =
    AppCore?.config
      ?.defaultTheme ||
    "dark";

  const defaultLang =
    AppCore?.config
      ?.defaultLang ||
    "es";

  return {
    app: {
      ready: false,
      booted: false,

      route:
        AppCore.state
          .route ||
        "/",

      publicPath:
        AppCore.state
          .publicPath ||
        "/",

      loading:
        Boolean(
          AppCore.state
            .loading
        ),

      initialized:
        Boolean(
          AppCore.state
            .initialized
        ),

      booting:
        Boolean(
          AppCore.state
            .booting
        ),

      lastError:
        AppCore.state
          .lastError ||
        null,
    },

    session: {
      authenticated:
        Boolean(
          AppCore.state
            .authenticated
        ),

      token:
        AppCore.state
          .token ||
        null,

      user:
        AppCore.state
          .user
          ? deepClone(
              AppCore
                .state
                .user
            )
          : null,

      role:
        AppCore.state
          .role ||
        null,
    },

    ui: {
      theme:
        AppCore.state
          .theme ||
        defaultTheme,

      lang:
        AppCore.state
          .lang ||
        defaultLang,

      sidebarOpen:
        AppCore.state
          .sidebarOpen ??
        true,

      pageTitle:
        safeTitle(
          AppCore
        ) || appName,

      topbarTitle:
        safeTopbarTitle(
          AppCore
        ) || appName,
    },

    entities: {
      incidencias: [],
      facturas: [],
      usuarios: [],
      clientes: [],
      recientes: [],
      dashboard: null,
    },

    flags: {
      hydrating: false,

      fetchingDashboard: false,
      fetchingIncidencias: false,
      fetchingFacturas: false,
      fetchingUsuarios: false,
      fetchingClientes: false,
    },

    meta: {
      hydrated: false,
      updatedAt:
        Date.now(),
    },
  };
}

/* =========================================================
   SAFE ROOT SNAPSHOT
========================================================= */
export function shallowCloneRoot(
  state
) {
  return {
    ...state,

    app: {
      ...state.app,
    },

    session: {
      ...state.session,

      user:
        state.session
          .user
          ? deepClone(
              state
                .session
                .user
            )
          : null,
    },

    ui: {
      ...state.ui,
    },

    entities: {
      incidencias:
        normalizeCollection(
          state.entities
            .incidencias
        ),

      facturas:
        normalizeCollection(
          state.entities
            .facturas
        ),

      usuarios:
        normalizeCollection(
          state.entities
            .usuarios
        ),

      clientes:
        normalizeCollection(
          state.entities
            .clientes
        ),

      recientes:
        normalizeCollection(
          state.entities
            .recientes
        ),

      dashboard:
        state.entities
          .dashboard
          ? deepClone(
              state
                .entities
                .dashboard
            )
          : null,
    },

    flags: {
      ...state.flags,
    },

    meta: {
      ...state.meta,
    },
  };
}
