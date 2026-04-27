/* =========================================================
   Onion SPA - App Events
   Archivo: src/app/events.js

   FINAL PRO SYSTEM · APP EVENTS / NO STORM / NO REBIND · 10/10

   RESPONSABILIDADES:
   - bindear eventos internos de la app
   - sincronizar UI ligera ante cambios de usuario/sesión/auth
   - sincronizar idioma ante app:lang:change
   - coordinar router:rendered con publicPath/UI/loader
   - deduplicar toasts repetidos
   - emitir telemetría ligera de lifecycle
   - tolerar AppCore parcial o cleanup incompleto

   FIX CRÍTICO EVENT STORM:
   - NO usa AppCore.cleanup.event para eventos globales de app
   - NO emite AppCore.events + window a la vez
   - NO llama SidebarUI.repair()
   - NO llama SidebarUI.rebind()
   - NO llama SidebarUI.bindEvents()
   - NO llama TopbarUI.rebind()
   - NO dispara app:ui:repair-request desde router:rendered
   - router:rendered solo sincroniza route/publicPath/loader
   - router:shell:state NO dispara sync UI
   - syncUserUI se llama una sola vez y con firma objeto
   - fallback directo UI solo usa métodos ligeros
========================================================= */

import { getCurrentPublicPath } from "./helpers.js";

