/* =========================================================
   Onion SPA - App UI Systems
   Archivo: src/app/ui.js

   App UI simple:
   - Inicializa Toast / Sidebar / Topbar una sola vez.
   - Registra módulos en AppCore sin duplicados.
   - syncUserUI() solo sincroniza usuario / rol / ruta / tema / idioma.
   - repairUISystems() por defecto hace sync ligero.
   - rebind / hardRepair solo explícitos.
   - AppUI emite app:user-ui:sync.
   - AppUI NO escucha app:user-ui:sync.
   - AppUI NO emite app:ui:repair-request.
   - Sin CSS inline, sin estilos inyectados.
========================================================= */

import { registerModule } from "./helpers.js";

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

export const UI_VERSION = "17.0.0-clean";

const SOURCE = "app:ui";

const DEFAULT_SCOPE =
  APP_SCOPES?.ui ||
  APP_SCOPE ||
  "app:ui";

const EVENTS = Object.freeze({
  initStart: "app:ui:init:start",
  initSuccess: "app:ui:init:success",
  initError: "app:ui:init:error",

  ready: APP_EVENTS?.uiReady || "app:ui:ready",

  repair: APP_EVENTS?.uiRepair || "app:ui:repair",
  repairRequest: APP_EVENTS?.uiRepairRequest || "app:ui:repair-request",
  repairDone: "app:ui:repair:done",
  repairSkipped: "app:ui:repair:skipped",

  userSync: APP_EVENTS?.userUiSync || "app:user-ui:sync",
  userSyncStart: "app:user-ui:sync:start",
  userSyncDone: "app:user-ui:sync:done",
  userSyncError: "app:user-ui:sync:error",

  langChange: APP_EVENTS?.langChange || "app:lang:change",
  themeChange: APP_EVENTS?.themeChange || "app:theme:change",
  routeChange: APP_EVENTS?.routeChange || "app:route:change",

  routerRendered: ROUTER_EVENTS?.rendered || "router:rendered",
  routerAsyncComplete: ROUTER_EVENTS?.asyncComplete || "router:render:async-complete",

  sessionRestored: APP_EVENTS?.sessionRestored || "app:session:restored",
  sessionCleared: APP_EVENTS?.sessionCleared || "app:session:cleared",
  userChange: APP_EVENTS?.userChange || "app:user:change",

  authSessionRestored: AUTH_EVENTS?.sessionRestored || "auth:session:restored",
  authLoginSuccess: AUTH_EVENTS?.loginSuccess || "auth:login:success",
  authLogout: AUTH_EVENTS?.logout || "auth:logout",
  authLogoutSuccess: AUTH_EVENTS?.logoutSuccess || "auth:logout:success",

  toastBridgeReady: "app:ui:toast-bridge:ready",

  moduleRegistered: "app:ui:module:registered",
  moduleInit: "app:ui:module:init",
  moduleSkipped: "app:ui:module:skipped",
  moduleError: "app:ui:module:error",

  runtimeEventsBound: "app:ui:runtime-events:bound",
  runtimeEventsUnbound: "app:ui:runtime-events:unbound",

  debugReady: "app:ui:debug:ready",
});

const MODULES = Object.freeze({
  toast: "toast",
  sidebar: "sidebar",
  topbar: "topbar",
});

