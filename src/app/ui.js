/* =========================================================
   Onion SPA - App UI Systems
   Archivo: /src/app/ui.js

   ONION SUPPORT · APP UI SYSTEMS
   SIDEBAR/TOPBAR/TOAST · LIGHT SYNC · NO EVENT STORM · 10/10

   RESPONSABILIDADES:
   - Inicializar sistemas UI compartidos una sola vez.
   - Registrar módulos UI en AppCore sin duplicados.
   - Sincronizar UI global de usuario/avatar/rol/ruta.
   - Refresco UI ligero ante cambios de idioma/tema/auth/ruta.
   - Bridge global Toast robusto.
   - Escuchar repair request ligero sin loops.
   - Exponer snapshots de diagnóstico.
   - Evitar tormentas de eventos y rebinds.

   REGLA DE ORO:
   - initUISystems() puede llamar init()/boot()/mount()/start() una vez.
   - syncUserUI() solo sincroniza datos/rol/ruta.
   - repairUISystems() por defecto solo hace sync ligero.
   - rebind/hardRepair solo si se pasa explícitamente.
   - AppUI sí puede emitir app:user-ui:sync.
   - AppUI NO debe emitir app:ui:repair-request desde repairUISystems().
   - AppUI NO debe escuchar app:user-ui:sync.
   - Sin CSS inline.
   - Sin estilos inyectados.

   EXTREME MODE:
   - Registry idempotente por módulo canónico.
   - Aliases sin register() ruidoso.
   - Protección anti-recursión y dedupe por firma.
   - Queue de sync única.
   - Fallbacks legacy para Sidebar/Topbar/Toast.
   - Snapshot profundo pero sanitizado.
   - Eventos internos deduplicados y limpiables.
========================================================= */

import {
  registerModule,
} from "./helpers.js";

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

export const UI_VERSION = "16.0.0-extreme-pro";
const UI_SOURCE = "app:ui";

const DEFAULT_SCOPE =
  APP_SCOPES?.ui ||
  APP_SCOPE ||
  "app:ui";

const UI_EVENTS = Object.freeze({
  initStart:
    "app:ui:init:start",

  initSuccess:
    "app:ui:init:success",

  initError:
    "app:ui:init:error",

  ready:
    APP_EVENTS?.uiReady ||
    "app:ui:ready",

  repair:
    APP_EVENTS?.uiRepair ||
    "app:ui:repair",

  repairRequest:
    APP_EVENTS?.uiRepairRequest ||
    "app:ui:repair-request",

  repairDone:
    "app:ui:repair:done",

  repairSkipped:
    "app:ui:repair:skipped",

  userSync:
    APP_EVENTS?.userUiSync ||
    "app:user-ui:sync",

  userSyncStart:
    "app:user-ui:sync:start",

  userSyncDone:
    "app:user-ui:sync:done",

  userSyncError:
    "app:user-ui:sync:error",

  langChange:
    APP_EVENTS?.langChange ||
    "app:lang:change",

  themeChange:
    APP_EVENTS?.themeChange ||
    "app:theme:change",

  toastBridgeReady:
    "app:ui:toast-bridge:ready",

  moduleRegistered:
    "app:ui:module:registered",

  moduleInit:
    "app:ui:module:init",

  moduleSkipped:
    "app:ui:module:skipped",

  moduleError:
    "app:ui:module:error",

  runtimeEventsBound:
    "app:ui:runtime-events:bound",

  runtimeEventsUnbound:
    "app:ui:runtime-events:unbound",

  debugReady:
    "app:ui:debug:ready",

  routeChange:
    APP_EVENTS?.routeChange ||
    "app:route:change",

  routerRendered:
    ROUTER_EVENTS?.rendered ||
    "router:rendered",

  routerAsyncComplete:
    ROUTER_EVENTS?.asyncComplete ||
    "router:render:async-complete",

  sessionRestored:
    APP_EVENTS?.sessionRestored ||
    "app:session:restored",

  sessionCleared:
    APP_EVENTS?.sessionCleared ||
    "app:session:cleared",

  userChange:
    APP_EVENTS?.userChange ||
    "app:user:change",

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
});

const UI_MODULES = Object.freeze({
  toast: "toast",
  sidebar: "sidebar",
  topbar: "topbar",
});

const UI_MODULE_ALIASES = Object.freeze({
  toast: Object.freeze([
    "toast",
    "Toast",
    "toastModule",
    "notifications",
  ]),

  sidebar: Object.freeze([
    "sidebar",
    "sidebarUI",
    "SidebarUI",
    "Sidebar",
  ]),

  topbar: Object.freeze([
    "topbar",
    "topbarUI",
    "TopbarUI",
    "Topbar",
  ]),
});

const UI_INIT_METHODS = Object.freeze([
  "init",
  "boot",
  "mount",
  "start",
]);

/*
  Métodos ligeros permitidos.
  No incluir aquí:
  - repair
  - render
  - rebind
  - bindEvents
  - bind
*/
const SIDEBAR_USER_LIGHT_METHODS = Object.freeze([
  "renderUser",
  "refreshUser",
  "updateUser",
  "syncUser",
]);

const SIDEBAR_VISUAL_LIGHT_METHODS = Object.freeze([
  "applyRoleVisibility",
  "syncRouteAndIndicator",
  "syncIndicator",
  "updateToggleLabel",
]);

const SIDEBAR_FALLBACK_LIGHT_METHODS = Object.freeze([
  "refresh",
  "sync",
]);

const TOPBAR_USER_LIGHT_METHODS = Object.freeze([
  "renderUser",
  "refreshUser",
  "updateUser",
  "syncUser",
]);

const TOPBAR_VISUAL_LIGHT_METHODS = Object.freeze([
  "syncRoute",
  "updateRoute",
  "syncBreadcrumb",
  "updateBreadcrumb",
]);

const TOPBAR_FALLBACK_LIGHT_METHODS = Object.freeze([
  "refresh",
  "sync",
]);

const UI_HARD_REPAIR_METHODS = Object.freeze([
  "repair",
  "refresh",
  "sync",
]);

const UI_REBIND_METHODS = Object.freeze([
  "rebind",
  "rebindEvents",
  "bindEvents",
  "bind",
]);

const TOAST_TYPES = Object.freeze([
  "success",
  "error",
  "warning",
  "warn",
  "info",
  "loading",
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
  "authorization",
  "jwt",
  "session",
  "sid",
]);

const SYNC_QUEUE_DELAY_MS = 0;
const SYNC_DEDUPE_MS = 80;
const REPAIR_REQUEST_DEDUPE_MS = 140;
const LANG_SYNC_DEDUPE_MS = 120;
const ROUTE_SYNC_DEDUPE_MS = 80;
const THEME_SYNC_DEDUPE_MS = 120;
const EMIT_DEDUPE_MS = 60;
const MAX_RECENT_EVENTS = 50;
const MAX_SANITIZE_DEPTH = 6;
const MAX_SANITIZE_ARRAY = 80;

/* =========================================================
   INTERNAL STATE
========================================================= */

let syncingUserUI = false;
let syncQueued = false;
let queuedSyncDeps = null;

let initInFlight = false;
let uiInitialized = false;

let languageSyncBound = false;
let repairSyncBound = false;
let routeSyncBound = false;
let sessionSyncBound = false;
let themeSyncBound = false;
let toastBridgeBound = false;
let runtimeEventsBound = false;
let debugApiBound = false;

let moduleInitState = new WeakMap();

let lastSyncSignature = "";
let lastSyncSignatureAt = 0;

let lastRepairSignature = "";
let lastRepairSignatureAt = 0;

let lastLangSignature = "";
let lastLangSignatureAt = 0;

let lastRouteSignature = "";
let lastRouteSignatureAt = 0;

let lastThemeSignature = "";
let lastThemeSignatureAt = 0;

let lastEmitSignature = "";
let lastEmitSignatureAt = 0;

const boundDisposers = [];
const boundEvents = [];
const boundEventKeys = new Set();
const moduleRegistryCache = new Map();
const moduleRegistryConflicts = new Set();

const uiState = {
  initialized: false,

  initCount: 0,
  syncCount: 0,
  repairCount: 0,
  repairRequestCount: 0,
  skippedRepairCount: 0,
  eventCount: 0,
  errorCount: 0,

  lastSyncAt: 0,
  lastSyncReason: "",

  lastRepairAt: 0,
  lastRepairReason: "",

  lastInitAt: 0,
  lastInitOk: false,

  lastEvent: "",
  lastEventAt: 0,

  lastError: null,
  recent: [],

  modules: {
    toast: false,
    sidebar: false,
    topbar: false,
  },
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

function isFunction(value) {
  return typeof value === "function";
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

function isWeakMapKey(value) {
  return isObjectLike(value);
}

function ensureObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
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
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeSetTimeout(callback, ms = 0) {
  if (!isFunction(callback)) {
    return null;
  }

  try {
    return setTimeout(() => {
      try {
        callback();
      } catch {}
    }, Math.max(0, Number(ms) || 0));
  } catch {
    try {
      callback();
    } catch {}

    return null;
  }
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
    !isExtensibleTarget(target) ||
    !key
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        configurable: true,
        enumerable: false,
        writable: true,
      }
    );

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {}

  return false;
}

