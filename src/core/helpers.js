/* =========================================================
   Onion SPA - Core Helpers
   Archivo: src/core/helpers.js

   Responsabilidades:
   - utilidades base del core
   - normalización de paths, usernames y usuarios
   - helpers de clonación / parse seguro
   - helpers de URL / headers / abort / timeout
   - diagnóstico de red
   - soporte robusto de avatar backend /me
========================================================= */

import { config } from "./config.js";

/* =========================================================
   BASE
========================================================= */
export function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

export function isDocumentReady() {
  return (
    isBrowser() &&
    document.readyState !== "loading"
  );
}

export function now() {
  return Date.now();
}

export function isPlainObject(
  value
) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function isDomScope(
  scope
) {
  if (!isBrowser()) return false;
  if (!scope) return false;

  return (
    scope === document ||
    scope === window ||
    scope instanceof Element ||
    scope instanceof Document ||
    scope instanceof DocumentFragment
  );
}

export function normalizeListenerOptions(
  options
) {
  if (
    typeof options === "boolean"
  ) {
    return {
      capture: options,
    };
  }

  if (
    isPlainObject(options)
  ) {
    return { ...options };
  }

  return {
    capture: false,
  };
}

/* =========================================================
   SAFE HELPERS
========================================================= */
export function buildStorageKey(
  key
) {
  return `${config.storagePrefix}:${key}`;
}

export function safeParse(
  value,
  fallback = null
) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function safeClone(
  value,
  fallback = null
) {
  if (value === undefined) {
    return fallback;
  }

  try {
    if (
      typeof structuredClone ===
      "function"
    ) {
      return structuredClone(
        value
      );
    }
  } catch {
    /* noop */
  }

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
}

export function cloneError(
  error = null
) {
  if (!error) return null;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack:
        error.stack || null,
    };
  }

  if (
    typeof error === "object"
  ) {
    return safeClone(error, {
      message:
        String(error),
    });
  }

  return {
    message:
      String(error),
  };
}

/* =========================================================
   USER / SLUG / PATH
========================================================= */
export function sanitizeUsername(
  value = ""
) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(
      /[^a-zA-Z0-9._-]/g,
      ""
    )
    .toLowerCase();
}

export function slugify(
  value = ""
) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9._-]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

export function normalizeApiBase(
  base = ""
) {
  return String(base || "")
    .trim()
    .replace(/\/+$/, "");
}

