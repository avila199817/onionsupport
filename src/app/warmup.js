/* =========================================================
   Onion SPA - App Warmup
   Archivo: src/app/warmup.js

   Responsabilidades:
   - ejecutar diagnóstico inicial seguro
   - registrar estado real tras restoreSession
   - facilitar trazabilidad del arranque
   - no mutar estado de aplicación
   - no tocar sesión/token/storage salvo lectura segura
   - snapshot útil para debug enterprise

   HARDENING PRO:
   - logs consistentes
   - sin romper si faltan módulos
   - tolerancia total a estructuras parciales
   - métricas de sesión, router, shell y loader
   - redacción estricta de tokens en URL/logs
   - compatible con warmup(AppCore) y warmup({ AppCore, ... })

   FIX FALSE WARNINGS:
   - resuelve Router desde deps, AppCore.Router, AppCore.router o AppCore.modules
   - no exige Router.render si existe navigate/go/push/rerender/getSnapshot
   - resuelve I18n desde deps, AppCore.I18n, AppCore.i18n o AppCore.modules
   - no avisa I18N_MISSING si state.lang/document.lang/i18nInitialized existen
   - safeEmit no duplica AppCore.events + window
   - warnings solo para problemas accionables reales
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const WARMUP_LABEL =
  "[AppWarmup]";

const DEFAULT_LANG =
  "es";

const DEFAULT_THEME =
  "dark";

const DEFAULT_ROUTE =
  "/";

const TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
  ]);

const KNOWN_TOKEN_STORAGE_KEYS =
  Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "authToken",
    "refreshToken",
    "refresh_token",
    "sessionToken",
    "tempToken",
    "onion:token",
    "onion:accessToken",
    "onion:refreshToken",
  ]);

const DOM_IDS =
  Object.freeze({
    app:
      "app",

    root:
      "app-root",

    shell:
      "app-shell",

    loader:
      "app-loader",

    viewContainer:
      "view-container",

    sidebar:
      "app-sidebar",

    topbar:
      "app-topbar",
  });

const DOM_SELECTORS =
  Object.freeze({
    app:
      [
        "#app",
        "[data-app]",
        "[data-app-root]",
      ],

    root:
      [
        "#app-root",
        "#root",
        "[data-root]",
        "[data-app-root]",
      ],

    shell:
      [
        "#app-shell",
        ".app-shell",
        "[data-shell]",
        "[data-app-shell]",
      ],

    loader:
      [
        "#app-loader",
        "#boot-loader",
        ".app-loader",
        "[data-loader]",
        "[data-app-loader]",
      ],

    viewContainer:
      [
        "#view-container",
        "#app-view",
        "#router-view",
        "[data-view-container]",
        "[data-router-view]",
      ],

    sidebar:
      [
        "#app-sidebar",
        "#sidebar",
        ".sidebar",
        "[data-sidebar]",
        "[data-sidebar-root]",
      ],

    topbar:
      [
        "#app-topbar",
        "#topbar",
        ".topbar",
        "[data-topbar]",
        "[data-topbar-root]",
      ],
  });

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function ensureObject(value) {
  return isObject(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
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

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeCall(fn, fallback = null) {
  try {
    if (isFunction(fn)) {
      return fn();
    }
  } catch {}

  return fallback;
}

function normalizeDeps(first = {}, second = {}) {
  if (
    isObject(first) &&
    (
      "AppCore" in first ||
      "Auth" in first ||
      "Router" in first ||
      "Store" in first ||
      "SidebarUI" in first ||
      "TopbarUI" in first ||
      "Toast" in first ||
      "I18n" in first
    )
  ) {
    return {
      ...first,
    };
  }

  return {
    ...ensureObject(second),
    AppCore:
      first,
  };
}

/* =========================================================
   MODULE RESOLUTION
========================================================= */

function getModuleFromRegistry(AppCore, names = []) {
  const modules =
    AppCore?.modules;

  if (!modules) {
    return null;
  }

  const keys =
    safeArray(names)
      .map((name) => safeText(name, ""))
      .filter(Boolean);

  for (const key of keys) {
    try {
      if (
        isFunction(modules.get) &&
        modules.get(key)
      ) {
        return modules.get(key);
      }
    } catch {}

    try {
      if (
        isFunction(modules.has) &&
        modules.has(key)
      ) {
        if (isFunction(modules.get)) {
          return modules.get(key);
        }
      }
    } catch {}

    try {
      if (modules[key]) {
        return modules[key];
      }
    } catch {}
  }

  return null;
}

