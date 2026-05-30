/* =========================================================
   Onion Support - Password Reset Template
   Archivo: /src/views/public/password-reset/template.js

   Responsabilidad:
   - Construir sólo el DOM/HTML de password reset público.
   - Usar el layout común de /src/views/public/index.js.
   - Modo request: usuario/email.
   - Modo confirm: nueva contraseña + confirmar contraseña.
   - Exponer data-* consumidos por index.js.
   - Sin Auth, Router, HTTP, Store, Toast, validación ni eventos.
   - Sin shared/password-field.
   - Sin exponer token sensible en markup.
========================================================= */

import {
  ROUTES,
  TOKEN_PARAM,
} from "../../../core/config.js";

import {
  escapeAttr,
  escapeHtml,
  renderPublicShell,
  safeInternalHref,
} from "../index.js";

export const PASSWORD_RESET_TEMPLATE_VERSION = "password-reset.template.public.v1";

const LOGIN_HREF = ROUTES.login || "/login";

const MODE_REQUEST = "request";
const MODE_CONFIRM = "confirm";

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

function normalizeMode(value = MODE_REQUEST) {
  return text(value, MODE_REQUEST).toLowerCase() === MODE_CONFIRM
    ? MODE_CONFIRM
    : MODE_REQUEST;
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
   PARTIALS
========================================================= */

function renderMessage() {
  return `
    <p
      class="auth-message password-reset-message"
      data-password-reset-message="true"
      data-reset-password-message="true"
      role="alert"
      aria-live="polite"
      hidden
    ></p>
  `;
}

function renderTextField({
  id,
  name,
  label,
  type = "text",
  autocomplete = "",
  placeholder = "",
  dataKey = "",
  errorFor = name,
} = {}) {
  return `
    <div
      class="auth-field password-reset-field password-reset-field-card"
      data-password-reset-field="${escapeAttr(errorFor)}"
    >
      <label
        class="auth-label password-reset-label"
        for="${escapeAttr(id)}"
      >
        ${escapeHtml(label)}
      </label>

      <input
        class="auth-input password-reset-input"
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
        data-password-reset-input="${escapeAttr(errorFor)}"
        ${dataFlag(dataKey)}
      >

      <p
        class="auth-field-error password-reset-field-error"
        id="${escapeAttr(id)}-error"
        data-password-reset-error-for="${escapeAttr(errorFor)}"
        data-reset-password-error-for="${escapeAttr(errorFor)}"
        aria-live="polite"
        hidden
      ></p>
    </div>
  `;
}

function renderRequestFields() {
  return `
    ${renderTextField({
      id: "password-reset-identifier",
      name: "identifier",
      label: "Usuario o email",
      type: "text",
      autocomplete: "username",
      placeholder: "Usuario o email",
      dataKey: "password-reset-identifier",
      errorFor: "identifier",
    })}
  `;
}

function renderConfirmFields({ tokenPresent = false } = {}) {
  return `
    <input
      id="password-reset-token"
      type="hidden"
      name="${escapeAttr(TOKEN_PARAM || "token")}"
      value=""
      autocomplete="off"
      data-password-reset-token="true"
      data-reset-token="true"
      data-token-present="${tokenPresent ? "true" : "false"}"
      aria-describedby="password-reset-token-error"
    >

    <p
      class="auth-field-error password-reset-field-error password-reset-token-error"
      id="password-reset-token-error"
      data-password-reset-error-for="token"
      data-reset-password-error-for="token"
      aria-live="polite"
      hidden
    ></p>

    ${renderTextField({
      id: "password-reset-password",
      name: "password",
      label: "Nueva contraseña",
      type: "password",
      autocomplete: "new-password",
      placeholder: "Nueva contraseña",
      dataKey: "password-reset-password",
      errorFor: "password",
    })}

    ${renderTextField({
      id: "password-reset-confirm-password",
      name: "confirmPassword",
      label: "Confirmar contraseña",
      type: "password",
      autocomplete: "new-password",
      placeholder: "Confirmar contraseña",
      dataKey: "password-reset-confirm",
      errorFor: "confirm-password",
    })}
  `;
}

function renderBackLink() {
  const loginHref = safeInternalHref(LOGIN_HREF, "/login");

  return `
    <p class="auth-links password-reset-links">
      <a
        class="auth-link password-reset-link"
        href="${escapeAttr(loginHref)}"
        data-spa="true"
        data-route="${escapeAttr(loginHref)}"
        data-password-reset-back="true"
      >
        Volver al acceso
      </a>
    </p>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getPasswordResetTemplate(options = {}) {
  const mode = normalizeMode(options.mode);
  const isConfirm = mode === MODE_CONFIRM;
  const tokenPresent = options.tokenPresent === true;

  const title = isConfirm ? "Nueva contraseña" : "Recuperar acceso";

  const subtitle = isConfirm
    ? "Define una nueva contraseña para tu cuenta."
    : "Introduce tu usuario o email y te enviaremos las instrucciones.";

  const submitLabel = isConfirm ? "Cambiar contraseña" : "Enviar enlace";
  const loadingLabel = isConfirm ? "Cambiando..." : "Enviando...";

  return renderPublicShell({
    view: "password-reset",
    title,
    subtitle,

    dataAttrs: {
      passwordResetMode: mode,
      resetPasswordMode: mode,
    },

    body: `
      <form
        class="auth-form password-reset-form"
        id="password-reset-form"
        autocomplete="on"
        novalidate
        data-password-reset-form="true"
        data-reset-password-form="true"
        data-password-reset-flow="${escapeAttr(mode)}"
        data-reset-password-flow="${escapeAttr(mode)}"
      >
        ${renderMessage()}

        ${
          isConfirm
            ? renderConfirmFields({ tokenPresent })
            : renderRequestFields()
        }

        <button
          class="auth-button auth-submit password-reset-submit"
          type="submit"
          data-password-reset-submit="true"
          data-reset-password-submit="true"
          data-default-text="${escapeAttr(submitLabel)}"
          data-loading-text="${escapeAttr(loadingLabel)}"
        >
          ${escapeHtml(submitLabel)}
        </button>

        ${renderBackLink()}
      </form>
    `,
  });
}

export function createPasswordResetTemplate(options = {}) {
  const template = document.createElement("template");

  template.innerHTML = getPasswordResetTemplate(options).trim();

  return template.content.firstElementChild;
}

export const PasswordResetTemplate = createPasswordResetTemplate;

export default createPasswordResetTemplate;
