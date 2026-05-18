/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/login/login.template.js

   Responsabilidad:
   - Pintar la vista de login.
   - Consumir el password-field compartido.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast directo.
   - Sin duplicar lógica del password.
========================================================= */

import { renderPasswordField } from "../../shared/password-field/password-field.template.js";

export const TEMPLATE_VERSION = "simple-2";

const DEFAULT_APP_NAME = "Onion Support";
const DEFAULT_LOGO = "/src/media/img/favicon_black_circle.png?v=6";
const DEFAULT_PASSWORD_REQUEST_HREF = "/password-request";

/* =========================================================
   HELPERS
========================================================= */

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value = "") {
  return escapeHtml(text(value, ""));
}

function safeInternalHref(value = "", fallback = DEFAULT_PASSWORD_REQUEST_HREF) {
  const raw = text(value, "");
  const fallbackHref = text(fallback, DEFAULT_PASSWORD_REQUEST_HREF);

  if (!raw) return fallbackHref;
  if (!raw.startsWith("/")) return fallbackHref;
  if (raw.startsWith("//")) return fallbackHref;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackHref;
  if (/[\r\n\t\\]/.test(raw)) return fallbackHref;

  return raw.replace(/\/{2,}/g, "/") || fallbackHref;
}

function safeAssetSrc(value = "", fallback = DEFAULT_LOGO) {
  const raw = text(value, "");
  const fallbackSrc = text(fallback, DEFAULT_LOGO);

  if (!raw) return fallbackSrc;
  if (!raw.startsWith("/")) return fallbackSrc;
  if (raw.startsWith("//")) return fallbackSrc;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackSrc;
  if (/[\r\n\t\\]/.test(raw)) return fallbackSrc;

  return raw;
}

