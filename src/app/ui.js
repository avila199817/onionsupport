/* =========================================================
   Onion SPA - App UI Systems
   Archivo: src/app/ui.js

   App UI simple:
   - Registra Toast / Sidebar / Topbar sin duplicar.
   - Toast bridge canónico: AppCore.showToast / AppCore.setShowToast.
   - No pisa AppCore.toast: Toast sigue siendo módulo.
   - No inicializa Sidebar/Topbar en rutas auth/login.
   - Sidebar/Topbar se inicializan lazy al entrar en rutas app.
   - syncUserUI() es ligero y deduplicado.
   - repairUISystems() NO emite repair-request.
   - Sin HTTP, sin Router propio, sin Auth propio, sin estilos runtime.
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

export const UI_VERSION = "18.0.0-simple-fast";

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
  toast: Object.freeze(["toast", "Toast", "notifications"]),
  sidebar: Object.freeze(["sidebar", "sidebarUI", "SidebarUI", "Sidebar"]),
  topbar: Object.freeze(["topbar", "topbarUI", "TopbarUI", "Topbar"]),
});

const INIT_METHODS = Object.freeze(["init", "boot", "mount", "start"]);

const SIDEBAR_SYNC_METHODS = Object.freeze([
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

const TOPBAR_SYNC_METHODS = Object.freeze([
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

const HARD_REPAIR_METHODS = Object.freeze(["repair", "refresh", "sync"]);
const REBIND_METHODS = Object.freeze(["rebind", "rebindEvents", "bindEvents", "bind"]);

const TOAST_TYPES = Object.freeze([
  "success",
  "error",
  "warning",
  "warn",
  "info",
  "loading",
]);

const AUTH_LIKE_FALLBACK_ROUTES = Object.freeze([
  "/login",
  "/logout",
  "/activate-account",
  "/activate",
  "/activation",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/password-reset/confirm",
  "/2fa",
  "/otp",
  "/mfa",
  "/403",
  "/404",
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

const SYNC_DEDUPE_MS = 100;
const REPAIR_DEDUPE_MS = 180;
const EVENT_DEDUPE_MS = 80;

const MAX_RECENT = 20;
const MAX_SANITIZE_DEPTH = 4;

/* =========================================================
   RUNTIME
========================================================= */

let initialized = false;
let initInFlight = false;

let syncing = false;
let syncQueued = false;
let queuedDeps = null;

let runtimeBound = false;
let toastBridgeBound = false;
let debugApiBound = false;

let moduleInitState = new WeakMap();

let lastSyncSignature = "";
let lastSyncAt = 0;

let lastRepairSignature = "";
let lastRepairAt = 0;

let lastEventSignature = "";
let lastEventAt = 0;

const disposers = [];
const boundKeys = new Set();

