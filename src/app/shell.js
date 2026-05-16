/* =========================================================
   Onion SPA - App Shell
   Archivo: src/app/shell.js

   Shell app simple:
   - #app-shell siempre estable.
   - chrome = sidebar/topbar/tablehead.
   - loader no se toca salvo política post-render segura.
   - auth routes ocultan chrome, no destruyen shell.
   - publicPath conserva /@usuario, query y hash.
   - canonicalPath limpia /@usuario, query/hash y aliases técnicos.
   - sin navegación, sin montar Sidebar/Topbar, sin CSS inline.
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

import {
  APP_EVENTS,
  ROUTER_EVENTS,
  APP_RUNTIME_KEYS,
  APP_SELECTORS,
  AUTH_LIKE_ROUTES,
  PUBLIC_TECHNICAL_PREFIXES,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
  DEFAULT_ROUTE as APP_DEFAULT_ROUTE,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const SHELL_VERSION = "17.0.0-clean";

const SOURCE = "app:shell";
const DEFAULT_ROUTE = APP_DEFAULT_ROUTE || "/";

const RUNTIME_KEY =
  APP_RUNTIME_KEYS?.shell ||
  "__ONION_APP_SHELL__";

const EVENTS = Object.freeze({
  change: ROUTER_EVENTS?.shellChange || "router:shell:change",
  state: ROUTER_EVENTS?.shellState || "router:shell:state",
  appState: APP_EVENTS?.shellState || "app:shell:state",
  postRender: APP_EVENTS?.shellPostRender || "app:shell:post-render",
  ready: APP_EVENTS?.shellReady || "app:shell:ready",
  busy: APP_EVENTS?.shellBusy || "app:shell:busy",
  elements: "app:shell:elements",
  error: "app:shell:error",
  debugApi: "app:shell:debug-api",
});

const FALLBACK_PATHS = Object.freeze({
  login: ["/login", "/signin", "/sign-in"],
  register: ["/register", "/signup", "/sign-up"],
  reset: [
    "/forgot-password",
    "/recover-password",
    "/password-reset",
    "/password-reset/request",
    "/reset-password",
    "/reset-password/request",
    "/reset-password-request",
    "/request-reset-password",
  ],
  resetConfirm: [
    "/reset-password/confirm",
    "/reset-password-confirm",
    "/password-reset/confirm",
    "/password-reset-confirm",
    "/confirm-reset-password",
  ],
  activation: [
    "/activate-account",
    "/activate",
    "/activation",
    "/account/activate",
    "/activate/first-user",
  ],
  twoFactor: ["/2fa", "/otp", "/mfa"],
});

const TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "activation_token",
  "activate_token",
  "resetToken",
  "reset_token",
  "passwordResetToken",
  "password_reset_token",
  "confirmToken",
  "confirm_token",
  "code",
  "t",
  "otp",
  "totp",
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

const LOGIN_PATHS = Object.freeze(normalizeRouteList(FALLBACK_PATHS.login));
const REGISTER_PATHS = Object.freeze(normalizeRouteList(FALLBACK_PATHS.register));
const RESET_PATHS = Object.freeze(normalizeRouteList(FALLBACK_PATHS.reset));
const RESET_CONFIRM_PATHS = Object.freeze(normalizeRouteList(FALLBACK_PATHS.resetConfirm));
const ACTIVATION_PATHS = Object.freeze(normalizeRouteList(FALLBACK_PATHS.activation));
const TWO_FACTOR_PATHS = Object.freeze(normalizeRouteList(FALLBACK_PATHS.twoFactor));

const AUTH_PATHS = Object.freeze(
  normalizeRouteList([
    ...array(AUTH_LIKE_ROUTES),
    ...LOGIN_PATHS,
    ...REGISTER_PATHS,
    ...RESET_PATHS,
    ...RESET_CONFIRM_PATHS,
    ...ACTIVATION_PATHS,
    ...TWO_FACTOR_PATHS,
  ])
);

const AUTH_PREFIXES = Object.freeze(
  normalizeRouteList([
    ...array(PUBLIC_TECHNICAL_PREFIXES),
    ...ACTIVATION_PATHS.map((path) => `${path}/`),
    ...RESET_CONFIRM_PATHS.map((path) => `${path}/`),
    ...TWO_FACTOR_PATHS.map((path) => `${path}/`),
  ])
);

const TOKEN_ROUTE_CONFIGS = Object.freeze(
  normalizeTokenRouteConfigs(PROTECTED_PUBLIC_TOKEN_ROUTES)
);

const SELECTORS = Object.freeze({
  appShell: Object.freeze(compactList(
    APP_SELECTORS?.appShell,
    APP_SELECTORS?.shell,
    "#app-shell",
    "[data-app-shell='true']",
    "[data-app-shell]",
    ".app-shell",
    ".layout"
  )),

  mainContent: Object.freeze(compactList(
    APP_SELECTORS?.mainContent,
    APP_SELECTORS?.main,
    "#main-content",
    "main.main-content",
    "[data-main-content='true']",
    "[data-main-content]",
    ".main-content",
    "main"
  )),

  appContent: Object.freeze(compactList(
    APP_SELECTORS?.appContent,
    "#app-content",
    "[data-app-content='true']",
    "[data-app-content]",
    ".app-content"
  )),

  viewContainer: Object.freeze(compactList(
    APP_SELECTORS?.viewContainer,
    APP_SELECTORS?.view,
    APP_SELECTORS?.viewRoot,
    APP_SELECTORS?.routerView,
    "#view-container",
    "[data-view-root='true']",
    "[data-view-root]",
    "[data-router-view='true']",
    "[data-router-view]",
    "[data-view-container='true']",
    "[data-view-container]",
    "[data-router-outlet]",
    ".view-container",
    ".router-view"
  )),

  sidebarMount: Object.freeze(compactList(
    APP_SELECTORS?.sidebarMount,
    "#sidebar-mount",
    "[data-sidebar-mount='true']",
    "[data-sidebar-mount]"
  )),

  topbarMount: Object.freeze(compactList(
    APP_SELECTORS?.topbarMount,
    "#topbar-mount",
    "[data-topbar-mount='true']",
    "[data-topbar-mount]"
  )),

  sidebar: Object.freeze(compactList(
    APP_SELECTORS?.sidebar,
    "#app-sidebar",
    "#sidebar",
    ".sidebar",
    "[data-sidebar-root='true']",
    "[data-sidebar-root]",
    "[data-sidebar]"
  )),

  topbar: Object.freeze(compactList(
    APP_SELECTORS?.topbar,
    "#app-topbar",
    "#topbar",
    ".topbar",
    "[data-topbar-root='true']",
    "[data-topbar-root]",
    "[data-topbar]"
  )),

  tablehead: Object.freeze(compactList(
    APP_SELECTORS?.tablehead,
    APP_SELECTORS?.tableHead,
    "#table-head",
    "#tablehead",
    ".table-head",
    ".tablehead",
    "[data-tablehead='true']",
    "[data-tablehead]",
    "[data-table-head]"
  )),

  tableheadContainer: Object.freeze(compactList(
    APP_SELECTORS?.tableheadContainer,
    APP_SELECTORS?.tableHeadContainer,
    "#tablehead-container",
    "#table-head-container",
    ".tablehead-container",
    "[data-tablehead-container='true']",
    "[data-tablehead-container]",
    "[data-table-head-container]"
  )),

  mobileSidebarToggle: Object.freeze(compactList(
    APP_SELECTORS?.mobileSidebarToggle,
    APP_SELECTORS?.sidebarMobileToggle,
    "#toggleSidebarMobile",
    "[data-sidebar-mobile-toggle]",
    "[data-mobile-sidebar-toggle]",
    "[data-action='toggle-sidebar-mobile']"
  )),

  loader: Object.freeze(compactList(
    APP_SELECTORS?.loader,
    APP_SELECTORS?.appLoader,
    "#app-loader",
    "#boot-loader",
    "[data-app-loader='true']",
    "[data-app-loader]",
    ".app-loader"
  )),
});

const CLASSES = Object.freeze({
  boot: ["app-booting", "app-loading", "is-booting", "is-loading", "loading"],

  loaderHidden: ["is-hidden", "has-hidden", "loader-hidden"],
  loaderVisible: ["is-visible", "is-entering", "is-leaving", "loader-visible"],

  routeAuth: "route-auth",
  routeApp: "route-app",
  authScreen: "auth-screen",
  loginNoScroll: "login-no-scroll",

  chromeHidden: "route-chrome-hidden",
  chromeVisible: "route-chrome-visible",

  shellHidden: "route-shell-hidden",
  shellVisible: "route-shell-visible",

  sidebarResidual: [
    "sidebar-open",
    "sidebar-collapsed",
    "sidebar-transitioning",
    "sidebar-tooltips-active",
    "sidebar-mobile-open",
    "has-sidebar-open",
  ],
});

const EVENT_DEDUPE_MS = 40;
const SNAPSHOT_CLASS_MAX = 800;

/* =========================================================
   RUNTIME
========================================================= */