function normalizeDeps(first = {}, second = {}) {
  if (
    isObject(first) &&
    (
      "AppCore" in first ||
      "Auth" in first ||
      "SidebarUI" in first ||
      "TopbarUI" in first ||
      "Toast" in first ||
      "I18n" in first ||
      "Router" in first ||
      "Store" in first
    )
  ) {
    return {
      ...first,
    };
  }

  return {
    ...ensureObject(second),
    AppCore: first,
  };
}

function getPayload(eventOrPayload = {}) {
  const raw = eventOrPayload || {};

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

function getSafeState(AppCore) {
  return ensureObject(AppCore?.state);
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {}

  return fallback;
}

/* =========================================================
   DEP RESOLUTION
========================================================= */

function getModuleFromRegistry(AppCore, names = []) {
  if (!AppCore) {
    return null;
  }

  const keys =
    safeArray(names)
      .map((name) => safeText(name, ""))
      .filter(Boolean);

  try {
    const modules = AppCore.modules;

    if (modules) {
      for (const key of keys) {
        try {
          if (isFunction(modules.get)) {
            const value = modules.get(key);

            if (value) {
              return value;
            }
          }
        } catch {}

        try {
          if (modules[key]) {
            return modules[key];
          }
        } catch {}
      }
    }
  } catch {}

  try {
    const registryModules = AppCore.registry?.modules;

    if (registryModules) {
      for (const key of keys) {
        if (isFunction(registryModules.get)) {
          const value = registryModules.get(key);

          if (value) {
            return value;
          }
        }

        if (registryModules[key]) {
          return registryModules[key];
        }
      }
    }
  } catch {}

  return null;
}

function resolveDeps(first = {}, second = {}) {
  const deps = normalizeDeps(first, second);
  const AppCore = deps.AppCore || null;

  return {
    ...deps,

    AppCore,

    Auth:
      deps.Auth ||
      AppCore?.Auth ||
      AppCore?.auth ||
      getModuleFromRegistry(AppCore, ["Auth", "auth"]),

    Router:
      deps.Router ||
      AppCore?.Router ||
      AppCore?.router ||
      getModuleFromRegistry(AppCore, ["Router", "router"]),

    Store:
      deps.Store ||
      AppCore?.Store ||
      AppCore?.store ||
      getModuleFromRegistry(AppCore, ["Store", "store"]),

    Toast:
      deps.Toast ||
      AppCore?.Toast ||
      AppCore?.toastModule ||
      AppCore?.toast ||
      getModuleFromRegistry(AppCore, ["Toast", "toast", "toastModule", "notifications"]),

    I18n:
      deps.I18n ||
      AppCore?.I18n ||
      AppCore?.i18n ||
      getModuleFromRegistry(AppCore, ["I18n", "i18n"]),

    SidebarUI:
      deps.SidebarUI ||
      AppCore?.SidebarUI ||
      AppCore?.sidebarUI ||
      AppCore?.sidebar ||
      getModuleFromRegistry(AppCore, ["SidebarUI", "sidebarUI", "sidebar", "Sidebar"]),

    TopbarUI:
      deps.TopbarUI ||
      AppCore?.TopbarUI ||
      AppCore?.topbarUI ||
      AppCore?.topbar ||
      getModuleFromRegistry(AppCore, ["TopbarUI", "topbarUI", "topbar", "Topbar"]),
  };
}

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function redactSensitiveText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
      const escaped =
        String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      output = output.replace(
        new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    }

    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/activate\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/password-reset\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );

    output = output.replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
  } catch {}

  return output;
}

