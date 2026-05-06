/* =========================================================
   Onion SPA - App UI Systems
   Archivo: src/app/ui.js

   ONION SUPPORT · APP UI SYSTEMS
   SIDEBAR/TOPBAR/TOAST · LIGHT SYNC · NO EVENT STORM · EXTREME 12/10

   RESPONSABILIDADES:
   - Sincronizar UI usuario global.
   - Inicializar sistemas UI compartidos una sola vez.
   - Registrar módulos UI en AppCore sin duplicados.
   - Refresco UI ante cambio de idioma.
   - Bridge global Toast robusto.
   - Escuchar repair request ligero sin loops.
   - Exponer snapshots de diagnóstico.
   - Evitar tormentas de eventos y rebinds.

   REGLA DE ORO:
   - initUISystems() puede llamar init()/boot()/mount()/start() una vez.
   - syncUserUI() solo sincroniza datos/rol/ruta.
   - repairUISystems() por defecto solo hace sync ligero.
   - rebind/hardRepair solo si se pasa explícitamente.
   - AppUI sí puede emitir app:user-ui:sync.
   - AppUI NO debe emitir app:ui:repair-request desde repairUISystems().
   - AppUI NO debe escuchar app:user-ui:sync.
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

const UI_VERSION =
  "12.0.0";

const UI_SOURCE =
  "app:ui";

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

    repairDone:
      "app:ui:repair:done",

    repairSkipped:
      "app:ui:repair:skipped",

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

    runtimeEventsBound:
      "app:ui:runtime-events:bound",

    runtimeEventsUnbound:
      "app:ui:runtime-events:unbound",
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

/*
  Métodos ligeros permitidos.
  No incluir aquí:
  - repair
  - render
  - rebind
  - bindEvents
  - bind
*/
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

const SYNC_QUEUE_DELAY_MS =
  0;

const SYNC_DEDUPE_MS =
  80;

const REPAIR_REQUEST_DEDUPE_MS =
  140;

const LANG_SYNC_DEDUPE_MS =
  120;

/* =========================================================
   INTERNAL STATE
========================================================= */

let syncingUserUI =
  false;

let syncQueued =
  false;

let initInFlight =
  false;

let uiInitialized =
  false;

let languageSyncBound =
  false;

let repairSyncBound =
  false;

let toastBridgeBound =
  false;

let runtimeEventsBound =
  false;

let moduleInitState =
  new WeakMap();

let lastSyncSignature =
  "";

let lastSyncSignatureAt =
  0;

let lastRepairSignature =
  "";

let lastRepairSignatureAt =
  0;

let lastLangSignature =
  "";

let lastLangSignatureAt =
  0;

const boundDisposers =
  [];

