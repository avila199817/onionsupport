/* =========================================================
   Onion SPA - Router History
   Archivo: src/router/history.js

   RESPONSABILIDADES:
   - centralizar pushState / replaceState
   - construir state payload consistente
   - init state inicial idempotente
   - navegación back segura
   - helpers reutilizables para router

   HARDENING EXTREMO:
   - guards browser robustos
   - fallback silencioso si History API falla
   - normalización estricta URL/state
   - no duplicar estados innecesarios
   - preservar publicPath/canonicalPath/username
   - no degradar URL contextualizada /@username
   - timestamps estables
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
    typeof window !== "undefined" &&
    typeof window.history !== "undefined" &&
    typeof window.history.pushState ===
      "function" &&
    typeof window.history.replaceState ===
      "function"
  );
}

function nowTs() {
  return Date.now();
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
  try {
    return normalizePath(
      AppCore,
      url || "/"
    );
  } catch {
    return "/";
  }
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

/* =========================================================
   CONTEXT RESOLUTION
========================================================= */

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
      ) || pathname
    );

  const payload =
    buildStatePayload(
      AppCore,
      publicPath
    ) || {};

  const canonicalPath =
    normalizeUrl(
      AppCore,
      options.canonicalPath ||
        payload.canonicalPath ||
        pathname ||
        "/"
    );

  const username =
    options.username ||
    options.resolvedUsername ||
    payload.username ||
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
      ts: nowTs(),
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
    options.skipHistory === true
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
    options.replaceState === true
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
      ) || null;

    const currentState =
      window.history.state;

    if (
      currentState &&
      typeof currentState ===
        "object"
    ) {
      const statePublicPath =
        normalizeUrl(
          AppCore,
          currentState.publicPath ||
            currentState.path ||
            "/"
        );

      const stateCanonicalPath =
        normalizeUrl(
          AppCore,
          currentState.canonicalPath ||
            "/"
        );

      if (
        statePublicPath ===
          currentUrl &&
        stateCanonicalPath ===
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
