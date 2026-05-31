/* =========================================================
   Onion Support - Public Views Shared
   Archivo: /src/views/public/index.js

   Responsabilidad:
   - Shared mínimo para vistas públicas.
   - Layout común de auth/public.
   - Logo público auth.
   - Helpers seguros de escape, assets y href internos.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin Toast.
   - Sin eventos.
   - Sin navegación real.
   - Sin lógica de vistas concretas.
========================================================= */

import {
  ROUTES,
  SENSITIVE_QUERY_PARAMS,
  isBlockedRoutePath,
  normalizeRoutePath,
  routePathFromUrlLike,
} from "../../core/config.js";

export const PUBLIC_SHARED_VERSION = "public.shared.v1";

export const PUBLIC_AUTH_LOGO = new URL(
  "../../media/img/favicon_black_circle.png",
  import.meta.url
).href;

const APP_NAME = "Onion Support";
const DEFAULT_PUBLIC_VIEW = "public";
const DEFAULT_SAFE_HREF = ROUTES.login || "/login";

const SENSITIVE_QUERY_KEYS = new Set(
  (Array.isArray(SENSITIVE_QUERY_PARAMS) && SENSITIVE_QUERY_PARAMS.length
    ? SENSITIVE_QUERY_PARAMS
    : [
        "token",
        "access_token",
        "accessToken",
        "refresh_token",
        "refreshToken",
        "id_token",
        "idToken",
        "jwt",
        "authorization",
        "session",
        "sessionId",
        "session_id",
        "secret",
        "code",
        "password",
        "pwd",
        "key",
        "sig",
        "signature",
        "reset_token",
        "resetToken",
        "activation_token",
        "activationToken",
      ]
  )
    .map((key) => normalizeKey(key))
    .filter(Boolean)
);

/* =========================================================
   BASICS
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

function normalizeKey(value = "") {
  return text(value, "")
    .replace(/[-_\s]/g, "")
    .toLowerCase();
}

function normalizeViewKey(value = "") {
  return text(value, DEFAULT_PUBLIC_VIEW)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || DEFAULT_PUBLIC_VIEW;
}

function splitUrlLike(value = "") {
  const raw = text(value, "");

  if (!raw) {
    return {
      pathname: "",
      search: "",
      hash: "",
    };
  }

  let clean = "";

  try {
    clean = routePathFromUrlLike(raw) || "";
  } catch {
    clean = "";
  }

  if (!clean) {
    return {
      pathname: "",
      search: "",
      hash: "",
    };
  }

  let pathname = clean;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname,
    search,
    hash,
  };
}

/* =========================================================
   ESCAPE
========================================================= */

