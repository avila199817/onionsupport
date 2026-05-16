/* =========================================================
   Onion SPA - App Warmup
   Archivo: src/app/warmup.js

   Diagnóstico inicial seguro:
   - No muta sesión/token/storage.
   - No renderiza ni navega.
   - No expone tokens.
   - Resume AppCore/Auth/Router/UI/DOM/loader.
   - Detecta rutas públicas técnicas con token.
   - Expone debug API opcional.
========================================================= */

export const WARMUP_VERSION = "17.0.0-clean";

const SOURCE = "app:warmup";
const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const DEFAULT_THEME = "dark";

const EVENTS = Object.freeze({
  warmup: "app:warmup",
  warning: "app:warmup:warning",
  ready: "app:warmup:ready",
  summary: "app:warmup:summary",
  debugReady: "app:warmup:debug-ready",
});

const TOKEN_PARAMS = Object.freeze([
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
  "auth",
  "jwt",
  "session",
  "sid",
]);

const TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    canonicalPath: "/activate-account",
    paths: [
      "/activate-account",
      "/activate",
      "/activation",
      "/account/activate",
      "/activate/first-user",
    ],
    windowKeys: [
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ],
    scrubFlags: [
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ],
    tokenParams: [
      "token",
      "activationToken",
      "activateToken",
      "code",
      "t",
    ],
  }),

  Object.freeze({
    key: "resetConfirm",
    canonicalPath: "/reset-password/confirm",
    paths: [
      "/reset-password/confirm",
      "/reset-password-confirm",
      "/password-reset/confirm",
      "/password-reset-confirm",
      "/confirm-reset-password",
    ],
    windowKeys: [
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ],
    scrubFlags: [
      "scrubbedResetToken",
      "scrubbedResetPasswordToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ],
    tokenParams: [
      "token",
      "resetToken",
      "passwordResetToken",
      "confirmToken",
      "code",
      "t",
    ],
  }),
]);

const AUTH_LIKE_PATHS = Object.freeze([
  "/login",
  "/signin",
  "/sign-in",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/reset-password",
  "/reset-password/confirm",
  "/activate-account",
  "/activate",
  "/activation",
  "/2fa",
  "/otp",
  "/mfa",
]);

const DOM = Object.freeze({
  shell: ["#app-shell", "[data-app-shell]", ".app-shell", ".layout"],
  main: ["#main-content", "main.main-content", ".main-content", "[data-main-content]", "main"],
  appContent: ["#app-content", "[data-app-content]", ".app-content"],
  loader: ["#app-loader", "[data-app-loader]", ".app-loader", "#loader"],
  viewContainer: ["#view-container", "[data-view-root]", "[data-view-container]", "[data-router-view]", "#router-view"],
  sidebarMount: ["#sidebar-mount", "[data-sidebar-mount]"],
  topbarMount: ["#topbar-mount", "[data-topbar-mount]"],
  sidebar: ["#app-sidebar", "#sidebar", "[data-sidebar-root]", ".sidebar"],
  topbar: ["#app-topbar", "#topbar", "[data-topbar-root]", ".topbar"],
  tablehead: ["#table-head", "[data-tablehead]", ".table-head"],
  tableheadContainer: ["#tablehead-container", "[data-tablehead-container]"],
});

const HIDDEN_LOADER_CLASSES = Object.freeze([
  "is-hidden",
  "has-hidden",
  "loader-hidden",
]);

const MAX_RECENT = 8;
const MAX_DEPTH = 6;

let lastSnapshot = null;
let lastSummary = null;
let lastEventKey = "";
let lastEventAt = 0;
let lastWarningKey = "";
let lastWarningAt = 0;
let lastLogKey = "";
let lastLogAt = 0;
let warmupCount = 0;
let lastWarmupAt = 0;
let lastWarmupDurationMs = 0;

const recentSnapshots = [];

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

  const out = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return out || fallback;
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowPerf() {
  try {
    return typeof performance !== "undefined" && isFn(performance.now)
      ? performance.now()
      : Date.now();
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

function safeCall(fn, fallback = null) {
  try {
    return isFn(fn) ? fn() : fallback;
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
      "SidebarUI" in first ||
      "TopbarUI" in first ||
      "Toast" in first ||
      "I18n" in first
    )
  ) {
    return { ...first };
  }

  return {
    ...object(second),
    AppCore: first,
  };
}

/* =========================================================
   REDACTION
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value = "") {
  let output = text(value, "");

  if (!output) return "";

  for (const param of TOKEN_PARAMS) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(param)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const route of TOKEN_ROUTES) {
    for (const path of route.paths) {
      try {
        output = output.replace(
          new RegExp(`(${escapeRegExp(path)}\\/)([^/?#\\s]+)`, "gi"),
          "$1***"
        );
      } catch {}
    }
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function isDomNode(value) {
  if (!value || typeof value !== "object") return false;

  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {}

  return Boolean(value.nodeType && value.nodeName);
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > MAX_DEPTH) return "[MaxDepth]";

  if (/token|secret|password|authorization|credential|cookie|jwt|bearer|session|refresh|otp|mfa|2fa/i.test(keyHint)) {
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

  if (isDomNode(value)) {
    return {
      node: text(value.nodeName, "Node"),
      id: text(value.id, ""),
      className: text(value.className?.baseVal || value.className, "").slice(0, 500),
    };
  }

  if (value instanceof Error) {
    return {
      name: text(value.name, "Error"),
      message: redact(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || null,
      stack: value.stack ? "[stack]" : "",
    };
  }

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
    const out = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      out[key] = sanitize(item, depth + 1, key);
    }

    return out;
  }

  return String(value);
}

/* =========================================================
   LOG / EMIT
========================================================= */

function logger(AppCore, level = "log") {
  try {
    if (isFn(AppCore?.utils?.[level])) return AppCore.utils[level].bind(AppCore.utils);
    if (isFn(AppCore?.utils?.log)) return AppCore.utils.log.bind(AppCore.utils);
  } catch {}

  try {
    if (isFn(console?.[level])) return console[level].bind(console);
    if (isFn(console?.log)) return console.log.bind(console);
  } catch {}

  return null;
}

function log(AppCore, level, ...args) {
  try {
    const fn = logger(AppCore, level);
    fn?.("[AppWarmup]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function eventKey(eventName = "", payload = {}) {
  return [
    eventName,
    payload?.reason || "",
    payload?.health?.status || payload?.warning?.code || "",
    payload?.route || payload?.app?.route || "",
    payload?.publicPath || payload?.app?.publicPath || "",
  ].join("|");
}

function emit(AppCore, eventName, payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name || !AppCore) return false;

  if (options.dedupe !== false) {
    const key = eventKey(name, payload);
    const stamp = now();

    if (key === lastEventKey && stamp - lastEventAt < 250) {
      return false;
    }

    lastEventKey = key;
    lastEventAt = stamp;
  }

  const clean = sanitize({
    source: SOURCE,
    version: WARMUP_VERSION,
    ...object(payload),
  });

  let bus = false;
  let ok = false;

  try {
    if (isFn(AppCore.events?.emit)) {
      bus = true;
      AppCore.events.emit(name, clean);
      ok = true;
    }
  } catch {}

  if ((options.window === true || !bus) && isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: clean }));
      ok = true;
    } catch {}
  }

  return ok;
}

