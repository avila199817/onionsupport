/* =========================================================
   Onion SPA - Sidebar Actions
   Archivo: src/ui/sidebar/actions.js

   FINAL EXTREME SYSTEM · LOGOUT SAFE · LOCAL CLEAR GUARANTEED · 10/10

   RESPONSABILIDADES:
   - centralizar acciones de negocio del sidebar
   - logout robusto aunque falle el endpoint remoto
   - desactivar controles durante acciones críticas
   - restaurar estado previo real de controles
   - limpiar sesión local con fallback seguro
   - limpiar restos legacy de auth si Auth/AppCore fallan
   - limpiar storage AppCore/localStorage/sessionStorage conocido
   - limpiar cookies auth no HttpOnly conocidas
   - resincronizar UI del sidebar tras logout
   - navegar a /login con replaceState
   - evitar doble logout concurrente
   - emitir eventos de diagnóstico
   - cero throws accidentales hacia la UI

   HARDENING EXTREMO:
   - remote logout best-effort
   - local logout obligatorio
   - fallback AppCore.clearSession / Auth.clearSessionLocal / state patch
   - limpieza limitada de storage auth conocido
   - navegación robusta vía Router/AppCore/window fallback
   - controles bloqueados durante operación y restaurados a su estado previo
   - no rompe si window/document/storage no existen
   - no depende de una única API de Auth
========================================================= */

/* =========================================================
   MODULE RUNTIME
========================================================= */