function resolveRuntimeDeps(first = {}, second = {}) {
  const deps =
    normalizeDeps(
      first,
      second
    );

  const AppCore =
    deps.AppCore || null;

  const Router =
    deps.Router ||
    AppCore?.Router ||
    AppCore?.router ||
    getModuleFromRegistry(
      AppCore,
      [
        "Router",
        "router",
        "AppRouter",
        "appRouter",
      ]
    );

  const I18n =
    deps.I18n ||
    AppCore?.I18n ||
    AppCore?.i18n ||
    getModuleFromRegistry(
      AppCore,
      [
        "I18n",
        "i18n",
        "Lang",
        "lang",
      ]
    );

  const Store =
    deps.Store ||
    AppCore?.Store ||
    AppCore?.store ||
    getModuleFromRegistry(
      AppCore,
      [
        "Store",
        "store",
      ]
    );

  const Auth =
    deps.Auth ||
    AppCore?.Auth ||
    AppCore?.auth ||
    getModuleFromRegistry(
      AppCore,
      [
        "Auth",
        "auth",
      ]
    );

  const SidebarUI =
    deps.SidebarUI ||
    AppCore?.SidebarUI ||
    AppCore?.sidebar ||
    getModuleFromRegistry(
      AppCore,
      [
        "SidebarUI",
        "sidebar",
      ]
    );

  const TopbarUI =
    deps.TopbarUI ||
    AppCore?.TopbarUI ||
    AppCore?.topbar ||
    getModuleFromRegistry(
      AppCore,
      [
        "TopbarUI",
        "topbar",
      ]
    );

  const Toast =
    deps.Toast ||
    AppCore?.Toast ||
    AppCore?.toast ||
    getModuleFromRegistry(
      AppCore,
      [
        "Toast",
        "toast",
      ]
    );

  return {
    ...deps,
    AppCore,
    Auth,
    Router,
    Store,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
  };
}

/* =========================================================
   SAFE LOGGING
========================================================= */

function getLogger(AppCore, level = "log") {
  const utils =
    ensureObject(
      AppCore?.utils
    );

  const candidate =
    utils?.[level] ||
    utils?.log ||
    console?.[level] ||
    console?.log;

  if (!isFunction(candidate)) {
    return null;
  }

  try {
    if (
      candidate === console?.log ||
      candidate === console?.warn ||
      candidate === console?.error ||
      candidate === console?.info
    ) {
      return candidate.bind(console);
    }
  } catch {}

  return candidate;
}

function safeLog(AppCore, ...args) {
  try {
    const log =
      getLogger(
        AppCore,
        "log"
      );

    log?.(
      WARMUP_LABEL,
      ...args
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    const warn =
      getLogger(
        AppCore,
        "warn"
      );

    warn?.(
      WARMUP_LABEL,
      ...args
    );
  } catch {}
}

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    ensureObject(options);

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        name,
        payload
      );

      busEmitted = true;
    }
  } catch {}

  /*
    No duplicar bus + window.
    Si existe AppCore.events, ese bus es la fuente principal.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail:
            payload,
        })
      );

      return true;
    } catch {}
  }

  return busEmitted;
}

/* =========================================================
   REDACTION
========================================================= */