function shouldLog(snapshot = {}) {
  const key = [
    snapshot.reason,
    snapshot.health?.status,
    snapshot.warningCount,
    snapshot.app?.route,
    snapshot.app?.publicPath,
    snapshot.auth?.authenticated ? "auth" : "anon",
    snapshot.router?.present ? "router" : "no-router",
  ].join("|");

  const stamp = now();

  if (key === lastLogKey && stamp - lastLogAt < 800) {
    return false;
  }

  lastLogKey = key;
  lastLogAt = stamp;

  return true;
}

function shouldWarn(warning = {}) {
  const key = [
    warning.code,
    warning.severity,
    warning.message,
  ].join("|");

  const stamp = now();

  if (key === lastWarningKey && stamp - lastWarningAt < 1200) {
    return false;
  }

  lastWarningKey = key;
  lastWarningAt = stamp;

  return true;
}

/* =========================================================
   DEPS
========================================================= */

function getModule(AppCore, names = []) {
  if (!AppCore) return null;

  const keys = array(names).map((name) => text(name, "")).filter(Boolean);

  try {
    for (const key of keys) {
      const value = AppCore.modules?.get?.(key);
      if (value) return value;
    }
  } catch {}

  try {
    for (const key of keys) {
      if (AppCore.modules?.[key]) return AppCore.modules[key];
    }
  } catch {}

  try {
    for (const key of keys) {
      const value = AppCore.registry?.modules?.get?.(key);
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

    SidebarUI:
      deps.SidebarUI ||
      AppCore?.SidebarUI ||
      AppCore?.sidebar ||
      AppCore?.sidebarUI ||
      getModule(AppCore, ["SidebarUI", "sidebarUI", "sidebar"]),

    TopbarUI:
      deps.TopbarUI ||
      AppCore?.TopbarUI ||
      AppCore?.topbar ||
      AppCore?.topbarUI ||
      getModule(AppCore, ["TopbarUI", "topbarUI", "topbar"]),

    Toast:
      deps.Toast ||
      AppCore?.Toast ||
      AppCore?.toast ||
      AppCore?.toastModule ||
      getModule(AppCore, ["Toast", "toast", "toastModule"]),

    I18n:
      deps.I18n ||
      AppCore?.I18n ||
      AppCore?.i18n ||
      getModule(AppCore, ["I18n", "i18n"]),
  };
}

/* =========================================================
   PATHS / TOKEN ROUTES
========================================================= */

function origin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

function isHashRouterPath(value = "") {
  const raw = text(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = text(value, "");
  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  let value = text(pathname, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const out = [];

  for (const part of value.split("/").filter(Boolean)) {
    if (part === ".") continue;

    if (part === "..") {
      out.pop();
      continue;
    }

    out.push(part);
  }

  value = `/${out.join("/")}`;
  return value.length > 1 ? value.replace(/\/+$/g, "") : value;
}

function splitPath(value = DEFAULT_ROUTE) {
  let raw = text(value, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  return {
    pathname: normalizePathname(pathname),
    search: search ? (search.startsWith("?") ? search : `?${search}`) : "",
    hash: hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "",
  };
}

function toLocalPath(value = DEFAULT_ROUTE) {
  const raw = text(value, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    return toLocalPath(normalizeHashRouterPath(raw));
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const url = new URL(raw, origin());

      if (url.origin !== origin()) return DEFAULT_ROUTE;

      if (url.hash && isHashRouterPath(url.hash)) {
        return toLocalPath(normalizeHashRouterPath(url.hash));
      }

      return toLocalPath(`${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`);
    }
  } catch {
    return DEFAULT_ROUTE;
  }

  const parts = splitPath(raw);
  return `${parts.pathname}${parts.search}${parts.hash}`;
}

function stripSearchHash(path = DEFAULT_ROUTE) {
  return splitPath(toLocalPath(path)).pathname || DEFAULT_ROUTE;
}

function stripUsername(pathname = DEFAULT_ROUTE) {
  const clean = normalizePathname(pathname);
  const parts = clean.split("/").filter(Boolean);

  if (/^@[A-Za-z0-9._-]{1,80}$/.test(parts[0] || "")) {
    const rest = parts.slice(1).join("/");
    return rest ? normalizePathname(`/${rest}`) : DEFAULT_ROUTE;
  }

  return clean;
}

function canonicalPath(path = DEFAULT_ROUTE) {
  return stripUsername(stripSearchHash(path));
}

function browserPublicPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const { pathname, search, hash } = window.location;

    if (hash && isHashRouterPath(hash)) {
      return toLocalPath(normalizeHashRouterPath(hash));
    }

    return toLocalPath(`${pathname || DEFAULT_ROUTE}${search || ""}${hash || ""}`);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function browserHref() {
  if (!isBrowser()) return "";
  try {
    return window.location.href || "";
  } catch {
    return "";
  }
}

function authLike(path = DEFAULT_ROUTE) {
  const clean = canonicalPath(path);

  if (AUTH_LIKE_PATHS.includes(clean)) return true;

  return TOKEN_ROUTES.some((route) =>
    route.paths.some((item) => clean === item || clean.startsWith(`${item}/`))
  );
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");
    return array(names).some((name) => Boolean(text(params.get(name), "")));
  } catch {
    return false;
  }
}

function pathToken(route, value = "") {
  const clean = canonicalPath(toLocalPath(value));

  for (const path of route.paths) {
    if (!clean.startsWith(`${path}/`)) continue;

    const token = clean.slice(`${path}/`.length).split("/")[0];

    try {
      return text(decodeURIComponent(token || ""), "");
    } catch {
      return text(token, "");
    }
  }

  return "";
}

function hasRouteToken(route, value = "") {
  const raw = text(value, "");
  if (!raw) return false;

  if (pathToken(route, raw)) return true;

  try {
    const url = new URL(raw, origin());

    if (url.origin !== origin()) return false;

    if (hasTokenInSearch(url.search, route.tokenParams)) return true;

    if (url.hash && isHashRouterPath(url.hash)) {
      const hashPath = normalizeHashRouterPath(url.hash);
      if (pathToken(route, hashPath)) return true;

      const hashParts = splitPath(hashPath);
      if (hasTokenInSearch(hashParts.search, route.tokenParams)) return true;
    }

    if (url.hash && url.hash.includes("?")) {
      const query = url.hash.split("?").slice(1).join("?");
      return hasTokenInSearch(query ? `?${query}` : "", route.tokenParams);
    }
  } catch {
    const parts = splitPath(raw);

    if (hasTokenInSearch(parts.search, route.tokenParams)) return true;

    if (parts.hash && parts.hash.includes("?")) {
      const query = parts.hash.split("?").slice(1).join("?");
      return hasTokenInSearch(query ? `?${query}` : "", route.tokenParams);
    }
  }

  return false;
}

function windowValue(key = "") {
  if (!isBrowser() || !key) return "";

  try {
    return text(window[key], "");
  } catch {
    return "";
  }
}

function windowObject(key = "") {
  if (!isBrowser() || !key) return {};

  try {
    return object(window[key]);
  } catch {
    return {};
  }
}

function historyState() {
  if (!isBrowser()) return {};

  try {
    return object(window.history?.state);
  } catch {
    return {};
  }
}

function tokenRouteSnapshot() {
  const candidates = [
    browserHref(),
    browserPublicPath(),
    windowValue("__ONION_INITIAL_URL__"),
  ];

  const boot = windowObject("__ONION_BOOT_CONTEXT__");

  candidates.push(
    boot.initialUrl,
    boot.protectedInitialUrl,
    boot.protectedInitialPath,
    boot.protectedInitialPublicPath,
    boot.activationInitialUrl,
    boot.activationInitialPath,
    boot.activationInitialPublicPath,
    boot.resetConfirmInitialUrl,
    boot.resetConfirmInitialPath,
    boot.resetConfirmInitialPublicPath
  );

  for (const route of TOKEN_ROUTES) {
    for (const key of route.windowKeys) {
      candidates.push(windowValue(key));
    }
  }

  const cleanCandidates = candidates.map((item) => text(item, "")).filter(Boolean);
  const state = historyState();

  const routes = TOKEN_ROUTES.map((route) => {
    const matched = cleanCandidates.filter((candidate) => {
      const clean = canonicalPath(toLocalPath(candidate));
      return route.paths.some((path) => clean === path || clean.startsWith(`${path}/`));
    });

    const tokenCandidates = matched.filter((candidate) => hasRouteToken(route, candidate));
    const scrubbed = route.scrubFlags.some((flag) => Boolean(state[flag]));

    return {
      key: route.key,
      canonicalPath: route.canonicalPath,
      matched: matched.length > 0,
      hasToken: tokenCandidates.length > 0,
      scrubbed,
      candidateCount: matched.length,
      tokenCandidateCount: tokenCandidates.length,
      samples: matched.slice(0, 3).map(redact),
    };
  });

  return {
    anyMatched: routes.some((item) => item.matched),
    anyHasToken: routes.some((item) => item.hasToken),
    anyScrubbed: routes.some((item) => item.scrubbed),
    routes,
  };
}

/* =========================================================
   SNAPSHOT HELPERS
========================================================= */

function elementBySelectors(selectors = []) {
  if (!isBrowser()) return null;

  for (const selector of array(selectors)) {
    try {
      const el = selector.startsWith("#")
        ? document.getElementById(selector.slice(1))
        : document.querySelector(selector);

      if (el) return el;
    } catch {}
  }

  return null;
}

function classList(el) {
  try {
    return Array.from(el?.classList || []);
  } catch {
    return [];
  }
}

function elementSnapshot(selectors = []) {
  const el = elementBySelectors(selectors);

  if (!el) {
    return {
      exists: false,
    };
  }

  return {
    exists: true,
    id: text(el.id, ""),
    tag: text(el.tagName?.toLowerCase?.(), ""),
    hidden: Boolean(el.hidden),
    ariaHidden: text(el.getAttribute?.("aria-hidden"), ""),
    ariaBusy: text(el.getAttribute?.("aria-busy"), ""),
    className: text(el.className?.baseVal || el.className, "").slice(0, 500),
    classes: classList(el),
    childCount: number(el.children?.length, 0),
    hasContent: Boolean(text(el.textContent, "")),
    dataset: {
      shell: el.dataset?.shell || null,
      chrome: el.dataset?.chrome || null,
      routeMode: el.dataset?.routeMode || null,
      loaderVisible: el.dataset?.loaderVisible || null,
      loaderState: el.dataset?.loaderState || null,
      routerStatus: el.dataset?.routerStatus || null,
      routerCanonicalPath: redact(el.dataset?.routerCanonicalPath || "") || null,
      routerPublicPath: redact(el.dataset?.routerPublicPath || "") || null,
      routerRenderId: el.dataset?.routerRenderId || null,
    },
  };
}

function shellSnapshot(AppCore) {
  const dom = object(AppCore?.dom);
  const body = isBrowser() ? document.body || null : null;
  const html = isBrowser() ? document.documentElement || null : null;

  const elements = Object.fromEntries(
    Object.entries(DOM).map(([key, selectors]) => [key, elementSnapshot(selectors)])
  );

  const loaderVisible = Boolean(
    elements.loader.exists &&
      !elements.loader.hidden &&
      elements.loader.ariaHidden !== "true" &&
      elements.loader.dataset.loaderVisible !== "false" &&
      elements.loader.dataset.loaderState !== "hidden" &&
      !elements.loader.classes?.some?.((name) => HIDDEN_LOADER_CLASSES.includes(name))
  );

  const authScreen = Boolean(
    body?.classList?.contains?.("auth-screen") ||
      body?.classList?.contains?.("route-auth") ||
      html?.classList?.contains?.("route-auth")
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
      hasSidebar: Boolean(dom.sidebar),
      hasTopbar: Boolean(dom.topbar),
      hasTablehead: Boolean(dom.tablehead),
      hasTableheadContainer: Boolean(dom.tableheadContainer),
    },

    body: {
      exists: Boolean(body),
      className: text(body?.className, "").slice(0, 500),
      classes: classList(body),
      routeMode: body?.dataset?.routeMode || null,
      shell: body?.dataset?.shell || null,
      chrome: body?.dataset?.chrome || null,
      appLoading: body?.dataset?.appLoading || null,
    },

    html: {
      exists: Boolean(html),
      className: text(html?.className, "").slice(0, 500),
      classes: classList(html),
      routeMode: html?.dataset?.routeMode || null,
      shell: html?.dataset?.shell || null,
      chrome: html?.dataset?.chrome || null,
      appLoading: html?.dataset?.appLoading || null,
      appState: html?.dataset?.appState || null,
      theme: html?.dataset?.theme || null,
    },

    elements,

    loaderVisible,
    authScreen,

    chromeVisible: !Boolean(
      elements.sidebarMount.hidden ||
        elements.topbarMount.hidden ||
        elements.sidebar.hidden ||
        elements.topbar.hidden ||
        body?.classList?.contains?.("route-chrome-hidden") ||
        html?.classList?.contains?.("route-chrome-hidden")
    ),

    appShellVisible: Boolean(
      elements.shell.exists &&
        !elements.shell.hidden &&
        elements.shell.ariaHidden !== "true"
    ),

    hasViewContent: Boolean(
      elements.viewContainer.exists &&
        elements.viewContainer.hasContent
    ),
  };
}

function locationSnapshot() {
  if (!isBrowser()) {
    return {
      href: "",
      origin: "",
      publicPath: DEFAULT_ROUTE,
      canonicalPath: DEFAULT_ROUTE,
      authLike: false,
    };
  }

  const publicPath = browserPublicPath();

  return {
    href: redact(browserHref()),
    origin: window.location?.origin || "",
    pathname: redact(window.location?.pathname || ""),
    search: redact(window.location?.search || ""),
    hash: redact(window.location?.hash || ""),
    publicPath: redact(publicPath),
    canonicalPath: redact(canonicalPath(publicPath)),
    hashRouterPath:
      window.location?.hash && isHashRouterPath(window.location.hash)
        ? redact(normalizeHashRouterPath(window.location.hash))
        : "",
    authLike: authLike(publicPath),
  };
}

function documentSnapshot() {
  if (!isBrowser()) {
    return {
      readyState: "server",
      title: "",
      lang: null,
    };
  }

  const html = document.documentElement;

  return {
    readyState: document.readyState || "",
    title: document.title || "",
    lang: html?.getAttribute?.("lang") || html?.lang || null,
    visibilityState: document.visibilityState || null,
    hidden: typeof document.hidden === "boolean" ? document.hidden : null,
    theme: html?.dataset?.theme || null,
    routeMode: html?.dataset?.routeMode || null,
    shell: html?.dataset?.shell || null,
    chrome: html?.dataset?.chrome || null,
    appState: html?.dataset?.appState || null,
    appLoading: html?.dataset?.appLoading || null,
  };
}

function storageSnapshot() {
  if (!isBrowser()) {
    return {
      localStorage: false,
      sessionStorage: false,
      localStorageLength: 0,
      sessionStorageLength: 0,
    };
  }

  const keys = [
    "token",
    "accessToken",
    "refreshToken",
    "session",
    "auth",
    "onion:token",
    "onion:accessToken",
    "onion:refreshToken",
    "onion:session",
    "onion.auth",
    "onion.session",
  ];

  const out = {
    localStorage: false,
    sessionStorage: false,
    localStorageLength: 0,
    sessionStorageLength: 0,
    keys: [],
  };

  try {
    out.localStorageLength = number(window.localStorage?.length, 0);
  } catch {}

  try {
    out.sessionStorageLength = number(window.sessionStorage?.length, 0);
  } catch {}

  for (const key of keys) {
    try {
      if (window.localStorage?.getItem?.(key)) {
        out.localStorage = true;
        out.keys.push(`localStorage:${key}`);
      }
    } catch {}

    try {
      if (window.sessionStorage?.getItem?.(key)) {
        out.sessionStorage = true;
        out.keys.push(`sessionStorage:${key}`);
      }
    } catch {}
  }

  return out;
}

function performanceSnapshot() {
  const output = {
    supported: false,
    now: 0,
    navigationType: "",
    domContentLoadedMs: 0,
    loadEventMs: 0,
  };

  try {
    if (typeof performance === "undefined") return output;

    output.supported = true;
    output.now = Math.round(nowPerf());

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
  if (!isBrowser()) {
    return {
      length: 0,
      state: null,
    };
  }

  const state = historyState();

  return {
    length: number(window.history?.length, 0),
    state: sanitize(state),
    hasScrubbedActivationToken: Boolean(
      state.scrubbedActivationToken ||
        state.activationTokenScrubbed ||
        state.scrubbedActivateAccountToken
    ),
    hasScrubbedResetToken: Boolean(
      state.scrubbedResetToken ||
        state.scrubbedResetPasswordToken ||
        state.resetTokenScrubbed ||
        state.scrubbedResetConfirmToken ||
        state.scrubbedPasswordResetToken
    ),
    scrubbedPublicTokenRoute: state.scrubbedPublicTokenRoute || null,
    scrubbedTokenRoute: state.scrubbedTokenRoute || null,
  };
}

function userSnapshot(AppCore, Auth = null) {
  const state = object(AppCore?.state);

  const authUser = safeCall(
    () => Auth?.getUser?.() || Auth?.getCurrentUser?.() || Auth?.user || null,
    null
  );

  const user =
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    state.me ||
    state.account ||
    state.profile ||
    state.session?.user ||
    state.auth?.user ||
    authUser ||
    null;

  return {
    present: Boolean(user),
    id: user?.id || user?.userId || user?.uid || user?.sub || null,
    username: user?.username || user?.userName || user?.email || user?.name || user?.displayName || null,
    displayName: user?.displayName || user?.name || user?.username || user?.email || null,
    role: state.role || state.rol || state.userRole || user?.role || user?.rol || Auth?.role || null,
    hasAvatar: Boolean(user?.avatarUrl || user?.avatar || user?.photoURL || user?.picture),
  };
}

function authSnapshot(AppCore, Auth = null) {
  const state = object(AppCore?.state);

  const isAuth = Boolean(
    state.authenticated ||
      state.isAuthenticated ||
      safeCall(() => Auth?.isAuthenticated?.(), false) ||
      Auth?.authenticated
  );

  return {
    present: Boolean(Auth),
    authenticated: isAuth,
    hasStateToken: Boolean(
      state.token ||
        state.accessToken ||
        state.access_token ||
        state.session?.token ||
        state.session?.accessToken ||
        state.auth?.token ||
        state.auth?.accessToken
    ),
    hasAuthHeader: Boolean(safeCall(() => Auth?.getAuthHeader?.(), "")),
    restoring: Boolean(state.restoring || state.authRestoring || state.sessionRestoring || Auth?.restoring),
    loginInProgress: Boolean(state.loginInProgress || state.authLoginInProgress || Auth?.loginPromise),
    hasRestoreSession: Boolean(isFn(Auth?.restoreSession) || isFn(Auth?.restore) || isFn(Auth?.session?.restore)),
    hasLogin: isFn(Auth?.login),
    hasLogout: isFn(Auth?.logout),
    hasRefresh: Boolean(isFn(Auth?.refresh) || isFn(Auth?.refreshToken) || isFn(Auth?.refreshSession)),
    role: state.role || state.rol || state.userRole || Auth?.role || null,
    user: userSnapshot(AppCore, Auth),
  };
}

function routerSnapshot(AppCore, Router = null) {
  const state = object(AppCore?.state);

  let snap = null;

  try {
    snap = Router?.getSnapshot?.() || Router?.getDebugSnapshot?.() || Router?.getState?.() || null;
  } catch {}

  const hasRender = isFn(Router?.render);
  const hasNavigate = isFn(Router?.navigate);
  const hasGo = isFn(Router?.go);
  const hasPush = isFn(Router?.push);

  return {
    present: Boolean(Router),
    configured: Boolean(Router?.configured || Router?.isConfigured || snap?.configured || hasRender || hasNavigate || hasGo || hasPush),
    bound: Boolean(Router?.bound || Router?.isBound || snap?.bound),
    ready: Boolean(Router?.ready || snap?.ready),

    hasRender,
    hasNavigate,
    hasGo,
    hasPush,
    hasBind: isFn(Router?.bind),
    hasBack: isFn(Router?.back),

    canRenderOrNavigate: Boolean(hasRender || hasNavigate || hasGo || hasPush),

    currentCanonicalPath: redact(safeCall(() => Router?.getCurrentCanonicalPath?.(), "")),
    currentPublicPath: redact(safeCall(() => Router?.getCurrentPublicPath?.(), "")),

    stateRoute: redact(state.route || DEFAULT_ROUTE),
    statePublicPath: redact(state.publicPath || DEFAULT_ROUTE),

    initialRouteRendered: Boolean(state.initialRouteRendered || snap?.initialRouteRendered || snap?.firstRenderDone),

    snapshot: sanitize(snap),
  };
}

function storeSnapshot(Store = null) {
  const state = object(safeCall(() => Store?.getState?.(), {}));

  return {
    present: Boolean(Store),
    hasInit: isFn(Store?.init),
    hasGetState: isFn(Store?.getState),
    hasSetState: isFn(Store?.setState),
    hasPatchState: isFn(Store?.patchState),
    ready: Boolean(state.ready || Store?.state?.ready),
    booted: Boolean(state.booted || Store?.state?.booted),
    state: sanitize({
      ready: state.ready,
      booted: state.booted,
      loading: state.loading,
      error: state.error,
    }),
  };
}

function uiModuleSnapshot(moduleRef = null) {
  let snap = null;

  try {
    snap = moduleRef?.getSnapshot?.() || moduleRef?.getState?.() || null;
  } catch {}

  return {
    present: Boolean(moduleRef),
    initialized: Boolean(moduleRef?.initialized || moduleRef?.ready || moduleRef?.mounted || snap?.initialized || snap?.ready || snap?.mounted),
    hasInit: isFn(moduleRef?.init),
    hasBoot: isFn(moduleRef?.boot),
    hasMount: isFn(moduleRef?.mount),
    hasStart: isFn(moduleRef?.start),
    hasRepair: isFn(moduleRef?.repair),
    hasRefresh: isFn(moduleRef?.refresh),
    hasSync: isFn(moduleRef?.sync),
    hasUserSync: Boolean(
      isFn(moduleRef?.renderUser) ||
        isFn(moduleRef?.refreshUser) ||
        isFn(moduleRef?.updateUser) ||
        isFn(moduleRef?.syncUser)
    ),
    hasRebind: Boolean(
      isFn(moduleRef?.rebind) ||
        isFn(moduleRef?.rebindEvents) ||
        isFn(moduleRef?.bindEvents) ||
        isFn(moduleRef?.bind)
    ),
    snapshot: sanitize(snap),
  };
}

function i18nSnapshot(AppCore, I18n = null) {
  const state = object(AppCore?.state);

  const docLang = isBrowser()
    ? text(document.documentElement?.lang || document.documentElement?.getAttribute?.("lang"), "")
    : "";

  const lang =
    safeCall(() => I18n?.getLang?.(), "") ||
    safeCall(() => I18n?.getLanguage?.(), "") ||
    I18n?.lang ||
    I18n?.language ||
    state.lang ||
    docLang ||
    DEFAULT_LANG;

  return {
    present: Boolean(I18n || state.i18nInitialized || state.lang || docLang),
    modulePresent: Boolean(I18n),
    initialized: Boolean(state.i18nInitialized || I18n || state.lang || docLang),
    lang,
    stateLang: state.lang || DEFAULT_LANG,
    documentLang: docLang || null,
    hasTranslate: isFn(I18n?.t),
    hasBoot: Boolean(isFn(I18n?.boot) || isFn(I18n?.init)),
    hasSetLang: Boolean(isFn(I18n?.setLang) || isFn(I18n?.changeLanguage) || isFn(I18n?.use)),
  };
}

function appSnapshot(AppCore) {
  const state = object(AppCore?.state);
  const cfg = object(AppCore?.config);

  return {
    apiBase: cfg.apiBase || null,
    environment: cfg.env || cfg.environment || null,
    appName: cfg.appName || cfg.name || null,

    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(state.token || state.accessToken || state.access_token || state.session?.token || state.auth?.token),

    role: state.role || state.rol || state.userRole || null,

    route: redact(state.route || DEFAULT_ROUTE),
    publicPath: redact(state.publicPath || DEFAULT_ROUTE),
    currentResolvedUsername: state.currentResolvedUsername || null,

    theme: state.theme || DEFAULT_THEME,
    lang: state.lang || DEFAULT_LANG,

    sidebarOpen: typeof state.sidebarOpen === "boolean" ? state.sidebarOpen : null,
    shellVisible: typeof state.shellVisible === "boolean" ? state.shellVisible : null,
    chromeVisible: typeof state.chromeVisible === "boolean" ? state.chromeVisible : null,

    booting: Boolean(state.booting),
    booted: Boolean(state.booted),
    ready: Boolean(state.ready || state.appReady),
    loading: Boolean(state.loading),
    restoring: Boolean(state.restoring || state.authRestoring || state.sessionRestoring),

    bootPhase: state.bootPhase || null,
    bootCycleId: state.bootCycleId || 0,

    uiInitialized: Boolean(state.uiInitialized),
    i18nInitialized: Boolean(state.i18nInitialized),
    initialRouteRendered: Boolean(state.initialRouteRendered),
    bootNavigationHandled: Boolean(state.bootNavigationHandled),
    loginInProgress: Boolean(state.loginInProgress),
  };
}

/* =========================================================
   HEALTH
========================================================= */

function buildWarnings(snapshot = {}) {
  const warnings = [];

  if (!snapshot.ok) {
    warnings.push({
      code: "APPCORE_MISSING",
      severity: "critical",
      message: "AppCore no está disponible.",
    });
  }

  if (!snapshot.app?.apiBase) {
    warnings.push({
      code: "API_BASE_MISSING",
      severity: "medium",
      message: "apiBase no configurada.",
    });
  }

  if (snapshot.auth?.authenticated && !snapshot.auth?.user?.username) {
    warnings.push({
      code: "AUTH_WITHOUT_VISIBLE_USERNAME",
      severity: "medium",
      message: "Sesión autenticada sin username visible.",
    });
  }

  if (
    snapshot.auth?.authenticated &&
    !snapshot.auth?.hasStateToken &&
    !snapshot.auth?.hasAuthHeader &&
    !snapshot.storage?.localStorage &&
    !snapshot.storage?.sessionStorage
  ) {
    warnings.push({
      code: "AUTH_WITHOUT_VISIBLE_TOKEN_HINT",
      severity: "low",
      message: "Sesión autenticada sin token/header/storage visible. Si usas cookie HttpOnly, es normal.",
    });
  }

  if (!snapshot.router?.present && !snapshot.router?.stateRoute && !snapshot.router?.statePublicPath) {
    warnings.push({
      code: "ROUTER_UNAVAILABLE",
      severity: "high",
      message: "Router no detectable en deps/AppCore.",
    });
  }

  if (snapshot.router?.present && !snapshot.router?.canRenderOrNavigate && !snapshot.router?.configured) {
    warnings.push({
      code: "ROUTER_NOT_READY",
      severity: "high",
      message: "Router detectado pero sin capacidad aparente de navegación/render.",
    });
  }

  if (!snapshot.shell?.elements?.viewContainer?.exists) {
    warnings.push({
      code: "VIEW_CONTAINER_MISSING",
      severity: "critical",
      message: "No existe #view-container en el DOM.",
    });
  }

  if (!snapshot.shell?.elements?.shell?.exists) {
    warnings.push({
      code: "APP_SHELL_MISSING",
      severity: "high",
      message: "No existe #app-shell en el DOM.",
    });
  }

  if (snapshot.app?.ready && !snapshot.app?.loading && snapshot.shell?.loaderVisible) {
    warnings.push({
      code: "LOADER_VISIBLE_AFTER_READY",
      severity: "medium",
      message: "El loader parece visible aunque la app está lista.",
    });
  }

  if (snapshot.auth?.authenticated && !snapshot.location?.authLike && snapshot.shell?.authScreen) {
    warnings.push({
      code: "AUTH_SCREEN_STALE_ON_PRIVATE_ROUTE",
      severity: "medium",
      message: "Quedan clases auth-screen en una ruta privada.",
    });
  }

  if (
    snapshot.publicTokenRoutes?.anyHasToken &&
    snapshot.router?.initialRouteRendered &&
    snapshot.location?.authLike === false
  ) {
    warnings.push({
      code: "PUBLIC_TOKEN_ROUTE_RENDER_RISK",
      severity: "medium",
      message: "Hay token público preservado pero la ruta actual ya no parece auth-like.",
    });
  }

  if (!snapshot.i18n?.present && !snapshot.app?.lang && !snapshot.document?.lang) {
    warnings.push({
      code: "I18N_UNAVAILABLE",
      severity: "low",
      message: "No se detecta idioma runtime ni módulo I18n.",
    });
  }

  return warnings;
}

function health(snapshot = {}) {
  const warnings = array(snapshot.warnings);
  let score = 100;

  for (const warning of warnings) {
    if (warning.severity === "critical") score -= 35;
    else if (warning.severity === "high") score -= 22;
    else if (warning.severity === "medium") score -= 12;
    else score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    status:
      score >= 95
        ? "excellent"
        : score >= 85
          ? "good"
          : score >= 65
            ? "degraded"
            : "critical",
    criticalCount: warnings.filter((item) => item.severity === "critical").length,
    highCount: warnings.filter((item) => item.severity === "high").length,
    mediumCount: warnings.filter((item) => item.severity === "medium").length,
    lowCount: warnings.filter((item) => item.severity === "low").length,
  };
}

/* =========================================================
   PUBLIC SNAPSHOT
========================================================= */

export function createWarmupSnapshot(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
    Auth,
    Router,
    Store,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    reason = "warmup",
  } = deps;

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
    storage: storageSnapshot(),

    bootContext: sanitize(windowObject("__ONION_BOOT_CONTEXT__")),
    publicTokenRoutes: tokenRouteSnapshot(),

    app: appSnapshot(AppCore),
    auth: authSnapshot(AppCore, Auth),
    router: routerSnapshot(AppCore, Router),
    store: storeSnapshot(Store),
    i18n: i18nSnapshot(AppCore, I18n),

    ui: {
      toast: uiModuleSnapshot(Toast),
      sidebar: uiModuleSnapshot(SidebarUI),
      topbar: uiModuleSnapshot(TopbarUI),
    },

    shell: shellSnapshot(AppCore),
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

    publicTokenRoute: Boolean(data.publicTokenRoutes?.anyMatched),
    publicTokenPresent: Boolean(data.publicTokenRoutes?.anyHasToken),
    publicTokenScrubbed: Boolean(data.publicTokenRoutes?.anyScrubbed),

    routerPresent: Boolean(data.router?.present),
    routerConfigured: Boolean(data.router?.configured),
    routerBound: Boolean(data.router?.bound),
    routerCanRenderOrNavigate: Boolean(data.router?.canRenderOrNavigate),

    i18nPresent: Boolean(data.i18n?.present),
    i18nModulePresent: Boolean(data.i18n?.modulePresent),

    hasAppShell: Boolean(data.shell?.elements?.shell?.exists),
    hasViewContainer: Boolean(data.shell?.elements?.viewContainer?.exists),
    hasLoader: Boolean(data.shell?.elements?.loader?.exists),
    loaderVisible: Boolean(data.shell?.loaderVisible),

    hasSidebar: Boolean(data.shell?.elements?.sidebar?.exists || data.shell?.elements?.sidebarMount?.exists),
    hasTopbar: Boolean(data.shell?.elements?.topbar?.exists || data.shell?.elements?.topbarMount?.exists),

    authScreen: Boolean(data.shell?.authScreen),
    chromeVisible: Boolean(data.shell?.chromeVisible),
  };
}

