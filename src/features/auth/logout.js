/* =========================================================
   Onion SPA - Auth Logout
   Archivo: src/features/auth/logout.js

   AUTH LOGOUT · FINAL SIMPLE
   - Logout remoto best-effort vía CoreHttp
   - Limpieza local garantizada vía session.js/storage.js
   - Sin fetch propio, apiClient propio, Router, Toast, DOM hacks ni storage.clear()
   - Sin roles/permisos/refresh/navegación rara
========================================================= */

import { AppCore } from "../../core/index.js";
import CoreHttp from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
  clearAuthStorage,
} from "./storage.js";

import {
  clearSessionLocal,
  buildSessionSnapshot,
} from "./session.js";

/* =========================================================
   META
========================================================= */

export const AUTH_LOGOUT_VERSION = "20.0.0-final";

const SOURCE = "auth.logout";
const DEFAULT_TIMEOUT_MS = 6000;

let logoutPromise = null;
let logoutSeq = 0;

const REMOTE_OK_STATUSES = Object.freeze([200, 202, 204, 205, 401, 403, 404]);

/* =========================================================
   BASICS
========================================================= */

const isFunction = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1) return true;
  if (value === 0) return false;

  const text = safeText(value, "").toLowerCase();
  if (["true", "1", "yes", "si", "sí", "on", "ok", "enabled", "active"].includes(text)) return true;
  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) return false;

  return Boolean(fallback);
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function getState() {
  try {
    return AppCore?.state && typeof AppCore.state === "object" ? AppCore.state : {};
  } catch {
    return {};
  }
}

function safeSetState(patch = {}, options = {}) {
  const cleanPatch = safeObject(patch);

  try {
    AppCore?.setState?.(cleanPatch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      emitDerived: false,
      silent: true,
      ...safeObject(options),
    });
  } catch {}

  try {
    AppCore?.patchState?.(cleanPatch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      silent: true,
      ...safeObject(options),
    });
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, cleanPatch);
  } catch {}

  return getState();
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[AuthLogout]", ...args.map((item) => sanitizePayload(item)));
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn("[AuthLogout]", ...args.map((item) => sanitizePayload(item)));
  } catch {}
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(/([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  }
}

function publicUser(user = null) {
  if (!isObject(user)) return null;

  return {
    id: user.id || user.userId || user.user_id || user.uid || null,
    userId: user.userId || user.user_id || user.id || user.uid || null,
    username: user.username || user.userName || user.user_name || user.slug || null,
    email: user.email || user.mail || null,
    role: user.role || user.rol || null,
  };
}

function publicSnapshot(snapshot = {}) {
  const source = safeObject(snapshot);
  const session = safeObject(source.session || source.sessionData);
  const user = source.user || source.currentUser || source.authUser || source.sessionUser || session.user || null;

  return {
    authenticated: Boolean(source.authenticated),
    hasToken: Boolean(source.token || source.accessToken || source.access_token || session.token),
    token: null,
    accessToken: null,
    refreshToken: null,
    user: publicUser(user),
    role: source.role || source.rol || source.userRole || user?.role || user?.rol || null,
    roles: Array.isArray(source.roles) ? source.roles : [],
    route: redact(source.route || ""),
    publicPath: redact(source.publicPath || ""),
  };
}

function publicError(error = null) {
  if (!error) return null;

  return {
    name: error.name || "Error",
    message: redact(extractMessage(error) || error.message || String(error)),
    status: error.status || error.statusCode || error.response?.status || error.data?.status || 0,
    code: error.code || error.data?.code || error.response?.data?.code || null,
    timeout: Boolean(error.timeout),
    aborted: Boolean(error.aborted),
  };
}

function sanitizePayload(value, depth = 0, keyHint = "") {
  if (/token|password|secret|authorization|credential|cookie|jwt|bearer|refresh|access|otp|totp|mfa|2fa|code/i.test(safeText(keyHint, ""))) {
    return value ? "***" : value;
  }

  if (depth > 4) return "[depth-limit]";
  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return publicError(value);

  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizePayload(item, depth + 1, keyHint));

  if (isObject(value)) {
    if (["before", "after", "snapshot"].includes(safeText(keyHint, ""))) return publicSnapshot(value);
    if (["user", "currentUser", "sessionUser"].includes(safeText(keyHint, ""))) return publicUser(value);

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = sanitizePayload(item, depth + 1, key);
    }

    return output;
  }

  return redact(String(value));
}

