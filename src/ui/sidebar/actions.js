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
   - remote logout best-effort con timeout
   - local logout obligatorio
   - fallback AppCore.clearSession / Auth.clearSessionLocal / state patch
   - limpieza limitada de storage auth conocido
   - navegación robusta vía Router/AppCore/window fallback
   - controles bloqueados durante operación y restaurados a su estado previo
   - no rompe si window/document/storage no existen
   - no depende de una única API de Auth
   - safeEmit usa AppCore.events si existe; window solo fallback
   - no deja loader global colgado
   - no deja avatar/rol/token fantasma tras fallo remoto
========================================================= */

/* =========================================================
   MODULE RUNTIME
========================================================= */

let logoutPromise = null;

/* =========================================================
   CONSTANTS
========================================================= */

const LOGIN_ROUTE = "/login";

const REMOTE_LOGOUT_TIMEOUT_MS = 9000;

const LOG_PREFIX = "[SidebarActions]";

const EVENTS = Object.freeze({
  logoutStart: "sidebar:logout:start",
  logoutRemoteStart: "sidebar:logout:remote:start",
  logoutRemoteSuccess: "sidebar:logout:remote:success",
  logoutRemoteError: "sidebar:logout:remote:error",
  logoutLocalCleared: "sidebar:logout:local-cleared",
  logoutComplete: "sidebar:logout:complete",
  logoutError: "sidebar:logout:error",
  logoutFinally: "sidebar:logout:finally",

  appSessionCleared: "app:session:cleared",
  authSessionCleared: "auth:session:cleared",
  authLogoutSuccess: "auth:logout:success",

  userUiSync: "app:user-ui:sync",
  uiRepairRequest: "app:ui:repair-request",

  sidebarStateChange: "sidebar:state:change",
  appSidebarChange: "app:sidebar:change",
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

function hasDocument() {
  return typeof document !== "undefined";
}

function hasWindow() {
  return typeof window !== "undefined";
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
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(LOG_PREFIX, ...args);
  } catch {}

  try {
    console.warn(LOG_PREFIX, ...args);
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(LOG_PREFIX, ...args);
  } catch {}

  try {
    console.error(LOG_PREFIX, ...args);
  } catch {}
}

/*
  Importante:
  No emitimos por AppCore.events Y window a la vez.
  Si el bus existe, usamos bus. Window solo fallback.
*/
function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(name, payload);
      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló.`,
      error
    );
  }

  try {
    if (
      isBrowser() &&
      typeof CustomEvent !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function sleep(ms = 0) {
  return new Promise((resolve) => {
    try {
      if (hasWindow()) {
        window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
        return;
      }
    } catch {}

    resolve();
  });
}

async function withTimeout(promise, ms = REMOTE_LOGOUT_TIMEOUT_MS, label = "timeout") {
  const timeoutMs = Math.max(1000, Number(ms) || REMOTE_LOGOUT_TIMEOUT_MS);

  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    try {
      timer = setTimeout(() => {
        const error = new Error(`${label}:${timeoutMs}ms`);
        error.code = "SIDEBAR_ACTION_TIMEOUT";
        error.timeout = true;
        reject(error);
      }, timeoutMs);
    } catch {
      reject(new Error(`${label}:timeout`));
    }
  });

  try {
    return await Promise.race([
      promise,
      timeoutPromise,
    ]);
  } finally {
    try {
      clearTimeout(timer);
    } catch {}
  }
}

function cloneError(error = null) {
  return {
    name: safeText(error?.name, ""),
    message: safeText(error?.message, ""),
    code: safeText(error?.code, ""),
    status: error?.status ?? error?.statusCode ?? error?.response?.status ?? null,
    timeout: Boolean(error?.timeout),
  };
}

function safeSetLoading(AppCore, value = false) {
  const loading = Boolean(value);

  try {
    if (isFunction(AppCore?.setLoading)) {
      AppCore.setLoading(loading);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState({
        loading,
      });

      return true;
    }
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      AppCore.state.loading = loading;
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
  let inert = false;

  let hadDisabledAttr = false;
  let hadAriaDisabled = false;
  let hadBusy = false;
  let hadInertAttr = false;
  let hadIsDisabledClass = false;
  let hadIsLoadingClass = false;

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
    hadBusy = Boolean(
      element.dataset &&
      Object.prototype.hasOwnProperty.call(element.dataset, "busy")
    );

    busy = element.dataset?.busy;
  } catch {}

  try {
    inert = Boolean(element.inert);
  } catch {}

  try {
    hadInertAttr = Boolean(element.hasAttribute?.("inert"));
  } catch {}

  try {
    hadIsDisabledClass = Boolean(element.classList?.contains?.("is-disabled"));
    hadIsLoadingClass = Boolean(element.classList?.contains?.("is-loading"));
  } catch {}

  return {
    element,

    disabled,
    inert,

    hadDisabledAttr,
    hadAriaDisabled,
    ariaDisabled,

    hadBusy,
    busy,

    hadInertAttr,

    hadIsDisabledClass,
    hadIsLoadingClass,
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
    if (value) {
      element.setAttribute("disabled", "");
    } else {
      element.removeAttribute("disabled");
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

    element.classList?.toggle?.(
      "is-loading",
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
      if (item.hadInertAttr) {
        element.setAttribute("inert", "");
      } else {
        element.removeAttribute("inert");
      }
    } catch {}

    try {
      if ("inert" in element) {
        element.inert = Boolean(item.inert);
      }
    } catch {}

    try {
      element.classList?.toggle?.(
        "is-disabled",
        Boolean(item.hadIsDisabledClass)
      );

      element.classList?.toggle?.(
        "is-loading",
        Boolean(item.hadIsLoadingClass)
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
    "session.id",
    "session.userId",

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
    "accessToken",
    "refreshToken",
    "tempToken",

    "session",
    "sessionId",
    "sessionUserId",

    "user",
    "currentUser",
    "authUser",
    "sessionUser",

    "role",
    "roles",
    "permissions",
    "scopes",
  ];

  const expanded = [];

  keys.forEach((key) => {
    expanded.push(key);
    expanded.push(`${prefix}:${key}`);

    const colonKey = key.replace(/\./g, ":");
    const underscoreKey = key.replace(/\./g, "_");

    expanded.push(colonKey);
    expanded.push(underscoreKey);

    expanded.push(`${prefix}:${colonKey}`);
    expanded.push(`${prefix}_${underscoreKey}`);
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

function normalizeStorageKeyForScan(key = "") {
  return safeText(key, "")
    .toLowerCase()
    .replace(/[\s._-]+/g, ":")
    .replace(/:+/g, ":")
    .replace(/^:+|:+$/g, "");
}

function shouldRemoveScannedStorageKey(key = "", AppCore = null) {
  const value = safeText(key, "");
  if (!value) return false;

  const prefix = getStoragePrefix(AppCore);
  const normalized = normalizeStorageKeyForScan(value);
  const prefixNormalized = normalizeStorageKeyForScan(prefix);

  const isKnownNamespace =
    normalized.startsWith(`${prefixNormalized}:`) ||
    normalized.startsWith("onion:") ||
    normalized.startsWith("auth:") ||
    normalized.startsWith("session:");

  if (!isKnownNamespace) {
    return false;
  }

  return (
    normalized.includes("auth") ||
    normalized.includes("session") ||
    normalized.includes("token") ||
    normalized.includes("refresh") ||
    normalized.includes("temp") ||
    normalized.includes("user") ||
    normalized.includes("role") ||
    normalized.includes("permission") ||
    normalized.includes("scope")
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
  let scannedRemoved = 0;

  keys.forEach((key) => {
    if (removeFromAppCoreStorage(AppCore, key)) {
      appCoreRemoved += 1;
    }
  });

  if (!isBrowser()) {
    return {
      removed,
      appCoreRemoved,
      scannedRemoved,
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

  scannedRemoved =
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
      "accessToken",
      "refresh_token",
      "refreshToken",
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

      `${prefix}:token`,
      `${prefix}:access_token`,
      `${prefix}:refresh_token`,
      `${prefix}:session`,
      `${prefix}:session_id`,
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

function getCookieDomainVariants() {
  const domains = [];

  if (!isBrowser()) {
    return domains;
  }

  try {
    const host = safeText(window.location?.hostname, "");

    if (!host || host === "localhost" || /^[0-9.]+$/.test(host)) {
      return domains;
    }

    domains.push(host);

    const parts = host.split(".").filter(Boolean);

    if (parts.length >= 2) {
      domains.push(`.${parts.slice(-2).join(".")}`);
    }
  } catch {}

  return Array.from(new Set(domains));
}

function clearCookie(name = "") {
  const cleanName = safeText(name, "");

  if (!cleanName || !hasDocument()) {
    return false;
  }

  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  const domains = getCookieDomainVariants();

  const baseVariants = [
    `${cleanName}=; expires=${expires}; path=/`,
    `${cleanName}=; Max-Age=0; path=/`,
    `${cleanName}=; expires=${expires}; path=/; SameSite=Lax`,
    `${cleanName}=; Max-Age=0; path=/; SameSite=Lax`,
  ];

  const variants = [...baseVariants];

  domains.forEach((domain) => {
    baseVariants.forEach((variant) => {
      variants.push(`${variant}; domain=${domain}`);
    });
  });

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
    profile: null,

    role: "",
    rol: "",
    userRole: "",
    roles: [],
    permissions: [],
    scopes: [],

    isAdmin: false,
    admin: false,
    isSuperAdmin: false,
    superAdmin: false,
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

function patchNestedAuthObjects(AppCore) {
  let patched = false;

  try {
    const state = AppCore?.state;

    if (!state || typeof state !== "object") {
      return false;
    }

    const nestedCandidates = [
      state.auth,
      state.sessionAuth,
      state.authState,
    ].filter((value) => value && typeof value === "object");

    nestedCandidates.forEach((target) => {
      try {
        Object.assign(target, {
          authenticated: false,
          isAuthenticated: false,
          token: null,
          accessToken: null,
          refreshToken: null,
          tempToken: null,
          user: null,
          role: "",
          roles: [],
          permissions: [],
          scopes: [],
        });

        patched = true;
      } catch {}
    });
  } catch {}

  return patched;
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
    replaceState: false,

    remote: false,
    notifyServer: false,
    emit: false,
  };

  const candidates = [
    Auth?.clearSessionLocal,
    Auth?.clearLocalSession,
    Auth?.clearSession,
    Auth?.resetSession,
    Auth?.clearAuthStorage,
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

        navigate: false,
        redirect: false,
        emit: false,
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

  if (patchNestedAuthObjects(AppCore)) {
    cleared = true;
  }

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
    EVENTS.logoutLocalCleared,
    result
  );

  safeEmit(
    AppCore,
    EVENTS.appSessionCleared,
    {
      source: "sidebar:logout",
      local: result,
    }
  );

  safeEmit(
    AppCore,
    EVENTS.authSessionCleared,
    {
      source: "sidebar:logout",
      local: result,
    }
  );

  safeEmit(
    AppCore,
    EVENTS.authLogoutSuccess,
    {
      source: "sidebar:logout",
      localOnly: true,
      local: result,
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
    closeDropdown?.({
      force: true,
      reason: "logout",
    });
  } catch {
    try {
      closeDropdown?.();
    } catch {}
  }

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
      if (isFunction(AppCore?.setState)) {
        AppCore.setState({
          sidebarOpen: false,
          sidebarMobileOpen: false,
        });
      }
    } catch {}

    try {
      if (AppCore?.state && typeof AppCore.state === "object") {
        AppCore.state.sidebarOpen = false;
        AppCore.state.sidebarMobileOpen = false;
      }
    } catch {}

    safeEmit(
      AppCore,
      EVENTS.appSidebarChange,
      {
        open: false,
        mobile: true,
        source: "sidebar:logout",
      }
    );

    safeEmit(
      AppCore,
      EVENTS.sidebarStateChange,
      {
        open: false,
        mobile: true,
        source: "sidebar:logout",
      }
    );
  }

  safeEmit(
    AppCore,
    EVENTS.userUiSync,
    {
      source: "sidebar:logout",
    }
  );

  safeEmit(
    AppCore,
    EVENTS.uiRepairRequest,
    {
      source: "sidebar:logout",
      reason: "logout",
      syncState: true,
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
  const target = LOGIN_ROUTE;

  const options = {
    replaceState: true,
    replace: true,
    force: true,
    forceRender: true,
    source: "sidebar:logout",
    fromLogout: true,
  };

  const candidates = [
    {
      name: "Router.navigate",
      fn: Router?.navigate,
      ctx: Router,
      args: [target, options],
    },
    {
      name: "Router.replace",
      fn: Router?.replace,
      ctx: Router,
      args: [target, options],
    },
    {
      name: "Router.go",
      fn: Router?.go,
      ctx: Router,
      args: [target, options],
    },
    {
      name: "AppCore.router.navigate",
      fn: AppCore?.router?.navigate,
      ctx: AppCore?.router,
      args: [target, options],
    },
    {
      name: "AppCore.navigate",
      fn: AppCore?.navigate,
      ctx: AppCore,
      args: [target, options],
    },
  ];

  for (const candidate of candidates) {
    if (!isFunction(candidate.fn)) {
      continue;
    }

    try {
      await Promise.resolve(
        candidate.fn.apply(
          candidate.ctx,
          candidate.args
        )
      );

      return true;
    } catch (error) {
      safeWarn(
        AppCore,
        `${candidate.name}('/login') falló.`,
        error
      );
    }
  }

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
  const candidates = [
    {
      name: "Auth.logoutRemote",
      fn: Auth?.logoutRemote,
    },
    {
      name: "Auth.remoteLogout",
      fn: Auth?.remoteLogout,
    },
    {
      name: "Auth.signOutRemote",
      fn: Auth?.signOutRemote,
    },
    {
      name: "Auth.revokeSession",
      fn: Auth?.revokeSession,
    },
    {
      name: "Auth.api.logout",
      fn: Auth?.api?.logout,
      ctx: Auth?.api,
    },
    {
      name: "Auth.logout",
      fn: Auth?.logout,
    },
  ];

  return candidates.filter((item) =>
    isFunction(item.fn)
  );
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

  safeEmit(
    AppCore,
    EVENTS.logoutRemoteStart,
    {
      candidates: candidates.map((item) => item.name),
    }
  );

  const options = {
    silent: true,
    notifyServer: true,
    remote: true,
    remoteOnly: true,

    source: "sidebar",
    reason: "sidebar-logout",

    /*
      Si Auth.logout soporta estas flags, evitamos que navegue o que
      haga doble mutación visual. Si las ignora, no pasa nada.
    */
    local: false,
    clearLocal: false,
    navigate: false,
    redirect: false,
    replaceState: false,
    emit: false,
  };

  let lastError = null;

  for (const candidate of candidates) {
    const methodName =
      candidate.name || candidate.fn?.name || "anonymous";

    try {
      await withTimeout(
        Promise.resolve(
          candidate.fn.call(
            candidate.ctx || Auth,
            options
          )
        ),
        REMOTE_LOGOUT_TIMEOUT_MS,
        methodName
      );

      const result = {
        attempted: true,
        ok: true,
        method: methodName,
        error: null,
      };

      safeEmit(
        AppCore,
        EVENTS.logoutRemoteSuccess,
        result
      );

      return result;
    } catch (error) {
      lastError = error;

      safeWarn(
        AppCore,
        `Logout remoto falló en ${methodName}.`,
        error
      );
    }
  }

  const result = {
    attempted: true,
    ok: false,
    method: "",
    error: cloneError(lastError),
  };

  safeEmit(
    AppCore,
    EVENTS.logoutRemoteError,
    result
  );

  return result;
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
    closeDropdown?.({
      force: true,
      reason: "logout:start",
    });
  } catch {
    try {
      closeDropdown?.();
    } catch {}
  }

  safeSetLoading(
    AppCore,
    true
  );

  safeEmit(
    AppCore,
    EVENTS.logoutStart,
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
      Si falla por red/401/500/timeout, NO bloquea la limpieza local.
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

    /*
      Deja respirar al bus un tick para que AppCore/Auth/Router lean
      la sesión ya limpia antes de renderizar login.
    */
    await sleep(0);

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
      EVENTS.logoutComplete,
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
    } catch (clearError) {
      safeError(
        AppCore,
        "Limpieza local final también falló.",
        clearError
      );
    }

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
      error: cloneError(error),
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
      EVENTS.logoutError,
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
      EVENTS.logoutFinally,
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
    return logoutPromise;
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

/* =========================================================
   DEBUG
========================================================= */

export function getSidebarActionsSnapshot() {
  return {
    logoutInFlight:
      Boolean(logoutPromise),

    remoteTimeoutMs:
      REMOTE_LOGOUT_TIMEOUT_MS,

    loginRoute:
      LOGIN_ROUTE,

    events:
      EVENTS,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  handleLogout,
  getSidebarActionsSnapshot,
};
