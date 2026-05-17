/* =========================================================
   Onion Support - App Helpers
   Archivo: /src/app/helpers.js

   Responsabilidad:
   - Helpers mínimos de path.
   - Compat básica.
   - Sólo token param: token.
   - Sólo rutas técnicas actuales:
     /activate-account
     /password-reset
   - Sin Auth.
   - Sin Router real.
   - Sin fetch.
   - Sin storage.
   - Sin history complejo.
   - Sin rutas inventadas.
========================================================= */

export const HELPERS_VERSION = "simple";

const DEFAULT_PATH = "/";
const TOKEN_PARAM = "token";
const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";

export const PROTECTED_PUBLIC_TOKEN_ROUTES = [
  {
    key: "activation",
    path: "/activate-account",
  },
  {
    key: "passwordReset",
    path: "/password-reset",
  },
];

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function looksLikeCore(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value.state || value.modules || value.setState)
  );
}

function pathArg(first = DEFAULT_PATH, second = undefined) {
  return looksLikeCore(first) ? second || DEFAULT_PATH : first || DEFAULT_PATH;
}

function browserPath() {
  if (!isBrowser()) return DEFAULT_PATH;

  return normalizePublicPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

function browserHref() {
  return isBrowser() ? window.location.href || "" : "";
}

function splitPath(value = DEFAULT_PATH) {
  const raw = text(value, DEFAULT_PATH);

  const hashIndex = raw.indexOf("#");
  const queryIndex = raw.indexOf("?");

  let cut = raw.length;

  if (queryIndex >= 0) cut = Math.min(cut, queryIndex);
  if (hashIndex >= 0) cut = Math.min(cut, hashIndex);

  return {
    pathname: raw.slice(0, cut) || DEFAULT_PATH,
    suffix: raw.slice(cut) || "",
  };
}

function cleanPathname(value = DEFAULT_PATH) {
  let path = text(value, DEFAULT_PATH).replace(/\\/g, "/");

  if (!path.startsWith("/")) path = `/${path}`;

  path = path.replace(/\/+/g, "/");

  if (path.length > 1) {
    path = path.replace(/\/+$/g, "");
  }

  return path || DEFAULT_PATH;
}

function hasToken(path = "") {
  try {
    const query = String(path).split("?")[1]?.split("#")[0] || "";
    const params = new URLSearchParams(query);

    return Boolean(params.get(TOKEN_PARAM));
  } catch {
    return false;
  }
}

function protectedRouteFor(path = "") {
  const canonical = normalizeCanonicalPath(path);

  return (
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((route) => {
      return canonical === route.path;
    }) || null
  );
}

export function normalizePublicPath(first = DEFAULT_PATH, second = undefined) {
  let value = text(pathArg(first, second), DEFAULT_PATH);

  if (value.startsWith("#/")) {
    value = value.slice(1);
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      const base = isBrowser() ? window.location.origin : "http://localhost";
      const url = new URL(value, base);

      value = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      value = DEFAULT_PATH;
    }
  }

  const { pathname, suffix } = splitPath(value);

  return `${cleanPathname(pathname)}${suffix}`;
}

export function stripSearchAndHash(path = DEFAULT_PATH) {
  return cleanPathname(splitPath(path).pathname);
}

export function getSearchAndHash(path = DEFAULT_PATH) {
  return splitPath(path).suffix;
}

export function stripUsernamePrefix(path = DEFAULT_PATH) {
  const publicPath = normalizePublicPath(path);
  const { pathname, suffix } = splitPath(publicPath);
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0]?.startsWith("@")) {
    return normalizePublicPath(`/${parts.slice(1).join("/")}${suffix}`);
  }

  return publicPath;
}

export function normalizeCanonicalPath(first = DEFAULT_PATH, second = undefined) {
  const publicPath = stripUsernamePrefix(normalizePublicPath(pathArg(first, second)));
  const pathname = stripSearchAndHash(publicPath);

  return pathname || DEFAULT_PATH;
}

export function captureInitialUrl() {
  if (!isBrowser()) return false;

  if (!window[INITIAL_URL_KEY]) {
    window[INITIAL_URL_KEY] = browserHref();
  }

  return true;
}

