/* =========================================================
   Onion SPA - App Helpers
   Archivo: src/app/helpers.js

   APP HELPERS · SIMPLE
   - helpers puros de boot/compat
   - publicPath conserva /@usuario + query/hash
   - canonicalPath elimina /@usuario + query/hash
   - canonicalPath colapsa rutas técnicas con token
   - captura inicial de activation/reset con token
   - registro de módulos idempotente
   - sin Auth, Router real, fetch, storage, Toast, sesión, render ni history
========================================================= */

export const HELPERS_VERSION = "21.0.1-simple";

const DEFAULT_ROUTE = "/";
const DEFAULT_SCOPE = "app";

const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";
const BOOT_CONTEXT_KEY = "__ONION_BOOT_CONTEXT__";
const MAIN_BOOT_CONTEXT_KEY = "__ONION_MAIN_BOOT_CONTEXT__";
const ACTIVATION_INITIAL_URL_KEY = "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__";
const RESET_CONFIRM_INITIAL_URL_KEY = "__ONION_RESET_CONFIRM_INITIAL_URL__";
const RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY = "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__";

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const USERNAME_RE = /^@[A-Za-z0-9._-]{1,64}$/;
const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:\/\//i;
const ANY_PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:/i;
const SENSITIVE_KEY_RE = /token|secret|password|authorization|credential|jwt|bearer|session|refresh|otp|mfa|2fa|code/i;

const ACTIVATION_TOKEN_PARAMS = Object.freeze(["token", "activationToken", "activateToken", "code", "t"]);
const RESET_TOKEN_PARAMS = Object.freeze(["token", "resetToken", "passwordResetToken", "confirmToken", "code", "t"]);
const EXTRA_TOKEN_PARAMS = Object.freeze(["otp", "totp", "access_token", "refresh_token", "id_token", "tempToken", "temp_token", "mfaToken", "mfa_token", "authorization", "jwt", "session", "sid"]);
const SENSITIVE_PARAMS = Object.freeze(unique([...ACTIVATION_TOKEN_PARAMS, ...RESET_TOKEN_PARAMS, ...EXTRA_TOKEN_PARAMS]));

export const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATION_PATH,
    paths: Object.freeze([ACTIVATION_PATH, "/activate", "/activation", "/account/activate", "/activate/first-user"]),
    windowKeys: Object.freeze([ACTIVATION_INITIAL_URL_KEY]),
    tokenParamNames: ACTIVATION_TOKEN_PARAMS,
    scrubbedKeys: Object.freeze(["scrubbedActivationToken", "activationTokenScrubbed", "scrubbedPublicTokenRoute", "scrubbedTokenRoute"]),
  }),
  Object.freeze({
    key: "resetConfirm",
    path: RESET_CONFIRM_PATH,
    paths: Object.freeze([RESET_CONFIRM_PATH, "/reset-password-confirm", "/password-reset/confirm", "/password-reset-confirm", "/confirm-reset-password"]),
    windowKeys: Object.freeze([RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY, RESET_CONFIRM_INITIAL_URL_KEY]),
    tokenParamNames: RESET_TOKEN_PARAMS,
    scrubbedKeys: Object.freeze(["scrubbedResetToken", "resetTokenScrubbed", "scrubbedPublicTokenRoute", "scrubbedTokenRoute"]),
  }),
]);

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isObjectLike = (value) => Boolean(value && (typeof value === "object" || typeof value === "function"));

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function now() {
  try { return Date.now(); } catch { return 0; }
}

function iso(ms = now()) {
  try { return new Date(ms).toISOString(); } catch { return ""; }
}

function unique(values = []) {
  return [...new Set(toArray(values).flat(Infinity).map((item) => safeText(item, "")).filter(Boolean))];
}

function canExtend(value) {
  try { return isObjectLike(value) && Object.isExtensible(value); } catch { return false; }
}