function remember(snapshot = {}) {
  lastSnapshot = snapshot;
  lastSummary = getWarmupSummary(snapshot);

  recentSnapshots.unshift({
    at: snapshot.at,
    reason: snapshot.reason,
    summary: lastSummary,
  });

  if (recentSnapshots.length > MAX_RECENT) {
    recentSnapshots.splice(MAX_RECENT);
  }

  return snapshot;
}

export function getWarmupRuntimeSnapshot() {
  return {
    version: WARMUP_VERSION,

    warmupCount,

    lastWarmupAt,
    lastWarmupAtIso: lastWarmupAt ? iso(lastWarmupAt) : "",
    lastWarmupDurationMs,

    lastSummary,

    lastWarningKey: redact(lastWarningKey),
    lastWarningAt,
    lastWarningAtIso: lastWarningAt ? iso(lastWarningAt) : "",

    lastLogKey: redact(lastLogKey),
    lastLogAt,
    lastLogAtIso: lastLogAt ? iso(lastLogAt) : "",

    lastEventKey: redact(lastEventKey),
    lastEventAt,
    lastEventAtIso: lastEventAt ? iso(lastEventAt) : "",

    recentSnapshots: recentSnapshots.slice(),
  };
}

export function resetWarmupRuntimeState() {
  lastSnapshot = null;
  lastSummary = null;

  lastEventKey = "";
  lastEventAt = 0;

  lastWarningKey = "";
  lastWarningAt = 0;

  lastLogKey = "";
  lastLogAt = 0;

  warmupCount = 0;
  lastWarmupAt = 0;
  lastWarmupDurationMs = 0;

  recentSnapshots.splice(0);

  return getWarmupRuntimeSnapshot();
}

