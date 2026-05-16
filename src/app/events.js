/* =========================================================
   Onion SPA - App Events
   Archivo: src/app/events.js

   APP EVENTS · FINAL SIMPLE
   - Wiring mínimo de eventos de App
   - Sin Auth paralelo, Router paralelo, render propio, restore ni refresh
   - Sin fetch, storage, Toast obligatorio ni permisos
   - router:rendered sólo sincroniza estado + loader post-render
   - UI sync sólo por callback inyectado
========================================================= */

import {
  getCurrentPublicPath,
  getCurrentCanonicalPath,
  normalizePublicPath,
  normalizeCanonicalPath,
  redactTokenInText,
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
   VERSION / CONSTANTS
========================================================= */

export const APP_EVENTS_VERSION = "20.0.0-final";

const SOURCE = "app.events";
const DEFAULT_ROUTE = "/";
const DEFAULT_SCOPE = APP_SCOPES?.events || APP_SCOPE || "app:events";

const DEDUPE_MS = 120;
const ROUTER_DEDUPE_MS = 40;
const MAX_RECENT = 30;

const EVENT_NAMES = Object.freeze({
  appReady: APP_EVENTS?.ready || "app:ready",
  appUiReady: APP_EVENTS?.uiReady || "app:ui:ready",
  appUiRepairRequest: APP_EVENTS?.uiRepairRequest || "app:ui:repair-request",
  appUserChange: APP_EVENTS?.userChange || "app:user:change",
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
});

const USER_SYNC_EVENTS = Object.freeze([
  EVENT_NAMES.appReady,
  EVENT_NAMES.appUiReady,
  EVENT_NAMES.appUserChange,
  EVENT_NAMES.appSessionRestored,
  EVENT_NAMES.appSessionCleared,
  EVENT_NAMES.authSessionRestored,
  EVENT_NAMES.authLoginSuccess,
  EVENT_NAMES.authLogout,
  EVENT_NAMES.authLogoutSuccess,
]);

const THEME_EVENTS = Object.freeze([
  EVENT_NAMES.appThemeChange,
  EVENT_NAMES.onionThemeChange,
  EVENT_NAMES.legacyThemeChange,
]);

const SENSITIVE_KEY_RE = /token|secret|password|authorization|credential|jwt|bearer|otp|code|session|refresh|access/i;

/* =========================================================
   RUNTIME
========================================================= */

let bound = false;
let binding = false;
let boundScope = "";
let lastUiKey = "";
let lastUiAt = 0;
let lastRouterKey = "";
let lastRouterAt = 0;
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

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isObjectLike = (value) => value !== null && (typeof value === "object" || typeof value === "function");

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

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).flat(Infinity).map((item) => text(item, "")).filter(Boolean))];
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

function payloadFrom(eventOrPayload = {}) {
  if (isObject(eventOrPayload?.detail)) return eventOrPayload.detail;
  if (isObject(eventOrPayload?.payload)) return eventOrPayload.payload;
  return isObject(eventOrPayload) ? eventOrPayload : {};
}

/* =========================================================
   SANITIZE / EMIT
========================================================= */

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "");
  }
}

function normalizeError(error = null) {
  if (!error) return null;

  const source = error?.error || error?.reason || error;

  return {
    name: text(source?.name, "AppEventsError"),
    message: redact(text(source?.message || source, "Error en App Events.")),
    code: text(source?.code || source?.status || source?.statusCode, "APP_EVENTS_ERROR"),
  };
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";
  if (SENSITIVE_KEY_RE.test(keyHint)) return value ? "***" : value;
  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return normalizeError(value);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1, keyHint));
  if (value instanceof Map) return { type: "Map", size: value.size };
  if (value instanceof Set) return { type: "Set", size: value.size };

  if (isObject(value)) {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) output[key] = sanitize(item, depth + 1, key);
    return output;
  }

  return String(value);
}

