/* =========================================================
   Onion SPA - Store Core Sync
   Archivo: src/store/core-sync.js

   Responsabilidades:
   - enlazar Store con AppCore mediante event bus
   - hidratar slices reactivos desde eventos globales
   - mantener session/ui/router sincronizados
   - evitar listeners duplicados
   - cleanup seguro de suscripciones
   - tolerar payload directo o CustomEvent.detail
   - sincronizar auth/session/router/ui sin estados fantasma
   - no romper si AppCore llega parcial

   HARDENING EXTREMO:
   - listeners envueltos con try/catch
   - unbind idempotente
   - fallback DOM events si AppCore.events no existe
   - soporte payload directo AppCore.events.emit(payload)
   - soporte payload DOM CustomEvent({ detail })
   - sync robusto de app/session/ui/router
   - evita perder false/null válidos
   - no fuerza sesión autenticada sin señal real del Core
========================================================= */

import { isBrowser } from "./helpers.js";

import {
  safeTitle,
  safeTopbarTitle,
} from "./state.js";

/* =========================================================
   BASICS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

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

function hasOwn(
  object,
  key
) {
  return Boolean(
    object &&
      typeof object === "object" &&
      Object.prototype.hasOwnProperty.call(
        object,
        key
      )
  );
}

function pickDefined(
  ...values
) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function pickText(
  ...values
) {
  for (const value of values) {
    const text =
      safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

function safeBool(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "on",
        "open",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "closed",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

/* =========================================================
   SAFE LOGGING
========================================================= */

function safeWarn(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.warn?.(
      "[StoreCoreSync]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[StoreCoreSync]",
      ...args
    );
  } catch {}
}

/* =========================================================
   EVENT PAYLOAD
========================================================= */

function resolveEventPayload(eventOrPayload = {}) {
  const payload =
    safeObject(eventOrPayload);

  /*
    Soporta:
      AppCore.events.emit("x", payload)
      window.dispatchEvent(new CustomEvent("x", { detail: payload }))
  */
  if (
    hasOwn(payload, "detail") &&
    isObject(payload.detail)
  ) {
    return payload.detail;
  }

  return payload;
}

function resolveStatePayload(eventOrPayload = {}) {
  const payload =
    resolveEventPayload(eventOrPayload);

  return safeObject(
    payload.state ||
      payload.nextState ||
      payload.after ||
      payload.current ||
      payload
  );
}

/* =========================================================
   CORE STATE
========================================================= */

function getCoreState(AppCore) {
  return safeObject(
    AppCore?.state
  );
}

function getStoreAppState(state) {
  return safeObject(
    state?.app
  );
}

function getStoreSessionState(state) {
  return safeObject(
    state?.session
  );
}

function getStoreUiState(state) {
  return safeObject(
    state?.ui
  );
}

/* =========================================================
   BROWSER PATH FALLBACKS
========================================================= */

function getBrowserPathname() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    return (
      window.location.pathname ||
      "/"
    );
  } catch {
    return "/";
  }
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    return `${
      window.location.pathname || "/"
    }${
      window.location.search || ""
    }${
      window.location.hash || ""
    }`;
  } catch {
    return "/";
  }
}

/* =========================================================
   PATCH BUILDERS
========================================================= */

function buildAppPatch({
  AppCore,
  state,
  source = {},
} = {}) {
  const core =
    getCoreState(AppCore);

  const app =
    getStoreAppState(state);

  const route =
    pickDefined(
      source.route,
      source.canonicalPath,
      core.route,
      app.route,
      getBrowserPathname(),
      "/"
    );

  const publicPath =
    pickDefined(
      source.publicPath,
      source.path,
      core.publicPath,
      app.publicPath,
      getBrowserPublicPath(),
      route,
      "/"
    );

  return {
    route:
      route || "/",

    publicPath:
      publicPath || route || "/",

    loading:
      pickDefined(
        source.loading,
        core.loading,
        app.loading,
        false
      ),

    initialized:
      pickDefined(
        source.initialized,
        core.initialized,
        app.initialized,
        false
      ),

    booting:
      pickDefined(
        source.booting,
        core.booting,
        app.booting,
        false
      ),

    ready:
      pickDefined(
        source.ready,
        core.ready,
        app.ready,
        false
      ),

    booted:
      pickDefined(
        source.booted,
        core.booted,
        app.booted,
        false
      ),

    lastError:
      pickDefined(
        source.lastError,
        source.error,
        core.lastError,
        app.lastError,
        null
      ),
  };
}