const runtime = {
  initialized: false,

  initCount: 0,
  syncCount: 0,
  repairCount: 0,
  skippedRepairCount: 0,
  eventCount: 0,
  errorCount: 0,

  lastInitAt: 0,
  lastInitOk: false,

  lastSyncAt: 0,
  lastSyncReason: "",

  lastRepairAt: 0,
  lastRepairReason: "",

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
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
  if (value === 1) return true;
  if (value === 0) return false;

  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(clean)) return true;
    if (["false", "0", "no", "off"].includes(clean)) return false;
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
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
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

  if (value instanceof Error) return normalizeError(value);

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitize(item, depth + 1, keyHint));
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

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = sanitize(item, depth + 1, key);
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   LOG / EMIT
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
  try {
    AppCore?.utils?.log?.("[AppUI]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[AppUI]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.warn("[AppUI]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function errorLog(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.("[AppUI]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.error("[AppUI]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function eventSignature(eventName = "", payload = {}) {
  return [
    text(eventName, ""),
    text(payload?.reason || payload?.phase || "", ""),
    text(payload?.route || payload?.canonicalPath || "", ""),
    text(payload?.publicPath || "", ""),
  ].join("|");
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name) return false;

  const opts = object(options);
  const signature = eventSignature(name, payload);
  const stamp = now();

  if (opts.force !== true && signature === lastEventSignature && stamp - lastEventAt < EVENT_DEDUPE_MS) {
    return false;
  }

  lastEventSignature = signature;
  lastEventAt = stamp;

  const finalPayload = sanitize({
    source: SOURCE,
    version: UI_VERSION,
    at: iso(),
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
  } catch {}

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

  return snapshot;
}

/* =========================================================
   DEP RESOLUTION
========================================================= */

function getModule(AppCore, names = []) {
  if (!AppCore) return null;

  const keys = array(names).map((name) => text(name, "")).filter(Boolean);

  for (const key of keys) {
    try {
      const value = AppCore.modules?.get?.(key);
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
  }

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
   ROUTE / AUTH ROUTE
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/");

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
      const url = new URL(value, window.location.origin);
      value = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {}

  value = value.split("?")[0].split("#")[0] || "/";
  value = value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";

  const parts = value.split("/").filter(Boolean);

  if (/^@[A-Za-z0-9._-]{1,80}$/.test(parts[0] || "")) {
    const rest = parts.slice(1).join("/");
    return rest ? `/${rest}` : "/";
  }

  return value || "/";
}

function routeMatches(path = "/", candidate = "/") {
  const cleanPath = normalizePath(path);
  const cleanCandidate = normalizePath(candidate);

  if (!cleanCandidate || cleanCandidate === "/") return cleanPath === cleanCandidate;

  return cleanPath === cleanCandidate || cleanPath.startsWith(`${cleanCandidate}/`);
}

function currentRoute(AppCore = null, Router = null) {
  try {
    return (
      Router?.getCurrentCanonicalPath?.() ||
      Router?.getCurrentPath?.() ||
      AppCore?.state?.route ||
      AppCore?.state?.canonicalPath ||
      (isBrowser() ? `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}` : "/")
    );
  } catch {
    return "/";
  }
}

function currentPublicPath(AppCore = null, Router = null) {
  try {
    return (
      Router?.getCurrentPublicPath?.() ||
      Router?.getCurrentPath?.() ||
      AppCore?.state?.publicPath ||
      currentRoute(AppCore, Router)
    );
  } catch {
    return "/";
  }
}

function configuredAuthRoutes(AppCore = null) {
  const config = AppCore?.config || {};

  return [
    ...AUTH_LIKE_FALLBACK_ROUTES,
    ...array(config.authLikeRoutes),
    ...array(config.router?.authLikeRoutes),
    ...array(config.auth?.technicalPublicRoutes),
    ...array(config.technicalPublicRoutes),
    config.routes?.login,
    config.routes?.activateAccount,
    config.routes?.resetPassword,
    config.routes?.resetPasswordConfirm,
    config.routes?.forgotPassword,
    config.routes?.recoverPassword,
    config.routes?.passwordReset,
    config.routes?.twoFactor,
    config.routes?.otp,
    config.routes?.mfa,
  ].filter(Boolean);
}

function isAuthLikeRoute(AppCore = null, Router = null) {
  const route = currentRoute(AppCore, Router);

  return configuredAuthRoutes(AppCore).some((candidate) => routeMatches(route, candidate));
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

function isAuthenticated(AppCore, Auth, user) {
  let authenticated = false;

  try {
    if (isFn(AppCore?.isAuthenticated)) authenticated = Boolean(AppCore.isAuthenticated());
  } catch {}

  if (!authenticated) {
    try {
      if (isFn(Auth?.isAuthenticated)) authenticated = Boolean(Auth.isAuthenticated());
    } catch {}
  }

  if (!authenticated) {
    authenticated = Boolean(AppCore?.state?.authenticated || Auth?.authenticated);
  }

  return Boolean(authenticated && hasUser(user));
}

function getUserSnapshot(AppCore, Auth = null, Router = null) {
  const state = object(AppCore?.state);
  const user = getCurrentUser(AppCore, Auth);
  const role = getCurrentRole(AppCore, Auth, user);

  const route = currentRoute(AppCore, Router);
  const publicPath = currentPublicPath(AppCore, Router);

  return {
    user,
    userId: getUserId(user),

    authenticated: isAuthenticated(AppCore, Auth, user),

    role,

    username:
      user?.username ||
      user?.userName ||
      user?.slug ||
      user?.email ||
      user?.mail ||
      state.username ||
      null,

    displayName:
      user?.displayName ||
      user?.display_name ||
      user?.name ||
      user?.fullName ||
      user?.full_name ||
      user?.username ||
      user?.userName ||
      user?.email ||
      user?.mail ||
      null,

    avatarUrl:
      user?.avatarUrl ||
      user?.avatarURL ||
      user?.avatar ||
      user?.photoURL ||
      user?.picture ||
      user?.image ||
      null,

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
    authRoute: isAuthLikeRoute(AppCore, Router),
  };
}

/* =========================================================
   MODULE REGISTRY / INIT
========================================================= */

function registerAlias(AppCore, alias, moduleRef) {
  if (!AppCore || !alias || !moduleRef) return false;

  try {
    const current =
      AppCore.modules?.get?.(alias) ||
      AppCore.registry?.modules?.get?.(alias) ||
      AppCore?.[alias] ||
      null;

    if (current && current !== moduleRef) return false;
  } catch {}

  try {
    if (canExtend(AppCore)) defineValue(AppCore, alias, moduleRef);
  } catch {}

  try {
    AppCore.modules?.register?.(alias, moduleRef, {
      overwrite: true,
      replace: true,
      source: SOURCE,
      emit: false,
      silent: true,
    });
  } catch {}

  try {
    AppCore.modules?.set?.(alias, moduleRef, {
      overwrite: true,
      replace: true,
      source: SOURCE,
      emit: false,
      silent: true,
    });
  } catch {}

  try {
    AppCore.registry?.modules?.set?.(alias, moduleRef);
  } catch {}

  return true;
}

function registerAppModule(AppCore, name, moduleRef) {
  const key = text(name, "");

  if (!AppCore || !key || !moduleRef) return false;

  let ok = false;

  try {
    ok = registerModule(AppCore, key, moduleRef) !== false;
  } catch {}

  for (const alias of array(MODULE_ALIASES[key] || [key])) {
    ok = registerAlias(AppCore, alias, moduleRef) || ok;
  }

  if (ok) {
    emit(AppCore, EVENTS.moduleRegistered, {
      name: key,
    });
  }

  return ok;
}

function wasModuleInitialized(moduleRef) {
  try {
    if (!moduleRef) return false;

    if ((typeof moduleRef === "object" || typeof moduleRef === "function") && moduleInitState.get(moduleRef)) {
      return true;
    }

    return Boolean(
      moduleRef.__appUiInitialized === true ||
        moduleRef.initialized === true ||
        moduleRef.ready === true
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
  if (!moduleRef || !methodName || !isFn(moduleRef[methodName])) return false;

  const fn = moduleRef[methodName];

  const attempts = [
    () => fn.call(moduleRef, context),
    () => fn.call(moduleRef, context.user, context),
    () => fn.call(moduleRef, context.reason || methodName, context),
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

  if (context.force !== true && wasModuleInitialized(moduleRef)) return true;

  const ctx = {
    ...object(context),
    AppCore,
    label,
    reason: context.reason || `${label}:init`,
  };

  const result = callFirst(moduleRef, INIT_METHODS, ctx);
  const ok = result.called || !INIT_METHODS.some((method) => isFn(moduleRef?.[method]));

  if (ok) {
    markModuleInitialized(moduleRef, true);

    emit(AppCore, EVENTS.moduleInit, {
      label,
      method: result.method,
    });
  }

  return ok;
}

function ensureChromeReady(deps = {}, reason = "chrome-ready", force = false) {
  const {
    AppCore,
    Auth,
    Router,
    Store,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
  } = deps;

  if (!AppCore) {
    return {
      sidebar: false,
      topbar: false,
      skipped: true,
    };
  }

  const authRoute = isAuthLikeRoute(AppCore, Router);

  if (authRoute && force !== true) {
    return {
      sidebar: false,
      topbar: false,
      skipped: true,
      authRoute: true,
    };
  }

  const ctx = {
    AppCore,
    Auth,
    Router,
    Store,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    reason,
  };

  const sidebar = initModule(AppCore, SidebarUI, "SidebarUI", ctx);
  const topbar = initModule(AppCore, TopbarUI, "TopbarUI", ctx);

  return {
    sidebar,
    topbar,
    skipped: false,
    authRoute: false,
  };
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

      if (isFn(method)) return method.call(Toast, cleanMessage, payload);
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

  /*
    No pisar AppCore.toast: ese alias pertenece al módulo Toast.
  */
  if (canExtend(AppCore)) {
    ok = defineValue(AppCore, "showToast", bridge) || ok;
  }

  if (canExtend(AppCore?.utils)) {
    ok = defineValue(AppCore.utils, "showToast", bridge) || ok;
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

  if (!attached) return false;

  toastBridgeBound = true;
  defineValue(AppCore, "__toastBridgeBound", true);

  emit(AppCore, EVENTS.toastBridgeReady, {
    at: iso(),
  });

  return true;
}

/* =========================================================
   SYNC USER UI
========================================================= */

function syncSignature(snapshot = {}) {
  const data = {
    authenticated: Boolean(snapshot.authenticated),
    userId: text(snapshot.userId, ""),
    username: text(snapshot.username, ""),
    displayName: text(snapshot.displayName, ""),
    role: text(snapshot.role, ""),
    lang: text(snapshot.lang, ""),
    theme: text(snapshot.theme, ""),
    route: normalizePath(snapshot.route || "/"),
    publicPath: normalizePath(snapshot.publicPath || "/"),
    hasAvatar: Boolean(snapshot.avatarUrl),
    authRoute: Boolean(snapshot.authRoute),
  };

  try {
    return JSON.stringify(data);
  } catch {
    return String(now());
  }
}

function shouldSkipSync(snapshot = {}, force = false) {
  if (force === true) return false;

  const signature = syncSignature(snapshot);
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
    hardRepair = false,
    force = false,
  } = deps;

  if (!AppCore) return false;

  const cleanReason = text(reason, "sync-user-ui");
  const snapshot = getUserSnapshot(AppCore, Auth, Router);

  if (shouldSkipSync(snapshot, force)) {
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
      authRoute: snapshot.authRoute,
    };

    let chrome = {
      skipped: true,
    };

    let sidebarResult = {
      ok: false,
      methods: [],
    };

    let topbarResult = {
      ok: false,
      methods: [],
    };

    if (!snapshot.authRoute || force === true) {
      chrome = ensureChromeReady(deps, cleanReason, force === true && !snapshot.authRoute);

      if (hardRepair === true) {
        const sidebarRepair = callFirst(SidebarUI, HARD_REPAIR_METHODS, context);
        const topbarRepair = callFirst(TopbarUI, HARD_REPAIR_METHODS, context);

        sidebarResult = {
          ok: sidebarRepair.called,
          methods: sidebarRepair.method ? [sidebarRepair.method] : [],
        };

        topbarResult = {
          ok: topbarRepair.called,
          methods: topbarRepair.method ? [topbarRepair.method] : [],
        };
      } else {
        sidebarResult = callMany(SidebarUI, SIDEBAR_SYNC_METHODS, context);
        topbarResult = callMany(TopbarUI, TOPBAR_SYNC_METHODS, context);
      }

      if (rebind === true) {
        callFirst(SidebarUI, REBIND_METHODS, context);
        callFirst(TopbarUI, REBIND_METHODS, context);
      }
    }

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
      authRoute: snapshot.authRoute,
    });

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
      authRoute: snapshot.authRoute,
    });

    emit(AppCore, EVENTS.userSyncDone, {
      ok: true,
      reason: cleanReason,
      durationMs: now() - startedAt,
      authRoute: snapshot.authRoute,
      chrome,
      sidebar: sidebarResult,
      topbar: topbarResult,
      rebind: Boolean(rebind),
      hardRepair: Boolean(hardRepair),
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

      queueMicrotask(() => {
        syncUserUI(queued);
      });
    }
  }
}

/* =========================================================
   EVENT BINDING
========================================================= */

function rememberDisposer(disposer) {
  if (isFn(disposer)) disposers.push(disposer);
}

function boundKey(scope = DEFAULT_SCOPE, eventName = "", label = "") {
  return [
    text(scope, DEFAULT_SCOPE),
    text(eventName, ""),
    text(label || eventName, "default"),
  ].join("::");
}

function bindEvent(AppCore, scope, eventName, handler, label = "") {
  if (!AppCore || !eventName || !isFn(handler)) return false;

  const key = boundKey(scope, eventName, label);
  if (boundKeys.has(key)) return true;

  const wrapped = (eventOrPayload = {}) => {
    const detail = payloadFrom(eventOrPayload);
    const signature = eventSignature(eventName, detail);
    const stamp = now();

    if (signature === lastEventSignature && stamp - lastEventAt < EVENT_DEDUPE_MS) {
      return;
    }

    lastEventSignature = signature;
    lastEventAt = stamp;

    runtime.eventCount += 1;

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

      rememberDisposer(off);
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
        rememberDisposer(() => AppCore.events.off(eventName, wrapped));
      }

      boundKeys.add(key);
      return true;
    }
  } catch {}

  if (!isBrowser()) return false;

  try {
    window.addEventListener(eventName, wrapped);
    rememberDisposer(() => window.removeEventListener(eventName, wrapped));
    boundKeys.add(key);
    return true;
  } catch {
    return false;
  }
}

function bindSyncEvent(deps, eventName, reason, label = "") {
  const { AppCore, scope = DEFAULT_SCOPE } = deps;

  return bindEvent(
    AppCore,
    scope,
    eventName,
    (detail) => {
      syncUserUI({
        ...deps,
        reason,
        payload: detail,
        rebind: false,
        hardRepair: false,
        force: true,
      });
    },
    label || reason
  );
}

export function bindAppLanguageSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore } = deps;

  if (!AppCore) return false;
  if (bool(AppCore.__appLangUiBound)) return true;

  const ok = bindSyncEvent(deps, EVENTS.langChange, "app:lang:change", "lang-change");
  defineValue(AppCore, "__appLangUiBound", ok);

  return ok;
}

export function bindUIRepairSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, scope = DEFAULT_SCOPE } = deps;

  if (!AppCore) return false;
  if (bool(AppCore.__appUiRepairBound)) return true;

  const ok = bindEvent(
    AppCore,
    scope,
    EVENTS.repairRequest,
    (detail = {}) => {
      const source = text(detail.source, "");
      const event = text(detail.event, "");

      if (
        source === SOURCE ||
        source === EVENTS.userSync ||
        event === EVENTS.userSync ||
        source === "app:user-ui:sync"
      ) {
        runtime.skippedRepairCount += 1;
        return;
      }

      const signature = eventSignature("repair", detail);
      const stamp = now();

      if (signature === lastRepairSignature && stamp - lastRepairAt < REPAIR_DEDUPE_MS) {
        runtime.skippedRepairCount += 1;
        return;
      }

      lastRepairSignature = signature;
      lastRepairAt = stamp;

      repairUISystems({
        ...deps,
        reason: detail.reason || detail.phase || "app:ui:repair-request",
        payload: detail,
        rebind: detail.rebind === true,
        hardRepair: detail.hardRepair === true,
        force: detail.force === true,
      });
    },
    "repair-request"
  );

  defineValue(AppCore, "__appUiRepairBound", ok);

  return ok;
}

