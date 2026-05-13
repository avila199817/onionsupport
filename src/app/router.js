/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: /src/app/router.js

   ONION SUPPORT · APP ROUTER BOOTSTRAP
   INITIAL URL SAFE · PUBLIC PATH SAFE · TOKEN ROUTES SAFE · 10/10

   RESPONSABILIDADES:
   - Configurar Router con dependencias.
   - Bind listeners una sola vez.
   - Render inicial robusto y serializado.
   - Capturar URL inicial antes de Router/History/Auth.
   - Preservar token de activación hasta que ActivateAccountView lo lea.
   - Preservar token de reset hasta que ConfirmResetPasswordView lo lea.
   - Separar publicPath de canonicalPath:
       /@cristian/incidencias  -> publicPath
       /incidencias            -> canonicalPath
   - No llamar bindRouter() dentro de renderInitialRoute().
   - Router.render(canonicalPath, options).
   - Router.render recibe publicPath/requestedPath en options.
   - Rutas técnicas con token no hacen replaceState destructivo.
   - Fallback de rutas técnicas conserva token.
   - Sin CSS inline.
   - Sin estilos inyectados.
   - Sin doble render inicial.
========================================================= */

import { AppCore as ImportedAppCore } from "../core/index.js";
import { Router as ImportedRouter } from "../router/index.js";
import { Auth as ImportedAuth } from "../features/auth/index.js";

import {
  getCurrentPath,
  getCurrentPublicPath,
  getCurrentCanonicalPath,
} from "./helpers.js";

import {
  applyPostRenderLoaderPolicy as defaultApplyPostRenderLoaderPolicy,
} from "./shell.js";

import {
  APP_RUNTIME_KEYS,
  APP_STATE_KEYS,
  APP_ROUTES,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
} from "./constants.js";

/* =========================================================
   RUNTIME DEPENDENCIES
========================================================= */

let RuntimeAppCore = ImportedAppCore;
let RuntimeRouter = ImportedRouter;
let RuntimeAuth = ImportedAuth;

function resolveRuntimeDeps(deps = {}) {
  const safeDeps = ensureObject(deps);

  RuntimeAppCore =
    safeDeps.AppCore ||
    safeDeps.core ||
    RuntimeAppCore ||
    ImportedAppCore;

  RuntimeRouter =
    safeDeps.Router ||
    safeDeps.router ||
    RuntimeRouter ||
    ImportedRouter;

  RuntimeAuth =
    safeDeps.Auth ||
    safeDeps.auth ||
    RuntimeAuth ||
    ImportedAuth;

  return {
    AppCore: RuntimeAppCore,
    Router: RuntimeRouter,
    Auth: RuntimeAuth,

    applyPostRenderLoaderPolicy:
      safeDeps.applyPostRenderLoaderPolicy ||
      defaultApplyPostRenderLoaderPolicy,

    hideLoader:
      safeDeps.hideLoader,

    getViewContainer:
      safeDeps.getViewContainer,

    setShellVisibility:
      safeDeps.setShellVisibility,

    updateShellVisibilityByRoute:
      safeDeps.updateShellVisibilityByRoute,
  };
}

/* =========================================================
   STATE
========================================================= */

let configured = false;
let bound = false;
let firstRenderDone = false;
let initialRenderPromise = null;
let renderCycle = 0;

const routerBootState = {
  lastInitialPath: "",
  lastInitialPublicPath: "",
  lastInitialCanonicalPath: "",

  lastRenderedPath: "",
  lastRenderedPublicPath: "",

  lastResolvedCanonicalPath: "",
  lastResolvedPublicPath: "",

  lastRenderAt: 0,
  lastRenderOk: false,
  lastRenderError: null,

  lastProtectedRouteKey: "",
  capturedInitialUrlAt: 0,
  lastInitialCaptureSignature: "",

  lastConfiguredAt: 0,
  lastBoundAt: 0,
};

/* =========================================================
   CONSTANTS
========================================================= */

const ROUTER_BOOTSTRAP_VERSION = "14.0.0";

const DEFAULT_ROUTE =
  APP_ROUTES?.home ||
  "/";

const LOGIN_ROUTE =
  APP_ROUTES?.login ||
  "/login";

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const INITIAL_URL_KEY =
  APP_RUNTIME_KEYS?.initialUrl ||
  "__ONION_INITIAL_URL__";

