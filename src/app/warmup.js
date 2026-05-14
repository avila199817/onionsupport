/* =========================================================
   Onion SPA - App Warmup
   Archivo: /src/app/warmup.js

   ONION SUPPORT · APP WARMUP DIAGNOSTICS
   RESTORE TRACE · ROUTER/SHELL/LOADER SNAPSHOT · 10/10

   RESPONSABILIDADES:
   - Ejecutar diagnóstico inicial seguro.
   - Registrar estado real tras restoreSession.
   - Facilitar trazabilidad del arranque.
   - No mutar estado de aplicación salvo API debug opcional no enumerable.
   - No tocar sesión/token/storage salvo lectura segura.
   - No exponer tokens en logs/eventos/snapshots.
   - Resolver dependencias desde argumentos, AppCore o registry.
   - Emitir snapshot útil para depuración.
   - Exponer API debug opcional.

   HARDENING:
   - Compatible con warmup(AppCore) y warmup({ AppCore, ... }).
   - Logs consistentes y redacted.
   - Safe emit sin duplicar AppCore.events + window.
   - Snapshot de app/auth/router/store/i18n/ui/shell/loader/history.
   - Detección de rutas públicas técnicas con token.
   - Soporte /@usuario/activate-account y /@usuario/reset-password/confirm.
   - Soporte aliases legacy de activation/reset.
   - Soporte hash-router: /#/login, /#/activate-account?token=...
   - No exige Router.render si existe navigate/go/push/rerender.
   - No avisa I18N_MISSING si hay state.lang/document.lang/i18nInitialized.
   - Warnings sólo para problemas accionables reales.
   - Dedupe de warnings/eventos/logs.
   - Cero throws accidentales.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const WARMUP_VERSION = "15.0.0-extreme-pro";

const WARMUP_LABEL = "[AppWarmup]";

const DEFAULT_LANG = "es";
const DEFAULT_THEME = "light";
const DEFAULT_ROUTE = "/";

const WARMUP_WARNING_DEDUPE_MS = 1200;
const WARMUP_LOG_DEDUPE_MS = 800;
const WARMUP_EVENT_DEDUPE_MS = 250;
const MAX_RECENT_SNAPSHOTS = 8;
const MAX_SANITIZE_DEPTH = 8;
const MAX_ARRAY_SNAPSHOT_ITEMS = 100;
const MAX_CLASSNAME_LENGTH = 800;

const TOKEN_PARAM_NAMES = Object.freeze([
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

const KNOWN_TOKEN_STORAGE_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "authToken",
  "refreshToken",
  "refresh_token",
  "sessionToken",
  "tempToken",
  "temporaryToken",
  "twoFactorToken",
  "mfaToken",

  "onion:token",
  "onion:accessToken",
  "onion:refreshToken",
  "onion:session",
  "onion:auth",
  "onion:auth:token",
  "onion.auth",
  "onion.session",

  "auth",
  "session",
]);

const ACTIVATION_PATHS = Object.freeze([
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
]);

const RESET_CONFIRM_PATHS = Object.freeze([
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
]);

const RESET_REQUEST_PATHS = Object.freeze([
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/password-reset/request",
  "/reset-password",
  "/reset-password/request",
  "/reset-password-request",
  "/request-reset-password",
]);

const AUTH_LIKE_PATHS = Object.freeze([
  "/login",
  "/signin",
  "/sign-in",
  "/register",
  "/signup",
  "/sign-up",

  ...RESET_REQUEST_PATHS,
  ...RESET_CONFIRM_PATHS,
  ...ACTIVATION_PATHS,
]);

const AUTH_LIKE_PREFIXES = Object.freeze([
  ...ACTIVATION_PATHS.map((path) => `${path}/`),
  ...RESET_CONFIRM_PATHS.map((path) => `${path}/`),
]);

const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    canonicalPath: "/activate-account",
    paths: ACTIVATION_PATHS,

    windowKeys: Object.freeze([
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ]),

    scrubbedFlags: Object.freeze([
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ]),

    tokenParamNames: Object.freeze([
      "token",
      "activationToken",
      "activateToken",
      "code",
      "t",
    ]),
  }),

  Object.freeze({
    key: "resetConfirm",
    canonicalPath: "/reset-password/confirm",
    paths: RESET_CONFIRM_PATHS,

    windowKeys: Object.freeze([
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ]),

    scrubbedFlags: Object.freeze([
      "scrubbedResetToken",
      "scrubbedResetPasswordToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ]),

    tokenParamNames: Object.freeze([
      "token",
      "resetToken",
      "passwordResetToken",
      "confirmToken",
      "code",
      "t",
    ]),
  }),
]);

const PUBLIC_USERNAME_RE = /^@[A-Za-z0-9._-]{1,80}$/;

const DOM_IDS = Object.freeze({
  app: "app",
  root: "app-root",
  shell: "app-shell",
  main: "main-content",
  appContent: "app-content",
  loader: "app-loader",
  viewContainer: "view-container",
  sidebarMount: "sidebar-mount",
  topbarMount: "topbar-mount",
  sidebar: "app-sidebar",
  topbar: "app-topbar",
  tablehead: "table-head",
  tableheadContainer: "tablehead-container",
  mobileSidebarToggle: "toggleSidebarMobile",
});

const DOM_SELECTORS = Object.freeze({
  app: Object.freeze([
    "#app",
    "[data-app]",
    "[data-app-root]",
  ]),

  root: Object.freeze([
    "#app-root",
    "#root",
    "[data-root]",
    "[data-app-root]",
  ]),

  shell: Object.freeze([
    "#app-shell",
    ".app-shell",
    "[data-shell]",
    "[data-app-shell]",
    "[data-app-shell='true']",
    ".layout",
  ]),

  main: Object.freeze([
    "#main-content",
    "main.main-content",
    ".main-content",
    "[data-main-content]",
  ]),

  appContent: Object.freeze([
    "#app-content",
    ".app-content",
    "[data-app-content]",
  ]),

  loader: Object.freeze([
    "#app-loader",
    "#boot-loader",
    ".app-loader",
    "[data-loader]",
    "[data-app-loader]",
    "[data-app-loader='true']",
  ]),

  viewContainer: Object.freeze([
    "#view-container",
    "#app-view",
    "#router-view",
    "[data-view-container]",
    "[data-router-view]",
    "[data-view-root]",
  ]),

  sidebarMount: Object.freeze([
    "#sidebar-mount",
    "[data-sidebar-mount]",
    "[data-sidebar-mount='true']",
  ]),

  topbarMount: Object.freeze([
    "#topbar-mount",
    "[data-topbar-mount]",
    "[data-topbar-mount='true']",
  ]),

  sidebar: Object.freeze([
    "#app-sidebar",
    "#sidebar",
    ".sidebar",
    "[data-sidebar]",
    "[data-sidebar-root]",
  ]),

  topbar: Object.freeze([
    "#app-topbar",
    "#topbar",
    ".topbar",
    "[data-topbar]",
    "[data-topbar-root]",
  ]),

  tablehead: Object.freeze([
    "#table-head",
    ".table-head",
    "[data-tablehead]",
  ]),

  tableheadContainer: Object.freeze([
    "#tablehead-container",
    ".tablehead-container",
    "[data-tablehead-container]",
  ]),

  mobileSidebarToggle: Object.freeze([
    "#toggleSidebarMobile",
    "[data-sidebar-mobile-toggle]",
    "[data-mobile-sidebar-toggle]",
  ]),
});

const WARMUP_EVENTS = Object.freeze({
  warmup: "app:warmup",
  warning: "app:warmup:warning",
  ready: "app:warmup:ready",
  summary: "app:warmup:summary",
  debugReady: "app:warmup:debug-ready",
});

const HIDDEN_LOADER_CLASSES = Object.freeze([
  "is-hidden",
  "has-hidden",
  "loader-hidden",
]);

const VISIBLE_LOADER_CLASSES = Object.freeze([
  "is-visible",
  "is-entering",
  "is-leaving",
  "loader-visible",
]);

/* =========================================================
   MODULE STATE
========================================================= */

let lastWarningKey = "";
let lastWarningAt = 0;

let lastLogKey = "";
let lastLogAt = 0;

let lastEventKey = "";
let lastEventAt = 0;

let lastSnapshot = null;
let lastSummary = null;

let warmupCount = 0;
let lastWarmupAt = 0;
let lastWarmupDurationMs = 0;

const recentSnapshots = [];

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
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
  return isObject(value) ? value : {};
}

