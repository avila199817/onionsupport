/* =========================================================
   Onion SPA - App UI Systems
   Archivo: src/app/ui.js

   RESPONSABILIDADES:
   - sincronizar UI usuario global
   - inicializar sistemas UI compartidos
   - registrar módulos UI en AppCore
   - refresco UI ante cambio idioma
   - evitar roturas si faltan deps
   - bridge global Toast robusto
   - exponer snapshots de diagnóstico

   FIX CRÍTICO EVENT STORM:
   - syncUserUI() NO llama repair/render/rebind/bindEvents
   - repairUISystems() NO fuerza rebind por defecto
   - bindAppLanguageSync() NO rebindea sidebar/topbar
   - initUISystems() inicializa módulos una sola vez
   - safeEmit() NO duplica AppCore.events + window
   - rebind queda reservado solo para petición explícita
   - sync ligero por módulo:
     SidebarUI: renderUser/applyRoleVisibility/syncRouteAndIndicator
     TopbarUI: renderUser/refreshUser/updateUser/syncUser/refresh/sync
========================================================= */

import {
  registerModule,
} from "./helpers.js";

import {
  APP_SCOPE,
  APP_SCOPES,
  APP_EVENTS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_SCOPE =
  APP_SCOPES?.ui ||
  APP_SCOPE ||
  "app:ui";

const UI_EVENTS =
  Object.freeze({
    initStart:
      "app:ui:init:start",

    initSuccess:
      "app:ui:init:success",

    initError:
      "app:ui:init:error",

    ready:
      APP_EVENTS?.uiReady || "app:ui:ready",

    repair:
      APP_EVENTS?.uiRepair || "app:ui:repair",

    repairRequest:
      APP_EVENTS?.uiRepairRequest || "app:ui:repair-request",

    userSync:
      "app:user-ui:sync",

    userSyncStart:
      "app:user-ui:sync:start",

    userSyncDone:
      "app:user-ui:sync:done",

    userSyncError:
      "app:user-ui:sync:error",

    langChange:
      APP_EVENTS?.langChange || "app:lang:change",

    toastBridgeReady:
      "app:ui:toast-bridge:ready",

    moduleRegistered:
      "app:ui:module:registered",

    moduleInit:
      "app:ui:module:init",

    moduleError:
      "app:ui:module:error",
  });

const UI_MODULES =
  Object.freeze({
    toast:
      "toast",

    sidebar:
      "sidebar",

    topbar:
      "topbar",
  });

const UI_INIT_METHODS =
  Object.freeze([
    "init",
    "boot",
    "mount",
    "start",
  ]);

const SIDEBAR_USER_LIGHT_METHODS =
  Object.freeze([
    "renderUser",
    "refreshUser",
    "updateUser",
    "syncUser",
  ]);

const SIDEBAR_VISUAL_LIGHT_METHODS =
  Object.freeze([
    "applyRoleVisibility",
    "syncRouteAndIndicator",
    "syncIndicator",
    "updateToggleLabel",
  ]);

const SIDEBAR_FALLBACK_LIGHT_METHODS =
  Object.freeze([
    "refresh",
    "sync",
  ]);

const TOPBAR_USER_LIGHT_METHODS =
  Object.freeze([
    "renderUser",
    "refreshUser",
    "updateUser",
    "syncUser",
  ]);

const TOPBAR_FALLBACK_LIGHT_METHODS =
  Object.freeze([
    "refresh",
    "sync",
  ]);

const UI_HARD_REPAIR_METHODS =
  Object.freeze([
    "repair",
    "refresh",
    "sync",
  ]);

const UI_REBIND_METHODS =
  Object.freeze([
    "rebind",
    "rebindEvents",
    "bindEvents",
    "bind",
  ]);

const TOAST_TYPES =
  Object.freeze([
    "success",
    "error",
    "warning",
    "warn",
    "info",
    "loading",
  ]);

const SYNC_QUEUE_DELAY_MS = 0;

/* =========================================================
   INTERNAL STATE
========================================================= */

let syncingUserUI = false;
let syncQueued = false;
let initInFlight = false;
let uiInitialized = false;
let languageSyncBound = false;
let toastBridgeBound = false;

let moduleInitState = new WeakMap();

const boundDisposers = [];

const uiState = {
  initialized:
    false,

  initCount:
    0,

  syncCount:
    0,

  repairCount:
    0,

  lastSyncAt:
    0,

  lastSyncReason:
    "",

  lastInitAt:
    0,

  lastInitOk:
    false,

  lastError:
    null,

  modules: {
    toast:
      false,

    sidebar:
      false,

    topbar:
      false,
  },
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeBool(value) {
  return value === true;
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

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function isExtensibleObject(value) {
  try {
    return (
      isObject(value) &&
      Object.isExtensible(value)
    );
  } catch {}

  return false;
}

function safeDefineValue(target, key, value) {
  if (
    !isExtensibleObject(target) ||
    !key
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        configurable:
          true,
        enumerable:
          false,
        writable:
          true,
      }
    );

    return true;
  } catch {}

  return false;
}

function normalizeDeps(first = {}, second = {}) {
  if (
    isObject(first) &&
    (
      "AppCore" in first ||
      "Auth" in first ||
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

function getPayload(eventOrPayload = {}) {
  return ensureObject(
    eventOrPayload?.detail ||
      eventOrPayload?.payload ||
      eventOrPayload
  );
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(
      "[AppUI]",
      ...args
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AppUI]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AppUI]",
      ...args
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(
      "[AppUI]",
      ...args
    );
  } catch {}

  try {
    console.error(
      "[AppUI]",
      ...args
    );
  } catch {}
}

function safeWindowDispatch(eventName, payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail:
          payload,
      })
    );

    return true;
  } catch {}

  return false;
}

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  if (!eventName) {
    return false;
  }

  const opts =
    ensureObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        eventName,
        payload
      );

      busEmitted = true;
    }
  } catch {}

  /*
    Importante:
    No emitir siempre también por window.
    Si AppCore.events existe, varios módulos ya escuchan el bus.
    Duplicar a window provoca doble commit visual y dobles repairs.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    const windowOk =
      safeWindowDispatch(
        eventName,
        payload
      );

    return Boolean(
      busEmitted ||
      windowOk
    );
  }

  return busEmitted;
}

function setLastError(AppCore, source = "ui", error = null) {
  const snapshot = {
    source:
      safeText(source, "ui"),

    message:
      safeText(
        error?.message || error,
        "Error UI."
      ),

    at:
      safeIsoDate(),
  };

  uiState.lastError =
    snapshot;

  safeEmit(
    AppCore,
    UI_EVENTS.moduleError,
    snapshot
  );

  return snapshot;
}

/* =========================================================
   USER SNAPSHOT
========================================================= */