function isDomNodeLike(value) {
  if (!value || typeof value !== "object") {
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

function normalizeError(error = null, fallback = "Error UI.") {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return {
      name: "UIError",
      message: redactSensitiveText(error),
      code: "UI_ERROR",
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
        object.name ||
          object.constructor?.name,
        "UIError"
      ),

    message:
      redactSensitiveText(
        safeText(
          object.message || error,
          fallback
        )
      ),

    code:
      redactSensitiveText(
        safeText(
          object.code ||
            object.status ||
            object.statusCode,
          "UI_ERROR"
        )
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
      node: safeText(value.nodeName, "Node"),
      id: safeText(value.id, ""),
      className: safeText(
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
      type: "Map",
      size: value.size,
    };
  }

  if (value instanceof Set) {
    return {
      type: "Set",
      size: value.size,
    };
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (/token|secret|password|authorization|bearer|credential|jwt|session|refresh/i.test(key)) {
        output[key] =
          item === null ||
          item === undefined ||
          item === "" ||
          typeof item === "boolean"
            ? item
            : "***";
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

  return value;
}

/* =========================================================
   RECENT / LOG / EMIT
========================================================= */

function pushRecent(event = {}) {
  const atMs = safeNow();

  uiState.recent.unshift({
    ...sanitizePayload(event),
    at: safeIsoDate(atMs),
    atMs,
  });

  if (uiState.recent.length > MAX_RECENT_EVENTS) {
    uiState.recent =
      uiState.recent.slice(
        0,
        MAX_RECENT_EVENTS
      );
  }
}

function rememberBoundEvent(eventName = "") {
  const clean = safeText(eventName, "");

  if (
    clean &&
    !boundEvents.includes(clean)
  ) {
    boundEvents.push(clean);
  }
}

function safeLog(AppCore, ...args) {
  const safeArgs =
    args.map((arg) =>
      sanitizePayload(arg)
    );

  try {
    AppCore?.utils?.log?.(
      "[AppUI]",
      ...safeArgs
    );

    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.log(
        "[AppUI]",
        ...safeArgs
      );
    }
  } catch {}
}

function safeWarn(AppCore, ...args) {
  const cleanArgs =
    args.map((arg) =>
      sanitizePayload(arg)
    );

  let emittedByCore = false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[AppUI]",
        ...cleanArgs
      );

      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.warn(
      "[AppUI]",
      ...cleanArgs
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  const cleanArgs =
    args.map((arg) =>
      sanitizePayload(arg)
    );

  let emittedByCore = false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error(
        "[AppUI]",
        ...cleanArgs
      );

      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.error(
      "[AppUI]",
      ...cleanArgs
    );
  } catch {}
}

function safeCreateCustomEvent(name, payload = {}) {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(
        name,
        {
          detail: payload,
        }
      );
    }
  } catch {}

  try {
    const event = document.createEvent("CustomEvent");

    event.initCustomEvent(
      name,
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
        sanitizePayload(payload)
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

  const signature = [
    safeText(eventName, ""),
    safeText(payload?.reason || payload?.phase || "", ""),
    safeText(payload?.source || "", ""),
    safeText(payload?.route || payload?.canonicalPath || "", ""),
    safeText(payload?.publicPath || "", ""),
    payload?.ok === false ? "fail" : "ok",
  ].join("|");

  const current = safeNow();

  if (
    signature &&
    signature === lastEmitSignature &&
    current - lastEmitSignatureAt < EMIT_DEDUPE_MS
  ) {
    return true;
  }

  lastEmitSignature = signature;
  lastEmitSignatureAt = current;

  return false;
}

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts = ensureObject(options);

  if (
    opts.dedupe !== false &&
    shouldDedupeEmit(name, payload, opts.force === true)
  ) {
    return false;
  }

  const finalPayload =
    sanitizePayload({
      source: UI_SOURCE,
      version: UI_VERSION,
      ...ensureObject(payload),
    });

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        name,
        finalPayload
      );

      busEmitted = true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló.`,
      error
    );
  }

  /*
    Anti-event-storm:
    si existe AppCore.events, NO duplicamos por window salvo petición explícita.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return (
      safeWindowDispatch(
        name,
        finalPayload
      ) ||
      busEmitted
    );
  }

  return busEmitted;
}

function setLastError(AppCore, source = "ui", error = null) {
  uiState.errorCount += 1;

  const snapshot = {
    source: safeText(source, "ui"),
    error: normalizeError(error),
    message: redactSensitiveText(
      safeText(
        error?.message || error,
        "Error UI."
      )
    ),
    at: safeIsoDate(),
  };

  uiState.lastError = snapshot;

  pushRecent({
    event: "error",
    source: snapshot.source,
    message: snapshot.message,
  });

  safeEmit(
    AppCore,
    UI_EVENTS.moduleError,
    snapshot
  );

  return snapshot;
}

function recordEvent(eventName = "", payload = {}) {
  uiState.eventCount += 1;
  uiState.lastEvent = safeText(eventName, "");
  uiState.lastEventAt = safeNow();

  pushRecent({
    event: safeText(eventName, ""),
    payload: sanitizePayload(payload),
  });
}

/* =========================================================
   USER SNAPSHOT
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

function getAuthRole(Auth) {
  try {
    return (
      Auth?.getCurrentRole?.() ||
      Auth?.getRole?.() ||
      Auth?.role ||
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

function getRouterPublicPath(Router) {
  try {
    return (
      Router?.getCurrentPublicPath?.() ||
      Router?.getCurrentPath?.() ||
      ""
    );
  } catch {}

  return "";
}

function getRouterCanonicalPath(Router) {
  try {
    return (
      Router?.getCurrentCanonicalPath?.() ||
      Router?.getCurrentPath?.() ||
      ""
    );
  } catch {}

  return "";
}

function getUserId(user = null) {
  return (
    safeText(user?.id, "") ||
    safeText(user?.userId, "") ||
    safeText(user?.user_id, "") ||
    safeText(user?._id, "") ||
    safeText(user?.uid, "") ||
    safeText(user?.sub, "") ||
    ""
  );
}

function hasUsableUser(user = null) {
  return Boolean(
    user &&
      typeof user === "object" &&
      (
        getUserId(user) ||
        safeText(user.username, "") ||
        safeText(user.userName, "") ||
        safeText(user.email, "") ||
        safeText(user.mail, "") ||
        safeText(user.name, "") ||
        safeText(user.displayName, "")
      )
  );
}

function getUserSnapshot(AppCore, Auth = null, Router = null) {
  const state = getSafeState(AppCore);
  const session = ensureObject(state.session);
  const auth = ensureObject(state.auth);

  const user =
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    state.me ||
    state.account ||
    state.profile ||
    session.user ||
    auth.user ||
    getAuthUser(Auth) ||
    null;

  const role =
    state.role ||
    state.rol ||
    state.userRole ||
    session.role ||
    session.rol ||
    session.userRole ||
    auth.role ||
    auth.rol ||
    user?.role ||
    user?.rol ||
    user?.userRole ||
    user?.user_role ||
    getAuthRole(Auth) ||
    null;

  const username =
    user?.username ||
    user?.userName ||
    user?.slug ||
    user?.email ||
    user?.mail ||
    user?.name ||
    user?.displayName ||
    state.username ||
    null;

  const displayName =
    user?.displayName ||
    user?.name ||
    user?.fullName ||
    user?.username ||
    user?.userName ||
    user?.email ||
    user?.mail ||
    null;

  const avatarUrl =
    user?.avatarUrl ||
    user?.avatarURL ||
    user?.avatar ||
    user?.photoURL ||
    user?.picture ||
    user?.image ||
    null;

  const route =
    state.route ||
    state.canonicalPath ||
    getRouterCanonicalPath(Router) ||
    "/";

  const publicPath =
    state.publicPath ||
    getRouterPublicPath(Router) ||
    route ||
    "/";

  const authenticated =
    Boolean(
      (
        state.authenticated ||
        state.isAuthenticated ||
        getAuthStatus(Auth)
      ) &&
      (
        hasUsableUser(user) ||
        state.authenticated === true
      )
    );

  return {
    user,

    userId:
      getUserId(user),

    authenticated,

    role,
    username,
    displayName,
    avatarUrl,

    lang:
      state.lang ||
      state.language ||
      state.locale ||
      null,

    theme:
      state.theme ||
      state.mode ||
      state.appearance ||
      null,

    route,
    publicPath,
  };
}

/* =========================================================
   MODULE REGISTRY
========================================================= */

function getRegisteredCoreModule(AppCore, name = "") {
  const cleanName = safeText(name, "");

  if (!AppCore || !cleanName) {
    return null;
  }

  try {
    if (isFunction(AppCore?.modules?.get)) {
      const value = AppCore.modules.get(cleanName);

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    if (AppCore?.modules?.[cleanName]) {
      return AppCore.modules[cleanName];
    }
  } catch {}

  try {
    if (isFunction(AppCore?.registry?.modules?.get)) {
      const value = AppCore.registry.modules.get(cleanName);

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    if (AppCore?.[cleanName]) {
      return AppCore[cleanName];
    }
  } catch {}

  return null;
}

function markRegistryConflict(AppCore, name = "", alias = "") {
  const key = `${safeText(name, "")}:${safeText(alias, "")}`;

  if (moduleRegistryConflicts.has(key)) {
    return;
  }

  moduleRegistryConflicts.add(key);

  safeWarn(
    AppCore,
    "Conflicto de módulo UI en registry. Se conserva instancia existente.",
    {
      name,
      alias,
    }
  );
}

function registerAliasOnCore(AppCore, name, alias, moduleRef) {
  if (
    !AppCore ||
    !alias ||
    !moduleRef
  ) {
    return false;
  }

  const existing = getRegisteredCoreModule(AppCore, alias);

  if (existing && !Object.is(existing, moduleRef)) {
    markRegistryConflict(AppCore, name, alias);
    return false;
  }

  let ok = false;

  try {
    if (isExtensibleTarget(AppCore)) {
      if (
        safeDefineValue(
          AppCore,
          alias,
          moduleRef
        )
      ) {
        ok = true;
      }
    }
  } catch {}

  /*
    Aliases sin modules.register() para evitar app:module:duplicate.
    Sólo set/propiedad si está vacío o ya es la misma instancia.
  */
  try {
    if (
      AppCore.modules &&
      isExtensibleTarget(AppCore.modules) &&
      (!AppCore.modules[alias] || Object.is(AppCore.modules[alias], moduleRef))
    ) {
      AppCore.modules[alias] = moduleRef;
      ok = true;
    }
  } catch {}

  try {
    if (
      isFunction(AppCore?.modules?.set) &&
      !getRegisteredCoreModule(AppCore, alias)
    ) {
      const result = AppCore.modules.set(
        alias,
        moduleRef,
        {
          source: UI_SOURCE,
          alias: true,
          canonical: name,
          silent: true,
          emit: false,
        }
      );

      ok = result !== false || ok;
    }
  } catch {}

  try {
    if (
      AppCore?.registry?.modules &&
      isFunction(AppCore.registry.modules.set) &&
      !getRegisteredCoreModule(AppCore, alias)
    ) {
      AppCore.registry.modules.set(
        alias,
        moduleRef
      );

      ok = true;
    }
  } catch {}

  return ok;
}

function registerCanonicalModule(AppCore, name, moduleRef) {
  const cleanName = safeText(name, "");

  if (!AppCore || !cleanName || !moduleRef) {
    return false;
  }

  const existing = getRegisteredCoreModule(AppCore, cleanName);

  if (existing && Object.is(existing, moduleRef)) {
    return true;
  }

  if (existing && !Object.is(existing, moduleRef)) {
    markRegistryConflict(AppCore, cleanName, cleanName);
    return false;
  }

  const cache = moduleRegistryCache.get(cleanName);

  if (cache && Object.is(cache.moduleRef, moduleRef)) {
    return true;
  }

  let registered = false;

  try {
    registerModule(
      AppCore,
      cleanName,
      moduleRef
    );

    registered = true;
  } catch {}

  try {
    if (
      !registered &&
      isFunction(AppCore?.modules?.register)
    ) {
      const result = AppCore.modules.register(
        cleanName,
        moduleRef,
        {
          overwrite: false,
          replace: false,
          idempotent: true,
          source: UI_SOURCE,
        }
      );

      registered = result !== false;
    }
  } catch {}

  try {
    if (
      !registered &&
      isFunction(AppCore?.modules?.set)
    ) {
      const result = AppCore.modules.set(
        cleanName,
        moduleRef,
        {
          source: UI_SOURCE,
          overwrite: false,
          replace: false,
        }
      );

      registered = result !== false;
    }
  } catch {}

  try {
    if (
      !registered &&
      AppCore.modules &&
      isExtensibleTarget(AppCore.modules)
    ) {
      AppCore.modules[cleanName] = moduleRef;
      registered = true;
    }
  } catch {}

  try {
    if (isExtensibleTarget(AppCore)) {
      safeDefineValue(AppCore, cleanName, moduleRef);
    }
  } catch {}

  if (registered) {
    moduleRegistryCache.set(cleanName, {
      moduleRef,
      at: safeIsoDate(),
    });
  }

  return registered;
}

function registerAppModule(AppCore, name, moduleRef) {
  const cleanName = safeText(name, "");

  if (
    !AppCore ||
    !cleanName ||
    !moduleRef
  ) {
    return false;
  }

  let registered =
    registerCanonicalModule(
      AppCore,
      cleanName,
      moduleRef
    );

  const aliases =
    UI_MODULE_ALIASES[cleanName] ||
    [cleanName];

  for (const alias of aliases) {
    if (
      registerAliasOnCore(
        AppCore,
        cleanName,
        alias,
        moduleRef
      )
    ) {
      registered = true;
    }
  }

  if (registered) {
    safeEmit(
      AppCore,
      UI_EVENTS.moduleRegistered,
      {
        name: cleanName,
        aliases: [...aliases],
      }
    );
  }

  return registered;
}

/* =========================================================
   SAFE MODULE INIT / METHODS
========================================================= */

function wasModuleInitialized(moduleRef) {
  try {
    if (!moduleRef) {
      return false;
    }

    if (
      isWeakMapKey(moduleRef) &&
      moduleInitState.get(moduleRef)
    ) {
      return true;
    }

    if (moduleRef.__appUiInitialized === true) {
      return true;
    }

    if (moduleRef.initialized === true) {
      return true;
    }

    if (
      moduleRef.ready === true &&
      moduleRef.mounted === true
    ) {
      return true;
    }

    return false;
  } catch {}

  return false;
}

function markModuleInitialized(moduleRef, value = true) {
  try {
    if (
      moduleRef &&
      isWeakMapKey(moduleRef)
    ) {
      moduleInitState.set(
        moduleRef,
        Boolean(value)
      );
    }
  } catch {}

  try {
    if (
      moduleRef &&
      isExtensibleTarget(moduleRef)
    ) {
      safeDefineValue(
        moduleRef,
        "__appUiInitialized",
        Boolean(value)
      );
    }
  } catch {}
}

function isCallOk(result) {
  return result !== false;
}

function callModuleMethod(moduleRef, methodName, context = {}) {
  if (
    !moduleRef ||
    !methodName
  ) {
    return false;
  }

  const fn = moduleRef?.[methodName];

  if (!isFunction(fn)) {
    return false;
  }

  const ctx = ensureObject(context);
  const reason = safeText(ctx.reason, methodName);

  try {
    return isCallOk(
      fn.call(
        moduleRef,
        reason,
        ctx
      )
    );
  } catch {}

  try {
    return isCallOk(
      fn.call(
        moduleRef,
        ctx
      )
    );
  } catch {}

  try {
    return isCallOk(
      fn.call(
        moduleRef,
        ctx.AppCore,
        ctx
      )
    );
  } catch {}

  try {
    return isCallOk(
      fn.call(moduleRef)
    );
  } catch {}

  return false;
}

function callModuleInitMethod(moduleRef, methodName, context = {}) {
  if (
    !moduleRef ||
    !methodName
  ) {
    return false;
  }

  const fn = moduleRef?.[methodName];

  if (!isFunction(fn)) {
    return false;
  }

  const ctx = ensureObject(context);
  const reason = safeText(ctx.reason, methodName);

  try {
    return isCallOk(
      fn.call(
        moduleRef,
        ctx
      )
    );
  } catch {}

  try {
    return isCallOk(
      fn.call(
        moduleRef,
        ctx.AppCore,
        ctx
      )
    );
  } catch {}

  try {
    return isCallOk(
      fn.call(
        moduleRef,
        reason,
        ctx
      )
    );
  } catch {}

  try {
    return isCallOk(
      fn.call(moduleRef)
    );
  } catch {}

  return false;
}

function callFirstModuleMethod(moduleRef, methodNames = [], context = {}) {
  for (const methodName of safeArray(methodNames)) {
    if (
      callModuleMethod(
        moduleRef,
        methodName,
        context
      )
    ) {
      return {
        called: true,
        method: methodName,
      };
    }
  }

  return {
    called: false,
    method: "",
  };
}

function callAllModuleMethods(moduleRef, methodNames = [], context = {}) {
  const called = [];
  const failed = [];

  for (const methodName of safeArray(methodNames)) {
    try {
      if (
        callModuleMethod(
          moduleRef,
          methodName,
          context
        )
      ) {
        called.push(methodName);
      } else {
        failed.push(methodName);
      }
    } catch {
      failed.push(methodName);
    }
  }

  return {
    called: called.length > 0,
    methods: called,
    failed,
  };
}

function safeInitModule(AppCore, moduleRef, label = "module", context = {}) {
  if (!moduleRef) {
    return false;
  }

  const ctx = ensureObject(context);

  if (
    ctx.force !== true &&
    wasModuleInitialized(moduleRef)
  ) {
    safeEmit(
      AppCore,
      UI_EVENTS.moduleSkipped,
      {
        label,
        reason: "already-initialized",
      }
    );

    return true;
  }

  let initializedModule = false;

  const fullContext = {
    ...ctx,
    AppCore,
    label,
    reason:
      ctx.reason || `${label}:init`,
  };

  for (const methodName of UI_INIT_METHODS) {
    try {
      if (
        callModuleInitMethod(
          moduleRef,
          methodName,
          fullContext
        )
      ) {
        initializedModule = true;
        break;
      }
    } catch (error) {
      setLastError(
        AppCore,
        `${label}.${methodName}`,
        error
      );

      safeWarn(
        AppCore,
        `Error ${label}.${methodName}().`,
        error
      );
    }
  }

  /*
    Si no expone init/boot/mount/start pero existe como módulo, queda registrado.
  */
  if (!initializedModule) {
    const hasAnyInitMethod =
      UI_INIT_METHODS.some((methodName) =>
        isFunction(moduleRef?.[methodName])
      );

    if (!hasAnyInitMethod) {
      initializedModule = true;
    }
  }

  if (initializedModule) {
    markModuleInitialized(
      moduleRef,
      true
    );

    safeEmit(
      AppCore,
      UI_EVENTS.moduleInit,
      {
        label,
      }
    );

    safeLog(
      AppCore,
      `${label} inicializado.`
    );
  }

  return initializedModule;
}

/* =========================================================
   LIGHT UI SYNC
========================================================= */

function syncSidebarLight(SidebarUI, context = {}) {
  if (!SidebarUI) {
    return {
      ok: false,
      user: "",
      visual: [],
      fallback: "",
    };
  }

  const userResult =
    callFirstModuleMethod(
      SidebarUI,
      SIDEBAR_USER_LIGHT_METHODS,
      context
    );

  const visualResult =
    callAllModuleMethods(
      SidebarUI,
      SIDEBAR_VISUAL_LIGHT_METHODS,
      context
    );

  let fallbackResult = {
    called: false,
    method: "",
  };

  /*
    Fallback solo si no hay métodos ligeros.
    No llamamos repair/rebind/bind.
  */
  if (
    !userResult.called &&
    !visualResult.called
  ) {
    fallbackResult =
      callFirstModuleMethod(
        SidebarUI,
        SIDEBAR_FALLBACK_LIGHT_METHODS,
        context
      );
  }

  return {
    ok:
      Boolean(
        userResult.called ||
          visualResult.called ||
          fallbackResult.called
      ),

    user:
      userResult.method,

    visual:
      visualResult.methods,

    fallback:
      fallbackResult.method,
  };
}

function syncTopbarLight(TopbarUI, context = {}) {
  if (!TopbarUI) {
    return {
      ok: false,
      user: "",
      visual: [],
      fallback: "",
    };
  }

  const userResult =
    callFirstModuleMethod(
      TopbarUI,
      TOPBAR_USER_LIGHT_METHODS,
      context
    );

  const visualResult =
    callAllModuleMethods(
      TopbarUI,
      TOPBAR_VISUAL_LIGHT_METHODS,
      context
    );

  let fallbackResult = {
    called: false,
    method: "",
  };

  if (
    !userResult.called &&
    !visualResult.called
  ) {
    fallbackResult =
      callFirstModuleMethod(
        TopbarUI,
        TOPBAR_FALLBACK_LIGHT_METHODS,
        context
      );
  }

  return {
    ok:
      Boolean(
        userResult.called ||
          visualResult.called ||
          fallbackResult.called
      ),

    user:
      userResult.method,

    visual:
      visualResult.methods,

    fallback:
      fallbackResult.method,
  };
}

function hardRepairModule(moduleRef, context = {}) {
  return callFirstModuleMethod(
    moduleRef,
    UI_HARD_REPAIR_METHODS,
    context
  );
}

function rebindModule(moduleRef, context = {}) {
  return callFirstModuleMethod(
    moduleRef,
    UI_REBIND_METHODS,
    context
  );
}

/* =========================================================
   USER UI
========================================================= */

function getSyncSignature(snapshot = {}, reason = "") {
  const data = {
    reason: safeText(reason, ""),

    authenticated: Boolean(snapshot.authenticated),

    userId: safeText(snapshot.userId, ""),
    username: safeText(snapshot.username, ""),
    displayName: safeText(snapshot.displayName, ""),
    avatarUrl: safeText(snapshot.avatarUrl, ""),

    role: safeText(snapshot.role, ""),
    lang: safeText(snapshot.lang, ""),
    theme: safeText(snapshot.theme, ""),

    route: safeText(snapshot.route, ""),
    publicPath: safeText(snapshot.publicPath, ""),
  };

  try {
    return JSON.stringify(data);
  } catch {
    return String(safeNow());
  }
}

function shouldDedupeSync(snapshot = {}, reason = "", force = false) {
  if (force === true) {
    return false;
  }

  const signature =
    getSyncSignature(
      snapshot,
      reason
    );

  const current = safeNow();

  if (
    signature === lastSyncSignature &&
    current - lastSyncSignatureAt < SYNC_DEDUPE_MS
  ) {
    return true;
  }

  lastSyncSignature = signature;
  lastSyncSignatureAt = current;

  return false;
}

export function syncUserUI(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
    Auth,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    Router,
    Store,

    reason = "sync-user-ui",
    payload = {},

    rebind = false,
    hardRepair = false,
    force = false,
  } = deps;

  if (!AppCore) {
    return false;
  }

  const cleanReason =
    safeText(
      reason,
      "sync-user-ui"
    );

  const snapshot =
    getUserSnapshot(
      AppCore,
      Auth,
      Router
    );

  if (
    shouldDedupeSync(
      snapshot,
      cleanReason,
      force
    )
  ) {
    return true;
  }

  if (syncingUserUI) {
    syncQueued = true;

    queuedSyncDeps = {
      ...deps,

      reason:
        `${cleanReason}:queued`,

      rebind: false,
      hardRepair: false,
      force: true,
    };

    return true;
  }

  syncingUserUI = true;

  const startedAt = safeNow();

  safeEmit(
    AppCore,
    UI_EVENTS.userSyncStart,
    {
      reason: cleanReason,
      at: safeIsoDate(startedAt),
    }
  );

  try {
    const context = {
      AppCore,
      Auth,
      Router,
      Store,
      SidebarUI,
      TopbarUI,
      Toast,
      I18n,

      reason: cleanReason,

      payload:
        sanitizePayload(payload),

      snapshot,

      user: snapshot.user,
      userId: snapshot.userId,

      authenticated: snapshot.authenticated,

      role: snapshot.role,
      username: snapshot.username,
      displayName: snapshot.displayName,
      avatarUrl: snapshot.avatarUrl,

      lang: snapshot.lang,
      theme: snapshot.theme,

      route: snapshot.route,
      publicPath: snapshot.publicPath,
    };

    let ok = false;

    let sidebarResult = {
      ok: false,
    };

    let topbarResult = {
      ok: false,
    };

    if (hardRepair === true) {
      const sidebarRepair =
        hardRepairModule(
          SidebarUI,
          context
        );

      const topbarRepair =
        hardRepairModule(
          TopbarUI,
          context
        );

      sidebarResult = {
        ok: sidebarRepair.called,
        repair: sidebarRepair.method,
      };

      topbarResult = {
        ok: topbarRepair.called,
        repair: topbarRepair.method,
      };
    } else {
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
    }

    ok =
      Boolean(
        sidebarResult.ok ||
          topbarResult.ok
      );

    let sidebarRebind = {
      called: false,
      method: "",
    };

    let topbarRebind = {
      called: false,
      method: "",
    };

    /*
      Rebind solo explícito.
    */
    if (rebind === true) {
      sidebarRebind =
        rebindModule(
          SidebarUI,
          context
        );

      topbarRebind =
        rebindModule(
          TopbarUI,
          context
        );

      ok =
        Boolean(
          ok ||
            sidebarRebind.called ||
            topbarRebind.called
        );
    }

    uiState.syncCount += 1;
    uiState.lastSyncAt = safeNow();
    uiState.lastSyncReason = context.reason;

    pushRecent({
      event: "sync",
      reason: context.reason,
      authenticated: snapshot.authenticated,
      username: snapshot.username,
      route: snapshot.route,
      publicPath: snapshot.publicPath,
    });

    /*
      Este evento lo emite AppUI.
      AppUI no lo escucha.
    */
    safeEmit(
      AppCore,
      UI_EVENTS.userSync,
      {
        reason: context.reason,

        user: snapshot.user,
        userId: snapshot.userId,

        authenticated: snapshot.authenticated,

        username: snapshot.username,
        displayName: snapshot.displayName,
        avatarUrl: snapshot.avatarUrl,

        role: snapshot.role,
        lang: snapshot.lang,
        theme: snapshot.theme,

        route: snapshot.route,
        publicPath: snapshot.publicPath,
      }
    );

    safeEmit(
      AppCore,
      UI_EVENTS.userSyncDone,
      {
        ok,

        reason: context.reason,

        durationMs:
          safeNow() - startedAt,

        authenticated: snapshot.authenticated,
        username: snapshot.username,
        role: snapshot.role,

        route: snapshot.route,
        publicPath: snapshot.publicPath,

        sidebar: sidebarResult,
        topbar: topbarResult,

        rebind: Boolean(rebind),
        hardRepair: Boolean(hardRepair),

        sidebarRebind: sidebarRebind.method,
        topbarRebind: topbarRebind.method,
      }
    );

    safeLog(
      AppCore,
      "UI usuario sincronizada.",
      {
        reason: context.reason,
        authenticated: snapshot.authenticated,
        username: snapshot.username,
        role: snapshot.role,
        sidebar: sidebarResult,
        topbar: topbarResult,
        rebind: Boolean(rebind),
        hardRepair: Boolean(hardRepair),
      }
    );

    return true;
  } catch (error) {
    setLastError(
      AppCore,
      "syncUserUI",
      error
    );

    safeError(
      AppCore,
      "syncUserUI() error:",
      error
    );

    safeEmit(
      AppCore,
      UI_EVENTS.userSyncError,
      {
        message:
          safeText(
            error?.message || error,
            "syncUserUI() error."
          ),

        reason: cleanReason,
      }
    );

    return false;
  } finally {
    syncingUserUI = false;

    if (syncQueued) {
      const queued =
        queuedSyncDeps || {
          ...deps,

          reason:
            `${cleanReason}:queued`,

          rebind: false,
          hardRepair: false,
          force: true,
        };

      syncQueued = false;
      queuedSyncDeps = null;

      safeSetTimeout(() => {
        syncUserUI(queued);
      }, SYNC_QUEUE_DELAY_MS);
    }
  }
}

/* =========================================================
   EVENT BINDING
========================================================= */

function rememberDisposer(disposer) {
  if (isFunction(disposer)) {
    boundDisposers.push(disposer);
  }
}

function makeBoundEventKey(scope = DEFAULT_SCOPE, eventName = "", label = "") {
  return [
    safeText(scope, DEFAULT_SCOPE),
    safeText(eventName, ""),
    safeText(label, "default"),
  ].join("::");
}

function bindEvent(AppCore, scope, eventName, handler, label = "") {
  if (
    !eventName ||
    !isFunction(handler)
  ) {
    return false;
  }

  const finalScope =
    safeText(scope, DEFAULT_SCOPE);

  const key =
    makeBoundEventKey(
      finalScope,
      eventName,
      label || eventName
    );

  if (boundEventKeys.has(key)) {
    return true;
  }

  const wrappedHandler = (eventOrPayload = {}) => {
    const payload = getPayload(eventOrPayload);

    recordEvent(
      eventName,
      payload
    );

    try {
      handler(
        payload,
        eventOrPayload
      );
    } catch (error) {
      setLastError(
        AppCore,
        `event:${eventName}`,
        error
      );
    }
  };

  /*
    Bus interno primero.
    Window solo si no hay bus.
    No duplicar bus + window.
  */
  try {
    if (isFunction(AppCore?.events?.on)) {
      const off =
        AppCore.events.on(
          eventName,
          wrappedHandler
        );

      if (isFunction(off)) {
        rememberDisposer(off);
      } else if (isFunction(AppCore?.events?.off)) {
        rememberDisposer(() => {
          try {
            AppCore.events.off(
              eventName,
              wrappedHandler
            );
          } catch {}
        });
      }

      rememberBoundEvent(eventName);
      boundEventKeys.add(key);

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.on("${eventName}") falló.`,
      error
    );
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    window.addEventListener(
      eventName,
      wrappedHandler
    );

    rememberDisposer(() => {
      try {
        window.removeEventListener(
          eventName,
          wrappedHandler
        );
      } catch {}
    });

    rememberBoundEvent(eventName);
    boundEventKeys.add(key);

    return true;
  } catch {}

  return false;
}