function redactTokenInText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${name}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );
  } catch {}

  try {
    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );
  } catch {}

  try {
    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

/* =========================================================
   BROWSER SNAPSHOT
========================================================= */

function getLocationSnapshot() {
  if (!isBrowser()) {
    return {
      href:
        "",
      origin:
        "",
      pathname:
        "",
      search:
        "",
      hash:
        "",
      publicPath:
        DEFAULT_ROUTE,
    };
  }

  try {
    const pathname =
      window.location?.pathname || DEFAULT_ROUTE;

    const search =
      window.location?.search || "";

    const hash =
      window.location?.hash || "";

    return {
      href:
        redactTokenInText(
          window.location?.href || ""
        ),

      origin:
        window.location?.origin || "",

      pathname:
        redactTokenInText(pathname),

      search:
        redactTokenInText(search),

      hash:
        redactTokenInText(hash),

      publicPath:
        redactTokenInText(
          `${pathname}${search}${hash}` || DEFAULT_ROUTE
        ),
    };
  } catch {
    return {
      href:
        "",
      origin:
        "",
      pathname:
        "",
      search:
        "",
      hash:
        "",
      publicPath:
        DEFAULT_ROUTE,
    };
  }
}

function getDocumentSnapshot() {
  if (!isBrowser()) {
    return {
      readyState:
        "server",

      title:
        "",

      lang:
        null,

      visibilityState:
        null,

      hidden:
        null,
    };
  }

  try {
    return {
      readyState:
        document.readyState || "",

      title:
        document.title || "",

      lang:
        document.documentElement?.getAttribute?.("lang") ||
        document.documentElement?.lang ||
        null,

      visibilityState:
        document.visibilityState || null,

      hidden:
        typeof document.hidden === "boolean"
          ? document.hidden
          : null,
    };
  } catch {
    return {
      readyState:
        "",

      title:
        "",

      lang:
        null,

      visibilityState:
        null,

      hidden:
        null,
    };
  }
}

function getNavigatorSnapshot() {
  if (!isBrowser()) {
    return {
      online:
        null,

      language:
        null,

      userAgent:
        "",
    };
  }

  try {
    return {
      online:
        typeof navigator.onLine === "boolean"
          ? navigator.onLine
          : null,

      language:
        navigator.language || null,

      userAgent:
        navigator.userAgent || "",
    };
  } catch {
    return {
      online:
        null,

      language:
        null,

      userAgent:
        "",
    };
  }
}

/* =========================================================
   STORAGE SNAPSHOT
========================================================= */

function getStorage(type = "localStorage") {
  if (!isBrowser()) {
    return null;
  }

  try {
    return window[type] || null;
  } catch {
    return null;
  }
}

function hasStorageKey(storage, key = "") {
  try {
    return Boolean(
      storage?.getItem?.(key)
    );
  } catch {}

  return false;
}

function getStorageTokenHints() {
  if (!isBrowser()) {
    return {
      localStorage:
        false,

      sessionStorage:
        false,

      keys:
        [],
    };
  }

  const localStorageRef =
    getStorage("localStorage");

  const sessionStorageRef =
    getStorage("sessionStorage");

  const foundKeys = [];

  let localHasToken =
    false;

  let sessionHasToken =
    false;

  for (const key of KNOWN_TOKEN_STORAGE_KEYS) {
    if (
      hasStorageKey(
        localStorageRef,
        key
      )
    ) {
      localHasToken =
        true;

      foundKeys.push(
        `localStorage:${key}`
      );
    }

    if (
      hasStorageKey(
        sessionStorageRef,
        key
      )
    ) {
      sessionHasToken =
        true;

      foundKeys.push(
        `sessionStorage:${key}`
      );
    }
  }

  return {
    localStorage:
      localHasToken,

    sessionStorage:
      sessionHasToken,

    keys:
      foundKeys,
  };
}

/* =========================================================
   DOM / SHELL SNAPSHOT
========================================================= */

function queryFirst(selectors = []) {
  if (!isBrowser()) {
    return null;
  }

  for (const selector of safeArray(selectors)) {
    const clean =
      safeText(selector, "");

    if (!clean) {
      continue;
    }

    try {
      const element =
        document.querySelector(clean);

      if (element) {
        return element;
      }
    } catch {}
  }

  return null;
}

function getDomElementSnapshot(id = "", selectors = []) {
  if (!isBrowser()) {
    return {
      exists:
        false,
      id:
        safeText(id, ""),
    };
  }

  try {
    const cleanId =
      safeText(id, "");

    const element =
      (
        cleanId
          ? document.getElementById(cleanId)
          : null
      ) ||
      queryFirst(selectors);

    if (!element) {
      return {
        exists:
          false,
        id:
          cleanId,
      };
    }

    return {
      exists:
        true,

      id:
        element.id || cleanId,

      tag:
        element.tagName?.toLowerCase?.() || "",

      hidden:
        Boolean(element.hidden),

      ariaHidden:
        element.getAttribute?.("aria-hidden") || null,

      className:
        safeText(
          element.className?.baseVal ||
          element.className,
          ""
        ),

      childCount:
        safeNumber(
          element.children?.length,
          0
        ),

      hasContent:
        Boolean(
          safeText(
            element.textContent,
            ""
          )
        ),
    };
  } catch {
    return {
      exists:
        false,
      id:
        safeText(id, ""),
    };
  }
}

function getShellSnapshot(AppCore) {
  const dom =
    ensureObject(
      AppCore?.dom
    );

  return {
    domCache: {
      hasApp:
        Boolean(dom.app),

      hasRoot:
        Boolean(dom.root),

      hasShell:
        Boolean(dom.shell),

      hasLoader:
        Boolean(dom.loader),

      hasViewContainer:
        Boolean(dom.viewContainer),

      hasSidebar:
        Boolean(dom.sidebar),

      hasTopbar:
        Boolean(dom.topbar),
    },

    elements: {
      app:
        getDomElementSnapshot(
          DOM_IDS.app,
          DOM_SELECTORS.app
        ),

      root:
        getDomElementSnapshot(
          DOM_IDS.root,
          DOM_SELECTORS.root
        ),

      shell:
        getDomElementSnapshot(
          DOM_IDS.shell,
          DOM_SELECTORS.shell
        ),

      loader:
        getDomElementSnapshot(
          DOM_IDS.loader,
          DOM_SELECTORS.loader
        ),

      viewContainer:
        getDomElementSnapshot(
          DOM_IDS.viewContainer,
          DOM_SELECTORS.viewContainer
        ),

      sidebar:
        getDomElementSnapshot(
          DOM_IDS.sidebar,
          DOM_SELECTORS.sidebar
        ),

      topbar:
        getDomElementSnapshot(
          DOM_IDS.topbar,
          DOM_SELECTORS.topbar
        ),
    },
  };
}

/* =========================================================
   MODULE SNAPSHOTS
========================================================= */

function getUserSnapshot(AppCore, Auth = null) {
  const state =
    ensureObject(
      AppCore?.state
    );

  const authUser =
    safeCall(
      () =>
        Auth?.getUser?.() ||
        Auth?.getCurrentUser?.() ||
        Auth?.user ||
        null,
      null
    );

  const user =
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    state.session?.user ||
    authUser ||
    null;

  return {
    present:
      Boolean(user),

    username:
      user?.username ||
      user?.email ||
      user?.name ||
      user?.displayName ||
      null,

    displayName:
      user?.displayName ||
      user?.name ||
      user?.username ||
      user?.email ||
      null,

    email:
      user?.email || null,

    role:
      state.role ||
      state.rol ||
      state.userRole ||
      state.session?.role ||
      user?.role ||
      user?.rol ||
      Auth?.role ||
      null,

    hasAvatar:
      Boolean(
        user?.avatarUrl ||
        user?.avatar ||
        user?.photoURL ||
        user?.picture
      ),
  };
}

function getAuthHeaderAvailable(Auth = null) {
  try {
    if (isFunction(Auth?.getAuthHeader)) {
      return Boolean(
        Auth.getAuthHeader()
      );
    }
  } catch {}

  return false;
}

function getAuthIsAuthenticated(Auth = null) {
  try {
    if (isFunction(Auth?.isAuthenticated)) {
      return Boolean(
        Auth.isAuthenticated()
      );
    }
  } catch {}

  return Boolean(
    Auth?.authenticated
  );
}

function getAuthSnapshot(AppCore, Auth = null) {
  const state =
    ensureObject(
      AppCore?.state
    );

  return {
    authenticated:
      Boolean(
        state.authenticated ||
        state.isAuthenticated ||
        getAuthIsAuthenticated(Auth)
      ),

    hasStateToken:
      Boolean(state.token),

    hasAuthHeader:
      getAuthHeaderAvailable(Auth),

    role:
      state.role ||
      state.rol ||
      state.userRole ||
      Auth?.role ||
      null,

    user:
      getUserSnapshot(
        AppCore,
        Auth
      ),
  };
}

function getRouterCurrentCanonicalPath(Router = null) {
  return safeText(
    safeCall(
      () => Router?.getCurrentCanonicalPath?.(),
      ""
    ),
    ""
  );
}

function getRouterCurrentPublicPath(Router = null) {
  return safeText(
    safeCall(
      () => Router?.getCurrentPublicPath?.(),
      ""
    ),
    ""
  );
}

function getRouterSnapshot(AppCore, Router = null) {
  const state =
    ensureObject(
      AppCore?.state
    );

  let routerSnapshot =
    null;

  try {
    routerSnapshot =
      Router?.getSnapshot?.() ||
      Router?.getDebugSnapshot?.() ||
      null;
  } catch {}

  const hasRender =
    isFunction(Router?.render);

  const hasNavigate =
    isFunction(Router?.navigate);

  const hasGo =
    isFunction(Router?.go);

  const hasPush =
    isFunction(Router?.push);

  const hasBind =
    isFunction(Router?.bind);

  const hasRerender =
    Boolean(
      isFunction(Router?.rerenderCurrentRoute) ||
      isFunction(Router?.renderCurrentRoute)
    );

  const hasRouteResolver =
    Boolean(
      isFunction(Router?.getRoute) ||
      isFunction(Router?.resolve) ||
      isFunction(Router?.resolveRoute)
    );

  const present =
    Boolean(Router);

  const canRenderOrNavigate =
    Boolean(
      hasRender ||
      hasNavigate ||
      hasGo ||
      hasPush ||
      hasRerender ||
      routerSnapshot?.initialRenderDone ||
      routerSnapshot?.ready ||
      routerSnapshot?.configured
    );

  return {
    present,

    configured:
      Boolean(
        present &&
        (
          Router?.configured ||
          Router?.isConfigured ||
          hasRouteResolver ||
          canRenderOrNavigate ||
          routerSnapshot?.configured
        )
      ),

    hasRender,
    hasNavigate,
    hasGo,
    hasPush,
    hasBind,
    hasRerender,
    hasRouteResolver,

    canRenderOrNavigate,

    currentCanonicalPath:
      getRouterCurrentCanonicalPath(Router),

    currentPublicPath:
      getRouterCurrentPublicPath(Router),

    stateRoute:
      state.route || DEFAULT_ROUTE,

    statePublicPath:
      state.publicPath || DEFAULT_ROUTE,

    snapshot:
      routerSnapshot,
  };
}

function getStoreSnapshot(Store = null) {
  let state =
    {};

  try {
    state =
      ensureObject(
        Store?.getState?.()
      );
  } catch {}

  return {
    present:
      Boolean(Store),

    hasInit:
      isFunction(Store?.init),

    hasActions:
      Boolean(Store?.actions),

    ready:
      Boolean(
        state.ready ||
        Store?.state?.ready
      ),

    booted:
      Boolean(
        state.booted ||
        Store?.state?.booted
      ),
  };
}

function getUiModuleSnapshot(moduleRef = null) {
  let snapshot =
    null;

  try {
    snapshot =
      moduleRef?.getSnapshot?.() ||
      moduleRef?.getState?.() ||
      null;
  } catch {}

  return {
    present:
      Boolean(moduleRef),

    hasInit:
      isFunction(moduleRef?.init),

    hasRepair:
      isFunction(moduleRef?.repair),

    hasRefresh:
      isFunction(moduleRef?.refresh),

    hasSync:
      isFunction(moduleRef?.sync),

    hasRebind:
      Boolean(
        isFunction(moduleRef?.rebind) ||
        isFunction(moduleRef?.bindEvents) ||
        isFunction(moduleRef?.bind)
      ),

    snapshot,
  };
}

function getI18nAvailable(I18n = null) {
  try {
    const available =
      I18n?.getAvailable?.() ||
      I18n?.getAvailableLangs?.() ||
      I18n?.available ||
      I18n?.langs ||
      [];

    return Array.isArray(available)
      ? available
      : [];
  } catch {}

  return [];
}

function getI18nLang(AppCore, I18n = null) {
  const state =
    ensureObject(
      AppCore?.state
    );

  const documentLang =
    isBrowser()
      ? safeText(
          document.documentElement?.lang ||
          document.documentElement?.getAttribute?.("lang"),
          ""
        )
      : "";

  return safeText(
    safeCall(
      () => I18n?.getLang?.(),
      ""
    ) ||
      I18n?.lang ||
      state.lang ||
      documentLang ||
      DEFAULT_LANG,
    DEFAULT_LANG
  );
}

function getI18nSnapshot(AppCore, I18n = null) {
  const state =
    ensureObject(
      AppCore?.state
    );

  const available =
    getI18nAvailable(I18n);

  const lang =
    getI18nLang(
      AppCore,
      I18n
    );

  const modulePresent =
    Boolean(I18n);

  const runtimePresent =
    Boolean(
      modulePresent ||
      state.i18nInitialized ||
      state.lang ||
      lang
    );

  return {
    present:
      runtimePresent,

    modulePresent,

    initialized:
      Boolean(
        state.i18nInitialized ||
        modulePresent ||
        lang
      ),

    lang,

    stateLang:
      state.lang || DEFAULT_LANG,

    available,

    hasTranslate:
      isFunction(I18n?.t),

    hasBoot:
      Boolean(
        isFunction(I18n?.boot) ||
        isFunction(I18n?.init)
      ),
  };
}

/* =========================================================
   APP STATE SNAPSHOT
========================================================= */

function getAppStateSnapshot(AppCore) {
  const state =
    ensureObject(
      AppCore?.state
    );

  const config =
    ensureObject(
      AppCore?.config
    );

  return {
    apiBase:
      config.apiBase || null,

    environment:
      config.env ||
      config.environment ||
      null,

    baseHref:
      config.baseHref ||
      config.base ||
      null,

    authenticated:
      Boolean(state.authenticated),

    hasToken:
      Boolean(state.token),

    role:
      state.role ||
      state.rol ||
      state.userRole ||
      null,

    route:
      state.route || DEFAULT_ROUTE,

    publicPath:
      state.publicPath || DEFAULT_ROUTE,

    theme:
      state.theme || DEFAULT_THEME,

    lang:
      state.lang || DEFAULT_LANG,

    sidebarOpen:
      typeof state.sidebarOpen === "boolean"
        ? state.sidebarOpen
        : null,

    booting:
      Boolean(state.booting),

    booted:
      Boolean(state.booted),

    ready:
      Boolean(state.ready),

    loading:
      Boolean(state.loading),

    bootPhase:
      state.bootPhase || null,

    bootCycleId:
      state.bootCycleId || 0,

    uiInitialized:
      Boolean(state.uiInitialized),

    i18nInitialized:
      Boolean(state.i18nInitialized),
  };
}

/* =========================================================
   WARNINGS
========================================================= */

function buildWarmupWarnings(snapshot = {}) {
  const warnings = [];

  if (!snapshot.app?.apiBase) {
    warnings.push({
      code:
        "API_BASE_MISSING",

      message:
        "apiBase no configurada.",
    });
  }

  if (
    snapshot.auth?.authenticated &&
    !snapshot.auth?.user?.username
  ) {
    warnings.push({
      code:
        "AUTH_WITHOUT_VISIBLE_USERNAME",

      message:
        "Sesión autenticada sin username visible.",
    });
  }

  if (
    snapshot.auth?.authenticated &&
    !snapshot.auth?.hasStateToken &&
    !snapshot.auth?.hasAuthHeader
  ) {
    warnings.push({
      code:
        "AUTH_WITHOUT_VISIBLE_TOKEN",

      message:
        "Sesión autenticada sin token/header visible en runtime.",
    });
  }

  /*
    No exigimos Router.render estrictamente.
    En esta SPA puede existir navegación/render por Router.navigate,
    Router.go, Router.push, render inicial modular o snapshot listo.
  */
  if (
    !snapshot.router?.present &&
    !snapshot.router?.stateRoute &&
    !snapshot.router?.statePublicPath
  ) {
    warnings.push({
      code:
        "ROUTER_UNAVAILABLE",

      message:
        "Router no detectable en deps/AppCore.",
    });
  }

  if (
    snapshot.router?.present &&
    !snapshot.router?.canRenderOrNavigate &&
    !snapshot.router?.configured
  ) {
    warnings.push({
      code:
        "ROUTER_NOT_READY",

      message:
        "Router detectado pero sin capacidad de navegación/render aparente.",
    });
  }

  if (!snapshot.shell?.elements?.viewContainer?.exists) {
    warnings.push({
      code:
        "VIEW_CONTAINER_MISSING",

      message:
        "No existe #view-container en el DOM.",
    });
  }

  /*
    No avisamos I18N_MISSING si:
    - AppCore.state.lang existe
    - state.i18nInitialized está activo
    - documentElement.lang existe
    - I18n se resuelve desde AppCore/modules
  */
  if (
    !snapshot.i18n?.present &&
    !snapshot.app?.lang &&
    !snapshot.document?.lang
  ) {
    warnings.push({
      code:
        "I18N_UNAVAILABLE",

      message:
        "No se detecta idioma runtime ni módulo I18n.",
    });
  }

  return warnings;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function createWarmupSnapshot(first = {}, second = {}) {
  const deps =
    resolveRuntimeDeps(
      first,
      second
    );

  const {
    AppCore,
    Auth,
    Router,
    Store,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    reason = "warmup",
  } = deps;

  const startedAt =
    Date.now();

  const snapshot = {
    ok:
      Boolean(AppCore),

    reason:
      safeText(reason, "warmup"),

    at:
      safeIsoDate(startedAt),

    atMs:
      startedAt,

    browser:
      isBrowser(),

    location:
      getLocationSnapshot(),

    document:
      getDocumentSnapshot(),

    navigator:
      getNavigatorSnapshot(),

    storage:
      getStorageTokenHints(),

    app:
      getAppStateSnapshot(AppCore),

    auth:
      getAuthSnapshot(
        AppCore,
        Auth
      ),

    router:
      getRouterSnapshot(
        AppCore,
        Router
      ),

    store:
      getStoreSnapshot(Store),

    i18n:
      getI18nSnapshot(
        AppCore,
        I18n
      ),

    ui: {
      toast:
        getUiModuleSnapshot(Toast),

      sidebar:
        getUiModuleSnapshot(SidebarUI),

      topbar:
        getUiModuleSnapshot(TopbarUI),
    },

    shell:
      getShellSnapshot(AppCore),
  };

  snapshot.warnings =
    buildWarmupWarnings(snapshot);

  snapshot.warningCount =
    snapshot.warnings.length;

  return snapshot;
}

/* =========================================================
   WARMUP
========================================================= */

export async function warmup(first = {}, second = {}) {
  const deps =
    resolveRuntimeDeps(
      first,
      second
    );

  const {
    AppCore,
    emit = true,
    log = true,
  } = deps;

  if (!AppCore) {
    return createWarmupSnapshot(deps);
  }

  const startedAt =
    Date.now();

  const snapshot =
    createWarmupSnapshot({
      ...deps,
      reason:
        deps.reason || "warmup",
    });

  snapshot.durationMs =
    Date.now() - startedAt;

  try {
    if (log) {
      safeLog(
        AppCore,
        "Warmup app iniciado."
      );

      safeLog(
        AppCore,
        "Diagnóstico inicial:",
        snapshot
      );

      for (const warning of snapshot.warnings || []) {
        safeWarn(
          AppCore,
          "Warmup aviso:",
          warning.code,
          warning.message
        );
      }
    }

    if (emit) {
      safeEmit(
        AppCore,
        "app:warmup",
        snapshot
      );
    }

    return snapshot;
  } catch {
    return snapshot;
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getWarmupSummary(snapshot = {}) {
  const data =
    ensureObject(snapshot);

  return {
    ok:
      Boolean(data.ok),

    at:
      data.at || "",

    durationMs:
      safeNumber(
        data.durationMs,
        0
      ),

    warningCount:
      safeNumber(
        data.warningCount,
        0
      ),

    authenticated:
      Boolean(
        data.auth?.authenticated
      ),

    username:
      data.auth?.user?.username || null,

    role:
      data.auth?.role || null,

    route:
      data.app?.route || DEFAULT_ROUTE,

    publicPath:
      data.app?.publicPath || DEFAULT_ROUTE,

    apiBase:
      data.app?.apiBase || null,

    lang:
      data.app?.lang || DEFAULT_LANG,

    theme:
      data.app?.theme || DEFAULT_THEME,

    booting:
      Boolean(data.app?.booting),

    booted:
      Boolean(data.app?.booted),

    ready:
      Boolean(data.app?.ready),

    loading:
      Boolean(data.app?.loading),

    routerPresent:
      Boolean(data.router?.present),

    routerConfigured:
      Boolean(data.router?.configured),

    routerCanRenderOrNavigate:
      Boolean(data.router?.canRenderOrNavigate),

    i18nPresent:
      Boolean(data.i18n?.present),

    i18nModulePresent:
      Boolean(data.i18n?.modulePresent),

    hasViewContainer:
      Boolean(
        data.shell?.elements?.viewContainer?.exists
      ),

    hasLoader:
      Boolean(
        data.shell?.elements?.loader?.exists
      ),

    hasSidebar:
      Boolean(
        data.shell?.elements?.sidebar?.exists
      ),

    hasTopbar:
      Boolean(
        data.shell?.elements?.topbar?.exists
      ),
  };
}

export default warmup;
