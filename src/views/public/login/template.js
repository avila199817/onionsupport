/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/public/login/template.js

   Responsabilidad:
   - Construir sólo el DOM/HTML del login público.
   - Usar el layout común de /src/views/public/index.js.
   - Pintar usuario/email, contraseña, botón Entrar y recuperación.
   - Exponer data-* consumidos por index.js.
   - Sin Auth, Router, HTTP, Store, Toast, validación ni eventos.
========================================================= */

import { ROUTES } from "../../../core/config.js";

import {
  escapeAttr,
  escapeHtml,
  renderPublicShell,
  safeInternalHref,
} from "../index.js";

export const LOGIN_TEMPLATE_VERSION = "login.template.public.v1";

const PASSWORD_REQUEST_HREF = ROUTES.passwordRequest || "/password-request";

/* =========================================================
   BASICS
========================================================= */

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function dataFlag(name = "") {
  const clean = text(name, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clean ? `data-${escapeAttr(clean)}="true"` : "";
}

/* =========================================================
   FIELD
========================================================= */

function renderField({
  id,
  name,
  label,
  type = "text",
  autocomplete = "",
  placeholder = "",
  dataKey = "",
} = {}) {
  const cleanId = text(id, "");
  const cleanName = text(name, "");
  const cleanLabel = text(label, cleanName);
  const cleanType = text(type, "text");
  const cleanAutocomplete = text(autocomplete, "");
  const cleanPlaceholder = text(placeholder, cleanLabel);

  return `
    <div
      class="auth-field login-field login-field-card"
      data-login-field="${escapeAttr(cleanName)}"
    >
      <label
        class="auth-label login-label"
        for="${escapeAttr(cleanId)}"
      >
        ${escapeHtml(cleanLabel)}
      </label>

      <input
        class="auth-input login-input"
        id="${escapeAttr(cleanId)}"
        name="${escapeAttr(cleanName)}"
        type="${escapeAttr(cleanType)}"
        autocomplete="${escapeAttr(cleanAutocomplete)}"
        placeholder="${escapeAttr(cleanPlaceholder)}"
        required
        spellcheck="false"
        autocapitalize="none"
        aria-invalid="false"
        aria-describedby="${escapeAttr(cleanId)}-error"
        data-login-input="${escapeAttr(cleanName)}"
        ${dataFlag(dataKey)}
      >

      <p
        class="auth-field-error login-field-error"
        id="${escapeAttr(cleanId)}-error"
        data-login-error="${escapeAttr(cleanName)}"
        aria-live="polite"
        hidden
      ></p>
    </div>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getLoginTemplate() {
  const forgotHref = safeInternalHref(
    PASSWORD_REQUEST_HREF,
    "/password-request"
  );

  return renderPublicShell({
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
        ${renderField({
          id: "login-identifier",
          name: "identifier",
          label: "Usuario o email",
          type: "text",
          autocomplete: "username",
          placeholder: "Usuario o email",
          dataKey: "login-identifier",
        })}

        ${renderField({
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