function shouldDedupeEmit(eventName = "", payload = {}, force = false) {
  if (force) return false;

  const key = [
    eventName,
    payload?.reason || payload?.phase || "",
    payload?.route || payload?.canonicalPath || "",
    payload?.publicPath || "",
    payload?.ok === false ? "fail" : "ok",
  ].map((item) => text(item, "")).join("|");

  const stamp = now();

  if (key === lastEmitKey && stamp - lastEmitAt < DEDUPE_MS) return true;

  lastEmitKey = key;
  lastEmitAt = stamp;

  return false;
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;
  if (options.dedupe !== false && shouldDedupeEmit(name, payload, options.force === true)) return false;

  const detail = sanitize({ version: APP_EVENTS_VERSION, source: SOURCE, at: iso(), ...object(payload) });

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
    AppCore?.utils?.warn?.("[AppEvents]", ...args.map((item) => sanitize(item)));
  } catch {
    try {
      if (AppCore?.config?.debug) console.warn("[AppEvents]", ...args.map((item) => sanitize(item)));
    } catch {}
  }
}

function pushRecent(event = {}) {
  eventState.recent.unshift(sanitize({ ...event, at: iso(), atMs: now() }));
  if (eventState.recent.length > MAX_RECENT) eventState.recent.length = MAX_RECENT;
}

function recordHandled(eventName = "", payload = {}) {
  eventState.totalHandled += 1;
  eventState.lastEvent = text(eventName, "");
  eventState.lastEventAt = now();
  pushRecent({ event: eventState.lastEvent, payload: object(payload) });
}

function recordError(AppCore, eventName = "", error = null) {
  eventState.totalErrors += 1;
  eventState.lastError = { event: text(eventName, ""), error: normalizeError(error), at: iso() };
  pushRecent({ event: "error", payload: eventState.lastError });
  warn(AppCore, `Error procesando evento ${eventName || "desconocido"}.`, error);
  emit(AppCore, EVENT_NAMES.appEventsError, eventState.lastError, { force: true });
}

/* =========================================================
   PATH / STATE
========================================================= */

function callPathHelper(fn, AppCore, Router, fallback = DEFAULT_ROUTE) {
  if (!isFn(fn)) return fallback;

  for (const call of [() => fn(AppCore, Router), () => fn(AppCore), () => fn()]) {
    try {
      const value = call();
      if (value) return value;
    } catch {}
  }

  return fallback;
}

function normalizePublicSafe(AppCore, path = DEFAULT_ROUTE) {
  try {
    return normalizePublicPath(AppCore, path) || DEFAULT_ROUTE;
  } catch {
    return path || DEFAULT_ROUTE;
  }
}

function normalizeCanonicalSafe(AppCore, path = DEFAULT_ROUTE) {
  try {
    return normalizeCanonicalPath(AppCore, path) || DEFAULT_ROUTE;
  } catch {
    return path || DEFAULT_ROUTE;
  }
}

function routerGetter(Router, method = "") {
  try {
    if (isFn(Router?.[method])) return Router[method]();
  } catch {}

  return "";
}

function resolvePublicPath(AppCore, Router, payload = {}) {
  const data = object(payload);
  const route = object(data.route);
  const resolved = object(data.resolved);

  return normalizePublicSafe(
    AppCore,
    data.publicPath ||
      data.currentPublicPath ||
      data.requestedPath ||
      data.href ||
      data.to ||
      data.path ||
      route.publicPath ||
      route.path ||
      resolved.publicPath ||
      routerGetter(Router, "getCurrentPublicPath") ||
      callPathHelper(getCurrentPublicPath, AppCore, Router, AppCore?.state?.publicPath || DEFAULT_ROUTE)
  );
}

function resolveCanonicalPath(AppCore, Router, payload = {}) {
  const data = object(payload);
  const route = object(data.route);
  const resolved = object(data.resolved);

  return normalizeCanonicalSafe(
    AppCore,
    data.canonicalPath ||
      data.currentCanonicalPath ||
      route.canonicalPath ||
      resolved.canonicalPath ||
      routerGetter(Router, "getCurrentCanonicalPath") ||
      callPathHelper(getCurrentCanonicalPath, AppCore, Router, AppCore?.state?.route || DEFAULT_ROUTE) ||
      route.path ||
      data.path ||
      resolvePublicPath(AppCore, Router, data)
  );
}

