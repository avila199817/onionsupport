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
   - limpieza AppCore/session/storage redundante pero controlada
   - eventos saneados sin tokens/passwords/secrets
   - fallback fetch compatible con apiBase
   - remote logout acepta 401/403/404 como sesión ya inválida
   - no hace localStorage.clear()
   - no toca theme/lang/rutas públicas técnicas/initial URLs
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
   VERSION / INTERNAL STATE
========================================================= */

export const AUTH_LOGOUT_VERSION =
  "10.2.0";

let logoutPromise =
  null;

let logoutSequence =
  0;

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_LOGIN_PATH =
  "/login";

const DEFAULT_LOGOUT_TIMEOUT_MS =
  6000;

const LOGOUT_SOURCE =
  "auth.logout";

const ACCEPTED_REMOTE_LOGOUT_STATUSES =
  new Set([
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
    "challenge_token",
    "challengeToken",
    "two_factor_token",
    "twoFactorToken",
    "mfa_token",
    "mfaToken",

    "token",
    "session",
    "user",
    "role",
    "rol",
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

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isPlainObject(value)
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

function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
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
    safeText(value, "")
      .toLowerCase();

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

function nowMs() {
  return Date.now();
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
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
  const cleanPatch =
    safeObject(patch);

  try {
    AppCore?.setState?.(
      cleanPatch,
      options
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        cleanPatch
      );
    }
  } catch {}

  return getState();
}

function safeSetError(error = null) {
  try {
    AppCore?.setError?.(
      error || null
    );
  } catch {}

  return true;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthLogout]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[AuthLogout]",
        ...args
      );
    }
  } catch {}
}

/* =========================================================
   REDACTION / PUBLIC SNAPSHOTS
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
  if (!isPlainObject(user)) {
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
      user.user_role ||
      null,

    roles:
      Array.isArray(user.roles)
        ? user.roles
        : [],
  };
}

function sanitizeSnapshot(snapshot = {}) {
  const source =
    safeObject(snapshot);

  const session =
    safeObject(source.session);

  const user =
    source.user ||
    source.currentUser ||
    source.authUser ||
    source.sessionUser ||
    session.user ||
    null;

  const token =
    source.token ||
    source.accessToken ||
    source.access_token ||
    session.token ||
    session.accessToken ||
    "";

  return {
    authenticated:
      Boolean(source.authenticated),

    hasToken:
      Boolean(token),

    token:
      null,

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
      user?.user_name ||
      user?.email ||
      null,

    currentResolvedUsername:
      source.currentResolvedUsername ||
      source.resolvedUsername ||
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
      error?.statusCode ||
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
  if (depth > 6) {
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

  if (!isPlainObject(payload)) {
    return typeof payload === "string"
      ? redactSafe(payload)
      : payload;
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
      lower.includes("secret") ||
      lower === "code" ||
      lower === "otp" ||
      lower === "totp" ||
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
      lower === "user" ||
      lower === "currentuser" ||
      lower === "sessionuser" ||
      lower === "authuser"
    ) {
      output[key] =
        sanitizeUser(value);
      continue;
    }

    if (
      lower === "error" ||
      lower.endsWith("error") ||
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
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload =
    sanitizeEventPayload(payload);

  let emitted =
    false;

  try {
    AppCore?.events?.emit?.(
      name,
      cleanPayload
    );

    emitted =
      true;
  } catch {}

  try {
    if (
      isBrowser() &&
      window?.AppCore?.events?.emit &&
      window.AppCore !== AppCore
    ) {
      window.AppCore.events.emit(
        name,
        cleanPayload
      );

      emitted =
        true;
    }
  } catch {}

  try {
    if (
      isBrowser() &&
      !emitted
    ) {
      document.dispatchEvent(
        new CustomEvent(name, {
          detail:
            cleanPayload,
          bubbles:
            false,
          cancelable:
            false,
        })
      );

      emitted =
        true;
    }
  } catch {}

  return emitted;
}

/* =========================================================
   PATH / ROUTER RESOLUTION
========================================================= */

function normalizePathSafe(path = "/") {
  try {
    return normalizePath(path);
  } catch {
    let value =
      safeText(path, "/")
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) {
      value =
        `/${value}`;
    }

    return value || "/";
  }
}

