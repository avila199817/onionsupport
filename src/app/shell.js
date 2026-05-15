/* =========================================================
   Onion SPA - App Shell
   Archivo: /src/app/shell.js

   ONION SUPPORT · APP SHELL CONTROLLER
   NO FLICKER · BOOT LOADER ALIGNED · CSP CLEAN · 16/10

   RESPONSABILIDADES:
   - Resolver elementos principales del shell.
   - Controlar visibilidad de chrome: sidebar/topbar/tablehead.
   - Mantener #app-shell estable en login/reset/activate.
   - Sincronizar aria-busy / aria-hidden / data-shell / data-chrome.
   - Evitar ocultar loader global durante boot.
   - Evitar re-toggle visual innecesario.
   - Emitir eventos de shell sin duplicar bus + window.
   - Snapshot robusto para debug.
   - Soportar rutas públicas técnicas con token query/path/hash.
   - Soportar hash-router /#/login y /#/activate-account?token=...
   - Soportar publicPath con /@usuario.
   - No degradar /@usuario/incidencias a /.
   - No montar Sidebar/Topbar.
   - No controlar el loader real; eso vive en loader.js.
   - No decidir navegación; eso vive en router.
   - Sin CSS inline.
   - Sin estilos inyectados.

   EXTREME MODE:
   - Auth/public route detection por path, hash-router y aliases.
   - Protección fuerte de activate/reset con token en path/query/hash.
   - App shell nunca se oculta físicamente salvo hideAppShell explícito.
   - Chrome y shell son conceptos separados.
   - Sync DOM idempotente para montajes tardíos de Sidebar/Topbar.
   - Loader no se oculta durante boot salvo force.
   - Eventos deduplicados y sanitizados.
   - Snapshot profundo para diagnóstico.

   FIX:
   - TOKEN_PARAM_NAMES se declara antes de TOKEN_ROUTE_CONFIGS.
   - Evita ReferenceError por TDZ:
     Cannot access 'TOKEN_PARAM_NAMES' before initialization.
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

export const SHELL_VERSION =
  "16.0.0-extreme-pro";

const SHELL_SOURCE =
  "app:shell";

const DEFAULT_ROUTE =
  APP_DEFAULT_ROUTE ||
  "/";

const SHELL_RUNTIME_KEY =
  APP_RUNTIME_KEYS?.shell ||
  "__ONION_APP_SHELL__";

const SHELL_EVENTS =
  Object.freeze({
    change:
      ROUTER_EVENTS?.shellChange ||
      "router:shell:change",

    state:
      ROUTER_EVENTS?.shellState ||
      "router:shell:state",

    appState:
      APP_EVENTS?.shellState ||
      "app:shell:state",

    postRender:
      APP_EVENTS?.shellPostRender ||
      "app:shell:post-render",

    ready:
      APP_EVENTS?.shellReady ||
      "app:shell:ready",

    busy:
      APP_EVENTS?.shellBusy ||
      "app:shell:busy",

    elements:
      "app:shell:elements",

    error:
      "app:shell:error",

    debugApi:
      "app:shell:debug-api",
  });

const DOM_SELECTORS =
  Object.freeze({
    appShell:
      Object.freeze(compactList(
        APP_SELECTORS?.appShell,
        APP_SELECTORS?.shell,
        "#app-shell",
        "[data-app-shell='true']",
        "[data-app-shell]",
        ".app-shell",
        ".layout"
      )),

    mainContent:
      Object.freeze(compactList(
        APP_SELECTORS?.mainContent,
        APP_SELECTORS?.main,
        "#main-content",
        "main.main-content",
        "[data-main-content='true']",
        "[data-main-content]",
        ".main-content"
      )),

    appContent:
      Object.freeze(compactList(
        APP_SELECTORS?.appContent,
        "#app-content",
        "[data-app-content='true']",
        "[data-app-content]",
        ".app-content"
      )),

    viewContainer:
      Object.freeze(compactList(
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

    sidebarMount:
      Object.freeze(compactList(
        APP_SELECTORS?.sidebarMount,
        "#sidebar-mount",
        "[data-sidebar-mount='true']",
        "[data-sidebar-mount]"
      )),

    topbarMount:
      Object.freeze(compactList(
        APP_SELECTORS?.topbarMount,
        "#topbar-mount",
        "[data-topbar-mount='true']",
        "[data-topbar-mount]"
      )),

    sidebar:
      Object.freeze(compactList(
        APP_SELECTORS?.sidebar,
        "#app-sidebar",
        "#sidebar",
        ".sidebar",
        "[data-sidebar-root='true']",
        "[data-sidebar-root]",
        "[data-sidebar]"
      )),

    topbar:
      Object.freeze(compactList(
        APP_SELECTORS?.topbar,
        "#app-topbar",
        "#topbar",
        ".topbar",
        "[data-topbar-root='true']",
        "[data-topbar-root]",
        "[data-topbar]"
      )),

    tablehead:
      Object.freeze(compactList(
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

    tableheadContainer:
      Object.freeze(compactList(
        APP_SELECTORS?.tableheadContainer,
        APP_SELECTORS?.tableHeadContainer,
        "#tablehead-container",
        "#table-head-container",
        ".tablehead-container",
        "[data-tablehead-container='true']",
        "[data-tablehead-container]",
        "[data-table-head-container]"
      )),

    mobileSidebarToggle:
      Object.freeze(compactList(
        APP_SELECTORS?.mobileSidebarToggle,
        "#toggleSidebarMobile",
        "[data-sidebar-mobile-toggle]",
        "[data-mobile-sidebar-toggle]",
        "[data-action='toggle-sidebar-mobile']"
      )),

    loader:
      Object.freeze(compactList(
        APP_SELECTORS?.loader,
        APP_SELECTORS?.appLoader,
        "#app-loader",
        "#boot-loader",
        "[data-app-loader='true']",
        "[data-app-loader]",
        ".app-loader"
      )),
  });

const FALLBACK_LOGIN_PATHS =
  Object.freeze([
    "/login",
    "/signin",
    "/sign-in",
  ]);

const FALLBACK_REGISTER_PATHS =
  Object.freeze([
    "/register",
    "/signup",
    "/sign-up",
  ]);

const FALLBACK_RESET_PASSWORD_PATHS =
  Object.freeze([
    "/forgot-password",
    "/recover-password",
    "/password-reset",
    "/password-reset/request",
    "/reset-password",
    "/reset-password/request",
    "/reset-password-request",
    "/request-reset-password",
  ]);

const FALLBACK_RESET_CONFIRM_PATHS =
  Object.freeze([
    "/reset-password/confirm",
    "/reset-password-confirm",
    "/password-reset/confirm",
    "/password-reset-confirm",
    "/confirm-reset-password",
  ]);

const FALLBACK_ACTIVATION_PATHS =
  Object.freeze([
    "/activate-account",
    "/activate",
    "/activation",
    "/account/activate",
    "/activate/first-user",
  ]);

const LOGIN_PATHS =
  Object.freeze(
    normalizeRouteList(FALLBACK_LOGIN_PATHS)
  );

const REGISTER_PATHS =
  Object.freeze(
    normalizeRouteList(FALLBACK_REGISTER_PATHS)
  );

const RESET_PASSWORD_PATHS =
  Object.freeze(
    normalizeRouteList(FALLBACK_RESET_PASSWORD_PATHS)
  );

const RESET_CONFIRM_PATHS =
  Object.freeze(
    normalizeRouteList(FALLBACK_RESET_CONFIRM_PATHS)
  );

const ACTIVATION_PATHS =
  Object.freeze(
    normalizeRouteList(FALLBACK_ACTIVATION_PATHS)
  );

const AUTH_LIKE_PATHS =
  Object.freeze(
    normalizeRouteList([
      ...safeArray(AUTH_LIKE_ROUTES),
      ...LOGIN_PATHS,
      ...REGISTER_PATHS,
      ...RESET_PASSWORD_PATHS,
      ...RESET_CONFIRM_PATHS,
      ...ACTIVATION_PATHS,
    ])
  );

const AUTH_LIKE_PREFIXES =
  Object.freeze(
    normalizeRouteList([
      ...safeArray(PUBLIC_TECHNICAL_PREFIXES),
      ...ACTIVATION_PATHS.map((path) => `${path}/`),
      ...RESET_CONFIRM_PATHS.map((path) => `${path}/`),
    ])
  );

/*
  CRÍTICO:
  Debe existir antes de TOKEN_ROUTE_CONFIGS, porque normalizeTokenRouteConfigs()
  lo lee durante la evaluación del módulo.
*/
const TOKEN_PARAM_NAMES =
  Object.freeze([
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

const TOKEN_ROUTE_CONFIGS =
  Object.freeze(
    normalizeTokenRouteConfigs(
      PROTECTED_PUBLIC_TOKEN_ROUTES
    )
  );

const BOOT_BODY_CLASSES =
  Object.freeze([
    "app-booting",
    "app-loading",
    "is-booting",
    "is-loading",
    "loading",
  ]);

const HIDDEN_LOADER_CLASSES =
  Object.freeze([
    "is-hidden",
    "has-hidden",
    "loader-hidden",
  ]);

const VISIBLE_LOADER_CLASSES =
  Object.freeze([
    "is-visible",
    "is-entering",
    "is-leaving",
    "loader-visible",
  ]);

const CHROME_HIDDEN_CLASS =
  "route-chrome-hidden";

const CHROME_VISIBLE_CLASS =
  "route-chrome-visible";

const SHELL_HIDDEN_CLASS =
  "route-shell-hidden";

const SHELL_VISIBLE_CLASS =
  "route-shell-visible";

const ROUTE_AUTH_CLASS =
  "route-auth";

const ROUTE_APP_CLASS =
  "route-app";

const AUTH_SCREEN_CLASS =
  "auth-screen";

const LOGIN_NO_SCROLL_CLASS =
  "login-no-scroll";

const SHELL_EVENT_DEDUPE_MS =
  40;

const SNAPSHOT_MAX_CLASS_LENGTH =
  800;

/* =========================================================
   RUNTIME
========================================================= */

let lastShellEventKey =
  "";

let lastShellEventAt =
  0;

let lastShellError =
  null;

let debugApiInstalled =
  false;

let debugApiRef =
  null;

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

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeIsoDate(ms = safeNow()) {
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

function isObjectLike(value) {
  return (
    value !== null &&
    (
      typeof value === "object" ||
      typeof value === "function"
    )
  );
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

function safeArrayFromClassList(classList) {
  try {
    return Array.from(classList || []);
  } catch {
    return [];
  }
}

function compactList(...values) {
  return Array.from(
    new Set(
      values
        .flat(Infinity)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    )
  );
}

/* =========================================================
   TOKEN / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function redactTokenInText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      output =
        output.replace(
          new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  for (const config of TOKEN_ROUTE_CONFIGS) {
    for (const path of safeArray(config.paths)) {
      try {
        output =
          output.replace(
            new RegExp(`(${escapeRegExp(path)}\\/)([^/?#\\s]+)`, "gi"),
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

function sanitizePayload(value, depth = 0) {
  if (depth > 5) {
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

  if (typeof value === "bigint") {
    return String(value);
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
        safeText(
          value.className?.baseVal ||
            value.className,
          ""
        ).slice(0, SNAPSHOT_MAX_CLASS_LENGTH),
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizePayload(
          item,
          depth + 1
        )
      );
  }

  if (value instanceof Error) {
    return {
      name:
        safeText(value.name, "Error"),

      message:
        redactTokenInText(value.message || ""),

      code:
        value.code || null,

      status:
        value.status ||
        value.statusCode ||
        null,
    };
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (/token|secret|password|authorization|credential|jwt|bearer|session|refresh/i.test(key)) {
        output[key] =
          item ? "***" : item;
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

  return String(value);
}

/* =========================================================
   LOG / EMIT / ERROR
========================================================= */

function safeLog(AppCore, ...args) {
  const safeArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  try {
    AppCore?.utils?.log?.(
      "[AppShell]",
      ...safeArgs
    );

    return;
  } catch {}

  try {
    console.log(
      "[AppShell]",
      ...safeArgs
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  const safeArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  let coreLogged =
    false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[AppShell]",
        ...safeArgs
      );

      coreLogged =
        true;
    }
  } catch {
    coreLogged =
      false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.warn(
      "[AppShell]",
      ...safeArgs
    );
  } catch {}
}

function normalizeError(error = null) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return {
      name:
        "ShellError",
      message:
        redactTokenInText(error),
      code:
        "SHELL_ERROR",
    };
  }

  const object =
    safeObject(error);

  return {
    name:
      safeText(
        object.name,
        "ShellError"
      ),

    message:
      redactTokenInText(
        safeText(
          object.message || error,
          "Error en App Shell."
        )
      ),

    code:
      safeText(
        object.code ||
          object.status ||
          object.statusCode,
        "SHELL_ERROR"
      ),
  };
}

function safeCreateCustomEvent(name = "", detail = {}) {
  if (!isBrowser()) {
    return null;
  }

  const eventName =
    safeText(name, "");

  if (!eventName) {
    return null;
  }

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(
        eventName,
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
      eventName,
      false,
      false,
      detail
    );

    return event;
  } catch {
    return null;
  }
}

