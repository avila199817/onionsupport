/* =========================================================
   Onion SPA - Auth Logout
   Archivo: src/features/auth/logout.js

   RESPONSABILIDADES:
   - cerrar sesión local y remota
   - invalidar refresh/session context si backend existe
   - limpiar estado AppCore
   - limpiar storage auth legacy/namespaced
   - redirigir de forma segura
   - emitir eventos auth lifecycle
   - tolerar fallo de red sin bloquear logout local

   HARDENING EXTREMO:
   - anti doble logout concurrente
   - timeout remoto real
   - navegación robusta Router/AppCore/browser
   - snapshot consistente sin tokens en eventos
   - no romper UI si backend falla
   - clear local garantizado
   - cero throws accidentales
   - soporte logout silencioso
   - soporte skip remote
   - soporte await Router.navigate()
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
} from "./constants.js";

import {
  extractMessage,
  normalizePath,
  normalizeCanonicalPath,
  isSafeRelativePath,
  redactTokenInText,
} from "./helpers.js";

import {
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
} from "./storage.js";

import {
  clearSessionLocal,
  buildSessionSnapshot,
} from "./session.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let logoutPromise = null;
let logoutSequence = 0;

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_LOGOUT_TIMEOUT_MS = 6000;
const DEFAULT_LOGIN_PATH = "/login";

const KNOWN_AUTH_STORAGE_KEYS = Object.freeze([
  "onion_token",
  "onion_access_token",
  "onion_refresh_token",
  "onion_temp_token",
  "onion_session_id",
  "onion_session_user_id",
  "onion_user_id",
  "onion_user_name",
  "onion_role",

  "onion:token",
  "onion:user",
  "onion:access_token",
  "onion:refresh_token",
  "onion:temp_token",
  "onion:session_id",
  "onion:session_user_id",
  "onion:user_name",
  "onion:role",

  "auth_token",
  "access_token",
  "refresh_token",
  "temp_token",
  "temporary_token",
  "two_factor_token",
  "mfa_token",
  "token",
  "session",
  "user",
]);

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const text =
    safeText(value, "").toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "si",
      "sí",
      "ok",
    ].includes(text)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
    ].includes(text)
  ) {
    return false;
  }

  return Boolean(fallback);
}

function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function safeObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthLogout]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AuthLogout]",
      ...args
    );
  } catch {}
}

function safeSetError(error = null) {
  try {
    AppCore?.setError?.(error);
  } catch {}
}

function redactSafe(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(
        /([?&](?:token|activationToken|activateToken|resetToken|passwordResetToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  }
}

function sanitizeSnapshot(snapshot = {}) {
  const source =
    safeObject(snapshot);

  const user =
    safeObject(source.user);

  return {
    authenticated:
      Boolean(source.authenticated),

    hasToken:
      Boolean(
        source.token ||
        source.accessToken ||
        source.access_token
      ),

    user:
      source.user
        ? {
            id:
              user.id ??
              user.userId ??
              user.user_id ??
              user._id ??
              null,
            userId:
              user.userId ??
              user.id ??
              user.user_id ??
              user._id ??
              null,
            username:
              user.username ||
              user.userName ||
              user.slug ||
              null,
            email:
              user.email || null,
            role:
              user.role ||
              user.rol ||
              null,
          }
        : null,

    role:
      source.role ||
      source.user?.role ||
      source.user?.rol ||
      null,

    username:
      source.username ||
      source.user?.username ||
      source.user?.email ||
      null,

    currentResolvedUsername:
      source.currentResolvedUsername ||
      null,

    route:
      redactSafe(source.route || ""),

    publicPath:
      redactSafe(source.publicPath || ""),

    cause:
      source.cause || null,
  };
}

function sanitizeError(error = null) {
  if (!error) {
    return null;
  }

  return {
    name:
      error?.name || "Error",

    message:
      extractMessage(error),

    status:
      error?.status || 0,

    code:
      error?.code ||
      error?.data?.code ||
      null,
  };
}

function safeEmit(eventName, payload = {}) {
  const cleanPayload = {
    ...safeObject(payload),
  };

  if (cleanPayload.before) {
    cleanPayload.before =
      sanitizeSnapshot(cleanPayload.before);
  }

  if (cleanPayload.after) {
    cleanPayload.after =
      sanitizeSnapshot(cleanPayload.after);
  }

  if (cleanPayload.error) {
    cleanPayload.error =
      sanitizeError(cleanPayload.error);
  }

  if (cleanPayload.redirectTo) {
    cleanPayload.redirectTo =
      redactSafe(cleanPayload.redirectTo);
  }

  try {
    AppCore?.events?.emit?.(
      eventName,
      cleanPayload
    );
  } catch {}

  try {
    window?.AppCore?.events?.emit?.(
      eventName,
      cleanPayload
    );
  } catch {}
}

/* =========================================================
   RESOLUTION
========================================================= */