function isFunction(value) {
  return typeof value === "function";
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

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeCall(fn, fallback = null) {
  try {
    if (isFunction(fn)) {
      return fn();
    }
  } catch {}

  return fallback;
}

function nowMs() {
  try {
    if (
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
    ) {
      return performance.now();
    }
  } catch {}

  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function epochMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function isExtensibleObject(value) {
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
    !isExtensibleObject(target)
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
      "Router" in first ||
      "Store" in first ||
      "SidebarUI" in first ||
      "TopbarUI" in first ||
      "Toast" in first ||
      "I18n" in first
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

/* =========================================================
   MODULE RESOLUTION
========================================================= */

function getModuleFromRegistry(AppCore, names = []) {
  const modules = AppCore?.modules;

  if (!modules) {
    return null;
  }

  const keys =
    safeArray(names)
      .map((name) => safeText(name, ""))
      .filter(Boolean);

  for (const key of keys) {
    try {
      if (
        isFunction(modules.get) &&
        modules.get(key)
      ) {
        return modules.get(key);
      }
    } catch {}

    try {
      if (
        isFunction(modules.has) &&
        modules.has(key) &&
        isFunction(modules.get)
      ) {
        return modules.get(key);
      }
    } catch {}

    try {
      if (modules[key]) {
        return modules[key];
      }
    } catch {}
  }

  try {
    const registryModules = AppCore?.registry?.modules;

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

function resolveRuntimeDeps(first = {}, second = {}) {
  const deps = normalizeDeps(first, second);
  const AppCore = deps.AppCore || null;

  const Router =
    deps.Router ||
    AppCore?.Router ||
    AppCore?.router ||
    getModuleFromRegistry(
      AppCore,
      [
        "Router",
        "router",
        "AppRouter",
        "appRouter",
      ]
    );

  const I18n =
    deps.I18n ||
    AppCore?.I18n ||
    AppCore?.i18n ||
    getModuleFromRegistry(
      AppCore,
      [
        "I18n",
        "i18n",
        "Lang",
        "lang",
      ]
    );

  const Store =
    deps.Store ||
    AppCore?.Store ||
    AppCore?.store ||
    getModuleFromRegistry(
      AppCore,
      [
        "Store",
        "store",
      ]
    );

  const Auth =
    deps.Auth ||
    AppCore?.Auth ||
    AppCore?.auth ||
    getModuleFromRegistry(
      AppCore,
      [
        "Auth",
        "auth",
      ]
    );

  const SidebarUI =
    deps.SidebarUI ||
    AppCore?.SidebarUI ||
    AppCore?.sidebar ||
    AppCore?.sidebarUI ||
    getModuleFromRegistry(
      AppCore,
      [
        "SidebarUI",
        "sidebar",
        "sidebarUI",
      ]
    );

  const TopbarUI =
    deps.TopbarUI ||
    AppCore?.TopbarUI ||
    AppCore?.topbar ||
    AppCore?.topbarUI ||
    getModuleFromRegistry(
      AppCore,
      [
        "TopbarUI",
        "topbar",
        "topbarUI",
      ]
    );

  const Toast =
    deps.Toast ||
    AppCore?.Toast ||
    AppCore?.toast ||
    AppCore?.toastModule ||
    getModuleFromRegistry(
      AppCore,
      [
        "Toast",
        "toast",
        "toastModule",
      ]
    );

  return {
    ...deps,
    AppCore,
    Auth,
    Router,
    Store,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
  };
}

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      const escaped = escapeRegExp(name);

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    for (const routePath of safeArray(config.paths)) {
      try {
        output =
          output.replace(
            new RegExp(`(${escapeRegExp(routePath)}\\/)([^/?#\\s]+)`, "gi"),
            "$1***"
          );
      } catch {}
    }
  }

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
        "$1$2***"
      );
  } catch {}

  try {
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

function sanitizeSnapshotValue(value, depth = 0) {
  if (depth > MAX_SANITIZE_DEPTH) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactTokenInText(value);
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
        safeText(value.className?.baseVal || value.className, "")
          .slice(0, MAX_CLASSNAME_LENGTH),
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_SNAPSHOT_ITEMS)
      .map((item) =>
        sanitizeSnapshotValue(item, depth + 1)
      );
  }

  if (value instanceof Error) {
    return {
      name:
        safeText(value.name, "Error"),

      message:
        redactTokenInText(
          safeText(value.message, "")
        ),

      stack:
        redactTokenInText(
          safeText(value.stack, "")
        ),

      code:
        value.code || null,

      status:
        value.status || value.statusCode || null,
    };
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
      const cleanKey = safeText(key, "");

      if (!cleanKey) {
        continue;
      }

      if (
        /token|secret|password|authorization|credential|cookie|jwt|bearer|session|refresh/i.test(cleanKey)
      ) {
        if (
          typeof item === "boolean" ||
          item === null ||
          item === undefined ||
          item === ""
        ) {
          output[cleanKey] = item;
        } else {
          output[cleanKey] = "***";
        }

        continue;
      }

      output[cleanKey] =
        sanitizeSnapshotValue(
          item,
          depth + 1
        );
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   LOG / EMIT
========================================================= */

function getLogger(AppCore, level = "log") {
  try {
    const utils = ensureObject(AppCore?.utils);

    if (isFunction(utils?.[level])) {
      return utils[level].bind(utils);
    }

    if (isFunction(utils?.log)) {
      return utils.log.bind(utils);
    }
  } catch {}

  try {
    if (isFunction(console?.[level])) {
      return console[level].bind(console);
    }

    if (isFunction(console?.log)) {
      return console.log.bind(console);
    }
  } catch {}

  return null;
}

function safeLog(AppCore, ...args) {
  try {
    const log = getLogger(AppCore, "log");

    log?.(
      WARMUP_LABEL,
      ...args.map((item) =>
        sanitizeSnapshotValue(item)
      )
    );
  } catch {}
}

function safeInfo(AppCore, ...args) {
  try {
    const info = getLogger(AppCore, "info");

    info?.(
      WARMUP_LABEL,
      ...args.map((item) =>
        sanitizeSnapshotValue(item)
      )
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    const warn = getLogger(AppCore, "warn");

    warn?.(
      WARMUP_LABEL,
      ...args.map((item) =>
        sanitizeSnapshotValue(item)
      )
    );
  } catch {}
}

function safeCreateCustomEvent(name, detail = {}) {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(
        name,
        {
          detail,
        }
      );
    }
  } catch {}

  try {
    const event =
      document.createEvent("CustomEvent");

    event.initCustomEvent(
      name,
      false,
      false,
      detail
    );

    return event;
  } catch {
    return null;
  }
}

function shouldEmitEvent(eventName = "", payload = {}) {
  const key = [
    safeText(eventName, ""),
    safeText(payload?.reason, ""),
    safeText(payload?.health?.status || payload?.warning?.code || "", ""),
    safeText(payload?.route || payload?.app?.route || "", ""),
    safeText(payload?.publicPath || payload?.app?.publicPath || "", ""),
  ].join("|");

  const now = epochMs();

  if (
    key === lastEventKey &&
    now - lastEventAt < WARMUP_EVENT_DEDUPE_MS
  ) {
    return false;
  }

  lastEventKey = key;
  lastEventAt = now;

  return true;
}

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts = ensureObject(options);

  if (
    opts.dedupe !== false &&
    !shouldEmitEvent(name, payload)
  ) {
    return false;
  }

  const cleanPayload =
    sanitizeSnapshotValue(payload);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        name,
        cleanPayload
      );

      busEmitted = true;
    }
  } catch {}

  /*
    Anti event-storm:
    si existe AppCore.events, no duplicamos por window.
    window sólo fallback o si se fuerza explícitamente.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      const event =
        safeCreateCustomEvent(
          name,
          cleanPayload
        );

      if (event) {
        window.dispatchEvent(event);
        return true;
      }
    } catch {}
  }

  return busEmitted;
}

function shouldLogSnapshot(snapshot = {}) {
  const key =
    [
      snapshot.reason,
      snapshot.health?.status,
      snapshot.warningCount,
      snapshot.app?.route,
      snapshot.app?.publicPath,
      snapshot.auth?.authenticated ? "auth" : "anon",
      snapshot.router?.present ? "router" : "no-router",
    ].join("|");

  const now = epochMs();

  if (
    key === lastLogKey &&
    now - lastLogAt < WARMUP_LOG_DEDUPE_MS
  ) {
    return false;
  }

  lastLogKey = key;
  lastLogAt = now;

  return true;
}

function shouldEmitWarning(warning = {}) {
  const key =
    [
      warning.code,
      warning.severity,
      warning.message,
    ].join("|");

  const now = epochMs();

  if (
    key === lastWarningKey &&
    now - lastWarningAt < WARMUP_WARNING_DEDUPE_MS
  ) {
    return false;
  }

  lastWarningKey = key;
  lastWarningAt = now;

  return true;
}

/* =========================================================
   PATH HELPERS
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

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value =
    safeText(pathname, DEFAULT_ROUTE)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const segments = [];

  for (const segment of value.split("/").filter(Boolean)) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  value = `/${segments.join("/")}`;

  if (!value) {
    value = DEFAULT_ROUTE;
  }

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value;
}

function normalizeSearch(search = "") {
  const value = safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function splitFullPath(value = DEFAULT_ROUTE) {
  const raw = safeText(value, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    return splitFullPath(
      normalizeHashRouterPath(raw)
    );
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
    pathname:
      normalizePathnameOnly(pathname),

    search:
      normalizeSearch(search),

    hash:
      normalizeHash(hash),
  };
}

function normalizeLocalFullPath(path = DEFAULT_ROUTE) {
  const raw = safeText(path, DEFAULT_ROUTE);

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (isHashRouterPath(raw)) {
    return normalizeLocalFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (parsed.origin !== getBaseOrigin()) {
        return DEFAULT_ROUTE;
      }

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeLocalFullPath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizeLocalFullPath(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {
    return DEFAULT_ROUTE;
  }

  const {
    pathname,
    search,
    hash,
  } = splitFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  const normalized =
    normalizeLocalFullPath(path || DEFAULT_ROUTE);

  return (
    normalized
      .split("?")[0]
      .split("#")[0] ||
    DEFAULT_ROUTE
  );
}

function stripUsernamePrefixFromCleanPath(pathname = DEFAULT_ROUTE) {
  const clean =
    normalizePathnameOnly(pathname || DEFAULT_ROUTE);

  const segments =
    clean
      .split("/")
      .filter(Boolean);

  if (
    segments.length &&
    PUBLIC_USERNAME_RE.test(segments[0])
  ) {
    const rest =
      segments.slice(1).join("/");

    return rest
      ? normalizePathnameOnly(`/${rest}`)
      : DEFAULT_ROUTE;
  }

  return clean;
}

function getCanonicalCleanPath(path = DEFAULT_ROUTE) {
  return stripUsernamePrefixFromCleanPath(
    stripSearchAndHash(path)
  );
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const pathname =
      window.location.pathname || DEFAULT_ROUTE;

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeLocalFullPath(
        normalizeHashRouterPath(hash)
      );
    }

    return normalizeLocalFullPath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeLocalFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (parsed.origin !== getBaseOrigin()) {
      return DEFAULT_ROUTE;
    }

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeLocalFullPath(
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return normalizeLocalFullPath(
      `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return normalizeLocalFullPath(
      raw.startsWith("/")
        ? raw
        : `/${raw}`
    );
  }
}

function isAuthLikePath(path = DEFAULT_ROUTE) {
  const clean =
    getCanonicalCleanPath(path);

  if (AUTH_LIKE_PATHS.includes(clean)) {
    return true;
  }

  return AUTH_LIKE_PREFIXES.some((prefix) =>
    clean.startsWith(prefix)
  );
}

/* =========================================================
   PUBLIC TOKEN ROUTE SNAPSHOT
========================================================= */

