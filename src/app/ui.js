/* =========================================================
   Onion SPA - App UI Systems
   Archivo: src/app/ui.js

   APP UI · SIMPLE ADAPTER
   - registra Toast / SidebarUI / TopbarUI
   - monta chrome sólo cuando corresponde
   - sincroniza usuario visible bajo demanda
   - repara UI bajo demanda
   - expone puente AppCore.showToast
   - sin Auth propio, Router propio, Store, fetch, storage ni vistas
   - sin listeners de ruta/sesión por defecto para evitar loops
========================================================= */

import { registerModule } from "./helpers.js";

export const UI_VERSION = "21.0.1-simple";

const SOURCE = "app.ui";
const DEBUG_KEY = "__ONION_APP_UI__";
const DEFAULT_SCOPE = "app:ui";

const INIT_METHODS = Object.freeze(["init", "boot", "mount", "start"]);
const SYNC_METHODS = Object.freeze(["syncUser", "renderUser", "updateUser", "sync", "refresh"]);
const REPAIR_METHODS = Object.freeze(["repair", "refresh", "sync"]);
const REBIND_METHODS = Object.freeze(["rebind", "rebindEvents", "bindEvents", "bind"]);

const AUTH_ROUTES = Object.freeze([
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/auth/login",
  "/logout",
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
  "/reset-password",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/password-reset",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
  "/forgot-password",
  "/recover-password",
  "/recover",
  "/2fa",
  "/otp",
  "/mfa",
  "/403",
  "/404",
]);

const EVENTS = Object.freeze({
  initStart: "app:ui:init:start",
  initDone: "app:ui:init:done",
  initError: "app:ui:init:error",
  ready: "app:ui:ready",
  userSync: "app:user-ui:sync",
  userSyncDone: "app:user-ui:sync:done",
  userSyncError: "app:user-ui:sync:error",
  repair: "app:ui:repair",
  repairDone: "app:ui:repair:done",
  repairRequest: "app:ui:repair-request",
  toastBridgeReady: "app:ui:toast-bridge:ready",
  runtimeEventsBound: "app:ui:runtime-events:bound",
  runtimeEventsUnbound: "app:ui:runtime-events:unbound",
});

const SYNC_DEDUPE_MS = 160;
const REPAIR_DEDUPE_MS = 220;
const EVENT_DEDUPE_MS = 120;

