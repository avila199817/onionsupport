/* =========================================================
   Onion Support - Sidebar Actions
   Archivo: /src/ui/sidebar/actions.js

   Responsabilidad:
   - Acciones mínimas de compat para Sidebar.
   - Sin imports.
   - Sin state.js.
   - Sin storage.clear().
   - Sin limpieza masiva.
   - Sin route aliases.
   - Sin remote logout complejo.
   - Sin CustomEvent.
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

export const SIDEBAR_ACTIONS_VERSION = "simple";

const SOURCE = "sidebar.actions";
const LOGIN_ROUTE = "/login";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function stateOf(AppCore = null) {
  try {
    AppCore.state = isObject(AppCore.state) ? AppCore.state : {};
    return AppCore.state;
  } catch {
    return {};
  }
}

function emit(AppCore = null, eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: SIDEBAR_ACTIONS_VERSION,
      at: nowIso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PATHS
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function canonicalPath(path = "/") {
  let value = normalizePath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "");
  }

  return value || "/";
}

function isSafeInternalPath(path = "") {
  const value = text(path, "");

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (/[\r\n\t\\]/.test(value)) return false;

  return true;
}

function safeTarget(path = "/", fallback = "/") {
  const candidate = normalizePath(path || fallback);

  return isSafeInternalPath(candidate) ? candidate : fallback;
}

/* =========================================================
   DOM / STATE
========================================================= */

function sidebarRoot() {
  if (!isBrowser()) return null;

  try {
    return (
      document.getElementById("app-sidebar") ||
      document.getElementById("sidebar") ||
      document.querySelector("[data-sidebar-root]")
    );
  } catch {
    return null;
  }
}

function applyOpenDom(open = true) {
  const value = Boolean(open);
  const root = sidebarRoot();

  try {
    root?.classList?.toggle?.("is-open", value);
    root?.classList?.toggle?.("is-collapsed", !value);

    if (root?.dataset) {
      root.dataset.open = value ? "true" : "false";
    }
  } catch {
    // noop
  }

  try {
    document.body?.classList?.toggle?.("sidebar-open", value);
  } catch {
    // noop
  }

  return true;
}

function syncStateCallback(syncSidebarState = null) {
  try {
    if (isFunction(syncSidebarState)) return Boolean(syncSidebarState());
  } catch {
    // noop
  }

  return false;
}

/* =========================================================
   SIDEBAR OPEN/CLOSE
========================================================= */

export function setSidebarOpen({
  AppCore = null,
  open = true,
  closeDropdown = null,
  syncSidebarState = null,
  reason = "set-sidebar-open",
} = {}) {
  const value = Boolean(open);
  const state = stateOf(AppCore);

  if (!value) {
    try {
      closeDropdown?.({ force: true, reason });
    } catch {
      try {
        closeDropdown?.();
      } catch {
        // noop
      }
    }
  }

  state.sidebarOpen = value;
  state.sidebarDesktopOpen = value;

  applyOpenDom(value);
  syncStateCallback(syncSidebarState);

  emit(AppCore, value ? "sidebar:open" : "sidebar:close", {
    open: value,
    reason,
  });

  return true;
}

export function openSidebar({ AppCore = null, closeDropdown = null, syncSidebarState = null, reason = "open-sidebar" } = {}) {
  return setSidebarOpen({
    AppCore,
    open: true,
    closeDropdown,
    syncSidebarState,
    reason,
  });
}

export function closeSidebar({ AppCore = null, closeDropdown = null, syncSidebarState = null, reason = "close-sidebar" } = {}) {
  return setSidebarOpen({
    AppCore,
    open: false,
    closeDropdown,
    syncSidebarState,
    reason,
  });
}

export function toggleSidebar({ AppCore = null, closeDropdown = null, syncSidebarState = null, reason = "toggle-sidebar" } = {}) {
  const state = stateOf(AppCore);
  const current = Boolean(state.sidebarOpen);

  return setSidebarOpen({
    AppCore,
    open: !current,
    closeDropdown,
    syncSidebarState,
    reason,
  });
}

