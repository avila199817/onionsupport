/* =========================================================
   Onion SPA - App Events
   Archivo: src/app/events.js

   App events simple:
   - bindings internos de app
   - sync ligera de UI
   - router:rendered solo sincroniza route/publicPath + loader
   - app:lang:change no rerenderiza salvo flag explícito
   - sin event storm / sin rebind / sin repair automático
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
   VERSION
========================================================= */

export const APP_EVENTS_VERSION = "18.0.0-clean";

/* =========================================================
   CONSTANTS
========================================================= */

const SOURCE = "app:events";
const DEFAULT_ROUTE = "/";

const DEFAULT_SCOPE =
  APP_SCOPES?.events ||
  APP_SCOPE ||
  "app:events";

const TOAST_DEDUPE_MS = 1200;
const UI_SYNC_DEDUPE_MS = 80;
const ROUTER_SYNC_DEDUPE_MS = 40;
const LANG_RERENDER_DEDUPE_MS = 250;
const THEME_SYNC_DEDUPE_MS = 120;
const EMIT_DEDUPE_MS = 80;

const MAX_RECENT = 80;
const MAX_SANITIZE_DEPTH = 6;
const MAX_SANITIZE_ARRAY = 100;

const EVENT_NAMES = Object.freeze({
  appReady: APP_EVENTS?.ready || "app:ready",
  appUiReady: APP_EVENTS?.uiReady || "app:ui:ready",
  appUiRepairRequest: APP_EVENTS?.uiRepairRequest || "app:ui:repair-request",

  appUserChange: APP_EVENTS?.userChange || "app:user:change",
  appUserUiSync: APP_EVENTS?.userUiSync || "app:user-ui:sync",

  appEventsReady: "app:events:ready",
  appEventsBound: "app:events:bound",
  appEventsUnbound: "app:events:unbound",
  appEventsError: "app:events:error",
  appEventsUiSynced: "app:events:ui-synced",

  appRouteSynced: APP_EVENTS?.routeSynced || "app:events:route-synced",
  appRouteChange: APP_EVENTS?.routeChange || "app:route:change",

  appSessionRestored: APP_EVENTS?.sessionRestored || "app:session:restored",
  appSessionCleared: APP_EVENTS?.sessionCleared || "app:session:cleared",

  appLangChange: APP_EVENTS?.langChange || "app:lang:change",
  appThemeChange: APP_EVENTS?.themeChange || "app:theme:change",
  onionThemeChange: "onion:theme:change",
  legacyThemeChange: "theme:change",

  authSessionRestored: AUTH_EVENTS?.sessionRestored || "auth:session:restored",
  authLoginSuccess: AUTH_EVENTS?.loginSuccess || "auth:login:success",
  authLogout: AUTH_EVENTS?.logout || "auth:logout",
  authLogoutSuccess: AUTH_EVENTS?.logoutSuccess || "auth:logout:success",

  routerRendered: ROUTER_EVENTS?.rendered || "router:rendered",
  routerAsyncComplete: ROUTER_EVENTS?.asyncComplete || "router:render:async-complete",
  routerShellState: ROUTER_EVENTS?.shellState || "router:shell:state",
});

const SIDEBAR_USER_METHODS = Object.freeze([
  "renderUser",
  "refreshUser",
  "updateUser",
  "syncUser",
]);

const SIDEBAR_VISUAL_METHODS = Object.freeze([
  "applyRoleVisibility",
  "syncRouteAndIndicator",
  "syncIndicator",
  "updateToggleLabel",
]);

const SIDEBAR_FALLBACK_METHODS = Object.freeze([
  "refresh",
  "sync",
]);

const TOPBAR_USER_METHODS = Object.freeze([
  "renderUser",
  "refreshUser",
  "updateUser",
  "syncUser",
]);

const TOPBAR_VISUAL_METHODS = Object.freeze([
  "syncRoute",
  "updateRoute",
  "syncBreadcrumb",
  "updateBreadcrumb",
]);

const TOPBAR_FALLBACK_METHODS = Object.freeze([
  "refresh",
  "sync",
]);