function normalizeIdentifier(value = "") {
  return text(value, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const clean = String(value ?? "").trim().toLowerCase();

  if (["1", "true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["0", "false", "no", "off"].includes(clean)) return false;

  return fallback;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getLoginTemplate(options = {}) {
  const appName = text(options.appName, DEFAULT_APP_NAME);
  const logoSrc = safeAssetSrc(options.logoSrc, DEFAULT_LOGO);

  const title = text(options.title, "Iniciar sesión");
  const subtitle = text(options.subtitle, `Accede a ${appName}`);

  const heroTitle = text(options.heroTitle, "Soporte simple. Trabajo rápido.");
  const heroText = text(
    options.heroText,
    "Gestiona tickets, clientes y facturas desde un único panel privado."
  );

  const identifier = normalizeIdentifier(options.identifier);
  const identifierLabel = text(options.identifierLabel, "Usuario o email");
  const identifierPlaceholder = text(options.identifierPlaceholder, "Usuario o email");

  const passwordLabel = text(options.passwordLabel, "Contraseña");
  const passwordPlaceholder = text(options.passwordPlaceholder, "Contraseña");

  const rememberLabel = text(options.rememberLabel, "Recordarme");
  const submitLabel = text(options.submitLabel, "Entrar");

  const passwordRequestLabel = text(
    options.passwordRequestLabel || options.forgotLabel,
    "¿Has olvidado tu contraseña?"
  );

  const passwordRequestHref = safeInternalHref(
    options.passwordRequestHref || options.forgotPasswordHref,
    DEFAULT_PASSWORD_REQUEST_HREF
  );

  const rememberChecked = bool(options.remember, Boolean(identifier));

  const passwordFieldHtml = renderPasswordField({
    id: "loginPassword",
    name: "password",
    fieldDataName: "password",

    label: passwordLabel,
    placeholder: passwordPlaceholder,
    autocomplete: "current-password",
    required: true,

    fieldClass: "login-field login-field--password",
    wrapperClass: "password-wrapper login-password-wrapper",
    inputClass: "input-text login-input",
    labelClass: "login-label",
    toggleClass: "password-toggle login-password-toggle",

    inputDataAttrs: {
      loginPassword: true,
      loginPasswordInput: true,
      i18nPlaceholder: "login.passwordPlaceholder",
    },

    rootDataAttrs: {
      i18nScope: "login",
    },
  });

  return `
    <section
      class="login-view"
      id="loginView"
      data-view="login"
      data-view-name="login"
      data-login-view="true"
      data-i18n-scope="login"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
    >
      <div class="login-shell">
        <aside class="login-visual" aria-label="${escapeAttr(appName)}">
          <div class="login-visual-brand">
            <img
              class="login-visual-logo"
              src="${escapeAttr(logoSrc)}"
              alt=""
              width="72"
              height="72"
              loading="eager"
              decoding="async"
              draggable="false"
              aria-hidden="true"
            />

            <strong>${escapeHtml(appName)}</strong>
          </div>

          <div class="login-visual-copy">
            <h2 data-i18n="login.heroTitle">${escapeHtml(heroTitle)}</h2>
            <p data-i18n="login.heroText">${escapeHtml(heroText)}</p>
          </div>
        </aside>

        <main class="login-main">
          <article class="login-card" aria-labelledby="loginTitle">
            <header class="login-header">
              <img
                class="login-logo"
                src="${escapeAttr(logoSrc)}"
                alt=""
                width="52"
                height="52"
                loading="eager"
                decoding="async"
                draggable="false"
                aria-hidden="true"
              />

              <h1 class="login-title" id="loginTitle" data-i18n="login.title">
                ${escapeHtml(title)}
              </h1>

              <p class="login-subtitle" id="loginDescription" data-i18n="login.subtitle">
                ${escapeHtml(subtitle)}
              </p>
            </header>

            <form
              class="login-form"
              id="loginForm"
              data-login-form="true"
              data-auth-form="login"
              data-toast-scope="auth.login"
              aria-describedby="loginDescription loginMessage"
              autocomplete="on"
              novalidate
            >
              <div
                class="login-message"
                id="loginMessage"
                data-login-message="true"
                data-login-error="true"
                data-toast-anchor="login"
                role="alert"
                aria-live="polite"
                aria-atomic="true"
                hidden
              ></div>

              <div class="login-field login-field--identifier" data-login-field="identifier">
                <label
                  class="login-label"
                  for="loginIdentifier"
                  data-i18n="login.identifierLabel"
                >
                  ${escapeHtml(identifierLabel)}
                </label>

                <input
                  class="input-text login-input"
                  id="loginIdentifier"
                  name="identifier"
                  type="text"
                  autocomplete="username"
                  inputmode="text"
                  autocapitalize="none"
                  spellcheck="false"
                  placeholder="${escapeAttr(identifierPlaceholder)}"
                  value="${escapeAttr(identifier)}"
                  data-login-identifier="true"
                  data-i18n-placeholder="login.identifierPlaceholder"
                  aria-invalid="false"
                  required
                />
              </div>

              ${passwordFieldHtml}

              <div class="login-options">
                <label class="login-check" for="loginRemember">
                  <input
                    id="loginRemember"
                    name="remember"
                    type="checkbox"
                    value="1"
                    data-login-remember="true"
                    ${rememberChecked ? "checked" : ""}
                  />

                  <span data-i18n="login.rememberLabel">${escapeHtml(rememberLabel)}</span>
                </label>

                <a
                  class="login-reset-link"
                  href="${escapeAttr(passwordRequestHref)}"
                  data-spa
                  data-login-password-request="true"
                  data-i18n="login.passwordRequestLabel"
                >
                  ${escapeHtml(passwordRequestLabel)}
                </a>
              </div>

              <button
                class="login-button"
                id="loginSubmit"
                type="submit"
                data-login-submit="true"
              >
                <span data-i18n="login.submitLabel">${escapeHtml(submitLabel)}</span>
              </button>
            </form>
          </article>
        </main>
      </div>
    </section>
  `;
}

export { getLoginTemplate as LoginTemplate };

export default getLoginTemplate;