function hasTokenInSearch(search = "", names = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return safeArray(names).some((name) =>
      Boolean(
        safeText(
          params.get(name),
          ""
        )
      )
    );
  } catch {
    return false;
  }
}

function getPathToken(config = null, value = "") {
  const paths = safeArray(config?.paths);

  if (!paths.length) {
    return "";
  }

  const path =
    pathFromUrlLike(value);

  if (!path) {
    return "";
  }

  const clean =
    getCanonicalCleanPath(path);

  for (const routePath of paths) {
    if (!clean.startsWith(`${routePath}/`)) {
      continue;
    }

    const token =
      clean
        .slice(`${routePath}/`.length)
        .split("/")[0];

    try {
      return safeText(
        decodeURIComponent(token || ""),
        ""
      );
    } catch {
      return safeText(token, "");
    }
  }

  return "";
}

function hasRouteToken(config = null, value = "") {
  if (!config) {
    return false;
  }

  const raw = safeText(value, "");

  if (!raw) {
    return false;
  }

  if (getPathToken(config, raw)) {
    return true;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (parsed.origin !== getBaseOrigin()) {
      return false;
    }

    if (
      hasTokenInSearch(
        parsed.search,
        config.tokenParamNames
      )
    ) {
      return true;
    }

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      const hashPath =
        normalizeHashRouterPath(parsed.hash);

      if (getPathToken(config, hashPath)) {
        return true;
      }

      const hashParts =
        splitFullPath(hashPath);

      if (
        hasTokenInSearch(
          hashParts.search,
          config.tokenParamNames
        )
      ) {
        return true;
      }
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenParamNames
      );
    }

    return false;
  } catch {
    const parts =
      splitFullPath(raw);

    if (
      hasTokenInSearch(
        parts.search,
        config.tokenParamNames
      )
    ) {
      return true;
    }

    if (
      parts.hash &&
      parts.hash.includes("?")
    ) {
      const query =
        parts.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenParamNames
      );
    }

    return false;
  }
}

function getWindowValue(key = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return "";
  }

  try {
    return safeText(window[key], "");
  } catch {
    return "";
  }
}

function getWindowRawValue(key = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return null;
  }

  try {
    return window[key] ?? null;
  } catch {
    return null;
  }
}

function getHistoryStateFlag(flag = "") {
  if (
    !isBrowser() ||
    !flag
  ) {
    return false;
  }

  try {
    return Boolean(window.history?.state?.[flag]);
  } catch {
    return false;
  }
}

function matchesProtectedTokenRoute(config = null, value = "") {
  if (!config) {
    return false;
  }

  const path =
    pathFromUrlLike(value);

  const clean =
    getCanonicalCleanPath(path);

  return safeArray(config.paths).some((routePath) =>
    clean === routePath ||
    clean.startsWith(`${routePath}/`)
  );
}

function getBootContextSnapshot() {
  const context = getWindowRawValue("__ONION_BOOT_CONTEXT__");

  return sanitizeSnapshotValue(ensureObject(context));
}

function getProtectedTokenRouteSnapshot() {
  const candidates = [];

  if (isBrowser()) {
    try {
      candidates.push(window.location.href || "");
    } catch {}

    try {
      candidates.push(getBrowserPublicPath());
    } catch {}

    try {
      candidates.push(getWindowValue("__ONION_INITIAL_URL__"));
    } catch {}

    const bootContext = ensureObject(getWindowRawValue("__ONION_BOOT_CONTEXT__"));

    candidates.push(
      bootContext.initialUrl,
      bootContext.protectedInitialUrl,
      bootContext.protectedInitialPath,
      bootContext.protectedInitialPublicPath,
      bootContext.activationInitialUrl,
      bootContext.activationInitialPath,
      bootContext.activationInitialPublicPath,
      bootContext.resetConfirmInitialUrl,
      bootContext.resetConfirmInitialPath,
      bootContext.resetConfirmInitialPublicPath
    );
  }

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    for (const key of config.windowKeys || []) {
      candidates.push(
        getWindowValue(key)
      );
    }
  }

  const cleanCandidates =
    candidates
      .map((candidate) => safeText(candidate, ""))
      .filter(Boolean);

  const routes =
    PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) => {
      const matchedCandidates =
        cleanCandidates.filter((candidate) =>
          matchesProtectedTokenRoute(
            config,
            candidate
          )
        );

      const tokenCandidates =
        matchedCandidates.filter((candidate) =>
          hasRouteToken(
            config,
            candidate
          )
        );

      const scrubbed =
        safeArray(config.scrubbedFlags).some((flag) =>
          getHistoryStateFlag(flag)
        );

      return {
        key:
          config.key,

        canonicalPath:
          config.canonicalPath,

        paths:
          safeArray(config.paths),

        matched:
          matchedCandidates.length > 0,

        hasToken:
          tokenCandidates.length > 0,

        scrubbed,

        candidateCount:
          matchedCandidates.length,

        tokenCandidateCount:
          tokenCandidates.length,

        samples:
          matchedCandidates
            .slice(0, 3)
            .map(redactTokenInText),
      };
    });

  return {
    anyMatched:
      routes.some((item) => item.matched),

    anyHasToken:
      routes.some((item) => item.hasToken),

    anyScrubbed:
      routes.some((item) => item.scrubbed),

    routes,
  };
}

/* =========================================================
   BROWSER SNAPSHOTS
========================================================= */