function getAuthUser(Auth) {
  try {
    return (
      Auth?.getUser?.() ||
      Auth?.getCurrentUser?.() ||
      Auth?.user ||
      null
    );
  } catch {}

  return null;
}

function getAuthRole(Auth) {
  try {
    return (
      Auth?.getCurrentRole?.() ||
      Auth?.getRole?.() ||
      Auth?.role ||
      null
    );
  } catch {}

  return null;
}

function getAuthStatus(Auth) {
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

function getUserSnapshot(AppCore, Auth = null) {
  const state =
    ensureObject(
      AppCore?.state
    );

  const user =
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    state.session?.user ||
    getAuthUser(Auth) ||
    null;

  const role =
    state.role ||
    state.rol ||
    state.userRole ||
    state.session?.role ||
    user?.role ||
    user?.rol ||
    getAuthRole(Auth) ||
    null;

  const username =
    user?.username ||
    user?.email ||
    user?.name ||
    user?.displayName ||
    null;

  return {
    user,

    authenticated:
      Boolean(
        state.authenticated ||
        state.isAuthenticated ||
        getAuthStatus(Auth)
      ),

    role,

    username,

    displayName:
      user?.displayName ||
      user?.name ||
      user?.username ||
      user?.email ||
      null,

    avatarUrl:
      user?.avatarUrl ||
      user?.avatar ||
      user?.photoURL ||
      user?.picture ||
      null,

    lang:
      state.lang ||
      null,

    route:
      state.route ||
      "/",

    publicPath:
      state.publicPath ||
      state.route ||
      "/",
  };
}

/* =========================================================
   MODULE REGISTRY
========================================================= */

function registerAppModule(AppCore, name, moduleRef) {
  const cleanName =
    safeText(name, "");

  if (
    !AppCore ||
    !cleanName ||
    !moduleRef
  ) {
    return false;
  }

  let registered = false;

  try {
    registerModule(
      AppCore,
      cleanName,
      moduleRef
    );

    registered = true;
  } catch {}

  try {
    const modules =
      AppCore.modules;

    if (modules) {
      if (
        isFunction(modules.has) &&
        modules.has(cleanName)
      ) {
        registered = true;
      } else if (
        isFunction(modules.register)
      ) {
        modules.register(
          cleanName,
          moduleRef
        );

        registered = true;
      } else if (
        isFunction(modules.set)
      ) {
        modules.set(
          cleanName,
          moduleRef
        );

        registered = true;
      } else if (
        isExtensibleObject(modules)
      ) {
        modules[cleanName] =
          moduleRef;

        registered = true;
      }
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "registerAppModule() error:",
      cleanName,
      error
    );
  }

  try {
    if (isExtensibleObject(AppCore)) {
      const publicName =
        cleanName === "toast"
          ? "Toast"
          : cleanName === "sidebar"
            ? "SidebarUI"
            : cleanName === "topbar"
              ? "TopbarUI"
              : cleanName;

      safeDefineValue(
        AppCore,
        publicName,
        moduleRef
      );

      registered = true;
    }
  } catch {}

  if (registered) {
    safeEmit(
      AppCore,
      UI_EVENTS.moduleRegistered,
      {
        name:
          cleanName,
      }
    );
  }

  return registered;
}

/* =========================================================
   SAFE MODULE INIT / METHODS
========================================================= */

function wasModuleInitialized(moduleRef) {
  try {
    if (!moduleRef) {
      return false;
    }

    if (moduleInitState.get(moduleRef)) {
      return true;
    }

    if (moduleRef.initialized === true) {
      return true;
    }

    return false;
  } catch {}

  return false;
}

function markModuleInitialized(moduleRef, value = true) {
  try {
    if (moduleRef) {
      moduleInitState.set(
        moduleRef,
        Boolean(value)
      );
    }
  } catch {}
}

function callModuleMethod(moduleRef, methodName, context = {}) {
  if (
    !moduleRef ||
    !methodName
  ) {
    return false;
  }

  const fn =
    moduleRef?.[methodName];

  if (!isFunction(fn)) {
    return false;
  }

  try {
    fn.call(
      moduleRef,
      context.reason || context
    );

    return true;
  } catch {}

  try {
    fn.call(
      moduleRef,
      context.reason || "",
      context
    );

    return true;
  } catch {}

  try {
    fn.call(
      moduleRef,
      context
    );

    return true;
  } catch {}

  try {
    fn.call(
      moduleRef,
      context.AppCore,
      context
    );

    return true;
  } catch {}

  try {
    fn.call(moduleRef);
    return true;
  } catch {}

  return false;
}

function callFirstModuleMethod(moduleRef, methodNames = [], context = {}) {
  for (const methodName of safeArray(methodNames)) {
    if (
      callModuleMethod(
        moduleRef,
        methodName,
        context
      )
    ) {
      return {
        called:
          true,
        method:
          methodName,
      };
    }
  }

  return {
    called:
      false,
    method:
      "",
  };
}

function callAllModuleMethods(moduleRef, methodNames = [], context = {}) {
  const called = [];
  const failed = [];

  for (const methodName of safeArray(methodNames)) {
    try {
      if (
        callModuleMethod(
          moduleRef,
          methodName,
          context
        )
      ) {
        called.push(methodName);
      } else {
        failed.push(methodName);
      }
    } catch {
      failed.push(methodName);
    }
  }

  return {
    called:
      called.length > 0,

    methods:
      called,

    failed,
  };
}

function safeInitModule(AppCore, moduleRef, label = "module", context = {}) {
  if (!moduleRef) {
    return false;
  }

  if (wasModuleInitialized(moduleRef)) {
    return true;
  }

  let initializedModule =
    false;

  const fullContext = {
    ...ensureObject(context),
    AppCore,
    label,
    reason:
      context.reason ||
      `${label}:init`,
  };

  for (const methodName of UI_INIT_METHODS) {
    try {
      if (
        callModuleMethod(
          moduleRef,
          methodName,
          fullContext
        )
      ) {
        initializedModule = true;
        break;
      }
    } catch (error) {
      setLastError(
        AppCore,
        `${label}.${methodName}`,
        error
      );

      safeWarn(
        AppCore,
        `Error ${label}.${methodName}().`,
        error
      );
    }
  }

  if (initializedModule) {
    markModuleInitialized(
      moduleRef,
      true
    );

    safeEmit(
      AppCore,
      UI_EVENTS.moduleInit,
      {
        label,
      }
    );

    safeLog(
      AppCore,
      `${label} inicializado.`
    );
  }

  return initializedModule;
}

/* =========================================================
   LIGHT UI SYNC
========================================================= */

function syncSidebarLight(SidebarUI, context = {}) {
  if (!SidebarUI) {
    return {
      ok:
        false,
      user:
        "",
      visual:
        [],
      fallback:
        "",
    };
  }

  const userResult =
    callFirstModuleMethod(
      SidebarUI,
      SIDEBAR_USER_LIGHT_METHODS,
      context
    );

  const visualResult =
    callAllModuleMethods(
      SidebarUI,
      SIDEBAR_VISUAL_LIGHT_METHODS,
      context
    );

  let fallbackResult = {
    called:
      false,
    method:
      "",
  };

  /*
    Solo usamos refresh/sync si el módulo no expone métodos ligeros.
    No llamamos repair/rebind/render.
  */
  if (
    !userResult.called &&
    !visualResult.called
  ) {
    fallbackResult =
      callFirstModuleMethod(
        SidebarUI,
        SIDEBAR_FALLBACK_LIGHT_METHODS,
        context
      );
  }

  return {
    ok:
      Boolean(
        userResult.called ||
        visualResult.called ||
        fallbackResult.called
      ),

    user:
      userResult.method,

    visual:
      visualResult.methods,

    fallback:
      fallbackResult.method,
  };
}

function syncTopbarLight(TopbarUI, context = {}) {
  if (!TopbarUI) {
    return {
      ok:
        false,
      user:
        "",
      fallback:
        "",
    };
  }

  const userResult =
    callFirstModuleMethod(
      TopbarUI,
      TOPBAR_USER_LIGHT_METHODS,
      context
    );

  let fallbackResult = {
    called:
      false,
    method:
      "",
  };

  if (!userResult.called) {
    fallbackResult =
      callFirstModuleMethod(
        TopbarUI,
        TOPBAR_FALLBACK_LIGHT_METHODS,
        context
      );
  }

  return {
    ok:
      Boolean(
        userResult.called ||
        fallbackResult.called
      ),

    user:
      userResult.method,

    fallback:
      fallbackResult.method,
  };
}

function hardRepairModule(moduleRef, context = {}) {
  return callFirstModuleMethod(
    moduleRef,
    UI_HARD_REPAIR_METHODS,
    context
  );
}

function rebindModule(moduleRef, context = {}) {
  return callFirstModuleMethod(
    moduleRef,
    UI_REBIND_METHODS,
    context
  );
}

/* =========================================================
   USER UI
========================================================= */

export function syncUserUI(first = {}, second = {}) {
  const deps =
    normalizeDeps(
      first,
      second
    );

  const {
    AppCore,
    Auth,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    reason = "sync-user-ui",
    payload = {},
    rebind = false,
    hardRepair = false,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (syncingUserUI) {
    syncQueued = true;
    return false;
  }

  syncingUserUI = true;

  const startedAt =
    Date.now();

  const cleanReason =
    safeText(
      reason,
      "sync-user-ui"
    );

  safeEmit(
    AppCore,
    UI_EVENTS.userSyncStart,
    {
      reason:
        cleanReason,
      at:
        safeIsoDate(startedAt),
    }
  );

  try {
    const snapshot =
      getUserSnapshot(
        AppCore,
        Auth
      );

    const context = {
      AppCore,
      Auth,
      SidebarUI,
      TopbarUI,
      Toast,
      I18n,

      reason:
        cleanReason,

      payload:
        ensureObject(payload),

      snapshot,

      user:
        snapshot.user,

      authenticated:
        snapshot.authenticated,

      role:
        snapshot.role,

      username:
        snapshot.username,

      displayName:
        snapshot.displayName,

      avatarUrl:
        snapshot.avatarUrl,

      lang:
        snapshot.lang,

      route:
        snapshot.route,

      publicPath:
        snapshot.publicPath,
    };

    let ok = false;

    let sidebarResult = {
      ok:
        false,
    };

    let topbarResult = {
      ok:
        false,
    };

    if (hardRepair === true) {
      const sidebarRepair =
        hardRepairModule(
          SidebarUI,
          context
        );

      const topbarRepair =
        hardRepairModule(
          TopbarUI,
          context
        );

      sidebarResult = {
        ok:
          sidebarRepair.called,
        repair:
          sidebarRepair.method,
      };

      topbarResult = {
        ok:
          topbarRepair.called,
        repair:
          topbarRepair.method,
      };
    } else {
      sidebarResult =
        syncSidebarLight(
          SidebarUI,
          context
        );

      topbarResult =
        syncTopbarLight(
          TopbarUI,
          context
        );
    }

    ok =
      Boolean(
        sidebarResult.ok ||
        topbarResult.ok
      );

    let sidebarRebind = {
      called:
        false,
      method:
        "",
    };

    let topbarRebind = {
      called:
        false,
      method:
        "",
    };

    /*
      Rebind solo explícito.
      Nunca por defecto durante auth/router/lang.
    */
    if (rebind === true) {
      sidebarRebind =
        rebindModule(
          SidebarUI,
          context
        );

      topbarRebind =
        rebindModule(
          TopbarUI,
          context
        );

      ok =
        Boolean(
          ok ||
          sidebarRebind.called ||
          topbarRebind.called
        );
    }

    uiState.syncCount += 1;
    uiState.lastSyncAt =
      Date.now();
    uiState.lastSyncReason =
      context.reason;

    safeEmit(
      AppCore,
      UI_EVENTS.userSync,
      {
        ...snapshot,
        reason:
          context.reason,
        source:
          "app:ui",
      }
    );

    safeEmit(
      AppCore,
      UI_EVENTS.userSyncDone,
      {
        ok,
        reason:
          context.reason,
        durationMs:
          Date.now() - startedAt,
        authenticated:
          snapshot.authenticated,
        username:
          snapshot.username,
        role:
          snapshot.role,
        sidebar:
          sidebarResult,
        topbar:
          topbarResult,
        rebind:
          Boolean(rebind),
        sidebarRebind:
          sidebarRebind.method,
        topbarRebind:
          topbarRebind.method,
      }
    );

    safeLog(
      AppCore,
      "UI usuario sincronizada.",
      {
        reason:
          context.reason,
        authenticated:
          snapshot.authenticated,
        username:
          snapshot.username,
        role:
          snapshot.role,
        sidebar:
          sidebarResult,
        topbar:
          topbarResult,
        rebind:
          Boolean(rebind),
      }
    );

    return true;
  } catch (error) {
    setLastError(
      AppCore,
      "syncUserUI",
      error
    );

    safeError(
      AppCore,
      "syncUserUI() error:",
      error
    );

    safeEmit(
      AppCore,
      UI_EVENTS.userSyncError,
      {
        message:
          safeText(
            error?.message || error,
            "syncUserUI() error."
          ),
        reason:
          cleanReason,
      }
    );

    return false;
  } finally {
    syncingUserUI = false;

    if (syncQueued) {
      syncQueued = false;

      setTimeout(() => {
        syncUserUI({
          ...deps,
          reason:
            `${cleanReason}:queued`,
          rebind:
            false,
          hardRepair:
            false,
        });
      }, SYNC_QUEUE_DELAY_MS);
    }
  }
}

/* =========================================================
   LANGUAGE BIND
========================================================= */

function rememberDisposer(disposer) {
  if (isFunction(disposer)) {
    boundDisposers.push(disposer);
  }
}

function bindEvent(AppCore, scope, eventName, handler) {
  if (
    !eventName ||
    !isFunction(handler)
  ) {
    return false;
  }

  try {
    if (isFunction(AppCore?.cleanup?.event)) {
      try {
        AppCore.cleanup.event(
          scope,
          eventName,
          handler
        );

        return true;
      } catch {
        if (isBrowser()) {
          AppCore.cleanup.event(
            scope,
            window,
            eventName,
            handler
          );

          return true;
        }
      }
    }
  } catch {}

  try {
    if (isFunction(AppCore?.events?.on)) {
      const off =
        AppCore.events.on(
          eventName,
          handler
        );

      if (isFunction(off)) {
        rememberDisposer(off);
      } else if (isFunction(AppCore?.events?.off)) {
        rememberDisposer(() => {
          try {
            AppCore.events.off(
              eventName,
              handler
            );
          } catch {}
        });
      }

      return true;
    }
  } catch {}

  if (isBrowser()) {
    try {
      window.addEventListener(
        eventName,
        handler
      );

      rememberDisposer(() => {
        try {
          window.removeEventListener(
            eventName,
            handler
          );
        } catch {}
      });

      return true;
    } catch {}
  }

  return false;
}

export function bindAppLanguageSync(first = {}, second = {}) {
  const deps =
    normalizeDeps(
      first,
      second
    );

  const {
    AppCore,
    Auth,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    scope = DEFAULT_SCOPE,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (
    languageSyncBound ||
    safeBool(AppCore.__appLangUiBound)
  ) {
    return true;
  }

  const handler = (eventOrPayload = {}) => {
    const detail =
      getPayload(eventOrPayload);

    /*
      Cambio clave:
      NO rebind en cambio de idioma.
      El i18n live debe actualizar data-i18n.
      El sidebar/topbar solo sincronizan usuario/activo/visibilidad.
    */
    syncUserUI({
      AppCore,
      Auth,
      SidebarUI,
      TopbarUI,
      Toast,
      I18n,
      reason:
        "app:lang:change",
      payload:
        detail,
      rebind:
        false,
      hardRepair:
        false,
    });

    try {
      const title =
        document?.title || "";

      if (AppCore?.dom?.topbarTitle) {
        AppCore.dom.topbarTitle.textContent =
          title;
      }
    } catch {}
  };

  const bound =
    bindEvent(
      AppCore,
      scope,
      UI_EVENTS.langChange,
      handler
    );

  if (!bound) {
    return false;
  }

  languageSyncBound =
    true;

  if (isExtensibleObject(AppCore)) {
    safeDefineValue(
      AppCore,
      "__appLangUiBound",
      true
    );
  }

  safeLog(
    AppCore,
    "Language UI sync activo."
  );

  return true;
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

function normalizeToastType(type = "info") {
  const normalized =
    safeText(
      type,
      "info"
    ).toLowerCase();

  if (normalized === "warn") {
    return "warning";
  }

  return TOAST_TYPES.includes(normalized)
    ? normalized
    : "info";
}

function resolveToastMethod(Toast, type = "info") {
  const normalized =
    normalizeToastType(type);

  if (
    normalized === "warning" &&
    isFunction(Toast?.warning)
  ) {
    return Toast.warning;
  }

  if (
    normalized === "warning" &&
    isFunction(Toast?.warn)
  ) {
    return Toast.warn;
  }

  return Toast?.[normalized] || null;
}

function createToastBridge(AppCore, Toast) {
  return function showToast(message = "", type = "info", options = {}) {
    const cleanType =
      normalizeToastType(type);

    const cleanMessage =
      safeText(message, "");

    if (!cleanMessage) {
      return null;
    }

    const payload = {
      ...ensureObject(options),
      type:
        cleanType,
      message:
        cleanMessage,
    };

    try {
      const method =
        resolveToastMethod(
          Toast,
          cleanType
        );

      if (isFunction(method)) {
        return method.call(
          Toast,
          cleanMessage,
          payload
        );
      }

      if (isFunction(Toast?.show)) {
        return Toast.show(payload);
      }

      if (isFunction(Toast?.notify)) {
        return Toast.notify(payload);
      }

      return null;
    } catch (error) {
      safeWarn(
        AppCore,
        "Toast bridge error:",
        error
      );

      return null;
    }
  };
}

function attachToastBridge(AppCore, bridge) {
  let attached = false;

  try {
    if (isFunction(AppCore?.setShowToast)) {
      AppCore.setShowToast(
        bridge
      );

      attached = true;
    }
  } catch {}

  if (
    isExtensibleObject(AppCore)
  ) {
    if (
      safeDefineValue(
        AppCore,
        "showToast",
        bridge
      )
    ) {
      attached = true;
    }

    if (
      safeDefineValue(
        AppCore,
        "toast",
        bridge
      )
    ) {
      attached = true;
    }
  }

  if (
    isExtensibleObject(AppCore?.utils)
  ) {
    if (
      safeDefineValue(
        AppCore.utils,
        "showToast",
        bridge
      )
    ) {
      attached = true;
    }

    if (
      safeDefineValue(
        AppCore.utils,
        "toast",
        bridge
      )
    ) {
      attached = true;
    }
  }

  return attached;
}

export function bindToastBridge(first = {}, second = null) {
  const deps =
    normalizeDeps(
      first,
      {
        Toast:
          second,
      }
    );

  const {
    AppCore,
    Toast,
  } = deps;

  if (
    !AppCore ||
    !Toast
  ) {
    return false;
  }

  if (
    toastBridgeBound ||
    safeBool(AppCore.__toastBridgeBound)
  ) {
    return true;
  }

  const bridge =
    createToastBridge(
      AppCore,
      Toast
    );

  const attached =
    attachToastBridge(
      AppCore,
      bridge
    );

  if (!attached) {
    safeWarn(
      AppCore,
      "Toast bridge no pudo montarse: objeto no extensible."
    );

    return false;
  }

  toastBridgeBound =
    true;

  if (isExtensibleObject(AppCore)) {
    safeDefineValue(
      AppCore,
      "__toastBridgeBound",
      true
    );
  }

  safeEmit(
    AppCore,
    UI_EVENTS.toastBridgeReady,
    {
      at:
        safeIsoDate(),
    }
  );

  safeLog(
    AppCore,
    "Toast bridge activo."
  );

  return true;
}

/* =========================================================
   UI REPAIR
========================================================= */

export function repairUISystems(first = {}, second = {}) {
  const deps =
    normalizeDeps(
      first,
      second
    );

  const {
    AppCore,
    reason = "repair-ui",
    rebind = false,
    hardRepair = false,
  } = deps;

  uiState.repairCount += 1;

  /*
    Cambio clave:
    Antes esto hacía syncUserUI(..., rebind:true).
    Eso provocaba:
      app/ui repair -> SidebarUI.rebind -> bindCoreEvents -> core events bound
    repetido en cada router/auth/lang event.
  */
  const ok =
    syncUserUI({
      ...deps,
      reason,
      rebind:
        rebind === true,
      hardRepair:
        hardRepair === true,
    });

  safeEmit(
    AppCore,
    UI_EVENTS.repair,
    {
      reason:
        safeText(reason, "repair-ui"),
      ok,
      rebind:
        rebind === true,
      hardRepair:
        hardRepair === true,
      at:
        safeIsoDate(),
    }
  );

  return ok;
}

/* =========================================================
   INIT
========================================================= */

export function initUISystems(first = {}) {
  const deps =
    normalizeDeps(first);

  const {
    AppCore,
    Toast,
    SidebarUI,
    TopbarUI,
    state,
    scope = DEFAULT_SCOPE,
    force = false,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (initInFlight) {
    return false;
  }

  if (
    !force &&
    (
      uiInitialized ||
      state?.uiInitialized ||
      AppCore?.state?.uiInitialized
    )
  ) {
    safeLog(
      AppCore,
      "UISystems ya inicializados."
    );

    syncUserUI({
      ...deps,
      reason:
        "init-ui-already-initialized",
      rebind:
        false,
      hardRepair:
        false,
    });

    return true;
  }

  initInFlight =
    true;

  const startedAt =
    Date.now();

  safeEmit(
    AppCore,
    UI_EVENTS.initStart,
    {
      scope,
      at:
        safeIsoDate(startedAt),
    }
  );

  try {
    registerAppModule(
      AppCore,
      UI_MODULES.toast,
      Toast
    );

    registerAppModule(
      AppCore,
      UI_MODULES.sidebar,
      SidebarUI
    );

    registerAppModule(
      AppCore,
      UI_MODULES.topbar,
      TopbarUI
    );

    uiState.modules.toast =
      Boolean(Toast);

    uiState.modules.sidebar =
      Boolean(SidebarUI);

    uiState.modules.topbar =
      Boolean(TopbarUI);

    safeInitModule(
      AppCore,
      Toast,
      "Toast",
      {
        ...deps,
        reason:
          "init-ui:toast",
      }
    );

    bindToastBridge({
      AppCore,
      Toast,
    });

    /*
      SidebarUI.init() debe ocurrir solo una vez.
      El propio SidebarUI es dueño de sus binds internos iniciales.
    */
    safeInitModule(
      AppCore,
      SidebarUI,
      "SidebarUI",
      {
        ...deps,
        reason:
          "init-ui:sidebar",
      }
    );

    /*
      TopbarUI.init() debe ocurrir solo una vez.
    */
    safeInitModule(
      AppCore,
      TopbarUI,
      "TopbarUI",
      {
        ...deps,
        reason:
          "init-ui:topbar",
      }
    );

    bindAppLanguageSync({
      ...deps,
      scope,
    });

    /*
      Cambio clave:
      No rebind después de init.
      init ya bindeó.
      Aquí solo sincronizamos datos de usuario/rol/ruta.
    */
    syncUserUI({
      ...deps,
      reason:
        "init-ui",
      rebind:
        false,
      hardRepair:
        false,
    });

    uiInitialized =
      true;

    uiState.initialized =
      true;

    uiState.initCount += 1;

    uiState.lastInitAt =
      Date.now();

    uiState.lastInitOk =
      true;

    if (state) {
      state.uiInitialized =
        true;
    }

    try {
      AppCore?.setState?.({
        uiInitialized:
          true,
      });
    } catch {}

    try {
      if (
        AppCore?.state &&
        typeof AppCore.state === "object"
      ) {
        AppCore.state.uiInitialized =
          true;
      }
    } catch {}

    const payload = {
      ok:
        true,

      scope,

      durationMs:
        Date.now() - startedAt,

      modules:
        {
          ...uiState.modules,
        },

      at:
        safeIsoDate(),
    };

    safeEmit(
      AppCore,
      UI_EVENTS.initSuccess,
      payload
    );

    safeEmit(
      AppCore,
      UI_EVENTS.ready,
      payload
    );

    safeLog(
      AppCore,
      "UISystems listos.",
      payload
    );

    return true;
  } catch (error) {
    uiState.lastInitOk =
      false;

    setLastError(
      AppCore,
      "initUISystems",
      error
    );

    safeError(
      AppCore,
      "initUISystems() fatal:",
      error
    );

    safeEmit(
      AppCore,
      UI_EVENTS.initError,
      {
        message:
          safeText(
            error?.message || error,
            "initUISystems() fatal."
          ),
        at:
          safeIsoDate(),
      }
    );

    return false;
  } finally {
    initInFlight =
      false;
  }
}

/* =========================================================
   UNBIND / DEBUG
========================================================= */

export function unbindUISystems(AppCore = null) {
  for (const dispose of boundDisposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

  languageSyncBound =
    false;

  if (AppCore && isExtensibleObject(AppCore)) {
    safeDefineValue(
      AppCore,
      "__appLangUiBound",
      false
    );
  }

  safeLog(
    AppCore,
    "UISystems listeners desactivados."
  );

  return true;
}

export function getUISystemsSnapshot(first = {}, second = {}) {
  const {
    AppCore,
    Auth,
    SidebarUI,
    TopbarUI,
    Toast,
  } = normalizeDeps(
    first,
    second
  );

  return {
    initialized:
      Boolean(
        uiInitialized ||
        uiState.initialized ||
        AppCore?.state?.uiInitialized
      ),

    initInFlight:
      Boolean(initInFlight),

    syncingUserUI:
      Boolean(syncingUserUI),

    syncQueued:
      Boolean(syncQueued),

    languageSyncBound:
      Boolean(languageSyncBound),

    toastBridgeBound:
      Boolean(toastBridgeBound),

    modules:
      {
        toast:
          Boolean(Toast),
        sidebar:
          Boolean(SidebarUI),
        topbar:
          Boolean(TopbarUI),
      },

    moduleInit:
      {
        toast:
          Toast
            ? wasModuleInitialized(Toast)
            : false,

        sidebar:
          SidebarUI
            ? wasModuleInitialized(SidebarUI)
            : false,

        topbar:
          TopbarUI
            ? wasModuleInitialized(TopbarUI)
            : false,
      },

    user:
      AppCore
        ? getUserSnapshot(
            AppCore,
            Auth
          )
        : null,

    initCount:
      uiState.initCount,

    syncCount:
      uiState.syncCount,

    repairCount:
      uiState.repairCount,

    lastSyncAt:
      uiState.lastSyncAt,

    lastSyncAtIso:
      uiState.lastSyncAt
        ? safeIsoDate(uiState.lastSyncAt)
        : "",

    lastSyncReason:
      uiState.lastSyncReason,

    lastInitAt:
      uiState.lastInitAt,

    lastInitAtIso:
      uiState.lastInitAt
        ? safeIsoDate(uiState.lastInitAt)
        : "",

    lastInitOk:
      Boolean(uiState.lastInitOk),

    lastError:
      uiState.lastError,
  };
}

export function resetUIRuntimeState() {
  syncingUserUI =
    false;

  syncQueued =
    false;

  initInFlight =
    false;

  uiInitialized =
    false;

  languageSyncBound =
    false;

  toastBridgeBound =
    false;

  moduleInitState =
    new WeakMap();

  uiState.initialized =
    false;

  uiState.initCount =
    0;

  uiState.syncCount =
    0;

  uiState.repairCount =
    0;

  uiState.lastSyncAt =
    0;

  uiState.lastSyncReason =
    "";

  uiState.lastInitAt =
    0;

  uiState.lastInitOk =
    false;

  uiState.lastError =
    null;

  uiState.modules =
    {
      toast:
        false,

      sidebar:
        false,

      topbar:
        false,
    };

  return getUISystemsSnapshot();
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  syncUserUI,

  bindAppLanguageSync,
  bindToastBridge,

  repairUISystems,
  initUISystems,
  unbindUISystems,

  getUISystemsSnapshot,
  resetUIRuntimeState,
};
