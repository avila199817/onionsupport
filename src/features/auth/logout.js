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
   - Sin eventos propios.
   - Sin storage.clear().
   - Sin helpers externos.
   - Sin constants externos.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as CoreHttpModule from "../../core/http.js";

import {
  clearSessionLocal,
} from "./session.js";

export const AUTH_LOGOUT_VERSION = "auth.logout.v2";

const SOURCE = "auth.logout";
const LOGOUT_ENDPOINT = "/api/auth/logout";

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

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
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function readState() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function statusOf(value = null) {
  return Number(
    value?.status ||
      value?.statusCode ||
      value?.response?.status ||
      value?.data?.status ||
      0
  ) || 0;
}

function extractMessage(error = null) {
  return (
    text(error?.data?.message, "") ||
    text(error?.response?.data?.message, "") ||
    text(error?.message, "") ||
    String(error || "")
  );
}

function publicError(error = null) {
  if (!error) return null;

  return {
    name: error.name || "Error",
    message: redact(extractMessage(error)),
    status: statusOf(error),
    code: error.code || error.data?.code || error.response?.data?.code || null,
  };
}

/* =========================================================
   PUBLIC SNAPSHOT HELPERS
========================================================= */

function publicUser(user = null) {
  if (!isObject(user)) return null;

  return {
    id: user.id || user.userId || null,
    userId: user.userId || user.id || null,
    username: user.username || null,
    slug: user.slug || user.lookup?.slug || null,
    displayName: user.displayName || user.name || user.username || null,
    role: user.role || user.rol || null,
  };
}

function sessionSnapshot(extra = {}) {
  const state = readState();
  const user = state.user || state.currentUser || null;

  return {
    version: AUTH_LOGOUT_VERSION,

    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(
      state.hasToken ||
        state.token ||
        state.accessToken ||
        state.access_token
    ),

    token: null,
    accessToken: null,
    refreshToken: null,

    user: publicUser(user),

    userSlug: state.userSlug || user?.slug || user?.lookup?.slug || null,
    homePath: state.homePath || "/",
    defaultHome: state.defaultHome || state.homePath || "/",
    postLoginTarget: state.postLoginTarget || null,

    role: state.role || user?.role || null,
    roles: Array.isArray(state.roles) ? state.roles : [],

    route: redact(state.route || "/"),
    publicPath: redact(state.publicPath || "/"),

    ...extra,
  };
}

/* =========================================================
   REMOTE LOGOUT
========================================================= */

function alreadyLoggedOutStatus(status = 0) {
  return status === 401 || status === 403 || status === 404;
}

async function remoteLogout(options = {}) {
  if (
    options.remote === false ||
    options.skipRemote === true ||
    options.localOnly === true
  ) {
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
      result = await CoreHttp.post(LOGOUT_ENDPOINT, {}, requestOptions);

      return {
        ok: true,
        skipped: false,
        status: statusOf(result),
        transport: "CoreHttp.post",
      };
    }

    if (isFunction(CoreHttp?.request)) {
      result = await CoreHttp.request(LOGOUT_ENDPOINT, {
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
      transport: "missing-http",
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
  const patch = {
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

    userSlug: null,
    homePath: "/",
    defaultHome: "/",
    postLoginTarget: null,

    role: null,
    rol: null,
    userRole: null,
    roles: [],

    isAdmin: false,
    isUser: false,
    isSupport: false,
    isManager: false,
    isClient: false,

    session: null,
    sessionData: null,
    sessionId: null,
    sessionUserId: null,

    username: null,
    avatar: null,
    avatarUrl: null,

    loginInProgress: false,
    lastLogoutAt: nowIso(),
  };

  try {
    AppCore?.setState?.(patch, {
      source: SOURCE,
      silent: true,
      emit: false,
      forceUnauthenticated: true,
    });

    return true;
  } catch {
    // fallback abajo
  }

  try {
    Object.assign(readState(), patch);
    return true;
  } catch {
    return false;
  }
}

function clearHttpAuth() {
  try {
    if (isFunction(CoreHttp?.clearAuthTokens)) {
      CoreHttp.clearAuthTokens();
      return true;
    }

    if (isFunction(CoreHttp?.setAccessToken)) {
      CoreHttp.setAccessToken(null);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function clearLocal(options = {}) {
  try {
    clearSessionLocal({
      source: SOURCE,
      silent: true,
      emit: false,
      reason: options.reason || "logout",
    });
  } catch {
    fallbackClearState();
  }

  clearHttpAuth();

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
    const before = sessionSnapshot({
      cause: "before-logout",
    });

    const remote = await remoteLogout(options);

    clearLocal({
      ...options,
      reason: "logout",
    });

    const after = sessionSnapshot({
      cause: "after-logout",
    });

    return {
      ok: true,

      authenticated: false,

      remoteOk: Boolean(remote.ok),
      remoteSkipped: Boolean(remote.skipped),
      remoteStatus: remote.status || 0,
      remoteTransport: remote.transport || "",
      remoteAlreadyInvalid: remote.alreadyInvalid === true,
      remoteError: remote.error || null,

      before,
      session: after,

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

      return {
        ok: true,
        recovered: true,
        authenticated: false,
        remoteOk: false,
        error: publicError(error),
        session: sessionSnapshot({
          cause: "after-logout-recovery",
        }),
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

    endpoint: LOGOUT_ENDPOINT,

    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(
      state.hasToken ||
        state.token ||
        state.accessToken ||
        state.access_token
    ),

    token: null,
    accessToken: null,
    refreshToken: null,

    route: redact(state.route || "/"),
    publicPath: redact(state.publicPath || "/"),

    transport: {
      hasCoreHttp: Boolean(CoreHttp?.request || CoreHttp?.post || CoreHttp?.logout),
      coreLogout: Boolean(CoreHttp?.logout),
      corePost: Boolean(CoreHttp?.post),
      coreRequest: Boolean(CoreHttp?.request),
    },

    policy: {
      remoteBestEffort: true,
      localClearGuaranteed: true,

      ownFetch: false,
      ownRouter: false,
      ownToast: false,
      ownStorageClearAll: false,
      ownEvents: false,

      navigation: false,

      noHelpersImport: true,
      noConstantsImport: true,
    },

    at: nowIso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default logout;
