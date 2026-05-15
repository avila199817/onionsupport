/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/login/index.js

   LOGIN VIEW ORCHESTRATOR · CORE/AUTH/ROUTER SAFE · 16.1/10

   RESPONSABILIDADES:
   - Orquestar la vista de login.
   - Renderizar template auth pro sin CSS inline.
   - Conectar DOM, Auth, AppCore, Toast y password-field shared.
   - Delegar validación/sesión principal en Auth.login.
   - LoginView controla la navegación post-login por defecto.
   - Evitar doble navegación post-login.
   - Evitar doble sync de sesión post-login.
   - Evitar doble submit aunque la vista se monte dos veces.
   - Evitar toast loading huérfano si Router desmonta login durante Auth.login.
   - Evitar formulario congelado si Auth.login / Router / navegación se cuelga.
   - Evitar fallback history.replaceState falso-positivo que deja login pintado.
   - Reducir parpadeos al salir de /login.
   - Activar / limpiar modo auth-screen del body/html.
   - Mantener cleanup de listeners.
   - Exponer compatibilidad default + named export.
   - Soportar login con usuario, email o teléfono.
   - Conectar password-field compartido para eye / caps lock.

   REGLAS:
   - Auth.login aplica sesión.
   - Esta vista NO vuelve a llamar syncSession() si usa Auth.login.
   - Esta vista SÍ navega si después de Auth.login seguimos en /login.
   - Si deps.navigate === false, NO navega ni Auth ni la vista.
   - La navegación queda protegida por isStillOnLoginRoute().
   - El auth-screen se limpia sólo al salir realmente de /login.
   - El submit queda protegido a nivel local + global.
   - El toast loading se cierra incluso si mounted=false.
   - No se emite app:route:rendered por defecto para no duplicar Router.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import Toast from "../../ui/toast/index.js";

import {
  bindPasswordFieldsInScope,
} from "../../shared/password-field/index.js";

import {
  loadRememberedIdentifier,
  createLoginPayload,
  validateLoginPayload,
  getFirstLoginError,
  normalizeAuthResult,
  resolveAuthErrorMessage,
  persistRememberedIdentifier,
  syncSession,
  resolveLoginRedirect,
  safeText,
} from "./login.helpers.js";

import getLoginTemplate from "./login.template.js";

import {
  getLoginRefs,
  clearLoginErrors,
  applyLoginErrors,
  setGlobalLoginError,
  setLoginLoading,
  focusLoginPrimaryField,
  readLoginFormState,
  bindLoginInputClearers,
  bindThemeToggle,
  bindLoginSubmit,
} from "./login.dom.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const LOGIN_VIEW_VERSION =
  "16.1.0-extreme-pro";

const LOGIN_SOURCE =
  "login.view";

const LOGIN_SCOPE =
  "view:login";

const LOGIN_ROUTE =
  "/login";

const DEFAULT_HOME_ROUTE =
  "/";

const DEFAULT_2FA_ROUTE =
  "/2fa";

const LOGIN_VIEW_INSTANCE_KEY =
  "__ONION_LOGIN_VIEW_INSTANCE__";

const LOGIN_VIEW_RUNTIME_KEY =
  "__ONION_LOGIN_VIEW__";

const LOGIN_SUCCESS_TOAST_DEDUPE_MS =
  1600;

const GLOBAL_LOGIN_SUBMIT_TIMEOUT_MS =
  45_000;

const GLOBAL_LOGIN_SUBMIT_STALE_GRACE_MS =
  2_500;

const LOGIN_NAVIGATION_TIMEOUT_MS =
  8_000;

const FORM_UNLOCK_WATCHDOG_EXTRA_MS =
  2_500;

const POST_NAVIGATION_RENDER_FAILSAFE_MS =
  1_250;

const AUTH_SCREEN_CLASSES =
  Object.freeze([
    "auth-screen",
    "login-no-scroll",
    "route-auth",
    "route-shell-hidden",
    "route-chrome-hidden",
  ]);

const APP_SCREEN_CLASSES =
  Object.freeze([
    "route-app",
    "route-shell-visible",
    "route-chrome-visible",
  ]);

const SENSITIVE_QUERY_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "activation_token",
    "activate_token",
    "resetToken",
    "reset_token",
    "passwordResetToken",
    "password_reset_token",
    "confirmToken",
    "confirm_token",
    "code",
    "t",
    "otp",
    "totp",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "authorization",
    "jwt",
    "session",
    "sid",
  ]);

const LOGIN_EVENTS =
  Object.freeze({
    ready:
      "auth:login:view:ready",

    submitStart:
      "auth:login:view:submit:start",

    submitDone:
      "auth:login:view:submit:done",

    submitBlocked:
      "auth:login:view:submit:blocked",

    submitUnlocked:
      "auth:login:view:submit:unlocked",

    error:
      "auth:login:view:error",

    navigationStart:
      "auth:login:view:navigation:start",

    navigationDone:
      "auth:login:view:navigation:done",

    navigationError:
      "auth:login:view:navigation:error",

    navigationFailsafe:
      "auth:login:view:navigation:failsafe",

    authScreenCleared:
      "auth:login:view:auth-screen-cleared",

    destroyed:
      "auth:login:view:destroyed",

    debugReady:
      "auth:login:view:debug-ready",
  });

/* =========================================================
   GLOBAL SUBMIT FIREBREAK
========================================================= */

let globalLoginSubmitPromise =
  null;

let globalLoginSubmitFingerprint =
  "";

let globalLoginSubmitStartedAt =
  0;

let lastLoginSuccessToastAt =
  0;

function buildLoginFingerprint(payload = {}) {
  return [
    safeText(
      payload.identifier ||
        payload.email ||
        payload.username ||
        payload.user ||
        payload.login ||
        "",
      ""
    ).toLowerCase(),

    payload.remember ? "1" : "0",
  ].join("|");
}

function hasGlobalLoginSubmitInFlight() {
  return Boolean(globalLoginSubmitPromise);
}

function forceClearGlobalLoginSubmit(reason = "") {
  globalLoginSubmitPromise =
    null;

  globalLoginSubmitFingerprint =
    "";

  globalLoginSubmitStartedAt =
    0;

  safeWarn(
    "global login submit lock cleared",
    reason || "unknown"
  );
}

function clearStaleGlobalLoginSubmit(timeoutMs = GLOBAL_LOGIN_SUBMIT_TIMEOUT_MS) {
  if (!globalLoginSubmitPromise) {
    return false;
  }

  const startedAt =
    Number(globalLoginSubmitStartedAt) || 0;

  if (startedAt <= 0) {
    forceClearGlobalLoginSubmit("missing-start-time");
    return true;
  }

  const maxAge =
    Math.max(
      1_000,
      Number(timeoutMs || 0) +
        GLOBAL_LOGIN_SUBMIT_STALE_GRACE_MS
    );

  if (safeNow() - startedAt > maxAge) {
    forceClearGlobalLoginSubmit("stale-timeout");
    return true;
  }

  return false;
}

