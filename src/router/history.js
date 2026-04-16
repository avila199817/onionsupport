/* =========================================================
   Onion SPA - Router History
   Archivo: src/router/history.js

   RESPONSABILIDADES:
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
   - preservar publicPath/canonicalPath/username
   - no degradar URL contextualizada /@username
========================================================= */

import {
  isBrowser,
  normalizePath,
  getCurrentPath,
  getCurrentCanonicalPath,
  getCurrentPublicPath,
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
      "undefined" &&
    typeof window.history.pushState ===
      "function" &&
    typeof window.history.replaceState ===
      "function"
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

function normalizeUrl(
  AppCore,
  url = "/"
) {
  return normalizePath(
    AppCore,
    url
  );
}

function getComparableCurrentUrl(
  AppCore
) {
  return normalizeUrl(
    AppCore,
    getCurrentPublicPath(
      AppCore
    ) ||
      getCurrentPath(
        AppCore
      ) ||
      "/"
  );
}

function getResolvedHistoryContext(
  AppCore,
  pathname = "/",
  options = {}
) {
  const publicPath =
    normalizeUrl(
      AppCore,
      buildHistoryUrl(
        AppCore,
        options.getRoute,
        pathname,
        options
      )
    );

  const canonicalPath =
    normalizeUrl(
      AppCore,
      options.canonicalPath ||
        buildStatePayload(
          AppCore,
          publicPath
        )?.canonicalPath ||
        pathname ||
        "/"
    );

  const username =
    options.username ||
    options.resolvedUsername ||
    buildStatePayload(
      AppCore,
      publicPath
    )?.username ||
    getCurrentResolvedUsername(
      AppCore
    ) ||
    null;

  return {
    publicPath,
    canonicalPath,
    username,
  };
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
  const {
    publicPath,
    canonicalPath,
    username,
  } = getResolvedHistoryContext(
    AppCore,
    pathname,
    options
  );

  const state =
    createHistoryState({
      AppCore,
      pathname: publicPath,
      extras: {
        mode: "push",
        canonicalPath,
        publicPath,
        username,
        redirectedFrom:
          options.redirectedFrom ||
          null,
      },
    });

  return safeHistoryCall(
    "pushState",
    state,
    publicPath
  );
}

export function replaceState({
  AppCore,
  pathname = "/",
  options = {},
} = {}) {
  const {
    publicPath,
    canonicalPath,
    username,
  } = getResolvedHistoryContext(
    AppCore,
    pathname,
    options
  );

  const state =
    createHistoryState({
      AppCore,
      pathname: publicPath,
      extras: {
        mode: "replace",
        canonicalPath,
        publicPath,
        username,
        redirectedFrom:
          options.redirectedFrom ||
          null,
      },
    });

  return safeHistoryCall(
    "replaceState",
    state,
    publicPath
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

  const {
    publicPath: nextUrl,
    canonicalPath,
    username,
  } = getResolvedHistoryContext(
    AppCore,
    pathname,
    finalOptions
  );

  const currentUrl =
    getComparableCurrentUrl(
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

  const writeOptions = {
    ...finalOptions,
    canonicalPath,
    username,
    resolvedUsername:
      username,
  };

  if (
    sameUrl ||
    options.replaceState
  ) {
    return replaceState({
      AppCore,
      pathname: nextUrl,
      options: writeOptions,
    });
  }

  return pushState({
    AppCore,
    pathname: nextUrl,
    options: writeOptions,
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
    const currentUrl =
      getComparableCurrentUrl(
        AppCore
      );

    const currentCanonicalPath =
      normalizeUrl(
        AppCore,
        getCurrentCanonicalPath(
          AppCore
        ) || "/"
      );

    const currentUsername =
      getCurrentResolvedUsername(
        AppCore
      );

    const currentState =
      window.history.state;

    if (
      currentState &&
      typeof currentState ===
        "object"
    ) {
      const currentStatePath =
        normalizeUrl(
          AppCore,
          currentState.publicPath ||
            currentState.path ||
            ""
        );

      const currentStateCanonical =
        normalizeUrl(
          AppCore,
          currentState.canonicalPath ||
            ""
        );

      if (
        currentStatePath ===
          currentUrl &&
        currentStateCanonical ===
          currentCanonicalPath
      ) {
        return true;
      }
    }

    const state =
      createHistoryState({
        AppCore,
        pathname: currentUrl,
        extras: {
          mode: "initial",
          canonicalPath:
            currentCanonicalPath,
          publicPath:
            currentUrl,
          username:
            currentUsername,
        },
      });

    window.history.replaceState(
      state,
      "",
      currentUrl
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
