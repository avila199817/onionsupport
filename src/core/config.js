/* =========================================================
   Onion SPA - Core Config
   Archivo: src/core/config.js

   ONION SUPPORT · CORE CONFIG
   GLOBAL CONTRACT · ROUTES · API · AUTH · STORAGE · 17/10

   Responsabilidades:
   - centralizar configuración global del núcleo
   - fijar API real del backend en producción: https://api.onionit.net
   - impedir que dominios frontend actúen como API base
   - exponer rutas SPA canónicas y aliases legacy controlados
   - exponer rutas públicas técnicas y rutas públicas con token
   - exponer endpoints auth/resources sin duplicar /api
   - exponer claves storage lógicas y legacy
   - exponer flags de auth, UI, router, loader, request y diagnostics
   - permitir runtime overrides seguros sin romper invariantes críticas
   - congelar profundamente el contrato final

   Candados críticos:
   - apiBase en producción SIEMPRE es https://api.onionit.net
   - apiBase nunca termina en /api: los endpoints ya incluyen /api
   - api.onionit.net NO es forbidden
   - forbidden sólo contiene orígenes frontend
   - /api/auth/me, /auth/me, /api/me y /me SIEMPRE son privados
   - activation canónico: /api/auth/activate
   - activation legacy candidate: /api/auth/activate-account
   - no routers backend legacy en resources
   - soporte Azure Static Web Apps / history fallback / hash-router
========================================================= */

/* =========================================================
   VERSION
========================================================= */

export const CONFIG_VERSION = "17.0.0";

/* =========================================================
   API BASE CONTRACT
========================================================= */

export const CANONICAL_PRODUCTION_API_BASE = "https://api.onionit.net";

export const CANONICAL_BACKEND_API_ORIGINS = Object.freeze([
  "https://api.onionit.net",
]);

/*
  Sólo dominios de FRONTEND/SWA que nunca deben convertirse en API base.
  El backend bueno api.onionit.net NO debe aparecer aquí.
*/
export const FORBIDDEN_FRONTEND_API_ORIGINS = Object.freeze([
  "https://onionsupport.com",
  "https://www.onionsupport.com",
  "http://onionsupport.com",
  "http://www.onionsupport.com",
]);

const REQUIRED_PRIVATE_ME_PATHS = Object.freeze([
  "/api/auth/me",
  "/auth/me",
  "/api/me",
  "/me",
]);

/* =========================================================
   BASIC HELPERS
========================================================= */

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isObjectLike(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off", "disabled", "inactive"].includes(normalized)) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value instanceof Set) {
    return Array.from(value);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function safeJsonKey(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function uniqueArray(values = []) {
  const output = [];
  const seen = new Set();

  for (const item of safeArray(values).flat(Infinity)) {
    const value = typeof item === "string" ? item.trim() : item;

    if (value === undefined || value === null || value === "") {
      continue;
    }

    const key = typeof value === "string" ? value : safeJsonKey(value);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(value);
  }

  return output;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!isObjectLike(value) || Object.isFrozen(value)) {
    return value;
  }

  try {
    if (seen.has(value)) {
      return value;
    }

    seen.add(value);

    for (const key of Object.getOwnPropertyNames(value)) {
      const child = value[key];

      if (isObjectLike(child) && !Object.isFrozen(child)) {
        deepFreeze(child, seen);
      }
    }

    return Object.freeze(value);
  } catch {
    return value;
  }
}

function clonePlain(value, seen = new WeakMap()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  try {
    if (seen.has(value)) {
      return seen.get(value);
    }
  } catch {}

  if (Array.isArray(value)) {
    const arr = [];

    try {
      seen.set(value, arr);
    } catch {}

    for (const item of value) {
      arr.push(clonePlain(item, seen));
    }

    return arr;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output = {};

  try {
    seen.set(value, output);
  } catch {}

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "function") {
      continue;
    }

    output[key] = clonePlain(item, seen);
  }

  return output;
}

function mergeObject(base = {}, override = {}) {
  if (Array.isArray(base) && Array.isArray(override)) {
    return uniqueArray([...base, ...override]);
  }

  const output = Array.isArray(base)
    ? clonePlain(base)
    : clonePlain(isPlainObject(base) ? base : {});

  if (!isPlainObject(override) && !Array.isArray(override)) {
    return output;
  }

  if (Array.isArray(output) && Array.isArray(override)) {
    return uniqueArray([...output, ...override]);
  }

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined || typeof value === "function") {
      continue;
    }

    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeObject(output[key], value);
      continue;
    }

    if (Array.isArray(value) && Array.isArray(output[key])) {
      output[key] = uniqueArray([...output[key], ...value]);
      continue;
    }

    output[key] = clonePlain(value);
  }

  return output;
}

/* =========================================================
   RUNTIME / ENV HELPERS
========================================================= */

function getGlobalObject() {
  try {
    if (typeof globalThis !== "undefined") {
      return globalThis;
    }
  } catch {}

  try {
    if (typeof window !== "undefined") {
      return window;
    }
  } catch {}

  return {};
}

function getBaseOrigin() {
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }
  } catch {}

  return "http://localhost";
}

function getImportMetaEnv() {
  try {
    return import.meta.env || {};
  } catch {
    return {};
  }
}

function getRuntimeConfig() {
  const root = getGlobalObject();

  try {
    return isPlainObject(root.__ONION_CONFIG__) ? root.__ONION_CONFIG__ : {};
  } catch {
    return {};
  }
}

function getEnvValue(keys = [], fallback = "") {
  const names = Array.isArray(keys) ? keys : [keys];
  const runtime = getRuntimeConfig();
  const metaEnv = getImportMetaEnv();
  const root = getGlobalObject();

  for (const key of names) {
    const cleanKey = safeText(key, "");

    if (!cleanKey) {
      continue;
    }

    if (runtime[cleanKey] !== undefined && runtime[cleanKey] !== null && runtime[cleanKey] !== "") {
      return runtime[cleanKey];
    }

    if (metaEnv[cleanKey] !== undefined && metaEnv[cleanKey] !== null && metaEnv[cleanKey] !== "") {
      return metaEnv[cleanKey];
    }

    try {
      if (root[cleanKey] !== undefined && root[cleanKey] !== null && root[cleanKey] !== "") {
        return root[cleanKey];
      }
    } catch {}
  }

  return fallback;
}