export function resolveProtectedInitialContext() {
  const publicPath = browserPath();
  const route = protectedRouteFor(publicPath);
  const valid = Boolean(route && hasToken(publicPath));

  return {
    key: valid ? route.key : "",
    path: valid ? publicPath : "",
    publicPath: valid ? publicPath : "",
    canonicalPath: valid ? route.path : "",
    url: valid ? browserHref() : "",
    hasToken: valid,
    redactedPath: valid ? redactTokenInText(publicPath) : "",
    redactedUrl: valid ? redactTokenInText(browserHref()) : "",
  };
}

export function getProtectedInitialPublicPath() {
  const context = resolveProtectedInitialContext();
  return context.hasToken ? context.publicPath : "";
}

export function isProtectedPublicTokenPath(path = browserPath()) {
  return Boolean(protectedRouteFor(path) && hasToken(path));
}

export function isActivationPath(path = browserPath()) {
  return normalizeCanonicalPath(path) === "/activate-account";
}

/* Compat legacy: no existe reset confirm ahora mismo. */
export function isResetConfirmPath() {
  return false;
}

export function getCurrentPath(_AppCore = null, Router = null) {
  if (typeof Router?.getCurrentPublicPath === "function") {
    return normalizePublicPath(Router.getCurrentPublicPath());
  }

  if (typeof Router?.getCurrentPath === "function") {
    return normalizePublicPath(Router.getCurrentPath());
  }

  return browserPath();
}

export function getCurrentPublicPath(AppCore = null, Router = null) {
  return getCurrentPath(AppCore, Router);
}

export function getCurrentCanonicalPath(AppCore = null, Router = null) {
  if (typeof Router?.getCurrentCanonicalPath === "function") {
    return normalizeCanonicalPath(Router.getCurrentCanonicalPath());
  }

  return normalizeCanonicalPath(getCurrentPublicPath(AppCore, Router));
}

export function isSafeInternalPath(value = "") {
  const path = text(value, "");

  return Boolean(
    path &&
      path.startsWith("/") &&
      !path.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(path) &&
      !/[\r\n\t\\]/.test(path)
  );
}

export function normalizeInternalPathTarget(value = DEFAULT_PATH, fallback = DEFAULT_PATH) {
  const path = normalizePublicPath(value);

  return isSafeInternalPath(path) ? path : normalizePublicPath(fallback);
}

export function redactTokenInText(value = "") {
  return text(value, "").replace(/([?&#]token=)([^&#\s]+)/gi, "$1***");
}

export function escapeHtml(first = "", second = undefined) {
  const value = second === undefined ? first : second;

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function ensureScope(_AppCore = null, scope = "app") {
  return {
    name: scope,
  };
}

export function clearScope() {
  return true;
}

export function registerModule(AppCore = null, name = "", moduleRef = null, aliases = []) {
  if (!AppCore || !name || !moduleRef) return false;

  try {
    AppCore[name] = moduleRef;

    for (const alias of aliases || []) {
      AppCore[alias] = moduleRef;
    }

    return true;
  } catch {
    return false;
  }
}

export function getHelpersSnapshot(AppCore = null, Router = null) {
  return {
    version: HELPERS_VERSION,
    publicPath: getCurrentPublicPath(AppCore, Router),
    canonicalPath: getCurrentCanonicalPath(AppCore, Router),
    protectedInitial: resolveProtectedInitialContext(),
  };
}

export default {
  HELPERS_VERSION,

  getCurrentPath,
  getCurrentPublicPath,
  getCurrentCanonicalPath,

  normalizePublicPath,
  normalizeCanonicalPath,
  stripUsernamePrefix,
  stripSearchAndHash,
  getSearchAndHash,

  isSafeInternalPath,
  normalizeInternalPathTarget,

  isActivationPath,
  isResetConfirmPath,
  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,
  resolveProtectedInitialContext,
  captureInitialUrl,

  redactTokenInText,
  escapeHtml,

  ensureScope,
  clearScope,
  registerModule,

  getHelpersSnapshot,

  PROTECTED_PUBLIC_TOKEN_ROUTES,
};
