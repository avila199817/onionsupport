/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/public/login/template.js

   Responsabilidad:
   - Construir sólo el DOM/HTML del login público.
   - Usar el layout común de /src/views/public/index.js.
   - Pintar usuario/email, contraseña, botón Entrar y recuperación.
   - Exponer data-* consumidos por index.js.
   - Exponer contrato DOM data-password-* para password controls.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin Toast.
   - Sin validación.
   - Sin eventos.
   - Sin imports inexistentes del shared password.
========================================================= */

import { ROUTES } from "../../../core/config.js";

import {
  PUBLIC_AUTH_LOGO,
  escapeAttr,
  escapeHtml,
  renderPublicShell,
  safeAssetSrc,
  safeInternalHref,
} from "../index.js";

export const LOGIN_TEMPLATE_VERSION = "login.template.public.v5";

const APP_NAME = "Onion Support";
const PASSWORD_REQUEST_HREF = ROUTES.passwordRequest || "/password-request";

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PASSWORD_LENGTH = 1024;

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
   LOGO
========================================================= */

function renderLoginLogo() {
  const logoSrc = safeAssetSrc(PUBLIC_AUTH_LOGO, PUBLIC_AUTH_LOGO);

  return `
    <div class="login-card-logo-wrap" aria-label="${escapeAttr(APP_NAME)}">
      <span class="login-card-logo-shell" aria-hidden="true">
        <img
          class="login-card-logo"
          src="${escapeAttr(logoSrc)}"
          alt=""
          width="96"
          height="96"
          loading="eager"
          decoding="async"
          draggable="false"
        >
      </span>
    </div>
  `;
}

/* =========================================================
   FIELD
========================================================= */

function renderIdentifierField({
  id,
  name,
  label,
  autocomplete = "",
  placeholder = "",
  icon = "user",
  dataKey = "",
  enterKeyHint = "",
} = {}) {
  const cleanId = text(id, "");
  const cleanName = text(name, "");
  const cleanLabel = text(label, cleanName);
  const cleanAutocomplete = text(autocomplete, "");
  const cleanPlaceholder = text(placeholder, cleanLabel);
  const cleanEnterKeyHint = text(enterKeyHint, "");

  return `
    <div
      class="auth-field login-field login-field-card login-field--identifier login-field--no-label"
      data-login-field="${escapeAttr(cleanName)}"
    >
      <div class="login-input-shell">
        <span class="login-input-icon" aria-hidden="true">
          ${renderIcon(icon)}
        </span>

        <input
          class="auth-input login-input input-text"
          id="${escapeAttr(cleanId)}"
          name="${escapeAttr(cleanName)}"
          type="text"
          autocomplete="${escapeAttr(cleanAutocomplete)}"
          inputmode="text"
          placeholder="${escapeAttr(cleanPlaceholder)}"
          maxlength="${escapeAttr(MAX_IDENTIFIER_LENGTH)}"
          required
          spellcheck="false"
          autocapitalize="none"
          aria-label="${escapeAttr(cleanLabel)}"
          aria-invalid="false"
          aria-describedby="${escapeAttr(cleanId)}-error"
          ${cleanEnterKeyHint ? `enterkeyhint="${escapeAttr(cleanEnterKeyHint)}"` : ""}
          data-login-input="${escapeAttr(cleanName)}"
          ${dataFlag(dataKey)}
        >
      </div>

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

function renderPasswordField() {
  const id = "login-password";
  const errorId = `${id}-error`;
  const capsId = `${id}-caps`;

  return `
    <div
      class="auth-field login-field login-field-card login-field--password login-field--no-label"
      data-login-field="password"
      data-login-password-field="true"
      data-password-field="true"
    >
      <div
        class="password-wrapper login-password-wrapper login-input-shell"
        data-password-wrapper="true"
      >
        <span class="login-input-icon" aria-hidden="true">
          ${renderIcon("lock")}
        </span>

        <input
          class="auth-input login-input input-text"
          id="${escapeAttr(id)}"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="Introduce tu contraseña"
          maxlength="${escapeAttr(MAX_PASSWORD_LENGTH)}"
          required
          spellcheck="false"
          autocapitalize="none"
          aria-label="Contraseña"
          aria-invalid="false"
          aria-describedby="${escapeAttr(`${capsId} ${errorId}`)}"
          enterkeyhint="go"
          data-login-input="password"
          data-login-password="true"
          data-password-input="true"
        >

        <button
          class="password-toggle login-password-toggle"
          type="button"
          aria-label="Mostrar contraseña"
          aria-controls="${escapeAttr(id)}"
          aria-pressed="false"
          tabindex="0"
          data-password-toggle="true"
          data-login-password-toggle="true"
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
        class="auth-field-error login-field-error"
        id="${escapeAttr(errorId)}"
        data-login-error="password"
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
    appName: APP_NAME,
    header: false,
    ariaLabelledBy: "login-panel-title",

    body: `
      <section
        class="login-pro login-pro--narrow"
        aria-labelledby="login-panel-title"
        data-login-template-version="${escapeAttr(LOGIN_TEMPLATE_VERSION)}"
        data-login-density="compact"
      >
        <div class="login-orb login-orb-primary" aria-hidden="true"></div>
        <div class="login-orb login-orb-secondary" aria-hidden="true"></div>
        <div class="login-grid-glow" aria-hidden="true"></div>

        <section
          class="login-card-panel login-card-panel--narrow"
          aria-labelledby="login-panel-title"
          data-login-card="true"
          data-login-card-size="narrow"
        >
          <div class="login-card-sheen" aria-hidden="true"></div>

          <header class="login-card-header">
            ${renderLoginLogo()}

            <h2
              class="login-card-title"
              id="login-panel-title"
            >
              Entra en tu panel
            </h2>

            <p class="login-card-subtitle">
              Introduce tus credenciales para continuar.
            </p>
          </header>

          <p
            class="auth-error login-global-error"
            data-login-global-error="true"
            role="alert"
            aria-live="polite"
            hidden
          ></p>

          <form
            class="auth-form login-form login-form--compact"
            id="login-form"
            autocomplete="on"
            novalidate
            data-login-form="true"
          >
            ${renderIdentifierField({
              id: "login-identifier",
              name: "identifier",
              label: "Usuario o email",
              autocomplete: "username",
              placeholder: "usuario@empresa.com",
              icon: "user",
              dataKey: "login-identifier",
              enterKeyHint: "next",
            })}

            ${renderPasswordField()}

            <div class="login-form-row">
              <span class="login-form-note">
                Acceso seguro
              </span>

            <a
              class="auth-link login-link login-forgot-link"
              href="${escapeAttr(forgotHref)}"
              data-spa="true"
              data-router-link="true"
              data-route="${escapeAttr(forgotHref)}"
              data-href="${escapeAttr(forgotHref)}"
              data-login-forgot-password="true"
            >
              ¿Has olvidado tu contraseña?
            </a>
            </div>

            <button
              class="auth-button auth-submit login-submit"
              type="submit"
              data-login-submit="true"
              data-default-text="Entrar al panel"
              data-loading-text="Accediendo..."
            >
              Entrar al panel
            </button>
          </form>

          <footer class="login-card-footer login-card-footer--single" aria-label="Información de Onion Support">
            <span>
              Acceso registrado · Onion Support · © 2026 · Todos los derechos reservados.
            </span>
          </footer>
        </section>
      </section>
    `,
  });
}

export function createLoginTemplate() {
  const template = document.createElement("template");

  template.innerHTML = getLoginTemplate().trim();

  return template.content.firstElementChild;
}

export default createLoginTemplate;
