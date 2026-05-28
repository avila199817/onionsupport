/* =========================================================
   Onion Support - Core Config
   Archivo: /src/core/config.js

   Responsabilidad:
   - Config estática mínima del frontend.
   - API real única.
   - Rutas reales actuales.
   - Home interna: /.
   - Home visible autenticada: /@{user.slug}.
   - Rutas privadas visibles: /@{user.slug}/{ruta}.
   - Rutas admin reales: clientes, usuarios, servidor.
   - Auth endpoints mínimos alineados con backend.
   - /api/auth/me siempre privado.
   - /api/auth/refresh público y sin Authorization.
   - Token param único: token.
   - Roles únicos: admin / user.
   - Idioma base primario: es.
   - Denylist legacy centralizada.
   - Sesión persistente con restore/silent refresh.
   - Sin rutas inventadas.
   - Sin /home como ruta real.
   - Sin storage real.
   - Sin runtime complejo.
   - Sin 2FA/MFA/OTP funcional.
========================================================= */

export const CONFIG_VERSION = "core.config.v10";

export const CANONICAL_PRODUCTION_API_BASE = "https://api.onionit.net";

export const CANONICAL_BACKEND_API_ORIGINS = Object.freeze([
  CANONICAL_PRODUCTION_API_BASE,
]);

export const CANONICAL_FRONTEND_ORIGINS = Object.freeze([
  "https://onionsupport.com",
  "https://www.onionsupport.com",
]);

export const KNOWN_FRONTEND_ORIGINS = Object.freeze([
  ...CANONICAL_FRONTEND_ORIGINS,
  "http://onionsupport.com",
  "http://www.onionsupport.com",
]);

export const FORBIDDEN_FRONTEND_API_ORIGINS = KNOWN_FRONTEND_ORIGINS;

export const TOKEN_PARAM = "token";
export const USER_HOME_PREFIX = "/@";

export const ALLOWED_ROLES = Object.freeze([
  "admin",
  "user",
]);

export const SUPPORTED_LANGS = Object.freeze([
  "es",
  "ca",
  "en",
]);

export const BLOCKED_FRONTEND_ROUTES = Object.freeze([
  "/home",
  "/403",
  "/404",
  "/2fa",
  "/mfa",
  "/otp",
]);

export const SENSITIVE_QUERY_PARAMS = Object.freeze([
  TOKEN_PARAM,
  "access_token",
  "refresh_token",
  "id_token",
  "jwt",
  "authorization",
  "session",
  "secret",
  "code",
  "password",
  "pwd",
  "key",
  "sig",
  "signature",
  "reset_token",
  "activation_token",
]);

/* =========================================================
   ROUTES
========================================================= */

