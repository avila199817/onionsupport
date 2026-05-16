/* =========================================================
   Onion SPA - App Session Bootstrap
   Archivo: src/app/session.js

   Session bootstrap simple:
   - restore de Auth durante boot
   - no rompe rutas públicas técnicas con token
   - no navega si está en activation/reset/2FA/OTP/MFA
   - bloquea auth fantasma
   - sincroniza UI una vez al final
   - delega navegación en Router
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

import {
  APP_RUNTIME_KEYS,
  APP_ROUTES,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const SESSION_VERSION = "17.0.0-clean";

const SOURCE = "AppSession";

const HOME_PATH = APP_ROUTES?.home || "/";
const LOGIN_PATH = APP_ROUTES?.login || "/login";

const ACTIVATE_PATH = APP_ROUTES?.activateAccount || "/activate-account";
const RESET_PATH = APP_ROUTES?.resetPassword || "/reset-password";
const RESET_CONFIRM_PATH = APP_ROUTES?.resetPasswordConfirm || "/reset-password/confirm";

const FORGOT_PATH = APP_ROUTES?.forgotPassword || "/forgot-password";
const RECOVER_PATH = APP_ROUTES?.recoverPassword || "/recover-password";
const PASSWORD_RESET_PATH = APP_ROUTES?.passwordReset || "/password-reset";

const WINDOW_KEYS = Object.freeze({
  initialUrl: APP_RUNTIME_KEYS?.initialUrl || "__ONION_INITIAL_URL__",
  bootContext: APP_RUNTIME_KEYS?.bootContext || "__ONION_BOOT_CONTEXT__",
  mainBootContext: APP_RUNTIME_KEYS?.mainBootContext || "__ONION_MAIN_BOOT_CONTEXT__",

  activationInitialUrl:
    APP_RUNTIME_KEYS?.activateAccountInitialUrl ||
    "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",

  resetPasswordConfirmInitialUrl:
    APP_RUNTIME_KEYS?.resetPasswordConfirmInitialUrl ||
    "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",

  resetConfirmInitialUrl:
    APP_RUNTIME_KEYS?.resetConfirmInitialUrl ||
    "__ONION_RESET_CONFIRM_INITIAL_URL__",

  passwordResetConfirmInitialUrl:
    APP_RUNTIME_KEYS?.passwordResetConfirmInitialUrl ||
    "__ONION_PASSWORD_RESET_CONFIRM_INITIAL_URL__",

  snapshot:
    APP_RUNTIME_KEYS?.sessionSnapshot ||
    "__ONION_SESSION_BOOTSTRAP_SNAPSHOT__",
});

const ACTIVATION_ALIASES = Object.freeze([
  ACTIVATE_PATH,
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
]);

const RESET_CONFIRM_ALIASES = Object.freeze([
  RESET_CONFIRM_PATH,
  "/reset-password-confirm",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
]);

const PUBLIC_TECHNICAL_PATHS = Object.freeze([
  ...ACTIVATION_ALIASES,

  RESET_PATH,
  RESET_CONFIRM_PATH,
  "/reset-password-confirm",

  FORGOT_PATH,
  RECOVER_PATH,

  PASSWORD_RESET_PATH,
  "/password-reset/request",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",

  "/2fa",
  "/otp",
  "/mfa",
]);

const PUBLIC_TECHNICAL_PREFIXES = Object.freeze([
  `${ACTIVATE_PATH}/`,
  "/activate/",
  "/activation/",
  "/account/activate/",
  "/activate/first-user/",

  `${RESET_CONFIRM_PATH}/`,
  "/reset-password-confirm/",
  "/password-reset/confirm/",
  "/password-reset-confirm/",
  "/confirm-reset-password/",

  "/2fa/",
  "/otp/",
  "/mfa/",
]);

const TOKEN_ROUTES_FALLBACK = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATE_PATH,
    paths: ACTIVATION_ALIASES,
    windowKeys: [WINDOW_KEYS.activationInitialUrl],
    tokenParamNames: [
      "token",
      "activationToken",
      "activateToken",
      "activation_token",
      "activate_token",
      "code",
      "t",
    ],
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
    path: RESET_CONFIRM_PATH,
    paths: RESET_CONFIRM_ALIASES,
    windowKeys: [
      WINDOW_KEYS.resetPasswordConfirmInitialUrl,
      WINDOW_KEYS.resetConfirmInitialUrl,
      WINDOW_KEYS.passwordResetConfirmInitialUrl,
    ],
    tokenParamNames: [
      "token",
      "resetToken",
      "reset_token",
      "passwordResetToken",
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
  "auth",
  "jwt",
  "session",
  "sid",
]);

const EVENTS = Object.freeze({
  restoreStart: "app:session:restore:start",
  restoreDone: "app:session:restore:done",
  restoreError: "app:session:restore:error",
  restoreStep: "app:session:restore:step",

  authRestored: "auth:session:restored",
  appRestored: "app:session:restored",
  userChange: "app:user:change",

  uiRepairRequest: "app:ui:repair-request",
  authNavigation: "app:auth:navigation",
  authScreenCleared: "app:shell:auth-screen-cleared",
  ghostAuthBlocked: "app:auth:ghost-blocked",
});

const USER_ID_KEYS = Object.freeze([
  "id",
  "userId",
  "user_id",
  "_id",
  "uid",
  "sub",
  "username",
  "userName",
  "user_name",
  "email",
  "mail",
  "phone",
  "telefono",
  "mobile",
]);

const TOKEN_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "jwt",
  "bearer",
  "idToken",
  "id_token",
]);

const REFRESH_KEYS = Object.freeze([
  "refreshToken",
  "refresh_token",
]);

const BAD_TOKEN_VALUES = Object.freeze([
  "",
  "null",
  "undefined",
  "false",
  "true",
  "nan",
  "none",
  "[object object]",
  "{}",
  "[]",
]);

const READY_DEDUPE_MS = 160;
const STEP_WARN_MS = 2500;

const MAX_SANITIZE_DEPTH = 7;
const MAX_SANITIZE_ARRAY = 100;
const MAX_SANITIZE_KEYS = 140;

const SENSITIVE_KEY_RE =
  /token|secret|password|authorization|credential|jwt|bearer|otp|code|session|refresh/i;

/* =========================================================
   RUNTIME
========================================================= */

let restorePromise = null;
let lastReadyKey = "";
let lastReadyAt = 0;

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

function clone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function afterPaint(callback) {
  if (!isFn(callback)) return;

  if (!isBrowser()) {
    try {
      callback();
    } catch {}
    return;
  }

  try {
    requestAnimationFrame(() => requestAnimationFrame(callback));
  } catch {
    try {
      setTimeout(callback, 0);
    } catch {}
  }
}

async function runMaybe(value) {
  if (value && isFn(value.then)) return await value;
  return value;
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

function pathFromUrlLike(value = "") {
  const raw = text(value, "");

  if (!raw) return "";

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed = new URL(raw, origin());

    if (parsed.origin !== origin()) return "/";

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return normalizePath(`${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`);
  } catch {
    return normalizePath(raw.startsWith("/") || raw.startsWith("#") ? raw : `/${raw}`);
  }
}

