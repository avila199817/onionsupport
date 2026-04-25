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
   - preservar query/hash públicos en rutas públicas con token
   - no destruir /activate-account?token=...
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
    typeof window.history.pushState === "function" &&
    typeof window.history.replaceState === "function"
  );
}

function nowTs() {
  return Date.now();
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
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

function normalizePathname(
  AppCore,
  pathname = "/"
) {
  try {
    return normalizePath(
      AppCore,
      pathname || "/"
    );
  } catch {
    return "/";
  }
}

function getBrowserPublicUrl() {
  if (
    !isBrowser() ||
    typeof window === "undefined" ||
    !window.location
  ) {
    return "";
  }

  try {
    return [
      window.location.pathname || "/",
      window.location.search || "",
      window.location.hash || "",
    ].join("");
  } catch {
    return "";
  }
}

function parseUrlParts(value = "/") {
  const raw = safeText(value, "/");

  try {
    const parsed = new URL(
      raw,
      isBrowser() && window.location?.origin
        ? window.location.origin
        : "http://onion.local"
    );

    return {
      pathname: parsed.pathname || "/",
      search: parsed.search || "",
      hash: parsed.hash || "",
    };
  } catch {
    const [pathAndSearch = "/", hashPart = ""] = raw.split("#");
    const [pathname = "/", searchPart = ""] = pathAndSearch.split("?");

    return {
      pathname: pathname || "/",
      search: searchPart ? `?${searchPart}` : "",
      hash: hashPart ? `#${hashPart}` : "",
    };
  }
}

function buildUrlFromParts({
  pathname = "/",
  search = "",
  hash = "",
} = {}) {
  return `${pathname || "/"}${search || ""}${hash || ""}`;
}

/**
 * URL pública para History API.
 *
 * IMPORTANTE:
 * - normaliza SOLO el pathname
 * - conserva search/hash
 * - si el router intenta escribir la misma ruta sin query,
 *   conserva el query actual del navegador
 *
 * Esto evita que:
 *   /activate-account?token=abc
 * se convierta en:
 *   /activate-account
 */
function normalizePublicUrl(
  AppCore,
  url = "/",
  {
    preserveCurrentContext = true,
  } = {}
) {
  const target = parseUrlParts(url);
  const current = parseUrlParts(
    getBrowserPublicUrl() || "/"
  );

  const normalizedTargetPathname =
    normalizePathname(
      AppCore,
      target.pathname || "/"
    );

  const normalizedCurrentPathname =
    normalizePathname(
      AppCore,
      current.pathname || "/"
    );

  const sameRoute =
    normalizedTargetPathname === normalizedCurrentPathname;

  const shouldPreserveSearch =
    preserveCurrentContext &&
    sameRoute &&
    !target.search &&
    Boolean(current.search);

  const shouldPreserveHash =
    preserveCurrentContext &&
    sameRoute &&
    !target.hash &&
    Boolean(current.hash);

  return buildUrlFromParts({
    pathname: normalizedTargetPathname,
    search: shouldPreserveSearch
      ? current.search
      : target.search,
    hash: shouldPreserveHash
      ? current.hash
      : target.hash,
  });
}

/**
 * Ruta canónica interna.
 *
 * IMPORTANTE:
 * - sin query
 * - sin hash
 * - usada para resolver vistas/guards/routes
 */
function normalizeCanonicalUrl(
  AppCore,
  url = "/"
) {
  const parts = parseUrlParts(url);

  return normalizePathname(
    AppCore,
    parts.pathname || "/"
  );
}

function getComparableCurrentUrl(
  AppCore
) {
  const browserUrl =
    getBrowserPublicUrl();

  if (browserUrl) {
    return normalizePublicUrl(
      AppCore,
      browserUrl,
      {
        preserveCurrentContext: false,
      }
    );
  }

  return normalizePublicUrl(
    AppCore,
    getCurrentPublicPath(AppCore) ||
      getCurrentPath(AppCore) ||
      "/",
    {
      preserveCurrentContext: false,
    }
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
  const rawPublicPath =
    buildHistoryUrl(
      AppCore,
      options.getRoute,
      pathname,
      options
    ) || pathname || "/";

  const publicPath =
    normalizePublicUrl(
      AppCore,
      rawPublicPath,
      {
        preserveCurrentContext:
          options.preserveCurrentContext !== false,
      }
    );

  const payload =
    buildStatePayload(
      AppCore,
      publicPath
    ) || {};

  const canonicalPath =
    normalizeCanonicalUrl(
      AppCore,
      options.canonicalPath ||
        payload.canonicalPath ||
        pathname ||
        publicPath ||
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
    resolvedUsername: username,
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
      normalizeCanonicalUrl(
        AppCore,
        getCurrentCanonicalPath(AppCore) ||
          getBrowserPublicUrl() ||
          "/"
      );

    const currentUsername =
      getCurrentResolvedUsername(
        AppCore
      ) || null;

    const currentState =
      window.history.state;

    if (
      currentState &&
      typeof currentState === "object"
    ) {
      const statePublicPath =
        normalizePublicUrl(
          AppCore,
          currentState.publicPath ||
            currentState.path ||
            "/",
          {
            preserveCurrentContext: false,
          }
        );

      const stateCanonicalPath =
        normalizeCanonicalUrl(
          AppCore,
          currentState.canonicalPath ||
            "/"
        );

      if (
        statePublicPath === currentUrl &&
        stateCanonicalPath === currentCanonicalPath
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
          canonicalPath: currentCanonicalPath,
          publicPath: currentUrl,
          username: currentUsername,
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
