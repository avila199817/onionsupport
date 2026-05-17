/* =========================================================
   Onion SPA - Login Template
   Archivo: src/views/login/login.template.js

   LOGIN TEMPLATE · SIMPLE
   - HTML puro del login
   - IDs/data-hooks estables para login.dom.js
   - sin <style>, sin style="", sin CSS por JS
   - sin Auth, HTTP, Router, Store ni Toast
   - password-field compartido con fallback local
   - href/src saneados
========================================================= */

import { escapeHtml } from "./login.helpers.js";
import { renderPasswordField } from "../../shared/password-field/index.js";

export const TEMPLATE_VERSION = "21.0.0-simple";

const DEFAULT_APP_NAME = "Onion Support";
const DEFAULT_FORGOT_PASSWORD_HREF = "/reset-password";
const DEFAULT_LOGO_DARK = "/src/media/img/favicon_white.png";
const DEFAULT_LOGO_LIGHT = "/src/media/img/favicon_black.png";

const DEFAULT_SIGNALS = Object.freeze([
  "Autenticación robusta del sistema",
  "Sesión protegida con refresh seguro",
  "Acceso estable al entorno operativo",
]);

const SAFE_INTERNAL_HREF_FALLBACK = DEFAULT_FORGOT_PASSWORD_HREF;

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasText(value = "") {
  return safeText(value, "") !== "";
}

function escapeAttr(value = "") {
  return escapeHtml(safeText(value, ""));
}

function isSafeRelativePath(value = "") {
  const raw = safeText(value, "");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || /[\r\n\t\\]/.test(raw)) return false;

  const lower = raw.toLowerCase();
  if (lower.includes("%0d") || lower.includes("%0a") || lower.includes("%09") || lower.includes("%5c")) return false;

  try {
    const decoded = decodeURIComponent(raw).trim().replace(/\\/g, "/");
    return !(decoded.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(decoded) || /[\r\n\t]/.test(decoded));
  } catch {
    return false;
  }
}

function normalizeInternalHref(value = "", fallback = SAFE_INTERNAL_HREF_FALLBACK) {
  const cleanFallback = isSafeRelativePath(fallback) ? fallback : SAFE_INTERNAL_HREF_FALLBACK;
  const raw = safeText(value, "");

  if (!raw || !isSafeRelativePath(raw)) return cleanFallback;
  return raw.replace(/\\/g, "/").replace(/\/{2,}/g, "/") || cleanFallback;
}

function isSafeAssetSrc(value = "") {
  const raw = safeText(value, "");
  if (!raw) return false;

  const lower = raw.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("data:text/html") || lower.startsWith("data:application/") || lower.startsWith("data:image/svg")) return false;
  if (lower.startsWith("data:")) return /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(raw);

  return /^\/(?!\/)/.test(raw) || /^\.\/?\.?\//.test(raw);
}

function normalizeAssetSrc(value = "", fallback = "") {
  const raw = safeText(value, "");
  if (isSafeAssetSrc(raw)) return raw;
  return isSafeAssetSrc(fallback) ? fallback : "";
}