function defineHiddenValue(target, key, value) {
  if (!target || !key || !canExtend(target)) return false;

  try {
    Object.defineProperty(target, key, { value, enumerable: false, configurable: true, writable: true });
    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {
    return false;
  }
}

function baseOrigin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

function looksLikeAppCore(value) {
  return Boolean(
    isObjectLike(value) &&
      (value.state || value.utils || value.events || value.modules || value.cleanup || value.dom || isFn(value.setState) || isFn(value.setRoute) || isFn(value.setPublicPath))
  );
}

function resolvePathArgs(first, second, fallback = DEFAULT_ROUTE) {
  if (looksLikeAppCore(first)) return { AppCore: first, path: second === undefined ? fallback : second };
  return { AppCore: null, path: first === undefined ? fallback : first };
}

/* =========================================================
   PATH CORE
========================================================= */

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function normalizeSearch(search = "") {
  const raw = safeText(search, "");
  if (!raw) return "";
  return raw.startsWith("?") ? raw : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw = safeText(hash, "");
  if (!raw) return "";
  return raw.startsWith("#") ? raw : `#${raw.replace(/^#+/, "")}`;
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value = safeText(pathname, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) value = DEFAULT_ROUTE;
  if (!value.startsWith("/")) value = `/${value}`;

  const stack = [];

  for (const segment of value.split("/").filter(Boolean)) {
    if (segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }

  value = `/${stack.join("/")}`;
  return value.length > 1 ? value.replace(/\/+$/g, "") || DEFAULT_ROUTE : value || DEFAULT_ROUTE;
}

function splitPath(path = DEFAULT_ROUTE) {
  let raw = safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;
  if (isHashRouterPath(raw)) raw = normalizeHashRouterPath(raw);

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  return {
    pathname: normalizePathnameOnly(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function normalizePath(path = DEFAULT_ROUTE) {
  const { pathname, search, hash } = splitPath(path || DEFAULT_ROUTE);
  return `${pathname}${search}${hash}`;
}

function pathFromUrlLike(value = DEFAULT_ROUTE) {
  const raw = safeText(value, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) return normalizePath(normalizeHashRouterPath(raw));
  if (ANY_PROTOCOL_RE.test(raw) && !ABSOLUTE_URL_RE.test(raw)) return DEFAULT_ROUTE;

  try {
    if (ABSOLUTE_URL_RE.test(raw)) {
      const parsed = new URL(raw, baseOrigin());
      if (parsed.origin !== baseOrigin()) return DEFAULT_ROUTE;
      if (parsed.hash && isHashRouterPath(parsed.hash)) return normalizePath(normalizeHashRouterPath(parsed.hash));
      return normalizePath(`${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`);
    }
  } catch {
    return DEFAULT_ROUTE;
  }

  return normalizePath(raw.startsWith("/") || raw.startsWith("#") ? raw : `/${raw}`);
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return splitPath(normalizePath(path)).pathname;
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  const { search, hash } = splitPath(normalizePath(path));
  return `${search}${hash}`;
}

function isUsernameSegment(segment = "") {
  return USERNAME_RE.test(safeText(segment, ""));
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const { pathname, search, hash } = splitPath(normalizePath(path));
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length && isUsernameSegment(segments[0])) {
    const rest = segments.slice(1).join("/");
    return normalizePath(`${rest ? `/${rest}` : DEFAULT_ROUTE}${search}${hash}`);
  }

  return normalizePath(`${pathname}${search}${hash}`);
}

/* =========================================================
   PROTECTED TOKEN ROUTES
========================================================= */

function matchTokenRoute(config, path = DEFAULT_ROUTE) {
  if (!config) return "";

  const clean = normalizePathnameOnly(path);

  for (const candidate of config.paths || []) {
    const base = normalizePathnameOnly(candidate);
    if (clean === base || clean.startsWith(`${base}/`)) return base;
  }

  return "";
}

function tokenRouteFor(pathOrUrl = "") {
  const publicPath = pathFromUrlLike(pathOrUrl || DEFAULT_ROUTE);
  const clean = stripSearchAndHash(stripUsernamePrefix(publicPath));
  return PROTECTED_PUBLIC_TOKEN_ROUTES.find((config) => matchTokenRoute(config, clean)) || null;
}

function canonicalizeProtectedPath(path = DEFAULT_ROUTE) {
  const clean = stripSearchAndHash(stripUsernamePrefix(pathFromUrlLike(path || DEFAULT_ROUTE)));

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    if (matchTokenRoute(config, clean)) return normalizePathnameOnly(config.path);
  }

  return normalizePathnameOnly(clean);
}

export function normalizePublicPath(first = DEFAULT_ROUTE, second = undefined) {
  const { path } = resolvePathArgs(first, second, DEFAULT_ROUTE);
  return pathFromUrlLike(path || DEFAULT_ROUTE);
}

export function normalizeCanonicalPath(first = DEFAULT_ROUTE, second = undefined) {
  const { path } = resolvePathArgs(first, second, DEFAULT_ROUTE);
  return canonicalizeProtectedPath(path || DEFAULT_ROUTE);
}

function extractPathToken(config, pathOrUrl = "") {
  const publicPath = pathFromUrlLike(pathOrUrl);
  const clean = stripSearchAndHash(stripUsernamePrefix(publicPath));
  const matched = matchTokenRoute(config, clean);

  if (!matched || !clean.startsWith(`${matched}/`)) return "";

  const token = clean.slice(`${matched}/`.length).split("/")[0];

  try {
    return safeText(decodeURIComponent(token || ""), "");
  } catch {
    return safeText(token, "");
  }
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");
    return toArray(names).some((name) => Boolean(safeText(params.get(name), "")));
  } catch {
    return false;
  }
}

function hasProtectedToken(config, pathOrUrl = "") {
  if (!config || !pathOrUrl) return false;
  if (extractPathToken(config, pathOrUrl)) return true;

  const local = pathFromUrlLike(pathOrUrl);
  const parts = splitPath(local);

  if (hasTokenInSearch(parts.search, config.tokenParamNames)) return true;

  try {
    const parsed = new URL(pathOrUrl, baseOrigin());
    if (parsed.origin !== baseOrigin()) return false;
    if (hasTokenInSearch(parsed.search, config.tokenParamNames)) return true;

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      const hashPath = normalizeHashRouterPath(parsed.hash);
      const hashParts = splitPath(hashPath);
      return Boolean(extractPathToken(config, hashPath) || hasTokenInSearch(hashParts.search, config.tokenParamNames));
    }

    if (parsed.hash && parsed.hash.includes("?")) {
      const query = parsed.hash.split("?").slice(1).join("?");
      return hasTokenInSearch(query ? `?${query}` : "", config.tokenParamNames);
    }
  } catch {}

  if (parts.hash && parts.hash.includes("?")) {
    const query = parts.hash.split("?").slice(1).join("?");
    return hasTokenInSearch(query ? `?${query}` : "", config.tokenParamNames);
  }

  return false;
}

function historyState() {
  if (!isBrowser()) return {};

  try {
    return safeObject(window.history?.state);
  } catch {
    return {};
  }
}

function isProtectedTokenScrubbed(config = null) {
  if (!config) return false;

  const state = historyState();

  if (state.scrubbedPublicTokenRoute === true || state.scrubbedTokenRoute === true) return true;
  if (state.scrubbedPublicTokenRoute === config.key || state.scrubbedTokenRoute === config.key) return true;

  return toArray(config.scrubbedKeys).some((key) => Boolean(state?.[key]));
}

function anyProtectedTokenScrubbed() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.some(isProtectedTokenScrubbed);
}

