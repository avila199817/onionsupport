/* =========================================================
   Onion SPA - Router Helpers
   Archivo: src/router/helpers.js

   ROUTER HELPERS · FINAL SIMPLE
   - Helpers puros de Router
   - publicPath conserva /@usuario + query/hash
   - canonicalPath elimina /@usuario/query/hash
   - Preserva rutas técnicas con token hasta scrub oficial
   - Redirects internos seguros
   - Sin Auth real, fetch, storage, Toast, render ni navegación
========================================================= */

import {
  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_TOKEN_PARAM_NAMES,
} from "../features/auth/constants.js";

export const ROUTER_HELPERS_VERSION = "20.0.0-final";

export const ROUTER_CONFIG = Object.freeze({
  maxRouteLength: 2048,
  maxUsernameLength: 64,
  maxRedirectLength: 1600,
});

const HOME = "/";
const LOGIN = "/login";

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";
const PASSWORD_RESET_CONFIRM_PATH = "/password-reset/confirm";

const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";
const BOOT_CONTEXT_KEY = "__ONION_BOOT_CONTEXT__";
const ACTIVATION_INITIAL_URL_KEY = "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__";
const RESET_CONFIRM_INITIAL_URL_KEY = "__ONION_RESET_CONFIRM_INITIAL_URL__";
const RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY = "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__";

const USERNAME_RE = /^@[A-Za-z0-9._-]{1,80}$/;
const UNSAFE_PROTOCOL_RE = /^(javascript:|data:|vbscript:)/i;
const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:\/\//i;
const ANY_PROTOCOL_RE = /^[a-z][a-z\d+.-]*:/i;

const ACTIVATION_TOKEN_PARAMS = Object.freeze([
  ...(Array.isArray(AUTH_TOKEN_PARAM_NAMES?.activation) ? AUTH_TOKEN_PARAM_NAMES.activation : []),
  "token",
  "activationToken",
  "activateToken",
  "activation_token",
  "activate_token",
  "code",
  "t",
]);

const RESET_TOKEN_PARAMS = Object.freeze([
  ...(Array.isArray(AUTH_TOKEN_PARAM_NAMES?.reset) ? AUTH_TOKEN_PARAM_NAMES.reset : []),
  "token",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "reset_token",
  "password_reset_token",
  "confirm_token",
  "code",
  "t",
]);

const TWO_FACTOR_TOKEN_PARAMS = Object.freeze([
  ...(Array.isArray(AUTH_TOKEN_PARAM_NAMES?.twoFactor) ? AUTH_TOKEN_PARAM_NAMES.twoFactor : []),
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
  "otpToken",
  "otp_token",
  "code",
  "otp",
  "totp",
  "t",
]);

const SENSITIVE_PARAMS = Object.freeze([
  ...new Set([
    ...ACTIVATION_TOKEN_PARAMS,
    ...RESET_TOKEN_PARAMS,
    ...TWO_FACTOR_TOKEN_PARAMS,
    "access_token",
    "refresh_token",
    "id_token",
  ]),
]);

const PUBLIC_AUTH_PATHS = new Set([
  LOGIN,
  "/signin",
  "/sign-in",
  "/auth",
  "/auth/login",
  "/2fa",
  "/otp",
  "/mfa",
  ACTIVATION_PATH,
  "/reset-password",
  RESET_CONFIRM_PATH,
  "/forgot-password",
  "/recover-password",
  "/recover",
  "/password-reset",
  PASSWORD_RESET_CONFIRM_PATH,
]);

const TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    canonical: ACTIVATION_PATH,
    bases: Object.freeze([
      ACTIVATION_PATH,
      "/activate",
      "/activation",
      "/account/activate",
      "/activate/first-user",
    ]),
    initialKeys: Object.freeze([ACTIVATION_INITIAL_URL_KEY]),
    tokenParams: ACTIVATION_TOKEN_PARAMS,
    scrubKeys: Object.freeze([
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ]),
  }),
  Object.freeze({
    key: "resetConfirm",
    canonical: RESET_CONFIRM_PATH,
    bases: Object.freeze([RESET_CONFIRM_PATH, PASSWORD_RESET_CONFIRM_PATH]),
    initialKeys: Object.freeze([
      RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY,
      RESET_CONFIRM_INITIAL_URL_KEY,
    ]),
    tokenParams: RESET_TOKEN_PARAMS,
    scrubKeys: Object.freeze([
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetPasswordToken",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ]),
  }),
]);

/* =========================================================
   BASICS
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isObjectLike(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function unique(values = []) {
  return [
    ...new Set(
      toArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeAppCore(value) {
  if (!isObjectLike(value)) return false;

  return Boolean(
    value.state ||
      value.config ||
      value.utils ||
      value.events ||
      value.modules ||
      value.dom ||
      isFn(value.setState) ||
      isFn(value.setRoute) ||
      isFn(value.setPublicPath)
  );
}

function resolvePathArgs(first, second, fallback = HOME) {
  if (looksLikeAppCore(first)) {
    return { AppCore: first, path: second === undefined ? fallback : second };
  }

  return { AppCore: null, path: first === undefined ? fallback : first };
}

export function normalizeRouteInput(value = HOME) {
  const text = String(value ?? "").trim();
  return (text || HOME).slice(0, ROUTER_CONFIG.maxRouteLength);
}

function baseOrigin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

export function escapeHtml(first = "", second = undefined) {
  let value = first;
  if (looksLikeAppCore(first)) value = second;

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================
   ROUTE NAMES
========================================================= */

