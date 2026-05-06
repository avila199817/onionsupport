/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/loginView.js

   AUTH VIEW · FINAL PRO SYSTEM · CSP CLEAN · HARDENED 10/10

   RESPONSABILIDADES:
   - pintar pantalla de acceso
   - activar modo fullscreen auth
   - validar credenciales en cliente
   - enviar login a Auth
   - mostrar feedback visual local mediante toast inline si existe
   - soportar login con username o email
   - soportar flujo opcional 2FA
   - redirigir correctamente tras login
   - evitar delays artificiales tras login correcto
   - evitar pérdida de valores al deshabilitar inputs
   - renderizar usando src/views/login/login.template.js
   - integrar password-field compartido
   - forzar apagado del loader al renderizar login
   - evitar doble navegación post-login
   - no redirigir por defecto a /usuarios
   - no redirigir por defecto a /@slug
   - default post-login: /

   HARDENING:
   - guards de browser
   - timers centralizados
   - navegación segura post-login
   - sync de sesión estable e idempotente
   - cleanup completo de la vista
   - no aceptar login correcto sin token + usuario
   - no reutilizar AppCore.state.user como fallback tras login
   - limpiar sesión vieja si Auth.login falla o devuelve payload inválido
   - impedir dashboard/avatar cacheado después de un 401
   - cortar navegación si el resultado de login no es una sesión válida

   IMPORTANTE:
   - Sin CSS inyectado.
   - Sin animación JS de logo.
   - El logo por tema lo controla /src/css/auth/login.css.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";

import { getLoginTemplate } from "./login/login.template.js";

import {
  getLoginRefs,
  clearLoginErrors,
  applyLoginErrors,
  setGlobalLoginError,
  setLoginLoading,
  focusLoginPrimaryField,
  readLoginFormState,
  bindLoginSubmit,
  bindLoginInputClearers,
} from "./login/login.dom.js";

import {
  normalizeAuthResult,
  syncSession,
  persistRememberedIdentifier,
} from "./login/login.helpers.js";