const SENSITIVE_PARAMS = Object.freeze([
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

const TOKEN_PATHS = Object.freeze([
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

const USERNAME_SEGMENT_RE = /^@[A-Za-z0-9._-]{1,80}$/;
const SENSITIVE_KEY_RE = /token|secret|password|authorization|credential|jwt|bearer|otp|code|session|refresh|access/i;

/* =========================================================
   STATE
========================================================= */

let bound = false;
let binding = false;
let boundScope = "";

let langChangeInFlight = false;

let lastLangRenderAt = 0;

let lastRouterKey = "";
let lastRouterAt = 0;

let lastToastKey = "";
let lastToastAt = 0;

let lastUiKey = "";
let lastUiAt = 0;

let lastThemeKey = "";
let lastThemeAt = 0;

let lastEmitKey = "";
let lastEmitAt = 0;

let debugApiInstalled = false;

const disposers = [];
const boundKeys = new Set();

const eventState = {
  totalHandled: 0,
  totalErrors: 0,
  lastEvent: "",
  lastEventAt: 0,
  lastError: null,
  boundEvents: [],
  recent: [],
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

function isObjectLike(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
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

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    )
  );
}

function canDefine(value) {
  try {
    return isObjectLike(value) && Object.isExtensible(value);
  } catch {
    return false;
  }
}

function defineHidden(target, key, value) {
  if (!target || !key || !canDefine(target)) return false;

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
  } catch {}

  return false;
}

function getPayload(eventOrPayload = {}) {
  if (isObject(eventOrPayload?.detail)) return eventOrPayload.detail;
  if (isObject(eventOrPayload?.payload)) return eventOrPayload.payload;
  if (isObject(eventOrPayload)) return eventOrPayload;
  return {};
}

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value = "") {
  let output = safeText(value, "");

  if (!output) return "";

  for (const name of SENSITIVE_PARAMS) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const path of TOKEN_PATHS) {
    try {
      output = output.replace(
        new RegExp(`(${escapeRegExp(path)}\\/)([^/?#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi, "$1$2***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function isDomNodeLike(value) {
  if (!value || typeof value !== "object") return false;

  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {}

  try {
    return Boolean(value.nodeType && value.nodeName);
  } catch {}

  return false;
}

function normalizeError(error = null) {
  if (!error) return null;

  const candidate = error?.error || error?.reason || error;

  if (typeof candidate === "string") {
    return {
      name: "AppEventsError",
      message: redact(candidate),
      code: "APP_EVENTS_ERROR",
    };
  }

  return {
    name: safeText(candidate?.name, "AppEventsError"),
    message: redact(
      safeText(candidate?.message || candidate, "Error en App Events.")
    ),
    code: safeText(
      candidate?.code || candidate?.status || candidate?.statusCode,
      "APP_EVENTS_ERROR"
    ),
    stack: candidate?.stack ? "[stack]" : "",
  };
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (depth > MAX_SANITIZE_DEPTH) return "[MaxDepth]";

  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) return normalizeError(value);

  if (isDomNodeLike(value)) {
    return {
      node: safeText(value.nodeName, "Node"),
      id: safeText(value.id, ""),
      className: safeText(value.className?.baseVal || value.className, ""),
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SANITIZE_ARRAY)
      .map((item) => sanitize(item, depth + 1, seen));
  }

  if (value instanceof Map) return { type: "Map", size: value.size };
  if (value instanceof Set) return { type: "Set", size: value.size };

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = SENSITIVE_KEY_RE.test(key)
        ? item ? "***" : item
        : sanitize(item, depth + 1, seen);
    }

    return output;
  }

  return redact(String(value));
}

/* =========================================================
   LOG / EMIT
========================================================= */

function log(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.("[AppEvents]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[AppEvents]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.warn("[AppEvents]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function errorLog(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.("[AppEvents]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.error("[AppEvents]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function createCustomEvent(eventName, payload = {}) {
  if (!isBrowser()) return null;

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(eventName, { detail: payload });
    }
  } catch {}

  try {
    const event = document.createEvent("CustomEvent");
    event.initCustomEvent(eventName, false, false, payload);
    return event;
  } catch {
    return null;
  }
}

function emitWindow(eventName, payload = {}) {
  if (!isBrowser() || !eventName) return false;

  try {
    const event = createCustomEvent(eventName, payload);
    if (!event) return false;

    window.dispatchEvent(event);
    return true;
  } catch {
    return false;
  }
}

function shouldDedupeEmit(eventName = "", payload = {}, force = false) {
  if (force) return false;

  const key = [
    eventName,
    payload?.reason || payload?.phase || "",
    payload?.route || payload?.canonicalPath || "",
    payload?.publicPath || "",
    payload?.ok === false ? "fail" : "ok",
  ]
    .map((item) => safeText(item, ""))
    .join("|");

  const stamp = now();

  if (key === lastEmitKey && stamp - lastEmitAt < EMIT_DEDUPE_MS) {
    return true;
  }

  lastEmitKey = key;
  lastEmitAt = stamp;

  return false;
}

function emit(AppCore, eventName, payload = {}, options = {}) {
  const cleanName = safeText(eventName, "");
  if (!cleanName) return false;

  const opts = safeObject(options);

  if (opts.dedupe !== false && shouldDedupeEmit(cleanName, payload, opts.force === true)) {
    return false;
  }

  const detail = sanitize({
    version: APP_EVENTS_VERSION,
    source: SOURCE,
    ...safeObject(payload),
  });

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(cleanName, detail);
      busEmitted = true;
    }
  } catch (error) {
    warn(AppCore, `AppCore.events.emit("${cleanName}") falló.`, error);
  }

  if (opts.window === true || (!busAvailable && isBrowser())) {
    return emitWindow(cleanName, detail) || busEmitted;
  }

  return busEmitted;
}

/* =========================================================
   DIAGNOSTICS
========================================================= */

function pushRecent(event = {}) {
  eventState.recent.unshift(sanitize(event));

  if (eventState.recent.length > MAX_RECENT) {
    eventState.recent = eventState.recent.slice(0, MAX_RECENT);
  }
}

function recordHandled(eventName = "", payload = {}) {
  const atMs = now();

  eventState.totalHandled += 1;
  eventState.lastEvent = safeText(eventName, "");
  eventState.lastEventAt = atMs;

  pushRecent({
    event: eventState.lastEvent,
    payload: safeObject(payload),
    at: iso(atMs),
    atMs,
  });
}

function recordError(AppCore, eventName = "", error = null) {
  eventState.totalErrors += 1;

  eventState.lastError = {
    event: safeText(eventName, ""),
    error: normalizeError(error),
    message: redact(safeText(error?.message || error, "Error en App Events.")),
    at: iso(),
  };

  pushRecent({
    event: "error",
    payload: eventState.lastError,
    at: iso(),
    atMs: now(),
  });

  errorLog(AppCore, `Error procesando evento ${eventName || "desconocido"}.`, error);

  emit(AppCore, EVENT_NAMES.appEventsError, eventState.lastError);
}

/* =========================================================
   PATH HELPERS
========================================================= */

function baseOrigin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

function isHashRouterPath(value = "") {
  const text = safeText(value, "");
  return text.startsWith("#/") || text.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const text = safeText(value, "");

  if (!text) return "/";
  if (text.startsWith("#!")) return text.replace(/^#!\/?/, "/") || "/";
  return text.replace(/^#\/?/, "/") || "/";
}

function normalizePathname(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const stack = [];

  for (const segment of value.split("/").filter(Boolean)) {
    if (segment === ".") continue;

    if (segment === "..") {
      stack.pop();
      continue;
    }

    stack.push(segment);
  }

  value = `/${stack.join("/")}`;
  return value.length > 1 ? value.replace(/\/+$/g, "") : value;
}

function splitPath(value = "/") {
  let raw = safeText(value, "/");

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, baseOrigin());

      if (parsed.origin !== baseOrigin()) {
        raw = "/";
      } else if (parsed.hash && isHashRouterPath(parsed.hash)) {
        raw = normalizeHashRouterPath(parsed.hash);
      } else {
        raw = `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
      }
    }
  } catch {
    raw = "/";
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname: normalizePathname(pathname),
    search: search ? (search.startsWith("?") ? search : `?${search}`) : "",
    hash: hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "",
  };
}

function localPublicPath(path = "/") {
  const parts = splitPath(path);
  return `${parts.pathname}${parts.search}${parts.hash}`;
}

function stripUsername(pathname = "/") {
  const segments = normalizePathname(pathname).split("/").filter(Boolean);

  if (segments.length && USERNAME_SEGMENT_RE.test(segments[0])) {
    const rest = segments.slice(1).join("/");
    return rest ? normalizePathname(`/${rest}`) : "/";
  }

  return normalizePathname(pathname);
}

function localCanonicalPath(path = "/") {
  return stripUsername(splitPath(localPublicPath(path)).pathname);
}

function callPathHelper(fn, AppCore, path = "/") {
  if (!isFn(fn)) return "";

  const attempts = [
    () => fn(AppCore, path),
    () => fn(path),
  ];

  for (const attempt of attempts) {
    try {
      const value = attempt();
      if (value) return value;
    } catch {}
  }

  return "";
}

function normalizePublicSafe(AppCore, path = "/") {
  return (
    callPathHelper(normalizePublicPath, AppCore, path) ||
    localPublicPath(path)
  );
}

function normalizeCanonicalSafe(AppCore, path = "/") {
  const local = localCanonicalPath(path);
  const helper = callPathHelper(normalizeCanonicalPath, AppCore, path);

  if (helper) {
    const cleanHelper = localCanonicalPath(helper);

    if (cleanHelper === "/" && local !== "/" && USERNAME_SEGMENT_RE.test(splitPath(path).pathname.split("/").filter(Boolean)[0] || "")) {
      return local;
    }

    return cleanHelper;
  }

  return local;
}

function callGetter(fn, AppCore, Router) {
  if (!isFn(fn)) return "";

  const attempts = [
    () => fn(AppCore, Router),
    () => fn(AppCore),
    () => fn(),
  ];

  for (const attempt of attempts) {
    try {
      const value = attempt();
      if (value) return value;
    } catch {}
  }

  return "";
}

function routerGetter(Router, method = "") {
  try {
    if (isFn(Router?.[method])) return Router[method]();
  } catch {}

  return "";
}

function resolvePublicPath(AppCore, Router, payload = {}) {
  const data = safeObject(payload);
  const route = safeObject(data.route);
  const resolved = safeObject(data.resolved);

  const candidate =
    data.publicPath ||
    data.currentPublicPath ||
    data.requestedPath ||
    data.href ||
    data.to ||
    data.path ||
    route.publicPath ||
    route.path ||
    resolved.publicPath ||
    AppCore?.state?.publicPath ||
    routerGetter(Router, "getCurrentPublicPath") ||
    callGetter(getCurrentPublicPath, AppCore, Router) ||
    "/";

  return normalizePublicSafe(AppCore, candidate);
}

function resolveCanonicalPath(AppCore, Router, payload = {}) {
  const data = safeObject(payload);
  const route = safeObject(data.route);
  const resolved = safeObject(data.resolved);

  const candidate =
    data.canonicalPath ||
    data.currentCanonicalPath ||
    route.canonicalPath ||
    resolved.canonicalPath ||
    routerGetter(Router, "getCurrentCanonicalPath") ||
    callGetter(getCurrentCanonicalPath, AppCore, Router) ||
    AppCore?.state?.route ||
    route.path ||
    data.path ||
    resolvePublicPath(AppCore, Router, data) ||
    "/";

  return normalizeCanonicalSafe(AppCore, candidate);
}

/* =========================================================
   STATE
========================================================= */

function assignState(AppCore, patch = {}) {
  const cleanPatch = safeObject(patch);

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, cleanPatch);
      return true;
    }
  } catch {}

  return false;
}