import {
  APP_SCOPE,
  APP_SCOPES,
  APP_EVENTS,
  ROUTER_EVENTS,
  AUTH_EVENTS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_SCOPE =
  APP_SCOPES?.events ||
  APP_SCOPE ||
  "app:events";

const TOAST_DEDUPE_MS =
  1200;

const LANG_RERENDER_DEDUPE_MS =
  250;

const EVENT_NAMES = Object.freeze({
  appReady:
    APP_EVENTS?.ready || "app:ready",

  appUiReady:
    APP_EVENTS?.uiReady || "app:ui:ready",

  appUiRepair:
    APP_EVENTS?.uiRepair || "app:ui:repair",

  appUiRepairRequest:
    APP_EVENTS?.uiRepairRequest || "app:ui:repair-request",

  appUserChange:
    APP_EVENTS?.userChange || "app:user:change",

  appUserUiSync:
    "app:user-ui:sync",

  appSessionRestored:
    APP_EVENTS?.sessionRestored || "app:session:restored",

  appSessionCleared:
    "app:session:cleared",

  appLangChange:
    APP_EVENTS?.langChange || "app:lang:change",

  appRouteChange:
    APP_EVENTS?.routeChange || "app:route:change",

  appEventsReady:
    "app:events:ready",

  appEventsBound:
    "app:events:bound",

  appEventsUnbound:
    "app:events:unbound",

  appEventsError:
    "app:events:error",

  authSessionRestored:
    AUTH_EVENTS?.sessionRestored || "auth:session:restored",

  authLoginSuccess:
    AUTH_EVENTS?.loginSuccess || "auth:login:success",

  authLogout:
    AUTH_EVENTS?.logout || "auth:logout",

  authLogoutSuccess:
    "auth:logout:success",

  routerRendered:
    ROUTER_EVENTS?.rendered || "router:rendered",

  routerAsyncComplete:
    ROUTER_EVENTS?.asyncComplete || "router:render:async-complete",

  routerShellState:
    ROUTER_EVENTS?.shellState || "router:shell:state",
});

/*
  Métodos permitidos.
  Prohibidos aquí:
  - repair
  - rebind
  - bindEvents
  - rebindEvents
  - init
*/
const SIDEBAR_LIGHT_USER_METHODS = Object.freeze([
  "renderUser",
  "refreshUser",
  "updateUser",
  "syncUser",
]);

const SIDEBAR_LIGHT_VISUAL_METHODS = Object.freeze([
  "applyRoleVisibility",
  "syncRouteAndIndicator",
  "syncIndicator",
  "updateToggleLabel",
]);

const SIDEBAR_LIGHT_FALLBACK_METHODS = Object.freeze([
  "refresh",
  "sync",
]);

const TOPBAR_LIGHT_USER_METHODS = Object.freeze([
  "renderUser",
  "refreshUser",
  "updateUser",
  "syncUser",
]);

const TOPBAR_LIGHT_FALLBACK_METHODS = Object.freeze([
  "refresh",
  "sync",
]);

const ROUTER_RENDER_SYNC_DEDUPE_MS =
  40;

/* =========================================================
   INTERNAL STATE
========================================================= */

let eventsBound = false;
let boundScope = "";

let langChangeInFlight = false;
let lastLangRenderAt = 0;

let lastRouterRenderedKey = "";
let lastRouterRenderedAt = 0;

let lastToastKey = "";
let lastToastAt = 0;

const boundDisposers = [];

const eventState = {
  totalHandled: 0,
  totalErrors: 0,
  lastEvent: "",
  lastEventAt: 0,
  lastError: null,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
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

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function ensureObject(value) {
  return isObject(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeInvoke(fn, thisArg = null, args = []) {
  try {
    if (isFunction(fn)) {
      return fn.apply(
        thisArg,
        safeArray(args)
      );
    }
  } catch {}

  return undefined;
}

function getEventPayload(eventOrPayload = {}) {
  const raw =
    eventOrPayload || {};

  if (
    raw &&
    typeof raw === "object" &&
    "detail" in raw &&
    raw.detail !== undefined
  ) {
    return ensureObject(raw.detail);
  }

  if (
    raw &&
    typeof raw === "object" &&
    "payload" in raw &&
    raw.payload !== undefined
  ) {
    return ensureObject(raw.payload);
  }

  return ensureObject(raw);
}

function createHandledPayload(eventName = "", payload = {}) {
  const atMs =
    safeNow();

  return {
    event:
      safeText(eventName, "event"),

    payload:
      ensureObject(payload),

    at:
      safeIsoDate(atMs),

    atMs,
  };
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(
      "[AppEvents]",
      ...args
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AppEvents]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AppEvents]",
      ...args
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(
      "[AppEvents]",
      ...args
    );
  } catch {}

  try {
    console.error(
      "[AppEvents]",
      ...args
    );
  } catch {}
}

function safeWindowDispatch(eventName, payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail:
          payload,
      })
    );

    return true;
  } catch {}

  return false;
}

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  const cleanEventName =
    safeText(eventName, "");

  if (!cleanEventName) {
    return false;
  }

  const opts =
    ensureObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        cleanEventName,
        payload
      );

      busEmitted = true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${cleanEventName}") falló.`,
      error
    );
  }

  /*
    Clave anti-storm:
    Si hay bus interno, NO duplicamos en window.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    const windowOk =
      safeWindowDispatch(
        cleanEventName,
        payload
      );

    return Boolean(
      busEmitted ||
      windowOk
    );
  }

  return busEmitted;
}

function recordHandled(eventName = "", payload = {}) {
  eventState.totalHandled += 1;

  eventState.lastEvent =
    safeText(eventName, "");

  eventState.lastEventAt =
    safeNow();

  return createHandledPayload(
    eventName,
    payload
  );
}

function recordError(AppCore, eventName = "", error = null) {
  eventState.totalErrors += 1;

  eventState.lastError = {
    event:
      safeText(eventName, ""),

    message:
      safeText(
        error?.message || error,
        "Error en App Events."
      ),

    at:
      safeIsoDate(),
  };

  safeError(
    AppCore,
    `Error procesando evento ${eventName || "desconocido"}.`,
    error
  );

  safeEmit(
    AppCore,
    EVENT_NAMES.appEventsError,
    eventState.lastError
  );
}

/* =========================================================
   TOAST
========================================================= */