const MODULE_ALIASES = Object.freeze({
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

const INIT_METHODS = Object.freeze([
  "init",
  "boot",
  "mount",
  "start",
]);

const SIDEBAR_LIGHT_METHODS = Object.freeze([
  "renderUser",
  "refreshUser",
  "updateUser",
  "syncUser",
  "applyRoleVisibility",
  "syncRouteAndIndicator",
  "syncIndicator",
  "updateToggleLabel",
  "refresh",
  "sync",
]);

const TOPBAR_LIGHT_METHODS = Object.freeze([
  "renderUser",
  "refreshUser",
  "updateUser",
  "syncUser",
  "syncRoute",
  "updateRoute",
  "syncBreadcrumb",
  "updateBreadcrumb",
  "refresh",
  "sync",
]);

const HARD_REPAIR_METHODS = Object.freeze([
  "repair",
  "refresh",
  "sync",
]);

const REBIND_METHODS = Object.freeze([
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

const SENSITIVE_KEYS_RE =
  /token|secret|password|authorization|bearer|credential|jwt|session|refresh|otp|mfa|2fa|code/i;

const SENSITIVE_QUERY_PARAMS = Object.freeze([
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

const SYNC_DEDUPE_MS = 80;
const REPAIR_DEDUPE_MS = 140;
const ROUTE_DEDUPE_MS = 80;
const LANG_DEDUPE_MS = 120;
const THEME_DEDUPE_MS = 120;
const EMIT_DEDUPE_MS = 60;
const QUEUE_DELAY_MS = 0;

const MAX_RECENT = 40;
const MAX_SANITIZE_DEPTH = 5;

/* =========================================================
   RUNTIME
========================================================= */

let initialized = false;
let initInFlight = false;

let syncing = false;
let syncQueued = false;
let queuedDeps = null;

let languageBound = false;
let repairBound = false;
let routeBound = false;
let sessionBound = false;
let themeBound = false;
let runtimeBound = false;
let toastBridgeBound = false;
let debugApiBound = false;

let moduleInitState = new WeakMap();

let lastSyncSignature = "";
let lastSyncAt = 0;

let lastRepairSignature = "";
let lastRepairAt = 0;

let lastRouteSignature = "";
let lastRouteAt = 0;

let lastLangSignature = "";
let lastLangAt = 0;

let lastThemeSignature = "";
let lastThemeAt = 0;

let lastEmitSignature = "";
let lastEmitAt = 0;

const disposers = [];
const boundEvents = [];
const boundKeys = new Set();

const registryCache = new Map();
const registryConflicts = new Set();

const runtime = {
  initialized: false,

  initCount: 0,
  syncCount: 0,
  repairCount: 0,
  repairRequestCount: 0,
  skippedRepairCount: 0,
  eventCount: 0,
  errorCount: 0,

  lastInitAt: 0,
  lastInitOk: false,

  lastSyncAt: 0,
  lastSyncReason: "",

  lastRepairAt: 0,
  lastRepairReason: "",

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
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function object(value) {
  return isObject(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(key)) {
      return false;
    }
  }

  return Boolean(fallback);
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function clone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function timeout(callback, ms = 0) {
  if (!isFn(callback)) return null;

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

function canExtend(value) {
  try {
    return value && (typeof value === "object" || typeof value === "function") && Object.isExtensible(value);
  } catch {
    return false;
  }
}

function defineValue(target, key, value) {
  if (!target || !key || !canExtend(target)) return false;

  try {
    Object.defineProperty(target, key, {
      value,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {
    return false;
  }
}

function normalizeDeps(first = {}, second = {}) {
  if (
    isObject(first) &&
    (
      "AppCore" in first ||
      "Auth" in first ||
      "Router" in first ||
      "Store" in first ||
      "Toast" in first ||
      "I18n" in first ||
      "SidebarUI" in first ||
      "TopbarUI" in first
    )
  ) {
    return { ...first };
  }

  return {
    ...object(second),
    AppCore: first,
  };
}

function payloadFrom(eventOrPayload = {}) {
  const raw = eventOrPayload || {};

  if (isObject(raw.detail)) return raw.detail;
  if (isObject(raw.payload)) return raw.payload;
  if (isObject(raw)) return raw;

  return {};
}

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value = "") {
  let output = text(value, "");

  if (!output) return "";

  for (const name of SENSITIVE_QUERY_PARAMS) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    output = output
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/activate\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function isDomNodeLike(value) {
  if (!value || typeof value !== "object") return false;

  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {}

  return Boolean(value.nodeType && value.nodeName);
}

function normalizeError(error = null, fallback = "Error UI.") {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      name: "UIError",
      message: redact(error),
      code: "UI_ERROR",
    };
  }

  const source = object(error?.error || error?.reason || error);

  return {
    name: text(source.name || source.constructor?.name, "UIError"),
    message: redact(text(source.message || error, fallback)),
    code: redact(text(source.code || source.status || source.statusCode, "UI_ERROR")),
  };
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > MAX_SANITIZE_DEPTH) return "[MaxDepth]";

  if (SENSITIVE_KEYS_RE.test(text(keyHint, ""))) {
    return value ? "***" : value;
  }

  if (typeof value === "string") return redact(value);

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") return "[Function]";

  if (isDomNodeLike(value)) {
    return {
      node: text(value.nodeName, "Node"),
      id: text(value.id, ""),
      className: text(value.className?.baseVal || value.className, ""),
    };
  }

  if (value instanceof Error) return normalizeError(value);

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitize(item, depth + 1, keyHint));
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

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitize(item, depth + 1, key);
    }

    return output;
  }

  return value;
}

/* =========================================================
   LOG / EMIT / RECENT
========================================================= */

function pushRecent(event = {}) {
  const stamp = now();

  runtime.recent.unshift({
    ...sanitize(event),
    at: iso(stamp),
    atMs: stamp,
  });

  if (runtime.recent.length > MAX_RECENT) {
    runtime.recent = runtime.recent.slice(0, MAX_RECENT);
  }
}

function log(AppCore, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.log?.("[AppUI]", ...clean);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) console.log("[AppUI]", ...clean);
  } catch {}
}

function warn(AppCore, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.warn?.("[AppUI]", ...clean);
    return;
  } catch {}

  try {
    console.warn("[AppUI]", ...clean);
  } catch {}
}

function errorLog(AppCore, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.error?.("[AppUI]", ...clean);
    return;
  } catch {}

  try {
    console.error("[AppUI]", ...clean);
  } catch {}
}

function emitSignature(eventName = "", payload = {}) {
  return [
    text(eventName, ""),
    text(payload?.reason || payload?.phase || "", ""),
    text(payload?.source || "", ""),
    text(payload?.route || payload?.canonicalPath || "", ""),
    text(payload?.publicPath || "", ""),
    payload?.ok === false ? "fail" : "ok",
  ].join("|");
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");
  const opts = object(options);

  if (!name) return false;

  if (opts.dedupe !== false && opts.force !== true) {
    const signature = emitSignature(name, payload);
    const stamp = now();

    if (signature === lastEmitSignature && stamp - lastEmitAt < EMIT_DEDUPE_MS) {
      return false;
    }

    lastEmitSignature = signature;
    lastEmitAt = stamp;
  }

  const finalPayload = sanitize({
    source: SOURCE,
    version: UI_VERSION,
    ...object(payload),
  });

  let hasBus = false;
  let emitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      hasBus = true;
      AppCore.events.emit(name, finalPayload);
      emitted = true;
    }
  } catch (error) {
    warn(AppCore, `AppCore.events.emit("${name}") falló.`, error);
  }

  if ((opts.window === true || !hasBus) && isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: finalPayload }));
      emitted = true;
    } catch {}
  }

  return emitted;
}

function setLastError(AppCore, source = "ui", error = null) {
  runtime.errorCount += 1;

  const snapshot = {
    source: text(source, "ui"),
    error: normalizeError(error),
    message: redact(text(error?.message || error, "Error UI.")),
    at: iso(),
  };

  runtime.lastError = snapshot;

  pushRecent({
    event: "error",
    source: snapshot.source,
    message: snapshot.message,
  });

  emit(AppCore, EVENTS.moduleError, snapshot);

  return snapshot;
}

function recordEvent(eventName = "", payload = {}) {
  runtime.eventCount += 1;
  runtime.lastEvent = text(eventName, "");
  runtime.lastEventAt = now();

  pushRecent({
    event: runtime.lastEvent,
    payload: sanitize(payload),
  });
}

/* =========================================================
   DEP RESOLUTION
========================================================= */

