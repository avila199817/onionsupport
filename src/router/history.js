/* =========================================================
   Onion SPA - Router History
   Archivo: src/router/history.js

   ROUTER HISTORY · SIMPLE
   - historial SPA puro
   - pushState / replaceState / back
   - estado inicial seguro
   - publicPath conserva /@usuario + query/hash
   - canonicalPath limpio
   - scrub explícito de tokens técnicos
   - sin Auth, guards, render, fetch, storage, Toast ni permisos
========================================================= */

import {
  isBrowser,
  normalizePath,
  normalizeCanonicalPath,
  getCurrentPath,
  getCurrentCanonicalPath,
  getCurrentPublicPath,
  getCurrentResolvedUsername,
  buildHistoryUrl,
  buildStatePayload,
  getProtectedInitialPublicPath,
  isProtectedPublicTokenPath,
  redactTokenInText,
  RouterTokenRoutes,
} from "./helpers.js";

export const ROUTER_HISTORY_VERSION = "21.0.0-simple";

const SOURCE = "router.history";
const HISTORY_STATE_VERSION = 8;
const DEFAULT_ROUTE = "/";
const WRITE_DEDUPE_MS = 32;

const ACTIVATION_PATH = RouterTokenRoutes?.ACTIVATION_PATH || "/activate-account";
const RESET_CONFIRM_PATH = RouterTokenRoutes?.RESET_CONFIRM_PATH || "/reset-password/confirm";
const PASSWORD_RESET_CONFIRM_PATH = RouterTokenRoutes?.PASSWORD_RESET_CONFIRM_PATH || "/password-reset/confirm";

const SENSITIVE_PARAM_NAMES = Object.freeze([
  ...new Set([
    ...(RouterTokenRoutes?.ACTIVATION_TOKEN_PARAM_NAMES || ["token", "activationToken", "activateToken", "activation_token", "activate_token", "code", "t"]),
    ...(RouterTokenRoutes?.RESET_TOKEN_PARAM_NAMES || ["token", "resetToken", "passwordResetToken", "confirmToken", "reset_token", "password_reset_token", "confirm_token", "code", "t"]),
    "access_token",
    "refresh_token",
    "id_token",
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
    "authorization",
    "auth",
    "jwt",
    "session",
    "sid",
  ]),
]);

const HISTORY_EVENTS = Object.freeze({
  write: "router:history:write",
  skip: "router:history:skip",
  error: "router:history:error",
  initial: "router:history:initial",
  scrub: "router:history:token:scrubbed",
  back: "router:history:back",
});

let sequence = 0;
let lastWriteSignature = "";
let lastWriteAt = 0;

/* =========================================================
   BASICS
========================================================= */

function canUseHistory() {
  return Boolean(
    isBrowser() &&
      window.history &&
      typeof window.history.pushState === "function" &&
      typeof window.history.replaceState === "function"
  );
}

function nowMs() {
  try { return Date.now(); } catch { return 0; }
}

