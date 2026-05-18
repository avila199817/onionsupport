/* =========================================================
   Onion Support - Core Config
   Archivo: /src/core/config.js

   Responsabilidad:
   - Config estática mínima.
   - API real única.
   - Rutas reales actuales.
   - Home interna: /.
   - Home visible de usuario: /@{user.slug}.
   - Auth endpoints mínimos.
   - /api/auth/me siempre privado.
   - Token param único: token.
   - Roles únicos: admin / user.
   - Idioma base primario: es.
   - Sin rutas inventadas.
   - Sin /home.
   - Sin aliases masivos.
   - Sin storage real.
   - Sin runtime complejo.
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

export const CONFIG_VERSION = "core.config.v2";

export const CANONICAL_PRODUCTION_API_BASE = "https://api.onionit.net";

export const CANONICAL_BACKEND_API_ORIGINS = Object.freeze([
  CANONICAL_PRODUCTION_API_BASE,
]);

export const FORBIDDEN_FRONTEND_API_ORIGINS = Object.freeze([
  "https://onionsupport.com",
  "https://www.onionsupport.com",
  "http://onionsupport.com",
  "http://www.onionsupport.com",
]);

export const TOKEN_PARAM = "token";
export const USER_HOME_PREFIX = "/@";

/* =========================================================
   ROUTES
========================================================= */

export const ROUTES = Object.freeze({
  home: "/",

  login: "/login",
  passwordRequest: "/password-request",
  passwordReset: "/password-reset",
  activateAccount: "/activate-account",

  incidencias: "/incidencias",
  facturas: "/facturas",
  clientes: "/clientes",
  cuenta: "/cuenta",
  ajustes: "/ajustes",

  usuarios: "/usuarios",
  servidor: "/servidor",
});

export const PUBLIC_ROUTES = Object.freeze([
  ROUTES.login,
  ROUTES.passwordRequest,
  ROUTES.passwordReset,
  ROUTES.activateAccount,
]);

export const TECHNICAL_PUBLIC_ROUTES = Object.freeze([
  ...PUBLIC_ROUTES,
]);

export const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ROUTES.activateAccount,
    paths: Object.freeze([ROUTES.activateAccount]),
    tokenParamNames: Object.freeze([TOKEN_PARAM]),
  }),

  Object.freeze({
    key: "passwordReset",
    path: ROUTES.passwordReset,
    paths: Object.freeze([ROUTES.passwordReset]),
    tokenParamNames: Object.freeze([TOKEN_PARAM]),
  }),
]);

/* =========================================================
   API ENDPOINTS
========================================================= */

export const AUTH_ENDPOINTS = Object.freeze({
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  refresh: "/api/auth/refresh",

  activate: "/api/auth/activate",
  requestPasswordReset: "/api/auth/reset-password-request",
  confirmPasswordReset: "/api/auth/reset-password-confirm",
});

export const PUBLIC_API_PATHS = Object.freeze([
  AUTH_ENDPOINTS.login,
  AUTH_ENDPOINTS.refresh,
  AUTH_ENDPOINTS.activate,
  AUTH_ENDPOINTS.requestPasswordReset,
  AUTH_ENDPOINTS.confirmPasswordReset,
]);

export const PRIVATE_API_PATHS = Object.freeze([
  AUTH_ENDPOINTS.me,
  AUTH_ENDPOINTS.logout,
]);

/* =========================================================
   HELPERS
========================================================= */

function freeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function cleanOrigin(value = "") {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function normalizeApiBase(value = "") {
  const raw = text(value, CANONICAL_PRODUCTION_API_BASE).replace(/\/+$/g, "");

  if (!/^https?:\/\//i.test(raw)) {
    return CANONICAL_PRODUCTION_API_BASE;
  }

  const origin = cleanOrigin(raw);

  if (FORBIDDEN_FRONTEND_API_ORIGINS.includes(origin)) {
    return CANONICAL_PRODUCTION_API_BASE;
  }

  if (raw.endsWith("/api")) {
    return raw.slice(0, -4);
  }

  return origin || CANONICAL_PRODUCTION_API_BASE;
}

function isHashRouterPath(value = "") {
  const raw = text(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = text(value, "/");

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  if (raw.startsWith("#/")) {
    return raw.slice(1) || "/";
  }

  return raw || "/";
}

export function pathFromUrlLike(value = "") {
  const raw = text(value, "");

  if (!raw) return "";

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  if (raw.startsWith("//")) {
    return "/";
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);

      if (url.hash && isHashRouterPath(url.hash)) {
        return normalizeHashRouterPath(url.hash);
      }

      return `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return "/";
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return "/";
  }

  return raw;
}

function normalizePathname(pathname = "/") {
  let value = text(pathname, "/").replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value || "/";
}

export function normalizeRoutePath(path = "") {
  const raw = pathFromUrlLike(path);

  if (!raw) return "";

  return normalizePathname(raw.split("?")[0].split("#")[0] || "/");
}

export function normalizeEndpointPath(path = "") {
  return normalizeRoutePath(path);
}

function pathMatches(path = "", candidate = "") {
  return normalizeRoutePath(path) === normalizeRoutePath(candidate);
}

function endpointInList(path = "", list = []) {
  const clean = normalizeEndpointPath(path);

  if (!clean) return false;

  return list.some((item) => {
    const endpoint = normalizeEndpointPath(item);
    return clean === endpoint || clean.startsWith(`${endpoint}/`);
  });
}

/* =========================================================
   USER HOME
========================================================= */

export function normalizeUserSlug(value = "") {
  const slug = text(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

export function extractUserHomeSlugFromRoute(path = "") {
  const route = normalizeRoutePath(path);

  if (!route.startsWith(USER_HOME_PREFIX)) return "";

  const slug = route.slice(USER_HOME_PREFIX.length);

  if (!slug || slug.includes("/")) return "";

  return normalizeUserSlug(slug);
}

export function isUserHomeRoute(path = "") {
  return Boolean(extractUserHomeSlugFromRoute(path));
}

export function buildUserHomeRoute(slug = "") {
  const clean = normalizeUserSlug(slug);
  return clean ? `${USER_HOME_PREFIX}${clean}` : ROUTES.home;
}

export function canonicalRoutePath(path = "") {
  const route = normalizeRoutePath(path);
  return isUserHomeRoute(route) ? ROUTES.home : route;
}

/* =========================================================
   CONFIG
========================================================= */

export const config = freeze({
  __version: CONFIG_VERSION,

  appName: "Onion Support",
  name: "Onion Support",
  appId: "onion",
  appKey: "onion",
  version: "1.0.0",

  env: "production",
  environment: "production",
  debug: false,

  apiBase: CANONICAL_PRODUCTION_API_BASE,
  apiOrigin: CANONICAL_PRODUCTION_API_BASE,
  apiUrl: CANONICAL_PRODUCTION_API_BASE,

  canonicalProductionApiBase: CANONICAL_PRODUCTION_API_BASE,
  canonicalBackendApiOrigins: CANONICAL_BACKEND_API_ORIGINS,
  forbiddenFrontendApiOrigins: FORBIDDEN_FRONTEND_API_ORIGINS,

  defaultLang: "es",
  fallbackLang: "es",
  supportedLangs: freeze(["es", "ca", "en"]),

  defaultTheme: "system",

  userHomePrefix: USER_HOME_PREFIX,

  routes: ROUTES,
  routeAliases: freeze({}),

  publicRoutes: PUBLIC_ROUTES,
  authLikeRoutes: PUBLIC_ROUTES,
  technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
  protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,

  tokenParam: TOKEN_PARAM,

  publicApiPaths: PUBLIC_API_PATHS,
  privateApiPaths: PRIVATE_API_PATHS,

  api: freeze({
    base: CANONICAL_PRODUCTION_API_BASE,
    baseUrl: CANONICAL_PRODUCTION_API_BASE,
    origin: CANONICAL_PRODUCTION_API_BASE,
    prefix: "/api",
    timeout: 30000,
    retries: 0,
    withCredentials: true,

    publicPaths: PUBLIC_API_PATHS,
    privatePaths: PRIVATE_API_PATHS,

    headers: freeze({
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
  }),

  auth: freeze({
    bearerPrefix: "Bearer",
    tokenHeader: "Authorization",

    loginRoute: ROUTES.login,
    homeRoute: ROUTES.home,
    homeCanonicalRoute: ROUTES.home,
    userHomePrefix: USER_HOME_PREFIX,
    postLoginFallback: ROUTES.home,

    allowedRoles: freeze(["admin", "user"]),

    endpoints: AUTH_ENDPOINTS,

    endpointCandidates: freeze({
      login: freeze([AUTH_ENDPOINTS.login]),
      logout: freeze([AUTH_ENDPOINTS.logout]),
      me: freeze([AUTH_ENDPOINTS.me]),
      refresh: freeze([AUTH_ENDPOINTS.refresh]),
      activate: freeze([AUTH_ENDPOINTS.activate]),
      requestPasswordReset: freeze([AUTH_ENDPOINTS.requestPasswordReset]),
      confirmPasswordReset: freeze([AUTH_ENDPOINTS.confirmPasswordReset]),
    }),

    endpointGroups: freeze({
      public: PUBLIC_API_PATHS,
      private: PRIVATE_API_PATHS,

      session: freeze([
        AUTH_ENDPOINTS.login,
        AUTH_ENDPOINTS.logout,
        AUTH_ENDPOINTS.me,
        AUTH_ENDPOINTS.refresh,
      ]),

      activation: freeze([
        AUTH_ENDPOINTS.activate,
      ]),

      passwordReset: freeze([
        AUTH_ENDPOINTS.requestPasswordReset,
        AUTH_ENDPOINTS.confirmPasswordReset,
      ]),
    }),

    publicApiPaths: PUBLIC_API_PATHS,
    privateApiPaths: PRIVATE_API_PATHS,

    publicRoutes: PUBLIC_ROUTES,
    technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
    publicTechnicalRoutes: TECHNICAL_PUBLIC_ROUTES,
    protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,

    tokenParamNames: freeze({
      generic: freeze([TOKEN_PARAM]),
      activation: freeze([TOKEN_PARAM]),
      reset: freeze([TOKEN_PARAM]),
      refresh: freeze([TOKEN_PARAM]),
      twoFactor: freeze([]),
    }),

    session: freeze({
      restoreOnBoot: true,
      requireTokenForAuthenticated: true,
      clearGhostUserWithoutToken: true,
      userHomePrefix: USER_HOME_PREFIX,
    }),
  }),

  ui: freeze({
    defaultTheme: "system",
    theme: "system",

    shellId: "app-shell",
    loaderId: "app-loader",
    sidebarMountId: "sidebar-mount",
    topbarMountId: "topbar-mount",
    viewContainerId: "view-container",
    mainContentId: "main-content",
    appContentId: "app-content",
    tableheadId: "table-head",
    tableheadContainerId: "tablehead-container",
  }),

  i18n: freeze({
    defaultLang: "es",
    fallbackLang: "es",
    supported: freeze(["es", "ca", "en"]),
  }),

  router: freeze({
    mode: "history",
    base: "/",

    defaultRoute: ROUTES.home,
    loginRoute: ROUTES.login,

    homeCanonicalRoute: ROUTES.home,
    userHomePrefix: USER_HOME_PREFIX,

    routes: ROUTES,
    routeAliases: freeze({}),

    publicRoutes: PUBLIC_ROUTES,
    authLikeRoutes: PUBLIC_ROUTES,
    technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
    protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,
  }),

  loader: freeze({
    staticLoaderId: "app-loader",
    bootClass: "app-booting",
    loadingClass: "app-loading",
    readyClass: "app-ready",
    fatalClass: "app-fatal",
    hiddenClass: "is-hidden",
    visibleClass: "is-visible",
  }),

  events: freeze({
    ready: "app:ready",
    bootStart: "app:boot:start",
    bootReady: "app:boot:ready",
    bootComplete: "app:boot:complete",
    bootError: "app:boot:error",
    coreReady: "app:core:ready",
    stateChange: "app:state:change",
    authChange: "app:auth:change",
  }),

  featureFlags: freeze({
    restoreSessionOnBoot: true,
    requireAuthorizationForMe: true,
    keepMeEndpointPrivate: true,
    userSlugHome: true,
    twoFactorEnabled: false,
    mfaEnabled: false,
    otpEnabled: false,
  }),

  diagnostics: freeze({
    enabled: false,
    logPrefix: "[Onion]",
    redactTokens: true,
  }),

  security: freeze({
    privateSpa: true,
    noIndex: true,
    redactTokens: true,

    tokenParam: TOKEN_PARAM,

    canonicalProductionApiBase: CANONICAL_PRODUCTION_API_BASE,
    canonicalBackendApiOrigins: CANONICAL_BACKEND_API_ORIGINS,
    forbiddenFrontendApiOrigins: FORBIDDEN_FRONTEND_API_ORIGINS,

    sensitiveQueryParams: freeze([TOKEN_PARAM]),
  }),
});

/* =========================================================
   PUBLIC HELPERS
========================================================= */

export function getConfig() {
  return config;
}

export function getApiBase() {
  return normalizeApiBase(config.apiBase);
}

export function getApiOrigin() {
  return normalizeApiBase(config.apiOrigin || config.apiBase);
}

export function getCanonicalProductionApiBase() {
  return CANONICAL_PRODUCTION_API_BASE;
}

export function isForbiddenFrontendApiOrigin(value = "") {
  return FORBIDDEN_FRONTEND_API_ORIGINS.includes(cleanOrigin(value));
}

export function isCanonicalBackendApiBase(value = "") {
  return CANONICAL_BACKEND_API_ORIGINS.includes(cleanOrigin(value));
}

export function getRoute(key = "home", fallback = "/") {
  return config.routes[key] || fallback;
}

export function getRouteAlias() {
  return "";
}

/*
  Compat:
  Config no gestiona storage real.
*/
export function getStorageKey(key = "", fallback = "") {
  return fallback || key;
}

export function getNamespacedStorageKey(key = "") {
  return `onion:${getStorageKey(key, key)}`;
}

export function isPublicApiPath(path = "") {
  const clean = normalizeEndpointPath(path);

  if (clean === AUTH_ENDPOINTS.me) return false;

  return config.publicApiPaths.some((item) => pathMatches(clean, item));
}

export function isPrivateApiPath(path = "") {
  const clean = normalizeEndpointPath(path);

  if (clean === AUTH_ENDPOINTS.me) return true;

  return config.privateApiPaths.some((item) => pathMatches(clean, item));
}

export function isTechnicalPublicRoute(path = "") {
  return config.technicalPublicRoutes.some((item) => pathMatches(canonicalRoutePath(path), item));
}

export function isPublicRoute(path = "") {
  return config.publicRoutes.some((item) => pathMatches(canonicalRoutePath(path), item));
}

export function isAuthLikeRoute(path = "") {
  return config.authLikeRoutes.some((item) => pathMatches(canonicalRoutePath(path), item));
}

export function getProtectedPublicTokenRoutes() {
  return config.protectedPublicTokenRoutes;
}

export function getAuthEndpoint(key = "") {
  return config.auth.endpoints[key] || "";
}

export function getAuthEndpointCandidates(key = "") {
  return [...(config.auth.endpointCandidates[key] || [])];
}

export function getAuthEndpointGroup(key = "") {
  return [...(config.auth.endpointGroups[key] || [])];
}

export function getResourceEndpoint() {
  return "";
}

export function getConfigSnapshot() {
  return {
    version: config.__version,

    appName: config.appName,
    env: config.env,

    apiBase: config.apiBase,

    defaultLang: config.defaultLang,
    fallbackLang: config.fallbackLang,
    defaultTheme: config.defaultTheme,

    routes: config.routes,
    publicRoutes: config.publicRoutes,
    technicalPublicRoutes: config.technicalPublicRoutes,

    userHome: {
      prefix: USER_HOME_PREFIX,
      canonical: ROUTES.home,
    },

    publicApiPaths: config.publicApiPaths,
    privateApiPaths: config.privateApiPaths,

    tokenParam: config.tokenParam,

    meIsPublic: isPublicApiPath(AUTH_ENDPOINTS.me),
    meIsPrivate: isPrivateApiPath(AUTH_ENDPOINTS.me),

    policy: {
      apiUnique: true,
      tokenParamUnique: true,

      noRouteAliases: true,
      noHomeRoute: true,

      roles: ["admin", "user"],

      langBase: "es",

      userSlugHome: true,
      preservesAtSlug: true,

      noRuntime: true,
      no2fa: true,
      noOtp: true,
      noMfa: true,
    },
  };
}

export default config;