function getModule(AppCore, names = []) {
  if (!AppCore) return null;

  const keys = array(names)
    .map((name) => text(name, ""))
    .filter(Boolean);

  try {
    for (const key of keys) {
      const value = AppCore.modules?.get?.(key);
      if (value) return value;
    }
  } catch {}

  try {
    for (const key of keys) {
      const value = AppCore.modules?.[key];
      if (value) return value;
    }
  } catch {}

  try {
    for (const key of keys) {
      const value = AppCore.registry?.modules?.get?.(key);
      if (value) return value;
    }
  } catch {}

  try {
    for (const key of keys) {
      const value = AppCore?.[key];
      if (value) return value;
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
      getModule(AppCore, ["Auth", "auth"]),

    Router:
      deps.Router ||
      AppCore?.Router ||
      AppCore?.router ||
      getModule(AppCore, ["Router", "router"]),

    Store:
      deps.Store ||
      AppCore?.Store ||
      AppCore?.store ||
      getModule(AppCore, ["Store", "store"]),

    Toast:
      deps.Toast ||
      AppCore?.Toast ||
      AppCore?.toastModule ||
      AppCore?.toast ||
      getModule(AppCore, MODULE_ALIASES.toast),

    I18n:
      deps.I18n ||
      AppCore?.I18n ||
      AppCore?.i18n ||
      getModule(AppCore, ["I18n", "i18n"]),

    SidebarUI:
      deps.SidebarUI ||
      AppCore?.SidebarUI ||
      AppCore?.sidebarUI ||
      AppCore?.sidebar ||
      getModule(AppCore, MODULE_ALIASES.sidebar),

    TopbarUI:
      deps.TopbarUI ||
      AppCore?.TopbarUI ||
      AppCore?.topbarUI ||
      AppCore?.topbar ||
      getModule(AppCore, MODULE_ALIASES.topbar),
  };
}

/* =========================================================
   USER SNAPSHOT
========================================================= */

function callGetter(ref, names = []) {
  for (const name of array(names)) {
    try {
      if (isFn(ref?.[name])) {
        const value = ref[name]();
        if (value) return value;
      }
    } catch {}
  }

  return null;
}

function getUserId(user = null) {
  return (
    text(user?.id, "") ||
    text(user?.userId, "") ||
    text(user?.user_id, "") ||
    text(user?._id, "") ||
    text(user?.uid, "") ||
    text(user?.sub, "") ||
    ""
  );
}

function hasUser(user = null) {
  return Boolean(
    user &&
      typeof user === "object" &&
      (
        getUserId(user) ||
        text(user.username, "") ||
        text(user.userName, "") ||
        text(user.email, "") ||
        text(user.mail, "") ||
        text(user.name, "") ||
        text(user.displayName, "")
      )
  );
}

function getCurrentUser(AppCore, Auth) {
  const state = object(AppCore?.state);
  const session = object(state.session);
  const auth = object(state.auth);

  return (
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    state.me ||
    state.account ||
    state.profile ||
    session.user ||
    auth.user ||
    callGetter(Auth, ["getUser", "getCurrentUser", "currentUser"]) ||
    Auth?.user ||
    null
  );
}

function getCurrentRole(AppCore, Auth, user) {
  const state = object(AppCore?.state);
  const session = object(state.session);
  const auth = object(state.auth);

  return (
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
    callGetter(Auth, ["getCurrentRole", "getRole"]) ||
    Auth?.role ||
    null
  );
}

function getAuthStatus(AppCore, Auth, user) {
  let authenticated = false;

  try {
    if (isFn(AppCore?.isAuthenticated)) {
      authenticated = Boolean(AppCore.isAuthenticated());
    }
  } catch {}

  if (!authenticated) {
    try {
      if (isFn(Auth?.isAuthenticated)) {
        authenticated = Boolean(Auth.isAuthenticated());
      }
    } catch {}
  }

  if (!authenticated) {
    authenticated = Boolean(AppCore?.state?.authenticated || Auth?.authenticated);
  }

  return Boolean(authenticated && hasUser(user));
}

function routerPublicPath(Router) {
  try {
    return Router?.getCurrentPublicPath?.() || Router?.getCurrentPath?.() || "";
  } catch {
    return "";
  }
}

function routerCanonicalPath(Router) {
  try {
    return Router?.getCurrentCanonicalPath?.() || Router?.getCurrentPath?.() || "";
  } catch {
    return "";
  }
}

function getUserSnapshot(AppCore, Auth = null, Router = null) {
  const state = object(AppCore?.state);

  const user = getCurrentUser(AppCore, Auth);
  const role = getCurrentRole(AppCore, Auth, user);

  const username =
    user?.username ||
    user?.userName ||
    user?.slug ||
    user?.email ||
    user?.mail ||
    state.username ||
    null;

  const displayName =
    user?.displayName ||
    user?.display_name ||
    user?.name ||
    user?.fullName ||
    user?.full_name ||
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
    routerCanonicalPath(Router) ||
    "/";

  const publicPath =
    state.publicPath ||
    routerPublicPath(Router) ||
    route ||
    "/";

  return {
    user,
    userId: getUserId(user),

    authenticated: getAuthStatus(AppCore, Auth, user),

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

function registryValue(AppCore, name = "") {
  const key = text(name, "");
  if (!AppCore || !key) return null;

  try {
    const value = AppCore.modules?.get?.(key);
    if (value) return value;
  } catch {}

  try {
    const value = AppCore.modules?.[key];
    if (value) return value;
  } catch {}

  try {
    const value = AppCore.registry?.modules?.get?.(key);
    if (value) return value;
  } catch {}

  try {
    const value = AppCore?.[key];
    if (value) return value;
  } catch {}

  return null;
}

function markConflict(AppCore, name = "", alias = "") {
  const key = `${text(name, "")}:${text(alias, "")}`;

  if (registryConflicts.has(key)) return;

  registryConflicts.add(key);

  warn(AppCore, "Conflicto de módulo UI. Se conserva instancia existente.", {
    name,
    alias,
  });
}

function registerAlias(AppCore, canonical, alias, moduleRef) {
  if (!AppCore || !alias || !moduleRef) return false;

  const existing = registryValue(AppCore, alias);

  if (existing && existing !== moduleRef) {
    markConflict(AppCore, canonical, alias);
    return false;
  }

  let ok = false;

  try {
    if (canExtend(AppCore)) {
      ok = defineValue(AppCore, alias, moduleRef) || ok;
    }
  } catch {}

  try {
    if (AppCore.modules && canExtend(AppCore.modules)) {
      if (!AppCore.modules[alias] || AppCore.modules[alias] === moduleRef) {
        AppCore.modules[alias] = moduleRef;
        ok = true;
      }
    }
  } catch {}

  try {
    if (isFn(AppCore.modules?.set) && !registryValue(AppCore, alias)) {
      const result = AppCore.modules.set(alias, moduleRef, {
        source: SOURCE,
        alias: true,
        canonical,
        emit: false,
        silent: true,
      });

      ok = result !== false || ok;
    }
  } catch {}

  try {
    if (isFn(AppCore.registry?.modules?.set) && !registryValue(AppCore, alias)) {
      AppCore.registry.modules.set(alias, moduleRef);
      ok = true;
    }
  } catch {}

  return ok;
}

function registerCanonical(AppCore, name, moduleRef) {
  const key = text(name, "");
  if (!AppCore || !key || !moduleRef) return false;

  const existing = registryValue(AppCore, key);

  if (existing && existing === moduleRef) return true;

  if (existing && existing !== moduleRef) {
    markConflict(AppCore, key, key);
    return false;
  }

  const cached = registryCache.get(key);
  if (cached?.moduleRef === moduleRef) return true;

  let ok = false;

  try {
    const result = registerModule(AppCore, key, moduleRef);
    ok = result !== false;
  } catch {}

  try {
    if (!ok && isFn(AppCore.modules?.register)) {
      const result = AppCore.modules.register(key, moduleRef, {
        overwrite: false,
        replace: false,
        idempotent: true,
        source: SOURCE,
      });

      ok = result !== false;
    }
  } catch {}

  try {
    if (!ok && isFn(AppCore.modules?.set)) {
      const result = AppCore.modules.set(key, moduleRef, {
        source: SOURCE,
        overwrite: false,
        replace: false,
      });

      ok = result !== false;
    }
  } catch {}

  try {
    if (!ok && AppCore.modules && canExtend(AppCore.modules)) {
      AppCore.modules[key] = moduleRef;
      ok = true;
    }
  } catch {}

  try {
    if (canExtend(AppCore)) {
      defineValue(AppCore, key, moduleRef);
    }
  } catch {}

  if (ok) {
    registryCache.set(key, {
      moduleRef,
      at: iso(),
    });
  }

  return ok;
}

function registerAppModule(AppCore, name, moduleRef) {
  const key = text(name, "");
  if (!AppCore || !key || !moduleRef) return false;

  let ok = registerCanonical(AppCore, key, moduleRef);

  for (const alias of array(MODULE_ALIASES[key] || [key])) {
    ok = registerAlias(AppCore, key, alias, moduleRef) || ok;
  }

  if (ok) {
    emit(AppCore, EVENTS.moduleRegistered, {
      name: key,
      aliases: [...array(MODULE_ALIASES[key] || [key])],
    });
  }

  return ok;
}

/* =========================================================
   MODULE CALLS
========================================================= */

function wasModuleInitialized(moduleRef) {
  try {
    if (!moduleRef) return false;

    if ((typeof moduleRef === "object" || typeof moduleRef === "function") && moduleInitState.get(moduleRef)) {
      return true;
    }

    return Boolean(
      moduleRef.__appUiInitialized === true ||
        moduleRef.initialized === true ||
        (moduleRef.ready === true && moduleRef.mounted === true)
    );
  } catch {
    return false;
  }
}

function markModuleInitialized(moduleRef, value = true) {
  try {
    if (moduleRef && (typeof moduleRef === "object" || typeof moduleRef === "function")) {
      moduleInitState.set(moduleRef, Boolean(value));
    }
  } catch {}

  try {
    if (moduleRef && canExtend(moduleRef)) {
      defineValue(moduleRef, "__appUiInitialized", Boolean(value));
    }
  } catch {}
}

function callMethod(moduleRef, methodName, context = {}) {
  if (!moduleRef || !methodName || !isFn(moduleRef[methodName])) {
    return false;
  }

  const fn = moduleRef[methodName];
  const ctx = object(context);
  const reason = text(ctx.reason, methodName);

  const attempts = [
    () => fn.call(moduleRef, ctx),
    () => fn.call(moduleRef, ctx.user, ctx),
    () => fn.call(moduleRef, reason, ctx),
    () => fn.call(moduleRef, ctx.AppCore, ctx),
    () => fn.call(moduleRef),
  ];

  for (const attempt of attempts) {
    try {
      const result = attempt();
      if (result !== false) return true;
    } catch {}
  }

  return false;
}

function callFirst(moduleRef, methodNames = [], context = {}) {
  for (const method of array(methodNames)) {
    if (callMethod(moduleRef, method, context)) {
      return {
        called: true,
        method,
      };
    }
  }

  return {
    called: false,
    method: "",
  };
}

function callMany(moduleRef, methodNames = [], context = {}) {
  const methods = [];

  for (const method of array(methodNames)) {
    if (callMethod(moduleRef, method, context)) {
      methods.push(method);
    }
  }

  return {
    called: methods.length > 0,
    methods,
  };
}

function initModule(AppCore, moduleRef, label = "module", context = {}) {
  if (!moduleRef) return false;

  const ctx = {
    ...object(context),
    AppCore,
    label,
    reason: context.reason || `${label}:init`,
  };

  if (ctx.force !== true && wasModuleInitialized(moduleRef)) {
    emit(AppCore, EVENTS.moduleSkipped, {
      label,
      reason: "already-initialized",
    });

    return true;
  }

  let ok = false;

  for (const method of INIT_METHODS) {
    try {
      if (callMethod(moduleRef, method, ctx)) {
        ok = true;
        break;
      }
    } catch (error) {
      setLastError(AppCore, `${label}.${method}`, error);
      warn(AppCore, `Error ${label}.${method}().`, error);
    }
  }

  if (!ok) {
    const hasInitMethod = INIT_METHODS.some((method) => isFn(moduleRef?.[method]));
    ok = !hasInitMethod;
  }

  if (ok) {
    markModuleInitialized(moduleRef, true);

    emit(AppCore, EVENTS.moduleInit, {
      label,
    });

    log(AppCore, `${label} inicializado.`);
  }

  return ok;
}

/* =========================================================
   LIGHT SYNC
========================================================= */

function syncModuleLight(moduleRef, methods = [], context = {}) {
  if (!moduleRef) {
    return {
      ok: false,
      methods: [],
    };
  }

  const result = callMany(moduleRef, methods, context);

  return {
    ok: result.called,
    methods: result.methods,
  };
}

function syncSidebar(SidebarUI, context = {}) {
  return syncModuleLight(SidebarUI, SIDEBAR_LIGHT_METHODS, context);
}

function syncTopbar(TopbarUI, context = {}) {
  return syncModuleLight(TopbarUI, TOPBAR_LIGHT_METHODS, context);
}

function hardRepair(moduleRef, context = {}) {
  return callFirst(moduleRef, HARD_REPAIR_METHODS, context);
}

function rebindModule(moduleRef, context = {}) {
  return callFirst(moduleRef, REBIND_METHODS, context);
}

/* =========================================================
   SYNC USER UI
========================================================= */

function syncSignature(snapshot = {}, reason = "") {
  const data = {
    reason: text(reason, ""),
    authenticated: Boolean(snapshot.authenticated),
    userId: text(snapshot.userId, ""),
    username: text(snapshot.username, ""),
    displayName: text(snapshot.displayName, ""),
    role: text(snapshot.role, ""),
    lang: text(snapshot.lang, ""),
    theme: text(snapshot.theme, ""),
    route: text(snapshot.route, ""),
    publicPath: text(snapshot.publicPath, ""),
    hasAvatar: Boolean(snapshot.avatarUrl),
  };

  try {
    return JSON.stringify(data);
  } catch {
    return String(now());
  }
}

function shouldSkipSync(snapshot = {}, reason = "", force = false) {
  if (force === true) return false;

  const signature = syncSignature(snapshot, reason);
  const stamp = now();

  if (signature === lastSyncSignature && stamp - lastSyncAt < SYNC_DEDUPE_MS) {
    return true;
  }

  lastSyncSignature = signature;
  lastSyncAt = stamp;

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
    hardRepair: useHardRepair = false,
    force = false,
  } = deps;

  if (!AppCore) return false;

  const cleanReason = text(reason, "sync-user-ui");
  const snapshot = getUserSnapshot(AppCore, Auth, Router);

  if (shouldSkipSync(snapshot, cleanReason, force)) {
    return true;
  }

  if (syncing) {
    syncQueued = true;

    queuedDeps = {
      ...deps,
      reason: `${cleanReason}:queued`,
      rebind: false,
      hardRepair: false,
      force: true,
    };

    return true;
  }

  syncing = true;

  const startedAt = now();

  emit(AppCore, EVENTS.userSyncStart, {
    reason: cleanReason,
    at: iso(startedAt),
  });

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
      payload: sanitize(payload),

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

    let sidebarResult = { ok: false };
    let topbarResult = { ok: false };

    if (useHardRepair === true) {
      const sidebarRepair = hardRepair(SidebarUI, context);
      const topbarRepair = hardRepair(TopbarUI, context);

      sidebarResult = {
        ok: sidebarRepair.called,
        repair: sidebarRepair.method,
      };

      topbarResult = {
        ok: topbarRepair.called,
        repair: topbarRepair.method,
      };
    } else {
      sidebarResult = syncSidebar(SidebarUI, context);
      topbarResult = syncTopbar(TopbarUI, context);
    }

    let sidebarRebind = { called: false, method: "" };
    let topbarRebind = { called: false, method: "" };

    if (rebind === true) {
      sidebarRebind = rebindModule(SidebarUI, context);
      topbarRebind = rebindModule(TopbarUI, context);
    }

    const ok = Boolean(
      sidebarResult.ok ||
        topbarResult.ok ||
        sidebarRebind.called ||
        topbarRebind.called
    );

    runtime.syncCount += 1;
    runtime.lastSyncAt = now();
    runtime.lastSyncReason = cleanReason;

    pushRecent({
      event: "sync",
      reason: cleanReason,
      authenticated: snapshot.authenticated,
      username: snapshot.username,
      route: snapshot.route,
      publicPath: snapshot.publicPath,
    });

    /*
      AppUI emite este evento.
      AppUI no lo escucha.
      No se emite user/avatar crudo.
    */
    emit(AppCore, EVENTS.userSync, {
      reason: cleanReason,

      userId: snapshot.userId,

      authenticated: snapshot.authenticated,

      username: snapshot.username,
      displayName: snapshot.displayName,
      hasAvatarUrl: Boolean(snapshot.avatarUrl),

      role: snapshot.role,
      lang: snapshot.lang,
      theme: snapshot.theme,

      route: snapshot.route,
      publicPath: snapshot.publicPath,
    });

    emit(AppCore, EVENTS.userSyncDone, {
      ok,

      reason: cleanReason,
      durationMs: now() - startedAt,

      authenticated: snapshot.authenticated,
      username: snapshot.username,
      role: snapshot.role,

      route: snapshot.route,
      publicPath: snapshot.publicPath,

      sidebar: sidebarResult,
      topbar: topbarResult,

      rebind: Boolean(rebind),
      hardRepair: Boolean(useHardRepair),

      sidebarRebind: sidebarRebind.method,
      topbarRebind: topbarRebind.method,
    });

    log(AppCore, "UI usuario sincronizada.", {
      reason: cleanReason,
      authenticated: snapshot.authenticated,
      username: snapshot.username,
      role: snapshot.role,
      sidebar: sidebarResult,
      topbar: topbarResult,
      rebind: Boolean(rebind),
      hardRepair: Boolean(useHardRepair),
    });

    return true;
  } catch (error) {
    setLastError(AppCore, "syncUserUI", error);

    errorLog(AppCore, "syncUserUI() error:", error);

    emit(AppCore, EVENTS.userSyncError, {
      message: text(error?.message || error, "syncUserUI() error."),
      reason: cleanReason,
    });

    return false;
  } finally {
    syncing = false;

    if (syncQueued) {
      const queued = queuedDeps || {
        ...deps,
        reason: `${cleanReason}:queued`,
        rebind: false,
        hardRepair: false,
        force: true,
      };

      syncQueued = false;
      queuedDeps = null;

      timeout(() => {
        syncUserUI(queued);
      }, QUEUE_DELAY_MS);
    }
  }
}

/* =========================================================
   EVENT BINDING
========================================================= */

function rememberDisposer(disposer) {
  if (isFn(disposer)) {
    disposers.push(disposer);
  }
}

function boundKey(scope = DEFAULT_SCOPE, eventName = "", label = "") {
  return [
    text(scope, DEFAULT_SCOPE),
    text(eventName, ""),
    text(label || eventName, "default"),
  ].join("::");
}

function bindEvent(AppCore, scope, eventName, handler, label = "") {
  if (!AppCore || !eventName || !isFn(handler)) {
    return false;
  }

  const key = boundKey(scope, eventName, label);

  if (boundKeys.has(key)) return true;

  const wrapped = (eventOrPayload = {}) => {
    const detail = payloadFrom(eventOrPayload);

    recordEvent(eventName, detail);

    try {
      handler(detail, eventOrPayload);
    } catch (error) {
      setLastError(AppCore, `event:${eventName}`, error);
    }
  };

  try {
    if (isFn(AppCore.cleanup?.event)) {
      const off = AppCore.cleanup.event(scope, eventName, wrapped, {
        source: SOURCE,
      });

      if (isFn(off)) rememberDisposer(off);

      boundEvents.push(eventName);
      boundKeys.add(key);

      return true;
    }
  } catch {}

  try {
    if (isFn(AppCore.events?.on)) {
      const off = AppCore.events.on(eventName, wrapped);

      if (isFn(off)) {
        rememberDisposer(off);
      } else if (isFn(AppCore.events?.off)) {
        rememberDisposer(() => {
          try {
            AppCore.events.off(eventName, wrapped);
          } catch {}
        });
      }

      boundEvents.push(eventName);
      boundKeys.add(key);

      return true;
    }
  } catch (error) {
    warn(AppCore, `AppCore.events.on("${eventName}") falló.`, error);
  }

  if (!isBrowser()) return false;

  try {
    window.addEventListener(eventName, wrapped);

    rememberDisposer(() => {
      try {
        window.removeEventListener(eventName, wrapped);
      } catch {}
    });

    boundEvents.push(eventName);
    boundKeys.add(key);

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   DEDUPE HELPERS
========================================================= */

function shouldSkipSignature(type, signature, ms) {
  const stamp = now();

  if (type === "repair") {
    if (signature === lastRepairSignature && stamp - lastRepairAt < ms) return true;
    lastRepairSignature = signature;
    lastRepairAt = stamp;
    return false;
  }

  if (type === "route") {
    if (signature === lastRouteSignature && stamp - lastRouteAt < ms) return true;
    lastRouteSignature = signature;
    lastRouteAt = stamp;
    return false;
  }

  if (type === "lang") {
    if (signature === lastLangSignature && stamp - lastLangAt < ms) return true;
    lastLangSignature = signature;
    lastLangAt = stamp;
    return false;
  }

  if (type === "theme") {
    if (signature === lastThemeSignature && stamp - lastThemeAt < ms) return true;
    lastThemeSignature = signature;
    lastThemeAt = stamp;
    return false;
  }

  return false;
}

function routeSignature(detail = {}) {
  return [
    text(detail.route || detail.canonicalPath || detail.path, ""),
    text(detail.publicPath || detail.href || detail.to, ""),
    text(detail.reason || detail.phase || "", ""),
  ].join("|");
}

function langSignature(detail = {}) {
  return [
    text(detail.lang, ""),
    text(detail.language, ""),
    text(detail.locale, ""),
  ].join("|");
}

function themeSignature(detail = {}) {
  return [
    text(detail.theme, ""),
    text(detail.mode, ""),
    text(detail.appearance, ""),
    text(detail.systemTheme, ""),
  ].join("|");
}

function repairSignature(detail = {}) {
  return [
    text(detail.source, ""),
    text(detail.reason || detail.phase, ""),
    text(detail.route || detail.canonicalPath, ""),
    text(detail.publicPath, ""),
    detail.rebind === true ? "rebind" : "no-rebind",
    detail.hardRepair === true ? "hard" : "light",
  ].join("|");
}

/* =========================================================
   RUNTIME EVENT BINDS
========================================================= */

export function bindAppLanguageSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, scope = DEFAULT_SCOPE } = deps;

  if (!AppCore) return false;

  if (languageBound || bool(AppCore.__appLangUiBound)) return true;

  const handler = (detail = {}) => {
    if (shouldSkipSignature("lang", langSignature(detail), LANG_DEDUPE_MS)) {
      return;
    }

    syncUserUI({
      ...deps,
      reason: "app:lang:change",
      payload: detail,
      rebind: false,
      hardRepair: false,
      force: true,
    });
  };

  const ok = bindEvent(AppCore, scope, EVENTS.langChange, handler, "lang-change");

  if (!ok) return false;

  languageBound = true;
  defineValue(AppCore, "__appLangUiBound", true);

  return true;
}

function shouldSkipRepairRequest(detail = {}) {
  const source = text(detail.source, "");
  const event = text(detail.event, "");

  if (
    source === SOURCE ||
    source === EVENTS.userSync ||
    event === EVENTS.userSync ||
    source === "app:user-ui:sync" ||
    event === "app:user-ui:sync"
  ) {
    return true;
  }

  return shouldSkipSignature(
    "repair",
    repairSignature(detail),
    REPAIR_DEDUPE_MS
  );
}

export function bindUIRepairSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, scope = DEFAULT_SCOPE } = deps;

  if (!AppCore) return false;

  if (repairBound || bool(AppCore.__appUiRepairBound)) return true;

  const handler = (detail = {}) => {
    runtime.repairRequestCount += 1;

    if (shouldSkipRepairRequest(detail)) {
      runtime.skippedRepairCount += 1;

      emit(AppCore, EVENTS.repairSkipped, {
        reason: detail.reason || detail.phase || "repair-request-deduped",
        detail: {
          source: detail.source || null,
          route: detail.route || detail.canonicalPath || null,
          publicPath: detail.publicPath || null,
        },
      });

      return;
    }

    repairUISystems({
      ...deps,
      reason: detail.reason || detail.phase || "app:ui:repair-request",
      payload: detail,
      rebind: detail.rebind === true,
      hardRepair: detail.hardRepair === true,
      force: detail.force === true,
    });
  };

  const ok = bindEvent(AppCore, scope, EVENTS.repairRequest, handler, "repair-request");

  if (!ok) return false;

  repairBound = true;
  defineValue(AppCore, "__appUiRepairBound", true);

  return true;
}

