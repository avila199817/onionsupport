/* =========================================================
   Onion SPA - Core Config
   Archivo: src/core/config.js

   ONION SUPPORT · CORE CONFIG
   GLOBAL CONTRACT · ROUTES · API · AUTH · STORAGE · 13/10

   Responsabilidades:
   - centralizar configuración global del núcleo
   - exponer rutas base canónicas del SPA
   - exponer aliases legacy sin contaminar rutas canónicas
   - exponer rutas públicas técnicas
   - exponer claves de storage lógicas
   - exponer flags de auth, UI, router, loader y request
   - permitir overrides runtime seguros
   - evitar mutaciones accidentales

   HARDENING EXTREMO:
   - Object.freeze profundo con protección de ciclos
   - valores normalizados
   - compatibilidad con config legacy
   - rutas públicas/token centralizadas
   - storage keys namespaced por storage.js, no duplicadas aquí
   - flags enterprise
   - publicApiPaths estrictas: /me NO es público
   - runtime overrides defensivos
   - snapshots seguros
   - soporte Azure Static Web Apps / history fallback
   - soporte rutas técnicas con token en query, path y hash-router
   - compatibilidad con request.js, auth restore, router y app bootstrap
========================================================= */

/* =========================================================
   VERSION
========================================================= */

const CONFIG_VERSION =
  "13.0.0";

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

function deepFreeze(value, seen = new WeakSet()) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  try {
    if (seen.has(value)) {
      return value;
    }

    seen.add(value);

    for (const key of Object.getOwnPropertyNames(value)) {
      const child =
        value[key];

      if (
        child &&
        typeof child === "object" &&
        !Object.isFrozen(child)
      ) {
        deepFreeze(
          child,
          seen
        );
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

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
        "enabled",
        "active",
      ].includes(normalized)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "disabled",
        "inactive",
      ].includes(normalized)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function uniqueArray(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .filter((item) =>
          item !== undefined &&
          item !== null &&
          item !== ""
        )
    )
  );
}

