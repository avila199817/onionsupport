/* =========================================================
   Onion SPA - App Session Bootstrap
   Archivo: src/app/session.js

   APP SESSION · SIMPLE BRIDGE
   - puente boot ↔ Auth
   - Auth hace el restore real
   - App sólo pasa flags de boot y sincroniza UI
   - preserva rutas públicas técnicas
   - sin fetch, CoreHttp directo, storage directo ni sesión paralela
   - sin applySession propio, refresh propio ni navegación manual
   - sin eventos de ruta que puedan provocar rerender loops
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

import {
  getProtectedInitialPublicPath,
  normalizeCanonicalPath,
  redactTokenInText,
} from "../router/helpers.js";

export const SESSION_VERSION = "21.0.1-simple";

const SOURCE = "app.session";

const PUBLIC_TECHNICAL_PATHS = Object.freeze([
  "/login",
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
  "/reset-password",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/password-reset",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
  "/forgot-password",
  "/recover-password",
  "/recover",
  "/2fa",
  "/otp",
  "/mfa",
]);

const EVENTS = Object.freeze({
  restoreStart: "app:session:restore:start",
  restoreDone: "app:session:restore:done",
  restoreError: "app:session:restore:error",
});

let restorePromise = null;

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function object(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function iso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "");
  }
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";

  if (/token|secret|password|authorization|credential|jwt|bearer|otp|totp|mfa|2fa|code|refresh/i.test(keyHint)) {
    return value ? "***" : value;
  }

  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: text(value.name, "Error"),
      message: redact(value.message || ""),
      status: value.status || value.statusCode || value.response?.status || null,
      code: value.code || value.data?.code || value.response?.data?.code || null,
      at: iso(),
    };
  }

  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1, keyHint));

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitize(item, depth + 1, key)])
    );
  }

  return String(value);
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;

  const detail = sanitize({
    version: SESSION_VERSION,
    source: SOURCE,
    at: iso(),
    ...object(payload),
  });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[AppSession]", ...args.map((item) => sanitize(item)));
  } catch {
    try {
      if (AppCore?.config?.debug) console.warn("[AppSession]", ...args.map((item) => sanitize(item)));
    } catch {}
  }
}

function setState(AppCore, patch = {}, options = {}) {
  const data = object(patch);
  if (!AppCore || !Object.keys(data).length) return false;

  try {
    AppCore?.setState?.(data, { source: SOURCE, emit: false, emitState: false, silent: true, ...object(options) });
    return true;
  } catch {}

  try {
    AppCore?.patchState?.(data, { source: SOURCE, emit: false, silent: true, ...object(options) });
    return true;
  } catch {}

  try {
    if (AppCore.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, data);
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   ROUTE / AUTH READS
========================================================= */

function currentPublicPath(AppCore, Router) {
  try {
    const value = getCurrentPublicPath(AppCore, Router);
    if (value) return value;
  } catch {}

  try {
    const value = Router?.getCurrentPublicPath?.();
    if (value) return value;
  } catch {}

  return AppCore?.state?.publicPath || AppCore?.state?.route || "/";
}

function currentCanonicalPath(AppCore, Router) {
  try {
    const value = getCurrentCanonicalPath(AppCore, Router);
    if (value) return value;
  } catch {}

  try {
    const value = Router?.getCurrentCanonicalPath?.();
    if (value) return value;
  } catch {}

  return AppCore?.state?.canonicalPath || AppCore?.state?.route || "/";
}

function protectedInitialPath(AppCore) {
  try {
    return getProtectedInitialPublicPath(AppCore) || "";
  } catch {
    return "";
  }
}

function normalizePathOnly(AppCore, path = "/") {
  try {
    return normalizeCanonicalPath(AppCore, path) || "/";
  } catch {
    return text(path, "/").split("?")[0].split("#")[0] || "/";
  }
}