function setStateSilent(AppCore, patch = {}) {
  const cleanPatch = safeObject(patch);

  /*
    Intencionado:
    AppEvents no debe provocar app:route:change desde router:rendered.
  */
  if (assignState(AppCore, cleanPatch)) return true;

  try {
    AppCore?.setState?.(cleanPatch, {
      emit: false,
      emitState: false,
      silent: true,
      source: "app:events:silent-state-sync",
    });

    return true;
  } catch {}

  return false;
}

function patchRouteState(AppCore, {
  route = "/",
  publicPath = "/",
} = {}) {
  const cleanRoute = normalizeCanonicalSafe(AppCore, route);
  const cleanPublic = normalizePublicSafe(AppCore, publicPath);

  const current = safeObject(AppCore?.state);

  const routeChanged =
    safeText(current.route, "") !== cleanRoute ||
    safeText(current.canonicalPath, "") !== cleanRoute;

  const publicChanged =
    safeText(current.publicPath, "") !== cleanPublic;

  if (!routeChanged && !publicChanged) {
    return {
      changed: false,
      routeChanged: false,
      publicChanged: false,
      route: cleanRoute,
      publicPath: cleanPublic,
    };
  }

  const patch = {};

  if (routeChanged) {
    patch.route = cleanRoute;
    patch.canonicalPath = cleanRoute;
  }

  if (publicChanged) {
    patch.publicPath = cleanPublic;
  }

  setStateSilent(AppCore, patch);

  return {
    changed: true,
    routeChanged,
    publicChanged,
    route: cleanRoute,
    publicPath: cleanPublic,
  };
}