export function getRouteNames(AppCore) {
  const routes = safeObject(AppCore?.config?.routes);

  return {
    HOME: routes.home || HOME,
    LOGIN: routes.login || LOGIN,
    SERVER: routes.server || "/servidor",
    USERS: routes.users || "/usuarios",
    CLIENTES: routes.clientes || routes.clients || "/clientes",
    FACTURAS: routes.facturas || routes.invoices || "/facturas",
    INCIDENCIAS: routes.incidencias || routes.tickets || "/incidencias",
    CUENTA: routes.cuenta || routes.account || "/cuenta",
    AJUSTES: routes.ajustes || routes.settings || "/ajustes",
  };
}

/* =========================================================
   REDACTION
========================================================= */

export function redactTokenInText(value = "") {
  let output = safeText(value, "");
  if (!output) return "";

  for (const name of SENSITIVE_PARAMS) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const route of TOKEN_ROUTES) {
    for (const base of route.bases) {
      try {
        output = output.replace(
          new RegExp(`(${escapeRegExp(base)})\\/([^/?#\\s]+)`, "gi"),
          "$1/***"
        );
      } catch {}
    }
  }

  try {
    output = output.replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
  } catch {}

  try {
    output = output.replace(
      /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
      "$1$2***"
    );
  } catch {}

  try {
    output = output.replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
  } catch {}

  return output;
}

/* =========================================================
   PATH CORE
========================================================= */

function normalizeSearch(search = "") {
  const value = safeText(search, "");
  if (!value) return "";
  return value.startsWith("?") ? value : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = safeText(hash, "");
  if (!value) return "";
  return value.startsWith("#") ? value : `#${value.replace(/^#+/, "")}`;
}

function normalizePathname(pathname = HOME) {
  let value = safeText(pathname, HOME)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const stack = [];

  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;

    if (segment === "..") {
      stack.pop();
      continue;
    }

    stack.push(segment);
  }

  value = `/${stack.join("/")}` || HOME;
  return value.length > 1 ? value.replace(/\/+$/g, "") || HOME : value;
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return HOME;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || HOME;
  return raw.replace(/^#\/?/, "/") || HOME;
}

function splitRawPath(path = HOME) {
  let raw = normalizeRouteInput(path);

  if (isHashRouterPath(raw)) raw = normalizeHashRouterPath(raw);

  if (ABSOLUTE_URL_RE.test(raw)) {
    try {
      const url = new URL(raw, baseOrigin());

      if (url.hash && isHashRouterPath(url.hash)) {
        return splitRawPath(normalizeHashRouterPath(url.hash));
      }

      return {
        pathname: url.pathname || HOME,
        search: normalizeSearch(url.search || ""),
        hash: normalizeHash(url.hash || ""),
      };
    } catch {}
  }

  let pathname = raw || HOME;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || HOME;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || HOME;
  }

  return {
    pathname,
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function normalizePathnameWithCore(AppCore, pathname = HOME) {
  let normalized = normalizePathname(pathname);

  try {
    if (isFn(AppCore?.utils?.normalizePath)) {
      const delegated = AppCore.utils.normalizePath(normalized);

      if (delegated) {
        const clean = normalizePathname(splitRawPath(delegated).pathname);

        if (normalized !== HOME && clean === HOME) return normalized;

        normalized = clean;
      }
    }
  } catch {}

  return normalized;
}

export function normalizePath(first = null, second = undefined) {
  const { AppCore, path } = resolvePathArgs(first, second, HOME);
  const raw = normalizeRouteInput(path);

  if (isHashRouterPath(raw)) return normalizePath(AppCore, normalizeHashRouterPath(raw));

  if (raw.startsWith("#") && !isHashRouterPath(raw)) return normalizeHash(raw);

  const { pathname, search, hash } = splitRawPath(raw);
  const cleanPathname = normalizePathnameWithCore(AppCore, pathname);

  return `${cleanPathname}${search}${hash}`;
}

export function stripSearchAndHash(path = HOME) {
  return normalizePathname(splitRawPath(normalizePath(path)).pathname || HOME);
}

export function getSearchAndHash(path = HOME) {
  const parts = splitRawPath(normalizePath(path));
  return `${parts.search}${parts.hash}`;
}

export function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";

  if (isHashRouterPath(raw)) return normalizePath(normalizeHashRouterPath(raw));

  try {
    const parsed = new URL(raw, baseOrigin());

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      return normalizePath(normalizeHashRouterPath(parsed.hash));
    }

    return normalizePath(`${parsed.pathname || HOME}${parsed.search || ""}${parsed.hash || ""}`);
  } catch {
    return normalizePath(raw);
  }
}

/* =========================================================
   USERNAME SCOPE
========================================================= */