export function bindUIRouteSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore } = deps;

  if (!AppCore) return false;
  if (bool(AppCore.__appUiRouteSyncBound)) return true;

  const ok = [
    bindSyncEvent(deps, EVENTS.routeChange, "app:route:change", "route-change"),
    bindSyncEvent(deps, EVENTS.routerRendered, "router:rendered", "router-rendered"),
    bindSyncEvent(deps, EVENTS.routerAsyncComplete, "router:render:async-complete", "router-async-complete"),
  ].some(Boolean);

  defineValue(AppCore, "__appUiRouteSyncBound", ok);

  return ok;
}

export function bindUISessionSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore } = deps;

  if (!AppCore) return false;
  if (bool(AppCore.__appUiSessionSyncBound)) return true;

  const eventPairs = [
    [EVENTS.userChange, "app:user:change"],
    [EVENTS.sessionRestored, "app:session:restored"],
    [EVENTS.sessionCleared, "app:session:cleared"],
    [EVENTS.authSessionRestored, "auth:session:restored"],
    [EVENTS.authLoginSuccess, "auth:login:success"],
    [EVENTS.authLogout, "auth:logout"],
    [EVENTS.authLogoutSuccess, "auth:logout:success"],
  ];

  let ok = false;

  for (const [eventName, reason] of eventPairs) {
    ok = bindSyncEvent(deps, eventName, reason, `session:${eventName}`) || ok;
  }

  defineValue(AppCore, "__appUiSessionSyncBound", ok);

  return ok;
}