export function collapseSidebar(options = {}) {
  return closeSidebar({
    ...options,
    reason: options.reason || "collapse-sidebar",
  });
}

export function expandSidebar(options = {}) {
  return openSidebar({
    ...options,
    reason: options.reason || "expand-sidebar",
  });
}

export function ensureSidebarOpenForUserMenu(options = {}) {
  const state = stateOf(options.AppCore);

  if (state.sidebarOpen === true) return false;

  return openSidebar({
    ...options,
    reason: options.reason || "ensure-sidebar-open-for-user-menu",
  });
}

export function closeSidebarOnMobileAfterNavigation(options = {}) {
  return closeSidebar({
    ...options,
    reason: options.reason || "navigation",
  });
}

/* =========================================================
   NAVIGATION
========================================================= */

function resolveRouter(Router = null, AppCore = null) {
  try {
    return (
      Router ||
      AppCore?.Router ||
      AppCore?.router ||
      AppCore?.modules?.get?.("Router") ||
      AppCore?.modules?.get?.("router") ||
      null
    );
  } catch {
    return Router || null;
  }
}

function patchRouteState(AppCore = null, path = "/") {
  const publicPath = normalizePath(path);
  const canonical = canonicalPath(publicPath);
  const patch = {
    publicPath,
    route: canonical,
    canonicalPath: canonical,
  };

  try {
    Object.assign(stateOf(AppCore), patch);
  } catch {
    // noop
  }

  try {
    AppCore?.setState?.(patch, {
      source: SOURCE,
      silent: true,
      emit: false,
    });
  } catch {
    // noop
  }

  return patch;
}

async function navigateToTarget({
  AppCore = null,
  Router = null,
  target = "/",
  replace = false,
  source = SOURCE,
} = {}) {
  const path = safeTarget(target, "/");
  const router = resolveRouter(Router, AppCore);

  try {
    if (replace && isFunction(router?.replace)) {
      await router.replace(path, {
        source,
        replaceState: true,
        force: true,
      });

      patchRouteState(AppCore, path);
      return true;
    }

    if (isFunction(router?.navigate)) {
      await router.navigate(path, {
        source,
        replaceState: Boolean(replace),
        force: true,
      });

      patchRouteState(AppCore, path);
      return true;
    }

    if (isFunction(router?.push) && !replace) {
      await router.push(path, {
        source,
      });

      patchRouteState(AppCore, path);
      return true;
    }

    if (isFunction(AppCore?.navigate)) {
      await AppCore.navigate(path, {
        source,
        replaceState: Boolean(replace),
      });

      patchRouteState(AppCore, path);
      return true;
    }
  } catch {
    // fallback abajo
  }

  if (!isBrowser()) return false;

  try {
    if (replace) {
      window.history.replaceState(
        {
          path,
          publicPath: path,
          canonicalPath: canonicalPath(path),
          source,
        },
        "",
        path
      );

      patchRouteState(AppCore, path);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return true;
    }

    window.location.assign(path);
    return true;
  } catch {
    return false;
  }
}

export async function navigateFromSidebar({
  AppCore = null,
  Router = null,
  target = "",
  closeDropdown = null,
  closeSidebarOnMobile = true,
  syncSidebarState = null,
  replace = false,
  source = "sidebar",
} = {}) {
  const path = safeTarget(target, "");

  if (!path) return false;

  try {
    closeDropdown?.({ force: true, reason: "navigate-from-sidebar" });
  } catch {
    try {
      closeDropdown?.();
    } catch {
      // noop
    }
  }

  const ok = await navigateToTarget({
    AppCore,
    Router,
    target: path,
    replace,
    source,
  });

  if (ok && closeSidebarOnMobile) {
    closeSidebarOnMobileAfterNavigation({
      AppCore,
      closeDropdown,
      syncSidebarState,
      reason: "navigate-from-sidebar",
    });
  }

  emit(AppCore, ok ? "sidebar:navigation:complete" : "sidebar:navigation:error", {
    target: path,
    ok,
  });

  return ok;
}

/* =========================================================
   LOGOUT
========================================================= */