function cleanPath(path = "/") {
  return splitPath(normalizePath(path)).pathname;
}

function browserPublicPath() {
  if (!isBrowser()) return "/";

  try {
    const { pathname, search, hash } = window.location;

    if (hash && isHashRouterPath(hash)) {
      return normalizeHashRouterPath(hash);
    }

    return normalizePath(`${pathname || "/"}${search || ""}${hash || ""}`);
  } catch {
    return "/";
  }
}

function isUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(text(segment, ""));
}

function stripUsername(path = "/") {
  const parts = splitPath(normalizePath(path));
  const segments = parts.pathname.split("/").filter(Boolean);

  if (segments.length && isUsernameSegment(segments[0])) {
    const rest = segments.slice(1).join("/");
    return `${rest ? normalizePathname(`/${rest}`) : "/"}${parts.search}${parts.hash}`;
  }

  return `${parts.pathname}${parts.search}${parts.hash}`;
}

function canonicalizeTechnicalAlias(pathname = "/") {
  const clean = normalizePathname(pathname || "/");

  for (const alias of ACTIVATION_ALIASES) {
    if (clean === alias || clean.startsWith(`${alias}/`)) {
      return ACTIVATE_PATH;
    }
  }

  for (const alias of RESET_CONFIRM_ALIASES) {
    if (clean === alias || clean.startsWith(`${alias}/`)) {
      return RESET_CONFIRM_PATH;
    }
  }

  return clean;
}

function canonicalPath(path = "/") {
  return canonicalizeTechnicalAlias(cleanPath(stripUsername(path || "/")));
}

function publicPath(path = "/") {
  return normalizePath(path || "/");
}

function samePath(a = "/", b = "/") {
  return canonicalPath(a) === canonicalPath(b);
}

/* =========================================================
   TOKEN ROUTES
========================================================= */

function normalizeTokenRoutes(configs = []) {
  return Object.freeze(
    array(configs)
      .map((raw) => {
        const cfg = object(raw);

        const key = text(cfg.key || cfg.name, "");
        const basePath = normalizePathname(
          cfg.path ||
            cfg.canonicalPath ||
            (
              key === "resetConfirm"
                ? RESET_CONFIRM_PATH
                : ACTIVATE_PATH
            )
        );

        const paths = unique([
          basePath,
          ...array(cfg.paths),
          ...array(cfg.aliases),
          ...(key === "activation" ? ACTIVATION_ALIASES : []),
          ...(key === "resetConfirm" ? RESET_CONFIRM_ALIASES : []),
        ])
          .map(normalizePathname)
          .filter((item) => item && item !== "/");

        if (!paths.length) return null;

        return Object.freeze({
          ...cfg,
          key: key || basePath.replace(/^\/+/, "").replace(/[/-]/g, "_"),
          path: basePath,
          paths: Object.freeze(paths),
          windowKeys: Object.freeze(unique([
            ...array(cfg.windowKeys),
            cfg.windowKey,
            ...(key === "activation" ? [WINDOW_KEYS.activationInitialUrl] : []),
            ...(key === "resetConfirm"
              ? [
                  WINDOW_KEYS.resetPasswordConfirmInitialUrl,
                  WINDOW_KEYS.resetConfirmInitialUrl,
                  WINDOW_KEYS.passwordResetConfirmInitialUrl,
                ]
              : []),
          ])),
          tokenParamNames: Object.freeze(unique([
            ...array(cfg.tokenParamNames),
            ...(key === "activation"
              ? ["token", "activationToken", "activateToken", "activation_token", "activate_token", "code", "t"]
              : []),
            ...(key === "resetConfirm"
              ? ["token", "resetToken", "reset_token", "passwordResetToken", "password_reset_token", "confirmToken", "confirm_token", "code", "t"]
              : []),
          ])),
          scrubbedHistoryFlags: Object.freeze(unique([
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
          ])),
        });
      })
      .filter(Boolean)
  );
}

const TOKEN_ROUTES = normalizeTokenRoutes(
  Array.isArray(PROTECTED_PUBLIC_TOKEN_ROUTES) && PROTECTED_PUBLIC_TOKEN_ROUTES.length
    ? PROTECTED_PUBLIC_TOKEN_ROUTES
    : TOKEN_ROUTES_FALLBACK
);

function historyState() {
  if (!isBrowser()) return {};

  try {
    return object(window.history?.state);
  } catch {
    return {};
  }
}

function routeScrubbed(cfg) {
  if (!cfg) return false;

  const state = historyState();

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

function matchesTokenRoute(cfg, value = "") {
  if (!cfg) return false;

  const pathOnly = cleanPath(stripUsername(pathFromUrlLike(value) || value));

  return array(cfg.paths).some((item) => (
    pathOnly === item ||
    pathOnly.startsWith(`${item}/`)
  ));
}

function tokenRouteFor(value = "") {
  return TOKEN_ROUTES.find((cfg) => matchesTokenRoute(cfg, value)) || null;
}

function pathToken(cfg, value = "") {
  if (!cfg) return "";

  const pathOnly = cleanPath(stripUsername(pathFromUrlLike(value) || value));

  for (const base of array(cfg.paths)) {
    if (!pathOnly.startsWith(`${base}/`)) continue;

    const token = pathOnly.slice(`${base}/`.length).split("/")[0];

    try {
      return text(decodeURIComponent(token || ""), "");
    } catch {
      return text(token, "");
    }
  }

  return "";
}

function hasSearchToken(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");
    return array(names).some((name) => Boolean(text(params.get(name), "")));
  } catch {
    return false;
  }
}

function hasRouteToken(cfg, value = "") {
  if (!cfg || routeScrubbed(cfg)) return false;

  const raw = text(value, "");

  if (!raw) return false;
  if (pathToken(cfg, raw)) return true;

  const local = pathFromUrlLike(raw);
  const parts = splitPath(local);

  if (hasSearchToken(parts.search, cfg.tokenParamNames)) return true;

  try {
    const parsed = new URL(raw, origin());

    if (parsed.origin !== origin()) return false;

    if (hasSearchToken(parsed.search, cfg.tokenParamNames)) return true;

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      const hashPath = normalizeHashRouterPath(parsed.hash);
      const hashParts = splitPath(hashPath);

      if (pathToken(cfg, hashPath)) return true;
      if (hasSearchToken(hashParts.search, cfg.tokenParamNames)) return true;
    }

    if (parsed.hash && parsed.hash.includes("?")) {
      const query = parsed.hash.split("?").slice(1).join("?");
      return hasSearchToken(query ? `?${query}` : "", cfg.tokenParamNames);
    }
  } catch {}

  if (parts.hash && parts.hash.includes("?")) {
    const query = parts.hash.split("?").slice(1).join("?");
    return hasSearchToken(query ? `?${query}` : "", cfg.tokenParamNames);
  }

  return false;
}

function getWindowValue(key = "") {
  if (!isBrowser() || !key) return "";

  try {
    return text(window[key], "");
  } catch {
    return "";
  }
}

