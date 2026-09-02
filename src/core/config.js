/* =========================================================
   Onion Support - Core Config
   Archivo: /src/core/config.js

   Responsabilidad:
   - Config estática mínima del frontend.
   - API real única.
   - Rutas reales actuales.
   - Roles únicos: admin / user.
   - Home interna: /.
   - Home visible autenticada: /@{user.slug}.
   - Endpoints auth alineados con backend productivo.
   - Reset password:
       frontend request  -> /password-request
       frontend confirm  -> /password-reset?token=...
       backend request   -> /api/auth/reset-password-request
       backend confirm   -> /api/auth/reset-password-confirm
   - Denylist técnica centralizada.
   - Helpers puros de path/ruta/API.
   - Sin runtime.
   - Sin storage.
   - Sin sesión.
   - Sin i18n funcional.
   - Sin 2FA/MFA/OTP.
========================================================= */

export const CONFIG_VERSION = "core.config.production.v8-direct-api-final";

/* =========================================================
   CONSTANTES BASE
========================================================= */

export const CANONICAL_PRODUCTION_API_BASE = "https://api.onionsupport.com";

export const CANONICAL_BACKEND_API_ORIGINS = Object.freeze([
  CANONICAL_PRODUCTION_API_BASE,
]);

export const CANONICAL_FRONTEND_ORIGINS = Object.freeze([
  "https://onionsupport.com",
]);

export const TOKEN_PARAM = "token";
export const USER_HOME_PREFIX = "/@";

export const ALLOWED_ROLES = Object.freeze([
  "admin",
  "user",
]);

export const SUPPORTED_LANGS = Object.freeze([
  "es",
]);

export const SENSITIVE_QUERY_PARAMS = Object.freeze([
  TOKEN_PARAM,
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "id_token",
  "idToken",
  "jwt",
  "authorization",
  "session",
  "sessionId",
  "session_id",
  "secret",
  "code",
  "password",
  "pwd",
  "key",
  "sig",
  "signature",
  "reset_token",
  "resetToken",
  "activation_token",
  "activationToken",
]);

/* =========================================================
   RUTAS SPA
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
  usuarios: "/usuarios",
  empleados: "/empleados",
  correo: "/correo",
  servidor: "/servidor",
  cuenta: "/cuenta",
  ajustes: "/ajustes",
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
  ROUTES.empleados,
  ROUTES.correo,
  ROUTES.servidor,
]);

export const PRIVATE_ROUTES = Object.freeze([
  ROUTES.home,
  ROUTES.incidencias,
  ROUTES.facturas,
  ROUTES.cuenta,
  ROUTES.ajustes,
  ...ADMIN_ROUTES,
]);

export const BLOCKED_FRONTEND_ROUTES = Object.freeze([
  "/home",
  "/403",
  "/404",
  "/2fa",
  "/mfa",
  "/otp",
  "/api",
  "/.auth",
  "/docs",
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

  /*
    Contrato productivo de recuperación:
    - solicitud del correo
    - confirmación de nueva contraseña
  */
  requestPasswordReset: "/api/auth/reset-password-request",
  confirmPasswordReset: "/api/auth/reset-password-confirm",

  /*
    Aliases mantenidos por compatibilidad con módulos existentes.
  */
  passwordRequest: "/api/auth/reset-password-request",
  passwordReset: "/api/auth/reset-password-confirm",
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
   BASICS
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

function hasOwn(object = {}, key = "") {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
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
  return Boolean(isBrowser() && origin && origin === window.location.origin);
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

  if (!origin) return CANONICAL_PRODUCTION_API_BASE;
  if (!isAllowedBackendOrigin(origin)) return CANONICAL_PRODUCTION_API_BASE;

  return origin;
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

  return current === target || current.startsWith(`${target}/`);
}

function pathMatches(path = "", candidate = "") {
  return normalizeRoutePath(path) === normalizeRoutePath(candidate);
}