function isoNow(ms = nowMs()) {
  try { return new Date(ms).toISOString(); } catch { return ""; }
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
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function nextHistoryId() {
  sequence += 1;
  return `hist_${nowMs()}_${sequence}`;
}

/* =========================================================
   URL HELPERS
========================================================= */

function normalizePathname(pathname = DEFAULT_ROUTE) {
  let value = safeText(pathname, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const stack = [];

  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }

  value = `/${stack.join("/")}` || DEFAULT_ROUTE;
  return value.length > 1 ? value.replace(/\/+$/g, "") || DEFAULT_ROUTE : value;
}

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

function splitUrl(value = DEFAULT_ROUTE) {
  const raw = safeText(value, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) return splitUrl(normalizeHashRouterPath(raw));

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
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function joinUrl({ pathname = DEFAULT_ROUTE, search = "", hash = "" } = {}) {
  return `${normalizePathname(pathname)}${normalizeSearch(search)}${normalizeHash(hash)}`;
}

function publicOf(AppCore, path = DEFAULT_ROUTE) {
  try {
    return normalizePath(AppCore, path) || DEFAULT_ROUTE;
  } catch {
    return joinUrl(splitUrl(path));
  }
}

function canonicalOf(AppCore, path = DEFAULT_ROUTE) {
  try {
    return normalizeCanonicalPath(AppCore, path) || DEFAULT_ROUTE;
  } catch {
    return normalizePathname(splitUrl(path).pathname);
  }
}

function browserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const pathname = window.location.pathname || DEFAULT_ROUTE;
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) return publicOf(null, normalizeHashRouterPath(hash));
    return publicOf(null, `${pathname}${search}${hash}`);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function routeKind(AppCore, path = "") {
  const canonical = canonicalOf(AppCore, path);

  if (canonical === ACTIVATION_PATH) return "activation";
  if (canonical === RESET_CONFIRM_PATH || canonical === PASSWORD_RESET_CONFIRM_PATH) return "resetConfirm";

  return "";
}

function normalizePublicUrl(AppCore, path = DEFAULT_ROUTE, options = {}) {
  const opts = safeObject(options);
  const protectedInitial = opts.ignoreProtectedInitialUrl ? "" : getProtectedInitialPublicPath(AppCore);
  const targetKind = routeKind(AppCore, path);
  const protectedKind = routeKind(AppCore, protectedInitial);

  if (protectedInitial && targetKind && protectedKind && targetKind === protectedKind) {
    return publicOf(AppCore, protectedInitial);
  }

  if (opts.preservePath === true) {
    return normalizePublicUrl(AppCore, browserPath(), {
      ignoreProtectedInitialUrl: opts.ignoreProtectedInitialUrl,
    });
  }

  const target = splitUrl(publicOf(AppCore, path));
  const current = splitUrl(browserPath());
  const sameCanonical = canonicalOf(AppCore, target.pathname) === canonicalOf(AppCore, current.pathname);

  return joinUrl({
    pathname: target.pathname,
    search: opts.preserveCurrentContext === true && sameCanonical && !target.search && current.search ? current.search : target.search,
    hash: opts.preserveCurrentContext === true && sameCanonical && !target.hash && current.hash ? current.hash : target.hash,
  });
}

function comparableCurrentUrl(AppCore) {
  return normalizePublicUrl(
    AppCore,
    getProtectedInitialPublicPath(AppCore) || browserPath() || getCurrentPublicPath(AppCore) || getCurrentPath(AppCore) || DEFAULT_ROUTE,
    { ignoreProtectedInitialUrl: true }
  );
}

/* =========================================================
   EVENTS / DEBUG SAFETY
========================================================= */

function sanitize(value, depth = 0, seen = new WeakSet(), keyHint = "") {
  if (depth > 4) return "[depth-limit]";
  if (/token|authorization|password|secret|credential|jwt|bearer|otp|totp|mfa|2fa|code/i.test(keyHint)) return value ? "***" : value;
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    try { return redactTokenInText(value); } catch { return value; }
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactTokenInText(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || value.response?.status || null,
    };
  }

  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1, seen, keyHint));

  if (value && typeof value === "object") {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitize(item, depth + 1, seen, key)])
    );
  }

  return String(value);
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;

  const detail = sanitize({
    source: SOURCE,
    version: ROUTER_HISTORY_VERSION,
    at: isoNow(),
    ...safeObject(payload),
  });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function warn(AppCore, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.warn?.("[RouterHistory]", ...clean);
  } catch {
    try {
      if (AppCore?.config?.debug) console.warn("[RouterHistory]", ...clean);
    } catch {}
  }
}

/* =========================================================
   STATE
========================================================= */

function currentHistoryState() {
  if (!canUseHistory()) return null;
  try { return window.history.state || null; } catch { return null; }
}