export function isProtectedPublicTokenPath(pathOrUrl = "") {
  const config = tokenRouteFor(pathOrUrl);
  return Boolean(config && !isProtectedTokenScrubbed(config) && hasProtectedToken(config, pathOrUrl));
}

export function isActivationPath(path = "") {
  return canonicalizeProtectedPath(path || DEFAULT_ROUTE) === ACTIVATION_PATH;
}

export function isResetConfirmPath(path = "") {
  return canonicalizeProtectedPath(path || DEFAULT_ROUTE) === RESET_CONFIRM_PATH;
}

/* =========================================================
   INITIAL URL CAPTURE
========================================================= */

function windowValue(key = "") {
  if (!isBrowser() || !key) return "";

  try {
    return safeText(window[key], "");
  } catch {
    return "";
  }
}

function windowObject(key = "") {
  if (!isBrowser() || !key) return {};

  try {
    return safeObject(window[key]);
  } catch {
    return {};
  }
}

function setWindowValue(key = "", value = "", onlyIfMissing = true) {
  if (!isBrowser() || !key || !value) return false;

  try {
    if (onlyIfMissing && window[key]) return true;
    window[key] = value;
    return true;
  } catch {
    return false;
  }
}

function patchBootContext(patch = {}) {
  if (!isBrowser()) return false;

  try {
    window[BOOT_CONTEXT_KEY] = { ...safeObject(window[BOOT_CONTEXT_KEY]), ...safeObject(patch) };
    return true;
  } catch {
    return false;
  }
}

