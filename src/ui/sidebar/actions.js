/* =========================================================
   Onion Support - Sidebar Actions
   Archivo: /src/ui/sidebar/actions.js

   Responsabilidad:
   - Acciones reales del sidebar.
   - Abrir / cerrar / alternar usando state.js.
   - Navegar usando Router/AppCore si existe.
   - Normalizar targets públicos con Router.buildPublicPath().
   - Mantener rutas privadas visibles como /@{slug}/{ruta}.
   - Navegar sin modificar open/collapsed.
   - Logout usando Auth si existe.
   - Cerrar sidebar durante logout.
   - Redirigir a /login tras logout.
   - Sin DOM manual.
   - Sin eventos propios.
   - Sin storage.
   - Sin dropdown.
   - Sin navegación browser paralela.
   - Sin mobile magic.
   - Sin route aliases.
   - Sin /home.
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

export const SIDEBAR_ACTIONS_VERSION = "sidebar.actions.v4";

/* =========================================================
   BASICS
========================================================= */

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

function options(context = {}) {
  return isObject(context) ? context : {};
}

function safeModuleGet(AppCore = null, name = "") {
  try {
    return AppCore?.modules?.get?.(name) || null;
  } catch {
    return null;
  }
}

function navigationOk(result = null) {
  if (result === false) return false;
  if (isObject(result) && result.ok === false) return false;

  return true;
}

/* =========================================================
   CONTEXT
========================================================= */

function resolveRouter(context = {}) {
  const ctx = options(context);
  const AppCore = ctx.AppCore || null;

  return (
    ctx.Router ||
    AppCore?.Router ||
    AppCore?.router ||
    safeModuleGet(AppCore, "Router") ||
    safeModuleGet(AppCore, "router") ||
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
    safeModuleGet(AppCore, "Auth") ||
    safeModuleGet(AppCore, "auth") ||
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

function buildPublicTarget(target = "", context = {}) {
  const safeTarget = getSafeSidebarTarget(target, "");

  if (!safeTarget) return "";

  const router = resolveRouter(context);

  try {
    if (isFunction(router?.buildPublicPath)) {
      const publicTarget = router.buildPublicPath(safeTarget, {
        useSlugHome: true,
        useSlugPrivate: true,
      });

      return getSafeSidebarTarget(publicTarget, safeTarget);
    }
  } catch {
    return safeTarget;
  }

  try {
    if (isFunction(router?.resolveSpaHref)) {
      const publicTarget = router.resolveSpaHref(safeTarget, {
        useSlugHome: true,
        useSlugPrivate: true,
      });

      return getSafeSidebarTarget(publicTarget, safeTarget);
    }
  } catch {
    return safeTarget;
  }

  return safeTarget;
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
  const ctx = options(context);
  const router = resolveRouter(ctx);
  const replace = shouldReplace(ctx);

  const payload = {
    source: actionSource(ctx),
    replaceState: replace,
    force: ctx.force === true,
  };

  if (replace && isFunction(router?.replace)) {
    return navigationOk(await router.replace(path, payload));
  }

  if (isFunction(router?.navigate)) {
    return navigationOk(await router.navigate(path, payload));
  }

  if (!replace && isFunction(router?.push)) {
    return navigationOk(await router.push(path, payload));
  }

  if (isFunction(ctx.AppCore?.navigate)) {
    return navigationOk(await ctx.AppCore.navigate(path, payload));
  }

  return false;
}

export async function navigateFromSidebar(context = {}) {
  const ctx = options(context);
  const rawTarget = ctx.target || ctx.path || "";
  const target = buildPublicTarget(rawTarget, ctx);

  if (!target) return false;

  try {
    return await navigateWithRouter(target, {
      ...ctx,
      source: actionSource(ctx),
    });
  } catch {
    return false;
  }
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
  const ctx = options(context);
  const auth = resolveAuth(ctx);

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
    if (isFunction(auth?.clearSessionLocal)) {
      await auth.clearSessionLocal({
        source: SIDEBAR_SOURCE,
      });

      return true;
    }
  } catch {
    // fallback abajo
  }

  try {
    if (isFunction(ctx.AppCore?.clearSession)) {
      await ctx.AppCore.clearSession({
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

      closeSidebar(ctx);

      const navigationOkResult = await navigateToLogin(ctx);

      return {
        ok: navigationOkResult === true,
        authCleared,
        navigationOk: navigationOkResult,
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

    policy: {
      ownEvents: false,
      ownStorage: false,
      ownDropdown: false,
      ownMobileMagic: false,
      ownBrowserNavigation: false,

      usesRouterNavigation: true,
      buildsPublicTargetsWithRouter: true,

      userScopedPrivateRoutes: true,

      noRouteAliases: true,
      noHomeRoute: true,
      no2fa: true,

      navigationKeepsOpenState: true,
      logoutClosesSidebar: true,
      logoutRedirectsToLogin: true,
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

  getSafeSidebarTarget,

  navigateFromSidebar,
  navigateToLogin,

  handleLogout,

  getSidebarActionsSnapshot,
};