function safeToast(Toast, type, message, options = {}) {
  const cleanType =
    safeText(type, "info");

  const cleanMessage =
    safeText(message, "");

  if (!cleanMessage) {
    return null;
  }

  const payload = {
    ...ensureObject(options),
    type:
      cleanType,

    message:
      cleanMessage,
  };

  try {
    if (isFunction(Toast?.[cleanType])) {
      return Toast[cleanType](
        cleanMessage,
        payload
      );
    }

    if (
      cleanType === "warning" &&
      isFunction(Toast?.warn)
    ) {
      return Toast.warn(
        cleanMessage,
        payload
      );
    }

    if (isFunction(Toast?.show)) {
      return Toast.show(payload);
    }

    if (isFunction(Toast?.notify)) {
      return Toast.notify(payload);
    }
  } catch {}

  return null;
}

function toastOnce(
  Toast,
  type,
  message,
  options = {},
  dedupeMs = TOAST_DEDUPE_MS
) {
  const cleanType =
    safeText(type, "info");

  const cleanMessage =
    safeText(message, "");

  const title =
    safeText(options?.title, "");

  const key =
    `${cleanType}:${title}:${cleanMessage}`;

  const current =
    safeNow();

  if (
    key === lastToastKey &&
    current - lastToastAt < dedupeMs
  ) {
    return null;
  }

  lastToastKey =
    key;

  lastToastAt =
    current;

  return safeToast(
    Toast,
    cleanType,
    cleanMessage,
    options
  );
}

/* =========================================================
   LANGUAGE
========================================================= */

function safeSetLang(lang = "es") {
  const cleanLang =
    safeText(lang, "es");

  if (!isBrowser()) {
    return false;
  }

  try {
    document.documentElement.lang =
      cleanLang;

    return true;
  } catch {}

  return false;
}

function resolveLang(AppCore, I18n, payload = {}) {
  return (
    safeText(payload?.lang, "") ||
    safeText(payload?.language, "") ||
    safeText(payload?.locale, "") ||
    safeText(I18n?.getLang?.(), "") ||
    safeText(I18n?.lang, "") ||
    safeText(AppCore?.state?.lang, "") ||
    "es"
  );
}

