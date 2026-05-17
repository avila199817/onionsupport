/* =========================================================
   Onion Support - Auth Restore
   Archivo: /src/features/auth/restore.js

   Responsabilidad:
   - Restaurar sesión mínima.
   - Si hay token: pedir /api/auth/me.
   - Si /me devuelve user: aplicar sesión.
   - Si no hay token: limpiar sesión local.
   - Sin refresh automático.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin 2FA/MFA/OTP.
   - Sin rutas legacy.
   - Sin preserve-route complejo.
========================================================= */

import { AppCore } from "../../core/index.js";
import CoreHttp from "../../core/http.js";

import {
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  AUTH_ENDPOINTS,
} from "./constants.js";

import {
  normalizeAuthResponse,
} from "./normalize.js";

import {
  getStoredAccessToken,
} from "./storage.js";

import {
  applySession,
  clearSessionLocal,
  buildSessionSnapshot,
} from "./session.js";

export const RESTORE_VERSION = "simple";

const SOURCE = "auth.restore";

const runtimeSession = {
  restoring: false,
  checking: false,
  restorePromise: null,
  mePromise: null,
  lastRestoreAt: 0,
  lastMeAt: 0,
  lastError: null,
};

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

function nowIso() {
  return new Date().toISOString();
}

function readState() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function stripBearer(value = "") {
  return text(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;

  return !["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
    token.toLowerCase()
  );
}

function cleanToken(value = "") {
  return tokenOk(value) ? stripBearer(value) : "";
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function userOk(user = null) {
  if (!isObject(user)) return false;
  if (userDisabled(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.slug ||
      user.email
  );
}

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "").replace(/([?&#]token=)([^&#\s]+)/gi, "$1***");
  }
}

function emit(eventName = "", payload = {}, options = {}) {
  if (options.silent === true || options.emit === false || options.emitEvents === false) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: RESTORE_VERSION,
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
   ERRORS
========================================================= */

function createRestoreError(message = "No se pudo restaurar la sesión.", options = {}) {
  const error = new Error(redact(message));

  error.name = "AuthRestoreError";
  error.status = options.status || 401;
  error.statusCode = error.status;
  error.code = options.code || "AUTH_RESTORE_FAILED";

  return error;
}

function normalizeRestoreError(error) {
  if (error?.name === "AuthRestoreError") return error;

  const status =
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    0;

  return createRestoreError(extractMessage(error), {
    status: status || 500,
    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      "AUTH_RESTORE_FAILED",
  });
}

/* =========================================================
   STATE
========================================================= */

function getCurrentToken() {
  const state = readState();

  return cleanToken(
    state.token ||
      state.accessToken ||
      state.access_token ||
      state.session?.token ||
      state.session?.accessToken ||
      state.session?.access_token ||
      getStoredAccessToken() ||
      ""
  );
}

function getCurrentUser() {
  const state = readState();

  return (
    userOk(state.user) && state.user
  ) || (
    userOk(state.currentUser) && state.currentUser
  ) || (
    userOk(state.authUser) && state.authUser
  ) || (
    userOk(state.sessionUser) && state.sessionUser
  ) || (
    userOk(state.session?.user) && state.session.user
  ) || null;
}

function hasCompleteAuthState() {
  return Boolean(getCurrentToken() && getCurrentUser());
}

function getSession(sessionArg = null) {
  return isObject(sessionArg) &&
    ("restorePromise" in sessionArg || "mePromise" in sessionArg || "restoring" in sessionArg)
    ? sessionArg
    : runtimeSession;
}

function publicUser(user = null) {
  if (!userOk(user)) return null;

  return {
    id: user.id || user.userId || null,
    userId: user.userId || user.id || null,
    username: user.username || user.slug || null,
    displayName: user.displayName || user.name || user.username || null,
    role: user.role || user.rol || null,
    hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),
  };
}

function publicSnapshot(extra = {}) {
  const snapshot = (() => {
    try {
      return buildSessionSnapshot();
    } catch {
      return {};
    }
  })();

  const state = readState();
  const user = snapshot.user || getCurrentUser();

  return {
    version: RESTORE_VERSION,
    authenticated: Boolean(snapshot.authenticated || hasCompleteAuthState()),
    hasToken: Boolean(getCurrentToken()),
    hasUser: Boolean(userOk(user)),
    user: publicUser(user),
    role: snapshot.role || state.role || user?.role || null,
    route: redact(state.route || "/"),
    publicPath: redact(state.publicPath || "/"),
    token: null,
    accessToken: null,
    refreshToken: null,
    ...extra,
  };
}

/* =========================================================
   HTTP
========================================================= */

function meEndpoint() {
  return AUTH_ENDPOINTS?.me || "/api/auth/me";
}

async function apiMe(token = "", options = {}) {
  if (!tokenOk(token)) {
    throw createRestoreError("No hay token para restaurar sesión.", {
      status: 401,
      code: "TOKEN_MISSING",
    });
  }

  if (isFunction(CoreHttp?.me)) {
    return CoreHttp.me({
      ...options,
      token,
      auth: true,
      public: false,
      skipAuth: false,
      cache: "no-store",
    });
  }

  return CoreHttp.get(meEndpoint(), {
    ...options,
    token,
    auth: true,
    public: false,
    skipAuth: false,
    cache: "no-store",
  });
}

/* =========================================================
   /ME
========================================================= */

export async function fetchMe(sessionArg = runtimeSession, options = {}) {
  const session = getSession(sessionArg);

  if (session.mePromise) return session.mePromise;

  const token = getCurrentToken();

  if (!tokenOk(token)) {
    throw createRestoreError("No hay token para /me.", {
      status: 401,
      code: "TOKEN_MISSING",
    });
  }

  session.checking = true;

  emit("auth:me:start", {
    hasToken: true,
  }, options);

  session.mePromise = (async () => {
    try {
      const response = await apiMe(token, options);

      const normalized = normalizeAuthResponse(response, {
        mode: "me",
        allowUserOnly: true,
        requireUser: true,
      });

      const user =
        normalized.user ||
        normalized.me ||
        normalized.usuario ||
        null;

      if (!userOk(user)) {
        throw createRestoreError("No se pudo resolver usuario válido desde /me.", {
          status: 401,
          code: "ME_USER_MISSING",
        });
      }

      const snapshot = applySession(
        {
          ...normalized,
          token,
          accessToken: token,
          access_token: token,
          user,
          me: user,
          usuario: user,
          source: SOURCE,
          eventMode: "restore",
        },
        {
          source: SOURCE,
          eventMode: "restore",
          silent: true,
          emit: false,
        }
      );

      session.lastMeAt = Date.now();
      session.lastError = null;

      emit("auth:me:success", publicSnapshot({
        user: publicUser(user),
      }), options);

      return {
        ok: true,
        user,
        snapshot,
      };
    } catch (error) {
      const finalError = normalizeRestoreError(error);

      session.lastError = {
        type: "me",
        message: finalError.message,
        status: finalError.status || 0,
        code: finalError.code || null,
        at: nowIso(),
      };

      emit("auth:me:error", {
        message: finalError.message,
        status: finalError.status || 0,
        code: finalError.code || null,
      }, options);

      throw finalError;
    } finally {
      session.checking = false;
      session.mePromise = null;
    }
  })();

  return session.mePromise;
}

/* =========================================================
   REFRESH COMPAT
   No refresh automático en restore mínimo.
========================================================= */

export async function refreshSession() {
  throw createRestoreError("Refresh automático desactivado en restore mínimo.", {
    status: 400,
    code: "REFRESH_DISABLED",
  });
}

export async function restoreUsingMe(sessionArg = runtimeSession, options = {}) {
  const result = await fetchMe(sessionArg, options);

  return {
    ok: true,
    user: result.user,
    source: "me",
  };
}

export async function restoreUsingRefreshOnly() {
  return refreshSession();
}

export async function restoreUsingRefreshPreferred() {
  return refreshSession();
}

export async function restoreAfterMeFailure(_sessionArg, error, options = {}) {
  const finalError = normalizeRestoreError(error);

  if (finalError.status === 401 || finalError.status === 403) {
    try {
      clearSessionLocal({
        source: SOURCE,
        silent: true,
      });
    } catch {
      // noop
    }
  }

  return {
    ok: false,
    user: null,
    error: finalError,
    protectedRoute: false,
    source: "me-failed",
    options,
  };
}

/* =========================================================
   RESTORE SESSION
========================================================= */

function resolveArgs(...args) {
  if (isObject(args[0]) && ("restorePromise" in args[0] || "mePromise" in args[0] || "restoring" in args[0])) {
    return {
      session: args[0],
      options: isObject(args[1]) ? args[1] : {},
    };
  }

  return {
    session: runtimeSession,
    options: isObject(args[0]) ? args[0] : {},
  };
}

export async function restoreSession(...args) {
  const { session, options } = resolveArgs(...args);

  if (session.restorePromise) return session.restorePromise;

  session.restoring = true;

  emit("auth:restore:start", {
    hasToken: Boolean(getCurrentToken()),
    hasUser: Boolean(getCurrentUser()),
  }, options);

  session.restorePromise = (async () => {
    try {
      if (hasCompleteAuthState()) {
        session.lastRestoreAt = Date.now();
        session.lastError = null;

        const snapshot = publicSnapshot({
          source: "state",
        });

        emit("auth:restore:success", snapshot, options);

        return {
          ok: true,
          user: getCurrentUser(),
          source: "state",
        };
      }

      const token = getCurrentToken();

      if (!tokenOk(token)) {
        try {
          clearSessionLocal({
            source: SOURCE,
            silent: true,
          });
        } catch {
          // noop
        }

        emit("auth:restore:empty", {
          reason: "missing-token",
        }, options);

        return {
          ok: false,
          user: null,
          source: "empty",
        };
      }

      const result = await restoreUsingMe(session, options);

      session.lastRestoreAt = Date.now();
      session.lastError = null;

      emit("auth:restore:success", publicSnapshot({
        source: "me",
      }), options);

      return result;
    } catch (error) {
      const finalError = normalizeRestoreError(error);

      session.lastError = {
        type: "restore",
        message: finalError.message,
        status: finalError.status || 0,
        code: finalError.code || null,
        at: nowIso(),
      };

      if (finalError.status === 401 || finalError.status === 403) {
        try {
          clearSessionLocal({
            source: SOURCE,
            silent: true,
          });
        } catch {
          // noop
        }
      }

      emit("auth:restore:error", {
        message: finalError.message,
        status: finalError.status || 0,
        code: finalError.code || null,
      }, options);

      return {
        ok: false,
        user: null,
        error: finalError,
        source: "error",
      };
    } finally {
      session.restoring = false;
      session.restorePromise = null;
    }
  })();

  return session.restorePromise;
}

export const restoreSessionInBackground = restoreSession;

/* =========================================================
   SNAPSHOT
========================================================= */

export function getRestoreSnapshot(sessionArg = runtimeSession) {
  const session = getSession(sessionArg);

  return {
    version: RESTORE_VERSION,

    restoring: Boolean(session.restoring),
    checking: Boolean(session.checking),

    hasRestorePromise: Boolean(session.restorePromise),
    hasMePromise: Boolean(session.mePromise),

    lastRestoreAt: session.lastRestoreAt || 0,
    lastMeAt: session.lastMeAt || 0,
    lastError: session.lastError || null,

    authenticated: hasCompleteAuthState(),
    hasToken: Boolean(getCurrentToken()),
    hasUser: Boolean(getCurrentUser()),

    user: publicUser(getCurrentUser()),

    route: redact(readState().route || "/"),
    publicPath: redact(readState().publicPath || "/"),

    transport: {
      hasCoreHttp: Boolean(CoreHttp?.request || CoreHttp?.me || CoreHttp?.get),
      me: meEndpoint(),
    },

    policy: {
      ownFetch: false,
      ownApiClient: false,
      ownRouter: false,
      ownToast: false,
      noRefreshAuto: true,
      restoreUsesMeOnly: true,
      authenticatedRequiresTokenAndUser: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  RESTORE_VERSION,

  fetchMe,
  refreshSession,

  restoreUsingMe,
  restoreUsingRefreshOnly,
  restoreUsingRefreshPreferred,
  restoreAfterMeFailure,

  restoreSession,
  restoreSessionInBackground,

  getRestoreSnapshot,
};
