/* =========================================================
   Onion Support - Password Reset Template
   Archivo: /src/views/password-reset/reset-password.template.js

   Responsabilidad:
   - Template simple para recuperar/restablecer contraseña.
   - Modo request: pedir usuario o email.
   - Modo confirm: nueva contraseña + confirmar contraseña.
   - Consumir shared/password-field.
   - Conectar con CSS auth/login común.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast directo.
   - Sin lógica DOM.
   - Sin duplicar password-field.
========================================================= */

import { renderPasswordField } from "../../shared/password-field/index.js";

export const TEMPLATE_VERSION = "minimal-1";

const DEFAULT_APP_NAME = "Onion Support";
const DEFAULT_LOGIN_HREF = "/login";
const DEFAULT_LOGO = "/src/media/img/favicon_black_circle.png?v=6";

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

function safeInternalHref(value = "", fallback = DEFAULT_LOGIN_HREF) {
  const raw = text(value, "");
  const fallbackHref = text(fallback, DEFAULT_LOGIN_HREF);

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

function normalizeToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";

  if (
    ["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
      token.toLowerCase()
    )
  ) {
    return "";
  }

  return token;
}

function normalizeIdentifier(value = "") {
  return text(value, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function normalizeMode(options = {}) {
  const mode = text(options.mode || options.flow, "").toLowerCase();

  if (options.isConfirm === true) return "confirm";
  if (mode === "confirm") return "confirm";

  return "request";
}

/* =========================================================
   PARTIALS
========================================================= */

function renderMessage() {
  return `
    <div
      class="auth-message password-reset-message"
      id="passwordResetMessage"
      data-password-reset-message="true"
      data-reset-password-message="true"
      data-password-reset-error="true"
      data-reset-password-error="true"
      data-toast-anchor="password-reset"
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      hidden
    ></div>
  `;
}

function renderRequestFields({ identifier = "" } = {}) {
  return `
    <div
      class="auth-field password-reset-field"
      data-password-reset-field="identifier"
      data-reset-password-field="identifier"
    >
      <label
        class="auth-label password-reset-label"
        for="passwordResetIdentifier"
        data-i18n="passwordReset.identifierLabel"
      >
        Usuario o email
      </label>

      <input
        class="auth-input input-text password-reset-input"
        id="passwordResetIdentifier"
        name="identifier"
        type="text"
        autocomplete="username"
        inputmode="email"
        autocapitalize="none"
        spellcheck="false"
        placeholder="Usuario o email"
        value="${escapeAttr(normalizeIdentifier(identifier))}"
        data-password-reset-identifier="true"
        data-reset-password-identifier="true"
        data-i18n-placeholder="passwordReset.identifierPlaceholder"
        aria-invalid="false"
        required
      />
    </div>
  `;
}

function renderResetPasswordField({
  id,
  name,
  label,
  placeholder,
  fieldDataName,
  inputDataAttrs,
}) {
  return renderPasswordField({
    id,
    name,
    fieldDataName,

    label,
    placeholder,
    autocomplete: "new-password",
    required: true,
    showToggle: true,

    fieldClass: "auth-field password-reset-field",
    wrapperClass: "password-wrapper password-reset-password-wrapper",
    inputClass: "auth-input input-text password-reset-input",
    labelClass: "auth-label password-reset-label",
    toggleClass: "password-toggle password-reset-password-toggle",

    inputDataAttrs,

    toggleDataAttrs: {
      passwordResetToggle: true,
      resetPasswordToggle: true,
    },

    rootDataAttrs: {
      passwordResetField: fieldDataName,
      resetPasswordField: fieldDataName,
      i18nScope: "passwordReset",
    },
  });
}

function renderConfirmFields({ token = "" } = {}) {
  const safeToken = normalizeToken(token);

  return `
    <input
      type="hidden"
      name="token"
      value="${escapeAttr(safeToken)}"
      data-password-reset-token="true"
      data-reset-token="true"
    />

    ${renderResetPasswordField({
      id: "passwordResetPassword",
      name: "password",
      fieldDataName: "password",
      label: "Nueva contraseña",
      placeholder: "Nueva contraseña",
      inputDataAttrs: {
        passwordResetPassword: true,
        resetPasswordPassword: true,
        i18nPlaceholder: "passwordReset.passwordPlaceholder",
      },
    })}

    ${renderResetPasswordField({
      id: "passwordResetConfirmPassword",
      name: "confirmPassword",
      fieldDataName: "confirm-password",
      label: "Confirmar contraseña",
      placeholder: "Confirmar contraseña",
      inputDataAttrs: {
        passwordResetConfirm: true,
        resetPasswordConfirm: true,
        i18nPlaceholder: "passwordReset.confirmPasswordPlaceholder",
      },
    })}
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getResetPasswordTemplate(options = {}) {
  const mode = normalizeMode(options);
  const isConfirm = mode === "confirm";

  const appName = text(options.appName, DEFAULT_APP_NAME);
  const logoSrc = safeAssetSrc(options.logoSrc, DEFAULT_LOGO);

  const title = text(
    options.title,
    isConfirm ? "Nueva contraseña" : "Recuperar acceso"
  );

  const subtitle = text(
    options.subtitle,
    isConfirm
      ? `Define una nueva contraseña para ${appName}.`
      : `Introduce tu usuario o email de ${appName}.`
  );

  const submitLabel = text(
    options.submitLabel,
    isConfirm ? "Cambiar contraseña" : "Enviar enlace"
  );

  const backLabel = text(options.backLabel, "Volver al acceso");
  const backHref = safeInternalHref(options.backHref, DEFAULT_LOGIN_HREF);

  return `
    <section
      class="auth-view password-reset-view"
      id="passwordResetView"
      data-view="password-reset"
      data-view-name="password-reset"
      data-password-reset-view="true"
      data-reset-password-view="true"
      data-password-reset-mode="${escapeAttr(mode)}"
      data-i18n-scope="passwordReset"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
    >
      <main class="auth-shell password-reset-shell">
        <article class="auth-card password-reset-card" aria-labelledby="passwordResetTitle">
          <header class="auth-header password-reset-header">
            <img
              class="password-reset-logo"
              src="${escapeAttr(logoSrc)}"
              alt=""
              width="52"
              height="52"
              loading="eager"
              decoding="async"
              draggable="false"
              aria-hidden="true"
            />

            <h1
              class="auth-title password-reset-title"
              id="passwordResetTitle"
              data-i18n="passwordReset.title"
            >
              ${escapeHtml(title)}
            </h1>

            <p
              class="auth-subtitle password-reset-subtitle"
              id="passwordResetDescription"
              data-i18n="passwordReset.subtitle"
            >
              ${escapeHtml(subtitle)}
            </p>
          </header>

          <form
            class="auth-form password-reset-form"
            id="passwordResetForm"
            data-password-reset-form="true"
            data-reset-password-form="true"
            data-password-reset-flow="${escapeAttr(mode)}"
            data-toast-scope="auth.passwordReset"
            aria-describedby="passwordResetDescription passwordResetMessage"
            autocomplete="on"
            novalidate
          >
            ${renderMessage()}

            ${
              isConfirm
                ? renderConfirmFields({ token: options.token })
                : renderRequestFields({
                    identifier:
                      options.identifier ||
                      options.rememberedIdentifier ||
                      "",
                  })
            }

            <button
              class="auth-button password-reset-submit"
              id="passwordResetSubmit"
              type="submit"
              data-password-reset-submit="true"
              data-reset-password-submit="true"
            >
              <span data-i18n="passwordReset.submitLabel">
                ${escapeHtml(submitLabel)}
              </span>
            </button>

            <p class="password-reset-back">
              <a
                class="auth-link password-reset-back-link"
                href="${escapeAttr(backHref)}"
                data-spa
                data-password-reset-back="true"
                data-reset-password-back="true"
                data-i18n="passwordReset.backLabel"
              >
                ${escapeHtml(backLabel)}
              </a>
            </p>
          </form>
        </article>
      </main>
    </section>
  `;
}

export { getResetPasswordTemplate as ResetPasswordTemplate };

export default getResetPasswordTemplate;
