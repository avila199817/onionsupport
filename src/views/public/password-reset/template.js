/* =========================================================
   Onion Support - Password Reset Template
   Archivo: /src/views/public/password-reset/template.js

   Responsabilidad:
   - Construir únicamente el DOM del flujo público de recuperación.
   - Mantener los data-* consumidos por el controlador.
   - No exponer tokens en markup, inputs ni datasets.
   - Compartir el sistema visual del login sin añadir chrome innecesario.
========================================================= */

import { ROUTES } from "../../../core/config.js";

import {
  AUTH_PASSWORD_POLICY,
  AUTH_PASSWORD_POLICY_HELP,
} from "../../../features/auth/password-policy.js";

import {
  PUBLIC_AUTH_LOGO,
  PUBLIC_AUTH_LOGO_WEBP,
  escapeAttr,
  escapeHtml,
  renderPublicShell,
  safeAssetSrc,
  safeInternalHref,
} from "../index.js";

export const PASSWORD_RESET_TEMPLATE_VERSION =
  "password-reset.template.public.v4-minimal";

const APP_NAME = "Onion Support";
const LOGIN_HREF = ROUTES.login || "/login";
const MODE_REQUEST = "request";
const MODE_CONFIRM = "confirm";
const PASSWORD_MIN_LENGTH = AUTH_PASSWORD_POLICY.minLength;
const PASSWORD_MAX_LENGTH = AUTH_PASSWORD_POLICY.maxLength;
const PASSWORD_POLICY_ID = "password-reset-policy";

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

function renderMessage() {
  return `
    <p
      class="auth-message password-reset-message login-global-error"
      data-password-reset-message="true"
      data-reset-password-message="true"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      tabindex="-1"
      hidden
    ></p>
  `;
}

function renderHomeLogo() {
  const homeHref = safeInternalHref("/", "/");
  const logo = safeAssetSrc(PUBLIC_AUTH_LOGO, PUBLIC_AUTH_LOGO);
  const logoWebp = safeAssetSrc(PUBLIC_AUTH_LOGO_WEBP, PUBLIC_AUTH_LOGO_WEBP);

  return `
    <a
      class="login-card-logo-wrap auth-link"
      href="${escapeAttr(homeHref)}"
      data-spa="true"
      data-router-link="true"
      data-route="${escapeAttr(homeHref)}"
      aria-label="Ir al inicio de Onion Support"
    >
      <span class="login-card-logo-shell" aria-hidden="true">
        <picture>
          <source type="image/webp" srcset="${escapeAttr(logoWebp)}">
          <img
            class="login-card-logo"
            src="${escapeAttr(logo)}"
            alt=""
            width="72"
            height="72"
            loading="eager"
            decoding="async"
            draggable="false"
          >
        </picture>
      </span>
    </a>
  `;
}

function renderRequestField() {
  const id = "password-reset-identifier";
  const errorId = `${id}-error`;

  return `
    <div
      class="auth-field login-field password-reset-field password-reset-field-card login-field-card"
      data-password-reset-field="identifier"
    >
      <label class="auth-label login-label password-reset-label" for="${id}">
        Correo electrónico
      </label>

      <div class="login-input-shell">
        <span class="login-input-icon" aria-hidden="true">${renderIcon("user")}</span>
        <input
          class="auth-input login-input password-reset-input input-text"
          id="${id}"
          name="identifier"
          type="text"
          autocomplete="username"
          inputmode="email"
          placeholder="Pon tu correo"
          maxlength="320"
          required
          spellcheck="false"
          autocapitalize="none"
          enterkeyhint="send"
          aria-label="Correo electrónico"
          aria-invalid="false"
          aria-describedby="${errorId}"
          data-password-reset-input="identifier"
          data-password-reset-identifier="true"
        >
      </div>

      <p
        class="auth-field-error login-field-error password-reset-field-error"
        id="${errorId}"
        data-password-reset-error-for="identifier"
        data-reset-password-error-for="identifier"
        aria-live="polite"
        aria-atomic="true"
        hidden
      ></p>
    </div>
  `;
}

