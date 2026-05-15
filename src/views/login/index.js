/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/login/index.js

   LOGIN VIEW ORCHESTRATOR · FINAL EXTREME PRO SYSTEM · 15/10

   RESPONSABILIDADES:
   - orquestar la vista de login
   - renderizar template auth pro sin CSS inline
   - conectar DOM, Auth, AppCore, Toast y password-field shared
   - delegar sesión principal en Auth.login
   - evitar doble navegación post-login
   - evitar doble sync de sesión post-login
   - evitar doble submit aunque la vista se monte dos veces
   - evitar doble toast de éxito
   - evitar toast loading huérfano si Router desmonta login durante Auth.login
   - reducir parpadeos al salir de /login
   - activar / limpiar modo auth-screen del body/html
   - mantener cleanup de listeners
   - exponer compatibilidad default + named export
   - soportar login con usuario, email o teléfono
   - conectar password-field compartido para eye / caps lock

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
  "15.0.0-final-extreme";

const LOGIN_SOURCE =
  "login.view";

const LOGIN_ROUTE =
  "/login";

const DEFAULT_HOME_ROUTE =
  "/";

const DEFAULT_2FA_ROUTE =
  "/2fa";

const LOGIN_SUCCESS_TOAST_DEDUPE_MS =
  1600;

const GLOBAL_LOGIN_SUBMIT_TIMEOUT_MS =
  45_000;

const GLOBAL_LOGIN_SUBMIT_STALE_GRACE_MS =
  2_500;

const LOGIN_VIEW_INSTANCE_KEY =
  "__ONION_LOGIN_VIEW_INSTANCE__";

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

  const now =
    safeNow();

  const maxAge =
    Math.max(
      1_000,
      Number(timeoutMs || 0) +
        GLOBAL_LOGIN_SUBMIT_STALE_GRACE_MS
    );

  if (now - startedAt > maxAge) {
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

  const workPromise =
    Promise.resolve()
      .then(() => executor());

  const promise =
    timeoutMs > 0
      ? Promise.race([
          workPromise,
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error("LOGIN_SUBMIT_TIMEOUT"));
            }, timeoutMs);
          }),
        ])
      : workPromise;

  globalLoginSubmitPromise =
    promise;

  globalLoginSubmitFingerprint =
    safeText(
      fingerprint,
      ""
    );

  globalLoginSubmitStartedAt =
    safeNow();

  const clear = () => {
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

function safeIsoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeRedact(value = "") {
  try {
    return AppCore?.utils?.redactTokenInText?.(value) ||
      value;
  } catch {
    return safeText(value, "");
  }
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
    at:
      safeIsoNow(),
  };

  try {
    AppCore?.events?.emit?.(
      name,
      cleanPayload
    );

    return true;
  } catch {}

  return false;
}

/* =========================================================
   TOAST HELPERS
========================================================= */

