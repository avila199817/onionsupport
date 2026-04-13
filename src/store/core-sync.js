/* =========================================================
   Onion SPA - Store Core Sync
   Archivo: src/store/core-sync.js

   Responsabilidades:
   - enlazar Store con AppCore mediante event bus
   - hidratar slices reactivos desde eventos globales
   - mantener session/ui/router sincronizados
   - evitar listeners duplicados
   - cleanup seguro de suscripciones
========================================================= */

import { isBrowser } from "./helpers.js";
import {
  safeTitle,
  safeTopbarTitle,
} from "./state.js";

/* =========================================================
   INTERNAL
========================================================= */
function isFn(value) {
  return typeof value === "function";
}

function safeOff(fn, AppCore) {
  try {
    fn?.();
  } catch (error) {
    AppCore?.utils?.warn?.(
      "No se pudo limpiar listener del Store",
      error
    );
  }
}

function pushUnsubscriber(
  coreUnsubscribers,
  off
) {
  if (isFn(off)) {
    coreUnsubscribers.push(off);
  }
}

/* =========================================================
   API
========================================================= */
export function addCoreEvent({
  AppCore,
  coreUnsubscribers,
  eventName,
  handler,
}) {
  if (
    !AppCore?.events?.on ||
    !eventName ||
    !isFn(handler)
  ) {
    return () => {};
  }

  const off =
    AppCore.events.on(
      eventName,
      handler
    ) || (() => {});

  pushUnsubscriber(
    coreUnsubscribers,
    off
  );

  return off;
}

export function unbindCoreEvents({
  AppCore,
  coreUnsubscribers,
}) {
  while (
    Array.isArray(
      coreUnsubscribers
    ) &&
    coreUnsubscribers.length
  ) {
    const off =
      coreUnsubscribers.pop();

    safeOff(
      off,
      AppCore
    );
  }

  return true;
}

/* =========================================================
   MAIN BIND
========================================================= */
export function bindCoreEvents({
  AppCore,
  state,
  coreUnsubscribers,
  actions,
  patch,
}) {
  if (
    !AppCore ||
    !state ||
    !actions ||
    !isFn(patch)
  ) {
    return false;
  }

  if (
    Array.isArray(
      coreUnsubscribers
    ) &&
    coreUnsubscribers.length
  ) {
    return true;
  }

  /* =========================================
     STATE CHANGE (master sync)
  ========================================= */
  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:state:change",
    handler: ({
      detail,
    } = {}) => {
      const next =
        detail?.state || {};

      patch({
        app: {
          route:
            next.route ??
            state.app.route,

          publicPath:
            next.publicPath ??
            state.app.publicPath,

          loading:
            next.loading ??
            state.app.loading,

          initialized:
            next.initialized ??
            state.app.initialized,

          booting:
            next.booting ??
            state.app.booting,

          lastError:
            next.lastError ??
            state.app.lastError,
        },

        session: {
          authenticated:
            next.authenticated ??
            state.session
              .authenticated,

          token:
            next.token ??
            state.session.token,

          user:
            next.user ??
            state.session.user,

          role:
            next.role ??
            state.session.role,
        },

        ui: {
          theme:
            next.theme ??
            state.ui.theme,

          lang:
            next.lang ??
            state.ui.lang,

          sidebarOpen:
            next.sidebarOpen ??
            state.ui.sidebarOpen,

          pageTitle:
            safeTitle(
              AppCore
            ),

          topbarTitle:
            safeTopbarTitle(
              AppCore
            ),
        },
      });
    },
  });

  /* =========================================
     CORE READY
  ========================================= */
  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:core:ready",
    handler: () => {
      actions.hydrateFromCore?.();
      actions.setInitialized?.(
        true
      );
      actions.markReady?.(
        true
      );
    },
  });

  /* =========================================
     UI
  ========================================= */
  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:theme:change",
    handler: ({
      detail,
    } = {}) => {
      actions.setTheme?.(
        detail?.theme ||
          AppCore.state
            .theme ||
          "dark"
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:lang:change",
    handler: ({
      detail,
    } = {}) => {
      actions.setLang?.(
        detail?.lang ||
          AppCore.state
            .lang ||
          "es"
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:sidebar:change",
    handler: ({
      detail,
    } = {}) => {
      actions.setSidebarOpen?.(
        Boolean(
          detail?.open
        )
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:title:change",
    handler: ({
      detail,
    } = {}) => {
      actions.setPageTitle?.(
        detail?.title ||
          safeTitle(
            AppCore
          )
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:loading:change",
    handler: ({
      detail,
    } = {}) => {
      actions.setLoading?.(
        Boolean(
          detail?.loading
        )
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:error",
    handler: ({
      detail,
    } = {}) => {
      actions.setError?.(
        detail?.error ||
          null
      );
    },
  });

  /* =========================================
     AUTH
  ========================================= */
  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:session:cleared",
    handler: () => {
      actions.clearSession?.();
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "auth:session:cleared",
    handler: () => {
      actions.clearSession?.();
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "auth:session:applied",
    handler: () => {
      actions.setSession?.({
        authenticated:
          AppCore.state
            .authenticated,

        token:
          AppCore.state
            .token,

        user:
          AppCore.state
            .user,

        role:
          AppCore.state
            .role,
      });
    },
  });

  /* =========================================
     ROUTER
  ========================================= */
  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "router:rendered",
    handler: ({
      detail,
    } = {}) => {
      const route =
        detail
          ?.canonicalPath ||
        detail?.path ||
        AppCore.state
          .route ||
        (isBrowser()
          ? window.location
              .pathname
          : "/") ||
        "/";

      const publicPath =
        detail
          ?.publicPath ||
        AppCore.state
          .publicPath ||
        (isBrowser()
          ? `${
              window.location
                .pathname ||
              "/"
            }${
              window.location
                .search ||
              ""
            }`
          : "/");

      actions.setRoute?.(
        route
      );

      actions.setPublicPath?.(
        publicPath
      );

      actions.setPageTitle?.(
        safeTitle(
          AppCore
        )
      );
    },
  });

  return true;
}
