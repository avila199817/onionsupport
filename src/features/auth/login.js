/* =========================================================
   Onion SPA - Auth Login
   Archivo: src/features/auth/login.js

   RESPONSABILIDADES:
   - preparar credenciales login
   - construir payload robusto
   - redirects post-login seguros
   - ejecutar login
   - soportar 2FA opcional
   - submit desde formularios HTML
   - endurecer respuestas heterogéneas backend
   - navegación SPA consistente tras login
   - anti race conditions concurrentes
   - cero estados auth fantasma
   - evitar doble navegación / doble render post-login
   - limpiar auth-screen antes/después de navegar
   - reparar Sidebar/Topbar tras login real

   HARDENING EXTREMO:
   - mutex real de login concurrente
   - limpieza dura previa a login
   - redirects blindados
   - sync inmediata AppCore/UI/router
   - tolerancia total backend legacy
   - eventos enterprise completos
   - errores normalizados
   - fallback post-login siempre a home "/"
   - sin home por rol
   - navegación deduplicada pero render-safe
   - no aceptar payloads 401/403/ok:false/success:false como éxito

   FIX 10/10:
   - no aplica sesión si falta token usable
   - no aplica sesión si falta usuario identificable
   - no navega si el login no es estrictamente válido
   - no reutiliza usuario antiguo de AppCore como fallback
   - limpia sesión vieja en fallo real o payload inválido
   - preserva flujo 2FA sin marcar authenticated
   - espera Router.navigate si devuelve Promise
   - no usa popstate como primera opción
   - elimina body.auth-screen/login-no-scroll tras login OK
   - emite app:ui:repair-request después de navegación
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  isBrowser,
  sanitizeUsername,
  normalizePath,
  getCurrentCanonicalPath,
  isAuthRoute,
  configLikeRoute,
  isSafeRelativePath,
  extractMessage,
} from "./helpers.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  validateAuthResponse,
} from "./normalize.js";

import {
  persistTempToken,
} from "./storage.js";

import {
  applySession,
  clearSessionLocal,
} from "./session.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let loginPromise = null;
let loginSequence = 0;

/* =========================================================
   CONST
========================================================= */

const DEFAULT_HOME_PATH = "/";
const DEFAULT_LOGIN_PATH = "/login";
const DEFAULT_2FA_PATH = "/2fa";

const ROLE_DEFAULT_REDIRECTS = new Set([
  "/usuarios",
  "/clientes",
  "/facturas",
  "/incidencias",
  "/servidor",
]);

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

const KNOWN_AUTH_STORAGE_KEYS = [
  "onion_token",
  "onion_access_token",
  "onion_refresh_token",
  "onion_temp_token",
  "onion_session_id",
  "onion_session_user_id",
  "onion_user_id",
  "onion_user_name",
  "onion_role",

  "auth_token",
  "access_token",
  "refresh_token",
  "temp_token",
  "token",
  "session",
  "user",
];

/* =========================================================
   BASICS
========================================================= */

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

function safeBool(value) {
  return value === true;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function pickFirstText(...values) {
  for (const value of values) {
    const text =
      safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      return value;
    }
  }

  return "";
}

function pickFirstObject(...values) {
  for (const value of values) {
    if (isPlainObject(value)) {
      return value;
    }
  }

  return null;
}

function normalizeBoolean(value, fallback = false) {
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

function wait(ms = 0) {
  return new Promise((resolve) => {
    try {
      setTimeout(resolve, ms);
    } catch {
      resolve();
    }
  });
}

function afterPaint(callback) {
  if (!isFunction(callback)) {
    return;
  }

  if (!isBrowser()) {
    try {
      callback();
    } catch {}

    return;
  }

  try {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          callback();
        } catch {}
      });
    });

    return;
  } catch {}

  try {
    window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}
}

function safeEmit(eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}

  try {
    window?.AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function safeSetError(error) {
  try {
    AppCore?.setError?.(
      error || null
    );
  } catch {}
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(
      "[AuthLogin]",
      ...args
    );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthLogin]",
      ...args
    );
  } catch {}

  try {
    console.warn("[AuthLogin]", ...args);
  } catch {}
}

function getState() {
  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function getApiClient() {
  return (
    AppCore?.apiClient ||
    AppCore?.services?.http ||
    AppCore?.services?.api ||
    null
  );
}

function resolveLoginEndpoint() {
  return (
    safeText(
      AUTH_ENDPOINTS?.login,
      ""
    ) ||
    "/api/auth/login"
  );
}

/* =========================================================
   ROUTE HELPERS
========================================================= */

function normalizeCleanRoute(path = "/") {
  try {
    return configLikeRoute(
      normalizePath(path || "/")
    );
  } catch {
    return String(path || "/");
  }
}

function stripSearchAndHash(path = "/") {
  const raw =
    safeText(path, "/");

  return normalizeCleanRoute(
    raw.split("?")[0].split("#")[0] || "/"
  );
}

function isRoleDefaultRedirect(path = "") {
  const clean =
    stripSearchAndHash(path);

  if (
    ROLE_DEFAULT_REDIRECTS.has(clean)
  ) {
    return true;
  }

  if (/^\/@[^/]+(?:\/)?$/i.test(clean)) {
    return true;
  }

  return false;
}

function getHomeRoute() {
  const configured =
    configLikeRoute(
      AppCore?.config?.routes?.home ||
        AppCore?.config?.homePath ||
        DEFAULT_HOME_PATH
    ) || DEFAULT_HOME_PATH;

  if (
    isAuthRoute(configured) ||
    isRoleDefaultRedirect(configured)
  ) {
    return DEFAULT_HOME_PATH;
  }

  return configured;
}

function getLoginRoute() {
  return (
    configLikeRoute(
      AppCore?.config?.routes?.login ||
        DEFAULT_LOGIN_PATH
    ) || DEFAULT_LOGIN_PATH
  );
}

function getBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    return normalizePath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return "/";
  }
}

function getBrowserCanonicalPath() {
  try {
    return configLikeRoute(
      getCurrentCanonicalPath() ||
        getBrowserPath() ||
        "/"
    );
  } catch {
    return configLikeRoute(
      getBrowserPath() || "/"
    );
  }
}

