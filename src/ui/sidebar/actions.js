/* =========================================================
   Onion Support - Sidebar Actions
   Archivo: /src/ui/sidebar/actions.js

   Responsabilidad:
   - Acciones reales del sidebar.
   - Abrir / cerrar / alternar usando state.js.
   - Navegar usando Router si existe.
   - Normalizar targets públicos con Router.buildPublicPath()/resolveSpaHref().
   - Validar que el target público construido conserva el mismo destino canónico.
   - Mantener rutas privadas visibles como /@{slug}/{ruta}.
   - Navegar sin modificar open/collapsed.
   - Logout usando Auth si existe.
   - Cerrar sidebar durante logout.
   - Redirigir a /login tras logout.
   - Rechazar rutas legacy/sensibles delegando en constants.js -> core/config.js.
   - Sin DOM manual.
   - Sin eventos propios.
   - Sin storage.
   - Sin dropdown.
   - Sin navegación browser paralela.
   - Sin AppCore.navigate.
   - Sin Router.push legacy.
   - Sin mobile magic.
   - Sin route aliases.
   - Sin denylist local.
   - Sin /home.
   - Sin /403.
   - Sin /404.
   - Sin 2FA/MFA/OTP.
   - Sin limpieza masiva.
========================================================= */

import {
  HOME_ROUTE,
  LOGIN_ROUTE,
  SIDEBAR_SOURCE,
  getSidebarUserScopedRouteInfo,
  isSidebarBlockedRoute,
  normalizeSidebarPath,
  sidebarHomeLookupPath,
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

export const SIDEBAR_ACTIONS_VERSION = "sidebar.actions.v8.safe-public-target";

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
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function publicError(error = null) {
  if (!error) return null;

  return {
    name: error.name || "Error",
    message: redact(error.message || String(error)),
    status: error.status || error.statusCode || error.response?.status || 0,
    code: error.code || error.data?.code || error.response?.data?.code || null,
  };
}

/* =========================================================
   CONTEXT
========================================================= */

function resolveRouter(context = {}) {
  const ctx = options(context);
  const AppCore = ctx.AppCore || null;

  return (
    ctx.Router ||
    AppCore?.router ||
    AppCore?.Router ||
    safeModuleGet(AppCore, "router") ||
    safeModuleGet(AppCore, "Router") ||
    null
  );
}

function resolveAuth(context = {}) {
  const ctx = options(context);
  const AppCore = ctx.AppCore || null;

  return (
    ctx.Auth ||
    AppCore?.auth ||
    AppCore?.Auth ||
    safeModuleGet(AppCore, "auth") ||
    safeModuleGet(AppCore, "Auth") ||
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

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function isSafeInternalPath(path = "") {
  const value = text(path, "");

  return Boolean(
    value &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
      !/[\r\n\t\\]/.test(value) &&
      !hasSensitiveQuery(value)
  );
}

function isBlockedTargetPath(path = "") {
  const normalized = normalizeSidebarPath(path).split("?")[0].split("#")[0] || HOME_ROUTE;

  if (isSidebarBlockedRoute(normalized)) return true;

  const scoped = getSidebarUserScopedRouteInfo(normalized);

  if (scoped?.blocked === true) return true;

  /*
    Bloquea rutas legacy disfrazadas bajo /@{slug}.
    La fuente real del bloqueo es constants.js -> core/config.js.
  */
  if (scoped?.scoped === true && scoped.restPath) {
    return isSidebarBlockedRoute(scoped.restPath);
  }

  return false;
}

function sidebarDestination(path = "") {
  const normalized = normalizeSidebarPath(path);

  if (!normalized || isBlockedTargetPath(normalized)) return "";

  const lookup = sidebarHomeLookupPath(normalized);

  return lookup && !isBlockedTargetPath(lookup) ? lookup : "";
}

function sameSidebarDestination(left = "", right = "") {
  const leftDestination = sidebarDestination(left);
  const rightDestination = sidebarDestination(right);

  return Boolean(
    leftDestination &&
      rightDestination &&
      leftDestination === rightDestination
  );
}

export function getSafeSidebarTarget(target = "", fallback = "") {
  const raw = text(target, "");

  if (!isSafeInternalPath(raw)) {
    const fallbackTarget = fallback ? normalizeSidebarPath(fallback) : "";
    return fallbackTarget && !isBlockedTargetPath(fallbackTarget) ? fallbackTarget : "";
  }

  const normalized = normalizeSidebarPath(raw);

  if (!isSafeInternalPath(normalized)) {
    const fallbackTarget = fallback ? normalizeSidebarPath(fallback) : "";
    return fallbackTarget && !isBlockedTargetPath(fallbackTarget) ? fallbackTarget : "";
  }

  if (isBlockedTargetPath(normalized)) {
    const fallbackTarget = fallback ? normalizeSidebarPath(fallback) : "";
    return fallbackTarget && !isBlockedTargetPath(fallbackTarget) ? fallbackTarget : "";
  }

  return normalized;
}

/* =========================================================
   ROUTER TARGET BUILDING
========================================================= */

function publicTargetOptions() {
  return {
    useSlugHome: true,
    useSlugPrivate: true,
  };
}

function normalizeBuiltPublicTarget(candidate = "", safeTarget = "") {
  const output = getSafeSidebarTarget(candidate, "");

  if (!output) return "";

  /*
    No aceptamos una ruta pública construida si cambia el destino canónico.
    Esto protege contra firmas incompatibles de helpers antiguos.
      /cuenta -> /@slug/cuenta  OK, mismo lookup /cuenta
      /cuenta -> /@slug         NO, lookup cambia a /
  */
  if (!sameSidebarDestination(output, safeTarget)) {
    return "";
  }

  return output;
}

function tryRouterPublicBuilder(router = null, method = "", safeTarget = "", context = {}) {
  const fn = router?.[method];

  if (!isFunction(fn)) return "";

  const ctx = options(context);
  const AppCore = ctx.AppCore || null;
  const opts = publicTargetOptions();

  const attempts = [
    /*
      Firma Router actual:
        buildPublicPath(path, options)
        resolveSpaHref(path, options)
    */
    () => fn.call(router, safeTarget, opts),

    /*
      Compat helpers antiguos:
        buildPublicPath(AppCore, getRoute, canonicalPath, options)
    */
    () => fn.call(router, AppCore, null, safeTarget, opts),

    /*
      Compat helpers antiguos:
        resolveSpaHref(AppCore, href)
    */
    () => fn.call(router, AppCore, safeTarget),
  ];

  for (const attempt of attempts) {
    try {
      const candidate = normalizeBuiltPublicTarget(attempt(), safeTarget);

      if (candidate) return candidate;
    } catch {
      // probar siguiente firma
    }
  }

  return "";
}

function buildPublicTarget(target = "", context = {}) {
  const safeTarget = getSafeSidebarTarget(target, "");

  if (!safeTarget) return "";

  const router = resolveRouter(context);

  const built =
    tryRouterPublicBuilder(router, "buildPublicPath", safeTarget, context) ||
    tryRouterPublicBuilder(router, "resolveSpaHref", safeTarget, context);

  return built || safeTarget;
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

/* =========================================================
   NAVIGATION
========================================================= */

async function navigateWithRouter(path = HOME_ROUTE, context = {}) {
  const ctx = options(context);
  const router = resolveRouter(ctx);
  const replace = shouldReplace(ctx);

  if (!router) return false;

  const target = getSafeSidebarTarget(path, "");

  if (!target) return false;

  const payload = {
    source: actionSource(ctx),
    replaceState: replace,
    force: ctx.force === true,
  };

  if (replace && isFunction(router.replace)) {
    return navigationOk(await router.replace(target, payload));
  }

  if (isFunction(router.navigate)) {
    return navigationOk(await router.navigate(target, payload));
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
  const source = actionSource(ctx);

  try {
    if (isFunction(auth?.logout)) {
      const result = await auth.logout({
        source,
        skipNavigation: true,
        skipRedirect: true,
        noRedirect: true,
      });

      if (navigationOk(result)) {
        return true;
      }
    }
  } catch {
    // fallback abajo
  }

  try {
    if (isFunction(auth?.clearSession)) {
      await auth.clearSession({
        source,
        silent: true,
        emit: false,
      });

      return true;
    }
  } catch {
    // fallback abajo
  }

  try {
    if (isFunction(auth?.clearSessionLocal)) {
      await auth.clearSessionLocal({
        source,
        silent: true,
        emit: false,
      });

      return true;
    }
  } catch {
    // fallback abajo
  }

  try {
    if (isFunction(ctx.AppCore?.clearSession)) {
      await ctx.AppCore.clearSession({
        source,
        silent: true,
        emit: false,
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
      closeSidebar(ctx);

      const authCleared = await clearAuthSession({
        ...ctx,
        source: "sidebar.logout",
      });

      closeSidebar(ctx);

      const navigationOkResult = await navigateToLogin(ctx);

      return {
        ok: navigationOkResult === true,
        authenticated: false,

        authCleared,
        navigationOk: navigationOkResult,

        open: getSidebarOpen(),
        version: SIDEBAR_ACTIONS_VERSION,
      };
    } catch (error) {
      return {
        ok: false,
        authenticated: false,

        authCleared: false,
        navigationOk: false,
        error: publicError(error),

        open: getSidebarOpen(),
        version: SIDEBAR_ACTIONS_VERSION,
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
      actionsOnly: true,

      ownEvents: false,
      ownStorage: false,
      ownDropdown: false,
      ownMobileMagic: false,
      ownBrowserNavigation: false,

      usesRouterNavigation: true,
      noAppCoreNavigate: true,
      noRouterPushLegacy: true,

      buildsPublicTargetsWithRouter: true,
      supportsCurrentRouterBuilderSignature: true,
      supportsLegacyHelperBuilderSignatureSafely: true,
      validatesBuiltPublicTargetDestination: true,
      rejectsBuilderOutputChangingCanonicalDestination: true,

      rejectsSensitiveTargets: true,
      rejectsLegacyTargetsViaConstantsAndCoreConfig: true,
      rejectsScopedLegacyTargets: true,

      blockedRoutesDelegatedToConstantsAndCoreConfig: true,
      noLocalBlockedRouteList: true,

      userScopedPrivateRoutes: true,

      noRouteAliases: true,
      noHomeRoute: true,
      no403Route: true,
      no404Route: true,

      no2fa: true,
      noMfa: true,
      noOtp: true,

      navigationKeepsOpenState: true,
      logoutClosesSidebar: true,
      logoutRedirectsToLogin: true,
      snapshotRedacted: true,
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

  getSafeSidebarTarget,

  navigateFromSidebar,
  navigateToLogin,

  handleLogout,

  getSidebarActionsSnapshot,
};
