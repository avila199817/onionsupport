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

   HARDENING EXTREMO:
   - sanitize estricto de username
   - paths robustos con query/hash
   - canonical consistente SIN query/hash
   - public path consistente CON query/hash
   - soporte hash-router real: #/ruta y #!/ruta
   - helpers seguros ante inputs raros
   - preserve contexto público/canónico
   - API base robusta
   - detección public API compatible con /api prefix
   - normalización de usuario backend heterogéneo
   - avatar robusto desde payload /me
   - AbortController server/browser safe
   - headers normalizados sin valores vacíos
   - redacción de JWT, bearer y query tokens
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
    "jwt",
    "bearer",
    "auth",
    "authorization",
  ]);

const TECHNICAL_TOKEN_PATHS =
  Object.freeze([
    "/activate-account",
    "/reset-password/confirm",
    "/password/reset",
    "/auth/activate",
    "/auth/reset",
  ]);

const SAFE_USERNAME_MAX =
  64;

const SAFE_SLUG_MAX =
  96;

const BAD_TOKEN_VALUES =
  Object.freeze([
    "",
    "null",
    "undefined",
    "false",
    "true",
    "nan",
    "none",
    "empty",
    "[object object]",
  ]);

const JWT_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

const BEARER_RE =
  /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi;

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
  if (value === 1) return true;
  if (value === 0) return false;

  return Boolean(fallback);
}

export function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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
      config?.storagePrefix ||
        config?.appKey,
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

      cause:
        error.cause
          ? safeText(error.cause?.message || error.cause, "")
          : null,
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

