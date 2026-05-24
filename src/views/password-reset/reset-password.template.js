/* =========================================================
   Onion Support - Password Reset Template
   Archivo: /src/views/password-reset/reset-password.template.js

   Responsabilidad:
   - Template simple para recuperar/restablecer contraseña.
   - Modo request: pedir usuario o email.
   - Modo confirm: nueva contraseña + confirmar contraseña.
   - Token único desde core/config.js.
   - Consumir shared/password-field.
   - Conectar con CSS auth/login común.
   - Textos base en castellano.
   - Usar el logo público/auth canónico favicon_black_circle.png.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast directo.
   - Sin lógica DOM.
   - Sin navegación.
   - Sin duplicar password-field.
   - Sin exponer token sensible en markup.
   - Sin rutas legacy.
   - Sin /home.
   - Sin /403.
   - Sin /404.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  ROUTES,
  TOKEN_PARAM,
  USER_HOME_PREFIX,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import { renderPasswordField } from "../../shared/password-field/index.js";

export const TEMPLATE_VERSION = "reset-password.template.v4";

const DEFAULT_APP_NAME = "Onion Support";

const PUBLIC_AUTH_LOGO = new URL(
  "../../media/img/favicon_black_circle.png",
  import.meta.url
).href;

const DEFAULT_LOGIN_HREF = ROUTES.login || "/login";
const DEFAULT_PASSWORD_REQUEST_HREF =
  ROUTES.passwordRequest || "/password-request";
const DEFAULT_PASSWORD_RESET_HREF =
  ROUTES.passwordReset || "/password-reset";
const DEFAULT_ACTIVATE_ACCOUNT_HREF =
  ROUTES.activateAccount || "/activate-account";

const USER_PREFIX = USER_HOME_PREFIX || "/@";

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PASSWORD_LENGTH = 1024;
const MAX_TOKEN_LENGTH = 8192;

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function normalizeSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = text(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
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

function normalizePathname(value = "/", fallback = "/") {
  let pathname = text(value, fallback);

  if (!pathname) return fallback;

  try {
    pathname = configNormalizeRoutePath(pathname) || fallback;
  } catch {
    pathname = pathname
      .split("?")[0]
      .split("#")[0]
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!pathname.startsWith("/")) {
      pathname = `/${pathname}`;
    }

    if (pathname.length > 1) {
      pathname = pathname.replace(/\/+$/g, "") || fallback;
    }
  }

  return pathname || fallback;
}

function getUserScopedInfo(pathname = "/") {
  try {
    const info = configGetUserScopedRouteInfo(pathname);

    if (isObject(info)) {
      return {
        scoped: Boolean(info.scoped),
        home: Boolean(info.home),
        slug: normalizeSlug(info.slug || ""),
        restPath: normalizePathname(
          info.restPath || info.canonicalPath || pathname,
          "/"
        ),
      };
    }
  } catch {
    // fallback abajo
  }

  const clean = normalizePathname(pathname, "/");

  if (!clean.startsWith(USER_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: clean,
    };
  }

  const rest = clean.slice(USER_PREFIX.length);
  const [slugSegment = "", ...segments] = rest.split("/");
  const slug = normalizeSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: clean,
    };
  }

  return {
    scoped: true,
    home: segments.length === 0,
    slug,
    restPath: segments.length
      ? normalizePathname(`/${segments.join("/")}`, "/")
      : "/",
  };
}

function fallbackBlockedPath(pathname = "") {
  const clean = normalizePathname(pathname, "/").toLowerCase();

  return Boolean(
    clean === "/home" ||
      clean.startsWith("/home/") ||
      clean === "/403" ||
      clean.startsWith("/403/") ||
      clean === "/404" ||
      clean.startsWith("/404/") ||
      clean === "/2fa" ||
      clean.startsWith("/2fa/") ||
      clean === "/mfa" ||
      clean.startsWith("/mfa/") ||
      clean === "/otp" ||
      clean.startsWith("/otp/")
  );
}

function isBlockedPath(pathname = "") {
  try {
    if (configIsBlockedRoutePath(pathname) === true) return true;
  } catch {
    // fallback abajo
  }

  if (fallbackBlockedPath(pathname)) return true;

  const scoped = getUserScopedInfo(pathname);

  return Boolean(scoped.scoped && fallbackBlockedPath(scoped.restPath));
}

function normalizePath(value = "/", fallback = "/") {
  const fallbackPath = text(fallback, "/");
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
  const pathnameRaw =
    queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;

  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";

  const pathname = normalizePathname(pathnameRaw, fallbackPath);

  if (!pathname) return fallbackPath;
  if (isBlockedPath(pathname)) return fallbackPath;

  return `${pathname}${search}`;
}

function pathnameOnly(value = "/") {
  return normalizePath(value, "/").split("?")[0].split("#")[0] || "/";
}

function publicAuthPathnames() {
  return new Set(
    [
      DEFAULT_LOGIN_HREF,
      DEFAULT_PASSWORD_REQUEST_HREF,
      DEFAULT_PASSWORD_RESET_HREF,
      DEFAULT_ACTIVATE_ACCOUNT_HREF,
    ]
      .map((path) => pathnameOnly(path))
      .filter(Boolean)
  );
}

function isPublicAuthHref(value = "") {
  const pathname = pathnameOnly(value);

  if (!pathname) return false;
  if (getUserScopedInfo(pathname).scoped) return false;
  if (isBlockedPath(pathname)) return false;

  return publicAuthPathnames().has(pathname);
}

function safeInternalHref(value = "", fallback = DEFAULT_LOGIN_HREF) {
  const fallbackHref = normalizePath(fallback, DEFAULT_LOGIN_HREF);
  const raw = text(value, "");

  if (!raw) return fallbackHref;
  if (!raw.startsWith("/")) return fallbackHref;
  if (raw.startsWith("//")) return fallbackHref;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackHref;
  if (/[\r\n\t\\]/.test(raw)) return fallbackHref;
  if (hasSensitiveQuery(raw)) return fallbackHref;

  const normalized = normalizePath(raw, fallbackHref) || fallbackHref;

  if (!isPublicAuthHref(normalized)) return fallbackHref;

  return normalized;
}

function safeAssetSrc(value = "", fallback = PUBLIC_AUTH_LOGO) {
  const raw = text(value, "");
  const fallbackSrc = text(fallback, PUBLIC_AUTH_LOGO);

  if (!raw) return fallbackSrc;
  if (/[\r\n\t\\]/.test(raw)) return fallbackSrc;
  if (hasSensitiveQuery(raw)) return fallbackSrc;

  if (raw.startsWith("/")) {
    if (raw.startsWith("//")) return fallbackSrc;
    return raw.replace(/\/{2,}/g, "/") || fallbackSrc;
  }

  if (/^https?:\/\//i.test(raw) && isBrowser()) {
    try {
      const url = new URL(raw, window.location.origin);

      if (url.origin !== window.location.origin) return fallbackSrc;

      return `${url.pathname || "/"}${url.search || ""}`;
    } catch {
      return fallbackSrc;
    }
  }

  return fallbackSrc;
}

function normalizeToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";
  if (token.length > MAX_TOKEN_LENGTH) return "";

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

function renderResetPasswordField({
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
    maxLength: MAX_PASSWORD_LENGTH,

    showToggle: true,
    showCapsIndicator: true,
    capsLabel: "Bloq Mayús",

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
      data-field="identifier"
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
        inputmode="text"
        autocapitalize="none"
        spellcheck="false"
        placeholder="Usuario o email"
        value="${escapeAttr(normalizeIdentifier(identifier))}"
        maxlength="${MAX_IDENTIFIER_LENGTH}"
        data-password-reset-identifier="true"
        data-reset-password-identifier="true"
        data-i18n-placeholder="passwordReset.identifierPlaceholder"
        aria-invalid="false"
        aria-describedby="passwordResetIdentifierError"
        required
      >

      <p
        class="password-reset-field-error"
        id="passwordResetIdentifierError"
        data-password-reset-error-for="identifier"
        data-reset-password-error-for="identifier"
        aria-live="polite"
        hidden
      ></p>
    </div>
  `;
}

function renderConfirmFields({ token = "" } = {}) {
  const hasToken = Boolean(normalizeToken(token));

  return `
    <input
      id="passwordResetToken"
      type="hidden"
      name="${escapeAttr(TOKEN_PARAM)}"
      value=""
      autocomplete="off"
      data-password-reset-token="true"
      data-reset-token="true"
      data-token-param="${escapeAttr(TOKEN_PARAM)}"
      data-token-present="${hasToken ? "true" : "false"}"
      aria-describedby="passwordResetTokenError"
    >

    <p
      class="password-reset-field-error password-reset-field-error--token"
      id="passwordResetTokenError"
      data-password-reset-error-for="token"
      data-reset-password-error-for="token"
      aria-live="polite"
      hidden
    ></p>

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

    <p
      class="password-reset-field-error password-reset-field-error--password"
      id="passwordResetPasswordError"
      data-password-reset-error-for="password"
      data-reset-password-error-for="password"
      aria-live="polite"
      hidden
    ></p>

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

    <p
      class="password-reset-field-error password-reset-field-error--confirm"
      id="passwordResetConfirmPasswordError"
      data-password-reset-error-for="confirm-password"
      data-reset-password-error-for="confirm-password"
      aria-live="polite"
      hidden
    ></p>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getResetPasswordTemplate(options = {}) {
  const mode = text(options.mode || options.flow, "").toLowerCase() === "confirm" ||
    options.isConfirm === true
    ? "confirm"
    : "request";

  const isConfirm = mode === "confirm";

  const appName = text(options.appName, DEFAULT_APP_NAME);
  const logoSrc = safeAssetSrc(options.logoSrc, PUBLIC_AUTH_LOGO);

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
      data-reset-password-mode="${escapeAttr(mode)}"
      data-i18n-scope="passwordReset"
      data-template-version="${escapeAttr(TEMPLATE_VERSION)}"
      aria-labelledby="passwordResetTitle"
      aria-describedby="passwordResetDescription"
    >
      <div class="auth-shell password-reset-shell" data-password-reset-shell="true">
        <article class="auth-card password-reset-card" data-password-reset-card="true">
          <header class="auth-header password-reset-header" data-password-reset-header="true">
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
              data-password-reset-logo="true"
              data-auth-logo="public"
            >

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
            data-reset-password-flow="${escapeAttr(mode)}"
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
              data-i18n="passwordReset.submitLabel"
            >
              ${escapeHtml(submitLabel)}
            </button>

            <p class="password-reset-back">
              <a
                class="auth-link password-reset-back-link"
                href="${escapeAttr(backHref)}"
                data-spa
                data-route="${escapeAttr(backHref)}"
                data-password-reset-back="true"
                data-reset-password-back="true"
                data-i18n="passwordReset.backLabel"
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