/* =========================================================
   AUTH / TOAST
========================================================= */

function getAuthUser(Auth) {
  try {
    return Auth?.getUser?.() || Auth?.getCurrentUser?.() || Auth?.user || null;
  } catch {
    return null;
  }
}

function getAuthStatus(Auth) {
  try {
    if (isFn(Auth?.isAuthenticated)) return Boolean(Auth.isAuthenticated());
  } catch {}

  return Boolean(Auth?.authenticated);
}

function normalizeToastType(type = "info") {
  const clean = safeText(type, "info").toLowerCase();
  return clean === "warn" ? "warning" : clean || "info";
}

function safeToast(Toast, AppCore, type, message, options = {}) {
  const cleanType = normalizeToastType(type);
  const cleanMessage = safeText(message, "");

  if (!cleanMessage) return null;

  const payload = {
    ...safeObject(options),
    type: cleanType,
    message: cleanMessage,
  };

  const typedMethods = cleanType === "warning"
    ? ["warning", "warn", "warningToast"]
    : [cleanType, `${cleanType}Toast`];

  for (const method of typedMethods) {
    try {
      if (isFn(Toast?.[method])) return Toast[method](cleanMessage, payload);
    } catch {}
  }

  const attempts = [
    () => Toast?.showToast?.(cleanMessage, cleanType, payload),
    () => Toast?.show?.(cleanMessage, cleanType, payload),
    () => Toast?.notify?.(payload),
    () => AppCore?.showToast?.(cleanMessage, cleanType, payload),
  ];

  for (const attempt of attempts) {
    try {
      const result = attempt();
      if (result !== undefined && result !== null) return result;
    } catch {}
  }

  return null;
}

function toastOnce(Toast, AppCore, type, message, options = {}, dedupeMs = TOAST_DEDUPE_MS) {
  const key = redact(`${normalizeToastType(type)}:${options?.title || ""}:${message || ""}`);
  const stamp = now();

  if (key === lastToastKey && stamp - lastToastAt < dedupeMs) {
    return null;
  }

  lastToastKey = key;
  lastToastAt = stamp;

  return safeToast(Toast, AppCore, type, message, options);
}

/* =========================================================
   UI LIGHT SYNC
========================================================= */

function callUiMethod(target, methodName, context = {}) {
  const fn = target?.[methodName];

  if (!isFn(fn)) return false;

  const attempts = [
    () => fn.call(target, context.reason || context, context),
    () => fn.call(target, context),
    () => fn.call(target),
  ];

  for (const attempt of attempts) {
    try {
      attempt();
      return true;
    } catch {}
  }

  return false;
}

function callFirst(target, methods = [], context = {}) {
  for (const method of safeArray(methods)) {
    if (callUiMethod(target, method, context)) {
      return method;
    }
  }

  return "";
}

function callAll(target, methods = [], context = {}) {
  const used = [];

  for (const method of safeArray(methods)) {
    if (callUiMethod(target, method, context)) {
      used.push(method);
    }
  }

  return used;
}

function syncSidebar(SidebarUI, context = {}) {
  const user = callFirst(SidebarUI, SIDEBAR_USER_METHODS, context);
  const visual = callAll(SidebarUI, SIDEBAR_VISUAL_METHODS, context);

  const fallback = !user && !visual.length
    ? callFirst(SidebarUI, SIDEBAR_FALLBACK_METHODS, context)
    : "";

  return {
    ok: Boolean(user || visual.length || fallback),
    user,
    visual,
    fallback,
  };
}

function syncTopbar(TopbarUI, context = {}) {
  const user = callFirst(TopbarUI, TOPBAR_USER_METHODS, context);
  const visual = callAll(TopbarUI, TOPBAR_VISUAL_METHODS, context);

  const fallback = !user && !visual.length
    ? callFirst(TopbarUI, TOPBAR_FALLBACK_METHODS, context)
    : "";

  return {
    ok: Boolean(user || visual.length || fallback),
    user,
    visual,
    fallback,
  };
}