function resolveAuth(Auth = null, AppCore = null) {
  try {
    return (
      Auth ||
      AppCore?.Auth ||
      AppCore?.auth ||
      AppCore?.modules?.get?.("Auth") ||
      AppCore?.modules?.get?.("auth") ||
      null
    );
  } catch {
    return Auth || null;
  }
}

async function clearAuth(Auth = null, AppCore = null) {
  const auth = resolveAuth(Auth, AppCore);

  try {
    if (isFunction(auth?.logout)) {
      await auth.logout({
        source: SOURCE,
        skipNavigation: true,
        skipRedirect: true,
        noRedirect: true,
      });

      return true;
    }
  } catch {
    // fallback abajo
  }

  try {
    if (isFunction(auth?.clearSession)) {
      auth.clearSession({
        source: SOURCE,
      });

      return true;
    }
  } catch {
    // noop
  }

  try {
    if (isFunction(AppCore?.clearSession)) {
      AppCore.clearSession({
        source: SOURCE,
      });

      return true;
    }
  } catch {
    // noop
  }

  return false;
}

let logoutPromise = null;

export async function handleLogout({
  AppCore = null,
  Auth = null,
  Router = null,
  closeDropdown = null,
  renderUser = null,
  applyRoleVisibility = null,
  closeSidebarOnMobileAfterNavigation: closeMobile = null,
  syncSidebarState = null,
  setLogoutInFlight = null,
  isLogoutInFlight = null,
} = {}) {
  if (logoutPromise) return logoutPromise;

  if (isFunction(isLogoutInFlight) && isLogoutInFlight()) {
    return {
      ok: false,
      skipped: true,
      reason: "logout-in-flight",
    };
  }

  logoutPromise = (async () => {
    try {
      setLogoutInFlight?.(true);

      try {
        closeDropdown?.({ force: true, reason: "logout" });
      } catch {
        try {
          closeDropdown?.();
        } catch {
          // noop
        }
      }

      emit(AppCore, "sidebar:logout:start");

      await clearAuth(Auth, AppCore);

      try {
        renderUser?.("logout", {
          authenticated: false,
          user: null,
        });
      } catch {
        // noop
      }

      try {
        applyRoleVisibility?.("logout", {
          authenticated: false,
          user: null,
        });
      } catch {
        // noop
      }

      try {
        closeMobile?.({
          reason: "logout",
        });
      } catch {
        closeSidebarOnMobileAfterNavigation({
          AppCore,
          closeDropdown,
          syncSidebarState,
          reason: "logout",
        });
      }

      const navigationOk = await navigateToTarget({
        AppCore,
        Router,
        target: LOGIN_ROUTE,
        replace: true,
        source: "sidebar:logout",
      });

      emit(AppCore, "sidebar:logout:complete", {
        ok: true,
        navigationOk,
      });

      return {
        ok: true,
        navigationOk,
      };
    } finally {
      try {
        setLogoutInFlight?.(false);
      } catch {
        // noop
      }

      logoutPromise = null;
    }
  })();

  return logoutPromise;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarActionsSnapshot() {
  return {
    version: SIDEBAR_ACTIONS_VERSION,

    logoutInFlight: Boolean(logoutPromise),
    loginRoute: LOGIN_ROUTE,

    exports: [
      "setSidebarOpen",
      "openSidebar",
      "closeSidebar",
      "toggleSidebar",
      "collapseSidebar",
      "expandSidebar",
      "ensureSidebarOpenForUserMenu",
      "closeSidebarOnMobileAfterNavigation",
      "navigateFromSidebar",
      "handleLogout",
      "getSidebarActionsSnapshot",
    ],

    policy: {
      noImports: true,
      noStorageClear: true,
      noRemoteLogoutComplex: true,
      noRouteAliases: true,
      noCustomEvent: true,
      no2fa: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_ACTIONS_VERSION,

  setSidebarOpen,
  openSidebar,
  closeSidebar,
  toggleSidebar,
  collapseSidebar,
  expandSidebar,

  ensureSidebarOpenForUserMenu,
  closeSidebarOnMobileAfterNavigation,

  navigateFromSidebar,

  handleLogout,
  getSidebarActionsSnapshot,
};