export const ROUTES = Object.freeze({
  root: "/",
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

export const TECHNICAL_PUBLIC_ROUTES = PUBLIC_ROUTES;

export const ADMIN_ROUTES = Object.freeze([
  ROUTES.clientes,
  ROUTES.usuarios,
  ROUTES.servidor,
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
  logoutAll: "/api/auth/logout-all",

  me: "/api/auth/me",
  refresh: "/api/auth/refresh",

  activate: "/api/auth/activate-account",
  activateAccount: "/api/auth/activate-account",

  requestPasswordReset: "/api/auth/password-request",
  confirmPasswordReset: "/api/auth/password-reset",

  passwordRequest: "/api/auth/password-request",
  passwordReset: "/api/auth/password-reset",
});

export const PUBLIC_API_PATHS = Object.freeze([
  AUTH_ENDPOINTS.login,
  AUTH_ENDPOINTS.refresh,
  AUTH_ENDPOINTS.activateAccount,
  AUTH_ENDPOINTS.requestPasswordReset,
  AUTH_ENDPOINTS.confirmPasswordReset,
]);

export const PRIVATE_API_PATHS = Object.freeze([
  AUTH_ENDPOINTS.me,
  AUTH_ENDPOINTS.logout,
  AUTH_ENDPOINTS.logoutAll,
]);

/* =========================================================
   INTERNAL HELPERS
========================================================= */

function freeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(Object(obj), key);
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanOrigin(value = "") {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isCurrentBrowserOrigin(origin = "") {
  return Boolean(
    isBrowser() &&
      origin &&
      origin === window.location.origin
  );
}

function isAllowedFrontendOrigin(origin = "") {
  return Boolean(
    CANONICAL_FRONTEND_ORIGINS.includes(origin) ||
      isCurrentBrowserOrigin(origin)
  );
}

function isAllowedBackendOrigin(origin = "") {
  return CANONICAL_BACKEND_API_ORIGINS.includes(origin);
}

function normalizeApiBase(value = "") {
  const raw = text(value, CANONICAL_PRODUCTION_API_BASE).replace(/\/+$/g, "");

  if (!/^https?:\/\//i.test(raw)) {
    return CANONICAL_PRODUCTION_API_BASE;
  }

  const origin = cleanOrigin(raw);

  if (!origin) {
    return CANONICAL_PRODUCTION_API_BASE;
  }

  if (FORBIDDEN_FRONTEND_API_ORIGINS.includes(origin)) {
    return CANONICAL_PRODUCTION_API_BASE;
  }

  if (!isAllowedBackendOrigin(origin)) {
    return CANONICAL_PRODUCTION_API_BASE;
  }

  return origin;
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

function normalizePathname(pathname = "/") {
  let value = text(pathname, "/")
    .split("#")[0]
    .split("?")[0]
    .replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value || "/";
}

function pathIsOrStartsWith(path = "", candidate = "") {
  const current = normalizePathname(path).toLowerCase();
  const target = normalizePathname(candidate).toLowerCase();

  return Boolean(
    current === target ||
      current.startsWith(`${target}/`)
  );
}

function pathMatches(path = "", candidate = "") {
  const current = normalizeRoutePath(path);
  const target = normalizeRoutePath(candidate);

  return Boolean(current && target && current === target);
}

function endpointMatches(path = "", candidate = "") {
  const current = normalizeEndpointPath(path);
  const target = normalizeEndpointPath(candidate);

  return Boolean(current && target && current === target);
}

function isBlockedNormalizedPath(path = "") {
  const clean = normalizePathname(path).toLowerCase();

  return BLOCKED_FRONTEND_ROUTES.some((blocked) =>
    pathIsOrStartsWith(clean, blocked)
  );
}

/* =========================================================
   URL / PATH NORMALIZATION
========================================================= */

export function routePathFromUrlLike(value = "") {
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

      if (!isAllowedFrontendOrigin(url.origin)) {
        return "/";
      }

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

  if (/[\r\n\t\\]/.test(raw)) {
    return "/";
  }

  return raw;
}

export function endpointPathFromUrlLike(value = "") {
  const raw = text(value, "");

  if (!raw) return "";

  if (raw.startsWith("//")) {
    return "";
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);

      if (!isAllowedBackendOrigin(url.origin)) {
        return "";
      }

      return `${url.pathname || "/"}${url.search || ""}`;
    }
  } catch {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return "";
  }

  if (/[\r\n\t\\]/.test(raw)) {
    return "";
  }

  return raw;
}

export function pathFromUrlLike(value = "") {
  return routePathFromUrlLike(value);
}

export function normalizeRoutePath(path = "") {
  const raw = routePathFromUrlLike(path);

  if (!raw) return "";

  return normalizePathname(raw);
}

export function normalizeEndpointPath(path = "") {
  const raw = endpointPathFromUrlLike(path);

  if (!raw) return "";

  return normalizePathname(raw);
}

/* =========================================================
   USER SCOPE / HOME
========================================================= */

export function normalizeUserSlug(value = "") {
  const slug = text(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

export function getUserScopedRouteInfo(path = "") {
  const route = normalizeRoutePath(path);

  if (!route.startsWith(USER_HOME_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: route || ROUTES.home,
      canonicalPath: route || ROUTES.home,
      lookupPath: route || ROUTES.home,
    };
  }

  const rest = route.slice(USER_HOME_PREFIX.length);
  const [slugSegment = "", ...restSegments] = rest.split("/");
  const slug = normalizeUserSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: route,
      canonicalPath: route,
      lookupPath: route,
    };
  }

  const restPath = restSegments.length
    ? normalizePathname(`/${restSegments.join("/")}`)
    : ROUTES.home;

  return {
    scoped: true,
    home: restPath === ROUTES.home,
    slug,
    restPath,
    canonicalPath: restPath,
    lookupPath: restPath,
  };
}

export function extractUserScopedSlugFromRoute(path = "") {
  return getUserScopedRouteInfo(path).slug;
}

export function extractUserHomeSlugFromRoute(path = "") {
  const info = getUserScopedRouteInfo(path);
  return info.home ? info.slug : "";
}

export function isUserScopedRoute(path = "") {
  return Boolean(getUserScopedRouteInfo(path).scoped);
}

export function isUserHomeRoute(path = "") {
  return Boolean(extractUserHomeSlugFromRoute(path));
}

export function buildUserHomeRoute(slug = "") {
  const clean = normalizeUserSlug(slug);
  return clean ? `${USER_HOME_PREFIX}${clean}` : ROUTES.home;
}

export function buildUserScopedRoute(slug = "", route = ROUTES.home) {
  const clean = normalizeUserSlug(slug);
  const canonical = normalizeRoutePath(route) || ROUTES.home;

  if (!clean) return canonical;
  if (canonical === ROUTES.home) return `${USER_HOME_PREFIX}${clean}`;

  return `${USER_HOME_PREFIX}${clean}${canonical}`;
}

export function isBlockedRoutePath(path = "") {
  const route = normalizeRoutePath(path) || "/";
  const scoped = getUserScopedRouteInfo(route);

  if (isBlockedNormalizedPath(route)) return true;

  if (scoped.scoped && isBlockedNormalizedPath(scoped.restPath)) {
    return true;
  }

  return false;
}

export const isLegacyBlockedRoute = isBlockedRoutePath;

export function canonicalRoutePath(path = "") {
  if (isBlockedRoutePath(path)) return "";

  const info = getUserScopedRouteInfo(path);
  return info.scoped ? info.canonicalPath : normalizeRoutePath(path);
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
  canonicalFrontendOrigins: CANONICAL_FRONTEND_ORIGINS,
  knownFrontendOrigins: KNOWN_FRONTEND_ORIGINS,
  forbiddenFrontendApiOrigins: FORBIDDEN_FRONTEND_API_ORIGINS,

  defaultLang: "es",
  fallbackLang: "es",
  supportedLangs: SUPPORTED_LANGS,

  defaultTheme: "system",

  userHomePrefix: USER_HOME_PREFIX,

  routes: ROUTES,

  publicRoutes: PUBLIC_ROUTES,
  authLikeRoutes: PUBLIC_ROUTES,
  technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,

  adminRoutes: ADMIN_ROUTES,

  protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,

  blockedFrontendRoutes: BLOCKED_FRONTEND_ROUTES,

  tokenParam: TOKEN_PARAM,
  sensitiveQueryParams: SENSITIVE_QUERY_PARAMS,

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

    allowedRoles: ALLOWED_ROLES,

    endpoints: AUTH_ENDPOINTS,

    endpointGroups: freeze({
      public: PUBLIC_API_PATHS,
      private: PRIVATE_API_PATHS,

      session: freeze([
        AUTH_ENDPOINTS.login,
        AUTH_ENDPOINTS.logout,
        AUTH_ENDPOINTS.logoutAll,
        AUTH_ENDPOINTS.me,
        AUTH_ENDPOINTS.refresh,
      ]),

      activation: freeze([
        AUTH_ENDPOINTS.activateAccount,
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
    }),

    session: freeze({
      persistent: true,
      restoreOnBoot: true,
      silentRefresh: true,
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
    supported: SUPPORTED_LANGS,
  }),

  router: freeze({
    mode: "history",
    base: "/",

    defaultRoute: ROUTES.home,
    loginRoute: ROUTES.login,

    homeCanonicalRoute: ROUTES.home,
    userHomePrefix: USER_HOME_PREFIX,
    userScopedPrivateRoutes: true,

    routes: ROUTES,

    publicRoutes: PUBLIC_ROUTES,
    authLikeRoutes: PUBLIC_ROUTES,
    technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,

    adminRoutes: ADMIN_ROUTES,

    protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,
    blockedFrontendRoutes: BLOCKED_FRONTEND_ROUTES,
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

  featureFlags: freeze({
    restoreSessionOnBoot: true,
    silentRefresh: true,
    persistentSession: true,

    requireAuthorizationForMe: true,
    keepMeEndpointPrivate: true,

    userSlugHome: true,
    userScopedPrivateRoutes: true,
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
    sensitiveQueryParams: SENSITIVE_QUERY_PARAMS,

    canonicalProductionApiBase: CANONICAL_PRODUCTION_API_BASE,
    canonicalBackendApiOrigins: CANONICAL_BACKEND_API_ORIGINS,
    canonicalFrontendOrigins: CANONICAL_FRONTEND_ORIGINS,
    knownFrontendOrigins: KNOWN_FRONTEND_ORIGINS,
    forbiddenFrontendApiOrigins: FORBIDDEN_FRONTEND_API_ORIGINS,
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

export function isCanonicalFrontendOrigin(value = "") {
  const origin = cleanOrigin(value);
  return CANONICAL_FRONTEND_ORIGINS.includes(origin);
}

export function isCanonicalBackendApiBase(value = "") {
  return isAllowedBackendOrigin(cleanOrigin(value));
}

export function getRoute(key = "home", fallback = "/") {
  if (hasOwn(config.routes, key)) {
    return config.routes[key];
  }

  return fallback;
}

export function getRouteAlias() {
  return "";
}

export function isPublicApiPath(path = "") {
  const clean = normalizeEndpointPath(path);

  if (!clean) return false;
  if (clean === AUTH_ENDPOINTS.me) return false;

  return config.publicApiPaths.some((item) => endpointMatches(clean, item));
}

export function isPrivateApiPath(path = "") {
  const clean = normalizeEndpointPath(path);

  if (!clean) return false;
  if (clean === AUTH_ENDPOINTS.me) return true;

  return config.privateApiPaths.some((item) => endpointMatches(clean, item));
}

export function isTechnicalPublicRoute(path = "") {
  if (isBlockedRoutePath(path)) return false;

  const scoped = getUserScopedRouteInfo(path);

  if (scoped.scoped) return false;

  const route = canonicalRoutePath(path);

  return config.technicalPublicRoutes.some((item) => pathMatches(route, item));
}

export function isPublicRoute(path = "") {
  if (isBlockedRoutePath(path)) return false;

  const scoped = getUserScopedRouteInfo(path);

  if (scoped.scoped) return false;

  const route = canonicalRoutePath(path);

  return config.publicRoutes.some((item) => pathMatches(route, item));
}

export function isAuthLikeRoute(path = "") {
  return isPublicRoute(path);
}

export function isAdminRoute(path = "") {
  if (isBlockedRoutePath(path)) return false;

  const route = canonicalRoutePath(path);

  return config.adminRoutes.some((item) =>
    pathIsOrStartsWith(route, item)
  );
}

export function getProtectedPublicTokenRoutes() {
  return config.protectedPublicTokenRoutes;
}

export function getAuthEndpoint(key = "") {
  return config.auth.endpoints[key] || "";
}

export function getAuthEndpointCandidates(key = "") {
  const endpoint = getAuthEndpoint(key);
  return endpoint ? [endpoint] : [];
}

export function getAuthEndpointGroup(key = "") {
  return [...(config.auth.endpointGroups[key] || [])];
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
    adminRoutes: config.adminRoutes,
    blockedFrontendRoutes: config.blockedFrontendRoutes,

    userHome: {
      prefix: USER_HOME_PREFIX,
      canonical: ROUTES.home,
    },

    userScopedRoutes: {
      enabled: true,
      visiblePattern: "/@{user.slug}/{route}",
      homePattern: "/@{user.slug}",
    },

    authEndpoints: config.auth.endpoints,

    publicApiPaths: config.publicApiPaths,
    privateApiPaths: config.privateApiPaths,

    tokenParam: config.tokenParam,
    sensitiveQueryParams: config.sensitiveQueryParams,

    meIsPublic: isPublicApiPath(AUTH_ENDPOINTS.me),
    meIsPrivate: isPrivateApiPath(AUTH_ENDPOINTS.me),

    endpointsAligned: {
      login: AUTH_ENDPOINTS.login,
      refresh: AUTH_ENDPOINTS.refresh,
      me: AUTH_ENDPOINTS.me,
      logout: AUTH_ENDPOINTS.logout,
      logoutAll: AUTH_ENDPOINTS.logoutAll,
      activateAccount: AUTH_ENDPOINTS.activateAccount,
      passwordRequest: AUTH_ENDPOINTS.requestPasswordReset,
      passwordReset: AUTH_ENDPOINTS.confirmPasswordReset,
    },

    origins: {
      api: CANONICAL_PRODUCTION_API_BASE,
      backend: [...CANONICAL_BACKEND_API_ORIGINS],
      frontendCanonical: [...CANONICAL_FRONTEND_ORIGINS],
      frontendKnown: [...KNOWN_FRONTEND_ORIGINS],
    },

    policy: {
      configOnly: true,
      apiUnique: true,
      apiBaseCannotBeFrontend: true,
      tokenParamUnique: true,

      noHomeRoute: true,
      noRouteAliases: true,

      legacyRoutesOnlyAsDenylist: true,
      blockedHomeAlias: true,
      blocked403: true,
      blocked404: true,
      blocked2fa: true,
      blockedMfa: true,
      blockedOtp: true,

      blocksNestedLegacyRoutes: true,
      blocksUserScopedLegacyRoutes: true,
      publicRoutesCannotLiveUnderUserScope: true,

      roles: [...ALLOWED_ROLES],

      clientesAdminOnly: true,
      usuariosAdminOnly: true,
      servidorAdminOnly: true,

      langBase: "es",

      sessionPersistent: true,
      restoreSessionOnBoot: true,
      silentRefresh: true,

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      preservesAtSlug: true,

      noRuntime: true,
      noStorage: true,
      no2fa: true,
      noOtp: true,
      noMfa: true,

      invalidApiEndpointsReturnEmpty: true,
    },
  };
}

export default config;