function getWindowRawValue(key = "") {
  if (!isBrowser() || !key) return null;

  try {
    return window[key] ?? null;
  } catch {
    return null;
  }
}

function setWindowValue(key = "", value = null) {
  if (!isBrowser() || !key) return false;

  try {
    window[key] = value;
    return true;
  } catch {
    return false;
  }
}

function bootContext() {
  return object(getWindowRawValue(WINDOW_KEYS.bootContext));
}

function mainBootContext() {
  return object(getWindowRawValue(WINDOW_KEYS.mainBootContext));
}

function initialUrl() {
  return getWindowValue(WINDOW_KEYS.initialUrl);
}

function activationInitialUrl() {
  return getWindowValue(WINDOW_KEYS.activationInitialUrl);
}

function resetConfirmInitialUrl() {
  return (
    getWindowValue(WINDOW_KEYS.resetPasswordConfirmInitialUrl) ||
    getWindowValue(WINDOW_KEYS.resetConfirmInitialUrl) ||
    getWindowValue(WINDOW_KEYS.passwordResetConfirmInitialUrl)
  );
}

function storedTokenRouteUrl(cfg) {
  for (const key of array(cfg?.windowKeys)) {
    const value = getWindowValue(key);
    if (value) return value;
  }

  return "";
}

function bootCandidates(AppCore) {
  const state = getState(AppCore);
  const boot = bootContext();
  const mainBoot = mainBootContext();

  return [
    state.bootProtectedInitialUrl,
    state.bootProtectedInitialPublicPath,
    state.bootProtectedInitialPath,

    state.bootActivationInitialUrl,
    state.bootActivationInitialPublicPath,
    state.bootActivationInitialPath,

    state.bootResetConfirmInitialUrl,
    state.bootResetConfirmInitialPublicPath,
    state.bootResetConfirmInitialPath,

    state.bootResetPasswordConfirmInitialUrl,
    state.bootResetPasswordConfirmInitialPublicPath,
    state.bootResetPasswordConfirmInitialPath,

    boot.protectedInitialUrl,
    boot.protectedInitialPublicPath,
    boot.protectedInitialPath,

    boot.activationInitialUrl,
    boot.activationInitialPublicPath,
    boot.activationInitialPath,

    boot.resetConfirmInitialUrl,
    boot.resetConfirmInitialPublicPath,
    boot.resetConfirmInitialPath,

    boot.mainInitialUrl,
    boot.mainInitialPublicPath,

    mainBoot.initialUrl,
    mainBoot.href,
    mainBoot.publicPath,

    activationInitialUrl(),
    resetConfirmInitialUrl(),

    state.bootInitialUrl,
    boot.initialUrl,
    initialUrl(),

    browserPublicPath(),

    state.publicPath,
    state.route,
  ]
    .map((item) => text(item, ""))
    .filter(Boolean);
}

function protectedInitialContext(AppCore) {
  for (const candidate of bootCandidates(AppCore)) {
    const cfg = tokenRouteFor(candidate);

    if (!cfg) continue;
    if (routeScrubbed(cfg)) continue;
    if (!hasRouteToken(cfg, candidate)) continue;

    const publicValue = publicPath(pathFromUrlLike(candidate));
    const canonicalValue = canonicalPath(publicValue);

    return {
      config: cfg,
      key: cfg.key || "",
      url: candidate,
      publicPath: publicValue,
      canonicalPath: canonicalValue,
      path: canonicalValue,
      hasToken: true,
    };
  }

  return {
    config: null,
    key: "",
    url: "",
    publicPath: "",
    canonicalPath: "",
    path: "",
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

  for (const cfg of TOKEN_ROUTES) {
    for (const routePath of array(cfg.paths)) {
      try {
        output = output.replace(
          new RegExp(`(${escapeRegExp(routePath)})\\/([^/?#\\s]+)`, "gi"),
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

function sanitizeError(error = null) {
  if (!error) return null;

  const source = error?.error || error?.reason || error;

  return {
    name: text(source?.name, "Error"),
    message: redact(text(source?.message || source?.reason || source, "Error")),
    status: number(source?.status || source?.statusCode, 0),
    code: text(source?.code, "") || null,
    at: iso(),
  };
}

function sanitize(value, depth = 0, seen = null) {
  if (!seen) {
    try {
      seen = new WeakSet();
    } catch {
      seen = null;
    }
  }

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

  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) return sanitizeError(value);

  if (value && typeof value === "object") {
    try {
      if (seen?.has?.(value)) return "[Circular]";
      seen?.add?.(value);
    } catch {}
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_SANITIZE_ARRAY).map((item) => sanitize(item, depth + 1, seen));
  }

  if (isObject(value)) {
    const out = {};

    for (const [key, item] of Object.entries(value).slice(0, MAX_SANITIZE_KEYS)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = item ? "***" : item;
        continue;
      }

      out[key] = sanitize(item, depth + 1, seen);
    }

    return out;
  }

  return String(value);
}

function sanitizeRestoreResult(result = {}) {
  const source = clone(object(result), {}) || {};

  for (const key of [
    ...TOKEN_KEYS,
    ...REFRESH_KEYS,
    "authorization",
    "password",
    "code",
    "otp",
    "tempToken",
    "temporaryToken",
    "twoFactorToken",
    "mfaToken",
  ]) {
    if (key in source) source[key] = null;
  }

  if (source.error) source.error = sanitizeError(source.error);
  if (source.message) source.message = redact(source.message);

  return sanitize(source);
}

/* =========================================================
   LOG / EMIT
========================================================= */

function log(AppCore, ...args) {
  const safeArgs = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.log?.("[AppSession]", ...safeArgs);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) console.log("[AppSession]", ...safeArgs);
  } catch {}
}

function warn(AppCore, ...args) {
  const safeArgs = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.warn?.("[AppSession]", ...safeArgs);
    return;
  } catch {}

  try {
    console.warn("[AppSession]", ...safeArgs);
  } catch {}
}

function errorLog(AppCore, ...args) {
  const safeArgs = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.error?.("[AppSession]", ...safeArgs);
    return;
  } catch {}

  try {
    console.error("[AppSession]", ...safeArgs);
  } catch {}
}