function sameCanonicalPath(a = "/", b = "/") {
  try {
    return (
      configLikeRoute(
        normalizePath(a)
      ) ===
      configLikeRoute(
        normalizePath(b)
      )
    );
  } catch {
    return String(a || "/") === String(b || "/");
  }
}

function shouldNavigateAfterLogin(options = {}) {
  if (
    options?.navigate === false ||
    options?.skipNavigate === true ||
    options?.manualNavigate === true
  ) {
    return false;
  }

  return true;
}

function buildPopStateEvent() {
  try {
    return new PopStateEvent(
      "popstate"
    );
  } catch {
    return new Event(
      "popstate"
    );
  }
}

/* =========================================================
   DOM / UI REPAIR
========================================================= */

function setDocumentAuthFlags({
  authenticated = false,
  loading = false,
  ready = false,
} = {}) {
  if (!isBrowser()) {
    return;
  }

  try {
    document.documentElement?.classList?.toggle(
      "app-loading",
      Boolean(loading)
    );

    document.documentElement?.classList?.toggle(
      "app-ready",
      Boolean(ready)
    );

    document.body?.classList?.toggle(
      "app-loading",
      Boolean(loading)
    );

    document.body?.classList?.toggle(
      "app-ready",
      Boolean(ready)
    );

    document.body?.setAttribute(
      "data-authenticated",
      authenticated ? "true" : "false"
    );
  } catch {}
}

function clearAuthScreenDomState(reason = "login-success") {
  if (!isBrowser()) {
    return false;
  }

  try {
    document.body?.classList?.remove?.(
      "auth-screen",
      "login-no-scroll"
    );

    document.body?.removeAttribute?.(
      "data-auth-screen"
    );

    document.body?.setAttribute?.(
      "data-authenticated",
      "true"
    );
  } catch {}

  try {
    const shell =
      document.getElementById("app-shell");

    if (shell) {
      shell.hidden = false;
      shell.setAttribute(
        "aria-busy",
        "false"
      );
      shell.setAttribute(
        "aria-hidden",
        "false"
      );
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
      main.setAttribute(
        "aria-hidden",
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

  setDocumentAuthFlags({
    authenticated: true,
    loading: false,
    ready: true,
  });

  safeEmit(
    "app:shell:auth-screen-cleared",
    {
      reason,
      source: "auth.login",
    }
  );

  return true;
}

function safeSyncUserUI(reason = "login-sync-user-ui") {
  try {
    AppCore?.syncUserUI?.({
      AppCore,
      reason,
      source: "auth.login",
    });
  } catch {}

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  safeEmit(
    "app:ui:repair-request",
    {
      reason,
      source: "auth.login",
      authenticated:
        Boolean(getState().authenticated),
      user:
        getState().user || null,
      role:
        getState().role || null,
    }
  );
}

function emitAuthenticatedEvents(reason = "login-success", extra = {}) {
  const payload = {
    reason,
    source: "auth.login",
    authenticated:
      Boolean(getState().authenticated),
    user:
      getState().user || null,
    role:
      getState().role || null,
    route:
      getState().route || "/",
    publicPath:
      getState().publicPath || "/",
    ...extra,
  };

  safeEmit(
    "auth:session:applied",
    payload
  );

  safeEmit(
    "auth:login:session-ready",
    payload
  );

  safeEmit(
    "app:session:restored",
    payload
  );

  safeEmit(
    "app:user:change",
    payload
  );

  safeEmit(
    "app:ui:repair-request",
    payload
  );
}

/* =========================================================
   ROUTER RESOLUTION / NAVIGATION
========================================================= */

async function resolveRouter() {
  const candidates = [
    AppCore?.Router,
    AppCore?.router,
    AppCore?.modules?.Router,
    AppCore?.modules?.router,
    isFunction(AppCore?.modules?.get)
      ? AppCore.modules.get("router")
      : null,
    isFunction(AppCore?.modules?.get)
      ? AppCore.modules.get("Router")
      : null,
    isBrowser()
      ? window.Router
      : null,
    isBrowser()
      ? window.AppRouter
      : null,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      isFunction(candidate.navigate)
    ) {
      return candidate;
    }
  }

  /*
    Import dinámico para evitar depender de AppCore.Router.
    Esto corrige el caso en el que login navega por history/popstate
    y el panel queda montado a medias hasta refresh.
  */
  try {
    const module =
      await import("../../router/index.js");

    const router =
      module?.Router ||
      module?.default ||
      null;

    if (
      router &&
      isFunction(router.navigate)
    ) {
      return router;
    }
  } catch {}

  return null;
}

function updateCoreRouteState(target = "/") {
  const cleanTarget =
    normalizePath(
      target || "/"
    ) || "/";

  try {
    if (
      isFunction(AppCore?.setRoute)
    ) {
      AppCore.setRoute(
        configLikeRoute(cleanTarget)
      );
    }
  } catch {}

  try {
    if (
      isFunction(AppCore?.setPublicPath)
    ) {
      AppCore.setPublicPath(
        cleanTarget
      );
    }
  } catch {}

  try {
    AppCore?.setState?.({
      route:
        configLikeRoute(cleanTarget),
      publicPath:
        cleanTarget,
      lastRoute:
        configLikeRoute(cleanTarget),
    });
  } catch {
    try {
      if (AppCore?.state) {
        AppCore.state.route =
          configLikeRoute(cleanTarget);
        AppCore.state.publicPath =
          cleanTarget;
        AppCore.state.lastRoute =
          configLikeRoute(cleanTarget);
      }
    } catch {}
  }
}

async function safeNavigate(path = "/", options = {}) {
  const target =
    normalizePath(
      safeText(path, getHomeRoute())
    ) || getHomeRoute();

  const current =
    getBrowserCanonicalPath();

  const targetCanonical =
    configLikeRoute(
      target
    );

  const replaceState =
    options.replaceState !== false;

  const force =
    options.force === true;

  const reason =
    safeText(
      options.reason,
      "login-navigation"
    );

  /*
    Si ya estamos en destino, actualizamos estado y pedimos reparación UI.
    No disparamos doble render.
  */
  if (
    isBrowser() &&
    sameCanonicalPath(
      current,
      targetCanonical
    )
  ) {
    updateCoreRouteState(target);

    clearAuthScreenDomState(
      `${reason}:same-route`
    );

    safeSyncUserUI(
      `${reason}:same-route`
    );

    return {
      ok: true,
      skipped: true,
      reason: "same-route",
      target,
    };
  }

  const router =
    await resolveRouter();

  if (
    router &&
    isFunction(router.navigate)
  ) {
    try {
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

      clearAuthScreenDomState(
        `${reason}:router`
      );

      safeSyncUserUI(
        `${reason}:router`
      );

      afterPaint(() => {
        clearAuthScreenDomState(
          `${reason}:router-after-paint`
        );

        safeSyncUserUI(
          `${reason}:router-after-paint`
        );
      });

      return {
        ok: true,
        skipped: false,
        reason: "router",
        target,
      };
    } catch (error) {
      safeWarn(
        "Router.navigate falló.",
        error
      );
    }
  }

  /*
    Fallback controlado.
    Solo si no tenemos Router real.
  */
  try {
    if (
      isBrowser() &&
      typeof window.history?.replaceState === "function"
    ) {
      window.history.replaceState(
        {
          path: target,
          publicPath: target,
          canonicalPath:
            configLikeRoute(target),
          source:
            "auth.login",
        },
        "",
        target
      );

      updateCoreRouteState(target);

      clearAuthScreenDomState(
        `${reason}:history`
      );

      window.dispatchEvent(
        buildPopStateEvent()
      );

      safeSyncUserUI(
        `${reason}:history`
      );

      return {
        ok: true,
        skipped: false,
        reason: "history",
        target,
      };
    }
  } catch (error) {
    safeWarn(
      "history fallback falló.",
      error
    );
  }

  try {
    if (isBrowser()) {
      window.location.assign(target);

      return {
        ok: true,
        skipped: false,
        reason: "location",
        target,
      };
    }
  } catch {}

  return {
    ok: false,
    skipped: false,
    reason: "navigation-failed",
    target,
  };
}

/* =========================================================
   IDENTIFIER / PAYLOAD
========================================================= */

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value).trim()
  );
}