function normalizeIdentifierForValue(value = "") {
  return safeText(value, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function normalizeSignalList(value = []) {
  const custom = safeArray(value)
    .map((item) => safeText(item, ""))
    .filter(Boolean);

  return custom.length ? custom : [...DEFAULT_SIGNALS];
}

/* =========================================================
   PARTIALS
========================================================= */

function renderThemeIcon() {
  return `
    <span class="login-theme-toggle-icon" aria-hidden="true">
      <span class="login-theme-toggle-orb"></span>
    </span>
  `;
}

function renderThemeLogo({
  darkSrc = DEFAULT_LOGO_DARK,
  lightSrc = DEFAULT_LOGO_LIGHT,
  alt = DEFAULT_APP_NAME,
} = {}) {
  const finalAlt = safeText(alt, DEFAULT_APP_NAME);
  const finalDarkSrc = normalizeAssetSrc(darkSrc, DEFAULT_LOGO_DARK);
  const finalLightSrc = normalizeAssetSrc(lightSrc, DEFAULT_LOGO_LIGHT);

  return `
    <span class="login-logo-theme" aria-label="${escapeAttr(finalAlt)}" data-login-logo="true">
      <img
        class="login-logo-theme-img login-logo-theme-dark"
        src="${escapeAttr(finalDarkSrc)}"
        alt=""
        width="44"
        height="44"
        loading="eager"
        decoding="async"
        fetchpriority="high"
        draggable="false"
        aria-hidden="true"
      />

      <img
        class="login-logo-theme-img login-logo-theme-light"
        src="${escapeAttr(finalLightSrc)}"
        alt=""
        width="44"
        height="44"
        loading="eager"
        decoding="async"
        fetchpriority="high"
        draggable="false"
        aria-hidden="true"
      />
    </span>
  `;
}

function renderSignalItem(text = "") {
  const label = safeText(text, "");
  if (!label) return "";

  return `
    <div class="login-signal-item" data-login-signal="true">
      <span class="dot" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function renderLeftPanel({
  heroEyebrow = "ONION SUPPORT · ENTORNO PROTEGIDO",
  heroTitle = "Acceso seguro al panel de operaciones",
  heroText = "",
  bullets = [],
} = {}) {
  const cleanHeroText = safeText(heroText, "");
  const signals = normalizeSignalList(bullets);

  return `
    <aside class="login-side login-side-left login-side-left--raised" aria-label="Estado del acceso" data-login-side="left">
      <div class="login-side-panel login-side-panel--status">
        <div class="login-side-eyebrow">${escapeHtml(heroEyebrow)}</div>

        <h3>${escapeHtml(heroTitle)}</h3>

        ${cleanHeroText ? `<p class="login-side-text">${escapeHtml(cleanHeroText)}</p>` : ""}

        <div class="login-signal-list" data-login-signal-list="true">
          ${signals.map(renderSignalItem).join("")}
        </div>
      </div>
    </aside>
  `;
}

function renderFieldError({ id = "", field = "" } = {}) {
  const finalId = safeText(id, "");
  const finalField = safeText(field, "");

  return `
    <p
      ${finalId ? `id="${escapeAttr(finalId)}"` : ""}
      class="login-field-error"
      data-error-for="${escapeAttr(finalField)}"
      data-login-error-for="${escapeAttr(finalField)}"
      aria-live="polite"
      aria-atomic="true"
      hidden
    ></p>
  `;
}

function renderPasswordFallbackControl() {
  return `
    <div class="password-wrapper" data-password-wrapper="true">
      <input
        class="input-text"
        id="loginPassword"
        name="password"
        type="password"
        autocomplete="current-password"
        placeholder="Contraseña"
        aria-label="Contraseña"
        data-login-password="true"
        data-password-input="true"
        required
      />

      <button
        class="password-toggle"
        id="togglePassword"
        type="button"
        aria-label="Mostrar contraseña"
        aria-pressed="false"
        data-password-toggle="true"
        data-login-password-toggle="true"
        data-show-label="Mostrar contraseña"
        data-hide-label="Ocultar contraseña"
      >
        <span class="password-toggle-icon" data-password-toggle-icon="true" aria-hidden="true"></span>
      </button>
    </div>

    <div
      class="password-caps"
      id="loginCapsIndicator"
      data-password-caps="true"
      data-login-caps="true"
      aria-live="polite"
      hidden
    >Bloq Mayús</div>
  `;
}

function renderPasswordSharedControl() {
  try {
    if (typeof renderPasswordField !== "function") return "";

    const html = renderPasswordField({
      escapeHtml,
      fieldId: "loginPasswordField",
      inputId: "loginPassword",
      id: "loginPassword",
      fieldName: "password",
      name: "password",
      placeholder: "Contraseña",
      ariaLabel: "Contraseña",
      autocomplete: "current-password",
      fieldClass: "password-field login-password-field",
      rootClass: "password-field login-password-field",
      fieldDataName: "password",
      dataField: "password",
      wrapperClass: "password-wrapper",
      inputClass: "input-text",
      toggleId: "togglePassword",
      toggleClass: "password-toggle",
      capsId: "loginCapsIndicator",
      required: true,
      showCapsIndicator: true,
      capsLabel: "Bloq Mayús",
      toggleLabelShow: "Mostrar contraseña",
      toggleLabelHide: "Ocultar contraseña",
      dataAttrs: {
        loginPassword: "true",
        passwordInput: "true",
      },
    });

    return typeof html === "string" && hasText(html) ? html : "";
  } catch {
    return "";
  }
}

function renderLoginPasswordField() {
  return `
    <div class="login-field" data-field="password" data-login-field="password" data-login-password-field="true">
      ${renderPasswordSharedControl() || renderPasswordFallbackControl()}
      ${renderFieldError({ id: "loginPasswordError", field: "password" })}
    </div>
  `;
}

function renderForm({
  identifier = "",
  appName = DEFAULT_APP_NAME,
  title = "Iniciar sesión",
  subtitle = "",
  submitLabel = "Iniciar sesión",
  rememberLabel = "Recordarme",
  forgotLabel = "¿Has olvidado tu contraseña?",
  forgotPasswordHref = DEFAULT_FORGOT_PASSWORD_HREF,
  footerText = "Entorno protegido. Usa tus credenciales corporativas autorizadas.",
  secureLabel = "Conexión segura",
  themeToggleLabel = "Cambiar tema",
  logoDarkSrc = DEFAULT_LOGO_DARK,
  logoLightSrc = DEFAULT_LOGO_LIGHT,
  showThemeToggle = true,
} = {}) {
  const finalAppName = safeText(appName, DEFAULT_APP_NAME);
  const finalIdentifier = normalizeIdentifierForValue(identifier);
  const finalTitle = safeText(title, "Iniciar sesión");
  const finalSubtitle = safeText(subtitle, `Iniciar sesión en ${finalAppName}`);
  const finalSubmitLabel = safeText(submitLabel, "Iniciar sesión");
  const finalRememberLabel = safeText(rememberLabel, "Recordarme");
  const finalForgotLabel = safeText(forgotLabel, "¿Has olvidado tu contraseña?");
  const finalForgotHref = normalizeInternalHref(forgotPasswordHref, DEFAULT_FORGOT_PASSWORD_HREF);
  const finalFooterText = safeText(footerText, "Entorno protegido. Usa tus credenciales corporativas autorizadas.");
  const finalSecureLabel = safeText(secureLabel, "Conexión segura");
  const finalThemeToggleLabel = safeText(themeToggleLabel, "Cambiar tema");

  return `
    <section class="login-stage login-stage--right" aria-label="Formulario de acceso" data-login-stage="form">
      <div class="login-card-shell login-card-shell--right">
        <div class="login-card login-card--offset login-card--clean">
          <header class="login-header">
            <div class="login-header-top">
              <div class="logo-fade" aria-hidden="true">
                ${renderThemeLogo({ darkSrc: logoDarkSrc, lightSrc: logoLightSrc, alt: finalAppName })}
              </div>

              ${showThemeToggle === false ? "" : `
                <button
                  class="login-theme-toggle"
                  id="loginThemeToggle"
                  type="button"
                  aria-label="${escapeAttr(finalThemeToggleLabel)}"
                  data-login-theme-toggle="true"
                  data-theme-toggle="true"
                >
                  ${renderThemeIcon()}
                </button>
              `}
            </div>

            <h1 class="login-title">${escapeHtml(finalTitle)}</h1>
            <p class="login-subtitle" id="loginDescription">${escapeHtml(finalSubtitle)}</p>
          </header>

          <form
            class="login-form"
            id="loginForm"
            data-login-form="true"
            data-auth-form="login"
            aria-describedby="loginDescription loginError"
            novalidate
          >
            <div class="login-field" data-field="identifier" data-login-field="identifier">
              <input
                class="input-text"
                id="loginIdentifier"
                name="identifier"
                type="text"
                autocomplete="username"
                inputmode="text"
                autocapitalize="none"
                spellcheck="false"
                placeholder="Usuario, email o teléfono"
                value="${escapeAttr(finalIdentifier)}"
                aria-label="Usuario, email o teléfono"
                aria-describedby="loginIdentifierError"
                data-login-identifier="true"
                required
              />

              ${renderFieldError({ id: "loginIdentifierError", field: "identifier" })}
            </div>

            ${renderLoginPasswordField()}

            <div class="login-options">
              <label class="login-check" for="loginRemember">
                <input
                  id="loginRemember"
                  name="remember"
                  type="checkbox"
                  value="1"
                  data-login-remember="true"
                  ${hasText(finalIdentifier) ? "checked" : ""}
                />
                <span>${escapeHtml(finalRememberLabel)}</span>
              </label>

              <div class="login-meta" aria-label="Estado de conexión" data-login-secure-meta="true">
                <span>${escapeHtml(finalSecureLabel)}</span>
              </div>
            </div>

            <div
              class="login-error is-empty"
              id="loginError"
              aria-live="polite"
              aria-atomic="true"
              data-login-error="true"
              data-form-error="true"
              hidden
            ></div>

            <button class="login-button" id="loginSubmit" type="submit" data-login-submit="true">
              <span class="login-submit-text" data-login-submit-text="true">${escapeHtml(finalSubmitLabel)}</span>
            </button>

            <div class="login-reset">
              <a
                class="login-reset-link"
                href="${escapeAttr(finalForgotHref)}"
                id="forgotPasswordLink"
                data-spa
                data-forgot-password-link="true"
                data-login-forgot-password="true"
              >${escapeHtml(finalForgotLabel)}</a>
            </div>
          </form>

          <footer class="login-footer">
            <span>${escapeHtml(finalFooterText)}</span>
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
  const appName = safeText(options?.appName, DEFAULT_APP_NAME);

  return `
    <section
      class="login-view"
      id="loginView"
      data-view="login"
      data-view-name="login"
      data-login-view="true"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
    >
      <div class="login-scene">
        <div class="login-grid">
          ${renderLeftPanel({ ...options, appName })}
          ${renderForm({ ...options, appName })}
        </div>
      </div>
    </section>
  `;
}

export { getLoginTemplate as LoginTemplate };

export default getLoginTemplate;