function buildSessionPatch({
  AppCore,
  state,
  source = {},
} = {}) {
  const core =
    getCoreState(AppCore);

  const session =
    getStoreSessionState(state);

  const coreSession =
    safeObject(core.session);

  const payloadSession =
    safeObject(source.session);

  const user =
    pickDefined(
      source.user,
      source.currentUser,
      source.authUser,
      payloadSession.user,
      core.user,
      core.currentUser,
      core.authUser,
      coreSession.user,
      session.user,
      null
    );

  const token =
    pickDefined(
      source.token,
      source.accessToken,
      payloadSession.token,
      payloadSession.accessToken,
      core.token,
      core.accessToken,
      coreSession.token,
      coreSession.accessToken,
      session.token,
      null
    );

  const role =
    pickDefined(
      source.role,
      source.rol,
      payloadSession.role,
      payloadSession.rol,
      core.role,
      core.rol,
      coreSession.role,
      coreSession.rol,
      user?.role,
      user?.rol,
      session.role,
      null
    );

  const authenticated =
    pickDefined(
      source.authenticated,
      payloadSession.authenticated,
      core.authenticated,
      core.isAuthenticated,
      coreSession.authenticated,
      session.authenticated,
      false
    );

  return {
    authenticated:
      Boolean(authenticated),

    token:
      token ?? null,

    user:
      user ?? null,

    role:
      role ?? null,
  };
}

function buildUiPatch({
  AppCore,
  state,
  source = {},
} = {}) {
  const core =
    getCoreState(AppCore);

  const ui =
    getStoreUiState(state);

  return {
    theme:
      pickDefined(
        source.theme,
        core.theme,
        ui.theme,
        "dark"
      ),

    lang:
      pickDefined(
        source.lang,
        core.lang,
        ui.lang,
        "es"
      ),

    sidebarOpen:
      pickDefined(
        source.sidebarOpen,
        source.open,
        core.sidebarOpen,
        ui.sidebarOpen,
        false
      ),

    pageTitle:
      safeTitle(AppCore),

    topbarTitle:
      safeTopbarTitle(AppCore),
  };
}

function syncFromCore({
  AppCore,
  state,
  patch,
  source = {},
} = {}) {
  if (!isFn(patch)) {
    return false;
  }

  patch({
    app:
      buildAppPatch({
        AppCore,
        state,
        source,
      }),

    session:
      buildSessionPatch({
        AppCore,
        state,
        source,
      }),

    ui:
      buildUiPatch({
        AppCore,
        state,
        source,
      }),
  });

  return true;
}

/* =========================================================
   UNSUBSCRIBE
========================================================= */

function safeOff(
  fn,
  AppCore
) {
  try {
    fn?.();
  } catch (error) {
    safeWarn(
      AppCore,
      "No se pudo limpiar listener del Store.",
      error
    );
  }
}

function normalizeUnsubscriber({
  AppCore,
  eventName,
  handler,
  rawOff,
  usedWindow = false,
} = {}) {
  if (isFn(rawOff)) {
    return rawOff;
  }

  if (
    !usedWindow &&
    isFn(AppCore?.events?.off)
  ) {
    return () => {
      try {
        AppCore.events.off(
          eventName,
          handler
        );
      } catch {}
    };
  }

  if (
    usedWindow &&
    isBrowser()
  ) {
    return () => {
      try {
        window.removeEventListener(
          eventName,
          handler
        );
      } catch {}
    };
  }

  return () => {};
}

function pushUnsubscriber(
  coreUnsubscribers,
  off
) {
  if (
    Array.isArray(coreUnsubscribers) &&
    isFn(off)
  ) {
    coreUnsubscribers.push(off);
  }
}

/* =========================================================
   API · ADD EVENT
========================================================= */