let lastEventKey = "";
let lastEventAt = 0;
let lastError = null;

let debugApiInstalled = false;
let debugApiRef = null;

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

function compactList(...values) {
  const out = [];
  const seen = new Set();

  function add(value) {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }

    if (value instanceof Set) {
      Array.from(value).forEach(add);
      return;
    }

    if (typeof value !== "string") return;

    const clean = text(value, "");
    if (!clean || seen.has(clean)) return;

    seen.add(clean);
    out.push(clean);
  }

  values.forEach(add);

  return out;
}

function classListArray(classList) {
  try {
    return Array.from(classList || []);
  } catch {
    return [];
  }
}

function isExtensibleObject(value) {
  try {
    return value && (typeof value === "object" || typeof value === "function") && Object.isExtensible(value);
  } catch {
    return false;
  }
}

/* =========================================================
   PATHS / TOKEN ROUTES
========================================================= */

function origin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  let value = text(pathname, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const parts = [];

  for (const part of value.split("/").filter(Boolean)) {
    if (part === ".") continue;

    if (part === "..") {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  value = `/${parts.join("/")}`;

  return value.length > 1 ? value.replace(/\/+$/g, "") : value || DEFAULT_ROUTE;
}

function normalizeSearch(search = "") {
  const value = text(search, "");
  if (!value) return "";
  return value.startsWith("?") ? value : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = text(hash, "");
  if (!value) return "";
  return value.startsWith("#") ? value : `#${value.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw = text(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = text(value, "");

  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("#!")) return normalizeFullPath(raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE);

  return normalizeFullPath(raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE);
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
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function normalizeFullPath(path = DEFAULT_ROUTE) {
  let raw = text(path, DEFAULT_ROUTE);

  if (!raw) return DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, origin());

      if (parsed.origin !== origin()) return DEFAULT_ROUTE;

      if (parsed.hash && isHashRouterPath(parsed.hash)) {
        return normalizeHashRouterPath(parsed.hash);
      }

      raw = `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch {
    return DEFAULT_ROUTE;
  }

  const parts = splitPath(raw);
  return `${parts.pathname}${parts.search}${parts.hash}`;
}

function cleanPath(path = DEFAULT_ROUTE) {
  return splitPath(normalizeFullPath(path)).pathname || DEFAULT_ROUTE;
}

function normalizeRouteList(values = []) {
  return compactList(values).map(normalizePathname);
}

function isUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(text(segment, ""));
}

function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const parts = splitPath(normalizeFullPath(path));
  const segments = parts.pathname.split("/").filter(Boolean);

  if (segments.length && isUsernameSegment(segments[0])) {
    const rest = segments.slice(1).join("/");
    return `${rest ? normalizePathname(`/${rest}`) : DEFAULT_ROUTE}${parts.search}${parts.hash}`;
  }

  return `${parts.pathname}${parts.search}${parts.hash}`;
}

function normalizeTokenRouteConfigs(configs = []) {
  const source = array(configs).length
    ? array(configs)
    : [
        {
          key: "activation",
          path: "/activate-account",
          aliases: FALLBACK_PATHS.activation,
          tokenParamNames: ["token", "activationToken", "activateToken", "code", "t"],
        },
        {
          key: "resetConfirm",
          path: "/reset-password/confirm",
          aliases: FALLBACK_PATHS.resetConfirm,
          tokenParamNames: ["token", "resetToken", "passwordResetToken", "confirmToken", "code", "t"],
        },
      ];

  return source
    .map((raw) => {
      const item = object(raw);
      const key = text(item.key || item.name, "");
      const path = normalizePathname(
        item.path ||
          item.route ||
          (
            key === "resetConfirm"
              ? "/reset-password/confirm"
              : "/activate-account"
          )
      );

      const paths = normalizeRouteList([
        path,
        item.paths,
        item.aliases,
        key === "activation" ? FALLBACK_PATHS.activation : [],
        key === "resetConfirm" ? FALLBACK_PATHS.resetConfirm : [],
      ]);

      return Object.freeze({
        key: key || path,
        path,
        paths: Object.freeze(paths),
        tokenParamNames: Object.freeze(compactList(
          item.tokenParamNames,
          item.params,
          TOKEN_PARAM_NAMES
        )),
      });
    })
    .filter((item) => item.key && item.path && item.path !== DEFAULT_ROUTE);
}

function canonicalizeTokenAlias(path = DEFAULT_ROUTE) {
  const pathname = cleanPath(stripUsernamePrefix(path));

  for (const config of TOKEN_ROUTE_CONFIGS) {
    for (const candidate of array(config.paths)) {
      if (pathname === candidate || pathname.startsWith(`${candidate}/`)) {
        return config.path;
      }
    }
  }

  return normalizePathname(pathname);
}

