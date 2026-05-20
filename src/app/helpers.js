/* =========================================================
   Onion Support - App Helpers
   Archivo: /src/app/helpers.js

   Responsabilidad:
   - Helpers mínimos de path.
   - Compat básica.
   - Usar constantes app como fuente única.
   - Sólo token param: token.
   - Sólo rutas públicas técnicas actuales:
     /activate-account
     /password-reset
   - Sin Auth.
   - Sin Router real.
   - Sin fetch.
   - Sin storage.
   - Sin history complejo.
   - Sin rutas inventadas.
========================================================= */

import {
  DEFAULT_ROUTE,
  TOKEN_PARAM,
  getPublicTokenRouteConfigByPath,
} from "./constants.js";

export const HELPERS_VERSION = "app.helpers.v2";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function browserOrigin() {
  return isBrowser() ? window.location.origin : "http://localhost";
}

function browserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const { pathname = DEFAULT_ROUTE, search = "", hash = "" } = window.location;
    return normalizePublicPath(`${pathname || DEFAULT_ROUTE}${search || ""}${hash || ""}`);
  } catch {
    return DEFAULT_ROUTE;
  }
}

/* =========================================================
   PATH PARSING
========================================================= */

function splitPath(value = DEFAULT_ROUTE) {
  const raw = cleanText(value, DEFAULT_ROUTE);

  const queryIndex = raw.indexOf("?");
  const hashIndex = raw.indexOf("#");

  let cut = raw.length;

  if (queryIndex >= 0) cut = Math.min(cut, queryIndex);
  if (hashIndex >= 0) cut = Math.min(cut, hashIndex);

  return {
    pathname: raw.slice(0, cut) || DEFAULT_ROUTE,
    suffix: raw.slice(cut) || "",
  };
}

function cleanPathname(value = DEFAULT_ROUTE) {
  let path = cleanText(value, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  if (path.length > 1) {
    path = path.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return path || DEFAULT_ROUTE;
}

function normalizeHashPath(value = DEFAULT_ROUTE) {
  const path = cleanText(value, DEFAULT_ROUTE);

  if (path.startsWith("#!")) {
    return path.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  if (path.startsWith("#/")) {
    return path.slice(1) || DEFAULT_ROUTE;
  }

  return path;
}

function normalizeAbsoluteUrl(value = DEFAULT_ROUTE) {
  try {
    const url = new URL(value, browserOrigin());

    if (url.origin !== browserOrigin()) {
      return DEFAULT_ROUTE;
    }

    return `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`;
  } catch {
    return DEFAULT_ROUTE;
  }
}

/* =========================================================
   NORMALIZE
========================================================= */

export function normalizePublicPath(path = DEFAULT_ROUTE) {
  let value = normalizeHashPath(path);

  if (!value || value.startsWith("//")) {
    return DEFAULT_ROUTE;
  }

  if (/^https?:\/\//i.test(value)) {
    value = normalizeAbsoluteUrl(value);
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return DEFAULT_ROUTE;
  }

  value = value.replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const { pathname, suffix } = splitPath(value);

  return `${cleanPathname(pathname)}${suffix}`;
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return cleanPathname(splitPath(normalizePublicPath(path)).pathname);
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  return splitPath(normalizePublicPath(path)).suffix;
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const publicPath = normalizePublicPath(path);
  const { pathname, suffix } = splitPath(publicPath);

  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0] || "";

  if (first.startsWith("@") && first.length > 1) {
    const rest = parts.slice(1).join("/");
    return normalizePublicPath(`/${rest}${suffix}`);
  }

  return publicPath;
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  return stripSearchAndHash(stripUsernamePrefix(path)) || DEFAULT_ROUTE;
}

/* =========================================================
   CURRENT PATH
========================================================= */

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

/* =========================================================
   SAFE INTERNAL PATH
========================================================= */

export function isSafeInternalPath(value = "") {
  const path = cleanText(value, "");

  return Boolean(
    path &&
      path.startsWith("/") &&
      !path.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(path) &&
      !/[\r\n\t\\]/.test(path)
  );
}

export function normalizeInternalPathTarget(
  value = DEFAULT_ROUTE,
  fallback = DEFAULT_ROUTE
) {
  const path = normalizePublicPath(value);

  return isSafeInternalPath(path)
    ? path
    : normalizePublicPath(fallback);
}

/* =========================================================
   TOKEN ROUTES
========================================================= */

function hasTokenParam(path = "") {
  try {
    const query = String(path || "").split("?")[1]?.split("#")[0] || "";
    const params = new URLSearchParams(query);

    return Boolean(cleanText(params.get(TOKEN_PARAM), ""));
  } catch {
    return false;
  }
}

export function isSensitiveParamName(name = "") {
  return String(name || "").toLowerCase() === TOKEN_PARAM;
}

export function getSensitiveParamNames() {
  return [TOKEN_PARAM];
}

export function redactTokenInText(value = "") {
  return String(value || "").replace(/([?&#]token=)([^&#\s]+)/gi, "$1***");
}

export function isProtectedPublicTokenPath(path = browserPath()) {
  const publicPath = normalizePublicPath(path);

  return Boolean(
    getPublicTokenRouteConfigByPath(publicPath) &&
      hasTokenParam(publicPath)
  );
}

export function resolveProtectedInitialContext(path = browserPath()) {
  const publicPath = normalizePublicPath(path);
  const config = getPublicTokenRouteConfigByPath(publicPath);
  const hasToken = Boolean(config && hasTokenParam(publicPath));

  return {
    key: hasToken ? config.key : "",
    path: hasToken ? publicPath : "",
    publicPath: hasToken ? publicPath : "",
    canonicalPath: hasToken ? normalizeCanonicalPath(config.path || publicPath) : "",
    hasToken,
    redactedPath: hasToken ? redactTokenInText(publicPath) : "",
  };
}

export function getProtectedInitialPublicPath(path = browserPath()) {
  const context = resolveProtectedInitialContext(path);
  return context.hasToken ? context.publicPath : "";
}

/* =========================================================
   PUBLIC ROUTE HELPERS
========================================================= */

export function isActivationPath(path = browserPath()) {
  return normalizeCanonicalPath(path) === "/activate-account";
}

export function isPasswordResetPath(path = browserPath()) {
  return normalizeCanonicalPath(path) === "/password-reset";
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHelpersSnapshot(AppCore = null, Router = null) {
  const publicPath = getCurrentPublicPath(AppCore, Router);
  const protectedInitial = resolveProtectedInitialContext(publicPath);

  return {
    version: HELPERS_VERSION,

    publicPath: redactTokenInText(publicPath),
    canonicalPath: getCurrentCanonicalPath(AppCore, Router),

    protectedInitial: {
      key: protectedInitial.key,
      canonicalPath: protectedInitial.canonicalPath,
      hasToken: protectedInitial.hasToken,
      redactedPath: protectedInitial.redactedPath,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
  isPasswordResetPath,

  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,
  resolveProtectedInitialContext,

  isSensitiveParamName,
  getSensitiveParamNames,
  redactTokenInText,

  getHelpersSnapshot,
};
