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
   - usar logo real de empresa según tema activo
   - reutilizar el sistema compartido de password-field
   - estabilizar visualmente el botón ojo del password-field compartido
========================================================= */

import { escapeHtml } from "./login.helpers.js";
import { renderPasswordField } from "../../shared/password-field/index.js";

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
   PASSWORD FIELD VISUAL PATCH

   Nota:
   - El comportamiento JS debe venir del shared:
     bindPasswordFieldsInScope(container)
   - Este bloque solo estabiliza layout/hover/focus.
========================================================= */

function renderScopedPasswordFieldStyle() {
  return `
    <style>
      .login-view [data-password-field="true"]{
        position:relative;
      }

      .login-view [data-password-field="true"] .password-wrapper{
        position:relative;
        display:block;
        width:100%;
      }

      .login-view [data-password-field="true"] .input-text{
        padding-right:58px;
      }

      .login-view [data-password-toggle="true"].password-toggle{
        position:absolute;
        top:50%;
        right:12px;

        width:36px;
        height:36px;
        min-width:36px;
        min-height:36px;

        padding:0;
        margin:0;

        border:0;
        border-radius:12px;
        outline:none;

        background:transparent;
        color:inherit;

        display:inline-flex;
        align-items:center;
        justify-content:center;

        line-height:1;
        cursor:pointer;

        transform:translate3d(0, -50%, 0);

        appearance:none;
        -webkit-appearance:none;

        box-shadow:none;

        transition:
          background .16s ease,
          color .16s ease,
          opacity .16s ease;
      }

      .login-view [data-password-toggle="true"].password-toggle:hover,
      .login-view [data-password-toggle="true"].password-toggle:focus,
      .login-view [data-password-toggle="true"].password-toggle:focus-visible,
      .login-view [data-password-toggle="true"].password-toggle:active{
        transform:translate3d(0, -50%, 0) !important;
        box-shadow:none;
      }

      .login-view [data-password-toggle="true"].password-toggle:hover{
        background:rgba(148,163,184,.12);
      }

      .login-view [data-password-toggle="true"].password-toggle svg{
        display:block;
        width:18px;
        height:18px;
        flex:0 0 auto;
        pointer-events:none;
      }

      .login-view [data-password-caps="true"].caps-indicator{
        position:absolute;
        top:50%;
        right:54px;

        transform:translate3d(0, -50%, 0);

        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:5px;

        min-height:24px;
        padding:0 8px;

        border-radius:999px;

        font-size:11px;
        font-weight:700;
        line-height:1;

        pointer-events:none;
        white-space:nowrap;
      }

      .login-view [data-password-caps="true"].caps-indicator[hidden]{
        display:none !important;
      }

      .login-view [data-password-caps="true"] .caps-icon{
        display:block;
        width:16px;
        height:16px;
        flex:0 0 auto;
      }

      @media (max-width: 520px){
        .login-view [data-password-field="true"] .input-text{
          padding-right:54px;
        }

        .login-view [data-password-toggle="true"].password-toggle{
          right:10px;
          width:34px;
          height:34px;
          min-width:34px;
          min-height:34px;
        }

        .login-view [data-password-caps="true"].caps-indicator{
          right:50px;
        }
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
  heroEyebrow = "ONION SUPPORT · ENTORNO PROTEGIDO",
  heroTitle = "Acceso seguro al panel de operaciones",
  bullets = [],
} = {}) {
  const finalSignals =
    safeArray(bullets).filter(Boolean).length
      ? safeArray(bullets).filter(Boolean)
      : [
          "Autenticación robusta del sistema",
          "Sesión protegida con refresh seguro",
          "Acceso estable al entorno operativo",
        ];

  return `
    <aside
      class="login-side login-side-left login-side-left--raised"
      aria-label="Estado del acceso"
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

function renderForm({
  identifier = "",
  appName = "Onion Support",
  title = "Iniciar sesión",
  subtitle = "",
  submitLabel = "Iniciar sesión",
  rememberLabel = "Recordarme",
  forgotLabel = "¿Has olvidado tu contraseña?",
  forgotPasswordHref = "/reset-password",
  footerText = "Entorno protegido. Usa tus credenciales corporativas autorizadas.",
  logoDarkSrc = "/src/media/img/favicon_white.png",
  logoLightSrc = "/src/media/img/favicon_black.png",
} = {}) {
  const hasIdentifier = Boolean(
    String(identifier || "").trim()
  );

  const finalSubtitle = safeText(
    subtitle,
    `Iniciar sesión en ${appName}`
  );

  return `
    <section
      class="login-stage login-stage--right"
      aria-label="Formulario de acceso"
    >
      <div class="login-card-shell login-card-shell--right">
        <div class="login-card login-card--offset login-card--clean">
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

            ${renderPasswordField({
              escapeHtml,
              fieldId: "loginPassword",
              fieldName: "password",
              placeholder: "Contraseña",
              ariaLabel: "Contraseña",
              autocomplete: "current-password",
              fieldClass: "login-field",
              fieldDataName: "password",
              wrapperClass: "password-wrapper",
              inputClass: "input-text",
              required: true,
              showCapsIndicator: true,
              capsLabel: "Bloq Mayús",
              toggleLabelShow: "Mostrar contraseña",
              toggleLabelHide: "Ocultar contraseña",
            })}

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
              <span class="login-submit-text">
                ${escapeHtml(submitLabel)}
              </span>
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
  const appName = safeText(
    options?.appName,
    "Onion Support"
  );

  return `
    ${renderScopedThemeLogoStyle()}
    ${renderScopedPasswordFieldStyle()}

    <section
      class="login-view"
      data-view="login"
      data-login-view="true"
    >
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