let logoutPromise = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function hasDocument() {
  return typeof document !== "undefined";
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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(key)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function nowTs() {
  return Date.now();
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
      safeArray(items).filter(Boolean)
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

function captureControlState(element) {
  if (!element) {
    return null;
  }

  let disabled = false;
  let ariaDisabled = null;
  let busy = null;
  let hadDisabledAttr = false;
  let hadAriaDisabled = false;
  let hadBusy = false;
  let hadIsDisabledClass = false;

  try {
    disabled = Boolean(element.disabled);
  } catch {}

  try {
    hadDisabledAttr = Boolean(element.hasAttribute?.("disabled"));
  } catch {}

  try {
    hadAriaDisabled = Boolean(element.hasAttribute?.("aria-disabled"));
    ariaDisabled = element.getAttribute?.("aria-disabled");
  } catch {}

  try {
    hadBusy = Boolean(element.dataset && Object.prototype.hasOwnProperty.call(element.dataset, "busy"));
    busy = element.dataset?.busy;
  } catch {}

  try {
    hadIsDisabledClass = Boolean(element.classList?.contains?.("is-disabled"));
  } catch {}

  return {
    element,
    disabled,
    hadDisabledAttr,
    hadAriaDisabled,
    ariaDisabled,
    hadBusy,
    busy,
    hadIsDisabledClass,
  };
}

function captureControlsState(elements = {}) {
  return getActionControls(elements)
    .map(captureControlState)
    .filter(Boolean);
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

function restoreControlsState(snapshot = []) {
  safeArray(snapshot).forEach((item) => {
    const element = item?.element;

    if (!element) {
      return;
    }

    try {
      if ("disabled" in element) {
        element.disabled = Boolean(item.disabled);
      }
    } catch {}

    try {
      if (item.hadDisabledAttr) {
        element.setAttribute("disabled", "");
      } else {
        element.removeAttribute("disabled");
      }
    } catch {}

    try {
      if (item.hadAriaDisabled) {
        element.setAttribute(
          "aria-disabled",
          item.ariaDisabled || "false"
        );
      } else {
        element.removeAttribute("aria-disabled");
      }
    } catch {}

    try {
      if (item.hadBusy) {
        element.dataset.busy = item.busy || "false";
      } else {
        delete element.dataset.busy;
      }
    } catch {}

    try {
      element.classList?.toggle?.(
        "is-disabled",
        Boolean(item.hadIsDisabledClass)
      );
    } catch {}
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
    "auth.roles",

    "session.token",
    "session.accessToken",
    "session.refreshToken",
    "session.user",
    "session.role",
    "session.roles",

    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_session_id",
    "onion_session_user_id",
    "onion_user_id",
    "onion_user_name",
    "onion_role",
    "onion_roles",

    "auth_token",
    "access_token",
    "refresh_token",
    "temp_token",
    "token",
    "session",
    "user",
    "role",
    "roles",
  ];

  const expanded = [];

  keys.forEach((key) => {
    expanded.push(key);
    expanded.push(`${prefix}:${key}`);

    const colonKey = key.replace(/\./g, ":");

    expanded.push(colonKey);
    expanded.push(`${prefix}:${colonKey}`);
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

function removeFromAppCoreStorage(AppCore, key) {
  if (!AppCore || !key) {
    return false;
  }

  try {
    if (isFunction(AppCore?.storage?.remove)) {
      AppCore.storage.remove(key);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.storage?.delete)) {
      AppCore.storage.delete(key);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.storage?.set)) {
      AppCore.storage.set(key, null);
      return true;
    }
  } catch {}

  return false;
}

function shouldRemoveScannedStorageKey(key = "", AppCore = null) {
  const value = safeText(key, "");
  if (!value) return false;

  const prefix = getStoragePrefix(AppCore);

  const normalized = value
    .toLowerCase()
    .replace(/[\s._-]+/g, ":");

  const prefixNormalized = prefix
    .toLowerCase()
    .replace(/[\s._-]+/g, ":");

  const isOnionLike =
    normalized.startsWith(`${prefixNormalized}:`) ||
    normalized.startsWith("onion:") ||
    normalized.startsWith("auth:") ||
    normalized.startsWith("session:");

  if (!isOnionLike) {
    return false;
  }

  return (
    normalized.includes("auth") ||
    normalized.includes("session") ||
    normalized.includes("token") ||
    normalized.includes("refresh") ||
    normalized.includes("temp") ||
    normalized.includes("user") ||
    normalized.includes("role")
  );
}

function scanAndClearStorage(storage, AppCore) {
  if (!storage) {
    return 0;
  }

  let removed = 0;
  const keys = [];

  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);

      if (key) {
        keys.push(key);
      }
    }
  } catch {
    return 0;
  }

  keys.forEach((key) => {
    if (!shouldRemoveScannedStorageKey(key, AppCore)) {
      return;
    }

    if (removeFromStorage(storage, key)) {
      removed += 1;
    }
  });

  return removed;
}

function clearKnownAuthStorage(AppCore) {
  const keys = getKnownAuthStorageKeys(AppCore);

  let removed = 0;
  let appCoreRemoved = 0;

  keys.forEach((key) => {
    if (removeFromAppCoreStorage(AppCore, key)) {
      appCoreRemoved += 1;
    }
  });

  if (!isBrowser()) {
    return {
      removed,
      appCoreRemoved,
      scannedRemoved: 0,
    };
  }

  keys.forEach((key) => {
    if (removeFromStorage(window.localStorage, key)) {
      removed += 1;
    }

    if (removeFromStorage(window.sessionStorage, key)) {
      removed += 1;
    }
  });

  const scannedRemoved =
    scanAndClearStorage(window.localStorage, AppCore) +
    scanAndClearStorage(window.sessionStorage, AppCore);

  return {
    removed,
    appCoreRemoved,
    scannedRemoved,
  };
}

/* =========================================================
   COOKIE FALLBACK
========================================================= */

function getKnownAuthCookieNames(AppCore) {
  const prefix = getStoragePrefix(AppCore);

  return Array.from(
    new Set([
      "token",
      "access_token",
      "refresh_token",
      "auth_token",
      "session",
      "session_id",
      "sessionId",

      "onion_token",
      "onion_access_token",
      "onion_refresh_token",
      "onion_session",
      "onion_session_id",

      `${prefix}_token`,
      `${prefix}_access_token`,
      `${prefix}_refresh_token`,
      `${prefix}_session`,
      `${prefix}_session_id`,
    ].filter(Boolean))
  );
}

function getCookieNames() {
  if (!hasDocument()) {
    return [];
  }

  try {
    return String(document.cookie || "")
      .split(";")
      .map((item) => item.split("=")[0])
      .map((item) => safeText(item, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function clearCookie(name = "") {
  const cleanName = safeText(name, "");

  if (!cleanName || !hasDocument()) {
    return false;
  }

  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";

  const variants = [
    `${cleanName}=; expires=${expires}; path=/`,
    `${cleanName}=; Max-Age=0; path=/`,
  ];

  try {
    const host = window.location?.hostname || "";

    if (host) {
      variants.push(`${cleanName}=; expires=${expires}; path=/; domain=${host}`);

      const parts = host.split(".");

      if (parts.length > 2) {
        variants.push(`${cleanName}=; expires=${expires}; path=/; domain=.${parts.slice(-2).join(".")}`);
      }
    }
  } catch {}

  let cleared = false;

  variants.forEach((cookieValue) => {
    try {
      document.cookie = cookieValue;
      cleared = true;
    } catch {}
  });

  return cleared;
}

function clearKnownAuthCookies(AppCore) {
  if (!hasDocument()) {
    return 0;
  }

  const known = getKnownAuthCookieNames(AppCore);
  const existing = getCookieNames();

  const targets = Array.from(
    new Set([
      ...known,
      ...existing.filter((name) => {
        const key = name.toLowerCase();

        return (
          key.startsWith("onion") ||
          key.startsWith("auth") ||
          key.startsWith("session") ||
          key.includes("token")
        );
      }),
    ])
  );

  let cleared = 0;

  targets.forEach((name) => {
    if (clearCookie(name)) {
      cleared += 1;
    }
  });

  return cleared;
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
    permissions: [],
    scopes: [],

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
    restoreInProgress: false,
    sessionRestoreInProgress: false,
  };
}

async function callClearCandidate(Auth, AppCore, candidate, clearOptions) {
  if (!isFunction(candidate)) {
    return false;
  }

  try {
    await Promise.resolve(
      candidate.call(Auth, clearOptions)
    );

    return true;
  } catch (error) {
    safeWarn(
      AppCore,
      "Limpieza local Auth falló.",
      error
    );

    return false;
  }
}

async function clearAuthLocal(Auth, AppCore) {
  let cleared = false;

  const clearOptions = {
    silent: true,
    reason: "sidebar-logout",
    source: "sidebar",
    preserveRoute: false,
    preserveCurrentRoute: false,
    navigate: false,
    redirect: false,
  };

  const candidates = [
    Auth?.clearSessionLocal,
    Auth?.clearLocalSession,
    Auth?.clearSession,
    Auth?.resetSession,
    Auth?.clear,
  ];

  for (const candidate of candidates) {
    const ok = await callClearCandidate(
      Auth,
      AppCore,
      candidate,
      clearOptions
    );

    if (ok) {
      cleared = true;
      break;
    }
  }

  return cleared;
}

function clearAppCoreSession(AppCore) {
  const patch = buildClearedAuthPatch();

  let cleared = false;

  try {
    if (isFunction(AppCore?.clearSession)) {
      AppCore.clearSession({
        silent: true,
        reason: "sidebar-logout",
        source: "sidebar",
      });

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

  const storageResult =
    clearKnownAuthStorage(
      AppCore
    );

  const cookiesCleared =
    clearKnownAuthCookies(
      AppCore
    );

  const result = {
    authCleared,
    coreCleared,
    storageRemoved:
      storageResult.removed || 0,
    appCoreStorageRemoved:
      storageResult.appCoreRemoved || 0,
    scannedStorageRemoved:
      storageResult.scannedRemoved || 0,
    cookiesCleared,
  };

  safeEmit(
    AppCore,
    "sidebar:logout:local-cleared",
    result
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

  safeEmit(
    AppCore,
    "auth:logout:success",
    {
      source: "sidebar:logout",
      localOnly: true,
    }
  );

  return result;
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
        sidebarMobileOpen: false,
      });
    } catch {}

    try {
      if (AppCore?.state && typeof AppCore.state === "object") {
        AppCore.state.sidebarOpen = false;
        AppCore.state.sidebarMobileOpen = false;
      }
    } catch {}

    safeEmit(
      AppCore,
      "app:sidebar:change",
      {
        open: false,
        mobile: true,
        source: "sidebar:logout",
      }
    );

    safeEmit(
      AppCore,
      "sidebar:state:change",
      {
        open: false,
        mobile: true,
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

  safeEmit(
    AppCore,
    "app:ui:repair-request",
    {
      source: "sidebar:logout",
      reason: "logout",
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
        ts: nowTs(),
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

function getRemoteLogoutCandidates(Auth) {
  return [
    Auth?.logoutRemote,
    Auth?.remoteLogout,
    Auth?.signOutRemote,
    Auth?.revokeSession,
    Auth?.logout,
  ].filter(isFunction);
}

async function runRemoteLogout({
  Auth,
  AppCore,
} = {}) {
  const candidates =
    getRemoteLogoutCandidates(Auth);

  if (!candidates.length) {
    return {
      attempted: false,
      ok: false,
      method: "",
      error: null,
    };
  }

  const options = {
    silent: true,
    notifyServer: true,
    source: "sidebar",
    reason: "sidebar-logout",

    /*
      Si Auth.logout soporta estas flags, evitamos que navegue o que
      haga doble mutación visual. Si las ignora, no pasa nada.
    */
    navigate: false,
    redirect: false,
    replaceState: false,
    emit: false,
  };

  let lastError = null;

  for (const candidate of candidates) {
    const methodName =
      candidate.name || "anonymous";

    try {
      await Promise.resolve(
        candidate.call(Auth, options)
      );

      return {
        attempted: true,
        ok: true,
        method: methodName,
        error: null,
      };
    } catch (error) {
      lastError = error;

      safeWarn(
        AppCore,
        `Logout remoto falló en ${methodName}.`,
        error
      );
    }
  }

  safeEmit(
    AppCore,
    "sidebar:logout:remote-error",
    {
      message:
        safeText(
          lastError?.message,
          "Remote logout failed"
        ),
      error:
        lastError,
    }
  );

  return {
    attempted: true,
    ok: false,
    method: "",
    error: lastError,
  };
}

/* =========================================================
   MAIN ACTION INTERNAL
========================================================= */

async function runLogoutFlow({
  AppCore,
  Auth,
  Router,
  closeDropdown,
  renderUser,
  applyRoleVisibility,
  closeSidebarOnMobileAfterNavigation,
  getElements,
  setLogoutInFlight,
} = {}) {
  const startedAt = nowTs();

  const elements =
    isFunction(getElements)
      ? safeObject(getElements())
      : {};

  const controlsSnapshot =
    captureControlsState(elements);

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
    method: "",
    error: null,
  };

  let localResult = {
    authCleared: false,
    coreCleared: false,
    storageRemoved: 0,
    appCoreStorageRemoved: 0,
    scannedStorageRemoved: 0,
    cookiesCleared: 0,
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
      durationMs: nowTs() - startedAt,
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
      localResult =
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
      durationMs: nowTs() - startedAt,
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

    restoreControlsState(
      controlsSnapshot
    );

    safeSetLoading(
      AppCore,
      false
    );

    safeEmit(
      AppCore,
      "sidebar:logout:finally",
      {
        durationMs: nowTs() - startedAt,
      }
    );
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
  if (logoutPromise) {
    return {
      ok: false,
      skipped: true,
      reason: "logout-promise-in-flight",
    };
  }

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

  logoutPromise =
    runLogoutFlow({
      AppCore,
      Auth,
      Router,
      closeDropdown,
      renderUser,
      applyRoleVisibility,
      closeSidebarOnMobileAfterNavigation,
      getElements,
      setLogoutInFlight,
    });

  try {
    return await logoutPromise;
  } finally {
    logoutPromise = null;
  }
}

export default {
  handleLogout,
};
