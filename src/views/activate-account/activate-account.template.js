/* =========================================================
   Onion Support - Activate Account Template
   Archivo: /src/views/activate-account/activate-account.template.js

   Responsabilidad:
   - HTML mínimo para activar cuenta.
   - Ruta desde core/config.js.
   - Token param único desde core/config.js.
   - Pedir contraseña y confirmación.
   - Consumir shared/password-field.
   - Textos base en castellano.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast.
   - Sin lógica DOM.
   - Sin navegación.
   - Sin SVG propio.
   - Sin token real en DOM.
   - Sin rutas legacy.
   - Compatible con src/views/activate-account/index.js.
========================================================= */

import {
  ROUTES,
  TOKEN_PARAM,
} from "../../core/config.js";

import { renderPasswordField } from "../../shared/password-field/index.js";

export const TEMPLATE_VERSION = "activate-account.template.v2";

export const ACTIVATE_ACCOUNT_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  ERROR: "error",
  EXPIRED: "expired",
  INVALID: "invalid",
});

const DEFAULT_APP_NAME = "Onion Support";
const DEFAULT_LOGIN_HREF = ROUTES.login || "/login";
const DEFAULT_LOGO = "/src/media/img/favicon_black_circle.png?v=6";

const TOKEN_MIN_LENGTH = 8;
const TOKEN_MAX_LENGTH = 8192;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 1024;

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

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=/i.test(
    String(value || "")
  );
}

function safeInternalHref(value = "", fallback = DEFAULT_LOGIN_HREF) {
  const raw = text(value, "");
  const fallbackHref = text(fallback, DEFAULT_LOGIN_HREF);

  if (!raw) return fallbackHref;
  if (!raw.startsWith("/")) return fallbackHref;
  if (raw.startsWith("//")) return fallbackHref;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackHref;
  if (/[\r\n\t\\]/.test(raw)) return fallbackHref;
  if (hasSensitiveQuery(raw)) return fallbackHref;

  const normalized = raw.replace(/\/{2,}/g, "/") || fallbackHref;

  if (normalized.split("?")[0].split("#")[0] === "/home") {
    return fallbackHref;
  }

  return normalized;
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

function normalizeStatus(value = "") {
  const status = text(value, ACTIVATE_ACCOUNT_STATUS.IDLE).toLowerCase();

  return Object.values(ACTIVATE_ACCOUNT_STATUS).includes(status)
    ? status
    : ACTIVATE_ACCOUNT_STATUS.IDLE;
}

function normalizeToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";
  if (token.length < TOKEN_MIN_LENGTH) return "";
  if (token.length > TOKEN_MAX_LENGTH) return "";

  if (
    [
      "null",
      "undefined",
      "false",
      "true",
      "[object object]",
      "{}",
      "[]",
    ].includes(token.toLowerCase())
  ) {
    return "";
  }

  return token;
}

function bool(value = false) {
  if (value === true || value === 1 || value === "1") return true;

  const clean = String(value ?? "").trim().toLowerCase();

  return ["true", "yes", "si", "sí", "on"].includes(clean);
}

/* =========================================================
   PASSWORD FIELD
========================================================= */