function safeEmit(AppCore, name = "", payload = {}, options = {}) {
  const eventName =
    safeText(name, "");

  if (!eventName) {
    return false;
  }

  const opts =
    safeObject(options);

  const cleanPayload =
    sanitizePayload(payload);

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        eventName,
        cleanPayload
      );

      busEmitted =
        true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      const event =
        safeCreateCustomEvent(
          eventName,
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

function emitShellEvent(AppCore, name = "", payload = {}, options = {}) {
  const opts =
    safeObject(options);

  if (opts.dedupe === false) {
    return safeEmit(
      AppCore,
      name,
      payload,
      opts
    );
  }

  const key =
    [
      safeText(name, ""),
      payload?.chromeVisible ? "chrome-visible" : "chrome-hidden",
      payload?.appShellVisible ? "shell-visible" : "shell-hidden",
      payload?.authLike ? "auth" : "app",
      payload?.busy ? "busy" : "idle",
      safeText(payload?.canonical || payload?.snapshot?.canonical, ""),
      safeText(payload?.publicPath || payload?.snapshot?.publicPath, ""),
    ].join("|");

  const current =
    safeNow();

  if (
    key === lastShellEventKey &&
    current - lastShellEventAt < SHELL_EVENT_DEDUPE_MS
  ) {
    return false;
  }

  lastShellEventKey =
    key;

  lastShellEventAt =
    current;

  return safeEmit(
    AppCore,
    name,
    {
      version:
        SHELL_VERSION,

      source:
        SHELL_SOURCE,

      at:
        safeIsoDate(),

      ...safeObject(payload),
    },
    opts
  );
}

function recordShellError(AppCore, source = "shell", error = null) {
  lastShellError = {
    source:
      safeText(source, "shell"),

    error:
      normalizeError(error),

    at:
      safeIsoDate(),
  };

  safeWarn(
    AppCore,
    "Shell error:",
    lastShellError
  );

  safeEmit(
    AppCore,
    SHELL_EVENTS.error,
    lastShellError
  );

  return lastShellError;
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

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return normalizeLocalFullPath(
      raw.replace(/^#!\/?/, "/") ||
        DEFAULT_ROUTE
    );
  }

  return normalizeLocalFullPath(
    raw.replace(/^#\/?/, "/") ||
      DEFAULT_ROUTE
  );
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value =
    safeText(pathname, DEFAULT_ROUTE)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value =
      DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  const segments =
    value
      .split("/")
      .filter(Boolean);

  const output = [];

  for (const segment of segments) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      output.pop();
      continue;
    }

    output.push(segment);
  }

  value =
    `/${output.join("/")}`;

  if (!value) {
    value =
      DEFAULT_ROUTE;
  }

  if (value.length > 1) {
    value =
      value.replace(/\/+$/g, "") ||
      DEFAULT_ROUTE;
  }

  return value;
}