export function addCoreEvent({
  AppCore,
  coreUnsubscribers,
  eventName,
  handler,
}) {
  if (
    !eventName ||
    !isFn(handler)
  ) {
    return () => {};
  }

  const wrappedHandler = (...args) => {
    try {
      return handler(...args);
    } catch (error) {
      safeWarn(
        AppCore,
        `Error en listener "${eventName}".`,
        error
      );

      return undefined;
    }
  };

  let rawOff = null;
  let usedWindow = false;

  if (isFn(AppCore?.events?.on)) {
    try {
      rawOff =
        AppCore.events.on(
          eventName,
          wrappedHandler
        );
    } catch (error) {
      safeWarn(
        AppCore,
        `No se pudo registrar listener AppCore "${eventName}".`,
        error
      );
    }
  } else if (isBrowser()) {
    try {
      window.addEventListener(
        eventName,
        wrappedHandler
      );

      usedWindow = true;
    } catch (error) {
      safeWarn(
        AppCore,
        `No se pudo registrar listener window "${eventName}".`,
        error
      );
    }
  }

  const off =
    normalizeUnsubscriber({
      AppCore,
      eventName,
      handler: wrappedHandler,
      rawOff,
      usedWindow,
    });

  pushUnsubscriber(
    coreUnsubscribers,
    off
  );

  return off;
}

/* =========================================================
   API · UNBIND
========================================================= */