export const LoginView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:login";

  const LOGIN_ROUTE_PREFIX = "/login";
  const DEFAULT_POST_LOGIN_PATH = "/";
  const DEFAULT_2FA_PATH = "/2fa";

  const TOAST_DEFAULT_DURATION = 3600;
  const TOAST_MIN_DURATION = 1200;
  const ERROR_TOAST_DURATION = 4200;
  const TWO_FA_TOAST_DURATION = 250;

  const LOGIN_LOADING_TOAST_TITLE = "Validando acceso";
  const LOGIN_LOADING_TOAST_MESSAGE =
    "Comprobando credenciales y preparando tu sesión...";

  /* =========================================================
     RUNTIME
  ========================================================= */

  let redirectTimerId = null;
  let toastTimerId = null;

  let isNavigatingAway = false;
  let isSubmitting = false;

  /* =========================================================
     BASICS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
  }

  function isPlainObject(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function pickFirstText(...values) {
    for (const value of values) {
      const text = safeText(value, "");

      if (text) {
        return text;
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

  function normalizeIdentifier(value = "") {
    return safeText(value, "");
  }

  function isEmail(value = "") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      String(value || "").trim()
    );
  }

  function isTruthyFlag(value) {
    if (value === true || value === 1) {
      return true;
    }

    const text = safeText(value, "").toLowerCase();

    return [
      "true",
      "1",
      "yes",
      "y",
      "si",
      "sí",
      "required",
      "enabled",
      "on",
    ].includes(text);
  }

  function normalizePath(path = DEFAULT_POST_LOGIN_PATH) {
    const raw =
      safeText(path, DEFAULT_POST_LOGIN_PATH) ||
      DEFAULT_POST_LOGIN_PATH;

    try {
      if (typeof AppCore?.utils?.normalizePath === "function") {
        const normalized = AppCore.utils.normalizePath(raw);

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
        .replace(/\/{2,}/g, "/")
        .replace(/\/+$/, "") || "/"
    );
  }

  function getCleanPath(path = "/") {
    return (
      normalizePath(path)
        .split("?")[0]
        .split("#")[0] || "/"
    );
  }

  function isLoginPath(path = "") {
    const clean = getCleanPath(path);

    return (
      clean === LOGIN_ROUTE_PREFIX ||
      clean.startsWith(`${LOGIN_ROUTE_PREFIX}/`)
    );
  }

  function getCurrentBrowserPath() {
    if (!isBrowser()) {
      return "/";
    }

    try {
      return normalizePath(
        `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
      );
    } catch {
      return "/";
    }
  }

  function isStillOnLoginRoute() {
    return isLoginPath(getCurrentBrowserPath());
  }

  function safeErrorLog(...args) {
    try {
      AppCore?.utils?.error?.("[LoginView]", ...args);
    } catch {}

    try {
      console.error("[LoginView]", ...args);
    } catch {}
  }

  function safeWarnLog(...args) {
    try {
      AppCore?.utils?.warn?.("[LoginView]", ...args);
    } catch {}

    try {
      console.warn("[LoginView]", ...args);
    } catch {}
  }

  function safeEmit(eventName = "", payload = {}) {
    const name = safeText(eventName, "");

    if (!name) {
      return false;
    }

    let emitted = false;

    try {
      AppCore?.events?.emit?.(name, payload);
      emitted = true;
    } catch {}

    try {
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(name, {
            detail: payload,
          })
        );

        emitted = true;
      }
    } catch {}

    return emitted;
  }

  /* =========================================================
     TIMERS
  ========================================================= */

  function clearRedirectTimer() {
    if (!redirectTimerId || !isBrowser()) {
      return;
    }

    window.clearTimeout(redirectTimerId);
    redirectTimerId = null;
  }

  function clearToastTimer() {
    if (!toastTimerId || !isBrowser()) {
      return;
    }

    window.clearTimeout(toastTimerId);
    toastTimerId = null;
  }

  /* =========================================================
     DOM HELPERS
  ========================================================= */

  function getContainer() {
    if (!isBrowser()) {
      return null;
    }

    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      document.querySelector("#view-container")
    );
  }

  function getShellElements() {
    if (!isBrowser()) {
      return {
        sidebar: null,
        sidebarMount: null,
        topbar: null,
        topbarMount: null,
        topbarViewContainer: null,
        tableheadContainer: null,
      };
    }

    return {
      sidebar:
        AppCore?.dom?.sidebar ||
        document.getElementById("sidebar") ||
        document.querySelector(".sidebar"),

      sidebarMount:
        document.getElementById("sidebar-mount"),

      topbar:
        AppCore?.dom?.topbar ||
        document.getElementById("topbar") ||
        document.querySelector(".topbar"),

      topbarMount:
        document.getElementById("topbar-mount"),

      topbarViewContainer:
        AppCore?.dom?.topbarViewContainer ||
        document.getElementById("topbarview-container") ||
        document.getElementById("topbar-view-container"),

      tableheadContainer:
        AppCore?.dom?.tableheadContainer ||
        document.getElementById("tablehead-container") ||
        document.querySelector(".table-head"),
    };
  }

  function getToastElements() {
    if (!isBrowser()) {
      return {
        toastRoot: null,
        toastIcon: null,
        toastTitle: null,
        toastText: null,
        toastClose: null,
        toastProgress: null,
      };
    }

    return {
      toastRoot: document.getElementById("loginToast"),
      toastIcon: document.getElementById("loginToastIcon"),
      toastTitle: document.getElementById("loginToastTitle"),
      toastText: document.getElementById("loginToastText"),
      toastClose: document.getElementById("loginToastClose"),
      toastProgress: document.getElementById("loginToastProgress"),
    };
  }

  /* =========================================================
     ROUTING / REDIRECT
  ========================================================= */

  function getCurrentRedirectPath() {
    if (!isBrowser()) {
      return "";
    }

    try {
      const url = new URL(window.location.href);
      const redirect = safeText(url.searchParams.get("redirect"), "");

      return redirect ? normalizePath(redirect) : "";
    } catch {
      return "";
    }
  }

  function isUnsafeRedirect(path = "") {
    const value = safeText(path, "");

    if (!value) return true;
    if (!value.startsWith("/")) return true;
    if (value.startsWith("//")) return true;
    if (/^(javascript:|data:|vbscript:)/i.test(value)) return true;
    if (isLoginPath(value)) return true;

    return false;
  }

  function getSafeRedirectPath() {
    const redirectPath = getCurrentRedirectPath();

    if (!redirectPath || isUnsafeRedirect(redirectPath)) {
      return DEFAULT_POST_LOGIN_PATH;
    }

    return normalizePath(redirectPath);
  }

  function resolvePostLoginPath(payload = {}) {
    const forcedRedirect =
      safeText(payload?.redirect, "") ||
      getSafeRedirectPath();

    if (
      forcedRedirect &&
      !isUnsafeRedirect(forcedRedirect) &&
      forcedRedirect !== DEFAULT_POST_LOGIN_PATH
    ) {
      return normalizePath(forcedRedirect);
    }

    return DEFAULT_POST_LOGIN_PATH;
  }

  function navigateTo(path = DEFAULT_POST_LOGIN_PATH) {
    if (!isBrowser()) {
      return;
    }

    const target = normalizePath(path || DEFAULT_POST_LOGIN_PATH);

    setAuthScreen(false);
    hideToast();
    forceHideGlobalLoader();

    /*
      No usamos Router.goAfterLogin().
      Ese helper puede volver a resolver redirect/fallback y provocar
      doble navegación o destinos no deseados como /usuarios o /@slug.
    */
    if (typeof Router?.navigate === "function") {
      Router.navigate(target, {
        replaceState: true,
        force: true,
      });

      return;
    }

    if (typeof AppCore?.navigate === "function") {
      AppCore.navigate(target);
      return;
    }

    window.location.assign(target);
  }

  function navigateSoon(path, delay = 0) {
    if (!isBrowser()) {
      return;
    }

    clearRedirectTimer();

    const safeDelay = Math.max(0, Number(delay) || 0);

    if (safeDelay <= 0) {
      navigateTo(path);
      return;
    }

    redirectTimerId = window.setTimeout(() => {
      navigateTo(path);
    }, safeDelay);
  }

  function navigateBackToLoginAfterFailedLogin() {
    if (!isBrowser()) {
      return;
    }

    if (isStillOnLoginRoute()) {
      return;
    }

    setAuthScreen(true);
    hideToast();
    forceHideGlobalLoader();

    if (typeof Router?.navigate === "function") {
      Router.navigate(LOGIN_ROUTE_PREFIX, {
        replaceState: true,
        force: true,
      });

      return;
    }

    try {
      window.history.replaceState(
        window.history.state || {},
        "",
        LOGIN_ROUTE_PREFIX
      );
    } catch {}

    window.location.assign(LOGIN_ROUTE_PREFIX);
  }

  /* =========================================================
     GLOBAL LOADER / SHELL
  ========================================================= */

  function forceHideGlobalLoader() {
    if (!isBrowser()) {
      return;
    }

    const loader =
      AppCore?.dom?.loader ||
      document.getElementById("app-loader");

    try {
      if (typeof AppCore?.setLoading === "function") {
        AppCore.setLoading(false);
      }
    } catch {}

    try {
      document.body?.classList?.remove?.("loading");
    } catch {}

    if (!loader) {
      return;
    }

    try {
      loader.hidden = true;
      loader.setAttribute("aria-hidden", "true");
      loader.style.display = "none";
      loader.style.opacity = "0";
      loader.style.visibility = "hidden";
      loader.style.pointerEvents = "none";
    } catch {}
  }

  function restoreGlobalLoaderStyles() {
    if (!isBrowser()) {
      return;
    }

    const loader =
      AppCore?.dom?.loader ||
      document.getElementById("app-loader");

    if (!loader) {
      return;
    }

    try {
      loader.hidden = false;
      loader.setAttribute("aria-hidden", "true");
      loader.style.display = "";
      loader.style.opacity = "";
      loader.style.visibility = "";
      loader.style.pointerEvents = "";
    } catch {}
  }

  function setAuthScreen(active) {
    if (!isBrowser() || !document?.body) {
      return;
    }

    const enabled = Boolean(active);

    const {
      sidebar,
      sidebarMount,
      topbar,
      topbarMount,
      topbarViewContainer,
      tableheadContainer,
    } = getShellElements();

    try {
      document.body.classList.toggle("auth-screen", enabled);
      document.body.classList.toggle("route-auth", enabled);
      document.body.classList.toggle("route-shell-hidden", enabled);
      document.body.classList.toggle("login-no-scroll", enabled);
    } catch {}

    try {
      if (enabled) {
        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
      } else {
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
      }
    } catch {}

    [
      sidebar,
      sidebarMount,
      topbar,
      topbarMount,
      topbarViewContainer,
      tableheadContainer,
    ].forEach((element) => {
      try {
        if (element) {
          element.hidden = enabled;
          element.setAttribute("aria-hidden", String(enabled));
        }
      } catch {}
    });
  }

  /* =========================================================
     VIEW CLEANUP
  ========================================================= */

  function destroyViewState({
    preserveToast = false,
  } = {}) {
    clearRedirectTimer();
    clearToastTimer();

    if (!preserveToast) {
      hideToast();
    }

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  /* =========================================================
     AUTH HARDENING
  ========================================================= */

  function hasUsableUser(user = {}) {
    if (!user || typeof user !== "object") {
      return false;
    }

    return Boolean(
      safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user._id, "") ||
      safeText(user.username, "") ||
      safeText(user.email, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "")
    );
  }

  function hasUsableToken(token = "") {
    return Boolean(safeText(token, ""));
  }

  function extractDirectAuthPayload(payload = {}) {
    const root = isPlainObject(payload) ? payload : {};
    const data = isPlainObject(root.data) ? root.data : {};

    const response =
      isPlainObject(root.response)
        ? root.response
        : {};

    const responseData =
      isPlainObject(response.data)
        ? response.data
        : {};

    const auth =
      pickFirstObject(
        root.auth,
        root.session,
        data.auth,
        data.session,
        responseData.auth,
        responseData.session
      ) || {};

    const nestedData =
      isPlainObject(auth.data)
        ? auth.data
        : {};

    const token =
      pickFirstText(
        root.token,
        root.accessToken,
        root.access_token,
        root.jwt,
        root.idToken,
        root.id_token,

        data.token,
        data.accessToken,
        data.access_token,
        data.jwt,
        data.idToken,
        data.id_token,

        responseData.token,
        responseData.accessToken,
        responseData.access_token,
        responseData.jwt,
        responseData.idToken,
        responseData.id_token,

        auth.token,
        auth.accessToken,
        auth.access_token,
        auth.jwt,
        auth.idToken,
        auth.id_token,

        nestedData.token,
        nestedData.accessToken,
        nestedData.access_token,
        nestedData.jwt
      );

    const refreshToken =
      pickFirstText(
        root.refreshToken,
        root.refresh_token,
        data.refreshToken,
        data.refresh_token,
        responseData.refreshToken,
        responseData.refresh_token,
        auth.refreshToken,
        auth.refresh_token,
        nestedData.refreshToken,
        nestedData.refresh_token
      );

    const tempToken =
      pickFirstText(
        root.tempToken,
        root.temp_token,
        root.twoFactorToken,
        root.two_factor_token,
        data.tempToken,
        data.temp_token,
        data.twoFactorToken,
        data.two_factor_token,
        responseData.tempToken,
        responseData.temp_token,
        responseData.twoFactorToken,
        responseData.two_factor_token,
        auth.tempToken,
        auth.temp_token,
        auth.twoFactorToken,
        auth.two_factor_token
      );

    const user =
      pickFirstObject(
        root.user,
        root.usuario,
        root.account,
        root.profile,

        data.user,
        data.usuario,
        data.account,
        data.profile,

        responseData.user,
        responseData.usuario,
        responseData.account,
        responseData.profile,

        auth.user,
        auth.usuario,
        auth.account,
        auth.profile,

        nestedData.user,
        nestedData.usuario,
        nestedData.account,
        nestedData.profile
      );

    const redirectTo =
      pickFirstText(
        root.redirectTo,
        root.redirect_to,
        root.redirect,
        data.redirectTo,
        data.redirect_to,
        data.redirect,
        responseData.redirectTo,
        responseData.redirect_to,
        responseData.redirect,
        auth.redirectTo,
        auth.redirect_to,
        auth.redirect
      );

    const requires2FA = [
      root.requires2FA,
      root.requiresTwoFactor,
      root.twoFactorRequired,
      root.require2FA,
      root.mfaRequired,
      root.requiresMfa,

      data.requires2FA,
      data.requiresTwoFactor,
      data.twoFactorRequired,
      data.require2FA,
      data.mfaRequired,
      data.requiresMfa,

      responseData.requires2FA,
      responseData.requiresTwoFactor,
      responseData.twoFactorRequired,
      responseData.require2FA,
      responseData.mfaRequired,
      responseData.requiresMfa,

      auth.requires2FA,
      auth.requiresTwoFactor,
      auth.twoFactorRequired,
      auth.require2FA,
      auth.mfaRequired,
      auth.requiresMfa,
    ].some(isTruthyFlag);

    return {
      token,
      refreshToken,
      tempToken,
      user,
      redirectTo,
      requires2FA,
    };
  }

  function isExplicitAuthFailure(payload = {}) {
    const root = isPlainObject(payload) ? payload : {};
    const data = isPlainObject(root.data) ? root.data : {};
    const response = isPlainObject(root.response) ? root.response : {};
    const responseData = isPlainObject(response.data) ? response.data : {};

    const status = Number(
      root.status ||
      root.statusCode ||
      data.status ||
      data.statusCode ||
      response.status ||
      response.statusCode ||
      responseData.status ||
      responseData.statusCode ||
      0
    );

    if (Number.isFinite(status) && status >= 400) {
      return true;
    }

    return [
      root.ok,
      root.success,
      data.ok,
      data.success,
      responseData.ok,
      responseData.success,
    ].some((value) => value === false || value === "false" || value === 0 || value === "0");
  }

  function createInvalidLoginSessionError() {
    const error = new Error(
      "Login inválido: el servidor no devolvió una sesión válida."
    );

    error.status = 401;
    error.data = {
      code: "INVALID_LOGIN_SESSION",
      message:
        "Login inválido: el servidor no devolvió una sesión válida.",
    };

    return error;
  }

  function assertValidLoginResult(result = {}) {
    const direct = extractDirectAuthPayload(result);
    const auth = normalizeAuthResult(result);

    const requires2FA = Boolean(
      direct.requires2FA ||
      auth?.requires2FA
    );

    if (requires2FA) {
      return {
        ...auth,
        requires2FA: true,
        tempToken:
          direct.tempToken ||
          auth?.tempToken ||
          "",
        redirectTo:
          direct.redirectTo ||
          auth?.redirectTo ||
          DEFAULT_2FA_PATH,
      };
    }

    if (isExplicitAuthFailure(result)) {
      throw createInvalidLoginSessionError();
    }

    if (
      !hasUsableToken(direct.token) ||
      !hasUsableUser(direct.user)
    ) {
      throw createInvalidLoginSessionError();
    }

    return {
      ...auth,
      requires2FA: false,
      token: direct.token,
      refreshToken:
        direct.refreshToken ||
        auth?.refreshToken ||
        "",
      user: direct.user,
      redirectTo:
        direct.redirectTo ||
        auth?.redirectTo ||
        "",
    };
  }

  function clearKnownAuthStorageKeys() {
    if (!isBrowser()) {
      return;
    }

    const keys = [
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
      "token",
      "user",
      "session",
    ];

    keys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {}

      try {
        sessionStorage.removeItem(key);
      } catch {}
    });
  }

  function clearFailedLoginState(reason = "login_failed") {
    try {
      Auth?.clearSessionLocal?.();
    } catch {}

    try {
      Auth?.clearSession?.();
    } catch {}

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
        }
      } catch {}
    }

    clearKnownAuthStorageKeys();

    safeEmit("auth:login:rejected", {
      reason,
      source: "LoginView",
    });
  }

  function getErrorMessage(error) {
    const code =
      safeText(error?.data?.code, "") ||
      safeText(error?.data?.error, "") ||
      safeText(error?.response?.data?.code, "") ||
      safeText(error?.response?.data?.error, "");

    const message =
      safeText(error?.data?.message, "") ||
      safeText(error?.data?.mensaje, "") ||
      safeText(error?.response?.data?.message, "") ||
      safeText(error?.response?.data?.mensaje, "") ||
      safeText(error?.message, "") ||
      safeText(error?.statusText, "");

    if (message) {
      return message;
    }

    switch (code) {
      case "INVALID_CREDENTIALS":
        return "Credenciales incorrectas.";

      case "ACCOUNT_TEMPORARILY_LOCKED":
        return "La cuenta está bloqueada temporalmente. Inténtalo más tarde.";

      case "MISSING_CREDENTIALS":
        return "Introduce usuario/email y contraseña.";

      case "INVALID_LOGIN_SESSION":
        return "Login inválido: el servidor no devolvió una sesión válida.";

      default:
        return "No se pudo iniciar sesión.";
    }
  }

  /* =========================================================
     TOAST INLINE SYSTEM
  ========================================================= */

  function clampToastDuration(duration) {
    return Math.max(
      TOAST_MIN_DURATION,
      Number(duration) || TOAST_DEFAULT_DURATION
    );
  }

  function getToastGlyph(type = "default") {
    if (type === "success") {
      return `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M9.55 16.6 5.4 12.45l1.4-1.4 2.75 2.75 7.65-7.65 1.4 1.4-9.05 9.05Z"/>
        </svg>
      `;
    }

    if (type === "error") {
      return `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z"/>
        </svg>
      `;
    }

    if (type === "warning") {
      return `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M12 2 1 21h22L12 2Zm1 14h-2v-2h2v2Zm0-4h-2V8h2v4Z"/>
        </svg>
      `;
    }

    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M11 7h2V5h-2v2Zm0 12h2V9h-2v10Zm1-17C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Z"/>
      </svg>
    `;
  }

  function hideToast() {
    const {
      toastRoot,
      toastProgress,
    } = getToastElements();

    clearToastTimer();

    if (!toastRoot) {
      return;
    }

    try {
      toastRoot.classList.remove(
        "is-visible",
        "is-success",
        "is-error",
        "is-info",
        "is-warning"
      );

      toastRoot.hidden = true;
      toastRoot.setAttribute("aria-hidden", "true");
      toastRoot.dataset.state = "default";

      if (toastProgress) {
        toastProgress.style.animation = "none";
        toastProgress.style.transform = "";
        toastProgress.style.opacity = "";
      }
    } catch {}
  }

  function fallbackToast({
    title = "",
    message = "",
    type = "info",
  } = {}) {
    const text = [title, message]
      .map((item) => safeText(item, ""))
      .filter(Boolean)
      .join(" · ");

    if (!text) {
      return;
    }

    try {
      if (typeof AppCore?.toast?.[type] === "function") {
        AppCore.toast[type](text);
        return;
      }
    } catch {}

    try {
      AppCore?.toast?.show?.(text, type);
    } catch {}
  }

  function showToast({
    title = "Aviso",
    message = "",
    type = "info",
    duration = TOAST_DEFAULT_DURATION,
    persistent = false,
    closable = true,
  } = {}) {
    const {
      toastRoot,
      toastIcon,
      toastTitle,
      toastText,
      toastClose,
      toastProgress,
    } = getToastElements();

    if (!toastRoot || !toastTitle || !toastText) {
      fallbackToast({
        title,
        message,
        type,
      });

      return;
    }

    const safeDuration = clampToastDuration(duration);

    clearToastTimer();

    try {
      toastRoot.hidden = false;
      toastRoot.setAttribute("aria-hidden", "false");
      toastRoot.dataset.state = type;

      toastRoot.classList.remove(
        "is-success",
        "is-error",
        "is-info",
        "is-warning"
      );

      toastRoot.classList.add(
        "is-visible",
        `is-${type}`
      );

      toastTitle.textContent = title || "Aviso";
      toastText.textContent = message || "";

      if (toastIcon) {
        toastIcon.innerHTML = getToastGlyph(type);
      }

      if (toastClose) {
        toastClose.hidden = !closable;
        toastClose.disabled = !closable;
        toastClose.setAttribute("aria-hidden", String(!closable));
        toastClose.tabIndex = closable ? 0 : -1;
        toastClose.style.pointerEvents = closable ? "" : "none";
        toastClose.style.opacity = closable ? "" : "0";
      }

      if (toastProgress) {
        toastProgress.style.animation = "none";
        toastProgress.style.transform = "";
        toastProgress.style.opacity = "";

        if (!persistent) {
          void toastProgress.offsetWidth;
          toastProgress.style.animation =
            `loginToastProgress ${safeDuration}ms linear forwards`;
        }
      }

      if (!persistent && isBrowser()) {
        toastTimerId = window.setTimeout(() => {
          hideToast();
        }, safeDuration);
      }
    } catch {}
  }

  /* =========================================================
     FORM STATE / VALIDATION
  ========================================================= */

  function shakeCard(cardEl) {
    if (!cardEl) {
      return;
    }

    try {
      cardEl.classList.remove("shake");
      void cardEl.offsetWidth;
      cardEl.classList.add("shake");
    } catch {}
  }

  function showErrorState({
    refs,
    cardEl,
    message,
  }) {
    applyLoginErrors(refs, {
      identifier: message,
      password: message,
    });

    showToast({
      title: "Acceso denegado",
      message: message || "No se pudo iniciar sesión.",
      type: "error",
      duration: ERROR_TOAST_DURATION,
      persistent: false,
      closable: true,
    });

    shakeCard(cardEl);

    if (isBrowser()) {
      window.setTimeout(() => {
        refs?.passwordInput?.focus?.();
        refs?.passwordInput?.select?.();
      }, 0);
    }
  }

  function validate(refs = {}) {
    const formState = readLoginFormState(refs);

    const identifier =
      normalizeIdentifier(formState.identifier);

    const password =
      String(formState.password || "");

    clearLoginErrors(refs);

    if (!identifier) {
      applyLoginErrors(refs, {
        identifier: "Introduce tu email o nombre de usuario.",
      });

      showToast({
        title: "Campo requerido",
        message: "Introduce tu email o nombre de usuario.",
        type: "error",
        duration: 3400,
        closable: true,
      });

      refs?.identifierInput?.focus?.();
      return false;
    }

    if (
      identifier.includes("@") &&
      !isEmail(identifier)
    ) {
      applyLoginErrors(refs, {
        identifier: "El formato del email no es válido.",
      });

      showToast({
        title: "Email no válido",
        message: "El formato del email no es válido.",
        type: "error",
        duration: 3400,
        closable: true,
      });

      refs?.identifierInput?.focus?.();
      return false;
    }

    if (!password.trim()) {
      applyLoginErrors(refs, {
        password: "Introduce tu contraseña.",
      });

      showToast({
        title: "Campo requerido",
        message: "Introduce tu contraseña.",
        type: "error",
        duration: 3400,
        closable: true,
      });

      refs?.passwordInput?.focus?.();
      return false;
    }

    if (password.length < 6) {
      applyLoginErrors(refs, {
        password: "La contraseña debe tener al menos 6 caracteres.",
      });

      showToast({
        title: "Contraseña demasiado corta",
        message: "La contraseña debe tener al menos 6 caracteres.",
        type: "error",
        duration: 3600,
        closable: true,
      });

      refs?.passwordInput?.focus?.();
      return false;
    }

    return true;
  }

  /* =========================================================
     LOGIN FLOW
  ========================================================= */

  function buildLoginPayload(refs = {}) {
    const formState = readLoginFormState(refs);

    return {
      identifier: normalizeIdentifier(
        formState.identifier
      ),

      password: String(
        formState.password || ""
      ),

      remember: Boolean(
        formState.remember
      ),

      redirect:
        safeText(
          refs?.form?.querySelector?.('input[name="redirect"]')?.value,
          ""
        ) ||
        getCurrentRedirectPath(),
    };
  }

  function persistLegacyUserInfo(result = {}) {
    try {
      if (!isBrowser()) {
        return;
      }

      const auth = normalizeAuthResult(result);

      if (
        !hasUsableToken(auth?.token) ||
        !hasUsableUser(auth?.user)
      ) {
        return;
      }

      const user = auth.user;

      localStorage.setItem(
        "onion_token",
        String(auth.token)
      );

      localStorage.setItem(
        "onion_user_name",
        user?.name ||
          user?.nombre ||
          user?.username ||
          user?.email ||
          ""
      );

      localStorage.setItem(
        "onion_role",
        user?.role || "user"
      );
    } catch (error) {
      safeErrorLog(
        "No se pudo persistir el estado legado del login",
        error
      );
    }
  }

  function syncUserStateAfterLogin(result = {}) {
    const auth = normalizeAuthResult(result);

    if (
      auth?.requires2FA &&
      !auth?.token
    ) {
      return {
        authenticated: false,
        requires2FA: true,
      };
    }

    if (
      !hasUsableToken(auth?.token) ||
      !hasUsableUser(auth?.user)
    ) {
      clearFailedLoginState("invalid_login_session");
      throw createInvalidLoginSessionError();
    }

    const session = syncSession(auth);

    if (!session?.authenticated) {
      clearFailedLoginState("session_sync_failed");
      throw createInvalidLoginSessionError();
    }

    safeEmit("login:success", {
      user: session.user,
      role: session.role,
      authenticated: true,
      source: "LoginView",
    });

    return session;
  }

  function handleSuccessfulLogin(result, payload, refs) {
    const auth = normalizeAuthResult(result);

    persistRememberedIdentifier(payload);
    persistLegacyUserInfo(auth);

    const session = syncUserStateAfterLogin(auth);

    setLoginLoading(refs, true, {
      submitLabel: "Acceder",
      loadingLabel: "Accediendo...",
    });

    const redirectTo = resolvePostLoginPath(payload);

    isNavigatingAway = true;

    /*
      Si Auth.login ya navegó internamente, no navegamos otra vez.
    */
    if (!isStillOnLoginRoute()) {
      setAuthScreen(false);
      hideToast();
      forceHideGlobalLoader();
      return session;
    }

    navigateTo(redirectTo || DEFAULT_POST_LOGIN_PATH);

    return session;
  }

  function handle2FARequired(result, refs) {
    const auth = normalizeAuthResult(result);

    const redirectTo =
      auth?.redirectTo ||
      DEFAULT_2FA_PATH;

    isNavigatingAway = true;

    try {
      if (
        isBrowser() &&
        auth?.tempToken
      ) {
        localStorage.setItem(
          "onion_temp_token",
          String(auth.tempToken)
        );
      }
    } catch (error) {
      safeErrorLog(
        "No se pudo guardar el temp token 2FA",
        error
      );
    }

    safeEmit("login:2fa-required", {
      redirectTo,
      tempToken: auth?.tempToken || null,
      source: "LoginView",
    });

    showToast({
      title: "Verificación adicional",
      message: "Se requiere una comprobación extra. Redirigiendo...",
      type: "info",
      duration: TWO_FA_TOAST_DURATION,
      persistent: false,
      closable: false,
    });

    setLoginLoading(refs, true, {
      submitLabel: "Acceder",
      loadingLabel: "Accediendo...",
    });

    navigateSoon(
      redirectTo,
      TWO_FA_TOAST_DURATION
    );
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function render() {
    const container = getContainer();

    if (!container) {
      safeWarnLog(
        "LoginView: no se encontró #view-container para renderizar."
      );

      forceHideGlobalLoader();
      return null;
    }

    isNavigatingAway = false;
    isSubmitting = false;

    destroyViewState({
      preserveToast: false,
    });

    restoreGlobalLoaderStyles();
    setAuthScreen(true);

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    try {
      AppCore?.setDocumentTitle?.("Onion Support");
    } catch {}

    const redirectPath = getCurrentRedirectPath();

    const appName =
      AppCore?.config?.appName ||
      "Onion Support";

    const appVersion =
      AppCore?.config?.version ||
      "1.0.0";

    const currentYear =
      new Date().getFullYear();

    container.innerHTML = getLoginTemplate({
      appName,
      appVersion,
      currentYear,

      redirect: redirectPath || "",

      heroEyebrow: "Entorno seguro",
      heroTitle:
        "Tu acceso entra en un panel más vivo y con más presencia visual.",

      bullets: [
        "Sesión cifrada",
        "Controles de acceso activos",
        "Shell SPA preparado",
      ],

      title:
        `Iniciar sesión con la cuenta ${appName}`,

      subtitle:
        "Accede a tu espacio de soporte, incidencias y gestión interna.",

      identifierPlaceholder: "Usuario o email",
      passwordPlaceholder: "Contraseña",
      rememberLabel: "Recordarme",
      secureMeta: "Acceso seguro",
      submitLabel: "Acceder",

      forgotLabel:
        "¿Has olvidado tu contraseña?",

      forgotPasswordHref:
        "/reset-password",

      logoDarkSrc:
        "/src/media/img/favicon_white.png",

      logoLightSrc:
        "/src/media/img/favicon_black.png",
    });

    forceHideGlobalLoader();
    bind();

    return container;
  }

  /* =========================================================
     BIND
  ========================================================= */

  function bind() {
    if (!isBrowser()) {
      return;
    }

    const cleanupApi = AppCore?.cleanup;
    const scope =
      typeof cleanupApi?.scope === "function"
        ? cleanupApi.scope(SCOPE)
        : SCOPE;

    const container = getContainer();
    const refs = getLoginRefs(container);

    const card =
      refs?.root?.querySelector?.(".login-card") ||
      null;

    const toastClose =
      document.getElementById("loginToastClose");

    if (
      !refs?.form ||
      !refs?.identifierInput ||
      !refs?.passwordInput ||
      !refs?.submitButton
    ) {
      safeWarnLog(
        "LoginView: faltan nodos críticos del formulario de acceso."
      );

      forceHideGlobalLoader();
      return;
    }

    focusLoginPrimaryField(refs, {
      rememberedIdentifier: Boolean(
        refs?.rememberInput?.checked &&
        safeText(refs?.identifierInput?.value, "")
      ),
    });

    clearLoginErrors(refs);

    setLoginLoading(refs, false, {
      submitLabel: "Acceder",
      loadingLabel: "Accediendo...",
    });

    forceHideGlobalLoader();

    if (toastClose) {
      try {
        if (typeof cleanupApi?.on === "function") {
          cleanupApi.on(
            scope,
            toastClose,
            "click",
            () => {
              if (
                isSubmitting &&
                isNavigatingAway
              ) {
                return;
              }

              hideToast();
            }
          );
        } else {
          toastClose.addEventListener("click", hideToast);
        }
      } catch {}
    }

    const unbindInputClearers =
      bindLoginInputClearers(refs, () => {
        clearLoginErrors(refs);
      });

    const unbindSubmit =
      bindLoginSubmit(refs, async (event) => {
        event.preventDefault();

        if (
          isSubmitting ||
          isNavigatingAway
        ) {
          return;
        }

        hideToast();
        clearLoginErrors(refs);

        const isValid = validate(refs);

        if (!isValid) {
          shakeCard(card);
          return;
        }

        const payload = buildLoginPayload(refs);

        isSubmitting = true;

        setLoginLoading(refs, true, {
          submitLabel: "Acceder",
          loadingLabel: "Accediendo...",
        });

        showToast({
          title: LOGIN_LOADING_TOAST_TITLE,
          message: LOGIN_LOADING_TOAST_MESSAGE,
          type: "info",
          persistent: true,
          closable: false,
        });

        try {
          const rawResult = await Auth.login({
            identifier: payload.identifier,
            password: payload.password,
            remember: payload.remember,
          });

          const result = assertValidLoginResult(rawResult);

          /*
            Microtask:
            deja respirar a Auth.login si internamente emitió navegación.
            Si la ruta ya salió de /login, no navegamos otra vez.
          */
          await Promise.resolve();

          if (result?.requires2FA) {
            handle2FARequired(result, refs);
            return;
          }

          handleSuccessfulLogin(result, payload, refs);
        } catch (error) {
          clearFailedLoginState("login_error");
          hideToast();

          safeErrorLog(
            "Login error",
            error
          );

          setLoginLoading(
            refs,
            false,
            {
              submitLabel: "Acceder",
              loadingLabel: "Accediendo...",
            }
          );

          isSubmitting = false;
          isNavigatingAway = false;

          /*
            Protección extra:
            si Auth.login navegó internamente antes de fallar
            o antes de devolver un payload inválido, volvemos a /login.
          */
          if (!isStillOnLoginRoute()) {
            navigateBackToLoginAfterFailedLogin();
            return;
          }

          const message = getErrorMessage(error);

          setGlobalLoginError(
            refs,
            message
          );

          showErrorState({
            refs,
            cardEl: card,
            message,
          });
        }
      });

    try {
      if (typeof cleanupApi?.event === "function") {
        cleanupApi.event(
          scope,
          "auth:login:error",
          () => {
            if (isNavigatingAway) {
              return;
            }

            clearFailedLoginState("auth_login_error_event");

            setLoginLoading(
              refs,
              false,
              {
                submitLabel: "Acceder",
                loadingLabel: "Accediendo...",
              }
            );

            isSubmitting = false;
          }
        );

        cleanupApi.event(
          scope,
          "router:before-render",
          ({ detail }) => {
            const nextPath =
              detail?.path ||
              detail?.canonicalPath ||
              "";

            if (
              nextPath &&
              !String(nextPath).startsWith(LOGIN_ROUTE_PREFIX)
            ) {
              setAuthScreen(false);
            }
          }
        );
      }
    } catch {}

    try {
      cleanupApi?.add?.(scope, () => {
        unbindInputClearers?.();
        unbindSubmit?.();

        clearRedirectTimer();
        clearToastTimer();

        if (toastClose && typeof cleanupApi?.on !== "function") {
          try {
            toastClose.removeEventListener("click", hideToast);
          } catch {}
        }

        if (!isNavigatingAway) {
          hideToast();
          setAuthScreen(false);
          restoreGlobalLoaderStyles();
        }
      });
    } catch {
      /*
        Fallback defensivo si AppCore.cleanup no está disponible.
        Los binds principales siguen teniendo unbind propio.
      */
    }
  }

  /* =========================================================
     API
  ========================================================= */

  function destroy() {
    isSubmitting = false;
    isNavigatingAway = false;

    destroyViewState({
      preserveToast: false,
    });

    setAuthScreen(false);
    restoreGlobalLoaderStyles();
  }

  return {
    render,

    init() {
      return render();
    },

    destroy,
  };
})();

export default LoginView;