async function safeRerenderCurrentRoute({
  AppCore,
  Router,
  rerenderCurrentRoute,
  reason = "lang-change",
} = {}) {
  const current =
    safeNow();

  if (
    current - lastLangRenderAt < LANG_RERENDER_DEDUPE_MS
  ) {
    return false;
  }

  lastLangRenderAt =
    current;

  try {
    if (isFunction(rerenderCurrentRoute)) {
      await Promise.resolve(
        rerenderCurrentRoute({
          reason,
        })
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "rerenderCurrentRoute() falló.",
      error
    );
  }

  const publicPath =
    resolvePublicPath(
      AppCore,
      Router,
      {}
    );

  try {
    if (isFunction(Router?.rerenderCurrentRoute)) {
      await Promise.resolve(
        Router.rerenderCurrentRoute({
          reason,
        })
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.rerenderCurrentRoute() falló.",
      error
    );
  }

  try {
    if (isFunction(Router?.render)) {
      await Promise.resolve(
        Router.render(
          publicPath,
          {
            force:
              true,

            reason,
          }
        )
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.render() falló durante cambio de idioma.",
      error
    );
  }

  try {
    if (isFunction(Router?.navigate)) {
      await Promise.resolve(
        Router.navigate(
          publicPath,
          {
            replaceState:
              true,

            force:
              true,

            reason,
          }
        )
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.navigate() falló durante cambio de idioma.",
      error
    );
  }

  return false;
}

/* =========================================================
   PATH / ROUTER
========================================================= */

function resolvePublicPath(AppCore, Router, payload = {}) {
  const data =
    ensureObject(payload);

  return (
    safeText(data.publicPath, "") ||
    safeText(data.path, "") ||
    safeText(data.href, "") ||
    safeText(data.to, "") ||
    safeText(data.route?.publicPath, "") ||
    safeText(data.route?.path, "") ||
    safeText(AppCore?.state?.publicPath, "") ||
    safeText(Router?.getCurrentPublicPath?.(), "") ||
    safeText(getCurrentPublicPath?.(AppCore), "") ||
    "/"
  );
}

function resolveCanonicalPath(AppCore, Router, payload = {}) {
  const data =
    ensureObject(payload);

  return (
    safeText(data.canonicalPath, "") ||
    safeText(data.route?.canonicalPath, "") ||
    safeText(data.route?.path, "") ||
    safeText(data.path, "") ||
    safeText(AppCore?.state?.route, "") ||
    safeText(Router?.getCurrentCanonicalPath?.(), "") ||
    resolvePublicPath(
      AppCore,
      Router,
      data
    ) ||
    "/"
  );
}

function safeSetPublicPath(AppCore, publicPath = "/") {
  const cleanPath =
    safeText(publicPath, "/");

  const current =
    safeText(AppCore?.state?.publicPath, "");

  if (current === cleanPath) {
    return false;
  }

  let ok = false;

  try {
    AppCore?.setPublicPath?.(
      cleanPath
    );

    ok = true;
  } catch {}

  try {
    AppCore?.setState?.({
      publicPath:
        cleanPath,
    });

    ok = true;
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      AppCore.state.publicPath =
        cleanPath;

      ok = true;
    }
  } catch {}

  return ok;
}

function safeSetRoute(AppCore, route = "/") {
  const cleanRoute =
    safeText(route, "/");

  const current =
    safeText(AppCore?.state?.route, "");

  if (current === cleanRoute) {
    return false;
  }

  let ok = false;

  try {
    AppCore?.setRoute?.(
      cleanRoute
    );

    ok = true;
  } catch {}

  try {
    AppCore?.setState?.({
      route:
        cleanRoute,
    });

    ok = true;
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      AppCore.state.route =
        cleanRoute;

      ok = true;
    }
  } catch {}

  return ok;
}

function safeApplyPostRenderLoaderPolicy({
  AppCore,
  applyPostRenderLoaderPolicy,
  payload = {},
} = {}) {
  try {
    if (isFunction(applyPostRenderLoaderPolicy)) {
      applyPostRenderLoaderPolicy(payload);
      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "applyPostRenderLoaderPolicy() falló.",
      error
    );
  }

  return false;
}

function shouldSkipRouterRenderedSync(route = "/", publicPath = "/") {
  const current =
    safeNow();

  const key =
    `${safeText(route, "/")}|${safeText(publicPath, "/")}`;

  if (
    key === lastRouterRenderedKey &&
    current - lastRouterRenderedAt < ROUTER_RENDER_SYNC_DEDUPE_MS
  ) {
    return true;
  }

  lastRouterRenderedKey =
    key;

  lastRouterRenderedAt =
    current;

  return false;
}

/* =========================================================
   UI SYNC LIGHT
========================================================= */

function callFirstUiMethod(target, methodNames = [], context = {}) {
  if (!target) {
    return {
      called:
        false,

      method:
        "",
    };
  }

  for (const methodName of safeArray(methodNames)) {
    const fn =
      target?.[methodName];

    if (!isFunction(fn)) {
      continue;
    }

    try {
      fn.call(
        target,
        context.reason || context,
        context
      );

      return {
        called:
          true,

        method:
          methodName,
      };
    } catch {}

    try {
      fn.call(
        target,
        context
      );

      return {
        called:
          true,

        method:
          methodName,
      };
    } catch {}

    try {
      fn.call(target);

      return {
        called:
          true,

        method:
          methodName,
      };
    } catch {}
  }

  return {
    called:
      false,

    method:
      "",
  };
}

function callAllUiMethods(target, methodNames = [], context = {}) {
  const methods = [];

  if (!target) {
    return {
      called:
        false,

      methods,
    };
  }

  for (const methodName of safeArray(methodNames)) {
    const fn =
      target?.[methodName];

    if (!isFunction(fn)) {
      continue;
    }

    let called = false;

    try {
      fn.call(
        target,
        context.reason || context,
        context
      );

      called = true;
    } catch {
      try {
        fn.call(
          target,
          context
        );

        called = true;
      } catch {
        try {
          fn.call(target);
          called = true;
        } catch {}
      }
    }

    if (called) {
      methods.push(methodName);
    }
  }

  return {
    called:
      methods.length > 0,

    methods,
  };
}

function syncSidebarLight(SidebarUI, context = {}) {
  const user =
    callFirstUiMethod(
      SidebarUI,
      SIDEBAR_LIGHT_USER_METHODS,
      context
    );

  const visual =
    callAllUiMethods(
      SidebarUI,
      SIDEBAR_LIGHT_VISUAL_METHODS,
      context
    );

  let fallback = {
    called:
      false,

    method:
      "",
  };

  /*
    Fallback solo si no hay métodos ligeros.
    refresh/sync son aceptables porque ya los blindamos para no rebindear.
  */
  if (
    !user.called &&
    !visual.called
  ) {
    fallback =
      callFirstUiMethod(
        SidebarUI,
        SIDEBAR_LIGHT_FALLBACK_METHODS,
        context
      );
  }

  return {
    ok:
      Boolean(
        user.called ||
        visual.called ||
        fallback.called
      ),

    user:
      user.method,

    visual:
      visual.methods,

    fallback:
      fallback.method,
  };
}

function syncTopbarLight(TopbarUI, context = {}) {
  const user =
    callFirstUiMethod(
      TopbarUI,
      TOPBAR_LIGHT_USER_METHODS,
      context
    );

  let fallback = {
    called:
      false,

    method:
      "",
  };

  if (!user.called) {
    fallback =
      callFirstUiMethod(
        TopbarUI,
        TOPBAR_LIGHT_FALLBACK_METHODS,
        context
      );
  }

  return {
    ok:
      Boolean(
        user.called ||
        fallback.called
      ),

    user:
      user.method,

    fallback:
      fallback.method,
  };
}

function safeSyncUI({
  AppCore,
  Auth,
  Router,
  Store,
  SidebarUI,
  TopbarUI,
  Toast,
  I18n,
  syncUserUI,
  reason = "sync-ui",
  payload = {},
  emit = true,
} = {}) {
  const context = {
    AppCore,
    Auth,
    Router,
    Store,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,

    reason:
      safeText(reason, "sync-ui"),

    payload:
      ensureObject(payload),

    route:
      resolveCanonicalPath(
        AppCore,
        Router,
        payload
      ),

    publicPath:
      resolvePublicPath(
        AppCore,
        Router,
        payload
      ),

    user:
      AppCore?.state?.user ||
      Auth?.getUser?.() ||
      Auth?.user ||
      null,

    authenticated:
      Boolean(
        AppCore?.state?.authenticated ||
        Auth?.isAuthenticated?.()
      ),
  };

  let ok = false;

  let usedInjectedSync =
    false;

  let sidebarResult = {
    ok:
      false,
  };

  let topbarResult = {
    ok:
      false,
  };

  /*
    Firma moderna. Solo una llamada.
    Nada de syncUserUI(AppCore) + syncUserUI(context).
  */
  if (isFunction(syncUserUI)) {
    try {
      syncUserUI({
        ...context,
        rebind:
          false,

        hardRepair:
          false,
      });

      usedInjectedSync = true;
      ok = true;
    } catch (error) {
      safeWarn(
        AppCore,
        "syncUserUI() inyectado falló.",
        error
      );
    }
  }

  /*
    Si no se inyecta syncUserUI, hacemos fallback ligero directo.
  */
  if (!usedInjectedSync) {
    sidebarResult =
      syncSidebarLight(
        SidebarUI,
        context
      );

    topbarResult =
      syncTopbarLight(
        TopbarUI,
        context
      );

    ok =
      Boolean(
        sidebarResult.ok ||
        topbarResult.ok
      );
  }

  if (emit) {
    safeEmit(
      AppCore,
      EVENT_NAMES.appUserUiSync,
      {
        source:
          "app:events",

        reason:
          context.reason,

        route:
          context.route,

        publicPath:
          context.publicPath,

        authenticated:
          context.authenticated,

        injected:
          usedInjectedSync,

        sidebar:
          sidebarResult,

        topbar:
          topbarResult,
      }
    );
  }

  return ok;
}

function safeRequestUiRepair(AppCore, reason = "event", payload = {}) {
  /*
    API pública por compatibilidad.
    NO se usa automáticamente desde router:rendered.
  */
  const detail = {
    reason:
      safeText(reason, "event"),

    payload:
      ensureObject(payload),

    hardRepair:
      false,

    rebind:
      false,

    at:
      safeIsoDate(),
  };

  safeEmit(
    AppCore,
    EVENT_NAMES.appUiRepairRequest,
    detail
  );

  return detail;
}

/* =========================================================
   BINDING HELPERS
========================================================= */

function rememberDisposer(disposer) {
  if (isFunction(disposer)) {
    boundDisposers.push(disposer);
  }
}

function bindViaBus(AppCore, eventName, handler) {
  const bus =
    AppCore?.events;

  if (
    !bus ||
    !isFunction(bus.on)
  ) {
    return false;
  }

  try {
    const maybeOff =
      bus.on(
        eventName,
        handler
      );

    if (isFunction(maybeOff)) {
      rememberDisposer(maybeOff);
    } else if (isFunction(bus.off)) {
      rememberDisposer(() => {
        try {
          bus.off(
            eventName,
            handler
          );
        } catch {}
      });
    }

    return true;
  } catch {}

  return false;
}

function bindViaWindow(eventName, handler, options = false) {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.addEventListener(
      eventName,
      handler,
      options
    );

    rememberDisposer(() => {
      try {
        window.removeEventListener(
          eventName,
          handler,
          options
        );
      } catch {}
    });

    return true;
  } catch {}

  return false;
}

function bindAppEvent({
  AppCore,
  eventName,
  handler,
  windowFallback = true,
  options = false,
}) {
  if (
    !eventName ||
    !isFunction(handler)
  ) {
    return false;
  }

  const wrappedHandler = async (eventOrPayload = {}) => {
    const payload =
      getEventPayload(eventOrPayload);

    recordHandled(
      eventName,
      payload
    );

    try {
      await Promise.resolve(
        handler(
          payload,
          eventOrPayload
        )
      );
    } catch (error) {
      recordError(
        AppCore,
        eventName,
        error
      );
    }
  };

  /*
    Clave anti-firebreak:
    NO usamos AppCore.cleanup.event aquí.
    Bus interno primero. Window solo si no hay bus.
  */
  const boundToBus =
    bindViaBus(
      AppCore,
      eventName,
      wrappedHandler
    );

  if (boundToBus) {
    return true;
  }

  if (
    windowFallback &&
    bindViaWindow(
      eventName,
      wrappedHandler,
      options
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   EVENT HANDLERS
========================================================= */

function bindUserEvents(context) {
  const {
    AppCore,
  } = context;

  const sync = (reason, payload = {}) => {
    safeSyncUI({
      ...context,
      reason,
      payload,
    });
  };

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.appUserChange,

    handler:
      (payload) => {
        sync(
          "app:user:change",
          payload
        );
      },
  });

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.appSessionRestored,

    handler:
      (payload) => {
        sync(
          "app:session:restored",
          payload
        );
      },
  });

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.authSessionRestored,

    handler:
      (payload) => {
        sync(
          "auth:session:restored",
          payload
        );
      },
  });

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.appSessionCleared,

    handler:
      (payload) => {
        sync(
          "app:session:cleared",
          payload
        );
      },
  });

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.appUiReady,

    handler:
      (payload) => {
        sync(
          "app:ui:ready",
          payload
        );
      },
  });

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.appReady,

    handler:
      (payload) => {
        sync(
          "app:ready",
          payload
        );
      },
  });
}