function getLocationSnapshot() {
  if (!isBrowser()) {
    return {
      href: "",
      origin: "",
      pathname: "",
      search: "",
      hash: "",
      publicPath: DEFAULT_ROUTE,
      normalizedPublicPath: DEFAULT_ROUTE,
      canonicalPath: DEFAULT_ROUTE,
      hashRouterPath: "",
      authLike: false,
    };
  }

  try {
    const pathname =
      window.location?.pathname || DEFAULT_ROUTE;

    const search =
      window.location?.search || "";

    const hash =
      window.location?.hash || "";

    const publicPath =
      `${pathname}${search}${hash}` || DEFAULT_ROUTE;

    const normalizedPublicPath =
      getBrowserPublicPath();

    return {
      href:
        redactTokenInText(
          window.location?.href || ""
        ),

      origin:
        window.location?.origin || "",

      pathname:
        redactTokenInText(pathname),

      search:
        redactTokenInText(search),

      hash:
        redactTokenInText(hash),

      publicPath:
        redactTokenInText(publicPath),

      normalizedPublicPath:
        redactTokenInText(normalizedPublicPath),

      canonicalPath:
        redactTokenInText(getCanonicalCleanPath(normalizedPublicPath)),

      hashRouterPath:
        hash && isHashRouterPath(hash)
          ? redactTokenInText(
              normalizeHashRouterPath(hash)
            )
          : "",

      authLike:
        isAuthLikePath(publicPath),
    };
  } catch {
    return {
      href: "",
      origin: "",
      pathname: "",
      search: "",
      hash: "",
      publicPath: DEFAULT_ROUTE,
      normalizedPublicPath: DEFAULT_ROUTE,
      canonicalPath: DEFAULT_ROUTE,
      hashRouterPath: "",
      authLike: false,
    };
  }
}

function getDocumentSnapshot() {
  if (!isBrowser()) {
    return {
      readyState: "server",
      title: "",
      lang: null,
      visibilityState: null,
      hidden: null,
      theme: null,
      appState: null,
      appLoading: null,
      routeMode: null,
      shell: null,
      chrome: null,
      className: "",
    };
  }

  try {
    const html =
      document.documentElement;

    return {
      readyState:
        document.readyState || "",

      title:
        document.title || "",

      lang:
        html?.getAttribute?.("lang") ||
        html?.lang ||
        null,

      visibilityState:
        document.visibilityState || null,

      hidden:
        typeof document.hidden === "boolean"
          ? document.hidden
          : null,

      theme:
        html?.dataset?.theme || null,

      themeMode:
        html?.dataset?.themeMode || null,

      systemTheme:
        html?.dataset?.systemTheme || null,

      appState:
        html?.dataset?.appState || null,

      appLoading:
        html?.dataset?.appLoading || null,

      appReady:
        html?.dataset?.appReady || null,

      bootPhase:
        html?.dataset?.bootPhase || null,

      routeMode:
        html?.dataset?.routeMode || null,

      shell:
        html?.dataset?.shell || null,

      chrome:
        html?.dataset?.chrome || null,

      className:
        safeText(html?.className, "").slice(0, MAX_CLASSNAME_LENGTH),
    };
  } catch {
    return {
      readyState: "",
      title: "",
      lang: null,
      visibilityState: null,
      hidden: null,
      theme: null,
      appState: null,
      appLoading: null,
      routeMode: null,
      shell: null,
      chrome: null,
      className: "",
    };
  }
}

function getNavigatorSnapshot() {
  if (!isBrowser()) {
    return {
      online: null,
      language: null,
      languages: [],
      userAgent: "",
    };
  }

  try {
    return {
      online:
        typeof navigator.onLine === "boolean"
          ? navigator.onLine
          : null,

      language:
        navigator.language || null,

      languages:
        safeArray(navigator.languages),

      userAgent:
        navigator.userAgent || "",
    };
  } catch {
    return {
      online: null,
      language: null,
      languages: [],
      userAgent: "",
    };
  }
}

function getHistorySnapshot() {
  if (!isBrowser()) {
    return {
      length: 0,
      state: null,
    };
  }

  try {
    const state =
      ensureObject(window.history?.state);

    return {
      length:
        safeNumber(
          window.history?.length,
          0
        ),

      state:
        sanitizeSnapshotValue(state),

      hasScrubbedActivationToken:
        Boolean(
          state.scrubbedActivationToken ||
            state.activationTokenScrubbed ||
            state.scrubbedActivateAccountToken
        ),

      hasScrubbedResetToken:
        Boolean(
          state.scrubbedResetToken ||
            state.scrubbedResetPasswordToken ||
            state.resetTokenScrubbed ||
            state.scrubbedResetConfirmToken ||
            state.scrubbedPasswordResetToken
        ),

      scrubbedPublicTokenRoute:
        state.scrubbedPublicTokenRoute || null,

      scrubbedTokenRoute:
        state.scrubbedTokenRoute || null,
    };
  } catch {
    return {
      length: 0,
      state: null,
    };
  }
}

function getPerformanceSnapshot() {
  const output = {
    supported: false,
    now: 0,
    navigationType: "",
    domContentLoadedMs: 0,
    loadEventMs: 0,
    firstPaintMs: 0,
    firstContentfulPaintMs: 0,
    memory: null,
  };

  try {
    if (
      typeof performance === "undefined" ||
      !performance
    ) {
      return output;
    }

    output.supported = true;
    output.now = Math.round(nowMs());

    try {
      const nav =
        performance.getEntriesByType?.("navigation")?.[0] || null;

      if (nav) {
        output.navigationType = nav.type || "";

        output.domContentLoadedMs =
          Math.round(
            nav.domContentLoadedEventEnd || 0
          );

        output.loadEventMs =
          Math.round(
            nav.loadEventEnd || 0
          );
      }
    } catch {}

    try {
      const paints =
        performance.getEntriesByType?.("paint") || [];

      for (const paint of paints) {
        if (paint.name === "first-paint") {
          output.firstPaintMs = Math.round(paint.startTime || 0);
        }

        if (paint.name === "first-contentful-paint") {
          output.firstContentfulPaintMs = Math.round(paint.startTime || 0);
        }
      }
    } catch {}

    try {
      if (performance.memory) {
        output.memory = {
          usedJSHeapSize:
            safeNumber(
              performance.memory.usedJSHeapSize,
              0
            ),

          totalJSHeapSize:
            safeNumber(
              performance.memory.totalJSHeapSize,
              0
            ),

          jsHeapSizeLimit:
            safeNumber(
              performance.memory.jsHeapSizeLimit,
              0
            ),
        };
      }
    } catch {}

    return output;
  } catch {
    return output;
  }
}

/* =========================================================
   STORAGE SNAPSHOT
========================================================= */

function getStorage(type = "localStorage") {
  if (!isBrowser()) {
    return null;
  }

  try {
    return window[type] || null;
  } catch {
    return null;
  }
}

function hasStorageKey(storage, key = "") {
  try {
    return Boolean(
      storage?.getItem?.(key)
    );
  } catch {
    return false;
  }
}

function getStorageLength(storage) {
  try {
    return safeNumber(
      storage?.length,
      0
    );
  } catch {
    return 0;
  }
}

function getStorageTokenHints() {
  if (!isBrowser()) {
    return {
      localStorage: false,
      sessionStorage: false,
      localStorageLength: 0,
      sessionStorageLength: 0,
      keys: [],
    };
  }

  const localStorageRef =
    getStorage("localStorage");

  const sessionStorageRef =
    getStorage("sessionStorage");

  const foundKeys = [];

  let localHasToken = false;
  let sessionHasToken = false;

  for (const key of KNOWN_TOKEN_STORAGE_KEYS) {
    if (hasStorageKey(localStorageRef, key)) {
      localHasToken = true;
      foundKeys.push(`localStorage:${key}`);
    }

    if (hasStorageKey(sessionStorageRef, key)) {
      sessionHasToken = true;
      foundKeys.push(`sessionStorage:${key}`);
    }
  }

  return {
    localStorage:
      localHasToken,

    sessionStorage:
      sessionHasToken,

    localStorageLength:
      getStorageLength(localStorageRef),

    sessionStorageLength:
      getStorageLength(sessionStorageRef),

    keys:
      foundKeys.map(redactTokenInText),
  };
}

/* =========================================================
   DOM / SHELL SNAPSHOT
========================================================= */

function queryFirst(selectors = []) {
  if (!isBrowser()) {
    return null;
  }

  for (const selector of safeArray(selectors)) {
    const clean =
      safeText(selector, "");

    if (!clean) {
      continue;
    }

    try {
      const element =
        clean.startsWith("#")
          ? document.getElementById(clean.slice(1))
          : document.querySelector(clean);

      if (element) {
        return element;
      }
    } catch {}
  }

  return null;
}

function getComputedSnapshot(element) {
  if (
    !isBrowser() ||
    !element
  ) {
    return {};
  }

  try {
    const style =
      window.getComputedStyle(element);

    return {
      display:
        safeText(style.display, ""),

      visibility:
        safeText(style.visibility, ""),

      opacity:
        safeText(style.opacity, ""),

      pointerEvents:
        safeText(style.pointerEvents, ""),

      position:
        safeText(style.position, ""),

      zIndex:
        safeText(style.zIndex, ""),
    };
  } catch {
    return {};
  }
}

