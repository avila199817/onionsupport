/* =========================================================
   Onion Support - Password Reset Template
   Archivo: /src/views/password-reset/reset-password.template.js

   Responsabilidad:
   - HTML mínimo para password reset.
   - Soporta dos modos:
     /password-request  -> request
     /password-reset    -> confirm
   - Sin imports.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast.
   - Sin bridge.
   - Sin CSS inline.
   - Sin JS visual.
   - Sin rutas legacy.
   - Compatible con resetPasswordView.js.
========================================================= */

export const TEMPLATE_VERSION = "simple";

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
      class="password-reset-message"
      id="passwordResetMessage"
      data-password-reset-message="true"
      data-reset-password-message="true"
      data-password-reset-error="true"
      data-reset-password-error="true"
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      hidden
    ></div>
  `;
}

function renderRequestFields({ identifier = "" } = {}) {
  const value = text(identifier, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 180);

  return `
    <div class="password-reset-field" data-password-reset-field="identifier">
      <label class="password-reset-label" for="passwordResetIdentifier">
        Usuario o email
      </label>

      <input
        class="input-text"
        id="passwordResetIdentifier"
        name="identifier"
        type="text"
        autocomplete="username"
        inputmode="email"
        autocapitalize="none"
        spellcheck="false"
        placeholder="Usuario o email"
        value="${escapeAttr(value)}"
        data-password-reset-identifier="true"
        data-reset-password-identifier="true"
        required
      />
    </div>
  `;
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

    <div class="password-reset-field" data-password-reset-field="password">
      <label class="password-reset-label" for="passwordResetPassword">
        Nueva contraseña
      </label>

      <input
        class="input-text"
        id="passwordResetPassword"
        name="password"
        type="password"
        autocomplete="new-password"
        placeholder="Nueva contraseña"
        data-password-reset-password="true"
        data-reset-password-password="true"
        required
      />
    </div>

    <div class="password-reset-field" data-password-reset-field="confirm-password">
      <label class="password-reset-label" for="passwordResetConfirmPassword">
        Confirmar contraseña
      </label>

      <input
        class="input-text"
        id="passwordResetConfirmPassword"
        name="confirmPassword"
        type="password"
        autocomplete="new-password"
        placeholder="Confirmar contraseña"
        data-password-reset-confirm="true"
        data-reset-password-confirm="true"
        required
      />
    </div>
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
      class="password-reset-view"
      id="passwordResetView"
      data-view="password-reset"
      data-view-name="password-reset"
      data-password-reset-view="true"
      data-reset-password-view="true"
      data-password-reset-mode="${escapeAttr(mode)}"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
    >
      <div class="password-reset-shell">
        <article class="password-reset-card" aria-labelledby="passwordResetTitle">
          <header class="password-reset-header">
            <img
              class="password-reset-logo"
              src="${escapeAttr(logoSrc)}"
              alt=""
              width="48"
              height="48"
              loading="eager"
              decoding="async"
              draggable="false"
              aria-hidden="true"
            />

            <h1 class="password-reset-title" id="passwordResetTitle">
              ${escapeHtml(title)}
            </h1>

            <p class="password-reset-subtitle" id="passwordResetDescription">
              ${escapeHtml(subtitle)}
            </p>
          </header>

          <form
            class="password-reset-form"
            id="passwordResetForm"
            data-password-reset-form="true"
            data-reset-password-form="true"
            data-password-reset-flow="${escapeAttr(mode)}"
            aria-describedby="passwordResetDescription passwordResetMessage"
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
              class="password-reset-submit"
              id="passwordResetSubmit"
              type="submit"
              data-password-reset-submit="true"
              data-reset-password-submit="true"
            >
              ${escapeHtml(submitLabel)}
            </button>

            <p class="password-reset-back">
              <a
                class="password-reset-back-link"
                href="${escapeAttr(backHref)}"
                data-spa
                data-password-reset-back="true"
                data-reset-password-back="true"
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

export { getResetPasswordTemplate as ResetPasswordTemplate };

export default getResetPasswordTemplate;
