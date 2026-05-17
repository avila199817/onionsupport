/* =========================================================
   Onion Support - Activate Account Template
   Archivo: /src/views/activate-account/activate-account.template.js

   Responsabilidad:
   - HTML mínimo para activar cuenta.
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

export const TEMPLATE_VERSION = "simple";

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
  const backHref = safeInternalHref(options.backHref || options.loginHref, DEFAULT_LOGIN_HREF);
  const logoSrc = safeAssetSrc(options.logoSrc, DEFAULT_LOGO);

  return `
    <section
      class="activate-account-view"
      id="activateAccountView"
      data-view="activate-account"
      data-view-name="activate-account"
      data-activate-account-view="true"
      data-status="${escapeAttr(status)}"
      data-has-token="${options.hasToken || options.tokenCaptured ? "true" : "false"}"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
    >
      <div class="activate-account-shell">
        <article class="activate-account-card" aria-labelledby="activateAccountTitle">
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
            />

            <h1 class="activate-account-title" id="activateAccountTitle">
              ${escapeHtml(title)}
            </h1>

            <p class="activate-account-subtitle" id="activateAccountDescription">
              ${escapeHtml(subtitle)}
            </p>
          </header>

          <form
            class="activate-account-form"
            id="activateAccountForm"
            data-activate-account-form="true"
            data-activate-form="true"
            aria-describedby="activateAccountDescription activateAccountMessage activateAccountPasswordHelp"
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

            <div class="activate-account-field" data-activate-account-field="password">
              <label class="activate-account-label" for="activateAccountPassword">
                Contraseña
              </label>

              <input
                class="input-text"
                id="activateAccountPassword"
                name="password"
                type="password"
                autocomplete="new-password"
                placeholder="Contraseña"
                data-activate-account-password="true"
                required
              />
            </div>

            <div class="activate-account-field" data-activate-account-field="confirm-password">
              <label class="activate-account-label" for="activateAccountPasswordConfirm">
                Confirmar contraseña
              </label>

              <input
                class="input-text"
                id="activateAccountPasswordConfirm"
                name="confirmPassword"
                type="password"
                autocomplete="new-password"
                placeholder="Confirmar contraseña"
                data-activate-account-confirm="true"
                required
              />
            </div>

            <p
              class="activate-account-help"
              id="activateAccountPasswordHelp"
            >
              ${escapeHtml(passwordHelp)}
            </p>

            <button
              class="activate-account-submit"
              id="activateAccountButton"
              type="submit"
              data-activate-account-submit="true"
            >
              ${escapeHtml(submitLabel)}
            </button>

            <p class="activate-account-back">
              <a
                class="activate-account-back-link"
                href="${escapeAttr(backHref)}"
                data-spa
                data-activate-account-back="true"
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
