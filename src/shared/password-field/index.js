/* =========================================================
   Onion Support - Shared Auth Template
   Archivo: /src/shared/auth-template/index.js

   Responsabilidad:
   - Template base para vistas públicas/auth.
   - Logo público, shell, card, título, subtítulo y body.
   - Consumible por login, password-reset, activate-account, etc.
   - Sin Auth, Router, HTTP, Store, Toast, validación ni eventos.
========================================================= */

export const AUTH_TEMPLATE_VERSION = "auth-template.minimal.v1";

export const PUBLIC_AUTH_LOGO = new URL(
  "../../media/img/favicon_black_circle.png",
  import.meta.url
).href;

const DEFAULT_APP_NAME = "Onion Support";

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

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

  try {
    if (/^https?:\/\//i.test(raw) && typeof window !== "undefined") {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return fallbackSrc;
      return `${url.pathname || "/"}${url.search || ""}`;
    }
  } catch {
    return fallbackSrc;
  }

  return fallbackSrc;
}

export function safeInternalHref(value = "", fallback = "/login") {
  const raw = text(value, fallback);

  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (/[\r\n\t\\]/.test(raw)) return fallback;
  if (hasSensitiveQuery(raw)) return fallback;

  return raw;
}

export function renderAuthLogo(options = {}) {
  const appName = text(options.appName, DEFAULT_APP_NAME);
  const logoSrc = safeAssetSrc(options.logoSrc, PUBLIC_AUTH_LOGO);

  return `
    <div class="auth-logo-wrap" data-auth-logo-wrap="true">
      <img
        class="auth-logo"
        src="${escapeAttr(logoSrc)}"
        alt=""
        width="56"
        height="56"
        loading="eager"
        decoding="async"
        draggable="false"
        aria-hidden="true"
        data-auth-logo="true"
      >

      <span class="auth-logo-name" data-auth-logo-name="true">
        ${escapeHtml(appName)}
      </span>
    </div>
  `;
}

export function renderAuthShell(options = {}) {
  const view = text(options.view, "auth");
  const title = text(options.title, "Acceso");
  const subtitle = text(options.subtitle, "");
  const body = String(options.body || "");
  const footer = String(options.footer || "");
  const appName = text(options.appName, DEFAULT_APP_NAME);

  return `
    <section
      class="auth-view ${escapeAttr(view)}-view"
      data-view="${escapeAttr(view)}"
      data-auth-view="true"
      data-template-version="${escapeAttr(AUTH_TEMPLATE_VERSION)}"
      aria-labelledby="${escapeAttr(view)}-title"
    >
      <div class="auth-shell ${escapeAttr(view)}-shell">
        <article class="auth-card ${escapeAttr(view)}-card">
          <header class="auth-header ${escapeAttr(view)}-header">
            ${renderAuthLogo({
              appName,
              logoSrc: options.logoSrc,
            })}

            <h1
              class="auth-title ${escapeAttr(view)}-title"
              id="${escapeAttr(view)}-title"
            >
              ${escapeHtml(title)}
            </h1>

            ${
              subtitle
                ? `
                  <p class="auth-subtitle ${escapeAttr(view)}-subtitle">
                    ${escapeHtml(subtitle)}
                  </p>
                `
                : ""
            }
          </header>

          <div class="auth-body ${escapeAttr(view)}-body">
            ${body}
          </div>

          ${
            footer
              ? `
                <footer class="auth-footer ${escapeAttr(view)}-footer">
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

export default {
  AUTH_TEMPLATE_VERSION,
  PUBLIC_AUTH_LOGO,

  escapeHtml,
  escapeAttr,

  safeAssetSrc,
  safeInternalHref,

  renderAuthLogo,
  renderAuthShell,
};