function getClassList(element) {
  try {
    return Array.from(element?.classList || []);
  } catch {
    return [];
  }
}

function getDomElementSnapshot(id = "", selectors = []) {
  if (!isBrowser()) {
    return {
      exists: false,
      id: safeText(id, ""),
    };
  }

  try {
    const cleanId =
      safeText(id, "");

    const element =
      (
        cleanId
          ? document.getElementById(cleanId)
          : null
      ) ||
      queryFirst(selectors);

    if (!element) {
      return {
        exists: false,
        id: cleanId,
      };
    }

    return {
      exists:
        true,

      id:
        element.id || cleanId,

      tag:
        element.tagName?.toLowerCase?.() || "",

      hidden:
        Boolean(element.hidden),

      ariaHidden:
        element.getAttribute?.("aria-hidden") || null,

      ariaBusy:
        element.getAttribute?.("aria-busy") || null,

      role:
        element.getAttribute?.("role") || null,

      dataset: {
        shell:
          element.dataset?.shell || null,

        shellState:
          element.dataset?.shellState || null,

        chrome:
          element.dataset?.chrome || null,

        routeMode:
          element.dataset?.routeMode || null,

        loaderVisible:
          element.dataset?.loaderVisible || null,

        loaderState:
          element.dataset?.loaderState || null,

        routerStatus:
          element.dataset?.routerStatus || null,

        routerCanonicalPath:
          redactTokenInText(
            element.dataset?.routerCanonicalPath || ""
          ) || null,

        routerPublicPath:
          redactTokenInText(
            element.dataset?.routerPublicPath || ""
          ) || null,

        routerRenderId:
          element.dataset?.routerRenderId || null,
      },

      className:
        safeText(
          element.className?.baseVal ||
            element.className,
          ""
        ).slice(0, MAX_CLASSNAME_LENGTH),

      classes:
        getClassList(element),

      childCount:
        safeNumber(element.children?.length, 0),

      hasContent:
        Boolean(
          safeText(
            element.textContent,
            ""
          )
        ),

      computed:
        getComputedSnapshot(element),
    };
  } catch {
    return {
      exists: false,
      id: safeText(id, ""),
    };
  }
}

function getShellSnapshot(AppCore) {
  const dom = ensureObject(AppCore?.dom);

  const body =
    isBrowser()
      ? document.body || null
      : null;

  const html =
    isBrowser()
      ? document.documentElement || null
      : null;

  const elements = {
    app:
      getDomElementSnapshot(
        DOM_IDS.app,
        DOM_SELECTORS.app
      ),

    root:
      getDomElementSnapshot(
        DOM_IDS.root,
        DOM_SELECTORS.root
      ),

    shell:
      getDomElementSnapshot(
        DOM_IDS.shell,
        DOM_SELECTORS.shell
      ),

    main:
      getDomElementSnapshot(
        DOM_IDS.main,
        DOM_SELECTORS.main
      ),

    appContent:
      getDomElementSnapshot(
        DOM_IDS.appContent,
        DOM_SELECTORS.appContent
      ),

    loader:
      getDomElementSnapshot(
        DOM_IDS.loader,
        DOM_SELECTORS.loader
      ),

    viewContainer:
      getDomElementSnapshot(
        DOM_IDS.viewContainer,
        DOM_SELECTORS.viewContainer
      ),

    sidebarMount:
      getDomElementSnapshot(
        DOM_IDS.sidebarMount,
        DOM_SELECTORS.sidebarMount
      ),

    topbarMount:
      getDomElementSnapshot(
        DOM_IDS.topbarMount,
        DOM_SELECTORS.topbarMount
      ),

    sidebar:
      getDomElementSnapshot(
        DOM_IDS.sidebar,
        DOM_SELECTORS.sidebar
      ),

    topbar:
      getDomElementSnapshot(
        DOM_IDS.topbar,
        DOM_SELECTORS.topbar
      ),

    tablehead:
      getDomElementSnapshot(
        DOM_IDS.tablehead,
        DOM_SELECTORS.tablehead
      ),

    tableheadContainer:
      getDomElementSnapshot(
        DOM_IDS.tableheadContainer,
        DOM_SELECTORS.tableheadContainer
      ),

    mobileSidebarToggle:
      getDomElementSnapshot(
        DOM_IDS.mobileSidebarToggle,
        DOM_SELECTORS.mobileSidebarToggle
      ),
  };

  const loaderVisible =
    Boolean(
      elements.loader.exists &&
        !elements.loader.hidden &&
        elements.loader.ariaHidden !== "true" &&
        elements.loader.dataset.loaderVisible !== "false" &&
        elements.loader.dataset.loaderState !== "hidden" &&
        !elements.loader.classes?.some?.((className) =>
          HIDDEN_LOADER_CLASSES.includes(className)
        )
    );

  const chromeVisible =
    !Boolean(
      elements.sidebarMount.hidden ||
        elements.topbarMount.hidden ||
        elements.sidebar.hidden ||
        elements.topbar.hidden ||
        body?.classList?.contains?.("route-chrome-hidden") ||
        html?.classList?.contains?.("route-chrome-hidden")
    );

  return {
    domCache: {
      hasApp:
        Boolean(dom.app),

      hasRoot:
        Boolean(dom.root),

      hasShell:
        Boolean(dom.shell || dom.appShell),

      hasMain:
        Boolean(dom.main || dom.mainContent),

      hasAppContent:
        Boolean(dom.appContent),

      hasLoader:
        Boolean(dom.loader),

      hasViewContainer:
        Boolean(dom.viewContainer),

      hasSidebarMount:
        Boolean(dom.sidebarMount),

      hasTopbarMount:
        Boolean(dom.topbarMount),

      hasSidebar:
        Boolean(dom.sidebar),

      hasTopbar:
        Boolean(dom.topbar),

      hasTablehead:
        Boolean(dom.tablehead),

      hasTableheadContainer:
        Boolean(dom.tableheadContainer),
    },

    body: {
      exists:
        Boolean(body),

      className:
        safeText(body?.className, "").slice(0, MAX_CLASSNAME_LENGTH),

      classes:
        getClassList(body),

      datasetShell:
        body?.dataset?.shell || null,

      datasetChrome:
        body?.dataset?.chrome || null,

      datasetRouteMode:
        body?.dataset?.routeMode || null,

      datasetAppLoading:
        body?.dataset?.appLoading || null,

      datasetShellState:
        body?.dataset?.shellState || null,
    },

    html: {
      exists:
        Boolean(html),

      className:
        safeText(html?.className, "").slice(0, MAX_CLASSNAME_LENGTH),

      classes:
        getClassList(html),

      datasetShell:
        html?.dataset?.shell || null,

      datasetChrome:
        html?.dataset?.chrome || null,

      datasetRouteMode:
        html?.dataset?.routeMode || null,

      datasetAppLoading:
        html?.dataset?.appLoading || null,

      datasetAppState:
        html?.dataset?.appState || null,

      datasetTheme:
        html?.dataset?.theme || null,
    },

    elements,

    loaderVisible,

    chromeVisible,

    appShellVisible:
      Boolean(
        elements.shell.exists &&
          !elements.shell.hidden &&
          elements.shell.ariaHidden !== "true"
      ),

    hasViewContent:
      Boolean(
        elements.viewContainer.exists &&
          elements.viewContainer.hasContent
      ),

    authScreen:
      Boolean(
        body?.classList?.contains?.("auth-screen") ||
          body?.classList?.contains?.("route-auth") ||
          html?.classList?.contains?.("route-auth")
      ),

    visibleLoaderClass:
      Boolean(
        elements.loader.classes?.some?.((className) =>
          VISIBLE_LOADER_CLASSES.includes(className)
        )
      ),
  };
}

/* =========================================================
   MODULE SNAPSHOTS
========================================================= */

function getUserSnapshot(AppCore, Auth = null) {
  const state = ensureObject(AppCore?.state);

  const authUser =
    safeCall(
      () =>
        Auth?.getUser?.() ||
        Auth?.getCurrentUser?.() ||
        Auth?.user ||
        null,
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
    present:
      Boolean(user),

    id:
      user?.id ||
      user?.userId ||
      user?.uid ||
      user?.sub ||
      null,

    username:
      user?.username ||
      user?.userName ||
      user?.email ||
      user?.name ||
      user?.displayName ||
      null,

    displayName:
      user?.displayName ||
      user?.name ||
      user?.username ||
      user?.email ||
      null,

    email:
      user?.email || null,

    role:
      state.role ||
      state.rol ||
      state.userRole ||
      state.session?.role ||
      state.auth?.role ||
      user?.role ||
      user?.rol ||
      Auth?.role ||
      null,

    hasAvatar:
      Boolean(
        user?.avatarUrl ||
          user?.avatar ||
          user?.photoURL ||
          user?.picture
      ),
  };
}

