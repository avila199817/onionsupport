/* =========================================================
   Onion SPA - Core Helpers
   Archivo: src/core/helpers.js

   RESPONSABILIDADES:
   - utilidades base del core
   - normalización de paths, usernames y usuarios
   - helpers de clonación / parse seguro
   - helpers de URL / headers / abort / timeout
   - diagnóstico de red
   - soporte robusto de avatar backend /me
   - redacción segura de tokens para logs/snapshots
   - soporte hash-router y hashbang

   HARDENING PRO:
   - sanitize estricto de username
   - paths robustos con query/hash
   - canonical consistente SIN query/hash
   - public path consistente CON query/hash
   - helpers seguros ante inputs raros
   - preserve contexto público/canónico
   - server/browser safe
   - cero throws accidentales
========================================================= */

import { config } from "./config.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ROUTE =
  "/";

const LOCAL_ORIGIN =
  "http://localhost";

const TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
  ]);

const TECHNICAL_TOKEN_PATHS =
  Object.freeze([
    "/activate-account",
    "/reset-password/confirm",
  ]);

const SAFE_USERNAME_MAX =
  64;

const SAFE_SLUG_MAX =
  96;

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

export function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function isFunction(value) {
  return typeof value === "function";
}

export function safeText(value, fallback = "") {
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

export function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

export function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === "true") return true;
  if (value === "false") return false;

  return Boolean(fallback);
}

export function isDomScope(scope) {
  if (!isBrowser() || !scope) {
    return false;
  }

  try {
    return (
      scope === document ||
      scope === window ||
      scope instanceof Element ||
      scope instanceof Document ||
      scope instanceof DocumentFragment
    );
  } catch {
    return false;
  }
}

export function normalizeListenerOptions(options = false) {
  if (typeof options === "boolean") {
    return {
      capture:
        options,
    };
  }

  if (isPlainObject(options)) {
    return {
      ...options,
    };
  }

  return {
    capture:
      false,
  };
}

/* =========================================================
   SAFE HELPERS
========================================================= */

export function buildStorageKey(key = "") {
  const cleanKey =
    safeText(key, "");

  const prefix =
    safeText(
      config?.storagePrefix,
      "onion"
    );

  return cleanKey
    ? `${prefix}:${cleanKey}`
    : prefix;
}

export function safeParse(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  const raw =
    String(value).trim();

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function safeStringify(value, fallback = "") {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export function safeClone(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
}

export function cloneError(error = null) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name:
        error.name || "Error",

      message:
        error.message || "",

      stack:
        error.stack || null,

      code:
        error.code || null,

      status:
        error.status || error.statusCode || null,

      data:
        safeClone(error.data, null),
    };
  }

  if (typeof error === "object") {
    return safeClone(error, {
      message:
        String(error),
    });
  }

  return {
    name:
      "Error",

    message:
      String(error),
  };
}

/* =========================================================
   TOKEN REDACTION
========================================================= */

export function redactTokenInText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${name}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const path of TECHNICAL_TOKEN_PATHS) {
    try {
      const escapedPath =
        path.replace(/\//g, "\\/");

      output = output.replace(
        new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
        "$1/***"
      );
    } catch {}
  }

  try {
    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

/* =========================================================
   PATH PARTS
========================================================= */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return LOCAL_ORIGIN;
}

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function normalizeSearch(search = "") {
  const raw =
    safeText(search, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw =
    safeText(hash, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("#")
    ? raw
    : `#${raw.replace(/^#+/, "")}`;
}

function splitPathParts(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE) ||
    DEFAULT_ROUTE;

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) ||
      DEFAULT_ROUTE;
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) ||
      DEFAULT_ROUTE;
  }

  return {
    pathname,
    search:
      normalizeSearch(search),
    hash:
      normalizeHash(hash),
    suffix:
      `${normalizeSearch(search)}${normalizeHash(hash)}`,
  };
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return (
    splitPathParts(path).pathname ||
    DEFAULT_ROUTE
  );
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  const parts =
    splitPathParts(path);

  return `${parts.search}${parts.hash}`;
}

/* =========================================================
   USER / SLUG / PATH
========================================================= */

export function sanitizeUsername(value = "") {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .toLowerCase()
    .slice(0, SAFE_USERNAME_MAX);
}

export function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, SAFE_SLUG_MAX);
}

