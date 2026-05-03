/* =========================================================
   Onion SPA - Core Config
   Archivo: src/core/config.js

   Responsabilidades:
   - centralizar configuración global del núcleo
   - exponer rutas base
   - exponer rutas públicas técnicas
   - exponer claves de storage
   - exponer flags de auth, UI, router, loader y request
   - permitir overrides runtime seguros
   - evitar mutaciones accidentales

   HARDENING EXTREMO:
   - Object.freeze profundo
   - valores normalizados
   - compatibilidad con config legacy
   - rutas públicas/token centralizadas
   - storage keys namespaced
   - flags enterprise
   - publicApiPaths estrictas: /me NO es público
   - runtime overrides defensivos
   - snapshots seguros
========================================================= */

/* =========================================================
   HELPERS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isArray(value) {
  return Array.isArray(value);
}

function deepFreeze(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  try {
    const keys =
      Object.getOwnPropertyNames(value);

    for (const key of keys) {
      const child =
        value[key];

      if (
        child &&
        typeof child === "object" &&
        !Object.isFrozen(child)
      ) {
        deepFreeze(child);
      }
    }

    return Object.freeze(value);
  } catch {
    return value;
  }
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "1") return true;
  if (value === "0") return false;
  if (value === 1) return true;
  if (value === 0) return false;

  return Boolean(fallback);
}

function uniqueArray(values = []) {
  return Array.from(
    new Set(
      values.filter((item) =>
        item !== undefined &&
        item !== null &&
        item !== ""
      )
    )
  );
}

function normalizePath(path = "/") {
  let value =
    safeText(path, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      "/";
  }

  return value;
}

function stripSearchAndHash(path = "/") {
  return normalizePath(path)
    .split("?")[0]
    .split("#")[0] ||
    "/";
}

function normalizeBaseUrl(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  return raw.replace(/\/+$/g, "");
}

function normalizeStoragePrefix(value = "onion") {
  return safeText(value, "onion")
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .replace(/:+$/g, "") ||
    "onion";
}

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

function getImportMetaEnv() {
  try {
    return import.meta?.env || {};
  } catch {
    return {};
  }
}

function getRuntimeConfig() {
  const root =
    getGlobalObject();

  try {
    return isObject(root.__ONION_CONFIG__)
      ? root.__ONION_CONFIG__
      : {};
  } catch {
    return {};
  }
}

function getEnvValue(keys = [], fallback = "") {
  const names =
    Array.isArray(keys)
      ? keys
      : [keys];

  const runtime =
    getRuntimeConfig();

  const metaEnv =
    getImportMetaEnv();

  const root =
    getGlobalObject();

  for (const key of names) {
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      continue;
    }

    if (
      runtime[cleanKey] !== undefined &&
      runtime[cleanKey] !== null &&
      runtime[cleanKey] !== ""
    ) {
      return runtime[cleanKey];
    }

    if (
      metaEnv[cleanKey] !== undefined &&
      metaEnv[cleanKey] !== null &&
      metaEnv[cleanKey] !== ""
    ) {
      return metaEnv[cleanKey];
    }

    try {
      if (
        root[cleanKey] !== undefined &&
        root[cleanKey] !== null &&
        root[cleanKey] !== ""
      ) {
        return root[cleanKey];
      }
    } catch {}
  }

  return fallback;
}

function mergeObject(base = {}, override = {}) {
  const output =
    isArray(base)
      ? [...base]
      : {
          ...base,
        };

  if (!isObject(override) && !isArray(override)) {
    return output;
  }

  if (isArray(base) && isArray(override)) {
    return uniqueArray([
      ...base,
      ...override,
    ]);
  }

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }

    if (
      isObject(value) &&
      isObject(output[key])
    ) {
      output[key] =
        mergeObject(
          output[key],
          value
        );
      continue;
    }

    if (
      isArray(value) &&
      isArray(output[key])
    ) {
      output[key] =
        uniqueArray([
          ...output[key],
          ...value,
        ]);
      continue;
    }

    output[key] =
      value;
  }

  return output;
}

function normalizePathList(list = []) {
  return uniqueArray(
    (Array.isArray(list) ? list : [])
      .map((item) =>
        stripSearchAndHash(item)
      )
      .filter(Boolean)
  );
}

/* =========================================================
   BASE VALUES
========================================================= */