export function bindUIRouteSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, scope = DEFAULT_SCOPE } = deps;

  if (!AppCore) return false;

  if (routeBound || bool(AppCore.__appUiRouteSyncBound)) return true;

  const sync = (reason, detail = {}) => {
    if (shouldSkipSignature("route", routeSignature(detail), ROUTE_DEDUPE_MS)) {
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

  const any = [
    bindEvent(AppCore, scope, EVENTS.routeChange, (detail) => sync("app:route:change", detail), "route-change"),
    bindEvent(AppCore, scope, EVENTS.routerRendered, (detail) => sync("router:rendered", detail), "router-rendered"),
    bindEvent(AppCore, scope, EVENTS.routerAsyncComplete, (detail) => sync("router:render:async-complete", detail), "router-async-complete"),
  ].some(Boolean);

  routeBound = any;
  defineValue(AppCore, "__appUiRouteSyncBound", any);

  return any;
}

export function bindUISessionSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, scope = DEFAULT_SCOPE } = deps;

  if (!AppCore) return false;

  if (sessionBound || bool(AppCore.__appUiSessionSyncBound)) return true;

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

  const eventPairs = [
    [EVENTS.userChange, "app:user:change"],
    [EVENTS.sessionRestored, "app:session:restored"],
    [EVENTS.sessionCleared, "app:session:cleared"],
    [EVENTS.authSessionRestored, "auth:session:restored"],
    [EVENTS.authLoginSuccess, "auth:login:success"],
    [EVENTS.authLogout, "auth:logout"],
    [EVENTS.authLogoutSuccess, "auth:logout:success"],
  ];

  let any = false;

  for (const [eventName, reason] of eventPairs) {
    any = bindEvent(
      AppCore,
      scope,
      eventName,
      (detail) => sync(reason, detail),
      `session:${eventName}`
    ) || any;
  }

  sessionBound = any;
  defineValue(AppCore, "__appUiSessionSyncBound", any);

  return any;
}

