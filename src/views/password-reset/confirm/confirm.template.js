/* =========================================================
   Onion SPA - Reset Password Confirm Template
   Archivo: src/views/password-reset/confirm/confirm.template.js

   Responsabilidades:
   - generar el html premium de confirmación de reset
   - reutilizar el MISMO sistema visual de /src/css/auth/login.css
   - mantener layout auth-screen alineado con login/reset
   - renderizar card principal a la derecha
   - soportar token oculto + nueva contraseña + repetir contraseña
   - incluir bloque lateral izquierdo de estado
   - usar logo real de empresa según tema activo
   - exponer ids estables para confirm.dom.js y confirmView.js
========================================================= */

import { escapeHtml } from "../reset-password.helpers.js";

/* =========================================================
   BASICS
========================================================= */

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

/* =========================================================
   ICONS
========================================================= */

function getEyeIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
      <path
        d="M2.75 12s3.25-6 9.25-6 9.25 6 9.25 6-3.25 6-9.25 6-9.25-6-9.25-6Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.7"
        stroke="currentColor"
        stroke-width="1.8"
      />
    </svg>
  `;
}

function getEyeOffIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
      <path
        d="M3.5 4.5 20.5 19.5"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <path
        d="M10.58 5.63A10.5 10.5 0 0 1 12 5.55c6 0 9.25 6 9.25 6a15.72 15.72 0 0 1-3.48 4.11"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M6.2 8.12A15.18 15.18 0 0 0 2.75 11.55s3.25 6 9.25 6c1.36 0 2.59-.3 3.7-.79"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M9.88 9.96A2.9 2.9 0 0 0 9.3 11.7a2.7 2.7 0 0 0 4.57 1.96"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
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
   LOGO
========================================================= */

function renderThemeLogo({
  darkSrc = "/src/media/img/favicon_white.png",
  lightSrc = "/src/media/img/favicon_black.png",
  alt = "Onion Support",
} = {}) {
  return `
    <span class="login-logo-theme" aria-hidden="true">
      <img
        class="login-logo-theme-dark"
        src="${escapeHtml(darkSrc)}"
        alt="${escapeHtml(alt)}"
        width="44"
        height="44"
        loading="eager"
        decoding="async"
      />
      <img
        class="login-logo-theme-light"
        src="${escapeHtml(lightSrc)}"
        alt="${escapeHtml(alt)}"
        width="44"
        height="44"
        loading="eager"
        decoding="async"
      />
    </span>
  `;
}

function renderScopedThemeLogoStyle() {
  return `
    <style>
      .login-logo-theme{
        position:relative;
        display:block;
        width:44px;
        height:44px;
        z-index:1;
      }

      .login-logo-theme img{
        position:absolute;
        inset:0;
        width:44px;
        height:44px;
        object-fit:contain;
        display:block;
      }

      .login-logo-theme-dark{
        opacity:1;
        visibility:visible;
      }

      .login-logo-theme-light{
        opacity:0;
        visibility:hidden;
      }

      [data-theme="light"] .login-logo-theme-dark{
        opacity:0;
        visibility:hidden;
      }

      [data-theme="light"] .login-logo-theme-light{
        opacity:1;
        visibility:visible;
      }
    </style>
  `;
}

/* =========================================================
   PARTIALS
========================================================= */

function renderSignalItem(text = "") {
  return `
    <div class="login-signal-item">
      <span class="dot" aria-hidden="true"></span>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function renderLeftPanel({
  heroEyebrow = "ONION SUPPORT · NUEVA CONTRASEÑA",
  heroTitle = "Configura una contraseña nueva de forma segura",
  bullets = [],
} = {}) {
  const finalSignals =
    safeArray(bullets).filter(Boolean).length
      ? safeArray(bullets).filter(Boolean)
      : [
          "Enlace temporal validado para cambio de contraseña",
          "Actualización segura de credenciales de acceso",
          "Flujo protegido alineado al entorno corporativo",
        ];

  return `
    <aside
      class="login-side login-side-left login-side-left--raised"
      aria-label="Estado del restablecimiento"
    >
      <div class="login-side-panel login-side-panel--status">
        <div class="login-side-eyebrow">
          ${escapeHtml(heroEyebrow)}
        </div>

        <h3>
          ${escapeHtml(heroTitle)}
        </h3>

        <div class="login-signal-list">
          ${finalSignals.map(renderSignalItem).join("")}
        </div>
      </div>
    </aside>
  `;
}

