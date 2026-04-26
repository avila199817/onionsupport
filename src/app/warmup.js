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

function safeBool(value) {
  return value === true;
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
   SAFE LOGGING
========================================================= */

function getLogger(AppCore, level = "log") {
  const utils =
    ensureObject(
      AppCore?.utils
    );

  const fn =
    utils?.[level] ||
    utils?.log ||
    console?.[level] ||
    console?.log;

  return isFunction(fn)
    ? fn
    : null;
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

function safeEmit(AppCore, eventName, payload = {}) {
  if (!eventName) {
    return false;
  }

  let emitted = false;

  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );

    emitted = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail:
            payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
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

  const foundKeys = [];

  let localHasToken =
    false;

  let sessionHasToken =
    false;

  for (const key of KNOWN_TOKEN_STORAGE_KEYS) {
    if (
      hasStorageKey(
        window.localStorage,
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
        window.sessionStorage,
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

function getDomElementSnapshot(id = "") {
  if (
    !isBrowser() ||
    !id
  ) {
    return {
      exists:
        false,
      id,
    };
  }

  try {
    const element =
      document.getElementById(id);

    if (!element) {
      return {
        exists:
          false,
        id,
      };
    }

    return {
      exists:
        true,

      id,

      tag:
        element.tagName?.toLowerCase?.() || "",

      hidden:
        Boolean(element.hidden),

      ariaHidden:
        element.getAttribute("aria-hidden"),

      className:
        safeText(element.className, ""),

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
      id,
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
        getDomElementSnapshot(DOM_IDS.app),

      root:
        getDomElementSnapshot(DOM_IDS.root),

      shell:
        getDomElementSnapshot(DOM_IDS.shell),

      loader:
        getDomElementSnapshot(DOM_IDS.loader),

      viewContainer:
        getDomElementSnapshot(DOM_IDS.viewContainer),

      sidebar:
        getDomElementSnapshot(DOM_IDS.sidebar),

      topbar:
        getDomElementSnapshot(DOM_IDS.topbar),
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
    (() => {
      try {
        return (
          Auth?.getUser?.() ||
          Auth?.getCurrentUser?.() ||
          Auth?.user ||
          null
        );
      } catch {
        return null;
      }
    })();

  const user =
    state.user ||
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
      user?.role ||
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

function getAuthSnapshot(AppCore, Auth = null) {
  const state =
    ensureObject(
      AppCore?.state
    );

  let authIsAuthenticated =
    false;

  try {
    if (isFunction(Auth?.isAuthenticated)) {
      authIsAuthenticated =
        Boolean(
          Auth.isAuthenticated()
        );
    }
  } catch {}

  return {
    authenticated:
      Boolean(
        state.authenticated ||
        authIsAuthenticated ||
        Auth?.authenticated
      ),

    hasStateToken:
      Boolean(state.token),

    hasAuthHeader:
      Boolean(
        Auth?.getAuthHeader?.()
      ),

    role:
      state.role ||
      Auth?.role ||
      null,

    user:
      getUserSnapshot(
        AppCore,
        Auth
      ),
  };
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
      null;
  } catch {}

  return {
    configured:
      Boolean(
        Router?.configure ||
        Router?.render ||
        Router?.navigate
      ),

    hasRender:
      isFunction(Router?.render),

    hasNavigate:
      isFunction(Router?.navigate),

    hasBind:
      isFunction(Router?.bind),

    currentCanonicalPath:
      safeText(
        Router?.getCurrentCanonicalPath?.(),
        ""
      ),

    currentPublicPath:
      safeText(
        Router?.getCurrentPublicPath?.(),
        ""
      ),

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

function getI18nSnapshot(AppCore, I18n = null) {
  const state =
    ensureObject(
      AppCore?.state
    );

  let available =
    [];

  try {
    available =
      I18n?.getAvailable?.() ||
      I18n?.getAvailableLangs?.() ||
      [];
  } catch {}

  return {
    present:
      Boolean(I18n),

    lang:
      safeText(
        I18n?.getLang?.(),
        state.lang || DEFAULT_LANG
      ),

    stateLang:
      state.lang || DEFAULT_LANG,

    available:
      Array.isArray(available)
        ? available
        : [],

    hasTranslate:
      isFunction(I18n?.t),

    hasBoot:
      isFunction(I18n?.boot),
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
      state.role || null,

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

  if (!snapshot.router?.hasRender) {
    warnings.push({
      code:
        "ROUTER_RENDER_MISSING",

      message:
        "Router.render no disponible.",
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

  if (!snapshot.i18n?.present) {
    warnings.push({
      code:
        "I18N_MISSING",

      message:
        "Módulo I18n no disponible.",
    });
  }

  return warnings;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function createWarmupSnapshot(first = {}, second = {}) {
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
  } = normalizeDeps(
    first,
    second
  );

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
    normalizeDeps(
      first,
      second
    );

  const {
    AppCore,
    emit = true,
    log = true,
  } = deps;

  if (!AppCore) {
    const snapshot =
      createWarmupSnapshot(deps);

    return snapshot;
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