function shouldEmit(options = {}) {
  return safeBool(options.silent, false) !== true && options.emitEvents !== false;
}

function emit(eventName = "", payload = {}, options = {}) {
  if (!shouldEmit(options)) return false;

  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = sanitizePayload({
    source: SOURCE,
    version: AUTH_LOGOUT_VERSION,
    at: nowIso(),
    ...safeObject(payload),
  });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  return false;
}

/* =========================================================
   SNAPSHOT / STATE
========================================================= */

function sessionSnapshot(extra = {}) {
  try {
    return buildSessionSnapshot(extra);
  } catch {
    const state = getState();

    return {
      authenticated: Boolean(state.authenticated),
      token: state.token || state.accessToken || state.access_token || null,
      user: state.user || state.currentUser || state.authUser || state.sessionUser || null,
      role: state.role || state.userRole || null,
      roles: Array.isArray(state.roles) ? state.roles : [],
      route: state.route || "/",
      publicPath: state.publicPath || "/",
      ...extra,
    };
  }
}

function authClearPatch(reason = "logout") {
  return {
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
    role: "",
    rol: "",
    userRole: "",
    roles: [],
    isAdmin: false,
    isSupport: false,
    isManager: false,
    isClient: false,
    session: null,
    sessionData: null,
    sessionId: null,
    sessionUserId: null,
    currentResolvedUsername: null,
    resolvedUsername: null,
    username: null,
    avatar: null,
    avatarUrl: null,
    loginInProgress: false,
    twoFactorPending: false,
    twoFactorUser: null,
    tempToken: null,
    temp_token: null,
    lastAuthSource: reason,
    lastLogoutAt: nowIso(),
  };
}

/* =========================================================
   REMOTE LOGOUT
========================================================= */

function getLogoutEndpoint() {
  const endpoint = safeText(
    AUTH_ENDPOINTS?.logout ||
      AUTH_ENDPOINTS?.auth?.logout ||
      AppCore?.config?.auth?.endpoints?.logout ||
      "/auth/logout",
    "/auth/logout"
  );

  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (endpoint.startsWith("/api/")) return endpoint;
  if (endpoint.startsWith("/auth/")) return endpoint;
  if (endpoint.startsWith("/")) return `/auth${endpoint}`;
  return `/auth/${endpoint}`;
}

function getTimeout(options = {}) {
  return Math.max(
    1000,
    safeNumber(
      options.timeout ?? options.timeoutMs ?? AUTH_CONSTANTS?.logoutTimeoutMs ?? AUTH_CONSTANTS?.requestTimeout,
      DEFAULT_TIMEOUT_MS
    )
  );
}

function buildLogoutBody() {
  const refreshToken = safeText(getStoredRefreshToken(), "");
  const sessionId = safeText(getStoredSessionId(), "");
  const userId = safeText(getStoredSessionUserId(), "");
  const body = {};

  if (refreshToken) {
    body.refreshToken = refreshToken;
    body.refresh_token = refreshToken;
  }

  if (sessionId) {
    body.sessionId = sessionId;
    body.session_id = sessionId;
  }

  if (userId) {
    body.userId = userId;
    body.user_id = userId;
  }

  return body;
}

function statusOf(value = null) {
  return safeNumber(value?.status || value?.statusCode || value?.response?.status || value?.data?.status, 0);
}

function normalizeRemoteResult(value = null, transport = "core") {
  const status = statusOf(value);
  const okFlag = typeof value?.ok === "boolean" ? value.ok : typeof value?.success === "boolean" ? value.success : null;
  const accepted = status > 0 && REMOTE_OK_STATUSES.includes(status);

  return {
    ok: okFlag !== null ? Boolean(okFlag || accepted) : status === 0 ? true : accepted,
    skipped: false,
    status,
    transport,
  };
}