function renderPasswordField({
  id,
  name,
  label,
  placeholder,
  dataAttribute,
  errorFor,
  disabled = false,
} = {}) {
  const errorId = `${id}-error`;
  const capsId = `${id}-caps`;

  return `
    <div
      class="auth-field login-field password-reset-field password-reset-field-card login-field-card"
      data-password-reset-field="${escapeAttr(errorFor)}"
    >
      <label class="auth-label login-label password-label password-reset-label" for="${escapeAttr(id)}">
        ${escapeHtml(label)}
      </label>

      <div
        class="password-wrapper login-password-wrapper password-reset-password-wrapper login-input-shell"
        data-password-wrapper="true"
        data-password-reset-wrapper="${escapeAttr(errorFor)}"
      >
        <span class="login-input-icon" aria-hidden="true">${renderIcon("lock")}</span>

        <input
          class="auth-input login-input password-reset-input input-text"
          id="${escapeAttr(id)}"
          name="${escapeAttr(name)}"
          type="password"
          autocomplete="new-password"
          placeholder="${escapeAttr(placeholder)}"
          minlength="${PASSWORD_MIN_LENGTH}"
          maxlength="${PASSWORD_MAX_LENGTH}"
          required
          ${disabled ? "disabled" : ""}
          spellcheck="false"
          autocapitalize="none"
          enterkeyhint="${errorFor === "confirm-password" ? "done" : "next"}"
          aria-invalid="false"
          aria-describedby="${escapeAttr(`${PASSWORD_POLICY_ID} ${capsId} ${errorId}`)}"
          data-password-input="true"
          data-password-reset-input="${escapeAttr(errorFor)}"
          ${dataAttribute}
        >

        <button
          class="password-toggle login-password-toggle password-reset-password-toggle"
          type="button"
          ${disabled ? "disabled" : ""}
          aria-label="Mostrar contraseña"
          aria-controls="${escapeAttr(id)}"
          aria-pressed="false"
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
          <span class="caps-label" data-password-caps-label="true">Bloq Mayús</span>
        </span>
      </div>

      <p
        class="auth-field-error login-field-error password-reset-field-error"
        id="${escapeAttr(errorId)}"
        data-password-reset-error-for="${escapeAttr(errorFor)}"
        data-reset-password-error-for="${escapeAttr(errorFor)}"
        aria-live="polite"
        aria-atomic="true"
        hidden
      ></p>
    </div>
  `;
}

function renderConfirmFields({ tokenPresent = false } = {}) {
  return `
    <p
      class="auth-field-error login-field-error password-reset-field-error password-reset-token-error"
      id="password-reset-token-error"
      data-password-reset-error-for="token"
      data-reset-password-error-for="token"
      data-token-present="${tokenPresent ? "true" : "false"}"
      aria-live="polite"
      aria-atomic="true"
      hidden
    ></p>

    ${renderPasswordField({
      id: "password-reset-password",
      name: "password",
      label: "Nueva contraseña",
      placeholder: "Nueva contraseña",
      dataAttribute: 'data-password-reset-password="true"',
      errorFor: "password",
      disabled: !tokenPresent,
    })}

    ${renderPasswordField({
      id: "password-reset-confirm-password",
      name: "confirmPassword",
      label: "Repite la nueva contraseña",
      placeholder: "Repite la nueva contraseña",
      dataAttribute: 'data-password-reset-confirm="true"',
      errorFor: "confirm-password",
      disabled: !tokenPresent,
    })}

    <p
      class="auth-help password-reset-password-policy"
      id="${PASSWORD_POLICY_ID}"
      data-password-reset-policy="true"
    >
      ${escapeHtml(AUTH_PASSWORD_POLICY_HELP)}
    </p>
  `;
}

