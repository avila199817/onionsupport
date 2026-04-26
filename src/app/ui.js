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
   - rebind seguro de SidebarUI / TopbarUI
   - exponer snapshots de diagnóstico

   HARDENING EXTREMO:
   - init idempotente total
   - mounts aislados por módulo
   - tolerancia absoluta a fallos parciales
   - logs seguros enterprise
   - sync user serializada
   - eventos consistentes
   - no duplicar listeners globales
   - no mutar objetos no extensibles
   - descriptors seguros en bridges
   - compatible con firma legacy y firma objeto
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

const UI_SYNC_METHODS =
  Object.freeze([
    "syncUser",
    "refreshUser",
    "updateUser",
    "sync",
    "refresh",
    "repair",
    "render",
  ]);

const UI_REBIND_METHODS =
  Object.freeze([
    "rebind",
    "bindEvents",
    "bind",
  ]);

const UI_INIT_METHODS =
  Object.freeze([
    "init",
    "boot",
    "mount",
    "start",
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

/* =========================================================
   INTERNAL STATE
========================================================= */

let syncingUserUI = false;
let syncQueued = false;
let initInFlight = false;
let uiInitialized = false;
let languageSyncBound = false;
let toastBridgeBound = false;

const boundDisposers = [];

const moduleInitState = new WeakMap();

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

function safeInvoke(fn, thisArg = null, args = []) {
  try {
    if (isFunction(fn)) {
      return fn.apply(
        thisArg,
        safeArray(args)
      );
    }
  } catch {}

  return undefined;
}

function safeMethod(target, methodName, args = []) {
  const object =
    ensureObject(target);

  return safeInvoke(
    object?.[methodName],
    object,
    args
  );
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

  if (
    safeWindowDispatch(
      eventName,
      payload
    )
  ) {
    emitted = true;
  }

  return emitted;
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
    getAuthUser(Auth) ||
    null;

  const role =
    state.role ||
    user?.role ||
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
    return Boolean(
      moduleRef &&
      moduleInitState.get(moduleRef)
    );
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

function callUiMethods(target, methodNames = [], context = {}) {
  let called = false;

  for (const methodName of methodNames) {
    if (
      callModuleMethod(
        target,
        methodName,
        context
      )
    ) {
      called = true;
    }
  }

  return called;
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

  safeEmit(
    AppCore,
    UI_EVENTS.userSyncStart,
    {
      reason,
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
        safeText(reason, "sync-user-ui"),

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

    try {
      if (
        isFunction(AppCore.syncUserUI) &&
        AppCore.syncUserUI !== syncUserUI
      ) {
        AppCore.syncUserUI(context);
        ok = true;
      }
    } catch (error) {
      safeWarn(
        AppCore,
        "AppCore.syncUserUI() falló.",
        error
      );
    }

    if (
      callUiMethods(
        SidebarUI,
        UI_SYNC_METHODS,
        context
      )
    ) {
      ok = true;
    }

    if (
      callUiMethods(
        TopbarUI,
        UI_SYNC_METHODS,
        context
      )
    ) {
      ok = true;
    }

    if (rebind) {
      if (
        callUiMethods(
          SidebarUI,
          UI_REBIND_METHODS,
          context
        )
      ) {
        ok = true;
      }

      if (
        callUiMethods(
          TopbarUI,
          UI_REBIND_METHODS,
          context
        )
      ) {
        ok = true;
      }
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
        reason,
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
            `${safeText(reason, "sync-user-ui")}:queued`,
        });
      }, 0);
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
        AppCore.cleanup.event(
          scope,
          window,
          eventName,
          handler
        );

        return true;
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
      ensureObject(
        eventOrPayload?.detail ||
        eventOrPayload?.payload ||
        eventOrPayload
      );

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
        true,
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
  } = deps;

  uiState.repairCount += 1;

  const ok =
    syncUserUI({
      ...deps,
      reason,
      rebind:
        true,
    });

  safeEmit(
    AppCore,
    UI_EVENTS.repair,
    {
      reason:
        safeText(reason, "repair-ui"),
      ok,
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
      deps
    );

    bindToastBridge({
      AppCore,
      Toast,
    });

    safeInitModule(
      AppCore,
      SidebarUI,
      "SidebarUI",
      deps
    );

    safeInitModule(
      AppCore,
      TopbarUI,
      "TopbarUI",
      deps
    );

    bindAppLanguageSync({
      ...deps,
      scope,
    });

    syncUserUI({
      ...deps,
      reason:
        "init-ui",
      rebind:
        true,
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
