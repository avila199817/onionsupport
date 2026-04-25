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
   - montar password-field estable con toggle visible/oculto
   - evitar que el botón del ojo dispare submit
   - mantener compatibilidad total con flujo SPA
========================================================= */

import { escapeHtml } from "./login.helpers.js";

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
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 5c5.2 0 8.9 4.2 10.3 6.1a1.5 1.5 0 0 1 0 1.8C20.9 14.8 17.2 19 12 19S3.1 14.8 1.7 12.9a1.5 1.5 0 0 1 0-1.8C3.1 9.2 6.8 5 12 5Zm0 2C7.9 7 4.8 10.1 3.5 12c1.3 1.9 4.4 5 8.5 5s7.2-3.1 8.5-5C19.2 10.1 16.1 7 12 7Zm0 2.25A2.75 2.75 0 1 1 12 14.75 2.75 2.75 0 0 1 12 9.25Zm0 2A.75.75 0 1 0 12 12.75.75.75 0 0 0 12 11.25Z"
      />
    </svg>
  `;
}

function getEyeOffIcon() {
  return `
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M3.28 2.22a1 1 0 0 0-1.42 1.42l3.03 3.03A16.4 16.4 0 0 0 1.7 11.1a1.5 1.5 0 0 0 0 1.8C3.1 14.8 6.8 19 12 19a10.3 10.3 0 0 0 4.1-.85l4.26 4.27a1 1 0 0 0 1.42-1.42L3.28 2.22ZM12 17c-4.1 0-7.2-3.1-8.5-5a14.3 14.3 0 0 1 2.83-3.88l2.04 2.04A3.74 3.74 0 0 0 13.84 15.63l.73.73A8.2 8.2 0 0 1 12 17Zm0-10c4.1 0 7.2 3.1 8.5 5a14.8 14.8 0 0 1-2.13 3.07l-1.42-1.42A3.74 3.74 0 0 0 10.35 7.05L8.9 5.6A10.2 10.2 0 0 1 12 5Zm2.73 5.43-3.16-3.16A1.75 1.75 0 0 1 14.73 12.43Zm-5.46-.86 3.16 3.16A1.75 1.75 0 0 1 9.27 11.57Z"
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

      .login-field--password{
        position:relative;
      }

      .login-field--password .password-wrapper{
        position:relative;
        width:100%;
        display:block;
      }

      .login-field--password .password-wrapper .input-text{
        width:100%;
        padding-right:52px;
      }

      .password-toggle,
      .login-password-toggle{
        position:absolute;
        top:50%;
        right:14px;
        width:34px;
        height:34px;
        border:0;
        border-radius:999px;
        transform:translateY(-50%);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        background:transparent;
        color:var(--text-dim, #64748b);
        cursor:pointer;
        z-index:2;
        transition:
          background .16s ease,
          color .16s ease,
          transform .16s ease,
          opacity .16s ease;
      }

      .password-toggle:hover,
      .login-password-toggle:hover{
        background:rgba(15,23,42,.055);
        color:var(--text-strong, #111827);
      }

      .password-toggle:focus-visible,
      .login-password-toggle:focus-visible{
        outline:2px solid color-mix(in srgb, var(--accent, #7c5cff) 58%, transparent);
        outline-offset:2px;
      }

      .password-toggle-icon--hide{
        display:none;
      }

      .password-wrapper[data-password-visible="true"] .password-toggle-icon--show{
        display:none;
      }

      .password-wrapper[data-password-visible="true"] .password-toggle-icon--hide{
        display:inline-flex;
      }

      .password-caps-indicator,
      .login-password-caps{
        margin-top:8px;
        min-height:18px;
        display:none;
        align-items:center;
        gap:6px;
        color:var(--warning-strong, #b7791f);
        font-size:11px;
        line-height:1.3;
        font-weight:700;
      }

      .password-caps-indicator.is-visible,
      .login-password-caps.is-visible,
      .password-caps-indicator[data-visible="true"],
      .login-password-caps[data-visible="true"]{
        display:inline-flex;
      }

      [data-theme="dark"] .password-toggle,
      [data-theme="dark"] .login-password-toggle{
        color:var(--text-dim, #94a3b8);
      }

      [data-theme="dark"] .password-toggle:hover,
      [data-theme="dark"] .login-password-toggle:hover{
        background:rgba(255,255,255,.08);
        color:var(--text-strong, #f8fafc);
      }
    </style>
  `;
}

/* =========================================================
   PASSWORD FIELD
========================================================= */

function renderLoginPasswordField({
  fieldId = "loginPassword",
  fieldName = "password",
  placeholder = "Contraseña",
  ariaLabel = "Contraseña",
  autocomplete = "current-password",
  capsLabel = "Bloq Mayús",
  toggleLabelShow = "Mostrar contraseña",
  toggleLabelHide = "Ocultar contraseña",
} = {}) {
  return `
    <div
      class="login-field login-field--password"
      data-field="password"
      data-password-field="true"
    >
      <div
        class="password-wrapper"
        data-password-wrapper="true"
        data-password-visible="false"
      >
        <input
          class="input-text"
          id="${escapeHtml(fieldId)}"
          name="${escapeHtml(fieldName)}"
          type="password"
          autocomplete="${escapeHtml(autocomplete)}"
          placeholder="${escapeHtml(placeholder)}"
          aria-label="${escapeHtml(ariaLabel)}"
          data-password-input="true"
          required
        />

        <button
          type="button"
          class="password-toggle login-password-toggle"
          id="loginPasswordToggle"
          data-password-toggle="true"
          data-password-target="${escapeHtml(fieldId)}"
          aria-label="${escapeHtml(toggleLabelShow)}"
          title="${escapeHtml(toggleLabelShow)}"
          aria-pressed="false"
          tabindex="0"
        >
          <span
            class="password-toggle-icon password-toggle-icon--show"
            data-password-icon-show="true"
            aria-hidden="true"
          >
            ${getEyeIcon()}
          </span>

          <span
            class="password-toggle-icon password-toggle-icon--hide"
            data-password-icon-hide="true"
            aria-hidden="true"
          >
            ${getEyeOffIcon()}
          </span>

          <span
            class="sr-only"
            data-password-toggle-text="true"
            hidden
          >
            ${escapeHtml(toggleLabelShow)}
          </span>
        </button>
      </div>

      <div
        class="password-caps-indicator login-password-caps"
        id="loginPasswordCaps"
        data-password-caps="true"
        data-visible="false"
        aria-live="polite"
      >
        <span class="dot" aria-hidden="true"></span>
        <span>${escapeHtml(capsLabel)}</span>
      </div>

      <template data-password-labels="true">
        <span data-show-label>${escapeHtml(toggleLabelShow)}</span>
        <span data-hide-label>${escapeHtml(toggleLabelHide)}</span>
      </template>
    </div>
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
  const hasIdentifier =
    Boolean(String(identifier || "").trim());

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
        <div
          class="login-card login-card--offset login-card--clean"
          id="loginCard"
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
            id="loginForm"
            novalidate
          >
            <div
              class="login-field"
              data-field="email"
            >
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

            ${renderLoginPasswordField({
              fieldId: "loginPassword",
              fieldName: "password",
              placeholder: "Contraseña",
              ariaLabel: "Contraseña",
              autocomplete: "current-password",
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

    <section
      class="login-view"
      data-view="login"
      data-login-view="true"
    >
      <div class="login-scene">
        <div
          class="login-grid"
          id="loginGrid"
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

export { getLoginTemplate as LoginTemplate };
export default getLoginTemplate;
