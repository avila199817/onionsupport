/* =========================================================
   Onion SPA - Reset Password Template
   Archivo: src/views/reset-password/reset-password.template.js

   Responsabilidades:
   - generar el html premium de recuperación de acceso
   - mantener layout auth-screen alineado con login
   - conservar bloque lateral izquierdo de estado
   - renderizar card principal a la derecha
   - soportar input de usuario o email
   - incluir toast superior derecho desacoplado
   - incluir bloque inline de error / estado
   - exponer ids estables para dom.js e index.js
========================================================= */

import { escapeHtml } from "./reset-password.helpers.js";

/* =========================================================
   ICONS
========================================================= */

function getToastInfoIcon() {
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11 7h2V5h-2v2Zm0 12h2V9h-2v10Zm1-17C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Z"
      />
    </svg>
  `;
}

function getToastCloseIcon() {
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.29 1.41 1.41 6.3-6.29 6.29 6.29 1.41-1.41-6.29-6.29 6.29-6.3-1.41-1.41Z"
      />
    </svg>
  `;
}

function getBackArrowIcon() {
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.71 6.29a1 1 0 0 1 0 1.41L11.41 11H20a1 1 0 1 1 0 2h-8.59l3.3 3.29a1 1 0 0 1-1.41 1.42l-5-5a1 1 0 0 1 0-1.42l5-5a1 1 0 0 1 1.41 0Z"
      />
    </svg>
  `;
}

function getLogoIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="44" height="44">
      <path
        d="M12 3.5 4.5 7.75 12 12l7.5-4.25L12 3.5Z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path
        d="M4.5 12.25 12 16.5l7.5-4.25"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M4.5 16.25 12 20.5l7.5-4.25"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

/* =========================================================
   PARTIALS
========================================================= */

function renderToast() {
  return `
    <div class="login-toast-stack login-toast-stack--top-right" aria-live="polite" aria-atomic="true">
      <div
        id="resetPasswordToast"
        class="login-toast"
        role="status"
        aria-hidden="true"
        data-state="default"
        hidden
      >
        <div class="login-toast-glow" aria-hidden="true"></div>

        <div class="login-toast-body">
          <div id="resetPasswordToastIcon" class="login-toast-icon" aria-hidden="true">
            ${getToastInfoIcon()}
          </div>

          <div class="login-toast-content">
            <div id="resetPasswordToastTitle" class="login-toast-title">Aviso</div>
            <div id="resetPasswordToastText" class="login-toast-text"></div>
          </div>

          <button
            type="button"
            id="resetPasswordToastClose"
            class="login-toast-close"
            aria-label="Cerrar aviso"
            title="Cerrar aviso"
          >
            ${getToastCloseIcon()}
          </button>
        </div>

        <span
          id="resetPasswordToastProgress"
          class="login-toast-progress"
          aria-hidden="true"
        ></span>
      </div>
    </div>
  `;
}

function renderSignalItem(text = "") {
  return `
    <div class="login-signal-item">
      <span class="dot" aria-hidden="true"></span>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function renderLeftPanel({
  heroEyebrow = "Recuperación segura",
  heroTitle = "Recupera el acceso sin salir del flujo protegido del panel.",
  bullets = [],
} = {}) {
  const finalBullets =
    Array.isArray(bullets) && bullets.length
      ? bullets.filter(Boolean)
      : [
          "Verificación del identificador de acceso",
          "Flujo desacoplado del login principal",
          "Recuperación protegida y guiada",
        ];

  return `
    <aside class="login-side login-side-left login-side-left--raised" aria-label="Estado de recuperación">
      <div class="login-side-panel login-side-panel--status">
        <div class="login-side-eyebrow">${escapeHtml(heroEyebrow)}</div>

        <h3>${escapeHtml(heroTitle)}</h3>

        <div class="login-signal-list">
          ${finalBullets.map(renderSignalItem).join("")}
        </div>
      </div>
    </aside>
  `;
}

function renderForm({
  rememberedIdentifier = "",
  appName = "Onion Support",
  title = "Recuperar acceso",
  subtitle = "Introduce tu usuario o email y te enviaremos las instrucciones para restablecer el acceso.",
  submitLabel = "Enviar enlace",
  backLabel = "Volver al acceso",
  backHref = "/login",
  footerText = "Recuperación protegida. Usa un identificador válido de tu cuenta.",
} = {}) {
  return `
    <section class="login-stage login-stage--right" aria-label="Formulario de recuperación">
      <div class="login-card-shell login-card-shell--right">
        <div
          class="login-card login-card--offset login-card--clean"
          id="resetPasswordCard"
        >
          <header class="login-header">
            <div class="logo-fade" aria-hidden="true">
              ${getLogoIcon()}
            </div>

            <h2>${escapeHtml(title)}</h2>

            <p class="login-subtitle">
              ${escapeHtml(subtitle || `Recupera el acceso a ${appName}.`)}
            </p>
          </header>

          <form
            class="login-form"
            id="resetPasswordForm"
            novalidate
          >
            <div class="login-field" data-field="identifier">
              <input
                class="input-text"
                id="resetIdentifier"
                name="identifier"
                type="text"
                autocomplete="username"
                inputmode="email"
                placeholder="Usuario o email"
                value="${escapeHtml(rememberedIdentifier)}"
                aria-label="Usuario o email"
                required
              />
            </div>

            <div
              class="login-error"
              id="resetPasswordError"
              role="alert"
              aria-live="polite"
            ></div>

            <button
              class="login-button"
              id="resetPasswordButton"
              type="submit"
            >
              <span class="login-submit-text">${escapeHtml(submitLabel)}</span>
            </button>

            <div class="login-reset login-reset--back">
              <a
                class="login-reset-link login-reset-link--back"
                href="${escapeHtml(backHref)}"
                id="backToLoginLink"
                data-spa
              >
                <span class="login-reset-link-icon" aria-hidden="true">
                  ${getBackArrowIcon()}
                </span>
                <span>${escapeHtml(backLabel)}</span>
              </a>
            </div>
          </form>

          <footer class="login-footer">
            <span>${escapeHtml(footerText)}</span>
          </footer>
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function getResetPasswordTemplate(options = {}) {
  const {
    appName = "Onion Support",
  } = options;

  return `
    <section
      class="login-view reset-password-view"
      data-view="reset-password"
      data-reset-password-view="true"
    >
      ${renderToast()}

      <div class="login-scene">
        <div class="login-grid" id="resetPasswordGrid">
          ${renderLeftPanel({
            ...options,
            appName,
          })}

          ${renderForm({
            ...options,
            appName,
          })}
        </div>
      </div>
    </section>
  `;
}

export { getResetPasswordTemplate as ResetPasswordTemplate };
export default getResetPasswordTemplate;
