/* =========================================================
   Onion Support - Core Config
   Archivo: /src/core/config.js

   Responsabilidad:
   - Config estática mínima.
   - API real única.
   - Rutas reales actuales.
   - Auth endpoints mínimos.
   - Token param único: token.
   - Roles únicos: admin / user.
   - Sin rutas inventadas.
   - Sin aliases masivos.
   - Sin storage real.
   - Sin runtime complejo.
   - Sin magia negra.
========================================================= */

export const CONFIG_VERSION = "simple";

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

export const ROUTES = Object.freeze({
  home: "/",
  login: "/login",
  passwordRequest: "/password-request",
  passwordReset: "/password-reset",
  activateAccount: "/activate-account",
});

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

export const PUBLIC_ROUTES = Object.freeze([
  ROUTES.login,
  ROUTES.passwordRequest,
  ROUTES.passwordReset,
  ROUTES.activateAccount,
]);

export const TECHNICAL_PUBLIC_ROUTES = Object.freeze([
  ROUTES.passwordRequest,
  ROUTES.passwordReset,
  ROUTES.activateAccount,
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
   HELPERS
========================================================= */

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function cleanPath(value = "/") {
  let path = text(value, "/").split("?")[0].split("#")[0];

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/g, "");

  return path || "/";
}

function pathMatches(path = "", candidate = "") {
  return cleanPath(path) === cleanPath(candidate);
}

function originFromUrl(value = "") {
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

  const origin = originFromUrl(raw);

  if (FORBIDDEN_FRONTEND_API_ORIGINS.includes(origin)) {
    return CANONICAL_PRODUCTION_API_BASE;
  }

  if (raw.endsWith("/api")) {
    return raw.slice(0, -4);
  }

  return raw;
}

/* =========================================================
   CONFIG
========================================================= */

export const config = Object.freeze({
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

  defaultLang: "en",
  fallbackLang: "en",
  supportedLangs: Object.freeze(["ca", "es", "en"]),

  defaultTheme: "system",

  routes: ROUTES,
  routeAliases: Object.freeze({}),

  publicRoutes: PUBLIC_ROUTES,
  authLikeRoutes: PUBLIC_ROUTES,
  technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
  protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,

  tokenParam: TOKEN_PARAM,

  publicApiPaths: PUBLIC_API_PATHS,
  privateApiPaths: PRIVATE_API_PATHS,

  api: Object.freeze({
    base: CANONICAL_PRODUCTION_API_BASE,
    baseUrl: CANONICAL_PRODUCTION_API_BASE,
    origin: CANONICAL_PRODUCTION_API_BASE,
    prefix: "/api",
    timeout: 30000,
    retries: 0,
    withCredentials: true,
    publicPaths: PUBLIC_API_PATHS,
    privatePaths: PRIVATE_API_PATHS,
    headers: Object.freeze({
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
  }),

  auth: Object.freeze({
    bearerPrefix: "Bearer",
    tokenHeader: "Authorization",

    loginRoute: ROUTES.login,
    homeRoute: ROUTES.home,
    postLoginFallback: ROUTES.home,

    allowedRoles: Object.freeze(["admin", "user"]),

    endpoints: AUTH_ENDPOINTS,

    endpointCandidates: Object.freeze({
      login: Object.freeze([AUTH_ENDPOINTS.login]),
      logout: Object.freeze([AUTH_ENDPOINTS.logout]),
      me: Object.freeze([AUTH_ENDPOINTS.me]),
      refresh: Object.freeze([AUTH_ENDPOINTS.refresh]),
      activate: Object.freeze([AUTH_ENDPOINTS.activate]),
      requestPasswordReset: Object.freeze([AUTH_ENDPOINTS.requestPasswordReset]),
      confirmPasswordReset: Object.freeze([AUTH_ENDPOINTS.confirmPasswordReset]),
    }),

    endpointGroups: Object.freeze({
      public: PUBLIC_API_PATHS,
      private: PRIVATE_API_PATHS,
      session: Object.freeze([
        AUTH_ENDPOINTS.login,
        AUTH_ENDPOINTS.logout,
        AUTH_ENDPOINTS.me,
        AUTH_ENDPOINTS.refresh,
      ]),
      activation: Object.freeze([AUTH_ENDPOINTS.activate]),
      passwordReset: Object.freeze([
        AUTH_ENDPOINTS.requestPasswordReset,
        AUTH_ENDPOINTS.confirmPasswordReset,
      ]),
    }),

    publicApiPaths: PUBLIC_API_PATHS,
    privateApiPaths: PRIVATE_API_PATHS,

    technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
    publicTechnicalRoutes: TECHNICAL_PUBLIC_ROUTES,
    protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,

    tokenParamNames: Object.freeze({
      generic: Object.freeze([TOKEN_PARAM]),
      activation: Object.freeze([TOKEN_PARAM]),
      reset: Object.freeze([TOKEN_PARAM]),
    }),

    session: Object.freeze({
      restoreOnBoot: true,
      requireTokenForAuthenticated: true,
      clearGhostUserWithoutToken: true,
    }),
  }),

  ui: Object.freeze({
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

  i18n: Object.freeze({
    defaultLang: "en",
    fallbackLang: "en",
    supported: Object.freeze(["ca", "es", "en"]),
  }),

  router: Object.freeze({
    mode: "history",
    base: "/",
    defaultRoute: ROUTES.home,
    loginRoute: ROUTES.login,
    routes: ROUTES,
    routeAliases: Object.freeze({}),
    publicRoutes: PUBLIC_ROUTES,
    authLikeRoutes: PUBLIC_ROUTES,
    technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
    protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,
  }),

  loader: Object.freeze({
    staticLoaderId: "app-loader",
    bootClass: "app-booting",
    loadingClass: "app-loading",
    readyClass: "app-ready",
    fatalClass: "app-fatal",
    hiddenClass: "is-hidden",
    visibleClass: "is-visible",
  }),

  events: Object.freeze({
    ready: "app:ready",
    bootStart: "app:boot:start",
    bootReady: "app:boot:ready",
    bootComplete: "app:boot:complete",
    bootError: "app:boot:error",
    coreReady: "app:core:ready",
    stateChange: "app:state:change",
    authChange: "app:auth:change",
  }),

  featureFlags: Object.freeze({
    restoreSessionOnBoot: true,
    requireAuthorizationForMe: true,
    keepMeEndpointPrivate: true,
  }),

  diagnostics: Object.freeze({
    enabled: false,
    logPrefix: "[Onion]",
    redactTokens: true,
  }),

  security: Object.freeze({
    privateSpa: true,
    noIndex: true,
    redactTokens: true,
    tokenParam: TOKEN_PARAM,
    canonicalProductionApiBase: CANONICAL_PRODUCTION_API_BASE,
    canonicalBackendApiOrigins: CANONICAL_BACKEND_API_ORIGINS,
    forbiddenFrontendApiOrigins: FORBIDDEN_FRONTEND_API_ORIGINS,
    sensitiveQueryParams: Object.freeze([TOKEN_PARAM]),
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
  return FORBIDDEN_FRONTEND_API_ORIGINS.includes(originFromUrl(value));
}

export function isCanonicalBackendApiBase(value = "") {
  return CANONICAL_BACKEND_API_ORIGINS.includes(originFromUrl(value));
}

export function getRoute(key = "home", fallback = "/") {
  return config.routes[key] || fallback;
}

export function getRouteAlias() {
  return "";
}

/* Compat: no hay storage real en config simple. */
export function getStorageKey(key = "", fallback = "") {
  return fallback || key;
}

/* Compat: no usar para persistencia nueva. */
export function getNamespacedStorageKey(key = "") {
  return `onion:${getStorageKey(key, key)}`;
}

export function isPublicApiPath(path = "") {
  const clean = cleanPath(path);

  if (clean === AUTH_ENDPOINTS.me) return false;

  return config.publicApiPaths.some((item) => pathMatches(clean, item));
}

export function isPrivateApiPath(path = "") {
  const clean = cleanPath(path);

  if (clean === AUTH_ENDPOINTS.me) return true;

  return config.privateApiPaths.some((item) => pathMatches(clean, item));
}

export function isTechnicalPublicRoute(path = "") {
  return config.technicalPublicRoutes.some((item) => pathMatches(path, item));
}

export function isPublicRoute(path = "") {
  return config.publicRoutes.some((item) => pathMatches(path, item));
}

export function isAuthLikeRoute(path = "") {
  return config.authLikeRoutes.some((item) => pathMatches(path, item));
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
    defaultTheme: config.defaultTheme,

    routes: config.routes,
    publicRoutes: config.publicRoutes,
    technicalPublicRoutes: config.technicalPublicRoutes,

    publicApiPaths: config.publicApiPaths,
    privateApiPaths: config.privateApiPaths,

    tokenParam: config.tokenParam,

    meIsPublic: isPublicApiPath(AUTH_ENDPOINTS.me),
    meIsPrivate: isPrivateApiPath(AUTH_ENDPOINTS.me),

    policy: {
      apiUnique: true,
      tokenParamUnique: true,
      noRouteAliases: true,
      roles: ["admin", "user"],
      noRuntime: true,
    },
  };
}

export default config;
