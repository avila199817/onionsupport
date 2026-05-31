/* =========================================================
   Onion Support - Password Reset Template
   Archivo: /src/views/public/password-reset/template.js

   Responsabilidad:
   - Construir sólo el DOM/HTML de password reset público.
   - Usar el layout común de /src/views/public/index.js.
   - Modo request: usuario/email.
   - Modo confirm: nueva contraseña + confirmar contraseña.
   - Exponer data-* consumidos por index.js.
   - Exponer contrato DOM data-password-*.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin Toast.
   - Sin validación.
   - Sin eventos.
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

export const PASSWORD_RESET_TEMPLATE_VERSION = "password-reset.template.public.v2";

const APP_NAME = "Onion Support";
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
   ICONS
========================================================= */

function renderIcon(name = "") {
  const icons = {
    user: `
      <svg class="login-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 12.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z"></path>
        <path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0"></path>
      </svg>
    `,

    lock: `
      <svg class="login-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7.75 10.25V8a4.25 4.25 0 0 1 8.5 0v2.25"></path>
        <path d="M6.75 10.25h10.5a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5Z"></path>
        <path d="M12 15.25v1.5"></path>
      </svg>
    `,

    eye: `
      <svg class="password-eye-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M2.75 12s3.25-6.25 9.25-6.25S21.25 12 21.25 12 18 18.25 12 18.25 2.75 12 2.75 12Z"></path>
        <path d="M12 14.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z"></path>
      </svg>
    `,

    eyeOff: `
      <svg class="password-eye-off-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" hidden>
        <path d="m3.75 3.75 16.5 16.5"></path>
        <path d="M9.9 5.98A9.24 9.24 0 0 1 12 5.75c6 0 9.25 6.25 9.25 6.25a17.03 17.03 0 0 1-2.28 3.1"></path>
        <path d="M14.12 14.12A2.75 2.75 0 0 1 9.88 9.88"></path>
        <path d="M6.6 7.6A16.35 16.35 0 0 0 2.75 12S6 18.25 12 18.25c1.35 0 2.57-.32 3.65-.82"></path>
      </svg>
    `,

    caps: `
      <svg class="caps-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.75 5.25 10.5h4v5h5.5v-5h4L12 3.75Z"></path>
        <path d="M7.75 20.25h8.5"></path>
      </svg>
    `,
  };

  return icons[name] || "";
}

/* =========================================================
   PARTIALS
========================================================= */

