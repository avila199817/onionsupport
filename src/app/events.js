/* =========================================================
   Onion SPA - App Events
   Archivo: /src/app/events.js

   ONION SUPPORT · APP EVENTS
   EVENT BUS · NO STORM · NO REBIND · ROUTER/AUTH/LANG SYNC · 10/10

   RESPONSABILIDADES:
   - Bindear eventos internos de la app.
   - Sincronizar UI ligera ante cambios de usuario/sesión/auth.
   - Sincronizar idioma ante app:lang:change sin doble rerender.
   - Coordinar router:rendered con route/publicPath/loader.
   - Deduplicar toasts repetidos.
   - Emitir telemetría ligera de lifecycle.
   - Tolerar AppCore parcial o cleanup incompleto.
   - Exponer snapshot de diagnóstico.

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
   - app:lang:change no rerenderiza salvo flag explícito.
   - Sin CSS inline.
   - Sin estilos inyectados.

   EXTREME MODE:
   - Binding idempotente por evento + label.
   - Window fallback sólo si no hay bus interno.
   - Redacción fuerte de tokens path/query/hash/JWT/Bearer.
   - Soporte hash-router y /@usuario para normalización local.
   - State sync silencioso y directo para no crear route-change loops.
   - UI sync ligera, deduplicada y sin rebind.
   - Router rendered sin UI sync automática.
   - Debug API en window.__ONION_APP_EVENTS__ y AppCore.AppEvents.
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

export const APP_EVENTS_VERSION =
  "15.1.0-extreme-pro-no-storm";

const EVENTS_SOURCE =
  "app:events";

const DEFAULT_SCOPE =
  APP_SCOPES?.events ||
  APP_SCOPE ||
  "app:events";

const DEFAULT_ROUTE =
  "/";

const TOAST_DEDUPE_MS =
  1200;

const LANG_RERENDER_DEDUPE_MS =
  250;

const ROUTER_RENDER_SYNC_DEDUPE_MS =
  40;

const UI_SYNC_DEDUPE_MS =
  80;

const THEME_SYNC_DEDUPE_MS =
  120;

const EVENT_EMIT_DEDUPE_MS =
  80;

const MAX_SANITIZE_DEPTH =
  7;

const MAX_SANITIZE_ARRAY =
  100;

const MAX_RECENT_EVENTS =
  80;

const EVENT_NAMES =
  Object.freeze({
    appReady:
      APP_EVENTS?.ready ||
      "app:ready",

    appUiReady:
      APP_EVENTS?.uiReady ||
      "app:ui:ready",

    appUiRepair:
      APP_EVENTS?.uiRepair ||
      "app:ui:repair",

    appUiRepairRequest:
      APP_EVENTS?.uiRepairRequest ||
      "app:ui:repair-request",

    appUserChange:
      APP_EVENTS?.userChange ||
      "app:user:change",

    /*
      Referencia legacy.
      AppEvents NO emite este evento.
      Lo emite src/app/ui.js o el coordinador superior.
    */
    appUserUiSync:
      APP_EVENTS?.userUiSync ||
      "app:user-ui:sync",

    appEventsUiSynced:
      "app:events:ui-synced",

    appRouteSynced:
      APP_EVENTS?.routeSynced ||
      "app:events:route-synced",

    appSessionRestored:
      APP_EVENTS?.sessionRestored ||
      "app:session:restored",

    appSessionCleared:
      APP_EVENTS?.sessionCleared ||
      "app:session:cleared",

    appLangChange:
      APP_EVENTS?.langChange ||
      "app:lang:change",

    appRouteChange:
      APP_EVENTS?.routeChange ||
      "app:route:change",

    appThemeChange:
      APP_EVENTS?.themeChange ||
      "app:theme:change",

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

    /*
      Deliberadamente NO usa APP_EVENTS.error si apunta a app:error.
      Así evitamos bucles con error handlers globales.
    */
    appEventsError:
      "app:events:error",

    authSessionRestored:
      AUTH_EVENTS?.sessionRestored ||
      "auth:session:restored",

    authLoginSuccess:
      AUTH_EVENTS?.loginSuccess ||
      "auth:login:success",

    authLogout:
      AUTH_EVENTS?.logout ||
      "auth:logout",

    authLogoutSuccess:
      AUTH_EVENTS?.logoutSuccess ||
      "auth:logout:success",

    routerRendered:
      ROUTER_EVENTS?.rendered ||
      "router:rendered",

    routerAsyncComplete:
      ROUTER_EVENTS?.asyncComplete ||
      "router:render:async-complete",

    routerShellState:
      ROUTER_EVENTS?.shellState ||
      "router:shell:state",
  });