function bindLanguageEvents(context) {
  const {
    AppCore,
    I18n,
    Toast,
    Router,
    rerenderCurrentRoute,
  } = context;

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.appLangChange,

    handler:
      async (payload) => {
        const lang =
          resolveLang(
            AppCore,
            I18n,
            payload
          );

        safeSetLang(lang);

        if (langChangeInFlight) {
          return;
        }

        langChangeInFlight =
          true;

        try {
          await safeRerenderCurrentRoute({
            AppCore,
            Router,
            rerenderCurrentRoute,
            reason:
              "app:lang:change",
          });
        } finally {
          langChangeInFlight =
            false;
        }

        safeSyncUI({
          ...context,
          reason:
            "app:lang:change",
          payload:
            {
              ...payload,
              lang,
            },
        });

        toastOnce(
          Toast,
          "success",
          "Idioma actualizado",
          {
            title:
              "Idioma",

            duration:
              2200,
          }
        );
      },
  });
}

function bindAuthEvents(context) {
  const {
    AppCore,
    Toast,
  } = context;

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.authLoginSuccess,

    handler:
      (payload) => {
        safeSyncUI({
          ...context,
          reason:
            "auth:login:success",
          payload,
        });

        toastOnce(
          Toast,
          "success",
          "Sesión iniciada correctamente.",
          {
            title:
              "Bienvenido",

            duration:
              2600,
          }
        );
      },
  });

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.authLogoutSuccess,

    handler:
      (payload) => {
        safeSyncUI({
          ...context,
          reason:
            "auth:logout:success",
          payload,
        });

        toastOnce(
          Toast,
          "info",
          "Sesión cerrada correctamente.",
          {
            title:
              "Sesión finalizada",

            duration:
              2600,
          }
        );
      },
  });

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.authLogout,

    handler:
      (payload) => {
        safeSyncUI({
          ...context,
          reason:
            "auth:logout",
          payload,
        });
      },
  });
}