function comparableState(state = null) {
  const value = safeObject(state);
  if (!Object.keys(value).length) return null;

  return {
    publicPath: safeText(value.publicPath || value.path, ""),
    canonicalPath: safeText(value.canonicalPath, ""),
    rawCanonicalPath: safeText(value.rawCanonicalPath, ""),
    requestedPath: safeText(value.requestedPath, ""),
    username: safeText(value.username, ""),
    source: safeText(value.source, ""),
    redirectedFrom: safeText(value.redirectedFrom, ""),
    mode: safeText(value.mode, ""),
  };
}

function sameHistoryState(a = null, b = null) {
  const current = comparableState(a);
  const next = comparableState(b);

  if (!current || !next) return false;

  return current.publicPath === next.publicPath &&
    current.canonicalPath === next.canonicalPath &&
    current.rawCanonicalPath === next.rawCanonicalPath &&
    current.requestedPath === next.requestedPath &&
    current.username === next.username &&
    current.redirectedFrom === next.redirectedFrom &&
    current.mode === next.mode;
}

function writeSignature({ method = "", url = "", state = {} } = {}) {
  return [
    safeText(method, ""),
    safeText(url, ""),
    safeText(state?.canonicalPath, ""),
    safeText(state?.rawCanonicalPath, ""),
    safeText(state?.publicPath || state?.path, ""),
    safeText(state?.requestedPath, ""),
    safeText(state?.username, ""),
    safeText(state?.mode, ""),
    safeText(state?.redirectedFrom, ""),
  ].join("|");
}

function resolveHistoryContext(AppCore, pathname = DEFAULT_ROUTE, options = {}) {
  const opts = safeObject(options);

  let rawPublicPath = "";

  try {
    rawPublicPath = opts.publicPath || buildHistoryUrl(AppCore, opts.getRoute, pathname, opts) || pathname || DEFAULT_ROUTE;
  } catch {
    rawPublicPath = opts.publicPath || pathname || DEFAULT_ROUTE;
  }

  const publicPath = normalizePublicUrl(AppCore, rawPublicPath, {
    preserveCurrentContext: opts.preserveCurrentContext === true || opts.preservePublicPath === true || opts.preserveUrl === true,
    preservePath: opts.preservePath === true,
    ignoreProtectedInitialUrl: opts.ignoreProtectedInitialUrl === true || opts.scrubProtectedToken === true,
  });

  const canonicalPath = opts.canonicalPath || canonicalOf(AppCore, publicPath);
  const rawCanonicalPath = opts.rawCanonicalPath || opts.requestedCanonicalPath || canonicalPath;
  const requestedPath = normalizePublicUrl(AppCore, opts.requestedPath || opts.fromPath || pathname || publicPath, {
    ignoreProtectedInitialUrl: opts.ignoreProtectedInitialUrl === true || opts.scrubProtectedToken === true,
  });
  const username = opts.username || opts.resolvedUsername || getCurrentResolvedUsername(AppCore) || null;

  return { publicPath, canonicalPath, rawCanonicalPath, requestedPath, username };
}

export function createHistoryState({ AppCore, pathname = DEFAULT_ROUTE, extras = {} } = {}) {
  const extra = safeObject(extras);
  const publicPath = normalizePublicUrl(AppCore, extra.publicPath || pathname || DEFAULT_ROUTE, {
    ignoreProtectedInitialUrl: extra.scrubProtectedToken === true,
  });

  let base = {};

  try {
    base = buildStatePayload(AppCore, publicPath, { ts: nowMs(), ...extra }) || {};
  } catch {
    base = {};
  }

  const id = extra.id || base.id || nextHistoryId();
  const canonicalPath = extra.canonicalPath || base.canonicalPath || canonicalOf(AppCore, publicPath);
  const rawCanonicalPath = extra.rawCanonicalPath || base.rawCanonicalPath || canonicalPath;
  const requestedPath = extra.requestedPath || base.requestedPath || publicPath;
  const username = extra.username || base.username || getCurrentResolvedUsername(AppCore) || null;

  return {
    ...base,
    ...extra,

    __onionRouterHistory: true,
    version: HISTORY_STATE_VERSION,

    id,
    navId: extra.navId || base.navId || id,

    ts: extra.ts || base.ts || nowMs(),
    at: extra.at || base.at || isoNow(),

    path: publicPath,
    publicPath,
    canonicalPath,
    rawCanonicalPath,
    requestedPath,
    username,

    source: extra.source || base.source || null,
    redirectedFrom: extra.redirectedFrom || base.redirectedFrom || null,
  };
}