/*
  Métodos permitidos.
  Prohibidos aquí:
  - repair
  - rebind
  - bindEvents
  - rebindEvents
  - init
  - boot
  - mount
  - start
*/
const SIDEBAR_LIGHT_USER_METHODS =
  Object.freeze([
    "renderUser",
    "refreshUser",
    "updateUser",
    "syncUser",
  ]);

const SIDEBAR_LIGHT_VISUAL_METHODS =
  Object.freeze([
    "applyRoleVisibility",
    "syncRouteAndIndicator",
    "syncIndicator",
    "updateToggleLabel",
  ]);

const SIDEBAR_LIGHT_FALLBACK_METHODS =
  Object.freeze([
    "refresh",
    "sync",
  ]);

const TOPBAR_LIGHT_USER_METHODS =
  Object.freeze([
    "renderUser",
    "refreshUser",
    "updateUser",
    "syncUser",
  ]);

const TOPBAR_LIGHT_VISUAL_METHODS =
  Object.freeze([
    "syncRoute",
    "updateRoute",
    "syncBreadcrumb",
    "updateBreadcrumb",
  ]);

const TOPBAR_LIGHT_FALLBACK_METHODS =
  Object.freeze([
    "refresh",
    "sync",
  ]);

const SENSITIVE_QUERY_PARAM_NAMES =
  Object.freeze([
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
    "authorization",
    "jwt",
    "session",
    "sid",
  ]);

const TOKEN_ROUTE_PATHS =
  Object.freeze([
    "/activate-account",
    "/activate",
    "/activation",
    "/account/activate",
    "/activate/first-user",
    "/reset-password/confirm",
    "/reset-password-confirm",
    "/password-reset/confirm",
    "/password-reset-confirm",
  ]);

const SENSITIVE_OBJECT_KEY_RE =
  /token|secret|password|authorization|credential|jwt|bearer|otp|code|session|refresh/i;

const PUBLIC_USERNAME_RE =
  /^@[A-Za-z0-9._-]{1,80}$/;

/* =========================================================
   INTERNAL STATE
========================================================= */

let eventsBound =
  false;

let eventsBindingInFlight =
  false;

let boundScope =
  "";

let langChangeInFlight =
  false;

let lastLangRenderAt =
  0;

let lastRouterRenderedKey =
  "";

let lastRouterRenderedAt =
  0;

let lastToastKey =
  "";

let lastToastAt =
  0;

let lastUiSyncKey =
  "";

let lastUiSyncAt =
  0;

let lastThemeSyncKey =
  "";

let lastThemeSyncAt =
  0;

let lastEmitKey =
  "";

let lastEmitAt =
  0;

let debugApiInstalled =
  false;

const boundDisposers =
  [];

const boundEventKeys =
  new Set();