export function normalizePath(
  path = "/"
) {
  if (
    path === null ||
    path === undefined
  ) {
    return "/";
  }

  let raw = String(path).trim();

  if (!raw) return "/";
  if (raw.startsWith("#"))
    return "/";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);

      raw =
        `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return "/";
    }
  }

  raw = raw.replace(
    /^[.][/]+/,
    "/"
  );

  if (!raw.startsWith("/")) {
    raw = `/${raw}`;
  }

  raw = raw.replace(
    /\/{2,}/g,
    "/"
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

  const pathname =
    cutIndex >= 0
      ? raw.slice(0, cutIndex)
      : raw;

  const suffix =
    cutIndex >= 0
      ? raw.slice(cutIndex)
      : "";

  let cleanPathname =
    pathname || "/";

  if (
    cleanPathname.length > 1
  ) {
    cleanPathname =
      cleanPathname.replace(
        /\/+$/,
        ""
      );
  }

  cleanPathname =
    cleanPathname || "/";

  return `${cleanPathname}${suffix}`;
}

export function stripUsernamePrefix(
  path = "/"
) {
  const normalized =
    normalizePath(path);

  const match =
    normalized.match(
      /^([^?#]*)(.*)$/
    );

  const pathOnly =
    match?.[1] || "/";

  const suffix =
    match?.[2] || "";

  const stripped =
    pathOnly.replace(
      /^\/@[^/]+(?=\/|$)/i,
      ""
    ) || "/";

  return normalizePath(
    `${stripped}${suffix}`
  );
}

export function normalizeCanonicalPath(
  path = "/"
) {
  const normalized =
    normalizePath(path);

  const noSlug =
    stripUsernamePrefix(
      normalized
    );

  const [pathOnly] =
    noSlug.split(/[?#]/);

  return normalizePath(
    pathOnly || "/"
  );
}

/* =========================================================
   URL / REQUEST
========================================================= */
export function joinUrl(
  base,
  path = ""
) {
  const cleanBase =
    normalizeApiBase(base);

  const cleanPath =
    String(path || "").replace(
      /^\/+/,
      ""
    );

  return cleanPath
    ? `${cleanBase}/${cleanPath}`
    : cleanBase;
}

export function buildUrl(
  path,
  query = null
) {
  const rawPath =
    String(path || "").trim();

  const apiBase =
    normalizeApiBase(
      config.apiBase
    );

  const baseUrl =
    /^https?:\/\//i.test(
      rawPath
    )
      ? rawPath
      : joinUrl(
          apiBase,
          rawPath
        );

  if (
    !query ||
    !isPlainObject(query) ||
    Object.keys(query)
      .length === 0
  ) {
    return baseUrl;
  }

  const origin =
    isBrowser()
      ? window.location.origin
      : "http://localhost";

  const url = new URL(
    baseUrl,
    origin
  );

  Object.entries(query).forEach(
    ([key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return;
      }

      if (
        Array.isArray(value)
      ) {
        value.forEach(
          (item) => {
            if (
              item !== undefined &&
              item !== null &&
              item !== ""
            ) {
              url.searchParams.append(
                key,
                String(item)
              );
            }
          }
        );

        return;
      }

      url.searchParams.set(
        key,
        String(value)
      );
    }
  );

  return url.toString();
}

export function hasValidToken(
  token = null
) {
  return Boolean(
    token &&
      String(token).trim()
  );
}

export function isPublicApiPath(
  path = ""
) {
  const normalized =
    normalizeCanonicalPath(
      path
    );

  return config.auth.publicApiPaths.some(
    (publicPath) =>
      normalizeCanonicalPath(
        publicPath
      ) === normalized
  );
}

/* =========================================================
   USER NORMALIZATION
========================================================= */
export function normalizeUser(
  user = null
) {
  if (
    !user ||
    typeof user !== "object"
  ) {
    return null;
  }

  const username =
    sanitizeUsername(
      user.username ||
        user.userName ||
        user.nick ||
        user.alias ||
        user.login ||
        user.slug ||
        ""
    );

  const name =
    user.name ||
    user.nombre ||
    user.full_name ||
    user.fullName ||
    user.display_name ||
    user.displayName ||
    user.username ||
    user.email ||
    "Usuario";

  const role =
    user.role ||
    user.rol ||
    user.type ||
    user.user_type ||
    user.userType ||
    null;

  const slug =
    user.slug ||
    slugify(
      username ||
        name ||
        "usuario"
    );

  const hasAvatar =
    user.hasAvatar ??
    user.has_avatar ??
    user.avatarEnabled ??
    user.avatar_enabled;

  const avatar =
    String(
      user.avatar ||
        user.avatarUrl ||
        user.avatar_url ||
        user.photo ||
        user.photoUrl ||
        user.image ||
        user.imageUrl ||
        user.profileImage ||
        user.picture ||
        user.pictureUrl ||
        ""
    ).trim();

  return {
    ...user,

    id:
      user.id ??
      user.userId ??
      user.user_id ??
      user.uuid ??
      user._id ??
      null,

    userId:
      user.userId ??
      user.id ??
      user.user_id ??
      user.uuid ??
      user._id ??
      null,

    username,
    slug,
    name,

    email:
      user.email ||
      user.mail ||
      "",

    role,

    avatar:
      hasAvatar === false
        ? null
        : avatar || null,

    hasAvatar:
      hasAvatar === undefined
        ? Boolean(avatar)
        : Boolean(hasAvatar),

    avatarUpdatedAt:
      user.avatarUpdatedAt ??
      user.avatar_updated_at ??
      null,

    active:
      user.active ??
      user.is_active ??
      user.isActive ??
      true,
  };
}

export function getUserDisplayName(
  user = null
) {
  return (
    user?.name ||
    user?.nombre ||
    user?.username ||
    user?.email ||
    "Usuario"
  );
}

export function getUserUsername(
  user = null
) {
  return sanitizeUsername(
    user?.username ||
      user?.userName ||
      user?.nick ||
      user?.alias ||
      user?.login ||
      ""
  );
}

export function getUserAvatarUrl(
  user = null
) {
  const hasAvatar =
    user?.hasAvatar ??
    user?.has_avatar;

  const url = String(
    user?.avatar ||
      user?.avatarUrl ||
      user?.avatar_url ||
      user?.photo ||
      user?.image ||
      user?.profileImage ||
      user?.picture ||
      ""
  ).trim();

  if (
    hasAvatar === false
  ) {
    return "";
  }

  return url;
}

export function getInitials(
  value = ""
) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part[0]
          ?.toUpperCase() ||
        ""
    )
    .join("")
    .slice(0, 2);
}

export function getCurrentLocationPath() {
  if (!isBrowser())
    return "/";

  return normalizePath(
    `${window.location.pathname || "/"}${window.location.search || ""}`
  );
}

export function getCurrentLocationCanonicalPath() {
  if (!isBrowser())
    return "/";

  return normalizeCanonicalPath(
    `${window.location.pathname || "/"}${window.location.search || ""}`
  );
}

export async function runHookSeries(
  hooks = [],
  payload
) {
  let current = payload;

  for (const hook of hooks) {
    try {
      const result =
        await hook(current);

      if (
        result !== undefined
      ) {
        current = result;
      }
    } catch (error) {
      if (config.debug) {
        console.error(
          `[${config.appName}] Error ejecutando hook`,
          error
        );
      }
    }
  }

  return current;
}

export function getThemeColor(
  theme =
    config.defaultTheme
) {
  return theme === "light"
    ? config.ui
        .themeColorLight
    : config.ui
        .themeColorDark;
}

/* =========================================================
   ABORT / HEADERS / NETWORK
========================================================= */
export function createAbortTimeout(
  ms =
    config.requestTimeout
) {
  const controller =
    new AbortController();

  const normalizedMs =
    Number(ms);

  if (
    !Number.isFinite(
      normalizedMs
    ) ||
    normalizedMs <= 0
  ) {
    return {
      controller,
      timeoutId: null,
    };
  }

  const timeoutId =
    setTimeout(() => {
      try {
        controller.abort(
          "timeout"
        );
      } catch {
        controller.abort();
      }
    }, normalizedMs);

  return {
    controller,
    timeoutId,
  };
}

export function normalizeHeaders(
  headers = {}
) {
  return Object.entries(
    headers || {}
  ).reduce(
    (acc, [key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        acc[key] = value;
      }

      return acc;
    },
    {}
  );
}

export function mergeAbortSignals(
  signals = []
) {
  const validSignals =
    signals.filter(Boolean);

  if (
    !validSignals.length
  ) {
    return null;
  }

  if (
    validSignals.length === 1
  ) {
    return validSignals[0];
  }

  const controller =
    new AbortController();

  function abortFrom(
    sourceSignal
  ) {
    if (
      controller.signal
        .aborted
    ) {
      return;
    }

    try {
      controller.abort(
        sourceSignal?.reason ||
          "aborted"
      );
    } catch {
      controller.abort();
    }
  }

  validSignals.forEach(
    (signal) => {
      if (
        signal.aborted
      ) {
        abortFrom(signal);
        return;
      }

      signal.addEventListener(
        "abort",
        () => {
          abortFrom(signal);
        },
        { once: true }
      );
    }
  );

  return controller.signal;
}

export function isAbortError(
  error
) {
  return (
    error?.name ===
      "AbortError" ||
    error?.code === 20 ||
    String(
      error?.message ||
        ""
    )
      .toLowerCase()
      .includes(
        "aborted"
      )
  );
}

export function isProbablyTimeoutError(
  error
) {
  const message =
    String(
      error?.message ||
        ""
    ).toLowerCase();

  const raw = String(
    error?.raw || ""
  ).toLowerCase();

  return (
    message.includes(
      "timeout"
    ) ||
    raw.includes(
      "timeout"
    ) ||
    error?.timeout === true
  );
}

export function detectNetworkHints(
  url = ""
) {
  const hints = [];

  if (!isBrowser()) {
    return hints;
  }

  if (
    navigator.onLine ===
    false
  ) {
    hints.push(
      "El navegador parece estar offline."
    );
  }

  if (
    /^https:\/\//i.test(
      url
    ) &&
    window.location
      .protocol ===
      "http:"
  ) {
    hints.push(
      "Hay mezcla de protocolos: frontend en HTTP y API en HTTPS."
    );
  }

  if (
    /^http:\/\//i.test(
      url
    ) &&
    window.location
      .protocol ===
      "https:"
  ) {
    hints.push(
      "Hay mezcla de protocolos: frontend en HTTPS y API en HTTP."
    );
  }

  const apiOrigin =
    (() => {
      try {
        return new URL(
          url
        ).origin;
      } catch {
        return null;
      }
    })();

  if (
    apiOrigin &&
    apiOrigin !==
      window.location
        .origin
  ) {
    hints.push(
      "Petición cross-origin: revisa CORS y preflight OPTIONS."
    );
  }

  return hints;
}
