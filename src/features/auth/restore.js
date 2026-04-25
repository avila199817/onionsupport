/* =========================================================
   Onion SPA - Auth Restore
   Archivo: src/features/auth/restore.js

   RESPONSABILIDADES:
   - cargar usuario actual desde /me
   - refrescar access token
   - restaurar sesión desde token o refresh context
   - serializar me / refresh / restore
   - evitar carreras concurrentes
   - priorizar refresh cuando exista contexto válido
   - endurecer errores y limpieza de sesión
   - respetar rutas públicas técnicas durante boot
   - no romper /activate-account?token=...
   - no confundir opciones restore con runtimeSession

   HARDENING EXTREMO:
   - promises únicas anti race-condition
   - cooldown anti refresh-loop
   - fallback refresh -> token -> /me
   - limpieza auth protegida
   - preservación route/publicPath en activation/reset
   - eventos enterprise
   - tolerancia backend heterogéneo
   - snapshot consistente
   - no romper boot aunque backend falle
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  extractMessage,
  hasValidToken,
} from "./helpers.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  extractToken,
  extractUser,
  extractRefreshToken,
  normalizeSessionPayload,
} from "./normalize.js";

import {
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
  hasRefreshContext,
} from "./storage.js";

import {
  applySession,
  clearSessionLocal,
  buildSessionSnapshot,
} from "./session.js";

/* =========================================================
   INTERNAL DEFAULT SESSION
========================================================= */

const runtimeSession = {
  checking: false,
  refreshing: false,
  restoring: false,

  mePromise: null,
  refreshPromise: null,
  restorePromise: null,

  lastCheckAt: 0,
  lastRefreshAt: 0,

  refreshFailCount: 0,
  refreshBlockedUntil: 0,
};

/* =========================================================
   CONSTANTS
========================================================= */

const ACTIVATION_PATH = "/activate-account";

const PUBLIC_TECHNICAL_ROUTES = new Set([
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
]);

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeNumber(
  value,
  fallback = 0
) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeText(
  value,
  fallback = ""
) {
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

function safeBool(value) {
  return value === true;
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function getState() {
  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function emit(
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function log(...args) {
  try {
    AppCore?.utils?.log?.(
      "[AuthRestore]",
      ...args
    );
  } catch {}
}

function warn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthRestore]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AuthRestore]",
      ...args
    );
  } catch {}
}

function getMaxSequentialFailures() {
  return safeNumber(
    AUTH_CONSTANTS?.maxSequentialRefreshFailures,
    3
  );
}

function getRefreshRetryCooldownMs() {
  return safeNumber(
    AUTH_CONSTANTS?.refreshRetryCooldownMs,
    60000
  );
}

function hasApiGet() {
  return (
    typeof AppCore?.apiClient?.get === "function"
  );
}

function hasApiPost() {
  return (
    typeof AppCore?.apiClient?.post === "function"
  );
}

/* =========================================================
   SESSION / OPTIONS RESOLUTION
========================================================= */

function looksLikeRuntimeSession(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    (
      Object.prototype.hasOwnProperty.call(value, "checking") ||
      Object.prototype.hasOwnProperty.call(value, "refreshing") ||
      Object.prototype.hasOwnProperty.call(value, "restoring") ||
      Object.prototype.hasOwnProperty.call(value, "mePromise") ||
      Object.prototype.hasOwnProperty.call(value, "refreshPromise") ||
      Object.prototype.hasOwnProperty.call(value, "restorePromise")
    )
  );
}

function getSession(session) {
  return looksLikeRuntimeSession(session)
    ? session
    : runtimeSession;
}

function resolveRestoreArgs(input = {}) {
  const value =
    input &&
    typeof input === "object"
      ? input
      : {};

  if (looksLikeRuntimeSession(value)) {
    return {
      session: value,
      options: {},
    };
  }

  return {
    session: runtimeSession,
    options: {
      silent:
        Boolean(value.silent),
      skipNavigation:
        Boolean(value.skipNavigation),
      publicRoute:
        Boolean(value.publicRoute),
      preserveCurrentRoute:
        Boolean(value.preserveCurrentRoute),
      preserveRoute:
        Boolean(value.preserveRoute),
    },
  };
}

function clearRuntimeFlags(session) {
  if (!session) {
    return;
  }

  session.checking = false;
  session.refreshing = false;
  session.restoring = false;

  session.mePromise = null;
  session.refreshPromise = null;
  session.restorePromise = null;
}