const SENSITIVE_KEY_RE = /token|secret|password|authorization|bearer|credential|jwt|session|refresh|otp|mfa|2fa|code/i;
const TOKEN_QUERY_RE = /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|mfaToken|mfa_token|authorization|jwt|session|sid)=)([^&#\s]+)/gi;

let initialized = false;
let initInFlight = false;
let syncing = false;
let queuedSync = null;
let runtimeBound = false;
let toastBridgeBound = false;
let debugApiBound = false;
let moduleInitState = new WeakMap();

let lastSyncSignature = "";
let lastSyncAt = 0;
let lastRepairSignature = "";
let lastRepairAt = 0;
let lastEmitSignature = "";
let lastEmitAt = 0;
let lastInboundSignature = "";
let lastInboundAt = 0;

const disposers = [];
const boundKeys = new Set();

const runtime = {
  initCount: 0,
  syncCount: 0,
  repairCount: 0,
  errorCount: 0,
  lastInitAt: 0,
  lastInitOk: false,
  lastSyncAt: 0,
  lastSyncReason: "",
  lastRepairAt: 0,
  lastRepairReason: "",
  lastError: null,
};

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function object(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
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

function canExtend(value) {
  try {
    return Boolean(value && (typeof value === "object" || typeof value === "function") && Object.isExtensible(value));
  } catch {
    return false;
  }
}

function defineValue(target, key, value) {
  if (!target || !key || !canExtend(target)) return false;

  try {
    Object.defineProperty(target, key, { value, configurable: true, enumerable: false, writable: true });
    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {
    return false;
  }
}

function microtask(callback) {
  if (!isFn(callback)) return;

  try {
    queueMicrotask(callback);
  } catch {
    Promise.resolve().then(callback).catch(() => {});
  }
}

function normalizeDeps(first = {}, second = {}) {
  if (isObject(first) && ("AppCore" in first || "Auth" in first || "Router" in first || "Toast" in first || "SidebarUI" in first || "TopbarUI" in first)) {
    return { ...first };
  }

  return { ...object(second), AppCore: first };
}

function payloadFrom(eventOrPayload = {}) {
  if (isObject(eventOrPayload?.detail)) return eventOrPayload.detail;
  if (isObject(eventOrPayload?.payload)) return eventOrPayload.payload;
  return object(eventOrPayload);
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function redact(value = "") {
  return text(value, "")
    .replace(TOKEN_QUERY_RE, "$1***")
    .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/activate\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function normalizeError(error = null) {
  if (!error) return null;
  if (typeof error === "string") return { name: "UIError", message: redact(error), code: "UI_ERROR" };

  return {
    name: text(error?.name || error?.constructor?.name, "UIError"),
    message: redact(text(error?.message || error, "Error UI.")),
    code: text(error?.code || error?.status || error?.statusCode, "UI_ERROR"),
  };
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";
  if (SENSITIVE_KEY_RE.test(text(keyHint, ""))) return value ? "***" : value;
  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return normalizeError(value);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1, keyHint));
  if (value instanceof Map) return { type: "Map", size: value.size };
  if (value instanceof Set) return { type: "Set", size: value.size };

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitize(item, depth + 1, key)])
    );
  }

  return String(value);
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;

  const signature = [name, text(payload?.reason || payload?.phase, ""), text(payload?.route || payload?.canonicalPath, ""), text(payload?.publicPath, "")].join("|");
  const stamp = now();

  if (options.force !== true && signature === lastEmitSignature && stamp - lastEmitAt < EVENT_DEDUPE_MS) return false;

  lastEmitSignature = signature;
  lastEmitAt = stamp;

  const detail = sanitize({ source: SOURCE, version: UI_VERSION, at: iso(), ...object(payload) });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[AppUI]", ...args.map((item) => sanitize(item)));
  } catch {
    try {
      if (AppCore?.config?.debug) console.warn("[AppUI]", ...args.map((item) => sanitize(item)));
    } catch {}
  }
}

function setLastError(AppCore, source = "ui", error = null) {
  runtime.errorCount += 1;
  runtime.lastError = { source, error: normalizeError(error), at: iso() };
  warn(AppCore, source, error);
  return runtime.lastError;
}

/* =========================================================
   DEPS / MODULES
========================================================= */