function publicShellPath(AppCore, path = DEFAULT_ROUTE) {
  const local = normalizeFullPath(path || DEFAULT_ROUTE);

  if (local.includes("?") || local.includes("#") || local.startsWith("/@")) {
    return local;
  }

  try {
    const delegated = AppCore?.utils?.normalizePath?.(path || DEFAULT_ROUTE);

    if (delegated) {
      const normalized = normalizeFullPath(delegated);

      if (cleanPath(local) !== DEFAULT_ROUTE && cleanPath(normalized) === DEFAULT_ROUTE) {
        return local;
      }

      return normalized || local;
    }
  } catch {}

  return local;
}

function canonicalShellPath(AppCore, path = DEFAULT_ROUTE) {
  const localPublic = publicShellPath(AppCore, path || DEFAULT_ROUTE);
  const localCanonical = canonicalizeTokenAlias(stripUsernamePrefix(localPublic));

  try {
    const delegated = AppCore?.utils?.normalizeCanonicalPath?.(stripUsernamePrefix(localPublic));

    if (delegated) {
      const normalized = canonicalizeTokenAlias(delegated);

      if (localCanonical !== DEFAULT_ROUTE && normalized === DEFAULT_ROUTE) {
        return localCanonical;
      }

      return normalized || localCanonical;
    }
  } catch {}

  return localCanonical || DEFAULT_ROUTE;
}

function browserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const { pathname, search, hash } = window.location;

    if (hash && isHashRouterPath(hash)) {
      return normalizeHashRouterPath(hash);
    }

    return normalizeFullPath(`${pathname || DEFAULT_ROUTE}${search || ""}${hash || ""}`);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function pathMatches(paths = [], path = DEFAULT_ROUTE, { allowPrefix = false } = {}) {
  const clean = canonicalShellPath(null, path || DEFAULT_ROUTE);

  return array(paths).some((candidate) => {
    const current = normalizePathname(candidate);

    if (clean === current) return true;
    return Boolean(allowPrefix && current !== DEFAULT_ROUTE && clean.startsWith(`${current}/`));
  });
}

function routeHasToken(path = "") {
  const value = text(path, "");

  if (!value) return false;

  try {
    const parsed = new URL(value, origin());

    for (const name of TOKEN_PARAM_NAMES) {
      if (parsed.searchParams.get(name)) return true;
    }

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      if (routeHasToken(normalizeHashRouterPath(parsed.hash))) return true;
    }

    if (parsed.hash && parsed.hash.includes("?")) {
      const query = parsed.hash.split("?").slice(1).join("?");
      const params = new URLSearchParams(query ? `?${query}` : "");

      for (const name of TOKEN_PARAM_NAMES) {
        if (params.get(name)) return true;
      }
    }
  } catch {}

  const clean = canonicalShellPath(null, value);

  for (const config of TOKEN_ROUTE_CONFIGS) {
    for (const routePath of array(config.paths)) {
      if (!clean.startsWith(`${routePath}/`)) continue;

      const token = clean.slice(`${routePath}/`.length).split("/")[0];
      if (text(token, "")) return true;
    }
  }

  return false;
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value = "") {
  let output = text(value, "");

  if (!output) return "";

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const config of TOKEN_ROUTE_CONFIGS) {
    for (const routePath of array(config.paths)) {
      try {
        output = output.replace(
          new RegExp(`(${escapeRegExp(routePath)}\\/)([^/?#\\s]+)`, "gi"),
          "$1***"
        );
      } catch {}
    }
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi, "$1$2***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function isDomNodeLike(value) {
  if (!value || typeof value !== "object") return false;

  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {}

  return Boolean(value.nodeType && value.nodeName);
}

function sanitize(value, depth = 0) {
  if (depth > 5) return "[MaxDepth]";

  if (typeof value === "string") return redact(value);

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (isDomNodeLike(value)) {
    return {
      node: text(value.nodeName, "Node"),
      id: text(value.id, ""),
      className: text(value.className?.baseVal || value.className, "").slice(0, SNAPSHOT_CLASS_MAX),
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

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitize(item, depth + 1));
  }

  if (isObject(value)) {
    const out = {};

    for (const [key, item] of Object.entries(value).slice(0, 140)) {
      if (/token|secret|password|authorization|credential|jwt|bearer|session|refresh/i.test(key)) {
        out[key] = item ? "***" : item;
        continue;
      }

      out[key] = sanitize(item, depth + 1);
    }

    return out;
  }

  return String(value);
}

function log(AppCore, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.log?.("[AppShell]", ...clean);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) console.log("[AppShell]", ...clean);
  } catch {}
}

function warn(AppCore, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.warn?.("[AppShell]", ...clean);
    return;
  } catch {}

  try {
    console.warn("[AppShell]", ...clean);
  } catch {}
}

function normalizeError(error = null) {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      name: "ShellError",
      message: redact(error),
      code: "SHELL_ERROR",
    };
  }

  const source = object(error);

  return {
    name: text(source.name, "ShellError"),
    message: redact(text(source.message || error, "Error en App Shell.")),
    code: text(source.code || source.status || source.statusCode, "SHELL_ERROR"),
  };
}

function emit(AppCore, name = "", payload = {}, options = {}) {
  const eventName = text(name, "");

  if (!eventName) return false;

  const detail = sanitize(payload);

  let hasBus = false;
  let emitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      hasBus = true;
      AppCore.events.emit(eventName, detail);
      emitted = true;
    }
  } catch {}

  if ((options.window === true || !hasBus) && isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
      emitted = true;
    } catch {}
  }

  return emitted;
}

function emitShellEvent(AppCore, name = "", payload = {}, options = {}) {
  const opts = object(options);

  if (opts.dedupe === false) {
    return emit(AppCore, name, {
      version: SHELL_VERSION,
      source: SOURCE,
      at: iso(),
      ...object(payload),
    }, opts);
  }

  const key = [
    text(name, ""),
    payload?.chromeVisible ? "chrome-visible" : "chrome-hidden",
    payload?.appShellVisible ? "shell-visible" : "shell-hidden",
    payload?.authLike ? "auth" : "app",
    payload?.busy ? "busy" : "idle",
    text(payload?.canonical || payload?.snapshot?.canonical, ""),
    text(payload?.publicPath || payload?.snapshot?.publicPath, ""),
  ].join("|");

  const stamp = now();

  if (key === lastEventKey && stamp - lastEventAt < EVENT_DEDUPE_MS) {
    return false;
  }

  lastEventKey = key;
  lastEventAt = stamp;

  return emit(AppCore, name, {
    version: SHELL_VERSION,
    source: SOURCE,
    at: iso(),
    ...object(payload),
  }, opts);
}

function recordError(AppCore, source = "shell", error = null) {
  lastError = {
    source: text(source, "shell"),
    error: normalizeError(error),
    at: iso(),
  };

  warn(AppCore, "Shell error:", lastError);
  emit(AppCore, EVENTS.error, lastError);

  return lastError;
}