function emit(AppCore, eventName, payload = {}, options = {}) {
  const name = text(eventName, "");

  if (!name) return false;

  const detail = sanitize({
    version: SESSION_VERSION,
    source: SOURCE,
    ...object(payload),
  });

  let hasBus = false;
  let emitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      hasBus = true;
      AppCore.events.emit(name, detail);
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

function emitStep(AppCore, step = "", payload = {}) {
  emit(AppCore, EVENTS.restoreStep, {
    step: text(step, "unknown"),
    at: iso(),
    ...object(payload),
  });
}

async function runStep(AppCore, step = "", fn) {
  const startedAt = now();

  emitStep(AppCore, `${step}:start`);

  try {
    const result = await Promise.resolve(isFn(fn) ? fn() : null);
    const durationMs = now() - startedAt;

    emitStep(AppCore, `${step}:done`, { durationMs });

    if (durationMs > STEP_WARN_MS) {
      warn(AppCore, "Restore step lento.", { step, durationMs });
    }

    return result;
  } catch (error) {
    emitStep(AppCore, `${step}:error`, {
      durationMs: now() - startedAt,
      error,
    });

    throw error;
  }
}

/* =========================================================
   STATE / AUTH
========================================================= */

function getState(AppCore) {
  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function setState(AppCore, patch = {}, options = {}) {
  if (!AppCore || !isObject(patch)) return false;

  let changed = false;

  try {
    if (AppCore.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, patch);
      changed = true;
    }
  } catch {}

  const meta = {
    source: SOURCE,
    emit: false,
    emitState: false,
    silent: true,
    ...object(options),
  };

  try {
    AppCore?.setState?.(patch, meta);
    changed = true;
  } catch {}

  try {
    AppCore?.patchState?.(patch, meta);
    changed = true;
  } catch {}

  return changed;
}

function stripBearer(token = "") {
  return text(token, "").replace(/^Bearer\s+/i, "").trim();
}

function hasToken(value = "") {
  const token = stripBearer(value);

  if (!token) return false;

  const lower = token.toLowerCase();

  if (BAD_TOKEN_VALUES.includes(lower)) return false;
  if (/[\s\r\n\t]/.test(token)) return false;

  return true;
}

function firstToken(...values) {
  for (const value of values) {
    if (hasToken(value)) return stripBearer(value);
  }

  return null;
}

function readToken(AppCore) {
  const state = getState(AppCore);
  const session = object(state.session);
  const sessionData = object(state.sessionData);
  const auth = object(state.auth);

  return firstToken(
    ...TOKEN_KEYS.map((key) => state[key]),
    ...TOKEN_KEYS.map((key) => session[key]),
    ...TOKEN_KEYS.map((key) => sessionData[key]),
    ...TOKEN_KEYS.map((key) => auth[key])
  );
}

function readRefreshTokenFrom(value = {}) {
  const source = object(value);

  return firstToken(
    ...REFRESH_KEYS.map((key) => source[key]),
    ...REFRESH_KEYS.map((key) => source.data?.[key]),
    ...REFRESH_KEYS.map((key) => source.payload?.[key]),
    ...REFRESH_KEYS.map((key) => source.auth?.[key]),
    ...REFRESH_KEYS.map((key) => source.session?.[key]),
    ...REFRESH_KEYS.map((key) => source.sessionData?.[key])
  );
}

function readTokenFrom(value = {}) {
  const source = object(value);

  return firstToken(
    ...TOKEN_KEYS.map((key) => source[key]),
    ...TOKEN_KEYS.map((key) => source.data?.[key]),
    ...TOKEN_KEYS.map((key) => source.payload?.[key]),
    ...TOKEN_KEYS.map((key) => source.auth?.[key]),
    ...TOKEN_KEYS.map((key) => source.session?.[key]),
    ...TOKEN_KEYS.map((key) => source.sessionData?.[key])
  );
}

function userStatusBlocked(user = {}) {
  const status = text(
    user.status ||
      user.estado ||
      user.state ||
      user.accountStatus ||
      "",
    ""
  ).toLowerCase();

  return [
    "disabled",
    "inactive",
    "deleted",
    "blocked",
    "suspended",
    "banned",
    "revoked",
    "desactivado",
    "inactivo",
    "bloqueado",
    "eliminado",
    "suspendido",
  ].includes(status);
}

function hasUsableUser(user = null) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return false;

  if (
    user.active === false ||
    user.disabled === true ||
    user.isDisabled === true ||
    user.deleted === true ||
    user.isDeleted === true ||
    user.blocked === true ||
    user.isBlocked === true ||
    user.suspended === true ||
    user.banned === true ||
    userStatusBlocked(user)
  ) {
    return false;
  }

  return USER_ID_KEYS.some((key) => Boolean(text(user?.[key], "")));
}

function firstUser(...values) {
  for (const value of values) {
    if (hasUsableUser(value)) return value;
  }

  return null;
}

function readUserFromResult(result = {}) {
  const source = object(result);
  const data = object(source.data);
  const payload = object(source.payload);
  const auth = object(source.auth);
  const session = object(source.session);
  const sessionData = object(source.sessionData);

  return firstUser(
    source.user,
    source.usuario,
    source.me,
    source.account,
    source.profile,
    source.currentUser,
    source.sessionUser,
    source.authUser,

    data.user,
    data.usuario,
    data.me,
    data.account,
    data.profile,
    data.currentUser,
    data.sessionUser,
    data.authUser,

    payload.user,
    payload.usuario,
    payload.me,
    payload.account,
    payload.profile,
    payload.currentUser,
    payload.sessionUser,
    payload.authUser,

    auth.user,
    auth.usuario,
    auth.me,
    auth.account,
    auth.profile,

    session.user,
    session.usuario,
    session.me,
    session.account,
    session.profile,

    sessionData.user,
    sessionData.usuario,
    sessionData.me,
    sessionData.account,
    sessionData.profile,

    data.session?.user,
    payload.session?.user,
    auth.session?.user
  );
}

function readUser(AppCore) {
  const state = getState(AppCore);

  return firstUser(
    state.user,
    state.currentUser,
    state.sessionUser,
    state.authUser,
    state.me,
    state.account,
    state.profile,
    state.session?.user,
    state.sessionData?.user,
    state.auth?.user
  );
}

function readUsername(AppCore) {
  const user = readUser(AppCore);

  return (
    user?.username ||
    user?.userName ||
    user?.user_name ||
    user?.email ||
    user?.mail ||
    user?.id ||
    user?.userId ||
    user?.user_id ||
    null
  );
}

function readRole(AppCore) {
  const state = getState(AppCore);
  const user = readUser(AppCore);

  return (
    state.role ||
    state.rol ||
    state.userRole ||
    state.session?.role ||
    state.session?.rol ||
    state.sessionData?.role ||
    state.sessionData?.rol ||
    state.auth?.role ||
    state.auth?.rol ||
    user?.role ||
    user?.rol ||
    user?.type ||
    user?.userType ||
    user?.user_type ||
    user?.profile?.role ||
    user?.profile?.rol ||
    user?.raw?.role ||
    user?.raw?.rol ||
    null
  );
}

function isAuthenticated(AppCore) {
  const state = getState(AppCore);

  const tokenOk = hasToken(readToken(AppCore));
  const userOk = hasUsableUser(readUser(AppCore));

  return Boolean(tokenOk && userOk && state.authenticated !== false);
}

function enforceNoGhostAuth(AppCore, reason = "ghost-auth-check") {
  const state = getState(AppCore);
  const token = readToken(AppCore);
  const tokenOk = hasToken(token);
  const userOk = hasUsableUser(readUser(AppCore));

  if (!state.authenticated && !(userOk && !tokenOk)) return false;
  if (tokenOk && userOk) return false;

  const keepTokenOnly = tokenOk && !userOk;

  const patch = {
    authenticated: false,
    hasToken: keepTokenOnly,

    role: null,
    rol: null,
    userRole: null,
    roles: [],

    username: null,
    currentResolvedUsername: null,
    resolvedUsername: null,

    user: null,
    currentUser: null,
    sessionUser: null,
    authUser: null,
  };

  if (!keepTokenOnly) {
    Object.assign(patch, {
      token: null,
      accessToken: null,
      access_token: null,
      refreshToken: null,
      refresh_token: null,
      idToken: null,
      id_token: null,
    });
  }

  setState(AppCore, patch, {
    source: `AppSession:${reason}`,
    forceUnauthenticated: true,
  });

  emit(AppCore, EVENTS.ghostAuthBlocked, {
    reason,
    at: iso(),
  });

  return true;
}

