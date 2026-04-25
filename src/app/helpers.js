/* =========================================================
   Onion SPA - App Helpers
   Archivo: src/app/helpers.js

   RESPONSABILIDADES:
   - resolver paths actuales de la app
   - normalizar public path y canonical path
   - preservar query/hash en rutas públicas sensibles
   - preservar token de activación antes del primer render
   - escapar HTML seguro para render inline
   - gestionar scope global de cleanup
   - registrar módulos en AppCore sin duplicados

   HARDENING EXTREMO:
   - tolerancia total si faltan módulos
   - fallback browser/server safe
   - helpers puros e idempotentes
   - cero throws accidentales
   - prioridad al browser/initial URL para activation token
   - soporte slug /@username robusto
   - no perder search/hash accidentalmente
========================================================= */

import { APP_SCOPE } from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const ACTIVATION_PATH = "/activate-account";

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

/* =========================================================
   PATH NORMALIZATION
========================================================= */

function splitRawPath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

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

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function fallbackNormalizePath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed =
        new URL(raw, getBaseOrigin());

      if (
        parsed.hash &&
        /^#\/[^/]/.test(parsed.hash)
      ) {
        return fallbackNormalizePath(
          parsed.hash.replace(/^#/, "")
        );
      }

      return fallbackNormalizePath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  if (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  ) {
    return fallbackNormalizePath(
      raw.replace(/^#\/?/, "/")
    );
  }

  const {
    pathname,
    search,
    hash,
  } = splitRawPath(raw);

  return `${normalizePathnameOnly(pathname)}${search}${hash}`;
}

function normalizePath(AppCore, path = "/") {
  const raw =
    safeText(path, "/") || "/";

  const fallback =
    fallbackNormalizePath(raw);

  /*
    Importante:
    No confiamos ciegamente en AppCore.utils.normalizePath
    si el path trae query/hash. Algunos normalizadores internos
    pueden devolver solo pathname y comerse ?token=...
  */
  const hasSuffix =
    raw.includes("?") ||
    raw.includes("#");

  if (hasSuffix) {
    return fallback;
  }

  try {
    if (
      typeof AppCore?.utils?.normalizePath ===
      "function"
    ) {
      const delegated =
        AppCore.utils.normalizePath(raw);

      if (delegated) {
        return fallbackNormalizePath(delegated);
      }
    }
  } catch {}

  return fallback;
}

function stripSearchAndHash(path = "/") {
  return splitRawPath(
    fallbackNormalizePath(path)
  ).pathname;
}

function getSearchAndHash(path = "/") {
  const parts =
    splitRawPath(
      fallbackNormalizePath(path)
    );

  return `${parts.search}${parts.hash}`;
}

function stripUsernamePrefix(path = "/") {
  const normalized =
    fallbackNormalizePath(path);

  const pathname =
    stripSearchAndHash(normalized);

  const suffix =
    getSearchAndHash(normalized);

  const clean =
    pathname.replace(
      /^\/@[^/]+(?=\/|$)/i,
      ""
    ) || "/";

  return fallbackNormalizePath(
    `${clean}${suffix}`
  );
}

function fallbackNormalizeCanonicalPath(path = "/") {
  const stripped =
    stripUsernamePrefix(path);

  const pathname =
    stripSearchAndHash(stripped);

  const suffix =
    getSearchAndHash(stripped);

  return `${normalizePathnameOnly(pathname)}${suffix}`;
}

function normalizeCanonicalPath(AppCore, path = "/") {
  const raw =
    safeText(path, "/") || "/";

  const fallback =
    fallbackNormalizeCanonicalPath(raw);

  const hasSuffix =
    raw.includes("?") ||
    raw.includes("#");

  if (hasSuffix) {
    return fallback;
  }

  try {
    if (
      typeof AppCore?.utils?.normalizeCanonicalPath ===
      "function"
    ) {
      const delegated =
        AppCore.utils.normalizeCanonicalPath(raw);

      if (delegated) {
        return fallbackNormalizeCanonicalPath(delegated);
      }
    }
  } catch {}

  return fallback;
}

/* =========================================================
   BROWSER / INITIAL URL
========================================================= */

function buildBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    /*
      Soporte hash-router:
      /#/activate-account?token=XXX
      debe resolverse como:
      /activate-account?token=XXX
    */
    if (
      hash &&
      /^#\/[^/]/.test(hash)
    ) {
      return fallbackNormalizePath(
        hash.replace(/^#/, "")
      );
    }

    return fallbackNormalizePath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return "/";
  }
}

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      /^#\/[^/]/.test(parsed.hash)
    ) {
      return fallbackNormalizePath(
        parsed.hash.replace(/^#/, "")
      );
    }

    return fallbackNormalizePath(
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return fallbackNormalizePath(raw);
  }
}

function captureInitialUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href =
      window.location.href;

    if (!window.__ONION_INITIAL_URL__) {
      window.__ONION_INITIAL_URL__ = href;
    }

    const browserPath =
      pathFromUrlLike(href);

    if (
      isActivationPath(browserPath) &&
      !window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
    ) {
      window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__ = href;
    }

    return true;
  } catch {
    return false;
  }
}

function getInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_INITIAL_URL__,
    ""
  );
}

function getActivationInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__,
    ""
  );
}

/* =========================================================
   ACTIVATION TOKEN DETECTION
========================================================= */

function isActivationPath(path = "") {
  const normalized =
    fallbackNormalizePath(path);

  const pathname =
    stripSearchAndHash(normalized);

  return (
    pathname === ACTIVATION_PATH ||
    pathname.startsWith(`${ACTIVATION_PATH}/`)
  );
}

function hasTokenInSearch(search = "") {
  try {
    const params =
      new URLSearchParams(search || "");

    return ACTIVATION_TOKEN_PARAM_NAMES.some(
      (name) =>
        Boolean(
          safeText(
            params.get(name),
            ""
          )
        )
    );
  } catch {
    return false;
  }
}

function hasActivationToken(pathOrUrl = "") {
  const raw =
    safeText(pathOrUrl, "");

  if (!raw) {
    return false;
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    if (
      hasTokenInSearch(parsed.search)
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : ""
      );
    }

    return false;
  } catch {
    const parts =
      splitRawPath(raw);

    if (
      hasTokenInSearch(parts.search)
    ) {
      return true;
    }

    if (
      parts.hash &&
      parts.hash.includes("?")
    ) {
      const query =
        parts.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : ""
      );
    }

    return false;
  }
}

function getProtectedActivationPath() {
  captureInitialUrl();

  const activationInitialUrl =
    getActivationInitialUrl();

  if (
    activationInitialUrl &&
    isActivationPath(
      pathFromUrlLike(activationInitialUrl)
    ) &&
    hasActivationToken(activationInitialUrl)
  ) {
    return pathFromUrlLike(
      activationInitialUrl
    );
  }

  const initialUrl =
    getInitialUrl();

  if (
    initialUrl &&
    isActivationPath(
      pathFromUrlLike(initialUrl)
    ) &&
    hasActivationToken(initialUrl)
  ) {
    return pathFromUrlLike(
      initialUrl
    );
  }

  const browserPath =
    buildBrowserPath();

  if (
    isActivationPath(browserPath) &&
    hasActivationToken(browserPath)
  ) {
    return browserPath;
  }

  return "";
}

function shouldPreferBrowserPathOverState(AppCore) {
  const protectedActivationPath =
    getProtectedActivationPath();

  if (protectedActivationPath) {
    return true;
  }

  const browserPath =
    buildBrowserPath();

  const statePublicPath =
    safeText(
      AppCore?.state?.publicPath,
      ""
    );

  const stateRoute =
    safeText(
      AppCore?.state?.route,
      ""
    );

  /*
    Si el browser está en activation con query/hash y el estado
    solo tiene /activate-account, preferimos browser.
  */
  if (
    isActivationPath(browserPath) &&
    hasActivationToken(browserPath)
  ) {
    return true;
  }

  /*
    Si el estado está vacío, naturalmente usamos browser.
  */
  if (!statePublicPath && !stateRoute) {
    return true;
  }

  return false;
}

/* =========================================================
   PATHS
========================================================= */

export function getCurrentPath(AppCore) {
  captureInitialUrl();

  const protectedActivationPath =
    getProtectedActivationPath();

  if (protectedActivationPath) {
    return normalizePath(
      AppCore,
      protectedActivationPath
    );
  }

  if (
    shouldPreferBrowserPathOverState(AppCore)
  ) {
    return normalizePath(
      AppCore,
      buildBrowserPath()
    );
  }

  const statePath =
    safeText(
      AppCore?.state?.publicPath,
      ""
    ) ||
    safeText(
      AppCore?.state?.route,
      ""
    );

  if (statePath) {
    return normalizePath(
      AppCore,
      statePath
    );
  }

  return normalizePath(
    AppCore,
    buildBrowserPath()
  );
}