function normalizeSearch(search = "") {
  const value =
    safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitFullPath(value = DEFAULT_ROUTE) {
  const raw =
    safeText(value, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    return splitFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) ||
      DEFAULT_ROUTE;
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) ||
      DEFAULT_ROUTE;
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
  const raw =
    safeText(path, DEFAULT_ROUTE);

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeHashRouterPath(parsed.hash);
      }

      return normalizeLocalFullPath(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  const normalized =
    normalizeLocalFullPath(
      path ||
        DEFAULT_ROUTE
    );

  return (
    normalized
      .split("?")[0]
      .split("#")[0] ||
    DEFAULT_ROUTE
  );
}

function normalizeRouteList(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
        .map((item) => normalizePathnameOnly(item))
    )
  );
}

function normalizeTokenRouteConfigs(configs = []) {
  const source =
    safeArray(configs).length
      ? safeArray(configs)
      : [
          {
            key:
              "activation",
            path:
              "/activate-account",
            aliases:
              FALLBACK_ACTIVATION_PATHS,
            tokenParamNames:
              [
                "token",
                "activationToken",
                "activateToken",
                "code",
                "t",
              ],
          },
          {
            key:
              "resetConfirm",
            path:
              "/reset-password/confirm",
            aliases:
              FALLBACK_RESET_CONFIRM_PATHS,
            tokenParamNames:
              [
                "token",
                "resetToken",
                "passwordResetToken",
                "confirmToken",
                "code",
                "t",
              ],
          },
        ];

  return source
    .map((config) => {
      const item =
        safeObject(config);

      const path =
        normalizePathnameOnly(
          item.path ||
            item.route ||
            DEFAULT_ROUTE
        );

      const aliases =
        normalizeRouteList([
          item.aliases,
          item.paths,
        ]);

      const paths =
        normalizeRouteList([
          path,
          aliases,
        ]);

      return Object.freeze({
        key:
          safeText(item.key || item.name || path, ""),

        path,

        paths:
          Object.freeze(paths),

        tokenParamNames:
          Object.freeze(
            compactList(
              item.tokenParamNames,
              item.params,
              TOKEN_PARAM_NAMES
            )
          ),
      });
    })
    .filter((item) =>
      item.key &&
      item.path &&
      item.path !== DEFAULT_ROUTE
    );
}

function isPublicUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(
    safeText(segment, "")
  );
}

function stripPublicUsernamePrefix(path = DEFAULT_ROUTE) {
  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(
      normalizeLocalFullPath(
        path ||
          DEFAULT_ROUTE
      )
    );

  const segments =
    pathname
      .split("/")
      .filter(Boolean);

  if (
    segments.length > 0 &&
    isPublicUsernameSegment(segments[0])
  ) {
    const rest =
      segments.slice(1).join("/");

    const cleanPathname =
      rest
        ? normalizePathnameOnly(`/${rest}`)
        : DEFAULT_ROUTE;

    return `${cleanPathname}${search}${hash}`;
  }

  return `${pathname}${search}${hash}`;
}

function canonicalizeTokenAlias(path = DEFAULT_ROUTE) {
  const normalized =
    normalizeLocalFullPath(path || DEFAULT_ROUTE);

  const {
    pathname,
  } =
    splitFullPath(
      stripPublicUsernamePrefix(normalized)
    );

  for (const config of TOKEN_ROUTE_CONFIGS) {
    for (const routePath of safeArray(config.paths)) {
      if (
        pathname === routePath ||
        pathname.startsWith(`${routePath}/`)
      ) {
        const rest =
          pathname.slice(routePath.length);

        return normalizePathnameOnly(
          `${config.path}${rest}`
        );
      }
    }
  }

  return normalizePathnameOnly(pathname);
}

function normalizePublicShellPath(AppCore, path = DEFAULT_ROUTE) {
  const local =
    normalizeLocalFullPath(path || DEFAULT_ROUTE);

  /*
    publicPath conserva query/hash y /@usuario.
  */
  if (
    local.includes("?") ||
    local.includes("#") ||
    local.startsWith("/@")
  ) {
    return local;
  }

  try {
    if (isFunction(AppCore?.utils?.normalizePath)) {
      const external =
        normalizeLocalFullPath(
          AppCore.utils.normalizePath(path || DEFAULT_ROUTE) ||
            local
        );

      const localClean =
        stripSearchAndHash(local);

      const externalClean =
        stripSearchAndHash(external);

      if (
        localClean !== DEFAULT_ROUTE &&
        externalClean === DEFAULT_ROUTE
      ) {
        return local;
      }

      return external || local;
    }
  } catch {}

  return local;
}

function normalizeCanonicalShellPath(AppCore, path = DEFAULT_ROUTE) {
  const publicPath =
    normalizePublicShellPath(
      AppCore,
      path || DEFAULT_ROUTE
    );

  const stripped =
    stripPublicUsernamePrefix(publicPath);

  const localCanonical =
    canonicalizeTokenAlias(stripped);

  try {
    if (isFunction(AppCore?.utils?.normalizeCanonicalPath)) {
      const external =
        canonicalizeTokenAlias(
          AppCore.utils.normalizeCanonicalPath(stripped) ||
            localCanonical
        );

      if (
        localCanonical !== DEFAULT_ROUTE &&
        external === DEFAULT_ROUTE
      ) {
        return localCanonical;
      }

      return external || localCanonical;
    }
  } catch {}

  return localCanonical;
}

function getBrowserPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const pathname =
      window.location.pathname ||
      DEFAULT_ROUTE;

    const search =
      window.location.search ||
      "";

    const hash =
      window.location.hash ||
      "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeHashRouterPath(hash);
    }

    return normalizeLocalFullPath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

function pathMatches(paths = [], path = DEFAULT_ROUTE, {
  allowPrefix = false,
} = {}) {
  const clean =
    normalizeCanonicalShellPath(
      null,
      path || DEFAULT_ROUTE
    );

  return safeArray(paths).some((candidate) => {
    const candidatePath =
      normalizePathnameOnly(candidate);

    if (clean === candidatePath) {
      return true;
    }

    return Boolean(
      allowPrefix &&
        clean.startsWith(`${candidatePath}/`)
    );
  });
}

function pathHasAnyToken(path = "") {
  const value =
    safeText(path, "");

  if (!value) {
    return false;
  }

  try {
    const parsed =
      new URL(
        value,
        getBaseOrigin()
      );

    for (const name of TOKEN_PARAM_NAMES) {
      if (parsed.searchParams.get(name)) {
        return true;
      }
    }

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      const hashPath =
        normalizeHashRouterPath(parsed.hash);

      if (pathHasAnyToken(hashPath)) {
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

      const params =
        new URLSearchParams(query ? `?${query}` : "");

      for (const name of TOKEN_PARAM_NAMES) {
        if (params.get(name)) {
          return true;
        }
      }
    }
  } catch {}

  const clean =
    normalizeCanonicalShellPath(
      null,
      value
    );

  for (const config of TOKEN_ROUTE_CONFIGS) {
    for (const routePath of safeArray(config.paths)) {
      if (clean.startsWith(`${routePath}/`)) {
        const token =
          clean
            .slice(`${routePath}/`.length)
            .split("/")[0];

        if (safeText(token, "")) {
          return true;
        }
      }
    }
  }

  return false;
}

/* =========================================================
   DOM LOW LEVEL
========================================================= */

