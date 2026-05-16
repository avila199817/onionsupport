/* =========================================================
   Onion SPA - App Session Bootstrap
   Archivo: src/app/session.js

   APP SESSION · FINAL SIMPLE
   - Puente boot ↔ Auth
   - Auth hace el restore real
   - App sólo pasa flags de boot y sincroniza UI
   - No fetch, CoreHttp directo, storage directo ni sesión paralela
   - No applySession propio, refresh propio ni navegación agresiva
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

import {
  getProtectedInitialPublicPath,
  redactTokenInText,
} from "../router/helpers.js";

import {
  isPublicTechnicalRoute,
} from "../features/auth/helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const SESSION_VERSION = "20.0.0-final";

const SOURCE = "app.session";

const EVENTS = Object.freeze({
  restoreStart: "app:session:restore:start",
  restoreDone: "app:session:restore:done",
  restoreError: "app:session:restore:error",
  authRestored: "auth:session:restored",
  appRestored: "app:session:restored",
  userChange: "app:user:change",
  uiRepairRequest: "app:ui:repair-request",
});

/* =========================================================
   RUNTIME
========================================================= */

let restorePromise = null;
let lastReadyKey = "";
let lastReadyAt = 0;

const READY_DEDUPE_MS = 160;

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

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

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
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
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = sanitize(item, depth + 1, key);
    }

    return output;
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

function publicTechnicalBoot(AppCore, Router) {
  const protectedPath = protectedInitialPath(AppCore);
  const publicPath = currentPublicPath(AppCore, Router);
  const canonicalPath = currentCanonicalPath(AppCore, Router);

  return Boolean(
    protectedPath ||
      isPublicTechnicalRoute(publicPath) ||
      isPublicTechnicalRoute(canonicalPath) ||
      isPublicTechnicalRoute(AppCore?.state?.bootProtectedInitialPublicPath) ||
      isPublicTechnicalRoute(AppCore?.state?.bootProtectedInitialPath)
  );
}

function isAuthenticated(AppCore, Auth) {
  try {
    if (isFn(Auth?.isAuthenticated)) return Boolean(Auth.isAuthenticated());
  } catch {}

  return Boolean(AppCore?.state?.authenticated);
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

  return AppCore?.state?.role || AppCore?.state?.rol || AppCore?.state?.userRole || readUser(AppCore, Auth)?.role || null;
}

/* =========================================================
   UI / READY
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

  emit(AppCore, EVENTS.uiRepairRequest, {
    reason,
    authenticated: isAuthenticated(AppCore, Auth),
    user: readUser(AppCore, Auth),
    role: readRole(AppCore, Auth),
    repairShell: false,
    hardRepair: false,
    rebind: false,
  });

  return true;
}

function readyPayload({ AppCore, Auth, Router, reason = "session-ready", result = {} } = {}) {
  return {
    reason,
    ok: Boolean(result?.ok) || isAuthenticated(AppCore, Auth),
    restored: Boolean(result?.restored) || Boolean(result?.ok) || isAuthenticated(AppCore, Auth),
    authenticated: isAuthenticated(AppCore, Auth),
    user: readUser(AppCore, Auth),
    role: readRole(AppCore, Auth),
    route: currentCanonicalPath(AppCore, Router),
    publicPath: currentPublicPath(AppCore, Router),
    navigationHandled: Boolean(result?.navigationHandled || result?.navigated || result?.redirected),
    navigated: Boolean(result?.navigated || result?.navigationHandled),
    redirected: Boolean(result?.redirected || result?.navigationHandled),
    routeChanged: Boolean(result?.routeChanged),
    at: iso(),
  };
}

function emitReadyEvents({ AppCore, Auth, Router, reason = "session-ready", result = {}, dedupe = true } = {}) {
  const payload = readyPayload({ AppCore, Auth, Router, reason, result });
  const key = [
    payload.authenticated ? "auth" : "anon",
    text(payload.role, ""),
    text(payload.route, ""),
    text(payload.publicPath, ""),
    payload.navigationHandled ? "nav" : "no-nav",
  ].join("|");

  const stamp = now();

  if (dedupe && key === lastReadyKey && stamp - lastReadyAt < READY_DEDUPE_MS) return payload;

  lastReadyKey = key;
  lastReadyAt = stamp;

  emit(AppCore, EVENTS.authRestored, payload);
  emit(AppCore, EVENTS.appRestored, payload);
  emit(AppCore, EVENTS.userChange, payload);
  emit(AppCore, EVENTS.uiRepairRequest, { ...payload, repairShell: false, hardRepair: false, rebind: false });

  return payload;
}

/* =========================================================
   AUTH RESTORE
========================================================= */