function applyRestoreResult(AppCore, result = {}, reason = "restore-result") {
  if (!AppCore) return false;

  const user = readUserFromResult(result);
  const token = readTokenFrom(result);
  const refreshToken = readRefreshTokenFrom(result);

  const currentToken = readToken(AppCore);
  const currentUser = readUser(AppCore);

  const finalToken = token || currentToken;
  const finalUser = user || currentUser;

  const patch = {};

  if (token) {
    patch.token = token;
    patch.accessToken = token;
    patch.access_token = token;
    patch.hasToken = true;
  }

  if (refreshToken) {
    patch.refreshToken = refreshToken;
    patch.refresh_token = refreshToken;
  }

  if (user) {
    patch.user = user;
    patch.currentUser = user;
    patch.sessionUser = user;
    patch.authUser = user;
  }

  if (hasToken(finalToken) && hasUsableUser(finalUser)) {
    const role =
      readRole(AppCore) ||
      finalUser?.role ||
      finalUser?.rol ||
      null;

    patch.authenticated = true;
    patch.hasToken = true;
    patch.role = role;
    patch.rol = role;
    patch.username =
      finalUser?.username ||
      finalUser?.email ||
      finalUser?.userId ||
      finalUser?.id ||
      null;
  }

  if (!Object.keys(patch).length) return false;

  try {
    if (isFn(AppCore.applySession)) {
      AppCore.applySession(patch, {
        source: `AppSession:${reason}`,
        emit: false,
        emitState: false,
        silent: true,
      });

      return true;
    }
  } catch {}

  setState(AppCore, patch, {
    source: `AppSession:${reason}`,
  });

  return true;
}

/* =========================================================
   ROUTE CLASSIFICATION
========================================================= */

function isPathMatchingAny(path = "/", routes = [], prefixes = []) {
  const clean = canonicalPath(path);

  if (array(routes).map(canonicalPath).includes(clean)) return true;

  return array(prefixes).some((prefix) => clean.startsWith(canonicalPath(prefix)));
}

function isPublicTechnicalPath(path = "/") {
  return isPathMatchingAny(path, PUBLIC_TECHNICAL_PATHS, PUBLIC_TECHNICAL_PREFIXES);
}

function isLoginPath(path = "/") {
  return canonicalPath(path) === LOGIN_PATH;
}

function getCurrentCanonicalSafe(AppCore, Router) {
  try {
    const value = getCurrentCanonicalPath(AppCore, Router);
    if (value) return canonicalPath(value);
  } catch {}

  try {
    const value = Router?.getCurrentCanonicalPath?.();
    if (value) return canonicalPath(value);
  } catch {}

  const state = getState(AppCore);

  return canonicalPath(
    state.publicPath ||
      state.route ||
      browserPublicPath() ||
      HOME_PATH
  );
}

function getCurrentPublicSafe(AppCore, Router) {
  try {
    const value = getCurrentPublicPath(AppCore, Router);
    if (value) return publicPath(value);
  } catch {}

  try {
    const value = Router?.getCurrentPublicPath?.();
    if (value) return publicPath(value);
  } catch {}

  const state = getState(AppCore);

  return publicPath(
    state.publicPath ||
      browserPublicPath() ||
      state.route ||
      HOME_PATH
  );
}

function isPublicTechnicalBoot(AppCore) {
  const state = getState(AppCore);
  const protectedContext = protectedInitialContext(AppCore);

  return Boolean(
    protectedContext.config ||
      isPublicTechnicalPath(state.bootProtectedInitialPublicPath) ||
      isPublicTechnicalPath(state.bootProtectedInitialPath) ||
      isPublicTechnicalPath(state.publicPath) ||
      isPublicTechnicalPath(state.route) ||
      isPublicTechnicalPath(browserPublicPath())
  );
}

/* =========================================================
   UI
========================================================= */

async function runSyncUserUI({
  AppCore,
  Auth,
  Router,
  syncUserUI,
  reason = "session-sync",
} = {}) {
  const context = {
    AppCore,
    Auth,
    Router,
    reason,
    source: SOURCE,
  };

  let synced = false;

  if (isFn(syncUserUI)) {
    try {
      await Promise.resolve(syncUserUI(context));
      synced = true;
    } catch (error) {
      warn(AppCore, "syncUserUI(context) falló.", error);

      try {
        await Promise.resolve(syncUserUI(AppCore));
        synced = true;
      } catch (legacyError) {
        warn(AppCore, "syncUserUI(AppCore) falló.", legacyError);
      }
    }
  }

  if (!synced && isFn(AppCore?.syncUserUI)) {
    try {
      await Promise.resolve(AppCore.syncUserUI({ reason, source: SOURCE }));
      synced = true;
    } catch (error) {
      warn(AppCore, "AppCore.syncUserUI() falló.", error);
    }
  }

  emit(AppCore, EVENTS.uiRepairRequest, {
    reason,
    authenticated: isAuthenticated(AppCore),
    user: readUser(AppCore),
    role: readRole(AppCore),
    repairShell: false,
    hardRepair: false,
    rebind: false,
  });

  return synced;
}

function clearAuthScreenDomState({
  AppCore,
  Router,
  reason = "authenticated-route",
  force = false,
} = {}) {
  if (!isBrowser()) return false;

  if (!isAuthenticated(AppCore)) return false;

  const canonical = getCurrentCanonicalSafe(AppCore, Router);

  if (!force && isPublicTechnicalPath(canonical)) return false;
  if (!force && isLoginPath(canonical)) return false;

  try {
    document.documentElement?.classList?.remove?.(
      "route-auth",
      "route-shell-hidden",
      "route-chrome-hidden"
    );

    document.documentElement?.classList?.add?.(
      "route-app",
      "route-shell-visible",
      "route-chrome-visible"
    );

    document.documentElement?.setAttribute?.("data-authenticated", "true");

    document.body?.classList?.remove?.(
      "auth-screen",
      "login-no-scroll",
      "route-auth",
      "route-shell-hidden",
      "route-chrome-hidden"
    );

    document.body?.classList?.add?.(
      "route-app",
      "route-shell-visible",
      "route-chrome-visible"
    );

    document.body?.removeAttribute?.("data-auth-screen");
    document.body?.setAttribute?.("data-authenticated", "true");
  } catch {}

  for (const id of ["app-shell", "main-content", "app-content", "view-container"]) {
    try {
      const el = document.getElementById(id);

      if (!el) continue;

      el.hidden = false;
      el.setAttribute("aria-hidden", "false");
      el.setAttribute("aria-busy", "false");
    } catch {}
  }

  emit(AppCore, EVENTS.authScreenCleared, {
    reason,
    canonical,
    authenticated: true,
    at: iso(),
  });

  return true;
}