function documentContains(element) {
  if (
    !isBrowser() ||
    !element
  ) {
    return false;
  }

  try {
    return document.contains(element);
  } catch {
    return false;
  }
}

function queryFirst(selectors = []) {
  if (!isBrowser()) {
    return null;
  }

  for (const selector of safeArray(selectors)) {
    const cleanSelector =
      safeText(selector, "");

    if (!cleanSelector) {
      continue;
    }

    try {
      const element =
        cleanSelector.startsWith("#")
          ? document.getElementById(cleanSelector.slice(1))
          : document.querySelector(cleanSelector);

      if (element) {
        return element;
      }
    } catch {}
  }

  return null;
}

function safeAssignDomCache(AppCore, payload = {}) {
  try {
    if (!AppCore) {
      return false;
    }

    if (
      !AppCore.dom &&
      isExtensibleObject(AppCore)
    ) {
      AppCore.dom =
        {};
    }

    if (!isObject(AppCore.dom)) {
      return false;
    }

    Object.assign(
      AppCore.dom,
      safeObject(payload)
    );

    return true;
  } catch {
    return false;
  }
}

function clearDomCache(AppCore) {
  try {
    if (
      AppCore?.dom &&
      typeof AppCore.dom === "object"
    ) {
      for (const key of [
        "appShell",
        "mainContent",
        "appContent",
        "viewContainer",
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
      ]) {
        delete AppCore.dom[key];
      }
    }
  } catch {}

  return true;
}

function getCachedDomElement(AppCore, key = "", selectors = []) {
  if (!isBrowser()) {
    return null;
  }

  try {
    const cached =
      AppCore?.dom?.[key];

    if (
      cached &&
      documentContains(cached)
    ) {
      return cached;
    }
  } catch {}

  const found =
    queryFirst(selectors);

  if (found) {
    safeAssignDomCache(
      AppCore,
      {
        [key]: found,
      }
    );
  }

  return found;
}

function setDataset(element, key, value) {
  if (
    !element ||
    !key
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete element.dataset[key];
      return true;
    }

    const next =
      String(value);

    if (element.dataset[key] === next) {
      return true;
    }

    element.dataset[key] =
      next;

    return true;
  } catch {
    return false;
  }
}

function toggleClass(element, name, force) {
  if (
    !element ||
    !name
  ) {
    return false;
  }

  try {
    const next =
      Boolean(force);

    if (element.classList.contains(name) === next) {
      return true;
    }

    element.classList.toggle(
      name,
      next
    );

    return true;
  } catch {
    return false;
  }
}

function setAttribute(element, name, value) {
  if (
    !element ||
    !name
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined
    ) {
      if (element.hasAttribute(name)) {
        element.removeAttribute(name);
      }

      return true;
    }

    const next =
      String(value);

    if (element.getAttribute(name) === next) {
      return true;
    }

    element.setAttribute(
      name,
      next
    );

    return true;
  } catch {
    return false;
  }
}

function applyHidden(element, hidden = false) {
  if (!element) {
    return false;
  }

  const next =
    Boolean(hidden);

  try {
    if (element.hidden !== next) {
      element.hidden =
        next;
    }
  } catch {}

  setAttribute(
    element,
    "aria-hidden",
    next ? "true" : "false"
  );

  return true;
}

function applyBusy(element, busy = false) {
  if (!element) {
    return false;
  }

  setAttribute(
    element,
    "aria-busy",
    Boolean(busy) ? "true" : "false"
  );

  return true;
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      appShell:
        null,
      mainContent:
        null,
      appContent:
        null,
      viewContainer:
        null,
      sidebarMount:
        null,
      topbarMount:
        null,
      sidebar:
        null,
      topbar:
        null,
      tablehead:
        null,
      tableheadContainer:
        null,
      mobileSidebarToggle:
        null,
      loader:
        null,
      body:
        null,
      html:
        null,
    };
  }

  const appShell =
    getCachedDomElement(
      AppCore,
      "appShell",
      DOM_SELECTORS.appShell
    );

  const mainContent =
    getCachedDomElement(
      AppCore,
      "mainContent",
      DOM_SELECTORS.mainContent
    );

  const appContent =
    getCachedDomElement(
      AppCore,
      "appContent",
      DOM_SELECTORS.appContent
    );

  const viewContainer =
    getCachedDomElement(
      AppCore,
      "viewContainer",
      DOM_SELECTORS.viewContainer
    );

  const sidebarMount =
    getCachedDomElement(
      AppCore,
      "sidebarMount",
      DOM_SELECTORS.sidebarMount
    );

  const topbarMount =
    getCachedDomElement(
      AppCore,
      "topbarMount",
      DOM_SELECTORS.topbarMount
    );

  const sidebar =
    getCachedDomElement(
      AppCore,
      "sidebar",
      DOM_SELECTORS.sidebar
    );

  const topbar =
    getCachedDomElement(
      AppCore,
      "topbar",
      DOM_SELECTORS.topbar
    );

  const tablehead =
    getCachedDomElement(
      AppCore,
      "tablehead",
      DOM_SELECTORS.tablehead
    );

  const tableheadContainer =
    getCachedDomElement(
      AppCore,
      "tableheadContainer",
      DOM_SELECTORS.tableheadContainer
    );

  const mobileSidebarToggle =
    getCachedDomElement(
      AppCore,
      "sidebarMobileToggle",
      DOM_SELECTORS.mobileSidebarToggle
    ) ||
    getCachedDomElement(
      AppCore,
      "mobileSidebarToggle",
      DOM_SELECTORS.mobileSidebarToggle
    );

  const loader =
    getCachedDomElement(
      AppCore,
      "loader",
      DOM_SELECTORS.loader
    );

  safeAssignDomCache(
    AppCore,
    {
      appShell,
      shell:
        appShell,

      mainContent,
      main:
        mainContent,

      appContent,

      viewContainer,
      viewRoot:
        viewContainer,
      routerView:
        viewContainer,

      sidebarMount,
      topbarMount,

      sidebar,
      topbar,

      tablehead,
      tableHead:
        tablehead,

      tableheadContainer,
      tableHeadContainer:
        tableheadContainer,

      sidebarMobileToggle:
        mobileSidebarToggle,
      mobileSidebarToggle,

      loader,
      appLoader:
        loader,
    }
  );

  return {
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

    body:
      document.body || null,

    html:
      document.documentElement || null,
  };
}

export function getViewContainer(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  const element =
    getCachedDomElement(
      AppCore,
      "viewContainer",
      DOM_SELECTORS.viewContainer
    );

  if (element) {
    safeAssignDomCache(
      AppCore,
      {
        viewContainer:
          element,
        viewRoot:
          element,
        routerView:
          element,
      }
    );
  }

  return element;
}

/* =========================================================
   STATE HELPERS
========================================================= */

function getCoreState(AppCore) {
  return safeObject(AppCore?.state);
}

function setCoreState(AppCore, payload = {}) {
  const cleanPayload =
    safeObject(payload);

  try {
    AppCore?.setState?.(
      cleanPayload,
      {
        source:
          SHELL_SOURCE,
        emit:
          false,
        emitState:
          false,
        silent:
          true,
      }
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        cleanPayload
      );
    }
  } catch {}

  return cleanPayload;
}

function hasBodyBootClass() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return BOOT_BODY_CLASSES.some((className) =>
      Boolean(
        document.body?.classList?.contains(className) ||
          document.documentElement?.classList?.contains(className)
      )
    );
  } catch {
    return false;
  }
}

function isBootingOrLoading(AppCore) {
  const state =
    getCoreState(AppCore);

  return Boolean(
    state.booting ||
      state.loading ||
      state.appBooting ||
      state.bootInProgress ||
      state.loaderVisible ||
      state.sessionRestoring ||
      state.authRestoring ||
      hasBodyBootClass()
  );
}