export function unbindCoreEvents({
  AppCore,
  coreUnsubscribers,
}) {
  while (
    Array.isArray(coreUnsubscribers) &&
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
   ROUTER SYNC
========================================================= */

function syncRouteEvent({
  AppCore,
  state,
  actions,
  event,
} = {}) {
  const payload =
    resolveEventPayload(event);

  const core =
    getCoreState(AppCore);

  const route =
    pickText(
      payload.canonicalPath,
      payload.route,
      payload.path,
      core.route,
      state?.app?.route,
      getBrowserPathname(),
      "/"
    );

  const publicPath =
    pickText(
      payload.publicPath,
      payload.requestedPath,
      payload.path,
      core.publicPath,
      state?.app?.publicPath,
      getBrowserPublicPath(),
      route,
      "/"
    );

  actions.setRoute?.(
    route || "/"
  );

  actions.setPublicPath?.(
    publicPath || route || "/"
  );

  actions.setPageTitle?.(
    safeTitle(AppCore)
  );

  return true;
}

/* =========================================================
   SESSION SYNC
========================================================= */

function syncSessionEvent({
  AppCore,
  state,
  actions,
  patch,
  event,
} = {}) {
  const payload =
    resolveEventPayload(event);

  const sessionPatch =
    buildSessionPatch({
      AppCore,
      state,
      source: payload,
    });

  if (isFn(actions?.setSession)) {
    actions.setSession(sessionPatch);
    return true;
  }

  if (isFn(patch)) {
    patch({
      session:
        sessionPatch,
    });

    return true;
  }

  return false;
}

function clearSessionEvent({
  actions,
  patch,
} = {}) {
  if (isFn(actions?.clearSession)) {
    actions.clearSession();
    return true;
  }

  if (isFn(patch)) {
    patch({
      session: {
        authenticated: false,
        token: null,
        user: null,
        role: null,
      },
    });

    return true;
  }

  return false;
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

  /*
    Evita doble binding si Store.init() se llama dos veces.
  */
  if (
    Array.isArray(coreUnsubscribers) &&
    coreUnsubscribers.length
  ) {
    return true;
  }

  /* =========================================
     STATE CHANGE · MASTER SYNC
  ========================================= */

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:state:change",
    handler: (event) => {
      syncFromCore({
        AppCore,
        state,
        patch,
        source:
          resolveStatePayload(event),
      });
    },
  });

  /* =========================================
     CORE READY / BOOT
  ========================================= */

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:core:ready",
    handler: () => {
      actions.hydrateFromCore?.();
      actions.setInitialized?.(true);
      actions.markReady?.(true);
      actions.markBooted?.(true);
      actions.setBooting?.(false);
      actions.setLoading?.(false);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:ready",
    handler: () => {
      actions.markReady?.(true);
      actions.setBooting?.(false);
      actions.setLoading?.(false);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "main:ready",
    handler: () => {
      actions.markReady?.(true);
      actions.markBooted?.(true);
      actions.setBooting?.(false);
      actions.setLoading?.(false);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "main:booting",
    handler: () => {
      actions.setBooting?.(true);
      actions.setLoading?.(true);
      actions.markReady?.(false);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "main:boot:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setBooting?.(false);
      actions.setLoading?.(false);
      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );
    },
  });

  /* =========================================
     UI
  ========================================= */

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:theme:change",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setTheme?.(
        payload.theme ||
          getCoreState(AppCore).theme ||
          state.ui?.theme ||
          "dark"
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:lang:change",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setLang?.(
        payload.lang ||
          getCoreState(AppCore).lang ||
          state.ui?.lang ||
          "es"
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:sidebar:change",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setSidebarOpen?.(
        safeBool(
          pickDefined(
            payload.open,
            payload.sidebarOpen,
            getCoreState(AppCore).sidebarOpen,
            state.ui?.sidebarOpen,
            false
          )
        )
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:title:change",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setPageTitle?.(
        payload.title ||
          safeTitle(AppCore)
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:loading:change",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setLoading?.(
        safeBool(
          pickDefined(
            payload.loading,
            payload.isLoading,
            false
          )
        )
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:error:clear",
    handler: () => {
      actions.clearError?.();
    },
  });

  /* =========================================
     AUTH / SESSION
  ========================================= */

  [
    "auth:session:applied",
    "auth:session:restored",
    "app:session:restored",
    "app:auth:change",
    "auth:change",
    "app:user:change",
    "app:user:updated",
  ].forEach((eventName) => {
    addCoreEvent({
      AppCore,
      coreUnsubscribers,
      eventName,
      handler: (event) => {
        syncSessionEvent({
          AppCore,
          state,
          actions,
          patch,
          event,
        });
      },
    });
  });

  [
    "app:session:cleared",
    "auth:session:cleared",
    "auth:logout:success",
  ].forEach((eventName) => {
    addCoreEvent({
      AppCore,
      coreUnsubscribers,
      eventName,
      handler: () => {
        clearSessionEvent({
          actions,
          patch,
        });
      },
    });
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "auth:login:start",
    handler: () => {
      actions.setLoading?.(true);
      actions.setFlag?.(
        "loginInProgress",
        true
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "auth:login:success",
    handler: (event) => {
      actions.setLoading?.(false);
      actions.setFlag?.(
        "loginInProgress",
        false
      );

      syncSessionEvent({
        AppCore,
        state,
        actions,
        patch,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "auth:login:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setLoading?.(false);
      actions.setFlag?.(
        "loginInProgress",
        false
      );

      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );

      clearSessionEvent({
        actions,
        patch,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "auth:restore:start",
    handler: () => {
      actions.setFlag?.(
        "restoreInProgress",
        true
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "auth:restore:success",
    handler: (event) => {
      actions.setFlag?.(
        "restoreInProgress",
        false
      );

      syncSessionEvent({
        AppCore,
        state,
        actions,
        patch,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "auth:restore:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setFlag?.(
        "restoreInProgress",
        false
      );

      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );
    },
  });

  /* =========================================
     ROUTER
  ========================================= */

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "app:route:change",
    handler: (event) => {
      syncRouteEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "router:before-render",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      const route =
        pickText(
          payload.canonicalPath,
          payload.path,
          getCoreState(AppCore).route,
          state.app?.route,
          "/"
        );

      const publicPath =
        pickText(
          payload.publicPath,
          payload.requestedPath,
          payload.path,
          getCoreState(AppCore).publicPath,
          state.app?.publicPath,
          route,
          "/"
        );

      actions.setRoute?.(
        route || "/"
      );

      actions.setPublicPath?.(
        publicPath || route || "/"
      );

      actions.setLoading?.(
        true
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "router:rendered",
    handler: (event) => {
      syncRouteEvent({
        AppCore,
        state,
        actions,
        event,
      });

      actions.setLoading?.(
        false
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "router:render:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setLoading?.(
        false
      );

      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: "router:shell:state",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      if (
        hasOwn(payload, "shellHidden")
      ) {
        actions.setFlag?.(
          "shellHidden",
          Boolean(payload.shellHidden)
        );
      }
    },
  });

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  addCoreEvent,
  bindCoreEvents,
  unbindCoreEvents,
};