/* =========================================================
   SNAPSHOT / READY EVENTS
========================================================= */

function persistSnapshot(snapshot = {}) {
  try {
    setWindowValue(WINDOW_KEYS.snapshot, sanitize(snapshot));
  } catch {}

  return snapshot;
}

function buildSnapshot(AppCore, extras = {}) {
  const state = getState(AppCore);
  const protectedContext = protectedInitialContext(AppCore);

  const snapshot = sanitize({
    version: SESSION_VERSION,

    authenticated: isAuthenticated(AppCore),
    hasToken: Boolean(readToken(AppCore)),

    user: readUser(AppCore),
    username: readUsername(AppCore),
    role: readRole(AppCore),

    route: state.route || "/",
    publicPath: state.publicPath || "/",

    bootInitialUrl: state.bootInitialUrl || initialUrl() || null,

    protectedInitialUrl: protectedContext.url || null,
    protectedInitialPath: protectedContext.path || null,
    protectedInitialPublicPath: protectedContext.publicPath || null,
    protectedRouteKey: protectedContext.key || null,
    hasProtectedInitialToken: Boolean(protectedContext.config && protectedContext.hasToken),

    at: iso(),

    ...object(extras),
  });

  persistSnapshot(snapshot);

  return snapshot;
}

function readyPayload(AppCore, reason = "session-ready", result = {}) {
  return {
    reason,

    ok: Boolean(result?.ok) || isAuthenticated(AppCore),
    authenticated: isAuthenticated(AppCore),

    user: readUser(AppCore),
    username: readUsername(AppCore),
    role: readRole(AppCore),

    route: getState(AppCore).route || "/",
    publicPath: getState(AppCore).publicPath || "/",

    navigationHandled: Boolean(
      result?.navigationHandled ||
        result?.navigated ||
        result?.didNavigate ||
        result?.redirected
    ),

    navigated: Boolean(result?.navigated || result?.navigationHandled),
    didNavigate: Boolean(result?.didNavigate || result?.navigationHandled),
    redirected: Boolean(result?.redirected || result?.navigationHandled),
    routeChanged: Boolean(result?.routeChanged),

    at: iso(),
  };
}

function emitReadyEvents({
  AppCore,
  reason = "session-ready",
  result = {},
  dedupe = true,
} = {}) {
  const payload = readyPayload(AppCore, reason, result);

  const key = [
    payload.authenticated ? "auth" : "anon",
    text(payload.username, ""),
    text(payload.role, ""),
    text(payload.route, ""),
    text(payload.publicPath, ""),
    payload.navigationHandled ? "nav" : "no-nav",
    payload.routeChanged ? "changed" : "same",
  ].join("|");

  const stamp = now();

  if (dedupe && key === lastReadyKey && stamp - lastReadyAt < READY_DEDUPE_MS) {
    return payload;
  }

  lastReadyKey = key;
  lastReadyAt = stamp;

  emit(AppCore, EVENTS.authRestored, payload);
  emit(AppCore, EVENTS.appRestored, payload);
  emit(AppCore, EVENTS.userChange, payload);

  emit(AppCore, EVENTS.uiRepairRequest, {
    ...payload,
    repairShell: false,
    hardRepair: false,
    rebind: false,
  });

  return payload;
}

/* =========================================================
   NAVIGATION
========================================================= */

function loginInProgress(Auth, state = {}) {
  return Boolean(
    state.loginInProgress ||
      state.authLoginInProgress ||
      state.isLoggingIn ||
      Auth?.session?.loggingIn ||
      Auth?.session?.loginPromise ||
      Auth?.loginPromise
  );
}

function shouldSkipNavigation(Auth, state = {}) {
  return Boolean(
    state.bootNavigationHandled ||
      state.loginNavigationHandled ||
      state.loginInProgress ||
      loginInProgress(Auth, state)
  );
}

function markNavigationHandled(AppCore, state, value = true) {
  try {
    if (state && typeof state === "object") {
      state.bootNavigationHandled = Boolean(value);
    }
  } catch {}

  setState(AppCore, {
    bootNavigationHandled: Boolean(value),
  }, {
    source: "AppSession:navigation-handled",
  });
}

function markNavigationSkipped(state, reason = "unknown") {
  try {
    if (state && typeof state === "object") {
      state.postRestoreNavigationSkipped = true;
      state.postRestoreNavigationSkippedReason = reason;
    }
  } catch {}
}