/* =========================================================
   LANGUAGE / ROUTE / THEME DEDUPE
========================================================= */

function getLangSignature(detail = {}) {
  return [
    safeText(detail.lang, ""),
    safeText(detail.language, ""),
    safeText(detail.locale, ""),
  ].join("|");
}

function shouldDedupeLang(detail = {}) {
  const signature = getLangSignature(detail);
  const current = safeNow();

  if (
    signature &&
    signature === lastLangSignature &&
    current - lastLangSignatureAt < LANG_SYNC_DEDUPE_MS
  ) {
    return true;
  }

  lastLangSignature = signature;
  lastLangSignatureAt = current;

  return false;
}

function getRouteSignature(detail = {}) {
  return [
    safeText(detail.route || detail.canonicalPath || detail.path, ""),
    safeText(detail.publicPath || detail.href || detail.to, ""),
    safeText(detail.reason || detail.phase || "", ""),
  ].join("|");
}

function shouldDedupeRoute(detail = {}) {
  const signature = getRouteSignature(detail);
  const current = safeNow();

  if (
    signature &&
    signature === lastRouteSignature &&
    current - lastRouteSignatureAt < ROUTE_SYNC_DEDUPE_MS
  ) {
    return true;
  }

  lastRouteSignature = signature;
  lastRouteSignatureAt = current;

  return false;
}