function bindRouterEvents(context) {
  const {
    AppCore,
    Router,
    applyPostRenderLoaderPolicy,
  } = context;

  const onRouterRendered = (payload = {}) => {
    const publicPath =
      resolvePublicPath(
        AppCore,
        Router,
        payload
      );

    const canonicalPath =
      resolveCanonicalPath(
        AppCore,
        Router,
        payload
      );

    if (
      shouldSkipRouterRenderedSync(
        canonicalPath,
        publicPath
      )
    ) {
      return;
    }

    safeSetPublicPath(
      AppCore,
      publicPath
    );

    safeSetRoute(
      AppCore,
      canonicalPath
    );

    safeApplyPostRenderLoaderPolicy({
      AppCore,
      applyPostRenderLoaderPolicy,
      payload,
    });

    /*
      Importante:
      NO safeSyncUI aquí.
      NO app:ui:repair-request aquí.

      router:rendered ya lo escuchan:
      - src/app/index.js
      - src/ui/sidebar/events.js
      - posiblemente TopbarUI

      Si AppEvents también sincroniza/repara aquí, duplica commits.
    */
    safeEmit(
      AppCore,
      EVENT_NAMES.appRouteChange,
      {
        source:
          "app:events",

        reason:
          payload?.phase ||
          payload?.reason ||
          "router:rendered",

        route:
          canonicalPath,

        publicPath,

        silent:
          true,
      }
    );
  };

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.routerRendered,

    handler:
      onRouterRendered,
  });

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.routerAsyncComplete,

    handler:
      (payload) => {
        /*
          También ligero.
          No pedimos repair porque app/index ya gestiona este evento.
        */
        const publicPath =
          resolvePublicPath(
            AppCore,
            Router,
            payload
          );

        const canonicalPath =
          resolveCanonicalPath(
            AppCore,
            Router,
            payload
          );

        safeEmit(
          AppCore,
          EVENT_NAMES.appRouteChange,
          {
            source:
              "app:events",

            reason:
              "router:render:async-complete",

            route:
              canonicalPath,

            publicPath,

            silent:
              true,
          }
        );
      },
  });

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.routerShellState,

    handler:
      () => {
        /*
          NOOP intencionado.
          router:shell:state puede venir de Router.repairShell().
          Si aquí sincronizamos UI, reentramos en el circuito:
            shell state -> sync UI -> repair shell -> shell state...
        */
      },
  });
}