function patchState(AppCore, patch = {}) {
  const data = safeObject(patch);
  if (!Object.keys(data).length) return false;

  const options = { source: "app.helpers", emit: false, emitState: false, silent: true };

  try { AppCore?.setState?.(data, options); } catch {}
  try { AppCore?.patchState?.(data, options); } catch {}
  try {
    if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, data);
  } catch {}

  return true;
}

function browserHref() {
  if (!isBrowser()) return "";

  try {
    return safeText(window.location?.href, "");
  } catch {
    return "";
  }
}

function browserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const hash = window.location.hash || "";
    if (hash && isHashRouterPath(hash)) return normalizePath(normalizeHashRouterPath(hash));
    return normalizePath(`${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function mainBootCandidate() {
  const ctx = windowObject(MAIN_BOOT_CONTEXT_KEY);
  return safeText(ctx.initialUrl || ctx.href || ctx.url || ctx.mainInitialUrl || ctx.mainInitialPublicPath || ctx.protectedInitialUrl || ctx.protectedInitialPublicPath || ctx.publicPath || "", "");
}

export function captureInitialUrl(AppCore = null) {
  if (!isBrowser()) return false;

  const href = browserHref();
  const initial = mainBootCandidate() || href;
  if (!initial) return false;

  setWindowValue(INITIAL_URL_KEY, initial, true);

  const publicPath = pathFromUrlLike(initial);
  const canonicalPath = normalizeCanonicalPath(AppCore, publicPath);

  const basePatch = {
    bootInitialUrl: initial,
    bootInitialPath: publicPath,
    bootCanonicalPath: canonicalPath,
  };

  patchBootContext(basePatch);
  patchState(AppCore, basePatch);

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    if (isProtectedTokenScrubbed(config)) continue;

    const candidates = unique([initial, href, mainBootCandidate(), ...toArray(config.windowKeys).map(windowValue)]).filter(Boolean);

    for (const candidate of candidates) {
      const candidateConfig = tokenRouteFor(candidate);
      if (!candidateConfig || candidateConfig.key !== config.key) continue;
      if (!hasProtectedToken(config, candidate)) continue;

      const protectedPublicPath = pathFromUrlLike(candidate);
      const protectedCanonicalPath = normalizeCanonicalPath(AppCore, protectedPublicPath);

      const patch = {
        bootProtectedInitialUrl: candidate,
        bootProtectedInitialPath: protectedPublicPath,
        bootProtectedInitialPublicPath: protectedPublicPath,
        bootCanonicalPath: protectedCanonicalPath,
        bootProtectedRouteKey: config.key,
        bootIsPublicTokenRoute: true,
        bootHasPublicToken: true,
        bootHasProtectedToken: true,
      };

      for (const key of config.windowKeys || []) setWindowValue(key, candidate, true);
      patchBootContext(patch);
      patchState(AppCore, patch);
      break;
    }
  }

  return true;
}

function protectedCandidates(AppCore = null) {
  const state = safeObject(AppCore?.state);
  const boot = windowObject(BOOT_CONTEXT_KEY);
  const main = windowObject(MAIN_BOOT_CONTEXT_KEY);
  const values = [];

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) values.push(...toArray(config.windowKeys).map(windowValue));

  values.push(
    state.bootProtectedInitialUrl,
    state.bootProtectedInitialPath,
    state.bootProtectedInitialPublicPath,
    boot.bootProtectedInitialUrl,
    boot.bootProtectedInitialPath,
    boot.bootProtectedInitialPublicPath,
    main.initialUrl,
    main.href,
    main.url,
    main.protectedInitialUrl,
    main.protectedInitialPublicPath,
    windowValue(INITIAL_URL_KEY),
    browserHref(),
    browserPath()
  );

  return unique(values).filter(Boolean);
}

export function resolveProtectedInitialContext(AppCore = null) {
  captureInitialUrl(AppCore);

  for (const candidate of protectedCandidates(AppCore)) {
    const config = tokenRouteFor(candidate);
    if (!config || isProtectedTokenScrubbed(config) || !hasProtectedToken(config, candidate)) continue;

    const publicPath = pathFromUrlLike(candidate);
    const canonicalPath = normalizeCanonicalPath(AppCore, publicPath);
    const tokenInPath = Boolean(extractPathToken(config, candidate));

    return {
      config,
      key: config.key || "",
      path: publicPath,
      publicPath,
      canonicalPath,
      url: candidate,
      hasToken: true,
      tokenInPath,
      scrubbed: false,
      redactedPath: redactTokenInText(publicPath),
      redactedPublicPath: redactTokenInText(publicPath),
      redactedCanonicalPath: redactTokenInText(canonicalPath),
      redactedUrl: redactTokenInText(candidate),
    };
  }

  return {
    config: null,
    key: "",
    path: "",
    publicPath: "",
    canonicalPath: "",
    url: "",
    hasToken: false,
    tokenInPath: false,
    scrubbed: anyProtectedTokenScrubbed(),
    redactedPath: "",
    redactedPublicPath: "",
    redactedCanonicalPath: "",
    redactedUrl: "",
  };
}

export function getProtectedInitialPublicPath(AppCore = null) {
  const context = resolveProtectedInitialContext(AppCore);
  return context.hasToken ? context.publicPath : "";
}

/* =========================================================
   CURRENT PATHS
========================================================= */

function preferBrowserPath(AppCore = null) {
  if (getProtectedInitialPublicPath(AppCore)) return true;

  const currentBrowserPath = browserPath();
  const statePublic = safeText(AppCore?.state?.publicPath, "");
  const stateRoute = safeText(AppCore?.state?.route, "");

  if (!anyProtectedTokenScrubbed() && isProtectedPublicTokenPath(currentBrowserPath)) return true;
  if (!statePublic && !stateRoute) return true;
  if (currentBrowserPath && currentBrowserPath !== DEFAULT_ROUTE && (statePublic === DEFAULT_ROUTE || stateRoute === DEFAULT_ROUTE)) return true;

  return false;
}

export function getCurrentPath(AppCore, Router = null) {
  captureInitialUrl(AppCore);

  const protectedPath = getProtectedInitialPublicPath(AppCore);
  if (protectedPath) return normalizePublicPath(AppCore, protectedPath);
  if (preferBrowserPath(AppCore)) return normalizePublicPath(AppCore, browserPath());

  try {
    const routerPath = Router?.getCurrentPublicPath?.() || Router?.getCurrentPath?.();
    if (routerPath) return normalizePublicPath(AppCore, routerPath);
  } catch {}

  return normalizePublicPath(AppCore, AppCore?.state?.publicPath || AppCore?.state?.route || browserPath());
}

export function getCurrentPublicPath(AppCore, Router = null) {
  return getCurrentPath(AppCore, Router);
}

export function getCurrentCanonicalPath(AppCore, Router = null) {
  captureInitialUrl(AppCore);

  const protectedContext = resolveProtectedInitialContext(AppCore);
  if (protectedContext.hasToken) return normalizeCanonicalPath(AppCore, protectedContext.publicPath);
  if (preferBrowserPath(AppCore)) return normalizeCanonicalPath(AppCore, browserPath());

  try {
    const routerPath = Router?.getCurrentCanonicalPath?.() || Router?.getCurrentPath?.();
    if (routerPath) return normalizeCanonicalPath(AppCore, routerPath);
  } catch {}

  return normalizeCanonicalPath(AppCore, AppCore?.state?.canonicalPath || AppCore?.state?.route || getCurrentPublicPath(AppCore, Router));
}

/* =========================================================
   SAFE TARGETS / REDACTION / HTML
========================================================= */

export function isSafeInternalPath(value = "") {
  const raw = safeText(value, "");
  return Boolean(raw && raw.startsWith("/") && !raw.startsWith("//") && !ANY_PROTOCOL_RE.test(raw) && !/[\r\n\t\\]/.test(raw));
}

export function normalizeInternalPathTarget(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const raw = safeText(value, fallback) || fallback;
  if (!isSafeInternalPath(raw)) return normalizePath(fallback);

  try {
    const parsed = new URL(raw, baseOrigin());
    if (parsed.origin !== baseOrigin()) return normalizePath(fallback);
    const path = normalizePath(`${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`);
    return isSafeInternalPath(path) ? path : normalizePath(fallback);
  } catch {
    const path = normalizePath(raw);
    return isSafeInternalPath(path) ? path : normalizePath(fallback);
  }
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactTokenInText(value = "") {
  let output = safeText(value, "");
  if (!output) return "";

  for (const name of SENSITIVE_PARAMS) {
    try {
      output = output.replace(new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"), "$1***");
    } catch {}
  }

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    for (const routePath of config.paths || []) {
      try {
        output = output.replace(new RegExp(`(${escapeRegExp(routePath)})\\/([^/?#\\s]+)`, "gi"), "$1/***");
      } catch {}
    }
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi, "$1$2***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

export function escapeHtml(AppCore, value = "") {
  let core = AppCore;
  let input = value;

  if (arguments.length === 1 && !looksLikeAppCore(AppCore)) {
    core = null;
    input = AppCore;
  }

  try {
    if (isFn(core?.utils?.escapeHtml)) return core.utils.escapeHtml(String(input ?? ""));
  } catch {}

  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================
   CLEANUP / MODULES
========================================================= */

export function ensureScope(AppCore, scope = DEFAULT_SCOPE) {
  const name = safeText(scope, DEFAULT_SCOPE) || DEFAULT_SCOPE;

  try {
    if (isFn(AppCore?.cleanup?.scope)) return AppCore.cleanup.scope(name);
  } catch {}

  try {
    if (isFn(AppCore?.cleanup?.ensureScope)) return AppCore.cleanup.ensureScope(name);
  } catch {}

  try {
    if (AppCore?.cleanup && canExtend(AppCore.cleanup)) {
      if (!AppCore.cleanup.scopes) AppCore.cleanup.scopes = new Map();
      if (AppCore.cleanup.scopes instanceof Map && !AppCore.cleanup.scopes.has(name)) AppCore.cleanup.scopes.set(name, { name, disposers: [] });
      return AppCore.cleanup.scopes instanceof Map ? AppCore.cleanup.scopes.get(name) : { name };
    }
  } catch {}

  return { name };
}

export function clearScope(AppCore, scope = DEFAULT_SCOPE) {
  const name = safeText(scope, DEFAULT_SCOPE) || DEFAULT_SCOPE;

  for (const method of ["run", "clear", "dispose"]) {
    try {
      if (isFn(AppCore?.cleanup?.[method])) {
        AppCore.cleanup[method](name);
        return true;
      }
    } catch {}
  }

  try {
    const scopes = AppCore?.cleanup?.scopes;
    if (scopes instanceof Map && scopes.has(name)) {
      const ref = scopes.get(name);
      const disposers = toArray(ref?.disposers);
      while (disposers.length) {
        try { disposers.pop()?.(); } catch {}
      }
      scopes.delete(name);
    }
  } catch {}

  return true;
}

function getRegisteredModule(AppCore, name = "") {
  const key = safeText(name, "");
  if (!key) return null;

  try {
    const value = AppCore?.modules?.get?.(key);
    if (value) return value;
  } catch {}

  try {
    const value = AppCore?.registry?.modules?.get?.(key);
    if (value) return value;
  } catch {}

  try {
    return AppCore?.[key] || AppCore?.modules?.[key] || null;
  } catch {
    return null;
  }
}

export function registerModule(AppCore, name, moduleRef, aliases = []) {
  const moduleName = safeText(name, "");
  if (!AppCore || !moduleName || !moduleRef) return false;

  const names = unique([moduleName, ...toArray(aliases)]);
  let registered = false;

  try {
    if (!AppCore.modules && canExtend(AppCore)) AppCore.modules = {};
  } catch {}

  for (const currentName of names) {
    const current = getRegisteredModule(AppCore, currentName);

    if (current && current !== moduleRef) continue;
    if (current === moduleRef) {
      registered = true;
      continue;
    }

    let ok = false;

    try {
      if (isFn(AppCore.modules?.register)) ok = AppCore.modules.register(currentName, moduleRef, { replace: false, overwrite: false, idempotent: true, source: "app.helpers" }) !== false;
    } catch {}

    try {
      if (!ok && isFn(AppCore.modules?.set) && !getRegisteredModule(AppCore, currentName)) ok = AppCore.modules.set(currentName, moduleRef, { replace: false, overwrite: false, idempotent: true, source: "app.helpers" }) !== false;
    } catch {}

    try {
      if (!ok && canExtend(AppCore.modules) && !AppCore.modules[currentName]) {
        AppCore.modules[currentName] = moduleRef;
        ok = true;
      }
    } catch {}

    try {
      if (!ok && AppCore.registry?.modules && isFn(AppCore.registry.modules.set) && !AppCore.registry.modules.get?.(currentName)) {
        AppCore.registry.modules.set(currentName, moduleRef);
        ok = true;
      }
    } catch {}

    if (canExtend(AppCore) && !AppCore[currentName]) defineHiddenValue(AppCore, currentName, moduleRef);
    registered = registered || ok;
  }

  return registered;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function sanitizeSnapshot(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";
  if (typeof value === "string") return redactTokenInText(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeSnapshot(item, depth + 1, keyHint));

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, SENSITIVE_KEY_RE.test(key) ? (item ? "***" : item) : sanitizeSnapshot(item, depth + 1, key)])
    );
  }

  return String(value);
}

