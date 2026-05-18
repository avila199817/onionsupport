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
  beginSidebarLogout,
  closeSidebar as closeRuntimeSidebar,
  endSidebarLogout,
  getSidebarLogoutInFlight,
  getSidebarOpen,
  openSidebar as openRuntimeSidebar,
  setSidebarOpen as setRuntimeSidebarOpen,
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
   CONTEXT
========================================================= */

function options(context = {}) {
  return isObject(context) ? context : {};
}

function resolveRouter(context = {}) {
  const ctx = options(context);
  const AppCore = ctx.AppCore || null;

  return (
    ctx.Router ||
    AppCore?.Router ||
    AppCore?.router ||
    null
  );
}

function resolveAuth(context = {}) {
  const ctx = options(context);
  const AppCore = ctx.AppCore || null;

  return (
    ctx.Auth ||
    AppCore?.Auth ||
    AppCore?.auth ||
    null
  );
}

function actionSource(context = {}) {
  return text(context.source, SIDEBAR_SOURCE);
}

function shouldReplace(context = {}) {
  return context.replace === true || context.replaceState === true;
}

/* =========================================================
   PATH SAFETY
========================================================= */

function isSafeInternalPath(path = "") {
  const value = text(path, "");

  return Boolean(
    value &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
      !/[\r\n\t\\]/.test(value)
  );
}

export function getSafeSidebarTarget(target = "", fallback = "") {
  const raw = text(target, "");

  if (!isSafeInternalPath(raw)) {
    return fallback ? normalizeSidebarPath(fallback) : "";
  }

  const normalized = normalizeSidebarPath(raw);

  if (!isSafeInternalPath(normalized)) {
    return fallback ? normalizeSidebarPath(fallback) : "";
  }

  return normalized;
}

/* =========================================================
   OPEN / CLOSE
========================================================= */

export function setSidebarOpen(context = {}) {
  const ctx = options(context);

  return setRuntimeSidebarOpen(ctx.open !== false, {
    AppCore: ctx.AppCore || null,
    root: ctx.root || null,
  });
}

export function openSidebar(context = {}) {
  const ctx = options(context);

  return openRuntimeSidebar({
    AppCore: ctx.AppCore || null,
    root: ctx.root || null,
  });
}

export function closeSidebar(context = {}) {
  const ctx = options(context);

  return closeRuntimeSidebar({
    AppCore: ctx.AppCore || null,
    root: ctx.root || null,
  });
}

export function toggleSidebar(context = {}) {
  const ctx = options(context);

  return toggleRuntimeSidebar({
    AppCore: ctx.AppCore || null,
    root: ctx.root || null,
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
  const replace = shouldReplace(context);

  const payload = {
    source: actionSource(context),
    replaceState: replace,
    force: context.force === true,
  };

  if (replace && isFunction(router?.replace)) {
    await router.replace(path, payload);
    return true;
  }

  if (isFunction(router?.navigate)) {
    await router.navigate(path, payload);
    return true;
  }

  if (!replace && isFunction(router?.push)) {
    await router.push(path, payload);
    return true;
  }

  if (isFunction(context.AppCore?.navigate)) {
    await context.AppCore.navigate(path, payload);
    return true;
  }

  return false;
}

function navigateWithBrowser(path = "/", context = {}) {
  if (!isBrowser()) return false;

  try {
    if (shouldReplace(context)) {
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
  const ctx = options(context);
  const target = getSafeSidebarTarget(ctx.target || ctx.path || "", "");

  if (!target) return false;

  const payload = {
    ...ctx,
    source: actionSource(ctx),
  };

  try {
    if (await navigateWithRouter(target, payload)) {
      return true;
    }
  } catch {
    // fallback navegador abajo
  }

  return navigateWithBrowser(target, payload);
}

export async function navigateToLogin(context = {}) {
  return navigateFromSidebar({
    ...options(context),
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
    // fallback abajo
  }

  try {
    if (isFunction(auth?.clearSession)) {
      await auth.clearSession({
        source: SIDEBAR_SOURCE,
      });

      return true;
    }
  } catch {
    // fallback abajo
  }

  try {
    if (isFunction(context.AppCore?.clearSession)) {
      await context.AppCore.clearSession({
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
  const ctx = options(context);

  if (logoutPromise) return logoutPromise;

  if (getSidebarLogoutInFlight()) {
    return {
      ok: false,
      skipped: true,
      reason: "logout-in-flight",
    };
  }

  logoutPromise = (async () => {
    const AppCore = ctx.AppCore || null;

    beginSidebarLogout(AppCore);

    try {
      const authCleared = await clearAuthSession(ctx);
      const navigationOk = await navigateToLogin(ctx);

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