function uiDedupeKey(context = {}) {
  return [
    context.route || "/",
    context.publicPath || "/",
    context.authenticated ? "auth" : "anon",
    context.user?.id || context.user?.userId || "",
    context.user?.username || context.user?.email || "",
    context.user?.role || context.user?.rol || context.role || "",
  ]
    .map((item) => safeText(item, ""))
    .join("|");
}

function shouldSkipUiSync(context = {}, force = false) {
  if (force) return false;

  const key = redact(uiDedupeKey(context));
  const stamp = now();

  if (key === lastUiKey && stamp - lastUiAt < UI_SYNC_DEDUPE_MS) {
    return true;
  }

  lastUiKey = key;
  lastUiAt = stamp;

  return false;
}

async function syncUiLight({
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
  emitResult = true,
  force = false,
} = {}) {
  const publicPath = resolvePublicPath(AppCore, Router, payload);
  const route = resolveCanonicalPath(AppCore, Router, payload);

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

    reason: safeText(reason, "sync-ui"),
    payload: safeObject(payload),

    route,
    publicPath,
    user,

    role: AppCore?.state?.role || user?.role || user?.rol || null,
    authenticated: Boolean(AppCore?.state?.authenticated || getAuthStatus(Auth)),

    rebind: false,
    hardRepair: false,
  };

  if (shouldSkipUiSync(context, force)) return true;

  let injected = false;
  let ok = false;

  let sidebar = { ok: false };
  let topbar = { ok: false };

  if (isFn(syncUserUI)) {
    try {
      await Promise.resolve(
        syncUserUI({
          ...context,
          force: true,
        })
      );

      injected = true;
      ok = true;
    } catch (error) {
      warn(AppCore, "syncUserUI() inyectado falló.", error);
    }
  }

  if (!injected) {
    sidebar = syncSidebar(SidebarUI, context);
    topbar = syncTopbar(TopbarUI, context);
    ok = Boolean(sidebar.ok || topbar.ok);
  }

  if (emitResult) {
    emit(AppCore, EVENT_NAMES.appEventsUiSynced, {
      reason: context.reason,
      route,
      publicPath,
      authenticated: context.authenticated,
      injected,
      sidebar,
      topbar,
      ok,
    });
  }

  return ok;
}

function requestUiRepair(AppCore, reason = "event", payload = {}) {
  const detail = {
    source: SOURCE,
    reason: safeText(reason, "event"),
    payload: safeObject(payload),
    hardRepair: false,
    rebind: false,
    at: iso(),
  };

  emit(AppCore, EVENT_NAMES.appUiRepairRequest, detail);
  return detail;
}

/* =========================================================
   LANGUAGE / THEME
========================================================= */

function normalizeLang(value = "", fallback = "es") {
  const raw = safeText(value, fallback).toLowerCase().replace(/_/g, "-");
  const first = raw.split("-")[0] || raw;

  if (["spa", "spanish", "castellano"].includes(first)) return "es";
  if (["eng", "english"].includes(first)) return "en";
  if (["cat", "catalan", "català", "catalán"].includes(first)) return "ca";

  return first || fallback;
}

function setDocumentLang(lang = "es") {
  if (!isBrowser()) return false;

  const cleanLang = normalizeLang(lang, "es");

  try {
    document.documentElement.setAttribute("lang", cleanLang);
    document.documentElement.lang = cleanLang;
    return true;
  } catch {
    return false;
  }
}

function resolveLang(AppCore, I18n, payload = {}) {
  return normalizeLang(
    payload.lang ||
      payload.language ||
      payload.locale ||
      I18n?.getLang?.() ||
      I18n?.getLanguage?.() ||
      I18n?.lang ||
      I18n?.language ||
      AppCore?.state?.lang ||
      "es",
    "es"
  );
}

function setI18nLang(I18n, lang = "es") {
  const cleanLang = normalizeLang(lang, "es");

  for (const method of ["setLang", "setLanguage", "changeLang", "changeLanguage", "use"]) {
    try {
      if (isFn(I18n?.[method])) {
        const result = I18n[method](cleanLang, {
          silent: true,
          source: SOURCE,
        });

        if (result && isFn(result.catch)) result.catch(() => {});
        return true;
      }
    } catch {}
  }

  try {
    if (I18n && typeof I18n === "object") {
      I18n.lang = cleanLang;
      return true;
    }
  } catch {}

  return false;
}

function shouldRerenderOnLang(payload = {}) {
  return Boolean(
    payload.rerenderByEvents === true ||
      payload.appEventsRerender === true ||
      payload.forceEventsRerender === true
  );
}

