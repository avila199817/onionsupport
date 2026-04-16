/* =========================================================
   Onion SPA - Router Helpers
   Archivo: src/router/helpers.js

   RESPONSABILIDADES:
   - constantes base del router
   - normalización robusta de rutas / hrefs
   - manejo sólido de slug público /@username
   - helpers path actual / canonical / public
   - builders login / history / state
   - hardening total contra inputs corruptos
   - preservar query/hash correctamente
   - cero degradación username/context path

   HARDENING EXTREMO 10/10:
   - canonical determinista
   - slug estricto enterprise
   - redirect interno seguro
   - soporte href relativo real
   - evita loops login
   - no rompe SSR/no-browser
   - outputs siempre normalizados
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
      AppCore?.config?.routes
        ?.server || "/servidor",

    USERS:
      AppCore?.config?.routes
        ?.users || "/usuarios",
  };
}

/* =========================================================
   BASICS
========================================================= */

export function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

export function normalizeRouteInput(
  value = "/"
) {
  const text = String(
    value ?? ""
  ).trim();

  if (!text) {
    return "/";
  }

  return text.slice(
    0,
    ROUTER_CONFIG.maxRouteLength
  );
}

export function escapeHtml(
  AppCore,
  value = ""
) {
  try {
    if (
      AppCore?.utils?.escapeHtml
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
   PATH CORE
========================================================= */

function splitRawPath(
  path = "/"
) {
  const raw =
    normalizeRouteInput(path);

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(
      hashIndex
    );
    pathname =
      pathname.slice(
        0,
        hashIndex
      ) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(
      searchIndex
    );
    pathname =
      pathname.slice(
        0,
        searchIndex
      ) || "/";
  }

  return {
    pathname:
      pathname || "/",
    search,
    hash,
  };
}

function normalizePathnameOnly(
  pathname = "/"
) {
  let value = String(
    pathname || "/"
  )
    .replace(/\/{2,}/g, "/")
    .trim();

  if (!value) {
    value = "/";
  }

  if (
    !value.startsWith("/")
  ) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(
        /\/+$/,
        ""
      ) || "/";
  }

  return value;
}

export function normalizePath(
  AppCore,
  path = "/"
) {
  const raw =
    normalizeRouteInput(path);

  if (
    raw.startsWith("#")
  ) {
    return raw;
  }

  try {
    if (
      AppCore?.utils
        ?.normalizePath
    ) {
      const delegated =
        AppCore.utils.normalizePath(
          raw
        );

      if (delegated) {
        return normalizePath(
          null,
          delegated
        );
      }
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } = splitRawPath(raw);

  return `${normalizePathnameOnly(
    pathname
  )}${search}${hash}`;
}

export function stripSearchAndHash(
  path = "/"
) {
  return splitRawPath(
    normalizePath(
      null,
      path
    )
  ).pathname;
}

export function getSearchAndHash(
  path = "/"
) {
  const parts =
    splitRawPath(
      normalizePath(
        null,
        path
      )
    );

  return `${parts.search}${parts.hash}`;
}

/* =========================================================
   USERNAME
========================================================= */

export function sanitizeUsername(
  AppCore,
  value = ""
) {
  let normalized = String(
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

  try {
    if (
      AppCore?.utils
        ?.sanitizeUsername
    ) {
      normalized =
        AppCore.utils.sanitizeUsername(
          normalized
        ) || normalized;
    }
  } catch {}

  return String(normalized)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(
      /[^a-z0-9._-]/g,
      ""
    )
    .slice(
      0,
      ROUTER_CONFIG.maxUsernameLength
    )
    .trim();
}

export function extractUsernameFromPath(
  AppCore,
  path = "/"
) {
  const pathname =
    stripSearchAndHash(
      normalizePath(
        AppCore,
        path
      )
    );

  const match =
    pathname.match(
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
  const fromState =
    sanitizeUsername(
      AppCore,
      AppCore?.state
        ?.currentResolvedUsername ||
        AppCore?.state
          ?.resolvedUsername ||
        ""
    );

  if (fromState) {
    return fromState;
  }

  if (isBrowser()) {
    const fromUrl =
      extractUsernameFromPath(
        AppCore,
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      );

    if (fromUrl) {
      return fromUrl;
    }
  }

  return (
    getCurrentUsername(
      AppCore
    ) || null
  );
}

/* =========================================================
   CANONICAL
========================================================= */

export function stripUsernamePrefix(
  AppCore,
  path = "/"
) {
  const normalized =
    normalizePath(
      AppCore,
      path
    );

  const pathname =
    stripSearchAndHash(
      normalized
    );

  const suffix =
    getSearchAndHash(
      normalized
    );

  const clean =
    pathname.replace(
      /^\/@[^/]+(?=\/|$)/i,
      ""
    ) || "/";

  return normalizePath(
    AppCore,
    `${clean}${suffix}`
  );
}

export function normalizeCanonicalPath(
  AppCore,
  path = "/"
) {
  const stripped =
    stripUsernamePrefix(
      AppCore,
      path
    );

  const pathname =
    stripSearchAndHash(
      stripped
    );

  const suffix =
    getSearchAndHash(
      stripped
    );

  return `${normalizePathnameOnly(
    pathname
  )}${suffix}`;
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
   CURRENT PATHS
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
    return normalizePath(
      AppCore,
      AppCore?.state
        ?.publicPath ||
        AppCore?.state?.route ||
        "/"
    );
  }

  return normalizePath(
    AppCore,
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

export function getCurrentCanonicalPath(
  AppCore
) {
  return normalizeCanonicalPath(
    AppCore,
    getCurrentPath(
      AppCore
    )
  );
}

export function getCurrentPublicPath(
  AppCore
) {
  const fromState =
    normalizePath(
      AppCore,
      AppCore?.state
        ?.publicPath || ""
    );

  if (
    fromState &&
    fromState !== "/"
  ) {
    return fromState;
  }

  return getCurrentPath(
    AppCore
  );
}

export function getResolvedPublicPath(
  fallback = "/"
) {
  if (!isBrowser()) {
    return fallback;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
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
  return String(href || "")
    .trim()
    .startsWith("#");
}

export function isSlugCandidatePath(
  AppCore,
  pathname = "/"
) {
  return /^\/@[^/]+(?:\/|$)/i.test(
    stripSearchAndHash(
      normalizePath(
        AppCore,
        pathname
      )
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
    raw.startsWith("/")
  ) {
    return normalizePath(
      AppCore,
      raw
    );
  }

  try {
    const base =
      isBrowser()
        ? window.location.href
        : "http://localhost/";

    const url =
      new URL(raw, base);

    return normalizePath(
      AppCore,
      `${url.pathname}${url.search}${url.hash}`
    );
  } catch {
    return routeNames.HOME;
  }
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

  const clean =
    stripSearchAndHash(
      canonical
    );

  const suffix =
    getSearchAndHash(
      canonical
    );

  const route =
    getRoute?.(clean);

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
    clean === routeNames.HOME
  ) {
    return `/@${username}${suffix}`;
  }

  return `/@${username}${clean}${suffix}`;
}

export function getRedirectPath(
  AppCore
) {
  const routeNames =
    getRouteNames(
      AppCore
    );

  const redirect =
    getCurrentUrl()
      .searchParams
      .get("redirect");

  if (!redirect) {
    return null;
  }

  const resolved =
    resolveSpaHref(
      AppCore,
      redirect
    );

  if (
    isUnsafeHref(
      resolved
    ) ||
    isExternalHref(
      resolved
    )
  ) {
    return null;
  }

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      resolved
    );

  if (
    stripSearchAndHash(
      canonical
    ) === routeNames.LOGIN
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

  const login =
    normalizePath(
      AppCore,
      routeNames.LOGIN
    );

  if (!redirectPath) {
    return login;
  }

  const redirect =
    normalizeCanonicalPath(
      AppCore,
      redirectPath
    );

  if (
    stripSearchAndHash(
      redirect
    ) ===
    stripSearchAndHash(
      login
    )
  ) {
    return login;
  }

  const url = new URL(
    `http://localhost${login}`
  );

  url.searchParams.set(
    "redirect",
    redirect
  );

  return `${url.pathname}${url.search}`;
}

export function buildHistoryUrl(
  AppCore,
  getRoute,
  pathname = "/",
  options = {}
) {
  const resolved =
    resolveSpaHref(
      AppCore,
      pathname
    );

  if (
    options.preservePath
  ) {
    return normalizePath(
      AppCore,
      resolved
    );
  }

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      resolved
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
      fromPath: resolved,
    }
  );
}

export function buildStatePayload(
  AppCore,
  pathname = "/",
  extras = {}
) {
  const publicPath =
    normalizePath(
      AppCore,
      pathname
    );

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      publicPath
    );

  const username =
    extractUsernameFromPath(
      AppCore,
      publicPath
    ) ||
    getCurrentResolvedUsername(
      AppCore
    ) ||
    null;

  return {
    path: publicPath,
    publicPath,
    canonicalPath:
      canonical,
    searchAndHash:
      getSearchAndHash(
        publicPath
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
