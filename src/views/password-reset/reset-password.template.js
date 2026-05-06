/* =========================================================
   Onion SPA - Reset Password Template
   Archivo: src/views/password-reset/reset-password.template.js

   RESET PASSWORD · AUTH TEMPLATE · FINAL PRO SYSTEM · CSP CLEAN · 10/10

   RESPONSABILIDADES:
   - generar el HTML premium de recuperación de acceso
   - reutilizar el MISMO sistema visual de /src/css/auth/login.css
   - mantener layout auth-screen alineado con login
   - conservar bloque lateral izquierdo de estado
   - renderizar card principal a la derecha
   - soportar input de usuario o email
   - incluir toast superior derecho desacoplado
   - usar logo real de empresa según tema activo
   - exponer ids estables para dom.js e index.js
   - mantener compatibilidad total con flujo SPA

   IMPORTANTE:
   - Sin CSS inline.
   - Sin <style> inyectado.
   - Sin duplicidades visuales.
   - El CSS vive en /src/css/auth/login.css.
========================================================= */

import { escapeHtml } from "./reset-password.helpers.js";

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

function getToastInfoIcon() {
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M11 7h2V5h-2v2Zm0 12h2V9h-2v10Zm1-17C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Z"
      />
    </svg>
  `;
}

function getToastCloseIcon() {
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.29 1.41 1.41 6.3-6.29 6.29 6.29 1.41-1.41-6.29-6.29 6.29-6.3-1.41-1.41Z"
      />
    </svg>
  `;
}

function getBackArrowIcon() {
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
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
  const finalAlt = safeText(alt, "Onion Support");

  return `
    <span
      class="login-logo-theme"
      aria-hidden="true"
      data-login-logo-theme="true"
    >
      <img
        class="login-logo-theme-dark"
        src="${escapeHtml(darkSrc)}"
        alt="${escapeHtml(finalAlt)}"
        width="44"
        height="44"
        loading="eager"
        decoding="async"
      />

      <img
        class="login-logo-theme-light"
        src="${escapeHtml(lightSrc)}"
        alt="${escapeHtml(finalAlt)}"
        width="44"
        height="44"
        loading="eager"
        decoding="async"
      />
    </span>
  `;
}

/* =========================================================
   TOAST
========================================================= */

function renderToast() {
  return `
    <div
      class="login-toast-stack login-toast-stack--top-right"
      aria-live="polite"
      aria-atomic="true"
      data-reset-password-toast-stack="true"
    >
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
          <div
            id="resetPasswordToastIcon"
            class="login-toast-icon"
            aria-hidden="true"
          >
            ${getToastInfoIcon()}
          </div>

          <div class="login-toast-content">
            <div
              id="resetPasswordToastTitle"
              class="login-toast-title"
            >
              Aviso
            </div>

            <div
              id="resetPasswordToastText"
              class="login-toast-text"
            ></div>
          </div>

          <button
            type="button"
            id="resetPasswordToastClose"
            class="login-toast-close"
            aria-label="Cerrar aviso"
            title="Cerrar aviso"
            data-tooltip="Cerrar aviso"
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

/* =========================================================
   LEFT PANEL
========================================================= */

function renderSignalItem(text = "") {
  const label = safeText(text, "");

  if (!label) {
    return "";
  }

  return `
    <div class="login-signal-item">
      <span class="dot" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function renderLeftPanel({
  heroEyebrow = "ONION SUPPORT · RECUPERACIÓN PROTEGIDA",
  heroTitle = "Recuperación segura del acceso al panel",
  bullets = [],
} = {}) {
  const finalSignals =
    safeArray(bullets).filter(Boolean).length
      ? safeArray(bullets).filter(Boolean)
      : [
          "Validación segura de usuario o email",
          "Flujo protegido desacoplado del acceso principal",
          "Recuperación guiada alineada al entorno operativo",
        ];

  return `
    <aside
      class="login-side login-side-left login-side-left--raised"
      aria-label="Estado de recuperación"
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

/* =========================================================
   FORM
========================================================= */

function renderForm({
  appName = "Onion Support",
  title = "Recuperar acceso",
  subtitle = "",
  rememberedIdentifier = "",
  submitLabel = "Enviar enlace",
  identifierPlaceholder = "Usuario o email",
  backLabel = "Volver al acceso",
  backHref = "/login",
  footerText = "Entorno protegido. Usa un identificador válido de tu cuenta corporativa.",
  logoDarkSrc = "/src/media/img/favicon_white.png",
  logoLightSrc = "/src/media/img/favicon_black.png",
} = {}) {
  const finalAppName = safeText(appName, "Onion Support");

  const finalSubtitle = safeText(
    subtitle,
    `Recuperar acceso a ${finalAppName}`
  );

  return `
    <section
      class="login-stage login-stage--right"
      aria-label="Formulario de recuperación"
    >
      <div class="login-card-shell login-card-shell--right">
        <div
          class="login-card login-card--offset login-card--clean reset-password-card"
          id="resetPasswordCard"
          data-reset-password-card="true"
        >
          <header class="login-header">
            <div class="logo-fade" aria-hidden="true">
              ${renderThemeLogo({
                darkSrc: logoDarkSrc,
                lightSrc: logoLightSrc,
                alt: finalAppName,
              })}
            </div>

            <h2>${escapeHtml(title)}</h2>

            <p class="login-subtitle">
              ${escapeHtml(finalSubtitle)}
            </p>
          </header>

          <form
            class="login-form reset-password-form"
            id="resetPasswordForm"
            data-reset-password-form="true"
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
                placeholder="${escapeHtml(identifierPlaceholder)}"
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
              <span class="login-submit-text">
                ${escapeHtml(submitLabel)}
              </span>
            </button>

            <div class="login-reset">
              <a
                class="login-reset-link reset-password-back-link"
                href="${escapeHtml(backHref)}"
                id="backToLoginLink"
                data-spa
              >
                <span
                  class="login-reset-link-icon"
                  aria-hidden="true"
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

export function getResetPasswordTemplate(options = {}) {
  const appName = safeText(
    options?.appName,
    "Onion Support"
  );

  return `
    <section
      class="login-view reset-password-view"
      data-view="reset-password"
      data-reset-password-view="true"
    >
      ${renderToast()}

      <div class="login-scene">
        <div
          class="login-grid"
          id="resetPasswordGrid"
          data-reset-password-grid="true"
        >
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