const uiState = {
  initialized:
    false,

  initCount:
    0,

  syncCount:
    0,

  repairCount:
    0,

  repairRequestCount:
    0,

  skippedRepairCount:
    0,

  lastSyncAt:
    0,

  lastSyncReason:
    "",

  lastRepairAt:
    0,

  lastRepairReason:
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
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isObjectLike(value) {
  return (
    value !== null &&
    (
      typeof value === "object" ||
      typeof value === "function"
    )
  );
}

function isWeakMapKey(value) {
  return isObjectLike(value);
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

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
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
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeSetTimeout(callback, ms = 0) {
  if (!isFunction(callback)) {
    return null;
  }

  try {
    return setTimeout(() => {
      try {
        callback();
      } catch {}
    }, Math.max(0, Number(ms) || 0));
  } catch {
    try {
      callback();
    } catch {}

    return null;
  }
}

function isExtensibleTarget(value) {
  try {
    return (
      isObjectLike(value) &&
      Object.isExtensible(value)
    );
  } catch {}

  return false;
}

function safeDefineValue(target, key, value) {
  if (
    !isExtensibleTarget(target) ||
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

  try {
    target[key] = value;
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
      "I18n" in first ||
      "Router" in first ||
      "Store" in first
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
  const raw =
    eventOrPayload || {};

  if (
    raw &&
    typeof raw === "object" &&
    "detail" in raw &&
    raw.detail !== undefined
  ) {
    return ensureObject(raw.detail);
  }

  if (
    raw &&
    typeof raw === "object" &&
    "payload" in raw &&
    raw.payload !== undefined
  ) {
    return ensureObject(raw.payload);
  }

  return ensureObject(raw);
}

function getSafeState(AppCore) {
  return ensureObject(AppCore?.state);
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

    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.log(
        "[AppUI]",
        ...args
      );
    }
  } catch {}
}

function safeWarn(AppCore, ...args) {
  let emittedByCore =
    false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[AppUI]",
        ...args
      );

      emittedByCore =
        true;
    }
  } catch {
    emittedByCore =
      false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.warn(
      "[AppUI]",
      ...args
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  let emittedByCore =
    false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error(
        "[AppUI]",
        ...args
      );

      emittedByCore =
        true;
    }
  } catch {
    emittedByCore =
      false;
  }

  if (emittedByCore) {
    return;
  }

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
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    ensureObject(options);

  const finalPayload = {
    source:
      UI_SOURCE,

    ...ensureObject(payload),
  };

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        name,
        finalPayload
      );

      busEmitted =
        true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló.`,
      error
    );
  }

  /*
    Anti-event-storm:
    Si existe AppCore.events, NO duplicamos por window salvo petición explícita.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return (
      safeWindowDispatch(
        name,
        finalPayload
      ) ||
      busEmitted
    );
  }

  return busEmitted;
}

function normalizeError(error = null, fallback = "Error UI.") {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return {
      name:
        "UIError",

      message:
        error,

      code:
        "UI_ERROR",
    };
  }

  const object =
    ensureObject(error);

  const payload = {
    name:
      safeText(
        object.name,
        "UIError"
      ),

    message:
      safeText(
        object.message || error,
        fallback
      ),

    code:
      safeText(
        object.code ||
        object.status ||
        object.statusCode,
        "UI_ERROR"
      ),
  };

  if (object.stack) {
    payload.stack =
      safeText(
        object.stack,
        ""
      );
  }

  return payload;
}

function setLastError(AppCore, source = "ui", error = null) {
  const snapshot = {
    source:
      safeText(source, "ui"),

    error:
      normalizeError(error),

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

function getRouterPublicPath(Router) {
  try {
    return (
      Router?.getCurrentPublicPath?.() ||
      Router?.getCurrentPath?.() ||
      ""
    );
  } catch {}

  return "";
}

function getRouterCanonicalPath(Router) {
  try {
    return (
      Router?.getCurrentCanonicalPath?.() ||
      ""
    );
  } catch {}

  return "";
}

function getUserId(user = null) {
  return (
    safeText(user?.id, "") ||
    safeText(user?.userId, "") ||
    safeText(user?.user_id, "") ||
    safeText(user?._id, "") ||
    safeText(user?.uid, "") ||
    ""
  );
}

function getUserSnapshot(AppCore, Auth = null, Router = null) {
  const state =
    getSafeState(AppCore);

  const session =
    ensureObject(state.session);

  const user =
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    session.user ||
    getAuthUser(Auth) ||
    null;

  const role =
    state.role ||
    state.rol ||
    state.userRole ||
    session.role ||
    session.rol ||
    session.userRole ||
    user?.role ||
    user?.rol ||
    user?.userRole ||
    user?.user_role ||
    getAuthRole(Auth) ||
    null;

  const username =
    user?.username ||
    user?.userName ||
    user?.slug ||
    user?.email ||
    user?.name ||
    user?.displayName ||
    state.username ||
    null;

  const displayName =
    user?.displayName ||
    user?.name ||
    user?.fullName ||
    user?.username ||
    user?.userName ||
    user?.email ||
    null;

  const avatarUrl =
    user?.avatarUrl ||
    user?.avatarURL ||
    user?.avatar ||
    user?.photoURL ||
    user?.picture ||
    user?.image ||
    null;

  const route =
    state.route ||
    state.canonicalPath ||
    getRouterCanonicalPath(Router) ||
    "/";

  const publicPath =
    state.publicPath ||
    getRouterPublicPath(Router) ||
    route ||
    "/";

  return {
    user,

    userId:
      getUserId(user),

    authenticated:
      Boolean(
        state.authenticated ||
        state.isAuthenticated ||
        getAuthStatus(Auth)
      ),

    role,
    username,
    displayName,
    avatarUrl,

    lang:
      state.lang ||
      null,

    theme:
      state.theme ||
      null,

    route,
    publicPath,
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

  let registered =
    false;

  try {
    registerModule(
      AppCore,
      cleanName,
      moduleRef
    );

    registered =
      true;
  } catch {}

  try {
    const modules =
      AppCore.modules;

    if (modules) {
      if (
        isFunction(modules.has) &&
        modules.has(cleanName)
      ) {
        registered =
          true;
      } else if (isFunction(modules.register)) {
        modules.register(
          cleanName,
          moduleRef
        );

        registered =
          true;
      } else if (isFunction(modules.set)) {
        modules.set(
          cleanName,
          moduleRef
        );

        registered =
          true;
      } else if (isExtensibleTarget(modules)) {
        modules[cleanName] =
          moduleRef;

        registered =
          true;
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
    if (isExtensibleTarget(AppCore)) {
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

      registered =
        true;
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

    if (
      isWeakMapKey(moduleRef) &&
      moduleInitState.get(moduleRef)
    ) {
      return true;
    }

    if (moduleRef.__appUiInitialized === true) {
      return true;
    }

    if (moduleRef.initialized === true) {
      return true;
    }

    if (moduleRef.ready === true && moduleRef.mounted === true) {
      return true;
    }

    return false;
  } catch {}

  return false;
}

function markModuleInitialized(moduleRef, value = true) {
  try {
    if (
      moduleRef &&
      isWeakMapKey(moduleRef)
    ) {
      moduleInitState.set(
        moduleRef,
        Boolean(value)
      );
    }
  } catch {}

  try {
    if (
      moduleRef &&
      isExtensibleTarget(moduleRef)
    ) {
      safeDefineValue(
        moduleRef,
        "__appUiInitialized",
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

  const ctx =
    ensureObject(context);

  const reason =
    safeText(
      ctx.reason,
      methodName
    );

  /*
    Orden compatible para métodos de sync:
    - method(reason, context)
    - method(context)
    - method(AppCore, context)
    - method()
  */
  try {
    fn.call(
      moduleRef,
      reason,
      ctx
    );

    return true;
  } catch {}

  try {
    fn.call(
      moduleRef,
      ctx
    );

    return true;
  } catch {}

  try {
    fn.call(
      moduleRef,
      ctx.AppCore,
      ctx
    );

    return true;
  } catch {}

  try {
    fn.call(moduleRef);

    return true;
  } catch {}

  return false;
}

function callModuleInitMethod(moduleRef, methodName, context = {}) {
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

  const ctx =
    ensureObject(context);

  const reason =
    safeText(
      ctx.reason,
      methodName
    );

  /*
    Init suele esperar contexto antes que reason.
  */
  try {
    fn.call(
      moduleRef,
      ctx
    );

    return true;
  } catch {}

  try {
    fn.call(
      moduleRef,
      ctx.AppCore,
      ctx
    );

    return true;
  } catch {}

  try {
    fn.call(
      moduleRef,
      reason,
      ctx
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
  const called =
    [];

  const failed =
    [];

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

  const ctx =
    ensureObject(context);

  if (
    ctx.force !== true &&
    wasModuleInitialized(moduleRef)
  ) {
    return true;
  }

  let initializedModule =
    false;

  const fullContext = {
    ...ctx,
    AppCore,
    label,
    reason:
      ctx.reason || `${label}:init`,
  };

  for (const methodName of UI_INIT_METHODS) {
    try {
      if (
        callModuleInitMethod(
          moduleRef,
          methodName,
          fullContext
        )
      ) {
        initializedModule =
          true;

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

  /*
    Si no expone init/boot/mount/start pero existe como módulo, queda registrado.
  */
  if (!initializedModule) {
    const hasAnyInitMethod =
      UI_INIT_METHODS.some((methodName) =>
        isFunction(moduleRef?.[methodName])
      );

    if (!hasAnyInitMethod) {
      initializedModule =
        true;
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
    Fallback solo si no hay métodos ligeros.
    No llamamos repair/rebind/bind.
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

function getSyncSignature(snapshot = {}, reason = "") {
  const data = {
    reason:
      safeText(reason, ""),

    authenticated:
      Boolean(snapshot.authenticated),

    userId:
      safeText(snapshot.userId, ""),

    username:
      safeText(snapshot.username, ""),

    displayName:
      safeText(snapshot.displayName, ""),

    avatarUrl:
      safeText(snapshot.avatarUrl, ""),

    role:
      safeText(snapshot.role, ""),

    lang:
      safeText(snapshot.lang, ""),

    theme:
      safeText(snapshot.theme, ""),

    route:
      safeText(snapshot.route, ""),

    publicPath:
      safeText(snapshot.publicPath, ""),
  };

  try {
    return JSON.stringify(data);
  } catch {
    return String(safeNow());
  }
}

function shouldDedupeSync(snapshot = {}, reason = "", force = false) {
  if (force === true) {
    return false;
  }

  const signature =
    getSyncSignature(
      snapshot,
      reason
    );

  const now =
    safeNow();

  if (
    signature === lastSyncSignature &&
    now - lastSyncSignatureAt < SYNC_DEDUPE_MS
  ) {
    return true;
  }

  lastSyncSignature =
    signature;

  lastSyncSignatureAt =
    now;

  return false;
}

export function syncUserUI(first = {}, second = {}) {
  const deps =
    normalizeDeps(first, second);

  const {
    AppCore,
    Auth,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    Router,
    Store,

    reason = "sync-user-ui",
    payload = {},

    rebind = false,
    hardRepair = false,
    force = false,
  } = deps;

  if (!AppCore) {
    return false;
  }

  const cleanReason =
    safeText(
      reason,
      "sync-user-ui"
    );

  const snapshot =
    getUserSnapshot(
      AppCore,
      Auth,
      Router
    );

  if (
    shouldDedupeSync(
      snapshot,
      cleanReason,
      force
    )
  ) {
    return true;
  }

  if (syncingUserUI) {
    syncQueued =
      true;

    return false;
  }

  syncingUserUI =
    true;

  const startedAt =
    safeNow();

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
    const context = {
      AppCore,
      Auth,
      Router,
      Store,
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

      userId:
        snapshot.userId,

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

      theme:
        snapshot.theme,

      route:
        snapshot.route,

      publicPath:
        snapshot.publicPath,
    };

    let ok =
      false;

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

    uiState.syncCount +=
      1;

    uiState.lastSyncAt =
      safeNow();

    uiState.lastSyncReason =
      context.reason;

    /*
      Este evento lo emite AppUI. Router no debe escucharlo.
    */
    safeEmit(
      AppCore,
      UI_EVENTS.userSync,
      {
        reason:
          context.reason,

        user:
          snapshot.user,

        userId:
          snapshot.userId,

        authenticated:
          snapshot.authenticated,

        username:
          snapshot.username,

        displayName:
          snapshot.displayName,

        avatarUrl:
          snapshot.avatarUrl,

        role:
          snapshot.role,

        lang:
          snapshot.lang,

        theme:
          snapshot.theme,

        route:
          snapshot.route,

        publicPath:
          snapshot.publicPath,
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
          safeNow() - startedAt,

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

        hardRepair:
          Boolean(hardRepair),

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

        hardRepair:
          Boolean(hardRepair),
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
    syncingUserUI =
      false;

    if (syncQueued) {
      syncQueued =
        false;

      safeSetTimeout(() => {
        syncUserUI({
          ...deps,

          reason:
            `${cleanReason}:queued`,

          rebind:
            false,

          hardRepair:
            false,

          force:
            true,
        });
      }, SYNC_QUEUE_DELAY_MS);
    }
  }
}

/* =========================================================
   EVENT BINDING
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

  /*
    Bus interno primero. Window solo si no hay bus.
    No duplicar bus + window.
  */
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
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.on("${eventName}") falló.`,
      error
    );
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    if (isFunction(AppCore?.cleanup?.event)) {
      const off =
        AppCore.cleanup.event(
          scope,
          window,
          eventName,
          handler
        );

      if (isFunction(off)) {
        rememberDisposer(off);
      }

      return true;
    }
  } catch {}

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

  return false;
}

