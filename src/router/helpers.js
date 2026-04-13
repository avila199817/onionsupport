/* =========================================================
   Onion SPA - Router Helpers
   Archivo: src/router/helpers.js

   Responsabilidades:
   - constantes base del router
   - normalización de rutas y hrefs
   - manejo de slug público /@username
   - helpers de path actual
   - builders de publicPath / loginUrl / historyUrl
   - payload base de history state
   - hardening contra inputs inválidos
========================================================= */

export const ROUTER_CONFIG = Object.freeze({
  maxRouteLength: 2048,
  maxUsernameLength: 64,
});

/* =========================================================
   ROUTE NAMES
========================================================= */
export function getRouteNames(AppCore) {
  return {
    HOME:
      AppCore?.config?.routes
        ?.home || "/",

    LOGIN:
      AppCore?.config?.routes
        ?.login || "/login",

    SERVER:
      "/servidor",

    USERS:
      "/usuarios",
  };
}

/* =========================================================
   BASICS
========================================================= */
export function normalizePath(
  AppCore,
  path = "/"
) {
  return AppCore.utils.normalizePath(
    path
  );
}

export function normalizeRouteInput(
  path = "/"
) {
  const raw = String(
    path ?? ""
  ).trim();

  if (!raw) {
    return "/";
  }

  return raw.slice(
    0,
    ROUTER_CONFIG.maxRouteLength
  );
}

export function escapeHtml(
  AppCore,
  value = ""
) {
  return AppCore.utils.escapeHtml(
    String(value ?? "")
  );
}

export function isBrowser() {
  return (
    typeof window !==
      "undefined" &&
    typeof document !==
      "undefined"
  );
}

/* =========================================================
   PATH PARSING
========================================================= */
export function stripSearchAndHash(
  path = "/"
) {
  const raw = String(
    path || "/"
  );

  const hashIndex =
    raw.indexOf("#");

  const searchIndex =
    raw.indexOf("?");

  let cutIndex = -1;

  if (
    searchIndex >= 0 &&
    hashIndex >= 0
  ) {
    cutIndex = Math.min(
      searchIndex,
      hashIndex
    );
  } else if (
    searchIndex >= 0
  ) {
    cutIndex = searchIndex;
  } else if (
    hashIndex >= 0
  ) {
    cutIndex = hashIndex;
  }

  return cutIndex >= 0
    ? raw.slice(
        0,
        cutIndex
      ) || "/"
    : raw || "/";
}

/* =========================================================
   USERNAME
========================================================= */
export function sanitizeUsername(
  AppCore,
  value = ""
) {
  const normalized =
    AppCore.utils
      .sanitizeUsername
      ? AppCore.utils.sanitizeUsername(
          value
        )
      : String(value || "")
          .trim()
          .replace(
            /^@+/,
            ""
          )
          .replace(
            /\s+/g,
            ""
          )
          .replace(
            /[^a-zA-Z0-9._-]/g,
            ""
          )
          .toLowerCase();

  return normalized.slice(
    0,
    ROUTER_CONFIG.maxUsernameLength
  );
}

export function extractUsernameFromPath(
  AppCore,
  pathname = "/"
) {
  const normalized =
    normalizePath(
      AppCore,
      pathname
    );

  const pathOnly =
    stripSearchAndHash(
      normalized
    );

  const match =
    pathOnly.match(
      /^\/@([^/]+)(?:\/|$)/i
    );

  if (!match) {
    return null;
  }

  return sanitizeUsername(
    AppCore,
    match[1]
  );
}

export function getCurrentUsername(
  AppCore
) {
  return sanitizeUsername(
    AppCore,
    AppCore.state.user
      ?.username ||
      AppCore.state.user
        ?.userName ||
      AppCore.state.user
        ?.nick ||
      AppCore.state.user
        ?.alias ||
      ""
  );
}

export function getCurrentResolvedUsername(
  AppCore
) {
  if (!isBrowser()) {
    return (
      getCurrentUsername(
        AppCore
      ) || null
    );
  }

  return (
    extractUsernameFromPath(
      AppCore,
      window.location.pathname ||
        "/"
    ) ||
    getCurrentUsername(
      AppCore
    ) ||
    null
  );
}

/* =========================================================
   CANONICAL PATHS
========================================================= */
export function stripUsernamePrefix(
  AppCore,
  pathname = "/"
) {
  const normalized =
    normalizePath(
      AppCore,
      pathname
    );

  const hashIndex =
    normalized.indexOf("#");

  const queryIndex =
    normalized.indexOf("?");

  let splitIndex = -1;

  if (
    queryIndex >= 0 &&
    hashIndex >= 0
  ) {
    splitIndex = Math.min(
      queryIndex,
      hashIndex
    );
  } else if (
    queryIndex >= 0
  ) {
    splitIndex = queryIndex;
  } else if (
    hashIndex >= 0
  ) {
    splitIndex = hashIndex;
  }

  const pathOnly =
    splitIndex >= 0
      ? normalized.slice(
          0,
          splitIndex
        )
      : normalized;

  const suffix =
    splitIndex >= 0
      ? normalized.slice(
          splitIndex
        )
      : "";

  const stripped =
    (
      pathOnly || "/"
    ).replace(
      /^\/@[^/]+(?=\/|$)/i,
      ""
    ) || "/";

  return normalizePath(
    AppCore,
    `${stripped}${suffix}`
  );
}

