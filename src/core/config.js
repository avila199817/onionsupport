/* =========================================================
   Onion SPA - Core Config
   Archivo: src/core/config.js

   CORE CONFIG · CLEAN CONTRACT
   - API producción: https://api.onionit.net
   - apiBase nunca termina en /api
   - /api/auth/me siempre privado
   - rutas SPA canónicas
   - rutas técnicas públicas con token preservado
   - endpoints backend activos
   - runtime overrides seguros
========================================================= */

export const CONFIG_VERSION = "18.0.0-clean";

export const CANONICAL_PRODUCTION_API_BASE = "https://api.onionit.net";

export const CANONICAL_BACKEND_API_ORIGINS = Object.freeze([
  "https://api.onionit.net",
]);

export const FORBIDDEN_FRONTEND_API_ORIGINS = Object.freeze([
  "https://onionsupport.com",
  "https://www.onionsupport.com",
  "http://onionsupport.com",
  "http://www.onionsupport.com",
]);

const PRIVATE_ME_PATHS = Object.freeze([
  "/api/auth/me",
  "/auth/me",
  "/api/me",
  "/me",
]);

/* =========================================================
   SAFE HELPERS
========================================================= */

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function isObjectLike(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const out = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return out || fallback;
}

function bool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(clean)) {
      return true;
    }

    if (["false", "0", "no", "off", "disabled", "inactive"].includes(clean)) {
      return false;
    }
  }

  return Boolean(fallback);
}

function number(value, fallback = 0) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function unique(values = []) {
  const out = [];
  const seen = new Set();

  for (const item of toArray(values).flat(Infinity)) {
    if (item === null || item === undefined || item === "") continue;

    const value = typeof item === "string" ? item.trim() : item;
    if (value === "") continue;

    const key = typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();

    if (seen.has(key)) continue;

    seen.add(key);
    out.push(value);
  }

  return out;
}

function clonePlain(value, seen = new WeakMap()) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  try {
    if (seen.has(value)) return seen.get(value);
  } catch {}

  if (Array.isArray(value)) {
    const arr = [];

    try {
      seen.set(value, arr);
    } catch {}

    for (const item of value) arr.push(clonePlain(item, seen));

    return arr;
  }

  if (!isPlainObject(value)) return value;

  const out = {};

  try {
    seen.set(value, out);
  } catch {}

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "function") continue;
    out[key] = clonePlain(item, seen);
  }

  return out;
}

function merge(base = {}, override = {}) {
  if (Array.isArray(base) && Array.isArray(override)) {
    return unique([...base, ...override]);
  }

  const out = Array.isArray(base)
    ? clonePlain(base)
    : clonePlain(isPlainObject(base) ? base : {});

  if (!isPlainObject(override) && !Array.isArray(override)) return out;

  if (Array.isArray(out) && Array.isArray(override)) {
    return unique([...out, ...override]);
  }

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined || typeof value === "function") continue;

    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = merge(out[key], value);
      continue;
    }

    if (Array.isArray(value) && Array.isArray(out[key])) {
      out[key] = unique([...out[key], ...value]);
      continue;
    }

    out[key] = clonePlain(value);
  }

  return out;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!isObjectLike(value) || Object.isFrozen(value)) return value;

  try {
    if (seen.has(value)) return value;
    seen.add(value);

    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze(value[key], seen);
    }

    return Object.freeze(value);
  } catch {
    return value;
  }
}

/* =========================================================
   RUNTIME / ENV
========================================================= */

function rootObject() {
  try {
    if (typeof globalThis !== "undefined") return globalThis;
  } catch {}

  try {
    if (typeof window !== "undefined") return window;
  } catch {}

  return {};
}

function baseOrigin() {
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }
  } catch {}

  return "http://localhost";
}

function metaEnv() {
  try {
    return import.meta.env || {};
  } catch {
    return {};
  }
}

function runtimeConfig() {
  const root = rootObject();

  try {
    return isPlainObject(root.__ONION_CONFIG__) ? root.__ONION_CONFIG__ : {};
  } catch {
    return {};
  }
}

function envValue(keys = [], fallback = "") {
  const names = Array.isArray(keys) ? keys : [keys];
  const runtime = runtimeConfig();
  const env = metaEnv();
  const root = rootObject();

  for (const key of names) {
    const clean = text(key, "");
    if (!clean) continue;

    if (runtime[clean] !== undefined && runtime[clean] !== null && runtime[clean] !== "") {
      return runtime[clean];
    }

    if (env[clean] !== undefined && env[clean] !== null && env[clean] !== "") {
      return env[clean];
    }

    try {
      if (root[clean] !== undefined && root[clean] !== null && root[clean] !== "") {
        return root[clean];
      }
    } catch {}
  }

  return fallback;
}

function isProduction(env = "") {
  const clean = text(env, "").toLowerCase();
  return clean === "production" || clean === "prod";
}

/* =========================================================
   PATHS
========================================================= */