function resolvedState({ AppCore, pathname = DEFAULT_ROUTE, options = {}, mode = "push" } = {}) {
  const context = resolveHistoryContext(AppCore, pathname, options);

  const state = createHistoryState({
    AppCore,
    pathname: context.publicPath,
    extras: {
      mode,
      canonicalPath: context.canonicalPath,
      rawCanonicalPath: context.rawCanonicalPath,
      publicPath: context.publicPath,
      requestedPath: context.requestedPath,
      username: context.username,
      redirectedFrom: options.redirectedFrom || null,
      source: options.source || null,
      preservePath: options.preservePath === true,
      preserveCurrentContext: options.preserveCurrentContext === true,
      protectedInitialUrl: options.protectedInitialUrl === true,
      scrubProtectedToken: options.scrubProtectedToken === true,
    },
  });

  return { ...context, state };
}

/* =========================================================
   WRITE
========================================================= */

function shouldSkipWrite(options = {}) {
  if (options.scrubProtectedToken === true) return false;
  return Boolean(options.skipHistory === true || options.protectedInitialUrl === true);
}

function historyWrite(AppCore, method, state, url, meta = {}) {
  if (!canUseHistory()) return false;
  if (method !== "pushState" && method !== "replaceState") return false;

  const cleanUrl = safeText(url, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  try {
    window.history[method](state, "", cleanUrl);

    lastWriteSignature = meta.writeSignature || writeSignature({ method, url: cleanUrl, state });
    lastWriteAt = nowMs();

    emit(AppCore, HISTORY_EVENTS.write, { method, url: cleanUrl, state, meta });
    return true;
  } catch (error) {
    warn(AppCore, `History ${method} falló.`, { url: cleanUrl, error });
    emit(AppCore, HISTORY_EVENTS.error, { method, url: cleanUrl, error, message: error?.message || String(error), meta });
    return false;
  }
}

export function pushState({ AppCore, pathname = DEFAULT_ROUTE, options = {} } = {}) {
  if (!canUseHistory()) return false;

  const opts = safeObject(options);

  if (shouldSkipWrite(opts)) {
    emit(AppCore, HISTORY_EVENTS.skip, { method: "pushState", reason: "skip-history", pathname, options: opts });
    return false;
  }

  const { publicPath, state } = resolvedState({ AppCore, pathname, options: opts, mode: "push" });

  if (sameHistoryState(currentHistoryState(), state) && opts.forceHistory !== true) {
    emit(AppCore, HISTORY_EVENTS.skip, { method: "pushState", reason: "same-state", publicPath, state });
    return false;
  }

  return historyWrite(AppCore, "pushState", state, publicPath, {
    pathname,
    options: opts,
    writeSignature: writeSignature({ method: "pushState", url: publicPath, state }),
  });
}

export function replaceState({ AppCore, pathname = DEFAULT_ROUTE, options = {} } = {}) {
  if (!canUseHistory()) return false;

  const opts = safeObject(options);

  if (shouldSkipWrite(opts)) {
    emit(AppCore, HISTORY_EVENTS.skip, { method: "replaceState", reason: "skip-history", pathname, options: opts });
    return false;
  }

  const { publicPath, state } = resolvedState({ AppCore, pathname, options: opts, mode: "replace" });

  if (sameHistoryState(currentHistoryState(), state) && opts.forceHistory !== true) {
    emit(AppCore, HISTORY_EVENTS.skip, { method: "replaceState", reason: "same-state", publicPath, state });
    return false;
  }

  return historyWrite(AppCore, "replaceState", state, publicPath, {
    pathname,
    options: opts,
    writeSignature: writeSignature({ method: "replaceState", url: publicPath, state }),
  });
}

export function updateHistory({ AppCore, getRoute, pathname = DEFAULT_ROUTE, options = {} } = {}) {
  if (!canUseHistory()) return false;

  const opts = { ...safeObject(options), getRoute };

  if (shouldSkipWrite(opts)) {
    emit(AppCore, HISTORY_EVENTS.skip, { method: "updateHistory", reason: "skip-history", pathname, options: opts });
    return false;
  }

  const context = resolveHistoryContext(AppCore, pathname, opts);
  const method = opts.replaceState === true ? "replaceState" : "pushState";

  const state = createHistoryState({
    AppCore,
    pathname: context.publicPath,
    extras: {
      mode: method === "replaceState" ? "replace" : "push",
      canonicalPath: context.canonicalPath,
      rawCanonicalPath: context.rawCanonicalPath,
      publicPath: context.publicPath,
      requestedPath: context.requestedPath,
      username: context.username,
      redirectedFrom: opts.redirectedFrom || null,
      source: opts.source || null,
    },
  });

  const currentUrl = comparableCurrentUrl(AppCore);
  const signature = writeSignature({ method, url: context.publicPath, state });
  const sameLastWrite = signature === lastWriteSignature && nowMs() - lastWriteAt < WRITE_DEDUPE_MS;

  if (sameHistoryState(currentHistoryState(), state) && opts.forceHistory !== true) {
    emit(AppCore, HISTORY_EVENTS.skip, { method: "updateHistory", reason: "same-state", nextUrl: context.publicPath, currentUrl, state });
    return false;
  }

  if (sameLastWrite && opts.forceHistory !== true) {
    emit(AppCore, HISTORY_EVENTS.skip, { method: "updateHistory", reason: "same-last-write", nextUrl: context.publicPath, currentUrl, state });
    return false;
  }

  return historyWrite(
    AppCore,
    context.publicPath === currentUrl || opts.replaceState === true ? "replaceState" : "pushState",
    state,
    context.publicPath,
    { pathname, options: opts, writeSignature: signature }
  );
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function ensureInitialHistoryState({ AppCore } = {}) {
  if (!canUseHistory()) return false;

  try {
    const currentUrl = getProtectedInitialPublicPath(AppCore) || browserPath() || getCurrentPublicPath(AppCore) || getCurrentPath(AppCore) || DEFAULT_ROUTE;
    const publicPath = normalizePublicUrl(AppCore, currentUrl, { ignoreProtectedInitialUrl: true });
    const canonicalPath = canonicalOf(AppCore, publicPath) || getCurrentCanonicalPath(AppCore) || DEFAULT_ROUTE;

    const state = createHistoryState({
      AppCore,
      pathname: publicPath,
      extras: {
        mode: "initial",
        publicPath,
        requestedPath: publicPath,
        canonicalPath,
        rawCanonicalPath: canonicalPath,
        username: getCurrentResolvedUsername(AppCore) || null,
        source: "initial",
        protectedPublicTokenRoute: isProtectedPublicTokenPath(publicPath),
      },
    });

    const currentState = currentHistoryState();

    if (currentState && Number(currentState.version || 0) >= HISTORY_STATE_VERSION && sameHistoryState(currentState, state)) {
      emit(AppCore, HISTORY_EVENTS.initial, { reason: "existing-valid-state", currentUrl: publicPath, canonicalPath, state: currentState });
      return true;
    }

    const ok = historyWrite(AppCore, "replaceState", state, publicPath, {
      reason: "ensure-initial-history-state",
      writeSignature: writeSignature({ method: "replaceState", url: publicPath, state }),
    });

    emit(AppCore, HISTORY_EVENTS.initial, { ok, currentUrl: publicPath, canonicalPath, state });
    return ok;
  } catch (error) {
    warn(AppCore, "ensureInitialHistoryState falló.", error);
    emit(AppCore, HISTORY_EVENTS.error, { method: "ensureInitialHistoryState", error });
    return false;
  }
}

/* =========================================================
   SCRUB TOKEN URL
========================================================= */

function removeSensitiveSearchParams(search = "") {
  const normalized = normalizeSearch(search);
  if (!normalized) return "";

  try {
    const params = new URLSearchParams(normalized);
    for (const name of SENSITIVE_PARAM_NAMES) params.delete(name);
    const output = params.toString();
    return output ? `?${output}` : "";
  } catch {
    let output = normalized;

    for (const name of SENSITIVE_PARAM_NAMES) {
      try {
        const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        output = output
          .replace(new RegExp(`([?&])${escaped}=[^&#]*&?`, "gi"), "$1")
          .replace(/[?&]$/g, "");
      } catch {}
    }

    return output === "?" ? "" : output;
  }
}

function removeProtectedPathToken(pathname = DEFAULT_ROUTE) {
  const clean = normalizePathname(pathname);
  const segments = clean.split("/").filter(Boolean);

  if (!segments.length) return DEFAULT_ROUTE;

  const hasUsername = /^@[A-Za-z0-9._-]{1,80}$/.test(segments[0] || "");
  const rest = hasUsername ? segments.slice(1) : segments;

  const candidates = [
    { base: ACTIVATION_PATH, output: ACTIVATION_PATH },
    { base: RESET_CONFIRM_PATH, output: RESET_CONFIRM_PATH },
    { base: PASSWORD_RESET_CONFIRM_PATH, output: RESET_CONFIRM_PATH },
  ];

  for (const item of candidates) {
    const baseSegments = item.base.split("/").filter(Boolean);
    const matches = baseSegments.every((part, index) => rest[index] === part);

    if (!matches) continue;

    const tail = rest.slice(baseSegments.length + 1);
    const outputSegments = [...item.output.split("/").filter(Boolean), ...tail];

    return normalizePathname(`/${outputSegments.join("/")}`);
  }

  return clean;
}

export function buildScrubbedProtectedUrl(AppCore, url = "") {
  const original = safeText(url, "") || browserPath() || DEFAULT_ROUTE;
  const parts = splitUrl(original);

  if (parts.hash && isHashRouterPath(parts.hash)) {
    return buildScrubbedProtectedUrl(AppCore, normalizeHashRouterPath(parts.hash));
  }

  let hash = parts.hash;

  if (hash && hash.includes("?")) {
    try {
      const [hashPath, ...queryParts] = hash.split("?");
      const query = queryParts.join("?");
      const cleanQuery = removeSensitiveSearchParams(query ? `?${query}` : "");
      hash = cleanQuery ? `${hashPath}${cleanQuery}` : hashPath;
    } catch {}
  }

  return publicOf(AppCore, joinUrl({
    pathname: removeProtectedPathToken(parts.pathname),
    search: removeSensitiveSearchParams(parts.search),
    hash,
  }));
}

function scrubKind(AppCore, url = "") {
  const canonical = canonicalOf(AppCore, url);

  if (canonical === ACTIVATION_PATH) return "activation";
  if (canonical === RESET_CONFIRM_PATH || canonical === PASSWORD_RESET_CONFIRM_PATH) return "resetConfirm";

  return "";
}

export function scrubProtectedTokenFromHistory({ AppCore, url = "", reason = "protected-token-scrub", replace = true, extraState = {} } = {}) {
  if (!canUseHistory()) return false;

  const currentUrl = safeText(url, "") || browserPath() || comparableCurrentUrl(AppCore) || DEFAULT_ROUTE;
  if (!isProtectedPublicTokenPath(currentUrl)) return false;

  const scrubbedUrl = buildScrubbedProtectedUrl(AppCore, currentUrl);
  const kind = scrubKind(AppCore, scrubbedUrl);

  const flags = kind === "resetConfirm"
    ? {
        scrubbedResetToken: true,
        resetTokenScrubbed: true,
        scrubbedResetPasswordToken: true,
        scrubbedResetConfirmToken: true,
        scrubbedPasswordResetToken: true,
      }
    : {
        scrubbedActivationToken: true,
        activationTokenScrubbed: true,
        scrubbedActivateAccountToken: true,
      };

  const state = createHistoryState({
    AppCore,
    pathname: scrubbedUrl,
    extras: {
      ...safeObject(extraState),
      ...flags,
      mode: "scrub",
      publicPath: scrubbedUrl,
      requestedPath: scrubbedUrl,
      canonicalPath: canonicalOf(AppCore, scrubbedUrl),
      rawCanonicalPath: canonicalOf(AppCore, scrubbedUrl),
      source: reason,
      scrubbedPublicTokenRoute: kind || true,
      scrubbedTokenRoute: kind || true,
      scrubbedProtectedToken: true,
      scrubbedProtectedTokenKind: kind || null,
      scrubbedProtectedTokenAt: isoNow(),
      scrubProtectedToken: true,
    },
  });

  const method = replace ? "replaceState" : "pushState";
  const ok = historyWrite(AppCore, method, state, scrubbedUrl, {
    reason,
    scrubbed: true,
    writeSignature: writeSignature({ method, url: scrubbedUrl, state }),
  });

  if (ok) emit(AppCore, HISTORY_EVENTS.scrub, { reason, from: currentUrl, to: scrubbedUrl, kind, state });

  return ok;
}

/* =========================================================
   NAVIGATION
========================================================= */

export function back(AppCore = null) {
  if (!canUseHistory()) return false;

  try {
    window.history.back();
    emit(AppCore, HISTORY_EVENTS.back, { at: isoNow() });
    return true;
  } catch {
    return false;
  }
}

export function getPopStatePath(AppCore, eventOrState = null) {
  const state = eventOrState?.state || eventOrState || currentHistoryState() || {};
  const fromState = safeText(state.publicPath || state.path || state.requestedPath || "", "");

  if (fromState) return normalizePublicUrl(AppCore, fromState, { ignoreProtectedInitialUrl: true });
  return comparableCurrentUrl(AppCore) || DEFAULT_ROUTE;
}

/* =========================================================
   DEBUG
========================================================= */

export function getHistorySnapshot(AppCore) {
  const currentUrl = comparableCurrentUrl(AppCore);
  const protectedInitialUrl = getProtectedInitialPublicPath(AppCore);

  return sanitize({
    version: ROUTER_HISTORY_VERSION,
    canUseHistory: canUseHistory(),
    historyStateVersion: HISTORY_STATE_VERSION,
    browserPublicUrl: browserPath(),
    currentComparableUrl: currentUrl,
    protectedInitialUrl,
    currentCanonicalPath: canonicalOf(AppCore, currentUrl || DEFAULT_ROUTE),
    currentPublicPath: currentUrl,
    currentAppPublicPath: getCurrentPublicPath(AppCore) || null,
    currentAppCanonicalPath: getCurrentCanonicalPath(AppCore) || null,
    currentAppPath: getCurrentPath(AppCore) || null,
    currentResolvedUsername: getCurrentResolvedUsername(AppCore) || null,
    lastWriteSignature,
    lastWriteAt,
    lastWriteAtIso: lastWriteAt ? isoNow(lastWriteAt) : "",
    sequence,
    state: canUseHistory() ? window.history.state : null,
    policy: {
      ownAuth: false,
      ownGuards: false,
      ownRender: false,
      ownStorage: false,
      ownToast: false,
      historyOnly: true,
    },
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_HISTORY_VERSION,

  createHistoryState,

  pushState,
  replaceState,
  updateHistory,

  ensureInitialHistoryState,

  back,
  getPopStatePath,

  buildScrubbedProtectedUrl,
  scrubProtectedTokenFromHistory,

  getHistorySnapshot,
};
