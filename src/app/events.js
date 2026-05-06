/* =========================================================
   Onion SPA - App Events
   Archivo: src/app/events.js

   ONION SUPPORT · APP EVENTS
   EVENT BUS · NO STORM · NO REBIND · ROUTER/AUTH/LANG SYNC · EXTREME 12/10

   RESPONSABILIDADES:
   - Bindear eventos internos de la app.
   - Sincronizar UI ligera ante cambios de usuario/sesión/auth.
   - Sincronizar idioma ante app:lang:change.
   - Coordinar router:rendered con route/publicPath/loader.
   - Deduplicar toasts repetidos.
   - Emitir telemetría ligera de lifecycle.
   - Tolerar AppCore parcial o cleanup incompleto.

   REGLAS CRÍTICAS:
   - NO usa AppCore.cleanup.event para eventos globales de app.
   - NO emite AppCore.events + window a la vez.
   - NO llama SidebarUI.repair().
   - NO llama SidebarUI.rebind().
   - NO llama SidebarUI.bindEvents().
   - NO llama TopbarUI.rebind().
   - NO dispara app:ui:repair-request desde router:rendered.
   - NO emite app:user-ui:sync desde AppEvents.
   - NO emite app:route:change desde router:rendered.
   - router:rendered solo sincroniza state route/publicPath + loader.
   - router:shell:state es NOOP para evitar bucles.

   HARDENING 12/10:
   - Binding idempotente real.
   - Dedupe de eventos equivalentes si constants aliasan al mismo nombre.
   - State sync silencioso para router:rendered.
   - Snapshot sin tokens.
   - Fallback window solo si no existe bus interno.
   - No cleanup.event para evitar interacciones cruzadas con scopes.
   - No storm entre shell/router/ui.
========================================================= */

import {
  getCurrentPublicPath,
  getCurrentCanonicalPath,
  normalizePublicPath,
  normalizeCanonicalPath,
} from "./helpers.js";

import {
  applyPostRenderLoaderPolicy as applyPostRenderLoaderPolicyBase,
} from "./shell.js";

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

const APP_EVENTS_VERSION = "12.0.0";

const DEFAULT_SCOPE =
  APP_SCOPES?.events ||
  APP_SCOPE ||
  "app:events";

const TOAST_DEDUPE_MS = 1200;
const LANG_RERENDER_DEDUPE_MS = 250;
const ROUTER_RENDER_SYNC_DEDUPE_MS = 40;
const UI_SYNC_DEDUPE_MS = 80;

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

  /*
    Referencia legacy.
    AppEvents NO debe emitir este evento.
    Lo emite src/app/ui.js.
  */
  appUserUiSync:
    "app:user-ui:sync",

  appEventsUiSynced:
    "app:events:ui-synced",

  appRouteSynced:
    "app:events:route-synced",

  appSessionRestored:
    APP_EVENTS?.sessionRestored || "app:session:restored",

  appSessionCleared:
    "app:session:cleared",

  appLangChange:
    APP_EVENTS?.langChange || "app:lang:change",

  appRouteChange:
    APP_EVENTS?.routeChange || "app:route:change",

  appThemeChange:
    APP_EVENTS?.themeChange || "app:theme:change",

  onionThemeChange:
    "onion:theme:change",

  legacyThemeChange:
    "theme:change",

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

const TOPBAR_LIGHT_VISUAL_METHODS = Object.freeze([
  "syncRoute",
  "updateRoute",
]);

const TOPBAR_LIGHT_FALLBACK_METHODS = Object.freeze([
  "refresh",
  "sync",
]);

const SENSITIVE_QUERY_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
  "access_token",
  "refresh_token",
  "id_token",
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
]);

/* =========================================================
   INTERNAL STATE
========================================================= */

let eventsBound = false;
let eventsBindingInFlight = false;
let boundScope = "";

let langChangeInFlight = false;
let lastLangRenderAt = 0;

let lastRouterRenderedKey = "";
let lastRouterRenderedAt = 0;

let lastToastKey = "";
let lastToastAt = 0;

let lastUiSyncKey = "";
let lastUiSyncAt = 0;

const boundDisposers = [];
const boundEventKeys = new Set();

