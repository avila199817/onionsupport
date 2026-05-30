/* =========================================================
   Onion Support - Public View Template
   Archivo: /src/views/public/index.js

   Responsabilidad:
   - Template base para vistas públicas/auth.
   - Logo público, shell, card, título, subtítulo, body y footer.
   - Consumible por login, password-reset, activate-account, etc.
   - Helpers seguros para HTML, atributos, assets y href internos.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin Toast.
   - Sin validación.
   - Sin listeners.
   - Sin navegación.
========================================================= */

export const PUBLIC_TEMPLATE_VERSION = "public.template.v1";

export const PUBLIC_AUTH_LOGO = new URL(
  "../../media/img/favicon_black_circle.png",
  import.meta.url
).href;

const DEFAULT_APP_NAME = "Onion Support";
const DEFAULT_VIEW = "public";
const DEFAULT_TITLE = "Onion Support";
const DEFAULT_LOGIN_HREF = "/login";

/* =========================================================
   BASICS
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

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const clean = text(value, "").toLowerCase();

  if (["1", "true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["0", "false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

function cleanKey(value = "", fallback = DEFAULT_VIEW) {
  const output = text(value, fallback)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);

  return output || fallback;
}

function cleanClass(value = "", fallback = "") {
  return text(value, fallback)
    .split(/\s+/)
    .map((item) => item.replace(/[^\w:-]/g, "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
}

/* =========================================================
   ESCAPE / SAFE
========================================================= */

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(value = "") {
  return escapeHtml(text(value, ""));
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

export function safeAssetSrc(value = "", fallback = PUBLIC_AUTH_LOGO) {
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

export function safeInternalHref(value = "", fallback = DEFAULT_LOGIN_HREF) {
  const raw = text(value, fallback);
  const fallbackHref = text(fallback, DEFAULT_LOGIN_HREF);

  if (!raw) return fallbackHref;
  if (!raw.startsWith("/")) return fallbackHref;
  if (raw.startsWith("//")) return fallbackHref;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackHref;
  if (/[\r\n\t\\]/.test(raw)) return fallbackHref;
  if (hasSensitiveQuery(raw)) return fallbackHref;

  return raw.replace(/\/{2,}/g, "/") || fallbackHref;
}

/* =========================================================
   ATTRS
========================================================= */

function dataAttrs(attrs = {}) {
  if (!isObject(attrs)) return "";

  return Object.entries(attrs)
    .map(([key, value]) => {
      const name = cleanKey(key, "");

      if (!name) return "";
      if (value === false || value === null || value === undefined || value === "") return "";

      return ` data-${escapeAttr(name)}="${escapeAttr(value === true ? "true" : value)}"`;
    })
    .join("");
}

function attrBlock(attrs = {}) {
  if (!isObject(attrs)) return "";

  return Object.entries(attrs)
    .map(([key, value]) => {
      const name = text(key, "");

      if (!name) return "";
      if (value === false || value === null || value === undefined || value === "") return "";

      return ` ${escapeAttr(name)}="${escapeAttr(value === true ? "true" : value)}"`;
    })
    .join("");
}

/* =========================================================
   LOGO
========================================================= */

export function renderPublicLogo(options = {}) {
  const appName = text(options.appName, DEFAULT_APP_NAME);
  const logoSrc = safeAssetSrc(options.logoSrc, PUBLIC_AUTH_LOGO);
  const showName = options.showName !== false;

  return `
    <div
      class="auth-logo-wrap public-logo-wrap"
      data-auth-logo-wrap="true"
      data-public-logo-wrap="true"
    >
      <img
        class="auth-logo public-logo"
        src="${escapeAttr(logoSrc)}"
        alt=""
        width="${escapeAttr(options.width || 56)}"
        height="${escapeAttr(options.height || 56)}"
        loading="eager"
        decoding="async"
        draggable="false"
        aria-hidden="true"
        data-auth-logo="true"
        data-public-logo="true"
      >

      ${
        showName
          ? `
            <span
              class="auth-logo-name public-logo-name"
              data-auth-logo-name="true"
              data-public-logo-name="true"
            >
              ${escapeHtml(appName)}
            </span>
          `
          : ""
      }
    </div>
  `;
}

export const renderAuthLogo = renderPublicLogo;

/* =========================================================
   SHELL
========================================================= */

export function renderPublicShell(options = {}) {
  const view = cleanKey(options.view, DEFAULT_VIEW);
  const appName = text(options.appName, DEFAULT_APP_NAME);

  const title = text(options.title, DEFAULT_TITLE);
  const subtitle = text(options.subtitle, "");

  const body = String(options.body || "");
  const footer = String(options.footer || "");

  const titleId = text(options.titleId, `${view}-title`);
  const descriptionId = subtitle ? text(options.descriptionId, `${view}-description`) : "";

  const shellClass = cleanClass(options.shellClass, `auth-shell public-shell ${view}-shell`);
  const cardClass = cleanClass(options.cardClass, `auth-card public-card ${view}-card`);
  const headerClass = cleanClass(options.headerClass, `auth-header public-header ${view}-header`);
  const bodyClass = cleanClass(options.bodyClass, `auth-body public-body ${view}-body`);
  const footerClass = cleanClass(options.footerClass, `auth-footer public-footer ${view}-footer`);

  const centered = options.centered !== false;
  const compact = bool(options.compact, false);

  return `
    <section
      class="auth-view public-view ${escapeAttr(view)}-view${centered ? " is-centered" : ""}${compact ? " is-compact" : ""}"
      data-view="${escapeAttr(view)}"
      data-public-view="true"
      data-auth-view="true"
      data-template-version="${escapeAttr(PUBLIC_TEMPLATE_VERSION)}"
      ${dataAttrs(options.dataAttrs)}
      aria-labelledby="${escapeAttr(titleId)}"
      ${descriptionId ? `aria-describedby="${escapeAttr(descriptionId)}"` : ""}
      ${attrBlock(options.attrs)}
    >
      <div class="${escapeAttr(shellClass)}" data-public-shell="true">
        <article class="${escapeAttr(cardClass)}" data-public-card="true">
          <header class="${escapeAttr(headerClass)}" data-public-header="true">
            ${
              options.logo === false
                ? ""
                : renderPublicLogo({
                    appName,
                    logoSrc: options.logoSrc,
                    showName: options.showLogoName,
                    width: options.logoWidth,
                    height: options.logoHeight,
                  })
            }

            <h1
              class="auth-title public-title ${escapeAttr(view)}-title"
              id="${escapeAttr(titleId)}"
              data-public-title="true"
            >
              ${escapeHtml(title)}
            </h1>

            ${
              subtitle
                ? `
                  <p
                    class="auth-subtitle public-subtitle ${escapeAttr(view)}-subtitle"
                    id="${escapeAttr(descriptionId)}"
                    data-public-subtitle="true"
                  >
                    ${escapeHtml(subtitle)}
                  </p>
                `
                : ""
            }
          </header>

          <div class="${escapeAttr(bodyClass)}" data-public-body="true">
            ${body}
          </div>

          ${
            footer
              ? `
                <footer class="${escapeAttr(footerClass)}" data-public-footer="true">
                  ${footer}
                </footer>
              `
              : ""
          }
        </article>
      </div>
    </section>
  `;
}

export const renderAuthShell = renderPublicShell;

/* =========================================================
   DOM FACTORY
========================================================= */

export function createPublicShell(options = {}) {
  if (!isBrowser()) return null;

  const template = document.createElement("template");
  template.innerHTML = renderPublicShell(options).trim();

  return template.content.firstElementChild;
}

export const createAuthShell = createPublicShell;

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  PUBLIC_TEMPLATE_VERSION,
  PUBLIC_AUTH_LOGO,

  escapeHtml,
  escapeAttr,

  safeAssetSrc,
  safeInternalHref,

  renderPublicLogo,
  renderAuthLogo,

  renderPublicShell,
  renderAuthShell,

  createPublicShell,
  createAuthShell,
};