function isSafeInternalTarget(value = "") {
  const raw = text(value, "");

  if (!raw) return false;
  if (!raw.startsWith("/")) return false;
  if (raw.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false;
  if (/[\r\n\t\\]/.test(raw)) return false;

  return true;
}

function normalizeTarget(path = "/") {
  const raw = text(path, HOME_PATH) || HOME_PATH;

  if (!isSafeInternalTarget(raw)) return HOME_PATH;

  try {
    const parsed = new URL(raw, origin());

    if (parsed.origin !== origin()) return HOME_PATH;

    const output = `${normalizePathname(parsed.pathname || HOME_PATH)}${parsed.search || ""}${parsed.hash || ""}`;

    return isSafeInternalTarget(output) ? output : HOME_PATH;
  } catch {
    const clean = normalizePathname(raw);
    return isSafeInternalTarget(clean) ? clean : HOME_PATH;
  }
}

function resolvePostLoginTarget({ AppCore, Auth } = {}) {
  const user = readUser(AppCore);

  try {
    if (isFn(Auth?.getPostLoginTarget)) {
      const value = Auth.getPostLoginTarget(user, {});
      const target = normalizeTarget(value);

      if (target && target !== LOGIN_PATH && !isPublicTechnicalPath(target)) {
        return target;
      }
    }
  } catch {}

  const state = getState(AppCore);

  for (const candidate of [
    state.postLoginTarget,
    state.redirectAfterLogin,
    state.returnTo,
    state.lastPrivatePath,
  ]) {
    const value = text(candidate, "");

    if (!value) continue;

    const target = normalizeTarget(value);

    if (target && target !== LOGIN_PATH && !isPublicTechnicalPath(target)) {
      return target;
    }
  }

  return HOME_PATH;
}

async function runRouterNavigation({
  AppCore,
  Router,
  target = HOME_PATH,
  replaceState = true,
  force = false,
} = {}) {
  if (!Router) return false;

  const normalizedTarget = normalizeTarget(target);

  try {
    if (isFn(Router.goAfterLogin)) {
      const result = await runMaybe(
        Router.goAfterLogin(normalizedTarget, {
          replaceState,
          force,
          source: SOURCE,
        })
      );

      return result !== false;
    }
  } catch (error) {
    warn(AppCore, "Router.goAfterLogin() falló.", error);
  }

  try {
    if (isFn(Router.navigate)) {
      const result = await runMaybe(
        Router.navigate(normalizedTarget, {
          replaceState,
          force,
          source: SOURCE,
          reason: "post-restore-login-navigation",
        })
      );

      return result !== false;
    }
  } catch (error) {
    warn(AppCore, "Router.navigate() falló.", error);
  }

  try {
    if (isFn(Router.render)) {
      const result = await runMaybe(
        Router.render(normalizedTarget, {
          replaceState,
          force,
          source: SOURCE,
          reason: "post-restore-login-render-fallback",
        })
      );

      return result !== false;
    }
  } catch (error) {
    warn(AppCore, "Router.render() fallback falló.", error);
  }

  return false;
}

export async function navigateAfterSessionRestore({
  AppCore,
  Auth,
  Router,
  state,
} = {}) {
  if (!AppCore || !Router) return false;

  enforceNoGhostAuth(AppCore, "before-post-restore-navigation");

  if (!isAuthenticated(AppCore)) return false;

  const currentCanonical = getCurrentCanonicalSafe(AppCore, Router);
  const currentPublic = getCurrentPublicSafe(AppCore, Router);

  if (
    isPublicTechnicalPath(currentCanonical) ||
    isPublicTechnicalPath(currentPublic) ||
    isPublicTechnicalBoot(AppCore)
  ) {
    markNavigationSkipped(state, "public-technical-route");

    log(AppCore, "navigateAfterSessionRestore() omitido por ruta pública técnica.", {
      canonical: currentCanonical,
      publicPath: currentPublic,
    });

    return false;
  }

  if (shouldSkipNavigation(Auth, state)) {
    markNavigationSkipped(
      state,
      loginInProgress(Auth, state)
        ? "login-in-progress"
        : "already-handled"
    );

    return false;
  }

  if (!isLoginPath(currentCanonical)) {
    clearAuthScreenDomState({
      AppCore,
      Router,
      reason: "already-authenticated-private-route",
    });

    return false;
  }

  const target = resolvePostLoginTarget({
    AppCore,
    Auth,
  });

  if (!target || samePath(target, currentCanonical)) {
    markNavigationSkipped(state, "target-empty-or-same");
    return false;
  }

  log(AppCore, "navigateAfterSessionRestore(): redirigiendo desde login.", {
    canonical: currentCanonical,
    publicPath: currentPublic,
    target,
    authenticated: true,
    user: readUsername(AppCore),
    role: readRole(AppCore),
  });

  const navigated = await runRouterNavigation({
    AppCore,
    Router,
    target,
    replaceState: true,
    force: false,
  });

  if (!navigated) {
    markNavigationSkipped(state, "router-navigation-failed");
    return false;
  }

  markNavigationHandled(AppCore, state, true);

  clearAuthScreenDomState({
    AppCore,
    Router,
    reason: "post-restore-login-navigation",
    force: true,
  });

  afterPaint(() => {
    clearAuthScreenDomState({
      AppCore,
      Router,
      reason: "post-restore-login-navigation-after-paint",
      force: true,
    });

    emit(AppCore, EVENTS.uiRepairRequest, {
      reason: "post-restore-navigation-after-paint",
      target,
      authenticated: true,
      repairShell: false,
      hardRepair: false,
      rebind: false,
    });
  });

  emit(AppCore, EVENTS.authNavigation, {
    reason: "post-restore-login-navigation",
    target,
    authenticated: true,
    at: iso(),
  });

  return true;
}

/* =========================================================
   AUTH RESTORE
========================================================= */

function getRestorePromise(state) {
  try {
    return state?.sessionRestorePromise || restorePromise;
  } catch {
    return restorePromise;
  }
}

function setRestorePromise(state, promise) {
  restorePromise = promise;

  try {
    if (state && typeof state === "object") {
      state.sessionRestorePromise = promise;
    }
  } catch {}
}

function clearRestorePromise(state, promise) {
  if (restorePromise === promise) restorePromise = null;

  try {
    if (state && typeof state === "object" && state.sessionRestorePromise === promise) {
      state.sessionRestorePromise = null;
    }
  } catch {}
}

function restoreOptions({ publicTechnicalBoot = false } = {}) {
  return {
    silent: true,

    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
    skipPostRestoreNavigation: true,

    preserveCurrentRoute: publicTechnicalBoot,
    preserveRoute: publicTechnicalBoot,
    preservePublicPath: publicTechnicalBoot,
    preserveSearch: publicTechnicalBoot,
    preserveHash: publicTechnicalBoot,

    publicRoute: publicTechnicalBoot,
    technicalPublicRoute: publicTechnicalBoot,

    source: SOURCE,
    reason: "app-session-restore",
  };
}

async function callAuthRestore(Auth, options) {
  if (!Auth) return null;

  if (isFn(Auth.restoreSession)) return await Auth.restoreSession(options);
  if (isFn(Auth.restore)) return await Auth.restore(options);
  if (isFn(Auth.session?.restore)) return await Auth.session.restore(options);

  return null;
}

export async function restoreAuthSession({
  AppCore,
  Auth,
  Router,
  syncUserUI,
  state,
  emitReadyEvents = true,
  syncUi = true,
} = {}) {
  const existing = getRestorePromise(state);

  if (existing) return existing;

  if (
    !Auth ||
    (
      !isFn(Auth.restoreSession) &&
      !isFn(Auth.restore) &&
      !isFn(Auth.session?.restore)
    )
  ) {
    enforceNoGhostAuth(AppCore, "auth-module-missing");

    if (syncUi) {
      await runSyncUserUI({
        AppCore,
        Auth,
        Router,
        syncUserUI,
        reason: "auth-module-missing",
      });
    }

    return buildSnapshot(AppCore, {
      ok: false,
      restored: false,
      reason: "auth-module-missing",
    });
  }

  let promise = null;

  promise = (async () => {
    const publicTechnicalBoot = isPublicTechnicalBoot(AppCore);
    const protectedContext = protectedInitialContext(AppCore);

    try {
      enforceNoGhostAuth(AppCore, "before-auth-restore");

      setState(AppCore, {
        restoring: true,
        authRestoring: true,
        sessionRestoring: true,
      }, {
        source: "AppSession:restore-start",
      });

      emit(AppCore, EVENTS.restoreStart, {
        publicTechnicalBoot,
        protectedRouteKey: protectedContext.key || "",
        at: iso(),
      });

      log(AppCore, "Restore session iniciado.", {
        publicTechnicalBoot,
        protectedRouteKey: protectedContext.key || "",
      });

      const result = await runStep(
        AppCore,
        "auth-restore",
        () => callAuthRestore(
          Auth,
          restoreOptions({ publicTechnicalBoot })
        )
      );

      applyRestoreResult(AppCore, result, "restore-auth-session");
      enforceNoGhostAuth(AppCore, "after-auth-restore");

      if (syncUi) {
        await runStep(
          AppCore,
          "sync-ui-after-auth-restore",
          () => runSyncUserUI({
            AppCore,
            Auth,
            Router,
            syncUserUI,
            reason: "restore-auth-session",
          })
        );
      }

      const authenticated = isAuthenticated(AppCore);

      if (emitReadyEvents && authenticated) {
        emitReadyEventsFn({
          AppCore,
          reason: "restore-auth-session",
          result,
        });
      }

      const snapshot = buildSnapshot(AppCore, {
        ok: Boolean(result?.ok) || authenticated,
        restored: Boolean(result?.ok) || authenticated,
        publicTechnicalBoot,
        protectedRouteKey: protectedContext.key || "",
      });

      emit(AppCore, EVENTS.restoreDone, {
        ...snapshot,
        result: sanitizeRestoreResult(result),
      });

      log(AppCore, "Restore session completado.", snapshot);

      return {
        ...sanitizeRestoreResult(result),
        ...snapshot,
      };
    } catch (error) {
      warn(AppCore, "restoreAuthSession() error.", error);

      enforceNoGhostAuth(AppCore, "auth-restore-error");

      if (syncUi) {
        await runSyncUserUI({
          AppCore,
          Auth,
          Router,
          syncUserUI,
          reason: "restore-auth-session-error",
        });
      }

      const snapshot = buildSnapshot(AppCore, {
        ok: false,
        restored: false,
        publicTechnicalBoot,
        protectedRouteKey: protectedContext.key || "",
        error: sanitizeError(error),
      });

      emit(AppCore, EVENTS.restoreError, snapshot);

      return snapshot;
    } finally {
      setState(AppCore, {
        restoring: false,
        authRestoring: false,
        sessionRestoring: false,
      }, {
        source: "AppSession:restore-finally",
      });

      clearRestorePromise(state, promise);
    }
  })();

  setRestorePromise(state, promise);

  return promise;
}

function emitReadyEventsFn(args = {}) {
  return emitReadyEvents(args);
}

/* =========================================================
   BACKGROUND RESTORE
========================================================= */

export async function restoreSessionInBackground({
  AppCore,
  Auth,
  Router,
  Store,
  state,
  syncUserUI,
  warmup,
  skipPostRestoreNavigation = false,
} = {}) {
  const beforeCanonical = getCurrentCanonicalSafe(AppCore, Router);
  const beforePublic = getCurrentPublicSafe(AppCore, Router);

  try {
    const publicTechnicalBoot = isPublicTechnicalBoot(AppCore);

    if (publicTechnicalBoot || skipPostRestoreNavigation) {
      markNavigationSkipped(
        state,
        publicTechnicalBoot
          ? "public-technical-boot"
          : "skip-post-restore-navigation"
      );
    }

    const result = await restoreAuthSession({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      state,
      emitReadyEvents: false,
      syncUi: false,
    });

    try {
      await runStep(
        AppCore,
        "warmup",
        () => isFn(warmup)
          ? warmup({
              AppCore,
              Auth,
              Router,
              Store,
              reason: "session-restore",
            })
          : null
      );
    } catch (error) {
      warn(AppCore, "warmup() falló.", error);
    }

    enforceNoGhostAuth(AppCore, "before-background-navigation");

    let navigationHandled = false;

    if (!publicTechnicalBoot && !skipPostRestoreNavigation) {
      navigationHandled = await navigateAfterSessionRestore({
        AppCore,
        Auth,
        Router,
        state,
      });
    } else {
      log(AppCore, "Post-restore navigation omitida.", {
        publicTechnicalBoot,
        skipPostRestoreNavigation,
      });
    }

    const afterCanonical = getCurrentCanonicalSafe(AppCore, Router);
    const afterPublic = getCurrentPublicSafe(AppCore, Router);

    const actualRouteChanged = Boolean(
      !samePath(beforeCanonical, afterCanonical) ||
        !samePath(beforePublic, afterPublic)
    );

    const routeChanged = Boolean(navigationHandled && actualRouteChanged);

    await runSyncUserUI({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      reason: "restore-session-background-final",
    });

    const finalResult = {
      ...sanitizeRestoreResult(result),

      ok: Boolean(result?.ok) || isAuthenticated(AppCore),
      restored: Boolean(result?.restored) || Boolean(result?.ok) || isAuthenticated(AppCore),

      navigationHandled,
      navigated: navigationHandled,
      didNavigate: navigationHandled,
      redirected: navigationHandled,

      routeChanged,
    };

    if (isAuthenticated(AppCore)) {
      clearAuthScreenDomState({
        AppCore,
        Router,
        reason: "restore-session-background-final",
      });

      emitReadyEvents({
        AppCore,
        reason: "restore-session-background-final",
        result: finalResult,
      });
    }

    const snapshot = buildSnapshot(AppCore, {
      ok: Boolean(finalResult.ok),
      restored: Boolean(finalResult.restored),

      publicTechnicalBoot,
      skipPostRestoreNavigation,

      beforeCanonical,
      beforePublic,
      afterCanonical,
      afterPublic,

      navigationHandled,
      navigated: navigationHandled,
      didNavigate: navigationHandled,
      redirected: navigationHandled,

      routeChanged,
      actualRouteChanged,
    });

    log(AppCore, "restoreSessionInBackground() completado.", snapshot);

    return {
      ...finalResult,
      ...snapshot,
    };
  } catch (error) {
    errorLog(AppCore, "restoreSessionInBackground() falló.", error);

    enforceNoGhostAuth(AppCore, "background-restore-error");

    await runSyncUserUI({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      reason: "restore-session-background-error",
    });

    return buildSnapshot(AppCore, {
      ok: false,
      restored: false,
      error: sanitizeError(error),

      navigationHandled: false,
      navigated: false,
      didNavigate: false,
      redirected: false,
      routeChanged: false,
    });
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionBootstrapSnapshot({
  AppCore,
  Auth = null,
  Router = null,
  state,
} = {}) {
  const currentCanonical = getCurrentCanonicalSafe(AppCore, Router);
  const currentPublic = getCurrentPublicSafe(AppCore, Router);
  const protectedContext = protectedInitialContext(AppCore);

  return sanitize({
    ...buildSnapshot(AppCore),

    restoring: Boolean(getRestorePromise(state)),

    bootNavigationHandled: Boolean(state?.bootNavigationHandled),

    postRestoreNavigationSkipped: Boolean(state?.postRestoreNavigationSkipped),
    postRestoreNavigationSkippedReason: state?.postRestoreNavigationSkippedReason || null,

    initialRouteRendered: Boolean(state?.initialRouteRendered),
    loginNavigationHandled: Boolean(state?.loginNavigationHandled),
    loginInProgress: Boolean(state?.loginInProgress),
    authLoginInProgress: loginInProgress(Auth, state),

    publicTechnicalBoot: isPublicTechnicalBoot(AppCore),

    currentCanonicalPath: currentCanonical,
    currentPublicPath: currentPublic,
    browserPublicPath: browserPublicPath(),

    bootContext: bootContext(),
    mainBootContext: mainBootContext(),

    protectedInitialUrl: protectedContext.url || "",
    protectedInitialPath: protectedContext.path || "",
    protectedInitialPublicPath: protectedContext.publicPath || "",
    protectedRouteKey: protectedContext.key || "",

    ghostAuthBlocked: Boolean(
      getState(AppCore).authenticated === true &&
        (
          !hasToken(readToken(AppCore)) ||
          !hasUsableUser(readUser(AppCore))
        )
    ),
  });
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  SESSION_VERSION,

  navigateAfterSessionRestore,
  restoreAuthSession,
  restoreSessionInBackground,
  getSessionBootstrapSnapshot,
};