export function bindUIThemeSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, scope = DEFAULT_SCOPE } = deps;

  if (!AppCore) return false;

  if (themeBound || bool(AppCore.__appUiThemeSyncBound)) return true;

  const sync = (reason, detail = {}) => {
    if (shouldSkipSignature("theme", themeSignature(detail), THEME_DEDUPE_MS)) {
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
    EVENTS.themeChange,
    "onion:theme:change",
    "theme:change",
  ];

  let any = false;

  for (const eventName of events) {
    any = bindEvent(
      AppCore,
      scope,
      eventName,
      (detail) => sync(eventName, detail),
      `theme:${eventName}`
    ) || any;
  }

  themeBound = any;
  defineValue(AppCore, "__appUiThemeSyncBound", any);

  return any;
}

export function bindUIRuntimeEvents(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore } = deps;

  if (!AppCore) return false;

  if (runtimeBound || bool(AppCore.__appUiRuntimeEventsBound)) return true;

  const lang = bindAppLanguageSync(deps);
  const repair = bindUIRepairSync(deps);
  const route = bindUIRouteSync(deps);
  const session = bindUISessionSync(deps);
  const theme = bindUIThemeSync(deps);

  runtimeBound = Boolean(lang || repair || route || session || theme);

  defineValue(AppCore, "__appUiRuntimeEventsBound", runtimeBound);

  if (runtimeBound) {
    emit(AppCore, EVENTS.runtimeEventsBound, {
      langBound: lang,
      repairBound: repair,
      routeBound: route,
      sessionBound: session,
      themeBound: theme,
      at: iso(),
    });
  }

  return runtimeBound;
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