const FALLBACK_PROTECTED_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATION_PATH,

    windowKeys: Object.freeze([
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ]),

    scrubbedHistoryFlags: Object.freeze([
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
    path: RESET_CONFIRM_PATH,

    windowKeys: Object.freeze([
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ]),

    scrubbedHistoryFlags: Object.freeze([
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedResetPasswordToken",
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

const GENERIC_SENSITIVE_PARAM_NAMES = Object.freeze([
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
]);

const ROUTER_BOOT_EVENTS = Object.freeze({
  configured: "app:router:configured",
  bound: "app:router:bound",
  initialUrlCaptured: "app:router:initial-url:captured",
  initialRenderStart: "app:router:initial-render:start",
  initialRenderDone: "app:router:initial-render:done",
  initialRenderError: "app:router:initial-render:error",
  initialRenderFallback: "app:router:initial-render:fallback",
  stateSynced: "app:router:state-synced",
  reset: "app:router:bootstrap:reset",
});

const SENSITIVE_OBJECT_KEY_RE =
  /token|secret|password|authorization|credential|jwt|bearer|otp|code/i;

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

function ensureObject(value) {
  return isObject(value)
    ? value
    : {};
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

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function unique(values = []) {
  const result = [];
  const seen = new Set();

  for (const value of safeArray(values)) {
    const text = safeText(value, "");

    if (
      text &&
      !seen.has(text)
    ) {
      seen.add(text);
      result.push(text);
    }
  }

  return result;
}

function safeCreateCustomEvent(name = "", detail = {}) {
  if (!isBrowser()) {
    return null;
  }

  const eventName = safeText(name, "");

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
    const event = document.createEvent("CustomEvent");

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

/* =========================================================
   PATH UTILS
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

function normalizePathnameOnly(pathname = "/") {
  let value =
    safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
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

  value = `/${output.join("/")}`;

  if (!value) {
    value = "/";
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value = value.replace(/\/+$/g, "") || "/";
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
    return "/";
  }

  if (raw.startsWith("#!")) {
    return normalizePath(
      raw.replace(/^#!\/?/, "/")
    );
  }

  return normalizePath(
    raw.replace(/^#\/?/, "/")
  );
}

function splitPath(value = "/") {
  const raw = safeText(value, "/");

  if (isHashRouterPath(raw)) {
    return splitPath(
      normalizeHashRouterPath(raw)
    );
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
    pathname:
      normalizePathnameOnly(pathname),

    search:
      normalizeSearch(search),

    hash:
      normalizeHash(hash),
  };
}

function normalizePath(path = "/") {
  const raw = safeText(path, "/");

  if (!raw) {
    return "/";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, getBaseOrigin());

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeHashRouterPath(parsed.hash);
      }

      return normalizePath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } = splitPath(raw);

  return `${pathname}${search}${hash}`;
}

function getCleanPath(path = "/") {
  return splitPath(
    normalizePath(path)
  ).pathname;
}

function getBrowserHref() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      window.location.href,
      ""
    );
  } catch {
    return "";
  }
}

function getBrowserPath() {
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
      return normalizeHashRouterPath(hash);
    }

    return normalizePath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

function getPathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return normalizePath(
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return normalizePath(
      raw.startsWith("/") ||
      raw.startsWith("#")
        ? raw
        : `/${raw}`
    );
  }
}

function shouldUsePath(value) {
  return (
    typeof value === "string" &&
    Boolean(value.trim())
  );
}

/* =========================================================
   USERNAME PUBLIC PATH -> CANONICAL PATH
========================================================= */

function isUsernameSegment(segment = "") {
  const raw = safeText(segment, "");

  return /^@[A-Za-z0-9._-]{1,80}$/.test(raw);
}

function getFirstPathSegment(pathname = "/") {
  const clean = normalizePathnameOnly(pathname);

  const segments =
    clean
      .split("/")
      .filter(Boolean);

  return segments[0] || "";
}

function isUsernameScopedPublicPath(path = "") {
  const parts =
    splitPath(
      normalizePath(path || "/")
    );

  return isUsernameSegment(
    getFirstPathSegment(parts.pathname)
  );
}

function stripUsernamePrefixFromPathname(pathname = "/") {
  const clean = normalizePathnameOnly(pathname);

  const segments =
    clean
      .split("/")
      .filter(Boolean);

  if (
    segments.length > 0 &&
    isUsernameSegment(segments[0])
  ) {
    const rest = segments.slice(1).join("/");

    return rest
      ? normalizePathnameOnly(`/${rest}`)
      : "/";
  }

  return clean;
}

function toCanonicalPath(path = DEFAULT_ROUTE) {
  const normalized =
    normalizePath(path || DEFAULT_ROUTE);

  const {
    pathname,
    search,
    hash,
  } = splitPath(normalized);

  const canonicalPathname =
    stripUsernamePrefixFromPathname(pathname);

  return normalizePath(
    `${canonicalPathname}${search}${hash}`
  );
}

function toPublicPath(path = DEFAULT_ROUTE) {
  return normalizePath(path || DEFAULT_ROUTE);
}

function pathsAreSameCleanPath(a = "", b = "") {
  return getCleanPath(a) === getCleanPath(b);
}

function isDefaultCleanPath(path = "") {
  return pathsAreSameCleanPath(
    path,
    DEFAULT_ROUTE
  );
}

/* =========================================================
   PROTECTED ROUTE CONFIG
========================================================= */

function normalizeProtectedRouteConfigs(configs = []) {
  return Object.freeze(
    safeArray(configs)
      .map((config) => {
        const item = ensureObject(config);

        const rawPath =
          item.path ||
          item.route ||
          item.canonicalPath ||
          "";

        const path = normalizePathnameOnly(rawPath);

        if (
          !path ||
          path === "/"
        ) {
          return null;
        }

        const key =
          safeText(
            item.key ||
              item.name ||
              path
                .replace(/^\/+/, "")
                .replace(/[/-]/g, "_"),
            ""
          );

        const windowKeys =
          unique([
            ...safeArray(item.windowKeys),
            item.windowKey,
            item.initialWindowKey,
            item.runtimeKey,
          ]);

        const tokenParamNames =
          unique([
            ...safeArray(item.tokenParamNames),
            ...(
              key === "activation"
                ? [
                    "token",
                    "activationToken",
                    "activateToken",
                    "code",
                    "t",
                  ]
                : []
            ),
            ...(
              key === "resetConfirm"
                ? [
                    "token",
                    "resetToken",
                    "passwordResetToken",
                    "confirmToken",
                    "code",
                    "t",
                  ]
                : []
            ),
          ]);

        const scrubbedHistoryFlags =
          unique([
            ...safeArray(item.scrubbedHistoryFlags),
            item.scrubbedHistoryFlag,
            ...(
              key === "activation"
                ? [
                    "scrubbedActivationToken",
                    "activationTokenScrubbed",
                    "scrubbedActivateAccountToken",
                    "scrubbedPublicTokenRoute",
                    "scrubbedTokenRoute",
                  ]
                : []
            ),
            ...(
              key === "resetConfirm"
                ? [
                    "scrubbedResetToken",
                    "resetTokenScrubbed",
                    "scrubbedResetConfirmToken",
                    "scrubbedPasswordResetToken",
                    "scrubbedResetPasswordToken",
                    "scrubbedPublicTokenRoute",
                    "scrubbedTokenRoute",
                  ]
                : []
            ),
          ]);

        return Object.freeze({
          ...item,

          key,
          path,

          windowKey:
            windowKeys[0] || "",

          windowKeys:
            Object.freeze(windowKeys),

          tokenParamNames:
            Object.freeze(tokenParamNames),

          scrubbedHistoryFlags:
            Object.freeze(scrubbedHistoryFlags),
        });
      })
      .filter(Boolean)
  );
}

const PROTECTED_ROUTES =
  normalizeProtectedRouteConfigs(
    Array.isArray(PROTECTED_PUBLIC_TOKEN_ROUTES) &&
      PROTECTED_PUBLIC_TOKEN_ROUTES.length
      ? PROTECTED_PUBLIC_TOKEN_ROUTES
      : FALLBACK_PROTECTED_ROUTES
  );

/* =========================================================
   TOKEN REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactTokenInText(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  let output = raw;

  for (const config of PROTECTED_ROUTES) {
    const path = safeText(config?.path, "");

    if (!path) {
      continue;
    }

    const escapedPath = escapeRegExp(path);

    try {
      output = output.replace(
        new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
        "$1/***"
      );
    } catch {}

    for (const name of config.tokenParamNames || []) {
      try {
        const escapedName = escapeRegExp(name);

        output = output.replace(
          new RegExp(`([?&#]${escapedName}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
      } catch {}
    }
  }

  for (const name of GENERIC_SENSITIVE_PARAM_NAMES) {
    try {
      const escapedName = escapeRegExp(name);

      output = output.replace(
        new RegExp(`([?&#]${escapedName}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  try {
    output = output.replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
  } catch {}

  return output;
}

function normalizeError(error = null) {
  if (!error) {
    return null;
  }

  return {
    name:
      safeText(
        error?.name,
        "RouterBootstrapError"
      ),

    message:
      redactTokenInText(
        safeText(
          error?.message || error,
          "Error en bootstrap Router."
        )
      ),

    code:
      safeText(
        error?.code ||
          error?.status ||
          error?.statusCode,
        ""
      ) || null,
  };
}

function isDomNodeLike(value) {
  if (!value || typeof value !== "object") {
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
  if (depth > 8) {
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
      node: safeText(value.nodeName, "Node"),
      id: safeText(value.id, ""),
      className: safeText(
        value.className?.baseVal ||
          value.className,
        ""
      ),
    };
  }

  if (value instanceof Error) {
    return normalizeError(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) =>
        sanitizePayload(item, depth + 1)
      );
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_OBJECT_KEY_RE.test(key)) {
        if (
          item === null ||
          item === undefined ||
          item === "" ||
          typeof item === "boolean"
        ) {
          output[key] = item;
        } else {
          output[key] = "***";
        }

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

function sanitizeRenderOptions(options = {}) {
  return sanitizePayload(options);
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeLog(...args) {
  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  try {
    RuntimeAppCore?.utils?.log?.(
      "[AppRouter]",
      ...cleanArgs
    );

    return;
  } catch {}

  try {
    console.log(
      "[AppRouter]",
      ...cleanArgs
    );
  } catch {}
}

function safeWarn(...args) {
  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  let coreLogged = false;

  try {
    if (isFunction(RuntimeAppCore?.utils?.warn)) {
      RuntimeAppCore.utils.warn(
        "[AppRouter]",
        ...cleanArgs
      );

      coreLogged = true;
    }
  } catch {
    coreLogged = false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.warn(
      "[AppRouter]",
      ...cleanArgs
    );
  } catch {}
}

function safeError(...args) {
  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  let coreLogged = false;

  try {
    if (isFunction(RuntimeAppCore?.utils?.error)) {
      RuntimeAppCore.utils.error(
        "[AppRouter]",
        ...cleanArgs
      );

      coreLogged = true;
    }
  } catch {
    coreLogged = false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.error(
      "[AppRouter]",
      ...cleanArgs
    );
  } catch {}
}

function safeWindowDispatch(eventName, payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    const event =
      safeCreateCustomEvent(
        eventName,
        sanitizePayload(payload)
      );

    if (event) {
      window.dispatchEvent(event);
      return true;
    }
  } catch {}

  return false;
}

function safeEmit(eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts = ensureObject(options);

  const cleanPayload =
    sanitizePayload({
      version: ROUTER_BOOTSTRAP_VERSION,
      source: "app-router-bootstrap",
      ...ensureObject(payload),
    });

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(RuntimeAppCore?.events?.emit)) {
      busAvailable = true;

      RuntimeAppCore.events.emit(
        name,
        cleanPayload
      );

      busEmitted = true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return safeWindowDispatch(
      name,
      cleanPayload
    ) || busEmitted;
  }

  return busEmitted;
}

/* =========================================================
   HISTORY SCRUBBED STATE
========================================================= */

function getHistoryState() {
  if (!isBrowser()) {
    return {};
  }

  try {
    return ensureObject(window.history?.state);
  } catch {
    return {};
  }
}

function isRouteScrubbed(config = null) {
  if (!config) {
    return false;
  }

  const historyState = getHistoryState();

  for (const flag of safeArray(config.scrubbedHistoryFlags)) {
    if (!historyState[flag]) {
      continue;
    }

    if (
      flag === "scrubbedPublicTokenRoute" ||
      flag === "scrubbedTokenRoute"
    ) {
      if (
        historyState[flag] === true ||
        historyState[flag] === config.key
      ) {
        return true;
      }

      continue;
    }

    return true;
  }

  return false;
}

/* =========================================================
   PROTECTED TOKEN ROUTES
========================================================= */

function matchesProtectedRoute(config, pathOrUrl = "") {
  if (!config?.path) {
    return false;
  }

  const publicPath =
    getPathFromUrlLike(pathOrUrl);

  const canonicalPath =
    toCanonicalPath(publicPath);

  const cleanPath =
    getCleanPath(canonicalPath);

  return (
    cleanPath === config.path ||
    cleanPath.startsWith(`${config.path}/`)
  );
}

function getProtectedRouteConfig(value = "") {
  return (
    PROTECTED_ROUTES.find((config) =>
      matchesProtectedRoute(config, value)
    ) || null
  );
}

function getPathToken(config, value = "") {
  if (!config?.path) {
    return "";
  }

  const publicPath =
    getPathFromUrlLike(value);

  const canonicalPath =
    toCanonicalPath(publicPath);

  const cleanPath =
    getCleanPath(canonicalPath);

  if (!cleanPath.startsWith(`${config.path}/`)) {
    return "";
  }

  const token =
    cleanPath
      .slice(`${config.path}/`.length)
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

function hasTokenInSearch(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");

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

function hasProtectedTokenInUrlLike(config, value = "") {
  if (!config) {
    return false;
  }

  if (isRouteScrubbed(config)) {
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
    const parsed = new URL(raw, getBaseOrigin());

    if (
      hasTokenInSearch(
        parsed.search,
        config.tokenParamNames || []
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
        splitPath(hashPath);

      if (
        hasTokenInSearch(
          hashParts.search,
          config.tokenParamNames || []
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
        config.tokenParamNames || []
      );
    }

    return false;
  } catch {
    const parts = splitPath(raw);

    if (
      hasTokenInSearch(
        parts.search,
        config.tokenParamNames || []
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
        config.tokenParamNames || []
      );
    }

    return false;
  }
}

function isProtectedPublicTokenPath(path = "") {
  const config = getProtectedRouteConfig(path);

  return Boolean(
    config &&
      hasProtectedTokenInUrlLike(
        config,
        path
      )
  );
}

/* =========================================================
   INITIAL URL STORAGE
========================================================= */

function getWindowValue(key = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return "";
  }

  try {
    return safeText(
      window[key],
      ""
    );
  } catch {
    return "";
  }
}

function setWindowValue(key = "", value = "", onlyIfMissing = false) {
  if (
    !isBrowser() ||
    !key
  ) {
    return false;
  }

  try {
    if (
      onlyIfMissing &&
      window[key]
    ) {
      return true;
    }

    window[key] = value;

    return true;
  } catch {
    return false;
  }
}

function getStoredInitialUrl(config) {
  const keys =
    config?.windowKeys?.length
      ? config.windowKeys
      : [config?.windowKey].filter(Boolean);

  for (const key of keys) {
    const value = getWindowValue(key);

    if (value) {
      return value;
    }
  }

  return "";
}

function setStoredInitialUrl(config, value = "") {
  const keys =
    config?.windowKeys?.length
      ? config.windowKeys
      : [config?.windowKey].filter(Boolean);

  let wrote = false;

  for (const key of keys) {
    if (
      setWindowValue(
        key,
        value,
        true
      )
    ) {
      wrote = true;
    }
  }

  return wrote;
}

function getGlobalInitialUrl() {
  return getWindowValue(INITIAL_URL_KEY);
}

function setGlobalInitialUrl(value = "") {
  return setWindowValue(
    INITIAL_URL_KEY,
    value,
    true
  );
}

function getProtectedStoredUrls() {
  return PROTECTED_ROUTES
    .filter((config) => !isRouteScrubbed(config))
    .map((config) => getStoredInitialUrl(config))
    .filter(Boolean);
}

function setCoreInitialUrl(href = "") {
  const cleanHref = safeText(href, "");

  if (!cleanHref) {
    return false;
  }

  const payload = {
    bootInitialUrl: cleanHref,
    bootInitialPath: getPathFromUrlLike(cleanHref),
  };

  try {
    RuntimeAppCore?.setState?.(
      payload,
      {
        source:
          "app-router-bootstrap:initial-url",
      }
    );
  } catch {}

  try {
    if (
      RuntimeAppCore?.state &&
      typeof RuntimeAppCore.state === "object"
    ) {
      Object.assign(
        RuntimeAppCore.state,
        payload
      );
    }
  } catch {}

  return true;
}

function captureInitialBrowserUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href = getBrowserHref();

    if (!href) {
      return false;
    }

    setGlobalInitialUrl(href);
    setCoreInitialUrl(href);

    let protectedCaptured = false;
    let protectedRouteKey = "";

    for (const config of PROTECTED_ROUTES) {
      if (isRouteScrubbed(config)) {
        continue;
      }

      if (
        matchesProtectedRoute(config, href) &&
        hasProtectedTokenInUrlLike(config, href) &&
        !getStoredInitialUrl(config)
      ) {
        setStoredInitialUrl(
          config,
          href
        );

        protectedCaptured = true;
        protectedRouteKey = config.key || "";
      }
    }

    const signature = [
      href,
      protectedCaptured ? "protected" : "normal",
      protectedRouteKey,
    ].join("|");

    routerBootState.capturedInitialUrlAt =
      Date.now();

    if (signature !== routerBootState.lastInitialCaptureSignature) {
      routerBootState.lastInitialCaptureSignature =
        signature;

      safeEmit(
        ROUTER_BOOT_EVENTS.initialUrlCaptured,
        {
          href:
            redactTokenInText(href),

          protectedCaptured,
          protectedRouteKey,

          at:
            safeIsoDate(routerBootState.capturedInitialUrlAt),
        }
      );
    }

    return true;
  } catch {
    return false;
  }
}

function getStateInitialUrlCandidates() {
  const state =
    ensureObject(RuntimeAppCore?.state);

  const keys = [
    APP_STATE_KEYS?.bootProtectedInitialUrl,
    APP_STATE_KEYS?.bootActivationInitialUrl,
    APP_STATE_KEYS?.bootResetConfirmInitialUrl,
    APP_STATE_KEYS?.bootResetPasswordConfirmInitialUrl,
    "bootProtectedInitialUrl",
    "bootActivationInitialUrl",
    "bootResetConfirmInitialUrl",
    "bootResetPasswordConfirmInitialUrl",
  ].filter(Boolean);

  return keys
    .map((key) => safeText(state[key], ""))
    .filter(Boolean);
}

function resolveProtectedInitialContext(value = "") {
  captureInitialBrowserUrl();

  const explicit = safeText(value, "");

  const candidates = [
    explicit,
    ...getProtectedStoredUrls(),
    ...getStateInitialUrlCandidates(),
    getGlobalInitialUrl(),
    getBrowserHref(),
    getBrowserPath(),
  ]
    .map((candidate) => safeText(candidate, ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    const config = getProtectedRouteConfig(candidate);

    if (!config) {
      continue;
    }

    if (isRouteScrubbed(config)) {
      continue;
    }

    if (!hasProtectedTokenInUrlLike(config, candidate)) {
      continue;
    }

    const publicPath =
      getPathFromUrlLike(candidate);

    const canonicalPath =
      toCanonicalPath(publicPath);

    return {
      config,

      key:
        config.key || "",

      path:
        canonicalPath,

      publicPath:
        normalizePath(publicPath),

      canonicalPath,

      cleanPath:
        getCleanPath(canonicalPath),

      cleanPublicPath:
        getCleanPath(publicPath),

      url:
        candidate,

      hasToken:
        true,

      redactedPath:
        redactTokenInText(canonicalPath),

      redactedPublicPath:
        redactTokenInText(publicPath),

      redactedUrl:
        redactTokenInText(candidate),
    };
  }

  return {
    config: null,
    key: "",
    path: "",
    publicPath: "",
    canonicalPath: "",
    cleanPath: "",
    cleanPublicPath: "",
    url: "",
    hasToken: false,
    redactedPath: "",
    redactedPublicPath: "",
    redactedUrl: "",
  };
}

function exposeInitialContextToCore(context = {}) {
  const data = ensureObject(context);

  const payload = {
    bootProtectedInitialUrl:
      data.url || "",

    bootProtectedInitialPath:
      data.path || "",

    bootProtectedInitialPublicPath:
      data.publicPath || "",

    bootIsPublicTokenRoute:
      Boolean(data.config),

    bootHasPublicToken:
      Boolean(data.hasToken),

    bootProtectedRouteKey:
      data.key || "",
  };

  if (data.key === "activation") {
    payload.bootActivationInitialUrl =
      data.url || "";

    payload.bootActivationInitialPath =
      data.path || "";

    payload.bootActivationInitialPublicPath =
      data.publicPath || "";

    payload.bootIsActivation =
      Boolean(data.config);

    payload.bootHasActivationToken =
      Boolean(data.hasToken);
  }

  if (data.key === "resetConfirm") {
    payload.bootResetConfirmInitialUrl =
      data.url || "";

    payload.bootResetPasswordConfirmInitialUrl =
      data.url || "";

    payload.bootResetConfirmInitialPath =
      data.path || "";

    payload.bootResetPasswordConfirmInitialPath =
      data.path || "";

    payload.bootResetConfirmInitialPublicPath =
      data.publicPath || "";

    payload.bootResetPasswordConfirmInitialPublicPath =
      data.publicPath || "";

    payload.bootIsResetConfirm =
      Boolean(data.config);

    payload.bootHasResetToken =
      Boolean(data.hasToken);
  }

  try {
    RuntimeAppCore?.setState?.(
      payload,
      {
        source:
          "app-router-bootstrap:protected-initial-context",
      }
    );
  } catch {}

  try {
    if (
      RuntimeAppCore?.state &&
      typeof RuntimeAppCore.state === "object"
    ) {
      Object.assign(
        RuntimeAppCore.state,
        payload
      );
    }
  } catch {}

  return payload;
}

function shouldProtectInitialHistory(path = "/") {
  if (isProtectedPublicTokenPath(path)) {
    return true;
  }

  const protectedInitial =
    resolveProtectedInitialContext(path);

  return Boolean(
    protectedInitial.config &&
      protectedInitial.path
  );
}

/* =========================================================
   ROUTE CONTEXT
========================================================= */

function createRouteContext(input = "") {
  const browserPath = getBrowserPath();

  const helperPublicPath = (() => {
    try {
      return getCurrentPublicPath(RuntimeAppCore, RuntimeRouter);
    } catch {
      return "";
    }
  })();

  const helperCurrentPath = (() => {
    try {
      return getCurrentPath(RuntimeAppCore, RuntimeRouter);
    } catch {
      return "";
    }
  })();

  const sourcePath =
    normalizePath(
      input ||
        browserPath ||
        helperPublicPath ||
        helperCurrentPath ||
        DEFAULT_ROUTE
    );

  const publicPath =
    toPublicPath(sourcePath);

  const canonicalPath =
    toCanonicalPath(publicPath);

  return {
    input:
      sourcePath,

    publicPath,

    canonicalPath,

    cleanPublicPath:
      getCleanPath(publicPath),

    cleanCanonicalPath:
      getCleanPath(canonicalPath),

    usernameScoped:
      isUsernameScopedPublicPath(publicPath),

    browserPath:
      browserPath || "",

    browserHref:
      getBrowserHref(),

    source:
      "app-router-bootstrap",
  };
}

function getSafeInitialRouteContext() {
  const protectedInitial =
    resolveProtectedInitialContext();

  if (
    protectedInitial.config &&
    protectedInitial.path
  ) {
    exposeInitialContextToCore(protectedInitial);

    return createRouteContext(
      protectedInitial.publicPath ||
        protectedInitial.path
    );
  }

  return createRouteContext(
    getBrowserPath()
  );
}

function getSafeInitialPath() {
  return getSafeInitialRouteContext().canonicalPath;
}

/* =========================================================
   STATE SYNC
========================================================= */

function safeSetState(payload = {}) {
  const cleanPayload = ensureObject(payload);

  try {
    RuntimeAppCore?.setState?.(
      cleanPayload,
      {
        source:
          "app-router-bootstrap",
      }
    );
  } catch {}

  try {
    RuntimeAppCore?.patchState?.(
      cleanPayload,
      {
        source:
          "app-router-bootstrap",
      }
    );
  } catch {}

  try {
    if (
      RuntimeAppCore?.state &&
      typeof RuntimeAppCore.state === "object"
    ) {
      Object.assign(
        RuntimeAppCore.state,
        cleanPayload
      );
    }
  } catch {}
}

function safeSetRoute(route = DEFAULT_ROUTE) {
  const cleanRoute =
    toCanonicalPath(route || DEFAULT_ROUTE);

  try {
    RuntimeAppCore?.setRoute?.(cleanRoute);
  } catch {}

  safeSetState({
    route: cleanRoute,
    canonicalPath: cleanRoute,
  });

  return cleanRoute;
}

function safeSetPublicPath(publicPath = DEFAULT_ROUTE) {
  const cleanPublicPath =
    toPublicPath(publicPath || DEFAULT_ROUTE);

  try {
    RuntimeAppCore?.setPublicPath?.(cleanPublicPath);
  } catch {}

  safeSetState({
    publicPath: cleanPublicPath,
  });

  return cleanPublicPath;
}

function getRouterStateCanonicalPath() {
  try {
    return normalizePath(
      getCurrentCanonicalPath(RuntimeAppCore, RuntimeRouter) ||
        getCurrentPath(RuntimeAppCore, RuntimeRouter) ||
        ""
    );
  } catch {
    return "";
  }
}

function getRouterStatePublicPath() {
  try {
    return normalizePath(
      getCurrentPublicPath(RuntimeAppCore, RuntimeRouter) ||
        ""
    );
  } catch {
    return "";
  }
}

function shouldTrustRouterResolvedCanonical(routerPath = "", expectedPath = "", meta = {}) {
  const safeMeta = ensureObject(meta);

  if (safeMeta.protectedRoute === true) {
    return pathsAreSameCleanPath(
      routerPath,
      expectedPath
    );
  }

  const routerClean = getCleanPath(routerPath);
  const expectedClean = getCleanPath(expectedPath);

  if (!routerClean) {
    return false;
  }

  if (routerClean === expectedClean) {
    return true;
  }

  if (
    routerClean === LOGIN_ROUTE &&
    expectedClean !== LOGIN_ROUTE
  ) {
    return true;
  }

  if (
    routerClean !== DEFAULT_ROUTE &&
    routerClean !== "/"
  ) {
    return true;
  }

  return (
    expectedClean === DEFAULT_ROUTE ||
    expectedClean === "/"
  );
}

function resolvePublicPathForSync({
  routeContext,
  resolvedCanonicalPath,
  routerPublicPath,
  routerCanonicalPath,
}) {
  const context = ensureObject(routeContext);

  const expectedPublicPath =
    normalizePath(
      context.publicPath ||
        getBrowserPath() ||
        resolvedCanonicalPath ||
        DEFAULT_ROUTE
    );

  if (
    context.usernameScoped &&
    pathsAreSameCleanPath(
      toCanonicalPath(expectedPublicPath),
      resolvedCanonicalPath
    )
  ) {
    return expectedPublicPath;
  }

  if (
    routerPublicPath &&
    !isDefaultCleanPath(routerPublicPath)
  ) {
    return routerPublicPath;
  }

  if (
    routerCanonicalPath &&
    !isDefaultCleanPath(routerCanonicalPath) &&
    !pathsAreSameCleanPath(
      routerCanonicalPath,
      resolvedCanonicalPath
    )
  ) {
    return routerCanonicalPath;
  }

  return expectedPublicPath;
}

function syncResolvedRouteState(fallbackPath = DEFAULT_ROUTE, meta = {}) {
  const safeMeta = ensureObject(meta);

  const routeContext =
    safeMeta.routeContext ||
    createRouteContext(fallbackPath);

  const protectedContext =
    safeMeta.protectedContext?.config
      ? safeMeta.protectedContext
      : resolveProtectedInitialContext(
          routeContext.publicPath ||
            routeContext.canonicalPath ||
            fallbackPath
        );

  const expectedCanonicalPath =
    toCanonicalPath(
      protectedContext.path ||
        routeContext.canonicalPath ||
        fallbackPath ||
        DEFAULT_ROUTE
    );

  const expectedPublicPath =
    normalizePath(
      protectedContext.publicPath ||
        routeContext.publicPath ||
        fallbackPath ||
        expectedCanonicalPath ||
        DEFAULT_ROUTE
    );

  const routerCanonicalPath =
    getRouterStateCanonicalPath();

  const routerPublicPath =
    getRouterStatePublicPath();

  let resolvedCanonicalPath =
    shouldTrustRouterResolvedCanonical(
      routerCanonicalPath,
      expectedCanonicalPath,
      {
        protectedRoute:
          Boolean(protectedContext.config),
      }
    )
      ? toCanonicalPath(routerCanonicalPath)
      : expectedCanonicalPath;

  if (
    protectedContext.config &&
    protectedContext.path
  ) {
    resolvedCanonicalPath =
      toCanonicalPath(
        protectedContext.path ||
          protectedContext.cleanPath ||
          protectedContext.config.path
      );
  }

  let resolvedPublicPath =
    resolvePublicPathForSync({
      routeContext: {
        ...routeContext,
        publicPath:
          expectedPublicPath,
      },
      resolvedCanonicalPath,
      routerPublicPath,
      routerCanonicalPath,
    });

  if (
    protectedContext.config &&
    protectedContext.path
  ) {
    const publicHasToken =
      hasProtectedTokenInUrlLike(
        protectedContext.config,
        resolvedPublicPath
      );

    if (!publicHasToken) {
      resolvedPublicPath =
        normalizePath(
          protectedContext.publicPath ||
            protectedContext.path
        );
    }
  }

  const route = safeSetRoute(resolvedCanonicalPath);
  const publicPath = safeSetPublicPath(resolvedPublicPath);

  const payload = {
    canonicalPath: route,
    publicPath,

    protectedRouteKey:
      protectedContext.key || "",

    protectedInitialUrl:
      protectedContext.url || "",

    protectedInitialPath:
      protectedContext.path || "",

    protectedInitialPublicPath:
      protectedContext.publicPath || "",

    usernameScoped:
      Boolean(routeContext.usernameScoped),
  };

  routerBootState.lastResolvedCanonicalPath = route;
  routerBootState.lastResolvedPublicPath = publicPath;

  safeEmit(
    ROUTER_BOOT_EVENTS.stateSynced,
    payload
  );

  return payload;
}

function markInitialRenderDone(value = true) {
  firstRenderDone = Boolean(value);

  safeSetState({
    initialRouteRendered:
      Boolean(value),
  });
}

/* =========================================================
   RENDER OPTIONS
========================================================= */

function getRenderOptions(path = DEFAULT_ROUTE, meta = {}) {
  const safeMeta = ensureObject(meta);

  const routeContext =
    safeMeta.routeContext ||
    createRouteContext(path);

  const protectedContext =
    safeMeta.protectedContext?.config
      ? safeMeta.protectedContext
      : resolveProtectedInitialContext(
          routeContext.publicPath ||
            path
        );

  const canonicalPath =
    toCanonicalPath(
      protectedContext.path ||
        routeContext.canonicalPath ||
        path ||
        DEFAULT_ROUTE
    );

  const publicPath =
    normalizePath(
      protectedContext.publicPath ||
        routeContext.publicPath ||
        canonicalPath
    );

  if (
    protectedContext.config &&
    protectedContext.hasToken
  ) {
    return {
      skipHistory: true,

      preservePath: true,
      preserveUrl: true,
      preserveSearch: true,
      preserveHash: true,
      preservePublicPath: true,

      replaceState: false,

      force: true,
      forceRender: true,
      initialRender: true,

      protectedInitialUrl: true,
      protectedRouteKey: protectedContext.key || "",
      protectedInitialPath: protectedContext.path || "",
      protectedInitialPublicPath: protectedContext.publicPath || "",
      protectedInitialUrlValue: protectedContext.url || "",

      canonicalPath,
      publicPath,
      requestedPath: publicPath,

      browserPath:
        routeContext.browserPath || "",

      usernameScoped:
        Boolean(routeContext.usernameScoped),

      source:
        "app-router-bootstrap",
    };
  }

  return {
    replaceState: true,

    force: true,
    forceRender: true,
    initialRender: true,

    preserveUrl: true,
    preservePublicPath: true,

    canonicalPath,
    publicPath,
    requestedPath: publicPath,

    browserPath:
      routeContext.browserPath || "",

    usernameScoped:
      Boolean(routeContext.usernameScoped),

    source:
      "app-router-bootstrap",
  };
}

/* =========================================================
   EARLY URL CAPTURE
========================================================= */

captureInitialBrowserUrl();

/* =========================================================
   CONFIGURE
========================================================= */

function exposeRouterToCore() {
  try {
    RuntimeAppCore.Router = RuntimeRouter;
  } catch {}

  try {
    RuntimeAppCore.router = RuntimeRouter;
  } catch {}

  try {
    if (isFunction(RuntimeAppCore?.modules?.register)) {
      RuntimeAppCore.modules.register(
        "Router",
        RuntimeRouter,
        {
          overwrite: true,
          replace: true,
          aliases: ["router"],
          source: "app-router-bootstrap",
        }
      );

      RuntimeAppCore.modules.register(
        "router",
        RuntimeRouter,
        {
          overwrite: true,
          replace: true,
          aliases: ["Router"],
          source: "app-router-bootstrap",
        }
      );
    }
  } catch {}

  try {
    if (isFunction(RuntimeAppCore?.modules?.set)) {
      RuntimeAppCore.modules.set("Router", RuntimeRouter);
      RuntimeAppCore.modules.set("router", RuntimeRouter);
    }
  } catch {}

  try {
    if (
      RuntimeAppCore?.modules &&
      typeof RuntimeAppCore.modules === "object" &&
      !isFunction(RuntimeAppCore.modules.register) &&
      !isFunction(RuntimeAppCore.modules.set)
    ) {
      RuntimeAppCore.modules.Router = RuntimeRouter;
      RuntimeAppCore.modules.router = RuntimeRouter;
    }
  } catch {}

  try {
    if (
      RuntimeAppCore?.registry?.modules &&
      isFunction(RuntimeAppCore.registry.modules.set)
    ) {
      RuntimeAppCore.registry.modules.set("Router", RuntimeRouter);
      RuntimeAppCore.registry.modules.set("router", RuntimeRouter);
    }
  } catch {}

  return true;
}

export function configureRouter(deps = {}) {
  resolveRuntimeDeps(deps);
  captureInitialBrowserUrl();

  if (configured) {
    exposeRouterToCore();
    return true;
  }

  exposeRouterToCore();

  try {
    if (isFunction(RuntimeRouter?.configure)) {
      const result =
        RuntimeRouter.configure({
          core: RuntimeAppCore,
          AppCore: RuntimeAppCore,

          auth: RuntimeAuth,
          Auth: RuntimeAuth,

          source: "app-router-bootstrap",
        });

      if (result === false) {
        configured = false;
        return false;
      }
    }

    configured = true;
    routerBootState.lastConfiguredAt = Date.now();

    safeEmit(
      ROUTER_BOOT_EVENTS.configured,
      {
        configured: true,
        at: safeIsoDate(routerBootState.lastConfiguredAt),
      }
    );

    safeLog("Router configurado.");
  } catch (error) {
    configured = false;
    routerBootState.lastRenderError = normalizeError(error);

    safeError(
      "Error configurando Router:",
      error
    );

    return false;
  }

  exposeRouterToCore();

  return true;
}

/* =========================================================
   BIND
========================================================= */

export function bindRouter(deps = {}) {
  resolveRuntimeDeps(deps);
  captureInitialBrowserUrl();

  if (!configured) {
    const configuredNow = configureRouter(deps);

    if (configuredNow === false) {
      return false;
    }
  }

  if (bound) {
    return true;
  }

  const protectedInitial =
    resolveProtectedInitialContext();

  const bindContext = {
    core: RuntimeAppCore,
    AppCore: RuntimeAppCore,

    auth: RuntimeAuth,
    Auth: RuntimeAuth,

    initialRenderDone:
      Boolean(firstRenderDone),

    protectedInitialUrl:
      Boolean(protectedInitial.config),

    protectedRouteKey:
      protectedInitial.key || "",

    protectedInitialPath:
      protectedInitial.path || "",

    protectedInitialPublicPath:
      protectedInitial.publicPath || "",

    preserveInitialUrl:
      Boolean(protectedInitial.config),

    source:
      "app-router-bootstrap",
  };

  try {
    if (isFunction(RuntimeRouter?.bind)) {
      let result;

      try {
        result = RuntimeRouter.bind(bindContext);
      } catch {
        result = RuntimeRouter.bind();
      }

      if (result === false) {
        bound = false;
        return false;
      }
    }

    bound = true;
    routerBootState.lastBoundAt = Date.now();

    safeEmit(
      ROUTER_BOOT_EVENTS.bound,
      {
        bound: true,

        initialRenderDone:
          Boolean(firstRenderDone),

        protectedInitialUrl:
          Boolean(protectedInitial.config),

        protectedRouteKey:
          protectedInitial.key || "",

        at:
          safeIsoDate(routerBootState.lastBoundAt),
      }
    );

    safeLog(
      "Router listeners activos.",
      {
        initialRenderDone:
          Boolean(firstRenderDone),

        protectedInitialUrl:
          Boolean(protectedInitial.config),

        protectedRouteKey:
          protectedInitial.key || "",
      }
    );
  } catch (error) {
    bound = false;
    routerBootState.lastRenderError = normalizeError(error);

    safeError(
      "Error bind Router:",
      error
    );

    return false;
  }

  return true;
}

/* =========================================================
   INTERNAL RENDER
========================================================= */

async function runInitialRender(path = DEFAULT_ROUTE, cycleId = 0, meta = {}, deps = {}) {
  const safeMeta = ensureObject(meta);
  const runtime = resolveRuntimeDeps(deps);

  const routeContext =
    safeMeta.routeContext ||
    createRouteContext(path);

  const protectedContext =
    safeMeta.protectedContext?.config
      ? safeMeta.protectedContext
      : resolveProtectedInitialContext(
          routeContext.publicPath ||
            path
        );

  const target =
    toCanonicalPath(
      protectedContext.path ||
        routeContext.canonicalPath ||
        path ||
        DEFAULT_ROUTE
    );

  const publicPath =
    normalizePath(
      protectedContext.publicPath ||
        routeContext.publicPath ||
        target
    );

  const options =
    getRenderOptions(
      target,
      {
        routeContext: {
          ...routeContext,
          canonicalPath: target,
          publicPath,
        },
        protectedContext,
      }
    );

  routerBootState.lastInitialPath = target;
  routerBootState.lastInitialCanonicalPath = target;
  routerBootState.lastInitialPublicPath = publicPath;
  routerBootState.lastProtectedRouteKey = protectedContext.key || "";

  safeEmit(
    ROUTER_BOOT_EVENTS.initialRenderStart,
    {
      target,
      publicPath,
      canonicalPath: target,

      options:
        sanitizeRenderOptions(options),

      cycleId,

      protectedRouteKey:
        protectedContext.key || "",

      usernameScoped:
        Boolean(routeContext.usernameScoped),

      at:
        safeIsoDate(),
    }
  );

  if (!isFunction(RuntimeRouter?.render)) {
    safeWarn(
      "Router.render no disponible. Se sincroniza estado mínimo."
    );

    syncResolvedRouteState(
      target,
      {
        routeContext: {
          ...routeContext,
          canonicalPath: target,
          publicPath,
        },
        protectedContext,
      }
    );

    try {
      runtime.applyPostRenderLoaderPolicy?.({
        AppCore: RuntimeAppCore,
        Router: RuntimeRouter,
        hideLoader: runtime.hideLoader,
        path: target,
        publicPath,
        reason: "router-render-missing",
      });
    } catch {}

    markInitialRenderDone(true);

    return false;
  }

  /*
    CRÍTICO:
    Router.render recibe canonicalPath como primer argumento.
    publicPath/requestedPath quedan en options.
  */
  await Promise.resolve(
    RuntimeRouter.render(
      target,
      options
    )
  );

  if (cycleId !== renderCycle) {
    safeWarn(
      "Render inicial stale omitido.",
      {
        cycleId,
        activeCycle: renderCycle,
      }
    );

    return false;
  }

  const resolved =
    syncResolvedRouteState(
      target,
      {
        routeContext: {
          ...routeContext,
          canonicalPath: target,
          publicPath,
        },
        protectedContext,
      }
    );

  try {
    runtime.applyPostRenderLoaderPolicy?.({
      AppCore: RuntimeAppCore,
      Router: RuntimeRouter,
      hideLoader: runtime.hideLoader,
      path: target,
      publicPath,
      reason: "initial-render",
    });
  } catch (error) {
    safeWarn(
      "applyPostRenderLoaderPolicy() falló.",
      error
    );
  }

  markInitialRenderDone(true);

  routerBootState.lastRenderedPath = target;
  routerBootState.lastRenderedPublicPath = publicPath;
  routerBootState.lastRenderAt = Date.now();
  routerBootState.lastRenderOk = true;
  routerBootState.lastRenderError = null;

  safeEmit(
    ROUTER_BOOT_EVENTS.initialRenderDone,
    {
      ok: true,

      target,
      publicPath,
      canonicalPath: target,

      resolved: {
        canonicalPath:
          resolved.canonicalPath,

        publicPath:
          resolved.publicPath,
      },

      cycleId,

      protectedRouteKey:
        protectedContext.key || "",

      usernameScoped:
        Boolean(routeContext.usernameScoped),

      at:
        safeIsoDate(routerBootState.lastRenderAt),
    }
  );

  safeLog(
    "Render inicial completado.",
    {
      target,
      publicPath,
      canonicalPath: target,
      options: sanitizeRenderOptions(options),
      resolved,
    }
  );

  return true;
}

/* =========================================================
   INITIAL RENDER
========================================================= */

export async function renderInitialRoute(deps = {}) {
  /*
    Orden correcto desde src/app/index.js:
    1. configureRouter()
    2. renderInitialRoute()
    3. bindRouter()

    NO llamar bindRouter() aquí.
  */

  resolveRuntimeDeps(deps);
  captureInitialBrowserUrl();

  if (!configured) {
    const configuredNow = configureRouter(deps);

    if (configuredNow === false) {
      return false;
    }
  }

  const initialRouteContextBeforeBind =
    getSafeInitialRouteContext();

  if (firstRenderDone) {
    safeLog(
      "renderInitialRoute omitido: primer render ya completado.",
      {
        route:
          RuntimeAppCore?.state?.route || DEFAULT_ROUTE,

        publicPath:
          RuntimeAppCore?.state?.publicPath || DEFAULT_ROUTE,
      }
    );

    return true;
  }

  if (initialRenderPromise) {
    return initialRenderPromise;
  }

  const cycleId = ++renderCycle;

  initialRenderPromise =
    (async () => {
      const routeContext =
        initialRouteContextBeforeBind ||
        getSafeInitialRouteContext();

      const path =
        toCanonicalPath(
          routeContext?.canonicalPath ||
            getSafeInitialPath() ||
            DEFAULT_ROUTE
        );

      const publicPath =
        normalizePath(
          routeContext?.publicPath ||
            getBrowserPath() ||
            path
        );

      const protectedContext =
        resolveProtectedInitialContext(
          publicPath || path
        );

      const finalRouteContext = {
        ...createRouteContext(publicPath),
        ...routeContext,

        publicPath,

        canonicalPath:
          path,

        cleanPublicPath:
          getCleanPath(publicPath),

        cleanCanonicalPath:
          getCleanPath(path),

        usernameScoped:
          isUsernameScopedPublicPath(publicPath),
      };

      try {
        safeLog(
          "Render inicial:",
          {
            path,
            publicPath,
            canonicalPath: path,

            protectedInitialUrl:
              Boolean(protectedContext.config),

            protectedRouteKey:
              protectedContext.key || "",

            initialUrl:
              getGlobalInitialUrl(),

            protectedInitialPath:
              protectedContext.path || "",

            protectedInitialPublicPath:
              protectedContext.publicPath || "",

            usernameScoped:
              Boolean(finalRouteContext.usernameScoped),
          }
        );

        if (
          finalRouteContext.usernameScoped &&
          pathsAreSameCleanPath(path, DEFAULT_ROUTE) &&
          !pathsAreSameCleanPath(publicPath, DEFAULT_ROUTE)
        ) {
          safeWarn(
            "Ruta pública con @usuario habría caído a HOME. Se bloquea fallback incorrecto.",
            {
              publicPath,
              canonicalPath: path,
            }
          );
        }

        const ok =
          await runInitialRender(
            path,
            cycleId,
            {
              routeContext:
                finalRouteContext,

              protectedContext,
            },
            deps
          );

        return Boolean(ok);
      } catch (error) {
        routerBootState.lastRenderOk = false;
        routerBootState.lastRenderError = normalizeError(error);

        safeEmit(
          ROUTER_BOOT_EVENTS.initialRenderError,
          {
            path,
            publicPath,
            canonicalPath: path,

            protectedInitialUrl:
              Boolean(protectedContext.config),

            protectedRouteKey:
              protectedContext.key || "",

            error:
              routerBootState.lastRenderError,

            at:
              safeIsoDate(),
          }
        );

        safeWarn(
          "Fallo render inicial.",
          {
            path,
            publicPath,
            canonicalPath: path,

            protectedInitialUrl:
              Boolean(protectedContext.config),

            protectedRouteKey:
              protectedContext.key || "",

            error,
          }
        );

        try {
          const fallback =
            protectedContext.config?.path
              ? (
                  protectedContext.publicPath ||
                  protectedContext.path ||
                  publicPath ||
                  path
                )
              : shouldUsePath(DEFAULT_ROUTE)
                ? DEFAULT_ROUTE
                : LOGIN_ROUTE;

          const fallbackContext =
            protectedContext.config?.path
              ? createRouteContext(
                  protectedContext.publicPath ||
                    protectedContext.path ||
                    fallback
                )
              : createRouteContext(fallback);

          safeEmit(
            ROUTER_BOOT_EVENTS.initialRenderFallback,
            {
              from: path,
              fromPublicPath: publicPath,

              to: fallback,

              protectedInitialUrl:
                Boolean(protectedContext.config),

              protectedRouteKey:
                protectedContext.key || "",

              at:
                safeIsoDate(),
            }
          );

          const ok =
            await runInitialRender(
              toCanonicalPath(fallback),
              cycleId,
              {
                routeContext:
                  fallbackContext,

                protectedContext,

                fallbackFor:
                  path,
              },
              deps
            );

          if (ok) {
            safeLog(
              "Fallback render inicial completado.",
              {
                fallback,
              }
            );
          }

          return Boolean(ok);
        } catch (fatal) {
          routerBootState.lastRenderOk = false;
          routerBootState.lastRenderError = normalizeError(fatal);

          safeError(
            "Render inicial fatal:",
            fatal
          );

          markInitialRenderDone(false);

          return false;
        }
      } finally {
        initialRenderPromise = null;
      }
    })();

  return initialRenderPromise;
}

/* =========================================================
   RESET / DEBUG
========================================================= */

export function resetRouterBootstrap(options = {}) {
  const {
    resetConfigured = false,
    resetBound = false,
  } = ensureObject(options);

  firstRenderDone = false;
  initialRenderPromise = null;
  renderCycle = 0;

  if (resetConfigured) {
    configured = false;
  }

  if (resetBound) {
    bound = false;
  }

  routerBootState.lastInitialPath = "";
  routerBootState.lastInitialPublicPath = "";
  routerBootState.lastInitialCanonicalPath = "";
  routerBootState.lastRenderedPath = "";
  routerBootState.lastRenderedPublicPath = "";
  routerBootState.lastResolvedCanonicalPath = "";
  routerBootState.lastResolvedPublicPath = "";
  routerBootState.lastRenderAt = 0;
  routerBootState.lastRenderOk = false;
  routerBootState.lastRenderError = null;
  routerBootState.lastProtectedRouteKey = "";

  safeSetState({
    initialRouteRendered: false,
  });

  safeEmit(
    ROUTER_BOOT_EVENTS.reset,
    {
      resetConfigured:
        Boolean(resetConfigured),

      resetBound:
        Boolean(resetBound),

      at:
        safeIsoDate(),
    }
  );

  return true;
}

export function getRouterBootstrapState() {
  const protectedInitial =
    resolveProtectedInitialContext();

  let routerSnapshot = null;

  try {
    routerSnapshot =
      RuntimeRouter?.getSnapshot?.() ||
      RuntimeRouter?.getDebugSnapshot?.() ||
      RuntimeRouter?.getState?.() ||
      null;
  } catch {}

  const currentBrowserPath = getBrowserPath();
  const currentBrowserCanonicalPath =
    toCanonicalPath(currentBrowserPath);

  return sanitizePayload({
    version:
      ROUTER_BOOTSTRAP_VERSION,

    configured:
      Boolean(configured),

    bound:
      Boolean(bound),

    firstRenderDone:
      Boolean(firstRenderDone),

    initialRenderInFlight:
      Boolean(initialRenderPromise),

    renderCycle:
      safeNumber(renderCycle, 0),

    route:
      RuntimeAppCore?.state?.route || DEFAULT_ROUTE,

    publicPath:
      RuntimeAppCore?.state?.publicPath || DEFAULT_ROUTE,

    initialUrl:
      getGlobalInitialUrl(),

    protectedInitialUrl:
      protectedInitial.url || "",

    protectedInitialPath:
      protectedInitial.path || "",

    protectedInitialPublicPath:
      protectedInitial.publicPath || "",

    protectedInitialRouteKey:
      protectedInitial.key || "",

    hasProtectedInitialToken:
      Boolean(
        protectedInitial.config &&
          protectedInitial.hasToken
      ),

    currentBrowserPath,

    currentBrowserCanonicalPath,

    browserHref:
      getBrowserHref(),

    lastInitialPath:
      routerBootState.lastInitialPath,

    lastInitialPublicPath:
      routerBootState.lastInitialPublicPath,

    lastInitialCanonicalPath:
      routerBootState.lastInitialCanonicalPath,

    lastRenderedPath:
      routerBootState.lastRenderedPath,

    lastRenderedPublicPath:
      routerBootState.lastRenderedPublicPath,

    lastResolvedCanonicalPath:
      routerBootState.lastResolvedCanonicalPath,

    lastResolvedPublicPath:
      routerBootState.lastResolvedPublicPath,

    lastRenderAt:
      routerBootState.lastRenderAt,

    lastRenderAtIso:
      routerBootState.lastRenderAt
        ? safeIsoDate(routerBootState.lastRenderAt)
        : "",

    lastRenderOk:
      Boolean(routerBootState.lastRenderOk),

    lastRenderError:
      routerBootState.lastRenderError,

    lastProtectedRouteKey:
      routerBootState.lastProtectedRouteKey,

    capturedInitialUrlAt:
      routerBootState.capturedInitialUrlAt,

    capturedInitialUrlAtIso:
      routerBootState.capturedInitialUrlAt
        ? safeIsoDate(routerBootState.capturedInitialUrlAt)
        : "",

    lastConfiguredAt:
      routerBootState.lastConfiguredAt,

    lastConfiguredAtIso:
      routerBootState.lastConfiguredAt
        ? safeIsoDate(routerBootState.lastConfiguredAt)
        : "",

    lastBoundAt:
      routerBootState.lastBoundAt,

    lastBoundAtIso:
      routerBootState.lastBoundAt
        ? safeIsoDate(routerBootState.lastBoundAt)
        : "",

    shouldProtectInitialHistory:
      shouldProtectInitialHistory(currentBrowserPath),

    routerSnapshot,
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  configureRouter,
  bindRouter,
  renderInitialRoute,

  resetRouterBootstrap,
  getRouterBootstrapState,
};