function runGlobalLoginSubmit(executor, fingerprint = "", options = {}) {
  clearStaleGlobalLoginSubmit(
    options?.timeoutMs
  );

  if (globalLoginSubmitPromise) {
    return globalLoginSubmitPromise;
  }

  const timeoutMs =
    Math.max(
      0,
      Number(
        options?.timeoutMs ||
          GLOBAL_LOGIN_SUBMIT_TIMEOUT_MS
      ) || 0
    );

  let timeoutId =
    null;

  const workPromise =
    Promise.resolve()
      .then(() => executor());

  const timeoutPromise =
    timeoutMs > 0
      ? new Promise((_, reject) => {
          timeoutId =
            setTimeout(() => {
              const error =
                new Error("LOGIN_SUBMIT_TIMEOUT");

              error.code =
                "LOGIN_SUBMIT_TIMEOUT";

              reject(error);
            }, timeoutMs);
        })
      : null;

  const promise =
    timeoutPromise
      ? Promise.race([
          workPromise,
          timeoutPromise,
        ])
      : workPromise;

  globalLoginSubmitPromise =
    promise;

  globalLoginSubmitFingerprint =
    safeText(fingerprint, "");

  globalLoginSubmitStartedAt =
    safeNow();

  const clear = () => {
    if (timeoutId) {
      try {
        clearTimeout(timeoutId);
      } catch {}

      timeoutId =
        null;
    }

    if (globalLoginSubmitPromise === promise) {
      globalLoginSubmitPromise =
        null;

      globalLoginSubmitFingerprint =
        "";

      globalLoginSubmitStartedAt =
        0;
    }
  };

  promise.then(
    clear,
    clear
  );

  if (timeoutMs > 0) {
    setTimeout(() => {
      clear();
    }, timeoutMs + GLOBAL_LOGIN_SUBMIT_STALE_GRACE_MS);
  }

  return promise;
}

/* =========================================================
   BASIC HELPERS
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

function safeObject(value, fallback = {}) {
  return isPlainObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoNow(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function escapeRegExp(value = "") {
  return String(value)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeRedact(value = "") {
  const text =
    safeText(value, "");

  if (!text) {
    return "";
  }

  try {
    if (isFunction(AppCore?.utils?.redactTokenInText)) {
      return AppCore.utils.redactTokenInText(text);
    }
  } catch {}

  let output =
    text;

  for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
    try {
      output =
        output.replace(
          new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function normalizeError(error = null) {
  if (!error) {
    return null;
  }

  const source =
    error?.error ||
    error?.reason ||
    error;

  return {
    name:
      safeText(
        source?.name ||
          source?.constructor?.name,
        "Error"
      ),

    message:
      safeRedact(
        safeText(
          source?.message ||
            source?.reason ||
            source,
          "Error"
        )
      ),

    status:
      source?.status ||
      source?.statusCode ||
      source?.response?.status ||
      source?.data?.status ||
      0,

    code:
      source?.code ||
      source?.data?.code ||
      source?.response?.data?.code ||
      null,

    at:
      safeIsoNow(),
  };
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(
      "[LoginView]",
      ...args
    );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[LoginView]",
      ...args
    );
  } catch {}
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(
      "[LoginView]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.error(
        "[LoginView]",
        ...args
      );
    }
  } catch {}
}

function safeEmit(eventName, payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload = {
    ...safeObject(payload),

    source:
      LOGIN_SOURCE,

    version:
      LOGIN_VIEW_VERSION,

    at:
      safeIsoNow(),
  };

  let busAvailable =
    false;

  let emitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        name,
        cleanPayload
      );

      emitted =
        true;
    }
  } catch {}

  if (
    !busAvailable &&
    isBrowser()
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail:
            cleanPayload,
        })
      );

      emitted =
        true;
    } catch {}
  }

  return emitted;
}

/* =========================================================
   TOAST HELPERS
========================================================= */

function resolveToastApi(deps = {}) {
  const customToast =
    deps.toast ||
    deps.Toast ||
    null;

  if (
    customToast &&
    typeof customToast === "object"
  ) {
    return customToast;
  }

  return Toast;
}

function safeToastCall(toast, method, ...args) {
  try {
    if (isFunction(toast?.[method])) {
      return toast[method](...args);
    }
  } catch {}

  return null;
}

function showToastInfo(toast, message = "") {
  return (
    safeToastCall(
      toast,
      "info",
      message
    ) ||
    safeToastCall(
      toast,
      "success",
      message
    )
  );
}

function showLoginSuccessToastOnce(toast, message = "") {
  const current =
    safeNow();

  if (
    current - lastLoginSuccessToastAt <
    LOGIN_SUCCESS_TOAST_DEDUPE_MS
  ) {
    return null;
  }

  lastLoginSuccessToastAt =
    current;

  return safeToastCall(
    toast,
    "success",
    message ||
      "Sesión iniciada correctamente."
  );
}

function dismissLoginLoadingToast(
  toast,
  loadingToastId = null,
  {
    loadingActive = false,
  } = {}
) {
  const hasId =
    loadingToastId !== null &&
    loadingToastId !== undefined &&
    loadingToastId !== "";

  if (hasId) {
    safeToastCall(
      toast,
      "dismiss",
      loadingToastId
    );

    safeToastCall(
      toast,
      "remove",
      loadingToastId
    );

    safeToastCall(
      toast,
      "close",
      loadingToastId
    );
  }

  safeToastCall(
    toast,
    "dismissLoading"
  );

  safeToastCall(
    toast,
    "clearLoading"
  );

  if (
    loadingActive &&
    !hasId
  ) {
    safeToastCall(
      toast,
      "dismiss"
    );
  }
}

/* =========================================================
   EXECUTOR / AUTH HELPERS
========================================================= */

function getModuleAuth() {
  try {
    return (
      AppCore?.modules?.get?.("Auth") ||
      AppCore?.modules?.get?.("auth") ||
      AppCore?.Auth ||
      AppCore?.auth ||
      null
    );
  } catch {
    return null;
  }
}

function resolveLoginExecutor(deps = {}) {
  const moduleAuth =
    getModuleAuth();

  const candidates = [
    {
      fn:
        deps.onSubmit,
      owner:
        deps,
      source:
        "deps.onSubmit",
      custom:
        true,
    },

    {
      fn:
        deps.submitLogin,
      owner:
        deps,
      source:
        "deps.submitLogin",
      custom:
        true,
    },

    {
      fn:
        deps.login,
      owner:
        deps,
      source:
        "deps.login",
      custom:
        true,
    },

    {
      fn:
        Auth?.login,
      owner:
        Auth,
      source:
        "Auth.login",
      custom:
        false,
    },

    {
      fn:
        moduleAuth?.login,
      owner:
        moduleAuth,
      source:
        "moduleAuth.login",
      custom:
        false,
    },

    {
      fn:
        AppCore?.services?.auth?.login,
      owner:
        AppCore?.services?.auth,
      source:
        "AppCore.services.auth.login",
      custom:
        true,
    },

    {
      fn:
        AppCore?.auth?.login,
      owner:
        AppCore?.auth,
      source:
        "AppCore.auth.login",
      custom:
        false,
    },
  ];

  for (const candidate of candidates) {
    if (isFunction(candidate.fn)) {
      return candidate;
    }
  }

  return null;
}

function isAuthLoginExecutor(executorDescriptor, deps = {}) {
  if (
    deps.delegateNavigationToAuth === false ||
    deps.authLoginOwnsNavigation === false
  ) {
    return false;
  }

  const source =
    safeText(
      executorDescriptor?.source,
      ""
    );

  return (
    source === "Auth.login" ||
    source === "moduleAuth.login" ||
    source === "AppCore.auth.login"
  );
}