function renderBackLinks({ isConfirm = false } = {}) {
  const loginHref = safeInternalHref(LOGIN_HREF, "/login");
  const recoveryHref = safeInternalHref(
    ROUTES.passwordRequest || "/password-request",
    "/password-request"
  );

  return `
    <nav class="auth-links password-reset-links login-links" aria-label="Ayuda con el acceso">
      ${isConfirm ? `
        <a
          class="auth-link login-link password-reset-link password-reset-recovery-link"
          href="${escapeAttr(recoveryHref)}"
          data-spa="true"
          data-router-link="true"
          data-route="${escapeAttr(recoveryHref)}"
          data-password-reset-recovery="true"
        >Solicitar otro enlace</a>
      ` : ""}

      <a
        class="auth-link login-link password-reset-link"
        href="${escapeAttr(loginHref)}"
        data-spa="true"
        data-router-link="true"
        data-route="${escapeAttr(loginHref)}"
        data-password-reset-back="true"
      >Volver al acceso</a>
    </nav>
  `;
}

export function getPasswordResetTemplate(options = {}) {
  const mode = normalizeMode(options.mode);
  const isConfirm = mode === MODE_CONFIRM;
  const tokenPresent = options.tokenPresent === true;

  const title = isConfirm ? "Nueva contraseña" : "Recuperar acceso";
  const subtitle = isConfirm
    ? "Define una nueva contraseña para tu cuenta."
    : "Pon tu correo.";
  const submitLabel = isConfirm ? "Cambiar contraseña" : "Enviar enlace";
  const loadingLabel = isConfirm ? "Guardando contraseña…" : "Enviando enlace…";

  return renderPublicShell({
    view: isConfirm ? "password-reset" : "password-request",
    appName: APP_NAME,
    header: false,
    footer: false,
    ariaLabelledBy: "password-reset-title",
    body: `
      <section
        class="login-pro password-reset-pro"
        aria-labelledby="password-reset-title"
        data-password-reset-template-version="${escapeAttr(PASSWORD_RESET_TEMPLATE_VERSION)}"
        data-password-reset-mode="${escapeAttr(mode)}"
      >
        <section
          class="login-card-panel password-reset-card-panel"
          aria-labelledby="password-reset-title"
        >
          <div class="login-card-sheen" aria-hidden="true"></div>

          <header class="login-card-header password-reset-card-header">
            ${renderHomeLogo()}

            <h1 class="login-card-title password-reset-title" id="password-reset-title">
              ${escapeHtml(title)}
            </h1>

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
            ${isConfirm ? renderConfirmFields({ tokenPresent }) : renderRequestField()}

            <button
              class="auth-button auth-submit login-submit password-reset-submit"
              type="submit"
              ${isConfirm && !tokenPresent ? "disabled" : ""}
              data-password-reset-submit="true"
              data-reset-password-submit="true"
              data-default-text="${escapeAttr(submitLabel)}"
              data-loading-text="${escapeAttr(loadingLabel)}"
            >${escapeHtml(submitLabel)}</button>

            ${renderBackLinks({ isConfirm })}
          </form>

          ${!isConfirm ? `
            <button
              class="auth-link auth-retry-link"
              type="button"
              data-password-reset-retry="true"
              hidden
            >Usar otro correo</button>
          ` : ""}
        </section>
      </section>
    `,
  });
}

export function createPasswordResetTemplate(options = {}) {
  if (typeof document === "undefined") {
    throw new Error("[PasswordResetTemplate] document no disponible.");
  }

  const template = document.createElement("template");
  template.innerHTML = getPasswordResetTemplate(options).trim();

  const root = template.content.firstElementChild;

  if (!root) {
    throw new Error("[PasswordResetTemplate] no se pudo construir el DOM.");
  }

  return root;
}

export const PasswordResetTemplate = createPasswordResetTemplate;
export default createPasswordResetTemplate;