function elementHasHiddenLoaderClass(loader) {
  if (!loader) {
    return false;
  }

  try {
    return HIDDEN_LOADER_CLASSES.some((className) =>
      loader.classList.contains(className)
    );
  } catch {
    return false;
  }
}

function elementHasVisibleLoaderClass(loader) {
  if (!loader) {
    return false;
  }

  try {
    return VISIBLE_LOADER_CLASSES.some((className) =>
      loader.classList.contains(className)
    );
  } catch {
    return false;
  }
}

function isLoaderVisible(AppCore) {
  const {
    loader,
  } =
    getShellElements(AppCore);

  if (!loader) {
    return false;
  }

  try {
    if (loader.hidden) {
      return false;
    }

    if (loader.getAttribute("aria-hidden") === "true") {
      return false;
    }

    if (elementHasHiddenLoaderClass(loader)) {
      return false;
    }

    const dataVisible =
      safeText(
        loader.dataset?.loaderVisible,
        ""
      );

    if (dataVisible === "false") {
      return false;
    }

    const dataState =
      safeText(
        loader.dataset?.loaderState,
        ""
      );

    if (
      dataState === "hidden" ||
      dataState === "removed"
    ) {
      return false;
    }

    if (elementHasVisibleLoaderClass(loader)) {
      return true;
    }

    return true;
  } catch {
    return false;
  }
}

function hasViewContent(viewContainer) {
  if (!viewContainer) {
    return false;
  }

  try {
    if (viewContainer.childElementCount > 0) {
      return true;
    }
  } catch {}

  try {
    return Boolean(
      safeText(viewContainer.textContent, "")
    );
  } catch {
    return false;
  }
}

function tableheadHasContent(tableheadContainer) {
  if (!tableheadContainer) {
    return false;
  }

  try {
    if (tableheadContainer.childElementCount > 0) {
      return true;
    }
  } catch {}

  try {
    return Boolean(
      safeText(tableheadContainer.textContent, "")
    );
  } catch {
    return false;
  }
}

/* =========================================================
   SHELL DOM STATE
========================================================= */

function setAppShellBusy(AppCore, busy = false) {
  const {
    appShell,
    mainContent,
    appContent,
    viewContainer,
  } =
    getShellElements(AppCore);

  applyBusy(
    appShell,
    busy
  );

  applyBusy(
    mainContent,
    busy
  );

  applyBusy(
    appContent,
    busy
  );

  applyBusy(
    viewContainer,
    busy
  );

  return Boolean(busy);
}

function applyRootShellClasses(root, {
  chromeVisible = true,
  authLike = false,
  appShellVisible = true,
} = {}) {
  if (!root) {
    return false;
  }

  const finalChromeVisible =
    Boolean(chromeVisible);

  const finalAuthLike =
    Boolean(authLike);

  const finalAppShellVisible =
    appShellVisible !== false;

  toggleClass(
    root,
    ROUTE_AUTH_CLASS,
    finalAuthLike
  );

  toggleClass(
    root,
    ROUTE_APP_CLASS,
    !finalAuthLike
  );

  toggleClass(
    root,
    AUTH_SCREEN_CLASS,
    finalAuthLike
  );

  toggleClass(
    root,
    LOGIN_NO_SCROLL_CLASS,
    finalAuthLike
  );

  toggleClass(
    root,
    CHROME_HIDDEN_CLASS,
    !finalChromeVisible
  );

  toggleClass(
    root,
    CHROME_VISIBLE_CLASS,
    finalChromeVisible
  );

  toggleClass(
    root,
    SHELL_VISIBLE_CLASS,
    finalAppShellVisible
  );

  /*
    route-shell-hidden significa chrome/layout oculto,
    NO app-shell.hidden.
  */
  toggleClass(
    root,
    SHELL_HIDDEN_CLASS,
    !finalChromeVisible
  );

  setDataset(
    root,
    "shell",
    finalAppShellVisible ? "visible" : "hidden"
  );

  setDataset(
    root,
    "chrome",
    finalChromeVisible ? "visible" : "hidden"
  );

  setDataset(
    root,
    "routeMode",
    finalAuthLike ? "auth" : "app"
  );

  setDataset(
    root,
    "authScreen",
    finalAuthLike ? "true" : "false"
  );

  setDataset(
    root,
    "appShellVisible",
    finalAppShellVisible ? "true" : "false"
  );

  return true;
}

function applyElementShellDataset(element, {
  chromeVisible = true,
  authLike = false,
  appShellVisible = true,
} = {}) {
  if (!element) {
    return false;
  }

  setDataset(
    element,
    "shell",
    appShellVisible !== false ? "visible" : "hidden"
  );

  setDataset(
    element,
    "chrome",
    chromeVisible ? "visible" : "hidden"
  );

  setDataset(
    element,
    "routeMode",
    authLike ? "auth" : "app"
  );

  setDataset(
    element,
    "appShellVisible",
    appShellVisible !== false ? "true" : "false"
  );

  return true;
}

function markShellDomState(AppCore, {
  chromeVisible = true,
  authLike = false,
  busy = false,
  appShellVisible = true,
} = {}) {
  const {
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
    body,
    html,
  } =
    getShellElements(AppCore);

  const finalChromeVisible =
    Boolean(chromeVisible);

  const finalAuthLike =
    Boolean(authLike);

  const finalBusy =
    Boolean(busy);

  const finalAppShellVisible =
    appShellVisible !== false;

  applyRootShellClasses(
    body,
    {
      chromeVisible:
        finalChromeVisible,
      authLike:
        finalAuthLike,
      appShellVisible:
        finalAppShellVisible,
    }
  );

  applyRootShellClasses(
    html,
    {
      chromeVisible:
        finalChromeVisible,
      authLike:
        finalAuthLike,
      appShellVisible:
        finalAppShellVisible,
    }
  );

  for (const element of [
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
  ]) {
    applyElementShellDataset(
      element,
      {
        chromeVisible:
          finalChromeVisible,
        authLike:
          finalAuthLike,
        appShellVisible:
          finalAppShellVisible,
      }
    );
  }

  /*
    Login/reset/activate no ocultan físicamente #app-shell.
    Sólo hideAppShell explícito puede hacerlo.
  */
  if (!finalAppShellVisible) {
    applyHidden(
      appShell,
      true
    );
  } else if (appShell) {
    try {
      if (appShell.hidden) {
        appShell.hidden =
          false;
      }
    } catch {}

    setAttribute(
      appShell,
      "aria-hidden",
      "false"
    );
  }

  setAppShellBusy(
    AppCore,
    finalBusy
  );

  return {
    shellVisible:
      finalAppShellVisible,

    chromeVisible:
      finalChromeVisible,

    authLike:
      finalAuthLike,

    busy:
      finalBusy,
  };
}