function getThemeSignature(detail = {}) {
  return [
    safeText(detail.theme, ""),
    safeText(detail.mode, ""),
    safeText(detail.appearance, ""),
    safeText(detail.systemTheme, ""),
  ].join("|");
}

function shouldDedupeTheme(detail = {}) {
  const signature = getThemeSignature(detail);
  const current = safeNow();

  if (
    signature &&
    signature === lastThemeSignature &&
    current - lastThemeSignatureAt < THEME_SYNC_DEDUPE_MS
  ) {
    return true;
  }

  lastThemeSignature = signature;
  lastThemeSignatureAt = current;

  return false;
}

/* =========================================================
   LANGUAGE BIND
========================================================= */

export function bindAppLanguageSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
    Auth,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    Router,
    Store,
    scope = DEFAULT_SCOPE,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (
    languageSyncBound ||
    safeBoolean(AppCore.__appLangUiBound)
  ) {
    return true;
  }

  const handler = (detail = {}) => {
    if (shouldDedupeLang(detail)) {
      return;
    }

    syncUserUI({
      AppCore,
      Auth,
      Router,
      Store,
      SidebarUI,
      TopbarUI,
      Toast,
      I18n,

      reason: "app:lang:change",
      payload: detail,

      rebind: false,
      hardRepair: false,
      force: true,
    });

    try {
      const title = document?.title || "";

      if (AppCore?.dom?.topbarTitle) {
        AppCore.dom.topbarTitle.textContent = title;
      }
    } catch {}
  };

  const bound =
    bindEvent(
      AppCore,
      scope,
      UI_EVENTS.langChange,
      handler,
      "lang-change"
    );

  if (!bound) {
    return false;
  }

  languageSyncBound = true;

  safeDefineValue(
    AppCore,
    "__appLangUiBound",
    true
  );

  safeLog(
    AppCore,
    "Language UI sync activo."
  );

  return true;
}