export function escapeHtml(value = "") {
  return text(value, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(value = "") {
  return escapeHtml(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

/* =========================================================
   SECURITY
========================================================= */

function hasSensitiveQuery(value = "") {
  const raw = String(value || "");

  if (!raw) return false;

  try {
    const url = new URL(raw, "https://onionsupport.local");

    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
        return true;
      }
    }

    if (url.hash) {
      const hash = url.hash.replace(/^#/, "");

      if (hash.includes("=")) {
        const params = new URLSearchParams(hash);

        for (const key of params.keys()) {
          if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
            return true;
          }
        }
      }
    }
  } catch {
    return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
      raw
    );
  }

  return false;
}

function safeSearch(value = "") {
  const raw = text(value, "");

  if (!raw || raw === "?") return "";
  if (!raw.startsWith("?")) return "";
  if (hasSensitiveQuery(raw)) return "";

  try {
    const params = new URLSearchParams(raw);

    for (const key of [...params.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
        params.delete(key);
      }
    }

    const output = params.toString();

    return output ? `?${output}` : "";
  } catch {
    return "";
  }
}

function safeHash(value = "") {
  const raw = text(value, "");

  if (!raw || raw === "#") return "";
  if (!raw.startsWith("#")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  return raw;
}

function normalizeInternalPath(value = "") {
  const raw = text(value, "");

  if (!raw) return "";
  if (!raw.startsWith("/") && !/^https?:\/\//i.test(raw)) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  const parts = splitUrlLike(raw);

  if (!parts.pathname) return "";

  let pathname = "";

  try {
    pathname = normalizeRoutePath(parts.pathname) || "";
  } catch {
    pathname = "";
  }

  if (!pathname) return "";
  if (!pathname.startsWith("/")) return "";
  if (pathname.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(pathname)) return "";

  try {
    if (isBlockedRoutePath(pathname)) return "";
  } catch {
    return "";
  }

  return `${pathname}${safeSearch(parts.search)}${safeHash(parts.hash)}`;
}

/* =========================================================
   PUBLIC HELPERS
========================================================= */

export function safeInternalHref(value = "", fallback = DEFAULT_SAFE_HREF) {
  const href = normalizeInternalPath(value);

  if (href) return href;

  if (fallback === "") return "";

  return normalizeInternalPath(fallback) || "/";
}

export function safeAssetSrc(value = "", fallback = "") {
  const src = text(value, fallback);

  if (!src) return fallback;
  if (/[\r\n\t\\]/.test(src)) return fallback;
  if (hasSensitiveQuery(src)) return fallback;
  if (/^(javascript|data|vbscript|file):/i.test(src)) return fallback;

  if (src.startsWith("/")) {
    if (src.startsWith("//")) return fallback;

    return src.replace(/\/{2,}/g, "/") || fallback;
  }

  if (/^https?:\/\//i.test(src)) {
    try {
      const url = new URL(src);

      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href;
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
}

/* =========================================================
   PUBLIC SHELL
========================================================= */

function renderPublicHeader({
  appName = APP_NAME,
  title = "",
  subtitle = "",
} = {}) {
  const cleanTitle = text(title, appName);
  const cleanSubtitle = text(subtitle, "");

  return `
    <header
      class="public-auth-header"
      data-public-header="true"
    >
      <div
        class="public-auth-brand"
        data-public-brand="true"
        aria-label="${escapeAttr(appName)}"
      >
        <img
          class="public-auth-brand-logo"
          src="${escapeAttr(safeAssetSrc(PUBLIC_AUTH_LOGO, PUBLIC_AUTH_LOGO))}"
          alt=""
          width="40"
          height="40"
          loading="eager"
          decoding="async"
          draggable="false"
          data-public-brand-logo="true"
        >

        <span class="public-auth-brand-name">
          ${escapeHtml(appName)}
        </span>
      </div>

      <div class="public-auth-header-copy">
        <h1 class="public-auth-title">
          ${escapeHtml(cleanTitle)}
        </h1>

        ${
          cleanSubtitle
            ? `
              <p class="public-auth-subtitle">
                ${escapeHtml(cleanSubtitle)}
              </p>
            `
            : ""
        }
      </div>
    </header>
  `;
}

export function renderPublicShell({
  view = DEFAULT_PUBLIC_VIEW,
  appName = APP_NAME,
  title = "",
  subtitle = "",
  header = true,
  body = "",
  ariaLabel = "",
  ariaLabelledBy = "",
} = {}) {
  const viewKey = normalizeViewKey(view);
  const cleanAppName = text(appName, APP_NAME);
  const cleanBody = String(body ?? "");
  const label = text(ariaLabel, `${cleanAppName} · Acceso`);
  const labelledBy = text(ariaLabelledBy, "");

  return `
    <section
      class="public-auth-shell public-auth-shell--${escapeAttr(viewKey)}"
      data-public-shell="true"
      data-public-view="${escapeAttr(viewKey)}"
      data-public-shared-version="${escapeAttr(PUBLIC_SHARED_VERSION)}"
      ${labelledBy ? `aria-labelledby="${escapeAttr(labelledBy)}"` : `aria-label="${escapeAttr(label)}"`}
    >
      <div
        class="public-auth-background"
        data-public-background="true"
        aria-hidden="true"
      ></div>

      ${
        header
          ? renderPublicHeader({
              appName: cleanAppName,
              title,
              subtitle,
            })
          : ""
      }

      <div
        class="public-auth-body"
        data-public-body="true"
      >
        ${cleanBody}
      </div>
    </section>
  `;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getPublicSharedSnapshot() {
  return {
    version: PUBLIC_SHARED_VERSION,
    appName: APP_NAME,
    hasLogo: Boolean(PUBLIC_AUTH_LOGO),
    browser: isBrowser(),
    policy: {
      sharedOnly: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
      noToast: true,
      noEvents: true,
      noNavigation: true,
    },
  };
}

export const getSnapshot = getPublicSharedSnapshot;
export const getDebugSnapshot = getPublicSharedSnapshot;

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  version: PUBLIC_SHARED_VERSION,

  PUBLIC_AUTH_LOGO,

  escapeHtml,
  escapeAttr,

  safeAssetSrc,
  safeInternalHref,

  renderPublicShell,

  getPublicSharedSnapshot,
  getSnapshot,
  getDebugSnapshot,
};
