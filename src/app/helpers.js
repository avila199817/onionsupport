/* =========================================================
   Onion SPA - App Helpers
   Archivo: src/app/helpers.js

   Responsabilidades:
   - resolver paths actuales de la app
   - normalizar public path y canonical path
   - escapar HTML seguro para render inline
   - gestionar scope global de cleanup
   - registrar módulos en AppCore sin duplicados
========================================================= */

import { APP_SCOPE } from "./constants.js";

export function getCurrentPath(AppCore) {
  return AppCore.utils.normalizePath(
    `${window.location.pathname || "/"}${window.location.search || ""}`
  );
}

export function getCurrentPublicPath(AppCore) {
  return AppCore.utils.normalizePath(
    `${window.location.pathname || "/"}${window.location.search || ""}`
  );
}

export function getCurrentCanonicalPath(AppCore, Router) {
  if (typeof Router?.getCurrentCanonicalPath === "function") {
    return Router.getCurrentCanonicalPath();
  }

  return AppCore.utils.normalizeCanonicalPath(
    getCurrentPublicPath(AppCore)
  );
}

export function escapeHtml(AppCore, value = "") {
  return AppCore.utils.escapeHtml(String(value ?? ""));
}

export function ensureScope(AppCore) {
  return AppCore.cleanup.scope(APP_SCOPE);
}

export function clearScope(AppCore) {
  AppCore.cleanup.run(APP_SCOPE);
}

export function registerModule(AppCore, name, moduleRef) {
  if (!name || !moduleRef) return;
  if (AppCore.modules.has(name)) return;
  AppCore.modules.register(name, moduleRef);
}