/* =========================================================
   LANGUAGE BIND
========================================================= */

function getLangSignature(detail = {}) {
  return [
    safeText(detail.lang, ""),
    safeText(detail.language, ""),
    safeText(detail.locale, ""),
  ].join("|");
}

function shouldDedupeLang(detail = {}) {
  const signature =
    getLangSignature(detail);

  const now =
    safeNow();

  if (
    signature &&
    signature === lastLangSignature &&
    now - lastLangSignatureAt < LANG_SYNC_DEDUPE_MS
  ) {
    return true;
  }

  lastLangSignature =
    signature;

  lastLangSignatureAt =
    now;

  return false;
}

export function bindAppLanguageSync(first = {}, second = {}) {
  const deps =
    normalizeDeps(first, second);

  const {
    AppCore,
    Auth,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    Router,
    Store,
    scope = DEFAULT_SCOPE,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (
    languageSyncBound ||
    safeBoolean(AppCore.__appLangUiBound)
  ) {
    return true;
  }

  const handler = (eventOrPayload = {}) => {
    const detail =
      getPayload(eventOrPayload);

    if (
      shouldDedupeLang(detail)
    ) {
      return;
    }

    /*
      Cambio de idioma:
      sync ligero. No rebind. No repair duro.
    */
    syncUserUI({
      AppCore,
      Auth,
      Router,
      Store,
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

      force:
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

  safeDefineValue(
    AppCore,
    "__appLangUiBound",
    true
  );

  safeLog(
    AppCore,
    "Language UI sync activo."
  );

  return true;
}

/* =========================================================
   REPAIR REQUEST BIND
========================================================= */

function getRepairSignature(detail = {}) {
  return [
    safeText(detail.source, ""),
    safeText(detail.reason || detail.phase, ""),
    safeText(detail.route || detail.canonicalPath, ""),
    safeText(detail.publicPath, ""),
    detail.rebind === true ? "rebind" : "no-rebind",
    detail.hardRepair === true ? "hard" : "light",
  ].join("|");
}

function shouldSkipRepairRequest(detail = {}) {
  const source =
    safeText(detail.source, "");

  /*
    AppUI no escucha sus propios eventos.
    No escucha userSync.
  */
  if (
    source === UI_SOURCE ||
    source === "app:user-ui:sync"
  ) {
    return true;
  }

  const signature =
    getRepairSignature(detail);

  const now =
    safeNow();

  if (
    signature === lastRepairSignature &&
    now - lastRepairSignatureAt < REPAIR_REQUEST_DEDUPE_MS
  ) {
    return true;
  }

  lastRepairSignature =
    signature;

  lastRepairSignatureAt =
    now;

  return false;
}

export function bindUIRepairSync(first = {}, second = {}) {
  const deps =
    normalizeDeps(first, second);

  const {
    AppCore,
    scope = DEFAULT_SCOPE,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (
    repairSyncBound ||
    safeBoolean(AppCore.__appUiRepairBound)
  ) {
    return true;
  }

  const handler = (eventOrPayload = {}) => {
    const detail =
      getPayload(eventOrPayload);

    uiState.repairRequestCount +=
      1;

    if (
      shouldSkipRepairRequest(detail)
    ) {
      uiState.skippedRepairCount +=
        1;

      safeEmit(
        AppCore,
        UI_EVENTS.repairSkipped,
        {
          reason:
            detail.reason ||
            detail.phase ||
            "repair-request-deduped",

          detail:
            {
              source:
                detail.source || null,

              route:
                detail.route || detail.canonicalPath || null,

              publicPath:
                detail.publicPath || null,
            },
        }
      );

      return;
    }

    repairUISystems({
      ...deps,

      reason:
        detail.reason ||
        detail.phase ||
        "app:ui:repair-request",

      payload:
        detail,

      rebind:
        detail.rebind === true,

      hardRepair:
        detail.hardRepair === true,

      force:
        detail.force === true,
    });
  };

  const bound =
    bindEvent(
      AppCore,
      scope,
      UI_EVENTS.repairRequest,
      handler
    );

  if (!bound) {
    return false;
  }

  repairSyncBound =
    true;

  safeDefineValue(
    AppCore,
    "__appUiRepairBound",
    true
  );

  safeLog(
    AppCore,
    "UI repair sync activo."
  );

  return true;
}

export function bindUIRuntimeEvents(first = {}, second = {}) {
  const deps =
    normalizeDeps(first, second);

  const {
    AppCore,
  } = deps;

  if (!AppCore) {
    return false;
  }

  if (
    runtimeEventsBound ||
    safeBoolean(AppCore.__appUiRuntimeEventsBound)
  ) {
    return true;
  }

  const langBound =
    bindAppLanguageSync(deps);

  const repairBound =
    bindUIRepairSync(deps);

  runtimeEventsBound =
    Boolean(
      langBound ||
      repairBound
    );

  safeDefineValue(
    AppCore,
    "__appUiRuntimeEventsBound",
    runtimeEventsBound
  );

  if (runtimeEventsBound) {
    safeEmit(
      AppCore,
      UI_EVENTS.runtimeEventsBound,
      {
        langBound,
        repairBound,
        at:
          safeIsoDate(),
      }
    );
  }

  return runtimeEventsBound;
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

function normalizeToastType(type = "info") {
  const normalized =
    safeText(type, "info")
      .toLowerCase();

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
  let attached =
    false;

  try {
    if (isFunction(AppCore?.setShowToast)) {
      AppCore.setShowToast(bridge);
      attached = true;
    }
  } catch {}

  if (isExtensibleTarget(AppCore)) {
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

  if (isExtensibleTarget(AppCore?.utils)) {
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
    safeBoolean(AppCore.__toastBridgeBound)
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

  safeDefineValue(
    AppCore,
    "__toastBridgeBound",
    true
  );

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
    normalizeDeps(first, second);

  const {
    AppCore,
    reason = "repair-ui",
    rebind = false,
    hardRepair = false,
  } = deps;

  uiState.repairCount +=
    1;

  uiState.lastRepairAt =
    safeNow();

  uiState.lastRepairReason =
    safeText(
      reason,
      "repair-ui"
    );

  /*
    Por defecto, reparación ligera:
    - usuario
    - rol
    - visibilidad
    - indicador de ruta
    No rebind.
  */
  const ok =
    syncUserUI({
      ...deps,

      reason,

      rebind:
        rebind === true,

      hardRepair:
        hardRepair === true,

      force:
        true,
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

  safeEmit(
    AppCore,
    UI_EVENTS.repairDone,
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
    return true;
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

      force:
        true,
    });

    return true;
  }

  initInFlight =
    true;

  const startedAt =
    safeNow();

  safeEmit(
    AppCore,
    UI_EVENTS.initStart,
    {
      scope,

      version:
        UI_VERSION,

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

        force,
      }
    );

    bindToastBridge({
      AppCore,
      Toast,
    });

    safeInitModule(
      AppCore,
      SidebarUI,
      "SidebarUI",
      {
        ...deps,

        reason:
          "init-ui:sidebar",

        force,
      }
    );

    safeInitModule(
      AppCore,
      TopbarUI,
      "TopbarUI",
      {
        ...deps,

        reason:
          "init-ui:topbar",

        force,
      }
    );

    bindUIRuntimeEvents({
      ...deps,
      scope,
    });

    /*
      Después de init: sync ligero.
      No rebind.
      No hardRepair.
    */
    syncUserUI({
      ...deps,

      reason:
        "init-ui",

      rebind:
        false,

      hardRepair:
        false,

      force:
        true,
    });

    uiInitialized =
      true;

    uiState.initialized =
      true;

    uiState.initCount +=
      1;

    uiState.lastInitAt =
      safeNow();

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

      version:
        UI_VERSION,

      durationMs:
        safeNow() - startedAt,

      modules: {
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

        error:
          normalizeError(error),

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

  repairSyncBound =
    false;

  runtimeEventsBound =
    false;

  toastBridgeBound =
    false;

  if (AppCore) {
    safeDefineValue(
      AppCore,
      "__appLangUiBound",
      false
    );

    safeDefineValue(
      AppCore,
      "__appUiRepairBound",
      false
    );

    safeDefineValue(
      AppCore,
      "__appUiRuntimeEventsBound",
      false
    );

    safeDefineValue(
      AppCore,
      "__toastBridgeBound",
      false
    );
  }

  safeEmit(
    AppCore,
    UI_EVENTS.runtimeEventsUnbound,
    {
      at:
        safeIsoDate(),
    }
  );

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
    Router,
    SidebarUI,
    TopbarUI,
    Toast,
  } =
    normalizeDeps(first, second);

  return {
    version:
      UI_VERSION,

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

    repairSyncBound:
      Boolean(repairSyncBound),

    runtimeEventsBound:
      Boolean(runtimeEventsBound),

    toastBridgeBound:
      Boolean(toastBridgeBound),

    modules: {
      toast:
        Boolean(Toast),

      sidebar:
        Boolean(SidebarUI),

      topbar:
        Boolean(TopbarUI),
    },

    moduleInit: {
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
            Auth,
            Router
          )
        : null,

    initCount:
      uiState.initCount,

    syncCount:
      uiState.syncCount,

    repairCount:
      uiState.repairCount,

    repairRequestCount:
      uiState.repairRequestCount,

    skippedRepairCount:
      uiState.skippedRepairCount,

    lastSyncAt:
      uiState.lastSyncAt,

    lastSyncAtIso:
      uiState.lastSyncAt
        ? safeIsoDate(uiState.lastSyncAt)
        : "",

    lastSyncReason:
      uiState.lastSyncReason,

    lastRepairAt:
      uiState.lastRepairAt,

    lastRepairAtIso:
      uiState.lastRepairAt
        ? safeIsoDate(uiState.lastRepairAt)
        : "",

    lastRepairReason:
      uiState.lastRepairReason,

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

    dedupe: {
      lastSyncSignature,
      lastSyncSignatureAt,
      lastSyncSignatureAtIso:
        lastSyncSignatureAt
          ? safeIsoDate(lastSyncSignatureAt)
          : "",

      lastRepairSignature,
      lastRepairSignatureAt,
      lastRepairSignatureAtIso:
        lastRepairSignatureAt
          ? safeIsoDate(lastRepairSignatureAt)
          : "",

      lastLangSignature,
      lastLangSignatureAt,
      lastLangSignatureAtIso:
        lastLangSignatureAt
          ? safeIsoDate(lastLangSignatureAt)
          : "",
    },
  };
}

export function resetUIRuntimeState() {
  for (const dispose of boundDisposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

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

  repairSyncBound =
    false;

  runtimeEventsBound =
    false;

  toastBridgeBound =
    false;

  moduleInitState =
    new WeakMap();

  lastSyncSignature =
    "";

  lastSyncSignatureAt =
    0;

  lastRepairSignature =
    "";

  lastRepairSignatureAt =
    0;

  lastLangSignature =
    "";

  lastLangSignatureAt =
    0;

  uiState.initialized =
    false;

  uiState.initCount =
    0;

  uiState.syncCount =
    0;

  uiState.repairCount =
    0;

  uiState.repairRequestCount =
    0;

  uiState.skippedRepairCount =
    0;

  uiState.lastSyncAt =
    0;

  uiState.lastSyncReason =
    "";

  uiState.lastRepairAt =
    0;

  uiState.lastRepairReason =
    "";

  uiState.lastInitAt =
    0;

  uiState.lastInitOk =
    false;

  uiState.lastError =
    null;

  uiState.modules = {
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
  UI_VERSION,

  syncUserUI,

  bindAppLanguageSync,
  bindUIRepairSync,
  bindUIRuntimeEvents,

  bindToastBridge,

  repairUISystems,
  initUISystems,
  unbindUISystems,

  getUISystemsSnapshot,
  resetUIRuntimeState,
};