function looksLikePhone(value = "") {
  const clean =
    String(value)
      .replace(/[^\d+]/g, "")
      .trim();

  return /^\+?\d{6,20}$/.test(
    clean
  );
}

function normalizePhone(value = "") {
  return String(value)
    .replace(/[^\d+]/g, "")
    .trim();
}

export function resolveLoginIdentifier(credentials = {}) {
  return safeText(
    credentials.identifier ??
      credentials.username ??
      credentials.user ??
      credentials.email ??
      credentials.phone ??
      "",
    ""
  );
}

export function normalizeLoginPayload(credentials = {}) {
  const rawIdentifier =
    resolveLoginIdentifier(
      credentials
    );

  const maxIdentifier =
    Number(
      AUTH_CONSTANTS?.identifierMaxLength
    ) || 160;

  const maxPassword =
    Number(
      AUTH_CONSTANTS?.passwordMaxLength
    ) || 256;

  const identifier =
    safeText(
      rawIdentifier
    )
      .replace(/\s+/g, " ")
      .slice(
        0,
        maxIdentifier
      );

  const password =
    String(
      credentials.password ??
        credentials.pass ??
        ""
    ).slice(
      0,
      maxPassword
    );

  return {
    identifier,
    password,
    remember:
      Boolean(
        credentials.remember
      ),
  };
}

export function buildLoginRequestBody(credentials = {}) {
  const {
    identifier,
    password,
    remember,
  } =
    normalizeLoginPayload(
      credentials
    );

  const clean =
    safeText(
      identifier
    );

  const email =
    looksLikeEmail(clean)
      ? clean.toLowerCase()
      : undefined;

  const phone =
    !email &&
    looksLikePhone(clean)
      ? normalizePhone(clean)
      : undefined;

  const username =
    !email &&
    !phone
      ? sanitizeUsername(
          clean
        )
      : undefined;

  return {
    identifier: clean,
    email,
    phone,
    username,
    user: username,
    password,
    remember,
  };
}

/* =========================================================
   REDIRECTS
========================================================= */

function normalizeRedirectCandidate(value = "") {
  const candidate =
    normalizePath(
      safeText(value, "")
    );

  if (!candidate) {
    return "";
  }

  if (
    !isSafeRelativePath(
      candidate
    )
  ) {
    return "";
  }

  if (
    isAuthRoute(
      candidate
    )
  ) {
    return "";
  }

  if (
    isRoleDefaultRedirect(
      candidate
    )
  ) {
    return "";
  }

  return candidate;
}

function getRedirectFromUrl() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const redirect =
      new URLSearchParams(
        window.location.search
      ).get(
        "redirect"
      );

    return normalizeRedirectCandidate(
      redirect
    );
  } catch {
    return "";
  }
}

function getRedirectFromOptions(options = {}) {
  const opts =
    safeObject(options);

  return normalizeRedirectCandidate(
    opts.redirectTo ||
      opts.redirect ||
      opts.target ||
      ""
  );
}

export function buildLoginRedirectPath(targetPath = null) {
  const loginPath =
    getLoginRoute();

  const target =
    configLikeRoute(
      targetPath ||
        getCurrentCanonicalPath() ||
        "/"
    );

  if (
    !target ||
    target === loginPath
  ) {
    return loginPath;
  }

  if (
    !isSafeRelativePath(
      target
    )
  ) {
    return loginPath;
  }

  if (
    isAuthRoute(
      target
    )
  ) {
    return loginPath;
  }

  if (!isBrowser()) {
    return `${loginPath}?redirect=${encodeURIComponent(
      target
    )}`;
  }

  const url =
    new URL(
      loginPath,
      window.location.origin
    );

  url.searchParams.set(
    "redirect",
    target
  );

  return `${url.pathname}${url.search}`;
}

/**
 * Destino post-login.
 *
 * Prioridad:
 * 1. options.redirectTo / options.redirect / options.target
 * 2. ?redirect=...
 * 3. Home configurado saneado
 *
 * Importante:
 * - no manda admin a /usuarios por defecto
 * - no manda user a /@slug por defecto
 * - fallback universal: /
 */
