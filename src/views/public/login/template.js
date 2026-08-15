/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/public/login/template.js

   Diseño:
   - Portal auth premium alineado con el Public Home.
   - Paleta azul / navy / cyan de Onion Support.
   - Datos públicos reales: +8 años / +300 clientes atendidos.
   - Sin claims inventados, sin login social, sin OTP.
   - Mantiene intactos los data-* consumidos por index.js.
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

export const LOGIN_TEMPLATE_VERSION =
  "login.template.public.v7-fullscreen-2026";

const APP_NAME = "Onion Support";
const HOME_HREF = "/";
const PASSWORD_REQUEST_HREF =
  ROUTES.passwordRequest || "/password-request";

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

  return clean
    ? `data-${escapeAttr(clean)}="true"`
    : "";
}

function homeAnchor(hash = "") {
  const cleanHash = text(hash, "")
    .replace(/^#/, "")
    .replace(/[^a-z0-9-]/gi, "");

  return safeInternalHref(
    cleanHash ? `/#${cleanHash}` : HOME_HREF,
    HOME_HREF
  );
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

    shield: `
      <svg class="login-feature-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.75 19.25 6v5.5c0 4.42-2.95 7.28-7.25 8.75-4.3-1.47-7.25-4.33-7.25-8.75V6L12 3.75Z"></path>
        <path d="m8.75 12 2.15 2.15 4.35-4.65"></path>
      </svg>
    `,

    bolt: `
      <svg class="login-feature-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M13.25 2.75 5.75 13h5L10.75 21.25 18.25 10h-5l.25-7.25Z"></path>
      </svg>
    `,

    invoice: `
      <svg class="login-feature-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7.25 3.75h9.5v16.5l-2-1.2-2.75 1.2-2.75-1.2-2 1.2V3.75Z"></path>
        <path d="M9.25 8h5.5"></path>
        <path d="M9.25 11.75h5.5"></path>
        <path d="M9.25 15.5h3"></path>
      </svg>
    `,

    arrow: `
      <svg class="login-arrow-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 12h13"></path>
        <path d="m13 6 6 6-6 6"></path>
      </svg>
    `,
  };

  return icons[name] || "";
}

/* =========================================================
   LOGO / BRAND
========================================================= */

function renderLogo({
  shellClass = "login-brand-mark",
  imageClass = "login-brand-logo",
  size = 72,
} = {}) {
  const logoSrc = safeAssetSrc(
    PUBLIC_AUTH_LOGO,
    PUBLIC_AUTH_LOGO
  );

  return `
    <span class="${escapeAttr(shellClass)}" aria-hidden="true">
      <img
        class="${escapeAttr(imageClass)}"
        src="${escapeAttr(logoSrc)}"
        alt=""
        width="${escapeAttr(size)}"
        height="${escapeAttr(size)}"
        loading="eager"
        decoding="async"
        draggable="false"
      >
    </span>
  `;
}

/* =========================================================
   FIELD
========================================================= */

