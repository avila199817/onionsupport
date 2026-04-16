/* =========================================================
   Onion SPA - App Helpers
   Archivo: src/app/helpers.js

   RESPONSABILIDADES:
   - resolver paths actuales de la app
   - normalizar public path y canonical path
   - escapar HTML seguro para render inline
   - gestionar scope global de cleanup
   - registrar módulos en AppCore sin duplicados

   HARDENING EXTREMO:
   - tolerancia total si faltan módulos
   - fallback browser/server safe
   - helpers puros e idempotentes
   - cero throws accidentales
   - prioridad al estado sincronizado sobre window cuando aplica
   - soporte slug /@username robusto
========================================================= */

import { APP_SCOPE } from "./constants.js";

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

function fallbackNormalizePath(path = "/") {
  let raw = safeText(path, "/") || "/";

  if (!raw.startsWith("/")) {
    raw = `/${raw}`;
  }

  raw = raw.replace(/\/{2,}/g, "/");

  if (raw.length > 1) {
    raw = raw.replace(/\/+$/g, "");
  }

  return raw || "/";
}

function normalizePath(AppCore, path = "/") {
  try {
    if (
      typeof AppCore?.utils?.normalizePath ===
      "function"
    ) {
      return AppCore.utils.normalizePath(path);
    }
  } catch {}

  return fallbackNormalizePath(path);
}

function normalizeCanonicalPath(AppCore, path = "/") {
  try {
    if (
      typeof AppCore?.utils?.normalizeCanonicalPath ===
      "function"
    ) {
      return AppCore.utils.normalizeCanonicalPath(path);
    }
  } catch {}

  return normalizePath(AppCore, path);
}

function buildBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  const pathname =
    window.location.pathname || "/";

  const search =
    window.location.search || "";

  const hash =
    window.location.hash || "";

  return `${pathname}${search}${hash}`;
}

/* =========================================================
   PATHS
========================================================= */

export function getCurrentPath(AppCore) {
  const statePath =
    safeText(
      AppCore?.state?.publicPath,
      ""
    ) || safeText(AppCore?.state?.route, "");

  if (statePath) {
    return normalizePath(AppCore, statePath);
  }

  return normalizePath(
    AppCore,
    buildBrowserPath()
  );
}

export function getCurrentPublicPath(AppCore) {
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
    path: getCurrentPath(AppCore),
    publicPath:
      getCurrentPublicPath(AppCore),
    canonicalPath:
      getCurrentCanonicalPath(
        AppCore,
        Router
      ),
    hasCleanup: Boolean(
      AppCore?.cleanup
    ),
    hasModules: Boolean(
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