function remoteErrorResult(error = null, transport = "core") {
  const status = statusOf(error);

  if (REMOTE_OK_STATUSES.includes(status)) {
    return {
      ok: true,
      skipped: false,
      status,
      transport,
      alreadyInvalid: true,
    };
  }

  return {
    ok: false,
    skipped: false,
    status,
    transport,
    error: publicError(error),
  };
}

async function requestRemoteLogout(options = {}) {
  if (options.remote === false || options.skipRemote === true || options.localOnly === true) {
    return { ok: true, skipped: true, status: 0, transport: "disabled" };
  }

  const endpoint = getLogoutEndpoint();
  const body = buildLogoutBody();
  const requestOptions = {
    auth: true,
    public: false,
    skipAuth: false,
    silent: true,
    storeError: false,
    timeout: getTimeout(options),
    timeoutMs: getTimeout(options),
    retry: false,
    retries: 0,
    _skipRetry: true,
    skipRetry: true,
    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    noAutoRefresh: true,
    autoRefresh: false,
    noAutoLogout: true,
    autoLogout: false,
    expectedStatuses: [...REMOTE_OK_STATUSES],
    headers: {
      "X-Onion-Auth-Flow": "logout",
      "X-Request-Source": SOURCE,
      ...safeObject(options.headers),
    },
  };

  try {
    if ((endpoint === "/auth/logout" || endpoint === "/api/auth/logout") && isFunction(CoreHttp?.logout)) {
      const result = await CoreHttp.logout(requestOptions);
      return normalizeRemoteResult(result, "CoreHttp.logout");
    }

    if (isFunction(CoreHttp?.post)) {
      const result = await CoreHttp.post(endpoint, body, requestOptions);
      return normalizeRemoteResult(result, "CoreHttp.post");
    }

    if (isFunction(CoreHttp?.request)) {
      const result = await CoreHttp.request(endpoint, { ...requestOptions, method: "POST", body });
      return normalizeRemoteResult(result, "CoreHttp.request");
    }

    return { ok: false, skipped: true, status: 0, transport: "missing-core-http" };
  } catch (error) {
    return remoteErrorResult(error, "CoreHttp");
  }
}

/* =========================================================
   LOCAL CLEAR
========================================================= */

function clearInFlightRequests() {
  let count = 0;

  for (const target of [CoreHttp, AppCore?.http, AppCore?.Http, AppCore?.apiClient]) {
    try {
      count += target?.clearInFlight?.({ abort: true, reason: "logout" }) || 0;
    } catch {}

    try {
      count += target?.abortInFlight?.("logout") || 0;
    } catch {}
  }

  return count;
}

function clearLocal(options = {}) {
  const reason = safeText(options.reason, "logout");

  try {
    clearSessionLocal({
      silent: true,
      source: SOURCE,
      reason,
      preserveRoute: options.preserveRoute === true,
      preserveCurrentRoute: options.preserveCurrentRoute === true,
      route: options.route,
      publicPath: options.publicPath,
      skipNavigation: true,
      skipNavigate: true,
      skipRedirect: true,
      noRedirect: true,
    });
  } catch {}

  try {
    clearAuthStorage({ silent: true, includeLegacy: true });
  } catch {}

  try {
    CoreHttp?.clearAuthTokens?.();
  } catch {}

  safeSetState(authClearPatch(reason), {
    forceUnauthenticated: true,
    source: `${SOURCE}:clear`,
  });

  try {
    AppCore?.setLoading?.(false);
  } catch {}

  try {
    AppCore?.setError?.(null);
  } catch {}

  if (options.clearInFlightRequests !== false) clearInFlightRequests();

  try {
    AppCore?.syncUserUI?.({ source: SOURCE, reason });
  } catch {
    try {
      AppCore?.syncUserUI?.();
    } catch {}
  }

  emit("auth:logout:local-cleared", { reason, authenticated: false, user: null, role: null }, options);
  emit("app:ui:repair-request", { reason, authenticated: false, user: null, role: null, repairShell: false, hardRepair: false, rebind: false }, options);

  return true;
}