function isPublicTechnicalPath(AppCore, path = "/") {
  const clean = normalizePathOnly(AppCore, path);
  return PUBLIC_TECHNICAL_PATHS.some((item) => clean === item || clean.startsWith(`${item}/`));
}

function publicTechnicalBoot(AppCore, Router) {
  const protectedPath = protectedInitialPath(AppCore);
  const publicPath = currentPublicPath(AppCore, Router);
  const canonicalPath = currentCanonicalPath(AppCore, Router);

  return Boolean(
    protectedPath ||
      isPublicTechnicalPath(AppCore, publicPath) ||
      isPublicTechnicalPath(AppCore, canonicalPath) ||
      isPublicTechnicalPath(AppCore, AppCore?.state?.bootProtectedInitialPublicPath) ||
      isPublicTechnicalPath(AppCore, AppCore?.state?.bootProtectedInitialPath)
  );
}

function isAuthenticated(AppCore, Auth) {
  try {
    if (isFn(Auth?.isAuthenticated)) return Boolean(Auth.isAuthenticated());
  } catch {}

  return Boolean(AppCore?.state?.authenticated === true);
}

function readUser(AppCore, Auth) {
  try {
    if (isFn(Auth?.getUser)) return Auth.getUser();
  } catch {}

  try {
    if (isFn(Auth?.getCurrentUser)) return Auth.getCurrentUser();
  } catch {}

  return AppCore?.state?.user || AppCore?.state?.currentUser || AppCore?.state?.sessionUser || null;
}

function readRole(AppCore, Auth) {
  try {
    if (isFn(Auth?.getRole)) return Auth.getRole();
  } catch {}

  try {
    if (isFn(Auth?.getCurrentRole)) return Auth.getCurrentRole();
  } catch {}

  const user = readUser(AppCore, Auth);
  return AppCore?.state?.role || user?.role || null;
}

function publicUser(user = null) {
  const source = object(user, null);
  if (!source) return null;

  return {
    id: source.id || source.userId || null,
    userId: source.userId || source.id || null,
    username: source.username || source.slug || null,
    name: source.name || source.fullName || source.displayName || source.username || null,
    displayName: source.name || source.fullName || source.displayName || source.username || null,
    fullName: source.name || source.fullName || source.displayName || null,
    role: source.role || null,
    avatarUrl: source.avatarUrl || source.avatar || source.picture || null,
  };
}

/* =========================================================
   UI
========================================================= */

async function runSyncUserUI({ AppCore, Auth, Router, syncUserUI, reason = "session-sync" } = {}) {
  if (isFn(syncUserUI)) {
    try {
      await Promise.resolve(syncUserUI({ AppCore, Auth, Router, reason, source: SOURCE }));
    } catch (error) {
      warn(AppCore, "syncUserUI() falló.", error);
    }
  }

  try {
    await Promise.resolve(AppCore?.syncUserUI?.({ reason, source: SOURCE }));
  } catch {}

  return true;
}

function resultFlags(result = {}, AppCore = null, Auth = null) {
  const payload = object(result);

  return {
    ok: Boolean(payload.ok) || isAuthenticated(AppCore, Auth),
    restored: Boolean(payload.restored) || Boolean(payload.ok) || isAuthenticated(AppCore, Auth),
    authenticated: isAuthenticated(AppCore, Auth),
    reason: text(payload.reason || payload.code, ""),
    code: text(payload.code, "") || null,
    navigationHandled: Boolean(payload.navigationHandled || payload.navigated || payload.redirected),
    navigated: Boolean(payload.navigated || payload.navigationHandled),
    redirected: Boolean(payload.redirected || payload.navigationHandled),
    routeChanged: Boolean(payload.routeChanged),
  };
}

/* =========================================================
   AUTH RESTORE
========================================================= */

