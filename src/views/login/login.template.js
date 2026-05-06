/* =========================================================
   Onion SPA - Login Template
   Archivo: src/views/login/login.template.js

   AUTH TEMPLATE · CSP CLEAN · NO CSS INLINE · NO STYLE TAGS
   FINAL PRO SYSTEM · TOKEN PRO SYSTEM · 10/10

   RESPONSABILIDADES:
   - generar el HTML del login alineado con /src/css/auth/login.css
   - centralizar el markup premium de la vista
   - mantener IDs y data-hooks estables para login.dom.js
   - respetar el sistema visual auth-screen / login-grid / login-card
   - unificar forgot password hacia /reset-password
   - soportar usuario o email
   - usar logo real de empresa según tema activo
   - reutilizar el sistema compartido de password-field
   - dejar toda la capa visual en CSS externo

   IMPORTANTE:
   - Sin <style>.
   - Sin style="".
   - Sin CSS inyectado por JS.
   - Sin duplicidades visuales.
   - El CSS debe vivir en /src/css/auth/login.css.
========================================================= */

import { escapeHtml } from "./login.helpers.js";
import { renderPasswordField } from "../../shared/password-field/index.js";

/* =========================================================
   SAFE HELPERS
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

function hasText(value = "") {
  return safeText(value, "") !== "";
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
      aria-label="${escapeHtml(finalAlt)}"
      data-login-logo="true"
    >
      <img
        class="login-logo-theme-img login-logo-theme-dark"
        src="${escapeHtml(darkSrc)}"
        alt=""
        width="44"
        height="44"
        loading="eager"
        decoding="async"
        aria-hidden="true"
      />

      <img
        class="login-logo-theme-img login-logo-theme-light"
        src="${escapeHtml(lightSrc)}"
        alt=""
        width="44"
        height="44"
        loading="eager"
        decoding="async"
        aria-hidden="true"
      />
    </span>
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
  heroEyebrow = "ONION SUPPORT · ENTORNO PROTEGIDO",
  heroTitle = "Acceso seguro al panel de operaciones",
  bullets = [],
} = {}) {
  const customSignals = safeArray(bullets)
    .map((item) => safeText(item, ""))
    .filter(Boolean);

  const finalSignals = customSignals.length
    ? customSignals
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

/* =========================================================
   FORM
========================================================= */

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
  const finalAppName = safeText(appName, "Onion Support");
  const finalIdentifier = safeText(identifier, "");
  const finalSubtitle = safeText(subtitle, `Iniciar sesión en ${finalAppName}`);

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
                alt: finalAppName,
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
            data-login-form="true"
            novalidate
          >
            <div
              class="login-field"
              data-field="email"
              data-login-field="identifier"
            >
              <input
                class="input-text"
                id="loginEmail"
                name="email"
                type="text"
                autocomplete="username"
                inputmode="email"
                placeholder="Usuario o email"
                value="${escapeHtml(finalIdentifier)}"
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
              <label class="login-check" for="loginRemember">
                <input
                  id="loginRemember"
                  name="remember"
                  type="checkbox"
                  ${hasText(finalIdentifier) ? "checked" : ""}
                />
                <span>${escapeHtml(rememberLabel)}</span>
              </label>

              <div class="login-meta" aria-label="Estado de conexión">
                <span>Conexión segura</span>
              </div>
            </div>

            <div
              class="login-error"
              id="loginError"
              role="alert"
              aria-live="polite"
              aria-atomic="true"
            ></div>

            <button
              class="login-button"
              id="loginSubmit"
              type="submit"
              data-login-submit="true"
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
  const appName = safeText(options?.appName, "Onion Support");

  return `
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

/* =========================================================
   EXPORTS
========================================================= */

export { getLoginTemplate as LoginTemplate };

export default getLoginTemplate;
