/* =========================================================
   Onion Support - Activate Account Template
   Archivo: /src/views/activate-account/activate-account.template.js

   Responsabilidad:
   - HTML mínimo para activar cuenta.
   - Ruta: /activate-account?token=...
   - Token param único: token.
   - Pedir contraseña y confirmación.
   - Textos base en castellano.
   - Sin imports.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast.
   - Sin password-field compartido.
   - Sin SVG.
   - Sin token real en DOM.
   - Sin rutas legacy.
   - Compatible con src/views/activate-account/index.js.
========================================================= */

export const TEMPLATE_VERSION = "activate-account.template.v1";

export const ACTIVATE_ACCOUNT_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  ERROR: "error",
  EXPIRED: "expired",
  INVALID: "invalid",
});

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

function normalizeStatus(value = "") {
  const status = text(value, ACTIVATE_ACCOUNT_STATUS.IDLE).toLowerCase();

  return Object.values(ACTIVATE_ACCOUNT_STATUS).includes(status)
    ? status
    : ACTIVATE_ACCOUNT_STATUS.IDLE;
}

function bool(value = false) {
  if (value === true || value === 1 || value === "1") return true;

  const clean = String(value ?? "").trim().toLowerCase();

  return ["true", "yes", "si", "sí", "on"].includes(clean);
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
    "La contraseña debe tener al menos 8 caracteres."
  );

  const submitLabel = text(options.submitLabel, "Activar cuenta");
  const backLabel = text(options.backLabel, "Volver al acceso");

  const backHref = safeInternalHref(
    options.backHref || options.loginHref,
    DEFAULT_LOGIN_HREF
  );

  const logoSrc = safeAssetSrc(options.logoSrc, DEFAULT_LOGO);
  const hasToken = bool(options.hasToken || options.tokenCaptured);

  return `
    <section
      class="activate-account-view"
      id="activateAccountView"
      data-view="activate-account"
      data-view-name="activate-account"
      data-activate-account-view="true"
      data-status="${escapeAttr(status)}"
      data-has-token="${hasToken ? "true" : "false"}"
      data-i18n-scope="activateAccount"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
      aria-labelledby="activateAccountTitle"
      aria-describedby="activateAccountDescription"
    >
      <div class="activate-account-shell">
        <article class="activate-account-card">
          <header class="activate-account-header">
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
              aria-live="polite"
              aria-atomic="true"
              hidden
            ></div>

            <div
              class="activate-account-field"
              data-activate-account-field="password"
            >
              <label
                class="activate-account-label"
                for="activateAccountPassword"
                data-i18n="activateAccount.passwordLabel"
              >
                Contraseña
              </label>

              <input
                class="input-text activate-account-input"
                id="activateAccountPassword"
                name="password"
                type="password"
                autocomplete="new-password"
                autocapitalize="none"
                spellcheck="false"
                placeholder="Contraseña"
                minlength="8"
                data-activate-account-password="true"
                data-i18n-placeholder="activateAccount.passwordPlaceholder"
                aria-invalid="false"
                required
              >
            </div>

            <div
              class="activate-account-field"
              data-activate-account-field="confirm-password"
            >
              <label
                class="activate-account-label"
                for="activateAccountPasswordConfirm"
                data-i18n="activateAccount.confirmPasswordLabel"
              >
                Confirmar contraseña
              </label>

              <input
                class="input-text activate-account-input"
                id="activateAccountPasswordConfirm"
                name="confirmPassword"
                type="password"
                autocomplete="new-password"
                autocapitalize="none"
                spellcheck="false"
                placeholder="Confirmar contraseña"
                minlength="8"
                data-activate-account-confirm="true"
                data-i18n-placeholder="activateAccount.confirmPasswordPlaceholder"
                aria-invalid="false"
                required
              >
            </div>

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