const runtimeConfig =
  getRuntimeConfig();

const APP_NAME =
  safeText(
    getEnvValue(
      [
        "ONION_APP_NAME",
        "VITE_ONION_APP_NAME",
        "APP_NAME",
      ],
      runtimeConfig.appName || "Onion Support"
    ),
    "Onion Support"
  );

const APP_VERSION =
  safeText(
    getEnvValue(
      [
        "ONION_APP_VERSION",
        "VITE_ONION_APP_VERSION",
        "APP_VERSION",
      ],
      runtimeConfig.version || "2.1.0"
    ),
    "2.1.0"
  );

const APP_ENV =
  safeText(
    getEnvValue(
      [
        "ONION_ENV",
        "VITE_ONION_ENV",
        "NODE_ENV",
      ],
      runtimeConfig.env || "production"
    ),
    "production"
  ).toLowerCase();

const DEBUG =
  safeBool(
    getEnvValue(
      [
        "ONION_DEBUG",
        "VITE_ONION_DEBUG",
      ],
      runtimeConfig.debug ?? true
    ),
    true
  );

const API_BASE =
  normalizeBaseUrl(
    getEnvValue(
      [
        "ONION_API_BASE",
        "VITE_ONION_API_BASE",
        "API_BASE",
      ],
      runtimeConfig.apiBase || "https://api.onionit.net"
    )
  );

const STORAGE_PREFIX =
  normalizeStoragePrefix(
    getEnvValue(
      [
        "ONION_STORAGE_PREFIX",
        "VITE_ONION_STORAGE_PREFIX",
      ],
      runtimeConfig.storagePrefix || "onion"
    )
  );

/* =========================================================
   ROUTES
========================================================= */

const routes = {
  home:
    "/",

  login:
    "/login",

  logout:
    "/logout",

  forbidden:
    "/403",

  notFound:
    "/404",

  account:
    "/account",

  settings:
    "/settings",

  tickets:
    "/tickets",

  incidencias:
    "/tickets",

  invoices:
    "/facturas",

  facturas:
    "/facturas",

  users:
    "/users",

  usuarios:
    "/users",

  clients:
    "/clients",

  clientes:
    "/clients",

  activateAccount:
    "/activate-account",

  resetPassword:
    "/reset-password",

  forgotPassword:
    "/forgot-password",

  resetPasswordConfirm:
    "/reset-password/confirm",
};

const publicRoutes = normalizePathList([
  routes.login,
  routes.activateAccount,
  routes.resetPassword,
  routes.forgotPassword,
  routes.resetPasswordConfirm,
  routes.forbidden,
  routes.notFound,
]);

const authLikeRoutes = normalizePathList([
  routes.login,
  routes.activateAccount,
  routes.resetPassword,
  routes.forgotPassword,
  routes.resetPasswordConfirm,
]);

const protectedPublicTokenRoutes = [
  {
    key:
      "activation",

    path:
      routes.activateAccount,

    windowKey:
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",

    tokenParamNames:
      [
        "token",
        "activationToken",
        "activateToken",
        "code",
        "t",
      ],
  },

  {
    key:
      "resetConfirm",

    path:
      routes.resetPasswordConfirm,

    windowKey:
      "__ONION_RESET_CONFIRM_INITIAL_URL__",

    tokenParamNames:
      [
        "token",
        "resetToken",
        "passwordResetToken",
        "code",
        "t",
      ],
  },
];

/* =========================================================
   STORAGE
========================================================= */

const storageKeys = {
  token:
    "token",

  refreshToken:
    "refreshToken",

  tempToken:
    "tempToken",

  sessionId:
    "sessionId",

  sessionUserId:
    "sessionUserId",

  user:
    "user",

  role:
    "role",

  theme:
    "theme",

  lang:
    "lang",

  sidebarOpen:
    "sidebarOpen",

  lastRoute:
    "lastRoute",

  lastPublicPath:
    "lastPublicPath",

  postLoginTarget:
    "postLoginTarget",

  authContext:
    "authContext",

  settings:
    "settings",
};

const legacyStorageKeys = {
  token:
    "onion_token",

  accessToken:
    "onion_access_token",

  refreshToken:
    "onion_refresh_token",

  user:
    "onion_user",

  userId:
    "onion_user_id",

  userSlug:
    "onion_user_slug",

  userName:
    "onion_user_name",

  role:
    "onion_role",

  tempToken:
    "onion_temp_token",

  sessionId:
    "onion_session_id",

  sessionUserId:
    "onion_session_user_id",

  theme:
    "onion_theme",

  lang:
    "onion_lang",

  postLoginTarget:
    "onion_post_login_target",
};

