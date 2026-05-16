/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: src/app/router.js

   Router bootstrap simple:
   - configura Router una vez
   - bindea Router una vez
   - render inicial serializado
   - preserva rutas técnicas con token
   - separa publicPath / canonicalPath
   - no decide auth ni rutas: delega en Router/Guards
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
  APP_ROUTES,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const ROUTER_BOOTSTRAP_VERSION = "16.0.0-clean";

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
    tokenParamNames: ["token", "activationToken", "activateToken", "code", "t"],
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
    tokenParamNames: ["token", "resetToken", "passwordResetToken", "confirmToken", "code", "t"],
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

const EVENTS = Object.freeze({
  configured: "app:router:configured",
  bound: "app:router:bound",
  initialUrlCaptured: "app:router:initial-url:captured",
  initialRenderStart: "app:router:initial-render:start",
  initialRenderDone: "app:router:initial-render:done",
  initialRenderError: "app:router:initial-render:error",
  initialRenderFallback: "app:router:initial-render:fallback",
  stateSynced: "app:router:state-synced",
  reset: "app:router:bootstrap:reset",
  debugReady: "app:router:debug:ready",
});

const PUBLIC_USERNAME_RE = /^@[A-Za-z0-9._-]{1,80}$/;
const SENSITIVE_KEY_RE = /token|secret|password|authorization|credential|jwt|bearer|otp|code|session|refresh/i;

const EMIT_DEDUPE_MS = 80;
const MAX_SANITIZE_DEPTH = 7;
const MAX_SANITIZE_ARRAY = 100;

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

let lastEmitSignature = "";
let lastEmitAt = 0;

const registryConflicts = new Set();

const bootState = {
  initialUrlCapturedAt: 0,
  lastInitialCaptureSignature: "",

  lastConfiguredAt: 0,
  lastBoundAt: 0,
  registryExposedAt: 0,

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
  const out = [];
  const seen = new Set();

  for (const value of array(values).flat(Infinity)) {
    const clean = text(value, "");

    if (!clean || seen.has(clean)) continue;

    seen.add(clean);
    out.push(clean);
  }

  return out;
}

function isExtensible(value) {
  try {
    return value && (typeof value === "object" || typeof value === "function") && Object.isExtensible(value);
  } catch {
    return false;
  }
}