export function normalizeApiBase(base = "") {
  return String(base || "")
    .trim()
    .replace(/\/+$/, "");
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value =
    String(pathname || DEFAULT_ROUTE)
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const segments =
    value.split("/");

  const normalizedSegments =
    [];

  for (const segment of segments) {
    if (
      !segment ||
      segment === "."
    ) {
      continue;
    }

    if (segment === "..") {
      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  value =
    `/${normalizedSegments.join("/")}` ||
    DEFAULT_ROUTE;

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      DEFAULT_ROUTE;
  }

  return value;
}

export function normalizePath(path = DEFAULT_ROUTE) {
  if (
    path === null ||
    path === undefined
  ) {
    return DEFAULT_ROUTE;
  }

  let raw =
    String(path).trim();

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (isHashRouterPath(raw)) {
    return normalizePath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const url =
        new URL(raw, getBaseOrigin());

      if (
        url.hash &&
        isHashRouterPath(url.hash)
      ) {
        return normalizePath(
          normalizeHashRouterPath(url.hash)
        );
      }

      raw =
        `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return DEFAULT_ROUTE;
  }

  raw =
    raw.replace(/^[.][/]+/, "/");

  const {
    pathname,
    search,
    hash,
  } = splitPathParts(raw);

  const cleanPathname =
    normalizePathnameOnly(pathname);

  return `${cleanPathname}${search}${hash}`;
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const normalized =
    normalizePath(path);

  const pathOnly =
    stripSearchAndHash(normalized);

  const suffix =
    getSearchAndHash(normalized);

  const stripped =
    pathOnly.replace(
      /^\/@[^/]+(?=\/|$)/i,
      ""
    ) || DEFAULT_ROUTE;

  return normalizePath(
    `${stripped}${suffix}`
  );
}

/*
  Canonical interno:
  - sin /@username
  - sin query
  - sin hash
*/
export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const normalized =
    normalizePath(path);

  const noSlug =
    stripUsernamePrefix(normalized);

  const pathOnly =
    stripSearchAndHash(noSlug);

  return normalizePathnameOnly(
    pathOnly || DEFAULT_ROUTE
  );
}

/*
  Public path:
  - sin /@username
  - preserva query/hash
*/
export function normalizePublicPath(path = DEFAULT_ROUTE) {
  return stripUsernamePrefix(
    normalizePath(path)
  );
}

/* =========================================================
   URL / REQUEST
========================================================= */

export function joinUrl(base = "", path = "") {
  const cleanBase =
    normalizeApiBase(base);

  const cleanPath =
    String(path || "")
      .trim()
      .replace(/^\/+/, "");

  if (!cleanPath) {
    return cleanBase;
  }

  if (!cleanBase) {
    return `/${cleanPath}`;
  }

  return `${cleanBase}/${cleanPath}`;
}

export function buildUrl(path = "", query = null) {
  const rawPath =
    String(path || "").trim();

  const apiBase =
    normalizeApiBase(
      config?.apiBase || ""
    );

  const baseUrl =
    /^[a-z][a-z\d+.-]*:\/\//i.test(rawPath)
      ? rawPath
      : joinUrl(
          apiBase,
          rawPath
        );

  if (!query) {
    return baseUrl;
  }

  const origin =
    getBaseOrigin();

  let url;

  try {
    url =
      new URL(
        baseUrl,
        origin
      );
  } catch {
    return baseUrl;
  }

  const queryEntries =
    query instanceof URLSearchParams
      ? Array.from(query.entries())
      : Array.isArray(query)
        ? query
        : isPlainObject(query)
          ? Object.entries(query)
          : [];

  if (!queryEntries.length) {
    return baseUrl;
  }

  for (const [key, value] of queryEntries) {
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      continue;
    }

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (
          item !== undefined &&
          item !== null &&
          item !== ""
        ) {
          url.searchParams.append(
            cleanKey,
            String(item)
          );
        }
      }

      continue;
    }

    if (value instanceof Date) {
      url.searchParams.set(
        cleanKey,
        value.toISOString()
      );

      continue;
    }

    if (typeof value === "object") {
      url.searchParams.set(
        cleanKey,
        JSON.stringify(value)
      );

      continue;
    }

    url.searchParams.set(
      cleanKey,
      String(value)
    );
  }

  return url.toString();
}

export function hasValidToken(token = null) {
  const value =
    safeText(token, "");

  if (!value) {
    return false;
  }

  if (
    value === "null" ||
    value === "undefined" ||
    value === "false"
  ) {
    return false;
  }

  return true;
}

export function isPublicApiPath(path = "") {
  const normalized =
    stripSearchAndHash(
      normalizeCanonicalPath(path)
    );

  const list =
    config?.auth?.publicApiPaths || [];

  return list.some((publicPath) => {
    const current =
      stripSearchAndHash(
        normalizeCanonicalPath(publicPath)
      );

    return (
      normalized === current ||
      normalized.startsWith(`${current}/`)
    );
  });
}

/* =========================================================
   USER NORMALIZATION
========================================================= */

function firstNonEmpty(...values) {
  for (const value of values) {
    const text =
      safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase();
}

export function normalizeUser(user = null) {
  if (
    !user ||
    typeof user !== "object"
  ) {
    return null;
  }

  const id =
    user.id ??
    user.userId ??
    user.user_id ??
    user.uuid ??
    user._id ??
    null;

  const rawName =
    firstNonEmpty(
      user.name,
      user.nombre,
      user.full_name,
      user.fullName,
      user.display_name,
      user.displayName,
      user.username,
      user.email,
      "Usuario"
    );

  const username =
    sanitizeUsername(
      firstNonEmpty(
        user.username,
        user.userName,
        user.nick,
        user.alias,
        user.login,
        user.slug,
        user.email
      )
    );

  const slug =
    sanitizeUsername(
      firstNonEmpty(
        user.slug,
        username,
        slugify(rawName || "usuario")
      )
    );

  const role =
    normalizeRole(
      firstNonEmpty(
        user.role,
        user.rol,
        user.type,
        user.user_type,
        user.userType
      )
    );

  const hasAvatar =
    user.hasAvatar ??
    user.has_avatar ??
    user.avatarEnabled ??
    user.avatar_enabled;

  const avatar =
    firstNonEmpty(
      user.avatar,
      user.avatarUrl,
      user.avatar_url,
      user.photo,
      user.photoUrl,
      user.photo_url,
      user.image,
      user.imageUrl,
      user.image_url,
      user.profileImage,
      user.profile_image,
      user.picture,
      user.pictureUrl,
      user.picture_url
    );

  return {
    ...user,

    id,

    userId:
      user.userId ??
      id,

    username,
    slug,

    name:
      rawName,

    displayName:
      firstNonEmpty(
        user.displayName,
        user.display_name,
        rawName
      ),

    email:
      firstNonEmpty(
        user.email,
        user.mail
      ),

    role,

    avatar:
      hasAvatar === false
        ? null
        : avatar || null,

    avatarUrl:
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

export function getUserDisplayName(user = null) {
  return firstNonEmpty(
    user?.displayName,
    user?.display_name,
    user?.name,
    user?.nombre,
    user?.username,
    user?.email,
    "Usuario"
  );
}

export function getUserUsername(user = null) {
  return sanitizeUsername(
    firstNonEmpty(
      user?.username,
      user?.userName,
      user?.nick,
      user?.alias,
      user?.login,
      user?.slug,
      user?.email
    )
  );
}

export function getUserAvatarUrl(user = null) {
  const hasAvatar =
    user?.hasAvatar ??
    user?.has_avatar;

  if (hasAvatar === false) {
    return "";
  }

  return firstNonEmpty(
    user?.avatarUrl,
    user?.avatar_url,
    user?.avatar,
    user?.photo,
    user?.photoUrl,
    user?.photo_url,
    user?.image,
    user?.imageUrl,
    user?.image_url,
    user?.profileImage,
    user?.profile_image,
    user?.picture,
    user?.pictureUrl,
    user?.picture_url
  );
}

export function getInitials(value = "") {
  const text =
    safeText(value, "");

  if (!text) {
    return "";
  }

  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part[0]?.toUpperCase() || ""
    )
    .join("")
    .slice(0, 2);
}

/* =========================================================
   LOCATION
========================================================= */

export function getCurrentLocationPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  return normalizePath(
    `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${window.location.hash || ""}`
  );
}

export function getCurrentLocationCanonicalPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  return normalizeCanonicalPath(
    `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${window.location.hash || ""}`
  );
}

/* =========================================================
   HOOKS / THEME
========================================================= */

export async function runHookSeries(hooks = [], payload) {
  let current =
    payload;

  for (const hook of hooks) {
    if (typeof hook !== "function") {
      continue;
    }

    try {
      const result =
        await hook(current);

      if (result !== undefined) {
        current =
          result;
      }
    } catch (error) {
      if (config?.debug) {
        try {
          console.error(
            `[${config?.appName || "Onion"}] Error ejecutando hook`,
            error
          );
        } catch {}
      }
    }
  }

  return current;
}

export function getThemeColor(theme = config?.defaultTheme) {
  return theme === "light"
    ? config?.ui?.themeColorLight || "#f4f7fb"
    : config?.ui?.themeColorDark || "#0a0c11";
}

/* =========================================================
   ABORT / HEADERS / NETWORK
========================================================= */

export function createAbortTimeout(ms = config?.requestTimeout) {
  const controller =
    new AbortController();

  const normalizedMs =
    Number(ms);

  if (
    !Number.isFinite(normalizedMs) ||
    normalizedMs <= 0
  ) {
    return {
      controller,
      timeoutId:
        null,
      signal:
        controller.signal,
      clear:
        () => {},
    };
  }

  const timeoutId =
    setTimeout(() => {
      try {
        controller.abort("timeout");
      } catch {
        try {
          controller.abort();
        } catch {}
      }
    }, normalizedMs);

  return {
    controller,
    timeoutId,
    signal:
      controller.signal,

    clear() {
      try {
        clearTimeout(timeoutId);
      } catch {}
    },
  };
}

export function normalizeHeaders(headers = {}) {
  const source =
    headers instanceof Headers
      ? Array.from(headers.entries())
      : Array.isArray(headers)
        ? headers
        : Object.entries(headers || {});

  return source.reduce((acc, [key, value]) => {
    const normalizedKey =
      String(key || "").trim();

    if (!normalizedKey) {
      return acc;
    }

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      acc[normalizedKey] =
        value;
    }

    return acc;
  }, {});
}

export function mergeAbortSignals(signals = []) {
  const validSignals =
    signals.filter(Boolean);

  if (!validSignals.length) {
    return null;
  }

  if (validSignals.length === 1) {
    return validSignals[0];
  }

  const controller =
    new AbortController();

  const cleanups =
    [];

  function teardown() {
    for (const cleanup of cleanups) {
      try {
        cleanup?.();
      } catch {}
    }

    cleanups.length =
      0;
  }

  function abortFrom(sourceSignal) {
    if (controller.signal.aborted) {
      return;
    }

    try {
      controller.abort(
        sourceSignal?.reason || "aborted"
      );
    } catch {
      try {
        controller.abort();
      } catch {}
    } finally {
      teardown();
    }
  }

  for (const signal of validSignals) {
    if (signal.aborted) {
      abortFrom(signal);
      continue;
    }

    const onAbort = () => {
      abortFrom(signal);
    };

    try {
      signal.addEventListener(
        "abort",
        onAbort,
        {
          once:
            true,
        }
      );

      cleanups.push(() => {
        signal.removeEventListener(
          "abort",
          onAbort
        );
      });
    } catch {}
  }

  return controller.signal;
}

export function isAbortError(error) {
  const message =
    String(error?.message || "")
      .toLowerCase();

  return (
    error?.name === "AbortError" ||
    error?.code === 20 ||
    message.includes("aborted") ||
    message.includes("abort")
  );
}

export function isProbablyTimeoutError(error) {
  const message =
    String(error?.message || "")
      .toLowerCase();

  const raw =
    String(error?.raw || "")
      .toLowerCase();

  const reason =
    String(error?.reason || "")
      .toLowerCase();

  return (
    message.includes("timeout") ||
    raw.includes("timeout") ||
    reason.includes("timeout") ||
    error?.timeout === true
  );
}

export function detectNetworkHints(url = "") {
  const hints =
    [];

  if (!isBrowser()) {
    return hints;
  }

  try {
    if (navigator.onLine === false) {
      hints.push(
        "El navegador parece estar offline."
      );
    }
  } catch {}

  const rawUrl =
    safeText(url, "");

  if (!rawUrl) {
    return hints;
  }

  try {
    if (
      /^https:\/\//i.test(rawUrl) &&
      window.location.protocol === "http:"
    ) {
      hints.push(
        "Hay mezcla de protocolos: frontend en HTTP y API en HTTPS."
      );
    }

    if (
      /^http:\/\//i.test(rawUrl) &&
      window.location.protocol === "https:"
    ) {
      hints.push(
        "Hay mezcla de protocolos: frontend en HTTPS y API en HTTP."
      );
    }

    const apiOrigin =
      new URL(
        rawUrl,
        window.location.origin
      ).origin;

    if (
      apiOrigin &&
      apiOrigin !== window.location.origin
    ) {
      hints.push(
        "Petición cross-origin: revisa CORS y preflight OPTIONS."
      );
    }
  } catch {}

  return hints;
}

/* =========================================================
   DEBUG SNAPSHOT
========================================================= */

export function getHelpersSnapshot() {
  return {
    browser:
      isBrowser(),

    documentReady:
      isDocumentReady(),

    locationPath:
      redactTokenInText(
        getCurrentLocationPath()
      ),

    locationCanonicalPath:
      redactTokenInText(
        getCurrentLocationCanonicalPath()
      ),

    apiBase:
      normalizeApiBase(
        config?.apiBase || ""
      ),

    defaultLang:
      config?.defaultLang || "es",

    defaultTheme:
      config?.defaultTheme || "dark",
  };
}