function setStateSilent(AppCore, patch = {}) {
  const data = object(patch);
  if (!Object.keys(data).length) return false;

  try {
    if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, data);
  } catch {}

  try {
    AppCore?.setState?.(data, { emit: false, emitState: false, silent: true, source: SOURCE });
    return true;
  } catch {}

  try {
    AppCore?.patchState?.(data, { emit: false, silent: true, source: SOURCE });
    return true;
  } catch {}

  return false;
}

function patchRouteState(AppCore, { route = DEFAULT_ROUTE, publicPath = DEFAULT_ROUTE } = {}) {
  const cleanRoute = normalizeCanonicalSafe(AppCore, route);
  const cleanPublic = normalizePublicSafe(AppCore, publicPath);
  const current = object(AppCore?.state);

  const routeChanged = text(current.route, "") !== cleanRoute || text(current.canonicalPath, "") !== cleanRoute;
  const publicChanged = text(current.publicPath, "") !== cleanPublic;

  if (!routeChanged && !publicChanged) {
    return { changed: false, routeChanged: false, publicChanged: false, route: cleanRoute, publicPath: cleanPublic };
  }

  const patch = {};
  if (routeChanged) {
    patch.route = cleanRoute;
    patch.canonicalPath = cleanRoute;
  }
  if (publicChanged) patch.publicPath = cleanPublic;

  setStateSilent(AppCore, patch);

  return { changed: true, routeChanged, publicChanged, route: cleanRoute, publicPath: cleanPublic };
}

/* =========================================================
   UI / LOADER
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

function uiDedupeKey(context = {}) {
  return [
    context.route || DEFAULT_ROUTE,
    context.publicPath || DEFAULT_ROUTE,
    context.authenticated ? "auth" : "anon",
    context.user?.id || context.user?.userId || "",
    context.user?.username || context.user?.email || "",
    context.user?.role || context.user?.rol || context.role || "",
  ].map((item) => text(item, "")).join("|");
}

function shouldSkipUiSync(context = {}, force = false) {
  if (force) return false;

  const key = redact(uiDedupeKey(context));
  const stamp = now();

  if (key === lastUiKey && stamp - lastUiAt < DEDUPE_MS) return true;

  lastUiKey = key;
  lastUiAt = stamp;

  return false;
}

async function syncUi({ AppCore, Auth, Router, Store, SidebarUI, TopbarUI, Toast, I18n, syncUserUI, reason = "sync-ui", payload = {}, force = false } = {}) {
  const publicPath = resolvePublicPath(AppCore, Router, payload);
  const route = resolveCanonicalPath(AppCore, Router, payload);
  const user = AppCore?.state?.user || AppCore?.state?.currentUser || AppCore?.state?.sessionUser || getAuthUser(Auth);

  const context = {
    AppCore,
    Auth,
    Router,
    Store,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    reason,
    payload: object(payload),
    route,
    publicPath,
    user,
    role: AppCore?.state?.role || user?.role || user?.rol || null,
    authenticated: Boolean(AppCore?.state?.authenticated || getAuthStatus(Auth)),
    rebind: false,
    hardRepair: false,
    force,
  };

  if (shouldSkipUiSync(context, force)) return true;

  if (isFn(syncUserUI)) {
    await Promise.resolve(syncUserUI(context));
    emit(AppCore, EVENT_NAMES.appEventsUiSynced, { reason, route, publicPath, injected: true, ok: true });
    return true;
  }

  emit(AppCore, EVENT_NAMES.appEventsUiSynced, { reason, route, publicPath, injected: false, ok: false });
  return false;
}

function shouldSkipRouterSync(route = DEFAULT_ROUTE, publicPath = DEFAULT_ROUTE) {
  const key = `${redact(route)}|${redact(publicPath)}`;
  const stamp = now();

  if (key === lastRouterKey && stamp - lastRouterAt < ROUTER_DEDUPE_MS) return true;

  lastRouterKey = key;
  lastRouterAt = stamp;

  return false;
}

function applyLoaderPolicy({ AppCore, Router, applyPostRenderLoaderPolicy, payload = {} } = {}) {
  const fn = isFn(applyPostRenderLoaderPolicy) ? applyPostRenderLoaderPolicy : applyPostRenderLoaderPolicyBase;

  try {
    if (isFn(fn)) {
      fn({ AppCore, Router, ...object(payload) });
      return true;
    }
  } catch (error) {
    warn(AppCore, "applyPostRenderLoaderPolicy() falló.", error);
  }

  return false;
}

function requestUiRepair(AppCore, reason = "event", payload = {}) {
  const detail = { source: SOURCE, reason: text(reason, "event"), payload: object(payload), hardRepair: false, rebind: false, at: iso() };
  emit(AppCore, EVENT_NAMES.appUiRepairRequest, detail, { force: true });
  return detail;
}

/* =========================================================
   LANGUAGE / THEME
========================================================= */