function getAuthHeaderAvailable(Auth = null) {
  try {
    if (isFunction(Auth?.getAuthHeader)) {
      return Boolean(Auth.getAuthHeader());
    }
  } catch {}

  return false;
}

function getAuthIsAuthenticated(Auth = null) {
  try {
    if (isFunction(Auth?.isAuthenticated)) {
      return Boolean(Auth.isAuthenticated());
    }
  } catch {}

  return Boolean(Auth?.authenticated);
}

function getAuthSnapshot(AppCore, Auth = null) {
  const state = ensureObject(AppCore?.state);

  return {
    present:
      Boolean(Auth),

    authenticated:
      Boolean(
        state.authenticated ||
          state.isAuthenticated ||
          getAuthIsAuthenticated(Auth)
      ),

    hasStateToken:
      Boolean(
        state.token ||
          state.accessToken ||
          state.access_token ||
          state.session?.token ||
          state.session?.accessToken ||
          state.auth?.token ||
          state.auth?.accessToken
      ),

    hasAuthHeader:
      getAuthHeaderAvailable(Auth),

    restoring:
      Boolean(
        state.restoring ||
          state.authRestoring ||
          state.sessionRestoring ||
          Auth?.restoring ||
          Auth?.session?.restoring
      ),

    loginInProgress:
      Boolean(
        state.loginInProgress ||
          state.authLoginInProgress ||
          Auth?.loginPromise ||
          Auth?.session?.loginPromise ||
          Auth?.session?.loggingIn
      ),

    hasRestoreSession:
      Boolean(
        isFunction(Auth?.restoreSession) ||
          isFunction(Auth?.restore) ||
          isFunction(Auth?.session?.restore)
      ),

    hasLogin:
      isFunction(Auth?.login),

    hasLogout:
      isFunction(Auth?.logout),

    hasRefresh:
      Boolean(
        isFunction(Auth?.refresh) ||
          isFunction(Auth?.refreshToken) ||
          isFunction(Auth?.refreshSession)
      ),

    role:
      state.role ||
      state.rol ||
      state.userRole ||
      Auth?.role ||
      null,

    user:
      getUserSnapshot(
        AppCore,
        Auth
      ),
  };
}

function getRouterCurrentCanonicalPath(Router = null) {
  return safeText(
    safeCall(
      () => Router?.getCurrentCanonicalPath?.(),
      ""
    ),
    ""
  );
}

function getRouterCurrentPublicPath(Router = null) {
  return safeText(
    safeCall(
      () => Router?.getCurrentPublicPath?.(),
      ""
    ),
    ""
  );
}

function getRouterSnapshot(AppCore, Router = null) {
  const state = ensureObject(AppCore?.state);

  let routerSnapshot = null;

  try {
    routerSnapshot =
      Router?.getSnapshot?.() ||
      Router?.getDebugSnapshot?.() ||
      Router?.getState?.() ||
      null;
  } catch {}

  const hasRender = isFunction(Router?.render);
  const hasNavigate = isFunction(Router?.navigate);
  const hasGo = isFunction(Router?.go);
  const hasPush = isFunction(Router?.push);
  const hasBind = isFunction(Router?.bind);
  const hasBack = isFunction(Router?.back);

  const hasRerender =
    Boolean(
      isFunction(Router?.rerenderCurrentRoute) ||
        isFunction(Router?.renderCurrentRoute)
    );

  const hasRouteResolver =
    Boolean(
      isFunction(Router?.getRoute) ||
        isFunction(Router?.resolve) ||
        isFunction(Router?.resolveRoute)
    );

  const present = Boolean(Router);

  const canRenderOrNavigate =
    Boolean(
      hasRender ||
        hasNavigate ||
        hasGo ||
        hasPush ||
        hasRerender ||
        routerSnapshot?.initialRenderDone ||
        routerSnapshot?.ready ||
        routerSnapshot?.configured
    );

  return {
    present,

    configured:
      Boolean(
        present &&
          (
            Router?.configured ||
            Router?.isConfigured ||
            hasRouteResolver ||
            canRenderOrNavigate ||
            routerSnapshot?.configured
          )
      ),

    bound:
      Boolean(
        Router?.bound ||
          Router?.isBound ||
          routerSnapshot?.bound
      ),

    ready:
      Boolean(
        Router?.ready ||
          routerSnapshot?.ready
      ),

    hasRender,
    hasNavigate,
    hasGo,
    hasPush,
    hasBind,
    hasBack,
    hasRerender,
    hasRouteResolver,

    canRenderOrNavigate,

    currentCanonicalPath:
      redactTokenInText(
        getRouterCurrentCanonicalPath(Router)
      ),

    currentPublicPath:
      redactTokenInText(
        getRouterCurrentPublicPath(Router)
      ),

    stateRoute:
      redactTokenInText(
        state.route || DEFAULT_ROUTE
      ),

    statePublicPath:
      redactTokenInText(
        state.publicPath || DEFAULT_ROUTE
      ),

    initialRouteRendered:
      Boolean(
        state.initialRouteRendered ||
          routerSnapshot?.initialRouteRendered ||
          routerSnapshot?.firstRenderDone
      ),

    snapshot:
      sanitizeSnapshotValue(routerSnapshot),
  };
}

function getStoreSnapshot(Store = null) {
  let state = {};

  try {
    state =
      ensureObject(Store?.getState?.());
  } catch {}

  return {
    present:
      Boolean(Store),

    hasInit:
      isFunction(Store?.init),

    hasGetState:
      isFunction(Store?.getState),

    hasSetState:
      isFunction(Store?.setState),

    hasPatchState:
      isFunction(Store?.patchState),

    hasActions:
      Boolean(Store?.actions),

    ready:
      Boolean(
        state.ready ||
          Store?.state?.ready
      ),

    booted:
      Boolean(
        state.booted ||
          Store?.state?.booted
      ),

    state:
      sanitizeSnapshotValue({
        ready:
          state.ready,

        booted:
          state.booted,

        loading:
          state.loading,

        error:
          state.error,
      }),
  };
}

function getUiModuleSnapshot(moduleRef = null) {
  let snapshot = null;

  try {
    snapshot =
      moduleRef?.getSnapshot?.() ||
      moduleRef?.getState?.() ||
      null;
  } catch {}

  return {
    present:
      Boolean(moduleRef),

    initialized:
      Boolean(
        moduleRef?.initialized ||
          moduleRef?.ready ||
          moduleRef?.mounted ||
          snapshot?.initialized ||
          snapshot?.ready ||
          snapshot?.mounted
      ),

    hasInit:
      isFunction(moduleRef?.init),

    hasBoot:
      isFunction(moduleRef?.boot),

    hasMount:
      isFunction(moduleRef?.mount),

    hasStart:
      isFunction(moduleRef?.start),

    hasRepair:
      isFunction(moduleRef?.repair),

    hasRefresh:
      isFunction(moduleRef?.refresh),

    hasSync:
      isFunction(moduleRef?.sync),

    hasUserSync:
      Boolean(
        isFunction(moduleRef?.renderUser) ||
          isFunction(moduleRef?.refreshUser) ||
          isFunction(moduleRef?.updateUser) ||
          isFunction(moduleRef?.syncUser)
      ),

    hasRebind:
      Boolean(
        isFunction(moduleRef?.rebind) ||
          isFunction(moduleRef?.rebindEvents) ||
          isFunction(moduleRef?.bindEvents) ||
          isFunction(moduleRef?.bind)
      ),

    snapshot:
      sanitizeSnapshotValue(snapshot),
  };
}

function getI18nAvailable(I18n = null) {
  try {
    const available =
      I18n?.getAvailable?.() ||
      I18n?.getAvailableLangs?.() ||
      I18n?.getLanguages?.() ||
      I18n?.available ||
      I18n?.langs ||
      [];

    if (Array.isArray(available)) {
      return available;
    }

    if (isObject(available)) {
      return Object.keys(available);
    }
  } catch {}

  return [];
}

function getI18nLang(AppCore, I18n = null) {
  const state = ensureObject(AppCore?.state);

  const documentLang =
    isBrowser()
      ? safeText(
          document.documentElement?.lang ||
            document.documentElement?.getAttribute?.("lang"),
          ""
        )
      : "";

  return safeText(
    safeCall(
      () => I18n?.getLang?.(),
      ""
    ) ||
      safeCall(
        () => I18n?.getLanguage?.(),
        ""
      ) ||
      I18n?.lang ||
      I18n?.language ||
      state.lang ||
      documentLang ||
      DEFAULT_LANG,
    DEFAULT_LANG
  );
}