/* =========================================================
   PUBLIC API
========================================================= */

export function bindAppEvents({
  AppCore,
  Auth,
  Router,
  Store,
  SidebarUI,
  TopbarUI,
  Toast,
  I18n,

  scope = DEFAULT_SCOPE,

  syncUserUI,
  rerenderCurrentRoute,
  applyPostRenderLoaderPolicy,
} = {}) {
  if (eventsBound) {
    return true;
  }

  const finalScope =
    safeText(
      scope,
      DEFAULT_SCOPE
    );

  const context = {
    AppCore,
    Auth,
    Router,
    Store,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,

    scope:
      finalScope,

    syncUserUI,
    rerenderCurrentRoute,
    applyPostRenderLoaderPolicy,
  };

  bindUserEvents(context);
  bindLanguageEvents(context);
  bindAuthEvents(context);
  bindRouterEvents(context);

  eventsBound =
    true;

  boundScope =
    finalScope;

  safeEmit(
    AppCore,
    EVENT_NAMES.appEventsBound,
    {
      scope:
        boundScope,

      at:
        safeIsoDate(),
    }
  );

  safeEmit(
    AppCore,
    EVENT_NAMES.appEventsReady,
    getAppEventsSnapshot()
  );

  safeLog(
    AppCore,
    "App events ready.",
    {
      scope:
        boundScope,
    }
  );

  return true;
}