/* =========================================================
   AUTH / API
========================================================= */

/*
  IMPORTANTE:
  /me NO va en publicApiPaths.
  Si /me es público para request.js, no se inyecta Authorization.
  Eso puede romper restore/avatar/token tras refresh.
*/
const publicApiPaths = normalizePathList([
  "/api/auth/login",
  "/api/auth/refresh",

  "/api/auth/reset-password-request",
  "/api/auth/reset-password-confirm",

  "/api/auth/activate",
  "/api/auth/activate/first-user",

  "/api/auth/2fa/login",

  "/api/auth/_health",
  "/api/_health",
  "/health",
]);

const auth = {
  bearerPrefix:
    "Bearer",

  tokenHeader:
    "Authorization",

  tokenStorageKey:
    storageKeys.token,

  refreshTokenStorageKey:
    storageKeys.refreshToken,

  tempTokenStorageKey:
    storageKeys.tempToken,

  sessionIdStorageKey:
    storageKeys.sessionId,

  sessionUserIdStorageKey:
    storageKeys.sessionUserId,

  loginRoute:
    routes.login,

  logoutRoute:
    routes.logout,

  homeRoute:
    routes.home,

  postLoginFallback:
    routes.home,

  endpoints: {
    login:
      "/api/auth/login",

    logout:
      "/api/auth/logout",

    me:
      "/api/auth/me",

    refresh:
      "/api/auth/refresh",

    resetPasswordRequest:
      "/api/auth/reset-password-request",

    resetPasswordConfirm:
      "/api/auth/reset-password-confirm",

    activate:
      "/api/auth/activate",

    activateFirstUser:
      "/api/auth/activate/first-user",

    twoFactorLogin:
      "/api/auth/2fa/login",

    health:
      "/api/auth/_health",
  },

  publicApiPaths,

  technicalPublicRoutes:
    [
      routes.activateAccount,
      routes.resetPasswordConfirm,
    ],

  protectedPublicTokenRoutes,

  roles: {
    admin:
      "admin",

    agent:
      "agent",

    tecnico:
      "agent",

    user:
      "user",

    usuario:
      "user",

    client:
      "client",

    cliente:
      "client",
  },

  session: {
    restoreOnBoot:
      true,

    refreshOnBoot:
      true,

    clearInvalidSession:
      true,

    persistUser:
      true,

    persistToken:
      true,

    allowRefreshContext:
      true,

    requireTokenForAuthenticated:
      true,

    allowTechnicalAuthenticatedWithoutUser:
      true,
  },
};

const api = {
  base:
    API_BASE,

  baseUrl:
    API_BASE,

  timeout:
    safeNumber(
      runtimeConfig.requestTimeout,
      15000
    ),

  retries:
    safeNumber(
      runtimeConfig.requestRetries,
      0
    ),

  retryDelayMs:
    safeNumber(
      runtimeConfig.requestRetryDelayMs,
      350
    ),

  retryMaxDelayMs:
    safeNumber(
      runtimeConfig.requestRetryMaxDelayMs,
      4000
    ),

  withCredentials:
    safeBool(
      runtimeConfig.withCredentials,
      false
    ),

  headers: {
    Accept:
      "application/json",

    "Content-Type":
      "application/json",
  },
};

/* =========================================================
   UI / I18N / ROUTER / LOADER
========================================================= */

const ui = {
  defaultTheme:
    "dark",

  theme:
    "dark",

  themeColorDark:
    "#0a0c11",

  themeColorLight:
    "#f4f7fb",

  shellId:
    "app-shell",

  loaderId:
    "app-loader",

  viewContainerId:
    "view-container",

  sidebarId:
    "app-sidebar",

  topbarId:
    "app-topbar",

  tableheadId:
    "table-head",

  tableheadContainerId:
    "tablehead-container",

  useCustomTooltips:
    true,

  avoidNativeTooltips:
    true,

  syncUserUIOnAuthChange:
    true,

  syncUserUIOnLangChange:
    true,
};