/* =========================================================
   REPAIR REQUEST BIND
========================================================= */

function getRepairSignature(detail = {}) {
  return [
    safeText(detail.source, ""),
    safeText(detail.reason || detail.phase, ""),
    safeText(detail.route || detail.canonicalPath, ""),
    safeText(detail.publicPath, ""),
    detail.rebind === true ? "rebind" : "no-rebind",
    detail.hardRepair === true ? "hard" : "light",
  ].join("|");
}

function shouldSkipRepairRequest(detail = {}) {
  const source = safeText(detail.source, "");
  const event = safeText(detail.event, "");

  /*
    AppUI no escucha sus propios eventos.
    No escucha userSync.
  */
  if (
    source === UI_SOURCE ||
    source === UI_EVENTS.userSync ||
    event === UI_EVENTS.userSync ||
    source === "app:user-ui:sync" ||
    event === "app:user-ui:sync"
  ) {
    return true;
  }

  const signature = getRepairSignature(detail);
  const current = safeNow();

  if (
    signature === lastRepairSignature &&
    current - lastRepairSignatureAt < REPAIR_REQUEST_DEDUPE_MS
  ) {
    return true;
  }

  lastRepairSignature = signature;
  lastRepairSignatureAt = current;

  return false;
}

export function bindUIRepairSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
    scope = DEFAULT_SCOPE,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (
    repairSyncBound ||
    safeBoolean(AppCore.__appUiRepairBound)
  ) {
    return true;
  }

  const handler = (detail = {}) => {
    uiState.repairRequestCount += 1;

    if (shouldSkipRepairRequest(detail)) {
      uiState.skippedRepairCount += 1;

      safeEmit(
        AppCore,
        UI_EVENTS.repairSkipped,
        {
          reason:
            detail.reason ||
            detail.phase ||
            "repair-request-deduped",

          detail: {
            source: detail.source || null,
            route: detail.route || detail.canonicalPath || null,
            publicPath: detail.publicPath || null,
          },
        }
      );

      return;
    }

    repairUISystems({
      ...deps,

      reason:
        detail.reason ||
        detail.phase ||
        "app:ui:repair-request",

      payload: detail,

      rebind: detail.rebind === true,
      hardRepair: detail.hardRepair === true,
      force: detail.force === true,
    });
  };

  const bound =
    bindEvent(
      AppCore,
      scope,
      UI_EVENTS.repairRequest,
      handler,
      "repair-request"
    );

  if (!bound) {
    return false;
  }

  repairSyncBound = true;

  safeDefineValue(
    AppCore,
    "__appUiRepairBound",
    true
  );

  safeLog(
    AppCore,
    "UI repair sync activo."
  );

  return true;
}

/* =========================================================
   ROUTE / SESSION / THEME LIGHT SYNC
========================================================= */

export function bindUIRouteSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
    scope = DEFAULT_SCOPE,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (
    routeSyncBound ||
    safeBoolean(AppCore.__appUiRouteSyncBound)
  ) {
    return true;
  }

  const sync = (reason, detail = {}) => {
    if (shouldDedupeRoute(detail)) {
      return;
    }

    syncUserUI({
      ...deps,
      reason,
      payload: detail,
      rebind: false,
      hardRepair: false,
      force: false,
    });
  };

  const boundRoute =
    bindEvent(
      AppCore,
      scope,
      UI_EVENTS.routeChange,
      (detail) => {
        sync(
          "app:route:change",
          detail
        );
      },
      "route-change"
    );

  const boundRendered =
    bindEvent(
      AppCore,
      scope,
      UI_EVENTS.routerRendered,
      (detail) => {
        sync(
          "router:rendered",
          detail
        );
      },
      "router-rendered"
    );

  const boundAsync =
    bindEvent(
      AppCore,
      scope,
      UI_EVENTS.routerAsyncComplete,
      (detail) => {
        sync(
          "router:render:async-complete",
          detail
        );
      },
      "router-async-complete"
    );

  routeSyncBound =
    Boolean(
      boundRoute ||
        boundRendered ||
        boundAsync
    );

  safeDefineValue(
    AppCore,
    "__appUiRouteSyncBound",
    routeSyncBound
  );

  return routeSyncBound;
}

export function bindUISessionSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
    scope = DEFAULT_SCOPE,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (
    sessionSyncBound ||
    safeBoolean(AppCore.__appUiSessionSyncBound)
  ) {
    return true;
  }

  const sync = (reason, detail = {}) => {
    syncUserUI({
      ...deps,
      reason,
      payload: detail,
      rebind: false,
      hardRepair: false,
      force: true,
    });
  };

  const events = [
    [
      UI_EVENTS.userChange,
      "app:user:change",
    ],
    [
      UI_EVENTS.sessionRestored,
      "app:session:restored",
    ],
    [
      UI_EVENTS.sessionCleared,
      "app:session:cleared",
    ],
    [
      UI_EVENTS.authSessionRestored,
      "auth:session:restored",
    ],
    [
      UI_EVENTS.authLoginSuccess,
      "auth:login:success",
    ],
    [
      UI_EVENTS.authLogout,
      "auth:logout",
    ],
    [
      UI_EVENTS.authLogoutSuccess,
      "auth:logout:success",
    ],
  ];

  let anyBound = false;

  for (const [eventName, reason] of events) {
    const bound =
      bindEvent(
        AppCore,
        scope,
        eventName,
        (detail) => {
          sync(
            reason,
            detail
          );
        },
        `session:${eventName}`
      );

    if (bound) {
      anyBound = true;
    }
  }

  sessionSyncBound = anyBound;

  safeDefineValue(
    AppCore,
    "__appUiSessionSyncBound",
    sessionSyncBound
  );

  return sessionSyncBound;
}

export function bindUIThemeSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
    scope = DEFAULT_SCOPE,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (
    themeSyncBound ||
    safeBoolean(AppCore.__appUiThemeSyncBound)
  ) {
    return true;
  }

  const sync = (reason, detail = {}) => {
    if (shouldDedupeTheme(detail)) {
      return;
    }

    syncUserUI({
      ...deps,
      reason,
      payload: detail,
      rebind: false,
      hardRepair: false,
      force: true,
    });
  };

  const events = [
    UI_EVENTS.themeChange,
    "onion:theme:change",
    "theme:change",
  ];

  let anyBound = false;

  for (const eventName of events) {
    const bound =
      bindEvent(
        AppCore,
        scope,
        eventName,
        (detail) => {
          sync(
            eventName,
            detail
          );
        },
        `theme:${eventName}`
      );

    if (bound) {
      anyBound = true;
    }
  }

  themeSyncBound = anyBound;

  safeDefineValue(
    AppCore,
    "__appUiThemeSyncBound",
    themeSyncBound
  );

  return themeSyncBound;
}

