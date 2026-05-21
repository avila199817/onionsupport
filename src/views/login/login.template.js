/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/login/login.template.js

   Responsabilidad:
   - Pintar un login simple y centrado.
   - Consumir el password-field compartido desde su fachada pública.
   - Textos base en castellano.
   - Rutas base desde core/config.js.
   - Delegar normalización/bloqueo de rutas en core/config.js.
   - Usar logo corporativo canónico favicon_black.png / favicon_white.png.
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
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import { renderPasswordField } from "../../shared/password-field/index.js";

export const TEMPLATE_VERSION = "login.template.v5";

const DEFAULT_APP_NAME = "Onion Support";

const BRAND_LOGOS = Object.freeze({
  black: new URL("../../media/img/favicon_black.png", import.meta.url).href,
  white: new URL("../../media/img/favicon_white.png", import.meta.url).href,
});

const DEFAULT_LOGO = BRAND_LOGOS.black;

const DEFAULT_PASSWORD_REQUEST_HREF =
  ROUTES.passwordRequest || "/password-request";

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PASSWORD_LENGTH = 1024;

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

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

function pathFromInput(value = "/") {
  try {
    return configRoutePathFromUrlLike(value) || "/";
  } catch {
    const raw = text(value, "/");

    if (raw.startsWith("#!")) {
      return raw.replace(/^#!\/?/, "/") || "/";
    }

    if (raw.startsWith("#/")) {
      return raw.slice(1) || "/";
    }

    if (raw.startsWith("//")) return "/";

    if (/^https?:\/\//i.test(raw) && isBrowser()) {
      try {
        const url = new URL(raw, window.location.origin);

        if (url.origin !== window.location.origin) return "/";

        return `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
      } catch {
        return "/";
      }
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "/";

    return raw || "/";
  }
}

function normalizePath(value = "/", fallback = "/") {
  const fallbackPath = text(fallback, "");
  let raw = text(value, fallbackPath);

  if (!raw) return fallbackPath;
  if (raw.startsWith("//")) return fallbackPath;
  if (/[\r\n\t\\]/.test(raw)) return fallbackPath;
  if (hasSensitiveQuery(raw)) return fallbackPath;

  raw = pathFromInput(raw);

  if (!raw) return fallbackPath;
  if (!raw.startsWith("/")) raw = `/${raw}`;
  if (raw.startsWith("//")) return fallbackPath;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackPath;
  if (/[\r\n\t\\]/.test(raw)) return fallbackPath;
  if (hasSensitiveQuery(raw)) return fallbackPath;

  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;

  const queryIndex = beforeHash.indexOf("?");
  const pathnameRaw = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";

  let pathname = "";

  try {
    pathname = configNormalizeRoutePath(pathnameRaw) || fallbackPath;
  } catch {
    pathname = pathnameRaw
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!pathname.startsWith("/")) {
      pathname = `/${pathname}`;
    }

    if (pathname.length > 1) {
      pathname = pathname.replace(/\/+$/g, "") || fallbackPath;
    }
  }

  if (!pathname) return fallbackPath;

  try {
    if (configIsBlockedRoutePath(pathname)) return fallbackPath;
  } catch {
    const clean = pathname.toLowerCase();

    if (
      clean === "/home" ||
      clean === "/403" ||
      clean === "/404" ||
      clean === "/2fa" ||
      clean === "/mfa" ||
      clean === "/otp" ||
      clean.startsWith("/2fa/") ||
      clean.startsWith("/mfa/") ||
      clean.startsWith("/otp/")
    ) {
      return fallbackPath;
    }
  }

  return `${pathname}${search}`;
}

function safeInternalHref(value = "", fallback = DEFAULT_PASSWORD_REQUEST_HREF) {
  const fallbackHref = normalizePath(fallback, DEFAULT_PASSWORD_REQUEST_HREF);
  const raw = text(value, "");

  if (!raw) return fallbackHref;
  if (!raw.startsWith("/")) return fallbackHref;
  if (raw.startsWith("//")) return fallbackHref;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackHref;
  if (/[\r\n\t\\]/.test(raw)) return fallbackHref;
  if (hasSensitiveQuery(raw)) return fallbackHref;

  return normalizePath(raw, fallbackHref) || fallbackHref;
}

function safeAssetSrc(value = "", fallback = DEFAULT_LOGO) {
  const raw = text(value, "");
  const fallbackSrc = text(fallback, DEFAULT_LOGO);

  if (!raw) return fallbackSrc;
  if (raw.startsWith("//")) return fallbackSrc;
  if (/[\r\n\t\\]/.test(raw)) return fallbackSrc;
  if (hasSensitiveQuery(raw)) return fallbackSrc;
  if (/^(?:data|blob|javascript|vbscript|file):/i.test(raw)) return fallbackSrc;

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/") || fallbackSrc;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);

      if (isBrowser() && url.origin === window.location.origin) {
        return url.href;
      }

      return fallbackSrc;
    } catch {
      return fallbackSrc;
    }
  }

  return fallbackSrc;
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
              data-logo-black-src="${escapeAttr(BRAND_LOGOS.black)}"
              data-logo-white-src="${escapeAttr(BRAND_LOGOS.white)}"
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