async function rerenderCurrentRoute({
  AppCore,
  Router,
  rerenderCurrentRoute: injected,
  reason = "lang-change",
} = {}) {
  const stamp = now();

  if (stamp - lastLangRenderAt < LANG_RERENDER_DEDUPE_MS) return false;

  lastLangRenderAt = stamp;

  try {
    if (isFn(injected)) {
      await Promise.resolve(
        injected({
          AppCore,
          Router,
          reason,
          source: SOURCE,
        })
      );

      return true;
    }
  } catch (error) {
    warn(AppCore, "rerenderCurrentRoute() inyectado falló.", error);
  }

  const publicPath = resolvePublicPath(AppCore, Router, {});
  const canonicalPath = resolveCanonicalPath(AppCore, Router, { publicPath });

  try {
    if (isFn(Router?.rerenderCurrentRoute)) {
      await Promise.resolve(
        Router.rerenderCurrentRoute({
          reason,
          source: SOURCE,
          force: true,
        })
      );

      return true;
    }
  } catch {}

  try {
    if (isFn(Router?.render)) {
      await Promise.resolve(
        Router.render(canonicalPath, {
          force: true,
          reason,
          source: SOURCE,
          preservePublicPath: true,
          publicPath,
          canonicalPath,
          i18nRerender: true,
          skipHistory: true,
          replaceState: false,
        })
      );

      return true;
    }
  } catch {}

  try {
    if (isFn(Router?.navigate)) {
      await Promise.resolve(
        Router.navigate(publicPath, {
          replaceState: true,
          force: true,
          reason,
          source: SOURCE,
          preservePublicPath: true,
          i18nRerender: true,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function shouldSkipTheme(payload = {}) {
  const key = [
    payload.theme || "",
    payload.mode || "",
    payload.appearance || "",
    payload.value || "",
  ]
    .map((item) => safeText(item, ""))
    .join("|");

  const stamp = now();

  if (key && key === lastThemeKey && stamp - lastThemeAt < THEME_SYNC_DEDUPE_MS) {
    return true;
  }

  lastThemeKey = key;
  lastThemeAt = stamp;

  return false;
}

/* =========================================================
   LOADER POLICY
========================================================= */

function applyLoaderPolicy({
  AppCore,
  Router,
  applyPostRenderLoaderPolicy,
  payload = {},
} = {}) {
  const fn = isFn(applyPostRenderLoaderPolicy)
    ? applyPostRenderLoaderPolicy
    : applyPostRenderLoaderPolicyBase;

  try {
    if (isFn(fn)) {
      fn({
        AppCore,
        Router,
        ...safeObject(payload),
      });

      return true;
    }
  } catch (error) {
    warn(AppCore, "applyPostRenderLoaderPolicy() falló.", error);
  }

  return false;
}

/* =========================================================
   BIND HELPERS
========================================================= */

function normalizeDisposer(candidate) {
  if (isFn(candidate)) return candidate;

  if (isFn(candidate?.dispose)) {
    return () => {
      try {
        candidate.dispose();
      } catch {}
    };
  }

  if (isFn(candidate?.off)) {
    return () => {
      try {
        candidate.off();
      } catch {}
    };
  }

  if (isFn(candidate?.remove)) {
    return () => {
      try {
        candidate.remove();
      } catch {}
    };
  }

  return null;
}

function rememberDisposer(disposer) {
  if (isFn(disposer)) disposers.push(disposer);
}

function rememberEvent(eventName = "") {
  const clean = safeText(eventName, "");

  if (clean && !eventState.boundEvents.includes(clean)) {
    eventState.boundEvents.push(clean);
  }
}

function bindViaBus(AppCore, eventName, handler) {
  const bus = AppCore?.events;

  if (!isFn(bus?.on)) return false;

  try {
    const off = bus.on(eventName, handler);
    const disposer = normalizeDisposer(off);

    if (disposer) {
      rememberDisposer(disposer);
    } else if (isFn(bus.off)) {
      rememberDisposer(() => {
        try {
          bus.off(eventName, handler);
        } catch {}
      });
    }

    rememberEvent(eventName);
    return true;
  } catch {
    return false;
  }
}

function bindViaWindow(eventName, handler, options = false) {
  if (!isBrowser()) return false;

  try {
    window.addEventListener(eventName, handler, options);

    rememberDisposer(() => {
      try {
        window.removeEventListener(eventName, handler, options);
      } catch {}
    });

    rememberEvent(eventName);
    return true;
  } catch {
    return false;
  }
}

function bindEvent({
  AppCore,
  eventName,
  label = "",
  handler,
  windowFallback = true,
  options = false,
}) {
  const cleanName = safeText(eventName, "");
  const cleanLabel = safeText(label, cleanName || "event");

  if (!cleanName || !isFn(handler)) return false;

  const key = `${cleanName}::${cleanLabel}`;

  if (boundKeys.has(key)) return false;

  const wrapped = (eventOrPayload = {}) => {
    const payload = getPayload(eventOrPayload);

    recordHandled(cleanName, payload);

    Promise.resolve(
      handler(payload, {
        eventName: cleanName,
        label: cleanLabel,
        raw: eventOrPayload,
      })
    ).catch((error) => {
      recordError(AppCore, cleanName, error);
    });
  };

  const busBound = bindViaBus(AppCore, cleanName, wrapped);

  if (busBound) {
    boundKeys.add(key);
    return true;
  }

  if (windowFallback && bindViaWindow(cleanName, wrapped, options)) {
    boundKeys.add(key);
    return true;
  }

  return false;
}

function bindMany({
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
      bindEvent({
        AppCore,
        eventName,
        label: `${label}:${eventName}`,
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
   HANDLERS
========================================================= */

function bindUserEvents(context) {
  const { AppCore } = context;

  bindMany({
    AppCore,
    label: "user-sync",
    eventNames: [
      EVENT_NAMES.appUserChange,
      EVENT_NAMES.appSessionRestored,
      EVENT_NAMES.authSessionRestored,
      EVENT_NAMES.appSessionCleared,
      EVENT_NAMES.appUiReady,
      EVENT_NAMES.appReady,
    ],
    handler: (payload, meta) =>
      syncUiLight({
        ...context,
        reason: meta.eventName || payload.reason || payload.source || "user-sync",
        payload,
      }),
  });
}

function bindLanguageEvents(context) {
  const {
    AppCore,
    I18n,
    Toast,
    Router,
    rerenderCurrentRoute: injectedRerender,
  } = context;

  bindEvent({
    AppCore,
    eventName: EVENT_NAMES.appLangChange,
    label: "lang-change",
    handler: async (payload) => {
      const lang = resolveLang(AppCore, I18n, payload);

      setDocumentLang(lang);
      setI18nLang(I18n, lang);

      setStateSilent(AppCore, {
        lang,
        language: lang,
        locale: lang,
      });

      if (shouldRerenderOnLang(payload) && !langChangeInFlight) {
        langChangeInFlight = true;

        try {
          await rerenderCurrentRoute({
            AppCore,
            Router,
            rerenderCurrentRoute: injectedRerender,
            reason: "app:lang:change:events-rerender",
          });
        } finally {
          langChangeInFlight = false;
        }
      }

      if (payload.toast === true) {
        toastOnce(Toast, AppCore, "success", "Idioma actualizado", {
          title: "Idioma",
          duration: 2200,
        });
      }
    },
  });
}

function bindThemeEvents(context) {
  const { AppCore } = context;

  bindMany({
    AppCore,
    label: "theme-sync",
    eventNames: [
      EVENT_NAMES.appThemeChange,
      EVENT_NAMES.onionThemeChange,
      EVENT_NAMES.legacyThemeChange,
    ],
    handler: async (payload) => {
      if (shouldSkipTheme(payload)) return;

      const theme = safeText(
        payload.theme || payload.mode || payload.appearance || payload.value || "",
        ""
      );

      if (theme) {
        setStateSilent(AppCore, {
          theme,
          mode: payload.mode || theme,
          appearance: payload.appearance || payload.mode || theme,
        });
      }

      await syncUiLight({
        ...context,
        reason: "theme-change",
        payload,
        force: true,
      });
    },
  });
}

function bindAuthEvents(context) {
  const { AppCore, Toast } = context;

  bindEvent({
    AppCore,
    eventName: EVENT_NAMES.authLoginSuccess,
    label: "auth-login-success",
    handler: async (payload) => {
      await syncUiLight({
        ...context,
        reason: "auth:login:success",
        payload,
        force: true,
      });

      toastOnce(Toast, AppCore, "success", "Sesión iniciada correctamente.", {
        title: "Bienvenido",
        duration: 2600,
      });
    },
  });

  bindEvent({
    AppCore,
    eventName: EVENT_NAMES.authLogoutSuccess,
    label: "auth-logout-success",
    handler: async (payload) => {
      await syncUiLight({
        ...context,
        reason: "auth:logout:success",
        payload,
        force: true,
      });

      toastOnce(Toast, AppCore, "info", "Sesión cerrada correctamente.", {
        title: "Sesión finalizada",
        duration: 2600,
      });
    },
  });

  bindEvent({
    AppCore,
    eventName: EVENT_NAMES.authLogout,
    label: "auth-logout",
    handler: (payload) =>
      syncUiLight({
        ...context,
        reason: "auth:logout",
        payload,
        force: true,
      }),
  });
}

function bindRouteChangeEvents(context) {
  const { AppCore } = context;

  bindEvent({
    AppCore,
    eventName: EVENT_NAMES.appRouteChange,
    label: "app-route-change-light-sync",
    handler: (payload) =>
      syncUiLight({
        ...context,
        reason: "app:route:change",
        payload,
      }),
  });
}

function shouldSkipRouterSync(route = "/", publicPath = "/") {
  const key = `${redact(route)}|${redact(publicPath)}`;
  const stamp = now();

  if (key === lastRouterKey && stamp - lastRouterAt < ROUTER_SYNC_DEDUPE_MS) {
    return true;
  }

  lastRouterKey = key;
  lastRouterAt = stamp;

  return false;
}

function bindRouterEvents(context) {
  const {
    AppCore,
    Router,
    applyPostRenderLoaderPolicy,
  } = context;

  bindEvent({
    AppCore,
    eventName: EVENT_NAMES.routerRendered,
    label: "router-rendered-state-loader-sync",
    handler: (payload) => {
      const publicPath = resolvePublicPath(AppCore, Router, payload);
      const canonicalPath = resolveCanonicalPath(AppCore, Router, payload);

      if (shouldSkipRouterSync(canonicalPath, publicPath)) return;

      const routePatch = patchRouteState(AppCore, {
        route: canonicalPath,
        publicPath,
      });

      const loaderPolicyApplied = applyLoaderPolicy({
        AppCore,
        Router,
        applyPostRenderLoaderPolicy,
        payload,
      });

      /*
        CRÍTICO:
        No sync UI aquí.
        No app:ui:repair-request aquí.
        No app:route:change aquí.
      */
      emit(AppCore, EVENT_NAMES.appRouteSynced, {
        reason: payload.phase || payload.reason || "router:rendered",
        route: canonicalPath,
        publicPath,
        routeChanged: Boolean(routePatch.routeChanged),
        publicChanged: Boolean(routePatch.publicChanged),
        changed: Boolean(routePatch.changed),
        loaderPolicyApplied,
        silent: true,
      });
    },
  });

  bindEvent({
    AppCore,
    eventName: EVENT_NAMES.routerAsyncComplete,
    label: "router-async-complete-telemetry",
    handler: (payload) => {
      const publicPath = resolvePublicPath(AppCore, Router, payload);
      const canonicalPath = resolveCanonicalPath(AppCore, Router, payload);

      emit(AppCore, EVENT_NAMES.appRouteSynced, {
        reason: "router:render:async-complete",
        route: canonicalPath,
        publicPath,
        silent: true,
      });
    },
  });

  bindEvent({
    AppCore,
    eventName: EVENT_NAMES.routerShellState,
    label: "router-shell-state-noop",
    handler: () => {
      /*
        NOOP intencionado:
        evita bucle shell -> UI -> repair -> shell.
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
      if (isBrowser() && window.__ONION_APP_EVENTS__) {
        return window.__ONION_APP_EVENTS__;
      }
    } catch {}
  }

  const api = {
    version: APP_EVENTS_VERSION,

    getSnapshot: getAppEventsSnapshot,
    reset: resetAppEventsState,

    unbind: () => unbindAppEvents(AppCore),

    requestUiRepair: (reason = "debug", payload = {}) =>
      requestUiRepair(AppCore, reason, payload),
  };

  try {
    if (isBrowser()) {
      window.__ONION_APP_EVENTS__ = api;
    }
  } catch {}

  try {
    defineHidden(AppCore, "AppEvents", api);
  } catch {}

  debugApiInstalled = true;

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
  if (bound) return true;

  if (binding) {
    warn(AppCore, "bindAppEvents omitido: binding ya en curso.", {
      scope: safeText(scope, DEFAULT_SCOPE),
    });

    return true;
  }

  binding = true;

  const finalScope = safeText(scope, DEFAULT_SCOPE);

  const context = {
    AppCore,
    Auth,
    Router,
    Store,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,

    scope: finalScope,

    syncUserUI,
    rerenderCurrentRoute,

    applyPostRenderLoaderPolicy: isFn(applyPostRenderLoaderPolicy)
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

    bound = true;
    boundScope = finalScope;

    exposeDebugApi(AppCore);

    emit(AppCore, EVENT_NAMES.appEventsBound, {
      scope: boundScope,
      at: iso(),
      boundEvents: [...eventState.boundEvents],
    });

    emit(AppCore, EVENT_NAMES.appEventsReady, getAppEventsSnapshot());

    log(AppCore, "App events ready.", {
      scope: boundScope,
      boundEvents: [...eventState.boundEvents],
    });

    return true;
  } catch (error) {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch {}
    }

    boundKeys.clear();

    bound = false;
    boundScope = "";

    recordError(AppCore, EVENT_NAMES.appEventsError, error);

    return false;
  } finally {
    binding = false;
  }
}

export function unbindAppEvents(AppCore = null) {
  for (const dispose of disposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

  boundKeys.clear();

  bound = false;
  binding = false;
  boundScope = "";

  langChangeInFlight = false;
  eventState.boundEvents = [];

  emit(AppCore, EVENT_NAMES.appEventsUnbound, {
    at: iso(),
  });

  log(AppCore, "App events unbound.");

  return true;
}

export function getAppEventsSnapshot() {
  return sanitize({
    version: APP_EVENTS_VERSION,

    bound: Boolean(bound),
    binding: Boolean(binding),
    boundScope,

    boundEvents: [...eventState.boundEvents],
    boundKeys: Array.from(boundKeys),
    disposers: disposers.length,

    langChangeInFlight: Boolean(langChangeInFlight),

    lastLangRenderAt,
    lastLangRenderAtIso: lastLangRenderAt ? iso(lastLangRenderAt) : "",

    lastRouterKey: redact(lastRouterKey),
    lastRouterAt,
    lastRouterAtIso: lastRouterAt ? iso(lastRouterAt) : "",

    lastToastKey: redact(lastToastKey),
    lastToastAt,
    lastToastAtIso: lastToastAt ? iso(lastToastAt) : "",

    lastUiKey: redact(lastUiKey),
    lastUiAt,
    lastUiAtIso: lastUiAt ? iso(lastUiAt) : "",

    lastThemeKey: redact(lastThemeKey),
    lastThemeAt,
    lastThemeAtIso: lastThemeAt ? iso(lastThemeAt) : "",

    lastEmitKey: redact(lastEmitKey),
    lastEmitAt,
    lastEmitAtIso: lastEmitAt ? iso(lastEmitAt) : "",

    totalHandled: eventState.totalHandled,
    totalErrors: eventState.totalErrors,

    lastEvent: eventState.lastEvent,
    lastEventAt: eventState.lastEventAt,
    lastEventAtIso: eventState.lastEventAt ? iso(eventState.lastEventAt) : "",

    lastError: eventState.lastError,
    recent: eventState.recent.slice(0, MAX_RECENT),

    debugApiInstalled: Boolean(debugApiInstalled),
  });
}

export function resetAppEventsState() {
  langChangeInFlight = false;

  lastLangRenderAt = 0;

  lastRouterKey = "";
  lastRouterAt = 0;

  lastToastKey = "";
  lastToastAt = 0;

  lastUiKey = "";
  lastUiAt = 0;

  lastThemeKey = "";
  lastThemeAt = 0;

  lastEmitKey = "";
  lastEmitAt = 0;

  eventState.totalHandled = 0;
  eventState.totalErrors = 0;
  eventState.lastEvent = "";
  eventState.lastEventAt = 0;
  eventState.lastError = null;
  eventState.recent = [];

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

  requestUiRepair,
};
