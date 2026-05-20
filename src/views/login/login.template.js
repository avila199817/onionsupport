/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/login/login.template.js

   Responsabilidad:
   - Pintar un login simple y centrado.
   - Consumir el password-field compartido desde su fachada pública.
   - Textos base en castellano.
   - Rutas base desde core/config.js.
   - Usar logo corporativo canónico.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast directo.
   - Sin navegación.
   - Sin duplicar lógica del password.
   - Sin layout visual extra.
   - Sin /home.
   - Sin /403.
   - Sin /404.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  ROUTES,
} from "../../core/config.js";

import { renderPasswordField } from "../../shared/password-field/index.js";

export const TEMPLATE_VERSION = "login.template.v4";

const DEFAULT_APP_NAME = "Onion Support";

/*
  Logo corporativo canónico.
  El blanco se reserva para fondos oscuros si la capa visual lo necesita.
*/
const DEFAULT_LOGO = "/src/media/img/favicon_black.png";

const DEFAULT_PASSWORD_REQUEST_HREF =
  ROUTES.passwordRequest || "/password-request";

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PASSWORD_LENGTH = 1024;

const BLOCKED_HREFS = new Set([
  "/home",
  "/403",
  "/404",
  "/2fa",
  "/mfa",
  "/otp",
]);

/* =========================================================
   HELPERS
========================================================= */

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i.test(
    String(value || "")
  );
}

function normalizePath(value = "/", fallback = "/") {
  let path = text(value, fallback)
    .split("#")[0]
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  const cleanPath = path.split("?")[0];

  if (cleanPath.length > 1) {
    const normalized = cleanPath.replace(/\/+$/g, "") || fallback;
    const query = path.includes("?") ? `?${path.split("?").slice(1).join("?")}` : "";
    return `${normalized}${query}`;
  }

  return path || fallback;
}

function isBlockedHref(value = "") {
  const path = normalizePath(value, "/").split("?")[0].toLowerCase();

  if (BLOCKED_HREFS.has(path)) return true;

  return (
    path.startsWith("/2fa/") ||
    path.startsWith("/mfa/") ||
    path.startsWith("/otp/")
  );
}

function safeInternalHref(value = "", fallback = DEFAULT_PASSWORD_REQUEST_HREF) {
  const raw = text(value, "");
  const fallbackHref = normalizePath(fallback, DEFAULT_PASSWORD_REQUEST_HREF);

  if (!raw) return fallbackHref;
  if (!raw.startsWith("/")) return fallbackHref;
  if (raw.startsWith("//")) return fallbackHref;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackHref;
  if (/[\r\n\t\\]/.test(raw)) return fallbackHref;
  if (hasSensitiveQuery(raw)) return fallbackHref;
  if (isBlockedHref(raw)) return fallbackHref;

  return normalizePath(raw, fallbackHref) || fallbackHref;
}

function safeAssetSrc(value = "", fallback = DEFAULT_LOGO) {
  const raw = text(value, "");
  const fallbackSrc = text(fallback, DEFAULT_LOGO);

  if (!raw) return fallbackSrc;
  if (!raw.startsWith("/")) return fallbackSrc;
  if (raw.startsWith("//")) return fallbackSrc;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackSrc;
  if (/[\r\n\t\\]/.test(raw)) return fallbackSrc;
  if (hasSensitiveQuery(raw)) return fallbackSrc;

  return raw.replace(/\/{2,}/g, "/") || fallbackSrc;
}

function normalizeIdentifier(value = "") {
  return text(value, "")
    .normalize("NFKC")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, MAX_IDENTIFIER_LENGTH);
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const clean = String(value ?? "").trim().toLowerCase();

  if (["1", "true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["0", "false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

/* =========================================================
   PASSWORD FIELD
========================================================= */

function renderLoginPasswordField({ label = "", placeholder = "" } = {}) {
  return renderPasswordField({
    id: "loginPassword",
    name: "password",
    fieldDataName: "password",

    label: text(label, "Contraseña"),
    placeholder: text(placeholder, "Contraseña"),

    autocomplete: "current-password",
    required: true,
    maxLength: MAX_PASSWORD_LENGTH,

    showToggle: true,
    showCapsIndicator: true,
    capsLabel: "Bloq Mayús",

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

    toggleDataAttrs: {
      loginPasswordToggle: true,
    },

    rootDataAttrs: {
      loginField: "password",
      loginPasswordField: true,
      i18nScope: "login",
    },
  });
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getLoginTemplate(options = {}) {
  const appName = text(options.appName, DEFAULT_APP_NAME);
  const logoSrc = safeAssetSrc(options.logoSrc, DEFAULT_LOGO);

  const title = text(options.title, "Iniciar sesión");
  const subtitle = text(options.subtitle, `Accede a ${appName}`);

  const identifier = normalizeIdentifier(options.identifier);
  const identifierLabel = text(options.identifierLabel, "Usuario o email");

  const identifierPlaceholder = text(
    options.identifierPlaceholder,
    "Usuario o email"
  );

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

  const rememberChecked = bool(options.remember, false);

  return `
    <section
      class="login-view login-view--centered"
      id="loginView"
      data-view="login"
      data-view-name="login"
      data-login-view="true"
      data-i18n-scope="login"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
      aria-labelledby="loginTitle"
      aria-describedby="loginDescription"
    >
      <div class="login-shell" data-login-shell="true">
        <article class="login-card" data-login-card="true">
          <header class="login-header" data-login-header="true">
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
              data-login-logo="true"
            >

            <h1
              class="login-title"
              id="loginTitle"
              data-i18n="login.title"
            >
              ${escapeHtml(title)}
            </h1>

            <p
              class="login-subtitle"
              id="loginDescription"
              data-i18n="login.subtitle"
            >
              ${escapeHtml(subtitle)}
            </p>
          </header>

          <form
            class="login-form"
            id="loginForm"
            data-login-form="true"
            data-auth-form="login"
            aria-describedby="loginDescription loginMessage"
            autocomplete="on"
            novalidate
          >
            <div
              class="login-message"
              id="loginMessage"
              data-login-message="true"
              data-login-error="true"
              role="alert"
              aria-live="polite"
              aria-atomic="true"
              hidden
            ></div>

            <div
              class="login-field login-field--identifier"
              data-login-field="identifier"
            >
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
                maxlength="${MAX_IDENTIFIER_LENGTH}"
                data-login-identifier="true"
                data-i18n-placeholder="login.identifierPlaceholder"
                aria-invalid="false"
                required
              >
            </div>

            ${renderLoginPasswordField({
              label: passwordLabel,
              placeholder: passwordPlaceholder,
            })}

            <div class="login-options">
              <label
                class="login-check"
                for="loginRemember"
              >
                <input
                  id="loginRemember"
                  name="remember"
                  type="checkbox"
                  value="1"
                  data-login-remember="true"
                  ${rememberChecked ? "checked" : ""}
                >

                <span data-i18n="login.rememberLabel">
                  ${escapeHtml(rememberLabel)}
                </span>
              </label>

              <a
                class="login-reset-link"
                href="${escapeAttr(passwordRequestHref)}"
                data-spa
                data-route="${escapeAttr(passwordRequestHref)}"
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
              data-i18n="login.submitLabel"
            >
              ${escapeHtml(submitLabel)}
            </button>
          </form>
        </article>
      </div>
    </section>
  `;
}

export { getLoginTemplate as LoginTemplate };

export default getLoginTemplate;
