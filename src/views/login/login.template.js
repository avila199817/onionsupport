/* =========================================================
   Onion SPA - Login Template
   Archivo: src/views/login/login.template.js

   Responsabilidades:
   - generar el html del login alineado con /src/css/auth/login.css
   - centralizar el markup premium de la vista
   - mantener ids y data-hooks estables para login.dom.js
   - respetar el sistema visual auth-screen / login-grid / login-card
   - unificar forgot password hacia /reset-password
   - soportar usuario o email
========================================================= */

import { escapeHtml } from "./login.helpers.js";

/* =========================================================
   ICONS
========================================================= */

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

function getCapsIcon() {
  return `
    <svg
      class="caps-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      width="16"
      height="16"
    >
      <path
        d="M12 4.5 6.5 10H10v6h4v-6h3.5L12 4.5Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <path
        d="M8 18.5h8"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
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
  heroEyebrow = "Acceso seguro · Panel operativo",
  heroTitle = "Acceso corporativo seguro",
  bullets = [],
} = {}) {
  const finalSignals =
    Array.isArray(bullets) && bullets.length
      ? bullets.filter(Boolean)
      : [
          "Autenticación robusta del sistema",
          "Sesión protegida con refresh",
          "Interfaz premium alineada al panel",
        ];

  return `
    <aside class="login-side login-side-left login-side-left--raised" aria-label="Estado del acceso">
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

function renderForm({
  identifier = "",
  appName = "Onion Support",
  title = "Acceso",
  subtitle = "Introduce tus credenciales para entrar al panel.",
  submitLabel = "Entrar al panel",
  rememberLabel = "Recordarme",
  forgotLabel = "¿Has olvidado tu contraseña?",
  forgotPasswordHref = "/reset-password",
  footerText = "Acceso protegido. Usa tus credenciales corporativas autorizadas.",
} = {}) {
  const hasIdentifier =
    Boolean(String(identifier || "").trim());

  return `
    <section class="login-stage login-stage--right" aria-label="Formulario de acceso">
      <div class="login-card-shell login-card-shell--right">
        <div class="login-card login-card--offset login-card--clean">
          <header class="login-header">
            <div class="logo-fade" aria-hidden="true">
              ${getLogoIcon()}
            </div>

            <h2>${escapeHtml(title)}</h2>

            <p class="login-subtitle">
              ${escapeHtml(subtitle || `Acceso seguro a ${appName}.`)}
            </p>
          </header>

          <form class="login-form" id="loginForm" novalidate>
            <div class="login-field" data-field="email">
              <input
                class="input-text"
                id="loginEmail"
                name="email"
                type="text"
                autocomplete="username"
                inputmode="email"
                placeholder="Usuario o email"
                value="${escapeHtml(identifier)}"
                aria-label="Usuario o email"
                required
              />
            </div>

            <div class="login-field" data-field="password">
              <div class="password-wrapper">
                <input
                  class="input-text"
                  id="loginPassword"
                  name="password"
                  type="password"
                  autocomplete="current-password"
                  placeholder="Contraseña"
                  aria-label="Contraseña"
                  required
                />

                <span
                  class="caps-indicator"
                  id="loginCapsIndicator"
                  aria-hidden="true"
                >
                  ${getCapsIcon()}
                  <span class="caps-label">Bloq Mayús</span>
                </span>

                <button
                  class="password-toggle"
                  type="button"
                  id="togglePassword"
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

            <div class="login-options">
              <label class="login-check">
                <input
                  id="loginRemember"
                  name="remember"
                  type="checkbox"
                  ${hasIdentifier ? "checked" : ""}
                />
                <span>${escapeHtml(rememberLabel)}</span>
              </label>

              <div class="login-meta">
                <span>Conexión segura</span>
              </div>
            </div>

            <div
              class="login-error"
              id="loginError"
              role="alert"
              aria-live="polite"
            ></div>

            <button
              class="login-button"
              id="loginSubmit"
              type="submit"
            >
              <span class="login-submit-text">${escapeHtml(submitLabel)}</span>
            </button>

            <div class="login-reset">
              <a
                class="login-reset-link"
                href="${escapeHtml(forgotPasswordHref)}"
                id="forgotPasswordLink"
                data-spa
              >
                ${escapeHtml(forgotLabel)}
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

export function getLoginTemplate(options = {}) {
  const {
    appName = "Onion Support",
  } = options;

  return `
    <section class="login-view" data-view="login" data-login-view="true">
      <div class="login-scene">
        <div class="login-grid">
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

export { getLoginTemplate as LoginTemplate };
export default getLoginTemplate;
