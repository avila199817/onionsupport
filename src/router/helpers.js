/* =========================================================
   Onion SPA - Router Helpers
   Archivo: src/router/helpers.js

   RESPONSABILIDADES:
   - constantes base del router
   - normalización de rutas y hrefs
   - manejo de slug público /@username
   - helpers de path actual
   - builders de publicPath / loginUrl / historyUrl
   - payload base de history state
   - hardening contra inputs inválidos

   FIXES:
   - preserve query/hash en canonical cuando aplica
   - redirects internos seguros
   - soporte href relativo robusto
   - usernames saneados estrictamente
   - no perder username resuelto entre estado, URL y rutas públicas
   - no degradar publicPath contextualizado a canonical sin slug
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

export function isBrowser() {
  return (
    typeof window !==
      "undefined" &&
    typeof document !==
      "undefined"
  );
}

export function normalizePath(
  AppCore,
  path = "/"
) {
  const fallbackNormalize = (
    value
  ) => {
    const raw = normalizeRouteInput(
      value
    );

    if (!raw) {
      return "/";
    }

    if (
      raw.startsWith("#")
    ) {
      return raw;
    }

    let working = raw;

    let hash = "";
    const hashIndex =
      working.indexOf("#");

    if (hashIndex >= 0) {
      hash = working.slice(
        hashIndex
      );
      working = working.slice(
        0,
        hashIndex
      );
    }

    let search = "";
    const searchIndex =
      working.indexOf("?");

    if (searchIndex >= 0) {
      search = working.slice(
        searchIndex
      );
      working = working.slice(
        0,
        searchIndex
      );
    }

    let pathname =
      String(working || "/")
        .replace(/\/{2,}/g, "/")
        .trim();

    if (!pathname) {
      pathname = "/";
    }

    if (
      !pathname.startsWith("/")
    ) {
      pathname = `/${pathname}`;
    }

    if (
      pathname.length > 1 &&
      pathname.endsWith("/")
    ) {
      pathname = pathname.replace(
        /\/+$/,
        ""
      ) || "/";
    }

    return `${pathname}${search}${hash}`;
  };

  try {
    if (
      AppCore?.utils
        ?.normalizePath
    ) {
      return fallbackNormalize(
        AppCore.utils.normalizePath(
          path
        )
      );
    }
  } catch {}

  return fallbackNormalize(path);
}

export function escapeHtml(
  AppCore,
  value = ""
) {
  return AppCore?.utils?.escapeHtml
    ? AppCore.utils.escapeHtml(
        String(value ?? "")
      )
    : String(value ?? "");
}

/* =========================================================
   PATH PARSING
========================================================= */

function splitPathParts(
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

  return {
    pathname:
      cutIndex >= 0
        ? raw.slice(
            0,
            cutIndex
          ) || "/"
        : raw || "/",
    suffix:
      cutIndex >= 0
        ? raw.slice(cutIndex)
        : "",
  };
}

export function stripSearchAndHash(
  path = "/"
) {
  const { pathname } =
    splitPathParts(path);

  return pathname || "/";
}

export function getSearchAndHash(
  path = "/"
) {
  const { suffix } =
    splitPathParts(path);

  return suffix || "";
}

/* =========================================================
   USERNAME
========================================================= */

export function sanitizeUsername(
  AppCore,
  value = ""
) {
  const fallback = String(
    value || ""
  )
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(
      /[^a-zA-Z0-9._-]/g,
      ""
    )
    .toLowerCase();

  let normalized =
    fallback;

  try {
    if (
      AppCore?.utils
        ?.sanitizeUsername
    ) {
      normalized =
        AppCore.utils.sanitizeUsername(
          value
        ) || fallback;
    }
  } catch {}

  return String(normalized || "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(
      /[^a-zA-Z0-9._-]/g,
      ""
    )
    .toLowerCase()
    .slice(
      0,
      ROUTER_CONFIG.maxUsernameLength
    )
    .trim();
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

  const username =
    sanitizeUsername(
      AppCore,
      match[1]
    );

  return username || null;
}

export function getCurrentUsername(
  AppCore
) {
  return (
    sanitizeUsername(
      AppCore,
      AppCore?.state?.user
        ?.username ||
        AppCore?.state?.user
          ?.userName ||
        AppCore?.state?.user
          ?.nick ||
        AppCore?.state?.user
          ?.alias ||
        ""
    ) || null
  );
}

export function getCurrentResolvedUsername(
  AppCore
) {
  const stateResolved =
    sanitizeUsername(
      AppCore,
      AppCore?.state
        ?.currentResolvedUsername ||
        AppCore?.state?.resolvedUsername ||
        ""
    ) || null;

  if (stateResolved) {
    return stateResolved;
  }

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
      `${window.location.pathname || "/"}${window.location.search || ""}`
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

  const suffix =
    getSearchAndHash(
      normalized
    );

  const pathOnly =
    stripSearchAndHash(
      normalized
    );

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
  const input =
    normalizePath(
      AppCore,
      path
    );

  const stripped =
    stripUsernamePrefix(
      AppCore,
      input
    );

  const suffix =
    getSearchAndHash(
      stripped
    );

  const pathOnly =
    stripSearchAndHash(
      stripped
    );

  const normalized =
    normalizePath(
      AppCore,
      pathOnly
    );

  return `${stripSearchAndHash(normalized)}${suffix}`;
}