const i18n = {
  defaultLang:
    "es",

  fallbackLang:
    "es",

  supported:
    [
      "es",
      "en",
      "ca",
    ],

  storageKey:
    storageKeys.lang,

  liveRefresh:
    true,

  eventName:
    "app:lang:change",
};

const router = {
  mode:
    "history",

  base:
    "/",

  defaultRoute:
    routes.home,

  loginRoute:
    routes.login,

  logoutRoute:
    routes.logout,

  notFoundRoute:
    routes.notFound,

  forbiddenRoute:
    routes.forbidden,

  preserveTechnicalPublicUrls:
    true,

  bindAfterInitialRender:
    true,

  stripUsernamePrefix:
    true,

  usernamePrefix:
    "@",

  emitRenderEvents:
    true,

  events: {
    beforeRender:
      "router:before-render",

    rendered:
      "router:rendered",

    asyncComplete:
      "router:render:async-complete",

    navigationComplete:
      "router:navigation:complete",

    shellState:
      "router:shell:state",
  },
};

const loader = {
  staticLoaderId:
    "app-loader",

  minVisibleMs:
    500,

  failsafeMs:
    2500,

  bootClass:
    "app-booting",

  loadingClass:
    "app-loading",

  readyClass:
    "app-ready",

  hiddenClass:
    "is-hidden",

  visibleClass:
    "is-visible",

  controlledByBootstrap:
    true,

  hideOnlyOnFinalize:
    true,
};

/* =========================================================
   EVENTS / FLAGS
========================================================= */

const events = {
  ready:
    "app:ready",

  bootStart:
    "app:boot:start",

  bootReady:
    "app:boot:ready",

  bootComplete:
    "app:boot:complete",

  bootError:
    "app:boot:error",

  coreReady:
    "app:core:ready",

  stateChange:
    "app:state:change",

  routeChange:
    "app:route:change",

  publicPathChange:
    "app:public-path:change",

  userChange:
    "app:user:change",

  tokenChange:
    "app:token:change",

  authChange:
    "app:auth:change",

  langChange:
    "app:lang:change",

  themeChange:
    "app:theme:change",

  sessionRestored:
    "app:session:restored",

  sessionApplied:
    "app:session:applied",

  sessionLoaded:
    "app:session:loaded",

  sessionCleared:
    "app:session:cleared",
};

const featureFlags = {
  restoreSessionOnBoot:
    true,

  renderPublicTokenRouteBeforeRestore:
    true,

  preserveActivationUrl:
    true,

  preserveResetConfirmUrl:
    true,

  bindRouterAfterFirstRender:
    true,

  enableBootFailsafe:
    true,

  enableNetworkEvents:
    true,

  enableToastBridge:
    true,

  enableShellSnapshots:
    true,

  enableDebugSnapshots:
    true,

  clearGhostUserWithoutToken:
    true,

  requireAuthorizationForMe:
    true,
};

const diagnostics = {
  enabled:
    DEBUG,

  logPrefix:
    "[Onion]",

  redactTokens:
    true,

  emitSnapshots:
    true,

  maxRecentErrors:
    12,

  maxRecentEvents:
    25,
};

/* =========================================================
   CONFIG
========================================================= */

const baseConfig = {
  appName:
    APP_NAME,

  name:
    APP_NAME,

  version:
    APP_VERSION,

  env:
    APP_ENV,

  environment:
    APP_ENV,

  debug:
    DEBUG,

  apiBase:
    API_BASE,

  requestTimeout:
    api.timeout,

  requestRetries:
    api.retries,

  requestRetryDelayMs:
    api.retryDelayMs,

  requestRetryMaxDelayMs:
    api.retryMaxDelayMs,

  defaultLang:
    i18n.defaultLang,

  fallbackLang:
    i18n.fallbackLang,

  defaultTheme:
    ui.defaultTheme,

  storagePrefix:
    STORAGE_PREFIX,

  routes,
  publicRoutes,
  authLikeRoutes,
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
};