function renderActivatePasswordField({
  id = "",
  name = "",
  label = "",
  placeholder = "",
  fieldDataName = "",
  inputDataAttrs = {},
} = {}) {
  return renderPasswordField({
    id,
    name,
    fieldDataName,

    label,
    placeholder,

    autocomplete: "new-password",
    required: true,
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,

    showToggle: true,
    showCapsIndicator: true,
    capsLabel: "Bloq Mayús",

    fieldClass: "activate-account-field",
    wrapperClass: "password-wrapper activate-account-password-wrapper",
    inputClass: "input-text activate-account-input",
    labelClass: "activate-account-label",
    toggleClass: "password-toggle activate-account-password-toggle",

    inputDataAttrs,

    toggleDataAttrs: {
      activateAccountToggle: true,
      activatePasswordToggle: true,
    },

    rootDataAttrs: {
      activateAccountField: fieldDataName,
      activatePasswordField: fieldDataName,
      i18nScope: "activateAccount",
    },
  });
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getActivateAccountTemplate(options = {}) {
  const appName = text(options.appName, DEFAULT_APP_NAME);
  const status = normalizeStatus(options.status);

  const title = text(options.title, "Activar cuenta");

  const subtitle = text(
    options.subtitle,
    `Define una contraseña para activar tu cuenta de ${appName}.`
  );

  const passwordHelp = text(
    options.passwordHelp,
    `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  );

  const submitLabel = text(options.submitLabel, "Activar cuenta");
  const backLabel = text(options.backLabel, "Volver al acceso");

  const backHref = safeInternalHref(
    options.backHref || options.loginHref,
    DEFAULT_LOGIN_HREF
  );

  const logoSrc = safeAssetSrc(options.logoSrc, DEFAULT_LOGO);

  const hasToken = Boolean(
    normalizeToken(options.token) ||
      bool(options.hasToken || options.tokenCaptured)
  );

  return `
    <section
      class="activate-account-view"
      id="activateAccountView"
      data-view="activate-account"
      data-view-name="activate-account"
      data-activate-account-view="true"
      data-status="${escapeAttr(status)}"
      data-has-token="${hasToken ? "true" : "false"}"
      data-token-param="${escapeAttr(TOKEN_PARAM)}"
      data-i18n-scope="activateAccount"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
      aria-labelledby="activateAccountTitle"
      aria-describedby="activateAccountDescription"
    >
      <div class="activate-account-shell" data-activate-account-shell="true">
        <article class="activate-account-card" data-activate-account-card="true">
          <header class="activate-account-header" data-activate-account-header="true">
            <img
              class="activate-account-logo"
              src="${escapeAttr(logoSrc)}"
              alt=""
              width="48"
              height="48"
              loading="eager"
              decoding="async"
              draggable="false"
              aria-hidden="true"
              data-activate-account-logo="true"
            >

            <h1
              class="activate-account-title"
              id="activateAccountTitle"
              data-i18n="activateAccount.title"
            >
              ${escapeHtml(title)}
            </h1>

            <p
              class="activate-account-subtitle"
              id="activateAccountDescription"
              data-i18n="activateAccount.subtitle"
            >
              ${escapeHtml(subtitle)}
            </p>
          </header>

          <form
            class="activate-account-form"
            id="activateAccountForm"
            data-activate-account-form="true"
            data-activate-form="true"
            aria-describedby="activateAccountDescription activateAccountMessage activateAccountPasswordHelp"
            autocomplete="on"
            novalidate
          >
            <div
              class="activate-account-message"
              id="activateAccountMessage"
              data-activate-account-message="true"
              data-activate-message="true"
              data-activate-account-error="true"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              hidden
            ></div>

            ${renderActivatePasswordField({
              id: "activateAccountPassword",
              name: "password",
              fieldDataName: "password",
              label: "Contraseña",
              placeholder: "Contraseña",
              inputDataAttrs: {
                activateAccountPassword: true,
                activatePasswordInput: true,
                i18nPlaceholder: "activateAccount.passwordPlaceholder",
              },
            })}

            ${renderActivatePasswordField({
              id: "activateAccountPasswordConfirm",
              name: "confirmPassword",
              fieldDataName: "confirm-password",
              label: "Confirmar contraseña",
              placeholder: "Confirmar contraseña",
              inputDataAttrs: {
                activateAccountConfirm: true,
                activatePasswordConfirm: true,
                i18nPlaceholder: "activateAccount.confirmPasswordPlaceholder",
              },
            })}

            <p
              class="activate-account-help"
              id="activateAccountPasswordHelp"
              data-i18n="activateAccount.passwordHelp"
            >
              ${escapeHtml(passwordHelp)}
            </p>

            <button
              class="activate-account-submit"
              id="activateAccountButton"
              type="submit"
              data-activate-account-submit="true"
              data-i18n="activateAccount.submitLabel"
            >
              ${escapeHtml(submitLabel)}
            </button>

            <p class="activate-account-back">
              <a
                class="activate-account-back-link"
                href="${escapeAttr(backHref)}"
                data-spa
                data-route="${escapeAttr(backHref)}"
                data-activate-account-back="true"
                data-i18n="activateAccount.backLabel"
              >
                ${escapeHtml(backLabel)}
              </a>
            </p>
          </form>
        </article>
      </div>
    </section>
  `;
}

export { getActivateAccountTemplate as ActivateAccountTemplate };

export default getActivateAccountTemplate;