function isUsernameSegment(segment = "") {
  return USERNAME_RE.test(safeText(segment, ""));
}

function pathSegments(pathname = HOME) {
  return normalizePathname(pathname).split("/").filter(Boolean);
}

function stripUsernameFromPathname(pathname = HOME) {
  const segments = pathSegments(pathname);

  if (segments.length && isUsernameSegment(segments[0])) {
    const rest = segments.slice(1).join("/");
    return rest ? normalizePathname(`/${rest}`) : HOME;
  }

  return normalizePathname(pathname);
}

function usernameFromPathname(pathname = HOME) {
  const first = pathSegments(pathname)[0] || "";
  return isUsernameSegment(first) ? first.slice(1) : "";
}

export function sanitizeUsername(first = null, second = undefined) {
  let AppCore = null;
  let value = first;

  if (looksLikeAppCore(first)) {
    AppCore = first;
    value = second;
  }

  let normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  try {
    if (isFn(AppCore?.utils?.sanitizeUsername)) {
      normalized = AppCore.utils.sanitizeUsername(normalized) || normalized;
    }
  } catch {}

  return String(normalized)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, ROUTER_CONFIG.maxUsernameLength)
    .trim();
}

export function extractUsernameFromPath(first = null, second = undefined) {
  const { AppCore, path } = resolvePathArgs(first, second, HOME);
  const parts = splitRawPath(normalizePath(AppCore, path));
  const username = sanitizeUsername(AppCore, usernameFromPathname(parts.pathname));

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
        AppCore?.state?.user?.slug ||
        ""
    ) || null
  );
}

export function getCurrentResolvedUsername(AppCore) {
  const fromState = sanitizeUsername(
    AppCore,
    AppCore?.state?.currentResolvedUsername || AppCore?.state?.resolvedUsername || ""
  );

  if (fromState) return fromState;

  const statePublic = safeText(AppCore?.state?.publicPath, "");

  if (statePublic) {
    const fromPublic = extractUsernameFromPath(AppCore, statePublic);
    if (fromPublic) return fromPublic;
  }

  if (isBrowser()) {
    const fromBrowser = extractUsernameFromPath(AppCore, getBrowserPath());
    if (fromBrowser) return fromBrowser;
  }

  return getCurrentUsername(AppCore) || null;
}

export function stripUsernamePrefix(first = null, second = undefined) {
  const { AppCore, path } = resolvePathArgs(first, second, HOME);
  const normalized = normalizePath(AppCore, path);
  const parts = splitRawPath(normalized);
  const pathname = stripUsernameFromPathname(parts.pathname || HOME);

  return normalizePath(AppCore, `${pathname}${parts.search}${parts.hash}`);
}

/* =========================================================
   TOKEN ROUTES
========================================================= */

function historyState() {
  if (!isBrowser()) return {};

  try {
    return safeObject(window.history?.state);
  } catch {
    return {};
  }
}

function isTokenRouteScrubbed(config) {
  if (!isBrowser() || !config) return false;

  const state = historyState();

  if (state.scrubbedPublicTokenRoute === true || state.scrubbedTokenRoute === true) return true;
  if (state.scrubbedPublicTokenRoute === config.key || state.scrubbedTokenRoute === config.key) return true;

  return toArray(config.scrubKeys).some((key) => Boolean(state?.[key]));
}

function tokenRouteConfig(pathOrUrl = "") {
  const path = pathFromUrlLike(pathOrUrl);
  const pathname = stripUsernameFromPathname(stripSearchAndHash(path));

  return (
    TOKEN_ROUTES.find((config) =>
      config.bases.some((base) => pathname === base || pathname.startsWith(`${base}/`))
    ) || null
  );
}

function isPathOrChild(path = "", base = HOME) {
  const pathname = stripUsernameFromPathname(stripSearchAndHash(normalizePath(path)));
  return pathname === base || pathname.startsWith(`${base}/`);
}

function tokenFromPathBase(pathOrUrl = "", basePath = "") {
  const base = normalizePathname(basePath);

  if (!base) return "";

  try {
    const path = pathFromUrlLike(pathOrUrl);
    const parts = splitRawPath(path);
    const pathname = stripUsernameFromPathname(parts.pathname || HOME);

    if (!pathname.startsWith(`${base}/`)) return "";

    const token = pathname.slice(`${base}/`.length).split("/")[0];
    return token ? safeText(decodeURIComponent(token), "") : "";
  } catch {
    return "";
  }
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");
    return toArray(names).some((name) => safeText(params.get(name), ""));
  } catch {
    return false;
  }
}

function hashRouterCandidate(hash = "") {
  const raw = safeText(hash, "");
  return raw && isHashRouterPath(raw) ? normalizePath(normalizeHashRouterPath(raw)) : "";
}

function hashQuery(hash = "") {
  const raw = safeText(hash, "");

  if (!raw || !raw.includes("?")) return "";

  const query = raw.split("?").slice(1).join("?").split("#")[0];
  return query ? `?${query}` : "";
}

