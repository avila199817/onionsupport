/* =========================================================
   Onion Support - Auth Logout
   Archivo: /src/features/auth/logout.js

   Responsabilidad:
   - Logout remoto best-effort vía CoreHttp.
   - Limpieza local garantizada vía session.js.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin DOM hacks.
   - Sin refresh.
   - Sin navegación.
   - Sin storage.clear().
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import CoreHttp from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
} from "./constants.js";

import {
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  clearSessionLocal,
  buildSessionSnapshot,
} from "./session.js";

export const AUTH_LOGOUT_VERSION = "simple";

const SOURCE = "auth.logout";

let logoutPromise = null;
let logoutSequence = 0;

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

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "").replace(/([?&#]token=)([^&#\s]+)/gi, "$1***");
  }
}

function statusOf(value = null) {
  return Number(
    value?.status ||
      value?.statusCode ||
      value?.response?.status ||
      value?.data?.status ||
      0
  );
}

function publicError(error = null) {
  if (!error) return null;

  return {
    name: error.name || "Error",
    message: redact(extractMessage(error) || error.message || String(error)),
    status: statusOf(error),
    code: error.code || error.data?.code || error.response?.data?.code || null,
  };
}

function publicUser(user = null) {
  if (!isObject(user)) return null;

  return {
    id: user.id || user.userId || null,
    userId: user.userId || user.id || null,
    username: user.username || user.slug || null,
    displayName: user.displayName || user.name || user.username || null,
    role: user.role || user.rol || null,
  };
}

function safeSessionSnapshot(extra = {}) {
  try {
    return {
      ...buildSessionSnapshot(extra),
      token: null,
      accessToken: null,
      refreshToken: null,
    };
  } catch {
    const state = readState();
    const user = state.user || state.currentUser || null;

    return {
      authenticated: Boolean(state.authenticated),
      hasToken: Boolean(state.hasToken || state.token || state.accessToken),
      token: null,
      accessToken: null,
      refreshToken: null,
      user: publicUser(user),
      role: state.role || user?.role || null,
      roles: Array.isArray(state.roles) ? state.roles : [],
      route: redact(state.route || "/"),
      publicPath: redact(state.publicPath || "/"),
      ...extra,
    };
  }
}

function emit(eventName = "", payload = {}, options = {}) {
  if (options.silent === true || options.emit === false || options.emitEvents === false) {
    return false;
  }

  const name = text(eventName, "");

  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, {
      source: SOURCE,
      version: AUTH_LOGOUT_VERSION,
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
   REMOTE LOGOUT
========================================================= */

function logoutEndpoint() {
  return AUTH_ENDPOINTS?.logout || "/api/auth/logout";
}

function alreadyLoggedOutStatus(status = 0) {
  return status === 401 || status === 403 || status === 404;
}

async function remoteLogout(options = {}) {
  if (options.remote === false || options.skipRemote === true || options.localOnly === true) {
    return {
      ok: true,
      skipped: true,
      status: 0,
      transport: "disabled",
    };
  }

  const requestOptions = {
    ...options,
    auth: true,
    public: false,
    skipAuth: false,
    storeError: false,
    retries: 0,
    cache: "no-store",
  };

  try {
    let result = null;

    if (isFunction(CoreHttp?.logout)) {
      result = await CoreHttp.logout(requestOptions);

      return {
        ok: true,
        skipped: false,
        status: statusOf(result),
        transport: "CoreHttp.logout",
      };
    }

    if (isFunction(CoreHttp?.post)) {
      result = await CoreHttp.post(logoutEndpoint(), {}, requestOptions);

      return {
        ok: true,
        skipped: false,
        status: statusOf(result),
        transport: "CoreHttp.post",
      };
    }

    if (isFunction(CoreHttp?.request)) {
      result = await CoreHttp.request(logoutEndpoint(), {
        ...requestOptions,
        method: "POST",
        body: {},
      });

      return {
        ok: true,
        skipped: false,
        status: statusOf(result),
        transport: "CoreHttp.request",
      };
    }

    return {
      ok: false,
      skipped: true,
      status: 0,
      transport: "missing-core-http",
    };
  } catch (error) {
    const status = statusOf(error);

    if (alreadyLoggedOutStatus(status)) {
      return {
        ok: true,
        skipped: false,
        status,
        transport: "CoreHttp",
        alreadyInvalid: true,
      };
    }

    return {
      ok: false,
      skipped: false,
      status,
      transport: "CoreHttp",
      error: publicError(error),
    };
  }
}

/* =========================================================
   LOCAL CLEAR
========================================================= */

