/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: src/app/router.js

   Router bootstrap simple:
   - configura Router una vez
   - bindea Router una vez
   - render inicial serializado
   - preserva rutas técnicas con token
   - separa publicPath / canonicalPath
   - no decide auth ni permisos: delega en Router/Guards
   - no gestiona loader: App.finalizeBoot lo remata
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
  APP_RUNTIME_KEYS,
  APP_ROUTES,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
} from "./constants.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const ROUTER_BOOTSTRAP_VERSION = "17.0.0-simple-fast";

const SOURCE = "app-router-bootstrap";

const DEFAULT_ROUTE = APP_ROUTES?.home || "/";
const LOGIN_ROUTE = APP_ROUTES?.login || "/login";

const INITIAL_URL_KEY =
  APP_RUNTIME_KEYS?.initialUrl ||
  "__ONION_INITIAL_URL__";

const BOOT_CONTEXT_KEY =
  APP_RUNTIME_KEYS?.bootContext ||
  "__ONION_BOOT_CONTEXT__";

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

const FALLBACK_PROTECTED_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: "/activate-account",
    paths: ACTIVATION_PATHS,
    windowKeys: ["__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__"],
    tokenParamNames: ["token", "activationToken", "activateToken", "activation_token", "activate_token", "code", "t"],
    scrubbedHistoryFlags: [
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ],
  }),

  Object.freeze({
    key: "resetConfirm",
    path: "/reset-password/confirm",
    paths: RESET_CONFIRM_PATHS,
    windowKeys: [
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ],
    tokenParamNames: [
      "token",
      "resetToken",
      "passwordResetToken",
      "reset_token",
      "password_reset_token",
      "confirmToken",
      "confirm_token",
      "code",
      "t",
    ],
    scrubbedHistoryFlags: [
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedResetPasswordToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ],
  }),
]);

const SENSITIVE_PARAMS = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "activation_token",
  "activate_token",
  "resetToken",
  "passwordResetToken",
  "reset_token",
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

const EVENTS = Object.freeze({
  configured: "app:router:configured",
  bound: "app:router:bound",
  initialUrlCaptured: "app:router:initial-url:captured",
  initialRenderStart: "app:router:initial-render:start",
  initialRenderDone: "app:router:initial-render:done",
  initialRenderError: "app:router:initial-render:error",
  reset: "app:router:bootstrap:reset",
  debugReady: "app:router:debug:ready",
});

const PUBLIC_USERNAME_RE = /^@[A-Za-z0-9._-]{1,80}$/;
const SENSITIVE_KEY_RE = /token|secret|password|authorization|credential|jwt|bearer|otp|code|session|refresh/i;

/* =========================================================
   RUNTIME
========================================================= */

let RuntimeAppCore = ImportedAppCore;
let RuntimeRouter = ImportedRouter;
let RuntimeAuth = ImportedAuth;

let configured = false;
let bound = false;
let firstRenderDone = false;

let initialRenderPromise = null;
let renderCycle = 0;

const bootState = {
  initialUrlCapturedAt: 0,

  lastConfiguredAt: 0,
  lastBoundAt: 0,

  lastInitialPath: "",
  lastInitialPublicPath: "",

  lastRenderedPath: "",
  lastRenderedPublicPath: "",

  lastResolvedCanonicalPath: "",
  lastResolvedPublicPath: "",

  lastProtectedRouteKey: "",

  lastRenderAt: 0,
  lastRenderOk: false,
  lastRenderError: null,
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

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
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
  const output = [];
  const seen = new Set();

  for (const value of array(values).flat(Infinity)) {
    const clean = text(value, "");

    if (!clean || seen.has(clean)) continue;

    seen.add(clean);
    output.push(clean);
  }

  return output;
}

/* =========================================================
   DEPS
========================================================= */

function resolveDeps(deps = {}) {
  const input = object(deps);

  RuntimeAppCore =
    input.AppCore ||
    input.core ||
    RuntimeAppCore ||
    ImportedAppCore;

  RuntimeRouter =
    input.Router ||
    input.router ||
    RuntimeAppCore?.Router ||
    RuntimeAppCore?.router ||
    RuntimeAppCore?.modules?.get?.("Router") ||
    RuntimeAppCore?.modules?.get?.("router") ||
    RuntimeRouter ||
    ImportedRouter;

  RuntimeAuth =
    input.Auth ||
    input.auth ||
    RuntimeAppCore?.Auth ||
    RuntimeAppCore?.auth ||
    RuntimeAppCore?.modules?.get?.("Auth") ||
    RuntimeAppCore?.modules?.get?.("auth") ||
    RuntimeAuth ||
    ImportedAuth;

  return {
    AppCore: RuntimeAppCore,
    Router: RuntimeRouter,
    Auth: RuntimeAuth,
  };
}

/* =========================================================
   PATHS
========================================================= */

function origin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

