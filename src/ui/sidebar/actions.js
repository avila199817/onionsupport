/* =========================================================
   Onion SPA - Sidebar Actions
   Archivo: src/ui/sidebar/actions.js

   RESPONSABILIDADES:
   - centralizar acciones de negocio del sidebar
   - logout robusto aunque falle el endpoint remoto
   - desactivar controles durante acciones críticas
   - limpiar sesión local con fallback seguro
   - limpiar restos legacy de auth si Auth/AppCore fallan
   - resincronizar UI del sidebar tras logout
   - navegar a /login con replaceState
   - evitar doble logout concurrente
   - cero throws accidentales hacia la UI

   HARDENING EXTREMO:
   - remote logout best-effort
   - local logout obligatorio
   - fallback AppCore.clearSession / Auth.clearSessionLocal / state patch
   - limpieza limitada de storage auth conocido
   - eventos de diagnóstico
   - controles bloqueados durante operación
   - navegación robusta vía Router/AppCore/window fallback
========================================================= */

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

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarActions]", ...args);
  } catch {}

  try {
    console.warn("[SidebarActions]", ...args);
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.("[SidebarActions]", ...args);
  } catch {}

  try {
    console.error("[SidebarActions]", ...args);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

function safeSetLoading(AppCore, value = false) {
  try {
    if (isFunction(AppCore?.setLoading)) {
      AppCore.setLoading(Boolean(value));
      return true;
    }
  } catch {}

  try {
    AppCore?.setState?.({
      loading: Boolean(value),
    });

    return true;
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      AppCore.state.loading = Boolean(value);
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   CONTROLS
========================================================= */

function uniqueElements(items = []) {
  return Array.from(
    new Set(
      items.filter(Boolean)
    )
  );
}

function getActionControls(elements = {}) {
  const root = safeObject(elements);

  return uniqueElements([
    root.logoutBtn,
    root.userToggle,
    root.toggleBtn,
    root.mobileToggleBtn,
  ]);
}

function setControlDisabled(element, disabled = false) {
  if (!element) {
    return false;
  }

  const value = Boolean(disabled);

  try {
    if ("disabled" in element) {
      element.disabled = value;
    }
  } catch {}

  try {
    element.setAttribute(
      "aria-disabled",
      value ? "true" : "false"
    );
  } catch {}

  try {
    element.classList?.toggle?.(
      "is-disabled",
      value
    );
  } catch {}

  try {
    element.dataset.busy = value ? "true" : "false";
  } catch {}

  return true;
}

function setControlsDisabled(elements = {}, disabled = false) {
  getActionControls(elements).forEach((element) => {
    setControlDisabled(element, disabled);
  });

  return true;
}

/* =========================================================
   STORAGE FALLBACK
========================================================= */

function getStoragePrefix(AppCore) {
  return safeText(
    AppCore?.config?.storagePrefix,
    "onion"
  );
}

function getKnownAuthStorageKeys(AppCore) {
  const prefix = getStoragePrefix(AppCore);

  const keys = [
    "auth.refreshToken",
    "auth.tempToken",
    "auth.sessionId",
    "auth.sessionUserId",

    "auth.token",
    "auth.accessToken",
    "auth.user",
    "auth.role",

    "session.token",
    "session.accessToken",
    "session.refreshToken",
    "session.user",

    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_session_id",
    "onion_session_user_id",
    "onion_user_id",
    "onion_user_name",
    "onion_role",

    "auth_token",
    "access_token",
    "refresh_token",
    "temp_token",
    "token",
    "session",
    "user",
    "role",
  ];

  const expanded = [];

  keys.forEach((key) => {
    expanded.push(key);
    expanded.push(`${prefix}:${key}`);
    expanded.push(key.replace(/\./g, ":"));
    expanded.push(`${prefix}:${key.replace(/\./g, ":")}`);
  });

  return Array.from(
    new Set(
      expanded.filter(Boolean)
    )
  );
}

function removeFromStorage(storage, key) {
  if (!storage || !key) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function clearKnownAuthStorage(AppCore) {
  if (!isBrowser()) {
    return false;
  }

  const keys = getKnownAuthStorageKeys(AppCore);

  let removed = 0;

  keys.forEach((key) => {
    if (removeFromStorage(window.localStorage, key)) {
      removed += 1;
    }

    if (removeFromStorage(window.sessionStorage, key)) {
      removed += 1;
    }
  });

  return removed;
}

/* =========================================================
   SESSION CLEARING
========================================================= */

function buildClearedAuthPatch() {
  return {
    authenticated: false,
    isAuthenticated: false,

    token: null,
    accessToken: null,
    refreshToken: null,
    tempToken: null,

    user: null,
    currentUser: null,
    sessionUser: null,
    authUser: null,

    role: "",
    rol: "",
    roles: [],

    isAdmin: false,
    admin: false,
    isSupport: false,
    isManager: false,

    session: null,
    sessionId: null,
    sessionUserId: null,

    loginInProgress: false,
    authLoginInProgress: false,
    isLoggingIn: false,
  };
}

async function clearAuthLocal(Auth, AppCore) {
  let cleared = false;

  const clearOptions = {
    silent: true,
    reason: "sidebar-logout",
    preserveRoute: false,
    preserveCurrentRoute: false,
  };

  const candidates = [
    Auth?.clearSessionLocal,
    Auth?.clearLocalSession,
    Auth?.clearSession,
  ];

  for (const candidate of candidates) {
    if (!isFunction(candidate)) {
      continue;
    }

    try {
      await Promise.resolve(
        candidate.call(Auth, clearOptions)
      );

      cleared = true;
      break;
    } catch (error) {
      safeWarn(
        AppCore,
        "Limpieza local Auth falló.",
        error
      );
    }
  }

  return cleared;
}

function clearAppCoreSession(AppCore) {
  const patch = buildClearedAuthPatch();

  let cleared = false;

  try {
    if (isFunction(AppCore?.clearSession)) {
      AppCore.clearSession();
      cleared = true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "AppCore.clearSession() falló.",
      error
    );
  }

  try {
    if (isFunction(AppCore?.setToken)) {
      AppCore.setToken(null);
      cleared = true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.setUser)) {
      AppCore.setUser(null);
      cleared = true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(patch);
      cleared = true;
    }
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, patch);
      cleared = true;
    }
  } catch {}

  return cleared;
}

async function clearSessionEverywhere({
  Auth,
  AppCore,
} = {}) {
  const authCleared =
    await clearAuthLocal(
      Auth,
      AppCore
    );

  const coreCleared =
    clearAppCoreSession(
      AppCore
    );

  const storageRemoved =
    clearKnownAuthStorage(
      AppCore
    );

  safeEmit(
    AppCore,
    "sidebar:logout:local-cleared",
    {
      authCleared,
      coreCleared,
      storageRemoved,
    }
  );

  safeEmit(
    AppCore,
    "app:session:cleared",
    {
      source: "sidebar:logout",
    }
  );

  safeEmit(
    AppCore,
    "auth:session:cleared",
    {
      source: "sidebar:logout",
    }
  );

  return {
    authCleared,
    coreCleared,
    storageRemoved,
  };
}

/* =========================================================
   UI SYNC
========================================================= */

function syncSidebarAfterLogout({
  AppCore,
  closeDropdown,
  renderUser,
  applyRoleVisibility,
  closeSidebarOnMobileAfterNavigation,
} = {}) {
  try {
    closeDropdown?.();
  } catch {}

  try {
    renderUser?.();
  } catch {}

  try {
    applyRoleVisibility?.();
  } catch {}

  let shouldCloseMobile = false;

  try {
    shouldCloseMobile =
      closeSidebarOnMobileAfterNavigation?.() === true;
  } catch {}

  if (shouldCloseMobile) {
    try {
      AppCore?.setState?.({
        sidebarOpen: false,
      });
    } catch {}

    try {
      if (AppCore?.state && typeof AppCore.state === "object") {
        AppCore.state.sidebarOpen = false;
      }
    } catch {}

    safeEmit(
      AppCore,
      "app:sidebar:change",
      {
        open: false,
        source: "sidebar:logout",
      }
    );
  }

  safeEmit(
    AppCore,
    "app:user-ui:sync",
    {
      source: "sidebar:logout",
    }
  );

  return true;
}

/* =========================================================
   NAVIGATION
========================================================= */

async function navigateToLogin({
  AppCore,
  Router,
} = {}) {
  const target = "/login";

  const options = {
    replaceState: true,
    force: true,
    forceRender: true,
    source: "sidebar:logout",
    fromLogout: true,
  };

  try {
    if (isFunction(Router?.navigate)) {
      await Promise.resolve(
        Router.navigate(target, options)
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.navigate('/login') falló.",
      error
    );
  }

  try {
    if (isFunction(Router?.replace)) {
      await Promise.resolve(
        Router.replace(target, options)
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.replace('/login') falló.",
      error
    );
  }

  try {
    if (isFunction(AppCore?.router?.navigate)) {
      await Promise.resolve(
        AppCore.router.navigate(target, options)
      );

      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.navigate)) {
      await Promise.resolve(
        AppCore.navigate(target, options)
      );

      return true;
    }
  } catch {}

  if (!isBrowser()) {
    return false;
  }

  try {
    window.history.replaceState(
      {
        path: target,
        publicPath: target,
        canonicalPath: target,
        source: "sidebar:logout",
        ts: Date.now(),
      },
      "",
      target
    );

    window.dispatchEvent(
      new PopStateEvent("popstate")
    );

    return true;
  } catch {}

  try {
    window.location.replace(target);
    return true;
  } catch {}

  return false;
}

/* =========================================================
   REMOTE LOGOUT
========================================================= */

async function runRemoteLogout({
  Auth,
  AppCore,
} = {}) {
  if (!isFunction(Auth?.logout)) {
    return {
      attempted: false,
      ok: false,
      error: null,
    };
  }

  try {
    await Promise.resolve(
      Auth.logout({
        silent: true,
        notifyServer: true,
        source: "sidebar",
      })
    );

    return {
      attempted: true,
      ok: true,
      error: null,
    };
  } catch (error) {
    safeWarn(
      AppCore,
      "Logout remoto falló, se limpiará sesión local igualmente.",
      error
    );

    safeEmit(
      AppCore,
      "sidebar:logout:remote-error",
      {
        message:
          safeText(
            error?.message,
            "Remote logout failed"
          ),
        error,
      }
    );

    return {
      attempted: true,
      ok: false,
      error,
    };
  }
}

/* =========================================================
   MAIN ACTION
========================================================= */

export async function handleLogout({
  AppCore,
  Auth,
  Router,
  closeDropdown,
  renderUser,
  applyRoleVisibility,
  closeSidebarOnMobileAfterNavigation,
  getElements,
  setLogoutInFlight,
  isLogoutInFlight,
} = {}) {
  if (
    isFunction(isLogoutInFlight) &&
    isLogoutInFlight()
  ) {
    return {
      ok: false,
      skipped: true,
      reason: "logout-in-flight",
    };
  }

  const startedAt = Date.now();

  const elements =
    isFunction(getElements)
      ? safeObject(getElements())
      : {};

  try {
    setLogoutInFlight?.(true);
  } catch {}

  setControlsDisabled(
    elements,
    true
  );

  try {
    closeDropdown?.();
  } catch {}

  safeSetLoading(
    AppCore,
    true
  );

  safeEmit(
    AppCore,
    "sidebar:logout:start",
    {
      source: "sidebar",
      timestamp: startedAt,
    }
  );

  let remoteResult = {
    attempted: false,
    ok: false,
    error: null,
  };

  let localResult = {
    authCleared: false,
    coreCleared: false,
    storageRemoved: 0,
  };

  let navigationOk = false;

  try {
    /*
      Remote logout es best-effort.
      Si falla por red/401/500, NO bloquea la limpieza local.
    */
    remoteResult =
      await runRemoteLogout({
        Auth,
        AppCore,
      });

    /*
      La limpieza local es obligatoria.
      Esto evita avatar/dashboard/token fantasma.
    */
    localResult =
      await clearSessionEverywhere({
        Auth,
        AppCore,
      });

    syncSidebarAfterLogout({
      AppCore,
      closeDropdown,
      renderUser,
      applyRoleVisibility,
      closeSidebarOnMobileAfterNavigation,
    });

    safeSetLoading(
      AppCore,
      false
    );

    navigationOk =
      await navigateToLogin({
        AppCore,
        Router,
      });

    const result = {
      ok: true,
      remote: remoteResult,
      local: localResult,
      navigationOk,
      durationMs: Date.now() - startedAt,
    };

    safeEmit(
      AppCore,
      "sidebar:logout:complete",
      result
    );

    return result;
  } catch (error) {
    safeError(
      AppCore,
      "Logout fatal inesperado.",
      error
    );

    /*
      Último intento: aunque haya fallado algo arriba,
      no dejamos auth fantasma.
    */
    try {
      await clearSessionEverywhere({
        Auth,
        AppCore,
      });
    } catch {}

    try {
      syncSidebarAfterLogout({
        AppCore,
        closeDropdown,
        renderUser,
        applyRoleVisibility,
        closeSidebarOnMobileAfterNavigation,
      });
    } catch {}

    try {
      safeSetLoading(
        AppCore,
        false
      );
    } catch {}

    try {
      navigationOk =
        await navigateToLogin({
          AppCore,
          Router,
        });
    } catch {}

    const result = {
      ok: false,
      error,
      message:
        safeText(
          error?.message,
          "No se pudo cerrar sesión correctamente."
        ),
      remote: remoteResult,
      local: localResult,
      navigationOk,
      durationMs: Date.now() - startedAt,
    };

    safeEmit(
      AppCore,
      "sidebar:logout:error",
      result
    );

    return result;
  } finally {
    try {
      setLogoutInFlight?.(false);
    } catch {}

    setControlsDisabled(
      elements,
      false
    );

    safeSetLoading(
      AppCore,
      false
    );
  }
}

export default {
  handleLogout,
};
