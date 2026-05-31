/* =========================================================
   Onion Support - Public Views Template
   Archivo: /src/views/public/index.js

   Responsabilidad:
   - Layout base para vistas públicas/auth.
   - Logo, shell, card, header opcional, body y footer.
   - Utilidades HTML seguras para templates públicos.
   - Consumible por login, password-reset, activate-account.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin Toast.
   - Sin validación de formularios.
   - Sin eventos.
========================================================= */

export const PUBLIC_TEMPLATE_VERSION = "public.template.v2";

export const PUBLIC_AUTH_LOGO = new URL(
  "../../media/img/favicon_black_circle.png",
  import.meta.url
).href;

const DEFAULT_APP_NAME = "Onion Support";
const DEFAULT_VIEW = "public";
const DEFAULT_TITLE = "Onion Support";
const DEFAULT_LOGIN_HREF = "/login";

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i;

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

function cleanKey(value = "", fallback = DEFAULT_VIEW) {
  const output = text(value, fallback)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^data-/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return output || fallback;
}

function cleanId(value = "", fallback = "") {
  const output = text(value, fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w:-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[^\w]+/, "")
    .slice(0, 120);

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

function cleanDimension(value = "", fallback = 56) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(numeric), 1), 512);
}

function hasSensitiveQuery(value = "") {
  return SENSITIVE_QUERY_RE.test(String(value || ""));
}

/* =========================================================
   ESCAPE
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

/* =========================================================
   SAFE URLS
========================================================= */

function safeRootPath(value = "", fallback = "") {
  const raw = text(value, "");

  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/[\r\n\t\\]/.test(raw)) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (hasSensitiveQuery(raw)) return fallback;

  return raw.replace(/\/{2,}/g, "/") || fallback;
}

export function safeAssetSrc(value = "", fallback = PUBLIC_AUTH_LOGO) {
  const fallbackSrc = text(fallback, PUBLIC_AUTH_LOGO);
  const raw = text(value, "");

  if (!raw) return fallbackSrc;
  if (/[\r\n\t\\]/.test(raw)) return fallbackSrc;
  if (hasSensitiveQuery(raw)) return fallbackSrc;

  if (raw.startsWith("/")) {
    return safeRootPath(raw, fallbackSrc);
  }

  if (/^https?:\/\//i.test(raw) && isBrowser()) {
    try {
      const url = new URL(raw, window.location.origin);

      if (url.origin !== window.location.origin) {
        return fallbackSrc;
      }

      return `${url.pathname || "/"}${url.search || ""}`;
    } catch {
      return fallbackSrc;
    }
  }

  return fallbackSrc;
}

export function safeInternalHref(value = "", fallback = DEFAULT_LOGIN_HREF) {
  const fallbackHref = safeRootPath(fallback, DEFAULT_LOGIN_HREF);

  return safeRootPath(value, fallbackHref);
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
      if (value === false || value === null || value === undefined || value === "") {
        return "";
      }

      return ` data-${escapeAttr(name)}="${escapeAttr(value === true ? "true" : value)}"`;
    })
    .join("");
}

/* =========================================================
   LOGO
========================================================= */

export function renderPublicLogo(options = {}) {
  const appName = text(options.appName, DEFAULT_APP_NAME);
  const logoSrc = safeAssetSrc(options.logoSrc, PUBLIC_AUTH_LOGO);
  const width = cleanDimension(options.width, 56);
  const height = cleanDimension(options.height, width);
  const showName = options.showName !== false;

  return `
    <div class="auth-logo-wrap public-logo-wrap" data-public-logo-wrap="true">
      <img
        class="auth-logo public-logo"
        src="${escapeAttr(logoSrc)}"
        alt=""
        width="${escapeAttr(width)}"
        height="${escapeAttr(height)}"
        loading="eager"
        decoding="async"
        draggable="false"
        aria-hidden="true"
        data-public-logo="true"
      >

      ${
        showName
          ? `
            <span class="auth-logo-name public-logo-name" data-public-logo-name="true">
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

  const hasHeader = options.header !== false;
  const hasLogo = hasHeader && options.logo !== false;
  const hasTitle = hasHeader && options.title !== false;

  const title = hasTitle ? text(options.title, DEFAULT_TITLE) : "";
  const subtitle = hasHeader ? text(options.subtitle, "") : "";
  const body = String(options.body || "");
  const footer = String(options.footer || "");

  const titleId = cleanId(options.titleId, `${view}-title`);
  const descriptionId = subtitle
    ? cleanId(options.descriptionId, `${view}-description`)
    : "";

  const ariaLabelledBy = text(
    options.ariaLabelledBy,
    hasHeader && title ? titleId : ""
  );

  const ariaDescribedBy = text(
    options.ariaDescribedBy,
    descriptionId
  );

  const ariaLabel = ariaLabelledBy
    ? ""
    : text(options.ariaLabel, title || appName);

  const shellClass = cleanClass(
    options.shellClass,
    `auth-shell public-shell ${view}-shell`
  );

  const cardClass = cleanClass(
    options.cardClass,
    `auth-card public-card ${view}-card`
  );

  const headerClass = cleanClass(
    options.headerClass,
    `auth-header public-header ${view}-header`
  );

  const bodyClass = cleanClass(
    options.bodyClass,
    `auth-body public-body ${view}-body`
  );

  const footerClass = cleanClass(
    options.footerClass,
    `auth-footer public-footer ${view}-footer`
  );

  return `
    <section
      class="auth-view public-view ${escapeAttr(view)}-view"
      data-view="${escapeAttr(view)}"
      data-public-view="true"
      data-template-version="${escapeAttr(PUBLIC_TEMPLATE_VERSION)}"
      ${dataAttrs(options.dataAttrs)}
      ${
        ariaLabelledBy
          ? `aria-labelledby="${escapeAttr(ariaLabelledBy)}"`
          : `aria-label="${escapeAttr(ariaLabel)}"`
      }
      ${ariaDescribedBy ? `aria-describedby="${escapeAttr(ariaDescribedBy)}"` : ""}
    >
      <div class="${escapeAttr(shellClass)}" data-public-shell="true">
        <article class="${escapeAttr(cardClass)}" data-public-card="true">
          ${
            hasHeader
              ? `
                <header class="${escapeAttr(headerClass)}" data-public-header="true">
                  ${
                    hasLogo
                      ? renderPublicLogo({
                          appName,
                          logoSrc: options.logoSrc,
                          showName: options.showLogoName,
                          width: options.logoWidth,
                          height: options.logoHeight,
                        })
                      : ""
                  }

                  ${
                    title
                      ? `
                        <h1
                          class="auth-title public-title ${escapeAttr(view)}-title"
                          id="${escapeAttr(titleId)}"
                          data-public-title="true"
                        >
                          ${escapeHtml(title)}
                        </h1>
                      `
                      : ""
                  }

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
              `
              : ""
          }

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