function fallbackClearState() {
  try {
    AppCore?.setState?.(
      {
        authenticated: false,
        hasToken: false,

        token: null,
        accessToken: null,
        access_token: null,
        refreshToken: null,
        refresh_token: null,

        user: null,
        currentUser: null,
        authUser: null,
        sessionUser: null,
        account: null,
        profile: null,

        role: null,
        rol: null,
        userRole: null,
        roles: [],

        isAdmin: false,
        isSupport: false,
        isManager: false,
        isClient: false,

        session: null,
        sessionData: null,
        sessionId: null,
        sessionUserId: null,

        username: null,
        currentResolvedUsername: null,
        resolvedUsername: null,

        avatar: null,
        avatarUrl: null,

        loginInProgress: false,
        lastLogoutAt: nowIso(),
      },
      {
        source: SOURCE,
        silent: true,
        emit: false,
        forceUnauthenticated: true,
      }
    );
  } catch {
    try {
      Object.assign(readState(), {
        authenticated: false,
        hasToken: false,
        token: null,
        accessToken: null,
        access_token: null,
        user: null,
        currentUser: null,
        role: null,
        roles: [],
      });
    } catch {
      // noop
    }
  }
}

function clearLocal(options = {}) {
  try {
    clearSessionLocal({
      source: SOURCE,
      silent: true,
      reason: options.reason || "logout",
    });
  } catch {
    fallbackClearState();
  }

  try {
    CoreHttp?.clearAuthTokens?.();
  } catch {
    // noop
  }

  try {
    AppCore?.setLoading?.(false);
  } catch {
    // noop
  }

  try {
    AppCore?.setError?.(null);
  } catch {
    // noop
  }

  try {
    AppCore?.syncUserUI?.({
      source: SOURCE,
      reason: options.reason || "logout",
    });
  } catch {
    try {
      AppCore?.syncUserUI?.();
    } catch {
      // noop
    }
  }

  return true;
}

/* =========================================================
   LOGOUT
========================================================= */

export async function logout(options = {}) {
  if (logoutPromise) return logoutPromise;

  logoutPromise = (async () => {
    const sequence = ++logoutSequence;
    const startedAt = Date.now();
    const before = safeSessionSnapshot({
      cause: "logout",
    });

    emit("auth:logout:start", {
      sequence,
      before,
    }, options);

    let remote = {
      ok: true,
      skipped: true,
      status: 0,
      transport: "not-run",
    };

    try {
      remote = await remoteLogout(options);
    } catch (error) {
      remote = {
        ok: false,
        skipped: false,
        status: statusOf(error),
        transport: "CoreHttp",
        error: publicError(error),
      };
    }

    clearLocal({
      ...options,
      reason: "logout",
    });

    const after = safeSessionSnapshot({
      cause: "logout",
    });

    emit("auth:logout:success", {
      sequence,
      remoteOk: Boolean(remote.ok),
      remoteSkipped: Boolean(remote.skipped),
      remoteStatus: remote.status || 0,
      remoteTransport: remote.transport || "",
      before,
      after,
      durationMs: Date.now() - startedAt,
    }, options);

    emit("app:auth:change", {
      sequence,
      authenticated: false,
      user: null,
      role: null,
    }, options);

    return {
      ok: true,
      remoteOk: Boolean(remote.ok),
      remoteSkipped: Boolean(remote.skipped),
      remoteStatus: remote.status || 0,
      remoteTransport: remote.transport || "",
      before,
      after,
      durationMs: Date.now() - startedAt,
      sequence,
      version: AUTH_LOGOUT_VERSION,
    };
  })()
    .catch((error) => {
      clearLocal({
        ...options,
        reason: "logout-recovery",
      });

      emit("auth:logout:error", {
        error: publicError(error),
        message: extractMessage(error),
      }, options);

      return {
        ok: true,
        recovered: true,
        remoteOk: false,
        error: publicError(error),
        version: AUTH_LOGOUT_VERSION,
      };
    })
    .finally(() => {
      logoutPromise = null;
    });

  return logoutPromise;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getLogoutSnapshot() {
  const state = readState();

  return {
    version: AUTH_LOGOUT_VERSION,

    inFlight: Boolean(logoutPromise),
    sequence: logoutSequence,

    endpoint: logoutEndpoint(),

    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(state.hasToken || state.token || state.accessToken || state.access_token),

    token: null,
    accessToken: null,
    refreshToken: null,

    route: redact(state.route || "/"),
    publicPath: redact(state.publicPath || "/"),

    transport: {
      hasCoreHttp: Boolean(CoreHttp?.request || CoreHttp?.post || CoreHttp?.logout),
      coreLogout: Boolean(CoreHttp?.logout),
      corePost: Boolean(CoreHttp?.post),
    },

    policy: {
      remoteBestEffort: true,
      localClearGuaranteed: true,
      ownFetch: false,
      ownRouter: false,
      ownToast: false,
      ownStorageClearAll: false,
      navigation: false,
    },

    at: nowIso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default logout;