function resolveToastApi(deps = {}) {
  const customToast =
    deps.toast;

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

  /*
    Sólo hacemos dismiss global si sabemos que había loading activo
    y el sistema Toast no dio ID estable. Así no matamos el toast success
    en destroy post-login.
  */
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

function resolveLoginExecutor(deps = {}) {
  const moduleAuth =
    (() => {
      try {
        return AppCore?.modules?.get?.("Auth") ||
          AppCore?.modules?.get?.("auth") ||
          null;
      } catch {
        return null;
      }
    })();

  const candidates = [
    deps.onSubmit,
    deps.submitLogin,
    deps.login,
    Auth?.login,
    moduleAuth?.login,
    AppCore?.services?.auth?.login,
    AppCore?.auth?.login,
  ];

  for (const candidate of candidates) {
    if (isFunction(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isAuthLoginExecutor(executor, deps = {}) {
  if (
    deps.delegateNavigationToAuth === false ||
    deps.authLoginOwnsNavigation === false
  ) {
    return false;
  }

  if (
    isFunction(executor) &&
    isFunction(Auth?.login) &&
    executor === Auth.login
  ) {
    return true;
  }

  return Boolean(
    !deps.onSubmit &&
      !deps.submitLogin &&
      !deps.login &&
      isFunction(Auth?.login) &&
      executor === Auth.login
  );
}

function shouldNavigateAfterLogin(deps = {}) {
  return !(
    deps.navigate === false ||
    deps.skipNavigate === true ||
    deps.manualNavigate === true
  );
}

function buildLoginExecutorOptions(deps = {}) {
  const navigate =
    shouldNavigateAfterLogin(deps);

  return {
    navigate,

    redirectTo:
      deps.redirectTo,

    redirect:
      deps.redirect,

    target:
      deps.target,

    manualNavigate:
      deps.manualNavigate,

    skipNavigate:
      deps.skipNavigate,

    source:
      LOGIN_SOURCE,

    emitLoginSuccessEvent:
      deps.emitLoginSuccessEvent === true,

    useLoader:
      deps.useLoader !== false,
  };
}

function isAuthenticatedResult(auth = {}) {
  if (
    !auth ||
    auth.ok === false ||
    auth.requires2FA === true
  ) {
    return false;
  }

  const token =
    safeText(
      auth.token ||
        auth.accessToken ||
        auth.access_token ||
        "",
      ""
    );

  const user =
    auth.user ||
    auth.usuario ||
    auth.me ||
    auth.account ||
    auth.profile ||
    null;

  if (
    auth.status === "authenticated" ||
    auth.authenticated === true
  ) {
    return true;
  }

  /*
    No auth fantasma:
    success:true sin token+user no basta.
  */
  return Boolean(
    auth.success === true &&
      token &&
      user
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
      .replace(/\/+$/g, "") || "/"
  );
}

function stripSearchAndHash(path = "/") {
  return normalizePath(path)
    .split("?")[0]
    .split("#")[0] || "/";
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

function sanitizeNavigationPath(path = "/", fallback = DEFAULT_HOME_ROUTE) {
  const candidate =
    normalizePath(
      safeText(path, fallback) ||
        fallback
    );

  if (!isSafeInternalPath(candidate)) {
    return fallback;
  }

  return candidate;
}

function isLoginRoute(path = "") {
  const clean =
    stripSearchAndHash(path);

  return (
    clean === LOGIN_ROUTE ||
    clean.startsWith(`${LOGIN_ROUTE}/`)
  );
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

async function navigateTo(path = "/", options = {}) {
  const target =
    sanitizeNavigationPath(
      path,
      DEFAULT_HOME_ROUTE
    );

  const replaceState =
    options.replaceState !== false;

  const routerOptions = {
    replaceState,
    force:
      options.force === true,
    source:
      LOGIN_SOURCE,
    reason:
      options.reason || "login-view-navigation",
  };

  safeEmit(
    "auth:login:view:navigation:start",
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
      if (isFunction(router.navigate)) {
        await router.navigate(
          target,
          routerOptions
        );

        return true;
      }

      if (isFunction(router.go)) {
        await router.go(
          target,
          routerOptions
        );

        return true;
      }

      if (isFunction(router.push)) {
        await router.push(
          target,
          routerOptions
        );

        return true;
      }

      if (isFunction(router.render)) {
        await router.render(
          target,
          {
            ...routerOptions,
            publicPath:
              target,
            requestedPath:
              target,
          }
        );

        return true;
      }
    } catch (error) {
      safeWarn(
        "Router navigation falló.",
        error
      );
    }
  }

  try {
    if (isFunction(AppCore?.navigate)) {
      await AppCore.navigate(target);
      return true;
    }
  } catch {}

  try {
    if (
      isBrowser() &&
      window.history &&
      isFunction(window.history.replaceState)
    ) {
      window.history.replaceState(
        {
          path:
            target,
          publicPath:
            target,
          source:
            LOGIN_SOURCE,
        },
        "",
        target
      );

      try {
        window.dispatchEvent(
          new PopStateEvent("popstate")
        );
      } catch {
        try {
          window.dispatchEvent(
            new Event("popstate")
          );
        } catch {}
      }

      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.location.assign(target);
      return true;
    }
  } catch {}

  safeEmit(
    "auth:login:view:navigation:error",
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

  /*
    Regla crítica:
    no limpiamos auth-screen si seguimos realmente en /login,
    salvo force explícito.
  */
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
  } catch {}

  safeEmit(
    "auth:login:view:auth-screen-cleared",
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
          error
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
    bindAppEvent(
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

  /*
    Freno anti fuga: si tras 1.5s seguimos en /login,
    no se limpia auth-screen, pero sí se liberan listeners.
  */
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
      error
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

function emitLoginViewReady(deps = {}) {
  safeEmit(
    "auth:login:view:ready",
    {
      route:
        LOGIN_ROUTE,
      view:
        "login",
      version:
        LOGIN_VIEW_VERSION,
    }
  );

  /*
    Legacy opt-in. Router ya emite sus eventos finales.
  */
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

  /*
    El template usa src/shared/password-field.
    El binding correcto del ojo/CapsLock debe ser el shared.
    No se usa un toggle local paralelo para evitar doble listener.
  */
  const passwordBindings =
    bindSharedPasswordFields(container);

  const refs =
    getLoginRefs(container);

  const executeLogin =
    resolveLoginExecutor(deps);

  const executorIsAuthLogin =
    isAuthLoginExecutor(
      executeLogin,
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

  function startSubmitWatchdog(timeoutMs = GLOBAL_LOGIN_SUBMIT_TIMEOUT_MS) {
    stopSubmitWatchdog();

    const watchdogMs =
      Math.max(
        5_000,
        Number(timeoutMs || 0) +
          GLOBAL_LOGIN_SUBMIT_STALE_GRACE_MS
      );

    submitWatchdogTimer =
      setTimeout(() => {
        submitWatchdogTimer =
          null;

        if (!mounted || !isStillOnLoginRoute()) {
          return;
        }

        isLeavingLogin =
          false;

        closeLoadingToast();
        forceClearGlobalLoginSubmit("view-watchdog");
        resetSubmittingVisualState();

        safeToastCall(
          toast,
          "error",
          "Se recuperó el formulario tras un bloqueo del login. Inténtalo de nuevo."
        );
      }, watchdogMs);
  }

  function resetSubmittingVisualState() {
    isSubmitting =
      false;

    setFormSubmittingFlag(
      false
    );

    if (mounted) {
      setLoginLoading(
        refs,
        false,
        {
          submitLabel,
          loadingLabel,
        }
      );
    }
  }

  function beginLeavingLogin() {
    isLeavingLogin =
      true;

    if (!navigationCleanup) {
      navigationCleanup =
        scheduleAuthScreenCleanupAfterNavigation();
    }
  }

  if (!executeLogin) {
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
      destroy(destroyOptions = {}) {
        mounted =
          false;

        stopSubmitWatchdog();
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
        if (hasGlobalInFlight && mounted) {
          safeToastCall(
            toast,
            "info",
            "Ya hay un inicio de sesión en curso. Espera unos segundos y vuelve a intentar."
          );
        }

        return;
      }

      clearLoginErrors(refs);

      const formState =
        readLoginFormState(refs);

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

        setLoginLoading(
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
          buildLoginExecutorOptions(deps);

        startSubmitWatchdog(
          loginOptions.timeoutMs ||
            loginOptions.loginTimeoutMs ||
            GLOBAL_LOGIN_SUBMIT_TIMEOUT_MS
        );

        /*
          Firebreak global:
          aunque el submit esté bindeado dos veces,
          sólo una llamada real a Auth.login puede estar activa.
        */
        const rawResult =
          await runGlobalLoginSubmit(
            () =>
              executeLogin(
                payload,
                loginOptions
              ),
            fingerprint,
            {
              timeoutMs:
                loginOptions.timeoutMs ||
                loginOptions.loginTimeoutMs ||
                GLOBAL_LOGIN_SUBMIT_TIMEOUT_MS,
            }
          );

        const auth =
          normalizeAuthResult(
            rawResult
          );

        /*
          Crítico:
          cerrar loading ANTES del guard mounted.
          Si Router ya desmontó login, igualmente hay que matar el toast.
        */
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

            await Promise.resolve();

            if (
              mounted &&
              isStillOnLoginRoute()
            ) {
              const redirectTo =
                resolveLoginRedirect(
                  auth,
                  deps
                );

              await navigateTo(
                redirectTo || DEFAULT_2FA_ROUTE,
                {
                  replaceState:
                    true,
                  reason:
                    "login-2fa",
                }
              );
            }
          }

          return;
        }

        if (!isAuthenticatedResult(auth)) {
          throw rawResult;
        }

        /*
          Sólo para executors custom.
          Auth.login estándar ya hizo applySession().
        */
        if (!executorIsAuthLogin) {
          syncSession(auth);
        }

        showLoginSuccessToastOnce(
          toast,
          auth.message ||
            "Sesión iniciada correctamente."
        );

        if (shouldNavigateAfterLogin(deps)) {
          beginLeavingLogin();

          await Promise.resolve();

          if (
            mounted &&
            isStillOnLoginRoute()
          ) {
            const redirectTo =
              resolveLoginRedirect(
                auth,
                deps
              );

            await navigateTo(
              redirectTo || DEFAULT_HOME_ROUTE,
              {
                replaceState:
                  true,
                reason:
                  "login-success",
              }
            );
          }
        }
      } catch (error) {
        closeLoadingToast();

        const isSubmitTimeout =
          safeText(error?.message, "") ===
          "LOGIN_SUBMIT_TIMEOUT";

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
          "auth:login:view:error",
          {
            message,
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
          }
        );

        safeError(
          "login error",
          error
        );
      } finally {
        stopSubmitWatchdog();
        closeLoadingToast();

        /*
          Si se inició salida de /login, no reactivamos el botón para evitar
          parpadeo visual durante transición.

          Pero si la navegación falla y seguimos en /login,
          debemos restaurar el estado del formulario para evitar
          un bloqueo visual (submit deshabilitado infinito).
        */
        const stillOnLogin =
          isStillOnLoginRoute();

        if (!isLeavingLogin || stillOnLogin) {
          if (stillOnLogin) {
            isLeavingLogin =
              false;
          }

          resetSubmittingVisualState();
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

      /*
        Si no estamos saliendo por navegación real, cancelamos el watcher.
        Si sí estamos saliendo, dejamos que haga flush si la URL ya no es /login.
      */
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
    },
  };

  storeLoginInstance(
    container,
    instance
  );

  return instance;
}

/* =========================================================
   EXPORTS
========================================================= */

export {
  renderLoginView as LoginView,
};

export default renderLoginView;