function renderIdentifierField() {
  const id = "login-identifier";
  const name = "identifier";
  const label = "Usuario o email";

  return `
    <div
      class="auth-field login-field login-field-card login-field--identifier"
      data-login-field="${escapeAttr(name)}"
    >
      <label
        class="auth-label login-label"
        for="${escapeAttr(id)}"
      >
        ${escapeHtml(label)}
      </label>

      <div class="login-input-shell">
        <span class="login-input-icon" aria-hidden="true">
          ${renderIcon("user")}
        </span>

        <input
          class="auth-input login-input input-text"
          id="${escapeAttr(id)}"
          name="${escapeAttr(name)}"
          type="text"
          autocomplete="username"
          inputmode="text"
          placeholder="usuario@empresa.com"
          maxlength="${escapeAttr(MAX_IDENTIFIER_LENGTH)}"
          required
          spellcheck="false"
          autocapitalize="none"
          aria-label="${escapeAttr(label)}"
          aria-invalid="false"
          aria-describedby="${escapeAttr(id)}-error"
          enterkeyhint="next"
          data-login-input="${escapeAttr(name)}"
          ${dataFlag("login-identifier")}
        >
      </div>

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

function renderPasswordField() {
  const id = "login-password";
  const errorId = `${id}-error`;
  const capsId = `${id}-caps`;

  return `
    <div
      class="auth-field login-field login-field-card login-field--password"
      data-login-field="password"
      data-login-password-field="true"
      data-password-field="true"
    >
      <label
        class="auth-label login-label"
        for="${escapeAttr(id)}"
      >
        Contraseña
      </label>

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
          placeholder="Tu contraseña"
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
          <span
            class="password-toggle-icon"
            data-password-toggle-icon="true"
          >
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
          <span
            class="caps-icon"
            data-password-caps-icon-wrapper="true"
            aria-hidden="true"
          >
            ${renderIcon("caps")}
          </span>

          <span
            class="caps-label"
            data-password-caps-label="true"
          >
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
   SHOWCASE
========================================================= */

function renderFeature(icon, title, textValue) {
  return `
    <article class="login-showcase-feature">
      <span class="login-showcase-feature-icon" aria-hidden="true">
        ${renderIcon(icon)}
      </span>

      <span class="login-showcase-feature-copy">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(textValue)}</span>
      </span>
    </article>
  `;
}

function renderShowcase() {
  return `
    <section
      class="login-showcase"
      aria-labelledby="login-showcase-title"
    >
      <div class="login-showcase-copy">
        <p class="login-showcase-eyebrow">
          Área privada · Onion Support
        </p>

        <h1
          class="login-showcase-title"
          id="login-showcase-title"
        >
          Bienvenido de nuevo a
          <span>Onion Support</span>
        </h1>

        <p class="login-showcase-text">
          Accede a tu panel para gestionar soporte, incidencias
          y documentación desde un entorno rápido y seguro.
        </p>
      </div>

      <div
        class="login-showcase-features"
        aria-label="Ventajas del servicio"
      >
        ${renderFeature(
          "bolt",
          "Respuesta ágil",
          "Seguimiento claro y comunicación directa."
        )}

        ${renderFeature(
          "shield",
          "Profesional",
          "Soporte técnico con criterio y trazabilidad."
        )}

        ${renderFeature(
          "invoice",
          "Factura disponible",
          "Documentación y facturación cuando corresponda."
        )}
      </div>

      <div
        class="login-showcase-metrics"
        aria-label="Experiencia de Onion Support"
      >
        <article class="login-showcase-metric">
          <strong>+8</strong>
          <span>años de experiencia</span>
        </article>

        <article class="login-showcase-metric">
          <strong>+300</strong>
          <span>clientes atendidos</span>
        </article>
      </div>

      <div class="login-orbit" aria-hidden="true">
        <span class="login-orbit-ring login-orbit-ring--one"></span>
        <span class="login-orbit-ring login-orbit-ring--two"></span>
        <span class="login-orbit-ring login-orbit-ring--three"></span>
        <span class="login-orbit-core"></span>
      </div>
    </section>
  `;
}

/* =========================================================
   TOPBAR
========================================================= */

function renderTopbar() {
  const homeHref = homeAnchor("");

  return `
    <header class="login-topbar">
      <a
        class="login-topbar-brand"
        href="${escapeAttr(homeHref)}"
        data-spa="true"
        data-router-link="true"
        data-route="${escapeAttr(homeHref)}"
        aria-label="Volver a Onion Support"
      >
        ${renderLogo({
          shellClass: "login-brand-mark",
          imageClass: "login-brand-logo",
          size: 52,
        })}

        <span class="login-brand-wordmark" aria-hidden="true">
          <strong>ONION</strong><span>SUPPORT</span>
        </span>
      </a>
    </header>
  `;
}

/* =========================================================
   LOGIN CARD
========================================================= */

function renderLoginCard() {
  const forgotHref = safeInternalHref(
    PASSWORD_REQUEST_HREF,
    "/password-request"
  );

  return `
    <section
      class="login-card-panel login-card-panel--portal"
      aria-labelledby="login-panel-title"
      data-login-card="true"
      data-login-card-size="portal"
    >
      <div class="login-card-sheen" aria-hidden="true"></div>

      <header class="login-card-header">
        <div
          class="login-card-logo-wrap"
          aria-label="${escapeAttr(APP_NAME)}"
        >
          ${renderLogo({
            shellClass: "login-card-logo-shell",
            imageClass: "login-card-logo",
            size: 96,
          })}
        </div>

        <h2
          class="login-card-title"
          id="login-panel-title"
        >
          Iniciar sesión
        </h2>

        <p class="login-card-subtitle">
          Accede a tu cuenta de Onion Support.
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
        class="auth-form login-form login-form--portal"
        id="login-form"
        autocomplete="on"
        novalidate
        data-login-form="true"
      >
        ${renderIdentifierField()}
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
          <span data-login-submit-label="true">
            Entrar al panel
          </span>
          ${renderIcon("arrow")}
        </button>

        <div class="login-card-security" aria-label="Acceso protegido">
          <span class="login-card-security-icon" aria-hidden="true">
            ${renderIcon("shield")}
          </span>

          <span>
            Tus credenciales se envían mediante la sesión segura de Onion Support.
          </span>
        </div>
      </form>

      <footer
        class="login-card-footer login-card-footer--single"
        aria-label="Información de Onion Support"
      >
        <span>
          Onion Support · © 2026 · Todos los derechos reservados.
        </span>
      </footer>
    </section>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getLoginTemplate() {
  return renderPublicShell({
    view: "login",
    appName: APP_NAME,
    header: false,
    ariaLabelledBy: "login-panel-title",

    body: `
      <section
        class="login-pro login-pro--portal"
        aria-label="Acceso a Onion Support"
        data-login-template-version="${escapeAttr(LOGIN_TEMPLATE_VERSION)}"
        data-login-density="portal"
      >
        <div class="login-page-glow login-page-glow--one" aria-hidden="true"></div>
        <div class="login-page-glow login-page-glow--two" aria-hidden="true"></div>
        <div class="login-page-grid" aria-hidden="true"></div>

        <div class="login-portal-frame">
          ${renderTopbar()}

          <main class="login-portal-main">
            ${renderShowcase()}
            ${renderLoginCard()}
          </main>
        </div>
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