/* =========================================================
   LOGOUT
========================================================= */

async function executeLogout(options = {}) {
  const opts = safeObject(options);
  const sequence = ++logoutSeq;
  const startedAt = Date.now();
  const before = sessionSnapshot({ cause: "logout" });
  const shouldRemote = opts.remote !== false && opts.skipRemote !== true && opts.localOnly !== true;

  emit("auth:logout:start", { sequence, before }, opts);

  const remote = shouldRemote
    ? await requestRemoteLogout(opts)
    : { ok: true, skipped: true, status: 0, transport: "disabled" };

  emit(remote.ok ? "auth:logout:remote-success" : "auth:logout:remote-error", {
    sequence,
    ok: Boolean(remote.ok),
    status: remote.status || 0,
    skipped: Boolean(remote.skipped),
    transport: remote.transport || "",
    error: remote.error || null,
  }, opts);

  clearLocal({
    ...opts,
    reason: "logout",
    preserveRoute: opts.preserveRoute === true || opts.preserveCurrentRoute === true || opts.navigate === false || opts.skipNavigate === true,
    preserveCurrentRoute: opts.preserveCurrentRoute === true || opts.navigate === false || opts.skipNavigate === true,
  });

  const after = sessionSnapshot({ cause: "logout" });

  emit("auth:logout:success", {
    sequence,
    hadSession: Boolean(before?.authenticated),
    remoteOk: Boolean(remote.ok),
    remoteSkipped: Boolean(remote.skipped),
    remoteStatus: remote.status || 0,
    remoteTransport: remote.transport || "",
    before,
    after,
    durationMs: Date.now() - startedAt,
  }, opts);

  emit("app:session:cleared", { sequence, reason: "logout", authenticated: false, user: null, role: null }, opts);
  emit("app:auth:change", { sequence, authenticated: false, user: null, role: null }, opts);
  emit("app:user:change", { sequence, authenticated: false, user: null, role: null }, opts);

  return {
    ok: true,
    recovered: false,
    remoteOk: Boolean(remote.ok),
    remoteStatus: remote.status || 0,
    remoteSkipped: Boolean(remote.skipped),
    remoteTransport: remote.transport || "",
    before: publicSnapshot(before),
    after: publicSnapshot(after),
    durationMs: Date.now() - startedAt,
    sequence,
    version: AUTH_LOGOUT_VERSION,
  };
}

export async function logout(options = {}) {
  if (logoutPromise) return logoutPromise;

  logoutPromise = (async () => {
    try {
      return await executeLogout(options);
    } catch (error) {
      safeWarn("Logout recuperado con limpieza local.", error);

      try {
        clearLocal({ ...safeObject(options), silent: true, reason: "logout-recovery" });
      } catch {}

      emit("auth:logout:error", {
        error,
        message: extractMessage(error) || error?.message || "Logout error",
      }, { ...safeObject(options), silent: false });

      return {
        ok: true,
        recovered: true,
        remoteOk: false,
        remoteSkipped: options?.remote === false || options?.skipRemote === true || options?.localOnly === true,
        error: publicError(error),
        version: AUTH_LOGOUT_VERSION,
      };
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
  const body = buildLogoutBody();
  const state = getState();

  return {
    version: AUTH_LOGOUT_VERSION,
    inFlight: Boolean(logoutPromise),
    sequence: logoutSeq,
    endpoint: getLogoutEndpoint(),
    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(state.token || state.accessToken || state.access_token || state.session?.token || state.session?.accessToken),
    hasRefreshToken: Boolean(body.refreshToken),
    hasSessionId: Boolean(body.sessionId),
    hasSessionUserId: Boolean(body.userId),
    route: redact(state.route || ""),
    publicPath: redact(state.publicPath || ""),
    transport: {
      hasCoreHttp: Boolean(CoreHttp?.request),
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