function shouldNavigateAfterLogin(deps = {}) {
  return !(
    deps.navigate === false ||
    deps.skipNavigate === true ||
    deps.manualNavigate === true
  );
}

function shouldExecutorOwnNavigation(deps = {}, executorDescriptor = null) {
  if (!shouldNavigateAfterLogin(deps)) {
    return false;
  }

  if (
    deps.authLoginOwnsNavigation === true ||
    deps.delegateNavigationToAuth === true ||
    deps.executorOwnsNavigation === true
  ) {
    return true;
  }

  /*
    Regla final:
    por defecto, Auth.login NO navega. Aplica sesión y LoginView decide.
    Esto evita el congelado por doble navegación / promesas de Router colgadas.
  */
  return false;
}

function buildLoginExecutorOptions(deps = {}, executorDescriptor = null) {
  const executorOwnsNavigation =
    shouldExecutorOwnNavigation(
      deps,
      executorDescriptor
    );

  const viewWillNavigate =
    shouldNavigateAfterLogin(deps);

  return {
    navigate:
      executorOwnsNavigation,

    redirectTo:
      deps.redirectTo,

    redirect:
      deps.redirect,

    target:
      deps.target,

    manualNavigate:
      deps.manualNavigate,

    skipNavigate:
      !executorOwnsNavigation,

    skipNavigation:
      !executorOwnsNavigation,

    skipRedirect:
      !executorOwnsNavigation,

    noRedirect:
      !executorOwnsNavigation,

    skipPostLoginNavigation:
      !executorOwnsNavigation,

    skipPostRestoreNavigation:
      true,

    preserveCurrentRoute:
      true,

    preserveRoute:
      true,

    preservePublicPath:
      true,

    source:
      LOGIN_SOURCE,

    emitLoginSuccessEvent:
      deps.emitLoginSuccessEvent === true,

    useLoader:
      deps.useLoader !== false,

    viewWillNavigate,
  };
}

function hasUsableUser(user = null) {
  if (
    !user ||
    typeof user !== "object" ||
    Array.isArray(user)
  ) {
    return false;
  }

  if (
    user.active === false ||
    user.disabled === true ||
    user.deleted === true ||
    user.blocked === true ||
    user.suspended === true
  ) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.sub, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "")
  );
}

function getStateUser() {
  const state =
    safeObject(AppCore?.state);

  return (
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    state.me ||
    state.account ||
    state.profile ||
    state.session?.user ||
    state.auth?.user ||
    null
  );
}

function getStateToken() {
  const state =
    safeObject(AppCore?.state);

  return safeText(
    state.token ||
      state.accessToken ||
      state.access_token ||
      state.auth?.token ||
      state.auth?.accessToken ||
      state.auth?.access_token ||
      state.session?.token ||
      state.session?.accessToken ||
      state.session?.access_token ||
      "",
    ""
  );
}

function hasUsableStateSession() {
  const state =
    safeObject(AppCore?.state);

  return Boolean(
    state.authenticated === true &&
      hasUsableUser(getStateUser())
  );
}

function isAuthenticatedResult(auth = {}) {
  if (!auth) {
    return false;
  }

  if (auth.requires2FA === true) {
    return false;
  }

  if (auth.explicitFailure === true) {
    return false;
  }

  if (
    auth.ok === false &&
    !hasUsableStateSession()
  ) {
    return false;
  }

  const token =
    safeText(
      auth.token ||
        auth.accessToken ||
        auth.access_token ||
        getStateToken() ||
        "",
      ""
    );

  const user =
    auth.user ||
    auth.usuario ||
    auth.me ||
    auth.account ||
    auth.profile ||
    getStateUser() ||
    null;

  if (
    auth.status === "authenticated" ||
    auth.authenticated === true
  ) {
    return hasUsableUser(user) || hasUsableStateSession();
  }

  if (
    auth.success === true ||
    auth.ok === true
  ) {
    return Boolean(
      hasUsableUser(user) ||
        hasUsableStateSession() ||
        (
          token &&
          hasUsableUser(user)
        )
    );
  }

  return Boolean(
    token &&
      hasUsableUser(user)
  );
}

function isTwoFaResult(auth = {}) {
  const status =
    safeText(
      auth?.status,
      ""
    ).toLowerCase();

  return (
    auth?.requires2FA === true ||
    status === "2fa_required" ||
    status === "mfa_required" ||
    status === "two_factor_required" ||
    status === "otp_required"
  );
}

function callLoginExecutor(executorDescriptor, payload, options) {
  if (!executorDescriptor?.fn) {
    throw new Error("LOGIN_EXECUTOR_MISSING");
  }

  return executorDescriptor.fn.call(
    executorDescriptor.owner || null,
    payload,
    options
  );
}

/* =========================================================
   ROUTE / NAVIGATION HELPERS
========================================================= */

function normalizePath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  try {
    if (isFunction(AppCore?.utils?.normalizePath)) {
      const normalized =
        AppCore.utils.normalizePath(raw);

      if (normalized) {
        return normalized;
      }
    }
  } catch {}

  if (raw === "/") {
    return "/";
  }

  return (
    raw
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") ||
    "/"
  );
}

function stripSearchAndHash(path = "/") {
  return (
    normalizePath(path)
      .split("?")[0]
      .split("#")[0] ||
    "/"
  );
}