/* =========================================================
   DOM
========================================================= */

function contains(element) {
  if (!isBrowser() || !element) return false;

  try {
    return document.contains(element);
  } catch {
    return false;
  }
}

function queryFirst(selectors = []) {
  if (!isBrowser()) return null;

  for (const selector of array(selectors)) {
    const clean = text(selector, "");

    if (!clean) continue;

    try {
      const element = clean.startsWith("#")
        ? document.getElementById(clean.slice(1))
        : document.querySelector(clean);

      if (element) return element;
    } catch {}
  }

  return null;
}

function ensureCoreDom(AppCore) {
  try {
    if (!AppCore) return null;

    if (!AppCore.dom && isExtensibleObject(AppCore)) {
      AppCore.dom = {};
    }

    return isObject(AppCore.dom) ? AppCore.dom : null;
  } catch {
    return null;
  }
}

function assignDom(AppCore, payload = {}) {
  const dom = ensureCoreDom(AppCore);

  if (!dom) return false;

  try {
    Object.assign(dom, object(payload));
    return true;
  } catch {
    return false;
  }
}

function clearDomCache(AppCore) {
  const dom = ensureCoreDom(AppCore);

  if (!dom) return false;

  for (const key of [
    "appShell",
    "shell",
    "mainContent",
    "main",
    "appContent",
    "viewContainer",
    "viewRoot",
    "routerView",
    "sidebarMount",
    "topbarMount",
    "sidebar",
    "topbar",
    "tablehead",
    "tableHead",
    "tableheadContainer",
    "tableHeadContainer",
    "sidebarMobileToggle",
    "mobileSidebarToggle",
    "loader",
    "appLoader",
  ]) {
    try {
      delete dom[key];
    } catch {}
  }

  return true;
}

function domElement(AppCore, key = "", selectors = []) {
  if (!isBrowser()) return null;

  try {
    const cached = AppCore?.dom?.[key];

    if (cached && contains(cached)) return cached;
  } catch {}

  const found = queryFirst(selectors);

  if (found) {
    assignDom(AppCore, { [key]: found });
  }

  return found;
}

function setDataset(element, key, value) {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete element.dataset[key];
      return true;
    }

    const next = String(value);

    if (element.dataset[key] !== next) {
      element.dataset[key] = next;
    }

    return true;
  } catch {
    return false;
  }
}

function setAttribute(element, key, value) {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined) {
      element.removeAttribute(key);
      return true;
    }

    const next = String(value);

    if (element.getAttribute(key) !== next) {
      element.setAttribute(key, next);
    }

    return true;
  } catch {
    return false;
  }
}

function toggleClass(element, className, enabled) {
  if (!element || !className) return false;

  try {
    const next = Boolean(enabled);

    if (element.classList.contains(className) !== next) {
      element.classList.toggle(className, next);
    }

    return true;
  } catch {
    return false;
  }
}

function addRemoveClasses(element, add = [], remove = []) {
  if (!element) return false;

  try {
    if (array(remove).length) element.classList.remove(...array(remove));
    if (array(add).length) element.classList.add(...array(add));
    return true;
  } catch {
    return false;
  }
}

function setHidden(element, hidden = false) {
  if (!element) return false;

  const next = Boolean(hidden);

  try {
    if (element.hidden !== next) element.hidden = next;
  } catch {}

  setAttribute(element, "aria-hidden", next ? "true" : "false");

  return true;
}

function setBusy(element, busy = false) {
  if (!element) return false;

  setAttribute(element, "aria-busy", Boolean(busy) ? "true" : "false");

  return true;
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      html: null,
      body: null,

      appShell: null,
      mainContent: null,
      appContent: null,
      viewContainer: null,

      sidebarMount: null,
      topbarMount: null,

      sidebar: null,
      topbar: null,

      tablehead: null,
      tableheadContainer: null,
      mobileSidebarToggle: null,

      loader: null,
    };
  }

  const appShell = domElement(AppCore, "appShell", SELECTORS.appShell);
  const mainContent = domElement(AppCore, "mainContent", SELECTORS.mainContent);
  const appContent = domElement(AppCore, "appContent", SELECTORS.appContent);
  const viewContainer = domElement(AppCore, "viewContainer", SELECTORS.viewContainer);

  const sidebarMount = domElement(AppCore, "sidebarMount", SELECTORS.sidebarMount);
  const topbarMount = domElement(AppCore, "topbarMount", SELECTORS.topbarMount);

  const sidebar = domElement(AppCore, "sidebar", SELECTORS.sidebar);
  const topbar = domElement(AppCore, "topbar", SELECTORS.topbar);

  const tablehead = domElement(AppCore, "tablehead", SELECTORS.tablehead);
  const tableheadContainer = domElement(AppCore, "tableheadContainer", SELECTORS.tableheadContainer);

  const mobileSidebarToggle =
    domElement(AppCore, "sidebarMobileToggle", SELECTORS.mobileSidebarToggle) ||
    domElement(AppCore, "mobileSidebarToggle", SELECTORS.mobileSidebarToggle);

  const loader = domElement(AppCore, "loader", SELECTORS.loader);

  assignDom(AppCore, {
    html: document.documentElement || null,
    body: document.body || null,

    appShell,
    shell: appShell,

    mainContent,
    main: mainContent,

    appContent,

    viewContainer,
    viewRoot: viewContainer,
    routerView: viewContainer,

    sidebarMount,
    topbarMount,

    sidebar,
    topbar,

    tablehead,
    tableHead: tablehead,

    tableheadContainer,
    tableHeadContainer: tableheadContainer,

    sidebarMobileToggle: mobileSidebarToggle,
    mobileSidebarToggle,

    loader,
    appLoader: loader,
  });

  return {
    html: document.documentElement || null,
    body: document.body || null,

    appShell,
    mainContent,
    appContent,
    viewContainer,

    sidebarMount,
    topbarMount,

    sidebar,
    topbar,

    tablehead,
    tableheadContainer,
    mobileSidebarToggle,

    loader,
  };
}

export function getViewContainer(AppCore) {
  const element = getShellElements(AppCore).viewContainer;

  if (element) {
    assignDom(AppCore, {
      viewContainer: element,
      viewRoot: element,
      routerView: element,
    });
  }

  return element;
}

/* =========================================================
   STATE / FLAGS
========================================================= */

function state(AppCore) {
  return object(AppCore?.state);
}

function setCoreState(AppCore, payload = {}) {
  const patch = object(payload);

  try {
    AppCore?.setState?.(patch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      silent: true,
    });
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, patch);
    }
  } catch {}

  return patch;
}

function hasBootClass() {
  if (!isBrowser()) return false;

  try {
    return CLASSES.boot.some((className) => (
      document.body?.classList?.contains(className) ||
      document.documentElement?.classList?.contains(className)
    ));
  } catch {
    return false;
  }
}