export function getPostLoginTarget(
  user = AppCore?.state?.user,
  options = {}
) {
  const fromOptions =
    getRedirectFromOptions(
      options
    );

  if (fromOptions) {
    return fromOptions;
  }

  const fromUrl =
    getRedirectFromUrl();

  if (fromUrl) {
    return fromUrl;
  }

  return getHomeRoute();
}

/* =========================================================
   AUTH RESPONSE NORMALIZATION
========================================================= */

function getNestedAuthData(raw = {}) {
  const root =
    safeObject(raw);

  const data =
    safeObject(root.data);

  const payload =
    safeObject(root.payload);

  const result =
    safeObject(root.result);

  const body =
    safeObject(root.body);

  const response =
    safeObject(root.response);

  const responseData =
    safeObject(response.data);

  const sessionData =
    pickFirstObject(
      root.session,
      root.sessionData,
      data.session,
      data.sessionData,
      payload.session,
      payload.sessionData,
      result.session,
      result.sessionData,
      body.session,
      body.sessionData,
      responseData.session,
      responseData.sessionData
    ) || {};

  const authData =
    pickFirstObject(
      root.auth,
      root.authData,
      data.auth,
      data.authData,
      payload.auth,
      payload.authData,
      result.auth,
      result.authData,
      body.auth,
      body.authData,
      responseData.auth,
      responseData.authData
    ) || {};

  const nestedSessionData =
    safeObject(sessionData.data);

  const nestedAuthData =
    safeObject(authData.data);

  return {
    root,
    data,
    payload,
    result,
    body,
    response,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  };
}

function extractAuthToken(raw = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    root.token,
    root.accessToken,
    root.access_token,
    root.authToken,
    root.auth_token,
    root.jwt,
    root.idToken,
    root.id_token,

    data.token,
    data.accessToken,
    data.access_token,
    data.authToken,
    data.auth_token,
    data.jwt,
    data.idToken,
    data.id_token,

    payload.token,
    payload.accessToken,
    payload.access_token,
    payload.authToken,
    payload.auth_token,
    payload.jwt,

    result.token,
    result.accessToken,
    result.access_token,
    result.authToken,
    result.auth_token,
    result.jwt,

    body.token,
    body.accessToken,
    body.access_token,
    body.authToken,
    body.auth_token,
    body.jwt,

    responseData.token,
    responseData.accessToken,
    responseData.access_token,
    responseData.authToken,
    responseData.auth_token,
    responseData.jwt,

    sessionData.token,
    sessionData.accessToken,
    sessionData.access_token,
    sessionData.authToken,
    sessionData.auth_token,
    sessionData.jwt,

    authData.token,
    authData.accessToken,
    authData.access_token,
    authData.authToken,
    authData.auth_token,
    authData.jwt,

    nestedSessionData.token,
    nestedSessionData.accessToken,
    nestedSessionData.access_token,
    nestedSessionData.jwt,

    nestedAuthData.token,
    nestedAuthData.accessToken,
    nestedAuthData.access_token,
    nestedAuthData.jwt
  );
}

function extractRefreshToken(raw = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    root.refreshToken,
    root.refresh_token,

    data.refreshToken,
    data.refresh_token,

    payload.refreshToken,
    payload.refresh_token,

    result.refreshToken,
    result.refresh_token,

    body.refreshToken,
    body.refresh_token,

    responseData.refreshToken,
    responseData.refresh_token,

    sessionData.refreshToken,
    sessionData.refresh_token,

    authData.refreshToken,
    authData.refresh_token,

    nestedSessionData.refreshToken,
    nestedSessionData.refresh_token,

    nestedAuthData.refreshToken,
    nestedAuthData.refresh_token
  );
}

function extractTempToken(raw = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    root.tempToken,
    root.temp_token,
    root.temporaryToken,
    root.temporary_token,
    root.twoFactorToken,
    root.two_factor_token,
    root.mfaToken,
    root.mfa_token,

    data.tempToken,
    data.temp_token,
    data.temporaryToken,
    data.temporary_token,
    data.twoFactorToken,
    data.two_factor_token,
    data.mfaToken,
    data.mfa_token,

    payload.tempToken,
    payload.temp_token,
    payload.temporaryToken,
    payload.temporary_token,
    payload.twoFactorToken,
    payload.two_factor_token,
    payload.mfaToken,
    payload.mfa_token,

    result.tempToken,
    result.temp_token,
    result.temporaryToken,
    result.temporary_token,
    result.twoFactorToken,
    result.two_factor_token,
    result.mfaToken,
    result.mfa_token,

    body.tempToken,
    body.temp_token,
    body.temporaryToken,
    body.temporary_token,
    body.twoFactorToken,
    body.two_factor_token,
    body.mfaToken,
    body.mfa_token,

    responseData.tempToken,
    responseData.temp_token,
    responseData.temporaryToken,
    responseData.temporary_token,
    responseData.twoFactorToken,
    responseData.two_factor_token,
    responseData.mfaToken,
    responseData.mfa_token,

    sessionData.tempToken,
    sessionData.temp_token,
    sessionData.temporaryToken,
    sessionData.temporary_token,
    sessionData.twoFactorToken,
    sessionData.two_factor_token,
    sessionData.mfaToken,
    sessionData.mfa_token,

    authData.tempToken,
    authData.temp_token,
    authData.temporaryToken,
    authData.temporary_token,
    authData.twoFactorToken,
    authData.two_factor_token,
    authData.mfaToken,
    authData.mfa_token,

    nestedSessionData.tempToken,
    nestedSessionData.temp_token,
    nestedSessionData.temporaryToken,
    nestedSessionData.temporary_token,

    nestedAuthData.tempToken,
    nestedAuthData.temp_token,
    nestedAuthData.temporaryToken,
    nestedAuthData.temporary_token
  );
}

