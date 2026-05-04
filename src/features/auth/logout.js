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
   - reparar UI tras limpieza de sesión
   - evitar estados auth fantasma post-logout

   HARDENING EXTREMO:
   - anti doble logout concurrente
   - timeout remoto real
   - navegación robusta Router/AppCore/browser
   - snapshot consistente sin tokens en eventos
   - no romper UI si backend falla
   - clear local garantizado
   - cero throws accidentales hacia UI
   - soporte logout silencioso
   - soporte skip remote
   - soporte await Router.navigate()
   - limpieza auth namespaced + legacy
   - limpieza AppCore/session/storage redundante
   - eventos saneados sin tokens/passwords
   - fallback fetch compatible con apiBase
   - remote logout acepta 401/403/404 como sesión ya inválida
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
  clearAuthStorage,
} from "./storage.js";

import {
  clearSessionLocal,
  buildSessionSnapshot,
} from "./session.js";

/* =========================================================
   VERSION / INTERNAL STATE
========================================================= */

export const AUTH_LOGOUT_VERSION =
  "10.0.0";

let logoutPromise = null;
let logoutSequence = 0;

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_LOGOUT_TIMEOUT_MS =
  6000;

const DEFAULT_LOGIN_PATH =
  "/login";

const ACCEPTED_REMOTE_LOGOUT_STATUSES =
  Object.freeze([
    200,
    202,
    204,
    205,
    401,
    403,
    404,
  ]);

const KNOWN_AUTH_STORAGE_KEYS =
  Object.freeze([
    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_temporary_token",
    "onion_two_factor_token",
    "onion_mfa_token",
    "onion_session_id",
    "onion_session_user_id",
    "onion_user_id",
    "onion_user_name",
    "onion_user_slug",
    "onion_role",

    "onion:token",
    "onion:user",
    "onion:accessToken",
    "onion:access_token",
    "onion:refreshToken",
    "onion:refresh_token",
    "onion:tempToken",
    "onion:temp_token",
    "onion:temporaryToken",
    "onion:temporary_token",
    "onion:twoFactorToken",
    "onion:two_factor_token",
    "onion:mfaToken",
    "onion:mfa_token",
    "onion:sessionId",
    "onion:session_id",
    "onion:sessionUserId",
    "onion:session_user_id",
    "onion:userId",
    "onion:user_id",
    "onion:userName",
    "onion:user_name",
    "onion:userSlug",
    "onion:user_slug",
    "onion:role",

    "auth_token",
    "authToken",
    "access_token",
    "accessToken",
    "refresh_token",
    "refreshToken",
    "temp_token",
    "tempToken",
    "temporary_token",
    "temporaryToken",
    "two_factor_token",
    "twoFactorToken",
    "mfa_token",
    "mfaToken",

    "token",
    "session",
    "user",
    "role",
    "session_id",
    "sessionId",
    "session_user_id",
    "sessionUserId",
    "user_id",
    "userId",
    "user_name",
    "userName",
    "user_slug",
    "userSlug",

    "auth.token",
    "auth.accessToken",
    "auth.access_token",
    "auth.refreshToken",
    "auth.refresh_token",
    "auth.tempToken",
    "auth.temp_token",
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

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
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
    if (value === 1) return true;
    if (value === 0) return false;
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
      "on",
    ].includes(text)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
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
  return isObject(value)
    ? value
    : {};
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value];
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean)
    )
  );
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
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

function safeSetState(patch = {}) {
  const safePatch =
    safeObject(patch);

  try {
    AppCore?.setState?.(
      safePatch
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        safePatch
      );
    }
  } catch {}

  return AppCore?.state || {};
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

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
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  }
}

function sanitizeUser(user = null) {
  if (!isObject(user)) {
    return null;
  }

  return {
    id:
      user.id ??
      user.userId ??
      user.user_id ??
      user._id ??
      user.uid ??
      null,

    userId:
      user.userId ??
      user.user_id ??
      user.id ??
      user._id ??
      user.uid ??
      null,

    username:
      user.username ||
      user.userName ||
      user.user_name ||
      user.slug ||
      null,

    email:
      user.email ||
      user.mail ||
      null,

    role:
      user.role ||
      user.rol ||
      user.userRole ||
      null,

    roles:
      Array.isArray(user.roles)
        ? user.roles
        : undefined,
  };
}

