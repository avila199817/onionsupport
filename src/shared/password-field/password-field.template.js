/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/login/template.js

   Responsabilidad:
   - Construir sólo el DOM del login.
   - Logo, usuario, contraseña, botón Entrar y recuperación.
   - Exponer data-* consumidos por index.js.
   - Sin Auth, Router, HTTP, Store, Toast, validación ni eventos.
========================================================= */

import { ROUTES } from "../../core/config.js";

import {
  escapeAttr,
  escapeHtml,
  renderAuthShell,
  safeInternalHref,
} from "../../shared/auth-template/index.js";

export const LOGIN_TEMPLATE_VERSION = "login.template.minimal.v1";

const PASSWORD_REQUEST_HREF = ROUTES.passwordRequest || "/password-request";

function field({
  id,
  name,
  label,
  type = "text",
  autocomplete = "",
  placeholder = "",
  dataKey = "",
} = {}) {
  return `
    <div
      class="auth-field login-field login-field-card"
      data-login-field="${escapeAttr(name)}"
    >
      <label
        class="auth-label login-label"
        for="${escapeAttr(id)}"
      >
        ${escapeHtml(label)}
      </label>

      <input
        class="auth-input login-input"
        id="${escapeAttr(id)}"
        name="${escapeAttr(name)}"
        type="${escapeAttr(type)}"
        autocomplete="${escapeAttr(autocomplete)}"
        placeholder="${escapeAttr(placeholder)}"
        required
        spellcheck="false"
        autocapitalize="none"
        aria-invalid="false"
        aria-describedby="${escapeAttr(id)}-error"
        data-login-input="${escapeAttr(name)}"
        data-${escapeAttr(dataKey)}="true"
      >

      <p
        class="auth-field-error login-field-error"
        id="${escapeAttr(id)}-error"
        data-login-error="${escapeAttr(name)}"
        aria-live="polite"
        hidden
      ></p>
    </div>
  `;
}

export function getLoginTemplate() {
  const forgotHref = safeInternalHref(PASSWORD_REQUEST_HREF, "/password-request");

  return renderAuthShell({
    view: "login",
    title: "Acceso",
    subtitle: "Entra en tu panel de Onion Support.",

    body: `
      <p
        class="auth-error login-global-error"
        data-login-global-error="true"
        role="alert"
        aria-live="polite"
        hidden
      ></p>

      <form
        class="auth-form login-form"
        id="login-form"
        autocomplete="on"
        novalidate
        data-login-form="true"
      >
        ${field({
          id: "login-identifier",
          name: "identifier",
          label: "Usuario o email",
          type: "text",
          autocomplete: "username",
          placeholder: "Usuario o email",
          dataKey: "login-identifier",
        })}

        ${field({
          id: "login-password",
          name: "password",
          label: "Contraseña",
          type: "password",
          autocomplete: "current-password",
          placeholder: "Contraseña",
          dataKey: "login-password",
        })}

        <button
          class="auth-button auth-submit login-submit"
          type="submit"
          data-login-submit="true"
          data-default-text="Entrar"
          data-loading-text="Accediendo..."
        >
          Entrar
        </button>

        <p class="auth-links login-links">
          <a
            class="auth-link login-link"
            href="${escapeAttr(forgotHref)}"
            data-spa="true"
            data-route="${escapeAttr(forgotHref)}"
            data-login-forgot-password="true"
          >
            ¿Has olvidado tu contraseña?
          </a>
        </p>
      </form>
    `,
  });
}

export function createLoginTemplate() {
  const template = document.createElement("template");
  template.innerHTML = getLoginTemplate().trim();

  return template.content.firstElementChild;
}

export default createLoginTemplate;