const eventState = {
  totalHandled: 0,
  totalErrors: 0,

  lastEvent: "",
  lastEventAt: 0,

  lastError: null,

  boundEvents: [],
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
    typeof value === "object" &&
    !Array.isArray(value)
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

function unique(values = []) {
  const output = [];
  const seen = new Set();

  for (const value of safeArray(values)) {
    const clean =
      safeText(value, "");

    if (
      clean &&
      !seen.has(clean)
    ) {
      seen.add(clean);
      output.push(clean);
    }
  }

  return output;
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

function safeMethod(target, methodName, args = []) {
  try {
    if (isFunction(target?.[methodName])) {
      return target[methodName](
        ...(Array.isArray(args) ? args : [])
      );
    }
  } catch {}

  return undefined;
}

/* =========================================================
   REDACTION
========================================================= */

function redactSensitiveText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
      const escaped =
        String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    }

    output =
      output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  return output;
}

function redactKey(value = "") {
  return redactSensitiveText(
    safeText(value, "")
  );
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.("[AppEvents]", ...args);
  } catch {}
}

function safeWarn(AppCore, ...args) {
  let emittedByCore = false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn("[AppEvents]", ...args);
      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.warn("[AppEvents]", ...args);
  } catch {}
}

function safeError(AppCore, ...args) {
  let emittedByCore = false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error("[AppEvents]", ...args);
      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.error("[AppEvents]", ...args);
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
    return (
      safeWindowDispatch(
        cleanEventName,
        payload
      ) ||
      busEmitted
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

function normalizeError(error = null) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return {
      name:
        "AppEventsError",

      message:
        redactSensitiveText(error),

      code:
        "APP_EVENTS_ERROR",
    };
  }

  const object =
    ensureObject(error);

  const payload = {
    name:
      safeText(
        object.name,
        "AppEventsError"
      ),

    message:
      redactSensitiveText(
        safeText(
          object.message || error,
          "Error en App Events."
        )
      ),

    code:
      safeText(
        object.code ||
          object.status ||
          object.statusCode,
        "APP_EVENTS_ERROR"
      ),
  };

  if (object.stack) {
    payload.stack =
      redactSensitiveText(
        safeText(object.stack, "")
      );
  }

  return payload;
}

function recordError(AppCore, eventName = "", error = null) {
  eventState.totalErrors += 1;

  eventState.lastError = {
    event:
      safeText(eventName, ""),

    error:
      normalizeError(error),

    message:
      redactSensitiveText(
        safeText(
          error?.message || error,
          "Error en App Events."
        )
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
   AUTH SAFE READ
========================================================= */

function getAuthUser(Auth) {
  try {
    return (
      Auth?.getUser?.() ||
      Auth?.getCurrentUser?.() ||
      Auth?.user ||
      null
    );
  } catch {}

  return null;
}

function getAuthStatus(Auth) {
  try {
    if (isFunction(Auth?.isAuthenticated)) {
      return Boolean(Auth.isAuthenticated());
    }
  } catch {}

  return Boolean(Auth?.authenticated);
}

/* =========================================================
   TOAST
========================================================= */

function normalizeToastType(type = "info") {
  const clean =
    safeText(type, "info").toLowerCase();

  if (clean === "warn") {
    return "warning";
  }

  return clean || "info";
}

function safeToast(Toast, type, message, options = {}) {
  const cleanType =
    normalizeToastType(type);

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
    normalizeToastType(type);

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

  lastToastKey = key;
  lastToastAt = current;

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
    current - lastLangRenderAt <
    LANG_RERENDER_DEDUPE_MS
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
            preservePublicPath:
              true,
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

function normalizePublicSafe(AppCore, path = "/") {
  const raw =
    safeText(path, "/") || "/";

  try {
    const direct =
      normalizePublicPath(raw);

    if (direct) {
      return direct;
    }
  } catch {}

  try {
    const legacy =
      normalizePublicPath(AppCore, raw);

    if (legacy) {
      return legacy;
    }
  } catch {}

  return raw || "/";
}

function normalizeCanonicalSafe(AppCore, path = "/") {
  const raw =
    safeText(path, "/") || "/";

  try {
    const direct =
      normalizeCanonicalPath(raw);

    if (direct) {
      return direct;
    }
  } catch {}

  try {
    const legacy =
      normalizeCanonicalPath(AppCore, raw);

    if (legacy) {
      return legacy;
    }
  } catch {}

  return (
    raw
      .split("?")[0]
      .split("#")[0]
      .replace(/^\/@[^/]+(?=\/|$)/i, "")
      .replace(/\/+$/g, "") ||
    "/"
  );
}

function callRouterGetter(Router, methodName = "") {
  try {
    if (isFunction(Router?.[methodName])) {
      return Router[methodName]();
    }
  } catch {}

  return "";
}

function resolvePublicPath(AppCore, Router, payload = {}) {
  const data =
    ensureObject(payload);

  const candidate =
    safeText(data.publicPath, "") ||
    safeText(data.route?.publicPath, "") ||
    safeText(data.href, "") ||
    safeText(data.to, "") ||
    safeText(data.path, "") ||
    safeText(data.route?.path, "") ||
    safeText(AppCore?.state?.publicPath, "") ||
    safeText(callRouterGetter(Router, "getCurrentPublicPath"), "") ||
    safeText(getCurrentPublicPath?.(AppCore, Router), "") ||
    "/";

  return normalizePublicSafe(
    AppCore,
    candidate
  );
}

function resolveCanonicalPath(AppCore, Router, payload = {}) {
  const data =
    ensureObject(payload);

  const candidate =
    safeText(data.canonicalPath, "") ||
    safeText(data.route?.canonicalPath, "") ||
    safeText(AppCore?.state?.route, "") ||
    safeText(callRouterGetter(Router, "getCurrentCanonicalPath"), "") ||
    safeText(getCurrentCanonicalPath?.(AppCore, Router), "") ||
    safeText(data.route?.path, "") ||
    safeText(data.path, "") ||
    resolvePublicPath(AppCore, Router, data) ||
    "/";

  return normalizeCanonicalSafe(
    AppCore,
    candidate
  );
}

function assignStateDirectly(AppCore, patch = {}) {
  const cleanPatch =
    ensureObject(patch);

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        cleanPatch
      );

      return true;
    }
  } catch {}

  return false;
}

function setStateSilent(AppCore, patch = {}) {
  const cleanPatch =
    ensureObject(patch);

  /*
    CRÍTICO:
    AppEvents no debe inducir app:route:change desde router:rendered.
    Por eso:
    1. preferimos mutación directa de state;
    2. sólo si no hay state mutable, usamos setState con emit:false.
  */
  if (assignStateDirectly(AppCore, cleanPatch)) {
    return true;
  }

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(
        cleanPatch,
        {
          emit:
            false,
          emitState:
            false,
          source:
            "app:events:silent-state-sync",
        }
      );

      return true;
    }
  } catch {}

  return false;
}