function renderMessage() {
  return `
    <p
      class="auth-message password-reset-message login-global-error"
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
  icon = "user",
  dataKey = "",
  errorFor = name,
} = {}) {
  return `
    <div
      class="auth-field login-field password-reset-field password-reset-field-card login-field-card"
      data-password-reset-field="${escapeAttr(errorFor)}"
    >
      <div class="login-field-head">
        <label
          class="auth-label login-label password-reset-label"
          for="${escapeAttr(id)}"
        >
          ${escapeHtml(label)}
        </label>
      </div>

      <div class="login-input-shell">
        <span class="login-input-icon" aria-hidden="true">
          ${renderIcon(icon)}
        </span>

        <input
          class="auth-input login-input password-reset-input input-text"
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
      </div>

      <p
        class="auth-field-error login-field-error password-reset-field-error"
        id="${escapeAttr(id)}-error"
        data-password-reset-error-for="${escapeAttr(errorFor)}"
        data-reset-password-error-for="${escapeAttr(errorFor)}"
        aria-live="polite"
        hidden
      ></p>
    </div>
  `;
}

function renderPasswordField({
  id,
  name,
  label,
  placeholder = "",
  dataKey = "",
  errorFor = name,
  autocomplete = "new-password",
} = {}) {
  const errorId = `${id}-error`;
  const capsId = `${id}-caps`;

  return `
    <div
      class="auth-field login-field password-reset-field password-reset-field-card login-field-card"
      data-password-reset-field="${escapeAttr(errorFor)}"
    >
      <div class="login-field-head">
        <label
          class="auth-label login-label password-label password-reset-label"
          for="${escapeAttr(id)}"
        >
          ${escapeHtml(label)}
        </label>
      </div>

      <div
        class="password-wrapper login-password-wrapper password-reset-password-wrapper login-input-shell"
        data-password-wrapper="true"
        data-password-reset-wrapper="${escapeAttr(errorFor)}"
      >
        <span class="login-input-icon" aria-hidden="true">
          ${renderIcon("lock")}
        </span>

        <input
          class="auth-input login-input password-reset-input input-text"
          id="${escapeAttr(id)}"
          name="${escapeAttr(name)}"
          type="password"
          autocomplete="${escapeAttr(autocomplete)}"
          placeholder="${escapeAttr(placeholder)}"
          required
          spellcheck="false"
          autocapitalize="none"
          aria-invalid="false"
          aria-describedby="${escapeAttr(`${capsId} ${errorId}`)}"
          data-password-input="true"
          data-password-reset-input="${escapeAttr(errorFor)}"
          ${dataFlag(dataKey)}
        >

        <button
          class="password-toggle login-password-toggle password-reset-password-toggle"
          type="button"
          aria-label="Mostrar contraseña"
          aria-controls="${escapeAttr(id)}"
          aria-pressed="false"
          tabindex="0"
          data-password-toggle="true"
          data-reset-password-toggle="true"
          data-password-reset-toggle="${escapeAttr(errorFor)}"
        >
          <span class="password-toggle-icon" data-password-toggle-icon="true">
            ${renderIcon("eye")}
            ${renderIcon("eyeOff")}
          </span>
        </button>

        <span
          class="password-caps"
          id="${escapeAttr(capsId)}"
          role="status"
          aria-live="polite"
          data-password-caps="true"
          hidden
        >
          <span class="caps-icon" data-password-caps-icon-wrapper="true" aria-hidden="true">
            ${renderIcon("caps")}
          </span>

          <span class="caps-label" data-password-caps-label="true">
            Bloq Mayús
          </span>
        </span>
      </div>

      <p
        class="auth-field-error login-field-error password-reset-field-error"
        id="${escapeAttr(errorId)}"
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
      placeholder: "usuario@empresa.com",
      icon: "user",
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
      class="auth-field-error login-field-error password-reset-field-error password-reset-token-error"
      id="password-reset-token-error"
      data-password-reset-error-for="token"
      data-reset-password-error-for="token"
      aria-live="polite"
      hidden
    ></p>

    ${renderPasswordField({
      id: "password-reset-password",
      name: "password",
      label: "Nueva contraseña",
      autocomplete: "new-password",
      placeholder: "Nueva contraseña",
      dataKey: "password-reset-password",
      errorFor: "password",
    })}

    ${renderPasswordField({
      id: "password-reset-confirm-password",
      name: "confirmPassword",
      label: "Confirmar contraseña",
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
    <p class="auth-links password-reset-links login-links">
      <a
        class="auth-link login-link password-reset-link"
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
    view: isConfirm ? "password-reset" : "password-request",
    appName: APP_NAME,
    header: false,
    ariaLabelledBy: "password-reset-title",

    body: `
      <section
        class="login-pro password-reset-pro"
        aria-labelledby="password-reset-title"
        data-password-reset-template-version="${escapeAttr(PASSWORD_RESET_TEMPLATE_VERSION)}"
        data-password-reset-mode="${escapeAttr(mode)}"
      >
        <div class="login-orb login-orb-primary" aria-hidden="true"></div>
        <div class="login-orb login-orb-secondary" aria-hidden="true"></div>
        <div class="login-grid-glow" aria-hidden="true"></div>

        <section
          class="login-card-panel password-reset-card-panel"
          aria-labelledby="password-reset-title"
        >
          <div class="login-card-sheen" aria-hidden="true"></div>

          <header class="login-card-header password-reset-card-header">
            <h2
              class="login-card-title password-reset-title"
              id="password-reset-title"
            >
              ${escapeHtml(title)}
            </h2>

            <p class="login-card-subtitle password-reset-subtitle">
              ${escapeHtml(subtitle)}
            </p>
          </header>

          ${renderMessage()}

          <form
            class="auth-form login-form password-reset-form"
            id="password-reset-form"
            autocomplete="on"
            novalidate
            data-password-reset-form="true"
            data-reset-password-form="true"
            data-password-reset-flow="${escapeAttr(mode)}"
            data-reset-password-flow="${escapeAttr(mode)}"
          >
            ${
              isConfirm
                ? renderConfirmFields({ tokenPresent })
                : renderRequestFields()
            }

            <button
              class="auth-button auth-submit login-submit password-reset-submit"
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
        </section>
      </section>
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
