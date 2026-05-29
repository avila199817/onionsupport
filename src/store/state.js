/* =========================================================
   Onion Support - Store State
   Archivo: /src/store/state.js

   Responsabilidad:
   - Estado inicial mínimo del Store.
   - Compat para imports antiguos.
   - Store NO es dueño de Auth.
   - Store NO es dueño de sesión.
   - Store NO es dueño de Router.
   - Store NO es dueño de HTTP.
   - Nunca guarda token real.
   - Nunca guarda usuario Auth.
   - Nunca guarda sesión Auth.
   - Sólo app/ui/entities/flags/meta.
   - Idioma base: es.
   - Tema gobernado por sistema/preboot, no por Store.
   - Sin rutas técnicas legacy.
   - Sin 2FA/MFA/OTP.
   - Sin recursos inventados.
========================================================= */

import {
  config,
  SENSITIVE_QUERY_PARAMS,
  TOKEN_PARAM,
  canonicalRoutePath as configCanonicalRoutePath,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../core/config.js";

export const STORE_STATE_VERSION = "store.state.v3";

const APP_NAME = config?.appName || config?.name || "Onion Support";
const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const THEME_PREFERENCE = "system";

const ROOT_KEYS = Object.freeze([
  "ui",
  "app",
  "entities",
  "flags",
  "meta",
]);

const ROOT_KEY_SET = new Set(ROOT_KEYS);

const BLOCKED_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const SENSITIVE_KEY_RE =
  /(^auth$|^session$|^sessionData$|^currentUser$|^authUser$|^sessionUser$|^user$|token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|accessToken|access_token|idToken|id_token|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|sessionId|session_id|^_rid$|^_self$|^_etag$|^_attachments$|^_ts$)/i;

const SENSITIVE_QUERY_KEYS = new Set(
  [
    ...(Array.isArray(SENSITIVE_QUERY_PARAMS) ? SENSITIVE_QUERY_PARAMS : []),
    TOKEN_PARAM,
    "token",
  ]
    .map((key) => String(key || "").trim().toLowerCase())
    .filter(Boolean)
);

const SENSITIVE_QUERY_PATTERN = buildSensitiveQueryPattern();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function isBlockedKey(key = "") {
  return BLOCKED_KEYS.has(String(key || "").trim());
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || "").trim());
}