function extractAuthUser(raw = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstObject(
    root.user,
    root.usuario,
    root.account,
    root.profile,
    root.me,

    data.user,
    data.usuario,
    data.account,
    data.profile,
    data.me,

    payload.user,
    payload.usuario,
    payload.account,
    payload.profile,
    payload.me,

    result.user,
    result.usuario,
    result.account,
    result.profile,
    result.me,

    body.user,
    body.usuario,
    body.account,
    body.profile,
    body.me,

    responseData.user,
    responseData.usuario,
    responseData.account,
    responseData.profile,
    responseData.me,

    sessionData.user,
    sessionData.usuario,
    sessionData.account,
    sessionData.profile,
    sessionData.me,

    authData.user,
    authData.usuario,
    authData.account,
    authData.profile,
    authData.me,

    nestedSessionData.user,
    nestedSessionData.usuario,
    nestedSessionData.account,
    nestedSessionData.profile,
    nestedSessionData.me,

    nestedAuthData.user,
    nestedAuthData.usuario,
    nestedAuthData.account,
    nestedAuthData.profile,
    nestedAuthData.me
  );
}

function extractRole(raw = {}, user = null) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    root.role,
    root.rol,

    data.role,
    data.rol,

    payload.role,
    payload.rol,

    result.role,
    result.rol,

    body.role,
    body.rol,

    responseData.role,
    responseData.rol,

    sessionData.role,
    sessionData.rol,

    authData.role,
    authData.rol,

    nestedSessionData.role,
    nestedSessionData.rol,

    nestedAuthData.role,
    nestedAuthData.rol,

    user?.role,
    user?.rol,
    user?.type,
    user?.tipo
  );
}

function extractStatus(raw = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    response,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstValue(
    root.status,
    root.statusCode,
    root.status_code,

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

    response.status,
    response.statusCode,
    response.status_code,

    responseData.status,
    responseData.statusCode,
    responseData.status_code,

    sessionData.status,
    sessionData.statusCode,
    sessionData.status_code,

    authData.status,
    authData.statusCode,
    authData.status_code,

    nestedSessionData.status,
    nestedSessionData.statusCode,
    nestedSessionData.status_code,

    nestedAuthData.status,
    nestedAuthData.statusCode,
    nestedAuthData.status_code
  );
}

function extractCode(raw = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    root.code,
    root.errorCode,
    root.error_code,
    root.error,

    data.code,
    data.errorCode,
    data.error_code,
    data.error,

    payload.code,
    payload.errorCode,
    payload.error_code,
    payload.error,

    result.code,
    result.errorCode,
    result.error_code,
    result.error,

    body.code,
    body.errorCode,
    body.error_code,
    body.error,

    responseData.code,
    responseData.errorCode,
    responseData.error_code,
    responseData.error,

    sessionData.code,
    sessionData.errorCode,
    sessionData.error_code,
    sessionData.error,

    authData.code,
    authData.errorCode,
    authData.error_code,
    authData.error,

    nestedSessionData.code,
    nestedSessionData.errorCode,
    nestedSessionData.error_code,
    nestedSessionData.error,

    nestedAuthData.code,
    nestedAuthData.errorCode,
    nestedAuthData.error_code,
    nestedAuthData.error
  );
}

function extractResponseMessage(raw = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    root.message,
    root.mensaje,
    root.errorMessage,
    root.error_message,

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

    responseData.message,
    responseData.mensaje,
    responseData.errorMessage,
    responseData.error_message,

    sessionData.message,
    sessionData.mensaje,
    sessionData.errorMessage,
    sessionData.error_message,

    authData.message,
    authData.mensaje,
    authData.errorMessage,
    authData.error_message,

    nestedSessionData.message,
    nestedSessionData.mensaje,

    nestedAuthData.message,
    nestedAuthData.mensaje
  );
}

function extractRedirectTo(raw = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(raw);

  return pickFirstText(
    root.redirectTo,
    root.redirect_to,
    root.redirect,
    root.next,
    root.nextPath,
    root.next_path,

    data.redirectTo,
    data.redirect_to,
    data.redirect,
    data.next,
    data.nextPath,
    data.next_path,

    payload.redirectTo,
    payload.redirect_to,
    payload.redirect,
    payload.next,
    payload.nextPath,
    payload.next_path,

    result.redirectTo,
    result.redirect_to,
    result.redirect,
    result.next,
    result.nextPath,
    result.next_path,

    body.redirectTo,
    body.redirect_to,
    body.redirect,
    body.next,
    body.nextPath,
    body.next_path,

    responseData.redirectTo,
    responseData.redirect_to,
    responseData.redirect,
    responseData.next,
    responseData.nextPath,
    responseData.next_path,

    sessionData.redirectTo,
    sessionData.redirect_to,
    sessionData.redirect,

    authData.redirectTo,
    authData.redirect_to,
    authData.redirect,

    nestedSessionData.redirectTo,
    nestedSessionData.redirect_to,
    nestedSessionData.redirect,

    nestedAuthData.redirectTo,
    nestedAuthData.redirect_to,
    nestedAuthData.redirect
  );
}

function extractSessionData(raw = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
    sessionData,
    authData,
  } = getNestedAuthData(raw);

  return (
    pickFirstObject(
      root.sessionData,
      root.session,
      data.sessionData,
      data.session,
      payload.sessionData,
      payload.session,
      result.sessionData,
      result.session,
      body.sessionData,
      body.session,
      responseData.sessionData,
      responseData.session,
      sessionData,
      authData
    ) || null
  );
}

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
    safeText(user._id, "") ||
    safeText(user.uid, "") ||
    safeText(user.username, "") ||
    safeText(user.email, "") ||
    safeText(user.phone, "") ||
    safeText(user.telefono, "")
  );
}

function isExplicitAuthFailure(raw = {}) {
  const root =
    safeObject(raw);

  const {
    data,
    payload,
    result,
    body,
    responseData,
  } = getNestedAuthData(root);

  const statusValue =
    extractStatus(root);

  const statusNumber =
    Number(statusValue || 0);

  if (
    Number.isFinite(statusNumber) &&
    statusNumber >= 400
  ) {
    return true;
  }

  const code =
    safeText(
      extractCode(root),
      ""
    ).toUpperCase();

  if (
    code &&
    AUTH_FAILURE_CODES.has(code)
  ) {
    return true;
  }

  if (
    root.ok === false ||
    root.success === false ||
    data.ok === false ||
    data.success === false ||
    payload.ok === false ||
    payload.success === false ||
    result.ok === false ||
    result.success === false ||
    body.ok === false ||
    body.success === false ||
    responseData.ok === false ||
    responseData.success === false
  ) {
    return true;
  }

  return false;
}

