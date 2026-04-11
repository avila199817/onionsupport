/* =========================================================
   Onion SPA - Store Core Sync
   Archivo: src/store/core-sync.js

   Responsabilidades:
   - enlazar el Store con eventos de AppCore
   - hidratar estado desde AppCore
   - sincronizar app / auth / router hacia Store
   - limpiar listeners registrados contra AppCore
========================================================= */

import { isBrowser } from "./helpers.js";
import { safeTitle, safeTopbarTitle } from "./state.js";

export function addCoreEvent({
  AppCore,
  coreUnsubscribers,
  eventName,
  handler,
}) {
  const off = AppCore.events.on(eventName, handler);
  coreUnsubscribers.push(off);
  return off;
}

export function unbindCoreEvents({
  AppCore,
  coreUnsubscribers,
}) {
  while (coreUnsubscribers.length) {
    const off = coreUnsubscribers.pop();

    try {
      off?.();
    } catch (error) {
      AppCore.utils.warn("No se pudo limpiar listener del Store", error);
    }
  }
}

export function bindCoreEvents({
  AppCore,
  state,
  coreUnsubscribers,
  actions,
  patch,
}) {
  if (coreUnsubscribers.length) return;

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:state:change",
    handler: ({ detail }) => {
      patch({
        app: {
          route: detail?.state?.route ?? state.app.route,
          publicPath: detail?.state?.publicPath ?? state.app.publicPath,
          loading: detail?.state?.loading ?? state.app.loading,
          initialized: detail?.state?.initialized ?? state.app.initialized,
          booting: detail?.state?.booting ?? state.app.booting,
          lastError: detail?.state?.lastError ?? state.app.lastError,
        },
        session: {
          authenticated:
            detail?.state?.authenticated ?? state.session.authenticated,
          token: detail?.state?.token ?? state.session.token,
          user: detail?.state?.user ?? state.session.user,
          role: detail?.state?.role ?? state.session.role,
        },
        ui: {
          theme: detail?.state?.theme ?? state.ui.theme,
          lang: detail?.state?.lang ?? state.ui.lang,
          sidebarOpen: detail?.state?.sidebarOpen ?? state.ui.sidebarOpen,
          pageTitle: safeTitle(AppCore),
          topbarTitle: safeTopbarTitle(AppCore),
        },
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:core:ready",
    handler: () => {
      actions.hydrateFromCore();
      actions.setInitialized(true);
      actions.markReady(true);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:theme:change",
    handler: ({ detail }) => {
      actions.setTheme(detail?.theme || AppCore.state.theme || "dark");
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:lang:change",
    handler: ({ detail }) => {
      actions.setLang(detail?.lang || AppCore.state.lang || "es");
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:sidebar:change",
    handler: ({ detail }) => {
      actions.setSidebarOpen(Boolean(detail?.open));
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:error",
    handler: ({ detail }) => {
      actions.setError(detail?.error || null);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:title:change",
    handler: ({ detail }) => {
      actions.setPageTitle(detail?.title || safeTitle(AppCore));
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:loading:change",
    handler: ({ detail }) => {
      actions.setLoading(Boolean(detail?.loading));
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:session:cleared",
    handler: () => {
      actions.clearSession();
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "auth:session:cleared",
    handler: () => {
      actions.clearSession();
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "auth:session:applied",
    handler: () => {
      actions.setSession({
        authenticated: AppCore.state.authenticated,
        token: AppCore.state.token,
        user: AppCore.state.user,
        role: AppCore.state.role,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "router:rendered",
    handler: ({ detail }) => {
      actions.setRoute(
        detail?.canonicalPath ||
          detail?.path ||
          AppCore.state.route ||
          window.location.pathname ||
          "/"
      );

      actions.setPublicPath(
        detail?.publicPath ||
          AppCore.state.publicPath ||
          (isBrowser()
            ? `${window.location.pathname || "/"}${window.location.search || ""}`
            : "/")
      );

      actions.setPageTitle(safeTitle(AppCore));
    },
  });
}
