/* =========================================================
   Onion SPA - Auth Logout
   Archivo: src/features/auth/logout.js

   AUTH LOGOUT · SIMPLE · LOCAL CLEAR GUARANTEED · REMOTE BEST-EFFORT

   Contrato:
   - Cierre local garantizado siempre.
   - Cierre remoto opcional/best-effort.
   - Sin auth fantasma post-logout.
   - Sin localStorage.clear() / sessionStorage.clear().
   - Sin tocar theme/lang/initial URLs/rutas técnicas.
   - Navegación segura a /login por Router si existe; fallback real browser.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
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
  clearAuthStorage,
} from "./storage.js";

import {
  clearSessionLocal,
  buildSessionSnapshot,
} from "./session.js";

/* =========================================================
   META
========================================================= */

export const AUTH_LOGOUT_VERSION = "17.0.0-simple-clean";

const SOURCE = "auth.logout";
const BACKEND_ORIGIN = "https://api.onionit.net";
const DEFAULT_LOGIN_PATH = "/login";
const DEFAULT_TIMEOUT_MS = 6000;

let logoutPromise = null;
let logoutSeq = 0;

const REMOTE_OK_STATUSES = new Set([200, 202, 204, 205, 401, 403, 404]);

const AUTH_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "authToken",
  "auth_token",

  "refreshToken",
  "refresh_token",

  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "challengeToken",
  "challenge_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",

  "session",
  "sessionData",
  "sessionId",
  "session_id",
  "sessionUserId",
  "session_user_id",

  "user",
  "currentUser",
  "authUser",
  "sessionUser",
  "account",
  "profile",

  "userId",
  "user_id",
  "userName",
  "user_name",
  "username",
  "userSlug",
  "user_slug",

  "role",
  "rol",
  "userRole",
  "roles",
]);

const LEGACY_AUTH_KEYS = Object.freeze([
  "onion_token",
  "onion_access_token",
  "onion_refresh_token",
  "onion_temp_token",
  "onion_temporary_token",
  "onion_two_factor_token",
  "onion_mfa_token",
  "onion_session",
  "onion_session_id",
  "onion_session_user_id",
  "onion_user",
  "onion_user_id",
  "onion_user_name",
  "onion_user_slug",
  "onion_role",

  "auth.token",
  "auth.accessToken",
  "auth.access_token",
  "auth.refreshToken",
  "auth.refresh_token",
  "auth.tempToken",
  "auth.temp_token",
  "auth.session",
  "auth.sessionData",
  "auth.sessionId",
  "auth.session_id",
  "auth.sessionUserId",
  "auth.session_user_id",

  "session.token",
  "session.accessToken",
  "session.access_token",
  "session.refreshToken",
  "session.refresh_token",
  "session.user",
  "session.role",
]);

const COOKIE_NAMES = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "tempToken",
  "temp_token",
  "session",
  "sessionId",
  "session_id",
  "sessionUserId",
  "session_user_id",
  "onion_token",
  "onion_access_token",
  "onion_refresh_token",
  "onion_session",
  "onion_session_id",
  "onion_session_user_id",
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text = safeText(value).toLowerCase();

  if (["true", "1", "yes", "si", "sí", "on", "ok", "enabled", "active"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) {
    return false;
  }

  return Boolean(fallback);
}

function unique(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) => safeText(item))
        .filter(Boolean)
    ),
  ];
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
    return AppCore?.state || {};
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
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, cleanPatch);
    }
  } catch {}

  return getState();
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[AuthLogout]", ...args);
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn("[AuthLogout]", ...args);
    }
  } catch {}
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value)
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
        "$1***"
      )
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
  const user =
    source.user ||
    source.currentUser ||
    source.authUser ||
    source.sessionUser ||
    session.user ||
    null;

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
    message: (() => {
      try {
        return redact(extractMessage(error));
      } catch {
        return redact(error.message || String(error));
      }
    })(),
    status: error.status || error.statusCode || error.response?.status || error.data?.status || 0,
    code: error.code || error.data?.code || error.response?.data?.code || null,
    timeout: Boolean(error.timeout),
    aborted: Boolean(error.aborted),
  };
}

