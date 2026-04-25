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
   - no destruir tokens públicos en rutas tipo /activate-account?token=...

   HARDENING EXTREMO 10/10:
   - canonical determinista sin query/hash
   - publicPath preserva query/hash
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

const PUBLIC_AUTH_PATHS = new Set([
  "/login",
  "/activate-account",
  "/reset-password",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
]);

/* =========================================================
   ROUTE NAMES
========================================================= */

export function getRouteNames(AppCore) {
  return {
    HOME:
      AppCore?.config?.routes?.home ||
      "/",

    LOGIN:
      AppCore?.config?.routes?.login ||
      "/login",

    SERVER:
      AppCore?.config?.routes?.server ||
      "/servidor",

    USERS:
      AppCore?.config?.routes?.users ||
      "/usuarios",
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

function safeText(
  value = "",
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
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

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizeSearch(
  search = ""
) {
  const value =
    String(search || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(
  hash = ""
) {
  const value =
    String(hash || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitRawPath(
  path = "/"
) {
  const raw =
    normalizeRouteInput(path);

  if (!raw) {
    return {
      pathname: "/",
      search: "",
      hash: "",
    };
  }

  try {
    if (
      /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ) {
      const url = new URL(
        raw,
        getBaseOrigin()
      );

      return {
        pathname:
          url.pathname || "/",
        search:
          url.search || "",
        hash:
          url.hash || "",
      };
    }
  } catch {}

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
    search:
      normalizeSearch(search),
    hash:
      normalizeHash(hash),
  };
}

function normalizePathnameOnly(
  pathname = "/"
) {
  let value = String(
    pathname || "/"
  )
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

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

function normalizePathnameWithCore(
  AppCore,
  pathname = "/"
) {
  let normalized =
    normalizePathnameOnly(
      pathname
    );

  try {
    if (
      AppCore?.utils?.normalizePath
    ) {
      const delegated =
        AppCore.utils.normalizePath(
          normalized
        );

      if (delegated) {
        const parts =
          splitRawPath(delegated);

        normalized =
          normalizePathnameOnly(
            parts.pathname || "/"
          );
      }
    }
  } catch {}

  return normalized;
}

/**
 * Normaliza una URL interna conservando query/hash.
 *
 * IMPORTANTE:
 * - NO delega la URL completa a AppCore.utils.normalizePath
 * - delega solo el pathname
 * - así evita que helpers externos borren ?token=...
 */
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

  const {
    pathname,
    search,
    hash,
  } = splitRawPath(raw);

  const cleanPathname =
    normalizePathnameWithCore(
      AppCore,
      pathname
    );

  return `${cleanPathname}${search}${hash}`;
}

export function stripSearchAndHash(
  path = "/"
) {
  const parts =
    splitRawPath(
      normalizePath(
        null,
        path
      )
    );

  return normalizePathnameOnly(
    parts.pathname || "/"
  );
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

/**
 * Quita /@username conservando query/hash.
 *
 * Ejemplo:
 *   /@pepe/facturas?page=2
 *   -> /facturas?page=2
 */
export function stripUsernamePrefix(
  AppCore,
  path = "/"
) {
  const normalized =
    normalizePath(
      AppCore,
      path
    );

  const parts =
    splitRawPath(normalized);

  const clean =
    normalizePathnameOnly(
      parts.pathname || "/"
    ).replace(
      /^\/@[^/]+(?=\/|$)/i,
      ""
    ) || "/";

  return normalizePath(
    AppCore,
    `${clean}${parts.search}${parts.hash}`
  );
}

/**
 * Ruta canónica interna.
 *
 * IMPORTANTE:
 * - NO devuelve query
 * - NO devuelve hash
 * - NO devuelve /@username
 *
 * Ejemplo:
 *   /@pepe/activate-account?token=abc
 *   -> /activate-account
 */
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

  return normalizePathnameOnly(
    pathname
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

/**
 * URL pública real actual.
 *
 * Esta función usa el navegador como fuente de verdad.
 * Así no se pierde:
 *   /activate-account?token=xxx
 */
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

/**
 * Ruta canónica actual.
 *
 * Ejemplo:
 *   /activate-account?token=xxx
 *   -> /activate-account
 */
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

/**
 * Public path actual.
 *
 * Prioridad:
 * 1. navegador real
 * 2. estado de app
 *
 * Esto evita que AppCore.state.publicPath antiguo borre query/hash.
 */
export function getCurrentPublicPath(
  AppCore
) {
  if (isBrowser()) {
    return getCurrentPath(
      AppCore
    );
  }

  return normalizePath(
    AppCore,
    AppCore?.state
      ?.publicPath ||
      AppCore?.state?.route ||
      "/"
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

  const routePath =
    stripSearchAndHash(
      normalizePath(
        null,
        route.path || "/"
      )
    );

  if (
    routePath === routeNames.LOGIN
  ) {
    return false;
  }

  if (
    PUBLIC_AUTH_PATHS.has(
      routePath
    )
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
    isHashOnlyHref(raw)
  ) {
    return raw;
  }

  if (
    /^https?:\/\//i.test(raw)
  ) {
    try {
      const url =
        new URL(
          raw,
          getBaseOrigin()
        );

      const currentOrigin =
        getBaseOrigin();

      if (
        url.origin === currentOrigin
      ) {
        return normalizePath(
          AppCore,
          `${url.pathname}${url.search}${url.hash}`
        );
      }

      return raw;
    } catch {
      return routeNames.HOME;
    }
  }

  if (
    isExternalHref(raw)
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

/**
 * Construye URL pública visible.
 *
 * Entrada:
 *   /activate-account?token=abc
 *
 * Salida si no hay slug:
 *   /activate-account?token=abc
 *
 * Salida con slug permitido:
 *   /@user/facturas?page=2
 */
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

  const source =
    normalizePath(
      AppCore,
      canonicalPath
    );

  const clean =
    normalizeCanonicalPath(
      AppCore,
      source
    );

  const suffix =
    getSearchAndHash(
      source
    );

  const route =
    getRoute?.(clean);

  const publicWithoutSlug =
    normalizePath(
      AppCore,
      `${clean}${suffix}`
    );

  if (!route) {
    return publicWithoutSlug;
  }

  if (
    !canUsePublicSlugForRoute(
      route,
      routeNames
    )
  ) {
    return publicWithoutSlug;
  }

  const username =
    sanitizeUsername(
      AppCore,
      options.username ||
        options.resolvedUsername ||
        extractUsernameFromPath(
          AppCore,
          options.fromPath || ""
        ) ||
        getCurrentResolvedUsername(
          AppCore
        ) ||
        getCurrentUsername(
          AppCore
        )
    );

  if (!username) {
    return publicWithoutSlug;
  }

  if (
    clean === routeNames.HOME
  ) {
    return normalizePath(
      AppCore,
      `/@${username}${suffix}`
    );
  }

  return normalizePath(
    AppCore,
    `/@${username}${clean}${suffix}`
  );
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
    isUnsafeHref(resolved) ||
    isExternalHref(resolved)
  ) {
    return null;
  }

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      resolved
    );

  if (
    canonical ===
    normalizeCanonicalPath(
      AppCore,
      routeNames.LOGIN
    )
  ) {
    return null;
  }

  return stripUsernamePrefix(
    AppCore,
    resolved
  );
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

  const resolvedRedirect =
    stripUsernamePrefix(
      AppCore,
      resolveSpaHref(
        AppCore,
        redirectPath
      )
    );

  if (
    isUnsafeHref(
      resolvedRedirect
    ) ||
    isExternalHref(
      resolvedRedirect
    )
  ) {
    return login;
  }

  if (
    normalizeCanonicalPath(
      AppCore,
      resolvedRedirect
    ) ===
    normalizeCanonicalPath(
      AppCore,
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
    resolvedRedirect
  );

  return `${url.pathname}${url.search}`;
}

/**
 * URL que debe escribirse en history.
 *
 * Esta función es crítica:
 * NO debe convertir:
 *   /activate-account?token=abc
 * en:
 *   /activate-account
 */
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

  const resolved =
    resolveSpaHref(
      AppCore,
      pathname
    );

  if (
    isUnsafeHref(resolved) ||
    isExternalHref(resolved)
  ) {
    return routeNames.HOME;
  }

  if (
    options.preservePath
  ) {
    return normalizePath(
      AppCore,
      resolved
    );
  }

  return buildPublicPath(
    AppCore,
    getRoute,
    resolved,
    {
      username:
        options.username,
      resolvedUsername:
        options.resolvedUsername,
      fromPath:
        resolved,
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
    path:
      publicPath,
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