export function getHelpersSnapshot(AppCore, Router = null) {
  const protectedContext = resolveProtectedInitialContext(AppCore);

  return sanitizeSnapshot({
    version: HELPERS_VERSION,
    path: getCurrentPath(AppCore, Router),
    publicPath: getCurrentPublicPath(AppCore, Router),
    canonicalPath: getCurrentCanonicalPath(AppCore, Router),
    browserPath: browserPath(),
    browserHref: browserHref(),
    initialUrl: windowValue(INITIAL_URL_KEY),
    bootContext: windowObject(BOOT_CONTEXT_KEY),
    mainBootContext: windowObject(MAIN_BOOT_CONTEXT_KEY),
    protectedInitial: protectedContext,
    tokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) => ({
      key: config.key,
      path: config.path,
      paths: [...toArray(config.paths)],
      windowKeys: [...toArray(config.windowKeys)],
      scrubbed: isProtectedTokenScrubbed(config),
    })),
    hasCleanup: Boolean(AppCore?.cleanup),
    hasModules: Boolean(AppCore?.modules),
    hasRouter: Boolean(Router),
    at: iso(),
    policy: {
      helpersOnly: true,
      ownAuth: false,
      ownRouter: false,
      ownStorage: false,
      ownFetch: false,
      ownRender: false,
      ownHistory: false,
      ownToast: false,
      importedConstants: false,
    },
  });
}

export default {
  HELPERS_VERSION,

  getCurrentPath,
  getCurrentPublicPath,
  getCurrentCanonicalPath,

  normalizePublicPath,
  normalizeCanonicalPath,
  stripUsernamePrefix,
  stripSearchAndHash,
  getSearchAndHash,

  isSafeInternalPath,
  normalizeInternalPathTarget,

  isActivationPath,
  isResetConfirmPath,
  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,
  resolveProtectedInitialContext,
  captureInitialUrl,

  redactTokenInText,
  escapeHtml,

  ensureScope,
  clearScope,
  registerModule,

  getHelpersSnapshot,

  PROTECTED_PUBLIC_TOKEN_ROUTES,
};