function restoreOptions({ publicRoute = false, skipNavigation = true } = {}) {
  const skipNav = Boolean(publicRoute || skipNavigation);

  return {
    silent: true,

    skipNavigation: skipNav,
    skipRedirect: skipNav,
    noRedirect: skipNav,
    skipPostRestoreNavigation: skipNav,

    preserveCurrentRoute: publicRoute || skipNav,
    preserveRoute: publicRoute || skipNav,
    preservePublicPath: publicRoute || skipNav,
    preserveSearch: publicRoute,
    preserveHash: publicRoute,

    publicRoute,
    technicalPublicRoute: publicRoute,

    source: SOURCE,
    reason: "app-session-restore",
  };
}

async function callAuthRestore(Auth, options) {
  if (!Auth) return null;

  if (isFn(Auth.restoreSession)) return Auth.restoreSession(options);
  if (isFn(Auth.restore)) return Auth.restore(options);
  if (isFn(Auth.restoreSessionInBackground)) return Auth.restoreSessionInBackground(options);
  if (isFn(Auth.session?.restore)) return Auth.session.restore(options);

  return null;
}

export async function restoreAuthSession({
  AppCore,
  Auth,
  Router,
  syncUserUI,
  state,
  emitEvents = true,
  syncUi = true,
  skipNavigation = true,
} = {}) {
  if (restorePromise) return restorePromise;

  restorePromise = (async () => {
    const publicRoute = publicTechnicalBoot(AppCore, Router);

    setState(AppCore, {
      restoring: true,
      authRestoring: true,
      sessionRestoring: true,
    });

    emit(AppCore, EVENTS.restoreStart, {
      publicTechnicalBoot: publicRoute,
      publicPath: currentPublicPath(AppCore, Router),
    }, { emitEvents });

    try {
      const hasRestore = Boolean(
        Auth &&
          (isFn(Auth.restoreSession) || isFn(Auth.restore) || isFn(Auth.restoreSessionInBackground) || isFn(Auth.session?.restore))
      );

      if (!hasRestore) {
        const missingResult = {
          ok: false,
          restored: false,
          reason: "auth-module-missing",
          authenticated: isAuthenticated(AppCore, Auth),
          publicTechnicalBoot: publicRoute,
          navigationHandled: false,
          navigated: false,
          redirected: false,
          routeChanged: false,
        };

        if (syncUi) await runSyncUserUI({ AppCore, Auth, Router, syncUserUI, reason: "auth-module-missing" });
        emit(AppCore, EVENTS.restoreDone, missingResult, { emitEvents });
        return missingResult;
      }

      const result = await Promise.resolve(callAuthRestore(Auth, restoreOptions({ publicRoute, skipNavigation })));
      const flags = resultFlags(result, AppCore, Auth);

      if (syncUi) await runSyncUserUI({ AppCore, Auth, Router, syncUserUI, reason: "restore-auth-session" });

      const finalResult = {
        ...flags,
        publicTechnicalBoot: publicRoute,
        user: publicUser(readUser(AppCore, Auth)),
        role: readRole(AppCore, Auth),
      };

      emit(AppCore, EVENTS.restoreDone, finalResult, { emitEvents });
      return finalResult;
    } catch (error) {
      const payload = {
        ok: false,
        restored: false,
        authenticated: isAuthenticated(AppCore, Auth),
        publicTechnicalBoot: publicRoute,
        error: sanitize(error),
        navigationHandled: false,
        navigated: false,
        redirected: false,
        routeChanged: false,
      };

      warn(AppCore, "restoreAuthSession() falló.", error);
      emit(AppCore, EVENTS.restoreError, payload, { emitEvents });

      if (syncUi) await runSyncUserUI({ AppCore, Auth, Router, syncUserUI, reason: "restore-auth-session-error" });

      return payload;
    } finally {
      setState(AppCore, {
        restoring: false,
        authRestoring: false,
        sessionRestoring: false,
      });

      restorePromise = null;

      try {
        if (state && typeof state === "object") state.sessionRestorePromise = null;
      } catch {}
    }
  })();

  try {
    if (state && typeof state === "object") state.sessionRestorePromise = restorePromise;
  } catch {}

  return restorePromise;
}