function defineValue(target, key, value) {
  if (!target || !key || !isExtensible(target)) return false;

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

    applyPostRenderLoaderPolicy:
      input.applyPostRenderLoaderPolicy ||
      defaultApplyPostRenderLoaderPolicy,

    hideLoader: input.hideLoader,
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

function isUsernameScoped(path = "/") {
  const first = splitPath(normalizePath(path)).pathname.split("/").filter(Boolean)[0] || "";
  return isUsernameSegment(first);
}

/* =========================================================
   PROTECTED TOKEN ROUTES
========================================================= */

function normalizeProtectedRouteConfigs(configs = []) {
  return Object.freeze(
    array(configs)
      .map((rawConfig) => {
        const cfg = object(rawConfig);

        const paths = unique([
          ...array(cfg.paths),
          ...array(cfg.aliases),
          cfg.path,
          cfg.route,
          cfg.canonicalPath,
        ])
          .map(normalizePathname)
          .filter((path) => path && path !== "/");

        const key = text(
          cfg.key ||
            cfg.name ||
            paths[0]?.replace(/^\/+/, "").replace(/[/-]/g, "_"),
          ""
        );

        let finalPaths = paths;

        if (key === "activation") {
          finalPaths = unique([...finalPaths, ...ACTIVATION_PATHS]);
        }

        if (key === "resetConfirm") {
          finalPaths = unique([...finalPaths, ...RESET_CONFIRM_PATHS]);
        }

        if (!finalPaths.length) return null;

        const path = normalizePathname(
          cfg.path ||
            cfg.canonicalPath ||
            (
              key === "activation"
                ? "/activate-account"
                : key === "resetConfirm"
                  ? "/reset-password/confirm"
                  : finalPaths[0]
            )
        );

        const windowKeys = unique([
          ...array(cfg.windowKeys),
          cfg.windowKey,
          cfg.initialWindowKey,
          cfg.runtimeKey,
          ...(key === "activation" ? ["__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__"] : []),
          ...(key === "resetConfirm"
            ? [
                "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
                "__ONION_RESET_CONFIRM_INITIAL_URL__",
              ]
            : []),
        ]);

        const tokenParamNames = unique([
          ...array(cfg.tokenParamNames),
          ...(key === "activation" ? ["token", "activationToken", "activateToken", "code", "t"] : []),
          ...(key === "resetConfirm" ? ["token", "resetToken", "passwordResetToken", "confirmToken", "code", "t"] : []),
        ]);

        const scrubbedHistoryFlags = unique([
          ...array(cfg.scrubbedHistoryFlags),
          ...array(cfg.scrubbedHistoryKeys),
          ...array(cfg.scrubbedStateKeys),
          cfg.scrubbedHistoryFlag,
          ...(key === "activation"
            ? [
                "scrubbedActivationToken",
                "activationTokenScrubbed",
                "scrubbedActivateAccountToken",
                "scrubbedPublicTokenRoute",
                "scrubbedTokenRoute",
              ]
            : []),
          ...(key === "resetConfirm"
            ? [
                "scrubbedResetToken",
                "resetTokenScrubbed",
                "scrubbedResetConfirmToken",
                "scrubbedPasswordResetToken",
                "scrubbedResetPasswordToken",
                "scrubbedPublicTokenRoute",
                "scrubbedTokenRoute",
              ]
            : []),
        ]);

        return Object.freeze({
          ...cfg,
          key,
          path,
          paths: Object.freeze(unique([path, ...finalPaths])),
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
  if (depth > MAX_SANITIZE_DEPTH) return "[MaxDepth]";

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
    return value.slice(0, MAX_SANITIZE_ARRAY).map((item) => sanitize(item, depth + 1));
  }

  if (isObject(value)) {
    const out = {};

    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = item ? "***" : item;
        continue;
      }

      out[key] = sanitize(item, depth + 1);
    }

    return out;
  }

  return String(value);
}

/* =========================================================
   LOG / EMIT
========================================================= */

function log(...args) {
  const safeArgs = args.map((item) => sanitize(item));

  try {
    RuntimeAppCore?.utils?.log?.("[AppRouter]", ...safeArgs);
    return;
  } catch {}

  try {
    if (RuntimeAppCore?.config?.debug) console.log("[AppRouter]", ...safeArgs);
  } catch {}
}

function warn(...args) {
  const safeArgs = args.map((item) => sanitize(item));

  try {
    RuntimeAppCore?.utils?.warn?.("[AppRouter]", ...safeArgs);
    return;
  } catch {}

  try {
    console.warn("[AppRouter]", ...safeArgs);
  } catch {}
}

function errorLog(...args) {
  const safeArgs = args.map((item) => sanitize(item));

  try {
    RuntimeAppCore?.utils?.error?.("[AppRouter]", ...safeArgs);
    return;
  } catch {}

  try {
    console.error("[AppRouter]", ...safeArgs);
  } catch {}
}

function shouldDedupe(eventName = "", payload = {}, force = false) {
  if (force) return false;

  const signature = [
    text(eventName, ""),
    text(payload?.protectedRouteKey, ""),
    text(payload?.target || payload?.path || "", ""),
    text(payload?.publicPath || "", ""),
    payload?.ok === false ? "fail" : "ok",
  ].join("|");

  const stamp = now();

  if (signature === lastEmitSignature && stamp - lastEmitAt < EMIT_DEDUPE_MS) {
    return true;
  }

  lastEmitSignature = signature;
  lastEmitAt = stamp;

  return false;
}

function emit(eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");

  if (!name) return false;

  const opts = object(options);

  if (opts.dedupe !== false && shouldDedupe(name, payload, opts.force === true)) {
    return false;
  }

  const detail = sanitize({
    version: ROUTER_BOOTSTRAP_VERSION,
    source: SOURCE,
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

  if ((opts.window === true || !hasBus) && isBrowser()) {
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
  if (!isBrowser() || !key) return false;

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

function storedInitialUrl(cfg) {
  for (const key of array(cfg?.windowKeys?.length ? cfg.windowKeys : [cfg?.windowKey])) {
    const value = windowValue(key);
    if (value) return value;
  }

  return "";
}

function setStoredInitialUrl(cfg, value = "") {
  let ok = false;

  for (const key of array(cfg?.windowKeys?.length ? cfg.windowKeys : [cfg?.windowKey])) {
    ok = setWindowValue(key, value, true) || ok;
  }

  return ok;
}

function setCoreInitialUrl(href = "") {
  const clean = text(href, "");

  if (!clean) return false;

  const payload = {
    bootInitialUrl: clean,
    bootInitialPath: pathFromUrlLike(clean),
  };

  try {
    RuntimeAppCore?.setState?.(payload, {
      source: `${SOURCE}:initial-url`,
      emit: false,
      emitState: false,
      silent: true,
    });
  } catch {}

  try {
    if (RuntimeAppCore?.state && typeof RuntimeAppCore.state === "object") {
      Object.assign(RuntimeAppCore.state, payload);
    }
  } catch {}

  return true;
}

function captureInitialBrowserUrl() {
  if (!isBrowser()) return false;

  try {
    const href = browserHref();

    if (!href) return false;

    setGlobalInitialUrl(href);
    setCoreInitialUrl(href);

    let protectedCaptured = false;
    let protectedRouteKey = "";

    for (const cfg of PROTECTED_ROUTES) {
      if (routeScrubbed(cfg)) continue;

      if (routeMatches(cfg, href) && hasProtectedToken(cfg, href) && !storedInitialUrl(cfg)) {
        setStoredInitialUrl(cfg, href);
        protectedCaptured = true;
        protectedRouteKey = cfg.key || "";
      }
    }

    const signature = `${href}|${protectedCaptured ? "protected" : "normal"}|${protectedRouteKey}`;

    bootState.initialUrlCapturedAt = now();

    if (signature !== bootState.lastInitialCaptureSignature) {
      bootState.lastInitialCaptureSignature = signature;

      emit(EVENTS.initialUrlCaptured, {
        href: redact(href),
        protectedCaptured,
        protectedRouteKey,
        at: iso(bootState.initialUrlCapturedAt),
      });
    }

    return true;
  } catch {
    return false;
  }
}

function protectedStoredUrls() {
  return PROTECTED_ROUTES
    .filter((cfg) => !routeScrubbed(cfg))
    .map((cfg) => storedInitialUrl(cfg))
    .filter(Boolean);
}

function stateInitialCandidates() {
  const state = object(RuntimeAppCore?.state);
  const boot = bootContext();

  return [
    state.bootProtectedInitialUrl,
    state.bootActivationInitialUrl,
    state.bootResetConfirmInitialUrl,
    state.bootResetPasswordConfirmInitialUrl,
    boot.protectedInitialUrl,
    boot.activationInitialUrl,
    boot.resetConfirmInitialUrl,
    boot.initialUrl,
  ]
    .map((value) => text(value, ""))
    .filter(Boolean);
}

function resolveProtectedInitialContext(value = "") {
  captureInitialBrowserUrl();

  const candidates = [
    value,
    ...protectedStoredUrls(),
    ...stateInitialCandidates(),
    globalInitialUrl(),
    browserHref(),
    browserPath(),
  ]
    .map((item) => text(item, ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    const cfg = protectedRouteConfig(candidate);

    if (!cfg) continue;
    if (routeScrubbed(cfg)) continue;
    if (!hasProtectedToken(cfg, candidate)) continue;

    const publicPath = pathFromUrlLike(candidate);
    const canonicalPath = toCanonicalPath(publicPath);

    return {
      config: cfg,
      key: cfg.key || "",
      url: candidate,
      path: canonicalPath,
      canonicalPath,
      publicPath: normalizePath(publicPath),
      hasToken: true,
      redactedUrl: redact(candidate),
      redactedPath: redact(canonicalPath),
      redactedPublicPath: redact(publicPath),
    };
  }

  return {
    config: null,
    key: "",
    url: "",
    path: "",
    canonicalPath: "",
    publicPath: "",
    hasToken: false,
    redactedUrl: "",
    redactedPath: "",
    redactedPublicPath: "",
  };
}

function exposeProtectedContext(context = {}) {
  const data = object(context);

  const payload = {
    bootProtectedInitialUrl: data.url || "",
    bootProtectedInitialPath: data.path || "",
    bootProtectedInitialPublicPath: data.publicPath || "",

    bootIsPublicTokenRoute: Boolean(data.config),
    bootHasPublicToken: Boolean(data.hasToken),
    bootHasProtectedToken: Boolean(data.hasToken),
    bootProtectedRouteKey: data.key || "",
  };

  if (data.key === "activation") {
    Object.assign(payload, {
      bootActivationInitialUrl: data.url || "",
      bootActivationInitialPath: data.path || "",
      bootActivationInitialPublicPath: data.publicPath || "",
      bootIsActivation: Boolean(data.config),
      bootHasActivationToken: Boolean(data.hasToken),
    });
  }

  if (data.key === "resetConfirm") {
    Object.assign(payload, {
      bootResetConfirmInitialUrl: data.url || "",
      bootResetPasswordConfirmInitialUrl: data.url || "",
      bootResetConfirmInitialPath: data.path || "",
      bootResetPasswordConfirmInitialPath: data.path || "",
      bootResetConfirmInitialPublicPath: data.publicPath || "",
      bootResetPasswordConfirmInitialPublicPath: data.publicPath || "",
      bootIsResetConfirm: Boolean(data.config),
      bootHasResetToken: Boolean(data.hasToken),
    });
  }

  safeSetState(payload);

  patchBootContext({
    protectedInitialUrl: data.url || "",
    protectedInitialPath: data.path || "",
    protectedInitialPublicPath: data.publicPath || "",
    isPublicTokenRoute: Boolean(data.config),
    hasPublicToken: Boolean(data.hasToken),
    protectedRouteKey: data.key || "",

    ...(data.key === "activation"
      ? {
          activationInitialUrl: data.url || "",
          activationInitialPath: data.path || "",
          activationInitialPublicPath: data.publicPath || "",
          isActivation: Boolean(data.config),
          hasActivationToken: Boolean(data.hasToken),
        }
      : {}),

    ...(data.key === "resetConfirm"
      ? {
          resetConfirmInitialUrl: data.url || "",
          resetConfirmInitialPath: data.path || "",
          resetConfirmInitialPublicPath: data.publicPath || "",
          isResetConfirm: Boolean(data.config),
          hasResetToken: Boolean(data.hasToken),
        }
      : {}),
  });

  return payload;
}

captureInitialBrowserUrl();

/* =========================================================
   ROUTE CONTEXT
========================================================= */

function callPathHelper(fn) {
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

function createRouteContext(input = "") {
  const sourcePath = normalizePath(
    input ||
      browserPath() ||
      callPathHelper(getCurrentPublicPath) ||
      callPathHelper(getCurrentPath) ||
      DEFAULT_ROUTE
  );

  const publicPath = toPublicPath(sourcePath);
  const canonicalPath = toCanonicalPath(publicPath);

  return {
    input: sourcePath,
    publicPath,
    canonicalPath,
    cleanPublicPath: getCleanPath(publicPath),
    cleanCanonicalPath: getCleanPath(canonicalPath),
    usernameScoped: isUsernameScoped(publicPath),
    browserPath: browserPath(),
    browserHref: browserHref(),
    source: SOURCE,
  };
}

function safeInitialRouteContext() {
  const protectedContext = resolveProtectedInitialContext();

  if (protectedContext.config && protectedContext.path) {
    exposeProtectedContext(protectedContext);
    return createRouteContext(protectedContext.publicPath || protectedContext.path);
  }

  return createRouteContext(browserPath());
}

/* =========================================================
   STATE SYNC
========================================================= */

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
    RuntimeAppCore?.patchState?.(patch, {
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

function routerCanonicalPath() {
  const fromRouter = (() => {
    try {
      return RuntimeRouter?.getCurrentCanonicalPath?.();
    } catch {
      return "";
    }
  })();

  return toCanonicalPath(
    fromRouter ||
      callPathHelper(getCurrentCanonicalPath) ||
      RuntimeAppCore?.state?.canonicalPath ||
      RuntimeAppCore?.state?.route ||
      ""
  );
}

function routerPublicPath() {
  const fromRouter = (() => {
    try {
      return RuntimeRouter?.getCurrentPublicPath?.();
    } catch {
      return "";
    }
  })();

  return toPublicPath(
    fromRouter ||
      callPathHelper(getCurrentPublicPath) ||
      RuntimeAppCore?.state?.publicPath ||
      ""
  );
}

function trustRouterCanonical(routerPath = "", expectedPath = "", protectedRoute = false) {
  const routerClean = getCleanPath(routerPath);
  const expectedClean = getCleanPath(expectedPath);

  if (!routerClean) return false;

  if (protectedRoute) {
    return routerClean === expectedClean;
  }

  if (routerClean === expectedClean) return true;
  if (routerClean === LOGIN_ROUTE && expectedClean !== LOGIN_ROUTE) return true;
  if (routerClean !== DEFAULT_ROUTE && routerClean !== "/") return true;

  return expectedClean === DEFAULT_ROUTE || expectedClean === "/";
}

function syncResolvedRouteState(fallbackPath = DEFAULT_ROUTE, meta = {}) {
  const safeMeta = object(meta);

  const routeContext = safeMeta.routeContext || createRouteContext(fallbackPath);

  const protectedContext = safeMeta.protectedContext?.config
    ? safeMeta.protectedContext
    : resolveProtectedInitialContext(routeContext.publicPath || fallbackPath);

  const expectedCanonical = toCanonicalPath(
    protectedContext.path ||
      routeContext.canonicalPath ||
      fallbackPath ||
      DEFAULT_ROUTE
  );

  const expectedPublic = toPublicPath(
    protectedContext.publicPath ||
      routeContext.publicPath ||
      expectedCanonical
  );

  const currentRouterCanonical = routerCanonicalPath();
  const currentRouterPublic = routerPublicPath();

  let finalCanonical = trustRouterCanonical(
    currentRouterCanonical,
    expectedCanonical,
    Boolean(protectedContext.config)
  )
    ? currentRouterCanonical
    : expectedCanonical;

  if (protectedContext.config) {
    finalCanonical = expectedCanonical;
  }

  let finalPublic = expectedPublic;

  if (!protectedContext.config) {
    if (
      currentRouterPublic &&
      (
        getCleanPath(currentRouterPublic) !== DEFAULT_ROUTE ||
        finalCanonical === DEFAULT_ROUTE
      )
    ) {
      finalPublic = currentRouterPublic;
    }

    if (
      routeContext.usernameScoped &&
      toCanonicalPath(expectedPublic) === finalCanonical
    ) {
      finalPublic = expectedPublic;
    }
  }

  if (protectedContext.config) {
    finalPublic = protectedContext.publicPath || expectedPublic;
  }

  const canonicalPath = safeSetRoute(finalCanonical);
  const publicPath = safeSetPublicPath(finalPublic);

  const payload = {
    canonicalPath,
    publicPath,
    protectedRouteKey: protectedContext.key || "",
    protectedInitialUrl: protectedContext.url || "",
    protectedInitialPath: protectedContext.path || "",
    protectedInitialPublicPath: protectedContext.publicPath || "",
    usernameScoped: Boolean(routeContext.usernameScoped),
  };

  bootState.lastResolvedCanonicalPath = canonicalPath;
  bootState.lastResolvedPublicPath = publicPath;

  emit(EVENTS.stateSynced, payload);

  return payload;
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

function renderOptions(path = DEFAULT_ROUTE, meta = {}) {
  const safeMeta = object(meta);

  const routeContext = safeMeta.routeContext || createRouteContext(path);

  const protectedContext = safeMeta.protectedContext?.config
    ? safeMeta.protectedContext
    : resolveProtectedInitialContext(routeContext.publicPath || path);

  const canonicalPath = toCanonicalPath(
    protectedContext.path ||
      routeContext.canonicalPath ||
      path ||
      DEFAULT_ROUTE
  );

  const publicPath = toPublicPath(
    protectedContext.publicPath ||
      routeContext.publicPath ||
      canonicalPath
  );

  const base = {
    force: true,
    forceRender: true,
    initialRender: true,

    canonicalPath,
    publicPath,
    requestedPath: publicPath,

    browserPath: routeContext.browserPath || "",
    usernameScoped: Boolean(routeContext.usernameScoped),

    source: SOURCE,
  };

  if (protectedContext.config && protectedContext.hasToken) {
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
      protectedInitialPath: protectedContext.path || "",
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

function getRegisteredModule(name = "") {
  const clean = text(name, "");

  if (!clean || !RuntimeAppCore) return null;

  try {
    const value = RuntimeAppCore?.modules?.get?.(clean);
    if (value) return value;
  } catch {}

  try {
    const value = RuntimeAppCore?.registry?.modules?.get?.(clean);
    if (value) return value;
  } catch {}

  try {
    if (RuntimeAppCore?.[clean]) return RuntimeAppCore[clean];
  } catch {}

  return null;
}

function conflict(name = "") {
  const clean = text(name, "");

  if (!clean || registryConflicts.has(clean)) return;

  registryConflicts.add(clean);

  warn("Router registry conflict. Se conserva instancia existente.", {
    name: clean,
  });
}

function exposeRouterAlias(alias = "") {
  const clean = text(alias, "");

  if (!RuntimeAppCore || !RuntimeRouter || !clean) return false;

  const current = getRegisteredModule(clean);

  if (current && current !== RuntimeRouter) {
    conflict(clean);
    return false;
  }

  let ok = false;

  try {
    RuntimeAppCore[clean] = RuntimeRouter;
    ok = true;
  } catch {}

  try {
    ok = defineValue(RuntimeAppCore, clean, RuntimeRouter) || ok;
  } catch {}

  try {
    if (isFn(RuntimeAppCore?.modules?.register)) {
      RuntimeAppCore.modules.register(clean, RuntimeRouter, {
        overwrite: true,
        replace: true,
        emit: false,
        silent: true,
        source: SOURCE,
      });

      ok = true;
    }
  } catch {}

  try {
    if (isFn(RuntimeAppCore?.modules?.set)) {
      RuntimeAppCore.modules.set(clean, RuntimeRouter, {
        overwrite: true,
        replace: true,
        emit: false,
        silent: true,
        source: SOURCE,
      });

      ok = true;
    }
  } catch {}

  try {
    RuntimeAppCore?.registry?.modules?.set?.(clean, RuntimeRouter);
    ok = true;
  } catch {}

  return ok;
}

function exposeRouterToCore() {
  if (!RuntimeAppCore || !RuntimeRouter) return false;

  exposeRouterAlias("Router");
  exposeRouterAlias("router");

  bootState.registryExposedAt = now();

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
      let result;

      try {
        result = RuntimeRouter.configure({
          AppCore: RuntimeAppCore,
          core: RuntimeAppCore,
          Auth: RuntimeAuth,
          auth: RuntimeAuth,
          source: SOURCE,
        });
      } catch {
        result = RuntimeRouter.configure(RuntimeAppCore, RuntimeAuth);
      }

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

    log("Router configurado.");
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

  const protectedContext = resolveProtectedInitialContext();

  const context = {
    AppCore: RuntimeAppCore,
    core: RuntimeAppCore,

    Auth: RuntimeAuth,
    auth: RuntimeAuth,

    initialRenderDone: Boolean(firstRenderDone),

    protectedInitialUrl: Boolean(protectedContext.config),
    protectedRouteKey: protectedContext.key || "",
    protectedInitialPath: protectedContext.path || "",
    protectedInitialPublicPath: protectedContext.publicPath || "",

    preserveInitialUrl: Boolean(protectedContext.config),

    source: SOURCE,
  };

  try {
    if (isFn(RuntimeRouter?.bind)) {
      let result;

      try {
        result = RuntimeRouter.bind(context);
      } catch {
        result = RuntimeRouter.bind();
      }

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

    log("Router listeners activos.", {
      initialRenderDone: Boolean(firstRenderDone),
      protectedInitialUrl: Boolean(protectedContext.config),
      protectedRouteKey: protectedContext.key || "",
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

async function runInitialRender(path = DEFAULT_ROUTE, cycleId = 0, meta = {}, deps = {}) {
  const runtime = resolveDeps(deps);
  const safeMeta = object(meta);

  const routeContext = safeMeta.routeContext || createRouteContext(path);

  const protectedContext = safeMeta.protectedContext?.config
    ? safeMeta.protectedContext
    : resolveProtectedInitialContext(routeContext.publicPath || path);

  const target = toCanonicalPath(
    protectedContext.path ||
      routeContext.canonicalPath ||
      path ||
      DEFAULT_ROUTE
  );

  const publicPath = toPublicPath(
    protectedContext.publicPath ||
      routeContext.publicPath ||
      target
  );

  const options = renderOptions(target, {
    routeContext: {
      ...routeContext,
      canonicalPath: target,
      publicPath,
    },
    protectedContext,
  });

  bootState.lastInitialPath = target;
  bootState.lastInitialPublicPath = publicPath;
  bootState.lastProtectedRouteKey = protectedContext.key || "";

  emit(EVENTS.initialRenderStart, {
    target,
    publicPath,
    canonicalPath: target,
    options: sanitize(options),
    cycleId,
    protectedRouteKey: protectedContext.key || "",
    usernameScoped: Boolean(routeContext.usernameScoped),
    at: iso(),
  });

  if (!isFn(RuntimeRouter?.render)) {
    warn("Router.render no disponible. Se sincroniza estado mínimo.");

    syncResolvedRouteState(target, {
      routeContext: {
        ...routeContext,
        canonicalPath: target,
        publicPath,
      },
      protectedContext,
    });

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
    Router.render recibe canonicalPath como primer argumento.
    publicPath/requestedPath van en options.
  */
  await Promise.resolve(
    RuntimeRouter.render(target, options)
  );

  if (cycleId !== renderCycle) {
    warn("Render inicial stale omitido.", {
      cycleId,
      activeCycle: renderCycle,
    });

    return false;
  }

  const resolved = syncResolvedRouteState(target, {
    routeContext: {
      ...routeContext,
      canonicalPath: target,
      publicPath,
    },
    protectedContext,
  });

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
    warn("applyPostRenderLoaderPolicy() falló.", error);
  }

  markInitialRenderDone(true);

  bootState.lastRenderedPath = target;
  bootState.lastRenderedPublicPath = publicPath;
  bootState.lastRenderAt = now();
  bootState.lastRenderOk = true;
  bootState.lastRenderError = null;

  emit(EVENTS.initialRenderDone, {
    ok: true,
    target,
    publicPath,
    canonicalPath: target,
    resolved,
    cycleId,
    protectedRouteKey: protectedContext.key || "",
    usernameScoped: Boolean(routeContext.usernameScoped),
    at: iso(bootState.lastRenderAt),
  });

  log("Render inicial completado.", {
    target,
    publicPath,
    resolved,
  });

  return true;
}

export async function renderInitialRoute(deps = {}) {
  /*
    No hace bindRouter().
    El orden lo manda src/app/index.js.
  */

  resolveDeps(deps);
  captureInitialBrowserUrl();

  if (!configured && configureRouter(deps) === false) {
    return false;
  }

  if (firstRenderDone) {
    log("renderInitialRoute omitido: primer render ya completado.", {
      route: RuntimeAppCore?.state?.route || DEFAULT_ROUTE,
      publicPath: RuntimeAppCore?.state?.publicPath || DEFAULT_ROUTE,
    });

    return true;
  }

  if (initialRenderPromise) {
    return initialRenderPromise;
  }

  const cycleId = ++renderCycle;

  initialRenderPromise = (async () => {
    const routeContext = safeInitialRouteContext();

    const path = toCanonicalPath(routeContext.canonicalPath || DEFAULT_ROUTE);
    const publicPath = toPublicPath(routeContext.publicPath || browserPath() || path);

    const protectedContext = resolveProtectedInitialContext(publicPath || path);

    const finalRouteContext = {
      ...createRouteContext(publicPath),
      ...routeContext,

      publicPath,
      canonicalPath: path,

      cleanPublicPath: getCleanPath(publicPath),
      cleanCanonicalPath: getCleanPath(path),

      usernameScoped: isUsernameScoped(publicPath),
    };

    try {
      log("Render inicial:", {
        path,
        publicPath,
        canonicalPath: path,
        protectedInitialUrl: Boolean(protectedContext.config),
        protectedRouteKey: protectedContext.key || "",
        initialUrl: globalInitialUrl(),
        protectedInitialPath: protectedContext.path || "",
        protectedInitialPublicPath: protectedContext.publicPath || "",
        usernameScoped: Boolean(finalRouteContext.usernameScoped),
      });

      if (
        finalRouteContext.usernameScoped &&
        getCleanPath(path) === DEFAULT_ROUTE &&
        getCleanPath(publicPath) !== DEFAULT_ROUTE
      ) {
        warn("Ruta pública con @usuario habría caído a HOME. Se bloquea fallback incorrecto.", {
          publicPath,
          canonicalPath: path,
        });
      }

      return Boolean(
        await runInitialRender(
          path,
          cycleId,
          {
            routeContext: finalRouteContext,
            protectedContext,
          },
          deps
        )
      );
    } catch (error) {
      bootState.lastRenderOk = false;
      bootState.lastRenderError = normalizeError(error);

      emit(EVENTS.initialRenderError, {
        path,
        publicPath,
        canonicalPath: path,
        protectedInitialUrl: Boolean(protectedContext.config),
        protectedRouteKey: protectedContext.key || "",
        error: bootState.lastRenderError,
        at: iso(),
      });

      warn("Fallo render inicial.", {
        path,
        publicPath,
        protectedInitialUrl: Boolean(protectedContext.config),
        protectedRouteKey: protectedContext.key || "",
        error,
      });

      try {
        const fallback = protectedContext.config?.path
          ? protectedContext.publicPath || protectedContext.path || publicPath || path
          : DEFAULT_ROUTE || LOGIN_ROUTE;

        const fallbackContext = protectedContext.config?.path
          ? createRouteContext(protectedContext.publicPath || protectedContext.path || fallback)
          : createRouteContext(fallback);

        emit(EVENTS.initialRenderFallback, {
          from: path,
          fromPublicPath: publicPath,
          to: fallback,
          protectedInitialUrl: Boolean(protectedContext.config),
          protectedRouteKey: protectedContext.key || "",
          at: iso(),
        });

        return Boolean(
          await runInitialRender(
            toCanonicalPath(fallback),
            cycleId,
            {
              routeContext: fallbackContext,
              protectedContext,
              fallbackFor: path,
            },
            deps
          )
        );
      } catch (fatal) {
        bootState.lastRenderOk = false;
        bootState.lastRenderError = normalizeError(fatal);

        errorLog("Render inicial fatal:", fatal);

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

  emit(
    EVENTS.reset,
    {
      resetConfigured: Boolean(opts.resetConfigured),
      resetBound: Boolean(opts.resetBound),
      clearInitialUrl: Boolean(opts.clearInitialUrl),
      at: iso(),
    },
    {
      force: true,
    }
  );

  return true;
}

export function getRouterBootstrapState() {
  const protectedContext = resolveProtectedInitialContext();

  let routerSnapshot = null;

  try {
    routerSnapshot =
      RuntimeRouter?.getSnapshot?.() ||
      RuntimeRouter?.getDebugSnapshot?.() ||
      RuntimeRouter?.getState?.() ||
      null;
  } catch {}

  const currentBrowserPath = browserPath();

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
    protectedInitialPath: protectedContext.path || "",
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

    registryExposedAt: bootState.registryExposedAt,
    registryExposedAtIso: bootState.registryExposedAt ? iso(bootState.registryExposedAt) : "",

    registryConflicts: Array.from(registryConflicts),

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