function sanitizePayload(value, depth = 0, keyHint = "") {
  if (depth > 6) return "[MaxDepth]";

  const key = safeText(keyHint).toLowerCase();

  if (
    key.includes("token") ||
    key.includes("password") ||
    key.includes("secret") ||
    key.includes("authorization") ||
    key === "code" ||
    key === "otp" ||
    key === "totp"
  ) {
    return value ? "***" : value;
  }

  if (typeof value === "string") return redact(value);

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Error) return publicError(value);

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitizePayload(item, depth + 1, keyHint));
  }

  if (isObject(value)) {
    if (key.includes("snapshot") || key === "before" || key === "after") {
      return publicSnapshot(value);
    }

    if (key === "user" || key === "currentuser" || key === "sessionuser") {
      return publicUser(value);
    }

    const out = {};

    for (const [childKey, childValue] of Object.entries(value).slice(0, 100)) {
      out[childKey] = sanitizePayload(childValue, depth + 1, childKey);
    }

    return out;
  }

  return redact(String(value));
}

function shouldEmit(options = {}) {
  return safeBool(options.silent, false) !== true && options.emitEvents !== false;
}

function emit(eventName = "", payload = {}, options = {}) {
  if (!shouldEmit(options)) return false;

  const name = safeText(eventName);

  if (!name) return false;

  const detail = sanitizePayload({
    source: SOURCE,
    version: AUTH_LOGOUT_VERSION,
    at: nowIso(),
    ...safeObject(payload),
  });

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, detail);
    emitted = true;
  } catch {}

  try {
    if (isBrowser() && !emitted) {
      document.dispatchEvent(new CustomEvent(name, { detail }));
      emitted = true;
    }
  } catch {}

  return emitted;
}

/* =========================================================
   URLS / ROUTER
========================================================= */

function normalizePathSafe(path = "/") {
  try {
    return normalizePath(path);
  } catch {
    let value = safeText(path, "/").replace(/\\/g, "/").replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) value = `/${value}`;

    return value || "/";
  }
}

function normalizeCanonicalPathSafe(path = "/") {
  try {
    return normalizeCanonicalPath(path);
  } catch {
    return normalizePathSafe(path).split("?")[0].split("#")[0] || "/";
  }
}

function isSafeRelativePathSafe(path = "") {
  try {
    return isSafeRelativePath(path);
  } catch {
    const value = safeText(path);

    return Boolean(
      value &&
        value.startsWith("/") &&
        !value.startsWith("//") &&
        !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
        !/[\r\n\t]/.test(value)
    );
  }
}

function normalizeAuthEndpoint(endpoint = "", fallback = "/api/auth/logout") {
  const raw = safeText(endpoint, fallback);

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/auth/")) return `/api${raw}`;
  if (raw.startsWith("/")) return `/api/auth${raw}`;

  return `/api/auth/${raw}`;
}

function getLogoutEndpoint() {
  return normalizeAuthEndpoint(
    AUTH_ENDPOINTS?.logout ||
      AUTH_ENDPOINTS?.auth?.logout ||
      AppCore?.config?.auth?.endpoints?.logout ||
      "/api/auth/logout",
    "/api/auth/logout"
  );
}

function getLoginPath() {
  const configured = safeText(
    AppCore?.config?.routes?.login ||
      AppCore?.config?.loginPath,
    DEFAULT_LOGIN_PATH
  );

  const path = normalizePathSafe(configured);

  return isSafeRelativePathSafe(path) ? path : DEFAULT_LOGIN_PATH;
}

function resolveRedirect(target = "") {
  const fallback = getLoginPath();
  const raw = safeText(target);

  const path = normalizePathSafe(raw || fallback);

  return isSafeRelativePathSafe(path) ? path : fallback;
}

function getRouter() {
  const candidates = [];

  try {
    if (isFunction(AppCore?.modules?.get)) {
      candidates.push(AppCore.modules.get("router"), AppCore.modules.get("Router"));
    }
  } catch {}

  candidates.push(
    AppCore?.router,
    AppCore?.Router,
    AppCore?.modules?.router,
    AppCore?.modules?.Router
  );

  if (isBrowser()) {
    try {
      candidates.push(window.Router, window.AppRouter, window.AppCore?.router, window.AppCore?.Router);
    } catch {}
  }

  return candidates.find((router) => (
    router &&
    (
      isFunction(router.navigate) ||
      isFunction(router.go) ||
      isFunction(router.render)
    )
  )) || null;
}