function isBootingOrLoading(AppCore) {
  const current = state(AppCore);

  return Boolean(
    current.booting ||
      current.loading ||
      current.appBooting ||
      current.bootInProgress ||
      current.loaderVisible ||
      current.sessionRestoring ||
      current.authRestoring ||
      hasBootClass()
  );
}

function hasClass(element, classNames = []) {
  if (!element) return false;

  try {
    return array(classNames).some((className) => element.classList.contains(className));
  } catch {
    return false;
  }
}

function isLoaderVisible(AppCore) {
  const { loader } = getShellElements(AppCore);

  if (!loader) return false;

  try {
    if (loader.hidden) return false;
    if (loader.getAttribute("aria-hidden") === "true") return false;
    if (hasClass(loader, CLASSES.loaderHidden)) return false;
    if (text(loader.dataset?.loaderVisible, "") === "false") return false;

    const loaderState = text(loader.dataset?.loaderState, "");

    if (loaderState === "hidden" || loaderState === "removed") return false;

    return true;
  } catch {
    return false;
  }
}

function hasContent(element) {
  if (!element) return false;

  try {
    if (element.childElementCount > 0) return true;
  } catch {}

  try {
    return Boolean(text(element.textContent, ""));
  } catch {
    return false;
  }
}

function tableheadHasContent(tableheadContainer) {
  return hasContent(tableheadContainer);
}

/* =========================================================
   SHELL DOM STATE
========================================================= */

function setShellBusy(AppCore, busy = false) {
  const { appShell, mainContent, appContent, viewContainer } = getShellElements(AppCore);

  for (const element of [appShell, mainContent, appContent, viewContainer]) {
    setBusy(element, busy);
  }

  return Boolean(busy);
}

function applyRootState(root, {
  chromeVisible = true,
  authLike = false,
  appShellVisible = true,
} = {}) {
  if (!root) return false;

  const chrome = Boolean(chromeVisible);
  const auth = Boolean(authLike);
  const shellVisible = appShellVisible !== false;

  toggleClass(root, CLASSES.routeAuth, auth);
  toggleClass(root, CLASSES.routeApp, !auth);

  toggleClass(root, CLASSES.authScreen, auth);
  toggleClass(root, CLASSES.loginNoScroll, auth);

  toggleClass(root, CLASSES.chromeHidden, !chrome);
  toggleClass(root, CLASSES.chromeVisible, chrome);

  toggleClass(root, CLASSES.shellHidden, !chrome);
  toggleClass(root, CLASSES.shellVisible, shellVisible);

  if (auth && root === document.body) {
    addRemoveClasses(root, [], CLASSES.sidebarResidual);
  }

  setDataset(root, "shell", shellVisible ? "visible" : "hidden");
  setDataset(root, "chrome", chrome ? "visible" : "hidden");
  setDataset(root, "routeMode", auth ? "auth" : "app");
  setDataset(root, "authScreen", auth ? "true" : "false");
  setDataset(root, "appShellVisible", shellVisible ? "true" : "false");

  return true;
}

function applyElementDataset(element, {
  chromeVisible = true,
  authLike = false,
  appShellVisible = true,
} = {}) {
  if (!element) return false;

  setDataset(element, "shell", appShellVisible !== false ? "visible" : "hidden");
  setDataset(element, "chrome", chromeVisible ? "visible" : "hidden");
  setDataset(element, "routeMode", authLike ? "auth" : "app");
  setDataset(element, "appShellVisible", appShellVisible !== false ? "true" : "false");

  return true;
}

function markShellDomState(AppCore, {
  chromeVisible = true,
  authLike = false,
  busy = false,
  appShellVisible = true,
} = {}) {
  const elements = getShellElements(AppCore);

  const chrome = Boolean(chromeVisible);
  const auth = Boolean(authLike);
  const shellVisible = appShellVisible !== false;

  applyRootState(elements.body, {
    chromeVisible: chrome,
    authLike: auth,
    appShellVisible: shellVisible,
  });

  applyRootState(elements.html, {
    chromeVisible: chrome,
    authLike: auth,
    appShellVisible: shellVisible,
  });

  for (const element of [
    elements.appShell,
    elements.mainContent,
    elements.appContent,
    elements.viewContainer,
    elements.sidebarMount,
    elements.topbarMount,
    elements.sidebar,
    elements.topbar,
    elements.tablehead,
    elements.tableheadContainer,
  ]) {
    applyElementDataset(element, {
      chromeVisible: chrome,
      authLike: auth,
      appShellVisible: shellVisible,
    });
  }

  if (shellVisible) {
    setHidden(elements.appShell, false);
    setHidden(elements.mainContent, false);
    setHidden(elements.appContent, false);
    setHidden(elements.viewContainer, false);
  } else {
    setHidden(elements.appShell, true);
  }

  setShellBusy(AppCore, busy);

  return {
    appShellVisible: shellVisible,
    chromeVisible: chrome,
    authLike: auth,
    busy: Boolean(busy),
  };
}

export function readShellVisibility(AppCore) {
  const current = state(AppCore);

  if (typeof current.chromeVisible === "boolean") {
    return current.chromeVisible;
  }

  const {
    body,
    html,
    sidebarMount,
    topbarMount,
    sidebar,
    topbar,
  } = getShellElements(AppCore);

  const bodyChrome = text(body?.dataset?.chrome, "");
  if (bodyChrome === "visible") return true;
  if (bodyChrome === "hidden") return false;

  const htmlChrome = text(html?.dataset?.chrome, "");
  if (htmlChrome === "visible") return true;
  if (htmlChrome === "hidden") return false;

  try {
    if (
      body?.classList?.contains(CLASSES.chromeHidden) ||
      html?.classList?.contains(CLASSES.chromeHidden)
    ) {
      return false;
    }
  } catch {}

  if (sidebarMount?.hidden || topbarMount?.hidden || sidebar?.hidden || topbar?.hidden) {
    return false;
  }

  return true;
}

/* =========================================================
   ROUTES
========================================================= */

export function isLoginPath(AppCore, path = "") {
  return pathMatches(LOGIN_PATHS, path, { allowPrefix: false });
}

export function isResetPasswordPath(AppCore, path = "") {
  return pathMatches(RESET_PATHS, path, { allowPrefix: false });
}

export function isResetPasswordConfirmPath(AppCore, path = "") {
  return pathMatches(RESET_CONFIRM_PATHS, path, { allowPrefix: true });
}

export function isActivateAccountPath(AppCore, path = "") {
  return pathMatches(ACTIVATION_PATHS, path, { allowPrefix: true });
}

export function isAuthLikePath(AppCore, path = "") {
  if (pathMatches(AUTH_PATHS, path, { allowPrefix: false })) return true;
  return pathMatches(AUTH_PREFIXES, path, { allowPrefix: true });
}