function endpointMatches(path = "", candidate = "") {
  return normalizeEndpointPath(path) === normalizeEndpointPath(candidate);
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

/* =========================================================
   URL / PATH
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

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "/";
  if (/[\r\n\t\\]/.test(raw)) return "/";

  return raw;
}

export function endpointPathFromUrlLike(value = "") {
  const raw = text(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";

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

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";

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
   USER SCOPE
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
  return getUserScopedRouteInfo(path).scoped === true;
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
  if (isPublicRoute(canonical)) return canonical;
  if (isBlockedRoutePath(canonical)) return buildUserHomeRoute(clean);
  if (canonical === ROUTES.home) return buildUserHomeRoute(clean);

  return `${USER_HOME_PREFIX}${clean}${canonical}`;
}

/* =========================================================
   ROUTE POLICY
========================================================= */

function isBlockedNormalizedPath(path = "") {
  const clean = normalizePathname(path).toLowerCase();

  return BLOCKED_FRONTEND_ROUTES.some((blocked) =>
    pathIsOrStartsWith(clean, blocked)
  );
}

export function isBlockedRoutePath(path = "") {
  const route = normalizeRoutePath(path) || "/";
  const scoped = getUserScopedRouteInfo(route);

  if (isBlockedNormalizedPath(route)) return true;
  if (scoped.scoped && isBlockedNormalizedPath(scoped.restPath)) return true;

  return false;
}

export const isLegacyBlockedRoute = isBlockedRoutePath;

export function canonicalRoutePath(path = "") {
  if (isBlockedRoutePath(path)) return "";

  const info = getUserScopedRouteInfo(path);

  return info.scoped ? info.canonicalPath : normalizeRoutePath(path);
}

export function isPublicRoute(path = "") {
  if (isBlockedRoutePath(path)) return false;

  const scoped = getUserScopedRouteInfo(path);

  if (scoped.scoped) return false;

  const route = canonicalRoutePath(path);

  return PUBLIC_ROUTES.some((item) => pathMatches(route, item));
}

export function isTechnicalPublicRoute(path = "") {
  return isPublicRoute(path);
}

export function isAuthLikeRoute(path = "") {
  return isPublicRoute(path);
}

export function isAdminRoute(path = "") {
  if (isBlockedRoutePath(path)) return false;

  const route = canonicalRoutePath(path);

  return ADMIN_ROUTES.some((item) => pathIsOrStartsWith(route, item));
}

/* =========================================================
   API POLICY
========================================================= */

export function isPublicApiPath(path = "") {
  const clean = normalizeEndpointPath(path);

  if (!clean) return false;
  if (clean === AUTH_ENDPOINTS.me) return false;

  return PUBLIC_API_PATHS.some((item) => endpointMatches(clean, item));
}

export function isPrivateApiPath(path = "") {
  const clean = normalizeEndpointPath(path);

  if (!clean) return false;
  if (clean === AUTH_ENDPOINTS.me) return true;

  return PRIVATE_API_PATHS.some((item) => endpointMatches(clean, item));
}

/* =========================================================
   CONFIG OBJECT
========================================================= */

export const config = freeze({
  __version: CONFIG_VERSION,

  appName: "Onion Support",
  name: "Onion Support",
  version: "1.0.0",

  env: "production",
  environment: "production",
  debug: false,

  apiBase: CANONICAL_PRODUCTION_API_BASE,
  apiOrigin: CANONICAL_PRODUCTION_API_BASE,
  apiUrl: CANONICAL_PRODUCTION_API_BASE,

  defaultLang: "es",
  fallbackLang: "es",
  supportedLangs: SUPPORTED_LANGS,

  defaultTheme: "system",

  tokenParam: TOKEN_PARAM,
  userHomePrefix: USER_HOME_PREFIX,
  sensitiveQueryParams: SENSITIVE_QUERY_PARAMS,

  routes: ROUTES,
  publicRoutes: PUBLIC_ROUTES,
  authLikeRoutes: PUBLIC_ROUTES,
  technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
  privateRoutes: PRIVATE_ROUTES,
  adminRoutes: ADMIN_ROUTES,
  blockedFrontendRoutes: BLOCKED_FRONTEND_ROUTES,
  protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,

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
  }),

  auth: freeze({
    bearerPrefix: "Bearer",
    tokenHeader: "Authorization",

    loginRoute: ROUTES.login,
    homeRoute: ROUTES.home,
    userHomePrefix: USER_HOME_PREFIX,

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
      tokenRotationDoesNotLogout: true,
      emptyAccessTokenDoesNotClearUser: true,
    }),
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
    privateRoutes: PRIVATE_ROUTES,
    adminRoutes: ADMIN_ROUTES,
    blockedFrontendRoutes: BLOCKED_FRONTEND_ROUTES,
    protectedPublicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,
  }),

  ui: freeze({
    shellId: "app-shell",
    loaderId: "app-loader",
    sidebarMountId: "sidebar-mount",
    topbarMountId: "topbar-mount",
    mainContentId: "main-content",
    appContentId: "app-content",
    viewContainerId: "view-container",
    tableheadId: "table-head",
    tableheadContainerId: "tablehead-container",
    defaultTheme: "system",
  }),

  i18n: freeze({
    defaultLang: "es",
    fallbackLang: "es",
    supported: SUPPORTED_LANGS,
  }),

  security: freeze({
    privateSpa: true,
    noIndex: true,
    tokenParam: TOKEN_PARAM,
    sensitiveQueryParams: SENSITIVE_QUERY_PARAMS,
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
  const origin = cleanOrigin(value);

  return Boolean(
    origin &&
      (
        CANONICAL_FRONTEND_ORIGINS.includes(origin) ||
        isCurrentBrowserOrigin(origin)
      )
  );
}

export function isCanonicalFrontendOrigin(value = "") {
  return CANONICAL_FRONTEND_ORIGINS.includes(cleanOrigin(value));
}

export function isCanonicalBackendApiBase(value = "") {
  return isAllowedBackendOrigin(cleanOrigin(value));
}

export function getRoute(key = "home", fallback = "/") {
  return hasOwn(config.routes, key) ? config.routes[key] : fallback;
}

export function getRouteAlias() {
  return "";
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
    supportedLangs: config.supportedLangs,
    defaultTheme: config.defaultTheme,

    routes: config.routes,
    publicRoutes: config.publicRoutes,
    privateRoutes: config.privateRoutes,
    adminRoutes: config.adminRoutes,
    blockedFrontendRoutes: config.blockedFrontendRoutes,

    userHome: {
      prefix: USER_HOME_PREFIX,
      canonical: ROUTES.home,
    },

    authEndpoints: config.auth.endpoints,
    publicApiPaths: config.publicApiPaths,
    privateApiPaths: config.privateApiPaths,

    tokenParam: config.tokenParam,

    meIsPublic: isPublicApiPath(AUTH_ENDPOINTS.me),
    meIsPrivate: isPrivateApiPath(AUTH_ENDPOINTS.me),

    policy: {
      configOnly: true,
      apiUnique: true,
      roles: [...ALLOWED_ROLES],
      langBase: "es",
      userSlugHome: true,
      userScopedPrivateRoutes: true,
      noHomeRoute: true,
      noMfaOtp: true,
      minimal: true,
      resetPasswordContractAligned: true,
    },
  };
}

export default config;