function normalizeToastType(type = "info") {
  const clean = text(type, "info").toLowerCase();

  if (clean === "warn") return "warning";

  return TOAST_TYPES.includes(clean) ? clean : "info";
}

function toastMethod(Toast, type = "info") {
  const clean = normalizeToastType(type);

  if (clean === "warning" && isFn(Toast?.warning)) return Toast.warning;
  if (clean === "warning" && isFn(Toast?.warn)) return Toast.warn;

  return Toast?.[clean] || null;
}

function createToastBridge(AppCore, Toast) {
  return function showToast(message = "", type = "info", options = {}) {
    let payload = {};
    let cleanMessage = "";
    let cleanType = "info";

    if (isObject(message)) {
      payload = object(message);
      cleanMessage = text(payload.message || payload.text || payload.title, "");
      cleanType = normalizeToastType(payload.type || payload.variant || type);
    } else {
      cleanMessage = text(message, "");
      cleanType = normalizeToastType(type);

      payload = {
        ...object(options),
        type: cleanType,
        message: cleanMessage,
      };
    }

    if (!cleanMessage) return null;

    payload = {
      ...payload,
      type: cleanType,
      message: cleanMessage,
    };

    try {
      const method = toastMethod(Toast, cleanType);

      if (isFn(method)) {
        return method.call(Toast, cleanMessage, payload);
      }

      if (isFn(Toast?.show)) return Toast.show(payload);
      if (isFn(Toast?.notify)) return Toast.notify(payload);

      return null;
    } catch (error) {
      warn(AppCore, "Toast bridge error:", error);
      return null;
    }
  };
}