/* =========================================================
   PATH / ROUTE PROTECTION
========================================================= */

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function normalizePathnameOnly(pathname = "/") {
  let value =
    String(pathname || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function stripSearchAndHash(path = "/") {
  const raw =
    safeText(path, "/");

  return normalizePathnameOnly(
    raw.split("?")[0].split("#")[0] || "/"
  );
}

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeHashRouterPath(
        parsed.hash
      );
    }

    return `${normalizePathnameOnly(
      parsed.pathname || "/"
    )}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    const hashIndex =
      raw.indexOf("#");

    if (hashIndex >= 0) {
      const hash =
        raw.slice(hashIndex);

      if (isHashRouterPath(hash)) {
        return normalizeHashRouterPath(hash);
      }
    }

    return raw.startsWith("/")
      ? raw
      : `/${raw}`;
  }
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeHashRouterPath(hash);
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function getInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_INITIAL_URL__,
    ""
  );
}

function getActivationInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__,
    ""
  );
}

function hasTokenInSearch(search = "") {
  try {
    const params =
      new URLSearchParams(search || "");

    return ACTIVATION_TOKEN_PARAM_NAMES.some(
      (name) =>
        Boolean(
          safeText(params.get(name), "")
        )
    );
  } catch {
    return false;
  }
}

function extractActivationPathToken(path = "") {
  const normalized =
    pathFromUrlLike(path) || path || "";

  const pathname =
    stripSearchAndHash(normalized);

  const parts =
    pathname.split("/").filter(Boolean);

  const index =
    parts.findIndex(
      (part) => part === "activate-account"
    );

  if (
    index >= 0 &&
    parts[index + 1]
  ) {
    try {
      return safeText(
        decodeURIComponent(parts[index + 1]),
        ""
      );
    } catch {
      return safeText(parts[index + 1], "");
    }
  }

  return "";
}

function hasActivationToken(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    const path =
      pathFromUrlLike(raw);

    if (
      isActivationCanonical(
        getCanonicalPathFromAny(path)
      ) &&
      extractActivationPathToken(path)
    ) {
      return true;
    }

    if (hasTokenInSearch(parsed.search)) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : ""
      );
    }
  } catch {
    const path =
      pathFromUrlLike(raw) || raw;

    if (
      isActivationCanonical(
        getCanonicalPathFromAny(path)
      ) &&
      extractActivationPathToken(path)
    ) {
      return true;
    }

    if (path.includes("?")) {
      const query =
        path.split("?").slice(1).join("?").split("#")[0];

      if (
        hasTokenInSearch(
          query ? `?${query}` : ""
        )
      ) {
        return true;
      }
    }

    if (
      path.includes("#") &&
      path.includes("?")
    ) {
      const query =
        path.split("?").slice(1).join("?");

      if (
        hasTokenInSearch(
          query ? `?${query}` : ""
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function getCanonicalPathFromAny(value = "/") {
  return stripSearchAndHash(
    pathFromUrlLike(value) || value || "/"
  );
}

function isPublicTechnicalCanonical(path = "/") {
  return PUBLIC_TECHNICAL_ROUTES.has(
    stripSearchAndHash(path)
  );
}

function isActivationCanonical(path = "/") {
  const clean =
    stripSearchAndHash(path);

  return (
    clean === ACTIVATION_PATH ||
    clean.startsWith(`${ACTIVATION_PATH}/`)
  );
}

function isActivationTokenScrubbed() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.scrubbedActivationToken
    );
  } catch {
    return false;
  }
}

function detectActivationBoot() {
  const state =
    getState();

  if (
    state.bootIsActivation === true &&
    state.bootHasActivationToken === true
  ) {
    return true;
  }

  if (isActivationTokenScrubbed()) {
    return false;
  }

  const candidates = [
    state.bootActivationInitialUrl,
    getActivationInitialUrl(),
    state.bootInitialUrl,
    getInitialUrl(),
    getBrowserPublicPath(),
    state.publicPath,
    state.route,
  ]
    .map((value) => safeText(value, ""))
    .filter(Boolean);

  return candidates.some((candidate) => {
    const canonical =
      getCanonicalPathFromAny(candidate);

    return (
      isActivationCanonical(canonical) &&
      hasActivationToken(candidate)
    );
  });
}

function captureRouteContext(options = {}) {
  const state =
    getState();

  const browserPath =
    getBrowserPublicPath();

  const publicPath =
    safeText(
      state.publicPath,
      ""
    ) ||
    browserPath ||
    "/";

  const route =
    safeText(
      state.route,
      ""
    ) ||
    getCanonicalPathFromAny(publicPath);

  const initialUrl =
    getInitialUrl();

  const activationInitialUrl =
    getActivationInitialUrl();

  const canonical =
    getCanonicalPathFromAny(
      publicPath || route || browserPath || "/"
    );

  const activationBoot =
    detectActivationBoot();

  const publicTechnical =
    isPublicTechnicalCanonical(canonical);

  const shouldProtect =
    Boolean(
      options.publicRoute ||
      options.preserveCurrentRoute ||
      options.preserveRoute ||
      activationBoot ||
      publicTechnical
    );

  return {
    shouldProtect,
    activationBoot,
    publicTechnical,
    route:
      getCanonicalPathFromAny(route || canonical || "/"),
    publicPath:
      publicPath || browserPath || route || "/",
    browserPath,
    initialUrl,
    activationInitialUrl,
    canonical,
  };
}

function restoreRouteContext(routeContext = {}) {
  if (!routeContext?.shouldProtect) {
    return false;
  }

  const route =
    routeContext.route ||
    routeContext.canonical ||
    "/";

  const publicPath =
    routeContext.publicPath ||
    routeContext.browserPath ||
    route;

  try {
    AppCore?.setRoute?.(route);
  } catch {}

  try {
    AppCore?.setPublicPath?.(publicPath);
  } catch {}

  try {
    AppCore?.setState?.({
      route,
      publicPath,
      bootIsActivation:
        routeContext.activationBoot ||
        getState().bootIsActivation ||
        false,
      bootHasActivationToken:
        routeContext.activationBoot ||
        getState().bootHasActivationToken ||
        false,
    });
  } catch {}

  return true;
}

function clearSessionLocalProtected({
  options = {},
  routeContext = null,
  reason = "",
} = {}) {
  const ctx =
    routeContext ||
    captureRouteContext(options);

  try {
    clearSessionLocal({
      silent: true,
      preserveRoute:
        ctx.shouldProtect,
      preserveCurrentRoute:
        ctx.shouldProtect,
      reason,
    });
  } catch {
    try {
      clearSessionLocal({
        silent: true,
      });
    } catch {}
  }

  restoreRouteContext(ctx);

  return true;
}

/* =========================================================
   STORAGE PAYLOAD
========================================================= */

function getStoredRefreshPayload() {
  return {
    refreshToken: String(
      getStoredRefreshToken() || ""
    ).trim(),

    sessionId: String(
      getStoredSessionId() || ""
    ).trim(),

    userId: String(
      getStoredSessionUserId() || ""
    ).trim(),
  };
}

function shouldClearForError(error) {
  const status =
    error?.status ||
    error?.response?.status ||
    0;

  return (
    status === 401 ||
    status === 403
  );
}

/* =========================================================
   /ME
========================================================= */

export async function fetchMe(
  sessionArg = {}
) {
  const session =
    getSession(sessionArg);

  if (!hasValidToken()) {
    throw new Error(
      "No hay token disponible para /me."
    );
  }

  if (!hasApiGet()) {
    throw new Error(
      "apiClient.get no disponible."
    );
  }

  if (session.mePromise) {
    return session.mePromise;
  }

  session.checking = true;

  emit("auth:me:start");

  session.mePromise =
    (async () => {
      try {
        const response =
          await AppCore.apiClient.get(
            AUTH_ENDPOINTS.me,
            {
              auth: true,
            }
          );

        const user =
          extractUser(response) ||
          extractUser(response?.data) ||
          response?.user ||
          null;

        if (!user) {
          throw new Error(
            "No se pudo resolver usuario desde /me."
          );
        }

        const snapshot =
          applySession({
            user,
          });

        session.lastCheckAt =
          Date.now();

        emit(
          "auth:me:success",
          {
            user:
              snapshot?.user ||
              user,
          }
        );

        return (
          snapshot?.user ||
          user
        );
      } catch (error) {
        emit(
          "auth:me:error",
          {
            error,
            message:
              extractMessage(error),
          }
        );

        throw error;
      } finally {
        session.checking = false;
        session.mePromise = null;
      }
    })();

  return session.mePromise;
}

/* =========================================================
   REFRESH
========================================================= */

export async function refreshSession(
  sessionArg = {}
) {
  const session =
    getSession(sessionArg);

  if (!hasRefreshContext()) {
    throw new Error(
      "No hay contexto refresh."
    );
  }

  if (!hasApiPost()) {
    throw new Error(
      "apiClient.post no disponible."
    );
  }

  if (session.refreshPromise) {
    return session.refreshPromise;
  }

  const now =
    Date.now();

  if (
    safeNumber(
      session.refreshBlockedUntil,
      0
    ) > now
  ) {
    throw new Error(
      "Refresh temporalmente bloqueado."
    );
  }

  session.refreshing = true;

  emit("auth:refresh:start");

  session.refreshPromise =
    (async () => {
      try {
        const requestBody =
          getStoredRefreshPayload();

        const response =
          await AppCore.apiClient.post(
            AUTH_ENDPOINTS.refresh,
            requestBody,
            {
              auth: false,
            }
          );

        const nextToken =
          extractToken(response);

        const nextUser =
          extractUser(response);

        const nextRefreshToken =
          extractRefreshToken(response);

        const nextSessionData =
          normalizeSessionPayload(response);

        if (
          !nextToken &&
          !nextUser
        ) {
          throw new Error(
            "Refresh sin datos de sesión."
          );
        }

        const snapshot =
          applySession({
            token:
              nextToken ??
              AppCore?.state?.token,

            user:
              nextUser ??
              AppCore?.state?.user,

            refreshToken:
              nextRefreshToken ??
              requestBody.refreshToken,

            sessionData:
              nextSessionData || {
                sessionId:
                  requestBody.sessionId,
                userId:
                  requestBody.userId,
              },
          });

        if (
          !snapshot?.token &&
          !hasValidToken()
        ) {
          throw new Error(
            "Refresh completado sin token."
          );
        }

        session.lastRefreshAt =
          Date.now();

        session.refreshFailCount = 0;
        session.refreshBlockedUntil = 0;

        emit(
          "auth:refresh:success",
          {
            ...snapshot,
          }
        );

        return {
          ok: true,
          ...snapshot,
          response,
        };
      } catch (error) {
        session.refreshFailCount =
          safeNumber(
            session.refreshFailCount,
            0
          ) + 1;

        if (
          session.refreshFailCount >=
          getMaxSequentialFailures()
        ) {
          session.refreshBlockedUntil =
            Date.now() +
            getRefreshRetryCooldownMs();
        }

        emit(
          "auth:refresh:error",
          {
            error,
            message:
              extractMessage(error),
            refreshFailCount:
              session.refreshFailCount,
            refreshBlockedUntil:
              session.refreshBlockedUntil ||
              null,
          }
        );

        throw error;
      } finally {
        session.refreshing = false;
        session.refreshPromise = null;
      }
    })();

  return session.refreshPromise;
}

/* =========================================================
   RESTORE MODES
========================================================= */

export async function restoreUsingMe(
  session = {}
) {
  const user =
    await fetchMe(session);

  emit(
    "auth:restore:success",
    {
      source: "me",
      user,
    }
  );

  return {
    ok: true,
    user,
    source: "me",
  };
}

export async function restoreUsingRefreshOnly(
  session = {}
) {
  const refreshed =
    await refreshSession(session);

  if (
    !AppCore?.state?.user &&
    hasValidToken()
  ) {
    await fetchMe(session);
  }

  emit(
    "auth:restore:success",
    {
      source: "refresh-only",
      user:
        AppCore?.state?.user ||
        null,
    }
  );

  return {
    ok: true,
    source: "refresh-only",
    user:
      AppCore?.state?.user ||
      null,
    refreshed,
  };
}

export async function restoreUsingRefreshPreferred(
  session = {}
) {
  return restoreUsingRefreshOnly(session);
}

export async function restoreAfterMeFailure(
  session = {},
  meError,
  options = {},
  routeContext = null
) {
  warn(
    "fetchMe() falló durante restore.",
    meError
  );

  if (!hasRefreshContext()) {
    clearSessionLocalProtected({
      options,
      routeContext,
      reason: "me-failed-no-refresh-context",
    });

    emit(
      "auth:restore:error",
      {
        error: meError,
        message:
          extractMessage(meError),
      }
    );

    return {
      ok: false,
      user: null,
      error: meError,
    };
  }

  try {
    return await restoreUsingRefreshOnly(
      session
    );
  } catch (refreshError) {
    clearSessionLocalProtected({
      options,
      routeContext,
      reason: "refresh-after-me-failed",
    });

    emit(
      "auth:restore:error",
      {
        error: refreshError,
        message:
          extractMessage(refreshError),
      }
    );

    return {
      ok: false,
      user: null,
      error: refreshError,
    };
  }
}

/* =========================================================
   RESTORE SESSION
========================================================= */

export async function restoreSession(
  input = {}
) {
  const {
    session,
    options,
  } = resolveRestoreArgs(input);

  const routeContext =
    captureRouteContext(options);

  if (session.restorePromise) {
    return session.restorePromise;
  }

  session.restoring = true;

  emit(
    "auth:restore:start",
    {
      hasToken:
        hasValidToken(),
      hasUser:
        Boolean(
          AppCore?.state?.user
        ),
      hasRefreshContext:
        hasRefreshContext(),
      publicRoute:
        Boolean(options.publicRoute),
      preserveCurrentRoute:
        Boolean(options.preserveCurrentRoute),
      activationBoot:
        routeContext.activationBoot,
      protectedRoute:
        routeContext.shouldProtect,
      route:
        routeContext.route,
      publicPath:
        routeContext.publicPath,
    }
  );

  session.restorePromise =
    (async () => {
      try {
        const tokenAvailable =
          hasValidToken();

        const refreshAvailable =
          hasRefreshContext();

        if (
          !tokenAvailable &&
          !refreshAvailable
        ) {
          clearSessionLocalProtected({
            options,
            routeContext,
            reason: "missing-token-and-refresh",
          });

          emit(
            "auth:restore:empty",
            {
              reason:
                "missing-token-and-refresh",
              protectedRoute:
                routeContext.shouldProtect,
            }
          );

          return {
            ok: false,
            user: null,
            protectedRoute:
              routeContext.shouldProtect,
          };
        }

        /*
          Prefer refresh cuando existe contexto.
        */
        if (refreshAvailable) {
          try {
            log(
              "restoreSession(): refresh preferente.",
              {
                protectedRoute:
                  routeContext.shouldProtect,
                publicPath:
                  routeContext.publicPath,
              }
            );

            const result =
              await restoreUsingRefreshPreferred(
                session
              );

            restoreRouteContext(routeContext);

            return result;
          } catch (refreshError) {
            warn(
              "Refresh preferente falló.",
              refreshError
            );

            if (hasValidToken()) {
              const result =
                await restoreAfterMeFailure(
                  session,
                  refreshError,
                  options,
                  routeContext
                );

              restoreRouteContext(routeContext);

              return result;
            }

            if (
              shouldClearForError(refreshError)
            ) {
              clearSessionLocalProtected({
                options,
                routeContext,
                reason: "refresh-error-clearable",
              });
            } else {
              restoreRouteContext(routeContext);
            }

            return {
              ok: false,
              user: null,
              error: refreshError,
              protectedRoute:
                routeContext.shouldProtect,
            };
          }
        }

        /*
          Solo token.
        */
        const result =
          await restoreUsingMe(session);

        restoreRouteContext(routeContext);

        return result;
      } catch (error) {
        warn(
          "restoreSession() fatal:",
          error
        );

        clearSessionLocalProtected({
          options,
          routeContext,
          reason: "restore-fatal",
        });

        emit(
          "auth:restore:error",
          {
            error,
            message:
              extractMessage(error),
            protectedRoute:
              routeContext.shouldProtect,
          }
        );

        return {
          ok: false,
          user: null,
          error,
          protectedRoute:
            routeContext.shouldProtect,
        };
      } finally {
        restoreRouteContext(routeContext);
        clearRuntimeFlags(session);
      }
    })();

  return session.restorePromise;
}

/* =========================================================
   DEBUG
========================================================= */

export function getRestoreSnapshot(
  sessionArg = {}
) {
  const session =
    getSession(sessionArg);

  const routeContext =
    captureRouteContext({
      publicRoute: false,
      preserveCurrentRoute: false,
    });

  return {
    ...buildSessionSnapshot(),

    checking:
      Boolean(session.checking),

    refreshing:
      Boolean(session.refreshing),

    restoring:
      Boolean(session.restoring),

    refreshFailCount:
      safeNumber(
        session.refreshFailCount,
        0
      ),

    refreshBlockedUntil:
      safeNumber(
        session.refreshBlockedUntil,
        0
      ),

    lastCheckAt:
      safeNumber(
        session.lastCheckAt,
        0
      ),

    lastRefreshAt:
      safeNumber(
        session.lastRefreshAt,
        0
      ),

    protectedRoute:
      routeContext.shouldProtect,

    activationBoot:
      routeContext.activationBoot,

    route:
      routeContext.route,

    publicPath:
      routeContext.publicPath,

    browserPath:
      routeContext.browserPath,

    initialUrl:
      routeContext.initialUrl,

    activationInitialUrl:
      routeContext.activationInitialUrl,

    activationTokenScrubbed:
      isActivationTokenScrubbed(),
  };
}

export default {
  fetchMe,
  refreshSession,
  restoreUsingMe,
  restoreUsingRefreshOnly,
  restoreUsingRefreshPreferred,
  restoreAfterMeFailure,
  restoreSession,
  getRestoreSnapshot,
};
