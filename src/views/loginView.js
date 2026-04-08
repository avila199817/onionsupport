/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/loginView.js

   Responsabilidades:
   - pintar pantalla de acceso
   - activar modo fullscreen auth
   - validar credenciales en cliente
   - enviar login a Auth
   - mostrar feedback visual de estado/error
   - soportar login con username o email
   - soportar flujo opcional 2FA
   - redirigir correctamente tras login
   - evitar pérdida de valores al deshabilitar inputs
   - respetar logo animado
   - soportar caps lock indicator
   - soportar toggle password tipo eye
   - login limpio sin imagen lateral
========================================================= */

import { AppCore } from "../core/core.js";
import { Auth } from "../features/auth.js";
import { Router } from "../router/router.js";

export const LoginView = (() => {
  "use strict";

  const SCOPE = "view:login";
  const LOGO_ROTATE_INTERVAL = 3000;
  const LOGO_FADE_DURATION = 1800;
  const SUCCESS_REDIRECT_DELAY = 220;

  let logoIntervalId = null;

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function normalizeIdentifier(value = "") {
    return String(value || "").trim();
  }

  function isEmail(value = "") {
    return /\S+@\S+\.\S+/.test(String(value || "").trim());
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

  function setAuthScreen(active) {
    document.body.classList.toggle("auth-screen", Boolean(active));
  }

  function setFeedback(feedbackEl, message = "", type = "default") {
    if (!feedbackEl) return;

    feedbackEl.textContent = message || "";
    feedbackEl.dataset.state = type || "default";
    feedbackEl.hidden = !message;
  }

  function setFieldError(input, active = false) {
    if (!input) return;

    input.setAttribute("aria-invalid", active ? "true" : "false");
    input.classList.toggle("is-invalid", Boolean(active));
  }

  function clearFieldErrors(inputs = []) {
    inputs.forEach((input) => setFieldError(input, false));
  }

  function focusInitialField(identifierInput) {
    window.setTimeout(() => {
      identifierInput?.focus();
      identifierInput?.select?.();
    }, 0);
  }

  function clearLoginScope() {
    stopLogoAnimation();
    AppCore.cleanup.run(SCOPE);
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

  function setSubmitting(controls, isSubmitting) {
    const {
      form,
      identifierInput,
      passwordInput,
      rememberInput,
      toggleBtn,
      submitBtn,
      forgotLink,
    } = controls;

    const submitting = Boolean(isSubmitting);

    if (form) {
      form.setAttribute("aria-busy", String(submitting));
    }

    if (identifierInput) identifierInput.disabled = submitting;
    if (passwordInput) passwordInput.disabled = submitting;
    if (rememberInput) rememberInput.disabled = submitting;
    if (toggleBtn) toggleBtn.disabled = submitting;

    if (forgotLink) {
      forgotLink.setAttribute("aria-disabled", String(submitting));
      forgotLink.classList.toggle("is-disabled", submitting);
      forgotLink.tabIndex = submitting ? -1 : 0;
    }

    if (submitBtn) {
      submitBtn.disabled = submitting;
      submitBtn.dataset.loading = String(submitting);
      submitBtn.innerHTML = submitting
        ? `<span class="login-submit-text">Accediendo...</span>`
        : `<span class="login-submit-text">Acceder</span>`;
    }
  }

  /* =========================================================
     FEEDBACK UX
  ========================================================= */
  function shakeCard(cardEl) {
    if (!cardEl) return;

    cardEl.classList.remove("shake");
    void cardEl.offsetWidth;
    cardEl.classList.add("shake");
  }

  function showErrorState({
    cardEl,
    feedbackEl,
    identifierInput,
    passwordInput,
    message,
  }) {
    setFieldError(identifierInput, true);
    setFieldError(passwordInput, true);
    setFeedback(feedbackEl, message, "error");
    shakeCard(cardEl);

    window.setTimeout(() => {
      passwordInput?.focus();
      passwordInput?.select?.();
    }, 0);
  }

  /* =========================================================
     LECTURA ROBUSTA DEL FORM
     IMPORTANTE:
     No usamos FormData después de deshabilitar inputs.
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

  function validate({ identifierInput, passwordInput, feedbackEl }) {
    const identifier = normalizeIdentifier(identifierInput?.value || "");
    const password = String(passwordInput?.value || "");

    clearFieldErrors([identifierInput, passwordInput]);

    if (!identifier) {
      setFieldError(identifierInput, true);
      setFeedback(
        feedbackEl,
        "Introduce tu email o nombre de usuario.",
        "error"
      );
      identifierInput?.focus();
      return false;
    }

    if (identifier.includes("@") && !isEmail(identifier)) {
      setFieldError(identifierInput, true);
      setFeedback(feedbackEl, "El formato del email no es válido.", "error");
      identifierInput?.focus();
      return false;
    }

    if (!password.trim()) {
      setFieldError(passwordInput, true);
      setFeedback(feedbackEl, "Introduce tu contraseña.", "error");
      passwordInput?.focus();
      return false;
    }

    if (password.length < 6) {
      setFieldError(passwordInput, true);
      setFeedback(
        feedbackEl,
        "La contraseña debe tener al menos 6 caracteres.",
        "error"
      );
      passwordInput?.focus();
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
  function updateCapsVisual(capsIcon, passwordFocused, capsActive) {
    if (!capsIcon) return;
    capsIcon.hidden = !(passwordFocused && capsActive);
  }

  /* =========================================================
     LOGO FADE
  ========================================================= */
  function stopLogoAnimation() {
    if (logoIntervalId) {
      window.clearInterval(logoIntervalId);
      logoIntervalId = null;
    }
  }

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

  function handleSuccessfulLogin(result, feedbackEl, payload) {
    const redirectTo = resolvePostLoginPath(result, payload?.identifier || "");

    persistLegacyUserInfo(result, payload?.identifier || "");
    AppCore.syncUserUI?.();

    AppCore.events.emit("login:success", {
      user: result?.user || AppCore.state.user || null,
      redirectTo,
    });

    setFeedback(feedbackEl, "Acceso correcto. Redirigiendo...", "success");

    window.setTimeout(() => {
      if (typeof Router.goAfterLogin === "function") {
        Router.goAfterLogin(redirectTo);
        return;
      }

      if (typeof Router.navigate === "function") {
        Router.navigate(redirectTo, {
          replaceState: true,
          force: true,
        });
        return;
      }

      window.location.href = redirectTo;
    }, SUCCESS_REDIRECT_DELAY);
  }

  function handle2FARequired(result, feedbackEl) {
    const redirectTo = result?.redirectTo || "/2fa";

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

    setFeedback(
      feedbackEl,
      "Verificación adicional requerida. Redirigiendo...",
      "info"
    );

    window.setTimeout(() => {
      if (typeof Router.navigate === "function") {
        Router.navigate(redirectTo, {
          replaceState: true,
          force: true,
        });
        return;
      }

      window.location.href = redirectTo;
    }, SUCCESS_REDIRECT_DELAY);
  }

  /* =========================================================
     TEMPLATE
  ========================================================= */
  function render() {
    const container = getContainer();
    if (!container) return;

    clearLoginScope();
    setAuthScreen(true);

    AppCore.clearDynamicContainers?.();
    AppCore.setDocumentTitle?.("Acceso");

    const redirectPath = getCurrentRedirectPath();

    container.innerHTML = `
      <section class="login-view">
        <a href="/" class="back-arrow" aria-label="Volver al inicio" data-spa></a>

        <div class="login-wrapper">
          <div class="login-card" id="loginCard">
            <div class="login-header">
              <div class="logo-fade" aria-hidden="true">
                <img src="/src/media/img/favicon_black.png" alt="">
                <img src="/src/media/img/favicon_black_circle.png" alt="">
                <img src="/src/media/img/favicon_support.png" alt="">
                <img src="/src/media/img/favicon_white.png" alt="">
              </div>

              <h2>Iniciar sesión con la cuenta ${escapeHtml(
                AppCore.config.appName
              )}</h2>
            </div>

            <form id="loginForm" class="login-form" novalidate>
              <input
                type="hidden"
                name="redirect"
                value="${escapeHtml(redirectPath || "")}"
              >

              <div
                class="login-error"
                id="loginError"
                role="alert"
                aria-live="polite"
                data-state="default"
                hidden
              ></div>

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
                    d="M12 3l6 6h-4v6h-4V9H6l6-6zM6 19h12v2H6z"
                  />
                </svg>
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
              © ${new Date().getFullYear()} ${escapeHtml(
                AppCore.config.appName
              )} · v${escapeHtml(AppCore.config.version)}
            </div>
          </div>
        </div>
      </section>
    `;

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
    const feedbackEl = document.getElementById("loginError");

    const identifierInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const rememberInput = document.getElementById("loginRemember");

    const toggleBtn = document.getElementById("togglePassword");
    const eyeOpenIcon = document.getElementById("eyeOpenIcon");
    const eyeClosedIcon = document.getElementById("eyeClosedIcon");
    const capsIcon = document.getElementById("capsIcon");
    const forgotLink = document.getElementById("forgotPasswordLink");

    const logoContainer = document.querySelector(".logo-fade");
    const logoImages = logoContainer
      ? Array.from(logoContainer.querySelectorAll("img"))
      : [];

    if (!form || !identifierInput || !passwordInput || !button || !feedbackEl) {
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
    updateCapsVisual(capsIcon, passwordFocused, capsActive);

    if (toggleBtn) {
      AppCore.cleanup.on(scope, toggleBtn, "click", () => {
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

      if (!feedbackEl.hidden) {
        setFeedback(feedbackEl, "", "default");
      }
    });

    AppCore.cleanup.on(scope, passwordInput, "input", () => {
      setFieldError(passwordInput, false);

      if (!feedbackEl.hidden) {
        setFeedback(feedbackEl, "", "default");
      }
    });

    function updateCapsState(event) {
      if (!event?.getModifierState) return;

      const nextState = event.getModifierState("CapsLock");
      if (nextState !== capsActive) {
        capsActive = nextState;
        updateCapsVisual(capsIcon, passwordFocused, capsActive);
      }
    }

    AppCore.cleanup.on(scope, document, "keydown", updateCapsState);
    AppCore.cleanup.on(scope, document, "keyup", updateCapsState);

    AppCore.cleanup.on(scope, passwordInput, "focus", () => {
      passwordFocused = true;
      updateCapsVisual(capsIcon, passwordFocused, capsActive);
    });

    AppCore.cleanup.on(scope, passwordInput, "blur", () => {
      passwordFocused = false;
      updateCapsVisual(capsIcon, passwordFocused, capsActive);
    });

    AppCore.cleanup.on(scope, form, "submit", async (event) => {
      event.preventDefault();

      setFeedback(feedbackEl, "", "default");
      clearFieldErrors([identifierInput, passwordInput]);

      const isValid = validate({
        identifierInput,
        passwordInput,
        feedbackEl,
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
      setFeedback(feedbackEl, "Validando acceso...", "info");

      try {
        const result = await Auth.login({
          identifier: payload.identifier,
          password: payload.password,
          remember: payload.remember,
        });

        if (result?.requires2FA) {
          handle2FARequired(result, feedbackEl);
          return;
        }

        handleSuccessfulLogin(result, feedbackEl, payload);
      } catch (error) {
        const message = getErrorMessage(error);

        AppCore.utils.error?.("Login error", error);

        showErrorState({
          cardEl: card,
          feedbackEl,
          identifierInput,
          passwordInput,
          message,
        });
      } finally {
        setSubmitting(controls, false);
      }
    });

    AppCore.cleanup.event(scope, "auth:login:error", () => {
      setSubmitting(controls, false);
    });

    AppCore.cleanup.event(scope, "router:before-render", ({ detail }) => {
      const nextPath = detail?.path || detail?.canonicalPath || "";

      if (nextPath && nextPath !== "/login") {
        setAuthScreen(false);
      }
    });

    AppCore.cleanup.add?.(scope, () => {
      stopLogoAnimation();
      setAuthScreen(false);
    });
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    render,
  };
})();
