/* =========================================================
   Onion SPA - Reset Password Template
   Archivo: src/views/reset-password/reset-password.template.js

   Responsabilidades:
   - generar el html premium de recuperación de acceso
   - mantener el layout auth-screen alineado con login
   - conservar bloque lateral izquierdo de estado
   - renderizar card principal a la derecha
   - soportar input de usuario o email
   - incluir toast superior derecho desacoplado
   - exponer ids estables para dom.js e index.js
   - mantener consistencia visual con login.template.js
========================================================= */

import { escapeHtml } from "../login/login.helpers.js";

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

        <span id="resetPasswordToastProgress" class="login-toast-progress" aria-hidden="true"></span>
      </div>
    </div>
  `;
}

function renderSignalItem(text = "") {
  return `
    <div class="login-signal-item">
      <span class="dot"></span>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function renderLeftPanel({
  heroEyebrow = "Recuperación segura",
  heroTitle = "Recupera el acceso sin salir del flujo protegido del panel.",
  bullets = [],
} = {}) {
  const finalBullets = Array.isArray(bullets) && bullets.length
    ? bullets.filter(Boolean)
    : [
        "Verificación del identificador de acceso",
        "Flujo desacoplado del login principal",
        "Recuperación protegida y guiada",
      ];

  return `
    <aside class="login-side login-side-left login-side-left--raised" aria-hidden="true">
      <div class="login-side-panel login-side-panel--status login-side-panel--compact">
        <div class="login-side-eyebrow">${escapeHtml(heroEyebrow)}</div>
        <h3>${escapeHtml(heroTitle)}</h3>

        <div class="login-signal-list">
          ${finalBullets.map(renderSignalItem).join("")}
        </div>
      </div>
    </aside>
  `;
}

function renderLogoFade({
  logos = [],
} = {}) {
  const finalLogos = Array.isArray(logos) && logos.length
    ? logos
    : [
        "/src/media/img/favicon_black.png",
        "/src/media/img/favicon_black_circle.png",
        "/src/media/img/favicon_support.png",
        "/src/media/img/favicon_white.png",
      ];

  return `
    <div class="logo-fade" aria-hidden="true">
      ${finalLogos.map((src) => `<img src="${escapeHtml(src)}" alt="">`).join("")}
    </div>
  `;
}

function renderForm({
  appName = "Onion Support",
  appVersion = "1.0.0",
  currentYear = new Date().getFullYear(),
  title,
  subtitle = "Introduce tu usuario o email y te enviaremos las instrucciones para restablecer el acceso.",
  identifierPlaceholder = "Usuario o email",
  submitLabel = "Enviar enlace",
  backLabel = "Volver al acceso",
  backHref = "/login",
  footerText = "",
  rememberedIdentifier = "",
  logos = [],
} = {}) {
  const finalTitle = title || `Recuperar acceso a ${appName}`;
  const finalFooterText =
    footerText || `© ${currentYear} ${appName} · v${appVersion}`;

  return `
    <div class="login-stage login-stage--right" id="resetPasswordStage">
      <div class="login-card-shell login-card-shell--right">
        <div class="login-card login-card--clean login-card--offset" id="resetPasswordCard">
          <div class="login-header">
            ${renderLogoFade({ logos })}

            <h2>${escapeHtml(finalTitle)}</h2>

            <p class="login-subtitle">
              ${escapeHtml(subtitle)}
            </p>
          </div>

          <form id="resetPasswordForm" class="login-form" novalidate>
            <div class="login-field">
              <input
                type="text"
                id="resetIdentifier"
                name="identifier"
                class="input-text"
                placeholder="${escapeHtml(identifierPlaceholder)}"
                autocomplete="username"
                inputmode="email"
                spellcheck="false"
                autocapitalize="off"
                value="${escapeHtml(rememberedIdentifier)}"
                required
                aria-invalid="false"
              >
            </div>

            <button
              type="submit"
              class="login-button"
              id="resetPasswordButton"
            >
              <span class="login-submit-text">${escapeHtml(submitLabel)}</span>
            </button>

            <div class="login-reset login-reset--back">
              <a
                href="${escapeHtml(backHref)}"
                id="backToLoginLink"
                class="login-reset-link login-reset-link--back"
                data-spa
              >
                <span class="login-reset-link-icon" aria-hidden="true">
                  ${getBackArrowIcon()}
                </span>
                <span>${escapeHtml(backLabel)}</span>
              </a>
            </div>
          </form>

          <div class="login-footer">
            ${escapeHtml(finalFooterText)}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function getResetPasswordTemplate(options = {}) {
  const {
    appName = "Onion Support",
    appVersion = "1.0.0",
    currentYear = new Date().getFullYear(),
  } = options;

  return `
    <section
      class="login-view login-view--clean reset-password-view"
      data-view="reset-password"
      data-reset-password-view="true"
      aria-label="Recuperación de acceso"
    >
      ${renderToast()}

      <div class="login-scene">
        <div class="login-grid login-grid--clean" id="resetPasswordGrid">
          ${renderLeftPanel(options)}

          ${renderForm({
            ...options,
            appName,
            appVersion,
            currentYear,
          })}
        </div>
      </div>
    </section>
  `;
}

export { getResetPasswordTemplate as ResetPasswordTemplate };
export default getResetPasswordTemplate;
