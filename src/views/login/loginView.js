/* =========================================================
   Onion SPA - Login View (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/views/loginView.js

   Responsabilidades:
   - pintar pantalla de acceso
   - activar modo fullscreen auth
   - validar credenciales en cliente
   - enviar login a Auth
   - mostrar feedback visual local mediante toast inline
   - soportar login con username o email
   - soportar flujo opcional 2FA
   - redirigir correctamente tras login
   - evitar delays artificiales tras login correcto
   - evitar pérdida de valores al deshabilitar inputs
   - respetar logo animado
   - usar el sistema DOM refactorizado de login
   - integrar password-field compartido
   - login limpio sin mensajes dentro del card
   - forzar apagado del loader al renderizar login
   - usar rutas absolutas coherentes con el shell SPA
   - evitar reactivar el form tras login correcto
   - quitar bloques visuales sobrantes
   - conservar bloque lateral izquierdo de estado
   - mover el card principal a la derecha
   - mantener layout estable sin generar scroll
   - reducir efectos para un resultado más limpio
   - renderizar usando src/views/login/login.template.js
   - evitar doble navegación post-login
   - no redirigir por defecto a /usuarios
   - no redirigir por defecto a /@slug
   - default post-login: /

   HARDENING:
   - guards de browser
   - timers centralizados
   - toast inline robusto
   - navegación segura post-login
   - sync de sesión estable e idempotente
   - cleanup completo de la vista
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
  resolveLoginRedirect,
  shouldRedirectAfterLogin,
  persistRememberedIdentifier,
} from "./login/login.helpers.js";

export const LoginView = (() => {
  "use strict";

  const SCOPE = "view:login";

  const LOGO_ROTATE_INTERVAL = 3000;
  const LOGO_FADE_DURATION = 1800;

  const TOAST_DEFAULT_DURATION = 3600;
  const TOAST_MIN_DURATION = 1200;
  const ERROR_TOAST_DURATION = 4200;
  const TWO_FA_TOAST_DURATION = 250;
  const NAVIGATION_BUFFER_MS = 0;

  const LOGIN_LOADING_TOAST_TITLE = "Validando acceso";
  const LOGIN_LOADING_TOAST_MESSAGE =
    "Comprobando credenciales y preparando tu sesión...";

  const LOGIN_ROUTE_PREFIX = "/login";
  const DEFAULT_POST_LOGIN_PATH = "/";
  const DEFAULT_2FA_PATH = "/2fa";

  let logoIntervalId = null;
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

  function normalizeIdentifier(value = "") {
    return safeText(value, "");
  }

  function isEmail(value = "") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      String(value || "").trim()
    );
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
    return normalizePath(path)
      .split("?")[0]
      .split("#")[0] || "/";
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

  function escapeHtml(value = "") {
    if (typeof AppCore?.utils?.escapeHtml === "function") {
      return AppCore.utils.escapeHtml(String(value ?? ""));
    }

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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

  function safeEmit(eventName, payload = {}) {
    try {
      AppCore?.events?.emit?.(eventName, payload);
    } catch {}
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

  function stopLogoAnimation() {
    if (!logoIntervalId || !isBrowser()) {
      return;
    }

    window.clearInterval(logoIntervalId);
    logoIntervalId = null;
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
        topbar: null,
        topbarViewContainer: null,
        tableheadContainer: null,
      };
    }

    return {
      sidebar:
        AppCore?.dom?.sidebar ||
        document.getElementById("sidebar"),

      topbar:
        AppCore?.dom?.topbar ||
        document.getElementById("topbar") ||
        document.querySelector(".topbar"),

      topbarViewContainer:
        AppCore?.dom?.topbarViewContainer ||
        document.getElementById("topbarview-container"),

      tableheadContainer:
        AppCore?.dom?.tableheadContainer ||
        document.getElementById("tablehead-container"),
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

  function navigateTo(path = DEFAULT_POST_LOGIN_PATH) {
    if (!isBrowser()) {
      return;
    }

    const target = normalizePath(path || DEFAULT_POST_LOGIN_PATH);

    setAuthScreen(false);
    hideToast();
    forceHideGlobalLoader();

    /*
      CRÍTICO:
      No usamos Router.goAfterLogin() aquí.
      goAfterLogin vuelve a leer redirect/fallback y puede provocar
      una segunda resolución de navegación.
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

    const safeDelay =
      Math.max(0, Number(delay) || 0) +
      NAVIGATION_BUFFER_MS;

    if (safeDelay <= 0) {
      navigateTo(path);
      return;
    }

    redirectTimerId = window.setTimeout(() => {
      navigateTo(path);
    }, safeDelay);
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

    if (typeof AppCore?.setLoading === "function") {
      AppCore.setLoading(false);
    }

    if (document?.body) {
      document.body.classList.remove("loading");
    }

    if (!loader) {
      return;
    }

    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.style.display = "none";
    loader.style.opacity = "0";
    loader.style.visibility = "hidden";
    loader.style.pointerEvents = "none";
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

    loader.hidden = false;
    loader.setAttribute("aria-hidden", "true");
    loader.style.display = "";
    loader.style.opacity = "";
    loader.style.visibility = "";
    loader.style.pointerEvents = "";
  }

  function setAuthScreen(active) {
    if (!isBrowser() || !document?.body) {
      return;
    }

    const enabled = Boolean(active);

    const {
      sidebar,
      topbar,
      topbarViewContainer,
      tableheadContainer,
    } = getShellElements();

    document.body.classList.toggle("auth-screen", enabled);
    document.body.classList.toggle("route-auth", enabled);
    document.body.classList.toggle("route-shell-hidden", enabled);
    document.body.classList.toggle("login-no-scroll", enabled);

    if (enabled) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }

    if (sidebar) sidebar.hidden = enabled;
    if (topbar) topbar.hidden = enabled;
    if (topbarViewContainer) topbarViewContainer.hidden = enabled;
    if (tableheadContainer) tableheadContainer.hidden = enabled;
  }

  /* =========================================================
     VIEW STATE
  ========================================================= */

  function destroyViewState({
    preserveToast = false,
  } = {}) {
    stopLogoAnimation();
    clearRedirectTimer();
    clearToastTimer();

    if (!preserveToast) {
      hideToast();
    }

    AppCore?.cleanup?.run?.(SCOPE);
  }

  function clampToastDuration(duration) {
    return Math.max(
      TOAST_MIN_DURATION,
      Number(duration) || TOAST_DEFAULT_DURATION
    );
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

      default:
        return "No se pudo iniciar sesión.";
    }
  }

  /* =========================================================
     TOAST INLINE SYSTEM
  ========================================================= */

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
      return;
    }

    const safeDuration =
      clampToastDuration(duration);

    clearToastTimer();

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
  }

  /* =========================================================
     FORM STATE / VALIDATION
  ========================================================= */

  function shakeCard(cardEl) {
    if (!cardEl) {
      return;
    }

    cardEl.classList.remove("shake");
    void cardEl.offsetWidth;
    cardEl.classList.add("shake");
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
     LOGO ANIMATION
  ========================================================= */

  function startLogoAnimation(logoImages = []) {
    stopLogoAnimation();

    if (
      !isBrowser() ||
      !Array.isArray(logoImages) ||
      logoImages.length <= 1
    ) {
      return;
    }

    let index = 0;

    logoImages.forEach((img, i) => {
      img.style.opacity = i === 0 ? "1" : "0";
      img.style.transition =
        `opacity ${LOGO_FADE_DURATION}ms ease`;
    });

    logoIntervalId = window.setInterval(() => {
      const current = logoImages[index];
      const next = logoImages[index + 1];

      if (!current || !next) {
        stopLogoAnimation();

        logoImages.forEach((img, i) => {
          img.style.opacity =
            i === logoImages.length - 1 ? "1" : "0";
        });

        return;
      }

      current.style.opacity = "0";
      next.style.opacity = "1";
      index += 1;
    }, LOGO_ROTATE_INTERVAL);
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

      redirect: safeText(
        refs?.form?.querySelector?.('input[name="redirect"]')?.value,
        ""
      ),
    };
  }

  function resolvePostLoginPath(result = {}, payload = {}) {
    const auth =
      normalizeAuthResult(result);

    const forcedRedirect =
      payload?.redirect ||
      getSafeRedirectPath();

    if (
      forcedRedirect &&
      forcedRedirect !== DEFAULT_POST_LOGIN_PATH
    ) {
      return normalizePath(forcedRedirect);
    }

    return resolveLoginRedirect(auth, {
      trustAuthRedirect: false,
      redirectTo: "",
      successRedirect: "",
      redirect: "",
    });
  }

  function persistLegacyUserInfo(result = {}) {
    try {
      if (!isBrowser()) {
        return;
      }

      const auth =
        normalizeAuthResult(result);

      const user =
        auth?.user ||
        AppCore?.state?.user ||
        {};

      if (auth?.token) {
        localStorage.setItem(
          "onion_token",
          String(auth.token)
        );
      }

      localStorage.setItem(
        "onion_user_name",
        user?.name ||
          user?.nombre ||
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
    const auth =
      normalizeAuthResult(result);

    if (
      auth?.requires2FA &&
      !auth?.token
    ) {
      return {
        authenticated: false,
        requires2FA: true,
      };
    }

    const session =
      syncSession(auth);

    safeEmit("login:success", {
      user: session.user,
      role: session.role,
      authenticated: true,
      source: "LoginView",
    });

    return session;
  }

  function handleSuccessfulLogin(result, payload, refs) {
    const auth =
      normalizeAuthResult(result);

    persistRememberedIdentifier(payload);
    persistLegacyUserInfo(auth);

    const session =
      syncUserStateAfterLogin(auth);

    setLoginLoading(refs, true, {
      submitLabel: "Acceder",
      loadingLabel: "Accediendo...",
    });

    const redirectTo =
      resolvePostLoginPath(auth, payload);

    isNavigatingAway = true;

    /*
      Si Auth.login ya navegó internamente, no volvemos a navegar.
      Esto elimina el doble render/parpadeo.
    */
    if (!isStillOnLoginRoute()) {
      setAuthScreen(false);
      hideToast();
      forceHideGlobalLoader();
      return;
    }

    const shouldNavigate =
      shouldRedirectAfterLogin(auth, {
        redirectTo,
        trustAuthRedirect: false,
      });

    if (!shouldNavigate) {
      setAuthScreen(false);
      hideToast();
      forceHideGlobalLoader();
      return;
    }

    navigateTo(redirectTo || DEFAULT_POST_LOGIN_PATH);

    return session;
  }

  function handle2FARequired(result, refs) {
    const auth =
      normalizeAuthResult(result);

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
      return;
    }

    isNavigatingAway = false;
    isSubmitting = false;

    destroyViewState({
      preserveToast: false,
    });

    restoreGlobalLoaderStyles();
    setAuthScreen(true);

    AppCore?.clearDynamicContainers?.();
    AppCore?.setDocumentTitle?.(
      "Onion Support"
    );

    const redirectPath =
      getCurrentRedirectPath();

    const appName =
      AppCore?.config?.appName ||
      "Onion Support";

    const appVersion =
      AppCore?.config?.version ||
      "1.0.0";

    const currentYear =
      new Date().getFullYear();

    container.innerHTML =
      getLoginTemplate({
        appName: escapeHtml(appName),
        appVersion: escapeHtml(appVersion),
        currentYear,

        redirect: escapeHtml(
          redirectPath || ""
        ),

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

        logos: [
          "/src/media/img/favicon_black.png",
          "/src/media/img/favicon_black_circle.png",
          "/src/media/img/favicon_support.png",
          "/src/media/img/favicon_white.png",
        ],
      });

    forceHideGlobalLoader();
    bind();
  }

  /* =========================================================
     BIND
  ========================================================= */

  function bind() {
    if (!isBrowser()) {
      return;
    }

    const scope =
      AppCore?.cleanup?.scope?.(SCOPE);

    const container = getContainer();
    const refs = getLoginRefs(container);

    const card =
      refs?.root?.querySelector?.(".login-card") ||
      null;

    const toastClose =
      document.getElementById("loginToastClose");

    const logoContainer =
      refs?.root?.querySelector?.(".logo-fade") ||
      document.querySelector(".logo-fade");

    const logoImages = logoContainer
      ? Array.from(
          logoContainer.querySelectorAll("img")
        )
      : [];

    if (
      !scope ||
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

    startLogoAnimation(logoImages);

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
      AppCore.cleanup.on(
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

        const payload =
          buildLoginPayload(refs);

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
          const rawResult =
            await Auth.login({
              identifier: payload.identifier,
              password: payload.password,
              remember: payload.remember,
            });

          const result =
            normalizeAuthResult(rawResult);

          /*
            Microtask:
            deja respirar a Auth.login si internamente emitió navegación.
            Si la ruta ya salió de /login, NO navegamos otra vez.
          */
          await Promise.resolve();

          if (result?.requires2FA) {
            handle2FARequired(
              result,
              refs
            );
            return;
          }

          handleSuccessfulLogin(
            result,
            payload,
            refs
          );
        } catch (error) {
          const message =
            getErrorMessage(error);

          safeErrorLog(
            "Login error",
            error
          );

          setGlobalLoginError(
            refs,
            message
          );

          showErrorState({
            refs,
            cardEl: card,
            message,
          });

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
        }
      });

    AppCore.cleanup.event(
      scope,
      "auth:login:error",
      () => {
        if (isNavigatingAway) {
          return;
        }

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

    AppCore.cleanup.event(
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

    AppCore.cleanup.add(scope, () => {
      unbindInputClearers?.();
      unbindSubmit?.();

      stopLogoAnimation();
      clearRedirectTimer();
      clearToastTimer();

      if (!isNavigatingAway) {
        hideToast();
        setAuthScreen(false);
        restoreGlobalLoaderStyles();
      }
    });
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */

  return {
    render,

    init() {
      return render();
    },

    destroy() {
      isSubmitting = false;
      isNavigatingAway = false;

      destroyViewState({
        preserveToast: false,
      });

      setAuthScreen(false);
      restoreGlobalLoaderStyles();
    },
  };
})();

export default LoginView;