function isAllowedRootKey(key = "") {
  return ROOT_KEY_SET.has(String(key || "").trim());
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function clone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSensitiveQueryPattern() {
  const keys = [...SENSITIVE_QUERY_KEYS]
    .map(escapeRegExp)
    .filter(Boolean)
    .join("|");

  return keys
    ? new RegExp(`([?&#](?:${keys})=)([^&#\\s]+)`, "gi")
    : null;
}

function redact(value = "") {
  const raw = text(value, "");
  const redactedQuery = SENSITIVE_QUERY_PATTERN
    ? raw.replace(SENSITIVE_QUERY_PATTERN, "$1***")
    : raw;

  return redactedQuery
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

/* =========================================================
   ROUTE SNAPSHOT HELPERS
========================================================= */

function routePathFromInput(path = DEFAULT_ROUTE) {
  try {
    return configRoutePathFromUrlLike(path) || DEFAULT_ROUTE;
  } catch {
    return DEFAULT_ROUTE;
  }
}

function normalizeSearch(search = "") {
  const raw = text(search, "");

  if (!raw || raw === "?") return "";

  const normalized = raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;

  try {
    const params = new URLSearchParams(normalized);

    for (const key of [...params.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(String(key).toLowerCase())) {
        params.delete(key);
      }
    }

    const output = params.toString();

    return output ? `?${output}` : "";
  } catch {
    return "";
  }
}

function normalizeHash(hash = "") {
  const raw = text(hash, "");

  if (!raw || raw === "#") return "";

  const normalized = raw.startsWith("#")
    ? raw
    : `#${raw.replace(/^#+/, "")}`;

  const body = normalized.slice(1);

  if (!body || /[\r\n\t\\]/.test(body)) return "";

  const queryIndex = body.indexOf("?");

  if (queryIndex >= 0) {
    const hashPath = body.slice(0, queryIndex).replace(/[?#\\]/g, "");
    const cleanQuery = normalizeSearch(`?${body.slice(queryIndex + 1)}`);

    return cleanQuery ? `#${hashPath}${cleanQuery}` : `#${hashPath}`;
  }

  if (/^[^/?#=&]+=/i.test(body)) {
    const cleanQuery = normalizeSearch(`?${body}`);
    return cleanQuery ? `#${cleanQuery.slice(1)}` : "";
  }

  return redact(normalized);
}

function splitPath(path = DEFAULT_ROUTE) {
  let pathname = routePathFromInput(path);
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
    pathname,
    search,
    hash,
  };
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  try {
    return configNormalizeRoutePath(pathname) || DEFAULT_ROUTE;
  } catch {
    let value = text(pathname, DEFAULT_ROUTE)
      .split("?")[0]
      .split("#")[0]
      .replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
    }

    return value || DEFAULT_ROUTE;
  }
}

function isBlockedPath(path = DEFAULT_ROUTE) {
  try {
    return configIsBlockedRoutePath(path) === true;
  } catch {
    return false;
  }
}

function cleanPath(path = DEFAULT_ROUTE) {
  const pathname = normalizePathname(splitPath(path).pathname);

  return isBlockedPath(pathname) ? DEFAULT_ROUTE : pathname;
}

function canonicalPath(path = DEFAULT_ROUTE) {
  if (isBlockedPath(path)) return DEFAULT_ROUTE;

  try {
    return configCanonicalRoutePath(path) || DEFAULT_ROUTE;
  } catch {
    return cleanPath(path);
  }
}

function publicPath(path = DEFAULT_ROUTE) {
  const parts = splitPath(path);
  const pathname = cleanPath(parts.pathname);
  const output = `${pathname}${normalizeSearch(parts.search)}${normalizeHash(parts.hash)}`;

  return output || DEFAULT_ROUTE;
}

function currentPublicPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  return publicPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

/* =========================================================
   SAFE READS
========================================================= */

function readCoreState(AppCore = null) {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function safeError(error = null) {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      name: "Error",
      message: redact(error),
      code: null,
      status: null,
    };
  }

  const name = text(error?.name, "Error");
  const message = redact(
    error?.message ||
      error?.detail ||
      error?.reason ||
      String(error)
  );

  return {
    name,
    message,
    code: error?.code || error?.error || null,
    status: error?.status || error?.statusCode || error?.response?.status || null,
  };
}

function readRoute(AppCore = null) {
  const state = readCoreState(AppCore);
  const visible = publicPath(state.publicPath || state.route || currentPublicPath());
  const canonical = canonicalPath(state.canonicalPath || state.route || visible);

  return {
    route: canonical,
    canonicalPath: canonical,
    publicPath: visible,
  };
}

function normalizeLang(value = DEFAULT_LANG) {
  const lang = text(value, DEFAULT_LANG).toLowerCase();

  return lang === DEFAULT_LANG ? DEFAULT_LANG : DEFAULT_LANG;
}

function readLang(AppCore = null) {
  const state = readCoreState(AppCore);

  return normalizeLang(
    state.lang ||
      state.language ||
      state.locale ||
      (isBrowser() ? document.documentElement.lang : "") ||
      DEFAULT_LANG
  );
}

function readEffectiveTheme(AppCore = null) {
  const state = readCoreState(AppCore);
  const value = text(
    state.effectiveTheme ||
      state.themeMode ||
      (isBrowser() ? document.documentElement.dataset.theme : ""),
    ""
  ).toLowerCase();

  if (value === "dark" || value === "light") {
    return value;
  }

  if (isBrowser()) {
    try {
      return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
        ? "dark"
        : "light";
    } catch {
      return THEME_PREFERENCE;
    }
  }

  return THEME_PREFERENCE;
}

export function safeTitle() {
  if (!isBrowser()) return APP_NAME;

  return redact(text(document.title, APP_NAME));
}

export function safeTopbarTitle() {
  if (!isBrowser()) return safeTitle();

  return (
    redact(text(document.getElementById("topbar-title")?.textContent, "")) ||
    safeTitle()
  );
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function buildInitialState(AppCore = null) {
  const coreState = readCoreState(AppCore);
  const route = readRoute(AppCore);
  const lang = readLang(AppCore);
  const effectiveTheme = readEffectiveTheme(AppCore);
  const now = nowIso();

  return {
    ui: {
      theme: THEME_PREFERENCE,
      themeMode: effectiveTheme,
      themePreference: THEME_PREFERENCE,
      effectiveTheme,

      lang,
      language: lang,
      locale: lang,

      sidebarOpen: coreState.sidebarOpen !== false,
      shellVisible: coreState.shellVisible !== false,
      chromeVisible: coreState.chromeVisible !== false,

      pageTitle: safeTitle(),
      topbarTitle: safeTopbarTitle(),
    },

    app: {
      ready: Boolean(coreState.ready || coreState.appReady),
      booted: Boolean(coreState.booted || coreState.initialized),
      initialized: Boolean(coreState.initialized),
      booting: Boolean(coreState.booting),
      loading: Boolean(coreState.loading),
      fatal: Boolean(coreState.fatal || coreState.appFatal),

      route: route.route,
      canonicalPath: route.canonicalPath,
      publicPath: route.publicPath,

      lastError: safeError(coreState.lastError || coreState.error || null),
    },

    entities: {},

    flags: {
      hydrating: false,
      hydrated: false,
      syncingCore: false,
      saving: false,
    },

    meta: {
      version: STORE_STATE_VERSION,
      hydrated: false,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      source: "store:state",
    },
  };
}

/* =========================================================
   META
========================================================= */

export function touchMeta(state, extra = {}) {
  if (!isObject(state)) return false;

  if (!isObject(state.meta)) {
    state.meta = {};
  }

  state.meta.version = STORE_STATE_VERSION;
  state.meta.updatedAt = nowIso();
  state.meta.revision = Number(state.meta.revision || 0) + 1;

  if (isObject(extra)) {
    Object.assign(state.meta, clone(extra));
  }

  return true;
}

/* =========================================================
   SNAPSHOTS
========================================================= */

export function shallowCloneRoot(state = {}) {
  const source = isObject(state) ? state : {};

  return {
    ui: clone(source.ui || {}),
    app: clone(source.app || {}),
    entities: clone(source.entities || {}),
    flags: clone(source.flags || {}),
    meta: clone(source.meta || {}),
  };
}

function sanitize(value, key = "", isRoot = false) {
  if (isBlockedKey(key)) return undefined;

  if (isSensitiveKey(key)) {
    return value ? "***" : null;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitize(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      if (isBlockedKey(childKey)) continue;
      if (isRoot && !isAllowedRootKey(childKey)) continue;

      const clean = sanitize(childValue, childKey, false);

      if (clean !== undefined) {
        output[childKey] = clean;
      }
    }

    return output;
  }

  if (typeof value === "string") {
    return redact(value);
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return undefined;
}

export function buildSafeSnapshot(state = {}) {
  return sanitize(shallowCloneRoot(state), "", true) || {};
}

export default {
  STORE_STATE_VERSION,

  safeTitle,
  safeTopbarTitle,

  touchMeta,

  buildInitialState,
  shallowCloneRoot,
  buildSafeSnapshot,
};