function routeRequestsHiddenChrome(route = null) {
  const meta = object(route?.meta);

  return Boolean(
    route?.hideShell === true ||
      route?.shell === false ||
      route?.showShell === false ||
      route?.layout === "auth" ||
      route?.layout === "public" ||
      route?.chrome === false ||
      route?.showChrome === false ||
      route?.hideChrome === true ||
      meta.hideShell === true ||
      meta.shell === false ||
      meta.showShell === false ||
      meta.layout === "auth" ||
      meta.layout === "public" ||
      meta.chrome === false ||
      meta.showChrome === false ||
      meta.hideChrome === true
  );
}

function routerRoute(AppCore, Router, canonical = "") {
  try {
    if (isFn(Router?.getRoute)) {
      return Router.getRoute(canonical || getCurrentCanonicalPath(AppCore, Router));
    }
  } catch {}

  try {
    if (isFn(Router?.currentRoute)) {
      return Router.currentRoute();
    }
  } catch {}

  return Router?.route || Router?.current || null;
}

function currentCanonical(AppCore, Router) {
  try {
    const value = getCurrentCanonicalPath(AppCore, Router);
    if (value) return canonicalShellPath(AppCore, value);
  } catch {}

  try {
    const value = Router?.getCurrentCanonicalPath?.();
    if (value) return canonicalShellPath(AppCore, value);
  } catch {}

  return canonicalShellPath(
    AppCore,
    state(AppCore).route ||
      state(AppCore).publicPath ||
      browserPath() ||
      DEFAULT_ROUTE
  );
}

function currentPublic(AppCore, Router) {
  try {
    const value = getCurrentPublicPath(AppCore, Router);
    if (value) return publicShellPath(AppCore, value);
  } catch {}

  try {
    const value = Router?.getCurrentPublicPath?.();
    if (value) return publicShellPath(AppCore, value);
  } catch {}

  return publicShellPath(
    AppCore,
    state(AppCore).publicPath ||
      browserPath() ||
      state(AppCore).route ||
      DEFAULT_ROUTE
  );
}

export function isAuthLikeRoute(AppCore, Router) {
  const canonical = currentCanonical(AppCore, Router);
  const publicValue = currentPublic(AppCore, Router);
  const browserValue = publicShellPath(AppCore, browserPath());

  const route = routerRoute(AppCore, Router, canonical);

  if (routeRequestsHiddenChrome(route)) return true;

  return [canonical, publicValue, browserValue].some((path) => isAuthLikePath(AppCore, path));
}

/* =========================================================
   VISIBILITY
========================================================= */

export function setShellVisibility(AppCore, visible = true, options = {}) {
  const opts = object(options);

  const nextChromeVisible = Boolean(visible);
  const previousChromeVisible = readShellVisibility(AppCore);

  const authLike = opts.authLike !== undefined
    ? Boolean(opts.authLike)
    : !nextChromeVisible;

  const busy = opts.busy !== undefined
    ? Boolean(opts.busy)
    : isBootingOrLoading(AppCore);

  const appShellVisible = opts.hideAppShell === true
    ? false
    : true;

  const elements = getShellElements(AppCore);
  const chromeHidden = !nextChromeVisible;
  const hasTablehead = tableheadHasContent(elements.tableheadContainer);

  for (const element of [
    elements.sidebarMount,
    elements.topbarMount,
    elements.sidebar,
    elements.topbar,
  ]) {
    setHidden(element, chromeHidden);
  }

  setHidden(elements.tablehead, chromeHidden || !hasTablehead);
  setHidden(elements.tableheadContainer, chromeHidden);

  if (elements.mobileSidebarToggle) {
    setHidden(elements.mobileSidebarToggle, chromeHidden);
    setAttribute(elements.mobileSidebarToggle, "aria-expanded", "false");
  }

  const domState = markShellDomState(AppCore, {
    chromeVisible: nextChromeVisible,
    authLike,
    busy,
    appShellVisible,
  });

  const canonical = canonicalShellPath(
    AppCore,
    opts.canonicalPath ||
      state(AppCore).route ||
      DEFAULT_ROUTE
  );

  const publicValue = publicShellPath(
    AppCore,
    opts.publicPath ||
      state(AppCore).publicPath ||
      canonical ||
      DEFAULT_ROUTE
  );

  setCoreState(AppCore, {
    shellVisible: domState.appShellVisible,
    shellHidden: !domState.appShellVisible,
    appShellVisible: domState.appShellVisible,

    chromeVisible: nextChromeVisible,
    routeShellHidden: !nextChromeVisible,

    shellAuthLike: authLike,
    authScreen: authLike,
    routeMode: authLike ? "auth" : "app",

    shellBusy: busy,

    currentShellRoute: canonical,
    currentShellCanonicalPath: canonical,
    currentShellPublicPath: publicValue,
    shellUpdatedAt: iso(),
  });

  if (opts.emit !== false) {
    const snapshot = getShellSnapshot(AppCore, opts.Router || null);

    const payload = {
      reason: text(opts.reason, "set-shell-visibility"),

      hidden: chromeHidden,
      visible: nextChromeVisible,
      chromeVisible: nextChromeVisible,
      appShellVisible: domState.appShellVisible,

      changed: Boolean(
        opts.force ||
          previousChromeVisible !== nextChromeVisible ||
          opts.forceChromeSync === true
      ),

      authLike,
      busy,

      canonical: snapshot.canonical,
      publicPath: snapshot.publicPath,
      snapshot,
    };

    emitShellEvent(AppCore, EVENTS.change, payload);
    emitShellEvent(AppCore, EVENTS.state, payload);
    emitShellEvent(AppCore, EVENTS.appState, payload);
  }

  return nextChromeVisible;
}

export function updateShellVisibilityByRoute(AppCore, Router, options = {}) {
  const opts = object(options);

  const canonical = canonicalShellPath(
    AppCore,
    opts.canonicalPath ||
      currentCanonical(AppCore, Router) ||
      state(AppCore).route ||
      DEFAULT_ROUTE
  );

  const publicValue = publicShellPath(
    AppCore,
    opts.publicPath ||
      currentPublic(AppCore, Router) ||
      state(AppCore).publicPath ||
      browserPath() ||
      canonical ||
      DEFAULT_ROUTE
  );

  const route = opts.route || routerRoute(AppCore, Router, canonical);

  const tokenRoute = Boolean(
    routeHasToken(publicValue) ||
      routeHasToken(canonical) ||
      routeHasToken(browserPath())
  );

  const authLike = opts.authLike !== undefined
    ? Boolean(opts.authLike)
    : Boolean(
        routeRequestsHiddenChrome(route) ||
          isAuthLikeRoute(AppCore, Router)
      );

  return setShellVisibility(AppCore, !authLike, {
    ...opts,

    Router,
    route,

    canonicalPath: canonical,
    publicPath: publicValue,

    authLike,
    hideAppShell: false,
    tokenRoute,

    reason: opts.reason || "update-shell-visibility-by-route",
  });
}