function hasPublicToken({ pathOrUrl = "", basePath = "", tokenParams = [] } = {}) {
  const raw = safeText(pathOrUrl, "");

  if (!raw) return false;

  if (tokenFromPathBase(raw, basePath)) return true;

  if (isHashRouterPath(raw)) {
    const hashPath = normalizeHashRouterPath(raw);

    if (tokenFromPathBase(hashPath, basePath)) return true;

    return hasTokenInSearch(splitRawPath(hashPath).search, tokenParams);
  }

  try {
    const parsed = new URL(raw, baseOrigin());
    const parsedPath = `${parsed.pathname || HOME}${parsed.search || ""}${parsed.hash || ""}`;

    if (tokenFromPathBase(parsedPath, basePath)) return true;
    if (hasTokenInSearch(parsed.search, tokenParams)) return true;

    const hashPath = hashRouterCandidate(parsed.hash);

    if (hashPath) {
      if (tokenFromPathBase(hashPath, basePath)) return true;
      if (hasTokenInSearch(splitRawPath(hashPath).search, tokenParams)) return true;
    }

    const query = hashQuery(parsed.hash);
    return query ? hasTokenInSearch(query, tokenParams) : false;
  } catch {
    const parts = splitRawPath(raw);
    const localPath = `${parts.pathname || HOME}${parts.search || ""}${parts.hash || ""}`;

    if (tokenFromPathBase(localPath, basePath)) return true;
    if (hasTokenInSearch(parts.search, tokenParams)) return true;

    const hashPath = hashRouterCandidate(parts.hash);

    if (hashPath) {
      if (tokenFromPathBase(hashPath, basePath)) return true;
      if (hasTokenInSearch(splitRawPath(hashPath).search, tokenParams)) return true;
    }

    const query = hashQuery(parts.hash);
    return query ? hasTokenInSearch(query, tokenParams) : false;
  }
}

export function isProtectedPublicTokenPath(pathOrUrl = "") {
  const config = tokenRouteConfig(pathOrUrl);

  if (!config || isTokenRouteScrubbed(config)) return false;

  return config.bases.some((base) =>
    hasPublicToken({
      pathOrUrl,
      basePath: base,
      tokenParams: config.tokenParams,
    })
  );
}

export function isActivationPath(path = "") {
  return TOKEN_ROUTES[0].bases.some((base) => isPathOrChild(path, base));
}

export function getActivationTokenFromPath(pathOrUrl = "") {
  for (const base of TOKEN_ROUTES[0].bases) {
    const token = tokenFromPathBase(pathOrUrl, base);
    if (token) return token;
  }

  return "";
}

export function hasTokenInActivationPath(pathOrUrl = "") {
  return Boolean(getActivationTokenFromPath(pathOrUrl));
}

export function hasActivationToken(pathOrUrl = "") {
  return TOKEN_ROUTES[0].bases.some((base) =>
    hasPublicToken({
      pathOrUrl,
      basePath: base,
      tokenParams: ACTIVATION_TOKEN_PARAMS,
    })
  );
}

function activationTokenScrubbed() {
  return isTokenRouteScrubbed(TOKEN_ROUTES[0]);
}

export function isResetConfirmPath(path = "") {
  return TOKEN_ROUTES[1].bases.some((base) => isPathOrChild(path, base));
}

export function getResetConfirmTokenFromPath(pathOrUrl = "") {
  for (const base of TOKEN_ROUTES[1].bases) {
    const token = tokenFromPathBase(pathOrUrl, base);
    if (token) return token;
  }

  return "";
}

export function hasTokenInResetConfirmPath(pathOrUrl = "") {
  return Boolean(getResetConfirmTokenFromPath(pathOrUrl));
}

export function hasResetConfirmToken(pathOrUrl = "") {
  return TOKEN_ROUTES[1].bases.some((base) =>
    hasPublicToken({
      pathOrUrl,
      basePath: base,
      tokenParams: RESET_TOKEN_PARAMS,
    })
  );
}

function resetConfirmTokenScrubbed() {
  return isTokenRouteScrubbed(TOKEN_ROUTES[1]);
}

/* =========================================================
   INITIAL URL CAPTURE
========================================================= */

function getBrowserPath() {
  if (!isBrowser()) return HOME;

  try {
    const pathname = window.location.pathname || HOME;
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) return normalizePath(normalizeHashRouterPath(hash));

    return normalizePath(`${pathname}${search}${hash}`);
  } catch {
    return HOME;
  }
}

function setWindowOnce(key = "", value = "") {
  if (!isBrowser() || !key || !value) return false;

  try {
    if (!window[key]) window[key] = value;
    return true;
  } catch {
    return false;
  }
}

function getWindowValue(key = "") {
  if (!isBrowser() || !key) return "";

  try {
    return safeText(window[key], "");
  } catch {
    return "";
  }
}

function getBootContext() {
  if (!isBrowser()) return {};

  try {
    return safeObject(window[BOOT_CONTEXT_KEY]);
  } catch {
    return {};
  }
}

function patchBootContext(patch = {}) {
  if (!isBrowser()) return false;

  try {
    window[BOOT_CONTEXT_KEY] = {
      ...getBootContext(),
      ...safeObject(patch),
    };

    return true;
  } catch {
    return false;
  }
}

