/* =========================================================
   Onion Support - Sidebar Actions
   Archivo: /src/ui/sidebar/actions.js

   Responsabilidad:
   - Acciones reales del sidebar.
   - Abrir / cerrar / alternar usando state.js.
   - Navegar usando Router si existe.
   - Logout usando Auth si existe.
   - Redirigir a /login tras logout.
   - Sin DOM manual.
   - Sin eventos propios.
   - Sin storage.
   - Sin dropdown.
   - Sin mobile magic.
   - Sin route aliases.
   - Sin 2FA/MFA/OTP.
   - Sin limpieza masiva.
========================================================= */

import {
  LOGIN_ROUTE,
  SIDEBAR_SOURCE,
  normalizeSidebarPath,
} from "./constants.js";

import {
  closeSidebar as closeRuntimeSidebar,
  endSidebarLogout,
  getSidebarLogoutInFlight,
  getSidebarOpen,
  openSidebar as openRuntimeSidebar,
  setSidebarOpen as setRuntimeSidebarOpen,
  beginSidebarLogout,
  toggleSidebar as toggleRuntimeSidebar,
} from "./state.js";

export const SIDEBAR_ACTIONS_VERSION = "sidebar.actions.v1";

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

/* =========================================================
   CONTEXT RESOLVERS
========================================================= */

function resolveRouter(context = {}) {
  const AppCore = context.AppCore || null;

  try {
    return (
      context.Router ||
      AppCore?.Router ||
      AppCore?.router ||
      AppCore?.modules?.get?.("Router") ||
      AppCore?.modules?.get?.("router") ||
      null
    );
  } catch {
    return context.Router || null;
  }
}

function resolveAuth(context = {}) {
  const AppCore = context.AppCore || null;

  try {
    return (
      context.Auth ||
      AppCore?.Auth ||
      AppCore?.auth ||
      AppCore?.modules?.get?.("Auth") ||
      AppCore?.modules?.get?.("auth") ||
      null
    );
  } catch {
    return context.Auth || null;
  }
}

/* =========================================================
   PATH SAFETY
========================================================= */

function isSafeInternalTarget(value = "") {
  const raw = text(value, "");

  if (!raw) return false;
  if (!raw.startsWith("/")) return false;
  if (raw.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false;
  if (/[\r\n\t\\]/.test(raw)) return false;

  return true;
}

export function getSafeSidebarTarget(target = "", fallback = "") {
  const raw = text(target, "");

  if (!isSafeInternalTarget(raw)) {
    return fallback ? normalizeSidebarPath(fallback) : "";
  }

  const normalized = normalizeSidebarPath(raw);

  if (!isSafeInternalTarget(normalized)) {
    return fallback ? normalizeSidebarPath(fallback) : "";
  }

  return normalized;
}

/* =========================================================
   OPEN / CLOSE
========================================================= */

export function setSidebarOpen(context = {}) {
  const options = isObject(context) ? context : {};
  const open = options.open !== false;

  return setRuntimeSidebarOpen(open, {
    AppCore: options.AppCore || null,
    root: options.root || null,
  });
}

export function openSidebar(context = {}) {
  const options = isObject(context) ? context : {};

  return openRuntimeSidebar({
    AppCore: options.AppCore || null,
    root: options.root || null,
  });
}

export function closeSidebar(context = {}) {
  const options = isObject(context) ? context : {};

  return closeRuntimeSidebar({
    AppCore: options.AppCore || null,
    root: options.root || null,
  });
}

export function toggleSidebar(context = {}) {
  const options = isObject(context) ? context : {};

  return toggleRuntimeSidebar({
    AppCore: options.AppCore || null,
    root: options.root || null,
  });
}

export function collapseSidebar(context = {}) {
  return closeSidebar(context);
}

export function expandSidebar(context = {}) {
  return openSidebar(context);
}

/* =========================================================
   NAVIGATION
========================================================= */

async function navigateWithRouter(path = "/", context = {}) {
  const router = resolveRouter(context);
  const replace = context.replace === true || context.replaceState === true;

  if (replace && isFunction(router?.replace)) {
    await router.replace(path, {
      source: context.source || SIDEBAR_SOURCE,
      replaceState: true,
      force: context.force === true,
    });

    return true;
  }

  if (isFunction(router?.navigate)) {
    await router.navigate(path, {
      source: context.source || SIDEBAR_SOURCE,
      replaceState: replace,
      force: context.force === true,
    });

    return true;
  }

  if (!replace && isFunction(router?.push)) {
    await router.push(path, {
      source: context.source || SIDEBAR_SOURCE,
    });

    return true;
  }

  if (isFunction(context.AppCore?.navigate)) {
    await context.AppCore.navigate(path, {
      source: context.source || SIDEBAR_SOURCE,
      replaceState: replace,
      force: context.force === true,
    });

    return true;
  }

  return false;
}

function navigateWithBrowser(path = "/", context = {}) {
  if (!isBrowser()) return false;

  const replace = context.replace === true || context.replaceState === true;

  try {
    if (replace) {
      window.location.replace(path);
    } else {
      window.location.assign(path);
    }

    return true;
  } catch {
    return false;
  }
}

export async function navigateFromSidebar(context = {}) {
  const target = getSafeSidebarTarget(context.target || context.path || "", "");

  if (!target) return false;

  try {
    const routed = await navigateWithRouter(target, {
      ...context,
      source: context.source || SIDEBAR_SOURCE,
    });

    if (routed) return true;
  } catch {
    // fallback navegador abajo
  }

  return navigateWithBrowser(target, {
    ...context,
    source: context.source || SIDEBAR_SOURCE,
  });
}

export async function navigateToLogin(context = {}) {
  return navigateFromSidebar({
    ...context,
    target: LOGIN_ROUTE,
    replace: true,
    force: true,
    source: "sidebar.logout",
  });
}

/* =========================================================
   LOGOUT
========================================================= */

async function clearAuthSession(context = {}) {
  const auth = resolveAuth(context);

  try {
    if (isFunction(auth?.logout)) {
      await auth.logout({
        source: SIDEBAR_SOURCE,
        skipNavigation: true,
        skipRedirect: true,
        noRedirect: true,
      });

      return true;
    }
  } catch {
    // Intentar clearSession abajo.
  }

  try {
    if (isFunction(auth?.clearSession)) {
      auth.clearSession({
        source: SIDEBAR_SOURCE,
      });

      return true;
    }
  } catch {
    // Intentar AppCore abajo.
  }

  try {
    if (isFunction(context.AppCore?.clearSession)) {
      context.AppCore.clearSession({
        source: SIDEBAR_SOURCE,
      });

      return true;
    }
  } catch {
    // noop
  }

  return false;
}

let logoutPromise = null;

export async function handleLogout(context = {}) {
  if (logoutPromise) return logoutPromise;

  if (getSidebarLogoutInFlight()) {
    return {
      ok: false,
      skipped: true,
      reason: "logout-in-flight",
    };
  }

  logoutPromise = (async () => {
    const AppCore = context.AppCore || null;

    beginSidebarLogout(AppCore);

    try {
      const authCleared = await clearAuthSession(context);
      const navigationOk = await navigateToLogin(context);

      return {
        ok: navigationOk,
        authCleared,
        navigationOk,
      };
    } finally {
      endSidebarLogout(AppCore);
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
    open: getSidebarOpen(),
    logoutInFlight: getSidebarLogoutInFlight(),
    loginRoute: LOGIN_ROUTE,
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

  getSafeSidebarTarget,

  navigateFromSidebar,
  navigateToLogin,

  handleLogout,

  getSidebarActionsSnapshot,
};