export function normalizeCanonicalPath(
  AppCore,
  path = "/"
) {
  if (
    typeof AppCore.utils
      .normalizeCanonicalPath ===
    "function"
  ) {
    return AppCore.utils.normalizeCanonicalPath(
      path
    );
  }

  const stripped =
    stripUsernamePrefix(
      AppCore,
      path
    );

  return normalizePath(
    AppCore,
    stripSearchAndHash(
      stripped
    )
  );
}

export function isSameCanonicalPath(
  AppCore,
  a = "/",
  b = "/"
) {
  return (
    normalizeCanonicalPath(
      AppCore,
      a
    ) ===
    normalizeCanonicalPath(
      AppCore,
      b
    )
  );
}

/* =========================================================
   URL / CURRENT
========================================================= */
export function getCurrentUrl() {
  if (!isBrowser()) {
    return new URL(
      "http://localhost/"
    );
  }

  return new URL(
    window.location.href
  );
}

export function getCurrentPath(
  AppCore
) {
  if (!isBrowser()) {
    return "/";
  }

  return normalizePath(
    AppCore,
    normalizeRouteInput(
      `${
        window.location
          .pathname || "/"
      }${
        window.location
          .search || ""
      }`
    )
  );
}

export function getCurrentCanonicalPath(
  AppCore
) {
  if (!isBrowser()) {
    return "/";
  }

  return normalizeCanonicalPath(
    AppCore,
    normalizeRouteInput(
      `${
        window.location
          .pathname || "/"
      }${
        window.location
          .search || ""
      }`
    )
  );
}

export function getCurrentPublicPath(
  AppCore
) {
  if (!isBrowser()) {
    return "/";
  }

  return normalizePath(
    AppCore,
    `${
      window.location
        .pathname || "/"
    }${
      window.location
        .search || ""
    }`
  );
}

export function getResolvedPublicPath(
  fallback = "/"
) {
  if (!isBrowser()) {
    return fallback;
  }

  return (
    `${
      window.location
        .pathname || ""
    }${
      window.location
        .search || ""
    }` || fallback
  );
}

/* =========================================================
   HREF RULES
========================================================= */
export function isExternalHref(
  href = ""
) {
  return /^(https?:|mailto:|tel:)/i.test(
    String(href || "").trim()
  );
}

export function isUnsafeHref(
  href = ""
) {
  return /^(javascript:|data:|vbscript:)/i.test(
    String(href || "").trim()
  );
}

export function isHashOnlyHref(
  href = ""
) {
  return String(
    href || ""
  )
    .trim()
    .startsWith("#");
}

export function isSlugCandidatePath(
  AppCore,
  pathname = "/"
) {
  const normalized =
    normalizePath(
      AppCore,
      pathname
    );

  const pathOnly =
    stripSearchAndHash(
      normalized
    );

  return /^\/@[^/]+(?:\/|$)/i.test(
    pathOnly
  );
}

/* =========================================================
   ROUTE VISIBILITY
========================================================= */
export function canUsePublicSlugForRoute(
  route,
  routeNames
) {
  if (!route) {
    return false;
  }

  if (
    route.path ===
    routeNames.LOGIN
  ) {
    return false;
  }

  if (route.hideShell) {
    return false;
  }

  return true;
}

/* =========================================================
   RESOLVE HREF
========================================================= */
export function resolveSpaHref(
  AppCore,
  href = "/"
) {
  const routeNames =
    getRouteNames(
      AppCore
    );

  const raw =
    normalizeRouteInput(
      href
    );

  if (!raw) {
    return routeNames.HOME;
  }

  if (
    isUnsafeHref(raw)
  ) {
    return routeNames.HOME;
  }

  if (
    isExternalHref(raw)
  ) {
    return raw;
  }

  if (
    isHashOnlyHref(raw)
  ) {
    return raw;
  }

  if (
    /^https?:\/\//i.test(
      raw
    )
  ) {
    try {
      const url =
        new URL(raw);

      return normalizePath(
        AppCore,
        `${url.pathname}${url.search}${url.hash}`
      );
    } catch {
      return routeNames.HOME;
    }
  }

  if (
    raw.startsWith("/")
  ) {
    return normalizePath(
      AppCore,
      raw
    );
  }

  if (
    raw.startsWith("@")
  ) {
    return normalizePath(
      AppCore,
      `/${raw}`
    );
  }

  if (
    raw.startsWith("./")
  ) {
    return normalizePath(
      AppCore,
      `/${raw.slice(2)}`
    );
  }

  if (
    raw.startsWith("../")
  ) {
    const cleaned =
      raw.replace(
        /^(\.\.\/)+/,
        ""
      );

    return normalizePath(
      AppCore,
      `/${cleaned}`
    );
  }

  return normalizePath(
    AppCore,
    `/${raw}`
  );
}