function normalizePathname(pathname = "/") {
  let value = text(pathname, "/")
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

  return value.length > 1 ? value.replace(/\/+$/g, "") : value;
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
  if (!raw) return "/";
  if (raw.startsWith("#!")) return normalizePath(raw.replace(/^#!\/?/, "/") || "/");
  return normalizePath(raw.replace(/^#\/?/, "/") || "/");
}

function splitPath(value = "/") {
  let raw = text(value, "/");

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
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
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function normalizePath(path = "/") {
  let raw = text(path, "/");

  if (!raw) return "/";

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, origin());

      if (parsed.origin !== origin()) return "/";

      if (parsed.hash && isHashRouterPath(parsed.hash)) {
        return normalizeHashRouterPath(parsed.hash);
      }

      raw = `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch {
    return "/";
  }

  const parts = splitPath(raw);

  return `${parts.pathname}${parts.search}${parts.hash}`;
}

function getCleanPath(path = "/") {
  return splitPath(normalizePath(path)).pathname;
}

function browserHref() {
  if (!isBrowser()) return "";

  try {
    return text(window.location.href, "");
  } catch {
    return "";
  }
}

function browserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const { pathname, search, hash } = window.location;

    if (hash && isHashRouterPath(hash)) {
      return normalizeHashRouterPath(hash);
    }

    return normalizePath(`${pathname || "/"}${search || ""}${hash || ""}`);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function pathFromUrlLike(value = "") {
  const raw = text(value, "");

  if (!raw) return "";

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed = new URL(raw, origin());

    if (parsed.origin !== origin()) return DEFAULT_ROUTE;

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return normalizePath(`${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`);
  } catch {
    return normalizePath(raw.startsWith("/") || raw.startsWith("#") ? raw : `/${raw}`);
  }
}

function isUsernameSegment(value = "") {
  return PUBLIC_USERNAME_RE.test(text(value, ""));
}

function stripUsernameFromPathname(pathname = "/") {
  const parts = normalizePathname(pathname).split("/").filter(Boolean);

  if (parts.length && isUsernameSegment(parts[0])) {
    const rest = parts.slice(1).join("/");
    return rest ? normalizePathname(`/${rest}`) : "/";
  }

  return normalizePathname(pathname);
}

function currentFromHelper(fn) {
  if (!isFn(fn)) return "";

  const attempts = [
    () => fn(RuntimeAppCore, RuntimeRouter),
    () => fn(RuntimeAppCore),
    () => fn(),
  ];

  for (const attempt of attempts) {
    try {
      const value = attempt();
      if (value) return normalizePath(value);
    } catch {}
  }

  return "";
}

/* =========================================================
   PROTECTED TOKEN ROUTES
========================================================= */

function normalizeProtectedRouteConfigs(configs = []) {
  return Object.freeze(
    array(configs)
      .map((rawConfig) => {
        const cfg = object(rawConfig);

        const key = text(cfg.key || cfg.name, "");
        const basePath = normalizePathname(
          cfg.path ||
            cfg.canonicalPath ||
            (
              key === "activation"
                ? "/activate-account"
                : key === "resetConfirm"
                  ? "/reset-password/confirm"
                  : ""
            )
        );

        const paths = unique([
          basePath,
          ...array(cfg.paths),
          ...array(cfg.aliases),
          cfg.route,
          cfg.canonicalPath,
          ...(key === "activation" ? ACTIVATION_PATHS : []),
          ...(key === "resetConfirm" ? RESET_CONFIRM_PATHS : []),
        ])
          .map(normalizePathname)
          .filter((path) => path && path !== "/");

        if (!paths.length || !basePath) return null;

        const finalKey =
          key ||
          (
            basePath.includes("activate")
              ? "activation"
              : basePath.includes("reset")
                ? "resetConfirm"
                : basePath.replace(/^\/+/, "").replace(/[/-]/g, "_")
          );

        const windowKeys = unique([
          ...array(cfg.windowKeys),
          cfg.windowKey,
          cfg.initialWindowKey,
          cfg.runtimeKey,
          ...(finalKey === "activation" ? ["__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__"] : []),
          ...(finalKey === "resetConfirm"
            ? [
                "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
                "__ONION_RESET_CONFIRM_INITIAL_URL__",
              ]
            : []),
        ]);

        const tokenParamNames = unique([
          ...array(cfg.tokenParamNames),
          ...(finalKey === "activation"
            ? ["token", "activationToken", "activateToken", "activation_token", "activate_token", "code", "t"]
            : []),
          ...(finalKey === "resetConfirm"
            ? ["token", "resetToken", "passwordResetToken", "reset_token", "password_reset_token", "confirmToken", "confirm_token", "code", "t"]
            : []),
        ]);

        const scrubbedHistoryFlags = unique([
          ...array(cfg.scrubbedHistoryFlags),
          ...array(cfg.scrubbedHistoryKeys),
          ...array(cfg.scrubbedStateKeys),
          cfg.scrubbedHistoryFlag,
          "scrubbedPublicTokenRoute",
          "scrubbedTokenRoute",
          ...(finalKey === "activation"
            ? [
                "scrubbedActivationToken",
                "activationTokenScrubbed",
                "scrubbedActivateAccountToken",
              ]
            : []),
          ...(finalKey === "resetConfirm"
            ? [
                "scrubbedResetToken",
                "resetTokenScrubbed",
                "scrubbedResetConfirmToken",
                "scrubbedPasswordResetToken",
                "scrubbedResetPasswordToken",
              ]
            : []),
        ]);

        return Object.freeze({
          ...cfg,
          key: finalKey,
          path: basePath,
          paths: Object.freeze(unique([basePath, ...paths])),
          windowKey: windowKeys[0] || "",
          windowKeys: Object.freeze(windowKeys),
          tokenParamNames: Object.freeze(tokenParamNames),
          scrubbedHistoryFlags: Object.freeze(scrubbedHistoryFlags),
        });
      })
      .filter(Boolean)
  );
}

const PROTECTED_ROUTES = normalizeProtectedRouteConfigs(
  Array.isArray(PROTECTED_PUBLIC_TOKEN_ROUTES) && PROTECTED_PUBLIC_TOKEN_ROUTES.length
    ? PROTECTED_PUBLIC_TOKEN_ROUTES
    : FALLBACK_PROTECTED_ROUTES
);

function canonicalizeProtectedAlias(pathname = "/") {
  const clean = normalizePathname(pathname);

  for (const cfg of PROTECTED_ROUTES) {
    for (const candidate of array(cfg.paths)) {
      if (clean === candidate || clean.startsWith(`${candidate}/`)) {
        const rest = clean.slice(candidate.length);
        return normalizePathname(`${cfg.path}${rest}`);
      }
    }
  }

  return clean;
}

function toCanonicalPath(path = DEFAULT_ROUTE) {
  const normalized = normalizePath(path);
  const pathname = splitPath(normalized).pathname;
  const withoutUsername = stripUsernameFromPathname(pathname);
  const canonical = canonicalizeProtectedAlias(withoutUsername);

  for (const cfg of PROTECTED_ROUTES) {
    if (canonical === cfg.path || canonical.startsWith(`${cfg.path}/`)) {
      return cfg.path;
    }
  }

  return canonical || DEFAULT_ROUTE;
}

function toPublicPath(path = DEFAULT_ROUTE) {
  return normalizePath(path || DEFAULT_ROUTE);
}

function getHistoryState() {
  if (!isBrowser()) return {};

  try {
    return object(window.history?.state);
  } catch {
    return {};
  }
}

function routeScrubbed(cfg = null) {
  if (!cfg) return false;

  const state = getHistoryState();

  for (const flag of array(cfg.scrubbedHistoryFlags)) {
    if (!state[flag]) continue;

    if (flag === "scrubbedPublicTokenRoute" || flag === "scrubbedTokenRoute") {
      if (state[flag] === true || state[flag] === cfg.key) return true;
      continue;
    }

    return true;
  }

  return false;
}

function routeMatches(cfg, value = "") {
  if (!cfg) return false;

  const publicPath = pathFromUrlLike(value);
  const pathname = stripUsernameFromPathname(splitPath(publicPath).pathname);

  return array(cfg.paths).some((path) => (
    pathname === path ||
    pathname.startsWith(`${path}/`)
  ));
}

function protectedRouteConfig(value = "") {
  return PROTECTED_ROUTES.find((cfg) => routeMatches(cfg, value)) || null;
}

function pathToken(cfg, value = "") {
  if (!cfg) return "";

  const publicPath = pathFromUrlLike(value);
  const pathname = stripUsernameFromPathname(splitPath(publicPath).pathname);

  for (const path of array(cfg.paths)) {
    if (!pathname.startsWith(`${path}/`)) continue;

    const token = pathname.slice(`${path}/`.length).split("/")[0];

    try {
      return text(decodeURIComponent(token || ""), "");
    } catch {
      return text(token, "");
    }
  }

  return "";
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");
    return array(names).some((name) => Boolean(text(params.get(name), "")));
  } catch {
    return false;
  }
}

function hasProtectedToken(cfg, value = "") {
  if (!cfg || routeScrubbed(cfg)) return false;

  const raw = text(value, "");

  if (!raw) return false;
  if (pathToken(cfg, raw)) return true;

  const publicPath = pathFromUrlLike(raw);
  const parts = splitPath(publicPath);

  if (hasTokenInSearch(parts.search, cfg.tokenParamNames)) return true;

  try {
    const parsed = new URL(raw, origin());

    if (parsed.origin !== origin()) return false;

    if (hasTokenInSearch(parsed.search, cfg.tokenParamNames)) return true;

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      const hashPath = normalizeHashRouterPath(parsed.hash);
      const hashParts = splitPath(hashPath);

      if (pathToken(cfg, hashPath)) return true;
      if (hasTokenInSearch(hashParts.search, cfg.tokenParamNames)) return true;
    }

    if (parsed.hash && parsed.hash.includes("?")) {
      const query = parsed.hash.split("?").slice(1).join("?");
      if (hasTokenInSearch(query ? `?${query}` : "", cfg.tokenParamNames)) return true;
    }
  } catch {}

  if (parts.hash && parts.hash.includes("?")) {
    const query = parts.hash.split("?").slice(1).join("?");
    if (hasTokenInSearch(query ? `?${query}` : "", cfg.tokenParamNames)) return true;
  }

  return false;
}

function resolveProtectedContext(value = "") {
  const candidates = unique([
    value,
    storedInitialProtectedUrl(),
    stateInitialProtectedUrl(),
    globalInitialUrl(),
    browserHref(),
    browserPath(),
  ]);

  for (const candidate of candidates) {
    const cfg = protectedRouteConfig(candidate);

    if (!cfg) continue;
    if (routeScrubbed(cfg)) continue;
    if (!hasProtectedToken(cfg, candidate)) continue;

    const publicPath = pathFromUrlLike(candidate);

    return {
      config: cfg,
      key: cfg.key || "",
      url: candidate,
      canonicalPath: cfg.path,
      publicPath,
      hasToken: true,
    };
  }

  return {
    config: null,
    key: "",
    url: "",
    canonicalPath: "",
    publicPath: "",
    hasToken: false,
  };
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

  for (const cfg of PROTECTED_ROUTES) {
    for (const path of array(cfg.paths)) {
      try {
        output = output.replace(
          new RegExp(`(${escapeRegExp(path)})\\/([^/?#\\s]+)`, "gi"),
          "$1/***"
        );
      } catch {}
    }

    for (const name of array(cfg.tokenParamNames)) {
      try {
        output = output.replace(
          new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
      } catch {}
    }
  }

  for (const name of SENSITIVE_PARAMS) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function normalizeError(error = null) {
  if (!error) return null;

  return {
    name: text(error?.name, "RouterBootstrapError"),
    message: redact(text(error?.message || error, "Error en bootstrap Router.")),
    code: text(error?.code || error?.status || error?.statusCode, "") || null,
  };
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

  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) return normalizeError(value);

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitize(item, depth + 1));
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = SENSITIVE_KEY_RE.test(key)
        ? item ? "***" : item
        : sanitize(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   LOG / EMIT
========================================================= */

function log(...args) {
  try {
    RuntimeAppCore?.utils?.log?.("[AppRouter]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function warn(...args) {
  try {
    RuntimeAppCore?.utils?.warn?.("[AppRouter]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.warn("[AppRouter]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function errorLog(...args) {
  try {
    RuntimeAppCore?.utils?.error?.("[AppRouter]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.error("[AppRouter]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function emit(eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");

  if (!name) return false;

  const detail = sanitize({
    version: ROUTER_BOOTSTRAP_VERSION,
    source: SOURCE,
    at: iso(),
    ...object(payload),
  });

  let hasBus = false;
  let emitted = false;

  try {
    if (isFn(RuntimeAppCore?.events?.emit)) {
      hasBus = true;
      RuntimeAppCore.events.emit(name, detail);
      emitted = true;
    }
  } catch {}

  if ((options.window === true || !hasBus) && isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      emitted = true;
    } catch {}
  }

  return emitted;
}

/* =========================================================
   INITIAL URL
========================================================= */

function windowValue(key = "") {
  if (!isBrowser() || !key) return "";

  try {
    return text(window[key], "");
  } catch {
    return "";
  }
}

function rawWindowValue(key = "") {
  if (!isBrowser() || !key) return null;

  try {
    return window[key] ?? null;
  } catch {
    return null;
  }
}

function setWindowValue(key = "", value = "", onlyIfMissing = false) {
  if (!isBrowser() || !key || !value) return false;

  try {
    if (onlyIfMissing && window[key]) return true;
    window[key] = value;
    return true;
  } catch {
    return false;
  }
}

function bootContext() {
  return object(rawWindowValue(BOOT_CONTEXT_KEY));
}

function patchBootContext(patch = {}) {
  if (!isBrowser()) return false;

  try {
    window[BOOT_CONTEXT_KEY] = {
      ...object(window[BOOT_CONTEXT_KEY]),
      ...object(patch),
    };

    return true;
  } catch {
    return false;
  }
}

function globalInitialUrl() {
  return windowValue(INITIAL_URL_KEY);
}

function setGlobalInitialUrl(value = "") {
  return setWindowValue(INITIAL_URL_KEY, value, true);
}

function storedInitialProtectedUrl() {
  for (const cfg of PROTECTED_ROUTES) {
    for (const key of array(cfg.windowKeys)) {
      const value = windowValue(key);
      if (value) return value;
    }
  }

  return "";
}

function stateInitialProtectedUrl() {
  const state = object(RuntimeAppCore?.state);
  const boot = bootContext();

  return text(
    state.bootProtectedInitialUrl ||
      state.bootActivationInitialUrl ||
      state.bootResetConfirmInitialUrl ||
      state.bootResetPasswordConfirmInitialUrl ||
      boot.protectedInitialUrl ||
      boot.activationInitialUrl ||
      boot.resetConfirmInitialUrl ||
      boot.initialUrl ||
      "",
    ""
  );
}

function setStoredInitialUrl(cfg, value = "") {
  let ok = false;

  for (const key of array(cfg?.windowKeys)) {
    ok = setWindowValue(key, value, true) || ok;
  }

  return ok;
}

function safeSetState(payload = {}) {
  const patch = object(payload);

  try {
    RuntimeAppCore?.setState?.(patch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      silent: true,
    });
  } catch {}

  try {
    if (RuntimeAppCore?.state && typeof RuntimeAppCore.state === "object") {
      Object.assign(RuntimeAppCore.state, patch);
    }
  } catch {}
}

function captureInitialBrowserUrl() {
  if (!isBrowser()) return false;

  const href = browserHref();
  if (!href) return false;

  setGlobalInitialUrl(href);

  let protectedContext = {
    config: null,
    key: "",
    url: "",
    canonicalPath: "",
    publicPath: "",
    hasToken: false,
  };

  for (const cfg of PROTECTED_ROUTES) {
    if (routeScrubbed(cfg)) continue;
    if (!routeMatches(cfg, href)) continue;
    if (!hasProtectedToken(cfg, href)) continue;

    setStoredInitialUrl(cfg, href);

    protectedContext = {
      config: cfg,
      key: cfg.key || "",
      url: href,
      canonicalPath: cfg.path,
      publicPath: pathFromUrlLike(href),
      hasToken: true,
    };

    break;
  }

  if (protectedContext.config) {
    exposeProtectedContext(protectedContext);
  } else {
    safeSetState({
      bootInitialUrl: href,
      bootInitialPath: pathFromUrlLike(href),
    });
  }

  bootState.initialUrlCapturedAt = now();

  emit(EVENTS.initialUrlCaptured, {
    href: redact(href),
    protectedCaptured: Boolean(protectedContext.config),
    protectedRouteKey: protectedContext.key || "",
    at: iso(bootState.initialUrlCapturedAt),
  });

  return true;
}

function exposeProtectedContext(context = {}) {
  const data = object(context);

  if (!data.config) return false;

  const payload = {
    bootInitialUrl: data.url || "",
    bootInitialPath: data.publicPath || "",
    bootProtectedInitialUrl: data.url || "",
    bootProtectedInitialPath: data.canonicalPath || "",
    bootProtectedInitialPublicPath: data.publicPath || "",

    bootIsPublicTokenRoute: true,
    bootHasPublicToken: Boolean(data.hasToken),
    bootHasProtectedToken: Boolean(data.hasToken),
    bootProtectedRouteKey: data.key || "",
  };

  if (data.key === "activation") {
    Object.assign(payload, {
      bootActivationInitialUrl: data.url || "",
      bootActivationInitialPath: data.canonicalPath || "",
      bootActivationInitialPublicPath: data.publicPath || "",
      bootIsActivation: true,
      bootHasActivationToken: Boolean(data.hasToken),
    });
  }

  if (data.key === "resetConfirm") {
    Object.assign(payload, {
      bootResetConfirmInitialUrl: data.url || "",
      bootResetPasswordConfirmInitialUrl: data.url || "",
      bootResetConfirmInitialPath: data.canonicalPath || "",
      bootResetPasswordConfirmInitialPath: data.canonicalPath || "",
      bootResetConfirmInitialPublicPath: data.publicPath || "",
      bootResetPasswordConfirmInitialPublicPath: data.publicPath || "",
      bootIsResetConfirm: true,
      bootHasResetToken: Boolean(data.hasToken),
    });
  }

  safeSetState(payload);

  patchBootContext({
    protectedInitialUrl: data.url || "",
    protectedInitialPath: data.canonicalPath || "",
    protectedInitialPublicPath: data.publicPath || "",
    isPublicTokenRoute: true,
    hasPublicToken: Boolean(data.hasToken),
    protectedRouteKey: data.key || "",
  });

  return true;
}

/* =========================================================
   ROUTE CONTEXT
========================================================= */

function initialPublicPath() {
  const protectedContext = resolveProtectedContext();

  if (protectedContext.config && protectedContext.publicPath) {
    exposeProtectedContext(protectedContext);
    return protectedContext.publicPath;
  }

  return (
    currentFromHelper(getCurrentPublicPath) ||
    currentFromHelper(getCurrentPath) ||
    browserPath() ||
    DEFAULT_ROUTE
  );
}

function routeContext(input = "") {
  const publicPath = toPublicPath(input || initialPublicPath() || DEFAULT_ROUTE);
  const protectedContext = resolveProtectedContext(publicPath);

  if (protectedContext.config) {
    return {
      publicPath: protectedContext.publicPath,
      canonicalPath: protectedContext.canonicalPath,
      protectedContext,
      browserPath: browserPath(),
      browserHref: browserHref(),
    };
  }

  return {
    publicPath,
    canonicalPath:
      currentFromHelper(getCurrentCanonicalPath) ||
      toCanonicalPath(publicPath),
    protectedContext,
    browserPath: browserPath(),
    browserHref: browserHref(),
  };
}

/* =========================================================
   STATE SYNC
========================================================= */

function safeSetRoute(route = DEFAULT_ROUTE) {
  const clean = toCanonicalPath(route || DEFAULT_ROUTE);

  try {
    RuntimeAppCore?.setRoute?.(clean, {
      source: SOURCE,
      emit: false,
      emitState: false,
      silent: true,
    });
  } catch {}

  safeSetState({
    route: clean,
    canonicalPath: clean,
  });

  return clean;
}

function safeSetPublicPath(publicPath = DEFAULT_ROUTE) {
  const clean = toPublicPath(publicPath || DEFAULT_ROUTE);

  try {
    RuntimeAppCore?.setPublicPath?.(clean, {
      source: SOURCE,
      emit: false,
      emitState: false,
      silent: true,
    });
  } catch {}

  safeSetState({
    publicPath: clean,
  });

  return clean;
}

function routerCanonicalPath(fallback = DEFAULT_ROUTE) {
  try {
    const value = RuntimeRouter?.getCurrentCanonicalPath?.();
    if (value) return toCanonicalPath(value);
  } catch {}

  return toCanonicalPath(
    RuntimeAppCore?.state?.canonicalPath ||
      RuntimeAppCore?.state?.route ||
      fallback ||
      DEFAULT_ROUTE
  );
}

function routerPublicPath(fallback = DEFAULT_ROUTE) {
  try {
    const value = RuntimeRouter?.getCurrentPublicPath?.();
    if (value) return toPublicPath(value);
  } catch {}

  return toPublicPath(
    RuntimeAppCore?.state?.publicPath ||
      fallback ||
      DEFAULT_ROUTE
  );
}

function syncResolvedRouteState(ctx = {}) {
  const data = object(ctx);
  const protectedContext = object(data.protectedContext);

  const expectedCanonical = toCanonicalPath(
    protectedContext.canonicalPath ||
      data.canonicalPath ||
      DEFAULT_ROUTE
  );

  const expectedPublic = toPublicPath(
    protectedContext.publicPath ||
      data.publicPath ||
      expectedCanonical
  );

  const finalCanonical = protectedContext.config
    ? expectedCanonical
    : routerCanonicalPath(expectedCanonical);

  const finalPublic = protectedContext.config
    ? expectedPublic
    : routerPublicPath(expectedPublic);

  const canonicalPath = safeSetRoute(finalCanonical);
  const publicPath = safeSetPublicPath(finalPublic);

  bootState.lastResolvedCanonicalPath = canonicalPath;
  bootState.lastResolvedPublicPath = publicPath;

  safeSetState({
    initialRouteRendered: true,
    bootNavigationHandled: true,
  });

  return {
    canonicalPath,
    publicPath,
    protectedRouteKey: protectedContext.key || "",
  };
}

function markInitialRenderDone(value = true) {
  firstRenderDone = Boolean(value);

  safeSetState({
    initialRouteRendered: Boolean(value),
  });
}

/* =========================================================
   RENDER OPTIONS
========================================================= */

function renderOptions(ctx = {}, cycleId = 0) {
  const data = object(ctx);
  const protectedContext = object(data.protectedContext);
  const isProtectedTokenRoute = Boolean(protectedContext.config && protectedContext.hasToken);

  const base = {
    force: true,
    forceRender: true,
    initialRender: true,

    canonicalPath: data.canonicalPath,
    publicPath: data.publicPath,
    requestedPath: data.publicPath,

    source: SOURCE,
    reason: data.reason || "initial-render",
    cycleId,
  };

  if (isProtectedTokenRoute) {
    return {
      ...base,

      skipHistory: true,
      replaceState: false,

      preservePath: true,
      preserveUrl: true,
      preserveSearch: true,
      preserveHash: true,
      preservePublicPath: true,

      protectedInitialUrl: true,
      protectedRouteKey: protectedContext.key || "",
      protectedInitialPath: protectedContext.canonicalPath || "",
      protectedInitialPublicPath: protectedContext.publicPath || "",
      protectedInitialUrlValue: protectedContext.url || "",
    };
  }

  return {
    ...base,

    replaceState: true,
    preserveUrl: true,
    preservePublicPath: true,
  };
}

/* =========================================================
   ROUTER REGISTRY
========================================================= */

function exposeRouterToCore() {
  if (!RuntimeAppCore || !RuntimeRouter) return false;

  try {
    RuntimeAppCore.Router = RuntimeRouter;
    RuntimeAppCore.router = RuntimeRouter;
  } catch {}

  try {
    RuntimeAppCore?.modules?.register?.("Router", RuntimeRouter, {
      overwrite: true,
      replace: true,
      aliases: ["router"],
      source: SOURCE,
      emit: false,
      silent: true,
    });
  } catch {}

  try {
    RuntimeAppCore?.modules?.set?.("Router", RuntimeRouter);
    RuntimeAppCore?.modules?.set?.("router", RuntimeRouter);
  } catch {}

  try {
    RuntimeAppCore?.registry?.modules?.set?.("Router", RuntimeRouter);
    RuntimeAppCore?.registry?.modules?.set?.("router", RuntimeRouter);
  } catch {}

  return true;
}

/* =========================================================
   CONFIGURE / BIND
========================================================= */

export function configureRouter(deps = {}) {
  resolveDeps(deps);
  captureInitialBrowserUrl();

  if (configured) {
    exposeRouterToCore();
    return true;
  }

  exposeRouterToCore();

  try {
    if (isFn(RuntimeRouter?.configure)) {
      const result = RuntimeRouter.configure({
        AppCore: RuntimeAppCore,
        core: RuntimeAppCore,
        Auth: RuntimeAuth,
        auth: RuntimeAuth,
        source: SOURCE,
      });

      if (result === false) {
        configured = false;
        return false;
      }
    }

    configured = true;
    bootState.lastConfiguredAt = now();

    emit(EVENTS.configured, {
      configured: true,
      at: iso(bootState.lastConfiguredAt),
    });
  } catch (error) {
    configured = false;
    bootState.lastRenderError = normalizeError(error);

    errorLog("Error configurando Router:", error);

    return false;
  }

  exposeRouterToCore();

  return true;
}

export function bindRouter(deps = {}) {
  resolveDeps(deps);
  captureInitialBrowserUrl();

  if (!configured && configureRouter(deps) === false) {
    return false;
  }

  if (bound) return true;

  const protectedContext = resolveProtectedContext();

  try {
    if (isFn(RuntimeRouter?.bind)) {
      const result = RuntimeRouter.bind({
        AppCore: RuntimeAppCore,
        core: RuntimeAppCore,
        Auth: RuntimeAuth,
        auth: RuntimeAuth,
        initialRenderDone: Boolean(firstRenderDone),
        protectedInitialUrl: Boolean(protectedContext.config),
        protectedRouteKey: protectedContext.key || "",
        source: SOURCE,
      });

      if (result === false) {
        bound = false;
        return false;
      }
    }

    bound = true;
    bootState.lastBoundAt = now();

    emit(EVENTS.bound, {
      bound: true,
      initialRenderDone: Boolean(firstRenderDone),
      protectedInitialUrl: Boolean(protectedContext.config),
      protectedRouteKey: protectedContext.key || "",
      at: iso(bootState.lastBoundAt),
    });
  } catch (error) {
    bound = false;
    bootState.lastRenderError = normalizeError(error);

    errorLog("Error bind Router:", error);

    return false;
  }

  return true;
}

/* =========================================================
   INITIAL RENDER
========================================================= */

async function runInitialRender(ctx = {}, cycleId = 0) {
  const data = object(ctx);
  const targetPublicPath = toPublicPath(data.publicPath || DEFAULT_ROUTE);
  const targetCanonicalPath = toCanonicalPath(data.canonicalPath || targetPublicPath);
  const protectedContext = object(data.protectedContext);

  bootState.lastInitialPath = targetCanonicalPath;
  bootState.lastInitialPublicPath = targetPublicPath;
  bootState.lastProtectedRouteKey = protectedContext.key || "";

  emit(EVENTS.initialRenderStart, {
    canonicalPath: targetCanonicalPath,
    publicPath: redact(targetPublicPath),
    protectedRouteKey: protectedContext.key || "",
    cycleId,
  });

  if (!isFn(RuntimeRouter?.render)) {
    warn("Router.render no disponible. Se sincroniza estado mínimo.");

    const resolved = syncResolvedRouteState({
      canonicalPath: targetCanonicalPath,
      publicPath: targetPublicPath,
      protectedContext,
    });

    markInitialRenderDone(true);

    return {
      ok: false,
      rendered: false,
      resolved,
    };
  }

  const options = renderOptions(
    {
      canonicalPath: targetCanonicalPath,
      publicPath: targetPublicPath,
      protectedContext,
    },
    cycleId
  );

  const result = await RuntimeRouter.render(targetPublicPath, options);

  if (cycleId !== renderCycle) {
    return {
      ok: false,
      stale: true,
    };
  }

  const resolved = syncResolvedRouteState({
    canonicalPath: targetCanonicalPath,
    publicPath: targetPublicPath,
    protectedContext,
  });

  markInitialRenderDone(true);

  bootState.lastRenderedPath = resolved.canonicalPath;
  bootState.lastRenderedPublicPath = resolved.publicPath;
  bootState.lastRenderAt = now();
  bootState.lastRenderOk = true;
  bootState.lastRenderError = null;

  emit(EVENTS.initialRenderDone, {
    ok: true,
    canonicalPath: resolved.canonicalPath,
    publicPath: redact(resolved.publicPath),
    protectedRouteKey: protectedContext.key || "",
    cycleId,
    at: iso(bootState.lastRenderAt),
  });

  log("Render inicial completado.", {
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
  });

  return result || {
    ok: true,
    rendered: true,
    resolved,
  };
}

export async function renderInitialRoute(deps = {}) {
  resolveDeps(deps);
  captureInitialBrowserUrl();

  if (!configured && configureRouter(deps) === false) {
    return false;
  }

  if (firstRenderDone) {
    return true;
  }

  if (initialRenderPromise) {
    return initialRenderPromise;
  }

  const cycleId = ++renderCycle;

  initialRenderPromise = (async () => {
    const ctx = routeContext();

    try {
      const result = await runInitialRender(ctx, cycleId);
      return result !== false;
    } catch (error) {
      bootState.lastRenderOk = false;
      bootState.lastRenderError = normalizeError(error);

      emit(EVENTS.initialRenderError, {
        canonicalPath: ctx.canonicalPath,
        publicPath: redact(ctx.publicPath),
        protectedRouteKey: ctx.protectedContext?.key || "",
        error: bootState.lastRenderError,
        at: iso(),
      });

      warn("Fallo render inicial.", {
        canonicalPath: ctx.canonicalPath,
        publicPath: ctx.publicPath,
        error,
      });

      markInitialRenderDone(false);

      return false;
    } finally {
      initialRenderPromise = null;
    }
  })();

  return initialRenderPromise;
}

/* =========================================================
   RESET / SNAPSHOT
========================================================= */

export function resetRouterBootstrap(options = {}) {
  const opts = object(options);

  firstRenderDone = false;
  initialRenderPromise = null;
  renderCycle = 0;

  if (opts.resetConfigured) configured = false;
  if (opts.resetBound) bound = false;

  if (opts.clearInitialUrl && isBrowser()) {
    try {
      window[INITIAL_URL_KEY] = "";
    } catch {}

    for (const cfg of PROTECTED_ROUTES) {
      for (const key of array(cfg.windowKeys)) {
        try {
          window[key] = "";
        } catch {}
      }
    }
  }

  Object.assign(bootState, {
    lastInitialPath: "",
    lastInitialPublicPath: "",
    lastRenderedPath: "",
    lastRenderedPublicPath: "",
    lastResolvedCanonicalPath: "",
    lastResolvedPublicPath: "",
    lastProtectedRouteKey: "",
    lastRenderAt: 0,
    lastRenderOk: false,
    lastRenderError: null,
  });

  safeSetState({
    initialRouteRendered: false,
  });

  emit(EVENTS.reset, {
    resetConfigured: Boolean(opts.resetConfigured),
    resetBound: Boolean(opts.resetBound),
    clearInitialUrl: Boolean(opts.clearInitialUrl),
    at: iso(),
  });

  return true;
}

export function getRouterBootstrapState() {
  const protectedContext = resolveProtectedContext();
  const currentBrowserPath = browserPath();

  let routerSnapshot = null;

  try {
    routerSnapshot =
      RuntimeRouter?.getSnapshot?.() ||
      RuntimeRouter?.getDebugSnapshot?.() ||
      RuntimeRouter?.getState?.() ||
      null;
  } catch {}

  return sanitize({
    version: ROUTER_BOOTSTRAP_VERSION,

    configured: Boolean(configured),
    bound: Boolean(bound),
    firstRenderDone: Boolean(firstRenderDone),
    initialRenderInFlight: Boolean(initialRenderPromise),
    renderCycle: number(renderCycle, 0),

    route: RuntimeAppCore?.state?.route || DEFAULT_ROUTE,
    publicPath: RuntimeAppCore?.state?.publicPath || DEFAULT_ROUTE,

    initialUrl: globalInitialUrl(),
    bootContext: bootContext(),

    protectedInitialUrl: protectedContext.url || "",
    protectedInitialPath: protectedContext.canonicalPath || "",
    protectedInitialPublicPath: protectedContext.publicPath || "",
    protectedInitialRouteKey: protectedContext.key || "",
    hasProtectedInitialToken: Boolean(protectedContext.config && protectedContext.hasToken),

    currentBrowserPath,
    currentBrowserCanonicalPath: toCanonicalPath(currentBrowserPath),
    browserHref: browserHref(),

    lastInitialPath: bootState.lastInitialPath,
    lastInitialPublicPath: bootState.lastInitialPublicPath,

    lastRenderedPath: bootState.lastRenderedPath,
    lastRenderedPublicPath: bootState.lastRenderedPublicPath,

    lastResolvedCanonicalPath: bootState.lastResolvedCanonicalPath,
    lastResolvedPublicPath: bootState.lastResolvedPublicPath,

    lastProtectedRouteKey: bootState.lastProtectedRouteKey,

    lastRenderAt: bootState.lastRenderAt,
    lastRenderAtIso: bootState.lastRenderAt ? iso(bootState.lastRenderAt) : "",
    lastRenderOk: Boolean(bootState.lastRenderOk),
    lastRenderError: bootState.lastRenderError,

    initialUrlCapturedAt: bootState.initialUrlCapturedAt,
    initialUrlCapturedAtIso: bootState.initialUrlCapturedAt ? iso(bootState.initialUrlCapturedAt) : "",

    lastConfiguredAt: bootState.lastConfiguredAt,
    lastConfiguredAtIso: bootState.lastConfiguredAt ? iso(bootState.lastConfiguredAt) : "",

    lastBoundAt: bootState.lastBoundAt,
    lastBoundAtIso: bootState.lastBoundAt ? iso(bootState.lastBoundAt) : "",

    protectedRoutes: PROTECTED_ROUTES.map((cfg) => ({
      key: cfg.key,
      path: cfg.path,
      paths: [...cfg.paths],
      windowKeys: [...cfg.windowKeys],
    })),

    routerSnapshot,
  });
}

/* =========================================================
   DEBUG API
========================================================= */

function exposeDebugApi() {
  const api = {
    version: ROUTER_BOOTSTRAP_VERSION,

    configure: configureRouter,
    bind: bindRouter,
    renderInitial: renderInitialRoute,
    reset: resetRouterBootstrap,
    snapshot: getRouterBootstrapState,
    getSnapshot: getRouterBootstrapState,
  };

  try {
    if (isBrowser()) {
      window.__ONION_APP_ROUTER_BOOTSTRAP__ = api;
    }
  } catch {}

  try {
    if (RuntimeAppCore && typeof RuntimeAppCore === "object" && Object.isExtensible(RuntimeAppCore)) {
      Object.defineProperty(RuntimeAppCore, "RouterBootstrap", {
        value: api,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }
  } catch {}

  emit(EVENTS.debugReady, {
    at: iso(),
  });

  return api;
}

exposeDebugApi();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_BOOTSTRAP_VERSION,

  configureRouter,
  bindRouter,
  renderInitialRoute,

  resetRouterBootstrap,
  getRouterBootstrapState,
};