export function captureInitialUrl() {
  if (!isBrowser()) return false;

  try {
    const href = safeText(window.location.href, "");

    if (!href) return false;

    setWindowOnce(INITIAL_URL_KEY, href);

    const path = pathFromUrlLike(href);
    let key = "";

    if (isActivationPath(path) && hasActivationToken(href) && !activationTokenScrubbed()) {
      setWindowOnce(ACTIVATION_INITIAL_URL_KEY, href);
      key = "activation";
    }

    if (isResetConfirmPath(path) && hasResetConfirmToken(href) && !resetConfirmTokenScrubbed()) {
      setWindowOnce(RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY, href);
      setWindowOnce(RESET_CONFIRM_INITIAL_URL_KEY, href);
      key = "resetConfirm";
    }

    if (key) {
      patchBootContext({
        bootProtectedInitialUrl: href,
        bootProtectedInitialPublicPath: path,
        bootProtectedInitialPath: normalizeCanonicalPath(path),
        bootProtectedRouteKey: key,
        bootIsPublicTokenRoute: true,
        bootHasPublicToken: true,
      });
    }

    return true;
  } catch {
    return false;
  }
}

function initialUrl() {
  return getWindowValue(INITIAL_URL_KEY);
}

function activationInitialUrl() {
  return getWindowValue(ACTIVATION_INITIAL_URL_KEY);
}

function resetConfirmInitialUrl() {
  return getWindowValue(RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY) || getWindowValue(RESET_CONFIRM_INITIAL_URL_KEY);
}

function stateInitialCandidates(AppCore, config) {
  const state = safeObject(AppCore?.state);
  const boot = getBootContext();

  const candidates = [
    state.bootProtectedInitialUrl,
    state.bootProtectedInitialPublicPath,
    state.bootProtectedInitialPath,
    boot.bootProtectedInitialUrl,
    boot.bootProtectedInitialPublicPath,
    boot.bootProtectedInitialPath,
  ];

  if (config?.key === "activation") {
    candidates.push(
      state.bootActivationInitialUrl,
      state.bootActivationInitialPublicPath,
      state.bootActivationInitialPath,
      boot.bootActivationInitialUrl,
      boot.bootActivationInitialPublicPath,
      boot.bootActivationInitialPath
    );
  }

  if (config?.key === "resetConfirm") {
    candidates.push(
      state.bootResetConfirmInitialUrl,
      state.bootResetConfirmInitialPublicPath,
      state.bootResetConfirmInitialPath,
      state.bootResetPasswordConfirmInitialUrl,
      state.bootResetPasswordConfirmInitialPublicPath,
      state.bootResetPasswordConfirmInitialPath,
      boot.bootResetConfirmInitialUrl,
      boot.bootResetConfirmInitialPublicPath,
      boot.bootResetConfirmInitialPath,
      boot.bootResetPasswordConfirmInitialUrl,
      boot.bootResetPasswordConfirmInitialPublicPath,
      boot.bootResetPasswordConfirmInitialPath
    );
  }

  return candidates.map((value) => safeText(value, "")).filter(Boolean);
}

function protectedInitialPath(AppCore = null, config = null) {
  if (!config || isTokenRouteScrubbed(config)) return "";

  captureInitialUrl();

  const candidates = unique([
    ...toArray(config.initialKeys).map(getWindowValue),
    ...stateInitialCandidates(AppCore, config),
    initialUrl(),
    isBrowser() ? safeText(window.location.href, "") : "",
    getBrowserPath(),
  ]);

  for (const candidate of candidates) {
    const path = pathFromUrlLike(candidate);

    const matched = config.bases.some((base) =>
      isPathOrChild(path, base) &&
      hasPublicToken({
        pathOrUrl: candidate,
        basePath: base,
        tokenParams: config.tokenParams,
      })
    );

    if (matched) return path;
  }

  return "";
}

function protectedActivationPath(AppCore = null) {
  return protectedInitialPath(AppCore, TOKEN_ROUTES[0]);
}

function protectedResetConfirmPath(AppCore = null) {
  return protectedInitialPath(AppCore, TOKEN_ROUTES[1]);
}

export function getProtectedInitialPublicPath(AppCore = null) {
  return protectedActivationPath(AppCore) || protectedResetConfirmPath(AppCore) || "";
}

/* =========================================================
   CANONICAL / CURRENT PATHS
========================================================= */

export function normalizeCanonicalPath(first = null, second = undefined) {
  const { AppCore, path } = resolvePathArgs(first, second, HOME);

  const stripped = stripUsernamePrefix(AppCore, path);
  const pathname = normalizePathname(stripSearchAndHash(stripped));

  if (TOKEN_ROUTES[0].bases.some((base) => pathname === base || pathname.startsWith(`${base}/`))) {
    return ACTIVATION_PATH;
  }

  if (TOKEN_ROUTES[1].bases.some((base) => pathname === base || pathname.startsWith(`${base}/`))) {
    return RESET_CONFIRM_PATH;
  }

  return pathname;
}