function isHashRouterPath(value = "") {
  const raw = text(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = text(value, "");
  if (!raw) return "/";
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
  return raw.replace(/^#\/?/, "/") || "/";
}

function normalizePathname(pathname = "/") {
  let value = text(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const stack = [];

  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;

    if (segment === "..") {
      stack.pop();
      continue;
    }

    stack.push(segment);
  }

  value = `/${stack.join("/")}` || "/";

  return value.length > 1 ? value.replace(/\/+$/g, "") || "/" : value;
}

function pathFromUrlLike(value = "") {
  const raw = text(value, "");
  if (!raw) return "";

  if (isHashRouterPath(raw)) return normalizeHashRouterPath(raw);

  try {
    const parsed = new URL(raw, baseOrigin());

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return raw;
  }
}

function normalizePath(path = "/") {
  const raw = pathFromUrlLike(path) || "/";

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

  return `${normalizePathname(pathname)}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  return normalizePath(path).split("?")[0].split("#")[0] || "/";
}

function normalizePathList(list = []) {
  return unique(toArray(list).flat().map(stripSearchAndHash).filter(Boolean));
}

function normalizeMap(map = {}, normalizer = (value) => value) {
  if (!isPlainObject(map)) return {};

  const out = {};

  for (const [key, value] of Object.entries(map)) {
    const cleanKey = text(key, "");
    if (!cleanKey) continue;

    const cleanValue = normalizer(value);

    if (!cleanValue) continue;

    out[cleanKey] = cleanValue;
  }

  return out;
}

function pathMatches(path = "", candidate = "") {
  const cleanPath = stripSearchAndHash(path);
  const cleanCandidate = stripSearchAndHash(candidate);

  if (!cleanCandidate) return false;
  if (cleanCandidate === "/") return cleanPath === "/";

  return cleanPath === cleanCandidate || cleanPath.startsWith(`${cleanCandidate}/`);
}

function isPrivateMePath(path = "") {
  return PRIVATE_ME_PATHS.includes(stripSearchAndHash(path));
}

/* =========================================================
   API BASE
========================================================= */

function originFromUrl(value = "") {
  const raw = text(value, "");
  if (!raw) return "";

  try {
    return new URL(raw, baseOrigin()).origin;
  } catch {
    return "";
  }
}

function normalizeBaseUrl(value = "") {
  const raw = text(value, "");
  if (!raw || raw === "/") return "";
  return raw.replace(/\/+$/g, "");
}

function normalizeAbsoluteApiBase(value = "") {
  const raw = text(value, "");
  if (!raw) return "";

  try {
    const parsed = new URL(raw);

    if (!["http:", "https:"].includes(parsed.protocol)) return "";

    const origin = parsed.origin.replace(/\/+$/g, "");
    const pathname = normalizePathname(parsed.pathname || "/");

    if (pathname === "/" || pathname === "/api") return origin;
    if (CANONICAL_BACKEND_API_ORIGINS.includes(origin)) return origin;

    return `${origin}${pathname}`.replace(/\/+$/g, "");
  } catch {
    return "";
  }
}

function isForbiddenFrontendApiBase(value = "") {
  const origin = originFromUrl(value);
  return Boolean(origin && FORBIDDEN_FRONTEND_API_ORIGINS.includes(origin));
}

function isCanonicalBackendApiOrigin(value = "") {
  const origin = originFromUrl(value);
  return Boolean(origin && CANONICAL_BACKEND_API_ORIGINS.includes(origin));
}

function normalizeApiBase(value = "", { env = "production", fallback = "" } = {}) {
  if (isProduction(env)) return CANONICAL_PRODUCTION_API_BASE;

  const raw = normalizeBaseUrl(value);
  const safeFallback = normalizeBaseUrl(fallback);

  if (!raw) return safeFallback;
  if (isForbiddenFrontendApiBase(raw)) return safeFallback;

  if (/^https?:\/\//i.test(raw)) {
    return normalizeAbsoluteApiBase(raw) || safeFallback;
  }

  if (raw === "/api" || raw === "api") return "";

  return raw.replace(/\/+$/g, "");
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeStoragePrefix(value = "onion") {
  return text(value, "onion")
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .replace(/^:+|:+$/g, "") || "onion";
}

function normalizeLang(value = "es") {
  const raw = text(value, "es").toLowerCase().replace(/_/g, "-");
  const first = raw.split("-")[0] || raw;

  if (["spa", "spanish", "castellano", "español"].includes(first)) return "es";
  if (["eng", "english"].includes(first)) return "en";
  if (["cat", "catalan", "català", "catalán"].includes(first)) return "ca";

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(raw) ? raw : "es";
}

function normalizeTheme(value = "dark") {
  return text(value, "dark").toLowerCase() === "light" ? "light" : "dark";
}

function normalizePublicApiList(list = []) {
  return normalizePathList(list).filter((path) => !isPrivateMePath(path));
}

function pickRuntimeOverrides(runtime = {}) {
  if (!isPlainObject(runtime)) return {};

  const allowed = new Set([
    "appName",
    "name",
    "appId",
    "appKey",
    "version",
    "env",
    "environment",
    "debug",

    "apiBase",
    "apiOrigin",
    "apiUrl",

    "requestTimeout",
    "requestRetries",
    "requestRetryDelayMs",
    "requestRetryMaxDelayMs",
    "requestRetryMethods",

    "defaultLang",
    "fallbackLang",
    "defaultTheme",
    "storagePrefix",

    "routes",
    "routeAliases",
    "publicRoutes",
    "authLikeRoutes",
    "technicalPublicRoutes",
    "protectedPublicTokenRoutes",

    "storageKeys",
    "legacyStorageKeys",
    "publicApiPaths",
    "privateApiPaths",

    "api",
    "auth",
    "ui",
    "i18n",
    "router",
    "loader",
    "events",
    "featureFlags",
    "diagnostics",
    "resources",
    "security",
  ]);

  const out = {};

  for (const [key, value] of Object.entries(runtime)) {
    if (!allowed.has(key) || value === undefined || typeof value === "function") continue;
    out[key] = value;
  }

  return isPlainObject(runtime.override)
    ? merge(out, runtime.override)
    : out;
}

/* =========================================================
   ENV VALUES
========================================================= */

const runtime = runtimeConfig();

const APP_NAME = text(
  envValue(["ONION_APP_NAME", "VITE_ONION_APP_NAME", "APP_NAME"], runtime.appName || runtime.name || "Onion Support"),
  "Onion Support"
);

const APP_VERSION = text(
  envValue(["ONION_APP_VERSION", "VITE_ONION_APP_VERSION", "APP_VERSION"], runtime.version || "2.1.0"),
  "2.1.0"
);

const APP_ENV = text(
  envValue(["ONION_ENV", "VITE_ONION_ENV", "NODE_ENV", "APP_ENV"], runtime.env || runtime.environment || "production"),
  "production"
).toLowerCase();

const DEBUG = bool(
  envValue(["ONION_DEBUG", "VITE_ONION_DEBUG", "APP_DEBUG"], runtime.debug ?? false),
  false
);

const APP_ID = normalizeStoragePrefix(
  envValue(["ONION_APP_ID", "VITE_ONION_APP_ID", "APP_ID"], runtime.appId || runtime.appKey || "onion")
);

const STORAGE_PREFIX = normalizeStoragePrefix(
  envValue(["ONION_STORAGE_PREFIX", "VITE_ONION_STORAGE_PREFIX", "APP_STORAGE_PREFIX"], runtime.storagePrefix || runtime.appKey || runtime.appId || APP_ID)
);

const RAW_API_BASE = envValue(
  [
    "ONION_API_BASE",
    "ONION_API_ORIGIN",
    "ONION_API_URL",
    "VITE_ONION_API_BASE",
    "VITE_ONION_API_ORIGIN",
    "VITE_ONION_API_URL",
    "VITE_API_BASE",
    "VITE_API_ORIGIN",
    "VITE_API_URL",
    "API_BASE",
    "API_ORIGIN",
    "API_URL",
    "PUBLIC_API_ORIGIN",
  ],
  runtime.apiBase ||
    runtime.apiOrigin ||
    runtime.apiUrl ||
    runtime.api?.base ||
    runtime.api?.baseUrl ||
    runtime.api?.origin ||
    ""
);

const API_BASE = normalizeApiBase(RAW_API_BASE, {
  env: APP_ENV,
  fallback: isProduction(APP_ENV) ? CANONICAL_PRODUCTION_API_BASE : "",
});

/* =========================================================
   ROUTES
========================================================= */

const ROUTES = Object.freeze({
  home: "/",
  login: "/login",
  logout: "/logout",
  forbidden: "/403",
  notFound: "/404",

  incidencias: "/incidencias",
  facturas: "/facturas",
  usuarios: "/usuarios",
  clientes: "/clientes",
  cuenta: "/cuenta",
  ajustes: "/ajustes",
  servidor: "/servidor",

  activateAccount: "/activate-account",

  resetPassword: "/reset-password",
  resetPasswordConfirm: "/reset-password/confirm",
  forgotPassword: "/forgot-password",
  recoverPassword: "/recover-password",
  passwordReset: "/password-reset",

  twoFactor: "/2fa",
  otp: "/otp",
  mfa: "/mfa",
});

const ROUTE_ALIASES = Object.freeze({
  "/home": ROUTES.home,
  "/dashboard": ROUTES.home,
  "/panel": ROUTES.home,

  "/tickets": ROUTES.incidencias,
  "/ticket": ROUTES.incidencias,
  "/incidents": ROUTES.incidencias,
  "/incident": ROUTES.incidencias,

  "/invoices": ROUTES.facturas,
  "/invoice": ROUTES.facturas,
  "/billing": ROUTES.facturas,

  "/users": ROUTES.usuarios,
  "/user": ROUTES.usuarios,

  "/clients": ROUTES.clientes,
  "/client": ROUTES.clientes,
  "/customers": ROUTES.clientes,
  "/customer": ROUTES.clientes,

  "/account": ROUTES.cuenta,
  "/profile": ROUTES.cuenta,

  "/settings": ROUTES.ajustes,
  "/config": ROUTES.ajustes,

  "/server": ROUTES.servidor,

  "/activate": ROUTES.activateAccount,
  "/activation": ROUTES.activateAccount,

  "/forgot": ROUTES.forgotPassword,
  "/recover": ROUTES.recoverPassword,
  "/reset": ROUTES.resetPassword,
  "/reset-confirm": ROUTES.resetPasswordConfirm,
  "/reset-password-confirm": ROUTES.resetPasswordConfirm,
  "/password-reset/confirm": ROUTES.resetPasswordConfirm,

  "/2-factor": ROUTES.twoFactor,
  "/two-factor": ROUTES.twoFactor,
});

const PUBLIC_ROUTES = Object.freeze(normalizePathList([
  ROUTES.login,
  ROUTES.activateAccount,
  ROUTES.resetPassword,
  ROUTES.resetPasswordConfirm,
  ROUTES.forgotPassword,
  ROUTES.recoverPassword,
  ROUTES.passwordReset,
  ROUTES.twoFactor,
  ROUTES.otp,
  ROUTES.mfa,
  ROUTES.forbidden,
  ROUTES.notFound,
]));

const AUTH_LIKE_ROUTES = Object.freeze(normalizePathList([
  ROUTES.login,
  ROUTES.activateAccount,
  ROUTES.resetPassword,
  ROUTES.resetPasswordConfirm,
  ROUTES.forgotPassword,
  ROUTES.recoverPassword,
  ROUTES.passwordReset,
  ROUTES.twoFactor,
  ROUTES.otp,
  ROUTES.mfa,
]));

const TECHNICAL_PUBLIC_ROUTES = Object.freeze(normalizePathList([
  ROUTES.activateAccount,
  ROUTES.resetPassword,
  ROUTES.resetPasswordConfirm,
  ROUTES.forgotPassword,
  ROUTES.recoverPassword,
  ROUTES.passwordReset,
  ROUTES.twoFactor,
  ROUTES.otp,
  ROUTES.mfa,
]));

const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ROUTES.activateAccount,
    windowKey: "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    windowKeys: ["__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__"],
    stateUrlKey: "bootActivationInitialUrl",
    statePathKey: "bootActivationInitialPath",
    statePublicPathKey: "bootActivationInitialPublicPath",
    stateIsRouteKey: "bootIsActivation",
    stateHasTokenKey: "bootHasActivationToken",
    scrubbedStateKeys: [
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
    ],
    scrubbedHistoryKeys: [
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ],
    tokenParamNames: [
      "token",
      "activationToken",
      "activateToken",
      "activation_token",
      "activate_token",
      "code",
      "t",
    ],
  }),

  Object.freeze({
    key: "resetConfirm",
    path: ROUTES.resetPasswordConfirm,
    windowKey: "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
    windowKeys: [
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ],
    stateUrlKey: "bootResetConfirmInitialUrl",
    statePathKey: "bootResetConfirmInitialPath",
    statePublicPathKey: "bootResetConfirmInitialPublicPath",
    stateIsRouteKey: "bootIsResetConfirm",
    stateHasTokenKey: "bootHasResetToken",
    scrubbedStateKeys: [
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedResetPasswordToken",
    ],
    scrubbedHistoryKeys: [
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedResetPasswordToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
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
  }),
]);

/* =========================================================
   STORAGE
========================================================= */

const STORAGE_KEYS = Object.freeze({
  token: "token",
  accessToken: "access_token",
  access_token: "access_token",

  refreshToken: "refresh_token",
  refresh_token: "refresh_token",

  tempToken: "temp_token",
  temp_token: "temp_token",

  session: "session",
  sessionData: "session_data",
  sessionId: "session_id",
  sessionUserId: "session_user_id",

  user: "user",
  currentUser: "current_user",
  authUser: "auth_user",
  sessionUser: "session_user",

  role: "role",
  userRole: "user_role",
  roles: "roles",

  theme: "theme",
  themeMode: "theme_mode",
  appearance: "appearance",

  lang: "lang",
  language: "language",
  locale: "locale",

  sidebarOpen: "sidebar_open",
  sidebarCollapsed: "sidebar_collapsed",

  lastRoute: "last_route",
  lastPublicPath: "last_public_path",
  postLoginTarget: "post_login_target",
  redirectAfterLogin: "redirect_after_login",
  authContext: "auth_context",

  preferences: "preferences",
  settings: "settings",
  ui: "ui",
});

const LEGACY_STORAGE_KEYS = Object.freeze({
  token: "onion_token",
  accessToken: "onion_access_token",
  refreshToken: "onion_refresh_token",
  tempToken: "onion_temp_token",

  user: "onion_user",
  userId: "onion_user_id",
  userSlug: "onion_user_slug",
  userName: "onion_user_name",
  username: "onion_username",
  role: "onion_role",

  sessionId: "onion_session_id",
  sessionUserId: "onion_session_user_id",

  theme: "onion_theme",
  lang: "onion_lang",
  postLoginTarget: "onion_post_login_target",
});

/* =========================================================
   AUTH / API
========================================================= */

const AUTH_ENDPOINTS = Object.freeze({
  login: "/api/auth/login",

  logout: "/api/auth/logout",
  logoutAll: "/api/auth/logout-all",

  me: "/api/auth/me",
  profile: "/api/auth/me",
  currentUser: "/api/auth/me",
  current: "/api/auth/me",
  session: "/api/auth/me",

  refresh: "/api/auth/refresh",
  refreshSession: "/api/auth/refresh",
  tokenRefresh: "/api/auth/refresh",
  renew: "/api/auth/refresh",

  activate: "/api/auth/activate",
  activateAccount: "/api/auth/activate",
  activation: "/api/auth/activate",
  accountActivation: "/api/auth/activate",
  createUserActivation: "/api/auth/activate",
  confirmActivation: "/api/auth/activate",

  activateAccountLegacy: "/api/auth/activate-account",
  activationLegacy: "/api/auth/activate-account",

  activateFirstUser: "/api/auth/activate/first-user",
  firstUserActivation: "/api/auth/activate/first-user",

  validateActivationToken: "/api/auth/activate/validate",
  activationValidate: "/api/auth/activate/validate",
  validateActivateAccount: "/api/auth/activate/validate",

  requestPasswordReset: "/api/auth/reset-password-request",
  resetPasswordRequest: "/api/auth/reset-password-request",
  forgotPassword: "/api/auth/reset-password-request",
  recoverPassword: "/api/auth/reset-password-request",
  passwordResetRequest: "/api/auth/reset-password-request",

  confirmPasswordReset: "/api/auth/reset-password-confirm",
  confirmResetPassword: "/api/auth/reset-password-confirm",
  resetPasswordConfirm: "/api/auth/reset-password-confirm",
  passwordResetConfirm: "/api/auth/reset-password-confirm",

  validateResetToken: "/api/auth/reset-password/validate",
  resetPasswordValidate: "/api/auth/reset-password/validate",
  validatePasswordReset: "/api/auth/reset-password/validate",
  passwordResetValidate: "/api/auth/reset-password/validate",

  twoFactorLogin: "/api/auth/2fa/login",
  login2fa: "/api/auth/2fa/login",
  twoFactorVerify: "/api/auth/2fa/login",
  verify2FA: "/api/auth/2fa/login",

  mfaLogin: "/api/auth/mfa/login",
  verifyMfa: "/api/auth/mfa/login",

  twoFactorRequest: "/api/auth/2fa/request",
  request2FA: "/api/auth/2fa/request",
  requestMfa: "/api/auth/mfa/request",

  twoFactorResend: "/api/auth/2fa/resend",
  resend2FA: "/api/auth/2fa/resend",
  resendMfa: "/api/auth/mfa/resend",

  health: "/api/auth/_health",
  authHealth: "/api/auth/_health",
});

const AUTH_ENDPOINT_CANDIDATES = Object.freeze({
  login: ["/api/auth/login"],
  logout: ["/api/auth/logout"],

  me: ["/api/auth/me", "/auth/me", "/api/me", "/me"],
  refresh: ["/api/auth/refresh"],

  activateAccount: ["/api/auth/activate", "/api/auth/activate-account"],
  activateFirstUser: ["/api/auth/activate/first-user"],
  validateActivationToken: [
    "/api/auth/activate/validate",
    "/api/auth/activation/validate",
    "/api/auth/activate-account/validate",
  ],

  requestPasswordReset: [
    "/api/auth/reset-password-request",
    "/api/auth/forgot-password",
    "/api/auth/password-reset/request",
    "/api/auth/reset-password/request",
  ],
  confirmPasswordReset: [
    "/api/auth/reset-password-confirm",
    "/api/auth/reset-password/confirm",
    "/api/auth/password-reset/confirm",
  ],
  validateResetToken: [
    "/api/auth/reset-password/validate",
    "/api/auth/reset-password-validate",
    "/api/auth/password-reset/validate",
  ],

  twoFactorLogin: [
    "/api/auth/2fa/login",
    "/api/auth/mfa/login",
    "/api/auth/2fa/verify",
    "/api/auth/mfa/verify",
  ],
  twoFactorRequest: [
    "/api/auth/2fa/request",
    "/api/auth/mfa/request",
  ],
  twoFactorResend: [
    "/api/auth/2fa/resend",
    "/api/auth/mfa/resend",
  ],

  health: [
    "/api/auth/_health",
    "/api/auth/health",
    "/api/health",
    "/api/health/ready",
    "/api/_health",
    "/health",
  ],
});

const PUBLIC_API_PATHS = Object.freeze(normalizePublicApiList([
  AUTH_ENDPOINTS.login,
  AUTH_ENDPOINTS.refresh,

  ...AUTH_ENDPOINT_CANDIDATES.activateAccount,
  ...AUTH_ENDPOINT_CANDIDATES.activateFirstUser,
  ...AUTH_ENDPOINT_CANDIDATES.validateActivationToken,

  ...AUTH_ENDPOINT_CANDIDATES.requestPasswordReset,
  ...AUTH_ENDPOINT_CANDIDATES.confirmPasswordReset,
  ...AUTH_ENDPOINT_CANDIDATES.validateResetToken,

  ...AUTH_ENDPOINT_CANDIDATES.twoFactorLogin,
  ...AUTH_ENDPOINT_CANDIDATES.twoFactorRequest,
  ...AUTH_ENDPOINT_CANDIDATES.twoFactorResend,

  ...AUTH_ENDPOINT_CANDIDATES.health,
]));

const PRIVATE_API_PATHS = Object.freeze(normalizePathList([
  ...PRIVATE_ME_PATHS,

  AUTH_ENDPOINTS.logout,
  AUTH_ENDPOINTS.logoutAll,

  "/api/auth/2fa/setup",
  "/api/auth/2fa/confirm",
  "/api/auth/2fa/disable",
  "/api/auth/change-password",

  "/api/users",
  "/api/usuarios",
  "/api/clientes",
  "/api/clients",
  "/api/tickets",
  "/api/incidencias",
  "/api/facturas",
  "/api/invoices",
  "/api/search",
]));

function endpointGroups(candidates = AUTH_ENDPOINT_CANDIDATES, endpoints = AUTH_ENDPOINTS, publicPaths = PUBLIC_API_PATHS, privatePaths = PRIVATE_API_PATHS) {
  const controlSkipRefresh = normalizePublicApiList([
    endpoints.login,
    endpoints.refresh,
    endpoints.logout,

    ...(candidates.activateAccount || []),
    ...(candidates.activateFirstUser || []),
    ...(candidates.validateActivationToken || []),

    ...(candidates.requestPasswordReset || []),
    ...(candidates.confirmPasswordReset || []),
    ...(candidates.validateResetToken || []),

    ...(candidates.twoFactorLogin || []),
    ...(candidates.twoFactorRequest || []),
    ...(candidates.twoFactorResend || []),

    ...(candidates.health || []),
  ]);

  return {
    public: normalizePublicApiList(publicPaths),
    private: normalizePathList([...privatePaths, ...PRIVATE_ME_PATHS]),
    controlSkipRefresh,
    session: normalizePathList([endpoints.login, endpoints.logout, endpoints.me, endpoints.refresh]),
    activation: normalizePathList([
      ...(candidates.activateAccount || []),
      ...(candidates.activateFirstUser || []),
      ...(candidates.validateActivationToken || []),
    ]),
    passwordReset: normalizePathList([
      ...(candidates.requestPasswordReset || []),
      ...(candidates.confirmPasswordReset || []),
      ...(candidates.validateResetToken || []),
    ]),
    twoFactor: normalizePathList([
      ...(candidates.twoFactorLogin || []),
      ...(candidates.twoFactorRequest || []),
      ...(candidates.twoFactorResend || []),
    ]),
  };
}

const AUTH_ENDPOINT_GROUPS = Object.freeze(endpointGroups());

/* =========================================================
   RESOURCE ENDPOINTS
========================================================= */

const RESOURCES = Object.freeze({
  tickets: {
    base: "/api/tickets",
    alias: "/api/incidencias",
    list: "/api/tickets",
    stats: "/api/tickets/stats",
    detail: "/api/tickets/:id",
    create: "/api/tickets",
    update: "/api/tickets/:id",
    comments: "/api/tickets/:id/comments",
    attachments: "/api/tickets/:id/attachments",
    files: "/api/tickets/:id/files",
  },

  incidencias: {
    base: "/api/tickets",
    alias: "/api/incidencias",
    list: "/api/tickets",
    stats: "/api/tickets/stats",
    detail: "/api/tickets/:id",
    create: "/api/tickets",
    update: "/api/tickets/:id",
  },

  facturas: {
    base: "/api/facturas",
    alias: "/api/invoices",
    list: "/api/facturas",
    stats: "/api/facturas/stats",
    detail: "/api/facturas/:id",
    create: "/api/facturas",
    viewPdf: "/api/facturas/:id/view",
    download: "/api/facturas/:id/download",
    send: "/api/facturas/:id/send",
  },

  clientes: {
    base: "/api/clientes",
    alias: "/api/clients",
    list: "/api/clientes",
    stats: "/api/clientes/stats",
    detail: "/api/clientes/:id",
    create: "/api/clientes",
    update: "/api/clientes/:id",
  },

  usuarios: {
    base: "/api/users",
    alias: "/api/usuarios",
    list: "/api/users",
    stats: "/api/users/stats",
    detail: "/api/users/:id",
    create: "/api/users",
    update: "/api/users/:id",
  },

  users: {
    base: "/api/users",
    alias: "/api/usuarios",
    list: "/api/users",
    stats: "/api/users/stats",
    detail: "/api/users/:id",
    create: "/api/users",
    update: "/api/users/:id",
  },

  search: {
    base: "/api/search",
    global: "/api/search",
    users: "/api/search/users",
    usuarios: "/api/search/usuarios",
    clientes: "/api/search/clientes",
    clients: "/api/search/clients",
    tickets: "/api/search/tickets",
    incidencias: "/api/search/incidencias",
    facturas: "/api/search/facturas",
    health: "/api/search/_health",
  },

  health: {
    base: "/api/health",
    ready: "/api/health/ready",
    live: "/api/health/live",
    auth: "/api/auth/_health",
  },
});

/* =========================================================
   BLOCKS
========================================================= */

const API = Object.freeze({
  base: API_BASE,
  baseUrl: API_BASE,
  origin: API_BASE,
  sameOrigin: !API_BASE,

  canonicalProductionBase: CANONICAL_PRODUCTION_API_BASE,
  canonicalBackendOrigins: CANONICAL_BACKEND_API_ORIGINS,
  forbiddenFrontendOrigins: FORBIDDEN_FRONTEND_API_ORIGINS,

  prefix: "/api",

  timeout: number(runtime.requestTimeout ?? runtime.api?.timeout, 30000),
  retries: number(runtime.requestRetries ?? runtime.api?.retries, 0),
  retryDelayMs: number(runtime.requestRetryDelayMs ?? runtime.api?.retryDelayMs, 350),
  retryMaxDelayMs: number(runtime.requestRetryMaxDelayMs ?? runtime.api?.retryMaxDelayMs, 4000),
  retryMethods: unique(toArray(runtime.requestRetryMethods ?? runtime.api?.retryMethods ?? ["GET", "HEAD", "OPTIONS"]).map((item) => text(item).toUpperCase())),
  withCredentials: bool(runtime.withCredentials ?? runtime.api?.withCredentials, true),

  publicPaths: PUBLIC_API_PATHS,
  privatePaths: PRIVATE_API_PATHS,

  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

const AUTH = Object.freeze({
  bearerPrefix: "Bearer",
  tokenHeader: "Authorization",

  tokenStorageKey: STORAGE_KEYS.token,
  accessTokenStorageKey: STORAGE_KEYS.accessToken,
  refreshTokenStorageKey: STORAGE_KEYS.refreshToken,
  tempTokenStorageKey: STORAGE_KEYS.tempToken,
  sessionIdStorageKey: STORAGE_KEYS.sessionId,
  sessionUserIdStorageKey: STORAGE_KEYS.sessionUserId,

  loginRoute: ROUTES.login,
  logoutRoute: ROUTES.logout,
  homeRoute: ROUTES.home,
  postLoginFallback: ROUTES.home,

  allowedRoles: ["admin", "user"],

  roleAliases: {
    admin: "admin",
    administrator: "admin",
    administrador: "admin",
    superadmin: "admin",
    super_admin: "admin",
    "super-admin": "admin",
    owner: "admin",
    root: "admin",

    user: "user",
    usuario: "user",
    client: "user",
    cliente: "user",
    customer: "user",
  },

  endpoints: AUTH_ENDPOINTS,
  endpointCandidates: AUTH_ENDPOINT_CANDIDATES,
  endpointGroups: AUTH_ENDPOINT_GROUPS,

  publicApiPaths: PUBLIC_API_PATHS,
  privateApiPaths: PRIVATE_API_PATHS,

  technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
  publicTechnicalRoutes: TECHNICAL_PUBLIC_ROUTES,
  protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,

  tokenParamNames: {
    generic: ["token", "code", "t"],

    auth: [
      "token",
      "accessToken",
      "access_token",
      "authToken",
      "auth_token",
      "jwt",
      "idToken",
      "id_token",
      "code",
      "t",
    ],

    refresh: [
      "refreshToken",
      "refresh_token",
      "token",
      "code",
      "t",
    ],

    activation: [
      "token",
      "activationToken",
      "activateToken",
      "activation_token",
      "activate_token",
      "code",
      "t",
    ],

    reset: [
      "token",
      "resetToken",
      "passwordResetToken",
      "confirmToken",
      "reset_token",
      "password_reset_token",
      "confirm_token",
      "code",
      "t",
    ],

    twoFactor: [
      "tempToken",
      "temp_token",
      "temporaryToken",
      "temporary_token",
      "challengeToken",
      "challenge_token",
      "twoFactorToken",
      "two_factor_token",
      "mfaToken",
      "mfa_token",
      "otpToken",
      "otp_token",
      "code",
      "otp",
      "totp",
    ],
  },

  session: {
    restoreOnBoot: true,
    refreshOnBoot: true,
    clearInvalidSession: true,
    persistUser: true,
    persistToken: true,
    allowRefreshContext: true,

    requireTokenForAuthenticated: true,
    allowTechnicalAuthenticatedWithoutUser: false,
    clearGhostUserWithoutToken: true,
    syncUserUiAfterRestore: true,
  },
});

const UI = Object.freeze({
  defaultTheme: "dark",
  theme: "dark",
  themeColorDark: "#0a0c11",
  themeColorLight: "#f4f7fb",
  density: "default",

  shellId: "app-shell",
  loaderId: "app-loader",
  sidebarMountId: "sidebar-mount",
  topbarMountId: "topbar-mount",
  viewContainerId: "view-container",
  mainContentId: "main-content",
  appContentId: "app-content",
  sidebarId: "app-sidebar",
  topbarId: "app-topbar",
  tableheadId: "table-head",
  tableheadContainerId: "tablehead-container",

  useCustomTooltips: true,
  avoidNativeTooltips: true,
  syncUserUIOnAuthChange: true,
  syncUserUIOnLangChange: true,
  syncUserUIOnThemeChange: true,
});

const I18N = Object.freeze({
  defaultLang: "es",
  fallbackLang: "es",
  supported: ["es", "en", "ca"],
  storageKey: STORAGE_KEYS.lang,
  liveRefresh: true,
  eventName: "app:lang:change",
});

const ROUTER = Object.freeze({
  mode: "history",
  base: "/",

  defaultRoute: ROUTES.home,
  loginRoute: ROUTES.login,
  logoutRoute: ROUTES.logout,
  notFoundRoute: ROUTES.notFound,
  forbiddenRoute: ROUTES.forbidden,

  preserveTechnicalPublicUrls: true,
  bindAfterInitialRender: true,
  stripUsernamePrefix: true,
  usernamePrefix: "@",
  emitRenderEvents: true,
  useHistoryFallback: true,
  safeExternalLinks: true,

  routes: ROUTES,
  routeAliases: ROUTE_ALIASES,
  publicRoutes: PUBLIC_ROUTES,
  authLikeRoutes: AUTH_LIKE_ROUTES,
  technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
  protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,

  events: {
    beforeRender: "router:before-render",
    rendered: "router:rendered",
    asyncComplete: "router:render:async-complete",
    navigationComplete: "router:navigation:complete",
    shellState: "router:shell:state",
  },
});

const LOADER = Object.freeze({
  staticLoaderId: "app-loader",
  minVisibleMs: 500,
  failsafeMs: 2500,

  bootClass: "app-booting",
  loadingClass: "app-loading",
  readyClass: "app-ready",
  fatalClass: "app-fatal",

  hiddenClass: "is-hidden",
  visibleClass: "is-visible",
  leavingClass: "is-leaving",

  controlledByBootstrap: true,
  hideOnlyOnFinalize: true,
  updateBodyState: true,
  updateHtmlState: true,
});

const EVENTS = Object.freeze({
  ready: "app:ready",

  bootStart: "app:boot:start",
  bootReady: "app:boot:ready",
  bootComplete: "app:boot:complete",
  bootError: "app:boot:error",

  coreInitStart: "app:core:init:start",
  coreReady: "app:core:ready",
  coreInitError: "app:core:init:error",

  stateChange: "app:state:change",
  routeChange: "app:route:change",
  publicPathChange: "app:public-path:change",
  userChange: "app:user:change",
  tokenChange: "app:token:change",
  authChange: "app:auth:change",
  langChange: "app:lang:change",
  themeChange: "app:theme:change",

  sessionRestored: "app:session:restored",
  sessionApplied: "app:session:applied",
  sessionLoaded: "app:session:loaded",
  sessionCleared: "app:session:cleared",
});

const FEATURE_FLAGS = Object.freeze({
  restoreSessionOnBoot: true,
  renderPublicTokenRouteBeforeRestore: true,

  preserveActivationUrl: true,
  preserveResetConfirmUrl: true,

  bindRouterAfterFirstRender: true,
  enableBootFailsafe: true,
  enableNetworkEvents: true,
  enableToastBridge: true,

  enableShellSnapshots: true,
  enableDebugSnapshots: true,

  clearGhostUserWithoutToken: true,
  requireAuthorizationForMe: true,
  keepMeEndpointPrivate: true,

  enableRequestDedupe: true,
  enableRequestRetry: true,
  enableRequestAbort: true,

  enableRuntimeConfig: true,
  forceCanonicalProductionApiBase: true,
});

const DIAGNOSTICS = Object.freeze({
  enabled: DEBUG,
  logPrefix: "[Onion]",
  redactTokens: true,

  emitSnapshots: true,
  maxRecentErrors: 12,
  maxRecentEvents: 25,

  exposeDebugBridge: true,

  requestLifecycleEvents: false,
  requestRetryEvents: false,
  requestDedupeEvents: false,
});

const SECURITY = Object.freeze({
  privateSpa: true,
  noIndex: true,
  redactTokens: true,

  preserveTechnicalTokenUrlUntilViewCapture: true,
  allowHashRouterTokenRoutes: true,

  canonicalProductionApiBase: CANONICAL_PRODUCTION_API_BASE,
  canonicalBackendApiOrigins: CANONICAL_BACKEND_API_ORIGINS,
  forbiddenFrontendApiOrigins: FORBIDDEN_FRONTEND_API_ORIGINS,

  unsafeHrefProtocols: ["javascript:", "data:", "vbscript:"],

  sensitiveQueryParams: [
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
    "otpToken",
    "otp_token",
  ],
});

/* =========================================================
   FINAL NORMALIZATION
========================================================= */

function normalizeProtectedTokenRoutes(list = []) {
  const out = [];
  const seen = new Set();

  for (const item of toArray(list)) {
    if (!isPlainObject(item)) continue;

    const key = text(item.key, "");
    const path = stripSearchAndHash(item.path || "");

    if (!key || !path) continue;

    const dedupe = `${key}:${path}`;
    if (seen.has(dedupe)) continue;

    seen.add(dedupe);

    const windowKeys = unique([...toArray(item.windowKeys), item.windowKey]);

    out.push({
      ...item,
      key,
      path,
      windowKey: item.windowKey || windowKeys[0] || "",
      windowKeys,
      tokenParamNames: unique(item.tokenParamNames || []),
      scrubbedStateKeys: unique(item.scrubbedStateKeys || []),
      scrubbedHistoryKeys: unique(item.scrubbedHistoryKeys || []),
    });
  }

  return out;
}

function normalizeEndpoints(endpoints = {}) {
  const out = isPlainObject(endpoints) ? { ...endpoints } : {};

  out.me = "/api/auth/me";
  out.profile = "/api/auth/me";
  out.currentUser = "/api/auth/me";
  out.current = "/api/auth/me";
  out.session = "/api/auth/me";

  out.activate = "/api/auth/activate";
  out.activateAccount = "/api/auth/activate";
  out.activation = "/api/auth/activate";
  out.accountActivation = "/api/auth/activate";
  out.createUserActivation = "/api/auth/activate";
  out.confirmActivation = "/api/auth/activate";

  out.activateAccountLegacy = "/api/auth/activate-account";
  out.activationLegacy = "/api/auth/activate-account";

  return Object.fromEntries(
    Object.entries(out)
      .map(([key, value]) => [key, stripSearchAndHash(value || "")])
      .filter(([, value]) => Boolean(value))
  );
}

function normalizeCandidates(candidates = {}) {
  const source = merge(AUTH_ENDPOINT_CANDIDATES, isPlainObject(candidates) ? candidates : {});
  const out = {};

  for (const [key, value] of Object.entries(source)) {
    out[key] = normalizePathList(value);
  }

  out.me = normalizePathList(["/api/auth/me", "/auth/me", "/api/me", "/me"]);
  out.activateAccount = normalizePathList([
    "/api/auth/activate",
    "/api/auth/activate-account",
    ...(out.activateAccount || []),
  ]);

  return out;
}

function buildBaseConfig() {
  return {
    __version: CONFIG_VERSION,

    appName: APP_NAME,
    name: APP_NAME,

    appId: APP_ID,
    appKey: STORAGE_PREFIX,

    version: APP_VERSION,
    env: APP_ENV,
    environment: APP_ENV,
    debug: DEBUG,

    apiBase: API_BASE,
    apiOrigin: API_BASE,
    apiUrl: API_BASE,

    canonicalProductionApiBase: CANONICAL_PRODUCTION_API_BASE,
    canonicalBackendApiOrigins: CANONICAL_BACKEND_API_ORIGINS,
    forbiddenFrontendApiOrigins: FORBIDDEN_FRONTEND_API_ORIGINS,

    publicApiPaths: PUBLIC_API_PATHS,
    privateApiPaths: PRIVATE_API_PATHS,

    requestTimeout: API.timeout,
    requestRetries: API.retries,
    requestRetryDelayMs: API.retryDelayMs,
    requestRetryMaxDelayMs: API.retryMaxDelayMs,
    requestRetryMethods: API.retryMethods,

    defaultLang: I18N.defaultLang,
    fallbackLang: I18N.fallbackLang,
    defaultTheme: UI.defaultTheme,

    storagePrefix: STORAGE_PREFIX,
    storageKeys: STORAGE_KEYS,
    legacyStorageKeys: LEGACY_STORAGE_KEYS,

    routes: ROUTES,
    routeAliases: ROUTE_ALIASES,
    publicRoutes: PUBLIC_ROUTES,
    authLikeRoutes: AUTH_LIKE_ROUTES,
    technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
    protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,

    api: API,
    auth: AUTH,
    ui: UI,
    i18n: I18N,
    router: ROUTER,
    loader: LOADER,
    events: EVENTS,
    featureFlags: FEATURE_FLAGS,
    diagnostics: DIAGNOSTICS,
    resources: RESOURCES,
    security: SECURITY,
  };
}

function normalizeFinalConfig(input = {}) {
  const out = merge(buildBaseConfig(), input);

  out.__version = CONFIG_VERSION;

  out.appName = text(out.appName || out.name, APP_NAME);
  out.name = out.appName;

  out.version = text(out.version, APP_VERSION);
  out.env = text(out.env || out.environment, APP_ENV).toLowerCase();
  out.environment = out.env;

  out.debug = bool(out.debug, DEBUG);

  out.appId = normalizeStoragePrefix(out.appId || APP_ID || "onion");
  out.storagePrefix = normalizeStoragePrefix(out.storagePrefix || out.appKey || out.appId || STORAGE_PREFIX);
  out.appKey = out.storagePrefix;

  out.canonicalProductionApiBase = CANONICAL_PRODUCTION_API_BASE;
  out.canonicalBackendApiOrigins = CANONICAL_BACKEND_API_ORIGINS;
  out.forbiddenFrontendApiOrigins = FORBIDDEN_FRONTEND_API_ORIGINS;

  out.apiBase = normalizeApiBase(
    out.apiBase || out.apiOrigin || out.apiUrl || out.api?.base || out.api?.baseUrl || out.api?.origin || API_BASE,
    {
      env: out.env,
      fallback: isProduction(out.env) ? CANONICAL_PRODUCTION_API_BASE : API_BASE,
    }
  );

  out.apiOrigin = out.apiBase;
  out.apiUrl = out.apiBase;

  out.defaultLang = normalizeLang(out.defaultLang || out.i18n?.defaultLang || "es");
  out.fallbackLang = normalizeLang(out.fallbackLang || out.i18n?.fallbackLang || out.defaultLang || "es");
  out.defaultTheme = normalizeTheme(out.defaultTheme || out.ui?.defaultTheme || "dark");

  out.routes = normalizeMap(merge(ROUTES, out.routes || {}), normalizePath);
  out.routeAliases = normalizeMap(merge(ROUTE_ALIASES, out.routeAliases || {}), stripSearchAndHash);

  out.publicRoutes = normalizePathList([
    ...PUBLIC_ROUTES,
    ...(out.publicRoutes || []),
    ...(out.router?.publicRoutes || []),
  ]);

  out.authLikeRoutes = normalizePathList([
    ...AUTH_LIKE_ROUTES,
    ...(out.authLikeRoutes || []),
    ...(out.router?.authLikeRoutes || []),
  ]);

  out.technicalPublicRoutes = normalizePathList([
    ...TECHNICAL_PUBLIC_ROUTES,
    ...(out.technicalPublicRoutes || []),
    ...(out.auth?.technicalPublicRoutes || []),
    ...(out.router?.technicalPublicRoutes || []),
  ]);

  out.protectedPublicTokenRoutes = normalizeProtectedTokenRoutes([
    ...PROTECTED_PUBLIC_TOKEN_ROUTES,
    ...(out.protectedPublicTokenRoutes || []),
    ...(out.auth?.protectedPublicTokenRoutes || []),
    ...(out.router?.protectedPublicTokenRoutes || []),
  ]);

  out.storageKeys = merge(STORAGE_KEYS, out.storageKeys || {});
  out.legacyStorageKeys = merge(LEGACY_STORAGE_KEYS, out.legacyStorageKeys || {});

  out.publicApiPaths = normalizePublicApiList([
    ...PUBLIC_API_PATHS,
    ...(out.publicApiPaths || []),
    ...(out.api?.publicPaths || []),
    ...(out.auth?.publicApiPaths || []),
  ]);

  out.privateApiPaths = normalizePathList([
    ...PRIVATE_API_PATHS,
    ...PRIVATE_ME_PATHS,
    ...(out.privateApiPaths || []),
    ...(out.api?.privatePaths || []),
    ...(out.auth?.privateApiPaths || []),
  ]);

  out.api = merge(API, out.api || {});
  out.api.base = out.apiBase;
  out.api.baseUrl = out.apiBase;
  out.api.origin = out.apiBase;
  out.api.sameOrigin = !out.apiBase;
  out.api.canonicalProductionBase = CANONICAL_PRODUCTION_API_BASE;
  out.api.canonicalBackendOrigins = CANONICAL_BACKEND_API_ORIGINS;
  out.api.forbiddenFrontendOrigins = FORBIDDEN_FRONTEND_API_ORIGINS;
  out.api.publicPaths = out.publicApiPaths;
  out.api.privatePaths = out.privateApiPaths;
  out.api.timeout = number(out.api.timeout, out.requestTimeout || 30000);
  out.api.retries = number(out.api.retries, out.requestRetries || 0);
  out.api.retryDelayMs = number(out.api.retryDelayMs, out.requestRetryDelayMs || 350);
  out.api.retryMaxDelayMs = number(out.api.retryMaxDelayMs, out.requestRetryMaxDelayMs || 4000);
  out.api.retryMethods = unique(toArray(out.api.retryMethods || out.requestRetryMethods || ["GET", "HEAD", "OPTIONS"]).map((item) => text(item).toUpperCase()));
  out.api.withCredentials = bool(out.api.withCredentials, true);

  out.requestTimeout = number(out.requestTimeout, out.api.timeout || 30000);
  out.requestRetries = number(out.requestRetries, out.api.retries || 0);
  out.requestRetryDelayMs = number(out.requestRetryDelayMs, out.api.retryDelayMs || 350);
  out.requestRetryMaxDelayMs = number(out.requestRetryMaxDelayMs, out.api.retryMaxDelayMs || 4000);
  out.requestRetryMethods = out.api.retryMethods;

  out.auth = merge(AUTH, out.auth || {});
  out.auth.publicApiPaths = out.publicApiPaths;
  out.auth.privateApiPaths = out.privateApiPaths;
  out.auth.technicalPublicRoutes = out.technicalPublicRoutes;
  out.auth.publicTechnicalRoutes = out.technicalPublicRoutes;
  out.auth.protectedPublicTokenRoutes = out.protectedPublicTokenRoutes;
  out.auth.endpoints = normalizeEndpoints(out.auth.endpoints);
  out.auth.endpointCandidates = normalizeCandidates(out.auth.endpointCandidates);
  out.auth.endpointGroups = endpointGroups(
    out.auth.endpointCandidates,
    out.auth.endpoints,
    out.publicApiPaths,
    out.privateApiPaths
  );
  out.auth.loginRoute = out.routes.login;
  out.auth.logoutRoute = out.routes.logout;
  out.auth.homeRoute = out.routes.home;
  out.auth.postLoginFallback = out.routes.home;
  out.auth.allowedRoles = ["admin", "user"];
  out.auth.session = merge(AUTH.session, out.auth.session || {});
  out.auth.session.requireTokenForAuthenticated = true;
  out.auth.session.allowTechnicalAuthenticatedWithoutUser = false;
  out.auth.session.clearGhostUserWithoutToken = true;

  out.ui = merge(UI, out.ui || {});
  out.ui.defaultTheme = normalizeTheme(out.ui.defaultTheme || out.defaultTheme);
  out.ui.theme = normalizeTheme(out.ui.theme || out.ui.defaultTheme);

  out.i18n = merge(I18N, out.i18n || {});
  out.i18n.defaultLang = normalizeLang(out.i18n.defaultLang || out.defaultLang);
  out.i18n.fallbackLang = normalizeLang(out.i18n.fallbackLang || out.fallbackLang || out.i18n.defaultLang);
  out.i18n.supported = unique(toArray(out.i18n.supported || ["es", "en", "ca"]).map(normalizeLang));
  out.i18n.storageKey = out.storageKeys.lang;

  out.router = merge(ROUTER, out.router || {});
  out.router.routes = out.routes;
  out.router.routeAliases = out.routeAliases;
  out.router.publicRoutes = out.publicRoutes;
  out.router.authLikeRoutes = out.authLikeRoutes;
  out.router.technicalPublicRoutes = out.technicalPublicRoutes;
  out.router.protectedPublicTokenRoutes = out.protectedPublicTokenRoutes;
  out.router.defaultRoute = out.routes.home;
  out.router.loginRoute = out.routes.login;
  out.router.logoutRoute = out.routes.logout;
  out.router.notFoundRoute = out.routes.notFound;
  out.router.forbiddenRoute = out.routes.forbidden;

  out.loader = merge(LOADER, out.loader || {});
  out.events = merge(EVENTS, out.events || {});
  out.resources = merge(RESOURCES, out.resources || {});

  out.featureFlags = merge(FEATURE_FLAGS, out.featureFlags || {});
  out.featureFlags.requireAuthorizationForMe = true;
  out.featureFlags.keepMeEndpointPrivate = true;
  out.featureFlags.forceCanonicalProductionApiBase = true;
  out.featureFlags.clearGhostUserWithoutToken = true;

  out.diagnostics = merge(DIAGNOSTICS, out.diagnostics || {});
  out.diagnostics.enabled = bool(out.diagnostics.enabled, out.debug);
  out.diagnostics.redactTokens = true;

  out.security = merge(SECURITY, out.security || {});
  out.security.canonicalProductionApiBase = CANONICAL_PRODUCTION_API_BASE;
  out.security.canonicalBackendApiOrigins = CANONICAL_BACKEND_API_ORIGINS;
  out.security.forbiddenFrontendApiOrigins = FORBIDDEN_FRONTEND_API_ORIGINS;
  out.security.redactTokens = true;
  out.security.sensitiveQueryParams = unique([
    ...SECURITY.sensitiveQueryParams,
    ...(out.security.sensitiveQueryParams || []),
  ]);

  /*
    Candados finales. Ningún override puede saltarlos.
  */
  out.apiBase = normalizeApiBase(out.apiBase, {
    env: out.env,
    fallback: isProduction(out.env) ? CANONICAL_PRODUCTION_API_BASE : API_BASE,
  });

  out.apiOrigin = out.apiBase;
  out.apiUrl = out.apiBase;

  out.publicApiPaths = normalizePublicApiList(out.publicApiPaths);
  out.privateApiPaths = normalizePathList([...out.privateApiPaths, ...PRIVATE_ME_PATHS]);

  out.api.base = out.apiBase;
  out.api.baseUrl = out.apiBase;
  out.api.origin = out.apiBase;
  out.api.sameOrigin = !out.apiBase;
  out.api.publicPaths = out.publicApiPaths;
  out.api.privatePaths = out.privateApiPaths;

  out.auth.publicApiPaths = out.publicApiPaths;
  out.auth.privateApiPaths = out.privateApiPaths;
  out.auth.endpoints = normalizeEndpoints(out.auth.endpoints);
  out.auth.endpointCandidates = normalizeCandidates(out.auth.endpointCandidates);
  out.auth.endpointGroups = endpointGroups(
    out.auth.endpointCandidates,
    out.auth.endpoints,
    out.publicApiPaths,
    out.privateApiPaths
  );

  return out;
}

export const config = deepFreeze(
  normalizeFinalConfig(
    merge(buildBaseConfig(), pickRuntimeOverrides(runtime))
  )
);

/* =========================================================
   PUBLIC HELPERS
========================================================= */

export function getConfig() {
  return config;
}

export function getApiBase() {
  return config.apiBase;
}

export function getApiOrigin() {
  return config.apiOrigin || config.apiBase;
}

export function getCanonicalProductionApiBase() {
  return CANONICAL_PRODUCTION_API_BASE;
}

export function isForbiddenFrontendApiOrigin(value = "") {
  return isForbiddenFrontendApiBase(value);
}

export function isCanonicalBackendApiBase(value = "") {
  return isCanonicalBackendApiOrigin(value);
}

export function getRoute(key = "home", fallback = "/") {
  return normalizePath(config.routes?.[text(key, "home")] || fallback || "/");
}

export function getRouteAlias(path = "") {
  return config.routeAliases?.[stripSearchAndHash(path)] || "";
}

export function getStorageKey(key = "", fallback = "") {
  return config.storageKeys?.[text(key, "")] || fallback || "";
}

export function getNamespacedStorageKey(key = "") {
  return `${config.storagePrefix}:${getStorageKey(key, key)}`;
}

function apiBasePath() {
  const apiBase = normalizeBaseUrl(config.apiBase || "");
  if (!apiBase) return "";

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(apiBase)) {
      return stripSearchAndHash(new URL(apiBase, baseOrigin()).pathname || "");
    }

    return stripSearchAndHash(apiBase);
  } catch {
    return "";
  }
}

function stripApiBasePrefix(path = "/") {
  const normalized = stripSearchAndHash(path);
  const basePath = apiBasePath();

  if (!basePath || basePath === "/") return normalized;
  if (normalized === basePath) return "/";
  if (normalized.startsWith(`${basePath}/`)) return stripSearchAndHash(normalized.slice(basePath.length) || "/");

  return normalized;
}

function isMeEndpoint(path = "") {
  const clean = stripSearchAndHash(normalizePath(path));
  const withoutBase = stripApiBasePrefix(clean);

  return PRIVATE_ME_PATHS.includes(clean) || PRIVATE_ME_PATHS.includes(withoutBase);
}

export function isPublicApiPath(path = "") {
  if (isMeEndpoint(path)) return false;

  const clean = stripSearchAndHash(normalizePath(path));
  const withoutBase = stripApiBasePrefix(clean);

  return toArray(config.auth?.publicApiPaths || config.publicApiPaths).some((item) => {
    const current = stripSearchAndHash(normalizePath(item));
    const currentWithoutBase = stripApiBasePrefix(current);

    return (
      pathMatches(clean, current) ||
      pathMatches(withoutBase, current) ||
      pathMatches(clean, currentWithoutBase) ||
      pathMatches(withoutBase, currentWithoutBase)
    );
  });
}

export function isPrivateApiPath(path = "") {
  if (isMeEndpoint(path)) return true;

  const clean = stripSearchAndHash(normalizePath(path));
  const withoutBase = stripApiBasePrefix(clean);

  return toArray(config.auth?.privateApiPaths || config.privateApiPaths).some((item) => {
    const current = stripSearchAndHash(normalizePath(item));
    const currentWithoutBase = stripApiBasePrefix(current);

    return (
      pathMatches(clean, current) ||
      pathMatches(withoutBase, current) ||
      pathMatches(clean, currentWithoutBase) ||
      pathMatches(withoutBase, currentWithoutBase)
    );
  });
}

export function isTechnicalPublicRoute(path = "") {
  const clean = stripSearchAndHash(normalizePath(path));

  return toArray(config.auth?.technicalPublicRoutes || config.technicalPublicRoutes)
    .some((item) => pathMatches(clean, item));
}

export function isPublicRoute(path = "") {
  const clean = stripSearchAndHash(normalizePath(path));
  return toArray(config.publicRoutes).some((item) => pathMatches(clean, item));
}

export function isAuthLikeRoute(path = "") {
  const clean = stripSearchAndHash(normalizePath(path));
  return toArray(config.authLikeRoutes).some((item) => pathMatches(clean, item));
}

export function getProtectedPublicTokenRoutes() {
  return config.protectedPublicTokenRoutes;
}

export function getAuthEndpoint(key = "") {
  return config.auth?.endpoints?.[text(key, "")] || "";
}

export function getAuthEndpointCandidates(key = "") {
  const value = config.auth?.endpointCandidates?.[text(key, "")];
  return Array.isArray(value) ? [...value] : [];
}

export function getAuthEndpointGroup(key = "") {
  const value = config.auth?.endpointGroups?.[text(key, "")];
  return Array.isArray(value) ? [...value] : [];
}

export function getResourceEndpoint(resource = "", key = "base") {
  return config.resources?.[text(resource, "")]?.[text(key, "base")] || "";
}

export function getConfigSnapshot() {
  return {
    version: config.__version,

    appName: config.appName,
    appVersion: config.version,
    appId: config.appId,
    env: config.env,
    debug: config.debug,

    apiBase: config.apiBase,
    apiOrigin: config.apiOrigin,
    canonicalProductionApiBase: config.canonicalProductionApiBase,
    canonicalBackendApiOrigins: config.canonicalBackendApiOrigins,
    forbiddenFrontendApiOrigins: config.forbiddenFrontendApiOrigins,
    apiSameOrigin: config.api?.sameOrigin,
    apiWithCredentials: config.api?.withCredentials,

    requestTimeout: config.requestTimeout,
    requestRetries: config.requestRetries,
    requestRetryDelayMs: config.requestRetryDelayMs,
    requestRetryMaxDelayMs: config.requestRetryMaxDelayMs,
    requestRetryMethods: config.requestRetryMethods,

    defaultLang: config.defaultLang,
    fallbackLang: config.fallbackLang,
    defaultTheme: config.defaultTheme,
    storagePrefix: config.storagePrefix,

    routes: config.routes,
    routeAliases: config.routeAliases,
    publicRoutes: config.publicRoutes,
    authLikeRoutes: config.authLikeRoutes,
    technicalPublicRoutes: config.auth.technicalPublicRoutes,

    protectedPublicTokenRoutes: config.protectedPublicTokenRoutes.map((route) => ({
      key: route.key,
      path: route.path,
      windowKey: route.windowKey,
      windowKeys: route.windowKeys,
      tokenParamNames: route.tokenParamNames,
    })),

    publicApiPaths: config.auth.publicApiPaths,
    privateApiPaths: config.auth.privateApiPaths,

    authEndpoints: config.auth.endpoints,
    authEndpointCandidates: config.auth.endpointCandidates,
    authEndpointGroups: config.auth.endpointGroups,

    resources: config.resources,

    loader: config.loader,
    router: config.router,
    ui: config.ui,
    featureFlags: config.featureFlags,
    diagnostics: config.diagnostics,
  };
}

export default config;