export function bindUIThemeSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore } = deps;

  if (!AppCore) return false;
  if (bool(AppCore.__appUiThemeSyncBound)) return true;

  const events = [
    EVENTS.themeChange,
    "onion:theme:change",
    "theme:change",
  ];

  let ok = false;

  for (const eventName of events) {
    ok = bindSyncEvent(deps, eventName, eventName, `theme:${eventName}`) || ok;
  }

  defineValue(AppCore, "__appUiThemeSyncBound", ok);

  return ok;
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
   REPAIR / INIT
========================================================= */

export function repairUISystems(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, reason = "repair-ui", rebind = false, hardRepair = false, force = false } = deps;

  if (!AppCore) return false;

  const signature = eventSignature("repair", { reason, route: currentRoute(AppCore, deps.Router), publicPath: currentPublicPath(AppCore, deps.Router) });
  const stamp = now();

  if (force !== true && signature === lastRepairSignature && stamp - lastRepairAt < REPAIR_DEDUPE_MS) {
    runtime.skippedRepairCount += 1;
    return true;
  }

  lastRepairSignature = signature;
  lastRepairAt = stamp;

  runtime.repairCount += 1;
  runtime.lastRepairAt = stamp;
  runtime.lastRepairReason = text(reason, "repair-ui");

  const ok = syncUserUI({
    ...deps,
    reason,
    rebind: rebind === true,
    hardRepair: hardRepair === true,
    force,
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
    if (stateRef) stateRef.uiInitialized = Boolean(value);
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
  } catch {}

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
    if (isBrowser()) window.__ONION_APP_UI__ = api;
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
    registerAppModule(AppCore, MODULES.toast, Toast);
    registerAppModule(AppCore, MODULES.sidebar, SidebarUI);
    registerAppModule(AppCore, MODULES.topbar, TopbarUI);

    bindToastBridge({ AppCore, Toast });
    bindUIRuntimeEvents({ ...deps, scope });
    exposeDebugApi(AppCore);

    syncUserUI({
      ...deps,
      reason: "init-ui-already-initialized",
      rebind: false,
      hardRepair: false,
      force: false,
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

    /*
      Sidebar/Topbar no se inicializan en login/auth.
      Se inicializan lazy cuando el Router entra en una ruta app.
    */
    ensureChromeReady(deps, "init-ui:chrome", force);

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
      force: false,
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
      authRoute: isAuthLikeRoute(AppCore, deps.Router),
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

  boundKeys.clear();

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

  return true;
}

export function getUISystemsSnapshot(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
    Auth,
    Router,
    SidebarUI,
    TopbarUI,
    Toast,
  } = deps;

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

    runtimeBound: Boolean(runtimeBound),
    toastBridgeBound: Boolean(toastBridgeBound),
    debugApiBound: Boolean(debugApiBound),

    boundKeyCount: boundKeys.size,
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
          authRoute: user.authRoute,
          hasAvatarUrl: Boolean(user.avatarUrl),
        }
      : null,

    initCount: runtime.initCount,
    syncCount: runtime.syncCount,
    repairCount: runtime.repairCount,
    skippedRepairCount: runtime.skippedRepairCount,
    eventCount: runtime.eventCount,
    errorCount: runtime.errorCount,

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
    },
  });
}

export function resetUIRuntimeState() {
  for (const dispose of disposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

  boundKeys.clear();

  initialized = false;
  initInFlight = false;

  syncing = false;
  syncQueued = false;
  queuedDeps = null;

  runtimeBound = false;
  toastBridgeBound = false;
  debugApiBound = false;

  moduleInitState = new WeakMap();

  lastSyncSignature = "";
  lastSyncAt = 0;

  lastRepairSignature = "";
  lastRepairAt = 0;

  lastEventSignature = "";
  lastEventAt = 0;

  runtime.initialized = false;
  runtime.initCount = 0;
  runtime.syncCount = 0;
  runtime.repairCount = 0;
  runtime.skippedRepairCount = 0;
  runtime.eventCount = 0;
  runtime.errorCount = 0;

  runtime.lastSyncAt = 0;
  runtime.lastSyncReason = "";

  runtime.lastRepairAt = 0;
  runtime.lastRepairReason = "";

  runtime.lastInitAt = 0;
  runtime.lastInitOk = false;

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