function is2FARequired(raw = {}, tempToken = "") {
  const root =
    safeObject(raw);

  const {
    data,
    payload,
    result,
    body,
    responseData,
    sessionData,
    authData,
    nestedSessionData,
    nestedAuthData,
  } = getNestedAuthData(root);

  const status =
    safeText(
      extractStatus(root),
      ""
    ).toLowerCase();

  return Boolean(
    tempToken ||

    normalizeBoolean(root.requires2FA, false) ||
    normalizeBoolean(root.require2FA, false) ||
    normalizeBoolean(root.requiresTwoFactor, false) ||
    normalizeBoolean(root.twoFactorRequired, false) ||
    normalizeBoolean(root.mfaRequired, false) ||
    normalizeBoolean(root.requiresMfa, false) ||

    normalizeBoolean(data.requires2FA, false) ||
    normalizeBoolean(data.require2FA, false) ||
    normalizeBoolean(data.requiresTwoFactor, false) ||
    normalizeBoolean(data.twoFactorRequired, false) ||
    normalizeBoolean(data.mfaRequired, false) ||
    normalizeBoolean(data.requiresMfa, false) ||

    normalizeBoolean(payload.requires2FA, false) ||
    normalizeBoolean(payload.require2FA, false) ||
    normalizeBoolean(payload.requiresTwoFactor, false) ||
    normalizeBoolean(payload.twoFactorRequired, false) ||
    normalizeBoolean(payload.mfaRequired, false) ||
    normalizeBoolean(payload.requiresMfa, false) ||

    normalizeBoolean(result.requires2FA, false) ||
    normalizeBoolean(result.require2FA, false) ||
    normalizeBoolean(result.requiresTwoFactor, false) ||
    normalizeBoolean(result.twoFactorRequired, false) ||
    normalizeBoolean(result.mfaRequired, false) ||
    normalizeBoolean(result.requiresMfa, false) ||

    normalizeBoolean(body.requires2FA, false) ||
    normalizeBoolean(body.require2FA, false) ||
    normalizeBoolean(body.requiresTwoFactor, false) ||
    normalizeBoolean(body.twoFactorRequired, false) ||
    normalizeBoolean(body.mfaRequired, false) ||
    normalizeBoolean(body.requiresMfa, false) ||

    normalizeBoolean(responseData.requires2FA, false) ||
    normalizeBoolean(responseData.require2FA, false) ||
    normalizeBoolean(responseData.twoFactorRequired, false) ||
    normalizeBoolean(responseData.mfaRequired, false) ||

    normalizeBoolean(sessionData.requires2FA, false) ||
    normalizeBoolean(sessionData.twoFactorRequired, false) ||
    normalizeBoolean(sessionData.mfaRequired, false) ||

    normalizeBoolean(authData.requires2FA, false) ||
    normalizeBoolean(authData.twoFactorRequired, false) ||
    normalizeBoolean(authData.mfaRequired, false) ||

    normalizeBoolean(nestedSessionData.requires2FA, false) ||
    normalizeBoolean(nestedSessionData.twoFactorRequired, false) ||

    normalizeBoolean(nestedAuthData.requires2FA, false) ||
    normalizeBoolean(nestedAuthData.twoFactorRequired, false) ||

    status === "2fa_required" ||
    status === "mfa_required" ||
    status === "two_factor_required"
  );
}

function tryValidateAuthResponse(response) {
  try {
    return validateAuthResponse(
      response
    );
  } catch (error) {
    throw error;
  }
}

function normalizeAuthPayload({
  response,
  validated,
} = {}) {
  const responseObject =
    safeObject(response);

  const validatedObject =
    safeObject(validated);

  const merged = {
    ...responseObject,
    ...validatedObject,

    data: {
      ...safeObject(responseObject.data),
      ...safeObject(validatedObject.data),
    },

    session: {
      ...safeObject(responseObject.session),
      ...safeObject(validatedObject.session),
    },

    auth: {
      ...safeObject(responseObject.auth),
      ...safeObject(validatedObject.auth),
    },
  };

  const token =
    extractAuthToken(merged);

  const refreshToken =
    extractRefreshToken(merged);

  const tempToken =
    extractTempToken(merged);

  const user =
    extractAuthUser(merged);

  const role =
    extractRole(merged, user);

  const status =
    extractStatus(merged);

  const code =
    extractCode(merged);

  const message =
    extractResponseMessage(merged);

  const redirectTo =
    extractRedirectTo(merged);

  const sessionData =
    extractSessionData(merged);

  const explicitFailure =
    isExplicitAuthFailure(merged);

  const requires2FA =
    is2FARequired(merged, tempToken);

  const authenticated =
    !explicitFailure &&
    !requires2FA &&
    hasUsableToken(token) &&
    hasUsableUser(user);

  return {
    raw:
      response,

    validated:
      validated || null,

    ok:
      explicitFailure
        ? false
        : authenticated || requires2FA,

    success:
      explicitFailure
        ? false
        : authenticated || requires2FA,

    explicitFailure,
    authenticated,

    status:
      safeText(
        status,
        explicitFailure
          ? "auth_failed"
          : requires2FA
            ? "2fa_required"
            : authenticated
              ? "authenticated"
              : ""
      ),

    code:
      safeText(code, ""),

    message:
      safeText(message, ""),

    token:
      safeText(token, ""),

    refreshToken:
      safeText(refreshToken, ""),

    tempToken:
      safeText(tempToken, ""),

    user:
      user || null,

    role:
      safeText(role, ""),

    sessionData,
    requires2FA,

    redirectTo:
      safeText(redirectTo, ""),
  };
}

