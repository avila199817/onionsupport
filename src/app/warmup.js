/* =========================================================
   Onion SPA - App Warmup
   Archivo: src/app/warmup.js

   APP WARMUP · SIMPLE
   - post-boot best-effort
   - snapshot ligero de App/Core/Auth/Router/UI/DOM
   - health/warnings simples
   - eventos opcionales y debug opcional
   - nunca bloquea ni rompe el arranque
   - sin Auth paralelo, restore, refresh, navegación, render, fetch ni storage pesado
========================================================= */

export const WARMUP_VERSION = "21.0.0-simple";

const SOURCE = "app.warmup";
const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const DEFAULT_THEME = "dark";
const DEBUG_KEY = "__ONION_WARMUP__";
const MAX_RECENT = 8;
const MAX_SANITIZE_DEPTH = 4;
const EVENT_DEDUPE_MS = 250;

const EVENTS = Object.freeze({
  warmup: "app:warmup",
  ready: "app:warmup:ready",
  summary: "app:warmup:summary",
  warning: "app:warmup:warning",
  debugReady: "app:warmup:debug-ready",
});

const DOM_SELECTORS = Object.freeze({
  shell: ["#app-shell", "[data-app-shell]", ".app-shell"],
  main: ["#main-content", "[data-main-content]", "main"],
  appContent: ["#app-content", "[data-app-content]"],
  viewContainer: ["#view-container", "[data-view-root]", "[data-router-view]", "[data-view-container='true']", ".view-container"],
  loader: ["#app-loader", "[data-app-loader]", ".app-loader"],
  sidebarMount: ["#sidebar-mount", "[data-sidebar-mount]"],
  topbarMount: ["#topbar-mount", "[data-topbar-mount]"],
  sidebar: ["#sidebar", "#app-sidebar", "[data-sidebar-root]", ".sidebar"],
  topbar: ["#topbar", "#app-topbar", "[data-topbar='root']", "[data-topbar-root]", ".topbar"],
});

const AUTH_PATHS = Object.freeze([
  "/login",
  "/signin",
  "/sign-in",
  "/activate-account",
  "/activate",
  "/activation",
  "/reset-password",
  "/reset-password/confirm",
  "/password-reset",
  "/password-reset/confirm",
  "/forgot-password",
  "/recover-password",
  "/2fa",
  "/otp",
  "/mfa",
]);

