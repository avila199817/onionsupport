/* =========================================================
   Onion SPA - Login Template
   Archivo: src/views/login/login.template.js

   AUTH TEMPLATE · CSP CLEAN · NO CSS INLINE · NO STYLE TAGS
   FINAL PRO SYSTEM · TOKEN PRO SYSTEM · 15/10

   RESPONSABILIDADES:
   - generar el HTML del login alineado con /src/css/auth/login.css
   - centralizar el markup premium de la vista
   - mantener IDs y data-hooks estables para login.dom.js
   - respetar el sistema visual auth-screen / login-grid / login-card
   - unificar forgot password hacia /reset-password
   - soportar usuario, email o teléfono como identificador
   - usar logo real de empresa según tema activo
   - reutilizar el sistema compartido de password-field
   - dejar toda la capa visual en CSS externo
   - incluir theme toggle si login.dom lo quiere enlazar
   - mantener accesibilidad básica sin title nativo
   - evitar href/src peligrosos
   - evitar HTML inyectable desde options

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
   CONSTANTS
========================================================= */

const TEMPLATE_VERSION =
  "15.0.0-final-extreme";

const DEFAULT_APP_NAME =
  "Onion Support";

const DEFAULT_FORGOT_PASSWORD_HREF =
  "/reset-password";

const DEFAULT_LOGO_DARK =
  "/src/media/img/favicon_white.png";

const DEFAULT_LOGO_LIGHT =
  "/src/media/img/favicon_black.png";

const DEFAULT_SIGNALS =
  Object.freeze([
    "Autenticación robusta del sistema",
    "Sesión protegida con refresh seguro",
    "Acceso estable al entorno operativo",
  ]);

const SAFE_INTERNAL_HREF_FALLBACK =
  DEFAULT_FORGOT_PASSWORD_HREF;

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value = "", fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function hasText(value = "") {
  return safeText(value, "") !== "";
}

function escapeAttr(value = "") {
  return escapeHtml(
    safeText(value, "")
  );
}