function attachToastBridge(AppCore, bridge) {
  let ok = false;

  try {
    if (isFn(AppCore?.setShowToast)) {
      AppCore.setShowToast(bridge);
      ok = true;
    }
  } catch {}

  if (canExtend(AppCore)) {
    ok = defineValue(AppCore, "showToast", bridge) || ok;
    ok = defineValue(AppCore, "toast", bridge) || ok;
  }

  if (canExtend(AppCore?.utils)) {
    ok = defineValue(AppCore.utils, "showToast", bridge) || ok;
    ok = defineValue(AppCore.utils, "toast", bridge) || ok;
  }

  return ok;
}

export function bindToastBridge(first = {}, second = null) {
  const deps = resolveDeps(first, { Toast: second });
  const { AppCore, Toast } = deps;

  if (!AppCore || !Toast) return false;

  if (toastBridgeBound || bool(AppCore.__toastBridgeBound)) return true;

  const bridge = createToastBridge(AppCore, Toast);
  const attached = attachToastBridge(AppCore, bridge);

  if (!attached) {
    warn(AppCore, "Toast bridge no pudo montarse: objeto no extensible.");
    return false;
  }

  toastBridgeBound = true;
  defineValue(AppCore, "__toastBridgeBound", true);

  emit(AppCore, EVENTS.toastBridgeReady, {
    at: iso(),
  });

  log(AppCore, "Toast bridge activo.");

  return true;
}

/* =========================================================
   REPAIR / INIT
========================================================= */

export function repairUISystems(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, reason = "repair-ui", rebind = false, hardRepair = false } = deps;

  runtime.repairCount += 1;
  runtime.lastRepairAt = now();
  runtime.lastRepairReason = text(reason, "repair-ui");

  /*
    Importante:
    repairUISystems NO emite app:ui:repair-request.
    Sólo ejecuta sync ligero salvo flags explícitos.
  */
  const ok = syncUserUI({
    ...deps,
    reason,
    rebind: rebind === true,
    hardRepair: hardRepair === true,
    force: true,
  });

  emit(AppCore, EVENTS.repair, {
    reason: text(reason, "repair-ui"),
    ok,
    rebind: rebind === true,
    hardRepair: hardRepair === true,
    at: iso(),
  });

  emit(AppCore, EVENTS.repairDone, {
    reason: text(reason, "repair-ui"),
    ok,
    at: iso(),
  });

  return ok;
}

function markUiInitialized(AppCore, stateRef = null, value = true) {
  try {
    if (stateRef) {
      stateRef.uiInitialized = Boolean(value);
    }
  } catch {}

  try {
    AppCore?.setState?.(
      { uiInitialized: Boolean(value) },
      {
        source: SOURCE,
        emit: false,
        emitState: false,
        silent: true,
      }
    );
  } catch {
    try {
      AppCore?.setState?.({ uiInitialized: Boolean(value) });
    } catch {}
  }

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      AppCore.state.uiInitialized = Boolean(value);
    }
  } catch {}

  return true;
}