const eventState = {
  totalHandled:
    0,

  totalErrors:
    0,

  lastEvent:
    "",

  lastEventAt:
    0,

  lastError:
    null,

  boundEvents:
    [],

  recent:
    [],
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
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isObjectLike(value) {
  return (
    value !== null &&
    (
      typeof value === "object" ||
      typeof value === "function"
    )
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
  const output =
    [];

  const seen =
    new Set();

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

function isExtensibleTarget(value) {
  try {
    return (
      isObjectLike(value) &&
      Object.isExtensible(value)
    );
  } catch {}

  return false;
}

function safeDefineValue(target, key, value) {
  if (
    !target ||
    !key ||
    !isExtensibleTarget(target)
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        configurable:
          true,
        enumerable:
          false,
        writable:
          true,
      }
    );

    return true;
  } catch {}

  try {
    target[key] =
      value;

    return true;
  } catch {}

  return false;
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
   REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function redactSensitiveText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
      const escaped =
        escapeRegExp(name);

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    }

    for (const path of TOKEN_ROUTE_PATHS) {
      output =
        output.replace(
          new RegExp(`(${escapeRegExp(path)}\\/)([^/?#\\s]+)`, "gi"),
          "$1***"
        );
    }

    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
        "$1$2***"
      );

    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function isDomNodeLike(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  try {
    return Boolean(
      typeof Node !== "undefined" &&
        value instanceof Node
    );
  } catch {}

  try {
    return Boolean(
      value.nodeType &&
        value.nodeName
    );
  } catch {}

  return false;
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
    ensureObject(
      error?.error ||
        error?.reason ||
        error
    );

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

function sanitizePayload(value, depth = 0) {
  if (depth > MAX_SANITIZE_DEPTH) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (isDomNodeLike(value)) {
    return {
      node:
        safeText(value.nodeName, "Node"),

      id:
        safeText(value.id, ""),

      className:
        safeText(
          value.className?.baseVal ||
            value.className,
          ""
        ),
    };
  }

  if (value instanceof Error) {
    return normalizeError(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SANITIZE_ARRAY)
      .map((item) =>
        sanitizePayload(
          item,
          depth + 1
        )
      );
  }

  if (value instanceof Map) {
    return {
      type:
        "Map",

      size:
        value.size,
    };
  }

  if (value instanceof Set) {
    return {
      type:
        "Set",

      size:
        value.size,
    };
  }

  if (isObject(value)) {
    const output =
      {};

    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_OBJECT_KEY_RE.test(key)) {
        if (
          item === null ||
          item === undefined ||
          item === "" ||
          typeof item === "boolean"
        ) {
          output[key] =
            item;
        } else {
          output[key] =
            "***";
        }

        continue;
      }

      output[key] =
        sanitizePayload(
          item,
          depth + 1
        );
    }

    return output;
  }

  return String(value);
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
  const safeArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  try {
    AppCore?.utils?.log?.(
      "[AppEvents]",
      ...safeArgs
    );

    return;
  } catch {}

  try {
    console.log(
      "[AppEvents]",
      ...safeArgs
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  const safeArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  let emittedByCore =
    false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[AppEvents]",
        ...safeArgs
      );

      emittedByCore =
        true;
    }
  } catch {
    emittedByCore =
      false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.warn(
      "[AppEvents]",
      ...safeArgs
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  const safeArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  let emittedByCore =
    false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error(
        "[AppEvents]",
        ...safeArgs
      );

      emittedByCore =
        true;
    }
  } catch {
    emittedByCore =
      false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.error(
      "[AppEvents]",
      ...safeArgs
    );
  } catch {}
}

function safeCreateCustomEvent(eventName, payload = {}) {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(
        eventName,
        {
          detail:
            payload,
        }
      );
    }
  } catch {}

  try {
    const event =
      document.createEvent("CustomEvent");

    event.initCustomEvent(
      eventName,
      false,
      false,
      payload
    );

    return event;
  } catch {
    return null;
  }
}

function safeWindowDispatch(eventName, payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    const event =
      safeCreateCustomEvent(
        eventName,
        payload
      );

    if (!event) {
      return false;
    }

    window.dispatchEvent(event);

    return true;
  } catch {}

  return false;
}