function renderPasswordField({
  inputId = "",
  fieldName = "",
  placeholder = "",
  ariaLabel = "",
  toggleId = "",
} = {}) {
  return `
    <div class="login-field" data-field="${escapeHtml(fieldName)}">
      <div class="password-wrapper">
        <input
          class="input-text"
          id="${escapeHtml(inputId)}"
          name="${escapeHtml(fieldName)}"
          type="password"
          autocomplete="new-password"
          placeholder="${escapeHtml(placeholder)}"
          aria-label="${escapeHtml(ariaLabel)}"
          required
        />

        <button
          class="password-toggle"
          type="button"
          id="${escapeHtml(toggleId)}"
          aria-label="Mostrar contraseña"
          aria-pressed="false"
          data-show-label="Mostrar contraseña"
          data-hide-label="Ocultar contraseña"
          data-show-icon="${escapeHtml(getEyeIcon())}"
          data-hide-icon="${escapeHtml(getEyeOffIcon())}"
        >
          ${getEyeIcon()}
        </button>
      </div>
    </div>
  `;
}

function renderForm({
  appName = "Onion Support",
  title = "Crear nueva contraseña",
  subtitle = "",
  token = "",
  submitLabel = "Actualizar contraseña",
  passwordPlaceholder = "Nueva contraseña",
  confirmPasswordPlaceholder = "Repite la contraseña",
  backLabel = "Volver al acceso",
  backHref = "/login",
  footerText = "La nueva contraseña quedará vinculada a tu cuenta corporativa.",
  logoDarkSrc = "/src/media/img/favicon_white.png",
  logoLightSrc = "/src/media/img/favicon_black.png",
} = {}) {
  const finalSubtitle = safeText(
    subtitle,
    `Define una contraseña nueva para tu cuenta de ${appName}`
  );

  return `
    <section
      class="login-stage login-stage--right"
      aria-label="Formulario de confirmación del reset"
    >
      <div class="login-card-shell login-card-shell--right">
        <div
          class="login-card login-card--offset login-card--clean"
          id="confirmResetCard"
        >
          <header class="login-header">
            <div class="logo-fade" aria-hidden="true">
              ${renderThemeLogo({
                darkSrc: logoDarkSrc,
                lightSrc: logoLightSrc,
                alt: appName,
              })}
            </div>

            <h2>${escapeHtml(title)}</h2>

            <p class="login-subtitle">
              ${escapeHtml(finalSubtitle)}
            </p>
          </header>

          <form
            class="login-form"
            id="confirmResetForm"
            novalidate
          >
            <input
              type="hidden"
              id="resetToken"
              name="token"
              value="${escapeHtml(token)}"
            />

            ${renderPasswordField({
              inputId: "newPassword",
              fieldName: "password",
              placeholder: passwordPlaceholder,
              ariaLabel: "Nueva contraseña",
              toggleId: "toggleNewPassword",
            })}

            ${renderPasswordField({
              inputId: "confirmPassword",
              fieldName: "confirm-password",
              placeholder: confirmPasswordPlaceholder,
              ariaLabel: "Confirmar contraseña",
              toggleId: "toggleConfirmPassword",
            })}

            <div
              class="login-error"
              id="confirmResetError"
              role="alert"
              aria-live="polite"
            ></div>

            <button
              class="login-button"
              id="confirmResetButton"
              type="submit"
            >
              <span class="login-submit-text">
                ${escapeHtml(submitLabel)}
              </span>
            </button>

            <div class="login-reset">
              <a
                class="login-reset-link"
                href="${escapeHtml(backHref)}"
                id="confirmBackToLogin"
                data-spa
              >
                <span
                  class="login-reset-link-icon"
                  aria-hidden="true"
                  style="display:inline-flex;align-items:center;justify-content:center;margin-right:8px;vertical-align:middle;"
                >
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

export function getConfirmTemplate(options = {}) {
  const appName = safeText(
    options?.appName,
    "Onion Support"
  );

  return `
    ${renderScopedThemeLogoStyle()}

    <section
      class="login-view confirm-reset-view"
      data-view="reset-password-confirm"
      data-confirm-reset-view="true"
    >
      <div class="login-scene">
        <div class="login-grid" id="confirmResetGrid">
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

export { getConfirmTemplate as ConfirmTemplate };
export default getConfirmTemplate;
