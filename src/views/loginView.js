/* =========================================================
   Onion SPA - Login View (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/views/loginView.js

   Responsabilidades:
   - pintar pantalla de acceso
   - activar modo fullscreen auth
   - validar credenciales en cliente
   - enviar login a Auth
   - mostrar feedback visual mediante toast
   - soportar login con username o email
   - soportar flujo opcional 2FA
   - redirigir correctamente tras login
   - evitar delays artificiales tras login correcto
   - evitar pérdida de valores al deshabilitar inputs
   - respetar logo animado
   - soportar caps lock indicator con icono tipo apple
   - soportar toggle password tipo eye
   - login limpio sin mensajes dentro del card
   - forzar apagado del loader al renderizar login
   - usar rutas absolutas coherentes con el shell SPA
   - evitar reactivar el form tras login correcto
   - quitar bloques visuales sobrantes
   - conservar bloque lateral izquierdo de estado
   - mover el card principal a la derecha
   - mantener layout estable sin generar scroll
   - reducir efectos para un resultado más limpio
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";

export const LoginView = (() => {
  "use strict";

  const SCOPE = "view:login";

  const LOGO_ROTATE_INTERVAL = 3000;
  const LOGO_FADE_DURATION = 1800;

  const TOAST_DEFAULT_DURATION = 3600;
  const TOAST_MIN_DURATION = 1200;

  const LOGIN_LOADING_TOAST_TITLE = "Validando acceso";
  const LOGIN_LOADING_TOAST_MESSAGE =
    "Comprobando credenciales y preparando tu sesión...";

  const ERROR_TOAST_DURATION = 4200;
  const TWO_FA_TOAST_DURATION = 250;
  const NAVIGATION_BUFFER_MS = 0;

  let logoIntervalId = null;
  let redirectTimerId = null;
  let toastTimerId = null;

  let isNavigatingAway = false;
  let isSubmitting = false;

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function getContainer() {
    return (
      AppCore.dom.viewContainer ||
      document.getElementById("view-container") ||
      document.querySelector("#view-container")
    );
  }

  function escapeHtml(value = "") {
    if (AppCore?.utils?.escapeHtml) {
      return AppCore.utils.escapeHtml(String(value ?? ""));
    }

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeIdentifier(value = "") {
    return String(value || "").trim();
  }

  function isEmail(value = "") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function slugify(value = "") {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  }

  function clearRedirectTimer() {
    if (redirectTimerId) {
      window.clearTimeout(redirectTimerId);
      redirectTimerId = null;
    }
  }

  function clearToastTimer() {
    if (toastTimerId) {
      window.clearTimeout(toastTimerId);
      toastTimerId = null;
    }
  }

  function getCurrentRedirectPath() {
    try {
      const url = new URL(window.location.href);
      const redirect = url.searchParams.get("redirect");
      return redirect ? AppCore.utils.normalizePath(redirect) : null;
    } catch {
      return null;
    }
  }

  function getSafeRedirectPath() {
    const redirectPath = getCurrentRedirectPath();

    if (!redirectPath) return "/";
    if (redirectPath === "/login" || redirectPath.startsWith("/login?")) {
      return "/";
    }

    return AppCore.utils.normalizePath(redirectPath);
  }

  function getErrorMessage(error) {
    return (
      error?.data?.message ||
      error?.data?.error ||
      error?.message ||
      error?.statusText ||
      "No se pudo iniciar sesión."
    );
  }

  function getShellElements() {
    return {
      sidebar: AppCore.dom.sidebar || document.getElementById("sidebar"),
      topbar:
        AppCore.dom.topbar ||
        document.getElementById("topbar") ||
        document.querySelector(".topbar"),
      topbarViewContainer:
        AppCore.dom.topbarViewContainer ||
        document.getElementById("topbarview-container"),
      tableheadContainer:
        AppCore.dom.tableheadContainer ||
        document.getElementById("tablehead-container"),
    };
  }

  function forceHideGlobalLoader() {
    const loader = AppCore.dom.loader || document.getElementById("app-loader");

    AppCore.setLoading?.(false);

    if (document?.body) {
      document.body.classList.remove("loading");
    }

    if (loader) {
      loader.hidden = true;
      loader.setAttribute("aria-hidden", "true");
      loader.style.display = "none";
      loader.style.opacity = "0";
      loader.style.visibility = "hidden";
      loader.style.pointerEvents = "none";
    }
  }

  function restoreGlobalLoaderStyles() {
    const loader = AppCore.dom.loader || document.getElementById("app-loader");

    if (!loader) return;

    loader.hidden = false;
    loader.setAttribute("aria-hidden", "true");
    loader.style.display = "";
    loader.style.opacity = "";
    loader.style.visibility = "";
    loader.style.pointerEvents = "";
  }

  function setAuthScreen(active) {
    if (!document?.body) return;

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

  function stopLogoAnimation() {
    if (logoIntervalId) {
      window.clearInterval(logoIntervalId);
      logoIntervalId = null;
    }
  }

  function destroyViewState({ preserveToast = false } = {}) {
    stopLogoAnimation();
    clearRedirectTimer();
    clearToastTimer();

    if (!preserveToast) {
      hideToast();
    }

    AppCore.cleanup.run(SCOPE);
  }

  function focusInitialField(identifierInput) {
    window.setTimeout(() => {
      identifierInput?.focus?.();
      identifierInput?.select?.();
    }, 0);
  }

  function navigateTo(path) {
    const target = AppCore.utils.normalizePath(path || "/");

    setAuthScreen(false);
    hideToast();
    forceHideGlobalLoader();

    if (typeof Router.goAfterLogin === "function") {
      Router.goAfterLogin(target);
      return;
    }

    if (typeof Router.navigate === "function") {
      Router.navigate(target, {
        replaceState: true,
        force: true,
      });
      return;
    }

    window.location.href = target;
  }

  function navigateSoon(path, delay = 0) {
    clearRedirectTimer();

    const safeDelay = Math.max(0, Number(delay) || 0) + NAVIGATION_BUFFER_MS;

    if (safeDelay <= 0) {
      navigateTo(path);
      return;
    }

    redirectTimerId = window.setTimeout(() => {
      navigateTo(path);
    }, safeDelay);
  }

  function clampToastDuration(duration) {
    return Math.max(TOAST_MIN_DURATION, Number(duration) || TOAST_DEFAULT_DURATION);
  }

  /* =========================================================
     TOAST SYSTEM
  ========================================================= */
  function getToastElements() {
    return {
      toastRoot: document.getElementById("loginToast"),
      toastIcon: document.getElementById("loginToastIcon"),
      toastTitle: document.getElementById("loginToastTitle"),
      toastText: document.getElementById("loginToastText"),
      toastClose: document.getElementById("loginToastClose"),
      toastProgress: document.getElementById("loginToastProgress"),
    };
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
    const { toastRoot, toastProgress } = getToastElements();
    clearToastTimer();

    if (!toastRoot) return;

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

    if (!toastRoot || !toastTitle || !toastText) return;

    const safeDuration = clampToastDuration(duration);

    clearToastTimer();

    toastRoot.hidden = false;
    toastRoot.setAttribute("aria-hidden", "false");
    toastRoot.dataset.state = type;

    toastRoot.classList.remove("is-success", "is-error", "is-info", "is-warning");
    toastRoot.classList.add("is-visible", `is-${type}`);

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
        toastProgress.style.animation = `loginToastProgress ${safeDuration}ms linear forwards`;
      }
    }

    if (!persistent) {
      toastTimerId = window.setTimeout(() => {
        hideToast();
      }, safeDuration);
    }
  }

  /* =========================================================
     FEEDBACK / STATE
  ========================================================= */
  function setFieldError(input, active = false) {
    if (!input) return;

    input.setAttribute("aria-invalid", active ? "true" : "false");
    input.classList.toggle("is-invalid", Boolean(active));
  }

  function clearFieldErrors(inputs = []) {
    inputs.forEach((input) => setFieldError(input, false));
  }

  function setSubmitting(controls, nextValue) {
    const {
      form,
      identifierInput,
      passwordInput,
      rememberInput,
      toggleBtn,
      submitBtn,
      forgotLink,
    } = controls;

    isSubmitting = Boolean(nextValue);

    if (form) {
      form.setAttribute("aria-busy", String(isSubmitting));
      form.dataset.submitting = String(isSubmitting);
    }

   if (identifierInput) identifierInput.disabled = isSubmitting;
   if (rememberInput) rememberInput.disabled = isSubmitting;
   
   if (passwordInput) passwordInput.disabled = false;
   if (toggleBtn) toggleBtn.disabled = false;

    if (forgotLink) {
      forgotLink.setAttribute("aria-disabled", String(isSubmitting));
      forgotLink.classList.toggle("is-disabled", isSubmitting);
      forgotLink.tabIndex = isSubmitting ? -1 : 0;
    }

    if (submitBtn) {
      submitBtn.disabled = isSubmitting;
      submitBtn.dataset.loading = String(isSubmitting);
      submitBtn.innerHTML = isSubmitting
        ? `<span class="login-submit-text">Accediendo...</span>`
        : `<span class="login-submit-text">Acceder</span>`;
    }
  }

  function shakeCard(cardEl) {
    if (!cardEl) return;

    cardEl.classList.remove("shake");
    void cardEl.offsetWidth;
    cardEl.classList.add("shake");
  }

  function showErrorState({
    cardEl,
    identifierInput,
    passwordInput,
    message,
  }) {
    setFieldError(identifierInput, true);
    setFieldError(passwordInput, true);

    showToast({
      title: "Acceso denegado",
      message: message || "No se pudo iniciar sesión.",
      type: "error",
      duration: ERROR_TOAST_DURATION,
      persistent: false,
      closable: true,
    });

    shakeCard(cardEl);

    window.setTimeout(() => {
      passwordInput?.focus?.();
      passwordInput?.select?.();
    }, 0);
  }

  /* =========================================================
     LECTURA ROBUSTA DEL FORM
  ========================================================= */
  function getFormPayload({
    identifierInput,
    passwordInput,
    rememberInput,
    form,
  }) {
    const redirectInput = form?.querySelector('input[name="redirect"]');

    return {
      identifier: normalizeIdentifier(identifierInput?.value || ""),
      password: String(passwordInput?.value || ""),
      remember: Boolean(rememberInput?.checked),
      redirect: normalizeIdentifier(redirectInput?.value || ""),
    };
  }

  function validate({ identifierInput, passwordInput }) {
    const identifier = normalizeIdentifier(identifierInput?.value || "");
    const password = String(passwordInput?.value || "");

    clearFieldErrors([identifierInput, passwordInput]);

    if (!identifier) {
      setFieldError(identifierInput, true);
      showToast({
        title: "Campo requerido",
        message: "Introduce tu email o nombre de usuario.",
        type: "error",
        duration: 3400,
        closable: true,
      });
      identifierInput?.focus?.();
      return false;
    }

    if (identifier.includes("@") && !isEmail(identifier)) {
      setFieldError(identifierInput, true);
      showToast({
        title: "Email no válido",
        message: "El formato del email no es válido.",
        type: "error",
        duration: 3400,
        closable: true,
      });
      identifierInput?.focus?.();
      return false;
    }

    if (!password.trim()) {
      setFieldError(passwordInput, true);
      showToast({
        title: "Campo requerido",
        message: "Introduce tu contraseña.",
        type: "error",
        duration: 3400,
        closable: true,
      });
      passwordInput?.focus?.();
      return false;
    }

    if (password.length < 6) {
      setFieldError(passwordInput, true);
      showToast({
        title: "Contraseña demasiado corta",
        message: "La contraseña debe tener al menos 6 caracteres.",
        type: "error",
        duration: 3600,
        closable: true,
      });
      passwordInput?.focus?.();
      return false;
    }

    return true;
  }

  /* =========================================================
     PASSWORD TOGGLE
  ========================================================= */
  function togglePasswordVisibility(
    passwordInput,
    toggleBtn,
    eyeOpenIcon,
    eyeClosedIcon
  ) {
    if (!passwordInput || !toggleBtn) return;

    const willShow = passwordInput.type === "password";
    passwordInput.type = willShow ? "text" : "password";

    toggleBtn.classList.toggle("active", willShow);
    toggleBtn.setAttribute("aria-pressed", String(willShow));
    toggleBtn.setAttribute(
      "aria-label",
      willShow ? "Ocultar contraseña" : "Mostrar contraseña"
    );
    toggleBtn.setAttribute(
      "title",
      willShow ? "Ocultar contraseña" : "Mostrar contraseña"
    );

    if (eyeOpenIcon) eyeOpenIcon.hidden = willShow;
    if (eyeClosedIcon) eyeClosedIcon.hidden = !willShow;

    passwordInput.focus();
  }

  /* =========================================================
     CAPS LOCK
  ========================================================= */
  function updateCapsVisual(
    capsWrap,
    capsIcon,
    capsLabel,
    passwordFocused,
    capsActive
  ) {
    const visible = Boolean(passwordFocused && capsActive);

    if (capsWrap) {
      capsWrap.hidden = !visible;
      capsWrap.classList.toggle("is-visible", visible);
    }

    if (capsIcon) {
      capsIcon.hidden = !visible;
    }

    if (capsLabel) {
      capsLabel.hidden = !visible;
    }
  }

  /* =========================================================
     LOGO FADE
  ========================================================= */
  function startLogoAnimation(logoImages = []) {
    stopLogoAnimation();

    if (!Array.isArray(logoImages) || logoImages.length <= 1) return;

    let index = 0;

    logoImages.forEach((img, i) => {
      img.style.opacity = i === 0 ? "1" : "0";
      img.style.transition = `opacity ${LOGO_FADE_DURATION}ms ease`;
    });

    logoIntervalId = window.setInterval(() => {
      const current = logoImages[index];
      const next = logoImages[index + 1];

      if (!current || !next) {
        stopLogoAnimation();

        logoImages.forEach((img, i) => {
          img.style.opacity = i === logoImages.length - 1 ? "1" : "0";
        });

        return;
      }

      current.style.opacity = "0";
      next.style.opacity = "1";
      index += 1;
    }, LOGO_ROTATE_INTERVAL);
  }

  /* =========================================================
     REDIRECCIONES
  ========================================================= */
  function resolvePostLoginPath(result, fallbackIdentifier = "") {
    if (result?.redirectTo) {
      return AppCore.utils.normalizePath(result.redirectTo);
    }

    const explicitRedirect = getSafeRedirectPath();
    if (explicitRedirect && explicitRedirect !== "/") {
      return explicitRedirect;
    }

    const user = result?.user || AppCore.state.user || {};
    const slug =
      user.slug ||
      slugify(user.username || user.name || fallbackIdentifier || "");

    if (slug) {
      return `/@${slug}`;
    }

    return "/";
  }

  function persistLegacyUserInfo(result, identifier = "") {
    try {
      const user = result?.user || AppCore.state.user || {};
      const slug =
        user.slug ||
        slugify(user.username || user.name || identifier || "");

      if (result?.token) {
        localStorage.setItem("onion_token", String(result.token));
      }

      if (slug) {
        localStorage.setItem("onion_user_slug", slug);
      }

      localStorage.setItem("onion_user_name", user.name || user.nombre || "");
      localStorage.setItem("onion_role", user.role || "user");
    } catch (error) {
      AppCore.utils.error?.(
        "No se pudo persistir el estado legado del login",
        error
      );
    }
  }

  function syncUserStateAfterLogin(result, payload) {
    const normalizedUser =
      result?.user ||
      AppCore.state.user ||
      null;

    const token =
      result?.token ??
      AppCore.state.token ??
      null;

    if (typeof AppCore.applySession === "function") {
      AppCore.applySession({
        token,
        user: normalizedUser,
      });
    } else {
      if (typeof AppCore.setToken === "function" && token !== undefined) {
        AppCore.setToken(token);
      }

      if (typeof AppCore.setUser === "function" && normalizedUser !== undefined) {
        AppCore.setUser(normalizedUser);
      }
    }

    AppCore.syncUserUI?.();

    AppCore.events.emit("login:success", {
      user: normalizedUser,
      identifier: payload?.identifier || "",
      redirectTo: resolvePostLoginPath(result, payload?.identifier || ""),
    });
  }

  function handleSuccessfulLogin(result, payload, controls) {
    const redirectTo = resolvePostLoginPath(result, payload?.identifier || "");
    isNavigatingAway = true;

    persistLegacyUserInfo(result, payload?.identifier || "");
    syncUserStateAfterLogin(result, payload);
    setSubmitting(controls, true);

    navigateTo(redirectTo);
  }

  function handle2FARequired(result, controls) {
    const redirectTo = result?.redirectTo || "/2fa";
    isNavigatingAway = true;

    try {
      if (result?.tempToken) {
        localStorage.setItem("onion_temp_token", String(result.tempToken));
      }
    } catch (error) {
      AppCore.utils.error?.("No se pudo guardar el temp token 2FA", error);
    }

    AppCore.events.emit("login:2fa-required", {
      redirectTo,
      tempToken: result?.tempToken || null,
    });

    showToast({
      title: "Verificación adicional",
      message: "Se requiere una comprobación extra. Redirigiendo...",
      type: "info",
      duration: TWO_FA_TOAST_DURATION,
      persistent: false,
      closable: false,
    });

    setSubmitting(controls, true);
    navigateSoon(redirectTo, TWO_FA_TOAST_DURATION);
  }

  /* =========================================================
     TEMPLATE
  ========================================================= */
  function render() {
    const container = getContainer();

    if (!container) {
      AppCore.utils.warn(
        "LoginView: no se encontró #view-container para renderizar."
      );
      forceHideGlobalLoader();
      return;
    }

    isNavigatingAway = false;
    isSubmitting = false;

    destroyViewState({ preserveToast: false });
    restoreGlobalLoaderStyles();
    setAuthScreen(true);

    AppCore.clearDynamicContainers?.();
    AppCore.setDocumentTitle?.("Onion Support");

    const redirectPath = getCurrentRedirectPath();
    const appName = escapeHtml(AppCore?.config?.appName || "Onion Support");
    const appVersion = escapeHtml(AppCore?.config?.version || "1.0.0");
    const currentYear = new Date().getFullYear();

    container.innerHTML = `
      <section class="login-view login-view--clean" aria-label="Pantalla de acceso">
        <div class="login-toast-stack login-toast-stack--top-right" aria-live="polite" aria-atomic="true">
          <div
            id="loginToast"
            class="login-toast"
            role="status"
            aria-hidden="true"
            data-state="default"
            hidden
          >
            <div class="login-toast-glow" aria-hidden="true"></div>

            <div class="login-toast-body">
              <div id="loginToastIcon" class="login-toast-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path fill="currentColor" d="M11 7h2V5h-2v2Zm0 12h2V9h-2v10Zm1-17C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Z"/>
                </svg>
              </div>

              <div class="login-toast-content">
                <div id="loginToastTitle" class="login-toast-title">Aviso</div>
                <div id="loginToastText" class="login-toast-text"></div>
              </div>

              <button
                type="button"
                id="loginToastClose"
                class="login-toast-close"
                aria-label="Cerrar aviso"
                title="Cerrar aviso"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path fill="currentColor" d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.29 1.41 1.41 6.3-6.29 6.29 6.29 1.41-1.41-6.29-6.29 6.29-6.3-1.41-1.41Z"/>
                </svg>
              </button>
            </div>

            <span id="loginToastProgress" class="login-toast-progress" aria-hidden="true"></span>
          </div>
        </div>

        <div class="login-scene">
          <div class="login-grid login-grid--clean" id="loginGrid">
            <aside class="login-side login-side-left login-side-left--raised" aria-hidden="true">
              <div class="login-side-panel login-side-panel--status login-side-panel--compact">
                <div class="login-side-eyebrow">Entorno seguro</div>
                <h3>Tu acceso entra en un panel más vivo y con más presencia visual.</h3>

                <div class="login-signal-list">
                  <div class="login-signal-item">
                    <span class="dot"></span>
                    <span>Sesión cifrada</span>
                  </div>

                  <div class="login-signal-item">
                    <span class="dot"></span>
                    <span>Controles de acceso activos</span>
                  </div>

                  <div class="login-signal-item">
                    <span class="dot"></span>
                    <span>Shell SPA preparado</span>
                  </div>
                </div>
              </div>
            </aside>

            <div class="login-stage login-stage--right" id="loginStage">
              <div class="login-card-shell login-card-shell--right">
                <div class="login-card login-card--clean login-card--offset" id="loginCard">
                  <div class="login-header">
                    <div class="logo-fade" aria-hidden="true">
                      <img src="/src/media/img/favicon_black.png" alt="">
                      <img src="/src/media/img/favicon_black_circle.png" alt="">
                      <img src="/src/media/img/favicon_support.png" alt="">
                      <img src="/src/media/img/favicon_white.png" alt="">
                    </div>

                    <h2>Iniciar sesión con la cuenta ${appName}</h2>

                    <p class="login-subtitle">
                      Accede a tu espacio de soporte, incidencias y gestión interna.
                    </p>
                  </div>

                  <form id="loginForm" class="login-form" novalidate>
                    <input
                      type="hidden"
                      name="redirect"
                      value="${escapeHtml(redirectPath || "")}"
                    >

                    <div class="login-field">
                      <input
                        type="text"
                        id="username"
                        name="identifier"
                        class="input-text"
                        placeholder="Usuario o email"
                        autocomplete="username"
                        inputmode="email"
                        spellcheck="false"
                        autocapitalize="off"
                        required
                        aria-invalid="false"
                      >
                    </div>

                    <div class="login-field password-wrapper">
                      <input
                        type="password"
                        id="password"
                        name="password"
                        class="input-text"
                        placeholder="Contraseña"
                        autocomplete="current-password"
                        required
                        minlength="6"
                        aria-invalid="false"
                      >

                      <button
                        type="button"
                        class="password-toggle"
                        id="togglePassword"
                        aria-label="Mostrar contraseña"
                        aria-pressed="false"
                        title="Mostrar contraseña"
                      >
                        <svg
                          id="eyeOpenIcon"
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          aria-hidden="true"
                        >
                          <path
                            fill="currentColor"
                            d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"
                          />
                        </svg>

                        <svg
                          id="eyeClosedIcon"
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          aria-hidden="true"
                          hidden
                        >
                          <path
                            fill="currentColor"
                            d="M3.27 2 2 3.27l3.05 3.05C3.18 7.86 2 10 2 10s3 7 10 7c2.06 0 3.82-.6 5.3-1.48L20.73 19 22 17.73 3.27 2Zm8.77 8.77 2.19 2.19A3.96 3.96 0 0 1 12 13a4 4 0 0 1-4-4c0-.77.22-1.49.6-2.1l1.59 1.59A2 2 0 0 0 12 11c.01 0 .03 0 .04-.23ZM12 5c7 0 10 7 10 7a17.73 17.73 0 0 1-2.92 3.81l-1.42-1.42A15.1 15.1 0 0 0 19.82 12c-.87-1.28-3.35-4-7.82-4-.86 0-1.66.1-2.4.28L7.83 6.51C9.03 5.95 10.43 5.62 12 5Z"
                          />
                        </svg>
                      </button>

                      <div
                        id="capsIndicator"
                        class="caps-indicator"
                        aria-live="polite"
                        aria-atomic="true"
                        hidden
                      >
                        <svg
                          id="capsIcon"
                          class="caps-icon"
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          aria-hidden="true"
                          hidden
                        >
                          <path
                            fill="currentColor"
                            d="M12 3.2 18.8 10h-4.2v5.2h-5.2V10H5.2L12 3.2Zm-4.9 14h9.8a1.1 1.1 0 0 1 0 2.2H7.1a1.1 1.1 0 0 1 0-2.2Z"
                          />
                        </svg>

                        <span id="capsLabel" class="caps-label" hidden>
                          Bloq mayús
                        </span>
                      </div>
                    </div>

                    <div class="login-options">
                      <label class="login-check" for="loginRemember">
                        <input
                          id="loginRemember"
                          type="checkbox"
                          name="remember"
                        >
                        <span>Recordarme</span>
                      </label>

                      <span class="login-meta">Acceso seguro</span>
                    </div>

                    <button
                      type="submit"
                      class="login-button"
                      id="loginButton"
                    >
                      <span class="login-submit-text">Acceder</span>
                    </button>

                    <div class="login-reset">
                      <a href="/reset-password" id="forgotPasswordLink" data-spa>
                        ¿Has olvidado tu contraseña?
                      </a>
                    </div>
                  </form>

                  <div class="login-footer">
                    © ${currentYear} ${appName} · v${appVersion}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    forceHideGlobalLoader();
    bind();
  }

  /* =========================================================
     BIND
  ========================================================= */
  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const form = document.getElementById("loginForm");
    const card = document.getElementById("loginCard");
    const button = document.getElementById("loginButton");

    const identifierInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const rememberInput = document.getElementById("loginRemember");

    const toggleBtn = document.getElementById("togglePassword");
    const eyeOpenIcon = document.getElementById("eyeOpenIcon");
    const eyeClosedIcon = document.getElementById("eyeClosedIcon");

    const capsWrap = document.getElementById("capsIndicator");
    const capsIcon = document.getElementById("capsIcon");
    const capsLabel = document.getElementById("capsLabel");

    const forgotLink = document.getElementById("forgotPasswordLink");
    const toastClose = document.getElementById("loginToastClose");

    const logoContainer = document.querySelector(".logo-fade");
    const logoImages = logoContainer
      ? Array.from(logoContainer.querySelectorAll("img"))
      : [];

    if (!form || !identifierInput || !passwordInput || !button) {
      AppCore.utils.warn(
        "LoginView: faltan nodos críticos del formulario de acceso."
      );
      forceHideGlobalLoader();
      return;
    }

    let capsActive = false;
    let passwordFocused = false;

    const controls = {
      form,
      identifierInput,
      passwordInput,
      rememberInput,
      toggleBtn,
      submitBtn: button,
      forgotLink,
    };

    startLogoAnimation(logoImages);
    focusInitialField(identifierInput);
    updateCapsVisual(capsWrap, capsIcon, capsLabel, passwordFocused, capsActive);
    setSubmitting(controls, false);
    forceHideGlobalLoader();

    if (toastClose) {
      AppCore.cleanup.on(scope, toastClose, "click", () => {
        if (isSubmitting && isNavigatingAway) return;
        hideToast();
      });
    }

    if (toggleBtn) {
      AppCore.cleanup.on(scope, toggleBtn, "click", () => {
        if (isSubmitting) return;

        togglePasswordVisibility(
          passwordInput,
          toggleBtn,
          eyeOpenIcon,
          eyeClosedIcon
        );
      });
    }

    AppCore.cleanup.on(scope, identifierInput, "input", () => {
      setFieldError(identifierInput, false);
    });

    AppCore.cleanup.on(scope, passwordInput, "input", () => {
      setFieldError(passwordInput, false);
    });

    function updateCapsState(event) {
      if (!event?.getModifierState) return;

      const nextState = event.getModifierState("CapsLock");

      if (nextState !== capsActive) {
        capsActive = nextState;
        updateCapsVisual(
          capsWrap,
          capsIcon,
          capsLabel,
          passwordFocused,
          capsActive
        );
      }
    }

    AppCore.cleanup.on(scope, document, "keydown", updateCapsState);
    AppCore.cleanup.on(scope, document, "keyup", updateCapsState);

    AppCore.cleanup.on(scope, passwordInput, "focus", (event) => {
      passwordFocused = true;

      if (event?.getModifierState) {
        capsActive = event.getModifierState("CapsLock");
      }

      updateCapsVisual(
        capsWrap,
        capsIcon,
        capsLabel,
        passwordFocused,
        capsActive
      );
    });

    AppCore.cleanup.on(scope, passwordInput, "blur", () => {
      passwordFocused = false;
      updateCapsVisual(
        capsWrap,
        capsIcon,
        capsLabel,
        passwordFocused,
        capsActive
      );
    });

    AppCore.cleanup.on(scope, form, "submit", async (event) => {
      event.preventDefault();

      if (isSubmitting || isNavigatingAway) {
        return;
      }

      hideToast();
      clearFieldErrors([identifierInput, passwordInput]);

      const isValid = validate({
        identifierInput,
        passwordInput,
      });

      if (!isValid) {
        shakeCard(card);
        return;
      }

      const payload = getFormPayload({
        identifierInput,
        passwordInput,
        rememberInput,
        form,
      });

      setSubmitting(controls, true);

      showToast({
        title: LOGIN_LOADING_TOAST_TITLE,
        message: LOGIN_LOADING_TOAST_MESSAGE,
        type: "info",
        persistent: true,
        closable: false,
      });

      try {
        const result = await Auth.login({
          identifier: payload.identifier,
          password: payload.password,
          remember: payload.remember,
        });

        if (result?.requires2FA) {
          handle2FARequired(result, controls);
          return;
        }

        handleSuccessfulLogin(result, payload, controls);
      } catch (error) {
        const message = getErrorMessage(error);

        AppCore.utils.error?.("Login error", error);

        showErrorState({
          cardEl: card,
          identifierInput,
          passwordInput,
          message,
        });

        setSubmitting(controls, false);
        isNavigatingAway = false;
      }
    });

    AppCore.cleanup.event(scope, "auth:login:error", () => {
      if (isNavigatingAway) return;
      setSubmitting(controls, false);
    });

    AppCore.cleanup.event(scope, "router:before-render", ({ detail }) => {
      const nextPath = detail?.path || detail?.canonicalPath || "";

      if (nextPath && !String(nextPath).startsWith("/login")) {
        setAuthScreen(false);
      }
    });

    AppCore.cleanup.add(scope, () => {
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
  };
})();