function sanitizeSnapshot(snapshot = {}) {
  const source =
    safeObject(snapshot);

  const user =
    source.user ||
    source.currentUser ||
    source.authUser ||
    source.sessionUser ||
    source.session?.user ||
    null;

  return {
    authenticated:
      Boolean(source.authenticated),

    hasToken:
      Boolean(
        source.token ||
        source.accessToken ||
        source.access_token ||
        source.session?.token ||
        source.session?.accessToken
      ),

    user:
      sanitizeUser(user),

    role:
      source.role ||
      source.userRole ||
      user?.role ||
      user?.rol ||
      null,

    roles:
      Array.isArray(source.roles)
        ? source.roles
        : [],

    username:
      source.username ||
      user?.username ||
      user?.userName ||
      user?.email ||
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
      (() => {
        try {
          return extractMessage(error);
        } catch {
          return error?.message || String(error);
        }
      })(),

    status:
      error?.status ||
      error?.response?.status ||
      error?.data?.status ||
      0,

    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      null,
  };
}

function sanitizeEventPayload(payload = {}, depth = 0) {
  if (depth > 5) {
    return "[MaxDepth]";
  }

  if (Array.isArray(payload)) {
    return payload.map((item) =>
      sanitizeEventPayload(
        item,
        depth + 1
      )
    );
  }

  if (!isObject(payload)) {
    return typeof payload === "string"
      ? redactSafe(payload)
      : payload;
  }

  if (
    payload.authenticated !== undefined ||
    payload.token !== undefined ||
    payload.accessToken !== undefined ||
    payload.user !== undefined
  ) {
    return sanitizeSnapshot(payload);
  }

  const output = {};

  for (const [key, value] of Object.entries(payload)) {
    const lower =
      safeText(key, "")
        .toLowerCase();

    if (
      lower.includes("token") ||
      lower.includes("authorization") ||
      lower.includes("password") ||
      lower === "code" ||
      lower === "t"
    ) {
      output[key] =
        value ? "***" : value;
      continue;
    }

    if (
      lower === "before" ||
      lower === "after" ||
      lower.includes("snapshot")
    ) {
      output[key] =
        sanitizeSnapshot(value);
      continue;
    }

    if (
      lower === "error" ||
      lower.includes("error")
    ) {
      output[key] =
        sanitizeError(value);
      continue;
    }

    if (
      lower.includes("path") ||
      lower.includes("url") ||
      lower.includes("redirect")
    ) {
      output[key] =
        typeof value === "string"
          ? redactSafe(value)
          : sanitizeEventPayload(
              value,
              depth + 1
            );
      continue;
    }

    output[key] =
      sanitizeEventPayload(
        value,
        depth + 1
      );
  }

  return output;
}