/* =========================================================
   LOADER POLICY
========================================================= */

function hideLoaderFallback(AppCore) {
  const { loader } = getShellElements(AppCore);

  if (!loader) return false;

  try {
    loader.hidden = true;

    addRemoveClasses(loader, CLASSES.loaderHidden, CLASSES.loaderVisible);

    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");

    loader.dataset.loaderVisible = "false";
    loader.dataset.loaderState = "hidden";

    return true;
  } catch {
    return false;
  }
}

function hideLoaderSafe(AppCore, hideLoader, options = {}) {
  const opts = object(options);

  if ((isBootingOrLoading(AppCore) || hasBootClass()) && opts.force !== true) {
    return false;
  }

  try {
    if (isFn(hideLoader)) {
      hideLoader(AppCore, {
        reason: opts.reason || "shell-post-render",
        minVisibleMs: opts.minVisibleMs,
        allowDuringBoot: opts.force === true,
        force: opts.force === true,
      });

      return true;
    }
  } catch (error) {
    recordError(AppCore, "hideLoader", error);
  }

  return hideLoaderFallback(AppCore);
}

export function applyPostRenderLoaderPolicy({
  AppCore,
  Router,
  hideLoader,
  forceHideLoader = false,
  hideLoaderOnPostRender = true,
  minVisibleMs = undefined,
} = {}) {
  const view = getViewContainer(AppCore);
  const hasViewContent = hasContent(view);
  const authLike = isAuthLikeRoute(AppCore, Router);
  const bootBusy = isBootingOrLoading(AppCore) || hasBootClass();

  const chromeVisible = updateShellVisibilityByRoute(AppCore, Router, {
    authLike,
    busy: !hasViewContent || bootBusy,
    hideAppShell: false,
    forceChromeSync: true,
    reason: "post-render-policy",
  });

  const canHideLoader = Boolean(
    hideLoaderOnPostRender !== false &&
      (authLike || hasViewContent)
  );

  const loaderHidden = canHideLoader
    ? hideLoaderSafe(AppCore, hideLoader, {
        force: forceHideLoader === true,
        reason: "post-render",
        minVisibleMs,
      })
    : false;

  if (hasViewContent) {
    setShellBusy(AppCore, bootBusy);
  }

  const snapshot = getShellSnapshot(AppCore, Router);

  emitShellEvent(AppCore, EVENTS.postRender, {
    authLike,
    hasViewContent,

    shellVisible: snapshot.appShellVisible,
    appShellVisible: snapshot.appShellVisible,
    chromeVisible,

    loaderHidden,
    loaderVisible: isLoaderVisible(AppCore),

    bootBusy,

    canonical: snapshot.canonical,
    publicPath: snapshot.publicPath,

    snapshot,
  });

  return snapshot;
}

/* =========================================================
   READY / BUSY
========================================================= */

export function markShellReady(AppCore, options = {}) {
  const opts = object(options);
  const Router = opts.Router || null;

  const authLike = opts.authLike !== undefined
    ? Boolean(opts.authLike)
    : isAuthLikeRoute(AppCore, Router);

  setShellBusy(AppCore, false);

  markShellDomState(AppCore, {
    chromeVisible: opts.chromeVisible !== undefined
      ? Boolean(opts.chromeVisible)
      : readShellVisibility(AppCore),
    authLike,
    busy: false,
    appShellVisible: opts.appShellVisible !== false,
  });

  setCoreState(AppCore, {
    shellBusy: false,
    shellReady: true,
    shellReadyAt: iso(),

    appShellVisible: opts.appShellVisible !== false,
    shellVisible: opts.appShellVisible !== false,
    shellHidden: opts.appShellVisible === false,
  });

  emitShellEvent(AppCore, EVENTS.ready, {
    snapshot: getShellSnapshot(AppCore, Router),
  });

  return true;
}