export function isSameCanonicalPath(AppCore, a = HOME, b = HOME) {
  return normalizeCanonicalPath(AppCore, a) === normalizeCanonicalPath(AppCore, b);
}

function preferStatePath(AppCore) {
  const state = safeObject(AppCore?.state);
  const statePublic = safeText(state.publicPath, "");
  const stateRoute = safeText(state.route, "");

  if (state.initialRouteRendered === true || state.bootNavigationHandled === true) {
    return Boolean(statePublic || stateRoute);
  }

  return Boolean(statePublic && statePublic !== HOME);
}

export function getCurrentUrl() {
  if (!isBrowser()) return new URL("http://localhost/");

  try {
    return new URL(window.location.href);
  } catch {
    return new URL("http://localhost/");
  }
}

export function getCurrentPath(AppCore) {
  const protectedInitial = getProtectedInitialPublicPath(AppCore);
  if (protectedInitial) return normalizePath(AppCore, protectedInitial);

  if (preferStatePath(AppCore)) {
    return normalizePath(AppCore, AppCore?.state?.publicPath || AppCore?.state?.route || HOME);
  }

  if (isBrowser()) return normalizePath(AppCore, getBrowserPath());

  return normalizePath(AppCore, AppCore?.state?.publicPath || AppCore?.state?.route || HOME);
}

export function getCurrentCanonicalPath(AppCore) {
  return normalizeCanonicalPath(AppCore, getCurrentPath(AppCore));
}

export function getCurrentPublicPath(AppCore) {
  return getCurrentPath(AppCore);
}

export function getResolvedPublicPath(fallback = HOME) {
  return getProtectedInitialPublicPath() || (isBrowser() ? getBrowserPath() : fallback);
}

/* =========================================================
   HREF SAFETY
========================================================= */

export function isExternalHref(href = "") {
  const raw = safeText(href, "");

  if (!raw) return false;
  if (/^(mailto:|tel:)/i.test(raw)) return true;
  if (raw.startsWith("//")) return true;

  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw, baseOrigin()).origin !== baseOrigin();
    } catch {
      return true;
    }
  }

  return false;
}

export function isUnsafeHref(href = "") {
  const raw = safeText(href, "");

  if (!raw) return false;
  if (/[\r\n\t]/.test(raw)) return true;

  return UNSAFE_PROTOCOL_RE.test(raw);
}

export function isHashOnlyHref(href = "") {
  const raw = safeText(href, "");
  return raw.startsWith("#") && !isHashRouterPath(raw);
}

export function isSlugCandidatePath(first = null, second = undefined) {
  const { AppCore, path } = resolvePathArgs(first, second, HOME);
  return /^\/@[^/]+(?:\/|$)/i.test(stripSearchAndHash(normalizePath(AppCore, path)));
}

export function resolveSpaHref(AppCore, href = HOME) {
  const routeNames = getRouteNames(AppCore);
  const raw = normalizeRouteInput(href);

  if (!raw || isUnsafeHref(raw)) return routeNames.HOME;
  if (raw.startsWith("//")) return raw;
  if (isHashRouterPath(raw)) return normalizePath(AppCore, normalizeHashRouterPath(raw));
  if (isHashOnlyHref(raw)) return raw;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw, baseOrigin());

      if (url.origin !== baseOrigin()) return raw;

      if (url.hash && isHashRouterPath(url.hash)) {
        return normalizePath(AppCore, normalizeHashRouterPath(url.hash));
      }

      return normalizePath(AppCore, `${url.pathname}${url.search}${url.hash}`);
    } catch {
      return routeNames.HOME;
    }
  }

  if (isExternalHref(raw)) return raw;
  if (raw.startsWith("/")) return normalizePath(AppCore, raw);
  if (ANY_PROTOCOL_RE.test(raw)) return routeNames.HOME;

  try {
    const url = new URL(raw, isBrowser() ? window.location.href : "http://localhost/");

    if (url.hash && isHashRouterPath(url.hash)) {
      return normalizePath(AppCore, normalizeHashRouterPath(url.hash));
    }

    return normalizePath(AppCore, `${url.pathname}${url.search}${url.hash}`);
  } catch {
    return routeNames.HOME;
  }
}

/* =========================================================
   BUILDERS
========================================================= */

function isAuthLikeCanonical(path = HOME) {
  const canonical = normalizeCanonicalPath(path);

  if (PUBLIC_AUTH_PATHS.has(canonical)) return true;

  return (
    canonical.startsWith(`${ACTIVATION_PATH}/`) ||
    canonical.startsWith(`${RESET_CONFIRM_PATH}/`) ||
    canonical.startsWith(`${PASSWORD_RESET_CONFIRM_PATH}/`)
  );
}

export function canUsePublicSlugForRoute(route, routeNames = null) {
  if (!route) return false;

  const names = routeNames || { LOGIN };
  const routePath = stripSearchAndHash(normalizePath(route.path || HOME));

  if (routePath === names.LOGIN) return false;
  if (isAuthLikeCanonical(routePath)) return false;

  if (
    route.hideShell === true ||
    route.shell === false ||
    route.showShell === false ||
    route.layout === "auth" ||
    route.layout === "public" ||
    route.meta?.hideShell === true ||
    route.meta?.shell === false ||
    route.meta?.showShell === false ||
    route.meta?.layout === "auth" ||
    route.meta?.layout === "public"
  ) {
    return false;
  }

  return true;
}