function isSafeRelativePath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  if (!raw.startsWith("/")) {
    return false;
  }

  if (raw.startsWith("//")) {
    return false;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return false;
  }

  if (/[\r\n\t]/.test(raw)) {
    return false;
  }

  if (
    raw.toLowerCase().includes("%0d") ||
    raw.toLowerCase().includes("%0a") ||
    raw.toLowerCase().includes("%09") ||
    raw.toLowerCase().includes("%5c") ||
    raw.includes("\\")
  ) {
    return false;
  }

  try {
    const decoded =
      decodeURIComponent(raw)
        .trim()
        .replace(/\\/g, "/");

    if (
      decoded.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

function normalizeInternalHref(value = "", fallback = SAFE_INTERNAL_HREF_FALLBACK) {
  const raw =
    safeText(value, "");

  const cleanFallback =
    isSafeRelativePath(fallback)
      ? fallback
      : SAFE_INTERNAL_HREF_FALLBACK;

  if (!raw) {
    return cleanFallback;
  }

  if (!isSafeRelativePath(raw)) {
    return cleanFallback;
  }

  return raw
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/") || cleanFallback;
}

function isSafeAssetSrc(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  const lower =
    raw.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:text/html") ||
    lower.startsWith("data:application/") ||
    lower.startsWith("data:image/svg")
  ) {
    return false;
  }

  if (lower.startsWith("data:")) {
    return /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(raw);
  }

  if (/^\/(?!\/)/.test(raw)) {
    return true;
  }

  if (/^\.\.?\//.test(raw)) {
    return true;
  }

  try {
    const parsed =
      new URL(
        raw,
        "http://localhost"
      );

    return [
      "http:",
      "https:",
    ].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizeAssetSrc(value = "", fallback = "") {
  const raw =
    safeText(value, "");

  if (isSafeAssetSrc(raw)) {
    return raw;
  }

  return isSafeAssetSrc(fallback)
    ? fallback
    : "";
}

function normalizeIdentifierForValue(value = "") {
  return safeText(value, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

/* =========================================================
   ICONS
========================================================= */

function renderThemeIcon() {
  return `
    <span class="login-theme-toggle-icon" aria-hidden="true">
      <span class="login-theme-toggle-orb"></span>
    </span>
  `;
}

/* =========================================================
   LOGO
========================================================= */

function renderThemeLogo({
  darkSrc = DEFAULT_LOGO_DARK,
  lightSrc = DEFAULT_LOGO_LIGHT,
  alt = DEFAULT_APP_NAME,
} = {}) {
  const finalAlt =
    safeText(
      alt,
      DEFAULT_APP_NAME
    );

  const finalDarkSrc =
    normalizeAssetSrc(
      darkSrc,
      DEFAULT_LOGO_DARK
    );

  const finalLightSrc =
    normalizeAssetSrc(
      lightSrc,
      DEFAULT_LOGO_LIGHT
    );

  return `
    <span
      class="login-logo-theme"
      aria-label="${escapeAttr(finalAlt)}"
      data-login-logo="true"
    >
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

/* =========================================================
   LEFT PANEL
========================================================= */

function renderSignalItem(text = "") {
  const label =
    safeText(text, "");

  if (!label) {
    return "";
  }

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
  const customSignals =
    safeArray(bullets)
      .map((item) =>
        safeText(item, "")
      )
      .filter(Boolean);

  const finalSignals =
    customSignals.length
      ? customSignals
      : [...DEFAULT_SIGNALS];

  const cleanHeroText =
    safeText(heroText, "");

  return `
    <aside
      class="login-side login-side-left login-side-left--raised"
      aria-label="Estado del acceso"
      data-login-side="left"
    >
      <div class="login-side-panel login-side-panel--status">
        <div class="login-side-eyebrow">
          ${escapeHtml(heroEyebrow)}
        </div>

        <h3>
          ${escapeHtml(heroTitle)}
        </h3>

        ${
          cleanHeroText
            ? `
              <p class="login-side-text">
                ${escapeHtml(cleanHeroText)}
              </p>
            `
            : ""
        }

        <div class="login-signal-list" data-login-signal-list="true">
          ${finalSignals.map(renderSignalItem).join("")}
        </div>
      </div>
    </aside>
  `;
}

/* =========================================================
   PASSWORD FIELD
========================================================= */

function renderPasswordFallback() {
  return `
    <div
      class="login-field"
      data-field="password"
      data-login-field="password"
      data-password-field="true"
    >
      <div class="password-wrapper" data-password-wrapper="true">
        <input
          class="input-text"
          id="loginPassword"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="Contraseña"
          aria-label="Contraseña"
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
          data-show-label="Mostrar contraseña"
          data-hide-label="Ocultar contraseña"
        >
          <span class="password-toggle-icon" aria-hidden="true"></span>
        </button>
      </div>

      <div
        class="password-caps"
        id="loginCapsIndicator"
        data-password-caps="true"
        aria-live="polite"
        hidden
      >
        Bloq Mayús
      </div>
    </div>
  `;
}

function renderLoginPasswordField() {
  try {
    if (typeof renderPasswordField === "function") {
      const html =
        renderPasswordField({
          escapeHtml,

          fieldId:
            "loginPassword",

          inputId:
            "loginPassword",

          id:
            "loginPassword",

          fieldName:
            "password",

          name:
            "password",

          placeholder:
            "Contraseña",

          ariaLabel:
            "Contraseña",

          autocomplete:
            "current-password",

          fieldClass:
            "login-field",

          rootClass:
            "login-field",

          fieldDataName:
            "password",

          dataField:
            "password",

          wrapperClass:
            "password-wrapper",

          inputClass:
            "input-text",

          toggleId:
            "togglePassword",

          toggleClass:
            "password-toggle",

          capsId:
            "loginCapsIndicator",

          required:
            true,

          showCapsIndicator:
            true,

          capsLabel:
            "Bloq Mayús",

          toggleLabelShow:
            "Mostrar contraseña",

          toggleLabelHide:
            "Ocultar contraseña",
        });

      if (hasText(html)) {
        return html;
      }
    }
  } catch {}

  return renderPasswordFallback();
}

/* =========================================================
   FORM
========================================================= */

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
  const finalAppName =
    safeText(
      appName,
      DEFAULT_APP_NAME
    );

  const finalIdentifier =
    normalizeIdentifierForValue(identifier);

  const finalTitle =
    safeText(
      title,
      "Iniciar sesión"
    );

  const finalSubtitle =
    safeText(
      subtitle,
      `Iniciar sesión en ${finalAppName}`
    );

  const finalSubmitLabel =
    safeText(
      submitLabel,
      "Iniciar sesión"
    );

  const finalRememberLabel =
    safeText(
      rememberLabel,
      "Recordarme"
    );

  const finalForgotLabel =
    safeText(
      forgotLabel,
      "¿Has olvidado tu contraseña?"
    );

  const finalForgotHref =
    normalizeInternalHref(
      forgotPasswordHref,
      DEFAULT_FORGOT_PASSWORD_HREF
    );

  const finalFooterText =
    safeText(
      footerText,
      "Entorno protegido. Usa tus credenciales corporativas autorizadas."
    );

  const finalSecureLabel =
    safeText(
      secureLabel,
      "Conexión segura"
    );

  const finalThemeToggleLabel =
    safeText(
      themeToggleLabel,
      "Cambiar tema"
    );

  return `
    <section
      class="login-stage login-stage--right"
      aria-label="Formulario de acceso"
      data-login-stage="form"
    >
      <div class="login-card-shell login-card-shell--right">
        <div class="login-card login-card--offset login-card--clean">
          <header class="login-header">
            <div class="login-header-top">
              <div class="logo-fade" aria-hidden="true">
                ${renderThemeLogo({
                  darkSrc:
                    logoDarkSrc,
                  lightSrc:
                    logoLightSrc,
                  alt:
                    finalAppName,
                })}
              </div>

              ${
                showThemeToggle === false
                  ? ""
                  : `
                    <button
                      class="login-theme-toggle"
                      id="loginThemeToggle"
                      type="button"
                      aria-label="${escapeAttr(finalThemeToggleLabel)}"
                      data-login-theme-toggle="true"
                    >
                      ${renderThemeIcon()}
                    </button>
                  `
              }
            </div>

            <h1 class="login-title">
              ${escapeHtml(finalTitle)}
            </h1>

            <p
              class="login-subtitle"
              id="loginDescription"
            >
              ${escapeHtml(finalSubtitle)}
            </p>
          </header>

          <form
            class="login-form"
            id="loginForm"
            data-login-form="true"
            aria-describedby="loginDescription loginError"
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
                name="identifier"
                type="text"
                autocomplete="username"
                inputmode="email"
                placeholder="Usuario o email"
                value="${escapeAttr(finalIdentifier)}"
                aria-label="Usuario o email"
                data-login-identifier="true"
                required
              />
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

              <div
                class="login-meta"
                aria-label="Estado de conexión"
                data-login-secure-meta="true"
              >
                <span>${escapeHtml(finalSecureLabel)}</span>
              </div>
            </div>

            <div
              class="login-error"
              id="loginError"
              role="alert"
              aria-live="polite"
              aria-atomic="true"
              data-login-error="true"
            ></div>

            <button
              class="login-button"
              id="loginSubmit"
              type="submit"
              data-login-submit="true"
            >
              <span class="login-submit-text">
                ${escapeHtml(finalSubmitLabel)}
              </span>
            </button>

            <div class="login-reset">
              <a
                class="login-reset-link"
                href="${escapeAttr(finalForgotHref)}"
                id="forgotPasswordLink"
                data-spa
                data-login-forgot-link="true"
              >
                ${escapeHtml(finalForgotLabel)}
              </a>
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
  const appName =
    safeText(
      options?.appName,
      DEFAULT_APP_NAME
    );

  return `
    <section
      class="login-view"
      data-view="login"
      data-login-view="true"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
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

export {
  TEMPLATE_VERSION,
  getLoginTemplate as LoginTemplate,
};

export default getLoginTemplate;