export function isSameCanonicalPath(
  AppCore,
  a = "/",
  b = "/"
) {
  return (
    stripSearchAndHash(
      normalizeCanonicalPath(
        AppCore,
        a
      )
    ) ===
    stripSearchAndHash(
      normalizeCanonicalPath(
        AppCore,
        b
      )
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
    return (
      normalizePath(
        AppCore,
        AppCore?.state
          ?.publicPath ||
          AppCore?.state?.route ||
          "/"
      ) || "/"
    );
  }

  return normalizePath(
    AppCore,
    `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
  );
}

export function getCurrentCanonicalPath(
  AppCore
) {
  if (!isBrowser()) {
    return normalizeCanonicalPath(
      AppCore,
      AppCore?.state?.route || "/"
    );
  }

  return normalizeCanonicalPath(
    AppCore,
    `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
  );
}

export function getCurrentPublicPath(
  AppCore
) {
  const statePublicPath =
    normalizePath(
      AppCore,
      AppCore?.state
        ?.publicPath || ""
    );

  if (
    statePublicPath &&
    statePublicPath !== "/"
  ) {
    return statePublicPath;
  }

  return getCurrentPath(AppCore);
}

export function getResolvedPublicPath(
  fallback = "/"
) {
  if (!isBrowser()) {
    return fallback;
  }

  return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
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

  return /^\/@[^/]+(?:\/|$)/i.test(
    stripSearchAndHash(
      normalized
    )
  );
}

/* =========================================================
   ROUTE VISIBILITY
========================================================= */

export function canUsePublicSlugForRoute(
  route,
  routeNames
) {
  if (!route) return false;

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
    raw.startsWith("/")
  ) {
    return normalizePath(
      AppCore,
      raw
    );
  }

  if (
    raw.startsWith("./") ||
    raw.startsWith("../")
  ) {
    try {
      const base =
        isBrowser()
          ? window.location.href
          : "http://localhost/";
      const url = new URL(
        raw,
        base
      );

      return normalizePath(
        AppCore,
        `${url.pathname}${url.search}${url.hash}`
      );
    } catch {
      return routeNames.HOME;
    }
  }

  if (
    raw.startsWith("@")
  ) {
    return normalizePath(
      AppCore,
      `/${raw}`
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

  const cleanCanonical =
    stripSearchAndHash(
      canonical
    );

  const suffix =
    getSearchAndHash(
      canonical
    );

  const route =
    getRoute(
      cleanCanonical
    );

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
        options.resolvedUsername ||
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
    cleanCanonical ===
    routeNames.HOME
  ) {
    return normalizePath(
      AppCore,
      `/@${username}${suffix}`
    );
  }

  return normalizePath(
    AppCore,
    `/@${username}${cleanCanonical}${suffix}`
  );
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

  let safeRedirect = "";

  try {
    safeRedirect =
      decodeURIComponent(
        String(redirect)
      ).trim();
  } catch {
    safeRedirect =
      String(redirect).trim();
  }

  if (
    isUnsafeHref(
      safeRedirect
    ) ||
    isExternalHref(
      safeRedirect
    )
  ) {
    return null;
  }

  const resolved =
    resolveSpaHref(
      AppCore,
      safeRedirect
    );

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      resolved
    );

  const clean =
    stripSearchAndHash(
      canonical
    );

  if (
    !clean ||
    clean ===
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

  if (!redirectPath) {
    return loginPath;
  }

  const redirectCanonical =
    normalizeCanonicalPath(
      AppCore,
      redirectPath
    );

  if (
    stripSearchAndHash(
      redirectCanonical
    ) ===
    stripSearchAndHash(
      loginPath
    )
  ) {
    return loginPath;
  }

  const url = new URL(
    `http://localhost${loginPath}`
  );

  url.searchParams.set(
    "redirect",
    redirectCanonical
  );

  return `${url.pathname}${url.search}`;
}

export function buildHistoryUrl(
  AppCore,
  getRoute,
  pathname = "/",
  options = {}
) {
  const normalized =
    resolveSpaHref(
      AppCore,
      pathname
    );

  if (
    options.preservePath
  ) {
    return normalizePath(
      AppCore,
      normalized
    );
  }

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      normalized
    );

  return buildPublicPath(
    AppCore,
    getRoute,
    canonical,
    {
      username:
        options.username,
      resolvedUsername:
        options.resolvedUsername,
      fromPath:
        normalized,
    }
  );
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

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      normalized
    );

  const username =
    extractUsernameFromPath(
      AppCore,
      normalized
    ) ||
    getCurrentResolvedUsername(
      AppCore
    ) ||
    null;

  return {
    path: normalized,
    publicPath: normalized,
    canonicalPath:
      canonical,
    searchAndHash:
      getSearchAndHash(
        normalized
      ),
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