function updateRouteState(path = DEFAULT_LOGIN_PATH) {
  const publicPath = resolveRedirect(path);
  const route = normalizeCanonicalPathSafe(publicPath);

  try {
    AppCore?.setRoute?.(route);
  } catch {}

  try {
    AppCore?.setPublicPath?.(publicPath);
  } catch {}

  safeSetState({
    route,
    canonicalPath: route,
    publicPath,
  });

  return { route, publicPath };
}

async function navigateTo(path = DEFAULT_LOGIN_PATH, options = {}) {
  const target = resolveRedirect(path);

  if (options.navigate === false || options.skipNavigate === true) {
    return {
      ok: true,
      skipped: true,
      reason: "disabled",
      path: target,
    };
  }

  const router = getRouter();
  const navOptions = {
    replaceState: options.replaceState !== false,
    force: options.force !== false,
    source: SOURCE,
    reason: "logout",
  };

  try {
    if (isFunction(router?.navigate)) {
      await router.navigate(target, navOptions);
      updateRouteState(target);

      return { ok: true, reason: "router.navigate", path: target };
    }

    if (isFunction(router?.go)) {
      await router.go(target, navOptions);
      updateRouteState(target);

      return { ok: true, reason: "router.go", path: target };
    }

    if (isFunction(router?.render)) {
      await router.render(normalizeCanonicalPathSafe(target), {
        ...navOptions,
        publicPath: target,
      });
      updateRouteState(target);

      return { ok: true, reason: "router.render", path: target };
    }
  } catch (error) {
    safeWarn("Navegación SPA tras logout falló; usando fallback browser.", error);
  }

  if (isBrowser()) {
    try {
      if (options.replaceState !== false) {
        window.location.replace(target);
      } else {
        window.location.assign(target);
      }

      return { ok: true, reason: "browser", path: target };
    } catch {
      try {
        window.location.href = target;
        return { ok: true, reason: "browser.href", path: target };
      } catch {}
    }
  }

  updateRouteState(target);

  return { ok: false, reason: "navigation-failed", path: target };
}

/* =========================================================
   REMOTE LOGOUT
========================================================= */

function getTimeout(options = {}) {
  return Math.max(
    1000,
    safeNumber(
      options.timeout ??
        options.timeoutMs ??
        AUTH_CONSTANTS?.logoutTimeoutMs ??
        AUTH_CONSTANTS?.requestTimeout,
      DEFAULT_TIMEOUT_MS
    )
  );
}

function normalizeApiBase(value = "") {
  const raw = safeText(value, BACKEND_ORIGIN);

  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/g, "");
  }

  try {
    const url = new URL(raw);
    const origin = url.origin.replace(/\/+$/g, "");
    const pathname = (url.pathname || "/").replace(/\/+$/g, "") || "/";

    if (pathname === "/" || pathname === "/api") return origin;

    return `${origin}${pathname}`.replace(/\/+$/g, "");
  } catch {
    return BACKEND_ORIGIN;
  }
}

function getApiBase() {
  return normalizeApiBase(
    AppCore?.config?.apiBase ||
      AppCore?.config?.apiOrigin ||
      AppCore?.config?.apiBaseUrl ||
      AppCore?.config?.api?.baseUrl ||
      AppCore?.config?.api?.base ||
      AppCore?.config?.backendUrl ||
      BACKEND_ORIGIN
  );
}