function normalizeFinalConfig(source = {}) {
  const output =
    mergeObject(
      source,
      {}
    );

  output.apiBase =
    normalizeBaseUrl(
      output.apiBase || output.api?.base || ""
    );

  output.storagePrefix =
    normalizeStoragePrefix(
      output.storagePrefix || "onion"
    );

  output.defaultLang =
    safeText(
      output.defaultLang,
      "es"
    ).toLowerCase();

  output.fallbackLang =
    safeText(
      output.fallbackLang,
      output.defaultLang || "es"
    ).toLowerCase();

  output.defaultTheme =
    safeText(
      output.defaultTheme,
      "dark"
    ).toLowerCase() === "light"
      ? "light"
      : "dark";

  output.publicRoutes =
    normalizePathList(
      output.publicRoutes || []
    );

  output.authLikeRoutes =
    normalizePathList(
      output.authLikeRoutes || []
    );

  if (output.auth) {
    output.auth.publicApiPaths =
      normalizePathList(
        output.auth.publicApiPaths || []
      ).filter((path) =>
        path !== "/api/auth/me" &&
        path !== "/auth/me"
      );

    output.auth.technicalPublicRoutes =
      normalizePathList(
        output.auth.technicalPublicRoutes || []
      );
  }

  if (output.api) {
    output.api.base =
      output.apiBase;

    output.api.baseUrl =
      output.apiBase;

    output.api.timeout =
      safeNumber(
        output.api.timeout,
        output.requestTimeout || 15000
      );

    output.api.retries =
      safeNumber(
        output.api.retries,
        output.requestRetries || 0
      );

    output.api.retryDelayMs =
      safeNumber(
        output.api.retryDelayMs,
        output.requestRetryDelayMs || 350
      );
  }

  return output;
}

export const config =
  deepFreeze(
    normalizeFinalConfig(
      mergeObject(
        baseConfig,
        isObject(runtimeConfig.override)
          ? runtimeConfig.override
          : {}
      )
    )
  );

/* =========================================================
   HELPERS
========================================================= */

export function getConfig() {
  return config;
}

export function getApiBase() {
  return config.apiBase;
}

export function getRoute(key = "home", fallback = "/") {
  const cleanKey =
    safeText(key, "home");

  return normalizePath(
    config.routes?.[cleanKey] ||
      fallback ||
      "/"
  );
}

export function getStorageKey(key = "", fallback = "") {
  const cleanKey =
    safeText(key, "");

  return (
    config.storageKeys?.[cleanKey] ||
    fallback ||
    ""
  );
}

export function getNamespacedStorageKey(key = "") {
  const cleanKey =
    getStorageKey(
      key,
      key
    );

  return `${config.storagePrefix}:${cleanKey}`;
}

export function isPublicApiPath(path = "") {
  const cleanPath =
    stripSearchAndHash(
      normalizePath(path)
    );

  return config.auth.publicApiPaths.some((publicPath) => {
    const current =
      stripSearchAndHash(
        normalizePath(publicPath)
      );

    return (
      cleanPath === current ||
      cleanPath.startsWith(`${current}/`)
    );
  });
}

export function isTechnicalPublicRoute(path = "") {
  const cleanPath =
    stripSearchAndHash(
      normalizePath(path)
    );

  return config.auth.technicalPublicRoutes.some((publicPath) => {
    const current =
      stripSearchAndHash(
        normalizePath(publicPath)
      );

    return (
      cleanPath === current ||
      cleanPath.startsWith(`${current}/`)
    );
  });
}

export function getProtectedPublicTokenRoutes() {
  return config.protectedPublicTokenRoutes;
}

export function getAuthEndpoint(key = "") {
  const cleanKey =
    safeText(key, "");

  return config.auth?.endpoints?.[cleanKey] || "";
}

export function getConfigSnapshot() {
  return {
    appName:
      config.appName,

    version:
      config.version,

    env:
      config.env,

    debug:
      config.debug,

    apiBase:
      config.apiBase,

    requestTimeout:
      config.requestTimeout,

    requestRetries:
      config.requestRetries,

    requestRetryDelayMs:
      config.requestRetryDelayMs,

    defaultLang:
      config.defaultLang,

    defaultTheme:
      config.defaultTheme,

    storagePrefix:
      config.storagePrefix,

    routes:
      config.routes,

    publicRoutes:
      config.publicRoutes,

    authLikeRoutes:
      config.authLikeRoutes,

    technicalPublicRoutes:
      config.auth.technicalPublicRoutes,

    publicApiPaths:
      config.auth.publicApiPaths,

    authEndpoints:
      config.auth.endpoints,

    loader:
      config.loader,

    featureFlags:
      config.featureFlags,

    diagnostics:
      config.diagnostics,
  };
}

export default config;