function getModule(AppCore, names = []) {
  for (const key of names.map((name) => text(name, "")).filter(Boolean)) {
    try {
      const value = AppCore?.modules?.get?.(key) || AppCore?.registry?.modules?.get?.(key) || AppCore?.modules?.[key] || AppCore?.[key] || null;
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
    Auth: deps.Auth || AppCore?.Auth || AppCore?.auth || getModule(AppCore, ["Auth", "auth"]),
    Router: deps.Router || AppCore?.Router || AppCore?.router || getModule(AppCore, ["Router", "router"]),
    Toast: deps.Toast || AppCore?.Toast || AppCore?.toast || getModule(AppCore, ["Toast", "toast", "notifications"]),
    SidebarUI: deps.SidebarUI || AppCore?.SidebarUI || AppCore?.sidebarUI || AppCore?.sidebar || getModule(AppCore, ["SidebarUI", "sidebarUI", "Sidebar", "sidebar"]),
    TopbarUI: deps.TopbarUI || AppCore?.TopbarUI || AppCore?.topbarUI || AppCore?.topbar || getModule(AppCore, ["TopbarUI", "topbarUI", "Topbar", "topbar"]),
  };
}

function registerAlias(AppCore, alias = "", moduleRef = null) {
  if (!AppCore || !alias || !moduleRef) return false;

  try {
    AppCore?.modules?.register?.(alias, moduleRef, { overwrite: true, replace: true, source: SOURCE, emit: false, silent: true });
  } catch {}

  try {
    AppCore?.modules?.set?.(alias, moduleRef, { overwrite: true, replace: true, source: SOURCE, emit: false, silent: true });
  } catch {}

  try {
    AppCore?.registry?.modules?.set?.(alias, moduleRef);
  } catch {}

  defineValue(AppCore, alias, moduleRef);
  return true;
}

function registerAppModule(AppCore, name = "", moduleRef = null, aliases = []) {
  if (!AppCore || !name || !moduleRef) return false;

  let ok = false;

  try {
    ok = registerModule(AppCore, name, moduleRef) !== false;
  } catch {}

  for (const alias of [name, ...aliases]) ok = registerAlias(AppCore, alias, moduleRef) || ok;
  return ok;
}

function wasInitialized(moduleRef) {
  try {
    if (!moduleRef) return false;
    if ((typeof moduleRef === "object" || typeof moduleRef === "function") && moduleInitState.get(moduleRef)) return true;
    return Boolean(moduleRef.__appUiInitialized === true || moduleRef.initialized === true || moduleRef.ready === true);
  } catch {
    return false;
  }
}

function markInitialized(moduleRef, value = true) {
  try {
    if (moduleRef && (typeof moduleRef === "object" || typeof moduleRef === "function")) moduleInitState.set(moduleRef, Boolean(value));
  } catch {}

  defineValue(moduleRef, "__appUiInitialized", Boolean(value));
}

function callMethod(moduleRef, methodName, context = {}) {
  if (!moduleRef || !methodName || !isFn(moduleRef[methodName])) return false;

  try {
    const result = moduleRef[methodName].call(moduleRef, context);
    return result !== false;
  } catch {
    try {
      const result = moduleRef[methodName].call(moduleRef);
      return result !== false;
    } catch {
      return false;
    }
  }
}

function callFirst(moduleRef, methodNames = [], context = {}) {
  for (const method of methodNames) {
    if (callMethod(moduleRef, method, context)) return { called: true, method };
  }

  return { called: false, method: "" };
}

function initModule(AppCore, moduleRef, label = "module", context = {}) {
  if (!moduleRef) return false;
  if (context.force !== true && wasInitialized(moduleRef)) return true;

  const hasInitMethod = INIT_METHODS.some((method) => isFn(moduleRef?.[method]));
  const result = callFirst(moduleRef, INIT_METHODS, { ...context, AppCore, label, reason: context.reason || `${label}:init` });
  const ok = result.called || !hasInitMethod;

  if (ok) markInitialized(moduleRef, true);
  return ok;
}

/* =========================================================
   ROUTE / USER SNAPSHOT
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.replace(/^#\/?/, "/");
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  value = value.split("?")[0].split("#")[0] || "/";
  value = value.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";

  const parts = value.split("/").filter(Boolean);
  if (/^@[A-Za-z0-9._-]{1,80}$/.test(parts[0] || "")) return parts.length > 1 ? `/${parts.slice(1).join("/")}` : "/";

  return value;
}

function currentRoute(AppCore = null, Router = null) {
  try {
    return Router?.getCurrentCanonicalPath?.() || Router?.getCurrentPath?.() || AppCore?.state?.route || AppCore?.state?.canonicalPath || (isBrowser() ? window.location.pathname || "/" : "/");
  } catch {
    return "/";
  }
}

function currentPublicPath(AppCore = null, Router = null) {
  try {
    return Router?.getCurrentPublicPath?.() || Router?.getCurrentPath?.() || AppCore?.state?.publicPath || currentRoute(AppCore, Router);
  } catch {
    return "/";
  }
}

function routeMatches(path = "/", candidate = "/") {
  const cleanPath = normalizePath(path);
  const cleanCandidate = normalizePath(candidate);
  return cleanPath === cleanCandidate || (cleanCandidate !== "/" && cleanPath.startsWith(`${cleanCandidate}/`));
}

function isAuthLikeRoute(AppCore = null, Router = null) {
  const route = currentRoute(AppCore, Router);
  return AUTH_ROUTES.some((candidate) => routeMatches(route, candidate));
}

function callGetter(ref, names = []) {
  for (const name of names) {
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
  return text(user?.userId || user?.id, "");
}

function getCurrentUser(AppCore, Auth) {
  const state = object(AppCore?.state);
  const session = object(state.session || state.sessionData);
  return state.user || state.currentUser || state.sessionUser || session.user || callGetter(Auth, ["getUser", "getCurrentUser"]) || Auth?.user || null;
}

function getCurrentRole(AppCore, Auth, user) {
  const state = object(AppCore?.state);
  const role = state.role || user?.role || callGetter(Auth, ["getCurrentRole", "getRole"]) || Auth?.role || "";
  return role === "admin" ? "admin" : role === "user" ? "user" : "";
}

function hasUser(user = null) {
  return Boolean(user && typeof user === "object" && getUserId(user));
}

function isAuthenticated(AppCore, Auth, user) {
  let authenticated = false;

  try {
    if (isFn(AppCore?.isAuthenticated)) authenticated = Boolean(AppCore.isAuthenticated());
  } catch {}

  try {
    if (!authenticated && isFn(Auth?.isAuthenticated)) authenticated = Boolean(Auth.isAuthenticated());
  } catch {}

  if (!authenticated) authenticated = Boolean(AppCore?.state?.authenticated || Auth?.authenticated);

  return Boolean(authenticated && hasUser(user));
}

function getUserSnapshot(AppCore, Auth = null, Router = null) {
  const state = object(AppCore?.state);
  const user = getCurrentUser(AppCore, Auth);
  const role = getCurrentRole(AppCore, Auth, user);
  const route = currentRoute(AppCore, Router);
  const publicPath = currentPublicPath(AppCore, Router);
  const displayName = user?.name || user?.fullName || user?.displayName || user?.username || null;

  return {
    user,
    userId: getUserId(user),
    authenticated: isAuthenticated(AppCore, Auth, user),
    role,
    username: user?.username || user?.slug || state.username || null,
    displayName,
    name: user?.name || displayName,
    avatarUrl: user?.avatarUrl || user?.avatar || user?.picture || null,
    lang: state.lang || state.language || state.locale || null,
    theme: state.theme || state.mode || state.appearance || null,
    route,
    publicPath,
    authRoute: isAuthLikeRoute(AppCore, Router),
  };
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

function normalizeToastType(type = "info") {
  const clean = text(type, "info").toLowerCase();
  if (clean === "warn") return "warning";
  return ["success", "error", "warning", "info", "loading"].includes(clean) ? clean : "info";
}

function createToastBridge(AppCore, Toast) {
  return function showToast(message = "", type = "info", options = {}) {
    const payload = isObject(message) ? { ...message } : { ...object(options), type, message };
    const cleanMessage = text(payload.message || payload.text || payload.title, "");
    const cleanType = normalizeToastType(payload.type || payload.variant || type);

    if (!cleanMessage) return null;

    try {
      const method = cleanType === "warning" ? Toast?.warning || Toast?.warn : Toast?.[cleanType];
      if (isFn(method)) return method.call(Toast, cleanMessage, { ...payload, type: cleanType, message: cleanMessage });
      if (isFn(Toast?.show)) return Toast.show({ ...payload, type: cleanType, message: cleanMessage });
    } catch (error) {
      warn(AppCore, "Toast bridge error", error);
    }

    return null;
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

  ok = defineValue(AppCore, "showToast", bridge) || ok;
  ok = defineValue(AppCore?.utils, "showToast", bridge) || ok;

  return ok;
}

export function bindToastBridge(first = {}, second = null) {
  const deps = resolveDeps(first, { Toast: second });
  const { AppCore, Toast } = deps;

  if (!AppCore || !Toast) return false;
  if (toastBridgeBound || AppCore.__toastBridgeBound === true) return true;

  const ok = attachToastBridge(AppCore, createToastBridge(AppCore, Toast));
  if (!ok) return false;

  toastBridgeBound = true;
  defineValue(AppCore, "__toastBridgeBound", true);

  emit(AppCore, EVENTS.toastBridgeReady);
  return true;
}

/* =========================================================
   SYNC / REPAIR
========================================================= */

function ensureChromeReady(deps = {}, reason = "chrome-ready", options = {}) {
  const { AppCore, SidebarUI, TopbarUI, Router } = deps;
  const authRoute = isAuthLikeRoute(AppCore, Router);

  if (authRoute && options.allowAuthRouteChrome !== true) {
    return { sidebar: false, topbar: false, skipped: true, authRoute: true };
  }

  const context = { ...deps, reason };

  return {
    sidebar: initModule(AppCore, SidebarUI, "SidebarUI", context),
    topbar: initModule(AppCore, TopbarUI, "TopbarUI", context),
    skipped: false,
    authRoute: false,
  };
}

function syncSignature(snapshot = {}) {
  return JSON.stringify({
    authenticated: Boolean(snapshot.authenticated),
    userId: text(snapshot.userId, ""),
    username: text(snapshot.username, ""),
    role: text(snapshot.role, ""),
    lang: text(snapshot.lang, ""),
    theme: text(snapshot.theme, ""),
    route: normalizePath(snapshot.route || "/"),
    publicPath: normalizePath(snapshot.publicPath || "/"),
    hasAvatar: Boolean(snapshot.avatarUrl),
    authRoute: Boolean(snapshot.authRoute),
  });
}

function shouldSkipSync(snapshot = {}, force = false) {
  if (force === true) return false;

  const signature = syncSignature(snapshot);
  const stamp = now();

  if (signature === lastSyncSignature && stamp - lastSyncAt < SYNC_DEDUPE_MS) return true;

  lastSyncSignature = signature;
  lastSyncAt = stamp;

  return false;
}

export function syncUserUI(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, Auth, Router, SidebarUI, TopbarUI } = deps;
  const reason = text(deps.reason, "sync-user-ui");
  const force = deps.force === true;
  const rebind = deps.rebind === true;
  const hardRepair = deps.hardRepair === true;

  if (!AppCore) return false;

  const snapshot = getUserSnapshot(AppCore, Auth, Router);
  if (shouldSkipSync(snapshot, force)) return true;

  if (syncing) {
    queuedSync = { ...deps, reason: `${reason}:queued`, force: true, rebind: false, hardRepair: false };
    return true;
  }

  syncing = true;

  try {
    const context = {
      ...deps,
      reason,
      snapshot,
      user: snapshot.user,
      authenticated: snapshot.authenticated,
      role: snapshot.role,
      username: snapshot.username,
      displayName: snapshot.displayName,
      name: snapshot.name,
      avatarUrl: snapshot.avatarUrl,
      route: snapshot.route,
      publicPath: snapshot.publicPath,
      authRoute: snapshot.authRoute,
    };

    let chrome = { skipped: true, authRoute: snapshot.authRoute };
    let sidebar = { called: false, method: "" };
    let topbar = { called: false, method: "" };

    if (!snapshot.authRoute || deps.allowAuthRouteChrome === true) {
      chrome = ensureChromeReady(deps, reason, { allowAuthRouteChrome: deps.allowAuthRouteChrome === true });
      sidebar = callFirst(SidebarUI, hardRepair ? REPAIR_METHODS : SYNC_METHODS, context);
      topbar = callFirst(TopbarUI, hardRepair ? REPAIR_METHODS : SYNC_METHODS, context);

      if (rebind) {
        callFirst(SidebarUI, REBIND_METHODS, context);
        callFirst(TopbarUI, REBIND_METHODS, context);
      }
    }

    runtime.syncCount += 1;
    runtime.lastSyncAt = now();
    runtime.lastSyncReason = reason;

    emit(AppCore, EVENTS.userSync, {
      reason,
      authenticated: snapshot.authenticated,
      username: snapshot.username,
      role: snapshot.role,
      route: snapshot.route,
      publicPath: snapshot.publicPath,
      authRoute: snapshot.authRoute,
    });

    emit(AppCore, EVENTS.userSyncDone, {
      ok: true,
      reason,
      authRoute: snapshot.authRoute,
      chrome,
      sidebar,
      topbar,
      rebind,
      hardRepair,
    });

    return true;
  } catch (error) {
    setLastError(AppCore, "syncUserUI", error);
    emit(AppCore, EVENTS.userSyncError, { reason, error: normalizeError(error) });
    return false;
  } finally {
    syncing = false;

    if (queuedSync) {
      const queued = queuedSync;
      queuedSync = null;
      microtask(() => syncUserUI(queued));
    }
  }
}

