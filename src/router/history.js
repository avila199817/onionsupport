/* =========================================================
   Onion SPA - Router History
   Archivo: src/router/history.js

   Responsabilidades:
   - centralizar pushState / replaceState
   - construir state payload consistente
   - init state inicial idempotente
   - navegación back segura
   - helpers reutilizables para router

   HARDENING:
   - guards browser
   - fallback silencioso si History API falla
   - normalización de URL/state
   - no duplicar estados innecesarios
========================================================= */

import {
  isBrowser,
  getCurrentPath,
  getCurrentCanonicalPath,
  getCurrentResolvedUsername,
  buildHistoryUrl,
  buildStatePayload,
} from "./helpers.js";

/* =========================================================
   BASICS
========================================================= */

function canUseHistory() {
  return (
    isBrowser() &&
    typeof window.history !==
      "undefined"
  );
}

function safeHistoryCall(
  method,
  state,
  url
) {
  if (!canUseHistory()) {
    return false;
  }

  try {
    window.history[method](
      state,
      "",
      url
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   BUILDERS
========================================================= */

export function createHistoryState({
  AppCore,
  pathname = "/",
  extras = {},
} = {}) {
  return buildStatePayload(
    AppCore,
    pathname,
    {
      ts: Date.now(),
      ...extras,
    }
  );
}

/* =========================================================
   WRITE
========================================================= */

export function pushState({
  AppCore,
  pathname = "/",
  options = {},
} = {}) {
  const url =
    buildHistoryUrl(
      AppCore,
      options.getRoute,
      pathname,
      options
    );

  const state =
    createHistoryState({
      AppCore,
      pathname: url,
      extras: {
        mode: "push",
        redirectedFrom:
          options.redirectedFrom ||
          null,
      },
    });

  return safeHistoryCall(
    "pushState",
    state,
    url
  );
}

export function replaceState({
  AppCore,
  pathname = "/",
  options = {},
} = {}) {
  const url =
    buildHistoryUrl(
      AppCore,
      options.getRoute,
      pathname,
      options
    );

  const state =
    createHistoryState({
      AppCore,
      pathname: url,
      extras: {
        mode: "replace",
        redirectedFrom:
          options.redirectedFrom ||
          null,
      },
    });

  return safeHistoryCall(
    "replaceState",
    state,
    url
  );
}

/* =========================================================
   MAIN UPDATE
========================================================= */

export function updateHistory({
  AppCore,
  getRoute,
  pathname = "/",
  options = {},
} = {}) {
  if (
    !canUseHistory() ||
    options.skipHistory
  ) {
    return false;
  }

  const finalOptions = {
    ...options,
    getRoute,
  };

  const nextUrl =
    buildHistoryUrl(
      AppCore,
      getRoute,
      pathname,
      finalOptions
    );

  const currentUrl =
    getCurrentPath(
      AppCore
    );

  const sameUrl =
    nextUrl === currentUrl;

  if (
    sameUrl &&
    !options.force &&
    !options.replaceState
  ) {
    return false;
  }

  if (
    sameUrl ||
    options.replaceState
  ) {
    return replaceState({
      AppCore,
      pathname,
      options:
        finalOptions,
    });
  }

  return pushState({
    AppCore,
    pathname,
    options:
      finalOptions,
  });
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function ensureInitialHistoryState({
  AppCore,
} = {}) {
  if (!canUseHistory()) {
    return false;
  }

  try {
    if (
      window.history.state &&
      typeof window.history.state ===
        "object"
    ) {
      return true;
    }

    const currentPath =
      getCurrentPath(
        AppCore
      );

    const state =
      createHistoryState({
        AppCore,
        pathname:
          currentPath,
        extras: {
          mode: "initial",
          canonicalPath:
            getCurrentCanonicalPath(
              AppCore
            ),
          username:
            getCurrentResolvedUsername(
              AppCore
            ),
        },
      });

    window.history.replaceState(
      state,
      "",
      currentPath
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

export function back() {
  if (!canUseHistory()) {
    return false;
  }

  try {
    window.history.back();
    return true;
  } catch {
    return false;
  }
}