function normalizePath(path = "/") {
  const raw =
    safeText(path, "/");

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) || "/";
  }

  let value =
    safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

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

  return `${value}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  const normalized =
    normalizePath(path);

  return (
    normalized
      .split("?")[0]
      .split("#")[0] ||
    "/"
  );
}

function normalizeBaseUrl(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (raw === "/") {
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

function normalizeLang(value = "es") {
  const raw =
    safeText(value, "es")
      .toLowerCase()
      .replace(/_/g, "-");

  const first =
    raw.split("-")[0] || raw;

  if (
    first === "spa" ||
    first === "spanish" ||
    first === "castellano" ||
    first === "español"
  ) {
    return "es";
  }

  if (
    first === "eng" ||
    first === "english"
  ) {
    return "en";
  }

  if (
    first === "cat" ||
    first === "catalan" ||
    first === "català" ||
    first === "catalán"
  ) {
    return "ca";
  }

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(raw)
    ? raw
    : "es";
}

function normalizeTheme(value = "dark") {
  const theme =
    safeText(value, "dark")
      .toLowerCase();

  if (theme === "light") {
    return "light";
  }

  return "dark";
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
    return import.meta.env || {};
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
  if (isArray(base) && isArray(override)) {
    return uniqueArray([
      ...base,
      ...override,
    ]);
  }

  const output =
    isArray(base)
      ? [...base]
      : {
          ...base,
        };

  if (!isObject(override) && !isArray(override)) {
    return output;
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
    safeArray(list)
      .map((item) =>
        stripSearchAndHash(item)
      )
      .filter(Boolean)
  );
}

function normalizeApiPathList(list = []) {
  return normalizePathList(list)
    .filter((path) => {
      const clean =
        stripSearchAndHash(path);

      return (
        clean !== "/api/auth/me" &&
        clean !== "/auth/me" &&
        clean !== "/me"
      );
    });
}

function pickRuntimeOverrides(runtime = {}) {
  if (!isObject(runtime)) {
    return {};
  }

  const allowedKeys = [
    "appName",
    "name",
    "version",
    "env",
    "environment",
    "debug",

    "apiBase",
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
    "protectedPublicTokenRoutes",

    "storageKeys",
    "legacyStorageKeys",

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
    if (runtime[key] !== undefined) {
      output[key] =
        runtime[key];
    }
  }

  if (isObject(runtime.override)) {
    return mergeObject(
      output,
      runtime.override
    );
  }

  return output;
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
      runtimeConfig.appName ||
        runtimeConfig.name ||
        "Onion Support"
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
        "APP_ENV",
      ],
      runtimeConfig.env ||
        runtimeConfig.environment ||
        "production"
    ),
    "production"
  ).toLowerCase();

const DEBUG =
  safeBool(
    getEnvValue(
      [
        "ONION_DEBUG",
        "VITE_ONION_DEBUG",
        "APP_DEBUG",
      ],
      runtimeConfig.debug ?? false
    ),
    false
  );

const API_BASE =
  normalizeBaseUrl(
    getEnvValue(
      [
        "ONION_API_BASE",
        "VITE_ONION_API_BASE",
        "API_BASE",
        "API_URL",
      ],
      runtimeConfig.apiBase ||
        runtimeConfig.api?.base ||
        runtimeConfig.api?.baseUrl ||
        ""
    )
  );

const STORAGE_PREFIX =
  normalizeStoragePrefix(
    getEnvValue(
      [
        "ONION_STORAGE_PREFIX",
        "VITE_ONION_STORAGE_PREFIX",
        "APP_STORAGE_PREFIX",
      ],
      runtimeConfig.storagePrefix || "onion"
    )
  );

/* =========================================================
   ROUTES · CANONICAL SPA PATHS
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

  incidencias:
    "/incidencias",

  tickets:
    "/incidencias",

  facturas:
    "/facturas",

  invoices:
    "/facturas",

  usuarios:
    "/usuarios",

  users:
    "/usuarios",

  clientes:
    "/clientes",

  clients:
    "/clientes",

  cuenta:
    "/cuenta",

  account:
    "/cuenta",

  ajustes:
    "/ajustes",

  settings:
    "/ajustes",

  servidor:
    "/servidor",

  server:
    "/servidor",

  activateAccount:
    "/activate-account",

  resetPassword:
    "/reset-password",

  forgotPassword:
    "/forgot-password",

  recoverPassword:
    "/recover-password",

  passwordReset:
    "/password-reset",

  resetPasswordConfirm:
    "/reset-password/confirm",
};

const routeAliases = {
  "/home":
    routes.home,

  "/dashboard":
    routes.home,

  "/tickets":
    routes.incidencias,

  "/ticket":
    routes.incidencias,

  "/incidents":
    routes.incidencias,

  "/incident":
    routes.incidencias,

  "/invoices":
    routes.facturas,

  "/invoice":
    routes.facturas,

  "/billing":
    routes.facturas,

  "/users":
    routes.usuarios,

  "/user":
    routes.usuarios,

  "/clients":
    routes.clientes,

  "/client":
    routes.clientes,

  "/customers":
    routes.clientes,

  "/customer":
    routes.clientes,

  "/account":
    routes.cuenta,

  "/profile":
    routes.cuenta,

  "/settings":
    routes.ajustes,

  "/config":
    routes.ajustes,

  "/server":
    routes.servidor,
};

const publicRoutes = normalizePathList([
  routes.login,
  routes.activateAccount,
  routes.resetPassword,
  routes.forgotPassword,
  routes.recoverPassword,
  routes.passwordReset,
  routes.resetPasswordConfirm,
  routes.forbidden,
  routes.notFound,
]);

const authLikeRoutes = normalizePathList([
  routes.login,
  routes.activateAccount,
  routes.resetPassword,
  routes.forgotPassword,
  routes.recoverPassword,
  routes.passwordReset,
  routes.resetPasswordConfirm,
]);

const protectedPublicTokenRoutes = [
  {
    key:
      "activation",

    path:
      routes.activateAccount,

    statePrefix:
      "Activation",

    windowKey:
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",

    windowKeys:
      [
        "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
      ],

    stateUrlKey:
      "bootActivationInitialUrl",

    statePathKey:
      "bootActivationInitialPath",

    statePublicPathKey:
      "bootActivationInitialPublicPath",

    stateIsRouteKey:
      "bootIsActivation",

    stateHasTokenKey:
      "bootHasActivationToken",

    scrubbedStateKeys:
      [
        "scrubbedActivationToken",
        "activationTokenScrubbed",
        "scrubbedActivateAccountToken",
      ],

    scrubbedHistoryKeys:
      [
        "scrubbedActivationToken",
        "activationTokenScrubbed",
        "scrubbedActivateAccountToken",
        "scrubbedPublicTokenRoute",
        "scrubbedTokenRoute",
      ],

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

    statePrefix:
      "ResetConfirm",

    windowKey:
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",

    windowKeys:
      [
        "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
        "__ONION_RESET_CONFIRM_INITIAL_URL__",
      ],

    stateUrlKey:
      "bootResetConfirmInitialUrl",

    statePathKey:
      "bootResetConfirmInitialPath",

    statePublicPathKey:
      "bootResetConfirmInitialPublicPath",

    stateIsRouteKey:
      "bootIsResetConfirm",

    stateHasTokenKey:
      "bootHasResetToken",

    scrubbedStateKeys:
      [
        "scrubbedResetToken",
        "resetTokenScrubbed",
        "scrubbedResetConfirmToken",
        "scrubbedPasswordResetToken",
        "scrubbedResetPasswordToken",
      ],

    scrubbedHistoryKeys:
      [
        "scrubbedResetToken",
        "resetTokenScrubbed",
        "scrubbedResetConfirmToken",
        "scrubbedPasswordResetToken",
        "scrubbedResetPasswordToken",
        "scrubbedPublicTokenRoute",
        "scrubbedTokenRoute",
      ],

    tokenParamNames:
      [
        "token",
        "resetToken",
        "passwordResetToken",
        "confirmToken",
        "code",
        "t",
      ],
  },
];

/* =========================================================
   STORAGE
========================================================= */

/*
  Estas claves son nombres lógicos.
  storage.js debe aplicar el namespace real:
  `${storagePrefix}:${key}`.
*/
const storageKeys = {
  token:
    "token",

  accessToken:
    "accessToken",

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

  themeMode:
    "themeMode",

  appearance:
    "appearance",

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

  preferences:
    "preferences",

  ui:
    "ui",
};

const legacyStorageKeys = {
  token:
    "onion_token",

  accessToken:
    "onion_access_token",

  refreshToken:
    "onion_refresh_token",

  tempToken:
    "onion_temp_token",

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
  /api/auth/me NO va en publicApiPaths.
  Si /me es público para request.js, no se inyecta Authorization
  y falla restore/avatar/user tras refresh.
*/
const publicApiPaths = normalizeApiPathList([
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

const privateApiPaths = normalizePathList([
  "/api/auth/me",
  "/auth/me",
  "/me",
  "/api/auth/logout",
  "/api/auth/logout-all",
]);

const auth = {
  bearerPrefix:
    "Bearer",

  tokenHeader:
    "Authorization",

  tokenStorageKey:
    storageKeys.token,

  accessTokenStorageKey:
    storageKeys.accessToken,

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

    logoutAll:
      "/api/auth/logout-all",

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

  privateApiPaths,

  technicalPublicRoutes:
    [
      routes.activateAccount,
      routes.resetPasswordConfirm,
    ],

  protectedPublicTokenRoutes,

  roles: {
    admin:
      "admin",

    administrator:
      "admin",

    administrador:
      "admin",

    superadmin:
      "admin",

    owner:
      "admin",

    root:
      "admin",

    agent:
      "agent",

    tecnico:
      "agent",

    técnica:
      "agent",

    support:
      "agent",

    soporte:
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

    clearGhostUserWithoutToken:
      true,

    syncUserUiAfterRestore:
      true,
  },
};

const api = {
  base:
    API_BASE,

  baseUrl:
    API_BASE,

  sameOrigin:
    !API_BASE,

  timeout:
    safeNumber(
      runtimeConfig.requestTimeout ??
        runtimeConfig.api?.timeout,
      15000
    ),

  retries:
    safeNumber(
      runtimeConfig.requestRetries ??
        runtimeConfig.api?.retries,
      0
    ),

  retryDelayMs:
    safeNumber(
      runtimeConfig.requestRetryDelayMs ??
        runtimeConfig.api?.retryDelayMs,
      350
    ),

  retryMaxDelayMs:
    safeNumber(
      runtimeConfig.requestRetryMaxDelayMs ??
        runtimeConfig.api?.retryMaxDelayMs,
      4000
    ),

  retryMethods:
    uniqueArray(
      safeArray(
        runtimeConfig.requestRetryMethods ??
          runtimeConfig.api?.retryMethods ??
          [
            "GET",
            "HEAD",
            "OPTIONS",
          ]
      ).map((item) =>
        safeText(item, "").toUpperCase()
      )
    ),

  withCredentials:
    safeBool(
      runtimeConfig.withCredentials ??
        runtimeConfig.api?.withCredentials,
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
   RESOURCES / BUSINESS ENDPOINTS
========================================================= */

const resources = {
  tickets: {
    base:
      "/api/tickets",

    list:
      "/api/tickets",

    detail:
      "/api/tickets/:id",

    create:
      "/api/tickets",

    update:
      "/api/tickets/:id",

    comments:
      "/api/tickets/:id/comments",

    attachments:
      "/api/tickets/:id/attachments",

    files:
      "/api/tickets/:id/files",

    aliases:
      [
        "/api/incidencias",
      ],
  },

  incidencias: {
    base:
      "/api/tickets",

    alias:
      "/api/incidencias",
  },

  invoices: {
    base:
      "/api/facturas",

    alias:
      "/api/invoices",
  },

  facturas: {
    base:
      "/api/facturas",

    alias:
      "/api/invoices",
  },

  users: {
    base:
      "/api/users",

    alias:
      "/api/usuarios",
  },

  usuarios: {
    base:
      "/api/users",

    alias:
      "/api/usuarios",
  },

  clients: {
    base:
      "/api/clientes",

    alias:
      "/api/clients",
  },

  clientes: {
    base:
      "/api/clientes",

    alias:
      "/api/clients",
  },

  hardware: {
    base:
      "/api/hardware",
  },

  search: {
    base:
      "/api/search",

    global:
      "/api/search",
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

  density:
    "default",

  shellId:
    "app-shell",

  loaderId:
    "app-loader",

  sidebarMountId:
    "sidebar-mount",

  topbarMountId:
    "topbar-mount",

  viewContainerId:
    "view-container",

  mainContentId:
    "main-content",

  appContentId:
    "app-content",

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

  syncUserUIOnThemeChange:
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

  useHistoryFallback:
    true,

  safeExternalLinks:
    true,

  routes,

  routeAliases,

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

  fatalClass:
    "app-fatal",

  hiddenClass:
    "is-hidden",

  visibleClass:
    "is-visible",

  leavingClass:
    "is-leaving",

  controlledByBootstrap:
    true,

  hideOnlyOnFinalize:
    true,

  updateBodyState:
    true,

  updateHtmlState:
    true,
};

/* =========================================================
   SECURITY / EVENTS / FLAGS
========================================================= */

const security = {
  privateSpa:
    true,

  noIndex:
    true,

  redactTokens:
    true,

  preserveTechnicalTokenUrlUntilViewCapture:
    true,

  allowHashRouterTokenRoutes:
    true,

  unsafeHrefProtocols:
    [
      "javascript:",
      "data:",
      "vbscript:",
    ],

  sensitiveQueryParams:
    [
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
    ],
};

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

  coreInitStart:
    "app:core:init:start",

  coreReady:
    "app:core:ready",

  coreInitError:
    "app:core:init:error",

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

  keepMeEndpointPrivate:
    true,

  enableRequestDedupe:
    true,

  enableRequestRetry:
    true,

  enableRequestAbort:
    true,

  enableRuntimeConfig:
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

  exposeDebugBridge:
    true,
};

/* =========================================================
   CONFIG
========================================================= */

const baseConfig = {
  __version:
    CONFIG_VERSION,

  appName:
    APP_NAME,

  name:
    APP_NAME,

  appKey:
    STORAGE_PREFIX,

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

  requestRetryMethods:
    api.retryMethods,

  defaultLang:
    i18n.defaultLang,

  fallbackLang:
    i18n.fallbackLang,

  defaultTheme:
    ui.defaultTheme,

  storagePrefix:
    STORAGE_PREFIX,

  routes,
  routeAliases,
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
  resources,
  security,
};

function normalizeFinalConfig(source = {}) {
  const output =
    mergeObject(
      source,
      {}
    );

  output.__version =
    safeText(
      output.__version,
      CONFIG_VERSION
    );

  output.appName =
    safeText(
      output.appName || output.name,
      APP_NAME
    );

  output.name =
    output.appName;

  output.version =
    safeText(
      output.version,
      APP_VERSION
    );

  output.env =
    safeText(
      output.env || output.environment,
      APP_ENV
    ).toLowerCase();

  output.environment =
    output.env;

  output.debug =
    safeBool(
      output.debug,
      DEBUG
    );

  output.apiBase =
    normalizeBaseUrl(
      output.apiBase ||
        output.api?.base ||
        output.api?.baseUrl ||
        API_BASE
    );

  output.storagePrefix =
    normalizeStoragePrefix(
      output.storagePrefix ||
        output.appKey ||
        STORAGE_PREFIX
    );

  output.appKey =
    output.storagePrefix;

  output.defaultLang =
    normalizeLang(
      output.defaultLang ||
        output.i18n?.defaultLang ||
        "es"
    );

  output.fallbackLang =
    normalizeLang(
      output.fallbackLang ||
        output.i18n?.fallbackLang ||
        output.defaultLang ||
        "es"
    );

  output.defaultTheme =
    normalizeTheme(
      output.defaultTheme ||
        output.ui?.defaultTheme ||
        "dark"
    );

  output.routes =
    Object.fromEntries(
      Object.entries(output.routes || {}).map(([key, value]) => [
        key,
        normalizePath(value),
      ])
    );

  output.routeAliases =
    Object.fromEntries(
      Object.entries(output.routeAliases || {}).map(([key, value]) => [
        normalizePath(key),
        stripSearchAndHash(value),
      ])
    );

  output.publicRoutes =
    normalizePathList(
      output.publicRoutes || []
    );

  output.authLikeRoutes =
    normalizePathList(
      output.authLikeRoutes || []
    );

  output.protectedPublicTokenRoutes =
    safeArray(
      output.protectedPublicTokenRoutes || []
    )
      .map((item) => {
        if (!isObject(item)) {
          return null;
        }

        const path =
          stripSearchAndHash(
            item.path || "/"
          );

        const windowKeys =
          uniqueArray([
            ...safeArray(item.windowKeys),
            item.windowKey,
          ]);

        return {
          ...item,

          path,

          windowKey:
            item.windowKey || windowKeys[0] || "",

          windowKeys,

          tokenParamNames:
            uniqueArray(
              item.tokenParamNames || []
            ),

          scrubbedStateKeys:
            uniqueArray(
              item.scrubbedStateKeys || []
            ),

          scrubbedHistoryKeys:
            uniqueArray(
              item.scrubbedHistoryKeys || []
            ),
        };
      })
      .filter(Boolean);

  if (output.auth) {
    output.auth.publicApiPaths =
      normalizeApiPathList(
        output.auth.publicApiPaths || []
      );

    output.auth.privateApiPaths =
      normalizePathList(
        output.auth.privateApiPaths || privateApiPaths
      );

    output.auth.technicalPublicRoutes =
      normalizePathList(
        output.auth.technicalPublicRoutes || []
      );

    output.auth.protectedPublicTokenRoutes =
      output.protectedPublicTokenRoutes;
  }

  if (output.api) {
    output.api.base =
      output.apiBase;

    output.api.baseUrl =
      output.apiBase;

    output.api.sameOrigin =
      !output.apiBase;

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

    output.api.retryMaxDelayMs =
      safeNumber(
        output.api.retryMaxDelayMs,
        output.requestRetryMaxDelayMs || 4000
      );

    output.api.retryMethods =
      uniqueArray(
        safeArray(
          output.api.retryMethods ||
            output.requestRetryMethods ||
            [
              "GET",
              "HEAD",
              "OPTIONS",
            ]
        ).map((item) =>
          safeText(item, "").toUpperCase()
        )
      );
  }

  output.requestTimeout =
    safeNumber(
      output.requestTimeout,
      output.api?.timeout || 15000
    );

  output.requestRetries =
    safeNumber(
      output.requestRetries,
      output.api?.retries || 0
    );

  output.requestRetryDelayMs =
    safeNumber(
      output.requestRetryDelayMs,
      output.api?.retryDelayMs || 350
    );

  output.requestRetryMaxDelayMs =
    safeNumber(
      output.requestRetryMaxDelayMs,
      output.api?.retryMaxDelayMs || 4000
    );

  output.requestRetryMethods =
    uniqueArray(
      safeArray(
        output.requestRetryMethods ||
          output.api?.retryMethods ||
          [
            "GET",
            "HEAD",
            "OPTIONS",
          ]
      ).map((item) =>
        safeText(item, "").toUpperCase()
      )
    );

  if (output.ui) {
    output.ui.defaultTheme =
      normalizeTheme(
        output.ui.defaultTheme ||
          output.defaultTheme
      );

    output.ui.theme =
      normalizeTheme(
        output.ui.theme ||
          output.ui.defaultTheme
      );
  }

  if (output.i18n) {
    output.i18n.defaultLang =
      normalizeLang(
        output.i18n.defaultLang ||
          output.defaultLang
      );

    output.i18n.fallbackLang =
      normalizeLang(
        output.i18n.fallbackLang ||
          output.fallbackLang ||
          output.i18n.defaultLang
      );

    output.i18n.supported =
      uniqueArray(
        safeArray(output.i18n.supported)
          .map((item) =>
            normalizeLang(item)
          )
      );
  }

  return output;
}

export const config =
  deepFreeze(
    normalizeFinalConfig(
      mergeObject(
        baseConfig,
        pickRuntimeOverrides(runtimeConfig)
      )
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

export function getRoute(key = "home", fallback = "/") {
  const cleanKey =
    safeText(key, "home");

  return normalizePath(
    config.routes?.[cleanKey] ||
      fallback ||
      "/"
  );
}

export function getRouteAlias(path = "") {
  const cleanPath =
    stripSearchAndHash(path);

  return config.routeAliases?.[cleanPath] || "";
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

function getBaseOrigin() {
  try {
    if (
      typeof window !== "undefined" &&
      window.location?.origin
    ) {
      return window.location.origin;
    }
  } catch {}

  return "http://localhost";
}

function getApiBasePath() {
  const apiBase =
    normalizeBaseUrl(
      config.apiBase || ""
    );

  if (!apiBase) {
    return "";
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(apiBase)) {
      return stripSearchAndHash(
        new URL(
          apiBase,
          getBaseOrigin()
        ).pathname || ""
      );
    }

    return stripSearchAndHash(apiBase);
  } catch {
    return "";
  }
}

function stripApiBasePrefix(path = "/") {
  const normalized =
    stripSearchAndHash(path);

  const apiBasePath =
    getApiBasePath();

  if (
    !apiBasePath ||
    apiBasePath === "/"
  ) {
    return normalized;
  }

  if (normalized === apiBasePath) {
    return "/";
  }

  if (normalized.startsWith(`${apiBasePath}/`)) {
    return stripSearchAndHash(
      normalized.slice(apiBasePath.length) || "/"
    );
  }

  return normalized;
}

export function isPublicApiPath(path = "") {
  const cleanPath =
    stripSearchAndHash(
      normalizePath(path)
    );

  const withoutApiBase =
    stripApiBasePrefix(cleanPath);

  return config.auth.publicApiPaths.some((publicPath) => {
    const current =
      stripSearchAndHash(
        normalizePath(publicPath)
      );

    const currentWithoutApiBase =
      stripApiBasePrefix(current);

    return (
      cleanPath === current ||
      cleanPath.startsWith(`${current}/`) ||
      withoutApiBase === current ||
      withoutApiBase.startsWith(`${current}/`) ||
      cleanPath === currentWithoutApiBase ||
      cleanPath.startsWith(`${currentWithoutApiBase}/`)
    );
  });
}

export function isPrivateApiPath(path = "") {
  const cleanPath =
    stripSearchAndHash(
      normalizePath(path)
    );

  const withoutApiBase =
    stripApiBasePrefix(cleanPath);

  return safeArray(config.auth.privateApiPaths).some((privatePath) => {
    const current =
      stripSearchAndHash(
        normalizePath(privatePath)
      );

    const currentWithoutApiBase =
      stripApiBasePrefix(current);

    return (
      cleanPath === current ||
      cleanPath.startsWith(`${current}/`) ||
      withoutApiBase === current ||
      withoutApiBase.startsWith(`${current}/`) ||
      cleanPath === currentWithoutApiBase ||
      cleanPath.startsWith(`${currentWithoutApiBase}/`)
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

export function getResourceEndpoint(resource = "", key = "base") {
  const resourceKey =
    safeText(resource, "");

  const endpointKey =
    safeText(key, "base");

  return config.resources?.[resourceKey]?.[endpointKey] || "";
}

export function getConfigSnapshot() {
  return {
    version:
      config.__version,

    appName:
      config.appName,

    appVersion:
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

    requestRetryMaxDelayMs:
      config.requestRetryMaxDelayMs,

    requestRetryMethods:
      config.requestRetryMethods,

    defaultLang:
      config.defaultLang,

    fallbackLang:
      config.fallbackLang,

    defaultTheme:
      config.defaultTheme,

    storagePrefix:
      config.storagePrefix,

    routes:
      config.routes,

    routeAliases:
      config.routeAliases,

    publicRoutes:
      config.publicRoutes,

    authLikeRoutes:
      config.authLikeRoutes,

    technicalPublicRoutes:
      config.auth.technicalPublicRoutes,

    publicApiPaths:
      config.auth.publicApiPaths,

    privateApiPaths:
      config.auth.privateApiPaths,

    authEndpoints:
      config.auth.endpoints,

    resources:
      config.resources,

    loader:
      config.loader,

    router:
      config.router,

    ui:
      config.ui,

    featureFlags:
      config.featureFlags,

    diagnostics:
      config.diagnostics,
  };
}

export default config;