function safeEmit(eventName, payload = {}) {
  const cleanEvent =
    safeText(eventName, "");

  if (!cleanEvent) {
    return false;
  }

  const cleanPayload =
    sanitizeEventPayload(payload);

  try {
    AppCore?.events?.emit?.(
      cleanEvent,
      cleanPayload
    );
  } catch {}

  try {
    globalThis?.window?.AppCore?.events?.emit?.(
      cleanEvent,
      cleanPayload
    );
  } catch {}

  return true;
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

function normalizePathSafe(path = "/") {
  try {
    return normalizePath(path);
  } catch {
    let value =
      safeText(path, "/")
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    return value || "/";
  }
}

function normalizeCanonicalPathSafe(path = "/") {
  try {
    return normalizeCanonicalPath(path);
  } catch {
    return normalizePathSafe(path)
      .split("?")[0]
      .split("#")[0] || "/";
  }
}

function isSafeRelativePathSafe(path = "") {
  try {
    return isSafeRelativePath(path);
  } catch {
    const raw =
      safeText(path, "");

    return Boolean(
      raw &&
        raw.startsWith("/") &&
        !raw.startsWith("//") &&
        !/^[a-z][a-z0-9+.-]*:/i.test(raw) &&
        !/[\r\n\t]/.test(raw)
    );
  }
}

function resolveLoginPath() {
  const configured =
    safeText(
      AppCore?.config?.routes?.login,
      DEFAULT_LOGIN_PATH
    );

  const normalized =
    normalizePathSafe(configured || DEFAULT_LOGIN_PATH);

  return isSafeRelativePathSafe(normalized)
    ? normalized
    : DEFAULT_LOGIN_PATH;
}

function resolveRedirect(target = "") {
  const fallback =
    resolveLoginPath();

  const candidate =
    normalizePathSafe(
      safeText(target || fallback, fallback)
    );

  if (isSafeRelativePathSafe(candidate)) {
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

function getCurrentToken() {
  return safeText(
    AppCore?.state?.token ||
      AppCore?.state?.accessToken ||
      AppCore?.state?.session?.token ||
      AppCore?.state?.session?.accessToken ||
      "",
    ""
  );
}

function getRouter() {
  const candidates = [];

  try {
    if (isFunction(AppCore?.modules?.get)) {
      candidates.push(
        AppCore.modules.get("router"),
        AppCore.modules.get("Router")
      );
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
      candidates.push(
        window.Router,
        window.AppRouter,
        window.AppCore?.router,
        window.AppCore?.Router
      );
    } catch {}
  }

  return candidates.find((candidate) =>
    candidate &&
    (
      isFunction(candidate.navigate) ||
      isFunction(candidate.go)
    )
  ) || null;
}

function buildFinalUrl(endpoint = "") {
  const clean =
    safeText(endpoint, "");

  if (!clean) {
    return "/api/auth/logout";
  }

  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }

  const apiBase =
    safeText(
      AppCore?.config?.apiBase ||
      AppCore?.config?.api?.baseUrl ||
      AppCore?.config?.api?.base ||
      "",
      ""
    );

  if (!apiBase) {
    return clean;
  }

  return `${apiBase.replace(/\/+$/g, "")}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

/* =========================================================
   NAVIGATION
========================================================= */

function updateCoreRouteState(path = DEFAULT_LOGIN_PATH) {
  const publicPath =
    resolveRedirect(path);

  const canonicalPath =
    normalizeCanonicalPathSafe(publicPath);

  try {
    AppCore?.setRoute?.(canonicalPath);
  } catch {}

  try {
    AppCore?.setPublicPath?.(publicPath);
  } catch {}

  safeSetState({
    route:
      canonicalPath,
    publicPath,
  });

  return {
    route:
      canonicalPath,
    publicPath,
  };
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
          ok:
            true,
          reason:
            "router",
          path:
            finalPath,
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
          ok:
            true,
          reason:
            "router-go",
          path:
            finalPath,
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
          ok:
            true,
          reason:
            "appcore-navigate",
          path:
            finalPath,
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
        ok:
          true,
        reason:
          "browser",
        path:
          finalPath,
      };
    } catch {
      try {
        window.location.href =
          finalPath;

        return {
          ok:
            true,
          reason:
            "browser-href",
          path:
            finalPath,
        };
      } catch {}
    }
  }

  updateCoreRouteState(finalPath);

  return {
    ok:
      false,
    reason:
      "navigation-failed",
    path:
      finalPath,
  };
}

/* =========================================================
   FETCH WITH TIMEOUT
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
            try {
              controller.abort();
            } catch {}
          }
        }, Math.max(0, safeNumber(timeout, DEFAULT_LOGOUT_TIMEOUT_MS)))
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

function normalizeRemoteLogoutResult(result = null) {
  if (result === null || result === undefined) {
    return {
      ok:
        false,
      status:
        0,
      skipped:
        true,
    };
  }

  const status =
    safeNumber(
      result?.status ||
        result?.statusCode ||
        result?.status_code ||
        result?.response?.status ||
        0,
      0
    );

  const explicitOk =
    typeof result?.ok === "boolean"
      ? result.ok
      : typeof result?.success === "boolean"
        ? result.success
        : null;

  const ok =
    explicitOk !== null
      ? explicitOk ||
        ACCEPTED_REMOTE_LOGOUT_STATUSES.includes(status)
      : status === 0
        ? true
        : ACCEPTED_REMOTE_LOGOUT_STATUSES.includes(status);

  return {
    ok,
    status,
    skipped:
      false,
    raw:
      result,
  };
}

async function requestRemoteLogout(options = {}) {
  const endpoint =
    resolveLogoutEndpoint();

  const body =
    buildLogoutBody();

  const timeout =
    safeNumber(
      options.timeout ??
        options.timeoutMs,
      DEFAULT_LOGOUT_TIMEOUT_MS
    );

  const auth =
    options.auth !== false;

  const requestOptions = {
    auth,
    timeout,
    silent:
      true,
    emitEvents:
      options.emitRequestEvents === true,
    storeError:
      false,
    expectedStatuses:
      [...ACCEPTED_REMOTE_LOGOUT_STATUSES],
    _skipAuthRefresh:
      true,
  };

  if (isFunction(AppCore?.apiClient?.post)) {
    const result =
      await AppCore.apiClient.post(
        endpoint,
        body,
        requestOptions
      );

    return normalizeRemoteLogoutResult(result);
  }

  if (isFunction(AppCore?.apiClient?.request)) {
    const result =
      await AppCore.apiClient.request(
        endpoint,
        {
          ...requestOptions,
          method:
            "POST",
          body,
        }
      );

    return normalizeRemoteLogoutResult(result);
  }

  const http =
    AppCore?.http ||
    AppCore?.Http ||
    AppCore?.services?.http ||
    AppCore?.services?.Http ||
    null;

  if (isFunction(http?.post)) {
    const result =
      await http.post(
        endpoint,
        body,
        requestOptions
      );

    return normalizeRemoteLogoutResult(result);
  }

  if (isFunction(http?.request)) {
    const result =
      await http.request(
        "POST",
        endpoint,
        {
          ...requestOptions,
          body,
        }
      );

    return normalizeRemoteLogoutResult(result);
  }

  if (isFunction(AppCore?.request)) {
    const result =
      await AppCore.request(
        endpoint,
        {
          ...requestOptions,
          method:
            "POST",
          body,
        }
      );

    return normalizeRemoteLogoutResult(result);
  }

  if (typeof fetch === "function") {
    const url =
      buildFinalUrl(endpoint);

    const headers = {
      Accept:
        "application/json",
      "Content-Type":
        "application/json",
    };

    const token =
      getCurrentToken();

    if (
      auth &&
      token
    ) {
      headers.Authorization =
        `Bearer ${token}`;
    }

    const response =
      await fetchWithTimeout(
        url,
        {
          method:
            "POST",
          headers,
          credentials:
            "same-origin",
          body:
            JSON.stringify(body),
        },
        timeout
      );

    return normalizeRemoteLogoutResult({
      ok:
        response?.ok === true ||
        ACCEPTED_REMOTE_LOGOUT_STATUSES.includes(response?.status),
      status:
        response?.status || 0,
    });
  }

  return normalizeRemoteLogoutResult(null);
}

/* =========================================================
   LOCAL CLEAR
========================================================= */

function getStoragePrefixCandidates() {
  const prefix =
    safeText(
      AppCore?.config?.storagePrefix,
      "onion"
    );

  return unique([
    prefix,
    "onion",
  ]);
}

function buildStorageClearCandidates() {
  const prefixes =
    getStoragePrefixCandidates();

  const baseKeys =
    unique([
      ...KNOWN_AUTH_STORAGE_KEYS,

      AppCore?.config?.storageKeys?.token,
      AppCore?.config?.storageKeys?.user,
      AppCore?.config?.storageKeys?.refreshToken,
      AppCore?.config?.storageKeys?.tempToken,
      AppCore?.config?.storageKeys?.sessionId,
      AppCore?.config?.storageKeys?.sessionUserId,
      AppCore?.config?.storageKeys?.role,
    ]);

  const expanded = [];

  for (const key of baseKeys) {
    expanded.push(key);

    for (const prefix of prefixes) {
      if (!key.startsWith(`${prefix}:`)) {
        expanded.push(`${prefix}:${key}`);
      }

      if (!key.startsWith(`${prefix}_`)) {
        expanded.push(`${prefix}_${key.replace(/[:.]/g, "_")}`);
      }
    }

    expanded.push(
      key.replace(/:/g, "."),
      key.replace(/\./g, ":"),
      key.replace(/[:.]/g, "_")
    );
  }

  return unique(expanded);
}

function clearWebStorageKey(storage, key) {
  if (
    !storage ||
    !key
  ) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function clearKnownAuthStorage() {
  if (!isBrowser()) {
    return false;
  }

  const keys =
    buildStorageClearCandidates();

  let changed =
    false;

  for (const key of keys) {
    try {
      changed =
        clearWebStorageKey(
          window.localStorage,
          key
        ) || changed;
    } catch {}

    try {
      changed =
        clearWebStorageKey(
          window.sessionStorage,
          key
        ) || changed;
    } catch {}
  }

  return changed;
}

function clearAppCoreStorage() {
  const keys =
    buildStorageClearCandidates();

  let changed =
    false;

  const storage =
    AppCore?.storage || null;

  if (!storage) {
    return changed;
  }

  for (const key of keys) {
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

function clearInFlightRequests() {
  let cleared =
    0;

  try {
    cleared +=
      AppCore?.apiClient?.clearInFlight?.() || 0;
  } catch {}

  try {
    cleared +=
      AppCore?.request?.clearInFlight?.() || 0;
  } catch {}

  try {
    cleared +=
      AppCore?.http?.clearInFlight?.() || 0;
  } catch {}

  return cleared;
}

function clearDomAuthState() {
  if (!isBrowser()) {
    return false;
  }

  try {
    document.body?.setAttribute?.(
      "data-authenticated",
      "false"
    );

    document.documentElement?.setAttribute?.(
      "data-authenticated",
      "false"
    );

    document.body?.classList?.remove?.(
      "route-app",
      "app-authenticated"
    );

    document.documentElement?.classList?.remove?.(
      "app-authenticated"
    );

    document.body?.classList?.add?.(
      "route-auth"
    );
  } catch {}

  try {
    const shell =
      document.getElementById("app-shell");

    if (shell) {
      shell.setAttribute(
        "aria-busy",
        "false"
      );

      shell.dataset.authenticated =
        "false";
    }
  } catch {}

  return true;
}

function clearAppCoreSessionState(reason = "logout") {
  try {
    AppCore?.clearSession?.();
  } catch {}

  try {
    AppCore?.session?.clear?.();
  } catch {}

  safeSetState({
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
      "",
    userRole:
      "",
    roles:
      [],

    isAdmin:
      false,
    isSupport:
      false,
    isManager:
      false,

    token:
      null,
    accessToken:
      null,

    session:
      null,
    sessionId:
      null,
    sessionUserId:
      null,

    loginInProgress:
      false,
    twoFactorPending:
      false,
    tempToken:
      null,

    currentResolvedUsername:
      null,

    lastAuthSource:
      reason,
  });

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  return true;
}

function clearLocalSessionGuaranteed(options = {}) {
  const reason =
    safeText(options.reason, "logout");

  const silent =
    safeBool(options.silent, false);

  try {
    clearSessionLocal({
      silent:
        true,
      reason,
    });
  } catch {
    try {
      clearSessionLocal();
    } catch {}
  }

  try {
    clearAuthStorage({
      silent:
        true,
      includeLegacy:
        true,
    });
  } catch {}

  clearAppCoreSessionState(reason);
  clearAppCoreStorage();
  clearKnownAuthStorage();

  if (options.clearInFlightRequests !== false) {
    clearInFlightRequests();
  }

  clearDomAuthState();
  safeSetError(null);

  if (!silent) {
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
  }

  return true;
}

/* =========================================================
   CORE ACTION
========================================================= */

async function executeLogout(options = {}) {
  const sequence =
    ++logoutSequence;

  const startedAt =
    Date.now();

  const opts =
    safeObject(options);

  const redirectTo =
    opts.redirectTo ??
    opts.redirect ??
    opts.target ??
    "";

  const navigate =
    opts.navigate !== false &&
    opts.skipNavigate !== true;

  const remote =
    opts.remote !== false &&
    opts.skipRemote !== true;

  const silent =
    safeBool(opts.silent, false);

  const hardRedirect =
    safeBool(opts.hardRedirect, false);

  let before =
    null;

  try {
    before =
      buildSessionSnapshot({
        cause:
          "logout",
      });
  } catch {
    before =
      {
        authenticated:
          Boolean(AppCore?.state?.authenticated),
        token:
          AppCore?.state?.token || null,
        user:
          AppCore?.state?.user || null,
        role:
          AppCore?.state?.role || null,
        route:
          AppCore?.state?.route || "",
        publicPath:
          AppCore?.state?.publicPath || "",
      };
  }

  if (!silent) {
    safeEmit(
      "auth:logout:start",
      {
        sequence,
        before,
        source:
          "auth.logout",
        at:
          safeIsoDate(),
      }
    );
  }

  let remoteError =
    null;

  let remoteResult =
    null;

  if (remote) {
    try {
      remoteResult =
        await requestRemoteLogout(opts);

      if (!silent) {
        safeEmit(
          remoteResult?.ok
            ? "auth:logout:remote-success"
            : "auth:logout:remote-soft-failure",
          {
            sequence,
            status:
              remoteResult?.status || null,
            ok:
              Boolean(remoteResult?.ok),
            source:
              "auth.logout",
          }
        );
      }
    } catch (error) {
      remoteError =
        error;

      safeWarn(
        "Logout remoto falló; logout local continuará.",
        error
      );

      if (!silent) {
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
    }
  } else if (!silent) {
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
    Limpieza local SIEMPRE.
    Aunque el backend falle, el cliente no debe conservar sesión.
  */
  clearLocalSessionGuaranteed({
    ...opts,
    silent,
    reason:
      "logout",
  });

  let after =
    null;

  try {
    after =
      buildSessionSnapshot({
        cause:
          "logout",
      });
  } catch {
    after =
      {
        authenticated:
          false,
        token:
          null,
        user:
          null,
        role:
          null,
        route:
          AppCore?.state?.route || "",
        publicPath:
          AppCore?.state?.publicPath || "",
      };
  }

  const finalRedirect =
    navigate
      ? resolveRedirect(redirectTo)
      : null;

  let navigation =
    null;

  if (!silent) {
    safeEmit(
      "auth:logout:success",
      {
        sequence,
        hadSession:
          Boolean(before?.authenticated),
        remoteOk:
          !remoteError &&
          remoteResult?.ok !== false,
        remoteStatus:
          remoteResult?.status || null,
        before,
        after,
        redirectTo:
          finalRedirect,
        durationMs:
          Date.now() - startedAt,
        source:
          "auth.logout",
      }
    );

    safeEmit(
      "auth:logout",
      {
        sequence,
        hadSession:
          Boolean(before?.authenticated),
        remoteOk:
          !remoteError &&
          remoteResult?.ok !== false,
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

    safeEmit(
      "app:auth:change",
      {
        sequence,
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

    safeEmit(
      "app:user:change",
      {
        sequence,
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
  }

  if (
    navigate &&
    finalRedirect
  ) {
    navigation =
      await navigateTo(
        finalRedirect,
        {
          replaceState:
            opts.replaceState !== false,
          force:
            opts.force !== false,
          hardRedirect,
        }
      );

    if (!silent) {
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
  }

  return {
    ok:
      true,

    remoteOk:
      !remoteError &&
      remoteResult?.ok !== false,

    remoteStatus:
      remoteResult?.status || null,

    remoteSkipped:
      !remote,

    error:
      sanitizeError(remoteError),

    before:
      sanitizeSnapshot(before),

    after:
      sanitizeSnapshot(after),

    redirectTo:
      finalRedirect,

    navigation,

    durationMs:
      Date.now() - startedAt,

    sequence,

    version:
      AUTH_LOGOUT_VERSION,
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
      } catch (error) {
        /*
          Última línea defensiva:
          logout nunca debe dejar sesión viva por fallo accidental.
        */
        safeWarn(
          "Logout fatal recuperado con limpieza local.",
          error
        );

        try {
          clearLocalSessionGuaranteed({
            ...safeObject(options),
            silent:
              true,
            reason:
              "logout-fatal-recovery",
          });
        } catch {}

        safeEmit(
          "auth:logout:error",
          {
            error,
            message:
              extractMessage(error),
            source:
              "auth.logout",
          }
        );

        const redirectTo =
          options?.navigate === false ||
          options?.skipNavigate === true
            ? null
            : resolveRedirect(
                options?.redirectTo ||
                options?.redirect ||
                options?.target ||
                ""
              );

        let navigation =
          null;

        if (redirectTo) {
          try {
            navigation =
              await navigateTo(
                redirectTo,
                {
                  replaceState:
                    true,
                  force:
                    true,
                  hardRedirect:
                    options?.hardRedirect === true,
                }
              );
          } catch {}
        }

        return {
          ok:
            true,
          recovered:
            true,
          remoteOk:
            false,
          error:
            sanitizeError(error),
          redirectTo,
          navigation,
          version:
            AUTH_LOGOUT_VERSION,
        };
      } finally {
        logoutPromise =
          null;
      }
    })();

  return logoutPromise;
}

/* =========================================================
   DEBUG
========================================================= */

export function getLogoutSnapshot() {
  const body =
    buildLogoutBody();

  return {
    version:
      AUTH_LOGOUT_VERSION,

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

    hasRefreshToken:
      Boolean(body.refreshToken),

    hasSessionId:
      Boolean(body.sessionId),

    hasSessionUserId:
      Boolean(body.userId),

    route:
      redactSafe(AppCore?.state?.route || ""),

    publicPath:
      redactSafe(AppCore?.state?.publicPath || ""),

    hasRouter:
      Boolean(getRouter()),

    routerCapabilities: {
      navigate:
        Boolean(isFunction(getRouter()?.navigate)),

      go:
        Boolean(isFunction(getRouter()?.go)),
    },

    storageClearKeys:
      buildStorageClearCandidates(),
  };
}

/* =========================================================
   EXPORT
========================================================= */

export default logout;