function exposeDebugApi(AppCore = null) {
  if (debugApiBound && isBrowser() && window.__ONION_APP_UI__) {
    return window.__ONION_APP_UI__;
  }

  const api = {
    version: UI_VERSION,

    sync(options = {}) {
      return syncUserUI({
        AppCore,
        ...object(options),
      });
    },

    repair(options = {}) {
      return repairUISystems({
        AppCore,
        ...object(options),
      });
    },

    unbind() {
      return unbindUISystems(AppCore);
    },

    snapshot(extra = {}) {
      return getUISystemsSnapshot({
        AppCore,
        ...object(extra),
      });
    },

    reset: resetUIRuntimeState,
  };

  try {
    if (isBrowser()) {
      window.__ONION_APP_UI__ = api;
    }
  } catch {}

  try {
    if (AppCore && typeof AppCore === "object" && Object.isExtensible(AppCore)) {
      Object.defineProperty(AppCore, "UI", {
        value: api,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }
  } catch {}

  debugApiBound = true;

  emit(AppCore, EVENTS.debugReady, {
    at: iso(),
  });

  return api;
}

export function initUISystems(first = {}) {
  const deps = resolveDeps(first);

  const {
    AppCore,
    Toast,
    SidebarUI,
    TopbarUI,
    state: stateRef,
    scope = DEFAULT_SCOPE,
    force = false,
  } = deps;

  if (!AppCore) return false;

  if (initInFlight) return true;

  if (
    !force &&
    (
      initialized ||
      runtime.initialized ||
      stateRef?.uiInitialized ||
      AppCore?.state?.uiInitialized
    )
  ) {
    bindToastBridge({ AppCore, Toast });
    bindUIRuntimeEvents({ ...deps, scope });
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

  const startedAt = now();

  emit(AppCore, EVENTS.initStart, {
    scope,
    version: UI_VERSION,
    at: iso(startedAt),
  });

  try {
    registerAppModule(AppCore, MODULES.toast, Toast);
    registerAppModule(AppCore, MODULES.sidebar, SidebarUI);
    registerAppModule(AppCore, MODULES.topbar, TopbarUI);

    runtime.modules.toast = Boolean(Toast);
    runtime.modules.sidebar = Boolean(SidebarUI);
    runtime.modules.topbar = Boolean(TopbarUI);

    initModule(AppCore, Toast, "Toast", {
      ...deps,
      reason: "init-ui:toast",
      force,
    });

    bindToastBridge({ AppCore, Toast });

    initModule(AppCore, SidebarUI, "SidebarUI", {
      ...deps,
      reason: "init-ui:sidebar",
      force,
    });

    initModule(AppCore, TopbarUI, "TopbarUI", {
      ...deps,
      reason: "init-ui:topbar",
      force,
    });

    bindUIRuntimeEvents({
      ...deps,
      scope,
    });

    exposeDebugApi(AppCore);

    syncUserUI({
      ...deps,
      reason: "init-ui",
      rebind: false,
      hardRepair: false,
      force: true,
    });

    initialized = true;

    runtime.initialized = true;
    runtime.initCount += 1;
    runtime.lastInitAt = now();
    runtime.lastInitOk = true;

    markUiInitialized(AppCore, stateRef, true);

    const payload = {
      ok: true,
      scope,
      version: UI_VERSION,
      durationMs: now() - startedAt,
      modules: {
        ...runtime.modules,
      },
      at: iso(),
    };

    emit(AppCore, EVENTS.initSuccess, payload);
    emit(AppCore, EVENTS.ready, payload);

    log(AppCore, "UISystems listos.", payload);

    return true;
  } catch (error) {
    runtime.lastInitOk = false;

    setLastError(AppCore, "initUISystems", error);

    errorLog(AppCore, "initUISystems() fatal:", error);

    emit(AppCore, EVENTS.initError, {
      message: text(error?.message || error, "initUISystems() fatal."),
      error: normalizeError(error),
      at: iso(),
    });

    return false;
  } finally {
    initInFlight = false;
  }
}

/* =========================================================
   UNBIND / SNAPSHOT / RESET
========================================================= */

export function unbindUISystems(AppCore = null) {
  for (const dispose of disposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

  boundEvents.splice(0);
  boundKeys.clear();

  languageBound = false;
  repairBound = false;
  routeBound = false;
  sessionBound = false;
  themeBound = false;
  runtimeBound = false;
  toastBridgeBound = false;

  if (AppCore) {
    defineValue(AppCore, "__appLangUiBound", false);
    defineValue(AppCore, "__appUiRepairBound", false);
    defineValue(AppCore, "__appUiRouteSyncBound", false);
    defineValue(AppCore, "__appUiSessionSyncBound", false);
    defineValue(AppCore, "__appUiThemeSyncBound", false);
    defineValue(AppCore, "__appUiRuntimeEventsBound", false);
    defineValue(AppCore, "__toastBridgeBound", false);
  }

  emit(AppCore, EVENTS.runtimeEventsUnbound, {
    at: iso(),
  });

  log(AppCore, "UISystems listeners desactivados.");

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

  const user = AppCore
    ? getUserSnapshot(AppCore, Auth, Router)
    : null;

  return sanitize({
    version: UI_VERSION,

    initialized: Boolean(
      initialized ||
        runtime.initialized ||
        AppCore?.state?.uiInitialized
    ),

    initInFlight: Boolean(initInFlight),
    syncingUserUI: Boolean(syncing),
    syncQueued: Boolean(syncQueued),

    languageBound: Boolean(languageBound),
    repairBound: Boolean(repairBound),
    routeBound: Boolean(routeBound),
    sessionBound: Boolean(sessionBound),
    themeBound: Boolean(themeBound),
    runtimeBound: Boolean(runtimeBound),
    toastBridgeBound: Boolean(toastBridgeBound),
    debugApiBound: Boolean(debugApiBound),

    boundEvents: [...boundEvents],
    boundKeys: Array.from(boundKeys),
    disposerCount: disposers.length,

    modules: {
      toast: Boolean(Toast),
      sidebar: Boolean(SidebarUI),
      topbar: Boolean(TopbarUI),
    },

    moduleInit: {
      toast: Toast ? wasModuleInitialized(Toast) : false,
      sidebar: SidebarUI ? wasModuleInitialized(SidebarUI) : false,
      topbar: TopbarUI ? wasModuleInitialized(TopbarUI) : false,
    },

    registry: {
      cached: Array.from(registryCache.keys()),
      conflicts: Array.from(registryConflicts),
    },

    user: user
      ? {
          authenticated: user.authenticated,
          userId: user.userId,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          lang: user.lang,
          theme: user.theme,
          route: user.route,
          publicPath: user.publicPath,
          hasAvatarUrl: Boolean(user.avatarUrl),
        }
      : null,

    initCount: runtime.initCount,
    syncCount: runtime.syncCount,
    repairCount: runtime.repairCount,
    repairRequestCount: runtime.repairRequestCount,
    skippedRepairCount: runtime.skippedRepairCount,
    eventCount: runtime.eventCount,
    errorCount: runtime.errorCount,

    lastEvent: runtime.lastEvent,
    lastEventAt: runtime.lastEventAt,
    lastEventAtIso: runtime.lastEventAt ? iso(runtime.lastEventAt) : "",

    lastSyncAt: runtime.lastSyncAt,
    lastSyncAtIso: runtime.lastSyncAt ? iso(runtime.lastSyncAt) : "",
    lastSyncReason: runtime.lastSyncReason,

    lastRepairAt: runtime.lastRepairAt,
    lastRepairAtIso: runtime.lastRepairAt ? iso(runtime.lastRepairAt) : "",
    lastRepairReason: runtime.lastRepairReason,

    lastInitAt: runtime.lastInitAt,
    lastInitAtIso: runtime.lastInitAt ? iso(runtime.lastInitAt) : "",
    lastInitOk: Boolean(runtime.lastInitOk),

    lastError: runtime.lastError,

    recent: clone(runtime.recent, []),

    dedupe: {
      lastSyncSignature: redact(lastSyncSignature),
      lastSyncAt,
      lastSyncAtIso: lastSyncAt ? iso(lastSyncAt) : "",

      lastRepairSignature: redact(lastRepairSignature),
      lastRepairAt,
      lastRepairAtIso: lastRepairAt ? iso(lastRepairAt) : "",

      lastRouteSignature: redact(lastRouteSignature),
      lastRouteAt,
      lastRouteAtIso: lastRouteAt ? iso(lastRouteAt) : "",

      lastLangSignature: redact(lastLangSignature),
      lastLangAt,
      lastLangAtIso: lastLangAt ? iso(lastLangAt) : "",

      lastThemeSignature: redact(lastThemeSignature),
      lastThemeAt,
      lastThemeAtIso: lastThemeAt ? iso(lastThemeAt) : "",

      lastEmitSignature: redact(lastEmitSignature),
      lastEmitAt,
      lastEmitAtIso: lastEmitAt ? iso(lastEmitAt) : "",
    },
  });
}

export function resetUIRuntimeState() {
  for (const dispose of disposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

  boundEvents.splice(0);
  boundKeys.clear();

  initialized = false;
  initInFlight = false;

  syncing = false;
  syncQueued = false;
  queuedDeps = null;

  languageBound = false;
  repairBound = false;
  routeBound = false;
  sessionBound = false;
  themeBound = false;
  runtimeBound = false;
  toastBridgeBound = false;
  debugApiBound = false;

  moduleInitState = new WeakMap();

  lastSyncSignature = "";
  lastSyncAt = 0;

  lastRepairSignature = "";
  lastRepairAt = 0;

  lastRouteSignature = "";
  lastRouteAt = 0;

  lastLangSignature = "";
  lastLangAt = 0;

  lastThemeSignature = "";
  lastThemeAt = 0;

  lastEmitSignature = "";
  lastEmitAt = 0;

  registryCache.clear();
  registryConflicts.clear();

  runtime.initialized = false;
  runtime.initCount = 0;
  runtime.syncCount = 0;
  runtime.repairCount = 0;
  runtime.repairRequestCount = 0;
  runtime.skippedRepairCount = 0;
  runtime.eventCount = 0;
  runtime.errorCount = 0;

  runtime.lastSyncAt = 0;
  runtime.lastSyncReason = "";

  runtime.lastRepairAt = 0;
  runtime.lastRepairReason = "";

  runtime.lastInitAt = 0;
  runtime.lastInitOk = false;

  runtime.lastEvent = "";
  runtime.lastEventAt = 0;

  runtime.lastError = null;
  runtime.recent = [];

  runtime.modules = {
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