function createAuthError(
  message = "No se pudo iniciar sesión.",
  {
    status = 401,
    code = "INVALID_LOGIN_SESSION",
    raw = null,
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

  error.raw =
    raw;

  return error;
}

function assertValidAuthenticatedPayload(authData = {}) {
  if (
    authData.explicitFailure ||
    authData.ok === false
  ) {
    throw createAuthError(
      authData.message ||
        "Credenciales incorrectas.",
      {
        status:
          Number(authData.status) || 401,
        code:
          authData.code ||
          "INVALID_CREDENTIALS",
        raw:
          authData.raw,
      }
    );
  }

  if (
    !hasUsableToken(
      authData.token
    )
  ) {
    throw createAuthError(
      "El login no devolvió token de autenticación.",
      {
        status: 401,
        code: "INVALID_LOGIN_SESSION",
        raw: authData.raw,
      }
    );
  }

  if (
    !hasUsableUser(
      authData.user
    )
  ) {
    throw createAuthError(
      "El login no devolvió un usuario válido.",
      {
        status: 401,
        code: "INVALID_LOGIN_SESSION",
        raw: authData.raw,
      }
    );
  }

  return true;
}

/* =========================================================
   SESSION CLEANUP
========================================================= */

function clearKnownAuthStorage() {
  if (!isBrowser()) {
    return;
  }

  KNOWN_AUTH_STORAGE_KEYS.forEach((key) => {
    try {
      window.localStorage?.removeItem?.(key);
    } catch {}

    try {
      window.sessionStorage?.removeItem?.(key);
    } catch {}
  });
}

function clearTempTokenSafe() {
  try {
    persistTempToken(null);
  } catch {}

  try {
    persistTempToken("");
  } catch {}

  if (!isBrowser()) {
    return;
  }

  [
    "onion_temp_token",
    "temp_token",
    "temporary_token",
    "two_factor_token",
    "mfa_token",
  ].forEach((key) => {
    try {
      window.localStorage?.removeItem?.(key);
    } catch {}

    try {
      window.sessionStorage?.removeItem?.(key);
    } catch {}
  });
}

function clearAuthRuntimeState(reason = "login_cleanup") {
  try {
    clearSessionLocal({
      silent: true,
    });
  } catch {
    try {
      clearSessionLocal();
    } catch {}
  }

  try {
    AppCore?.clearSession?.();
  } catch {}

  try {
    AppCore?.session?.clear?.();
  } catch {}

  try {
    AppCore?.setState?.({
      authenticated: false,
      user: null,
      role: null,
      token: null,
      accessToken: null,
      session: null,
      sessionId: null,
      loginInProgress: false,
    });
  } catch {
    try {
      if (AppCore?.state) {
        AppCore.state.authenticated = false;
        AppCore.state.user = null;
        AppCore.state.role = null;
        AppCore.state.token = null;
        AppCore.state.accessToken = null;
        AppCore.state.session = null;
        AppCore.state.sessionId = null;
        AppCore.state.loginInProgress = false;
      }
    } catch {}
  }

  clearKnownAuthStorage();

  safeEmit(
    "auth:session:cleared",
    {
      reason,
      source: "auth.login",
    }
  );
}

function markLoginInProgress(value = false) {
  try {
    AppCore?.setState?.({
      loginInProgress:
        Boolean(value),
    });
  } catch {
    try {
      if (AppCore?.state) {
        AppCore.state.loginInProgress =
          Boolean(value);
      }
    } catch {}
  }
}

/* =========================================================
   SESSION APPLY
========================================================= */

function enforceAuthenticatedCoreState(snapshot = {}) {
  const user =
    snapshot.user || null;

  const token =
    snapshot.token ||
    snapshot.accessToken ||
    "";

  const role =
    snapshot.role ||
    user?.role ||
    user?.rol ||
    "";

  try {
    AppCore?.setState?.({
      authenticated: true,
      user,
      currentUser: user,
      authUser: user,
      role,
      token,
      accessToken: token,
      session: {
        ...(safeObject(getState().session)),
        user,
        role,
        token,
        accessToken: token,
        authenticated: true,
      },
    });
  } catch {
    try {
      if (AppCore?.state) {
        AppCore.state.authenticated = true;
        AppCore.state.user = user;
        AppCore.state.currentUser = user;
        AppCore.state.authUser = user;
        AppCore.state.role = role;
        AppCore.state.token = token;
        AppCore.state.accessToken = token;
        AppCore.state.session = {
          ...(safeObject(AppCore.state.session)),
          user,
          role,
          token,
          accessToken: token,
          authenticated: true,
        };
      }
    } catch {}
  }

  return {
    user,
    token,
    role,
  };
}

/* =========================================================
   CORE LOGIN
========================================================= */

async function executeLogin(
  credentials = {},
  sequence = 0,
  options = {}
) {
  const payload =
    normalizeLoginPayload(
      credentials
    );

  if (
    !payload.identifier ||
    !payload.password
  ) {
    throw createAuthError(
      "Usuario/email y contraseña son obligatorios.",
      {
        status: 400,
        code: "MISSING_CREDENTIALS",
      }
    );
  }

  const apiClient =
    getApiClient();

  if (
    !apiClient ||
    typeof apiClient.post !== "function"
  ) {
    throw createAuthError(
      "No hay cliente API disponible para login.",
      {
        status: 500,
        code: "API_CLIENT_MISSING",
      }
    );
  }

  const endpoint =
    resolveLoginEndpoint();

  safeSetError(null);
  markLoginInProgress(true);

  safeEmit(
    "auth:login:start",
    {
      identifier:
        payload.identifier,
      endpoint,
      sequence,
      source:
        "auth.login",
    }
  );

  const response =
    await apiClient.post(
      endpoint,
      buildLoginRequestBody(
        credentials
      ),
      {
        auth: false,
      }
    );

  const validated =
    tryValidateAuthResponse(
      response
    );

  const authData =
    normalizeAuthPayload({
      response,
      validated,
    });

  if (
    authData.explicitFailure ||
    authData.ok === false
  ) {
    throw createAuthError(
      authData.message ||
        "Credenciales incorrectas.",
      {
        status:
          Number(authData.status) || 401,
        code:
          authData.code ||
          "INVALID_CREDENTIALS",
        raw:
          response,
      }
    );
  }

  /* =====================================================
     2FA
  ===================================================== */

  if (
    authData.requires2FA &&
    authData.tempToken
  ) {
    try {
      persistTempToken(
        authData.tempToken
      );
    } catch {}

    const result = {
      ok: true,
      success: true,
      status:
        "2fa_required",
      requires2FA: true,
      authenticated: false,
      tempToken:
        authData.tempToken,
      redirectTo:
        safeText(
          authData.redirectTo,
          DEFAULT_2FA_PATH
        ),
      response,
    };

    safeEmit(
      "auth:login:2fa-required",
      {
        ...result,
        source:
          "auth.login",
      }
    );

    if (
      shouldNavigateAfterLogin(
        options
      )
    ) {
      result.navigation =
        await safeNavigate(
          result.redirectTo,
          {
            replaceState: true,
            force: false,
            reason: "login-2fa",
          }
        );
    }

    return result;
  }

  if (
    authData.requires2FA &&
    !authData.tempToken
  ) {
    throw createAuthError(
      "Se requiere 2FA pero no se recibió token temporal.",
      {
        status: 401,
        code: "MISSING_2FA_TEMP_TOKEN",
        raw: response,
      }
    );
  }

  /* =====================================================
     CLEAN NORMAL LOGIN
  ===================================================== */

  assertValidAuthenticatedPayload(
    authData
  );

  clearTempTokenSafe();

  const snapshot =
    applySession({
      token:
        authData.token,

      accessToken:
        authData.token,

      user:
        authData.user,

      role:
        authData.role,

      refreshToken:
        authData.refreshToken || null,

      sessionData:
        authData.sessionData || null,

      authenticated:
        true,
    });

  if (
    !snapshot?.token ||
    !hasUsableToken(snapshot.token) ||
    !hasUsableUser(snapshot.user)
  ) {
    clearAuthRuntimeState(
      "invalid_snapshot_after_apply_session"
    );

    throw createAuthError(
      "El login devolvió sesión inválida.",
      {
        status: 401,
        code: "INVALID_LOGIN_SESSION",
        raw: response,
      }
    );
  }

  enforceAuthenticatedCoreState(
    snapshot
  );

  clearAuthScreenDomState(
    "login-session-applied"
  );

  safeSyncUserUI(
    "login-session-applied"
  );

  emitAuthenticatedEvents(
    "login-session-applied",
    {
      sequence,
    }
  );

  /*
    Pequeño yield para que AppCore/Auth/UI reciban el estado antes del render.
    Evita que Router pinte la vista privada con shell todavía en modo login.
  */
  await wait(0);

  const redirectTo =
    getPostLoginTarget(
      snapshot.user,
      options
    );

  const result = {
    ok: true,
    success: true,
    status:
      "authenticated",
    authenticated:
      true,
    requires2FA: false,
    token:
      snapshot.token,
    user:
      snapshot.user,
    role:
      snapshot.role ||
      authData.role ||
      "",
    refreshToken:
      authData.refreshToken || "",
    sessionData:
      authData.sessionData || null,
    redirectTo,
    response,
    navigation:
      null,
  };

  safeEmit(
    "auth:login:success",
    {
      ...result,
      source:
        "auth.login",
    }
  );

  if (
    shouldNavigateAfterLogin(
      options
    )
  ) {
    result.navigation =
      await safeNavigate(
        redirectTo,
        {
          replaceState: true,
          force:
            options.forceNavigate === true,
          reason:
            "login-success",
        }
      );
  }

  clearAuthScreenDomState(
    "login-success-after-navigation"
  );

  safeSyncUserUI(
    "login-success-after-navigation"
  );

  emitAuthenticatedEvents(
    "login-success-after-navigation",
    {
      sequence,
      redirectTo,
      navigation:
        result.navigation,
    }
  );

  afterPaint(() => {
    clearAuthScreenDomState(
      "login-success-after-paint"
    );

    safeSyncUserUI(
      "login-success-after-paint"
    );

    safeEmit(
      "app:ui:repair-request",
      {
        reason:
          "login-success-after-paint",
        source:
          "auth.login",
        authenticated:
          true,
        user:
          getState().user || null,
        role:
          getState().role || null,
      }
    );
  });

  return result;
}

/* =========================================================
   PUBLIC LOGIN
========================================================= */

export async function login(
  credentials = {},
  options = {}
) {
  if (loginPromise) {
    return loginPromise;
  }

  const sequence =
    ++loginSequence;

  loginPromise =
    (async () => {
      try {
        /*
          Limpieza previa dura:
          evita que un login nuevo herede avatar/token/usuario antiguos.
        */
        clearAuthRuntimeState(
          "before_login"
        );

        markLoginInProgress(true);

        return await executeLogin(
          credentials,
          sequence,
          options
        );
      } catch (error) {
        clearAuthRuntimeState(
          "login_failed"
        );

        safeSetError(error);

        safeEmit(
          "auth:login:error",
          {
            sequence,
            error,
            message:
              extractMessage(
                error
              ),
            source:
              "auth.login",
          }
        );

        throw error;
      } finally {
        markLoginInProgress(false);
        loginPromise = null;
      }
    })();

  return loginPromise;
}

/* =========================================================
   FORM SUBMIT
========================================================= */

export async function handleLoginFormSubmit(
  formElement,
  options = {}
) {
  const HTMLForm =
    isBrowser()
      ? window.HTMLFormElement
      : null;

  if (
    !HTMLForm ||
    !(formElement instanceof HTMLForm)
  ) {
    throw new Error(
      "Se esperaba un formulario HTML válido."
    );
  }

  const formData =
    new FormData(
      formElement
    );

  const credentials = {
    identifier:
      formData.get(
        "identifier"
      ) ||
      formData.get(
        "username"
      ) ||
      formData.get(
        "email"
      ) ||
      formData.get(
        "phone"
      ) ||
      formData.get(
        "user"
      ) ||
      "",

    password:
      formData.get(
        "password"
      ) || "",

    remember:
      formData.get(
        "remember"
      ) === "on" ||
      formData.get(
        "remember"
      ) === "true",
  };

  const result =
    await login(
      credentials,
      options
    );

  if (
    safeBool(
      options.resetOnSuccess
    ) &&
    result?.status === "authenticated"
  ) {
    formElement.reset();
  }

  return result;
}
