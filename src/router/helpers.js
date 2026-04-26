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
   - preservar query/hash correctamente en publicPath
   - canonical determinista sin query/hash
   - cero degradación username/context path
   - no destruir tokens públicos en rutas tipo /activate-account?token=...
   - soporte hash-router /#/activate-account?token=...
   - soporte URL inicial capturada antes del boot SPA
   - soporte directo para /activate-account/<token>
   - soporte directo para /reset-password/confirm/<token>

   HARDENING EXTREMO 10/10:
   - canonical determinista sin query/hash
   - publicPath preserva query/hash
   - publicPath preserva /activate-account/<token>
   - publicPath preserva /reset-password/confirm/<token>
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
   PUBLIC TOKEN ROUTES
========================================================= */

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const ACTIVATION_TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
]);

const RESET_TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
]);

const PUBLIC_AUTH_PATHS = new Set([
  "/login",
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
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

function safeText(value = "", fallback = "") {
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

export function normalizeRouteInput(value = "/") {
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

export function escapeHtml(AppCore, value = "") {
  try {
    if (
      typeof AppCore?.utils?.escapeHtml === "function"
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

function normalizeSearch(search = "") {
  const value =
    String(search || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    String(hash || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      "/";
  }

  return value;
}

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function splitRawPath(path = "/") {
  const raw =
    normalizeRouteInput(path);

  if (!raw) {
    return {
      pathname: "/",
      search: "",
      hash: "",
    };
  }

  if (isHashRouterPath(raw)) {
    return splitRawPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (
      /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ) {
      const url = new URL(
        raw,
        getBaseOrigin()
      );

      if (
        url.hash &&
        isHashRouterPath(url.hash)
      ) {
        return splitRawPath(
          normalizeHashRouterPath(url.hash)
        );
      }

      return {
        pathname:
          url.pathname || "/",
        search:
          normalizeSearch(url.search || ""),
        hash:
          normalizeHash(url.hash || ""),
      };
    }
  } catch {}

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname =
      pathname.slice(0, hashIndex) ||
      "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname =
      pathname.slice(0, searchIndex) ||
      "/";
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

function normalizePathnameWithCore(AppCore, pathname = "/") {
  let normalized =
    normalizePathnameOnly(pathname);

  try {
    if (
      typeof AppCore?.utils?.normalizePath === "function"
    ) {
      const delegated =
        AppCore.utils.normalizePath(normalized);

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
 * - también preserva /activate-account/<token>
 * - también preserva /reset-password/confirm/<token>
 */
export function normalizePath(AppCore, path = "/") {
  const raw =
    normalizeRouteInput(path);

  if (isHashRouterPath(raw)) {
    return normalizePath(
      AppCore,
      normalizeHashRouterPath(raw)
    );
  }

  if (
    raw.startsWith("#") &&
    !isHashRouterPath(raw)
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

export function stripSearchAndHash(path = "/") {
  const parts =
    splitRawPath(
      normalizePath(null, path)
    );

  return normalizePathnameOnly(
    parts.pathname || "/"
  );
}

export function getSearchAndHash(path = "/") {
  const parts =
    splitRawPath(
      normalizePath(null, path)
    );

  return `${parts.search}${parts.hash}`;
}

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizePath(
        null,
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return normalizePath(
      null,
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return normalizePath(
      null,
      raw
    );
  }
}

/* =========================================================
   PUBLIC TOKEN HELPERS
========================================================= */

function isPathOrChild(path = "", basePath = "/") {
  const normalized =
    normalizePath(null, path);

  const pathname =
    stripSearchAndHash(normalized);

  return (
    pathname === basePath ||
    pathname.startsWith(`${basePath}/`)
  );
}

function getTokenFromPathByBase(pathOrUrl = "", basePath = "") {
  const raw =
    safeText(pathOrUrl, "");

  const base =
    normalizePathnameOnly(basePath);

  if (!raw || !base) {
    return "";
  }

  try {
    const parts =
      splitRawPath(raw);

    const pathname =
      normalizePathnameOnly(
        parts.pathname || "/"
      );

    const escapedBase =
      base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const pattern = new RegExp(
      `^${escapedBase}/([^/?#]+)$`,
      "i"
    );

    const match =
      pathname.match(pattern);

    if (!match?.[1]) {
      return "";
    }

    return safeText(
      decodeURIComponent(match[1]),
      ""
    );
  } catch {
    return "";
  }
}

function hasTokenInSearch(search = "", tokenParamNames = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return tokenParamNames.some(
      (name) =>
        Boolean(
          safeText(
            params.get(name),
            ""
          )
        )
    );
  } catch {
    return false;
  }
}

function hasPublicToken({
  pathOrUrl = "",
  basePath = "",
  tokenParamNames = [],
} = {}) {
  const raw =
    safeText(pathOrUrl, "");

  if (!raw) {
    return false;
  }

  /*
    Formato path-token:
    /base/path/<token>
  */
  if (
    getTokenFromPathByBase(
      raw,
      basePath
    )
  ) {
    return true;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    const parsedPath =
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;

    if (
      getTokenFromPathByBase(
        parsedPath,
        basePath
      )
    ) {
      return true;
    }

    if (
      hasTokenInSearch(
        parsed.search,
        tokenParamNames
      )
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        tokenParamNames
      );
    }

    return false;
  } catch {
    const parts =
      splitRawPath(raw);

    const localPath =
      `${parts.pathname || "/"}${parts.search || ""}${parts.hash || ""}`;

    if (
      getTokenFromPathByBase(
        localPath,
        basePath
      )
    ) {
      return true;
    }

    if (
      hasTokenInSearch(
        parts.search,
        tokenParamNames
      )
    ) {
      return true;
    }

    if (
      parts.hash &&
      parts.hash.includes("?")
    ) {
      const query =
        parts.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        tokenParamNames
      );
    }

    return false;
  }
}

/* =========================================================
   ACTIVATION TOKEN PROTECTION
========================================================= */

function isActivationPath(path = "") {
  return isPathOrChild(
    path,
    ACTIVATION_PATH
  );
}

function getActivationTokenFromPath(pathOrUrl = "") {
  return getTokenFromPathByBase(
    pathOrUrl,
    ACTIVATION_PATH
  );
}

function hasTokenInActivationPath(pathOrUrl = "") {
  return Boolean(
    getActivationTokenFromPath(pathOrUrl)
  );
}

function hasActivationToken(pathOrUrl = "") {
  return hasPublicToken({
    pathOrUrl,
    basePath: ACTIVATION_PATH,
    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
  });
}

function isActivationTokenScrubbed() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.scrubbedActivationToken
    );
  } catch {
    return false;
  }
}

/* =========================================================
   RESET TOKEN PROTECTION
========================================================= */

function isResetConfirmPath(path = "") {
  return isPathOrChild(
    path,
    RESET_CONFIRM_PATH
  );
}

function getResetConfirmTokenFromPath(pathOrUrl = "") {
  return getTokenFromPathByBase(
    pathOrUrl,
    RESET_CONFIRM_PATH
  );
}

function hasTokenInResetConfirmPath(pathOrUrl = "") {
  return Boolean(
    getResetConfirmTokenFromPath(pathOrUrl)
  );
}

function hasResetConfirmToken(pathOrUrl = "") {
  return hasPublicToken({
    pathOrUrl,
    basePath: RESET_CONFIRM_PATH,
    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
  });
}

function isResetConfirmTokenScrubbed() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.scrubbedResetToken ||
        window.history?.state?.scrubbedResetPasswordToken
    );
  } catch {
    return false;
  }
}

/* =========================================================
   INITIAL URL CAPTURE
========================================================= */

function captureInitialUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href =
      window.location.href;

    if (!window.__ONION_INITIAL_URL__) {
      window.__ONION_INITIAL_URL__ = href;
    }

    const path =
      pathFromUrlLike(href);

    if (
      isActivationPath(path) &&
      !window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
    ) {
      window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__ = href;
    }

    if (
      isResetConfirmPath(path) &&
      !window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__
    ) {
      window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__ = href;
    }

    return true;
  } catch {
    return false;
  }
}

function getInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_INITIAL_URL__,
    ""
  );
}

function getActivationInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__,
    ""
  );
}

function getResetConfirmInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__,
    ""
  );
}

function getProtectedActivationPath() {
  if (isActivationTokenScrubbed()) {
    return "";
  }

  captureInitialUrl();

  const activationInitialUrl =
    getActivationInitialUrl();

  if (
    activationInitialUrl &&
    isActivationPath(
      pathFromUrlLike(activationInitialUrl)
    ) &&
    hasActivationToken(activationInitialUrl)
  ) {
    return pathFromUrlLike(
      activationInitialUrl
    );
  }

  const initialUrl =
    getInitialUrl();

  if (
    initialUrl &&
    isActivationPath(
      pathFromUrlLike(initialUrl)
    ) &&
    hasActivationToken(initialUrl)
  ) {
    return pathFromUrlLike(
      initialUrl
    );
  }

  if (isBrowser()) {
    const browserPath =
      getBrowserPath();

    if (
      isActivationPath(browserPath) &&
      hasActivationToken(browserPath)
    ) {
      return browserPath;
    }
  }

  return "";
}

function getProtectedResetConfirmPath() {
  if (isResetConfirmTokenScrubbed()) {
    return "";
  }

  captureInitialUrl();

  const resetInitialUrl =
    getResetConfirmInitialUrl();

  if (
    resetInitialUrl &&
    isResetConfirmPath(
      pathFromUrlLike(resetInitialUrl)
    ) &&
    hasResetConfirmToken(resetInitialUrl)
  ) {
    return pathFromUrlLike(
      resetInitialUrl
    );
  }

  const initialUrl =
    getInitialUrl();

  if (
    initialUrl &&
    isResetConfirmPath(
      pathFromUrlLike(initialUrl)
    ) &&
    hasResetConfirmToken(initialUrl)
  ) {
    return pathFromUrlLike(
      initialUrl
    );
  }

  if (isBrowser()) {
    const browserPath =
      getBrowserPath();

    if (
      isResetConfirmPath(browserPath) &&
      hasResetConfirmToken(browserPath)
    ) {
      return browserPath;
    }
  }

  return "";
}