function isProductionEnv(env = "") {
  const clean = safeText(env, "").toLowerCase();
  return clean === "production" || clean === "prod";
}

/* =========================================================
   PATH HELPERS
========================================================= */

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
}

function normalizePathnameOnly(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const normalized = [];

  for (const segment of value.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      normalized.pop();
      continue;
    }

    normalized.push(segment);
  }

  value = `/${normalized.join("/")}` || "/";

  if (value.length > 1 && value.endsWith("/")) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

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

  return `${normalizePathnameOnly(pathname)}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  const normalized = normalizePath(path);
  return normalized.split("?")[0].split("#")[0] || "/";
}

function normalizePathList(list = []) {
  return uniqueArray(
    safeArray(list)
      .map((item) => stripSearchAndHash(item))
      .filter(Boolean)
  );
}

function normalizeRouteMap(map = {}) {
  const output = {};

  if (!isPlainObject(map)) {
    return output;
  }

  for (const [key, value] of Object.entries(map)) {
    const cleanKey = safeText(key, "");
    const cleanValue = normalizePath(value || "/");

    if (!cleanKey || !cleanValue) {
      continue;
    }

    output[cleanKey] = cleanValue;
  }

  return output;
}

function normalizeRouteAliases(map = {}) {
  const output = {};

  if (!isPlainObject(map)) {
    return output;
  }

  for (const [key, value] of Object.entries(map)) {
    const alias = stripSearchAndHash(key);
    const target = stripSearchAndHash(value);

    if (!alias || !target) {
      continue;
    }

    output[alias] = target;
  }

  return output;
}

function pathMatches(path = "", candidate = "") {
  const cleanPath = stripSearchAndHash(path);
  const cleanCandidate = stripSearchAndHash(candidate);

  if (!cleanCandidate) {
    return false;
  }

  if (cleanCandidate === "/") {
    return cleanPath === "/";
  }

  return cleanPath === cleanCandidate || cleanPath.startsWith(`${cleanCandidate}/`);
}

function isPrivateMeLikePath(path = "") {
  const clean = stripSearchAndHash(path);
  return REQUIRED_PRIVATE_ME_PATHS.includes(clean);
}

function normalizeApiPathList(list = []) {
  return normalizePathList(list).filter((path) => !isPrivateMeLikePath(path));
}

/* =========================================================
   API BASE HELPERS
========================================================= */

function normalizeBaseUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw || raw === "/") {
    return "";
  }

  return raw.replace(/\/+$/g, "");
}

function getOriginFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    return new URL(raw, getBaseOrigin()).origin;
  } catch {
    return "";
  }
}

function isForbiddenFrontendApiBase(value = "") {
  const origin = getOriginFromUrlLike(value);
  return Boolean(origin && FORBIDDEN_FRONTEND_API_ORIGINS.includes(origin));
}

function isCanonicalBackendApiOrigin(value = "") {
  const origin = getOriginFromUrlLike(value);
  return Boolean(origin && CANONICAL_BACKEND_API_ORIGINS.includes(origin));
}

function normalizeAbsoluteApiBase(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }

    const origin = parsed.origin.replace(/\/+$/g, "");
    const pathname = normalizePathnameOnly(parsed.pathname || "/");

    if (pathname === "/" || pathname === "/api") {
      return origin;
    }

    if (CANONICAL_BACKEND_API_ORIGINS.includes(origin)) {
      return origin;
    }

    return `${origin}${pathname}`.replace(/\/+$/g, "");
  } catch {
    return "";
  }
}

function normalizeApiBaseUrl(value = "", { env = "production", fallback = "" } = {}) {
  const production = isProductionEnv(env);

  if (production) {
    return CANONICAL_PRODUCTION_API_BASE;
  }

  const raw = normalizeBaseUrl(value);
  const cleanFallback = normalizeBaseUrl(fallback);

  if (!raw) {
    return cleanFallback;
  }

  if (isForbiddenFrontendApiBase(raw)) {
    return cleanFallback;
  }

  if (/^https?:\/\//i.test(raw)) {
    return normalizeAbsoluteApiBase(raw) || cleanFallback;
  }

  if (raw === "/api" || raw === "api") {
    return "";
  }

  return raw.replace(/\/+$/g, "");
}

function normalizeStoragePrefix(value = "onion") {
  return safeText(value, "onion")
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .replace(/^:+|:+$/g, "") || "onion";
}

function normalizeLang(value = "es") {
  const raw = safeText(value, "es").toLowerCase().replace(/_/g, "-");
  const first = raw.split("-")[0] || raw;

  if (["spa", "spanish", "castellano", "español"].includes(first)) {
    return "es";
  }

  if (["eng", "english"].includes(first)) {
    return "en";
  }

  if (["cat", "catalan", "català", "catalán"].includes(first)) {
    return "ca";
  }

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(raw) ? raw : "es";
}

function normalizeTheme(value = "dark") {
  const theme = safeText(value, "dark").toLowerCase();
  return theme === "light" ? "light" : "dark";
}

function pickRuntimeOverrides(runtime = {}) {
  if (!isPlainObject(runtime)) {
    return {};
  }

  const allowedKeys = [
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
  ];

  const output = {};

  for (const key of allowedKeys) {
    if (runtime[key] !== undefined && typeof runtime[key] !== "function") {
      output[key] = runtime[key];
    }
  }

  if (isPlainObject(runtime.override)) {
    return mergeObject(output, runtime.override);
  }

  return output;
}

/* =========================================================
   BASE VALUES
========================================================= */

const runtimeConfig = getRuntimeConfig();

const APP_NAME = safeText(
  getEnvValue(
    ["ONION_APP_NAME", "VITE_ONION_APP_NAME", "APP_NAME"],
    runtimeConfig.appName || runtimeConfig.name || "Onion Support"
  ),
  "Onion Support"
);

const APP_VERSION = safeText(
  getEnvValue(
    ["ONION_APP_VERSION", "VITE_ONION_APP_VERSION", "APP_VERSION"],
    runtimeConfig.version || "2.1.0"
  ),
  "2.1.0"
);

const APP_ENV = safeText(
  getEnvValue(
    ["ONION_ENV", "VITE_ONION_ENV", "NODE_ENV", "APP_ENV"],
    runtimeConfig.env || runtimeConfig.environment || "production"
  ),
  "production"
).toLowerCase();

const DEBUG = safeBool(
  getEnvValue(["ONION_DEBUG", "VITE_ONION_DEBUG", "APP_DEBUG"], runtimeConfig.debug ?? false),
  false
);

const APP_ID = normalizeStoragePrefix(
  getEnvValue(
    ["ONION_APP_ID", "VITE_ONION_APP_ID", "APP_ID"],
    runtimeConfig.appId || runtimeConfig.appKey || "onion"
  )
);

const RAW_API_BASE = getEnvValue(
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
  runtimeConfig.apiBase ||
    runtimeConfig.apiOrigin ||
    runtimeConfig.apiUrl ||
    runtimeConfig.api?.base ||
    runtimeConfig.api?.baseUrl ||
    runtimeConfig.api?.origin ||
    ""
);

const API_BASE = normalizeApiBaseUrl(RAW_API_BASE, {
  env: APP_ENV,
  fallback: isProductionEnv(APP_ENV) ? CANONICAL_PRODUCTION_API_BASE : "",
});

const STORAGE_PREFIX = normalizeStoragePrefix(
  getEnvValue(
    ["ONION_STORAGE_PREFIX", "VITE_ONION_STORAGE_PREFIX", "APP_STORAGE_PREFIX"],
    runtimeConfig.storagePrefix || runtimeConfig.appKey || runtimeConfig.appId || APP_ID || "onion"
  )
);

/* =========================================================
   ROUTES · CANONICAL SPA PATHS
========================================================= */

const routes = {
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
};

const routeAliases = {
  "/home": routes.home,
  "/dashboard": routes.home,
  "/panel": routes.home,

  "/tickets": routes.incidencias,
  "/ticket": routes.incidencias,
  "/incidents": routes.incidencias,
  "/incident": routes.incidencias,

  "/invoices": routes.facturas,
  "/invoice": routes.facturas,
  "/billing": routes.facturas,

  "/users": routes.usuarios,
  "/user": routes.usuarios,

  "/clients": routes.clientes,
  "/client": routes.clientes,
  "/customers": routes.clientes,
  "/customer": routes.clientes,

  "/account": routes.cuenta,
  "/profile": routes.cuenta,

  "/settings": routes.ajustes,
  "/config": routes.ajustes,

  "/server": routes.servidor,

  "/activate": routes.activateAccount,
  "/activation": routes.activateAccount,
  "/activate-account": routes.activateAccount,

  "/forgot": routes.forgotPassword,
  "/recover": routes.recoverPassword,
  "/password-reset": routes.passwordReset,
  "/reset": routes.resetPassword,
  "/reset-confirm": routes.resetPasswordConfirm,
  "/reset-password-confirm": routes.resetPasswordConfirm,

  "/2-factor": routes.twoFactor,
  "/two-factor": routes.twoFactor,
  "/mfa": routes.mfa,
  "/otp": routes.otp,
};

const publicRoutes = normalizePathList([
  routes.login,
  routes.activateAccount,
  routes.resetPassword,
  routes.resetPasswordConfirm,
  routes.forgotPassword,
  routes.recoverPassword,
  routes.passwordReset,
  routes.twoFactor,
  routes.otp,
  routes.mfa,
  routes.forbidden,
  routes.notFound,
]);

const authLikeRoutes = normalizePathList([
  routes.login,
  routes.activateAccount,
  routes.resetPassword,
  routes.resetPasswordConfirm,
  routes.forgotPassword,
  routes.recoverPassword,
  routes.passwordReset,
  routes.twoFactor,
  routes.otp,
  routes.mfa,
]);

const technicalPublicRoutes = normalizePathList([
  routes.activateAccount,
  routes.resetPassword,
  routes.resetPasswordConfirm,
  routes.forgotPassword,
  routes.recoverPassword,
  routes.passwordReset,
  routes.twoFactor,
  routes.otp,
  routes.mfa,
]);

const protectedPublicTokenRoutes = [
  {
    key: "activation",
    path: routes.activateAccount,
    statePrefix: "Activation",
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
  },
  {
    key: "resetConfirm",
    path: routes.resetPasswordConfirm,
    statePrefix: "ResetConfirm",
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
  },
];

/* =========================================================
   STORAGE
========================================================= */

const storageKeys = {
  token: "token",
  accessToken: "accessToken",
  access_token: "access_token",
  refreshToken: "refreshToken",
  refresh_token: "refresh_token",
  tempToken: "tempToken",
  temp_token: "temp_token",

  session: "session",
  sessionData: "sessionData",
  sessionId: "sessionId",
  sessionUserId: "sessionUserId",

  user: "user",
  currentUser: "currentUser",
  authUser: "authUser",
  sessionUser: "sessionUser",
  role: "role",
  userRole: "userRole",
  roles: "roles",

  theme: "theme",
  themeMode: "themeMode",
  appearance: "appearance",
  lang: "lang",
  language: "language",
  locale: "locale",

  sidebarOpen: "sidebarOpen",
  sidebarCollapsed: "sidebarCollapsed",

  lastRoute: "lastRoute",
  lastPublicPath: "lastPublicPath",
  postLoginTarget: "postLoginTarget",
  redirectAfterLogin: "redirectAfterLogin",
  authContext: "authContext",

  settings: "settings",
  preferences: "preferences",
  ui: "ui",
};

const legacyStorageKeys = {
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
};

/* =========================================================
   AUTH / API PATHS
========================================================= */

const publicApiPaths = normalizeApiPathList([
  "/api/auth/login",
  "/api/auth/refresh",

  "/api/auth/reset-password-request",
  "/api/auth/reset-password-confirm",
  "/api/auth/reset-password/validate",
  "/api/auth/forgot-password",
  "/api/auth/password-reset/request",
  "/api/auth/reset-password/request",
  "/api/auth/reset-password/confirm",
  "/api/auth/password-reset/confirm",
  "/api/auth/reset-password-validate",
  "/api/auth/password-reset/validate",

  "/api/auth/activate",
  "/api/auth/activate-account",
  "/api/auth/activate/first-user",
  "/api/auth/activate/validate",

  "/api/auth/2fa/login",
  "/api/auth/2fa/request",
  "/api/auth/2fa/resend",
  "/api/auth/2fa/verify",
  "/api/auth/mfa/login",
  "/api/auth/mfa/request",
  "/api/auth/mfa/resend",
  "/api/auth/mfa/verify",

  "/api/auth/_health",
  "/api/auth/health",
  "/api/health",
  "/api/health/ready",
  "/api/health/live",
  "/api/_health",
  "/health",
]);

const privateApiPaths = normalizePathList([
  ...REQUIRED_PRIVATE_ME_PATHS,

  "/api/auth/logout",
  "/api/auth/logout-all",
  "/api/auth/2fa/setup",
  "/api/auth/2fa/confirm",
  "/api/auth/2fa/disable",
  "/api/auth/change-password",
  "/api/auth/activate/admin",
  "/api/auth/deactivate/admin",
  "/api/auth/deactivate/self",

  "/api/tickets",
  "/api/incidencias",
  "/api/facturas",
  "/api/invoices",
  "/api/clientes",
  "/api/clients",
  "/api/users",
  "/api/usuarios",
  "/api/search",
]);

const authEndpoints = {
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

  requestPasswordReset: "/api/auth/reset-password-request",
  resetPasswordRequest: "/api/auth/reset-password-request",
  forgotPassword: "/api/auth/reset-password-request",
  recoverPassword: "/api/auth/reset-password-request",
  passwordResetRequest: "/api/auth/reset-password-request",

  confirmPasswordReset: "/api/auth/reset-password-confirm",
  confirmResetPassword: "/api/auth/reset-password-confirm",
  resetPasswordConfirm: "/api/auth/reset-password-confirm",
  passwordResetConfirm: "/api/auth/reset-password-confirm",
  resetPasswordUpdate: "/api/auth/reset-password-confirm",
  resetPasswordFinalize: "/api/auth/reset-password-confirm",
  changeForgottenPassword: "/api/auth/reset-password-confirm",

  validateResetToken: "/api/auth/reset-password/validate",
  resetPasswordValidate: "/api/auth/reset-password/validate",
  validatePasswordReset: "/api/auth/reset-password/validate",
  passwordResetValidate: "/api/auth/reset-password/validate",

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

  twoFactorLogin: "/api/auth/2fa/login",
  login2fa: "/api/auth/2fa/login",
  mfaLogin: "/api/auth/2fa/login",
  verify2FA: "/api/auth/2fa/login",
  verifyMfa: "/api/auth/2fa/login",
  twoFactorVerify: "/api/auth/2fa/login",

  twoFactorRequest: "/api/auth/2fa/request",
  request2FA: "/api/auth/2fa/request",
  requestMfa: "/api/auth/2fa/request",
  send2FA: "/api/auth/2fa/request",
  sendMfa: "/api/auth/2fa/request",

  twoFactorResend: "/api/auth/2fa/resend",
  resend2FA: "/api/auth/2fa/resend",
  resendMfa: "/api/auth/2fa/resend",

  health: "/api/auth/_health",
  authHealth: "/api/auth/_health",
};

const authEndpointCandidates = {
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
  twoFactorRequest: ["/api/auth/2fa/request", "/api/auth/mfa/request"],
  twoFactorResend: ["/api/auth/2fa/resend", "/api/auth/mfa/resend"],

  health: [
    "/api/auth/_health",
    "/api/auth/health",
    "/api/health",
    "/api/health/ready",
    "/api/_health",
    "/health",
  ],
};

function buildAuthEndpointGroups(candidates = authEndpointCandidates, endpoints = authEndpoints, publicPaths = publicApiPaths, privatePaths = privateApiPaths) {
  return {
    public: normalizeApiPathList(publicPaths),
    private: normalizePathList([...privatePaths, ...REQUIRED_PRIVATE_ME_PATHS]),
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

const authEndpointGroups = buildAuthEndpointGroups();

const auth = {
  bearerPrefix: "Bearer",
  tokenHeader: "Authorization",

  tokenStorageKey: storageKeys.token,
  accessTokenStorageKey: storageKeys.accessToken,
  refreshTokenStorageKey: storageKeys.refreshToken,
  tempTokenStorageKey: storageKeys.tempToken,
  sessionIdStorageKey: storageKeys.sessionId,
  sessionUserIdStorageKey: storageKeys.sessionUserId,

  loginRoute: routes.login,
  logoutRoute: routes.logout,
  homeRoute: routes.home,
  postLoginFallback: routes.home,

  endpoints: authEndpoints,
  endpointCandidates: authEndpointCandidates,
  endpointGroups: authEndpointGroups,

  publicApiPaths,
  privateApiPaths,
  technicalPublicRoutes,
  publicTechnicalRoutes: technicalPublicRoutes,
  protectedPublicTokenRoutes,

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
    refresh: ["refreshToken", "refresh_token", "token", "code", "t"],
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
      "code",
      "otp",
      "totp",
    ],
  },

  roles: {
    admin: "admin",
    administrator: "admin",
    administrador: "admin",
    superadmin: "admin",
    super_admin: "admin",
    owner: "admin",
    root: "admin",

    agent: "support",
    agente: "support",
    tecnico: "support",
    técnica: "support",
    technician: "support",
    technical: "support",
    staff: "support",
    support: "support",
    soporte: "support",

    manager: "manager",
    gestor: "manager",
    gerente: "manager",
    lead: "manager",
    supervisor: "manager",

    user: "user",
    usuario: "user",
    client: "client",
    cliente: "client",
    customer: "client",
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
};

const api = {
  base: API_BASE,
  baseUrl: API_BASE,
  origin: API_BASE,
  sameOrigin: !API_BASE,

  canonicalProductionBase: CANONICAL_PRODUCTION_API_BASE,
  canonicalBackendOrigins: CANONICAL_BACKEND_API_ORIGINS,
  forbiddenFrontendOrigins: FORBIDDEN_FRONTEND_API_ORIGINS,

  prefix: "/api",

  timeout: safeNumber(runtimeConfig.requestTimeout ?? runtimeConfig.api?.timeout, 15000),
  retries: safeNumber(runtimeConfig.requestRetries ?? runtimeConfig.api?.retries, 0),
  retryDelayMs: safeNumber(runtimeConfig.requestRetryDelayMs ?? runtimeConfig.api?.retryDelayMs, 350),
  retryMaxDelayMs: safeNumber(runtimeConfig.requestRetryMaxDelayMs ?? runtimeConfig.api?.retryMaxDelayMs, 4000),
  retryMethods: uniqueArray(
    safeArray(runtimeConfig.requestRetryMethods ?? runtimeConfig.api?.retryMethods ?? ["GET", "HEAD", "OPTIONS"])
      .map((item) => safeText(item, "").toUpperCase())
      .filter(Boolean)
  ),

  withCredentials: safeBool(runtimeConfig.withCredentials ?? runtimeConfig.api?.withCredentials, true),

  publicPaths: publicApiPaths,
  privatePaths: privateApiPaths,

  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
};

/* =========================================================
   RESOURCES / BACKEND ACTIVO
========================================================= */

const resources = {
  tickets: {
    base: "/api/tickets",
    alias: "/api/incidencias",
    aliases: ["/api/incidencias"],
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
    aliases: ["/api/incidencias"],
    list: "/api/tickets",
    stats: "/api/tickets/stats",
    detail: "/api/tickets/:id",
    create: "/api/tickets",
    update: "/api/tickets/:id",
  },

  facturas: {
    base: "/api/facturas",
    alias: "/api/invoices",
    aliases: ["/api/invoices"],
    list: "/api/facturas",
    stats: "/api/facturas/stats",
    detail: "/api/facturas/:id",
    viewPdf: "/api/facturas/:id/view",
    download: "/api/facturas/:id/download",
    send: "/api/facturas/:id/send",
    create: "/api/facturas",
  },

  invoices: {
    base: "/api/facturas",
    alias: "/api/invoices",
    aliases: ["/api/invoices"],
    list: "/api/facturas",
    stats: "/api/facturas/stats",
    detail: "/api/facturas/:id",
  },

  clientes: {
    base: "/api/clientes",
    alias: "/api/clients",
    aliases: ["/api/clients"],
    list: "/api/clientes",
    stats: "/api/clientes/stats",
    detail: "/api/clientes/:id",
    create: "/api/clientes",
    update: "/api/clientes/:id",
  },

  clients: {
    base: "/api/clientes",
    alias: "/api/clients",
    aliases: ["/api/clients"],
    list: "/api/clientes",
    stats: "/api/clientes/stats",
    detail: "/api/clientes/:id",
  },

  usuarios: {
    base: "/api/users",
    alias: "/api/usuarios",
    aliases: ["/api/usuarios"],
    list: "/api/users",
    stats: "/api/users/stats",
    detail: "/api/users/:id",
    create: "/api/users",
    update: "/api/users/:id",
  },

  users: {
    base: "/api/users",
    alias: "/api/usuarios",
    aliases: ["/api/usuarios"],
    list: "/api/users",
    stats: "/api/users/stats",
    detail: "/api/users/:id",
  },

  search: {
    base: "/api/search",
    global: "/api/search",
    users: "/api/search/users",
    usuarios: "/api/search/usuarios",
    clientes: "/api/search/clientes",
    clients: "/api/search/clients",
    incidencias: "/api/search/incidencias",
    tickets: "/api/search/tickets",
    health: "/api/search/_health",
  },

  health: {
    base: "/api/health",
    ready: "/api/health/ready",
    live: "/api/health/live",
    auth: "/api/auth/_health",
  },
};

/* =========================================================
   UI / I18N / ROUTER / LOADER
========================================================= */

const ui = {
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
};

const i18n = {
  defaultLang: "es",
  fallbackLang: "es",
  supported: ["es", "en", "ca"],
  storageKey: storageKeys.lang,
  liveRefresh: true,
  eventName: "app:lang:change",
};

const router = {
  mode: "history",
  base: "/",
  defaultRoute: routes.home,
  loginRoute: routes.login,
  logoutRoute: routes.logout,
  notFoundRoute: routes.notFound,
  forbiddenRoute: routes.forbidden,

  preserveTechnicalPublicUrls: true,
  bindAfterInitialRender: true,
  stripUsernamePrefix: true,
  usernamePrefix: "@",
  emitRenderEvents: true,
  useHistoryFallback: true,
  safeExternalLinks: true,

  routes,
  routeAliases,
  publicRoutes,
  authLikeRoutes,
  technicalPublicRoutes,
  protectedPublicTokenRoutes,

  events: {
    beforeRender: "router:before-render",
    rendered: "router:rendered",
    asyncComplete: "router:render:async-complete",
    navigationComplete: "router:navigation:complete",
    shellState: "router:shell:state",
  },
};

const loader = {
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
};

/* =========================================================
   SECURITY / EVENTS / FLAGS
========================================================= */

const security = {
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
  ],
};

const events = {
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
};

const featureFlags = {
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
};

const diagnostics = {
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
};

/* =========================================================
   CONFIG BUILD
========================================================= */

const baseConfig = {
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

  publicApiPaths,
  privateApiPaths,

  requestTimeout: api.timeout,
  requestRetries: api.retries,
  requestRetryDelayMs: api.retryDelayMs,
  requestRetryMaxDelayMs: api.retryMaxDelayMs,
  requestRetryMethods: api.retryMethods,

  defaultLang: i18n.defaultLang,
  fallbackLang: i18n.fallbackLang,
  defaultTheme: ui.defaultTheme,
  storagePrefix: STORAGE_PREFIX,

  canonicalProductionApiBase: CANONICAL_PRODUCTION_API_BASE,
  canonicalBackendApiOrigins: CANONICAL_BACKEND_API_ORIGINS,
  forbiddenFrontendApiOrigins: FORBIDDEN_FRONTEND_API_ORIGINS,

  routes,
  routeAliases,
  publicRoutes,
  authLikeRoutes,
  technicalPublicRoutes,
  protectedPublicTokenRoutes,

  storageKeys,
  legacyStorageKeys,

  api,
  auth,
  ui,
  i18n,
  router,
  loader,
  events,
  featureFlags,
  diagnostics,
  resources,
  security,
};

function normalizeProtectedPublicTokenRoutes(list = []) {
  const output = [];
  const seen = new Set();

  for (const item of safeArray(list)) {
    if (!isPlainObject(item)) {
      continue;
    }

    const path = stripSearchAndHash(item.path || "/");
    const key = safeText(item.key, path);
    const dedupeKey = `${key}:${path}`;

    if (!path || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);

    const windowKeys = uniqueArray([...safeArray(item.windowKeys), item.windowKey]);

    output.push({
      ...item,
      key,
      path,
      windowKey: item.windowKey || windowKeys[0] || "",
      windowKeys,
      tokenParamNames: uniqueArray(item.tokenParamNames || []),
      scrubbedStateKeys: uniqueArray(item.scrubbedStateKeys || []),
      scrubbedHistoryKeys: uniqueArray(item.scrubbedHistoryKeys || []),
    });
  }

  return output;
}

function normalizeEndpointMap(endpoints = {}) {
  const output = isPlainObject(endpoints) ? { ...endpoints } : {};

  output.me = "/api/auth/me";
  output.profile = "/api/auth/me";
  output.currentUser = "/api/auth/me";
  output.current = "/api/auth/me";
  output.session = "/api/auth/me";

  output.activate = "/api/auth/activate";
  output.activateAccount = "/api/auth/activate";
  output.activation = "/api/auth/activate";
  output.accountActivation = "/api/auth/activate";
  output.createUserActivation = "/api/auth/activate";
  output.confirmActivation = "/api/auth/activate";

  output.activateAccountLegacy = "/api/auth/activate-account";
  output.activationLegacy = "/api/auth/activate-account";

  return Object.fromEntries(
    Object.entries(output).map(([key, value]) => [key, stripSearchAndHash(value || "")]).filter(([, value]) => Boolean(value))
  );
}

function normalizeEndpointCandidatesMap(candidates = {}) {
  const source = mergeObject(authEndpointCandidates, isPlainObject(candidates) ? candidates : {});
  const output = {};

  for (const [key, value] of Object.entries(source)) {
    output[key] = normalizePathList(value);
  }

  output.me = normalizePathList(["/api/auth/me", "/auth/me", "/api/me", "/me"]);
  output.activateAccount = normalizePathList(["/api/auth/activate", "/api/auth/activate-account", ...(output.activateAccount || [])]);

  return output;
}

function normalizeFinalConfig(source = {}) {
  const output = mergeObject({}, source);

  output.__version = safeText(output.__version, CONFIG_VERSION);

  output.appName = safeText(output.appName || output.name, APP_NAME);
  output.name = output.appName;

  output.version = safeText(output.version, APP_VERSION);
  output.env = safeText(output.env || output.environment, APP_ENV).toLowerCase();
  output.environment = output.env;
  output.debug = safeBool(output.debug, DEBUG);

  output.appId = normalizeStoragePrefix(output.appId || APP_ID || "onion");
  output.storagePrefix = normalizeStoragePrefix(output.storagePrefix || output.appKey || output.appId || STORAGE_PREFIX || "onion");
  output.appKey = output.storagePrefix;

  output.canonicalProductionApiBase = CANONICAL_PRODUCTION_API_BASE;
  output.canonicalBackendApiOrigins = CANONICAL_BACKEND_API_ORIGINS;
  output.forbiddenFrontendApiOrigins = FORBIDDEN_FRONTEND_API_ORIGINS;

  output.apiBase = normalizeApiBaseUrl(
    output.apiBase || output.apiOrigin || output.apiUrl || output.api?.base || output.api?.baseUrl || output.api?.origin || API_BASE,
    {
      env: output.env,
      fallback: isProductionEnv(output.env) ? CANONICAL_PRODUCTION_API_BASE : API_BASE,
    }
  );

  output.apiOrigin = output.apiBase;
  output.apiUrl = output.apiBase;

  output.defaultLang = normalizeLang(output.defaultLang || output.i18n?.defaultLang || "es");
  output.fallbackLang = normalizeLang(output.fallbackLang || output.i18n?.fallbackLang || output.defaultLang || "es");
  output.defaultTheme = normalizeTheme(output.defaultTheme || output.ui?.defaultTheme || "dark");

  output.routes = normalizeRouteMap(mergeObject(routes, output.routes || {}));
  output.routeAliases = normalizeRouteAliases(mergeObject(routeAliases, output.routeAliases || {}));

  output.publicRoutes = normalizePathList([
    ...publicRoutes,
    ...(output.publicRoutes || []),
    ...(output.router?.publicRoutes || []),
  ]);

  output.authLikeRoutes = normalizePathList([
    ...authLikeRoutes,
    ...(output.authLikeRoutes || []),
    ...(output.router?.authLikeRoutes || []),
  ]);

  output.technicalPublicRoutes = normalizePathList([
    ...technicalPublicRoutes,
    ...(output.technicalPublicRoutes || []),
    ...(output.auth?.technicalPublicRoutes || []),
    ...(output.router?.technicalPublicRoutes || []),
  ]);

  output.protectedPublicTokenRoutes = normalizeProtectedPublicTokenRoutes([
    ...protectedPublicTokenRoutes,
    ...(output.protectedPublicTokenRoutes || []),
    ...(output.auth?.protectedPublicTokenRoutes || []),
    ...(output.router?.protectedPublicTokenRoutes || []),
  ]);

  output.storageKeys = mergeObject(storageKeys, output.storageKeys || {});
  output.legacyStorageKeys = mergeObject(legacyStorageKeys, output.legacyStorageKeys || {});

  output.publicApiPaths = normalizeApiPathList([
    ...publicApiPaths,
    ...(output.publicApiPaths || []),
    ...(output.api?.publicPaths || []),
    ...(output.auth?.publicApiPaths || []),
  ]);

  output.privateApiPaths = normalizePathList([
    ...privateApiPaths,
    ...REQUIRED_PRIVATE_ME_PATHS,
    ...(output.privateApiPaths || []),
    ...(output.api?.privatePaths || []),
    ...(output.auth?.privateApiPaths || []),
  ]);

  output.api = mergeObject(api, output.api || {});
  output.api.base = output.apiBase;
  output.api.baseUrl = output.apiBase;
  output.api.origin = output.apiBase;
  output.api.sameOrigin = !output.apiBase;
  output.api.canonicalProductionBase = CANONICAL_PRODUCTION_API_BASE;
  output.api.canonicalBackendOrigins = CANONICAL_BACKEND_API_ORIGINS;
  output.api.forbiddenFrontendOrigins = FORBIDDEN_FRONTEND_API_ORIGINS;
  output.api.publicPaths = output.publicApiPaths;
  output.api.privatePaths = output.privateApiPaths;
  output.api.timeout = safeNumber(output.api.timeout, output.requestTimeout || 15000);
  output.api.retries = safeNumber(output.api.retries, output.requestRetries || 0);
  output.api.retryDelayMs = safeNumber(output.api.retryDelayMs, output.requestRetryDelayMs || 350);
  output.api.retryMaxDelayMs = safeNumber(output.api.retryMaxDelayMs, output.requestRetryMaxDelayMs || 4000);
  output.api.retryMethods = uniqueArray(
    safeArray(output.api.retryMethods || output.requestRetryMethods || ["GET", "HEAD", "OPTIONS"])
      .map((item) => safeText(item, "").toUpperCase())
      .filter(Boolean)
  );
  output.api.withCredentials = safeBool(output.api.withCredentials, true);

  output.requestTimeout = safeNumber(output.requestTimeout, output.api.timeout || 15000);
  output.requestRetries = safeNumber(output.requestRetries, output.api.retries || 0);
  output.requestRetryDelayMs = safeNumber(output.requestRetryDelayMs, output.api.retryDelayMs || 350);
  output.requestRetryMaxDelayMs = safeNumber(output.requestRetryMaxDelayMs, output.api.retryMaxDelayMs || 4000);
  output.requestRetryMethods = uniqueArray(
    safeArray(output.requestRetryMethods || output.api.retryMethods || ["GET", "HEAD", "OPTIONS"])
      .map((item) => safeText(item, "").toUpperCase())
      .filter(Boolean)
  );

  output.auth = mergeObject(auth, output.auth || {});
  output.auth.publicApiPaths = output.publicApiPaths;
  output.auth.privateApiPaths = output.privateApiPaths;
  output.auth.technicalPublicRoutes = output.technicalPublicRoutes;
  output.auth.publicTechnicalRoutes = output.technicalPublicRoutes;
  output.auth.protectedPublicTokenRoutes = output.protectedPublicTokenRoutes;
  output.auth.endpoints = normalizeEndpointMap(mergeObject(authEndpoints, output.auth.endpoints || {}));
  output.auth.endpointCandidates = normalizeEndpointCandidatesMap(output.auth.endpointCandidates || {});
  output.auth.endpointGroups = buildAuthEndpointGroups(
    output.auth.endpointCandidates,
    output.auth.endpoints,
    output.publicApiPaths,
    output.privateApiPaths
  );
  output.auth.loginRoute = output.routes.login;
  output.auth.logoutRoute = output.routes.logout;
  output.auth.homeRoute = output.routes.home;
  output.auth.postLoginFallback = output.routes.home;
  output.auth.session = mergeObject(auth.session, output.auth.session || {});
  output.auth.session.requireTokenForAuthenticated = true;
  output.auth.session.allowTechnicalAuthenticatedWithoutUser = false;
  output.auth.session.clearGhostUserWithoutToken = true;

  output.ui = mergeObject(ui, output.ui || {});
  output.ui.defaultTheme = normalizeTheme(output.ui.defaultTheme || output.defaultTheme);
  output.ui.theme = normalizeTheme(output.ui.theme || output.ui.defaultTheme);

  output.i18n = mergeObject(i18n, output.i18n || {});
  output.i18n.defaultLang = normalizeLang(output.i18n.defaultLang || output.defaultLang);
  output.i18n.fallbackLang = normalizeLang(output.i18n.fallbackLang || output.fallbackLang || output.i18n.defaultLang);
  output.i18n.supported = uniqueArray(
    safeArray(output.i18n.supported || ["es", "en", "ca"])
      .map((item) => normalizeLang(item))
      .filter(Boolean)
  );
  output.i18n.storageKey = output.storageKeys.lang;

  output.router = mergeObject(router, output.router || {});
  output.router.routes = output.routes;
  output.router.routeAliases = output.routeAliases;
  output.router.publicRoutes = output.publicRoutes;
  output.router.authLikeRoutes = output.authLikeRoutes;
  output.router.technicalPublicRoutes = output.technicalPublicRoutes;
  output.router.protectedPublicTokenRoutes = output.protectedPublicTokenRoutes;
  output.router.defaultRoute = output.routes.home;
  output.router.loginRoute = output.routes.login;
  output.router.logoutRoute = output.routes.logout;
  output.router.notFoundRoute = output.routes.notFound;
  output.router.forbiddenRoute = output.routes.forbidden;

  output.loader = mergeObject(loader, output.loader || {});
  output.events = mergeObject(events, output.events || {});

  output.featureFlags = mergeObject(featureFlags, output.featureFlags || {});
  output.featureFlags.requireAuthorizationForMe = true;
  output.featureFlags.keepMeEndpointPrivate = true;
  output.featureFlags.forceCanonicalProductionApiBase = true;

  output.diagnostics = mergeObject(diagnostics, output.diagnostics || {});
  output.diagnostics.enabled = safeBool(output.diagnostics.enabled, output.debug);
  output.diagnostics.redactTokens = true;

  output.resources = mergeObject(resources, output.resources || {});

  output.security = mergeObject(security, output.security || {});
  output.security.canonicalProductionApiBase = CANONICAL_PRODUCTION_API_BASE;
  output.security.canonicalBackendApiOrigins = CANONICAL_BACKEND_API_ORIGINS;
  output.security.forbiddenFrontendApiOrigins = FORBIDDEN_FRONTEND_API_ORIGINS;
  output.security.redactTokens = true;
  output.security.sensitiveQueryParams = uniqueArray([
    ...security.sensitiveQueryParams,
    ...(output.security.sensitiveQueryParams || []),
  ]);

  /* Candados finales: no override puede saltarse estas invariantes. */
  output.apiBase = normalizeApiBaseUrl(output.apiBase, {
    env: output.env,
    fallback: isProductionEnv(output.env) ? CANONICAL_PRODUCTION_API_BASE : API_BASE,
  });
  output.apiOrigin = output.apiBase;
  output.apiUrl = output.apiBase;

  output.publicApiPaths = normalizeApiPathList(output.publicApiPaths);
  output.privateApiPaths = normalizePathList([...output.privateApiPaths, ...REQUIRED_PRIVATE_ME_PATHS]);

  output.api.base = output.apiBase;
  output.api.baseUrl = output.apiBase;
  output.api.origin = output.apiBase;
  output.api.sameOrigin = !output.apiBase;
  output.api.publicPaths = output.publicApiPaths;
  output.api.privatePaths = output.privateApiPaths;

  output.auth.publicApiPaths = output.publicApiPaths;
  output.auth.privateApiPaths = output.privateApiPaths;
  output.auth.endpoints = normalizeEndpointMap(output.auth.endpoints);
  output.auth.endpointCandidates = normalizeEndpointCandidatesMap(output.auth.endpointCandidates);
  output.auth.endpointGroups = buildAuthEndpointGroups(
    output.auth.endpointCandidates,
    output.auth.endpoints,
    output.publicApiPaths,
    output.privateApiPaths
  );

  return output;
}

export const config = deepFreeze(
  normalizeFinalConfig(mergeObject(baseConfig, pickRuntimeOverrides(runtimeConfig)))
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
  const cleanKey = safeText(key, "home");
  return normalizePath(config.routes?.[cleanKey] || fallback || "/");
}

export function getRouteAlias(path = "") {
  const cleanPath = stripSearchAndHash(path);
  return config.routeAliases?.[cleanPath] || "";
}

export function getStorageKey(key = "", fallback = "") {
  const cleanKey = safeText(key, "");
  return config.storageKeys?.[cleanKey] || fallback || "";
}

export function getNamespacedStorageKey(key = "") {
  const cleanKey = getStorageKey(key, key);
  return `${config.storagePrefix}:${cleanKey}`;
}

function getApiBasePath() {
  const apiBase = normalizeBaseUrl(config.apiBase || "");

  if (!apiBase) {
    return "";
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(apiBase)) {
      return stripSearchAndHash(new URL(apiBase, getBaseOrigin()).pathname || "");
    }

    return stripSearchAndHash(apiBase);
  } catch {
    return "";
  }
}

function stripApiBasePrefix(path = "/") {
  const normalized = stripSearchAndHash(path);
  const apiBasePath = getApiBasePath();

  if (!apiBasePath || apiBasePath === "/") {
    return normalized;
  }

  if (normalized === apiBasePath) {
    return "/";
  }

  if (normalized.startsWith(`${apiBasePath}/`)) {
    return stripSearchAndHash(normalized.slice(apiBasePath.length) || "/");
  }

  return normalized;
}

function isPrivateMePath(path = "") {
  const clean = stripSearchAndHash(normalizePath(path));
  const withoutApiBase = stripApiBasePrefix(clean);

  return REQUIRED_PRIVATE_ME_PATHS.includes(clean) || REQUIRED_PRIVATE_ME_PATHS.includes(withoutApiBase);
}

export function isPublicApiPath(path = "") {
  if (isPrivateMePath(path)) {
    return false;
  }

  const cleanPath = stripSearchAndHash(normalizePath(path));
  const withoutApiBase = stripApiBasePrefix(cleanPath);

  return safeArray(config.auth?.publicApiPaths || config.publicApiPaths).some((publicPath) => {
    const current = stripSearchAndHash(normalizePath(publicPath));
    const currentWithoutApiBase = stripApiBasePrefix(current);

    return (
      pathMatches(cleanPath, current) ||
      pathMatches(withoutApiBase, current) ||
      pathMatches(cleanPath, currentWithoutApiBase) ||
      pathMatches(withoutApiBase, currentWithoutApiBase)
    );
  });
}

export function isPrivateApiPath(path = "") {
  if (isPrivateMePath(path)) {
    return true;
  }

  const cleanPath = stripSearchAndHash(normalizePath(path));
  const withoutApiBase = stripApiBasePrefix(cleanPath);

  return safeArray(config.auth?.privateApiPaths || config.privateApiPaths).some((privatePath) => {
    const current = stripSearchAndHash(normalizePath(privatePath));
    const currentWithoutApiBase = stripApiBasePrefix(current);

    return (
      pathMatches(cleanPath, current) ||
      pathMatches(withoutApiBase, current) ||
      pathMatches(cleanPath, currentWithoutApiBase) ||
      pathMatches(withoutApiBase, currentWithoutApiBase)
    );
  });
}

export function isTechnicalPublicRoute(path = "") {
  const cleanPath = stripSearchAndHash(normalizePath(path));

  return safeArray(config.auth?.technicalPublicRoutes || config.technicalPublicRoutes).some((publicPath) =>
    pathMatches(cleanPath, publicPath)
  );
}

export function isPublicRoute(path = "") {
  const cleanPath = stripSearchAndHash(normalizePath(path));

  return safeArray(config.publicRoutes).some((publicPath) => pathMatches(cleanPath, publicPath));
}

export function isAuthLikeRoute(path = "") {
  const cleanPath = stripSearchAndHash(normalizePath(path));

  return safeArray(config.authLikeRoutes).some((authPath) => pathMatches(cleanPath, authPath));
}

export function getProtectedPublicTokenRoutes() {
  return config.protectedPublicTokenRoutes;
}

export function getAuthEndpoint(key = "") {
  const cleanKey = safeText(key, "");
  return config.auth?.endpoints?.[cleanKey] || "";
}

export function getAuthEndpointCandidates(key = "") {
  const cleanKey = safeText(key, "");
  const candidates = config.auth?.endpointCandidates?.[cleanKey];
  return Array.isArray(candidates) ? [...candidates] : [];
}

export function getAuthEndpointGroup(key = "") {
  const cleanKey = safeText(key, "");
  const group = config.auth?.endpointGroups?.[cleanKey];
  return Array.isArray(group) ? [...group] : [];
}

export function getResourceEndpoint(resource = "", key = "base") {
  const resourceKey = safeText(resource, "");
  const endpointKey = safeText(key, "base");
  return config.resources?.[resourceKey]?.[endpointKey] || "";
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