function resolveLogoutEndpoint() {
  return safeText(
    AUTH_ENDPOINTS?.logout,
    "/api/auth/logout"
  );
}

function resolveLoginPath() {
  const configured =
    safeText(
      AppCore?.config?.routes?.login,
      DEFAULT_LOGIN_PATH
    );

  const normalized =
    normalizePath(configured || DEFAULT_LOGIN_PATH);

  return isSafeRelativePath(normalized)
    ? normalized
    : DEFAULT_LOGIN_PATH;
}

function resolveRedirect(target = "") {
  const fallback =
    resolveLoginPath();

  const candidate =
    normalizePath(
      safeText(target || fallback, fallback)
    );

  if (isSafeRelativePath(candidate)) {
    return candidate;
  }

  return fallback;
}

function buildLogoutBody() {
  return {
    refreshToken:
      safeText(getStoredRefreshToken(), ""),

    sessionId:
      safeText(getStoredSessionId(), ""),

    userId:
      safeText(getStoredSessionUserId(), ""),
  };
}

function getRouter() {
  try {
    return (
      AppCore?.modules?.get?.("router") ||
      AppCore?.modules?.get?.("Router") ||
      AppCore?.router ||
      AppCore?.Router ||
      null
    );
  } catch {
    return (
      AppCore?.router ||
      AppCore?.Router ||
      null
    );
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

function updateCoreRouteState(path = DEFAULT_LOGIN_PATH) {
  const publicPath =
    resolveRedirect(path);

  const canonicalPath =
    normalizeCanonicalPath(publicPath);

  try {
    AppCore?.setRoute?.(canonicalPath);
  } catch {}

  try {
    AppCore?.setPublicPath?.(publicPath);
  } catch {}

  try {
    AppCore?.setState?.({
      route:
        canonicalPath,
      publicPath,
    });
  } catch {
    try {
      if (AppCore?.state) {
        AppCore.state.route =
          canonicalPath;
        AppCore.state.publicPath =
          publicPath;
      }
    } catch {}
  }
}

async function navigateTo(path = DEFAULT_LOGIN_PATH, options = {}) {
  const finalPath =
    resolveRedirect(path);

  const replaceState =
    options.replaceState !== false;

  const force =
    options.force !== false;

  const hardRedirect =
    options.hardRedirect === true;

  if (!hardRedirect) {
    try {
      const router =
        getRouter();

      if (isFunction(router?.navigate)) {
        const result =
          router.navigate(
            finalPath,
            {
              replaceState,
              force,
            }
          );

        if (
          result &&
          isFunction(result.then)
        ) {
          await result;
        }

        updateCoreRouteState(finalPath);

        return {
          ok: true,
          reason: "router",
          path: finalPath,
        };
      }

      if (isFunction(router?.go)) {
        const result =
          router.go(
            finalPath,
            {
              replaceState,
              force,
            }
          );

        if (
          result &&
          isFunction(result.then)
        ) {
          await result;
        }

        updateCoreRouteState(finalPath);

        return {
          ok: true,
          reason: "router-go",
          path: finalPath,
        };
      }
    } catch (error) {
      safeWarn(
        "Router logout navigation falló.",
        error
      );
    }

    try {
      if (isFunction(AppCore?.navigate)) {
        const result =
          AppCore.navigate(finalPath);

        if (
          result &&
          isFunction(result.then)
        ) {
          await result;
        }

        updateCoreRouteState(finalPath);

        return {
          ok: true,
          reason: "appcore-navigate",
          path: finalPath,
        };
      }
    } catch (error) {
      safeWarn(
        "AppCore.navigate logout falló.",
        error
      );
    }
  }

  if (isBrowser()) {
    try {
      if (replaceState) {
        window.location.replace(finalPath);
      } else {
        window.location.assign(finalPath);
      }

      return {
        ok: true,
        reason: "browser",
        path: finalPath,
      };
    } catch {
      try {
        window.location.href =
          finalPath;

        return {
          ok: true,
          reason: "browser-href",
          path: finalPath,
        };
      } catch {}
    }
  }

  return {
    ok: false,
    reason: "navigation-failed",
    path: finalPath,
  };
}

/* =========================================================
   TIMEOUT FETCH
========================================================= */

async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_LOGOUT_TIMEOUT_MS) {
  const controller =
    typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

  const timer =
    controller
      ? setTimeout(() => {
          try {
            controller.abort("logout-timeout");
          } catch {
            controller.abort();
          }
        }, timeout)
      : null;

  try {
    return await fetch(url, {
      ...options,
      signal:
        controller?.signal,
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/* =========================================================
   REMOTE LOGOUT
========================================================= */

async function requestRemoteLogout(options = {}) {
  const endpoint =
    resolveLogoutEndpoint();

  const body =
    buildLogoutBody();

  const timeout =
    safeNumber(
      options.timeout,
      DEFAULT_LOGOUT_TIMEOUT_MS
    );

  const auth =
    options.auth !== false;

  if (
    typeof AppCore?.apiClient?.post === "function"
  ) {
    return AppCore.apiClient.post(
      endpoint,
      body,
      {
        auth,
        timeout,
        silent:
          true,
        emitEvents:
          options.emitRequestEvents === true,
        storeError:
          false,
        expectedStatuses:
          [401, 403, 404],
      }
    );
  }

  if (
    typeof AppCore?.request === "function"
  ) {
    return AppCore.request(
      endpoint,
      {
        method:
          "POST",
        auth,
        body,
        timeout,
        silent:
          true,
        emitEvents:
          options.emitRequestEvents === true,
        storeError:
          false,
        expectedStatuses:
          [401, 403, 404],
      }
    );
  }

  if (
    typeof fetch === "function"
  ) {
    const response =
      await fetchWithTimeout(
        endpoint,
        {
          method:
            "POST",
          headers: {
            Accept:
              "application/json",
            "Content-Type":
              "application/json",
          },
          credentials:
            "same-origin",
          body:
            JSON.stringify(body),
        },
        timeout
      );

    return {
      ok:
        response?.ok === true ||
        [401, 403, 404].includes(response?.status),
      status:
        response?.status || 0,
    };
  }

  return null;
}

/* =========================================================
   LOCAL CLEAR
========================================================= */

function clearKnownAuthStorage() {
  if (!isBrowser()) {
    return false;
  }

  let changed = false;

  for (const key of KNOWN_AUTH_STORAGE_KEYS) {
    try {
      window.localStorage?.removeItem?.(key);
      changed = true;
    } catch {}

    try {
      window.sessionStorage?.removeItem?.(key);
      changed = true;
    } catch {}
  }

  return changed;
}

function clearAppCoreSessionState(reason = "logout") {
  try {
    AppCore?.clearSession?.();
  } catch {}

  try {
    AppCore?.session?.clear?.();
  } catch {}

  try {
    AppCore?.setState?.({
      authenticated:
        false,
      hasToken:
        false,

      user:
        null,
      currentUser:
        null,
      authUser:
        null,
      sessionUser:
        null,

      role:
        null,
      userRole:
        null,

      token:
        null,
      accessToken:
        null,

      session:
        null,
      sessionId:
        null,

      loginInProgress:
        false,
      twoFactorPending:
        false,

      lastAuthSource:
        reason,
    });
  } catch {
    try {
      if (AppCore?.state) {
        AppCore.state.authenticated = false;
        AppCore.state.hasToken = false;
        AppCore.state.user = null;
        AppCore.state.currentUser = null;
        AppCore.state.authUser = null;
        AppCore.state.sessionUser = null;
        AppCore.state.role = null;
        AppCore.state.userRole = null;
        AppCore.state.token = null;
        AppCore.state.accessToken = null;
        AppCore.state.session = null;
        AppCore.state.sessionId = null;
        AppCore.state.loginInProgress = false;
        AppCore.state.twoFactorPending = false;
        AppCore.state.lastAuthSource = reason;
      }
    } catch {}
  }

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  return true;
}

function clearLocalSessionGuaranteed(options = {}) {
  const reason =
    safeText(options.reason, "logout");

  try {
    clearSessionLocal({
      silent:
        options.silent === true,
      reason,
    });
  } catch {
    try {
      clearSessionLocal();
    } catch {}
  }

  clearAppCoreSessionState(reason);
  clearKnownAuthStorage();
  safeSetError(null);

  safeEmit(
    "app:ui:repair-request",
    {
      reason:
        "logout-local-clear",
      source:
        "auth.logout",
      authenticated:
        false,
      user:
        null,
      role:
        null,
    }
  );

  return true;
}

/* =========================================================
   CORE ACTION
========================================================= */

async function executeLogout(options = {}) {
  const sequence =
    ++logoutSequence;

  const opts =
    safeObject(options);

  const {
    redirectTo = "",
    navigate = true,
    remote = true,
    silent = false,
    hardRedirect = false,
  } = opts;

  const before =
    buildSessionSnapshot();

  safeEmit(
    "auth:logout:start",
    {
      sequence,
      authenticated:
        Boolean(before?.authenticated),
      user:
        before?.user || null,
      source:
        "auth.logout",
    }
  );

  let remoteError = null;
  let remoteResult = null;

  if (safeBool(remote, true)) {
    try {
      remoteResult =
        await requestRemoteLogout(opts);

      safeEmit(
        "auth:logout:remote-success",
        {
          sequence,
          status:
            remoteResult?.status || null,
          source:
            "auth.logout",
        }
      );
    } catch (error) {
      remoteError =
        error;

      safeWarn(
        "Logout remoto falló; logout local continuará.",
        error
      );

      safeEmit(
        "auth:logout:remote-error",
        {
          sequence,
          error,
          message:
            extractMessage(error),
          source:
            "auth.logout",
        }
      );
    }
  } else {
    safeEmit(
      "auth:logout:remote-skipped",
      {
        sequence,
        reason:
          "remote-disabled",
        source:
          "auth.logout",
      }
    );
  }

  /*
    Clear local SIEMPRE.
    Aunque backend falle, el cliente no debe quedar logueado.
  */
  clearLocalSessionGuaranteed({
    silent,
    reason:
      "logout",
  });

  const after =
    buildSessionSnapshot();

  const finalRedirect =
    safeBool(navigate, true)
      ? resolveRedirect(redirectTo)
      : null;

  let navigation = null;

  safeEmit(
    "auth:logout:success",
    {
      sequence,
      hadSession:
        Boolean(before?.authenticated),
      remoteOk:
        !remoteError,
      before,
      after,
      redirectTo:
        finalRedirect,
      source:
        "auth.logout",
    }
  );

  /*
    Alias legacy/compat.
    index.js escucha auth:logout en algunos flujos.
  */
  safeEmit(
    "auth:logout",
    {
      sequence,
      hadSession:
        Boolean(before?.authenticated),
      remoteOk:
        !remoteError,
      redirectTo:
        finalRedirect,
      source:
        "auth.logout",
    }
  );

  safeEmit(
    "app:session:cleared",
    {
      sequence,
      reason:
        "logout",
      authenticated:
        false,
      user:
        null,
      role:
        null,
      source:
        "auth.logout",
    }
  );

  if (
    safeBool(navigate, true) &&
    finalRedirect
  ) {
    navigation =
      await navigateTo(
        finalRedirect,
        {
          replaceState:
            true,
          force:
            true,
          hardRedirect:
            Boolean(hardRedirect),
        }
      );

    safeEmit(
      "auth:logout:navigated",
      {
        sequence,
        navigation,
        redirectTo:
          finalRedirect,
        source:
          "auth.logout",
      }
    );
  }

  return {
    ok:
      true,
    remoteOk:
      !remoteError,
    remoteStatus:
      remoteResult?.status || null,
    error:
      remoteError || null,
    before:
      sanitizeSnapshot(before),
    after:
      sanitizeSnapshot(after),
    redirectTo:
      finalRedirect,
    navigation,
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function logout(options = {}) {
  if (logoutPromise) {
    return logoutPromise;
  }

  logoutPromise =
    (async () => {
      try {
        return await executeLogout(options);
      } finally {
        logoutPromise = null;
      }
    })();

  return logoutPromise;
}

/* =========================================================
   DEBUG
========================================================= */

export function getLogoutSnapshot() {
  return {
    inFlight:
      Boolean(logoutPromise),

    sequence:
      logoutSequence,

    endpoint:
      resolveLogoutEndpoint(),

    loginPath:
      resolveLoginPath(),

    authenticated:
      Boolean(AppCore?.state?.authenticated),

    hasToken:
      Boolean(
        AppCore?.state?.token ||
        AppCore?.state?.accessToken
      ),

    route:
      redactSafe(AppCore?.state?.route || ""),

    publicPath:
      redactSafe(AppCore?.state?.publicPath || ""),
  };
}

export default logout;