function preserveTechnicalTokenPublicPath(source = "") {
  const clean = stripUsernamePrefix(source);

  return Boolean(
    (isActivationPath(clean) && hasActivationToken(clean) && !activationTokenScrubbed()) ||
      (isResetConfirmPath(clean) && hasResetConfirmToken(clean) && !resetConfirmTokenScrubbed())
  );
}

export function buildPublicPath(AppCore, getRoute, canonicalPath = HOME, options = {}) {
  const routeNames = getRouteNames(AppCore);
  const opts = safeObject(options);

  const source = normalizePath(
    AppCore,
    opts.fromPath || opts.publicPath || opts.requestedPath || canonicalPath || HOME
  );

  const sourceWithoutSlug = stripUsernamePrefix(AppCore, source);

  if (preserveTechnicalTokenPublicPath(source)) return normalizePath(AppCore, sourceWithoutSlug);

  const clean = normalizeCanonicalPath(AppCore, canonicalPath || source);
  const suffix = getSearchAndHash(source) || getSearchAndHash(canonicalPath) || "";

  let route = null;

  try {
    route = getRoute?.(clean) || null;
  } catch {
    route = null;
  }

  const publicWithoutSlug = normalizePath(AppCore, `${clean}${suffix}`);
  const sourceHadSlug = isSlugCandidatePath(AppCore, source);

  if (!route && sourceHadSlug && !isAuthLikeCanonical(clean)) return normalizePath(AppCore, source);
  if (!route || !canUsePublicSlugForRoute(route, routeNames)) return publicWithoutSlug;

  const username = sanitizeUsername(
    AppCore,
    opts.username ||
      opts.resolvedUsername ||
      extractUsernameFromPath(AppCore, opts.fromPath || opts.publicPath || source || "") ||
      getCurrentResolvedUsername(AppCore) ||
      getCurrentUsername(AppCore)
  );

  if (!username) return publicWithoutSlug;

  if (clean === routeNames.HOME) return normalizePath(AppCore, `/@${username}${suffix}`);

  return normalizePath(AppCore, `/@${username}${clean}${suffix}`);
}

export function getRedirectPath(AppCore) {
  const routeNames = getRouteNames(AppCore);

  let redirect = null;

  try {
    redirect = getCurrentUrl().searchParams.get("redirect");
  } catch {
    redirect = null;
  }

  if (!redirect || redirect.length > ROUTER_CONFIG.maxRedirectLength) return null;

  const resolved = resolveSpaHref(AppCore, redirect);

  if (isUnsafeHref(resolved) || isExternalHref(resolved)) return null;

  const canonical = normalizeCanonicalPath(AppCore, resolved);
  const loginCanonical = normalizeCanonicalPath(AppCore, routeNames.LOGIN);

  if (canonical === loginCanonical || isAuthLikeCanonical(canonical)) return null;

  return normalizePath(AppCore, resolved);
}

export function buildLoginUrl(AppCore, redirectPath = null) {
  const routeNames = getRouteNames(AppCore);
  const login = normalizePath(AppCore, routeNames.LOGIN);

  if (!redirectPath) return login;

  const resolvedRedirect = normalizePath(AppCore, resolveSpaHref(AppCore, redirectPath));

  if (isUnsafeHref(resolvedRedirect) || isExternalHref(resolvedRedirect)) return login;

  const redirectCanonical = normalizeCanonicalPath(AppCore, resolvedRedirect);

  if (redirectCanonical === normalizeCanonicalPath(AppCore, login) || isAuthLikeCanonical(redirectCanonical)) {
    return login;
  }

  try {
    const url = new URL(`http://localhost${login}`);
    url.searchParams.set("redirect", resolvedRedirect);
    return `${url.pathname}${url.search}`;
  } catch {
    return login;
  }
}

export function buildHistoryUrl(AppCore, getRoute, pathname = HOME, options = {}) {
  const routeNames = getRouteNames(AppCore);
  const opts = safeObject(options);
  const resolved = resolveSpaHref(AppCore, pathname);

  if (isUnsafeHref(resolved) || isExternalHref(resolved)) return routeNames.HOME;

  if (
    opts.preservePath === true ||
    opts.preservePublicPath === true ||
    opts.preserveUrl === true ||
    opts.protectedInitialUrl === true ||
    opts.skipHistory === true
  ) {
    return normalizePath(AppCore, resolved);
  }

  return buildPublicPath(AppCore, getRoute, resolved, {
    username: opts.username,
    resolvedUsername: opts.resolvedUsername,
    fromPath: opts.fromPath || opts.publicPath || resolved,
    publicPath: opts.publicPath,
  });
}

