/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/login/login.template.js

   Responsabilidad:
   - HTML mínimo del login.
   - Sin imports.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast.
   - Sin theme toggle.
   - Sin password-field avanzado.
   - Sin rutas legacy.
   - Compatible con src/views/login/index.js.
========================================================= */

export const TEMPLATE_VERSION = "simple";

const DEFAULT_APP_NAME = "Onion Support";
const DEFAULT_PASSWORD_REQUEST_HREF = "/password-request";
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
  if (/[\r\n\t\\]/.test(raw)) return fallbackSrc;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackSrc;

  return raw;
}

function normalizeIdentifier(value = "") {
  return text(value, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getLoginTemplate(options = {}) {
  const appName = text(options.appName, DEFAULT_APP_NAME);
  const title = text(options.title, "Iniciar sesión");
  const subtitle = text(options.subtitle, `Accede a ${appName}`);
  const identifier = normalizeIdentifier(options.identifier || "");
  const submitLabel = text(options.submitLabel, "Entrar");
  const rememberLabel = text(options.rememberLabel, "Recordarme");
  const passwordRequestLabel = text(options.passwordRequestLabel || options.forgotLabel, "¿Has olvidado tu contraseña?");
  const passwordRequestHref = safeInternalHref(
    options.passwordRequestHref || options.forgotPasswordHref,
    DEFAULT_PASSWORD_REQUEST_HREF
  );
  const logoSrc = safeAssetSrc(options.logoSrc, DEFAULT_LOGO);

  return `
    <section
      class="login-view"
      id="loginView"
      data-view="login"
      data-view-name="login"
      data-login-view="true"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
    >
      <div class="login-shell">
        <article class="login-card" aria-labelledby="loginTitle">
          <header class="login-header">
            <img
              class="login-logo"
              src="${escapeAttr(logoSrc)}"
              alt=""
              width="48"
              height="48"
              loading="eager"
              decoding="async"
              draggable="false"
              aria-hidden="true"
            />

            <h1 class="login-title" id="loginTitle">${escapeHtml(title)}</h1>
            <p class="login-subtitle" id="loginDescription">${escapeHtml(subtitle)}</p>
          </header>

          <form
            class="login-form"
            id="loginForm"
            data-login-form="true"
            data-auth-form="login"
            aria-describedby="loginDescription loginMessage"
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

            <div class="login-field" data-login-field="identifier">
              <label class="login-label" for="loginIdentifier">Usuario o email</label>

              <input
                class="input-text"
                id="loginIdentifier"
                name="identifier"
                type="text"
                autocomplete="username"
                inputmode="text"
                autocapitalize="none"
                spellcheck="false"
                placeholder="Usuario o email"
                value="${escapeAttr(identifier)}"
                data-login-identifier="true"
                required
              />
            </div>

            <div class="login-field" data-login-field="password">
              <label class="login-label" for="loginPassword">Contraseña</label>

              <input
                class="input-text"
                id="loginPassword"
                name="password"
                type="password"
                autocomplete="current-password"
                placeholder="Contraseña"
                data-login-password="true"
                required
              />
            </div>

            <div class="login-options">
              <label class="login-check" for="loginRemember">
                <input
                  id="loginRemember"
                  name="remember"
                  type="checkbox"
                  value="1"
                  data-login-remember="true"
                  ${identifier ? "checked" : ""}
                />

                <span>${escapeHtml(rememberLabel)}</span>
              </label>
            </div>

            <button
              class="login-button"
              id="loginSubmit"
              type="submit"
              data-login-submit="true"
            >
              ${escapeHtml(submitLabel)}
            </button>

            <p class="login-reset">
              <a
                class="login-reset-link"
                href="${escapeAttr(passwordRequestHref)}"
                data-spa
                data-login-password-request="true"
              >${escapeHtml(passwordRequestLabel)}</a>
            </p>
          </form>
        </article>
      </div>
    </section>
  `;
}

export { getLoginTemplate as LoginTemplate };

export default getLoginTemplate;