function escapeRegExp(value = "") {
  return String(value)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactTokenInText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const path of TECHNICAL_TOKEN_PATHS) {
    try {
      const escapedPath =
        escapeRegExp(path);

      output = output.replace(
        new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
        "$1/***"
      );
    } catch {}
  }

  try {
    output = output.replace(
      BEARER_RE,
      "$1***"
    );
  } catch {}

  try {
    output = output.replace(
      JWT_RE,
      "***"
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

function isAbsoluteUrl(value = "") {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(
    safeText(value, "")
  );
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
  let raw =
    String(value || "")
      .trim();

  if (!raw) {
    return "";
  }

  raw =
    raw.replace(/^@+/, "");

  /*
    Si llega un email como username, usamos la parte local.
    Evita rutas públicas tipo /@correo.comdominio.
  */
  if (
    raw.includes("@") &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)
  ) {
    raw =
      raw.split("@")[0] || raw;
  }

  return raw
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

  /*
    Hash-router directo:
    "#/tickets" -> "/tickets"
    "#!/tickets" -> "/tickets"
  */
  if (isHashRouterPath(raw)) {
    return normalizePath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (isAbsoluteUrl(raw)) {
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

  /*
    Hash-router combinado:
    "/index.html#/tickets" -> "/tickets"
    "/app?x=1#/tickets?y=2" -> "/tickets?y=2"
  */
  if (
    hash &&
    isHashRouterPath(hash)
  ) {
    return normalizePath(
      normalizeHashRouterPath(hash)
    );
  }

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
  const rawPath =
    String(path || "")
      .trim();

  if (isAbsoluteUrl(rawPath)) {
    return rawPath;
  }

  const cleanBase =
    normalizeApiBase(base);

  const cleanPath =
    rawPath.replace(/^\/+/, "");

  if (!cleanPath) {
    return cleanBase;
  }

  if (!cleanBase) {
    return `/${cleanPath}`;
  }

  return `${cleanBase}/${cleanPath}`;
}

function appendQueryToUrl(baseUrl = "", query = null) {
  if (!query) {
    return baseUrl;
  }

  const queryEntries =
    typeof URLSearchParams !== "undefined" &&
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

  let url;

  try {
    url =
      new URL(
        baseUrl,
        getBaseOrigin()
      );
  } catch {
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

export function buildUrl(path = "", query = null) {
  const rawPath =
    String(path || "").trim();

  const apiBase =
    normalizeApiBase(
      config?.apiBase || ""
    );

  const baseUrl =
    isAbsoluteUrl(rawPath)
      ? rawPath
      : joinUrl(
          apiBase,
          rawPath
        );

  return appendQueryToUrl(
    baseUrl,
    query
  );
}

/* =========================================================
   TOKEN / PUBLIC API
========================================================= */

export function stripBearerPrefix(token = "") {
  return safeText(token, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

export function hasValidToken(token = null) {
  const value =
    stripBearerPrefix(token);

  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

  if (BAD_TOKEN_VALUES.includes(lower)) {
    return false;
  }

  if (
    value.includes(" ") ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes("\t")
  ) {
    return false;
  }

  return true;
}

function getApiBasePath() {
  const apiBase =
    normalizeApiBase(
      config?.apiBase || ""
    );

  if (!apiBase) {
    return "";
  }

  try {
    if (isAbsoluteUrl(apiBase)) {
      return normalizeCanonicalPath(
        new URL(apiBase, getBaseOrigin()).pathname || ""
      );
    }

    return normalizeCanonicalPath(
      apiBase
    );
  } catch {
    return "";
  }
}

function stripApiBasePrefix(path = DEFAULT_ROUTE) {
  const normalized =
    normalizeCanonicalPath(path);

  const apiBasePath =
    getApiBasePath();

  if (
    !apiBasePath ||
    apiBasePath === DEFAULT_ROUTE
  ) {
    return normalized;
  }

  if (normalized === apiBasePath) {
    return DEFAULT_ROUTE;
  }

  if (normalized.startsWith(`${apiBasePath}/`)) {
    return normalizeCanonicalPath(
      normalized.slice(apiBasePath.length) || DEFAULT_ROUTE
    );
  }

  return normalized;
}

export function isPublicApiPath(path = "") {
  const normalized =
    normalizeCanonicalPath(path);

  const withoutApiBase =
    stripApiBasePrefix(normalized);

  const list =
    config?.auth?.publicApiPaths || [];

  return list.some((publicPath) => {
    const current =
      normalizeCanonicalPath(publicPath);

    const currentWithoutApiBase =
      stripApiBasePrefix(current);

    return (
      normalized === current ||
      normalized.startsWith(`${current}/`) ||
      withoutApiBase === current ||
      withoutApiBase.startsWith(`${current}/`) ||
      normalized === currentWithoutApiBase ||
      normalized.startsWith(`${currentWithoutApiBase}/`)
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

function normalizeActive(user = {}) {
  const candidate =
    user.active ??
    user.is_active ??
    user.isActive ??
    user.enabled ??
    user.isEnabled ??
    user.disabled ??
    user.isDisabled;

  if (
    user.disabled === true ||
    user.isDisabled === true
  ) {
    return false;
  }

  if (candidate === undefined || candidate === null) {
    return true;
  }

  if (
    candidate === "0" ||
    candidate === 0 ||
    candidate === "false" ||
    candidate === false
  ) {
    return false;
  }

  return true;
}

function resolveAvatarCandidate(user = {}) {
  const profile =
    isPlainObject(user.profile)
      ? user.profile
      : {};

  const raw =
    isPlainObject(user.raw)
      ? user.raw
      : {};

  const rawProfile =
    isPlainObject(raw.profile)
      ? raw.profile
      : {};

  return firstNonEmpty(
    user.avatarUrl,
    user.avatar_url,
    user.avatar,
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
    user.picture_url,

    profile.avatarUrl,
    profile.avatar_url,
    profile.avatar,
    profile.photo,
    profile.photoUrl,
    profile.photo_url,
    profile.image,
    profile.imageUrl,
    profile.image_url,
    profile.picture,
    profile.pictureUrl,
    profile.picture_url,

    raw.avatarUrl,
    raw.avatar_url,
    raw.avatar,
    raw.photo,
    raw.photoUrl,
    raw.photo_url,
    raw.image,
    raw.imageUrl,
    raw.image_url,
    raw.picture,
    raw.pictureUrl,
    raw.picture_url,

    rawProfile.avatarUrl,
    rawProfile.avatar_url,
    rawProfile.avatar,
    rawProfile.photo,
    rawProfile.photoUrl,
    rawProfile.photo_url,
    rawProfile.image,
    rawProfile.imageUrl,
    rawProfile.image_url,
    rawProfile.picture,
    rawProfile.pictureUrl,
    rawProfile.picture_url
  );
}

export function normalizeUser(user = null) {
  if (
    !user ||
    typeof user !== "object"
  ) {
    return null;
  }

  const profile =
    isPlainObject(user.profile)
      ? user.profile
      : {};

  const raw =
    isPlainObject(user.raw)
      ? user.raw
      : {};

  const id =
    user.id ??
    user.userId ??
    user.user_id ??
    user.uuid ??
    user._id ??
    profile.id ??
    profile.userId ??
    raw.id ??
    raw.userId ??
    null;

  const email =
    firstNonEmpty(
      user.email,
      user.mail,
      profile.email,
      profile.mail,
      raw.email,
      raw.mail
    );

  const rawName =
    firstNonEmpty(
      user.name,
      user.nombre,
      user.full_name,
      user.fullName,
      user.display_name,
      user.displayName,
      profile.name,
      profile.nombre,
      profile.full_name,
      profile.fullName,
      profile.display_name,
      profile.displayName,
      raw.name,
      raw.nombre,
      raw.full_name,
      raw.fullName,
      raw.display_name,
      raw.displayName,
      user.username,
      email,
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
        profile.username,
        profile.userName,
        profile.nick,
        profile.alias,
        profile.login,
        profile.slug,
        raw.username,
        raw.userName,
        raw.nick,
        raw.alias,
        raw.login,
        raw.slug,
        email
      )
    );

  const slug =
    sanitizeUsername(
      firstNonEmpty(
        user.slug,
        profile.slug,
        raw.slug,
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
        user.userType,
        profile.role,
        profile.rol,
        raw.role,
        raw.rol
      )
    );

  const hasAvatar =
    user.hasAvatar ??
    user.has_avatar ??
    user.avatarEnabled ??
    user.avatar_enabled ??
    profile.hasAvatar ??
    profile.has_avatar ??
    raw.hasAvatar ??
    raw.has_avatar;

  const avatar =
    resolveAvatarCandidate(user);

  const active =
    normalizeActive(user);

  return {
    ...user,

    id,

    userId:
      user.userId ??
      user.user_id ??
      id,

    username,
    slug,

    name:
      rawName,

    displayName:
      firstNonEmpty(
        user.displayName,
        user.display_name,
        profile.displayName,
        profile.display_name,
        raw.displayName,
        raw.display_name,
        rawName
      ),

    email,

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
      profile.avatarUpdatedAt ??
      profile.avatar_updated_at ??
      raw.avatarUpdatedAt ??
      raw.avatar_updated_at ??
      null,

    active,
  };
}

export function getUserDisplayName(user = null) {
  return firstNonEmpty(
    user?.displayName,
    user?.display_name,
    user?.name,
    user?.nombre,
    user?.fullName,
    user?.full_name,
    user?.profile?.displayName,
    user?.profile?.display_name,
    user?.profile?.name,
    user?.raw?.displayName,
    user?.raw?.display_name,
    user?.raw?.name,
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
      user?.profile?.username,
      user?.profile?.userName,
      user?.profile?.slug,
      user?.raw?.username,
      user?.raw?.userName,
      user?.raw?.slug,
      user?.email
    )
  );
}

export function getUserAvatarUrl(user = null) {
  const hasAvatar =
    user?.hasAvatar ??
    user?.has_avatar ??
    user?.profile?.hasAvatar ??
    user?.profile?.has_avatar ??
    user?.raw?.hasAvatar ??
    user?.raw?.has_avatar;

  if (hasAvatar === false) {
    return "";
  }

  return resolveAvatarCandidate(user || {});
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

  const hash =
    window.location.hash || "";

  if (isHashRouterPath(hash)) {
    return normalizePath(hash);
  }

  return normalizePath(
    `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`
  );
}

export function getCurrentLocationCanonicalPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  const hash =
    window.location.hash || "";

  if (isHashRouterPath(hash)) {
    return normalizeCanonicalPath(hash);
  }

  return normalizeCanonicalPath(
    `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`
  );
}

/* =========================================================
   HREF SAFETY
========================================================= */

export function isHashOnlyHref(href = "") {
  const value =
    safeText(href, "");

  return (
    value.startsWith("#") &&
    !isHashRouterPath(value)
  );
}

export function isUnsafeHref(href = "") {
  const value =
    safeText(href, "");

  if (!value) {
    return true;
  }

  return /^(javascript|data|vbscript):/i.test(value);
}

export function isExternalHref(href = "") {
  const value =
    safeText(href, "");

  if (!value || isUnsafeHref(value)) {
    return false;
  }

  if (!isAbsoluteUrl(value)) {
    return false;
  }

  if (!isBrowser()) {
    return true;
  }

  try {
    return new URL(value).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/* =========================================================
   HOOKS / THEME
========================================================= */

export async function runHookSeries(hooks = [], payload) {
  let current =
    payload;

  for (const hook of safeArray(hooks)) {
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
  if (typeof AbortController === "undefined") {
    return {
      controller:
        null,

      timeoutId:
        null,

      signal:
        null,

      clear:
        () => {},
    };
  }

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
  let source =
    [];

  try {
    if (
      typeof Headers !== "undefined" &&
      headers instanceof Headers
    ) {
      source =
        Array.from(headers.entries());
    } else if (Array.isArray(headers)) {
      source =
        headers;
    } else {
      source =
        Object.entries(headers || {});
    }
  } catch {
    source =
      [];
  }

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
    safeArray(signals).filter(Boolean);

  if (!validSignals.length) {
    return null;
  }

  if (validSignals.length === 1) {
    return validSignals[0];
  }

  if (typeof AbortController === "undefined") {
    return validSignals[0] || null;
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

  const name =
    String(error?.name || "")
      .toLowerCase();

  return (
    name === "aborterror" ||
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

    apiBasePath:
      getApiBasePath(),

    defaultLang:
      config?.defaultLang || "es",

    defaultTheme:
      config?.defaultTheme || "dark",
  };
}

export default {
  isBrowser,
  isDocumentReady,
  now,

  isPlainObject,
  isFunction,
  safeText,
  safeNumber,
  safeBool,
  safeArray,
  isDomScope,
  normalizeListenerOptions,

  buildStorageKey,
  safeParse,
  safeStringify,
  safeClone,
  cloneError,

  redactTokenInText,

  stripSearchAndHash,
  getSearchAndHash,

  sanitizeUsername,
  slugify,

  normalizeApiBase,
  normalizePath,
  stripUsernamePrefix,
  normalizeCanonicalPath,
  normalizePublicPath,

  joinUrl,
  buildUrl,

  stripBearerPrefix,
  hasValidToken,
  isPublicApiPath,

  normalizeUser,
  getUserDisplayName,
  getUserUsername,
  getUserAvatarUrl,
  getInitials,

  getCurrentLocationPath,
  getCurrentLocationCanonicalPath,

  isHashOnlyHref,
  isUnsafeHref,
  isExternalHref,

  runHookSeries,
  getThemeColor,

  createAbortTimeout,
  normalizeHeaders,
  mergeAbortSignals,
  isAbortError,
  isProbablyTimeoutError,
  detectNetworkHints,

  getHelpersSnapshot,
};
