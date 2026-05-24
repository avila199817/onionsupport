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
   - Usar el logo público/auth canónico favicon_black_circle.png.
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
   - Sin /home.
   - Sin /403.
   - Sin /404.
   - Sin 2FA/MFA/OTP.
   - Compatible con src/views/activate-account/index.js.
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

export const TEMPLATE_VERSION = "activate-account.template.v3";

export const ACTIVATE_ACCOUNT_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  ERROR: "error",
  EXPIRED: "expired",
  INVALID: "invalid",
});

const DEFAULT_APP_NAME = "Onion Support";

const PUBLIC_AUTH_LOGO = new URL(
  "../../media/img/favicon_black_circle.png",
  import.meta.url
).href;

const DEFAULT_LOGIN_HREF = ROUTES.login || "/login";
const DEFAULT_ACTIVATE_HREF = ROUTES.activateAccount || "/activate-account";

const USER_PREFIX = USER_HOME_PREFIX || "/@";

const TOKEN_MIN_LENGTH = 8;
const TOKEN_MAX_LENGTH = 8192;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 1024;

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

function isLoginHref(value = "") {
  return pathnameOnly(value) === pathnameOnly(DEFAULT_LOGIN_HREF);
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

  if (getUserScopedInfo(normalized).scoped) return fallbackHref;
  if (!isLoginHref(normalized)) return fallbackHref;

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
      field: fieldDataName,
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

  const logoSrc = safeAssetSrc(options.logoSrc, PUBLIC_AUTH_LOGO);

  const hasToken = Boolean(
    normalizeToken(options.token) ||
      bool(options.hasToken || options.tokenCaptured)
  );

  const activateHref = safeInternalHref(
    options.activateHref,
    DEFAULT_ACTIVATE_HREF
  );

  return `
    <section
      class="activate-account-view"
      id="activateAccountView"
      data-view="activate-account"
      data-view-name="activate-account"
      data-activate-account-view="true"
      data-activate-href="${escapeAttr(activateHref)}"
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
              data-auth-logo="public"
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

            <p
              class="activate-account-field-error activate-account-field-error--password"
              id="activateAccountPasswordError"
              data-activate-account-error-for="password"
              data-activate-error-for="password"
              data-error-for="password"
              aria-live="polite"
              hidden
            ></p>

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
              class="activate-account-field-error activate-account-field-error--confirm"
              id="activateAccountConfirmPasswordError"
              data-activate-account-error-for="confirm-password"
              data-activate-error-for="confirm-password"
              data-error-for="confirm-password"
              aria-live="polite"
              hidden
            ></p>

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