function restoreOptions({ publicRoute = false, skipNavigation = true } = {}) {
  return {
    silent: true,

    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
    skipPostRestoreNavigation: true,

    preserveCurrentRoute: publicRoute || skipNavigation,
    preserveRoute: publicRoute || skipNavigation,
    preservePublicPath: publicRoute || skipNavigation,
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

function cleanResult(result = {}) {
  const payload = sanitize(object(result));
  return object(payload);
}

export async function restoreAuthSession({
  AppCore,
  Auth,
  Router,
  syncUserUI,
  state,
  emitReady = true,
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
    });

    try {
      if (!Auth || (!isFn(Auth.restoreSession) && !isFn(Auth.restore) && !isFn(Auth.restoreSessionInBackground) && !isFn(Auth.session?.restore))) {
        if (syncUi) await runSyncUserUI({ AppCore, Auth, Router, syncUserUI, reason: "auth-module-missing" });

        return {
          ok: false,
          restored: false,
          reason: "auth-module-missing",
          authenticated: isAuthenticated(AppCore, Auth),
          navigationHandled: false,
        };
      }

      const result = await Promise.resolve(callAuthRestore(Auth, restoreOptions({ publicRoute, skipNavigation })));
      const cleaned = cleanResult(result);

      if (syncUi) await runSyncUserUI({ AppCore, Auth, Router, syncUserUI, reason: "restore-auth-session" });
      if (emitReady) emitReadyEvents({ AppCore, Auth, Router, reason: "restore-auth-session", result: cleaned });

      const finalResult = {
        ...cleaned,
        ok: Boolean(cleaned.ok) || isAuthenticated(AppCore, Auth),
        restored: Boolean(cleaned.restored) || Boolean(cleaned.ok) || isAuthenticated(AppCore, Auth),
        authenticated: isAuthenticated(AppCore, Auth),
        publicTechnicalBoot: publicRoute,
        navigationHandled: Boolean(cleaned.navigationHandled || cleaned.navigated || cleaned.redirected),
        navigated: Boolean(cleaned.navigated || cleaned.navigationHandled),
        redirected: Boolean(cleaned.redirected || cleaned.navigationHandled),
        routeChanged: Boolean(cleaned.routeChanged),
      };

      emit(AppCore, EVENTS.restoreDone, finalResult);
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
      emit(AppCore, EVENTS.restoreError, payload);

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
      emitReady: false,
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

    const finalResult = {
      ...cleanResult(result),
      ok: Boolean(result?.ok) || isAuthenticated(AppCore, Auth),
      restored: Boolean(result?.restored) || Boolean(result?.ok) || isAuthenticated(AppCore, Auth),
      authenticated: isAuthenticated(AppCore, Auth),
      publicTechnicalBoot: publicRoute,
      skipPostRestoreNavigation: skipNav,
      beforeCanonical,
      beforePublic,
      afterCanonical,
      afterPublic,
      navigationHandled: Boolean(result?.navigationHandled || result?.navigated || result?.redirected),
      navigated: Boolean(result?.navigated || result?.navigationHandled),
      redirected: Boolean(result?.redirected || result?.navigationHandled),
      routeChanged,
    };

    if (isAuthenticated(AppCore, Auth)) {
      emitReadyEvents({ AppCore, Auth, Router, reason: "restore-session-background-final", result: finalResult });
    }

    return finalResult;
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
   OPTIONAL COMPAT
========================================================= */

export async function navigateAfterSessionRestore() {
  return false;
}

/* =========================================================
   DEBUG
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
    },
  });
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  SESSION_VERSION,

  navigateAfterSessionRestore,
  restoreAuthSession,
  restoreSessionInBackground,
  getSessionBootstrapSnapshot,
};