function normalizeLang(value = "", fallback = "es") {
  const raw = text(value, fallback).toLowerCase().replace(/_/g, "-");
  const first = raw.split("-")[0] || raw;

  if (["spa", "spanish", "castellano"].includes(first)) return "es";
  if (["eng", "english"].includes(first)) return "en";
  if (["cat", "catalan", "català", "catalán"].includes(first)) return "ca";

  return first || fallback;
}

function setDocumentLang(lang = "es") {
  if (!isBrowser()) return false;

  try {
    const clean = normalizeLang(lang, "es");
    document.documentElement.setAttribute("lang", clean);
    document.documentElement.lang = clean;
    return true;
  } catch {
    return false;
  }
}

function setI18nLang(I18n, lang = "es") {
  const clean = normalizeLang(lang, "es");

  for (const method of ["setLang", "setLanguage", "changeLang", "changeLanguage", "use"]) {
    try {
      if (!isFn(I18n?.[method])) continue;
      const result = I18n[method](clean, { silent: true, source: SOURCE });
      if (result && isFn(result.catch)) result.catch(() => {});
      return true;
    } catch {}
  }

  try {
    if (I18n && typeof I18n === "object") {
      I18n.lang = clean;
      I18n.language = clean;
      return true;
    }
  } catch {}

  return false;
}

function resolveLang(AppCore, I18n, payload = {}) {
  return normalizeLang(payload.lang || payload.language || payload.locale || I18n?.getLang?.() || I18n?.getLanguage?.() || I18n?.lang || AppCore?.state?.lang || "es", "es");
}

function shouldRerenderOnLang(payload = {}) {
  return Boolean(payload.rerenderByEvents === true || payload.appEventsRerender === true || payload.forceEventsRerender === true);
}

/* =========================================================
   BIND HELPERS
========================================================= */

function normalizeDisposer(candidate) {
  if (isFn(candidate)) return candidate;
  if (isFn(candidate?.dispose)) return () => candidate.dispose();
  if (isFn(candidate?.off)) return () => candidate.off();
  if (isFn(candidate?.remove)) return () => candidate.remove();
  return null;
}

function rememberDisposer(disposer) {
  if (isFn(disposer)) disposers.push(disposer);
}

function rememberEvent(eventName = "") {
  const clean = text(eventName, "");
  if (clean && !eventState.boundEvents.includes(clean)) eventState.boundEvents.push(clean);
}

function bindViaBus(AppCore, eventName, handler) {
  if (!isFn(AppCore?.events?.on)) return false;

  try {
    const off = AppCore.events.on(eventName, handler);
    const disposer = normalizeDisposer(off);

    if (disposer) rememberDisposer(disposer);
    else if (isFn(AppCore.events.off)) rememberDisposer(() => AppCore.events.off(eventName, handler));

    rememberEvent(eventName);
    return true;
  } catch {
    return false;
  }
}

