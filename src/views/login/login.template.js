/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/login/login.template.js

   Responsabilidad:
   - Template visual del login.
   - Compone layout + formulario.
   - Consume src/shared/password-field.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast directo.
   - Sin lógica de sesión.
   - Sin duplicar lógica del password-field.
   - Preparado para i18n mediante options/data-i18n.
   - Compatible con src/views/login/index.js.
========================================================= */

import { getPasswordFieldTemplate } from "../../shared/password-field/index.js";

export const TEMPLATE_VERSION = "login-olympus-2";

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

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const normalized = String(value ?? "").trim().toLowerCase();

  if (["1", "true", "yes", "on", "si", "sí"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return fallback;
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

function readMapValue(map, key) {
  const source = asObject(map);
  const scoped = asObject(source.login);

  return (
    text(scoped[key], "") ||
    text(scoped[`login.${key}`], "") ||
    text(source[key], "") ||
    text(source[`login.${key}`], "")
  );
}

function copy(options = {}, key = "", fallback = "") {
  const source = asObject(options);

  const direct = text(source[key], "");
  if (direct) return direct;

  const fromLabels = readMapValue(source.labels, key);
  if (fromLabels) return fromLabels;

  const fromI18nMap = readMapValue(source.i18n, key);
  if (fromI18nMap) return fromI18nMap;

  const i18n = asObject(source.i18n);
  const t = typeof source.t === "function" ? source.t : i18n && typeof i18n.t === "function" ? i18n.t : null;

  if (t) {
    try {
      const translated = text(t(`login.${key}`, fallback), "");
      if (translated && translated !== `login.${key}`) return translated;
    } catch (_) {
      // Template puro: si i18n falla, mantiene fallback.
    }
  }

  return fallback;
}

function renderLogo(src, className = "login-logo", size = 44) {
  return `
    <img
      class="${escapeAttr(className)}"
      src="${escapeAttr(src)}"
      alt=""
      width="${escapeAttr(size)}"
      height="${escapeAttr(size)}"
      loading="eager"
      decoding="async"
      draggable="false"
      aria-hidden="true"
    />
  `;
}

function renderPasswordField(options = {}, labels = {}) {
  const passwordField = asObject(options.passwordField);

  const rootAttrs = {
    ...asObject(passwordField.rootAttrs),
    ...asObject(passwordField.attrs),
    "data-login-field": "password",
    "data-login-password-field": "true",
  };

  const inputAttrs = {
    ...asObject(passwordField.inputAttrs),
    "data-login-password": "true",
    "data-login-password-input": "true",
    "data-i18n-placeholder": "login.passwordPlaceholder",
    "aria-invalid": "false",
  };

  return getPasswordFieldTemplate({
    ...passwordField,

    id: text(passwordField.id, "loginPassword"),
    name: text(passwordField.name, "password"),
    type: "password",
    mode: text(passwordField.mode, "login"),

    label: text(passwordField.label, labels.passwordLabel),
    placeholder: text(passwordField.placeholder, labels.passwordPlaceholder),
    autocomplete: text(passwordField.autocomplete, "current-password"),
    required: passwordField.required === undefined ? true : bool(passwordField.required, true),

    rootClassName: text(passwordField.rootClassName || passwordField.fieldClassName, "login-field login-field--password"),
    labelClassName: text(passwordField.labelClassName, "login-label"),
    inputClassName: text(passwordField.inputClassName, "input-text login-input"),

    i18nScope: text(passwordField.i18nScope, "login"),
    i18n: {
      ...asObject(passwordField.i18n),
      label: "login.passwordLabel",
      placeholder: "login.passwordPlaceholder",
      show: "passwordField.show",
      hide: "passwordField.hide",
    },

    attrs: rootAttrs,
    rootAttrs,
    inputAttrs,
  });
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getLoginTemplate(options = {}) {
  const source = asObject(options);

  const appName = copy(source, "appName", DEFAULT_APP_NAME);
  const logoSrc = safeAssetSrc(source.logoSrc, DEFAULT_LOGO);

  const title = copy(source, "title", "Iniciar sesión");
  const subtitle = copy(source, "subtitle", `Accede a ${appName}`);

  const eyebrow = copy(source, "eyebrow", "Panel privado");
  const heroTitle = copy(source, "heroTitle", "Soporte simple para trabajar rápido.");
  const heroText = copy(
    source,
    "heroText",
    "Gestiona tickets, clientes y facturas desde un único panel claro, directo y seguro."
  );

  const identifierLabel = copy(source, "identifierLabel", "Usuario o email");
  const identifierPlaceholder = copy(source, "identifierPlaceholder", "Usuario o email");

  const passwordLabel = copy(source, "passwordLabel", "Contraseña");
  const passwordPlaceholder = copy(source, "passwordPlaceholder", "Contraseña");

  const submitLabel = copy(source, "submitLabel", "Entrar");
  const rememberLabel = copy(source, "rememberLabel", "Recordarme");

  const passwordRequestLabel =
    text(source.passwordRequestLabel || source.forgotLabel, "") ||
    copy(source, "passwordRequestLabel", "¿Has olvidado tu contraseña?");

  const secureLabel = copy(source, "secureLabel", "Acceso seguro");
  const formHelper = copy(source, "formHelper", "Introduce tus credenciales para continuar.");
  const footerLabel = copy(source, "footerLabel", "Onion Support SPA");

  const identifier = normalizeIdentifier(source.identifier || "");
  const showRemember = bool(source.showRemember, true);
  const rememberChecked = bool(source.remember, Boolean(identifier));

  const passwordRequestHref = safeInternalHref(
    source.passwordRequestHref || source.forgotPasswordHref,
    DEFAULT_PASSWORD_REQUEST_HREF
  );

  const passwordFieldHtml = renderPasswordField(source, {
    passwordLabel,
    passwordPlaceholder,
  });

  return `
    <section
      class="login-view login-view--split"
      id="loginView"
      data-view="login"
      data-view-name="login"
      data-login-view="true"
      data-i18n-scope="login"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
    >
      <div class="login-background" aria-hidden="true">
        <span class="login-background__grid"></span>
        <span class="login-background__glow login-background__glow--primary"></span>
        <span class="login-background__glow login-background__glow--secondary"></span>
      </div>

      <div class="login-shell">
        <aside class="login-hero" aria-label="${escapeAttr(appName)}">
          <div class="login-hero__brand">
            <span class="login-hero__logo">
              ${renderLogo(logoSrc, "login-hero__logo-img", 42)}
            </span>

            <span class="login-hero__brand-copy">
              <strong>${escapeHtml(appName)}</strong>
              <small data-i18n="login.eyebrow">${escapeHtml(eyebrow)}</small>
            </span>
          </div>

          <div class="login-hero__content">
            <p class="login-hero__kicker" data-i18n="login.secureLabel">
              ${escapeHtml(secureLabel)}
            </p>

            <h2 class="login-hero__title" data-i18n="login.heroTitle">
              ${escapeHtml(heroTitle)}
            </h2>

            <p class="login-hero__text" data-i18n="login.heroText">
              ${escapeHtml(heroText)}
            </p>
          </div>

          <div class="login-hero__mock" aria-hidden="true">
            <div class="login-hero__mock-card login-hero__mock-card--main">
              <span></span>
              <strong></strong>
              <em></em>
            </div>

            <div class="login-hero__mock-card login-hero__mock-card--one">
              <span></span>
              <strong></strong>
            </div>

            <div class="login-hero__mock-card login-hero__mock-card--two">
              <span></span>
              <strong></strong>
            </div>
          </div>
        </aside>

        <main class="login-main">
          <article class="login-card" aria-labelledby="loginTitle">
            <header class="login-header">
              <div class="login-brand">
                <span class="login-brand__logo">
                  ${renderLogo(logoSrc, "login-logo", 48)}
                </span>

                <span class="login-brand__copy">
                  <strong>${escapeHtml(appName)}</strong>
                  <small data-i18n="login.secureLabel">${escapeHtml(secureLabel)}</small>
                </span>
              </div>

              <div class="login-heading">
                <h1 class="login-title" id="loginTitle" data-i18n="login.title">
                  ${escapeHtml(title)}
                </h1>

                <p class="login-subtitle" id="loginDescription" data-i18n="login.subtitle">
                  ${escapeHtml(subtitle)}
                </p>
              </div>
            </header>

            <form
              class="login-form"
              id="loginForm"
              data-login-form="true"
              data-auth-form="login"
              data-toast-scope="auth.login"
              aria-describedby="loginDescription loginHelper loginMessage"
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

              <p class="login-helper" id="loginHelper" data-i18n="login.formHelper">
                ${escapeHtml(formHelper)}
              </p>

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
                ${
                  showRemember
                    ? `
                      <label class="login-check" for="loginRemember">
                        <input
                          id="loginRemember"
                          name="remember"
                          type="checkbox"
                          value="1"
                          data-login-remember="true"
                          ${rememberChecked ? "checked" : ""}
                        />

                        <span class="login-check__box" aria-hidden="true"></span>

                        <span class="login-check__label" data-i18n="login.rememberLabel">
                          ${escapeHtml(rememberLabel)}
                        </span>
                      </label>
                    `
                    : `<span></span>`
                }

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

              <footer class="login-footer">
                <span data-i18n="login.footerLabel">${escapeHtml(footerLabel)}</span>
              </footer>
            </form>
          </article>
        </main>
      </div>
    </section>
  `;
}

export { getLoginTemplate as LoginTemplate };

export default getLoginTemplate;