export function getCurrentPublicPath(AppCore) {
  captureInitialUrl();

  const protectedActivationPath =
    getProtectedActivationPath();

  if (protectedActivationPath) {
    return normalizePath(
      AppCore,
      protectedActivationPath
    );
  }

  if (
    shouldPreferBrowserPathOverState(AppCore)
  ) {
    return normalizePath(
      AppCore,
      buildBrowserPath()
    );
  }

  const statePublicPath =
    safeText(
      AppCore?.state?.publicPath,
      ""
    );

  if (statePublicPath) {
    return normalizePath(
      AppCore,
      statePublicPath
    );
  }

  return normalizePath(
    AppCore,
    buildBrowserPath()
  );
}

export function getCurrentCanonicalPath(
  AppCore,
  Router
) {
  /*
    Canonical puede quitar el token, pero solo después de que
    getCurrentPath/getCurrentPublicPath hayan podido preservar
    el public path inicial.
  */
  try {
    if (
      typeof Router?.getCurrentCanonicalPath ===
      "function"
    ) {
      const value =
        Router.getCurrentCanonicalPath();

      if (value) {
        return normalizeCanonicalPath(
          AppCore,
          value
        );
      }
    }
  } catch {}

  const stateCanonical =
    safeText(
      AppCore?.state?.route,
      ""
    );

  if (stateCanonical) {
    return normalizeCanonicalPath(
      AppCore,
      stateCanonical
    );
  }

  return normalizeCanonicalPath(
    AppCore,
    getCurrentPublicPath(AppCore)
  );
}

/* =========================================================
   HTML
========================================================= */

export function escapeHtml(
  AppCore,
  value = ""
) {
  try {
    if (
      typeof AppCore?.utils?.escapeHtml ===
      "function"
    ) {
      return AppCore.utils.escapeHtml(
        String(value ?? "")
      );
    }
  } catch {}

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================
   CLEANUP SCOPE
========================================================= */

export function ensureScope(AppCore) {
  try {
    if (
      typeof AppCore?.cleanup?.scope ===
      "function"
    ) {
      return AppCore.cleanup.scope(
        APP_SCOPE
      );
    }
  } catch {}

  return {
    name: APP_SCOPE,
  };
}

export function clearScope(AppCore) {
  try {
    if (
      typeof AppCore?.cleanup?.run ===
      "function"
    ) {
      AppCore.cleanup.run(APP_SCOPE);
    }
  } catch {}

  return true;
}

/* =========================================================
   MODULES
========================================================= */

export function registerModule(
  AppCore,
  name,
  moduleRef
) {
  const moduleName =
    safeText(name, "");

  if (!moduleName || !moduleRef) {
    return false;
  }

  try {
    if (!AppCore?.modules) {
      return false;
    }

    if (
      typeof AppCore.modules.has ===
        "function" &&
      AppCore.modules.has(moduleName)
    ) {
      return true;
    }

    if (
      typeof AppCore.modules.register ===
      "function"
    ) {
      AppCore.modules.register(
        moduleName,
        moduleRef
      );
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   DEBUG
========================================================= */

export function getHelpersSnapshot(
  AppCore,
  Router
) {
  return {
    path:
      getCurrentPath(AppCore),

    publicPath:
      getCurrentPublicPath(AppCore),

    canonicalPath:
      getCurrentCanonicalPath(
        AppCore,
        Router
      ),

    browserPath:
      buildBrowserPath(),

    initialUrl:
      getInitialUrl(),

    activationInitialUrl:
      getActivationInitialUrl(),

    protectedActivationPath:
      getProtectedActivationPath(),

    hasCleanup:
      Boolean(
        AppCore?.cleanup
      ),

    hasModules:
      Boolean(
        AppCore?.modules
      ),
  };
}

export default {
  getCurrentPath,
  getCurrentPublicPath,
  getCurrentCanonicalPath,
  escapeHtml,
  ensureScope,
  clearScope,
  registerModule,
  getHelpersSnapshot,
};