function bindViaWindow(eventName, handler) {
  if (!isBrowser()) return false;

  try {
    window.addEventListener(eventName, handler);
    rememberDisposer(() => window.removeEventListener(eventName, handler));
    rememberEvent(eventName);
    return true;
  } catch {
    return false;
  }
}

function bindEvent({ AppCore, eventName, label = "", handler, windowFallback = true }) {
  const cleanName = text(eventName, "");
  const cleanLabel = text(label, cleanName || "event");
  if (!cleanName || !isFn(handler)) return false;

  const key = `${cleanName}::${cleanLabel}`;
  if (boundKeys.has(key)) return false;

  const wrapped = (eventOrPayload = {}) => {
    const payload = payloadFrom(eventOrPayload);
    recordHandled(cleanName, payload);

    Promise.resolve(handler(payload, { eventName: cleanName, label: cleanLabel, raw: eventOrPayload })).catch((error) => recordError(AppCore, cleanName, error));
  };

  const ok = bindViaBus(AppCore, cleanName, wrapped) || (windowFallback && bindViaWindow(cleanName, wrapped));
  if (ok) boundKeys.add(key);
  return ok;
}

function bindMany({ AppCore, eventNames = [], label = "", handler, windowFallback = true }) {
  let count = 0;

  for (const eventName of unique(eventNames)) {
    if (bindEvent({ AppCore, eventName, label: `${label}:${eventName}`, handler, windowFallback })) count += 1;
  }

  return count;
}

/* =========================================================
   HANDLERS
========================================================= */

function bindUserEvents(context) {
  bindMany({
    AppCore: context.AppCore,
    label: "user-sync",
    eventNames: USER_SYNC_EVENTS,
    handler: (payload, meta) => syncUi({ ...context, reason: meta.eventName || payload.reason || "user-sync", payload, force: true }),
  });
}

function bindRouteChangeEvents(context) {
  bindEvent({
    AppCore: context.AppCore,
    eventName: EVENT_NAMES.appRouteChange,
    label: "app-route-change-sync",
    handler: (payload) => syncUi({ ...context, reason: "app:route:change", payload }),
  });
}