function normalizeCanonicalPathSafe(path = "/") {
  try {
    return normalizeCanonicalPath(path);
  } catch {
    return (
      normalizePathSafe(path)
        .split("?")[0]
        .split("#")[0] || "/"
    );
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

function resolveLogoutEndpoint() {
  return safeText(
    AUTH_ENDPOINTS?.logout,
    "/api/auth/logout"
  );
}

function resolveLoginPath() {
  const configured =
    safeText(
      AppCore?.config?.routes?.login ||
        AppCore?.config?.loginPath,
      DEFAULT_LOGIN_PATH
    );

  const normalized =
    normalizePathSafe(
      configured || DEFAULT_LOGIN_PATH
    );

  return isSafeRelativePathSafe(normalized)
    ? normalized
    : DEFAULT_LOGIN_PATH;
}

function resolveRedirect(target = "") {
  const fallback =
    resolveLoginPath();

  const raw =
    safeText(target, "");

  const candidate =
    normalizePathSafe(raw || fallback);

  return isSafeRelativePathSafe(candidate)
    ? candidate
    : fallback;
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

  return (
    candidates.find((candidate) =>
      candidate &&
      (
        isFunction(candidate.navigate) ||
        isFunction(candidate.go)
      )
    ) || null
  );
}

function updateCoreRouteState(path = DEFAULT_LOGIN_PATH) {
  const publicPath =
    resolveRedirect(path);

  const route =
    normalizeCanonicalPathSafe(publicPath);

  try {
    AppCore?.setRoute?.(
      route
    );
  } catch {}

  try {
    AppCore?.setPublicPath?.(
      publicPath
    );
  } catch {}

  safeSetState({
    route,
    publicPath,
  });

  return {
    route,
    publicPath,
  };
}

function buildPopStateEvent() {
  try {
    return new PopStateEvent(
      "popstate"
    );
  } catch {
    try {
      return new Event(
        "popstate"
      );
    } catch {
      return null;
    }
  }
}

async function navigateTo(path = DEFAULT_LOGIN_PATH, options = {}) {
  const target =
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
            target,
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

        updateCoreRouteState(target);

        return {
          ok:
            true,
          reason:
            "router.navigate",
          path:
            target,
        };
      }

      if (isFunction(router?.go)) {
        const result =
          router.go(
            target,
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

        updateCoreRouteState(target);

        return {
          ok:
            true,
          reason:
            "router.go",
          path:
            target,
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
          AppCore.navigate(
            target,
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

        updateCoreRouteState(target);

        return {
          ok:
            true,
          reason:
            "AppCore.navigate",
          path:
            target,
        };
      }
    } catch (error) {
      safeWarn(
        "AppCore.navigate logout falló.",
        error
      );
    }

    try {
      if (
        isBrowser() &&
        window.history?.replaceState
      ) {
        if (replaceState) {
          window.history.replaceState(
            {
              path:
                target,
              publicPath:
                target,
              canonicalPath:
                normalizeCanonicalPathSafe(target),
              source:
                LOGOUT_SOURCE,
            },
            "",
            target
          );
        } else {
          window.history.pushState(
            {
              path:
                target,
              publicPath:
                target,
              canonicalPath:
                normalizeCanonicalPathSafe(target),
              source:
                LOGOUT_SOURCE,
            },
            "",
            target
          );
        }

        updateCoreRouteState(target);

        const event =
          buildPopStateEvent();

        if (event) {
          window.dispatchEvent(event);
        }

        return {
          ok:
            true,
          reason:
            "history",
          path:
            target,
        };
      }
    } catch (error) {
      safeWarn(
        "history logout navigation falló.",
        error
      );
    }
  }

  if (isBrowser()) {
    try {
      if (replaceState) {
        window.location.replace(target);
      } else {
        window.location.assign(target);
      }

      return {
        ok:
          true,
        reason:
          "browser",
        path:
          target,
      };
    } catch {
      try {
        window.location.href =
          target;

        return {
          ok:
            true,
          reason:
            "browser.href",
          path:
            target,
        };
      } catch {}
    }
  }

  updateCoreRouteState(target);

  return {
    ok:
      false,
    reason:
      "navigation-failed",
    path:
      target,
  };
}

/* =========================================================
   REMOTE LOGOUT · TRANSPORT
========================================================= */

function getConfiguredTimeout(options = {}) {
  return safeNumber(
    options.timeout ??
      options.timeoutMs ??
      AUTH_CONSTANTS?.requestTimeout ??
      DEFAULT_LOGOUT_TIMEOUT_MS,
    DEFAULT_LOGOUT_TIMEOUT_MS
  );
}

function buildLogoutBody() {
  return {
    refreshToken:
      safeText(
        getStoredRefreshToken(),
        ""
      ),

    sessionId:
      safeText(
        getStoredSessionId(),
        ""
      ),

    userId:
      safeText(
        getStoredSessionUserId(),
        ""
      ),
  };
}

function getCurrentToken() {
  const state =
    getState();

  return safeText(
    state.token ||
      state.accessToken ||
      state.session?.token ||
      state.session?.accessToken ||
      "",
    ""
  );
}

function getApiBase() {
  return safeText(
    AppCore?.config?.apiBase ||
      AppCore?.config?.api?.baseUrl ||
      AppCore?.config?.api?.base ||
      "",
    ""
  );
}

function joinApiUrl(apiBase = "", endpoint = "") {
  const cleanEndpoint =
    safeText(endpoint, "");

  if (!cleanEndpoint) {
    return "/api/auth/logout";
  }

  if (/^https?:\/\//i.test(cleanEndpoint)) {
    return cleanEndpoint;
  }

  const base =
    safeText(apiBase, "");

  if (!base) {
    return cleanEndpoint;
  }

  const normalizedBase =
    base.replace(/\/+$/g, "");

  let normalizedEndpoint =
    cleanEndpoint.startsWith("/")
      ? cleanEndpoint
      : `/${cleanEndpoint}`;

  /*
    Evita /api/api/auth/logout si apiBase ya termina en /api.
  */
  if (
    /\/api$/i.test(normalizedBase) &&
    normalizedEndpoint.startsWith("/api/")
  ) {
    normalizedEndpoint =
      normalizedEndpoint.replace(/^\/api/i, "");
  }

  return `${normalizedBase}${normalizedEndpoint}`;
}

function buildFinalUrl(endpoint = "") {
  return joinApiUrl(
    getApiBase(),
    endpoint
  );
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_LOGOUT_TIMEOUT_MS) {
  const controller =
    typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

  const ms =
    Math.max(
      0,
      safeNumber(
        timeoutMs,
        DEFAULT_LOGOUT_TIMEOUT_MS
      )
    );

  const timer =
    controller
      ? setTimeout(() => {
          try {
            controller.abort(
              "logout-timeout"
            );
          } catch {
            try {
              controller.abort();
            } catch {}
          }
        }, ms)
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

function getHttpService() {
  return (
    AppCore?.http ||
    AppCore?.Http ||
    AppCore?.services?.http ||
    AppCore?.services?.Http ||
    null
  );
}

function normalizeRemoteLogoutResult(result = null) {
  if (
    result === null ||
    result === undefined
  ) {
    return {
      ok:
        false,
      skipped:
        true,
      status:
        0,
    };
  }

  const status =
    safeNumber(
      result?.status ||
        result?.statusCode ||
        result?.status_code ||
        result?.response?.status ||
        result?.data?.status ||
        0,
      0
    );

  const explicitOk =
    typeof result?.ok === "boolean"
      ? result.ok
      : typeof result?.success === "boolean"
        ? result.success
        : null;

  const acceptedStatus =
    ACCEPTED_REMOTE_LOGOUT_STATUSES.has(status);

  const ok =
    explicitOk !== null
      ? Boolean(explicitOk || acceptedStatus)
      : status === 0
        ? true
        : acceptedStatus;

  return {
    ok,
    skipped:
      false,
    status,
    raw:
      result,
  };
}

async function callApiClientRequest(apiClient, endpoint, body, requestOptions) {
  if (!apiClient) {
    return null;
  }

  if (isFunction(apiClient.post)) {
    return apiClient.post(
      endpoint,
      body,
      requestOptions
    );
  }

  if (isFunction(apiClient.request)) {
    try {
      return await apiClient.request(
        endpoint,
        {
          ...requestOptions,
          method:
            "POST",
          body,
        }
      );
    } catch (firstError) {
      try {
        return await apiClient.request(
          "POST",
          endpoint,
          {
            ...requestOptions,
            body,
          }
        );
      } catch {
        throw firstError;
      }
    }
  }

  return null;
}

async function callHttpRequest(http, endpoint, body, requestOptions) {
  if (!http) {
    return null;
  }

  if (isFunction(http.post)) {
    return http.post(
      endpoint,
      body,
      requestOptions
    );
  }

  if (isFunction(http.request)) {
    try {
      return await http.request(
        endpoint,
        {
          ...requestOptions,
          method:
            "POST",
          body,
        }
      );
    } catch (firstError) {
      try {
        return await http.request(
          "POST",
          endpoint,
          {
            ...requestOptions,
            body,
          }
        );
      } catch {
        throw firstError;
      }
    }
  }

  return null;
}

async function requestRemoteLogout(options = {}) {
  const opts =
    safeObject(options);

  const endpoint =
    resolveLogoutEndpoint();

  const body =
    buildLogoutBody();

  const timeout =
    getConfiguredTimeout(opts);

  const auth =
    opts.auth !== false;

  const requestOptions = {
    auth,
    timeout,
    timeoutMs:
      timeout,

    silent:
      true,

    storeError:
      false,

    emitEvents:
      opts.emitRequestEvents === true,

    expectedStatuses:
      Array.from(
        ACCEPTED_REMOTE_LOGOUT_STATUSES
      ),

    _skipAuthRefresh:
      true,

    skipAuthRefresh:
      true,
  };

  const apiClient =
    AppCore?.apiClient ||
    AppCore?.services?.apiClient ||
    AppCore?.services?.api ||
    null;

  const fromApiClient =
    await callApiClientRequest(
      apiClient,
      endpoint,
      body,
      requestOptions
    );

  if (fromApiClient !== null) {
    return normalizeRemoteLogoutResult(
      fromApiClient
    );
  }

  const http =
    getHttpService();

  const fromHttp =
    await callHttpRequest(
      http,
      endpoint,
      body,
      requestOptions
    );

  if (fromHttp !== null) {
    return normalizeRemoteLogoutResult(
      fromHttp
    );
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

    return normalizeRemoteLogoutResult(
      result
    );
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
        ACCEPTED_REMOTE_LOGOUT_STATUSES.has(
          response?.status
        ),

      status:
        response?.status || 0,
    });
  }

  return normalizeRemoteLogoutResult(null);
}

/* =========================================================
   LOCAL CLEAR · STORAGE
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

  const configuredKeys =
    [
      AppCore?.config?.storageKeys?.token,
      AppCore?.config?.storageKeys?.user,
      AppCore?.config?.storageKeys?.refreshToken,
      AppCore?.config?.storageKeys?.tempToken,
      AppCore?.config?.storageKeys?.sessionId,
      AppCore?.config?.storageKeys?.sessionUserId,
      AppCore?.config?.storageKeys?.role,
    ];

  const baseKeys =
    unique([
      ...KNOWN_AUTH_STORAGE_KEYS,
      ...configuredKeys,
    ]);

  const expanded =
    [];

  for (const key of baseKeys) {
    expanded.push(key);

    for (const prefix of prefixes) {
      if (!key.startsWith(`${prefix}:`)) {
        expanded.push(`${prefix}:${key}`);
      }

      if (!key.startsWith(`${prefix}_`)) {
        expanded.push(
          `${prefix}_${key.replace(/[:.]/g, "_")}`
        );
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

function clearKnownAuthWebStorage() {
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
  const storage =
    AppCore?.storage || null;

  if (!storage) {
    return false;
  }

  const keys =
    buildStorageClearCandidates();

  let changed =
    false;

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
        storage.setRaw(
          key,
          ""
        );
        changed = true;
        continue;
      }
    } catch {}

    try {
      if (isFunction(storage.set)) {
        storage.set(
          key,
          null
        );
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

  try {
    cleared +=
      AppCore?.Http?.clearInFlight?.() || 0;
  } catch {}

  return cleared;
}

/* =========================================================
   LOCAL CLEAR · STATE / DOM
========================================================= */

function getClearAuthStatePatch(reason = "logout") {
  return {
    authenticated:
      false,

    hasToken:
      false,

    token:
      null,

    accessToken:
      null,

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

    isClient:
      false,

    session:
      null,

    sessionId:
      null,

    sessionUserId:
      null,

    currentResolvedUsername:
      null,

    resolvedUsername:
      null,

    loginInProgress:
      false,

    twoFactorPending:
      false,

    tempToken:
      null,

    lastAuthSource:
      reason,
  };
}

function clearDomAuthState() {
  if (!isBrowser()) {
    return false;
  }

  try {
    document.documentElement?.setAttribute?.(
      "data-authenticated",
      "false"
    );

    document.body?.setAttribute?.(
      "data-authenticated",
      "false"
    );

    document.documentElement?.classList?.remove?.(
      "app-authenticated",
      "route-app"
    );

    document.body?.classList?.remove?.(
      "app-authenticated",
      "route-app"
    );

    document.documentElement?.classList?.add?.(
      "route-auth"
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

  try {
    const main =
      document.getElementById("main-content");

    if (main) {
      main.setAttribute(
        "aria-busy",
        "false"
      );
    }
  } catch {}

  try {
    const view =
      document.getElementById("view-container");

    if (view) {
      view.setAttribute(
        "aria-busy",
        "false"
      );
    }
  } catch {}

  return true;
}

function clearAppCoreSessionState(reason = "logout") {
  try {
    AppCore?.clearSession?.({
      silent:
        true,
      reason,
    });
  } catch {
    try {
      AppCore?.clearSession?.();
    } catch {}
  }

  try {
    AppCore?.session?.clear?.({
      silent:
        true,
      reason,
    });
  } catch {
    try {
      AppCore?.session?.clear?.();
    } catch {}
  }

  safeSetState(
    getClearAuthStatePatch(reason),
    {
      forceUnauthenticated:
        true,
    }
  );

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  return true;
}

function clearLocalSessionGuaranteed(options = {}) {
  const opts =
    safeObject(options);

  const reason =
    safeText(
      opts.reason,
      "logout"
    );

  const silent =
    safeBool(
      opts.silent,
      false
    );

  try {
    clearSessionLocal({
      silent:
        true,
      reason,

      /*
        clearSessionLocal ya protege rutas técnicas públicas.
        Aquí no forzamos preserveRoute salvo que venga explícito.
      */
      preserveRoute:
        opts.preserveRoute === true,

      preserveCurrentRoute:
        opts.preserveCurrentRoute === true,

      route:
        opts.route,

      publicPath:
        opts.publicPath,
    });
  } catch {
    try {
      clearSessionLocal({
        silent:
          true,
      });
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
  clearKnownAuthWebStorage();

  if (opts.clearInFlightRequests !== false) {
    clearInFlightRequests();
  }

  clearDomAuthState();
  safeSetError(null);

  if (!silent) {
    safeEmit(
      "auth:logout:local-cleared",
      {
        reason,
        source:
          LOGOUT_SOURCE,
        authenticated:
          false,
        user:
          null,
        role:
          null,
      }
    );

    safeEmit(
      "app:ui:repair-request",
      {
        reason:
          "logout-local-clear",
        source:
          LOGOUT_SOURCE,
        authenticated:
          false,
        user:
          null,
        role:
          null,
        repairShell:
          false,
        hardRepair:
          false,
        rebind:
          false,
      }
    );
  }

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function buildSafeSessionSnapshot(extra = {}) {
  try {
    return buildSessionSnapshot({
      ...extra,
    });
  } catch {
    const state =
      getState();

    return {
      authenticated:
        Boolean(state.authenticated),

      token:
        state.token ||
        state.accessToken ||
        null,

      accessToken:
        state.accessToken ||
        state.token ||
        null,

      user:
        state.user ||
        state.currentUser ||
        state.authUser ||
        state.sessionUser ||
        state.session?.user ||
        null,

      role:
        state.role ||
        state.userRole ||
        null,

      roles:
        Array.isArray(state.roles)
          ? state.roles
          : [],

      route:
        state.route || "/",

      publicPath:
        state.publicPath || "/",

      ...extra,
    };
  }
}

/* =========================================================
   CORE ACTION
========================================================= */

async function executeLogout(options = {}) {
  const sequence =
    ++logoutSequence;

  const startedAt =
    nowMs();

  const opts =
    safeObject(options);

  const redirectTo =
    opts.redirectTo ??
    opts.redirect ??
    opts.target ??
    "";

  const shouldNavigate =
    opts.navigate !== false &&
    opts.skipNavigate !== true;

  const shouldRemote =
    opts.remote !== false &&
    opts.skipRemote !== true;

  const silent =
    safeBool(
      opts.silent,
      false
    );

  const hardRedirect =
    safeBool(
      opts.hardRedirect,
      false
    );

  const before =
    buildSafeSessionSnapshot({
      cause:
        "logout",
    });

  if (!silent) {
    safeEmit(
      "auth:logout:start",
      {
        sequence,
        before,
        source:
          LOGOUT_SOURCE,
        at:
          safeIsoDate(),
      }
    );
  }

  let remoteError =
    null;

  let remoteResult =
    null;

  if (shouldRemote) {
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
            ok:
              Boolean(remoteResult?.ok),
            status:
              remoteResult?.status || null,
            source:
              LOGOUT_SOURCE,
          }
        );
      }
    } catch (error) {
      remoteError =
        error;

      safeWarn(
        "Logout remoto falló; la limpieza local continúa.",
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
              LOGOUT_SOURCE,
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
          LOGOUT_SOURCE,
      }
    );
  }

  /*
    Limpieza local garantizada.
    El cliente no conserva sesión aunque el backend falle.
  */
  clearLocalSessionGuaranteed({
    ...opts,
    silent,
    reason:
      "logout",
  });

  const after =
    buildSafeSessionSnapshot({
      cause:
        "logout",
    });

  const finalRedirect =
    shouldNavigate
      ? resolveRedirect(redirectTo)
      : null;

  const remoteOk =
    !remoteError &&
    (
      !shouldRemote ||
      remoteResult?.ok !== false
    );

  if (!silent) {
    safeEmit(
      "auth:logout:success",
      {
        sequence,
        hadSession:
          Boolean(before?.authenticated),
        remoteOk,
        remoteStatus:
          remoteResult?.status || null,
        remoteSkipped:
          !shouldRemote,
        before,
        after,
        redirectTo:
          finalRedirect,
        durationMs:
          nowMs() - startedAt,
        source:
          LOGOUT_SOURCE,
      }
    );

    safeEmit(
      "auth:logout",
      {
        sequence,
        hadSession:
          Boolean(before?.authenticated),
        remoteOk,
        remoteSkipped:
          !shouldRemote,
        redirectTo:
          finalRedirect,
        source:
          LOGOUT_SOURCE,
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
          LOGOUT_SOURCE,
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
          LOGOUT_SOURCE,
      }
    );

    safeEmit(
      "auth:change",
      {
        sequence,
        authenticated:
          false,
        user:
          null,
        role:
          null,
        source:
          LOGOUT_SOURCE,
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
          LOGOUT_SOURCE,
      }
    );
  }

  let navigation =
    null;

  if (
    shouldNavigate &&
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
            LOGOUT_SOURCE,
        }
      );
    }
  }

  return {
    ok:
      true,

    recovered:
      false,

    remoteOk,

    remoteStatus:
      remoteResult?.status || null,

    remoteSkipped:
      !shouldRemote,

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
      nowMs() - startedAt,

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
          Última defensa:
          logout nunca debe dejar sesión viva por un fallo accidental.
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
              LOGOUT_SOURCE,
          }
        );

        const shouldNavigate =
          options?.navigate !== false &&
          options?.skipNavigate !== true;

        const redirectTo =
          shouldNavigate
            ? resolveRedirect(
                options?.redirectTo ||
                options?.redirect ||
                options?.target ||
                ""
              )
            : null;

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

          remoteStatus:
            null,

          remoteSkipped:
            options?.remote === false ||
            options?.skipRemote === true,

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

  const router =
    getRouter();

  const state =
    getState();

  return {
    version:
      AUTH_LOGOUT_VERSION,

    inFlight:
      Boolean(logoutPromise),

    sequence:
      logoutSequence,

    endpoint:
      resolveLogoutEndpoint(),

    finalEndpointUrl:
      redactSafe(
        buildFinalUrl(
          resolveLogoutEndpoint()
        )
      ),

    loginPath:
      resolveLoginPath(),

    authenticated:
      Boolean(state.authenticated),

    hasToken:
      Boolean(
        state.token ||
        state.accessToken ||
        state.session?.token ||
        state.session?.accessToken
      ),

    hasRefreshToken:
      Boolean(body.refreshToken),

    hasSessionId:
      Boolean(body.sessionId),

    hasSessionUserId:
      Boolean(body.userId),

    route:
      redactSafe(state.route || ""),

    publicPath:
      redactSafe(state.publicPath || ""),

    hasRouter:
      Boolean(router),

    routerCapabilities: {
      navigate:
        Boolean(
          isFunction(router?.navigate)
        ),

      go:
        Boolean(
          isFunction(router?.go)
        ),
    },

    storageClearKeys:
      buildStorageClearCandidates(),

    at:
      safeIsoDate(),
  };
}

/* =========================================================
   EXPORT
========================================================= */

export default logout;