function safePatchRouteState(AppCore, {
  route = "/",
  publicPath = "/",
} = {}) {
  const cleanRoute =
    normalizeCanonicalSafe(
      AppCore,
      route
    );

  const cleanPublicPath =
    normalizePublicSafe(
      AppCore,
      publicPath
    );

  const state =
    ensureObject(AppCore?.state);

  const routeChanged =
    safeText(state.route, "") !== cleanRoute;

  const publicChanged =
    safeText(state.publicPath, "") !== cleanPublicPath;

  if (
    !routeChanged &&
    !publicChanged
  ) {
    return {
      changed:
        false,
      routeChanged:
        false,
      publicChanged:
        false,
      route:
        cleanRoute,
      publicPath:
        cleanPublicPath,
    };
  }

  const patch = {};

  if (routeChanged) {
    patch.route =
      cleanRoute;

    patch.canonicalPath =
      cleanRoute;
  }

  if (publicChanged) {
    patch.publicPath =
      cleanPublicPath;
  }

  setStateSilent(
    AppCore,
    patch
  );

  return {
    changed:
      true,
    routeChanged,
    publicChanged,
    route:
      cleanRoute,
    publicPath:
      cleanPublicPath,
  };
}

function safeApplyPostRenderLoaderPolicy({
  AppCore,
  Router,
  applyPostRenderLoaderPolicy,
  payload = {},
} = {}) {
  const fn =
    isFunction(applyPostRenderLoaderPolicy)
      ? applyPostRenderLoaderPolicy
      : applyPostRenderLoaderPolicyBase;

  try {
    if (isFunction(fn)) {
      fn({
        AppCore,
        Router,
        ...ensureObject(payload),
      });

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
    current - lastRouterRenderedAt <
      ROUTER_RENDER_SYNC_DEDUPE_MS
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
    refresh/sync son aceptables; repair/rebind/bind siguen prohibidos.
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

  const visual =
    callAllUiMethods(
      TopbarUI,
      TOPBAR_LIGHT_VISUAL_METHODS,
      context
    );

  let fallback = {
    called:
      false,
    method:
      "",
  };

  if (
    !user.called &&
    !visual.called
  ) {
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

function getUiSyncDedupeKey(context = {}) {
  return [
    safeText(context.route, "/"),
    safeText(context.publicPath, "/"),
    Boolean(context.authenticated) ? "auth" : "anon",
    safeText(context.user?.username || context.user?.email || "", ""),
    safeText(context.user?.role || context.user?.rol || context.role || "", ""),
  ].join("|");
}

function shouldSkipUiSync(context = {}) {
  const current =
    safeNow();

  const key =
    getUiSyncDedupeKey(context);

  if (
    key === lastUiSyncKey &&
    current - lastUiSyncAt < UI_SYNC_DEDUPE_MS
  ) {
    return true;
  }

  lastUiSyncKey =
    key;

  lastUiSyncAt =
    current;

  return false;
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
  force = false,
} = {}) {
  const publicPath =
    resolvePublicPath(
      AppCore,
      Router,
      payload
    );

  const route =
    resolveCanonicalPath(
      AppCore,
      Router,
      payload
    );

  const user =
    AppCore?.state?.user ||
    getAuthUser(Auth) ||
    null;

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

    route,
    publicPath,

    user,

    authenticated:
      Boolean(
        AppCore?.state?.authenticated ||
          getAuthStatus(Auth)
      ),
  };

  if (
    force !== true &&
    shouldSkipUiSync(context)
  ) {
    return true;
  }

  let ok = false;
  let usedInjectedSync = false;

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
    Fallback ligero directo si no se inyecta syncUserUI.
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

  /*
    Importante:
    NO emitir app:user-ui:sync desde AppEvents.
    Ese evento lo emite src/app/ui.js.
  */
  if (emit) {
    safeEmit(
      AppCore,
      EVENT_NAMES.appEventsUiSynced,
      {
        source:
          "app:events",

        reason:
          context.reason,

        route:
          redactSensitiveText(context.route),

        publicPath:
          redactSensitiveText(context.publicPath),

        authenticated:
          context.authenticated,

        injected:
          usedInjectedSync,

        sidebar:
          sidebarResult,

        topbar:
          topbarResult,

        ok,
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

function rememberBoundEvent(eventName = "") {
  const clean =
    safeText(eventName, "");

  if (
    clean &&
    !eventState.boundEvents.includes(clean)
  ) {
    eventState.boundEvents.push(clean);
  }
}

function makeBoundKey(eventName = "", label = "") {
  return [
    safeText(eventName, ""),
    safeText(label, "default"),
  ].join("::");
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

    rememberBoundEvent(eventName);

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

    rememberBoundEvent(eventName);

    return true;
  } catch {}

  return false;
}

function bindAppEvent({
  AppCore,
  eventName,
  label = "",
  handler,
  windowFallback = true,
  options = false,
}) {
  const cleanEventName =
    safeText(eventName, "");

  const cleanLabel =
    safeText(label, cleanEventName || "event");

  if (
    !cleanEventName ||
    !isFunction(handler)
  ) {
    return false;
  }

  const boundKey =
    makeBoundKey(
      cleanEventName,
      cleanLabel
    );

  if (boundEventKeys.has(boundKey)) {
    return false;
  }

  const wrappedHandler = async (eventOrPayload = {}) => {
    const payload =
      getEventPayload(eventOrPayload);

    recordHandled(
      cleanEventName,
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
        cleanEventName,
        error
      );
    }
  };

  /*
    Clave anti-firebreak:
    NO usamos AppCore.cleanup.event aquí.
    Bus interno primero.
    Window solo si no hay bus.
  */
  const boundToBus =
    bindViaBus(
      AppCore,
      cleanEventName,
      wrappedHandler
    );

  if (boundToBus) {
    boundEventKeys.add(boundKey);
    return true;
  }

  if (
    windowFallback &&
    bindViaWindow(
      cleanEventName,
      wrappedHandler,
      options
    )
  ) {
    boundEventKeys.add(boundKey);
    return true;
  }

  return false;
}

function bindUniqueEventNames({
  AppCore,
  eventNames = [],
  label = "",
  handler,
  windowFallback = true,
  options = false,
}) {
  let count = 0;

  for (const eventName of unique(eventNames)) {
    if (
      bindAppEvent({
        AppCore,
        eventName,
        label:
          `${label}:${eventName}`,
        handler,
        windowFallback,
        options,
      })
    ) {
      count += 1;
    }
  }

  return count;
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

  bindUniqueEventNames({
    AppCore,
    label:
      "user-sync",
    eventNames: [
      EVENT_NAMES.appUserChange,
      EVENT_NAMES.appSessionRestored,
      EVENT_NAMES.authSessionRestored,
      EVENT_NAMES.appSessionCleared,
      EVENT_NAMES.appUiReady,
      EVENT_NAMES.appReady,
    ],
    handler: (payload, rawEvent) => {
      const eventName =
        safeText(
          rawEvent?.type ||
            payload?.event ||
            payload?.source ||
            "user-sync",
          "user-sync"
        );

      sync(
        eventName,
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
    label:
      "lang-change",
    handler: async (payload) => {
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

      langChangeInFlight = true;

      try {
        if (payload?.rerender !== false) {
          await safeRerenderCurrentRoute({
            AppCore,
            Router,
            rerenderCurrentRoute,
            reason:
              "app:lang:change",
          });
        }
      } finally {
        langChangeInFlight = false;
      }

      /*
        No forzamos safeSyncUI aquí:
        src/app/ui.js ya escucha app:lang:change.
        Así evitamos triple commit.
      */

      if (payload?.toast !== false) {
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
      }
    },
  });
}

function bindThemeEvents(context) {
  const {
    AppCore,
  } = context;

  bindUniqueEventNames({
    AppCore,
    label:
      "theme-sync",
    eventNames: [
      EVENT_NAMES.appThemeChange,
      EVENT_NAMES.onionThemeChange,
      EVENT_NAMES.legacyThemeChange,
    ],
    handler: (payload) => {
      safeSyncUI({
        ...context,
        reason:
          "theme-change",
        payload,
      });
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
    label:
      "auth-login-success",
    handler: (payload) => {
      safeSyncUI({
        ...context,
        reason:
          "auth:login:success",
        payload,
        force:
          true,
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
    label:
      "auth-logout-success",
    handler: (payload) => {
      safeSyncUI({
        ...context,
        reason:
          "auth:logout:success",
        payload,
        force:
          true,
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
    label:
      "auth-logout",
    handler: (payload) => {
      safeSyncUI({
        ...context,
        reason:
          "auth:logout",
        payload,
        force:
          true,
      });
    },
  });
}

function bindRouteChangeEvents(context) {
  const {
    AppCore,
  } = context;

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.appRouteChange,
    label:
      "app-route-change-light-sync",
    handler: (payload) => {
      /*
        Esto viene de AppCore/Router.
        No lo emitimos desde AppEvents.
        Solo hacemos sync visual ligero.
      */
      safeSyncUI({
        ...context,
        reason:
          "app:route:change",
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

    const routePatch =
      safePatchRouteState(
        AppCore,
        {
          route:
            canonicalPath,
          publicPath,
        }
      );

    const loaderPolicyApplied =
      safeApplyPostRenderLoaderPolicy({
        AppCore,
        Router,
        applyPostRenderLoaderPolicy,
        payload,
      });

    /*
      Importante:
      NO safeSyncUI aquí.
      NO app:ui:repair-request aquí.
      NO app:route:change aquí.

      router:rendered ya lo escuchan:
      - src/app/index.js
      - SidebarEvents
      - TopbarUI si aplica
    */
    safeEmit(
      AppCore,
      EVENT_NAMES.appRouteSynced,
      {
        source:
          "app:events",

        reason:
          payload?.phase ||
          payload?.reason ||
          "router:rendered",

        route:
          redactSensitiveText(canonicalPath),

        publicPath:
          redactSensitiveText(publicPath),

        routeChanged:
          Boolean(routePatch.routeChanged),

        publicChanged:
          Boolean(routePatch.publicChanged),

        changed:
          Boolean(routePatch.changed),

        loaderPolicyApplied,

        silent:
          true,
      }
    );
  };

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.routerRendered,
    label:
      "router-rendered-state-loader-sync",
    handler:
      onRouterRendered,
  });

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.routerAsyncComplete,
    label:
      "router-async-complete-state-sync",
    handler: (payload) => {
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

      /*
        Async complete solo telemetría.
        No reparamos UI ni shell aquí.
      */
      safeEmit(
        AppCore,
        EVENT_NAMES.appRouteSynced,
        {
          source:
            "app:events",

          reason:
            "router:render:async-complete",

          route:
            redactSensitiveText(canonicalPath),

          publicPath:
            redactSensitiveText(publicPath),

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
    label:
      "router-shell-state-noop",
    handler: () => {
      /*
        NOOP intencionado.

        router:shell:state puede venir de Router.repairShell().
        Si aquí sincronizamos UI, reentramos en:
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

  if (eventsBindingInFlight) {
    safeWarn(
      AppCore,
      "bindAppEvents omitido: binding ya en curso.",
      {
        scope:
          safeText(scope, DEFAULT_SCOPE),
      }
    );

    return true;
  }

  eventsBindingInFlight = true;

  const finalScope =
    safeText(scope, DEFAULT_SCOPE);

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

    applyPostRenderLoaderPolicy:
      isFunction(applyPostRenderLoaderPolicy)
        ? applyPostRenderLoaderPolicy
        : applyPostRenderLoaderPolicyBase,
  };

  try {
    bindUserEvents(context);
    bindLanguageEvents(context);
    bindThemeEvents(context);
    bindAuthEvents(context);
    bindRouteChangeEvents(context);
    bindRouterEvents(context);

    eventsBound = true;
    boundScope = finalScope;

    safeEmit(
      AppCore,
      EVENT_NAMES.appEventsBound,
      {
        version:
          APP_EVENTS_VERSION,

        scope:
          boundScope,

        at:
          safeIsoDate(),

        boundEvents:
          [...eventState.boundEvents],
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

        boundEvents:
          [...eventState.boundEvents],
      }
    );
  } catch (error) {
    for (const dispose of boundDisposers.splice(0)) {
      try {
        dispose();
      } catch {}
    }

    boundEventKeys.clear();

    eventsBound = false;
    boundScope = "";

    recordError(
      AppCore,
      EVENT_NAMES.appEventsError,
      error
    );

    return false;
  } finally {
    eventsBindingInFlight = false;
  }

  return true;
}

export function unbindAppEvents(AppCore = null) {
  for (const dispose of boundDisposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

  boundEventKeys.clear();

  eventsBound = false;
  boundScope = "";

  langChangeInFlight = false;
  eventsBindingInFlight = false;

  eventState.boundEvents = [];

  safeEmit(
    AppCore,
    EVENT_NAMES.appEventsUnbound,
    {
      version:
        APP_EVENTS_VERSION,

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
    version:
      APP_EVENTS_VERSION,

    eventsBound:
      Boolean(eventsBound),

    eventsBindingInFlight:
      Boolean(eventsBindingInFlight),

    boundScope,

    boundEvents:
      [...eventState.boundEvents],

    boundEventKeys:
      Array.from(boundEventKeys),

    boundDisposers:
      boundDisposers.length,

    langChangeInFlight:
      Boolean(langChangeInFlight),

    lastLangRenderAt,

    lastLangRenderAtIso:
      lastLangRenderAt
        ? safeIsoDate(lastLangRenderAt)
        : "",

    lastRouterRenderedKey:
      redactKey(lastRouterRenderedKey),

    lastRouterRenderedAt,

    lastRouterRenderedAtIso:
      lastRouterRenderedAt
        ? safeIsoDate(lastRouterRenderedAt)
        : "",

    lastToastKey:
      lastToastKey,

    lastToastAt,

    lastToastAtIso:
      lastToastAt
        ? safeIsoDate(lastToastAt)
        : "",

    lastUiSyncKey:
      redactKey(lastUiSyncKey),

    lastUiSyncAt,

    lastUiSyncAtIso:
      lastUiSyncAt
        ? safeIsoDate(lastUiSyncAt)
        : "",

    totalHandled:
      eventState.totalHandled,

    totalErrors:
      eventState.totalErrors,

    lastEvent:
      eventState.lastEvent,

    lastEventAt:
      eventState.lastEventAt,

    lastEventAtIso:
      eventState.lastEventAt
        ? safeIsoDate(eventState.lastEventAt)
        : "",

    lastError:
      eventState.lastError,
  };
}

export function resetAppEventsState() {
  langChangeInFlight = false;
  lastLangRenderAt = 0;

  lastRouterRenderedKey = "";
  lastRouterRenderedAt = 0;

  lastToastKey = "";
  lastToastAt = 0;

  lastUiSyncKey = "";
  lastUiSyncAt = 0;

  eventState.totalHandled = 0;
  eventState.totalErrors = 0;

  eventState.lastEvent = "";
  eventState.lastEventAt = 0;

  eventState.lastError = null;

  return getAppEventsSnapshot();
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  APP_EVENTS_VERSION,

  bindAppEvents,
  unbindAppEvents,

  getAppEventsSnapshot,
  resetAppEventsState,

  requestUiRepair:
    safeRequestUiRepair,
};