/* =========================================================
   USERNAME
========================================================= */

export function sanitizeUsername(AppCore, value = "") {
  let normalized = String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  try {
    if (
      AppCore?.utils?.sanitizeUsername
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
    .replace(/[^a-z0-9._-]/g, "")
    .slice(
      0,
      ROUTER_CONFIG.maxUsernameLength
    )
    .trim();
}

export function extractUsernameFromPath(AppCore, path = "/") {
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

export function getCurrentUsername(AppCore) {
  return (
    sanitizeUsername(
      AppCore,
      AppCore?.state?.user?.username ||
        AppCore?.state?.user?.userName ||
        AppCore?.state?.user?.nick ||
        AppCore?.state?.user?.alias ||
        ""
    ) || null
  );
}

export function getCurrentResolvedUsername(AppCore) {
  const fromState =
    sanitizeUsername(
      AppCore,
      AppCore?.state?.currentResolvedUsername ||
        AppCore?.state?.resolvedUsername ||
        ""
    );

  if (fromState) {
    return fromState;
  }

  if (isBrowser()) {
    const fromUrl =
      extractUsernameFromPath(
        AppCore,
        getBrowserPath()
      );

    if (fromUrl) {
      return fromUrl;
    }
  }

  return (
    getCurrentUsername(AppCore) ||
    null
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
export function stripUsernamePrefix(AppCore, path = "/") {
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
 * - /activate-account/<token> resuelve a /activate-account
 * - /reset-password/confirm/<token> resuelve a /reset-password/confirm
 *
 * Ejemplo:
 *   /@pepe/activate-account?token=abc
 *   -> /activate-account
 *
 * Ejemplo:
 *   /activate-account/uuid
 *   -> /activate-account
 *
 * Ejemplo:
 *   /reset-password/confirm/abc
 *   -> /reset-password/confirm
 */
export function normalizeCanonicalPath(AppCore, path = "/") {
  const stripped =
    stripUsernamePrefix(
      AppCore,
      path
    );

  const pathname =
    stripSearchAndHash(
      stripped
    );

  const cleanPathname =
    normalizePathnameOnly(
      pathname
    );

  /*
    Activación pública:
    - /activate-account
    - /activate-account/<token>

    Ambas resuelven contra:
    /activate-account
  */
  if (
    cleanPathname === ACTIVATION_PATH ||
    cleanPathname.startsWith(`${ACTIVATION_PATH}/`)
  ) {
    return ACTIVATION_PATH;
  }

  /*
    Reset password confirm:
    - /reset-password/confirm
    - /reset-password/confirm/<token>

    Ambas resuelven contra:
    /reset-password/confirm
  */
  if (
    cleanPathname === RESET_CONFIRM_PATH ||
    cleanPathname.startsWith(`${RESET_CONFIRM_PATH}/`)
  ) {
    return RESET_CONFIRM_PATH;
  }

  return cleanPathname;
}

export function isSameCanonicalPath(AppCore, a = "/", b = "/") {
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

function getBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizePath(
        null,
        normalizeHashRouterPath(hash)
      );
    }

    return normalizePath(
      null,
      `${pathname}${search}${hash}`
    );
  } catch {
    return "/";
  }
}

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
 * Prioridad:
 * 1. token protegido de activation inicial
 * 2. token protegido de reset confirm inicial
 * 3. navegador real
 * 4. estado
 */
export function getCurrentPath(AppCore) {
  const protectedActivationPath =
    getProtectedActivationPath();

  if (protectedActivationPath) {
    return normalizePath(
      AppCore,
      protectedActivationPath
    );
  }

  const protectedResetConfirmPath =
    getProtectedResetConfirmPath();

  if (protectedResetConfirmPath) {
    return normalizePath(
      AppCore,
      protectedResetConfirmPath
    );
  }

  if (isBrowser()) {
    return normalizePath(
      AppCore,
      getBrowserPath()
    );
  }

  return normalizePath(
    AppCore,
    AppCore?.state?.publicPath ||
      AppCore?.state?.route ||
      "/"
  );
}

/**
 * Ruta canónica actual.
 *
 * Ejemplo:
 *   /activate-account?token=xxx
 *   -> /activate-account
 *
 * Ejemplo:
 *   /activate-account/xxx
 *   -> /activate-account
 *
 * Ejemplo:
 *   /reset-password/confirm/xxx
 *   -> /reset-password/confirm
 */
export function getCurrentCanonicalPath(AppCore) {
  return normalizeCanonicalPath(
    AppCore,
    getCurrentPath(AppCore)
  );
}

/**
 * Public path actual.
 *
 * Prioridad:
 * 1. token protegido de activation inicial
 * 2. token protegido de reset confirm inicial
 * 3. navegador real
 * 4. estado de app
 */
export function getCurrentPublicPath(AppCore) {
  const protectedActivationPath =
    getProtectedActivationPath();

  if (protectedActivationPath) {
    return normalizePath(
      AppCore,
      protectedActivationPath
    );
  }

  const protectedResetConfirmPath =
    getProtectedResetConfirmPath();

  if (protectedResetConfirmPath) {
    return normalizePath(
      AppCore,
      protectedResetConfirmPath
    );
  }

  if (isBrowser()) {
    return getCurrentPath(
      AppCore
    );
  }

  return normalizePath(
    AppCore,
    AppCore?.state?.publicPath ||
      AppCore?.state?.route ||
      "/"
  );
}

export function getResolvedPublicPath(fallback = "/") {
  const protectedActivationPath =
    getProtectedActivationPath();

  if (protectedActivationPath) {
    return protectedActivationPath;
  }

  const protectedResetConfirmPath =
    getProtectedResetConfirmPath();

  if (protectedResetConfirmPath) {
    return protectedResetConfirmPath;
  }

  if (!isBrowser()) {
    return fallback;
  }

  return getBrowserPath();
}

/* =========================================================
   HREF RULES
========================================================= */

export function isExternalHref(href = "") {
  return /^(https?:|mailto:|tel:)/i.test(
    String(href || "").trim()
  );
}

export function isUnsafeHref(href = "") {
  return /^(javascript:|data:|vbscript:)/i.test(
    String(href || "").trim()
  );
}

export function isHashOnlyHref(href = "") {
  const value =
    String(href || "").trim();

  if (!value.startsWith("#")) {
    return false;
  }

  return !isHashRouterPath(value);
}

export function isSlugCandidatePath(AppCore, pathname = "/") {
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

export function canUsePublicSlugForRoute(route, routeNames) {
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
    PUBLIC_AUTH_PATHS.has(routePath)
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

export function resolveSpaHref(AppCore, href = "/") {
  const routeNames =
    getRouteNames(AppCore);

  const raw =
    normalizeRouteInput(href);

  if (!raw) {
    return routeNames.HOME;
  }

  if (isUnsafeHref(raw)) {
    return routeNames.HOME;
  }

  if (isHashRouterPath(raw)) {
    return normalizePath(
      AppCore,
      normalizeHashRouterPath(raw)
    );
  }

  if (isHashOnlyHref(raw)) {
    return raw;
  }

  if (/^https?:\/\//i.test(raw)) {
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
        if (
          url.hash &&
          isHashRouterPath(url.hash)
        ) {
          return normalizePath(
            AppCore,
            normalizeHashRouterPath(url.hash)
          );
        }

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

  if (isExternalHref(raw)) {
    return raw;
  }

  if (raw.startsWith("/")) {
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

    if (
      url.hash &&
      isHashRouterPath(url.hash)
    ) {
      return normalizePath(
        AppCore,
        normalizeHashRouterPath(url.hash)
      );
    }

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
 * Entrada:
 *   /activate-account/abc
 *
 * Salida:
 *   /activate-account/abc
 *
 * Entrada:
 *   /reset-password/confirm/abc
 *
 * Salida:
 *   /reset-password/confirm/abc
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
    getRouteNames(AppCore);

  const source =
    normalizePath(
      AppCore,
      options.fromPath ||
        options.publicPath ||
        canonicalPath
    );

  /*
    Activación con token:
    preservamos la URL pública completa.
  */
  if (
    isActivationPath(source) &&
    hasActivationToken(source)
  ) {
    return normalizePath(
      AppCore,
      source
    );
  }

  /*
    Reset password confirm con token:
    preservamos la URL pública completa para que la vista
    pueda leer /reset-password/confirm/<token>.
  */
  if (
    isResetConfirmPath(source) &&
    hasResetConfirmToken(source)
  ) {
    return normalizePath(
      AppCore,
      source
    );
  }

  const clean =
    normalizeCanonicalPath(
      AppCore,
      source
    );

  const sourceSuffix =
    getSearchAndHash(
      source
    );

  const canonicalSuffix =
    getSearchAndHash(
      canonicalPath
    );

  const suffix =
    sourceSuffix ||
    canonicalSuffix ||
    "";

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
          options.fromPath ||
            options.publicPath ||
            ""
        ) ||
        getCurrentResolvedUsername(AppCore) ||
        getCurrentUsername(AppCore)
    );

  if (!username) {
    return publicWithoutSlug;
  }

  if (clean === routeNames.HOME) {
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

export function getRedirectPath(AppCore) {
  const routeNames =
    getRouteNames(AppCore);

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

export function buildLoginUrl(AppCore, redirectPath = null) {
  const routeNames =
    getRouteNames(AppCore);

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
    isUnsafeHref(resolvedRedirect) ||
    isExternalHref(resolvedRedirect)
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
 *
 * Tampoco debe convertir:
 *   /activate-account/abc
 * en:
 *   /activate-account
 *
 * Tampoco debe convertir:
 *   /reset-password/confirm/abc
 * en:
 *   /reset-password/confirm
 *
 * antes de que la vista haya capturado el token.
 */
export function buildHistoryUrl(
  AppCore,
  getRoute,
  pathname = "/",
  options = {}
) {
  const routeNames =
    getRouteNames(AppCore);

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

  if (options.preservePath) {
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
        options.fromPath ||
        options.publicPath ||
        resolved,

      publicPath:
        options.publicPath,
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
    getCurrentResolvedUsername(AppCore) ||
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

export function getDefaultHomeTarget(AppCore, getRoute) {
  const routeNames =
    getRouteNames(AppCore);

  return (
    buildPublicPath(
      AppCore,
      getRoute,
      routeNames.HOME,
      {
        username:
          getCurrentResolvedUsername(AppCore) ||
          getCurrentUsername(AppCore),
      }
    ) ||
    routeNames.HOME
  );
}

/* =========================================================
   DEBUG
========================================================= */

export function getRouterHelpersSnapshot(AppCore) {
  return {
    currentPath:
      getCurrentPath(AppCore),

    currentPublicPath:
      getCurrentPublicPath(AppCore),

    currentCanonicalPath:
      getCurrentCanonicalPath(AppCore),

    browserPath:
      isBrowser()
        ? getBrowserPath()
        : "/",

    initialUrl:
      getInitialUrl(),

    activationInitialUrl:
      getActivationInitialUrl(),

    resetConfirmInitialUrl:
      getResetConfirmInitialUrl(),

    protectedActivationPath:
      getProtectedActivationPath(),

    protectedResetConfirmPath:
      getProtectedResetConfirmPath(),

    activationTokenScrubbed:
      isActivationTokenScrubbed(),

    resetConfirmTokenScrubbed:
      isResetConfirmTokenScrubbed(),
  };
}