function buildApiUrl(endpoint = "") {
  const cleanEndpoint = safeText(endpoint, "/api/auth/logout");

  if (/^https?:\/\//i.test(cleanEndpoint)) return cleanEndpoint;

  const base = getApiBase().replace(/\/+$/g, "");
  let path = cleanEndpoint.startsWith("/") ? cleanEndpoint : `/${cleanEndpoint}`;

  if (/\/api$/i.test(base) && path.startsWith("/api/")) {
    path = path.replace(/^\/api/i, "");
  }

  return `${base}${path}`;
}

function getCurrentToken() {
  const state = getState();

  return safeText(
    state.token ||
      state.accessToken ||
      state.access_token ||
      state.session?.token ||
      state.session?.accessToken ||
      state.session?.access_token ||
      ""
  );
}

function buildLogoutBody() {
  const refreshToken = safeText(getStoredRefreshToken());
  const sessionId = safeText(getStoredSessionId());
  const userId = safeText(getStoredSessionUserId());

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

function getStatus(errorOrResponse = null) {
  return safeNumber(
    errorOrResponse?.status ||
      errorOrResponse?.statusCode ||
      errorOrResponse?.status_code ||
      errorOrResponse?.response?.status ||
      errorOrResponse?.data?.status ||
      errorOrResponse?.response?.data?.status,
    0
  );
}

function normalizeRemoteResult(value = null, transport = "") {
  if (value === null || value === undefined) {
    return {
      ok: true,
      skipped: false,
      status: 204,
      transport,
    };
  }

  const status = getStatus(value);
  const okFlag =
    typeof value?.ok === "boolean"
      ? value.ok
      : typeof value?.success === "boolean"
        ? value.success
        : null;

  const accepted = status > 0 && REMOTE_OK_STATUSES.has(status);

  return {
    ok: okFlag !== null ? Boolean(okFlag || accepted) : status === 0 ? true : accepted,
    skipped: false,
    status,
    transport,
  };
}

function remoteErrorResult(error = null, transport = "") {
  const status = getStatus(error);

  if (REMOTE_OK_STATUSES.has(status)) {
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

function getHttpClient() {
  return (
    AppCore?.http ||
    AppCore?.Http ||
    AppCore?.services?.http ||
    AppCore?.services?.Http ||
    AppCore?.services?.api ||
    AppCore?.apiClient ||
    null
  );
}

function buildRequestOptions(options = {}) {
  const timeout = getTimeout(options);

  return {
    auth: true,
    public: false,
    skipAuth: false,

    silent: true,
    storeError: false,

    timeout,
    timeoutMs: timeout,

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
      ...(safeObject(options.headers)),
    },
  };
}

async function remoteViaClient(client, endpoint, body, options) {
  if (!client) return null;

  if (isFunction(client.post)) {
    return client.post(endpoint, body, options);
  }

  if (isFunction(client.request)) {
    try {
      return await client.request("POST", endpoint, {
        ...options,
        body,
      });
    } catch (firstError) {
      try {
        return await client.request(endpoint, {
          ...options,
          method: "POST",
          body,
        });
      } catch {
        throw firstError;
      }
    }
  }

  return null;
}

async function remoteViaFetch(endpoint, body, options = {}) {
  if (typeof fetch !== "function") return null;

  const timeout = getTimeout(options);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;

  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort("logout-timeout");
        } catch {}
      }, timeout)
    : null;

  const token = getCurrentToken();

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Onion-Client": "onion-spa",
    "X-Onion-Auth-Flow": "logout",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(buildApiUrl(endpoint), {
      method: "POST",
      headers,
      credentials: AppCore?.config?.api?.withCredentials === false ? "omit" : "include",
      cache: "no-store",
      body: JSON.stringify(body),
      signal: controller?.signal,
    });

    return {
      ok: response.ok || REMOTE_OK_STATUSES.has(response.status),
      status: response.status,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestRemoteLogout(options = {}) {
  if (options.remote === false || options.skipRemote === true) {
    return {
      ok: true,
      skipped: true,
      status: 0,
      transport: "disabled",
    };
  }

  const endpoint = getLogoutEndpoint();
  const body = buildLogoutBody();
  const requestOptions = buildRequestOptions(options);

  try {
    const client = getHttpClient();
    const result = await remoteViaClient(client, endpoint, body, requestOptions);

    if (result !== null && result !== undefined) {
      return normalizeRemoteResult(result, "client");
    }
  } catch (error) {
    return remoteErrorResult(error, "client");
  }

  try {
    if (isFunction(AppCore?.request)) {
      const result = await AppCore.request("POST", endpoint, {
        ...requestOptions,
        body,
      });

      return normalizeRemoteResult(result, "AppCore.request");
    }
  } catch (error) {
    return remoteErrorResult(error, "AppCore.request");
  }

  try {
    const result = await remoteViaFetch(endpoint, body, requestOptions);

    if (result !== null && result !== undefined) {
      return normalizeRemoteResult(result, "fetch");
    }
  } catch (error) {
    return remoteErrorResult(error, "fetch");
  }

  return {
    ok: false,
    skipped: true,
    status: 0,
    transport: "none",
  };
}

/* =========================================================
   LOCAL CLEAR
========================================================= */

function storagePrefixes() {
  return unique([
    AppCore?.config?.storagePrefix,
    AppCore?.config?.appKey,
    "onion",
  ]);
}

function storageClearKeys() {
  const configured = [
    AppCore?.config?.storageKeys?.token,
    AppCore?.config?.storageKeys?.accessToken,
    AppCore?.config?.storageKeys?.access_token,
    AppCore?.config?.storageKeys?.user,
    AppCore?.config?.storageKeys?.refreshToken,
    AppCore?.config?.storageKeys?.refresh_token,
    AppCore?.config?.storageKeys?.tempToken,
    AppCore?.config?.storageKeys?.temp_token,
    AppCore?.config?.storageKeys?.session,
    AppCore?.config?.storageKeys?.sessionData,
    AppCore?.config?.storageKeys?.sessionId,
    AppCore?.config?.storageKeys?.sessionUserId,
    AppCore?.config?.storageKeys?.role,
    AppCore?.config?.auth?.tokenStorageKey,
    AppCore?.config?.auth?.refreshTokenStorageKey,
    AppCore?.config?.auth?.tempTokenStorageKey,
    AppCore?.config?.auth?.sessionIdStorageKey,
    AppCore?.config?.auth?.sessionUserIdStorageKey,
  ];

  const base = unique([
    ...AUTH_KEYS,
    ...LEGACY_AUTH_KEYS,
    ...configured,
  ]);

  const expanded = [];

  for (const key of base) {
    expanded.push(key);

    for (const prefix of storagePrefixes()) {
      expanded.push(
        `${prefix}:${key}`,
        `${prefix}.${key.replace(/:/g, ".")}`,
        `${prefix}_${key.replace(/[:.]/g, "_")}`
      );
    }

    expanded.push(
      key.replace(/:/g, "."),
      key.replace(/\./g, ":"),
      key.replace(/[:.]/g, "_")
    );
  }

  return unique(expanded);
}

function clearAppCoreStorage() {
  const storage = AppCore?.storage;

  if (!storage) return false;

  let changed = false;

  for (const key of storageClearKeys()) {
    try {
      if (isFunction(storage.remove)) {
        storage.remove(key);
        changed = true;
        continue;
      }
    } catch {}

    try {
      if (isFunction(storage.delete)) {
        storage.delete(key);
        changed = true;
        continue;
      }
    } catch {}

    try {
      if (isFunction(storage.del)) {
        storage.del(key);
        changed = true;
        continue;
      }
    } catch {}

    try {
      if (isFunction(storage.setRaw)) {
        storage.setRaw(key, "");
        changed = true;
        continue;
      }
    } catch {}

    try {
      if (isFunction(storage.set)) {
        storage.set(key, null);
        changed = true;
      }
    } catch {}
  }

  return changed;
}

function clearWebStorage() {
  if (!isBrowser()) return false;

  let changed = false;

  for (const key of storageClearKeys()) {
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

function clearCookies() {
  if (!isBrowser()) return false;

  let host = "";

  try {
    host = window.location?.hostname || "";
  } catch {}

  const domains = unique([
    "",
    host,
    host && host.includes(".") ? `.${host}` : "",
  ]);

  const names = unique([
    ...COOKIE_NAMES,
    ...storageClearKeys(),
  ]);

  let changed = false;

  for (const name of names) {
    for (const domain of domains) {
      try {
        document.cookie =
          `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/` +
          (domain ? `; domain=${domain}` : "") +
          "; SameSite=Lax";

        changed = true;
      } catch {}
    }
  }

  return changed;
}

function clearInFlightRequests() {
  let count = 0;

  for (const target of [
    AppCore?.apiClient,
    AppCore?.request,
    AppCore?.http,
    AppCore?.Http,
  ]) {
    try {
      count += target?.clearInFlight?.({
        abort: true,
        reason: "logout",
      }) || 0;
    } catch {}
  }

  return count;
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
    admin: false,

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

function clearDomAuthState() {
  if (!isBrowser()) return false;

  try {
    document.documentElement?.setAttribute?.("data-authenticated", "false");
    document.body?.setAttribute?.("data-authenticated", "false");

    document.documentElement?.classList?.remove?.("app-authenticated", "route-app");
    document.body?.classList?.remove?.("app-authenticated", "route-app");

    document.documentElement?.classList?.add?.("route-auth");
    document.body?.classList?.add?.("route-auth");

    document.getElementById("app-shell")?.setAttribute?.("aria-busy", "false");
    document.getElementById("main-content")?.setAttribute?.("aria-busy", "false");
    document.getElementById("view-container")?.setAttribute?.("aria-busy", "false");
  } catch {}

  return true;
}

function clearAppCoreSession(reason = "logout") {
  try {
    AppCore?.clearSession?.({
      silent: true,
      source: SOURCE,
      reason,
      skipNavigation: true,
      skipRedirect: true,
    });
  } catch {
    try {
      AppCore?.clearSession?.();
    } catch {}
  }

  try {
    AppCore?.session?.clear?.({
      silent: true,
      source: SOURCE,
      reason,
    });
  } catch {
    try {
      AppCore?.session?.clear?.();
    } catch {}
  }

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

  return true;
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
    clearAuthStorage({
      silent: true,
      includeLegacy: true,
    });
  } catch {}

  clearAppCoreSession(reason);
  clearAppCoreStorage();
  clearWebStorage();
  clearCookies();
  clearDomAuthState();

  if (options.clearInFlightRequests !== false) {
    clearInFlightRequests();
  }

  try {
    AppCore?.syncUserUI?.({
      source: SOURCE,
      reason: "logout",
    });
  } catch {
    try {
      AppCore?.syncUserUI?.();
    } catch {}
  }

  emit("auth:logout:local-cleared", {
    reason,
    authenticated: false,
    user: null,
    role: null,
  }, options);

  emit("app:ui:repair-request", {
    reason: "logout",
    authenticated: false,
    user: null,
    role: null,
    repairShell: false,
    hardRepair: false,
    rebind: false,
  }, options);

  return true;
}

/* =========================================================
   SNAPSHOT
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

/* =========================================================
   LOGOUT
========================================================= */

async function executeLogout(options = {}) {
  const opts = safeObject(options);
  const sequence = ++logoutSeq;
  const startedAt = Date.now();

  const before = sessionSnapshot({ cause: "logout" });

  const shouldRemote =
    opts.remote !== false &&
    opts.skipRemote !== true;

  const shouldNavigate =
    opts.navigate !== false &&
    opts.skipNavigate !== true;

  const redirectTo = resolveRedirect(
    opts.redirectTo ||
      opts.redirect ||
      opts.target ||
      ""
  );

  emit("auth:logout:start", {
    sequence,
    before,
  }, opts);

  let remote = {
    ok: true,
    skipped: true,
    status: 0,
    transport: "disabled",
  };

  if (shouldRemote) {
    remote = await requestRemoteLogout(opts);

    emit(remote.ok ? "auth:logout:remote-success" : "auth:logout:remote-error", {
      sequence,
      ok: Boolean(remote.ok),
      status: remote.status || 0,
      skipped: Boolean(remote.skipped),
      transport: remote.transport || "",
      error: remote.error || null,
    }, opts);
  } else {
    emit("auth:logout:remote-skipped", {
      sequence,
      reason: "remote-disabled",
    }, opts);
  }

  clearLocal({
    ...opts,
    reason: "logout",
    preserveRoute: !shouldNavigate,
    preserveCurrentRoute: !shouldNavigate,
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
    redirectTo: shouldNavigate ? redirectTo : null,
    durationMs: Date.now() - startedAt,
  }, opts);

  emit("auth:logout", {
    sequence,
    hadSession: Boolean(before?.authenticated),
    remoteOk: Boolean(remote.ok),
    remoteSkipped: Boolean(remote.skipped),
    redirectTo: shouldNavigate ? redirectTo : null,
  }, opts);

  emit("app:session:cleared", {
    sequence,
    reason: "logout",
    authenticated: false,
    user: null,
    role: null,
  }, opts);

  emit("app:auth:change", {
    sequence,
    authenticated: false,
    user: null,
    role: null,
  }, opts);

  emit("app:user:change", {
    sequence,
    authenticated: false,
    user: null,
    role: null,
  }, opts);

  const navigation = shouldNavigate
    ? await navigateTo(redirectTo, {
        replaceState: opts.replaceState !== false,
        force: opts.force !== false,
        hardRedirect: opts.hardRedirect === true,
      })
    : {
        ok: true,
        skipped: true,
        reason: "navigation-disabled",
        path: null,
      };

  if (shouldNavigate) {
    emit("auth:logout:navigated", {
      sequence,
      navigation,
      redirectTo,
    }, opts);
  }

  return {
    ok: true,
    recovered: false,

    remoteOk: Boolean(remote.ok),
    remoteStatus: remote.status || 0,
    remoteSkipped: Boolean(remote.skipped),
    remoteTransport: remote.transport || "",

    before: publicSnapshot(before),
    after: publicSnapshot(after),

    redirectTo: shouldNavigate ? redirectTo : null,
    navigation,

    durationMs: Date.now() - startedAt,
    sequence,

    version: AUTH_LOGOUT_VERSION,
  };
}

export async function logout(options = {}) {
  if (logoutPromise) {
    return logoutPromise;
  }

  logoutPromise = (async () => {
    try {
      return await executeLogout(options);
    } catch (error) {
      safeWarn("Logout recuperado con limpieza local.", error);

      try {
        clearLocal({
          ...safeObject(options),
          silent: true,
          reason: "logout-recovery",
        });
      } catch {}

      emit("auth:logout:error", {
        error,
        message: (() => {
          try {
            return extractMessage(error);
          } catch {
            return error?.message || "Logout error";
          }
        })(),
      }, {
        ...safeObject(options),
        silent: false,
      });

      const shouldNavigate =
        options?.navigate !== false &&
        options?.skipNavigate !== true;

      const redirectTo = shouldNavigate
        ? resolveRedirect(options?.redirectTo || options?.redirect || options?.target || "")
        : null;

      const navigation = redirectTo
        ? await navigateTo(redirectTo, {
            replaceState: true,
            force: true,
            hardRedirect: options?.hardRedirect === true,
          })
        : null;

      return {
        ok: true,
        recovered: true,
        remoteOk: false,
        remoteSkipped: options?.remote === false || options?.skipRemote === true,
        error: publicError(error),
        redirectTo,
        navigation,
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
  const router = getRouter();

  return {
    version: AUTH_LOGOUT_VERSION,

    inFlight: Boolean(logoutPromise),
    sequence: logoutSeq,

    endpoint: getLogoutEndpoint(),
    finalEndpointUrl: redact(buildApiUrl(getLogoutEndpoint())),
    apiBase: getApiBase(),

    loginPath: getLoginPath(),

    authenticated: Boolean(state.authenticated),

    hasToken: Boolean(
      state.token ||
        state.accessToken ||
        state.access_token ||
        state.session?.token ||
        state.session?.accessToken
    ),

    hasRefreshToken: Boolean(body.refreshToken),
    hasSessionId: Boolean(body.sessionId),
    hasSessionUserId: Boolean(body.userId),

    route: redact(state.route || ""),
    publicPath: redact(state.publicPath || ""),

    hasRouter: Boolean(router),

    routerCapabilities: {
      navigate: Boolean(isFunction(router?.navigate)),
      go: Boolean(isFunction(router?.go)),
      render: Boolean(isFunction(router?.render)),
    },

    storageClearKeys: storageClearKeys(),
    cookieClearNames: [...COOKIE_NAMES],

    at: nowIso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default logout;