/* =========================================================
   BACKGROUND RESTORE
========================================================= */

export async function restoreSessionInBackground({
  AppCore,
  Auth,
  Router,
  Store,
  state,
  syncUserUI,
  warmup,
  skipNavigation = false,
  skipPostRestoreNavigation = false,
} = {}) {
  const beforeCanonical = currentCanonicalPath(AppCore, Router);
  const beforePublic = currentPublicPath(AppCore, Router);
  const publicRoute = publicTechnicalBoot(AppCore, Router);
  const skipNav = Boolean(skipNavigation || skipPostRestoreNavigation || publicRoute);

  try {
    const result = await restoreAuthSession({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      state,
      emitEvents: true,
      syncUi: false,
      skipNavigation: skipNav,
    });

    try {
      if (isFn(warmup)) await Promise.resolve(warmup({ AppCore, Auth, Router, Store, reason: "session-restore" }));
    } catch (error) {
      warn(AppCore, "warmup() falló.", error);
    }

    await runSyncUserUI({ AppCore, Auth, Router, syncUserUI, reason: "restore-session-background-final" });

    const afterCanonical = currentCanonicalPath(AppCore, Router);
    const afterPublic = currentPublicPath(AppCore, Router);
    const routeChanged = Boolean(beforeCanonical !== afterCanonical || beforePublic !== afterPublic);
    const flags = resultFlags(result, AppCore, Auth);

    return {
      ...flags,
      publicTechnicalBoot: publicRoute,
      skipPostRestoreNavigation: skipNav,
      beforeCanonical,
      beforePublic,
      afterCanonical,
      afterPublic,
      routeChanged,
      user: publicUser(readUser(AppCore, Auth)),
      role: readRole(AppCore, Auth),
    };
  } catch (error) {
    warn(AppCore, "restoreSessionInBackground() falló.", error);

    await runSyncUserUI({ AppCore, Auth, Router, syncUserUI, reason: "restore-session-background-error" });

    return {
      ok: false,
      restored: false,
      authenticated: isAuthenticated(AppCore, Auth),
      error: sanitize(error),
      navigationHandled: false,
      navigated: false,
      redirected: false,
      routeChanged: false,
    };
  }
}

/* =========================================================
   COMPAT
========================================================= */

export async function navigateAfterSessionRestore() {
  return false;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSessionBootstrapSnapshot({ AppCore, Auth = null, Router = null, state } = {}) {
  return sanitize({
    version: SESSION_VERSION,
    restoring: Boolean(restorePromise || state?.sessionRestorePromise),
    authenticated: isAuthenticated(AppCore, Auth),
    currentCanonicalPath: currentCanonicalPath(AppCore, Router),
    currentPublicPath: currentPublicPath(AppCore, Router),
    protectedInitialPublicPath: protectedInitialPath(AppCore),
    publicTechnicalBoot: publicTechnicalBoot(AppCore, Router),
    bootNavigationHandled: Boolean(state?.bootNavigationHandled || AppCore?.state?.bootNavigationHandled),
    initialRouteRendered: Boolean(state?.initialRouteRendered || AppCore?.state?.initialRouteRendered),
    route: AppCore?.state?.route || "/",
    publicPath: AppCore?.state?.publicPath || "/",
    policy: {
      wrapperOnly: true,
      ownFetch: false,
      ownHttp: false,
      ownStorage: false,
      ownSessionApply: false,
      ownRefresh: false,
      ownRouterNavigation: false,
      ownToast: false,
      routeEvents: false,
    },
  });
}

export default {
  SESSION_VERSION,

  navigateAfterSessionRestore,
  restoreAuthSession,
  restoreSessionInBackground,
  getSessionBootstrapSnapshot,
};