function isSafeInternalPath(path = "") {
  const value =
    safeText(path, "");

  if (!value) {
    return false;
  }

  if (!value.startsWith("/")) {
    return false;
  }

  if (value.startsWith("//")) {
    return false;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return false;
  }

  if (/[\r\n\t]/.test(value)) {
    return false;
  }

  const lower =
    value.toLowerCase();

  if (
    lower.includes("%0d") ||
    lower.includes("%0a") ||
    lower.includes("%09") ||
    lower.includes("%5c") ||
    value.includes("\\")
  ) {
    return false;
  }

  try {
    const decoded =
      decodeURIComponent(value)
        .trim()
        .replace(/\\/g, "/");

    if (
      decoded.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

function isLoginRoute(path = "") {
  const clean =
    stripSearchAndHash(path);

  return (
    clean === LOGIN_ROUTE ||
    clean.startsWith(`${LOGIN_ROUTE}/`)
  );
}

function sanitizeNavigationPath(path = "/", fallback = DEFAULT_HOME_ROUTE) {
  const raw =
    safeText(path, fallback) ||
    fallback;

  const candidate =
    normalizePath(raw);

  if (!candidate) {
    return fallback;
  }

  if (!isSafeInternalPath(candidate)) {
    return fallback;
  }

  if (isLoginRoute(candidate)) {
    return fallback;
  }

  return candidate;
}

function getBrowserPath() {
  if (!isBrowser()) {
    return DEFAULT_HOME_ROUTE;
  }

  try {
    return normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return DEFAULT_HOME_ROUTE;
  }
}

function isStillOnLoginRoute() {
  return isLoginRoute(
    getBrowserPath()
  );
}

function getRedirectFromCurrentUrl() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const params =
      new URLSearchParams(
        window.location.search || ""
      );

    const value =
      params.get("redirect") ||
      params.get("redirectTo") ||
      params.get("returnTo") ||
      params.get("next") ||
      "";

    if (!value) {
      return "";
    }

    return sanitizeNavigationPath(
      value,
      ""
    );
  } catch {
    return "";
  }
}

function resolveFinalLoginRedirect(auth = {}, deps = {}) {
  const fromHelper =
    safeText(
      resolveLoginRedirect(auth, deps),
      ""
    );

  if (
    fromHelper &&
    isSafeInternalPath(fromHelper) &&
    !isLoginRoute(fromHelper)
  ) {
    return sanitizeNavigationPath(
      fromHelper,
      DEFAULT_HOME_ROUTE
    );
  }

  const fromUrl =
    getRedirectFromCurrentUrl();

  if (
    fromUrl &&
    isSafeInternalPath(fromUrl) &&
    !isLoginRoute(fromUrl)
  ) {
    return sanitizeNavigationPath(
      fromUrl,
      DEFAULT_HOME_ROUTE
    );
  }

  return DEFAULT_HOME_ROUTE;
}

function getRouterCandidates() {
  const candidates =
    [];

  try {
    candidates.push(
      AppCore?.Router,
      AppCore?.router,
      AppCore?.modules?.get?.("Router"),
      AppCore?.modules?.get?.("router")
    );
  } catch {}

  try {
    if (isBrowser()) {
      candidates.push(
        window.Router,
        window.AppRouter,
        window.AppCore?.Router,
        window.AppCore?.router
      );
    }
  } catch {}

  return candidates.filter(Boolean);
}

function withTimeout(promiseLike, timeoutMs = 0, timeoutCode = "TIMEOUT") {
  const ms =
    Math.max(0, Number(timeoutMs || 0));

  if (!ms) {
    return Promise.resolve(promiseLike);
  }

  let timer =
    null;

  const timeoutPromise =
    new Promise((_, reject) => {
      timer =
        setTimeout(() => {
          const error =
            new Error(timeoutCode);

          error.code =
            timeoutCode;

          reject(error);
        }, ms);
    });

  return Promise.race([
    Promise.resolve(promiseLike),
    timeoutPromise,
  ]).finally(() => {
    if (timer) {
      try {
        clearTimeout(timer);
      } catch {}

      timer =
        null;
    }
  });
}

function hardRedirectTo(target = DEFAULT_HOME_ROUTE) {
  if (!isBrowser()) {
    return false;
  }

  const finalTarget =
    sanitizeNavigationPath(
      target,
      DEFAULT_HOME_ROUTE
    );

  try {
    window.location.assign(finalTarget);
    return true;
  } catch {
    try {
      window.location.href =
        finalTarget;

      return true;
    } catch {}
  }

  return false;
}

async function navigateTo(path = "/", options = {}) {
  const target =
    sanitizeNavigationPath(
      path,
      DEFAULT_HOME_ROUTE
    );

  const canonicalTarget =
    stripSearchAndHash(target);

  const replaceState =
    options.replaceState !== false;

  const timeoutMs =
    Math.max(
      1_000,
      Number(options.timeoutMs || LOGIN_NAVIGATION_TIMEOUT_MS) ||
        LOGIN_NAVIGATION_TIMEOUT_MS
    );

  const routerOptions = {
    replaceState,

    force:
      options.force === true,

    source:
      LOGIN_SOURCE,

    reason:
      options.reason || "login-view-navigation",

    publicPath:
      target,

    requestedPath:
      target,

    canonicalPath:
      canonicalTarget,
  };

  safeEmit(
    LOGIN_EVENTS.navigationStart,
    {
      target:
        safeRedact(target),
      replaceState,
      reason:
        routerOptions.reason,
    }
  );

  for (const router of getRouterCandidates()) {
    try {
      if (isFunction(router.goAfterLogin)) {
        await withTimeout(
          router.goAfterLogin(
            target,
            routerOptions
          ),
          timeoutMs,
          "LOGIN_NAVIGATE_TIMEOUT"
        );

        safeEmit(
          LOGIN_EVENTS.navigationDone,
          {
            target:
              safeRedact(target),
            method:
              "goAfterLogin",
          }
        );

        return true;
      }

      if (isFunction(router.navigate)) {
        await withTimeout(
          router.navigate(
            target,
            routerOptions
          ),
          timeoutMs,
          "LOGIN_NAVIGATE_TIMEOUT"
        );

        safeEmit(
          LOGIN_EVENTS.navigationDone,
          {
            target:
              safeRedact(target),
            method:
              "navigate",
          }
        );

        return true;
      }

      if (isFunction(router.go)) {
        await withTimeout(
          router.go(
            target,
            routerOptions
          ),
          timeoutMs,
          "LOGIN_NAVIGATE_TIMEOUT"
        );

        safeEmit(
          LOGIN_EVENTS.navigationDone,
          {
            target:
              safeRedact(target),
            method:
              "go",
          }
        );

        return true;
      }

      if (isFunction(router.push)) {
        await withTimeout(
          router.push(
            target,
            routerOptions
          ),
          timeoutMs,
          "LOGIN_NAVIGATE_TIMEOUT"
        );

        safeEmit(
          LOGIN_EVENTS.navigationDone,
          {
            target:
              safeRedact(target),
            method:
              "push",
          }
        );

        return true;
      }

      if (isFunction(router.render)) {
        await withTimeout(
          router.render(
            canonicalTarget,
            {
              ...routerOptions,
              replaceState,
              force:
                true,
              forceRender:
                true,
            }
          ),
          timeoutMs,
          "LOGIN_NAVIGATE_TIMEOUT"
        );

        safeEmit(
          LOGIN_EVENTS.navigationDone,
          {
            target:
              safeRedact(target),
            method:
              "render",
          }
        );

        return true;
      }
    } catch (error) {
      safeWarn(
        "Router navigation falló.",
        normalizeError(error)
      );
    }
  }

  try {
    if (isFunction(AppCore?.navigate)) {
      await withTimeout(
        AppCore.navigate(
          target,
          routerOptions
        ),
        timeoutMs,
        "LOGIN_NAVIGATE_TIMEOUT"
      );

      safeEmit(
        LOGIN_EVENTS.navigationDone,
        {
          target:
            safeRedact(target),
          method:
            "AppCore.navigate",
        }
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      "AppCore.navigate falló.",
      normalizeError(error)
    );
  }

  /*
    No usamos history.replaceState como fallback:
    puede cambiar la URL a "/" pero dejar el login pintado y el botón bloqueado.
    Si el Router no responde, hacemos hard redirect.
  */
  if (hardRedirectTo(target)) {
    safeEmit(
      LOGIN_EVENTS.navigationDone,
      {
        target:
          safeRedact(target),
        method:
          "window.location.assign",
      }
    );

    return true;
  }

  safeEmit(
    LOGIN_EVENTS.navigationError,
    {
      target:
        safeRedact(target),
      reason:
        "navigation-failed",
    }
  );

  return false;
}

/* =========================================================
   AUTH SCREEN MODE
========================================================= */

function enableAuthScreenMode() {
  if (!isBrowser()) {
    return false;
  }

  try {
    document.body?.classList?.add?.(
      ...AUTH_SCREEN_CLASSES
    );

    document.body?.classList?.remove?.(
      ...APP_SCREEN_CLASSES
    );

    document.body?.setAttribute?.(
      "data-auth-screen",
      "true"
    );

    document.body?.setAttribute?.(
      "data-route-mode",
      "auth"
    );

    document.body?.setAttribute?.(
      "data-chrome",
      "hidden"
    );

    document.body?.setAttribute?.(
      "data-shell",
      "visible"
    );
  } catch {}

  try {
    document.documentElement?.classList?.add?.(
      "route-auth",
      "route-shell-hidden",
      "route-chrome-hidden"
    );

    document.documentElement?.classList?.remove?.(
      ...APP_SCREEN_CLASSES
    );

    document.documentElement?.setAttribute?.(
      "data-route-mode",
      "auth"
    );

    document.documentElement?.setAttribute?.(
      "data-chrome",
      "hidden"
    );

    document.documentElement?.setAttribute?.(
      "data-shell",
      "visible"
    );
  } catch {}

  return true;
}

function disableAuthScreenMode({
  force = false,
  reason = "cleanup",
} = {}) {
  if (!isBrowser()) {
    return false;
  }

  if (
    !force &&
    isStillOnLoginRoute()
  ) {
    return false;
  }

  try {
    document.body?.classList?.remove?.(
      ...AUTH_SCREEN_CLASSES
    );

    document.body?.classList?.add?.(
      ...APP_SCREEN_CLASSES
    );

    document.body?.removeAttribute?.(
      "data-auth-screen"
    );

    document.body?.setAttribute?.(
      "data-route-mode",
      "app"
    );

    document.body?.setAttribute?.(
      "data-chrome",
      "visible"
    );
  } catch {}

  try {
    document.documentElement?.classList?.remove?.(
      "route-auth",
      "route-shell-hidden",
      "route-chrome-hidden"
    );

    document.documentElement?.classList?.add?.(
      ...APP_SCREEN_CLASSES
    );

    document.documentElement?.setAttribute?.(
      "data-route-mode",
      "app"
    );

    document.documentElement?.setAttribute?.(
      "data-chrome",
      "visible"
    );
  } catch {}

  safeEmit(
    LOGIN_EVENTS.authScreenCleared,
    {
      reason,
      stillOnLogin:
        isStillOnLoginRoute(),
    }
  );

  return true;
}

/* =========================================================
   EVENTS / CLEANUP
========================================================= */

function bindAppEvent(eventName, handler) {
  if (
    !eventName ||
    !isFunction(handler)
  ) {
    return () => {};
  }

  let disposed =
    false;

  const wrapped =
    (...args) => {
      if (disposed) {
        return;
      }

      try {
        handler(...args);
      } catch (error) {
        safeWarn(
          "event handler error",
          eventName,
          normalizeError(error)
        );
      }
    };

  try {
    if (isFunction(AppCore?.events?.on)) {
      const maybeOff =
        AppCore.events.on(
          eventName,
          wrapped
        );

      if (isFunction(maybeOff)) {
        return () => {
          disposed =
            true;

          try {
            maybeOff();
          } catch {}
        };
      }

      return () => {
        disposed =
          true;

        try {
          AppCore.events.off?.(
            eventName,
            wrapped
          );
        } catch {}
      };
    }
  } catch {}

  try {
    if (
      isBrowser() &&
      isFunction(window.addEventListener)
    ) {
      const listener =
        (event) => wrapped(event);

      window.addEventListener(
        eventName,
        listener,
        false
      );

      return () => {
        disposed =
          true;

        try {
          window.removeEventListener(
            eventName,
            listener,
            false
          );
        } catch {}
      };
    }
  } catch {}

  return () => {
    disposed =
      true;
  };
}

function bindWindowEvent(eventName, handler) {
  if (
    !isBrowser() ||
    !eventName ||
    !isFunction(handler)
  ) {
    return () => {};
  }

  let disposed =
    false;

  const wrapped =
    (event) => {
      if (disposed) {
        return;
      }

      try {
        handler(event);
      } catch {}
    };

  try {
    window.addEventListener(
      eventName,
      wrapped,
      false
    );

    return () => {
      disposed =
        true;

      try {
        window.removeEventListener(
          eventName,
          wrapped,
          false
        );
      } catch {}
    };
  } catch {}

  return () => {
    disposed =
      true;
  };
}

function safeUnbind(unbind) {
  try {
    if (isFunction(unbind)) {
      unbind();
    }
  } catch {}
}

function cleanupPasswordBindings(bindings = []) {
  for (const binding of safeArray(bindings)) {
    try {
      if (isFunction(binding)) {
        binding();
        continue;
      }

      if (isFunction(binding?.destroy)) {
        binding.destroy();
        continue;
      }

      if (isFunction(binding?.unbind)) {
        binding.unbind();
        continue;
      }

      if (isFunction(binding?.off)) {
        binding.off();
      }
    } catch {}
  }
}

function scheduleAuthScreenCleanupAfterNavigation() {
  if (!isBrowser()) {
    return {
      flush:
        () => false,
      cancel:
        () => {},
    };
  }

  let disposed =
    false;

  const offFns =
    [];

  const timerIds =
    [];

  function clearTimers() {
    for (const id of timerIds.splice(0)) {
      try {
        window.clearTimeout(id);
      } catch {}
    }
  }

  function clearEvents() {
    for (const off of offFns.splice(0)) {
      safeUnbind(off);
    }
  }

  function dispose() {
    disposed =
      true;

    clearTimers();
    clearEvents();
  }

  function tryCleanup(reason = "navigation") {
    if (disposed) {
      return false;
    }

    if (isStillOnLoginRoute()) {
      return false;
    }

    disableAuthScreenMode({
      force:
        true,
      reason,
    });

    dispose();

    return true;
  }

  const onRouteSignal =
    (reason) => () => {
      tryCleanup(reason);
    };

  offFns.push(
    bindAppEvent(
      "router:before-render",
      onRouteSignal("router:before-render")
    )
  );

  offFns.push(
    bindAppEvent(
      "router:rendered",
      onRouteSignal("router:rendered")
    )
  );

  offFns.push(
    bindAppEvent(
      "router:navigation:complete",
      onRouteSignal("router:navigation:complete")
    )
  );

  offFns.push(
    bindWindowEvent(
      "popstate",
      onRouteSignal("popstate")
    )
  );

  for (const delay of [
    0,
    80,
    180,
    360,
    720,
    1200,
  ]) {
    try {
      timerIds.push(
        window.setTimeout(
          () => {
            tryCleanup(
              `timer:${delay}`
            );
          },
          delay
        )
      );
    } catch {}
  }

  try {
    timerIds.push(
      window.setTimeout(
        dispose,
        1500
      )
    );
  } catch {}

  return {
    flush:
      tryCleanup,

    cancel:
      dispose,
  };
}

/* =========================================================
   TEMPLATE / PASSWORD FIELD
========================================================= */

function renderTemplateIntoContainer(container, html = "") {
  const markup =
    safeText(html, "");

  if (!isBrowser()) {
    try {
      container.innerHTML =
        markup;
    } catch {}

    return true;
  }

  try {
    const template =
      document.createElement("template");

    template.innerHTML =
      markup;

    container.replaceChildren(
      template.content.cloneNode(true)
    );

    return true;
  } catch {
    try {
      container.innerHTML =
        markup;

      return true;
    } catch {}
  }

  return false;
}

function bindSharedPasswordFields(container = null) {
  try {
    const scope =
      container ||
      (
        isBrowser()
          ? document
          : null
      );

    const bindings =
      bindPasswordFieldsInScope(scope);

    safeLog(
      "password fields bound:",
      Array.isArray(bindings)
        ? bindings.length
        : 0
    );

    return Array.isArray(bindings)
      ? bindings
      : [];
  } catch (error) {
    safeWarn(
      "password-field bind error",
      normalizeError(error)
    );

    return [];
  }
}

/* =========================================================
   UI HELPERS
========================================================= */

function resolveAppName() {
  return (
    safeText(
      AppCore?.config?.appName,
      ""
    ) ||
    "Onion Support"
  );
}

function resolveForgotPasswordHref(deps = {}) {
  return (
    safeText(
      deps?.forgotPasswordHref,
      ""
    ) ||
    AppCore?.config?.routes?.forgotPassword ||
    "/forgot-password"
  );
}

function toggleTheme() {
  if (!isBrowser()) {
    return "dark";
  }

  const current =
    safeText(
      AppCore?.state?.theme ||
        document.documentElement.getAttribute("data-theme") ||
        AppCore?.config?.defaultTheme ||
        "dark",
      "dark"
    ).toLowerCase();

  const next =
    current === "light"
      ? "dark"
      : "light";

  try {
    AppCore?.setTheme?.(next);
  } catch {
    try {
      document.documentElement.setAttribute(
        "data-theme",
        next
      );
    } catch {}
  }

  return next;
}

function safeSetLoginLoading(refs, value = false, labels = {}) {
  try {
    setLoginLoading(
      refs,
      Boolean(value),
      labels
    );

    return true;
  } catch (error) {
    safeWarn(
      "setLoginLoading() falló.",
      normalizeError(error)
    );

    return false;
  }
}

function emitLoginViewReady(deps = {}) {
  safeEmit(
    LOGIN_EVENTS.ready,
    {
      route:
        LOGIN_ROUTE,
      view:
        "login",
      version:
        LOGIN_VIEW_VERSION,
    }
  );

  if (deps.emitLegacyRouteRendered === true) {
    safeEmit(
      "app:route:rendered",
      {
        route:
          LOGIN_ROUTE,
        view:
          "login",
        legacy:
          true,
      }
    );
  }
}

/* =========================================================
   INSTANCE MANAGEMENT
========================================================= */

function destroyPreviousLoginInstance(container) {
  if (!container) {
    return false;
  }

  try {
    const previous =
      container[LOGIN_VIEW_INSTANCE_KEY];

    if (
      previous &&
      isFunction(previous.destroy)
    ) {
      previous.destroy({
        remount:
          true,
        preserveAuthScreen:
          true,
      });

      return true;
    }
  } catch {}

  return false;
}

function storeLoginInstance(container, instance) {
  if (
    !container ||
    !instance
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      container,
      LOGIN_VIEW_INSTANCE_KEY,
      {
        value:
          instance,
        configurable:
          true,
        enumerable:
          false,
        writable:
          true,
      }
    );

    return true;
  } catch {
    try {
      container[LOGIN_VIEW_INSTANCE_KEY] =
        instance;

      return true;
    } catch {}
  }

  return false;
}

function clearLoginInstance(container, instance) {
  try {
    if (
      container &&
      container[LOGIN_VIEW_INSTANCE_KEY] === instance
    ) {
      delete container[LOGIN_VIEW_INSTANCE_KEY];
    }
  } catch {}
}

/* =========================================================
   VIEW
========================================================= */

function renderLoginView(container, deps = {}) {
  if (!container) {
    throw new Error(
      "[LoginView] container es obligatorio."
    );
  }

  destroyPreviousLoginInstance(container);

  let mounted =
    true;

  let isSubmitting =
    false;

  let isLeavingLogin =
    false;

  let loadingToastId =
    null;

  let loadingToastActive =
    false;

  let submitWatchdogTimer =
    null;

  let navigationCleanup =
    null;

  let navigationFailsafeTimer =
    null;

  enableAuthScreenMode();

  const toast =
    resolveToastApi(deps);

  safeToastCall(
    toast,
    "init"
  );

  const rememberedIdentifier =
    loadRememberedIdentifier();

  const appName =
    resolveAppName();

  const forgotPasswordHref =
    resolveForgotPasswordHref(deps);

  renderTemplateIntoContainer(
    container,
    getLoginTemplate({
      appName,
      identifier:
        rememberedIdentifier,
      forgotPasswordHref,
      ...safeObject(deps),
    })
  );

  const passwordBindings =
    bindSharedPasswordFields(container);

  const refs =
    getLoginRefs(container);

  const executorDescriptor =
    resolveLoginExecutor(deps);

  const executorIsAuthLogin =
    isAuthLoginExecutor(
      executorDescriptor,
      deps
    );

  const submitLabel =
    safeText(
      deps.submitLabel,
      ""
    ) ||
    "Entrar al panel";

  const loadingLabel =
    safeText(
      deps.loadingLabel,
      ""
    ) ||
    "Accediendo...";

  function containerStillShowsLogin() {
    try {
      return Boolean(
        container?.isConnected &&
          container.querySelector?.(
            "[data-login-view='true'],.login-view"
          )
      );
    } catch {
      return false;
    }
  }

  function clearNavigationFailsafe() {
    if (!navigationFailsafeTimer) {
      return;
    }

    try {
      clearTimeout(navigationFailsafeTimer);
    } catch {}

    navigationFailsafeTimer =
      null;
  }

  function scheduleNavigationRenderFailsafe(target = DEFAULT_HOME_ROUTE, reason = "post-navigation") {
    clearNavigationFailsafe();

    if (!isBrowser()) {
      return false;
    }

    navigationFailsafeTimer =
      window.setTimeout(() => {
        navigationFailsafeTimer =
          null;

        if (!mounted) {
          return;
        }

        if (
          !isStillOnLoginRoute() &&
          containerStillShowsLogin()
        ) {
          safeEmit(
            LOGIN_EVENTS.navigationFailsafe,
            {
              reason,
              target:
                safeRedact(target),
              stillOnLogin:
                false,
              loginStillMounted:
                true,
            }
          );

          hardRedirectTo(target);
        }
      }, POST_NAVIGATION_RENDER_FAILSAFE_MS);

    return true;
  }

  function setFormSubmittingFlag(value = false) {
    try {
      if (!refs?.form?.dataset) {
        return;
      }

      if (value) {
        refs.form.dataset.loginSubmitting =
          "1";
      } else {
        delete refs.form.dataset.loginSubmitting;
      }
    } catch {}
  }

  function isFormSubmittingFlagged() {
    try {
      return refs?.form?.dataset?.loginSubmitting === "1";
    } catch {
      return false;
    }
  }

  function closeLoadingToast() {
    dismissLoginLoadingToast(
      toast,
      loadingToastId,
      {
        loadingActive:
          loadingToastActive,
      }
    );

    loadingToastId =
      null;

    loadingToastActive =
      false;
  }

  function stopSubmitWatchdog() {
    if (!submitWatchdogTimer) {
      return;
    }

    try {
      clearTimeout(submitWatchdogTimer);
    } catch {}

    submitWatchdogTimer =
      null;
  }

  function resetSubmittingVisualState(reason = "reset") {
    isSubmitting =
      false;

    setFormSubmittingFlag(
      false
    );

    if (mounted) {
      safeSetLoginLoading(
        refs,
        false,
        {
          submitLabel,
          loadingLabel,
        }
      );
    }

    safeEmit(
      LOGIN_EVENTS.submitUnlocked,
      {
        reason,
        stillOnLogin:
          isStillOnLoginRoute(),
      }
    );
  }

  function startSubmitWatchdog(timeoutMs = GLOBAL_LOGIN_SUBMIT_TIMEOUT_MS) {
    stopSubmitWatchdog();

    const watchdogMs =
      Math.max(
        5_000,
        Number(timeoutMs || 0) +
          FORM_UNLOCK_WATCHDOG_EXTRA_MS
      );

    submitWatchdogTimer =
      setTimeout(() => {
        submitWatchdogTimer =
          null;

        closeLoadingToast();
        forceClearGlobalLoginSubmit("view-watchdog");

        if (
          mounted &&
          isStillOnLoginRoute()
        ) {
          isLeavingLogin =
            false;

          resetSubmittingVisualState(
            "watchdog"
          );

          safeToastCall(
            toast,
            "error",
            "Se recuperó el formulario tras un bloqueo del login. Inténtalo de nuevo."
          );
        }
      }, watchdogMs);
  }

  function beginLeavingLogin() {
    isLeavingLogin =
      true;

    if (!navigationCleanup) {
      navigationCleanup =
        scheduleAuthScreenCleanupAfterNavigation();
    }
  }

  function unlockAfterNavigationFailure(reason = "navigation-failed") {
    if (
      mounted &&
      isStillOnLoginRoute()
    ) {
      isLeavingLogin =
        false;

      resetSubmittingVisualState(
        reason
      );
    }
  }

  if (!executorDescriptor) {
    const message =
      "No se encontró un executor de login.";

    setGlobalLoginError(
      refs,
      message
    );

    safeToastCall(
      toast,
      "error",
      message
    );

    emitLoginViewReady(deps);

    const failedInstance = {
      version:
        LOGIN_VIEW_VERSION,

      destroy(destroyOptions = {}) {
        mounted =
          false;

        stopSubmitWatchdog();
        clearNavigationFailsafe();
        closeLoadingToast();

        setFormSubmittingFlag(
          false
        );

        cleanupPasswordBindings(
          passwordBindings
        );

        if (
          destroyOptions.preserveAuthScreen !== true
        ) {
          disableAuthScreenMode({
            force:
              true,
            reason:
              "destroy-no-executor",
          });
        }

        clearLoginInstance(
          container,
          failedInstance
        );
      },

      unlock(reason = "manual") {
        closeLoadingToast();
        forceClearGlobalLoginSubmit(reason);
        resetSubmittingVisualState(reason);
        return true;
      },
    };

    storeLoginInstance(
      container,
      failedInstance
    );

    return failedInstance;
  }

  const onClearErrors =
    () => {
      clearLoginErrors(refs);
    };

  const onThemeToggle =
    () => {
      const next =
        toggleTheme();

      safeToastCall(
        toast,
        "info",
        `Tema ${next} activado.`
      );
    };

  const onSubmit =
    async (event) => {
      try {
        event?.preventDefault?.();
      } catch {}

      clearStaleGlobalLoginSubmit();

      const hasGlobalInFlight =
        hasGlobalLoginSubmitInFlight();

      if (
        isSubmitting ||
        isLeavingLogin ||
        hasGlobalInFlight ||
        isFormSubmittingFlagged()
      ) {
        safeEmit(
          LOGIN_EVENTS.submitBlocked,
          {
            isSubmitting,
            isLeavingLogin,
            hasGlobalInFlight,
            formFlagged:
              isFormSubmittingFlagged(),
            globalFingerprint:
              safeRedact(globalLoginSubmitFingerprint),
          }
        );

        if (
          hasGlobalInFlight &&
          mounted
        ) {
          safeToastCall(
            toast,
            "info",
            "Ya hay un inicio de sesión en curso. Espera unos segundos y vuelve a intentar."
          );
        }

        return;
      }

      clearLoginErrors(refs);

      let formState =
        {};

      try {
        formState =
          readLoginFormState(refs);
      } catch (error) {
        safeError(
          "readLoginFormState() falló.",
          normalizeError(error)
        );

        safeToastCall(
          toast,
          "error",
          "No se pudo leer el formulario."
        );

        return;
      }

      const payload =
        createLoginPayload(formState);

      const errors =
        validateLoginPayload(payload);

      if (Object.keys(errors).length > 0) {
        applyLoginErrors(
          refs,
          errors
        );

        safeToastCall(
          toast,
          "error",
          getFirstLoginError(errors) ||
            "Revisa el formulario."
        );

        return;
      }

      persistRememberedIdentifier(payload);

      const fingerprint =
        buildLoginFingerprint(payload);

      try {
        isSubmitting =
          true;

        setFormSubmittingFlag(
          true
        );

        safeSetLoginLoading(
          refs,
          true,
          {
            submitLabel,
            loadingLabel,
          }
        );

        loadingToastActive =
          true;

        loadingToastId =
          safeToastCall(
            toast,
            "loading",
            "Validando credenciales...",
            {
              persist:
                true,
            }
          );

        const loginOptions =
          buildLoginExecutorOptions(
            deps,
            executorDescriptor
          );

        const submitTimeoutMs =
          loginOptions.timeoutMs ||
          loginOptions.loginTimeoutMs ||
          deps.loginTimeoutMs ||
          GLOBAL_LOGIN_SUBMIT_TIMEOUT_MS;

        startSubmitWatchdog(
          submitTimeoutMs
        );

        safeEmit(
          LOGIN_EVENTS.submitStart,
          {
            fingerprint:
              safeRedact(fingerprint),
            executor:
              executorDescriptor.source,
            executorIsAuthLogin,
            executorOwnsNavigation:
              shouldExecutorOwnNavigation(
                deps,
                executorDescriptor
              ),
            viewWillNavigate:
              shouldNavigateAfterLogin(deps),
          }
        );

        const rawResult =
          await runGlobalLoginSubmit(
            () =>
              callLoginExecutor(
                executorDescriptor,
                payload,
                loginOptions
              ),
            fingerprint,
            {
              timeoutMs:
                submitTimeoutMs,
            }
          );

        const auth =
          normalizeAuthResult(
            rawResult
          );

        closeLoadingToast();

        if (!mounted) {
          return;
        }

        if (isTwoFaResult(auth)) {
          showToastInfo(
            toast,
            auth.message ||
              "Verificación adicional requerida."
          );

          if (shouldNavigateAfterLogin(deps)) {
            beginLeavingLogin();

            const redirectTo =
              safeText(
                resolveLoginRedirect(auth, deps),
                ""
              ) ||
              DEFAULT_2FA_ROUTE;

            const navigated =
              await navigateTo(
                redirectTo,
                {
                  replaceState:
                    true,
                  reason:
                    "login-2fa",
                }
              );

            if (navigated) {
              scheduleNavigationRenderFailsafe(
                redirectTo,
                "login-2fa"
              );
            } else {
              unlockAfterNavigationFailure(
                "2fa-navigation-failed"
              );
            }
          }

          safeEmit(
            LOGIN_EVENTS.submitDone,
            {
              ok:
                true,
              twoFactor:
                true,
            }
          );

          return;
        }

        if (!isAuthenticatedResult(auth)) {
          throw rawResult;
        }

        if (!executorIsAuthLogin) {
          try {
            syncSession(auth);
          } catch (error) {
            safeWarn(
              "syncSession() custom executor falló.",
              normalizeError(error)
            );
          }
        }

        showLoginSuccessToastOnce(
          toast,
          auth.message ||
            "Sesión iniciada correctamente."
        );

        if (shouldNavigateAfterLogin(deps)) {
          beginLeavingLogin();

          if (
            mounted &&
            isStillOnLoginRoute()
          ) {
            const redirectTo =
              resolveFinalLoginRedirect(
                auth,
                deps
              );

            const navigated =
              await navigateTo(
                redirectTo || DEFAULT_HOME_ROUTE,
                {
                  replaceState:
                    true,
                  reason:
                    "login-success",
                }
              );

            if (navigated) {
              scheduleNavigationRenderFailsafe(
                redirectTo || DEFAULT_HOME_ROUTE,
                "login-success"
              );
            } else {
              unlockAfterNavigationFailure(
                "success-navigation-failed"
              );
            }
          }
        }

        safeEmit(
          LOGIN_EVENTS.submitDone,
          {
            ok:
              true,
            authenticated:
              true,
            navigated:
              !isStillOnLoginRoute(),
          }
        );
      } catch (error) {
        closeLoadingToast();

        const normalized =
          normalizeError(error);

        const isSubmitTimeout =
          normalized?.message === "LOGIN_SUBMIT_TIMEOUT" ||
          normalized?.code === "LOGIN_SUBMIT_TIMEOUT";

        const message =
          isSubmitTimeout
            ? "La solicitud tardó demasiado. Revisa tu conexión y vuelve a intentarlo."
            : resolveAuthErrorMessage(error);

        setGlobalLoginError(
          refs,
          message
        );

        safeToastCall(
          toast,
          "error",
          message
        );

        safeEmit(
          LOGIN_EVENTS.error,
          {
            message,
            error:
              normalized,
          }
        );

        safeError(
          "login error",
          normalized
        );
      } finally {
        stopSubmitWatchdog();
        closeLoadingToast();

        const stillOnLogin =
          isStillOnLoginRoute();

        if (
          !isLeavingLogin ||
          stillOnLogin
        ) {
          if (stillOnLogin) {
            isLeavingLogin =
              false;
          }

          resetSubmittingVisualState(
            "finally"
          );
        }
      }
    };

  const unbindInputs =
    bindLoginInputClearers(
      refs,
      onClearErrors
    );

  const unbindTheme =
    bindThemeToggle(
      refs,
      onThemeToggle
    );

  const unbindSubmit =
    bindLoginSubmit(
      refs,
      onSubmit
    );

  focusLoginPrimaryField(
    refs,
    {
      rememberedIdentifier,
    }
  );

  emitLoginViewReady(deps);

  const instance = {
    version:
      LOGIN_VIEW_VERSION,

    destroy(destroyOptions = {}) {
      const wasLeavingLogin =
        isLeavingLogin;

      mounted =
        false;

      stopSubmitWatchdog();
      clearNavigationFailsafe();
      closeLoadingToast();

      setFormSubmittingFlag(
        false
      );

      safeUnbind(unbindInputs);
      safeUnbind(unbindTheme);
      safeUnbind(unbindSubmit);

      cleanupPasswordBindings(
        passwordBindings
      );

      if (wasLeavingLogin) {
        try {
          navigationCleanup?.flush?.(
            "destroy-after-leaving"
          );
        } catch {}
      } else {
        try {
          navigationCleanup?.cancel?.();
        } catch {}
      }

      navigationCleanup =
        null;

      if (
        destroyOptions.preserveAuthScreen === true ||
        destroyOptions.remount === true
      ) {
        clearLoginInstance(
          container,
          instance
        );

        safeEmit(
          LOGIN_EVENTS.destroyed,
          {
            preserveAuthScreen:
              true,
            remount:
              destroyOptions.remount === true,
          }
        );

        return;
      }

      if (wasLeavingLogin) {
        disableAuthScreenMode({
          force:
            !isStillOnLoginRoute(),
          reason:
            "destroy-leaving-login",
        });
      } else {
        disableAuthScreenMode({
          force:
            true,
          reason:
            "destroy-login-view",
        });
      }

      clearLoginInstance(
        container,
        instance
      );

      safeEmit(
        LOGIN_EVENTS.destroyed,
        {
          preserveAuthScreen:
            false,
          wasLeavingLogin,
        }
      );
    },

    unlock(reason = "manual") {
      closeLoadingToast();
      stopSubmitWatchdog();
      clearNavigationFailsafe();
      forceClearGlobalLoginSubmit(reason);
      resetSubmittingVisualState(reason);
      return true;
    },

    getSnapshot() {
      return {
        version:
          LOGIN_VIEW_VERSION,

        source:
          LOGIN_SOURCE,

        scope:
          LOGIN_SCOPE,

        mounted:
          Boolean(mounted),

        isSubmitting:
          Boolean(isSubmitting),

        isLeavingLogin:
          Boolean(isLeavingLogin),

        loadingToastActive:
          Boolean(loadingToastActive),

        hasLoadingToastId:
          Boolean(loadingToastId),

        hasSubmitWatchdog:
          Boolean(submitWatchdogTimer),

        hasNavigationFailsafe:
          Boolean(navigationFailsafeTimer),

        hasGlobalSubmit:
          hasGlobalLoginSubmitInFlight(),

        globalFingerprint:
          safeRedact(globalLoginSubmitFingerprint),

        globalStartedAt:
          globalLoginSubmitStartedAt,

        globalStartedAtIso:
          globalLoginSubmitStartedAt
            ? safeIsoNow(globalLoginSubmitStartedAt)
            : "",

        executor:
          executorDescriptor?.source || "",

        executorIsAuthLogin:
          Boolean(executorIsAuthLogin),

        executorOwnsNavigation:
          shouldExecutorOwnNavigation(
            deps,
            executorDescriptor
          ),

        currentPath:
          getBrowserPath(),

        stillOnLogin:
          isStillOnLoginRoute(),

        containerConnected:
          Boolean(container?.isConnected),

        loginStillRendered:
          containerStillShowsLogin(),

        stateAuthenticated:
          Boolean(AppCore?.state?.authenticated),

        hasStateUser:
          hasUsableUser(getStateUser()),

        hasStateToken:
          Boolean(getStateToken()),

        at:
          safeIsoNow(),
      };
    },
  };

  storeLoginInstance(
    container,
    instance
  );

  try {
    if (isBrowser()) {
      window[LOGIN_VIEW_RUNTIME_KEY] =
        instance;
    }
  } catch {}

  safeEmit(
    LOGIN_EVENTS.debugReady,
    {
      installed:
        true,
    }
  );

  return instance;
}

/* =========================================================
   EXPORTS
========================================================= */

function initLoginView(container, deps = {}) {
  return renderLoginView(
    container,
    deps
  );
}

function mountLoginView(container, deps = {}) {
  return renderLoginView(
    container,
    deps
  );
}

export {
  renderLoginView as LoginView,
  renderLoginView as render,
  initLoginView as init,
  mountLoginView as mount,
};

export default renderLoginView;
