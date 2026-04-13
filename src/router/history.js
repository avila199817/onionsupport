/* =========================================================
   Onion SPA - Router History
   Archivo: src/router/history.js

   Responsabilidades:
   - actualizar el historial del navegador
   - inicializar el state base de la SPA
   - exponer navegación nativa hacia atrás
   - proteger entorno no-browser
   - evitar pushes redundantes
========================================================= */

import {
  buildHistoryUrl,
  buildStatePayload,
  normalizeCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   INTERNAL
========================================================= */
function isBrowser() {
  return (
    typeof window !==
      "undefined" &&
    typeof document !==
      "undefined"
  );
}

function getHistoryApi() {
  if (!isBrowser()) {
    return null;
  }

  return window.history || null;
}

function safeCurrentUrl() {
  if (!isBrowser()) {
    return "/";
  }

  return `${window.location.pathname || "/"}${
    window.location.search || ""
  }${window.location.hash || ""}`;
}

function isSameUrl(
  targetUrl = ""
) {
  return (
    safeCurrentUrl() ===
    String(targetUrl || "")
  );
}

/* =========================================================
   UPDATE HISTORY
========================================================= */
export function updateHistory({
  AppCore,
  getRoute,
  pathname = "/",
  options = {},
}) {
  if (
    options.skipHistory
  ) {
    return false;
  }

  const history =
    getHistoryApi();

  if (!history) {
    return false;
  }

  const targetUrl =
    buildHistoryUrl(
      AppCore,
      getRoute,
      pathname,
      {
        username:
          options.username,
        preservePath:
          Boolean(
            options.preservePath
          ),
        withRedirect:
          options.withRedirect ||
          null,
      }
    );

  const payload =
    buildStatePayload(
      AppCore,
      targetUrl,
      {
        redirectedFrom:
          options.redirectedFrom
            ? normalizeCanonicalPath(
                AppCore,
                options.redirectedFrom
              )
            : null,

        redirectTo:
          options.withRedirect
            ? normalizeCanonicalPath(
                AppCore,
                options.withRedirect
              )
            : null,
      }
    );

  const useReplace =
    Boolean(
      options.replaceState
    ) ||
    isSameUrl(
      targetUrl
    );

  if (useReplace) {
    history.replaceState(
      payload,
      "",
      targetUrl
    );
  } else {
    history.pushState(
      payload,
      "",
      targetUrl
    );
  }

  return true;
}

/* =========================================================
   INITIAL STATE
========================================================= */
export function ensureInitialHistoryState({
  AppCore,
}) {
  const history =
    getHistoryApi();

  if (!history) {
    return false;
  }

  if (
    history.state
  ) {
    return false;
  }

  const initialPath =
    getCurrentPublicPath(
      AppCore
    ) || "/";

  const payload =
    buildStatePayload(
      AppCore,
      initialPath
    );

  history.replaceState(
    payload,
    "",
    initialPath
  );

  return true;
}

/* =========================================================
   NATIVE BACK
========================================================= */
export function back() {
  const history =
    getHistoryApi();

  if (!history) {
    return false;
  }

  history.back();
  return true;
}
