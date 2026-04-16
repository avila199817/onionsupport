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
========================================================= */

/* =========================================================
   INTERNAL STATE
========================================================= */

let syncingUserUI = false;

/* =========================================================
   HELPERS
========================================================= */

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(...args);
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(...args);
  } catch {
    console.error(...args);
  }
}

function safeEmit(
  AppCore,
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function safeBool(value) {
  return value === true;
}

function safeText(
  value,
  fallback = ""
) {
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

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function isExtensibleObject(value) {
  try {
    return (
      isObject(value) &&
      Object.isExtensible(value)
    );
  } catch {
    return false;
  }
}

function safeDefineValue(
  target,
  key,
  value
) {
  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        configurable: true,
        enumerable: false,
        writable: true,
      }
    );

    return true;
  } catch {
    return false;
  }
}

function getUserSnapshot(AppCore) {
  const state =
    AppCore?.state || {};

  const user =
    state.user || null;

  return {
    user,

    authenticated:
      Boolean(
        state.authenticated
      ),

    role:
      state.role ||
      user?.role ||
      null,

    username:
      user?.username ||
      user?.email ||
      user?.name ||
      null,
  };
}

/* =========================================================
   MODULE REGISTRY
========================================================= */

function registerAppModule(
  AppCore,
  name,
  moduleRef
) {
  if (
    !AppCore?.modules ||
    !name ||
    !moduleRef
  ) {
    return false;
  }

  try {
    if (
      isFunction(
        AppCore.modules.has
      ) &&
      AppCore.modules.has(name)
    ) {
      return true;
    }

    if (
      isFunction(
        AppCore.modules.register
      )
    ) {
      AppCore.modules.register(
        name,
        moduleRef
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "registerAppModule() error:",
      name,
      error
    );
  }

  return false;
}

/* =========================================================
   SAFE MODULE INIT
========================================================= */

function safeInitModule(
  AppCore,
  moduleRef,
  label = "module"
) {
  if (
    !moduleRef ||
    !isFunction(
      moduleRef.init
    )
  ) {
    return false;
  }

  try {
    moduleRef.init();

    safeLog(
      AppCore,
      `${label} inicializado.`
    );

    return true;
  } catch (error) {
    safeError(
      AppCore,
      `Error init ${label}:`,
      error
    );

    return false;
  }
}

/* =========================================================
   USER UI
========================================================= */

export function syncUserUI(
  AppCore
) {
  if (!AppCore) {
    return false;
  }

  if (syncingUserUI) {
    return false;
  }

  syncingUserUI = true;

  try {
    if (
      isFunction(
        AppCore.syncUserUI
      )
    ) {
      AppCore.syncUserUI();
    }

    const snapshot =
      getUserSnapshot(
        AppCore
      );

    safeEmit(
      AppCore,
      "app:user-ui:sync",
      snapshot
    );

    safeLog(
      AppCore,
      "UI usuario sincronizada.",
      {
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
    safeError(
      AppCore,
      "syncUserUI() error:",
      error
    );

    return false;
  } finally {
    syncingUserUI = false;
  }
}

/* =========================================================
   LANGUAGE BIND
========================================================= */

export function bindAppLanguageSync(
  AppCore
) {
  if (
    !AppCore?.events ||
    !isFunction(
      AppCore.events.on
    )
  ) {
    return false;
  }

  if (
    safeBool(
      AppCore.__appLangUiBound
    )
  ) {
    return true;
  }

  try {
    AppCore.events.on(
      "app:lang:change",
      () => {
        syncUserUI(
          AppCore
        );

        try {
          const title =
            document?.title || "";

          if (
            AppCore?.dom
              ?.topbarTitle
          ) {
            AppCore.dom.topbarTitle.textContent =
              title;
          }
        } catch {}
      }
    );

    if (
      isExtensibleObject(
        AppCore
      )
    ) {
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
  } catch (error) {
    safeWarn(
      AppCore,
      "bindAppLanguageSync() error:",
      error
    );

    return false;
  }
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

function resolveToastMethod(
  Toast,
  type = "info"
) {
  const normalized =
    safeText(
      type,
      "info"
    ).toLowerCase();

  switch (normalized) {
    case "success":
      return Toast?.success;

    case "error":
      return Toast?.error;

    case "warning":
      return Toast?.warning;

    case "loading":
      return Toast?.loading;

    case "info":
    default:
      return Toast?.info;
  }
}

function createToastBridge(
  AppCore,
  Toast
) {
  return function showToast(
    message = "",
    type = "info",
    options = {}
  ) {
    try {
      const method =
        resolveToastMethod(
          Toast,
          type
        );

      if (
        isFunction(
          method
        )
      ) {
        return method(
          message,
          options
        );
      }

      if (
        isFunction(
          Toast?.show
        )
      ) {
        return Toast.show({
          ...options,
          type,
          message,
        });
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

function bindToastBridge(
  AppCore,
  Toast
) {
  if (
    !AppCore ||
    !Toast
  ) {
    return false;
  }

  if (
    safeBool(
      AppCore.__toastBridgeBound
    )
  ) {
    return true;
  }

  const bridge =
    createToastBridge(
      AppCore,
      Toast
    );

  let attached =
    false;

  /* prioridad: método nativo */
  try {
    if (
      isFunction(
        AppCore?.setShowToast
      )
    ) {
      AppCore.setShowToast(
        bridge
      );

      attached = true;
    }
  } catch {}

  /* attach directo seguro */
  if (
    !attached &&
    isExtensibleObject(
      AppCore
    )
  ) {
    attached =
      safeDefineValue(
        AppCore,
        "showToast",
        bridge
      );
  }

  /* fallback dentro de utils */
  if (
    !attached &&
    isExtensibleObject(
      AppCore?.utils
    )
  ) {
    attached =
      safeDefineValue(
        AppCore.utils,
        "showToast",
        bridge
      );
  }

  if (!attached) {
    safeWarn(
      AppCore,
      "Toast bridge no pudo montarse: objeto no extensible."
    );

    return false;
  }

  if (
    isExtensibleObject(
      AppCore
    )
  ) {
    safeDefineValue(
      AppCore,
      "__toastBridgeBound",
      true
    );
  }

  safeLog(
    AppCore,
    "Toast bridge activo."
  );

  return true;
}

/* =========================================================
   INIT
========================================================= */

export function initUISystems({
  AppCore,
  Toast,
  SidebarUI,
  TopbarUI,
  state,
} = {}) {
  if (!AppCore) {
    return false;
  }

  if (
    state?.uiInitialized
  ) {
    safeLog(
      AppCore,
      "UISystems ya inicializados."
    );

    return true;
  }

  safeEmit(
    AppCore,
    "app:ui:init:start"
  );

  try {
    registerAppModule(
      AppCore,
      "toast",
      Toast
    );

    registerAppModule(
      AppCore,
      "sidebar",
      SidebarUI
    );

    registerAppModule(
      AppCore,
      "topbar",
      TopbarUI
    );

    safeInitModule(
      AppCore,
      Toast,
      "Toast"
    );

    bindToastBridge(
      AppCore,
      Toast
    );

    safeInitModule(
      AppCore,
      SidebarUI,
      "SidebarUI"
    );

    safeInitModule(
      AppCore,
      TopbarUI,
      "TopbarUI"
    );

    bindAppLanguageSync(
      AppCore
    );

    syncUserUI(
      AppCore
    );

    if (state) {
      state.uiInitialized =
        true;
    }

    safeEmit(
      AppCore,
      "app:ui:init:success"
    );

    safeLog(
      AppCore,
      "UISystems listos."
    );

    return true;
  } catch (error) {
    safeError(
      AppCore,
      "initUISystems() fatal:",
      error
    );

    safeEmit(
      AppCore,
      "app:ui:init:error",
      {
        error,
      }
    );

    return false;
  }
}

export default {
  syncUserUI,
  bindAppLanguageSync,
  initUISystems,
};