export function bindUIRuntimeEvents(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (
    runtimeEventsBound ||
    safeBoolean(AppCore.__appUiRuntimeEventsBound)
  ) {
    return true;
  }

  const langBound = bindAppLanguageSync(deps);
  const repairBound = bindUIRepairSync(deps);
  const routeBound = bindUIRouteSync(deps);
  const sessionBound = bindUISessionSync(deps);
  const themeBound = bindUIThemeSync(deps);

  runtimeEventsBound =
    Boolean(
      langBound ||
        repairBound ||
        routeBound ||
        sessionBound ||
        themeBound
    );

  safeDefineValue(
    AppCore,
    "__appUiRuntimeEventsBound",
    runtimeEventsBound
  );

  if (runtimeEventsBound) {
    safeEmit(
      AppCore,
      UI_EVENTS.runtimeEventsBound,
      {
        langBound,
        repairBound,
        routeBound,
        sessionBound,
        themeBound,
        at: safeIsoDate(),
      }
    );
  }

  return runtimeEventsBound;
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

function normalizeToastType(type = "info") {
  const normalized =
    safeText(type, "info").toLowerCase();

  if (normalized === "warn") {
    return "warning";
  }

  return TOAST_TYPES.includes(normalized)
    ? normalized
    : "info";
}

function resolveToastMethod(Toast, type = "info") {
  const normalized = normalizeToastType(type);

  if (
    normalized === "warning" &&
    isFunction(Toast?.warning)
  ) {
    return Toast.warning;
  }

  if (
    normalized === "warning" &&
    isFunction(Toast?.warn)
  ) {
    return Toast.warn;
  }

  return Toast?.[normalized] || null;
}

function createToastBridge(AppCore, Toast) {
  return function showToast(message = "", type = "info", options = {}) {
    let cleanMessage = "";
    let cleanType = "info";
    let payload = {};

    /*
      Compat:
      - showToast("msg", "success", options)
      - showToast({ message, type, ...options })
    */
    if (isObject(message)) {
      payload = ensureObject(message);

      cleanMessage =
        safeText(
          payload.message ||
            payload.text ||
            payload.title,
          ""
        );

      cleanType =
        normalizeToastType(
          payload.type ||
            payload.variant ||
            type
        );
    } else {
      cleanMessage = safeText(message, "");
      cleanType = normalizeToastType(type);

      payload = {
        ...ensureObject(options),
        type: cleanType,
        message: cleanMessage,
      };
    }

    if (!cleanMessage) {
      return null;
    }

    payload = {
      ...payload,
      type: cleanType,
      message: cleanMessage,
    };

    try {
      const method =
        resolveToastMethod(
          Toast,
          cleanType
        );

      if (isFunction(method)) {
        return method.call(
          Toast,
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

      return null;
    } catch (error) {
      safeWarn(
        AppCore,
        "Toast bridge error:",
        error
      );

      return null;
    }
  };
}

function attachToastBridge(AppCore, bridge) {
  let attached = false;

  try {
    if (isFunction(AppCore?.setShowToast)) {
      AppCore.setShowToast(bridge);
      attached = true;
    }
  } catch {}

  if (isExtensibleTarget(AppCore)) {
    if (
      safeDefineValue(
        AppCore,
        "showToast",
        bridge
      )
    ) {
      attached = true;
    }

    if (
      safeDefineValue(
        AppCore,
        "toast",
        bridge
      )
    ) {
      attached = true;
    }
  }

  if (isExtensibleTarget(AppCore?.utils)) {
    if (
      safeDefineValue(
        AppCore.utils,
        "showToast",
        bridge
      )
    ) {
      attached = true;
    }

    if (
      safeDefineValue(
        AppCore.utils,
        "toast",
        bridge
      )
    ) {
      attached = true;
    }
  }

  return attached;
}

export function bindToastBridge(first = {}, second = null) {
  const deps =
    resolveDeps(
      first,
      {
        Toast: second,
      }
    );

  const {
    AppCore,
    Toast,
  } = deps;

  if (
    !AppCore ||
    !Toast
  ) {
    return false;
  }

  if (
    toastBridgeBound ||
    safeBoolean(AppCore.__toastBridgeBound)
  ) {
    return true;
  }

  const bridge =
    createToastBridge(
      AppCore,
      Toast
    );

  const attached =
    attachToastBridge(
      AppCore,
      bridge
    );

  if (!attached) {
    safeWarn(
      AppCore,
      "Toast bridge no pudo montarse: objeto no extensible."
    );

    return false;
  }

  toastBridgeBound = true;

  safeDefineValue(
    AppCore,
    "__toastBridgeBound",
    true
  );

  safeEmit(
    AppCore,
    UI_EVENTS.toastBridgeReady,
    {
      at: safeIsoDate(),
    }
  );

  safeLog(
    AppCore,
    "Toast bridge activo."
  );

  return true;
}

/* =========================================================
   UI REPAIR
========================================================= */

export function repairUISystems(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
    reason = "repair-ui",
    rebind = false,
    hardRepair = false,
  } = deps;

  uiState.repairCount += 1;
  uiState.lastRepairAt = safeNow();
  uiState.lastRepairReason =
    safeText(
      reason,
      "repair-ui"
    );

  /*
    Por defecto, reparación ligera:
    - usuario
    - rol
    - visibilidad
    - indicador de ruta
    No rebind.
  */
  const ok =
    syncUserUI({
      ...deps,

      reason,

      rebind: rebind === true,
      hardRepair: hardRepair === true,
      force: true,
    });

  safeEmit(
    AppCore,
    UI_EVENTS.repair,
    {
      reason:
        safeText(reason, "repair-ui"),

      ok,

      rebind: rebind === true,
      hardRepair: hardRepair === true,

      at: safeIsoDate(),
    }
  );

  safeEmit(
    AppCore,
    UI_EVENTS.repairDone,
    {
      reason:
        safeText(reason, "repair-ui"),

      ok,
      at: safeIsoDate(),
    }
  );

  return ok;
}

/* =========================================================
   INIT
========================================================= */

function markUiInitialized(AppCore, state = null, value = true) {
  try {
    if (state) {
      state.uiInitialized = Boolean(value);
    }
  } catch {}

  try {
    AppCore?.setState?.(
      {
        uiInitialized: Boolean(value),
      },
      {
        source: UI_SOURCE,
        emit: false,
        emitState: false,
        silent: true,
      }
    );
  } catch {
    try {
      AppCore?.setState?.({
        uiInitialized: Boolean(value),
      });
    } catch {}
  }

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      AppCore.state.uiInitialized = Boolean(value);
    }
  } catch {}

  return true;
}

function exposeDebugApi(AppCore = null) {
  if (
    debugApiBound &&
    isBrowser() &&
    window.__ONION_APP_UI__
  ) {
    return window.__ONION_APP_UI__;
  }

  const api = {
    version: UI_VERSION,

    sync:
      (options = {}) =>
        syncUserUI({
          AppCore,
          ...ensureObject(options),
        }),

    repair:
      (options = {}) =>
        repairUISystems({
          AppCore,
          ...ensureObject(options),
        }),

    unbind:
      () =>
        unbindUISystems(AppCore),

    snapshot:
      (extra = {}) =>
        getUISystemsSnapshot({
          AppCore,
          ...ensureObject(extra),
        }),

    reset:
      resetUIRuntimeState,
  };

  try {
    if (isBrowser()) {
      window.__ONION_APP_UI__ = api;
    }
  } catch {}

  try {
    if (
      AppCore &&
      typeof AppCore === "object" &&
      Object.isExtensible(AppCore)
    ) {
      Object.defineProperty(
        AppCore,
        "UI",
        {
          value: api,
          configurable: true,
          enumerable: false,
          writable: true,
        }
      );
    }
  } catch {}

  debugApiBound = true;

  safeEmit(
    AppCore,
    UI_EVENTS.debugReady,
    {
      at: safeIsoDate(),
    }
  );

  return api;
}