function getI18nSnapshot(AppCore, I18n = null) {
  const state = ensureObject(AppCore?.state);

  const documentLang =
    isBrowser()
      ? safeText(
          document.documentElement?.lang ||
            document.documentElement?.getAttribute?.("lang"),
          ""
        )
      : "";

  const available =
    getI18nAvailable(I18n);

  const lang =
    getI18nLang(
      AppCore,
      I18n
    );

  const modulePresent =
    Boolean(I18n);

  const runtimePresent =
    Boolean(
      modulePresent ||
        state.i18nInitialized ||
        state.lang ||
        documentLang
    );

  return {
    present:
      runtimePresent,

    modulePresent,

    initialized:
      Boolean(
        state.i18nInitialized ||
          modulePresent ||
          state.lang ||
          documentLang
      ),

    lang,

    stateLang:
      state.lang || DEFAULT_LANG,

    documentLang:
      documentLang || null,

    available,

    hasTranslate:
      isFunction(I18n?.t),

    hasBoot:
      Boolean(
        isFunction(I18n?.boot) ||
          isFunction(I18n?.init)
      ),

    hasSetLang:
      Boolean(
        isFunction(I18n?.setLang) ||
          isFunction(I18n?.changeLanguage) ||
          isFunction(I18n?.use)
      ),
  };
}

/* =========================================================
   APP STATE SNAPSHOT
========================================================= */

function getAppStateSnapshot(AppCore) {
  const state = ensureObject(AppCore?.state);
  const config = ensureObject(AppCore?.config);

  return {
    apiBase:
      config.apiBase || null,

    environment:
      config.env ||
      config.environment ||
      null,

    baseHref:
      config.baseHref ||
      config.base ||
      null,

    appName:
      config.appName ||
      config.name ||
      null,

    authenticated:
      Boolean(state.authenticated),

    hasToken:
      Boolean(
        state.token ||
          state.accessToken ||
          state.access_token ||
          state.session?.token ||
          state.session?.accessToken ||
          state.auth?.token ||
          state.auth?.accessToken
      ),

    role:
      state.role ||
      state.rol ||
      state.userRole ||
      null,

    route:
      redactTokenInText(
        state.route || DEFAULT_ROUTE
      ),

    publicPath:
      redactTokenInText(
        state.publicPath || DEFAULT_ROUTE
      ),

    currentResolvedUsername:
      state.currentResolvedUsername || null,

    theme:
      state.theme || DEFAULT_THEME,

    mode:
      state.mode || null,

    appearance:
      state.appearance || null,

    lang:
      state.lang || DEFAULT_LANG,

    language:
      state.language || state.lang || DEFAULT_LANG,

    locale:
      state.locale || state.lang || DEFAULT_LANG,

    sidebarOpen:
      typeof state.sidebarOpen === "boolean"
        ? state.sidebarOpen
        : null,

    shellVisible:
      typeof state.shellVisible === "boolean"
        ? state.shellVisible
        : null,

    chromeVisible:
      typeof state.chromeVisible === "boolean"
        ? state.chromeVisible
        : null,

    booting:
      Boolean(state.booting),

    booted:
      Boolean(state.booted),

    ready:
      Boolean(
        state.ready ||
          state.appReady
      ),

    loading:
      Boolean(state.loading),

    restoring:
      Boolean(
        state.restoring ||
          state.authRestoring ||
          state.sessionRestoring
      ),

    bootPhase:
      state.bootPhase || null,

    bootCycleId:
      state.bootCycleId || 0,

    uiInitialized:
      Boolean(state.uiInitialized),

    i18nInitialized:
      Boolean(state.i18nInitialized),

    initialRouteRendered:
      Boolean(state.initialRouteRendered),

    bootNavigationHandled:
      Boolean(state.bootNavigationHandled),

    loginInProgress:
      Boolean(state.loginInProgress),
  };
}

/* =========================================================
   WARNINGS / HEALTH
========================================================= */

