/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/loginView.js

   Responsabilidades:
   - pintar pantalla de acceso
   - validar credenciales en cliente
   - enviar login a Auth
   - mostrar feedback visual de estado/error
   - exponer experiencia de login pro para la SPA
========================================================= */

import { AppCore } from "../core/core.js";
import { Auth } from "../features/auth.js";
import { Router } from "../router/router.js";

export const LoginView = (() => {
  "use strict";

  const SCOPE = "view:login";

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function getCurrentRedirectPath() {
    try {
      const url = new URL(window.location.href);
      const redirect = url.searchParams.get("redirect");
      return redirect ? AppCore.utils.normalizeCanonicalPath(redirect) : null;
    } catch {
      return null;
    }
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

  function normalizeIdentifier(value = "") {
    return String(value || "").trim();
  }

  function isEmail(value = "") {
    return /\S+@\S+\.\S+/.test(String(value || "").trim());
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

  function setSubmitting(controls, isSubmitting) {
    const {
      form,
      identifierInput,
      passwordInput,
      rememberInput,
      toggleBtn,
      submitBtn,
    } = controls;

    if (form) {
      form.setAttribute("aria-busy", String(Boolean(isSubmitting)));
    }

    if (identifierInput) identifierInput.disabled = Boolean(isSubmitting);
    if (passwordInput) passwordInput.disabled = Boolean(isSubmitting);
    if (rememberInput) rememberInput.disabled = Boolean(isSubmitting);
    if (toggleBtn) toggleBtn.disabled = Boolean(isSubmitting);

    if (submitBtn) {
      submitBtn.disabled = Boolean(isSubmitting);
      submitBtn.dataset.loading = String(Boolean(isSubmitting));
      submitBtn.innerHTML = isSubmitting
        ? `<span class="login-submit-text">Entrando...</span>`
        : `<span class="login-submit-text">Entrar</span>`;
    }
  }

  function getFormPayload(form) {
    const formData = new FormData(form);

    return {
      identifier: normalizeIdentifier(
        formData.get("identifier") ||
        formData.get("email") ||
        formData.get("username") ||
        ""
      ),
      password: String(formData.get("password") || "").trim(),
      remember:
        formData.get("remember") === "on" ||
        formData.get("remember") === "true",
    };
  }

  function validate({ identifierInput, passwordInput, feedbackEl }) {
    const identifier = normalizeIdentifier(identifierInput?.value || "");
    const password = String(passwordInput?.value || "").trim();

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
      setFeedback(
        feedbackEl,
        "El formato del email no es válido.",
        "error"
      );
      identifierInput?.focus();
      return false;
    }

    if (!password) {
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

  function togglePasswordVisibility(passwordInput, toggleBtn) {
    if (!passwordInput || !toggleBtn) return;

    const nextType = passwordInput.type === "password" ? "text" : "password";
    const isVisible = nextType === "text";

    passwordInput.type = nextType;

    toggleBtn.innerHTML = isVisible ? "🙈" : "👁️";
    toggleBtn.setAttribute(
      "aria-label",
      isVisible ? "Ocultar contraseña" : "Mostrar contraseña"
    );
    toggleBtn.setAttribute(
      "title",
      isVisible ? "Ocultar contraseña" : "Mostrar contraseña"
    );
    toggleBtn.setAttribute("aria-pressed", String(isVisible));
  }

  function focusInitialField(identifierInput) {
    window.setTimeout(() => {
      identifierInput?.focus();
      identifierInput?.select?.();
    }, 0);
  }

  /* =========================================================
     TEMPLATE
  ========================================================= */
  function render() {
    const container = getContainer();
    if (!container) return;

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Acceso");

    const redirectPath = getCurrentRedirectPath();

    container.innerHTML = `
      <section class="login-view">
        <div class="login-shell">
          <div class="login-card">
            <div class="login-brand">
              <div class="login-brand-mark-wrap">
                <div class="login-brand-mark" aria-hidden="true">ON</div>
              </div>

              <div class="login-brand-copy">
                <h1 class="login-title">Bienvenido</h1>
                <p class="login-subtitle">
                  Accede a tu espacio de trabajo en ${escapeHtml(AppCore.config.appName)}
                </p>
              </div>
            </div>

            <form id="login-form" class="login-form" novalidate>
              <input
                type="hidden"
                name="redirect"
                value="${escapeHtml(redirectPath || "")}"
              >

              <div class="login-field">
                <label for="login-identifier" class="login-label">
                  Email o usuario
                </label>

                <input
                  id="login-identifier"
                  class="login-input"
                  name="identifier"
                  type="text"
                  inputmode="email"
                  autocomplete="username"
                  placeholder="tu@email.com o tu_usuario"
                  required
                  aria-invalid="false"
                  spellcheck="false"
                  autocapitalize="off"
                >
              </div>

              <div class="login-field">
                <label for="login-password" class="login-label">Contraseña</label>

                <div class="login-input-wrap">
                  <input
                    id="login-password"
                    class="login-input login-password-input"
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    placeholder="••••••••"
                    required
                    minlength="6"
                    aria-invalid="false"
                  >

                  <button
                    type="button"
                    id="toggle-password"
                    class="login-password-toggle"
                    aria-label="Mostrar contraseña"
                    aria-pressed="false"
                    title="Mostrar contraseña"
                  >
                    👁️
                  </button>
                </div>
              </div>

              <div class="login-options">
                <label class="login-check">
                  <input id="login-remember" type="checkbox" name="remember">
                  <span>Recordarme</span>
                </label>

                <span class="login-meta">Acceso seguro</span>
              </div>

              <button
                type="submit"
                id="login-submit"
                class="login-submit"
              >
                <span class="login-submit-text">Entrar</span>
              </button>
            </form>

            <div
              id="login-feedback"
              class="login-feedback"
              data-state="default"
              aria-live="polite"
              hidden
            ></div>

            <div class="login-footer">
              <span><strong>${escapeHtml(AppCore.config.appName)}</strong></span>
              <span>v${escapeHtml(AppCore.config.version)}</span>
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

    const form = document.getElementById("login-form");
    const identifierInput = document.getElementById("login-identifier");
    const passwordInput = document.getElementById("login-password");
    const rememberInput = document.getElementById("login-remember");
    const togglePasswordBtn = document.getElementById("toggle-password");
    const submitBtn = document.getElementById("login-submit");
    const feedbackEl = document.getElementById("login-feedback");

    if (!form || !identifierInput || !passwordInput || !submitBtn || !feedbackEl) {
      return;
    }

    const controls = {
      form,
      identifierInput,
      passwordInput,
      rememberInput,
      toggleBtn: togglePasswordBtn,
      submitBtn,
    };

    if (togglePasswordBtn) {
      AppCore.cleanup.on(scope, togglePasswordBtn, "click", () => {
        togglePasswordVisibility(passwordInput, togglePasswordBtn);
      });
    }

    AppCore.cleanup.on(scope, identifierInput, "input", () => {
      setFieldError(identifierInput, false);

      if (feedbackEl.textContent) {
        setFeedback(feedbackEl, "", "default");
      }
    });

    AppCore.cleanup.on(scope, passwordInput, "input", () => {
      setFieldError(passwordInput, false);

      if (feedbackEl.textContent) {
        setFeedback(feedbackEl, "", "default");
      }
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

      if (!isValid) return;

      setSubmitting(controls, true);
      setFeedback(feedbackEl, "Validando acceso...", "info");

      try {
        const payload = getFormPayload(form);

        const result = await Auth.login({
          identifier: payload.identifier,
          email: payload.identifier,
          username: payload.identifier,
          password: payload.password,
          remember: payload.remember,
        });

        AppCore.syncUserUI();

        AppCore.events.emit("login:success", {
          user: result?.user || AppCore.state.user,
          redirectTo: getCurrentRedirectPath() || "/",
        });

        setFeedback(feedbackEl, "Acceso correcto. Redirigiendo...", "success");

        window.setTimeout(() => {
          Router.goAfterLogin("/");
        }, 180);
      } catch (error) {
        const message = getErrorMessage(error);

        setFieldError(identifierInput, true);
        setFieldError(passwordInput, true);
        setFeedback(feedbackEl, message, "error");

        AppCore.utils.error("Login error", error);

        window.setTimeout(() => {
          passwordInput?.focus();
          passwordInput?.select?.();
        }, 0);
      } finally {
        setSubmitting(controls, false);
      }
    });

    AppCore.cleanup.event(scope, "auth:login:error", () => {
      setSubmitting(controls, false);
    });

    focusInitialField(identifierInput);
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    render,
  };
})();