/* =========================================================
   Onion SPA - Login Template
   Archivo: src/views/login/login.template.js

   Responsabilidades:
   - generar el html premium del login alineado con el layout clásico
   - soportar acceso con usuario o email
   - mantener ids reales para la lógica del login
   - soportar show/hide password con iconos dedicados
   - soportar indicador de caps lock visual
   - incluir toast superior derecho desacoplado
   - conservar panel lateral izquierdo y card a la derecha
   - respetar el sistema visual auth-screen / login-grid / login-card
   - dejar el markup listo para login.view.js / login.dom.js
========================================================= */

import { escapeHtml } from "./login.helpers.js";

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

function getEyeOpenIcon() {
  return `
    <svg
      id="eyeOpenIcon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"
      />
    </svg>
  `;
}

function getEyeClosedIcon() {
  return `
    <svg
      id="eyeClosedIcon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      hidden
    >
      <path
        fill="currentColor"
        d="M3.27 2 2 3.27l3.05 3.05C3.18 7.86 2 10 2 10s3 7 10 7c2.06 0 3.82-.6 5.3-1.48L20.73 19 22 17.73 3.27 2Zm8.77 8.77 2.19 2.19A3.96 3.96 0 0 1 12 13a4 4 0 0 1-4-4c0-.77.22-1.49.6-2.1l1.59 1.59A2 2 0 0 0 12 11c.01 0 .03 0 .04-.23ZM12 5c7 0 10 7 10 7a17.73 17.73 0 0 1-2.92 3.81l-1.42-1.42A15.1 15.1 0 0 0 19.82 12c-.87-1.28-3.35-4-7.82-4-.86 0-1.66.1-2.4.28L7.83 6.51C9.03 5.95 10.43 5.62 12 5Z"
      />
    </svg>
  `;
}

function getCapsIcon() {
  return `
    <svg
      id="capsIcon"
      class="caps-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      hidden
    >
      <path
        fill="currentColor"
        d="M12 3.2 18.8 10h-4.2v5.2h-5.2V10H5.2L12 3.2Zm-4.9 14h9.8a1.1 1.1 0 0 1 0 2.2H7.1a1.1 1.1 0 0 1 0-2.2Z"
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
        id="loginToast"
        class="login-toast"
        role="status"
        aria-hidden="true"
        data-state="default"
        hidden
      >
        <div class="login-toast-glow" aria-hidden="true"></div>

        <div class="login-toast-body">
          <div id="loginToastIcon" class="login-toast-icon" aria-hidden="true">
            ${getToastInfoIcon()}
          </div>

          <div class="login-toast-content">
            <div id="loginToastTitle" class="login-toast-title">Aviso</div>
            <div id="loginToastText" class="login-toast-text"></div>
          </div>

          <button
            type="button"
            id="loginToastClose"
            class="login-toast-close"
            aria-label="Cerrar aviso"
            title="Cerrar aviso"
          >
            ${getToastCloseIcon()}
          </button>
        </div>

        <span id="loginToastProgress" class="login-toast-progress" aria-hidden="true"></span>
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
  heroEyebrow = "Entorno seguro",
  heroTitle = "Tu acceso entra en un panel más vivo y con más presencia visual.",
  bullets = [],
} = {}) {
  const finalBullets = Array.isArray(bullets) && bullets.length
    ? bullets.filter(Boolean)
    : [
        "Sesión cifrada",
        "Controles de acceso activos",
        "Shell SPA preparado",
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
  redirect = "",
  title,
  subtitle = "Accede a tu espacio de soporte, incidencias y gestión interna.",
  identifierPlaceholder = "Usuario o email",
  passwordPlaceholder = "Contraseña",
  rememberLabel = "Recordarme",
  secureMeta = "Acceso seguro",
  submitLabel = "Acceder",
  forgotLabel = "¿Has olvidado tu contraseña?",
  forgotPasswordHref = "/reset-password",
  logos = [],
} = {}) {
  const finalTitle = title || `Iniciar sesión con la cuenta ${appName}`;

  return `
    <div class="login-stage login-stage--right" id="loginStage">
      <div class="login-card-shell login-card-shell--right">
        <div class="login-card login-card--clean login-card--offset" id="loginCard">
          <div class="login-header">
            ${renderLogoFade({ logos })}

            <h2>${escapeHtml(finalTitle)}</h2>

            <p class="login-subtitle">
              ${escapeHtml(subtitle)}
            </p>
          </div>

          <form id="loginForm" class="login-form" novalidate>
            <input
              type="hidden"
              name="redirect"
              value="${escapeHtml(redirect || "")}"
            >

            <div class="login-field">
              <input
                type="text"
                id="username"
                name="identifier"
                class="input-text"
                placeholder="${escapeHtml(identifierPlaceholder)}"
                autocomplete="username"
                inputmode="email"
                spellcheck="false"
                autocapitalize="off"
                required
                aria-invalid="false"
                data-auth-identifier="true"
              >
            </div>

            <div class="login-field password-wrapper">
              <input
                type="password"
                id="password"
                name="password"
                class="input-text"
                placeholder="${escapeHtml(passwordPlaceholder)}"
                autocomplete="current-password"
                required
                minlength="6"
                aria-invalid="false"
                data-auth-password="true"
              >

              <button
                type="button"
                class="password-toggle"
                id="togglePassword"
                aria-label="Mostrar contraseña"
                aria-pressed="false"
                title="Mostrar contraseña"
                data-toggle-password="true"
              >
                ${getEyeOpenIcon()}
                ${getEyeClosedIcon()}
              </button>

              <div
                id="capsIndicator"
                class="caps-indicator"
                aria-live="polite"
                aria-atomic="true"
                hidden
              >
                ${getCapsIcon()}
                <span id="capsLabel" class="caps-label" hidden>
                  Bloq mayús
                </span>
              </div>
            </div>

            <div class="login-options">
              <label class="login-check" for="loginRemember">
                <input
                  id="loginRemember"
                  type="checkbox"
                  name="remember"
                >
                <span>${escapeHtml(rememberLabel)}</span>
              </label>

              <span class="login-meta">${escapeHtml(secureMeta)}</span>
            </div>

            <button
              type="submit"
              class="login-button"
              id="loginButton"
            >
              <span class="login-submit-text">${escapeHtml(submitLabel)}</span>
            </button>

            <div class="login-reset">
              <a
                href="${escapeHtml(forgotPasswordHref)}"
                id="forgotPasswordLink"
                class="login-reset-link"
                data-spa
              >
                ${escapeHtml(forgotLabel)}
              </a>
            </div>
          </form>

          <div class="login-footer">
            © ${escapeHtml(currentYear)} ${escapeHtml(appName)} · v${escapeHtml(appVersion)}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function getLoginTemplate(options = {}) {
  const {
    appName = "Onion Support",
    appVersion = "1.0.0",
    currentYear = new Date().getFullYear(),
    redirect = "",
  } = options;

  return `
    <section
      class="login-view login-view--clean"
      data-view="login"
      data-login-view="true"
      aria-label="Pantalla de acceso"
    >
      ${renderToast()}

      <div class="login-scene">
        <div class="login-grid login-grid--clean" id="loginGrid">
          ${renderLeftPanel(options)}

          ${renderForm({
            ...options,
            appName,
            appVersion,
            currentYear,
            redirect,
          })}
        </div>
      </div>
    </section>
  `;
}

export { getLoginTemplate as LoginTemplate };
export default getLoginTemplate;