function buildWarmupWarnings(snapshot = {}) {
  const warnings = [];

  if (!snapshot.app?.apiBase) {
    warnings.push({
      code: "API_BASE_MISSING",
      severity: "medium",
      message: "apiBase no configurada.",
    });
  }

  if (
    snapshot.auth?.authenticated &&
    !snapshot.auth?.user?.username
  ) {
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
      message:
        "Sesión autenticada sin token/header/storage visible. Si la sesión usa cookie HttpOnly, este aviso es esperado.",
    });
  }

  if (
    !snapshot.router?.present &&
    !snapshot.router?.stateRoute &&
    !snapshot.router?.statePublicPath
  ) {
    warnings.push({
      code: "ROUTER_UNAVAILABLE",
      severity: "high",
      message: "Router no detectable en deps/AppCore.",
    });
  }

  if (
    snapshot.router?.present &&
    !snapshot.router?.canRenderOrNavigate &&
    !snapshot.router?.configured
  ) {
    warnings.push({
      code: "ROUTER_NOT_READY",
      severity: "high",
      message: "Router detectado pero sin capacidad de navegación/render aparente.",
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

  if (
    snapshot.app?.ready &&
    !snapshot.app?.loading &&
    snapshot.shell?.loaderVisible
  ) {
    warnings.push({
      code: "LOADER_VISIBLE_AFTER_READY",
      severity: "medium",
      message: "El loader parece visible aunque la app está lista.",
    });
  }

  if (
    snapshot.auth?.authenticated &&
    !snapshot.location?.authLike &&
    snapshot.shell?.authScreen
  ) {
    warnings.push({
      code: "AUTH_SCREEN_STALE_ON_PRIVATE_ROUTE",
      severity: "medium",
      message: "Quedan clases de auth-screen en una ruta no auth-like.",
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
      message:
        "Se detecta token público preservado, pero la ruta actual ya no parece auth-like. Verifica que no se haya redirigido durante boot.",
    });
  }

  /*
    No avisamos I18N_UNAVAILABLE si:
    - AppCore.state.lang existe
    - state.i18nInitialized está activo
    - documentElement.lang existe
    - I18n se resuelve desde AppCore/modules
  */
  if (
    !snapshot.i18n?.present &&
    !snapshot.app?.lang &&
    !snapshot.document?.lang
  ) {
    warnings.push({
      code: "I18N_UNAVAILABLE",
      severity: "low",
      message: "No se detecta idioma runtime ni módulo I18n.",
    });
  }

  return warnings;
}

function computeWarmupHealth(snapshot = {}) {
  const warnings =
    safeArray(snapshot.warnings);

  let score = 100;

  for (const warning of warnings) {
    const severity =
      safeText(warning.severity, "low");

    if (severity === "critical") {
      score -= 35;
    } else if (severity === "high") {
      score -= 22;
    } else if (severity === "medium") {
      score -= 12;
    } else {
      score -= 5;
    }
  }

  score =
    Math.max(
      0,
      Math.min(100, score)
    );

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

    criticalCount:
      warnings.filter((item) => item.severity === "critical").length,

    highCount:
      warnings.filter((item) => item.severity === "high").length,

    mediumCount:
      warnings.filter((item) => item.severity === "medium").length,

    lowCount:
      warnings.filter((item) => item.severity === "low").length,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function createWarmupSnapshot(first = {}, second = {}) {
  const deps =
    resolveRuntimeDeps(first, second);

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

  const startedAt = Date.now();

  const rawSnapshot = {
    version:
      WARMUP_VERSION,

    ok:
      Boolean(AppCore),

    reason:
      safeText(reason, "warmup"),

    at:
      safeIsoDate(startedAt),

    atMs:
      startedAt,

    browser:
      isBrowser(),

    location:
      getLocationSnapshot(),

    document:
      getDocumentSnapshot(),

    navigator:
      getNavigatorSnapshot(),

    history:
      getHistorySnapshot(),

    performance:
      getPerformanceSnapshot(),

    storage:
      getStorageTokenHints(),

    bootContext:
      getBootContextSnapshot(),

    publicTokenRoutes:
      getProtectedTokenRouteSnapshot(),

    app:
      getAppStateSnapshot(AppCore),

    auth:
      getAuthSnapshot(
        AppCore,
        Auth
      ),

    router:
      getRouterSnapshot(
        AppCore,
        Router
      ),

    store:
      getStoreSnapshot(Store),

    i18n:
      getI18nSnapshot(
        AppCore,
        I18n
      ),

    ui: {
      toast:
        getUiModuleSnapshot(Toast),

      sidebar:
        getUiModuleSnapshot(SidebarUI),

      topbar:
        getUiModuleSnapshot(TopbarUI),
    },

    shell:
      getShellSnapshot(AppCore),
  };

  const snapshot =
    sanitizeSnapshotValue(rawSnapshot);

  snapshot.warnings =
    buildWarmupWarnings(snapshot);

  snapshot.warningCount =
    snapshot.warnings.length;

  snapshot.health =
    computeWarmupHealth(snapshot);

  return snapshot;
}

/* =========================================================
   SUMMARY / STATE
========================================================= */

export function getWarmupSummary(snapshot = {}) {
  const data = ensureObject(snapshot);

  return {
    ok:
      Boolean(data.ok),

    version:
      data.version || WARMUP_VERSION,

    at:
      data.at || "",

    durationMs:
      safeNumber(
        data.durationMs,
        0
      ),

    warningCount:
      safeNumber(
        data.warningCount,
        0
      ),

    health:
      data.health || null,

    authenticated:
      Boolean(
        data.auth?.authenticated
      ),

    username:
      data.auth?.user?.username || null,

    role:
      data.auth?.role || null,

    route:
      data.app?.route || DEFAULT_ROUTE,

    publicPath:
      data.app?.publicPath || DEFAULT_ROUTE,

    apiBase:
      data.app?.apiBase || null,

    lang:
      data.app?.lang || DEFAULT_LANG,

    theme:
      data.app?.theme || DEFAULT_THEME,

    booting:
      Boolean(data.app?.booting),

    booted:
      Boolean(data.app?.booted),

    ready:
      Boolean(data.app?.ready),

    loading:
      Boolean(data.app?.loading),

    restoring:
      Boolean(data.app?.restoring),

    initialRouteRendered:
      Boolean(data.app?.initialRouteRendered),

    bootNavigationHandled:
      Boolean(data.app?.bootNavigationHandled),

    publicTokenRoute:
      Boolean(data.publicTokenRoutes?.anyMatched),

    publicTokenPresent:
      Boolean(data.publicTokenRoutes?.anyHasToken),

    publicTokenScrubbed:
      Boolean(data.publicTokenRoutes?.anyScrubbed),

    routerPresent:
      Boolean(data.router?.present),

    routerConfigured:
      Boolean(data.router?.configured),

    routerBound:
      Boolean(data.router?.bound),

    routerCanRenderOrNavigate:
      Boolean(data.router?.canRenderOrNavigate),

    i18nPresent:
      Boolean(data.i18n?.present),

    i18nModulePresent:
      Boolean(data.i18n?.modulePresent),

    hasAppShell:
      Boolean(
        data.shell?.elements?.shell?.exists
      ),

    hasViewContainer:
      Boolean(
        data.shell?.elements?.viewContainer?.exists
      ),

    hasLoader:
      Boolean(
        data.shell?.elements?.loader?.exists
      ),

    loaderVisible:
      Boolean(data.shell?.loaderVisible),

    hasSidebar:
      Boolean(
        data.shell?.elements?.sidebar?.exists ||
          data.shell?.elements?.sidebarMount?.exists
      ),

    hasTopbar:
      Boolean(
        data.shell?.elements?.topbar?.exists ||
          data.shell?.elements?.topbarMount?.exists
      ),

    authScreen:
      Boolean(data.shell?.authScreen),

    chromeVisible:
      Boolean(data.shell?.chromeVisible),
  };
}

function rememberSnapshot(snapshot = {}) {
  lastSnapshot = snapshot;
  lastSummary = getWarmupSummary(snapshot);

  recentSnapshots.unshift({
    at:
      snapshot.at,

    reason:
      snapshot.reason,

    summary:
      lastSummary,
  });

  if (recentSnapshots.length > MAX_RECENT_SNAPSHOTS) {
    recentSnapshots.splice(MAX_RECENT_SNAPSHOTS);
  }

  return snapshot;
}

export function getWarmupRuntimeSnapshot() {
  return {
    version:
      WARMUP_VERSION,

    warmupCount,

    lastWarmupAt,

    lastWarmupAtIso:
      lastWarmupAt
        ? safeIsoDate(lastWarmupAt)
        : "",

    lastWarmupDurationMs,

    lastWarningKey:
      redactTokenInText(lastWarningKey),

    lastWarningAt,

    lastWarningAtIso:
      lastWarningAt
        ? safeIsoDate(lastWarningAt)
        : "",

    lastLogKey:
      redactTokenInText(lastLogKey),

    lastLogAt,

    lastLogAtIso:
      lastLogAt
        ? safeIsoDate(lastLogAt)
        : "",

    lastEventKey:
      redactTokenInText(lastEventKey),

    lastEventAt,

    lastEventAtIso:
      lastEventAt
        ? safeIsoDate(lastEventAt)
        : "",

    lastSummary,

    recentSnapshots:
      recentSnapshots.slice(),
  };
}

export function resetWarmupRuntimeState() {
  lastWarningKey = "";
  lastWarningAt = 0;

  lastLogKey = "";
  lastLogAt = 0;

  lastEventKey = "";
  lastEventAt = 0;

  lastSnapshot = null;
  lastSummary = null;

  warmupCount = 0;
  lastWarmupAt = 0;
  lastWarmupDurationMs = 0;

  recentSnapshots.splice(0);

  return getWarmupRuntimeSnapshot();
}

/* =========================================================
   DEBUG API
========================================================= */

export function exposeWarmupDebugApi(first = {}, second = {}) {
  const deps =
    resolveRuntimeDeps(first, second);

  const {
    AppCore,
  } = deps;

  const api = {
    version:
      WARMUP_VERSION,

    createSnapshot:
      (options = {}) =>
        createWarmupSnapshot({
          ...deps,
          ...ensureObject(options),
        }),

    run:
      (options = {}) =>
        warmup({
          ...deps,
          ...ensureObject(options),
        }),

    getLastSnapshot:
      () =>
        lastSnapshot,

    getLastSummary:
      () =>
        lastSummary,

    getRuntimeSnapshot:
      getWarmupRuntimeSnapshot,

    reset:
      resetWarmupRuntimeState,
  };

  try {
    if (isBrowser()) {
      window.__ONION_WARMUP__ = api;
    }
  } catch {}

  try {
    safeDefineValue(
      AppCore,
      "Warmup",
      api
    );
  } catch {}

  safeEmit(
    AppCore,
    WARMUP_EVENTS.debugReady,
    {
      version:
        WARMUP_VERSION,

      at:
        safeIsoDate(),
    }
  );

  return api;
}

/* =========================================================
   PRINT
========================================================= */

export function printWarmupSummary(snapshot = {}, AppCore = null) {
  const summary =
    getWarmupSummary(snapshot);

  safeInfo(
    AppCore,
    "Warmup summary:",
    summary
  );

  return summary;
}

/* =========================================================
   WARMUP
========================================================= */

export async function warmup(first = {}, second = {}) {
  const deps =
    resolveRuntimeDeps(first, second);

  const {
    AppCore,
    emit = true,
    log = true,
    exposeDebug = true,
    reason = "warmup",
  } = deps;

  const startedAt = Date.now();

  const snapshot =
    createWarmupSnapshot({
      ...deps,
      reason,
    });

  snapshot.durationMs =
    Date.now() - startedAt;

  warmupCount += 1;
  lastWarmupAt = Date.now();
  lastWarmupDurationMs = snapshot.durationMs;

  rememberSnapshot(snapshot);

  try {
    if (
      AppCore &&
      exposeDebug !== false
    ) {
      exposeWarmupDebugApi({
        ...deps,
        AppCore,
      });
    }

    if (
      AppCore &&
      log &&
      shouldLogSnapshot(snapshot)
    ) {
      safeLog(
        AppCore,
        "Warmup app ejecutado.",
        {
          reason:
            snapshot.reason,

          health:
            snapshot.health,

          warningCount:
            snapshot.warningCount,

          durationMs:
            snapshot.durationMs,
        }
      );

      safeLog(
        AppCore,
        "Diagnóstico inicial:",
        snapshot
      );
    }

    for (const warning of snapshot.warnings || []) {
      const shouldEmit =
        shouldEmitWarning(warning);

      if (
        AppCore &&
        log &&
        shouldEmit
      ) {
        safeWarn(
          AppCore,
          "Warmup aviso:",
          warning.code,
          warning.severity,
          warning.message
        );
      }

      if (
        AppCore &&
        emit &&
        shouldEmit
      ) {
        safeEmit(
          AppCore,
          WARMUP_EVENTS.warning,
          {
            warning,
            reason:
              snapshot.reason,
            at:
              safeIsoDate(),
          }
        );
      }
    }

    if (
      AppCore &&
      emit
    ) {
      safeEmit(
        AppCore,
        WARMUP_EVENTS.warmup,
        snapshot
      );

      safeEmit(
        AppCore,
        WARMUP_EVENTS.summary,
        getWarmupSummary(snapshot)
      );

      safeEmit(
        AppCore,
        WARMUP_EVENTS.ready,
        {
          ok:
            snapshot.ok,

          reason:
            snapshot.reason,

          health:
            snapshot.health,

          warningCount:
            snapshot.warningCount,

          durationMs:
            snapshot.durationMs,

          at:
            safeIsoDate(),
        }
      );
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
