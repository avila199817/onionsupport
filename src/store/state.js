/* =========================================================
   Onion SPA - Store State
   Archivo: src/store/state.js

   Responsabilidades:
   - construir el estado inicial del store
   - exponer snapshots raíz seguros
   - resolver títulos seguros desde DOM / AppCore
   - tocar metadata del store
========================================================= */

import {
  isBrowser,
  deepClone,
  normalizeCollection,
} from "./helpers.js";

export function safeTitle(AppCore) {
  if (!isBrowser()) return AppCore.config.appName;
  return document.title || AppCore.config.appName;
}

export function safeTopbarTitle(AppCore) {
  return (
    AppCore.dom.topbarTitle?.textContent ||
    safeTitle(AppCore) ||
    AppCore.config.appName
  );
}

export function touchMeta(state) {
  state.meta.updatedAt = Date.now();
}

export function buildInitialState(AppCore) {
  return {
    app: {
      ready: false,
      booted: false,
      route: AppCore.state.route || "/",
      publicPath: AppCore.state.publicPath || "/",
      loading: Boolean(AppCore.state.loading),
      initialized: Boolean(AppCore.state.initialized),
      booting: Boolean(AppCore.state.booting),
      lastError: AppCore.state.lastError || null,
    },

    session: {
      authenticated: Boolean(AppCore.state.authenticated),
      token: AppCore.state.token || null,
      user: AppCore.state.user ? deepClone(AppCore.state.user) : null,
      role: AppCore.state.role || null,
    },

    ui: {
      theme: AppCore.state.theme || AppCore.config.defaultTheme || "dark",
      lang: AppCore.state.lang || AppCore.config.defaultLang || "es",
      sidebarOpen: AppCore.state.sidebarOpen ?? true,
      pageTitle: safeTitle(AppCore),
      topbarTitle: safeTopbarTitle(AppCore),
    },

    entities: {
      incidencias: [],
      facturas: [],
      usuarios: [],
      clientes: [],
      dashboard: null,
      recientes: [],
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
      updatedAt: Date.now(),
    },
  };
}

export function shallowCloneRoot(state) {
  return {
    ...state,
    app: { ...state.app },
    session: {
      ...state.session,
      user: state.session.user ? deepClone(state.session.user) : null,
    },
    ui: { ...state.ui },
    entities: {
      incidencias: normalizeCollection(state.entities.incidencias),
      facturas: normalizeCollection(state.entities.facturas),
      usuarios: normalizeCollection(state.entities.usuarios),
      clientes: normalizeCollection(state.entities.clientes),
      recientes: normalizeCollection(state.entities.recientes),
      dashboard: state.entities.dashboard
        ? deepClone(state.entities.dashboard)
        : null,
    },
    flags: { ...state.flags },
    meta: { ...state.meta },
  };
}