function bindRouterEvents(context) {
  const { AppCore, Router, applyPostRenderLoaderPolicy } = context;

  bindEvent({
    AppCore,
    eventName: EVENT_NAMES.routerRendered,
    label: "router-rendered-state-loader-sync",
    handler: (payload) => {
      const publicPath = resolvePublicPath(AppCore, Router, payload);
      const canonicalPath = resolveCanonicalPath(AppCore, Router, payload);

      if (shouldSkipRouterSync(canonicalPath, publicPath)) return;

      const routePatch = patchRouteState(AppCore, { route: canonicalPath, publicPath });
      const loaderPolicyApplied = applyLoaderPolicy({ AppCore, Router, applyPostRenderLoaderPolicy, payload });

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
    label: "router-async-complete-state-only",
    handler: (payload) => {
      const publicPath = resolvePublicPath(AppCore, Router, payload);
      const canonicalPath = resolveCanonicalPath(AppCore, Router, payload);
      patchRouteState(AppCore, { route: canonicalPath, publicPath });
      emit(AppCore, EVENT_NAMES.appRouteSynced, { reason: "router:render:async-complete", route: canonicalPath, publicPath, silent: true });
    },
  });
}

function bindLanguageEvents(context) {
  const { AppCore, I18n } = context;

  bindEvent({
    AppCore,
    eventName: EVENT_NAMES.appLangChange,
    label: "lang-change-state-only",
    handler: async (payload) => {
      const lang = resolveLang(AppCore, I18n, payload);

      setDocumentLang(lang);
      setI18nLang(I18n, lang);
      setStateSilent(AppCore, { lang, language: lang, locale: payload.locale || lang });

      if (shouldRerenderOnLang(payload)) {
        emit(AppCore, "app:i18n:rerender:skipped", { reason: "app-events-no-render", lang, handledBy: SOURCE, routerRender: false });
      }

      await syncUi({ ...context, reason: "app:lang:change", payload, force: true });
    },
  });
}

function bindThemeEvents(context) {
  const { AppCore } = context;

  bindMany({
    AppCore,
    label: "theme-sync",
    eventNames: THEME_EVENTS,
    handler: (payload) => {
      const theme = text(payload.theme || payload.mode || payload.appearance || payload.value || "", "");
      if (theme) setStateSilent(AppCore, { theme, mode: payload.mode || theme, appearance: payload.appearance || payload.mode || theme });
      return syncUi({ ...context, reason: "theme-change", payload, force: true });
    },
  });
}

/* =========================================================
   DEBUG API
========================================================= */

function exposeDebugApi(AppCore = null) {
  if (debugApiInstalled) {
    try {
      if (isBrowser() && window.__ONION_APP_EVENTS__) return window.__ONION_APP_EVENTS__;
    } catch {}
  }

  const api = {
    version: APP_EVENTS_VERSION,
    getSnapshot: getAppEventsSnapshot,
    reset: resetAppEventsState,
    unbind: () => unbindAppEvents(AppCore),
    requestUiRepair: (reason = "debug", payload = {}) => requestUiRepair(AppCore, reason, payload),
  };

  try {
    if (isBrowser()) window.__ONION_APP_EVENTS__ = api;
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

export function bindAppEvents({ AppCore, Auth, Router, Store, SidebarUI, TopbarUI, Toast, I18n, scope = DEFAULT_SCOPE, syncUserUI, repairUISystems, rerenderCurrentRoute, applyPostRenderLoaderPolicy } = {}) {
  if (bound) return true;

  if (binding) {
    warn(AppCore, "bindAppEvents omitido: binding ya en curso.", { scope: text(scope, DEFAULT_SCOPE) });
    return true;
  }

  binding = true;

  const finalScope = text(scope, DEFAULT_SCOPE);
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
    repairUISystems,
    rerenderCurrentRoute,
    applyPostRenderLoaderPolicy: isFn(applyPostRenderLoaderPolicy) ? applyPostRenderLoaderPolicy : applyPostRenderLoaderPolicyBase,
  };

  try {
    bindUserEvents(context);
    bindRouteChangeEvents(context);
    bindRouterEvents(context);
    bindLanguageEvents(context);
    bindThemeEvents(context);

    bound = true;
    boundScope = finalScope;

    exposeDebugApi(AppCore);

    emit(AppCore, EVENT_NAMES.appEventsBound, { scope: boundScope, boundEvents: [...eventState.boundEvents] }, { force: true });
    emit(AppCore, EVENT_NAMES.appEventsReady, getAppEventsSnapshot(), { force: true });

    return true;
  } catch (error) {
    unbindAppEvents(AppCore);
    recordError(AppCore, EVENT_NAMES.appEventsError, error);
    return false;
  } finally {
    binding = false;
  }
}

export function unbindAppEvents(AppCore = null) {
  while (disposers.length) {
    try {
      disposers.pop()?.();
    } catch {}
  }

  boundKeys.clear();
  bound = false;
  binding = false;
  boundScope = "";
  eventState.boundEvents = [];

  emit(AppCore, EVENT_NAMES.appEventsUnbound, { at: iso() }, { force: true });
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
    lastRouterKey: redact(lastRouterKey),
    lastRouterAt,
    lastRouterAtIso: lastRouterAt ? iso(lastRouterAt) : "",
    lastUiKey: redact(lastUiKey),
    lastUiAt,
    lastUiAtIso: lastUiAt ? iso(lastUiAt) : "",
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
    debugApiInstalled,
    policy: {
      wiringOnly: true,
      ownAuth: false,
      ownRouter: false,
      ownRender: false,
      ownRestore: false,
      ownRefresh: false,
      ownFetch: false,
      ownStorage: false,
      ownToast: false,
      aggressiveRepair: false,
    },
  });
}

export function resetAppEventsState() {
  lastRouterKey = "";
  lastRouterAt = 0;
  lastUiKey = "";
  lastUiAt = 0;
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