const TOKEN_RE = /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|temporaryToken|temporary_token|twoFactorToken|two_factor_token|mfaToken|mfa_token|authorization|jwt|session|sid)=)([^&#\s]+)/gi;
const SENSITIVE_KEY_RE = /token|secret|password|authorization|credential|cookie|jwt|bearer|session|refresh|otp|mfa|2fa|code/i;

let lastSnapshot = null;
let lastSummary = null;
let lastEventKey = "";
let lastEventAt = 0;
let warmupCount = 0;
let lastWarmupAt = 0;
let lastWarmupDurationMs = 0;

const recentSnapshots = [];

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isObjectLike = (value) => Boolean(value && (typeof value === "object" || typeof value === "function"));

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

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function now() {
  try { return Date.now(); } catch { return 0; }
}

function perfNow() {
  try {
    return typeof performance !== "undefined" && isFn(performance.now) ? performance.now() : now();
  } catch {
    return now();
  }
}

function iso(ms = now()) {
  try { return new Date(ms).toISOString(); } catch { return ""; }
}

function canExtend(value) {
  try { return isObjectLike(value) && Object.isExtensible(value); } catch { return false; }
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

function normalizeDeps(first = {}, second = {}) {
  if (isObject(first) && ("AppCore" in first || "Auth" in first || "Router" in first || "Store" in first || "SidebarUI" in first || "TopbarUI" in first || "Toast" in first || "I18n" in first)) {
    return { ...first };
  }

  return { ...object(second), AppCore: first || null };
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function redact(value = "") {
  return text(value, "")
    .replace(TOKEN_RE, "$1***")
    .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/activate\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function isDomNode(value) {
  if (!value || typeof value !== "object") return false;

  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {}

  return Boolean(value.nodeType && value.nodeName);
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > MAX_SANITIZE_DEPTH) return "[depth-limit]";
  if (SENSITIVE_KEY_RE.test(text(keyHint, ""))) return value ? "***" : value;
  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (isDomNode(value)) {
    return {
      node: text(value.nodeName, "Node"),
      id: text(value.id, ""),
      className: text(value.className?.baseVal || value.className, "").slice(0, 240),
    };
  }

  if (value instanceof Error) {
    return {
      name: text(value.name, "Error"),
      message: redact(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || null,
    };
  }

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

function eventKey(eventName = "", payload = {}) {
  return [
    eventName,
    payload?.reason || "",
    payload?.health?.status || "",
    payload?.route || payload?.app?.route || "",
    payload?.publicPath || payload?.app?.publicPath || "",
  ].map((item) => text(item, "")).join("|");
}

function emit(AppCore, eventName, payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name || !AppCore || options.emit === false || options.emitEvents === false) return false;

  if (options.dedupe !== false) {
    const key = eventKey(name, payload);
    const stamp = now();

    if (key === lastEventKey && stamp - lastEventAt < EVENT_DEDUPE_MS) return false;

    lastEventKey = key;
    lastEventAt = stamp;
  }

  const detail = sanitize({ source: SOURCE, version: WARMUP_VERSION, at: iso(), ...object(payload) });

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

function log(AppCore, level = "log", ...args) {
  try {
    const logger = AppCore?.utils?.[level] || AppCore?.utils?.log;
    if (isFn(logger)) logger.call(AppCore.utils, "[AppWarmup]", ...args.map((item) => sanitize(item)));
  } catch {}
}

/* =========================================================
   DEPS
========================================================= */

function getModule(AppCore, names = []) {
  if (!AppCore) return null;

  for (const key of names.map((name) => text(name, "")).filter(Boolean)) {
    try {
      const value = AppCore.modules?.get?.(key) || AppCore.registry?.modules?.get?.(key) || AppCore.modules?.[key] || AppCore?.[key] || null;
      if (value) return value;
    } catch {}
  }

  return null;
}

function getHttp(AppCore, deps = {}) {
  try {
    return deps.Http || AppCore?.Http || AppCore?.http || AppCore?.services?.http || AppCore?.getHttpClient?.() || null;
  } catch {
    return deps.Http || null;
  }
}

function resolveDeps(first = {}, second = {}) {
  const deps = normalizeDeps(first, second);
  const AppCore = deps.AppCore || null;

  return {
    ...deps,
    AppCore,
    Auth: deps.Auth || AppCore?.Auth || AppCore?.auth || getModule(AppCore, ["Auth", "auth"]),
    Router: deps.Router || AppCore?.Router || AppCore?.router || getModule(AppCore, ["Router", "router"]),
    Store: deps.Store || AppCore?.Store || AppCore?.store || getModule(AppCore, ["Store", "store"]),
    SidebarUI: deps.SidebarUI || AppCore?.SidebarUI || AppCore?.sidebarUI || AppCore?.sidebar || getModule(AppCore, ["SidebarUI", "sidebarUI", "sidebar"]),
    TopbarUI: deps.TopbarUI || AppCore?.TopbarUI || AppCore?.topbarUI || AppCore?.topbar || getModule(AppCore, ["TopbarUI", "topbarUI", "topbar"]),
    Toast: deps.Toast || AppCore?.Toast || AppCore?.toast || getModule(AppCore, ["Toast", "toast"]),
    I18n: deps.I18n || AppCore?.I18n || AppCore?.i18n || getModule(AppCore, ["I18n", "i18n"]),
    Http: getHttp(AppCore, deps),
  };
}

/* =========================================================
   PATH / DOM SNAPSHOTS
========================================================= */

function normalizePath(path = DEFAULT_ROUTE) {
  let value = text(path, DEFAULT_ROUTE);

  if (value.startsWith("#/") || value.startsWith("#!")) value = value.replace(/^#!?\/?/, "/") || DEFAULT_ROUTE;

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) && isBrowser()) {
    try {
      const url = new URL(value, window.location?.origin || "http://localhost");
      value = `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`;
    } catch {
      value = DEFAULT_ROUTE;
    }
  }

  const hashIndex = value.indexOf("#");
  const searchIndex = value.indexOf("?");
  let cut = value.length;
  if (hashIndex >= 0) cut = Math.min(cut, hashIndex);
  if (searchIndex >= 0) cut = Math.min(cut, searchIndex);

  let pathname = value.slice(0, cut) || DEFAULT_ROUTE;
  const suffix = value.slice(cut);

  pathname = pathname.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/g, "") || DEFAULT_ROUTE;

  const segments = pathname.split("/").filter(Boolean);
  if (/^@[A-Za-z0-9._-]{1,80}$/.test(segments[0] || "")) {
    pathname = segments.length > 1 ? `/${segments.slice(1).join("/")}` : DEFAULT_ROUTE;
  }

  return `${pathname}${suffix}`;
}

function stripSearchHash(path = DEFAULT_ROUTE) {
  return text(path, DEFAULT_ROUTE).split("#")[0].split("?")[0] || DEFAULT_ROUTE;
}

function browserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const { pathname, search, hash } = window.location;
    if (hash?.startsWith?.("#/") || hash?.startsWith?.("#!")) return normalizePath(hash);
    return normalizePath(`${pathname || DEFAULT_ROUTE}${search || ""}${hash || ""}`);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function authLike(path = DEFAULT_ROUTE) {
  const clean = stripSearchHash(normalizePath(path));
  return AUTH_PATHS.some((candidate) => clean === candidate || clean.startsWith(`${candidate}/`));
}

function queryFirst(selectors = []) {
  if (!isBrowser()) return null;

  for (const selector of selectors) {
    const clean = text(selector, "");
    if (!clean) continue;

    try {
      const element = /^#[A-Za-z][A-Za-z0-9_-]*$/.test(clean) ? document.getElementById(clean.slice(1)) : document.querySelector(clean);
      if (element) return element;
    } catch {}
  }

  return null;
}

function classList(element) {
  try { return Array.from(element?.classList || []); } catch { return []; }
}

function elementSnapshot(selectors = []) {
  const element = queryFirst(selectors);

  if (!element) return { exists: false };

  return {
    exists: true,
    id: text(element.id, ""),
    tag: text(element.tagName?.toLowerCase?.(), ""),
    hidden: Boolean(element.hidden),
    ariaHidden: text(element.getAttribute?.("aria-hidden"), ""),
    ariaBusy: text(element.getAttribute?.("aria-busy"), ""),
    classes: classList(element).slice(0, 30),
    childCount: number(element.children?.length, 0),
    hasContent: Boolean(text(element.textContent, "")),
    dataset: sanitize({
      shell: element.dataset?.shell || null,
      chrome: element.dataset?.chrome || null,
      routeMode: element.dataset?.routeMode || null,
      loaderVisible: element.dataset?.loaderVisible || null,
      loaderState: element.dataset?.loaderState || null,
      routerStatus: element.dataset?.routerStatus || null,
      routerCanonicalPath: element.dataset?.routerCanonicalPath || null,
      routerPublicPath: element.dataset?.routerPublicPath || null,
    }),
  };
}

/* =========================================================
   MODULE SNAPSHOTS
========================================================= */

function safeGetter(target, method = "") {
  try {
    if (isFn(target?.[method])) return target[method]();
  } catch {}

  return null;
}

function appSnapshot(AppCore) {
  const state = object(AppCore?.state);
  const config = object(AppCore?.config);

  return {
    present: Boolean(AppCore),
    apiBase: config.apiBase || config.API_BASE || null,
    appName: config.appName || config.name || null,
    route: redact(state.route || DEFAULT_ROUTE),
    publicPath: redact(state.publicPath || DEFAULT_ROUTE),
    authenticated: Boolean(state.authenticated),
    role: state.role || state.rol || state.userRole || null,
    lang: state.lang || DEFAULT_LANG,
    theme: state.theme || DEFAULT_THEME,
    booting: Boolean(state.booting || state.appBooting),
    booted: Boolean(state.booted || state.appBooted),
    ready: Boolean(state.ready || state.appReady),
    loading: Boolean(state.loading),
    restoring: Boolean(state.restoring || state.authRestoring || state.sessionRestoring),
    uiInitialized: Boolean(state.uiInitialized),
    i18nInitialized: Boolean(state.i18nInitialized),
    initialRouteRendered: Boolean(state.initialRouteRendered),
    bootNavigationHandled: Boolean(state.bootNavigationHandled),
  };
}

function authSnapshot(AppCore, Auth) {
  const state = object(AppCore?.state);
  const user = state.user || state.currentUser || state.sessionUser || state.authUser || safeGetter(Auth, "getUser") || safeGetter(Auth, "getCurrentUser") || Auth?.user || null;

  let authenticated = Boolean(state.authenticated || Auth?.authenticated);
  try {
    if (isFn(Auth?.isAuthenticated)) authenticated = Boolean(Auth.isAuthenticated());
  } catch {}

  return {
    present: Boolean(Auth),
    authenticated,
    restoring: Boolean(state.restoring || state.authRestoring || state.sessionRestoring || Auth?.restoring),
    hasRestore: Boolean(isFn(Auth?.restoreSession) || isFn(Auth?.restore) || isFn(Auth?.session?.restore)),
    hasLogin: isFn(Auth?.login),
    hasLogout: isFn(Auth?.logout),
    hasRefresh: Boolean(isFn(Auth?.refresh) || isFn(Auth?.refreshToken) || isFn(Auth?.refreshSession)),
    role: state.role || state.rol || Auth?.role || user?.role || user?.rol || null,
    user: user
      ? {
          present: true,
          id: user.id || user.userId || user.uid || user.sub || null,
          username: user.username || user.userName || user.email || user.name || user.displayName || null,
          displayName: user.displayName || user.name || user.username || user.email || null,
          hasAvatar: Boolean(user.avatarUrl || user.avatar || user.photoURL || user.picture),
        }
      : { present: false },
  };
}

function routerSnapshot(AppCore, Router) {
  const state = object(AppCore?.state);
  let snap = null;

  try { snap = Router?.getSnapshot?.() || Router?.getDebugSnapshot?.() || Router?.getState?.() || null; } catch {}

  return {
    present: Boolean(Router),
    configured: Boolean(Router?.configured || Router?.isConfigured || snap?.configured || Router?.render || Router?.navigate),
    bound: Boolean(Router?.bound || Router?.isBound || snap?.bound),
    hasRender: isFn(Router?.render),
    hasNavigate: isFn(Router?.navigate),
    hasBind: isFn(Router?.bind),
    currentCanonicalPath: redact(safeGetter(Router, "getCurrentCanonicalPath") || state.route || DEFAULT_ROUTE),
    currentPublicPath: redact(safeGetter(Router, "getCurrentPublicPath") || state.publicPath || DEFAULT_ROUTE),
    initialRouteRendered: Boolean(state.initialRouteRendered || snap?.initialRouteRendered),
  };
}

function storeSnapshot(Store) {
  let state = {};

  try { state = object(Store?.getState?.()); } catch {}

  return {
    present: Boolean(Store),
    hasInit: isFn(Store?.init),
    hasGetState: isFn(Store?.getState),
    ready: Boolean(state.ready || Store?.state?.ready),
    booted: Boolean(state.booted || Store?.state?.booted),
  };
}

function moduleSnapshot(moduleRef) {
  let snap = null;

  try { snap = moduleRef?.getSnapshot?.() || moduleRef?.getState?.() || null; } catch {}

  return {
    present: Boolean(moduleRef),
    initialized: Boolean(moduleRef?.initialized || moduleRef?.ready || moduleRef?.mounted || snap?.initialized || snap?.ready || snap?.mounted),
    hasInit: isFn(moduleRef?.init),
    hasRepair: isFn(moduleRef?.repair),
    hasRefresh: isFn(moduleRef?.refresh),
    hasSync: isFn(moduleRef?.sync),
  };
}

function i18nSnapshot(AppCore, I18n) {
  const state = object(AppCore?.state);
  const documentLang = isBrowser() ? text(document.documentElement?.lang || document.documentElement?.getAttribute?.("lang"), "") : "";

  return {
    present: Boolean(I18n || state.i18nInitialized || state.lang || documentLang),
    modulePresent: Boolean(I18n),
    initialized: Boolean(state.i18nInitialized || I18n || state.lang || documentLang),
    lang: safeGetter(I18n, "getLang") || safeGetter(I18n, "getLanguage") || I18n?.lang || I18n?.language || state.lang || documentLang || DEFAULT_LANG,
    documentLang: documentLang || null,
    hasTranslate: isFn(I18n?.t) || isFn(I18n?.translate),
    hasSetLang: Boolean(isFn(I18n?.setLang) || isFn(I18n?.changeLanguage) || isFn(I18n?.use)),
  };
}

function shellSnapshot(AppCore) {
  const dom = object(AppCore?.dom);
  const elements = Object.fromEntries(Object.entries(DOM_SELECTORS).map(([key, selectors]) => [key, elementSnapshot(selectors)]));
  const body = isBrowser() ? document.body : null;
  const html = isBrowser() ? document.documentElement : null;
  const loader = elements.loader;
  const hiddenLoaderClasses = ["is-hidden", "has-hidden", "loader-hidden"];

  const loaderVisible = Boolean(
    loader.exists &&
      !loader.hidden &&
      loader.ariaHidden !== "true" &&
      loader.dataset.loaderVisible !== "false" &&
      loader.dataset.loaderState !== "hidden" &&
      !loader.classes?.some?.((name) => hiddenLoaderClasses.includes(name))
  );

  return {
    domCache: {
      hasShell: Boolean(dom.shell || dom.appShell),
      hasMain: Boolean(dom.main || dom.mainContent),
      hasAppContent: Boolean(dom.appContent),
      hasLoader: Boolean(dom.loader),
      hasViewContainer: Boolean(dom.viewContainer),
      hasSidebarMount: Boolean(dom.sidebarMount),
      hasTopbarMount: Boolean(dom.topbarMount),
    },
    body: {
      exists: Boolean(body),
      classes: classList(body).slice(0, 40),
      routeMode: body?.dataset?.routeMode || null,
      chrome: body?.dataset?.chrome || null,
      appLoading: body?.dataset?.appLoading || null,
    },
    html: {
      exists: Boolean(html),
      classes: classList(html).slice(0, 40),
      routeMode: html?.dataset?.routeMode || null,
      chrome: html?.dataset?.chrome || null,
      appState: html?.dataset?.appState || null,
      theme: html?.dataset?.theme || null,
    },
    elements,
    loaderVisible,
    authScreen: Boolean(body?.classList?.contains?.("auth-screen") || body?.classList?.contains?.("route-auth") || html?.classList?.contains?.("route-auth")),
    chromeVisible: !Boolean(body?.classList?.contains?.("route-chrome-hidden") || html?.classList?.contains?.("route-chrome-hidden")),
    hasViewContent: Boolean(elements.viewContainer.exists && elements.viewContainer.hasContent),
  };
}

function locationSnapshot() {
  const publicPath = browserPath();

  if (!isBrowser()) {
    return { href: "", publicPath: DEFAULT_ROUTE, canonicalPath: DEFAULT_ROUTE, authLike: false };
  }

  return {
    href: redact(window.location.href || ""),
    origin: window.location.origin || "",
    pathname: redact(window.location.pathname || ""),
    search: redact(window.location.search || ""),
    hash: redact(window.location.hash || ""),
    publicPath: redact(publicPath),
    canonicalPath: redact(stripSearchHash(normalizePath(publicPath))),
    authLike: authLike(publicPath),
  };
}

function documentSnapshot() {
  if (!isBrowser()) return { readyState: "server", title: "", lang: null };

  const html = document.documentElement;

  return {
    readyState: document.readyState || "",
    title: document.title || "",
    lang: html?.getAttribute?.("lang") || html?.lang || null,
    visibilityState: document.visibilityState || null,
    hidden: typeof document.hidden === "boolean" ? document.hidden : null,
    theme: html?.dataset?.theme || null,
    routeMode: html?.dataset?.routeMode || null,
    chrome: html?.dataset?.chrome || null,
    appState: html?.dataset?.appState || null,
    appLoading: html?.dataset?.appLoading || null,
  };
}

function performanceSnapshot() {
  const output = { supported: false, now: 0, navigationType: "", domContentLoadedMs: 0, loadEventMs: 0 };

  try {
    if (typeof performance === "undefined") return output;

    output.supported = true;
    output.now = Math.round(perfNow());

    const nav = performance.getEntriesByType?.("navigation")?.[0];
    if (nav) {
      output.navigationType = nav.type || "";
      output.domContentLoadedMs = Math.round(nav.domContentLoadedEventEnd || 0);
      output.loadEventMs = Math.round(nav.loadEventEnd || 0);
    }
  } catch {}

  return output;
}

function historySnapshot() {
  if (!isBrowser()) return { length: 0, state: null };

  let state = null;
  try { state = window.history?.state || null; } catch {}

  return { length: number(window.history?.length, 0), state: sanitize(state) };
}

function httpSnapshot(Http) {
  let snap = null;

  try { snap = Http?.getSnapshot?.() || Http?.getState?.() || null; } catch {}

  return {
    present: Boolean(Http),
    hasRequest: isFn(Http?.request),
    hasGet: isFn(Http?.get),
    hasPost: isFn(Http?.post),
    snapshot: sanitize(snap),
  };
}

/* =========================================================
   HEALTH
========================================================= */

function buildWarnings(snapshot = {}) {
  const warnings = [];

  if (!snapshot.ok) warnings.push({ code: "APPCORE_MISSING", severity: "critical", message: "AppCore no está disponible." });
  if (!snapshot.app?.apiBase) warnings.push({ code: "API_BASE_MISSING", severity: "low", message: "apiBase no configurada." });
  if (!snapshot.router?.present) warnings.push({ code: "ROUTER_UNAVAILABLE", severity: "medium", message: "Router no detectable." });
  if (snapshot.router?.present && !snapshot.router?.hasRender && !snapshot.router?.hasNavigate) warnings.push({ code: "ROUTER_NOT_READY", severity: "medium", message: "Router sin render/navigate detectable." });
  if (isBrowser() && !snapshot.shell?.elements?.viewContainer?.exists) warnings.push({ code: "VIEW_CONTAINER_MISSING", severity: "high", message: "No existe #view-container." });
  if (isBrowser() && !snapshot.shell?.elements?.shell?.exists) warnings.push({ code: "APP_SHELL_MISSING", severity: "medium", message: "No existe #app-shell." });
  if (snapshot.app?.ready && !snapshot.app?.loading && snapshot.shell?.loaderVisible) warnings.push({ code: "LOADER_VISIBLE_AFTER_READY", severity: "low", message: "Loader visible tras ready." });
  if (snapshot.auth?.authenticated && !snapshot.location?.authLike && snapshot.shell?.authScreen) warnings.push({ code: "AUTH_SCREEN_STALE", severity: "low", message: "Clases de auth-screen en ruta app." });

  return warnings;
}

function health(snapshot = {}) {
  const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];
  let score = 100;

  for (const warning of warnings) {
    if (warning.severity === "critical") score -= 35;
    else if (warning.severity === "high") score -= 20;
    else if (warning.severity === "medium") score -= 10;
    else score -= 4;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    status: score >= 95 ? "excellent" : score >= 85 ? "good" : score >= 65 ? "degraded" : "critical",
    criticalCount: warnings.filter((item) => item.severity === "critical").length,
    highCount: warnings.filter((item) => item.severity === "high").length,
    mediumCount: warnings.filter((item) => item.severity === "medium").length,
    lowCount: warnings.filter((item) => item.severity === "low").length,
  };
}

/* =========================================================
   SNAPSHOT / SUMMARY
========================================================= */

export function createWarmupSnapshot(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, Auth, Router, Store, SidebarUI, TopbarUI, Toast, I18n, Http, reason = "warmup" } = deps;
  const stamp = now();

  const raw = {
    version: WARMUP_VERSION,
    ok: Boolean(AppCore),
    reason: text(reason, "warmup"),
    at: iso(stamp),
    atMs: stamp,
    browser: isBrowser(),
    location: locationSnapshot(),
    document: documentSnapshot(),
    history: historySnapshot(),
    performance: performanceSnapshot(),
    app: appSnapshot(AppCore),
    auth: authSnapshot(AppCore, Auth),
    router: routerSnapshot(AppCore, Router),
    store: storeSnapshot(Store),
    i18n: i18nSnapshot(AppCore, I18n),
    http: httpSnapshot(Http),
    ui: {
      toast: moduleSnapshot(Toast),
      sidebar: moduleSnapshot(SidebarUI),
      topbar: moduleSnapshot(TopbarUI),
    },
    shell: shellSnapshot(AppCore),
    policy: {
      bestEffort: true,
      blocking: false,
      ownAuth: false,
      ownRestore: false,
      ownRefresh: false,
      ownRouter: false,
      ownNavigation: false,
      ownRender: false,
      ownFetch: false,
      ownStorageMutation: false,
      ownToast: false,
    },
  };

  const snapshot = sanitize(raw);
  snapshot.warnings = buildWarnings(snapshot);
  snapshot.warningCount = snapshot.warnings.length;
  snapshot.health = health(snapshot);

  return snapshot;
}

export function getWarmupSummary(snapshot = {}) {
  const data = object(snapshot);

  return {
    ok: Boolean(data.ok),
    version: data.version || WARMUP_VERSION,
    at: data.at || "",
    durationMs: number(data.durationMs, 0),
    warningCount: number(data.warningCount, 0),
    health: data.health || null,
    authenticated: Boolean(data.auth?.authenticated),
    username: data.auth?.user?.username || null,
    role: data.auth?.role || null,
    route: data.app?.route || DEFAULT_ROUTE,
    publicPath: data.app?.publicPath || DEFAULT_ROUTE,
    apiBase: data.app?.apiBase || null,
    lang: data.app?.lang || DEFAULT_LANG,
    theme: data.app?.theme || DEFAULT_THEME,
    booting: Boolean(data.app?.booting),
    booted: Boolean(data.app?.booted),
    ready: Boolean(data.app?.ready),
    loading: Boolean(data.app?.loading),
    restoring: Boolean(data.app?.restoring),
    initialRouteRendered: Boolean(data.app?.initialRouteRendered),
    bootNavigationHandled: Boolean(data.app?.bootNavigationHandled),
    routerPresent: Boolean(data.router?.present),
    routerConfigured: Boolean(data.router?.configured),
    routerBound: Boolean(data.router?.bound),
    hasAppShell: Boolean(data.shell?.elements?.shell?.exists),
    hasViewContainer: Boolean(data.shell?.elements?.viewContainer?.exists),
    hasLoader: Boolean(data.shell?.elements?.loader?.exists),
    loaderVisible: Boolean(data.shell?.loaderVisible),
    authScreen: Boolean(data.shell?.authScreen),
    chromeVisible: Boolean(data.shell?.chromeVisible),
  };
}

function remember(snapshot = {}) {
  lastSnapshot = snapshot;
  lastSummary = getWarmupSummary(snapshot);

  recentSnapshots.unshift({ at: snapshot.at, reason: snapshot.reason, summary: lastSummary });
  if (recentSnapshots.length > MAX_RECENT) recentSnapshots.length = MAX_RECENT;

  return snapshot;
}

export function getWarmupRuntimeSnapshot() {
  return sanitize({
    version: WARMUP_VERSION,
    warmupCount,
    lastWarmupAt,
    lastWarmupAtIso: lastWarmupAt ? iso(lastWarmupAt) : "",
    lastWarmupDurationMs,
    lastSummary,
    lastEventKey: redact(lastEventKey),
    lastEventAt,
    lastEventAtIso: lastEventAt ? iso(lastEventAt) : "",
    recentSnapshots: recentSnapshots.slice(),
  });
}

export function resetWarmupRuntimeState() {
  lastSnapshot = null;
  lastSummary = null;
  lastEventKey = "";
  lastEventAt = 0;
  warmupCount = 0;
  lastWarmupAt = 0;
  lastWarmupDurationMs = 0;
  recentSnapshots.splice(0);
  return getWarmupRuntimeSnapshot();
}

/* =========================================================
   DEBUG / LOGGING
========================================================= */

export function exposeWarmupDebugApi(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore } = deps;

  const api = {
    version: WARMUP_VERSION,
    createSnapshot: (options = {}) => createWarmupSnapshot({ ...deps, ...object(options) }),
    run: (options = {}) => warmup({ ...deps, ...object(options) }),
    getLastSnapshot: () => lastSnapshot,
    getLastSummary: () => lastSummary,
    getRuntimeSnapshot: getWarmupRuntimeSnapshot,
    reset: resetWarmupRuntimeState,
  };

  try {
    if (isBrowser()) window[DEBUG_KEY] = api;
  } catch {}

  try {
    defineValue(AppCore, "Warmup", api);
  } catch {}

  emit(AppCore, EVENTS.debugReady, { at: iso() });
  return api;
}

export function printWarmupSummary(snapshot = {}, AppCore = null) {
  const summary = getWarmupSummary(snapshot);
  log(AppCore, "log", "Warmup summary", summary);
  return summary;
}

/* =========================================================
   WARMUP
========================================================= */

export async function warmup(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore, emit: shouldEmit = true, log: shouldLogOutput = false, exposeDebug = true, reason = "warmup" } = deps;
  const started = perfNow();

  try {
    const snapshot = createWarmupSnapshot({ ...deps, reason });
    snapshot.durationMs = Math.max(0, Math.round(perfNow() - started));

    warmupCount += 1;
    lastWarmupAt = now();
    lastWarmupDurationMs = snapshot.durationMs;

    remember(snapshot);

    if (AppCore && exposeDebug !== false) exposeWarmupDebugApi({ ...deps, AppCore });
    if (AppCore && shouldLogOutput === true) log(AppCore, "log", "Warmup ejecutado", getWarmupSummary(snapshot));

    if (AppCore && shouldEmit !== false) {
      emit(AppCore, EVENTS.warmup, snapshot);
      emit(AppCore, EVENTS.summary, getWarmupSummary(snapshot));
      emit(AppCore, EVENTS.ready, {
        ok: snapshot.ok,
        reason: snapshot.reason,
        health: snapshot.health,
        warningCount: snapshot.warningCount,
        durationMs: snapshot.durationMs,
      });

      for (const warning of snapshot.warnings || []) {
        if (warning.severity === "critical" || warning.severity === "high") {
          emit(AppCore, EVENTS.warning, { warning, reason: snapshot.reason }, { dedupe: true });
        }
      }
    }

    return snapshot;
  } catch (error) {
    const fallback = sanitize({
      version: WARMUP_VERSION,
      ok: false,
      reason,
      error,
      durationMs: Math.max(0, Math.round(perfNow() - started)),
      policy: { bestEffort: true, failedSoftly: true },
    });

    remember(fallback);
    return fallback;
  }
}

export default warmup;
