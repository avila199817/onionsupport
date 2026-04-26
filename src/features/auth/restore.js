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

   FIX 10/10:
   - restore no marca sesión autenticada sin token + user válido
   - refresh token-only queda como token provisional y fuerza /me
   - refresh user-only sólo se acepta si ya hay token válido
   - no reutiliza AppCore.state.user como fallback tras refresh fallido
   - limpia sesión fantasma preservando rutas públicas técnicas
   - evita avatar/dashboard cacheado después de 401/403
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
  lastRestoreAt: 0,

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

const AUTH_FAILURE_CODES = new Set([
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "ACCOUNT_TEMPORARILY_LOCKED",
  "ACCOUNT_DISABLED",
  "USER_DISABLED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "TOKEN_INVALID",
  "INVALID_TOKEN",
  "SESSION_EXPIRED",
  "INVALID_LOGIN_SESSION",
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

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isPlainObject(value) ? value : {};
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

function pickFirst(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function pickFirstText(...values) {
  return safeText(
    pickFirst(...values),
    ""
  );
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
   SESSION VALIDATION
========================================================= */

function hasUsableToken(token = "") {
  return Boolean(
    safeText(token, "")
  );
}

function hasUsableUser(user = {}) {
  if (!isPlainObject(user)) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.user_name, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "")
  );
}

function getCurrentToken() {
  const state =
    getState();

  return safeText(
    pickFirst(
      state.token,
      state.accessToken,
      state.session?.token,
      state.session?.accessToken
    ),
    ""
  );
}

function getCurrentUser() {
  const state =
    getState();

  return (
    state.user ||
    state.session?.user ||
    null
  );
}

function hasCompleteAuthState() {
  return Boolean(
    hasUsableToken(getCurrentToken()) &&
      hasUsableUser(getCurrentUser())
  );
}

function getResponseStatus(response = null) {
  const raw =
    safeObject(response);

  const data =
    safeObject(raw.data);

  const payload =
    safeObject(raw.payload);

  const result =
    safeObject(raw.result);

  const body =
    safeObject(raw.body);

  const nestedResponse =
    safeObject(raw.response);

  const responseData =
    safeObject(nestedResponse.data);

  return pickFirst(
    raw.status,
    raw.statusCode,
    raw.status_code,

    data.status,
    data.statusCode,
    data.status_code,

    payload.status,
    payload.statusCode,
    payload.status_code,

    result.status,
    result.statusCode,
    result.status_code,

    body.status,
    body.statusCode,
    body.status_code,

    nestedResponse.status,
    nestedResponse.statusCode,
    nestedResponse.status_code,

    responseData.status,
    responseData.statusCode,
    responseData.status_code
  );
}

function getResponseCode(response = null) {
  const raw =
    safeObject(response);

  const data =
    safeObject(raw.data);

  const payload =
    safeObject(raw.payload);

  const result =
    safeObject(raw.result);

  const body =
    safeObject(raw.body);

  const nestedResponse =
    safeObject(raw.response);

  const responseData =
    safeObject(nestedResponse.data);

  return pickFirstText(
    raw.code,
    raw.error,
    raw.errorCode,
    raw.error_code,

    data.code,
    data.error,
    data.errorCode,
    data.error_code,

    payload.code,
    payload.error,
    payload.errorCode,
    payload.error_code,

    result.code,
    result.error,
    result.errorCode,
    result.error_code,

    body.code,
    body.error,
    body.errorCode,
    body.error_code,

    nestedResponse.code,
    nestedResponse.error,
    nestedResponse.errorCode,
    nestedResponse.error_code,

    responseData.code,
    responseData.error,
    responseData.errorCode,
    responseData.error_code
  );
}

function getResponseMessage(response = null) {
  const raw =
    safeObject(response);

  const data =
    safeObject(raw.data);

  const payload =
    safeObject(raw.payload);

  const result =
    safeObject(raw.result);

  const body =
    safeObject(raw.body);

  const nestedResponse =
    safeObject(raw.response);

  const responseData =
    safeObject(nestedResponse.data);

  return pickFirstText(
    raw.message,
    raw.mensaje,
    raw.errorMessage,
    raw.error_message,

    data.message,
    data.mensaje,
    data.errorMessage,
    data.error_message,

    payload.message,
    payload.mensaje,
    payload.errorMessage,
    payload.error_message,

    result.message,
    result.mensaje,
    result.errorMessage,
    result.error_message,

    body.message,
    body.mensaje,
    body.errorMessage,
    body.error_message,

    nestedResponse.message,
    nestedResponse.mensaje,
    nestedResponse.errorMessage,
    nestedResponse.error_message,

    responseData.message,
    responseData.mensaje,
    responseData.errorMessage,
    responseData.error_message
  );
}

function isExplicitAuthFailure(response = null) {
  if (!response || !isPlainObject(response)) {
    return false;
  }

  const raw =
    safeObject(response);

  const data =
    safeObject(raw.data);

  const payload =
    safeObject(raw.payload);

  const result =
    safeObject(raw.result);

  const body =
    safeObject(raw.body);

  const nestedResponse =
    safeObject(raw.response);

  const responseData =
    safeObject(nestedResponse.data);

  const status =
    Number(getResponseStatus(response) || 0);

  if (
    Number.isFinite(status) &&
    status >= 400
  ) {
    return true;
  }

  const code =
    safeText(
      getResponseCode(response),
      ""
    ).toUpperCase();

  if (
    code &&
    AUTH_FAILURE_CODES.has(code)
  ) {
    return true;
  }

  if (
    raw.ok === false ||
    raw.success === false ||
    data.ok === false ||
    data.success === false ||
    payload.ok === false ||
    payload.success === false ||
    result.ok === false ||
    result.success === false ||
    body.ok === false ||
    body.success === false ||
    nestedResponse.ok === false ||
    nestedResponse.success === false ||
    responseData.ok === false ||
    responseData.success === false
  ) {
    return true;
  }

  return false;
}

function createRestoreError(
  message = "No se pudo restaurar la sesión.",
  {
    status = 401,
    code = "INVALID_RESTORE_SESSION",
    response = null,
  } = {}
) {
  const error =
    new Error(message);

  error.status =
    status;

  error.data = {
    code,
    message,
    status,
  };

  error.response =
    response;

  error.raw =
    response;

  return error;
}

function normalizeAuthResponse(response = null) {
  if (
    isExplicitAuthFailure(response)
  ) {
    return {
      ok: false,
      explicitFailure: true,
      token: "",
      user: null,
      refreshToken: "",
      sessionData: null,
      status:
        getResponseStatus(response) ||
        "auth_failed",
      code:
        getResponseCode(response) ||
        "AUTH_FAILED",
      message:
        getResponseMessage(response) ||
        "No se pudo restaurar la sesión.",
      response,
    };
  }

  const token =
    safeText(
      extractToken(response),
      ""
    );

  const user =
    extractUser(response);

  const refreshToken =
    safeText(
      extractRefreshToken(response),
      ""
    );

  const sessionData =
    normalizeSessionPayload(response);

  return {
    ok:
      Boolean(
        hasUsableToken(token) ||
          hasUsableUser(user)
      ),

    explicitFailure: false,

    token,
    user:
      hasUsableUser(user)
        ? user
        : null,

    refreshToken,
    sessionData,

    status:
      getResponseStatus(response) ||
      (
        token && user
          ? "authenticated"
          : token
            ? "token_only"
            : user
              ? "user_only"
              : ""
      ),

    code:
      getResponseCode(response) || "",

    message:
      getResponseMessage(response) || "",

    response,
  };
}

function assertNoExplicitFailure(auth = {}) {
  if (
    auth.explicitFailure ||
    auth.ok === false
  ) {
    throw createRestoreError(
      auth.message ||
        "No se pudo restaurar la sesión.",
      {
        status:
          Number(auth.status) || 401,
        code:
          auth.code ||
          "AUTH_RESTORE_FAILED",
        response:
          auth.response,
      }
    );
  }
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
      ...value,

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

      route:
        value.route,

      publicPath:
        value.publicPath,

      activationBoot:
        Boolean(value.activationBoot),
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
      options.publicPath ||
        state.publicPath,
      ""
    ) ||
    browserPath ||
    "/";

  const route =
    safeText(
      options.route ||
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
    Boolean(
      options.activationBoot ||
      detectActivationBoot()
    );

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
      route:
        ctx.route,
      publicPath:
        ctx.publicPath,
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
    Number(
      error?.status ||
        error?.response?.status ||
        error?.data?.status ||
        0
    );

  if (
    status === 401 ||
    status === 403
  ) {
    return true;
  }

  const code =
    safeText(
      error?.data?.code ||
        error?.code ||
        error?.response?.data?.code ||
        error?.response?.data?.error ||
        "",
      ""
    ).toUpperCase();

  return Boolean(
    code &&
      AUTH_FAILURE_CODES.has(code)
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
    throw createRestoreError(
      "No hay token disponible para /me.",
      {
        status: 401,
        code: "TOKEN_MISSING",
      }
    );
  }

  if (!hasApiGet()) {
    throw createRestoreError(
      "apiClient.get no disponible.",
      {
        status: 500,
        code: "API_CLIENT_GET_MISSING",
      }
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

        const auth =
          normalizeAuthResponse(response);

        assertNoExplicitFailure(auth);

        const user =
          auth.user ||
          extractUser(response?.data) ||
          null;

        if (!hasUsableUser(user)) {
          throw createRestoreError(
            "No se pudo resolver usuario válido desde /me.",
            {
              status: 401,
              code: "ME_USER_MISSING",
              response,
            }
          );
        }

        const nextToken =
          auth.token ||
          getCurrentToken();

        const snapshot =
          applySession({
            token:
              nextToken || undefined,
            user,
            refreshToken:
              auth.refreshToken || undefined,
            sessionData:
              auth.sessionData || undefined,
            authenticated:
              true,
          });

        if (
          !snapshot?.authenticated ||
          !hasUsableToken(snapshot.token) ||
          !hasUsableUser(snapshot.user)
        ) {
          throw createRestoreError(
            "La restauración desde /me no produjo sesión válida.",
            {
              status: 401,
              code: "ME_INVALID_SESSION",
              response,
            }
          );
        }

        session.lastCheckAt =
          Date.now();

        emit(
          "auth:me:success",
          {
            user:
              snapshot.user,
          }
        );

        return snapshot.user;
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
    throw createRestoreError(
      "No hay contexto refresh.",
      {
        status: 401,
        code: "REFRESH_CONTEXT_MISSING",
      }
    );
  }

  if (!hasApiPost()) {
    throw createRestoreError(
      "apiClient.post no disponible.",
      {
        status: 500,
        code: "API_CLIENT_POST_MISSING",
      }
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
    throw createRestoreError(
      "Refresh temporalmente bloqueado.",
      {
        status: 429,
        code: "REFRESH_BLOCKED",
      }
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

        const auth =
          normalizeAuthResponse(response);

        assertNoExplicitFailure(auth);

        if (
          !hasUsableToken(auth.token) &&
          !hasUsableUser(auth.user)
        ) {
          throw createRestoreError(
            "Refresh sin datos de sesión.",
            {
              status: 401,
              code: "REFRESH_EMPTY_RESPONSE",
              response,
            }
          );
        }

        /*
          Caso A:
          Refresh devuelve token + user.
          Sesión completa directa.
        */
        if (
          hasUsableToken(auth.token) &&
          hasUsableUser(auth.user)
        ) {
          const snapshot =
            applySession({
              token:
                auth.token,
              user:
                auth.user,
              refreshToken:
                auth.refreshToken ||
                requestBody.refreshToken,
              sessionData:
                auth.sessionData || {
                  sessionId:
                    requestBody.sessionId,
                  userId:
                    requestBody.userId,
                },
              authenticated:
                true,
            });

          if (
            !snapshot?.authenticated ||
            !hasUsableToken(snapshot.token) ||
            !hasUsableUser(snapshot.user)
          ) {
            throw createRestoreError(
              "Refresh produjo sesión inválida.",
              {
                status: 401,
                code: "REFRESH_INVALID_SESSION",
                response,
              }
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
              source:
                "refresh:token-user",
            }
          );

          return {
            ok: true,
            ...snapshot,
            source:
              "refresh:token-user",
            response,
          };
        }

        /*
          Caso B:
          Refresh devuelve token pero no user.
          Se aplica token provisional, se limpia user viejo, y se fuerza /me.
        */
        if (
          hasUsableToken(auth.token) &&
          !hasUsableUser(auth.user)
        ) {
          applySession({
            token:
              auth.token,
            user:
              null,
            refreshToken:
              auth.refreshToken ||
              requestBody.refreshToken,
            sessionData:
              auth.sessionData || {
                sessionId:
                  requestBody.sessionId,
                userId:
                  requestBody.userId,
              },
            authenticated:
              false,
          });

          const user =
            await fetchMe(session);

          const snapshot =
            buildSessionSnapshot();

          if (
            !snapshot?.authenticated ||
            !hasUsableToken(snapshot.token) ||
            !hasUsableUser(snapshot.user)
          ) {
            throw createRestoreError(
              "Refresh token-only no pudo validar usuario con /me.",
              {
                status: 401,
                code: "REFRESH_TOKEN_ONLY_ME_FAILED",
                response,
              }
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
              user,
              source:
                "refresh:token-only+me",
            }
          );

          return {
            ok: true,
            ...snapshot,
            user,
            source:
              "refresh:token-only+me",
            response,
          };
        }

        /*
          Caso C:
          Refresh devuelve user pero no token.
          Sólo aceptable si ya existe token válido.
        */
        if (
          !hasUsableToken(auth.token) &&
          hasUsableUser(auth.user)
        ) {
          const currentToken =
            getCurrentToken();

          if (!hasUsableToken(currentToken)) {
            throw createRestoreError(
              "Refresh devolvió usuario sin token disponible.",
              {
                status: 401,
                code: "REFRESH_USER_WITHOUT_TOKEN",
                response,
              }
            );
          }

          const snapshot =
            applySession({
              token:
                currentToken,
              user:
                auth.user,
              refreshToken:
                auth.refreshToken ||
                requestBody.refreshToken,
              sessionData:
                auth.sessionData || {
                  sessionId:
                    requestBody.sessionId,
                  userId:
                    requestBody.userId,
                },
              authenticated:
                true,
            });

          if (
            !snapshot?.authenticated ||
            !hasUsableToken(snapshot.token) ||
            !hasUsableUser(snapshot.user)
          ) {
            throw createRestoreError(
              "Refresh user-only produjo sesión inválida.",
              {
                status: 401,
                code: "REFRESH_USER_ONLY_INVALID_SESSION",
                response,
              }
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
              source:
                "refresh:user-only",
            }
          );

          return {
            ok: true,
            ...snapshot,
            source:
              "refresh:user-only",
            response,
          };
        }

        throw createRestoreError(
          "Refresh no produjo sesión recuperable.",
          {
            status: 401,
            code: "REFRESH_UNUSABLE_RESPONSE",
            response,
          }
        );
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

  const snapshot =
    buildSessionSnapshot();

  if (
    !snapshot?.authenticated ||
    !hasUsableToken(snapshot.token) ||
    !hasUsableUser(snapshot.user)
  ) {
    throw createRestoreError(
      "restoreUsingMe no produjo sesión válida.",
      {
        status: 401,
        code: "RESTORE_ME_INVALID_SESSION",
      }
    );
  }

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
    !hasCompleteAuthState() &&
    hasValidToken()
  ) {
    await fetchMe(session);
  }

  const snapshot =
    buildSessionSnapshot();

  if (
    !snapshot?.authenticated ||
    !hasUsableToken(snapshot.token) ||
    !hasUsableUser(snapshot.user)
  ) {
    throw createRestoreError(
      "restoreUsingRefreshOnly no produjo sesión válida.",
      {
        status: 401,
        code: "RESTORE_REFRESH_INVALID_SESSION",
      }
    );
  }

  emit(
    "auth:restore:success",
    {
      source: "refresh-only",
      user:
        snapshot.user ||
        null,
    }
  );

  return {
    ok: true,
    source: "refresh-only",
    user:
      snapshot.user ||
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
        hasUsableUser(
          getCurrentUser()
        ),
      hasCompleteAuthState:
        hasCompleteAuthState(),
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
          Evita confiar ciegamente en token/user antiguos.
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

            session.lastRestoreAt =
              Date.now();

            return result;
          } catch (refreshError) {
            warn(
              "Refresh preferente falló.",
              refreshError
            );

            /*
              Si refresh falla por auth real, no intentamos conservar
              avatar/user antiguo. Limpiamos.
            */
            if (
              shouldClearForError(refreshError)
            ) {
              clearSessionLocalProtected({
                options,
                routeContext,
                reason: "refresh-error-clearable",
              });

              return {
                ok: false,
                user: null,
                error: refreshError,
                protectedRoute:
                  routeContext.shouldProtect,
              };
            }

            /*
              Si fue red/API temporal y hay token, intentamos /me.
            */
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

            restoreRouteContext(routeContext);

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
          Sólo token.
          No se acepta sesión completa hasta validar /me.
        */
        try {
          const result =
            await restoreUsingMe(session);

          restoreRouteContext(routeContext);

          session.lastRestoreAt =
            Date.now();

          return result;
        } catch (meError) {
          const result =
            await restoreAfterMeFailure(
              session,
              meError,
              options,
              routeContext
            );

          restoreRouteContext(routeContext);

          return result;
        }
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

    lastRestoreAt:
      safeNumber(
        session.lastRestoreAt,
        0
      ),

    hasValidToken:
      hasValidToken(),

    hasCompleteAuthState:
      hasCompleteAuthState(),

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
