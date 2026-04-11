/* =========================================================
   Onion SPA - Router History
   Archivo: src/router/history.js

   Responsabilidades:
   - actualizar el historial del navegador
   - inicializar el state base de la SPA
   - exponer navegación nativa hacia atrás
========================================================= */

import {
  buildHistoryUrl,
  buildStatePayload,
  normalizeCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

export function updateHistory({
  AppCore,
  getRoute,
  pathname = "/",
  options = {},
}) {
  if (options.skipHistory) return;

  const targetUrl = buildHistoryUrl(AppCore, getRoute, pathname, {
    username: options.username,
    preservePath: Boolean(options.preservePath),
    withRedirect: options.withRedirect || null,
  });

  const payload = buildStatePayload(AppCore, targetUrl, {
    redirectedFrom: options.redirectedFrom
      ? normalizeCanonicalPath(AppCore, options.redirectedFrom)
      : null,
    redirectTo: options.withRedirect
      ? normalizeCanonicalPath(AppCore, options.withRedirect)
      : null,
  });

  if (options.replaceState) {
    window.history.replaceState(payload, "", targetUrl);
  } else {
    window.history.pushState(payload, "", targetUrl);
  }
}

export function ensureInitialHistoryState({
  AppCore,
}) {
  if (window.history.state) return;

  const initialPath = getCurrentPublicPath(AppCore) || "/";
  const payload = buildStatePayload(AppCore, initialPath);

  window.history.replaceState(payload, "", initialPath);
}

export function back() {
  window.history.back();
}