export function markShellBusy(AppCore, options = {}) {
  const opts = object(options);

  setShellBusy(AppCore, true);

  markShellDomState(AppCore, {
    chromeVisible: opts.chromeVisible !== undefined
      ? Boolean(opts.chromeVisible)
      : readShellVisibility(AppCore),
    authLike: Boolean(opts.authLike),
    busy: true,
    appShellVisible: opts.appShellVisible !== false,
  });

  setCoreState(AppCore, {
    shellBusy: true,
    appShellVisible: opts.appShellVisible !== false,
    shellVisible: opts.appShellVisible !== false,
    shellHidden: opts.appShellVisible === false,
  });

  emitShellEvent(AppCore, EVENTS.busy, {
    snapshot: getShellSnapshot(AppCore, opts.Router || null),
  });

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function elementSnapshot(element) {
  if (!element) return { exists: false };

  return {
    exists: true,

    id: text(element.id, ""),
    tag: text(element.tagName?.toLowerCase?.(), ""),

    hidden: Boolean(element.hidden),

    ariaHidden: text(element.getAttribute?.("aria-hidden"), ""),
    ariaBusy: text(element.getAttribute?.("aria-busy"), ""),

    datasetShell: text(element.dataset?.shell, ""),
    datasetChrome: text(element.dataset?.chrome, ""),
    datasetRouteMode: text(element.dataset?.routeMode, ""),
    datasetShellInteractive: text(element.dataset?.shellInteractive, ""),
    datasetAppShellVisible: text(element.dataset?.appShellVisible, ""),
    datasetLoaderVisible: text(element.dataset?.loaderVisible, ""),
    datasetLoaderState: text(element.dataset?.loaderState, ""),

    className: text(element.className?.baseVal || element.className, "").slice(0, SNAPSHOT_CLASS_MAX),

    childCount: (() => {
      try {
        return element.children?.length || 0;
      } catch {
        return 0;
      }
    })(),
  };
}

export function getShellSnapshot(AppCore, Router = null) {
  const elements = getShellElements(AppCore);
  const currentState = state(AppCore);

  const canonical = canonicalShellPath(
    AppCore,
    currentCanonical(AppCore, Router) ||
      currentState.route ||
      DEFAULT_ROUTE
  );

  const publicValue = publicShellPath(
    AppCore,
    currentPublic(AppCore, Router) ||
      currentState.publicPath ||
      DEFAULT_ROUTE
  );

  const chromeVisible = readShellVisibility(AppCore);

  const appShellVisible = elements.appShell
    ? !elements.appShell.hidden && elements.appShell.getAttribute("aria-hidden") !== "true"
    : false;

  return {
    version: SHELL_VERSION,

    shellVisible: appShellVisible,
    appShellVisible,

    chromeVisible,
    routeShellHidden: !chromeVisible,

    authLike: isAuthLikeRoute(AppCore, Router),

    tokenRoute: Boolean(
      routeHasToken(canonical) ||
        routeHasToken(publicValue) ||
        routeHasToken(browserPath())
    ),

    canonical: redact(canonical),
    publicPath: redact(publicValue),
    browserPath: redact(browserPath()),

    booting: Boolean(currentState.booting),
    loading: Boolean(currentState.loading),
    ready: Boolean(currentState.ready || currentState.appReady),

    bootBusy: isBootingOrLoading(AppCore),
    bodyBootClass: hasBootClass(),

    loaderVisible: isLoaderVisible(AppCore),

    elements: {
      appShell: elementSnapshot(elements.appShell),
      mainContent: elementSnapshot(elements.mainContent),
      appContent: elementSnapshot(elements.appContent),
      viewContainer: elementSnapshot(elements.viewContainer),

      sidebarMount: elementSnapshot(elements.sidebarMount),
      topbarMount: elementSnapshot(elements.topbarMount),

      sidebar: elementSnapshot(elements.sidebar),
      topbar: elementSnapshot(elements.topbar),

      tablehead: elementSnapshot(elements.tablehead),
      tableheadContainer: elementSnapshot(elements.tableheadContainer),

      mobileSidebarToggle: elementSnapshot(elements.mobileSidebarToggle),
      loader: elementSnapshot(elements.loader),
    },

    appShellExists: Boolean(elements.appShell),
    appShellHidden: Boolean(elements.appShell?.hidden),
    appShellBusy: text(elements.appShell?.getAttribute?.("aria-busy"), ""),

    mainContentExists: Boolean(elements.mainContent),
    appContentExists: Boolean(elements.appContent),

    hasView: Boolean(elements.viewContainer),
    hasViewContent: hasContent(elements.viewContainer),

    sidebarMountExists: Boolean(elements.sidebarMount),
    sidebarMountHidden: Boolean(elements.sidebarMount?.hidden),

    topbarMountExists: Boolean(elements.topbarMount),
    topbarMountHidden: Boolean(elements.topbarMount?.hidden),

    sidebarExists: Boolean(elements.sidebar),
    sidebarHidden: Boolean(elements.sidebar?.hidden),

    topbarExists: Boolean(elements.topbar),
    topbarHidden: Boolean(elements.topbar?.hidden),

    tableheadExists: Boolean(elements.tablehead),
    tableheadHidden: Boolean(elements.tablehead?.hidden),

    tableheadContainerExists: Boolean(elements.tableheadContainer),
    tableheadContainerHidden: Boolean(elements.tableheadContainer?.hidden),
    tableheadHasContent: tableheadHasContent(elements.tableheadContainer),

    mobileSidebarToggleExists: Boolean(elements.mobileSidebarToggle),
    mobileSidebarToggleHidden: Boolean(elements.mobileSidebarToggle?.hidden),

    loaderExists: Boolean(elements.loader),
    loaderHidden: Boolean(elements.loader?.hidden),

    bodyShell: text(elements.body?.dataset?.shell, ""),
    htmlShell: text(elements.html?.dataset?.shell, ""),

    bodyChrome: text(elements.body?.dataset?.chrome, ""),
    htmlChrome: text(elements.html?.dataset?.chrome, ""),

    bodyRouteMode: text(elements.body?.dataset?.routeMode, ""),
    htmlRouteMode: text(elements.html?.dataset?.routeMode, ""),

    bodyClasses: classListArray(elements.body?.classList),
    htmlClasses: classListArray(elements.html?.classList),

    lastShellEventKey: redact(lastEventKey),
    lastShellEventAt: lastEventAt,
    lastShellEventAtIso: lastEventAt ? iso(lastEventAt) : "",

    lastShellError: lastError,

    debugApiInstalled: Boolean(debugApiInstalled),

    at: iso(),
  };
}

/* =========================================================
   DEBUG / MAINTENANCE
========================================================= */

function attachDebugApi(AppCore = null, api = null) {
  if (!api) return false;

  try {
    if (isBrowser()) {
      window[RUNTIME_KEY] = api;
      window.__ONION_APP_SHELL__ = api;
    }
  } catch {}

  try {
    if (AppCore && typeof AppCore === "object" && Object.isExtensible(AppCore)) {
      Object.defineProperty(AppCore, "Shell", {
        value: api,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }
  } catch {}

  try {
    if (isFn(AppCore?.modules?.register)) {
      AppCore.modules.register("Shell", api, {
        aliases: ["shell", "AppShell", "appShell"],
        overwrite: false,
        replace: false,
        source: SOURCE,
      });
    }
  } catch {}

  return true;
}

export function exposeShellDebugApi(AppCore = null) {
  if (debugApiInstalled && debugApiRef) {
    attachDebugApi(AppCore, debugApiRef);
    return debugApiRef;
  }

  const api = {
    version: SHELL_VERSION,

    getElements() {
      return getShellElements(AppCore);
    },

    getSnapshot(Router = null) {
      return getShellSnapshot(AppCore, Router);
    },

    refresh() {
      return refreshShellElements(AppCore);
    },

    reset() {
      return resetShellRuntimeState(AppCore);
    },

    clearCache() {
      clearDomCache(AppCore);
      return refreshShellElements(AppCore);
    },

    setVisible(visible = true, options = {}) {
      return setShellVisibility(AppCore, visible, options);
    },

    updateByRoute(Router = null, options = {}) {
      return updateShellVisibilityByRoute(AppCore, Router, options);
    },
  };

  debugApiRef = api;
  debugApiInstalled = true;

  attachDebugApi(AppCore, api);

  emitShellEvent(AppCore, EVENTS.debugApi, {
    installed: true,
  }, {
    dedupe: false,
  });

  return api;
}

export function refreshShellElements(AppCore) {
  const elements = getShellElements(AppCore);

  exposeShellDebugApi(AppCore);

  emitShellEvent(AppCore, EVENTS.elements, {
    snapshot: getShellSnapshot(AppCore),
  }, {
    dedupe: false,
  });

  return elements;
}

export function resetShellRuntimeState(AppCore) {
  setCoreState(AppCore, {
    shellVisible: true,
    shellHidden: false,
    appShellVisible: true,

    chromeVisible: true,
    routeShellHidden: false,

    shellAuthLike: false,
    authScreen: false,

    shellBusy: false,
    shellReady: false,

    routeMode: "app",
  });

  markShellDomState(AppCore, {
    chromeVisible: true,
    authLike: false,
    busy: false,
    appShellVisible: true,
  });

  exposeShellDebugApi(AppCore);

  log(AppCore, "Shell runtime reset.");

  return getShellSnapshot(AppCore);
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  SHELL_VERSION,

  getShellElements,
  getViewContainer,

  readShellVisibility,
  setShellVisibility,

  isLoginPath,
  isResetPasswordPath,
  isResetPasswordConfirmPath,
  isActivateAccountPath,
  isAuthLikePath,
  isAuthLikeRoute,

  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,

  markShellReady,
  markShellBusy,

  refreshShellElements,
  resetShellRuntimeState,
  exposeShellDebugApi,

  getShellSnapshot,
};