/* =========================================================
   BUILDERS
========================================================= */
export function buildPublicPath(
  AppCore,
  getRoute,
  canonicalPath = "/",
  options = {}
) {
  const routeNames =
    getRouteNames(
      AppCore
    );

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      canonicalPath
    );

  const route =
    getRoute(canonical);

  if (!route) {
    return canonical;
  }

  if (
    !canUsePublicSlugForRoute(
      route,
      routeNames
    )
  ) {
    return canonical;
  }

  const username =
    sanitizeUsername(
      AppCore,
      options.username ||
        extractUsernameFromPath(
          AppCore,
          options.fromPath ||
            ""
        ) ||
        getCurrentResolvedUsername(
          AppCore
        ) ||
        getCurrentUsername(
          AppCore
        )
    );

  if (!username) {
    return canonical;
  }

  if (
    canonical ===
    routeNames.HOME
  ) {
    return `/@${username}`;
  }

  return `/@${username}${canonical}`;
}

export function getRedirectPath(
  AppCore
) {
  const routeNames =
    getRouteNames(
      AppCore
    );

  const url =
    getCurrentUrl();

  const redirect =
    url.searchParams.get(
      "redirect"
    );

  if (!redirect) {
    return null;
  }

  const resolved =
    resolveSpaHref(
      AppCore,
      redirect
    );

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      resolved
    );

  if (
    !canonical ||
    canonical ===
      routeNames.LOGIN
  ) {
    return null;
  }

  return canonical;
}

export function buildLoginUrl(
  AppCore,
  redirectPath = null
) {
  const routeNames =
    getRouteNames(
      AppCore
    );

  const loginPath =
    normalizePath(
      AppCore,
      routeNames.LOGIN
    );

  if (
    !redirectPath ||
    normalizeCanonicalPath(
      AppCore,
      redirectPath
    ) === routeNames.LOGIN
  ) {
    return loginPath;
  }

  const baseOrigin =
    isBrowser()
      ? window.location
          .origin
      : "http://localhost";

  const url = new URL(
    baseOrigin +
      loginPath
  );

  url.searchParams.set(
    "redirect",
    normalizeCanonicalPath(
      AppCore,
      redirectPath
    )
  );

  return `${url.pathname}${url.search}`;
}

export function buildHistoryUrl(
  AppCore,
  getRoute,
  pathname = "/",
  options = {}
) {
  const routeNames =
    getRouteNames(
      AppCore
    );

  const normalized =
    resolveSpaHref(
      AppCore,
      pathname
    );

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      normalized
    );

  const route =
    getRoute(
      canonical
    );

  let finalPath =
    normalized;

  if (
    !options.preservePath
  ) {
    if (
      route &&
      canUsePublicSlugForRoute(
        route,
        routeNames
      )
    ) {
      finalPath =
        buildPublicPath(
          AppCore,
          getRoute,
          canonical,
          {
            username:
              options.username,
            fromPath:
              normalized,
          }
        );
    } else {
      finalPath =
        canonical;
    }
  }

  const baseOrigin =
    isBrowser()
      ? window.location
          .origin
      : "http://localhost";

  const url = new URL(
    baseOrigin +
      finalPath
  );

  if (
    options.withRedirect
  ) {
    const redirectCanonical =
      normalizeCanonicalPath(
        AppCore,
        options.withRedirect
      );

    if (
      redirectCanonical &&
      redirectCanonical !==
        routeNames.LOGIN
    ) {
      url.searchParams.set(
        "redirect",
        redirectCanonical
      );
    }
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildStatePayload(
  AppCore,
  pathname = "/",
  extras = {}
) {
  const normalized =
    normalizePath(
      AppCore,
      pathname
    );

  const canonicalPath =
    normalizeCanonicalPath(
      AppCore,
      normalized
    );

  const username =
    extractUsernameFromPath(
      AppCore,
      normalized
    ) || null;

  return {
    path: normalized,
    canonicalPath,
    username,
    ...extras,
  };
}

export function getDefaultHomeTarget(
  AppCore,
  getRoute
) {
  const routeNames =
    getRouteNames(
      AppCore
    );

  return (
    buildPublicPath(
      AppCore,
      getRoute,
      routeNames.HOME,
      {
        username:
          getCurrentResolvedUsername(
            AppCore
          ) ||
          getCurrentUsername(
            AppCore
          ),
      }
    ) || routeNames.HOME
  );
}
