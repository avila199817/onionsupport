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
  PUBLIC_AUTH_LOGO,
  escapeAttr,
  escapeHtml,
  renderPublicShell,
  safeAssetSrc,
  safeInternalHref,
} from "../index.js";

export const LOGIN_TEMPLATE_VERSION = "login.template.public.v3";

const APP_NAME = "Onion Support";
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
          width="72"
          height="72"
          loading="eager"
          decoding="async"
          draggable="false"
        >
      </span>

      <span class="login-card-logo-name">
        ${escapeHtml(APP_NAME)}
      </span>
    </div>
  `;
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
  hint = "",
  icon = "",
  dataKey = "",
  enterKeyHint = "",
} = {}) {
  const cleanId = text(id, "");
  const cleanName = text(name, "");
  const cleanLabel = text(label, cleanName);
  const cleanType = text(type, "text");
  const cleanAutocomplete = text(autocomplete, "");
  const cleanPlaceholder = text(placeholder, cleanLabel);
  const cleanHint = text(hint, "");
  const cleanEnterKeyHint = text(enterKeyHint, "");

  const describedBy = [
    cleanHint ? `${cleanId}-hint` : "",
    `${cleanId}-error`,
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div
      class="auth-field login-field login-field-card"
      data-login-field="${escapeAttr(cleanName)}"
    >
      <div class="login-field-head">
        <label
          class="auth-label login-label"
          for="${escapeAttr(cleanId)}"
        >
          ${escapeHtml(cleanLabel)}
        </label>
      </div>

      <div class="login-input-shell">
        <span class="login-input-icon" aria-hidden="true">
          ${renderIcon(icon)}
        </span>

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
          aria-describedby="${escapeAttr(describedBy)}"
          ${cleanEnterKeyHint ? `enterkeyhint="${escapeAttr(cleanEnterKeyHint)}"` : ""}
          data-login-input="${escapeAttr(cleanName)}"
          ${dataFlag(dataKey)}
        >
      </div>

      ${
        cleanHint
          ? `
            <p
              class="auth-field-hint login-field-hint"
              id="${escapeAttr(cleanId)}-hint"
            >
              ${escapeHtml(cleanHint)}
            </p>
          `
          : ""
      }

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
    appName: APP_NAME,
    title: "Acceso a Onion Support",
    subtitle: "",
    logo: false,

    body: `
      <section
        class="login-pro"
        aria-labelledby="login-panel-title"
        data-login-template-version="${escapeAttr(LOGIN_TEMPLATE_VERSION)}"
      >
        <div class="login-orb login-orb-primary" aria-hidden="true"></div>
        <div class="login-orb login-orb-secondary" aria-hidden="true"></div>
        <div class="login-grid-glow" aria-hidden="true"></div>

        <section
          class="login-card-panel"
          aria-labelledby="login-panel-title"
        >
          <div class="login-card-sheen" aria-hidden="true"></div>

          <header class="login-card-header">
            ${renderLoginLogo()}

            <p class="login-card-kicker">
              Acceso privado
            </p>

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
              placeholder: "usuario@empresa.com",
              icon: "user",
              dataKey: "login-identifier",
              enterKeyHint: "next",
            })}

            ${renderField({
              id: "login-password",
              name: "password",
              label: "Contraseña",
              type: "password",
              autocomplete: "current-password",
              placeholder: "Introduce tu contraseña",
              icon: "lock",
              dataKey: "login-password",
              enterKeyHint: "go",
            })}

            <div class="login-form-row">
              <span class="login-form-note">
                Acceso seguro
              </span>

              <a
                class="auth-link login-link login-forgot-link"
                href="${escapeAttr(forgotHref)}"
                data-spa="true"
                data-route="${escapeAttr(forgotHref)}"
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

            <p class="login-security-note">
              Onion Support nunca solicitará tu contraseña fuera de esta pantalla.
            </p>
          </form>

          <footer class="login-card-footer" aria-label="Información de Onion Support">
            <span>Acceso registrado · Onion Support</span>
            <span>© 2026 · Todos los derechos reservados.</span>
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