export function repairUISystems(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore } = deps;
  const reason = text(deps.reason, "repair-ui");
  const force = deps.force === true;

  if (!AppCore) return false;

  const signature = [reason, currentRoute(AppCore, deps.Router), currentPublicPath(AppCore, deps.Router)].map((item) => text(item, "")).join("|");
  const stamp = now();

  if (force !== true && signature === lastRepairSignature && stamp - lastRepairAt < REPAIR_DEDUPE_MS) return true;

  lastRepairSignature = signature;
  lastRepairAt = stamp;

  runtime.repairCount += 1;
  runtime.lastRepairAt = stamp;
  runtime.lastRepairReason = reason;

  const ok = syncUserUI({ ...deps, reason, force, hardRepair: true });

  emit(AppCore, EVENTS.repair, { reason, ok, rebind: deps.rebind === true, hardRepair: true });
  emit(AppCore, EVENTS.repairDone, { reason, ok });

  return ok;
}

/* =========================================================
   EVENTS
========================================================= */

function rememberDisposer(disposer) {
  if (isFn(disposer)) disposers.push(disposer);
}

function bindEvent(AppCore, scope, eventName, handler, label = "") {
  if (!AppCore || !eventName || !isFn(handler)) return false;

  const key = [scope || DEFAULT_SCOPE, eventName, label || eventName].join("::");
  if (boundKeys.has(key)) return true;

  const wrapped = (eventOrPayload = {}) => {
    const detail = payloadFrom(eventOrPayload);
    const signature = [eventName, text(detail?.reason || detail?.phase, ""), text(detail?.route || detail?.canonicalPath, ""), text(detail?.publicPath, "")].join("|");
    const stamp = now();

    if (signature === lastInboundSignature && stamp - lastInboundAt < EVENT_DEDUPE_MS) return;

    lastInboundSignature = signature;
    lastInboundAt = stamp;

    try {
      handler(detail, eventOrPayload);
    } catch (error) {
      setLastError(AppCore, `event:${eventName}`, error);
    }
  };

  try {
    if (isFn(AppCore.cleanup?.event)) {
      rememberDisposer(AppCore.cleanup.event(scope || DEFAULT_SCOPE, eventName, wrapped, { source: SOURCE }));
      boundKeys.add(key);
      return true;
    }
  } catch {}

  try {
    if (isFn(AppCore.events?.on)) {
      const off = AppCore.events.on(eventName, wrapped);
      rememberDisposer(isFn(off) ? off : () => AppCore.events?.off?.(eventName, wrapped));
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

export function bindAppLanguageSync() {
  return true;
}

export function bindUIRouteSync() {
  return true;
}

export function bindUISessionSync() {
  return true;
}

export function bindUIThemeSync() {
  return true;
}

export function bindUIRepairSync(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  if (!deps.AppCore) return false;
  if (deps.AppCore.__appUiRepairBound === true) return true;

  const ok = bindEvent(
    deps.AppCore,
    deps.scope || DEFAULT_SCOPE,
    EVENTS.repairRequest,
    (detail = {}) => {
      if (text(detail.source, "") === SOURCE) return;

      repairUISystems({
        ...deps,
        reason: detail.reason || detail.phase || "repair-request",
        payload: detail,
        force: detail.force === true,
        rebind: detail.rebind === true,
        hardRepair: detail.hardRepair === true,
        allowAuthRouteChrome: detail.allowAuthRouteChrome === true,
      });
    },
    "repair-request"
  );

  defineValue(deps.AppCore, "__appUiRepairBound", ok);
  return ok;
}

export function bindUIRuntimeEvents(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  if (!deps.AppCore) return false;
  if (runtimeBound || deps.AppCore.__appUiRuntimeEventsBound === true) return true;

  const ok = bindUIRepairSync(deps);

  runtimeBound = ok;
  defineValue(deps.AppCore, "__appUiRuntimeEventsBound", ok);

  if (ok) emit(deps.AppCore, EVENTS.runtimeEventsBound);
  return ok;
}

/* =========================================================
   INIT / UNBIND / SNAPSHOT
========================================================= */

function markUiInitialized(AppCore, stateRef = null, value = true) {
  try {
    if (stateRef) stateRef.uiInitialized = Boolean(value);
  } catch {}

  try {
    AppCore?.setState?.({ uiInitialized: Boolean(value) }, { source: SOURCE, emit: false, emitState: false, silent: true });
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") AppCore.state.uiInitialized = Boolean(value);
  } catch {}

  return true;
}

function exposeDebugApi(AppCore = null) {
  if (debugApiBound && isBrowser() && window[DEBUG_KEY]) return window[DEBUG_KEY];

  const api = {
    version: UI_VERSION,
    sync: (options = {}) => syncUserUI({ AppCore, ...object(options) }),
    repair: (options = {}) => repairUISystems({ AppCore, ...object(options) }),
    unbind: () => unbindUISystems(AppCore),
    snapshot: (extra = {}) => getUISystemsSnapshot({ AppCore, ...object(extra) }),
    reset: () => resetUIRuntimeState(AppCore),
  };

  try {
    if (isBrowser()) window[DEBUG_KEY] = api;
  } catch {}

  defineValue(AppCore, "UI", api);
  debugApiBound = true;
  return api;
}

export function initUISystems(first = {}) {
  const deps = resolveDeps(first);
  const { AppCore, Toast, SidebarUI, TopbarUI, state: stateRef, scope = DEFAULT_SCOPE } = deps;
  const force = deps.force === true;

  if (!AppCore) return false;
  if (initInFlight) return true;

  if (!force && (initialized || AppCore?.state?.uiInitialized || stateRef?.uiInitialized)) {
    registerAppModule(AppCore, "toast", Toast, ["Toast", "notifications"]);
    registerAppModule(AppCore, "sidebar", SidebarUI, ["sidebarUI", "SidebarUI", "Sidebar"]);
    registerAppModule(AppCore, "topbar", TopbarUI, ["topbarUI", "TopbarUI", "Topbar"]);
    bindToastBridge({ AppCore, Toast });
    if (deps.bindRuntimeEvents === true) bindUIRuntimeEvents({ ...deps, scope });
    exposeDebugApi(AppCore);
    syncUserUI({ ...deps, reason: "init-ui-already-initialized" });
    return true;
  }

  initInFlight = true;
  emit(AppCore, EVENTS.initStart, { scope });

  try {
    registerAppModule(AppCore, "toast", Toast, ["Toast", "notifications"]);
    registerAppModule(AppCore, "sidebar", SidebarUI, ["sidebarUI", "SidebarUI", "Sidebar"]);
    registerAppModule(AppCore, "topbar", TopbarUI, ["topbarUI", "TopbarUI", "Topbar"]);

    initModule(AppCore, Toast, "Toast", { ...deps, reason: "init-ui:toast", force });
    bindToastBridge({ AppCore, Toast });
    ensureChromeReady(deps, "init-ui:chrome", { allowAuthRouteChrome: deps.allowAuthRouteChrome === true });
    if (deps.bindRuntimeEvents === true) bindUIRuntimeEvents({ ...deps, scope });
    exposeDebugApi(AppCore);
    syncUserUI({ ...deps, reason: "init-ui" });

    initialized = true;
    runtime.initCount += 1;
    runtime.lastInitAt = now();
    runtime.lastInitOk = true;

    markUiInitialized(AppCore, stateRef, true);
    emit(AppCore, EVENTS.initDone, { ok: true, scope });
    emit(AppCore, EVENTS.ready, { ok: true, scope });

    return true;
  } catch (error) {
    runtime.lastInitOk = false;
    setLastError(AppCore, "initUISystems", error);
    emit(AppCore, EVENTS.initError, { error: normalizeError(error) });
    return false;
  } finally {
    initInFlight = false;
  }
}

export function unbindUISystems(AppCore = null) {
  while (disposers.length) {
    try {
      disposers.pop()?.();
    } catch {}
  }

  boundKeys.clear();
  runtimeBound = false;
  toastBridgeBound = false;

  if (AppCore) {
    defineValue(AppCore, "__appUiRepairBound", false);
    defineValue(AppCore, "__appUiRuntimeEventsBound", false);
    defineValue(AppCore, "__toastBridgeBound", false);
  }

  emit(AppCore, EVENTS.runtimeEventsUnbound, {}, { force: true });
  return true;
}

export function getUISystemsSnapshot(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, Auth, Router, SidebarUI, TopbarUI, Toast } = deps;
  const user = AppCore ? getUserSnapshot(AppCore, Auth, Router) : null;

  return sanitize({
    version: UI_VERSION,
    initialized: Boolean(initialized || AppCore?.state?.uiInitialized),
    initInFlight,
    syncing,
    queued: Boolean(queuedSync),
    runtimeBound,
    toastBridgeBound,
    debugApiBound,
    boundKeyCount: boundKeys.size,
    disposerCount: disposers.length,
    modules: {
      toast: Boolean(Toast),
      sidebar: Boolean(SidebarUI),
      topbar: Boolean(TopbarUI),
    },
    moduleInit: {
      toast: Toast ? wasInitialized(Toast) : false,
      sidebar: SidebarUI ? wasInitialized(SidebarUI) : false,
      topbar: TopbarUI ? wasInitialized(TopbarUI) : false,
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
    runtime,
    dedupe: { lastSyncAt, lastRepairAt },
    policy: {
      adapterOnly: true,
      ownAuth: false,
      ownRouter: false,
      ownStore: false,
      ownToast: false,
      ownFetch: false,
      ownStorage: false,
      ownViews: false,
      routeSessionListenersByDefault: false,
    },
  });
}

export function resetUIRuntimeState(AppCore = null) {
  unbindUISystems(AppCore);

  initialized = false;
  initInFlight = false;
  syncing = false;
  queuedSync = null;
  debugApiBound = false;
  moduleInitState = new WeakMap();
  lastSyncSignature = "";
  lastSyncAt = 0;
  lastRepairSignature = "";
  lastRepairAt = 0;
  lastEmitSignature = "";
  lastEmitAt = 0;
  lastInboundSignature = "";
  lastInboundAt = 0;

  Object.assign(runtime, {
    initCount: 0,
    syncCount: 0,
    repairCount: 0,
    errorCount: 0,
    lastInitAt: 0,
    lastInitOk: false,
    lastSyncAt: 0,
    lastSyncReason: "",
    lastRepairAt: 0,
    lastRepairReason: "",
    lastError: null,
  });

  return getUISystemsSnapshot({ AppCore });
}

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