export function readShellVisibility(AppCore) {
  const state =
    getCoreState(AppCore);

  if (typeof state.chromeVisible === "boolean") {
    return state.chromeVisible;
  }

  const {
    body,
    html,
    sidebarMount,
    topbarMount,
    sidebar,
    topbar,
  } =
    getShellElements(AppCore);

  const bodyChrome =
    safeText(
      body?.dataset?.chrome,
      ""
    );

  if (bodyChrome === "visible") {
    return true;
  }

  if (bodyChrome === "hidden") {
    return false;
  }

  const htmlChrome =
    safeText(
      html?.dataset?.chrome,
      ""
    );

  if (htmlChrome === "visible") {
    return true;
  }

  if (htmlChrome === "hidden") {
    return false;
  }

  if (
    body?.classList?.contains(CHROME_HIDDEN_CLASS) ||
    html?.classList?.contains(CHROME_HIDDEN_CLASS)
  ) {
    return false;
  }

  if (
    sidebarMount?.hidden ||
    topbarMount?.hidden ||
    sidebar?.hidden ||
    topbar?.hidden
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   SHELL / CHROME VISIBILITY
========================================================= */

export function setShellVisibility(AppCore, visible = true, options = {}) {
  const opts =
    safeObject(options);

  const nextChromeVisible =
    Boolean(visible);

  const force =
    Boolean(opts.force);

  const emit =
    opts.emit !== false;

  const prevChromeVisible =
    readShellVisibility(AppCore);

  const inferredAuthLike =
    opts.authLike !== undefined
      ? Boolean(opts.authLike)
      : !nextChromeVisible;

  const busy =
    opts.busy !== undefined
      ? Boolean(opts.busy)
      : isBootingOrLoading(AppCore);

  const appShellVisible =
    opts.hideAppShell === true
      ? false
      : true;

  const {
    sidebarMount,
    topbarMount,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    mobileSidebarToggle,
  } =
    getShellElements(AppCore);

  const chromeHidden =
    !nextChromeVisible;

  const hasTableheadContent =
    tableheadHasContent(tableheadContainer);

  /*
    Sync SIEMPRE:
    SidebarUI/TopbarUI pueden montarse tarde.
  */
  for (const chromeElement of [
    sidebarMount,
    topbarMount,
    sidebar,
    topbar,
  ]) {
    applyHidden(
      chromeElement,
      chromeHidden
    );
  }

  applyHidden(
    tablehead,
    chromeHidden || !hasTableheadContent
  );

  applyHidden(
    tableheadContainer,
    chromeHidden
  );

  if (mobileSidebarToggle) {
    applyHidden(
      mobileSidebarToggle,
      chromeHidden
    );

    setAttribute(
      mobileSidebarToggle,
      "aria-expanded",
      "false"
    );
  }

  const domState =
    markShellDomState(
      AppCore,
      {
        chromeVisible:
          nextChromeVisible,
        authLike:
          inferredAuthLike,
        busy,
        appShellVisible,
      }
    );

  const canonicalPath =
    normalizeCanonicalShellPath(
      AppCore,
      opts.canonicalPath ||
        getCoreState(AppCore).route ||
        DEFAULT_ROUTE
    );

  const publicPath =
    normalizePublicShellPath(
      AppCore,
      opts.publicPath ||
        getCoreState(AppCore).publicPath ||
        canonicalPath ||
        DEFAULT_ROUTE
    );

  setCoreState(
    AppCore,
    {
      /*
        shellVisible/appShellVisible = shell físico.
        chromeVisible/routeShellHidden = sidebar/topbar/tablehead.
      */
      shellVisible:
        domState.shellVisible,

      shellHidden:
        !domState.shellVisible,

      appShellVisible:
        domState.shellVisible,

      chromeVisible:
        nextChromeVisible,

      routeShellHidden:
        !nextChromeVisible,

      shellAuthLike:
        inferredAuthLike,

      authScreen:
        inferredAuthLike,

      shellBusy:
        busy,

      routeMode:
        inferredAuthLike ? "auth" : "app",

      currentShellRoute:
        canonicalPath,

      currentShellCanonicalPath:
        canonicalPath,

      currentShellPublicPath:
        publicPath,

      shellUpdatedAt:
        safeIsoDate(),
    }
  );

  if (emit) {
    const snapshot =
      getShellSnapshot(AppCore);

    const payload = {
      reason:
        safeText(
          opts.reason,
          "set-shell-visibility"
        ),

      hidden:
        chromeHidden,

      visible:
        nextChromeVisible,

      chromeVisible:
        nextChromeVisible,

      appShellVisible:
        domState.shellVisible,

      changed:
        force ||
        prevChromeVisible !== nextChromeVisible ||
        opts.forceChromeSync === true,

      authLike:
        inferredAuthLike,

      busy,

      canonical:
        snapshot.canonical,

      publicPath:
        snapshot.publicPath,

      snapshot,
    };

    emitShellEvent(
      AppCore,
      SHELL_EVENTS.change,
      payload
    );

    emitShellEvent(
      AppCore,
      SHELL_EVENTS.state,
      payload
    );

    emitShellEvent(
      AppCore,
      SHELL_EVENTS.appState,
      payload
    );
  }

  return nextChromeVisible;
}

/* =========================================================
   ROUTES
========================================================= */

export function isLoginPath(AppCore, path = "") {
  return pathMatches(
    LOGIN_PATHS,
    path,
    {
      allowPrefix:
        false,
    }
  );
}

export function isResetPasswordPath(AppCore, path = "") {
  return pathMatches(
    RESET_PASSWORD_PATHS,
    path,
    {
      allowPrefix:
        false,
    }
  );
}

export function isResetPasswordConfirmPath(AppCore, path = "") {
  return pathMatches(
    RESET_CONFIRM_PATHS,
    path,
    {
      allowPrefix:
        true,
    }
  );
}

export function isActivateAccountPath(AppCore, path = "") {
  return pathMatches(
    ACTIVATION_PATHS,
    path,
    {
      allowPrefix:
        true,
    }
  );
}

export function isAuthLikePath(AppCore, path = "") {
  if (
    pathMatches(
      AUTH_LIKE_PATHS,
      path,
      {
        allowPrefix:
          false,
      }
    )
  ) {
    return true;
  }

  return pathMatches(
    AUTH_LIKE_PREFIXES,
    path,
    {
      allowPrefix:
        true,
    }
  );
}

function routeRequestsHiddenChrome(route = null) {
  const meta =
    safeObject(route?.meta);

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

function getRouterRoute(AppCore, Router, canonicalPath = "") {
  try {
    if (isFunction(Router?.getRoute)) {
      return Router.getRoute(
        canonicalPath ||
          getCurrentCanonicalPath(AppCore, Router)
      );
    }
  } catch {}

  try {
    if (isFunction(Router?.currentRoute)) {
      return Router.currentRoute();
    }
  } catch {}

  try {
    return Router?.route || Router?.current || null;
  } catch {
    return null;
  }
}

function safeGetCurrentCanonicalPath(AppCore, Router) {
  try {
    return getCurrentCanonicalPath(AppCore, Router);
  } catch {
    return "";
  }
}

function safeGetCurrentPublicPath(AppCore, Router) {
  try {
    return getCurrentPublicPath(AppCore, Router);
  } catch {
    return "";
  }
}

export function isAuthLikeRoute(AppCore, Router) {
  const canonical =
    normalizeCanonicalShellPath(
      AppCore,
      safeGetCurrentCanonicalPath(AppCore, Router) ||
        AppCore?.state?.route ||
        DEFAULT_ROUTE
    );

  const publicPath =
    normalizePublicShellPath(
      AppCore,
      safeGetCurrentPublicPath(AppCore, Router) ||
        AppCore?.state?.publicPath ||
        getBrowserPath() ||
        DEFAULT_ROUTE
    );

  const browserPath =
    normalizePublicShellPath(
      AppCore,
      getBrowserPath()
    );

  const route =
    getRouterRoute(
      AppCore,
      Router,
      canonical
    );

  if (routeRequestsHiddenChrome(route)) {
    return true;
  }

  return [
    canonical,
    publicPath,
    browserPath,
  ].some((path) =>
    isAuthLikePath(AppCore, path)
  );
}

export function updateShellVisibilityByRoute(AppCore, Router, options = {}) {
  const opts =
    safeObject(options);

  const canonical =
    normalizeCanonicalShellPath(
      AppCore,
      opts.canonicalPath ||
        safeGetCurrentCanonicalPath(AppCore, Router) ||
        AppCore?.state?.route ||
        DEFAULT_ROUTE
    );

  const publicPath =
    normalizePublicShellPath(
      AppCore,
      opts.publicPath ||
        safeGetCurrentPublicPath(AppCore, Router) ||
        AppCore?.state?.publicPath ||
        getBrowserPath() ||
        canonical ||
        DEFAULT_ROUTE
    );

  const route =
    opts.route ||
    getRouterRoute(
      AppCore,
      Router,
      canonical
    );

  const hasToken =
    pathHasAnyToken(publicPath) ||
    pathHasAnyToken(canonical) ||
    pathHasAnyToken(getBrowserPath());

  const authLike =
    opts.authLike !== undefined
      ? Boolean(opts.authLike)
      : Boolean(
          routeRequestsHiddenChrome(route) ||
            isAuthLikeRoute(AppCore, Router)
        );

  return setShellVisibility(
    AppCore,
    !authLike,
    {
      ...opts,

      canonicalPath:
        canonical,

      publicPath,

      authLike,

      hideAppShell:
        false,

      tokenRoute:
        hasToken,

      reason:
        opts.reason ||
        "update-shell-visibility-by-route",
    }
  );
}

/* =========================================================
   LOADER SAFE POLICY
========================================================= */

function hideLoaderDomFallback(AppCore) {
  const {
    loader,
  } =
    getShellElements(AppCore);

  if (!loader) {
    return false;
  }

  try {
    loader.hidden =
      true;

    for (const className of HIDDEN_LOADER_CLASSES) {
      loader.classList.add(className);
    }

    for (const className of VISIBLE_LOADER_CLASSES) {
      loader.classList.remove(className);
    }

    loader.setAttribute(
      "aria-hidden",
      "true"
    );

    loader.setAttribute(
      "aria-busy",
      "false"
    );

    loader.dataset.loaderVisible =
      "false";

    loader.dataset.loaderState =
      "hidden";

    return true;
  } catch {
    return false;
  }
}

function hideLoaderSafe(AppCore, hideLoader, options = {}) {
  const opts =
    safeObject(options);

  const bootBusy =
    isBootingOrLoading(AppCore) ||
    hasBodyBootClass();

  if (
    bootBusy &&
    opts.force !== true
  ) {
    return false;
  }

  try {
    if (isFunction(hideLoader)) {
      hideLoader(
        AppCore,
        {
          reason:
            opts.reason ||
            "shell-post-render",

          minVisibleMs:
            opts.minVisibleMs,

          allowDuringBoot:
            opts.force === true,

          force:
            opts.force === true,
        }
      );

      return true;
    }
  } catch (error) {
    recordShellError(
      AppCore,
      "hideLoader",
      error
    );
  }

  return hideLoaderDomFallback(AppCore);
}

/* =========================================================
   POST RENDER
========================================================= */

export function applyPostRenderLoaderPolicy({
  AppCore,
  Router,
  hideLoader,
  forceHideLoader = false,
  hideLoaderOnPostRender = true,
  minVisibleMs = undefined,
} = {}) {
  const view =
    getViewContainer(AppCore);

  const hasContent =
    hasViewContent(view);

  const authLike =
    isAuthLikeRoute(AppCore, Router);

  const bootBusy =
    isBootingOrLoading(AppCore) ||
    hasBodyBootClass();

  const chromeVisible =
    updateShellVisibilityByRoute(
      AppCore,
      Router,
      {
        authLike,
        busy:
          !hasContent || bootBusy,
        hideAppShell:
          false,
        forceChromeSync:
          true,
        reason:
          "post-render-policy",
      }
    );

  const shouldConsiderHide =
    hideLoaderOnPostRender !== false &&
    (
      authLike ||
      hasContent
    );

  const loaderHidden =
    shouldConsiderHide
      ? hideLoaderSafe(
          AppCore,
          hideLoader,
          {
            force:
              forceHideLoader === true,
            reason:
              "post-render",
            minVisibleMs,
          }
        )
      : false;

  if (hasContent) {
    setAppShellBusy(
      AppCore,
      bootBusy
    );
  }

  const shellSnapshot =
    getShellSnapshot(
      AppCore,
      Router
    );

  emitShellEvent(
    AppCore,
    SHELL_EVENTS.postRender,
    {
      authLike,

      hasViewContent:
        hasContent,

      shellVisible:
        shellSnapshot.appShellVisible,

      appShellVisible:
        shellSnapshot.appShellVisible,

      chromeVisible,

      loaderHidden,

      loaderVisible:
        isLoaderVisible(AppCore),

      bootBusy,

      canonical:
        shellSnapshot.canonical,

      publicPath:
        shellSnapshot.publicPath,

      snapshot:
        shellSnapshot,
    }
  );

  return shellSnapshot;
}

/* =========================================================
   APP READY / BUSY HELPERS
========================================================= */

export function markShellReady(AppCore, options = {}) {
  const opts =
    safeObject(options);

  const Router =
    opts.Router || null;

  const authLike =
    opts.authLike !== undefined
      ? Boolean(opts.authLike)
      : isAuthLikeRoute(AppCore, Router);

  setAppShellBusy(
    AppCore,
    false
  );

  markShellDomState(
    AppCore,
    {
      chromeVisible:
        opts.chromeVisible !== undefined
          ? Boolean(opts.chromeVisible)
          : readShellVisibility(AppCore),

      authLike,

      busy:
        false,

      appShellVisible:
        opts.appShellVisible !== false,
    }
  );

  setCoreState(
    AppCore,
    {
      shellBusy:
        false,

      shellReady:
        true,

      shellReadyAt:
        safeIsoDate(),

      appShellVisible:
        opts.appShellVisible !== false,

      shellVisible:
        opts.appShellVisible !== false,

      shellHidden:
        opts.appShellVisible === false,
    }
  );

  emitShellEvent(
    AppCore,
    SHELL_EVENTS.ready,
    {
      snapshot:
        getShellSnapshot(
          AppCore,
          Router
        ),
    }
  );

  return true;
}

export function markShellBusy(AppCore, options = {}) {
  const opts =
    safeObject(options);

  setAppShellBusy(
    AppCore,
    true
  );

  markShellDomState(
    AppCore,
    {
      chromeVisible:
        opts.chromeVisible !== undefined
          ? Boolean(opts.chromeVisible)
          : readShellVisibility(AppCore),

      authLike:
        Boolean(opts.authLike),

      busy:
        true,

      appShellVisible:
        opts.appShellVisible !== false,
    }
  );

  setCoreState(
    AppCore,
    {
      shellBusy:
        true,

      appShellVisible:
        opts.appShellVisible !== false,

      shellVisible:
        opts.appShellVisible !== false,

      shellHidden:
        opts.appShellVisible === false,
    }
  );

  emitShellEvent(
    AppCore,
    SHELL_EVENTS.busy,
    {
      snapshot:
        getShellSnapshot(
          AppCore,
          opts.Router || null
        ),
    }
  );

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getElementSnapshot(element) {
  if (!element) {
    return {
      exists:
        false,
    };
  }

  return {
    exists:
      true,

    id:
      safeText(element.id, ""),

    tag:
      safeText(
        element.tagName?.toLowerCase?.(),
        ""
      ),

    hidden:
      Boolean(element.hidden),

    ariaHidden:
      safeText(
        element.getAttribute?.("aria-hidden"),
        ""
      ),

    ariaBusy:
      safeText(
        element.getAttribute?.("aria-busy"),
        ""
      ),

    datasetShell:
      safeText(element.dataset?.shell, ""),

    datasetChrome:
      safeText(element.dataset?.chrome, ""),

    datasetRouteMode:
      safeText(element.dataset?.routeMode, ""),

    datasetShellInteractive:
      safeText(element.dataset?.shellInteractive, ""),

    datasetAppShellVisible:
      safeText(element.dataset?.appShellVisible, ""),

    datasetLoaderVisible:
      safeText(element.dataset?.loaderVisible, ""),

    datasetLoaderState:
      safeText(element.dataset?.loaderState, ""),

    className:
      safeText(
        element.className?.baseVal ||
          element.className,
        ""
      ).slice(0, SNAPSHOT_MAX_CLASS_LENGTH),

    childCount:
      (() => {
        try {
          return element.children?.length || 0;
        } catch {
          return 0;
        }
      })(),
  };
}

export function getShellSnapshot(AppCore, Router = null) {
  const {
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

    body,
    html,
  } =
    getShellElements(AppCore);

  const state =
    getCoreState(AppCore);

  const canonical =
    normalizeCanonicalShellPath(
      AppCore,
      safeGetCurrentCanonicalPath(AppCore, Router) ||
        state.route ||
        DEFAULT_ROUTE
    );

  const publicPath =
    normalizePublicShellPath(
      AppCore,
      safeGetCurrentPublicPath(AppCore, Router) ||
        state.publicPath ||
        DEFAULT_ROUTE
    );

  const chromeVisible =
    readShellVisibility(AppCore);

  const appShellVisible =
    appShell
      ? !appShell.hidden &&
        appShell.getAttribute("aria-hidden") !== "true"
      : false;

  return {
    version:
      SHELL_VERSION,

    shellVisible:
      appShellVisible,

    appShellVisible,

    chromeVisible,

    routeShellHidden:
      !chromeVisible,

    authLike:
      isAuthLikeRoute(AppCore, Router),

    tokenRoute:
      pathHasAnyToken(canonical) ||
      pathHasAnyToken(publicPath) ||
      pathHasAnyToken(getBrowserPath()),

    canonical:
      redactTokenInText(canonical),

    publicPath:
      redactTokenInText(publicPath),

    browserPath:
      redactTokenInText(getBrowserPath()),

    booting:
      Boolean(state.booting),

    loading:
      Boolean(state.loading),

    ready:
      Boolean(
        state.ready ||
          state.appReady
      ),

    bootBusy:
      isBootingOrLoading(AppCore),

    bodyBootClass:
      hasBodyBootClass(),

    loaderVisible:
      isLoaderVisible(AppCore),

    elements: {
      appShell:
        getElementSnapshot(appShell),

      mainContent:
        getElementSnapshot(mainContent),

      appContent:
        getElementSnapshot(appContent),

      viewContainer:
        getElementSnapshot(viewContainer),

      sidebarMount:
        getElementSnapshot(sidebarMount),

      topbarMount:
        getElementSnapshot(topbarMount),

      sidebar:
        getElementSnapshot(sidebar),

      topbar:
        getElementSnapshot(topbar),

      tablehead:
        getElementSnapshot(tablehead),

      tableheadContainer:
        getElementSnapshot(tableheadContainer),

      mobileSidebarToggle:
        getElementSnapshot(mobileSidebarToggle),

      loader:
        getElementSnapshot(loader),
    },

    appShellExists:
      Boolean(appShell),

    appShellHidden:
      Boolean(appShell?.hidden),

    appShellBusy:
      safeText(
        appShell?.getAttribute?.("aria-busy"),
        ""
      ),

    mainContentExists:
      Boolean(mainContent),

    appContentExists:
      Boolean(appContent),

    hasView:
      Boolean(viewContainer),

    hasViewContent:
      hasViewContent(viewContainer),

    sidebarMountExists:
      Boolean(sidebarMount),

    sidebarMountHidden:
      Boolean(sidebarMount?.hidden),

    topbarMountExists:
      Boolean(topbarMount),

    topbarMountHidden:
      Boolean(topbarMount?.hidden),

    sidebarExists:
      Boolean(sidebar),

    sidebarHidden:
      Boolean(sidebar?.hidden),

    topbarExists:
      Boolean(topbar),

    topbarHidden:
      Boolean(topbar?.hidden),

    tableheadExists:
      Boolean(tablehead),

    tableheadHidden:
      Boolean(tablehead?.hidden),

    tableheadContainerExists:
      Boolean(tableheadContainer),

    tableheadContainerHidden:
      Boolean(tableheadContainer?.hidden),

    tableheadHasContent:
      tableheadHasContent(tableheadContainer),

    mobileSidebarToggleExists:
      Boolean(mobileSidebarToggle),

    mobileSidebarToggleHidden:
      Boolean(mobileSidebarToggle?.hidden),

    loaderExists:
      Boolean(loader),

    loaderHidden:
      Boolean(loader?.hidden),

    bodyShell:
      safeText(body?.dataset?.shell, ""),

    htmlShell:
      safeText(html?.dataset?.shell, ""),

    bodyChrome:
      safeText(body?.dataset?.chrome, ""),

    htmlChrome:
      safeText(html?.dataset?.chrome, ""),

    bodyRouteMode:
      safeText(body?.dataset?.routeMode, ""),

    htmlRouteMode:
      safeText(html?.dataset?.routeMode, ""),

    bodyClasses:
      safeArrayFromClassList(body?.classList),

    htmlClasses:
      safeArrayFromClassList(html?.classList),

    lastShellEventKey:
      redactTokenInText(lastShellEventKey),

    lastShellEventAt,

    lastShellEventAtIso:
      lastShellEventAt
        ? safeIsoDate(lastShellEventAt)
        : "",

    lastShellError,

    debugApiInstalled:
      Boolean(debugApiInstalled),

    at:
      safeIsoDate(),
  };
}

/* =========================================================
   DEBUG / MAINTENANCE
========================================================= */

function attachDebugApi(AppCore = null, api = null) {
  if (!api) {
    return false;
  }

  try {
    if (isBrowser()) {
      window[SHELL_RUNTIME_KEY] =
        api;

      window.__ONION_APP_SHELL__ =
        api;
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
        "Shell",
        {
          value:
            api,
          configurable:
            true,
          enumerable:
            false,
          writable:
            true,
        }
      );
    }
  } catch {}

  try {
    if (
      AppCore?.modules &&
      isFunction(AppCore.modules.register)
    ) {
      AppCore.modules.register(
        "Shell",
        api,
        {
          aliases:
            [
              "shell",
              "AppShell",
              "appShell",
            ],
          overwrite:
            false,
          replace:
            false,
          source:
            SHELL_SOURCE,
        }
      );
    }
  } catch {}

  return true;
}

export function exposeShellDebugApi(AppCore = null) {
  if (
    debugApiInstalled &&
    debugApiRef
  ) {
    attachDebugApi(
      AppCore,
      debugApiRef
    );

    return debugApiRef;
  }

  const api = {
    version:
      SHELL_VERSION,

    getElements() {
      return getShellElements(AppCore);
    },

    getSnapshot(Router = null) {
      return getShellSnapshot(
        AppCore,
        Router
      );
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
      return setShellVisibility(
        AppCore,
        visible,
        options
      );
    },

    updateByRoute(Router = null, options = {}) {
      return updateShellVisibilityByRoute(
        AppCore,
        Router,
        options
      );
    },
  };

  debugApiRef =
    api;

  debugApiInstalled =
    true;

  attachDebugApi(
    AppCore,
    api
  );

  emitShellEvent(
    AppCore,
    SHELL_EVENTS.debugApi,
    {
      installed:
        true,
    },
    {
      dedupe:
        false,
    }
  );

  return api;
}

export function refreshShellElements(AppCore) {
  const elements =
    getShellElements(AppCore);

  exposeShellDebugApi(AppCore);

  emitShellEvent(
    AppCore,
    SHELL_EVENTS.elements,
    {
      snapshot:
        getShellSnapshot(AppCore),
    },
    {
      dedupe:
        false,
    }
  );

  return elements;
}

export function resetShellRuntimeState(AppCore) {
  setCoreState(
    AppCore,
    {
      shellVisible:
        true,

      shellHidden:
        false,

      appShellVisible:
        true,

      chromeVisible:
        true,

      routeShellHidden:
        false,

      shellAuthLike:
        false,

      authScreen:
        false,

      shellBusy:
        false,

      shellReady:
        false,

      routeMode:
        "app",
    }
  );

  markShellDomState(
    AppCore,
    {
      chromeVisible:
        true,
      authLike:
        false,
      busy:
        false,
      appShellVisible:
        true,
    }
  );

  exposeShellDebugApi(AppCore);

  return getShellSnapshot(AppCore);
}

/* =========================================================
   DEFAULT EXPORT
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