/* =========================================================
   DEBUG
========================================================= */

export function exposeWarmupDebugApi(first = {}, second = {}) {
  const deps = resolveDeps(first, second);
  const { AppCore } = deps;

  const api = {
    version: WARMUP_VERSION,

    createSnapshot(options = {}) {
      return createWarmupSnapshot({
        ...deps,
        ...object(options),
      });
    },

    run(options = {}) {
      return warmup({
        ...deps,
        ...object(options),
      });
    },

    getLastSnapshot() {
      return lastSnapshot;
    },

    getLastSummary() {
      return lastSummary;
    },

    getRuntimeSnapshot: getWarmupRuntimeSnapshot,
    reset: resetWarmupRuntimeState,
  };

  try {
    if (isBrowser()) {
      window.__ONION_WARMUP__ = api;
    }
  } catch {}

  try {
    defineValue(AppCore, "Warmup", api);
  } catch {}

  emit(AppCore, EVENTS.debugReady, {
    at: iso(),
  });

  return api;
}

export function printWarmupSummary(snapshot = {}, AppCore = null) {
  const summary = getWarmupSummary(snapshot);

  log(AppCore, "info", "Warmup summary:", summary);

  return summary;
}

/* =========================================================
   WARMUP
========================================================= */

export async function warmup(first = {}, second = {}) {
  const deps = resolveDeps(first, second);

  const {
    AppCore,
    emit: shouldEmit = true,
    log: shouldLogOutput = true,
    exposeDebug = true,
    reason = "warmup",
  } = deps;

  const started = now();

  const snapshot = createWarmupSnapshot({
    ...deps,
    reason,
  });

  snapshot.durationMs = now() - started;

  warmupCount += 1;
  lastWarmupAt = now();
  lastWarmupDurationMs = snapshot.durationMs;

  remember(snapshot);

  try {
    if (AppCore && exposeDebug !== false) {
      exposeWarmupDebugApi({
        ...deps,
        AppCore,
      });
    }

    if (AppCore && shouldLogOutput && shouldLog(snapshot)) {
      log(AppCore, "log", "Warmup ejecutado.", {
        reason: snapshot.reason,
        health: snapshot.health,
        warningCount: snapshot.warningCount,
        durationMs: snapshot.durationMs,
      });

      log(AppCore, "log", "Diagnóstico inicial:", snapshot);
    }

    for (const warning of array(snapshot.warnings)) {
      const allowWarning = shouldWarn(warning);

      if (AppCore && shouldLogOutput && allowWarning) {
        log(AppCore, "warn", "Warmup aviso:", warning.code, warning.severity, warning.message);
      }

      if (AppCore && shouldEmit && allowWarning) {
        emit(AppCore, EVENTS.warning, {
          warning,
          reason: snapshot.reason,
          at: iso(),
        });
      }
    }

    if (AppCore && shouldEmit) {
      emit(AppCore, EVENTS.warmup, snapshot);
      emit(AppCore, EVENTS.summary, getWarmupSummary(snapshot));

      emit(AppCore, EVENTS.ready, {
        ok: snapshot.ok,
        reason: snapshot.reason,
        health: snapshot.health,
        warningCount: snapshot.warningCount,
        durationMs: snapshot.durationMs,
        at: iso(),
      });
    }

    return snapshot;
  } catch {
    return snapshot;
  }
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default warmup;