export function unbindAppEvents(AppCore = null) {
  for (const dispose of boundDisposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

  eventsBound =
    false;

  boundScope =
    "";

  langChangeInFlight =
    false;

  safeEmit(
    AppCore,
    EVENT_NAMES.appEventsUnbound,
    {
      at:
        safeIsoDate(),
    }
  );

  safeLog(
    AppCore,
    "App events unbound."
  );

  return true;
}

export function getAppEventsSnapshot() {
  return {
    eventsBound:
      Boolean(eventsBound),

    boundScope,

    langChangeInFlight:
      Boolean(langChangeInFlight),

    lastLangRenderAt,

    lastRouterRenderedKey,
    lastRouterRenderedAt,

    lastToastKey,
    lastToastAt,

    totalHandled:
      eventState.totalHandled,

    totalErrors:
      eventState.totalErrors,

    lastEvent:
      eventState.lastEvent,

    lastEventAt:
      eventState.lastEventAt,

    lastError:
      eventState.lastError,
  };
}

export function resetAppEventsState() {
  langChangeInFlight =
    false;

  lastLangRenderAt =
    0;

  lastRouterRenderedKey =
    "";

  lastRouterRenderedAt =
    0;

  lastToastKey =
    "";

  lastToastAt =
    0;

  eventState.totalHandled =
    0;

  eventState.totalErrors =
    0;

  eventState.lastEvent =
    "";

  eventState.lastEventAt =
    0;

  eventState.lastError =
    null;

  return getAppEventsSnapshot();
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  bindAppEvents,
  unbindAppEvents,

  getAppEventsSnapshot,
  resetAppEventsState,
};