function shouldDedupeEmit(eventName = "", payload = {}, force = false) {
  if (force) {
    return false;
  }

  const key =
    [
      safeText(eventName, ""),
      safeText(payload?.reason || payload?.phase || "", ""),
      safeText(payload?.route || payload?.canonicalPath || "", ""),
      safeText(payload?.publicPath || "", ""),
      payload?.ok === false ? "fail" : "ok",
    ].join("|");

  const now =
    safeNow();

  if (
    key === lastEmitKey &&
    now - lastEmitAt < EVENT_EMIT_DEDUPE_MS
  ) {
    return true;
  }

  lastEmitKey =
    key;

  lastEmitAt =
    now;

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

  if (
    opts.dedupe !== false &&
    shouldDedupeEmit(
      cleanEventName,
      payload,
      opts.force === true
    )
  ) {
    return false;
  }

  const cleanPayload =
    sanitizePayload({
      version:
        APP_EVENTS_VERSION,

      source:
        EVENTS_SOURCE,

      ...ensureObject(payload),
    });

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        cleanEventName,
        cleanPayload
      );

      busEmitted =
        true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${cleanEventName}") falló.`,
      error
    );
  }

  /*
    Anti-storm:
    si hay bus interno, NO duplicamos en window.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return (
      safeWindowDispatch(
        cleanEventName,
        cleanPayload
      ) ||
      busEmitted
    );
  }

  return busEmitted;
}

function pushRecent(event = {}) {
  const data =
    sanitizePayload(event);

  eventState.recent.unshift(data);

  if (eventState.recent.length > MAX_RECENT_EVENTS) {
    eventState.recent =
      eventState.recent.slice(0, MAX_RECENT_EVENTS);
  }
}

function recordHandled(eventName = "", payload = {}) {
  eventState.totalHandled += 1;
  eventState.lastEvent = safeText(eventName, "");
  eventState.lastEventAt = safeNow();

  const handled =
    createHandledPayload(
      eventName,
      payload
    );

  pushRecent(handled);

  return handled;
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

  pushRecent({
    event:
      "error",

    payload:
      eventState.lastError,

    at:
      safeIsoDate(),

    atMs:
      safeNow(),
  });

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
   STATE
========================================================= */

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
    Preferimos mutación directa de state.
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

          silent:
            true,

          source:
            "app:events:silent-state-sync",
        }
      );

      return true;
    }
  } catch {}

  return false;
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

  const typedMethods =
    cleanType === "warning"
      ? [
          "warning",
          "warn",
          "warningToast",
        ]
      : [
          cleanType,
          `${cleanType}Toast`,
        ];

  for (const methodName of typedMethods) {
    try {
      if (isFunction(Toast?.[methodName])) {
        return Toast[methodName](
          cleanMessage,
          payload
        );
      }
    } catch {}
  }

  try {
    if (isFunction(Toast?.showToast)) {
      return Toast.showToast(
        cleanMessage,
        cleanType,
        payload
      );
    }
  } catch {}

  try {
    if (isFunction(Toast?.show)) {
      return Toast.show(
        cleanMessage,
        cleanType,
        payload
      );
    }
  } catch {}

  try {
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
    redactSensitiveText(`${cleanType}:${title}:${cleanMessage}`);

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

function normalizeLang(value = "", fallback = "es") {
  const raw =
    safeText(value, fallback)
      .toLowerCase()
      .replace(/_/g, "-")
      .trim();

  const first =
    raw.split("-")[0] || raw;

  if (
    first === "spa" ||
    first === "spanish" ||
    first === "castellano"
  ) {
    return "es";
  }

  if (
    first === "eng" ||
    first === "english"
  ) {
    return "en";
  }

  if (
    first === "cat" ||
    first === "catalan" ||
    first === "català" ||
    first === "catalán"
  ) {
    return "ca";
  }

  return first || fallback;
}

function safeSetDocumentLang(lang = "es") {
  const cleanLang =
    normalizeLang(lang, "es");

  if (!isBrowser()) {
    return false;
  }

  try {
    document.documentElement.setAttribute(
      "lang",
      cleanLang
    );

    document.documentElement.lang =
      cleanLang;

    return true;
  } catch {}

  return false;
}

function resolveLang(AppCore, I18n, payload = {}) {
  return normalizeLang(
    safeText(payload?.lang, "") ||
      safeText(payload?.language, "") ||
      safeText(payload?.locale, "") ||
      safeText(I18n?.getLang?.(), "") ||
      safeText(I18n?.getLanguage?.(), "") ||
      safeText(I18n?.lang, "") ||
      safeText(I18n?.language, "") ||
      safeText(AppCore?.state?.lang, "") ||
      "es",
    "es"
  );
}

function setI18nLangSoft(I18n, lang = "es") {
  const cleanLang =
    normalizeLang(lang, "es");

  const methods = [
    "setLang",
    "setLanguage",
    "changeLang",
    "changeLanguage",
    "use",
  ];

  for (const methodName of methods) {
    try {
      if (isFunction(I18n?.[methodName])) {
        const result =
          I18n[methodName](
            cleanLang,
            {
              silent:
                true,

              source:
                EVENTS_SOURCE,
            }
          );

        if (
          result &&
          isFunction(result.catch)
        ) {
          result.catch(() => {});
        }

        return true;
      }
    } catch {}
  }

  try {
    if (
      I18n &&
      typeof I18n === "object"
    ) {
      I18n.lang =
        cleanLang;

      return true;
    }
  } catch {}

  return false;
}

function shouldEventsRerenderOnLangChange(payload = {}) {
  /*
    src/app/i18n.js es el controlador principal de rerender por idioma.
    AppEvents sólo rerenderiza si se pide explícitamente.
  */
  return Boolean(
    payload?.rerenderByEvents === true ||
      payload?.appEventsRerender === true ||
      payload?.forceEventsRerender === true
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
          AppCore,
          Router,
          reason,
          source:
            EVENTS_SOURCE,
        })
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "rerenderCurrentRoute() inyectado falló.",
      error
    );
  }

  const publicPath =
    resolvePublicPath(
      AppCore,
      Router,
      {}
    );

  const canonicalPath =
    resolveCanonicalPath(
      AppCore,
      Router,
      {
        publicPath,
      }
    );

  try {
    if (isFunction(Router?.rerenderCurrentRoute)) {
      await Promise.resolve(
        Router.rerenderCurrentRoute({
          reason,
          source:
            EVENTS_SOURCE,
          force:
            true,
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
          canonicalPath,
          {
            force:
              true,

            reason,
            source:
              EVENTS_SOURCE,

            preservePublicPath:
              true,

            publicPath,
            canonicalPath,

            i18nRerender:
              true,

            skipHistory:
              true,

            replaceState:
              false,
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
            source:
              EVENTS_SOURCE,

            preservePublicPath:
              true,

            i18nRerender:
              true,
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

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizePathnameOnly(pathname = "/") {
  let value =
    safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value =
      "/";
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  const output =
    [];

  for (const segment of value.split("/").filter(Boolean)) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      output.pop();
      continue;
    }

    output.push(segment);
  }

  value =
    `/${output.join("/")}`;

  if (!value) {
    value =
      "/";
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function normalizeSearch(search = "") {
  const value =
    safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return normalizeLocalFullPath(
      raw.replace(/^#!\/?/, "/")
    );
  }

  return normalizeLocalFullPath(
    raw.replace(/^#\/?/, "/")
  );
}

function splitLocalFullPath(value = "/") {
  const raw =
    safeText(value, "/");

  if (isHashRouterPath(raw)) {
    return splitLocalFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname:
      normalizePathnameOnly(pathname),

    search:
      normalizeSearch(search),

    hash:
      normalizeHash(hash),
  };
}

function normalizeLocalFullPath(path = "/") {
  const raw =
    safeText(path, "/");

  if (!raw) {
    return "/";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (parsed.origin !== getBaseOrigin()) {
        return "/";
      }

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeHashRouterPath(parsed.hash);
      }

      return normalizeLocalFullPath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } =
    splitLocalFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function localNormalizePublicPath(path = "/") {
  return normalizeLocalFullPath(path || "/");
}

function stripPublicUsernamePrefix(pathname = "/") {
  const clean =
    normalizePathnameOnly(pathname || "/");

  const segments =
    clean
      .split("/")
      .filter(Boolean);

  if (
    segments.length > 0 &&
    PUBLIC_USERNAME_RE.test(segments[0])
  ) {
    const rest =
      segments
        .slice(1)
        .join("/");

    return rest
      ? normalizePathnameOnly(`/${rest}`)
      : "/";
  }

  return clean;
}

function localNormalizeCanonicalPath(path = "/") {
  const publicPath =
    localNormalizePublicPath(path);

  const {
    pathname,
  } =
    splitLocalFullPath(publicPath);

  return stripPublicUsernamePrefix(pathname) || "/";
}

function normalizePublicSafe(AppCore, path = "/") {
  const raw =
    safeText(path, "/") || "/";

  try {
    const value =
      normalizePublicPath(
        AppCore,
        raw
      );

    if (value) {
      return value;
    }
  } catch {}

  return localNormalizePublicPath(raw);
}

function normalizeCanonicalSafe(AppCore, path = "/") {
  const raw =
    safeText(path, "/") || "/";

  try {
    const value =
      normalizeCanonicalPath(
        AppCore,
        raw
      );

    if (value) {
      return value;
    }
  } catch {}

  return localNormalizeCanonicalPath(raw);
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

  const route =
    ensureObject(data.route);

  const resolved =
    ensureObject(data.resolved);

  let helperPublic =
    "";

  try {
    helperPublic =
      safeText(
        getCurrentPublicPath?.(AppCore, Router),
        ""
      );
  } catch {}

  const candidate =
    safeText(data.publicPath, "") ||
    safeText(data.currentPublicPath, "") ||
    safeText(data.requestedPath, "") ||
    safeText(data.href, "") ||
    safeText(data.to, "") ||
    safeText(data.path, "") ||
    safeText(route.publicPath, "") ||
    safeText(route.path, "") ||
    safeText(resolved.publicPath, "") ||
    safeText(AppCore?.state?.publicPath, "") ||
    safeText(callRouterGetter(Router, "getCurrentPublicPath"), "") ||
    helperPublic ||
    "/";

  return normalizePublicSafe(
    AppCore,
    candidate
  );
}

function resolveCanonicalPath(AppCore, Router, payload = {}) {
  const data =
    ensureObject(payload);

  const route =
    ensureObject(data.route);

  const resolved =
    ensureObject(data.resolved);

  let helperCanonical =
    "";

  try {
    helperCanonical =
      safeText(
        getCurrentCanonicalPath?.(AppCore, Router),
        ""
      );
  } catch {}

  const candidate =
    safeText(data.canonicalPath, "") ||
    safeText(data.currentCanonicalPath, "") ||
    safeText(route.canonicalPath, "") ||
    safeText(resolved.canonicalPath, "") ||
    safeText(callRouterGetter(Router, "getCurrentCanonicalPath"), "") ||
    helperCanonical ||
    safeText(AppCore?.state?.route, "") ||
    safeText(route.path, "") ||
    safeText(data.path, "") ||
    resolvePublicPath(AppCore, Router, data) ||
    "/";

  return normalizeCanonicalSafe(
    AppCore,
    candidate
  );
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

  const canonicalChanged =
    safeText(state.canonicalPath, "") !== cleanRoute;

  const publicChanged =
    safeText(state.publicPath, "") !== cleanPublicPath;

  if (
    !routeChanged &&
    !canonicalChanged &&
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

  const patch =
    {};

  if (
    routeChanged ||
    canonicalChanged
  ) {
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

    routeChanged:
      Boolean(routeChanged || canonicalChanged),

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
    `${redactSensitiveText(route)}|${redactSensitiveText(publicPath)}`;

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
  const methods =
    [];

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

    let called =
      false;

    try {
      fn.call(
        target,
        context.reason || context,
        context
      );

      called =
        true;
    } catch {
      try {
        fn.call(
          target,
          context
        );

        called =
          true;
      } catch {
        try {
          fn.call(target);
          called =
            true;
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
    safeText(context.user?.id || context.user?.userId || "", ""),
    safeText(context.user?.username || context.user?.email || "", ""),
    safeText(context.user?.role || context.user?.rol || context.role || "", ""),
  ].join("|");
}

function shouldSkipUiSync(context = {}, force = false) {
  if (force === true) {
    return false;
  }

  const current =
    safeNow();

  const key =
    redactSensitiveText(
      getUiSyncDedupeKey(context)
    );

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

async function safeSyncUI({
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
    AppCore?.state?.currentUser ||
    AppCore?.state?.sessionUser ||
    AppCore?.state?.authUser ||
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

    role:
      AppCore?.state?.role ||
      user?.role ||
      user?.rol ||
      null,

    authenticated:
      Boolean(
        AppCore?.state?.authenticated ||
          getAuthStatus(Auth)
      ),
  };

  if (shouldSkipUiSync(context, force)) {
    return true;
  }

  let ok =
    false;

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
    Firma moderna. Una sola llamada.
    AppEvents no emite app:user-ui:sync directamente.
  */
  if (isFunction(syncUserUI)) {
    try {
      await Promise.resolve(
        syncUserUI({
          ...context,

          rebind:
            false,

          hardRepair:
            false,

          force:
            true,
        })
      );

      usedInjectedSync =
        true;

      ok =
        true;
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

  if (emit) {
    safeEmit(
      AppCore,
      EVENT_NAMES.appEventsUiSynced,
      {
        source:
          EVENTS_SOURCE,

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
    source:
      EVENTS_SOURCE,

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

function normalizeDisposer(candidate) {
  if (isFunction(candidate)) {
    return candidate;
  }

  if (isFunction(candidate?.dispose)) {
    return () => {
      try {
        candidate.dispose();
      } catch {}
    };
  }

  if (isFunction(candidate?.off)) {
    return () => {
      try {
        candidate.off();
      } catch {}
    };
  }

  if (isFunction(candidate?.remove)) {
    return () => {
      try {
        candidate.remove();
      } catch {}
    };
  }

  return null;
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

    const normalizedDisposer =
      normalizeDisposer(maybeOff);

    if (normalizedDisposer) {
      rememberDisposer(normalizedDisposer);
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

  const wrappedHandler =
    async (eventOrPayload = {}) => {
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
            {
              eventName:
                cleanEventName,

              label:
                cleanLabel,

              raw:
                eventOrPayload,
            }
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
    NO usamos AppCore.cleanup.event aquí.
    Bus interno primero.
    Window sólo si no hay bus.
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
  let count =
    0;

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
  } =
    context;

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

    handler:
      async (payload, meta) => {
        await safeSyncUI({
          ...context,

          reason:
            meta?.eventName ||
            payload?.reason ||
            payload?.source ||
            "user-sync",

          payload,
        });
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
  } =
    context;

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.appLangChange,

    label:
      "lang-change",

    handler:
      async (payload) => {
        const lang =
          resolveLang(
            AppCore,
            I18n,
            payload
          );

        safeSetDocumentLang(lang);

        setI18nLangSoft(
          I18n,
          lang
        );

        setStateSilent(
          AppCore,
          {
            lang,
            language:
              lang,
            locale:
              lang,
          }
        );

        if (
          langChangeInFlight ||
          !shouldEventsRerenderOnLangChange(payload)
        ) {
          if (payload?.toast === true) {
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
              "app:lang:change:events-rerender",
          });
        } finally {
          langChangeInFlight =
            false;
        }

        if (payload?.toast === true) {
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

function shouldSkipThemeSync(payload = {}) {
  const key =
    [
      safeText(payload?.theme, ""),
      safeText(payload?.mode, ""),
      safeText(payload?.appearance, ""),
      safeText(payload?.value, ""),
    ].join("|");

  const current =
    safeNow();

  if (
    key &&
    key === lastThemeSyncKey &&
    current - lastThemeSyncAt < THEME_SYNC_DEDUPE_MS
  ) {
    return true;
  }

  lastThemeSyncKey =
    key;

  lastThemeSyncAt =
    current;

  return false;
}

function bindThemeEvents(context) {
  const {
    AppCore,
  } =
    context;

  bindUniqueEventNames({
    AppCore,
    label:
      "theme-sync",

    eventNames: [
      EVENT_NAMES.appThemeChange,
      EVENT_NAMES.onionThemeChange,
      EVENT_NAMES.legacyThemeChange,
    ],

    handler:
      async (payload) => {
        if (shouldSkipThemeSync(payload)) {
          return;
        }

        const theme =
          safeText(
            payload?.theme ||
              payload?.mode ||
              payload?.appearance ||
              payload?.value ||
              "",
            ""
          );

        if (theme) {
          setStateSilent(
            AppCore,
            {
              theme,
              mode:
                payload?.mode || theme,
              appearance:
                payload?.appearance ||
                payload?.mode ||
                theme,
            }
          );
        }

        await safeSyncUI({
          ...context,
          reason:
            "theme-change",
          payload,
          force:
            true,
        });
      },
  });
}

function bindAuthEvents(context) {
  const {
    AppCore,
    Toast,
  } =
    context;

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.authLoginSuccess,

    label:
      "auth-login-success",

    handler:
      async (payload) => {
        await safeSyncUI({
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

    handler:
      async (payload) => {
        await safeSyncUI({
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

    handler:
      async (payload) => {
        await safeSyncUI({
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
  } =
    context;

  bindAppEvent({
    AppCore,
    eventName:
      EVENT_NAMES.appRouteChange,

    label:
      "app-route-change-light-sync",

    handler:
      async (payload) => {
        /*
          Esto viene de AppCore/Router.
          No lo emitimos desde AppEvents.
          Sólo hacemos sync visual ligero.
        */
        await safeSyncUI({
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
  } =
    context;

  const onRouterRendered =
    (payload = {}) => {
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
      */
      safeEmit(
        AppCore,
        EVENT_NAMES.appRouteSynced,
        {
          source:
            EVENTS_SOURCE,

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
      "router-async-complete-telemetry",

    handler:
      (payload) => {
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
          Async complete sólo telemetría.
          No reparamos UI ni shell aquí.
        */
        safeEmit(
          AppCore,
          EVENT_NAMES.appRouteSynced,
          {
            source:
              EVENTS_SOURCE,

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

    handler:
      () => {
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
   DEBUG API
========================================================= */

function exposeDebugApi(AppCore = null) {
  if (debugApiInstalled) {
    try {
      if (
        isBrowser() &&
        window.__ONION_APP_EVENTS__
      ) {
        return window.__ONION_APP_EVENTS__;
      }
    } catch {}
  }

  const api = {
    version:
      APP_EVENTS_VERSION,

    getSnapshot:
      getAppEventsSnapshot,

    reset:
      resetAppEventsState,

    unbind:
      () =>
        unbindAppEvents(AppCore),

    requestUiRepair:
      (reason = "debug", payload = {}) =>
        safeRequestUiRepair(
          AppCore,
          reason,
          payload
        ),
  };

  try {
    if (isBrowser()) {
      window.__ONION_APP_EVENTS__ =
        api;
    }
  } catch {}

  try {
    safeDefineValue(
      AppCore,
      "AppEvents",
      api
    );
  } catch {}

  debugApiInstalled =
    true;

  return api;
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

  eventsBindingInFlight =
    true;

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

    eventsBound =
      true;

    boundScope =
      finalScope;

    exposeDebugApi(AppCore);

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

    eventsBound =
      false;

    boundScope =
      "";

    recordError(
      AppCore,
      EVENT_NAMES.appEventsError,
      error
    );

    return false;
  } finally {
    eventsBindingInFlight =
      false;
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

  eventsBound =
    false;

  boundScope =
    "";

  langChangeInFlight =
    false;

  eventsBindingInFlight =
    false;

  eventState.boundEvents =
    [];

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
  return sanitizePayload({
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
      redactKey(lastToastKey),

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

    lastThemeSyncKey:
      redactKey(lastThemeSyncKey),

    lastThemeSyncAt,

    lastThemeSyncAtIso:
      lastThemeSyncAt
        ? safeIsoDate(lastThemeSyncAt)
        : "",

    lastEmitKey:
      redactKey(lastEmitKey),

    lastEmitAt,

    lastEmitAtIso:
      lastEmitAt
        ? safeIsoDate(lastEmitAt)
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

    recent:
      eventState.recent.slice(0, MAX_RECENT_EVENTS),

    debugApiInstalled:
      Boolean(debugApiInstalled),
  });
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

  lastUiSyncKey =
    "";

  lastUiSyncAt =
    0;

  lastThemeSyncKey =
    "";

  lastThemeSyncAt =
    0;

  lastEmitKey =
    "";

  lastEmitAt =
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

  eventState.recent =
    [];

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