export function buildStatePayload(AppCore, pathname = HOME, extras = {}) {
  const publicPath = normalizePath(AppCore, pathname);
  const canonical = normalizeCanonicalPath(AppCore, publicPath);
  const username = extractUsernameFromPath(AppCore, publicPath) || getCurrentResolvedUsername(AppCore) || null;

  return {
    path: publicPath,
    publicPath,
    canonicalPath: canonical,
    rawCanonicalPath: canonical,
    requestedPath: publicPath,
    searchAndHash: getSearchAndHash(publicPath),
    username,
    isActivationRoute: canonical === ACTIVATION_PATH,
    isResetConfirmRoute: canonical === RESET_CONFIRM_PATH,
    hasActivationToken: hasActivationToken(publicPath),
    hasResetConfirmToken: hasResetConfirmToken(publicPath),
    isProtectedPublicTokenRoute: isProtectedPublicTokenPath(publicPath),
    ...safeObject(extras),
  };
}

export function getDefaultHomeTarget(AppCore, getRoute) {
  const routeNames = getRouteNames(AppCore);

  return (
    buildPublicPath(AppCore, getRoute, routeNames.HOME, {
      username: getCurrentResolvedUsername(AppCore) || getCurrentUsername(AppCore),
    }) || routeNames.HOME
  );
}

/* =========================================================
   DEBUG
========================================================= */

export function getRouterHelpersSnapshot(AppCore) {
  const currentPublicPath = getCurrentPublicPath(AppCore);

  return {
    version: ROUTER_HELPERS_VERSION,
    currentPath: redactTokenInText(getCurrentPath(AppCore)),
    currentPublicPath: redactTokenInText(currentPublicPath),
    currentCanonicalPath: redactTokenInText(getCurrentCanonicalPath(AppCore)),
    browserPath: redactTokenInText(isBrowser() ? getBrowserPath() : HOME),
    initialUrl: redactTokenInText(initialUrl()),
    activationInitialUrl: redactTokenInText(activationInitialUrl()),
    resetConfirmInitialUrl: redactTokenInText(resetConfirmInitialUrl()),
    protectedActivationPath: redactTokenInText(protectedActivationPath(AppCore)),
    protectedResetConfirmPath: redactTokenInText(protectedResetConfirmPath(AppCore)),
    protectedInitialPublicPath: redactTokenInText(getProtectedInitialPublicPath(AppCore)),
    activationTokenScrubbed: activationTokenScrubbed(),
    resetConfirmTokenScrubbed: resetConfirmTokenScrubbed(),
    hasActivationTokenInCurrentPath: hasActivationToken(currentPublicPath),
    hasResetConfirmTokenInCurrentPath: hasResetConfirmToken(currentPublicPath),
    activationPathToken: getActivationTokenFromPath(currentPublicPath) ? "***" : null,
    resetConfirmPathToken: getResetConfirmTokenFromPath(currentPublicPath) ? "***" : null,
    username: getCurrentResolvedUsername(AppCore),
    routeNames: getRouteNames(AppCore),
    policy: {
      ownAuth: false,
      ownStorage: false,
      ownTransport: false,
      ownRender: false,
      ownNavigation: false,
    },
  };
}

export const RouterTokenRoutes = Object.freeze({
  ACTIVATION_PATH,
  RESET_CONFIRM_PATH,
  PASSWORD_RESET_CONFIRM_PATH,

  ACTIVATION_TOKEN_PARAM_NAMES: ACTIVATION_TOKEN_PARAMS,
  RESET_TOKEN_PARAM_NAMES: RESET_TOKEN_PARAMS,

  hasActivationToken,
  hasResetConfirmToken,

  hasTokenInActivationPath,
  hasTokenInResetConfirmPath,

  getActivationTokenFromPath,
  getResetConfirmTokenFromPath,

  isActivationPath,
  isResetConfirmPath,

  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,

  redactTokenInText,
});

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_HELPERS_VERSION,
  ROUTER_CONFIG,

  getRouteNames,

  isBrowser,
  normalizeRouteInput,
  escapeHtml,

  redactTokenInText,

  normalizePath,
  stripSearchAndHash,
  getSearchAndHash,
  pathFromUrlLike,

  sanitizeUsername,
  extractUsernameFromPath,
  getCurrentUsername,
  getCurrentResolvedUsername,

  stripUsernamePrefix,
  normalizeCanonicalPath,
  isSameCanonicalPath,

  getCurrentUrl,
  getCurrentPath,
  getCurrentCanonicalPath,
  getCurrentPublicPath,
  getResolvedPublicPath,

  isExternalHref,
  isUnsafeHref,
  isHashOnlyHref,
  isSlugCandidatePath,

  isActivationPath,
  isResetConfirmPath,
  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,

  hasActivationToken,
  hasResetConfirmToken,
  hasTokenInActivationPath,
  hasTokenInResetConfirmPath,
  getActivationTokenFromPath,
  getResetConfirmTokenFromPath,

  canUsePublicSlugForRoute,
  resolveSpaHref,

  buildPublicPath,
  getRedirectPath,
  buildLoginUrl,
  buildHistoryUrl,
  buildStatePayload,
  getDefaultHomeTarget,

  captureInitialUrl,
  getRouterHelpersSnapshot,

  RouterTokenRoutes,
};