export function initUISystems(first = {}) {
  const deps = resolveDeps(first);

  const {
    AppCore,
    Toast,
    SidebarUI,
    TopbarUI,
    state,
    scope = DEFAULT_SCOPE,
    force = false,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (initInFlight) {
    return true;
  }

  if (
    !force &&
    (
      uiInitialized ||
      state?.uiInitialized ||
      AppCore?.state?.uiInitialized
    )
  ) {
    safeLog(
      AppCore,
      "UISystems ya inicializados."
    );

    /*
      Aunque UI esté inicializada, aseguramos runtime events, bridge y debug.
      Cubre reboot parcial o hot reload de módulos.
    */
    bindToastBridge({
      AppCore,
      Toast,
    });

    bindUIRuntimeEvents({
      ...deps,
      scope,
    });

    exposeDebugApi(AppCore);

    syncUserUI({
      ...deps,

      reason: "init-ui-already-initialized",

      rebind: false,
      hardRepair: false,
      force: true,
    });

    return true;
  }

  initInFlight = true;

  const startedAt = safeNow();

  safeEmit(
    AppCore,
    UI_EVENTS.initStart,
    {
      scope,
      version: UI_VERSION,
      at: safeIsoDate(startedAt),
    }
  );

  try {
    registerAppModule(
      AppCore,
      UI_MODULES.toast,
      Toast
    );

    registerAppModule(
      AppCore,
      UI_MODULES.sidebar,
      SidebarUI
    );

    registerAppModule(
      AppCore,
      UI_MODULES.topbar,
      TopbarUI
    );

    uiState.modules.toast = Boolean(Toast);
    uiState.modules.sidebar = Boolean(SidebarUI);
    uiState.modules.topbar = Boolean(TopbarUI);

    safeInitModule(
      AppCore,
      Toast,
      "Toast",
      {
        ...deps,
        reason: "init-ui:toast",
        force,
      }
    );

    bindToastBridge({
      AppCore,
      Toast,
    });

    safeInitModule(
      AppCore,
      SidebarUI,
      "SidebarUI",
      {
        ...deps,
        reason: "init-ui:sidebar",
        force,
      }
    );

    safeInitModule(
      AppCore,
      TopbarUI,
      "TopbarUI",
      {
        ...deps,
        reason: "init-ui:topbar",
        force,
      }
    );

    bindUIRuntimeEvents({
      ...deps,
      scope,
    });

    exposeDebugApi(AppCore);

    /*
      Después de init: sync ligero.
      No rebind.
      No hardRepair.
    */
    syncUserUI({
      ...deps,

      reason: "init-ui",

      rebind: false,
      hardRepair: false,
      force: true,
    });

    uiInitialized = true;
    uiState.initialized = true;
    uiState.initCount += 1;
    uiState.lastInitAt = safeNow();
    uiState.lastInitOk = true;

    markUiInitialized(
      AppCore,
      state,
      true
    );

    const payload = {
      ok: true,
      scope,
      version: UI_VERSION,
      durationMs: safeNow() - startedAt,
      modules: {
        ...uiState.modules,
      },
      at: safeIsoDate(),
    };

    safeEmit(
      AppCore,
      UI_EVENTS.initSuccess,
      payload
    );

    safeEmit(
      AppCore,
      UI_EVENTS.ready,
      payload
    );

    safeLog(
      AppCore,
      "UISystems listos.",
      payload
    );

    return true;
  } catch (error) {
    uiState.lastInitOk = false;

    setLastError(
      AppCore,
      "initUISystems",
      error
    );

    safeError(
      AppCore,
      "initUISystems() fatal:",
      error
    );

    safeEmit(
      AppCore,
      UI_EVENTS.initError,
      {
        message:
          safeText(
            error?.message || error,
            "initUISystems() fatal."
          ),

        error:
          normalizeError(error),

        at:
          safeIsoDate(),
      }
    );

    return false;
  } finally {
    initInFlight = false;
  }
}

/* =========================================================
   UNBIND / DEBUG
========================================================= */

export function unbindUISystems(AppCore = null) {
  for (const dispose of boundDisposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

  boundEvents.splice(0);
  boundEventKeys.clear();

  languageSyncBound = false;
  repairSyncBound = false;
  routeSyncBound = false;
  sessionSyncBound = false;
  themeSyncBound = false;
  runtimeEventsBound = false;
  toastBridgeBound = false;

  if (AppCore) {
    safeDefineValue(AppCore, "__appLangUiBound", false);
    safeDefineValue(AppCore, "__appUiRepairBound", false);
    safeDefineValue(AppCore, "__appUiRouteSyncBound", false);
    safeDefineValue(AppCore, "__appUiSessionSyncBound", false);
    safeDefineValue(AppCore, "__appUiThemeSyncBound", false);
    safeDefineValue(AppCore, "__appUiRuntimeEventsBound", false);
    safeDefineValue(AppCore, "__toastBridgeBound", false);
  }

  safeEmit(
    AppCore,
    UI_EVENTS.runtimeEventsUnbound,
    {
      at: safeIsoDate(),
    }
  );

  safeLog(
    AppCore,
    "UISystems listeners desactivados."
  );

  return true;
}

export function getUISystemsSnapshot(first = {}, second = {}) {
  const {
    AppCore,
    Auth,
    Router,
    SidebarUI,
    TopbarUI,
    Toast,
  } = resolveDeps(first, second);

  return sanitizePayload({
    version: UI_VERSION,

    initialized:
      Boolean(
        uiInitialized ||
          uiState.initialized ||
          AppCore?.state?.uiInitialized
      ),

    initInFlight:
      Boolean(initInFlight),

    syncingUserUI:
      Boolean(syncingUserUI),

    syncQueued:
      Boolean(syncQueued),

    languageSyncBound:
      Boolean(languageSyncBound),

    repairSyncBound:
      Boolean(repairSyncBound),

    routeSyncBound:
      Boolean(routeSyncBound),

    sessionSyncBound:
      Boolean(sessionSyncBound),

    themeSyncBound:
      Boolean(themeSyncBound),

    runtimeEventsBound:
      Boolean(runtimeEventsBound),

    toastBridgeBound:
      Boolean(toastBridgeBound),

    debugApiBound:
      Boolean(debugApiBound),

    boundEvents:
      [...boundEvents],

    boundEventKeys:
      Array.from(boundEventKeys),

    boundDisposers:
      boundDisposers.length,

    modules: {
      toast: Boolean(Toast),
      sidebar: Boolean(SidebarUI),
      topbar: Boolean(TopbarUI),
    },

    moduleInit: {
      toast:
        Toast
          ? wasModuleInitialized(Toast)
          : false,

      sidebar:
        SidebarUI
          ? wasModuleInitialized(SidebarUI)
          : false,

      topbar:
        TopbarUI
          ? wasModuleInitialized(TopbarUI)
          : false,
    },

    registry: {
      cached:
        Array.from(moduleRegistryCache.keys()),

      conflicts:
        Array.from(moduleRegistryConflicts),
    },

    user:
      AppCore
        ? getUserSnapshot(
            AppCore,
            Auth,
            Router
          )
        : null,

    initCount: uiState.initCount,
    syncCount: uiState.syncCount,
    repairCount: uiState.repairCount,
    repairRequestCount: uiState.repairRequestCount,
    skippedRepairCount: uiState.skippedRepairCount,
    eventCount: uiState.eventCount,
    errorCount: uiState.errorCount,

    lastEvent: uiState.lastEvent,
    lastEventAt: uiState.lastEventAt,
    lastEventAtIso:
      uiState.lastEventAt
        ? safeIsoDate(uiState.lastEventAt)
        : "",

    lastSyncAt: uiState.lastSyncAt,
    lastSyncAtIso:
      uiState.lastSyncAt
        ? safeIsoDate(uiState.lastSyncAt)
        : "",
    lastSyncReason: uiState.lastSyncReason,

    lastRepairAt: uiState.lastRepairAt,
    lastRepairAtIso:
      uiState.lastRepairAt
        ? safeIsoDate(uiState.lastRepairAt)
        : "",
    lastRepairReason: uiState.lastRepairReason,

    lastInitAt: uiState.lastInitAt,
    lastInitAtIso:
      uiState.lastInitAt
        ? safeIsoDate(uiState.lastInitAt)
        : "",
    lastInitOk: Boolean(uiState.lastInitOk),

    lastError: uiState.lastError,

    recent:
      safeClone(
        uiState.recent,
        []
      ),

    dedupe: {
      lastSyncSignature:
        redactSensitiveText(lastSyncSignature),
      lastSyncSignatureAt,
      lastSyncSignatureAtIso:
        lastSyncSignatureAt
          ? safeIsoDate(lastSyncSignatureAt)
          : "",

      lastRepairSignature:
        redactSensitiveText(lastRepairSignature),
      lastRepairSignatureAt,
      lastRepairSignatureAtIso:
        lastRepairSignatureAt
          ? safeIsoDate(lastRepairSignatureAt)
          : "",

      lastLangSignature:
        redactSensitiveText(lastLangSignature),
      lastLangSignatureAt,
      lastLangSignatureAtIso:
        lastLangSignatureAt
          ? safeIsoDate(lastLangSignatureAt)
          : "",

      lastRouteSignature:
        redactSensitiveText(lastRouteSignature),
      lastRouteSignatureAt,
      lastRouteSignatureAtIso:
        lastRouteSignatureAt
          ? safeIsoDate(lastRouteSignatureAt)
          : "",

      lastThemeSignature:
        redactSensitiveText(lastThemeSignature),
      lastThemeSignatureAt,
      lastThemeSignatureAtIso:
        lastThemeSignatureAt
          ? safeIsoDate(lastThemeSignatureAt)
          : "",

      lastEmitSignature:
        redactSensitiveText(lastEmitSignature),
      lastEmitSignatureAt,
      lastEmitSignatureAtIso:
        lastEmitSignatureAt
          ? safeIsoDate(lastEmitSignatureAt)
          : "",
    },
  });
}

export function resetUIRuntimeState() {
  for (const dispose of boundDisposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

  boundEvents.splice(0);
  boundEventKeys.clear();

  syncingUserUI = false;
  syncQueued = false;
  queuedSyncDeps = null;

  initInFlight = false;
  uiInitialized = false;

  languageSyncBound = false;
  repairSyncBound = false;
  routeSyncBound = false;
  sessionSyncBound = false;
  themeSyncBound = false;
  runtimeEventsBound = false;
  toastBridgeBound = false;
  debugApiBound = false;

  moduleInitState = new WeakMap();

  lastSyncSignature = "";
  lastSyncSignatureAt = 0;

  lastRepairSignature = "";
  lastRepairSignatureAt = 0;

  lastLangSignature = "";
  lastLangSignatureAt = 0;

  lastRouteSignature = "";
  lastRouteSignatureAt = 0;

  lastThemeSignature = "";
  lastThemeSignatureAt = 0;

  lastEmitSignature = "";
  lastEmitSignatureAt = 0;

  moduleRegistryCache.clear();
  moduleRegistryConflicts.clear();

  uiState.initialized = false;
  uiState.initCount = 0;
  uiState.syncCount = 0;
  uiState.repairCount = 0;
  uiState.repairRequestCount = 0;
  uiState.skippedRepairCount = 0;
  uiState.eventCount = 0;
  uiState.errorCount = 0;

  uiState.lastSyncAt = 0;
  uiState.lastSyncReason = "";

  uiState.lastRepairAt = 0;
  uiState.lastRepairReason = "";

  uiState.lastInitAt = 0;
  uiState.lastInitOk = false;

  uiState.lastEvent = "";
  uiState.lastEventAt = 0;

  uiState.lastError = null;
  uiState.recent = [];

  uiState.modules = {
    toast: false,
    sidebar: false,
    topbar: false,
  };

  return getUISystemsSnapshot();
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  UI_VERSION,

  syncUserUI,

  bindAppLanguageSync,
  bindUIRepairSync,
  bindUIRouteSync,
  bindUISessionSync,
  bindUIThemeSync,
  bindUIRuntimeEvents,

  bindToastBridge,

  repairUISystems,
  initUISystems,
  unbindUISystems,

  getUISystemsSnapshot,
  resetUIRuntimeState,
};
